'use strict';

// Keeping what a long research run already learned.
//
// ── THE FAILURE THIS EXISTS TO PREVENT ──────────────────────────────────────
//
// Every research script in this repository was written the same way: collect
// findings in an array, await the whole worker pool, then write the file once
// at the end.
//
//   const findings = [];
//   await Promise.all(workers);      // fifty minutes
//   fs.writeFileSync(FINDINGS, ...); // the only durable moment
//
// A 900-record pass was interrupted at roughly minute forty. It had visited
// several hundred sites, formed a verdict on each, and wrote none of them.
// Not one record was corrupted — and not one was kept. The cost of stopping
// was the entire run, which also means the cost of *any* failure near the end
// (a laptop sleeping, a Chrome crash, an OOM) was the entire run. That makes
// long passes untakeable, and the unknown cohort stays unknown for the wrong
// reason.
//
// ── DURABILITY IS A JOURNAL, NOT A BIGGER WRITE ─────────────────────────────
//
// The obvious fix — rewrite the findings file after every record — is worse
// than it looks. The directories findings file is about 3 MB, so 900 records
// means 2.7 GB of writes, and a process killed mid-rewrite leaves a truncated
// JSON file: the one artefact the run cannot afford to lose is now unreadable.
//
// So durability and shape are separated:
//
//   the JOURNAL   one appended line per record, written the instant a verdict
//                 exists. Small, ordered, append-only. A kill -9 can damage at
//                 most its final line, and the reader is built to tolerate
//                 exactly that.
//
//   the FINDINGS  the compacted JSON the rest of the tooling already reads,
//                 written by rename so it is either the old file or the new
//                 one and never a half of either.
//
// Opening a ledger replays the journal over the findings file, so a resumed
// run sees everything the interrupted one learned whether or not it got the
// chance to compact. That is what makes an interrupted run resumable rather
// than merely non-destructive.
//
// ── WHAT A LEDGER MAY NOT DO ────────────────────────────────────────────────
//
// Nothing here writes canonical data. Research observes; the applier decides.
// Keeping those apart is why an interrupted run — or a wrong classifier, which
// this repository has had several of — can always be thrown away by deleting a
// scratch file instead of recovered from git.

const fs = require('node:fs');
const path = require('node:path');
const SAFE = require('./rc-safe-apply.cjs');

// ── 1. ATOMIC REPLACEMENT ───────────────────────────────────────────────────
//
// Same directory, so the rename cannot cross a filesystem boundary and
// degrade into a copy. fsync before rename: a rename is atomic with respect to
// other processes, but without the flush a power loss can publish the new name
// pointing at unwritten blocks.
function writeAtomic(file, text) {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.tmp-${process.pid}`);
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeFileSync(fd, text);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

// ── 2. IDENTITY ─────────────────────────────────────────────────────────────
//
// Resume identity is the canonical identity contract — country plus host, and
// for tenders the path too — never the array index and never the position in
// the findings file. Two records can share a domain across countries, records
// are reordered by every generator that sorts, and an index-keyed checkpoint
// would silently research one record while marking another done.
//
// The id travels alongside because the applier addresses records by id. When
// the two disagree the identity wins for resume decisions, because the id is
// assigned by us and the identity is a fact about the world.
function targetKey(collection, record) {
  return `${collection}|${SAFE.identityKey(collection, record)}`;
}

// ── 3. THE LEDGER ───────────────────────────────────────────────────────────

const JOURNAL_SUFFIX = '.journal';

class Ledger {
  constructor(file, { batch = 10 } = {}) {
    this.file = file;
    this.journalFile = file + JOURNAL_SUFFIX;
    this.batch = batch;
    this.byKey = new Map();
    this.meta = {};
    this.pending = 0;
    this.journal = null;
    this.recovered = 0;
    this.damaged = 0;
    this.load();
  }

  // Findings first, then the journal on top: the journal is always the newer
  // half, because a record reaches it before it can reach a compaction.
  load() {
    if (fs.existsSync(this.file)) {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      const { findings = [], ...meta } = parsed;
      this.meta = meta;
      for (const f of findings) this.byKey.set(f.key || `${f.collection}|${f.id}`, f);
    }
    if (!fs.existsSync(this.journalFile)) return;
    const lines = fs.readFileSync(this.journalFile, 'utf8').split('\n').filter(Boolean);
    for (const [i, line] of lines.entries()) {
      let f = null;
      try {
        f = JSON.parse(line);
      } catch {
        // A torn final line is the expected shape of a hard kill, and it costs
        // exactly one record. A torn line anywhere else means something else
        // wrote here, which is worth saying out loud rather than swallowing.
        this.damaged += 1;
        if (i !== lines.length - 1) {
          console.warn(`  checkpoint: unreadable journal line ${i + 1} of ${lines.length}, skipped`);
        }
        continue;
      }
      if (!f || !f.key) { this.damaged += 1; continue; }
      if (!this.byKey.has(f.key)) this.recovered += 1;
      this.byKey.set(f.key, f);
    }
  }

  // Already researched, so a resumed run does not pay for it twice. A caller
  // that genuinely wants a record re-visited says so explicitly (--refresh);
  // there is no implicit staleness rule, because "re-research everything older
  // than N days" is how a good finding gets replaced by a bad one.
  has(key) { return this.byKey.has(key); }

  get(key) { return this.byKey.get(key) || null; }

  size() { return this.byKey.size; }

  // The durable moment. A verdict is on disk before the next navigation
  // starts, so the worst an interruption can cost is the record in flight.
  record(finding) {
    if (!finding || !finding.key) throw new Error('a finding without an identity key cannot be checkpointed');
    this.byKey.set(finding.key, finding);
    if (!this.journal) this.journal = fs.openSync(this.journalFile, 'a');
    fs.writeSync(this.journal, `${JSON.stringify(finding)}\n`);
    this.pending += 1;
    // Small batches, not every record: fsync is the expensive part, and ten
    // records of exposure against a 3 MB compaction per record is the trade
    // this file exists to make.
    if (this.pending >= this.batch) this.sync();
  }

  sync() {
    if (this.journal !== null && this.pending) {
      try { fs.fsyncSync(this.journal); } catch { /* the write is still in the page cache */ }
    }
    this.pending = 0;
  }

  // Fold the journal into the findings file and drop it. Called at the end of
  // a run and at the start of the next one, so the journal never grows without
  // bound and the findings file is always the whole truth afterwards.
  compact(extraMeta = {}) {
    this.sync();
    if (this.journal !== null) { fs.closeSync(this.journal); this.journal = null; }
    const findings = [...this.byKey.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
    writeAtomic(this.file, `${JSON.stringify({
      ...this.meta, ...extraMeta, findings,
    }, null, 1)}\n`);
    if (fs.existsSync(this.journalFile)) fs.unlinkSync(this.journalFile);
    return findings.length;
  }

  all() { return [...this.byKey.values()].sort((a, b) => (a.key < b.key ? -1 : 1)); }

  close() { if (this.journal !== null) { fs.closeSync(this.journal); this.journal = null; } }
}

// ── 4. FINDINGS THAT PREDATE THE IDENTITY KEY ───────────────────────────────
//
// 800 findings were written before checkpointing existed, keyed by nothing at
// all. Loaded as-is they fall under a fallback key that no target will ever
// ask for, so a resumed run would treat every one of them as unresearched and
// spend an hour rediscovering answers it already had — the precise waste this
// file exists to prevent, reintroduced by the upgrade itself.
//
// The backfill is a pure renaming: `resolve` maps a stored finding to the same
// identity its target would compute, and a finding whose record has since been
// deleted or renamed keeps its old key rather than being dropped. Nothing is
// re-judged and no evidence changes.
function backfillKeys(ledger, resolve) {
  let moved = 0;
  for (const [key, f] of [...ledger.byKey.entries()]) {
    if (f.key) continue;
    const proper = resolve(f);
    if (!proper || proper === key) continue;
    ledger.byKey.delete(key);
    ledger.byKey.set(proper, { ...f, key: proper });
    moved += 1;
  }
  return moved;
}

// ── 5. RUNNING WITH ONE ─────────────────────────────────────────────────────
//
// Signal handling belongs here rather than in each research script, because
// every script that forgets it reintroduces the original defect. SIGINT and
// SIGTERM compact and leave a clean findings file; SIGKILL cannot be caught
// and does not need to be, because the journal already holds the answer.
function onInterrupt(ledger, label = 'research') {
  let closing = false;
  const handler = (sig) => {
    if (closing) return;
    closing = true;
    const n = ledger.compact();
    console.log(`\n${label}: interrupted by ${sig}. ${n} finding(s) kept on disk; rerun to resume.`);
    process.exit(130);
  };
  process.on('SIGINT', () => handler('SIGINT'));
  process.on('SIGTERM', () => handler('SIGTERM'));
  return handler;
}

module.exports = {
  Ledger, targetKey, writeAtomic, onInterrupt, backfillKeys, JOURNAL_SUFFIX,
};
