// scripts/tests/bd-grouped-dom.test.cjs
'use strict';

// Behavioural cover for the client script against REAL grouped markup.
//
// The previous guard asserted that `querySelectorAll` appeared in the source.
// It passed while the script still bound `bodies[0]` and did all its work on
// the first tbody — a source-shaped test for a behaviour-shaped bug. These
// tests build a grouped page from the real components and execute the real
// script against it, so the only thing they can pass on is behaviour.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const c = require('../lib/bd-components.cjs');
const order = require('../../js/bd-order.js');
// The shared matching predicate the client delegates to, provided the same way
// BDOrder is: the sandbox has no <script> tags to load it for us.
const discovery = require('../../js/bd-discovery.js');
const { createDocument } = require('./helpers/mini-dom.cjs');
const { verifiedRecord } = require('./helpers/fixtures.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const CLIENT = fs.readFileSync(path.join(ROOT, 'js', 'business-directories.js'), 'utf8');

// --- fixture -----------------------------------------------------------------

const rec = (id, name, jurisdiction, over = {}) => verifiedRecord({
  id,
  slug: id,
  name,
  officialName: name,
  country: 'united-states',
  website: `https://${id}.example.gov/`,
  description: `${name} description`,
  scope: jurisdiction ? 'subnational' : 'national',
  jurisdiction,
  ...over,
});

const J = (type, name, code) => ({ type, name, code, parentCountry: 'united-states' });

function fixtureRecords() {
  return [
    rec('fed-sec', 'Federal Securities Register', null,
      { category: 'government', petroHrysScore: 70, submissionModel: 'notApplicable' }),
    rec('al-sos', 'Alabama Secretary of State', J('state', 'Alabama', 'US-AL'),
      { category: 'government', petroHrysScore: 60, accepts: { localBusiness: true } }),
    rec('ca-sos', 'California Secretary of State', J('state', 'California', 'US-CA'),
      { category: 'government', petroHrysScore: 95, submissionModel: 'free', accepts: { saas: true } }),
    rec('dc-corp', 'District of Columbia Corporations', J('federal-district', 'District of Columbia', 'US-DC'),
      { category: 'finance', petroHrysScore: 55 }),
    rec('gu-reg', 'Guam Business Registry', J('territory', 'Guam', 'US-GU'),
      { category: 'government', petroHrysScore: 40, accepts: { localBusiness: true } }),
  ];
}

// Mirrors what build-business-directories.cjs emits for a grouped country page.
function groupedPage(records) {
  const groups = c.jurisdictionGroups(records, 'united-states');
  const columns = c.tableColumnsFor(records);
  const parts = [
    c.searchControls({ idPrefix: 'united-states' }),
    c.filterControls({ idPrefix: 'united-states', directories: records }),
    c.sortControls({ idPrefix: 'united-states', columns }),
    c.jurisdictionFilter(groups, { idPrefix: 'united-states-jurisdiction' }),
  ];
  for (const group of groups) {
    parts.push(`<div class="bd-jgroup" id="united-states-jurisdiction-${group.key}">`
      + `<h3 class="bd-jgroup-title">${group.label} ${c.registryCount(group.count)}</h3>`
      + c.directoryTable({
        directories: group.items,
        caption: `${group.label} registries in United States`,
        columns,
        sortKey: null,
      })
      + '</div>');
  }
  return `<main>${parts.join('\n')}</main>`;
}

// Runs the real client against the real markup and returns handles for probing.
function boot(html, { clientSource = CLIENT } = {}) {
  const document = createDocument(html);
  const sandbox = { document, BDOrder: order, BDDiscovery: discovery, window: {} };
  vm.createContext(sandbox);
  vm.runInContext(clientSource, sandbox);
  const rows = document.querySelectorAll('.bd-row');
  return {
    document,
    rows,
    bodies: document.querySelectorAll('[data-bd-rows]'),
    boxes: document.querySelectorAll('.bd-jgroup'),
    status: document.querySelector('.bd-status'),
    search: document.querySelector('[data-bd-search]'),
    sort: document.querySelector('[data-bd-sort]'),
    filters: document.querySelectorAll('[data-bd-filter]'),
    visibleNames: () => rows.filter((r) => !r.hidden).map((r) => r.getAttribute('data-bd-name')),
  };
}

const HTML = groupedPage(fixtureRecords());

// --- the fixture itself is grouped -------------------------------------------

test('the fixture really is a multi-group page', () => {
  const page = boot(HTML);
  assert.ok(page.bodies.length >= 4,
    `expected several group tbodies, got ${page.bodies.length}: the suite would be vacuous`);
  assert.strictEqual(page.rows.length, 5, 'not every record reached the markup');
  assert.ok(page.bodies[0].querySelectorAll('.bd-row').length < page.rows.length,
    'all rows landed in one tbody: grouping did not happen');
});

// --- 1. search reaches every group -------------------------------------------

test('search matches records in every tbody, not only the first', () => {
  const page = boot(HTML);
  // "guam" lives in the LAST group. A first-tbody-only script cannot find it.
  page.search.value = 'guam';
  page.search.dispatch('input');
  assert.deepStrictEqual(page.visibleNames(), ['Guam Business Registry'],
    'search did not reach the last group');

  page.search.value = 'secretary of state';
  page.search.dispatch('input');
  assert.deepStrictEqual(page.visibleNames().sort(),
    ['Alabama Secretary of State', 'California Secretary of State']);
});

// --- 2. filters apply across all groups --------------------------------------

test('a filter applies across every group', () => {
  const page = boot(HTML);
  const local = page.filters.find((f) => f.getAttribute('data-bd-filter') === 'accepts-localbusiness');
  assert.ok(local, 'the fixture does not expose the filter under test');
  local.checked = true;
  local.dispatch('change');
  // Alabama is in the States group, Guam in Territories — two different tbodies.
  assert.deepStrictEqual(page.visibleNames().sort(),
    ['Alabama Secretary of State', 'Guam Business Registry']);
});

// --- 3. the count covers the whole page --------------------------------------

test('the status count reflects every group, not just the first', () => {
  const page = boot(HTML);
  assert.match(page.status.textContent, /5 directories shown/,
    `initial count is wrong: "${page.status.textContent}"`);
  page.search.value = 'guam';
  page.search.dispatch('input');
  assert.match(page.status.textContent, /1 of 5 directories shown/,
    `filtered count is wrong: "${page.status.textContent}"`);
});

// --- 4. empty groups are handled accessibly ----------------------------------

test('a group with no matching rows is hidden, and the rest stay visible', () => {
  const page = boot(HTML);
  assert.ok(page.boxes.length >= 4, 'no group boxes were rendered');
  assert.ok(page.boxes.every((b) => !b.hidden), 'a group started hidden');

  page.search.value = 'guam';
  page.search.dispatch('input');
  const visibleBoxes = page.boxes.filter((b) => !b.hidden);
  assert.strictEqual(visibleBoxes.length, 1, 'empty groups were left on the page');
  assert.match(visibleBoxes[0].textContent, /Territories/,
    'the wrong group survived the filter');
});

// --- 5. reset restores everything --------------------------------------------

test('clearing the search restores every row and every group', () => {
  const page = boot(HTML);
  page.search.value = 'guam';
  page.search.dispatch('input');
  page.search.value = '';
  page.search.dispatch('input');
  assert.strictEqual(page.visibleNames().length, 5, 'rows were not restored');
  assert.ok(page.boxes.every((b) => !b.hidden), 'a group stayed hidden after reset');
  assert.match(page.status.textContent, /5 directories shown/);
});

// --- 6. sorting does not destroy grouping ------------------------------------

test('sorting reorders within a group and never moves a row between groups', () => {
  const page = boot(HTML);
  const namesIn = (body) => body.querySelectorAll('.bd-row').map((r) => r.getAttribute('data-bd-name'));
  const before = page.bodies.map(namesIn);

  page.sort.value = 'default'; // PetroHrys Score descending
  page.sort.dispatch('change');
  const after = page.bodies.map(namesIn);

  // Same membership per group, and the same number of groups.
  assert.strictEqual(after.length, before.length);
  for (let i = 0; i < before.length; i += 1) {
    assert.deepStrictEqual([...after[i]].sort(), [...before[i]].sort(),
      `group ${i} gained or lost a row when sorting`);
  }
  // The States group has two rows with different scores, so the order within it
  // must actually change — otherwise this test proves nothing.
  const states = after.find((names) => names.length === 2);
  assert.deepStrictEqual(states, ['California Secretary of State', 'Alabama Secretary of State'],
    'sorting did not reorder within the group');
});

// --- 7. tri-state values stay unknown ----------------------------------------

test('a filter hides unknown rows without turning them into a confirmed miss', () => {
  const page = boot(HTML);
  const saas = page.filters.find((f) => f.getAttribute('data-bd-filter') === 'accepts-saas');
  assert.ok(saas, 'the fixture does not expose the SaaS filter');
  saas.checked = true;
  saas.dispatch('change');
  assert.deepStrictEqual(page.visibleNames(), ['California Secretary of State']);
  // The unknown rows are reported as unknown, not silently dropped.
  assert.match(page.status.textContent, /unknown eligibility not shown/,
    `unknown rows were not disclosed: "${page.status.textContent}"`);
  // And the attributes are still tri-state in the markup.
  const values = page.rows.map((r) => r.getAttribute('data-bd-accepts-saas'));
  assert.ok(values.includes('unknown'), 'no row carries an unknown value');
  assert.ok(values.includes('yes'), 'no row carries a yes value');
});

// --- 8. mobile labels survive ------------------------------------------------

test('every cell keeps its column label for the stacked mobile view', () => {
  const page = boot(HTML);
  for (const row of page.rows) {
    const labelled = row.querySelectorAll('[data-bd-label]');
    assert.ok(labelled.length >= 2,
      `a row lost its mobile labels: ${row.getAttribute('data-bd-name')}`);
  }
});

// --- 9. no-JS markup is complete ---------------------------------------------

test('the prerendered markup contains every record before any script runs', () => {
  const document = createDocument(HTML); // parsed, not executed
  const rows = document.querySelectorAll('.bd-row');
  assert.strictEqual(rows.length, 5, 'the server markup is incomplete without JavaScript');
  assert.ok(rows.every((r) => !r.hidden), 'a row is hidden in the server markup');
  assert.strictEqual(document.querySelector('.bd-status'), null,
    'the status region should be created by the script, not prerendered');
});

// --- 10. degenerate input ----------------------------------------------------

test('a page with no rows is left alone', () => {
  assert.doesNotThrow(() => boot('<main><table><tbody data-bd-rows></tbody></table></main>'));
  assert.doesNotThrow(() => boot('<main><p>nothing here</p></main>'));
  const page = boot('<main><table><tbody data-bd-rows></tbody></table></main>');
  assert.strictEqual(page.status, null, 'a status region was added to an empty page');
});

// --- non-vacuity: the old defects must fail this suite -----------------------

function runSuiteAgainst(clientSource) {
  const failures = [];
  const attempt = (label, fn) => {
    try { fn(); } catch (err) { failures.push(`${label}: ${err.message}`); }
  };
  attempt('search reaches all groups', () => {
    const page = boot(HTML, { clientSource });
    page.search.value = 'guam';
    page.search.dispatch('input');
    assert.deepStrictEqual(page.visibleNames(), ['Guam Business Registry']);
  });
  attempt('count covers all groups', () => {
    const page = boot(HTML, { clientSource });
    assert.match(page.status.textContent, /5 directories shown/);
  });
  attempt('grouping survives sorting', () => {
    const page = boot(HTML, { clientSource });
    page.sort.value = 'default';
    page.sort.dispatch('change');
    const perBody = page.bodies.map((b) => b.querySelectorAll('.bd-row').length);
    assert.deepStrictEqual(perBody, [1, 2, 1, 1]);
  });
  return failures;
}

test('the suite fails when first-tbody-only selection is reintroduced', () => {
  // The exact defect that shipped: collect the bodies, then use only the first.
  const broken = CLIENT
    .replace(
      /var groups = bodies\.map\(function \(body\) \{[\s\S]*?\}\)\.filter\(function \(g\) \{ return g\.records\.length > 0; \}\);/,
      'var groups = [{ body: bodies[0], box: groupBoxOf(bodies[0]), '
      + 'records: Array.prototype.slice.call(bodies[0].querySelectorAll(".bd-row")).map(recordOf) }];',
    );
  assert.notStrictEqual(broken, CLIENT, 'the mutation did not apply; the probe is vacuous');
  const failures = runSuiteAgainst(broken);
  assert.ok(failures.length >= 2,
    `first-tbody-only should break several behaviours, got: ${JSON.stringify(failures)}`);
});

test('the suite fails when sorting is made group-destructive', () => {
  // Pour every group's rows into the FIRST tbody. The engine now places rows
  // per group inside one re-order pass, so the mutation targets the line that
  // decides WHICH tbody receives them — which is the same fault the previous
  // shape injected, expressed against the current code.
  const broken = CLIENT.replace(
    'if (moved) g.body.appendChild(frag);',
    'if (moved) groups[0].body.appendChild(frag);',
  );
  assert.notStrictEqual(broken, CLIENT, 'the mutation did not apply; the probe is vacuous');
  const failures = runSuiteAgainst(broken);
  assert.ok(failures.some((f) => f.startsWith('grouping survives sorting')),
    `group-destructive sorting was not detected, got: ${JSON.stringify(failures)}`);
});
