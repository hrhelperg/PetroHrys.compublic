'use strict';
// Waves 1B.3–1B.6 — France, Poland, Italy, Spain.
//
// Three records from four countries. The most important assertions here are
// about what does NOT exist:
//
//   France — nothing publishable. Every candidate refuses automated clients.
//   Spain  — nothing publishable. Páginas Amarillas is blocked; Empresite has no
//            listing flow; eInforma is a credit-data product, not a directory.
//
// And about two duplicate decisions that went OPPOSITE ways on the same
// question, which is the subtlest thing in this wave:
//
//   Poland — WeNet owns Panorama Firm and pkt.pl. TWO records: separate forms,
//            separate terms, no shared profile.
//   Italy  — Italiaonline owns PagineGialle and Virgilio Aziende. ONE record:
//            Virgilio's registration routes into the PagineGialle self-service
//            system, so it is one product on two surfaces.
//
// Ownership decided neither. The submission system decided both.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const S = require('../lib/bd-schema.cjs');
const { loadRegistry } = require('../lib/bd-registry.cjs');
// Publication parity, in place of the per-country totals this suite used to pin.
const PARITY = require('./helpers/country-parity.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const ALL = loadRegistry().directories;
const byId = new Map(ALL.map((r) => [r.id, r]));

const WAVE = ['pl-panorama-firm', 'pl-pkt', 'it-paginegialle'];
const NEW = WAVE.map((id) => byId.get(id));

const visible = (r) => [r.description, ...r.pros, ...r.cons, ...r.bestFor, ...r.notRecommendedFor].join(' \n ');
const limitsOf = (r) => [...r.cons, ...r.notRecommendedFor].join(' ');
const hostOf = (u) => new URL(u).hostname.replace(/^www\./, '');
const commercialIn = (c) => ALL.filter((r) => r.country === c && !S.isGovernmentPillar(r));

test('every record this wave claims to have published exists', () => {
  assert.strictEqual(WAVE.length, 3, 'the wave manifest changed size without this test changing');
  for (const id of WAVE) assert.ok(byId.get(id), `missing record ${id}`);
  // BRITTLE MIRRORS, REMOVED: two per-country totals, one already carrying its
  // own changelog. See scripts/tests/helpers/country-parity.cjs.
  PARITY.assertCountryPublicationParity(assert, ALL, 'poland', 11);
  PARITY.assertCountryPublicationParity(assert, ALL, 'italy', 8);
});

// ── the two countries that yielded nothing ──────────────────────────────────
test('France and Spain have no commercial directory records', () => {
  // Both were researched and both came back empty. A later wave adding one
  // without clearing the blockers would be publishing on inference.
  assert.deepStrictEqual(commercialIn('france').map((r) => r.id), [],
    'a French commercial directory was published, but every French candidate was blocked');
  assert.deepStrictEqual(commercialIn('spain').map((r) => r.id), [],
    'a Spanish commercial directory was published, but no Spanish candidate was verifiable');
});

test('the blocked and rejected candidates stay unpublished', () => {
  const FORBIDDEN_HOSTS = [
    'pagesjaunes.fr', 'kompass.com', 'solocal.com', 'hoodspot.fr', 'annuaire.petitesaffiches.fr',
    'paginasamarillas.es', 'empresite.eleconomista.es', 'einforma.com',
    // firmy.net was removed from this list by the high-authority expansion wave.
    // Its rejection reason — operator unidentified, add flow a javascript:void(0)
    // handler, cost undocumented — was resolved from the operator's own pages:
    // NNV Sp. z o.o., a real /dodaj-firme form, and a stated free presentation.
    'misterimprese.it', 'aziende.virgilio.it',
  ];
  for (const host of FORBIDDEN_HOSTS) {
    const hit = ALL.find((r) => hostOf(r.website) === host);
    assert.ok(!hit, `${host} was published; it was blocked, rejected or absorbed`);
  }
});

// ── the two opposite duplicate decisions ────────────────────────────────────
test('the Polish WeNet pair stays two records, on submission-system grounds', () => {
  const a = byId.get('pl-panorama-firm');
  const b = byId.get('pl-pkt');
  assert.notStrictEqual(hostOf(a.website), hostOf(b.website), 'the pair share a host');
  assert.notStrictEqual(a.submissionUrl, b.submissionUrl, 'the pair share a submission form');
  assert.ok(a.submissionUrl && b.submissionUrl, 'each must have its own submission route');
  // Both must disclose the shared group rather than hide it.
  for (const r of [a, b]) {
    assert.match(visible(r), /WeNet/, `${r.id} does not disclose the shared WeNet group`);
    assert.match(r.editorNotes, /Ownership is not evidence/i,
      `${r.id} does not record why shared ownership did not merge them`);
  }
});

test('Virgilio Aziende is absorbed into PagineGialle, not published', () => {
  assert.ok(!byId.get('it-virgilio-aziende'), 'Virgilio was published as a separate record');
  const r = byId.get('it-paginegialle');
  assert.match(r.editorNotes, /VIRGILIO AZIENDE ABSORBED/,
    'the PagineGialle record does not document the absorption');
  assert.match(r.editorNotes, /italiaonline\.it\/self\/pgit/,
    'the absorption is asserted without the routing evidence that justifies it');
  // And a reader must be told, not just an editor.
  assert.match(visible(r), /Virgilio/,
    'readers are never told that Virgilio uses the same system');
});

test('the two duplicate decisions are recorded as deliberately opposite', () => {
  // If a later wave flips one, the contrast should stop making sense loudly.
  assert.match(byId.get('it-paginegialle').editorNotes, /opposite conclusion to the Polish WeNet pair/i,
    'the Italian decision no longer explains why it differs from the Polish one');
});

// ── pillar boundary ─────────────────────────────────────────────────────────
test('no record is a government record or claims to be a registry', () => {
  for (const r of NEW) {
    assert.ok(!S.isGovernmentPillar(r), `${r.id} landed in the Government Registry pillar`);
    assert.deepStrictEqual(r.registryTypes, [], `${r.id} claims a registry type`);
    assert.ok(!/statutory|official register|source of record/i.test(visible(r)),
      `${r.id} describes a commercial directory in statutory language`);
  }
});

test('no Polish or Italian government record gained a listing action', () => {
  for (const c of ['poland', 'italy']) {
    for (const r of ALL.filter((x) => x.country === c && S.isGovernmentPillar(x))) {
      assert.strictEqual(r.listingAction, 'not-applicable', `${r.id} gained a listing action`);
      assert.strictEqual(r.submissionModel, 'notApplicable', `${r.id} gained a submission model`);
    }
  }
});

// ── evidence discipline ─────────────────────────────────────────────────────
test('nothing undocumented is asserted', () => {
  for (const r of NEW) {
    assert.strictEqual(r.verificationMethods, null, `${r.id} asserts verification methods`);
    assert.strictEqual(r.ownerResponseSupport, null, `${r.id} asserts owner-response support`);
    assert.strictEqual(r.listingAction, 'create', `${r.id} asserts an action beyond create`);
    assert.strictEqual(r.claimUrl, null, `${r.id} asserts a claim URL`);
  }
});

test('the operator marketing claim on pkt.pl was not adopted', () => {
  const r = byId.get('pl-pkt');
  assert.match(limitsOf(r), /operator’s marketing claim|no ranking, indexing or traffic outcome is asserted/i,
    'the record does not disown the operator’s Google-positioning claim');
  assert.ok(!/will rank|higher in Google|better position in Google/i.test(visible(r)),
    'the record repeats the operator’s SEO claim as fact');
});

test('third-party submission on Panorama Firm is disclosed', () => {
  const r = byId.get('pl-panorama-firm');
  assert.match(limitsOf(r), /third party|Użytkownikiem/i,
    'readers are not told that a customer can add a business');
  assert.match(limitsOf(r), /not evidence that the named business created or approved it/i,
    'the provenance consequence is not stated');
});

test('the PagineGialle VAT requirement is disclosed and not overstated', () => {
  const r = byId.get('it-paginegialle');
  assert.match(visible(r), /Partita IVA|VAT number/i, 'the VAT requirement is not visible');
  // Requiring a VAT number is not the same as verifying one.
  assert.strictEqual(r.verificationMethods, null,
    'a required form field was treated as a verification method');
  assert.match(limitsOf(r), /Whether the operator verifies it against any register is not documented/i,
    'the record does not distinguish requiring a VAT number from verifying it');
});

// ── no unsupported outcome claims ───────────────────────────────────────────
test('no record claims a backlink, indexing, ranking or traffic outcome', () => {
  const FORBIDDEN = /dofollow|nofollow|guaranteed (backlink|traffic|ranking|indexing)|improve your ranking|boost your seo|drives traffic/i;
  for (const r of NEW) {
    assert.ok(!FORBIDDEN.test(visible(r)), `${r.id} makes an unestablished SEO or traffic claim`);
    assert.strictEqual(r.backlinkType, null);
    assert.strictEqual(r.indexed, null);
  }
});

// ── critical caveats, pinned so deletion fails ──────────────────────────────
const CRITICAL_CAVEATS = {
  'pl-panorama-firm': [[/Właścicielem \/ Użytkownikiem|owner or a user/i, 'that a third party can add a business']],
  'pl-pkt': [[/requires JavaScript/i, 'that the form needs JavaScript']],
  'it-paginegialle': [[/not open to unregistered businesses/i, 'who is excluded by the VAT requirement']],
};

test('every critical caveat survives in rendered prose', () => {
  for (const [id, checks] of Object.entries(CRITICAL_CAVEATS)) {
    const v = visible(byId.get(id));
    for (const [re, what] of checks) {
      assert.ok(re.test(v), `${id} no longer tells a reader ${what}`);
    }
  }
});

// ── metrics ─────────────────────────────────────────────────────────────────
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

// ── rendering ───────────────────────────────────────────────────────────────
test('the listing block renders and editor notes do not', () => {
  for (const r of NEW) {
    const html = fs.readFileSync(
      path.join(ROOT, 'research', 'business-directories', r.country, r.slug, 'index.html'), 'utf8');
    const body = html.replace(/<[^>]+>/g, ' ')
      .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ');
    assert.ok(body.includes('Create a listing'), `${r.id} does not render its listing action`);
    for (const leak of ['PLATFORM OPERATOR:', 'DUPLICATE DECISION', 'NOT ASSERTED',
      'MARKETING CLAIM NOT ADOPTED', 'VIRGILIO AZIENDE ABSORBED']) {
      assert.ok(!body.includes(leak), `${r.id} page publishes the editor note "${leak}"`);
    }
    for (const con of r.cons) {
      const probe = con.replace(/\s+/g, ' ').slice(0, 40);
      assert.ok(body.includes(probe), `${r.id} limitation does not reach the page: ${probe}`);
    }
  }
});

test('every record documents the non-statutory identity roles', () => {
  for (const r of NEW) {
    for (const role of ['PLATFORM OPERATOR:', 'LISTING CONTROL:',
      'MODERATION AUTHORITY:', 'PUBLIC INTERFACE:']) {
      assert.ok(r.editorNotes.includes(role), `${r.id} does not determine ${role}`);
    }
    assert.ok(!r.editorNotes.includes('LEGAL SOURCE OF RECORD:'),
      `${r.id} uses the statutory identity contract on a commercial platform`);
  }
});
