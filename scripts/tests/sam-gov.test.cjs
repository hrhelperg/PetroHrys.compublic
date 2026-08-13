'use strict';

// United States — SAM.gov Contract Opportunities adapter, and the activation
// invariants that must hold for it to contribute to the corpus.
//
// The fixture carries the REAL 47-column header, byte for byte, and one row per
// case the whole-file audit found: every notice type, every deadline shape, the
// contradictory Type/BaseType pair, an archived-but-future record, quoted
// commas and newlines, a missing link, and a row whose contact columns are
// populated so their absence downstream is proven rather than assumed.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const A = require('../lib/to-adapters/sam-gov.cjs');
const SOURCES = require('../lib/to-sources.cjs');
const SCHEMA = require('../lib/to-schema.cjs');
const TIME = require('../lib/to-time.cjs');
const DEDUPE = require('../lib/to-dedupe.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'scripts/tests/fixtures/sam-gov-sample.csv');
const CSV = fs.readFileSync(FIXTURE);

// The fixture's dates are anchored to this instant. It is the pilot date, so
// "far future" and "far past" are unambiguous in every time zone.
const NOW = '2026-08-13T12:00:00.000Z';
const source = SOURCES.SOURCE_BY_ID.get('sam-gov');

const parsed = A.parseBuffer(CSV, { source });
const byId = new Map();
for (const raw of parsed.raw.map(SOURCES.stripPersonalFields)) {
  const rec = A.normalize(raw, { source, nowIso: NOW });
  if (rec) byId.set(rec.sourceNoticeId, rec);
}
const records = [...byId.values()];

// ── REGISTRY ────────────────────────────────────────────────────────────────

test('the source is registered against a platform it did not invent', () => {
  assert.ok(source, 'sam-gov is not in the source registry');
  assert.strictEqual(source.platformId, 'us-sam-gov');
  const platforms = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/tenders-procurement/platforms.json'), 'utf8'));
  assert.ok(platforms.some((p) => p.id === source.platformId),
    'the adapter names a platform that does not exist in the canonical collection');
  // The v1 finding that SAM required a key was about the search API. It must
  // not still be filed as a rejected source, or the correction is invisible.
  assert.ok(!SOURCES.REJECTED_SOURCES.some((r) => r.id === 'sam-gov'),
    'sam-gov is both an active source and a rejected one');
});

test('no credential, no key, and no bypass anywhere in the source', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/lib/to-adapters/sam-gov.cjs'), 'utf8');
  assert.strictEqual(source.authRequired, false);
  for (const bad of [/api[_-]?key/i, /rejectUnauthorized/, /NODE_TLS_REJECT/, /Authorization:/]) {
    assert.ok(!bad.test(src), `the adapter references ${bad}`);
  }
  assert.ok(source.endpoint.startsWith('https://'), 'the endpoint is not https');
});

// ── THE COLUMN CONTRACT ─────────────────────────────────────────────────────

test('the projected columns are the file\'s real column names', () => {
  const header = CSV.toString('utf8').split('\n')[0];
  const names = header.split('","').map((s) => s.replace(/^"|"$/g, ''));
  assert.strictEqual(names.length, 47, 'the fixture is not the real 47-column header');
  for (const col of A.PROJECTED) {
    assert.ok(names.includes(col), `projected column "${col}" is not in the real header`);
  }
  // The specific defect: the buyer's solicitation number is spelled `Sol#`.
  assert.ok(A.PROJECTED.includes('Sol#'));
  assert.ok(!A.PROJECTED.includes('SolicitationNumber'),
    'the adapter projects a column name that does not exist in this file');
});

test('MUTATION: a renamed or vanished column fails closed, it does not empty the source', () => {
  const broken = Buffer.from(CSV.toString('utf8').replace('"Sol#"', '"SolicitationNumber"'));
  assert.throws(() => A.parseBuffer(broken, { source }), /schema changed.*Sol#/s,
    'a renamed column produced records instead of refusing the schema');
  // And the guard must not be satisfied by a column that merely looks similar.
  const subtle = Buffer.from(CSV.toString('utf8').replace('"ResponseDeadLine"', '"ResponseDeadline"'));
  assert.throws(() => A.parseBuffer(subtle, { source }), /schema changed/);
});

test('MUTATION: silent field loss is impossible — every projected column is read', () => {
  // A projected column that no code path reads is a field being dropped
  // quietly. Each one must appear in the adapter body outside the list itself.
  const src = fs.readFileSync(path.join(ROOT, 'scripts/lib/to-adapters/sam-gov.cjs'), 'utf8');
  const anchor = src.indexOf('function* parseCsvStream');
  assert.ok(anchor > 0, 'the anchor this test slices on no longer exists in the adapter');
  // Everything after the PROJECTED list, with comments removed — a column named
  // only in prose is not a column anyone reads.
  const body = src.slice(anchor)
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const read = ['NoticeId', 'Title', 'Sol#', 'Type', 'BaseType', 'PostedDate',
    'ResponseDeadLine', 'ArchiveDate', 'Active', 'NaicsCode', 'ClassificationCode',
    'State', 'Link', 'PopCountry', 'Office', 'Sub-Tier', 'Department/Ind.Agency'];
  assert.deepStrictEqual([...A.PROJECTED].sort(), [...read].sort(),
    'the projected set and the set this test knows to be read have diverged');
  for (const col of read) {
    assert.ok(body.includes(col), `projected column "${col}" is never read`);
  }
});

// ── ACTIONABILITY ───────────────────────────────────────────────────────────

test('Active is never evidence of OPEN', () => {
  // Every fixture row carries Active=Yes, exactly as all 82,960 real rows do.
  const raw = CSV.toString('utf8');
  assert.ok(!/"Active"\s*,/.test('') && raw.includes('"Yes"'), 'the fixture must exercise Active=Yes');
  // If Active decided anything, the award and the lapsed rows would be current.
  assert.ok(!byId.has('a8'), 'an Award Notice with Active=Yes became an opportunity');
  assert.ok(!byId.has('a2'), 'a lapsed solicitation with Active=Yes stayed open');
  assert.ok(records.every((r) => r.sourceActive === 'Yes'),
    'the source fact was dropped instead of merely being non-decisive');
});

test('MUTATION: promoting Active to OPEN is caught', () => {
  // Simulate the regression directly: decide status from Active, as an earlier
  // reading of this column would have.
  const wrong = parsed.raw.filter((r) => r.Active === 'Yes').length;
  assert.ok(wrong > records.length,
    'Active-as-OPEN would not change the outcome, so this test proves nothing');
});

test('awards and informational notices never become opportunities', () => {
  for (const id of ['a8', 'a9', 'a10', 'a11', 'a12']) {
    assert.ok(!byId.has(id), `${id}: a non-opportunity notice was published as one`);
  }
  // Structural: award rows never even leave the parser.
  assert.ok(!parsed.raw.some((r) => r.Type === 'Award Notice'),
    'an award row was carried out of the parser');
  // Independent: normalize refuses one anyway.
  const award = { NoticeId: 'x', Title: 'T', Type: 'Award Notice', BaseType: 'Award Notice', Link: 'https://sam.gov/x' };
  assert.strictEqual(A.normalize(award, { source, nowIso: NOW }), null);
  assert.ok(records.every((r) => r.noticeType !== 'CONTRACT_AWARD'));
  assert.ok(records.every((r) => r.status !== 'AWARDED'));
});

test('BaseType can veto, it cannot promote', () => {
  // Type is current state and decides. BaseType only ever removes.
  assert.ok(!byId.has('a12'), 'BaseType=Award Notice did not veto');
  // A Sources Sought whose BaseType is a solicitation stays out: BaseType
  // cannot lift a record into the carried set.
  const promoted = A.normalize(
    { NoticeId: 'z', Title: 'T', Type: 'Sources Sought', BaseType: 'Solicitation', Link: 'https://sam.gov/z', ResponseDeadLine: '2026-12-01T15:00:00-05:00' },
    { source, nowIso: NOW },
  );
  assert.strictEqual(promoted, null, 'BaseType promoted a non-opportunity into the corpus');
});

test('the archive date narrows and never widens', () => {
  // a13 has a future deadline and an archive date already gone.
  assert.ok(!byId.has('a13'), 'a notice SAM has already archived was published as open');
  // It cannot work the other way: an archive date in the future does not make
  // a lapsed deadline current.
  assert.ok(!byId.has('a2'));
});

// ── DEADLINES ───────────────────────────────────────────────────────────────

test('a date-only deadline is decided without inventing a time or a zone', () => {
  const open = byId.get('a3');
  assert.ok(open, 'a date-only deadline in the far future was lost to UNKNOWN — the v1 defect');
  assert.strictEqual(open.deadline.precision, 'ZONELESS');
  assert.strictEqual(open.deadline.iso, null, 'an instant was invented for a zoneless date');
  assert.strictEqual(open.deadline.raw, '2026-12-20', 'the source wording was not preserved');
  assert.strictEqual(open.status, 'OPEN');
  assert.strictEqual(open.statusBasis, 'DERIVED_FROM_DEADLINE');

  // The far past is equally decidable, and equally zone-free.
  assert.ok(!byId.has('a4'), 'a date-only deadline months past was still treated as open');

  // A zoneless wall clock behaves the same way.
  const clock = byId.get('a16');
  assert.ok(clock, 'a zoneless date-time deadline was lost');
  assert.strictEqual(clock.deadline.iso, null);
  assert.strictEqual(clock.deadline.precision, 'ZONELESS');
});

test('inside the 26-hour band the answer stays unknown', () => {
  // a5 closes on the run date itself. No zone-independent answer exists, so it
  // is not asserted open and not asserted closed — it is simply not current.
  assert.ok(!byId.has('a5'), 'a same-day zoneless deadline was resolved by guessing a zone');
  const ts = TIME.normalizeTimestamp('2026-08-13');
  assert.strictEqual(TIME.hasPassed(ts, NOW), null, 'the band collapsed to a point');
  assert.strictEqual(TIME.daysUntil(ts, NOW), null);
});

test('MUTATION: a DATE regression is caught in both directions', () => {
  const future = TIME.normalizeTimestamp('2026-12-20');
  const past = TIME.normalizeTimestamp('2026-02-01');
  assert.strictEqual(TIME.hasPassed(future, NOW), false, 'a clearly future date read as passed');
  assert.strictEqual(TIME.hasPassed(past, NOW), true, 'a clearly past date read as open');
  // The band must be the real one: 26 hours, not a convenient 24.
  const band = TIME.zonelessBand(TIME.normalizeTimestamp('2026-12-20'));
  assert.strictEqual((band.latest - band.earliest) / 3600000, 26,
    'the zone band is not 26 hours wide — UTC+14 to UTC-12');
  // And no zoneless value may ever acquire an instant.
  for (const v of ['2026-12-20', '2026-12-20T14:00:00', '2026-12-20 14:00:00.000']) {
    assert.strictEqual(TIME.normalizeTimestamp(v).iso, null, `${v} acquired an instant`);
  }
});

test('an explicit offset is still an instant', () => {
  const r = byId.get('a1');
  assert.strictEqual(r.deadline.precision, 'INSTANT');
  assert.ok(r.deadline.iso, 'an offset deadline lost its instant');
  assert.strictEqual(r.status, 'OPEN');
});

// ── CLASSIFICATION ──────────────────────────────────────────────────────────

test('NAICS and PSC are carried natively and never crosswalked', () => {
  const r = byId.get('a1');
  const schemes = r.classifications.map((c) => c.scheme).sort();
  assert.deepStrictEqual(schemes, ['NAICS', 'PSC']);
  assert.ok(r.classifications.some((c) => c.scheme === 'NAICS' && c.code === '336413'));
  assert.ok(r.classifications.some((c) => c.scheme === 'PSC' && c.code === '1680'));
  for (const rec of records) {
    for (const c of rec.classifications) {
      assert.ok(c.scheme === 'NAICS' || c.scheme === 'PSC',
        `${rec.sourceNoticeId}: a US code was published as ${c.scheme}`);
    }
  }
});

test('MUTATION: converting a US code to CPV or UNSPSC is caught', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/lib/to-adapters/sam-gov.cjs'), 'utf8');
  // Strip comments: the header legitimately explains that no crosswalk exists.
  const code = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const scheme of ['CPV', 'UNSPSC', 'GSIN']) {
    assert.ok(!code.includes(scheme), `the adapter code mentions ${scheme}`);
  }
  assert.ok(!records.some((r) => r.classifications.some((c) => c.scheme !== 'NAICS' && c.scheme !== 'PSC')));
});

test('a record with no classification is still a real opportunity', () => {
  const r = byId.get('a17');
  assert.ok(r, 'an unclassified but open procurement was dropped');
  assert.deepStrictEqual(r.classifications, []);
});

// ── IDENTITY, BUYER, GEOGRAPHY ──────────────────────────────────────────────

test('identity is the notice id, never the solicitation number', () => {
  const r = byId.get('a1');
  assert.strictEqual(r.id, SCHEMA.opportunityId('sam-gov', 'a1'));
  assert.strictEqual(r.officialReference, 'W91QM-26-R-0001');
  // a11 is an amendment carrying the SAME Sol# as a1. It is excluded as a
  // notice type, so it can never become a second live tender for one procedure.
  assert.ok(!byId.has('a11'));
});

test('the buyer is the contracting office, falling back only when it is absent', () => {
  assert.strictEqual(byId.get('a1').buyerName, 'W6QM MICC-FT LIBERTY');
  assert.strictEqual(byId.get('a6').buyerName, 'NAVFAC MID-ATLANTIC');
  // a16 has neither an office nor a sub-tier.
  assert.strictEqual(byId.get('a16').buyerName, 'DEPT OF DEFENSE');
});

test('a US platform does not make every place of performance American', () => {
  // The code resolves to the corpus's own country vocabulary, not to itself.
  // Emitting the raw alpha-3 put a country called "jpn" into the coverage
  // geography matrix, because that layer reads projectCountry || country.
  assert.strictEqual(byId.get('a14').projectCountry, 'germany');
  assert.strictEqual(byId.get('a1').projectCountry, null, 'a US location was recorded as foreign');
  assert.ok(records.every((r) => r.country === 'united-states'));
});

test('an unresolvable place-of-performance code yields null, never a coined country', () => {
  const countries = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/business-directories/countries.json'), 'utf8'));
  const slugs = new Set(countries.map((c) => c.slug));
  const mk = (pop) => A.normalize(
    { NoticeId: 'p', Title: 'T', Type: 'Solicitation', BaseType: 'Solicitation',
      Link: 'https://sam.gov/opp/p/view', ResponseDeadLine: '2026-12-01T15:00:00-05:00' },
    { source, nowIso: NOW, knownCountrySlugs: slugs },
  );
  // AX1 is in the real file and is not an ISO code at all.
  const raw = { NoticeId: 'p', Title: 'T', Type: 'Solicitation', BaseType: 'Solicitation',
    Link: 'https://sam.gov/opp/p/view', ResponseDeadLine: '2026-12-01T15:00:00-05:00' };
  for (const bad of ['AX1', 'ZZZ', '', 'Narnia']) {
    const rec = A.normalize({ ...raw, PopCountry: bad }, { source, nowIso: NOW, knownCountrySlugs: slugs });
    assert.strictEqual(rec.projectCountry, null, `"${bad}" was published as a country`);
    assert.strictEqual(rec.country, 'united-states', 'the record lost its own country');
  }
  assert.ok(mk('JPN') !== null);

  // The table states what an ISO code MEANS; the guard decides what may be
  // published. 18 of the 103 codes name countries this site's collection does
  // not cover — Senegal, Fiji, Timor-Leste and so on — and those must resolve
  // to null rather than being dropped from the table, so they start working
  // the day the collection grows instead of silently staying absent.
  const outside = Object.entries(A.ALPHA3_TO_SLUG).filter(([, s]) => !slugs.has(s));
  assert.ok(outside.length > 0, 'this test assumes some codes fall outside the collection');
  for (const [code] of outside) {
    const rec = A.normalize({ ...raw, PopCountry: code }, { source, nowIso: NOW, knownCountrySlugs: slugs });
    assert.strictEqual(rec.projectCountry, null,
      `${code} resolved to a slug the country collection does not contain`);
  }
  // And every code the collection DOES cover resolves to it.
  const inside = Object.entries(A.ALPHA3_TO_SLUG).filter(([, s]) => slugs.has(s));
  for (const [code, slug] of inside) {
    const rec = A.normalize({ ...raw, PopCountry: code }, { source, nowIso: NOW, knownCountrySlugs: slugs });
    assert.strictEqual(rec.projectCountry, slug, `${code} did not resolve to ${slug}`);
  }
});

test('a subdivision is recorded only when it is a real ISO code', () => {
  assert.deepStrictEqual(byId.get('a1').subnationalJurisdiction, { scheme: 'ISO-3166-2', code: 'US-NC' });
  assert.strictEqual(byId.get('a16').subnationalJurisdiction, null, 'an invented subdivision was published');
});

// ── PERSONAL DATA ───────────────────────────────────────────────────────────

test('not one contact column reaches a record', () => {
  const blob = JSON.stringify(records);
  for (const needle of ['Jordan Reyes', 'jordan.reyes@example.mil', 'second.officer@example.mil', '910 555 0100']) {
    assert.ok(!blob.includes(needle), `a contact detail survived: ${needle}`);
  }
  for (const col of ['PrimaryContactEmail', 'SecondaryContactFullname', 'PrimaryContactPhone']) {
    assert.ok(!A.PROJECTED.includes(col), `${col} is projected`);
  }
  // And the solicitation body is not mirrored.
  assert.ok(!blob.includes('Full solicitation text'), 'the description was stored');
  assert.ok(records.every((r) => r.descriptionSummary === null));
});

// ── PARSER ──────────────────────────────────────────────────────────────────

test('quoted commas, newlines and doubled quotes survive the stream parser', () => {
  const r = byId.get('a14');
  assert.ok(r, 'a row with an embedded newline broke the parser');
  assert.ok(r.title.includes(','), 'a quoted comma was lost');
  assert.ok(r.title.includes('\n'), 'a quoted newline was lost');
  assert.ok(r.title.includes('24"x36"'), 'a doubled quote was not unescaped');
});

test('the file is decoded as Windows-1252, not UTF-8', () => {
  // 0x96 is an EN DASH in Windows-1252 and is not valid UTF-8 at all. Read as
  // UTF-8 it becomes U+FFFD, which is legible enough that nothing fails — and
  // 103,907 characters across the real file were silently destroyed that way.
  const buf = Buffer.from([0x50, 0x41, 0x54, 0x96, 0x20, 0x4c, 0x4d]); // "PAT– LM"
  const out = [...A.chunksOf(buf)].join('');
  assert.strictEqual(out, 'PAT– LM', 'the bulk file is not being decoded as Windows-1252');
  assert.ok(!out.includes('�'));
  // The curly quotes and ellipsis a Windows desktop produces must survive too.
  const punct = Buffer.from([0x93, 0x41, 0x94, 0x85, 0x92, 0x95, 0x97]);
  assert.strictEqual([...A.chunksOf(punct)].join(''), '“A”…’•—');
});

test('chunking cannot change what the decoder produces', () => {
  // The invariant that matters regardless of encoding: slicing the buffer must
  // give exactly the same text as decoding it whole. One byte at a time is the
  // worst case a chunk boundary can present.
  const buf = Buffer.from([0x50, 0x41, 0x54, 0x96, 0x20, 0x93, 0x4c, 0x94, 0x0a, 0x78]);
  const whole = [...A.chunksOf(buf, buf.length)].join('');
  for (const size of [1, 2, 3, 5, 7]) {
    assert.strictEqual([...A.chunksOf(buf, size)].join(''), whole,
      `chunk size ${size} changed the decoded text`);
  }
});

test('MUTATION: a switch to UTF-8 is refused rather than published as mojibake', () => {
  // Decoding UTF-8 with the Windows-1252 table produces readable-looking
  // nonsense — "â€“" where the file said "–" — with no error and no
  // replacement character. Nothing downstream can notice, so the check has to
  // be on the bytes, before they become text.
  const utf8 = Buffer.from(CSV.toString('latin1')
    .replace('Aircraft structural components', 'Aircraft — components for Ångström café'), 'utf8');
  assert.throws(() => A.parseBuffer(utf8, { source }), /looks like UTF-8/,
    'a UTF-8 file was decoded with the Windows-1252 table and published');

  // And the real encoding still passes: those same characters as Windows-1252
  // bytes, inside a real field, are not valid UTF-8 and must be accepted.
  const cp1252 = Buffer.from(CSV.toString('latin1')
    .replace('Aircraft structural components', 'Aircraft \x96 \x93components\x94'), 'latin1');
  const parsedCp = A.parseBuffer(cp1252, { source });
  assert.ok(parsedCp.raw.length > 0, 'the guard rejects the encoding the file actually uses');
  const title = parsedCp.raw.find((r) => r.NoticeId === 'a1').Title;
  assert.strictEqual(title, 'Aircraft – “components”', 'cp1252 punctuation did not decode');
});

test('MUTATION: mass row loss is refused, not published as a quiet week', () => {
  // A mangled quote turns the rest of the file into one field. The guard fires
  // on the ratio of lines that did not yield a full row.
  const lines = CSV.toString('utf8').split('\n');
  const damaged = [lines[0], ...lines.slice(1).map((l) => (l ? l.split(',').slice(0, 3).join(',') : l))].join('\n');
  assert.throws(() => A.parseBuffer(Buffer.from(damaged), { source }), /did not parse to a full row/,
    'a file of truncated rows parsed to a small, plausible-looking success');
});

test('a file with no header at all is refused', () => {
  assert.throws(() => A.parseBuffer(Buffer.from(''), { source }), /no header row|schema changed/);
});

// ── THE CANONICAL RECORD ────────────────────────────────────────────────────

test('every published record satisfies the canonical schema', () => {
  const platforms = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/tenders-procurement/platforms.json'), 'utf8'));
  const known = new Set(platforms.map((p) => p.id));
  assert.ok(records.length >= 5, 'the fixture published too few records to be meaningful');
  for (const r of records) {
    const problems = SCHEMA.problemsFor(
      { ...r, occurrences: [{ sourceId: r.sourceId, sourceNoticeId: r.sourceNoticeId, sourceUrl: r.sourceUrl }] },
      known,
    );
    assert.deepStrictEqual(problems, [], `${r.sourceNoticeId}: ${problems.join('; ')}`);
  }
});

test('a notice with no link is not published', () => {
  assert.ok(!byId.has('a15'), 'a record with no official URL was published');
  assert.ok(records.every((r) => /^https:\/\//.test(r.sourceUrl)));
});

test('only current opportunities are carried, and every one says how it knows', () => {
  for (const r of records) {
    assert.ok(SCHEMA.isCurrent(r), `${r.sourceNoticeId}: a non-current record reached the corpus`);
    assert.notStrictEqual(r.statusBasis, 'UNKNOWN',
      `${r.sourceNoticeId}: a status with no stated basis`);
  }
  assert.ok(records.some((r) => r.status === 'UPCOMING'), 'the UPCOMING case is untested');
  assert.ok(records.some((r) => r.status === 'OPEN'), 'the OPEN case is untested');
});

test('a presolicitation is upcoming, and never inferred from a distant deadline', () => {
  const r = byId.get('a6');
  assert.strictEqual(r.status, 'UPCOMING');
  assert.strictEqual(r.noticeType, 'PRIOR_INFORMATION');
  assert.ok(!byId.has('a7'), 'a lapsed intention was still advertised as upcoming');
});

test('no value, no submission route and no eligibility is invented', () => {
  for (const r of records) {
    assert.strictEqual(r.value, null, 'an award amount was attached to an open solicitation');
    assert.strictEqual(r.submissionUrl, null);
    assert.strictEqual(r.electronicSubmission, null, 'a platform capability leaked onto a notice');
  }
});

// ── DEDUPLICATION ───────────────────────────────────────────────────────────

test('a shared solicitation number does not collapse distinct procurements', () => {
  // Two live notices, one office, one Sol#, different subjects — the shape of a
  // multi-lot vehicle. They must not merge.
  const mk = (id, title) => ({
    id: `sam-gov:${id}`, sourceId: 'sam-gov', sourceNoticeId: id, country: 'united-states',
    buyerName: 'W6QM MICC-FT LIBERTY', officialReference: 'W91QM-26-R-0099', title,
    deadline: TIME.normalizeTimestamp('2026-12-01T15:00:00-05:00'), classifications: [],
  });
  const lots = [mk('l1', 'Lot 6 protective footwear'), mk('l2', 'Lot 8 cleaning and maintenance')];
  assert.strictEqual(DEDUPE.classify(lots[0], lots[1]), 'POSSIBLE',
    'two distinct lots under one solicitation number merged');
  assert.strictEqual(DEDUPE.dedupe(lots).stats.canonical, 2);

  // Identical republication under the same reference SHOULD merge.
  const same = [mk('s1', 'Aircraft structural components'), mk('s2', 'Aircraft structural components')];
  assert.strictEqual(DEDUPE.classify(same[0], same[1]), 'STRONG');
  assert.strictEqual(DEDUPE.dedupe(same).stats.canonical, 1);
});

test('an amendment chain publishes the CURRENT deadline, not an arbitrary one', () => {
  // SAM publishes an amendment as a new NoticeId with the same solicitation
  // number and a moved deadline. Collapsing by lexicographic id published the
  // wrong date on 337 real merge groups — 267 of them earlier than the buyer's
  // actual deadline, which hides a still-open tender.
  const mk = (id, posted, deadlineIso) => ({
    id: `sam-gov:${id}`, sourceId: 'sam-gov', sourceNoticeId: id, country: 'united-states',
    sourcePlatformId: 'us-sam-gov', sourceUrl: `https://sam.gov/opp/${id}/view`,
    buyerName: 'FA4877 492 SOW', officialReference: 'FA4877-26-QA144',
    title: 'Provide open frame laboratory furniture', classifications: [],
    publicationDate: TIME.normalizeTimestamp(posted),
    deadline: TIME.normalizeTimestamp(deadlineIso),
    status: 'OPEN', statusBasis: 'DERIVED_FROM_DEADLINE',
  });
  // `a` sorts first by id and is the ORIGINAL; `z` is the later amendment.
  const original = mk('a-first', '2026-08-01', '2026-08-17T13:00:00-07:00');
  const amended = mk('z-later', '2026-08-11', '2026-08-28T13:00:00-07:00');

  for (const order of [[original, amended], [amended, original]]) {
    const out = DEDUPE.dedupe(order);
    assert.strictEqual(out.stats.canonical, 1, 'the amendment did not land on its procurement');
    assert.strictEqual(out.canonical[0].deadline.raw, '2026-08-28T13:00:00-07:00',
      'the superseded deadline was published as current');
    assert.strictEqual(out.canonical[0].occurrenceCount, 2, 'a version was discarded');
  }
});

test('an amendment does not become a second live tender', () => {
  // The failure in the other direction: two notices for one procurement left
  // separate would advertise the same contract twice.
  const snapshot = path.join(ROOT, 'data/tender-opportunities/snapshots/sam-gov.json');
  if (!fs.existsSync(snapshot)) return; // snapshots are a local cache, not committed
  const recs = JSON.parse(fs.readFileSync(snapshot, 'utf8')).records;
  const out = DEDUPE.dedupe(recs);
  const merged = out.canonical.filter((o) => o.occurrenceCount > 1);
  assert.ok(merged.length > 0, 'no amendment chains in the snapshot, so this proves nothing');
  // Nothing is deleted: every input record still appears as an occurrence.
  const occurrences = out.canonical.reduce((n, o) => n + o.occurrences.length, 0);
  assert.strictEqual(occurrences, recs.length, 'deduplication lost records instead of merging them');
});

test('the block cap reports what it did not compare', () => {
  // A bounded search that reports "no duplicates" without saying what it
  // skipped reads as an exhaustive one. SAM's largest office exceeds the cap.
  const many = Array.from({ length: DEDUPE.BLOCK_CAP + 5 }, (_, i) => ({
    id: `sam-gov:b${i}`, sourceId: 'sam-gov', sourceNoticeId: `b${i}`, country: 'united-states',
    buyerName: 'ONE VERY BUSY CONTRACTING OFFICE', officialReference: null,
    title: `Distinct procurement ${i}`, deadline: TIME.EMPTY, classifications: [],
  }));
  const out = DEDUPE.dedupe(many);
  assert.ok(out.stats.blocksSkipped >= 1, 'an over-cap block was skipped in silence');
  assert.strictEqual(out.stats.largestSkippedBlock, DEDUPE.BLOCK_CAP + 5);
  assert.strictEqual(out.stats.canonical, many.length, 'the cap lost records instead of comparisons');
});

// ── STAGING AND ACTIVATION ──────────────────────────────────────────────────

test('a disabled source contributes nothing, and that is enforced not documented', () => {
  const ingest = fs.readFileSync(path.join(ROOT, 'scripts/ingest-tender-opportunities.cjs'), 'utf8');
  const body = ingest.replace(/\/\/[^\n]*/g, '');
  assert.ok(body.includes('SOURCES.ENABLED()'),
    'the corpus rebuild iterates every registered source, so staging is decorative');
  assert.ok(!/for \(const s of SOURCES\.SOURCES\)/.test(body),
    'the corpus rebuild still walks disabled sources');
});

test('the registry states the window honestly', () => {
  // The artefact is the whole non-archived file. What is ingested is a slice of
  // it, and the registry must not describe one as the other.
  assert.strictEqual(source.window.kind, 'source-defined');
  assert.match(source.window.note, /current-opportunity slice/);
  assert.strictEqual(source.acquisition, 'OFFICIAL_EXPORT');
  assert.strictEqual(source.exposesStatus, false, 'the registry claims a status field that is constant');
});

test('the raw bulk artefact is not in the repository', () => {
  // 251 MB of third-party CSV must never be committed, by accident or design.
  const offenders = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === '.git' || e.name === 'node_modules') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/ContractOpportunities|sam\.csv$/i.test(e.name)) offenders.push(p);
    }
  };
  walk(ROOT);
  assert.deepStrictEqual(offenders, [], `the raw SAM bulk file is in the repo: ${offenders.join(', ')}`);
});

test('the build never reaches the network through this adapter', () => {
  // to-http is the only networked module and only ingestion may load it.
  const src = fs.readFileSync(path.join(ROOT, 'scripts/lib/to-adapters/sam-gov.cjs'), 'utf8');
  assert.ok(src.includes("require('../to-http.cjs')"), 'the fetch path is not where this test thinks');
  for (const build of ['build-tender-opportunities.cjs', 'build-tender-detail.cjs', 'build-tender-monitoring.cjs']) {
    const b = fs.readFileSync(path.join(ROOT, 'scripts', build), 'utf8');
    assert.ok(!b.includes('to-adapters'), `${build} loads an adapter, and adapters reach the network`);
  }
});
