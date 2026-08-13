'use strict';

// Tender Alerts & Monitoring v1 — the change detector.
//
// Offline. Reads the committed corpus, the committed monitoring baseline and
// the committed refresh state; writes an updated baseline and a bounded change
// ledger. No network, and a test asserts it cannot reach one.
//
//   node scripts/detect-tender-changes.cjs            detect and persist
//   node scripts/detect-tender-changes.cjs --dry-run  report, write nothing
//
// Intended to run immediately after a successful refresh, before the
// generators. The scheduled workflow can call it once Phase 5B is verified;
// until then it is run by hand, and the page says so.
//
// ── WHY THE BASELINE IS COMMITTED ───────────────────────────────────────────
//
// Phase 5 found that a comparison baseline living in a gitignored file means a
// fresh CI clone has nothing to compare against. For an alert engine the
// failure mode is worse than an empty corpus: it would report every one of
// 9,577 opportunities as NEW on the first scheduled run and mail that to
// everyone. So the baseline is small, semantic, and tracked.

const fs = require('node:fs');
const path = require('node:path');
const CORPUS = require('./lib/to-corpus.cjs');
const ALERTS = require('./lib/to-alerts.cjs');
const CHANGES = require('./lib/to-changes.cjs');
const TP = require('./lib/tp-schema.cjs');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'data', 'tender-opportunities');
const CORPUS_FILE = path.join(DIR, 'opportunities.json');
const BASELINE_FILE = path.join(DIR, 'monitoring-baseline.json');
const LEDGER_FILE = path.join(DIR, 'change-ledger.json');
const STATE_FILE = path.join(DIR, 'refresh-state.json');
const PLATFORMS_FILE = path.join(ROOT, 'data', 'tenders-procurement', 'platforms.json');
const COUNTRIES_FILE = path.join(ROOT, 'data', 'business-directories', 'countries.json');

// ── LEDGER RETENTION ────────────────────────────────────────────────────────
//
// Bounded, and bounded by COUNT rather than by age, because age cannot be
// enforced until there is a run history to measure. 2,000 entries at roughly
// 240 bytes each is well under a megabyte, and the storage section of the docs
// carries the measurement rather than a guess.
//
// Retention is a ceiling, not a promise of history: the ledger is observability
// for recent runs, not an archive.
const LEDGER_MAX = 2000;

const log = (m) => process.stdout.write(`${m}\n`);
const readJson = (f, fb) => {
  if (!fs.existsSync(f)) return fb;
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; }
};

// Stable stringify: object key order must not depend on construction order, or
// two runs over identical data would produce different bytes.
function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v === undefined ? null : v);
}

function writeIfChanged(file, content) {
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (existing === content) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return true;
}

// Compare on entries, not on the whole file: a new generatedAt is not news.
function writeBaselineIfEntriesChanged(next) {
  const existing = readJson(BASELINE_FILE, null);
  if (existing && stable(existing.entries || {}) === stable(next.entries)) return false;
  fs.mkdirSync(path.dirname(BASELINE_FILE), { recursive: true });
  fs.writeFileSync(BASELINE_FILE, `${stable(next)}\n`);
  return true;
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const nowIso = new Date().toISOString();

  if (!fs.existsSync(CORPUS_FILE)) {
    log('No corpus; nothing to monitor.');
    return;
  }
  const corpus = CORPUS.decode(JSON.parse(fs.readFileSync(CORPUS_FILE, 'utf8')));
  const baseline = readJson(BASELINE_FILE, null);
  const refreshState = readJson(STATE_FILE, { sources: {} });

  const countries = readJson(COUNTRIES_FILE, []);
  const countryIso = new Map(countries.map((c) => [c.slug, c.iso2 || null]));
  const platformsById = new Map(
    TP.loadPlatforms(PLATFORMS_FILE, countryIso).map((p) => [p.id, p]),
  );

  const result = ALERTS.detect({
    baseline,
    corpus,
    health: refreshState.sources,
    nowIso,
    platformsById,
  });

  if (result.state === 'BASELINE_INITIALIZED') {
    log(`Monitoring baseline INITIALIZED over ${result.stats.observed} opportunities.`);
    log('No alerts: installing a monitor is not a procurement event. Changes are');
    log('detected from the next run onward.');
  } else {
    const byType = {};
    for (const c of result.changes) byType[c.type] = (byType[c.type] || 0) + 1;
    log(`Changes: ${result.stats.changes} across ${result.stats.observed} opportunities.`);
    for (const [t, n] of Object.entries(byType).sort()) log(`  ${t.padEnd(32)} ${n}`);
    log(`Alerts: ${result.stats.alerts}`);
    if (result.stats.suppressedRemovals) {
      log(`  ${result.stats.suppressedRemovals} disappearance(s) SUPPRESSED — source not known-healthy.`);
    }
    if (result.stats.suppressedDuplicates) {
      log(`  ${result.stats.suppressedDuplicates} duplicate alert(s) suppressed.`);
    }
  }

  // The ledger keeps the most recent entries, newest first, bounded.
  const previousLedger = readJson(LEDGER_FILE, { version: 1, entries: [] });
  const seen = new Set(previousLedger.entries.map((e) => e.id));
  const fresh = result.changes.filter((c) => !seen.has(c.id))
    .map((c) => ({ ...c, observedAt: nowIso }));
  const ledger = {
    version: 1,
    // Not a claim of completeness — see LEDGER_MAX.
    retention: { maxEntries: LEDGER_MAX },
    entries: [...fresh, ...previousLedger.entries].slice(0, LEDGER_MAX),
  };

  if (dryRun) {
    log(`\nDry run: ${fresh.length} new ledger entry(ies) would be recorded.`);
    return;
  }

  // The baseline carries generatedAt, which moves on every run by definition.
  // Writing it verbatim would commit a file daily whose only change is the
  // clock — the churn Part 38 rules out. Compared on ENTRIES alone; the
  // timestamp rides along only when something actually changed.
  const b = writeBaselineIfEntriesChanged(result.nextBaseline);
  const l = writeIfChanged(LEDGER_FILE, `${stable(ledger)}\n`);
  log(`\nBaseline ${b ? 'updated' : 'unchanged'}; ledger ${l ? 'updated' : 'unchanged'} `
    + `(${ledger.entries.length}/${LEDGER_MAX} entries).`);
}

if (require.main === module) main();
module.exports = { LEDGER_MAX, BASELINE_FILE, LEDGER_FILE, stable, writeBaselineIfEntriesChanged };
