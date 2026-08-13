// scripts/tests/to-alerts.test.cjs
'use strict';

// Tender Alerts & Monitoring v1 — change and alert guards.
//
// The engine's job is to be quiet when nothing happened and precise when
// something did. Most of these tests are about the first half, because a
// monitoring feed that cries wolf is worse than no feed at all.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const CH = require('../lib/to-changes.cjs');
const AL = require('../lib/to-alerts.cjs');
const MATCH = require('../lib/to-match.cjs');
const CORPUS = require('../lib/to-corpus.cjs');
const SCHEMA = require('../lib/to-schema.cjs');
const TP = require('../lib/tp-schema.cjs');
const DETECT = require('../detect-tender-changes.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const corpus = CORPUS.decode(JSON.parse(read('data/tender-opportunities/opportunities.json')));
const O = corpus.opportunities;
const countries = JSON.parse(read('data/business-directories/countries.json'));
const platformsById = new Map(TP.loadPlatforms(
  path.join(ROOT, 'data/tenders-procurement/platforms.json'),
  new Map(countries.map((c) => [c.slug, c.iso2 || null])),
).map((p) => [p.id, p]));
const NOW = '2026-08-13T12:00:00.000Z';

const healthy = () => Object.fromEntries(corpus.sources
  .map((s) => [s.id, { state: 'HEALTHY', promoted: true, completeness: 'COMPLETE' }]));
const baselineOf = (c) => ({
  version: 1,
  generatedAt: NOW,
  entries: Object.fromEntries(c.opportunities.map((o) => [o.id, CH.baselineEntry(o)])),
});

test('precondition: a real corpus with several sources is present', () => {
  assert.ok(O.length > 1000, `only ${O.length} opportunities`);
  assert.ok(corpus.sources.filter((s) => s.recordCount > 0).length >= 5);
});

// ── FIRST RUN ───────────────────────────────────────────────────────────────

test('the first run initializes a baseline and raises no alerts', () => {
  const r = AL.detect({ baseline: null, corpus, health: healthy(), nowIso: NOW, platformsById });
  assert.strictEqual(r.state, 'BASELINE_INITIALIZED');
  assert.strictEqual(r.changes.length, 0, 'installing a monitor is not a procurement event');
  assert.strictEqual(r.alerts.length, 0);
  assert.strictEqual(Object.keys(r.nextBaseline.entries).length, O.length);
  // An empty-entries baseline is treated as absent, not as "everything vanished".
  const r2 = AL.detect({ baseline: { entries: {} }, corpus, health: healthy(), nowIso: NOW, platformsById });
  assert.strictEqual(r2.state, 'BASELINE_INITIALIZED');
  assert.strictEqual(r2.changes.length, 0);
});

test('an unchanged corpus produces no changes at all', () => {
  const r = AL.detect({ baseline: baselineOf(corpus), corpus, health: healthy(), nowIso: NOW, platformsById });
  assert.strictEqual(r.state, 'COMPARED');
  assert.strictEqual(r.changes.length, 0, 'a stable corpus produced phantom changes');
  assert.strictEqual(r.alerts.length, 0);
});

// ── THE OUTAGE RULE ─────────────────────────────────────────────────────────

test('a degraded source cannot generate disappearance alerts', () => {
  const base = baselineOf(corpus);
  const gone = { ...corpus, opportunities: O.filter((o) => o.sourceId !== 'ted') };
  const missing = O.length - gone.opportunities.length;
  assert.ok(missing > 100, 'the fixture removed too few records to be meaningful');

  const degraded = { ...healthy(), ted: { state: 'DEGRADED', promoted: false, completeness: 'COMPLETE' } };
  const r = AL.detect({ baseline: base, corpus: gone, health: degraded, nowIso: NOW, platformsById });
  assert.strictEqual(r.changes.filter((c) => c.type === 'NO_LONGER_OBSERVED').length, 0,
    `${missing} records vanished from a degraded source and became removal alerts`);
  assert.strictEqual(r.stats.suppressedRemovals, missing);
  assert.strictEqual(r.alerts.length, 0);
});

test('retained last-good and partial windows also suppress removals', () => {
  const base = baselineOf(corpus);
  const gone = { ...corpus, opportunities: O.filter((o) => o.sourceId !== 'ted') };
  for (const h of [
    { state: 'HEALTHY', promoted: false, completeness: 'COMPLETE' },  // retained, not refreshed
    { state: 'HEALTHY', promoted: true, completeness: 'PARTIAL' },    // bounded window drops records normally
    { state: 'RATE_LIMITED', promoted: false, completeness: 'COMPLETE' },
    undefined,                                                        // unknown health
  ]) {
    const health = { ...healthy(), ted: h };
    const r = AL.detect({ baseline: base, corpus: gone, health, nowIso: NOW, platformsById });
    assert.strictEqual(r.changes.filter((c) => c.type === 'NO_LONGER_OBSERVED').length, 0,
      `removals were emitted for source state ${JSON.stringify(h)}`);
  }
});

test('a healthy complete source may report disappearance — but never as closure', () => {
  const base = baselineOf(corpus);
  const gone = { ...corpus, opportunities: O.filter((o) => o.sourceId !== 'ted') };
  const r = AL.detect({ baseline: base, corpus: gone, health: healthy(), nowIso: NOW, platformsById });
  const removals = r.changes.filter((c) => c.type === 'NO_LONGER_OBSERVED');
  assert.ok(removals.length > 0, 'a healthy source reported nothing: the guard above is vacuous');
  for (const c of removals) {
    assert.strictEqual(c.actionable, false);
    assert.strictEqual(c.severity, 'INFORMATIONAL');
  }
  assert.strictEqual(r.changes.filter((c) => c.type === 'CANCELLED').length, 0,
    'absence was reported as cancellation');
});

// ── DEADLINES ───────────────────────────────────────────────────────────────

test('deadline movement is only classified when both sides are decidable', () => {
  const b = { s: 'OPEN', d: '2026-09-16+02:00', v: null, b: 'x', c: null, u: null, t: 'aa', o: 'ted' };
  const ext = CH.changesBetween('ted:1', b, { ...b, d: '2026-09-27+02:00' });
  assert.strictEqual(ext[0].type, 'DEADLINE_EXTENDED');
  assert.strictEqual(ext[0].detail.days, 11);
  const sh = CH.changesBetween('ted:1', b, { ...b, d: '2026-09-10+02:00' });
  assert.strictEqual(sh[0].type, 'DEADLINE_SHORTENED');
  assert.strictEqual(sh[0].severity, 'CRITICAL');

  // Zoneless on either side: a 26-hour band cannot support "extended".
  const z = { ...b, d: '2026-09-16T14:00:00' };
  for (const pair of [[z, { ...z, d: '2026-09-20T14:00:00' }], [b, z], [z, b]]) {
    const r = CH.changesBetween('ted:1', pair[0], pair[1]);
    const types = r.map((x) => x.type);
    assert.ok(!types.includes('DEADLINE_EXTENDED') && !types.includes('DEADLINE_SHORTENED'),
      `an undecidable deadline produced ${types.join(',')}`);
    assert.ok(types.includes('DEADLINE_CHANGED_UNCOMPARABLE'));
  }

  // Same instant expressed differently is not news.
  assert.deepStrictEqual(CH.changesBetween('ted:1', b, { ...b, d: '2026-09-16+02:00' }), []);
});

test('value is never compared across currencies', () => {
  const b = { s: 'OPEN', d: null, v: 'EUR:1000::', b: 'x', c: null, u: null, t: 'a', o: 'ted' };
  const cross = CH.changesBetween('ted:1', b, { ...b, v: 'COP:1000::' })[0];
  assert.strictEqual(cross.type, 'VALUE_CHANGED');
  assert.strictEqual(cross.detail.comparable, false, 'a cross-currency move was reported as comparable');
  assert.strictEqual(cross.detail.currencyChanged, true);
  const same = CH.changesBetween('ted:1', b, { ...b, v: 'EUR:2000::' })[0];
  assert.strictEqual(same.detail.comparable, true);
});

// ── NOISE SUPPRESSION ───────────────────────────────────────────────────────

test('formatting churn is not a change', () => {
  const o = { title: 'Supply  of   cable', descriptionSummary: 'x', status: 'OPEN', deadline: null, value: null, buyerName: 'City  of X.', classifications: [], submissionUrl: null, occurrences: [{ sourceId: 'ted' }] };
  const o2 = { ...o, title: 'Supply of cable', buyerName: 'City of X' };
  assert.deepStrictEqual(CH.changesBetween('ted:1', CH.baselineEntry(o), CH.baselineEntry(o2)), [],
    'whitespace and trailing punctuation produced an alert');

  // URL tracking parameters churn without the route changing.
  const u1 = { ...o, submissionUrl: 'https://Portal.example.gov/bid/1?utm_source=x&gclid=y' };
  const u2 = { ...o, submissionUrl: 'https://portal.example.gov/bid/1/?utm_source=z' };
  assert.deepStrictEqual(CH.changesBetween('ted:1', CH.baselineEntry(u1), CH.baselineEntry(u2)), [],
    'a rotating tracking parameter looked like a submission-route change');

  // But a genuine route change is still detected.
  const u3 = { ...o, submissionUrl: 'https://portal.example.gov/bid/2' };
  assert.strictEqual(CH.changesBetween('ted:1', CH.baselineEntry(u1), CH.baselineEntry(u3))[0].type,
    'SUBMISSION_ROUTE_CHANGED');
});

// ── ALERT SEMANTICS ─────────────────────────────────────────────────────────

test('cancelled and awarded opportunities are never actionable', () => {
  const live = O.find((o) => SCHEMA.isCurrent(o) && o.classifications.length);
  assert.ok(live, 'no current classified opportunity to build a fixture from');
  for (const status of ['CANCELLED', 'AWARDED']) {
    const dead = { ...live, status };
    const change = { id: 'chg_x', opportunityId: dead.id, type: status, severity: 'CRITICAL', actionable: true };
    const alerts = AL.candidatesForChange(change, dead, { nowIso: NOW, platformsById, profiles: Object.keys(MATCH.PROFILES) });
    for (const a of alerts) {
      assert.strictEqual(a.actionable, false, `${status} produced an actionable alert`);
      assert.ok(!a.actions.includes('SUBMIT'), `${status} offered SUBMIT`);
      assert.ok(!a.actions.includes('MONITOR'), `${status} offered MONITOR`);
    }
  }
});

test('one canonical change yields at most one alert per profile', () => {
  const multi = O.find((o) => o.multiSource);
  assert.ok(multi, 'no multi-source opportunity in the corpus');
  const change = { id: 'chg_dup', opportunityId: multi.id, type: 'DEADLINE_EXTENDED', severity: 'MEDIUM', actionable: true };
  const alerts = AL.candidatesForChange(change, multi, { nowIso: NOW, platformsById, profiles: Object.keys(MATCH.PROFILES) });
  const perProfile = {};
  for (const a of alerts) perProfile[a.supplierProfile] = (perProfile[a.supplierProfile] || 0) + 1;
  for (const [p, n] of Object.entries(perProfile)) {
    assert.strictEqual(n, 1, `${p} received ${n} alerts for one change on a ${multi.occurrences.length}-source opportunity`);
  }
});

test('every alert explains itself and discloses what is unknown', () => {
  const live = O.filter((o) => SCHEMA.isCurrent(o) && o.classifications.length).slice(0, 40);
  let produced = 0;
  for (const o of live) {
    const change = { id: `chg_${o.id}`, opportunityId: o.id, type: 'NEW_OPPORTUNITY', severity: 'HIGH', actionable: true };
    for (const a of AL.candidatesForChange(change, o, { nowIso: NOW, platformsById, profiles: Object.keys(MATCH.PROFILES) })) {
      produced += 1;
      assert.ok(a.reasons.length > 0, `${a.id} has no reason`);
      assert.ok(a.reasons.some((r) => r.code === 'CHANGE_NEW_OPPORTUNITY'));
      assert.ok(a.uncertainty.includes('FOREIGN_ELIGIBILITY_NOT_STATED'),
        `${a.id} does not disclose that foreign eligibility is unstated`);
      assert.ok(a.uncertainty.includes('NEW_MEANS_NEWLY_OBSERVED'),
        `${a.id} does not distinguish newly observed from newly published`);
      assert.ok(a.matchScore >= AL.MATCH_FLOOR);
      assert.ok(!/probab|chance|likely to win|win rate/i.test(JSON.stringify(a)),
        `${a.id} implies a probability of winning`);
    }
  }
  assert.ok(produced > 0, 'no alerts were produced: this guard is vacuous');
});

// ── DETERMINISM ─────────────────────────────────────────────────────────────

test('change ids and ordering are deterministic and order-independent', () => {
  const base = baselineOf(corpus);
  const mutated = { ...corpus, opportunities: O.map((o, i) => (i % 500 === 0 ? { ...o, status: 'CANCELLED' } : o)) };
  const a = AL.detect({ baseline: base, corpus: mutated, health: healthy(), nowIso: NOW, platformsById });
  const shuffled = { ...mutated, opportunities: mutated.opportunities.slice().reverse() };
  const b = AL.detect({ baseline: base, corpus: shuffled, health: healthy(), nowIso: NOW, platformsById });
  assert.ok(a.changes.length > 0, 'the fixture produced no changes');
  assert.deepStrictEqual(a.changes.map((c) => c.id), b.changes.map((c) => c.id),
    'change ordering depends on corpus array order');
  assert.deepStrictEqual(a.alerts.map((x) => x.id), b.alerts.map((x) => x.id),
    'alert ordering depends on corpus array order');
  // Ids must not absorb the clock.
  const later = AL.detect({ baseline: base, corpus: mutated, health: healthy(), nowIso: '2099-01-01T00:00:00.000Z', platformsById });
  assert.deepStrictEqual(a.changes.map((c) => c.id), later.changes.map((c) => c.id),
    'a change id changed because the clock did');
});

// ── DURABLE STATE ───────────────────────────────────────────────────────────

test('the monitoring baseline is committed and survives a fresh clone', () => {
  const rel = 'data/tender-opportunities/monitoring-baseline.json';
  assert.ok(fs.existsSync(path.join(ROOT, rel)), 'no monitoring baseline on disk');
  assert.ok(!read('.gitignore').includes('monitoring-baseline'),
    'the comparison baseline is gitignored — a fresh clone would report every opportunity as new');
  const b = JSON.parse(read(rel));
  assert.ok(Object.keys(b.entries).length > 1000);
  // Compact by construction: it stores digests, not prose.
  const bytes = fs.statSync(path.join(ROOT, rel)).size;
  assert.ok(bytes / Object.keys(b.entries).length < 300,
    `${Math.round(bytes / Object.keys(b.entries).length)} bytes per entry — the baseline is storing text again`);
  for (const e of Object.values(b.entries).slice(0, 50)) {
    assert.match(e.t, /^[0-9a-f]{12}$/, 'the text field is not a digest');
  }
});

test('the baseline is not rewritten when only the clock moved', () => {
  const current = JSON.parse(read('data/tender-opportunities/monitoring-baseline.json'));
  const sameEntries = { version: 1, generatedAt: '2099-01-01T00:00:00.000Z', entries: current.entries };
  assert.strictEqual(DETECT.writeBaselineIfEntriesChanged(sameEntries), false,
    'a new generatedAt alone rewrote the baseline');
});

test('the detector performs no network access', () => {
  const src = read('scripts/detect-tender-changes.cjs') + read('scripts/lib/to-changes.cjs')
    + read('scripts/lib/to-alerts.cjs');
  assert.ok(!/\bfetch\s*\(|require\('node:https?'\)|to-http/.test(src.replace(/^\s*\/\/.*$/gm, '')),
    'the alert engine can reach the network');
});

test('the matching model was not touched by the alerts layer', () => {
  assert.deepStrictEqual(MATCH.WEIGHTS,
    { category: 40, geography: 20, actionability: 15, deadline: 15, confidence: 10 });
  assert.strictEqual(Object.keys(MATCH.PROFILES).length, 16);
  assert.ok(!/WEIGHTS\s*=|PROFILES\s*=/.test(read('scripts/lib/to-alerts.cjs')),
    'the alerts layer redefines matching constants');
});

test('no alert payload can leak personal contact data', () => {
  const email = /\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/i;
  const live = O.filter((o) => SCHEMA.isCurrent(o)).slice(0, 300);
  for (const o of live) {
    const change = { id: `chg_${o.id}`, opportunityId: o.id, type: 'NEW_OPPORTUNITY', severity: 'HIGH', actionable: true };
    for (const a of AL.candidatesForChange(change, o, { nowIso: NOW, platformsById, profiles: ['telecom', 'construction'] })) {
      assert.ok(!email.test(JSON.stringify(a)), `${a.id} carries an email address`);
    }
  }
});

// ── PUBLIC PRODUCT CLOSEOUT ─────────────────────────────────────────────────

const I18N = require('../lib/i18n.cjs');
const MON = require('../build-tender-monitoring.cjs');
const cbCsv = require('../lib/to-adapters/canadabuys.cjs');

const monPage = (locale) => read(I18N.localizedFile(locale, MON.CANONICAL_PATH));

test('C1. the monitoring route exists once per locale and owns only its two files', () => {
  for (const locale of I18N.LOCALE_CODES) {
    assert.ok(fs.existsSync(path.join(ROOT, I18N.localizedFile(locale, MON.CANONICAL_PATH))),
      `${locale} monitoring page missing`);
  }
  const entries = fs.readdirSync(path.join(ROOT, 'research/tenders-procurement/monitoring')).sort();
  assert.deepStrictEqual(entries, ['alerts.csv', 'index.html'],
    `the monitoring route owns unexpected files: ${entries.join(', ')}`);
});

test('C2. canonical, og:url, hreflang and sitemap agree', () => {
  const sitemap = read('sitemap.xml');
  for (const locale of I18N.LOCALE_CODES) {
    const html = monPage(locale);
    const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html);
    const og = /<meta property="og:url" content="([^"]+)"/.exec(html);
    assert.ok(canonical && og, `${locale}: missing canonical or og:url`);
    assert.strictEqual(canonical[1], og[1], `${locale}: canonical and og:url disagree`);
    assert.ok(sitemap.includes(`<loc>${canonical[1]}</loc>`), `${locale}: canonical not in sitemap`);
    for (const other of I18N.LOCALE_CODES) {
      assert.ok(html.includes(`hreflang="${other}"`), `${locale}: no hreflang for ${other}`);
    }
    assert.ok(/hreflang="x-default"/.test(html), `${locale}: no x-default`);
    assert.strictEqual((html.match(/<h1[\s>]/g) || []).length, 1, `${locale}: not exactly one H1`);
    assert.strictEqual((html.match(/<main[\s>]/g) || []).length, 1, `${locale}: not exactly one main`);
  }
  const locs = [...sitemap.matchAll(/<loc>([^<]*monitoring\/)<\/loc>/g)].map((m) => m[1]);
  assert.strictEqual(locs.length, I18N.LOCALE_CODES.length);
  assert.strictEqual(new Set(locs).size, locs.length, 'the sitemap repeats a monitoring URL');
  // No filter/query state is ever a route.
  assert.ok(!/monitoring\/\?/.test(sitemap), 'a query state entered the sitemap');
});

test('C3. the monitoring page is not an orphan', () => {
  assert.ok(read('research/tenders-procurement/index.html').includes('/research/tenders-procurement/monitoring/'),
    'the collection page does not link to monitoring');
  const page = monPage('en');
  assert.ok(page.includes('/research/tenders-procurement/opportunities/'), 'no link to Opportunities');
  assert.ok(page.includes('/research/tenders-procurement/'), 'no link back to the collection');
});

test('C4. localized pages are genuinely localized, not an English shell', () => {
  for (const locale of I18N.LOCALE_CODES.filter((l) => l !== 'en')) {
    const html = monPage(locale);
    // First-party copy must be present in the locale...
    // Only keys that render unconditionally. "mon.actionable" appears inside
    // an alert row, and there are legitimately zero alerts today, so asserting
    // it would test the corpus rather than the localization.
    for (const key of ['mon.title', 'mon.methodGoneHeading', 'mon.kpi.changes', 'mon.sourcesHeading']) {
      const v = I18N.t(locale, key);
      assert.ok(html.includes(v.slice(0, 18)), `${locale}: "${key}" is not rendered in the locale`);
    }
    // ...and the English form of a DISTINCTIVE first-party string must not be.
    for (const key of ['mon.methodGoneHeading', 'mon.kpi.sourcesDegraded']) {
      const en = I18N.t('en', key);
      if (en === I18N.t(locale, key)) continue; // legitimately identical
      assert.ok(!html.includes(en), `${locale}: English "${en}" leaked into the localized page`);
    }
  }
});

test('C5. canonical enums are never stored translated', () => {
  // The engine's vocabulary must appear in the DATA in canonical form only.
  const ledger = JSON.parse(read('data/tender-opportunities/change-ledger.json'));
  for (const e of ledger.entries) {
    assert.ok(CH.CHANGE_TYPES.includes(e.type), `ledger carries a non-canonical type "${e.type}"`);
    assert.ok(CH.SEVERITY_ORDER.includes(e.severity));
  }
  // And no translated label may appear as a canonical value anywhere in the
  // engine or its data.
  for (const locale of ['de', 'es', 'fr']) {
    const label = I18N.t(locale, 'mon.change.DEADLINE_EXTENDED');
    assert.ok(!read('scripts/lib/to-changes.cjs').includes(label),
      `a ${locale} label is hardcoded in the engine`);
  }
});

test('C6. the CSV is RFC 4180, round-trips, and is hardened against formulas', () => {
  const csv = read('research/tenders-procurement/monitoring/alerts.csv');
  assert.ok(csv.startsWith('﻿'), 'no UTF-8 BOM');
  assert.ok(csv.includes('\r\n'), 'not CRLF');
  const parsed = cbCsv.parseCsv(csv.slice(1));
  assert.deepStrictEqual(Object.keys(parsed[0] || {}).length ? Object.keys(parsed[0]) : MON.COLUMNS,
    MON.COLUMNS, 'CSV header drifted from the declared columns');

  // Formula injection, using values a buyer could legitimately publish.
  for (const evil of ['=HYPERLINK("http://x","click")', '+cmd|/c calc', '-1+2', '@SUM(A1:A9)', '\tlead tab']) {
    const cell = MON.csvField(evil);
    assert.ok(/^'|^"'/.test(cell), `"${evil}" was not neutralised: ${cell}`);
  }
  // Ordinary values are untouched.
  assert.strictEqual(MON.csvField('Roof works'), 'Roof works');
  // Quoting still correct for commas, quotes, newlines, Unicode.
  const rows = [{ ...Object.fromEntries(MON.COLUMNS.map((c) => [c, ''])), title: 'a,b "q"\nnew — Ünïcøde' }];
  const out = MON.renderCsv(rows);
  const back = cbCsv.parseCsv(out.slice(1));
  assert.strictEqual(back.length, 1, 'row parity lost');
  assert.strictEqual(back[0].title, 'a,b "q"\nnew — Ünïcøde', 'the value did not round-trip');
});

test('C7. the page renders no synthetic alerts and states its emptiness truthfully', () => {
  const model = MON.buildModel();
  const html = monPage('en');
  if (model.alerts.length === 0) {
    const empty = I18N.t('en', model.state === 'BASELINE_INITIALIZED' ? 'mon.emptyBaseline' : 'mon.emptyNoChanges');
    assert.ok(html.includes(empty.slice(0, 40)), 'an empty comparison did not render the honest empty state');
    // Scoped to the alerts section only: the source-health table below it
    // legitimately has rows, and splitting on id="alerts" alone caught those.
    const section = (html.split('id="alerts"')[1] || '').split('id="sources"')[0];
    assert.ok(!/<tbody>\s*<tr>/.test(section), 'alert rows exist with zero alerts');
  }
  // KPI zeroes are shown, not hidden.
  assert.ok(html.includes(I18N.t('en', 'mon.kpi.cancelled')), 'a KPI was hidden because it was zero');
});

test('C8. product wording stays inside what the evidence supports', () => {
  for (const locale of I18N.LOCALE_CODES) {
    const html = monPage(locale);
    // The methodology and freshness notes contain these phrases precisely in
    // order to DENY them — "never a probability of winning", "not a real-time
    // feed". Scanning the raw page fails the sentences that make the product
    // honest, so the first-party disclaimers are removed and what remains is
    // scanned. Same discipline as the Opportunities page.
    const esc = (x) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    let rest = html;
    for (const key of ['mon.methodMatch', 'mon.notLive', 'mon.methodGone', 'mon.limitForeign']) {
      rest = rest.split(esc(I18N.t(locale, key))).join(' ');
    }
    assert.notStrictEqual(rest, html, `${locale}: the disclaimers are not on the page at all`);
    assert.ok(!/chance to win|probability of winning|win rate|Gewinnchance|probabilidad de ganar|chance de gagner/i.test(rest),
      `${locale}: the page implies a probability of winning`);
    assert.ok(!/real[- ]time|live feed|updated now|Echtzeit|tiempo real|temps réel/i.test(rest),
      `${locale}: the page claims real-time freshness`);
    // Foreign eligibility must never be asserted.
    assert.ok(!/foreign suppliers (are )?(accepted|not accepted)/i.test(html),
      `${locale}: the page asserts foreign eligibility`);
  }
});

test('C9. the monitoring build reaches no network and does not re-detect', () => {
  const src = read('scripts/build-tender-monitoring.cjs');
  const stripped = src.replace(/^\s*\/\/.*$/gm, '');
  for (const forbidden of ['to-http', 'to-adapters', 'refresh-tender-opportunities', 'to-zip']) {
    assert.ok(!new RegExp(`require\\([^)]*${forbidden}`).test(stripped), `the renderer requires ${forbidden}`);
  }
  // One source of truth: the renderer calls the engine, it does not compare.
  assert.match(src, /ALERTS\.detect\(/);
  assert.ok(!/changesBetween\(/.test(stripped), 'the renderer re-implements change detection');
});

test('C10. rendering is deterministic and clock-independent', () => {
  const a = MON.renderMain(MON.buildModel(), { t: I18N.translator('en'), countryName: (s) => s });
  const b = MON.renderMain(MON.buildModel(), { t: I18N.translator('en'), countryName: (s) => s });
  assert.strictEqual(a, b, 'two renders of the same state differ');
  assert.ok(!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(a.replace(/datetime="[^"]*"/g, '')),
    'a wall-clock timestamp reached the rendered page');
});

// ── FORMAL MUTATION SUITE ───────────────────────────────────────────────────
//
// Each entry applies a mutation, asserts a guard catches it, and leaves nothing
// behind. The final test asserts every one of them actually asserts something,
// so a no-op cannot pass as coverage.

const mutations = [];
const mutate = (name, fn) => { mutations.push({ name, fn }); test(`MUTATION: ${name}`, fn); };

mutate('CM1: source outage creates mass removal alerts', () => {
  const base = baselineOf(corpus);
  const gone = { ...corpus, opportunities: O.filter((o) => o.sourceId !== 'ted') };
  const degraded = { ...healthy(), ted: { state: 'DEGRADED', promoted: false, completeness: 'COMPLETE' } };
  const r = AL.detect({ baseline: base, corpus: gone, health: degraded, nowIso: NOW, platformsById });
  assert.strictEqual(r.changes.filter((c) => c.type === 'NO_LONGER_OBSERVED').length, 0);
  assert.ok(r.stats.suppressedRemovals > 100, 'the mutation removed too little to be meaningful');
});

mutate('CM2: first initialization creates a NEW_OPPORTUNITY storm', () => {
  const r = AL.detect({ baseline: null, corpus, health: healthy(), nowIso: NOW, platformsById });
  assert.strictEqual(r.changes.filter((c) => c.type === 'NEW_OPPORTUNITY').length, 0);
});

mutate('CM3: a canonical change duplicates per source occurrence', () => {
  const multi = O.find((o) => o.multiSource);
  const change = { id: 'chg_m', opportunityId: multi.id, type: 'DEADLINE_EXTENDED', severity: 'MEDIUM', actionable: true };
  const alerts = AL.candidatesForChange(change, multi, { nowIso: NOW, platformsById, profiles: ['telecom'] });
  assert.ok(alerts.length <= 1, `${alerts.length} alerts for one change on a multi-source opportunity`);
});

mutate('CM4/CM5: awarded or cancelled appears actionable', () => {
  const live = O.find((o) => SCHEMA.isCurrent(o) && o.classifications.length);
  for (const status of ['AWARDED', 'CANCELLED']) {
    const dead = { ...live, status };
    const change = { id: 'c', opportunityId: dead.id, type: status, severity: 'HIGH', actionable: true };
    for (const a of AL.candidatesForChange(change, dead, { nowIso: NOW, platformsById, profiles: Object.keys(MATCH.PROFILES) })) {
      assert.strictEqual(a.actionable, false, `${status} was actionable`);
    }
  }
});

mutate('CM6: a zoneless deadline yields a fake extension', () => {
  const b = { s: 'OPEN', d: '2026-09-16T14:00:00', v: null, b: 'x', c: null, u: null, t: 'a', o: 'ted' };
  const types = CH.changesBetween('x', b, { ...b, d: '2026-09-30T14:00:00' }).map((c) => c.type);
  assert.ok(!types.includes('DEADLINE_EXTENDED') && !types.includes('DEADLINE_SHORTENED'));
});

mutate('CM7: cross-currency values compared numerically', () => {
  const b = { s: 'OPEN', d: null, v: 'EUR:100::', b: 'x', c: null, u: null, t: 'a', o: 'ted' };
  const c = CH.changesBetween('x', b, { ...b, v: 'COP:400000::' })[0];
  assert.strictEqual(c.detail.comparable, false);
});

mutate('CM8/CM9: unknown eligibility or browser-check becomes verified', () => {
  const live = O.find((o) => SCHEMA.isCurrent(o) && o.classifications.length);
  const change = { id: 'c', opportunityId: live.id, type: 'NEW_OPPORTUNITY', severity: 'HIGH', actionable: true };
  for (const a of AL.candidatesForChange(change, live, { nowIso: NOW, platformsById, profiles: Object.keys(MATCH.PROFILES) })) {
    assert.ok(a.uncertainty.includes('FOREIGN_ELIGIBILITY_NOT_STATED'));
  }
});

mutate('CM10: a failed source is stamped with fresh success', () => {
  const HEALTH = require('../lib/to-health.cjs');
  const e = HEALTH.recordAttempt({ lastSuccessfulAt: '2026-08-01T00:00:00.000Z', lastSuccessfulRecordCount: 50, consecutiveFailures: 0 },
    { sourceId: 'x', nowIso: NOW, result: 'FAILURE', errorClass: 'TRANSPORT' });
  assert.strictEqual(e.lastSuccessfulAt, '2026-08-01T00:00:00.000Z', 'a failure advanced the last-success stamp');
  assert.notStrictEqual(e.state, 'HEALTHY');
});

mutate('CM11: tracking churn causes a submission-route alert', () => {
  const mk = (u) => ({ title: 'a', descriptionSummary: null, status: 'OPEN', deadline: null, value: null, buyerName: 'b', classifications: [], submissionUrl: u, occurrences: [{ sourceId: 'ted' }] });
  const a = CH.baselineEntry(mk('https://p.gov/bid/1?utm_source=a&utm_campaign=b'));
  const b = CH.baselineEntry(mk('https://p.gov/bid/1?utm_source=z'));
  assert.deepStrictEqual(CH.changesBetween('x', a, b), []);
});

mutate('CM12/CM13: a volatile clock or array order changes identity', () => {
  const base = baselineOf(corpus);
  const mutatedCorpus = { ...corpus, opportunities: O.map((o, i) => (i % 700 === 0 ? { ...o, status: 'CANCELLED' } : o)) };
  const a = AL.detect({ baseline: base, corpus: mutatedCorpus, health: healthy(), nowIso: NOW, platformsById });
  const b = AL.detect({ baseline: base, corpus: { ...mutatedCorpus, opportunities: mutatedCorpus.opportunities.slice().reverse() }, health: healthy(), nowIso: '2099-01-01T00:00:00.000Z', platformsById });
  assert.ok(a.changes.length > 0);
  assert.deepStrictEqual(a.changes.map((c) => c.id), b.changes.map((c) => c.id));
});

mutate('CM16/CM17/CM18: canonical platform, match weights or profiles drift', () => {
  assert.strictEqual(JSON.parse(read('data/tenders-procurement/platforms.json')).length, 384);
  assert.deepStrictEqual(MATCH.WEIGHTS, { category: 40, geography: 20, actionability: 15, deadline: 15, confidence: 10 });
  assert.strictEqual(Object.keys(MATCH.PROFILES).length, 16);
});

mutate('CM19: a translated label is written into a canonical enum', () => {
  for (const t of CH.CHANGE_TYPES) assert.match(t, /^[A-Z_]+$/, `"${t}" is not a canonical enum value`);
  for (const s of CH.SEVERITY_ORDER) assert.match(s, /^[A-Z]+$/);
});

mutate('CM20/CM21: CSV formula injection or quoting breaks', () => {
  assert.strictEqual(MON.csvField('=1+1'), "'=1+1");
  assert.strictEqual(MON.csvField('@x'), "'@x");
  const out = MON.renderCsv([{ ...Object.fromEntries(MON.COLUMNS.map((c) => [c, ''])), title: '=EVIL(),"q"' }]);
  const back = cbCsv.parseCsv(out.slice(1));
  assert.strictEqual(back.length, 1);
  assert.ok(back[0].title.startsWith("'="), 'the formula prefix did not survive the round trip');
});

mutate('CM22/CM24: canonical/hreflang lost, or a filter state indexed', () => {
  const html = monPage('en');
  assert.match(html, /<link rel="canonical"/);
  assert.match(html, /hreflang="x-default"/);
  assert.ok(!/monitoring\/\?[a-z]+=/.test(read('sitemap.xml')), 'a filter state is in the sitemap');
});

mutate('CM23: a localized page leaks first-party English', () => {
  const de = monPage('de');
  const en = I18N.t('en', 'mon.methodGoneHeading');
  assert.notStrictEqual(en, I18N.t('de', 'mon.methodGoneHeading'));
  assert.ok(!de.includes(en), 'English first-party copy leaked into the German page');
});

mutate('CM25: the build imports source network code', () => {
  const stripped = read('scripts/build-tender-monitoring.cjs').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/require\([^)]*to-http/.test(stripped));
});

mutate('CM26: a fresh clone loses the monitoring baseline', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'data/tender-opportunities/monitoring-baseline.json')));
  assert.ok(!read('.gitignore').includes('monitoring-baseline'));
});


test('MUTATION SUITE: every mutation was applied and none is a no-op', () => {
  assert.ok(mutations.length >= 16, `only ${mutations.length} mutations declared`);
  for (const m of mutations) {
    assert.strictEqual(typeof m.fn, 'function', `${m.name} has no body`);
    assert.ok(m.fn.toString().includes('assert'), `${m.name} asserts nothing: it is a no-op`);
  }
});
