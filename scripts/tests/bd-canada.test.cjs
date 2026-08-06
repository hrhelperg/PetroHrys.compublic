// scripts/tests/bd-canada.test.cjs
'use strict';

// Canada inverts the Australian trap. In Australia company registration is
// FEDERAL and a state company register would be a factual error; in Canada
// incorporation is genuinely BOTH federal and provincial, so a provincial
// company register is correct and the error runs the other way — implying that
// a provincial registration establishes federal incorporation, or that the
// federal register covers provincially incorporated bodies.
//
// Three Canada-specific facts are load-bearing and are asserted here because
// they are the ones a later wave is most likely to "helpfully" undo:
//
//   Alberta   — no government-operated public corporate search exists. Searches
//               are delivered through private registry agents for a fee. No
//               record may invent one or substitute another source for it.
//   Saskatchewan — delivered through Information Services Corporation, a
//               commercial operator, but the underlying registry is statutory.
//               Alberta and Saskatchewan are NOT the same case and must not be
//               collapsed into one another.
//   MRAS      — a cross-registry search interface, never the legal source of
//               record, and never a substitute for a provincial register.

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
const CA = loadRegistry().directories.filter((r) => r.country === 'canada');
// Wave 1B.8 added commercial directories to Canada. Assertions about registry
// types, notApplicable submission and the publicAccess block belong to statutory
// registers only; prose and link-safety guards keep sweeping all of CA.
const REG = CA.filter((r) => S.isGovernmentPillar(r));
const SUB = CA.filter((r) => r.jurisdiction);
const FEDERAL = REG.filter((r) => !r.jurisdiction);
const PAGE = fs.readFileSync(path.join(ROOT, 'research/business-directories/canada/index.html'), 'utf8');

const byId = new Map(CA.map((r) => [r.id, r]));

// ca-corporations-canada predates this wave and was authored under an earlier
// contract. It is deliberately left byte-for-byte untouched, so the record
// contract below is scoped to what Wave 1C-2 published.
const PRE_EXISTING = new Set(['ca-corporations-canada']);
const NEW = REG.filter((r) => !PRE_EXISTING.has(r.id));

// --- shape ------------------------------------------------------------------

test('the wave produced a real Canadian federal, provincial and territorial layer', () => {
  assert.ok(CA.length >= 15, `only ${CA.length} Canadian records`);
  assert.ok(SUB.length >= 10, `only ${SUB.length} subnational records`);
  assert.ok(FEDERAL.length >= 5, `only ${FEDERAL.length} federal records`);
  // Nine of the thirteen Canadian subdivisions carry a record. The four that do
  // not are a researched outcome, not an oversight: Alberta has no government
  // public search at all, and New Brunswick, Prince Edward Island and Yukon
  // refused every request. All four are recorded in the verification backlog.
  const covered = new Set(SUB.map((r) => r.jurisdiction.code));
  assert.ok(covered.size >= 9, `only ${covered.size} subdivisions covered`);
  for (const code of ['CA-AB', 'CA-NB', 'CA-PE', 'CA-YT']) {
    assert.ok(!covered.has(code), `${code} gained a record without its blocker being resolved`);
  }
});

test('every Canadian subdivision code is real and belongs to Canada', () => {
  const VALID = new Set(['CA-AB', 'CA-BC', 'CA-MB', 'CA-NB', 'CA-NL', 'CA-NS', 'CA-NT',
    'CA-NU', 'CA-ON', 'CA-PE', 'CA-QC', 'CA-SK', 'CA-YT']);
  for (const r of SUB) {
    const j = r.jurisdiction;
    assert.strictEqual(S.iso3166_2Problem(j.code), null, `${r.id} code ${j.code} is malformed`);
    assert.strictEqual(ISO.unknownCodeProblem(j.code), null, `${r.id} code ${j.code} is not a real code`);
    assert.ok(VALID.has(j.code), `${r.id} uses ${j.code}, which is not a Canadian province or territory`);
    assert.strictEqual(ISO.countryOf(j.code), 'CA', `${r.id} code ${j.code} is not Canadian`);
    assert.strictEqual(j.parentCountry, 'canada', `${r.id} parentCountry is ${j.parentCountry}`);
    assert.strictEqual(r.scope, 'subnational', `${r.id} scope is ${r.scope}`);
    assert.strictEqual(j.covers, null, `${r.id} carries covers; no Canadian jurisdiction spans subdivisions`);
  }
});

test('the three territories are territories and the ten provinces are provinces', () => {
  // Filing Nunavut, the Northwest Territories or Yukon as a province would put
  // them in the wrong group on the country page and misdescribe the federation.
  const TERRITORIES = new Set(['CA-NT', 'CA-NU', 'CA-YT']);
  for (const r of SUB) {
    const { code, type, name } = r.jurisdiction;
    const expected = TERRITORIES.has(code) ? 'territory' : 'province';
    assert.strictEqual(type, expected, `${r.id}: ${code} is filed as ${type}, expected ${expected}`);
    assert.strictEqual(name, ISO.subdivision(code).name,
      `${r.id} names ${code} "${name}"; ISO 3166-2 calls it "${ISO.subdivision(code).name}"`);
  }
});

test('a federal record carries no jurisdiction and a subnational record always does', () => {
  for (const r of FEDERAL) {
    assert.strictEqual(r.jurisdiction, null, `${r.id} is federal but carries a jurisdiction`);
    assert.strictEqual(r.scope, 'national', `${r.id} is federal but scope is ${r.scope}`);
  }
});

// --- the three load-bearing Canadian facts -----------------------------------

test('no record invents an Alberta government corporate search', () => {
  // Alberta delivers all corporate searches through private registry agents.
  // A record filed under CA-AB claiming a government-operated public search
  // would be factually wrong about Alberta, not merely misfiled.
  const alberta = SUB.filter((r) => r.jurisdiction.code === 'CA-AB');
  for (const r of alberta) {
    assert.fail(`${r.id} publishes an Alberta jurisdiction record; Alberta has no `
      + 'government-operated public corporate search. Document the absence, do not invent a registry.');
  }
  // And nothing anywhere may assert that one exists.
  for (const r of CA) {
    const prose = [r.description, r.editorNotes, ...r.pros, ...r.cons].join(' ');
    assert.ok(!/Alberta[^.]*\b(?:free|public)\b[^.]*\b(?:corporate search|corporate registry search)\b/i.test(prose),
      `${r.id} implies Alberta offers a free or public corporate search`);
  }
});

test('Saskatchewan is recorded as a statutory registry with a commercial operator, not as Alberta', () => {
  const sk = byId.get('ca-sk-isc-corporate-registry');
  assert.ok(sk, 'the Saskatchewan corporate registry record is missing');
  assert.strictEqual(sk.jurisdiction.code, 'CA-SK');
  // The registry is statutory: it is a company register, not a directory.
  assert.ok(sk.registryTypes.includes('company-register'),
    'Saskatchewan must remain a company-register; the underlying registry is statutory');
  assert.strictEqual(sk.submissionModel, 'notApplicable');
  // The operator is commercial, and that must be visible rather than smoothed over.
  assert.strictEqual(sk.operator.type, 'other',
    'Information Services Corporation is a commercial operator, not a government agency');
  assert.match(sk.editorNotes, /Information Services Corporation/,
    'the Saskatchewan record must name its operator in editorNotes');
  // The distinction from Alberta must be stated, not left to the reader.
  assert.match(sk.editorNotes, /Alberta/,
    'the Saskatchewan record must state how it differs from Alberta');
  assert.match([sk.description, ...sk.cons, sk.editorNotes].join(' '), /commercial/i,
    'the Saskatchewan record must say the operator is commercial');

  // And it must never be described as government-operated. The phrase is only
  // permitted in the clause explaining that ALBERTA has no such search — which
  // is the very distinction this record exists to keep visible.
  const sentences = [sk.description, ...sk.pros, ...sk.cons, sk.editorNotes]
    .join(' ').split(/(?<=[.!?])\s+/);
  for (const s of sentences) {
    if (!/government-operated|operated by (?:the )?government/i.test(s)) continue;
    assert.ok(/Alberta/.test(s) && /\bno\b/.test(s),
      `the Saskatchewan record describes government operation outside the Alberta contrast: ${s}`);
  }
});

test('MRAS is a registry interface and never the legal source of record', () => {
  const mras = byId.get('ca-mras-canadian-business-registry');
  assert.ok(mras, 'the MRAS record is missing');
  assert.strictEqual(mras.primaryRegistryType, 'cross-border-registry-interface',
    'MRAS must be classified as a cross-border-registry-interface');
  assert.deepStrictEqual(mras.registryTypes, ['cross-border-registry-interface'],
    'MRAS is only an interface; adding a register type would claim it holds records');
  // It must say, in published prose, that it is not the register of record.
  const prose = [mras.description, ...mras.cons].join(' ');
  assert.match(prose, /not (?:itself )?(?:a|the) (?:register|legal source) of record/i,
    'MRAS must state in published prose that it is not the source of record');
  // No other record may point at MRAS as an alternative to a real register.
  for (const r of CA) {
    assert.ok(!r.related.alternatives.includes('ca-mras-canadian-business-registry'),
      `${r.id} lists MRAS as an alternative; an interface never replaces a register`);
  }
});

test('the parked businessregistries.ca domain is never used as an official URL', () => {
  // businessregistries.ca is a commercial domain-sale page with no government
  // connection. The official entry point is canadasbusinessregistries.ca. The
  // near-miss is recorded in editorNotes as a warning — which is the point —
  // so only the fields that actually send a reader somewhere are checked.
  // Commercial directories carry no publicAccess block, and this guard must keep
  // sweeping them: a commercial record linking to a parked lookalike domain is
  // exactly as harmful as a register doing it.
  const linkFields = (r) => [r.website, r.submissionUrl, (r.publicAccess || {}).searchUrl,
    r.operator.officialUrl].filter(Boolean);
  for (const r of CA) {
    for (const url of linkFields(r)) {
      const host = new URL(url).hostname.replace(/^www\./, '');
      assert.notStrictEqual(host, 'businessregistries.ca',
        `${r.id} links to businessregistries.ca, which is a parked commercial domain`);
    }
  }
  const mras = byId.get('ca-mras-canadian-business-registry');
  assert.match(mras.website, /^https:\/\/canadasbusinessregistries\.ca\//);
  assert.match(mras.editorNotes, /businessregistries\.ca/,
    'the negative finding about the parked domain must stay recorded');
});

// --- the Canadian federal/provincial boundary --------------------------------

test('no provincial or territorial record claims to establish federal incorporation', () => {
  // The Canadian error is the inverse of the Australian one: incorporation is
  // genuinely both federal and provincial, so the risk is conflating them.
  for (const r of SUB) {
    const prose = [r.description, ...r.pros].join(' ');
    assert.ok(!/establishes? federal incorporation/i.test(prose),
      `${r.id} claims to establish federal incorporation`);
  }
});

test('every subnational corporate register says what it does not establish', () => {
  const corporate = SUB.filter((r) => r.registryTypes.includes('company-register'));
  assert.ok(corporate.length >= 6, `only ${corporate.length} subnational corporate registers`);
  for (const r of corporate) {
    const prose = [...r.cons, ...r.notRecommendedFor].join(' ');
    assert.match(prose, /federal incorporation|Corporations Canada/i,
      `${r.id} never says that it does not establish federal incorporation`);
  }
});

test('no record duplicates the federal corporation search', () => {
  const federalSearch = byId.get('ca-corporations-canada');
  assert.ok(federalSearch, 'the pre-existing federal corporation search record is missing');
  for (const r of CA) {
    if (r.id === federalSearch.id) continue;
    assert.ok(S.urlsAreMateriallyDifferent(r.website, federalSearch.website),
      `${r.id} points at the federal corporation search already published as ${federalSearch.id}`);
  }
});

test('the pre-existing federal record kept its research and its snapshot', () => {
  // Wave 1C appends; it does not re-author published research. The single
  // permitted change is the shared-host declaration the architecture requires
  // once a second statutory system is published on the same official host.
  const r = byId.get('ca-corporations-canada');
  assert.strictEqual(r.lastVerified, '2026-08-04', 'the pre-existing record was re-dated');
  assert.strictEqual(r.petroHrysScore, 88, 'the pre-existing score was altered');
  assert.strictEqual(r.domainRating, 92, 'the pre-existing Domain Rating value was altered');
  assert.deepStrictEqual(r.metricsProvenance.domainRating, {
    provider: 'Ahrefs',
    measuredAt: '2026-08-04',
    status: 'historicalSnapshot',
    measuredDomain: 'ised-isde.canada.ca',
  }, 'the pre-existing Domain Rating provenance was altered');
  assert.strictEqual(r.website, 'https://ised-isde.canada.ca/cc/lgcy/fdrlCrpSrch.html');
  assert.strictEqual(r.primaryRegistryType, 'company-register');
  // The one addition, and it must be exactly the shared-host declaration.
  assert.deepStrictEqual(r.resourceIdentity, {
    canonicalDomain: 'ised-isde.canada.ca',
    systemKey: 'corporations-canada-federal-corporation-search',
    sharedHostGroup: 'ised-isde-canada',
  });
});

test('the trademark database reuses the domain snapshot rather than measuring one', () => {
  const tm = byId.get('ca-cipo-trademarks-database');
  const corp = byId.get('ca-corporations-canada');
  assert.ok(tm, 'the Canadian Trademarks Database record is missing');

  // Same measured domain, therefore the same dated snapshot, field for field.
  assert.strictEqual(S.normaliseDomain(tm.website), 'ised-isde.canada.ca');
  assert.strictEqual(tm.domainRating, corp.domainRating);
  assert.deepStrictEqual(tm.metricsProvenance.domainRating, corp.metricsProvenance.domainRating);
  assert.strictEqual(tm.metricsProvenance.domainRating.status, 'historicalSnapshot',
    'a reused snapshot must never be presented as current');
  assert.strictEqual(tm.metricsProvenance.domainRating.measuredAt, '2026-08-04',
    'the measurement date must not be refreshed on reuse');
  assert.deepStrictEqual(S.sharedDomainSnapshotProblems(CA), []);

  // Both declare the shared host, with distinct system keys.
  assert.strictEqual(tm.resourceIdentity.sharedHostGroup, corp.resourceIdentity.sharedHostGroup);
  assert.notStrictEqual(tm.resourceIdentity.systemKey, corp.resourceIdentity.systemKey);

  // And the page must not let the domain number read as page-level authority.
  const html = fs.readFileSync(
    path.join(ROOT, 'research/business-directories/canada', tm.slug, 'index.html'), 'utf8');
  assert.ok(html.includes('not an assessment of this individual registry page'),
    'the detail page does not say the Domain Rating describes the domain rather than the page');
});

test('the trademark register and the corporation register stay distinct systems', () => {
  const tm = byId.get('ca-cipo-trademarks-database');
  const corp = byId.get('ca-corporations-canada');

  assert.ok(S.urlsAreMateriallyDifferent(tm.website, corp.website), 'same search URL');
  assert.notStrictEqual(tm.primaryRegistryType, corp.primaryRegistryType);
  assert.ok(!tm.registryTypes.includes('company-register'),
    'a trademark register is not a company register');
  assert.notStrictEqual(tm.operator.name, corp.operator.name);
  assert.notStrictEqual(tm.publicAccess.searchUrl, corp.publicAccess.searchUrl);

  // Trademark registration must never be implied to establish company status.
  const prose = [tm.description, ...tm.pros, ...tm.bestFor].join(' ');
  assert.ok(!/establishes?[^.]*\b(?:company|corporate|business)\b[^.]*\b(?:status|existence|registration)\b/i.test(prose),
    'the trademark record implies it establishes company status');
  const caveats = [...tm.cons, ...tm.notRecommendedFor].join(' ');
  assert.match(caveats, /not businesses|company legally exists|corporate-registry question/i,
    'the trademark record never says it does not establish company existence');
  assert.match(caveats, /legitimacy|standing/i,
    'the trademark record never disclaims business legitimacy');
});

test('a record sharing an official host declares a resourceIdentity', () => {
  const byHost = new Map();
  for (const r of CA) {
    const host = new URL(r.website).hostname.replace(/^www\./, '');
    if (!byHost.has(host)) byHost.set(host, []);
    byHost.get(host).push(r);
  }
  for (const [host, rs] of byHost) {
    if (rs.length < 2) continue;
    for (const r of rs) {
      assert.ok(r.resourceIdentity,
        `${r.id} shares ${host} with ${rs.length - 1} other(s) and declares no resourceIdentity`);
    }
  }
});

// --- record contract ---------------------------------------------------------

test('every Canadian record meets the publication contract', () => {
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
    assert.ok(r.publicAccess, `${r.id} has no publicAccess`);
    assert.ok(S.ACCESS_LEVELS.includes(r.publicAccess.accessLevel), `${r.id} access level invalid`);
    assert.deepStrictEqual(S.accessContradictions(r.publicAccess), [], `${r.id} access contradiction`);
    assert.strictEqual(r.verification.status, 'verified', `${r.id} is not verified`);
    assert.ok(r.verification.source, `${r.id} has no verification source`);
    assert.ok(r.verification.reviewers.length > 0, `${r.id} has no reviewer`);
    assert.match(r.lastVerified, /^\d{4}-\d{2}-\d{2}$/, `${r.id} has no verification date`);
    assert.ok(r.description.length > 100, `${r.id} description is thin`);
    assert.ok(r.pros.length > 0 && r.cons.length > 0, `${r.id} has no assessment`);
    assert.ok(r.bestFor.length > 0 || r.notRecommendedFor.length > 0, `${r.id} has no audience guidance`);
    assert.strictEqual(S.computeScore(r.scoreFactors), r.petroHrysScore, `${r.id} score does not reproduce`);
    assert.strictEqual(r.nextVerification, S.nextVerificationFor(r), `${r.id} verification date was hand-set`);
  }
});

test('every Canadian statutory register is notApplicable for submission', () => {
  for (const r of REG) {
    assert.strictEqual(r.submissionModel, 'notApplicable',
      `${r.id} is "${r.submissionModel}"; a filing or certificate fee is not a paid directory listing`);
  }
});

test('no record added by this wave carries a newly measured metric', () => {
  // Domain Rating collection is frozen: no record added here may introduce a
  // NEW measurement. Exactly one added record carries a Domain Rating at all —
  // the trademark database — and it does so by repeating the snapshot already
  // held for its own domain, which measures nothing. Everything else is null.
  const REUSES_SNAPSHOT = new Set(['ca-cipo-trademarks-database']);
  for (const r of NEW) {
    // No metric other than Domain Rating is ever published.
    for (const k of ['authorityScore', 'estimatedTraffic', 'referringDomains']) {
      assert.strictEqual(r[k], null, `${r.id} carries ${k} = ${r[k]}`);
    }
    if (!REUSES_SNAPSHOT.has(r.id)) {
      assert.strictEqual(r.domainRating, null, `${r.id} carries domainRating = ${r.domainRating}`);
      assert.strictEqual(r.metricStatus, 'unknown', r.id);
      assert.deepStrictEqual(r.metricsProvenance, {}, r.id);
      continue;
    }
    // The reusing record must be reusing, not measuring: its snapshot has to be
    // identical to one another record already holds for the same domain.
    const p = r.metricsProvenance.domainRating;
    assert.ok(p, `${r.id} claims a reused snapshot but carries no provenance`);
    assert.strictEqual(p.status, 'historicalSnapshot', `${r.id} presents its snapshot as current`);
    assert.strictEqual(p.measuredDomain, S.normaliseDomain(r.website),
      `${r.id} carries a snapshot measured on another domain`);
    const source = CA.find((o) => o.id !== r.id
      && (o.metricsProvenance || {}).domainRating
      && o.metricsProvenance.domainRating.measuredDomain === p.measuredDomain);
    assert.ok(source, `${r.id} has no prior record to have reused a snapshot from`);
    assert.strictEqual(r.domainRating, source.domainRating);
    assert.deepStrictEqual(p, source.metricsProvenance.domainRating);
    assert.ok(source.lastVerified <= r.lastVerified,
      'the snapshot source must predate the record reusing it');
  }
});

test('an access claim is carried by the access block', () => {
  for (const r of REG) {
    const pa = r.publicAccess;
    const assertions = [r.description, ...r.pros, ...r.cons]
      .flatMap((v) => v.split(/(?<=[.!?])\s+/))
      .filter((x) => !/\b(?:whether|not state|no official page|unknown|cannot be established|not established|was not)\b/i.test(x))
      .join(' ');
    if (/can be searched free of charge|is published free of charge/.test(assertions)) {
      assert.strictEqual(pa.freeToSearch, true, `${r.id} claims free access, freeToSearch is ${pa.freeToSearch}`);
    }
    if (/without an account/.test(assertions)) {
      assert.strictEqual(pa.loginRequired, false, `${r.id} claims no account, loginRequired is ${pa.loginRequired}`);
    }
    if (pa.searchUrl === null && /\bcan be searched\b/.test(assertions)) {
      assert.fail(`${r.id} has no searchUrl but says it can be searched`);
    }
  }
});

test('an unverified access posture stays null rather than becoming a confident false', () => {
  // Where a host refused the request or rendered only through scripts, the
  // honest record is null. A false would assert an absence we never observed.
  for (const r of NEW) {
    const pa = r.publicAccess;
    if (pa.accessLevel !== 'unknown') continue;
    for (const k of ['freeToSearch', 'loginRequired', 'identityVerificationRequired', 'captcha', 'geographicRestriction']) {
      assert.strictEqual(pa[k], null,
        `${r.id} has accessLevel unknown but asserts ${k} = ${pa[k]}`);
    }
    assert.ok(pa.notes && pa.notes.trim(), `${r.id} is unknown but explains nothing`);
  }
});

test('no published Canadian field carries a research note or a placeholder', () => {
  for (const r of NEW) {
    const published = [r.name, r.description, ...r.pros, ...r.cons, ...r.bestFor, ...r.notRecommendedFor];
    for (const v of published) {
      assert.ok(!/\bTODO\b|\bTBD\b|\bFIXME\b|Pending Manual Verification|\[.*?\]/i.test(v),
        `${r.id} publishes a research note: ${JSON.stringify(v)}`);
      assert.ok(!/https?:\/\//.test(v), `${r.id} publishes a bare URL in prose: ${JSON.stringify(v)}`);
    }
  }
});

test('relations are specific and resolve to real records', () => {
  const ids = new Set(loadRegistry().directories.map((r) => r.id));
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
  assert.ok(related >= 12, `only ${related} relations across the wave`);
});

test('an editorial translation is declared as one and an official title is not', () => {
  for (const r of NEW) {
    if (!r.englishName) continue;
    assert.ok(S.ENGLISH_NAME_SOURCES.includes(r.englishNameSource),
      `${r.id} carries an English title with no declared source`);
  }
  // The Quebec register's English title is the government's own; the RBQ
  // licence-holder register's is ours. Getting these the wrong way round
  // misattributes a name to an institution that never published it.
  assert.strictEqual(byId.get('ca-qc-enterprise-register').englishNameSource, 'official');
  assert.strictEqual(byId.get('ca-qc-rbq-licence-holders').englishNameSource, 'editorial-translation');
});

// --- the country page ---------------------------------------------------------

test('the Canada page groups Federal, Provinces and Territories in that order', () => {
  const groups = c.jurisdictionGroups(CA, 'canada');
  assert.ok(groups, 'the Canada page is not grouped');
  assert.deepStrictEqual(groups.map((g) => g.label), ['Federal', 'Provinces', 'Territories']);
  const provinces = groups.find((g) => g.key === 'province');
  const names = provinces.items.map((d) => d.jurisdiction.name);
  assert.deepStrictEqual(names, [...names].sort(), 'provinces are not in A-Z order');
  for (const d of groups.find((g) => g.key === 'territory').items) {
    assert.strictEqual(d.jurisdiction.type, 'territory',
      `${d.id} is in Territories but is a ${d.jurisdiction.type}`);
  }
  for (const d of groups.find((g) => g.key === 'national').items) {
    assert.strictEqual(d.jurisdiction, null, `${d.id} is federal but carries a jurisdiction`);
  }
});

test('counts on the Canada page derive from the records', () => {
  const groups = c.jurisdictionGroups(CA, 'canada');
  const rendered = [...PAGE.matchAll(/bd-jgroup-count">(\d+) registr/g)].map((m) => Number(m[1]));
  assert.deepStrictEqual(rendered, groups.map((g) => g.count));
  assert.strictEqual((PAGE.match(/class="bd-row"/g) || []).length, CA.length);
  assert.strictEqual(rendered.reduce((a, b) => a + b, 0), CA.length);
});

test('every published Canadian record reaches the Canada page', () => {
  for (const r of CA) {
    assert.ok(PAGE.includes(`/research/business-directories/canada/${r.slug}/`),
      `${r.id} does not appear on the Canada page`);
  }
});

test('no province or territory landing route was created', () => {
  // The jurisdiction model states that no jurisdiction route family exists.
  const dir = path.join(ROOT, 'research/business-directories/canada');
  const slugs = new Set(CA.map((r) => r.slug));
  for (const name of fs.readdirSync(dir)) {
    if (!fs.statSync(path.join(dir, name)).isDirectory()) continue;
    if (name === 'categories') continue;
    assert.ok(slugs.has(name), `unexpected route /canada/${name}/ — no jurisdiction routes may exist`);
  }
});

// --- coverage manifest --------------------------------------------------------

const COVERAGE = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'data/business-directories/canada-jurisdiction-coverage.json'), 'utf8'));

test('the coverage manifest names every Canadian jurisdiction exactly once', () => {
  const codes = COVERAGE.jurisdictions.map((j) => j.jurisdictionCode);
  assert.strictEqual(codes.length, 13, 'Canada has ten provinces and three territories');
  assert.strictEqual(new Set(codes).size, 13, 'a jurisdiction is listed twice');
  for (const j of COVERAGE.jurisdictions) {
    assert.strictEqual(ISO.unknownCodeProblem(j.jurisdictionCode), null,
      `${j.jurisdictionCode} is not a real code`);
    assert.strictEqual(ISO.countryOf(j.jurisdictionCode), 'CA', `${j.jurisdictionCode} is not Canadian`);
    assert.strictEqual(j.jurisdictionName, ISO.subdivision(j.jurisdictionCode).name,
      `${j.jurisdictionCode} is named "${j.jurisdictionName}" in the manifest`);
  }
});

test('the coverage manifest agrees with the registry', () => {
  // Counting coverage from a record total rather than from this file is how a
  // gap becomes invisible, so the two are cross-checked in both directions.
  const published = new Map(SUB.map((r) => [r.jurisdiction.code, r.id]));
  for (const j of COVERAGE.jurisdictions) {
    if (j.publicationStatus === 'published') {
      assert.ok(j.recordId, `${j.jurisdictionCode} is published with no recordId`);
      assert.ok(byId.has(j.recordId), `${j.jurisdictionCode} names unknown record ${j.recordId}`);
      assert.ok(published.has(j.jurisdictionCode),
        `${j.jurisdictionCode} is marked published but no record carries that jurisdiction`);
    } else {
      assert.strictEqual(j.recordId, null, `${j.jurisdictionCode} is unpublished but names a record`);
      assert.ok(!published.has(j.jurisdictionCode),
        `${j.jurisdictionCode} is marked unpublished but a record carries that jurisdiction`);
    }
    assert.ok(j.blockerSummary === null || j.blockerSummary.trim(),
      `${j.jurisdictionCode} has an empty blockerSummary`);
  }
  for (const code of published.keys()) {
    const j = COVERAGE.jurisdictions.find((x) => x.jurisdictionCode === code);
    assert.ok(j, `${code} carries a published record but is absent from the coverage manifest`);
  }
});

test('the manifest totals are counted, not asserted', () => {
  const provinces = COVERAGE.jurisdictions.filter((j) => j.kind === 'province');
  const territories = COVERAGE.jurisdictions.filter((j) => j.kind === 'territory');
  const t = COVERAGE.totals;
  assert.strictEqual(t.provinces, provinces.length);
  assert.strictEqual(t.territories, territories.length);
  assert.strictEqual(t.provincesPublished, provinces.filter((j) => j.publicationStatus === 'published').length);
  assert.strictEqual(t.territoriesPublished, territories.filter((j) => j.publicationStatus === 'published').length);
  assert.strictEqual(t.provincesPending,
    provinces.filter((j) => j.researchStatus === 'pending-manual-verification').length);
  assert.strictEqual(t.territoriesPending,
    territories.filter((j) => j.researchStatus === 'pending-manual-verification').length);
  assert.strictEqual(t.provincesNoPublicRegistry,
    provinces.filter((j) => j.researchStatus === 'no-public-registry').length);
  assert.strictEqual(t.federalPublished, FEDERAL.length);
});

test('Alberta is recorded as an absent registry, never as a fetch blocker', () => {
  // If a later wave downgrades this to waf-blocked, someone will eventually
  // "unblock" it by publishing a private registry agent. That is the failure
  // this assertion exists to prevent.
  const ab = COVERAGE.jurisdictions.find((j) => j.jurisdictionCode === 'CA-AB');
  assert.strictEqual(ab.researchStatus, 'no-public-registry',
    'Alberta has no government public search; that is a finding, not a blocker');
  assert.strictEqual(ab.blockerCode, 'none', 'Alberta is not blocked, it is absent');
  assert.strictEqual(ab.publicationStatus, 'not-published');
  assert.match(ab.blockerSummary, /registry agent/i,
    'the Alberta note must record how searches are actually delivered');
});

test('every Canadian detail page is generated and carries its jurisdiction', () => {
  for (const r of SUB) {
    const file = path.join(ROOT, 'research/business-directories/canada', r.slug, 'index.html');
    assert.ok(fs.existsSync(file), `${r.id} has no detail page`);
    const html = fs.readFileSync(file, 'utf8');
    assert.ok(html.includes(r.jurisdiction.name), `${r.id} page never names ${r.jurisdiction.name}`);
    assert.ok(html.includes(r.jurisdiction.code), `${r.id} page never shows ${r.jurisdiction.code}`);
  }
});
