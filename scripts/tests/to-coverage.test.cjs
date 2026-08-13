'use strict';

// Tender Opportunity Expansion v2 — Phase A coverage analysis.
//
// The analysis exists to find gaps. These tests exist to stop it from becoming
// a second, softer source of truth about what a procurement IS.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const V = require('../lib/to-coverage.cjs');
const CORPUS = require('../lib/to-corpus.cjs');
const SCHEMA = require('../lib/to-schema.cjs');
const MATCH = require('../lib/to-match.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const corpus = CORPUS.decode(JSON.parse(read('data/tender-opportunities/opportunities.json')));
const opportunities = corpus.opportunities;
const isCurrent = SCHEMA.isCurrent;
const SRC = read('scripts/lib/to-coverage.cjs');

test('the analysis never writes a sector back onto an opportunity', () => {
  const before = JSON.stringify(opportunities.slice(0, 200));
  V.sectorMatrix(opportunities, { isCurrent });
  V.geographyMatrix(opportunities, { isCurrent });
  V.sourceContribution(opportunities, { isCurrent });
  assert.strictEqual(JSON.stringify(opportunities.slice(0, 200)), before,
    'the coverage analysis mutated canonical records');
  for (const o of opportunities.slice(0, 500)) {
    assert.ok(!('industry' in o), 'an industry field was written onto a canonical record');
    assert.ok(!('sector' in o), 'a sector field was written onto a canonical record');
    // Not asserted: `coverage` — that is a real canonical field (NATIONAL,
    // EU_WIDE and so on) that the corpus has always carried.
  }
});

test('a sector comes from classification codes, never from title text', () => {
  // Keyword classification was rejected: it is how a lift-servicing contract
  // becomes "construction" and a buyer's name becomes evidence.
  const code = SRC.replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/\.title|\bdescription\b|indexOf\(['"]constru/i.test(code),
    'the cohort rule reads free text');
  const noCodes = { classifications: [], title: 'Construction of a school', buyerName: 'X' };
  assert.deepStrictEqual([...V.sectorsOf(noCodes).keys()], [V.UNCLASSIFIED],
    'a title was used to assign a sector');
  const withCode = { classifications: [{ scheme: 'CPV', code: '45000000' }], title: 'x' };
  assert.deepStrictEqual([...V.sectorsOf(withCode).keys()], ['construction']);
});

test('CPV and UNSPSC are read independently and never crosswalked', () => {
  // Strip comments first: the module explains at length that it is NOT a
  // crosswalk, so scanning the prose for the word fails on correct code.
  const body = SRC.replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/cpvToUnspsc|unspscToCpv|crosswalk|equivalentCode/i.test(body),
    'a taxonomy crosswalk was introduced');
  // Both taxonomies map onto the cohort vocabulary; neither maps onto the
  // other. A UNSPSC record never acquires a CPV code and vice versa.
  const u = { classifications: [{ scheme: 'UNSPSC', code: '72101500' }] };
  assert.deepStrictEqual([...V.sectorsOf(u).keys()], ['construction']);
  assert.deepStrictEqual(V.sectorsOf(u).get('construction'), 'UNSPSC_SEGMENT');
  const c = { classifications: [{ scheme: 'CPV', code: '45000000' }] };
  assert.strictEqual(V.sectorsOf(c).get('construction'), 'CPV_DIVISION');
  // Every mapped value is a declared cohort.
  for (const s of [...Object.values(V.CPV_DIVISION), ...Object.values(V.UNSPSC_SEGMENT)]) {
    assert.ok(V.SECTORS.includes(s), `unknown cohort in the mapping: ${s}`);
  }
});

test('an unclassified record is reported as unclassified, not guessed', () => {
  const matrix = V.sectorMatrix(opportunities, { isCurrent });
  const un = matrix.find((r) => r.sector === V.UNCLASSIFIED);
  assert.ok(un.current > 0, 'no unclassified records, so the honesty of the label is untested');
  // It is reported as its own row rather than distributed across real sectors.
  assert.ok(!V.SECTORS.includes(V.UNCLASSIFIED));
});

test('an opportunity may evidence several sectors and is counted in each', () => {
  const multi = { classifications: [
    { scheme: 'CPV', code: '45000000' }, { scheme: 'CPV', code: '72000000' },
  ] };
  const s = [...V.sectorsOf(multi).keys()].sort();
  assert.deepStrictEqual(s, ['construction', 'it-software']);
});

test('coverage status is derived from breadth, not from volume alone', () => {
  // One pipe is not coverage, however many records come down it.
  assert.strictEqual(V.statusFor({ current: 5000, buyers: 3, countries: 1, sources: 1 }), 'WEAK');
  assert.strictEqual(V.statusFor({ current: 500, buyers: 120, countries: 10, sources: 3 }), 'STRONG');
  assert.strictEqual(V.statusFor({ current: 0, buyers: 0, countries: 0, sources: 0 }), 'UNMEASURED');
  // And priority is a category with stated rules, not an opaque score.
  assert.ok(!/score/i.test(SRC.replace(/^\s*\/\/.*$/gm, '')), 'a coverage score was introduced');
  assert.strictEqual(V.priorityFor({ status: 'VERY_WEAK' }), 'PRIORITY_1');
  assert.strictEqual(V.priorityFor({ status: 'WEAK' }), 'PRIORITY_2');
  assert.strictEqual(V.priorityFor({ status: 'ADEQUATE', topSourceShare: 0.9, sources: 4 }), 'PRIORITY_3');
  assert.strictEqual(V.priorityFor({ status: 'STRONG', topSourceShare: 0.2, sources: 5 }), 'SUFFICIENT');
});

test('current and historical are never conflated in source contribution', () => {
  const rows = V.sourceContribution(opportunities, { isCurrent });
  for (const r of rows) {
    assert.strictEqual(r.canonical, r.current + r.historical,
      `${r.sourceId}: current and historical do not partition the records`);
    assert.strictEqual(r.current, r.uniqueCurrent + r.sharedCurrent,
      `${r.sourceId}: unique and shared do not partition current`);
  }
  // An awards-heavy source must not look strong on volume. uk-fts is the real
  // case: most of its records are historical.
  const awardsHeavy = rows.filter((r) => r.historical > r.current);
  assert.ok(awardsHeavy.length > 0, 'no awards-heavy source, so the distinction is untested');
  for (const r of awardsHeavy) {
    assert.ok(r.uniqueCurrent < r.canonical,
      `${r.sourceId}: its headline record count equals its current contribution`);
  }
});

test('unique contribution is computed from the dedup graph, not from titles', () => {
  const code = SRC.replace(/^\s*\/\/.*$/gm, '');
  assert.ok(/occurrences/.test(code), 'contribution does not read source occurrences');
  assert.ok(!/similarity|jaccard|titleMatch/i.test(code), 'contribution infers overlap from text');
  const rows = V.sourceContribution(opportunities, { isCurrent });
  const shared = rows.filter((r) => r.sharedCurrent > 0);
  assert.ok(shared.length > 0, 'no cross-source overlap, so dedup attribution is untested');
});

test('the matrices agree with the corpus they describe', () => {
  const current = opportunities.filter(isCurrent).length;
  const geo = V.geographyMatrix(opportunities, { isCurrent });
  const geoCurrent = geo.reduce((a, r) => a + r.current, 0);
  assert.ok(geoCurrent <= current, 'geography counts exceed the current corpus');
  assert.ok(geoCurrent > current * 0.9, 'most current records should have a geography');
  const sources = V.sourceContribution(opportunities, { isCurrent });
  assert.strictEqual(sources.length, corpus.sources.length,
    'the contribution table and the source registry disagree');
});

test('dependency risk is reported rather than smoothed away', () => {
  const matrix = V.sectorMatrix(opportunities, { isCurrent });
  const risk = V.dependencyRisk(matrix, 'sector');
  assert.ok(risk.length > 0, 'no concentrated sector found, which the corpus contradicts');
  for (const r of risk) {
    assert.ok(['OVER_50', 'OVER_75', 'OVER_90'].includes(r.band));
    assert.ok(r.topSourceShare >= 0.5);
  }
});

test('the analysis reads no network and touches no engine', () => {
  const code = SRC.replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/\bfetch\s*\(|require\('node:https?'|to-http/.test(code));
  assert.ok(!/require\(/.test(code), 'the analysis took on a dependency it could drift with');
  assert.deepStrictEqual(MATCH.WEIGHTS,
    { category: 40, geography: 20, actionability: 15, deadline: 15, confidence: 10 });
});

test('CanadaBuys multi-code cells are parsed, not silently dropped', () => {
  // The real serialization: newline-separated, each entry asterisk-prefixed.
  // Splitting on commas and semicolons alone left the whole cell as one token,
  // which failed the numeric check and vanished. 778 of 921 rows carried a
  // code; every one was lost.
  const CB = require('../lib/to-adapters/canadabuys.cjs');
  const CLASS = require('../lib/to-classification.cjs');
  const src = read('scripts/lib/to-adapters/canadabuys.cjs');
  assert.match(src, /\[,;\\n\\r\]/, 'the code splitter no longer handles newlines');
  assert.match(src, /replace\(\/\^\\\*\+\//, 'the asterisk bullet is no longer stripped');

  const corpusCb = opportunities.filter((o) => o.sourceId === 'canadabuys');
  const classified = corpusCb.filter((o) => (o.classifications || []).length);
  assert.ok(classified.length > 700,
    `only ${classified.length} of ${corpusCb.length} CanadaBuys records carry a classification`);
  // Multi-code cells really do produce several codes.
  assert.ok(classified.some((o) => o.classifications.length > 1),
    'no CanadaBuys record has more than one code, so the split is untested');
  // And the codes are real UNSPSC, normalized.
  for (const o of classified.slice(0, 200)) {
    for (const c of o.classifications) {
      assert.ok(['UNSPSC', 'GSIN'].includes(c.scheme), `unexpected scheme ${c.scheme}`);
      if (c.scheme === 'UNSPSC') assert.match(c.code, /^\d{2,10}$/, `bad UNSPSC ${c.code}`);
      assert.ok(!c.code.includes('*'), 'an asterisk survived into a code');
      assert.ok(!/\s/.test(c.code), 'whitespace survived into a code');
    }
  }
  // GSIN stays GSIN. It is Canada's own taxonomy and is never rewritten.
  const gsin = corpusCb.flatMap((o) => (o.classifications || []).filter((c) => c.scheme === 'GSIN'));
  assert.ok(gsin.length > 0, 'no GSIN codes, so the no-crosswalk guard is untested');
  for (const c of gsin) {
    assert.strictEqual(c.top, null, 'a GSIN code was given a CPV/UNSPSC division');
  }
  // The asterisk is a CanadaBuys serialization artefact and is stripped in the
  // ADAPTER; the classification layer receives a clean code. Asserting the
  // boundary that actually exists rather than the one that would be convenient.
  assert.deepStrictEqual(CLASS.normalizeCodes([['GSIN', 'D304A']]).map((c) => c.scheme), ['GSIN']);
  assert.deepStrictEqual(CLASS.normalizeCodes([['GSIN', '*D304A']]), [],
    'the classification layer silently accepted an unstripped source artefact');
  assert.ok(CB.parseCsv, 'the adapter no longer exposes its parser for testing');
});

test('classification recovery changed content, not canonical identity', () => {
  // 822 source records were rewritten and the canonical count did not move:
  // enrichment must not create, merge or destroy an opportunity.
  assert.strictEqual(opportunities.length, 9577,
    'the canonical opportunity count moved during classification recovery');
  const ids = new Set(opportunities.map((o) => o.id));
  assert.strictEqual(ids.size, opportunities.length, 'a canonical id was duplicated');
});

test('protected layers are unchanged by this phase', () => {
  const fp = (rel) => require('node:crypto').createHash('sha256')
    .update(fs.readFileSync(path.join(ROOT, rel))).digest('hex').slice(0, 8);
  // The corpus fingerprint MOVES in this phase, and that is the point: 822
  // CanadaBuys records gained the classifications their source always
  // published. What must not move is anything that decides meaning.
  assert.strictEqual(fp('data/tenders-procurement/platforms.json'), 'f24a9edc');
  assert.strictEqual(fp('scripts/lib/to-match.cjs'), '5de543fb');
  assert.strictEqual(fp('scripts/lib/to-search.cjs'), 'e11b8246');
  assert.strictEqual(fp('scripts/lib/to-related.cjs'), '001af59b');
});

// ── NATIVE TAXONOMY ARCHITECTURE (B3A) ──────────────────────────────────────
//
// "Not CPV" is not "not classified". These guard the boundary between
// preserving a source's own vocabulary and inventing an equivalence.

const CLASS = require('../lib/to-classification.cjs');

test('five official taxonomies are supported and none is a synonym for another', () => {
  assert.deepStrictEqual(CLASS.SCHEMES, ['CPV', 'UNSPSC', 'GSIN', 'NAICS', 'PSC']);
  const cases = [
    ['NAICS', '541512', '54'], ['NAICS', '54', '54'],
    ['PSC', 'D302', 'D'], ['PSC', '7030', '7'],
    ['CPV', '45000000-7', '45'], ['UNSPSC', 'V1.72101500', '72'], ['GSIN', 'N5895', null],
  ];
  for (const [scheme, raw, top] of cases) {
    const c = CLASS.normalizeCode(scheme, raw);
    assert.ok(c, `${scheme} ${raw} was rejected`);
    assert.strictEqual(c.scheme, scheme, `${raw} changed vocabulary`);
    assert.strictEqual(c.top, top, `${scheme} ${raw} top level wrong`);
  }
  // Format rules are per scheme and actually reject bad codes.
  assert.strictEqual(CLASS.normalizeCode('NAICS', '5415121'), null, 'a 7-digit NAICS was accepted');
  assert.strictEqual(CLASS.normalizeCode('PSC', 'D30'), null, 'a 3-character PSC was accepted');
  assert.strictEqual(CLASS.normalizeCode('NOT_A_SCHEME', '1234'), null);
});

test('no vocabulary borrows another vocabulary label', () => {
  // NAICS 54 and PSC 7 must not pick up the CPV or UNSPSC division wording for
  // the same leading digits. That would be a crosswalk by the back door.
  assert.strictEqual(CLASS.normalizeCode('NAICS', '541512').label, null);
  assert.strictEqual(CLASS.normalizeCode('PSC', '7030').label, null);
  assert.strictEqual(CLASS.normalizeCode('GSIN', 'N5895').label, null);
  // CPV and UNSPSC keep their own, from their own official lists.
  assert.ok(CLASS.normalizeCode('CPV', '45000000').label);
  assert.ok(CLASS.normalizeCode('UNSPSC', '72101500').label);
  assert.notStrictEqual(CLASS.normalizeCode('CPV', '45000000').label,
    CLASS.normalizeCode('UNSPSC', '45000000').label);
});

test('no crosswalk exists anywhere in the classification or coverage layer', () => {
  for (const f of ['scripts/lib/to-classification.cjs', 'scripts/lib/to-coverage.cjs']) {
    const code = read(f).replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/naicsTo|pscTo|toCpv|toUnspsc|crosswalk|equivalent/i.test(code),
      `${f} introduces a taxonomy crosswalk`);
  }
});

test('a natively classified record is not called unclassified', () => {
  const naicsOnly = { classifications: [{ scheme: 'NAICS', code: '541512' }] };
  const nothing = { classifications: [] };
  // The record IS classified; it is simply not mapped to a sector.
  assert.deepStrictEqual([...V.sectorsOf(naicsOnly).keys()], [V.NOT_SECTOR_MAPPED]);
  assert.strictEqual(V.sectorsOf(naicsOnly).get(V.NOT_SECTOR_MAPPED), 'CLASSIFIED_IN_UNMAPPED_SCHEME');
  assert.deepStrictEqual([...V.sectorsOf(nothing).keys()], [V.UNCLASSIFIED]);
  assert.notStrictEqual(V.NOT_SECTOR_MAPPED, V.UNCLASSIFIED);
  // And the coverage metric counts it as classified.
  const cov = V.classificationCoverage([naicsOnly, nothing]);
  assert.strictEqual(cov.anyOfficialClassification, 1);
  assert.strictEqual(cov.noClassification, 1);
  assert.deepStrictEqual(cov.recordsByScheme, { NAICS: 1 });
  assert.deepStrictEqual(cov.sectorMappedSchemes, ['CPV', 'UNSPSC']);
});

test('only CPV and UNSPSC are read into sectors, and that limit is declared', () => {
  assert.deepStrictEqual(V.SECTOR_MAPPED_SCHEMES, ['CPV', 'UNSPSC']);
  for (const scheme of ['NAICS', 'PSC', 'GSIN']) {
    const rec = { classifications: [{ scheme, code: scheme === 'PSC' ? 'D302' : '541512' }] };
    assert.ok(!V.SECTORS.some((s) => V.sectorsOf(rec).has(s)),
      `${scheme} was silently interpreted into a sector cohort`);
  }
});

test('a supported scheme survives the corpus round trip', () => {
  // A scheme that encodes but does not decode is silent loss, which is how
  // publishedEuWide vanished twice.
  const CORPUSLIB = require('../lib/to-corpus.cjs');
  const sample = opportunities[0];
  const withNative = Object.assign({}, sample, {
    classifications: [
      { scheme: 'NAICS', code: '541512', top: '54', label: null },
      { scheme: 'PSC', code: 'D302', top: 'D', label: null },
      { scheme: 'CPV', code: '45000000', top: '45', label: 'Construction work' },
    ],
  });
  const round = CORPUSLIB.decodeRow(CORPUSLIB.encodeRow(withNative));
  const schemes = (round.classifications || []).map((c) => c.scheme).sort();
  assert.deepStrictEqual(schemes, ['CPV', 'NAICS', 'PSC'],
    'a classification scheme was lost in the columnar round trip');
  const naics = round.classifications.find((c) => c.scheme === 'NAICS');
  assert.strictEqual(naics.code, '541512', 'the NAICS code changed on rehydration');
});
