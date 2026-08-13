'use strict';

// Spain — Plataforma de Contratación del Sector Público adapter.
//
// The fixture is real feed output, one entry per status code the platform
// emits, so the status mapping is exercised against the source's own values
// rather than invented ones.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const A = require('../lib/to-adapters/es-pcsp.cjs');
const CLASS = require('../lib/to-classification.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const XML = read('scripts/tests/fixtures/es-pcsp-sample.atom');
const SRC = read('scripts/lib/to-adapters/es-pcsp.cjs');
const NOW = '2026-08-13T12:00:00.000Z';
const records = A.entriesOf(XML).map((e) => A.normalizeEntry(e, { nowIso: NOW })).filter(Boolean);

test('every fixture entry parses, and the fixture covers every status', () => {
  assert.strictEqual(records.length, 5, 'an entry failed to normalize');
  assert.deepStrictEqual(records.map((r) => r.statusCode).sort(),
    ['ADJ', 'ANUL', 'EV', 'PUB', 'RES']);
});

test('status decides the opportunity, never the deadline', () => {
  // 20 of 28 live entries were NOT open. A "future deadline means open" rule
  // would have imported awarded and cancelled procurements as opportunities.
  const by = Object.fromEntries(records.map((r) => [r.statusCode, r]));
  assert.strictEqual(by.PUB.reportedStatus, 'OPEN');
  assert.strictEqual(by.EV.reportedStatus, 'CLOSED', 'under evaluation was treated as open');
  assert.strictEqual(by.ADJ.reportedStatus, 'AWARDED');
  assert.strictEqual(by.RES.reportedStatus, 'AWARDED');
  assert.strictEqual(by.ANUL.reportedStatus, 'CANCELLED');
  assert.strictEqual(by.ADJ.noticeType, 'CONTRACT_AWARD');
  assert.strictEqual(by.RES.noticeType, 'CONTRACT_AWARD');
  // An unlisted code is UNKNOWN, never guessed into OPEN.
  const unknown = A.normalizeEntry('<id>x/99</id><cbc-place-ext:ContractFolderStatusCode>ZZZ</cbc-place-ext:ContractFolderStatusCode>', { nowIso: NOW });
  assert.strictEqual(unknown.reportedStatus, null);
  assert.strictEqual(unknown.noticeType, 'UNKNOWN');
});

test('the reader matches local names, because prefixes differ within one document', () => {
  // The status code arrives as cbc-place-ext: while its siblings are cbc:.
  assert.ok(XML.includes('cbc-place-ext:ContractFolderStatusCode'));
  assert.ok(records.every((r) => r.statusCode), 'a prefixed element was missed');
  assert.strictEqual(A.pick('<ns9:Name>Buyer</ns9:Name>', 'Name'), 'Buyer');
  assert.strictEqual(A.pick('<Name>Buyer</Name>', 'Name'), 'Buyer');
});

test('CPV is preserved as CPV and nothing else is read as one', () => {
  for (const r of records) {
    assert.ok(r.classifications.length > 0, `${r.sourceNoticeId} lost its CPV`);
    for (const c of r.classifications) {
      assert.strictEqual(c.scheme, 'CPV');
      assert.match(c.code, /^\d{2,10}$/);
      // The code came through the shared normalizer, so it carries a division.
      assert.strictEqual(c.top, c.code.slice(0, 2));
    }
  }
  // Numeric fields that are NOT commodity classifications must not be read as
  // CPV — the adapter reads only ItemClassificationCode.
  const code = SRC.replace(/^\s*\/\/.*$/gm, '');
  assert.ok(/ItemClassificationCode/.test(code));
  for (const notCpv of ['ContractingPartyTypeCode', 'ProcedureCode', 'CountrySubentityCode',
    'ActivityCode', 'SubmissionMethodCode']) {
    assert.ok(!new RegExp(`\\['CPV'[^\\]]*${notCpv}`).test(code),
      `${notCpv} is being read as a CPV code`);
  }
});

test('a zoneless deadline keeps its wording and gets no instant', () => {
  const withDeadline = records.filter((r) => r.deadline && r.deadline.raw);
  assert.ok(withDeadline.length >= 4, 'too few deadlines to test');
  for (const r of withDeadline) {
    // The platform publishes a date and a time and no offset anywhere.
    assert.strictEqual(r.deadline.precision, 'ZONELESS',
      `${r.sourceNoticeId}: a timezone was invented`);
    assert.strictEqual(r.deadline.iso, null, 'a zoneless deadline was given an instant');
    assert.match(r.deadline.raw, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  }
});

test('value keeps the currency the platform stated, unconverted', () => {
  const withValue = records.filter((r) => r.value);
  assert.ok(withValue.length >= 4);
  for (const r of withValue) {
    assert.strictEqual(r.value.currency, 'EUR');
    assert.ok(Number.isFinite(r.value.amount));
  }
  const code = SRC.replace(/^\s*\/\/.*$/gm, '').replace(/\s+\/\/.*$/gm, '');
  assert.ok(!/\brates?\b|\bconvert|\bexchange\b|toEUR|toUSD/i.test(code),
    'the adapter references currency conversion');
});

test('buyer and reference come from the notice, not from the platform', () => {
  for (const r of records) {
    assert.ok(r.buyerName && r.buyerName.length > 3, 'a buyer is missing');
    assert.ok(!/Plataforma de Contrataci/i.test(r.buyerName),
      'the platform was recorded as the buyer');
    assert.ok(r.officialReference, 'the contract folder reference is missing');
  }
});

test('no platform capability is inherited as a notice fact', () => {
  for (const r of records) {
    assert.strictEqual(r.electronicSubmission, null,
      'electronic submission was asserted without notice evidence');
    assert.strictEqual(r.submissionUrl, null);
    assert.ok(!('documentsUrl' in r), 'a documents fact was invented');
    assert.ok(!('foreignSuppliersAccepted' in r), 'foreign eligibility was invented');
  }
});

test('the ATOM updated stamp is not promoted to a publication date', () => {
  for (const r of records) {
    assert.ok(!('publicationDate' in r),
      'the feed entry update time was recorded as the notice publication date');
    assert.ok(r.sourceModifiedDate, 'the source modification stamp was dropped');
  }
});

test('the notice URL is the notice, not the platform homepage', () => {
  for (const r of records) {
    assert.match(r.sourceUrl, /^https:\/\//);
    assert.ok(!/^https:\/\/contrataciondelestado\.es\/?$/.test(r.sourceUrl),
      'the platform homepage was used as the notice URL');
    assert.ok(r.sourceNoticeId && /^\d+$/.test(r.sourceNoticeId),
      'the notice id is not the platform-stable number');
  }
});

test('continuation is followed only on the platform host', () => {
  const base = 'https://contrataciondelestado.es/sindicacion/sindicacion_643/x.atom';
  const next = A.nextLink(XML, base);
  assert.ok(next && next.startsWith('https://contrataciondelestado.es/'),
    'the next link was not resolved');
  // A feed must not be able to redirect ingestion at another server.
  assert.strictEqual(A.nextLink('<link rel="next" href="https://evil.test/f.atom"/>', base), null);
  assert.strictEqual(A.nextLink('<link rel="next" href="http://contrataciondelestado.es/f.atom"/>', base), null);
  assert.strictEqual(A.nextLink('<feed></feed>', base), null, 'a missing next link must terminate');
});

test('TLS verification is never disabled anywhere in this adapter', () => {
  const code = SRC.replace(/^\s*\/\/.*$/gm, '');
  for (const unsafe of ['rejectUnauthorized', 'NODE_TLS_REJECT_UNAUTHORIZED',
    'checkServerIdentity', 'secureProtocol', 'insecure']) {
    assert.ok(!code.includes(unsafe), `the adapter touches TLS trust via ${unsafe}`);
  }
  // And it ships no certificate material: Node's bundled trust store already
  // validates this host, which was verified live.
  assert.ok(!/BEGIN CERTIFICATE|\.pem|\.crt|ca:\s*\[/.test(code),
    'the adapter carries its own CA material');
});

test('the XML reader cannot resolve an external entity', () => {
  // Behaviour, not substrings: the constant that holds the five built-in
  // entities is legitimately called ENTITIES, so scanning the source for the
  // word would fail on correct code. What matters is what it decodes.
  const code = SRC.replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/resolveExternal|noent|loadDTD|externalEntities/i.test(code),
    'the reader enables external entity resolution');
  // Only the five XML built-ins and numeric references are decoded.
  assert.strictEqual(A.decode('&lt;a&gt; &amp; &quot;b&quot; &apos;c&apos;'), '<a> & "b" \'c\'');
  assert.strictEqual(A.decode('&xxe;'), '&xxe;', 'an unknown entity was expanded');
  const hostile = '<!DOCTYPE f [<!ENTITY x SYSTEM "file:///etc/passwd">]><entry><id>x/1</id><title>&x;</title></entry>';
  const r = A.normalizeEntry(A.entriesOf(hostile)[0], { nowIso: NOW });
  assert.strictEqual(r.title, '&x;', 'an external entity was expanded');
});

test('the adapter is not wired into the source registry yet', () => {
  // Activation is deliberately incomplete: the adapter parses correctly but
  // has not been through ingest, TED overlap, health and fresh-clone proof.
  const SOURCES = require('../lib/to-sources.cjs');
  assert.ok(!SOURCES.ENABLED().some((s) => s.id === A.ID),
    'Spain is enabled without completing the activation gate');
});
