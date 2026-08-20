'use strict';

// The Trusted Source Finder: three independent facts, filterable together.
//
// Domain Rating is backlink strength. Cost is what the action costs. Readiness
// is whether anyone can act today. They are deliberately NOT combined into a
// score — a directory with DR 95, free listing and no recorded route is not a
// good opportunity, it is an unresearched one, and any weighted sum would hide
// exactly that. So the tests here are mostly about keeping the three apart
// while letting a reader intersect them.

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '..', '..');
const D = require(path.join(ROOT, 'scripts/lib/bd-discovery.cjs'));
const O = require(path.join(ROOT, 'js/bd-order.js'));
const E = require(path.join(ROOT, 'scripts/lib/dp-engine.cjs'));

// A page offering everything the finder can offer.
const KNOWN = {
  facets: [
    { name: 'country', multi: false, values: ['germany', 'italy', 'czech-republic'] },
    { name: 'cost', multi: false, values: ['free', 'freemium', 'paid', 'unknown'] },
    { name: 'actionability', multi: false, values: ['READY', 'NEEDS_RESEARCH', 'NEEDS_BROWSER', 'BLOCKED'] },
  ],
  filters: [],
  sorts: ['default', 'domain-rating', 'domain-rating-asc', 'alphabetical'],
  jurisdictions: [],
  minDr: ['10', '20', '30', '40', '50', '60', '70', '80', '90'],
};

const row = (name, over = {}) => ({
  name,
  haystack: name.toLowerCase(),
  domainRating: null,
  facets: { country: 'germany', cost: 'free', actionability: 'READY' },
  flags: {},
  ...over,
});
const withFacets = (name, dr, f) => row(name, { domainRating: dr, facets: { ...row(name).facets, ...f } });
const state = (over = {}) => ({ ...D.emptyState(KNOWN), ...over });
// Through selectionFor, which is the ONE conversion the browser and a URL both
// go through. Calling evaluate() with a raw URL-shaped state instead is how the
// first version of these tests passed while the threshold did nothing at all in
// the browser: the shapes differ, and only this function reconciles them.
const names = (rows, st) => D.filter(rows, D.selectionFor(st, KNOWN)).rows.map((r) => r.name);

// ── M1 / M2 / M3: WHAT THE THRESHOLD MEANS ──────────────────────────────────

test('M1: the threshold compares numbers, not strings', () => {
  // As strings "9" > "50" and "100" < "50". A lexicographic compare would admit
  // every single-digit rating to a 50+ filter and drop 100 out of it — the two
  // most visible records on the page, wrong in both directions at once.
  const rows = [withFacets('nine', 9, {}), withFacets('fifty', 50, {}),
    withFacets('hundred', 100, {}), withFacets('fortynine', 49, {})];
  assert.deepStrictEqual(names(rows, state({ minDr: '50' })).sort(), ['fifty', 'hundred']);
  assert.deepStrictEqual(names(rows, state({ minDr: '10' })).sort(), ['fifty', 'fortynine', 'hundred']);
});

test('M2: an unmeasured domain passes no threshold at all', () => {
  // A rating high enough to clear every offered floor, so the only record that
  // can fail one is the unmeasured one.
  const rows = [withFacets('measured', 95, {}), row('unmeasured')];
  for (const floor of KNOWN.minDr) {
    assert.deepStrictEqual(names(rows, state({ minDr: floor })), ['measured'],
      `an unmeasured record passed the ${floor}+ filter`);
  }
  // And it is still there when nobody asked a question it cannot answer.
  assert.deepStrictEqual(names(rows, state()).sort(), ['measured', 'unmeasured']);
});

test('M3: a measured zero is a reading, not a gap', () => {
  const rows = [withFacets('zero', 0, {}), row('missing')];
  // Under "Any" both are shown — one because it was measured at 0, the other
  // because no floor was asked for.
  assert.deepStrictEqual(names(rows, state()).sort(), ['missing', 'zero']);
  // Under any floor, neither passes — but for different reasons, and the corpus
  // keeps them distinguishable.
  assert.deepStrictEqual(names(rows, state({ minDr: '10' })), []);
  assert.strictEqual(rows[0].domainRating, 0);
  assert.strictEqual(rows[1].domainRating, null);
  assert.notStrictEqual(rows[0].domainRating, rows[1].domainRating);
});

test('the threshold is never a qualitative label', () => {
  // Ahrefs publishes a number and publishes no bands for it. Any word here
  // would be this project's opinion wearing the provider's name.
  const src = fs.readFileSync(path.join(ROOT, 'scripts/lib/bd-components.cjs'), 'utf8');
  const control = src.slice(src.indexOf('function minDomainRatingControl'),
    src.indexOf('function facetSelect'));
  assert.ok(control.length > 200, 'could not isolate the control');
  for (const word of ['Poor', 'Good', 'Excellent', 'Trusted', 'Strong', 'Weak', 'High authority']) {
    assert.ok(!new RegExp(`>${word}`, 'i').test(control), `the control labels a threshold "${word}"`);
  }
  for (const n of [10, 50, 90]) assert.ok(control.includes(`${n}+`) || control.includes('${n}+'));
});

// ── M7: THE DIMENSIONS INTERSECT ────────────────────────────────────────────

test('M7: every dimension narrows; none widens another', () => {
  const rows = [
    withFacets('a', 80, { country: 'germany', cost: 'free', actionability: 'READY' }),
    withFacets('b', 80, { country: 'germany', cost: 'paid', actionability: 'READY' }),
    withFacets('c', 80, { country: 'italy', cost: 'free', actionability: 'READY' }),
    withFacets('d', 30, { country: 'germany', cost: 'free', actionability: 'READY' }),
    withFacets('e', 80, { country: 'germany', cost: 'free', actionability: 'NEEDS_RESEARCH' }),
  ];
  const full = state({
    facets: { country: 'germany', cost: 'free', actionability: 'READY' },
    minDr: '50',
  });
  // Exactly one record satisfies all four. Under OR it would be five.
  assert.deepStrictEqual(names(rows, full), ['a']);
  // Each dimension removed in turn brings back exactly the record it excluded.
  assert.deepStrictEqual(names(rows, state({ facets: { country: 'germany', cost: 'free', actionability: 'READY' } })).sort(), ['a', 'd']);
  assert.deepStrictEqual(names(rows, state({ facets: { country: 'germany', cost: 'free' }, minDr: '50' })).sort(), ['a', 'e']);
  assert.deepStrictEqual(names(rows, state({ facets: { country: 'germany', actionability: 'READY' }, minDr: '50' })).sort(), ['a', 'b']);
  assert.deepStrictEqual(names(rows, state({ facets: { cost: 'free', actionability: 'READY' }, minDr: '50' })).sort(), ['a', 'c']);
});

test('a search query narrows the same intersection', () => {
  const rows = [
    withFacets('berlin directory', 90, {}),
    withFacets('munich directory', 90, {}),
  ];
  assert.deepStrictEqual(names(rows, state({ q: 'berlin', minDr: '50' })), ['berlin directory']);
  assert.deepStrictEqual(names(rows, state({ q: 'berlin', minDr: '95' })), []);
});

// ── M6: READINESS IS EVIDENCE, NOT A CONSEQUENCE ────────────────────────────

test('M6: a high rating and a free price cannot make a record READY', () => {
  // The status comes from the Planner's own actionability, which reads the
  // action and the route and nothing else. This asserts it at the source.
  const op = {
    sourceCollection: 'directories', platformId: 'x', country: 'germany',
    name: 'Famous Directory', cost: 'free', domainRating: 100,
    actionType: null, actionUrl: null, evidence: 'verified',
  };
  const verdict = E.actionability(op);
  assert.notStrictEqual(verdict.status, 'READY',
    'DR 100 and a free listing produced READY with no route recorded');
  assert.strictEqual(verdict.status, 'NEEDS_RESEARCH');

  // And the finder cannot promote it either: the facet carries the status, so
  // filtering to READY simply does not return it.
  const rows = [withFacets('famous', 100, { cost: 'free', actionability: 'NEEDS_RESEARCH' })];
  assert.deepStrictEqual(names(rows, state({ facets: { actionability: 'READY' } })), []);
});

test('readiness values are the Planner’s own vocabulary', () => {
  const statuses = new Set(Object.values(E.STATUS));
  for (const v of KNOWN.facets.find((f) => f.name === 'actionability').values) {
    assert.ok(statuses.has(v), `${v} is not a Distribution Planner status`);
  }
});

// ── M5: TWO TENDER FACTS, TWO CONTROLS ──────────────────────────────────────

test('M5: free notice search never satisfies a free-bidding filter', () => {
  const KNOWN_T = {
    facets: [
      { name: 'searchaccess', multi: false, values: ['free', 'paid', 'mixed', 'unknown'] },
      { name: 'bidaccess', multi: false, values: ['free', 'paid', 'unknown'] },
    ],
    filters: [], sorts: ['as-published'], jurisdictions: [], minDr: ['50'],
  };
  const t = (name, search, bid) => ({
    name, haystack: name, domainRating: 80,
    facets: { searchaccess: search, bidaccess: bid }, flags: {},
  });
  const rows = [
    t('philgeps', 'free', 'unknown'),
    t('find-a-tender', 'free', 'unknown'),
    t('gebiz', 'free', 'paid'),
    t('bayern', 'free', 'free'),
  ];
  const pick = (st) => D.filter(rows, { ...D.emptyState(KNOWN_T), ...st }).rows.map((r) => r.name);
  // Free to search: all four. Free to bid: one.
  assert.deepStrictEqual(pick({ facets: { searchaccess: 'free' } }).length, 4);
  assert.deepStrictEqual(pick({ facets: { bidaccess: 'free' } }), ['bayern']);
  // The named regressions must not appear under free bidding.
  for (const id of ['philgeps', 'find-a-tender', 'gebiz']) {
    assert.ok(!pick({ facets: { bidaccess: 'free' } }).includes(id),
      `${id} appears as free to bid because its notice search is free`);
  }
});

test('the tender page keeps the two access facts in separate controls', () => {
  const page = path.join(ROOT, 'research/tenders-procurement/index.html');
  if (!fs.existsSync(page)) return;
  const html = fs.readFileSync(page, 'utf8');
  if (!html.includes('data-bd-facet="bidaccess"')) return;
  assert.ok(html.includes('data-bd-facet="searchaccess"'),
    'bidding access is offered without notice-search access, so the two would be read as one');
  // No control may merge them.
  assert.ok(!/data-bd-facet="(free|access)"/.test(html),
    'a combined access control exists, which would conflate searching with bidding');
});

// ── M11: A LABEL IS NEVER A VALUE ───────────────────────────────────────────

test('M11: no localized string is a filter value', () => {
  const dicts = ['en', 'de', 'es', 'fr']
    .map((l) => JSON.parse(fs.readFileSync(path.join(ROOT, `data/i18n/${l}.json`), 'utf8')));
  const machineValues = new Set([
    ...KNOWN.facets.flatMap((f) => f.values), ...KNOWN.sorts, ...KNOWN.minDr,
    'free', 'paid', 'mixed', 'unknown', 'publish-classified', 'create-seller-profile',
  ]);
  for (const d of dicts) {
    for (const [key, value] of Object.entries(d)) {
      if (!/^(act|access|sellerAction|sort)\./.test(key)) continue;
      assert.ok(!machineValues.has(value),
        `${key} translates to "${value}", which is also a filter value`);
    }
  }
});

test('the parser refuses anything the page does not offer', () => {
  const parsed = D.parseState(new URLSearchParams(
    'country=atlantis&cost=free&actionability=SUPERB&min-dr=73&sort=by-vibes'), KNOWN);
  assert.strictEqual(parsed.facets.country, undefined, 'an unknown country was accepted');
  assert.strictEqual(parsed.facets.actionability, undefined, 'an unknown status was accepted');
  assert.strictEqual(parsed.minDr, '', 'a threshold the page does not offer was accepted');
  assert.strictEqual(parsed.sort, D.defaultSort(KNOWN), 'an unknown sort was accepted');
  assert.strictEqual(parsed.facets.cost, 'free', 'a legitimate value was dropped');
});

// ── M8 / M9 / M10 / M16: STATE SURVIVES ─────────────────────────────────────

test('M10: the threshold survives a round trip through the URL', () => {
  const chosen = state({ facets: { country: 'italy', cost: 'free' }, minDr: '50', sort: 'domain-rating' });
  const url = D.serializeState(chosen, KNOWN);
  assert.match(url, /min-dr=50/);
  const back = D.parseState(new URLSearchParams(url.slice(1)), KNOWN);
  assert.strictEqual(back.minDr, '50');
  assert.strictEqual(back.sort, 'domain-rating');
  assert.strictEqual(back.facets.country, 'italy');
  // Serializing again is stable, so a link cannot change shape by being opened.
  assert.strictEqual(D.serializeState(back, KNOWN), url);
});

test('M9 / M16: the sort is a separate axis from the filters', () => {
  // Changing a filter cannot change the sort, and vice versa: they live in
  // different fields of one state object and neither writes the other.
  const a = state({ minDr: '50', sort: 'domain-rating' });
  const b = { ...a, facets: { country: 'italy' } };
  assert.strictEqual(b.sort, 'domain-rating', 'adding a filter changed the sort');
  const c = { ...b, sort: 'alphabetical' };
  assert.strictEqual(c.minDr, '50', 'changing the sort changed the threshold');
  assert.deepStrictEqual(c.facets, { country: 'italy' }, 'changing the sort changed the filters');
});

test('M16: the default order is the page’s own, never Domain Rating', () => {
  assert.strictEqual(D.defaultSort(KNOWN), 'default');
  assert.notStrictEqual(D.defaultSort(KNOWN), 'domain-rating');
  // An empty state serializes to nothing, so the default never appears in a URL
  // and can never be silently redefined by one.
  assert.strictEqual(D.serializeState(D.emptyState(KNOWN), KNOWN), '');
  // And on every generated page, the first sort option — which is what the
  // browser selects on load — is not a Domain Rating order.
  for (const rel of ['research/business-directories/opportunities/index.html',
    'research/marketplaces/index.html', 'research/media-pr-publishing/index.html',
    'research/tenders-procurement/index.html']) {
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) continue;
    const html = fs.readFileSync(file, 'utf8');
    const select = html.slice(html.indexOf('data-bd-sort'));
    const first = /<option value="([a-z-]*)"/.exec(select);
    if (!first) continue;
    assert.ok(!/^domain-rating/.test(first[1]),
      `${rel} loads sorted by Domain Rating (${first[1]})`);
  }
});

// ── M12 / M13: EXPORT IS THE RESULT SET ─────────────────────────────────────

test('M12: an empty result exports a header and nothing else', () => {
  const cols = D.exportColumns(KNOWN);
  const csv = D.renderFilteredCsv([], cols).replace(/^﻿/, '');
  const lines = csv.split('\r\n').filter(Boolean);
  assert.strictEqual(lines.length, 1, 'an empty selection exported data rows');
  assert.ok(lines[0].includes('name'));
});

test('M13: the export is given the rows in the order they are shown', () => {
  // renderFilteredCsv does not sort. It cannot: it is handed the visible rows,
  // in the visible order, and a second ordering implementation here is exactly
  // how an export starts disagreeing with the table above it.
  const src = fs.readFileSync(path.join(ROOT, 'scripts/lib/bd-discovery.cjs'), 'utf8');
  const fn = src.slice(src.indexOf('function renderFilteredCsv'));
  const body = fn.slice(0, fn.indexOf('\n  }'));
  assert.ok(!/\.sort\(/.test(body), 'the export sorts, so it can disagree with the table');
  const rows = [withFacets('c', 30, {}), withFacets('a', 90, {}), withFacets('b', 60, {})];
  const sorted = O.sortRecords(rows, 'domain-rating');
  const csv = D.renderFilteredCsv(sorted, D.exportColumns(KNOWN)).replace(/^﻿/, '');
  const order = csv.trim().split('\r\n').slice(1).map((l) => l.split(',')[0]);
  assert.deepStrictEqual(order, ['a', 'b', 'c'], 'the export did not follow the shown order');
});

test('the export carries every dimension the page can filter by', () => {
  const cols = D.exportColumns(KNOWN).map((c) => c.key);
  for (const facet of KNOWN.facets) {
    assert.ok(cols.includes(facet.name), `${facet.name} can be filtered but not exported`);
  }
  assert.ok(cols.includes('domain_rating'));
  assert.ok(cols.includes('domain_rating_provider'));
});

// ── M15: THE FINDER IS USER STATE, NOT A CRAWL SURFACE ──────────────────────

test('M15: no generated page links to a filter combination', () => {
  const pages = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'index.html') pages.push(full);
    }
  };
  for (const r of ['research', 'de/research', 'es/research', 'fr/research']) {
    const p = path.join(ROOT, r);
    if (fs.existsSync(p)) walk(p);
  }
  assert.ok(pages.length > 100, `only ${pages.length} pages scanned`);
  const FINDER_PARAM = /href="[^"]*\?[^"]*\b(min-dr|actionability|searchaccess|bidaccess|selleraction)=/;
  for (const p of pages) {
    const html = fs.readFileSync(p, 'utf8');
    assert.ok(!FINDER_PARAM.test(html),
      `${path.relative(ROOT, p)} links to a finder filter combination, which would crawl it`);
  }
});

test('M15: the sitemap and canonicals carry no finder query', () => {
  const sitemap = path.join(ROOT, 'sitemap.xml');
  if (fs.existsSync(sitemap)) {
    const xml = fs.readFileSync(sitemap, 'utf8');
    assert.ok(!/[?&](min-dr|actionability|cost|country|sort)=/.test(xml),
      'the sitemap contains finder query URLs');
  }
  for (const rel of ['research/marketplaces/index.html', 'research/tenders-procurement/index.html']) {
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) continue;
    const html = fs.readFileSync(file, 'utf8');
    for (const m of html.matchAll(/<link[^>]+rel="(canonical|alternate)"[^>]*>/g)) {
      assert.ok(!m[0].includes('?'), `${rel} has a ${m[0].slice(0, 60)}… carrying a query string`);
    }
  }
});

// ── NO COMPOSITE SCORE ──────────────────────────────────────────────────────

test('nothing combines the three dimensions into one number', () => {
  // The point of the finder is that a reader intersects facts they understand.
  // A blended score would let a famous unusable directory outrank a modest
  // ready one, and would do it invisibly.
  for (const rel of ['scripts/lib/bd-discovery.cjs', 'js/bd-order.js',
    'scripts/lib/bd-components.cjs']) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    assert.ok(!/domainRating\s*\*/.test(code), `${rel} multiplies a Domain Rating into something`);
    assert.ok(!/\+=\s*[a-zA-Z.]*domainRating/.test(code), `${rel} adds a Domain Rating into a score`);
    assert.ok(!/trustScore|qualityScore|opportunityScore/i.test(code), `${rel} defines a composite score`);
  }
});

test('the Planner does not weigh Domain Rating', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/lib/dp-engine.cjs'), 'utf8');
  const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  assert.ok(!/domainRating/.test(code),
    'the Distribution Planner reads Domain Rating, so it can rank on it');
});
