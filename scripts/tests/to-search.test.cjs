'use strict';

// Tender Discovery & Search v1 - search core guards.
//
// The core's job is to find things without inventing any. Most of these tests
// are about what it must REFUSE to do: convert a currency, resolve an
// unresolvable deadline, collapse a tri-state, or let an awarded contract
// appear among open opportunities.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const S = require('../lib/to-search.cjs');
const MATCH = require('../lib/to-match.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'scripts/lib/to-search.cjs'), 'utf8');
// Comments explain what the module refuses to do, so they mention the very
// words these tests scan for. Strip them before scanning for real code.
const CODE = SRC.replace(/^\s*\/\/.*$/gm, '');

// A small index whose every record is deliberate.
const rec = (over) => Object.assign({
  i: 'ted:1', s: 'OPEN', co: 'germany', pc: null, src: 'ted', pl: 'eu-ted',
  sch: 'CPV', es: null, doc: null, bc: false, cur: null, v: null, dl: 30,
  p: '2026-08-01', m: {}, t: 'supply of network switches', b: 'city of example',
  c: '32420000', l: 'network equipment', g: 'germany', d: '',
}, over);

const INDEX = { records: [
  rec({ i: 'ted:01' }),
  rec({ i: 'ted:02', t: 'construction of a school', c: '45000000', l: 'construction work', dl: 5 }),
  rec({ i: 'ted:03', s: 'AWARDED', t: 'network switches awarded' }),
  rec({ i: 'ted:04', s: 'CANCELLED', t: 'network switches cancelled' }),
  rec({ i: 'ted:05', s: 'CLOSED', t: 'network switches closed' }),
  rec({ i: 'ted:06', s: 'UPCOMING', t: 'future network works' }),
  rec({ i: 'ted:07', es: 'yes', t: 'electronic bids accepted' }),
  rec({ i: 'ted:08', es: 'no', t: 'paper only procedure' }),
  rec({ i: 'ted:09', cur: 'EUR', v: 100000, t: 'euro priced works' }),
  rec({ i: 'ted:10', cur: 'CZK', v: 2000000, t: 'koruna priced works' }),
  rec({ i: 'ted:11', dl: null, t: 'deadline not comparable works' }),
  rec({ i: 'ted:12', m: { telecom: 'STRONG' }, t: 'telecom cabling' }),
  rec({ i: 'ted:13', m: { telecom: 'GOOD' }, t: 'telecom adjacent' }),
  rec({ i: 'ted:14', bc: true, t: 'browser check needed' }),
  rec({ i: 'ted:15', co: 'france', pc: 'nigeria', src: 'worldbank', pl: 'wb-projects', t: 'project financed works' }),
] };

const run = (params) => S.search(INDEX, params);
const ids = (params) => run(params).results.map((x) => x.i);

// -- STATUS SAFETY ----------------------------------------------------------

test('awarded, cancelled and closed never appear in the default universe', () => {
  const seen = ids({});
  for (const forbidden of ['ted:03', 'ted:04', 'ted:05']) {
    assert.ok(!seen.includes(forbidden), `${forbidden} leaked into the default result set`);
  }
  // And not via a text query either.
  const queried = ids({ q: 'network switches' });
  for (const forbidden of ['ted:03', 'ted:04', 'ted:05']) {
    assert.ok(!queried.includes(forbidden), `${forbidden} leaked in through a query`);
  }
  // UPCOMING is current and distinct.
  assert.ok(seen.includes('ted:06'), 'upcoming was excluded from current');
  assert.strictEqual(run({ filters: { status: 'UPCOMING' } }).total, 1);
  // Historical states remain reachable only by asking for them explicitly.
  assert.deepStrictEqual(ids({ filters: { status: 'AWARDED' } }), ['ted:03']);
  // UNKNOWN status is not silently treated as open.
  assert.ok(!S.STATUS_CURRENT.UNKNOWN, 'UNKNOWN counts as current');
});

// -- TRI-STATE PRESERVATION -------------------------------------------------

test('unknown electronic submission is neither yes nor no', () => {
  const yes = ids({ filters: { esubmission: 'yes' } });
  const no = ids({ filters: { esubmission: 'no' } });
  const unknown = ids({ filters: { esubmission: 'unknown' } });
  assert.deepStrictEqual(yes, ['ted:07']);
  assert.deepStrictEqual(no, ['ted:08']);
  assert.ok(unknown.length > 2, 'the unknown cohort is empty; the tri-state collapsed');
  assert.ok(!unknown.includes('ted:07') && !unknown.includes('ted:08'));
  // The three cohorts partition the current universe exactly.
  assert.strictEqual(yes.length + no.length + unknown.length, run({}).total);
});

test('browser verification is a filter, not a validity judgement', () => {
  assert.deepStrictEqual(ids({ filters: { browserCheck: 'yes' } }), ['ted:14']);
  // A browser-check record is present in the ordinary result set: it is not
  // excluded as though it were untrustworthy.
  assert.ok(ids({}).includes('ted:14'));
});

// -- CURRENCY ---------------------------------------------------------------

test('values are never converted and never sorted across currencies', () => {
  assert.ok(!/\brates?\b|\bconvert|\bexchange\b|toEUR|toUSD|\bfx\b/i.test(CODE),
    'the search core references currency conversion');
  // Sorting by value without a currency is refused, loudly, and falls back.
  const r = run({ sort: 'value' });
  assert.notStrictEqual(r.sort, 'value', '2,000,000 CZK was ranked against 100,000 EUR');
  assert.ok(r.notices.includes('VALUE_SORT_REQUIRES_CURRENCY'), 'the refusal was silent');
  // Scoped to one currency it is allowed.
  const scoped = run({ sort: 'value', filters: { currency: 'EUR' } });
  assert.strictEqual(scoped.sort, 'value');
  assert.deepStrictEqual(scoped.results.map((x) => x.i), ['ted:09']);
});

// -- DEADLINES --------------------------------------------------------------

test('an unresolvable deadline is never given a date', () => {
  // Excluded from a deadline window rather than guessed into it.
  const within7 = ids({ filters: { deadlineDays: 7 } });
  assert.deepStrictEqual(within7, ['ted:02']);
  assert.ok(!within7.includes('ted:11'), 'a null deadline entered a 7-day window');
  // Sorted last, not first, and not with a fabricated value.
  assert.strictEqual(ids({ sort: 'deadline' }).at(-1), 'ted:11',
    'the uncomparable deadline was not sorted last');
});

// -- PROFILE MATCHING IS BORROWED, NOT REIMPLEMENTED ------------------------

test('match bands come from the matching engine, not from this module', () => {
  // No thresholds of its own.
  assert.ok(!/>=\s*(65|80|50|35)\b/.test(CODE), 'the search core defines its own match thresholds');
  assert.ok(!/PROFILE_CLASSIFICATIONS|categoryScore/.test(CODE), 'the search core reimplements matching');
  assert.deepStrictEqual(ids({ filters: { profile: 'telecom' } }), ['ted:12', 'ted:13']);
  assert.deepStrictEqual(ids({ filters: { profile: 'telecom', matchBand: 'STRONG' } }), ['ted:12']);
  // And the engine itself is untouched.
  assert.deepStrictEqual(MATCH.WEIGHTS,
    { category: 40, geography: 20, actionability: 15, deadline: 15, confidence: 10 });
  assert.strictEqual(Object.keys(MATCH.PROFILES).length, 16);
});

test('no industry fact is invented from a query or a code', () => {
  assert.ok(!/industry\s*[:=]/.test(CODE), 'the search core assigns an industry');
  for (const r of INDEX.records) assert.ok(!('industry' in r), 'an index record carries an industry field');
});

// -- SEARCH RELEVANCE -------------------------------------------------------

test('relevance is a separate signal from profile match', () => {
  // A query that matches a title strongly on a record with no profile match.
  const r = run({ q: 'construction school' });
  assert.strictEqual(r.results[0].i, 'ted:02');
  assert.deepStrictEqual(r.results[0].m, {}, 'the fixture is not actually profile-less');
  // The two are never combined into one exposed number.
  assert.ok(!('score' in r), 'a single blended score is exposed');
  assert.ok(r.results.every((x) => typeof x._r === 'number'));
});

test('title matches outrank description-only matches, and codes outrank both', () => {
  const idx = { records: [
    rec({ i: 'a', t: 'roof works', d: '' }),
    rec({ i: 'b', t: 'unrelated procedure', d: 'roof works mentioned in passing' }),
    rec({ i: 'c', t: 'unrelated procedure', d: '', c: '45261000' }),
  ] };
  assert.strictEqual(S.search(idx, { q: 'roof works' }).results[0].i, 'a',
    'a description hit outranked a title hit');
  assert.strictEqual(S.search(idx, { q: '45261000' }).results[0].i, 'c');
  assert.ok(S.WEIGHTS.code > S.WEIGHTS.title && S.WEIGHTS.title > S.WEIGHTS.description);
});

test('a quoted phrase is matched per field, not against a concatenated blob', () => {
  // Regression: scoreRecord read a pre-concatenated all-text field that the
  // index does not carry, so any quoted phrase absent from the title threw
  // instead of searching. The blob also doubled the index (9.31 MB vs 4.07 MB).
  for (const r of INDEX.records) assert.ok(!('a' in r), 'the index carries a concatenated blob again');
  assert.doesNotThrow(() => S.search(INDEX, { q: '"city of example"' }));
  // A phrase in the buyer still scores, below a phrase in the title.
  assert.ok(S.search(INDEX, { q: '"city of example"' }).total > 0, 'a buyer phrase found nothing');
  const idx = { records: [
    rec({ i: 'a', t: 'roof works package', b: 'unrelated buyer' }),
    rec({ i: 'b', t: 'unrelated procedure', b: 'roof works authority' }),
  ] };
  assert.strictEqual(S.search(idx, { q: '"roof works"' }).results[0].i, 'a');
  assert.ok(S.WEIGHTS.phraseTitle > S.WEIGHTS.phraseAny);
  // An adjacency the phrase does not actually have is not a hit.
  assert.strictEqual(S.search(idx, { q: '"works roof"' }).total, 0, 'word order was ignored');
});

test('buyer and classification-label search work', () => {
  assert.ok(S.search(INDEX, { q: 'city of example' }).total > 0, 'buyer search found nothing');
  assert.ok(S.search(INDEX, { q: 'network equipment' }).total > 0, 'label search found nothing');
});

test('query normalization folds diacritics and case but preserves codes', () => {
  assert.strictEqual(S.normalize('Ingenierie'), 'ingenierie');
  assert.strictEqual(S.normalize('Ïngénierie'), 'ingenierie');
  assert.strictEqual(S.normalize('CPV 45000000-7'), 'cpv 45000000 7');
  // A code is not split into digits.
  assert.ok(S.parseQuery('45000000').terms.includes('45000000'));
  // Single characters are dropped: they match nearly everything.
  assert.deepStrictEqual(S.parseQuery('a b telecom').terms, ['telecom']);
});

// -- HOSTILE INPUT ----------------------------------------------------------

test('hostile query input is bounded and never reflected', () => {
  const nasty = ['<script>alert(1)</script>', '".*(a+)+$"', ' control', '中文招标',
    'مناقصة', "'; DROP TABLE--", '%%%%', 'a'.repeat(5000)];
  for (const q of nasty) {
    const r = S.search(INDEX, { q });
    assert.ok(Number.isFinite(r.total), `query "${q.slice(0, 20)}" broke the search`);
    // Nothing hostile survives normalization into a term.
    for (const t of S.parseQuery(q).terms) {
      assert.ok(!/[<>&"'`]/.test(t), `a markup character survived into a term: ${t}`);
    }
  }
  // Bounded work regardless of input length.
  assert.ok(S.parseQuery('x '.repeat(5000)).terms.length <= 12, 'term count is unbounded');
  assert.ok(S.parseQuery('a'.repeat(10000)).terms.every((t) => t.length <= 200));
  assert.ok(S.parseQuery('"' + 'z '.repeat(500) + '"').phrases.length <= 3, 'phrase count is unbounded');
});

test('invalid or unknown query state fails safely', () => {
  const known = { countries: ['germany'], profiles: ['telecom'], sources: ['ted'], currencies: ['EUR'] };
  const st = S.parseState(new URLSearchParams(
    'status=NOPE&country=atlantis&profile=wizard&source=hack&page=-5&sort=magic&unknownKey=1&currency=XXX',
  ), known);
  assert.strictEqual(st.filters.status, undefined, 'an invalid enum was accepted');
  assert.strictEqual(st.filters.country, undefined, 'an unknown country was accepted');
  assert.strictEqual(st.filters.profile, undefined);
  assert.strictEqual(st.filters.source, undefined);
  assert.strictEqual(st.filters.currency, undefined);
  assert.strictEqual(st.sort, 'relevance', 'an invalid sort was accepted');
  assert.strictEqual(st.page, 1, 'a negative page was accepted');
  assert.ok(!('unknownKey' in st.filters), 'an unknown parameter entered the state');
  // Page beyond the result count clamps rather than erroring or emptying.
  const r = run({ page: 9999 });
  assert.strictEqual(r.page, r.pages);
  assert.ok(r.results.length > 0, 'an overflowing page returned nothing');
});

test('duplicate parameters resolve deterministically', () => {
  const known = { countries: ['germany', 'france'] };
  const qs = 'country=germany&country=france';
  const a = S.parseState(new URLSearchParams(qs), known);
  const b = S.parseState(new URLSearchParams(qs), known);
  assert.strictEqual(a.filters.country, b.filters.country, 'duplicate parameters are ambiguous');
  assert.strictEqual(a.filters.country, 'germany', 'the first value should win');
});

// -- URL STATE --------------------------------------------------------------

test('search state round-trips through the URL deterministically', () => {
  const known = { countries: ['germany'], profiles: ['telecom'], sources: ['ted'], currencies: ['EUR'] };
  const state = {
    q: 'telecom cabling',
    filters: { country: 'germany', profile: 'telecom', matchBand: 'STRONG', deadlineDays: 30, esubmission: 'yes' },
    sort: 'deadline',
    page: 3,
  };
  const qs = S.serializeState(state);
  const back = S.parseState(new URLSearchParams(qs.slice(1)), known);
  assert.strictEqual(back.q, state.q);
  assert.strictEqual(back.sort, 'deadline');
  assert.strictEqual(back.page, 3);
  assert.strictEqual(back.filters.country, 'germany');
  assert.strictEqual(back.filters.deadlineDays, 30);
  // Serialization is key-ordered, so the same state is always the same URL.
  assert.strictEqual(S.serializeState(state), qs);
  // Defaults are omitted rather than written out.
  assert.strictEqual(S.serializeState({ q: '', filters: {}, sort: 'relevance', page: 1 }), '');
});

// -- PAGINATION -------------------------------------------------------------

test('pagination has no gaps, no overlap, and is stable', () => {
  const many = { records: Array.from({ length: 120 },
    (_, n) => rec({ i: `ted:${String(n).padStart(4, '0')}`, dl: n })) };
  const seen = [];
  const pages = S.search(many, {}).pages;
  for (let p = 1; p <= pages; p += 1) seen.push(...S.search(many, { page: p }).results.map((x) => x.i));
  assert.strictEqual(seen.length, 120, 'pages do not cover the result set');
  assert.strictEqual(new Set(seen).size, 120, 'a record appeared on two pages');
  // Stable across identical calls.
  assert.deepStrictEqual(S.search(many, { page: 2 }).results.map((x) => x.i),
    S.search(many, { page: 2 }).results.map((x) => x.i));
});

test('ordering is deterministic and independent of input order', () => {
  const shuffled = { records: INDEX.records.slice().reverse() };
  for (const sort of ['relevance', 'deadline', 'published']) {
    assert.deepStrictEqual(ids({ sort }), S.search(shuffled, { sort }).results.map((x) => x.i),
      `${sort} ordering depends on array order`);
  }
  // Ties break on id, never on arrival.
  const tied = { records: [rec({ i: 'ted:b', dl: 5 }), rec({ i: 'ted:a', dl: 5 })] };
  assert.deepStrictEqual(S.search(tied, { sort: 'deadline' }).results.map((x) => x.i), ['ted:a', 'ted:b']);
});

// -- GEOGRAPHY --------------------------------------------------------------

test('buyer country and project country are not conflated', () => {
  assert.deepStrictEqual(ids({ filters: { projectCountry: 'nigeria' } }), ['ted:15']);
  // The same record's buyer country is france, so filtering buyers by nigeria
  // must not match it.
  assert.strictEqual(run({ filters: { country: 'nigeria' } }).total, 0,
    'project country leaked into the buyer-country filter');
  assert.deepStrictEqual(ids({ filters: { country: 'france' } }), ['ted:15']);
});

test('source and platform filters are distinct facts', () => {
  assert.strictEqual(run({ filters: { source: 'worldbank' } }).total, 1);
  assert.strictEqual(run({ filters: { platform: 'eu-ted' } }).total, run({}).total - 1);
});

// -- THE MODULE ITSELF ------------------------------------------------------

test('the search core is environment-neutral and network-free', () => {
  assert.ok(!/\bfetch\s*\(|require\(|XMLHttpRequest/.test(CODE),
    'the search core reaches the network or depends on a module system');
  assert.match(SRC, /typeof module === 'object' && module\.exports/, 'not a UMD module');
  // One implementation: it must be shippable to the browser unchanged.
  assert.ok(!/process\.|__dirname|\bfs\./.test(CODE), 'the search core depends on Node');
});

// ── REGRESSIONS FROM THE RELEVANCE AUDIT ────────────────────────────────────
//
// Seven defects the audit found by reading real results rather than fixtures.
// Each fix is a general rule; each test states the rule and the number that
// exposed it.

test('a term matches at a token start, never inside a word', () => {
  const idx = { records: [
    rec({ i: 'a', t: 'ice control services' }),
    rec({ i: 'b', t: 'catering services for the office', l: '', c: '' }),
    rec({ i: 'c', t: 'police vehicle maintenance', l: '', c: '' }),
    rec({ i: 'd', t: 'construction of a bridge', l: '', c: '' }),
  ] };
  // "ice" matched servICEs, offICE and polICE — 3,994 of 6,964 real records.
  assert.deepStrictEqual(S.search(idx, { q: 'ice' }).results.map((x) => x.i), ['a']);
  // But a genuine prefix still matches, so "construct" finds "construction".
  assert.deepStrictEqual(S.search(idx, { q: 'construct' }).results.map((x) => x.i), ['d']);
});

test('a partial code does not earn the exact-code weight', () => {
  const idx = { records: [
    rec({ i: 'exact', c: '45', t: 'unrelated' }),
    rec({ i: 'longer', c: '45000000 45220000', t: 'unrelated' }),
  ] };
  // "45" scored the full 40 points against 45000000 and 33645000 alike: 906
  // records matched, not one of which carried the code 45.
  const hits = S.search(idx, { q: '45' }).results.map((x) => x.i);
  assert.deepStrictEqual(hits, ['exact'], 'a substring of a longer code still matches');
  // The full code still matches exactly.
  assert.deepStrictEqual(S.search(idx, { q: '45000000' }).results.map((x) => x.i), ['longer']);
});

test('an expired deadline never outranks a live one', () => {
  const idx = { records: [
    rec({ i: 'expired-long', t: 'roof works', dl: -86 }),
    rec({ i: 'expired-recent', t: 'roof works', dl: -1 }),
    rec({ i: 'live', t: 'roof works', dl: 30 }),
    rec({ i: 'closing', t: 'roof works', dl: 1 }),
    rec({ i: 'undated', t: 'roof works', dl: null }),
  ] };
  // Sorting on the raw number put the MOST expired notice first.
  for (const sort of ['relevance', 'deadline']) {
    assert.deepStrictEqual(S.search(idx, { q: 'roof works', sort }).results.map((x) => x.i),
      ['closing', 'live', 'expired-recent', 'expired-long', 'undated'],
      `${sort}: expired notices are not ordered after live ones`);
  }
});

test('an inherited prototype key is not a supplier profile', () => {
  const idx = { records: [rec({ i: 'a', m: {} }), rec({ i: 'b', m: { telecom: 'STRONG' } })] };
  // rec.m comes from JSON.parse, so rec.m['__proto__'] is truthy and every
  // record answered to a profile nobody defined.
  for (const bogus of ['__proto__', 'constructor', 'toString', 'valueOf']) {
    assert.strictEqual(S.search(idx, { filters: { profile: bogus } }).total, 0,
      `profile "${bogus}" matched records`);
  }
  assert.strictEqual(S.search(idx, { filters: { profile: 'telecom' } }).total, 1);
});

test('a classification scheme filter is equality, not substring', () => {
  const idx = { records: [rec({ i: 'a', sch: 'CPV' }), rec({ i: 'b', sch: 'UNSPSC' })] };
  assert.strictEqual(S.search(idx, { filters: { scheme: 'C' } }).total, 0, '"C" matched CPV and UNSPSC');
  assert.strictEqual(S.search(idx, { filters: { scheme: 'SP' } }).total, 0, '"SP" matched UNSPSC');
  assert.strictEqual(S.search(idx, { filters: { scheme: 'CPV' } }).total, 1);
  assert.strictEqual(S.search(idx, { filters: { scheme: 'UNSPSC' } }).total, 1);
});

test('an unknown sort is not echoed back as though it were honoured', () => {
  for (const bad of ['__proto__', 'magic', 'DROP TABLE']) {
    const r = S.search(INDEX, { sort: bad });
    assert.strictEqual(r.sort, 'relevance', `"${bad}" was reported back as the sort`);
  }
  assert.strictEqual(S.search(INDEX, { sort: 'deadline' }).sort, 'deadline');
});

test('hydration restores the defaults the serializer omits', () => {
  // The published artifact drops false, null and default values to save bytes.
  const raw = { records: [{ i: 'x', ti: 'Title', s: 'OPEN' }] };
  const h = S.hydrate(raw).records[0];
  assert.deepStrictEqual(h.m, {}, 'a record with no bands hydrates without a band map');
  assert.strictEqual(h.bc, false);
  assert.strictEqual(h.ms, false);
  assert.strictEqual(h.oc, 1);
  assert.strictEqual(h.dl, null, 'an omitted deadline hydrates as undefined rather than null');
  assert.strictEqual(h.doc, null);
  assert.strictEqual(h.t, 'title', 'the title was not normalized for search');
  assert.strictEqual(h.ti, 'Title', 'hydration overwrote the original title');
  // Idempotent.
  const before = JSON.stringify(h);
  S.hydrate(raw);
  assert.strictEqual(JSON.stringify(raw.records[0]), before, 'hydration is not idempotent');
});
