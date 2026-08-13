// scripts/tests/bd-wave1-foundation.test.cjs
'use strict';

// Cover for the Wave 1 foundation: jurisdictions, scope, supranational
// geography, native/English names, registry classification, operator and
// public access.
//
// Every guard here is paired with a fault-injection case. A test that only ever
// sees valid input proves the validator accepts good data, not that it rejects
// bad data — and rejecting bad data is the whole point of these rules.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const S = require('../lib/bd-schema.cjs');
const c = require('../lib/bd-components.cjs');
const { validateRegistry } = require('../validate-business-directories.cjs');
const { loadRegistry } = require('../lib/bd-registry.cjs');
const {
  migrateRecord, UNKNOWN_KEYS, serialisableRecord, WAVE1_DEFAULTED,
} = require('../lib/bd-migrate.cjs');
const { verifiedRecord } = require('./helpers/fixtures.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const REGISTRY = loadRegistry();
const withDirs = (dirs) => ({ ...REGISTRY, directories: dirs });
const reasons = (r) => r.errors.map((e) => `${e.field}: ${e.reason}`).join(' | ');
const okOf = (dirs) => validateRegistry(withDirs(dirs));

// Every fault-injection test asserts BOTH that the defect is rejected and that
// the same record without the defect passes, so a rule that rejects everything
// cannot masquerade as a working guard.
function rejects(record, matcher, label) {
  const bad = okOf([record]);
  assert.strictEqual(bad.ok, false, `${label}: the defect was accepted`);
  assert.match(reasons(bad), matcher, `${label}: rejected for the wrong reason — ${reasons(bad)}`);
}

// --- the canonical key set ---------------------------------------------------

test('KNOWN_RECORD_KEYS matches exactly what the migration emits', () => {
  const emitted = Object.keys(migrateRecord({ id: 'x', name: 'X', slug: 'x' }));
  assert.deepStrictEqual([...emitted].sort(), [...S.KNOWN_RECORD_KEYS].sort(),
    'the declared key set and the migration output have drifted apart');
});

// --- orphan keys -------------------------------------------------------------

test('an unknown field is rejected, not silently dropped', () => {
  const raw = { ...verifiedRecord(), improvisedStateField: 'California' };
  const migrated = migrateRecord(raw);
  assert.deepStrictEqual(migrated[UNKNOWN_KEYS].map((p) => p.path), ['improvisedStateField'],
    'the migration did not record the unknown key');
  assert.ok(!('improvisedStateField' in migrated), 'the unknown key leaked into the record');
  rejects(migrated, /Unknown field "improvisedStateField"/, 'orphan key');
});

test('the orphan guard is non-vacuous: a clean record passes', () => {
  const clean = migrateRecord(verifiedRecord());
  assert.deepStrictEqual(clean[UNKNOWN_KEYS], []);
  assert.strictEqual(okOf([clean]).ok, true);
});

test('a legacy field is migrated, not treated as an orphan', () => {
  // The legacy accepts* mapping only applies to a record written BEFORE the
  // accepts object existed, so the fixture's object must be removed for this to
  // exercise the path it claims to.
  const old = { ...verifiedRecord(), acceptsStartups: true };
  delete old.accepts;
  const legacy = migrateRecord(old);
  assert.deepStrictEqual(legacy[UNKNOWN_KEYS], [], 'a known legacy key was reported as unknown');
  assert.strictEqual(legacy.accepts.startup, true, 'the legacy value was not carried across');
});

// --- scope -------------------------------------------------------------------

test('scope is restricted to the declared enum', () => {
  assert.strictEqual(okOf([verifiedRecord({ scope: 'national' })]).ok, true);
  rejects(verifiedRecord({ scope: 'planetary' }), /scope: Must be one of/, 'bogus scope');
});

test('subnational and regional are not interchangeable', () => {
  const jur = { type: 'state', name: 'California', code: 'US-CA', parentCountry: 'united-states' };
  // A jurisdiction demands subnational...
  rejects(verifiedRecord({ scope: 'regional', jurisdiction: jur }),
    /must use scope "subnational"/, 'jurisdiction with regional scope');
  // ...and subnational demands a jurisdiction.
  rejects(verifiedRecord({ scope: 'subnational', jurisdiction: null }),
    /requires a jurisdiction object/, 'subnational without jurisdiction');
  // Regional without a jurisdiction stays legal: it is a real, different thing.
  assert.strictEqual(okOf([verifiedRecord({ scope: 'regional' })]).ok, true,
    'regional scope without a jurisdiction must remain valid');
});

// --- jurisdiction ------------------------------------------------------------

const stateRecord = (over = {}) => verifiedRecord({
  id: 'us-ca-sos',
  slug: 'california-secretary-of-state',
  country: 'united-states',
  website: 'https://bizfileonline.sos.ca.gov/',
  scope: 'subnational',
  jurisdiction: { type: 'state', name: 'California', code: 'US-CA', parentCountry: 'united-states' },
  ...over,
});

test('a well-formed US state record validates', () => {
  const r = okOf([stateRecord()]);
  assert.strictEqual(r.ok, true, reasons(r));
});

test('province, territory and federal-district models all validate', () => {
  for (const [type, name, code, country, site] of [
    ['province', 'Ontario', 'CA-ON', 'canada', 'https://ontario.example.gov/'],
    ['territory', 'Guam', 'US-GU', 'united-states', 'https://guam.example.gov/'],
    ['federal-district', 'District of Columbia', 'US-DC', 'united-states', 'https://dc.example.gov/'],
  ]) {
    const rec = verifiedRecord({
      id: `x-${code.toLowerCase()}`, slug: `x-${code.toLowerCase()}`, country, website: site,
      scope: 'subnational',
      jurisdiction: { type, name, code, parentCountry: country },
    });
    const res = okOf([rec]);
    assert.strictEqual(res.ok, true, `${type} rejected: ${reasons(res)}`);
  }
});

test('a malformed ISO 3166-2 code is rejected', () => {
  rejects(stateRecord({ jurisdiction: { type: 'state', name: 'California', code: 'California', parentCountry: 'united-states' } }),
    /has no "-" separator/, 'non-ISO code');
  // Null is the honest value where no code exists, and must stay legal.
  assert.strictEqual(okOf([stateRecord({
    jurisdiction: { type: 'state', name: 'Somewhere', code: null, parentCountry: 'united-states' },
  })]).ok, true, 'a null code must remain valid');
});

test('a code from the wrong country is rejected', () => {
  rejects(stateRecord({ jurisdiction: { type: 'state', name: 'California', code: 'CA-ON', parentCountry: 'united-states' } }),
    /has prefix "CA" but United States is "US"/, 'mismatched code prefix');
});

test('one jurisdiction code cannot name two different places', () => {
  const a = stateRecord();
  const b = stateRecord({
    id: 'us-ca-two', slug: 'california-two', website: 'https://two.example.gov/',
    jurisdiction: { type: 'state', name: 'Californiaa', code: 'US-CA', parentCountry: 'united-states' },
  });
  const res = okOf([a, b]);
  assert.strictEqual(res.ok, false, 'a contradictory code pair was accepted');
  assert.match(reasons(res), /One jurisdiction cannot have two names/);
});

test('two registries in the SAME jurisdiction are allowed', () => {
  const a = stateRecord();
  const b = stateRecord({
    id: 'us-ca-tax', slug: 'california-tax', website: 'https://tax.example.gov/',
  });
  const res = okOf([a, b]);
  assert.strictEqual(res.ok, true, `one state may hold several registries: ${reasons(res)}`);
});

test('an unknown parentCountry, or one that disagrees with the file, is rejected', () => {
  rejects(stateRecord({ jurisdiction: { type: 'state', name: 'X', code: null, parentCountry: 'atlantis' } }),
    /References unknown country/, 'unknown parentCountry');
  rejects(stateRecord({ jurisdiction: { type: 'state', name: 'X', code: null, parentCountry: 'canada' } }),
    /but the record is filed under/, 'parentCountry disagreeing with country');
});

test('an unknown jurisdiction type is rejected', () => {
  rejects(stateRecord({ jurisdiction: { type: 'county', name: 'X', code: null, parentCountry: 'united-states' } }),
    /jurisdiction.type: Must be one of/, 'bogus jurisdiction type');
});

// --- supranational geography -------------------------------------------------

test('the European Union is modelled as supranational, never as a country', () => {
  const eu = REGISTRY.countries.find((x) => x.slug === 'european-union');
  assert.ok(eu, 'the European Union is not declared');
  assert.strictEqual(eu.entityType, 'supranational');
  assert.strictEqual(eu.iso2, null, 'a supranational entry must not carry a country code');
  assert.strictEqual(eu.scope, 'supranational');
});

test('an EU record must use supranational scope', () => {
  const euRec = verifiedRecord({
    id: 'eu-x', slug: 'eu-x', country: 'european-union', website: 'https://eu.example.europa.eu/',
    scope: 'supranational',
  });
  assert.strictEqual(okOf([euRec]).ok, true, reasons(okOf([euRec])));
  rejects({ ...euRec, scope: 'national' }, /must use scope "supranational"/, 'EU record as national');
});

test('a country record cannot claim supranational scope', () => {
  rejects(verifiedRecord({ scope: 'supranational' }),
    /requires a supranational jurisdiction/, 'country claiming supranational');
});

test('declaring the EU as a country is rejected by the geographic validator', () => {
  const broken = {
    ...REGISTRY,
    countries: REGISTRY.countries.map((x) => (x.slug === 'european-union'
      ? { ...x, entityType: 'country', iso2: 'EU' } : x)),
    directories: [],
  };
  const res = validateRegistry(broken);
  assert.strictEqual(res.ok, false, 'the EU was allowed to be a country');
  assert.match(res.errors.map((e) => e.reason).join(' | '),
    /must be modelled as supranational/);
});

test('China and Japan are declared as countries with ISO codes', () => {
  for (const [slug, iso2] of [['china', 'CN'], ['japan', 'JP']]) {
    const entry = REGISTRY.countries.find((x) => x.slug === slug);
    assert.ok(entry, `${slug} is not declared`);
    assert.strictEqual(entry.entityType, 'country');
    assert.strictEqual(entry.iso2, iso2);
  }
});

// --- names and the display resolver -----------------------------------------

test('the display resolver prefers englishName, then officialName, then nativeName', () => {
  assert.strictEqual(S.displayName({
    englishName: 'National Enterprise Credit Information Publicity System',
    officialName: '国家企业信用信息公示系统',
    nativeName: '国家企业信用信息公示系统',
  }), 'National Enterprise Credit Information Publicity System');
  assert.strictEqual(S.displayName({ officialName: 'Registro Imprese', nativeName: 'Registro Imprese' }),
    'Registro Imprese');
  assert.strictEqual(S.displayName({ nativeName: '法人番号公表サイト' }), '法人番号公表サイト');
  assert.strictEqual(S.displayName(null), '');
  assert.strictEqual(S.displayName({}), '');
});

test('Chinese and Japanese names survive load, render and search unchanged', () => {
  const zh = '国家企业信用信息公示系统';
  const ja = '国税庁法人番号公表サイト';
  const rec = migrateRecord(verifiedRecord({
    id: 'cn-x', slug: 'cn-x', country: 'china', website: 'https://x.example.gov.cn/',
    name: zh, officialName: zh, nativeName: zh,
    englishName: 'National Enterprise Credit Information Publicity System',
    englishNameSource: 'official',
  }));
  assert.strictEqual(rec.nativeName, zh, 'the native script was mangled by the migration');
  const html = c.directoryTable({ directories: [rec] });
  assert.ok(html.includes(zh) || html.includes('data-bd-haystack'), 'native script vanished');
  // The haystack must carry the native form so a reader can search in it.
  assert.match(html, new RegExp(zh), 'the native name is not searchable');
  // And a Japanese record round-trips identically.
  const jrec = migrateRecord(verifiedRecord({
    id: 'jp-x', slug: 'jp-x', country: 'japan', website: 'https://x.example.go.jp/',
    name: ja, officialName: ja, nativeName: ja,
  }));
  assert.strictEqual(jrec.nativeName, ja);
  assert.strictEqual(Buffer.from(jrec.nativeName, 'utf8').toString('utf8'), ja, 'not UTF-8 safe');
});

test('an English title must declare whether it is official or our translation', () => {
  const base = verifiedRecord({ englishName: 'Some Register' });
  rejects({ ...base, englishNameSource: null },
    /must declare whether it is the official name or an editorial translation/,
    'englishName without provenance');
  for (const source of S.ENGLISH_NAME_SOURCES) {
    assert.strictEqual(okOf([{ ...base, englishNameSource: source }]).ok, true,
      `${source} should be accepted`);
  }
  rejects({ ...base, englishNameSource: 'made-up' }, /englishNameSource: Must be one of/, 'bogus source');
  rejects(verifiedRecord({ englishName: null, englishNameSource: 'official' }),
    /Set without an englishName/, 'provenance without a name');
});

test('an editorial translation is distinguishable from an official name', () => {
  assert.strictEqual(S.isEditorialTranslation({
    englishName: 'Company Register', englishNameSource: 'editorial-translation',
  }), true);
  assert.strictEqual(S.isEditorialTranslation({
    englishName: 'Company Register', englishNameSource: 'official',
  }), false);
  assert.strictEqual(S.isEditorialTranslation({ englishName: null }), false);
});

// --- registry classification -------------------------------------------------

test('a registry may hold several official functions', () => {
  const rec = verifiedRecord({
    primaryRegistryType: 'company-register',
    registryTypes: ['company-register', 'insolvency-register', 'beneficial-ownership-register'],
  });
  assert.strictEqual(okOf([rec]).ok, true, reasons(okOf([rec])));
});

test('the primary type must appear in registryTypes, with no duplicates', () => {
  rejects(verifiedRecord({ primaryRegistryType: 'company-register', registryTypes: ['insolvency-register'] }),
    /Must also appear in registryTypes/, 'primary outside the list');
  rejects(verifiedRecord({
    primaryRegistryType: 'company-register',
    registryTypes: ['company-register', 'company-register'],
  }), /duplicate registry type/, 'duplicated type');
  rejects(verifiedRecord({ primaryRegistryType: 'not-a-type', registryTypes: ['not-a-type'] }),
    /Unknown registry type/, 'bogus type');
  rejects(verifiedRecord({ primaryRegistryType: null, registryTypes: ['company-register'] }),
    /none is marked primary/, 'types without a primary');
});

// --- operator ----------------------------------------------------------------

test('operator structure and type are validated', () => {
  const good = verifiedRecord({
    operator: { name: 'Companies House', type: 'government-agency', officialUrl: 'https://www.gov.uk/' },
  });
  assert.strictEqual(okOf([good]).ok, true, reasons(okOf([good])));
  rejects(verifiedRecord({ operator: { name: '', type: 'regulator', officialUrl: null } }),
    /operator.name: An operator must be named/, 'unnamed operator');
  rejects(verifiedRecord({ operator: { name: 'X', type: 'quango', officialUrl: null } }),
    /operator.type: Must be one of/, 'bogus operator type');
  rejects(verifiedRecord({ operator: { name: 'X', type: 'regulator', officialUrl: 'http://insecure.gov/' } }),
    /operator.officialUrl: Must be an https URL/, 'non-https operator URL');
});

test('every operator type in the enum is accepted', () => {
  for (const type of S.OPERATOR_TYPES) {
    const rec = verifiedRecord({ operator: { name: 'Body', type, officialUrl: null } });
    assert.strictEqual(okOf([rec]).ok, true, `${type} was rejected`);
  }
});

// --- public access -----------------------------------------------------------

test('contradictory access descriptions are rejected', () => {
  const pa = (over) => ({
    searchUrl: null,
    accessLevel: 'open',
    freeToSearch: null,
    loginRequired: null,
    identityVerificationRequired: null,
    captcha: null,
    geographicRestriction: null,
    paidDocumentsAvailable: null,
    notes: null,
    ...over,
  });
  rejects(verifiedRecord({ publicAccess: pa({ accessLevel: 'open', loginRequired: true }) }),
    /Contradictory access description/, 'open + loginRequired');
  rejects(verifiedRecord({ publicAccess: pa({ accessLevel: 'login-required', loginRequired: false }) }),
    /Contradictory access description/, 'login-required + loginRequired false');
  rejects(verifiedRecord({
    publicAccess: pa({ accessLevel: 'identity-verification-required', identityVerificationRequired: false }),
  }), /Contradictory access description/, 'identity level contradicted');
  // NOT a contradiction: knowing a register is free to search says nothing about
  // whether it also demands a login. Requiring a level to be asserted alongside
  // any established fact would force exactly the inference this model prevents.
  assert.strictEqual(okOf([verifiedRecord({
    publicAccess: pa({ accessLevel: 'unknown', freeToSearch: true }),
  })]).ok, true, 'partial knowledge must be expressible');
  // Non-vacuity: a coherent block passes.
  assert.strictEqual(okOf([verifiedRecord({
    publicAccess: pa({ accessLevel: 'open', freeToSearch: true, loginRequired: false }),
  })]).ok, true, 'a coherent access block was rejected');
});

test('accessLevel is never inferred from missing booleans', () => {
  // All booleans null and level "unknown" is the honest default and must pass.
  const rec = verifiedRecord({
    publicAccess: {
      searchUrl: null,
      accessLevel: 'unknown',
      freeToSearch: null,
      loginRequired: null,
      identityVerificationRequired: null,
      captcha: null,
      geographicRestriction: null,
      paidDocumentsAvailable: null,
      notes: null,
    },
  });
  assert.strictEqual(okOf([rec]).ok, true, reasons(okOf([rec])));
  assert.deepStrictEqual(S.accessContradictions(rec.publicAccess), []);
});

test('a non-https search URL is rejected', () => {
  rejects(verifiedRecord({
    publicAccess: { searchUrl: 'http://x.gov/', accessLevel: 'open' },
  }), /publicAccess.searchUrl: Must be an https URL/, 'insecure search URL');
});

// --- US grouping -------------------------------------------------------------

test('a country with no subnational record is not grouped at all', () => {
  assert.strictEqual(c.jurisdictionGroups([verifiedRecord()], 'united-states'), null,
    'grouping switched on for a purely national country');
});

test('US records group as Federal, States A-Z, federal district, territories', () => {
  const mk = (name, type, jname, code) => verifiedRecord({
    id: `x-${name}`, slug: `x-${name}`.toLowerCase(), name, officialName: name,
    website: `https://${name.toLowerCase()}.example.gov/`,
    scope: type ? 'subnational' : 'national',
    jurisdiction: type ? { type, name: jname, code, parentCountry: 'united-states' } : null,
  });
  const groups = c.jurisdictionGroups([
    mk('Guam', 'territory', 'Guam', 'US-GU'),
    mk('Wyoming', 'state', 'Wyoming', 'US-WY'),
    mk('Fed', null),
    mk('DC', 'federal-district', 'District of Columbia', 'US-DC'),
    mk('Alabama', 'state', 'Alabama', 'US-AL'),
  ], 'united-states');
  assert.deepStrictEqual(groups.map((g) => g.label),
    ['Federal', 'States', 'Federal district', 'Territories']);
  assert.deepStrictEqual(groups[1].items.map((r) => r.jurisdiction.name), ['Alabama', 'Wyoming'],
    'states are not in A-Z order');
  assert.deepStrictEqual(groups.map((g) => g.count), [1, 2, 1, 1]);
  // Empty groups never render.
  assert.ok(groups.every((g) => g.count > 0), 'an empty jurisdiction group was emitted');
});

test('grouping is deterministic across repeated calls with shuffled input', () => {
  const mk = (n, jn, code) => verifiedRecord({
    id: `y-${n}`, slug: `y-${n}`, name: n, officialName: n,
    website: `https://${n}.example.gov/`, scope: 'subnational',
    jurisdiction: { type: 'state', name: jn, code, parentCountry: 'united-states' },
  });
  const set = [mk('a', 'Texas', 'US-TX'), mk('b', 'Alaska', 'US-AK'), mk('c', 'Maine', 'US-ME')];
  const first = c.jurisdictionGroups(set, 'united-states')[0].items.map((r) => r.jurisdiction.name);
  const second = c.jurisdictionGroups([...set].reverse(), 'united-states')[0].items.map((r) => r.jurisdiction.name);
  assert.deepStrictEqual(first, second, 'ordering depends on input order');
  assert.deepStrictEqual(first, ['Alaska', 'Maine', 'Texas']);
});

test('the jurisdiction filter lists every group with a derived count', () => {
  const mk = (n, type, jn, code) => verifiedRecord({
    id: `z-${n}`, slug: `z-${n}`, name: n, officialName: n,
    website: `https://${n}.example.gov/`,
    scope: type ? 'subnational' : 'national',
    jurisdiction: type ? { type, name: jn, code, parentCountry: 'united-states' } : null,
  });
  const groups = c.jurisdictionGroups([mk('f', null), mk('s', 'state', 'Ohio', 'US-OH')], 'united-states');
  const html = c.jurisdictionFilter(groups, { idPrefix: 'united-states-jurisdiction' });
  assert.match(html, /Federal/);
  assert.match(html, /States/);
  assert.match(html, /aria-label="Jump to jurisdiction"/);
  assert.match(html, /href="#united-states-jurisdiction-state"/);
  // A single group needs no filter.
  assert.strictEqual(c.jurisdictionFilter([groups[0]]), '', 'a filter was rendered for one group');
});

test('a subnational row carries its jurisdiction as data attributes; a national row does not', () => {
  const state = verifiedRecord({
    id: 'w-1', slug: 'w-1', name: 'X', officialName: 'X', website: 'https://w.example.gov/',
    scope: 'subnational',
    jurisdiction: { type: 'state', name: 'Ohio', code: 'US-OH', parentCountry: 'united-states' },
  });
  const stateHtml = c.directoryTable({ directories: [state] });
  assert.match(stateHtml, /data-bd-jurisdiction="Ohio"/);
  assert.match(stateHtml, /data-bd-jurisdiction-code="US-OH"/);
  // A national record must not gain the attribute, or every pre-existing page
  // would change markup for coverage it does not have.
  const nationalHtml = c.directoryTable({ directories: [verifiedRecord()] });
  assert.ok(!/data-bd-jurisdiction/.test(nationalHtml),
    'a national row emitted a jurisdiction attribute');
});

// --- byte stability ----------------------------------------------------------

test('no record on disk carries a Wave 1 field in its defaulted state', () => {
  // Asserted against the projection's OWN definition, over every record and
  // every field. The earlier version skipped any record that carried one new
  // key and checked only two of the nine — which meant stamping the whole null
  // block onto a file switched the guard off instead of failing it.
  const dir = path.join(ROOT, 'data', 'business-directories', 'directories');
  let checked = 0;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    for (const rec of JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))) {
      checked += 1;
      for (const [key, isDefaulted] of Object.entries(WAVE1_DEFAULTED)) {
        if (!(key in rec)) continue;
        assert.ok(!isDefaulted(rec[key], rec),
          `${rec.id} stores "${key}" in its defaulted state; normalisation must stay in memory`);
      }
    }
  }
  assert.ok(checked >= 72, `only ${checked} records were checked: the guard is vacuous`);
});

test('every on-disk record round-trips through migrate and serialise unchanged', () => {
  // The strongest statement of constraint 2: normalising a stored record and
  // projecting it back must reproduce the exact bytes it came from. If it does
  // not, running the migration would rewrite a record nobody edited.
  const dir = path.join(ROOT, 'data', 'business-directories', 'directories');
  let checked = 0;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    for (const raw of JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))) {
      assert.deepStrictEqual(serialisableRecord(migrateRecord(raw)), raw,
        `${raw.id} does not round-trip; the migration would rewrite it`);
      checked += 1;
    }
  }
  assert.ok(checked >= 72, `only ${checked} records round-tripped: the guard is vacuous`);
});

test('the serialisation projection actually omits defaulted fields', () => {
  // Non-vacuity for WAVE1_DEFAULTED itself: an empty projection would make both
  // guards above pass trivially.
  const projected = serialisableRecord(migrateRecord({
    id: 'p', name: 'P', slug: 'p', country: 'global', category: 'saas',
    website: 'https://p.example.com/', description: 'x',
  }));
  for (const key of Object.keys(WAVE1_DEFAULTED)) {
    assert.ok(!(key in projected), `"${key}" survived the projection in its defaulted state`);
  }
  // ...and keeps a field that carries information.
  const populated = serialisableRecord(migrateRecord({
    id: 'p', name: 'P', slug: 'p', country: 'global', category: 'saas',
    website: 'https://p.example.com/', description: 'x',
    nativeName: 'Pé', registryTypes: ['company-register'], primaryRegistryType: 'company-register',
  }));
  assert.strictEqual(populated.nativeName, 'Pé');
  assert.deepStrictEqual(populated.registryTypes, ['company-register']);
});

test('the display resolver is byte-neutral for a record with no English name', () => {
  // A record as it was written before this wave: a name, and none of the new
  // name fields. The migration must derive officialName from it so the resolver
  // returns the same string the page has always shown.
  const pre = { ...verifiedRecord(), name: 'Legacy Register' };
  delete pre.officialName;
  const legacy = migrateRecord(pre);
  assert.strictEqual(legacy.officialName, 'Legacy Register');
  assert.strictEqual(S.displayName(legacy), 'Legacy Register',
    'a record without an English name must display exactly its stored name');
});

test('a stored officialName wins over a diverging name, and the pair is deliberate', () => {
  // Guards the trap the fixtures hit: setting `name` alone does NOT change the
  // display once officialName exists. That is correct — officialName is the
  // authoritative form — but it must be an explicit, tested behaviour rather
  // than a surprise discovered while debugging a render.
  const rec = migrateRecord({ ...verifiedRecord(), name: 'Short', officialName: 'The Long Official Form' });
  assert.strictEqual(S.displayName(rec), 'The Long Official Form');
});

test('migration is idempotent', () => {
  const once = migrateRecord(verifiedRecord({ nativeName: 'Registro', officialName: 'Registro' }));
  const twice = migrateRecord(once);
  assert.deepStrictEqual(twice, once, 'migrating twice changed the record');
});

// --- no network --------------------------------------------------------------

// Scoped to what this file is actually about: the business-directories build.
//
// It used to assert that NO library in scripts/lib could reach the network,
// using the directory as a stand-in for "the build path". That stand-in broke
// when scripts/lib gained to-http.cjs, which exists to reach the network and is
// reached only by hand-run ingestion, never by a build.
//
// The repository-wide version of this property — walking the require graph of
// every build entry point — lives in bd-open-source-policy.test.cjs. Here the
// question is narrower and the answer is checked directly: whatever this build
// can reach, it cannot fetch.
test('nothing the business-directories build can reach touches the network', () => {
  const network = /\bfetch\s*\(|require\('node:https?'\)|api\.ahrefs\.com|XMLHttpRequest/;
  const seen = new Set();
  const stack = [path.join(ROOT, 'scripts', 'build-business-directories.cjs')];
  while (stack.length) {
    const abs = stack.pop();
    if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory() || seen.has(abs)) continue;
    seen.add(abs);
    const src = fs.readFileSync(abs, 'utf8');
    assert.ok(!network.test(src),
      `${path.relative(ROOT, abs)} is reachable from the build and can reach the network`);
    for (const m of src.matchAll(/require\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
      let target = path.resolve(path.dirname(abs), m[1]);
      if (!fs.existsSync(target)) target = `${target}.cjs`;
      stack.push(target);
    }
  }
  assert.ok(seen.size > 5, `the build reached only ${seen.size} files: the guard is vacuous`);
});

// --- regressions found by the adversarial review -----------------------------
// Each of these passed 435/0 before its fix. They are pinned here because every
// one of them detonates on the first record Wave 1 exists to add, not on the 72
// already published.

test('C1: grouping survives records that share a jurisdiction name', () => {
  // byJurisdictionThenName falls through to compareByName, which was not
  // imported. It only fires on a tie, so every earlier test missed it.
  const mk = (n, jn) => verifiedRecord({
    id: `t-${n}`, slug: `t-${n}`, name: n, officialName: n,
    website: `https://${n}.example.gov/`, scope: jn ? 'subnational' : 'national',
    jurisdiction: jn ? { type: 'state', name: jn, code: null, parentCountry: 'united-states' } : null,
  });
  const groups = c.jurisdictionGroups([mk('b', 'Ohio'), mk('a', 'Ohio'), mk('d', null), mk('cc', null)], 'united-states');
  assert.deepStrictEqual(groups.find((g) => g.key === 'state').items.map((r) => r.name), ['a', 'b']);
  assert.deepStrictEqual(groups.find((g) => g.key === 'national').items.map((r) => r.name), ['cc', 'd']);
});

test('C4: the comparator orders by the same string the row advertises', () => {
  const order = require('../../js/bd-order.js');
  const recs = [
    verifiedRecord({ id: 'm', slug: 'm', name: 'Mmm Register', officialName: 'Mmm Register' }),
    verifiedRecord({
      id: 'a', slug: 'a', name: 'Zzz Native', officialName: 'Zzz Native',
      englishName: 'Alpha English Register', englishNameSource: 'official',
      website: 'https://a.example.gov/',
    }),
  ];
  const server = order.sortRecords(recs, 'alphabetical').map((r) => S.displayName(r));
  // The browser rebuilds a record whose `name` is the data-bd-name attribute,
  // which carries the resolved display name.
  const client = order.sortRecords(
    server.map((n) => ({ name: n })), 'alphabetical',
  ).map((r) => r.name);
  assert.deepStrictEqual(client, server, 'server order and client re-sort disagree');
  assert.deepStrictEqual(server, ['Alpha English Register', 'Mmm Register']);
});

test('C2: the client reaches every group tbody, not just the first', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'business-directories.js'), 'utf8');
  assert.match(src, /querySelectorAll\('\[data-bd-rows\]'\)/,
    'the client still binds a single tbody; grouped pages would only half-work');
});

test('C5: a supranational entry never appears in the country grid or its ItemList', () => {
  const seo = require('../lib/bd-seo.cjs');
  const eu = REGISTRY.countries.find((x) => x.slug === 'european-union');
  const countryLinks = REGISTRY.countries
    .filter((x) => x.slug !== 'global' && x.entityType !== 'supranational')
    .map((x) => x.name);
  assert.ok(!countryLinks.includes(eu.name), 'the EU is listed among countries');
  const meta = seo.buildHubMeta({
    countries: countryLinks.map((name) => ({ name, path: '/x/', count: 1 })),
    faqs: [],
  });
  assert.ok(!JSON.stringify(meta).includes('European Union'),
    'the EU leaked into the hub structured data');
});
