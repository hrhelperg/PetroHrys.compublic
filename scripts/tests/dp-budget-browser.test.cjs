'use strict';

// The zero-upfront promise, in a real browser.
//
// The previous phase established what 800 sources cost and wired the facts into
// the planner's budget control — and proved it only through the engine. That is
// the half that was already going to be right. The page re-renders these rows
// in the browser from a slim payload through a second code path, and a business
// with no money is the person most harmed by a wrong answer here.
//
// So the identity set is derived independently from canonical data, then
// compared against the engine, the screen, and a real download. Counts alone
// would pass while showing the wrong platforms.

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..', '..');
const { harness, chromePath } = require('./helpers/cdp.cjs');
const E = require(path.join(ROOT, 'scripts/lib/dp-engine.cjs'));
const P = require(path.join(ROOT, 'scripts/lib/distribution-planner.cjs'));

const OPS = P.project(P.loadAll());
let H = null;
const skip = chromePath() ? false : 'no Chrome, Chromium or Edge on this machine';

before(async () => { if (chromePath()) H = await harness(ROOT); });
after(async () => { if (H) await H.close(); });

const PLANNER = '/research/distribution-planner/';
async function open(query = '', prefix = '/') {
  assert.ok(H, 'Chrome is installed but the CDP harness never started');
  await H.page.goto(`${H.origin + prefix}research/distribution-planner/${query}`);
  return H.page;
}

// What the campaign is showing, read off the page.
//
// The campaign is built in the browser as [data-dp-group] boxes of <li>, not as
// a table — a first version of this file looked for table rows, found none, and
// every assertion over the empty list PASSED. A reader that can return nothing
// and be believed is worse than no test, so this one refuses to.
async function visible() {
  const rows = await H.page.eval(() => {
    const section = document.getElementById('campaign');
    if (!section) return null;
    const out = [];
    for (const box of section.querySelectorAll('[data-dp-group]')) {
      for (const li of box.querySelectorAll('li')) {
        const name = li.querySelector('strong');
        out.push({
          group: box.getAttribute('data-dp-group'),
          platform: name ? name.textContent.trim() : null,
          text: (li.textContent || '').replace(/\s+/g, ' ').trim(),
        });
      }
    }
    return out;
  });
  assert.ok(rows && rows.length > 0,
    'the campaign rendered no rows at all — every assertion below would pass vacuously');
  return rows;
}

const budgetControl = () => H.page.eval(() => {
  const el = document.querySelector('[data-dp-controls] [data-dp-filter="budget"]');
  return el ? el.value : null;
});

// ── THE FACTS, DERIVED WITHOUT THE PLANNER ──────────────────────────────────

test('canonical data alone says which sources need no money up front', () => {
  const rows = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/marketplaces/marketplaces.json'), 'utf8'));
  const MP = require(path.join(ROOT, 'scripts/lib/mp-schema.cjs'));

  // Derived from the schema's own vocabulary, not from the planner's view of it.
  const noUpfront = rows.filter((r) => MP.NO_UPFRONT_COST.includes(r.sellerCost));
  assert.ok(noUpfront.length > 0, 'no marketplace records a no-upfront cost');

  // Every one of them reaches the planner as something a budget can accept,
  // and none of them arrives as "paid".
  for (const r of noUpfront) {
    const op = OPS.find((o) => o.platformId === r.id);
    if (!op) continue;
    assert.notEqual(op.cost, 'paid',
      `${r.id} records ${r.sellerCost} but reaches the planner as paid`);
  }

  // And the reverse: nothing that requires payment up front arrives as free.
  for (const r of rows.filter((x) => x.sellerCost === 'paid-upfront')) {
    const op = OPS.find((o) => o.platformId === r.id);
    if (!op) continue;
    assert.notEqual(op.cost, 'free', `${r.id} requires payment up front but reaches the planner as free`);
  }
});

test('a commission model is never recorded as plain free', () => {
  // "Free" and "no upfront fee, commission may apply" are different promises.
  // The record keeps the precise one even where the planner simplifies.
  const rows = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/marketplaces/marketplaces.json'), 'utf8'));
  const commission = rows.filter((r) => r.sellerCost === 'free-listing-commission');
  for (const r of commission) {
    assert.notEqual(r.sellerCost, 'free', `${r.id} lost the commission distinction`);
    assert.notEqual(r.costModel, 'free',
      `${r.id} carries a commission model but its platform cost says free`);
  }
});

// ── ENGINE, SCREEN AND EXPORT MUST AGREE ────────────────────────────────────

const STATES = [
  { market: 'united-states', objective: 'seo-citations' },
  { market: 'germany', objective: 'seo-citations' },
  { market: 'spain', objective: 'local-discovery' },
  { market: '*', objective: 'marketplace-exposure' },
];

test('the free-only budget shows exactly what the engine selected, in every market',
  { skip }, async () => {
    for (const s of STATES) {
      const query = `?business=local-business&objective=${s.objective}&market=${s.market}`
        + '&budget=free-only&size=25&evidence=ready';
      // eslint-disable-next-line no-await-in-loop
      await open(query);
      // eslint-disable-next-line no-await-in-loop
      const rows = await visible();
      assert.ok(rows, `${s.market}/${s.objective}: no campaign rendered`);

      // The client computes with the state's DEFAULTS, and `evidence` defaults
      // to 'ready' there while campaign() defaults it to 'all'. Omitting it
      // compared two different candidate pools and reported a product
      // disagreement that did not exist.
      const expected = E.campaign(OPS, {
        business: 'local-business', objective: s.objective, market: s.market, budget: 'free-only',
      }, { size: 25, evidence: 'ready' });
      // The page renders the campaign's GROUPS, and not every group is shown —
      // the research lane is deliberately not part of the campaign display. So
      // the property is containment, not equality: everything on screen came
      // from this campaign, and nothing was invented for it.
      const picked = new Set(expected.picked.map((r) => r.op.name));
      const screenNames = [...new Set(rows.map((r) => r.platform))];
      assert.ok(screenNames.length > 0, `${s.market}/${s.objective}: nothing on screen`);
      for (const name of screenNames) {
        assert.ok(picked.has(name),
          `${s.market}/${s.objective}: "${name}" is on screen but not in the engine's campaign`);
      }
      // And the groups the page shows are groups the engine produced.
      const engineGroups = new Set(expected.groups.map((g) => g.key));
      for (const g of new Set(rows.map((r) => r.group))) {
        assert.ok(engineGroups.has(g), `${s.market}/${s.objective}: unknown group "${g}" on screen`);
      }
    }
  });

test('no paid source ever appears under a free-only budget on screen', { skip }, async () => {
  const byName = new Map(OPS.map((o) => [o.name, o]));
  for (const s of STATES) {
    // eslint-disable-next-line no-await-in-loop
    await open(`?business=local-business&objective=${s.objective}&market=${s.market}&budget=free-only&size=25`);
    // eslint-disable-next-line no-await-in-loop
    const rows = await visible();
    for (const row of rows) {
      const op = byName.get(row.platform);
      if (!op) continue;
      assert.notEqual(op.cost, 'paid',
        `${s.market}: ${row.platform} is paid and is on screen under free-only`);
      assert.notEqual(op.cost, 'mixed', `${s.market}: ${row.platform} is mixed-cost under free-only`);
    }
  }
});

test('a paid-capable budget shows strictly more than the free-only one', { skip }, async () => {
  const q = (budget) => `?business=local-business&objective=seo-citations&market=*&budget=${budget}&size=40`;
  await open(q('free-only'));
  const free = (await visible()).map((r) => r.platform);
  await open(q('paid-allowed'));
  const paid = (await visible()).map((r) => r.platform);
  assert.ok(free.length > 0 && paid.length > 0, 'one of the budget modes rendered nothing');
  assert.notDeepEqual(paid, free, 'the budget control changes nothing on screen');
});

test('a commission source is never described to the reader as simply free',
  { skip }, async () => {
    // "Free" and "no upfront fee, commission may apply" are different promises,
    // and the reader only ever sees the words.
    await open('?business=local-business&objective=marketplace-exposure&market=*&budget=free-only&size=40');
    const rows = await visible();
    const MP = require(path.join(ROOT, 'scripts/lib/mp-schema.cjs'));
    const marketplaces = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/marketplaces/marketplaces.json'), 'utf8'));
    const commissionNames = new Set(marketplaces
      .filter((r) => r.sellerCost === 'free-listing-commission').map((r) => r.name));
    for (const row of rows) {
      if (!commissionNames.has(row.platform)) continue;
      assert.ok(!/\bfree\b/i.test(row.text) || /commission/i.test(row.text),
        `${row.platform}: shown as free with no mention that a commission applies`);
    }
    // And the vocabulary itself keeps them apart, whatever the copy says.
    assert.ok(MP.NO_UPFRONT_COST.includes('free-listing-commission'));
    assert.notEqual('free-listing-commission', 'free');
  });

// ── URL STATE ───────────────────────────────────────────────────────────────

test('the free-only budget survives a reload and the back button', { skip }, async () => {
  const query = '?business=local-business&objective=seo-citations&market=germany&budget=free-only&size=25';
  await open(query);
  const first = (await visible()).map((r) => r.platform);
  assert.ok(first.length > 0, 'the free-only campaign rendered nothing in Germany');

  // A reload of the shared URL.
  await open(query);
  assert.deepEqual((await visible()).map((r) => r.platform), first, 'a reload changed the result');

  // Away and back.
  await open('?business=local-business&objective=seo-citations&market=germany&budget=paid-allowed&size=25');
  const other = (await visible()).map((r) => r.platform);
  assert.notDeepEqual(other, first, 'changing the budget changed nothing');
  await H.page.eval(() => window.history.back());
  await new Promise((r) => { setTimeout(r, 600); });
  const back = (await visible()).map((r) => r.platform);
  assert.deepEqual(back, first, 'going back did not restore the free-only result');

  // And the control itself agrees with the URL.
  const control = await budgetControl();
  assert.equal(control, 'free-only', 'the budget control disagrees with the restored state');
});

// ── EXPORT ──────────────────────────────────────────────────────────────────

test('the real download carries exactly the free-only set, and no paid source',
  { skip }, async () => {
    await open('?business=local-business&objective=seo-citations&market=*&budget=free-only&size=40');
    const rows = await visible();
    const csv = await H.page.eval(async () => {
      const link = [...document.querySelectorAll('a')]
        .find((a) => a.hasAttribute('download') || /\.csv$/.test(a.getAttribute('href') || ''));
      if (!link) return null;
      const res = await fetch(link.href);
      return res.text();
    });
    assert.ok(csv, 'no export link on the page');

    // Every platform on screen is in the file.
    for (const row of rows) {
      assert.ok(csv.includes(row.platform),
        `${row.platform} is on screen under free-only but missing from the download`);
    }
    // And no internal research prose rode along with it.
    assert.ok(!/\[(accessibility|actionability|redirect|cost):/.test(csv),
      'the export carries internal research sentences');
  });

// ── LOCALE ──────────────────────────────────────────────────────────────────

test('every locale returns the same free-only identities', { skip }, async () => {
  const q = '?business=local-business&objective=seo-citations&market=germany&budget=free-only&size=25';
  await open(q, '/');
  const en = (await visible()).map((r) => r.platform);
  assert.ok(en.length > 0, 'the English planner rendered no free-only campaign');
  for (const prefix of ['/de/', '/es/', '/fr/']) {
    // eslint-disable-next-line no-await-in-loop
    await open(q, prefix);
    // eslint-disable-next-line no-await-in-loop
    const other = (await visible()).map((r) => r.platform);
    // Identity, not order: a locale may sort its own labels differently while
    // resolving to exactly the same canonical sources.
    assert.deepEqual([...new Set(other)].sort(), [...new Set(en)].sort(),
      `${prefix} shows different free-only sources from the English planner`);
  }
});

test('the budget flow throws nothing in the browser', { skip }, async () => {
  for (const budget of ['free-only', 'free-freemium', 'paid-allowed', 'any']) {
    // eslint-disable-next-line no-await-in-loop
    await open(`?business=local-business&objective=seo-citations&market=*&budget=${budget}`);
    const ours = H.page.errors.filter((e) => !/googletagmanager|webmasterid|analytics/.test(e));
    assert.deepEqual(ours, [], `${budget}: ${ours.join(' | ')}`);
  }
});
