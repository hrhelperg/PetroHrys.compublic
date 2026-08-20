'use strict';

// One country, in a real browser, across four kinds of channel.
//
// Every expectation is derived independently — by parsing the page's own row
// attributes in Node and running the shared predicate — and then compared with
// what Chrome shows. The countries below deliberately span the shapes the
// corpus actually has: dense (Germany, 110 sources), middling (India, Italy,
// Czech Republic), small (Estonia, 7) and sparse (Barbados, 1). A finder proved
// only on large markets is a finder nobody has tested on the page most readers
// will open.

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..', '..');
const { harness, chromePath } = require('./helpers/cdp.cjs');
const D = require(path.join(ROOT, 'scripts/lib/bd-discovery.cjs'));
const O = require(path.join(ROOT, 'js/bd-order.js'));

const PAGE = 'research/countries/';
let H = null;
let MODEL = null;
const skip = chromePath() ? false : 'no Chrome, Chromium or Edge on this machine';

const decode = (v) => v
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
  .replace(/&quot;/g, '"').replace(/&#x27;|&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

function pageModel() {
  if (MODEL) return MODEL;
  const html = fs.readFileSync(path.join(ROOT, PAGE, 'index.html'), 'utf8');
  const names = [...new Set([...html.matchAll(/data-bd-facet="([a-z]+)"/g)].map((m) => m[1]))];
  const optionsAfter = (marker) => {
    const i = html.indexOf(marker);
    if (i === -1) return [];
    return [...html.slice(i, html.indexOf('</select>', i)).matchAll(/<option value="([^"]*)"/g)]
      .map((m) => m[1]).filter(Boolean);
  };
  const known = {
    facets: names.map((name) => ({
      name, multi: false, values: optionsAfter(`data-bd-facet="${name}"`),
    })),
    filters: [],
    sorts: optionsAfter('data-bd-sort'),
    jurisdictions: [],
    minDr: optionsAfter('data-bd-min-dr>'),
  };
  const rows = [...html.matchAll(/<tr class="bd-row"([^>]*)>/g)].map(([, attrs]) => {
    const get = (a) => {
      const m = new RegExp(`data-bd-${a}="([^"]*)"`).exec(attrs);
      return m ? decode(m[1]) : '';
    };
    const facets = {};
    for (const n of names) facets[n] = get(`facet-${n}`);
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
  MODEL = { known, rows };
  return MODEL;
}

// Expected order, per collection group — because the page gives each collection
// its own tbody and the client sorts WITHIN a group, never across them.
function expected(state) {
  const { known, rows } = pageModel();
  const full = { ...D.emptyState(known), ...state };
  const kept = D.filter(rows, D.selectionFor(full, known)).rows;
  const order = full.sort || D.defaultSort(known);
  const out = [];
  for (const collection of ['directories', 'marketplaces', 'media', 'tenders']) {
    const group = kept.filter((r) => r.facets.collection === collection);
    out.push(...O.sortRecords(group, order).map((r) => r.name));
  }
  return out;
}

const query = (state) => {
  const parts = [];
  for (const [k, v] of Object.entries(state.facets || {})) if (v) parts.push(`${k}=${encodeURIComponent(v)}`);
  if (state.minDr) parts.push(`min-dr=${state.minDr}`);
  if (state.sort) parts.push(`sort=${state.sort}`);
  if (state.q) parts.push(`q=${encodeURIComponent(state.q)}`);
  return parts.length ? `?${parts.join('&')}` : '';
};

before(async () => {
  if (chromePath()) {
    H = await harness(ROOT, {
      preload: [`/${PAGE}`, ...['de', 'es', 'fr'].map((l) => `/${l}/${PAGE}`)],
    });
  }
});
after(async () => { if (H) await H.close(); });

async function open(q = '', prefix = '/') {
  assert.ok(H, 'Chrome is installed but the CDP harness never started');
  await H.page.goto(`${H.origin + prefix}${PAGE}${q}`);
  let previous = null;
  const deadline = Date.now() + 15000;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const now = JSON.stringify(await H.page.eval(() => [...document
      .querySelectorAll('tbody[data-bd-rows] tr.bd-row')]
      .filter((tr) => !tr.hidden).map((tr) => tr.getAttribute('data-bd-name'))));
    if (now === previous) return JSON.parse(now);
    previous = now;
    if (Date.now() > deadline) throw new Error(`${q || '(default)'} never settled`);
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { setTimeout(r, 60); });
  }
}

const visible = () => H.page.eval(() => [...document
  .querySelectorAll('tbody[data-bd-rows] tr.bd-row')]
  .filter((tr) => !tr.hidden).map((tr) => tr.getAttribute('data-bd-name')));

// ── COUNTRIES OF DELIBERATELY DIFFERENT SHAPES ──────────────────────────────

const COUNTRIES = [
  { slug: 'germany', atLeast: 100 },
  { slug: 'india', atLeast: 70 },
  { slug: 'italy', atLeast: 30 },
  { slug: 'czech-republic', atLeast: 30 },
  { slug: 'united-states', atLeast: 300 },
  { slug: 'estonia', atLeast: 5 },
  { slug: 'barbados', atLeast: 1 },
];

for (const c of COUNTRIES) {
  test(`${c.slug}: the browser shows exactly the country the engine computed`, { skip }, async () => {
    const state = { facets: { country: c.slug } };
    const want = expected(state);
    assert.ok(want.length >= c.atLeast,
      `${c.slug} has only ${want.length} sources; the corpus no longer supports this case`);
    const got = await open(query(state));
    assert.deepStrictEqual(got, want, `${c.slug}: the page disagrees with the predicate`);
  });
}

test('every collection a country has is present, and none is silently dropped', { skip }, async () => {
  const { rows } = pageModel();
  for (const slug of ['germany', 'india', 'united-states']) {
    // eslint-disable-next-line no-await-in-loop
    const shown = await open(query({ facets: { country: slug } }));
    const byCollection = {};
    for (const r of rows.filter((x) => x.facets.country === slug)) {
      byCollection[r.facets.collection] = (byCollection[r.facets.collection] || 0) + 1;
    }
    const present = Object.keys(byCollection).filter((k) => byCollection[k] > 0);
    assert.ok(present.length >= 3, `${slug} carries only ${present.join(', ')}`);
    assert.strictEqual(shown.length,
      Object.values(byCollection).reduce((a, b) => a + b, 0),
      `${slug}: the page shows a different number of sources than it contains`);
  }
});

// ── COMPOSITION ─────────────────────────────────────────────────────────────

test('collection, readiness and a rating floor intersect inside one country', { skip }, async () => {
  const state = {
    facets: { country: 'india', collection: 'directories', actionability: 'READY' },
    minDr: '50',
    sort: 'domain-rating',
  };
  const want = expected(state);
  assert.ok(want.length > 0, 'the chosen combination is empty; pick another real cohort');
  assert.deepStrictEqual(await open(query(state)), want);
  // Every dimension is doing work: dropping any of them widens the result.
  const wider = expected({ facets: { country: 'india', collection: 'directories' }, minDr: '50', sort: 'domain-rating' });
  assert.ok(wider.length > want.length, 'readiness narrowed nothing, so the facets may be OR');
});

test('free tender search is never shown as free bidding', { skip }, async () => {
  const search = await open(query({ facets: { collection: 'tenders', searchaccess: 'free' } }));
  const bid = await open(query({ facets: { collection: 'tenders', bidaccess: 'free' } }));
  assert.ok(search.length > 200, `${search.length} platforms search freely`);
  assert.ok(bid.length > 0 && bid.length < 20, `${bid.length} platforms bid freely`);
  assert.ok(search.length > bid.length * 10, 'the two access facts look merged');
});

// ── STATE ───────────────────────────────────────────────────────────────────

test('a shared country link restores country and every filter', { skip }, async () => {
  const state = { facets: { country: 'czech-republic', collection: 'directories' }, minDr: '50', sort: 'domain-rating' };
  const shown = await open(query(state));
  assert.ok(shown.length > 0);
  const controls = await H.page.eval(() => ({
    country: (document.querySelector('[data-bd-facet="country"]') || {}).value,
    collection: (document.querySelector('[data-bd-facet="collection"]') || {}).value,
    minDr: (document.querySelector('[data-bd-min-dr]') || {}).value,
    sort: (document.querySelector('[data-bd-sort]') || {}).value,
  }));
  assert.deepStrictEqual(controls,
    { country: 'czech-republic', collection: 'directories', minDr: '50', sort: 'domain-rating' });
  assert.deepStrictEqual(shown, expected(state));
});

test('Back and Forward move between complete country states', { skip }, async () => {
  const first = { facets: { country: 'germany' }, minDr: '10' };
  const second = { facets: { country: 'germany' }, minDr: '80' };
  assert.notDeepStrictEqual(expected(first), expected(second),
    'the two states select the same rows, so this test could not detect a failure');
  const a = await open(query(first));
  await H.page.eval(() => {
    const sel = document.querySelector('[data-bd-min-dr]');
    sel.value = '80';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await new Promise((r) => { setTimeout(r, 400); });
  const b = await visible();
  assert.deepStrictEqual(b, expected(second));

  const waitFor = async (want) => {
    const deadline = Date.now() + 8000;
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const v = await H.page.eval(() => (document.querySelector('[data-bd-min-dr]') || {}).value);
      if (v === want) return;
      if (Date.now() > deadline) throw new Error(`history left the threshold at ${v}`);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => { setTimeout(r, 60); });
    }
  };
  await H.page.eval(() => window.history.back());
  await waitFor('10');
  assert.deepStrictEqual(await visible(), a, 'Back restored the control but not the rows');
  await H.page.eval(() => window.history.forward());
  await waitFor('80');
  assert.deepStrictEqual(await visible(), b, 'Forward restored the control but not the rows');
});

test('reset clears the filters and stays on the explorer', { skip }, async () => {
  await open(query({ facets: { country: 'italy', collection: 'media' }, minDr: '70', sort: 'domain-rating' }));
  const before = await H.page.eval(() => window.location.pathname);
  await H.page.eval(() => document.querySelector('[data-bd-clear]').click());
  await new Promise((r) => { setTimeout(r, 600); });
  const after = await H.page.eval(() => ({
    path: window.location.pathname,
    search: window.location.search,
    country: (document.querySelector('[data-bd-facet="country"]') || {}).value,
    minDr: (document.querySelector('[data-bd-min-dr]') || {}).value,
    rows: [...document.querySelectorAll('tbody[data-bd-rows] tr.bd-row')].filter((t) => !t.hidden).length,
  }));
  assert.strictEqual(after.path, before, 'reset navigated away from the explorer');
  assert.strictEqual(after.search, '', `reset left ${after.search} behind`);
  assert.strictEqual(after.minDr, '');
  assert.strictEqual(after.rows, pageModel().rows.length, 'reset did not restore every source');
});

// ── EXPORT ──────────────────────────────────────────────────────────────────

test('the download is the visible country set, in the visible order', { skip }, async () => {
  for (const state of [
    { facets: { country: 'czech-republic' } },
    { facets: { country: 'germany', collection: 'directories' }, minDr: '50', sort: 'domain-rating' },
  ]) {
    // eslint-disable-next-line no-await-in-loop
    const shown = await open(query(state));
    assert.ok(shown.length > 0);
    // eslint-disable-next-line no-await-in-loop
    const csv = await H.page.eval(async () => {
      const button = document.querySelector('[data-bd-export]');
      if (!button || button.disabled) return null;
      let captured = null;
      const real = window.URL.createObjectURL;
      window.URL.createObjectURL = (b) => { captured = b; return 'blob:stub'; };
      button.click();
      window.URL.createObjectURL = real;
      return captured ? captured.text() : null;
    });
    assert.ok(csv, 'the export produced no file');
    const lines = csv.replace(/^﻿/, '').trim().split('\r\n');
    const names = lines.slice(1).map((l) => (l.startsWith('"') ? l.slice(1, l.indexOf('"', 1)) : l.split(',')[0]));
    assert.deepStrictEqual(names, shown, `the export disagrees with the table for ${JSON.stringify(state)}`);
  }
});

// ── PARITY, ATTRIBUTION, HYGIENE ────────────────────────────────────────────

test('every locale returns the same country in the same order', { skip }, async () => {
  const state = { facets: { country: 'germany' }, minDr: '50', sort: 'domain-rating' };
  const en = await open(query(state));
  assert.ok(en.length > 40);
  for (const locale of ['de', 'es', 'fr']) {
    // eslint-disable-next-line no-await-in-loop
    assert.deepStrictEqual(await open(query(state), `/${locale}/`), en,
      `${locale} ordered the same country differently`);
  }
});

test('the page credits Ahrefs once, visibly', { skip }, async () => {
  await open();
  const credit = await H.page.eval(() => {
    const links = [...document.querySelectorAll('a')]
      .filter((a) => /Domain Rating by Ahrefs/i.test(a.textContent || ''));
    if (!links.length) return null;
    const style = window.getComputedStyle(links[0]);
    return {
      count: links.length,
      href: links[0].getAttribute('href'),
      visible: style.display !== 'none' && style.visibility !== 'hidden',
    };
  });
  assert.ok(credit, 'the explorer shows ratings without crediting Ahrefs');
  assert.strictEqual(credit.href, 'https://ahrefs.com/');
  assert.strictEqual(credit.count, 1, `the credit is repeated ${credit.count} times`);
  assert.ok(credit.visible);
});

test('the explorer throws nothing in the browser', { skip }, async () => {
  const errors = [];
  H.page.onConsoleError = (text) => errors.push(text);
  for (const c of COUNTRIES.slice(0, 4)) await open(query({ facets: { country: c.slug } }));
  await open(query({ facets: { collection: 'tenders', bidaccess: 'free' } }));
  H.page.onConsoleError = null;
  assert.deepStrictEqual(errors, [], `the browser reported ${errors.length} error(s)`);
});

test('the finder is usable at a phone width', { skip }, async () => {
  await open(query({ facets: { country: 'czech-republic' } }));
  const narrow = await H.page.eval(() => {
    const controls = [...document.querySelectorAll('[data-bd-facet], [data-bd-min-dr], [data-bd-sort]')];
    const doc = document.documentElement;
    return {
      controls: controls.length,
      labelled: controls.filter((el) => {
        const id = el.getAttribute('id');
        return id && document.querySelector(`label[for="${id}"]`);
      }).length,
      overflow: doc.scrollWidth - doc.clientWidth,
    };
  });
  assert.ok(narrow.controls >= 8, `only ${narrow.controls} controls found`);
  assert.strictEqual(narrow.labelled, narrow.controls,
    'a control has no label, so it cannot be used by name or by a screen reader');
  assert.ok(narrow.overflow <= 0 || narrow.overflow < 40,
    `the page overflows its viewport by ${narrow.overflow}px`);
});
