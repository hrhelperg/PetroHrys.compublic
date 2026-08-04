// scripts/tests/bd-wave1a-federal.test.cjs
'use strict';

// Cover for the Wave 1A US federal layer. The invariants here are the ones a
// later wave is most likely to break by accident: a state record slipping into
// the federal set, a registry type drifting from the glossary, an access level
// claiming more than the evidence, or a new Domain Rating appearing.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const S = require('../lib/bd-schema.cjs');
const T = require('../lib/bd-registry-types.cjs');
const c = require('../lib/bd-components.cjs');
const { validateRegistry } = require('../validate-business-directories.cjs');
const { loadRegistry } = require('../lib/bd-registry.cjs');
const { verifiedRecord } = require('./helpers/fixtures.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const REGISTRY = loadRegistry();
const okOf = (dirs) => validateRegistry({ ...REGISTRY, directories: dirs });
const reasons = (r) => r.errors.map((e) => `${e.field}: ${e.reason}`).join(' | ');

const US = REGISTRY.directories.filter((r) => r.country === 'united-states');

// The Wave 1A set, named explicitly.
//
// A derived filter was tried first and does not work: the US records that
// predate this wave were backfilled with registry types during the foundation
// phase, and two of them (SEC EDGAR, FINRA BrokerCheck) also carry no Domain
// Rating, so no property distinguishes them. For a wave-scoped test the list IS
// the subject, and naming it makes the scope of every guard below unambiguous.
// A test at the bottom fails if the list and the dataset drift apart.
const WAVE_1A_IDS = [
  'us-usaspending', 'us-sam-entity-information',
  'us-fdic-bankfind', 'us-occ-institution-search', 'us-sec-iapd', 'us-fincen-msb', 'us-nfa-basic',
  'us-nppes-npi', 'us-fda-device-establishments',
  'us-irs-teos', 'us-uspto-patent-public-search', 'us-dmca-agent-directory',
  'us-ttb-permittees', 'us-cbp-customs-brokers', 'us-fmc-oti-list',
  'us-fcc-uls', 'us-fcc-form-499',
  'us-faa-aircraft-registry', 'us-msha-mdrs', 'us-fsis-mpi-directory',
];
const byId = new Map(REGISTRY.directories.map((r) => [r.id, r]));
const FEDERAL = WAVE_1A_IDS.map((id) => byId.get(id));

test('every named Wave 1A record exists, and the wave is big enough to guard', () => {
  const missing = WAVE_1A_IDS.filter((id) => !byId.has(id));
  assert.deepStrictEqual(missing, [], `named Wave 1A records are absent from the dataset: ${missing}`);
  assert.ok(FEDERAL.length >= 20, `only ${FEDERAL.length} records: the guards would be near-vacuous`);
  assert.ok(US.length > FEDERAL.length,
    'every US record is in Wave 1A, so the wave/pre-wave distinction is untested');
});

// --- scope and jurisdiction ---------------------------------------------------

test('every federal record is national scope with no jurisdiction', () => {
  for (const r of FEDERAL) {
    assert.strictEqual(r.scope, 'national', `${r.id} is not national scope`);
    assert.strictEqual(r.jurisdiction, null, `${r.id} carries a jurisdiction in the federal wave`);
  }
});

test('no state or territory code has leaked into the federal wave', () => {
  const blob = JSON.stringify(FEDERAL);
  // ISO 3166-2 US subdivision codes must not appear anywhere in a federal record.
  const found = [...blob.matchAll(/"US-[A-Z]{2}"/g)].map((m) => m[0]);
  assert.deepStrictEqual(found, [], `subnational codes appeared in federal records: ${found}`);
  // Non-vacuity: the pattern does match when a code IS present.
  assert.match(JSON.stringify({ code: 'US-CA' }), /"US-CA"/);
});

test('a federal record that gains a jurisdiction is rejected', () => {
  const rec = { ...FEDERAL[0], id: 'us-probe', slug: 'us-probe', website: 'https://probe.example.gov/',
    jurisdiction: { type: 'state', name: 'Ohio', code: 'US-OH', parentCountry: 'united-states' } };
  const r = okOf([rec]);
  assert.strictEqual(r.ok, false, 'a federal record with a jurisdiction and national scope was accepted');
  assert.match(reasons(r), /must use scope "subnational"/);
});

// --- classification -----------------------------------------------------------

test('every federal registry type is in the glossary, with a primary in the list', () => {
  for (const r of FEDERAL) {
    for (const t of r.registryTypes) {
      assert.ok(T.REGISTRY_TYPE_BY_ID.has(t), `${r.id} uses undefined registry type "${t}"`);
    }
    assert.ok(r.primaryRegistryType, `${r.id} has types but no primary`);
    assert.ok(r.registryTypes.includes(r.primaryRegistryType),
      `${r.id} primary "${r.primaryRegistryType}" is not in its list`);
    assert.strictEqual(new Set(r.registryTypes).size, r.registryTypes.length,
      `${r.id} repeats a registry type`);
  }
});

test('every federal record names an operator with a valid type', () => {
  for (const r of FEDERAL) {
    assert.ok(r.operator && r.operator.name && r.operator.name.trim(), `${r.id} has no operator`);
    assert.ok(S.OPERATOR_TYPES.includes(r.operator.type),
      `${r.id} operator type "${r.operator.type}" is not in the enum`);
  }
});

test('every federal record uses notApplicable submission', () => {
  // These are statutory registers. A "free to submit" federal register would
  // mean the classification was wrong, not that the register is generous.
  for (const r of FEDERAL) {
    assert.strictEqual(r.submissionModel, 'notApplicable',
      `${r.id} is marked "${r.submissionModel}" — statutory registers are not submission targets`);
    assert.strictEqual(r.submissionUrl, null, `${r.id} carries a submissionUrl`);
  }
});

// --- public access --------------------------------------------------------------

test('every federal publicAccess block is structurally valid and self-consistent', () => {
  for (const r of FEDERAL) {
    assert.ok(r.publicAccess, `${r.id} has no publicAccess block`);
    assert.ok(S.ACCESS_LEVELS.includes(r.publicAccess.accessLevel),
      `${r.id} has access level "${r.publicAccess.accessLevel}"`);
    assert.deepStrictEqual(S.accessContradictions(r.publicAccess), [],
      `${r.id} has a contradictory access description`);
    if (r.publicAccess.searchUrl) {
      assert.ok(r.publicAccess.searchUrl.startsWith('https://'),
        `${r.id} search URL is not https`);
    }
  }
});

test('an "open" claim is backed by established booleans, not by silence', () => {
  const open = FEDERAL.filter((r) => r.publicAccess.accessLevel === 'open');
  assert.ok(open.length > 0, 'no open record to check: the guard is vacuous');
  for (const r of open) {
    assert.strictEqual(r.publicAccess.loginRequired, false,
      `${r.id} claims open access without establishing that no login is required`);
    assert.strictEqual(r.publicAccess.identityVerificationRequired, false,
      `${r.id} claims open access without establishing that no identity check is required`);
  }
});

test('a partially-open record says what is limited', () => {
  const partial = FEDERAL.filter((r) => r.publicAccess.accessLevel === 'partially-open');
  assert.ok(partial.length > 0, 'no partially-open record: the guard is vacuous');
  for (const r of partial) {
    const flagged = S.ACCESS_LIMITATION_FLAGS.some((k) => r.publicAccess[k] === true);
    assert.ok(flagged || (r.publicAccess.notes && r.publicAccess.notes.trim()),
      `${r.id} is partially-open but names no limitation`);
  }
});

// --- the open-source data policy still holds ------------------------------------

test('no federal record carries a Domain Rating or any third-party metric', () => {
  for (const r of FEDERAL) {
    for (const field of S.THIRD_PARTY_METRICS) {
      assert.strictEqual(r[field], null, `${r.id} carries ${field}`);
    }
    assert.deepStrictEqual(r.metricsProvenance, {}, `${r.id} carries metric provenance`);
    assert.strictEqual(r.metricStatus, 'unknown', `${r.id} claims a metric status`);
  }
});

test('the frozen snapshot count is untouched by this wave', () => {
  const measured = REGISTRY.directories.filter((r) => r.domainRating !== null);
  assert.strictEqual(measured.length, 64,
    `${measured.length} records carry a Domain Rating; Wave 1A must add none`);
});

// --- editorial contract ----------------------------------------------------------

test('every federal record carries original, non-templated editorial content', () => {
  const descriptions = new Set();
  for (const r of FEDERAL) {
    assert.ok(r.description.length > 80, `${r.id} description is too thin`);
    assert.ok(!descriptions.has(r.description), `${r.id} repeats another description`);
    descriptions.add(r.description);
    assert.ok(r.pros.length >= 2, `${r.id} has fewer than two pros`);
    assert.ok(r.cons.length >= 2, `${r.id} has fewer than two cons`);
    assert.ok(r.bestFor.length > 0 || r.notRecommendedFor.length > 0, `${r.id} has no audience guidance`);
    assert.ok(r.editorNotes.length > 100, `${r.id} has no substantive verification note`);
  }
  // Templated cons are the specific failure mode: same sentence, different agency.
  const allCons = FEDERAL.flatMap((r) => r.cons);
  assert.strictEqual(new Set(allCons).size, allCons.length,
    'two federal records share a con verbatim');
});

test('no federal record makes an unsupported legal or trust claim', () => {
  const banned = /proves? (that )?(the )?(company|entity|business) is (trustworthy|compliant|legitimate)|guarantees? (compliance|legal status)|instead of (professional )?due diligence/i;
  for (const r of FEDERAL) {
    assert.ok(!banned.test(JSON.stringify(r)), `${r.id} makes an unsupported trust claim`);
  }
});

test('every federal score reproduces from its factors', () => {
  for (const r of FEDERAL) {
    assert.strictEqual(S.computeScore(r.scoreFactors), r.petroHrysScore,
      `${r.id} score does not reproduce`);
  }
  // Federal authority is not a free pass: the wave must not be uniformly top-scored.
  const scores = FEDERAL.map((r) => r.petroHrysScore);
  assert.ok(Math.max(...scores) - Math.min(...scores) >= 15,
    `federal scores span only ${Math.max(...scores) - Math.min(...scores)} points — practical limitations are not being reflected`);
});

// --- duplicate and overlap control ------------------------------------------------

test('no federal record duplicates another platform or search surface', () => {
  const hosts = FEDERAL.map((r) => new URL(r.website).hostname.replace(/^www\./, ''));
  assert.strictEqual(new Set(hosts).size, hosts.length,
    `two federal records share a host: ${hosts.filter((h, i) => hosts.indexOf(h) !== i)}`);
  const ids = FEDERAL.map((r) => r.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'duplicate federal id');
});

test('every federal relation resolves to a published record', () => {
  const all = new Set(REGISTRY.directories.map((r) => r.id));
  let relations = 0;
  for (const r of FEDERAL) {
    for (const kind of S.RELATION_KINDS) {
      for (const target of r.related[kind]) {
        assert.ok(all.has(target), `${r.id} relates to unknown "${target}"`);
        assert.notStrictEqual(target, r.id, `${r.id} relates to itself`);
        relations += 1;
      }
    }
  }
  assert.ok(relations > 0, 'the federal wave added no relations: the guard is vacuous');
});

// --- generated output ---------------------------------------------------------------

test('every federal record is indexable and has a page in the sitemap', () => {
  const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap-business-directories.xml'), 'utf8');
  for (const r of FEDERAL) {
    assert.ok(S.indexability(r).indexable,
      `${r.id} is not indexable: ${S.indexability(r).missing.join(', ')}`);
    const page = path.join(ROOT, 'research', 'business-directories', r.country, r.slug, 'index.html');
    assert.ok(fs.existsSync(page), `${r.id} has no generated page`);
    assert.ok(sitemap.includes(`/${r.country}/${r.slug}/`), `${r.id} is missing from the sitemap`);
  }
});

test('the US country page carries every US record and stays within proven size', () => {
  const file = path.join(ROOT, 'research', 'business-directories', 'united-states', 'index.html');
  const html = fs.readFileSync(file, 'utf8');
  const rows = (html.match(/class="bd-row"/g) || []).length;
  assert.strictEqual(rows, US.length, `the US page shows ${rows} of ${US.length} records`);
  // The global page already ships 53 rows. Staying under it means this wave
  // introduced no page the architecture has not already carried in production.
  const globalHtml = fs.readFileSync(
    path.join(ROOT, 'research', 'business-directories', 'global', 'index.html'), 'utf8');
  const globalRows = (globalHtml.match(/class="bd-row"/g) || []).length;
  assert.ok(rows <= globalRows,
    `the US page (${rows} rows) now exceeds the largest already-shipped page (${globalRows})`);
  // Controls and mobile labels survive at the larger size.
  assert.match(html, /data-bd-search/);
  assert.ok((html.match(/data-bd-filter=/g) || []).length >= 4, 'filters were lost');
  assert.ok((html.match(/data-bd-label/g) || []).length >= rows * 2, 'mobile labels were lost');
});

test('grouping stays off while no US record is subnational', () => {
  const file = path.join(ROOT, 'research', 'business-directories', 'united-states', 'index.html');
  const html = fs.readFileSync(file, 'utf8');
  assert.strictEqual((html.match(/data-bd-rows/g) || []).length, 1,
    'the US page grouped despite having no subnational record');
  assert.ok(!/bd-jgroup/.test(html), 'a jurisdiction group box was rendered with no subnational record');
  // Non-vacuity: grouping DOES switch on when a subnational record is present.
  const withState = [...US, verifiedRecord({
    id: 'probe', slug: 'probe', country: 'united-states', website: 'https://probe.example.gov/',
    scope: 'subnational',
    jurisdiction: { type: 'state', name: 'Ohio', code: 'US-OH', parentCountry: 'united-states' },
  })];
  assert.ok(c.jurisdictionGroups(withState, 'united-states'),
    'grouping did not activate for a set containing a subnational record');
});

test('telecommunications was activated by this wave', () => {
  const telecom = REGISTRY.directories.filter((r) => r.category === 'telecommunications');
  assert.ok(telecom.length >= 2, 'telecommunications did not activate');
  const page = path.join(ROOT, 'research', 'business-directories', 'united-states',
    'categories', 'telecommunications', 'index.html');
  assert.ok(fs.existsSync(page), 'the telecommunications category page was not generated');
});
