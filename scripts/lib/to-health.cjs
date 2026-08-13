'use strict';

// Source health — operational state, kept strictly apart from procurement
// intelligence.
//
// ── THE SEPARATION THAT MATTERS ─────────────────────────────────────────────
//
// A source being unreachable says nothing about the tenders it published last
// week. They are still open, the buyer still wants bids, and the deadline has
// not moved. Letting source health touch tender status or match score would
// mean a French outage quietly demoting French procurement — an operational
// fact leaking into a factual one.
//
// So health lives here, is consumed only by the orchestrator and by the
// freshness line on the page, and is never an input to matching. A test
// asserts the match engine cannot even see it.
//
// ── WHY IT IS NOT COMMITTED ─────────────────────────────────────────────────
//
// Health is a property of THIS machine's ingestion history: when it last ran,
// what it saw, how many times in a row a source failed. It changes on every
// run by definition, so committing it would add a diff to every refresh that
// says nothing about procurement — the exact churn Part 21 rules out.
//
// It sits beside the snapshots, under the same gitignore, because it is the
// same kind of thing: local operational cache, rebuildable by running.

const STATES = ['HEALTHY', 'DEGRADED', 'FAILING', 'RATE_LIMITED', 'AUTH_REQUIRED', 'UNKNOWN'];

// Failure classes. "Network error" is not a diagnosis — a 429 and a schema
// change need opposite responses, and calling both "failed" loses the only
// information that would tell an operator which.
const FAILURE_CLASSES = [
  'RATE_LIMITED',
  'AUTH_REQUIRED',
  'TRANSPORT',
  'TIMEOUT',
  'WAF',
  'SCHEMA_CHANGED',
  'INVALID_PAYLOAD',
  'EMPTY_UNEXPECTED',
  'PAGINATION_FAILED',
  'POLICY_RESTRICTED',
];

// Classify a thrown error into an operational class. Deliberately conservative:
// anything unrecognised is TRANSPORT rather than a confident wrong label.
function classifyFailure(err) {
  if (!err) return 'TRANSPORT';
  const status = err.status || (err.cause && err.cause.status);
  const msg = String(err.message || '');
  if (status === 429) return 'RATE_LIMITED';
  if (/HTTP 404|HTTP 410/.test(msg)) return 'SCHEMA_CHANGED';
  if (/HTTP 429/.test(msg)) return 'RATE_LIMITED';
  if (/HTTP 401/.test(msg)) return 'AUTH_REQUIRED';
  if (/HTTP 403/.test(msg)) return 'WAF';
  if (status === 401) return 'AUTH_REQUIRED';
  if (status === 403) return /waf|forbidden|cloudflare|captcha/i.test(msg) ? 'WAF' : 'AUTH_REQUIRED';
  // A 404 on an endpoint that worked yesterday is the API moving, not the
  // network failing. Calling it TRANSPORT sends an operator to check
  // connectivity when the fix is to read the provider's changelog.
  if (status === 404 || status === 410) return 'SCHEMA_CHANGED';
  if (/abort|timed? ?out/i.test(msg)) return 'TIMEOUT';
  if (/was not JSON|Unexpected token|Corrupt|Unsupported ZIP|Not a ZIP/i.test(msg)) return 'INVALID_PAYLOAD';
  if (/no column for|missing column|not a canonical/i.test(msg)) return 'SCHEMA_CHANGED';
  if (/paging|pagination|cursor/i.test(msg)) return 'PAGINATION_FAILED';
  return 'TRANSPORT';
}

// Two consecutive failures is a bad day; four is a broken source. The point of
// DEGRADED is that an operator sees it before the data is stale enough to
// matter.
const DEGRADED_AFTER = 2;
const FAILING_AFTER = 4;

function stateFor(entry) {
  if (!entry || !entry.lastAttemptAt) return 'UNKNOWN';
  if (entry.lastResult === 'SUCCESS') return 'HEALTHY';
  if (entry.lastErrorClass === 'RATE_LIMITED') return 'RATE_LIMITED';
  if (entry.lastErrorClass === 'AUTH_REQUIRED') return 'AUTH_REQUIRED';
  const n = entry.consecutiveFailures || 0;
  if (n >= FAILING_AFTER) return 'FAILING';
  if (n >= DEGRADED_AFTER) return 'DEGRADED';
  return 'DEGRADED';
}

// How long a source may go without a successful refresh before its data should
// be described as stale. Derived from the source's own update frequency rather
// than a single global number: a daily export and a continuous API decay at
// different rates.
function staleAfterHours(source) {
  const freq = String((source && source.updateFrequency) || '').toLowerCase();
  if (freq.includes('continuous')) return 48;
  if (freq.includes('daily')) return 72;
  return 168; // a week, for anything slower or unstated
}

// STALE is a statement about FRESHNESS CONFIDENCE, never about the tenders.
// A stale source does not cancel anything and does not change a status.
function isStale(entry, source, nowIso) {
  if (!entry || !entry.lastSuccessfulAt) return true;
  const hours = (Date.parse(nowIso) - Date.parse(entry.lastSuccessfulAt)) / 3600000;
  return hours > staleAfterHours(source);
}

function recordAttempt(previous, { sourceId, nowIso, result, errorClass = null, recordCount = null, snapshotHash = null, window = null }) {
  const prior = previous || { sourceId, consecutiveFailures: 0 };
  const entry = {
    sourceId,
    lastAttemptAt: nowIso,
    lastResult: result,
    lastErrorClass: result === 'SUCCESS' ? null : errorClass,
    lastSuccessfulAt: result === 'SUCCESS' ? nowIso : (prior.lastSuccessfulAt || null),
    lastSuccessfulRecordCount: result === 'SUCCESS'
      ? recordCount : (prior.lastSuccessfulRecordCount ?? null),
    consecutiveFailures: result === 'SUCCESS' ? 0 : (prior.consecutiveFailures || 0) + 1,
    snapshotHash: result === 'SUCCESS' ? snapshotHash : (prior.snapshotHash || null),
    window: window || prior.window || null,
  };
  entry.state = stateFor(entry);
  return entry;
}

module.exports = {
  STATES, FAILURE_CLASSES, DEGRADED_AFTER, FAILING_AFTER,
  classifyFailure, stateFor, staleAfterHours, isStale, recordAttempt,
};
