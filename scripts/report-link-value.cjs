#!/usr/bin/env node
// scripts/report-link-value.cjs
'use strict';

// What the corpus actually knows about link value.
//
// Every count here is read from canonical data, not from the research ledger:
// a finding that was never applied is not a fact about the product, and the
// gap between the two is exactly the thing a coverage report exists to expose.
//
// UNKNOWN is the absence of a reading and is counted as such everywhere. It is
// never folded into "no external link", and it never becomes a denominator
// trick — the intersections below all divide by the whole cohort, so a small
// numerator stays small.
//
//   node scripts/report-link-value.cjs
//
// Nothing in the build or the test suite invokes this file.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

const COLLECTIONS = {
  directories: 'data/business-directories/opportunities.json',
  marketplaces: 'data/marketplaces/marketplaces.json',
  media: 'data/media-pr-publishing/media-platforms.json',
};

// The states the schema stores, in the vocabulary the brief asks the report to
// use. `null` is UNKNOWN and stays that way.
const LINK_LABEL = {
  dofollow: 'FOLLOW',
  nofollow: 'NOFOLLOW',
  ugc: 'UGC',
  sponsored: 'SPONSORED',
  mixed: 'MIXED',
  none: 'NO_EXTERNAL_LINK',
};
const INDEX_LABEL = {
  indexable: 'INDEXABLE',
  noindex: 'NOINDEX',
  'robots-blocked': 'ROBOTS_BLOCKED',
  'login-required': 'LOGIN_REQUIRED',
};
const TARGET_LABEL = {
  direct: 'DIRECT_EXTERNAL',
  'internal-redirect': 'INTERNAL_REDIRECT',
  'javascript-redirect': 'JAVASCRIPT_REDIRECT',
};

// A record has a route somebody can act on. Read from the fields each
// collection actually uses, never inferred from anything else.
const hasRoute = (r) => Boolean(r.submissionUrl || r.claimUrl || r.sellerActionUrl
  || r.pressReleaseUrl || r.pitchUrl || r.advertisingUrl);

// No money up front. The same set the country intelligence uses.
const NO_UPFRONT = new Set(['free', 'freemium', 'free-tier', 'free-listing-commission']);
const isFree = (r) => NO_UPFRONT.has(r.submissionModel) || NO_UPFRONT.has(r.sellerCost)
  || NO_UPFRONT.has(r.costModel);

function load() {
  const all = [];
  for (const [name, rel] of Object.entries(COLLECTIONS)) {
    for (const r of JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'))) {
      if (r.currentStatus && r.currentStatus !== 'active') continue;
      all.push({ ...r, collection: name });
    }
  }
  return all;
}

const tally = (rows, pick, labels) => {
  const out = {};
  for (const r of rows) {
    const raw = pick(r);
    const key = raw ? (labels[raw] || raw) : 'UNKNOWN';
    out[key] = (out[key] || 0) + 1;
  }
  return out;
};

const show = (title, counts, total) => {
  console.log(`\n${title}`);
  const order = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  for (const [k, v] of order) {
    const pct = total ? ` (${((v / total) * 100).toFixed(1)}%)` : '';
    console.log(`  ${String(v).padStart(6)}  ${k}${pct}`);
  }
};

function run() {
  const rows = load();
  const measured = rows.filter((r) => r.backlinkType);

  console.log(`LINK VALUE COVERAGE — ${rows.length} active records across `
    + `${Object.keys(COLLECTIONS).length} collections`);
  console.log(`  measured: ${measured.length}   unknown: ${rows.length - measured.length}`);

  show('LINK TYPE', tally(rows, (r) => r.backlinkType, LINK_LABEL), rows.length);
  show('LISTING PAGE', tally(rows, (r) => r.listingIndexability, INDEX_LABEL), rows.length);
  show('LINK TARGET', tally(rows, (r) => r.linkTargetType, TARGET_LABEL), rows.length);

  // ── BY COLLECTION ────────────────────────────────────────────────────────
  console.log('\nBY COLLECTION');
  for (const name of Object.keys(COLLECTIONS)) {
    const set = rows.filter((r) => r.collection === name);
    const m = set.filter((r) => r.backlinkType);
    const f = set.filter((r) => r.backlinkType === 'dofollow').length;
    console.log(`  ${name.padEnd(14)} ${String(set.length).padStart(5)} records  `
      + `${String(m.length).padStart(4)} measured  ${String(f).padStart(3)} follow`);
  }

  // ── BY DR RANGE ──────────────────────────────────────────────────────────
  console.log('\nBY DOMAIN RATING RANGE (measured link value only)');
  const bands = [[0, 29], [30, 49], [50, 69], [70, 100]];
  for (const [lo, hi] of bands) {
    const set = rows.filter((r) => typeof r.domainRating === 'number'
      && r.domainRating >= lo && r.domainRating <= hi);
    const m = set.filter((r) => r.backlinkType);
    const f = set.filter((r) => r.backlinkType === 'dofollow').length;
    console.log(`  DR ${String(lo).padStart(2)}-${String(hi).padStart(3)}  `
      + `${String(set.length).padStart(5)} records  ${String(m.length).padStart(4)} measured  `
      + `${String(f).padStart(3)} follow`);
  }

  // ── THE INTERSECTIONS THE BRIEF ASKS FOR ─────────────────────────────────
  //
  // Each is an AND over facts that were separately evidenced. None of the
  // conditions implies another, which is the whole point of keeping them apart.
  const follow = (r) => r.backlinkType === 'dofollow';
  const indexable = (r) => r.listingIndexability === 'indexable';
  const dr = (n) => (r) => typeof r.domainRating === 'number' && r.domainRating >= n;

  const combos = [
    ['FREE + READY + FOLLOW', (r) => isFree(r) && hasRoute(r) && follow(r)],
    ['FREE + READY + FOLLOW + INDEXABLE', (r) => isFree(r) && hasRoute(r) && follow(r) && indexable(r)],
    ['DR >= 50 + FOLLOW', (r) => dr(50)(r) && follow(r)],
    ['DR >= 70 + FOLLOW', (r) => dr(70)(r) && follow(r)],
    // Recorded because it is the case a reader would otherwise assume away: a
    // follow link on a page configured not to be indexed.
    ['FOLLOW + NOINDEX', (r) => follow(r) && r.listingIndexability === 'noindex'],
    ['READY + UNKNOWN link value', (r) => hasRoute(r) && !r.backlinkType],
  ];
  console.log('\nINTERSECTIONS');
  for (const [label, fn] of combos) {
    const hits = rows.filter(fn);
    console.log(`  ${String(hits.length).padStart(5)}  ${label}`);
    if (hits.length && hits.length <= 12) {
      for (const h of hits) {
        console.log(`           ${h.id} (${h.country}) `
          + `dr=${h.domainRating ?? '-'} ${h.backlinkType || 'unknown'}/${h.listingIndexability || 'unknown'}`);
      }
    }
  }

  // ── WHAT REMAINS ─────────────────────────────────────────────────────────
  const ready = rows.filter(hasRoute);
  console.log('\nCOVERAGE OF THE COHORT THAT MATTERS MOST');
  console.log(`  records with a route: ${ready.length}`);
  console.log(`  of those, measured:   ${ready.filter((r) => r.backlinkType).length}`);
  console.log(`  of those, unknown:    ${ready.filter((r) => !r.backlinkType).length}`);
}

module.exports = { load, hasRoute, isFree, LINK_LABEL, INDEX_LABEL, TARGET_LABEL };

if (require.main === module) run();
