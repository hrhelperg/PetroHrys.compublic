// scripts/tests/bd-nav.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { injectNav, EDITORIAL_PAGES, ITEM } = require('../inject-research-nav.cjs');

const root = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const NAV = `      <ul class="nav-primary">
        <li><a href="/work/">Work</a></li>
        <li><a href="/writing/" aria-current="page">Research &amp; Writing</a></li>
        <li><a href="/about/">About</a></li>
      </ul>`;

test('exactly the eight English editorial pages are targeted', () => {
  assert.deepStrictEqual([...EDITORIAL_PAGES].sort(), [
    'about/index.html', 'ai-systems/index.html', 'essays/index.html',
    'index.html', 'infrastructure/index.html', 'research/index.html',
    'work/index.html', 'writing/index.html',
  ]);
});

test('the item is inserted directly after Work', () => {
  const out = injectNav(NAV);
  assert.ok(out.includes('Research Center'));
  assert.ok(out.indexOf('>Work<') < out.indexOf('Research Center'));
  assert.ok(out.indexOf('Research Center') < out.indexOf('Research &amp; Writing'));
});

test('injection is idempotent', () => {
  const once = injectNav(NAV);
  assert.strictEqual(injectNav(once), once);
  assert.strictEqual(injectNav(injectNav(injectNav(NAV))), once);
  assert.strictEqual((injectNav(once).match(/Research Center/g) || []).length, 1);
});

test('existing labels, hrefs and ordering are untouched', () => {
  const out = injectNav(NAV);
  assert.ok(out.includes('<li><a href="/work/">Work</a></li>'));
  assert.ok(out.includes('<li><a href="/writing/" aria-current="page">Research &amp; Writing</a></li>'));
  assert.ok(out.includes('<li><a href="/about/">About</a></li>'));
});

test('the injected item carries no aria-current', () => {
  // A second aria-current in the same list would be invalid; the existing one
  // belongs to Research & Writing and is left exactly as it was.
  assert.ok(ITEM.indexOf('aria-current') === -1);
  const out = injectNav(NAV);
  assert.strictEqual((out.match(/aria-current/g) || []).length, 1);
});

test('a nav without a Work item is left completely alone', () => {
  const other = '<ul class="top-nav"><li><a href="#features">Features</a></li></ul>';
  assert.strictEqual(injectNav(other), other);
});

// --- state of the repository after the injector has run ---------------------

test('every editorial page carries the item exactly twice', () => {
  for (const page of EDITORIAL_PAGES) {
    const matches = read(page).match(/Research Center/g) || [];
    assert.strictEqual(matches.length, 2, `${page} has ${matches.length} (expected desktop + mobile)`);
  }
});

test('both the desktop list and the mobile panel are updated', () => {
  for (const page of EDITORIAL_PAGES) {
    const html = read(page);
    const panelStart = html.indexOf('nav-mobile-panel');
    assert.ok(panelStart > -1, `${page} has no mobile panel`);
    assert.ok(html.slice(0, panelStart).includes('Research Center'), `${page}: desktop list missing`);
    assert.ok(html.slice(panelStart).includes('Research Center'), `${page}: mobile panel missing`);
  }
});

test('the nav injector never targets a localized or generator-owned page', () => {
  // This guard has now been restated twice, and both earlier versions were
  // wrong in the same way: they inferred "who wrote this file" from the file's
  // CONTENT. That cannot work. A hand-maintained localized page like
  // /de/research/ legitimately carries the shared nav, and so does a generated
  // one — the markup is identical by design, which is the whole point of a
  // shared shell.
  //
  // The invariant that actually protects the repository is about WRITERS, not
  // content: exactly one thing may write any given file. The injector is a
  // post-processor that rewrites HTML in place, so it must not overlap with any
  // generator, and it must not reach into the locale trees at all — its whole
  // target list is English.
  const nav = require(path.join(root, 'scripts', 'inject-research-nav.cjs'));
  const owned = require(path.join(root, 'scripts', 'lib', 'owned-routes.cjs'));

  const localeCodes = require(path.join(root, 'scripts', 'lib', 'i18n.cjs')).LOCALE_CODES
    .filter((c) => c !== 'en');

  const contested = nav.EDITORIAL_PAGES.filter((p) => owned.isGenerated(p));
  assert.deepStrictEqual(contested, [],
    `these pages have two writers — the injector and a generator: ${contested.join(', ')}`);

  const localized = nav.EDITORIAL_PAGES
    .filter((p) => localeCodes.some((c) => p.replace(/\\/g, '/').startsWith(`${c}/`)));
  assert.deepStrictEqual(localized, [],
    `the injector targets localized pages, which it must never do: ${localized.join(', ')}`);
});

test('every generator refuses to write outside its own owned routes', () => {
  // The containment property, asserted against the generator's own declaration
  // rather than against a list of paths a test author remembered.
  const staticPages = require(path.join(root, 'scripts', 'build-static-pages.cjs'));
  const owned = new Set(staticPages.ownedFiles());
  assert.ok(owned.size > 0);

  // Nothing it owns may live inside another generator's collection roots.
  const routes = require(path.join(root, 'scripts', 'lib', 'bd-routes.cjs'));
  const render = require(path.join(root, 'scripts', 'lib', 'bd-render.cjs'));
  const otherRoots = [routes.hubPath(), render.MARKETPLACES_PATH, render.MEDIA_PATH, render.PLANNER_PATH]
    .map((p) => p.replace(/^\//, ''));
  for (const file of owned) {
    for (const rootPath of otherRoots) {
      assert.ok(!file.includes(rootPath),
        `build-static-pages claims ${file}, which belongs to the ${rootPath} collection`);
    }
  }
});

test('each editorial page still has exactly one aria-current in nav-primary', () => {
  for (const page of EDITORIAL_PAGES) {
    const html = read(page);
    const start = html.indexOf('<ul class="nav-primary">');
    const nav = html.slice(start, html.indexOf('</ul>', start));
    const count = (nav.match(/aria-current/g) || []).length;
    assert.ok(count <= 1, `${page}: ${count} current items in one nav list`);
  }
});

test('every editorial page keeps its original nav items', () => {
  for (const page of EDITORIAL_PAGES) {
    const html = read(page);
    for (const label of ['>Work<', '>Research &amp; Writing<', '>About<']) {
      assert.ok(html.includes(label), `${page} lost ${label}`);
    }
    assert.strictEqual((html.match(/class="nav-lang"/g) || []).length, 2, `${page}: language switcher changed`);
  }
});

test('the injected link resolves to a real page', () => {
  assert.ok(fs.existsSync(path.join(root, 'research', 'index.html')));
});

// --- the additive parent link ----------------------------------------------

test('the research hub links to Business Directories', () => {
  const html = read('research/index.html');
  assert.ok(html.includes('/research/business-directories/'));
});

test('the research hub keeps all of its original sections', () => {
  const html = read('research/index.html');
  for (const anchor of ['id="scope"', 'id="entries"', 'id="related"']) {
    assert.ok(html.includes(anchor), `lost ${anchor}`);
  }
  assert.ok(html.includes('Studies of search systems, indexing behavior, and crawl architecture.'));
});

test('the added section reuses existing markup patterns only', () => {
  // This originally asserted `class="prose"`, naming the one component the
  // section happened to use. That is not the property worth protecting: when
  // Collections grew to three databases and became a .product-list — the same
  // component the homepage and /work/ use — the assertion failed on a change
  // that introduced nothing new at all.
  //
  // The property is that the section invents no styling. Checking every class
  // against the stylesheet says exactly that, and is stricter than naming one
  // class: a made-up class name passed the old form as long as .prose was also
  // present, and fails this one.
  const html = read('research/index.html');
  const start = html.indexOf('id="collections"');
  assert.ok(start > -1, 'collections section missing');
  const section = html.slice(html.lastIndexOf('<section', start), html.indexOf('</section>', start));
  assert.ok(!/style="/.test(section), 'no inline styles');
  assert.ok(!/class="bd-/.test(section), 'no new design system classes on the hand-authored page');

  const css = fs.readFileSync(path.join(root, 'css', 'petrohrys.css'), 'utf8');
  const defined = new Set((css.match(/\.[a-zA-Z][\w-]*/g) || []).map((s) => s.slice(1)));
  const used = new Set();
  for (const m of section.matchAll(/class="([^"]+)"/g)) {
    m[1].split(/\s+/).filter(Boolean).forEach((c) => used.add(c));
  }
  assert.ok(used.size > 0, 'the section carries no component class at all');
  for (const c of used) {
    assert.ok(defined.has(c), `.${c} is not defined in the site stylesheet`);
  }
});

test('the research hub gains no new stylesheet or script', () => {
  const html = read('research/index.html');
  assert.ok(!html.includes('business-directories.css'));
  assert.ok(!html.includes('business-directories.js'));
  assert.ok(!html.includes('bd-order.js'));
});
