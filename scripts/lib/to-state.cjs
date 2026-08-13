'use strict';

// Durable refresh state — the thing that makes scheduled ingestion safe.
//
// ── THE BUG THIS MODULE EXISTS TO FIX ───────────────────────────────────────
//
// Phase 3 built fail-closed retention and Phase 4 watched it work: a source
// 429s, its previous snapshot is kept, the corpus survives. That guarantee was
// real, and it was entirely dependent on state that only existed on the
// machine that had run the previous refresh.
//
// The snapshots directory is gitignored — correctly, it is 19 MB — and the
// health file lived inside it. So a fresh clone has no snapshots and no
// health. A fresh clone is exactly what a CI runner is.
//
// Running the existing rebuild on a fresh clone was measured, not theorised:
//
//     Corpus: 0 canonical opportunities from 0 source records. written.
//
// Zero. Written. A scheduled job would have destroyed 9,572 opportunities on
// its first run, and every guard in the system would have reported success,
// because every guard was watching the source layer while the corpus quietly
// rebuilt itself out of nothing.
//
// ── THE FIX: THE CORPUS IS THE LAST-GOOD STORE ──────────────────────────────
//
// The committed corpus already contains every promoted record, each carrying
// its `sourceId` and full occurrence provenance. It IS the last-good state,
// durable by construction, already in git, already the thing the build reads.
//
// So the rebuild no longer reads snapshots alone. It reads:
//
//     for each source:
//       a fresh candidate snapshot if this run promoted one
//       otherwise the records that source contributed to the committed corpus
//
// A source that fails now retains its data on any machine, including one that
// has never seen it before. The snapshots directory becomes what it always
// should have been: a local cache that makes a re-run faster, not the only
// copy of the truth.
//
// ── AND A SMALL COMMITTED STATE FILE ────────────────────────────────────────
//
// Record data lives in the corpus. What the corpus cannot carry is operational
// memory: how many times a source has failed in a row, when it last succeeded,
// which failure class. That is a few hundred bytes per source, it must survive
// a fresh clone to be worth anything, and it is committed for that reason.
//
// It is kept deliberately small and deliberately free of anything that changes
// when nothing happened — see `factualState`.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..', '..');
const STATE_FILE = path.join(ROOT, 'data', 'tender-opportunities', 'refresh-state.json');

const STATE_VERSION = 1;

function read() {
  if (!fs.existsSync(STATE_FILE)) return { version: STATE_VERSION, sources: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return { version: parsed.version || STATE_VERSION, sources: parsed.sources || {} };
  } catch {
    // A corrupt state file must not stop a refresh. Losing operational memory
    // degrades reporting; refusing to run degrades the data.
    return { version: STATE_VERSION, sources: {} };
  }
}

// ── WHAT COUNTS AS A CHANGE WORTH COMMITTING ────────────────────────────────
//
// `lastAttemptAt` moves on every run by definition. If the state file were
// written verbatim each time, a daily scheduler would produce a daily commit
// that says only "the job ran" — the churn Part 8 rules out.
//
// So the file is rewritten only when something an operator would care about
// changed: a health state, a failure class, a record count, a snapshot
// fingerprint, a promotion. Attempt timestamps ride along with those changes
// rather than causing them.
const OPERATIONAL_KEYS = ['state', 'lastErrorClass', 'promotedRecordCount',
  'retainedRecordCount', 'consecutiveFailures', 'snapshotHash', 'completeness'];

function factualState(state) {
  const out = {};
  for (const [id, s] of Object.entries(state.sources || {})) {
    out[id] = Object.fromEntries(OPERATIONAL_KEYS.map((k) => [k, s[k] === undefined ? null : s[k]]));
  }
  return out;
}

function write(state, { dryRun = false } = {}) {
  const ordered = {
    version: STATE_VERSION,
    sources: Object.fromEntries(Object.keys(state.sources).sort()
      .map((k) => [k, sortKeys(state.sources[k])])),
  };
  const next = `${JSON.stringify(ordered, null, 2)}\n`;
  if (fs.existsSync(STATE_FILE)) {
    const existingRaw = fs.readFileSync(STATE_FILE, 'utf8');
    if (existingRaw === next) return false;
    try {
      const a = JSON.stringify(factualState(JSON.parse(existingRaw)));
      const b = JSON.stringify(factualState(ordered));
      if (a === b) return false; // only the clock moved
    } catch { /* unreadable: fall through and replace */ }
  }
  if (dryRun) return true;
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, next);
  return true;
}

function sortKeys(o) {
  return Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
}

// ── LAST-GOOD RECONSTRUCTION ────────────────────────────────────────────────
//
// Group the committed corpus's records back into per-source record sets, so a
// source with no fresh snapshot still contributes what it contributed last
// time. Occurrences are the key: a canonical opportunity merged from TED and
// BOAMP must return a record to BOTH sources, or a merge would silently delete
// one side's data the first time the other source refreshed alone.
function lastGoodBySource(corpus) {
  const bySource = new Map();
  for (const o of (corpus && corpus.opportunities) || []) {
    for (const occ of o.occurrences || []) {
      if (!occ.sourceId) continue;
      if (!bySource.has(occ.sourceId)) bySource.set(occ.sourceId, []);
      // Reconstruct the source-shaped record from the canonical one. Field
      // provenance is not perfectly invertible after a merge, which is why
      // this is a RETENTION path and not a substitute for fetching: it keeps
      // the opportunity alive and visible, it does not claim to be fresh.
      bySource.get(occ.sourceId).push({
        ...o,
        sourceId: occ.sourceId,
        sourcePlatformId: occ.sourcePlatformId || o.sourcePlatformId,
        sourceNoticeId: occ.sourceNoticeId,
        sourceUrl: occ.sourceUrl,
        id: `${occ.sourceId}:${slug(occ.sourceNoticeId)}`,
        occurrences: undefined,
        fieldSources: undefined,
        multiSource: undefined,
        occurrenceCount: undefined,
      });
    }
  }
  for (const [k, v] of bySource) {
    bySource.set(k, v.map((r) => Object.fromEntries(
      Object.entries(r).filter(([, val]) => val !== undefined),
    )));
  }
  return bySource;
}

const slug = (s) => String(s || '').normalize('NFKD')
  .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').toLowerCase();

function fingerprint(records) {
  const h = crypto.createHash('sha256');
  for (const r of records) h.update(String(r.id));
  return h.digest('hex').slice(0, 16);
}

module.exports = {
  STATE_FILE, STATE_VERSION, OPERATIONAL_KEYS,
  read, write, factualState, lastGoodBySource, fingerprint,
};
