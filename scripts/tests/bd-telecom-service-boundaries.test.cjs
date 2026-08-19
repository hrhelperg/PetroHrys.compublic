'use strict';
// Wave 4B — telecommunications service and licence boundary audit.
//
// One record was published. The wave's real output is a set of NEGATIVE
// determinations: VoIP, MVNO, fixed wireless, satellite and broadcasting are, in
// the jurisdictions researched, SERVICE CATEGORIES inside registers that already
// exist — not separate statutory populations. Portability systems are
// operational. Transmitter and site views are filtered spectrum data.
//
// Those determinations produce no records, so nothing but a test protects them.
// Every guard below exists to stop a later wave re-creating a register out of a
// filter, a map, a status page or a service label.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { loadRegistry } = require('../lib/bd-registry.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const ALL = loadRegistry().directories;
const byId = new Map(ALL.map((r) => [r.id, r]));

const WAVE = ['de-bnetza-post-anbieterverzeichnis'];
const NEW = WAVE.map((id) => byId.get(id));

// Every telecom-layer record, so the boundary guards run against the whole layer
// rather than only this wave's addition.
const TELECOM = ['eu-berec-gadb', 'cz-ctu-evidence-podnikatelu-ek', 'cz-ctu-pridelena-cisla-a-kody',
  'cz-ctu-individualni-opravneni-kmitocty', 'cz-ctu-evidence-postovnich-provozovatelu',
  'de-bnetza-verzeichnis-gemeldeter-unternehmen', 'de-bnetza-post-anbieterverzeichnis',
  'es-cnmc-registro-operadores', 'es-cnmc-registro-numeracion', 'us-fcc-uls', 'us-fcc-form-499',
  'us-fcc-public-inspection-files', 'ca-crtc-registered-telecom-providers'];

const visible = (r) => [r.description, ...r.pros, ...r.cons, ...r.bestFor, ...r.notRecommendedFor].join(' \n ');
const limitsOf = (r) => [...r.cons, ...r.notRecommendedFor].join(' ');
const hostOf = (u) => new URL(u).hostname.replace(/^www\./, '');

test('the telecom layer is exactly the records this wave audited', () => {
  for (const id of TELECOM) assert.ok(byId.get(id), `telecom record ${id} disappeared`);
  assert.strictEqual(TELECOM.length, 13, 'the telecom layer changed size without this test changing');
  for (const id of WAVE) assert.ok(byId.get(id), `missing record ${id}`);
});

// ── 1-2, 8. A service category is not a statutory population ────────────────
// These ids are the shapes a future wave would most plausibly invent out of a
// filter. None of them may exist without a fresh, evidenced boundary decision.
const FORBIDDEN_SERVICE_RECORDS = [
  'cz-ctu-voip-providers', 'cz-ctu-mvno-list', 'de-bnetza-voip-anbieter',
  'de-bnetza-mvno-liste', 'es-cnmc-voip', 'es-cnmc-mvno', 'es-cnmc-registro-alias',
  'eu-berec-voip', 'eu-berec-mvno', 'us-fcc-interconnected-voip',
  'cz-ctu-fixed-wireless', 'de-bnetza-fixed-wireless',
];

test('no record was created from a VoIP, MVNO or fixed-wireless service filter', () => {
  for (const id of FORBIDDEN_SERVICE_RECORDS) {
    assert.ok(!byId.get(id),
      `${id} was published, but VoIP/MVNO/fixed-wireless are service categories inside registers that already exist`);
  }
});

test('service labels never appear as a record name or official name', () => {
  // A record called "VoIP providers" or "MVNO list" would assert a legal
  // population that the research did not find in any jurisdiction audited.
  const LABEL = /^(voip|mvno|mno|isp|fixed wireless|satellite operators?|broadcasters?)\b/i;
  for (const r of ALL) {
    assert.ok(!LABEL.test(r.name), `${r.id} is named after a service category, not a statutory system`);
    if (r.officialName) {
      assert.ok(!LABEL.test(r.officialName), `${r.id} claims a service category as its official name`);
    }
  }
});

// ── 3. Notification is never a licence ──────────────────────────────────────
const NOTIFICATION_REGISTERS = ['cz-ctu-evidence-podnikatelu-ek',
  'de-bnetza-verzeichnis-gemeldeter-unternehmen', 'es-cnmc-registro-operadores', 'eu-berec-gadb'];

test('a notification register is never described as a licence register', () => {
  for (const id of NOTIFICATION_REGISTERS) {
    const r = byId.get(id);
    assert.match(limitsOf(r), /not a licence|no individual licence|grants nothing/i,
      `${id} does not state that a notification is not a licence`);
    assert.ok(!/licensed operator|licensed provider/i.test(visible(r)),
      `${id} calls a notified undertaking a licensed operator`);
  }
});

// ── 4-5. Numbering and spectrum are not operator status ─────────────────────
test('a numbering right is never described as operator authorisation', () => {
  for (const id of ['cz-ctu-pridelena-cisla-a-kody', 'es-cnmc-registro-numeracion']) {
    const r = byId.get(id);
    assert.match(visible(r), /proves nothing about spectrum or numbering|different legal act|three separate legal acts/i,
      `${id} does not separate a numbering right from operator status`);
  }
});

test('a spectrum authorisation is never described as service authorisation', () => {
  const r = byId.get('cz-ctu-individualni-opravneni-kmitocty');
  assert.match(limitsOf(r), /not the same as being an authorised telecommunications operator/i,
    'the spectrum record lets a holder read as an authorised operator');
});

// ── 6-7. Broadcasting and satellite ─────────────────────────────────────────
test('no transmitter, station or earth-station view is published as a register', () => {
  const FORBIDDEN = ['cz-ctu-prehled-rozhlasovych-vysilacu', 'cz-ctu-prehled-televiznich-vysilacu',
    'cz-ctu-bmis', 'cz-ctu-oznamena-rozhrani', 'fr-anfr-cartoradio',
    'us-fcc-earth-stations', 'de-bnetza-satellite-operators'];
  for (const id of FORBIDDEN) {
    assert.ok(!byId.get(id),
      `${id} was published, but transmitter, site and earth-station views are filtered spectrum data`);
  }
  // The Czech spectrum record must keep recording why those views are absorbed.
  assert.match(byId.get('cz-ctu-individualni-opravneni-kmitocty').editorNotes, /FILTERED VIEWS/,
    'the spectrum record no longer records that the transmitter overviews are filtered views');
});

test('a broadcasting disclosure system is not a broadcasting licence register', () => {
  const r = byId.get('us-fcc-public-inspection-files');
  assert.match(limitsOf(r), /not a register of authorisations/i,
    'the FCC public files record reads as a licence register');
  assert.match(limitsOf(r), /Broadcasting is not general telecommunications/i,
    'the FCC public files record conflates broadcasting with telecommunications');
});

// ── 9. Portability operational systems ──────────────────────────────────────
test('no number-portability operational system is published as a registry', () => {
  const FORBIDDEN = ['es-cnmc-portabilidad-movil', 'es-cnmc-portabilidad-fija',
    'de-bnetza-portierungskennungen', 'cz-ctu-portabilita'];
  for (const id of FORBIDDEN) {
    assert.ok(!byId.get(id),
      `${id} was published, but portability systems report operational routing, not authorisation`);
  }
  assert.match(byId.get('es-cnmc-registro-numeracion').editorNotes, /PORTABILITY STATUS pages were rejected/,
    'the Spanish numbering record no longer records the portability rejection');
});

// ── 10, 12. Postal stays separate from telecom ──────────────────────────────
test('postal registers are separate records and never merged into telecom', () => {
  const POSTAL = ['cz-ctu-evidence-postovnich-provozovatelu', 'de-bnetza-post-anbieterverzeichnis'];
  for (const id of POSTAL) {
    const r = byId.get(id);
    assert.ok(r, `postal record ${id} disappeared`);
    // Each must refuse to imply telecommunications status.
    assert.match(limitsOf(r), /says nothing about whether the operator is an electronic communications undertaking|says nothing about whether a company is a telecommunications undertaking/i,
      `${id} lets postal entry imply telecommunications status`);
  }
});

test('the German postal register states that entry is constitutive, not a notification', () => {
  const r = byId.get('de-bnetza-post-anbieterverzeichnis');
  assert.match(visible(r), /constitutive/i,
    'the German postal record does not say entry is constitutive');
  assert.match(visible(r), /only be provided by entered providers|may only be provided by/i,
    'the German postal record does not state the precondition');
  assert.match(limitsOf(r), /not a notification and not a licence/i,
    'the German postal record does not distinguish its act from notification and licensing');
  // And it must never be called a postal licence.
  assert.ok(!/postal licence/i.test(visible(r)), 'the German postal record calls the regime a licence');
});

test('the two Bundesnetzagentur systems share a host and stay distinct', () => {
  const group = ALL.filter((r) => r.resourceIdentity && r.resourceIdentity.sharedHostGroup === 'bundesnetzagentur-de');
  assert.strictEqual(group.length, 2, 'the bundesnetzagentur-de group must have exactly two members');
  assert.strictEqual(new Set(group.map((r) => r.resourceIdentity.systemKey)).size, 2,
    'the two Bundesnetzagentur systems must have distinct systemKeys');
  for (const r of group) {
    assert.strictEqual(r.resourceIdentity.canonicalDomain, 'bundesnetzagentur.de',
      `${r.id} must store the registrable host without a www prefix`);
  }
  // Each must point at the other, because one agency runs both.
  assert.ok(byId.get('de-bnetza-post-anbieterverzeichnis').related.similar
    .includes('de-bnetza-verzeichnis-gemeldeter-unternehmen'));
  assert.ok(byId.get('de-bnetza-verzeichnis-gemeldeter-unternehmen').related.similar
    .includes('de-bnetza-post-anbieterverzeichnis'));
});

// ── 11. FCC duplicate prevention ────────────────────────────────────────────
test('the FCC estate is unchanged and unduplicated', () => {
  const fcc = ALL.filter((r) => /fcc\.gov$/.test(hostOf(r.website)));
  assert.strictEqual(fcc.length, 3, 'the FCC estate is no longer exactly three records');
  assert.strictEqual(new Set(fcc.map((r) => hostOf(r.website))).size, 3, 'two FCC records share a host');
  assert.strictEqual(byId.get('us-fcc-uls').website, 'https://wireless2.fcc.gov/UlsApp/UlsSearch/searchLicense.jsp');
  assert.strictEqual(byId.get('us-fcc-form-499').website, 'https://apps.fcc.gov/cgb/form499/499a.cfm');
});

// ── 16-18. Regulator role separation ────────────────────────────────────────
test('French spectrum and broadcasting are never attributed to ARCEP', () => {
  for (const r of ALL.filter((x) => x.country === 'france')) {
    const v = `${r.name} ${r.officialName || ''} ${r.description}`;
    if (!/ARCEP/i.test(v)) continue;
    assert.ok(!/spectrum|fréquence|frequency/i.test(v),
      `${r.id} attributes spectrum to ARCEP, which belongs to ANFR`);
    assert.ok(!/broadcast|audiovisuel/i.test(v),
      `${r.id} attributes broadcasting to ARCEP, which belongs to Arcom`);
  }
});

test('German broadcasting is never attributed to the Bundesnetzagentur', () => {
  // Broadcasting regulation in Germany sits with the Länder, not BNetzA.
  for (const r of ALL.filter((x) => x.country === 'germany')) {
    if (!/Bundesnetzagentur/i.test(r.operator.name)) continue;
    assert.ok(!/broadcast(ing)? licen|Rundfunklizenz/i.test(visible(r)),
      `${r.id} attributes broadcasting licensing to the Bundesnetzagentur`);
  }
});

// ── 20-24. Content contract ─────────────────────────────────────────────────
test('every telecom record states its regulatory act and both non-proofs', () => {
  for (const id of TELECOM) {
    const r = byId.get(id);
    const l = limitsOf(r);
    assert.match(l, /does not establish|says nothing about|not a statement/i,
      `${id} never says what inclusion does not prove`);
    assert.match(l, /absen/i, `${id} never says what absence does not prove`);
  }
});

test('no record implies that listing proves current service', () => {
  const RETAINS = ['cz-ctu-evidence-podnikatelu-ek', 'cz-ctu-evidence-postovnich-provozovatelu',
    'es-cnmc-registro-operadores', 'ca-crtc-registered-telecom-providers'];
  for (const id of RETAINS) {
    assert.match(limitsOf(byId.get(id)), /were or are|interrupted or ended|ceased|trading today|currently offering service/i,
      `${id} lets a listing imply current service`);
  }
});

test('no record asserts a search URL or invents search behaviour', () => {
  for (const r of NEW) {
    assert.strictEqual(r.publicAccess.searchUrl, null, `${r.id} asserts a search URL`);
    if (r.publicAccess.freeToSearch === true) {
      assert.match(r.publicAccess.notes, /result rows were rendered/i,
        `${r.id} claims free search without recording that results were seen`);
    }
  }
  // The German postal register must not claim a total it never saw.
  assert.match(byId.get('de-bnetza-post-anbieterverzeichnis').publicAccess.notes,
    /no total, currency date or coverage figure was observed/i,
    'the German postal record claims a count or currency date it did not observe');
});

test('critical caveats are visible, not hidden in editor notes', () => {
  for (const r of NEW) {
    const html = fs.readFileSync(
      path.join(ROOT, 'research', 'business-directories', r.country, r.slug, 'index.html'), 'utf8');
    const body = html.replace(/<[^>]+>/g, ' ')
      .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ');
    assert.ok(!body.includes('FOUR ROLES, determined separately'), `${r.id} page publishes the editor notes`);
    assert.ok(!body.includes('SHARED-HOST DECISION'), `${r.id} page publishes the shared-host note`);
    for (const con of r.cons) {
      const probe = con.replace(/\s+/g, ' ').slice(0, 40);
      assert.ok(body.includes(probe), `${r.id} limitation does not reach the rendered page: ${probe}`);
    }
  }
});

// ── 25. Metrics ─────────────────────────────────────────────────────────────
test('every rating in the telecom layer was measured on the record’s own domain', () => {
  // POLICY REVERSAL. This test used to assert the Domain Rating freeze: every
  // record's rating was null, its metricsProvenance was {}, and the corpus held
  // exactly 64 measured domains. The freeze is lifted — Ahrefs' free public
  // domain-rating endpoint costs nothing, so ratings are collected again and all
  // three assertions are now false. What the freeze was protecting is that a
  // number is never invented and never borrowed from another domain, so that is
  // asserted directly instead, over the whole telecom layer as the other
  // boundary guards in this file are.
  const BD = require('../lib/bd-schema.cjs');
  let rated = 0;
  for (const id of TELECOM) {
    const r = byId.get(id);
    if (r.domainRating === undefined || r.domainRating === null) continue;
    rated += 1;
    assert.deepStrictEqual(BD.domainRatingProblems(r), [],
      `${r.id} carries a Domain Rating that does not satisfy the shared rule`);
    assert.strictEqual(r.metricsProvenance.domainRating.measuredDomain,
      BD.normaliseDomain(r.website),
      `${r.id} reports a rating measured on a domain that is not its own`);
  }
  assert.ok(rated > 0, 'no telecom record carries a Domain Rating, so this guard is vacuous');
  // In place of the pinned snapshot size: one domain has one dated reading, and
  // every record published on it repeats that reading verbatim. This layer is
  // where that bites — four CTU systems share ctu.gov.cz, both German registers
  // share bundesnetzagentur.de, and both Spanish ones share cnmc.es.
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
        status: 'publicApiReading', measuredDomain: 'bundesnetzagentur.de',
      },
    },
  }).length, 'provenance for a rating that is not set was accepted');
  assert.deepStrictEqual(BD.domainRatingProblems({ domainRating: null, metricsProvenance: {} }), [],
    'an unmeasured record was reported as a fault, which would force a number to be invented');
});

// ── 29. Browser-pending candidates stay unpublished ─────────────────────────
test('every browser-pending candidate remains unpublished', () => {
  const PENDING = ['gb-ofcom-wtr', 'gb-ofcom-numbering', 'gb-ofcom-broadcast',
    'au-acma-rrl', 'au-acma-carrier-licences', 'fr-arcep-operateurs',
    'it-agcom-roc', 'pl-uke-rejestr-przedsiebiorcow'];
  for (const id of PENDING) {
    assert.ok(!byId.get(id), `${id} was published while still blocked to verification`);
  }
});

// A regulator homepage is never the register. This guard covers the whole telecom
// layer, not just this wave, because the defect it prevents — swapping a working
// register URL for the regulator's front page — is silent and looks harmless.
const REGULATOR_HOMEPAGES = ['fcc.gov', 'crtc.gc.ca', 'ofcom.org.uk', 'acma.gov.au',
  'arcep.fr', 'anfr.fr', 'agcom.it', 'uke.gov.pl', 'bundesnetzagentur.de', 'cnmc.es',
  'ctu.gov.cz', 'berec.europa.eu'];

test('no telecom record uses a regulator homepage as its URL', () => {
  for (const id of TELECOM) {
    const r = byId.get(id);
    const u = new URL(r.website);
    const bare = u.pathname === '/' && !u.search;
    if (!bare) continue;
    assert.ok(!REGULATOR_HOMEPAGES.includes(hostOf(r.website)),
      `${r.id} uses the regulator homepage ${hostOf(r.website)} as the record URL`);
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
