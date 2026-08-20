'use strict';

// Deep expansion — going deeper inside markets already covered rather than
// adding new ones.
//
// The first pass took the working list to 1,073 opportunities across 92
// geographies by finding each country's obvious directories. This pass went
// after what was skipped: trade associations that publish member directories,
// industry and B2B catalogues, professional bodies, startup hubs, and the
// vertical marketplaces where a business keeps a permanent public profile.
//
// Two failure modes dominated, and both are guarded below.
//
// FIRST: a national institution's domain is not a stable identity. acci.asn.au
// — the Australian Chamber of Commerce and Industry — answers 200 with an
// online-pokies affiliate site. That is the same pattern as brewerydb.com and
// kaznex.kz in earlier waves, except the domain carries a national body's name,
// which is exactly what makes it persuasive.
//
// SECOND: an acronym is not an organisation. Probing association domains by
// their initials returns confident-looking 200s from something else entirely:
// gphc.org.uk is a housing co-operative in Scotland, not the pharmacy
// regulator; pca.org is the Porsche Club of America, not the painting
// contractors; cccc.ca is a church association, not a chamber; anei.es sells
// insurance. Every one of those would have been published on the strength of
// its URL alone.

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

const COUNTRIES = new Set(JSON.parse(
  fs.readFileSync(path.join(DATA, 'countries.json'), 'utf8')).map((c) => c.slug));
const CATEGORIES = new Set(JSON.parse(
  fs.readFileSync(path.join(DATA, 'categories.json'), 'utf8')).map((c) => c.slug));
const DIR = path.join(DATA, 'directories');
const EDITORIAL = fs.readdirSync(DIR).filter((f) => f.endsWith('.json'))
  .flatMap((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')));
const ROWS = O.loadOpportunities(DATA, COUNTRIES, CATEGORIES);
const ALL = [...EDITORIAL, ...ROWS];

test('a national body\'s domain is not trusted on its name alone', () => {
  // acci.asn.au reads as the Australian Chamber of Commerce and Industry and
  // serves a casino affiliate site. The name in the URL is not the evidence.
  const HIJACKED = [
    'acci.asn.au',            // now an online-pokies affiliate site
    'indiabizclub.com',       // Indonesian gambling
    'kaznex.kz',              // Russian casino
    'brewerydb.com',          // Thai lottery
    'caribbeanbusiness.com',  // Vietnamese football streaming
    'evropskadatabanka.cz',   // advertising blog
  ];
  const websites = ALL.map((r) => r.website.toLowerCase());
  for (const bad of HIJACKED) {
    assert.ok(!websites.some((w) => w.includes(bad)),
      `${bad} answers 200 with something other than the organisation it names`);
  }
});

test('an acronym domain is not assumed to be the organisation it suggests', () => {
  // Each of these was reached while looking for a specific trade body and turned
  // out to be an unrelated organisation with the same initials.
  const WRONG_ORGANISATION = [
    'gphc.org.uk',   // a Scottish housing co-operative, not the pharmacy regulator
    'pca.org',       // the Porsche Club of America, not the painting contractors
    'cccc.ca',       // a church association, not a chamber of commerce
    'anei.es',       // an insurance site, not the Spanish digital economy body
    'mitsuri.jp',    // a spiritual counselling practice, not a manufacturing marketplace
    'visittnt.com',  // sells tours of India, not Trinidad and Tobago
    'deutsche-industrie.de', // a commercial property manager
    'cyclex.co.uk',  // a bike hire company, not the Cylex directory
  ];
  const websites = ALL.map((r) => r.website.toLowerCase());
  for (const bad of WRONG_ORGANISATION) {
    assert.ok(!websites.some((w) => w.includes(bad)),
      `${bad} is a different organisation from the one its initials suggest`);
  }
});

test('no row is a local view of a system already listed nationally', () => {
  // Built In runs one company profile that surfaces on whichever city site
  // matches. Seven city domains would have read as seven opportunities and
  // meant one submission. The rule is explicit: never duplicate national and
  // local views of one system.
  const LOCAL_VIEWS = ['builtinnyc.com', 'builtinchicago.org', 'builtinla.com',
    'builtinaustin.com', 'builtinboston.com', 'builtinseattle.com', 'builtincolorado.com'];
  const websites = ALL.map((r) => r.website.toLowerCase());
  const national = websites.some((w) => w.includes('builtin.com'));
  assert.ok(national, 'the national Built In row is missing, so this guard proves nothing');
  for (const view of LOCAL_VIEWS) {
    assert.ok(!websites.some((w) => w.includes(view)),
      `${view} is a city view of builtin.com, not a separate submission`);
  }
});

test('a membership directory is never filed as a statutory register', () => {
  // Trade bodies publish member directories, which is a marketing opportunity.
  // A statutory register is a source of legal truth. Filing one as the other
  // is the mistake `finance` caused in Wave L2.
  //
  // Selecting by category would be self-defeating: setting a row's category to
  // `government` would remove it from the set under test, so the guard would
  // pass on exactly the change it exists to catch. It was written that way
  // first, and the mutation harness reported MISSED. Selecting on the row's own
  // prose keeps the two independent — the category is what is checked, never
  // what decides whether to check.
  const membership = ROWS.filter((r) => /\b(association|chamber|federation|confederation|institute|council)\b/i
    .test(`${r.name} ${r.description || ''}`));
  assert.ok(membership.length >= 40,
    `expected the association families this wave went after, got ${membership.length}`);
  for (const r of membership) {
    assert.ok(!S.isGovernmentPillar(r),
      `${r.id} reads as a membership directory but is filed in the Government Registry pillar`);
  }
});

test('every deep-expansion row still meets the operational contract', () => {
  for (const r of ROWS) {
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
    assert.ok(CATEGORIES.has(r.category), `${r.id} uses an undeclared category`);
  }
});

test('the working list and the export still agree', () => {
  const actionable = csv.actionableOpportunities(EDITORIAL, ROWS);
  const file = path.join(ROOT, 'research', 'business-directories', 'opportunities.csv');
  const dataRows = fs.readFileSync(file, 'utf8').replace(/^﻿/, '')
    .split('\r\n').filter(Boolean).length - 1;
  assert.strictEqual(dataRows, actionable.length,
    'the generated CSV disagrees with the actionable set it is built from');
  assert.ok(actionable.length > 1300, `expected the expanded set, got ${actionable.length}`);
});
