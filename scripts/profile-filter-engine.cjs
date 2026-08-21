#!/usr/bin/env node
// scripts/profile-filter-engine.cjs
'use strict';

// Measuring the filter engine before changing it.
//
// The complaint is that the first filter is fine and the second and third are
// not. That shape — fine once, slow repeatedly — usually means per-interaction
// work proportional to the row count, so this counts the work rather than
// guessing at it: DOM reads, DOM writes, tree walks, sorts, and wall-clock for
// each interaction on the real generated pages.
//
//   node scripts/profile-filter-engine.cjs
//   node scripts/profile-filter-engine.cjs --page countries
//
// Nothing in the build or the test suite invokes this file.

const path = require('node:path');
const { serve, launch, openPage, chromePath } = require('./tests/helpers/cdp.cjs');

const ROOT = path.resolve(__dirname, '..');

const PAGES = {
  directories: { url: '/research/business-directories/opportunities/', label: 'Business Directories' },
  countries: { url: '/research/countries/', label: 'Country Source Intelligence' },
  media: { url: '/research/media-pr-publishing/', label: 'Media, PR & Publishing' },
  marketplaces: { url: '/research/marketplaces/', label: 'Marketplaces' },
  tenders: { url: '/research/tenders-procurement/', label: 'Tender Platforms' },
  // Its own client and its own controls, so it is measured on its own terms
  // rather than assumed to behave like the shared engine.
  planner: { url: '/research/distribution-planner/', label: 'Distribution Planner', dp: true },
};

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : (process.argv[i + 1] || true);
};

// Counters are installed AFTER load, so they measure one interaction rather
// than initialisation. Init is timed separately from the navigation itself.
const INSTRUMENT = () => {
  const w = window;
  w.__prof = { getAttr: 0, setAttr: 0, hiddenGet: 0, hiddenSet: 0, closest: 0, querySelectorAll: 0 };
  const ep = Element.prototype;
  const origGet = ep.getAttribute;
  ep.getAttribute = function (n) { w.__prof.getAttr += 1; return origGet.call(this, n); };
  const origSet = ep.setAttribute;
  ep.setAttribute = function (n, v) { w.__prof.setAttr += 1; return origSet.call(this, n, v); };
  const origClosest = ep.closest;
  ep.closest = function (s) { w.__prof.closest += 1; return origClosest.call(this, s); };
  const origQsa = ep.querySelectorAll;
  ep.querySelectorAll = function (s) { w.__prof.querySelectorAll += 1; return origQsa.call(this, s); };
  // `hidden` is the property the engine writes per row. Counting it separately
  // matters because a write that changes nothing still invalidates style.
  const d = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'hidden');
  Object.defineProperty(HTMLElement.prototype, 'hidden', {
    get() { w.__prof.hiddenGet += 1; return d.get.call(this); },
    set(v) { w.__prof.hiddenSet += 1; return d.set.call(this, v); },
    configurable: true,
  });
};

const RESET = () => {
  window.__prof = {
    getAttr: 0, setAttr: 0, hiddenGet: 0, hiddenSet: 0, closest: 0, querySelectorAll: 0,
  };
};

// One interaction: set a control, dispatch change, wait for the engine to
// settle, and report the time the page spent on it.
const INTERACT = (sel, value) => {
  const el = document.querySelector(sel);
  if (!el) return { skipped: sel };
  if ('value' in el) el.value = value;
  const t0 = performance.now();
  el.dispatchEvent(new Event('change', { bubbles: true }));
  const t1 = performance.now();
  const rows = document.querySelectorAll('.bd-row');
  let shown = 0;
  for (const r of rows) if (!r.hidden) shown += 1;
  return { ms: +(t1 - t0).toFixed(1), shown, prof: { ...window.__prof } };
};

async function run() {
  if (!chromePath()) { console.error('No Chrome.'); process.exit(1); }
  const only = arg('--page');
  const server = await serve(ROOT, ['research', 'js', 'css', 'de', 'es', 'fr']);
  const chrome = await launch({ headless: false });
  const page = await openPage(chrome.wsUrl);

  for (const [key, meta] of Object.entries(PAGES)) {
    if (only && only !== key) continue;
    const url = `http://127.0.0.1:${server.port}${meta.url}`;

    // ── INIT ────────────────────────────────────────────────────────────
    const t0 = Date.now();
    await page.goto(url);
    // The engine runs on DOMContentLoaded; this measures the page being usable.
    const init = await page.eval(() => {
      const nav = performance.getEntriesByType('navigation')[0] || {};
      return {
        rows: document.querySelectorAll('.bd-row').length,
        domInteractive: Math.round(nav.domInteractive || 0),
        domComplete: Math.round(nav.domComplete || 0),
        scripts: performance.getEntriesByType('resource')
          .filter((r) => r.name.endsWith('.js'))
          .reduce((a, r) => a + r.duration, 0),
      };
    });
    const wall = Date.now() - t0;
    if (!init.rows && !meta.dp) { console.log(`\n${meta.label}: no rows, skipped`); continue; }
    if (meta.dp) {
      // Its rows arrive with the payload, so wait for them before measuring.
      // eslint-disable-next-line no-await-in-loop
      for (let w = 0; w < 40; w += 1) {
        // eslint-disable-next-line no-await-in-loop
        const n = await page.eval(() => document.querySelectorAll('[data-dp-row], .bd-row').length);
        if (n > 0) { init.rows = n; break; }
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => { setTimeout(r, 250); });
      }
    }

    console.log(`\n═══ ${meta.label} — ${init.rows} rows ═══`);
    console.log(`  init: navigation ${wall}ms, domInteractive ${init.domInteractive}ms, `
      + `domComplete ${init.domComplete}ms`);

    await page.eval(INSTRUMENT);

    // ── THE CONTROLS THIS PAGE ACTUALLY OFFERS ──────────────────────────
    const controls = await page.eval(() => {
      const out = [];
      for (const s of document.querySelectorAll('select[data-dp-filter]')) {
        const values = [...s.options].map((o) => o.value).filter(Boolean);
        if (values.length) out.push({ sel: `select[data-dp-filter="${s.dataset.dpFilter}"]`, values });
      }
      if (out.length) return out;
      for (const s of document.querySelectorAll('select[data-bd-facet], select[data-bd-min-dr], '
        + 'select[data-bd-sort], select[data-bd-link-type], select[data-bd-jurisdiction-select]')) {
        const values = [...s.options].map((o) => o.value).filter(Boolean);
        const attr = [...s.attributes].map((a) => a.name).find((n) => n.startsWith('data-bd-'));
        out.push({ sel: `select[${attr}${s.dataset.bdFacet ? `="${s.dataset.bdFacet}"` : ''}]`, values });
      }
      return out;
    });
    const usable = controls.filter((c) => c.values.length);

    // ── ONE FILTER AT A TIME, COMPOSED ──────────────────────────────────
    const steps = [];
    for (let n = 0; n < Math.min(5, usable.length); n += 1) {
      const c = usable[n];
      // eslint-disable-next-line no-await-in-loop
      await page.eval(RESET);
      // eslint-disable-next-line no-await-in-loop
      const r = await page.eval(INTERACT, c.sel, c.values[0]);
      steps.push({ n: n + 1, ...r });
      const p = r.prof || {};
      console.log(`  filter ${n + 1}: ${String(r.ms).padStart(7)}ms  shown ${String(r.shown).padStart(5)}`
        + `  getAttr ${String(p.getAttr).padStart(6)}  hidden.set ${String(p.hiddenSet).padStart(5)}`
        + `  hidden.get ${String(p.hiddenGet).padStart(6)}  closest ${String(p.closest).padStart(5)}`);
    }

    // ── SORT AFTER FILTERS ──────────────────────────────────────────────
    const sortCtl = controls.find((c) => c.sel.includes('sort'));
    if (sortCtl && sortCtl.values.includes('domain-rating')) {
      await page.eval(RESET);
      const r = await page.eval(INTERACT, 'select[data-bd-sort]', 'domain-rating');
      console.log(`  DR sort:  ${String(r.ms).padStart(7)}ms  shown ${String(r.shown).padStart(5)}`
        + `  getAttr ${String(r.prof.getAttr).padStart(6)}  hidden.get ${String(r.prof.hiddenGet).padStart(6)}`);
    }

    // ── SEARCH ──────────────────────────────────────────────────────────
    await page.eval(RESET);
    const search = await page.eval(() => {
      const el = document.querySelector('[data-bd-search]');
      if (!el) return { skipped: true };
      el.value = 'a';
      const t0b = performance.now();
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return { ms: +(performance.now() - t0b).toFixed(1), prof: { ...window.__prof } };
    });
    if (!search.skipped) {
      console.log(`  search:   ${String(search.ms).padStart(7)}ms`
        + `  getAttr ${String(search.prof.getAttr).padStart(6)}`);
    }

    // ── STRESS: DOES REPEATED INTERACTION ACCUMULATE WORK? ──────────────
    if (usable.length) {
      const stress = await page.eval((sel, values) => {
        const el = document.querySelector(sel);
        const times = [];
        for (let i = 0; i < 100; i += 1) {
          el.value = values[i % values.length] || '';
          const s = performance.now();
          el.dispatchEvent(new Event('change', { bubbles: true }));
          times.push(performance.now() - s);
        }
        const first10 = times.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
        const last10 = times.slice(-10).reduce((a, b) => a + b, 0) / 10;
        times.sort((a, b) => a - b);
        return {
          median: +times[50].toFixed(1),
          p95: +times[95].toFixed(1),
          first10: +first10.toFixed(1),
          last10: +last10.toFixed(1),
          memory: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
        };
      }, usable[0].sel, usable[0].values.concat(['']));
      console.log(`  100 changes: median ${stress.median}ms  p95 ${stress.p95}ms  `
        + `first10 avg ${stress.first10}ms  last10 avg ${stress.last10}ms`
        + `  drift ${(stress.last10 - stress.first10).toFixed(1)}ms`
        + (stress.memory ? `  heap ${stress.memory}MB` : ''));
    }
  }

  try { chrome.proc.kill('SIGKILL'); } catch { /* gone */ }
  try { server.server.close(); } catch { /* gone */ }
  process.exit(0);
}

run().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
