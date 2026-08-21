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
  // The client now calls the BATCH entry point — one pass over the record
  // store instead of one call per row — so the guard accepts either. What it
  // still refuses is a client that decides for itself.
  assert.ok(/D\.evaluate(All)?\(/.test(client), 'the client does not call the shared predicate');
  assert.ok(!/function\s+\w*[Mm]atches\w*\s*\(/.test(client),
    'the client has grown a matcher of its own');
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

// ── NO CONTROL MAY OFFER A DEAD CHOICE ──────────────────────────────────────
//
// The general form of a bug the opportunities worklist shipped: its "Best for"
// select offered value="saas" while every row carrying that token spelled it
// inside a space-separated set — "saas ai-startup cloud fintech" — and the
// select never declared data-bd-facet-multi, so matchesFacet compared the whole
// list for equality. Three of its six options matched 0 of 1563 rows; the other
// three matched only the rows whose entire set was one token, 2 of 26 for
// local-business. Nothing failed, because no test ever asked a control whether
// the choices it offers lead anywhere.
//
// Pages are discovered from disk rather than listed here, so a collection added
// later is covered the day it ships. The four locale roots hold 23,632
// index.html files and the walk takes about 1.2s; 16 of them carry facets.
// Memoized so that cost is paid once however many tests below ask for the set.
let facetPageCache = null;
function facetPages() {
  if (facetPageCache) return facetPageCache;
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name === 'index.html') {
        const html = fs.readFileSync(p, 'utf8');
        if (html.includes('data-bd-facet="')) out.push({ file: path.relative(ROOT, p), html });
      }
    }
  };
  for (const root of ['research', 'de/research', 'es/research', 'fr/research']) {
    const dir = path.join(ROOT, root);
    if (fs.existsSync(dir)) walk(dir);
  }
  facetPageCache = out;
  return out;
}

// Every facet select with the values it offers and whether it is list-valued,
// resolved EXACTLY the way js/business-directories.js resolves it — including
// the legacy 'audience' name it still honours without the attribute. A test
// that decided `multi` by its own rule would certify pages the browser gets
// wrong, which is the failure mode being closed here.
function facetControlsOf(html) {
  const out = [];
  const re = /<select[^>]*data-bd-facet="([a-z]+)"([^>]*)>([\s\S]*?)<\/select>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    out.push({
      name: m[1],
      multi: m[2].includes('data-bd-facet-multi') || m[1] === 'audience',
      values: [...m[3].matchAll(/<option value="([^"]*)">/g)].map((o) => o[1]).filter(Boolean),
    });
  }
  return out;
}

test('no facet control anywhere offers an option that matches zero rows', () => {
  const pages = facetPages();
  assert.ok(pages.length >= 16, `only ${pages.length} pages carry facet controls`);
  let checked = 0;
  for (const { file, html } of pages) {
    const rows = rowsOf(html);
    assert.ok(rows.length > 0, `${file}: facet controls over a page with no rows`);
    const controls = facetControlsOf(html);
    assert.ok(controls.length > 0, `${file}: the select regex matched nothing`);
    for (const control of controls) {
      for (const value of control.values) {
        const hits = rows.filter((r) => D.matchesFacet(r.facets[control.name], value, control.multi));
        checked += 1;
        assert.ok(hits.length > 0,
          `${file}: the ${control.name} filter offers "${value}", which matches `
          + `0 of ${rows.length} rows — the reader picks it and the table empties`);
      }
    }
  }
  // A floor, not the exact figure: 2,348 options are live today and the number
  // moves with the data. Without it, a regex that matched nothing would pass.
  assert.ok(checked >= 1500, `only ${checked} options were checked; the walk found too little to prove anything`);
});

test('a facet whose rows hold a set declares itself list-valued', () => {
  // The root cause rather than the symptom. An undeclared list-valued facet can
  // still pass the test above by accident — "cloud" matched 8 rows only because
  // those 8 rows happen to be recommended for cloud companies and nothing else,
  // while the other 24 cloud rows stayed hidden.
  let listValued = 0;
  for (const { file, html } of facetPages()) {
    const rows = rowsOf(html);
    for (const control of facetControlsOf(html)) {
      const values = rows.map((r) => r.facets[control.name] || '');
      if (!values.some((v) => v.indexOf(' ') !== -1)) continue;
      listValued += 1;
      assert.ok(control.multi,
        `${file}: rows carry a space-separated set in data-bd-facet-${control.name} `
        + 'but the select does not declare data-bd-facet-multi, so it matches by equality');
    }
  }
  assert.ok(listValued >= 20, `only ${listValued} list-valued facets were found; the guard is not exercised`);
});

// ── SORT, AND HOW IT COMPOSES WITH SEARCH AND FACETS ────────────────────────
//
// The opportunities worklist emitted no sort control at all, which did not mean
// it was unsorted: js/business-directories.js reads
//   var key = sortSelect ? sortSelect.value : 'default';
// so 1563 rows were reordered on load by a PetroHrys Score the table does not
// show, and a reader had no way to name or change that order. These tests hold
// the control that was added, and the properties that make adding one safe.
const ORDER = require('../../js/bd-order.js');

const OPP_HTML = read('research/business-directories/opportunities/index.html');
// The worklist tbody only. The page carries a second table for countries with
// no page of their own, whose rows are a SUBSET of the first — counting across
// both would double-count every record in it.
const OPP_BODY = /<tbody data-bd-rows>([\s\S]*?)<\/tbody>/.exec(OPP_HTML)[1];

// The record the client rebuilds from a row's attributes, carrying the discovery
// shape and the comparator shape at once — because that is what the browser
// holds: one object per row that both D.evaluate and ORDER.sortRecords read.
function recordsOf(bodyHtml) {
  const out = [];
  const re = /<tr class="bd-row"([^>]*)>/g;
  const attr = (a, k) => (new RegExp(`data-bd-${k}="([^"]*)"`).exec(a) || [, ''])[1];
  const num = (a, k) => (attr(a, k) === '' ? null : Number(attr(a, k)));
  let m;
  while ((m = re.exec(bodyHtml)) !== null) {
    const a = m[1];
    const facets = {};
    for (const f of a.matchAll(/data-bd-facet-([a-z]+)="([^"]*)"/g)) facets[f[1]] = f[2];
    out.push({
      name: decode(attr(a, 'name')),
      haystack: attr(a, 'haystack'),
      facets,
      flags: {},
      petroHrysScore: num(a, 'score'),
      domainRating: num(a, 'dr'),
      authorityScore: num(a, 'as'),
      estimatedTraffic: num(a, 'traffic'),
    });
  }
  return out;
}

const OPP_ROWS = recordsOf(OPP_BODY);
// The bug this facet had, stated as data: 16 rows are recommended for SaaS
// companies and not one of them carries "saas" as its whole attribute.
const SAAS = { query: '', facets: { bestfor: { value: 'saas', multi: true } }, flags: [] };
// A composite selection with enough rows to order and enough null metrics to tie.
const COMPOSITE = {
  query: 'directory',
  facets: { bestfor: { value: 'enterprise-software', multi: true }, status: 'active' },
  flags: [],
};

function sortKeysOffered(html) {
  const block = /<select[^>]*data-bd-sort[^>]*>([\s\S]*?)<\/select>/.exec(html);
  return block ? [...block[1].matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]) : [];
}

test('the worklist offers a sort control, and only keys its own records support', () => {
  const offered = sortKeysOffered(OPP_HTML);
  assert.ok(offered.length >= 2, 'the worklist emits no sort control');
  for (const key of offered) {
    assert.ok(ORDER.SORT_KEYS.includes(key), `"${key}" is not a key js/bd-order.js defines`);
  }
  assert.ok(offered.includes('alphabetical'), 'name order is not offered');

  // A metric key may be offered only where the page HOLDS the number and SHOWS
  // the column that number ranks by. Sorting by a metric no row carries does
  // not fail — nullLastDesc returns 0 for every pair and the order collapses to
  // name — so the reader picks "Estimated Traffic" and the table does not move.
  const COLUMN = {
    default: ['petroHrysScore', 'PetroHrys Score'],
    'domain-rating': ['domainRating', 'Domain Rating'],
    'authority-score': ['authorityScore', 'Authority Score'],
    traffic: ['estimatedTraffic', 'Estimated traffic'],
  };
  const heads = [...OPP_HTML.matchAll(/<th class="bd-cell" scope="col">([^<]+)<\/th>/g)].map((m) => m[1]);
  let withheldForNoData = 0;
  for (const [key, [field, label]] of Object.entries(COLUMN)) {
    const withData = OPP_ROWS.filter((r) => r[field] !== null).length;
    if (offered.includes(key)) {
      assert.ok(withData > 0, `"${key}" is offered but no row of ${OPP_ROWS.length} carries ${field}`);
      assert.ok(heads.includes(label), `"${key}" is offered but no "${label}" column is rendered`);
    } else if (withData === 0) withheldForNoData += 1;
  }
  assert.ok(withheldForNoData >= 1,
    'every metric has data on this page, so the withholding rule is not exercised');
});

test('search, facets and sort compose — the identities are the filtered set, reordered', () => {
  const filtered = D.filter(OPP_ROWS, COMPOSITE).rows;
  assert.ok(filtered.length >= 5, `only ${filtered.length} rows survive the composite selection`);

  for (const key of ORDER.SORT_KEYS) {
    const sorted = ORDER.sortRecords(filtered, key);
    // Identity, not count: the same records, no more and no fewer.
    assert.deepStrictEqual([...sorted].map((r) => r.name).sort(),
      filtered.map((r) => r.name).sort(), `${key} changed which records are present`);
    for (const r of sorted) {
      assert.ok(D.evaluate(r, COMPOSITE).visible, `${key} kept a record the selection excludes`);
    }
  }

  // And the order is the comparator's, derived independently here.
  const byDr = ORDER.sortRecords(filtered, 'domain-rating');
  const expected = filtered.map((r, i) => ({ r, i }))
    .sort((a, b) => ORDER.nullLastDesc(a.r.domainRating, b.r.domainRating)
      || ORDER.nullLastDesc(a.r.petroHrysScore, b.r.petroHrysScore)
      || ORDER.compareByName(a.r, b.r) || (a.i - b.i))
    .map((x) => x.r.name);
  assert.deepStrictEqual(byDr.map((r) => r.name), expected);
  // Nulls last, never treated as zero: a record with no measurement is not a
  // record with a bad one.
  const firstNull = byDr.findIndex((r) => r.domainRating === null);
  if (firstNull !== -1) {
    assert.ok(byDr.slice(firstNull).every((r) => r.domainRating === null),
      'a measured Domain Rating sorted below an unmeasured one');
  }
});

test('changing the sort key resets no filter and reveals no hidden row', () => {
  // What the client does on every change: sort the whole set, then re-run the
  // predicate over it. Sorting must not touch the verdict for any record.
  const base = D.filter(OPP_ROWS, SAAS);
  assert.strictEqual(base.rows.length, 16,
    `expected the 16 SaaS-recommended rows, got ${base.rows.length}`);
  const baseNames = base.rows.map((r) => r.name).sort();

  for (const key of ORDER.SORT_KEYS) {
    const reordered = ORDER.sortRecords(OPP_ROWS, key);
    assert.strictEqual(reordered.length, OPP_ROWS.length, `${key} lost or added rows`);
    const after = D.filter(reordered, SAAS);
    assert.deepStrictEqual(after.rows.map((r) => r.name).sort(), baseNames,
      `${key} changed which records the selection shows`);
    assert.strictEqual(after.unknownHidden, base.unknownHidden,
      `${key} changed how many records were withheld for unknown evidence`);
    // Nothing outside the selection may become visible.
    const hidden = reordered.filter((r) => !D.evaluate(r, SAAS).visible);
    assert.strictEqual(hidden.length, OPP_ROWS.length - baseNames.length,
      `${key} revealed rows the selection hides`);
  }
});

test('ties break stably, so two builds of the same data agree', () => {
  // Stability is the explicit index tiebreak in sortRecords, not the engine's.
  // Records identical in every compared field must come out in input order.
  const tied = ['a', 'b', 'c', 'd'].map((tag) => ({
    tag, name: 'Same Name', petroHrysScore: null, domainRating: null,
    authorityScore: null, estimatedTraffic: null,
  }));
  for (const key of ORDER.SORT_KEYS) {
    assert.deepStrictEqual(ORDER.sortRecords(tied, key).map((r) => r.tag), ['a', 'b', 'c', 'd'],
      `${key} reordered records it cannot tell apart`);
  }

  // On the real page: 1513 of 1563 worklist rows carry no Domain Rating, so
  // ordering by it ties almost everything and falls to name. Sorting an already
  // sorted list must be a no-op, or the order would drift on every interaction.
  for (const key of ORDER.SORT_KEYS) {
    const once = ORDER.sortRecords(OPP_ROWS, key);
    const twice = ORDER.sortRecords(once, key);
    assert.deepStrictEqual(twice.map((r) => r.name), once.map((r) => r.name),
      `${key} is not idempotent — the order drifts on re-sort`);
  }

  // Two rows really do share a display name on this page, which is what makes
  // the index tiebreak load-bearing rather than theoretical.
  const names = OPP_ROWS.map((r) => r.name);
  const repeated = names.filter((n, i) => names.indexOf(n) !== i);
  assert.ok(repeated.length > 0, 'no display name repeats, so the tiebreak is untested by real data');
});

test('sorting never mutates the array it is given, or the canonical records', () => {
  const before = OPP_ROWS.map((r) => r.name);
  const snapshot = JSON.stringify(OPP_ROWS);
  for (const key of ORDER.SORT_KEYS) {
    const out = ORDER.sortRecords(OPP_ROWS, key);
    assert.notStrictEqual(out, OPP_ROWS, `${key} returned the input array itself`);
  }
  assert.deepStrictEqual(OPP_ROWS.map((r) => r.name), before, 'the input array was reordered in place');
  assert.strictEqual(JSON.stringify(OPP_ROWS), snapshot, 'a record was mutated');

  // The canonical file itself: the generator sorts what it loads, and a sort
  // that wrote back through its input would corrupt the source of record.
  const CANON = JSON.parse(read('data/business-directories/opportunities.json'));
  const canonBefore = JSON.stringify(CANON);
  const { sortDirectories } = require('../lib/bd-sort.cjs');
  for (const key of ORDER.SORT_KEYS) sortDirectories(CANON, key);
  assert.strictEqual(JSON.stringify(CANON), canonBefore, 'sorting mutated the canonical array');
  assert.strictEqual(JSON.stringify(CANON),
    JSON.stringify(JSON.parse(read('data/business-directories/opportunities.json'))),
    'the canonical file no longer round-trips');
});
