'use strict';

// The Distribution Planner, in a real browser.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
//
// The planner shipped with a full Node suite — server/client parity over 96
// campaign states, a byte-identity guard on the shipped engine, a field
// contract derived by recording every property access — and a page that was
// still telling readers the wrong thing. Every one of those tests ran the client
// under `node:vm` against a hand-written DOM, and a shim proves what you
// remembered to model. It cannot fail on a section the client never looks at.
//
// Measured in Chrome against the live site before this change, switching Market
// from United States to United Kingdom:
//
//   summary        United States -> United Kingdom          moved
//   section 3      MerchantCircle/ProvenExpert/Trustpilot
//                  -> Approved Business/Bizify/FreeIndex     moved
//   URL            ?market=united-kingdom                    moved
//   section 2      "Ready to execute - 126 opportunities"    UNCHANGED, 60 rows
//                  led by Alibaba.com, Apple App Store       UNCHANGED
//   section 4      "Needs research - 1473"                   UNCHANGED, 40 rows
//   section 5      "Needs browser verification - 634"        UNCHANGED, 40 rows
//
// 140 rows and three headline counts contradicting the selected state, with zero
// console errors and every asset 200. So the assertions here are IDENTITIES —
// which platforms are on screen — and not counts, because the counts were
// internally consistent the whole time they were wrong.
//
// If there is no Chrome on this machine the file skips rather than fails: a
// missing browser is not a broken planner.

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const { harness, chromePath } = require('./helpers/cdp.cjs');
const I18N = require(path.join(ROOT, 'scripts/lib/i18n.cjs'));
const P = require(path.join(ROOT, 'scripts/lib/distribution-planner.cjs'));
const E = require(path.join(ROOT, 'scripts/lib/dp-engine.cjs'));

const HAVE_CHROME = Boolean(chromePath());
const skip = HAVE_CHROME ? false : 'no Chrome, Chromium or Edge on this machine';

let H = null;
before(async () => { if (HAVE_CHROME) H = await harness(ROOT); });
after(async () => {
  if (!H) return;
  // Chrome can still be flushing its profile directory when the kill lands, and
  // a tidy-up that throws would fail a suite that has already passed.
  await H.close().catch(() => {});
});

// ── what the page says, read as identities ──────────────────────────────────
//
// Serialized in the page and returned whole, so every assertion below compares
// two snapshots of the same shape rather than issuing a dozen round trips that
// could observe the page mid-recompute.
function snapshot() {
  const text = (node) => (node ? node.textContent.replace(/\s+/g, ' ').trim() : null);
  const section = (id) => {
    const host = document.getElementById(id);
    if (!host) return null;
    const rows = Array.prototype.slice.call(host.querySelectorAll('tr[data-dp-status]'));
    return {
      heading: text(host.querySelector('h2')),
      count: rows.length,
      // Name plus market: the identity a reader would check, and enough to tell
      // a United Kingdom queue from a United States one.
      rows: rows.map((tr) => `${text(tr.querySelector('td'))} @${tr.getAttribute('data-dp-country')}`),
      statuses: rows.map((tr) => tr.getAttribute('data-dp-status')),
      cells: rows.length ? rows[0].querySelectorAll('td').length : 0,
    };
  };
  const controls = {};
  Array.prototype.slice.call(document.querySelectorAll('[data-dp-filter]')).forEach((s) => {
    controls[s.getAttribute('data-dp-filter')] = s.value;
  });
  return {
    engine: typeof window.DPEngine !== 'undefined',
    booted: document.querySelector('[data-dp-status]').getAttribute('role') === 'status',
    controls,
    summary: text(document.querySelector('[data-dp-status]')),
    search: window.location.search,
    ready: section('ready'),
    research: section('research'),
    browser: section('browser'),
    health: Array.prototype.slice.call(document.querySelectorAll('#health tbody tr'))
      .map((tr) => text(tr)),
    healthScope: text(document.querySelector('#health [data-dp-scope]')),
    campaign: Array.prototype.slice.call(
      document.querySelectorAll('#campaign [data-dp-group] li strong')
    ).map((n) => text(n)),
  };
}

// The client boots on a fetch, and promotes the summary to a live region only
// once it has rendered. That promotion is the page saying "the client is now
// the one answering", so it is what we wait for.
async function open(url) {
  await H.page.goto(url);
  const deadline = Date.now() + 20000;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const booted = await H.page.eval(() => {
      const el = document.querySelector('[data-dp-status]');
      return Boolean(el) && el.getAttribute('role') === 'status';
    });
    if (booted) break;
    assert.ok(Date.now() < deadline, `the planner never booted at ${url}`);
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { setTimeout(r, 50); });
  }
  return H.page.eval(snapshot);
}

// A control change is synchronous once the payload is in hand — the client
// scores, renders and rewrites the URL inside the change handler — so the
// snapshot taken straight afterwards is the settled page.
async function choose(values) {
  await H.page.eval((wanted) => {
    Object.keys(wanted).forEach((key) => {
      const select = document.querySelector(`[data-dp-filter="${key}"]`);
      select.value = String(wanted[key]);
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }, values);
  return H.page.eval(snapshot);
}

const PLANNER = (locale) => I18N.localizedPath(locale, P.PLANNER_PATH);
const SECTIONS = E.WORKLIST_SECTIONS.map((s) => s.key);

// ── boot ────────────────────────────────────────────────────────────────────

test('the planner boots in every locale with no exception and no console error',
  { skip }, async () => {
    for (const locale of I18N.LOCALE_CODES) {
      const url = H.origin + PLANNER(locale);
      // eslint-disable-next-line no-await-in-loop
      const s = await open(url);
      assert.ok(s.engine, `${locale}: DPEngine is not defined on the page that loads it`);
      assert.ok(s.booted, `${locale}: the client never took over the summary`);
      assert.deepStrictEqual(H.page.errors, [],
        `${locale}: uncaught exception(s): ${H.page.errors.join(' | ')}`);
      const noisy = H.page.console.filter((c) => c.type === 'error' || c.type === 'assert');
      assert.deepStrictEqual(noisy, [], `${locale}: console error(s): ${JSON.stringify(noisy)}`);
      // Six controls, every one of them carrying a value.
      assert.deepStrictEqual(Object.keys(s.controls).sort(),
        [...E.PLANNER_PARAMS].sort(), `${locale}: the six controls are not all present`);
      for (const key of E.PLANNER_PARAMS) {
        assert.ok(s.controls[key], `${locale}: the ${key} control has no value`);
      }
      // And the three worklist sections rendered rows the client can own.
      for (const key of SECTIONS) {
        assert.ok(s[key], `${locale}: section "${key}" is missing`);
      }
    }
  });

test('every asset the page references answers 200, including the payload',
  { skip }, async () => {
    for (const locale of I18N.LOCALE_CODES) {
      // eslint-disable-next-line no-await-in-loop
      await open(H.origin + PLANNER(locale));
      // Third-party requests (analytics, consent, web fonts) are not this
      // build's to serve and are deliberately out of scope; everything the
      // repository publishes must answer.
      const own = H.page.requests.filter((r) => r.url.startsWith(H.origin));
      const bad = own.filter((r) => r.status !== 200);
      assert.deepStrictEqual(bad, [], `${locale}: ${JSON.stringify(bad)}`);
      const urls = own.map((r) => r.url.slice(H.origin.length));
      for (const needed of ['/js/dp-engine.js', '/js/distribution-planner.js',
        `${P.PLANNER_PATH}${P.PLANNER_DATA_FILE}`]) {
        assert.ok(urls.includes(needed), `${locale}: ${needed} was never requested`);
      }
      // A failed load is reported with no URL at all, so it has to be checked
      // separately or it hides inside the origin filter above.
      const failed = H.page.requests.filter((r) => r.error && !/googletagmanager|analytics|doubleclick|cookieyes|webmasterid|fonts\./.test(r.url));
      assert.deepStrictEqual(failed.filter((r) => r.url !== '(failed)'), [],
        `${locale}: a request failed outright`);
    }
  });

test('all six controls are bound: each one moves the state and the URL',
  { skip }, async () => {
    for (const key of E.PLANNER_PARAMS) {
      // eslint-disable-next-line no-await-in-loop
      const before = await open(H.origin + P.PLANNER_PATH);
      // eslint-disable-next-line no-await-in-loop
      const other = await H.page.eval((k) => {
        const select = document.querySelector(`[data-dp-filter="${k}"]`);
        const values = Array.prototype.slice.call(select.options).map((o) => o.value);
        return values.find((v) => v !== select.value);
      }, key);
      assert.ok(other, `the ${key} control offers only one value`);
      // eslint-disable-next-line no-await-in-loop
      const after = await choose({ [key]: other });
      assert.strictEqual(after.controls[key], other, `the ${key} control did not take the value`);
      assert.ok(after.search.includes(`${key}=${encodeURIComponent(other)}`),
        `changing ${key} did not reach the URL: "${after.search}"`);
      assert.notStrictEqual(after.summary, before.summary,
        `changing ${key} left the summary saying exactly what it said before`);
    }
  });

// ── the reported defect ─────────────────────────────────────────────────────

test('changing the market changes the summary, the campaign AND sections 2, 4 and 5',
  { skip }, async () => {
    const us = await open(`${H.origin}${P.PLANNER_PATH}`);
    assert.strictEqual(us.controls.market, E.PLANNER_DEFAULTS.market);
    const uk = await choose({ market: 'united-kingdom' });

    assert.notStrictEqual(uk.summary, us.summary, 'the summary did not follow the market');
    assert.notDeepStrictEqual(uk.campaign, us.campaign, 'the campaign did not follow the market');

    for (const key of SECTIONS) {
      assert.notStrictEqual(uk[key].heading, us[key].heading,
        `section "${key}" keeps a heading that does not name the selected state: `
        + `"${us[key].heading}"`);
      assert.ok(uk[key].heading.includes('United Kingdom'),
        `section "${key}" heading does not name the market: "${uk[key].heading}"`);
      assert.notDeepStrictEqual(uk[key].rows, us[key].rows,
        `section "${key}" shows the identical ${us[key].count} rows for two different markets; `
        + `first three: ${us[key].rows.slice(0, 3).join(', ')}`);
      assert.ok(uk[key].rows.length > 0 && us[key].rows.length > 0,
        `section "${key}" rendered nothing for one of the two markets`);
      // Every row is still the status the section is for.
      const statuses = new Set(uk[key].statuses);
      assert.strictEqual(statuses.size, 1, `section "${key}" mixes statuses: ${[...statuses]}`);
    }

    // The specific thing a reader would notice: a United Kingdom queue led by
    // United Kingdom platforms, where the shipped page led with Alibaba.com and
    // Apple App Store whatever was selected.
    assert.ok(uk.ready.rows.slice(0, 5).some((r) => r.endsWith('@united-kingdom')),
      `no United Kingdom platform in the top five of a United Kingdom ready queue: `
      + `${uk.ready.rows.slice(0, 5).join(', ')}`);

    // Section 6 is a catalogue fact and legitimately does not move — and says so
    // rather than sitting numbered and silent under the builder.
    assert.deepStrictEqual(uk.health, us.health, 'collection health moved with the market');
    assert.ok(uk.healthScope && /do not move with the six controls/.test(uk.healthScope),
      `the health section does not state that it is not a builder output: "${uk.healthScope}"`);
  });

test('the summary and section 2 count the same eligible set, in the browser',
  { skip }, async () => {
    // The two used to be computed over different populations, which is how a
    // page can be internally consistent and still wrong. At the default
    // evidence level the eligible set the summary reports IS the ready queue.
    await open(`${H.origin}${P.PLANNER_PATH}`);
    for (const state of [{ market: 'united-kingdom' }, { market: '*' },
      { business: 'b2b-saas', objective: 'pr-coverage', budget: 'paid-allowed' },
      { business: 'ecommerce', objective: 'marketplace-exposure', budget: 'free-only' }]) {
      // eslint-disable-next-line no-await-in-loop
      const s = await choose({ evidence: 'ready', ...state });
      const eligible = /(\d+) opportunit(?:y is|ies are) eligible/.exec(s.summary);
      assert.ok(eligible, `the summary states no eligible count: "${s.summary}"`);
      const heading = /— (\d+) of (\d+) eligible/.exec(s.ready.heading);
      assert.ok(heading, `the ready heading states no counts: "${s.ready.heading}"`);
      assert.strictEqual(heading[1], eligible[1],
        `the summary says ${eligible[1]} eligible and section 2 says ${heading[1]}: `
        + `${JSON.stringify(state)}`);
    }
  });

test('changing the evidence level changes the campaign and deliberately not the worklist',
  { skip }, async () => {
    const ready = await open(`${H.origin}${P.PLANNER_PATH}`);
    // "High confidence only" is the level that visibly moves the campaign:
    // widening to "Everything" adds a thousand candidates that all score below
    // the ready ones, so the top 25 are the same 25 — which is the diversifier
    // working, not the control being ignored, and the summary's eligible count
    // says so. Both are asserted, because only asserting the wide case would
    // pass on a control that did nothing.
    const high = await choose({ evidence: 'high' });
    assert.notDeepStrictEqual(high.campaign, ready.campaign,
      'the evidence control did not change which platforms are in the campaign');
    assert.notStrictEqual(high.summary, ready.summary, 'the summary ignored the evidence level');
    const all = await choose({ evidence: 'all' });
    assert.notStrictEqual(all.summary, ready.summary,
      'the summary reports the same eligible set at every evidence level');
    // DECIDED, not overlooked: the evidence level is the campaign's admission
    // floor. Sections 4 and 5 are what show the reader what that floor is
    // holding back, so scoping them by it would empty both at the DEFAULT level
    // and the page would report no research debt for a state that has over a
    // thousand rows of it. The engine documents this beside worklist().
    for (const key of SECTIONS) {
      for (const [level, snap] of [['high', high], ['all', all]]) {
        assert.deepStrictEqual(snap[key].rows, ready[key].rows,
          `section "${key}" was scoped by the evidence floor at "${level}", so the page `
          + 'can hide its own research debt at the default evidence level');
        assert.deepStrictEqual(snap[key].heading, ready[key].heading);
      }
    }
    // But a control that changes the eligible set moves them all.
    const other = await choose({ business: 'b2b-saas', objective: 'pr-coverage' });
    for (const key of SECTIONS) {
      assert.notDeepStrictEqual(other[key].rows, all[key].rows,
        `section "${key}" ignored the business and objective`);
    }
  });

// ── the URL is the state, and the state is the URL ──────────────────────────

test('a shared URL restores the controls AND every output', { skip }, async () => {
  const built = await open(`${H.origin}${P.PLANNER_PATH}`);
  const state = { business: 'ai-startup', objective: 'pr-coverage', market: 'germany',
    budget: 'paid-allowed', size: '50', evidence: 'research' };
  const composed = await choose(state);
  assert.ok(composed.search, 'a non-default state did not produce a shareable URL');
  assert.notDeepStrictEqual(composed.ready.rows, built.ready.rows);

  const shared = await open(H.origin + P.PLANNER_PATH + composed.search);
  assert.deepStrictEqual(shared.controls, composed.controls,
    'the shared URL did not restore the controls');
  assert.strictEqual(shared.summary, composed.summary,
    'the shared URL restored a different summary');
  assert.deepStrictEqual(shared.campaign, composed.campaign,
    'the shared URL restored a different campaign');
  for (const key of SECTIONS) {
    assert.deepStrictEqual(shared[key].rows, composed[key].rows,
      `the shared URL restored section "${key}" with different rows`);
    assert.strictEqual(shared[key].heading, composed[key].heading,
      `the shared URL restored section "${key}" with a different heading`);
  }

  // A hostile or stale parameter falls back to the default rather than reaching
  // the engine, and the page it produces is the default page.
  const hostile = await open(`${H.origin}${P.PLANNER_PATH}?business=<script>&market=atlantis`
    + '&objective=nonsense&budget=free&size=9999&evidence=whatever');
  assert.deepStrictEqual(hostile.controls, built.controls,
    'a hostile query moved the controls somewhere the reader could not have');
  for (const key of SECTIONS) {
    assert.deepStrictEqual(hostile[key].rows, built[key].rows,
      `a hostile query changed section "${key}"`);
  }
});

test('history back and forward restore the controls and the outputs together',
  { skip }, async () => {
    const us = await open(`${H.origin}${P.PLANNER_PATH}`);
    const uk = await choose({ market: 'united-kingdom' });
    const de = await choose({ market: 'germany' });
    assert.notDeepStrictEqual(de.ready.rows, uk.ready.rows);

    const go = async (direction) => {
      await H.page.eval((d) => { window.history[d](); }, direction);
      // popstate is delivered on the next task; the handler itself is
      // synchronous, so one turn of the event loop is enough.
      await new Promise((r) => { setTimeout(r, 250); });
      return H.page.eval(snapshot);
    };

    const back1 = await go('back');
    assert.strictEqual(back1.controls.market, 'united-kingdom',
      `back left the market control on "${back1.controls.market}"`);
    assert.deepStrictEqual(back1.ready.rows, uk.ready.rows, 'back restored the wrong ready queue');
    assert.deepStrictEqual(back1.research.rows, uk.research.rows);
    assert.deepStrictEqual(back1.browser.rows, uk.browser.rows);
    assert.strictEqual(back1.summary, uk.summary);
    assert.deepStrictEqual(back1.campaign, uk.campaign);

    const back2 = await go('back');
    assert.strictEqual(back2.controls.market, us.controls.market);
    assert.deepStrictEqual(back2.ready.rows, us.ready.rows,
      'back to the first entry did not restore the first page');

    const forward = await go('forward');
    assert.strictEqual(forward.controls.market, 'united-kingdom');
    assert.deepStrictEqual(forward.ready.rows, uk.ready.rows,
      'forward restored controls and rows that disagree');
    assert.strictEqual(forward.ready.heading, uk.ready.heading);
  });

// ── the page without the client ─────────────────────────────────────────────

test('with JavaScript disabled the page still describes the state it was built in',
  { skip }, async () => {
    // The real no-JS reader, not an approximation of one: the same bytes, served
    // over the same connection, with script execution off in the browser.
    await H.page.send('Emulation.setScriptExecutionDisabled', { value: true });
    try {
      await H.page.goto(`${H.origin}${P.PLANNER_PATH}`);
      const server = await H.page.eval(() => {
        const rows = (id) => Array.prototype.slice.call(
          document.querySelectorAll(`#${id} tr[data-dp-status]`)
        ).map((tr) => `${tr.querySelector('td').textContent.trim()} @${tr.getAttribute('data-dp-country')}`);
        const heading = (id) => document.querySelector(`#${id} h2`).textContent.replace(/\s+/g, ' ').trim();
        return {
          ready: { rows: rows('ready'), heading: heading('ready') },
          research: { rows: rows('research'), heading: heading('research') },
          browser: { rows: rows('browser'), heading: heading('browser') },
          summary: document.querySelector('[data-dp-status]').textContent.replace(/\s+/g, ' ').trim(),
          live: document.querySelector('[data-dp-status]').getAttribute('aria-live'),
        };
      });
      assert.strictEqual(server.live, null,
        'the summary ships as a live region on a page where it can never change');

      // What the server rendered is what the engine says about the default
      // state — checked here rather than trusted, because "the generator and the
      // client agree" is the property this whole change is about.
      const ops = P.project(P.loadAll());
      const wl = P.worklist(ops, E.PLANNER_DEFAULTS);
      for (const key of SECTIONS) {
        assert.strictEqual(server[key].rows.length, wl.byKey[key].rows.length,
          `${key}: the no-JS page renders a different number of rows from the engine`);
        assert.ok(server[key].heading.includes(`of ${wl.totalEligible} eligible opportunities`),
          `${key}: the no-JS heading does not state this state's eligible set: `
          + `"${server[key].heading}"`);
        assert.ok(server[key].heading.includes(String(wl.byKey[key].total)),
          `${key}: the no-JS heading does not state the derived count`);
      }
      assert.ok(server.ready.rows.length > 0, 'the no-JS page has an empty ready queue');
      assert.ok(server.summary.includes('eligible'), 'the no-JS summary states no result');
    } finally {
      await H.page.send('Emulation.setScriptExecutionDisabled', { value: false });
    }
  });
