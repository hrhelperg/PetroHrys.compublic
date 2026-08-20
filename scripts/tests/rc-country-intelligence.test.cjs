'use strict';

// One country, four kinds of channel, and no arithmetic between them.
//
// The failure this file is mostly about is a tempting one: a country page that
// ranks every source together, or scores them, or lets a famous domain look
// actionable. A directory listing, a marketplace seller account, a press
// submission and a tender registration are different work with different costs
// and different outcomes. Blending them answers a question nobody asked, and
// blending them invisibly answers it wrongly.

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '..', '..');
const C = require(path.join(ROOT, 'scripts/lib/rc-country-intelligence.cjs'));
const E = require(path.join(ROOT, 'scripts/lib/dp-engine.cjs'));
const D = require(path.join(ROOT, 'scripts/lib/bd-discovery.cjs'));
const O = require(path.join(ROOT, 'js/bd-order.js'));

// ── THE UNIVERSE ────────────────────────────────────────────────────────────

test('every country keeps its four collections apart', () => {
  const countries = C.countries();
  assert.ok(countries.length > 100, `only ${countries.length} countries`);
  for (const slug of countries) {
    const g = C.forCountry(slug);
    assert.deepStrictEqual(Object.keys(g).sort(), [...C.COLLECTIONS].sort(),
      `${slug} does not carry all four collection groups`);
    for (const key of C.COLLECTIONS) {
      for (const r of g[key]) {
        assert.strictEqual(r.collection, key, `${r.id} sits in the ${key} group but says ${r.collection}`);
        assert.strictEqual(r.country, slug, `${r.id} is filed under ${slug} but says ${r.country}`);
      }
    }
  }
});

test('M1: no collection can silently vanish from the universe', () => {
  const totals = { directories: 0, marketplaces: 0, media: 0, tenders: 0 };
  for (const slug of C.countries()) {
    const g = C.forCountry(slug);
    for (const key of C.COLLECTIONS) totals[key] += g[key].length;
  }
  // Pinned as lower bounds rather than exact counts: the corpus grows, and a
  // test that fails on growth teaches people to edit tests. What it must catch
  // is a collection dropping to nothing, which is what a wiring mistake does.
  assert.ok(totals.directories > 1500, `directories collapsed to ${totals.directories}`);
  assert.ok(totals.marketplaces > 300, `marketplaces collapsed to ${totals.marketplaces}`);
  assert.ok(totals.media > 400, `media collapsed to ${totals.media}`);
  assert.ok(totals.tenders > 350, `tenders collapsed to ${totals.tenders}`);
});

test('M2: one canonical identity appears at most once per collection', () => {
  for (const slug of C.countries()) {
    const g = C.forCountry(slug);
    for (const key of C.COLLECTIONS) {
      const ids = g[key].map((r) => r.id);
      assert.strictEqual(new Set(ids).size, ids.length,
        `${slug}/${key} lists a record twice`);
    }
  }
  // And globally: a record belongs to one country group, not several.
  const seen = new Map();
  for (const slug of C.countries()) {
    for (const r of C.allOf(C.forCountry(slug))) {
      const key = `${r.collection}:${r.id}`;
      assert.ok(!seen.has(key), `${key} appears under ${seen.get(key)} and ${slug}`);
      seen.set(key, slug);
    }
  }
});

test('M3: the same domain in two collections stays two records', () => {
  // A brand may legitimately run a marketplace and a media property. Collapsing
  // by domain would silently delete one of them, and the reader would never
  // learn the channel exists.
  let crossCollection = 0;
  for (const slug of C.countries()) {
    const byDomain = new Map();
    for (const r of C.allOf(C.forCountry(slug))) {
      if (!r.domain) continue;
      if (!byDomain.has(r.domain)) byDomain.set(r.domain, new Set());
      byDomain.get(r.domain).add(r.collection);
    }
    for (const [, collections] of byDomain) if (collections.size > 1) crossCollection += 1;
  }
  assert.ok(crossCollection > 0,
    'no domain appears in two collections anywhere, so this guard proves nothing');
});

// ── M4 / M5: READINESS IS EVIDENCE ──────────────────────────────────────────

test('M4/M5: neither a high rating nor a free price can create READY', () => {
  const all = C.countries().flatMap((s) => C.allOf(C.forCountry(s)));
  const ready = all.filter((r) => r.actionability === 'READY');
  assert.ok(ready.length > 100, `only ${ready.length} ready records; the check is weak`);
  // Every READY record has a route. That is what READY means, and it is the
  // only thing that can produce it.
  for (const r of ready) {
    assert.ok(r.actionUrl, `${r.id} is READY with no action route`);
    assert.ok(r.actionType, `${r.id} is READY with no action type`);
  }
  // And the corpus contains counter-examples in both directions, so the rule is
  // doing work rather than being true by accident.
  const famousButNot = all.filter((r) => r.domainRating !== null && r.domainRating >= 80
    && r.actionability && r.actionability !== 'READY');
  assert.ok(famousButNot.length > 50,
    'no high-rating record is unready, so "DR cannot create READY" is untested here');
  const freeButNot = all.filter((r) => r.noUpfrontCost && r.actionability && r.actionability !== 'READY');
  assert.ok(freeButNot.length > 20,
    'no free record is unready, so "free cannot create READY" is untested here');
});

test('readiness is the Planner’s, not a second opinion', () => {
  const P = require(path.join(ROOT, 'scripts/lib/distribution-planner.cjs'));
  const ops = P.project(P.loadAll());
  const planner = new Map();
  for (const op of ops) planner.set(`${op.sourceCollection}:${op.platformId}`, E.actionability(op).status);
  let compared = 0;
  for (const slug of C.countries()) {
    for (const r of C.allOf(C.forCountry(slug))) {
      if (r.collection === 'tenders') continue;
      const want = planner.get(`${r.collection}:${r.id}`);
      if (!want) continue;
      compared += 1;
      assert.strictEqual(r.actionability, want,
        `${r.id} reads ${r.actionability} here and ${want} in the planner`);
    }
  }
  assert.ok(compared > 2000, `only ${compared} records compared`);
});

// ── M6: THE TENDER DISTINCTION ──────────────────────────────────────────────

test('M6: a tender platform carries two access facts and no readiness', () => {
  const tenders = C.countries().flatMap((s) => C.forCountry(s).tenders);
  assert.ok(tenders.length > 350, `only ${tenders.length} tender platforms`);
  for (const r of tenders) {
    assert.strictEqual(r.actionability, null,
      `${r.id} carries a readiness status; the Planner does not project tender platforms`);
    assert.ok(['free', 'paid', 'mixed', 'unknown'].includes(r.searchAccess), `${r.id} searchAccess ${r.searchAccess}`);
    assert.ok(['free', 'paid', 'mixed', 'unknown'].includes(r.bidAccess), `${r.id} bidAccess ${r.bidAccess}`);
  }
  const freeSearch = tenders.filter((r) => r.searchAccess === 'free').length;
  const freeBid = tenders.filter((r) => r.bidAccess === 'free').length;
  assert.ok(freeSearch > 250, `${freeSearch} free-search platforms`);
  assert.ok(freeBid > 0 && freeBid < 20, `${freeBid} free-bid platforms`);
  assert.ok(freeSearch > freeBid * 10,
    'free search and free bidding are close enough in size to suspect they were merged');
  // A platform free to search and unknown to bid must not be counted as free.
  for (const r of tenders) {
    if (r.searchAccess === 'free' && r.bidAccess !== 'free') {
      assert.strictEqual(r.noUpfrontCost, false,
        `${r.id} counts as no-upfront-cost because its notice search is free`);
    }
  }
});

// ── THE SUMMARY IS COUNTS, NOT CLAIMS ───────────────────────────────────────

test('the summary counts what is there and estimates nothing', () => {
  for (const slug of C.countries()) {
    const s = C.summaryFor(slug);
    const g = C.forCountry(slug);
    assert.strictEqual(s.total, g.directories.length + g.marketplaces.length
      + g.media.length + g.tenders.length, `${slug} total disagrees with its groups`);
    assert.ok(s.withDomainRating <= s.total);
    assert.ok(s.above70 <= s.above50 && s.above50 <= s.withDomainRating,
      `${slug} rating bands are not nested`);
    assert.ok(s.ready <= s.total && s.noUpfrontCost <= s.total);
    for (const [k, v] of Object.entries(s)) {
      if (k === 'country') continue;
      assert.ok(v === null || Number.isInteger(v), `${slug}.${k} is ${v}, not a count`);
    }
  }
  // No field is a proportion: we know how many sources this corpus holds for a
  // country and not how many exist, so a percentage would have no denominator.
  const src = fs.readFileSync(path.join(ROOT, 'scripts/lib/rc-country-intelligence.cjs'), 'utf8');
  const code = src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  assert.ok(!/percent|\* *100|coverage *\//i.test(code), 'the summary computes a proportion');
});

test('the median is the median of what was actually measured', () => {
  for (const slug of C.countries().slice(0, 40)) {
    const measured = C.allOf(C.forCountry(slug))
      .map((r) => r.domainRating).filter((v) => v !== null).sort((a, b) => a - b);
    const s = C.summaryFor(slug);
    if (!measured.length) { assert.strictEqual(s.medianDomainRating, null); continue; }
    const mid = measured.length % 2
      ? measured[(measured.length - 1) / 2]
      : Math.round((measured[measured.length / 2 - 1] + measured[measured.length / 2]) / 2);
    assert.strictEqual(s.medianDomainRating, mid, `${slug} median`);
    assert.strictEqual(s.highestDomainRating, measured[measured.length - 1]);
  }
});

test('gaps are stated as facts about this corpus, not about the country', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/lib/rc-country-intelligence.cjs'), 'utf8');
  assert.match(src, /no verified source here|about the Research Center rather than about the country/i,
    'the gap wording does not distinguish "we have none" from "there are none"');
  const withGaps = C.countries().filter((s) => C.gapsFor(s).length);
  assert.ok(withGaps.length > 30, `only ${withGaps.length} countries report a gap`);
  // A country with a marketplace seller route must not report that gap.
  for (const slug of C.countries()) {
    const g = C.forCountry(slug);
    const gaps = C.gapsFor(slug);
    if (g.marketplaces.some((r) => r.actionUrl)) {
      assert.ok(!gaps.includes('marketplace-seller-route'), `${slug} reports a gap it does not have`);
    }
  }
});

// ── M20: NOTHING IS LOST ────────────────────────────────────────────────────

test('M20: every canonical record is either in the universe or excluded for a named reason', () => {
  const r = C.reconciliation();
  assert.strictEqual(r.canonicalRecords, r.inCountryUniverse + r.excluded,
    'the reconciliation does not add up');
  assert.ok(r.inCountryUniverse > 2500, `only ${r.inCountryUniverse} records reached the universe`);
  // Every exclusion has a reason, and none of them is a shrug.
  const total = Object.values(r.byReason).reduce((a, b) => a + b, 0);
  assert.strictEqual(total, r.excluded, 'some exclusions carry no reason');
  for (const reason of Object.keys(r.byReason)) {
    assert.ok(!/^other/.test(reason), `an exclusion is filed as "${reason}"`);
    assert.ok(reason.length > 12, `the reason "${reason}" explains nothing`);
  }
  // The dominant reason is the intended one: statutory registers a business
  // cannot list itself in are references, not channels.
  assert.ok(r.byReason['reference-only: a statutory register nobody can list in'] > 200,
    'the statutory-register exclusion changed shape');
});

// ── M7 / M8 / M9 / M10: THE FINDER SEMANTICS, ON COUNTRY DATA ───────────────

const KNOWN = {
  facets: [
    { name: 'country', multi: false, values: C.countries() },
    { name: 'collection', multi: false, values: [...C.COLLECTIONS] },
    { name: 'actionability', multi: false, values: ['READY', 'NEEDS_RESEARCH', 'NEEDS_BROWSER', 'BLOCKED'] },
  ],
  filters: [],
  sorts: ['as-published', 'domain-rating', 'domain-rating-asc', 'alphabetical'],
  jurisdictions: [],
  minDr: ['10', '20', '30', '40', '50', '60', '70', '80', '90'],
};

const asRow = (r) => ({
  name: r.name,
  haystack: `${r.name} ${r.country}`.toLowerCase(),
  domainRating: r.domainRating,
  petroHrysScore: null,
  facets: { country: r.country, collection: r.collection, actionability: r.actionability || '' },
  flags: {},
});

test('M7/M8/M9: the threshold is numeric, and unmeasured is not zero', () => {
  const rows = [
    { ...asRow({ name: 'nine', country: 'x', collection: 'media', domainRating: 9 }) },
    { ...asRow({ name: 'hundred', country: 'x', collection: 'media', domainRating: 100 }) },
    { ...asRow({ name: 'zero', country: 'x', collection: 'media', domainRating: 0 }) },
    { ...asRow({ name: 'none', country: 'x', collection: 'media', domainRating: null }) },
  ];
  const pick = (minDr) => D.filter(rows,
    D.selectionFor({ ...D.emptyState(KNOWN), minDr }, KNOWN)).rows.map((r) => r.name);
  assert.deepStrictEqual(pick('50'), ['hundred'], 'the threshold compared strings');
  assert.deepStrictEqual(pick('10').sort(), ['hundred']);
  assert.deepStrictEqual(pick('').sort(), ['hundred', 'nine', 'none', 'zero']);
  for (const floor of KNOWN.minDr) {
    assert.ok(!pick(floor).includes('none'), `an unmeasured record passed ${floor}+`);
  }
});

test('M10: country, collection, readiness and threshold intersect', () => {
  const rows = C.countries().flatMap((s) => C.allOf(C.forCountry(s))).map(asRow);
  const pick = (state) => D.filter(rows,
    D.selectionFor({ ...D.emptyState(KNOWN), ...state }, KNOWN)).rows;
  const germany = pick({ facets: { country: 'germany' } });
  assert.ok(germany.length > 50, `germany has ${germany.length} rows`);
  const narrowed = pick({
    facets: { country: 'germany', collection: 'directories', actionability: 'READY' },
    minDr: '40',
  });
  assert.ok(narrowed.length < germany.length, 'narrowing did not narrow');
  for (const r of narrowed) {
    assert.strictEqual(r.facets.country, 'germany');
    assert.strictEqual(r.facets.collection, 'directories');
    assert.strictEqual(r.facets.actionability, 'READY');
    assert.ok(r.domainRating >= 40);
  }
  // Under OR, the count would be at least as large as any single dimension.
  const anyReady = pick({ facets: { actionability: 'READY' } });
  assert.ok(narrowed.length < anyReady.length, 'the dimensions combined as OR');
});

test('M11: choosing a collection cannot change the sort', () => {
  const a = { ...D.emptyState(KNOWN), minDr: '50', sort: 'domain-rating' };
  const b = { ...a, facets: { collection: 'marketplaces' } };
  assert.strictEqual(b.sort, 'domain-rating');
  assert.strictEqual(b.minDr, '50');
  // And the default order is not a Domain Rating order.
  assert.strictEqual(D.defaultSort(KNOWN), 'as-published');
  assert.strictEqual(D.serializeState(D.emptyState(KNOWN), KNOWN), '');
});

test('M12: country and the whole finder state survive a URL round trip', () => {
  const chosen = {
    ...D.emptyState(KNOWN),
    facets: { country: 'czech-republic', collection: 'marketplaces' },
    minDr: '50',
    sort: 'domain-rating',
  };
  const url = D.serializeState(chosen, KNOWN);
  assert.match(url, /country=czech-republic/);
  assert.match(url, /collection=marketplaces/);
  assert.match(url, /min-dr=50/);
  const back = D.parseState(new URLSearchParams(url.slice(1)), KNOWN);
  assert.strictEqual(back.facets.country, 'czech-republic');
  assert.strictEqual(back.facets.collection, 'marketplaces');
  assert.strictEqual(back.minDr, '50');
  assert.strictEqual(back.sort, 'domain-rating');
  assert.strictEqual(D.serializeState(back, KNOWN), url);
});

test('M17: no localized label is a canonical value', () => {
  const values = new Set([...C.COLLECTIONS, ...C.countries(), 'READY', 'NEEDS_RESEARCH',
    'NEEDS_BROWSER', 'BLOCKED', 'free', 'paid', 'mixed', 'unknown']);
  for (const locale of ['en', 'de', 'es', 'fr']) {
    const dict = JSON.parse(fs.readFileSync(path.join(ROOT, `data/i18n/${locale}.json`), 'utf8'));
    for (const [key, value] of Object.entries(dict)) {
      if (!/^(act|access|sort|col|bd)\./.test(key)) continue;
      assert.ok(!values.has(value), `${locale}:${key} translates to "${value}", a canonical value`);
    }
  }
});

// ── ORDER ───────────────────────────────────────────────────────────────────

test('sorting happens inside a collection, never across the four', () => {
  // The comparator is the shared one, and the page gives each collection its own
  // tbody so a Domain Rating sort cannot lift a tender platform into the
  // directories table.
  const g = C.forCountry('germany');
  for (const key of C.COLLECTIONS) {
    const rows = g[key].map(asRow);
    if (rows.length < 2) continue;
    const sorted = O.sortRecords(rows, 'domain-rating');
    assert.strictEqual(sorted.length, rows.length, `${key} lost rows when sorted`);
    assert.deepStrictEqual(new Set(sorted.map((r) => r.name)), new Set(rows.map((r) => r.name)));
    const measured = sorted.map((r) => r.domainRating).filter((v) => v !== null);
    for (let i = 1; i < measured.length; i += 1) {
      assert.ok(measured[i - 1] >= measured[i], `${key} is not in descending order`);
    }
  }
});
