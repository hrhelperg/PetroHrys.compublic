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
// These tests hold the fix at the Research hub and sitemap, where collection
// discovery belongs without duplicating the whole catalog in every footer.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const render = require('../lib/bd-render.cjs');
const seo = require('../lib/bd-seo.cjs');

const LINK = '/research/marketplaces/';
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('the shared collection route cannot drift from its canonical page', () => {
  assert.strictEqual(render.MARKETPLACES_PATH, seo.buildMarketplacesMeta({ count: 1, countries: 1 }).canonicalPath,
    'the shared marketplace route and canonical path disagree');
  assert.ok(fs.existsSync(path.join(ROOT, render.MARKETPLACES_PATH.replace(/^\//, ''), 'index.html')),
    `${render.MARKETPLACES_PATH} was never generated`);
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

test('the collection is in the site sitemap', () => {
  const sitemap = read('sitemap.xml');
  assert.ok(sitemap.includes(`https://petrohrys.com${LINK}`),
    'the marketplaces collection is missing from sitemap.xml');
  // And the section sitemap still belongs to the directory build alone: the
  // marketplace build owns only its own directory and must not have reached in.
  const mp = JSON.parse(read('data/marketplaces/.build-manifest.json'));
  const I18N_T = require(path.join(ROOT, 'scripts/lib/i18n.cjs'));
  // Localization made the section multi-prefixed; the property is unchanged.
  const ownsRoute = (x) => I18N_T.LOCALE_CODES
    .some((l) => x.startsWith(I18N_T.localizedPath(l, '/research/marketplaces/').replace(/^\//, '')));
  for (const f of mp.files) {
    assert.ok(ownsRoute(f), `the manifest claims ${f}, outside its own routes`);
  }
});

test('the collection stays reachable without duplicating it in every footer', () => {
  assert.ok(read('research/index.html').includes(`href="${LINK}"`));
  assert.ok(read('sitemap.xml').includes(`https://petrohrys.com${LINK}`));
});
