#!/usr/bin/env node
// scripts/verify-link-value-browser.cjs
'use strict';

// The link-value filters, driven in a real browser.
//
// Every positive check asserts a NON-EMPTY cohort before it asserts anything
// about that cohort. A filter that returns nothing passes every correctness
// test ever written about it, which is why an empty result is treated here as a
// failed precondition rather than a quiet success.
//
// The combination the brief cares about most — country, free, ready, follow,
// indexable, DR — is checked as an intersection: every row that survives must
// satisfy every selected condition, read back from its own attributes rather
// than trusted from the count.
//
//   node scripts/verify-link-value-browser.cjs
//
// Nothing in the build or the test suite invokes this file.

const path = require('node:path');
const { serve, launch, openPage, chromePath } = require('./tests/helpers/cdp.cjs');

const ROOT = path.resolve(__dirname, '..');
const PAGE = '/research/business-directories/opportunities/';
const LOCALES = ['', '/de', '/es', '/fr'];

const SET = (sel, value) => {
  const el = document.querySelector(sel);
  if (!el) return false;
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
};

// What each visible row says about itself, straight from its attributes.
const VISIBLE = () => [...document.querySelectorAll('.bd-row')]
  .filter((r) => !r.hidden)
  .map((r) => ({
    name: r.getAttribute('data-bd-name') || '',
    linkType: r.getAttribute('data-bd-link-type') || '',
    listingPage: r.getAttribute('data-bd-listing-page') || '',
    dr: r.getAttribute('data-bd-dr'),
    checked: r.getAttribute('data-bd-link-checked') || '',
  }));

const CSV_ROWS = () => {
  const app = window.__bdTestHooks;
  if (!app || typeof app.csv !== 'function') return null;
  return app.csv().split(/\r?\n/).filter(Boolean);
};

async function run() {
  if (!chromePath()) { console.error('No Chrome.'); process.exit(1); }
  const server = await serve(ROOT, ['research', 'js', 'css', 'de', 'es', 'fr']);
  const chrome = await launch({ headless: false });
  const page = await openPage(chrome.wsUrl);
  const failures = [];
  const fail = (what, detail) => { failures.push(`${what}: ${detail}`); console.log(`    ✗ ${what}: ${detail}`); };

  for (const loc of LOCALES) {
    const base = `http://127.0.0.1:${server.port}${loc}${PAGE}`;
    console.log(`\n═══ ${loc || '/en'} ═══`);
    await page.goto(base);

    const has = await page.eval(() => ({
      link: !!document.querySelector('[data-bd-link-type]'),
      listing: !!document.querySelector('[data-bd-listing-page]'),
      dr: !!document.querySelector('[data-bd-min-dr]'),
    }));
    if (!has.link || !has.listing) { fail('controls', 'the link-value controls are not rendered'); continue; }

    // ── ONE FILTER AT A TIME ───────────────────────────────────────────────
    const single = async (sel, value, predicate, label) => {
      // Only options the page actually renders. A control offers a value only
      // where records carry that state, so when the corpus stops asserting one
      // the option disappears — and setting a select to a value it does not
      // offer silently selects nothing, which reads as "the filter matched
      // everything" rather than "the option is gone".
      const offered = await page.eval((s2) => {
        const el = document.querySelector(s2);
        return el ? [...el.options].map((o) => o.value) : [];
      }, sel);
      if (!offered.includes(value)) {
        console.log(`    · ${label}: not offered on this page — no record carries that state`);
        return null;
      }
      await page.eval(SET, sel, value);
      const rows = await page.eval(VISIBLE);
      if (!rows.length) { fail(label, 'the cohort is empty, so the check would be vacuous'); return null; }
      const wrong = rows.filter((r) => !predicate(r));
      if (wrong.length) {
        fail(label, `${wrong.length} of ${rows.length} do not satisfy it, e.g. `
          + `"${wrong[0].name}" link=${wrong[0].linkType || 'unknown'} page=${wrong[0].listingPage || 'unknown'}`);
      } else {
        console.log(`    ✓ ${label}: ${rows.length} rows, every one satisfies it`);
      }
      await page.eval(SET, sel, '');
      return rows;
    };

    await single('[data-bd-link-type]', 'follow', (r) => r.linkType === 'dofollow', 'Follow');
    await single('[data-bd-link-type]', 'restricted',
      (r) => ['nofollow', 'ugc', 'sponsored'].includes(r.linkType), 'Nofollow / UGC / Sponsored');
    await single('[data-bd-link-type]', 'none', (r) => r.linkType === 'none', 'No external link');
    await single('[data-bd-listing-page]', 'indexable', (r) => r.listingPage === 'indexable', 'Indexable');

    // Unknown must mean unmeasured, and must NOT include the measured ones.
    const unknown = await single('[data-bd-link-type]', 'unknown', (r) => r.linkType === '', 'Unknown link type');
    if (unknown && unknown.some((r) => r.linkType)) fail('Unknown', 'a measured record answered "unknown"');

    // ── THE INTERSECTION ───────────────────────────────────────────────────
    //
    // Applied one control at a time so a failure names the step that broke it.
    await page.eval(SET, '[data-bd-link-type]', 'follow');
    await page.eval(SET, '[data-bd-listing-page]', 'indexable');
    const both = await page.eval(VISIBLE);
    if (!both.length) {
      fail('Follow + Indexable', 'empty, so the intersection cannot be checked');
    } else {
      const wrong = both.filter((r) => r.linkType !== 'dofollow' || r.listingPage !== 'indexable');
      if (wrong.length) fail('Follow + Indexable', `${wrong.length} rows satisfy only one condition`);
      else console.log(`    ✓ Follow + Indexable: ${both.length} rows satisfy both`);
    }

    if (has.dr) {
      const drValues = await page.eval(() => [...document.querySelectorAll('[data-bd-min-dr] option')]
        .map((o) => o.value).filter(Boolean));
      if (drValues.includes('50')) {
        await page.eval(SET, '[data-bd-min-dr]', '50');
        const three = await page.eval(VISIBLE);
        if (!three.length) {
          console.log('    · Follow + Indexable + DR>=50: empty — reported, not asserted');
        } else {
          const wrong = three.filter((r) => r.linkType !== 'dofollow' || r.listingPage !== 'indexable'
            || !(Number(r.dr) >= 50));
          if (wrong.length) fail('Follow + Indexable + DR>=50', `${wrong.length} rows fail a condition`);
          else console.log(`    ✓ Follow + Indexable + DR>=50: ${three.length} rows satisfy all three`);
        }
        await page.eval(SET, '[data-bd-min-dr]', '');
      }
    }

    // ── CSV AGREES WITH THE TABLE ──────────────────────────────────────────
    const shown = await page.eval(VISIBLE);
    const csv = await page.eval(CSV_ROWS);
    if (csv) {
      const header = csv[0].split(',');
      for (const col of ['link_type', 'listing_page_indexability', 'link_evidence_checked_at']) {
        if (!header.includes(col)) fail('CSV', `${col} is missing from the header`);
      }
      if (csv.length - 1 !== shown.length) {
        fail('CSV', `${csv.length - 1} data rows for ${shown.length} visible`);
      } else if (shown.length) {
        // The link type in the file must equal the one on the row.
        const at = header.indexOf('link_type');
        const fromCsv = csv.slice(1).map((l) => l.split(',')[at]);
        const fromRows = shown.map((r) => r.linkType);
        if (fromCsv.join('|') !== fromRows.join('|')) {
          fail('CSV', 'the exported link type disagrees with the table');
        } else {
          console.log(`    ✓ CSV: ${shown.length} rows, link type matches the table`);
        }
      }
    }

    // ── URL, RELOAD, BACK, FORWARD, RESET ──────────────────────────────────
    const url = await page.eval(() => location.search);
    if (!/link-type=follow/.test(url) || !/listing-page=indexable/.test(url)) {
      fail('URL', `the selection is not in the address: ${url}`);
    }
    await page.goto(`${base}${url}`);
    const reloaded = await page.eval(VISIBLE);
    if (reloaded.length !== shown.length) {
      fail('reload', `${reloaded.length} rows from the shared link, ${shown.length} interactively`);
    } else if (reloaded.map((r) => r.name).join('|') !== shown.map((r) => r.name).join('|')) {
      fail('reload', 'the shared link renders a different set');
    } else {
      console.log('    ✓ reload: the shared link reproduces the same rows');
    }

    await page.eval(() => window.history.back());
    await new Promise((r) => { setTimeout(r, 350); });
    await page.eval(() => window.history.forward());
    await new Promise((r) => { setTimeout(r, 350); });
    const fwd = await page.eval(VISIBLE);
    if (fwd.length !== shown.length) fail('Back/Forward', `restored ${fwd.length}, expected ${shown.length}`);
    else console.log('    ✓ Back / Forward');

    const cleared = await page.eval(() => {
      const btn = document.querySelector('[data-bd-clear]');
      if (btn) btn.click();
      return {
        rows: [...document.querySelectorAll('.bd-row')].filter((r) => !r.hidden).length,
        link: (document.querySelector('[data-bd-link-type]') || {}).value,
        page: (document.querySelector('[data-bd-listing-page]') || {}).value,
        url: location.search,
      };
    });
    if (cleared.link || cleared.page || cleared.url) {
      fail('reset', `controls or address not emptied: ${JSON.stringify(cleared)}`);
    } else {
      console.log(`    ✓ reset: ${cleared.rows} rows, controls and address empty`);
    }

    const errs = await page.eval(() => (window.__errors || []).slice(0, 3));
    if (errs && errs.length) fail('console', errs.join(' / '));
  }

  console.log(`\n${failures.length ? `FAILURES (${failures.length}):` : 'All link-value browser checks passed.'}`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  try { chrome.proc.kill('SIGKILL'); } catch { /* gone */ }
  try { server.server.close(); } catch { /* gone */ }
  process.exit(failures.length ? 1 : 0);
}

run().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
