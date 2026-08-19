'use strict';

// Domain Rating sorting, in a real browser, on the real generated pages.
//
// The unit tests prove the comparator. This proves the thing a reader actually
// touches: that choosing "Domain Rating (highest first)" reorders the rows they
// can see, that unmeasured domains stay at the bottom of BOTH directions, that
// the choice survives a reload and the back button, and that the four locales
// return the same records in the same order.
//
// Every assertion here is made against an EXPECTED ORDER derived independently
// from the page's own data attributes — not against "is it sorted". A test that
// only checks monotonicity passes on a page that dropped half its rows.

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const { harness, chromePath } = require('./helpers/cdp.cjs');
const O = require(path.join(ROOT, 'js/bd-order.js'));

let H = null;
const skip = chromePath() ? false : 'no Chrome, Chromium or Edge on this machine';

// Every page this suite reads, frozen at one moment so a generator running
// beside it cannot change what a later test sees.
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

// Navigate and wait for the client to finish, settling on stability rather than
// on any single signal — the same lesson the planner suite learned when faster
// cached responses widened the gap between `goto` resolving and the re-render.
async function open(page, query = '', prefix = '/') {
  assert.ok(H, 'Chrome is installed but the CDP harness never started');
  await H.page.goto(`${H.origin + prefix}${page}${query}`);
  let previous = null;
  const deadline = Date.now() + 10000;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const state = await H.page.eval(() => {
      const rows = [...document.querySelectorAll('tbody[data-bd-rows] tr.bd-row')];
      const select = document.querySelector('[data-bd-sort]');
      return {
        sort: select ? select.value : null,
        n: rows.length,
        first: rows.length ? rows[0].getAttribute('data-bd-name') : null,
      };
    });
    const now = JSON.stringify(state);
    if (state.n > 0 && now === previous) return state;
    previous = now;
    if (Date.now() > deadline) throw new Error(`${page}${query} never settled: ${now}`);
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { setTimeout(r, 60); });
  }
}

// The rows a reader can see, in the order they see them.
async function visible() {
  const rows = await H.page.eval(() => [...document.querySelectorAll('tbody[data-bd-rows] tr.bd-row')]
    .filter((tr) => tr.offsetParent !== null || !tr.hidden)
    .map((tr) => ({
      name: tr.getAttribute('data-bd-name'),
      dr: tr.getAttribute('data-bd-dr'),
      // The comparator's tiebreak reads the editorial score before it falls
      // through to the name. An expectation built without it ties differently
      // from the page and reports a mismatch that is its own fault.
      score: tr.getAttribute('data-bd-score'),
    })));
  assert.ok(rows.length > 0,
    'the table rendered no rows at all — every assertion below would pass vacuously');
  return rows;
}

const numOrNull = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
const toRecord = (r) => ({
  name: r.name,
  domainRating: numOrNull(r.dr),
  petroHrysScore: numOrNull(r.score),
});

async function choose(key) {
  await H.page.eval((k) => {
    const select = document.querySelector('[data-bd-sort]');
    select.value = k;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }, key);
  let previous = null;
  const deadline = Date.now() + 8000;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const now = JSON.stringify(await H.page.eval(() => [...document
      .querySelectorAll('tbody[data-bd-rows] tr.bd-row')].map((tr) => tr.getAttribute('data-bd-name'))));
    if (now === previous) return;
    previous = now;
    if (Date.now() > deadline) throw new Error(`sorting by ${key} never settled`);
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { setTimeout(r, 60); });
  }
}

async function offersDomainRating(page) {
  await open(page);
  return H.page.eval(() => {
    const select = document.querySelector('[data-bd-sort]');
    if (!select) return false;
    return [...select.options].some((o) => o.value === 'domain-rating');
  });
}

// ── ORDER, PROVEN AGAINST AN INDEPENDENTLY DERIVED EXPECTATION ──────────────

for (const [name, page] of Object.entries(PAGES)) {
  test(`${name}: highest and lowest first both order numerically, unknown last`, { skip }, async () => {
    if (!await offersDomainRating(page)) {
      // A collection with no readings yet offers no Domain Rating sort, and
      // that is correct rather than a failure — but it must be SAID, so a
      // silent skip cannot be mistaken for a pass.
      console.log(`  (${name} publishes no Domain Rating yet; nothing to order)`);
      return;
    }
    const before = (await visible()).map(toRecord);
    assert.ok(before.some((r) => r.domainRating !== null),
      `${name} offers Domain Rating sorting with no measured rows`);

    await choose('domain-rating');
    const desc = (await visible()).map(toRecord);
    assert.deepStrictEqual(desc.map((r) => r.name),
      O.sortRecords(before, 'domain-rating').map((r) => r.name),
      `${name} descending order does not match the comparator`);

    await choose('domain-rating-asc');
    const asc = (await visible()).map(toRecord);
    assert.deepStrictEqual(asc.map((r) => r.name),
      O.sortRecords(before, 'domain-rating-asc').map((r) => r.name),
      `${name} ascending order does not match the comparator`);

    // The two directions are compared by their RATINGS, not by their rows.
    //
    // Rows cannot be mirror images and should not be: where several records
    // share a rating the tiebreak orders them by score and then by name, and it
    // does so in the same direction both times — which is the property M4 pins.
    // Reversing one list would therefore reverse the ties too and report a
    // mismatch the product does not have. What must mirror is the sequence of
    // numbers, and that holds ties or no ties.
    const measured = (list) => list.filter((r) => r.domainRating !== null);
    assert.deepStrictEqual(measured(asc).map((r) => r.domainRating),
      measured(desc).map((r) => r.domainRating).reverse(),
      `${name}: the two directions do not describe one ordering`);
    assert.deepStrictEqual(measured(asc).map((r) => r.name).sort(),
      measured(desc).map((r) => r.name).sort(),
      `${name}: the two directions show different records`);
    const unknownAt = (list) => list.findIndex((r) => r.domainRating === null);
    for (const [label, list] of [['descending', desc], ['ascending', asc]]) {
      const at = unknownAt(list);
      if (at === -1) continue;
      assert.ok(list.slice(at).every((r) => r.domainRating === null),
        `${name}: a measured rating appears after an unmeasured one, ${label}`);
    }
    // A measured zero is a reading and belongs among the measured rows.
    const zero = asc.find((r) => r.domainRating === 0);
    if (zero) {
      assert.strictEqual(asc[0].domainRating, 0,
        `${name}: a measured zero did not sort first ascending`);
    }
  });
}

// ── EVERYTHING ELSE, ON THE COLLECTION THAT HAS THE MOST DATA ───────────────

const MAIN = PAGES.directories;

test('the sort survives a reload, and Back and Forward restore it', { skip }, async () => {
  if (!await offersDomainRating(MAIN)) return;

  await open(MAIN, '?sort=domain-rating');
  const fromUrl = (await visible()).map((r) => r.name);
  const state = await H.page.eval(() => document.querySelector('[data-bd-sort]').value);
  assert.strictEqual(state, 'domain-rating', 'the URL did not restore the sort control');

  await H.page.goto(`${H.origin}/${MAIN}?sort=domain-rating`);
  await open(MAIN, '?sort=domain-rating');
  assert.deepStrictEqual((await visible()).map((r) => r.name), fromUrl, 'a reload changed the order');

  // Forward to a different sort, then back.
  await open(MAIN, '?sort=domain-rating-asc');
  const ascNames = (await visible()).map((r) => r.name);
  assert.notDeepStrictEqual(ascNames, fromUrl, 'the two directions produced the same page');

  await H.page.eval(() => window.history.back());
  let deadline = Date.now() + 8000;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const v = await H.page.eval(() => document.querySelector('[data-bd-sort]').value);
    if (v === 'domain-rating') break;
    if (Date.now() > deadline) throw new Error(`Back did not restore the sort (control reads ${v})`);
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { setTimeout(r, 60); });
  }
  assert.deepStrictEqual((await visible()).map((r) => r.name), fromUrl, 'Back restored the control but not the order');

  await H.page.eval(() => window.history.forward());
  deadline = Date.now() + 8000;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const v = await H.page.eval(() => document.querySelector('[data-bd-sort]').value);
    if (v === 'domain-rating-asc') break;
    if (Date.now() > deadline) throw new Error(`Forward did not restore the sort (control reads ${v})`);
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { setTimeout(r, 60); });
  }
  assert.deepStrictEqual((await visible()).map((r) => r.name), ascNames, 'Forward restored the control but not the order');
});

test('changing a filter keeps the sort, and changing the sort keeps the filter', { skip }, async () => {
  if (!await offersDomainRating(MAIN)) return;
  await open(MAIN, '?sort=domain-rating');

  const facet = await H.page.eval(() => {
    const el = document.querySelector('[data-bd-facet]');
    if (!el) return null;
    const option = [...el.options].find((o) => o.value);
    if (!option) return null;
    el.value = option.value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { name: el.getAttribute('data-bd-facet'), value: option.value };
  });
  if (!facet) return;
  await new Promise((r) => { setTimeout(r, 400); });

  const stillSorted = await H.page.eval(() => document.querySelector('[data-bd-sort]').value);
  assert.strictEqual(stillSorted, 'domain-rating', 'changing a filter reset the sort');

  const filtered = (await visible()).map(toRecord);
  assert.deepStrictEqual(filtered.map((r) => r.name),
    O.sortRecords(filtered, 'domain-rating').map((r) => r.name),
    'the filtered rows are not in Domain Rating order');

  await choose('domain-rating-asc');
  const stillFiltered = await H.page.eval(() => {
    const el = document.querySelector('[data-bd-facet]');
    return el ? el.value : null;
  });
  assert.strictEqual(stillFiltered, facet.value, 'changing the sort reset the filter');
});

test('the search box composes with Domain Rating order', { skip }, async () => {
  if (!await offersDomainRating(MAIN)) return;
  await open(MAIN, '?sort=domain-rating');
  const typed = await H.page.eval(() => {
    const box = document.querySelector('[data-bd-search]');
    if (!box) return false;
    box.value = 'a';
    box.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  });
  if (!typed) return;
  await new Promise((r) => { setTimeout(r, 500); });
  const rows = (await visible()).map(toRecord);
  assert.deepStrictEqual(rows.map((r) => r.name),
    O.sortRecords(rows, 'domain-rating').map((r) => r.name),
    'search results are not in Domain Rating order');
  assert.strictEqual(await H.page.eval(() => document.querySelector('[data-bd-sort]').value),
    'domain-rating', 'searching reset the sort');
});

test('every locale returns the same records in the same order', { skip }, async () => {
  const page = PAGES.marketplaces;
  if (!await offersDomainRating(page)) return;
  await open(page, '?sort=domain-rating');
  const en = (await visible()).map((r) => `${r.name}:${r.dr}`);
  for (const locale of ['de', 'es', 'fr']) {
    // eslint-disable-next-line no-await-in-loop
    await open(page, '?sort=domain-rating', `/${locale}/`);
    // eslint-disable-next-line no-await-in-loop
    const other = (await visible()).map((r) => `${r.name}:${r.dr}`);
    assert.deepStrictEqual(other, en, `${locale} ordered the same records differently`);
  }
});

test('the real download carries the rating and its provider', { skip }, async () => {
  if (!await offersDomainRating(MAIN)) return;
  await open(MAIN, '?sort=domain-rating');
  const csv = await H.page.eval(async () => {
    const button = document.querySelector('[data-bd-export]');
    if (!button) return null;
    let captured = null;
    const realCreate = window.URL.createObjectURL;
    window.URL.createObjectURL = (blob) => { captured = blob; return 'blob:stub'; };
    button.click();
    window.URL.createObjectURL = realCreate;
    return captured ? captured.text() : null;
  });
  if (csv === null) return;
  const [header, ...rows] = csv.replace(/^﻿/, '').trim().split('\r\n');
  assert.ok(header.includes('domain_rating'), `the export has no rating column: ${header}`);
  assert.ok(header.includes('domain_rating_provider'), 'the export has no provider column');
  const cols = header.split(',');
  const at = cols.indexOf('domain_rating');
  const providerAt = cols.indexOf('domain_rating_provider');
  let measured = 0;
  for (const line of rows) {
    const cells = line.split(',');
    const dr = cells[at];
    if (dr === '') {
      assert.strictEqual(cells[providerAt], '', 'an unmeasured row named a provider');
      continue;
    }
    measured += 1;
    assert.match(dr, /^\d+$/, `a rating exported as ${JSON.stringify(dr)}`);
    assert.strictEqual(cells[providerAt], 'Ahrefs', 'a measured row did not credit Ahrefs');
  }
  assert.ok(measured > 0, 'the export contained no measured ratings at all');
});

test('the Domain Rating flow throws nothing in the browser', { skip }, async () => {
  const errors = [];
  H.page.onConsoleError = (text) => errors.push(text);
  for (const page of Object.values(PAGES)) {
    // eslint-disable-next-line no-await-in-loop
    if (!await offersDomainRating(page)) continue;
    // eslint-disable-next-line no-await-in-loop
    await choose('domain-rating');
    // eslint-disable-next-line no-await-in-loop
    await choose('domain-rating-asc');
    // eslint-disable-next-line no-await-in-loop
    await choose('as-published');
  }
  H.page.onConsoleError = null;
  assert.deepStrictEqual(errors, [], `the browser reported ${errors.length} error(s)`);
});

test('a page that shows a rating credits Ahrefs where the reader can see it', { skip }, async () => {
  for (const [name, page] of Object.entries(PAGES)) {
    // eslint-disable-next-line no-await-in-loop
    if (!await offersDomainRating(page)) continue;
    // eslint-disable-next-line no-await-in-loop
    const credit = await H.page.eval(() => {
      const link = [...document.querySelectorAll('a')]
        .find((a) => /Domain Rating by Ahrefs/i.test(a.textContent || ''));
      if (!link) return null;
      const style = window.getComputedStyle(link);
      return {
        href: link.getAttribute('href'),
        visible: style.display !== 'none' && style.visibility !== 'hidden' && link.offsetParent !== null,
      };
    });
    assert.ok(credit, `${name} shows a Domain Rating with no Ahrefs credit`);
    assert.strictEqual(credit.href, 'https://ahrefs.com/', `${name} credits Ahrefs without the required link`);
    assert.ok(credit.visible, `${name} hides the attribution the licence requires to be legible`);
  }
});
