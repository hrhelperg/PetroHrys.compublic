// scripts/tests/bd-wave1-hardening.test.cjs
'use strict';

// Cover for the C8/C9/C10 fixes, the registry-type glossary, the classification
// invariants and the Registry information UI.
//
// Each guard is paired with the defect it exists to catch. Where a mutation is
// the only honest proof, the test performs it in memory rather than trusting
// that the production path "looks right".

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const S = require('../lib/bd-schema.cjs');
const c = require('../lib/bd-components.cjs');
const T = require('../lib/bd-registry-types.cjs');
const { validateRegistry } = require('../validate-business-directories.cjs');
const { loadRegistry } = require('../lib/bd-registry.cjs');
const { migrateRecord, UNKNOWN_KEYS } = require('../lib/bd-migrate.cjs');
const { verifiedRecord } = require('./helpers/fixtures.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const REGISTRY = loadRegistry();
const okOf = (dirs) => validateRegistry({ ...REGISTRY, directories: dirs });
const reasons = (r) => r.errors.map((e) => `${e.field}: ${e.reason}`).join(' | ');

const usState = (name, jname, code, over = {}) => verifiedRecord({
  id: `h-${name}`, slug: `h-${name}`.toLowerCase(), name, officialName: name,
  country: 'united-states', website: `https://${name.toLowerCase()}.example.gov/`,
  scope: 'subnational',
  jurisdiction: { type: 'state', name: jname, code, parentCountry: 'united-states' },
  ...over,
});
const usFederal = (name, over = {}) => verifiedRecord({
  id: `h-${name}`, slug: `h-${name}`.toLowerCase(), name, officialName: name,
  country: 'united-states', website: `https://${name.toLowerCase()}.example.gov/`,
  scope: 'national', ...over,
});

// --- C8: caller order is preserved -------------------------------------------

test('C8: directoryTable renders caller order when sortKey is null', () => {
  // Scores are anti-correlated with A-Z, so an internal re-sort is visible.
  const rows = [
    usState('a', 'Alabama', 'US-AL', { petroHrysScore: 10 }),
    usState('c', 'California', 'US-CA', { petroHrysScore: 90 }),
    usState('w', 'Wyoming', 'US-WY', { petroHrysScore: 50 }),
  ];
  const seq = (html) => [...html.matchAll(/data-bd-jurisdiction="([^"]+)"/g)].map((m) => m[1]);
  assert.deepStrictEqual(seq(c.directoryTable({ directories: rows, caption: 'x', sortKey: null })),
    ['Alabama', 'California', 'Wyoming'], 'caller order was not preserved');
  // Non-vacuity: the default key genuinely reorders, so the opt-out is doing work.
  assert.deepStrictEqual(seq(c.directoryTable({ directories: rows, caption: 'x' })),
    ['California', 'Wyoming', 'Alabama'], 'the default comparator no longer reorders');
});

test('C8: grouped rendering puts Federal first and states A-Z after it', () => {
  const set = [
    usState('w', 'Wyoming', 'US-WY', { petroHrysScore: 99 }),
    usFederal('fed', { petroHrysScore: 1 }),
    usState('a', 'Alabama', 'US-AL', { petroHrysScore: 98 }),
    verifiedRecord({
      id: 'h-dc', slug: 'h-dc', name: 'dc', officialName: 'dc', country: 'united-states',
      website: 'https://dc.example.gov/', scope: 'subnational',
      jurisdiction: { type: 'federal-district', name: 'District of Columbia', code: 'US-DC', parentCountry: 'united-states' },
    }),
    verifiedRecord({
      id: 'h-gu', slug: 'h-gu', name: 'gu', officialName: 'gu', country: 'united-states',
      website: 'https://gu.example.gov/', scope: 'subnational',
      jurisdiction: { type: 'territory', name: 'Guam', code: 'US-GU', parentCountry: 'united-states' },
    }),
  ];
  const groups = c.jurisdictionGroups(set, 'united-states');
  assert.deepStrictEqual(groups.map((g) => g.label),
    ['Federal', 'States', 'Federal district', 'Territories']);
  // Rendered, not just computed — this is what C8 was actually about.
  const html = groups.map((g) => c.directoryTable({
    directories: g.items, caption: g.label, sortKey: null,
  })).join('\n');
  const order = [...html.matchAll(/data-bd-label="Directory"><a[^>]*>([^<]+)</g)].map((m) => m[1]);
  assert.deepStrictEqual(order, ['fed', 'a', 'w', 'dc', 'gu'],
    'rendered order does not follow Federal → States A-Z → district → territories');
});

test('C8: a known sequence is available for future slicing', () => {
  const items = [usState('b', 'Beta', null), usState('a', 'Alpha', null)];
  const groups = c.jurisdictionGroups(items, 'united-states');
  const names = groups[0].items.map((r) => r.jurisdiction.name);
  assert.deepStrictEqual(names, ['Alpha', 'Beta']);
  assert.deepStrictEqual(names.slice(0, 1), ['Alpha'], 'slicing a group is not order-stable');
});

// --- C9: jurisdiction vocabulary ---------------------------------------------

test('C9: every declared country resolves its own grouping labels', () => {
  const expected = {
    'united-states': ['Federal', 'States', 'Federal district', 'Territories'],
    canada: ['Federal', 'Provinces', 'Territories'],
    australia: ['Federal', 'States', 'Territories'],
    germany: ['Federal', 'Länder'],
    spain: ['National', 'Autonomous communities'],
    italy: ['National', 'Regions'],
    japan: ['National', 'Prefectures'],
    china: ['National', 'Provinces', 'Autonomous regions', 'Municipalities'],
  };
  for (const [country, labels] of Object.entries(expected)) {
    const keys = [S.NATIONAL_KEY, ...S.allowedJurisdictionTypes(country)];
    assert.deepStrictEqual(keys.map((k) => S.jurisdictionLabel(country, k)), labels,
      `${country} resolves the wrong grouping vocabulary`);
  }
});

test('C9: no American vocabulary reaches a non-federal country', () => {
  for (const country of ['spain', 'italy', 'japan', 'france', 'united-kingdom', 'poland', 'czech-republic']) {
    const vocabulary = S.JURISDICTION_VOCABULARY[country];
    const words = Object.values(vocabulary).join(' ');
    assert.ok(!/Federal|State\b|States/.test(words),
      `${country} borrows American terminology: ${words}`);
  }
  // Non-vacuity: the countries that DO use it still do.
  assert.strictEqual(S.jurisdictionLabel('united-states', S.NATIONAL_KEY), 'Federal');
  assert.strictEqual(S.jurisdictionLabel('canada', S.NATIONAL_KEY), 'Federal');
});

test('C9: an undeclared country/type pair fails loudly', () => {
  assert.throws(() => S.jurisdictionLabel('spain', 'state'), /no label for jurisdiction type "state"/);
  assert.throws(() => S.jurisdictionLabel('atlantis', 'state'), /No jurisdiction vocabulary is declared/);
});

test('C9: a record whose type the country does not declare is rejected', () => {
  const rec = verifiedRecord({
    id: 'h-es', slug: 'h-es', country: 'spain', website: 'https://es.example.gov/',
    scope: 'subnational',
    jurisdiction: { type: 'prefecture', name: 'Osaka', code: null, parentCountry: 'spain' },
  });
  const r = okOf([rec]);
  assert.strictEqual(r.ok, false, 'a prefecture in Spain was accepted');
  assert.match(reasons(r), /declares no grouping label for "prefecture"/);
});

test('C9: grouping never silently drops a record it cannot place', () => {
  const rec = verifiedRecord({
    id: 'h-x', slug: 'h-x', country: 'spain', website: 'https://x.example.gov/',
    scope: 'subnational',
    jurisdiction: { type: 'prefecture', name: 'Osaka', code: null, parentCountry: 'spain' },
  });
  assert.throws(() => c.jurisdictionGroups([rec], 'spain'), /vocabulary does not declare/);
});

test('C9: counts are derived with correct singular and plural', () => {
  assert.strictEqual(c.registryCount(1), '1 registry');
  assert.strictEqual(c.registryCount(0), '0 registries');
  assert.strictEqual(c.registryCount(4), '4 registries');
  const groups = c.jurisdictionGroups([usFederal('f'), usState('s', 'Ohio', 'US-OH')], 'united-states');
  const html = c.jurisdictionFilter(groups, { idPrefix: 'united-states-jurisdiction' });
  assert.match(html, /1 registry/);
  assert.ok(!/>1 registries</.test(html), 'a singular group was pluralised');
});

// --- C10: deep orphan-key rejection ------------------------------------------

test('C10: an unknown key inside a structured object is rejected with its path', () => {
  const cases = [
    ['jurisdiction.typoCode', {
      scope: 'subnational',
      jurisdiction: { type: 'state', name: 'California', code: 'US-CA', parentCountry: 'united-states', typoCode: 'US-CA' },
    }],
    ['operator.agencyTyp', { operator: { name: 'X', type: 'regulator', officialUrl: null, agencyTyp: 'regulator' } }],
    ['publicAccess.requiresLogn', { publicAccess: { accessLevel: 'open', requiresLogn: true } }],
    ['verification.reviewer', {
      verification: {
        status: 'verified', source: 'official-website',
        reviewers: [{ id: 'p', name: 'P' }], reviewer: 'P',
      },
    }],
  ];
  for (const [expectedPath, patch] of cases) {
    const migrated = migrateRecord({ ...verifiedRecord(), ...patch });
    const paths = migrated[UNKNOWN_KEYS].map((p) => p.path);
    assert.ok(paths.includes(expectedPath),
      `${expectedPath} was not reported; got [${paths.join(', ')}]`);
    const r = okOf([migrated]);
    assert.strictEqual(r.ok, false, `${expectedPath} was accepted by the validator`);
    assert.ok(r.errors.some((e) => e.field === expectedPath),
      `the error does not name the full path ${expectedPath}`);
  }
});

test('C10: a wrongly typed container is rejected, not coerced away', () => {
  for (const [field, patch] of [
    ['registryTypes', { registryTypes: 'company-register' }],
    ['jurisdiction', { jurisdiction: 'California' }],
    ['operator', { operator: 'Some Agency' }],
    ['publicAccess', { publicAccess: true }],
  ]) {
    const migrated = migrateRecord({ ...verifiedRecord(), ...patch });
    const paths = migrated[UNKNOWN_KEYS].map((p) => p.path);
    assert.ok(paths.includes(field), `${field} type violation was swallowed`);
  }
});

test('C10: provenance sub-keys are checked too', () => {
  const migrated = migrateRecord({
    ...verifiedRecord(),
    metricsProvenance: { domainRating: { provider: 'Ahrefs', measuredAt: '2026-08-04', measuredDomian: 'x' } },
  });
  assert.ok(migrated[UNKNOWN_KEYS].map((p) => p.path).includes('metricsProvenance.domainRating.measuredDomian'));
});

test('C10: errors are deterministically ordered and the clean case is silent', () => {
  const messy = migrateRecord({
    ...verifiedRecord(),
    zzTop: 1,
    operator: { name: 'X', type: 'regulator', officialUrl: null, bbb: 1, aaa: 2 },
  });
  const paths = messy[UNKNOWN_KEYS].map((p) => p.path);
  assert.deepStrictEqual(paths, [...paths].sort(), 'problem order is not deterministic');
  assert.deepStrictEqual(migrateRecord(verifiedRecord())[UNKNOWN_KEYS], [],
    'a clean record reported a problem: the guard is vacuous');
});

test('C10: the shipped 72 records carry no nested orphan keys', () => {
  for (const rec of REGISTRY.directories) {
    assert.deepStrictEqual(rec[UNKNOWN_KEYS], [], `${rec.id} carries schema problems`);
  }
});

// --- registry type glossary ---------------------------------------------------

test('the glossary covers every enum value exactly once, with no extras', () => {
  const ids = T.REGISTRY_TYPE_DEFINITIONS.map((d) => d.id);
  assert.deepStrictEqual([...ids].sort(), [...S.REGISTRY_TYPES].sort(),
    'the glossary and the enum disagree');
  assert.strictEqual(new Set(ids).size, ids.length, 'the glossary repeats a type');
});

test('every definition carries label, definition, inclusion and boundary', () => {
  for (const d of T.REGISTRY_TYPE_DEFINITIONS) {
    // A label is a heading, so it only has to exist and be human. The three
    // prose fields are the ones that have to carry an argument, so they get a
    // length floor — a one-word "boundary" would defeat the point of the file.
    assert.ok(typeof d.label === 'string' && /^[A-Z]/.test(d.label) && d.label.length >= 5,
      `${d.id}.label is missing or not a display label`);
    for (const field of ['definition', 'inclusion', 'boundary']) {
      assert.ok(typeof d[field] === 'string' && d[field].trim().length > 40,
        `${d.id}.${field} is missing or too thin to settle a classification argument`);
    }
    assert.ok(Array.isArray(d.examples) && d.examples.length >= 1, `${d.id} has no example`);
  }
});

test('the five distinctions the brief requires are actually drawn', () => {
  const by = (id) => T.REGISTRY_TYPE_BY_ID.get(id);
  assert.match(by('company-register').boundary, /business-entity-register/);
  assert.match(by('business-entity-register').definition, /several kinds|more than one/i);
  assert.match(by('public-filing-database').definition, /rather than constituting/i);
  assert.match(by('corporate-number-database').boundary, /NOT automatically the legal register/);
  assert.match(by('cross-border-registry-interface').boundary, /NOT automatically the legal source of record/);
});

test('every registry type resolves a display label', () => {
  for (const id of S.REGISTRY_TYPES) {
    assert.ok(T.registryTypeLabel(id).length > 0, `${id} has no label`);
  }
  assert.throws(() => T.registryTypeLabel('not-a-type'), /Unknown registry type/);
});

// --- classification invariants -------------------------------------------------

test('classification rules fire, and each has a passing counterpart', () => {
  const base = { primaryRegistryType: 'company-register', registryTypes: ['company-register'] };
  // cross-border interface at national scope
  assert.strictEqual(okOf([verifiedRecord({
    primaryRegistryType: 'cross-border-registry-interface',
    registryTypes: ['cross-border-registry-interface'],
  })]).ok, false, 'a national cross-border interface was accepted');
  assert.strictEqual(okOf([verifiedRecord({
    country: 'european-union', website: 'https://eu.example.europa.eu/', scope: 'supranational',
    primaryRegistryType: 'cross-border-registry-interface',
    registryTypes: ['cross-border-registry-interface'],
  })]).ok, true, 'a supranational cross-border interface was rejected');

  // identifier database claiming to be the company register
  assert.strictEqual(okOf([verifiedRecord({
    ...base, registryTypes: ['company-register', 'corporate-number-database'], editorNotes: 'x',
  })]).ok, false, 'an unevidenced identifier/company pairing was accepted');
  assert.strictEqual(okOf([verifiedRecord({
    ...base, registryTypes: ['company-register', 'corporate-number-database'],
    editorNotes: 'The official page states this is the legal register of record.',
  })]).ok, true, 'an evidenced pairing was rejected');

  // verified government record with no classification
  assert.strictEqual(okOf([verifiedRecord({ category: 'government' })]).ok, false,
    'an unclassified verified government record was accepted');
});

// --- Registry information UI ---------------------------------------------------

test('the section renders nothing for a record with no registry facts', () => {
  assert.strictEqual(c.registryInformation(verifiedRecord()), '',
    'a plain directory grew a Registry information block');
  // Non-vacuity: scope alone must not trigger it, and something real must.
  assert.strictEqual(c.registryInformation(verifiedRecord({ scope: 'global' })), '');
  assert.ok(c.registryInformation(verifiedRecord({
    operator: { name: 'Companies House', type: 'government-agency', officialUrl: null },
  })).length > 0, 'a real operator did not render');
});

test('the section renders operator, types, jurisdiction, scope and access', () => {
  const html = c.registryInformation(verifiedRecord({
    scope: 'subnational',
    jurisdiction: { type: 'state', name: 'Ohio', code: 'US-OH', parentCountry: 'united-states' },
    operator: { name: 'Ohio Secretary of State', type: 'government-agency', officialUrl: 'https://ohio.example.gov/' },
    primaryRegistryType: 'business-entity-register',
    registryTypes: ['business-entity-register', 'company-register'],
    publicAccess: { searchUrl: 'https://search.example.gov/', accessLevel: 'open', freeToSearch: true, notes: 'Free to search.' },
  }));
  for (const expected of ['Operator', 'Ohio Secretary of State', 'Government agency',
    'Registry types', 'Business entity register', 'Company register',
    'Jurisdiction', 'Ohio', 'US-OH', 'Scope', 'Subnational',
    'Public access', 'Open', 'Official search']) {
    assert.ok(html.includes(expected), `"${expected}" is missing from the section`);
  }
  // The primary type leads.
  assert.ok(html.indexOf('Business entity register') < html.indexOf('Company register'),
    'the primary registry type is not shown first');
});

test('an unknown access level says so rather than being hidden or implied open', () => {
  const html = c.registryInformation(verifiedRecord({
    publicAccess: { searchUrl: 'https://s.example.gov/', accessLevel: 'unknown', freeToSearch: true },
  }));
  assert.match(html, /Not established/);
  assert.match(html, /not been established/);
  assert.ok(!/>Open</.test(html), 'a search URL implied open access');
});

test('an editorial translation is disclosed', () => {
  const html = c.registryInformation(verifiedRecord({
    nativeName: '国家企业信用信息公示系统',
    englishName: 'National Enterprise Credit Information Publicity System',
    englishNameSource: 'editorial-translation',
    operator: { name: 'SAMR', type: 'regulator', officialUrl: null },
  }));
  assert.match(html, /English title/);
  assert.match(html, /Editorial translation/);
  // An official English name gets no disclosure.
  const official = c.registryInformation(verifiedRecord({
    englishName: 'X Register', englishNameSource: 'official',
    operator: { name: 'Y', type: 'regulator', officialUrl: null },
  }));
  assert.ok(!/Editorial translation/.test(official));
});

test('CJK native names survive rendering and are escaped safely', () => {
  const zh = '国家企业信用信息公示系统';
  const html = c.registryInformation(verifiedRecord({
    name: 'X', officialName: 'X', nativeName: zh,
    operator: { name: 'SAMR', type: 'regulator', officialUrl: null },
  }));
  assert.ok(html.includes(zh), 'the native script was lost');
  const hostile = c.registryInformation(verifiedRecord({
    operator: { name: '"><script>alert(1)</script>', type: 'other', officialUrl: null },
  }));
  assert.ok(!/<script>/.test(hostile), 'operator name was not escaped');
  assert.ok(hostile.includes('&lt;script&gt;'), 'the payload was dropped rather than escaped');
});

test('a non-https operator or search URL is never linked', () => {
  const html = c.registryInformation(verifiedRecord({
    operator: { name: 'X', type: 'other', officialUrl: null },
    publicAccess: { searchUrl: null, accessLevel: 'restricted' },
  }));
  assert.ok(!/href="http:/.test(html));
  assert.ok(!/Official search/.test(html), 'a null search URL rendered a row');
});

// --- generated output ----------------------------------------------------------

test('the section appears on exactly the records that carry registry facts', () => {
  const expected = REGISTRY.directories.filter((r) => c.registryInformation(r) !== '');
  assert.ok(expected.length >= 18, `only ${expected.length} records carry registry facts`);
  for (const rec of expected) {
    const file = path.join(ROOT, 'research', 'business-directories', rec.country, rec.slug, 'index.html');
    if (!fs.existsSync(file)) continue;
    assert.match(fs.readFileSync(file, 'utf8'), /id="registry-information"/,
      `${rec.id} carries registry facts but its page has no section`);
  }
  // And nowhere else.
  const without = REGISTRY.directories.filter((r) => c.registryInformation(r) === '');
  assert.ok(without.length > 0, 'every record has registry facts: the guard is vacuous');
  for (const rec of without.slice(0, 10)) {
    const file = path.join(ROOT, 'research', 'business-directories', rec.country, rec.slug, 'index.html');
    if (!fs.existsSync(file)) continue;
    assert.ok(!/id="registry-information"/.test(fs.readFileSync(file, 'utf8')),
      `${rec.id} has no registry facts but its page rendered the section`);
  }
});

test('grouped tables stay readable with no JavaScript', () => {
  // Every row carries its column labels for the stacked mobile view, and the
  // tables are fully server-rendered — nothing is injected at runtime.
  const html = c.directoryTable({
    directories: [usState('a', 'Alabama', 'US-AL')], caption: 'States', sortKey: null,
  });
  assert.match(html, /<caption class="bd-caption">States<\/caption>/);
  assert.match(html, /data-bd-label="Directory"/);
  assert.match(html, /<tbody data-bd-rows>/);
  assert.ok(!/<script/.test(html), 'the table depends on inline script');
});

// --- C11: geographic code validation -------------------------------------------

test('C11: iso2 must be exactly two uppercase ASCII letters', () => {
  const withCountry = (patch) => validateRegistry({
    ...REGISTRY,
    countries: REGISTRY.countries.map((x) => (x.slug === 'united-states' ? { ...x, ...patch } : x)),
    directories: [],
  });
  for (const bad of ['', 'usa', 'Us', 'U', ' US', 'US ', 'U5', '12', null, undefined, 7]) {
    const r = withCountry({ iso2: bad });
    assert.strictEqual(r.ok, false, `iso2 ${JSON.stringify(bad)} was accepted`);
    assert.ok(r.errors.some((e) => e.field === 'iso2'), `iso2 ${JSON.stringify(bad)} failed elsewhere`);
  }
  assert.strictEqual(withCountry({ iso2: 'US' }).ok, true, 'a valid code was rejected');
});

test('C11: a supranational entry must have null iso2 and supranational scope', () => {
  const withEu = (patch) => validateRegistry({
    ...REGISTRY,
    countries: REGISTRY.countries.map((x) => (x.slug === 'european-union' ? { ...x, ...patch } : x)),
    directories: [],
  });
  assert.strictEqual(withEu({ iso2: 'EU' }).ok, false, 'a supranational entry claimed a country code');
  assert.strictEqual(withEu({ scope: 'national' }).ok, false, 'a supranational entry claimed national scope');
  assert.strictEqual(withEu({}).ok, true, 'the shipped EU entry is invalid');
});

test('C11: country codes are unique across the geographic registry', () => {
  const r = validateRegistry({
    ...REGISTRY,
    countries: REGISTRY.countries.map((x) => (x.slug === 'canada' ? { ...x, iso2: 'US' } : x)),
    directories: [],
  });
  assert.strictEqual(r.ok, false, 'two countries shared one ISO code');
  assert.match(r.errors.map((e) => e.reason).join(' '), /already used by/);
});

test('C11: jurisdiction.code shape is checked with an actionable reason', () => {
  const bad = {
    CA: /has no "-" separator/,
    'us-ca': /must be uppercase/,
    'USA-CA': /country part "USA" is not two uppercase letters/,
    DE_US: /uses "_" instead of "-"/,
    'JP-': /empty subdivision part/,
    '': /is empty; use null/,
    ' US-CA': /leading or trailing whitespace/,
    'US-CALIF': /must be 1-3 uppercase letters or digits/,
    'US-CA-X': /more than one "-" separator/,
  };
  for (const [code, matcher] of Object.entries(bad)) {
    const problem = S.iso3166_2Problem(code);
    assert.ok(problem, `${JSON.stringify(code)} was accepted`);
    assert.match(problem, matcher, `${JSON.stringify(code)} gave the wrong reason: ${problem}`);
  }
  for (const good of ['US-CA', 'CA-ON', 'DE-BY', 'ES-CT', 'JP-13']) {
    assert.strictEqual(S.iso3166_2Problem(good), null, `${good} was rejected`);
  }
});

test('C11: an unusable parent code disables nothing silently', () => {
  const r = validateRegistry({
    ...REGISTRY,
    countries: REGISTRY.countries.map((x) => (x.slug === 'united-states' ? { ...x, iso2: '' } : x)),
    directories: [verifiedRecord({
      id: 'h-p', slug: 'h-p', country: 'united-states', website: 'https://p.example.gov/',
      scope: 'subnational',
      jurisdiction: { type: 'state', name: 'Anywhere', code: 'ZZ-99', parentCountry: 'united-states' },
    })],
  });
  assert.strictEqual(r.ok, false, 'a bogus code passed because the parent code was unusable');
  assert.match(r.errors.map((e) => e.reason).join(' '), /Cannot check the prefix/);
});

// --- C12: access semantics -----------------------------------------------------

const access = (over) => ({
  searchUrl: null, accessLevel: 'open', freeToSearch: null, loginRequired: null,
  identityVerificationRequired: null, captcha: null, geographicRestriction: null,
  paidDocumentsAvailable: null, notes: null, ...over,
});

test('C12: every access level carries a published definition', () => {
  for (const level of S.ACCESS_LEVELS) {
    assert.ok(S.ACCESS_LEVEL_DEFINITIONS[level] && S.ACCESS_LEVEL_DEFINITIONS[level].length > 30,
      `${level} has no usable definition`);
    assert.ok(S.ACCESS_LEVEL_LABELS[level], `${level} has no display label`);
  }
  assert.match(S.ACCESS_LEVEL_DEFINITIONS['partially-open'], /fuller documents|extended data/);
});

test('C12: contradictory combinations are rejected', () => {
  const reject = [
    ['open + login', { loginRequired: true }],
    ['open + identity', { identityVerificationRequired: true }],
    ['open + geo without a note', { geographicRestriction: true }],
    ['login-required + loginRequired false', { accessLevel: 'login-required', loginRequired: false }],
    ['identity level + flag false', { accessLevel: 'identity-verification-required', identityVerificationRequired: false }],
    ['restricted + everything false, no note', {
      accessLevel: 'restricted', loginRequired: false, identityVerificationRequired: false,
      captcha: false, geographicRestriction: false, paidDocumentsAvailable: false,
    }],
    ['partially-open with nothing limited', { accessLevel: 'partially-open', freeToSearch: true }],
  ];
  for (const [label, over] of reject) {
    assert.ok(S.accessContradictions(access(over)).length > 0, `${label} was accepted`);
  }
});

test('C12: legitimate combinations are allowed', () => {
  const allow = [
    ['partially-open + free + paid documents', { accessLevel: 'partially-open', freeToSearch: true, paidDocumentsAvailable: true }],
    ['partially-open + login', { accessLevel: 'partially-open', loginRequired: true }],
    ['partially-open + explanatory note', { accessLevel: 'partially-open', notes: 'Bulk extracts are sold separately.' }],
    ['open + captcha', { captcha: true }],
    ['open + geo WITH a note', { geographicRestriction: true, notes: 'Coverage is national; not an access barrier.' }],
    ['unknown + everything null', { accessLevel: 'unknown' }],
    ['unknown + freeToSearch true', { accessLevel: 'unknown', freeToSearch: true }],
  ];
  for (const [label, over] of allow) {
    assert.deepStrictEqual(S.accessContradictions(access(over)), [], `${label} was rejected`);
  }
});

// --- C13: jurisdiction identity ------------------------------------------------

const jrec = (id, j, country = 'united-states') => verifiedRecord({
  id, slug: id, country, website: `https://${id}.example.gov/`, scope: 'subnational', jurisdiction: j,
});
const J2 = (type, name, code, parentCountry = 'united-states') => ({ type, name, code, parentCountry });

test('C13: two registries in one jurisdiction are valid', () => {
  const r = okOf([
    jrec('h-ca1', J2('state', 'California', 'US-CA')),
    jrec('h-ca2', J2('state', 'California', 'US-CA')),
  ]);
  assert.strictEqual(r.ok, true, `two California registries were rejected: ${reasons(r)}`);
});

test('C13: one code cannot name two places', () => {
  const r = okOf([
    jrec('h-a', J2('state', 'California', 'US-CA')),
    jrec('h-b', J2('state', 'Kalifornia', 'US-CA')),
  ]);
  assert.strictEqual(r.ok, false);
  assert.match(reasons(r), /cannot have two names/);
});

test('C13: one place cannot have two codes', () => {
  const r = okOf([
    jrec('h-a', J2('state', 'California', 'US-CA')),
    jrec('h-b', J2('state', 'California', 'US-CAL')),
  ]);
  assert.strictEqual(r.ok, false);
  assert.match(reasons(r), /cannot have two codes/);
});

test('C13: a code cannot be used under the wrong parent country', () => {
  const r = okOf([jrec('h-on', J2('province', 'Ontario', 'US-ON', 'canada'), 'canada')]);
  assert.strictEqual(r.ok, false);
  assert.match(reasons(r), /has prefix "US" but Canada is "CA"/);
});

test('C13: null-code jurisdictions deduplicate by normalised name', () => {
  // Same place, written with different case and spacing: one identity, valid.
  const same = okOf([
    jrec('h-a', J2('state', 'District of Columbia', null)),
    jrec('h-b', J2('state', 'district of  columbia', null)),
  ]);
  assert.strictEqual(same.ok, true, `normalisation did not merge the two spellings: ${reasons(same)}`);
  assert.strictEqual(
    S.jurisdictionIdentity(J2('state', 'District of Columbia', null)).key,
    S.jurisdictionIdentity(J2('state', 'district of  columbia', null)).key,
    'identity keys differ for the same place',
  );
  // Genuinely different places still separate.
  assert.notStrictEqual(
    S.jurisdictionIdentity(J2('state', 'Alabama', null)).key,
    S.jurisdictionIdentity(J2('state', 'Alaska', null)).key,
  );
  // Adding a code to one of them is then a conflict, not a second place.
  const conflict = okOf([
    jrec('h-a', J2('state', 'District of Columbia', null)),
    jrec('h-b', J2('state', 'District of Columbia', 'US-DC')),
  ]);
  assert.strictEqual(conflict.ok, false, 'one place carried both a code and no code silently');
});

test('C13: identity is keyed on the place, not the record', () => {
  const a = S.jurisdictionIdentity(J2('state', 'California', 'US-CA'));
  const b = S.jurisdictionIdentity(J2('state', 'California', 'US-CA'));
  assert.strictEqual(a.key, b.key, 'two records in one place produced different identities');
  assert.strictEqual(a.by, 'code');
  assert.strictEqual(S.jurisdictionIdentity(J2('state', 'X', null)).by, 'name');
  // Type is part of identity: a state and a territory of the same name differ.
  assert.notStrictEqual(
    S.jurisdictionIdentity(J2('state', 'Guam', null)).key,
    S.jurisdictionIdentity(J2('territory', 'Guam', null)).key,
  );
});

// --- Part 6: validation runs before normalisation can hide anything ------------

test('raw problems are captured before the migration normalises them away', () => {
  const raw = {
    ...verifiedRecord(),
    jurisdiction: { type: 'state', name: 'California', code: 'US-CA', parentCountry: 'united-states', typoCode: 'X' },
    registryTypes: 'company-register',
  };
  const migrated = migrateRecord(raw);
  // The normalisation HAS cleaned both — that is precisely why the problems
  // must be captured on the way through rather than inspected afterwards.
  assert.ok(!('typoCode' in migrated.jurisdiction), 'the nested typo survived normalisation');
  assert.deepStrictEqual(migrated.registryTypes, [], 'the bad container survived normalisation');
  const paths = migrated[UNKNOWN_KEYS].map((p) => p.path);
  assert.ok(paths.includes('jurisdiction.typoCode'), 'the nested typo was lost');
  assert.ok(paths.includes('registryTypes'), 'the container type violation was lost');
  assert.strictEqual(okOf([migrated]).ok, false, 'the validator did not see the captured problems');
});

test('validator errors are deterministically ordered across runs', () => {
  const messy = migrateRecord({
    ...verifiedRecord(), zzz: 1, aaa: 2,
    operator: { name: 'X', type: 'nope', officialUrl: 'http://x/', zz: 1, aa: 2 },
  });
  const once = okOf([messy]).errors.map((e) => `${e.field}|${e.reason}`);
  const twice = okOf([messy]).errors.map((e) => `${e.field}|${e.reason}`);
  assert.deepStrictEqual(once, twice, 'two runs reported errors in different orders');
  assert.ok(once.length >= 4, 'too few errors to prove ordering');
});
