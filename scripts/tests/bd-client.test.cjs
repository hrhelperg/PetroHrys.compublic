// scripts/tests/bd-client.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createDocument } = require('./helpers/mini-dom.cjs');
const components = require('../lib/bd-components.cjs');
const { sortDirectories } = require('../lib/bd-sort.cjs');
const { verifiedRecord } = require('./helpers/fixtures.cjs');

const root = path.resolve(__dirname, '..', '..');
const ORDER_SRC = fs.readFileSync(path.join(root, 'js', 'bd-order.js'), 'utf8');
const CLIENT_SRC = fs.readFileSync(path.join(root, 'js', 'business-directories.js'), 'utf8');

const dir = (over = {}) => verifiedRecord({ id: over.slug || 'x', name: 'X', slug: 'x',
  description: 'a directory', ...over });

// Renders the real components, parses the real markup, then executes the real
// client script against it. Nothing here is a stub except the DOM itself.
function boot(directories) {
  const html = [
    components.searchControls({ idPrefix: 'us' }),
    components.filterControls({ idPrefix: 'us' }),
    components.sortControls({ idPrefix: 'us' }),
    components.directoryTable({ directories }),
  ].join('\n');

  const document = createDocument(`<main>${html}</main>`);
  const sandbox = { document, window: {} };
  sandbox.window.document = document;
  vm.createContext(sandbox);
  vm.runInContext(ORDER_SRC, sandbox);
  vm.runInContext(CLIENT_SRC, sandbox);

  const tbody = document.querySelector('[data-bd-rows]');
  return {
    document,
    sandbox,
    visibleNames: () => tbody.children
      .filter((r) => r.matches('.bd-row') && !r.hidden)
      .map((r) => r.getAttribute('data-bd-name')),
    domOrder: () => tbody.children
      .filter((r) => r.matches('.bd-row'))
      .map((r) => r.getAttribute('data-bd-name')),
    status: () => (document.querySelector('.bd-status') || { textContent: '' }).textContent,
    sortSelect: document.querySelector('[data-bd-sort]'),
    searchInput: document.querySelector('[data-bd-search]'),
    filters: document.querySelectorAll('[data-bd-filter]'),
  };
}

const metric = (over) => ({ metricStatus: 'measured',
  metricsProvenance: { domainRating: { provider: 'Ahrefs', measuredAt: '2026-08-01' },
    estimatedTraffic: { provider: 'Ahrefs', measuredAt: '2026-08-01' } }, ...over });

const ROWS = [
  dir(metric({ slug: 'delta', name: 'Delta', petroHrysScore: 40, domainRating: 10,
    submissionModel: 'free', scoreFactors: null })),
  dir(metric({ slug: 'bravo', name: 'bravo', petroHrysScore: 90, domainRating: 50, scoreFactors: null })),
  dir(metric({ slug: 'alpha', name: 'Alpha', petroHrysScore: 90, domainRating: 50,
    accepts: { saas: true }, scoreFactors: null })),
  dir(metric({ slug: 'echo', name: 'Echo', petroHrysScore: null, estimatedTraffic: 900,
    submissionModel: 'freemium', scoreFactors: null })),
];

test('the ordering module and the client script both execute', () => {
  const app = boot(ROWS);
  assert.strictEqual(typeof app.sandbox.BDOrder, 'object');
  assert.strictEqual(app.domOrder().length, 4);
});

test('the enhanced order matches the server order exactly', () => {
  const app = boot(ROWS);
  const server = sortDirectories(ROWS).map((d) => d.name);
  assert.deepStrictEqual(app.domOrder(), server);
});

test('every sort key produces the same order as the server', () => {
  for (const key of ['default', 'domain-rating', 'authority-score', 'traffic', 'alphabetical']) {
    const app = boot(ROWS);
    app.sortSelect.value = key;
    app.sortSelect.dispatch('change');
    const server = sortDirectories(ROWS, key).map((d) => d.name);
    assert.deepStrictEqual(app.domOrder(), server, `divergence on sort "${key}"`);
  }
});

test('case-only name differences order identically on both sides', () => {
  // The exact divergence found in the audit: the client used to receive a
  // lowercased name and lost the code-unit tiebreak.
  const rows = [dir({ slug: 'lower', name: 'alpha' }), dir({ slug: 'upper', name: 'Alpha' })];
  const app = boot(rows);
  app.sortSelect.value = 'alphabetical';
  app.sortSelect.dispatch('change');
  assert.deepStrictEqual(app.domOrder(), sortDirectories(rows, 'alphabetical').map((d) => d.name));
  assert.deepStrictEqual(app.domOrder(), ['Alpha', 'alpha']);
});

test('null metrics still sort last after enhancement', () => {
  const app = boot(ROWS);
  app.sortSelect.value = 'traffic';
  app.sortSelect.dispatch('change');
  assert.strictEqual(app.domOrder()[0], 'Echo', 'the only row with traffic must lead');
  assert.strictEqual(app.domOrder().length, 4);
});

test('the controls are revealed once the script runs', () => {
  const app = boot(ROWS);
  for (const sel of ['[data-bd-sort-wrap]', '[data-bd-filter-wrap]', '[data-bd-search-wrap]']) {
    assert.strictEqual(app.document.querySelector(sel).hidden, false, `${sel} still hidden`);
  }
});

test('search hides rows that do not match', () => {
  const app = boot(ROWS);
  app.searchInput.value = 'delta';
  app.searchInput.dispatch('input');
  assert.deepStrictEqual(app.visibleNames(), ['Delta']);
});

test('search is case-insensitive and matches the description', () => {
  const app = boot(ROWS);
  app.searchInput.value = 'A DIRECTORY';
  app.searchInput.dispatch('input');
  assert.strictEqual(app.visibleNames().length, 4);
});

test('clearing the search restores every row', () => {
  const app = boot(ROWS);
  app.searchInput.value = 'delta';
  app.searchInput.dispatch('input');
  app.searchInput.value = '';
  app.searchInput.dispatch('input');
  assert.strictEqual(app.visibleNames().length, 4);
});

test('a filter hides rows that lack the flag', () => {
  const app = boot(ROWS);
  const free = app.filters.find((f) => f.getAttribute('data-bd-filter') === 'free-submission');
  free.checked = true;
  free.dispatch('change');
  assert.deepStrictEqual(app.visibleNames().sort(), ['Delta', 'Echo']);
});

test('two filters combine as AND', () => {
  const app = boot(ROWS);
  const free = app.filters.find((f) => f.getAttribute('data-bd-filter') === 'free-submission');
  const saas = app.filters.find((f) => f.getAttribute('data-bd-filter') === 'accepts-saas');
  free.checked = true; free.dispatch('change');
  saas.checked = true; saas.dispatch('change');
  assert.deepStrictEqual(app.visibleNames(), [], 'no row is both free-to-submit and SaaS-accepting');
});

test('filter and search combine', () => {
  const app = boot(ROWS);
  const free = app.filters.find((f) => f.getAttribute('data-bd-filter') === 'free-submission');
  free.checked = true; free.dispatch('change');
  app.searchInput.value = 'echo';
  app.searchInput.dispatch('input');
  assert.deepStrictEqual(app.visibleNames(), ['Echo']);
});

test('the live region announces the visible count', () => {
  const app = boot(ROWS);
  assert.strictEqual(app.status(), '4 directories shown');
  app.searchInput.value = 'delta';
  app.searchInput.dispatch('input');
  assert.strictEqual(app.status(), '1 of 4 directories shown');
});

test('the live region is a polite status region', () => {
  const app = boot(ROWS);
  const status = app.document.querySelector('.bd-status');
  assert.strictEqual(status.getAttribute('role'), 'status');
  assert.strictEqual(status.getAttribute('aria-live'), 'polite');
});

test('sorting after filtering keeps the filter applied', () => {
  const app = boot(ROWS);
  const free = app.filters.find((f) => f.getAttribute('data-bd-filter') === 'free-submission');
  free.checked = true; free.dispatch('change');
  app.sortSelect.value = 'alphabetical';
  app.sortSelect.dispatch('change');
  assert.deepStrictEqual(app.visibleNames(), ['Delta', 'Echo']);
});

test('the script no-ops safely on a page with no table', () => {
  const document = createDocument('<main><p>nothing here</p></main>');
  const sandbox = { document, window: {} };
  vm.createContext(sandbox);
  vm.runInContext(ORDER_SRC, sandbox);
  assert.doesNotThrow(() => vm.runInContext(CLIENT_SRC, sandbox));
  assert.strictEqual(document.querySelector('.bd-status'), null);
});

test('the script no-ops on an empty table and leaves controls hidden', () => {
  const app = boot([]);
  assert.strictEqual(app.document.querySelector('[data-bd-rows]'), null, 'empty state renders no table');
  assert.strictEqual(app.document.querySelector('.bd-status'), null);
});

test('the script leaves the server order alone when BDOrder is missing', () => {
  const html = components.directoryTable({ directories: ROWS });
  const document = createDocument(`<main>${html}</main>`);
  const sandbox = { document, window: {} };
  vm.createContext(sandbox);
  assert.doesNotThrow(() => vm.runInContext(CLIENT_SRC, sandbox));
  const tbody = document.querySelector('[data-bd-rows]');
  const order = tbody.children.filter((r) => r.matches('.bd-row'))
    .map((r) => r.getAttribute('data-bd-name'));
  assert.deepStrictEqual(order, sortDirectories(ROWS).map((d) => d.name),
    'without the ordering module the prerendered order must survive untouched');
});
