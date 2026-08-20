'use strict';

// Wave L2 — North America expansion.
//
// 177 Level 1 operational rows across the United States, Canada, Mexico,
// Central America and the Caribbean, plus fourteen newly declared geographies
// that hold rows but generate no pages of their own.
//
// The guards here protect what this wave learned the hard way.
//
// Two more domains answered 200 while serving something else entirely:
// brewerydb.com now serves a Thai lottery site, caribbeanbusiness.com a
// Vietnamese football stream. Wave L1 found the same pattern in Czechia and
// Poland. A 200 is not evidence that a domain still hosts the platform it is
// named after, and neither is a familiar brand in the URL.
//
// Two more were shut down by their own operators and said so on the page:
// ourbis.ca ("Thank You - Shutting Down") and segundamano.mx ("ha sido dado de
// baja"). Both were reachable. Reachable is not the same as operating.
//
// And visittnt.com — reached while looking for a Trinidad and Tobago directory
// — sells guided tours of India. A national-sounding domain is not evidence of
// a national platform.

const test = require('node:test');
const SCHEMA_DR = require('../lib/bd-schema.cjs');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const DATA = path.join(ROOT, 'data', 'business-directories');
const S = require(path.join(ROOT, 'scripts/lib/bd-schema.cjs'));
const csv = require(path.join(ROOT, 'scripts/lib/bd-csv.cjs'));
const O = require(path.join(ROOT, 'scripts/lib/bd-opportunities.cjs'));

const COUNTRIES_RAW = JSON.parse(fs.readFileSync(path.join(DATA, 'countries.json'), 'utf8'));
const COUNTRIES = new Set(COUNTRIES_RAW.map((c) => c.slug));
const CATEGORIES = new Set(JSON.parse(
  fs.readFileSync(path.join(DATA, 'categories.json'), 'utf8')).map((c) => c.slug));

const DIR = path.join(DATA, 'directories');
const EDITORIAL = fs.readdirSync(DIR).filter((f) => f.endsWith('.json'))
  .flatMap((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')));
const ROWS = O.loadOpportunities(DATA, COUNTRIES, CATEGORIES);

// The fourteen geographies this wave declared, plus the three primary markets.
const NEW_GEOGRAPHIES = ['puerto-rico', 'costa-rica', 'panama', 'dominican-republic',
  'jamaica', 'guatemala', 'honduras', 'el-salvador', 'nicaragua', 'belize',
  'trinidad-and-tobago', 'bahamas', 'barbados', 'cuba'];
const NORTH_AMERICA = ['united-states', 'canada', 'mexico', ...NEW_GEOGRAPHIES];

test('no row points at a domain serving something other than its platform', () => {
  // Every one of these answered 200 during research. What they answered WITH is
  // the reason each is excluded.
  const NOT_WHAT_IT_SAYS = [
    'brewerydb.com',          // now a Thai online-lottery site
    'caribbeanbusiness.com',  // now a Vietnamese football-streaming site
    'visittnt.com',           // sells guided tours of India, not Trinidad
    'yasabe.com',             // was a Hispanic business directory; now unrelated
    'magicyellow.com',        // parking page
    'belizedirectory.com',    // for sale
    'gymfinder.com',          // for sale
    'didifood.com.mx',        // for sale
    'wag.com',                // resolves into an unrelated retail page
  ];
  const websites = [...EDITORIAL, ...ROWS].map((r) => r.website.toLowerCase());
  for (const bad of NOT_WHAT_IT_SAYS) {
    assert.ok(!websites.some((w) => w.includes(bad)),
      `${bad} no longer serves the platform it is named after and must not be listed`);
  }
});

test('no row points at a platform whose operator announced a shutdown', () => {
  // Both of these were REACHABLE. The shutdown notice was on the page itself,
  // which is why a reachability probe alone cannot be the whole test.
  const SHUT_DOWN = ['ourbis.ca', 'segundamano.mx'];
  const websites = [...EDITORIAL, ...ROWS].map((r) => r.website.toLowerCase());
  for (const bad of SHUT_DOWN) {
    assert.ok(!websites.some((w) => w.includes(bad)),
      `${bad} announced its own shutdown on the page and must not be listed`);
  }
});

test('every newly declared geography holds rows or holds nothing at all', () => {
  // Declaring a geography must not conjure a page. A country page exists only
  // where EDITORIAL records exist, and this wave added none — so all fourteen
  // surface under "Other countries" on the working list instead.
  for (const slug of NEW_GEOGRAPHIES) {
    assert.ok(COUNTRIES.has(slug), `${slug} was never declared`);
    const editorial = EDITORIAL.filter((r) => r.country === slug);
    assert.strictEqual(editorial.length, 0,
      `${slug} has editorial records, which would generate a page this wave never researched`);
    const outDir = path.join(ROOT, 'research', 'business-directories', slug);
    assert.ok(!fs.existsSync(outDir), `${slug} generated a page it has no editorial content for`);
  }
});

test('a declared geography with no rows generates nothing', () => {
  // Cuba was declared and researched; no platform met the bar. It must stay
  // empty rather than acquire a placeholder to make the table look complete.
  const cuba = [...EDITORIAL, ...ROWS].filter((r) => r.country === 'cuba');
  assert.strictEqual(cuba.length, 0,
    'Cuba has entries now — if that is deliberate, update this guard along with the research note');
});

test('North American rows carry the operational fields an employee needs', () => {
  const na = ROWS.filter((r) => NORTH_AMERICA.includes(r.country));
  assert.ok(na.length >= 150, `expected a substantial North American working list, got ${na.length}`);
  for (const r of na) {
    assert.ok(r.priority, `${r.id} has no priority`);
    assert.ok(r.currentStatus, `${r.id} has no currentStatus`);
    assert.ok(Array.isArray(r.audienceGeography) && r.audienceGeography.length,
      `${r.id} has no audienceGeography`);
    assert.match(r.website, /^https:\/\//, `${r.id} is not https`);
    // An operational row now carries the rating measured for its own domain.
    // This asserted `null` because a row was once forbidden a reading at all —
    // and that ban was what made 1533 of 1610 worklist rows render blank while
    // every canonical file held a measured value. What still must not happen is
    // an INVENTED one, so the shared rule is asserted instead: 0-100, whole,
    // with provenance naming the provider, the date and the domain measured.
    assert.deepStrictEqual(SCHEMA_DR.domainRatingProblems(r), [],
      `${r.id} carries a Domain Rating that is not fully evidenced`);
  }
});

test('a tourism board listing is never filed as a government record', () => {
  // Several Central American and Caribbean rows are national tourism sites.
  // They list hotels and operators, which is a marketing opportunity — they are
  // not registries, and filing one under the government pillar would put a
  // marketing listing where a source of legal truth belongs.
  const tourism = ROWS.filter((r) => /official .* tourism site/i.test(r.description || ''));
  assert.ok(tourism.length > 0, 'expected tourism-board rows from this wave');
  for (const r of tourism) {
    assert.ok(!S.isGovernmentPillar(r),
      `${r.id} is a destination marketing listing, not a statutory register`);
  }
});

test('the merged actionable set stays consistent across every consumer', () => {
  // One definition feeds the CSV, the page count and the filters. If these ever
  // disagree, the site states a number it cannot back up.
  const viaCsv = csv.actionableOpportunities(EDITORIAL, ROWS);
  const viaMerge = O.mergedActionable(EDITORIAL, ROWS);
  assert.strictEqual(viaCsv.length, viaMerge.length);
  const csvFile = path.join(ROOT, 'research', 'business-directories', 'opportunities.csv');
  const dataRows = fs.readFileSync(csvFile, 'utf8').replace(/^﻿/, '')
    .split('\r\n').filter(Boolean).length - 1;
  assert.strictEqual(dataRows, viaCsv.length,
    'the generated CSV disagrees with the actionable set it is built from');
});
