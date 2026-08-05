// scripts/tests/bd-state-coverage.test.cjs
'use strict';

// The state coverage surface exists to answer one question a table of 31
// registries cannot: "is my state covered?". Getting that wrong in the
// optimistic direction — a pending state that looks published, a coverage count
// read as a directory count, a card that links somewhere — would be a claim of
// work not done. These tests run the real client against the real generated
// United States page.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const c = require('../lib/bd-components.cjs');
const order = require('../../js/bd-order.js');
const { loadRegistry } = require('../lib/bd-registry.cjs');
const { createDocument } = require('./helpers/mini-dom.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const PAGE = path.join(ROOT, 'research/business-directories/united-states/index.html');
const HTML = fs.readFileSync(PAGE, 'utf8');
const CLIENT = fs.readFileSync(path.join(ROOT, 'js/business-directories.js'), 'utf8');
const MANIFEST = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'data/business-directories/united-states-jurisdiction-coverage.json'), 'utf8'));

const STATES = MANIFEST.jurisdictions.filter((j) => j.kind === 'state');
const PUBLISHED = new Map(loadRegistry().directories
  .filter((r) => r.jurisdiction && r.jurisdiction.parentCountry === 'united-states')
  .map((r) => [r.jurisdiction.code, r]));

function boot() {
  const document = createDocument(HTML);
  vm.runInContext(CLIENT, vm.createContext({ document, BDOrder: order, window: {} }));
  return {
    document,
    rows: document.querySelectorAll('.bd-row'),
    cards: document.querySelectorAll('[data-bd-state-code]'),
    select: document.querySelector('[data-bd-jurisdiction-select]'),
    status: document.querySelector('.bd-status'),
    summary: document.querySelector('.bd-coverage-summary'),
    search: document.querySelector('[data-bd-search]'),
    filters: document.querySelectorAll('[data-bd-filter]'),
    boxes: document.querySelectorAll('.bd-jgroup'),
  };
}
const visible = (nodes) => nodes.filter((n) => !n.hidden);

// --- the grid ---------------------------------------------------------------

test('every state appears in the grid exactly once', () => {
  const p = boot();
  assert.strictEqual(p.cards.length, 50, `${p.cards.length} state cards, expected 50`);
  const codes = p.cards.map((n) => n.getAttribute('data-bd-state-code'));
  assert.strictEqual(new Set(codes).size, 50, 'a state appears twice in the grid');
  for (const j of STATES) {
    assert.ok(codes.includes(j.jurisdictionCode), `${j.jurisdictionCode} (${j.stateName}) is missing from the grid`);
  }
});

test('the grid is ordered alphabetically by state name', () => {
  const p = boot();
  const names = p.cards.map((n) => n.querySelector('.bd-state-name').textContent.trim());
  assert.deepStrictEqual(names, [...names].sort(), 'the state grid is not in A-Z order');
});

test('published cards link, pending cards do not', () => {
  const p = boot();
  let published = 0;
  let pending = 0;
  for (const card of p.cards) {
    const code = card.getAttribute('data-bd-state-code');
    const status = card.getAttribute('data-bd-state-status');
    const link = card.querySelector('.bd-state-link');
    if (PUBLISHED.has(code)) {
      published += 1;
      assert.strictEqual(status, 'published', `${code} has a record but is marked ${status}`);
      assert.ok(link, `${code} is published but its card is not a link`);
      const href = link.getAttribute('href');
      assert.match(href, /^\/research\/business-directories\/united-states\/[a-z0-9-]+\/$/,
        `${code} links to "${href}"`);
      assert.ok(fs.existsSync(path.join(ROOT, href.replace(/^\//, ''), 'index.html')),
        `${code} links to a page that does not exist: ${href}`);
    } else {
      pending += 1;
      assert.strictEqual(status, 'pending', `${code} has no record but is marked ${status}`);
      // The whole point: nothing to click, because there is nothing behind it.
      assert.ok(!link, `${code} is pending but its card is a link`);
      assert.ok(!/href=/.test(card.innerHTML || ''), `${code} is pending but carries an href`);
      assert.match(card.textContent, /Pending verification/,
        `${code} is pending but does not say so`);
    }
  }
  const stateRecords = STATES.filter((j) => PUBLISHED.has(j.jurisdictionCode)).length;
  assert.strictEqual(published, stateRecords,
    `${published} published cards for ${stateRecords} state records`);
  // The district and the territories have records but are not states, and must
  // not appear in a grid of 50.
  const codes = p.cards.map((n) => n.getAttribute('data-bd-state-code'));
  for (const code of ['US-DC', 'US-PR', 'US-VI', 'US-GU', 'US-MP', 'US-AS']) {
    assert.ok(!codes.includes(code), `${code} is not a state but appears in the state grid`);
  }
  assert.strictEqual(published + pending, 50);
});

test('a pending state has no detail route, no sitemap entry and no feed item', () => {
  const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap-business-directories.xml'), 'utf8');
  const feed = fs.readFileSync(path.join(ROOT, 'research/business-directories/feed.xml'), 'utf8');
  const dir = path.join(ROOT, 'research/business-directories/united-states');
  const slugs = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  for (const j of STATES.filter((x) => !PUBLISHED.has(x.jurisdictionCode))) {
    const slug = j.stateName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    assert.ok(!slugs.includes(slug), `${j.jurisdictionCode} is pending but a route exists at /${slug}/`);
    assert.ok(!sitemap.includes(`/${slug}/`), `${j.jurisdictionCode} is pending but appears in the sitemap`);
    assert.ok(!feed.includes(`/${slug}/`), `${j.jurisdictionCode} is pending but appears in the feed`);
    // And nothing may describe it as a verified directory.
    assert.ok(!new RegExp(`${j.stateName}[^<]{0,40}verified`, 'i').test(HTML),
      `${j.stateName} is described as verified on the page`);
  }
});

test('the coverage summary counts states, and is derived', () => {
  const p = boot();
  const verified = STATES.filter((j) => PUBLISHED.has(j.jurisdictionCode)).length;
  const pending = 50 - verified;
  assert.ok(p.summary, 'no coverage summary rendered');
  assert.match(p.summary.textContent, new RegExp(`${verified} of 50 states verified`),
    `summary says "${p.summary.textContent}" but ${verified} states are verified`);
  assert.match(p.summary.textContent, new RegExp(`${pending} pending`), p.summary.textContent);
  // Counting states is not counting directories, and the page must not blur them.
  assert.ok(!/50 directories/.test(HTML), 'the page implies 50 published directories');
  assert.ok(!new RegExp(`${verified} of 50 directories`).test(HTML), 'a state count is labelled as directories');
});

// --- the jurisdiction filter -------------------------------------------------

test('the jurisdiction selector lists every state plus the groups', () => {
  const p = boot();
  assert.ok(p.select, 'no jurisdiction selector rendered');
  const values = p.select.querySelectorAll('option').map((o) => o.getAttribute('value'));
  assert.strictEqual(values[0], 'all', 'the first option is not "All jurisdictions"');
  for (const j of STATES) {
    assert.ok(values.includes(`state:${j.jurisdictionCode}`), `${j.jurisdictionCode} is not selectable`);
  }
  assert.ok(values.some((v) => v === 'group:national'), 'Federal is not separately selectable');
  assert.ok(values.some((v) => v === 'group:territory'), 'Territories are not separately selectable');
  assert.ok(!values.includes('group:state'), 'the States group duplicates the per-state options');
  // A pending state is offered, and labelled honestly in the option itself.
  const pendingCode = (STATES.find((j) => !PUBLISHED.has(j.jurisdictionCode)) || {}).code;
  if (pendingCode) {
    const opt = p.select.querySelectorAll('option').find((o) => o.getAttribute('value') === `state:${pendingCode}`);
    assert.match(opt.textContent, /pending verification/i,
      'a pending state is offered without saying it is pending');
  }
});

test('selecting a published state shows its registry and nothing else', () => {
  const p = boot();
  const code = [...PUBLISHED.keys()].find((k) => STATES.some((j) => j.jurisdictionCode === k));
  p.select.value = `state:${code}`;
  p.select.dispatch('change');
  const rows = visible(p.rows);
  assert.strictEqual(rows.length, 1, `${rows.length} rows for one state`);
  assert.strictEqual(rows[0].getAttribute('data-bd-jurisdiction-code'), code);
  assert.strictEqual(visible(p.cards).length, 1, 'the grid did not narrow to the selected state');
  assert.match(p.summary.textContent, /1 verified registry/, p.summary.textContent);
});

test('selecting a pending state tells the truth instead of emptying the page', () => {
  const p = boot();
  const j = STATES.find((x) => !PUBLISHED.has(x.jurisdictionCode));
  assert.ok(j, 'no pending state to exercise this with');
  p.select.value = `state:${j.jurisdictionCode}`;
  p.select.dispatch('change');
  assert.strictEqual(visible(p.rows).length, 0, 'a pending state produced a directory row');
  const cards = visible(p.cards);
  assert.strictEqual(cards.length, 1, 'the pending state card was hidden along with the rest');
  assert.strictEqual(cards[0].getAttribute('data-bd-state-code'), j.jurisdictionCode);
  assert.match(p.summary.textContent, /pending verification/i, p.summary.textContent);
  // The status line must not let a coverage entry read as a directory result.
  assert.match(p.status.textContent, /No published directory/i, p.status.textContent);
  assert.match(p.status.textContent, /state coverage entry/i, p.status.textContent);
  assert.ok(!/1 directory shown/.test(p.status.textContent),
    'a pending coverage entry was counted as a directory');
});

test('selecting a group filters tables and hides the state grid', () => {
  const p = boot();
  p.select.value = 'group:national';
  p.select.dispatch('change');
  const rows = visible(p.rows);
  assert.ok(rows.length > 1, 'the Federal group produced no rows');
  for (const r of rows) {
    assert.strictEqual(r.getAttribute('data-bd-jurisdiction-code'), null,
      'a subnational row survived a Federal selection');
  }
  assert.strictEqual(visible(p.cards).length, 0,
    'the state grid stayed visible under a Federal selection, which it does not describe');
});

test('"All jurisdictions" restores everything', () => {
  const p = boot();
  const allRows = visible(p.rows).length;
  const allCards = visible(p.cards).length;
  const baseSummary = p.summary.textContent;
  p.select.value = 'state:US-TX';
  p.select.dispatch('change');
  p.select.value = 'all';
  p.select.dispatch('change');
  assert.strictEqual(visible(p.rows).length, allRows, 'rows were not restored');
  assert.strictEqual(visible(p.cards).length, allCards, 'the grid was not restored');
  assert.strictEqual(p.summary.textContent, baseSummary, 'the coverage summary was not restored');
});

test('the jurisdiction filter composes with search and the other filters', () => {
  const p = boot();
  p.select.value = 'group:national';
  p.select.dispatch('change');
  const federalOnly = visible(p.rows).length;
  p.search.value = 'zzzzz-no-such-register';
  p.search.dispatch('input');
  assert.strictEqual(visible(p.rows).length, 0, 'search did not compose with the jurisdiction filter');
  p.search.value = '';
  p.search.dispatch('input');
  assert.strictEqual(visible(p.rows).length, federalOnly, 'clearing the search did not restore the group');

  const f = p.filters.find((x) => x.getAttribute('data-bd-filter') === 'accepts-startup');
  if (f) {
    f.checked = true;
    f.dispatch('change');
    const both = visible(p.rows).length;
    assert.ok(both <= federalOnly, 'adding a filter widened the result set');
    for (const r of visible(p.rows)) {
      assert.strictEqual(r.getAttribute('data-bd-jurisdiction-code'), null,
        'a checkbox filter overrode the jurisdiction selection');
    }
  }
});

// --- the component in isolation ----------------------------------------------

test('the grid and summary derive from their input, not from a constant', () => {
  const rec = loadRegistry().directories.find((r) => r.jurisdiction);
  const three = [
    { code: 'US-AA', name: 'Aa', record: rec, path: '/a/', blockerCode: 'none' },
    { code: 'US-BB', name: 'Bb', record: null, path: null, blockerCode: 'waf-blocked' },
    { code: 'US-CC', name: 'Cc', record: null, path: null, blockerCode: 'system-transition' },
  ];
  assert.match(c.stateCoverageSummary(three), /1 of 3 states verified · 2 pending/);
  assert.match(c.stateCoverageSummary([three[0]]), /All 1 states verified/);
  const grid = c.stateGrid(three);
  assert.strictEqual((grid.match(/data-bd-state-status="pending"/g) || []).length, 2);
  assert.strictEqual((grid.match(/data-bd-state-status="published"/g) || []).length, 1);
  // Each blocker code produces its own reader-facing label, not a generic one.
  assert.match(grid, /Official application blocked to automated access/);
  assert.match(grid, /System in transition/);
  assert.strictEqual(c.stateGrid([]), '', 'an empty coverage set still rendered a grid');
});

test('every blocker code has a reader-facing label, and none leaks a note', () => {
  const CODES = ['none', 'connection-blocked', 'waf-blocked', 'geo-blocked',
    'login-required-unverified', 'js-only-unverified', 'official-url-unresolved',
    'system-transition', 'manual-browser-check', 'other'];
  for (const code of CODES) {
    const label = c.BLOCKER_LABELS[code];
    assert.ok(label, `blocker code "${code}" has no label`);
    assert.ok(label.length <= 60, `the label for "${code}" is a paragraph: "${label}"`);
    for (const banned of [/HTTP \d{3}/, /curl|WebFetch/i, /\bI \b/, /<[a-z]/i, /probe/i, /timed out/i]) {
      assert.ok(!banned.test(label), `the label for "${code}" leaks a research note: "${label}"`);
    }
  }
  // And the page must never print the manifest's internal blocker prose.
  for (const j of STATES.filter((x) => !PUBLISHED.has(x.jurisdictionCode))) {
    if (!j.blockerSummary) continue;
    const sentence = String(j.blockerSummary).slice(0, 60);
    assert.ok(!HTML.includes(sentence), `${j.jurisdictionCode}'s internal blocker note is published verbatim`);
  }
});
