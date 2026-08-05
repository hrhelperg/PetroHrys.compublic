// scripts/tests/bd-eu-completion.test.cjs
'use strict';

// Wave 1F.1 completed the three EU areas the previous wave could not research:
// intellectual property, sanctions and exclusions, and chemicals / clinical
// trials / regulated products.
//
// The dominant failure mode in this wave is CONFLATION, and every test below
// guards one form of it:
//
//   * EUIPO KEEPS the EU trade mark and EU design Registers. eSearch plus is the
//     public interface over them; TMview and DesignView are neither. Saying
//     "TMview is the EU trade mark register" is wrong; so, less obviously, is
//     saying it of eSearch plus.
//   * Trade marks and registered designs are separate rights and must carry
//     separate types even though one office holds both registers.
//   * The European Patent Office is intergovernmental under the EPC. It is not
//     an EU body and must never appear under the EU.
//   * An alert feed, a case archive, a visualisation of legal acts and a
//     "no legal value" database are none of them registers.
//
// Several genuinely official systems were deliberately NOT published because no
// type in the closed vocabulary fits them honestly. That decision is pinned here
// too, so a later wave cannot quietly force one in.

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
const EU = ALL.filter((r) => r.country === 'european-union');

const WAVE = ['eu-euipo-esearch-plus', 'eu-tmview', 'eu-designview',
  'eu-eudamed', 'eu-echa-chem', 'eu-eib-exclusion'];
const NEW = WAVE.map((id) => byId.get(id));

const visible = (r) => [r.description, ...r.pros, ...r.cons, ...r.bestFor, ...r.notRecommendedFor].join(' ');
const limitsOf = (r) => [...r.cons, ...r.notRecommendedFor].join(' ');
const readPage = (r) => fs.readFileSync(
  path.join(ROOT, 'research', 'business-directories', r.country, r.slug, 'index.html'), 'utf8');

// --- non-vacuity ------------------------------------------------------------------

test('every record this wave claims to have published exists', () => {
  assert.strictEqual(WAVE.length, 6, 'the wave manifest changed size without this test changing');
  for (const [i, id] of WAVE.entries()) assert.ok(NEW[i], `${id} is named by this suite but is not in the registry`);
  assert.ok(EU.length >= 15, 'the EU set shrank; these guards would be testing a different dataset');
});

// --- the aggregator / register distinction ------------------------------------------

test('the aggregation portals are never typed or described as registers', () => {
  for (const id of ['eu-tmview', 'eu-designview']) {
    const r = byId.get(id);
    assert.strictEqual(r.primaryRegistryType, 'cross-border-registry-interface',
      `${id} does not lead with the interface type`);
    // The contradiction this guards: denying being a register while carrying a
    // register type. Either alone is defensible; together they are incoherent.
    for (const forbidden of ['trademark-register', 'registered-design-register',
      'patent-register', 'company-register']) {
      assert.ok(!r.registryTypes.includes(forbidden),
        `${id} says it is not a register yet carries ${forbidden}`);
    }
    assert.match(visible(r), /aggregat|participating offices|other national registries/i,
      `${id} never tells a reader that it aggregates`);
    assert.match(limitsOf(r), /not a register|constitutes no|establishes nothing|authoritative record/i,
      `${id} limitations never say it is not the register`);
  }
});

test('eSearch plus is the interface over the registers, not the registers themselves', () => {
  const r = byId.get('eu-euipo-esearch-plus');
  assert.ok(!/\bis the (?:EU |European Union )?(?:trade mark|design) [Rr]egister\b/.test(r.description),
    'the eSearch plus description calls itself the register');
  assert.match(limitsOf(r), /not the registers themselves|interface over the registers|search interface/i,
    'the eSearch plus limitations never separate the interface from the register');
});

test('trade marks and registered designs are typed separately', () => {
  const es = byId.get('eu-euipo-esearch-plus');
  assert.ok(es.registryTypes.includes('trademark-register'), 'eSearch plus omits the trade mark type');
  assert.ok(es.registryTypes.includes('registered-design-register'), 'eSearch plus omits the design type');
  // A forced type was removed during verification and must not come back: the
  // office keeps a list of representatives but issues no licence.
  assert.ok(!es.registryTypes.includes('professional-licence-register'),
    'eSearch plus carries professional-licence-register, which the office does not operate');
});

test('one system with several search tabs is one record, not one per tab', () => {
  const euipoHosted = EU.filter((r) => /(^|\.)euipo\.europa\.eu$/.test(new URL(r.website).hostname));
  assert.strictEqual(euipoHosted.length, 1,
    'more than one record is filed on the EUIPO host; the trade mark and design searches are one application');
});

// --- the EPO exclusion ---------------------------------------------------------------

test('no European Patent Office system is filed under the European Union', () => {
  for (const r of EU) {
    const host = new URL(r.website).hostname;
    assert.ok(!/(^|\.)epo\.org$/.test(host), `${r.id} is an EPO host filed under the EU`);
    assert.ok(!/European Patent Office|European Patent Register/i.test(r.operator.name),
      `${r.id} names the EPO as an EU operator`);
  }
  // And the exclusion must be recorded so it is not re-proposed as a gap.
  const backlog = fs.readFileSync(path.join(ROOT, 'docs', 'business-directories-verification-backlog.md'), 'utf8');
  assert.match(backlog, /European Patent (?:Office|Convention)/,
    'the backlog no longer records why the EPO is out of scope');
  assert.match(backlog, /intergovernmental/i, 'the backlog no longer gives the intergovernmental reason');
});

// --- what was deliberately not published -----------------------------------------------

test('systems with no honest type were not force-fitted into the vocabulary', () => {
  // Each of these was verified real and official and still not published,
  // because no closed-vocabulary type describes it. If one appears later it must
  // arrive with a type decision, not by being squeezed into an existing one.
  // Five of the six blocked systems were unblocked by the approved taxonomy and
  // are now published. What must STAY out is what is still blocked or rejected.
  const NOT_PUBLISHED = ['eusanctionstracker', 'rasff-window', 'competition-cases.ec.europa.eu',
    'eu-sanctions-compliance-helpdesk', 'register.epo.org'];
  const websites = EU.map((r) => r.website).join(' ');
  for (const frag of NOT_PUBLISHED) {
    assert.ok(!websites.includes(frag),
      `a record now points at ${frag}, which is still blocked or was rejected`);
  }
  // Non-vacuity: the holding decision must actually be written down.
  const backlog = fs.readFileSync(path.join(ROOT, 'docs', 'business-directories-verification-backlog.md'), 'utf8');
  for (const name of ['CTIS', 'GIview', 'Sanctions Map', 'Sanctions Tracker']) {
    assert.ok(backlog.includes(name), `the backlog does not record the decision on ${name}`);
  }
});

test('an alert feed and a case archive are not called registers', () => {
  const backlog = fs.readFileSync(path.join(ROOT, 'docs', 'business-directories-verification-backlog.md'), 'utf8');
  assert.match(backlog, /RASFF/, 'the backlog does not record the RASFF determination');
  assert.match(backlog, /case archive|enforcement case/i,
    'the backlog does not record why the competition case database is not a register');
});

// --- source of record ------------------------------------------------------------------

test('every record states its source of record separately from its operator', () => {
  for (const r of NEW) {
    for (const label of ['LEGAL SOURCE OF RECORD:', 'RESPONSIBLE AUTHORITY:',
      'TECHNICAL PLATFORM:', 'PUBLIC ACCESS INTERFACE:']) {
      assert.ok(r.editorNotes.includes(label), `${r.id} is missing "${label}"`);
    }
    const legal = /LEGAL SOURCE OF RECORD: (.*?) RESPONSIBLE AUTHORITY:/s.exec(r.editorNotes);
    assert.ok(legal && legal[1].length > 60, `${r.id} legal-source clause is a stub`);
  }
  // The two agency-is-the-source cases are the deliberate contrast to the
  // aggregators, and losing either would flatten the distinction.
  assert.match(byId.get('eu-echa-chem').editorNotes, /the agency IS the source of record/,
    'ECHA CHEM no longer records that the agency itself holds the filings');
  assert.match(byId.get('eu-eib-exclusion').editorNotes, /the institution here is the source of record/,
    'the EIB record no longer records that the bank takes the decisions itself');
});

test('the aggregators point away from themselves for the authoritative record', () => {
  for (const id of ['eu-tmview', 'eu-designview']) {
    const legal = /LEGAL SOURCE OF RECORD: (.*?) RESPONSIBLE AUTHORITY:/s.exec(byId.get(id).editorNotes)[1];
    assert.match(legal, /offices/i, `${id} does not name the issuing offices as the source`);
    assert.ok(!/^EUIPO\.?$/i.test(legal.trim()), `${id} names its own operator as the source of record`);
  }
});

// --- access truth -------------------------------------------------------------------------

test('no record claims access it did not observe', () => {
  for (const r of NEW) {
    const pa = r.publicAccess;
    if (pa.accessLevel === 'unknown') {
      assert.strictEqual(pa.searchUrl, null, `${r.id} is unknown but publishes a search URL`);
      for (const k of ['freeToSearch', 'loginRequired', 'identityVerificationRequired',
        'captcha', 'geographicRestriction', 'paidDocumentsAvailable']) {
        assert.strictEqual(pa[k], null, `${r.id} is unknown but asserts ${k}`);
      }
    }
    assert.ok(pa.notes && pa.notes.trim(), `${r.id} makes no access note`);
    assert.deepStrictEqual(S.accessContradictions(pa), [], `${r.id} has contradictory access fields`);
  }
  // Non-vacuity: this wave is dominated by client-rendered applications.
  assert.ok(NEW.filter((r) => r.publicAccess.accessLevel === 'unknown').length >= 3,
    'fewer unknown-access records than expected; this guard may be testing nothing');
});

test('no record claims a CAPTCHA is absent', () => {
  for (const r of NEW) {
    assert.notStrictEqual(r.publicAccess.captcha, false, `${r.id} asserts no CAPTCHA`);
  }
});

test('a published list is not described as a searchable register', () => {
  // The EIB page publishes a table. An earlier draft claimed free search; there
  // is no search surface at all.
  const eib = byId.get('eu-eib-exclusion');
  assert.strictEqual(eib.publicAccess.freeToSearch, null,
    'the EIB record claims a search position it has no surface for');
  assert.strictEqual(eib.publicAccess.searchUrl, null, 'the EIB record publishes a search URL');
  assert.match(limitsOf(eib), /published list rather than a searchable register|no query interface/i,
    'the EIB record does not tell a reader there is no search');
});

// --- currency of fact --------------------------------------------------------------------

test('EUDAMED is described by its current mandatory status, not its old voluntary one', () => {
  const r = byId.get('eu-eudamed');
  assert.match(visible(r), /28 May 2026/, 'the EUDAMED page does not date the mandatory transition');
  assert.match(visible(r), /mandator/i, 'the EUDAMED page never says the modules became mandatory');
  assert.ok(!/is (?:still |currently )?voluntary/i.test(visible(r)),
    'the EUDAMED page still describes the system as voluntary');
});

test('the obsolete Community design wording is not used', () => {
  for (const r of EU) {
    const text = `${r.description} ${r.name} ${r.officialName || ''} ${visible(r)}`;
    assert.ok(!/registered Community design|Register of Community designs/i.test(text),
      `${r.id} uses the pre-2025 Community design wording in public text`);
  }
});

// --- duplication and shared hosts ------------------------------------------------------

test('records sharing an official host all declare a distinct system identity', () => {
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
  // Non-vacuity: two shared-host pairs exist in the EU set and both must hold.
  for (const [a, b] of [['eu-tmview', 'eu-designview'], ['eu-vies', 'eu-eudamed']]) {
    const ra = byId.get(a); const rb = byId.get(b);
    assert.ok(ra.resourceIdentity && rb.resourceIdentity, `${a}/${b} no longer declare resourceIdentity`);
    assert.strictEqual(ra.resourceIdentity.sharedHostGroup, rb.resourceIdentity.sharedHostGroup,
      `${a} and ${b} are on one host but claim different shared host groups`);
  }
});

test('adding a shared host group changed nothing else about the published record', () => {
  // VIES gained a resourceIdentity so EUDAMED could be admitted on the same
  // host. Its substance is pinned here so that change stays additive.
  const vies = byId.get('eu-vies');
  assert.strictEqual(vies.website, 'https://ec.europa.eu/taxation_customs/vies/');
  assert.strictEqual(vies.primaryRegistryType, 'tax-verification-system');
  assert.deepStrictEqual(vies.registryTypes, ['tax-verification-system']);
  assert.strictEqual(vies.publicAccess.accessLevel, 'open');
  assert.strictEqual(vies.publicAccess.freeToSearch, true);
  assert.strictEqual(vies.domainRating, null);
  assert.strictEqual(vies.lastVerified, '2026-08-05');
  assert.strictEqual(vies.resourceIdentity.systemKey, 'vies-vat-validation');
});

// --- contract, metrics, pages --------------------------------------------------------

test('every new record meets the publication contract', () => {
  for (const r of NEW) {
    assert.match(r.website, /^https:\/\//, `${r.id} is not https`);
    assert.ok(S.OPERATOR_TYPES.includes(r.operator.type), `${r.id} operator type invalid`);
    assert.notStrictEqual(r.operator.name.trim(), 'European Union', `${r.id} uses a bare EU operator`);
    for (const t of r.registryTypes) assert.ok(T.REGISTRY_TYPE_BY_ID.has(t), `${r.id} uses undefined type "${t}"`);
    assert.strictEqual(r.primaryRegistryType, r.registryTypes[0], `${r.id} primary type is not first`);
    assert.strictEqual(r.scope, 'supranational', `${r.id} is scoped ${r.scope}`);
    assert.strictEqual(r.jurisdiction, null, `${r.id} claims a jurisdiction`);
    assert.ok(r.description.length > 120, `${r.id} description is thin`);
    assert.ok(r.pros.length >= 3 && r.cons.length >= 3, `${r.id} has a thin assessment`);
    assert.strictEqual(S.computeScore(r.scoreFactors), r.petroHrysScore, `${r.id} score does not reproduce`);
    assert.strictEqual(r.nextVerification, S.nextVerificationFor(r), `${r.id} date was hand-set`);
    assert.match(limitsOf(r), /does not|is not|not a |establishes nothing|proves nothing|constitutes no/i,
      `${r.id} never says what it does not provide`);
  }
});

test('no new record carries a metric and the frozen snapshot is untouched', () => {
  for (const r of NEW) {
    assert.strictEqual(r.domainRating, null, `${r.id} carries a Domain Rating`);
    assert.strictEqual(r.metricStatus, 'unknown', `${r.id} claims a metric status`);
    assert.deepStrictEqual(r.metricsProvenance, {}, `${r.id} carries metric provenance`);
  }
  const domains = new Set(ALL
    .filter((r) => r.domainRating !== null && r.domainRating !== undefined)
    .map((r) => (r.metricsProvenance || {}).domainRating).filter(Boolean)
    .map((p) => p.measuredDomain));
  assert.strictEqual(domains.size, 64, `the measured-domain count moved to ${domains.size}`);
  assert.deepStrictEqual(S.sharedDomainSnapshotProblems(ALL), [], 'a shared-domain snapshot became inconsistent');
});

test('every new record has a page that leaks no schema and keeps its distinction', () => {
  for (const r of NEW) {
    const html = readPage(r);
    const body = html.replace(/<[^>]+>/g, ' ');
    for (const leak of ['primaryRegistryType', 'scoreFactors', 'metricsProvenance', 'notApplicable',
      'entityType', 'resourceIdentity']) {
      assert.ok(!body.includes(leak), `${r.id} page leaks the schema term ${leak}`);
    }
    assert.ok(!body.includes('FOUR ROLES, determined separately'), `${r.id} page publishes the editor notes`);
  }
  // The two aggregators must carry the distinction on their own rendered page.
  for (const id of ['eu-tmview', 'eu-designview']) {
    const body = readPage(byId.get(id)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    assert.match(body, /aggregat|participating offices|other national registries/i,
      `${id} page never tells a reader it aggregates`);
  }
});
