// scripts/tests/bd-sort.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { SORTS, SORT_KEYS, sortDirectories, compareByName } = require('../lib/bd-sort.cjs');

const make = (name, over = {}) => ({
  name, petroHrysScore: null, domainRating: null, authorityScore: null,
  estimatedTraffic: null, ...over,
});

test('exposes exactly the five specified sort keys', () => {
  assert.deepStrictEqual(SORT_KEYS,
    ['default', 'domain-rating', 'authority-score', 'traffic', 'alphabetical']);
});

test('default sort orders by PetroHrys Score descending', () => {
  const out = sortDirectories([make('A', { petroHrysScore: 40 }), make('B', { petroHrysScore: 90 })]);
  assert.deepStrictEqual(out.map((d) => d.name), ['B', 'A']);
});

test('identical scores fall through to domainRating descending', () => {
  const out = sortDirectories([
    make('C', { petroHrysScore: 50, domainRating: 10 }),
    make('A', { petroHrysScore: 50, domainRating: 80 }),
  ]);
  assert.deepStrictEqual(out.map((d) => d.name), ['A', 'C']);
});

test('identical score and domainRating fall through to name ascending', () => {
  const out = sortDirectories([
    make('Charlie', { petroHrysScore: 50, domainRating: 80 }),
    make('Alpha', { petroHrysScore: 50, domainRating: 80 }),
    make('Bravo', { petroHrysScore: 50, domainRating: 80 }),
  ]);
  assert.deepStrictEqual(out.map((d) => d.name), ['Alpha', 'Bravo', 'Charlie']);
});

test('null metrics always sort last', () => {
  const out = sortDirectories([make('A'), make('B', { petroHrysScore: 1 })]);
  assert.deepStrictEqual(out.map((d) => d.name), ['B', 'A']);
});

test('nulls sort last in every one of the metric sorts', () => {
  for (const key of ['default', 'domain-rating', 'authority-score', 'traffic']) {
    const field = { 'default': 'petroHrysScore', 'domain-rating': 'domainRating',
      'authority-score': 'authorityScore', 'traffic': 'estimatedTraffic' }[key];
    const out = sortDirectories([make('Null'), make('Real', { [field]: 5 })], key);
    assert.deepStrictEqual(out.map((d) => d.name), ['Real', 'Null'], `sort ${key}`);
  }
});

test('an all-null list falls back to name order', () => {
  const out = sortDirectories([make('Zeta'), make('Alpha'), make('Mike')]);
  assert.deepStrictEqual(out.map((d) => d.name), ['Alpha', 'Mike', 'Zeta']);
});

test('mixed-case names order case-insensitively then by code unit', () => {
  const out = sortDirectories([make('beta'), make('Alpha'), make('alpha'), make('Beta')], 'alphabetical');
  // 'alpha' pair before 'beta' pair; within each pair uppercase first by code unit.
  assert.deepStrictEqual(out.map((d) => d.name), ['Alpha', 'alpha', 'Beta', 'beta']);
});

test('name ordering is not locale-dependent', () => {
  // Under an ICU 'en' collation localeCompare puts lowercase first, so this
  // ordering fails if localeCompare is ever reintroduced.
  assert.ok(compareByName({ name: 'Alpha' }, { name: 'alpha' }) < 0);
  assert.strictEqual(compareByName({ name: 'same' }, { name: 'same' }), 0);
});

test('the implementation never calls localeCompare', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'lib', 'bd-sort.cjs'), 'utf8');
  // Strip comments before scanning, so the rationale is free to name the banned
  // API while the guard still catches a real call. The `[^:]` guard keeps `//`
  // inside a URL from being treated as a line comment.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  assert.ok(!/\.localeCompare\s*\(/.test(code), 'localeCompare is platform-dependent and banned');
  assert.ok(!/toLocale(Lower|Upper)Case\s*\(/.test(code), 'toLocale*Case is locale-sensitive and banned');
});

test('sorting is stable for fully tied records', () => {
  const input = [make('Same'), make('Same'), make('Same')];
  input.forEach((d, i) => { d.marker = i; });
  const out = sortDirectories(input);
  assert.deepStrictEqual(out.map((d) => d.marker), [0, 1, 2]);
});

test('repeated runs on the same input give identical output', () => {
  const input = [
    make('Delta', { petroHrysScore: 10 }), make('Alpha'), make('Bravo', { petroHrysScore: 10 }),
    make('Charlie', { domainRating: 3 }), make('echo', { petroHrysScore: 10, domainRating: 1 }),
  ];
  const runs = Array.from({ length: 25 }, () => sortDirectories(input).map((d) => d.name).join(','));
  assert.strictEqual(new Set(runs).size, 1, 'output must not vary between runs');
});

test('an empty array returns an empty frozen array', () => {
  const out = sortDirectories([]);
  assert.deepStrictEqual([...out], []);
  assert.ok(Object.isFrozen(out));
});

test('a single-element array is returned unchanged', () => {
  const only = make('Solo', { petroHrysScore: 7 });
  const out = sortDirectories([only]);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0], only);
});

test('sortDirectories does not mutate its input array', () => {
  const input = [make('B', { petroHrysScore: 1 }), make('A', { petroHrysScore: 9 })];
  sortDirectories(input);
  assert.deepStrictEqual(input.map((d) => d.name), ['B', 'A']);
});

test('sortDirectories does not freeze or modify the element objects', () => {
  const input = [make('B', { petroHrysScore: 1 }), make('A', { petroHrysScore: 9 })];
  const out = sortDirectories(input);
  assert.ok(!Object.isFrozen(out[0]), 'elements must stay mutable — they are the caller\'s objects');
  assert.strictEqual(out[0].petroHrysScore, 9);
  out[0].petroHrysScore = 11; // proves the element was not frozen
  assert.strictEqual(input[1].petroHrysScore, 11);
});

test('the returned array is frozen', () => {
  const out = sortDirectories([make('A'), make('B')]);
  assert.ok(Object.isFrozen(out));
  assert.throws(() => { out.push(make('C')); }, TypeError);
});

test('alphabetical sort ignores metrics entirely', () => {
  const out = sortDirectories(
    [make('Zeta', { petroHrysScore: 99 }), make('Alpha', { petroHrysScore: 1 })], 'alphabetical');
  assert.deepStrictEqual(out.map((d) => d.name), ['Alpha', 'Zeta']);
});

test('an unknown sort key falls back to the default comparator', () => {
  const out = sortDirectories([make('A', { petroHrysScore: 1 }), make('B', { petroHrysScore: 9 })], 'nope');
  assert.deepStrictEqual(out.map((d) => d.name), ['B', 'A']);
});

test('every sort exposes a human label', () => {
  for (const key of SORT_KEYS) {
    assert.strictEqual(typeof SORTS[key].label, 'string');
    assert.ok(SORTS[key].label.length > 0);
  }
});
