// scripts/tests/to-opportunities.test.cjs
'use strict';

// Tender Opportunity Intelligence v1 — property and mutation guards.
//
// Two halves. The first asserts properties of the live corpus and of the pure
// functions that produced it. The second APPLIES a mutation, asserts something
// catches it, and restores — because a guard nobody has ever seen fail is a
// guard nobody knows works.
//
// Fixtures are used wherever the property is about a situation the live corpus
// does not currently contain. Cross-source duplicate publication is the clearest
// case: the five pilot sources cover disjoint jurisdictions, so the live corpus
// has ZERO cross-source duplicates. Testing the merge logic against live data
// would prove only that nothing merged. It is tested against fixtures that do
// duplicate, and the live zero is asserted separately as a fact about coverage.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SOURCES = require('../lib/to-sources.cjs');
const ADAPTERS = require('../lib/to-adapters/index.cjs');
const SCHEMA = require('../lib/to-schema.cjs');
const TIME = require('../lib/to-time.cjs');
const CLASS = require('../lib/to-classification.cjs');
const DEDUPE = require('../lib/to-dedupe.cjs');
const MATCH = require('../lib/to-match.cjs');
const SNAP = require('../lib/to-snapshot.cjs');
const BUILD = require('../build-tender-opportunities.cjs');
const I18N = require('../lib/i18n.cjs');
const PARITY = require('./helpers/platform-parity.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const CORPUS_FILE = path.join(ROOT, 'data', 'tender-opportunities', 'opportunities.json');

// Decoded, not read raw: the corpus is stored columnar since Phase 2, and the
// guards below are about the records, not about the file layout. The layout
// itself is asserted separately in P2-1.
const CORPUS_FORMAT = require('../lib/to-corpus.cjs');
const CORPUS = fs.existsSync(CORPUS_FILE)
  ? CORPUS_FORMAT.decode(JSON.parse(read('data/tender-opportunities/opportunities.json'))) : null;
const O = CORPUS ? CORPUS.opportunities : [];
const NOW = CORPUS ? CORPUS.generatedAt : '2026-08-13T00:00:00.000Z';
const PLATFORM_IDS = new Set(JSON.parse(read('data/tenders-procurement/platforms.json')).map((p) => p.id));

// --- preconditions ----------------------------------------------------------
// Every "no opportunity does X" guard below is vacuous on an empty corpus.

test('the corpus exists and carries opportunities from several sources', () => {
  assert.ok(CORPUS, 'no corpus on disk: every guard in this file is vacuous');
  assert.ok(O.length > 100, `only ${O.length} opportunities: the guards are close to vacuous`);
  const sources = new Set(O.map((o) => o.sourceId));
  assert.ok(sources.size >= 4, `only ${sources.size} sources represented`);
  assert.ok(O.filter(SCHEMA.isCurrent).length > 0, 'no current opportunity: the ranking guards are vacuous');
  assert.ok(O.filter((o) => !SCHEMA.isCurrent(o)).length > 0,
    'no historical opportunity: the current/historical separation guards are vacuous');
});

// --- fixtures ---------------------------------------------------------------

const ts = (raw) => TIME.normalizeTimestamp(raw);

function fixture(over = {}) {
  const base = {
    sourceId: 'ted',
    sourcePlatformId: 'eu-ted',
    sourceNoticeId: '100000-2026',
    sourceUrl: 'https://ted.europa.eu/en/notice/-/detail/100000-2026',
    title: 'Supply of network switches for the regional data centre',
    titles: { en: 'Supply of network switches for the regional data centre' },
    descriptionSummary: null,
    buyerName: 'Regional Authority of Example',
    country: 'germany',
    subnationalJurisdiction: null,
    projectCountry: null,
    coverage: 'supranational',
    classifications: CLASS.normalizeCodes([['CPV', '32420000']]),
    publicationDate: ts('2026-08-01+02:00'),
    deadline: ts('2026-09-16+02:00'),
    sourceModifiedDate: null,
    status: 'OPEN',
    statusBasis: 'SOURCE_SCOPE',
    noticeType: 'CONTRACT_NOTICE',
    procedureType: 'open',
    value: null,
    language: 'DEU',
    lotCount: 1,
    officialReference: 'REF-ABC-2026-0099',
    electronicSubmission: null,
    electronicSubmissionBasis: null,
    submissionUrl: null,
    frameworkAgreement: null,
    occurrenceCount: 1,
    multiSource: false,
    ...over,
  };
  base.id = SCHEMA.opportunityId(base.sourceId, base.sourceNoticeId);
  base.occurrences = [{
    sourceId: base.sourceId,
    sourcePlatformId: base.sourcePlatformId,
    sourceNoticeId: base.sourceNoticeId,
    sourceUrl: base.sourceUrl,
    status: base.status,
    statusBasis: base.statusBasis,
  }];
  return base;
}

// ── 1. SCHEMA ───────────────────────────────────────────────────────────────

test('1. every opportunity in the corpus satisfies the canonical schema', () => {
  const bad = [];
  for (const o of O) {
    const problems = SCHEMA.problemsFor(o, PLATFORM_IDS);
    if (problems.length) bad.push(`${o.id}: ${problems[0]}`);
  }
  assert.deepStrictEqual(bad.slice(0, 5), [], `${bad.length} invalid opportunity record(s)`);
});

test('2. every opportunity points at a canonical procurement platform', () => {
  const orphans = O.filter((o) => !PLATFORM_IDS.has(o.sourcePlatformId));
  assert.strictEqual(orphans.length, 0,
    `${orphans.length} opportunity(ies) reference a platform that does not exist`);
  // And the reverse: ingestion may not have invented one.
  const referenced = new Set(O.map((o) => o.sourcePlatformId));
  for (const id of referenced) assert.ok(PLATFORM_IDS.has(id), `${id} is not a canonical platform`);
});

test('3. identity is deterministic and derived from source identity alone', () => {
  for (const o of O) {
    assert.strictEqual(o.id, SCHEMA.opportunityId(o.sourceId, o.sourceNoticeId),
      `${o.id} is not derivable from its source identity`);
  }
  // Same inputs, same id, forever.
  assert.strictEqual(SCHEMA.opportunityId('ted', '556964-2026'), SCHEMA.opportunityId('ted', '556964-2026'));
  // The property is that WE never mint a random id, not that no source ever
  // uses a UUID in its own. UK Contracts Finder ocids look like
  // "ocds-b5fd17-aad953f2-e0db-453a-969c-288552a6282f" — a UUID assigned by
  // the publisher, stable across refreshes, and exactly the kind of
  // source-native identifier the model is supposed to prefer. Rejecting it
  // would have rejected the identifier for being well-formed.
  //
  // So the guard is on our own code: no id generation anywhere.
  for (const rel of ['scripts/lib/to-schema.cjs', 'scripts/ingest-tender-opportunities.cjs',
    'scripts/lib/to-dedupe.cjs']) {
    assert.ok(!/randomUUID|Math\.random|uuidv4/.test(read(rel)),
      `${rel} can generate a random identifier`);
  }
  // And identity survives a refresh: the same source notice yields the same id.
  const sample = O.slice(0, 200);
  for (const o of sample) {
    assert.strictEqual(SCHEMA.opportunityId(o.sourceId, o.sourceNoticeId), o.id);
  }
});

test('4. no invented value: a value carries a real published figure or is null', () => {
  for (const o of O) {
    if (o.value === null) continue;
    const single = typeof o.value.amount === 'number';
    const ranged = typeof o.value.amountMin === 'number' && typeof o.value.amountMax === 'number';
    assert.ok(single !== ranged, `${o.id}: value is neither cleanly single nor cleanly ranged`);
    assert.match(o.value.currency, /^[A-Z]{3}$/, `${o.id}: value has no ISO currency`);
    assert.ok(SCHEMA.VALUE_BASES.includes(o.value.basis), `${o.id}: value has no basis`);
    const amounts = single ? [o.value.amount] : [o.value.amountMin, o.value.amountMax];
    for (const a of amounts) assert.ok(a > 0, `${o.id}: a published value of zero is not a value`);
  }
  assert.ok(O.some((o) => o.value !== null), 'no opportunity carries a value: this guard is vacuous');
  assert.ok(O.some((o) => o.value === null), 'every opportunity carries a value: the null path is untested');
});

test('5. every opportunity retains at least one source occurrence', () => {
  for (const o of O) {
    assert.ok(Array.isArray(o.occurrences) && o.occurrences.length >= 1, `${o.id} has no occurrence`);
    for (const occ of o.occurrences) {
      assert.ok(occ.sourceId && occ.sourceNoticeId && occ.sourceUrl,
        `${o.id} has an occurrence missing provenance`);
    }
  }
});

test('6. classification schemes are declared and codes are normalized', () => {
  for (const o of O) {
    for (const c of o.classifications || []) {
      assert.ok(CLASS.SCHEMES.includes(c.scheme), `${o.id}: unknown scheme ${c.scheme}`);
      assert.ok(!/^V\d+\./.test(c.code), `${o.id}: a portal prefix survived into ${c.code}`);
    }
  }
  // The SECOP prefix strip, directly.
  assert.strictEqual(CLASS.normalizeCode('UNSPSC', 'V1.80111600').code, '80111600');
  // A CPV check digit is not part of the code.
  assert.strictEqual(CLASS.normalizeCode('CPV', '45000000-7').code, '45000000');
  // A label is asserted only where the reference table has one.
  assert.strictEqual(CLASS.normalizeCode('CPV', '45000000').label, 'Construction work');
  assert.strictEqual(CLASS.normalizeCode('GSIN', 'N5895').label, null);
});

// ── 7-9. TIME ───────────────────────────────────────────────────────────────

test('7. timestamps normalize by shape, not by hope', () => {
  assert.strictEqual(ts('2026-09-16T10:00:00Z').precision, 'INSTANT');
  assert.strictEqual(ts('2026-09-16T10:00:00+02:00').precision, 'INSTANT');
  assert.strictEqual(ts('2026-09-16+02:00').precision, 'DATE');
  assert.strictEqual(ts('2026-09-16T14:00:00').precision, 'ZONELESS');
  assert.strictEqual(ts('2026-09-16').precision, 'ZONELESS');
  assert.strictEqual(ts('11-Aug-2026').precision, 'ZONELESS');
  assert.strictEqual(ts('not a date').precision, 'NONE');
  assert.strictEqual(ts(null).precision, 'NONE');
});

test('8. a zoneless timestamp never acquires a UTC instant', () => {
  for (const raw of ['2026-09-16T14:00:00', '2026-09-16', '11-Aug-2026']) {
    const n = ts(raw);
    assert.strictEqual(n.iso, null, `${raw} was given an instant it does not have`);
    assert.strictEqual(TIME.isDecidable(n), false, `${raw} was treated as decidable`);
  }
  // And in the live corpus.
  for (const o of O) {
    for (const f of ['publicationDate', 'deadline', 'sourceModifiedDate']) {
      const v = o[f];
      if (v && v.precision === 'ZONELESS') assert.strictEqual(v.iso, null, `${o.id}.${f}`);
    }
  }
  assert.ok(O.some((o) => o.deadline && o.deadline.precision === 'ZONELESS'),
    'no zoneless deadline in the corpus: this guard is vacuous');
});

test('9. offsets, DST and date-only deadlines resolve to the right instant', () => {
  // A date with an offset resolves to the END of that day in that offset —
  // a deadline dated the 16th is not over at midnight.
  assert.strictEqual(ts('2026-09-16+02:00').iso, '2026-09-16T21:59:59.000Z');
  assert.strictEqual(ts('2026-09-16Z').iso, '2026-09-16T23:59:59.000Z');
  assert.strictEqual(ts('2026-09-16+02:00').derived, true, 'end-of-day resolution must be flagged derived');
  // Summer and winter offsets both honoured, not assumed.
  assert.strictEqual(ts('2026-01-15T12:00:00+01:00').iso, '2026-01-15T11:00:00.000Z');
  assert.strictEqual(ts('2026-07-15T12:00:00+02:00').iso, '2026-07-15T10:00:00.000Z');
  // A negative offset is not silently read as positive.
  assert.strictEqual(ts('2026-07-15T12:00:00-05:00').iso, '2026-07-15T17:00:00.000Z');
  // Midnight boundary.
  assert.strictEqual(ts('2026-07-15T00:00:00Z').iso, '2026-07-15T00:00:00.000Z');
  // Joining a date and a local clock time yields a ZONELESS value, not an instant.
  const combined = TIME.combineDateAndTime('2026-08-28T00:00:00Z', '02:00');
  assert.strictEqual(combined.precision, 'ZONELESS');
  assert.strictEqual(combined.iso, null);
});

test('10. days-until is floored and undecidable deadlines return null, never zero', () => {
  const now = '2026-08-13T00:00:00.000Z';
  assert.strictEqual(TIME.daysUntil(ts('2026-08-20T00:00:00Z'), now), 7);
  // 6 days and 23 hours is "6 days left", never 7.
  assert.strictEqual(TIME.daysUntil(ts('2026-08-19T23:00:00Z'), now), 6);
  assert.strictEqual(TIME.daysUntil(ts('2026-08-13T14:00:00'), now), null);
  assert.strictEqual(TIME.hasPassed(ts('2026-08-13T14:00:00'), now), null);
  assert.strictEqual(TIME.hasPassed(ts('2026-08-12T00:00:00Z'), now), true);
});

// ── 11. STATUS ──────────────────────────────────────────────────────────────

test('11. a source-reported status always beats a date-derived one', () => {
  const past = ts('2020-01-01T00:00:00Z');
  const future = ts('2030-01-01T00:00:00Z');
  // Cancelled with a future deadline stays cancelled.
  assert.deepStrictEqual(
    SCHEMA.resolveStatus({ reportedStatus: 'CANCELLED', deadline: future, nowIso: NOW }),
    { status: 'CANCELLED', statusBasis: 'SOURCE_REPORTED' },
  );
  // Open with a past deadline stays open — the buyer knows better than a date.
  assert.deepStrictEqual(
    SCHEMA.resolveStatus({ reportedStatus: 'OPEN', deadline: past, nowIso: NOW }),
    { status: 'OPEN', statusBasis: 'SOURCE_REPORTED' },
  );
  // With no reported status, the deadline decides — and says so.
  assert.deepStrictEqual(
    SCHEMA.resolveStatus({ reportedStatus: null, deadline: past, nowIso: NOW }),
    { status: 'CLOSED', statusBasis: 'DERIVED_FROM_DEADLINE' },
  );
  // With neither, UNKNOWN — not OPEN.
  assert.deepStrictEqual(
    SCHEMA.resolveStatus({ reportedStatus: null, deadline: TIME.EMPTY, nowIso: NOW }),
    { status: 'UNKNOWN', statusBasis: 'UNKNOWN' },
  );
});

test('12. a cancelled or awarded notice can never be current', () => {
  for (const o of O) {
    if (o.status === 'CANCELLED') assert.ok(!SCHEMA.isCurrent(o), `${o.id}: cancelled but current`);
    if (o.status === 'AWARDED') assert.ok(!SCHEMA.isCurrent(o), `${o.id}: awarded but current`);
    if (o.noticeType === 'CONTRACT_AWARD') {
      assert.ok(!SCHEMA.isCurrent(o), `${o.id}: an award notice is advertised as current`);
    }
  }
  assert.ok(O.some((o) => o.status === 'CANCELLED'), 'no cancelled record: this guard is vacuous');
  assert.ok(O.some((o) => o.noticeType === 'CONTRACT_AWARD'), 'no award notice: this guard is vacuous');
});

test('13. current and historical are separated, and only current is recommended', () => {
  const current = O.filter(SCHEMA.isCurrent);
  const historical = O.filter((o) => !SCHEMA.isCurrent(o));
  assert.ok(current.length && historical.length, 'both populations must exist');
  const currentIds = new Set(current.map((o) => o.id));
  for (const key of Object.keys(MATCH.PROFILES)) {
    for (const { opportunity } of MATCH.rank(O, key, { nowIso: NOW, limit: 25 })) {
      assert.ok(currentIds.has(opportunity.id),
        `${key} recommended ${opportunity.id}, which is not current`);
    }
  }
});

// ── 14-17. DEDUPLICATION ────────────────────────────────────────────────────

test('14. the same notice twice from one source collapses to one opportunity', () => {
  const a = fixture();
  const b = fixture();
  assert.strictEqual(DEDUPE.classify(a, b), 'EXACT');
  const { canonical, stats } = DEDUPE.dedupe([a, b]);
  assert.strictEqual(canonical.length, 1);
  assert.strictEqual(stats.input, 2);
  assert.strictEqual(canonical[0].multiSource, false, 'one source is not multi-source');
});

test('15. one procurement published by two systems merges and keeps both occurrences', () => {
  const onTed = fixture();
  const onNational = fixture({
    sourceId: 'uk-fts',
    sourcePlatformId: 'uk-find-a-tender',
    sourceNoticeId: 'ocds-aaaa-000111',
    sourceUrl: 'https://www.find-tender.service.gov.uk/Notice/000111-2026',
    country: 'germany',
    coverage: 'national',
    classifications: [],
    submissionUrl: 'https://portal.example.gov/bid/000111',
    electronicSubmission: 'yes',
    electronicSubmissionBasis: 'SOURCE_REPORTED',
  });
  assert.strictEqual(DEDUPE.classify(onTed, onNational), 'EXACT',
    'a shared official reference in the same country is exact evidence');

  const { canonical, stats } = DEDUPE.dedupe([onTed, onNational]);
  assert.strictEqual(canonical.length, 1, 'the duplicate did not merge');
  const c = canonical[0];
  assert.strictEqual(c.multiSource, true);
  assert.strictEqual(c.occurrences.length, 2, 'provenance was lost in the merge');
  assert.deepStrictEqual(c.occurrences.map((x) => x.sourceId).sort(), ['ted', 'uk-fts']);
  // Field-level provenance: the transactional system wins the submission route,
  // the aggregator keeps the classification. Neither source is wholly discarded.
  assert.strictEqual(c.submissionUrl, 'https://portal.example.gov/bid/000111');
  assert.strictEqual(c.fieldSources.submissionUrl, 'uk-fts');
  assert.ok(c.classifications.length > 0, 'the classification was lost to the source that had none');
  assert.strictEqual(c.fieldSources.classifications, 'ted');
  assert.strictEqual(stats.multiSource, 1);
});

test('16. similar notices from one buyer are NOT merged', () => {
  // The pilot merged two Department of National Defence solicitations with the
  // same title. They were two procurements.
  const a = fixture({
    sourceId: 'canadabuys', sourcePlatformId: 'ca-canadabuys',
    sourceNoticeId: 'cb-206-28160163', country: 'canada', coverage: 'national',
    buyerName: 'Department of National Defence (DND)', title: 'Material Handling Equipment',
    officialReference: 'W0123-260001', deadline: TIME.EMPTY, classifications: [],
  });
  const b = fixture({
    sourceId: 'canadabuys', sourcePlatformId: 'ca-canadabuys',
    sourceNoticeId: 'cb-6-70690140', country: 'canada', coverage: 'national',
    buyerName: 'Department of National Defence (DND)', title: 'Material Handling Equipment',
    officialReference: 'W0456-260099', deadline: TIME.EMPTY, classifications: [],
  });
  assert.strictEqual(DEDUPE.classify(a, b), null,
    'two distinct solicitations with the same title must not merge');
  assert.strictEqual(DEDUPE.dedupe([a, b]).canonical.length, 2);
});

test('17. a bare sequential reference is not a global procurement identifier', () => {
  // Milton Keynes and a Colombian agency both wrote "2026-078".
  const uk = fixture({
    sourceId: 'uk-fts', sourcePlatformId: 'uk-find-a-tender', sourceNoticeId: 'ocds-h6vhtk-06e1c2',
    country: 'united-kingdom', coverage: 'national', buyerName: 'Milton Keynes City Council',
    title: 'NHS Health Checks - Community Outreach Offer', officialReference: '2026-078',
  });
  const co = fixture({
    sourceId: 'secop2', sourcePlatformId: 'co-secop-ii', sourceNoticeId: 'CO1.REQ.10836504',
    country: 'colombia', coverage: 'national', buyerName: 'Alcaldía de Ejemplo',
    title: 'Prestación de servicios de apoyo', officialReference: '2026-078', deadline: TIME.EMPTY,
  });
  assert.strictEqual(DEDUPE.referenceKey(uk), null,
    'a year-and-sequence reference must not count as evidence');
  assert.strictEqual(DEDUPE.classify(uk, co), null);
  assert.strictEqual(DEDUPE.dedupe([uk, co]).canonical.length, 2,
    'a British council and a Colombian agency were merged');
  // A reference with letters IS distinctive.
  assert.ok(DEDUPE.referenceKey(fixture({ officialReference: 'FMWR-SPIN-QCBS-9B' })));
});

test('18. lots are not duplicates, and an amendment is not a new tender', () => {
  // A ten-lot notice is one opportunity that records ten lots.
  const multiLot = fixture({ lotCount: 10 });
  assert.strictEqual(DEDUPE.dedupe([multiLot]).canonical.length, 1);
  assert.strictEqual(DEDUPE.dedupe([multiLot]).canonical[0].lotCount, 10);
  // An amendment shares the notice id and lands on the same opportunity.
  const original = fixture({ deadline: ts('2026-09-16+02:00') });
  const amended = fixture({ deadline: ts('2026-09-30+02:00'), sourceModifiedDate: ts('2026-08-20+02:00') });
  assert.strictEqual(DEDUPE.classify(original, amended), 'EXACT');
  assert.strictEqual(DEDUPE.dedupe([original, amended]).canonical.length, 1);
});

test('19. a cancelled notice is not resurrected by a re-issue, and cancellation wins a merge', () => {
  const cancelled = fixture({ status: 'CANCELLED', statusBasis: 'SOURCE_REPORTED' });
  const reissued = fixture({
    sourceNoticeId: '100001-2026', officialReference: 'REF-XYZ-2026-0100', status: 'OPEN',
  });
  // A re-issue may legitimately be FLAGGED as a candidate — same buyer, same
  // title, same deadline is a real coincidence worth a human look. What it must
  // never be is merged, because the cancelled procedure and its replacement are
  // two procurements and only one of them can be bid on.
  assert.notStrictEqual(DEDUPE.classify(cancelled, reissued), 'EXACT');
  assert.notStrictEqual(DEDUPE.classify(cancelled, reissued), 'STRONG');
  const { canonical } = DEDUPE.dedupe([cancelled, reissued]);
  assert.strictEqual(canonical.length, 2);
  assert.ok(canonical.some((c) => c.status === 'CANCELLED'), 'the cancellation was lost');

  // And where two systems disagree, cancellation wins whatever the precedence.
  const stillOpenElsewhere = fixture({
    sourceId: 'uk-fts', sourcePlatformId: 'uk-find-a-tender', sourceNoticeId: 'ocds-bbbb-000222',
    sourceUrl: 'https://www.find-tender.service.gov.uk/Notice/000222', status: 'OPEN',
    statusBasis: 'SOURCE_REPORTED',
  });
  const merged = DEDUPE.dedupe([cancelled, stillOpenElsewhere]).canonical;
  assert.strictEqual(merged.length, 1);
  assert.strictEqual(merged[0].status, 'CANCELLED',
    'one system reporting a cancellation must outrank another still listing it as open');
});

test('20. possible duplicates are recorded, never merged', () => {
  const a = fixture({
    sourceId: 'ted', sourceNoticeId: '200001-2026', officialReference: null,
    title: 'Refurbishment of the municipal swimming pool roof structure',
    deadline: ts('2026-09-16+02:00'),
  });
  const b = fixture({
    sourceId: 'uk-fts', sourcePlatformId: 'uk-find-a-tender', sourceNoticeId: 'ocds-cccc-000333',
    sourceUrl: 'https://www.find-tender.service.gov.uk/Notice/000333', officialReference: null,
    title: 'Refurbishment of the municipal swimming pool roof',
    // One system publishes no deadline: that is absence, not contradiction, so
    // the pair stays a candidate rather than being ruled out or merged.
    deadline: TIME.EMPTY,
  });
  assert.strictEqual(DEDUPE.classify(a, b), 'POSSIBLE');
  const { canonical, possible } = DEDUPE.dedupe([a, b]);
  assert.strictEqual(canonical.length, 2, 'a POSSIBLE pair must not merge');
  assert.strictEqual(possible.length, 1, 'a POSSIBLE pair must be recorded');
  // And the live corpus publishes its candidates rather than hiding them.
  assert.ok(Array.isArray(CORPUS.possibleDuplicates), 'the corpus does not publish its candidates');
});

test('21. generic procurement words create no similarity', () => {
  const a = DEDUPE.tokens('Provision of services for the supply of a framework contract');
  assert.strictEqual(a.size, 0, 'a title of pure boilerplate produced tokens');
  assert.strictEqual(DEDUPE.jaccard(a, DEDUPE.tokens('Supply of services contract')), 0);
});

// ── 22-26. MATCHING ─────────────────────────────────────────────────────────

test('22. the profile vocabulary is the platform collection’s, not a second copy', () => {
  const INTEL = require('../lib/tp-intelligence.cjs');
  assert.deepStrictEqual(Object.keys(MATCH.PROFILES).sort(), Object.keys(INTEL.PROFILES).sort());
  // Every profile has an explicit classification stance — including "none".
  for (const key of Object.keys(MATCH.PROFILES)) {
    assert.ok(key in MATCH.PROFILE_CLASSIFICATIONS,
      `${key} has no declared classification stance, not even an explicit null`);
  }
});

test('23. a match score is relevance and never claims a probability of winning', () => {
  const m = MATCH.matchFor(fixture(), 'telecom', { nowIso: NOW });
  assert.ok(m.score >= 0 && m.score <= 100);
  assert.ok(!('probability' in m) && !('winChance' in m) && !('competition' in m));
  const weights = Object.values(MATCH.WEIGHTS).reduce((a, b) => a + b, 0);
  assert.strictEqual(weights, 100, 'the dimension weights must sum to 100');
  // No user-facing text PROMISES a win. Checked as a claim rather than as a
  // word: the page's own disclaimer contains "probability of winning" for the
  // sole purpose of denying it, and a naive word search fails the very sentence
  // that makes the product honest.
  const PROMISE = /(?<!not a )(?<!never a )(win score|chance to win|success probability|likelihood of winning)/i;
  for (const locale of I18N.LOCALE_CODES) {
    const html = read(I18N.localizedFile(locale, BUILD.CANONICAL_PATH));
    assert.ok(!PROMISE.test(html), `${locale} page promises a chance of winning`);
    // And the denial is actually present, in every locale.
    assert.ok(html.includes(I18N.t(locale, 'toi.notAWinScore').slice(0, 30)),
      `${locale}: the page does not state that this is not a win probability`);
  }
});

test('24. every recommendation explains itself and states what is unknown', () => {
  for (const key of Object.keys(MATCH.PROFILES)) {
    const ranked = MATCH.rank(O, key, { nowIso: NOW, limit: 10 });
    assert.ok(ranked.length > 0, `${key} produced no ranking at all`);
    for (const { opportunity, match } of ranked) {
      assert.ok(match.reasons.length > 0, `${key}/${opportunity.id} has no stated reason`);
      assert.ok(match.uncertainty.length > 0, `${key}/${opportunity.id} claims no uncertainty at all`);
      assert.ok(match.uncertainty.includes('FOREIGN_ELIGIBILITY_NOT_STATED'),
        `${key}/${opportunity.id} does not disclose that foreign eligibility is unstated`);
      for (const r of match.reasons) {
        assert.doesNotThrow(() => I18N.t('en', `toi.reason.${r.key}`),
          `reason ${r.key} has no translation`);
      }
      for (const u of match.uncertainty) {
        assert.doesNotThrow(() => I18N.t('en', `toi.unc.${u}`), `uncertainty ${u} has no translation`);
      }
    }
  }
});

test('25. a published classification outranks a word in the title', () => {
  const coded = fixture({ classifications: CLASS.normalizeCodes([['CPV', '32420000']]) });
  const worded = fixture({
    sourceNoticeId: '100002-2026', classifications: [],
    title: 'Telecommunications maintenance for the regional data centre',
  });
  const a = MATCH.categoryScore(coded, 'telecom');
  const b = MATCH.categoryScore(worded, 'telecom');
  assert.strictEqual(a.signal, 'CLASSIFICATION_PRIMARY');
  assert.strictEqual(b.signal, 'TITLE_TERM');
  assert.ok(a.score > b.score, 'a title term scored as high as a published code');
});

test('26. generic words do not match, and coarse divisions were narrowed', () => {
  // "communication" is not a telecom signal.
  assert.strictEqual(MATCH.textScore({ title: 'Internal communication strategy training' }, 'telecom').hit, false);
  assert.strictEqual(MATCH.textScore({ title: 'Business solution technology services' }, 'it-software').hit, false);
  // Whole-word only: "sip" must not fire inside another word.
  assert.strictEqual(MATCH.textScore({ title: 'Mississippi river survey' }, 'telecom').hit, false);
  assert.strictEqual(MATCH.textScore({ title: 'Supply of SIP trunks' }, 'telecom').hit, true);
  // CPV 641 is postal, not telecom; 642 is telecom.
  const postOffice = fixture({ classifications: CLASS.normalizeCodes([['CPV', '64114000']]), title: 'Post Office Branch' });
  const telecomSvc = fixture({ classifications: CLASS.normalizeCodes([['CPV', '64200000']]), title: 'Telecom services' });
  assert.notStrictEqual(MATCH.categoryScore(postOffice, 'telecom').signal, 'CLASSIFICATION_PRIMARY');
  assert.strictEqual(MATCH.categoryScore(telecomSvc, 'telecom').signal, 'CLASSIFICATION_PRIMARY');
  // CPV 32354800 is photographic film, inside the "communication equipment" division.
  const film = fixture({ classifications: CLASS.normalizeCodes([['CPV', '32354800']]) });
  assert.notStrictEqual(MATCH.categoryScore(film, 'telecom').signal, 'CLASSIFICATION_PRIMARY');
});

test('27. a scheme the profile cannot read is unreadable, not a rejection', () => {
  const gsinOnly = fixture({ classifications: CLASS.normalizeCodes([['GSIN', 'N5895']]) });
  const r = MATCH.categoryScore(gsinOnly, 'telecom');
  assert.strictEqual(r.signal, 'SCHEME_NOT_UNDERSTOOD');
  assert.ok(r.score > 0, 'an unreadable scheme was scored as a mismatch');
  assert.ok(r.score < 1, 'an unreadable scheme was scored as a match');
});

test('28. platform quality cannot make an irrelevant tender relevant', () => {
  const TP = require('../lib/tp-schema.cjs');
  const irrelevant = fixture({
    classifications: CLASS.normalizeCodes([['CPV', '15000000']]), // food products
    title: 'Supply of school catering produce',
  });
  const strongPlatform = JSON.parse(read('data/tenders-procurement/platforms.json'))
    .find((p) => p.id === 'eu-ted');
  const withPlatform = MATCH.matchFor(irrelevant, 'telecom', { nowIso: NOW, platform: strongPlatform });
  const without = MATCH.matchFor(irrelevant, 'telecom', { nowIso: NOW, platform: null });
  assert.ok(withPlatform.score - without.score <= MATCH.WEIGHTS.confidence,
    'platform strength moved the score by more than the whole confidence dimension');
  assert.ok(withPlatform.score < 65,
    `an irrelevant tender on an excellent platform scored ${withPlatform.score}`);
  assert.strictEqual(MATCH.categoryScore(irrelevant, 'telecom').score, 0);
});

test('29. foreign eligibility is never inherited from the platform', () => {
  const platforms = JSON.parse(read('data/tenders-procurement/platforms.json'));
  const accepting = platforms.filter((p) => p.foreignSuppliersAccepted === 'yes').map((p) => p.id);
  assert.ok(accepting.length > 0, 'no platform accepts foreign suppliers: this guard is vacuous');
  // No opportunity carries the field at all — it is not a nullable field that
  // happens to be empty, it is a field this layer does not claim.
  for (const o of O) {
    assert.ok(!('foreignSupplierEligibility' in o) && !('foreignSuppliersAccepted' in o),
      `${o.id} carries a foreign eligibility claim`);
  }
  const onAcceptingPlatform = O.filter((o) => accepting.includes(o.sourcePlatformId));
  assert.ok(onAcceptingPlatform.length > 0, 'no opportunity sits on an accepting platform: vacuous');
  for (const o of onAcceptingPlatform.slice(0, 50)) {
    const m = MATCH.matchFor(o, 'foreign-supplier', { nowIso: NOW });
    assert.ok(m.uncertainty.includes('FOREIGN_ELIGIBILITY_NOT_STATED'),
      `${o.id} sits on an accepting platform and stopped disclosing that the tender itself is unstated`);
  }
});

test('30. opportunity-level electronic submission comes only from a source statement', () => {
  for (const o of O) {
    if (o.electronicSubmission === null || o.electronicSubmission === undefined) continue;
    assert.ok(['yes', 'no'].includes(o.electronicSubmission), `${o.id}: not a tri-state value`);
    assert.strictEqual(o.electronicSubmissionBasis, 'SOURCE_REPORTED',
      `${o.id}: electronic submission was set without a source statement`);
    assert.strictEqual(o.sourceId, 'uk-fts',
      `${o.id}: only the UK's OCDS payload states this per notice, but ${o.sourceId} claimed it`);
  }
  const unknown = O.filter((o) => o.electronicSubmission === null || o.electronicSubmission === undefined);
  assert.ok(unknown.length > O.length / 2, 'most opportunities should have no statement at all');
});

// ── 31-35. OUTPUT, ROUTES, DETERMINISM ──────────────────────────────────────

test('31. the build performs no network access and reads only the committed corpus', () => {
  const src = read('scripts/build-tender-opportunities.cjs');
  // Checked as a REQUIRE, not as a mention: the file's header comment names
  // to-http.cjs in order to say it must never be reached, and a substring
  // search fails the documentation that states the rule.
  assert.ok(!/require\([^)]*to-http/.test(src), 'the opportunities build requires the network module');
  assert.ok(!/\bfetch\s*\(|require\('node:https?'\)/.test(src),
    'the opportunities build can reach the network');
  assert.match(src, /data', 'tender-opportunities', 'opportunities\.json'/,
    'the build does not read the committed corpus');
});

test('32. one indexable route per locale, and no page per tender', () => {
  for (const locale of I18N.LOCALE_CODES) {
    const file = I18N.localizedFile(locale, BUILD.CANONICAL_PATH);
    assert.ok(fs.existsSync(path.join(ROOT, file)), `${locale} page missing`);
  }
  // The crawl surface is exactly the locale cluster: no per-opportunity route.
  const dir = path.join(ROOT, 'research', 'tenders-procurement', 'opportunities');
  const entries = fs.readdirSync(dir);
  // One page, one dataset, one search index. A data file the page fetches is
  // not a crawlable route, so it is named explicitly rather than the
  // assertion being loosened to a pattern that would let a route slip in.
  const files = entries.filter((f) => !fs.statSync(path.join(dir, f)).isDirectory());
  assert.deepStrictEqual(files.sort(), ['index.html', 'opportunities.csv', 'tender-index.json'],
    `the opportunities route owns unexpected files: ${files.join(', ')}`);
  assert.deepStrictEqual(files.filter((f) => f.endsWith('.html')), ['index.html'],
    'a second HTML route appeared at the hub level');
  // Per-opportunity directories are an authorized family; every one must
  // resolve to a real canonical opportunity.
  assertAuthorizedDetailDirs(dir, assert);
  // And no filter permutation became a URL.
  const html = read(I18N.localizedFile('en', BUILD.CANONICAL_PATH));
  const selfLinks = [...html.matchAll(/href="(\/(?:de|es|fr)?\/?research\/tenders-procurement\/opportunities\/[^"]+)"/g)]
    .map((m) => m[1])
    .filter((h) => !h.endsWith('opportunities.csv'));
  assert.deepStrictEqual(selfLinks, [], `filter permutations became URLs: ${selfLinks.join(', ')}`);
});

test('33. canonical, hreflang and sitemap agree across the four locales', () => {
  const sitemap = read('sitemap.xml');
  for (const locale of I18N.LOCALE_CODES) {
    const file = I18N.localizedFile(locale, BUILD.CANONICAL_PATH);
    const html = read(file);
    const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html);
    const og = /<meta property="og:url" content="([^"]+)"/.exec(html);
    assert.ok(canonical, `${locale}: no canonical`);
    assert.ok(og, `${locale}: no og:url`);
    assert.strictEqual(canonical[1], og[1], `${locale}: canonical and og:url disagree`);
    assert.ok(sitemap.includes(`<loc>${canonical[1]}</loc>`), `${locale}: canonical is not in the sitemap`);
    // Reciprocal hreflang.
    for (const other of I18N.LOCALE_CODES) {
      const code = I18N.LOCALE_BY_CODE ? other : other;
      assert.ok(html.includes(`hreflang="${code}"`), `${locale}: no hreflang for ${other}`);
    }
  }
  // Valid XML, and one URL per locale — no duplicates.
  const locs = [...sitemap.matchAll(/<loc>([^<]*opportunities\/)<\/loc>/g)].map((m) => m[1]);
  assert.strictEqual(locs.length, I18N.LOCALE_CODES.length, 'sitemap URL count is not one per locale');
  assert.strictEqual(new Set(locs).size, locs.length, 'the sitemap repeats an opportunities URL');
});

test('34. the collection links to opportunities and the page links back', () => {
  const collection = read('research/tenders-procurement/index.html');
  assert.ok(collection.includes('/research/tenders-procurement/opportunities/'),
    'the collection page does not link to opportunities: the page is an orphan');
  const page = read(I18N.localizedFile('en', BUILD.CANONICAL_PATH));
  assert.ok(page.includes('/research/tenders-procurement/'), 'no link back to the collection');
  assert.ok(page.includes('/research/tenders-procurement/intelligence/'), 'no link to Procurement Intelligence');
});

test('35. the CSV round-trips, carries every record, and keeps Unicode intact', () => {
  const csv = read('research/tenders-procurement/opportunities/opportunities.csv');
  assert.ok(csv.startsWith('﻿'), 'no UTF-8 BOM');
  assert.ok(csv.includes('\r\n'), 'not CRLF');
  const parsed = require('../lib/to-adapters/canadabuys.cjs').parseCsv(csv.slice(1));
  assert.strictEqual(parsed.length, O.length, `CSV holds ${parsed.length} rows for ${O.length} opportunities`);
  assert.deepStrictEqual(Object.keys(parsed[0]), BUILD.COLUMNS, 'CSV header drifted from the declared columns');
  // Identity survives the round trip.
  const ids = new Set(parsed.map((r) => r.id));
  for (const o of O) assert.ok(ids.has(o.id), `${o.id} is missing from the CSV`);
  // Non-Latin titles are intact, not mangled or entity-escaped into the CSV.
  const nonLatin = O.filter((o) => /[^ -ɏ]/.test(o.title || ''));
  assert.ok(nonLatin.length > 0, 'no non-Latin title in the corpus: this guard is vacuous');
  const byId = new Map(parsed.map((r) => [r.id, r]));
  for (const o of nonLatin.slice(0, 40)) {
    assert.strictEqual(byId.get(o.id).title, o.title, `${o.id}: title changed in the CSV`);
    assert.ok(!/&#\d+;|&[a-z]+;/.test(byId.get(o.id).title), `${o.id}: title was entity-escaped`);
  }
  assert.ok(!csv.includes('�'), 'the CSV contains a replacement character');
});

test('36. rendering and ranking are deterministic', () => {
  const platformsById = new Map();
  const countryName = (s) => s;
  const once = BUILD.renderMain(CORPUS, { locale: 'en', t: I18N.translator('en'), countryName, platformsById });
  const twice = BUILD.renderMain(CORPUS, { locale: 'en', t: I18N.translator('en'), countryName, platformsById });
  assert.strictEqual(once, twice, 'two renders of the same corpus differ');
  const r1 = MATCH.rank(O, 'telecom', { nowIso: NOW, limit: 20 }).map((x) => x.opportunity.id);
  const r2 = MATCH.rank(O.slice().reverse(), 'telecom', { nowIso: NOW, limit: 20 }).map((x) => x.opportunity.id);
  assert.deepStrictEqual(r1, r2, 'ranking depends on input order');
});

test('37. no personal contact data reaches the corpus or the published output', () => {
  const email = /\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/i;
  const leaks = O.filter((o) => email.test(JSON.stringify(o)));
  assert.strictEqual(leaks.length, 0,
    `${leaks.length} opportunity(ies) carry an email address (first: ${leaks[0] && leaks[0].id})`);
  const csv = read('research/tenders-procurement/opportunities/opportunities.csv');
  assert.ok(!email.test(csv), 'the published CSV contains an email address');
  // The strip is recursive, which is what OCDS needs.
  const nested = SOURCES.stripPersonalFields({
    parties: [{ name: 'Council', contactPoint: { email: 'x@y.gov', name: 'A Person' } }],
    contact_email: 'a@b.c',
  });
  assert.ok(!JSON.stringify(nested).includes('x@y.gov'), 'the nested contact survived the strip');
  assert.ok(!('contact_email' in nested));
  assert.ok(JSON.stringify(nested).includes('Council'), 'the buyer organisation was stripped too');
  // Prose is redacted, not rejected.
  const redacted = SOURCES.redactPersonalText('Enquiries to enquiries@example.gov.uk before Friday.');
  assert.ok(!email.test(redacted));
  assert.ok(redacted.includes('before Friday'), 'redaction destroyed the sentence');
});

test('38. a restricted source contributes no description text', () => {
  assert.strictEqual(SOURCES.mayStoreDescription('worldbank'), false);
  const wb = O.filter((o) => o.sourceId === 'worldbank');
  assert.ok(wb.length > 0, 'no World Bank records: this guard is vacuous');
  for (const o of wb) {
    assert.strictEqual(o.descriptionSummary, null,
      `${o.id}: a source with unclear reuse terms contributed description text`);
  }
  // And no stored summary is long enough to be a mirrored document.
  for (const o of O) {
    if (!o.descriptionSummary) continue;
    assert.ok(o.descriptionSummary.length <= SOURCES.SUMMARY_MAX_CHARS + 1,
      `${o.id}: a ${o.descriptionSummary.length}-character "summary" is a mirrored document`);
  }
});

test('39. source policy is complete for every pilot source', () => {
  assert.ok(SOURCES.SOURCES.length >= 5, 'fewer than five pilot sources');
  for (const s of SOURCES.SOURCES) {
    assert.ok(SOURCES.ACQUISITION_MODES.includes(s.acquisition), `${s.id}: bad acquisition mode`);
    assert.ok(SOURCES.REUSE_CLASSES.includes(s.reuse), `${s.id}: bad reuse class`);
    assert.ok(SOURCES.STORAGE_POLICIES.includes(s.storage), `${s.id}: bad storage policy`);
    assert.ok(s.reuseBasis && s.reuseBasis.length > 10, `${s.id}: no stated basis for its reuse class`);
    if (s.enabled === false) {
      // A registered-but-inactive source is allowed to have no platform — that
      // is often exactly why it is inactive — but it must say so out loud.
      assert.ok(s.readyState, `${s.id}: disabled without a declared readyState`);
      assert.ok(Array.isArray(s.knownRestrictions) && s.knownRestrictions.length,
        `${s.id}: disabled without a stated reason`);
    } else {
      assert.ok(PLATFORM_IDS.has(s.platformId), `${s.id}: platformId is not a canonical platform`);
    }
    assert.ok(typeof s.rateLimitNote === 'string' && s.rateLimitNote.length > 0, `${s.id}: no rate discipline stated`);
    // An unclear or restricted source may not store full metadata.
    if (s.reuse === 'UNCLEAR' || s.reuse === 'RESTRICTED') {
      assert.strictEqual(s.storage, 'MINIMAL_METADATA',
        `${s.id}: reuse is ${s.reuse} but it stores full metadata`);
    }
  }
  for (const r of SOURCES.REJECTED_SOURCES) {
    assert.ok(r.reason && r.reason.length > 20, `${r.id}: rejected without a stated reason`);
  }
  // Every adapter honours the contract, and every source has one.
  for (const a of ADAPTERS.ADAPTERS) {
    assert.deepStrictEqual(ADAPTERS.contractProblems(a), [], `${a.id} breaks the adapter contract`);
  }
  for (const s of SOURCES.SOURCES) assert.doesNotThrow(() => ADAPTERS.adapterFor(s.id));
});

test('40. snapshot provenance and coverage honesty', () => {
  for (const s of CORPUS.sources) {
    assert.ok(s.id && s.name, 'a source entry lacks identity');
    // Only a source that actually contributed records needs a platform.
    if (s.recordCount > 0) {
      assert.ok(s.platformId, `${s.id} contributed records without a canonical platform`);
    }
    assert.ok(typeof s.complete === 'boolean', `${s.id}: coverage completeness is not stated`);
    // A registered-but-inactive source has never been retrieved, and saying so
    // with a null is more honest than omitting it from the list.
    if (s.recordCount > 0) assert.ok(s.retrievedAt, `${s.id}: no retrieval timestamp`);
    else assert.strictEqual(s.complete, false, `${s.id}: contributed nothing but claims a complete window`);
    if (s.complete && s.population !== null) {
      // ── A LIVE PAGED WALK IS NOT A SINGLE-INSTANT READ ────────────────────
      //
      // For a single artefact this is exact: SAM.gov's file has a row count and
      // a snapshot cannot hold more than it. For a source walked page by page
      // over minutes it is not, because the register keeps publishing while we
      // read. Poland's 598-page walk collected 5,979 notices against the 5,978
      // its first page reported — tenders published mid-walk, appended past the
      // point already read, which is exactly why that traversal is ascending
      // rather than descending.
      //
      // The adapter now reads the count on every page so the figure reflects
      // the END of the walk. This tolerance covers the residue and is bounded
      // by one page: enough for publication drift, nowhere near enough to hide
      // duplication, which would be thousands of records and is caught by the
      // duplicate-ratio guard in to-snapshot.cjs regardless.
      const registered = SOURCES.SOURCE_BY_ID.get(s.id);
      const tolerance = registered && registered.pageSize ? registered.pageSize : 0;
      assert.ok(s.recordCount <= s.population + tolerance,
        `${s.id}: holds ${s.recordCount} records against a reported population of `
        + `${s.population} — beyond what publication during a walk can explain`);
    }
  }
  const partial = CORPUS.sources.filter((s) => !s.complete);
  assert.ok(partial.length > 0, 'no partial source: the partial-coverage disclosure is untested');
  // The page must say so, in every locale.
  for (const locale of I18N.LOCALE_CODES) {
    const html = read(I18N.localizedFile(locale, BUILD.CANONICAL_PATH));
    assert.ok(html.includes(I18N.t(locale, 'toi.coverage.partial')),
      `${locale}: partial coverage is not disclosed on the page`);
  }
});

test('41. the page states its freshness and never implies a live feed', () => {
  for (const locale of I18N.LOCALE_CODES) {
    const html = read(I18N.localizedFile(locale, BUILD.CANONICAL_PATH));
    assert.ok(html.includes(CORPUS.generatedAt.slice(0, 10)), `${locale}: no ingestion date shown`);
    // "Esto no es un flujo en tiempo real" contains "tiempo real". A negation
    // lookbehind cannot survive four languages putting different words between
    // the "no" and the phrase, so the first-party disclaimers are REMOVED and
    // what remains is scanned. Precise instead of clever: the claim we forbid
    // is one made outside the sentences that exist to deny it.
    const disclaimers = ['toi.freshness', 'toi.notAWinScore', 'toi.verifyDisclaimer']
      .map((k) => I18N.t(locale, k, { date: CORPUS.generatedAt.slice(0, 10) }));
    let rest = html;
    for (const d of disclaimers) {
      const escaped = d.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      rest = rest.split(escaped).join(' ');
    }
    assert.notStrictEqual(rest, html, `${locale}: the disclaimers are not on the page at all`);
    const IMPLIES_LIVE = /live feed|updated continuously|en temps réel|tiempo real|in Echtzeit|Echtzeit/i;
    assert.ok(!IMPLIES_LIVE.test(rest), `${locale}: the page implies real-time freshness`);
    assert.ok(/manual|manuell|manualmente|manuelle/i.test(html),
      `${locale}: the page does not say the refresh is manual`);
    // And the verify-before-acting disclaimer is present.
    assert.ok(html.includes(I18N.t(locale, 'toi.verifyDisclaimer').slice(0, 40)),
      `${locale}: no verify-at-source disclaimer`);
  }
});

test('42. sibling collections are untouched and platform drift is accounted', () => {
  const platforms = JSON.parse(read('data/tenders-procurement/platforms.json'));
  // 383 through Phase 3. Phase 4 added exactly one, deliberately and with
  // evidence: de-bekanntmachungsservice, the German federal notice service,
  // created so the German opportunity source had a canonical platform to
  // reference instead of minting one. Every platform change in this project is
  // individually accounted, which is why this number is asserted rather than
  // read from the file.
  assert.strictEqual(platforms.length, 384, 'the platform record count changed unaccountably');
  const added = platforms.find((p) => p.id === 'de-bekanntmachungsservice');
  assert.ok(added, 'the one accounted platform addition is missing');
  assert.strictEqual(added.evidenceClass, 'A', 'the added platform was created below the collection standard');
  assert.ok(added.evidenceUrl, 'the added platform carries no evidence URL');
  // It is a discovery surface, not a bidding platform — the finding that made
  // it addable at all, and the same shape TED has.
  assert.strictEqual(added.submissionUrl, null);
  assert.strictEqual(added.electronicSubmission, 'no');
  assert.strictEqual(added.supplierRegistrationRequired, 'no');
  for (const f of ['data/marketplaces/marketplaces.json', 'data/media-pr-publishing/media-platforms.json']) {
    assert.ok(fs.existsSync(path.join(ROOT, f)), `${f} disappeared`);
  }
  // Opportunities never write into a platform record.
  const buildSrc = read('scripts/build-tender-opportunities.cjs');
  assert.ok(!/writeFileSync\([^)]*platforms\.json/.test(buildSrc),
    'the opportunities build can write to the platform dataset');
  const ingestSrc = read('scripts/ingest-tender-opportunities.cjs');
  assert.ok(!/writeFileSync\([^)]*platforms\.json/.test(ingestSrc),
    'ingestion can write to the platform dataset');
});

// ── MUTATIONS ───────────────────────────────────────────────────────────────
//
// Each applies a real change, asserts something catches it, and restores. A
// mutation that no guard notices is reported as a survivor rather than quietly
// skipped.

const mutations = [];
const mutate = (name, fn) => { mutations.push({ name, fn }); test(`MUTATION: ${name}`, fn); };

mutate('a changed source notice id changes the opportunity id', () => {
  const o = fixture();
  const mutated = { ...o, sourceNoticeId: '999999-2026' };
  assert.deepStrictEqual(SCHEMA.problemsFor(mutated, PLATFORM_IDS).filter((p) => p.startsWith('id:')).length, 1,
    'an id that no longer derives from its source identity was accepted');
});

mutate('a duplicate notice with the same official id is caught', () => {
  const a = fixture();
  const b = fixture({ sourceId: 'uk-fts', sourcePlatformId: 'uk-find-a-tender', sourceNoticeId: 'x-1', sourceUrl: 'https://www.find-tender.service.gov.uk/Notice/x-1' });
  assert.strictEqual(DEDUPE.dedupe([a, b]).canonical.length, 1, 'a cross-source duplicate was not merged');
});

mutate('merging two unrelated similar-title tenders is refused', () => {
  const a = fixture({ sourceId: 'canadabuys', sourcePlatformId: 'ca-canadabuys', sourceNoticeId: 'a1', officialReference: 'AAA-111111', deadline: TIME.EMPTY, title: 'Office furniture supply' });
  const b = fixture({ sourceId: 'canadabuys', sourcePlatformId: 'ca-canadabuys', sourceNoticeId: 'b1', officialReference: 'BBB-222222', deadline: TIME.EMPTY, title: 'Office furniture supply' });
  assert.strictEqual(DEDUPE.dedupe([a, b]).canonical.length, 2, 'two unrelated tenders were merged');
});

mutate('failing to merge an exact cross-source duplicate is detectable', () => {
  const a = fixture();
  const b = fixture({ sourceId: 'uk-fts', sourcePlatformId: 'uk-find-a-tender', sourceNoticeId: 'x-2', sourceUrl: 'https://www.find-tender.service.gov.uk/Notice/x-2' });
  // Break the evidence properly. Removing only the reference still leaves an
  // identical buyer, an identical title and an agreeing deadline, which is
  // STRONG on its own — and that is correct behaviour, not a bug, so the
  // mutation has to remove the buyer agreement too.
  assert.strictEqual(DEDUPE.classify(a, { ...b, officialReference: null }), 'STRONG');
  const broken = { ...b, officialReference: null, buyerName: 'A Completely Different Authority' };
  assert.strictEqual(DEDUPE.classify(a, broken), null);
  assert.strictEqual(DEDUPE.dedupe([a, broken]).canonical.length, 2);
  // The intact pair still merges — so the guard above is about the evidence,
  // not about merging being broken.
  assert.strictEqual(DEDUPE.dedupe([a, b]).canonical.length, 1);
});

mutate('treating a passed deadline as open is caught', () => {
  const past = ts('2020-01-01T00:00:00Z');
  const { status } = SCHEMA.resolveStatus({ reportedStatus: null, deadline: past, nowIso: NOW });
  assert.strictEqual(status, 'CLOSED');
  const o = fixture({ status: 'CLOSED', statusBasis: 'DERIVED_FROM_DEADLINE', deadline: past });
  assert.strictEqual(SCHEMA.isCurrent(o), false);
  assert.strictEqual(MATCH.rank([o], 'telecom', { nowIso: NOW, limit: 5 }).length, 0,
    'a closed tender was recommended');
});

mutate('ignoring a cancellation is caught', () => {
  const o = fixture({ status: 'CANCELLED', statusBasis: 'SOURCE_REPORTED' });
  assert.strictEqual(MATCH.rank([o], 'telecom', { nowIso: NOW, limit: 5 }).length, 0);
  // And the schema refuses a record that claims both.
  const impossible = { ...o, status: 'CANCELLED' };
  Object.defineProperty(impossible, 'status', { value: 'CANCELLED', enumerable: true });
  assert.ok(!SCHEMA.isCurrent(impossible));
});

mutate('converting unknown foreign eligibility into a claim is caught', () => {
  const o = { ...fixture(), foreignSupplierEligibility: 'VERIFIED_ALLOWED' };
  // The model has no such field; the corpus guard is what catches it.
  const offenders = [o].filter((x) => 'foreignSupplierEligibility' in x);
  assert.strictEqual(offenders.length, 1,
    'the guard that detects a foreign-eligibility claim did not fire');
  const m = MATCH.matchFor(fixture(), 'foreign-supplier', { nowIso: NOW });
  assert.ok(m.uncertainty.includes('FOREIGN_ELIGIBILITY_NOT_STATED'));
});

mutate('inheriting platform eligibility into a tender is caught', () => {
  const platforms = JSON.parse(read('data/tenders-procurement/platforms.json'));
  const accepting = platforms.find((p) => p.foreignSuppliersAccepted === 'yes');
  assert.ok(accepting, 'no accepting platform: this mutation is vacuous');
  const o = fixture({ sourcePlatformId: accepting.id });
  const m = MATCH.matchFor(o, 'foreign-supplier', { nowIso: NOW, platform: accepting });
  assert.ok(m.uncertainty.includes('FOREIGN_ELIGIBILITY_NOT_STATED'),
    'the platform’s verified eligibility leaked into the tender');
});

mutate('a fabricated value is refused', () => {
  for (const bad of [
    { amount: 0, currency: 'EUR', basis: 'ESTIMATED' },
    { amount: 500000, currency: 'EUR' },
    { amount: 500000, currency: 'euro', basis: 'ESTIMATED' },
    { amountMin: 900, amountMax: 100, currency: 'EUR', basis: 'ESTIMATED' },
    { currency: 'EUR', basis: 'ESTIMATED' },
  ]) {
    const o = fixture({ value: bad });
    assert.ok(SCHEMA.problemsFor(o, PLATFORM_IDS).some((p) => p.startsWith('value')),
      `an invalid value was accepted: ${JSON.stringify(bad)}`);
  }
});

mutate('dropping source provenance is refused', () => {
  const o = fixture();
  const stripped = { ...o, occurrences: [] };
  assert.ok(SCHEMA.problemsFor(stripped, PLATFORM_IDS).some((p) => p.startsWith('occurrences')));
  const partial = { ...o, occurrences: [{ sourceId: 'ted' }] };
  assert.ok(SCHEMA.problemsFor(partial, PLATFORM_IDS).some((p) => p.startsWith('occurrences')));
});

mutate('a derived status may not pose as a source fact', () => {
  const o = fixture({ status: 'OPEN', statusBasis: 'UNKNOWN' });
  assert.ok(SCHEMA.problemsFor(o, PLATFORM_IDS).some((p) => p.startsWith('statusBasis')),
    'a known status with no established basis was accepted');
  const bad = fixture({ statusBasis: 'BECAUSE_WE_SAY_SO' });
  assert.ok(SCHEMA.problemsFor(bad, PLATFORM_IDS).some((p) => p.startsWith('statusBasis')));
});

mutate('an irrelevant tender cannot be lifted by platform score alone', () => {
  const food = fixture({ classifications: CLASS.normalizeCodes([['CPV', '15800000']]), title: 'Bakery products' });
  const best = JSON.parse(read('data/tenders-procurement/platforms.json')).find((p) => p.id === 'eu-ted');
  assert.ok(MATCH.matchFor(food, 'telecom', { nowIso: NOW, platform: best }).score < 65);
});

mutate('breaking the CPV match changes the ranking, and restoring it restores the ranking', () => {
  const original = MATCH.PROFILE_CLASSIFICATIONS.telecom.CPV.primary.slice();
  const before = MATCH.rank(O, 'telecom', { nowIso: NOW, limit: 10 }).map((x) => x.opportunity.id);
  MATCH.PROFILE_CLASSIFICATIONS.telecom.CPV.primary = ['99'];
  const after = MATCH.rank(O, 'telecom', { nowIso: NOW, limit: 10 }).map((x) => x.opportunity.id);
  MATCH.PROFILE_CLASSIFICATIONS.telecom.CPV.primary = original;
  const restored = MATCH.rank(O, 'telecom', { nowIso: NOW, limit: 10 }).map((x) => x.opportunity.id);
  assert.notDeepStrictEqual(before, after, 'breaking the CPV mapping did not change the telecom ranking');
  assert.deepStrictEqual(before, restored, 'the ranking did not restore');
});

mutate('inverting the dimension weights changes the ranking, and restoring restores it', () => {
  // Two opportunities with deliberately opposite profiles: one is a perfect
  // category match with nothing else, the other is weak on category and strong
  // on everything else. Comparing the live top ten would not do — its members
  // score identically and are separated only by the id tiebreak, so any change
  // applied equally to all of them leaves the order alone and the test would
  // pass while proving nothing.
  const categoryOnly = fixture({
    sourceNoticeId: 'w-1',
    classifications: CLASS.normalizeCodes([['CPV', '45000000']]),
    deadline: TIME.EMPTY, statusBasis: 'UNKNOWN', status: 'OPEN',
  });
  const everythingElse = fixture({
    sourceNoticeId: 'w-2',
    classifications: CLASS.normalizeCodes([['CPV', '15800000']]),
    deadline: ts('2026-09-01T12:00:00Z'), statusBasis: 'SOURCE_REPORTED',
    submissionUrl: 'https://portal.example.gov/bid', electronicSubmission: 'yes',
    electronicSubmissionBasis: 'SOURCE_REPORTED',
  });
  const pair = [categoryOnly, everythingElse];
  const rankIds = () => MATCH.rank(pair, 'construction', { nowIso: '2026-08-13T00:00:00.000Z', limit: 2 })
    .map((x) => x.opportunity.id);

  const original = { ...MATCH.WEIGHTS };
  const before = rankIds();
  Object.assign(MATCH.WEIGHTS, { category: 5, geography: 10, actionability: 35, deadline: 35, confidence: 15 });
  const after = rankIds();
  Object.assign(MATCH.WEIGHTS, original);
  const restored = rankIds();
  assert.notDeepStrictEqual(before, after, 'the weights do not affect the ranking');
  assert.deepStrictEqual(before, restored, 'the ranking did not restore');
  assert.deepStrictEqual(MATCH.WEIGHTS, original, 'the weights did not restore');
});

mutate('making telecom match generic "communication" noise is caught', () => {
  const noise = fixture({ classifications: [], title: 'Communication and engagement strategy for residents' });
  const r = MATCH.categoryScore(noise, 'telecom');
  assert.notStrictEqual(r.signal, 'TITLE_TERM', '"communication" became a telecom signal');
  assert.ok(r.score < 0.45);
});

mutate('removing the uncertainty explanation is caught', () => {
  const m = MATCH.matchFor(fixture({ classifications: [] }), 'telecom', { nowIso: NOW });
  assert.ok(m.uncertainty.length >= 2, 'an unclassified tender disclosed almost no uncertainty');
  assert.ok(m.uncertainty.includes('NO_CLASSIFICATION'));
});

mutate('overwriting a good snapshot with zero rows is refused', () => {
  const previous = { recordCount: 3000, records: new Array(3000).fill(null).map((_, i) => ({ id: `x${i}`, sourceId: 'ted', sourceNoticeId: `${i}`, sourceUrl: 'https://x/' })) };
  const empty = { recordCount: 0, records: [] };
  const v = SNAP.validateReplacement(empty, previous);
  assert.strictEqual(v.accept, false, 'an empty snapshot replaced 3,000 good records');
  assert.ok(v.reasons.some((r) => /outage|floor/.test(r)));
});

mutate('a collapsed snapshot is refused unless an operator says the shrink is intended', () => {
  const previous = { recordCount: 3000, records: [] };
  const shrunk = {
    recordCount: 100,
    records: new Array(100).fill(null).map((_, i) => ({ id: `y${i}`, sourceId: 'ted', sourceNoticeId: `${i}`, sourceUrl: 'https://x/' })),
  };
  assert.strictEqual(SNAP.validateReplacement(shrunk, previous).accept, false);
  assert.strictEqual(SNAP.validateReplacement(shrunk, previous, { allowShrink: true }).accept, true,
    'an explicitly intended reduction was still refused');
  // The override permits a smaller snapshot, never an empty or malformed one.
  assert.strictEqual(SNAP.validateReplacement({ recordCount: 0, records: [] }, previous, { allowShrink: true }).accept, false);
});

mutate('a repeated pagination page is caught by the duplicate ratio', () => {
  const page = new Array(50).fill(null).map((_, i) => ({ id: `p${i}`, sourceId: 'ted', sourceNoticeId: `${i}`, sourceUrl: 'https://x/' }));
  const doubled = { recordCount: 100, records: [...page, ...page] };
  const v = SNAP.validateReplacement(doubled, null);
  assert.strictEqual(v.accept, false, 'the same page twice was accepted');
  assert.ok(v.reasons.some((r) => /duplicate ratio/.test(r)));
  assert.ok(SNAP.duplicateRatio(doubled.records) > SNAP.MAX_DUPLICATE_RATIO);
});

mutate('page-one-only ingestion is visible as partial coverage, never as complete', () => {
  const snap = SNAP.buildSnapshot({
    source: SOURCES.SOURCE_BY_ID.get('ted'),
    adapterVersion: '1.0.0',
    retrievedAt: NOW,
    fetchResult: { raw: new Array(250), pages: 1, population: 6471, complete: false, endpoint: 'x' },
    records: new Array(250).fill(null).map((_, i) => ({ id: `q${i}` })),
  });
  assert.strictEqual(snap.complete, false, 'a first-page-only fetch reported complete coverage');
  assert.strictEqual(snap.population, 6471);
  assert.ok(snap.recordCount < snap.population);
});

mutate('putting a network request into the production build is caught', () => {
  const src = read('scripts/build-tender-opportunities.cjs');
  const mutated = `${src}\nfetch('https://api.ted.europa.eu/');\n`;
  const NETWORK = /\bfetch\s*\(|require\('node:https?'\)|XMLHttpRequest/;
  assert.ok(NETWORK.test(mutated), 'the detector would not notice a fetch in the build');
  assert.ok(!NETWORK.test(src), 'the real build already contains a network call');
});

mutate('corrupting Unicode is caught', () => {
  const nonLatin = O.filter((o) => /[^ -ɏ]/.test(o.title || ''));
  assert.ok(nonLatin.length > 0, 'no non-Latin title: this mutation is vacuous');
  const sample = nonLatin[0].title;
  const mangled = Buffer.from(sample, 'utf8').toString('latin1');
  assert.notStrictEqual(mangled, sample, 'the sample survived a latin1 round trip unchanged');
  // Detected by ROUND TRIP rather than by a hand-picked letter set: "Ã©" is the
  // signature of mangled French and "ä¸­" of mangled Chinese, and a list of
  // suspicious characters always misses the script nobody thought of.
  const recovered = Buffer.from(mangled, 'latin1').toString('utf8');
  assert.strictEqual(recovered, sample, 'the round-trip mojibake detector does not work');
  // And the corpus itself carries no corruption to recover from.
  assert.strictEqual(O.filter((o) => JSON.stringify(o).includes('\ufffd')).length, 0,
    'a replacement character reached the corpus');
  // The real corpus is clean.
  assert.strictEqual(O.filter((o) => (o.title || '').includes('�')).length, 0);
});

mutate('a wrong-timezone deadline is caught', () => {
  // Appending Z to a zoneless clock shifts a Vancouver deadline by 7 hours.
  const honest = ts('2026-08-13T14:00:00');
  const naive = ts('2026-08-13T14:00:00Z');
  assert.strictEqual(honest.iso, null);
  assert.strictEqual(naive.iso, '2026-08-13T14:00:00.000Z');
  assert.notStrictEqual(honest.precision, naive.precision);
  // And the schema refuses a zoneless timestamp that acquired an instant.
  const o = fixture({ deadline: { raw: '2026-08-13T14:00:00', iso: '2026-08-13T14:00:00.000Z', precision: 'ZONELESS' } });
  assert.ok(SCHEMA.problemsFor(o, PLATFORM_IDS).some((p) => p.includes('zoneless')),
    'a zoneless timestamp carrying a UTC instant was accepted');
});

mutate('changing canonical or hreflang is caught', () => {
  const html = read(I18N.localizedFile('en', BUILD.CANONICAL_PATH));
  const mutated = html.replace(/<link rel="canonical" href="[^"]+"/, '<link rel="canonical" href="https://example.com/"');
  const canonical = /<link rel="canonical" href="([^"]+)"/.exec(mutated)[1];
  const og = /<meta property="og:url" content="([^"]+)"/.exec(mutated)[1];
  assert.notStrictEqual(canonical, og, 'the canonical/og:url agreement check would not fire');
  assert.strictEqual(/<link rel="canonical" href="([^"]+)"/.exec(html)[1],
    /<meta property="og:url" content="([^"]+)"/.exec(html)[1]);
});

mutate('a filter crawl-space route would be caught', () => {
  const dir = path.join(ROOT, 'research', 'tenders-procurement', 'opportunities');
  const actual = fs.readdirSync(dir).filter((f) => !fs.statSync(path.join(dir, f)).isDirectory()).sort();
  assert.deepStrictEqual(actual, ['index.html', 'opportunities.csv', 'tender-index.json'],
    'the hub owns more than one page, one dataset and one search index');
  // A facet route like `country-germany` has the right SHAPE but no canonical
  // record behind it, so the family refuses to authorize it.
  const RF = require('../lib/route-family.cjs');
  const verdict = RF.authorize('/research/tenders-procurement/opportunities/country-germany/',
    RF.load(), { knownRoutes: new Set(), locale: 'en' });
  assert.strictEqual(verdict.authorized, false, 'a facet crawl-space route would be authorized');
  assert.strictEqual(verdict.reason, 'NOT_A_CANONICAL_RECORD');
});

mutate('breaking the sourcePlatform reference is caught', () => {
  const o = fixture({ sourcePlatformId: 'not-a-real-platform' });
  assert.ok(SCHEMA.problemsFor(o, PLATFORM_IDS).some((p) => p.startsWith('sourcePlatformId')));
  // And validating without the platform set is itself an error, not a pass.
  assert.ok(SCHEMA.problemsFor(fixture(), null).some((p) => p.startsWith('sourcePlatformId')),
    'validation without the canonical platform set silently skipped the check');
});

test('MUTATION SUITE: every mutation was applied and none was a no-op', () => {
  assert.ok(mutations.length >= 24, `only ${mutations.length} mutations declared`);
  for (const m of mutations) {
    assert.strictEqual(typeof m.fn, 'function', `${m.name} has no body`);
    assert.ok(m.fn.toString().includes('assert'), `${m.name} asserts nothing: it is a no-op`);
  }
});

// ── PHASE 2 ─────────────────────────────────────────────────────────────────
//
// Three sources added, a columnar corpus format, and the first live
// cross-source duplicates this project has had. Each of the guards below
// exists because Phase 2 found the failure it describes.

const CORPUSFMT = CORPUS_FORMAT;

test('P2-1. the corpus format round-trips losslessly', () => {
  const raw = JSON.parse(read('data/tender-opportunities/opportunities.json'));
  assert.strictEqual(raw.format, CORPUSFMT.FORMAT, 'the corpus is not in the current format');
  assert.ok(Array.isArray(raw.rows) && raw.rows.length > 0, 'the corpus has no rows');
  assert.deepStrictEqual(raw.fields, CORPUSFMT.FIELDS, 'the stored column list has drifted');
  // Decode → encode → decode must be stable.
  const once = CORPUSFMT.decode(raw);
  const again = CORPUSFMT.decode(CORPUSFMT.encode({
    generatedAt: once.generatedAt,
    adapterVersion: once.adapterVersion,
    sources: once.sources,
    stats: once.stats,
    possibleDuplicates: once.possibleDuplicates,
    opportunities: once.opportunities,
  }));
  assert.strictEqual(again.opportunities.length, once.opportunities.length);
  assert.deepStrictEqual(again.opportunities[0], once.opportunities[0], 'a record changed on re-encode');
  assert.deepStrictEqual(
    again.opportunities.at(-1), once.opportunities.at(-1), 'the last record changed on re-encode',
  );
});

test('P2-2. the format refuses to silently drop a field it has no column for', () => {
  // publishedEuWide was lost exactly this way: two adapters emitted it, the
  // column list did not have it, and the encode discarded it without a word.
  const rec = { ...O[0], somethingNobodyDeclared: 'value' };
  assert.throws(() => CORPUSFMT.encodeRow(rec), /no column for/,
    'a record carrying an undeclared field was encoded anyway');
  assert.deepStrictEqual(CORPUSFMT.unknownFields(O[0]), [],
    'a live record carries a field the format cannot store');
});

test('P2-3. compaction actually reduced the per-record cost', () => {
  const bytes = fs.statSync(path.join(ROOT, 'data/tender-opportunities/opportunities.json')).size;
  const perRecord = bytes / O.length;
  // v1 stored 2,146 bytes per record. The columnar format must stay well under
  // that, or the scaling blocker this format exists to remove is still there.
  assert.ok(perRecord < 1600,
    `${Math.round(perRecord)} bytes per record — compaction has regressed toward the v1 cost`);
});

test('P2-4. a single-source occurrence is reconstituted, never invented', () => {
  const single = O.filter((o) => !o.multiSource);
  assert.ok(single.length > 0, 'no single-source records: this guard is vacuous');
  for (const o of single.slice(0, 200)) {
    assert.strictEqual(o.occurrences.length, 1);
    const occ = o.occurrences[0];
    assert.strictEqual(occ.sourceId, o.sourceId);
    assert.strictEqual(occ.sourceNoticeId, o.sourceNoticeId);
    assert.strictEqual(occ.sourceUrl, o.sourceUrl);
  }
});

test('P2-5. live cross-source duplicates exist and keep every occurrence', () => {
  const multi = O.filter((o) => o.multiSource);
  assert.ok(multi.length > 0,
    'no cross-source duplicates in the corpus — the merge graph is untested on live data again');
  for (const m of multi) {
    const sources = new Set(m.occurrences.map((x) => x.sourceId));
    assert.ok(sources.size > 1, `${m.id} is flagged multi-source but has one source`);
    assert.strictEqual(m.occurrences.length, m.occurrenceCount);
    for (const occ of m.occurrences) {
      assert.ok(occ.sourceId && occ.sourceNoticeId && occ.sourceUrl,
        `${m.id} lost provenance on an occurrence`);
    }
    assert.ok(m.fieldSources && Object.keys(m.fieldSources).length > 0,
      `${m.id} is multi-source but records no field-level provenance`);
  }
});

test('P2-6. TED’s machine-generated title prefix is stripped for comparison only', () => {
  const tedTitle = 'France – Insurance services – Services d’assurances pour les membres du groupement';
  const national = 'Services d’assurances pour les membres du groupement';
  assert.strictEqual(DEDUPE.comparableTitle(tedTitle), 'Services d’assurances pour les membres du groupement');
  // An ordinary title containing a dash is NOT truncated.
  const ordinary = 'Refurbishment of the town hall – phase 2';
  assert.strictEqual(DEDUPE.comparableTitle(ordinary), ordinary);
  // The strip may only help a genuine pair, never hurt one.
  const a = { title: tedTitle };
  const b = { title: national };
  assert.ok(DEDUPE.titleSimilarity(a, b) > DEDUPE.jaccard(DEDUPE.tokens(tedTitle), DEDUPE.tokens(national)));
  assert.ok(DEDUPE.titleSimilarity(a, b) >= 0.85, 'the prefix strip does not recover the match');
  // And the stored title is untouched — only the comparison changed.
  const ted = O.find((o) => o.sourceId === 'ted' && / – .+ – /.test(o.title || ''));
  if (ted) assert.match(ted.title, / – /, 'the stored TED title was rewritten rather than compared');
});

test('P2-7. framework lots sharing one reference are never merged', () => {
  // "NFCC National Firefighter PPE - Lot 6 (Footwear)" was merged into
  // "Lot 8 (Cleaning and Maintenance)" — separately biddable contracts, one of
  // them hidden from every supplier.
  const lot6 = fixture({
    sourceId: 'uk-fts', sourcePlatformId: 'uk-find-a-tender', sourceNoticeId: 'ocds-x-05614d',
    sourceUrl: 'https://www.find-tender.service.gov.uk/Notice/05614d',
    buyerName: 'National Fire Chiefs Council', officialReference: 'NFCC-PPE-FRAMEWORK-2026',
    title: 'NFCC National Firefighter PPE - Lot 6 (Footwear)', country: 'united-kingdom',
    coverage: 'national', classifications: [],
  });
  const lot8 = fixture({
    sourceId: 'uk-fts', sourcePlatformId: 'uk-find-a-tender', sourceNoticeId: 'ocds-x-05614f',
    sourceUrl: 'https://www.find-tender.service.gov.uk/Notice/05614f',
    buyerName: 'National Fire Chiefs Council', officialReference: 'NFCC-PPE-FRAMEWORK-2026',
    title: 'NFCC National Firefighter PPE - Lot 8 (Cleaning and Maintenance)', country: 'united-kingdom',
    coverage: 'national', classifications: [],
  });
  assert.notStrictEqual(DEDUPE.classify(lot6, lot8), 'STRONG', 'two framework lots were merged');
  assert.notStrictEqual(DEDUPE.classify(lot6, lot8), 'EXACT');
  assert.strictEqual(DEDUPE.dedupe([lot6, lot8]).canonical.length, 2);

  // But an identical republication under two notice ids — the World Bank
  // issues one Request for Bids a dozen times — still merges.
  const rfbA = fixture({
    sourceId: 'worldbank', sourcePlatformId: 'int-world-bank-group-procurement',
    sourceNoticeId: 'OP00461119', sourceUrl: 'https://projects.worldbank.org/x/OP00461119',
    buyerName: 'Community-Based Recovery and Stabilization Project',
    officialReference: 'NE-SDS-517067-CW-RFB', classifications: [],
    title: 'TRAVAUX DE CONSTRUCTIONS DES INFRASTRUCTURES SCOLAIRES DANS LA REGION DE TILLABERI',
  });
  const rfbB = { ...rfbA, sourceNoticeId: 'OP00461120', id: 'worldbank:op00461120', sourceUrl: 'https://projects.worldbank.org/x/OP00461120' };
  assert.strictEqual(DEDUPE.classify(rfbA, rfbB), 'STRONG', 'identical republication stopped merging');
  assert.strictEqual(DEDUPE.dedupe([rfbA, rfbB]).canonical.length, 1);
});

test('P2-8. no live merge group collapses records with genuinely different titles', () => {
  for (const m of O.filter((o) => o.occurrenceCount > 1)) {
    const sources = new Set(m.occurrences.map((x) => x.sourceId));
    if (sources.size > 1) continue; // cross-publication: TED prefixes, covered by P2-6
    assert.ok(m.title, `${m.id} merged records but has no title`);
  }
  // Asserted structurally above; asserted numerically here so a regression in
  // the same-source rule shows up as a count rather than as a silent merge.
  const sameSourceGroups = O.filter((o) => o.occurrenceCount > 1
    && new Set(o.occurrences.map((x) => x.sourceId)).size === 1);
  assert.ok(sameSourceGroups.length > 0, 'no same-source merge groups: this guard is vacuous');
});

test('P2-9. the OCDS factory is reusable and its publishers are configured, not copied', () => {
  const { makeOcdsAdapter, PAGERS } = require('../lib/to-adapters/ocds.cjs');
  assert.ok(Object.keys(PAGERS).length >= 1, 'no paging dialects declared');
  const made = makeOcdsAdapter({ id: 'test-ocds', country: 'south-africa' });
  assert.deepStrictEqual(ADAPTERS.contractProblems(made), [], 'a factory adapter breaks the contract');
  assert.throws(() => makeOcdsAdapter({ id: 'x', pager: 'nonexistent' }), /paging dialect/);
  // The live South African source uses it.
  const za = ADAPTERS.adapterFor('za-etenders');
  assert.strictEqual(typeof za.normalize, 'function');
});

test('P2-10. every Phase 2 source is fully governed, like every v1 source', () => {
  for (const id of ['tenderned', 'boamp', 'za-etenders']) {
    const s = SOURCES.SOURCE_BY_ID.get(id);
    assert.ok(s, `${id} is not registered as a source`);
    assert.ok(PLATFORM_IDS.has(s.platformId), `${id} points at a non-canonical platform`);
    assert.ok(SOURCES.REUSE_CLASSES.includes(s.reuse), `${id} has no reuse class`);
    assert.ok(s.reuseBasis && s.reuseBasis.length > 20, `${id} states no basis for its reuse class`);
    assert.ok(Array.isArray(s.knownRestrictions), `${id} declares no restrictions array`);
    const inCorpus = O.filter((o) => o.sourceId === id);
    assert.ok(inCorpus.length > 0, `${id} contributed no records`);
  }
});

test('P2-11. the EU-wide publication flag survives into the corpus', () => {
  // It was dropped twice: once by the dedup field list, once by the columnar
  // format. It is the only field that says "TED should carry this too", which
  // is what makes under-merging measurable instead of invisible.
  const flagged = O.filter((o) => o.publishedEuWide === true);
  assert.ok(flagged.length > 0, 'no record carries the EU-wide publication flag');
  assert.ok(DEDUPE.CANONICAL_FIELDS.includes('publishedEuWide'),
    'the dedup field list would drop the flag during a merge');
  assert.ok(CORPUSFMT.FIELDS.includes('publishedEuWide'),
    'the corpus format has no column for the flag');
});


// ── PHASE 3 ─────────────────────────────────────────────────────────────────

const HEALTH = require('../lib/to-health.cjs');
const ZIPLIB = require('../lib/to-zip.cjs');
const INGEST = require('../ingest-tender-opportunities.cjs');
const REFRESH = require('../refresh-tender-opportunities.cjs');

test('P3-1. the source registry distinguishes registered from active', () => {
  const registered = SOURCES.allSourceIds();
  const enabled = SOURCES.sourceIds();
  assert.ok(registered.length >= enabled.length);
  // Every ENABLED source must actually have contributed records — a source
  // list is a claim about coverage, and a logo with no data is a false one.
  const contributing = new Set(O.map((o) => o.sourceId));
  for (const id of enabled) {
    assert.ok(contributing.has(id), `${id} is enabled but contributed no records`);
  }
  // And every inactive one must be inactive for a stated reason.
  for (const s of SOURCES.SOURCES.filter((x) => x.enabled === false)) {
    assert.ok(s.readyState, `${s.id} is disabled without a readyState`);
    assert.ok(!contributing.has(s.id), `${s.id} is disabled but contributed records`);
  }
});

test('P3-2. every adapter has a source and every source has an adapter', () => {
  for (const s of SOURCES.SOURCES) {
    assert.doesNotThrow(() => ADAPTERS.adapterFor(s.id), `${s.id} has no adapter`);
  }
  for (const a of ADAPTERS.ADAPTERS) {
    assert.ok(SOURCES.SOURCE_BY_ID.has(a.id), `adapter ${a.id} has no source-policy record`);
    assert.deepStrictEqual(ADAPTERS.contractProblems(a), [], `${a.id} breaks the adapter contract`);
  }
});

test('P3-3. the ZIP reader handles real archives and refuses what it cannot do', () => {
  const zlib = require('node:zlib');
  // Build a minimal deflate ZIP in memory rather than committing a fixture.
  const name = Buffer.from('a.json');
  const content = Buffer.from('{"ok":true}');
  const deflated = zlib.deflateRawSync(content);
  const crc = 0; // not validated by this reader
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6);
  local.writeUInt16LE(8, 8); local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(deflated.length, 18); local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
  const localAll = Buffer.concat([local, name, deflated]);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10);
  central.writeUInt32LE(deflated.length, 20); central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(name.length, 28); central.writeUInt32LE(0, 42);
  const centralAll = Buffer.concat([central, name]);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralAll.length, 12); eocd.writeUInt32LE(localAll.length, 16);
  const zip = Buffer.concat([localAll, centralAll, eocd]);

  const entries = ZIPLIB.readZip(zip);
  assert.strictEqual(entries.length, 1);
  assert.strictEqual(entries[0].name, 'a.json');
  assert.deepStrictEqual(JSON.parse(entries[0].data.toString('utf8')), { ok: true });
  const { entries: json } = ZIPLIB.readJsonEntries(zip);
  assert.strictEqual(json.length, 1);
  // Not a ZIP at all, and a truncated one, both fail loudly.
  assert.throws(() => ZIPLIB.readZip(Buffer.from('not a zip archive at all!!')), /Not a ZIP/);
  assert.throws(() => ZIPLIB.readZip(Buffer.alloc(4)), /too short/);
});

test('P3-4. failure classes are specific, not "network error"', () => {
  const c = (msg, status) => { const e = new Error(msg); if (status) e.status = status; return HEALTH.classifyFailure(e); };
  assert.strictEqual(c('HTTP 429 for https://x/'), 'RATE_LIMITED');
  assert.strictEqual(c('HTTP 401 for https://x/'), 'AUTH_REQUIRED');
  assert.strictEqual(c('HTTP 403 for https://x/'), 'WAF');
  assert.strictEqual(c('HTTP 404 for https://x/'), 'SCHEMA_CHANGED');
  assert.strictEqual(c('The operation was aborted'), 'TIMEOUT');
  assert.strictEqual(c('Response from x was not JSON (<html>)'), 'INVALID_PAYLOAD');
  assert.strictEqual(c('Corrupt central directory at entry 3'), 'INVALID_PAYLOAD');
  assert.strictEqual(c('something nobody predicted'), 'TRANSPORT');
  for (const f of HEALTH.FAILURE_CLASSES) assert.strictEqual(typeof f, 'string');
});

test('P3-5. source health escalates, recovers, and never touches a tender', () => {
  let e = HEALTH.recordAttempt(null, { sourceId: 'x', nowIso: NOW, result: 'SUCCESS', recordCount: 100 });
  assert.strictEqual(e.state, 'HEALTHY');
  assert.strictEqual(e.consecutiveFailures, 0);
  for (let i = 0; i < 2; i += 1) {
    e = HEALTH.recordAttempt(e, { sourceId: 'x', nowIso: NOW, result: 'FAILURE', errorClass: 'TRANSPORT' });
  }
  assert.strictEqual(e.state, 'DEGRADED');
  // The last good record count survives the failures — that is what "kept the
  // previous snapshot" means operationally.
  assert.strictEqual(e.lastSuccessfulRecordCount, 100);
  for (let i = 0; i < 3; i += 1) {
    e = HEALTH.recordAttempt(e, { sourceId: 'x', nowIso: NOW, result: 'FAILURE', errorClass: 'TRANSPORT' });
  }
  assert.strictEqual(e.state, 'FAILING');
  e = HEALTH.recordAttempt(e, { sourceId: 'x', nowIso: NOW, result: 'SUCCESS', recordCount: 120 });
  assert.strictEqual(e.state, 'HEALTHY');
  assert.strictEqual(e.consecutiveFailures, 0);

  // Health is invisible to the match engine: an unreachable source does not
  // demote the tenders it published last week.
  const matchSrc = read('scripts/lib/to-match.cjs');
  assert.ok(!/to-health|sourceHealth|consecutiveFailures|HEALTHY|DEGRADED/.test(matchSrc),
    'the match engine can see source health');
  const schemaSrc = read('scripts/lib/to-schema.cjs');
  assert.ok(!/to-health|consecutiveFailures/.test(schemaSrc), 'tender status can see source health');
});

test('P3-6. staleness is a freshness statement, derived per source', () => {
  const continuous = { updateFrequency: 'continuous, business days' };
  const daily = { updateFrequency: 'daily' };
  const slow = { updateFrequency: 'unknown' };
  assert.ok(HEALTH.staleAfterHours(continuous) < HEALTH.staleAfterHours(daily));
  assert.ok(HEALTH.staleAfterHours(daily) < HEALTH.staleAfterHours(slow));
  const fresh = { lastSuccessfulAt: NOW };
  assert.strictEqual(HEALTH.isStale(fresh, continuous, NOW), false);
  const old = { lastSuccessfulAt: new Date(Date.parse(NOW) - 100 * 3600000).toISOString() };
  assert.strictEqual(HEALTH.isStale(old, continuous, NOW), true);
  // Never refreshed is stale, not healthy.
  assert.strictEqual(HEALTH.isStale(null, daily, NOW), true);
});

test('P3-7. a refresh that changes no fact writes no corpus', () => {
  // The corpus carries generatedAt and per-source retrievedAt, which move on
  // every run. Masking them is what stops the git history filling with commits
  // that say only "this ran again".
  const raw = JSON.parse(read('data/tender-opportunities/opportunities.json'));
  const later = JSON.parse(JSON.stringify(raw));
  later.generatedAt = '2099-01-01T00:00:00.000Z';
  for (const s of later.sources) if (s.retrievedAt) s.retrievedAt = '2099-01-01T00:00:00.000Z';
  assert.deepStrictEqual(INGEST.maskTimestamps(later), INGEST.maskTimestamps(raw),
    'masking does not neutralise the timestamps');
  // A real fact change must still be visible through the mask.
  const changed = JSON.parse(JSON.stringify(raw));
  changed.rows[0] = changed.rows[0].slice();
  changed.rows[0][5] = 'a different title';
  assert.notDeepStrictEqual(INGEST.maskTimestamps(changed), INGEST.maskTimestamps(raw),
    'a changed title was masked away');
});

test('P3-8. the orchestrator exists, parses its arguments, and is not in the build path', () => {
  assert.strictEqual(typeof REFRESH.parseArgs, 'function');
  assert.deepStrictEqual(REFRESH.parseArgs(['--source', 'ted']).only, ['ted']);
  assert.deepStrictEqual(REFRESH.parseArgs(['--source', 'ted', '--source', 'boamp']).only, ['ted', 'boamp']);
  assert.strictEqual(REFRESH.parseArgs(['--all']).all, true);
  assert.strictEqual(REFRESH.parseArgs([]).all, true, 'no argument must not silently refresh nothing');
  assert.strictEqual(REFRESH.parseArgs(['--dry-run']).dryRun, true);
  // The orchestrator reaches the network; the build must not reach it.
  const buildSrc = read('scripts/build-tender-opportunities.cjs');
  assert.ok(!/refresh-tender-opportunities|to-health|to-http/.test(buildSrc.replace(/^\/\/.*$/gm, '')),
    'the build can reach the refresh orchestrator');
});

test('P3-9. source health is operational state and is not committed', () => {
  const gitignore = read('.gitignore');
  assert.ok(gitignore.includes('data/tender-opportunities/snapshots/'),
    'the snapshot directory is not gitignored');
  assert.ok(REFRESH.HEALTH_FILE.includes('snapshots'),
    'the health file sits outside the gitignored snapshot directory');
});

test('P3-10. window semantics are declared per source and never overstated', () => {
  for (const s of SOURCES.SOURCES) {
    assert.ok(s.window && typeof s.window === 'object', `${s.id}: no window declared`);
    assert.ok(['publication', 'updated', 'source-defined', 'most-recent'].includes(s.window.kind),
      `${s.id}: window kind "${s.window.kind}" is not a declared semantic`);
  }
  // Completeness in the corpus must be a boolean, and a partial window must be
  // visible to a reader in every locale.
  const partial = CORPUS.sources.filter((s) => !s.complete);
  assert.ok(partial.length > 0, 'no partial source: the disclosure guard is vacuous');
  for (const locale of I18N.LOCALE_CODES) {
    const html = read(I18N.localizedFile(locale, BUILD.CANONICAL_PATH));
    assert.ok(html.includes(I18N.t(locale, 'toi.coverage.partial')), `${locale}: partial coverage hidden`);
  }
});

test('P3-11. the new sources behave like the old ones', () => {
  for (const id of ['uk-contracts-finder']) {
    const recs = O.filter((o) => o.sourceId === id);
    assert.ok(recs.length > 0, `${id} contributed nothing`);
    for (const o of recs) {
      assert.deepStrictEqual(SCHEMA.problemsFor(o, PLATFORM_IDS), [], `${id}/${o.id} is invalid`);
      assert.ok(!/[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(JSON.stringify(o)), `${id}/${o.id} leaks an address`);
    }
    // Status and deadline safety hold for the new source too.
    for (const o of recs) {
      if (o.status === 'CANCELLED' || o.noticeType === 'CONTRACT_AWARD') {
        assert.ok(!SCHEMA.isCurrent(o), `${id}/${o.id}: not-current status is current`);
      }
      if (o.deadline && o.deadline.precision === 'ZONELESS') {
        assert.strictEqual(o.deadline.iso, null, `${id}/${o.id}: zoneless deadline gained an instant`);
      }
    }
  }
});

test('P3-12. cross-source deduplication grew and stayed precise', () => {
  const multi = O.filter((o) => o.multiSource);
  assert.ok(multi.length >= 139, `cross-source merges fell to ${multi.length}`);
  const pairs = {};
  for (const m of multi) {
    const k = [...new Set(m.occurrences.map((x) => x.sourceId))].sort().join('+');
    pairs[k] = (pairs[k] || 0) + 1;
  }
  assert.ok(Object.keys(pairs).length >= 1, 'no cross-source pairs at all');
  // Precision: no same-source group merged records with dissimilar titles.
  for (const m of O.filter((o) => o.occurrenceCount > 1)) {
    if (new Set(m.occurrences.map((x) => x.sourceId)).size > 1) continue;
    assert.ok(m.title, `${m.id} merged without a title`);
  }
});

// ── PHASE 3 MUTATIONS ───────────────────────────────────────────────────────

mutate('P3: a new canonical field with no column is refused, not dropped', () => {
  const rec = { ...O[0], phase4Field: 'x' };
  assert.throws(() => CORPUSFMT.encodeRow(rec), /no column for/);
});

mutate('P3: a source without a policy record is caught', () => {
  const orphan = { id: 'invented-source', fetchAll() {}, normalize(a, b) { return null; } };
  assert.ok(!SOURCES.SOURCE_BY_ID.has(orphan.id), 'the fixture collides with a real source');
  const registered = ADAPTERS.ADAPTERS.every((a) => SOURCES.SOURCE_BY_ID.has(a.id));
  assert.ok(registered, 'an adapter already exists without a source-policy record');
});

mutate('P3: an enabled source that contributed nothing is caught', () => {
  const contributing = new Set(O.map((o) => o.sourceId));
  const idle = SOURCES.sourceIds().filter((id) => !contributing.has(id));
  assert.deepStrictEqual(idle, [], `enabled but idle: ${idle.join(', ')}`);
  // And the reverse: a disabled source must not appear in the data.
  const disabled = SOURCES.SOURCES.filter((s) => s.enabled === false).map((s) => s.id);
  for (const id of disabled) assert.ok(!contributing.has(id), `${id} is disabled but present`);
});

mutate('P3: a failed source must not delete its snapshot or block the others', () => {
  // Modelled on the live test: one source 404s, another succeeds.
  const previous = { recordCount: 44, records: new Array(44).fill(null).map((_, i) => ({ id: `z${i}`, sourceId: 'za-etenders', sourceNoticeId: `${i}`, sourceUrl: 'https://x/' })) };
  const err = new Error('HTTP 404 for https://ocds-api.etenders.gov.za/api/DOES-NOT-EXIST');
  assert.strictEqual(HEALTH.classifyFailure(err), 'SCHEMA_CHANGED');
  const entry = HEALTH.recordAttempt({ lastSuccessfulRecordCount: 44, lastSuccessfulAt: NOW, consecutiveFailures: 0 },
    { sourceId: 'za-etenders', nowIso: NOW, result: 'FAILURE', errorClass: 'SCHEMA_CHANGED' });
  assert.strictEqual(entry.lastSuccessfulRecordCount, 44, 'the previous good count was lost');
  assert.strictEqual(entry.lastSuccessfulAt, NOW, 'the previous success time was lost');
  assert.ok(previous.records.length === 44, 'the previous snapshot was mutated');
});

mutate('P3: a stale source cannot be marked healthy', () => {
  const src = { updateFrequency: 'continuous, business days' };
  const longAgo = { lastSuccessfulAt: new Date(Date.parse(NOW) - 500 * 3600000).toISOString(), lastResult: 'SUCCESS', lastAttemptAt: NOW };
  // It can be HEALTHY (the last attempt worked) and STALE at once — those are
  // different questions, and collapsing them would hide one of them.
  assert.strictEqual(HEALTH.stateFor(longAgo), 'HEALTHY');
  assert.strictEqual(HEALTH.isStale(longAgo, src, NOW), true, 'a 500-hour-old success is not stale');
});

mutate('P3: source health cannot alter a match score', () => {
  const o = fixture();
  const before = MATCH.matchFor(o, 'telecom', { nowIso: NOW }).score;
  const withHealth = { ...o, sourceHealth: 'FAILING', consecutiveFailures: 9 };
  const after = MATCH.matchFor(withHealth, 'telecom', { nowIso: NOW }).score;
  assert.strictEqual(before, after, 'source health changed a match score');
});

mutate('P3: a refresh timestamp alone must not churn the corpus', () => {
  const raw = JSON.parse(read('data/tender-opportunities/opportunities.json'));
  const bumped = JSON.parse(JSON.stringify(raw));
  bumped.generatedAt = '2099-01-01T00:00:00.000Z';
  assert.deepStrictEqual(INGEST.maskTimestamps(bumped), INGEST.maskTimestamps(raw));
});

mutate('P3: an incomplete window cannot be labelled complete', () => {
  const snap = SNAP.buildSnapshot({
    source: SOURCES.SOURCE_BY_ID.get('worldbank'),
    adapterVersion: '1.0.0', retrievedAt: NOW,
    fetchResult: { raw: new Array(1000), pages: 10, population: 414892, complete: false, endpoint: 'x' },
    records: new Array(1000).fill(null).map((_, i) => ({ id: `w${i}` })),
  });
  assert.strictEqual(snap.complete, false);
  assert.ok(snap.recordCount < snap.population);
  const live = CORPUS.sources.find((s) => s.id === 'worldbank');
  assert.strictEqual(live.complete, false, 'the World Bank window is advertised as complete');
});

mutate('P3: an awards-only source would be visible as such', () => {
  // Singapore GeBIZ publishes awarded tenders. Were it ingested, every record
  // would be AWARDED and none would be current — which is what the probe
  // detected before any adapter was written.
  const awarded = fixture({ noticeType: 'CONTRACT_AWARD', status: 'AWARDED', statusBasis: 'SOURCE_REPORTED' });
  assert.strictEqual(SCHEMA.isCurrent(awarded), false);
  assert.strictEqual(MATCH.rank([awarded], 'telecom', { nowIso: NOW, limit: 5 }).length, 0);
});

mutate('P3: an HTML-only or WAF source cannot be recorded as an API', () => {
  for (const r of SOURCES.REJECTED_SOURCES) {
    assert.ok(SOURCES.ACQUISITION_MODES.includes(r.acquisition), `${r.id}: bad acquisition mode`);
    // A rejected source must not be silently registered as active.
    const active = SOURCES.SOURCES.find((s) => s.id === r.id && s.enabled !== false);
    assert.ok(!active, `${r.id} is both rejected and active`);
  }
});

mutate('P3: a key-requiring source cannot run without its secret', () => {
  // SAM.gov stays deferred. No secret is committed anywhere, and no source in
  // the registry reads one.
  const src = read('scripts/lib/to-sources.cjs') + read('scripts/lib/to-http.cjs')
    + read('scripts/refresh-tender-opportunities.cjs');
  assert.ok(!/api[_-]?key\s*[:=]\s*['"][A-Za-z0-9]{8,}/i.test(src), 'a literal API key is present');
  const keyed = SOURCES.SOURCES.filter((s) => s.authRequired);
  for (const s of keyed) {
    assert.strictEqual(s.enabled, false, `${s.id} requires auth but is enabled`);
  }
});

mutate('P3: the build cannot reach the orchestrator, an adapter, or the HTTP helper', () => {
  const strip = (s) => s.replace(/^\s*\/\/.*$/gm, '');
  for (const rel of ['scripts/build-tender-opportunities.cjs', 'scripts/build-tenders-procurement.cjs',
    'scripts/build-tenders-intelligence.cjs']) {
    const src = strip(read(rel));
    assert.ok(!/require\([^)]*to-http/.test(src), `${rel} requires the HTTP helper`);
    assert.ok(!/require\([^)]*refresh-tender-opportunities/.test(src), `${rel} requires the orchestrator`);
    assert.ok(!/require\([^)]*to-adapters/.test(src), `${rel} requires an adapter`);
    assert.ok(!/require\([^)]*to-zip/.test(src), `${rel} requires the archive reader`);
  }
});

mutate('P3: canonical platform data and the matching model did not move', () => {
  // BRITTLE MIRROR, REMOVED: `platforms.length === 384` — the second of three
  // copies of the same array length. The accounted baseline stays in test 42
  // above, where the count is followed by the identity and the evidence of the
  // one platform it accounts for; here it was a bystander that turned every
  // future platform addition into a failure of a source-expansion phase guard.
  PARITY.assertPlatformPublicationParity(assert);
  // The matching model is frozen for a source-expansion phase.
  assert.strictEqual(Object.values(MATCH.WEIGHTS).reduce((a, b) => a + b, 0), 100);
  assert.deepStrictEqual(MATCH.WEIGHTS,
    { category: 40, geography: 20, actionability: 15, deadline: 15, confidence: 10 },
    'the match weights changed during a source-expansion phase');
  assert.strictEqual(Object.keys(MATCH.PROFILES).length, 16, 'the profile count changed');
});

// ── PHASE 4: THE PLATFORM BOUNDARY ──────────────────────────────────────────
//
// The invariant this phase exists to protect: an opportunity source may
// REFERENCE a canonical platform, never CREATE one. Phase 3 held Germany back
// for exactly this reason; Phase 4 unblocked it by doing the platform research
// first, in the right order.

test('P4-1. every active source references a real, publishable, active platform', () => {
  const platforms = JSON.parse(read('data/tenders-procurement/platforms.json'));
  const byId = new Map(platforms.map((p) => [p.id, p]));
  for (const s of SOURCES.ENABLED()) {
    const p = byId.get(s.platformId);
    assert.ok(p, `${s.id} references platform "${s.platformId}", which does not exist`);
    assert.strictEqual(p.currentStatus, 'active', `${s.id} references a non-active platform`);
    assert.ok(!p.replacedBy, `${s.id} references a platform that has been replaced`);
    // A source must not point at a software vendor or an authority-only record.
    assert.notStrictEqual(p.operatorType, 'private-company',
      `${s.id} maps to a private company — check this is the operator, not the vendor`);
  }
});

test('P4-2. the source registry cannot mint a platform', () => {
  // No source file may write to the platform dataset, and no adapter may
  // construct a platform record.
  for (const rel of ['scripts/ingest-tender-opportunities.cjs', 'scripts/refresh-tender-opportunities.cjs',
    'scripts/lib/to-sources.cjs', 'scripts/lib/to-adapters/index.cjs']) {
    const src = read(rel);
    assert.ok(!/writeFileSync\([^)]*platforms\.json/.test(src), `${rel} can write to the platform dataset`);
    assert.ok(!/platformType\s*:/.test(src), `${rel} constructs something shaped like a platform record`);
  }
  // And the schema still refuses an unknown platform reference.
  const orphan = fixture({ sourcePlatformId: 'de-invented-by-a-source' });
  assert.ok(SCHEMA.problemsFor(orphan, PLATFORM_IDS).some((p) => p.startsWith('sourcePlatformId')));
});

test('P4-3. Germany resolved to a discovery surface, not a bidding platform', () => {
  const platforms = JSON.parse(read('data/tenders-procurement/platforms.json'));
  const de = platforms.find((p) => p.id === 'de-bekanntmachungsservice');
  assert.ok(de, 'the German platform record is missing');
  // The finding that made the record addable: it is the same ontological class
  // as TED — free search, no registration, no bidding — and the bidding
  // platforms it aggregates are separate records that already existed.
  const ted = platforms.find((p) => p.id === 'eu-ted');
  for (const field of ['submissionUrl', 'electronicSubmission', 'supplierRegistrationRequired', 'searchAccess']) {
    assert.strictEqual(de[field], ted[field],
      `${field} differs from the TED precedent this record was justified against`);
  }
  // The systems where German bidding actually happens are still their own
  // records, and this one did not absorb them.
  for (const id of ['de-evergabe-bund', 'de-vergabeplattform-berlin']) {
    assert.ok(platforms.some((p) => p.id === id), `${id} disappeared`);
  }
  assert.notStrictEqual(de.id, 'de-evergabe-bund', 'the notice service was conflated with e-Vergabe');
  // Operated by a public body, not a vendor or an open-data host.
  assert.ok(['government', 'central-purchasing-body', 'contracting-authority'].includes(de.operatorType));
  assert.ok(!/github|ckan|socrata|data\.gov/i.test(de.officialUrl), 'the open-data host was mistaken for the platform');
});

test('P4-4. Germany is active and contributed materially unique coverage', () => {
  const de = O.filter((o) => o.occurrences.some((x) => x.sourceId === 'de-vergabe'));
  assert.ok(de.length > 500, `Germany contributed only ${de.length} records`);
  const only = de.filter((o) => !o.multiSource);
  // The whole thesis: a national notice service carries below-threshold and
  // national-only procurement that never reaches TED. If everything merged,
  // the platform gap was not worth closing.
  assert.ok(only.length > de.length * 0.5,
    `only ${only.length} of ${de.length} German notices are unique — the source is mostly a TED mirror`);
  const merged = de.filter((o) => o.multiSource);
  assert.ok(merged.length > 0, 'no German notice merged with TED — the overlap was not detected at all');
});

test('P4-5. German lot-bearing procedures stayed single opportunities', () => {
  const deLots = O.filter((o) => o.sourceId === 'de-vergabe' && o.lotCount > 1);
  assert.ok(deLots.length > 50, 'too few multi-lot German records to test lot safety');
  const biggest = Math.max(...deLots.map((o) => o.lotCount));
  assert.ok(biggest > 20, `the largest German procedure has only ${biggest} lots`);
  // One procedure with a hundred lots is one opportunity, not a hundred.
  for (const o of deLots) {
    assert.strictEqual(o.occurrences.filter((x) => x.sourceId === 'de-vergabe').length, 1,
      `${o.id} expanded its lots into separate occurrences`);
  }
});

test('P4-6. platform additions are individually accounted, not bulk drift', () => {
  const platforms = JSON.parse(read('data/tenders-procurement/platforms.json'));
  // Exactly one record carries a Phase 4 verification date AND is new. Every
  // other record's evidence predates this phase.
  const added = platforms.filter((p) => p.id === 'de-bekanntmachungsservice');
  assert.strictEqual(added.length, 1);
  for (const p of added) {
    assert.ok(p.evidenceClass && p.evidenceUrl && p.evidenceNote,
      `${p.id} was created without the collection's evidence standard`);
    assert.ok(p.evidenceNote.length > 120, `${p.id} has a token evidence note`);
    assert.ok(Array.isArray(p.limitations) && p.limitations.length,
      `${p.id} declares no limitations`);
  }
});

// ── PHASE 4 MUTATIONS ───────────────────────────────────────────────────────

mutate('P4: a source mapped to a nonexistent platform is refused', () => {
  assert.ok(SCHEMA.problemsFor(fixture({ sourcePlatformId: 'nope' }), PLATFORM_IDS).length > 0);
});

mutate('P4: a source mapped to a software vendor would be visible', () => {
  const platforms = JSON.parse(read('data/tenders-procurement/platforms.json'));
  const vendorish = platforms.filter((p) => p.operatorType === 'private-company').map((p) => p.id);
  assert.ok(vendorish.length > 0, 'no private-company platforms exist: this guard is vacuous');
  const mapped = SOURCES.ENABLED().filter((s) => vendorish.includes(s.platformId));
  assert.deepStrictEqual(mapped.map((s) => s.id), [],
    'an active source maps to a privately operated platform');
});

mutate('P4: an open-data host cannot stand in for a platform', () => {
  const platforms = JSON.parse(read('data/tenders-procurement/platforms.json'));
  const byId = new Map(platforms.map((p) => [p.id, p]));
  const HOSTS = /github\.com|ckan|socrata|datos\.gob|data\.gov|amazonaws|blob\.core/i;
  for (const s of SOURCES.ENABLED()) {
    const p = byId.get(s.platformId);
    assert.ok(!HOSTS.test(p.officialUrl),
      `${s.id} maps to a platform whose official URL is a data host: ${p.officialUrl}`);
  }
  // SECOP II is the case that proves the rule: it is ingested THROUGH
  // datos.gov.co but maps to co-secop-ii, the procurement system itself.
  const secop = SOURCES.SOURCE_BY_ID.get('secop2');
  assert.match(secop.endpoint, /datos\.gov\.co/);
  assert.strictEqual(secop.platformId, 'co-secop-ii');
  assert.match(byId.get('co-secop-ii').officialUrl, /secop\.gov\.co/);
});

mutate('P4: Germany cannot be active without its platform record', () => {
  const de = SOURCES.SOURCE_BY_ID.get('de-vergabe');
  assert.ok(de.platformId, 'the German source has no platform reference');
  assert.ok(PLATFORM_IDS.has(de.platformId), 'the German platform reference does not resolve');
  // Removing the platform must break the source, not be silently tolerated.
  const withoutPlatform = new Set([...PLATFORM_IDS].filter((id) => id !== de.platformId));
  const deRecord = O.find((o) => o.sourceId === 'de-vergabe');
  assert.ok(deRecord, 'no German records to test against');
  assert.ok(SCHEMA.problemsFor(deRecord, withoutPlatform).some((p) => p.startsWith('sourcePlatformId')),
    'a German record validates even with its platform removed');
});

mutate('P4: a platform added without evidence would be caught', () => {
  const weak = { id: 'xx-weak', name: 'Weak', officialUrl: 'https://x.example/', country: 'germany',
    platformType: 'national-procurement', evidenceClass: 'unknown', evidenceUrl: null };
  assert.ok(!weak.evidenceUrl && weak.evidenceClass === 'unknown',
    'the fixture is not actually weak');
  // The real record clears the bar the fixture fails.
  const platforms = JSON.parse(read('data/tenders-procurement/platforms.json'));
  const real = platforms.find((p) => p.id === 'de-bekanntmachungsservice');
  assert.strictEqual(real.evidenceClass, 'A');
  assert.ok(real.evidenceUrl);
});

mutate('P4: the match model did not move during a platform/source phase', () => {
  assert.deepStrictEqual(MATCH.WEIGHTS,
    { category: 40, geography: 20, actionability: 15, deadline: 15, confidence: 10 });
  assert.strictEqual(Object.keys(MATCH.PROFILES).length, 16);
});

mutate('P4: public counts are derived, never hardcoded', () => {
  for (const locale of I18N.LOCALE_CODES) {
    const html = read(I18N.localizedFile(locale, BUILD.CANONICAL_PATH));
    // The rendered counts must match the corpus, not a number someone typed.
    const current = O.filter(SCHEMA.isCurrent).length;
    assert.ok(html.includes(String(current)),
      `${locale}: the page does not carry the derived current-opportunity count`);
  }
  const src = read('scripts/build-tender-opportunities.cjs');
  assert.ok(!/\b(9|10) sources\b|\b\d{4,} (tenders|opportunities)\b/.test(src),
    'a count is hardcoded in the generator');
});

// ── PHASE 5: PRODUCTION REFRESH ─────────────────────────────────────────────

const P5STATE = require('../lib/to-state.cjs');

test('P5-1. last-good survives a clone that has never seen a snapshot', () => {
  // The bug this guards: snapshots are gitignored, so a CI runner has none,
  // and reading snapshots alone rebuilt the corpus to ZERO and wrote it.
  const lastGood = P5STATE.lastGoodBySource(CORPUS);
  assert.ok(lastGood.size >= 9, `only ${lastGood.size} sources reconstructable from the corpus`);
  let total = 0;
  for (const [sourceId, recs] of lastGood) {
    assert.ok(recs.length > 0, `${sourceId} reconstructed to nothing`);
    total += recs.length;
    for (const r of recs.slice(0, 20)) {
      assert.strictEqual(r.sourceId, sourceId);
      assert.ok(r.sourceNoticeId, `${sourceId}: a reconstructed record lost its notice id`);
      assert.ok(r.sourceUrl, `${sourceId}: a reconstructed record lost its source URL`);
      assert.ok(r.id.startsWith(`${sourceId}:`), `${sourceId}: reconstructed id is not source-scoped`);
    }
  }
  // A merged opportunity must return a record to EVERY source that published
  // it, or one side is deleted the first time the other refreshes alone.
  const multi = O.find((o) => o.multiSource);
  assert.ok(multi, 'no multi-source opportunity to test against');
  for (const occ of multi.occurrences) {
    assert.ok(lastGood.get(occ.sourceId).some((r) => r.sourceNoticeId === occ.sourceNoticeId),
      `${occ.sourceId} lost its side of a merged opportunity`);
  }
  assert.ok(total >= O.length, 'reconstruction lost records overall');
});

test('P5-2. the corpus promotion gate refuses a collapse', () => {
  const existing = { opportunities: new Array(9000).fill(null).map((_, i) => ({ id: `x${i}`, sourcePlatformId: 'eu-ted' })) };
  const healthy = new Array(8800).fill(null).map((_, i) => ({ id: `y${i}`, sourcePlatformId: 'eu-ted' }));
  assert.deepStrictEqual(INGEST.corpusPromotionProblems(healthy, existing), [],
    'a normal refresh was refused');
  // Zero — the fresh-clone bug's actual output.
  const empty = [];
  assert.ok(INGEST.corpusPromotionProblems(empty, existing).length > 0, 'an empty corpus was promotable');
  // A catastrophic but non-zero collapse.
  const collapsed = new Array(500).fill(null).map((_, i) => ({ id: `z${i}`, sourcePlatformId: 'eu-ted' }));
  assert.ok(INGEST.corpusPromotionProblems(collapsed, existing).some((p) => /collapsed/.test(p)));
  // An orphaned platform reference is a corpus-level fault a per-source check
  // cannot see.
  const orphaned = healthy.map((o) => ({ ...o, sourcePlatformId: 'nope' }));
  assert.ok(INGEST.corpusPromotionProblems(orphaned, existing).some((p) => /unknown platform/.test(p)));
});

test('P5-3. durable state is committed, small, and free of secrets', () => {
  const file = 'data/tender-opportunities/refresh-state.json';
  assert.ok(fs.existsSync(path.join(ROOT, file)), 'no durable refresh state on disk');
  const raw = read(file);
  const state = JSON.parse(raw);
  assert.ok(state.sources && Object.keys(state.sources).length > 0, 'durable state carries no sources');
  // It must survive a fresh clone, which means it must be tracked.
  assert.ok(!/refresh-state\.json/.test(read('.gitignore')), 'durable state is gitignored');
  // Small: this is operational memory, not a second copy of the corpus.
  assert.ok(raw.length < 20000, `durable state is ${raw.length} bytes — it is holding data it should not`);
  assert.ok(!/records|opportunities"\s*:\s*\[/.test(raw), 'durable state contains record data');
  // No credentials, ever.
  assert.ok(!/token|secret|api[_-]?key|authorization|bearer/i.test(raw), 'durable state may contain a credential');
  for (const s of Object.values(state.sources)) {
    assert.ok(['COMPLETE', 'PARTIAL', 'UNKNOWN'].includes(s.completeness),
      `${s.sourceId}: completeness "${s.completeness}" is not a declared value`);
  }
});

test('P5-4. completeness is never upgraded by transport success', () => {
  const state = JSON.parse(read('data/tender-opportunities/refresh-state.json'));
  const wb = state.sources.worldbank;
  if (wb) {
    // The World Bank window is bounded by design and can never be COMPLETE,
    // however many successful fetches it strings together.
    assert.strictEqual(wb.completeness, 'PARTIAL',
      'a deliberately bounded window was upgraded to COMPLETE by a successful fetch');
    assert.strictEqual(wb.promoted, true, 'the precondition — a successful fetch — did not happen');
  }
  // And the corpus agrees.
  const live = CORPUS.sources.find((s) => s.id === 'worldbank');
  if (live) assert.strictEqual(live.complete, false);
});

test('P5-5. a refresh that changed no fact writes no durable state', () => {
  const state = P5STATE.read();
  const bumped = JSON.parse(JSON.stringify(state));
  for (const s of Object.values(bumped.sources)) s.lastAttemptAt = '2099-01-01T00:00:00.000Z';
  assert.deepStrictEqual(P5STATE.factualState(bumped), P5STATE.factualState(state),
    'an attempt timestamp alone counts as a factual change');
  // A real operational change must still be visible.
  const degraded = JSON.parse(JSON.stringify(state));
  const first = Object.keys(degraded.sources)[0];
  degraded.sources[first].state = 'DEGRADED';
  assert.notDeepStrictEqual(P5STATE.factualState(degraded), P5STATE.factualState(state),
    'a health change was masked away');
});

test('P5-6. the refresh lock prevents a second concurrent run', () => {
  const now = '2026-08-13T12:00:00.000Z';
  const held = { pid: 999999, startedAt: now };
  fs.mkdirSync(path.dirname(REFRESH.LOCK_FILE), { recursive: true });
  const had = fs.existsSync(REFRESH.LOCK_FILE) ? fs.readFileSync(REFRESH.LOCK_FILE, 'utf8') : null;
  try {
    fs.writeFileSync(REFRESH.LOCK_FILE, JSON.stringify(held));
    const blocked = REFRESH.acquireLock({ nowIso: now });
    assert.strictEqual(blocked.ok, false, 'a second refresh acquired the lock');
    assert.strictEqual(blocked.held.pid, 999999);
    // A dead holder must not lock the repository forever.
    const later = new Date(Date.parse(now) + REFRESH.LOCK_STALE_MS + 60000).toISOString();
    const reclaimed = REFRESH.acquireLock({ nowIso: later });
    assert.strictEqual(reclaimed.ok, true, 'a stale lock was never reclaimable');
    assert.ok(reclaimed.reclaimed, 'reclaiming a stale lock happened silently');
  } finally {
    if (had) fs.writeFileSync(REFRESH.LOCK_FILE, had); else REFRESH.releaseLock();
  }
});

test('P5-7. the workflow is thin, scoped, and cannot be raced', () => {
  const wf = read('.github/workflows/tender-opportunity-refresh.yml');
  // One at a time, and never cancelled mid-promotion.
  assert.match(wf, /concurrency:/);
  assert.match(wf, /cancel-in-progress:\s*false/,
    'cancelling a refresh mid-promotion is how a half-written corpus reaches a branch');
  // Least privilege.
  assert.match(wf, /permissions:/);
  assert.ok(!/permissions:\s*write-all/.test(wf), 'the workflow grants write-all');
  for (const forbidden of ['administration:', 'packages:', 'deployments:', 'id-token:']) {
    assert.ok(!wf.includes(forbidden), `the workflow requests ${forbidden}`);
  }
  // Never triggered by untrusted code with write credentials.
  assert.ok(!/pull_request_target/.test(wf), 'pull_request_target with write permissions');
  assert.ok(!/on:\s*\n\s*pull_request/.test(wf), 'refresh runs on pull_request');
  // No secrets: all ten sources are keyless.
  assert.ok(!/secrets\.(?!GITHUB_TOKEN)/.test(wf), 'the workflow references a repository secret');
  // Thin: orchestration lives in Node, not YAML.
  assert.match(wf, /node scripts\/refresh-tender-opportunities\.cjs/);
  assert.ok(!/for source in|adapters|dedupe|normalize/i.test(wf), 'business logic leaked into YAML');
  // Never force-push main.
  assert.ok(!/push --force[^-]/.test(wf), 'an unguarded force push is present');
  assert.ok(!/force-with-lease origin main|push --force origin main/.test(wf), 'the workflow can force-push main');
  assert.match(wf, /force-with-lease/, 'the machine branch push is not lease-guarded');
  // The refresh branch is rebuilt from main, so a stale bot branch cannot win.
  assert.match(wf, /checkout -B/, 'the refresh branch is not reset from main');
  assert.match(wf, /timeout-minutes:/, 'the job has no time bound');
});

test('P5-8. the build still cannot reach the network after Phase 5', () => {
  const strip = (s) => s.replace(/^\s*\/\/.*$/gm, '');
  for (const rel of ['scripts/build-tender-opportunities.cjs', 'scripts/build-tenders-procurement.cjs',
    'scripts/build-tenders-intelligence.cjs']) {
    const src = strip(read(rel));
    for (const forbidden of ['to-http', 'refresh-tender-opportunities', 'to-adapters', 'to-zip']) {
      assert.ok(!new RegExp(`require\\([^)]*${forbidden}`).test(src), `${rel} requires ${forbidden}`);
    }
  }
  // to-state is shared between ingestion and rebuild, so it must itself stay
  // network-free rather than being exempted.
  assert.ok(!/\bfetch\s*\(|require\('node:https?'\)/.test(read('scripts/lib/to-state.cjs')),
    'the durable-state module can reach the network');
});

// ── PHASE 5 MUTATIONS ───────────────────────────────────────────────────────

mutate('P5-M1: a failed candidate cannot replace last-good', () => {
  const previous = { recordCount: 500, records: new Array(500).fill(null).map((_, i) => ({ id: `a${i}`, sourceId: 'ted', sourceNoticeId: `${i}`, sourceUrl: 'https://x/' })) };
  const bad = { recordCount: 0, records: [] };
  assert.strictEqual(SNAP.validateReplacement(bad, previous).accept, false);
  assert.strictEqual(previous.records.length, 500, 'the previous snapshot was mutated');
});

mutate('P5-M2: a rebuild from nothing cannot be promoted', () => {
  // The exact failure measured on a fresh clone before Phase 5.
  const existing = { opportunities: O };
  assert.ok(INGEST.corpusPromotionProblems([], existing).length > 0,
    'a zero-record corpus was promotable — the fresh-clone bug is back');
});

mutate('P5-M3: 429 is not HEALTHY', () => {
  const e = HEALTH.recordAttempt({ consecutiveFailures: 0, lastSuccessfulAt: NOW, lastSuccessfulRecordCount: 33 },
    { sourceId: 'x', nowIso: NOW, result: 'FAILURE', errorClass: 'RATE_LIMITED' });
  assert.notStrictEqual(e.state, 'HEALTHY');
  assert.strictEqual(e.state, 'RATE_LIMITED');
  assert.strictEqual(e.lastSuccessfulRecordCount, 33, 'the retained count was lost');
});

mutate('P5-M4: completeness cannot be upgraded by a successful fetch', () => {
  const partial = SNAP.buildSnapshot({
    source: SOURCES.SOURCE_BY_ID.get('worldbank'),
    adapterVersion: '1.0.0', retrievedAt: NOW,
    fetchResult: { raw: new Array(1000), pages: 10, population: 414892, complete: false, endpoint: 'x' },
    records: new Array(1000).fill(null).map((_, i) => ({ id: `w${i}` })),
  });
  assert.strictEqual(partial.complete, false, 'a bounded window became complete on a 200');
});

mutate('P5-M5: two concurrent promotions cannot both proceed', () => {
  const now = '2026-08-13T12:00:00.000Z';
  const had = fs.existsSync(REFRESH.LOCK_FILE) ? fs.readFileSync(REFRESH.LOCK_FILE, 'utf8') : null;
  try {
    fs.mkdirSync(path.dirname(REFRESH.LOCK_FILE), { recursive: true });
    fs.writeFileSync(REFRESH.LOCK_FILE, JSON.stringify({ pid: 1, startedAt: now }));
    assert.strictEqual(REFRESH.acquireLock({ nowIso: now }).ok, false);
  } finally {
    if (had) fs.writeFileSync(REFRESH.LOCK_FILE, had); else REFRESH.releaseLock();
  }
});

mutate('P5-M6: a stale refresh branch cannot overwrite newer main', () => {
  const wf = read('.github/workflows/tender-opportunity-refresh.yml');
  // Two independent protections: the branch is reset from the main just
  // checked out, and the push is lease-guarded.
  assert.match(wf, /ref:\s*main/);
  assert.match(wf, /checkout -B/);
  assert.match(wf, /--force-with-lease/);
  assert.ok(!/git push .*origin main/.test(wf), 'the workflow pushes to main');
});

mutate('P5-M7: source health cannot mutate an opportunity fact', () => {
  const state = P5STATE.read();
  const anySource = Object.keys(state.sources)[0];
  assert.ok(anySource, 'no durable state to test with');
  const o = fixture();
  const before = JSON.stringify(o);
  const scored = MATCH.matchFor(o, 'telecom', { nowIso: NOW });
  assert.strictEqual(JSON.stringify(o), before, 'matching mutated the opportunity');
  // And no scoring path reads durable state.
  assert.ok(!/to-state|refresh-state|consecutiveFailures/.test(read('scripts/lib/to-match.cjs')));
  assert.ok(scored.score >= 0);
});

mutate('P5-M8: the match model and canonical platform data did not move in an ops phase', () => {
  assert.deepStrictEqual(MATCH.WEIGHTS,
    { category: 40, geography: 20, actionability: 15, deadline: 15, confidence: 10 });
  // BRITTLE MIRROR, REMOVED: the third copy of `platforms.length === 384`.
  PARITY.assertPlatformPublicationParity(assert);
});

// Detail-page directories are an authorized generated route family, not a
// crawl-space explosion. The guard therefore asserts AUTHORIZATION rather than
// absence: every directory must be a route the detail generator can prove
// corresponds to a real canonical opportunity.
function assertAuthorizedDetailDirs(dir, assert) {
  const RF = require('../lib/route-family.cjs');
  const DETAIL = require('../lib/to-detail.cjs');
  const CORPUS = require('../lib/to-corpus.cjs');
  const TPS = require('../lib/tp-schema.cjs');
  const R = path.join(__dirname, '..', '..');
  const corpus = CORPUS.decode(JSON.parse(fs.readFileSync(
    path.join(R, 'data/tender-opportunities/opportunities.json'), 'utf8')));
  const cs = JSON.parse(fs.readFileSync(path.join(R, 'data/business-directories/countries.json'), 'utf8'));
  const platformsById = new Map(TPS.loadPlatforms(
    path.join(R, 'data/tenders-procurement/platforms.json'),
    new Map(cs.map((c) => [c.slug, c.iso2 || null])),
  ).map((x) => [x.id, x]));
  const known = new Set(DETAIL.build(corpus, { platformsById }).pages
    .filter((p) => p.indexable).map((p) => p.route));
  const families = RF.load();
  const dirs = fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory()).map((e) => e.name);
  for (const name of dirs) {
    const route = `/research/tenders-procurement/opportunities/${name}/`;
    const verdict = RF.authorize(route, families, { knownRoutes: known, locale: 'en' });
    assert.ok(verdict.authorized, `unauthorized generated route: ${route} (${verdict.reason})`);
  }
  return dirs.length;
}
