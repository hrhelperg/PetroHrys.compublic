'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.resolve(__dirname, '..', '..');
const F = require('../lib/forum-schema.cjs');
const I18N = require('../lib/i18n.cjs');
const BUILD = require('../build-forums.cjs');
const RENDER = require('../lib/bd-render.cjs');

const rows = () => F.load(path.join(ROOT, 'data/forums/forums.json'));
const pageFor = (locale) => path.join(ROOT, I18N.localizedFile(locale, BUILD.ROUTE));
const digest = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

test('Forum canonical corpus meets the hard acceptance gate with zero duplicate identities', () => {
  const all = rows();
  assert.ok(all.length >= 1500, `only ${all.length} canonical Forums`);
  assert.equal(new Set(all.map(F.identityKey)).size, all.length);
  assert.equal(new Set(all.map((r) => r.id)).size, all.length);
  assert.ok(all.every((r) => ['DIRECT_HTTP', 'DIRECT_BROWSER'].includes(r.verification.method)));
});

test('Forum V1 contains no posting, actionability or link-value inference', () => {
  const forbidden = ['authorityScore', 'seoScore', 'qualityScore', 'bestForumScore', 'trustScore',
    'publicationValue', 'backlinkType', 'listingIndexability', 'registrationAccess', 'postingAccess',
    'freePosting', 'signatureLinks', 'profileLinks', 'plannerStatus', 'readiness'];
  for (const r of rows()) for (const key of forbidden) assert.ok(!(key in r), `${r.id} contains ${key}`);
});

test('all four Forum pages are self-canonical, reciprocal and indexable', () => {
  const identities = rows().map((r) => r.url).sort();
  for (const locale of I18N.LOCALE_CODES) {
    const html = fs.readFileSync(pageFor(locale), 'utf8');
    const self = `https://petrohrys.com${I18N.localizedPath(locale, BUILD.ROUTE)}`;
    assert.match(html, new RegExp(`<html lang="${locale}`));
    assert.ok(html.includes(`<link rel="canonical" href="${self}">`));
    assert.ok(!/<meta name="robots" content="noindex/.test(html));
    assert.equal((html.match(/<h1>/g) || []).length, 1);
    assert.equal((html.match(/rel="alternate" hreflang=/g) || []).length, 5);
    const pageIds = [...html.matchAll(/data-bd-export-url="([^"]+)"/g)]
      .map((m) => m[1].replace(/&amp;/g, '&')).sort();
    assert.deepEqual(pageIds, identities, `${locale} rendered a divergent dataset`);
  }
});

test('Forum pages retain the shared analytics/consent bytes and valid JSON-LD', () => {
  for (const locale of I18N.LOCALE_CODES) {
    const html = fs.readFileSync(pageFor(locale), 'utf8');
    assert.ok(html.includes(RENDER.ANALYTICS), `${locale} analytics/consent bytes drifted`);
    const block = html.match(/<script type="application\/ld\+json">\n([\s\S]*?)\n  <\/script>/);
    assert.ok(block, `${locale} JSON-LD missing`);
    const parsed = JSON.parse(block[1]);
    assert.equal(parsed['@context'], 'https://schema.org');
    assert.ok(Array.isArray(parsed['@graph']) && parsed['@graph'].length >= 2);
  }
});

test('the sitemap adds exactly the four bare locale routes', () => {
  const xml = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  const urls = [...xml.matchAll(/<loc>([^<]*\/research\/forums\/[^<]*)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(urls.sort(), I18N.LOCALE_CODES.map((locale) =>
    `https://petrohrys.com${I18N.localizedPath(locale, BUILD.ROUTE)}`).sort());
  assert.ok(urls.every((url) => !url.includes('?')));
});

test('the static CSV is one factual row per canonical Forum', () => {
  const csv = fs.readFileSync(path.join(ROOT, 'research/forums/forums.csv'), 'utf8').replace(/^\uFEFF/, '');
  assert.equal(csv.trim().split('\r\n').length - 1, rows().length);
  assert.equal(csv.split('\r\n')[0], BUILD.EXPORT_COLUMNS.join(','));
  for (const forbidden of ['backlink', 'posting', 'registration', 'readiness', 'planner']) {
    assert.ok(!csv.split('\r\n')[0].includes(forbidden));
  }
});

test('Forum HTML stays below the existing Country Intelligence raw budget', () => {
  const forum = fs.readFileSync(pageFor('en'));
  const countries = fs.readFileSync(path.join(ROOT, 'research/countries/index.html'));
  assert.ok(forum.length <= countries.length,
    `Forums ${forum.length} bytes exceeds Country Intelligence ${countries.length}`);
  assert.ok(zlib.gzipSync(forum).length < 500000, 'compressed Forum page exceeds 500 KB');
});

test('the Forum generator is byte-idempotent and writes no network output', () => {
  const files = [...I18N.LOCALE_CODES.map(pageFor), path.join(ROOT, 'research/forums/forums.csv'),
    path.join(ROOT, 'data/forums/.build-manifest.json')];
  const before = Object.fromEntries(files.map((f) => [f, digest(f)]));
  const messages = [];
  const log = console.log;
  console.log = (...args) => messages.push(args.join(' '));
  try { BUILD.main(); } finally { console.log = log; }
  const after = Object.fromEntries(files.map((f) => [f, digest(f)]));
  assert.deepEqual(after, before);
  assert.ok(messages.some((x) => /0 written, 0 pruned/.test(x)), messages.join('\n'));
});
