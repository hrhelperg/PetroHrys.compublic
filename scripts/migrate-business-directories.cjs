// scripts/migrate-business-directories.cjs
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { PATHS, writeIfChanged } = require('./lib/bd-util.cjs');
const { migrateRecord, serialisableRecord } = require('./lib/bd-migrate.cjs');
const { computeScore, SCORE_FACTORS } = require('./lib/bd-schema.cjs');

// One-time migration to the expanded schema. Idempotent: re-running on already
// migrated data is a no-op. It performs three jobs:
//
//   1. rewrites every record into the current shape via migrateRecord();
//   2. re-homes globally-scoped platforms from united-states to global,
//      because the country field describes EDITORIAL SCOPE, not headquarters;
//   3. attaches the ten editorial score factors, from which petroHrysScore is
//      computed rather than asserted.
//
// It never invents a factual field. Scores are editorial judgements supplied
// here deliberately; every other value is carried across untouched.

const DIR = path.join(PATHS.dataRoot, 'directories');

// id -> new country. Only genuinely global platforms move. Better Business
// Bureau stays under united-states: it covers the US and Canada, which is
// regional, not global.
const RE_HOME = {
  'us-opencorporates': 'global',
  'us-trustpilot': 'global',
  'us-yelp': 'global',
  'us-capterra': 'global',
  'us-software-advice': 'global',
  'us-alternativeto': 'global',
  'us-clutch': 'global',
  'us-designrush': 'global',
  'us-crunchbase': 'global',
  'us-product-hunt': 'global',
  'us-wellfound': 'global',
  'us-shopify-app-store': 'global',
  'us-salesforce-appexchange': 'global',
  'us-hubspot-marketplace': 'global',
  'us-github-marketplace': 'global',
  'us-wordpress-plugins': 'global',
  'us-firefox-addons': 'global',
};

// The `us-` prefix would be actively misleading on a record whose scope is
// global. Ids are re-issued once, here, before anything is published; from
// this point they are immutable.
const RE_ID = Object.fromEntries(
  Object.keys(RE_HOME).map((id) => [id, id.replace(/^us-/, 'global-')]),
);

const F = (...values) => Object.fromEntries(SCORE_FACTORS.map((f, i) => [f.key, values[i]]));
// order: editorialTrust, businessUsefulness, verificationQuality, platformReputation,
//        spamResistance, industryImportance, longTermStability, submissionQuality,
//        transparency, moderationQuality
const FACTORS = {
  'gb-companies-house':        F(10, 10, 9, 9, 10, 10, 10, 8, 9, 9),
  'au-abn-lookup':             F(10, 9, 9, 9, 10, 9, 10, 8, 9, 9),
  'cz-verejny-rejstrik':       F(10, 9, 9, 8, 10, 9, 10, 8, 8, 9),
  'de-registerportal':         F(10, 9, 9, 8, 10, 9, 10, 7, 8, 9),
  'it-registro-imprese':       F(10, 9, 9, 8, 10, 9, 10, 7, 8, 9),
  'global-opencorporates':     F(9, 9, 8, 8, 9, 8, 8, 8, 9, 8),
  'global-shopify-app-store':  F(9, 9, 9, 9, 9, 8, 9, 8, 8, 9),
  'global-wordpress-plugins':  F(9, 9, 8, 9, 8, 9, 9, 9, 9, 8),
  'global-github-marketplace': F(9, 8, 8, 10, 9, 8, 9, 8, 8, 8),
  'global-salesforce-appexchange': F(9, 8, 9, 9, 9, 8, 9, 7, 7, 9),
  'global-firefox-addons':     F(9, 7, 9, 9, 9, 7, 8, 8, 9, 9),
  'global-capterra':           F(8, 9, 8, 9, 7, 9, 9, 8, 6, 8),
  'global-crunchbase':         F(8, 9, 7, 9, 8, 9, 9, 8, 7, 7),
  'global-clutch':             F(8, 9, 9, 8, 8, 8, 8, 7, 7, 8),
  'global-yelp':               F(7, 9, 7, 9, 6, 9, 9, 8, 7, 7),
  'global-hubspot-marketplace': F(8, 7, 8, 8, 9, 7, 8, 7, 7, 8),
  'global-trustpilot':         F(7, 9, 6, 9, 5, 9, 9, 8, 7, 6),
  'global-wellfound':          F(7, 8, 7, 8, 8, 7, 8, 8, 7, 7),
  'global-product-hunt':       F(7, 8, 6, 9, 6, 8, 8, 8, 7, 7),
  'global-software-advice':    F(7, 8, 7, 8, 7, 8, 8, 7, 6, 7),
  'us-bbb':                    F(8, 7, 7, 8, 7, 7, 9, 7, 6, 7),
  'global-alternativeto':      F(7, 7, 6, 7, 6, 7, 7, 8, 8, 6),
  'global-designrush':         F(6, 7, 6, 6, 5, 6, 6, 6, 5, 6),
};

function run() {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json'));
  const all = [];
  for (const file of files) {
    for (const raw of JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'))) all.push(raw);
  }

  const moves = [];
  const migrated = all.map((raw) => {
    const record = migrateRecord(raw);
    const newCountry = RE_HOME[record.id];
    if (newCountry) {
      moves.push({ from: `${record.country}/${record.slug}`, to: `${newCountry}/${record.slug}`, id: record.id });
      record.country = newCountry;
    }
    if (RE_ID[record.id]) record.id = RE_ID[record.id];

    const factors = FACTORS[record.id];
    if (factors) {
      record.scoreFactors = factors;
      record.petroHrysScore = computeScore(factors);
    }
    if (record.verification && !record.verification.reviewers.length) {
      record.verification.reviewers = [
        { id: 'petro-hrys', name: 'Petro Hrys', role: 'editor' },
      ];
    }
    if (record.verification && !record.verification.source) {
      record.verification.source = 'official-website';
    }
    return record;
  });

  const byCountry = {};
  for (const record of migrated) (byCountry[record.country] = byCountry[record.country] || []).push(record);

  const countries = JSON.parse(fs.readFileSync(path.join(PATHS.dataRoot, 'countries.json'), 'utf8'));
  const written = [];
  for (const country of countries) {
    const records = byCountry[country.slug] || [];
    const file = path.join(DIR, `${country.slug}.json`);
    // Written through the on-disk projection: a Wave 1 field that carries no
    // information is omitted rather than stamped across every record as a null.
    const onDisk = records.map(serialisableRecord);
    if (writeIfChanged(file, `${JSON.stringify(onDisk, null, 2)}\n`)) written.push(`${country.slug}.json`);
  }

  return { total: migrated.length, moves, written, byCountry };
}

if (require.main === module) {
  const result = run();
  console.log(`Migrated ${result.total} record(s); ${result.written.length} file(s) rewritten.`);
  for (const move of result.moves) console.log(`  moved ${move.from} -> ${move.to}`);
  for (const [country, records] of Object.entries(result.byCountry)) {
    console.log(`  ${country}: ${records.length}`);
  }
}

module.exports = { run, RE_HOME, RE_ID, FACTORS };
