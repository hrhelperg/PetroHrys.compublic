'use strict';

// Marketplace & Classified Platforms — Wave M1.
//
// The point of this dataset is that it is SEPARATE. A business directory
// answers "where can a company publish a profile?"; a marketplace answers
// "where can it publish a listing?". Merging them was not attempted, because
// the directory registry already demonstrated what happens: an earlier wave
// mixed two record shapes into one file and 49 assertions failed, protecting
// properties one shape had and the other did not.
//
// So the first guard here is the separation itself, checked from both sides.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const MP = require(path.join(ROOT, 'scripts/lib/mp-schema.cjs'));
const build = require(path.join(ROOT, 'scripts/build-marketplaces.cjs'));

const DATA_FILE = path.join(ROOT, 'data/marketplaces/marketplaces.json');
const PAGE = path.join(ROOT, 'research/marketplaces/index.html');
const CSV = path.join(ROOT, 'research/marketplaces/marketplaces.csv');
const COUNTRIES = new Set(JSON.parse(
  fs.readFileSync(path.join(ROOT, 'data/business-directories/countries.json'), 'utf8'))
  .map((c) => c.slug));

const ROWS = MP.loadMarketplaces(DATA_FILE, COUNTRIES);

// --- separation -------------------------------------------------------------

test('the two datasets can never collide on an id', () => {
  // A platform CAN legitimately appear in both: leboncoin is a place to publish
  // a listing and, through its professional shops, a place to hold a presence.
  // What must never happen is the two datasets meaning different things by one
  // id — so every marketplace id is namespaced, and the namespaces are disjoint.
  //
  // The first version of this test asserted no platform appeared in both at all,
  // and 2dehands failed it immediately. That assertion was wrong: it would have
  // forced the biggest classifieds in Europe out of a classifieds dataset to
  // preserve a boundary that was never about platforms, only about records.
  const dir = path.join(ROOT, 'data/business-directories');
  const directoryIds = new Set([
    ...fs.readdirSync(path.join(dir, 'directories')).filter((f) => f.endsWith('.json'))
      .flatMap((f) => JSON.parse(fs.readFileSync(path.join(dir, 'directories', f), 'utf8')))
      .map((r) => r.id),
    ...JSON.parse(fs.readFileSync(path.join(dir, 'opportunities.json'), 'utf8')).map((r) => r.id),
  ]);
  for (const r of ROWS) {
    assert.ok(r.id.startsWith('mp-'), `${r.id} is not namespaced to the marketplace dataset`);
    assert.ok(!directoryIds.has(r.id), `${r.id} collides with a business-directory record`);
  }
  for (const id of directoryIds) {
    assert.ok(!id.startsWith('mp-'), `${id} uses the marketplace namespace in the directory dataset`);
  }
});

test('a marketplace row carries no directory-only field', () => {
  // If these ever appear, the datasets are converging and the separation that
  // makes both of them simple is being lost.
  const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const FORBIDDEN = ['domainRating', 'petroHrysScore', 'scoreFactors', 'accepts',
    'listingAction', 'audienceGeography', 'priority', 'intelligence', 'verification'];
  for (const r of raw) {
    for (const f of FORBIDDEN) {
      assert.ok(!(f in r), `${r.id} carries "${f}", which belongs to the directory dataset`);
    }
  }
});

test('the marketplace build owns only its own output', () => {
  const manifest = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'data/marketplaces/.build-manifest.json'), 'utf8'));
  for (const f of manifest.files) {
    assert.ok(f.startsWith('research/marketplaces/'),
      `the marketplace manifest claims ${f}, which is outside its own directory`);
  }
});

// --- the data contract ------------------------------------------------------

test('every row validates against the declared vocabularies', () => {
  const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  assert.ok(raw.length >= 90, `expected the Wave M1 dataset, found ${raw.length}`);
  for (const r of raw) {
    assert.deepStrictEqual(MP.problemsFor(r, COUNTRIES), [], `${r.id} failed validation`);
  }
});

test('no two rows share a host within one country', () => {
  // One submission, one row. Two entries on one host in one country are the
  // same platform listed twice — the rule the directory dataset also enforces.
  const host = (u) => String(u).replace(/^https:\/\/(www\.)?/, '').split('/')[0].toLowerCase();
  const seen = new Map();
  for (const r of ROWS) {
    const key = `${r.country}|${host(r.website)}`;
    assert.ok(!seen.has(key), `${seen.get(key)} and ${r.id} are the same platform`);
    seen.set(key, r.id);
  }
});

test('one operator serves one country once per marketplace type', () => {
  // OLX, Adevinta and Bazos each run several national sites, and each national
  // site is a separate listing and a separate account — so each is a row.
  //
  // The rule keys on TYPE as well as operator and country. A first version did
  // not, and failed on OLX Group in Poland, which runs olx.pl for general
  // classifieds and otomoto.pl for vehicles: two genuinely different
  // marketplaces with different accounts, not a duplicate. What the rule still
  // catches is the real case — 2dehands.be and 2ememain.be, one Belgian
  // platform served in two languages, which was merged.
  const seen = new Map();
  for (const r of ROWS.filter((x) => x.operator)) {
    const key = `${r.operator}|${r.country}|${r.marketplaceType}`;
    assert.ok(!seen.has(key),
      `${seen.get(key)} and ${r.id} are the same operator, country and type — a mirror, not two platforms`);
    seen.set(key, r.id);
  }
});

test('a blocked platform is unknown, never dropped', () => {
  // Same rule as every other dataset here: a bot filter says the server
  // answered and nothing about the product.
  const blocked = ROWS.filter((r) => /browser check is needed/i.test(r.note || ''));
  assert.ok(blocked.length > 0, 'expected browser-pending rows');
  for (const r of blocked) {
    assert.strictEqual(r.currentStatus, 'unknown',
      `${r.id} is behind a bot filter but claims a definite status`);
    assert.ok(MP.isPublishable(r), `${r.id} was dropped for being blocked, which is not evidence`);
  }
});

// --- generated artefacts ----------------------------------------------------

test('the page and the export agree with the data', () => {
  const publishable = ROWS.filter(MP.isPublishable);
  const page = fs.readFileSync(PAGE, 'utf8');
  assert.strictEqual((page.match(/data-bd-facet-country=/g) || []).length, publishable.length,
    'the page renders a different number of platforms than the dataset holds');

  const csv = fs.readFileSync(CSV, 'utf8');
  assert.strictEqual(csv.charCodeAt(0), 0xFEFF, 'the CSV needs a BOM for Excel on Windows');
  assert.ok(/\r\n/.test(csv), 'the CSV must use CRLF');
  const lines = csv.replace(/^﻿/, '').split('\r\n').filter(Boolean);
  assert.deepStrictEqual(lines[0].split(','), build.COLUMNS);
  assert.strictEqual(lines.length - 1, publishable.length, 'CSV parity with the dataset');
  for (const line of lines) {
    assert.strictEqual((line.match(/"/g) || []).length % 2, 0,
      `unbalanced quoting would corrupt this row: ${line.slice(0, 60)}`);
  }
});

test('the render is deterministic and locale-independent', () => {
  const a = build.renderCsv(ROWS.filter(MP.isPublishable));
  const b = build.renderCsv([...ROWS].reverse().filter(MP.isPublishable)
    .sort(MP.comparePlatforms));
  assert.strictEqual(a, b, 'the export depends on input order');
  const source = fs.readFileSync(path.join(ROOT, 'scripts/lib/mp-schema.cjs'), 'utf8');
  assert.ok(!/\.localeCompare\s*\(/.test(source),
    'mp-schema calls localeCompare, which is not reproducible across hosts');
});

test('the page is a real page, not a fragment', () => {
  const page = fs.readFileSync(PAGE, 'utf8');
  assert.ok(/^<!DOCTYPE html>/i.test(page), 'the page has no document shell');
  assert.ok(page.includes('rel="canonical"'), 'the page has no canonical URL');
  assert.ok(/<title>[^<]+<\/title>/.test(page), 'the page has no title');
  for (const facet of ['country', 'type', 'cost', 'sellers', 'status']) {
    assert.ok(page.includes(`data-bd-facet="${facet}"`), `the ${facet} filter is missing`);
    assert.ok(page.includes(`data-bd-facet-${facet}=`), `rows carry no ${facet} attribute`);
  }
});

test('the page states what the dataset excludes', () => {
  // The boundary is the whole reason this dataset exists separately, so a
  // reader must be told where it is.
  const page = fs.readFileSync(PAGE, 'utf8');
  assert.ok(/business directories and\s+company registries/i.test(page.replace(/\s+/g, ' ')),
    'the page does not say that business directories are excluded');
});

test('the page never claims a geography the dataset does not have', () => {
  // The title, description, H1 and JSON-LD all said "in Europe" for four waves
  // after M2-M5 took the dataset to North America, Australia, Asia, Latin
  // America and Africa. A page holding Mercado Libre, Jumia and Rakuten
  // described itself as European, and would never match a reader looking for
  // any of those markets.
  //
  // The rule is that the framing is derived. Any continent named in the page
  // chrome is a claim nothing recomputes.
  const publishable = ROWS.filter(MP.isPublishable);
  const countries = new Set(publishable.map((r) => r.country)).size;
  const page = fs.readFileSync(PAGE, 'utf8');

  // Only the strings the page says about ITSELF. A first version sliced
  // everything before the table, which swept in the country dropdown and failed
  // on the option "South Africa (7)" — a country name is data, not a claim.
  const grab = (re, what) => {
    const m = page.match(re);
    assert.ok(m, `the page has no ${what}`);
    return m[1];
  };
  const framing = {
    title: grab(/<title>([^<]*)<\/title>/, 'title'),
    description: grab(/<meta name="description" content="([^"]*)"/, 'description'),
    h1: grab(/<h1[^>]*>([^<]*)/, 'H1'),
    jsonLdName: grab(/"name":\s*"([^"]*)"/, 'structured-data name'),
  };
  for (const [where, claim] of Object.entries(framing)) {
    for (const continent of ['Europe', 'European', 'Asia', 'Africa', 'Latin America', 'North America']) {
      assert.ok(!new RegExp(`\\b${continent}\\b`).test(claim),
        `the ${where} claims ${continent}: "${claim}". The dataset spans ${countries} countries and nothing recomputes that word`);
    }
  }
  // And the counts each one states must be the derived ones. Checked against
  // the extracted strings, not the whole page: a first version searched the
  // page and passed with a hardcoded "120 platforms across 17 countries" in the
  // meta description, because the intro paragraph happened to carry the correct
  // sentence a few hundred bytes further down.
  assert.strictEqual(framing.h1, `${publishable.length} marketplace and classified platforms in ${countries} countries`,
    'the H1 does not state the derived platform and country counts');
  assert.ok(framing.description.startsWith(`${publishable.length} platforms across ${countries} countries`),
    `the description does not state the derived counts: "${framing.description}"`);
});

test('a city-sharded platform is one row, not one row per city', () => {
  // Craigslist runs several hundred city sites from one platform and one
  // account. Listing them per city would multiply the dataset by 400 and mean
  // exactly one submission — the same "one submission, one row" rule that
  // merged the Belgian language mirror, applied at a much larger scale.
  const craigslist = ROWS.filter((r) => /craigslist/i.test(r.website));
  assert.strictEqual(craigslist.length, 1,
    `craigslist has ${craigslist.length} rows; its city sites are one platform`);
  assert.match(craigslist[0].note || '', /one platform and one account/i,
    'the craigslist row does not explain why its city sites are not separate rows');
});

test('no row points at a marketplace that closed or was repurposed', () => {
  // Both were reachable. recycler.com serves a farewell notice; usfreeads.com
  // now serves a Japanese lifestyle site under the same domain. A 200 is not
  // evidence that a domain still hosts the marketplace it is named after.
  const GONE = ['recycler.com', 'usfreeads.com', 'backpage.com', 'letgo.com'];
  const websites = ROWS.map((r) => r.website.toLowerCase());
  for (const bad of GONE) {
    assert.ok(!websites.some((w) => w.includes(bad)),
      `${bad} no longer operates as the marketplace it is named after`);
  }
});

test('a marketplace that announced its own closure is never listed', () => {
  // segundamano.mx answers 200 and the page says, in the operator's own words,
  // "Segundamano ha sido dado de baja, dirígete a Inmuebles24". It was a named
  // priority in the Latin America brief and it no longer exists; Inmuebles24,
  // which absorbed its audience, is listed instead.
  const CLOSED = ['segundamano.mx', 'recycler.com'];
  const websites = ROWS.map((r) => r.website.toLowerCase());
  for (const bad of CLOSED) {
    assert.ok(!websites.some((w) => w.includes(bad)),
      `${bad} states on its own page that it has closed`);
  }
  assert.ok(websites.some((w) => w.includes('inmuebles24.com')),
    'the successor to Segundamano is missing, so the closure has no replacement');
});

test('no build-time network call was introduced', () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts/build-marketplaces.cjs'), 'utf8')
    + fs.readFileSync(path.join(ROOT, 'scripts/lib/mp-schema.cjs'), 'utf8');
  // Match CALLS, not the words — a comment explaining the ban must not fail it.
  assert.ok(!/\bfetch\s*\(|https?\.request\s*\(|axios\./.test(source),
    'the marketplace build makes a network call');
});
