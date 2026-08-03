'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { validateRegistry, formatReport } = require('../validate-business-directories.cjs');
const { loadRegistry } = require('../lib/bd-registry.cjs');

const base = {
  id: 'us-example', name: 'Example', slug: 'example', country: 'united-states',
  category: 'saas', website: 'https://example.com', description: 'A directory.',
  tier: 'tier1', petroHrysScore: null, domainRating: null, authorityScore: null,
  estimatedTraffic: null, referringDomains: null, free: null, paid: null,
  verificationRequired: null, manualReview: null, acceptsCompanies: null,
  acceptsProducts: null, acceptsSaaS: null, acceptsApps: null, acceptsStartups: null,
  acceptsAI: null, backlinkType: null, robots: null, sitemap: null, indexed: null,
  ssl: null, lastVerified: null, nextVerification: null, httpStatus: null,
  recommendedIndustries: [], pros: [], cons: [], editorNotes: '', metricsProvenance: {},
};

const withDirs = (dirs) => ({ ...loadRegistry(), directories: dirs });
const reasons = (result) => result.errors.map((e) => e.reason);
const fields = (result) => result.errors.map((e) => e.field);

test('the shipped empty registry is valid', () => {
  const result = validateRegistry(loadRegistry());
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.errors, []);
});

test('an entirely empty registry object is valid', () => {
  const result = validateRegistry({ countries: [], categories: [], directories: [] });
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.errors, []);
});

test('a registry with exactly one valid directory is valid', () => {
  const result = validateRegistry(withDirs([base]));
  assert.deepStrictEqual(result.errors, []);
  assert.strictEqual(result.ok, true);
});

test('the result is machine-readable with the documented shape', () => {
  const result = validateRegistry(withDirs([{ ...base, website: 'http://example.com' }]));
  assert.strictEqual(typeof result.ok, 'boolean');
  assert.ok(Array.isArray(result.errors));
  for (const error of result.errors) {
    assert.deepStrictEqual(Object.keys(error).sort(), ['field', 'file', 'id', 'reason']);
    assert.strictEqual(typeof error.file, 'string');
    assert.strictEqual(typeof error.field, 'string');
    assert.strictEqual(typeof error.reason, 'string');
  }
  assert.ok(JSON.parse(JSON.stringify(result)), 'must survive a JSON round trip');
});

test('the derived file path points at the country registry file', () => {
  const result = validateRegistry(withDirs([{ ...base, website: 'http://example.com' }]));
  assert.strictEqual(result.errors[0].file,
    'data/business-directories/directories/united-states.json');
  assert.strictEqual(result.errors[0].id, 'us-example');
});

test('multiple simultaneous errors are all collected, not just the first', () => {
  const result = validateRegistry(withDirs([{
    ...base, website: 'http://example.com', tier: 'platinum', category: 'blockchain',
  }]));
  assert.ok(result.errors.length >= 3, `expected 3+, got ${result.errors.length}`);
  assert.ok(fields(result).includes('website'));
  assert.ok(fields(result).includes('tier'));
  assert.ok(fields(result).includes('category'));
});

test('error ordering is identical across repeated runs', () => {
  const registry = withDirs([
    { ...base, id: 'b', slug: 'b', website: 'http://b.example', tier: 'nope' },
    { ...base, id: 'a', slug: 'a', website: 'http://a.example', category: 'nope' },
  ]);
  const runs = Array.from({ length: 25 },
    () => JSON.stringify(validateRegistry(registry).errors));
  assert.strictEqual(new Set(runs).size, 1);
});

test('error ordering does not depend on record input order', () => {
  const a = { ...base, id: 'a', slug: 'a', website: 'http://a.example' };
  const b = { ...base, id: 'b', slug: 'b', website: 'http://b.example' };
  const forward = JSON.stringify(validateRegistry(withDirs([a, b])).errors);
  const reverse = JSON.stringify(validateRegistry(withDirs([b, a])).errors);
  assert.strictEqual(forward, reverse);
});

test('errors are sorted by file, id, field, reason', () => {
  const result = validateRegistry(withDirs([
    { ...base, id: 'zz', slug: 'zz', website: 'http://z.example' },
    { ...base, id: 'aa', slug: 'aa', website: 'http://a.example' },
  ]));
  const ids = result.errors.map((e) => e.id);
  assert.deepStrictEqual(ids, [...ids].sort());
});

test('validateRegistry never mutates the registry or its records', () => {
  const registry = withDirs([{ ...base, website: 'http://example.com', tier: 'bad' }]);
  const snapshot = JSON.stringify(registry);
  validateRegistry(registry);
  assert.strictEqual(JSON.stringify(registry), snapshot);
});

test('rejects a duplicate id', () => {
  const result = validateRegistry(withDirs([base, { ...base, slug: 'other' }]));
  assert.ok(reasons(result).some((r) => /duplicate id/i.test(r)));
});

test('rejects a duplicate slug within one country', () => {
  const result = validateRegistry(withDirs([base, { ...base, id: 'us-two' }]));
  assert.ok(reasons(result).some((r) => /duplicate slug/i.test(r)));
});

test('rejects a duplicate canonical domain within one country', () => {
  const result = validateRegistry(withDirs([
    base, { ...base, id: 'us-two', slug: 'other', website: 'https://www.example.com/list' },
  ]));
  assert.ok(reasons(result).some((r) => /duplicate canonical domain/i.test(r)));
});

test('accepts the same canonical domain in two different countries', () => {
  const result = validateRegistry(withDirs([
    base, { ...base, id: 'de-one', country: 'germany' },
  ]));
  assert.deepStrictEqual(result.errors, []);
  assert.strictEqual(result.ok, true);
});

test('rejects a slug that collides with a category', () => {
  const result = validateRegistry(withDirs([{ ...base, slug: 'saas' }]));
  assert.ok(reasons(result).some((r) => /reserved/i.test(r)));
});

test('rejects unknown country and category references', () => {
  const country = validateRegistry(withDirs([{ ...base, country: 'atlantis' }]));
  assert.ok(reasons(country).some((r) => /unknown country/i.test(r)));
  const category = validateRegistry(withDirs([{ ...base, category: 'blockchain' }]));
  assert.ok(reasons(category).some((r) => /unknown category/i.test(r)));
});

test('rejects a non-https website', () => {
  const result = validateRegistry(withDirs([{ ...base, website: 'http://example.com' }]));
  assert.ok(reasons(result).some((r) => /https/i.test(r)));
});

test('rejects a score outside 0-100', () => {
  const result = validateRegistry(withDirs([
    { ...base, petroHrysScore: 140, lastVerified: '2026-08-01' },
  ]));
  assert.ok(reasons(result).some((r) => /out of range/i.test(r)));
});

test('rejects an invalid enum value', () => {
  const result = validateRegistry(withDirs([{ ...base, tier: 'platinum' }]));
  assert.ok(reasons(result).some((r) => /invalid value/i.test(r)));
});

test('honesty gate rejects a metric on an unverified record', () => {
  const result = validateRegistry(withDirs([{ ...base, petroHrysScore: 80 }]));
  assert.ok(reasons(result).some((r) => /lastVerified is null/i.test(r)));
});

test('rejects a third-party metric without provenance', () => {
  const result = validateRegistry(withDirs([
    { ...base, lastVerified: '2026-08-01', domainRating: 70 },
  ]));
  assert.ok(reasons(result).some((r) => /provenance/i.test(r)));
});

test('accepts a third-party metric with full provenance', () => {
  const result = validateRegistry(withDirs([{
    ...base, lastVerified: '2026-08-01', domainRating: 70,
    metricsProvenance: { domainRating: { provider: 'Ahrefs', measuredAt: '2026-08-01' } },
  }]));
  assert.deepStrictEqual(result.errors, []);
});

test('rejects nextVerification on or before lastVerified', () => {
  const result = validateRegistry(withDirs([
    { ...base, lastVerified: '2026-08-01', nextVerification: '2026-08-01' },
  ]));
  assert.ok(reasons(result).some((r) => /nextVerification/i.test(r)));
});

test('rejects malformed optional values', () => {
  const result = validateRegistry(withDirs([{
    ...base, recommendedIndustries: 'legal', pros: [1, 2], cons: null,
    editorNotes: 42, ssl: 'yes', httpStatus: '200',
  }]));
  const bad = fields(result);
  for (const field of ['recommendedIndustries', 'pros', 'cons', 'editorNotes', 'ssl', 'httpStatus']) {
    assert.ok(bad.includes(field), `expected an error for ${field}, got ${bad.join(', ')}`);
  }
});

test('a record with no id still produces a reportable error', () => {
  const { id, ...noId } = base;
  const result = validateRegistry(withDirs([{ ...noId, website: 'http://x.example' }]));
  assert.ok(result.errors.length > 0);
  assert.ok(result.errors.every((e) => typeof e.file === 'string'));
});

test('formatReport renders a human-readable report', () => {
  const result = validateRegistry(withDirs([{ ...base, website: 'http://example.com' }]));
  const report = formatReport(result);
  assert.ok(report.includes('united-states.json'));
  assert.ok(report.includes('website'));
  assert.ok(/1 validation error/.test(report));
});

test('formatReport reports success for a valid registry', () => {
  assert.ok(/valid/i.test(formatReport(validateRegistry(loadRegistry()))));
});
