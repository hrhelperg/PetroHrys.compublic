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

const ROOT = path.join(__dirname, '..');
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

  const health = readHealth();
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

  // Rebuilt from EVERY valid snapshot on disk, not only the ones this run
  // touched — a single-source refresh must not drop the other eight.
  const rebuild = ingest.rebuildCorpus({ nowIso, dryRun: args.dryRun, log });

  if (!args.dryRun) writeHealth(health, nowIso);

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
  log(`Corpus: ${rebuild.canonical} canonical from ${rebuild.input} source records — ${rebuild.written ? 'written' : 'unchanged'}.`);

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

module.exports = { parseArgs, readHealth, HEALTH_FILE };
