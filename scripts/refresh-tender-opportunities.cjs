'use strict';

// The refresh orchestrator — Phase 3.
//
// ── WHAT THIS IS, AND WHAT IT IS NOT ────────────────────────────────────────
//
// It is a deterministic, runnable orchestration layer that can later be put on
// a schedule without redesign. It is NOT a scheduler, and no cron is deployed:
// see docs/TENDER-OPPORTUNITY-PHASE3.md for why automatic commits to a
// repository that humans also work in is the wrong default.
//
// The state achieved is SCHEDULE_READY. Saying PRODUCTION_SCHEDULED would be a
// claim about infrastructure that does not exist.
//
//   node scripts/refresh-tender-opportunities.cjs --all
//   node scripts/refresh-tender-opportunities.cjs --source ted --source boamp
//   node scripts/refresh-tender-opportunities.cjs --all --dry-run
//
// ── SOURCE ISOLATION IS THE WHOLE POINT ─────────────────────────────────────
//
// One source failing must not touch any other. Each is fetched, validated and
// promoted independently; a failure keeps that source's previous snapshot and
// the run continues. The canonical corpus is then rebuilt from whatever valid
// per-source state exists on disk — the fresh snapshots and the retained ones
// alike.
//
// So the interesting case is not "everything worked". It is:
//
//   TED succeeds        → new snapshot promoted
//   CanadaBuys fails    → previous snapshot retained, run continues
//   BOAMP succeeds      → new snapshot promoted
//   corpus rebuilt from all three valid states
//
// which is tested live, not only with fixtures.
//
// ── IDEMPOTENCE ─────────────────────────────────────────────────────────────
//
// Refreshing unchanged source data produces NO corpus write. The corpus
// carries `generatedAt` and per-source `retrievedAt`, which change on every run
// by definition — so before writing, the candidate corpus is compared against
// the existing one with those timestamps masked out. Identical facts, no diff.
//
// Without that, every refresh would commit a corpus whose only change was the
// time it ran, and the git history would fill with noise that says nothing
// about procurement.

const fs = require('node:fs');
const path = require('node:path');

const SOURCES = require('./lib/to-sources.cjs');
const HEALTH = require('./lib/to-health.cjs');
const ingest = require('./ingest-tender-opportunities.cjs');
const STATE = require('./lib/to-state.cjs');

const ROOT = path.join(__dirname, '..');
const LOCK_FILE = path.join(ROOT, 'data', 'tender-opportunities', 'snapshots', '.refresh.lock');

// ── CONCURRENCY ─────────────────────────────────────────────────────────────
//
// Two refreshes writing the same corpus is the failure that produces a
// plausible file nobody can explain. The scheduler enforces one job at a time
// (see the workflow's `concurrency` block) but a workflow guard does not
// protect a human running the script while a job is in flight, and a process
// killed mid-run must not lock the repository forever.
//
// So: an on-disk lock carrying its own pid and start time, with a staleness
// bound. It is deliberately not a distributed lock — the scheduler is the
// authority for CI, this is the local backstop.
const LOCK_STALE_MS = 45 * 60 * 1000;

function acquireLock({ nowIso, force = false }) {
  fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });
  if (fs.existsSync(LOCK_FILE) && !force) {
    let held = null;
    try { held = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8')); } catch { held = null; }
    const age = held && held.startedAt ? Date.parse(nowIso) - Date.parse(held.startedAt) : Infinity;
    if (held && age < LOCK_STALE_MS) {
      return { ok: false, held, ageMinutes: Math.round(age / 60000) };
    }
    // Stale: the holder died. Reclaiming is safe and is reported, never silent.
    return { ok: true, reclaimed: held };
  }
  fs.writeFileSync(LOCK_FILE, `${JSON.stringify({ pid: process.pid, startedAt: nowIso }, null, 2)}\n`);
  return { ok: true };
}

function releaseLock() {
  if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
}
const DATA_DIR = path.join(ROOT, 'data', 'tender-opportunities');
const HEALTH_FILE = path.join(DATA_DIR, 'snapshots', '.source-health.json');

const log = (msg) => { process.stdout.write(`${msg}\n`); };

function readHealth() {
  if (!fs.existsSync(HEALTH_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(HEALTH_FILE, 'utf8')).sources || {}; } catch { return {}; }
}

function writeHealth(sources, nowIso) {
  fs.mkdirSync(path.dirname(HEALTH_FILE), { recursive: true });
  const ordered = Object.fromEntries(Object.keys(sources).sort().map((k) => [k, sources[k]]));
  fs.writeFileSync(HEALTH_FILE, `${JSON.stringify({ updatedAt: nowIso, sources: ordered }, null, 2)}\n`);
}

function parseArgs(argv) {
  const only = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--source' && argv[i + 1]) { only.push(argv[i + 1]); i += 1; }
  }
  return {
    all: argv.includes('--all') || only.length === 0,
    only,
    dryRun: argv.includes('--dry-run'),
    acceptShrink: argv.includes('--accept-shrink'),
    force: argv.includes('--force'),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const nowIso = new Date().toISOString();

  const enabled = SOURCES.ENABLED();
  const selected = args.only.length
    ? enabled.filter((s) => args.only.includes(s.id))
    : enabled;

  const unknown = args.only.filter((id) => !enabled.some((s) => s.id === id));
  if (unknown.length) {
    const registered = SOURCES.SOURCES.filter((s) => unknown.includes(s.id));
    for (const s of registered) {
      log(`  ! ${s.id} is registered but not enabled (${s.readyState || 'disabled'}); skipping.`);
    }
    const absent = unknown.filter((id) => !registered.some((s) => s.id === id));
    if (absent.length) {
      log(`No such source: ${absent.join(', ')}. Enabled: ${SOURCES.sourceIds().join(', ')}`);
      process.exitCode = 1;
      return;
    }
  }
  if (!selected.length) { log('Nothing to refresh.'); return; }

  log(`Refresh — ${selected.length} source(s) of ${enabled.length} enabled, ${nowIso}`);
  if (args.dryRun) log('DRY RUN: nothing will be written.');

  const lock = acquireLock({ nowIso, force: args.force });
  if (!lock.ok) {
    log(`Refusing to start: another refresh has held the lock for ${lock.ageMinutes} minute(s) `
      + `(pid ${lock.held.pid}, since ${lock.held.startedAt}).`);
    log('Use --force only if that process is known to be gone.');
    process.exitCode = 1;
    return;
  }
  if (lock.reclaimed) {
    log(`Reclaimed a stale lock from pid ${lock.reclaimed.pid} (started ${lock.reclaimed.startedAt}).`);
  }

  const health = readHealth();
  const durable = STATE.read();
  const outcomes = [];

  // Sequential by design. Bounded concurrency would shorten a run that already
  // takes a couple of minutes, at the cost of pointing several parallel
  // requests at public infrastructure. See the rate note in to-http.cjs.
  for (const source of selected) {
    // eslint-disable-next-line no-await-in-loop
    const r = await ingest.ingestSource(source, {
      nowIso,
      knownPlatformIds: ingest.knownPlatformIds(),
      knownCountrySlugs: ingest.knownCountrySlugs(),
      dryRun: args.dryRun,
      acceptShrink: args.acceptShrink,
      log,
    });
    outcomes.push(r);

    health[source.id] = HEALTH.recordAttempt(health[source.id], {
      sourceId: source.id,
      nowIso,
      result: r.ok ? 'SUCCESS' : 'FAILURE',
      errorClass: r.ok ? null : HEALTH.classifyFailure(r.errorObject || new Error(r.error || (r.reasons || []).join('; '))),
      recordCount: r.ok ? r.snapshot.recordCount : null,
      snapshotHash: r.ok ? r.snapshot.contentHash : null,
      window: source.window,
    });
  }

  // Rebuilt from every valid source state — fresh snapshots for what promoted,
  // retained last-good from the committed corpus for what did not.
  const rebuild = ingest.rebuildCorpus({ nowIso, dryRun: args.dryRun, log });

  // Durable operational memory, committed, so a fresh CI clone knows what
  // happened last time. Records live in the corpus; this carries only what the
  // corpus cannot say.
  for (const r of outcomes) {
    const h = health[r.source.id] || {};
    const prev = durable.sources[r.source.id] || {};
    durable.sources[r.source.id] = {
      sourceId: r.source.id,
      state: h.state || 'UNKNOWN',
      lastAttemptAt: nowIso,
      lastSuccessAt: h.lastSuccessfulAt || prev.lastSuccessAt || null,
      lastErrorClass: h.lastErrorClass || null,
      consecutiveFailures: h.consecutiveFailures || 0,
      promoted: Boolean(r.ok),
      promotedRecordCount: r.ok ? r.snapshot.recordCount : null,
      // What the corpus is actually carrying for this source right now —
      // freshly promoted, or retained from before.
      retainedRecordCount: r.ok ? null : (prev.promotedRecordCount ?? prev.retainedRecordCount ?? null),
      snapshotHash: r.ok ? r.snapshot.contentHash : (prev.snapshotHash || null),
      // Completeness is a property of the window strategy, never of transport
      // success. It is copied from the snapshot, not inferred from a 200.
      completeness: r.ok ? (r.snapshot.complete ? 'COMPLETE' : 'PARTIAL')
        : (prev.completeness || 'UNKNOWN'),
      window: r.source.window,
    };
  }
  const stateChanged = STATE.write(durable, { dryRun: args.dryRun });

  if (!args.dryRun) writeHealth(health, nowIso);
  releaseLock();

  const ok = outcomes.filter((r) => r.ok);
  const failed = outcomes.filter((r) => !r.ok);

  log('');
  log(`Refreshed ${ok.length}/${outcomes.length} source(s).`);
  if (failed.length) {
    for (const f of failed) {
      const h = health[f.source.id];
      log(`  ✗ ${f.source.id}: ${h.lastErrorClass} — previous snapshot retained `
        + `(${h.lastSuccessfulRecordCount ?? 0} records from ${h.lastSuccessfulAt || 'never'}), state ${h.state}`);
    }
  }
  if (rebuild.refused) {
    log(`Corpus: PROMOTION REFUSED — ${rebuild.refused.length} problem(s). Published corpus unchanged.`);
  } else {
    log(`Corpus: ${rebuild.canonical} canonical from ${rebuild.input} source records — `
      + `${rebuild.written ? 'written' : 'unchanged'}. Durable state ${stateChanged ? 'updated' : 'unchanged'}.`);
  }

  // ── OVERALL RUN STATUS ───────────────────────────────────────────────────
  // Not "all sources worked" and not "something failed". A run where one
  // source 429s and its last-good is retained is DEGRADED: the corpus is safe,
  // and pretending it is HEALTHY hides the thing an operator needs to see.
  const status = rebuild.refused ? 'FAILED' : (failed.length ? 'DEGRADED' : 'HEALTHY');
  log(`Run status: ${status}`);
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT,
      `status=${status}\nchanged=${rebuild.written || stateChanged}\n`
      + `promoted=${ok.length}\nretained=${failed.length}\ncanonical=${rebuild.canonical}\n`);
  }

  const stale = selected.filter((s) => HEALTH.isStale(health[s.id], s, nowIso));
  if (stale.length) log(`Stale (freshness confidence reduced, tenders unaffected): ${stale.map((s) => s.id).join(', ')}`);

  // A failed source is reported but does not fail the run: the whole design is
  // that eight good sources are still worth publishing when one is down.
  if (failed.length === outcomes.length) {
    log('Every selected source failed — treating the run as failed.');
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((e) => { log(`FATAL: ${e.stack || e.message}`); process.exitCode = 1; });
}

module.exports = { parseArgs, readHealth, HEALTH_FILE, LOCK_FILE, acquireLock, releaseLock, LOCK_STALE_MS };
