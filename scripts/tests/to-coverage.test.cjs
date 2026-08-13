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

test('protected layers are unchanged by this phase', () => {
  const fp = (rel) => require('node:crypto').createHash('sha256')
    .update(fs.readFileSync(path.join(ROOT, rel))).digest('hex').slice(0, 8);
  assert.strictEqual(fp('data/tender-opportunities/opportunities.json'), 'cca4f5af');
  assert.strictEqual(fp('data/tenders-procurement/platforms.json'), 'f24a9edc');
  assert.strictEqual(fp('scripts/lib/to-match.cjs'), '5de543fb');
  assert.strictEqual(fp('scripts/lib/to-search.cjs'), 'e11b8246');
  assert.strictEqual(fp('scripts/lib/to-related.cjs'), '001af59b');
});
