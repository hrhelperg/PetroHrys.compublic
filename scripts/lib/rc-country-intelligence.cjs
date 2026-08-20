'use strict';

// What a business can actually do in one country, across every collection.
//
// ── WHY THIS IS A PROJECTION AND NOT A RANKING ──────────────────────────────
//
// The question a reader arrives with is "what channels do I have in Italy", and
// the honest answer is four lists, not one. A directory listing, a marketplace
// seller account, a press submission and a tender registration are different
// kinds of work with different costs and different outcomes, and any single
// ordering across them would be answering a question nobody asked.
//
// So this file groups by collection and keeps the facts separate. It computes
// no score. Domain Rating is Ahrefs' measurement of a backlink profile, cost is
// evidence about a price, readiness is evidence about a route — three facts
// that stay three facts.
//
// ── WHERE EACH FACT COMES FROM ──────────────────────────────────────────────
//
// Nothing here is derived twice. Readiness is the Distribution Planner's own
// actionability, so a record cannot be READY on a country page and
// NEEDS_RESEARCH on the worklist. Domain Rating and its provenance come
// straight off the canonical record. The action type and route come from the
// planner's projection, which is the one place that already knows what each
// collection's action vocabulary means.
//
// ── TENDER PLATFORMS ARE DELIBERATELY DIFFERENT ─────────────────────────────
//
// The planner does not project them, and its urlMatchesAction returns false for
// any collection it does not know — so a tender platform could never be READY
// and inventing a status for it here would be a second, quieter definition of
// readiness. They carry their own two facts instead, which are the ones a
// supplier actually needs: whether notices can be searched for nothing, and
// whether bidding costs anything. Those are not the same question, and 293
// platforms answer yes to the first while 8 are known to answer yes to the
// second.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const P = require('./distribution-planner.cjs');
const E = require('./dp-engine.cjs');
const S = require('./bd-schema.cjs');

const COLLECTIONS = ['directories', 'marketplaces', 'media', 'tenders'];

const TENDERS_FILE = path.join(ROOT, 'data/tenders-procurement/platforms.json');

// Costs that let a business start without paying first. Taken from the
// vocabularies the collections already use rather than restated as a new one:
// "free-listing-commission" belongs here because a fee that only exists once
// something has sold is a fee out of revenue already earned, and a business
// with no budget can act today. "freemium" and "free-tier" belong for the same
// reason. "unknown" does not belong: absence of evidence is not free.
const NO_UPFRONT = new Set(['free', 'freemium', 'free-tier', 'free-listing-commission']);

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);

// One record, in the shape every country surface reads. Deliberately flat and
// small: this is what gets counted, filtered, sorted, rendered and exported, and
// a view model that carried whole records would invite each consumer to reach
// past it for a field nobody agreed on.
function viewOf(op, status) {
  const r = op.record || {};
  const provenance = (r.metricsProvenance || {}).domainRating || null;
  return {
    collection: op.sourceCollection,
    id: op.platformId,
    name: op.name,
    country: op.country,
    website: op.website || null,
    domain: S.normaliseDomain(op.website) || null,
    domainRating: isNumber(r.domainRating) ? r.domainRating : null,
    measuredAt: provenance ? provenance.measuredAt : null,
    provider: provenance ? provenance.provider : null,
    cost: op.cost || 'unknown',
    noUpfrontCost: NO_UPFRONT.has(op.cost),
    actionability: status,
    actionType: op.actionType && op.actionType !== 'investigate' ? op.actionType : null,
    // A route is carried only where the collection holds one, and is never
    // invented from the website. No route means no execution link, which is the
    // rule the worklist already follows.
    actionUrl: op.actionUrl || null,
    searchAccess: null,
    bidAccess: null,
  };
}

function tenderViewOf(r) {
  const provenance = (r.metricsProvenance || {}).domainRating || null;
  return {
    collection: 'tenders',
    id: r.id,
    name: r.name,
    country: r.country,
    website: r.officialUrl || null,
    domain: S.normaliseDomain(r.officialUrl) || null,
    domainRating: isNumber(r.domainRating) ? r.domainRating : null,
    measuredAt: provenance ? provenance.measuredAt : null,
    provider: provenance ? provenance.provider : null,
    // A tender platform has two access facts and no single "cost". Collapsing
    // them into one would be exactly the conflation the corpus spent a phase
    // separating, so `cost` stays unknown here and the two facts travel intact.
    cost: 'unknown',
    noUpfrontCost: r.bidAccess === 'free',
    actionability: null,
    actionType: null,
    actionUrl: r.supplierRegistrationUrl || null,
    searchAccess: r.searchAccess || 'unknown',
    bidAccess: r.bidAccess || 'unknown',
  };
}

// ── THE UNIVERSE ────────────────────────────────────────────────────────────

let cache = null;

function universe() {
  if (cache) return cache;
  const ops = P.project(P.loadAll());
  const byCountry = new Map();
  const add = (view) => {
    if (!view.country) return;
    if (!byCountry.has(view.country)) {
      byCountry.set(view.country, { directories: [], marketplaces: [], media: [], tenders: [] });
    }
    byCountry.get(view.country)[view.collection].push(view);
  };
  for (const op of ops) add(viewOf(op, E.actionability(op).status));
  for (const r of JSON.parse(fs.readFileSync(TENDERS_FILE, 'utf8'))) add(tenderViewOf(r));

  // Sorted once, deterministically, so two runs over one corpus produce one
  // ordering and a generated page cannot differ from itself.
  for (const groups of byCountry.values()) {
    for (const key of COLLECTIONS) {
      groups[key].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : (a.id < b.id ? -1 : 1)));
    }
  }
  cache = byCountry;
  return cache;
}

const forCountry = (slug) => universe().get(slug)
  || { directories: [], marketplaces: [], media: [], tenders: [] };

const allOf = (groups) => COLLECTIONS.flatMap((k) => groups[k]);

// ── FACTUAL SUMMARY ─────────────────────────────────────────────────────────
//
// Counts, and nothing that pretends to be a proportion of a market. We know how
// many sources this corpus holds for a country; we do not know how many exist,
// so "12 directories" is a fact and "38% coverage" would be an invention with a
// denominator nobody has.

function summaryFor(slug) {
  const groups = forCountry(slug);
  const all = allOf(groups);
  const measured = all.filter((r) => r.domainRating !== null);
  const ratings = measured.map((r) => r.domainRating).sort((a, b) => a - b);
  const median = ratings.length
    ? (ratings.length % 2
      ? ratings[(ratings.length - 1) / 2]
      : Math.round((ratings[ratings.length / 2 - 1] + ratings[ratings.length / 2]) / 2))
    : null;
  return {
    country: slug,
    total: all.length,
    directories: groups.directories.length,
    marketplaces: groups.marketplaces.length,
    media: groups.media.length,
    tenders: groups.tenders.length,
    withDomainRating: measured.length,
    highestDomainRating: ratings.length ? ratings[ratings.length - 1] : null,
    medianDomainRating: median,
    above50: ratings.filter((v) => v >= 50).length,
    above70: ratings.filter((v) => v >= 70).length,
    noUpfrontCost: all.filter((r) => r.noUpfrontCost).length,
    ready: all.filter((r) => r.actionability === 'READY').length,
    withActionRoute: all.filter((r) => r.actionUrl).length,
    sellerReadyMarketplaces: groups.marketplaces.filter((r) => r.actionability === 'READY').length,
    mediaWithRoute: groups.media.filter((r) => r.actionUrl).length,
    tendersFreeSearch: groups.tenders.filter((r) => r.searchAccess === 'free').length,
    tendersFreeBid: groups.tenders.filter((r) => r.bidAccess === 'free').length,
  };
}

// What this corpus does NOT hold for a country. Phrased as a fact about the
// Research Center rather than about the country: "no verified source here" is
// something we know; "this country has none" is something we do not.
function gapsFor(slug) {
  const g = forCountry(slug);
  const all = allOf(g);
  const out = [];
  if (!g.directories.length) out.push('directories');
  if (!g.marketplaces.length) out.push('marketplaces');
  if (!g.media.length) out.push('media');
  if (!g.tenders.length) out.push('tenders');
  if (!all.some((r) => r.noUpfrontCost)) out.push('no-upfront-cost');
  if (!all.some((r) => r.actionability === 'READY')) out.push('ready');
  if (!g.marketplaces.some((r) => r.actionUrl)) out.push('marketplace-seller-route');
  if (!g.media.some((r) => r.actionUrl)) out.push('media-submission-route');
  if (g.tenders.length && !g.tenders.some((r) => r.bidAccess === 'free')) out.push('proven-free-bidding');
  return out;
}

// ── WHAT IS DELIBERATELY NOT HERE ───────────────────────────────────────────
//
// The country universe is smaller than the canonical corpus, and the difference
// has one reason with one name.
//
// 218 curated registry records carry `listingAction: not-applicable` and
// `submissionModel: notApplicable` — USPTO Trademark Search, SEC EDGAR, FINRA
// BrokerCheck and their like. A business cannot list itself in a statutory
// register; those records exist so a reader can LOOK SOMETHING UP, not so they
// can act. A page answering "what channels can I use in this market" that
// offered SEC EDGAR as a channel would be wrong in a way no filter could fix.
//
// This is stated as a function rather than a comment so the number is checkable
// and a silent change in the exclusion rule fails a test instead of quietly
// shrinking every country page.
function reconciliation() {
  const inCountries = new Set();
  for (const groups of universe().values()) {
    for (const r of allOf(groups)) inCountries.add(`${r.collection}:${r.id}`);
  }
  const canonical = [];
  const INV = require('./rc-domain-inventory.cjs');
  for (const [name, C] of Object.entries(INV.COLLECTIONS)) {
    const collection = name === 'directory-opportunities' ? 'directories'
      : name === 'directories' ? 'directories' : name;
    for (const r of INV.readCollection(name)) {
      canonical.push({
        key: `${collection}:${r.id}`,
        // `submissionModel`, not `listingAction`: the curated registry files do
        // not store a listing action at all — it is derived when the registry
        // is loaded — so reading it off the raw record reported every statutory
        // register as "no listingAction" and hid the one reason that explains
        // 218 of the 226 exclusions.
        submissionModel: r.submissionModel ?? null,
        currentStatus: r.currentStatus ?? null,
        country: r.country ?? null,
      });
    }
  }
  const missing = canonical.filter((r) => !inCountries.has(r.key));
  const byReason = {};
  for (const r of missing) {
    const reason = r.submissionModel === 'notApplicable'
      ? 'reference-only: a statutory register nobody can list in'
      : !r.country ? 'no canonical country'
        : r.currentStatus && r.currentStatus !== 'active'
          ? `not actionable: currentStatus ${r.currentStatus}`
          : `other (${r.submissionModel ?? 'no submissionModel'} / ${r.currentStatus ?? 'no status'})`;
    byReason[reason] = (byReason[reason] || 0) + 1;
  }
  return {
    canonicalRecords: canonical.length,
    inCountryUniverse: inCountries.size,
    excluded: missing.length,
    byReason,
  };
}

function countries() {
  return [...universe().keys()].sort();
}

// The whole matrix, for analysis rather than for a page.
function matrix() {
  return countries().map(summaryFor);
}

module.exports = {
  COLLECTIONS, NO_UPFRONT, universe, forCountry, allOf, summaryFor, gapsFor,
  countries, matrix, viewOf, tenderViewOf, reconciliation,
};
