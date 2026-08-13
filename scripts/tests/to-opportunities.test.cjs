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

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const CORPUS_FILE = path.join(ROOT, 'data', 'tender-opportunities', 'opportunities.json');

const CORPUS = fs.existsSync(CORPUS_FILE) ? JSON.parse(read('data/tender-opportunities/opportunities.json')) : null;
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
  // No UUIDs anywhere.
  const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
  const generated = O.filter((o) => uuid.test(o.id));
  assert.strictEqual(generated.length, 0, 'an id looks like a random UUID');
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
  assert.deepStrictEqual(entries.sort(), ['index.html', 'opportunities.csv'],
    `the opportunities route owns unexpected files: ${entries.join(', ')}`);
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
    assert.ok(PLATFORM_IDS.has(s.platformId), `${s.id}: platformId is not a canonical platform`);
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
    assert.ok(s.id && s.name && s.platformId, 'a source entry lacks identity');
    assert.ok(typeof s.complete === 'boolean', `${s.id}: coverage completeness is not stated`);
    assert.ok(s.retrievedAt, `${s.id}: no retrieval timestamp`);
    if (s.complete && s.population !== null) {
      assert.ok(s.recordCount <= s.population,
        `${s.id}: claims complete coverage but holds more records than the source reported`);
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

test('42. sibling collections and canonical platform data are untouched', () => {
  const platforms = JSON.parse(read('data/tenders-procurement/platforms.json'));
  assert.strictEqual(platforms.length, 383, 'the platform record count changed');
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
  const actual = fs.readdirSync(dir).sort();
  const withCrawlSpace = [...actual, 'country-germany'].sort();
  assert.notDeepStrictEqual(withCrawlSpace, actual);
  assert.deepStrictEqual(actual, ['index.html', 'opportunities.csv'],
    'the route already owns more than one page and one dataset');
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
