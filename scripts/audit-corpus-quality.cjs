#!/usr/bin/env node
// scripts/audit-corpus-quality.cjs
'use strict';

// One sweep across all four Research Center collections, looking for the
// pathologies this repository has actually produced.
//
// ── WHY A REPORT AND NOT A FIXER ────────────────────────────────────────────
//
// Every class below has a correct answer that depends on what the record IS,
// and a bulk rewrite would get some of them wrong at scale. The Barbados case
// is the argument: "two records, one host" looked like a duplicate and was a
// regional platform serving two markets, and collapsing it would have deleted a
// country's entire coverage. So this counts and names; a human decides.
//
// It reads only committed data and touches nothing.
//
//   node scripts/audit-corpus-quality.cjs
//   node scripts/audit-corpus-quality.cjs --json

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

const COLLECTIONS = [
  { key: 'directories', file: 'data/business-directories/opportunities.json', url: 'website' },
  { key: 'marketplaces', file: 'data/marketplaces/marketplaces.json', url: 'website' },
  { key: 'media', file: 'data/media-pr-publishing/media-platforms.json', url: 'website' },
  { key: 'regional-media', file: 'data/regional-media/regional-media.json', url: 'website' },
  { key: 'tenders', file: 'data/tenders-procurement/platforms.json', url: 'officialUrl' },
];

// Fields that describe the RECORD, and are therefore what a status can
// contradict. `limitations` is deliberately excluded: it exists to record what
// could not be established about a ROUTE, so "the submission form returned 403"
// sits there truthfully next to an active publication. Reading it as a
// contradiction would punish the collection for being precise.
const NOTE_FIELDS = ['note', 'shortNote', 'description'];
const noteOf = (r) => NOTE_FIELDS.map((f) => r[f]).filter((x) => typeof x === 'string').join(' ');
const anyText = (r) => ['note', 'shortNote', 'description', 'limitations']
  .map((f) => r[f]).filter((x) => typeof x === 'string').join(' ');

// A note that asks for work the record's own status says is finished.
const ASKS_FOR_WORK = /browser check is needed|could not be inspected|bot filter|bot challenge|no longer established|awaiting verification/i;
// Wording that only ever appears on a page selling or holding a domain.
const PARKED_WORDING = /\b(domain (is|may be) for sale|parked domain|buy this domain|hugedomains|sedo\.com|afternic)\b/i;

const LIVE = new Set(['active', 'unknown']);

function load(entry) {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, entry.file), 'utf8'));
  const rows = Array.isArray(raw) ? raw : Object.values(raw).find(Array.isArray);
  return rows.map((r) => ({ ...r, __url: r[entry.url] }));
}

function main() {
  const report = {};
  const all = [];

  for (const entry of COLLECTIONS) {
    const rows = load(entry);
    const problems = {
      malformedUrl: [],
      contradictoryNote: [],
      unexplainedUnknown: [],
      parkedWording: [],
      duplicateLiveIdentity: [],
      routeEqualsHomepage: [],
      actionWithoutRoute: [],
      redirectWithoutSurvivor: [],
      // Impossible combinations: a structured fact and a note that cannot both
      // be true. Structured state is canonical; the note is what goes stale.
      actionEstablishedButRouteUnknown: [],
      resolvedButStillUnderInvestigation: [],
      inactiveWithLiveRoute: [],
      staleRouteAfterMove: [],
    };

    const seen = new Map();
    for (const r of rows) {
      const url = r.__url;

      // A canonical URL has to be an absolute https URL and nothing stranger.
      let parsed = null;
      try { parsed = new URL(url); } catch { /* handled below */ }
      if (!parsed || parsed.protocol !== 'https:' || !parsed.hostname.includes('.')) {
        problems.malformedUrl.push(`${r.id}: ${JSON.stringify(url)}`);
      }

      const note = noteOf(r);
      // Structured state is canonical. A note asking for the work that would
      // establish the record contradicts a record that claims to be settled.
      if ((r.currentStatus === 'active' || r.currentStatus === 'redirected') && ASKS_FOR_WORK.test(note)) {
        problems.contradictoryNote.push(r.id);
      }
      // And the converse: unknown has to say what is outstanding, or it is
      // indistinguishable from never having been looked at.
      if (r.currentStatus === 'unknown' && !/browser check|could not be inspected|not established|uninspected|could not confirm|stays unknown/i.test(note)) {
        problems.unexplainedUnknown.push(r.id);
      }
      if (PARKED_WORDING.test(anyText(r))) problems.parkedWording.push(r.id);

      // Identity is country + host + the path that distinguishes one system
      // from another on it. Host alone is too crude: aiib.org carries corporate
      // procurement and project procurement, which are different systems with
      // different rules and different suppliers, and ungm.in-tend.co.uk carries
      // WHO, UNICEF and WFP behind one vendor. The bd-schema already says this
      // — sharing a domain is allowed when each record "points at a materially
      // different URL" — and an audit that ignored it would report six
      // duplicates that are not duplicates.
      if (parsed && LIVE.has(r.currentStatus)) {
        const materialPath = parsed.pathname.replace(/\/+$/, '');
        const key = `${r.country}|${parsed.hostname.replace(/^www\./, '')}${materialPath}`;
        if (seen.has(key)) problems.duplicateLiveIdentity.push(`${r.id} == ${seen.get(key)} (${key})`);
        else seen.set(key, r.id);
      }

      // A route that is the homepage is not a route.
      for (const field of ['submissionUrl', 'claimUrl', 'pitchUrl', 'pressReleaseUrl', 'tenderSearchUrl', 'supplierRegistrationUrl']) {
        if (r[field] && r[field] === url) problems.routeEqualsHomepage.push(`${r.id}.${field}`);
      }

      // An action claimed with no route recorded for it — and no account of
      // why there is none. A researched action whose URL was never captured is
      // a gap that says so; deleting the action to silence the audit would
      // throw away research to make a counter go down.
      if (['create', 'claim', 'create-and-claim', 'apply'].includes(r.listingAction)
        && !r.submissionUrl && !r.claimUrl
        && !/no listing route published in words|no submission URL is recorded/i.test(anyText(r))) {
        problems.actionWithoutRoute.push(r.id);
      }

      if (r.currentStatus === 'redirected' && !/surviving record is/i.test(note)) {
        problems.redirectWithoutSurvivor.push(r.id);
      }

      const text = anyText(r);
      const hasRoute = ['submissionUrl', 'claimUrl', 'pitchUrl', 'pressReleaseUrl']
        .some((f) => r[f]);

      // An action is established and the note says the route is unknown.
      if (hasRoute && /route (is )?(still )?(unknown|not established)|no submission URL is recorded/i.test(text)) {
        problems.actionEstablishedButRouteUnknown.push(r.id);
      }
      // A redirect is resolved and something still asks for it to be settled.
      if (/\[redirect:/.test(text)
        && /needed by a person to settle what this (entry|record) should point at|investigate (the )?redirect/i.test(text)) {
        problems.resolvedButStillUnderInvestigation.push(r.id);
      }
      // A record that is not live still hands out a route.
      if (['redirected', 'dormant', 'shutting-down'].includes(r.currentStatus) && hasRoute) {
        problems.inactiveWithLiveRoute.push(r.id);
      }
      // A route left behind on the host the record moved away from.
      if (parsed && hasRoute) {
        const siteHost = parsed.hostname.replace(/^www\./, '');
        for (const field of ['submissionUrl', 'claimUrl', 'pitchUrl', 'pressReleaseUrl']) {
          if (!r[field]) continue;
          let routeHost = null;
          try { routeHost = new URL(r[field]).hostname.replace(/^www\./, ''); } catch { continue; }
          const same = routeHost === siteHost
            || routeHost.endsWith(`.${siteHost}`) || siteHost.endsWith(`.${routeHost}`)
            // A route may legitimately live on a sibling domain the operator
            // runs — Malta's packages site, The Drum's awards site.
            || routeHost.split('.').slice(-2)[0] === siteHost.split('.').slice(-2)[0];
          if (!same && /\[redirect:/.test(text)) problems.staleRouteAfterMove.push(`${r.id}.${field}`);
        }
      }
    }

    report[entry.key] = {
      records: rows.length,
      status: rows.reduce((acc, r) => {
        acc[r.currentStatus || '(absent)'] = (acc[r.currentStatus || '(absent)'] || 0) + 1;
        return acc;
      }, {}),
      problems: Object.fromEntries(Object.entries(problems).map(([k, v]) => [k, v])),
    };
    all.push(...rows.map((r) => ({ ...r, __collection: entry.key })));
  }

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 1));
    return;
  }

  let total = 0;
  for (const [name, data] of Object.entries(report)) {
    console.log(`\n${name}  ${data.records} records  ${JSON.stringify(data.status)}`);
    for (const [problem, list] of Object.entries(data.problems)) {
      if (!list.length) continue;
      total += list.length;
      console.log(`  ${String(list.length).padStart(5)}  ${problem}`);
      for (const item of list.slice(0, 4)) console.log(`         ${item}`);
      if (list.length > 4) console.log(`         … and ${list.length - 4} more`);
    }
  }
  console.log(`\n${total} problem(s) across ${all.length} records.`);
}

main();
