#!/usr/bin/env node
// scripts/report-country-coverage.cjs
'use strict';

// Where the corpus is thin, per country, as a committed artefact.
//
// This exists to answer "where is the next phase worth spending on" with a
// table rather than an impression. It is deliberately NOT a score: every column
// is a count of something that was researched, and the one thing it must never
// do is turn those counts into a percentage of a market, because nobody knows
// the denominator — how many directories exist in Portugal is not a fact this
// project has.
//
// It makes no network request and writes one file.
//
//   node scripts/report-country-coverage.cjs           # write the artefact
//   node scripts/report-country-coverage.cjs --print   # show the headline gaps

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const C = require('./lib/rc-country-intelligence.cjs');

const OUT_DIR = path.join(ROOT, 'data/country-intelligence');
const OUT_FILE = path.join(OUT_DIR, 'coverage-matrix.json');

function matrix() {
  return C.matrix().map((s) => ({
    country: s.country,
    total: s.total,
    directories: s.directories,
    marketplaces: s.marketplaces,
    media: s.media,
    tenders: s.tenders,
    withDomainRating: s.withDomainRating,
    highestDomainRating: s.highestDomainRating,
    medianDomainRating: s.medianDomainRating,
    noUpfrontCost: s.noUpfrontCost,
    ready: s.ready,
    withActionRoute: s.withActionRoute,
    tendersFreeSearch: s.tendersFreeSearch,
    tendersFreeBid: s.tendersFreeBid,
    gaps: C.gapsFor(s.country),
  }));
}

// The countries where the NEXT phase would buy the most, expressed as the gap
// itself rather than as a ranking. A country with many sources and no routes is
// a research problem; a country with no sources at all is a discovery problem,
// and they are not the same work.
function priorities(rows) {
  const sizeable = rows.filter((r) => r.total >= 10);
  const byMissingRoutes = sizeable
    .map((r) => ({ country: r.country, total: r.total, withActionRoute: r.withActionRoute,
      without: r.total - r.withActionRoute }))
    .sort((a, b) => b.without - a.without).slice(0, 12);
  const byMissingCost = sizeable
    .map((r) => ({ country: r.country, total: r.total, noUpfrontCost: r.noUpfrontCost }))
    .filter((r) => r.noUpfrontCost === 0)
    .sort((a, b) => b.total - a.total).slice(0, 12);
  const tendersWithoutBidEvidence = rows
    .filter((r) => r.tenders > 0 && r.tendersFreeBid === 0)
    .map((r) => ({ country: r.country, tenders: r.tenders }))
    .sort((a, b) => b.tenders - a.tenders).slice(0, 12);
  const noMarketplace = sizeable.filter((r) => r.marketplaces === 0)
    .map((r) => ({ country: r.country, total: r.total })).sort((a, b) => b.total - a.total).slice(0, 12);
  return { byMissingRoutes, byMissingCost, tendersWithoutBidEvidence, noMarketplace };
}

function main() {
  const rows = matrix();
  const artefact = {
    generatedFrom: 'canonical Research Center data; no network request',
    countries: rows.length,
    records: rows.reduce((a, r) => a + r.total, 0),
    reconciliation: C.reconciliation(),
    priorities: priorities(rows),
    matrix: rows,
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const text = `${JSON.stringify(artefact, null, 1)}\n`;
  const before = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, 'utf8') : null;
  if (before === text) {
    console.log(`Country coverage matrix: ${rows.length} countries; 0 written.`);
  } else {
    fs.writeFileSync(OUT_FILE, text);
    console.log(`Country coverage matrix: ${rows.length} countries; 1 written.`);
  }
  if (process.argv.includes('--print')) {
    console.log('\nMost sources with no recorded action route:');
    for (const r of artefact.priorities.byMissingRoutes.slice(0, 8)) {
      console.log(`  ${r.country.padEnd(22)} ${String(r.without).padStart(4)} of ${r.total}`);
    }
    console.log('\nTen or more sources and no evidenced no-upfront-cost option:');
    for (const r of artefact.priorities.byMissingCost.slice(0, 8)) {
      console.log(`  ${r.country.padEnd(22)} ${r.total} sources`);
    }
    console.log('\nTender platforms with no proven free bidding:');
    for (const r of artefact.priorities.tendersWithoutBidEvidence.slice(0, 8)) {
      console.log(`  ${r.country.padEnd(22)} ${r.tenders} platform(s)`);
    }
  }
  return artefact;
}

module.exports = { matrix, priorities, OUT_FILE };

if (require.main === module) main();
