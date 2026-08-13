'use strict';

// Poland — Biuletyn Zamówień Publicznych adapter.
//
// The fixture is real board output: a below-threshold contract notice and its
// amendment under one bzpNumber, a decided procedure carrying a contractor, a
// lapsed notice, an `outdated` notice, a TED notice mirrored onto the board,
// and a plan notice. Each is a case the whole-window survey actually found.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const A = require('../lib/to-adapters/pl-bzp.cjs');
const SOURCES = require('../lib/to-sources.cjs');
const SCHEMA = require('../lib/to-schema.cjs');
const DEDUPE = require('../lib/to-dedupe.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/tests/fixtures/pl-bzp-sample.json'), 'utf8'));
const NOW = '2026-08-13T12:00:00.000Z';
const source = SOURCES.SOURCE_BY_ID.get('pl-bzp');

const records = FIXTURE.map((r) => A.normalize(r, { source, nowIso: NOW })).filter(Boolean);
const byId = new Map(records.map((r) => [r.sourceNoticeId, r]));

// ── REGISTRY AND QUALIFICATION ──────────────────────────────────────────────

test('the source is registered against a platform it did not invent', () => {
  assert.ok(source, 'pl-bzp is not registered');
  assert.strictEqual(source.platformId, 'pl-ezamowienia');
  const platforms = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/tenders-procurement/platforms.json'), 'utf8'));
  assert.ok(platforms.some((p) => p.id === source.platformId),
    'the adapter names a platform that is not in the canonical collection');
});

test('no credential and no bypass', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/lib/to-adapters/pl-bzp.cjs'), 'utf8');
  assert.strictEqual(source.authRequired, false);
  assert.ok(source.endpoint.startsWith('https://'));
  for (const bad of [/api[_-]?key/i, /rejectUnauthorized/, /NODE_TLS_REJECT/, /Authorization:/]) {
    assert.ok(!bad.test(src), `the adapter references ${bad}`);
  }
});

test('the window is a CURRENT view, and the query says so', () => {
  // The gate Spain failed. The window must be defined by a DEADLINE, not by a
  // publication date, or an old still-open tender is unreachable.
  const url = A.searchUrl(source, { page: 1, offersFrom: '2026-08-13' });
  assert.match(url, /SubmittingOffersDateFrom=2026-08-13/);
  assert.match(url, /NoticeType=ContractNotice/);
  // Ascending publication order, so notices published mid-walk append past the
  // read point instead of shifting every page.
  assert.match(url, /SortingDirection=ASC/);
  assert.match(source.window.note, /still accepting offers/);
});

test('MUTATION: descending pagination would silently skip records', () => {
  // Under DESC the newest notice is page 1, so anything published during a
  // 600-request walk shifts every later page by one. The direction is a
  // correctness property, not a preference.
  const url = A.searchUrl(source, { page: 5, offersFrom: '2026-08-13' });
  assert.ok(!/SortingDirection=DESC/.test(url), 'the walk would shift under new publications');
});

// ── SCOPE: TED MIRRORS ARE NOT INGESTED ─────────────────────────────────────

test('TED notices mirrored onto the board are never imported', () => {
  // 4,763 of the 10,927 notices in the current window are TED's own, mirrored
  // here. Importing them would duplicate TED with worse metadata.
  assert.ok(!byId.has('2024/S 158-490687'), 'a TED notice was imported through Poland');
  // Excluded at the query AND refused at normalization, independently.
  const ted = FIXTURE.find((r) => r.noticeTypeTed === 'eforms-16');
  assert.strictEqual(A.normalize(ted, { source, nowIso: NOW }), null);
  // The guard keys on the OJS notice-number shape, not on a magic string.
  assert.ok(A.TED_NOTICE_NUMBER.test('2024/S 158-490687'));
  assert.ok(!A.TED_NOTICE_NUMBER.test('2026/BZP 00220015/01'));
});

test('a plan notice is not a tender', () => {
  assert.ok(!byId.has('2026/BZP 00311111'), 'a procurement PLAN was published as an opportunity');
});

// ── IDENTITY AND AMENDMENTS ─────────────────────────────────────────────────

test('identity is the notice, not its version', () => {
  // "2026/BZP 00220015/01" and "/02" are one procurement. Two records would be
  // two live tenders for one contract.
  const versions = FIXTURE.filter((r) => r.bzpNumber === '2026/BZP 00220015');
  assert.strictEqual(versions.length, 2, 'the fixture no longer exercises amendments');
  const ids = new Set(versions.map((r) => A.normalize(r, { source, nowIso: NOW }).id));
  assert.strictEqual(ids.size, 1, 'an amendment became a second opportunity');
  assert.strictEqual(byId.get('2026/BZP 00220015').id, SCHEMA.opportunityId('pl-bzp', '2026/BZP 00220015'));
});

test('the amendment chain resolves to the latest published version', () => {
  // Same shape as SAM.gov: a new version with a moved deadline. The corpus
  // must carry the CURRENT deadline, not whichever version sorts first.
  const versions = FIXTURE.filter((r) => r.bzpNumber === '2026/BZP 00220015')
    .map((r) => A.normalize(r, { source, nowIso: NOW }));
  const out = DEDUPE.dedupe(versions);
  assert.strictEqual(out.stats.canonical, 1);
  assert.strictEqual(out.canonical[0].deadline.raw, '2026-12-20T09:00:00Z',
    'the superseded deadline was published as current');
});

// ── STATUS ──────────────────────────────────────────────────────────────────

test('evidence of a decision outranks a future deadline', () => {
  // A notice naming a contractor has been decided, whatever its deadline says.
  const decided = byId.get('2026/BZP 00300777');
  assert.ok(decided, 'the decided notice was dropped rather than marked');
  assert.strictEqual(decided.status, 'AWARDED');
  assert.strictEqual(decided.noticeType, 'CONTRACT_AWARD');
  assert.strictEqual(decided.statusBasis, 'SOURCE_REPORTED');
  assert.ok(!SCHEMA.isCurrent(decided), 'a decided procedure is advertised as current');
});

test('an outdated notice is not open, and a lapsed deadline closes', () => {
  assert.strictEqual(byId.get('2026/BZP 00300999').status, 'CLOSED');
  assert.strictEqual(byId.get('2026/BZP 00300888').status, 'CLOSED');
  assert.strictEqual(byId.get('2026/BZP 00300888').statusBasis, 'DERIVED_FROM_DEADLINE');
});

test('a live below-threshold notice is OPEN and says how it knows', () => {
  const open = byId.get('2026/BZP 00220015');
  assert.strictEqual(open.status, 'OPEN');
  assert.strictEqual(open.statusBasis, 'DERIVED_FROM_DEADLINE');
  assert.strictEqual(open.deadline.precision, 'INSTANT', 'the deadline lost its instant');
  assert.ok(open.deadline.iso);
});

// ── THE FIELD THIS SOURCE EXISTS FOR ────────────────────────────────────────

test('below-EU-threshold is recorded as the absence of EU-wide publication', () => {
  const below = byId.get('2026/BZP 00220015');
  assert.strictEqual(below.publishedEuWide, false,
    'the source said this is below the EU threshold and the corpus lost it');
  // Tri-state: a missing flag is unknown, never false.
  const noFlag = A.normalize({ ...FIXTURE[0], isTenderAmountBelowEU: undefined }, { source, nowIso: NOW });
  assert.strictEqual(noFlag.publishedEuWide, null, 'an unstated threshold became a claim');
});

// ── CLASSIFICATION ──────────────────────────────────────────────────────────

test('CPV survives a label field full of commas and brackets', () => {
  // The codes arrive glued to Polish labels which themselves contain commas
  // and nested parentheses, so splitting on commas loses them.
  const codes = byId.get('2026/BZP 00300777').classifications;
  assert.deepStrictEqual(codes.map((c) => c.code).sort(), ['90910000', '90911200']);
  assert.ok(codes.every((c) => c.scheme === 'CPV'));
  // The check digit is not part of the code.
  assert.deepStrictEqual(A.cpvCodes('35000000-4 (x),18143000-3 (y)'),
    [['CPV', '35000000'], ['CPV', '18143000']]);
  // A label containing digits must not manufacture a code.
  assert.deepStrictEqual(A.cpvCodes('(Usługi sprzątania 2026 rok)'), []);
  assert.ok(records.every((r) => r.classifications.length > 0), 'a record lost its CPV');
});

test('MUTATION: no crosswalk to another taxonomy exists', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/lib/to-adapters/pl-bzp.cjs'), 'utf8')
    .replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const scheme of ['UNSPSC', 'NAICS', 'PSC', 'GSIN']) {
    assert.ok(!src.includes(scheme), `the adapter mentions ${scheme}`);
  }
  assert.ok(records.every((r) => r.classifications.every((c) => c.scheme === 'CPV')));
});

// ── GEOGRAPHY ───────────────────────────────────────────────────────────────

test('a voivodeship is recorded as NUTS, not as an ISO subdivision', () => {
  // "PL16" is a NUTS code. Poland's ISO 3166-2 codes look like "PL-OP", and
  // filing one under the other scheme is a quiet category error.
  const j = byId.get('2026/BZP 00220015').subnationalJurisdiction;
  assert.deepStrictEqual(j, { scheme: 'NUTS', code: 'PL16' });
  const bogus = A.normalize({ ...FIXTURE[0], organizationProvince: 'Opolskie' }, { source, nowIso: NOW });
  assert.strictEqual(bogus.subnationalJurisdiction, null, 'a free-text region became a code');
  assert.ok(records.every((r) => r.country === 'poland'));
});

// ── URLS ────────────────────────────────────────────────────────────────────

test('the notice URL comes from the application\'s own route table', () => {
  const url = byId.get('2026/BZP 00220015').sourceUrl;
  assert.ok(url.startsWith('https://ezamowienia.gov.pl/mo-client-board/bzp/notice-details/'),
    `unexpected notice route: ${url}`);
  // The route is keyed by NOTICE NUMBER, not by the row's objectId — read out
  // of the app's lazy bundle, because the SPA returns an identical shell for
  // a real id and a fabricated one.
  // Keyed by the VERSIONED notice number, which is what the route accepts —
  // the record's identity is the unversioned bzpNumber, and the two differ.
  assert.ok(url.includes(encodeURIComponent('2026/BZP 00220015/')),
    `the URL is not keyed by the notice number the router declares: ${url}`);
  assert.strictEqual(A.noticeUrl('2026/BZP 00220015/01'),
    'https://ezamowienia.gov.pl/mo-client-board/bzp/notice-details/2026%2FBZP%2000220015%2F01');
  assert.ok(!url.includes('08dea51d'), 'the URL was keyed by objectId, which the router does not accept');
  assert.ok(records.every((r) => /^https:\/\//.test(r.sourceUrl)));
});

// ── PRIVACY ─────────────────────────────────────────────────────────────────

test('no personal or account identifier reaches a record', () => {
  const blob = JSON.stringify(records);
  // userId is a per-person account GUID on the publishing side.
  for (const needle of ['720463a9-8c23-496d-8105-1af4629b7c75', 'userId', 'organizationNationalId']) {
    assert.ok(!blob.includes(needle), `${needle} survived into a record`);
  }
  // Award-side company data is not carried either.
  assert.ok(!blob.includes('Higma Service'), 'contractor data was stored');
});

// ── CANONICAL SHAPE ─────────────────────────────────────────────────────────

test('every record satisfies the canonical schema', () => {
  const platforms = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/tenders-procurement/platforms.json'), 'utf8'));
  const known = new Set(platforms.map((p) => p.id));
  assert.ok(records.length >= 4, 'the fixture produced too few records to be meaningful');
  for (const r of records) {
    const problems = SCHEMA.problemsFor(
      { ...r, occurrences: [{ sourceId: r.sourceId, sourceNoticeId: r.sourceNoticeId, sourceUrl: r.sourceUrl }] },
      known,
    );
    assert.deepStrictEqual(problems, [], `${r.sourceNoticeId}: ${problems.join('; ')}`);
  }
});

test('nothing is invented: no value, no submission route, no eligibility', () => {
  for (const r of records) {
    assert.strictEqual(r.value, null);
    assert.strictEqual(r.submissionUrl, null);
    assert.strictEqual(r.electronicSubmission, null, 'a platform capability leaked onto a notice');
    assert.strictEqual(r.descriptionSummary, null, 'the notice body was stored');
  }
});

// ── OPERATIONAL ─────────────────────────────────────────────────────────────

test('the page cap marks a window PARTIAL rather than shrinking it', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/lib/to-adapters/pl-bzp.cjs'), 'utf8');
  assert.ok(/PAGE CAP reached/.test(src), 'hitting the cap is silent');
  assert.ok(source.maxPages >= 700, 'the cap is below the observed window size');
  assert.strictEqual(source.pageSize, A.SERVER_PAGE_SIZE);
});

test('the build never reaches the network through this adapter', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/lib/to-adapters/pl-bzp.cjs'), 'utf8');
  assert.ok(src.includes("require('../to-http.cjs')"));
  for (const build of ['build-tender-opportunities.cjs', 'build-tender-detail.cjs', 'build-tender-monitoring.cjs']) {
    const b = fs.readFileSync(path.join(ROOT, 'scripts', build), 'utf8');
    assert.ok(!b.includes('to-adapters'), `${build} loads an adapter`);
  }
});
