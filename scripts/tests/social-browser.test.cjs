'use strict';

// The social footer, in a real browser, at every breakpoint the brief names.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// social-profiles.test.cjs reads the markup on disk. Markup on disk cannot tell
// you that the twelfth icon is pushed past the right edge at 375px, that the
// focus ring is invisible because something clipped it, or that a 44px touch
// target collapsed to 18px because the flex parent shrank it. Those are the
// failures the brief actually cares about, and only a layout engine has the
// answer. So this loads the real pages over HTTP in the real browser and
// measures what rendered.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { harness, chromePath } = require('./helpers/cdp.cjs');

const ROOT = path.join(__dirname, '..', '..');

// The widths named in the brief.
const WIDTHS = [375, 390, 768, 1024, 1280, 1440];
const PAGES = ['/', '/es/', '/fr/', '/de/', '/about/', '/pdf-editor/'];

const skip = chromePath() ? false : 'no Chrome/Chromium on this machine';

test('the social footer holds up at every breakpoint', { skip }, async (t) => {
  const h = await harness(ROOT);
  assert.ok(h, 'browser harness failed to start');
  t.after(() => h.close());

  const setWidth = (w) => h.page.send('Emulation.setDeviceMetricsOverride', {
    width: w, height: 900, deviceScaleFactor: 1, mobile: w < 768,
  });

  for (const rel of PAGES) {
    for (const width of WIDTHS) {
      await setWidth(width);
      await h.page.goto(h.origin + rel);

      const r = await h.page.eval(() => {
        const links = [...document.querySelectorAll('.social-follow-link')];
        const doc = document.documentElement;
        return {
          count: links.length,
          // Horizontal overflow of the PAGE, which is what the brief forbids.
          overflow: doc.scrollWidth - doc.clientWidth,
          heading: (document.querySelector('.social-follow-heading') || {}).textContent || '',
          links: links.map((a) => {
            const b = a.getBoundingClientRect();
            const cs = getComputedStyle(a);
            return {
              id: a.dataset.social,
              href: a.getAttribute('href'),
              label: a.getAttribute('aria-label'),
              w: Math.round(b.width), h: Math.round(b.height),
              right: Math.round(b.right),
              display: cs.display,
              visibility: cs.visibility,
              opacity: Number(cs.opacity),
              svg: !!a.querySelector('svg path'),
            };
          }),
        };
      });

      const where = `${rel} @ ${width}px`;

      assert.equal(r.count, 12, `${where}: expected twelve profiles, saw ${r.count}`);
      assert.ok(r.overflow <= 0, `${where}: page overflows horizontally by ${r.overflow}px`);
      assert.ok(r.heading.trim().length > 0, `${where}: the Follow heading did not render`);

      for (const a of r.links) {
        assert.ok(a.svg, `${where}: ${a.id} rendered no SVG mark`);
        assert.notEqual(a.display, 'none', `${where}: ${a.id} is hidden`);
        assert.notEqual(a.visibility, 'hidden', `${where}: ${a.id} is invisible`);
        assert.ok(a.opacity > 0.3, `${where}: ${a.id} is effectively invisible (opacity ${a.opacity})`);
        // Comfortable touch target, at every width — including the secondary tier.
        assert.ok(a.w >= 44 && a.h >= 44,
          `${where}: ${a.id} touch target is ${a.w}x${a.h}, under 44x44`);
        // Nothing may sit past the right edge of the viewport.
        assert.ok(a.right <= width,
          `${where}: ${a.id} extends to ${a.right}px, past the ${width}px viewport`);
        assert.ok(a.label && a.label.length > 4, `${where}: ${a.id} has no accessible name`);
        assert.ok(a.href && a.href !== '#', `${where}: ${a.id} has no real destination`);
      }
    }
  }
});

test('every profile is reachable and visibly focused by keyboard', { skip }, async (t) => {
  const h = await harness(ROOT);
  assert.ok(h, 'browser harness failed to start');
  t.after(() => h.close());

  await h.page.send('Emulation.setDeviceMetricsOverride', {
    width: 1280, height: 900, deviceScaleFactor: 1, mobile: false,
  });
  await h.page.goto(h.origin + '/');

  // A programmatic .focus() does NOT match :focus-visible, so it cannot prove
  // the ring is painted. Real Tab keystrokes can. Park focus on the link
  // immediately before the row, then walk the twelve with the actual key.
  await h.page.eval(() => {
    const first = document.querySelector('.social-follow-link');
    const all = [...document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')]
      .filter((el) => el.tabIndex >= 0);
    const at = all.indexOf(first);
    if (at > 0) all[at - 1].focus();
    return at;
  });

  const tab = async () => {
    for (const type of ['rawKeyDown', 'keyUp']) {
      await h.page.send('Input.dispatchKeyEvent', {
        type, key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9,
      });
    }
  };

  const seen = [];
  for (let i = 0; i < 12; i += 1) {
    await tab();
    seen.push(await h.page.eval(() => {
      const el = document.activeElement;
      if (!el || !el.classList.contains('social-follow-link')) {
        return { id: null, tag: el ? el.className : '(none)' };
      }
      const cs = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      return {
        id: el.dataset.social,
        matchesFocusVisible: el.matches(':focus-visible'),
        outlineWidth: parseFloat(cs.outlineWidth) || 0,
        outlineStyle: cs.outlineStyle,
        outlineColor: cs.outlineColor,
        inViewport: b.top >= 0 && b.bottom <= innerHeight + b.height,
      };
    }));
  }

  const registry = require('../../js/social-profiles.js');
  assert.deepEqual(
    seen.map((s) => s.id),
    registry.enabled().map((p) => p.id),
    'Tab order must walk the twelve profiles in the approved order'
  );
  for (const s of seen) {
    assert.ok(s.matchesFocusVisible, `${s.id} did not match :focus-visible under a real Tab`);
    assert.ok(s.outlineWidth >= 2, `${s.id} focus ring is ${s.outlineWidth}px, too faint to see`);
    assert.notEqual(s.outlineStyle, 'none', `${s.id} paints no focus outline`);
  }
});

test('the footer component costs no extra network request', { skip }, async (t) => {
  const h = await harness(ROOT);
  assert.ok(h, 'browser harness failed to start');
  t.after(() => h.close());

  await h.page.goto(h.origin + '/');
  // The marks are inline SVG. Nothing may be fetched to draw them, and no
  // third-party icon host may appear.
  const iconRequests = h.page.attempts.filter((a) => /icon|sprite|fontawesome|simple-icons/i.test(a.url));
  assert.deepEqual(iconRequests, [], `the icons pulled network requests: ${JSON.stringify(iconRequests)}`);

  const offsite = h.page.attempts
    .map((a) => a.url)
    .filter((u) => /^https?:\/\//.test(u) && !u.startsWith(h.origin))
    .filter((u) => !/fonts\.(googleapis|gstatic)\.com/.test(u));
  // Whatever third parties the page already had (analytics, consent) are not
  // this component's business — it simply must not ADD an icon host.
  for (const u of offsite) {
    assert.doesNotMatch(u, /icon|cdn\.simpleicons|fontawesome/i, `unexpected icon host: ${u}`);
  }
});
