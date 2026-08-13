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
