'use strict';

// Tender Discovery Relevance v1.1 — retrieval families and result diversity.
//
// This layer is allowed to change the ORDER results appear in and to group
// some of them visually. It is not allowed to change what a procurement is,
// how many there are, or which one is more relevant. Nearly every test here
// is about that boundary.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const S = require('../lib/to-search.cjs');
const REL = require('../lib/to-related.cjs');
const INDEX = require('../lib/to-index.cjs');
const MATCH = require('../lib/to-match.cjs');
const CORPUS = require('../lib/to-corpus.cjs');
const I18N = require('../lib/i18n.cjs');
const BUILD = require('../build-tender-opportunities.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const INDEX_REL = 'research/tenders-procurement/opportunities/tender-index.json';

const corpus = CORPUS.decode(JSON.parse(read('data/tender-opportunities/opportunities.json')));
const published = JSON.parse(read(INDEX_REL));
const idx = S.hydrate(JSON.parse(read(INDEX_REL)));
const CLIENT = read('js/tender-discovery.js');
const REL_SRC = read('scripts/lib/to-related.cjs');
const pageOf = (locale) => read(I18N.localizedFile(locale, BUILD.CANONICAL_PATH));

// Families as published, and as recomputed.
const familyOf = new Map();
const familyMembers = new Map();
for (const r of idx.records) {
  if (!r.f) continue;
  familyOf.set(r.i, r.f);
  if (!familyMembers.has(r.f)) familyMembers.set(r.f, []);
  familyMembers.get(r.f).push(r);
}

function everything(params) {
  const first = S.search(idx, params);
  const rows = [];
  for (let p = 1; p <= first.pages; p += 1) {
    rows.push(...S.search(idx, Object.assign({}, params, { page: p })).results);
  }
  return rows;
}

const withDiversity = (rows, enabled = true) => REL.diversify(rows, { enabled, familyOf });

const rec = (over) => Object.assign({
  i: 'x:1', ti: 'Roof works package', t: 'roof works package', bu: 'City of Example',
  b: 'city of example', co: 'germany', pc: null, sr: 'ted', sc: 'CPV', cd: '45000000',
  s: 'OPEN', dl: 30, _r: 10,
}, over);

// ═══ 1–5  CANONICAL FACTS ARE UNTOUCHED ═════════════════════════════════════

test('1. the canonical corpus is unchanged by this phase', () => {
  const fp = (rel) => require('node:crypto').createHash('sha256')
    .update(fs.readFileSync(path.join(ROOT, rel))).digest('hex').slice(0, 8);
  // PIN MOVED 9754062f -> 3c341d60 by Expansion v2: SAM.gov activation, plus
  // the recency fix in to-dedupe.cjs. The RELEVANCE layer still changed
  // nothing, which is what this test exists to prove — to-search.cjs and
  // to-related.cjs are pinned unchanged below.
  assert.strictEqual(fp('data/tender-opportunities/opportunities.json'), '3c341d60');
  // Re-baselined 2026-08-19. The ONLY change is `bidAccess` on 11 records —
  // 384 records in and 384 out, one field touched, nothing added or lost. What
  // it costs a supplier to PARTICIPATE is a new fact, established from operator
  // wording, and deliberately independent of `searchAccess`: three of these
  // platforms publish every notice openly and charge to bid.
  assert.strictEqual(fp('data/tenders-procurement/platforms.json'), '810122a9');
  assert.strictEqual(fp('scripts/lib/to-match.cjs'), '5de543fb');
});

test('2. every canonical id survives into the index exactly once', () => {
  const ids = published.records.map((r) => r.i);
  assert.strictEqual(new Set(ids).size, ids.length, 'a canonical id appears twice');
  const canonical = new Set(corpus.opportunities.map((o) => o.id));
  for (const id of ids) assert.ok(canonical.has(id), `${id} is not a canonical opportunity`);
});

test('3. a family never merges canonical records', () => {
  // The family is metadata ON records; it never replaces them.
  for (const [fid, members] of familyMembers) {
    assert.ok(members.length > 1, `${fid} is a family of one`);
    for (const m of members) {
      assert.ok(m.i, 'a family member lost its canonical id');
      assert.notStrictEqual(m.i, fid, 'a canonical id was replaced by a family id');
    }
  }
  // Every member is still individually searchable and countable.
  const all = new Set(idx.records.map((r) => r.i));
  for (const [, members] of familyMembers) {
    for (const m of members) assert.ok(all.has(m.i), `${m.i} vanished from the result universe`);
  }
});

test('4. supplier profiles and match weights are unchanged', () => {
  assert.deepStrictEqual(MATCH.WEIGHTS,
    { category: 40, geography: 20, actionability: 15, deadline: 15, confidence: 10 });
  assert.strictEqual(Object.keys(MATCH.PROFILES).length, 16);
  // And this layer never reads or writes a match band.
  const code = REL_SRC.replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/STRONG|GOOD|matchBand|\.m\b/.test(code),
    'the relevance layer touches supplier-match data');
});

test('5. a multi-source canonical opportunity is one result, not a family', () => {
  const multi = idx.records.filter((r) => r.ms);
  assert.ok(multi.length > 0);
  for (const r of multi) {
    // Its occurrences are inside the one record; they are never members.
    if (!r.f) continue;
    const members = familyMembers.get(r.f);
    assert.ok(!members.some((m) => m.i !== r.i && m.i.split(':')[1] === r.i.split(':')[1]),
      `${r.i}: a source occurrence became a family member`);
  }
});

// ═══ 6–13  GROUPING PRECISION ═══════════════════════════════════════════════

test('6. the same buyer alone does not create a family', () => {
  const a = rec({ i: 'a', ti: 'Supply of office furniture', t: 'supply of office furniture' });
  const b = rec({ i: 'b', ti: 'Demolition of a bridge', t: 'demolition of a bridge' });
  const { families } = REL.detectFamilies([a, b]);
  assert.deepStrictEqual(families, [], 'one buyer was enough to group two unrelated procurements');
});

test('7. a similar title alone does not create a family', () => {
  const a = rec({ i: 'a', bu: 'City A', b: 'city a' });
  const b = rec({ i: 'b', bu: 'City B', b: 'city b' });
  const { families } = REL.detectFamilies([a, b]);
  assert.deepStrictEqual(families, [], 'an identical title grouped two different buyers');
});

test('8. lookalikes in different countries are never grouped', () => {
  const a = rec({ i: 'a', co: 'germany' });
  const b = rec({ i: 'b', co: 'france' });
  const { families } = REL.detectFamilies([a, b]);
  assert.deepStrictEqual(families, [], 'identical titles were grouped across two countries');
  assert.strictEqual(REL.isRelated(a, b, new Set()).related, false);
});

test('9. distinct lots are never grouped', () => {
  for (const [x, y] of [['Lot 6', 'Lot 8'], ['Lote 1', 'Lote 2'], ['Paquete 3', 'Paquete 4']]) {
    const a = rec({ i: 'a', ti: `Renovation works - ${x}`, t: `renovation works ${x.toLowerCase()}` });
    const b = rec({ i: 'b', ti: `Renovation works - ${y}`, t: `renovation works ${y.toLowerCase()}` });
    const { families } = REL.detectFamilies([a, b]);
    assert.deepStrictEqual(families, [], `${x} was grouped with ${y}`);
  }
  // The same lot on both sides is not itself an obstacle.
  assert.notStrictEqual(REL.lotSignature('Works - Lot 6'), REL.lotSignature('Works - Lot 8'));
  assert.strictEqual(REL.lotSignature('Works - Lot 6'), REL.lotSignature('Other - Lot 6'));
});

test('10. an incidental number is not read as a lot number', () => {
  // "17 Wing" and "Area 3" are places, not lots. Treating every number as a
  // lot marker would block legitimate grouping; treating none as one would
  // merge Lot 6 into Lot 8.
  assert.strictEqual(REL.lotSignature('Open Construction Source List for 17 Wing Winnipeg'), '');
  assert.strictEqual(REL.lotSignature('Århusjordet residential area - Area 3'), '');
  assert.strictEqual(REL.lotSignature('Rénovation - Lot 1 - Démolition'), '1');
});

test('11. buyer boilerplate cannot carry a family on its own', () => {
  // The real defect: FONDO DE DESARROLLO's shared preamble grouped a
  // defibrillator with a datalogger.
  const mk = (i, tail) => rec({
    i, bu: 'FONDO', b: 'fondo',
    ti: `COTIZAR LA ADQUISICION DE ${tail} PARA EL FONDO DE DESARROLLO LOCAL`,
    t: `cotizar la adquisicion de ${tail.toLowerCase()} para el fondo de desarrollo local`,
  });
  const group = [mk('a', 'UN DESFIBRILADOR'), mk('b', 'DATALOGGER TERMOHIGOMETRO'),
    mk('c', 'ELEMENTOS PUBLICITARIOS'), mk('d', 'SERVICIOS LOGISTICOS'),
    mk('e', 'MOTOCICLETAS'), mk('f', 'ALIMENTOS')];
  const { families } = REL.detectFamilies(group);
  for (const f of families) {
    assert.ok(false, `boilerplate grouped unrelated procurements: ${f.memberIds.join(', ')}`);
  }
});

test('12. a family never chains two records that were rejected as unrelated', () => {
  // Union-find joined A to B through C even after A and B had been compared
  // and refused. Star clustering makes "related to the seed" true of everyone.
  const { families } = REL.detectFamilies(idx.records);
  const byId = new Map(idx.records.map((r) => [r.i, r]));
  for (const f of families) {
    const seed = byId.get(f.seedId);
    const group = idx.records.filter((r) => REL.blockKey(r) === REL.blockKey(seed));
    const boiler = REL.boilerplateOf(group);
    for (const id of f.memberIds) {
      if (id === f.seedId) continue;
      assert.ok(REL.isRelated(seed, byId.get(id), boiler).related,
        `${id} is in ${f.familyId} without matching its seed`);
    }
  }
});

test('13. classification schemes must agree', () => {
  const a = rec({ i: 'a', sc: 'CPV' });
  const b = rec({ i: 'b', sc: 'UNSPSC' });
  assert.strictEqual(REL.isRelated(a, b, new Set()).related, false);
});

// ═══ 14–17  DETERMINISM ═════════════════════════════════════════════════════

test('14. family detection is deterministic and order-independent', () => {
  const a = REL.detectFamilies(idx.records).families;
  const b = REL.detectFamilies(idx.records.slice().reverse()).families;
  const norm = (fs_) => fs_.map((f) => `${f.familyId}:${f.memberIds.slice().sort().join(',')}`).sort();
  assert.deepStrictEqual(norm(a), norm(b), 'families depend on record order');
  assert.deepStrictEqual(norm(a), norm(REL.detectFamilies(idx.records).families));
});

test('15. family ids are derived from canonical ids, never generated', () => {
  const code = REL_SRC.replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/Math\.random|Date\.now|randomUUID|new Date/.test(code),
    'family identity depends on the clock or on randomness');
  for (const [fid, members] of familyMembers) {
    assert.match(fid, /^fam_/);
    assert.ok(members.some((m) => `fam_${m.i}` === fid), `${fid} is not derived from a member id`);
  }
});

test('16. diversity is deterministic and order-stable', () => {
  const rows = everything({ q: 'construction' });
  const a = withDiversity(rows).map((r) => r.i);
  const b = withDiversity(rows).map((r) => r.i);
  assert.deepStrictEqual(a, b, 'two runs disagree');
  const code = REL_SRC.replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/Math\.random|Date\.now|shuffle/.test(code), 'the reranker is not deterministic');
});

test('17. the published index matches a fresh build', () => {
  assert.strictEqual(read(INDEX_REL), INDEX.serialize(INDEX.build(corpus, {
    platformsById: new Map(require('../lib/tp-schema.cjs').loadPlatforms(
      path.join(ROOT, 'data/tenders-procurement/platforms.json'),
      new Map(JSON.parse(read('data/business-directories/countries.json')).map((c) => [c.slug, c.iso2 || null])),
    ).map((p) => [p.id, p])),
  })), 'the committed index is not what the build produces');
});

// ═══ 18–24  DIVERSITY SAFETY ════════════════════════════════════════════════

test('18. diversity never adds, removes or duplicates a result', () => {
  for (const q of ['construction', 'telecom', 'software', 'work', 'office']) {
    const rows = everything({ q });
    const after = withDiversity(rows);
    assert.strictEqual(after.length, rows.length, `${q}: result count changed`);
    assert.deepStrictEqual(after.map((r) => r.i).sort(), rows.map((r) => r.i).sort(),
      `${q}: the result set changed`);
  }
});

test('19. diversity never moves a result past one with a different score', () => {
  // The whole safety argument: reordering only ever happens inside a run of
  // identical relevance, so nothing less relevant can overtake anything.
  for (const q of ['construction', 'telecom', 'desarrollo', 'work']) {
    const rows = everything({ q });
    const after = withDiversity(rows);
    for (let i = 0; i < rows.length; i += 1) {
      assert.strictEqual(after[i]._r, rows[i]._r,
        `${q}: position ${i} changed relevance score, so a weaker result was promoted`);
    }
  }
});

test('20. the relevance score itself is never mutated', () => {
  const rows = everything({ q: 'construction' });
  const before = rows.map((r) => r._r);
  withDiversity(rows);
  assert.deepStrictEqual(rows.map((r) => r._r), before, 'the reranker wrote to the relevance score');
  const code = REL_SRC.replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/_r\s*=[^=]/.test(code), 'the relevance layer assigns to _r');
});

test('21. an explicit sort is never quietly reordered', () => {
  for (const sort of ['deadline', 'published', 'value']) {
    const act = REL.diversityApplies({ sort, query: S.parseQuery('construction'), results: [], filters: {} });
    assert.strictEqual(act.enabled, false, `${sort} was diversified`);
    assert.strictEqual(act.reason, 'EXPLICIT_SORT');
  }
});

test('22. the default no-query view keeps its deadline ordering', () => {
  // With no query everything scores 0, so the entire result set is one tie and
  // spreading moved records up to 6,543 places, destroying the deadline order
  // the default view exists to show.
  const act = REL.diversityApplies({ sort: 'relevance', query: S.parseQuery(''), results: [], filters: {} });
  assert.strictEqual(act.enabled, false);
  assert.strictEqual(act.reason, 'NO_QUERY_DEADLINE_ORDER');
  const rows = everything({});
  assert.deepStrictEqual(withDiversity(rows, false).map((r) => r.i), rows.map((r) => r.i));
});

test('23. naming a buyer switches diversity off; sharing one word does not', () => {
  const rows = everything({ q: 'construction' });
  const generic = REL.diversityApplies({
    sort: 'relevance', query: S.parseQuery('construction'), results: rows, filters: {},
  });
  assert.strictEqual(generic.enabled, true,
    'one generic word that appears in a buyer name disabled diversity');
  const named = REL.diversityApplies({
    sort: 'relevance', query: S.parseQuery('Defence Construction Canada'), results: rows, filters: {},
  });
  assert.strictEqual(named.enabled, false, 'naming a buyer did not relax diversity');
  assert.strictEqual(named.reason, 'BUYER_INTENT');
  // A quoted phrase is exact intent too.
  assert.strictEqual(REL.diversityApplies({
    sort: 'relevance', query: S.parseQuery('"roof works"'), results: rows, filters: {},
  }).enabled, false);
});

test('24. a source filter switches diversity off', () => {
  assert.strictEqual(REL.diversityApplies({
    sort: 'relevance', query: S.parseQuery('construction'), results: [], filters: { source: 'ted' },
  }).reason, 'SOURCE_FILTER');
});

// ═══ 25–29  PAGINATION AND THE PIPELINE ═════════════════════════════════════

test('25. reranking happens before pagination, so pages never overlap or gap', () => {
  const params = {
    q: 'construction',
    rerank: (rows) => REL.diversify(rows, { enabled: true, familyOf }),
  };
  const first = S.search(idx, params);
  const seen = [];
  for (let p = 1; p <= first.pages; p += 1) {
    seen.push(...S.search(idx, Object.assign({}, params, { page: p })).results.map((r) => r.i));
  }
  assert.strictEqual(seen.length, first.total, 'pages do not cover the result set');
  assert.strictEqual(new Set(seen).size, first.total, 'a record appeared on two pages');
  // And it reconstructs exactly the undiversified universe.
  assert.deepStrictEqual(seen.slice().sort(), everything({ q: 'construction' }).map((r) => r.i).sort());
});

test('26. a rerank that changes the record count is refused', () => {
  const dropped = S.search(idx, { q: 'construction', rerank: (rows) => rows.slice(1) });
  const plain = S.search(idx, { q: 'construction' });
  assert.strictEqual(dropped.total, plain.total, 'a reranker was allowed to drop a result');
  assert.deepStrictEqual(dropped.results.map((r) => r.i), plain.results.map((r) => r.i));
});

test('27. the engine applies the rerank between sorting and slicing', () => {
  const src = read('scripts/lib/to-search.cjs');
  const sortAt = src.indexOf('out.sort(comparator');
  const rerankAt = src.indexOf('p.rerank');
  const sliceAt = src.indexOf('out.slice(start');
  assert.ok(sortAt > 0 && rerankAt > sortAt && sliceAt > rerankAt,
    'reranking does not sit between the sort and the page slice');
});

test('28. paging is over canonical opportunities, not over groups', () => {
  // A family is shown inside one result card, but the total the page reports
  // is still the number of opportunities.
  const params = { q: 'construction', rerank: (rows) => REL.diversify(rows, { enabled: true, familyOf }) };
  assert.strictEqual(S.search(idx, params).total, everything({ q: 'construction' }).length);
});

test('29. every family member is reachable through ordinary search', () => {
  let checked = 0;
  for (const [, members] of familyMembers) {
    for (const m of members) {
      const hit = S.search(idx, { q: `"${m.t.split(' ').slice(0, 4).join(' ')}"` });
      assert.ok(hit.total >= 1, `${m.i} is not findable`);
      checked += 1;
      if (checked > 60) return;
    }
  }
});

// ═══ 30–34  DISCOVERY V1 INVARIANTS STILL HOLD ══════════════════════════════

test('30. awarded, cancelled and closed are still absent', () => {
  const inIndex = new Set(idx.records.map((r) => r.i));
  for (const o of corpus.opportunities) {
    if (['AWARDED', 'CANCELLED', 'CLOSED', 'UNKNOWN'].includes(o.status)) {
      assert.ok(!inIndex.has(o.id), `${o.status} ${o.id} reached Discovery`);
    }
  }
});

test('31. an expired notice is not promoted for variety', () => {
  const rows = everything({ q: 'construction' });
  const after = withDiversity(rows);
  // Within any equal-score run diversity may reorder, but an expired record
  // must not end up ahead of a live one at a HIGHER score.
  for (let i = 1; i < after.length; i += 1) {
    if (after[i]._r > after[i - 1]._r) assert.fail('scores are not non-increasing after diversity');
  }
  const firstExpired = after.findIndex((r) => r.dl != null && r.dl < 0);
  if (firstExpired > 0) {
    assert.strictEqual(after[firstExpired]._r <= after[0]._r, true);
  }
});

test('32. exact code relevance still beats broad text', () => {
  const rec2 = idx.records.find((r) => r.cd && r.sc === 'CPV');
  const code = rec2.cd.split(' ')[0];
  const rows = withDiversity(everything({ q: code }));
  assert.ok(rows.length > 0);
  assert.ok((rows[0].cd || '').includes(code), 'the top hit does not carry the code searched for');
});

test('33. no industry or canonical fact is invented by this layer', () => {
  for (const r of published.records) {
    assert.ok(!('industry' in r), 'an industry field appeared');
    assert.deepStrictEqual(INDEX.unknownFields(r), [], 'an undeclared field appeared');
  }
});

test('34. hostile keys cannot corrupt family lookup', () => {
  // Maps, not objects: a family id must never be able to reach Object.prototype.
  assert.ok(familyOf instanceof Map);
  for (const bad of ['__proto__', 'constructor', 'toString', 'valueOf']) {
    assert.strictEqual(familyOf.get(bad), undefined, `${bad} resolved to a family`);
    assert.strictEqual(familyMembers.get(bad), undefined);
  }
  const code = REL_SRC.replace(/^\s*\/\/.*$/gm, '');
  assert.ok(/new Map\(/.test(code), 'the layer does not use Maps for lookups');
  // And a record whose id is a prototype key does not break spreading.
  const weird = [rec({ i: '__proto__', _r: 5 }), rec({ i: 'constructor', _r: 5 }), rec({ i: 'ok', _r: 5 })];
  assert.strictEqual(REL.diversify(weird, { enabled: true, familyOf: new Map() }).length, 3);
});

// ═══ 35–40  PRODUCT SURFACE ═════════════════════════════════════════════════

test('35. the page never calls related opportunities duplicates', () => {
  for (const locale of I18N.LOCALE_CODES) {
    const html = pageOf(locale);
    // The LABEL must never call them duplicates. The explanatory copy is
    // allowed to use the word, because its whole job is to deny it — scanning
    // prose for a word it exists to negate is a test that fails on correct
    // copy.
    assert.ok(!/duplicat|Duplikat|doublon/i.test(I18N.raw(locale, 'tds.relatedCount')),
      `${locale}: the group label calls distinct opportunities duplicates`);
    assert.match(I18N.raw(locale, 'tds.relatedNote'),
      /not duplicates|keine Duplikate|no son duplicados|pas des doublons/i,
      `${locale}: the note does not say these are not duplicates`);
    assert.ok(/merged|removed|zusammengeführt|entfernt|fusiona|elimina|fusionné|supprimé/i
      .test(I18N.raw(locale, 'tds.methodRelated')),
    `${locale}: the methodology does not state that nothing is merged or removed`);
    assert.ok(html.includes(esc(I18N.t(locale, 'tds.methodRelated'))),
      `${locale}: grouping is not explained`);
    assert.ok(html.includes(esc(I18N.t(locale, 'tds.methodDiversity'))),
      `${locale}: result ordering is not explained`);
  }
});

test('36. the related-opportunity UI is localized in all four locales', () => {
  assert.deepStrictEqual(I18N.missingKeys(), {});
  const keys = ['tds.relatedCount', 'tds.relatedNote', 'tds.methodRelated', 'tds.methodDiversity'];
  for (const k of keys) {
    const en = I18N.raw('en', k);
    for (const locale of ['de', 'es', 'fr']) {
      const v = I18N.raw(locale, k);
      assert.ok(v && v.trim(), `${locale}: ${k} empty`);
      if (en.length > 60) assert.notStrictEqual(v, en, `${locale}: ${k} is still English`);
      assert.deepStrictEqual((v.match(/\{[a-z]+\}/gi) || []).sort(),
        (en.match(/\{[a-z]+\}/gi) || []).sort(), `${locale}: ${k} lost a placeholder`);
    }
  }
});

test('37. the family disclosure is a native, keyboard-operable element', () => {
  assert.ok(/createElement\('details'\)/.test(CLIENT), 'related opportunities are not a <details>');
  assert.ok(/createElement\('summary'\)/.test(CLIENT), 'the disclosure has no summary');
  assert.ok(!/aria-expanded/.test(CLIENT), 'hand-rolled ARIA duplicates what <details> already does');
  // Members render their own facts rather than inheriting the representative's.
  assert.ok(/deadlineLabel\(o\)/.test(CLIENT), 'family members inherit the representative deadline');
});

test('38. the client reuses the shared implementation and adds no second one', () => {
  assert.strictEqual(read('js/tender-related.js'), REL_SRC,
    'js/tender-related.js has drifted from scripts/lib/to-related.cjs');
  assert.strictEqual(read('js/tender-search.js'), read('scripts/lib/to-search.cjs'));
  const glue = CLIENT.replace(/^\s*\/\/.*$/gm, '');
  assert.ok(/TenderRelated\.diversify/.test(glue), 'the client does not use the shared reranker');
  assert.ok(/TenderRelated\.diversityApplies/.test(glue), 'the client decides activation itself');
  for (const forbidden of ['jaccard', 'detectFamilies', 'isRelated', 'boilerplateOf']) {
    assert.ok(!new RegExp(`function\\s+${forbidden}`).test(glue), `the client reimplements ${forbidden}`);
  }
});

test('39. no new indexable route or sitemap entry was created', () => {
  const sitemap = read('sitemap.xml');
  assert.ok(!/family|fam_|related|buyers\//i.test(sitemap), 'a family route entered the sitemap');
  assert.ok(!/<loc>[^<]*\?[^<]*<\/loc>/.test(sitemap), 'a parameterised URL entered the sitemap');
  const occurrences = (sitemap.match(/research\/tenders-procurement\/opportunities\//g) || []).length;
  assert.strictEqual(occurrences, I18N.LOCALE_CODES.length);
  const dir = path.join(ROOT, 'research', 'tenders-procurement', 'opportunities');
  const files = fs.readdirSync(dir).filter((f) => !fs.statSync(path.join(dir, f)).isDirectory());
  assert.deepStrictEqual(files.sort(), ['index.html', 'opportunities.csv', 'tender-index.json']);
  // Detail pages are a separate authorized family; this phase added no route.
  assert.ok(!read('sitemap-tender-opportunities.xml').includes('fam_'),
    'a retrieval family became a route');
  // Diversity leaves no trace in the URL: no seed, no toggle.
  for (const p of S.PARAM_ORDER) {
    assert.ok(!/seed|diversity|random/i.test(p), `an unstable parameter was added: ${p}`);
  }
});

test('40. the build reaches no network for similarity', () => {
  for (const f of ['scripts/lib/to-related.cjs', 'scripts/lib/to-index.cjs']) {
    const src = read(f).replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/\bfetch\s*\(|require\('node:https?'|XMLHttpRequest|embedding|openai|api\./i.test(src),
      `${f} reaches the network or an external model`);
  }
});

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ═══ MUTATION SUITE ═════════════════════════════════════════════════════════

const applied = [];
function mutate(name, fn) {
  test(`MUTATION: ${name}`, () => { applied.push(name); fn(); });
}

mutate('M1 same title across countries grouped', () => {
  const a = rec({ i: 'a', co: 'germany' });
  const b = rec({ i: 'b', co: 'france' });
  assert.strictEqual(REL.isRelated(a, b, new Set()).related, false);
  const sameCountry = REL.isRelated(a, rec({ i: 'c', co: 'germany' }), new Set());
  assert.strictEqual(sameCountry.related, true, 'the mutation is a no-op: nothing groups at all');
});

mutate('M2 same buyer alone groups', () => {
  const a = rec({ i: 'a', ti: 'Office furniture', t: 'office furniture' });
  const b = rec({ i: 'b', ti: 'Bridge demolition', t: 'bridge demolition' });
  assert.strictEqual(REL.jaccard(REL.tokens(a.t), REL.tokens(b.t)) >= REL.TITLE_SIMILARITY, false);
  assert.deepStrictEqual(REL.detectFamilies([a, b]).families, []);
});

mutate('M3 different lot numbers collapse', () => {
  const a = rec({ i: 'a', ti: 'Works Lot 6', t: 'works lot 6' });
  const b = rec({ i: 'b', ti: 'Works Lot 8', t: 'works lot 8' });
  assert.notStrictEqual(REL.lotSignature(a.ti), REL.lotSignature(b.ti));
  assert.deepStrictEqual(REL.detectFamilies([a, b]).families, []);
});

mutate('M4 numbers stripped from titles, merging Lot 6 and Lot 8', () => {
  const stripped = (t) => t.replace(/\d+/g, '');
  assert.strictEqual(stripped('works lot 6'), stripped('works lot 8'));
  assert.notStrictEqual(REL.lotSignature('works lot 6'), REL.lotSignature('works lot 8'),
    'the lot signature ignores the number');
});

mutate('M5 canonical id replaced by family id', () => {
  for (const [fid, members] of familyMembers) {
    for (const m of members) assert.notStrictEqual(m.i, fid);
  }
  assert.ok(familyMembers.size > 0, 'no families exist, so the mutation is a no-op');
});

mutate('M6 a family member removed from the universe', () => {
  const rows = everything({ q: 'construction' });
  const after = withDiversity(rows);
  const mutated = after.slice(0, -1);
  assert.notStrictEqual(mutated.length, rows.length, 'the mutation removed nothing');
  assert.strictEqual(after.length, rows.length);
});

mutate('M7 grouping reduces the reported opportunity count', () => {
  const params = { q: 'construction', rerank: (r) => REL.diversify(r, { enabled: true, familyOf }) };
  const grouped = S.search(idx, params).total;
  const plain = S.search(idx, { q: 'construction' }).total;
  assert.strictEqual(grouped, plain, 'grouping changed the opportunity count');
  const visualGroups = new Set(everything({ q: 'construction' }).map((r) => r.f || r.i)).size;
  assert.ok(visualGroups < plain, 'no family exists in this cohort, so the mutation is a no-op');
});

mutate('M8 diversity applied to an exact buyer-name query', () => {
  const rows = everything({ q: 'construction' });
  assert.strictEqual(REL.diversityApplies({
    sort: 'relevance', query: S.parseQuery('Defence Construction Canada'), results: rows, filters: {},
  }).enabled, false);
  assert.strictEqual(REL.diversityApplies({
    sort: 'relevance', query: S.parseQuery('construction'), results: rows, filters: {},
  }).enabled, true, 'the mutation is a no-op: diversity is off for everything');
});

mutate('M9 diversity applied despite a source filter', () => {
  assert.strictEqual(REL.diversityApplies({
    sort: 'relevance', query: S.parseQuery('construction'), results: [], filters: { source: 'ted' },
  }).enabled, false);
});

mutate('M10 a weaker result promoted over a stronger one', () => {
  const run = [rec({ i: 'a', _r: 40 }), rec({ i: 'b', _r: 5, bu: 'Other', b: 'other' })];
  const out = REL.diversify(run, { enabled: true, familyOf: new Map() });
  assert.strictEqual(out[0].i, 'a', 'a 5-point result overtook a 40-point one');
  assert.strictEqual(out[0]._r, 40);
});

mutate('M11 reranking uses a random shuffle', () => {
  const rows = everything({ q: 'construction' });
  const a = withDiversity(rows).map((r) => r.i);
  const b = withDiversity(rows).map((r) => r.i);
  const c = withDiversity(rows.slice()).map((r) => r.i);
  assert.deepStrictEqual(a, b);
  assert.deepStrictEqual(a, c);
});

mutate('M12 input order changes the outcome', () => {
  const norm = (f) => f.map((x) => x.memberIds.slice().sort().join(',')).sort();
  assert.deepStrictEqual(norm(REL.detectFamilies(idx.records).families),
    norm(REL.detectFamilies(idx.records.slice().reverse()).families));
});

mutate('M13 pagination before diversity creates cross-page duplicates', () => {
  const params = { q: 'construction', rerank: (r) => REL.diversify(r, { enabled: true, familyOf }) };
  const first = S.search(idx, params);
  const p1 = S.search(idx, Object.assign({}, params, { page: 1 })).results.map((r) => r.i);
  const p2 = S.search(idx, Object.assign({}, params, { page: 2 })).results.map((r) => r.i);
  assert.deepStrictEqual(p1.filter((x) => p2.includes(x)), [], 'pages overlap');
  assert.ok(first.pages > 1, 'only one page, so the mutation is a no-op');
});

mutate('M14 per-page diversification loses a record', () => {
  // Diversifying each page independently reorders against a different
  // neighbourhood, so a record can fall off one page without joining another.
  const rows = everything({ q: 'construction' });
  const perPage = [];
  for (let i = 0; i < rows.length; i += 25) {
    perPage.push(...REL.diversify(rows.slice(i, i + 25), { enabled: true, familyOf }));
  }
  const whole = withDiversity(rows);
  assert.notDeepStrictEqual(perPage.map((r) => r.i), whole.map((r) => r.i),
    'per-page and whole-universe diversification agree, so the ordering is not actually applied');
  assert.strictEqual(whole.length, rows.length);
});

mutate('M15 a source occurrence becomes a family member', () => {
  const multi = idx.records.filter((r) => r.ms);
  assert.ok(multi.length > 0);
  for (const r of multi) assert.ok(r.oc > 1);
  // Families are built from canonical records only.
  const ids = new Set(idx.records.map((r) => r.i));
  for (const [, members] of familyMembers) {
    for (const m of members) assert.ok(ids.has(m.i));
  }
});

mutate('M16 the similarity threshold lowered until title-only grouping passes', () => {
  const a = rec({ i: 'a', bu: 'City A', b: 'city a' });
  const b = rec({ i: 'b', bu: 'City B', b: 'city b' });
  assert.strictEqual(REL.jaccard(REL.tokens(a.t), REL.tokens(b.t)), 1,
    'the fixture titles are not identical, so the test proves nothing');
  assert.deepStrictEqual(REL.detectFamilies([a, b]).families, [],
    'identical titles from different buyers grouped');
});

mutate('M17 classification conflict ignored', () => {
  assert.strictEqual(REL.isRelated(rec({ i: 'a', sc: 'CPV' }), rec({ i: 'b', sc: 'UNSPSC' }), new Set()).related, false);
});

mutate('M18 family id from a timestamp or random value', () => {
  const a = REL.detectFamilies(idx.records).families.map((f) => f.familyId).sort();
  const b = REL.detectFamilies(idx.records).families.map((f) => f.familyId).sort();
  assert.deepStrictEqual(a, b);
  assert.ok(a.every((x) => x.startsWith('fam_')));
});

mutate('M19 the diversity layer mutates the relevance score', () => {
  const rows = everything({ q: 'telecom' });
  const before = rows.map((r) => r._r);
  withDiversity(rows);
  assert.deepStrictEqual(rows.map((r) => r._r), before);
});

mutate('M20 an explicit deadline sort is silently reordered', () => {
  assert.strictEqual(REL.diversityApplies({
    sort: 'deadline', query: S.parseQuery('construction'), results: [], filters: {},
  }).enabled, false);
});

mutate('M21 __proto__ corrupts family lookup', () => {
  const m = new Map();
  assert.strictEqual(m.get('__proto__'), undefined);
  const out = REL.diversify([rec({ i: '__proto__', _r: 1 }), rec({ i: 'b', _r: 1 })],
    { enabled: true, familyOf: m });
  assert.strictEqual(out.length, 2);
});

mutate('M22 a family route added to the sitemap', () => {
  const sitemap = read('sitemap.xml');
  const mutated = sitemap.replace('</urlset>',
    '<url><loc>https://petrohrys.com/research/tenders-procurement/opportunities/family/fam_x</loc></url></urlset>');
  assert.notStrictEqual(mutated, sitemap);
  assert.ok(!/fam_/.test(sitemap));
});

mutate('M23 English related-opportunity copy leaks into a localized page', () => {
  for (const locale of ['de', 'es', 'fr']) {
    assert.notStrictEqual(I18N.raw(locale, 'tds.methodRelated'), I18N.raw('en', 'tds.methodRelated'));
    assert.ok(!pageOf(locale).includes(esc(I18N.raw('en', 'tds.methodRelated'))),
      `${locale} carries the English grouping explanation`);
  }
});

mutate('M24 the canonical corpus fingerprint changes', () => {
  const fp = require('node:crypto').createHash('sha256')
    .update(fs.readFileSync(path.join(ROOT, 'data/tender-opportunities/opportunities.json'))).digest('hex').slice(0, 8);
  assert.strictEqual(fp, '3c341d60');
});

mutate('M25 the matching weights change', () => {
  assert.deepStrictEqual(MATCH.WEIGHTS,
    { category: 40, geography: 20, actionability: 15, deadline: 15, confidence: 10 });
});

mutate('M26 the build imports network-dependent similarity code', () => {
  const src = read('scripts/lib/to-related.cjs').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/require\(/.test(src), 'the similarity layer took on a dependency');
});

test('the mutation suite actually ran every mutation', () => {
  assert.strictEqual(applied.length, 26, `only ${applied.length} mutations ran`);
  assert.strictEqual(new Set(applied).size, 26);
});
