'use strict';

// The finder, in a real browser, on the real generated pages.
//
// Every expectation here is derived independently — by parsing the page's own
// row attributes in Node and applying the shared predicate — and then compared
// against what Chrome actually shows. "Is the list plausible" is not a test; a
// page that dropped half its rows looks plausible.
//
// Every cohort is asserted NON-EMPTY before anything is concluded from it. The
// combinations below were chosen because the corpus really contains them.

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..', '..');
const { harness, chromePath } = require('./helpers/cdp.cjs');
const D = require(path.join(ROOT, 'scripts/lib/bd-discovery.cjs'));
const O = require(path.join(ROOT, 'js/bd-order.js'));

let H = null;
const skip = chromePath() ? false : 'no Chrome, Chromium or Edge on this machine';

const PAGES = {
  directories: 'research/business-directories/opportunities/',
  marketplaces: 'research/marketplaces/',
  media: 'research/media-pr-publishing/',
  tenders: 'research/tenders-procurement/',
};
const PRELOAD = [
  ...Object.values(PAGES).map((p) => `/${p}`),
  ...['de', 'es', 'fr'].map((l) => `/${l}/${PAGES.marketplaces}`),
];

before(async () => { if (chromePath()) H = await harness(ROOT, { preload: PRELOAD }); });
after(async () => { if (H) await H.close(); });

// ── THE INDEPENDENT EXPECTATION ─────────────────────────────────────────────
//
// Parse the generated page the way the client does — from the row attributes —
// and run the SAME predicate the browser runs. What this cannot share with the
// browser is the DOM, which is the part under test.
function pageModel(rel) {
  const html = fs.readFileSync(path.join(ROOT, rel, 'index.html'), 'utf8');
  const facetNames = [...new Set([...html.matchAll(/data-bd-facet="([a-z]+)"/g)].map((m) => m[1]))];
  const known = {
    facets: facetNames.map((name) => {
      const block = html.slice(html.indexOf(`data-bd-facet="${name}"`));
      const select = block.slice(0, block.indexOf('</select>'));
      return {
        name,
        multi: /data-bd-facet-multi/.test(select.slice(0, select.indexOf('>'))),
        values: [...select.matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]).filter(Boolean),
      };
    }),
    filters: [...new Set([...html.matchAll(/data-bd-filter="([a-z-]+)"/g)].map((m) => m[1]))],
    sorts: (() => {
      const i = html.indexOf('data-bd-sort');
      if (i === -1) return [];
      const select = html.slice(i, html.indexOf('</select>', i));
      return [...select.matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]).filter(Boolean);
    })(),
    jurisdictions: [],
    minDr: (() => {
      const i = html.indexOf('data-bd-min-dr>');
      if (i === -1) return [];
      const select = html.slice(i, html.indexOf('</select>', i));
      return [...select.matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]).filter(Boolean);
    })(),
  };
  const rows = [...html.matchAll(/<tr class="bd-row"([^>]*)>/g)].map(([, attrs]) => {
    // Attribute values arrive HTML-ESCAPED. The page stores a Bulgarian
    // platform's name with &#39; where the browser hands back an apostrophe, so
    // comparing raw markup against the DOM reports a mismatch on records that
    // are in fact identical, in the right order.
    const decode = (v) => v
      .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
      .replace(/&quot;/g, '"').replace(/&#x27;|&apos;/g, "'")
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    const get = (a) => {
      const m = new RegExp(`data-bd-${a}="([^"]*)"`).exec(attrs);
      return m ? decode(m[1]) : '';
    };
    const facets = {};
    for (const f of facetNames) facets[f] = get(`facet-${f}`);
    const dr = get('dr');
    return {
      name: get('name'),
      haystack: get('haystack').toLowerCase(),
      domainRating: dr === '' ? null : Number(dr),
      petroHrysScore: get('score') === '' ? null : Number(get('score')),
      facets,
      flags: {},
    };
  });
  return { known, rows };
}

function expected(rel, state) {
  const { known, rows } = pageModel(rel);
  const full = { ...D.emptyState(known), ...state };
  const kept = D.filter(rows, D.selectionFor(full, known)).rows;
  return O.sortRecords(kept, full.sort || D.defaultSort(known)).map((r) => r.name);
}

const query = (state) => {
  const parts = [];
  for (const [k, v] of Object.entries(state.facets || {})) if (v) parts.push(`${k}=${encodeURIComponent(v)}`);
  if (state.minDr) parts.push(`min-dr=${state.minDr}`);
  if (state.sort) parts.push(`sort=${state.sort}`);
  if (state.q) parts.push(`q=${encodeURIComponent(state.q)}`);
  return parts.length ? `?${parts.join('&')}` : '';
};

async function open(page, q = '', prefix = '/') {
  assert.ok(H, 'Chrome is installed but the CDP harness never started');
  await H.page.goto(`${H.origin + prefix}${page}${q}`);
  let previous = null;
  const deadline = Date.now() + 12000;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const now = JSON.stringify(await H.page.eval(() => [...document
      .querySelectorAll('tbody[data-bd-rows] tr.bd-row')]
      .filter((tr) => !tr.hidden).map((tr) => tr.getAttribute('data-bd-name'))));
    if (now === previous) return JSON.parse(now);
    previous = now;
    if (Date.now() > deadline) throw new Error(`${page}${q} never settled`);
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { setTimeout(r, 60); });
  }
}

const visible = () => H.page.eval(() => [...document
  .querySelectorAll('tbody[data-bd-rows] tr.bd-row')]
  .filter((tr) => !tr.hidden).map((tr) => tr.getAttribute('data-bd-name')));

// ── THE CASES, ONE PER COLLECTION ───────────────────────────────────────────

const CASES = [
  {
    label: 'Business Directories — Germany, free, ready, DR 40+',
    page: PAGES.directories,
    state: { facets: { country: 'germany', cost: 'free', actionability: 'READY' }, minDr: '40' },
    atLeast: 3,
  },
  {
    label: 'Business Directories — Italy, DR 50+, highest first',
    page: PAGES.directories,
    state: { facets: { country: 'italy' }, minDr: '50', sort: 'domain-rating' },
    atLeast: 1,
  },
  {
    label: 'Marketplaces — classified route, DR 40+',
    page: PAGES.marketplaces,
    state: { facets: { selleraction: 'publish-classified' }, minDr: '40' },
    atLeast: 20,
  },
  {
    label: 'Marketplaces — ready, DR 50+, highest first',
    page: PAGES.marketplaces,
    state: { facets: { actionability: 'READY' }, minDr: '50', sort: 'domain-rating' },
    atLeast: 30,
  },
  {
    label: 'Media — ready, DR 70+',
    page: PAGES.media,
    state: { facets: { actionability: 'READY' }, minDr: '70' },
    atLeast: 50,
  },
  {
    label: 'Tender Platforms — free to BID, DR 50+',
    page: PAGES.tenders,
    state: { facets: { bidaccess: 'free' }, minDr: '50' },
    atLeast: 3,
  },
  {
    label: 'Tender Platforms — free to SEARCH, DR 70+',
    page: PAGES.tenders,
    state: { facets: { searchaccess: 'free' }, minDr: '70' },
    atLeast: 100,
  },
];

for (const c of CASES) {
  test(`${c.label}: the browser shows exactly the engine's answer`, { skip }, async () => {
    const want = expected(c.page, c.state);
    assert.ok(want.length >= c.atLeast,
      `the cohort has only ${want.length} records; the corpus no longer supports this case`);
    const got = await open(c.page, query(c.state));
    assert.deepStrictEqual(got, want, `${c.label}: the page disagrees with the predicate`);
  });
}

// ── THE DISTINCTION THAT MUST NOT COLLAPSE ──────────────────────────────────

test('free notice search is a different set from free bidding', { skip }, async () => {
  const search = await open(PAGES.tenders, query({ facets: { searchaccess: 'free' } }));
  const bid = await open(PAGES.tenders, query({ facets: { bidaccess: 'free' } }));
  assert.ok(search.length > 100, `only ${search.length} platforms search freely`);
  assert.ok(bid.length > 0 && bid.length < 20, `${bid.length} platforms claim free bidding`);
  assert.ok(search.length > bid.length * 10,
    'the two sets are close enough in size to suspect they were merged');
  // The three the corpus names as regressions: free to search, and never
  // silently free to bid.
  const { rows } = pageModel(PAGES.tenders);
  const named = rows.filter((r) => /philgeps|find a tender|gebiz/i.test(r.name));
  assert.ok(named.length >= 2, 'the named regression platforms are missing from the page');
  for (const r of named) {
    if (r.facets.bidaccess === 'free') continue;
    assert.ok(!bid.includes(r.name),
      `${r.name} appears under free bidding though its bid access is "${r.facets.bidaccess}"`);
  }
});

// ── STATE ───────────────────────────────────────────────────────────────────

test('a shared link restores the whole finder state', { skip }, async () => {
  const state = { facets: { country: 'germany', cost: 'free' }, minDr: '40', sort: 'domain-rating' };
  const shown = await open(PAGES.directories, query(state));
  assert.ok(shown.length > 0, 'the shared link produced an empty page');
  const controls = await H.page.eval(() => ({
    country: (document.querySelector('[data-bd-facet="country"]') || {}).value,
    cost: (document.querySelector('[data-bd-facet="cost"]') || {}).value,
    minDr: (document.querySelector('[data-bd-min-dr]') || {}).value,
    sort: (document.querySelector('[data-bd-sort]') || {}).value,
  }));
  assert.deepStrictEqual(controls,
    { country: 'germany', cost: 'free', minDr: '40', sort: 'domain-rating' },
    'the controls do not show the state the URL asked for');
  assert.deepStrictEqual(shown, expected(PAGES.directories, state));
});

test('Back and Forward restore controls and results together', { skip }, async () => {
  // Two thresholds that genuinely select different sets, verified below rather
  // than assumed: a pair that happened to match the same records would make
  // this test pass while proving nothing about history at all.
  const first = { facets: { country: 'germany' }, minDr: '10' };
  const second = { facets: { country: 'germany' }, minDr: '70' };
  assert.notDeepStrictEqual(expected(PAGES.directories, first), expected(PAGES.directories, second),
    'the two thresholds select the same records, so this test could not detect a failure');
  const a = await open(PAGES.directories, query(first));
  await H.page.eval(() => {
    const sel = document.querySelector('[data-bd-min-dr]');
    sel.value = '70';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await new Promise((r) => { setTimeout(r, 400); });
  const b = await visible();
  assert.deepStrictEqual(b, expected(PAGES.directories, second));
  assert.notDeepStrictEqual(b, a, 'raising the threshold changed nothing');

  await H.page.eval(() => window.history.back());
  const deadline = Date.now() + 8000;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const v = await H.page.eval(() => (document.querySelector('[data-bd-min-dr]') || {}).value);
    if (v === '10') break;
    if (Date.now() > deadline) throw new Error(`Back left the threshold at ${v}`);
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { setTimeout(r, 60); });
  }
  assert.deepStrictEqual(await visible(), a, 'Back restored the control but not the rows');

  await H.page.eval(() => window.history.forward());
  const dl2 = Date.now() + 8000;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const v = await H.page.eval(() => (document.querySelector('[data-bd-min-dr]') || {}).value);
    if (v === '70') break;
    if (Date.now() > dl2) throw new Error(`Forward left the threshold at ${v}`);
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { setTimeout(r, 60); });
  }
  assert.deepStrictEqual(await visible(), b, 'Forward restored the control but not the rows');
});

test('clear restores the default view and leaves no stale query behind', { skip }, async () => {
  await open(PAGES.directories, query({ facets: { country: 'germany', cost: 'free' }, minDr: '70', sort: 'domain-rating' }));
  await H.page.eval(() => document.querySelector('[data-bd-clear]').click());
  await new Promise((r) => { setTimeout(r, 500); });
  const after = await H.page.eval(() => ({
    url: window.location.search,
    country: (document.querySelector('[data-bd-facet="country"]') || {}).value,
    minDr: (document.querySelector('[data-bd-min-dr]') || {}).value,
    sort: (document.querySelector('[data-bd-sort]') || {}).value,
    rows: [...document.querySelectorAll('tbody[data-bd-rows] tr.bd-row')].filter((tr) => !tr.hidden).length,
  }));
  assert.strictEqual(after.url, '', `clear left ${after.url} in the address bar`);
  assert.strictEqual(after.country, '');
  assert.strictEqual(after.minDr, '', 'clear left the Domain Rating threshold in place');
  assert.strictEqual(after.sort, D.defaultSort(pageModel(PAGES.directories).known),
    'clear left an external metric ranking the default view');
  assert.strictEqual(after.rows, pageModel(PAGES.directories).rows.length,
    'clear did not restore the whole corpus');
});

// ── EXPORT ──────────────────────────────────────────────────────────────────

async function download() {
  return H.page.eval(async () => {
    const button = document.querySelector('[data-bd-export]');
    if (!button || button.disabled) return null;
    let captured = null;
    const real = window.URL.createObjectURL;
    window.URL.createObjectURL = (blob) => { captured = blob; return 'blob:stub'; };
    button.click();
    window.URL.createObjectURL = real;
    return captured ? captured.text() : null;
  });
}

test('the download is exactly the visible set, in the visible order', { skip }, async () => {
  for (const state of [
    { facets: { country: 'germany' }, minDr: '40' },
    { facets: { country: 'germany', cost: 'free' }, minDr: '40' },
    { facets: { actionability: 'READY' }, minDr: '50', sort: 'domain-rating' },
    { facets: { cost: 'free', actionability: 'READY' }, minDr: '40', sort: 'domain-rating' },
  ]) {
    // eslint-disable-next-line no-await-in-loop
    const shown = await open(PAGES.directories, query(state));
    assert.ok(shown.length > 0, `${JSON.stringify(state)} produced no rows to export`);
    // eslint-disable-next-line no-await-in-loop
    const csv = await download();
    assert.ok(csv, 'the export produced no file');
    const lines = csv.replace(/^﻿/, '').trim().split('\r\n');
    const names = lines.slice(1).map((l) => (l.startsWith('"')
      ? l.slice(1, l.indexOf('"', 1))
      : l.split(',')[0]));
    assert.deepStrictEqual(names, shown,
      `the export disagrees with the table for ${JSON.stringify(state)}`);
    assert.ok(lines[0].includes('domain_rating'), 'the export omits the rating');
  }
});

test('an empty result exports nothing at all, never the whole corpus', { skip }, async () => {
  // A threshold no record can meet, combined with a country: legitimately zero.
  const shown = await open(PAGES.directories,
    query({ facets: { country: 'italy' }, minDr: '90', q: 'zzzznotathing' }));
  assert.deepStrictEqual(shown, [], 'the impossible combination returned rows');
  const count = await H.page.eval(() => {
    const el = document.querySelector('[data-bd-count]') || document.querySelector('.bd-status');
    return el ? el.textContent : '';
  });
  assert.ok(/\b0\b/.test(count) || count === '', `the count says "${count}" for an empty result`);
  const csv = await download();
  if (csv === null) return; // the button is disabled on an empty selection, which is stronger
  const lines = csv.replace(/^﻿/, '').trim().split('\r\n');
  assert.strictEqual(lines.length, 1, 'an empty selection exported data rows');
});

// ── PARITY AND HYGIENE ──────────────────────────────────────────────────────

test('every locale returns the same records in the same order', { skip }, async () => {
  const state = { facets: { actionability: 'READY' }, minDr: '50', sort: 'domain-rating' };
  const en = await open(PAGES.marketplaces, query(state));
  assert.ok(en.length > 20, `only ${en.length} records; parity would be weakly proven`);
  for (const locale of ['de', 'es', 'fr']) {
    // eslint-disable-next-line no-await-in-loop
    const other = await open(PAGES.marketplaces, query(state), `/${locale}/`);
    assert.deepStrictEqual(other, en, `${locale} ordered the same state differently`);
  }
});

test('the finder throws nothing in the browser', { skip }, async () => {
  const errors = [];
  H.page.onConsoleError = (text) => errors.push(text);
  for (const c of CASES) {
    // eslint-disable-next-line no-await-in-loop
    await open(c.page, query(c.state));
  }
  H.page.onConsoleError = null;
  assert.deepStrictEqual(errors, [], `the browser reported ${errors.length} error(s)`);
});

test('the unfiltered page shows every record it claims to have', { skip }, async () => {
  // The old duplicate-row pathology, asserted at the surface: with no filters
  // at all, what the browser shows must be the whole corpus exactly once.
  for (const [name, page] of Object.entries(PAGES)) {
    const { rows } = pageModel(page);
    // eslint-disable-next-line no-await-in-loop
    const shown = await open(page);
    assert.strictEqual(shown.length, rows.length, `${name}: ${shown.length} shown, ${rows.length} in the page`);
    // Counted, not de-duplicated by NAME. Two directories legitimately share a
    // name across countries — Gouden Gids is published in Belgium and in the
    // Netherlands — so a uniqueness assertion on the display name would fail on
    // correct data. Canonical identity is country plus host, and the duplicate
    // -row invariant is asserted against canonical ids elsewhere.
    assert.deepStrictEqual(shown, rows.map((r) => r.name),
      `${name}: the rows shown are not the rows the page contains, in order`);
  }
});
