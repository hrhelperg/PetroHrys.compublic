'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'data/product-launch-platforms/platforms.json');
const PAGE = path.join(ROOT, 'research/product-launch-platforms/index.html');
const CSV = path.join(ROOT, 'research/product-launch-platforms/platforms.csv');
const QUALITY_FINDINGS = path.join(ROOT, 'data/product-launch-platforms/.quality-findings.json');
const EVIDENCE_FINDINGS = path.join(ROOT, 'data/product-launch-platforms/.evidence-resolution-findings.json');
const build = require('../build-product-launch-platforms.cjs');
const safeApply = require('../lib/rc-safe-apply.cjs');
const rows = JSON.parse(fs.readFileSync(DATA, 'utf8'));

test('the collection remains an expanding ranked set of unique platforms', () => {
  assert.doesNotThrow(() => build.validate(rows));
  assert.ok(rows.length >= 960);
  assert.strictEqual(new Set(rows.map((row) => new URL(row.website).hostname.replace(/^www\./, ''))).size, rows.length);
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
  const claims = rows.filter((row) => row.followEvidence.startsWith('source-claimed-'));
  assert.ok(claims.length > 0);
  for (const row of claims) {
    assert.strictEqual(row.evidenceUrl, null, `${row.id} attaches evidence to an unverified claim`);
    assert.match(row.limitations, /not a guaranteed backlink|not guaranteed backlink|rather than guaranteed backlink evidence/i,
      `${row.id} hides its evidence limit`);
    assert.ok(row.sources.some((source) => /launch-directories\.nicklaunches\.com|submitmap\.com\/platform\//.test(source)),
      `${row.id} has no source for its follow claim`);
  }
  for (const row of rows.filter((item) => item.followEvidence.startsWith('observed'))) {
    assert.match(row.evidenceUrl, /^https:\/\//, `${row.id} has no public listing evidence`);
  }
});

test('all former unknowns have a truthful terminal evidence resolution', () => {
  const findings = JSON.parse(fs.readFileSync(EVIDENCE_FINDINGS, 'utf8'));
  assert.strictEqual(findings.initialUnknownIds.length, 582);
  assert.strictEqual(findings.findings.length, 582);
  assert.strictEqual(new Set(findings.findings.map((finding) => finding.id)).size, 582);
  assert.strictEqual(rows.filter((row) => row.followEvidence === 'unknown').length, 0);
  for (const id of findings.initialUnknownIds) {
    const row = rows.find((item) => item.id === id);
    assert.ok(row, `${id} disappeared during evidence resolution`);
    assert.notStrictEqual(row.followEvidence, 'unknown', `${id} remained unknown`);
    assert.match(row.limitations, /observed|claims|protected|unreachable|no verifiable|not applicable/i,
      `${id} does not disclose its evidence limit`);
  }
});

test('every score is reproducible and the stored order uses deterministic evidence-first ties', () => {
  for (const row of rows) assert.strictEqual(row.opportunityScore, build.scoreFor(row), row.id);
  for (let i = 1; i < rows.length; i += 1) {
    assert.ok(build.compareForRanking(rows[i - 1], rows[i]) <= 0,
      `${rows[i - 1].id} and ${rows[i].id} are out of score order`);
  }
});

test('verified actionability outranks raw authority', () => {
  const base = structuredClone(rows.find((row) => row.followEvidence === 'unverified-no-template'));
  const authorityOnly = { ...base, domainRating: 100, submissionUrl: null,
    submissionRouteObserved: false, listingIndexability: 'unknown' };
  authorityOnly.opportunityScore = build.scoreFor(authorityOnly);
  const verified = { ...base, domainRating: 5, submissionUrl: 'https://example.com/submit',
    submissionRouteObserved: true, followEvidence: 'observed-follow',
    evidenceUrl: 'https://example.com/listing', listingIndexability: 'indexable' };
  verified.opportunityScore = build.scoreFor(verified);
  assert.ok(verified.opportunityScore > authorityOnly.opportunityScore);
  assert.ok(build.compareForRanking(verified, authorityOnly) < 0);
});

test('the generated page and CSV contain every platform once', () => {
  const page = fs.readFileSync(PAGE, 'utf8');
  const csv = fs.readFileSync(CSV, 'utf8');
  assert.strictEqual((page.match(/<tr class="bd-row" /g) || []).length, rows.length);
  assert.strictEqual((page.match(/class="bd-cell bd-cell--stack"/g) || []).length, rows.length * 2);
  assert.strictEqual(csv.replace(/^﻿/, '').trim().split(/\r?\n/).length, rows.length + 1);
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
  for (const facet of ['quality', 'link', 'evidence', 'cost', 'type', 'availability', 'indexability']) {
    assert.match(page, new RegExp(`data-bd-facet="${facet}"`), `missing ${facet} filter`);
    assert.match(page, new RegExp(`data-bd-facet-${facet}="`), `rows omit ${facet} values`);
  }
  assert.match(page, /data-bd-min-dr/);
  assert.match(page, /data-bd-search/);
  assert.match(page, /data-bd-clear/);
  assert.match(page, /Recommended order/);
});

test('the quality wave publishes actionable candidates without reciprocal-link requirements', () => {
  const findings = JSON.parse(fs.readFileSync(QUALITY_FINDINGS, 'utf8'));
  const additions = rows.filter((row) => row.shortNote.includes('quality audit'));
  assert.ok(additions.length >= 60);
  for (const row of additions) {
    assert.strictEqual(build.qualityTierFor(row), 'actionable', row.id);
    assert.strictEqual(row.submissionRouteObserved, true, row.id);
    assert.match(row.limitations, /no required reciprocal backlink/i, row.id);
    assert.ok(row.sources.some((source) => /submitmap\.com\/platform\//.test(source)), row.id);
  }
  assert.ok(findings.details.filter((row) => row.backlinkRequired === 'Yes').length >= 50,
    'reciprocal-link candidates disappeared instead of remaining research findings');
});

test('the Research hub and sitemap expose the collection', () => {
  const hub = fs.readFileSync(path.join(ROOT, 'research/index.html'), 'utf8');
  const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  assert.match(hub, /href="\/research\/product-launch-platforms\/"/);
  assert.match(sitemap, /https:\/\/petrohrys\.com\/research\/product-launch-platforms\//);
});
