'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'data/product-launch-platforms/platforms.json');
const PAGE = path.join(ROOT, 'research/product-launch-platforms/index.html');
const CSV = path.join(ROOT, 'research/product-launch-platforms/platforms.csv');
const build = require('../build-product-launch-platforms.cjs');
const safeApply = require('../lib/rc-safe-apply.cjs');
const rows = JSON.parse(fs.readFileSync(DATA, 'utf8'));

test('the collection contains exactly 600 ranked unique platforms', () => {
  assert.doesNotThrow(() => build.validate(rows));
  assert.strictEqual(rows.length, 600);
  assert.strictEqual(new Set(rows.map((row) => new URL(row.website).hostname.replace(/^www\./, ''))).size, 600);
});

test('the metrics owner can update only DR fields on this collection', () => {
  const record = structuredClone(rows[0]);
  assert.deepStrictEqual(safeApply.applyPatch(record, {
    domainRating: record.domainRating,
    metricsProvenance: record.metricsProvenance,
  }, { owner: 'metrics', collection: 'product-launch-platforms' }), []);
  assert.throws(() => safeApply.applyPatch(record, { pricing: 'paid' }, {
    owner: 'metrics', collection: 'product-launch-platforms',
  }), /owns only: domainRating, metricsProvenance/);
});

test('follow claims never masquerade as observed backlink evidence', () => {
  const claims = rows.filter((row) => row.followEvidence === 'source-claimed-follow');
  assert.ok(claims.length > 0);
  for (const row of claims) {
    assert.strictEqual(row.evidenceUrl, null, `${row.id} attaches evidence to an unverified claim`);
    assert.match(row.limitations, /not a guaranteed backlink/i, `${row.id} hides its evidence limit`);
    assert.ok(row.sources.some((source) => source.includes('launch-directories.nicklaunches.com')),
      `${row.id} has no source for its follow claim`);
  }
  for (const row of rows.filter((item) => item.followEvidence.startsWith('observed'))) {
    assert.match(row.evidenceUrl, /^https:\/\//, `${row.id} has no public listing evidence`);
  }
});

test('every score is reproducible and the stored order is descending', () => {
  for (const row of rows) assert.strictEqual(row.opportunityScore, build.scoreFor(row), row.id);
  for (let i = 1; i < rows.length; i += 1) {
    assert.ok(rows[i - 1].opportunityScore >= rows[i].opportunityScore,
      `${rows[i - 1].id} and ${rows[i].id} are out of score order`);
  }
});

test('the generated page and CSV contain every platform once', () => {
  const page = fs.readFileSync(PAGE, 'utf8');
  const csv = fs.readFileSync(CSV, 'utf8');
  assert.strictEqual((page.match(/<tr class="bd-row" /g) || []).length, 600);
  assert.strictEqual((page.match(/class="bd-cell bd-cell--stack"/g) || []).length, 1200);
  assert.strictEqual(csv.replace(/^﻿/, '').trim().split(/\r?\n/).length, 601);
  assert.match(page, /<link rel="canonical" href="https:\/\/petrohrys\.com\/research\/product-launch-platforms\/">/);
  assert.doesNotMatch(page, /hreflang="(?:es|fr|de)"/);
  assert.match(page, /https:\/\/ahrefs\.com\/legal\/domain-rating-license/);
  assert.match(page, /https:\/\/developers\.google\.com\/search\/docs\/crawling-indexing\/qualify-outbound-links/);
});

test('the worklist exposes DR sorting and the requested filters', () => {
  const page = fs.readFileSync(PAGE, 'utf8');
  for (const sort of ['as-published', 'domain-rating', 'domain-rating-asc', 'alphabetical']) {
    assert.match(page, new RegExp(`<option value="${sort}">`), `missing ${sort} sort`);
  }
  for (const facet of ['link', 'evidence', 'cost', 'type', 'availability', 'indexability']) {
    assert.match(page, new RegExp(`data-bd-facet="${facet}"`), `missing ${facet} filter`);
    assert.match(page, new RegExp(`data-bd-facet-${facet}="`), `rows omit ${facet} values`);
  }
  assert.match(page, /data-bd-min-dr/);
  assert.match(page, /data-bd-search/);
  assert.match(page, /data-bd-clear/);
});

test('the Research hub and sitemap expose the collection', () => {
  const hub = fs.readFileSync(path.join(ROOT, 'research/index.html'), 'utf8');
  const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  assert.match(hub, /href="\/research\/product-launch-platforms\/"/);
  assert.match(sitemap, /https:\/\/petrohrys\.com\/research\/product-launch-platforms\//);
});
