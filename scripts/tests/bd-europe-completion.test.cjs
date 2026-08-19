// scripts/tests/bd-europe-completion.test.cjs
'use strict';

// Wave 1E.1 completed Continental Europe with eight records. Its single stated
// acceptance criterion was this:
//
//   Where an official portal is only an ACCESS INTERFACE to another state
//   register, that must be explicit in BOTH the data model and the published
//   page text. No consultation interface may be described as the legal source of
//   record without direct official evidence.
//
// Three records in this wave are publication or consultation surfaces rather
// than constitutive registers, and the tests below are mostly about them:
//
//   * BODACC gives publicity to acts recorded in the RNE. It is a bulletin. It
//     must never be typed as a company or business-entity register.
//   * Insolvenzbekanntmachungen is where the insolvency COURTS make statutory
//     announcements. The proceeding is the court's; the portal is the medium.
//   * The Czech beneficial ownership register was CLOSED to the public on
//     17 December 2025. A record that let a reader assume otherwise would be
//     worse than no record.
//
// Two further failure modes are pinned because they were caught in this wave
// rather than avoided by luck: an access position asserted from documentation
// instead of observation (KRZ), and a CAPTCHA assumed absent (OEPM).

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

const WAVE = ['pl-krz', 'cz-evidence-skutecnych-majitelu', 'de-dpmaregister',
  'de-insolvenzbekanntmachungen', 'fr-bodacc', 'es-oepm', 'es-cnmv', 'it-runts'];
const NEW = WAVE.map((id) => byId.get(id));

// Everything a reader can actually see on the page, which is what the
// acceptance criterion is about — not the editor notes, which are not published.
const visible = (r) => [r.description, ...r.pros, ...r.cons, ...r.bestFor, ...r.notRecommendedFor].join(' ');

// --- non-vacuity ---------------------------------------------------------------
// Every test below iterates NEW or greps a page. If an id were renamed, the
// loops would silently pass over nothing. This is the guard against that.

test('every record this wave claims to have published exists', () => {
  assert.strictEqual(WAVE.length, 8, 'the wave manifest changed size without this test changing');
  for (const [i, id] of WAVE.entries()) {
    assert.ok(NEW[i], `${id} is named by this suite but is not in the registry`);
  }
  const countries = new Set(NEW.map((r) => r.country));
  assert.deepStrictEqual([...countries].sort(),
    ['czech-republic', 'france', 'germany', 'italy', 'poland', 'spain'],
    'the wave no longer spans exactly the six target countries');
});

// --- the acceptance criterion ---------------------------------------------------

test('a publication medium is never typed as a register of the thing it announces', () => {
  // BODACC publishes acts recorded elsewhere. Typing it as a company or
  // business-entity register is the exact error corrected for Germany, France
  // and Spain in Wave 1D.
  const bodacc = byId.get('fr-bodacc');
  for (const forbidden of ['company-register', 'business-entity-register', 'corporate-number-database']) {
    assert.ok(!bodacc.registryTypes.includes(forbidden),
      `BODACC is typed ${forbidden}; it is a bulletin, not a register`);
  }
  assert.strictEqual(bodacc.primaryRegistryType, 'public-filing-database');

  // And the distinction has to be visible on the page, not only in editor notes.
  assert.match(visible(bodacc), /publicity|publishes acts|announcement/i,
    'the BODACC page never says it publishes rather than registers');
  assert.match(visible(bodacc), /not (?:the register|constitute)|does not constitute|publication medium/i,
    'the BODACC page never states that it is not the register');
});

test('the German insolvency portal is not presented as the register of the proceeding', () => {
  const p = byId.get('de-insolvenzbekanntmachungen');
  assert.ok(!p.registryTypes.includes('company-register'), 'typed as a company register');
  // The published text must attribute the proceeding to the courts.
  assert.match(visible(p), /court/i, 'the page never mentions the courts at all');
  assert.match(visible(p), /publication medium|not the register|conducted and recorded by the court/i,
    'the page never distinguishes the medium from the register');
});

test('records that are access surfaces name the body that actually holds the record', () => {
  // Editor notes carry the four roles; the legal source clause must not simply
  // repeat the operator, which would be the role merge this dataset guards.
  const surfaces = ['fr-bodacc', 'de-insolvenzbekanntmachungen'];
  for (const id of surfaces) {
    const r = byId.get(id);
    const legal = /LEGAL SOURCE OF RECORD: (.*?) RESPONSIBLE AUTHORITY:/s.exec(r.editorNotes);
    assert.ok(legal, `${id} has no legal-source clause`);
    assert.ok(legal[1].length > 80, `${id} legal-source clause is a stub`);
    assert.match(legal[1], /court|registr|elsewhere|recorded/i,
      `${id} legal-source clause does not say where the record is actually held`);
  }
});

// --- the four roles -------------------------------------------------------------

test('every record documents all four roles separately', () => {
  for (const r of NEW) {
    for (const label of ['LEGAL SOURCE OF RECORD:', 'RESPONSIBLE AUTHORITY:',
      'TECHNICAL PLATFORM:', 'PUBLIC ACCESS INTERFACE:']) {
      assert.ok(r.editorNotes.includes(label), `${r.id} is missing "${label}"`);
    }
  }
});

test('a technical platform is never silently promoted to responsible authority', () => {
  for (const r of NEW) {
    const m = /TECHNICAL PLATFORM: (.*?) PUBLIC ACCESS INTERFACE:/s.exec(r.editorNotes);
    assert.ok(m, `${r.id} has no technical-platform clause`);
    const platform = m[1];
    // Where no platform was established, the record must say so rather than
    // leave the field to be read as "the operator does it".
    if (/not established|none found|not separately established/i.test(platform)) continue;
    assert.ok(!platform.includes(r.operator.name),
      `${r.id} names its operator as the technical platform`);
  }
  // BODACC is the positive case: a real, distinct platform provider.
  assert.match(byId.get('fr-bodacc').editorNotes, /TECHNICAL PLATFORM: Opendatasoft/,
    'the BODACC platform is no longer recorded as distinct from DILA');
  assert.strictEqual(byId.get('fr-bodacc').operator.name,
    'Direction de l’information légale et administrative');
});

test('no operator field names an individual officeholder', () => {
  // BODACC's legal-notice page names a directrice de la publication. An operator
  // identifies an office; a named person goes stale and was excluded on purpose.
  for (const r of NEW) {
    assert.ok(!/\b(Véronique|Lehideux)\b/.test(JSON.stringify(r)),
      `${r.id} carries the name of an individual officeholder`);
  }
});

// --- access truth ---------------------------------------------------------------

test('an access position that was not observed is recorded as unknown', () => {
  // KRZ is the case: the host serves an Incapsula interstitial and there is no
  // sibling API. The Act says the register is public, but a statutory right is
  // not an observed behaviour, and the record must not convert one into the other.
  const krz = byId.get('pl-krz');
  assert.strictEqual(krz.publicAccess.accessLevel, 'unknown',
    'KRZ asserts an access position that was never observed');
  assert.strictEqual(krz.publicAccess.searchUrl, null, 'KRZ publishes an unverified search URL');
  for (const k of ['freeToSearch', 'loginRequired', 'identityVerificationRequired',
    'captcha', 'geographicRestriction', 'paidDocumentsAvailable']) {
    assert.strictEqual(krz.publicAccess[k], null, `KRZ asserts ${k} without observing it`);
  }
  assert.match(krz.publicAccess.notes, /not (?:be )?observed/i,
    'KRZ does not explain why its access position is unknown');

  // The general rule, applied to the whole wave.
  for (const r of NEW) {
    if (r.publicAccess.accessLevel !== 'unknown') continue;
    assert.strictEqual(r.publicAccess.searchUrl, null, `${r.id} publishes an unobserved search URL`);
    assert.ok(r.publicAccess.notes && r.publicAccess.notes.trim(), `${r.id} is unknown but explains nothing`);
  }
});

test('an observed CAPTCHA is recorded rather than assumed absent', () => {
  // The OEPM patents search loads Google reCAPTCHA. An earlier draft asserted
  // there was none. Asserting absence is the recurring failure mode here.
  assert.strictEqual(byId.get('es-oepm').publicAccess.captcha, true,
    'the OEPM reCAPTCHA was recorded as absent or unknown');
  assert.match(visible(byId.get('es-oepm')), /captcha/i,
    'the OEPM page does not disclose the CAPTCHA to a reader');

  // Nowhere in the wave is a CAPTCHA asserted to be absent, because absence was
  // never established for any of these hosts.
  for (const r of NEW) {
    assert.notStrictEqual(r.publicAccess.captcha, false,
      `${r.id} claims no CAPTCHA; absence was not established for any host in this wave`);
  }
});

test('a register closed to the public says so, in the data and on the page', () => {
  const esm = byId.get('cz-evidence-skutecnych-majitelu');
  assert.strictEqual(esm.publicAccess.accessLevel, 'restricted', 'ESM is not marked restricted');
  assert.strictEqual(esm.publicAccess.loginRequired, true);
  assert.strictEqual(esm.publicAccess.identityVerificationRequired, true);
  assert.strictEqual(esm.publicAccess.searchUrl, null, 'ESM publishes a search URL that no longer searches');
  // The date matters: a reader has to know this is a change, not a design.
  assert.match(visible(esm), /17 December 2025/,
    'the ESM page does not tell a reader when public access was withdrawn');
  assert.match(visible(esm), /no public search/i,
    'the ESM page does not state plainly that there is no public search');
});

test('no record asserts an access fact that contradicts another', () => {
  for (const r of NEW) {
    assert.deepStrictEqual(S.accessContradictions(r.publicAccess), [],
      `${r.id} has contradictory access fields`);
  }
});

// --- classification -------------------------------------------------------------

test('separate intellectual property rights are typed separately', () => {
  // The vocabulary requires patents, trade marks and designs to be recorded as
  // distinct types even where one office runs all three.
  for (const id of ['de-dpmaregister', 'es-oepm']) {
    const r = byId.get(id);
    for (const t of ['patent-register', 'trademark-register', 'registered-design-register']) {
      assert.ok(r.registryTypes.includes(t), `${id} does not record ${t}`);
    }
  }
});

test('a financial supervisor is not typed as a generic regulated-operator register', () => {
  // The regulated-operator boundary note sends financial firms to the financial
  // services type. An earlier draft carried both.
  const cnmv = byId.get('es-cnmv');
  assert.strictEqual(cnmv.primaryRegistryType, 'financial-services-register');
  assert.ok(!cnmv.registryTypes.includes('regulated-operator-register'),
    'CNMV is typed regulated-operator-register against that type’s own boundary note');
  // securities-filing-database says it is usually recorded with public-filing-database.
  assert.ok(cnmv.registryTypes.includes('securities-filing-database'));
  assert.ok(cnmv.registryTypes.includes('public-filing-database'),
    'CNMV records securities filings but not the filing-database pairing the vocabulary expects');
});

test('every registry type used is in the closed vocabulary and primary is first', () => {
  for (const r of NEW) {
    assert.ok(r.registryTypes.length > 0, `${r.id} has no registry type`);
    for (const t of r.registryTypes) {
      assert.ok(T.REGISTRY_TYPE_BY_ID.has(t), `${r.id} uses undefined type "${t}"`);
    }
    assert.strictEqual(r.primaryRegistryType, r.registryTypes[0], `${r.id} primary type is not first`);
  }
});

// --- the publication contract ----------------------------------------------------

test('every record meets the publication contract', () => {
  for (const r of NEW) {
    assert.match(r.website, /^https:\/\//, `${r.id} website is not https`);
    assert.ok(r.operator && r.operator.name.trim(), `${r.id} has no operator`);
    assert.ok(S.OPERATOR_TYPES.includes(r.operator.type), `${r.id} operator type invalid`);
    assert.ok(r.operator.officialUrl && r.operator.officialUrl.startsWith('https://'),
      `${r.id} has no official URL for its operator`);
    assert.ok(S.ACCESS_LEVELS.includes(r.publicAccess.accessLevel), `${r.id} access level invalid`);
    assert.ok(r.description.length > 120, `${r.id} description is thin`);
    assert.ok(r.pros.length >= 3 && r.cons.length >= 3, `${r.id} has a thin assessment`);
    assert.ok(r.bestFor.length > 0 && r.notRecommendedFor.length > 0, `${r.id} has no audience guidance`);
    assert.strictEqual(S.computeScore(r.scoreFactors), r.petroHrysScore, `${r.id} score does not reproduce`);
    assert.strictEqual(r.nextVerification, S.nextVerificationFor(r), `${r.id} verification date was hand-set`);
    assert.strictEqual(r.submissionModel, 'notApplicable', `${r.id} is ${r.submissionModel}`);
    assert.strictEqual(r.verification.source, 'government-register', `${r.id} is not sourced to a register`);
    // Clause 4 of the content contract: say what it does NOT provide.
    assert.match([...r.cons, ...r.notRecommendedFor].join(' '),
      /does not|is not|not the register|constitutes nothing|no public search|not a (?:credit|statement)/i,
      `${r.id} never says what it does not provide`);
  }
});

test('no record overclaims what inclusion proves', () => {
  for (const r of NEW) {
    const text = visible(r);
    assert.ok(!/guarantee(?:s|d)? (?:solvency|compliance|quality)/i.test(text),
      `${r.id} claims inclusion guarantees something`);
    assert.ok(!/proves? (?:that )?(?:the )?(?:company|entity|firm) is (?:safe|legitimate|trustworthy)/i.test(text),
      `${r.id} claims inclusion proves trustworthiness`);
  }
});

// --- metrics --------------------------------------------------------------------

// WAS: 'no record added by this wave carries a metric'. Domain Rating is no
// longer among the metrics this wave may not carry: the collection freeze has
// been reversed by the repository owner, because it was written against the
// plan-gated Site Explorer endpoint while Ahrefs also publishes the figure
// through the free /v3/public/domain-rating-free endpoint. Every domain in the
// corpus has been read. The other three metrics are still uncollected and their
// assertions below are unchanged.
test('this wave carries no invented metric, and its Domain Ratings are evidenced', () => {
  for (const r of NEW) {
    // WAS: assert.strictEqual(r.domainRating, null). A rating may exist, but only
    // as evidence: on the 0-100 scale, naming provider, date and measured domain.
    assert.deepStrictEqual(S.domainRatingProblems(r), [],
      `${r.id} carries a Domain Rating without a provider, a date and a measured domain`);
    assert.strictEqual(r.metricsProvenance.domainRating.measuredDomain, S.normaliseDomain(r.website),
      `${r.id} reports a rating measured on a domain that is not its own`);
    assert.strictEqual(r.authorityScore, null, `${r.id} carries an authority score`);
    assert.strictEqual(r.estimatedTraffic, null, `${r.id} carries traffic`);
    assert.strictEqual(r.referringDomains, null, `${r.id} carries referring domains`);
    // WAS: assert.strictEqual(r.metricStatus, 'unknown'). The surviving rule is
    // that the status must match whether evidence exists, in both directions.
    assert.strictEqual(r.metricStatus === 'unknown', typeof r.domainRating !== 'number',
      `${r.id} metric status "${r.metricStatus}" disagrees with whether it carries a metric`);
    // WAS: assert.deepStrictEqual(r.metricsProvenance, {}). Only Domain Rating
    // was unfrozen; the three metrics above may still claim no provenance.
    assert.deepStrictEqual(Object.keys(r.metricsProvenance).filter((k) => k !== 'domainRating'), [],
      `${r.id} carries provenance for a metric this project does not collect`);
  }
  // Non-vacuity: domainRatingProblems passes an unrated record, so the loop
  // proves nothing unless these records really carry ratings.
  assert.ok(NEW.every((r) => typeof r.domainRating === 'number'),
    'a wave record has no Domain Rating, so the evidence rule above tested nothing');
});

// WAS: 'the wave changed no Domain Rating measurement', pinned by a count of 64
// measured domains. Both the title and the pin asserted the freeze, which the
// repository owner has reversed; new measurements are now expected rather than
// forbidden, so a fixed count is no longer a fact about anything. The invariant
// it rested on — one domain, one dated reading, repeated verbatim wherever
// records share it, and never a number without evidence — is asserted instead.
test('the corpus holds one evidenced reading per measured domain', () => {
  const measured = ALL.filter((r) => r.domainRating !== null && r.domainRating !== undefined);
  const domains = new Set(measured.map((r) => {
    const p = (r.metricsProvenance || {}).domainRating;
    return p && p.measuredDomain;
  }).filter(Boolean));
  for (const r of measured) {
    assert.deepStrictEqual(S.domainRatingProblems(r), [],
      `${r.id} carries a Domain Rating without a provider, a date and a measured domain`);
  }
  // Non-vacuity: the loop above and the shared-snapshot check both pass an empty
  // set, so the corpus must actually hold readings for them to mean anything.
  assert.ok(domains.size > 0, 'no domain in the corpus is measured, so this guard proves nothing');
  assert.deepStrictEqual(S.sharedDomainSnapshotProblems(ALL), [],
    'a shared-domain snapshot became inconsistent');
});

// --- duplication ------------------------------------------------------------------

test('no new record collides on hostname with an already-published record', () => {
  const host = (u) => new URL(u).hostname.replace(/^www\./, '');
  const seen = new Map();
  for (const r of ALL) {
    const h = host(r.website);
    if (!seen.has(h)) seen.set(h, []);
    seen.get(h).push(r);
  }
  for (const r of NEW) {
    const sharing = seen.get(host(r.website)).filter((o) => o.id !== r.id);
    for (const o of sharing) {
      assert.ok(r.resourceIdentity && o.resourceIdentity,
        `${r.id} shares host ${host(r.website)} with ${o.id} and neither declares resourceIdentity`);
    }
  }
});

test('relations resolve to records that exist', () => {
  for (const r of NEW) {
    for (const key of ['alternatives', 'similar', 'usedWith', 'competitors']) {
      for (const id of r.related[key]) {
        assert.ok(byId.has(id), `${r.id} relates to missing record ${id}`);
        assert.notStrictEqual(id, r.id, `${r.id} relates to itself`);
      }
    }
  }
});

// --- pages ------------------------------------------------------------------------

test('every new record has a generated page that carries its distinction', () => {
  for (const r of NEW) {
    const file = path.join(ROOT, 'research', 'business-directories', r.country, r.slug, 'index.html');
    assert.ok(fs.existsSync(file), `${r.id} has no generated page at ${file}`);
    const html = fs.readFileSync(file, 'utf8');
    // No schema vocabulary leaks into what a reader sees.
    const body = html.replace(/<[^>]+>/g, ' ');
    for (const leak of ['primaryRegistryType', 'scoreFactors', 'metricsProvenance', 'notApplicable']) {
      assert.ok(!body.includes(leak), `${r.id} page leaks the schema term ${leak}`);
    }
    // Editor notes are working material and are not published.
    assert.ok(!body.includes('FOUR ROLES, determined separately'),
      `${r.id} page publishes the editor notes`);
  }
});

test('the two access surfaces state on their own page that they are not the register', () => {
  for (const id of ['fr-bodacc', 'de-insolvenzbekanntmachungen']) {
    const r = byId.get(id);
    const file = path.join(ROOT, 'research', 'business-directories', r.country, r.slug, 'index.html');
    const body = fs.readFileSync(file, 'utf8').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    assert.match(body, /not the register|publication medium|publicity to acts|does not constitute/i,
      `${id} page never tells a reader it is not the register`);
  }
});
