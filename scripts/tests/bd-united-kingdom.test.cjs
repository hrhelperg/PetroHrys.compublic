// scripts/tests/bd-united-kingdom.test.cjs
'use strict';

// The United Kingdom is the hardest territorial model in the dataset, and every
// error it invites is an error of OVER-CLAIMING reach:
//
//   * calling an England-only regulator "UK-wide" (the Care Quality Commission
//     was published that way, and this wave corrected it);
//   * treating Great Britain as a synonym for the United Kingdom, when it
//     excludes Northern Ireland;
//   * collapsing four separate national regulators into one record because they
//     do similar work — CQC, Healthcare Improvement Scotland, the Care
//     Inspectorate, Care Inspectorate Wales and RQIA are five different bodies
//     with five different statutory populations;
//   * reaching for a compound identifier — GB-EAW, GB-GBN, GB-UKM — instead of
//     modelling England and Wales as a cross-territory jurisdiction with covers.
//
// bd-uk-territories.test.cjs already proves the MODEL supports these shapes.
// This file proves the SHIPPED UK RECORDS use them correctly.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const S = require('../lib/bd-schema.cjs');
const ISO = require('../lib/iso-3166-2.cjs');
const T = require('../lib/bd-registry-types.cjs');
const c = require('../lib/bd-components.cjs');
const { loadRegistry } = require('../lib/bd-registry.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const ALL = loadRegistry().directories;
const UK = ALL.filter((r) => r.country === 'united-kingdom');
const SUB = UK.filter((r) => r.jurisdiction);
const UKWIDE = UK.filter((r) => !r.jurisdiction);
const CROSS = SUB.filter((r) => r.jurisdiction.type === 'cross-territory');
const PAGE = fs.readFileSync(path.join(ROOT, 'research/business-directories/united-kingdom/index.html'), 'utf8');
const byId = new Map(UK.map((r) => [r.id, r]));

// Authored before this wave under an earlier contract.
const PRE_EXISTING = new Set(['gb-companies-house', 'gb-fca-register', 'gb-cqc']);
const NEW = UK.filter((r) => !PRE_EXISTING.has(r.id));

// --- shape --------------------------------------------------------------------

test('the wave produced a real UK territorial layer', () => {
  assert.ok(UK.length >= 19, `only ${UK.length} UK records`);
  assert.ok(UKWIDE.length >= 6, `only ${UKWIDE.length} UK-wide records`);
  assert.ok(SUB.length >= 13, `only ${SUB.length} subnational records`);
  assert.ok(CROSS.length >= 4, `only ${CROSS.length} cross-territory records`);
  // All four constituent territories must be represented, or the model is
  // being exercised in name only.
  const codes = new Set(SUB.flatMap((r) => r.jurisdiction.covers || [r.jurisdiction.code]));
  for (const code of ['GB-ENG', 'GB-SCT', 'GB-WLS', 'GB-NIR']) {
    assert.ok(codes.has(code), `no record reaches ${code}`);
  }
});

test('every UK subdivision code is real, British, and correctly categorised', () => {
  const EXPECTED_TYPE = { 'GB-ENG': 'country', 'GB-SCT': 'country', 'GB-WLS': 'country', 'GB-NIR': 'province' };
  for (const r of SUB) {
    const j = r.jurisdiction;
    assert.strictEqual(r.scope, 'subnational', `${r.id} scope is ${r.scope}`);
    assert.strictEqual(j.parentCountry, 'united-kingdom', `${r.id} parentCountry is ${j.parentCountry}`);
    const codes = j.covers || [j.code];
    for (const code of codes) {
      assert.strictEqual(S.iso3166_2Problem(code), null, `${r.id} code ${code} is malformed`);
      assert.strictEqual(ISO.unknownCodeProblem(code), null, `${r.id} code ${code} is not a real code`);
      assert.strictEqual(ISO.countryOf(code), 'GB', `${r.id} code ${code} is not British`);
    }
    if (j.type !== 'cross-territory') {
      assert.strictEqual(j.type, EXPECTED_TYPE[j.code],
        `${r.id}: ${j.code} is filed as ${j.type}, but ISO 3166-2 categorises it as ${EXPECTED_TYPE[j.code]}`);
    }
  }
});

test('Northern Ireland is a province and the other three are countries', () => {
  // This is the classification ISO 3166-2 itself assigns. Filing Northern
  // Ireland as `country` would be tidier and would misdescribe the standard.
  assert.strictEqual(ISO.subdivision('GB-NIR').category, 'Province');
  for (const code of ['GB-ENG', 'GB-SCT', 'GB-WLS']) {
    assert.strictEqual(ISO.subdivision(code).category, 'Country');
  }
  for (const r of SUB) {
    if (r.jurisdiction.code === 'GB-NIR') assert.strictEqual(r.jurisdiction.type, 'province', r.id);
  }
});

test('a jurisdiction name matches its ISO name, allowing for the Welsh alternative form', () => {
  // ISO stores Wales as "Wales [Cymru GB-WLS]". The published name is the plain
  // form; what must never happen is a name that is not the subdivision at all.
  const plain = (s) => s.replace(/\s*\[[^\]]*\]\s*/g, '').trim();
  for (const r of SUB) {
    const j = r.jurisdiction;
    if (j.type === 'cross-territory') continue;
    assert.strictEqual(j.name, plain(ISO.subdivision(j.code).name),
      `${r.id} names ${j.code} "${j.name}"`);
  }
});

// --- the compound-identifier trap ---------------------------------------------

test('no deprecated or invented GB compound identifier appears anywhere', () => {
  const FORBIDDEN = ['GB-EAW', 'GB-GBN', 'GB-UKM', 'GB-CHC', 'GB-COH', 'GB-NIC', 'GB-CYM'];
  // Each must still be rejected by the allowlist...
  for (const code of FORBIDDEN) {
    assert.ok(ISO.unknownCodeProblem(code), `${code} is accepted by the allowlist`);
  }
  // ...and none may be USED as an identifier by any UK record. editorNotes is
  // excluded deliberately: recording *why* GB-EAW is not used is exactly the
  // documentation that stops a later wave reaching for it, and banning the
  // string there would delete the warning along with the error.
  for (const r of UK) {
    const j = r.jurisdiction;
    const identifiers = [
      j && j.code,
      ...((j && j.covers) || []),
      r.resourceIdentity && r.resourceIdentity.canonicalDomain,
      r.resourceIdentity && r.resourceIdentity.systemKey,
      r.resourceIdentity && r.resourceIdentity.sharedHostGroup,
      r.website,
      r.publicAccess.searchUrl,
    ].filter(Boolean);
    for (const code of FORBIDDEN) {
      for (const value of identifiers) {
        assert.ok(!String(value).includes(code), `${r.id} uses ${code} as an identifier`);
      }
      // Reader-facing prose must not use one either.
      for (const value of [r.description, ...r.pros, ...r.cons, ...r.bestFor, ...r.notRecommendedFor]) {
        assert.ok(!value.includes(code), `${r.id} publishes ${code} in reader-facing prose`);
      }
    }
  }
  // Nor may one reach a published page.
  for (const r of UK) {
    const file = path.join(ROOT, 'research/business-directories/united-kingdom', r.slug, 'index.html');
    if (!fs.existsSync(file)) continue;
    const html = fs.readFileSync(file, 'utf8');
    for (const code of FORBIDDEN) {
      assert.ok(!html.includes(code), `${r.id} page renders ${code}`);
    }
  }
});

test('England and Wales is modelled with covers, never with a code', () => {
  const eaw = CROSS.filter((r) => r.jurisdiction.name === 'England and Wales');
  assert.ok(eaw.length >= 4, `only ${eaw.length} England-and-Wales records`);
  for (const r of eaw) {
    const j = r.jurisdiction;
    assert.strictEqual(j.code, null, `${r.id} carries both a code and covers`);
    assert.deepStrictEqual(j.covers, ['GB-ENG', 'GB-WLS'], `${r.id} covers is ${JSON.stringify(j.covers)}`);
    assert.strictEqual(j.type, 'cross-territory', r.id);
  }
});

test('no record claims Great Britain while meaning the United Kingdom', () => {
  for (const r of UK) {
    const j = r.jurisdiction;
    if (j && j.name === 'Great Britain') {
      assert.deepStrictEqual(j.covers, ['GB-ENG', 'GB-SCT', 'GB-WLS'],
        `${r.id} is named Great Britain but does not cover exactly England, Scotland and Wales`);
      assert.ok(!j.covers.includes('GB-NIR'), `${r.id} puts Northern Ireland inside Great Britain`);
    }
    // A UK-wide record must not describe itself as Great Britain, and vice versa.
    if (!j) {
      assert.ok(!/\bGreat Britain\b/.test(r.description),
        `${r.id} is filed UK-wide but its description says Great Britain`);
    }
  }
});

// --- territory-specific regulators must not be conflated -----------------------

test('the Care Quality Commission is scoped to England, not the United Kingdom', () => {
  // This was published as UK-wide and is factually wrong: GOV.UK states the CQC
  // regulates all health and social care services in England.
  const cqc = byId.get('gb-cqc');
  assert.ok(cqc, 'the CQC record is missing');
  assert.strictEqual(cqc.scope, 'subnational', 'CQC is filed as national');
  assert.ok(cqc.jurisdiction, 'CQC carries no jurisdiction');
  assert.strictEqual(cqc.jurisdiction.code, 'GB-ENG', `CQC is filed under ${cqc.jurisdiction.code}`);
  assert.strictEqual(cqc.jurisdiction.type, 'country');
  // The correction must be recorded, not silent.
  assert.match(cqc.editorNotes, /England/, 'the CQC correction is not documented');
});

test('the five care and health regulators are five records, not one', () => {
  // CQC (England), Healthcare Improvement Scotland (independent healthcare),
  // the Care Inspectorate (Scottish care services), Care Inspectorate Wales and
  // RQIA (Northern Ireland) regulate different populations in different
  // territories. Merging any of them would misdescribe all of them.
  const ids = ['gb-cqc', 'gb-his-independent-healthcare', 'gb-care-inspectorate-scotland',
    'gb-care-inspectorate-wales', 'gb-rqia-register'];
  const records = ids.map((id) => byId.get(id));
  for (let i = 0; i < ids.length; i += 1) {
    assert.ok(records[i], `${ids[i]} is missing`);
  }
  // Distinct hosts, so none is a re-listing of another.
  const hosts = records.map((r) => S.normaliseDomain(r.website));
  assert.strictEqual(new Set(hosts).size, hosts.length, `care regulators share a host: ${hosts}`);
  // Territories: England, Scotland, Scotland, Wales, Northern Ireland.
  assert.strictEqual(byId.get('gb-cqc').jurisdiction.code, 'GB-ENG');
  assert.strictEqual(byId.get('gb-his-independent-healthcare').jurisdiction.code, 'GB-SCT');
  assert.strictEqual(byId.get('gb-care-inspectorate-scotland').jurisdiction.code, 'GB-SCT');
  assert.strictEqual(byId.get('gb-care-inspectorate-wales').jurisdiction.code, 'GB-WLS');
  assert.strictEqual(byId.get('gb-rqia-register').jurisdiction.code, 'GB-NIR');
  // The two Scottish bodies must each say they are not the other.
  const his = byId.get('gb-his-independent-healthcare');
  const ci = byId.get('gb-care-inspectorate-scotland');
  assert.match([his.description, ...his.cons, his.editorNotes].join(' '), /Care Inspectorate/,
    'Healthcare Improvement Scotland never distinguishes itself from the Care Inspectorate');
  assert.match([ci.description, ...ci.cons, ci.editorNotes].join(' '), /[Hh]ealthcare Improvement Scotland|independent healthcare/,
    'the Care Inspectorate never distinguishes itself from Healthcare Improvement Scotland');
});

test('the three charity regulators are three records with three territories', () => {
  const ew = byId.get('gb-charity-commission-register');
  const sc = byId.get('gb-oscr-scottish-charity-register');
  const ni = byId.get('gb-ccni-register-of-charities');
  for (const [id, r] of [['E&W', ew], ['Scotland', sc], ['NI', ni]]) {
    assert.ok(r, `the ${id} charity register is missing`);
    assert.ok(r.registryTypes.includes('charity-register'), `${id} is not a charity-register`);
  }
  assert.deepStrictEqual(ew.jurisdiction.covers, ['GB-ENG', 'GB-WLS']);
  assert.strictEqual(sc.jurisdiction.code, 'GB-SCT');
  assert.strictEqual(ni.jurisdiction.code, 'GB-NIR');
  // Each must tell the reader the others exist, or a reader takes one for all.
  for (const r of [ew, sc, ni]) {
    const prose = [...r.cons, ...r.notRecommendedFor].join(' ');
    assert.match(prose, /Scotland|Northern Ireland|England and Wales/,
      `${r.id} never says which territories it does not cover`);
  }
});

test('every subnational record says what it does not cover', () => {
  for (const r of SUB) {
    const prose = [...r.cons, ...r.notRecommendedFor].join(' ');
    assert.match(prose, /only|separate|does not (?:cover|reach)|each of which/i,
      `${r.id} never states the limit of its territorial reach`);
  }
});

// --- classification and access -------------------------------------------------

test('every UK record meets the publication contract', () => {
  for (const r of NEW) {
    assert.ok(r.id && r.slug && r.name, 'a record is missing an identifier');
    assert.match(r.website, /^https:\/\//, `${r.id} website is not https`);
    assert.ok(r.operator && r.operator.name.trim(), `${r.id} has no operator`);
    assert.ok(S.OPERATOR_TYPES.includes(r.operator.type), `${r.id} operator type invalid`);
    assert.ok(r.registryTypes.length > 0, `${r.id} has no registry type`);
    for (const t of r.registryTypes) {
      assert.ok(T.REGISTRY_TYPE_BY_ID.has(t), `${r.id} uses undefined type "${t}"`);
    }
    assert.strictEqual(r.primaryRegistryType, r.registryTypes[0], `${r.id} primary type is not first`);
    assert.ok(S.ACCESS_LEVELS.includes(r.publicAccess.accessLevel), `${r.id} access level invalid`);
    assert.deepStrictEqual(S.accessContradictions(r.publicAccess), [], `${r.id} access contradiction`);
    assert.strictEqual(r.verification.status, 'verified', `${r.id} is not verified`);
    assert.ok(r.verification.reviewers.length > 0, `${r.id} has no reviewer`);
    assert.ok(r.description.length > 100, `${r.id} description is thin`);
    assert.ok(r.pros.length > 0 && r.cons.length > 0, `${r.id} has no assessment`);
    assert.ok(r.bestFor.length > 0 || r.notRecommendedFor.length > 0, `${r.id} has no audience guidance`);
    assert.strictEqual(S.computeScore(r.scoreFactors), r.petroHrysScore, `${r.id} score does not reproduce`);
    assert.strictEqual(r.nextVerification, S.nextVerificationFor(r), `${r.id} verification date was hand-set`);
    assert.strictEqual(r.submissionModel, 'notApplicable', `${r.id} is ${r.submissionModel}`);
  }
});

test('a professional register records individuals and says so', () => {
  const professional = NEW.filter((r) => r.registryTypes.includes('professional-licence-register'));
  assert.ok(professional.length >= 5, `only ${professional.length} professional registers`);
  for (const r of professional) {
    const prose = [...r.cons, ...r.notRecommendedFor].join(' ');
    assert.match(prose, /individual|practitioner|not (?:a )?(?:business|organisation)|solicitor|barrister/i,
      `${r.id} never distinguishes registering a person from registering a business`);
    // And none may imply registration proves quality.
    const claims = [r.description, ...r.pros].join(' ');
    assert.ok(!/\b(?:proves|guarantees|ensures)\b[^.]*\b(?:competent|quality|safe|trustworthy)\b/i.test(claims),
      `${r.id} implies registration proves competence or quality`);
  }
});

test('no UK record claims that inclusion proves compliance or trustworthiness', () => {
  for (const r of NEW) {
    const published = [r.description, ...r.pros, ...r.bestFor].join(' ');
    assert.ok(!/\b(?:proves|guarantees|certifies|ensures)\b[^.]*\b(?:compliant|compliance|trustworth|reputable|safe)\b/i.test(published),
      `${r.id} claims registration proves compliance or trustworthiness`);
  }
  // EVERY record must positively state what inclusion does not establish. That
  // is clause 7 of the content contract, and a register that only says what it
  // proves is the shape that misleads. The phrasings below are the honest ways
  // of saying it; a record matching none of them is not disclaiming at all.
  const DISCLAIMS = /does not (?:establish|prove|mean|cover|reach|describe)|is not a statement|not a guide to|says nothing about|not a general assessment|establishes nothing|records nothing|establishes [^.]*, not |it is not a |means? [^.]*\. It does not/i;
  const silent = NEW.filter((r) => !DISCLAIMS.test([...r.cons, ...r.notRecommendedFor].join(' ')));
  assert.deepStrictEqual(silent.map((r) => r.id), [],
    'these records never say what inclusion does not establish');
});

test('a register with no interactive search says so and publishes no search URL', () => {
  // RQIA publishes downloadable spreadsheets. That is a valid register, but the
  // record must not imply a query form that does not exist.
  const rqia = byId.get('gb-rqia-register');
  assert.strictEqual(rqia.publicAccess.searchUrl, null, 'RQIA publishes a search URL it does not have');
  assert.match([rqia.description, ...rqia.cons, rqia.publicAccess.notes].join(' '),
    /download|spreadsheet|no interactive search/i,
    'the RQIA record does not say the register is a downloadable list');
});

test('an unverified access posture stays null rather than a confident false', () => {
  for (const r of NEW) {
    const pa = r.publicAccess;
    if (pa.accessLevel !== 'unknown') continue;
    for (const k of ['freeToSearch', 'loginRequired', 'identityVerificationRequired', 'captcha', 'geographicRestriction']) {
      assert.strictEqual(pa[k], null, `${r.id} has accessLevel unknown but asserts ${k} = ${pa[k]}`);
    }
    assert.ok(pa.notes && pa.notes.trim(), `${r.id} is unknown but explains nothing`);
  }
});

test('an access claim is carried by the access block', () => {
  for (const r of UK) {
    const pa = r.publicAccess;
    const sentences = [r.description, ...r.pros, ...r.cons]
      .flatMap((v) => v.split(/(?<=[.!?])\s+/))
      .filter((x) => !/\b(?:whether|not established|unknown|was not|could not)\b/i.test(x))
      .join(' ');
    if (/can be searched free of charge|is published free of charge/.test(sentences)) {
      assert.strictEqual(pa.freeToSearch, true, `${r.id} claims free access, freeToSearch is ${pa.freeToSearch}`);
    }
    if (/without an account/.test(sentences)) {
      assert.strictEqual(pa.loginRequired, false, `${r.id} claims no account, loginRequired is ${pa.loginRequired}`);
    }
    if (pa.searchUrl === null && /\bcan be searched\b/.test(sentences)) {
      assert.fail(`${r.id} has no searchUrl but says it can be searched`);
    }
  }
});

// --- metrics -------------------------------------------------------------------

test('no record added by this wave carries a newly measured metric', () => {
  // Exactly one added record carries a Domain Rating: the disqualified
  // directors register, which sits on the SAME measured domain as the already
  // published company register and therefore repeats that domain's stored
  // snapshot. Repeating a stored reading measures nothing. Everything else on
  // an unmeasured host must be null across the board.
  const REUSES_SNAPSHOT = new Set(['gb-companies-house-disqualified-directors']);
  for (const r of NEW) {
    for (const k of ['authorityScore', 'estimatedTraffic', 'referringDomains']) {
      assert.strictEqual(r[k], null, `${r.id} carries ${k} = ${r[k]}`);
    }
    if (!REUSES_SNAPSHOT.has(r.id)) {
      assert.strictEqual(r.domainRating, null, `${r.id} carries domainRating = ${r.domainRating}`);
      assert.strictEqual(r.metricStatus, 'unknown', r.id);
      assert.deepStrictEqual(r.metricsProvenance, {}, r.id);
      continue;
    }
    const p = r.metricsProvenance.domainRating;
    assert.ok(p, `${r.id} claims a reused snapshot but carries no provenance`);
    assert.strictEqual(p.status, 'historicalSnapshot', `${r.id} presents its snapshot as current`);
    assert.strictEqual(p.measuredDomain, S.normaliseDomain(r.website),
      `${r.id} carries a snapshot measured on another domain`);
    const source = UK.find((o) => o.id !== r.id
      && (o.metricsProvenance || {}).domainRating
      && o.metricsProvenance.domainRating.measuredDomain === p.measuredDomain);
    assert.ok(source, `${r.id} has no prior record to have reused a snapshot from`);
    assert.strictEqual(r.domainRating, source.domainRating, 'reused value differs from the stored one');
    assert.deepStrictEqual(p, source.metricsProvenance.domainRating, 'reused provenance differs');
  }
  assert.deepStrictEqual(S.sharedDomainSnapshotProblems(ALL), []);
});

test('the pre-existing UK records keep their research and their snapshots', () => {
  const ch = byId.get('gb-companies-house');
  assert.strictEqual(ch.domainRating, 92, 'Companies House Domain Rating was altered');
  assert.strictEqual(ch.lastVerified, '2026-08-04', 'Companies House was re-dated');
  const cqc = byId.get('gb-cqc');
  assert.strictEqual(cqc.domainRating, 90, 'CQC Domain Rating was altered');
  assert.strictEqual(cqc.lastVerified, '2026-08-04', 'CQC was re-dated');
  assert.strictEqual(cqc.petroHrysScore, 89, 'CQC score was altered');
  const fca = byId.get('gb-fca-register');
  assert.strictEqual(fca.domainRating, null, 'the FCA record gained a Domain Rating');
});

// --- duplicate control ----------------------------------------------------------

test('no two UK records share a host, and none duplicates a published register', () => {
  const hosts = new Map();
  for (const r of UK) {
    const host = S.normaliseDomain(r.website);
    assert.ok(!hosts.has(host) || r.resourceIdentity,
      `${r.id} shares ${host} with ${hosts.get(host)} without declaring a resourceIdentity`);
    hosts.set(host, r.id);
  }
  // And no record may point at Companies House, the FCA Register or the CQC.
  for (const anchor of ['gb-companies-house', 'gb-fca-register', 'gb-cqc']) {
    const a = byId.get(anchor);
    for (const r of UK) {
      if (r.id === anchor) continue;
      assert.ok(S.urlsAreMateriallyDifferent(r.website, a.website),
        `${r.id} points at the same system as ${anchor}`);
    }
  }
});

test('relations resolve and are territorially meaningful', () => {
  const ids = new Set(ALL.map((r) => r.id));
  let related = 0;
  for (const r of NEW) {
    for (const kind of S.RELATION_KINDS) {
      for (const target of r.related[kind]) {
        assert.ok(ids.has(target), `${r.id} relates to unknown record "${target}"`);
        assert.notStrictEqual(target, r.id, `${r.id} relates to itself`);
        related += 1;
      }
    }
  }
  assert.ok(related >= 15, `only ${related} relations across the wave`);
});

// --- the country page ------------------------------------------------------------

test('the UK page groups UK-wide, Constituent countries and Cross-territory in that order', () => {
  const groups = c.jurisdictionGroups(UK, 'united-kingdom');
  assert.ok(groups, 'the UK page is not grouped');
  assert.deepStrictEqual(groups.map((g) => g.label),
    ['UK-wide', 'Constituent countries', 'Cross-territory jurisdictions']);
  // England, Scotland, Wales and Northern Ireland must share ONE group, because
  // the vocabulary gives `country` and `province` the same label and two boxes
  // with one heading would invent a distinction.
  const constituent = groups.find((g) => g.label === 'Constituent countries');
  const types = new Set(constituent.items.map((d) => d.jurisdiction.type));
  assert.ok(types.has('country') && types.has('province'),
    'the constituent group does not merge country and province');
  for (const d of groups.find((g) => g.label === 'Cross-territory jurisdictions').items) {
    assert.strictEqual(d.jurisdiction.type, 'cross-territory', `${d.id} is in the wrong group`);
  }
  for (const d of groups.find((g) => g.label === 'UK-wide').items) {
    assert.strictEqual(d.jurisdiction, null, `${d.id} is UK-wide but carries a jurisdiction`);
  }
});

test('counts on the UK page derive from the records', () => {
  const groups = c.jurisdictionGroups(UK, 'united-kingdom');
  const rendered = [...PAGE.matchAll(/bd-jgroup-count">(\d+) registr/g)].map((m) => Number(m[1]));
  assert.deepStrictEqual(rendered, groups.map((g) => g.count));
  assert.strictEqual((PAGE.match(/class="bd-row"/g) || []).length, UK.length);
  assert.strictEqual(rendered.reduce((a, b) => a + b, 0), UK.length);
});

test('every UK record reaches the UK page and no constituent-country route exists', () => {
  for (const r of UK) {
    assert.ok(PAGE.includes(`/research/business-directories/united-kingdom/${r.slug}/`),
      `${r.id} does not appear on the UK page`);
  }
  const dir = path.join(ROOT, 'research/business-directories/united-kingdom');
  const slugs = new Set(UK.map((r) => r.slug));
  for (const name of fs.readdirSync(dir)) {
    if (!fs.statSync(path.join(dir, name)).isDirectory()) continue;
    if (name === 'categories') continue;
    assert.ok(slugs.has(name), `unexpected route /united-kingdom/${name}/ — no jurisdiction routes may exist`);
  }
});

test('a cross-territory page names its covered territories, not an array', () => {
  for (const r of CROSS) {
    const html = fs.readFileSync(
      path.join(ROOT, 'research/business-directories/united-kingdom', r.slug, 'index.html'), 'utf8');
    assert.ok(html.includes(r.jurisdiction.name), `${r.id} page never names ${r.jurisdiction.name}`);
    for (const code of r.jurisdiction.covers) {
      const sub = ISO.subdivision(code).name.replace(/\s*\[[^\]]*\]\s*/g, '').trim();
      assert.ok(html.includes(sub), `${r.id} page never names covered territory ${sub}`);
    }
    // Machine identity must never reach a page.
    assert.ok(!html.includes('["GB-'), `${r.id} page renders a raw covers array`);
    assert.ok(!html.includes('cross-territory'), `${r.id} page renders the raw jurisdiction type`);
  }
});

test('every UK detail page is generated, indexable and carries its territory', () => {
  for (const r of UK) {
    const file = path.join(ROOT, 'research/business-directories/united-kingdom', r.slug, 'index.html');
    assert.ok(fs.existsSync(file), `${r.id} has no detail page`);
    const html = fs.readFileSync(file, 'utf8');
    assert.ok(/rel="canonical" href="https:\/\/petrohrys\.com/.test(html), `${r.id} has no canonical`);
    assert.ok(!/noindex/.test(html), `${r.id} is noindex`);
    if (r.jurisdiction && r.jurisdiction.code) {
      assert.ok(html.includes(r.jurisdiction.code), `${r.id} page never shows ${r.jurisdiction.code}`);
    }
  }
});

test('titles and descriptions are unique across the UK set', () => {
  const titles = new Map();
  const descriptions = new Map();
  for (const r of UK) {
    assert.ok(!descriptions.has(r.description), `${r.id} repeats the description of ${descriptions.get(r.description)}`);
    descriptions.set(r.description, r.id);
    const file = path.join(ROOT, 'research/business-directories/united-kingdom', r.slug, 'index.html');
    const html = fs.readFileSync(file, 'utf8');
    const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [, ''])[1];
    assert.ok(title.trim(), `${r.id} has no title`);
    assert.ok(!titles.has(title), `${r.id} repeats the page title of ${titles.get(title)}`);
    titles.set(title, r.id);
  }
});
