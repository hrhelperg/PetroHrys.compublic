// scripts/tests/bd-source-of-record.test.cjs
'use strict';

// Wave 1D corrected five published records that stated something false about
// WHO HOLDS A REGISTER. The failure mode is subtle and recurs, so it is worth
// naming precisely:
//
//   * an official ACCESS PORTAL is not the register it gives access to
//     (Germany: HGB § 8(1) keeps the commercial register with the courts;
//      § 9(1) makes handelsregister.de the designated retrieval system);
//   * a government CONSULTATION INTERFACE over other administrations' data is
//     not a register at all (France: annuaire-entreprises draws on the Registre
//     National des Entreprises and the Base Sirene);
//   * a PROFESSIONAL BODY that operates a shared service is not the register its
//     members keep, and a delegated management role is not responsibility
//     (Spain: RD 892/2013 art. 2.2 places the Registro Público Concursal under
//      the Ministry of Justice; art. 2.3 entrusts only the material management
//      of its publicity service to the Colegio);
//   * a TECHNICAL PROVIDER is not the statutory authority (Italy: the Chambers
//     of Commerce hold the Registro Imprese; InfoCamere runs the platform);
//   * and an OPERATOR IS AN OFFICE, never the person currently holding it
//     (Georgia named the sitting Secretary of State).
//
// These tests are semantic rather than prose snapshots: they assert the claim
// each record must not make, and the distinction it must keep, so the wording
// can be improved later without the guard rotting.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const S = require('../lib/bd-schema.cjs');
const { loadRegistry } = require('../lib/bd-registry.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const ALL = loadRegistry().directories;
const byId = new Map(ALL.map((r) => [r.id, r]));
const published = (r) => [r.description, ...r.pros, ...r.cons, ...r.bestFor, ...r.notRecommendedFor].join(' ');

// --- 1. Germany: the portal is not the constitutive register --------------------

test('de-registerportal does not claim the portal is the constitutive register', () => {
  const r = byId.get('de-registerportal');
  assert.ok(r, 'de-registerportal is missing');
  // It must not be typed as the register itself.
  assert.ok(!r.registryTypes.includes('company-register'),
    'the portal is typed company-register, which asserts it constitutes the German register');
  assert.ok(!r.registryTypes.includes('business-entity-register'),
    'the portal is typed as a register rather than as access to one');
  assert.strictEqual(r.primaryRegistryType, 'public-filing-database');
  // And published prose must place the registers with the courts.
  assert.match(published(r), /kept by the (?:competent )?(?:local )?courts|kept electronically by the courts/i,
    'the record never says the registers are kept by the courts');
  assert.match(published(r), /not the register itself|designated retrieval system|retrieval route/i,
    'the record never distinguishes the portal from the register');
  // The old aggregator framing must not come back either.
  assert.ok(!/\baggregating the (?:commercial|German)/i.test(r.description),
    'the description reverts to aggregator framing');
});

// --- 2. France: a consultation layer, not the legal source ----------------------

test('fr-annuaire-entreprises identifies itself as an access layer, not the source', () => {
  const r = byId.get('fr-annuaire-entreprises');
  assert.ok(r, 'fr-annuaire-entreprises is missing');
  assert.ok(!r.registryTypes.includes('company-register'),
    'a consultation interface is typed as the company register');
  assert.ok(!r.registryTypes.includes('business-entity-register'),
    'a consultation interface is typed as a business entity register');
  assert.strictEqual(r.primaryRegistryType, 'corporate-number-database');
  const prose = published(r);
  assert.match(prose, /search interface|consultation interface/i,
    'the record never describes itself as an interface');
  assert.match(prose, /not the legal source of record|rather than holding a register of its own/i,
    'the record never disclaims being the source of record');
  // The disclaimer must survive in the CAVEAT surface specifically. A reader
  // who skims the description and jumps to the cons must still be told; and a
  // later edit that guts the cons must not pass merely because the description
  // still carries the sentence.
  assert.match([...r.cons, ...r.notRecommendedFor].join(' '),
    /not the legal source of record|remains? the authoritative source|originating register/i,
    'the source-of-record caveat is missing from cons and notRecommendedFor');
  // The upstream registers must be named, or "interface" is an empty word.
  assert.match(prose, /Registre National des Entreprises/,
    'the record never names the upstream register it draws on');
  assert.match(prose, /Sirene/i, 'the record never names the Sirene base');
});

// --- 3 & 4. Spain: no insolvency claim, and not the underlying register ---------

test('es-registradores carries no insolvency-register classification', () => {
  const r = byId.get('es-registradores');
  assert.ok(r, 'es-registradores is missing');
  assert.ok(!r.registryTypes.includes('insolvency-register'),
    'the Colegio is typed as an insolvency register; RD 892/2013 places the Registro Público '
    + 'Concursal under the Ministry of Justice');
  assert.ok(!r.registryTypes.includes('beneficial-ownership-register'),
    'the Colegio is typed as a beneficial-ownership register with no official source establishing it');
});

test('es-registradores does not identify the Colegio as the underlying legal register', () => {
  const r = byId.get('es-registradores');
  assert.ok(!r.registryTypes.includes('company-register'),
    'the professional body is typed as the Spanish company register');
  const prose = published(r);
  assert.match(prose, /not itself the mercantile register|professional corporation|operates the (?:shared )?access service/i,
    'the record never distinguishes the professional body from the registers');
  assert.match(prose, /Registro Mercantil/,
    'the record never names the actual mercantile register');
  // The delegated insolvency role must be stated as delegated, not owned.
  assert.match(prose, /Ministry of Justice/,
    'the record never names the body responsible for the insolvency register');
  assert.ok(!/operates the .{0,40}insolvency regist/i.test(prose),
    'the record still says the Colegio operates the insolvency register');
});

// --- 5. Italy: the technical provider is not the statutory operator -------------

test('it-registro-imprese does not identify InfoCamere as the statutory operator', () => {
  const r = byId.get('it-registro-imprese');
  assert.ok(r, 'it-registro-imprese is missing');
  assert.ok(!/InfoCamere/i.test(r.operator.name),
    'the technical consortium is named as the operator of a statutory register');
  assert.match(r.operator.name, /Chambers of Commerce/i,
    'the operator is not the Chambers of Commerce');
  assert.strictEqual(r.operator.type, 'public-law-body',
    'a public-law register is typed with a non-public operator type');
  // The real technical role is kept, not deleted.
  assert.match(`${published(r)} ${r.editorNotes}`, /consortium/i,
    'the technical provider role was deleted rather than moved to a factual note');
  // Italy genuinely IS the constitutive register — unlike DE/FR/ES.
  assert.ok(r.registryTypes.includes('company-register'),
    'Italy is the one corrected record that really is the register; its type must remain');
});

// --- 6. Georgia: an operator is an office, not a person -------------------------

test('us-georgia-business-search operator is institutional, not an individual', () => {
  const r = byId.get('us-georgia-business-search');
  assert.ok(r, 'us-georgia-business-search is missing');
  assert.ok(!/Raffensperger/i.test(JSON.stringify(r)),
    'the record still names the sitting officeholder anywhere');
  assert.match(r.operator.name, /Office of the Georgia Secretary of State/,
    'the operator is not the institutional office');
});

test('no government record names a current officeholder as its operator', () => {
  // Deliberately NARROW. General named-entity detection over official
  // department names produces nothing but false positives — "Secretary of
  // State, Business Registration Division" is institutional and must pass.
  // This probe looks for the exact shape the Georgia defect had: a
  // parenthetical inside an operator name whose content is a bare personal
  // name, i.e. two or three capitalised words containing no organisational
  // word at all.
  const ORG_WORD = /\b(?:Office|Department|Division|Bureau|Ministry|Agency|Commission|Authority|Board|Council|Service|Services|Registry|Registrar|Register|Secretary|State|Affairs|Corporations|Business|Commercial|General|Treasury|Revenue|Justice|Chamber|Chambers|Court|Courts|Administration|Administrations|Institute|Centre|Center|Government|Federal|National|Republic|Union|Bank|Trade|Industry|Economy|Health|Consumer|Protection|Regulation|Licensing|Standards|Inspectorate|Committee|Association|Corporation|Colegio|Camere|Justiz|Bundes|Land|Länder)\b/i;
  const PARENTHETICAL = /\(([^)]+)\)/g;
  const PERSON_SHAPED = /^[A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]+$/;
  const offenders = [];
  for (const r of ALL) {
    const n = r.operator && r.operator.name ? r.operator.name : '';
    for (const m of n.matchAll(PARENTHETICAL)) {
      const inner = m[1].trim();
      // An abbreviation or an org name in brackets is fine; a bare person is not.
      if (ORG_WORD.test(inner)) continue;
      if (PERSON_SHAPED.test(inner)) offenders.push(`${r.id}: ${n}`);
    }
  }
  assert.deepStrictEqual(offenders, [],
    'an operator field names the individual holding the office rather than the office');
});

// --- 7 & 8. Backlog integrity ---------------------------------------------------

const BACKLOG = fs.readFileSync(
  path.join(ROOT, 'docs/business-directories-verification-backlog.md'), 'utf8');

test('no published record remains listed in a pending backlog section', () => {
  const lines = BACKLOG.split('\n');
  let section = '(top)';
  const stale = [];
  for (const line of lines) {
    if (/^###? /.test(line)) { section = line.replace(/^#+\s*/, '').trim(); continue; }
    if (!/^\|/.test(line) || /^\|\s*-+/.test(line)) continue;
    if (!/pending|held/i.test(section)) continue;
    const cell = (line.split('|')[1] || '').replace(/[*`]/g, '').trim().toLowerCase();
    if (!cell) continue;
    for (const r of ALL) {
      const n = r.name.toLowerCase();
      // Names must be distinctive enough to match on. Several published
      // records are called simply "Business Search", which appears inside
      // unrelated backlog rows ("SBA Small Business Search") and would produce
      // a false positive on every one of them.
      if (n.length > 24 && cell.includes(n)) { stale.push(`[${section}] ${cell} -> ${r.id}`); break; }
    }
  }
  assert.deepStrictEqual(stale, [],
    'a published record is still listed as pending or held in the backlog');
});

test('no stale "no registry type exists" claim remains in the backlog', () => {
  // Every type named below now exists. A backlog section asserting otherwise is
  // not merely stale, it states something false about the current schema.
  for (const type of ['exclusion-and-debarment-register', 'public-procurement-notice-database',
    'registered-design-register']) {
    assert.ok(S.REGISTRY_TYPES.includes(type), `${type} is missing from the enum`);
  }
  assert.ok(!/no registry type\s+in the closed list honestly describes/i.test(BACKLOG),
    'the backlog still claims no registry type describes an exclusion register');
  assert.ok(!/no registry type (?:exists|is available)/i.test(BACKLOG),
    'the backlog still asserts a registry type does not exist');
});

// --- 9 & 10. Stability of everything the correction must not touch --------------

test('corrected records keep their identity, routes, dates and DR provenance', () => {
  const PINNED = {
    'de-registerportal': { slug: 'registerportal', website: 'https://www.handelsregister.de/rp_web/welcome.xhtml', lastVerified: '2026-08-04', domainRating: 79 },
    'fr-annuaire-entreprises': { slug: 'annuaire-des-entreprises', website: 'https://annuaire-entreprises.data.gouv.fr/', lastVerified: '2026-08-04', domainRating: 89 },
    'es-registradores': { slug: 'colegio-de-registradores', website: 'https://www.registradores.org/', lastVerified: '2026-08-04', domainRating: 80 },
    'it-registro-imprese': { slug: 'registro-imprese', website: 'https://www.registroimprese.it/', lastVerified: '2026-08-04', domainRating: 78 },
    'us-georgia-business-search': { slug: 'georgia-business-search', website: 'https://ecorp.sos.ga.gov/BusinessSearch', lastVerified: '2026-08-05', domainRating: null },
  };
  for (const [id, pin] of Object.entries(PINNED)) {
    const r = byId.get(id);
    assert.ok(r, `${id} is missing`);
    for (const [k, v] of Object.entries(pin)) {
      assert.strictEqual(r[k], v, `${id}.${k} changed during a factual correction`);
    }
    assert.ok(r.verification.reviewers.length > 0, `${id} lost its reviewer`);
    assert.strictEqual(S.computeScore(r.scoreFactors), r.petroHrysScore, `${id} score does not reproduce`);
    // The generated route must still exist at the same address.
    const page = path.join(ROOT, 'research/business-directories', r.country, r.slug, 'index.html');
    assert.ok(fs.existsSync(page), `${id} route moved or disappeared`);
  }
});

test('the correction created no new Domain Rating measurement', () => {
  const measured = ALL.filter((r) => r.domainRating !== null);
  const domains = new Set(measured.map((r) => r.metricsProvenance.domainRating.measuredDomain));
  assert.strictEqual(domains.size, 64, `${domains.size} measured domains; the freeze pins 64`);
  for (const r of measured) {
    assert.strictEqual(r.metricsProvenance.domainRating.status, 'historicalSnapshot', r.id);
    assert.ok(r.metricsProvenance.domainRating.measuredAt <= '2026-08-04',
      `${r.id} carries a measurement dated after the freeze`);
  }
  assert.deepStrictEqual(S.sharedDomainSnapshotProblems(ALL), []);
});

// --- the general rule this wave established -------------------------------------

test('no record presents an access portal or interface as the legal source of record', () => {
  // Any record whose own prose calls itself a portal, interface or access layer
  // must not simultaneously be typed as the constitutive register.
  const CONSTITUTIVE = ['company-register', 'business-entity-register'];
  const offenders = [];
  for (const r of ALL) {
    const d = r.description || '';
    const callsItselfAnInterface = /\b(?:access (?:portal|layer|interface)|search interface|consultation interface|retrieval (?:route|system))\b/i.test(d);
    const typedConstitutive = r.registryTypes.some((t) => CONSTITUTIVE.includes(t));
    if (callsItselfAnInterface && typedConstitutive) offenders.push(r.id);
  }
  assert.deepStrictEqual(offenders, [],
    'a record describes itself as an interface while being typed as the register it fronts');
});
