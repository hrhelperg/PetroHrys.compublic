'use strict';

// Directory Intelligence v2.
//
// The layer's whole claim is that a Directory Score is REPRODUCIBLE — the same
// record yields the same number on any machine, forever. These guards protect
// that claim and the three design decisions it rests on:
//
//   the score is computed and never stored, so it cannot drift from its inputs;
//   missing evidence yields null and never a default, so an unassessed platform
//     never scores like an assessed one;
//   the layer reuses existing fields rather than restating them, so there is one
//     source of truth per fact.
//
// One guard here exists because of a defect found during implementation. The
// first version of seoValue averaged three components, two of which were
// booleans mapped to 0 or 100 — so every platform that was indexed and ranked
// for its name scored exactly 100, and eighteen very different platforms all
// came out "strong". A dimension that cannot separate its inputs is decoration.
// `the score discriminates` is the test that would have caught it.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const DATA = path.join(ROOT, 'data', 'business-directories');
const INTEL = require(path.join(ROOT, 'scripts/lib/bd-intelligence.cjs'));
const S = require(path.join(ROOT, 'scripts/lib/bd-schema.cjs'));
const M = require(path.join(ROOT, 'scripts/lib/bd-migrate.cjs'));
const O = require(path.join(ROOT, 'scripts/lib/bd-opportunities.cjs'));
const csv = require(path.join(ROOT, 'scripts/lib/bd-csv.cjs'));

const COUNTRIES = new Set(JSON.parse(
  fs.readFileSync(path.join(DATA, 'countries.json'), 'utf8')).map((c) => c.slug));
const CATEGORIES = new Set(JSON.parse(
  fs.readFileSync(path.join(DATA, 'categories.json'), 'utf8')).map((c) => c.slug));
const DIR = path.join(DATA, 'directories');
const EDITORIAL = fs.readdirSync(DIR).filter((f) => f.endsWith('.json'))
  .flatMap((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')));
const ROWS = O.loadOpportunities(DATA, COUNTRIES, CATEGORIES);
const ALL = [...EDITORIAL, ...ROWS];

// --- the score is a function, not a stored value ----------------------------

test('no record stores a Directory Score', () => {
  // The moment a score is written down it can disagree with the facts it came
  // from. Storing it would also mean every scoring change rewrites the dataset.
  const raw = [
    ...fs.readdirSync(DIR).filter((f) => f.endsWith('.json'))
      .flatMap((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'))),
    ...JSON.parse(fs.readFileSync(path.join(DATA, 'opportunities.json'), 'utf8')),
  ];
  for (const r of raw) {
    for (const banned of ['directoryScore', 'scoreBand', 'seoValue', 'intelligenceScore']) {
      assert.ok(!(banned in r), `${r.id} stores ${banned}; the Directory Score is computed, never stored`);
    }
    if (r.intelligence) {
      for (const key of Object.keys(r.intelligence)) {
        assert.ok(INTEL.INTELLIGENCE_KEYS.includes(key),
          `${r.id} carries an undeclared intelligence attribute "${key}"`);
      }
    }
  }
});

test('the same record always yields the same score', () => {
  for (const r of ALL) {
    const a = INTEL.directoryScore(r);
    const b = INTEL.directoryScore(JSON.parse(JSON.stringify(r)));
    assert.deepStrictEqual(a, b, `${r.id} scored differently on an identical record`);
  }
});

test('the dimension weights total exactly 100', () => {
  assert.strictEqual(INTEL.DIMENSION_WEIGHT_TOTAL, 100);
  assert.strictEqual(INTEL.DIMENSIONS.reduce((s, d) => s + d.weight, 0), 100);
});

// --- missing evidence is never a default ------------------------------------

test('an unassessed record scores null, not a midpoint', () => {
  const empty = { id: 'test-empty' };
  const score = INTEL.directoryScore(empty);
  assert.strictEqual(score.overall, null);
  assert.strictEqual(score.scored, false);
  for (const d of INTEL.DIMENSIONS) {
    assert.strictEqual(score.dimensions[d.key], null,
      `${d.key} invented a value from no evidence`);
  }
});

test('a score needs enough dimensions to mean anything', () => {
  // Two thresholds guard this, and each needs its own case. A record can clear
  // the weight floor while failing the count floor, so a single example proves
  // only whichever threshold happens to bite first — the mutation harness
  // caught exactly that: lowering MIN_DIMENSIONS changed nothing because
  // MIN_WEIGHT was still rejecting the one example.
  assert.strictEqual(INTEL.MIN_DIMENSIONS, 4, 'the dimension floor moved');
  assert.strictEqual(INTEL.MIN_WEIGHT, 60, 'the weight floor moved');

  // Fails on WEIGHT: one dimension, 15 weight.
  const thin = { tier: 'tier1', currentStatus: 'active' };  // stability only
  assert.strictEqual(INTEL.directoryScore(thin).overall, null);

  // Fails on COUNT alone: three dimensions carrying 70 weight, which clears
  // MIN_WEIGHT and must still be refused for having too few dimensions.
  const threeHeavy = {
    backlinkType: 'dofollow',                       // seoValue, weight 30
    listingQuality: 'high',                         // trust, weight 20
    intelligence: { profileIndexed: true, countryReach: 'global' }, // referral, weight 20
  };
  const t = INTEL.directoryScore(threeHeavy);
  assert.strictEqual(t.dimensionsPresent, 3);
  assert.ok(t.weightPresent >= INTEL.MIN_WEIGHT, 'this case must clear the weight floor to isolate the count floor');
  assert.strictEqual(t.overall, null,
    'three dimensions scored despite the documented four-dimension floor');

  const rich = {
    tier: 'tier1', currentStatus: 'active', backlinkType: 'dofollow',
    listingQuality: 'high', verificationMethods: ['email', 'phone'],
    submissionModel: 'free', accepts: { saas: true, agency: true },
    intelligence: { profileIndexed: true, countryReach: 'global', approvalMode: 'instant' },
  };
  const s = INTEL.directoryScore(rich);
  assert.strictEqual(s.scored, true);
  assert.ok(s.dimensionsPresent >= INTEL.MIN_DIMENSIONS);
  assert.ok(s.weightPresent >= INTEL.MIN_WEIGHT);
  assert.ok(typeof s.overall === 'number' && s.overall >= 0 && s.overall <= 100);
});

test('the score discriminates — it is not the same number for everything', () => {
  // The defect this replaces: seoValue averaged two booleans and returned 100
  // for anything indexed and name-ranking, so every platform scored "strong".
  const base = { intelligence: { profileIndexed: true, ranksByCompanyName: true } };
  const byLink = ['dofollow', 'mixed', 'nofollow', 'none']
    .map((backlinkType) => INTEL.seoValue({ ...base, backlinkType }));
  assert.strictEqual(new Set(byLink).size, byLink.length,
    `link types produced duplicate SEO values: ${byLink.join(', ')}`);
  // Strictly ordered: a dofollow link is worth more than mixed, and so on down.
  for (let i = 1; i < byLink.length; i += 1) {
    assert.ok(byLink[i] < byLink[i - 1],
      `SEO value is not monotonic across link types: ${byLink.join(' > ')}`);
  }
  // No single component may max the dimension out on its own.
  assert.ok(INTEL.seoValue({ intelligence: { profileIndexed: true } }) < 100,
    'being indexed alone scores a perfect SEO value, which leaves no room to be better');
});

// --- reuse, not restatement -------------------------------------------------

test('the intelligence layer restates no field the registry already has', () => {
  // Two sources of truth for one fact drift. Business fit lives in `accepts`,
  // link value in `backlinkType`, verification in `verificationMethods`, cost in
  // `submissionModel`, reach in `audienceGeography` — none may reappear here.
  const existing = new Set([...S.KNOWN_RECORD_KEYS, ...S.ACCEPTS_KEYS]);
  for (const key of INTEL.INTELLIGENCE_KEYS) {
    assert.ok(!existing.has(key),
      `intelligence.${key} duplicates an existing registry field`);
  }
  for (const banned of ['backlinkType', 'submissionModel', 'accepts', 'verificationMethods',
    'audienceGeography', 'tier', 'currentStatus']) {
    assert.ok(!INTEL.INTELLIGENCE_KEYS.includes(banned));
  }
});

test('every attribute declares its evidence class', () => {
  for (const key of INTEL.INTELLIGENCE_KEYS) {
    assert.ok(['A', 'B'].includes(INTEL.EVIDENCE_CLASS[key]),
      `intelligence.${key} has no evidence class; every attribute is verified (A) or observable (B)`);
    assert.ok(INTEL.LABELS[key], `intelligence.${key} has no human label`);
  }
});

// --- migration is a no-op for unpopulated records ---------------------------

test('adding the layer rewrites no record', () => {
  const bare = M.migrateRecord({
    id: 'x', name: 'X', slug: 'x', country: 'global', category: 'saas',
    website: 'https://x.example/', description: 'd',
  });
  assert.strictEqual(bare.intelligence, null, 'absence must normalise to null');
  assert.ok(!('intelligence' in M.serialisableRecord(bare)),
    'an unpopulated record would gain an intelligence key on disk');
});

test('a populated record round-trips through the projection', () => {
  const intel = {
    hasApi: true, languages: ['de', 'en'], countryReach: 'global',
    approvalMode: 'manual', profileIndexed: true,
  };
  const rec = M.migrateRecord({
    id: 'y', name: 'Y', slug: 'y', country: 'global', category: 'saas',
    website: 'https://y.example/', description: 'd', intelligence: intel,
  });
  const again = M.migrateRecord(M.serialisableRecord(rec));
  assert.deepStrictEqual(again.intelligence, rec.intelligence);
});

// --- validation -------------------------------------------------------------

test('the validator rejects anything the vocabulary does not allow', () => {
  const bad = [
    [{ countryReach: 'planet' }, 'an undeclared country reach'],
    [{ approvalMode: 'eventually' }, 'an undeclared approval mode'],
    [{ hasApi: 'yes' }, 'a string where a boolean belongs'],
    [{ languages: ['English'] }, 'a language name instead of an ISO code'],
    [{ languages: ['fr', 'en'] }, 'unsorted languages'],
    [{ languages: ['en', 'en'] }, 'a duplicate language'],
    [{ languages: [] }, 'an empty language array'],
    [{ profileUrlPattern: 'example.com/{slug}' }, 'a pattern that is not https'],
    [{ notAThing: true }, 'an undeclared attribute'],
  ];
  for (const [intel, why] of bad) {
    assert.ok(INTEL.problemsFor(intel, 't').length > 0, `${why} was accepted`);
  }
  assert.strictEqual(INTEL.problemsFor(null, 't').length, 0, 'null must be legal');
  assert.strictEqual(
    INTEL.problemsFor({ countryReach: 'global', languages: ['de', 'en'] }, 't').length, 0,
    'a valid object was rejected',
  );
});

// --- the published surfaces agree -------------------------------------------

// RFC 4180, not split(','). A limitations cell quotes prose containing commas,
// so a naive split shifts every column after it — which is exactly how the
// first version of the test below "found" a score mismatch that did not exist.
function parseCsvLine(line) {
  const out = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(field); field = ''; }
    else field += c;
  }
  out.push(field);
  return out;
}

test('the CSV carries the computed score and agrees with the module', () => {
  const file = path.join(ROOT, 'research', 'business-directories', 'opportunities.csv');
  const raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  const records = raw.split('\r\n').filter(Boolean).map(parseCsvLine);
  const cols = records[0];
  for (const c of ['directory_score', 'seo_value', 'approval_mode', 'country_reach', 'has_api']) {
    assert.ok(cols.includes(c), `the CSV is missing the ${c} column`);
  }
  const idx = cols.indexOf('directory_score');
  const seoIdx = cols.indexOf('seo_value');
  const byId = new Map(csv.actionableOpportunities(EDITORIAL, ROWS).map((r) => [r.id, r]));
  let checked = 0;
  for (const cells of records.slice(1)) {
    assert.strictEqual(cells.length, cols.length,
      `row ${cells[0]} has ${cells.length} cells against ${cols.length} columns`);
    const record = byId.get(cells[0]);
    if (!record) continue;
    const score = INTEL.directoryScore(record);
    assert.strictEqual(cells[idx], score.overall === null ? '' : String(score.overall),
      `${cells[0]}: the CSV score disagrees with the module`);
    assert.strictEqual(cells[seoIdx],
      score.dimensions.seoValue === null ? '' : String(score.dimensions.seoValue),
      `${cells[0]}: the CSV SEO value disagrees with the module`);
    checked += 1;
  }
  assert.ok(checked > 1000, `expected to check the whole export, only saw ${checked}`);
});

test('the working list exposes the intelligence filters', () => {
  const page = fs.readFileSync(
    path.join(ROOT, 'research', 'business-directories', 'opportunities', 'index.html'), 'utf8');
  for (const facet of ['score', 'approval', 'reach']) {
    assert.ok(page.includes(`data-bd-facet="${facet}"`), `the ${facet} filter control is missing`);
    assert.ok(page.includes(`data-bd-facet-${facet}=`), `rows carry no ${facet} attribute`);
  }
  // Every value offered by a control must exist on a row, or the filter yields
  // an empty table and reads as a broken page.
  const optionRe = /data-bd-facet="score"[\s\S]*?<\/select>/;
  const block = page.match(optionRe);
  assert.ok(block, 'the score control did not render');
  const offered = [...block[0].matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
  const present = new Set([...page.matchAll(/data-bd-facet-score="([^"]*)"/g)].map((m) => m[1]));
  for (const v of offered) {
    assert.ok(present.has(v), `the score filter offers "${v}" but no row carries it`);
  }
});

test('the populated demonstration set is real and scores', () => {
  const populated = ALL.filter((r) => r.intelligence);
  assert.ok(populated.length >= 15,
    `expected the representative set to be populated, found ${populated.length}`);
  for (const r of populated) {
    assert.strictEqual(INTEL.problemsFor(r.intelligence, r.id).length, 0);
    assert.ok(INTEL.directoryScore(r).scored, `${r.id} was populated but still cannot be scored`);
  }
});
