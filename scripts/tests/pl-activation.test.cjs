'use strict';

// Poland BZP — the operational proofs required before ACTIVE.
//
// Same standard as SAM.gov: every way this source can fail must leave the
// published dataset intact, and a machine that has never reached ezamowienia
// must still serve every Polish tender.
//
// Poland adds one failure mode SAM does not have. It is paged — roughly 600
// requests — so a walk can break in the MIDDLE, and a half-walked window looks
// exactly like a source that shrank.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const A = require('../lib/to-adapters/pl-bzp.cjs');
const SOURCES = require('../lib/to-sources.cjs');
const SNAP = require('../lib/to-snapshot.cjs');
const HEALTH = require('../lib/to-health.cjs');
const STATE = require('../lib/to-state.cjs');
const CORPUS = require('../lib/to-corpus.cjs');
const DEDUPE = require('../lib/to-dedupe.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const source = SOURCES.SOURCE_BY_ID.get('pl-bzp');
const NOW = '2026-08-13T12:00:00.000Z';
const FIXTURE = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/tests/fixtures/pl-bzp-sample.json'), 'utf8'));

// A last-good at production scale. The guards are calibrated for a real
// source — MIN_RECORDS is 10, the collapse floor is half the previous run — so
// a four-record fixture would trip them for the wrong reason.
function scaled(n = 400) {
  const live = FIXTURE.filter((r) => r.noticeType === 'ContractNotice' && !r.outdated
    && !r.procedureResult && !(r.contractors || []).length);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const src = live[i % live.length];
    out.push(A.normalize({
      ...src,
      bzpNumber: `2026/BZP 004${String(i).padStart(5, '0')}`,
      noticeNumber: `2026/BZP 004${String(i).padStart(5, '0')}/01`,
      submittingOffersDate: '2026-12-11T09:00:00Z',
    }, { source, nowIso: NOW }));
  }
  return out.filter(Boolean);
}

const LAST_GOOD = SNAP.buildSnapshot({
  source,
  adapterVersion: '1.0.0',
  retrievedAt: '2026-08-12T12:00:00.000Z',
  fetchResult: { raw: [], pages: 60, population: 400, complete: true, endpoint: source.endpoint },
  records: scaled(),
});

async function attempt(fetchAll, previous = LAST_GOOD) {
  let fetchResult;
  try {
    fetchResult = await fetchAll();
  } catch (e) {
    return { ok: false, kept: true, previous, error: e.message, errorClass: HEALTH.classifyFailure(e) };
  }
  const records = fetchResult.raw
    .map((r) => A.normalize(r, { source, nowIso: NOW }))
    .filter(Boolean);
  const candidate = SNAP.buildSnapshot({
    source, adapterVersion: '1.0.0', retrievedAt: NOW, fetchResult, records,
  });
  const verdict = SNAP.validateReplacement(candidate, previous, {});
  return verdict.accept
    ? { ok: true, kept: false, snapshot: candidate }
    : { ok: false, kept: true, previous, reasons: verdict.reasons, candidate };
}

test('the scaled fixture is large enough for the guards to bite', () => {
  assert.ok(LAST_GOOD.recordCount > SNAP.MIN_RECORDS * 10, `only ${LAST_GOOD.recordCount} records`);
  assert.strictEqual(new Set(LAST_GOOD.records.map((r) => r.id)).size, LAST_GOOD.recordCount);
});

test('PROOF transport: a failed walk keeps last-good and is classified', async () => {
  const r = await attempt(async () => { throw new Error('fetch failed: ECONNRESET'); });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.previous.recordCount, LAST_GOOD.recordCount, 'last-good was altered');
  assert.ok(HEALTH.FAILURE_CLASSES.includes(r.errorClass));
  const h = HEALTH.recordAttempt(null, {
    sourceId: 'pl-bzp', nowIso: NOW, result: 'FAILURE', errorClass: r.errorClass, window: source.window,
  });
  assert.notStrictEqual(h.state, 'HEALTHY');
});

test('PROOF window: a walk that breaks half way does not replace a full one', async () => {
  // The failure unique to a 600-request source. Half the pages retrieved is
  // half the tenders, and it looks exactly like Polish procurement halving.
  const half = scaled().slice(0, 180).map((r) => ({
    bzpNumber: r.sourceNoticeId, noticeNumber: `${r.sourceNoticeId}/01`,
    noticeType: 'ContractNotice', orderObject: r.title, cpvCode: '45233120-6 (x)',
    organizationName: r.buyerName, organizationProvince: 'PL16',
    submittingOffersDate: '2026-12-11T09:00:00Z', publicationDate: '2026-08-01T09:00:00Z',
    isTenderAmountBelowEU: true, contractors: [], outdated: false,
  }));
  const r = await attempt(async () => ({
    raw: half, pages: 18, population: 400, complete: false, endpoint: source.endpoint,
  }));
  assert.strictEqual(r.ok, false, 'a truncated walk was promoted');
  assert.ok(r.reasons.some((x) => /collapsed|floor|outage/.test(x)),
    `the collapse guard did not fire: ${JSON.stringify(r.reasons)}`);
  assert.strictEqual(r.previous.recordCount, LAST_GOOD.recordCount);
});

test('PROOF window: an empty but successful walk is refused', async () => {
  const r = await attempt(async () => ({
    raw: [], pages: 1, population: 0, complete: true, endpoint: source.endpoint,
  }));
  assert.strictEqual(r.ok, false, 'a source that returned nothing was promoted as fresh');
});

test('PROOF schema: a payload that is not an array of notices fails closed', async () => {
  const r = await attempt(async () => { throw new Error('pl-bzp: page 4 was not an array of notices'); });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.previous.recordCount, LAST_GOOD.recordCount);
  // And a renamed field empties the records rather than corrupting them, which
  // the record-count guard then refuses.
  const renamed = FIXTURE.map((x) => { const y = { ...x }; delete y.bzpNumber; return y; });
  const r2 = await attempt(async () => ({
    raw: renamed, pages: 1, population: 400, complete: true, endpoint: source.endpoint,
  }));
  assert.strictEqual(r2.ok, false, 'a renamed identity field produced a snapshot');
});

test('PROOF classification: losing every CPV is visible, not silent', () => {
  const good = scaled();
  assert.ok(good.every((r) => r.classifications.length), 'the fixture carries no CPV');
  const stripped = good.map((r) => ({ ...r, classifications: [] }));
  const cand = SNAP.buildSnapshot({
    source, adapterVersion: '1.0.0', retrievedAt: NOW, records: stripped,
    fetchResult: { raw: [], pages: 60, population: 400, complete: true, endpoint: source.endpoint },
  });
  // The record-count guard cannot see field loss — that is the point.
  assert.strictEqual(SNAP.validateReplacement(cand, LAST_GOOD, {}).accept, true);
  // So the content hash has to move, and it does.
  assert.notStrictEqual(cand.contentHash, LAST_GOOD.contentHash,
    'a snapshot that lost every CPV hashed identically to one that had them');
});

test('PROOF fresh clone: Poland survives a machine that never fetched it', () => {
  const corpus = CORPUS.decode(JSON.parse(
    fs.readFileSync(path.join(ROOT, 'data/tender-opportunities/opportunities.json'), 'utf8'),
  ));
  if (!SOURCES.ENABLED().some((s) => s.id === 'pl-bzp')) return; // still staged
  const retained = STATE.lastGoodBySource(corpus).get('pl-bzp');
  assert.ok(retained && retained.length, 'a fresh clone would rebuild without a single Polish tender');

  const occurrences = corpus.opportunities
    .reduce((n, o) => n + (o.occurrences || []).filter((x) => x.sourceId === 'pl-bzp').length, 0);
  assert.strictEqual(retained.length, occurrences, 'the durable store lost Polish occurrences');

  // Recovery must be lossless: re-deduplicating what a clone recovers gives
  // back the same canonical opportunities the corpus publishes.
  const rebuilt = DEDUPE.dedupe(retained).canonical.length;
  const published = corpus.opportunities.filter((o) => o.sourceId === 'pl-bzp').length;
  assert.strictEqual(rebuilt, published,
    `a fresh clone rebuilds ${rebuilt} Polish opportunities where the corpus publishes ${published}`);
});

test('PROOF fresh clone: a failure after recovery keeps the recovered data', async () => {
  const corpus = CORPUS.decode(JSON.parse(
    fs.readFileSync(path.join(ROOT, 'data/tender-opportunities/opportunities.json'), 'utf8'),
  ));
  const retained = STATE.lastGoodBySource(corpus).get('pl-bzp');
  if (!retained) return;
  const recovered = SNAP.buildSnapshot({
    source, adapterVersion: '1.0.0', retrievedAt: NOW, records: retained,
    fetchResult: { raw: [], pages: 0, population: null, complete: true, endpoint: source.endpoint },
  });
  const r = await attempt(async () => { throw new Error('fetch failed: ETIMEDOUT'); }, recovered);
  assert.strictEqual(r.kept, true);
  assert.strictEqual(r.previous.recordCount, retained.length);
});

test('PROOF merge: a Poland+TED canonical record reconstructs to all its occurrences', () => {
  const corpus = CORPUS.decode(JSON.parse(
    fs.readFileSync(path.join(ROOT, 'data/tender-opportunities/opportunities.json'), 'utf8'),
  ));
  const merged = corpus.opportunities.filter((o) => o.multiSource
    && (o.occurrences || []).some((x) => x.sourceId === 'pl-bzp'));
  // Whether or not any merge occurred, nothing may be lost: every occurrence
  // of every record still resolves to a source and a notice id.
  for (const o of merged) {
    for (const occ of o.occurrences) {
      assert.ok(occ.sourceId && occ.sourceNoticeId && occ.sourceUrl,
        `${o.id}: an occurrence lost its provenance`);
    }
  }
  const total = corpus.opportunities
    .reduce((n, o) => n + (o.occurrences || []).filter((x) => x.sourceId === 'pl-bzp').length, 0);
  const published = corpus.opportunities.filter((o) => o.sourceId === 'pl-bzp').length;
  assert.ok(total >= published, 'more canonical records than occurrences — records were invented');
});

test('PROOF isolation: no source is active without a durable last-good', () => {
  const corpus = CORPUS.decode(JSON.parse(
    fs.readFileSync(path.join(ROOT, 'data/tender-opportunities/opportunities.json'), 'utf8'),
  ));
  const bySource = STATE.lastGoodBySource(corpus);
  for (const s of SOURCES.ENABLED()) {
    assert.ok(bySource.has(s.id) && bySource.get(s.id).length > 0,
      `${s.id} is enabled but contributes no durable record — a fresh clone would lose it`);
  }
});

test('PROOF monitoring: a partial window must not fabricate a closure', () => {
  // Absence from a PARTIAL walk is not evidence a tender closed. The snapshot
  // carries the completeness flag so disappearance detection can tell the
  // difference, and the adapter sets it from the walk rather than from a 200.
  const src = fs.readFileSync(path.join(ROOT, 'scripts/lib/to-adapters/pl-bzp.cjs'), 'utf8');
  assert.ok(/complete:\s*false/.test(src) || /complete,/.test(src),
    'completeness is not derived from the walk');
  assert.ok(/PAGE CAP reached/.test(src), 'a truncated walk is silent');
});
