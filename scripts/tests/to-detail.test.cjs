'use strict';

// Tender Opportunity Detail Pages v1 — the DOMAIN LAYER only.
//
// This is the projection, the identity/routing rule and the indexability rule.
// No pages are generated: measurement showed that per-opportunity static pages
// do not fit this repository's architecture yet, and the reasons are recorded
// in docs/TENDER-OPPORTUNITY-DETAIL-PAGES-V1.md.
//
// The layer is tested here anyway, because the rules it encodes are the part
// worth getting right before anything is published: what a page's identity is,
// what makes one worth indexing, and which platform-level facts must never be
// restated as facts about a tender.

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
  // Two different things are undecidable: a date the source wrote without a
  // time zone, and no date at all. Only the first has wording to preserve.
  const undecidable = pages.filter((p) => p.dates.deadline && !p.dates.deadline.decidable);
  const zoneless = undecidable.filter((p) => p.dates.deadline.precision !== 'NONE');
  const absent = undecidable.filter((p) => p.dates.deadline.precision === 'NONE');
  assert.ok(zoneless.length > 0 && absent.length > 0, 'both cases must be exercised');
  for (const p of undecidable) {
    assert.strictEqual(p.dates.deadline.daysRemaining, null,
      `${p.id}: an undecidable deadline was counted in days`);
  }
  for (const p of zoneless) {
    assert.ok(p.dates.deadline.raw, `${p.id}: the source wording was lost`);
  }
  // precision NONE means the deadline could not be parsed, not that the source
  // published nothing: some sources write a deadline as prose. The wording is
  // kept; what must never appear is an instant we invented from it.
  for (const p of absent) {
    assert.strictEqual(p.dates.deadline.iso, null,
      `${p.id}: an instant was derived from an unparseable deadline`);
  }
  assert.ok(absent.some((p) => p.dates.deadline.raw),
    'no unparseable-but-present deadline in the corpus, so the case is untested');
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
  assert.strictEqual(fp('data/tender-opportunities/opportunities.json'), 'cca4f5af');
  assert.strictEqual(fp('data/tenders-procurement/platforms.json'), 'f24a9edc');
  assert.strictEqual(fp('scripts/lib/to-match.cjs'), '5de543fb');
  assert.strictEqual(Object.keys(MATCH.PROFILES).length, 16);
});

test('nothing was published: the phase stopped at the domain layer', () => {
  // The measured reasons are in the documentation. This asserts the tree
  // matches the report rather than half-shipping.
  assert.ok(!fs.existsSync(path.join(ROOT, 'sitemap-tender-opportunities.xml')),
    'a detail sitemap exists but the phase was reported as not complete');
  const dir = path.join(ROOT, 'research', 'tenders-procurement', 'opportunities');
  const dirs = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory());
  assert.deepStrictEqual(dirs, [], 'per-opportunity directories exist under the hub route');
});
