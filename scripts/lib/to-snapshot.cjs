'use strict';

// Snapshot provenance and the FAIL-CLOSED replacement rule.
//
// ── THE FAILURE THIS MODULE EXISTS TO PREVENT ───────────────────────────────
//
// TED has a bad morning. The API returns 200 with an empty `notices` array
// instead of an error. The ingester writes a snapshot with zero records, the
// build runs, and a page that listed two thousand open European tenders now
// lists none — with a "last updated" stamp saying it is fresh. The dataset is
// not merely stale, it is confidently empty, and the previous good copy has
// been overwritten.
//
// Every rule below exists because that sequence has to be impossible, and
// because it is the same class of mistake as the workflow-resume rule this
// project already learned once: a retry may only replace prior work when it is
// demonstrably at least as complete.
//
// ── THE REPLACEMENT RULE ────────────────────────────────────────────────────
//
// A new snapshot replaces the previous one only if ALL hold:
//
//   1. the fetch completed without an HTTP or parse error
//   2. it contains at least MIN_RECORDS records
//   3. every record carries the required identity fields
//   4. its record count has not collapsed against the previous good snapshot
//   5. its duplicate ratio is within bounds
//
// Otherwise the previous snapshot is KEPT and the failure is reported loudly.
// A stale snapshot with an honest date is worth more than a fresh empty one.
//
// Note what rule 4 does NOT do: it does not block growth, and it does not
// block a decline that is merely a decline. Procurement volume genuinely falls
// over Christmas and rises in Q1. It blocks a COLLAPSE — the shape of an
// outage, not of a quiet week.

const crypto = require('node:crypto');

// A source publishing fewer than this many records in its window is more
// likely broken than quiet. Deliberately low: the point is to catch zero and
// near-zero, not to second-guess a small source.
const MIN_RECORDS = 10;

// A new snapshot may not fall below this fraction of the previous good one.
// 0.5 tolerates a genuinely halved week and refuses an outage.
const COLLAPSE_FLOOR = 0.5;

// More than this fraction of records sharing an identity means the source
// changed shape or pagination repeated a page.
const MAX_DUPLICATE_RATIO = 0.2;

// Content hash over the records only — NOT over retrievedAt, which changes
// every run by definition. Hashing the timestamp would make every snapshot
// look different and turn change detection into noise.
function hashRecords(records) {
  const h = crypto.createHash('sha256');
  for (const r of records) h.update(JSON.stringify(r));
  return h.digest('hex');
}

// Provenance carried by every snapshot. Part 27's list, plus the two fields
// that make partial coverage legible: `population` (what the source said
// exists) and `complete` (whether we got all of it).
function buildSnapshot({ source, adapterVersion, retrievedAt, fetchResult, records }) {
  return {
    sourceId: source.id,
    sourceName: source.name,
    platformId: source.platformId,
    endpoint: fetchResult.endpoint || source.endpoint,
    acquisition: source.acquisition,
    reuse: source.reuse,
    storage: source.storage,
    adapterVersion,
    retrievedAt,
    window: source.window,
    pages: fetchResult.pages,
    rawCount: Array.isArray(fetchResult.raw) ? fetchResult.raw.length : 0,
    population: fetchResult.population,
    complete: Boolean(fetchResult.complete),
    recordCount: records.length,
    contentHash: hashRecords(records),
    records,
  };
}

function duplicateRatio(records) {
  if (!records.length) return 0;
  const seen = new Set();
  let dupes = 0;
  for (const r of records) {
    if (seen.has(r.id)) dupes += 1;
    else seen.add(r.id);
  }
  return dupes / records.length;
}

// Decide whether `candidate` may replace `previous`.
//
// Returns { accept, reasons }. `reasons` is populated on rejection AND on
// acceptance-with-notes, because a snapshot that grew 40× is worth a line in
// the log even though it is allowed.
// `allowShrink` is an OPERATOR override, not a configuration default.
//
// The collapse guard is supposed to fire when a source shrinks, and during the
// pilot it did — twice, correctly, when TED and SECOP II were deliberately
// narrowed to biddable notice types and open procedures. Those were intended
// reductions, and the guard could not tell them from an outage because nothing
// in the data distinguishes the two: only a human knows which one happened.
//
// So the guard is never softened. It is overridden explicitly, per run, by
// someone who has just changed the scope and can say so. Every other rule
// still applies — an override permits a smaller snapshot, never an empty or
// malformed one.
function validateReplacement(candidate, previous, { minRecords = MIN_RECORDS, allowShrink = false } = {}) {
  const reasons = [];

  if (!candidate || !Array.isArray(candidate.records)) {
    return { accept: false, reasons: ['candidate snapshot has no records array'] };
  }
  if (candidate.recordCount !== candidate.records.length) {
    reasons.push(`recordCount ${candidate.recordCount} disagrees with ${candidate.records.length} records`);
  }
  if (candidate.recordCount < minRecords) {
    reasons.push(`only ${candidate.recordCount} records (floor is ${minRecords}) — this is the shape of an outage, not a quiet window`);
  }

  const missingIdentity = candidate.records.filter((r) => !r.id || !r.sourceId || !r.sourceNoticeId || !r.sourceUrl);
  if (missingIdentity.length) {
    reasons.push(`${missingIdentity.length} record(s) missing identity or provenance fields`);
  }

  const ratio = duplicateRatio(candidate.records);
  if (ratio > MAX_DUPLICATE_RATIO) {
    reasons.push(`duplicate ratio ${(ratio * 100).toFixed(1)}% exceeds ${(MAX_DUPLICATE_RATIO * 100)}% — pagination may have repeated a page`);
  }

  if (previous && Number.isFinite(previous.recordCount) && previous.recordCount >= minRecords) {
    const floor = Math.floor(previous.recordCount * COLLAPSE_FLOOR);
    if (candidate.recordCount < floor && !allowShrink) {
      reasons.push(`record count collapsed from ${previous.recordCount} to ${candidate.recordCount} `
        + `(floor ${floor}) — keeping the previous snapshot. `
        + 'If this reduction is intended, re-run with --accept-shrink.');
    }
  }

  return { accept: reasons.length === 0, reasons };
}

// Which records changed between two snapshots of the same source.
//
// Amendments are the point (Part 40): a notice whose deadline moved keeps its
// id and changes its content, and this is how that becomes visible without
// storing a full revision history in v1.
function diffSnapshots(previous, candidate) {
  const prev = new Map((previous && previous.records ? previous.records : []).map((r) => [r.id, r]));
  const next = new Map(candidate.records.map((r) => [r.id, r]));
  const added = [];
  const removed = [];
  const changed = [];
  for (const [id, r] of next) {
    if (!prev.has(id)) added.push(id);
    else if (JSON.stringify(prev.get(id)) !== JSON.stringify(r)) changed.push(id);
  }
  for (const id of prev.keys()) if (!next.has(id)) removed.push(id);
  return { added: added.sort(), removed: removed.sort(), changed: changed.sort() };
}

module.exports = {
  MIN_RECORDS, COLLAPSE_FLOOR, MAX_DUPLICATE_RATIO,
  hashRecords, buildSnapshot, duplicateRatio, validateReplacement, diffSnapshots,
};
