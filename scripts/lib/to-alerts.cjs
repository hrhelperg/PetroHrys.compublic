'use strict';

// Tender Alerts & Monitoring v1 — alert derivation.
//
// A change is a fact about a procurement. An ALERT is a change that matters to
// a particular supplier profile, with the reason stated. This module turns the
// first into the second, and refuses several tempting shortcuts on the way.
//
// ── WHAT AN ALERT IS NOT ────────────────────────────────────────────────────
//
// Not a recommendation, not a probability, not a prediction. The matching
// engine is FROZEN for this phase — this module calls it and never tunes it.
// Severity means monitoring urgency, never business impact.
//
// ── THE SUPPRESSIONS THAT MAKE THE FEED TRUSTWORTHY ─────────────────────────
//
// Three, and each exists because the naive version produces a feed nobody can
// use:
//
//   1. A degraded source cannot generate disappearance alerts. Otherwise one
//      outage emits thousands of fake removals — the loudest possible way to
//      be wrong.
//   2. A cancelled or awarded opportunity is never actionable, whatever its
//      match score. Telling a supplier to bid on a cancelled procedure is the
//      one error that costs them real work.
//   3. One canonical change produces at most one alert per profile, however
//      many sources published it. TED and BOAMP announcing the same French
//      deadline extension is one event.

const MATCH = require('./to-match.cjs');
const SCHEMA = require('./to-schema.cjs');
const CHANGES = require('./to-changes.cjs');

// Only these change types are worth a supplier's attention at all. The rest
// stay in the ledger as observability, which is where bookkeeping belongs.
const ALERTABLE_TYPES = new Set([
  'NEW_OPPORTUNITY', 'CANCELLED', 'AWARDED', 'REOPENED', 'STATUS_CHANGED',
  'DEADLINE_EXTENDED', 'DEADLINE_SHORTENED', 'DEADLINE_SET',
  'DEADLINE_CHANGED_UNCOMPARABLE', 'VALUE_CHANGED', 'CLASSIFICATION_CHANGED',
  'SUBMISSION_ROUTE_CHANGED', 'MATERIAL_TEXT_CHANGED', 'SOURCE_OCCURRENCE_ADDED',
  'NO_LONGER_OBSERVED',
]);

// A profile only hears about a change if the opportunity is a real match.
// GOOD is the floor: below it the corpus would drown every profile in
// everything, which is the same as no filter at all.
const MATCH_FLOOR = 65;

// Source states in which a disappearance means nothing. Anything other than a
// clean, complete success is grounds to stay silent about a record vanishing.
const HEALTHY_STATES = new Set(['HEALTHY']);

function sourceIsTrustworthyForRemoval(sourceId, health) {
  const h = health && health[sourceId];
  if (!h) return false;                       // unknown health: say nothing
  if (!HEALTHY_STATES.has(h.state)) return false;
  if (h.promoted === false) return false;     // retained last-good, not refreshed
  if (h.completeness !== 'COMPLETE') return false; // a bounded window drops records normally
  return true;
}

// ── ACTIONS ─────────────────────────────────────────────────────────────────
//
// Reuses the established vocabulary. A homepage is never a submission route,
// and platform-level submission capability is never promoted to notice level.
function actionsFor(o) {
  const out = [];
  if (o.sourceUrl) out.push('VIEW_NOTICE');
  if (o.submissionUrl && o.electronicSubmission === 'yes') out.push('SUBMIT');
  else if (o.submissionUrl) out.push('VIEW_SUBMISSION_ROUTE');
  if (!SCHEMA.isCurrent(o)) return ['VIEW_NOTICE']; // nothing else is honest
  out.push('MONITOR');
  return [...new Set(out)];
}

// ── EXPLANATIONS ────────────────────────────────────────────────────────────
//
// Reason codes, not prose, so the page can translate them and a test can
// assert every one has a translation. Detail is carried separately.
function reasonsFor(change, match, o) {
  const reasons = [{ code: `CHANGE_${change.type}` }];
  const primary = match.reasons.find((r) => r.key === 'CLASSIFICATION_PRIMARY'
    || r.key === 'CLASSIFICATION_SECONDARY' || r.key === 'TITLE_TERM');
  if (primary) {
    reasons.push({
      code: `MATCH_${primary.key}`,
      detail: primary.detail && primary.detail.code
        ? { scheme: primary.detail.scheme, code: primary.detail.code }
        : primary.detail,
    });
  }
  if (change.type === 'DEADLINE_EXTENDED' || change.type === 'DEADLINE_SHORTENED') {
    reasons.push({ code: 'DEADLINE_DELTA', detail: { days: change.detail && change.detail.days } });
  }
  if (change.type === 'SOURCE_OCCURRENCE_ADDED' && change.detail) {
    reasons.push({ code: 'SECOND_SOURCE', detail: { added: change.detail.added } });
  }
  if (o.multiSource) reasons.push({ code: 'CONFIRMED_BY_TWO_SOURCES' });
  return reasons;
}

// Uncertainty travels with the alert, not in a footnote. Foreign eligibility
// is always here: no pilot source states it per notice, and the platform's
// value is never inherited.
function uncertaintyFor(change, o, match) {
  const u = new Set(match ? match.uncertainty : []);
  u.add('FOREIGN_ELIGIBILITY_NOT_STATED');
  if (change.type === 'DEADLINE_CHANGED_UNCOMPARABLE') u.add('DEADLINE_NOT_COMPARABLE');
  if (change.type === 'NO_LONGER_OBSERVED') u.add('ABSENCE_IS_NOT_CLOSURE');
  if (change.type === 'VALUE_CHANGED' && change.detail && change.detail.comparable === false) {
    u.add('VALUE_CURRENCY_CHANGED_NOT_COMPARABLE');
  }
  if (change.type === 'NEW_OPPORTUNITY') u.add('NEW_MEANS_NEWLY_OBSERVED');
  return [...u].sort();
}

function alertId(changeId, profileKey) {
  return `alert_${changeId.replace(/^chg_/, '')}_${profileKey}`;
}

// Build alert candidates for one change.
//
// `opportunity` may be absent for NO_LONGER_OBSERVED, where the record is gone
// from the current corpus by definition; the caller supplies its last known
// form so the alert can still say what disappeared.
function candidatesForChange(change, opportunity, { nowIso, platformsById, profiles }) {
  if (!ALERTABLE_TYPES.has(change.type)) return [];
  const o = opportunity;
  if (!o) return [];

  const out = [];
  for (const profileKey of profiles) {
    const match = MATCH.matchFor(o, profileKey, {
      nowIso, platform: platformsById.get(o.sourcePlatformId),
    });
    if (match.score < MATCH_FLOOR) continue;

    // A cancelled or awarded procurement is still worth KNOWING about — that
    // is the point of monitoring — but it is never actionable.
    const current = SCHEMA.isCurrent(o);
    const actionable = change.actionable && current;

    out.push({
      id: alertId(change.id, profileKey),
      changeId: change.id,
      opportunityId: o.id,
      supplierProfile: profileKey,
      changeType: change.type,
      severity: change.severity,
      actionable,
      matchScore: match.score,
      matchBand: match.band,
      before: change.before,
      after: change.after,
      detail: change.detail || null,
      reasons: reasonsFor(change, match, o),
      uncertainty: uncertaintyFor(change, o, match),
      actions: actionsFor(o),
      sourceIds: [...new Set((o.occurrences || []).map((x) => x.sourceId))].sort(),
      sourcePlatformId: o.sourcePlatformId,
      status: o.status,
      current,
    });
  }
  return out;
}

// Deterministic ordering: severity, then match score, then id. Never array
// arrival order, which would make the digest depend on Map traversal.
function compareAlerts(a, b) {
  const s = CHANGES.SEVERITY_ORDER.indexOf(a.severity) - CHANGES.SEVERITY_ORDER.indexOf(b.severity);
  if (s !== 0) return s;
  if (a.matchScore !== b.matchScore) return b.matchScore - a.matchScore;
  return a.id < b.id ? -1 : 1;
}

// ── THE ENGINE ──────────────────────────────────────────────────────────────
//
// previous baseline + current corpus + source health -> { changes, alerts }
//
// On the FIRST run there is no baseline. It returns BASELINE_INITIALIZED with
// zero changes rather than declaring 9,577 opportunities new — installing the
// monitor is not a procurement event.
function detect({ baseline, corpus, health, nowIso, platformsById, profiles = Object.keys(MATCH.PROFILES) }) {
  const current = new Map(corpus.opportunities.map((o) => [o.id, o]));
  const nextEntries = {};
  for (const [id, o] of current) nextEntries[id] = CHANGES.baselineEntry(o);

  if (!baseline || !baseline.entries || Object.keys(baseline.entries).length === 0) {
    return {
      state: 'BASELINE_INITIALIZED',
      changes: [],
      alerts: [],
      nextBaseline: { version: 1, generatedAt: nowIso, entries: nextEntries },
      stats: { observed: current.size, changes: 0, alerts: 0, suppressedRemovals: 0, suppressedDuplicates: 0 },
    };
  }

  const prevEntries = baseline.entries;
  const changes = [];
  let suppressedRemovals = 0;

  // Appeared and modified.
  for (const [id, o] of current) {
    const prev = prevEntries[id];
    if (!prev) {
      changes.push({
        id: CHANGES.changeId(id, 'NEW_OPPORTUNITY', null, nextEntries[id].s),
        opportunityId: id,
        type: 'NEW_OPPORTUNITY',
        severity: CHANGES.SEVERITY.NEW_OPPORTUNITY,
        actionable: true,
        before: null,
        after: nextEntries[id].s,
      });
      continue;
    }
    changes.push(...CHANGES.changesBetween(id, prev, nextEntries[id]));
  }

  // Disappeared — the dangerous direction.
  for (const id of Object.keys(prevEntries)) {
    if (current.has(id)) continue;
    const sourceId = id.split(':')[0];
    if (!sourceIsTrustworthyForRemoval(sourceId, health)) {
      // The source is degraded, retained, or its window is partial. A record
      // absent under those conditions says nothing about the procurement.
      suppressedRemovals += 1;
      continue;
    }
    changes.push({
      id: CHANGES.changeId(id, 'NO_LONGER_OBSERVED', prevEntries[id].s, null),
      opportunityId: id,
      type: 'NO_LONGER_OBSERVED',
      severity: CHANGES.SEVERITY.NO_LONGER_OBSERVED,
      actionable: false,
      before: prevEntries[id].s,
      after: null,
    });
  }

  changes.sort((a, b) => (a.id < b.id ? -1 : 1));

  const alerts = [];
  const seen = new Set();
  let suppressedDuplicates = 0;
  for (const c of changes) {
    for (const a of candidatesForChange(c, current.get(c.opportunityId), { nowIso, platformsById, profiles })) {
      // One canonical change, one alert per profile — however many sources
      // carried it.
      const key = `${a.changeId}|${a.supplierProfile}`;
      if (seen.has(key)) { suppressedDuplicates += 1; continue; }
      seen.add(key);
      alerts.push(a);
    }
  }
  alerts.sort(compareAlerts);

  return {
    state: 'COMPARED',
    changes,
    alerts,
    nextBaseline: { version: 1, generatedAt: nowIso, entries: nextEntries },
    stats: {
      observed: current.size,
      changes: changes.length,
      alerts: alerts.length,
      suppressedRemovals,
      suppressedDuplicates,
    },
  };
}

module.exports = {
  ALERTABLE_TYPES, MATCH_FLOOR, HEALTHY_STATES,
  sourceIsTrustworthyForRemoval, actionsFor, reasonsFor, uncertaintyFor,
  alertId, candidatesForChange, compareAlerts, detect,
};
