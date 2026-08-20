// scripts/tests/bd-eu-taxonomy.test.cjs
'use strict';

// Wave 1F.1 taxonomy expansion. Five values were added to the closed vocabulary
// so that five verified EU systems could be published without lying about what
// they are:
//
//   clinical-trial-register
//   geographical-indication-register
//   sanctions-and-restrictive-measures-index
//   sanctions-designation-list
//   plant-protection-product-authorisation-register
//
// Adding a type is the easiest way to make a taxonomy useless, so the value of
// these five lies entirely in their BOUNDARIES. Each boundary is asserted here
// from two directions: the record must carry the right type, and it must not be
// reachable by the neighbouring wrong one.
//
// The five boundaries, stated once:
//   * A sanctions REGIME index is not a DESIGNATION list.
//   * A designation list is not an EXCLUSION/DEBARMENT register.
//   * A geographical indication is not a TRADE MARK.
//   * A clinical trial register is not a general HEALTH or RESEARCH database.
//   * A plant protection authorisation database is not a CHEMICALS register.

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

const APPROVED = [
  'clinical-trial-register',
  'geographical-indication-register',
  'sanctions-and-restrictive-measures-index',
  'sanctions-designation-list',
  'plant-protection-product-authorisation-register',
];

// Positive fixtures: exactly which record each approved type was created for.
const FIXTURES = {
  'clinical-trial-register': 'eu-ctis',
  'geographical-indication-register': 'eu-giview',
  'sanctions-and-restrictive-measures-index': 'eu-sanctions-map',
  'sanctions-designation-list': 'eu-consolidated-financial-sanctions',
  'plant-protection-product-authorisation-register': 'eu-pesticides-database',
};

const visible = (r) => [r.description, ...r.pros, ...r.cons, ...r.bestFor, ...r.notRecommendedFor].join(' ');
const limitsOf = (r) => [...r.cons, ...r.notRecommendedFor].join(' ');

// --- the vocabulary itself -----------------------------------------------------------

test('the five approved values are in the closed vocabulary, spelled exactly', () => {
  assert.strictEqual(APPROVED.length, 5,
    'the approved-taxonomy list changed size without this test changing');
  for (const id of APPROVED) {
    assert.ok(S.REGISTRY_TYPES.includes(id), `${id} is not in the closed vocabulary`);
  }
  // The count is pinned so a sixth value cannot arrive unnoticed.
  assert.strictEqual(S.REGISTRY_TYPES.length, 26,
    `the vocabulary is ${S.REGISTRY_TYPES.length} values; it was 21 before this wave and 26 after`);
  assert.strictEqual(new Set(S.REGISTRY_TYPES).size, S.REGISTRY_TYPES.length,
    'the vocabulary contains a duplicate value');
});

test('every vocabulary value has a definition, and every definition is in the vocabulary', () => {
  const defined = T.REGISTRY_TYPE_DEFINITIONS.map((d) => d.id);
  assert.deepStrictEqual([...S.REGISTRY_TYPES].sort(), [...defined].sort(),
    'the vocabulary and the definition set have drifted apart');
  for (const id of APPROVED) {
    const d = T.REGISTRY_TYPE_BY_ID.get(id);
    assert.ok(d, `${id} has no definition`);
    // A label is a short human name; the prose fields carry the meaning.
    assert.ok(d.label && d.label.trim().length > 3, `${id} has no label`);
    for (const field of ['definition', 'inclusion', 'boundary']) {
      assert.ok(d[field] && d[field].trim().length > 60, `${id} has a thin ${field}`);
    }
    assert.ok(Array.isArray(d.examples) && d.examples.length, `${id} has no examples`);
  }
});

test('each new definition states what it is NOT', () => {
  // A type whose boundary does not exclude anything cannot keep a taxonomy
  // honest, which is the entire reason these five were added rather than reused.
  const mustExclude = {
    'clinical-trial-register': /NOT a general health|health, medicine, research/i,
    'geographical-indication-register': /NOT a trademark-register/i,
    'sanctions-and-restrictive-measures-index': /NOT a sanctions-designation-list/i,
    'sanctions-designation-list': /NOT an exclusion-and-debarment-register/i,
    'plant-protection-product-authorisation-register': /NOT a generic chemical/i,
  };
  for (const [id, re] of Object.entries(mustExclude)) {
    assert.match(T.REGISTRY_TYPE_BY_ID.get(id).boundary, re,
      `${id} no longer excludes the neighbouring type it was created to be distinct from`);
  }
});

// --- positive fixtures -----------------------------------------------------------------

test('every approved type is actually used, by exactly the record it was created for', () => {
  for (const [type, id] of Object.entries(FIXTURES)) {
    const r = byId.get(id);
    assert.ok(r, `${id} is missing, so ${type} has no fixture`);
    assert.strictEqual(r.primaryRegistryType, type, `${id} does not lead with ${type}`);
    assert.ok(r.registryTypes.includes(type), `${id} does not carry ${type}`);
    // No new type may be introduced without a record using it: an unused type is
    // a claim about coverage the dataset does not have.
    const users = ALL.filter((x) => x.registryTypes.includes(type));
    assert.ok(users.length >= 1, `${type} is defined but unused`);
  }
  assert.deepStrictEqual(Object.keys(FIXTURES).sort(), [...APPROVED].sort(),
    'an approved type has no positive fixture');
});

test('each published system meets the contract for its new type', () => {
  for (const id of Object.values(FIXTURES)) {
    const r = byId.get(id);
    assert.strictEqual(r.country, 'european-union', `${id} is not filed under the EU`);
    assert.strictEqual(r.scope, 'supranational', `${id} is scoped ${r.scope}`);
    assert.strictEqual(r.jurisdiction, null, `${id} claims a jurisdiction`);
    assert.match(r.website, /^https:\/\//, `${id} is not https`);
    assert.notStrictEqual(r.operator.name.trim(), 'European Union', `${id} uses a bare EU operator`);
    assert.strictEqual(S.computeScore(r.scoreFactors), r.petroHrysScore, `${id} score does not reproduce`);
    assert.strictEqual(r.nextVerification, S.nextVerificationFor(r), `${id} date was hand-set`);
    // WAS: assert.strictEqual(r.domainRating, null, `${id} carries a Domain
    // Rating`). Domain Rating collection was frozen when this contract was
    // written; the repository owner has reversed that policy, because it was
    // written against the plan-gated Site Explorer endpoint while Ahrefs also
    // publishes the figure through the free /v3/public/domain-rating-free
    // endpoint. Every domain in the corpus has now been read, so a null is no
    // longer the fact. What the clause was keeping out was an invented number,
    // so the rating is required to be evidenced and to be about this record's
    // own domain instead.
    assert.deepStrictEqual(S.domainRatingProblems(r), [],
      `${id} carries a Domain Rating without a provider, a date and a measured domain`);
    assert.strictEqual(r.metricsProvenance.domainRating.measuredDomain, S.normaliseDomain(r.website),
      `${id} reports a rating measured on a domain that is not its own`);
    for (const label of ['LEGAL SOURCE OF RECORD:', 'RESPONSIBLE AUTHORITY:',
      'TECHNICAL PLATFORM:', 'PUBLIC ACCESS INTERFACE:']) {
      assert.ok(r.editorNotes.includes(label), `${id} is missing "${label}"`);
    }
    assert.deepStrictEqual(S.accessContradictions(r.publicAccess), [], `${id} has contradictory access`);
    assert.notStrictEqual(r.publicAccess.captcha, false, `${id} asserts no CAPTCHA`);
  }
});

// --- boundary 1: a regime index is not a designation list -------------------------------

test('the sanctions map indexes regimes and is never a designation list', () => {
  const map = byId.get('eu-sanctions-map');
  assert.strictEqual(map.primaryRegistryType, 'sanctions-and-restrictive-measures-index');
  assert.ok(!map.registryTypes.includes('sanctions-designation-list'),
    'the sanctions map is typed as a designation list; it indexes regimes, not persons');
  assert.ok(!map.registryTypes.includes('exclusion-and-debarment-register'),
    'the sanctions map is typed as a debarment register, which is a category error');
  assert.match(visible(map), /regime/i, 'the sanctions map page never mentions regimes');
  assert.match(limitsOf(map), /not a designation list|will not tell you whether a named person/i,
    'the sanctions map page does not tell a reader it cannot answer designation questions');
});

test('the sanctions map keeps its Official Journal disclaimer explicit', () => {
  const map = byId.get('eu-sanctions-map');
  // Required to remain explicit: the authentic legal sources are the OJ acts.
  assert.match(visible(map), /Official Journal/,
    'the sanctions map page no longer names the Official Journal as the authentic source');
  assert.match(limitsOf(map), /authentic/i,
    'the sanctions map limitations no longer say what is authentic');
  assert.match(map.editorNotes, /authentic versions of the relevant acts|published in the Official Journal/,
    'the sanctions map editor notes no longer carry the authenticity position');
});

// --- boundary 2: a designation list is not an exclusion register ------------------------

test('the designation list is never typed as an exclusion or debarment register', () => {
  const list = byId.get('eu-consolidated-financial-sanctions');
  assert.strictEqual(list.primaryRegistryType, 'sanctions-designation-list');
  assert.ok(!list.registryTypes.includes('exclusion-and-debarment-register'),
    'the consolidated designation list is typed as a debarment register, which is a category error');
  assert.ok(!list.registryTypes.includes('sanctions-and-restrictive-measures-index'),
    'the designation list is typed as a regime index; it lists persons, not regimes');
  assert.match(limitsOf(list), /absent party is unrestricted|says nothing about any other regime|other regime/i,
    'the designation list does not disclaim what absence proves');
});

test('the exclusion registers keep their own classification', () => {
  // Required explicitly: the EIB record must retain exclusion/debarment.
  for (const id of ['eu-eib-exclusion', 'eu-edes']) {
    const r = byId.get(id);
    assert.ok(r.registryTypes.includes('exclusion-and-debarment-register'),
      `${id} lost its exclusion/debarment classification`);
    assert.ok(!r.registryTypes.includes('sanctions-designation-list'),
      `${id} was reclassified as a sanctions designation list; exclusion is a different instrument`);
  }
  assert.strictEqual(byId.get('eu-eib-exclusion').primaryRegistryType, 'exclusion-and-debarment-register');
});

test('no record carries both a sanctions type and an exclusion type', () => {
  const sanctionTypes = ['sanctions-designation-list', 'sanctions-and-restrictive-measures-index'];
  for (const r of ALL) {
    const hasSanction = r.registryTypes.some((t) => sanctionTypes.includes(t));
    const hasExclusion = r.registryTypes.includes('exclusion-and-debarment-register');
    assert.ok(!(hasSanction && hasExclusion),
      `${r.id} mixes a sanctions type with the exclusion type; they rest on different instruments`);
  }
});

// --- boundary 3: a geographical indication is not a trade mark ---------------------------

test('GIview is a geographical indication register and never a trade mark or design register', () => {
  const gi = byId.get('eu-giview');
  assert.strictEqual(gi.primaryRegistryType, 'geographical-indication-register');
  for (const forbidden of ['trademark-register', 'registered-design-register', 'patent-register']) {
    assert.ok(!gi.registryTypes.includes(forbidden),
      `GIview is typed ${forbidden}; a geographical indication protects origin, not a brand or a design`);
  }
  assert.match(limitsOf(gi), /not a trade mark|protects origin|separate rights/i,
    'the GIview page never separates a geographical indication from a trade mark');
  // Its split responsibility must be visible, not buried.
  assert.match(visible(gi), /Commission|split|craft and industrial/i,
    'the GIview page never discloses that responsibility for EU GIs is split');
});

// --- boundary 4: a trial register is not a health database --------------------------------

test('CTIS is a clinical trial register and is not generalised', () => {
  const c = byId.get('eu-ctis');
  assert.strictEqual(c.primaryRegistryType, 'clinical-trial-register');
  assert.deepStrictEqual(c.registryTypes, ['clinical-trial-register'],
    'CTIS carries a type beyond the trial register, which widens it into a health database');
  for (const forbidden of ['public-filing-database', 'regulated-operator-register',
    'professional-licence-register']) {
    assert.ok(!c.registryTypes.includes(forbidden), `CTIS is typed ${forbidden}`);
  }
  assert.match(limitsOf(c), /records trials, not products|not products, manufacturers or businesses/i,
    'the CTIS page does not say what it is not a register of');
  // The publication-versus-authorisation distinction is the four-roles point here.
  assert.match(limitsOf(c), /publication interface|member states/i,
    'the CTIS page does not separate publication from authorisation');
});

// --- boundary 5: a pesticides database is not a chemicals register --------------------------

test('the pesticides database is not collapsed into the chemicals register', () => {
  const p = byId.get('eu-pesticides-database');
  assert.strictEqual(p.primaryRegistryType, 'plant-protection-product-authorisation-register');
  assert.ok(!p.registryTypes.includes('public-filing-database'),
    'the pesticides database carries the chemicals-filing type; the regimes are different');
  assert.deepStrictEqual(p.registryTypes, ['plant-protection-product-authorisation-register']);
  // And the two systems must stay distinguishable from each other.
  const chem = byId.get('eu-echa-chem');
  assert.notStrictEqual(chem.primaryRegistryType, p.primaryRegistryType,
    'the chemicals platform and the pesticides database now share a primary type');
  assert.match(limitsOf(p), /no legal value|has no legal value/i,
    'the pesticides page no longer carries its operator’s own no-legal-value disclaimer');
  assert.match(limitsOf(p), /chemicals registration|outside plant-protection law/i,
    'the pesticides page does not separate itself from chemicals registration');
});

// --- the Sanctions Tracker determination ----------------------------------------------------

test('the EU Sanctions Tracker remains unpublished pending its functional determination', () => {
  const websites = EU.map((r) => r.website).join(' ');
  assert.ok(!websites.includes('eusanctionstracker'),
    'the EU Sanctions Tracker was published; its canonical function was never established');
  const backlog = fs.readFileSync(path.join(ROOT, 'docs', 'business-directories-verification-backlog.md'), 'utf8');
  assert.match(backlog, /Sanctions Tracker/, 'the backlog does not record the Tracker determination');
  assert.match(backlog, /Dashboard/,
    'the backlog does not record the functional evidence the determination rests on');
});

// --- documentation ------------------------------------------------------------------------

test('the taxonomy expansion is documented where a maintainer will find it', () => {
  const runbook = fs.readFileSync(path.join(ROOT, 'docs', 'business-directories-runbook.md'), 'utf8');
  for (const id of APPROVED) {
    assert.ok(runbook.includes(id), `the runbook does not document the new type ${id}`);
  }
  // The count correction is part of the decision record and must not regress.
  const backlog = fs.readFileSync(path.join(ROOT, 'docs', 'business-directories-verification-backlog.md'), 'utf8');
  assert.ok(!/[Tt]hree narrow types/.test(backlog),
    'the backlog still says three narrow types; five distinct values were proposed');
});
