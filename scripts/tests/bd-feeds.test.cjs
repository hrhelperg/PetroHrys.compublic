// scripts/tests/bd-feeds.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { renderSitemap, renderRss } = require('../lib/bd-feeds.cjs');

test('sitemap emits a valid xml declaration and urlset', () => {
  const xml = renderSitemap([{ path: '/research/business-directories/' }]);
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(xml.includes('http://www.sitemaps.org/schemas/sitemap/0.9'));
  assert.ok(xml.trimEnd().endsWith('</urlset>'));
});

test('sitemap urls use the apex origin', () => {
  const xml = renderSitemap([{ path: '/research/business-directories/' }]);
  assert.ok(xml.includes('<loc>https://petrohrys.com/research/business-directories/</loc>'));
  assert.ok(!xml.includes('<loc>https://www.petrohrys.com/'),
    'www would make every sitemap entry redirect');
});

test('sitemap with no entries is still valid and contains no url elements', () => {
  const xml = renderSitemap([]);
  assert.ok(xml.includes('<urlset'));
  assert.ok(!xml.includes('<url>'));
});

test('sitemap emits lastmod only when supplied', () => {
  assert.ok(renderSitemap([{ path: '/a/', lastmod: '2026-08-01' }]).includes('<lastmod>2026-08-01</lastmod>'));
  assert.ok(!renderSitemap([{ path: '/a/' }]).includes('<lastmod>'));
});

test('rss with no items is a valid empty channel', () => {
  const xml = renderRss([]);
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(xml.includes('<channel>'));
  assert.ok(!xml.includes('<item>'));
  assert.ok(xml.trimEnd().endsWith('</rss>'));
});

test('rss escapes ampersands in titles', () => {
  const xml = renderRss([{
    title: 'A & B', path: '/a/', description: 'x', pubDate: 'Sat, 01 Aug 2026 00:00:00 GMT',
  }]);
  assert.ok(xml.includes('A &amp; B'));
});
