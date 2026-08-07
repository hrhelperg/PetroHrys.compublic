'use strict';
// The marketplace dataset was unreachable.
//
// 286 platforms across 75 countries were researched, validated, rendered and
// exported — and not one page on the site linked to /research/marketplaces/.
// It had no entry in the site sitemap either. The page existed and could only
// be found by already knowing its URL, which is the same failure the business
// directory worklist hit earlier and for the same reason: the build that
// generates a collection is a sibling of the site, and nothing made the site
// aware the collection had appeared.
//
// These tests hold the fix. The important one is the last: the footer path and
// the build's canonical path are asserted equal, so the link cannot rot into a
// 404 the next time either side moves.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const render = require('../lib/bd-render.cjs');
const seo = require('../lib/bd-seo.cjs');

const LINK = '/research/marketplaces/';
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// The hand-written pages carrying the site's own footer. The generated pages
// take theirs from bd-render.cjs and are checked separately.
const HAND_WRITTEN = ['index.html', 'work/index.html', 'writing/index.html', 'research/index.html',
  'essays/index.html', 'ai-systems/index.html', 'infrastructure/index.html', 'about/index.html',
  'de/index.html', 'es/index.html', 'fr/index.html'];

test('the collection cannot drift out of the footer that links it', () => {
  // The one guard that matters. bd-render.cjs cannot import the marketplace
  // build's routes — it is a different build with a different manifest — so the
  // path is written down twice. Asserting the two copies are equal is what
  // stops the second one going stale silently.
  assert.strictEqual(render.MARKETPLACES_PATH, seo.buildMarketplacesMeta({ count: 1, countries: 1 }).canonicalPath,
    'the footer link and the page it points at disagree about the path');
  assert.ok(fs.existsSync(path.join(ROOT, render.MARKETPLACES_PATH.replace(/^\//, ''), 'index.html')),
    `the footer links ${render.MARKETPLACES_PATH}, which was never generated`);
});

test('the Research Center presents the collection, not merely mentions it', () => {
  const html = read('research/index.html');
  assert.ok(html.includes(`href="${LINK}"`), 'the Research Center does not link the marketplaces');
  // Inside the Collections section, alongside the other two databases — a
  // passing mention in a footnote is how the worklist became unfindable before.
  const start = html.indexOf('id="collections"');
  assert.ok(start > -1, 'the Research Center has no Collections section');
  const section = html.slice(start, html.indexOf('</section>', start));
  assert.ok(section.includes(LINK), 'the marketplaces are not listed among the collections');
  assert.ok(section.includes('/research/business-directories/opportunities/'),
    'the collections list lost the worklist');
  assert.ok(/Marketplace &amp; Classified Platforms/.test(section),
    'the collection is linked without being named');
});

test('every hand-written page carries the link in its footer', () => {
  for (const rel of HAND_WRITTEN) {
    const html = read(rel);
    const footer = html.slice(html.indexOf('<footer role="contentinfo">'));
    assert.ok(footer.includes(`href="${LINK}"`), `${rel} has no marketplaces link in its footer`);
    assert.ok(footer.includes('href="/research/business-directories/"'),
      `${rel} has no business directories link in its footer`);
  }
});

test('every generated research page carries the link in its footer', () => {
  // Sampled across the tree rather than exhaustively: they all come from one
  // renderer, so a sample that spans several sections proves the renderer, and
  // an exhaustive walk of thousands of files buys nothing extra.
  const sampled = [];
  const walk = (dir, depth) => {
    if (depth > 3 || sampled.length >= 40) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (sampled.length >= 40) return;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (e.name === 'index.html') sampled.push(path.relative(ROOT, p));
    }
  };
  walk(path.join(ROOT, 'research'), 0);
  assert.ok(sampled.length >= 20, `only ${sampled.length} generated pages found to sample`);
  for (const rel of sampled) {
    const html = read(rel);
    const footer = html.slice(html.indexOf('<footer role="contentinfo">'));
    assert.ok(footer.includes(LINK), `${rel} has no marketplaces link in its footer`);
  }
});

test('the marketplaces page marks itself current and does not link to itself elsewhere', () => {
  const html = read('research/marketplaces/index.html');
  const footer = html.slice(html.indexOf('<footer role="contentinfo">'));
  assert.match(footer, new RegExp(`href="${LINK}" aria-current="page"`),
    'the marketplaces page does not mark its own footer link as current');
  // Exactly one current item in the footer's Research & Writing column.
  assert.strictEqual((footer.match(/aria-current="page"/g) || []).length, 1,
    'more than one footer link claims to be the current page');
});

test('the collection is in the site sitemap', () => {
  const sitemap = read('sitemap.xml');
  assert.ok(sitemap.includes(`https://petrohrys.com${LINK}`),
    'the marketplaces collection is missing from sitemap.xml');
  // And the section sitemap still belongs to the directory build alone: the
  // marketplace build owns only its own directory and must not have reached in.
  const mp = JSON.parse(read('data/marketplaces/.build-manifest.json'));
  for (const f of mp.files) {
    assert.ok(f.startsWith('research/marketplaces/'),
      `the marketplace build claims ${f}, which is outside its own directory`);
  }
});

test('the link count is high enough that removing one page cannot re-orphan it', () => {
  let inbound = 0;
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === 'index.html' && !p.includes('/marketplaces/')
        && fs.readFileSync(p, 'utf8').includes(LINK)) inbound += 1;
    }
  };
  walk(path.join(ROOT, 'research'));
  for (const rel of HAND_WRITTEN) if (read(rel).includes(LINK)) inbound += 1;
  assert.ok(inbound >= 30, `only ${inbound} pages link the collection; it is effectively unreachable`);
});
