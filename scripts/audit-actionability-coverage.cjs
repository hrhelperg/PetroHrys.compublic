#!/usr/bin/env node
// scripts/audit-actionability-coverage.cjs
'use strict';

// Where the corpus knows what a business can do, and where it only knows a
// site exists.
//
// The two are different facts and this report refuses to blur them. A country
// with forty live directories and no established route is not well covered; it
// is forty open questions. Reporting "active records" as coverage is how a
// register talks itself into believing it is finished.
//
//   node scripts/audit-actionability-coverage.cjs
//   node scripts/audit-actionability-coverage.cjs --json

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

const COLLECTIONS = [
  {
    key: 'directories',
    file: 'data/business-directories/opportunities.json',
    routes: ['submissionUrl', 'claimUrl'],
    action: (r) => (r.listingAction && r.listingAction !== 'unknown' ? r.listingAction : null),
  },
  {
    key: 'marketplaces',
    file: 'data/marketplaces/marketplaces.json',
    routes: [],
    action: () => null,
  },
  {
    key: 'media',
    file: 'data/media-pr-publishing/media-platforms.json',
    routes: ['submissionUrl', 'pitchUrl', 'pressReleaseUrl', 'advertisingUrl'],
    action: (r) => (r.opportunityTypes || []).filter((t) => t !== 'unknown').join('+') || null,
  },
  {
    key: 'tenders',
    file: 'data/tenders-procurement/platforms.json',
    routes: ['supplierRegistrationUrl', 'submissionUrl'],
    action: () => null,
  },
];

const load = (f) => {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  return Array.isArray(raw) ? raw : Object.values(raw).find(Array.isArray);
};

function main() {
  const report = { collections: {}, byCountry: {}, byAction: {} };

  for (const c of COLLECTIONS) {
    const rows = load(c.file);
    const active = rows.filter((r) => r.currentStatus === 'active');
    const withRoute = active.filter((r) => c.routes.some((f) => r[f]));
    const withAction = active.filter((r) => c.action(r));

    report.collections[c.key] = {
      total: rows.length,
      active: active.length,
      withRoute: withRoute.length,
      withAction: withAction.length,
      routeCoverage: active.length ? +(withRoute.length / active.length * 100).toFixed(1) : 0,
    };

    for (const r of active) {
      const country = r.country || '(none)';
      const slot = report.byCountry[country] || (report.byCountry[country] = { active: 0, withRoute: 0 });
      slot.active += 1;
      if (c.routes.some((f) => r[f])) slot.withRoute += 1;
    }
    for (const r of withAction) {
      const a = c.action(r);
      report.byAction[a] = (report.byAction[a] || 0) + 1;
    }
  }

  if (process.argv.includes('--json')) { console.log(JSON.stringify(report, null, 1)); return; }

  console.log('COLLECTION            total  active  route  action   route coverage');
  for (const [k, v] of Object.entries(report.collections)) {
    console.log(`  ${k.padEnd(20)}${String(v.total).padStart(5)}${String(v.active).padStart(8)}`
      + `${String(v.withRoute).padStart(7)}${String(v.withAction).padStart(8)}${String(`${v.routeCoverage}%`).padStart(16)}`);
  }

  const countries = Object.entries(report.byCountry)
    .map(([k, v]) => ({ country: k, ...v }))
    .filter((x) => x.active >= 5);

  const blind = countries.filter((x) => x.withRoute === 0).sort((a, b) => b.active - a.active);
  console.log(`\n${blind.length} country/countries with 5+ active records and NOT ONE known action:`);
  for (const x of blind.slice(0, 18)) console.log(`  ${String(x.active).padStart(4)} active  ${x.country}`);
  if (blind.length > 18) console.log(`  … and ${blind.length - 18} more`);

  const best = countries.filter((x) => x.withRoute > 0)
    .sort((a, b) => (b.withRoute / b.active) - (a.withRoute / a.active)).slice(0, 8);
  console.log('\nbest-covered markets:');
  for (const x of best) {
    console.log(`  ${String(`${Math.round(x.withRoute / x.active * 100)}%`).padStart(5)}  ${String(`${x.withRoute}/${x.active}`).padEnd(8)}${x.country}`);
  }

  console.log('\nestablished action types:');
  for (const [k, v] of Object.entries(report.byAction).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(5)}  ${k}`);
  }

  const totals = Object.values(report.collections)
    .reduce((a, v) => ({ active: a.active + v.active, route: a.route + v.withRoute }), { active: 0, route: 0 });
  console.log(`\n${totals.route} of ${totals.active} active records across the corpus carry a route `
    + `(${(totals.route / totals.active * 100).toFixed(1)}%). The rest are live sites whose `
    + 'use is still an open question.');
}

main();
