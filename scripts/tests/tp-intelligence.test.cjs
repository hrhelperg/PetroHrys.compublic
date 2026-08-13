// scripts/tests/tp-intelligence.test.cjs
'use strict';

// Guards for Procurement Intelligence v1.
//
// The intelligence layer is derived, so its failure mode is different from the
// dataset's. A bad record states a wrong fact and can be checked against a
// source. A bad DERIVATION states a defensible-looking conclusion from correct
// facts — "foreign suppliers welcome" from an English UI, "submit here" from a
// homepage, a ranking that is really just a URL count. These tests exist to make
// those conclusions impossible rather than unlikely.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const S = require('../lib/tp-schema.cjs');
const I = require('../lib/tp-intelligence.cjs');
const build = require('../build-tenders-intelligence.cjs');
const I18N = require('../lib/i18n.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const countries = JSON.parse(read('data/business-directories/countries.json'));
const ISO = new Map(countries.map((c) => [c.slug, c.iso2 || null]));
const ALL = S.loadPlatforms(path.join(ROOT, 'data/tenders-procurement/platforms.json'), ISO)
  .filter(S.isPublishable);
const EU = build.EU_MEMBERS;

const CANONICAL = '/research/tenders-procurement/intelligence/';
const PAGES = I18N.LOCALE_CODES.map((l) => ({
  locale: l, rel: I18N.localizedFile(l, CANONICAL), html: read(I18N.localizedFile(l, CANONICAL)),
}));

const base = () => JSON.parse(JSON.stringify(ALL.find((r) => r.id === 'eu-ted')));

// ── preconditions ───────────────────────────────────────────────────────────

test('the dataset and the four pages exist', () => {
  assert.ok(ALL.length > 300, `only ${ALL.length} publishable records`);
  assert.strictEqual(PAGES.length, 4);
  for (const p of PAGES) assert.ok(p.html.length > 20000, `${p.rel} is suspiciously small`);
});

// ── derivation is honest ────────────────────────────────────────────────────

test('a homepage never becomes an action', () => {
  // The single most available derivation error: treating officialUrl as a route.
  for (const r of ALL) {
    const acts = I.supplierActions(r);
    if (!r.tenderSearchUrl) assert.ok(!acts.includes('SEARCH'), `${r.id} claims SEARCH without a route`);
    if (!r.supplierRegistrationUrl) assert.ok(!acts.includes('REGISTER'), `${r.id} claims REGISTER without a route`);
    if (!r.submissionUrl) {
      assert.ok(!acts.includes('SUBMIT') && !acts.includes('SUBMIT_ELECTRONICALLY'),
        `${r.id} claims submission without a route`);
    }
    if (!r.documentsUrl) assert.ok(!acts.includes('DOWNLOAD_DOCUMENTS'), `${r.id} claims documents without a route`);
  }
});

test('a record with no verified route is MONITOR_ONLY, not scored as actionable', () => {
  const none = ALL.filter((r) => !r.tenderSearchUrl && !r.supplierRegistrationUrl
    && !r.submissionUrl && !r.documentsUrl);
  assert.ok(none.length > 0, 'no route-less records: this guard is vacuous');
  for (const r of none) {
    assert.ok(I.supplierActions(r).includes('MONITOR_ONLY'), `${r.id} should be MONITOR_ONLY`);
  }
});

test('foreign eligibility is only VERIFIED when the record says yes', () => {
  for (const r of ALL) {
    const state = I.foreignEligibilityState(r);
    if (state === 'VERIFIED_ACCEPTED') {
      assert.strictEqual(r.foreignSuppliersAccepted, 'yes', `${r.id} verified without a yes`);
      assert.strictEqual(r.evidenceClass, 'A', `${r.id} verified on ${r.evidenceClass} evidence`);
    }
    if ((r.foreignSuppliersAccepted || 'unknown') === 'unknown') {
      assert.strictEqual(state, 'NOT_VERIFIED', `${r.id} unknown rendered as ${state}`);
    }
  }
});

test('unknown electronic submission is never treated as no', () => {
  const unk = ALL.filter((r) => (r.electronicSubmission || 'unknown') === 'unknown');
  const no = ALL.filter((r) => r.electronicSubmission === 'no');
  assert.ok(unk.length && no.length, 'need both populations for this guard to mean anything');
  const avg = (rs) => rs.reduce((s, r) => s + I.dimensionScores(r).submission, 0) / rs.length;
  assert.notStrictEqual(avg(unk), avg(no),
    'unknown and no score identically on the submission dimension');
});

test('the evidence floor holds: unknown-evidence records are not scored', () => {
  const unknown = ALL.filter((r) => !I.SCORABLE_EVIDENCE.has(r.evidenceClass));
  assert.ok(unknown.length > 0, 'no unknown-evidence records: the floor is untested');
  for (const r of unknown) {
    assert.strictEqual(I.utilityScore(r), null, `${r.id} was scored despite unknown evidence`);
    assert.strictEqual(I.band(I.utilityScore(r)), 'NOT_YET_SCORED');
  }
});

test('browser-check is uncertainty, not a quality penalty', () => {
  // A record behind bot protection must still be able to reach a good band. If
  // browserCheckRequired dominated, this would be impossible by construction.
  const bc = ALL.filter((r) => r.browserCheckRequired && I.utilityScore(r) !== null);
  assert.ok(bc.length > 0, 'no scored browser-check records');
  const best = Math.max(...bc.map((r) => I.utilityScore(r)));
  assert.ok(best >= 65, `best browser-check record scores only ${best}; the flag is acting as a penalty`);
});

test('scores are deterministic and bounded', () => {
  for (const r of ALL) {
    const a = I.utilityScore(r);
    const b = I.utilityScore(JSON.parse(JSON.stringify(r)));
    assert.strictEqual(a, b, `${r.id} scores differently on identical input`);
    if (a !== null) assert.ok(a >= 0 && a <= 100, `${r.id} scored ${a}`);
  }
});

test('utility and fit are genuinely different rankings', () => {
  // If fit were a relabelled utility score, the intelligence layer would be
  // one number pretending to be two.
  const byUtility = [...ALL].sort((a, b) => (I.utilityScore(b) ?? -1) - (I.utilityScore(a) ?? -1))
    .slice(0, 10).map((r) => r.id);
  const byFit = I.rank(ALL, 'local-sme', EU, { limit: 10 }).map((x) => x.record.id);
  const overlap = byUtility.filter((id) => byFit.includes(id)).length;
  assert.ok(overlap < 10, 'local-SME fit ranking is identical to the raw utility ranking');
});

test('every recommendation carries at least one reason or says it has none', () => {
  for (const key of Object.keys(I.PROFILES)) {
    for (const entry of I.rank(ALL, key, EU, { limit: 10 })) {
      assert.ok(Array.isArray(entry.reasons), `${key}/${entry.record.id} has no reasons array`);
      assert.ok(typeof entry.fit === 'number' && entry.fit >= 0,
        `${key}/${entry.record.id} has no fit score`);
    }
  }
});

test('no profile ranking is empty and none returns the whole dataset', () => {
  for (const key of Object.keys(I.PROFILES)) {
    const r = I.rank(ALL, key, EU, { limit: 10 });
    assert.strictEqual(r.length, 10, `${key} returned ${r.length}`);
  }
});

// ── the industry honesty rule ───────────────────────────────────────────────

test('no industry claim is made about any platform', () => {
  // The dataset records no industry. The page may say "useful for a telecom
  // supplier"; it must never say a platform IS a telecom procurement platform.
  // Guarded by construction: the fit signals are all capability/scope facts.
  const INDUSTRY_SIGNALS = ['telecomSector', 'itSector', 'healthSector', 'industry'];
  const signals = Object.keys(I.fitSignals(base(), EU));
  for (const bad of INDUSTRY_SIGNALS) {
    assert.ok(!signals.includes(bad), `fit uses an industry signal (${bad}) the dataset cannot support`);
  }
  for (const [key, p] of Object.entries(I.PROFILES)) {
    for (const signal of Object.keys(p.weights)) {
      assert.ok(signals.includes(signal), `${key} weights an unknown signal "${signal}"`);
    }
  }
});

test('the editorial nature of profile mapping is disclosed on every page', () => {
  for (const p of PAGES) {
    const label = I18N.t(p.locale, 'tpi.editorial');
    const count = p.html.split(label).length - 1;
    assert.ok(count >= build.FEATURED.length,
      `${p.rel} discloses the editorial mapping ${count} times for ${build.FEATURED.length} profiles`);
  }
});

// ── page contract ───────────────────────────────────────────────────────────

test('each locale page is self-canonical with matching og:url and lang', () => {
  for (const p of PAGES) {
    const expected = `https://petrohrys.com${I18N.localizedPath(p.locale, CANONICAL)}`;
    assert.strictEqual(p.html.match(/<link rel="canonical" href="([^"]+)"/)[1], expected, p.rel);
    assert.strictEqual(p.html.match(/property="og:url" content="([^"]+)"/)[1], expected, p.rel);
    assert.strictEqual(p.html.match(/<html lang="([a-z]+)"/)[1], p.locale, p.rel);
    assert.strictEqual((p.html.match(/<h1[\s>]/g) || []).length, 1, `${p.rel} h1`);
    assert.strictEqual((p.html.match(/<main[\s>]/g) || []).length, 1, `${p.rel} main`);
  }
});

test('hreflang is complete and reciprocal', () => {
  for (const p of PAGES) {
    for (const l of I18N.LOCALE_CODES) {
      const href = `https://petrohrys.com${I18N.localizedPath(l, CANONICAL)}`;
      assert.ok(p.html.includes(`hreflang="${l}" href="${href}"`), `${p.rel} misses ${l}`);
    }
    assert.ok(p.html.includes('hreflang="x-default"'), `${p.rel} misses x-default`);
  }
});

test('JSON-LD parses on every locale', () => {
  for (const p of PAGES) {
    const blocks = [...p.html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    assert.ok(blocks.length >= 1, `${p.rel} has no JSON-LD`);
    for (const b of blocks) JSON.parse(b[1]);
  }
});

test('the page is not an orphan and links back to the collection', () => {
  const collection = read('research/tenders-procurement/index.html');
  assert.ok(collection.includes(CANONICAL), 'the collection page does not link to intelligence');
  const p = PAGES.find((x) => x.locale === 'en');
  assert.ok(p.html.includes('/research/tenders-procurement/'), 'intelligence does not link back');
  const sitemap = read('sitemap.xml');
  for (const l of I18N.LOCALE_CODES) {
    const url = `https://petrohrys.com${I18N.localizedPath(l, CANONICAL)}`;
    assert.strictEqual(sitemap.split(`<loc>${url}</loc>`).length - 1, 1, `${url} sitemap count`);
  }
});

test('no locale page leaks another locale\'s prose', () => {
  const de = PAGES.find((p) => p.locale === 'de');
  assert.ok(de.html.includes(I18N.t('de', 'tpi.how')), 'DE page lacks its own heading');
  assert.ok(!de.html.includes('How this works'), 'DE page carries the English heading');
});

// ── CSV contract ────────────────────────────────────────────────────────────

function parseCsv(text) {
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') q = false; else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\r' && text[i + 1] === '\n') { row.push(field); field = ''; rows.push(row); row = []; i += 1; }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1);
}

test('the intelligence CSV has row parity with the publishable dataset', () => {
  const csv = read('research/tenders-procurement/intelligence/intelligence.csv');
  assert.ok(csv.startsWith('﻿'), 'missing BOM');
  const rows = parseCsv(csv.slice(1));
  assert.deepStrictEqual(rows[0], build.COLUMNS);
  assert.strictEqual(rows.length - 1, ALL.length, `CSV ${rows.length - 1} vs dataset ${ALL.length}`);
});

test('the CSV agrees with the renderer on every derived value', () => {
  // A derived column that drifts from what the page shows is worse than no
  // column: two answers, both authoritative-looking.
  const csv = read('research/tenders-procurement/intelligence/intelligence.csv');
  const rows = parseCsv(csv.slice(1)).slice(1);
  const col = (n) => build.COLUMNS.indexOf(n);
  const byId = new Map(rows.map((r) => [r[0], r]));
  for (const r of ALL) {
    const row = byId.get(r.id);
    assert.ok(row, `${r.id} missing from CSV`);
    const intel = I.intelligenceFor(r);
    assert.strictEqual(row[col('procurement_intelligence_score')],
      intel.utilityScore === null ? '' : String(intel.utilityScore), `${r.id} score`);
    assert.strictEqual(row[col('procurement_intelligence_band')], intel.band, `${r.id} band`);
    assert.strictEqual(row[col('procurement_model')], intel.model, `${r.id} model`);
    assert.strictEqual(row[col('foreign_eligibility_state')], intel.foreignEligibility, `${r.id} foreign`);
    assert.strictEqual(row[col('browser_check_state')], intel.browserCheck, `${r.id} browser`);
  }
});

test('the CSV carries canonical enums, not translated display values', () => {
  const csv = read('research/tenders-procurement/intelligence/intelligence.csv');
  const rows = parseCsv(csv.slice(1)).slice(1);
  const col = build.COLUMNS.indexOf('procurement_intelligence_band');
  const BANDS = new Set(['EXCEPTIONAL', 'STRONG', 'GOOD', 'MODERATE', 'LIMITED', 'NOT_YET_SCORED']);
  for (const row of rows) assert.ok(BANDS.has(row[col]), `translated band leaked into CSV: ${row[col]}`);
});

// ── mutations ───────────────────────────────────────────────────────────────

test('MUTATION: unknown foreign eligibility cannot become verified', () => {
  const r = base(); r.foreignSuppliersAccepted = 'unknown';
  assert.strictEqual(I.foreignEligibilityState(r), 'NOT_VERIFIED');
  r.languages = ['en']; // the classic false signal
  assert.strictEqual(I.foreignEligibilityState(r), 'NOT_VERIFIED', 'English UI upgraded eligibility');
});

test('MUTATION: a search URL cannot stand in for a submission route', () => {
  const r = base(); r.submissionUrl = null; r.tenderSearchUrl = 'https://example.org/search';
  assert.ok(!I.supplierActions(r).some((a) => a.startsWith('SUBMIT')),
    'a search route produced a submission action');
});

test('MUTATION: browser-check cannot be read as dead or as verified', () => {
  const r = base(); r.browserCheckRequired = true;
  assert.ok(I.supplierActions(r).includes('REQUIRES_BROWSER_CHECK'));
  assert.notStrictEqual(I.utilityScore(r), null, 'a browser-check record was refused a score');
  assert.notStrictEqual(I.browserCheckState(r), 'NOT_REQUIRED');
});

test('MUTATION: inverting a weight changes the ranking', () => {
  // Proves the weights are load-bearing rather than decorative.
  const before = I.rank(ALL, 'foreign-supplier', EU, { limit: 5 }).map((x) => x.record.id);
  const original = I.PROFILES['foreign-supplier'].weights.foreignVerified;
  I.PROFILES['foreign-supplier'].weights.foreignVerified = 0;
  const after = I.rank(ALL, 'foreign-supplier', EU, { limit: 5 }).map((x) => x.record.id);
  I.PROFILES['foreign-supplier'].weights.foreignVerified = original;
  assert.notDeepStrictEqual(before, after, 'zeroing the dominant weight changed nothing');
  const restored = I.rank(ALL, 'foreign-supplier', EU, { limit: 5 }).map((x) => x.record.id);
  assert.deepStrictEqual(before, restored, 'the mutation did not restore cleanly');
});

test('MUTATION: a project-financed record cannot claim financier submission', () => {
  const pf = ALL.find((r) => I.natureOf(r) === 'Project-financed' && !r.submissionUrl);
  if (!pf) return;
  assert.ok(!I.supplierActions(pf).some((a) => a.startsWith('SUBMIT')),
    `${pf.id} is project-financed with no submission route yet claims submission`);
  assert.strictEqual(I.procurementModel(pf), 'project-financed-surface');
});

test('MUTATION: scoring without the evidence floor would change the outcome', () => {
  const r = base(); r.evidenceClass = 'unknown';
  assert.strictEqual(I.utilityScore(r), null);
  r.evidenceClass = 'A';
  assert.notStrictEqual(I.utilityScore(r), null, 'the floor is not actually gating anything');
});
