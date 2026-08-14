'use strict';

// Structural and accessibility contracts that every public page must satisfy.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
//
// A mutation that deleted `<main id="main">` from a page survived the entire
// 1,477-test suite. Nothing asserted the landmark existed — which is also why
// /es/research/, /fr/research/ and /de/research/ shipped for months with no
// <main> at all, an unclosed <header>, and a skip link pointing at an anchor
// that was not on the page. Three real defects that no test could see.
//
// These assertions are deliberately about the DOCUMENT, not about any one
// generator, so a page is covered the moment it exists regardless of which
// build produced it or whether it was hand-authored.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'startups-app', 'docs', 'scripts',
  'data', 'css', 'js', 'images', 'fonts', 'content']);

function htmlFiles(dir = ROOT, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (dir === ROOT && SKIP_DIRS.has(e.name)) continue;
      htmlFiles(p, out);
    } else if (e.name.endsWith('.html')) out.push(path.relative(ROOT, p).replace(/\\/g, '/'));
  }
  return out;
}

const pages = htmlFiles();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('the page set is not empty', () => {
  assert.ok(pages.length > 1000, `expected the full site, found ${pages.length} pages`);
});

test('every page has exactly one main landmark', () => {
  const offenders = [];
  for (const rel of pages) {
    const count = (read(rel).match(/<main[\s>]/g) || []).length;
    if (count !== 1) offenders.push(`${rel}: ${count} <main> elements`);
  }
  assert.deepStrictEqual(offenders.slice(0, 12), [], offenders.join('\n'));
});

test('every skip link points at an anchor that exists on the page', () => {
  // The defect this catches is silent: a skip link is invisible until a keyboard
  // user presses Tab, so a broken target is discovered by exactly the people it
  // was supposed to help, and by nobody else.
  const offenders = [];
  for (const rel of pages) {
    const html = read(rel);
    const target = (html.match(/class="skip" href="#([^"]+)"/) || [])[1];
    if (!target) { offenders.push(`${rel}: no skip link`); continue; }
    if (!new RegExp(`id="${target}"`).test(html)) {
      offenders.push(`${rel}: skip link targets #${target}, which is not on the page`);
    }
  }
  assert.deepStrictEqual(offenders.slice(0, 12), [], offenders.join('\n'));
});

test('every page has exactly one h1', () => {
  const offenders = [];
  for (const rel of pages) {
    const count = (read(rel).match(/<h1[\s>]/g) || []).length;
    if (count !== 1) offenders.push(`${rel}: ${count} <h1> elements`);
  }
  assert.deepStrictEqual(offenders.slice(0, 12), [], offenders.join('\n'));
});

test('every page closes the elements it opens', () => {
  // Not a full parser — just the landmark elements, which is where the real
  // breakage was: the localized Research hubs opened <header> and never closed
  // it, and carried a </main> with no opening tag.
  const offenders = [];
  for (const rel of pages) {
    const html = read(rel);
    for (const tag of ['header', 'main', 'footer', 'nav', 'article']) {
      const open = (html.match(new RegExp(`<${tag}[\\s>]`, 'g')) || []).length;
      const close = (html.match(new RegExp(`</${tag}>`, 'g')) || []).length;
      if (open !== close) offenders.push(`${rel}: ${open} <${tag}> vs ${close} </${tag}>`);
    }
  }
  assert.deepStrictEqual(offenders.slice(0, 12), [], offenders.join('\n'));
});

test('no page carries a duplicate element id', () => {
  const offenders = [];
  for (const rel of pages) {
    const ids = [...read(rel).matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    const seen = new Set();
    const dup = new Set();
    for (const id of ids) { if (seen.has(id)) dup.add(id); seen.add(id); }
    if (dup.size) offenders.push(`${rel}: duplicate id(s) ${[...dup].join(', ')}`);
  }
  assert.deepStrictEqual(offenders.slice(0, 12), [], offenders.join('\n'));
});

test('tracking is present exactly once per page', () => {
  // Duplicated analytics double-counts every visit, and a duplicated consent
  // script can race with itself. Checked per page rather than per generator so
  // a hand-authored page cannot drift away from the rule.
  const offenders = [];
  for (const rel of pages) {
    const html = read(rel);
    const counts = {
      consent: (html.match(/\/js\/consent\.js/g) || []).length,
      webmasterid: (html.match(/webmasterid-tracker/g) || []).length,
      ga: (html.match(/googletagmanager\.com\/gtag\/js/g) || []).length,
    };
    for (const [name, n] of Object.entries(counts)) {
      if (n !== 1) offenders.push(`${rel}: ${name} appears ${n} times`);
    }
  }
  assert.deepStrictEqual(offenders.slice(0, 12), [], offenders.join('\n'));
});

test('every image has an alt attribute', () => {
  const offenders = [];
  for (const rel of pages) {
    for (const img of read(rel).match(/<img\b[^>]*>/g) || []) {
      if (!/\salt=/.test(img)) offenders.push(`${rel}: ${img.slice(0, 80)}`);
    }
  }
  assert.deepStrictEqual(offenders.slice(0, 12), [], offenders.join('\n'));
});

test('every JSON-LD block parses', () => {
  const offenders = [];
  for (const rel of pages) {
    for (const m of read(rel).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      try { JSON.parse(m[1]); } catch (e) { offenders.push(`${rel}: ${e.message}`); }
    }
  }
  assert.deepStrictEqual(offenders.slice(0, 12), [], offenders.join('\n'));
});
