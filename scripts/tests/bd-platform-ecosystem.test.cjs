'use strict';

// Wave X — platform ecosystem expansion.
//
// This wave went after promotion platforms that are not traditional business
// directories: review platforms, startup launch communities, industrial
// marketplaces, agency directories, and innovation hubs. Fifty-one of the
// sixty-nine platforms the brief named were already in the dataset, so most of
// the work was finding what sits beside them — and, more often, establishing
// that a plausible-looking candidate did NOT qualify.
//
// Three rejection rules did most of the work, and each is guarded here.
//
// ONE OPERATOR, ONE SUBMISSION. VirtualExpo runs DirectIndustry, MedicalExpo,
// ArchiExpo, NauticExpo, AeroExpo and AgriExpo from a single supplier account.
// Six live marketplaces, six sets of public profiles, one submission. They are
// one opportunity, and DirectIndustry already represents it.
//
// A LIVE HOMEPAGE IS NOT A PUBLIC DIRECTORY. Twenty-five city chambers of
// commerce answered 200. Probing their member directories by convention found
// mostly soft-redirects back to the homepage — and, at Detroit, a genuine page
// that turned out to list Leadership Alumni rather than member businesses. The
// brief is explicit that an association without searchable public listings is
// rejected, so twenty-four were held back and one, whose directory page was
// confirmed, was published.
//
// REVIEW SOFTWARE IS NOT A REVIEW PLATFORM. Trustindex, ReviewGrower, Yotpo,
// Judge.me, Okendo, Stamped and Bazaarvoice all sell review collection. A
// business does not get a public profile on them; it embeds a widget.

const test = require('node:test');
const SCHEMA_DR = require('../lib/bd-schema.cjs');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const DATA = path.join(ROOT, 'data', 'business-directories');
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

test('a network of vertical marketplaces sharing one account is one row', () => {
  // VirtualExpo's six verticals are one supplier registration. DirectIndustry
  // stands for the group; the rest would each have been a second listing of the
  // same submission flow.
  const SAME_ACCOUNT = ['medicalexpo.com', 'archiexpo.com', 'nauticexpo.com',
    'aeroexpo.online', 'agriexpo.online', 'virtualexpo.com'];
  const listed = hosts();
  assert.ok(listed.some((w) => w.includes('directindustry')),
    'the DirectIndustry row is missing, so this guard proves nothing');
  for (const sibling of SAME_ACCOUNT) {
    assert.ok(!listed.some((w) => w.includes(sibling)),
      `${sibling} shares one supplier account with DirectIndustry and is not a second opportunity`);
  }
});

test('review collection software is never listed as a review platform', () => {
  // On these a business embeds a widget; it does not receive a public profile.
  const REVIEW_SOFTWARE = ['trustindex.io', 'reviewgrower.com', 'yotpo.com',
    'judge.me', 'okendo.io', 'stamped.io', 'junip.co', 'bazaarvoice.com'];
  const listed = hosts();
  for (const tool of REVIEW_SOFTWARE) {
    assert.ok(!listed.some((w) => w.includes(tool)),
      `${tool} manages reviews rather than publishing a business profile`);
  }
});

test('no row points at a platform that announced its own closure', () => {
  // bewertet.de was reachable and served a page stating the platform is closing.
  const CLOSING = ['bewertet.de', 'ourbis.ca', 'segundamano.mx'];
  const listed = hosts();
  for (const bad of CLOSING) {
    assert.ok(!listed.some((w) => w.includes(bad)),
      `${bad} states on its own page that it is closing`);
  }
});

test('a chamber row is backed by a directory page, not a homepage', () => {
  // The distinction this wave had to make. A chamber is published only where a
  // member directory was actually reached, which shows up as a row whose URL
  // goes deeper than the domain root.
  //
  // Scoped to REGIONAL chambers specifically. A first version matched any row
  // whose name contained "chamber" and fired on ChamberofCommerce.org — a
  // national commercial directory that legitimately lives at its domain root.
  // A city chamber is identified by its regional audience, not by its name.
  const chambers = ROWS.filter((r) => r.category === 'chambers-of-commerce'
    && (r.audienceGeography || []).includes('regional'));
  assert.ok(chambers.length > 0, 'no regional chamber rows, so this guard proves nothing');
  for (const r of chambers) {
    const afterHost = r.website.replace(/^https:\/\/[^/]+/, '');
    assert.ok(afterHost.replace(/\/$/, '').length > 0,
      `${r.id} points at a homepage; a chamber is published only once its member directory is reached`);
  }
});

test('every platform row still meets the operational contract', () => {
  for (const r of ROWS) {
    assert.ok(r.priority && r.currentStatus, `${r.id} is missing operational fields`);
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
});
