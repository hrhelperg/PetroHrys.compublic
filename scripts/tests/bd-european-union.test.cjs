// scripts/tests/bd-european-union.test.cjs
'use strict';

// Wave 1F published the European Union layer. Two things make it different from
// every national wave before it, and this file holds both.
//
// 1. THE EU IS NOT A COUNTRY. It is a supranational geography: entityType
//    supranational, iso2 null, scope supranational. Before this wave the hub
//    lifted only `global` out of the national grid and compensated for it by
//    name, so a supranational page could generate, enter the sitemap and have
//    no inbound link anywhere. The orphan test below exists because nothing
//    caught that.
//
// 2. MOST EU-WIDE SYSTEMS SURFACE NATIONAL RECORDS. BRIS interconnects national
//    business registers; VIES queries national VAT databases; the EBA and EIOPA
//    registers compile national authorisation decisions. None of them is the
//    legal source of record, and each must say so where a reader will meet it.
//
// The real-site rule is also pinned here: no record may ship pointing at a
// generic institution homepage, and no record may claim access it did not
// observe.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const S = require('../lib/bd-schema.cjs');
const T = require('../lib/bd-registry-types.cjs');
const { loadRegistry, directoriesFor } = require('../lib/bd-registry.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const REGISTRY = loadRegistry();
const ALL = REGISTRY.directories;
const byId = new Map(ALL.map((r) => [r.id, r]));

const EU = ALL.filter((r) => r.country === 'european-union');
// Wave 1F published the first nine; Wave 1F.1 completed the set with six more.
// This suite covers the whole EU set, so both waves are held to it.
const WAVE = ['eu-bris', 'eu-vies', 'eu-ted', 'eu-transparency-register',
  'eu-esma-credit-rating-agencies', 'eu-eba-credit-institutions-register',
  'eu-eba-payment-institutions-register', 'eu-eiopa-insurance-undertakings', 'eu-edes',
  'eu-euipo-esearch-plus', 'eu-tmview', 'eu-designview', 'eu-eudamed', 'eu-echa-chem',
  'eu-eib-exclusion',
  // Wave 1F.1 taxonomy application
  'eu-ctis', 'eu-giview', 'eu-sanctions-map', 'eu-consolidated-financial-sanctions',
  'eu-pesticides-database'];

const visible = (r) => [r.description, ...r.pros, ...r.cons, ...r.bestFor, ...r.notRecommendedFor].join(' ');
const readPage = (r) => fs.readFileSync(
  path.join(ROOT, 'research', 'business-directories', r.country, r.slug, 'index.html'), 'utf8');

// --- non-vacuity ----------------------------------------------------------------

test('the wave published every record it claims, and the EU set is exactly those', () => {
  assert.strictEqual(WAVE.length, 20, 'the EU manifest changed size without this test changing');
  for (const id of WAVE) assert.ok(byId.get(id), `${id} is named by this suite but is not in the registry`);
  assert.deepStrictEqual(EU.map((r) => r.id).sort(), [...WAVE].sort(),
    'an EU record exists that this suite does not cover');
  assert.ok(EU.length > 0, 'the EU set is empty, which would make every test below vacuous');
});

// --- the EU is a supranational geography, not a country ---------------------------

test('the European Union is modelled as supranational and never as a country', () => {
  const eu = REGISTRY.countries.find((c) => c.slug === 'european-union');
  assert.ok(eu, 'the european-union geography entry is missing');
  assert.strictEqual(eu.entityType, 'supranational', 'the EU is not modelled as supranational');
  assert.strictEqual(eu.iso2, null, 'the EU claims a country code');
  assert.strictEqual(eu.scope, 'supranational', 'the EU does not declare supranational scope');
});

test('every EU record carries supranational scope and no jurisdiction', () => {
  for (const r of EU) {
    assert.strictEqual(r.scope, 'supranational', `${r.id} is scoped ${r.scope}`);
    assert.strictEqual(r.jurisdiction, null, `${r.id} claims a jurisdiction`);
  }
});

test('the EU is not counted among the national countries', () => {
  const national = REGISTRY.countries.filter((c) => c.entityType === 'country');
  assert.ok(!national.some((c) => c.slug === 'european-union'),
    'the EU appears in the national country set');
  // And the hub must not put it in the by-country grid.
  const hub = fs.readFileSync(path.join(ROOT, 'research', 'business-directories', 'index.html'), 'utf8');
  const countriesSection = /id="countries"[\s\S]*?(?=<section|<\/main)/.exec(hub);
  assert.ok(countriesSection, 'the hub has no by-country section');
  assert.ok(!countriesSection[0].includes('european-union'),
    'the EU is rendered inside the by-country grid');
});

// --- the orphan guard: this is the defect Wave 1F had to fix ----------------------

test('no emitted country or scope page is orphaned from the hub', () => {
  const hub = fs.readFileSync(path.join(ROOT, 'research', 'business-directories', 'index.html'), 'utf8');
  const emitted = REGISTRY.countries.filter((c) => directoriesFor(REGISTRY, c.slug).length > 0);
  assert.ok(emitted.length >= 2, 'too few emitted pages for this guard to mean anything');
  let supranationalChecked = 0;
  for (const c of emitted) {
    assert.ok(hub.includes(`/research/business-directories/${c.slug}/`),
      `${c.slug} has a generated page but no inbound link from the hub`);
    if (c.entityType === 'supranational') supranationalChecked++;
  }
  // Non-vacuity: the bug this guards was specific to supranational entries, so
  // the loop must actually have covered at least one that is not `global`.
  assert.ok(supranationalChecked >= 2,
    'the guard did not cover a non-global supranational entry, so it proves nothing');
});

test('an empty supranational geography is not rendered on the hub', () => {
  const hub = fs.readFileSync(path.join(ROOT, 'research', 'business-directories', 'index.html'), 'utf8');
  for (const c of REGISTRY.countries) {
    if (c.entityType !== 'supranational') continue;
    if (directoriesFor(REGISTRY, c.slug).length > 0) continue;
    assert.ok(!hub.includes(`/research/business-directories/${c.slug}/`),
      `${c.slug} has no records but is linked from the hub`);
  }
});

test('the supranational pages carry a visible scope label that is not the raw field', () => {
  for (const slug of ['european-union', 'global']) {
    const file = path.join(ROOT, 'research', 'business-directories', slug, 'index.html');
    const html = fs.readFileSync(file, 'utf8');
    const badge = /<ul class="bd-badges" aria-label="Geographic scope">([\s\S]*?)<\/ul>/.exec(html);
    assert.ok(badge, `${slug} has no geographic scope label`);
    const text = badge[1].replace(/<[^>]+>/g, '').trim();
    assert.ok(Object.values(S.SCOPE_LABELS).includes(text),
      `${slug} label "${text}" is not a published scope label`);
    // The internal field name must never reach the page.
    assert.ok(!html.replace(/<[^>]+>/g, ' ').includes('entityType'),
      `${slug} leaks the entityType field`);
    // The label sits beside the heading, not inside it.
    const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html);
    assert.ok(h1 && !h1[1].includes('bd-badge'), `${slug} put the label inside the H1`);
  }
  assert.strictEqual(
    /<ul class="bd-badges" aria-label="Geographic scope">([\s\S]*?)<\/ul>/
      .exec(fs.readFileSync(path.join(ROOT, 'research', 'business-directories', 'european-union', 'index.html'), 'utf8'))[1]
      .replace(/<[^>]+>/g, '').trim(),
    'Supranational', 'the EU label does not read Supranational');
});

// --- source of record versus access interface -------------------------------------

test('an EU system that surfaces national records never claims to constitute them', () => {
  // BRIS interconnects national business registers. Typing it as a company
  // register would be the same error Wave 1D corrected for three countries.
  const bris = byId.get('eu-bris');
  for (const forbidden of ['company-register', 'business-entity-register']) {
    assert.ok(!bris.registryTypes.includes(forbidden), `BRIS is typed ${forbidden}`);
  }
  assert.strictEqual(bris.primaryRegistryType, 'cross-border-registry-interface');
  // The description is what a reader meets first, so the claim must be right
  // there and not merely somewhere in the record.
  assert.ok(!/\bis the (?:European |EU )?company register\b/i.test(bris.description),
    'the BRIS description calls it a company register');
  assert.match(bris.description, /national registers|member states/i,
    'the BRIS description never locates the records with the member states');
  // And the limitation must appear where limitations are read, not only in prose
  // a reader may never reach.
  const limits = [...bris.cons, ...bris.notRecommendedFor].join(' ');
  assert.match(limits, /not a register|does not constitute|establishes nothing/i,
    'the BRIS cons never say it is not the register');
  assert.match(limits, /national/i,
    'the BRIS cons never point a reader at the national registers');
});

test('VIES is not presented as proof of incorporation or standing', () => {
  const vies = byId.get('eu-vies');
  assert.strictEqual(vies.primaryRegistryType, 'tax-verification-system');
  for (const forbidden of ['company-register', 'business-entity-register', 'corporate-number-database']) {
    assert.ok(!vies.registryTypes.includes(forbidden), `VIES is typed ${forbidden}`);
  }
  const text = visible(vies);
  assert.match(text, /not a company registration|does not touch any company register|is not a company/i,
    'the VIES page never separates a VAT number from company registration');
  assert.match(text, /solven|incorporat/i, 'the VIES page never disclaims incorporation or solvency');
  // An invalid result must not be presented as proof of anything.
  assert.match(text, /several possible causes|not by itself evidence|can mean/i,
    'the VIES page treats an invalid result as conclusive');
});

test('the compiled supervisory registers name the national authority as the source', () => {
  for (const id of ['eu-eba-credit-institutions-register', 'eu-eba-payment-institutions-register',
    'eu-eiopa-insurance-undertakings']) {
    const r = byId.get(id);
    const legal = /LEGAL SOURCE OF RECORD: (.*?) RESPONSIBLE AUTHORITY:/s.exec(r.editorNotes);
    assert.ok(legal, `${id} has no legal-source clause`);
    assert.match(legal[1], /national/i, `${id} does not name the national authority as the source`);
    assert.match(visible(r), /national/i, `${id} never mentions national authorities to a reader`);
  }
  // ESMA's CRA list is the deliberate contrast: ESMA is the direct supervisor,
  // so it IS the source of record. If that flipped, the distinction is lost.
  const cra = byId.get('eu-esma-credit-rating-agencies');
  assert.match(cra.editorNotes, /LEGAL SOURCE OF RECORD: ESMA itself/,
    'the ESMA CRA record no longer records ESMA as the source of record');
});

// --- the real-site rule -----------------------------------------------------------

test('no record points at a generic institution homepage', () => {
  const bare = new Set(['europa.eu', 'ec.europa.eu', 'commission.europa.eu', 'european-union.europa.eu']);
  for (const r of EU) {
    const u = new URL(r.website);
    assert.ok(!(bare.has(u.hostname.replace(/^www\./, '')) && (u.pathname === '/' || u.pathname === '')),
      `${r.id} points at a bare institution homepage`);
    assert.match(r.website, /^https:\/\//, `${r.id} is not https`);
  }
});

// The build makes no network request, by design, so no test can prove a URL is
// live. What a test CAN do is make a URL change impossible to slip through: each
// address below was fetched during Wave 1F and returned the named service, and
// editing one here is the deliberate act of re-verifying it. This is what stops
// an invented subdomain or a known-dead path being swapped in silently.
test('every EU website is a pinned, previously verified address', () => {
  const PINNED = {
    'eu-bris': 'https://e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-search-company-eu_en',
    'eu-vies': 'https://ec.europa.eu/taxation_customs/vies/',
    'eu-ted': 'https://ted.europa.eu/en/',
    'eu-transparency-register': 'https://transparency-register.europa.eu/index_en',
    'eu-esma-credit-rating-agencies': 'https://www.esma.europa.eu/credit-rating-agencies/cra-authorisation',
    'eu-eba-credit-institutions-register': 'https://www.eba.europa.eu/risk-and-data-analysis/data/registers-and-other-list-institutions/credit-institutions-register',
    'eu-eba-payment-institutions-register': 'https://www.eba.europa.eu/risk-and-data-analysis/data/registers/payment-institutions-register',
    'eu-eiopa-insurance-undertakings': 'https://register.eiopa.europa.eu/registers/register-of-insurance-undertakings',
    'eu-edes': 'https://commission.europa.eu/strategy-and-policy/eu-budget/how-it-works/annual-lifecycle/implementation/anti-fraud-measures/edes/edes-database_en',
    // Wave 1F.1
    'eu-euipo-esearch-plus': 'https://euipo.europa.eu/eSearch/',
    'eu-tmview': 'https://www.tmdn.org/tmview/',
    'eu-designview': 'https://www.tmdn.org/tmdsview-web/',
    'eu-eudamed': 'https://ec.europa.eu/tools/eudamed',
    'eu-echa-chem': 'https://chem.echa.europa.eu/',
    'eu-eib-exclusion': 'https://www.eib.org/en/about/accountability/anti-fraud/exclusion/index.htm',
    // Wave 1F.1 taxonomy application
    'eu-ctis': 'https://euclinicaltrials.eu/',
    'eu-giview': 'https://www.tmdn.org/giview/',
    'eu-sanctions-map': 'https://www.sanctionsmap.eu/',
    'eu-consolidated-financial-sanctions': 'https://webgate.ec.europa.eu/fsd/fsf',
    'eu-pesticides-database': 'https://ec.europa.eu/food/plant/pesticides/eu-pesticides-database/start/screen/active-substances',
  };
  assert.deepStrictEqual(Object.keys(PINNED).sort(), EU.map((r) => r.id).sort(),
    'an EU record is not covered by the pinned-URL guard');
  for (const r of EU) {
    assert.strictEqual(r.website, PINNED[r.id],
      `${r.id} website changed; re-verify it against the live service before editing this pin`);
  }
  // Hosts and paths found during this wave not to exist or not to serve. They are
  // barred from the fields a reader can follow — never from editorNotes, where
  // recording that a plausible-looking address does NOT resolve is exactly the
  // finding worth keeping.
  const KNOWN_DEAD = ['vies.ec.europa.eu', 'bris-search', 'eori_help.jsp', 'faqvies.do', 'simap.ted.europa.eu'];
  for (const r of EU) {
    const linkFields = [r.website, r.publicAccess.searchUrl, r.operator.officialUrl, r.submissionUrl]
      .filter(Boolean).join(' ');
    for (const dead of KNOWN_DEAD) {
      assert.ok(!linkFields.includes(dead),
        `${r.id} links to ${dead}, which was found not to exist or not to serve`);
    }
  }
});

test('no record publishes a search URL it did not observe', () => {
  for (const r of EU) {
    const pa = r.publicAccess;
    if (pa.accessLevel !== 'unknown') continue;
    assert.strictEqual(pa.searchUrl, null, `${r.id} is unknown but publishes a search URL`);
    for (const k of ['freeToSearch', 'loginRequired', 'identityVerificationRequired',
      'captcha', 'geographicRestriction', 'paidDocumentsAvailable']) {
      assert.strictEqual(pa[k], null, `${r.id} is unknown but asserts ${k}`);
    }
    assert.ok(pa.notes && pa.notes.trim(), `${r.id} is unknown but explains nothing`);
  }
  // Non-vacuity: at least one record in this wave genuinely could not be observed.
  assert.ok(EU.some((r) => r.publicAccess.accessLevel === 'unknown'),
    'no EU record is unknown, so this guard proves nothing');
});

test('no record claims a CAPTCHA is absent', () => {
  for (const r of EU) {
    assert.notStrictEqual(r.publicAccess.captcha, false,
      `${r.id} asserts no CAPTCHA; absence was not established for any host in this wave`);
  }
});

test('access facts never contradict one another', () => {
  for (const r of EU) {
    assert.deepStrictEqual(S.accessContradictions(r.publicAccess), [], `${r.id} has contradictory access`);
  }
});

// --- operators ---------------------------------------------------------------------

test('every operator names a real institution, not a bare "European Union"', () => {
  for (const r of EU) {
    assert.ok(r.operator && r.operator.name.trim(), `${r.id} has no operator`);
    assert.notStrictEqual(r.operator.name.trim(), 'European Union',
      `${r.id} uses a bare "European Union" operator where an institution runs the service`);
    assert.ok(S.OPERATOR_TYPES.includes(r.operator.type), `${r.id} operator type invalid`);
    assert.match(r.operator.officialUrl, /^https:\/\//, `${r.id} operator has no official URL`);
  }
  // The Transparency Register is jointly operated and must name all three.
  const tr = byId.get('eu-transparency-register');
  for (const inst of ['European Parliament', 'Council of the European Union', 'European Commission']) {
    assert.ok(tr.operator.name.includes(inst), `the Transparency Register operator omits the ${inst}`);
  }
});

// --- classification ----------------------------------------------------------------

test('TED is a notice database and never a supplier register', () => {
  const ted = byId.get('eu-ted');
  assert.strictEqual(ted.primaryRegistryType, 'public-procurement-notice-database');
  assert.ok(!ted.registryTypes.includes('procurement-supplier-register'),
    'TED is typed as a supplier register, which inverts what it is');
  assert.match(visible(ted), /not a supplier register/i, 'the TED page never says it is not a supplier register');
});

test('every registry type is in the closed vocabulary and primary is first', () => {
  for (const r of EU) {
    assert.ok(r.registryTypes.length > 0, `${r.id} has no registry type`);
    for (const t of r.registryTypes) assert.ok(T.REGISTRY_TYPE_BY_ID.has(t), `${r.id} uses undefined type "${t}"`);
    assert.strictEqual(r.primaryRegistryType, r.registryTypes[0], `${r.id} primary type is not first`);
  }
});

// --- shared host --------------------------------------------------------------------

test('two registers on one EU host both declare resourceIdentity', () => {
  const host = (u) => new URL(u).hostname.replace(/^www\./, '');
  const byHost = new Map();
  for (const r of ALL) {
    const h = host(r.website);
    if (!byHost.has(h)) byHost.set(h, []);
    byHost.get(h).push(r);
  }
  for (const r of EU) {
    const sharing = byHost.get(host(r.website)).filter((o) => o.id !== r.id);
    for (const o of sharing) {
      assert.ok(r.resourceIdentity && o.resourceIdentity,
        `${r.id} shares host ${host(r.website)} with ${o.id} and neither declares resourceIdentity`);
      assert.notStrictEqual(r.resourceIdentity.systemKey, o.resourceIdentity.systemKey,
        `${r.id} and ${o.id} claim the same systemKey`);
    }
  }
  // Non-vacuity: the EBA pair is the case this exists for.
  const a = byId.get('eu-eba-credit-institutions-register');
  const b = byId.get('eu-eba-payment-institutions-register');
  assert.ok(a.resourceIdentity && b.resourceIdentity, 'the EBA pair no longer declares resourceIdentity');
  assert.strictEqual(a.resourceIdentity.sharedHostGroup, b.resourceIdentity.sharedHostGroup);
});

// --- the publication contract --------------------------------------------------------

test('every EU record meets the publication contract', () => {
  for (const r of EU) {
    assert.ok(r.description.length > 120, `${r.id} description is thin`);
    assert.ok(r.pros.length >= 3 && r.cons.length >= 3, `${r.id} has a thin assessment`);
    assert.ok(r.bestFor.length > 0 && r.notRecommendedFor.length > 0, `${r.id} has no audience guidance`);
    assert.strictEqual(S.computeScore(r.scoreFactors), r.petroHrysScore, `${r.id} score does not reproduce`);
    assert.strictEqual(r.nextVerification, S.nextVerificationFor(r), `${r.id} verification date was hand-set`);
    assert.strictEqual(r.submissionModel, 'notApplicable', `${r.id} is ${r.submissionModel}`);
    assert.strictEqual(r.verification.source, 'government-register', `${r.id} is not sourced to a register`);
    for (const label of ['LEGAL SOURCE OF RECORD:', 'RESPONSIBLE AUTHORITY:',
      'TECHNICAL PLATFORM:', 'PUBLIC ACCESS INTERFACE:']) {
      assert.ok(r.editorNotes.includes(label), `${r.id} is missing "${label}"`);
    }
    assert.match([...r.cons, ...r.notRecommendedFor].join(' '),
      /does not|is not|not a |establishes nothing|proves nothing|says nothing/i,
      `${r.id} never says what it does not provide`);
  }
});

test('no EU record overclaims what inclusion proves', () => {
  for (const r of EU) {
    const text = visible(r);
    assert.ok(!/guarantee(?:s|d)? (?:solvency|compliance|quality|trustworth)/i.test(text),
      `${r.id} claims inclusion guarantees something`);
    assert.ok(!/proves? (?:that )?(?:the )?(?:company|entity|firm) is (?:safe|legitimate|trustworthy)/i.test(text),
      `${r.id} claims inclusion proves trustworthiness`);
  }
});

// --- metrics ---------------------------------------------------------------------------

test('no EU record carries a metric and the frozen snapshot is untouched', () => {
  for (const r of EU) {
    assert.strictEqual(r.domainRating, null, `${r.id} carries a Domain Rating`);
    assert.strictEqual(r.metricStatus, 'unknown', `${r.id} claims a metric status`);
    assert.deepStrictEqual(r.metricsProvenance, {}, `${r.id} carries metric provenance`);
  }
  const domains = new Set(ALL
    .filter((r) => r.domainRating !== null && r.domainRating !== undefined)
    .map((r) => (r.metricsProvenance || {}).domainRating)
    .filter(Boolean).map((p) => p.measuredDomain));
  assert.strictEqual(domains.size, 64, `the measured-domain count moved to ${domains.size}`);
  assert.deepStrictEqual(S.sharedDomainSnapshotProblems(ALL), [], 'a shared-domain snapshot became inconsistent');
});

// --- pages ------------------------------------------------------------------------------

test('every EU record has a page that carries its distinction and leaks no schema', () => {
  for (const r of EU) {
    const html = readPage(r);
    const body = html.replace(/<[^>]+>/g, ' ');
    for (const leak of ['primaryRegistryType', 'scoreFactors', 'metricsProvenance', 'notApplicable', 'entityType']) {
      assert.ok(!body.includes(leak), `${r.id} page leaks the schema term ${leak}`);
    }
    assert.ok(!body.includes('FOUR ROLES, determined separately'), `${r.id} page publishes the editor notes`);
  }
});

test('the interface records tell a reader on their own page that they are not the register', () => {
  for (const id of ['eu-bris', 'eu-vies']) {
    const body = readPage(byId.get(id)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    assert.match(body, /national|not a register|does not constitute|establishes nothing/i,
      `${id} page never tells a reader where the record actually lives`);
  }
});
