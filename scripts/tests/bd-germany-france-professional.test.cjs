'use strict';
// Wave 3A-2 — Germany and France professional registers.
//
// The wave's central finding is NEGATIVE: Germany has no national register for
// most regulated professions, because the federal bodies for architects,
// engineers, doctors, pharmacists and vets are associations or peak
// organisations rather than register keepers. The strongest guard here is
// therefore the one that stops a future wave from inventing those registers.
//
// The second theme is that a national interface is usually NOT the legal source
// of record. The German lawyer and tax-adviser registers and both French tableaux
// aggregate decisions taken by regional chambers or councils, and every record
// has to say so in prose a reader actually meets.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { loadRegistry } = require('../lib/bd-registry.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const ALL = loadRegistry().directories;
const byId = new Map(ALL.map((r) => [r.id, r]));

const GERMANY = ['de-brak-anwaltsverzeichnis', 'de-wpk-berufsregister',
  'de-patentanwaltsverzeichnis', 'de-steuerberaterverzeichnis',
  'de-stbk-eu-dienstleister-steuersachen', 'de-stbk-partiell-zugelassene-steuersachen'];
const FRANCE = ['fr-tableau-architectes', 'fr-annuaire-experts-comptables',
  'fr-inpi-conseils-propriete-industrielle', 'fr-notaires-annuaire-officiel'];
const WAVE = [...GERMANY, ...FRANCE];
const NEW = WAVE.map((id) => byId.get(id));

const visible = (r) => [r.description, ...r.pros, ...r.cons, ...r.bestFor, ...r.notRecommendedFor].join(' \n ');
const hostOf = (u) => new URL(u).hostname.replace(/^www\./, '');

test('every record this wave claims to have published exists', () => {
  for (const id of WAVE) assert.ok(byId.get(id), `missing record ${id}`);
  assert.strictEqual(ALL.filter((r) => r.country === 'germany').length, 13);
  assert.strictEqual(ALL.filter((r) => r.country === 'france').length, 11);
});

// ── German federalism ───────────────────────────────────────────────────────
// The bodies below are associations (e.V.) or peak organisations, NOT register
// keepers. Their own words: the Bundesarchitektenkammer is a "Bundesgemeinschaft
// der Architektenkammern … e.V."; the Bundesingenieurkammer and
// Bundestierärztekammer are e.V.; the Bundesärztekammer is the "Spitzenorganisation
// der ärztlichen Selbstverwaltung"; ABDA is a "Bundesvereinigung" of associations.
// A record for any of them at national level would publish an association
// directory, which is exactly what the wave brief forbids.
const FORBIDDEN_GERMAN_HOSTS = ['bak.de', 'bingk.de', 'bundesaerztekammer.de',
  'abda.de', 'bundestieraerztekammer.de'];

test('no German professional record is published for a body that keeps no register', () => {
  for (const r of ALL.filter((x) => x.country === 'germany')) {
    const host = hostOf(r.website);
    assert.ok(!FORBIDDEN_GERMAN_HOSTS.includes(host),
      `${r.id} publishes ${host}, which is an association or peak organisation, not a register keeper`);
  }
});

test('no record invents a national German register for a Länder profession', () => {
  const LAENDER_ONLY = /\b(architect|architekt|engineer|ingenieur|physician|doctor|arzt|ärzt|pharmac|apotheker|veterinar|tierärzt)/i;
  for (const r of ALL.filter((x) => x.country === 'germany' && x.registryTypes.includes('professional-licence-register'))) {
    if (!LAENDER_ONLY.test(`${r.name} ${r.officialName || ''}`)) continue;
    assert.fail(`${r.id} presents a national German register for a profession organised through Länder chambers`);
  }
});

// ── A national interface is not the legal source of record ──────────────────
const AGGREGATORS = {
  'de-brak-anwaltsverzeichnis': /regional bar/i,
  'de-steuerberaterverzeichnis': /regional chambers/i,
  'fr-tableau-architectes': /regional councils/i,
  'fr-annuaire-experts-comptables': /regional council/i,
};

test('an aggregating interface says the register is kept elsewhere', () => {
  for (const [id, re] of Object.entries(AGGREGATORS)) {
    const r = byId.get(id);
    assert.ok(re.test(visible(r)),
      `${id} does not tell a reader that the underlying register is kept regionally`);
  }
});

// ── Practise vs title ───────────────────────────────────────────────────────
test('every record says whether registration is required to practise', () => {
  for (const r of NEW) {
    const v = visible(r);
    assert.ok(/required to practise|required to carry out|(?:required|authorised|entitled) to give|authorisation to give|entitled to carry out|reserved|exclusive prerogative|licence register|appointed to|public officers|makes no claim that inclusion is a licence/i.test(v),
      `${r.id} never states what registration actually permits`);
  }
});

test('no record claims a protected title where the work is reserved, or the reverse', () => {
  // Nothing in this wave is a title-only register; each one gates real work, or
  // records appointment to a public office. A record that claimed mere title
  // protection would understate what its entry means.
  for (const r of NEW) {
    // Match an actual title-only CLAIM, not the contrast "required to practise,
    // not only to use the title", which asserts the opposite.
    assert.ok(!/is not a licence to practise|not required to practise|work is not reserved|is not a licence to carry out/i.test(visible(r)),
      `${r.id} describes itself as title-only, which contradicts the wave's determinations`);
  }
});

// ── What inclusion and absence do NOT prove ─────────────────────────────────
test('every record states what inclusion does not prove', () => {
  for (const r of NEW) {
    const limits = [...r.cons, ...r.notRecommendedFor].join(' ');
    assert.ok(/not a statement|says nothing about|(?:does|do) not establish|establishes none|does not serve/i.test(limits),
      `${r.id} never says what inclusion does not prove`);
  }
});

test('every record states what absence does not prove', () => {
  for (const r of NEW) {
    const limits = [...r.cons, ...r.notRecommendedFor].join(' ');
    // "absen" catches both "absence" and "a person absent from it".
    assert.ok(/absen|nil result|not found in/i.test(limits),
      `${r.id} never says what absence does not prove`);
  }
});

// ── Duplicate boundaries ────────────────────────────────────────────────────
test('the three German tax registers stay separate and each names its statute', () => {
  const stbk = ['de-steuerberaterverzeichnis', 'de-stbk-eu-dienstleister-steuersachen',
    'de-stbk-partiell-zugelassene-steuersachen'];
  const statutes = [/86b/, /3b/, /3g/];
  stbk.forEach((id, i) => {
    const r = byId.get(id);
    assert.ok(statutes[i].test(visible(r)), `${id} does not name its own statutory basis in rendered prose`);
    // Each must point at the others, because absence from one says nothing
    // about the other two.
    const others = stbk.filter((x) => x !== id);
    assert.deepStrictEqual(r.related.similar.slice().sort(), others.slice().sort(),
      `${id} does not cross-reference the other two tax registers`);
  });
  // Three distinct hosts, so no shared-host group is appropriate.
  for (const id of stbk) {
    assert.strictEqual(byId.get(id).resourceIdentity, null,
      `${id} declares a shared-host group, but the three tax registers do not share a host`);
  }
  assert.strictEqual(new Set(stbk.map((id) => hostOf(byId.get(id).website))).size, 3);
});

test('WPK is one record, not split into a separate statutory auditor register', () => {
  const onWpk = ALL.filter((r) => hostOf(r.website) === 'wpk.de');
  assert.strictEqual(onWpk.length, 1, 'wpk.de must carry exactly one record');
  // The one register discharges both functions; the record has to say so.
  assert.ok(/statutory auditor register|both purposes|EU Audit Directive/i.test(visible(onWpk[0])),
    'the WPK record does not explain that one register serves both legal functions');
});

test('the BRAK record is not duplicated by a consumer search page', () => {
  const onBrak = ALL.filter((r) => /brak\.de$/.test(hostOf(r.website)));
  assert.strictEqual(onBrak.length, 1, 'the BRAK estate must carry exactly one record');
});

// ── France: the register, not the finder ────────────────────────────────────
test('no French record publishes a client-matching finder as a register', () => {
  const FINDERS = ['architectes-pour-tous.fr', 'e-annuaire.avocat.fr'];
  for (const r of ALL.filter((x) => x.country === 'france')) {
    assert.ok(!FINDERS.includes(hostOf(r.website)),
      `${r.id} publishes ${hostOf(r.website)}, which is a finder rather than a statutory register`);
  }
  // And the architects record must actively distinguish itself from the finder.
  assert.ok(/separate finder|not this register/i.test(visible(byId.get('fr-tableau-architectes'))),
    'the architects record does not warn that a separate finder exists');
});

test('the architects roll warns that not every entry may design', () => {
  const r = byId.get('fr-tableau-architectes');
  assert.ok(/not entitled to design|not insured/i.test(visible(r)),
    'the roll does not warn that architects registered for other activities may not design');
});

// ── The register keeper is not the profession's own body ────────────────────
test('INPI is recorded as the keeper of the industrial property attorney list', () => {
  const r = byId.get('fr-inpi-conseils-propriete-industrielle');
  assert.strictEqual(r.operator.name, 'Institut national de la propriété industrielle');
  assert.strictEqual(r.operator.type, 'government-agency');
  assert.ok(/CNCPI|Compagnie nationale/i.test(r.editorNotes),
    'the record does not record why the profession’s own body is not the keeper');
  assert.ok(/trade body|profession’s own|national company/i.test(visible(r)),
    'a reader is never told that the trade body is not the register keeper');
});

// ── Shared host ─────────────────────────────────────────────────────────────
test('the two systems on inpi.fr are distinct and both declare it', () => {
  const group = ALL.filter((r) => r.resourceIdentity && r.resourceIdentity.sharedHostGroup === 'inpi-fr');
  assert.strictEqual(group.length, 2, 'the inpi-fr group must have exactly two members');
  assert.strictEqual(new Set(group.map((r) => r.resourceIdentity.systemKey)).size, 2,
    'the two inpi.fr systems must have distinct systemKeys');
  for (const r of group) {
    assert.strictEqual(r.resourceIdentity.canonicalDomain, 'inpi.fr',
      `${r.id} must store the registrable host without a www prefix`);
  }
});

// ── Metrics ─────────────────────────────────────────────────────────────────
test('no new measurement was taken and the reused snapshot is verbatim', () => {
  const reused = byId.get('fr-inpi-conseils-propriete-industrielle');
  const origin = byId.get('fr-inpi');
  // inpi.fr was already measured, so the rule is to reuse it rather than leave
  // a null beside a measured domain. Same domain, same measurement — the frozen
  // 64-measurement set is untouched.
  assert.strictEqual(reused.domainRating, origin.domainRating);
  assert.deepStrictEqual(reused.metricsProvenance.domainRating, origin.metricsProvenance.domainRating);
  assert.strictEqual(reused.metricsProvenance.domainRating.status, 'historicalSnapshot');

  for (const r of NEW) {
    if (r.id === 'fr-inpi-conseils-propriete-industrielle') continue;
    assert.strictEqual(r.domainRating, null, `${r.id} carries a Domain Rating it did not inherit`);
    assert.deepStrictEqual(r.metricsProvenance, {}, `${r.id} invented metrics provenance`);
  }
  const domains = new Set();
  for (const r of ALL) {
    const p = r.metricsProvenance && r.metricsProvenance.domainRating;
    if (p && p.measuredDomain) domains.add(p.measuredDomain);
  }
  assert.strictEqual(domains.size, 64, 'the frozen measurement set changed size');
});

// ── Access ──────────────────────────────────────────────────────────────────
test('access reflects what was observed and nothing more', () => {
  for (const r of NEW) {
    const a = r.publicAccess;
    assert.strictEqual(a.loginRequired, false, `${r.id} did not record the anonymous load`);
    assert.strictEqual(a.searchUrl, null, `${r.id} asserts a search URL that was never exercised`);
    for (const k of ['identityVerificationRequired', 'captcha', 'geographicRestriction', 'paidDocumentsAvailable']) {
      assert.strictEqual(a[k], null, `${r.id} claims ${k} without observing it`);
    }
    // freeToSearch may only be true where result rows were actually rendered.
    if (a.freeToSearch === true) {
      assert.match(a.notes, /result rows were rendered/i,
        `${r.id} claims free search without recording that results were seen`);
    }
  }
  // Exactly one record in this wave observed rendered results.
  assert.deepStrictEqual(NEW.filter((r) => r.publicAccess.freeToSearch === true).map((r) => r.id),
    ['fr-inpi-conseils-propriete-industrielle']);
});

test('no record claims a completeness it did not establish', () => {
  for (const r of NEW) {
    const v = visible(r);
    // A claim to hold "all" of a profession is only allowed where the operator
    // says so. The notary record deliberately makes no such claim.
    if (/\ball (?:French|German) (?:notaries|architects)\b/i.test(v)) {
      assert.fail(`${r.id} claims a completeness no operator stated`);
    }
  }
});

// ── Rendered prose, not editor notes ────────────────────────────────────────
test('critical caveats are visible, not hidden in editor notes', () => {
  for (const r of NEW) {
    const html = fs.readFileSync(
      path.join(ROOT, 'research', 'business-directories', r.country, r.slug, 'index.html'), 'utf8');
    const body = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    assert.ok(!body.includes('FOUR ROLES, determined separately'), `${r.id} page publishes the editor notes`);
    for (const con of r.cons) {
      const probe = con.replace(/\s+/g, ' ').slice(0, 40);
      assert.ok(body.includes(probe), `${r.id} limitation does not reach the rendered page: ${probe}`);
    }
  }
});

test('every record documents the four roles separately', () => {
  for (const r of NEW) {
    for (const role of ['LEGAL SOURCE OF RECORD:', 'RESPONSIBLE AUTHORITY:',
      'TECHNICAL PLATFORM:', 'PUBLIC ACCESS INTERFACE:']) {
      assert.ok(r.editorNotes.includes(role), `${r.id} does not determine ${role}`);
    }
  }
});

// The defining limit of each secondary tax register is the SHAPE of the
// entitlement it records, and that is the easiest thing to lose in an edit: drop
// one adjective and a restricted permission reads as a full one. A reader who
// takes a § 3g entry for an appointment as a German tax adviser has been
// misled about what the person may legally do.
const ENTITLEMENT_SHAPE = {
  'de-stbk-partiell-zugelassene-steuersachen': [
    [/partial/i, 'that the authorisation is partial'],
    [/only the activities|restricted/i, 'that it covers only the activities for which partial access was granted'],
    [/not an appointment as a German tax adviser/i, 'that it is not an appointment as a German tax adviser'],
  ],
  'de-stbk-eu-dienstleister-steuersachen': [
    [/temporary and occasional/i, 'that the authorisation is temporary and occasional'],
    [/not an appointment as a German tax adviser/i, 'that it is not an appointment as a German tax adviser'],
  ],
  'de-steuerberaterverzeichnis': [
    [/unrestricted assistance/i, 'that this register is the one recording unrestricted entitlement'],
  ],
};

test('a restricted entitlement is never described as a full one', () => {
  for (const [id, checks] of Object.entries(ENTITLEMENT_SHAPE)) {
    const v = visible(byId.get(id));
    for (const [re, what] of checks) {
      assert.ok(re.test(v), `${id} no longer tells a reader ${what}`);
    }
  }
  // The description carries the restriction on its own. It is the first prose a
  // reader meets and the text that travels into listings and metadata, so a
  // caveat that survives only further down the page is not enough.
  assert.match(byId.get('de-stbk-partiell-zugelassene-steuersachen').description,
    /partial|restricted/i,
    'the § 3g description does not itself say the entitlement is restricted');
  assert.match(byId.get('de-stbk-eu-dienstleister-steuersachen').description,
    /temporary and occasional/i,
    'the § 3b description does not itself say the authorisation is temporary');
});

test('cross-host redirects are disclosed to readers, not only to editors', () => {
  // Both of these were found by re-checking live URLs; a reader who bookmarks
  // the published entry point will not land on the address they started from.
  for (const id of ['fr-annuaire-experts-comptables', 'de-patentanwaltsverzeichnis']) {
    assert.ok(/redirects cross-host|session-specific address|copied link is not/i.test(visible(byId.get(id))),
      `${id} hides a URL-stability caveat from the reader`);
  }
});
