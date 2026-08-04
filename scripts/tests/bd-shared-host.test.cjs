// scripts/tests/bd-shared-host.test.cjs
'use strict';

// Cover for the shared official host model and the exclusion/debarment type.
//
// The duplicate-domain guard is the one rule most likely to be weakened by
// accident, because every legitimate shared host looks exactly like the
// duplicate it exists to catch. So the allowed case and all ten rejected cases
// are tested together, and a mutation probe confirms the guard is load-bearing.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const S = require('../lib/bd-schema.cjs');
const T = require('../lib/bd-registry-types.cjs');
const c = require('../lib/bd-components.cjs');
const { validateRegistry } = require('../validate-business-directories.cjs');
const { loadRegistry } = require('../lib/bd-registry.cjs');
const { migrateRecord, UNKNOWN_KEYS } = require('../lib/bd-migrate.cjs');
const { verifiedRecord } = require('./helpers/fixtures.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const REGISTRY = loadRegistry();
const okOf = (dirs) => validateRegistry({ ...REGISTRY, directories: dirs });
const reasons = (r) => r.errors.map((e) => `${e.field}: ${e.reason}`).join(' | ');

const ri = (domain, key, group) => ({
  canonicalDomain: domain, systemKey: key, sharedHostGroup: group ?? null,
});
// Two records on one host, parameterised so each rejected case changes one thing.
const pair = (aOver = {}, bOver = {}) => [
  verifiedRecord({
    id: 'sh-a', slug: 'sh-a', country: 'united-states', website: 'https://shared.example.gov/alpha',
    resourceIdentity: ri('shared.example.gov', 'system-alpha', 'shared-example'),
    ...aOver,
  }),
  verifiedRecord({
    id: 'sh-b', slug: 'sh-b', country: 'united-states', website: 'https://shared.example.gov/beta',
    resourceIdentity: ri('shared.example.gov', 'system-beta', 'shared-example'),
    ...bOver,
  }),
];

// --- the new registry type -----------------------------------------------------

test('exclusion-and-debarment-register is complete across enum, glossary and label', () => {
  assert.ok(S.REGISTRY_TYPES.includes('exclusion-and-debarment-register'));
  const def = T.registryTypeDefinition('exclusion-and-debarment-register');
  assert.ok(def, 'the type has no glossary entry');
  assert.strictEqual(def.label, 'Exclusion and debarment register');
  assert.match(def.definition, /excluded, debarred, sanctioned, suspended/);
  assert.match(def.boundary, /Not a procurement-supplier-register/);
  assert.match(def.boundary, /not a court database/i);
  assert.ok(def.examples.length >= 1);
  // The enum and the glossary must stay the same size as each other.
  assert.strictEqual(T.REGISTRY_TYPE_DEFINITIONS.length, S.REGISTRY_TYPES.length);
});

test('the three exclusion records use the new type as primary', () => {
  const ids = ['us-sam-exclusions', 'us-hhs-oig-leie', 'us-cftc-sanctions-in-effect'];
  for (const id of ids) {
    const r = REGISTRY.directories.find((x) => x.id === id);
    assert.ok(r, `${id} is missing`);
    assert.strictEqual(r.primaryRegistryType, 'exclusion-and-debarment-register',
      `${id} does not lead with the exclusion type`);
    assert.strictEqual(r.scope, 'national');
    assert.strictEqual(r.jurisdiction, null);
    assert.strictEqual(r.submissionModel, 'notApplicable',
      `${id} must not be described as a submission target`);
    assert.strictEqual(r.domainRating, null, `${id} carries a Domain Rating`);
    // Never described as something a party opts into.
    assert.ok(!/voluntary listing|submit your|get listed|apply to be listed/i.test(JSON.stringify(r)),
      `${id} uses voluntary-listing wording for a statutory exclusion`);
    // Absence must never be presented as a clean bill of health.
    assert.ok(/absence|not recommended|clean result|does not|establishes nothing/i.test(
      `${r.notRecommendedFor.join(' ')} ${r.cons.join(' ')} ${r.editorNotes}`),
    `${id} does not warn against reading absence as eligibility`);
  }
});

// --- shared host: the allowed case ----------------------------------------------

test('two genuinely distinct systems may share one official host', () => {
  const res = okOf(pair());
  assert.strictEqual(res.ok, true, `the allowed shared-host case was rejected: ${reasons(res)}`);
});

test('the shipped FDA and SAM pairs are the allowed case in production', () => {
  for (const [group, ids] of Object.entries({
    'fda-accessdata': ['us-fda-device-establishments', 'us-fda-drug-establishments'],
    'sam-gov': ['us-sam-entity-information', 'us-sam-exclusions'],
  })) {
    const records = ids.map((id) => REGISTRY.directories.find((r) => r.id === id));
    for (const r of records) {
      assert.ok(r, 'a shared-host record is missing');
      assert.strictEqual(r.resourceIdentity.sharedHostGroup, group, `${r.id} is in the wrong group`);
    }
    const [a, b] = records;
    assert.strictEqual(a.resourceIdentity.canonicalDomain, b.resourceIdentity.canonicalDomain);
    assert.notStrictEqual(a.resourceIdentity.systemKey, b.resourceIdentity.systemKey);
    assert.ok(S.urlsAreMateriallyDifferent(a.website, b.website),
      `${a.id} and ${b.id} do not point anywhere materially different`);
  }
});

// --- shared host: the ten rejected cases -------------------------------------------

test('1. two ordinary records on one domain without resourceIdentity are rejected', () => {
  const res = okOf(pair({ resourceIdentity: null }, { resourceIdentity: null }));
  assert.strictEqual(res.ok, false, 'an ordinary duplicate domain was accepted');
  assert.match(reasons(res), /Duplicate canonical domain/);
});

test('2. a duplicate domain where only one record declares a group is rejected', () => {
  const res = okOf(pair({}, { resourceIdentity: ri('shared.example.gov', 'system-beta', null) }));
  assert.strictEqual(res.ok, false, 'a half-declared shared host was accepted');
  assert.match(reasons(res), /declare resourceIdentity with a sharedHostGroup|must declare one/);
});

test('3. different sharedHostGroup values on one domain are rejected', () => {
  const res = okOf(pair({}, { resourceIdentity: ri('shared.example.gov', 'system-beta', 'other-group') }));
  assert.strictEqual(res.ok, false, 'two groups on one domain were accepted');
  assert.match(reasons(res), /must share one group/);
});

test('4. the same systemKey on two records is rejected', () => {
  const res = okOf(pair({}, { resourceIdentity: ri('shared.example.gov', 'system-alpha', 'shared-example') }));
  assert.strictEqual(res.ok, false, 'a duplicated systemKey was accepted');
  assert.match(reasons(res), /systemKey/);
});

test('5. the same search URL under different systemKeys is rejected', () => {
  const same = 'https://shared.example.gov/alpha';
  const res = okOf(pair(
    { publicAccess: { searchUrl: same, accessLevel: 'open', freeToSearch: true, loginRequired: false, identityVerificationRequired: false } },
    { website: same, publicAccess: { searchUrl: same, accessLevel: 'open', freeToSearch: true, loginRequired: false, identityVerificationRequired: false } },
  ));
  assert.strictEqual(res.ok, false, 'one URL presented as two systems was accepted');
  assert.match(reasons(res), /not materially different/);
});

test('6. a URL language variant is not a separate system', () => {
  const res = okOf(pair({}, { website: 'https://shared.example.gov/es/alpha' }));
  assert.strictEqual(res.ok, false, 'a language variant was accepted as a distinct system');
  assert.match(reasons(res), /not materially different/);
});

test('7. a query-parameter variant is not a separate system', () => {
  const res = okOf(pair({}, { website: 'https://shared.example.gov/alpha?view=table' }));
  assert.strictEqual(res.ok, false, 'a query-parameter variant was accepted');
  assert.match(reasons(res), /not materially different/);
});

test('8. a landing page and its own search page are one registry', () => {
  const res = okOf(pair(
    { website: 'https://shared.example.gov/alpha' },
    { website: 'https://shared.example.gov/alpha/' },
  ));
  assert.strictEqual(res.ok, false, 'a landing/search pair was accepted as two systems');
  assert.match(reasons(res), /not materially different/);
});

test('9. an editorially renamed duplicate is still a duplicate', () => {
  const res = okOf(pair({}, {
    name: 'A Completely Different Sounding Register',
    officialName: 'A Completely Different Sounding Register',
    website: 'https://shared.example.gov/alpha',
  }));
  assert.strictEqual(res.ok, false, 'renaming a record made a duplicate acceptable');
  assert.match(reasons(res), /not materially different/);
});

test('10. one group may not span unrelated domains', () => {
  const res = okOf([
    ...pair(),
    verifiedRecord({
      id: 'sh-c', slug: 'sh-c', country: 'united-states', website: 'https://elsewhere.example.gov/',
      resourceIdentity: ri('elsewhere.example.gov', 'system-gamma', 'shared-example'),
    }),
  ]);
  assert.strictEqual(res.ok, false, 'a group was stretched across unrelated domains');
  assert.match(reasons(res), /may not span unrelated domains/);
});

// --- resourceIdentity shape ----------------------------------------------------

test('canonicalDomain rejects anything that is not a bare hostname', () => {
  const cases = {
    'https://a.example.gov': /URL scheme/,
    'a.example.gov/search': /contains a path/,
    'A.EXAMPLE.GOV': /must be lowercase/,
    'www.a.example.gov': /"www\." prefix/,
    'a.example.gov:443': /contains a port/,
    'a.example.gov?x=1': /query or fragment/,
    'user@a.example.gov': /credentials/,
    '': /is empty/,
    ' a.example.gov': /whitespace/,
    notahost: /well-formed hostname/,
  };
  for (const [value, matcher] of Object.entries(cases)) {
    const problem = S.canonicalDomainProblem(value);
    assert.ok(problem, `${JSON.stringify(value)} was accepted`);
    assert.match(problem, matcher, `${JSON.stringify(value)}: wrong reason "${problem}"`);
  }
  assert.strictEqual(S.canonicalDomainProblem('accessdata.fda.gov'), null);
});

test('canonicalDomain must match the record website, and systemKey is required', () => {
  const res = okOf([verifiedRecord({
    id: 'sh-x', slug: 'sh-x', website: 'https://real.example.gov/',
    resourceIdentity: ri('other.example.gov', 'k', null),
  })]);
  assert.strictEqual(res.ok, false, 'a mismatched canonicalDomain was accepted');
  assert.match(reasons(res), /website resolves to "real.example.gov"/);

  const noKey = okOf([verifiedRecord({
    id: 'sh-y', slug: 'sh-y', website: 'https://real.example.gov/',
    resourceIdentity: { canonicalDomain: 'real.example.gov', systemKey: '  ', sharedHostGroup: null },
  })]);
  assert.strictEqual(noKey.ok, false, 'an empty systemKey was accepted');
  assert.match(reasons(noKey), /systemKey is required/);
});

test('an unknown key inside resourceIdentity is rejected with its path', () => {
  const migrated = migrateRecord({
    ...verifiedRecord(),
    resourceIdentity: { canonicalDomain: 'a.example.gov', systemKey: 'k', sharedHostGroup: null, hostGroup: 'x' },
  });
  assert.ok(migrated[UNKNOWN_KEYS].map((p) => p.path).includes('resourceIdentity.hostGroup'),
    'a nested typo in resourceIdentity was swallowed');
});

test('systemKey uniqueness is global, not per country', () => {
  const res = okOf([
    verifiedRecord({
      id: 'sh-us', slug: 'sh-us', country: 'united-states', website: 'https://one.example.gov/',
      resourceIdentity: ri('one.example.gov', 'clashing-key', null),
    }),
    verifiedRecord({
      id: 'sh-ca', slug: 'sh-ca', country: 'canada', website: 'https://two.example.gov/',
      resourceIdentity: ri('two.example.gov', 'clashing-key', null),
    }),
  ]);
  assert.strictEqual(res.ok, false, 'one systemKey was reused in another country');
  assert.match(reasons(res), /globally unique/);
});

// --- non-vacuity ---------------------------------------------------------------

test('the duplicate guard is load-bearing: removing it accepts an ordinary duplicate', () => {
  // Mutate the validator source in memory and confirm the ordinary duplicate,
  // which the real validator rejects, sails through the weakened one.
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'validate-business-directories.cjs'), 'utf8');
  const weakened = src.replace(
    /if \(!ri \|\| !ri\.sharedHostGroup\) \{/,
    'if (false) {',
  );
  assert.notStrictEqual(weakened, src, 'the mutation did not apply; the probe is vacuous');
  const Module = require('node:module');
  const m = new Module('weakened-validator', module);
  m.filename = path.join(ROOT, 'scripts', 'validate-business-directories.cjs');
  m.paths = Module._nodeModulePaths(path.join(ROOT, 'scripts'));
  m._compile(weakened, m.filename);
  const weakResult = m.exports.validateRegistry({
    ...REGISTRY,
    directories: pair({ resourceIdentity: null }, { resourceIdentity: null }),
  });
  const strictResult = okOf(pair({ resourceIdentity: null }, { resourceIdentity: null }));
  assert.strictEqual(strictResult.ok, false, 'the real validator does not reject the duplicate');
  assert.ok(!weakResult.errors.some((e) => /Duplicate canonical domain/.test(e.reason)),
    'weakening the guard changed nothing, so the guard is not what rejects duplicates');
});

// --- UI -------------------------------------------------------------------------

test('the public page explains the shared host without exposing internal identifiers', () => {
  const shared = REGISTRY.directories.filter((r) => r.resourceIdentity && r.resourceIdentity.sharedHostGroup);
  assert.ok(shared.length >= 4, 'too few shared-host records to test');
  for (const r of shared) {
    const html = c.registryInformation(r);
    assert.match(html, /distinct system hosted on the shared/, `${r.id} carries no hosting note`);
    assert.ok(html.includes(r.resourceIdentity.canonicalDomain), `${r.id} does not name the host`);
    assert.ok(!html.includes(r.resourceIdentity.systemKey), `${r.id} leaked its systemKey`);
    assert.ok(!html.includes(r.resourceIdentity.sharedHostGroup), `${r.id} leaked its sharedHostGroup`);
    assert.ok(!/systemKey|sharedHostGroup|resourceIdentity/.test(html), `${r.id} leaked a field name`);
  }
  // The note must NOT appear on records that do not share a host.
  const solo = REGISTRY.directories.find((r) => !r.resourceIdentity && r.operator);
  assert.ok(solo, 'no solo record to compare against');
  assert.ok(!/distinct system hosted on the shared/.test(c.registryInformation(solo)),
    'the hosting note was rendered globally');
});

test('no generated page exposes an internal identifier', () => {
  const dir = path.join(ROOT, 'research', 'business-directories');
  const walk = (d, acc = []) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, acc);
      else if (e.name.endsWith('.html')) acc.push(p);
    }
    return acc;
  };
  const pages = walk(dir);
  assert.ok(pages.length > 100, 'too few pages scanned');
  for (const page of pages) {
    const html = fs.readFileSync(page, 'utf8');
    assert.ok(!/systemKey|sharedHostGroup|fda-cder-decrs|sam-gov-exclusions/.test(html),
      `${page} exposes an internal identifier`);
  }
});
