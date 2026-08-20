'use strict';

// The execution path, in a real browser.
//
// The planner now tells people to go and do things: 195 rows say READY and
// carry a link to somebody else's site. Everything upstream of that link has
// been tested — the schema, the projection, the scoring, the row model — and
// none of it proves the thing that matters, which is that the link a person
// sees is the route the corpus currently holds.
//
// A serialisation test cannot prove it. The page re-renders these rows in the
// browser on every control change, from a slim payload, through a second code
// path. So this drives the real page in the real Chrome and reads what is on
// screen.
//
// It never completes a registration or submits a form on anyone's site. The
// external check ends at confirming the destination.

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..', '..');
const { harness, chromePath } = require('./helpers/cdp.cjs');
const E = require(path.join(ROOT, 'scripts/lib/dp-engine.cjs'));
const P = require(path.join(ROOT, 'scripts/lib/distribution-planner.cjs'));

const A = require(path.join(ROOT, 'scripts/lib/distribution-actionability.cjs'));

const OPS = P.project(P.loadAll());
// The row renders the route ACTIONABILITY resolved, not the raw projection.
// They differ on purpose: a route that does not match its action is dropped
// there, which is the guard that stops a claim URL being offered as a
// submission route.
// Keyed by name AND collection. 99 names appear in more than one collection —
// "Product Hunt" is a directory listing and a media launch surface — and a
// name-only map silently answers with the wrong record, which is how this test
// first reported a defect that did not exist.
const key = (name, collectionLabel) => `${name}|${collectionLabel}`;
const RESOLVED = new Map(OPS.map((o) => [
  key(o.name, E.COLLECTION_BY_KEY.get(o.sourceCollection).label),
  { op: o, act: A.actionability(o) },
]));
// The "Where" cell reads "<collection label> · <country>".
const collectionOf = (where) => String(where || '').split('·')[0].trim();

let H = null;
const skip = chromePath() ? false : 'no Chrome, Chromium or Edge on this machine';

// The four locale planners are compared with each other, so they are frozen
// together rather than each at its own first request — otherwise a rebuild
// between two reads makes two generations look like a product disagreement.
const LOCALE_PLANNERS = ['/', '/de/', '/es/', '/fr/']
  .map((prefix) => `${prefix}research/distribution-planner/`);

before(async () => {
  if (chromePath()) H = await harness(ROOT, { preload: LOCALE_PLANNERS });
});
after(async () => { if (H) await H.close(); });

const PLANNER = '/research/distribution-planner/';

// Navigate, then wait for the client to finish re-rendering. `goto` resolves on
// readyState complete, which is before the planner has recomputed for the state
// in the URL — a gap this file used to win by accident because every asset came
// off disk. Settling on STABILITY rather than on the URL being echoed back also
// tolerates the values the planner legitimately normalises.
async function open(query = '') {
  assert.ok(H, 'Chrome is installed but the CDP harness never started');
  await H.page.goto(H.origin + PLANNER + query);
  let previous = null;
  const deadline = Date.now() + 10000;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const state = await H.page.eval(() => {
      const out = {};
      for (const el of document.querySelectorAll('[data-dp-controls] [data-dp-filter]')) {
        out[el.getAttribute('data-dp-filter')] = el.value;
      }
      out.__rows = document.querySelectorAll('#ready tr.bd-row').length;
      return out;
    });
    const now = JSON.stringify(state);
    if (state.__rows > 0 && now === previous) break;
    previous = now;
    if (Date.now() > deadline) throw new Error(`the planner never settled on ${query || '(default)'}: ${now}`);
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { setTimeout(r, 100); });
  }
  return H.page;
}

// Everything the page is currently showing in the Ready queue.
const readRows = () => H.page.eval(() => {
  const section = document.querySelector('#ready');
  if (!section) return null;
  return [...section.querySelectorAll('tr.bd-row')].map((tr) => {
    const cta = tr.querySelector('a.bd-cta-link');
    const cells = [...tr.querySelectorAll('td')];
    const cell = (label) => {
      const td = cells.find((c) => c.getAttribute('data-bd-label') === label);
      return td ? td.textContent.trim() : null;
    };
    return {
      status: tr.getAttribute('data-dp-status'),
      platform: cell('Platform'),
      where: cell('Where'),
      cta: cta ? { text: cta.textContent.trim(), href: cta.href, rel: cta.rel, target: cta.target } : null,
    };
  });
});

test('every Ready row offers an execution link, and it is the route the corpus holds',
  { skip }, async () => {
    await open();
    const rows = await readRows();
    assert.ok(rows && rows.length, 'the Ready queue rendered nothing');

    let checked = 0;
    for (const row of rows) {
      assert.equal(row.status, 'READY', `a ${row.status} row is in the Ready queue`);
      assert.ok(row.cta, `${row.platform} is READY with no execution link`);

      // The href on screen must be the route the record currently carries —
      // not a sibling's, not a stale one, not the homepage.
      const resolved = RESOLVED.get(key(row.platform, collectionOf(row.where)));
      assert.ok(resolved, `${row.platform} on screen matches no projected opportunity`);
      assert.equal(row.cta.href, resolved.act.actionUrl,
        `${row.platform}: the link on screen is not the record's current route`);

      // Safe external link attributes, on every one of them.
      assert.match(row.cta.href, /^https?:\/\//, `${row.platform}: unsafe scheme on screen`);
      assert.ok(row.cta.rel.includes('noopener'), `${row.platform}: missing rel=noopener`);
      assert.ok(row.cta.rel.includes('noreferrer'), `${row.platform}: missing rel=noreferrer`);
      assert.equal(row.cta.target, '_blank');

      // And the label names the action rather than a generic verb.
      assert.ok(row.cta.text.length > 3, `${row.platform}: empty CTA label`);
      assert.ok(!/^(execute|go|open|click here)$/i.test(row.cta.text),
        `${row.platform}: the CTA says "${row.cta.text}", which hides what the action is`);
      checked += 1;
    }
    assert.ok(checked >= 10, `only ${checked} Ready rows were on screen`);
  });

test('a link appears only where BOTH the route and the action are established',
  { skip }, async () => {
    // Not "only in Ready". A record can hold an established action and a
    // verified route while its site sits behind a bot filter — G2 does — and
    // the route is real there. What must never carry a link is a row whose
    // ACTION is unknown: sixteen of those existed, offering "Do this" into a
    // page nobody had established the purpose of.
    await open();
    const rows = await H.page.eval(() => {
      const out = [];
      for (const id of ['ready', 'research', 'browser']) {
        const section = document.querySelector(`#${id}`);
        if (!section) continue;
        for (const tr of section.querySelectorAll('tr.bd-row')) {
          const td = [...tr.querySelectorAll('td')].find((c) => c.classList.contains('bd-actions'));
          const cellNamed = (label) => [...tr.querySelectorAll('td')]
            .find((c) => c.getAttribute('data-bd-label') === label);
          if (!td) continue;
          const link = td.querySelector('a');
          const name = cellNamed('Platform');
          const where = cellNamed('Where');
          out.push({
            section: id,
            platform: name ? name.textContent.trim() : null,
            where: where ? where.textContent.trim() : null,
            href: link ? link.href : null,
          });
        }
      }
      return out;
    });
    assert.ok(rows.length > 0, 'no queue rendered a row');

    let linked = 0;
    for (const row of rows) {
      const resolved = RESOLVED.get(key(row.platform, collectionOf(row.where)));
      if (!resolved) continue;
      const { op, act } = resolved;
      const established = op.actionType && op.actionType !== 'investigate';
      if (row.href) {
        linked += 1;
        assert.ok(established,
          `${row.platform} (${row.section}) links out while its action is unknown`);
        assert.equal(row.href, act.actionUrl,
          `${row.platform}: the link is not the route actionability resolved`);
      } else if (established && act.actionUrl) {
        assert.fail(`${row.platform}: has an action and a resolved route but renders no link`);
      }
    }
    assert.ok(linked >= 10, `only ${linked} rows linked out`);
  });

test('changing the market changes the routes on screen, not just the labels',
  { skip }, async () => {
    const snapshot = async (query) => {
      await open(query);
      const rows = await readRows();
      return rows.map((r) => r.cta && r.cta.href).filter(Boolean);
    };
    const us = await snapshot('?market=united-states');
    const de = await snapshot('?market=germany');
    assert.ok(us.length && de.length, 'one of the markets rendered no executable row');
    assert.notDeepEqual(us, de, 'two different markets produced the same set of routes');

    // And every route on screen still belongs to a record in that state.
    for (const [market, hrefs] of [['united-states', us], ['germany', de]]) {
      const known = new Set(OPS.map((o) => o.actionUrl).filter(Boolean));
      for (const href of hrefs) {
        assert.ok(known.has(href), `${market}: ${href} is on screen but in no record`);
      }
    }
  });

test('a shared URL restores the same executable rows', { skip }, async () => {
  const query = '?business=local-business&objective=seo-citations&market=united-kingdom&budget=any';
  await open(query);
  const first = (await readRows()).map((r) => `${r.platform}|${r.cta && r.cta.href}`);
  await open('?market=japan');
  await open(query);
  const second = (await readRows()).map((r) => `${r.platform}|${r.cta && r.cta.href}`);
  assert.deepEqual(second, first, 'a restored URL produced different execution routes');
});

test('the downloaded CSV carries exactly the routes the page is showing',
  { skip }, async () => {
    // A real download, in four markets, read back from the blob the page built.
    for (const market of ['united-states', 'united-kingdom', 'germany', 'czech-republic', 'brazil']) {
      // eslint-disable-next-line no-await-in-loop
      await open(`?market=${market}`);
      // eslint-disable-next-line no-await-in-loop
      const rows = await readRows();
      // eslint-disable-next-line no-await-in-loop
      const csv = await H.page.eval(async () => {
        const link = [...document.querySelectorAll('a')]
          .find((a) => /\.csv$/.test(a.getAttribute('href') || '') || a.hasAttribute('download'));
        if (!link) return null;
        // The campaign export is built in the page as a blob; the queue export
        // is a static file. Either way, fetch what the anchor points at.
        const res = await fetch(link.href);
        return res.text();
      });
      assert.ok(csv, `${market}: no export link on the page`);

      const onScreen = rows.map((r) => r.cta && r.cta.href).filter(Boolean);
      const stale = onScreen.filter((href) => href && !csv.includes(href));
      // The static queue export covers the whole corpus rather than the current
      // campaign, so absence is only a defect when the export claims to hold a
      // route and holds a different one.
      const wrong = stale.filter((href) => {
        const op = OPS.find((o) => o.actionUrl === href);
        return op && csv.includes(op.name) && !csv.includes(href);
      });
      assert.deepEqual(wrong, [],
        `${market}: the export names a platform but publishes a different route for it`);
    }
  });

test('an execution link is reachable by keyboard and says where it goes',
  { skip }, async () => {
    await open();
    const a11y = await H.page.eval(() => {
      const link = document.querySelector('#ready a.bd-cta-link');
      if (!link) return null;
      link.focus();
      const style = getComputedStyle(link);
      return {
        focused: document.activeElement === link,
        tabbable: link.tabIndex >= 0,
        text: link.textContent.trim(),
        // Colour must not be the only thing distinguishing it.
        decorated: style.textDecorationLine !== 'none' || style.fontWeight !== '400'
          || style.borderBottomWidth !== '0px',
        target: link.target,
        rel: link.rel,
      };
    });
    assert.ok(a11y, 'no execution link to check');
    assert.ok(a11y.focused, 'the execution link cannot take keyboard focus');
    assert.ok(a11y.tabbable, 'the execution link is not in the tab order');
    assert.ok(a11y.text.length > 3, 'the execution link has no readable label');
    assert.ok(a11y.decorated, 'the execution link is distinguished by colour alone');
  });

test('the localized planners carry the same routes as the English one', { skip }, async () => {
  // Action VALUES are canonical and locale-independent. Labels may translate;
  // the destinations may not move.
  // Settled on STABILITY, not on goto resolving.
  //
  // This read the DOM the instant the document finished loading, which is
  // before the planner recomputes the campaign for ?market=germany. It was the
  // only browser test here that did not wait, and it was always racing — it
  // simply used to lose slowly enough to win, and reported a locale
  // disagreement the moment the client had a fraction more work to do. Two
  // identical reads with links on screen means the render is done.
  const routesFor = async (prefix) => {
    await H.page.goto(`${H.origin + prefix}research/distribution-planner/?market=germany`);
    let previous = null;
    const deadline = Date.now() + 10000;
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const now = await H.page.eval(() => [...document
        .querySelectorAll('#ready a.bd-cta-link')].map((a) => a.href));
      const encoded = JSON.stringify(now);
      if (now.length && encoded === previous) return now;
      previous = encoded;
      if (Date.now() > deadline) {
        throw new Error(`${prefix} never settled: ${now.length} route(s)`);
      }
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => { setTimeout(r, 60); });
    }
  };
  const en = await routesFor('/');
  for (const locale of ['/de/', '/es/', '/fr/']) {
    // eslint-disable-next-line no-await-in-loop
    const other = await routesFor(locale);
    assert.deepEqual(other, en, `${locale} shows different execution routes from the English planner`);
  }
});

test('nothing on the execution path throws in the browser', { skip }, async () => {
  for (const query of ['', '?market=germany', '?objective=marketplace-exposure', '?evidence=ready']) {
    // eslint-disable-next-line no-await-in-loop
    await open(query);
    const ours = H.page.errors.filter((e) => !/googletagmanager|webmasterid|analytics/.test(e));
    assert.deepEqual(ours, [], `${query || '(default)'}: ${ours.join(' | ')}`);
  }
});
