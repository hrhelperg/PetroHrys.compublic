#!/usr/bin/env node
// scripts/verify-filter-engine.cjs
'use strict';

// Proving the fast engine still shows the right rows in the right order.
//
// The speed came from two changes that are easy to get subtly wrong: rows are
// written only where their visibility CHANGED, and only the VISIBLE rows are
// placed in sorted order. Both are correct only if a row that becomes visible
// again lands where it belongs, and if what the table shows always equals what
// the engine says it shows.
//
// So this drives the real page in Chrome through the awkward sequences —
// narrow then widen, sort then filter, filter then sort, back and forward,
// reload — and after every step compares three things that must agree: the
// engine's count, the rows actually rendered, and the CSV.
//
//   node scripts/verify-filter-engine.cjs
//   node scripts/verify-filter-engine.cjs --page countries
//
// Nothing in the build or the test suite invokes this file.

const path = require('node:path');
const { serve, launch, openPage, chromePath } = require('./tests/helpers/cdp.cjs');

const ROOT = path.resolve(__dirname, '..');
const PAGES = {
  directories: '/research/business-directories/opportunities/',
  countries: '/research/countries/',
  media: '/research/media-pr-publishing/',
  marketplaces: '/research/marketplaces/',
  tenders: '/research/tenders-procurement/',
};
const LOCALES = ['', '/de', '/es', '/fr'];

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : (process.argv[i + 1] || true);
};

// What the page is showing, read straight from the document.
const SNAPSHOT = () => {
  const rows = [...document.querySelectorAll('.bd-row')];
  const shownRows = rows.filter((r) => !r.hidden);
  const status = document.querySelector('.bd-status');
  const m = status ? /(\d[\d,]*)(?:\s+of\s+(\d[\d,]*))?/.exec(status.textContent || '') : null;
  const claimed = m ? Number((m[2] || m[1]).replace(/,/g, '')) : null;
  const claimedShown = m && m[2] ? Number(m[1].replace(/,/g, '')) : claimed;
  return {
    total: rows.length,
    shown: shownRows.length,
    // Identity in RENDERED order — this is what the reader sees.
    order: shownRows.map((r) => r.getAttribute('data-bd-name') || ''),
    claimedShown,
    url: location.search,
  };
};

// The CSV the export control would produce, without downloading anything.
const CSV_IDS = () => {
  const app = window.__bdTestHooks;
  if (!app || typeof app.csv !== 'function') return null;
  const lines = app.csv().split(/\r?\n/).filter(Boolean);
  return lines.slice(1).map((l) => {
    const cells = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < l.length; i += 1) {
      const ch = l[i];
      if (q) {
        if (ch === '"' && l[i + 1] === '"') { cur += '"'; i += 1; } else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { cells.push(cur); cur = ''; } else cur += ch;
    }
    cells.push(cur);
    return cells;
  });
};

const SET = (sel, value, evt) => {
  const el = document.querySelector(sel);
  if (!el) return false;
  el.value = value;
  el.dispatchEvent(new Event(evt || 'change', { bubbles: true }));
  return true;
};

async function checkPage(page, base, label, failures) {
  await page.goto(base);
  const controls = await page.eval(() => {
    const out = [];
    for (const s of document.querySelectorAll('select[data-bd-facet]')) {
      const values = [...s.options].map((o) => o.value).filter(Boolean);
      if (values.length) out.push({ sel: `select[data-bd-facet="${s.dataset.bdFacet}"]`, values });
    }
    return out;
  });
  if (!controls.length) { console.log(`  ${label}: no facet controls, skipped`); return; }

  const fail = (what, detail) => {
    failures.push(`${label}: ${what} — ${detail}`);
    console.log(`    ✗ ${what}: ${detail}`);
  };

  // ── the count the page claims must equal the rows it renders ────────────
  const agree = async (step) => {
    const s = await page.eval(SNAPSHOT);
    if (s.claimedShown !== null && s.claimedShown !== s.shown) {
      fail(step, `status says ${s.claimedShown}, ${s.shown} rows rendered`);
    }
    return s;
  };

  // ── NARROW, THEN WIDEN AGAIN ───────────────────────────────────────────
  //
  // The sequence that would expose a row placed out of order: hide most of the
  // table, then bring it all back and compare against a freshly loaded page.
  const clean = await page.eval(SNAPSHOT);
  for (let i = 0; i < Math.min(3, controls.length); i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await page.eval(SET, controls[i].sel, controls[i].values[0]);
    // eslint-disable-next-line no-await-in-loop
    await agree(`filter ${i + 1}`);
  }
  for (let i = 0; i < Math.min(3, controls.length); i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await page.eval(SET, controls[i].sel, '');
  }
  const widened = await agree('cleared');
  if (widened.shown !== clean.shown) {
    fail('clear', `restored ${widened.shown} rows, page loaded with ${clean.shown}`);
  }
  if (widened.order.join('|') !== clean.order.join('|')) {
    let at = -1;
    for (let i = 0; i < clean.order.length; i += 1) {
      if (clean.order[i] !== widened.order[i]) { at = i; break; }
    }
    fail('clear', `rendered order differs from a fresh load at position ${at}: `
      + `"${widened.order[at]}" where "${clean.order[at]}" was expected`);
  }

  // ── SORT, THEN FILTER, THEN SORT AGAIN ─────────────────────────────────
  // The page's OWN default sort, read from the control rather than assumed.
  // Setting .value to a string the select does not offer silently selects the
  // first option instead, and on the countries page that is a DIFFERENT
  // comparator from the one the page loads with — which made a correct engine
  // look like it was rendering the wrong order.
  const sortInfo = await page.eval(() => {
    const s = document.querySelector('select[data-bd-sort]');
    if (!s) return null;
    return { initial: s.value, values: [...s.options].map((o) => o.value) };
  });
  const hasDr = !!sortInfo && sortInfo.values.indexOf('domain-rating') !== -1;
  if (hasDr) {
    await page.eval(SET, 'select[data-bd-sort]', 'domain-rating');
    const sorted = await agree('DR sort');
    // Descending, with unmeasured records last and never treated as zero.
    // PER GROUP. Sorting happens within a tbody and never across them — the
    // countries page carries four, and a scan of the whole document reads each
    // boundary as a violation. That is the design, not a defect.
    const perGroup = await page.eval(() => [...document.querySelectorAll('tbody[data-bd-rows]')]
      .map((b) => [...b.querySelectorAll('.bd-row')].filter((r) => !r.hidden).map((r) => {
        const v = r.getAttribute('data-bd-dr');
        return v === null || v === '' ? null : Number(v);
      })));
    perGroup.forEach((drs, gi) => {
      let seenNull = false;
      for (let i = 0; i < drs.length; i += 1) {
        if (drs[i] === null) { seenNull = true; continue; }
        // An unmeasured record is not a zero, so it sorts last rather than
        // lowest — and a measured 0 must still sort above it.
        if (seenNull) {
          fail('DR sort', `group ${gi}: a measured rating (${drs[i]}) sorts after an unmeasured one`);
          return;
        }
        if (i && drs[i - 1] !== null && drs[i] > drs[i - 1]) {
          fail('DR sort', `group ${gi}: not descending at ${i}: ${drs[i - 1]} then ${drs[i]}`);
          return;
        }
      }
    });

    // Filter AFTER sorting: the order must survive.
    await page.eval(SET, controls[0].sel, controls[0].values[0]);
    const afterFilter = await agree('filter after DR sort');
    // A SUBSEQUENCE walk, not an indexOf comparison. Two directories share a
    // name — "Gouden Gids" is a real listing in both Belgium and the
    // Netherlands, and "Appvizer" appears twice — so indexOf finds the first
    // and reports a correct order as broken. The property is that filtering
    // REMOVES rows without reordering the survivors, which is exactly "the
    // filtered sequence is a subsequence of the sorted one".
    let sp = 0;
    for (let i = 0; i < afterFilter.order.length; i += 1) {
      while (sp < sorted.order.length && sorted.order[sp] !== afterFilter.order[i]) sp += 1;
      if (sp >= sorted.order.length) {
        fail('filter after DR sort', `"${afterFilter.order[i]}" is out of the sorted order`);
        break;
      }
      sp += 1;
    }

    // And sorting AFTER filtering.
    await page.eval(SET, 'select[data-bd-sort]', sortInfo.initial);
    await page.eval(SET, 'select[data-bd-sort]', 'domain-rating');
    await agree('DR sort after filter');
    await page.eval(SET, controls[0].sel, '');
    await page.eval(SET, 'select[data-bd-sort]', sortInfo.initial);
  }

  // ── CSV EQUALS WHAT IS ON SCREEN, IN THE SAME ORDER ────────────────────
  await page.eval(SET, controls[0].sel, controls[0].values[0]);
  const shownNow = await agree('csv cohort');
  const csv = await page.eval(CSV_IDS);
  if (csv) {
    if (csv.length !== shownNow.shown) {
      fail('CSV', `${csv.length} data rows for ${shownNow.shown} visible`);
    } else {
      const names = csv.map((c) => c[0]);
      if (names.join('|') !== shownNow.order.join('|')) {
        fail('CSV', 'the exported order differs from the rendered order');
      }
    }
  }

  // ── URL, BACK, FORWARD, RELOAD ─────────────────────────────────────────
  const withFilter = await page.eval(SNAPSHOT);
  if (!withFilter.url) fail('URL', 'a filtered view carries no query string');
  await page.eval(() => window.history.back());
  await new Promise((r) => { setTimeout(r, 350); });
  const back = await page.eval(SNAPSHOT);
  if (back.shown === withFilter.shown && withFilter.shown !== clean.shown) {
    fail('Back', 'the filter was not undone');
  }
  await page.eval(() => window.history.forward());
  await new Promise((r) => { setTimeout(r, 350); });
  const fwd = await page.eval(SNAPSHOT);
  if (fwd.shown !== withFilter.shown) {
    fail('Forward', `restored ${fwd.shown} rows, expected ${withFilter.shown}`);
  }
  // A reload of the same address must produce the same view.
  await page.goto(`${base}${withFilter.url}`);
  const reloaded = await page.eval(SNAPSHOT);
  if (reloaded.shown !== withFilter.shown) {
    fail('reload', `${reloaded.shown} rows from the shared URL, expected ${withFilter.shown}`);
  }
  if (reloaded.order.join('|') !== withFilter.order.join('|')) {
    let at = -1;
    for (let i = 0; i < Math.max(reloaded.order.length, withFilter.order.length); i += 1) {
      if (reloaded.order[i] !== withFilter.order[i]) { at = i; break; }
    }
    fail('reload', `differs at ${at}: shared URL shows "${reloaded.order[at]}", `
      + `the interactive path showed "${withFilter.order[at]}" `
      + `(${reloaded.order.length} vs ${withFilter.order.length} rows)`);
  }

  // ── STRESS: 300 CHANGES, THEN CHECK IT IS STILL RIGHT ──────────────────
  await page.goto(base);
  const stress = await page.eval((ctrls) => {
    const pick = (n) => ctrls[n % ctrls.length];
    for (let i = 0; i < 300; i += 1) {
      const c = pick(i);
      const el = document.querySelector(c.sel);
      el.value = i % 3 === 0 ? '' : c.values[i % c.values.length];
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    for (const c of ctrls) {
      const el = document.querySelector(c.sel);
      el.value = '';
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const rows = [...document.querySelectorAll('.bd-row')];
    return { total: rows.length, shown: rows.filter((r) => !r.hidden).length };
  }, controls);
  if (stress.shown !== clean.shown) {
    fail('300 changes', `settled at ${stress.shown} rows, a fresh load shows ${clean.shown}`);
  }
  const settled = await page.eval(SNAPSHOT);
  if (settled.order.join('|') !== clean.order.join('|')) {
    fail('300 changes', 'the rendered order drifted from a fresh load');
  }

  const errors = await page.eval(() => (window.__consoleErrors || []).slice(0, 3));
  if (errors && errors.length) fail('console', errors.join(' / '));

  console.log(`  ${label}: ${clean.total} rows — checked`);
}

async function run() {
  if (!chromePath()) { console.error('No Chrome.'); process.exit(1); }
  const only = arg('--page');
  const server = await serve(ROOT, ['research', 'js', 'css', 'de', 'es', 'fr']);
  const chrome = await launch({ headless: false });
  const page = await openPage(chrome.wsUrl);
  await page.send('Runtime.evaluate', {
    expression: 'window.__consoleErrors = []; '
      + 'window.addEventListener("error", function (e) { window.__consoleErrors.push(String(e.message)); });',
  }).catch(() => {});

  const failures = [];
  for (const [key, url] of Object.entries(PAGES)) {
    if (only && only !== key) continue;
    console.log(`\n═══ ${key} ═══`);
    for (const loc of LOCALES) {
      // eslint-disable-next-line no-await-in-loop
      await checkPage(page, `http://127.0.0.1:${server.port}${loc}${url}`, `${loc || '/en'}`, failures);
    }
  }

  console.log(`\n${failures.length ? `FAILURES (${failures.length}):` : 'All checks passed.'}`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  try { chrome.proc.kill('SIGKILL'); } catch { /* gone */ }
  try { server.server.close(); } catch { /* gone */ }
  process.exit(failures.length ? 1 : 0);
}

run().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
