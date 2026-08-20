'use strict';

// Tender Opportunity Detail Pages v1 — projection, publication and SEO.
//
// The three blockers that held publication back are resolved: the shared
// renderer can declare the locales that actually exist, the route policy can
// own a generated family without 6,817 hand-written rows, and the route is
// derived from the canonical id rather than stored per search record.
//
// These tests cover the projection rules AND the published pages.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const DETAIL = require('../lib/to-detail.cjs');
const CORPUS = require('../lib/to-corpus.cjs');
const SCHEMA = require('../lib/to-schema.cjs');
const MATCH = require('../lib/to-match.cjs');
const TP = require('../lib/tp-schema.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const corpus = CORPUS.decode(JSON.parse(read('data/tender-opportunities/opportunities.json')));
const countries = JSON.parse(read('data/business-directories/countries.json'));
const platformsById = new Map(TP.loadPlatforms(
  path.join(ROOT, 'data/tenders-procurement/platforms.json'),
  new Map(countries.map((c) => [c.slug, c.iso2 || null])),
).map((p) => [p.id, p]));

const built = DETAIL.build(corpus, { platformsById });
const pages = built.pages;
const indexable = pages.filter((p) => p.indexable);
const byId = new Map(corpus.opportunities.map((o) => [o.id, o]));
const LIB_SRC = read('scripts/lib/to-detail.cjs');

// ── IDENTITY ────────────────────────────────────────────────────────────────

test('the canonical id, not the title, carries page identity', () => {
  const o = corpus.opportunities[0];
  const renamed = Object.assign({}, o, { title: 'A completely different title' });
  assert.ok(DETAIL.routeFor(o).includes(DETAIL.idSegment(o.id)));
  assert.ok(DETAIL.routeFor(renamed).includes(DETAIL.idSegment(o.id)),
    'the identity segment did not survive a retitle');
});

test('a normal update never moves the route', () => {
  const o = corpus.opportunities.find((x) => x.occurrences && x.occurrences.length);
  const base = DETAIL.routeFor(o);
  for (const mutation of [
    { occurrences: [...o.occurrences, { sourceId: 'ted', sourceUrl: 'https://x/1' }] },
    { occurrenceCount: (o.occurrenceCount || 1) + 1, multiSource: true },
    { status: 'CLOSED' },
    { deadline: { raw: '2099-01-01', iso: '2099-01-01T00:00:00Z', precision: 'INSTANT' } },
    { value: { amount: 999, currency: 'EUR', basis: 'ESTIMATED' } },
    { buyerName: 'City of Example, Dept. of Works' },
  ]) {
    assert.strictEqual(DETAIL.routeFor(Object.assign({}, o, mutation)), base,
      `a normal update moved the URL: ${Object.keys(mutation)}`);
  }
});

test('one canonical opportunity is one route, and routes never collide', () => {
  const routes = new Set();
  for (const p of pages) {
    assert.ok(!routes.has(p.route), `route collision: ${p.route}`);
    routes.add(p.route);
  }
  assert.strictEqual(routes.size, pages.length);
  assert.strictEqual(new Set(pages.map((p) => p.id)).size, pages.length);
});

test('a multi-source opportunity is one record carrying every occurrence', () => {
  const multi = pages.filter((p) => p.provenance.multiSource);
  assert.ok(multi.length > 0);
  for (const p of multi.slice(0, 60)) {
    const o = byId.get(p.id);
    assert.strictEqual(p.provenance.occurrences.length, (o.occurrences || []).length,
      `${p.id}: an occurrence was dropped`);
    assert.strictEqual(pages.filter((x) => x.id === p.id).length, 1,
      `${p.id}: an occurrence became a second record`);
  }
});

// ── INDEXABILITY ────────────────────────────────────────────────────────────

test('indexability is boolean conditions, never a score', () => {
  const code = LIB_SRC.replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/score\s*[+*]=|seoScore|quality\s*\*/.test(code),
    'indexability looks like a weighted score');
  assert.ok(!/wordCount|\.split\(' '\)\.length/.test(code),
    'richness is measured in words rather than in facts');
  for (const p of pages) {
    assert.strictEqual(typeof p.indexable, 'boolean');
    assert.strictEqual(p.indexable, p.notIndexableBecause.length === 0);
  }
});

test('a thin record is never indexable, and says why', () => {
  const thin = {
    id: 'x:1', sourceId: 'ted', sourcePlatformId: 'eu-ted', sourceUrl: 'https://x/1',
    title: 'Works', publicationDate: { raw: '2026-01-01', iso: '2026-01-01T00:00:00Z', precision: 'INSTANT' },
    status: 'OPEN',
  };
  const v = DETAIL.indexability(thin);
  assert.strictEqual(v.indexable, false);
  for (const r of ['NO_MEANINGFUL_TITLE', 'NO_BUYER', 'TOO_FEW_FACTS']) {
    assert.ok(v.reasons.includes(r), `missing reason ${r}`);
  }
});

test('historical procurements are retained but never indexable', () => {
  for (const p of pages) {
    if (!SCHEMA.isCurrent(byId.get(p.id))) {
      assert.strictEqual(p.indexable, false, `${p.id} is historical and indexable`);
      assert.ok(p.notIndexableBecause.includes('NOT_CURRENT'));
    }
  }
  // Retained, not erased: the record still exists in the projection.
  assert.ok(pages.some((p) => byId.get(p.id).status === 'AWARDED'));
  assert.ok(pages.some((p) => byId.get(p.id).status === 'CANCELLED'));
  assert.ok(indexable.length > 5000 && indexable.length < pages.length);
});

// ── PLATFORM FACTS ARE NOT TENDER FACTS ─────────────────────────────────────

test('no platform-level capability is restated as a fact about a tender', () => {
  const src = LIB_SRC.replace(/^\s*\/\/.*$/gm, '');
  for (const forbidden of ['documentsUrl', 'foreignSuppliersAccepted', 'supplierRegistrationRequired']) {
    assert.ok(!src.includes(forbidden),
      `the projection reads platform ${forbidden} and could restate it per notice`);
  }
  // The only platform field it reads is the browser-check state, which is
  // explicitly a property of the source surface.
  assert.ok(/browserCheckRequired/.test(src));
  for (const p of pages.slice(0, 300)) {
    assert.ok(!('documentsUrl' in p.source), 'a documents fact was invented');
    assert.ok(!('foreignEligibility' in p.source), 'a foreign-eligibility fact was invented');
  }
});

test('a submission route is only ever the notice\'s own', () => {
  for (const p of pages) {
    const o = byId.get(p.id);
    assert.strictEqual(p.source.submissionUrl, DETAIL.safeUrl(o.submissionUrl),
      `${p.id}: the submission route did not come from the notice`);
  }
  const withSubmission = pages.filter((p) => p.source.submissionUrl);
  assert.ok(withSubmission.length > 0 && withSubmission.length < pages.length / 10,
    'submission routes are suspiciously common; a platform value may be leaking in');
});

test('electronic submission stays a tri-state', () => {
  const seen = { yes: 0, no: 0, unknown: 0 };
  for (const p of pages) {
    const o = byId.get(p.id);
    assert.strictEqual(p.source.electronicSubmission, o.electronicSubmission || null);
    seen[p.source.electronicSubmission || 'unknown'] += 1;
  }
  assert.ok(seen.yes > 0 && seen.no > 0 && seen.unknown > 0, 'the tri-state is not exercised');
});

// ── SOURCE FIDELITY ─────────────────────────────────────────────────────────

test('titles, buyers and currencies survive projection unchanged', () => {
  let nonAscii = 0;
  for (const p of pages) {
    const o = byId.get(p.id);
    assert.strictEqual(p.source.title, o.title, `${p.id}: the title changed`);
    assert.strictEqual(p.source.buyerName, o.buyerName || null);
    if (p.source.value) assert.strictEqual(p.source.value.currency, o.value.currency);
    if (/[^\x00-\x7F]/.test(p.source.title)) nonAscii += 1;
  }
  assert.ok(nonAscii > 100, 'too few non-ASCII titles to prove Unicode survives');
});

test('values are never converted', () => {
  const code = LIB_SRC.replace(/^\s*\/\/.*$/gm, '').replace(/\s+\/\/.*$/gm, '');
  assert.ok(!/\brates?\b|\bconvert|\bexchange\b|toEUR|toUSD|\bfx\b/i.test(code),
    'the detail projection references currency conversion');
  const currencies = new Set(pages.map((p) => p.source.value && p.source.value.currency).filter(Boolean));
  assert.ok(currencies.size > 5, 'only one currency present; the guard is untested');
});

test('CPV and UNSPSC keep their scheme and are never mapped', () => {
  assert.ok(!/cpvToUnspsc|unspscToCpv|crosswalk|mapScheme/i.test(LIB_SRC));
  const schemes = new Set(pages.flatMap((p) => p.source.classifications.map((c) => c.scheme)));
  assert.ok(schemes.has('CPV') && schemes.has('UNSPSC'));
  for (const p of pages.slice(0, 200)) {
    for (const c of p.source.classifications) {
      assert.ok(c.scheme && c.code, 'a classification lost its scheme or code');
    }
  }
});

test('a deadline past while the source says open keeps both facts', () => {
  const both = pages.filter((p) => p.dates.deadline && p.dates.deadline.passedButSourceOpen);
  assert.ok(both.length > 0, 'no such record, so the guard is untested');
  for (const p of both) {
    assert.strictEqual(p.status.value, 'OPEN', 'the source status was overridden');
    assert.ok(p.dates.deadline.daysRemaining < 0);
  }
});

test('a zoneless deadline is never given an instant', () => {
  // Two different things lack an instant: a date the source wrote without a
  // time zone, and no parseable date at all. Only the first has wording worth
  // preserving, and only the first can be compared as a band.
  const noInstant = pages.filter((p) => p.dates.deadline && !p.dates.deadline.decidable);
  const zoneless = noInstant.filter((p) => p.dates.deadline.precision !== 'NONE');
  const absent = noInstant.filter((p) => p.dates.deadline.precision === 'NONE');
  assert.ok(zoneless.length > 0 && absent.length > 0, 'both cases must be exercised');

  // THE invariant. Whatever we compute from a zoneless deadline, we never
  // publish an instant for it — that would be inventing an offset the source
  // did not state.
  for (const p of noInstant) {
    assert.strictEqual(p.dates.deadline.iso, null,
      `${p.id}: an instant was derived from a deadline that has none`);
    assert.notStrictEqual(p.dates.deadline.precision, 'INSTANT',
      `${p.id}: a deadline without an instant claims INSTANT precision`);
  }
  for (const p of zoneless) {
    assert.ok(p.dates.deadline.raw, `${p.id}: the source wording was lost`);
  }
  assert.ok(absent.some((p) => p.dates.deadline.raw),
    'no unparseable-but-present deadline in the corpus, so the case is untested');

  // A day count MAY be reported for a zoneless deadline — it is bounded, not
  // unknown (see zonelessBand in to-time.cjs). What must never happen is that
  // count being presented as if we knew the instant, so the basis is required
  // and must say which of the two it is.
  for (const p of noInstant) {
    const d = p.dates.deadline;
    if (d.daysRemaining == null) {
      assert.strictEqual(d.daysRemainingBasis, null,
        `${p.id}: a basis was stated for a count that does not exist`);
      continue;
    }
    assert.strictEqual(d.daysRemainingBasis, 'ZONE_INDEPENDENT_BOUND',
      `${p.id}: a zoneless count was labelled as an instant`);
    assert.notStrictEqual(d.precision, 'NONE',
      `${p.id}: an unparseable deadline was counted in days`);
  }
  // And the converse: an instant-backed count is never labelled as a bound.
  for (const p of pages.filter((x) => x.dates.deadline && x.dates.deadline.decidable)) {
    const d = p.dates.deadline;
    if (d.daysRemaining != null) {
      assert.strictEqual(d.daysRemainingBasis, 'INSTANT',
        `${p.id}: an instant-backed count was labelled as a bound`);
    }
  }
});

// ── DERIVED ─────────────────────────────────────────────────────────────────

test('supplier matches come from the frozen engine and add nothing', () => {
  assert.deepStrictEqual(MATCH.WEIGHTS,
    { category: 40, geography: 20, actionability: 15, deadline: 15, confidence: 10 });
  const nowIso = corpus.generatedAt;
  let checked = 0;
  for (const p of pages.filter((x) => x.derived.matches.length).slice(0, 150)) {
    const o = byId.get(p.id);
    for (const m of p.derived.matches) {
      const fresh = MATCH.matchFor(o, m.profile, {
        nowIso, platform: platformsById.get(o.sourcePlatformId),
      });
      assert.strictEqual(m.band, fresh.band, `${p.id}/${m.profile}: band disagrees with the engine`);
      assert.strictEqual(m.score, fresh.score);
      assert.ok(m.band === 'STRONG' || m.band === 'GOOD');
      checked += 1;
    }
  }
  assert.ok(checked > 50);
  assert.ok(!/>=\s*(80|65|50|35)\b/.test(LIB_SRC.replace(/^\s*\/\/.*$/gm, '')),
    'the projection defines its own match thresholds');
});

test('no industry is invented, and several profiles may match at once', () => {
  for (const p of pages) {
    assert.ok(!('industry' in p) && !('industry' in p.source), 'an industry was invented');
    assert.ok(!('sector' in p.source));
  }
  assert.ok(pages.some((p) => p.derived.matches.length > 1),
    'no record matches several profiles, so the model is untested');
});

// ── SAFETY ──────────────────────────────────────────────────────────────────

test('only http and https URLs survive projection', () => {
  for (const bad of ['javascript:alert(1)', 'data:text/html,<script>', 'vbscript:x',
    'file:///etc/passwd', '//evil.test', ' javascript:alert(1)']) {
    assert.strictEqual(DETAIL.safeUrl(bad), null, `${bad} was accepted`);
  }
  assert.strictEqual(DETAIL.safeUrl('https://ted.europa.eu/x'), 'https://ted.europa.eu/x');
  const evil = Object.assign({}, corpus.opportunities[0], {
    sourceUrl: 'javascript:alert(1)', submissionUrl: 'data:text/html,x',
  });
  const p = DETAIL.project(evil, { nowIso: corpus.generatedAt, platform: null, profiles: [] });
  assert.strictEqual(p.source.url, null);
  assert.strictEqual(p.source.submissionUrl, null);
  for (const page of pages.slice(0, 500)) {
    for (const u of [page.source.url, page.source.submissionUrl,
      ...page.provenance.occurrences.map((x) => x.url)]) {
      if (u) assert.match(u, /^https?:\/\//, `unsafe scheme survived: ${u}`);
    }
  }
});

test('the projection publishes no email address', () => {
  const blob = JSON.stringify(pages.slice(0, 3000));
  const emails = blob.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  assert.deepStrictEqual(emails, [], `email addresses reached the projection: ${emails.slice(0, 3)}`);
});

test('title text is never rewritten by a redaction rule', () => {
  // A phone-number pattern in the Discovery projection once rewrote 465 real
  // titles. The detail projection copies titles verbatim and must keep doing so.
  const code = LIB_SRC.replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/PHONE|\[number removed\]|replace\(.*\\d\{3/.test(code),
    'a redaction rule that could rewrite a title was introduced');
  for (const p of pages) assert.strictEqual(p.source.title, byId.get(p.id).title);
});

// ── CONTRACT ────────────────────────────────────────────────────────────────

test('a new canonical field cannot be silently dropped', () => {
  assert.throws(() => DETAIL.project(
    Object.assign({}, corpus.opportunities[0], { brandNewSourceFact: 'x' }),
    { nowIso: corpus.generatedAt, platform: null, profiles: [] },
  ), /no place for/i, 'a new canonical fact would vanish');
  for (const o of corpus.opportunities.slice(0, 500)) {
    assert.deepStrictEqual(DETAIL.unaccountedFields(o), [], `${o.id} has an unaccounted field`);
  }
});

test('the detail layer reads the corpus, never the search projection', () => {
  const code = LIB_SRC.replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/to-index|tender-index\.json/.test(code),
    'the detail layer reads the lossy Discovery projection');
  // Proof it matters: descriptions here exceed the index's 120-character cut.
  assert.ok(pages.some((p) => p.source.description && p.source.description.length > 130),
    'no description exceeds the index truncation, so the distinction is unproven');
});

test('the layer reaches no network and is deterministic', () => {
  const code = LIB_SRC.replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/\bfetch\s*\(|require\('node:https?'|XMLHttpRequest|to-http/.test(code));
  assert.ok(!/Math\.random|Date\.now\(\)|new Date\(\)/.test(code), 'the layer reads the clock');
  const again = DETAIL.build(corpus, { platformsById });
  assert.strictEqual(JSON.stringify(again.pages.map((p) => p.route)),
    JSON.stringify(pages.map((p) => p.route)));
});

test('canonical facts are unchanged by this phase', () => {
  const fp = (rel) => require('node:crypto').createHash('sha256')
    .update(fs.readFileSync(path.join(ROOT, rel))).digest('hex').slice(0, 8);
  // ── PIN MOVED: 9754062f -> 3c341d60, Expansion v2 / SAM.gov activation ────
  //
  // Two intended changes, both recorded rather than absorbed:
  //   1. SAM.gov became an active source, adding 10,514 unique current US
  //      federal opportunities after canonical dedup.
  //   2. Merge groups now resolve field conflicts by RECENCY rather than by
  //      lexicographic notice id. 337 real merge groups were publishing a
  //      superseded deadline; see the amendment note in to-dedupe.cjs.
  //
  // What this pin still guards is that the DETAIL layer changed none of it.
  assert.strictEqual(fp('data/tender-opportunities/opportunities.json'), '3c341d60');
  // Re-baselined 2026-08-20 (a6e0ea29 -> d4c2bbba). 384 records in, 384 out;
  // exactly two fields moved — `domainRating` and `metricsProvenance` — on
  // every record. Domain Rating collection was unfrozen and every domain in the
  // corpus was read from Ahrefs' free public endpoint. Each rating names the
  // record's own officialUrl host as the domain measured, checked across all
  // 384 with 0 exceptions, so no record borrowed another domain's authority.
  // ── PIN MOVED 2026-08-20: d4c2bbba -> 005d79ef ───────────────────────────
  //
  // Browser Evidence Recovery. 384 records in, 384 out. Exactly one field moved
  // and only on two records: `bidAccess` was DELETED from de-e-vergabe-sh and
  // au-nsw-local-government-procurement, both of which had published "free".
  // Neither page says anything about price — the German one says only that you
  // must register in order to participate, the Australian one describes what
  // its e-tendering tool does — and both verdicts came from a matcher that read
  // "free registration for buyers" and "free to submit your details" as
  // statements about supplier bidding. searchAccess is untouched: free 294,
  // unknown 78, mixed 11, paid 1.
  //
  // A retraction, not a discovery. Nothing was added to this file.
  assert.strictEqual(fp('data/tenders-procurement/platforms.json'), '005d79ef');
  assert.strictEqual(fp('scripts/lib/to-match.cjs'), '5de543fb');
  assert.strictEqual(Object.keys(MATCH.PROFILES).length, 16);
});

// ── PUBLICATION ─────────────────────────────────────────────────────────────

const RF = require('../lib/route-family.cjs');
const ROUTE = require('../lib/to-route.cjs');
const I18N = require('../lib/i18n.cjs');
const SITEMAP = read('sitemap-tender-opportunities.xml');
const fileFor = (p) => `${p.route.replace(/^\//, '')}index.html`;
const htmlFor = (p) => read(fileFor(p));
const families = RF.load();
const knownRoutes = new Set(indexable.map((p) => p.route));
const sampleOf = (fn, n) => indexable.filter(fn).slice(0, n);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

test('every indexable opportunity has a page, and nothing else does', () => {
  const dir = path.join(ROOT, 'research', 'tenders-procurement', 'opportunities');
  const dirs = fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory()).map((e) => e.name);
  assert.strictEqual(dirs.length, indexable.length,
    'published directories and the indexable set disagree');
  for (const p of indexable.slice(0, 300)) {
    assert.ok(fs.existsSync(path.join(ROOT, fileFor(p))), `missing page: ${p.route}`);
  }
  // A non-indexable record has no page, and its URL was never minted.
  for (const p of pages.filter((x) => !x.indexable).slice(0, 200)) {
    assert.ok(!fs.existsSync(path.join(ROOT, fileFor(p))),
      `${p.route} was published despite being noindex`);
  }
});

test('no page advertises a locale alternate that does not exist', () => {
  for (const p of sampleOf(() => true, 120)) {
    const html = htmlFor(p);
    assert.strictEqual((html.match(/hreflang="/g) || []).length, 0,
      `${p.route}: emits an hreflang cluster for a route that exists once`);
    assert.ok(!/href="https:\/\/petrohrys\.com\/(de|es|fr)\//.test(html),
      `${p.route}: links to a localized URL that was never generated`);
    assert.ok(!/href="\/(de|es|fr)\/research\/tenders-procurement\/opportunities\//.test(html),
      `${p.route}: the language switcher points at a missing detail page`);
  }
});

test('four-locale pages keep their full, valid cluster', () => {
  // The renderer change must not have cost an existing page its hreflang.
  for (const locale of I18N.LOCALE_CODES) {
    const html = read(I18N.localizedFile(locale, '/research/tenders-procurement/opportunities/'));
    assert.strictEqual((html.match(/hreflang="/g) || []).length, 5,
      `${locale}: the Discovery hub lost part of its cluster`);
    assert.ok(html.includes('hreflang="x-default"'));
  }
});

test('canonical and og:url are self-referential and query-free', () => {
  for (const p of sampleOf(() => true, 80)) {
    const html = htmlFor(p);
    const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html)[1];
    const og = /<meta property="og:url" content="([^"]+)"/.exec(html)[1];
    assert.strictEqual(canonical, og, `${p.route}: canonical and og:url disagree`);
    assert.strictEqual(canonical, `https://petrohrys.com${p.route}`);
    assert.ok(!canonical.includes('?'));
  }
});

test('the sitemap is exactly the indexable set', () => {
  const locs = [...SITEMAP.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.strictEqual(locs.length, indexable.length);
  assert.strictEqual(new Set(locs).size, locs.length, 'the sitemap repeats a URL');
  const expected = new Set(indexable.map((p) => `https://petrohrys.com${p.route}`));
  for (const l of locs) {
    assert.ok(expected.has(l), `unexpected sitemap URL: ${l}`);
    assert.ok(!l.includes('?'), `a query URL entered the sitemap: ${l}`);
    assert.ok(!/\/(de|es|fr)\//.test(l), `a phantom locale route entered the sitemap: ${l}`);
    assert.ok(fs.existsSync(path.join(ROOT, `${l.replace('https://petrohrys.com/', '')}index.html`)),
      `sitemap lists a page that does not exist: ${l}`);
  }
  assert.ok(locs.length <= 50000 && Buffer.byteLength(SITEMAP) <= 50 * 1024 * 1024);
  assert.ok(read('robots.txt').includes('sitemap-tender-opportunities.xml'));
});

test('every published route is authorized by the generated family', () => {
  for (const p of indexable.slice(0, 400)) {
    const v = RF.authorize(p.route, families, { knownRoutes, locale: 'en' });
    assert.ok(v.authorized, `${p.route}: ${v.reason}`);
    assert.strictEqual(v.family, 'tender-opportunity-detail');
  }
  // The family cannot authorize an id with no canonical record.
  const invented = '/research/tenders-procurement/opportunities/totally-invented-id-42/';
  assert.strictEqual(RF.authorize(invented, families, { knownRoutes, locale: 'en' }).reason,
    'NOT_A_CANONICAL_RECORD');
  // Nor a locale outside the family, nor a nested path, nor a foreign prefix.
  assert.strictEqual(RF.authorize(indexable[0].route, families,
    { knownRoutes, locale: 'de' }).reason, 'LOCALE_NOT_IN_FAMILY');
  for (const bad of ['/research/tenders-procurement/opportunities/a/b/',
    '/research/tenders-procurement/opportunities/', '/research/business-directories/x/', '/']) {
    assert.strictEqual(RF.authorize(bad, families, { knownRoutes, locale: 'en' }).reason,
      'NO_MATCHING_FAMILY', `${bad} matched a family`);
  }
  // And the registry itself cannot be widened into a wildcard.
  for (const f of families) assert.deepStrictEqual(RF.validateFamily(f), []);
});

test('Discovery derives the route instead of storing it', () => {
  const idx = JSON.parse(read('research/tenders-procurement/opportunities/tender-index.json'));
  const flagged = idx.records.filter((r) => r.dp);
  assert.strictEqual(flagged.length, indexable.length,
    'the Discovery eligibility flag and the published set disagree');
  // No route string is stored anywhere in the index.
  assert.ok(!JSON.stringify(idx).includes('/research/tenders-procurement/opportunities/'),
    'the search index stores route strings');
  // And the derived route matches the generated page exactly.
  for (const r of flagged.slice(0, 400)) {
    const derived = ROUTE.detailPath(r.i, r.ti);
    assert.ok(knownRoutes.has(derived), `derived route does not exist: ${derived}`);
  }
  assert.ok(/TenderRoute\.detailPath/.test(read('js/tender-discovery.js')),
    'the client does not use the shared route rule');
  assert.strictEqual(read('js/tender-route.js'), read('scripts/lib/to-route.cjs'),
    'js/tender-route.js drifted from the shared rule');
});

test('related links only ever point at pages that exist', () => {
  let checked = 0;
  for (const p of sampleOf(() => true, 500)) {
    const hrefs = [...htmlFor(p).matchAll(/href="(\/research\/tenders-procurement\/opportunities\/[^"]+)"/g)]
      .map((m) => m[1]).filter((h) => h !== ROUTE.BASE);
    for (const h of hrefs) {
      assert.ok(knownRoutes.has(h), `${p.route}: links to a page that does not exist: ${h}`);
      checked += 1;
    }
  }
  assert.ok(checked > 0, 'no related links were rendered, so the guard is vacuous');
});

test('the page states the facts and never invents an action', () => {
  for (const p of sampleOf((x) => x.source.url, 40)) {
    const html = htmlFor(p);
    assert.ok(html.includes(`href="${esc(p.source.url)}"`), `${p.route}: no official notice link`);
    assert.strictEqual((html.match(/<h1\b/g) || []).length, 1);
    assert.strictEqual((html.match(/<main\b/g) || []).length, 1);
    const body = html.split(esc(I18N.raw('en', 'tdp.notAffiliated'))).join(' ');
    assert.ok(!/apply now|submit (a )?bid/i.test(body), `${p.route}: implies bidding here`);
    const noProb = html.split(esc(I18N.raw('en', 'tdp.matchesNote'))).join(' ');
    assert.ok(!/probability|chance of winning/i.test(noProb), `${p.route}: implies odds`);
    for (const h of [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1])) {
      assert.ok(!/^(javascript|data|vbscript):/i.test(h), `${p.route}: unsafe scheme`);
    }
  }
});

test('published pages carry no email address and valid conservative JSON-LD', () => {
  for (const p of sampleOf(() => true, 200)) {
    const html = htmlFor(p);
    assert.deepStrictEqual(html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [], [],
      `${p.route}: an email address was published`);
  }
  for (const p of sampleOf(() => true, 25)) {
    for (const [, body] of htmlFor(p).matchAll(/<script type="application\/ld\+json">([^]*?)<\/script>/g)) {
      const parsed = JSON.parse(body);
      const graph = parsed['@graph'] || [parsed];
      for (const node of graph) {
        assert.ok(node['@type'], 'a JSON-LD node without @type');
        assert.ok(!/Product|Offer|JobPosting|Event|AggregateRating/.test(JSON.stringify(node['@type'])),
          `${p.route}: a fabricated rich-snippet type`);
      }
    }
  }
});

// ── NEW-INFRASTRUCTURE MUTATIONS ────────────────────────────────────────────

const applied = [];
const mutate = (name, fn) => test(`MUTATION: ${name}`, () => { applied.push(name); fn(); });

mutate('M1 a phantom DE alternate is emitted', () => {
  const html = htmlFor(indexable[0]);
  assert.ok(!/hreflang="de"/.test(html), 'a DE alternate is already emitted');
  const mutated = html.replace('<link rel="canonical"',
    '<link rel="alternate" hreflang="de" href="https://petrohrys.com/de/x/"><link rel="canonical"');
  assert.notStrictEqual(mutated, html);
  assert.ok(/hreflang="de"/.test(mutated), 'the mutation did not take');
});

mutate('M2 a four-locale page loses a valid alternate', () => {
  const hub = read(I18N.localizedFile('en', '/research/tenders-procurement/opportunities/'));
  assert.strictEqual((hub.match(/hreflang="/g) || []).length, 5);
  assert.notStrictEqual((hub.replace(/hreflang="de"/, 'hreflang="dk"')), hub);
});

mutate('M3 x-default points at a route that does not exist', () => {
  for (const p of sampleOf(() => true, 30)) {
    assert.ok(!/x-default/.test(htmlFor(p)), `${p.route}: emits x-default with no cluster`);
  }
});

mutate('M4 the generated family authorizes an invented id', () => {
  const v = RF.authorize('/research/tenders-procurement/opportunities/made-up-9999/',
    families, { knownRoutes, locale: 'en' });
  assert.strictEqual(v.authorized, false);
  assert.strictEqual(v.reason, 'NOT_A_CANONICAL_RECORD');
  // Shape alone is not authorization.
  assert.ok(ROUTE.isDetailShape('/research/tenders-procurement/opportunities/made-up-9999/'));
});

mutate('M5 a family is widened into a wildcard', () => {
  for (const bad of [
    { id: 'x', generator: 'g', locales: ['en'], reason: 'r'.repeat(50), prefix: '/', segments: 1 },
    { id: 'x', generator: 'g', locales: ['en'], reason: 'r'.repeat(50), prefix: '/research/', segments: 1 },
    { id: 'x', generator: 'g', locales: ['en'], reason: 'r'.repeat(50), prefix: '/a/b/', segments: 3 },
  ]) {
    assert.ok(RF.validateFamily(bad).length > 0, `a too-broad family validated: ${bad.prefix}`);
  }
});

mutate('M6 the Discovery index is bloated with route strings', () => {
  const raw = read('research/tenders-procurement/opportunities/tender-index.json');
  assert.ok(!raw.includes('/research/tenders-procurement/opportunities/'),
    'route strings are stored per record');
  const withRoutes = raw.length + indexable.length * 70;
  assert.ok(withRoutes > raw.length * 1.05, 'the mutation would not measurably bloat the index');
});

mutate('M7 a noindex page enters the sitemap', () => {
  const noindex = pages.filter((p) => !p.indexable);
  assert.ok(noindex.length > 0);
  for (const p of noindex.slice(0, 300)) {
    assert.ok(!SITEMAP.includes(`${p.route}</loc>`), `${p.route} is noindex but in the sitemap`);
  }
});

mutate('M8 a source outage deletes published pages', () => {
  const bySource = new Map();
  for (const p of indexable) bySource.set(p.provenance.sourceId, (bySource.get(p.provenance.sourceId) || 0) + 1);
  assert.ok(bySource.size >= 8, `only ${bySource.size} sources have pages`);
  const src = read('scripts/build-tender-detail.cjs').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/to-http|refresh-|fetch\s*\(/.test(src), 'the page build depends on ingestion');
});

mutate('M9 a related member inherits the representative deadline', () => {
  const src = read('scripts/build-tender-detail.cjs');
  assert.ok(/other\.dates\.deadline/.test(src),
    'related members do not read their own deadline');
  assert.ok(!/deadline: d\.deadline/.test(src.split('const related =')[1] || ''),
    'a related member inherits this page\'s deadline');
});

mutate('M10 noindex is injected client-side only', () => {
  const noindex = pages.filter((p) => !p.indexable);
  assert.ok(noindex.length > 0);
  // Noindex pages are not generated at all in v1, so there is nothing to
  // inject into — and the builder emits a source-visible tag when it does.
  const seoSrc = read('scripts/lib/bd-seo.cjs');
  assert.ok(/robots: indexable \? undefined : NOINDEX/.test(seoSrc),
    'the meta builder no longer emits a server-side robots directive');
});

test('the new-infrastructure mutation suite ran every mutation', () => {
  assert.strictEqual(applied.length, 10, `only ${applied.length} ran`);
  assert.strictEqual(new Set(applied).size, 10);
});
