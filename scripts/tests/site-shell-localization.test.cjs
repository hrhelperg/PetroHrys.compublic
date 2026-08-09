'use strict';

// Guards for the site-wide shell localization, and a ratchet over the body-copy
// backlog it uncovered.
//
// ── WHAT WENT WRONG BEFORE ──────────────────────────────────────────────────
//
// Research Center i18n v1 localized the page shell's *tables and enum labels*
// and was recorded as complete. It was not: the header nav read "Work / Research
// & Writing / About" in English on every German page, the entire footer was
// English, the skip link was English, and two nav links were not locale-prefixed
// at all — so a German reader clicking "About" left the German site.
//
// None of that was caught, because the tests asserted that localized pages
// EXISTED and that their <html lang> was right. Existence is not translation.
// These tests assert the property that actually matters: a page served under a
// locale prefix presents its chrome in that locale.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const I18N = require('../lib/i18n.cjs');
const render = require('../lib/bd-render.cjs');
const leak = require('../lib/english-leak.cjs');
const seo = require('../lib/bd-seo.cjs');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// A generated page in each locale — these go through the one render path, so
// they are where shell regressions surface first.
const GENERATED_SAMPLE = 'research/business-directories/index.html';

test('the shell renders in the page\'s own language, not English', () => {
  for (const code of I18N.LOCALE_CODES) {
    const t = I18N.translator(code);
    const header = render.HEADER('/research/', code, t);
    const footer = render.FOOTER('/research/', code, t);

    // Assert the localized strings are PRESENT, rather than asserting specific
    // markup. A future header rewrite that keeps the words is fine; one that
    // drops back to English is not.
    for (const key of ['shell.nav.work', 'shell.nav.writing', 'shell.nav.about', 'shell.menu']) {
      assert.ok(header.includes(I18N.raw(code, key)),
        `${code}: header is missing ${key} ("${I18N.raw(code, key)}")`);
    }
    for (const key of ['shell.footer.products', 'shell.footer.legal', 'shell.footer.credit']) {
      assert.ok(footer.includes(I18N.raw(code, key)),
        `${code}: footer is missing ${key} ("${I18N.raw(code, key)}")`);
    }
  }
});

test('every internal shell link keeps the reader inside their own locale', () => {
  for (const code of I18N.LOCALE_CODES) {
    if (code === I18N.DEFAULT_LOCALE) continue;
    const t = I18N.translator(code);
    const prefix = I18N.LOCALE_BY_CODE.get(code).prefix;

    // The language switcher is excluded on purpose: crossing locales is the one
    // thing it exists to do, so its EN entry MUST point at the unprefixed route.
    // Scanning it too would be asserting an implementation ("no bare hrefs
    // anywhere") instead of the property ("navigation keeps you in your
    // locale") — and the only way to pass would be to break the switcher.
    const stripSwitchers = (s) => s.replace(/<ul class="nav-lang"[\s\S]*?<\/ul>/g, '');
    const html = stripSwitchers(render.HEADER('/research/', code, t))
      + stripSwitchers(render.FOOTER('/research/', code, t));

    // These routes have a twin in every locale, so linking them unprefixed
    // strands the reader on the English site. Product routes are deliberately
    // excluded: several products have no localized page, and linking to a
    // /de/ URL that 404s would be a worse bug than linking to the English one.
    for (const route of ['/work/', '/about/', '/writing/', '/privacy/', '/terms/', '/research/']) {
      const unprefixed = new RegExp(`href="${route.replace(/\//g, '\\/')}"`);
      assert.ok(!unprefixed.test(html),
        `${code}: shell links ${route} without the ${prefix} prefix, sending the reader to the English site`);
    }
  }
});

test('the language switcher offers a real destination for every locale', () => {
  const t = I18N.translator('de');
  const header = render.HEADER('/research/', 'de', t);
  for (const l of I18N.LOCALES) {
    assert.ok(header.includes(`>${l.label}<`), `switcher is missing ${l.label}`);
  }
});

test('a shipped localized page carries a localized shell on disk', () => {
  for (const code of I18N.LOCALE_CODES) {
    if (code === I18N.DEFAULT_LOCALE) continue;
    const file = path.join(code, GENERATED_SAMPLE);
    const html = read(file);
    assert.ok(html.includes(I18N.raw(code, 'shell.skip')),
      `${file}: skip link is not in ${code}`);
    assert.ok(html.includes(I18N.raw(code, 'shell.menu')),
      `${file}: mobile menu label is not in ${code}`);
    assert.ok(html.includes(I18N.raw(code, 'shell.footer.products')),
      `${file}: footer heading is not in ${code}`);
  }
});

test('the renderer itself localizes the skip link, not just the last build', () => {
  // Reading built files proves what the last build produced, not what the
  // renderer does now: a mutation that hardcodes "Skip to content" back into
  // the source passed the on-disk check until someone rebuilt. This renders
  // fresh, so the source regression fails immediately.
  //
  // The skip link is emitted by renderPage() rather than by HEADER(), so it
  // needs a real document. The meta comes from the real builder rather than a
  // hand-rolled literal: a fake one drifts the moment renderPage reads a field
  // the fake does not have, and the test starts failing for the wrong reason.
  const meta = seo.buildArticleIndexMeta({ articles: [] });
  for (const code of I18N.LOCALE_CODES) {
    const html = render.renderPage({ meta, main: '<p>x</p>', locale: code });
    const expected = I18N.raw(code, 'shell.skip');
    assert.ok(html.includes(`class="skip" href="#main">${expected}<`),
      `${code}: renderPage emitted a skip link that is not "${expected}"`);
  }
});

test('the shell refuses to render English into a localized page', () => {
  // Once the footer body started reading from t(), a missing translator throws
  // on its own — so the explicit guard clause is defence in depth, not the sole
  // protection. What the guard adds is a message that names the problem instead
  // of "t is not a function", so assert the message: otherwise this test passes
  // whether or not the guard exists, and proves nothing about it.
  assert.throws(() => render.FOOTER('/research/', 'de'), /FOOTER requires a translator/);
  assert.throws(() => render.HEADER('/research/', 'de'), /HEADER requires a translator/);
});

test('eSIMky is reachable from the footer of every page that has one', () => {
  // It was absent from the shared footer entirely while appearing in the
  // hand-written one — so the product was unreachable from 1,700 generated
  // pages. A missing product link is a product nobody finds.
  const t = I18N.translator('en');
  assert.match(render.FOOTER('/research/', 'en', t), /href="\/esimky\/"/);
});

// ── the ratchet ─────────────────────────────────────────────────────────────
//
// The shell is localized; the Business Directories and Distribution Planner
// BODY copy is not. That is a real, quantified backlog, recorded in
// docs/SITE-WIDE-MIGRATION-AUDIT.md — not a silent exemption.
//
// This test pins the backlog to its exact current membership. If someone
// localizes one of these modules the test fails and the list must shrink; if
// someone adds a new module full of hardcoded English the test fails too. Either
// way the backlog cannot quietly grow, and it cannot quietly be forgotten.

const UNLOCALIZED_BODY_MODULES = [
  'scripts/lib/bd-articles.cjs',      // 70KB of long-form editorial guides
  'scripts/lib/bd-components.cjs',    // record-page field labels and empty states
  'scripts/lib/bd-feeds.cjs',         // RSS channel title/description
  'scripts/build-business-directories.cjs',
  'scripts/build-distribution-planner.cjs',
];

function hardcodedEnglishStrings(rel) {
  const src = read(rel);
  const found = new Set();
  for (const m of src.matchAll(/>([A-Z][A-Za-z0-9 ,'’—&;.:%()/-]{9,})</g)) {
    if (!m[1].includes('${')) found.add(m[1].trim());
  }
  return found;
}

test('the un-localized body backlog is exactly the documented set', () => {
  const localized = [];
  for (const rel of UNLOCALIZED_BODY_MODULES) {
    if (hardcodedEnglishStrings(rel).size === 0) localized.push(rel);
  }
  assert.deepStrictEqual(localized, [],
    `These modules no longer contain hardcoded English — remove them from `
    + `UNLOCALIZED_BODY_MODULES and from the audit's backlog table: ${localized.join(', ')}`);

  // And nothing outside the list may carry hardcoded English body copy.
  const libDir = path.join(ROOT, 'scripts', 'lib');
  const offenders = [];
  for (const name of fs.readdirSync(libDir)) {
    if (!name.endsWith('.cjs')) continue;
    const rel = path.join('scripts', 'lib', name);
    if (UNLOCALIZED_BODY_MODULES.includes(rel)) continue;
    // bd-render is the shell itself and is fully localized; its remaining
    // literals are the ecosystem banner, which the injector owns and localizes.
    if (name === 'bd-render.cjs') continue;
    if (hardcodedEnglishStrings(rel).size > 0) offenders.push(rel);
  }
  assert.deepStrictEqual(offenders, [],
    `New hardcoded English body copy appeared outside the known backlog: ${offenders.join(', ')}`);
});

test('the leak detector derives its probes and cannot go stale', () => {
  // The detector must build its probe list from the dictionary, so that adding
  // a translated string automatically adds a probe. A hardcoded word list would
  // pass this file today and miss every string added tomorrow.
  const de = leak.probesFor('de');
  assert.ok(de.length > 100, `expected the DE probe set to cover the dictionary, got ${de.length}`);

  // Strings that are legitimately identical across languages must never become
  // probes, or every correct page would be reported as leaking.
  const values = new Set(de.map((p) => p.en));
  assert.ok(!values.has('Blog'), 'identical translations must not be probes');
  assert.ok(!values.has(I18N.raw('en', 'shell.footer.legal')) || I18N.raw('de', 'shell.footer.legal') !== 'Legal',
    'a key whose DE value equals its EN value must be excluded automatically');

  // And a probe must actually detect a planted leak.
  const planted = `<html lang="de"><body><a class="skip">${I18N.raw('en', 'shell.skip')}</a></body></html>`;
  assert.ok(leak.leaksIn('de/example/index.html', planted).length > 0,
    'the detector failed to catch an English skip link on a German page');
  const clean = `<html lang="de"><body><a class="skip">${I18N.raw('de', 'shell.skip')}</a></body></html>`;
  assert.strictEqual(leak.leaksIn('de/example/index.html', clean).length, 0,
    'the detector reported a leak on a correctly localized page');
});
