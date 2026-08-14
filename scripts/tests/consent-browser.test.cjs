'use strict';

// Analytics consent, in a real browser.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
//
// The site shipped a consent gate that could never open. The tracker was
// emitted as `type="text/plain" data-cookieyes="cookieyes-analytics"` and
// CookieYes was supposed to rewrite that type on acceptance; CookieYes started
// answering 403, nothing rewrote anything, and the tracker never executed once.
// Meanwhile Google Analytics sat directly above it as a plain `<script async>`
// and ran for everybody. Both facts were invisible to every existing test,
// because a gate is a *runtime* behaviour: the markup looked correct the whole
// time it was doing the opposite of what it claimed.
//
// So this file asserts the two things markup cannot:
//
//   BEFORE a choice — no analytics request is even ATTEMPTED. Not blocked,
//   not failed: never made. That is the assertion the old setup would have
//   passed while GA ran, because GA's tag was never gated at all.
//
//   AFTER acceptance — the placeholders are gone, real executable scripts
//   stand in their place in the original document order, and the tracker is
//   actually fetched. That is the assertion the old setup would have FAILED
//   for four hundred days.
//
// Requests are matched by URL against the live analytics hosts, so a regression
// that re-introduces an ungated tag fails here even if the markup looks gated.
//
// If there is no Chrome on this machine the file skips rather than fails: a
// missing browser is not a broken consent gate.

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const { harness, chromePath } = require('./helpers/cdp.cjs');

// Every host the gate is responsible for holding back.
const ANALYTICS = /googletagmanager\.com|google-analytics\.com|webmasterid\.com|webmasterid-ingest-api/;

// One hand-authored page and one generator-emitted page. They reach the same
// markup by different routes, and only one of them was ever covered before.
const PAGES = [
  { label: 'hand-authored home', url: '/' },
  { label: 'generated research hub', url: '/research/business-directories/' },
];

let H = null;
let online = false;

before(async () => {
  if (!chromePath()) return;
  H = await harness(ROOT);
  if (!H) return;
  // Whether the analytics hosts are reachable decides which assertions can be
  // made honestly. The DOM assertions hold either way; "the tracker was really
  // fetched" needs a network, and is reported as unverified rather than
  // quietly dropped when there isn't one.
  try {
    const res = await fetch('https://webmasterid.com/tracker.iife.min.js', {
      method: 'HEAD',
      signal: AbortSignal.timeout(8000),
    });
    online = res.ok;
  } catch { online = false; }
});

after(async () => { if (H) await H.close(); });

// Resolved once, at load: `skip` is read when each test is DEFINED, so it
// cannot depend on anything `before` sets up. A missing browser skips; a
// present browser that fails to start is a failure, asserted inside each test.
const skip = chromePath() ? false : 'no Chrome, Chromium or Edge on this machine';

// A fresh visitor: clear the decision, reload, and let consent.js run from zero.
async function fresh(url) {
  assert.ok(H, 'Chrome is installed but the CDP harness never started');
  await H.page.goto(H.origin + url);
  await H.page.eval(() => { try { localStorage.clear(); } catch (e) { /* private mode */ } });
  await H.page.goto(H.origin + url);
  return H.page;
}

// Wait for a specific condition rather than for "some analytics request", which
// returns on whichever tag is quickest and then reports the slower one missing.
async function settle(want, ms = 10000) {
  const deadline = Date.now() + ms;
  for (;;) {
    if (want && want()) return;
    if (Date.now() > deadline) return;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { setTimeout(r, 200); });
  }
}

// Asked for, whether or not it answered.
const analyticsHits = () => H.page.attempts.filter((r) => ANALYTICS.test(r.url)).map((r) => r.url);
const asked = (re) => () => H.page.attempts.some((r) => re.test(r.url));

for (const p of PAGES) {
  test(`${p.label}: nothing analytic loads before a choice is made`, { skip }, async () => {
    await fresh(p.url);
    await settle(null, 3000);

    assert.deepEqual(analyticsHits(), [],
      'an analytics request was made before the visitor chose anything');

    // The banner has to be on screen, or the visitor is never asked and the
    // site simply measures nobody — which is also a failure, just a quiet one.
    const banner = await H.page.eval(() => {
      const el = document.querySelector('.ph-consent');
      if (!el) return null;
      const buttons = [...el.querySelectorAll('button')];
      return {
        text: (el.textContent || '').trim().slice(0, 40),
        buttons: buttons.map((b) => {
          const r = b.getBoundingClientRect();
          return { label: (b.textContent || '').trim(), w: Math.round(r.width), h: Math.round(r.height) };
        }),
        visible: el.getBoundingClientRect().height > 0,
      };
    });
    assert.ok(banner, 'no consent banner was shown to a visitor who has not chosen');
    assert.ok(banner.visible, 'the consent banner is in the DOM but has no height');
    assert.equal(banner.buttons.length, 2, 'expected exactly an accept and a decline');

    // No dark patterns: refusing must not be made harder than agreeing.
    const [yes, no] = banner.buttons;
    assert.ok(Math.abs(yes.h - no.h) <= 1,
      `accept and decline are different heights: ${yes.h} vs ${no.h}`);
    assert.ok(Math.abs(yes.w - no.w) <= yes.w * 0.6,
      `decline is disproportionately small: ${no.w} vs ${yes.w}`);

    // And the tags really are inert, not merely unrequested by luck.
    const pending = await H.page.eval(() => document
      .querySelectorAll('script[type="text/plain"][data-consent="analytics"]').length);
    assert.ok(pending >= 2, `expected the gated tags to still be inert, found ${pending}`);
  });

  test(`${p.label}: accepting activates every tag and fetches the tracker`, { skip }, async () => {
    await fresh(p.url);
    await H.page.eval(() => window.PHConsent.grant());
    await settle(asked(/webmasterid\.com\/tracker/));

    const dom = await H.page.eval(() => {
      const left = document.querySelectorAll('script[type="text/plain"][data-consent="analytics"]').length;
      const live = [...document.querySelectorAll('script')].filter((s) => s.type !== 'text/plain');
      const srcs = live.map((s) => s.src).filter(Boolean);
      return {
        left,
        tracker: srcs.some((s) => /webmasterid\.com\/tracker/.test(s)),
        gtag: srcs.some((s) => /googletagmanager\.com\/gtag/.test(s)),
        // gtag.js must still precede the config block that calls it, or the
        // config runs against nothing and measures nothing.
        gtagBeforeConfig: (() => {
          const all = [...document.querySelectorAll('script')];
          const loader = all.findIndex((s) => /googletagmanager\.com\/gtag/.test(s.src || ''));
          const config = all.findIndex((s) => !s.src && /gtag\('config'/.test(s.textContent || ''));
          return loader !== -1 && config !== -1 && loader < config;
        })(),
        banner: !!document.querySelector('.ph-consent'),
        stored: (() => { try { return localStorage.getItem('ph-consent-analytics'); } catch (e) { return null; } })(),
      };
    });

    assert.equal(dom.left, 0, 'a gated tag was left inert after the visitor accepted');
    assert.ok(dom.tracker, 'the WebmasterID tracker was never turned into an executable script');
    assert.ok(dom.gtag, 'the Google tag was never turned into an executable script');
    assert.ok(dom.gtagBeforeConfig, 'gtag.js no longer precedes its config call');
    assert.equal(dom.banner, false, 'the banner stayed on screen after a decision');
    assert.equal(dom.stored, 'granted', 'the decision was not recorded');

    if (!online) {
      // Say so rather than pass silently. The DOM half is still proven above.
      console.log(`  (offline: ${p.label} tracker fetch not verified)`);
      return;
    }
    const hits = analyticsHits();
    assert.ok(hits.some((u) => /webmasterid\.com\/tracker/.test(u)),
      `the tracker was never actually fetched; analytics requests seen: ${JSON.stringify(hits)}`);
  });

  test(`${p.label}: declining loads nothing, and the choice survives a reload`, { skip }, async () => {
    await fresh(p.url);
    await H.page.eval(() => window.PHConsent.deny());
    await settle(null, 3000);
    assert.deepEqual(analyticsHits(), [], 'analytics loaded despite the visitor declining');

    // Reload: a decline that is forgotten is a decline that becomes a re-ask,
    // and a re-ask on every page view is how consent fatigue manufactures a yes.
    await H.page.goto(H.origin + p.url);
    await settle(null, 3000);
    assert.deepEqual(analyticsHits(), [], 'analytics loaded on reload after a decline');

    const after2 = await H.page.eval(() => ({
      banner: !!document.querySelector('.ph-consent'),
      pending: document.querySelectorAll('script[type="text/plain"][data-consent="analytics"]').length,
    }));
    assert.equal(after2.banner, false, 'the banner asked again after being declined');
    assert.ok(after2.pending >= 2, 'the tags did not stay inert on reload after a decline');
  });
}

test('acceptance persists across a reload without asking again', { skip }, async () => {
  await fresh('/');
  await H.page.eval(() => window.PHConsent.grant());
  await H.page.goto(H.origin + '/');
  await settle(asked(/webmasterid\.com\/tracker/));

  const state = await H.page.eval(() => ({
    banner: !!document.querySelector('.ph-consent'),
    left: document.querySelectorAll('script[type="text/plain"][data-consent="analytics"]').length,
  }));
  assert.equal(state.banner, false, 'the banner asked again after being accepted');
  assert.equal(state.left, 0, 'the tags were not activated on a return visit');
});

test('consent can be withdrawn from the footer on every page', { skip }, async () => {
  for (const p of PAGES) {
    // eslint-disable-next-line no-await-in-loop
    await fresh(p.url);
    // eslint-disable-next-line no-await-in-loop
    await H.page.eval(() => window.PHConsent.grant());

    // eslint-disable-next-line no-await-in-loop
    const reopened = await H.page.eval(() => {
      const btn = document.getElementById('ph-consent-manage');
      if (!btn) return { control: false };
      if (!document.querySelector('footer').contains(btn)) return { control: true, inFooter: false };
      btn.click();
      return {
        control: true,
        inFooter: true,
        banner: !!document.querySelector('.ph-consent'),
        cleared: (() => { try { return localStorage.getItem('ph-consent-analytics'); } catch (e) { return 'unreadable'; } })(),
      };
    });

    assert.ok(reopened.control, `${p.label}: no way to withdraw consent`);
    assert.ok(reopened.inFooter, `${p.label}: the withdrawal control is not in the footer`);
    assert.ok(reopened.banner, `${p.label}: withdrawing did not bring the choice back`);
    assert.equal(reopened.cleared, null, `${p.label}: withdrawing left the old decision stored`);
  }
});

test('the consent script itself is never the thing that breaks a page', { skip }, async () => {
  for (const p of PAGES) {
    // eslint-disable-next-line no-await-in-loop
    await fresh(p.url);
    // eslint-disable-next-line no-await-in-loop
    await H.page.eval(() => window.PHConsent.grant());
    // eslint-disable-next-line no-await-in-loop
    await settle(asked(/webmasterid\.com\/tracker/));
    const ours = H.page.errors.filter((e) => /consent\.js/.test(e));
    assert.deepEqual(ours, [], `${p.label}: consent.js threw: ${ours.join(' | ')}`);
  }
});
