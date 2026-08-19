// scripts/tests/bd-europe-financial.test.cjs
'use strict';

// Wave 2A added eight Continental European financial and regulatory registries.
//
// This wave was researched and adversarially reviewed DIRECTLY, in two separate
// passes, because the agent fleet was unavailable. Nothing here rests on subagent
// output. The guards below therefore matter more than usual: they are the only
// standing check on work that had no independent reviewer.
//
// The distinctions this wave has to hold:
//
//   * A REGISTER KEEPER IS NOT A REGULATOR. ORIAS keeps the French official
//     intermediaries register under Treasury supervision; it does not supervise
//     the market. Describing it as the regulator would be the same error class as
//     calling the Colegio de Registradores the Spanish company register.
//   * A SEARCH SYSTEM IS NOT SPLIT BY ITS OWN FILTERS. REGAFI/REFASSU is one
//     portal serving two populations, and ČNB's application is one system with
//     search, lists and time-series views. Each is ONE record.
//   * TWO REGISTERS ON ONE HOST ARE STILL TWO REGISTERS. The Bank of Spain
//     publishes entities and agents as separately named registers.
//   * AN INCOMPLETE SEARCH MUST SAY SO. The Polish supervisor states on its own
//     search page that some of its registers are not included.
//   * A LOGIN PAGE IS NOT AN OPEN REGISTRY. The Italian insurance supervisor's
//     portal redirects to a one-time-password login and is deliberately absent.

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

const WAVE = ['fr-regafi', 'fr-orias', 'de-bafin-unternehmensdatenbank',
  'pl-knf-wyszukiwarka-podmiotow', 'cz-cnb-jerrs', 'es-bde-registro-entidades',
  'es-bde-registro-agentes', 'it-banca-ditalia-albi-elenchi'];
const NEW = WAVE.map((id) => byId.get(id));

const visible = (r) => [r.description, ...r.pros, ...r.cons, ...r.bestFor, ...r.notRecommendedFor].join(' ');
const limitsOf = (r) => [...r.cons, ...r.notRecommendedFor].join(' ');
const readPage = (r) => fs.readFileSync(
  path.join(ROOT, 'research', 'business-directories', r.country, r.slug, 'index.html'), 'utf8');

// --- non-vacuity -----------------------------------------------------------------

test('every record this wave claims to have published exists', () => {
  assert.strictEqual(WAVE.length, 8, 'the wave manifest changed size without this test changing');
  for (const [i, id] of WAVE.entries()) assert.ok(NEW[i], `${id} is named by this suite but is not in the registry`);
  assert.deepStrictEqual([...new Set(NEW.map((r) => r.country))].sort(),
    ['czech-republic', 'france', 'germany', 'italy', 'poland', 'spain'],
    'the wave no longer spans exactly the six Wave 2A countries');
});

// --- a register keeper is not a regulator --------------------------------------------

test('ORIAS is a register keeper under supervision, never the regulator', () => {
  const r = byId.get('fr-orias');
  assert.notStrictEqual(r.operator.type, 'regulator',
    'ORIAS is typed as a regulator; it keeps an official register under ministerial supervision');
  assert.match(r.editorNotes, /deliberately NOT described as the regulator/,
    'the ORIAS notes no longer record that it is not the regulator');
  assert.match(limitsOf(r), /keeps the register under ministerial supervision|does not supervise the market/i,
    'the ORIAS page never tells a reader it is not the regulator');
  // Compulsory registration is the fact that makes the register meaningful.
  assert.match(visible(r), /compulsory|obligator/i,
    'the ORIAS page never states that registration is compulsory');
});

test('the supervisors are typed as regulators', () => {
  for (const id of ['fr-regafi', 'de-bafin-unternehmensdatenbank', 'pl-knf-wyszukiwarka-podmiotow',
    'cz-cnb-jerrs', 'es-bde-registro-entidades', 'es-bde-registro-agentes',
    'it-banca-ditalia-albi-elenchi']) {
    assert.strictEqual(byId.get(id).operator.type, 'regulator', `${id} is not typed as a regulator`);
  }
});

// --- one system is one record ----------------------------------------------------------

test('a search system is not split by the filters or output modes it offers', () => {
  // REGAFI/REFASSU is one portal serving two populations.
  const regafiHosted = ALL.filter((r) => /(^|\.)regafi\.fr$/.test(new URL(r.website).hostname));
  assert.strictEqual(regafiHosted.length, 1,
    'more than one record is filed on the REGAFI host; it is one portal serving two registers');
  assert.match(byId.get('fr-regafi').editorNotes, /ONE portal serving two populations/,
    'the REGAFI record no longer records the one-portal decision');
  // The Czech application is one system with search, lists and time series.
  const cnbHosted = ALL.filter((r) => /(^|\.)cnb\.cz$/.test(new URL(r.website).hostname));
  assert.strictEqual(cnbHosted.length, 1, 'the Czech application was split into several records');
  assert.match(byId.get('cz-cnb-jerrs').editorNotes, /ONE record rather than three/,
    'the Czech record no longer records the one-system decision');
});

test('two separately named registers on one host are two records with distinct identities', () => {
  const a = byId.get('es-bde-registro-entidades');
  const b = byId.get('es-bde-registro-agentes');
  for (const r of [a, b]) {
    assert.ok(r.resourceIdentity, `${r.id} shares app.bde.es but declares no resourceIdentity`);
    assert.strictEqual(r.resourceIdentity.canonicalDomain, 'app.bde.es');
  }
  assert.notStrictEqual(a.resourceIdentity.systemKey, b.resourceIdentity.systemKey,
    'the two Bank of Spain registers claim the same systemKey');
  assert.strictEqual(a.resourceIdentity.sharedHostGroup, b.resourceIdentity.sharedHostGroup,
    'the two Bank of Spain registers claim different shared host groups');
  // And each must tell a reader the other exists, or the split is invisible.
  assert.match(limitsOf(a), /agents/i, 'the entities register never points at the agents register');
  assert.match(limitsOf(b), /institutions|entities/i, 'the agents register never points at the entities register');
});

// --- an incomplete search must say so ----------------------------------------------------

test('the Polish search carries its own completeness caveat where a reader meets it', () => {
  const r = byId.get('pl-knf-wyszukiwarka-podmiotow');
  assert.match(limitsOf(r), /not included|explicitly incomplete|registers that this search does not include/i,
    'the KNF record does not tell a reader the search is incomplete');
  assert.match(limitsOf(r), /absence here is not absence from supervision|nil result/i,
    'the KNF record does not say what a nil result fails to prove');
  // Match an AFFIRMATIVE completeness claim only. An earlier form of this check
  // matched the disclaimer itself ("does not cover every register"), which is the
  // opposite of the defect and exactly the sentence that should be there.
  assert.ok(!/(?<!not )(?:covers|contains|includes) (?:every|all) (?:register|entit)/i.test(r.description),
    'the KNF description claims completeness the operator disclaims');
});

// --- access truth ------------------------------------------------------------------------

test('no record in this wave claims search behaviour it did not observe', () => {
  for (const r of NEW) {
    const pa = r.publicAccess;
    assert.strictEqual(pa.accessLevel, 'unknown',
      `${r.id} claims an access level; no search was executed anywhere in this wave`);
    assert.strictEqual(pa.searchUrl, null, `${r.id} publishes a search URL it never exercised`);
    for (const k of ['freeToSearch', 'loginRequired', 'identityVerificationRequired',
      'captcha', 'geographicRestriction', 'paidDocumentsAvailable']) {
      assert.strictEqual(pa[k], null, `${r.id} asserts ${k} without observing it`);
    }
    assert.ok(pa.notes && pa.notes.trim().length > 60, `${r.id} gives no access explanation`);
    assert.deepStrictEqual(S.accessContradictions(pa), [], `${r.id} has contradictory access fields`);
  }
});

test('an API is never treated as evidence of public interface access', () => {
  const r = byId.get('fr-regafi');
  assert.match(r.publicAccess.notes, /an API is not evidence of public interface behaviour/i,
    'the REGAFI record no longer separates its API from its public interface');
  assert.strictEqual(r.publicAccess.freeToSearch, null);
});

test('a credential-gated portal was not published as an open registry', () => {
  // The Italian insurance supervisor's portal redirects to a one-time-password
  // login. It must not appear, and the reason must be recorded.
  const hosts = ALL.map((r) => new URL(r.website).hostname);
  assert.ok(!hosts.some((h) => /infostat-ivass/.test(h)),
    'the credential-gated insurance portal was published as a registry');
  assert.match(byId.get('it-banca-ditalia-albi-elenchi').editorNotes,
    /one-time-password login|remains unpublished pending an open access route/i,
    'the reason the insurance portal is absent is no longer recorded');
});

// --- classification ------------------------------------------------------------------------

test('every record is classified by its regulated population, not by a broad default', () => {
  for (const r of NEW) {
    assert.ok(r.registryTypes.length > 0, `${r.id} has no registry type`);
    for (const t of r.registryTypes) assert.ok(T.REGISTRY_TYPE_BY_ID.has(t), `${r.id} uses undefined type "${t}"`);
    assert.strictEqual(r.primaryRegistryType, r.registryTypes[0], `${r.id} primary type is not first`);
    // Financial supervisory populations must not be typed as the non-financial
    // sectoral register, which the boundary note reserves for other sectors.
    assert.ok(!r.registryTypes.includes('regulated-operator-register'),
      `${r.id} carries the non-financial sectoral type against its boundary note`);
    assert.ok(!r.registryTypes.includes('company-register'),
      `${r.id} is typed as a company register; supervisory registration is not incorporation`);
  }
});

// --- publication truth -----------------------------------------------------------------------

test('every record meets the publication contract and says what it does not prove', () => {
  for (const r of NEW) {
    assert.match(r.website, /^https:\/\//, `${r.id} is not https`);
    assert.ok(S.OPERATOR_TYPES.includes(r.operator.type), `${r.id} operator type invalid`);
    assert.match(r.operator.officialUrl, /^https:\/\//, `${r.id} operator has no official URL`);
    assert.ok(r.description.length > 120, `${r.id} description is thin`);
    assert.ok(r.pros.length >= 3 && r.cons.length >= 3, `${r.id} has a thin assessment`);
    assert.strictEqual(S.computeScore(r.scoreFactors), r.petroHrysScore, `${r.id} score does not reproduce`);
    assert.strictEqual(r.nextVerification, S.nextVerificationFor(r), `${r.id} date was hand-set`);
    assert.strictEqual(r.scope, 'national', `${r.id} is scoped ${r.scope}`);
    assert.strictEqual(r.submissionModel, 'notApplicable', `${r.id} is ${r.submissionModel}`);
    for (const label of ['LEGAL SOURCE OF RECORD:', 'RESPONSIBLE AUTHORITY:',
      'TECHNICAL PLATFORM:', 'PUBLIC ACCESS INTERFACE:']) {
      assert.ok(r.editorNotes.includes(label), `${r.id} is missing "${label}"`);
    }
    // Supervision is not endorsement — the recurring overclaim in this sector.
    assert.match(limitsOf(r), /not a statement about|is not endorsement|does not establish|proves nothing|means nothing/i,
      `${r.id} never says what supervision does not establish`);
  }
});

test('no record implies supervision proves soundness', () => {
  for (const r of NEW) {
    const text = visible(r);
    assert.ok(!/guarantees? (?:solvency|soundness|safety)/i.test(text),
      `${r.id} claims supervision guarantees soundness`);
    assert.ok(!/proves? (?:that )?the (?:firm|entity|institution) is (?:safe|sound|solvent)/i.test(text),
      `${r.id} claims an entry proves soundness`);
    // Each must positively disclaim it.
    assert.match(limitsOf(r), /solven|conduct|soundness|condition/i,
      `${r.id} never disclaims solvency or conduct`);
  }
});

// --- metrics and pages ---------------------------------------------------------------------

// POLICY REVERSAL — the Domain Rating collection freeze has been lifted. This
// test asserted that no record in the wave carried a Domain Rating, that every
// metricStatus stayed "unknown", and that exactly 64 domains were measured.
// Every domain is now read from Ahrefs' free public
// /v3/public/domain-rating-free endpoint, so all three are false. The invariant
// they protected — a rating is never INVENTED and describes the record's OWN
// domain — is asserted directly. The shared-domain check was never about the
// freeze and is unchanged; it matters most here, because the two Bank of Spain
// registers are separate records published on one measured domain.
test('no record in this wave invents a metric', () => {
  for (const r of NEW) {
    assert.deepStrictEqual(S.domainRatingProblems(r), [], `${r.id} has an unusable Domain Rating`);
    assert.strictEqual(r.metricStatus, 'measured', `${r.id} holds a reading but does not say so`);
    assert.strictEqual(r.metricsProvenance.domainRating.measuredDomain, S.normaliseDomain(r.website),
      `${r.id} reports a rating measured on a domain other than its own`);
  }
  // The two app.bde.es records are the concrete case: one domain, one reading.
  const entidades = byId.get('es-bde-registro-entidades');
  const agentes = byId.get('es-bde-registro-agentes');
  assert.strictEqual(entidades.domainRating, agentes.domainRating,
    'the two Bank of Spain registers report different ratings for one measured domain');
  assert.deepStrictEqual(entidades.metricsProvenance.domainRating,
    agentes.metricsProvenance.domainRating,
    'the two Bank of Spain registers report different provenance for one measured domain');
  assert.deepStrictEqual(S.sharedDomainSnapshotProblems(ALL), [], 'a shared-domain snapshot became inconsistent');
  // FIXTURES. The corpus no longer holds an unmeasured record, so "missing is
  // not zero" is exercised on objects built here rather than dropped.
  assert.ok(S.domainRatingProblems({ domainRating: 82, metricsProvenance: {} }).length > 0,
    'a bare number with no provenance must be rejected as an invented metric');
  assert.ok(S.domainRatingProblems({
    domainRating: null,
    metricsProvenance: {
      domainRating: {
        provider: 'Ahrefs',
        measuredAt: '2026-08-19',
        status: 'publicApiReading',
        measuredDomain: 'app.bde.es',
      },
    },
  }).length > 0, 'provenance for a rating that is not set must be rejected');
  assert.deepStrictEqual(S.domainRatingProblems({ domainRating: null, metricsProvenance: {} }), [],
    'an unmeasured record must be allowed to carry no rating, rather than a zero');
});

test('every record has a page that leaks no schema and keeps its distinction', () => {
  for (const r of NEW) {
    const html = readPage(r);
    const body = html.replace(/<[^>]+>/g, ' ');
    for (const leak of ['primaryRegistryType', 'scoreFactors', 'metricsProvenance', 'notApplicable',
      'resourceIdentity', 'entityType']) {
      assert.ok(!body.includes(leak), `${r.id} page leaks the schema term ${leak}`);
    }
    assert.ok(!body.includes('FOUR ROLES, determined separately'), `${r.id} page publishes the editor notes`);
  }
});
