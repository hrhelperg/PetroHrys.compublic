// scripts/tests/bd-professional-licences.test.cjs
'use strict';

// Wave 3A-1 — the professional licences pilot for the UK and Czechia.
//
// The pilot's hardest question, and the reason these guards exist:
//
//   A PROTECTED-TITLE REGISTER IS NOT A LICENCE TO PRACTISE.
//
// ARB registers who may call themselves an architect; the Engineering Council
// registers who may use CEng, IEng, EngTech and ICTTech. Neither reserves the
// underlying work. The Czech chambers are the deliberate contrast: autorizace is
// required to CARRY OUT reserved activities in construction, and advocacy is a
// reserved profession. Every record must say which effect applies, because a
// reader who confuses them draws the wrong conclusion about what a person may do.
//
// Two further decisions are pinned:
//   * IPReg is ONE record. The regulator's page says "Search our registers", but
//     the public interface is a single form covering both professions and firms.
//   * ČKA and ČKAIT are SEPARATE. Two chambers, two authorisations, two sets of
//     reserved activities — merging them because both concern construction would
//     misstate what either permits.

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

const WAVE = ['gb-arb-architects-register', 'gb-engc-regcheck', 'gb-ipreg-register',
  'cz-cak-advokati', 'cz-nkcr-notari', 'cz-cka-autorizovani-architekti',
  'cz-ckait-autorizovane-osoby'];
const NEW = WAVE.map((id) => byId.get(id));

const visible = (r) => [r.description, ...r.pros, ...r.cons, ...r.bestFor, ...r.notRecommendedFor].join(' ');
const limitsOf = (r) => [...r.cons, ...r.notRecommendedFor].join(' ');
const hostOf = (u) => new URL(u).hostname.replace(/^www\./, '');
const TITLE_ONLY = ['gb-arb-architects-register', 'gb-engc-regcheck'];
const PRACTICE = ['cz-cak-advokati', 'cz-cka-autorizovani-architekti', 'cz-ckait-autorizovane-osoby'];

// --- non-vacuity ---------------------------------------------------------------------

test('every record this wave claims to have published exists', () => {
  assert.strictEqual(WAVE.length, 7, 'the wave manifest changed size without this test changing');
  for (const [i, id] of WAVE.entries()) assert.ok(NEW[i], `${id} is named by this suite but is not in the registry`);
  assert.ok(TITLE_ONLY.length >= 2 && PRACTICE.length >= 2,
    'the title-only and practice groups must both be populated or the contrast proves nothing');
});

// --- protected title versus licence to practise ------------------------------------------

test('a protected-title register never claims to license practice', () => {
  for (const id of TITLE_ONLY) {
    const r = byId.get(id);
    // It must say the title is what registration governs.
    assert.match(visible(r), /title/i, `${id} never mentions the title at all`);
    // And it must say the work is not reserved.
    assert.match(limitsOf(r), /not reserved|not a licence to (?:practise|carry out|work)|not required to (?:practise|work)/i,
      `${id} never tells a reader that the underlying work is not reserved by law`);
    // It must NOT assert the opposite.
    // Match an AFFIRMATIVE claim only. An earlier form of this check matched the
    // disclaimer "registration is not a licence to practise" — the opposite of the
    // defect, and precisely the sentence that must be there.
    assert.ok(!/(?<!not )(?<!not a )\b(?:is a licence to practise|licensed to practise|must be registered to (?:practise|work))/i.test(visible(r)),
      `${id} describes a protected-title register as a licence to practise`);
  }
});

test('a reserved-activity register says the authorisation is required to act', () => {
  for (const id of PRACTICE) {
    const r = byId.get(id);
    assert.match(visible(r), /required to (?:practise|carry out)|reserved (?:activities|profession)|entitlement to act/i,
      `${id} never states that the authorisation is required to act`);
  }
});

test('the two effects are never described identically', () => {
  // If the title-only and practice records read the same, the distinction the
  // pilot exists to draw has collapsed.
  const titleText = TITLE_ONLY.map((id) => limitsOf(byId.get(id))).join(' ');
  const practiceText = PRACTICE.map((id) => visible(byId.get(id))).join(' ');
  assert.match(titleText, /not reserved|not a licence/i, 'the title-only group lost its disclaimer');
  assert.match(practiceText, /required to|reserved/i, 'the practice group lost its entitlement statement');
});

test('the clarified type boundary demands the distinction and still says so', () => {
  const b = T.REGISTRY_TYPE_BY_ID.get('professional-licence-register').boundary;
  assert.match(b, /protected-title register/i, 'the boundary no longer covers protected-title registers');
  assert.match(b, /PRACTISE or only[\s\S]*TITLE/i,
    'the boundary no longer requires a record to state which legal effect applies');
  assert.match(b, /voluntary/i, 'the boundary no longer excludes voluntary membership');
});

// --- statutory versus voluntary -----------------------------------------------------------

test('every record identifies a statutory, chartered or public-law body as operator', () => {
  for (const r of NEW) {
    assert.ok(['regulator', 'public-law-body', 'government-agency', 'ministry'].includes(r.operator.type),
      `${r.id} operator type ${r.operator.type} is not an official body`);
    assert.match(r.operator.officialUrl, /^https:\/\//, `${r.id} operator has no official URL`);
  }
  // The chartered case must stay distinguishable from the statutory ones.
  assert.strictEqual(byId.get('gb-engc-regcheck').operator.type, 'public-law-body',
    'the Engineering Council is typed as a statutory regulator; it is a chartered body');
  assert.strictEqual(byId.get('gb-arb-architects-register').operator.type, 'regulator',
    'the ARB is no longer typed as a statutory regulator');
  assert.match(byId.get('gb-engc-regcheck').editorNotes, /Royal Charter/,
    'the Engineering Council record no longer records its charter basis');
});

test('no record claims completeness it did not establish', () => {
  for (const r of NEW) {
    assert.ok(!/\ball (?:UK |Czech )?(?:professionals|architects|engineers|lawyers|advocates|notaries)\b/i.test(r.description),
      `${r.id} claims to cover all professionals`);
  }
  // The chamber that publishes SELECTIONS must say so rather than imply the whole list.
  assert.match(limitsOf(byId.get('cz-ckait-autorizovane-osoby')), /selections|completeness is not claimed/i,
    'the ČKAIT record no longer records that it publishes selections rather than the whole register');
});

// --- one system versus several ------------------------------------------------------------

test('IPReg is one record, not split by profession or by individual and firm', () => {
  const ipregHosted = ALL.filter((r) => /(^|\.)ipreg\.org\.uk$/.test(hostOf(r.website)));
  assert.strictEqual(ipregHosted.length, 1,
    'more than one IPReg record exists; the public interface is a single search over both professions');
  const r = byId.get('gb-ipreg-register');
  assert.match(r.description, /patent/i, 'the IPReg description omits patent attorneys');
  assert.match(r.description, /trade mark/i, 'the IPReg description omits trade mark attorneys');
  assert.match(r.description, /firm/i, 'the IPReg description omits firms');
  assert.match(r.editorNotes, /ONE record/, 'the IPReg record no longer records the one-system decision');
});

test('the Czech construction chambers stay separate and each says the other exists', () => {
  const cka = byId.get('cz-cka-autorizovani-architekti');
  const ckait = byId.get('cz-ckait-autorizovane-osoby');
  assert.notStrictEqual(hostOf(cka.website), hostOf(ckait.website),
    'the two chambers now share a host, which would change the separation analysis');
  assert.notStrictEqual(cka.operator.name, ckait.operator.name, 'the two chambers share an operator name');
  // Neither may describe the other population as its own.
  assert.ok(!/authorised engineers and technicians (?:are|appear) (?:in|on) this list/i.test(visible(cka)),
    'the architects list claims to cover engineers');
  assert.match(limitsOf(cka), /engineer/i, 'the architects list never points at the engineers list');
  assert.match(limitsOf(ckait), /architect/i, 'the engineers list never points at the architects list');
});

// --- jurisdiction --------------------------------------------------------------------------

test('no record invents a territorial claim', () => {
  for (const r of NEW) {
    if (r.jurisdiction) {
      assert.ok(!/^GB-(?:EAW|GBN|UKM|CHC|COH|NIC|CYM)$/.test(r.jurisdiction.code || ''),
        `${r.id} uses a forbidden synthetic ISO identifier`);
    }
    assert.ok(['national', 'subnational'].includes(r.scope), `${r.id} has scope ${r.scope}`);
  }
  // The UK-wide claims must rest on the operator's own statement, recorded in notes.
  assert.match(byId.get('gb-arb-architects-register').editorNotes, /UK-wide, on the board’s own statement/,
    'the ARB record no longer records why its UK-wide scope is not inferred');
  // And the existing England-and-Wales records must be untouched by this wave.
  for (const id of ['gb-sra-solicitors-register', 'gb-barristers-register']) {
    const r = byId.get(id);
    assert.ok(r, `${id} is missing; it is the duplication baseline for UK lawyers`);
    assert.strictEqual(r.jurisdiction.name, 'England and Wales', `${id} territorial scope changed`);
  }
});

test('no UK lawyer duplicate was added', () => {
  const sraHosted = ALL.filter((r) => /(^|\.)sra\.org\.uk$/.test(hostOf(r.website)));
  assert.ok(sraHosted.length <= 1, 'a second record was filed on the SRA host');
  assert.ok(!WAVE.some((id) => /solicitor|barrister/i.test(byId.get(id).name)),
    'this wave added a solicitor or barrister record; both are already published');
});

// --- access truth ---------------------------------------------------------------------------

test('access reflects what was observed and nothing more', () => {
  for (const r of NEW) {
    const pa = r.publicAccess;
    // The search surface was loaded anonymously: that is loginRequired false.
    assert.strictEqual(pa.loginRequired, false, `${r.id} does not record the observed anonymous load`);
    // Nothing else was exercised.
    assert.strictEqual(pa.freeToSearch, null, `${r.id} asserts free search without executing one`);
    assert.strictEqual(pa.captcha, null, `${r.id} asserts a CAPTCHA position it did not observe`);
    assert.strictEqual(pa.searchUrl, null, `${r.id} publishes a search URL it never exercised`);
    assert.deepStrictEqual(S.accessContradictions(pa), [], `${r.id} has contradictory access fields`);
    assert.ok(pa.notes && pa.notes.length > 60, `${r.id} gives no access explanation`);
    assert.match(limitsOf(r), /not observed|not asserted|not exercised|could not be exercised/i,
      `${r.id} does not disclose that the search was not exercised`);
  }
});

test('the access ceiling passes', () => {
  const bools = ['freeToSearch', 'loginRequired', 'identityVerificationRequired',
    'captcha', 'geographicRestriction', 'paidDocumentsAvailable'];
  const fullyUnknown = NEW.filter((r) => r.publicAccess.accessLevel === 'unknown'
    && bools.every((k) => r.publicAccess[k] === null));
  const pct = (fullyUnknown.length / NEW.length) * 100;
  assert.ok(pct <= 50,
    `${pct}% of approved records are fully unknown, above the 50% ceiling: ${fullyUnknown.map((r) => r.id)}`);
});

test('no regulator homepage is used as the record URL', () => {
  for (const r of NEW) {
    const u = new URL(r.website);
    const isBareHome = (u.pathname === '/' || u.pathname === '');
    if (isBareHome) {
      // A bare host is only acceptable where the host IS the register application.
      assert.match(hostOf(r.website), /architects-register|vyhledavac/,
        `${r.id} uses a bare institutional homepage as its record URL`);
    }
    // A register served from the regulator's own domain is normal and not a
    // defect. What matters is only that a bare path belongs to a register
    // application, which the whitelist above enforces.
  }
});

// --- publication truth ------------------------------------------------------------------------

test('no record claims registration proves competence or good standing', () => {
  for (const r of NEW) {
    const t = visible(r);
    assert.ok(!/\b(?:proves|guarantees|ensures|certifies)\b[^.]*\b(?:competen|quality|good standing|trustworth|safe)\b/i.test(t),
      `${r.id} claims registration proves competence or standing`);
    assert.match(limitsOf(r), /not a statement about|does not establish|says nothing about|is not a statement/i,
      `${r.id} never says what inclusion does not establish`);
  }
});

test('critical caveats are visible, not hidden in editor notes', () => {
  for (const r of NEW) {
    const html = fs.readFileSync(
      path.join(ROOT, 'research', 'business-directories', r.country, r.slug, 'index.html'), 'utf8');
    const body = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    assert.ok(!body.includes('FOUR ROLES, determined separately'), `${r.id} page publishes the editor notes`);
    // The limitation text must actually reach the page.
    // EVERY limitation, not just the first: a defect that drops a later con is
    // exactly as invisible to a reader as one that drops the first.
    for (const con of r.cons) {
      const probe = con.replace(/\s+/g, ' ').slice(0, 40);
      assert.ok(body.includes(probe), `${r.id} limitation does not reach the rendered page: ${probe}`);
    }
  }
});

// A limitation a reader must know is only delivered if it is RENDERED. Record
// pages do not render `editorNotes` or `publicAccess.notes`, so moving a caveat
// there silently removes it from the reader while leaving the JSON looking
// complete. Each entry below is a limitation established from the operator's own
// text during verification; it is asserted against rendered prose ONLY.
const CRITICAL_LIMITATIONS = {
  'gb-arb-architects-register': [
    [/protects? a title/i, 'that it protects a title rather than the activity'],
    [/not (a statement about )?competen|not .*competence/i, 'that entry is not a statement about competence'],
  ],
  'gb-engc-regcheck': [
    [/exact match/i, 'that search requires an exact match, so a nil result proves nothing'],
    [/not required to work|not reserved|protects? titles/i, 'that registration is not required to work as an engineer'],
  ],
  'gb-ipreg-register': [
    [/distinct regulated professions|two registers|combined search/i, 'that two professions share one search interface'],
    [/individuals and firms/i, 'that individuals and firms appear together'],
  ],
  'cz-cak-advokati': [
    [/foreign law|foreign state/i, 'that entries include providers under foreign law'],
    [/indemnity/i, 'that indemnity cover is not uniform across entries'],
  ],
  'cz-nkcr-notari': [
    [/limited by the state|number of notarial offices/i, 'that office numbers are capped, so absence is not disqualification'],
  ],
  'cz-cka-autorizovani-architekti': [
    [/architects only/i, 'that it covers architects only'],
  ],
  'cz-ckait-autorizovane-osoby': [
    [/selections/i, 'that the page presents selections rather than the complete register'],
    [/requires JavaScript/i, 'that the form could not be exercised'],
  ],
};

test('every critical limitation is rendered, not hidden in editor notes', () => {
  for (const [id, checks] of Object.entries(CRITICAL_LIMITATIONS)) {
    // `visible` is rendered fields only. editorNotes and publicAccess.notes are
    // excluded on purpose: a caveat that lives solely there never reaches a reader.
    const rendered = visible(byId.get(id));
    for (const [re, what] of checks) {
      assert.ok(re.test(rendered),
        `${id} no longer tells a reader ${what} in rendered prose`);
    }
  }
});

// The Canada manifest silently drifted in Wave 2B because nothing tied it to the
// registry. This wave adds three UK-wide records, so the UK manifest is pinned
// the same way: a coverage manifest that disagrees with the registry makes the
// country page state a coverage figure that is not true.
test('the UK territorial coverage manifest matches the registry', () => {
  const manifest = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'data', 'business-directories', 'united-kingdom-territorial-coverage.json'), 'utf8'));
  const uk = ALL.filter((r) => r.country === 'united-kingdom');
  const ukWide = uk.filter((r) => r.jurisdiction === null);
  const cross = uk.filter((r) => r.jurisdiction && r.jurisdiction.type === 'cross-territory');
  const constituent = uk.filter((r) => r.jurisdiction
    && ['country', 'province'].includes(r.jurisdiction.type));

  assert.strictEqual(manifest.totals.records, uk.length,
    'manifest record total drifted from the registry');
  assert.strictEqual(manifest.totals.ukWide, ukWide.length,
    'manifest UK-wide total drifted from the registry');
  assert.strictEqual(manifest.totals.crossTerritory, cross.length,
    'manifest cross-territory total drifted from the registry');
  assert.strictEqual(manifest.totals.constituentCountry, constituent.length,
    'manifest constituent-country total drifted from the registry');

  // The listed ids must be exactly the UK-wide set, not merely the same count.
  assert.deepStrictEqual(
    manifest.ukWide.map((e) => e.recordId).slice().sort(),
    ukWide.map((r) => r.id).slice().sort(),
    'manifest UK-wide list does not match the registry');

  // Every id named anywhere in the manifest must still exist.
  const known = new Set(ALL.map((r) => r.id));
  for (const t of manifest.territories) {
    for (const id of t.reachedBy) {
      assert.ok(known.has(id), `manifest names a record that does not exist: ${id}`);
    }
  }
});

// `accepts` drives the audience guides, which are generated from it. A register
// that says in prose "a firm is not registered here" must not simultaneously
// claim through structured data that it covers local businesses — the guide would
// then list it for readers looking for their business. Established precedent:
// individual-only registers (barristers, NMC, HCPC) carry null; only registers
// that genuinely cover firms (SRA, IPReg) carry true.
test('a register that excludes firms does not claim to cover businesses', () => {
  for (const r of NEW) {
    const saysNoFirms = /(a firm is not registered|not (practices|employers)|individual practitioners, not)/i
      .test(visible(r));
    if (saysNoFirms) {
      assert.notStrictEqual(r.accepts.localBusiness, true,
        `${r.id} says firms are not registered but claims accepts.localBusiness`);
    }
  }
  // IPReg is the deliberate exception: it records firms alongside individuals.
  assert.strictEqual(byId.get('gb-ipreg-register').accepts.localBusiness, true,
    'IPReg records firms too and must keep accepts.localBusiness');
});

test('no new record carries a metric and the frozen snapshot is untouched', () => {
  for (const r of NEW) {
    assert.strictEqual(r.domainRating, null, `${r.id} carries a Domain Rating`);
    assert.deepStrictEqual(r.metricsProvenance, {}, `${r.id} carries metric provenance`);
    assert.strictEqual(S.computeScore(r.scoreFactors), r.petroHrysScore, `${r.id} score does not reproduce`);
    assert.strictEqual(r.nextVerification, S.nextVerificationFor(r), `${r.id} date was hand-set`);
  }
  const domains = new Set(ALL.filter((r) => r.domainRating !== null && r.domainRating !== undefined)
    .map((r) => (r.metricsProvenance || {}).domainRating).filter(Boolean).map((p) => p.measuredDomain));
  assert.strictEqual(domains.size, 64, `the measured-domain count moved to ${domains.size}`);
});
