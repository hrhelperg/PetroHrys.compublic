'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  loadRegistry, getCountry, getCategory, directoriesFor,
  groupByCategory, reservedSlugs, isIndexable, RegistryError,
} = require('../lib/bd-registry.cjs');
const { PATHS } = require('../lib/bd-util.cjs');
const { verifiedRecord } = require('./helpers/fixtures.cjs');

// Copies the real countries/categories into a temp root so integrity failures
// can be provoked without touching the repository.
function fixture(byCountry = {}, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bd-reg-'));
  fs.copyFileSync(path.join(PATHS.dataRoot, 'countries.json'), path.join(root, 'countries.json'));
  fs.copyFileSync(path.join(PATHS.dataRoot, 'categories.json'), path.join(root, 'categories.json'));
  fs.mkdirSync(path.join(root, 'directories'));
  const countries = JSON.parse(fs.readFileSync(path.join(root, 'countries.json'), 'utf8'));
  for (const country of countries) {
    if (options.omit === country.slug) continue;
    fs.writeFileSync(path.join(root, 'directories', `${country.slug}.json`),
      `${JSON.stringify(byCountry[country.slug] || [], null, 2)}\n`);
  }
  return root;
}

const record = (over = {}) => verifiedRecord(over);

test('loads the current registry', () => {
  const registry = loadRegistry();
  // Derived, not pinned: the geographic registry grows as waves add
  // jurisdictions, and a hard-coded count would fail on every legitimate
  // addition while proving nothing about correctness.
  assert.ok(registry.countries.length >= 11, 'the geographic registry lost entries');
  assert.strictEqual(registry.countries.length,
    require('../../data/business-directories/countries.json').length);
  assert.strictEqual(registry.categories.length, 21);
  assert.ok(registry.directories.length > 0, 'the registry now holds verified records');
  for (const entry of registry.directories) {
    assert.ok(entry.lastVerified, `${entry.id} has no verification date`);
  }
});

test('country and category ordering follows declaration order and is stable', () => {
  const a = loadRegistry();
  const b = loadRegistry();
  assert.deepStrictEqual(a.countries.map((c) => c.slug), b.countries.map((c) => c.slug));
  assert.deepStrictEqual(a.categories.map((c) => c.slug), b.categories.map((c) => c.slug));
  assert.strictEqual(a.countries[0].slug, 'global', 'declaration order must be preserved');
  assert.strictEqual(a.categories[0].slug, 'general-business');
});

test('directory ordering follows country declaration order, not readdir order', () => {
  const root = fixture({
    poland: [record({ id: 'pl-1', slug: 'pl-one', country: 'poland', website: 'https://pl.example' })],
    canada: [record({ id: 'ca-1', slug: 'ca-one', country: 'canada', website: 'https://ca.example' })],
  });
  const registry = loadRegistry(root);
  const order = registry.directories.map((d) => d.country);
  assert.deepStrictEqual(order, ['canada', 'poland'], 'canada is declared before poland');
});

test('a missing country file is an error naming the expected path', () => {
  const root = fixture({}, { omit: 'germany' });
  assert.throws(() => loadRegistry(root), (err) => {
    assert.ok(err instanceof RegistryError);
    assert.ok(err.message.includes('germany.json'), err.message);
    return true;
  });
});

test('an orphan directory file is rejected and named', () => {
  const root = fixture();
  fs.writeFileSync(path.join(root, 'directories', 'atlantis.json'), '[]\n');
  assert.throws(() => loadRegistry(root), (err) => {
    assert.ok(err.message.includes('atlantis'), err.message);
    assert.ok(/orphan/i.test(err.message), err.message);
    return true;
  });
});

test('malformed JSON reports the exact source file', () => {
  const root = fixture();
  const broken = path.join(root, 'directories', 'france.json');
  fs.writeFileSync(broken, '[{ oops');
  assert.throws(() => loadRegistry(root), (err) => {
    assert.ok(err.message.includes(broken), err.message);
    assert.ok(/malformed json/i.test(err.message), err.message);
    return true;
  });
});

test('a duplicate directory id is rejected', () => {
  const root = fixture({
    'united-states': [record(), record({ slug: 'other', website: 'https://other.example' })],
  });
  assert.throws(() => loadRegistry(root), /Duplicate directory id/i);
});

test('a duplicate slug within one country is rejected', () => {
  const root = fixture({
    'united-states': [record(), record({ id: 'us-two', website: 'https://other.example' })],
  });
  assert.throws(() => loadRegistry(root), /Duplicate directory slug/i);
});

test('a duplicate canonical domain within one country is rejected', () => {
  const root = fixture({
    'united-states': [record(), record({ id: 'us-two', slug: 'other', website: 'https://www.example.com/listings' })],
  });
  assert.throws(() => loadRegistry(root), /Duplicate canonical domain/i);
});

test('the same domain is allowed in two different countries', () => {
  const root = fixture({
    'united-states': [record()],
    germany: [record({ id: 'de-1', country: 'germany' })],
  });
  const registry = loadRegistry(root);
  assert.strictEqual(registry.directories.length, 2);
});

test('an undeclared category reference is rejected', () => {
  const root = fixture({ 'united-states': [record({ category: 'blockchain' })] });
  assert.throws(() => loadRegistry(root), /undeclared category "blockchain"/i);
});

test('an undeclared country reference is rejected', () => {
  const root = fixture({ 'united-states': [record({ country: 'atlantis' })] });
  assert.throws(() => loadRegistry(root), /undeclared country "atlantis"/i);
});

test('a record stored in the wrong country file is rejected', () => {
  const root = fixture({ 'united-states': [record({ country: 'germany' })] });
  assert.throws(() => loadRegistry(root), /stored in "united-states\.json"/i);
});

test('null metrics are preserved exactly and never coerced', () => {
  const root = fixture({ 'united-states': [record({ scoreFactors: null, petroHrysScore: null })] });
  const [entry] = loadRegistry(root).directories;
  for (const field of ['petroHrysScore', 'domainRating', 'authorityScore',
    'estimatedTraffic', 'referringDomains', 'httpStatus']) {
    assert.strictEqual(entry[field], null, `${field} must stay null`);
    assert.notStrictEqual(entry[field], 0, `${field} must not become 0`);
  }
  for (const key of Object.keys(entry.accepts)) {
    assert.strictEqual(entry.accepts[key], null, `accepts.${key} must stay null`);
  }
  assert.ok(Object.hasOwn(entry, 'petroHrysScore'));
});

test('a record in the pre-expansion shape migrates on load', () => {
  const legacy = {
    id: 'legacy-1', name: 'Legacy', slug: 'legacy', country: 'united-states',
    category: 'saas', website: 'https://legacy.example', description: 'd', tier: 'tier1',
    free: true, paid: true, acceptsSaaS: true, acceptsStartups: false,
    verificationRequired: true, registration: 'required',
    lastVerified: '2026-08-01', nextVerification: '2027-08-01',
    verificationMethod: 'official-url-fetch',
    recommendedIndustries: [], pros: [], cons: [], editorNotes: '', metricsProvenance: {},
  };
  const root = fixture({ 'united-states': [legacy] });
  const [entry] = loadRegistry(root).directories;
  assert.strictEqual(entry.submissionModel, 'freemium', 'free+paid becomes freemium');
  assert.strictEqual(entry.registrationRequired, true);
  assert.strictEqual(entry.accepts.saas, true);
  assert.strictEqual(entry.accepts.startup, false);
  assert.strictEqual(entry.accepts.ai, null, 'unknown flags stay null, never invented');
  assert.strictEqual(entry.verification.status, 'verified');
  assert.strictEqual(entry.verification.source, 'official-website');
  assert.strictEqual(entry.metricStatus, 'unknown');
  assert.ok(!('free' in entry), 'legacy columns are not left behind as orphans');
  assert.ok(!('acceptsSaaS' in entry));
});

test('a traversal slug in countries.json is rejected', () => {
  const root = fixture();
  const countries = JSON.parse(fs.readFileSync(path.join(root, 'countries.json'), 'utf8'));
  countries[0].slug = '../../etc/passwd';
  fs.writeFileSync(path.join(root, 'countries.json'), JSON.stringify(countries, null, 2));
  assert.throws(() => loadRegistry(root), (err) => {
    assert.ok(/unsafe|malformed/i.test(err.message), err.message);
    return true;
  });
});

test('a traversal slug on a directory record is rejected', () => {
  const root = fixture({ 'united-states': [record({ slug: '../escape' })] });
  assert.throws(() => loadRegistry(root), /unsafe|malformed/i);
});

test('getCountry and getCategory look records up by slug', () => {
  const registry = loadRegistry();
  assert.strictEqual(getCountry(registry, 'germany').name, 'Germany');
  assert.strictEqual(getCategory(registry, 'saas').name, 'SaaS');
  assert.strictEqual(getCountry(registry, 'atlantis'), undefined);
});

test('groupByCategory returns every category in declaration order', () => {
  const root = fixture({ 'united-states': [record()] });
  const registry = loadRegistry(root);
  const grouped = groupByCategory(registry, 'united-states');
  assert.strictEqual(grouped.size, 21);
  assert.deepStrictEqual([...grouped.keys()], registry.categories.map((c) => c.slug));
  assert.strictEqual(grouped.get('saas').length, 1);
  assert.strictEqual(grouped.get('legal').length, 0);
});

test('directoriesFor filters by country and optionally category', () => {
  const root = fixture({ 'united-states': [record()] });
  const registry = loadRegistry(root);
  assert.strictEqual(directoriesFor(registry, 'united-states').length, 1);
  assert.strictEqual(directoriesFor(registry, 'united-states', 'saas').length, 1);
  assert.strictEqual(directoriesFor(registry, 'united-states', 'legal').length, 0);
  assert.strictEqual(directoriesFor(registry, 'germany').length, 0);
});

test('reservedSlugs contains every category slug plus structural words', () => {
  const reserved = reservedSlugs(loadRegistry().categories);
  assert.ok(reserved.has('saas'));
  assert.ok(reserved.has('app-directories'));
  assert.ok(reserved.has('categories'));
  assert.ok(reserved.has('page'));
});

test('isIndexable is false for an empty list and true for a populated one', () => {
  assert.strictEqual(isIndexable([]), false);
  assert.strictEqual(isIndexable([{ id: 'x' }]), true);
});
