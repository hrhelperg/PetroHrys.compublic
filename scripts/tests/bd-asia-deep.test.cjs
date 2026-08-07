'use strict';

// Wave Asia Deep — high-authority Asian directories.
//
// Prioritised by SEO value rather than geography: India first, then China and
// Vietnam, then the smaller Asian markets. The yield was 55 rows, and the two
// things worth protecting are what the wave added at the top of each market and
// what it deliberately refused.
//
// China's highest-value listing surfaces are not directories at all — they are
// the search and map products. Baidu's B2B sourcing platform, Baidu Maps,
// Tencent Maps, Dianping and Meituan are where a Chinese business is actually
// found, and none of them had been reached in five previous waves because
// every earlier sweep looked for something shaped like a yellow pages.
//
// The export promotion councils are the Indian equivalent: eight sector bodies
// whose member exporter directories are public, each gated on membership. They
// are listing opportunities, not registries, and the distinction has to hold.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const DATA = path.join(ROOT, 'data', 'business-directories');
const S = require(path.join(ROOT, 'scripts/lib/bd-schema.cjs'));
const csv = require(path.join(ROOT, 'scripts/lib/bd-csv.cjs'));
const O = require(path.join(ROOT, 'scripts/lib/bd-opportunities.cjs'));

const COUNTRIES = new Set(JSON.parse(
  fs.readFileSync(path.join(DATA, 'countries.json'), 'utf8')).map((c) => c.slug));
const CATEGORIES = new Set(JSON.parse(
  fs.readFileSync(path.join(DATA, 'categories.json'), 'utf8')).map((c) => c.slug));
const DIR = path.join(DATA, 'directories');
const EDITORIAL = fs.readdirSync(DIR).filter((f) => f.endsWith('.json'))
  .flatMap((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')));
const ROWS = O.loadOpportunities(DATA, COUNTRIES, CATEGORIES);
const ALL = [...EDITORIAL, ...ROWS];
const hosts = () => ALL.map((r) => r.website.toLowerCase());

test('the Chinese platform surfaces a business is actually found on are present', () => {
  // Five waves of directory-shaped searching missed these because they are
  // search and map products, not yellow pages. Losing one would quietly remove
  // the most valuable listing route in the market.
  const CHINA_CORE = ['b2b.baidu.com', 'map.baidu.com', 'map.qq.com',
    'dianping.com', 'meituan.com'];
  const listed = hosts();
  for (const core of CHINA_CORE) {
    assert.ok(listed.some((w) => w.includes(core)),
      `${core} is missing; it is one of the highest-value listing surfaces in China`);
  }
});

test('a Chinese platform behind a render gate is unknown, never active', () => {
  // Several Chinese platforms return a shell that needs a browser to render.
  // That says the server answered; it says nothing about the product.
  const gated = ROWS.filter((r) => r.country === 'china'
    && /requires a browser to render|rate-limits automated requests/i.test(r.description || ''));
  assert.ok(gated.length > 0, 'expected render-gated Chinese rows from this wave');
  for (const r of gated) {
    assert.strictEqual(r.currentStatus, 'unknown',
      `${r.id} could not be rendered by the probe, so its status is not established`);
  }
});

test('an export promotion council is a listing opportunity, not a registry', () => {
  // India's sector councils publish member exporter directories. Filing one in
  // the Government Registry pillar would put a membership listing where a
  // source of legal truth belongs. Selected on prose, not on category, so the
  // field under test cannot decide whether the test runs.
  const councils = ROWS.filter((r) => r.country === 'india'
    && /export (promotion )?council|export organisations/i.test(`${r.name} ${r.description || ''}`));
  assert.ok(councils.length >= 6,
    `expected the Indian export councils this wave added, got ${councils.length}`);
  for (const r of councils) {
    assert.ok(!S.isGovernmentPillar(r),
      `${r.id} is a membership exporter directory, not a statutory register`);
  }
});

test('a government trade agency is not published as a business directory', () => {
  // MATRADE, SME Corp Malaysia, Enterprise Singapore, Thailand BOI, Invest
  // India and Startup India were all reachable and all rejected: they are state
  // agencies, and the programme keeps that pillar separate.
  const STATE_AGENCIES = ['matrade.gov.my', 'smecorp.gov.my', 'enterprisesg.gov.sg',
    'boi.go.th', 'investindia.gov.in', 'startupindia.gov.in', 'vietrade.gov.vn'];
  const listed = hosts();
  for (const agency of STATE_AGENCIES) {
    assert.ok(!listed.some((w) => w.includes(agency)),
      `${agency} is a state agency and belongs to the Government Registry pillar, not this list`);
  }
});

test('a company-data product is not published as a listing opportunity', () => {
  // These return company records but offer no profile a business can create or
  // claim, which is the whole test for inclusion.
  const DATA_PRODUCTS = ['tianyancha.com', 'qcc.com', 'tofler.in',
    'instafinancials.com', 'masothue.com', 'sgpbusiness.com'];
  const listed = hosts();
  for (const product of DATA_PRODUCTS) {
    assert.ok(!listed.some((w) => w.includes(product)),
      `${product} publishes company records but offers no profile a business can hold`);
  }
});

test('every Asian row still meets the operational contract', () => {
  const ASIA = ['india', 'china', 'vietnam', 'singapore', 'hong-kong', 'taiwan',
    'malaysia', 'indonesia', 'thailand'];
  const asian = ROWS.filter((r) => ASIA.includes(r.country));
  assert.ok(asian.length >= 130, `expected the accumulated Asian working list, got ${asian.length}`);
  for (const r of asian) {
    assert.ok(r.priority && r.currentStatus, `${r.id} is missing operational fields`);
    assert.ok(Array.isArray(r.audienceGeography) && r.audienceGeography.length,
      `${r.id} has no audienceGeography`);
    assert.match(r.website, /^https:\/\//, `${r.id} is not https`);
    assert.strictEqual(r.domainRating, null, `${r.id} carries a Domain Rating; rows never do`);
  }
});

test('the working list and the export still agree', () => {
  const actionable = csv.actionableOpportunities(EDITORIAL, ROWS);
  const file = path.join(ROOT, 'research', 'business-directories', 'opportunities.csv');
  const dataRows = fs.readFileSync(file, 'utf8').replace(/^﻿/, '')
    .split('\r\n').filter(Boolean).length - 1;
  assert.strictEqual(dataRows, actionable.length,
    'the generated CSV disagrees with the actionable set it is built from');
});
