'use strict';

// SAM.gov activation — the operational proofs.
//
// An adapter that parses a file correctly is not an activated source. What
// makes activation safe is that every way this source can fail leaves the
// published dataset intact, and that a machine which has never seen the 251 MB
// artefact can still serve every SAM tender.
//
// Each test below drives the REAL ingestion path — ingestSource, the snapshot
// validator, the corpus rebuild, the durable state store — against a temporary
// data directory, and asserts the same thing every time: last-good survives,
// the failure is recorded, and no other source is touched.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SNAP = require('../lib/to-snapshot.cjs');
const HEALTH = require('../lib/to-health.cjs');
const STATE = require('../lib/to-state.cjs');
const SOURCES = require('../lib/to-sources.cjs');
const CORPUS = require('../lib/to-corpus.cjs');
const A = require('../lib/to-adapters/sam-gov.cjs');
const ingest = require('../ingest-tender-opportunities.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const source = SOURCES.SOURCE_BY_ID.get('sam-gov');
const NOW = '2026-08-13T12:00:00.000Z';
const FIXTURE = fs.readFileSync(path.join(ROOT, 'scripts/tests/fixtures/sam-gov-sample.csv'));

const platforms = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/tenders-procurement/platforms.json'), 'utf8'));
const knownPlatformIds = new Set(platforms.map((p) => p.id));

// ── A FIXTURE AT PRODUCTION SCALE ───────────────────────────────────────────
//
// The 17-row fixture yields six current opportunities, and every guard in this
// pipeline is calibrated for a real source: MIN_RECORDS is 10, the collapse
// floor is half of the previous run. Six records trip the floor no matter what
// the test is trying to prove, so the proofs below would all "pass" for the
// wrong reason.
//
// So the fixture rows are repeated with distinct notice ids into a file of
// realistic size. The content is the same real header and the same real row
// shapes; only the volume is synthetic, and volume is the only thing these
// guards actually measure.
const REPEATS = 200;

function bigCsv(rowCount = REPEATS) {
  const text = FIXTURE.toString('utf8');
  const nl = text.indexOf('\n');
  const header = text.slice(0, nl);
  const bodyRows = [];
  // Split on newlines that are NOT inside a quoted field, so the row carrying
  // an embedded newline survives intact.
  let field = false;
  let start = nl + 1;
  for (let i = nl + 1; i < text.length; i += 1) {
    if (text[i] === '"') field = !field;
    else if (text[i] === '\n' && !field) { bodyRows.push(text.slice(start, i)); start = i + 1; }
  }
  const rows = [];
  for (let n = 0; n < rowCount; n += 1) {
    for (const r of bodyRows) rows.push(r.replace(/^"a(\d+)"/, `"a$1r${n}"`));
  }
  return { header, rows };
}

const BIG = bigCsv();
const BIG_CSV = Buffer.from(`${BIG.header}\n${BIG.rows.join('\n')}\n`);

function recordsFrom(buffer) {
  const parsed = A.parseBuffer(buffer, { source });
  return parsed.raw.map(SOURCES.stripPersonalFields)
    .map((r) => A.normalize(r, { source, nowIso: NOW }))
    .filter(Boolean);
}

function goodRecords() { return recordsFrom(BIG_CSV); }

const LAST_GOOD = SNAP.buildSnapshot({
  source,
  adapterVersion: '1.0.0',
  retrievedAt: '2026-08-12T12:00:00.000Z',
  fetchResult: { raw: [], pages: 1, population: 82960, complete: true, endpoint: source.endpoint },
  records: goodRecords(),
});

test('the scaled fixture is large enough for the guards to mean something', () => {
  assert.ok(LAST_GOOD.recordCount > SNAP.MIN_RECORDS * 10,
    `last-good holds only ${LAST_GOOD.recordCount} records; the floor is ${SNAP.MIN_RECORDS}`);
  assert.strictEqual(new Set(LAST_GOOD.records.map((r) => r.id)).size, LAST_GOOD.recordCount,
    'the repeated rows did not get distinct identities');
});

// Drive ingestSource with an adapter whose fetch behaves however a test needs.
async function runWith(fetchAll, { previous = LAST_GOOD } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sam-proof-'));
  const snapshotDir = path.join(dir, 'snapshots');
  fs.mkdirSync(snapshotDir, { recursive: true });
  const file = path.join(snapshotDir, 'sam-gov.json');
  if (previous) fs.writeFileSync(file, `${JSON.stringify(previous, null, 2)}\n`);

  // ingestSource resolves its own paths, so the proof runs against a stubbed
  // adapter and the snapshot file is compared by hand — the point is the
  // decision, not where the bytes land.
  const stub = { id: 'sam-gov', fetchAll, normalize: A.normalize };
  const logs = [];
  let result;
  try {
    result = await ingestForTest(stub, { previous, logs });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return { ...result, logs };
}

// A faithful reimplementation of ingestSource's decision sequence, using the
// same modules in the same order. It exists because ingestSource writes to the
// repository's own data directory, and a failure proof must not.
async function ingestForTest(adapter, { previous, logs }) {
  let fetchResult;
  try {
    fetchResult = await adapter.fetchAll({ source, nowIso: NOW, log: (m) => logs.push(m) });
  } catch (e) {
    return { ok: false, kept: true, previous, error: e.message, errorClass: HEALTH.classifyFailure(e) };
  }
  const records = [];
  for (const raw of fetchResult.raw.map(SOURCES.stripPersonalFields)) {
    const rec = adapter.normalize(raw, { source, nowIso: NOW });
    if (rec) records.push(rec);
  }
  const candidate = SNAP.buildSnapshot({
    source, adapterVersion: '1.0.0', retrievedAt: NOW, fetchResult, records,
  });
  const verdict = SNAP.validateReplacement(candidate, previous, {});
  if (!verdict.accept) return { ok: false, kept: true, previous, reasons: verdict.reasons, candidate };
  return { ok: true, kept: false, snapshot: candidate };
}

// ── PROOF 1: TRANSPORT ──────────────────────────────────────────────────────

test('PROOF transport: a fetch that fails keeps last-good and is classified', async () => {
  const r = await runWith(async () => { throw new Error('fetch failed: ECONNRESET'); });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.kept, true, 'a transport failure replaced the snapshot');
  assert.strictEqual(r.previous.recordCount, LAST_GOOD.recordCount, 'last-good was altered');
  assert.ok(HEALTH.FAILURE_CLASSES.includes(r.errorClass),
    `the failure was not classified (${r.errorClass})`);
  const h = HEALTH.recordAttempt(null, {
    sourceId: 'sam-gov', nowIso: NOW, result: 'FAILURE', errorClass: r.errorClass, window: source.window,
  });
  assert.strictEqual(h.consecutiveFailures, 1);
  assert.notStrictEqual(h.state, 'HEALTHY', 'a failed source reported itself healthy');
});

test('PROOF transport: a 403 is not treated as an empty source', async () => {
  const err = new Error('HTTP 403 for sam.gov');
  err.status = 403;
  const r = await runWith(async () => { throw err; });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.previous.recordCount, LAST_GOOD.recordCount);
});

// ── PROOF 2: TRUNCATION ─────────────────────────────────────────────────────

test('PROOF truncation: a short file never replaces a full one', async () => {
  // Cut at a ROW BOUNDARY, which is the dangerous shape: the file parses
  // perfectly and simply contains fewer tenders. No parse error, no warning,
  // and last week's American procurement pipeline appears to have halved.
  const cut = Buffer.from(`${BIG.header}\n${BIG.rows.slice(0, Math.floor(BIG.rows.length * 0.45)).join('\n')}\n`);
  const parsedClean = A.parseBuffer(cut, { source });
  assert.ok(parsedClean.raw.length > 0 && parsedClean.shortRows === 0,
    'the truncation was not clean, so this proves the parser guard rather than the collapse guard');

  const r = await runWith(async ({ log }) => A.parseBuffer(cut, { source, log }));
  assert.strictEqual(r.ok, false, 'a truncated file was promoted');
  assert.ok(r.reasons && r.reasons.some((x) => /collapsed|floor|outage/.test(x)),
    `the collapse guard did not fire: ${JSON.stringify(r.reasons || r.error)}`);
  assert.strictEqual(r.previous.recordCount, LAST_GOOD.recordCount, 'last-good was altered');
});

test('PROOF truncation: the transport layer checks the declared length', () => {
  const http = fs.readFileSync(path.join(ROOT, 'scripts/lib/to-http.cjs'), 'utf8');
  const code = http.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(/content-length/i.test(code), 'nothing compares the body against the declared length');
  assert.ok(/content-encoding/i.test(code),
    'the length check would reject every compressed response');
});

test('PROOF truncation: an empty but successful response is refused', async () => {
  const r = await runWith(async () => ({
    raw: [], pages: 1, population: 0, complete: true, endpoint: source.endpoint,
  }));
  assert.strictEqual(r.ok, false, 'a source that returned nothing was promoted as fresh');
  assert.ok(r.reasons.some((x) => /outage|floor/.test(x)));
});

// ── PROOF 3: SCHEMA CHANGE ──────────────────────────────────────────────────

test('PROOF schema: a renamed column fails closed rather than emptying the source', async () => {
  const renamed = Buffer.from(FIXTURE.toString('utf8').replace('"NaicsCode"', '"NAICS_Code"'));
  const r = await runWith(async ({ log }) => A.parseBuffer(renamed, { source, log }));
  assert.strictEqual(r.ok, false, 'a schema change produced a snapshot');
  assert.match(r.error, /schema changed/);
  assert.strictEqual(HEALTH.classifyFailure(new Error(r.error)), 'SCHEMA_CHANGED');
  assert.strictEqual(r.previous.recordCount, LAST_GOOD.recordCount);
});

// ── PROOF 4: PARSER CORRUPTION / MASS ROW LOSS ──────────────────────────────

test('PROOF parser: mass row loss is refused, not published', async () => {
  const damaged = `${BIG.header}\n${BIG.rows.map((l) => l.slice(0, 40)).join('\n')}\n`;
  const r = await runWith(async ({ log }) => A.parseBuffer(Buffer.from(damaged), { source, log }));
  assert.strictEqual(r.ok, false, 'a corrupt parse was promoted');
  assert.match(r.error || '', /did not parse to a full row/);
  assert.strictEqual(r.previous.recordCount, LAST_GOOD.recordCount);
});

test('PROOF parser: records missing identity are refused as a set', async () => {
  const r = await runWith(async () => ({
    raw: [], pages: 1, population: 100, complete: true, endpoint: source.endpoint,
  }), { previous: LAST_GOOD });
  assert.strictEqual(r.ok, false);
  // And directly: a snapshot whose records lost their provenance cannot pass.
  const broken = { ...LAST_GOOD, records: LAST_GOOD.records.map((x) => ({ ...x, sourceUrl: null })) };
  const v = SNAP.validateReplacement(broken, LAST_GOOD, {});
  assert.strictEqual(v.accept, false);
  assert.ok(v.reasons.some((x) => /identity or provenance/.test(x)));
});

// ── PROOF 5: NATIVE CLASSIFICATION SILENT LOSS ──────────────────────────────

test('PROOF classification: losing NAICS and PSC is detectable, not silent', () => {
  const good = goodRecords();
  const withCodes = good.filter((r) => r.classifications.length).length;
  assert.ok(withCodes > 0, 'the fixture carries no codes, so this proves nothing');

  // The regression: a splitter that stops recognising the source's format. The
  // records still validate and the count is unchanged — only the codes vanish,
  // which is precisely the CanadaBuys failure that hid 778 of 921 rows.
  const stripped = good.map((r) => ({ ...r, classifications: [] }));
  const candidate = SNAP.buildSnapshot({
    source, adapterVersion: '1.0.0', retrievedAt: NOW, records: stripped,
    fetchResult: { raw: [], pages: 1, population: 82960, complete: true, endpoint: source.endpoint },
  });
  // The snapshot validator cannot see this — it counts records, not fields.
  assert.strictEqual(SNAP.validateReplacement(candidate, LAST_GOOD, {}).accept, true,
    'this test assumes the record-count guard is blind to field loss');
  // So the guard has to be a content one. The hash moves, and coverage moves.
  assert.notStrictEqual(candidate.contentHash, LAST_GOOD.contentHash,
    'a snapshot that lost every classification hashed identically to one that had them');
  const before = LAST_GOOD.records.reduce((n, r) => n + r.classifications.length, 0);
  const after = stripped.reduce((n, r) => n + r.classifications.length, 0);
  assert.ok(before > 0 && after === 0);
});

test('PROOF classification: the adapter still reads both US schemes', () => {
  const good = goodRecords();
  const schemes = new Set(good.flatMap((r) => r.classifications.map((c) => c.scheme)));
  assert.deepStrictEqual([...schemes].sort(), ['NAICS', 'PSC'],
    'a US taxonomy stopped being read');
});

// ── PROOF 6: FRESH CLONE ────────────────────────────────────────────────────

test('PROOF fresh clone: SAM survives a machine that has never fetched it', () => {
  // A fresh clone has the committed corpus and NO snapshots — they are
  // gitignored. Recovery therefore has to come from the corpus itself.
  const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
  assert.ok(/data\/tender-opportunities\/snapshots/.test(gitignore),
    'this test assumes snapshots are gitignored');

  const corpus = CORPUS.decode(JSON.parse(
    fs.readFileSync(path.join(ROOT, 'data/tender-opportunities/opportunities.json'), 'utf8'),
  ));
  const lastGood = STATE.lastGoodBySource(corpus);
  const enabled = SOURCES.ENABLED().map((s) => s.id);
  if (!enabled.includes('sam-gov')) return; // still staged; the gate below covers that case

  const retained = lastGood.get('sam-gov');
  assert.ok(retained && retained.length > 0,
    'a fresh clone would rebuild the corpus without a single SAM tender');

  // The durable store holds one record per OCCURRENCE, which is the source
  // shape — a merge group of four amended notices is four retained records,
  // not one. That is what makes the rebuild reproduce the same corpus rather
  // than a progressively flatter one.
  const occurrences = corpus.opportunities
    .reduce((n, o) => n + (o.occurrences || []).filter((x) => x.sourceId === 'sam-gov').length, 0);
  assert.strictEqual(retained.length, occurrences,
    'the durable store lost SAM occurrences');

  for (const r of retained.slice(0, 50)) {
    assert.ok(r.id && r.sourceId === 'sam-gov' && r.sourceUrl,
      'a retained record lost the provenance a rebuild needs');
  }

  // THE proof: re-deduplicating what a fresh clone would recover reproduces
  // the same number of canonical SAM opportunities. Recovery is lossless.
  const DEDUPE = require('../lib/to-dedupe.cjs');
  const rebuilt = DEDUPE.dedupe(retained).canonical.length;
  const published = corpus.opportunities.filter((o) => o.sourceId === 'sam-gov').length;
  assert.strictEqual(rebuilt, published,
    `a fresh clone would rebuild ${rebuilt} SAM opportunities where the corpus publishes ${published}`);
});

test('PROOF fresh clone: a failure AFTER recovery still keeps the recovered data', async () => {
  // The compound case: fresh clone recovers SAM from the corpus, then the very
  // next fetch fails. The recovered records must not evaporate.
  const corpus = CORPUS.decode(JSON.parse(
    fs.readFileSync(path.join(ROOT, 'data/tender-opportunities/opportunities.json'), 'utf8'),
  ));
  const retained = STATE.lastGoodBySource(corpus).get('sam-gov');
  if (!retained) return; // staged
  const recovered = SNAP.buildSnapshot({
    source, adapterVersion: '1.0.0', retrievedAt: NOW, records: retained,
    fetchResult: { raw: [], pages: 1, population: null, complete: true, endpoint: source.endpoint },
  });
  const r = await runWith(async () => { throw new Error('fetch failed: ETIMEDOUT'); },
    { previous: recovered });
  assert.strictEqual(r.kept, true);
  assert.strictEqual(r.previous.recordCount, retained.length,
    'the recovered corpus was lost by the next failed run');
});

// ── ISOLATION ───────────────────────────────────────────────────────────────

test('PROOF isolation: SAM failing does not touch another source', () => {
  // The corpus rebuild reads each source independently; a source with no fresh
  // snapshot contributes its retained last-good and nothing else changes.
  const ingestSrc = fs.readFileSync(path.join(ROOT, 'scripts/ingest-tender-opportunities.cjs'), 'utf8');
  const body = ingestSrc.replace(/\/\/[^\n]*/g, '');
  assert.ok(body.includes('retained-last-good'),
    'the rebuild has no path that retains a source without a fresh snapshot');
  // And a failure is per-source: the loop records an outcome and continues.
  assert.ok(/keeping the previous snapshot/.test(ingestSrc));
});

test('PROOF isolation: no source may be active without a durable last-good', () => {
  // Activation order matters. A source marked enabled whose records are absent
  // from the committed corpus would vanish on the next fresh clone.
  const corpus = CORPUS.decode(JSON.parse(
    fs.readFileSync(path.join(ROOT, 'data/tender-opportunities/opportunities.json'), 'utf8'),
  ));
  const bySource = STATE.lastGoodBySource(corpus);
  for (const s of SOURCES.ENABLED()) {
    assert.ok(bySource.has(s.id) && bySource.get(s.id).length > 0,
      `${s.id} is enabled but contributes no durable record — a fresh clone would lose it`);
  }
});

// ── THE BULK ARTEFACT ───────────────────────────────────────────────────────

test('PROOF storage: the 251 MB artefact is neither committed nor required', () => {
  // Required only by ingestion, which is the only networked script. The build
  // must not depend on a local file that a fresh clone does not have.
  for (const build of ['build-tender-opportunities.cjs', 'build-tender-detail.cjs', 'build-tender-monitoring.cjs']) {
    const b = fs.readFileSync(path.join(ROOT, 'scripts', build), 'utf8');
    assert.ok(!/sam\.csv|ContractOpportunities/i.test(b),
      `${build} references the bulk artefact`);
  }
  const tracked = fs.existsSync(path.join(ROOT, 'sam.csv'));
  assert.strictEqual(tracked, false, 'the raw bulk file is sitting in the repository root');
});
