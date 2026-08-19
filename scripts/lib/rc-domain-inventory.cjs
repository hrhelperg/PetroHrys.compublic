'use strict';

// Which domains the Research Center would ask a provider about.
//
// ── A RECORD IS NOT A DOMAIN ────────────────────────────────────────────────
//
// The corpus holds 2747 canonical records on far fewer domains. Encuentra24
// runs one site for eight Central American countries and the corpus carries
// eight records for it, because a business in Panama and a business in Costa
// Rica are told about their own market. Those eight records are eight facts and
// must stay eight records — the canonical identity is country plus host, and
// this file does not touch it.
//
// But they are ONE domain, and a provider asked eight times returns the same
// number eight times and charges for eight requests. So the inventory keeps the
// two ideas apart: records are grouped BY target, never merged INTO one.
//
// ── WHAT A TARGET IS ────────────────────────────────────────────────────────
//
// The repository already has one deterministic domain policy, in bd-schema's
// normaliseDomain: lowercase host, no protocol, no path, no trailing dot, and
// "www." removed. A subdomain is KEPT — appsource.microsoft.com is not
// microsoft.com, and collapsing it would attribute Microsoft's authority to a
// storefront. That policy is reused here rather than restated, so the target a
// request is sent to is the same string the corpus already records as the
// measured domain.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const S = require('./bd-schema.cjs');

// Where each collection keeps its records, and which field holds the site.
// Business Directories are read from the per-country registry, which is the
// source of record; opportunities.json is the compiled aggregate.
//
// ── TWO DIRECTORY CORPORA, NOT ONE ──────────────────────────────────────────
//
// data/business-directories/ holds two record sets with ZERO ids in common,
// and reading only one of them silently drops 1541 records from the inventory.
//
//   directories/*.json     295 curated official registries — ABN Lookup, ASIC,
//                          APRA. This is the set that already carries Domain
//                          Rating and the PetroHrys Score.
//   opportunities.json    1541 places a business can get itself listed —
//                          Yellow Pages, Manta, Hotfrog. This is the set the
//                          Distribution Planner projects from.
//
// They answer different questions and are both canonical, so both are here.
const COLLECTIONS = {
  directories: {
    registry: path.join(ROOT, 'data/business-directories/directories'),
    urlField: 'website',
  },
  'directory-opportunities': {
    file: path.join(ROOT, 'data/business-directories/opportunities.json'),
    urlField: 'website',
  },
  marketplaces: {
    file: path.join(ROOT, 'data/marketplaces/marketplaces.json'),
    urlField: 'website',
  },
  media: {
    file: path.join(ROOT, 'data/media-pr-publishing/media-platforms.json'),
    urlField: 'website',
  },
  tenders: {
    file: path.join(ROOT, 'data/tenders-procurement/platforms.json'),
    urlField: 'officialUrl',
  },
};

function readCollection(name) {
  const C = COLLECTIONS[name];
  if (C.file) return JSON.parse(fs.readFileSync(C.file, 'utf8'));
  const out = [];
  for (const f of fs.readdirSync(C.registry).sort()) {
    if (!f.endsWith('.json')) continue;
    const parsed = JSON.parse(fs.readFileSync(path.join(C.registry, f), 'utf8'));
    const rows = Array.isArray(parsed)
      ? parsed
      : Object.values(parsed).find(Array.isArray) || [];
    for (const r of rows) out.push(r);
  }
  return out;
}

// One deterministic pass over everything. Sorted by target so two runs on the
// same corpus produce the same order and therefore the same request sequence —
// an inventory that reordered itself would make a resumed run look different
// from an uninterrupted one even when nothing changed.
function inventory() {
  const byTarget = new Map();
  const records = [];
  for (const name of Object.keys(COLLECTIONS)) {
    const urlField = COLLECTIONS[name].urlField;
    for (const r of readCollection(name)) {
      const url = r[urlField];
      const target = S.normaliseDomain(url);
      const entry = { collection: name, id: r.id, country: r.country, url: url || null, target };
      records.push(entry);
      if (!target) continue;
      if (!byTarget.has(target)) byTarget.set(target, []);
      byTarget.get(target).push(entry);
    }
  }
  const targets = [...byTarget.keys()].sort();
  return {
    records,
    targets,
    byTarget,
    recordsWithoutTarget: records.filter((r) => !r.target),
  };
}

function summary() {
  const inv = inventory();
  const perCollection = {};
  for (const r of inv.records) {
    const c = (perCollection[r.collection] ||= { records: 0, withTarget: 0, targets: new Set() });
    c.records += 1;
    if (r.target) { c.withTarget += 1; c.targets.add(r.target); }
  }
  const shared = [...inv.byTarget.values()].filter((rs) => rs.length > 1);
  return {
    canonicalRecords: inv.records.length,
    recordsWithATarget: inv.records.length - inv.recordsWithoutTarget.length,
    uniqueTargets: inv.targets.length,
    // What asking once per domain saves against asking once per record.
    requestsAvoidedByReuse: inv.records.length - inv.recordsWithoutTarget.length - inv.targets.length,
    targetsSharedBySeveralRecords: shared.length,
    largestSharedTarget: shared.sort((a, b) => b.length - a.length)[0]
      ? { target: shared[0][0].target, records: shared[0].length }
      : null,
    byCollection: Object.fromEntries(Object.entries(perCollection)
      .map(([k, v]) => [k, { records: v.records, withTarget: v.withTarget, distinctTargets: v.targets.size }])),
  };
}

module.exports = { COLLECTIONS, readCollection, inventory, summary, normaliseDomain: S.normaliseDomain };
