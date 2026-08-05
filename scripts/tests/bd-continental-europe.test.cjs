// scripts/tests/bd-continental-europe.test.cjs
'use strict';

// Wave 1E published eleven core Continental European registries. The wave that
// preceded it existed only because four European records had collapsed four
// distinct roles into one claim, so every record here is authored against the
// same four questions and this file holds them:
//
//   1. LEGAL SOURCE OF RECORD — where the register is constituted in law.
//   2. RESPONSIBLE AUTHORITY  — the body the law makes answerable (the operator).
//   3. TECHNICAL PLATFORM     — who runs the software. Never the operator.
//   4. PUBLIC ACCESS INTERFACE— what a member of the public actually uses.
//
// The specific traps this wave had to avoid, each of which is asserted below:
//   * ARES aggregates other registers and constitutes nothing — it must never be
//     typed as a company register (the Germany/France/Spain error, pre-empted).
//   * Sirene identifies; the RNE constitutes. Poland has the same split between
//     REGON and KRS, and CEIDG covers a population KRS does not touch.
//   * The Unternehmensregister is a statutory publication platform, not the
//     court-held commercial register.
//   * The Registro Mercantil Central is a central institution over provincial
//     registries, not the registry where a company is registered.
//   * The Registro Público Concursal belongs to the ministry; the registrars'
//     body only manages the publicity service.

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

const WAVE_1E = ['pl-krs', 'cz-ares', 'cz-isir', 'de-unternehmensregister', 'de-transparenzregister',
  'fr-rne', 'fr-sirene', 'es-registro-mercantil-central', 'es-registro-publico-concursal',
  'it-uibm-banca-dati', 'it-pubblicita-legale-anac'];
const NEW = WAVE_1E.map((id) => byId.get(id));
const published = (r) => [r.description, ...r.pros, ...r.cons, ...r.bestFor, ...r.notRecommendedFor].join(' ');

// --- shape --------------------------------------------------------------------

test('the wave published eleven Continental European records across six countries', () => {
  for (let i = 0; i < WAVE_1E.length; i += 1) {
    assert.ok(NEW[i], `${WAVE_1E[i]} is missing`);
  }
  const countries = new Set(NEW.map((r) => r.country));
  assert.deepStrictEqual([...countries].sort(),
    ['czech-republic', 'france', 'germany', 'italy', 'poland', 'spain']);
  // Every one is a national record — none of these six countries is modelled
  // subnationally in this wave.
  for (const r of NEW) {
    assert.strictEqual(r.scope, 'national', `${r.id} is not national`);
    assert.strictEqual(r.jurisdiction, null, `${r.id} carries a jurisdiction`);
  }
});

// --- the four roles -------------------------------------------------------------

test('every record documents all four roles separately', () => {
  for (const r of NEW) {
    const n = r.editorNotes;
    for (const role of ['LEGAL SOURCE OF RECORD:', 'RESPONSIBLE AUTHORITY:',
      'TECHNICAL PLATFORM:', 'PUBLIC ACCESS INTERFACE:']) {
      assert.ok(n.includes(role), `${r.id} does not document ${role}`);
    }
    // A role may be Unknown, but it may not be blank.
    const legal = n.split('LEGAL SOURCE OF RECORD:')[1].split('RESPONSIBLE AUTHORITY:')[0].trim();
    assert.ok(legal.length > 30, `${r.id} states no legal source of record`);
  }
});

test('a technical platform is never recorded as the responsible authority', () => {
  // The precedents: Bundesanzeiger Verlag runs two German registers, the
  // Colegio de Registradores manages the Spanish insolvency publicity service.
  // Neither may appear as the operator.
  const PLATFORMS = ['Bundesanzeiger Verlag', 'Colegio de Registradores', 'InfoCamere', 'Proactis'];
  for (const r of NEW) {
    for (const p of PLATFORMS) {
      assert.ok(!r.operator.name.includes(p),
        `${r.id} names the technical platform "${p}" as the responsible authority`);
    }
  }
  // ...but where one exists it must still be recorded, not deleted.
  assert.match(byId.get('de-unternehmensregister').editorNotes, /Bundesanzeiger Verlag/,
    'the German platform operator was deleted rather than recorded as the platform');
  assert.match(byId.get('de-transparenzregister').editorNotes, /Bundesanzeiger Verlag/,
    'the Transparenzregister operator was deleted rather than recorded as the platform');
  assert.match(byId.get('es-registro-publico-concursal').editorNotes, /Colegio de Registradores/,
    'the Spanish publicity-service manager was deleted rather than recorded as the platform');
});

// --- the aggregator / identifier traps -------------------------------------------

test('ARES is an aggregation layer and is never typed as a register', () => {
  const r = byId.get('cz-ares');
  assert.strictEqual(r.primaryRegistryType, 'corporate-number-database');
  for (const forbidden of ['company-register', 'business-entity-register']) {
    assert.ok(!r.registryTypes.includes(forbidden),
      `ARES is typed ${forbidden}; it constitutes nothing`);
  }
  assert.match(published(r), /constitutes nothing|not the legal source of record|another register/i,
    'ARES never says it constitutes nothing');
  assert.match(r.editorNotes, /NOT ARES/,
    'the editor notes do not state that ARES is not the legal source');
});

test('an identifier register is never typed as the constitutive register', () => {
  // France: Sirene identifies, the RNE constitutes.
  const sirene = byId.get('fr-sirene');
  assert.strictEqual(sirene.primaryRegistryType, 'corporate-number-database');
  assert.ok(!sirene.registryTypes.includes('company-register'),
    'Sirene is typed as the French company register');
  assert.match(published(sirene), /does not establish that a business legally exists|identification register/i,
    'Sirene never disclaims constituting legal existence');

  const rne = byId.get('fr-rne');
  assert.ok(rne.registryTypes.includes('business-entity-register'),
    'the RNE is not typed as the register it is');
  assert.match(published(rne), /does not assign the SIREN and SIRET|Sirene/i,
    'the RNE never distinguishes itself from Sirene');
});

test('the Unternehmensregister is a publication platform, not the court-held register', () => {
  const r = byId.get('de-unternehmensregister');
  assert.strictEqual(r.primaryRegistryType, 'public-filing-database');
  assert.ok(!r.registryTypes.includes('company-register'),
    'the central platform is typed as the constitutive German register');
  assert.match(published(r), /not the constitutive register|kept by the courts/i,
    'the record never distinguishes the platform from the court-held registers');
});

test('the Registro Mercantil Central is not typed as the Spanish company register', () => {
  const r = byId.get('es-registro-mercantil-central');
  assert.ok(!r.registryTypes.includes('company-register'),
    'the central institution is typed as the register where companies are registered');
  assert.match(published(r), /provincial mercantile registr/i,
    'the record never says where a company is actually registered');
  assert.match(r.operator.name, /Ministerio de Justicia/,
    'the operator is not the ministry the institution depends on');
});

test('the Spanish insolvency register belongs to the ministry, not the registrars', () => {
  const r = byId.get('es-registro-publico-concursal');
  assert.match(r.operator.name, /Ministerio de Justicia/,
    'the insolvency register is attributed to a body other than the ministry');
  assert.ok(!/Colegio/.test(r.operator.name),
    'the registrars\' professional body is recorded as the responsible authority');
  // And the previous wave's correction must still hold on the older record.
  const colegio = byId.get('es-registradores');
  assert.ok(!colegio.registryTypes.includes('insolvency-register'),
    'the Wave 1D correction was undone: the Colegio regained an insolvency type');
});

// --- Poland: four systems, four populations ---------------------------------------

test('the four Polish systems are kept conceptually distinct', () => {
  const krs = byId.get('pl-krs');
  const ceidg = byId.get('pl-ceidg');
  const regon = byId.get('pl-regon');
  for (const [id, r] of [['pl-krs', krs], ['pl-ceidg', ceidg], ['pl-regon', regon]]) {
    assert.ok(r, `${id} is missing`);
  }
  // KRS is constitutive; REGON identifies; CEIDG covers sole traders.
  assert.ok(krs.registryTypes.includes('company-register'), 'KRS is not typed as constitutive');
  assert.ok(regon.registryTypes.includes('corporate-number-database'),
    'REGON is not typed as an identifier register');
  assert.ok(ceidg.registryTypes.includes('sole-trader-register'),
    'CEIDG is not typed as a sole-trader register');
  // KRS must say what it is NOT: it must disclaim covering sole traders.
  assert.match(published(krs), /sole trader/i, 'KRS never says it excludes sole traders');
  assert.match(published(krs), /CEIDG/, 'KRS never names the register that covers them');
  // And it must not claim the identifiers it merely displays.
  assert.match(published(krs), /REGON/, 'KRS never explains where its REGON number comes from');
  // The relationship must be recorded as a relation, not only as prose.
  assert.ok(krs.related.usedWith.includes('pl-regon') || krs.related.similar.includes('pl-ceidg'),
    'KRS records no relationship to the other Polish systems');
});

// --- classification and content contract --------------------------------------------

test('every record meets the publication contract', () => {
  for (const r of NEW) {
    assert.match(r.website, /^https:\/\//, `${r.id} website is not https`);
    assert.ok(r.operator && r.operator.name.trim(), `${r.id} has no operator`);
    assert.ok(S.OPERATOR_TYPES.includes(r.operator.type), `${r.id} operator type invalid`);
    assert.ok(r.operator.officialUrl && r.operator.officialUrl.startsWith('https://'),
      `${r.id} has no official URL for its operator`);
    for (const t of r.registryTypes) {
      assert.ok(T.REGISTRY_TYPE_BY_ID.has(t), `${r.id} uses undefined type "${t}"`);
    }
    assert.strictEqual(r.primaryRegistryType, r.registryTypes[0], `${r.id} primary type is not first`);
    assert.ok(S.ACCESS_LEVELS.includes(r.publicAccess.accessLevel), `${r.id} access level invalid`);
    assert.deepStrictEqual(S.accessContradictions(r.publicAccess), [], `${r.id} access contradiction`);
    assert.ok(r.description.length > 120, `${r.id} description is thin`);
    assert.ok(r.pros.length >= 3 && r.cons.length >= 3, `${r.id} has a thin assessment`);
    assert.ok(r.bestFor.length > 0 && r.notRecommendedFor.length > 0, `${r.id} has no audience guidance`);
    assert.strictEqual(S.computeScore(r.scoreFactors), r.petroHrysScore, `${r.id} score does not reproduce`);
    assert.strictEqual(r.nextVerification, S.nextVerificationFor(r), `${r.id} date was hand-set`);
    assert.strictEqual(r.submissionModel, 'notApplicable', `${r.id} is ${r.submissionModel}`);
    // Clause 4 of the content contract: what it does NOT provide.
    assert.match([...r.cons, ...r.notRecommendedFor].join(' '),
      /does not|not the (?:legal source|constitutive|register)|establishes nothing|constitutes nothing|is not evidence|not a supplier register|records .{0,30}only/i,
      `${r.id} never says what it does not provide`);
  }
});

test('no record guesses an access fact it did not observe', () => {
  for (const r of NEW) {
    const pa = r.publicAccess;
    if (pa.accessLevel !== 'unknown') continue;
    for (const k of ['freeToSearch', 'loginRequired', 'identityVerificationRequired', 'captcha', 'geographicRestriction']) {
      assert.strictEqual(pa[k], null, `${r.id} has accessLevel unknown but asserts ${k}`);
    }
    assert.strictEqual(pa.searchUrl, null, `${r.id} publishes a search URL it never observed`);
    assert.ok(pa.notes && pa.notes.trim(), `${r.id} is unknown but explains nothing`);
  }
  // The RNE is the specific case: its portal refused verification.
  const rne = byId.get('fr-rne');
  assert.strictEqual(rne.publicAccess.accessLevel, 'unknown',
    'the RNE asserts an access position that was never observed');
  assert.strictEqual(rne.publicAccess.searchUrl, null);
});

test('an observed CAPTCHA is recorded rather than assumed absent', () => {
  // The UIBM search form carries a CAPTCHA control. An earlier draft asserted
  // there was none; asserting absence is the failure mode this guards.
  assert.strictEqual(byId.get('it-uibm-banca-dati').publicAccess.captcha, true,
    'the UIBM CAPTCHA was recorded as absent or unknown');
});

test('no record added by this wave carries a metric', () => {
  for (const r of NEW) {
    for (const k of ['domainRating', 'authorityScore', 'estimatedTraffic', 'referringDomains']) {
      assert.strictEqual(r[k], null, `${r.id} carries ${k} = ${r[k]}`);
    }
    assert.strictEqual(r.metricStatus, 'unknown', r.id);
    assert.deepStrictEqual(r.metricsProvenance, {}, r.id);
  }
  const measured = ALL.filter((r) => r.domainRating !== null);
  const domains = new Set(measured.map((r) => r.metricsProvenance.domainRating.measuredDomain));
  assert.strictEqual(domains.size, 64, `${domains.size} measured domains; the freeze pins 64`);
  assert.deepStrictEqual(S.sharedDomainSnapshotProblems(ALL), []);
});

test('no record overclaims authority or implies inclusion proves anything', () => {
  for (const r of NEW) {
    const pub = [r.description, ...r.pros, ...r.bestFor].join(' ');
    assert.ok(!/\b(?:proves|guarantees|certifies|ensures)\b[^.]*\b(?:solvent|solvency|compliant|trustworth|reputable|eligible)\b/i.test(pub),
      `${r.id} implies inclusion proves solvency, compliance or trustworthiness`);
    assert.ok(!/\b(?:the definitive|the complete|exhaustive)\b/i.test(pub),
      `${r.id} uses absolute coverage language`);
  }
});

test('no duplicate host and no collision with an already-published record', () => {
  const hosts = new Map();
  for (const r of ALL) {
    const key = `${r.country}/${S.normaliseDomain(r.website)}`;
    if (hosts.has(key) && !r.resourceIdentity) {
      assert.fail(`${r.id} shares a host with ${hosts.get(key)} without a resourceIdentity`);
    }
    hosts.set(key, r.id);
  }
  // The France pair specifically: the RNE must not collide with fr-inpi.
  assert.notStrictEqual(S.normaliseDomain(byId.get('fr-rne').website),
    S.normaliseDomain(byId.get('fr-inpi').website),
    'the RNE record collides with the existing INPI record');
});

test('relations resolve and cross-link the systems the evidence connects', () => {
  const ids = new Set(ALL.map((r) => r.id));
  let count = 0;
  for (const r of NEW) {
    for (const kind of S.RELATION_KINDS) {
      for (const target of r.related[kind]) {
        assert.ok(ids.has(target), `${r.id} relates to unknown record "${target}"`);
        assert.notStrictEqual(target, r.id, `${r.id} relates to itself`);
        count += 1;
      }
    }
  }
  assert.ok(count >= 15, `only ${count} relations across eleven records`);
  // The specific pairs the brief required.
  assert.ok(byId.get('cz-ares').related.usedWith.includes('cz-verejny-rejstrik'),
    'ARES is not linked to the Czech public register');
  assert.ok(byId.get('fr-rne').related.usedWith.includes('fr-sirene'),
    'the RNE is not linked to Sirene');
  assert.ok(byId.get('es-registro-mercantil-central').related.similar.includes('es-registro-publico-concursal')
    || byId.get('es-registro-publico-concursal').related.similar.includes('es-registro-mercantil-central'),
    'the Spanish mercantile and insolvency registers are not linked');
  assert.ok(byId.get('de-unternehmensregister').related.usedWith.includes('de-registerportal'),
    'the Unternehmensregister is not linked to the court register portal');
});

// --- generated output ---------------------------------------------------------------

test('every new record has a generated, indexable page with no schema leakage', () => {
  const visible = (h) => h.replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');
  for (const r of NEW) {
    const file = path.join(ROOT, 'research/business-directories', r.country, r.slug, 'index.html');
    assert.ok(fs.existsSync(file), `${r.id} has no detail page`);
    const html = fs.readFileSync(file, 'utf8');
    assert.ok(/rel="canonical" href="https:\/\/petrohrys\.com/.test(html), `${r.id} has no canonical`);
    assert.ok(!/noindex/.test(html), `${r.id} is noindex`);
    assert.ok(html.includes(r.operator.name), `${r.id} page does not name its operator`);
    const v = visible(html);
    for (const term of ['registryTypes', 'primaryRegistryType', 'systemKey', 'sharedHostGroup',
      'LEGAL SOURCE OF RECORD', 'RESPONSIBLE AUTHORITY']) {
      assert.ok(!v.includes(term), `${r.id} page leaks "${term}" into visible text`);
    }
  }
});
