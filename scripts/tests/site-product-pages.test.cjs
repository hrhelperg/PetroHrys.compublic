'use strict';
// Twin Phone and eSIMky were the last two pages claiming to be current work
// while running a design system of their own.
//
// Each carried a ~20 KB inline <style> block — a second stylesheet living
// inside one file, with its own colours, spacing and type scale. The site had
// long since moved to css/petrohrys.css: the homepage, /work/, /about/ and the
// ecosystem banner all render from it. Two product pages did not, so the pages
// a visitor is most likely to land on looked like a different site.
//
// The fix was to rewrite both against the shared stylesheet, taking the shell
// verbatim from /work/. These tests hold that: no page-local styling, no class
// the stylesheet does not define, the same chrome as the canonical subpage, and
// — because these are commercial pages — no claim the product does not support.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const PAGES = ['twinphone/index.html', 'esimky/index.html'];
const REFERENCE = 'work/index.html';

// Markup only: JSON-LD strings contain "<" and would be miscounted as tags.
const markup = (html) => html.replace(/<script[\s\S]*?<\/script>/g, '');
const text = (html) => markup(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('neither page carries any page-local styling', () => {
  for (const rel of PAGES) {
    const html = read(rel);
    assert.strictEqual((html.match(/<style/g) || []).length, 0,
      `${rel} still has an inline <style> block`);
    assert.ok(!/\sstyle="/.test(html), `${rel} has an inline style attribute`);
    assert.ok(html.includes('/css/petrohrys.css'), `${rel} does not load the site stylesheet`);
  }
});

test('every class used is defined in the shared stylesheets', () => {
  // The strict form of "reuses the design system". A page that invented
  // .tp-hero and shipped no CSS for it would render unstyled and pass a check
  // that only looked for <style>.
  const css = read('css/petrohrys.css') + read('css/ecosystem-banner.css');
  const defined = new Set((css.match(/\.[a-zA-Z][\w-]*/g) || []).map((s) => s.slice(1)));
  for (const rel of PAGES) {
    const used = new Set();
    for (const m of markup(read(rel)).matchAll(/class="([^"]+)"/g)) {
      m[1].split(/\s+/).filter(Boolean).forEach((c) => used.add(c));
    }
    assert.ok(used.size > 10, `${rel} uses only ${used.size} classes; it cannot be styled`);
    for (const c of used) {
      assert.ok(defined.has(c), `${rel} uses .${c}, which no stylesheet defines`);
    }
  }
});

test('the shell is the same shell as the canonical subpage', () => {
  // Chrome that drifts between sections is how the two designs diverged in the
  // first place, so each piece is compared against /work/ rather than merely
  // asserted present.
  const ref = read(REFERENCE);
  const refFooter = ref.slice(ref.indexOf('<footer role="contentinfo">'), ref.indexOf('</footer>') + 9);
  const refEco = ref.slice(ref.indexOf('<!-- helperg-eco:body:start -->'),
    ref.indexOf('<!-- helperg-eco:body:end -->'));
  for (const rel of PAGES) {
    const html = read(rel);
    assert.ok(html.includes('<a class="skip" href="#main">Skip to content</a>'), `${rel}: no skip link`);
    assert.ok(html.includes('<main id="main">'), `${rel}: no main landmark`);
    assert.strictEqual((html.match(/class="nav-primary"/g) || []).length, 2,
      `${rel}: the desktop and mobile nav lists are not both present`);
    assert.strictEqual((html.match(/class="nav-lang"/g) || []).length, 2,
      `${rel}: the language switcher changed`);
    assert.ok(html.includes(refEco), `${rel}: the ecosystem banner markup differs from ${REFERENCE}`);
    assert.ok(html.includes(refFooter), `${rel}: the footer differs from ${REFERENCE}`);
    // A subpage is not the current page in the primary nav.
    const nav = html.slice(html.indexOf('<ul class="nav-primary">'));
    assert.ok(!nav.slice(0, nav.indexOf('</ul>')).includes('aria-current'),
      `${rel}: a nav item claims to be the page you are reading`);
  }
});

test('each page is a real page with a breadcrumb and valid structured data', () => {
  for (const rel of PAGES) {
    const html = read(rel);
    assert.match(html, /^<!DOCTYPE html>/, `${rel}: no document shell`);
    assert.match(html, /<title>[^<]+<\/title>/, `${rel}: no title`);
    assert.ok(html.includes('rel="canonical"'), `${rel}: no canonical URL`);
    assert.ok(html.includes('class="breadcrumb"'), `${rel}: no breadcrumb`);

    const blocks = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [];
    assert.strictEqual(blocks.length, 3, `${rel}: expected three JSON-LD blocks, found ${blocks.length}`);
    const types = blocks.map((b) => {
      const parsed = JSON.parse(b.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, ''));
      return parsed['@type'];
    });
    assert.ok(types.includes('BreadcrumbList'), `${rel}: no BreadcrumbList`);
    assert.ok(types.includes('FAQPage'), `${rel}: no FAQPage`);
  }
});

test('every FAQ answered in structured data is answered on the page', () => {
  // Structured data that says something the page does not is a claim made only
  // to a search engine.
  for (const rel of PAGES) {
    const html = read(rel);
    const faq = (html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [])
      .map((b) => JSON.parse(b.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '')))
      .find((p) => p['@type'] === 'FAQPage');
    const visible = text(html);
    for (const q of faq.mainEntity) {
      assert.ok(visible.includes(q.name), `${rel}: "${q.name}" is in the FAQ markup but not on the page`);
    }
  }
});

test('no rating is claimed for either product', () => {
  // Both pages previously carried an aggregateRating. Twin Phone's asserted
  // 4.8 from 2,150 reviews against an App Store listing reporting none.
  for (const rel of PAGES) {
    const html = read(rel);
    assert.ok(!/aggregateRating|ratingValue|reviewCount/.test(html),
      `${rel} claims a rating`);
    assert.ok(!/\b\d[\d,.]*\s*(?:\+\s*)?(?:reviews|ratings)\b/i.test(text(html)),
      `${rel} states a review count in visible text`);
  }
});

test('no app store URL is invented', () => {
  // Twin Phone has one verified iOS listing and no Android one. eSIMky has
  // neither. A store link that 404s is worse than saying "coming soon".
  const twin = read('twinphone/index.html');
  const stores = [...twin.matchAll(/https:\/\/(?:apps\.apple\.com|play\.google\.com)[^"']*/g)]
    .map((m) => m[0]);
  assert.deepStrictEqual([...new Set(stores)], ['https://apps.apple.com/app/id6792280945'],
    'Twin Phone links a store URL that was never verified');
  assert.match(text(twin), /Android — coming soon/i, 'Twin Phone does not say Android is unreleased');

  const esim = read('esimky/index.html');
  assert.strictEqual((esim.match(/apps\.apple\.com|play\.google\.com/g) || []).length, 0,
    'eSIMky links an app store, but neither app has been released');
  assert.match(text(esim), /coming soon/i, 'eSIMky does not say the apps are unreleased');
});

test('neither page uses superlative marketing language', () => {
  const BANNED = /\b(?:revolutionary|world[- ]leading|number one|#1|best[- ]in[- ]class|cutting[- ]edge|game[- ]changing|unbeatable|seamlessly)\b/i;
  for (const rel of PAGES) {
    const body = text(read(rel));
    const hit = body.match(BANNED);
    assert.ok(!hit, `${rel} uses marketing language: "${hit && hit[0]}"`);
  }
});

test('the two pages and the Work index know about each other', () => {
  assert.ok(read('twinphone/index.html').includes('href="/esimky/"'),
    'Twin Phone does not link eSIMky');
  assert.ok(read('esimky/index.html').includes('href="/twinphone/"'),
    'eSIMky does not link Twin Phone');
  const work = read(REFERENCE);
  const list = work.slice(work.indexOf('id="all-products"'), work.indexOf('</section>', work.indexOf('id="all-products"')));
  for (const href of ['/twinphone/', '/esimky/']) {
    assert.ok(list.includes(`href="${href}"`), `the Work product list is missing ${href}`);
  }
});

test('the page states what Twin Phone Enterprise actually covers', () => {
  // Calling reaches 145+ countries; numbers on the enterprise plan are US and
  // Canada. Conflating the two would promise a local number in 145 countries.
  const body = text(read('twinphone/index.html'));
  assert.match(body, /Numbers on the enterprise plan cover the US and Canada/i,
    'the number coverage is not stated');
  assert.ok(!/local numbers? in 145/i.test(body), 'the page implies local numbers in 145 countries');
  assert.ok(!/local numbers? in 145/i.test(text(read(REFERENCE))),
    'the Work index implies local numbers in 145 countries');
});

test('eSIMky never presents itself as a phone number', () => {
  const body = text(read('esimky/index.html'));
  assert.match(body, /It is <strong>not a phone number<\/strong>|not a phone number/i,
    'the page does not say the rental carries no number');
  assert.match(body, /rental|rent/i, 'the page does not describe the product as a rental');
});
