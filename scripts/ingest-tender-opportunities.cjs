'use strict';

// Tender Opportunity ingestion — THE ONLY SCRIPT IN THIS REPOSITORY THAT USES
// THE NETWORK.
//
// ── THE BOUNDARY ────────────────────────────────────────────────────────────
//
//   node scripts/ingest-tender-opportunities.cjs      ← network, run by hand
//        ↓ writes data/tender-opportunities/*.json
//   node scripts/build-tender-opportunities.cjs       ← offline, part of the build
//
// The site build reads the committed snapshot and never calls out. That is not
// a preference: PetroHrys.com is served as static files from a repository with
// no build step and no dependencies, and a page that needs TED to be reachable
// in order to render is a page that disappears when Brussels has an outage.
//
// A test asserts that no build script can reach to-http.cjs, transitively.
//
// ── WHAT A RUN DOES ─────────────────────────────────────────────────────────
//
//   1. fetch each source's bounded window, sequentially, politely
//   2. strip personal fields from every raw record, before normalization
//   3. normalize into canonical opportunities
//   4. validate the candidate snapshot against the previous good one
//   5. REPLACE only if it passes; otherwise KEEP the previous and say so
//   6. deduplicate across sources into canonical opportunities
//   7. write the snapshot + the merged corpus
//
// Step 5 is the one that matters. A source that fails leaves its last good
// snapshot untouched and the run continues with the other four — one API
// having a bad morning must not empty the dataset.
//
// Usage:
//   node scripts/ingest-tender-opportunities.cjs                 all sources
//   node scripts/ingest-tender-opportunities.cjs --source ted    one source
//   node scripts/ingest-tender-opportunities.cjs --dry-run       fetch, write nothing
//   node scripts/ingest-tender-opportunities.cjs --accept-shrink  allow an
//        intended reduction in scope past the collapse guard

const fs = require('node:fs');
const path = require('node:path');

const SOURCES = require('./lib/to-sources.cjs');
const ADAPTERS = require('./lib/to-adapters/index.cjs');
const SCHEMA = require('./lib/to-schema.cjs');
const SNAP = require('./lib/to-snapshot.cjs');
const DEDUPE = require('./lib/to-dedupe.cjs');
const TP = require('./lib/tp-schema.cjs');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data', 'tender-opportunities');
const SNAPSHOT_DIR = path.join(DATA_DIR, 'snapshots');
const CORPUS_FILE = path.join(DATA_DIR, 'opportunities.json');
const PLATFORMS_FILE = path.join(ROOT, 'data', 'tenders-procurement', 'platforms.json');
const COUNTRIES_FILE = path.join(ROOT, 'data', 'business-directories', 'countries.json');

// Bumped when an adapter's normalization changes in a way that alters output.
// Recorded in every snapshot so a corpus built by an older adapter is
// identifiable rather than mysterious.
const ADAPTER_VERSION = '1.0.0';

const log = (msg) => { process.stdout.write(`${msg}\n`); };

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

// Stable stringify so the same corpus is the same bytes. Object key order in
// JS is insertion order, and two runs that build a record by different code
// paths would otherwise produce different files with identical meaning.
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

function writeIfChanged(file, content) {
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (existing === content) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return true;
}

async function ingestSource(source, ctx) {
  const adapter = ADAPTERS.adapterFor(source.id);
  const snapshotFile = path.join(SNAPSHOT_DIR, `${source.id}.json`);
  const previous = readJson(snapshotFile, null);

  let fetchResult;
  try {
    fetchResult = await adapter.fetchAll({ source, nowIso: ctx.nowIso, log });
  } catch (e) {
    // FAIL CLOSED. The previous snapshot survives untouched.
    log(`  ✗ ${source.id}: fetch failed — ${e.message}`);
    log(`    keeping the previous snapshot (${previous ? previous.recordCount : 0} records, `
      + `retrieved ${previous ? previous.retrievedAt : 'never'}).`);
    return { source, ok: false, kept: true, previous, error: e.message };
  }

  // Personal fields go before anything else touches the record, so no code
  // path downstream can see an officer's email even by accident.
  const stripped = fetchResult.raw.map(SOURCES.stripPersonalFields);

  const records = [];
  const rejected = [];
  for (const raw of stripped) {
    let rec = null;
    try {
      rec = adapter.normalize(raw, {
        source, nowIso: ctx.nowIso, knownCountrySlugs: ctx.knownCountrySlugs,
      });
    } catch (e) {
      rejected.push({ reason: `normalize threw: ${e.message}` });
      continue;
    }
    if (!rec) { rejected.push({ reason: 'normalize rejected the record' }); continue; }

    // Free-text fields are redacted centrally rather than per adapter, so a
    // sixth adapter cannot forget. See redactPersonalText for why prose is
    // redacted and structured contact fields are dropped outright.
    for (const f of ['title', 'descriptionSummary', 'buyerName']) {
      if (typeof rec[f] === 'string') rec[f] = SOURCES.redactPersonalText(rec[f]);
    }
    if (rec.titles) {
      for (const k of Object.keys(rec.titles)) rec.titles[k] = SOURCES.redactPersonalText(rec.titles[k]);
    }
    // A source classified MINIMAL_METADATA contributes no description text,
    // enforced here so the policy cannot be bypassed by an adapter change.
    // Everything else is cut to a genuine summary — see shortSummary.
    rec.descriptionSummary = SOURCES.mayStoreDescription(source.id)
      ? SOURCES.shortSummary(rec.descriptionSummary) : null;

    const problems = SCHEMA.problemsFor({ ...rec, occurrences: [{ sourceId: rec.sourceId, sourceNoticeId: rec.sourceNoticeId, sourceUrl: rec.sourceUrl }] }, ctx.knownPlatformIds);
    if (problems.length) { rejected.push({ id: rec.id, reason: problems[0] }); continue; }
    records.push(rec);
  }

  // ── ONE RECORD PER NOTICE, HOLDING CURRENT STATE ──────────────────────────
  //
  // OCDS is a stream of RELEASES: one tender publishes an initial release and
  // one more for every amendment, all sharing an ocid. The pilot's first UK
  // window returned 1,181 releases carrying 1,072 distinct tenders.
  //
  // A snapshot is current state, not an event log, so releases collapse to the
  // latest per identity. Keeping all of them would inflate the corpus by 10%
  // with rows that are the same tender at an earlier moment — and would make
  // "1,181 opportunities" a claim about our pagination rather than about
  // British procurement.
  const byId = new Map();
  let superseded = 0;
  const stamp = (r) => (r.sourceModifiedDate && r.sourceModifiedDate.iso)
    || (r.publicationDate && r.publicationDate.iso) || '';
  for (const r of records) {
    const prev = byId.get(r.id);
    if (!prev) { byId.set(r.id, r); continue; }
    superseded += 1;
    // Later release wins. Ties break on identity so the result is the same
    // whatever order the API paged them in.
    if (stamp(r) > stamp(prev)) byId.set(r.id, { ...r, hasAmendments: true });
    else byId.set(r.id, { ...prev, hasAmendments: true });
  }
  const deduped = [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
  if (superseded) {
    log(`  · ${source.id}: ${superseded} superseded release(s) collapsed into their current notice.`);
  }
  records.length = 0;
  records.push(...deduped);

  const candidate = SNAP.buildSnapshot({
    source, adapterVersion: ADAPTER_VERSION, retrievedAt: ctx.nowIso, fetchResult, records,
  });

  const verdict = SNAP.validateReplacement(candidate, previous, { allowShrink: ctx.acceptShrink });
  if (!verdict.accept) {
    log(`  ✗ ${source.id}: candidate snapshot REJECTED`);
    for (const r of verdict.reasons) log(`      ${r}`);
    log(`    keeping the previous snapshot (${previous ? previous.recordCount : 0} records).`);
    return { source, ok: false, kept: true, previous, candidate, reasons: verdict.reasons };
  }

  const diff = SNAP.diffSnapshots(previous, candidate);
  log(`  ✓ ${source.id}: ${candidate.recordCount} records`
    + `${candidate.population !== null ? ` of ${candidate.population}` : ''}`
    + ` · ${candidate.complete ? 'complete' : 'PARTIAL'} window`
    + ` · +${diff.added.length} ~${diff.changed.length} -${diff.removed.length}`
    + `${rejected.length ? ` · ${rejected.length} rejected` : ''}`);

  if (!ctx.dryRun) writeIfChanged(snapshotFile, `${JSON.stringify(candidate, null, 2)}\n`);
  return { source, ok: true, kept: false, snapshot: candidate, diff, rejected };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const only = args.includes('--source') ? args[args.indexOf('--source') + 1] : null;
  // Re-merge the corpus from snapshots already on disk, with no network at all.
  // Used when normalization or dedup changes but the fetched data has not.
  const rebuildOnly = args.includes('--rebuild-only');
  // Deliberate scope reductions need a human to say so. See validateReplacement.
  const acceptShrink = args.includes('--accept-shrink');

  // The one timestamp for the whole run. Calling Date.now() per source would
  // make two records ingested a second apart disagree about what "now" is.
  const nowIso = new Date().toISOString();

  const platforms = readJson(PLATFORMS_FILE, []);
  const knownPlatformIds = new Set(platforms.map((p) => p.id));
  const countries = readJson(COUNTRIES_FILE, []);
  const knownCountrySlugs = new Set(countries.map((c) => c.slug));

  const selected = rebuildOnly ? [] : (only ? SOURCES.SOURCES.filter((s) => s.id === only) : SOURCES.SOURCES);
  if (!selected.length && !rebuildOnly) {
    log(`No such source "${only}". Known: ${SOURCES.sourceIds().join(', ')}`);
    process.exitCode = 1;
    return;
  }

  log(rebuildOnly
    ? `Tender opportunity corpus rebuild from snapshots (no network), ${nowIso}`
    : `Tender opportunity ingestion — ${selected.length} source(s), ${nowIso}`);
  if (dryRun) log('DRY RUN: nothing will be written.');

  const ctx = { nowIso, knownPlatformIds, knownCountrySlugs, dryRun, acceptShrink };
  const results = [];
  for (const source of selected) {
    // Sequential on purpose. See the rate-discipline note in to-http.cjs.
    // eslint-disable-next-line no-await-in-loop
    results.push(await ingestSource(source, ctx));
  }

  // Rebuild the merged corpus from EVERY snapshot on disk — including the
  // ones this run kept rather than replaced. A single-source run must not
  // silently drop the other four sources from the corpus.
  const all = [];
  for (const s of SOURCES.SOURCES) {
    const snap = readJson(path.join(SNAPSHOT_DIR, `${s.id}.json`), null);
    if (snap && Array.isArray(snap.records)) all.push(...snap.records);
  }

  const { canonical, stats, possible } = DEDUPE.dedupe(all);

  const corpus = {
    generatedAt: nowIso,
    adapterVersion: ADAPTER_VERSION,
    sources: SOURCES.SOURCES.map((s) => {
      const snap = readJson(path.join(SNAPSHOT_DIR, `${s.id}.json`), null);
      return {
        id: s.id,
        name: s.name,
        platformId: s.platformId,
        acquisition: s.acquisition,
        reuse: s.reuse,
        storage: s.storage,
        attributionRequired: s.attributionRequired,
        retrievedAt: snap ? snap.retrievedAt : null,
        recordCount: snap ? snap.recordCount : 0,
        population: snap ? snap.population : null,
        complete: snap ? snap.complete : false,
        window: s.window,
      };
    }),
    stats,
    // Candidate duplicates that were deliberately NOT merged. Published so the
    // decision is inspectable rather than invisible.
    possibleDuplicates: possible,
    opportunities: canonical,
  };

  if (!dryRun) {
    const changed = writeIfChanged(CORPUS_FILE, `${stableStringify(corpus)}\n`);
    log(`\nCorpus: ${stats.canonical} canonical opportunities from ${stats.input} source records `
      + `(${stats.groupsMerged} merge group(s), ${stats.multiSource} multi-source, `
      + `${stats.possiblePairs} possible duplicate(s) left separate). ${changed ? 'written' : 'unchanged'}.`);
  } else {
    log(`\nCorpus (dry run): ${stats.canonical} canonical from ${stats.input} source records.`);
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    log(`\n${failed.length} source(s) failed and kept their previous snapshot: `
      + `${failed.map((f) => f.source.id).join(', ')}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((e) => { log(`FATAL: ${e.stack || e.message}`); process.exitCode = 1; });
}

module.exports = { ADAPTER_VERSION, stableStringify };
