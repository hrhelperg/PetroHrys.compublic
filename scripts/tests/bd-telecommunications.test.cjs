'use strict';
// Wave 4 — telecommunications, spectrum and licensing registries.
//
// This wave exists to hold ONE legal distinction that is very easy to lose:
//
//   operator register  = a NOTIFICATION under a general authorisation
//   numbering register = an individual RIGHT OF USE granted
//   spectrum register  = an individual AUTHORISATION granted
//
// Under the European Electronic Communications Code, running a public network or
// service needs no individual licence — only a notification. Spectrum and
// numbering are the opposite. One regulator therefore keeps several legally
// different registers, and the guards below stop any of them being described as
// the others, merged into the others, or read as proof of current trading.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { loadRegistry } = require('../lib/bd-registry.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const ALL = loadRegistry().directories;
const byId = new Map(ALL.map((r) => [r.id, r]));

const OPERATOR_REGISTERS = ['eu-berec-gadb', 'cz-ctu-evidence-podnikatelu-ek',
  'de-bnetza-verzeichnis-gemeldeter-unternehmen', 'es-cnmc-registro-operadores'];
const NUMBERING = ['cz-ctu-pridelena-cisla-a-kody', 'es-cnmc-registro-numeracion'];
const SPECTRUM = ['cz-ctu-individualni-opravneni-kmitocty'];
const POSTAL = ['cz-ctu-evidence-postovnich-provozovatelu'];
const WAVE = [...OPERATOR_REGISTERS, ...NUMBERING, ...SPECTRUM, ...POSTAL];
const NEW = WAVE.map((id) => byId.get(id));

const visible = (r) => [r.description, ...r.pros, ...r.cons, ...r.bestFor, ...r.notRecommendedFor].join(' \n ');
const limitsOf = (r) => [...r.cons, ...r.notRecommendedFor].join(' ');
const hostOf = (u) => new URL(u).hostname.replace(/^www\./, '');

test('every record this wave claims to have published exists', () => {
  assert.strictEqual(WAVE.length, 8, 'the wave manifest changed size without this test changing');
  for (const id of WAVE) assert.ok(byId.get(id), `missing record ${id}`);
  assert.strictEqual(new Set(WAVE).size, 8, 'the wave manifest contains a duplicate id');
});

// ── The distinction the whole wave exists for ───────────────────────────────
test('an operator register is never described as a licence register', () => {
  for (const id of OPERATOR_REGISTERS) {
    const r = byId.get(id);
    assert.match(visible(r), /notification|notified|notif/i,
      `${id} never tells a reader that entry follows a notification`);
    assert.match(limitsOf(r), /not a licence|NOTIFICATION, not a licence|no individual licence|grants nothing|is not a licence/i,
      `${id} does not state that a notification is not a licence`);
  }
});

test('every record separates operator status from spectrum and numbering', () => {
  for (const r of NEW) {
    if (POSTAL.includes(r.id)) continue; // postal states its own boundary instead
    assert.match(visible(r), /proves nothing about spectrum or numbering|three separate legal acts/i,
      `${r.id} does not separate operator status from spectrum and numbering`);
  }
  // The postal record must still refuse to imply telecom status.
  assert.match(visible(byId.get('cz-ctu-evidence-postovnich-provozovatelu')),
    /says nothing about whether the operator is an electronic communications undertaking/i,
    'the postal record does not refuse to imply electronic communications status');
});

test('a spectrum register is never described as proving operator authorisation', () => {
  for (const id of SPECTRUM) {
    assert.match(limitsOf(byId.get(id)),
      /not the same as being an authorised telecommunications operator|may have made no notification/i,
      `${id} does not state that holding spectrum is not operator authorisation`);
  }
});

test('a numbering register warns that allocation is not service and not the serving provider', () => {
  for (const id of NUMBERING) {
    const l = limitsOf(byId.get(id));
    assert.match(l, /portab/i, `${id} does not mention portability`);
    assert.match(l, /does not establish that the (undertaking|operator) is (currently )?providing service|not that it serves any particular subscriber/i,
      `${id} does not separate an allocation from actual service`);
  }
});

// ── Listed is not operating ─────────────────────────────────────────────────
test('registers that retain ended entries say so', () => {
  // Each of these registers demonstrably contains entities whose activity has
  // stopped. Reading a hit as "currently trading" is the default error.
  const RETAINS = {
    'cz-ctu-evidence-podnikatelu-ek': /were or are|interrupted or ended/i,
    'cz-ctu-evidence-postovnich-provozovatelu': /ceased|ended/i,
    'es-cnmc-registro-operadores': /three years|does not establish that a company is trading today/i,
  };
  for (const [id, re] of Object.entries(RETAINS)) {
    assert.ok(re.test(limitsOf(byId.get(id))),
      `${id} lets a reader assume every entry is currently trading`);
  }
});

// ── What absence does not prove ─────────────────────────────────────────────
test('every record states what absence does not prove', () => {
  for (const r of NEW) {
    // "absen" catches "absence does not", "Absence of a number ... does not"
    // and "a person absent from it". Words between the noun and the negation
    // are normal English, not a missing caveat.
    assert.match(limitsOf(r), /absen|excluded|exempt/i,
      `${r.id} never says what absence does not prove`);
  }
});

test('the number-independent services exclusion is disclosed where it applies', () => {
  // Email and messaging are outside the notification duty in CZ and DE. A reader
  // who does not know that will misread their absence as non-compliance.
  for (const id of ['cz-ctu-evidence-podnikatelu-ek', 'de-bnetza-verzeichnis-gemeldeter-unternehmen', 'eu-berec-gadb']) {
    assert.match(visible(byId.get(id)), /number-independent/i,
      `${id} does not disclose the number-independent services position`);
  }
  // Spain is the contrast: those providers DO notify, but only for statistics.
  assert.match(visible(byId.get('es-cnmc-registro-operadores')), /statistical and census/i,
    'the Spanish record does not record that number-independent providers notify for statistics only');
});

// ── The Union database is not the legal source ──────────────────────────────
test('the EU database defers to the national register as source of record', () => {
  const r = byId.get('eu-berec-gadb');
  assert.match(limitsOf(r), /national register (of the member state )?remains the (legal )?source/i,
    'the Union database does not defer to the national register');
  assert.match(r.editorNotes, /Article 12 of Directive \(EU\) 2018\/1972/,
    'the Union database record does not cite its statutory basis');
  assert.strictEqual(r.scope, 'supranational');
  assert.strictEqual(r.jurisdiction, null);
});

// ── Statutory basis on every record ─────────────────────────────────────────
const STATUTE = {
  'eu-berec-gadb': /2018\/1972|2018\/1971/,
  'cz-ctu-evidence-podnikatelu-ek': /section 13|§ 13/,
  'de-bnetza-verzeichnis-gemeldeter-unternehmen': /section 5|§ 5/,
  'es-cnmc-registro-operadores': /6\.2|Ley 11\/2022|Law 11\/2022/,
  'es-cnmc-registro-numeracion': /30/,
};

test('every operator and numbering record names its statutory basis in rendered prose', () => {
  for (const [id, re] of Object.entries(STATUTE)) {
    assert.ok(re.test(visible(byId.get(id))),
      `${id} does not name its statutory basis where a reader can see it`);
  }
});

// ── Duplicate boundaries ────────────────────────────────────────────────────
test('one regulator host carries several systems, each declared distinct', () => {
  const groups = { 'ctu-gov-cz': 4, 'cnmc-es': 2 };
  for (const [group, size] of Object.entries(groups)) {
    const members = ALL.filter((r) => r.resourceIdentity && r.resourceIdentity.sharedHostGroup === group);
    assert.strictEqual(members.length, size, `the ${group} group must have exactly ${size} members`);
    assert.strictEqual(new Set(members.map((r) => r.resourceIdentity.systemKey)).size, size,
      `the ${group} members must have distinct systemKeys`);
    for (const r of members) {
      assert.ok(!/^www\./.test(r.resourceIdentity.canonicalDomain),
        `${r.id} stores a www-prefixed canonical domain`);
    }
  }
});

test('no telecom record duplicates an already published FCC system', () => {
  // us-fcc-uls (spectrum) and us-fcc-form-499 (carrier registration) predate this
  // wave. Wave 4 added no US record; a future one must test against these first.
  assert.ok(byId.get('us-fcc-uls'), 'the pre-existing FCC spectrum record disappeared');
  assert.ok(byId.get('us-fcc-form-499'), 'the pre-existing FCC filer record disappeared');
  for (const r of NEW) {
    assert.notStrictEqual(r.country, 'united-states',
      `${r.id} adds a US telecom record without resolving duplication against the FCC systems`);
  }
});

test('rejected candidates are recorded so they are not re-proposed', () => {
  const cz = byId.get('cz-ctu-evidence-podnikatelu-ek').editorNotes;
  assert.match(cz, /price barometer and blocked-website list were rejected/i,
    'the Czech rejections are not recorded');
  const spec = byId.get('cz-ctu-individualni-opravneni-kmitocty').editorNotes;
  assert.match(spec, /FILTERED VIEWS/i,
    'the transmitter overviews are not recorded as filtered views');
  const num = byId.get('es-cnmc-registro-numeracion').editorNotes;
  assert.match(num, /PORTABILITY STATUS pages were rejected/i,
    'the Spanish portability rejection is not recorded');
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
    if (a.freeToSearch === true) {
      assert.match(a.notes, /result rows were rendered/i,
        `${r.id} claims free search without recording that results were seen`);
    }
  }
  assert.deepStrictEqual(NEW.filter((r) => r.publicAccess.freeToSearch === true).map((r) => r.id),
    ['cz-ctu-evidence-podnikatelu-ek']);
});

test('a download-only register says it has no search', () => {
  const r = byId.get('de-bnetza-verzeichnis-gemeldeter-unternehmen');
  assert.match(visible(r), /no search interface|spreadsheet download|periodic spreadsheet/i,
    'the German register does not tell a reader it is a download rather than a search');
  assert.match(r.publicAccess.notes, /not downloaded or opened/i,
    'the German access note claims more than was observed');
});

// ── Metrics ─────────────────────────────────────────────────────────────────
test('every rating this wave carries was measured on the record’s own domain', () => {
  // POLICY REVERSAL. This test used to assert the Domain Rating freeze: every
  // record's rating was null, its metricsProvenance was {}, and the corpus held
  // exactly 64 measured domains. The freeze is lifted — Ahrefs' free public
  // domain-rating endpoint costs nothing, so ratings are collected again and all
  // three assertions are now false. What the freeze was protecting is that a
  // number is never invented and never borrowed from another domain, so that is
  // asserted directly instead.
  const BD = require('../lib/bd-schema.cjs');
  let rated = 0;
  for (const r of NEW) {
    if (r.domainRating === undefined || r.domainRating === null) continue;
    rated += 1;
    assert.deepStrictEqual(BD.domainRatingProblems(r), [],
      `${r.id} carries a Domain Rating that does not satisfy the shared rule`);
    assert.strictEqual(r.metricsProvenance.domainRating.measuredDomain,
      BD.normaliseDomain(r.website),
      `${r.id} reports a rating measured on a domain that is not its own`);
  }
  assert.ok(rated > 0, 'no record in this wave carries a Domain Rating, so this guard is vacuous');
  // Four of these registers sit on ctu.gov.cz and two on cnmc.es, so this wave is
  // exactly where one domain could acquire several contradictory readings. In
  // place of the pinned snapshot size: one domain, one dated reading, repeated
  // verbatim by every record published on it.
  assert.deepStrictEqual(BD.sharedDomainSnapshotProblems(ALL), [],
    'records sharing one measured domain do not repeat one identical reading');
  // The old "invented metrics provenance" guard needed an unmeasured record and
  // the corpus no longer holds one, so it runs on a fixture rather than being
  // dropped: provenance for a rating that is not set is still a fault, and an
  // unmeasured record is still legitimate rather than a record scoring zero.
  assert.ok(BD.domainRatingProblems({
    domainRating: null,
    metricsProvenance: {
      domainRating: {
        provider: 'Ahrefs', measuredAt: '2026-08-19',
        status: 'publicApiReading', measuredDomain: 'ctu.gov.cz',
      },
    },
  }).length, 'provenance for a rating that is not set was accepted');
  assert.deepStrictEqual(BD.domainRatingProblems({ domainRating: null, metricsProvenance: {} }), [],
    'an unmeasured record was reported as a fault, which would force a number to be invented');
});

// ── Rendered prose, not editor notes ────────────────────────────────────────
test('critical caveats are visible, not hidden in editor notes', () => {
  for (const r of NEW) {
    const html = fs.readFileSync(
      path.join(ROOT, 'research', 'business-directories', r.country, r.slug, 'index.html'), 'utf8');
    const body = html.replace(/<[^>]+>/g, ' ')
      .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ');
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

test('every operator is the regulator or a supranational institution', () => {
  for (const r of NEW) {
    assert.ok(['regulator', 'supranational-institution', 'government-agency', 'ministry'].includes(r.operator.type),
      `${r.id} names a ${r.operator.type} as keeper of a statutory telecoms register`);
  }
});
