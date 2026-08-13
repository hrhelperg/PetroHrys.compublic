'use strict';

// Research Center discovery — the regressions derived from the production
// failures, tested against the REAL generated pages.
//
// Every row here is parsed out of the HTML the generator actually wrote, and
// every expectation is derived independently from the canonical JSON. A test
// that only counted rows would have passed while Czech Republic showed 383 of
// them, so these compare IDENTITIES.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const D = require('../lib/bd-discovery.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ── READING A PAGE THE WAY THE BROWSER WOULD ────────────────────────────────
//
// The generator emits one <tr class="bd-row" …> per record with its facet
// attributes. Parsing those back gives exactly the objects the client builds
// from the DOM, so the predicate under test is fed real page data.
function rowsOf(html) {
  const out = [];
  const re = /<tr class="bd-row"([^>]*)>([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1];
    const facets = {};
    const fre = /data-bd-facet-([a-z]+)="([^"]*)"/g;
    let f;
    while ((f = fre.exec(attrs)) !== null) facets[f[1]] = f[2];
    const hay = /data-bd-haystack="([^"]*)"/.exec(attrs);
    // The first cell's link text is the record's visible identity.
    const name = /<td[^>]*>(?:<a[^>]*>)?([^<]+)/.exec(m[2]);
    out.push({
      haystack: hay ? hay[1] : '',
      facets,
      flags: {},
      name: name ? name[1].trim() : '',
    });
  }
  return out;
}

const decode = (s) => String(s)
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'");

const TP_HTML = read('research/tenders-procurement/index.html');
const MP_HTML = read('research/marketplaces/index.html');
const TP_ROWS = rowsOf(TP_HTML);
const MP_ROWS = rowsOf(MP_HTML);

const PLATFORMS = JSON.parse(read('data/tenders-procurement/platforms.json'));
const MARKETPLACES = JSON.parse(read('data/marketplaces/marketplaces.json'));

const sel = (facets) => ({ query: '', facets, flags: [] });

// ── THE PAGE MUST BIND TO THE ENGINE AT ALL ─────────────────────────────────

test('every filterable page declares itself to the discovery script', () => {
  // The whole defect in one assertion. js/business-directories.js does
  //   var bodies = document.querySelectorAll('[data-bd-rows]');
  //   if (!bodies.length) return;
  // on its third statement, so a page with perfect facet markup and no
  // data-bd-rows has seven controls wired to nothing.
  for (const [label, html] of [['tenders-procurement', TP_HTML], ['marketplaces', MP_HTML],
    ['media-pr-publishing', read('research/media-pr-publishing/index.html')],
    ['business-directories', read('research/business-directories/index.html')]]) {
    assert.ok(/<tbody data-bd-rows>/.test(html), `${label}: no tbody declares data-bd-rows`);
    assert.ok(/<tr class="bd-row"/.test(html), `${label}: no row carries the bd-row class`);
    assert.ok(html.includes('/js/bd-discovery.js'), `${label}: the predicate is not shipped`);
    assert.ok(html.includes('/js/business-directories.js'), `${label}: the client is not loaded`);
  }
});

test('a facet control exists for every facet attribute the rows carry, and vice versa', () => {
  for (const [label, html] of [['tenders-procurement', TP_HTML], ['marketplaces', MP_HTML]]) {
    const controls = new Set([...html.matchAll(/data-bd-facet="([a-z]+)"/g)].map((m) => m[1]));
    const onRows = new Set([...html.matchAll(/data-bd-facet-([a-z]+)="/g)].map((m) => m[1]));
    assert.deepStrictEqual([...controls].sort(), [...onRows].sort(),
      `${label}: the controls and the row attributes disagree`);
    assert.ok(controls.size > 0, `${label}: no facets at all`);
  }
});

// ── TEST A: THE PRODUCTION SCREENSHOT ───────────────────────────────────────

test('TEST A — Czech Republic returns exactly the canonical Czech platforms', () => {
  const expected = PLATFORMS.filter((p) => p.country === 'czech-republic').map((p) => p.name).sort();
  assert.ok(expected.length > 0, 'no Czech platform in canonical data; the test proves nothing');

  const got = D.filter(TP_ROWS, sel({ country: 'czech-republic' }));
  assert.strictEqual(got.rows.length, expected.length,
    `expected ${expected.length} Czech rows, got ${got.rows.length} of ${TP_ROWS.length}`);
  assert.deepStrictEqual(got.rows.map((r) => decode(r.name)).sort(), expected);

  // The exact failure that was reported.
  const visible = got.rows.map((r) => r.facets.country);
  assert.ok(!visible.includes('albania'), 'Albania is still visible under Czech Republic');
  assert.ok(!visible.includes('algeria'), 'Algeria is still visible under Czech Republic');
  assert.deepStrictEqual([...new Set(visible)], ['czech-republic']);
});

test('TEST A2 — other jurisdictions filter to their own canonical records', () => {
  for (const country of ['albania', 'united-states', 'india', 'germany']) {
    const expected = PLATFORMS.filter((p) => p.country === country).length;
    if (!expected) continue;
    const got = D.filter(TP_ROWS, sel({ country }));
    assert.strictEqual(got.rows.length, expected, `${country}: ${got.rows.length} != ${expected}`);
    assert.ok(got.rows.every((r) => r.facets.country === country),
      `${country}: a foreign row survived`);
  }
});

// ── TEST B: MARKETPLACES ────────────────────────────────────────────────────

test('TEST B — India returns exactly the canonical India marketplaces', () => {
  const expected = MARKETPLACES.filter((m) => m.country === 'india').map((m) => m.name).sort();
  assert.strictEqual(expected.length, 7, 'the canonical India count moved; update the expectation');

  const got = D.filter(MP_ROWS, sel({ country: 'india' }));
  assert.strictEqual(got.rows.length, 7, `expected 7 India rows, got ${got.rows.length} of ${MP_ROWS.length}`);
  assert.deepStrictEqual(got.rows.map((r) => decode(r.name)).sort(), expected);
  assert.deepStrictEqual([...new Set(got.rows.map((r) => r.facets.country))], ['india']);
});

// ── FILTER COMPOSITION ──────────────────────────────────────────────────────

test('filters compose with AND, and one never overwrites another', () => {
  const single = D.filter(TP_ROWS, sel({ scope: 'public' })).rows.length;
  const pair = D.filter(TP_ROWS, sel({ scope: 'public', esub: 'yes' })).rows.length;
  const triple = D.filter(TP_ROWS, sel({ scope: 'public', esub: 'yes', evidence: 'A' })).rows.length;
  assert.ok(pair <= single && triple <= pair, 'adding a filter widened the result');

  // Identity, not just count: every survivor satisfies every clause.
  const got = D.filter(TP_ROWS, sel({ scope: 'public', esub: 'yes', evidence: 'A' })).rows;
  for (const r of got) {
    assert.strictEqual(r.facets.scope, 'public');
    assert.strictEqual(r.facets.esub, 'yes');
    assert.strictEqual(r.facets.evidence, 'A');
  }
  // And it equals the independently derived set.
  const expected = TP_ROWS.filter((r) => r.facets.scope === 'public'
    && r.facets.esub === 'yes' && r.facets.evidence === 'A').length;
  assert.strictEqual(got.length, expected);
});

test('"All" in a dimension is no restriction, not a match on the empty string', () => {
  // A national platform carries data-bd-facet-subnational="". If "All" were
  // compared as a value, every subnational platform would vanish.
  const all = D.filter(TP_ROWS, sel({ subnational: '' }));
  assert.strictEqual(all.rows.length, TP_ROWS.length, '"All" filtered something out');
  const withSub = TP_ROWS.filter((r) => r.facets.subnational !== '');
  assert.ok(withSub.length > 0, 'no subnational platform to exercise the case');
});

// ── TRI-STATE ───────────────────────────────────────────────────────────────

test('UNKNOWN is never collapsed into NO', () => {
  const yes = D.filter(TP_ROWS, sel({ esub: 'yes' })).rows;
  const no = D.filter(TP_ROWS, sel({ esub: 'no' })).rows;
  const unknown = D.filter(TP_ROWS, sel({ esub: 'unknown' })).rows;
  assert.ok(yes.length && unknown.length, 'the tri-state is not exercised by the data');
  // The three are disjoint and together account for everything.
  assert.strictEqual(yes.length + no.length + unknown.length, TP_ROWS.length,
    'the three tri-states do not partition the collection');
  for (const r of unknown) assert.strictEqual(r.facets.esub, 'unknown');
  for (const r of no) assert.strictEqual(r.facets.esub, 'no');

  // And the canonical data agrees.
  const canonUnknown = PLATFORMS.filter((p) => !p.electronicSubmission
    || p.electronicSubmission === 'unknown').length;
  assert.strictEqual(unknown.length, canonUnknown,
    'the page and the canonical data disagree about how many are unknown');
});

test('a checkbox filter matches only yes, and reports what it withheld', () => {
  const rows = [
    { haystack: '', facets: {}, flags: { esub: 'yes' } },
    { haystack: '', facets: {}, flags: { esub: 'no' } },
    { haystack: '', facets: {}, flags: { esub: 'unknown' } },
  ];
  const out = D.filter(rows, { query: '', facets: {}, flags: ['esub'] });
  assert.strictEqual(out.rows.length, 1);
  assert.strictEqual(out.unknownHidden, 1, 'the unknown row was hidden without being counted');
});

// ── SEARCH ──────────────────────────────────────────────────────────────────

test('search finds real records and excludes unrelated ones', () => {
  const target = PLATFORMS.find((p) => p.country === 'czech-republic');
  const token = target.name.split(/\s+/)[0].toLowerCase();
  const got = D.filter(TP_ROWS, { query: token, facets: {}, flags: [] });
  assert.ok(got.rows.length >= 1, `searching "${token}" found nothing`);
  assert.ok(got.rows.length < TP_ROWS.length, 'the search matched everything');
  assert.ok(got.rows.some((r) => decode(r.name) === target.name),
    'the record the term came from was not returned');
});

test('search terms compose with AND and ignore case and spacing', () => {
  const a = D.filter(MP_ROWS, { query: 'india', facets: {}, flags: [] }).rows.length;
  const b = D.filter(MP_ROWS, { query: '  INDIA  ', facets: {}, flags: [] }).rows.length;
  assert.strictEqual(a, b, 'case or whitespace changed the result');
  const both = D.filter(MP_ROWS, { query: 'india marketplace', facets: {}, flags: [] }).rows.length;
  assert.ok(both <= a, 'a second term widened the result');
});

test('search combines with facets rather than replacing them', () => {
  const facetOnly = D.filter(MP_ROWS, sel({ country: 'india' })).rows.length;
  const both = D.filter(MP_ROWS, { query: 'a', facets: { country: 'india' }, flags: [] }).rows;
  assert.ok(both.length <= facetOnly, 'search widened a facet result');
  assert.ok(both.every((r) => r.facets.country === 'india'), 'search dropped the facet');
});

test('the haystack carries searchable fields and not the page boilerplate', () => {
  const row = TP_ROWS[0];
  assert.ok(row.haystack.length > 0, 'no haystack');
  assert.ok(row.haystack === row.haystack.toLowerCase(), 'the haystack was not casefolded');
  // Methodology prose must not be searchable: a term from it would otherwise
  // match every row on the page.
  for (const noise of ['methodology', 'evidence class a means', 'last verified on']) {
    const hits = D.filter(TP_ROWS, { query: noise, facets: {}, flags: [] }).rows.length;
    assert.ok(hits < TP_ROWS.length, `"${noise}" matched every row — boilerplate is in the haystack`);
  }
});

// ── CANONICAL VALUES, NOT LABELS ────────────────────────────────────────────

test('filtering uses canonical values, so locale cannot change the results', () => {
  // The option TEXT is localized and carries a count — "Czech Republic (1)".
  // The option VALUE is the slug. If the two were ever compared, the same
  // selection would return different rows per language.
  const values = (html) => [...html.matchAll(/<option value="([^"]*)">/g)].map((m) => m[1]);
  const labels = (html) => [...html.matchAll(/<option value="[^"]*">([^<]*)</g)].map((m) => m[1]);

  const enValues = values(TP_HTML);
  assert.ok(enValues.includes('czech-republic'), 'the canonical slug is not an option value');
  assert.ok(!enValues.some((v) => /\(\d+\)/.test(v)), 'a display count leaked into a value');

  // The real property, and the one a uppercase-check cannot express: US-CA and
  // evidence class A are canonical values that happen to be uppercase. What
  // must hold is that the VALUES are identical in every language while the
  // LABELS are not — that is what makes a selection mean the same thing
  // whichever page a reader is on.
  let anyLabelDiffered = false;
  for (const locale of ['de', 'es', 'fr']) {
    const html = read(`${locale}/research/tenders-procurement/index.html`);
    assert.deepStrictEqual(values(html), enValues,
      `${locale}: the option VALUES differ from English — filtering is locale-dependent`);
    if (labels(html).join('|') !== labels(TP_HTML).join('|')) anyLabelDiffered = true;

    const got = D.filter(rowsOf(html), sel({ country: 'czech-republic' }));
    const en = D.filter(TP_ROWS, sel({ country: 'czech-republic' }));
    assert.strictEqual(got.rows.length, en.rows.length,
      `${locale}: the same selection returned a different number of rows`);
    assert.deepStrictEqual(got.rows.map((r) => r.facets.country), en.rows.map((r) => r.facets.country));
  }
  assert.ok(anyLabelDiffered,
    'no locale translated a single label, so this test cannot prove labels are separate from values');
});

// ── THE ENGINE MUST NOT MUTATE ──────────────────────────────────────────────

test('filtering never mutates the records or the input array', () => {
  const before = JSON.stringify(TP_ROWS);
  const n = TP_ROWS.length;
  D.filter(TP_ROWS, sel({ country: 'india', esub: 'yes' }));
  D.filter(TP_ROWS, { query: 'test', facets: {}, flags: ['esub'] });
  assert.strictEqual(TP_ROWS.length, n, 'the input array was mutated');
  assert.strictEqual(JSON.stringify(TP_ROWS), before, 'a record was mutated');
});

test('an unknown facet name or a nonsense value fails safely', () => {
  assert.strictEqual(D.filter(TP_ROWS, sel({ nosuchfacet: 'x' })).rows.length, 0,
    'an unknown facet matched everything instead of nothing');
  assert.strictEqual(D.filter(TP_ROWS, sel({ country: 'not-a-country' })).rows.length, 0);
  assert.strictEqual(D.filter(TP_ROWS, sel({})).rows.length, TP_ROWS.length);
  // A hostile query must not throw.
  for (const q of ['<script>', '"; DROP TABLE', '((((', '\\', 'a'.repeat(2000)]) {
    assert.doesNotThrow(() => D.filter(TP_ROWS, { query: q, facets: {}, flags: [] }));
  }
});

// ── THE CLIENT SHIPS THE SAME PREDICATE ─────────────────────────────────────

test('the browser and the tests share one implementation, byte for byte', () => {
  assert.strictEqual(read('js/bd-discovery.js'), read('scripts/lib/bd-discovery.cjs'),
    'the shipped predicate has drifted from the tested one');
});

test('the client decides nothing on its own', () => {
  const client = read('js/business-directories.js');
  // The matching logic must be delegated, not reimplemented alongside it.
  assert.ok(/D\.evaluate\(/.test(client), 'the client does not call the shared predicate');
  const body = client.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/indexOf\(' ' \+ want \+ ' '\)/.test(body),
    'the client still contains its own facet matcher');
});

test('discovery reaches no network', () => {
  for (const f of ['js/bd-discovery.js', 'js/business-directories.js']) {
    const src = read(f);
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|import\s*\(/.test(src),
      `${f} reaches the network`);
  }
});
