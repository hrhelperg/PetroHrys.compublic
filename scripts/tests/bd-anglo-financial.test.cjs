// scripts/tests/bd-anglo-financial.test.cjs
'use strict';

// Wave 2B covered the UK, US, Canada and Australia. Its dominant output is
// DUPLICATE DETERMINATIONS, not new records: the FCA, ASIC and APRA entries
// already in the dataset are deliberately broad and absorb most candidates.
//
// Only two records were added. The guards below therefore protect the decisions
// NOT to add records at least as much as the two that were:
//
//   * PRA is surfaced through the FCA Financial Services Register. The Bank of
//     England's own page says PRA firm data is "published on the Financial
//     Services Register". A separate PRA record would duplicate it.
//   * The FCA Warning List is already inside the FCA record, which states it
//     carries warnings about unauthorised and clone firms.
//   * ASIC financial-adviser and banned-person views, and APRA's per-sector
//     lists, are filtered populations inside records that already exist.
//   * NCUA publishes a locator and a research view over ONE dataset on ONE host.
//     One record, not two.
//   * FINTRAC registration is expressly NOT endorsement or licensing.
//
// This wave used no subagents. Two separate direct passes instead.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const S = require('../lib/bd-schema.cjs');
const T = require('../lib/bd-registry-types.cjs');
const { loadRegistry } = require('../lib/bd-registry.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const ALL = loadRegistry().directories;
const byId = new Map(ALL.map((r) => [r.id, r]));

const WAVE = ['ca-fintrac-msb-registry', 'us-ncua-credit-union-search'];
const NEW = WAVE.map((id) => byId.get(id));

const visible = (r) => [r.description, ...r.pros, ...r.cons, ...r.bestFor, ...r.notRecommendedFor].join(' ');
const limitsOf = (r) => [...r.cons, ...r.notRecommendedFor].join(' ');
const hostOf = (u) => new URL(u).hostname.replace(/^www\./, '');

// --- non-vacuity -------------------------------------------------------------------

test('every record this wave claims to have published exists', () => {
  assert.strictEqual(WAVE.length, 2, 'the wave manifest changed size without this test changing');
  for (const [i, id] of WAVE.entries()) assert.ok(NEW[i], `${id} is named by this suite but is not in the registry`);
});

// --- the duplicate determinations: what must NOT appear -------------------------------

test('no separate PRA record duplicates the FCA Financial Services Register', () => {
  // The Bank of England publishes PRA firm data ON the FCA register. A PRA record
  // would be a second entry for one public interface.
  const fca = byId.get('gb-fca-register');
  assert.ok(fca, 'the FCA register record is missing; the duplication baseline is gone');
  assert.match(fca.description, /Prudential Regulation Authority/,
    'the FCA record no longer records that it carries PRA authorisation, which is what makes a PRA record a duplicate');
  const ukFinancial = ALL.filter((r) => r.country === 'united-kingdom'
    && r.registryTypes.includes('financial-services-register'));
  for (const r of ukFinancial) {
    assert.ok(!/(^|\.)bankofengland\.co\.uk$/.test(hostOf(r.website)),
      `${r.id} publishes a Bank of England host as a separate financial register; PRA data is on the FCA register`);
  }
});

test('no separate FCA warning-list record duplicates the FCA register', () => {
  const fca = byId.get('gb-fca-register');
  assert.match(fca.description, /warning|unauthorised|clone/i,
    'the FCA record no longer records that it carries warnings, which is what absorbs a warning-list candidate');
  const warningRecords = ALL.filter((r) => r.country === 'united-kingdom'
    && /warning list/i.test(`${r.name} ${r.officialName || ''}`));
  assert.strictEqual(warningRecords.length, 0,
    'a separate FCA Warning List record exists; the FCA register record already carries warnings');
});

test('no ASIC Connect view is published as a separate record', () => {
  const asic = byId.get('au-asic-registers');
  assert.ok(asic, 'the ASIC registers record is missing; the duplication baseline is gone');
  assert.match(asic.description, /financial adviser|banned/i,
    'the ASIC record no longer records the adviser and banned-person coverage that absorbs those candidates');
  const asicHosted = ALL.filter((r) => /(^|\.)asic\.gov\.au$/.test(hostOf(r.website)));
  assert.strictEqual(asicHosted.length, 1,
    'more than one record is filed on the ASIC host; ASIC Connect views are not separate systems');
});

test('no APRA per-sector list is published as a separate record', () => {
  const apra = byId.get('au-apra-registers');
  assert.ok(apra, 'the APRA registers record is missing; the duplication baseline is gone');
  const apraHosted = ALL.filter((r) => /(^|\.)apra\.gov\.au$/.test(hostOf(r.website)));
  assert.strictEqual(apraHosted.length, 1,
    'more than one record is filed on the APRA host; per-sector lists are filtered populations');
});

test('the NCUA locator and research view are one record, not two', () => {
  const ncuaHosted = ALL.filter((r) => /(^|\.)ncua\.gov$/.test(hostOf(r.website)));
  assert.strictEqual(ncuaHosted.length, 1,
    'more than one NCUA record exists; the locator and research view are one dataset on one host');
  assert.match(byId.get('us-ncua-credit-union-search').editorNotes, /ONE record rather than two/,
    'the NCUA record no longer records the one-system decision');
});

test('BrokerCheck and IAPD remain separate and unchanged', () => {
  const bc = byId.get('us-finra-brokercheck');
  const iapd = byId.get('us-sec-iapd');
  assert.ok(bc && iapd, 'an existing overlap record is missing');
  assert.notStrictEqual(hostOf(bc.website), hostOf(iapd.website),
    'BrokerCheck and IAPD now share a host, which would change the overlap analysis');
  // The real risk is a NEW record on either host, or a second entry for the same
  // system. Matching the word "broker" is useless here — the dataset legitimately
  // holds NFA BASIC (futures) and a customs brokers listing, which are different
  // populations entirely and must not be swept up.
  for (const h of [hostOf(bc.website), hostOf(iapd.website)]) {
    const onHost = ALL.filter((r) => hostOf(r.website) === h);
    assert.strictEqual(onHost.length, 1,
      `more than one record is filed on ${h}; BrokerCheck and IAPD each have one entry`);
  }
  // And this wave must not have added a US financial record at all.
  assert.ok(!WAVE.some((id) => byId.get(id).country === 'united-states'
    && byId.get(id).registryTypes.includes('professional-licence-register')),
  'this wave added a US professional-licence record, which would overlap BrokerCheck or IAPD');
});

// --- FINTRAC: register, not guidance; registration, not endorsement --------------------

test('the FINTRAC record points at the registry, not the guidance page', () => {
  const r = byId.get('ca-fintrac-msb-registry');
  assert.match(r.website, /\/msb-esm\/reg-eng$/,
    'the FINTRAC record points somewhere other than the registry path');
  assert.ok(!/\/msb-esm\/msb-eng/.test(r.website),
    'the FINTRAC record points at the guidance landing page rather than the registry');
});

test('FINTRAC registration is never presented as endorsement or licensing', () => {
  const r = byId.get('ca-fintrac-msb-registry');
  assert.match(limitsOf(r), /not endorsement|does not indicate that it endorses|issues no licen/i,
    'the FINTRAC page does not tell a reader that registration is not endorsement');
  assert.match(visible(r), /licen/i, 'the FINTRAC page never addresses licensing at all');
  assert.ok(!/proves? (?:the business is )?(?:legitimate|compliant|approved)/i.test(visible(r)),
    'the FINTRAC page implies registration proves legitimacy or compliance');
});

// --- access truth -----------------------------------------------------------------------

test('neither new record claims access it did not observe', () => {
  for (const r of NEW) {
    const pa = r.publicAccess;
    assert.strictEqual(pa.accessLevel, 'unknown', `${r.id} claims an access level`);
    assert.strictEqual(pa.searchUrl, null, `${r.id} publishes a search URL it never exercised`);
    for (const k of ['freeToSearch', 'loginRequired', 'identityVerificationRequired',
      'captcha', 'geographicRestriction', 'paidDocumentsAvailable']) {
      assert.strictEqual(pa[k], null, `${r.id} asserts ${k} without observing it`);
    }
    assert.ok(pa.notes && pa.notes.trim().length > 60, `${r.id} gives no access explanation`);
    assert.deepStrictEqual(S.accessContradictions(pa), [], `${r.id} has contradictory access fields`);
  }
});

test('operator documentation is never reported as observed behaviour', () => {
  // FINTRAC documents that all fields are searchable. That is the operator's
  // statement, not something this dataset watched happen, and the distinction
  // must survive in the record.
  const r = byId.get('ca-fintrac-msb-registry');
  assert.match(r.publicAccess.notes, /rather than as observed behaviour|operator’s documentation/i,
    'the FINTRAC record no longer separates documented behaviour from observed behaviour');
  assert.strictEqual(r.publicAccess.freeToSearch, null,
    'the FINTRAC record converted documented searchability into an access boolean');
});

test('a record published on an unreachable host says so in visible text', () => {
  const r = byId.get('us-ncua-credit-union-search');
  assert.match(limitsOf(r), /does not respond to automated requests/i,
    'the NCUA page does not disclose that its application host is unreachable to automated clients');
});

// --- publication truth ---------------------------------------------------------------------

test('no record describes the research session instead of the register', () => {
  // A published field must describe the system, not our vantage on it. This
  // caught a real defect in this wave.
  for (const r of NEW) {
    const all = `${visible(r)} ${r.editorNotes} ${r.publicAccess.notes}`;
    assert.ok(!/this (?:research|environment|session|vantage|exercise|batch)\b/i.test(all),
      `${r.id} describes the research rather than the register`);
  }
});

test('both records meet the publication contract', () => {
  for (const r of NEW) {
    assert.match(r.website, /^https:\/\//, `${r.id} is not https`);
    assert.strictEqual(r.operator.type, 'regulator', `${r.id} operator is not a regulator`);
    assert.ok(r.description.length > 120, `${r.id} description is thin`);
    assert.ok(r.pros.length >= 3 && r.cons.length >= 3, `${r.id} has a thin assessment`);
    assert.strictEqual(S.computeScore(r.scoreFactors), r.petroHrysScore, `${r.id} score does not reproduce`);
    assert.strictEqual(r.nextVerification, S.nextVerificationFor(r), `${r.id} date was hand-set`);
    for (const t of r.registryTypes) assert.ok(T.REGISTRY_TYPE_BY_ID.has(t), `${r.id} uses undefined type "${t}"`);
    assert.strictEqual(r.primaryRegistryType, r.registryTypes[0], `${r.id} primary type is not first`);
    for (const label of ['LEGAL SOURCE OF RECORD:', 'RESPONSIBLE AUTHORITY:',
      'TECHNICAL PLATFORM:', 'PUBLIC ACCESS INTERFACE:']) {
      assert.ok(r.editorNotes.includes(label), `${r.id} is missing "${label}"`);
    }
    assert.match(limitsOf(r), /not endorsement|is not a statement|does not|means nothing|not asserted/i,
      `${r.id} never says what it does not establish`);
  }
});

test('both new records carry a provenanced rating of their own domain', () => {
  // POLICY REVERSAL: the two per-record assertions (domainRating null, empty
  // metricsProvenance) and the pinned count of 64 measured domains all encoded
  // the Domain Rating collection freeze. That freeze has been lifted — Ahrefs'
  // /v3/public/domain-rating-free endpoint needs no paid plan, and every domain
  // in the corpus has been read through it — so all three could only restate a
  // policy that no longer holds. What they protected is asserted directly
  // instead: a rating is never invented, and it describes the record's own
  // domain rather than a related one. The shared-domain consistency check below
  // was never a freeze pin and is unchanged.
  for (const r of NEW) {
    assert.deepStrictEqual(S.domainRatingProblems(r), [],
      `${r.id} carries a Domain Rating that is off-scale or missing its provenance`);
    assert.strictEqual(r.metricsProvenance.domainRating.measuredDomain, S.normaliseDomain(r.website),
      `${r.id} reports a rating measured on a domain that is not its own`);
  }
  const domains = new Set(ALL
    .filter((r) => r.domainRating !== null && r.domainRating !== undefined)
    .map((r) => (r.metricsProvenance || {}).domainRating).filter(Boolean)
    .map((p) => p.measuredDomain));
  assert.ok(domains.size > 0, 'no domain in the dataset carries a reading at all');
  assert.deepStrictEqual(S.sharedDomainSnapshotProblems(ALL), [], 'a shared-domain snapshot became inconsistent');
});

test('the Canada coverage manifest counts the new federal record', () => {
  // A coverage manifest that drifts from the registry makes the country page lie.
  //
  // The manifest measures JURISDICTIONAL coverage by statutory registers, so it
  // counts the Government Registry pillar only. Wave 1B.8 added commercial
  // directories carrying no jurisdiction, which would otherwise have been counted
  // as federal registry coverage — asserting that a business directory covers a
  // jurisdiction the way a statutory register does. It does not.
  const manifest = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'data', 'business-directories', 'canada-jurisdiction-coverage.json'), 'utf8'));
  const federal = ALL.filter((r) => r.country === 'canada' && !r.jurisdiction
    && S.isGovernmentPillar(r));
  assert.strictEqual(manifest.totals.federalPublished, federal.length,
    'the Canada coverage manifest disagrees with the number of federal records');
  // The pillar filter must stay load-bearing. Without this, deleting every
  // commercial Canadian record would silently turn the test back into the old one.
  assert.ok(ALL.some((r) => r.country === 'canada' && !S.isGovernmentPillar(r)),
    'no commercial Canadian record exists, so the pillar filter above is untested');
});
