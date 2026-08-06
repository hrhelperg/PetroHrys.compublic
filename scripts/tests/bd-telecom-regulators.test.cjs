'use strict';
// Wave 4A-2 — core telecom regulator completion.
//
// A boundary wave. Seven regulators researched, two records published. The guards
// below protect two things that are easy to lose:
//
//   1. A DISCLOSURE system is not a licence register, and a REGISTRATION is not a
//      licence. The two records added here are exactly those two shapes.
//   2. The determinations that produced NO record — ARCEP is not the French
//      spectrum authority, ANFR is; the CRTC withdrawn list is a historical
//      toggle; Cartoradio is a map — must not be quietly reversed by a later wave
//      adding a record that contradicts them.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { loadRegistry } = require('../lib/bd-registry.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const ALL = loadRegistry().directories;
const byId = new Map(ALL.map((r) => [r.id, r]));

const WAVE = ['us-fcc-public-inspection-files', 'ca-crtc-registered-telecom-providers'];
const NEW = WAVE.map((id) => byId.get(id));

const visible = (r) => [r.description, ...r.pros, ...r.cons, ...r.bestFor, ...r.notRecommendedFor].join(' \n ');
const limitsOf = (r) => [...r.cons, ...r.notRecommendedFor].join(' ');
const hostOf = (u) => new URL(u).hostname.replace(/^www\./, '');

test('every record this wave claims to have published exists', () => {
  assert.strictEqual(WAVE.length, 2, 'the wave manifest changed size without this test changing');
  for (const id of WAVE) assert.ok(byId.get(id), `missing record ${id}`);
});

// ── 1. Notification / registration is never called a licence ────────────────
test('CRTC registration is never described as a licence or an endorsement', () => {
  const r = byId.get('ca-crtc-registered-telecom-providers');
  assert.match(visible(r), /registration rather than a licence|REGISTRATION, not a licence/i,
    'the CRTC record does not distinguish registration from licensing');
  assert.match(limitsOf(r), /BITS licence/i,
    'the CRTC record does not name the separate international licence');
  // Registration must never read as an endorsement of quality or solvency.
  assert.match(limitsOf(r), /says nothing about technical quality, solvency/i,
    'the CRTC record lets registration read as an endorsement');
  assert.ok(!/\blicensed by the CRTC\b|\bCRTC licence to operate\b/i.test(visible(r)),
    'the CRTC record describes registration as licensing');
});

// ── 2-5. Filing / broadcasting / telecom boundaries ─────────────────────────
test('a disclosure system is never described as a licence register', () => {
  const r = byId.get('us-fcc-public-inspection-files');
  assert.match(limitsOf(r), /FILING and DISCLOSURE system, not a register of authorisations/i,
    'the FCC public files record does not separate disclosure from authorisation');
  assert.match(limitsOf(r), /does not establish that any licence is current/i,
    'the FCC public files record lets presence imply a valid licence');
});

test('a broadcasting system is never described as general telecom authorisation', () => {
  const r = byId.get('us-fcc-public-inspection-files');
  assert.match(limitsOf(r), /Broadcasting is not general telecommunications/i,
    'the FCC public files record conflates broadcasting with telecommunications');
});

test('no record in this wave claims to cover spectrum or numbering', () => {
  for (const r of NEW) {
    assert.ok(!/this register covers spectrum|numbering allocations are recorded here/i.test(visible(r)),
      `${r.id} claims spectrum or numbering coverage it does not have`);
  }
  // The FCC record must actively point spectrum and carrier questions elsewhere.
  assert.match(limitsOf(byId.get('us-fcc-public-inspection-files')),
    /wireless licensing system or its carrier filer database/i,
    'the FCC public files record does not redirect spectrum and carrier questions');
});

// ── 6-7. FCC duplicate blocking ─────────────────────────────────────────────
test('the pre-existing FCC systems are untouched and not duplicated', () => {
  const uls = byId.get('us-fcc-uls');
  const f499 = byId.get('us-fcc-form-499');
  assert.ok(uls && f499, 'a pre-existing FCC record disappeared');
  assert.strictEqual(uls.website, 'https://wireless2.fcc.gov/UlsApp/UlsSearch/searchLicense.jsp');
  assert.strictEqual(f499.website, 'https://apps.fcc.gov/cgb/form499/499a.cfm');
  // Three FCC systems, three distinct hosts, no duplicate host.
  const fccHosts = ALL.filter((r) => /fcc\.gov$/.test(hostOf(r.website))).map((r) => hostOf(r.website));
  assert.strictEqual(new Set(fccHosts).size, fccHosts.length, 'two FCC records share a host');
  assert.strictEqual(fccHosts.length, 3, 'the FCC estate is no longer exactly three records');
  // The new record must document the duplicate audit against both.
  assert.match(byId.get('us-fcc-public-inspection-files').editorNotes,
    /DUPLICATE AUDIT against the two pre-existing FCC records/,
    'the FCC public files record does not record its duplicate audit');
});

// ── 8-13. Determinations that produced NO record ────────────────────────────
// These are the wave's real output. A later wave must not reverse them silently.
test('ARCEP is never credited with the French spectrum function', () => {
  // The French State entrusted spectrum management to ANFR, not ARCEP. Any future
  // French spectrum record must name ANFR.
  for (const r of ALL.filter((x) => x.country === 'france')) {
    const v = `${r.name} ${r.officialName || ''} ${r.description}`;
    if (!/ARCEP|Autorité de régulation des communications/i.test(v)) continue;
    assert.ok(!/spectrum|fréquence|frequency/i.test(v),
      `${r.id} attributes a spectrum function to ARCEP, which belongs to ANFR`);
  }
});

test('no CRTC withdrawn-list or quality-indicator record was created', () => {
  const FORBIDDEN = ['ca-crtc-withdrawn-providers', 'ca-crtc-quality-of-service'];
  for (const id of FORBIDDEN) {
    assert.ok(!byId.get(id), `${id} was published, but it is a view of an existing system`);
  }
  // The withdrawn list must instead be described inside the registration record.
  assert.match(limitsOf(byId.get('ca-crtc-registered-telecom-providers')),
    /withdrawn-and-incomplete list/i,
    'the registration record does not tell a reader where a removed provider goes');
});

test('no record was created for a system whose scope was never established', () => {
  // AGCOM ROC, Ofcom, ACMA and UKE candidates are pending browser verification.
  // Publishing any of them without establishing scope would be the defect.
  const PENDING = ['it-agcom-roc', 'gb-ofcom-wtr', 'gb-ofcom-numbering',
    'au-acma-rrl', 'pl-uke-rejestr-przedsiebiorcow'];
  for (const id of PENDING) {
    assert.ok(!byId.get(id), `${id} was published while still pending browser verification`);
  }
});

// ── 14. Historical / current distinction ────────────────────────────────────
test('neither record implies that listing proves current service', () => {
  assert.match(limitsOf(byId.get('ca-crtc-registered-telecom-providers')),
    /does not establish that a provider is currently offering service/i,
    'the CRTC record lets a listing imply current service');
});

// ── 15-17. URL and access truth ─────────────────────────────────────────────
test('every website is a real official host, not a regulator homepage', () => {
  const HOMEPAGES = ['fcc.gov', 'crtc.gc.ca', 'ofcom.org.uk', 'acma.gov.au', 'arcep.fr', 'agcom.it', 'uke.gov.pl'];
  for (const r of NEW) {
    const u = new URL(r.website);
    const host = hostOf(r.website);
    const isBareHomepage = HOMEPAGES.includes(host) && u.pathname === '/';
    assert.ok(!isBareHomepage, `${r.id} uses a regulator homepage as the record URL`);
    assert.match(r.website, /^https:\/\//, `${r.id} is not served over https`);
  }
});

test('an untested application keeps accessLevel unknown and every boolean null', () => {
  const r = byId.get('ca-crtc-registered-telecom-providers');
  assert.strictEqual(r.publicAccess.accessLevel, 'unknown');
  for (const k of ['freeToSearch', 'loginRequired', 'identityVerificationRequired',
    'captcha', 'geographicRestriction', 'paidDocumentsAvailable', 'searchUrl']) {
    assert.strictEqual(r.publicAccess[k], null,
      `${r.id} asserts ${k} for an application that was never exercised`);
  }
  // And the reason must be visible to a reader, not only in access notes.
  assert.match(limitsOf(r), /rendered by JavaScript|loading state/i,
    'the CRTC record hides from readers that the list never rendered');
});

test('no record asserts a search URL or invents search behaviour', () => {
  for (const r of NEW) {
    assert.strictEqual(r.publicAccess.searchUrl, null, `${r.id} asserts a search URL`);
    assert.ok(!/results are returned|search returns|query returns/i.test(visible(r)),
      `${r.id} describes search behaviour that was never observed`);
  }
});

// ── 18. Critical caveats rendered ───────────────────────────────────────────
test('critical caveats are visible, not hidden in editor notes', () => {
  for (const r of NEW) {
    const html = fs.readFileSync(
      path.join(ROOT, 'research', 'business-directories', r.country, r.slug, 'index.html'), 'utf8');
    const body = html.replace(/<[^>]+>/g, ' ')
      .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ');
    assert.ok(!body.includes('FOUR ROLES, determined separately'), `${r.id} page publishes the editor notes`);
    assert.ok(!body.includes('DUPLICATE AUDIT'), `${r.id} page publishes the duplicate audit note`);
    for (const con of r.cons) {
      const probe = con.replace(/\s+/g, ' ').slice(0, 40);
      assert.ok(body.includes(probe), `${r.id} limitation does not reach the rendered page: ${probe}`);
    }
  }
});

test('the CRTC accuracy disclaimer reaches the reader', () => {
  // The Commission disclaims accuracy and currency of its own list. That is the
  // single most important thing a reader can know about this register.
  const r = byId.get('ca-crtc-registered-telecom-providers');
  assert.match(limitsOf(r), /not responsible for the accuracy, reliability or currency/i,
    'the CRTC disclaimer is not in the published limitations');
});

// ── 19. Metrics ─────────────────────────────────────────────────────────────
test('no new record carries a metric and the frozen snapshot is untouched', () => {
  for (const r of NEW) {
    assert.strictEqual(r.domainRating, null, `${r.id} carries a Domain Rating`);
    assert.deepStrictEqual(r.metricsProvenance, {}, `${r.id} invented metrics provenance`);
  }
  const domains = new Set();
  for (const r of ALL) {
    const p = r.metricsProvenance && r.metricsProvenance.domainRating;
    if (p && p.measuredDomain) domains.add(p.measuredDomain);
  }
  assert.strictEqual(domains.size, 64, 'the frozen measurement set changed size');
});

// ── Four roles ──────────────────────────────────────────────────────────────
test('every record documents the four roles separately', () => {
  for (const r of NEW) {
    for (const role of ['LEGAL SOURCE OF RECORD:', 'RESPONSIBLE AUTHORITY:',
      'TECHNICAL PLATFORM:', 'PUBLIC ACCESS INTERFACE:']) {
      assert.ok(r.editorNotes.includes(role), `${r.id} does not determine ${role}`);
    }
  }
});

test('every record states what inclusion and absence do not prove', () => {
  for (const r of NEW) {
    const l = limitsOf(r);
    assert.match(l, /does not establish/i, `${r.id} never says what inclusion does not prove`);
    assert.match(l, /Absence does not/i, `${r.id} never says what absence does not prove`);
  }
});
