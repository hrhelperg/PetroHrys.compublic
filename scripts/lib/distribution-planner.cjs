'use strict';

// Unified Distribution Planner v1 — the adaptors and the loader.
//
// Three collections answer three different questions:
//
//   Business Directories        where a company creates or claims a PROFILE
//   Marketplace & Classifieds   where a company publishes a LISTING or AD
//   Media, PR & Publishing      where a company PITCHES, PUBLISHES or SPONSORS
//
// This file makes them comparable WITHOUT making them the same. It is a
// projection: each collection is read through an adaptor into a common shape in
// memory, and nothing is written back. There is no merged master file, no
// duplicated record, and no invented universal authority score. Canonical facts
// stay in the collection that owns them, and every projected opportunity carries
// its source collection, its NATIVE quality signal and its native action type,
// so a directory citation is never displayed as if it were a press mention.
//
// ── WHY A NATIVE-QUALITY ADAPTOR AND NOT ONE SCORE ──────────────────────────
//
// The three collections measure different things and measure them differently.
// Media has a six-dimension Media Score with an evidence floor. Directories have
// a tier, a priority and a listing action. Marketplaces have a type, a cost and
// a seller-type rule. Flattening those into one number would invent precision
// nobody has. Instead each adaptor reports a native quality on a 0-100 scale
// with the SIGNAL IT ACTUALLY USED recorded alongside, and the planner ranks on
// fit first and quality second.
//
// ── WHAT THIS FILE STILL OWNS, AND WHAT IT DOES NOT ─────────────────────────
//
// It owns the parts that KNOW A SOURCE SCHEMA — the three adaptors and the
// read-only loader — and nothing else. Everything that DECIDES moved to
// dp-engine.cjs, which is pure, requires nothing, and is shipped verbatim to the
// browser as js/dp-engine.js. The engine is re-exported below so every existing
// caller and test is untouched, and so there is exactly one implementation: the
// page's client and this generator cannot disagree about what a campaign is.

const path = require('node:path');
const fs = require('node:fs');

const S = require('./media-schema.cjs');
const MI = require('./media-intelligence.cjs');
const MP = require('./mp-schema.cjs');
const O = require('./bd-opportunities.cjs');
const bdCsv = require('./bd-csv.cjs');
const BD = require('./bd-schema.cjs');
const { loadRegistry } = require('./bd-registry.cjs');
const E = require('./dp-engine.cjs');

const ROOT = path.join(__dirname, '..', '..');

// The planner's route, built here and nowhere else. The repository's route
// contract forbids interpolating a path inline, and this is the module that
// owns the planner.
const PLANNER_PATH = '/research/distribution-planner/';

// The browser payload the generator writes and js/distribution-planner.js
// fetches. It sits beside the CSV inside the planner's own route because
// /data/* is a forced 404 — the raw collections are deliberately not served —
// and a client that fetched one would get the 404 page and fail silently.
const PLANNER_DATA_FILE = 'planner-data.json';

const clamp = E.clamp;

// ── adaptors ────────────────────────────────────────────────────────────────
// Each returns the projected shape. Nothing mutates its source record.

function directoryAction(r) {
  if (r.listingAction === 'claim') return 'claim-profile';
  if (r.listingAction === 'create' || r.listingAction === 'create-and-claim') return 'create-listing';
  if (r.submissionModel === 'paid') return 'apply-for-inclusion';
  return 'investigate';
}

// Native quality for a directory: tier and priority are what that collection
// actually measures. Domain Rating is deliberately NOT used — only 64 records
// carry a frozen historical measurement and using it would rank on whether a
// number happened to be taken, not on quality.
const DIR_TIER = { tier1: 88, tier2: 70, tier3: 52 };
const DIR_PRIORITY = { P1: 12, P2: 4, P3: 0, hold: -12 };
function directoryQuality(r) {
  const base = DIR_TIER[r.tier];
  if (typeof base !== 'number') return { value: null, signal: 'no tier recorded' };
  let v = base + (DIR_PRIORITY[r.priority] ?? 0);
  if (r.publicProfileAvailable === true) v += 4;
  if (r.listingAction === 'unknown') v -= 10;
  return { value: clamp(v), signal: `tier ${r.tier}, priority ${r.priority}` };
}

// Native quality for a marketplace: who may list and what it costs are the
// facts that collection holds. A platform that only accepts private sellers is
// close to useless to a company however large it is.
const MP_SELLER = { business: 86, both: 74, private: 28 };
function marketplaceQuality(r) {
  const base = MP_SELLER[r.sellerTypes];
  if (typeof base !== 'number') return { value: null, signal: 'no seller rule recorded' };
  let v = base;
  if (r.costModel === 'free') v += 6;
  if (r.costModel === 'paid') v -= 6;
  if ((r.alsoCovers || []).length) v += 3;
  if (r.currentStatus === 'unknown') v -= 8;
  return { value: clamp(v), signal: `accepts ${r.sellerTypes} sellers, ${r.costModel}` };
}

function mediaAction(r) {
  const t = new Set(r.opportunityTypes);
  if (t.has('unknown')) return 'investigate';
  if (t.has('contributed-article') || t.has('guest-application')) return 'contribute-article';
  if (t.has('editorial-pitch')) return 'pitch-editor';
  if (t.has('editorial-submission')) return 'submit-news';
  if (t.has('product-launch') || t.has('startup-launch')) return 'launch-product';
  if (t.has('press-release')) return 'send-press-release';
  if (t.has('expert-source') || t.has('journalist-source')) return 'register-as-source';
  if (t.has('podcast-guest')) return 'apply-podcast-guest';
  if (t.has('award-entry')) return 'enter-award';
  if (t.has('company-profile') || t.has('self-publish')) return 'publish-profile';
  if (t.has('sponsored-content') || t.has('newsletter-submission')) return 'sponsor-placement';
  return 'investigate';
}

// The action URL comes from the source record and from nowhere else. Where the
// collection has none, the projection carries null and the UI says so — a URL
// synthesised from the homepage would be a fabricated fact.
function firstUrl(...candidates) {
  for (const c of candidates) if (typeof c === 'string' && /^https:\/\//.test(c)) return c;
  return null;
}

// Evidence first, derivation second, and the two non-route findings passed
// straight through: `invite-only` and `not-applicable` are answers, and
// dressing either as an action would be the exact failure this collection has
// been avoiding everywhere else.
// What it costs a SELLER, which is the question a budget control is asking.
//
// `costModel` describes the platform; `sellerCost` describes what a business
// pays to use it, and where both exist the second is the one that answers
// "what can I afford". The mapping keeps one judgement explicit:
// free-listing-commission becomes `free` to the planner, because a business
// with no money can start today and pays only out of revenue it has already
// earned. The precise value stays on the record, so the distinction survives
// everywhere it matters — the data, the export, the row.
const SELLER_COST_TO_PLANNER = {
  free: 'free',
  'free-listing-commission': 'free',
  'free-tier': 'freemium',
  'paid-upfront': 'paid',
};

function marketplaceCost(r) {
  const seller = r.sellerCost;
  if (seller && seller !== 'unknown' && SELLER_COST_TO_PLANNER[seller]) {
    return SELLER_COST_TO_PLANNER[seller];
  }
  return r.costModel;
}

function marketplaceAction(r) {
  const evidenced = r.sellerAction;
  if (evidenced && evidenced !== 'unknown') {
    if (evidenced === 'invite-only' || evidenced === 'not-applicable') return 'investigate';
    return evidenced;
  }
  if (r.marketplaceType === 'b2b') return 'create-seller-profile';
  if (r.marketplaceType === 'general-classifieds') return 'publish-classified';
  return 'post-advertisement';
}

function project({ directories, marketplaces, media }) {
  const out = [];
  for (const r of directories) {
    const q = directoryQuality(r);
    out.push({
      sourceCollection: 'directories', platformId: r.id, name: r.name, website: r.website,
      country: r.country, audienceGeography: r.audienceGeography || null,
      actionType: directoryAction(r),
      actionUrl: firstUrl(r.submissionUrl, r.claimUrl),
      cost: r.submissionModel || 'unknown',
      nativeQuality: q.value, nativeSignal: q.signal,
      evidence: r.currentStatus === 'unknown' ? 'needs-browser-check' : 'reachable',
      category: r.category, accepts: r.accepts || {}, priority: r.priority, record: r,
      note: r.description || '', limitations: r.notRecommendedFor || null,
    });
  }
  for (const r of marketplaces) {
    const q = marketplaceQuality(r);
    out.push({
      sourceCollection: 'marketplaces', platformId: r.id, name: r.name, website: r.website,
      country: r.country, audienceGeography: null,
      // An EVIDENCED action outranks a derived one. The fallback below infers
      // an action from the platform's type, which is a reasonable guess about
      // a category and says nothing about a particular operator: a b2b
      // marketplace that says "Post an ad" is publishing classifieds whatever
      // its type field claims. Where research established what the operator
      // actually offers, that is what the planner is told.
      actionType: marketplaceAction(r),
      // The route is carried only when the collection holds one. It is still
      // never invented from the website.
      actionUrl: r.sellerActionUrl || null,
      sellerAction: r.sellerAction || 'unknown',
      cost: marketplaceCost(r), nativeQuality: q.value, nativeSignal: q.signal,
      evidence: r.currentStatus === 'unknown' ? 'needs-browser-check' : 'reachable',
      marketplaceType: r.marketplaceType, alsoCovers: r.alsoCovers || [],
      sellerTypes: r.sellerTypes, priority: null, record: r,
      note: r.note || '', limitations: null,
    });
  }
  for (const r of media) {
    const ms = MI.mediaScore(r);
    out.push({
      sourceCollection: 'media', platformId: r.id, name: r.name, website: r.website,
      country: r.country, audienceGeography: r.audienceGeography,
      actionType: mediaAction(r),
      actionUrl: firstUrl(r.submissionUrl, r.pitchUrl, r.pressReleaseUrl, r.advertisingUrl),
      cost: r.costModel,
      nativeQuality: ms.score,
      nativeSignal: ms.score === null ? 'below the Media Score evidence floor'
        : `Media Score ${ms.score} (${ms.band})`,
      evidence: r.currentStatus === 'unknown' ? 'needs-browser-check' : 'reachable',
      categories: r.categories, industries: r.industries, priority: r.priority,
      opportunityTypes: r.opportunityTypes, record: r,
      note: r.shortNote, limitations: r.limitations,
    });
  }
  return out;
}

// ── loading, read-only ──────────────────────────────────────────────────────
function loadAll() {
  const countries = new Set(JSON.parse(
    fs.readFileSync(path.join(ROOT, 'data/business-directories/countries.json'), 'utf8'))
    .map((c) => c.slug));
  const registry = loadRegistry();
  const directories = bdCsv.actionableOpportunities(registry.directories,
    O.loadOpportunities(path.join(ROOT, 'data/business-directories'),
      new Set(registry.countries.map((c) => c.slug)),
      new Set(registry.categories.map((c) => c.slug))));
  const marketplaces = MP.loadMarketplaces(
    path.join(ROOT, 'data/marketplaces/marketplaces.json'), countries).filter(MP.isPublishable);
  const media = S.loadMediaPlatforms(
    path.join(ROOT, 'data/media-pr-publishing/media-platforms.json'), countries).filter(S.isActionable);
  return { directories, marketplaces, media, countries };
}

// One comparator for every deterministic ordering in this feature.
const compareStableName = (a, b) => S.compareStable(a.name, b.name)
  || S.compareStable(a.sourceCollection, b.sourceCollection)
  || S.compareStable(a.platformId, b.platformId);

// The decision engine, re-exported rather than reimplemented. Callers that
// predate the split — the generator, the tests, the CSV export — see exactly the
// surface they saw before, and there is one implementation behind it.
module.exports = {
  compareStableName, PLANNER_PATH, PLANNER_DATA_FILE,
  COLLECTIONS: E.COLLECTIONS, COLLECTION_BY_KEY: E.COLLECTION_BY_KEY,
  ACTION_TYPES: E.ACTION_TYPES, OBJECTIVES: E.OBJECTIVES, OBJECTIVE_BY_KEY: E.OBJECTIVE_BY_KEY,
  BUDGETS: E.BUDGETS, BUDGET_BY_KEY: E.BUDGET_BY_KEY, GROUPS: E.GROUPS,
  MEDIA_OBJECTIVE: E.MEDIA_OBJECTIVE, DIRECTORY_ACCEPTS: E.DIRECTORY_ACCEPTS,
  MARKETPLACE_TYPES_FOR: E.MARKETPLACE_TYPES_FOR,
  UNRATED_QUALITY: E.UNRATED_QUALITY, UNRATED_DISCOUNT: E.UNRATED_DISCOUNT,
  project, loadAll, plan: E.plan, scoreOpportunity: E.scoreOpportunity,
  campaign: E.campaign, campaignScore: E.campaignScore,
  CAMPAIGN_GROUPS: E.CAMPAIGN_GROUPS, EVIDENCE_MODES: E.EVIDENCE_MODES,
  EVIDENCE_MODE_BY_KEY: E.EVIDENCE_MODE_BY_KEY,
  READINESS_WEIGHT: E.READINESS_WEIGHT, CONFIDENCE_WEIGHT: E.CONFIDENCE_WEIGHT,
  businessFit: E.businessFit, objectiveFit: E.objectiveFit, geographyFit: E.geographyFit,
  costFit: E.costFit, summaryText: E.summaryText, projectForClient: E.projectForClient,
  FIELD_CONTRACT: E.FIELD_CONTRACT,
  WORKLIST_SECTIONS: E.WORKLIST_SECTIONS, worklist: E.worklist,
  worklistHeading: E.worklistHeading, worklistRow: E.worklistRow,
  healthScopeNote: E.healthScopeNote,
  directoryAction, mediaAction, directoryQuality, marketplaceQuality,
  ACCEPTS_KEYS: BD.ACCEPTS_KEYS,
};
