'use strict';

// Unified Distribution Planner v1.
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

const path = require('node:path');
const fs = require('node:fs');

const S = require('./media-schema.cjs');
const MI = require('./media-intelligence.cjs');
const REC = require('./media-recommend.cjs');
const MP = require('./mp-schema.cjs');
const O = require('./bd-opportunities.cjs');
const bdCsv = require('./bd-csv.cjs');
const BD = require('./bd-schema.cjs');
const { loadRegistry } = require('./bd-registry.cjs');

const ROOT = path.join(__dirname, '..', '..');

// The planner's route, built here and nowhere else. The repository's route
// contract forbids interpolating a path inline, and this is the module that
// owns the planner.
const PLANNER_PATH = '/research/distribution-planner/';

const COLLECTIONS = [
  { key: 'directories', label: 'Business Directories', lane: 1,
    question: 'where a company creates or claims a professional profile',
    path: '/research/business-directories/opportunities/' },
  { key: 'marketplaces', label: 'Marketplace & Classified Platforms', lane: 2,
    question: 'where a company publishes a listing or an advertisement',
    path: '/research/marketplaces/' },
  { key: 'media', label: 'Media, PR & Publishing', lane: 3,
    question: 'where a company pitches, publishes, launches or sponsors',
    path: '/research/media-pr-publishing/' },
];
const COLLECTION_BY_KEY = new Map(COLLECTIONS.map((c) => [c.key, c]));

// Action types stay distinct on purpose. A planner that called all of these
// "publish" would be lying about what the employee has to do.
const ACTION_TYPES = {
  'create-listing': { label: 'Create a listing', lane: 1 },
  'claim-profile': { label: 'Claim an existing profile', lane: 1 },
  'apply-for-inclusion': { label: 'Apply for inclusion', lane: 1 },
  'post-advertisement': { label: 'Post an advertisement', lane: 2 },
  'create-seller-profile': { label: 'Create a seller profile', lane: 2 },
  'publish-classified': { label: 'Publish a classified listing', lane: 2 },
  'pitch-editor': { label: 'Pitch an editor', lane: 3 },
  'submit-news': { label: 'Submit company news', lane: 3 },
  'send-press-release': { label: 'Send a press release', lane: 3 },
  'contribute-article': { label: 'Contribute an article', lane: 3 },
  'launch-product': { label: 'Submit a product launch', lane: 3 },
  'register-as-source': { label: 'Register as an expert source', lane: 3 },
  'apply-podcast-guest': { label: 'Apply as a podcast guest', lane: 3 },
  'sponsor-placement': { label: 'Buy a sponsored placement', lane: 3 },
  'enter-award': { label: 'Enter an award', lane: 3 },
  'publish-profile': { label: 'Publish a company profile', lane: 3 },
  investigate: { label: 'Investigate the route', lane: 0 },
};

// Planner objectives. Each declares which collections can serve it at all —
// this is the rule that stops a classified ad being offered as press coverage.
const OBJECTIVES = [
  { key: 'seo-citations', label: 'SEO and citations', collections: ['directories', 'media'] },
  { key: 'brand-authority', label: 'Brand authority', collections: ['media', 'directories'] },
  { key: 'referral-traffic', label: 'Referral traffic', collections: ['directories', 'marketplaces', 'media'] },
  { key: 'lead-generation', label: 'Lead generation', collections: ['directories', 'marketplaces', 'media'] },
  { key: 'local-discovery', label: 'Local discovery', collections: ['directories', 'marketplaces'] },
  { key: 'product-launch', label: 'Product launch', collections: ['media', 'marketplaces'] },
  { key: 'pr-coverage', label: 'PR coverage', collections: ['media'] },
  { key: 'founder-visibility', label: 'Founder visibility', collections: ['media'] },
  { key: 'b2b-buyer-discovery', label: 'B2B buyer discovery', collections: ['directories', 'marketplaces', 'media'] },
  { key: 'marketplace-exposure', label: 'Marketplace exposure', collections: ['marketplaces'] },
  { key: 'classified-advertising', label: 'Classified advertising', collections: ['marketplaces'] },
];
const OBJECTIVE_BY_KEY = new Map(OBJECTIVES.map((o) => [o.key, o]));

// Which media objective each planner objective maps to, so the media lane is
// scored by the SAME engine that powers the recommendation pages rather than a
// second copy of the logic living here.
const MEDIA_OBJECTIVE = {
  'seo-citations': 'seo-visibility',
  'brand-authority': 'brand-awareness',
  'referral-traffic': 'brand-awareness',
  'lead-generation': 'lead-generation',
  'local-discovery': 'local-awareness',
  'product-launch': 'product-launch',
  'pr-coverage': 'brand-awareness',
  'founder-visibility': 'founder-exposure',
  'b2b-buyer-discovery': 'lead-generation',
  'marketplace-exposure': null,
  'classified-advertising': null,
};

// Which accepts flag each canonical business profile maps to in the DIRECTORY
// collection. Only declared where the flag genuinely means the business —
// borrowing `enterprise` to mean "manufacturer" is the proxy defect that once
// put a machine-learning platform top of a manufacturer list, and an empty
// array here is the honest answer rather than a near-enough flag.
const DIRECTORY_ACCEPTS = {
  'b2b-saas': ['saas'], 'ai-startup': ['ai', 'startup'], 'telecom-voip-ucaas': [],
  manufacturer: [], ecommerce: ['ecommerce'], startup: ['startup'],
  'local-business': ['localBusiness'], 'hr-recruitment': [], cybersecurity: [],
  'finance-fintech': [], 'energy-cleantech': [], 'agtech-food': [],
  'hospitality-travel': [], healthcare: [], legal: [],
  'marketing-agency': ['agency'], 'professional-services': ['agency', 'freelancer'],
};

// Which marketplace TYPES can carry which kind of business. The first version
// scored marketplace fit from sellerTypes alone — business or private — so
// every business-accepting marketplace fitted every business equally, and a
// telecom software company was offered a wholesale homeware marketplace at 88.
// Seller type says WHO may list; it says nothing about WHAT.
//
// An empty array means the collection holds no marketplace type that carries
// this business, which is an honest answer and produces no marketplace lane.
// The marketplace collection's `b2b` type means B2B GOODS trading — Faire,
// Alibaba, 1688. Its vocabulary cannot distinguish that from B2B services or
// software, and it does not need to: nobody lists enterprise telephony on a
// wholesale marketplace. So the software-shaped profiles declare [], the
// collection contributes no marketplace lane for them, and the planner says so
// rather than offering a homeware wholesaler to a UCaaS vendor at 88.
//
// This is a limitation of the source vocabulary recorded honestly, not a
// ranking hack: no platform is named, and widening the vocabulary later would
// change the answer automatically.
const MARKETPLACE_TYPES_FOR = {
  'b2b-saas': [],
  'ai-startup': [],
  'telecom-voip-ucaas': [],
  cybersecurity: [],
  startup: [],
  manufacturer: ['b2b'],
  ecommerce: ['b2b', 'general-classifieds', 'fashion-resale', 'second-hand', 'auctions'],
  'local-business': ['services', 'general-classifieds'],
  'hr-recruitment': ['jobs', 'services'],
  'finance-fintech': ['services'],
  'energy-cleantech': ['b2b'],
  'agtech-food': ['b2b'],
  'hospitality-travel': ['services', 'property'],
  healthcare: ['services'],
  legal: ['services'],
  'marketing-agency': ['services'],
  'professional-services': ['services'],
};

const BUDGETS = [
  { key: 'free-only', label: 'Free only', accepts: ['free'] },
  { key: 'free-freemium', label: 'Free or freemium', accepts: ['free', 'freemium'] },
  { key: 'paid-allowed', label: 'Paid allowed', accepts: ['free', 'freemium', 'mixed', 'paid'] },
  { key: 'any', label: 'Any, including unknown cost', accepts: null },
];
const BUDGET_BY_KEY = new Map(BUDGETS.map((b) => [b.key, b]));

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

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
      category: r.category, accepts: r.accepts || {}, priority: r.priority,
      note: r.description || '', limitations: r.notRecommendedFor || null,
    });
  }
  for (const r of marketplaces) {
    const q = marketplaceQuality(r);
    out.push({
      sourceCollection: 'marketplaces', platformId: r.id, name: r.name, website: r.website,
      country: r.country, audienceGeography: null,
      actionType: r.marketplaceType === 'b2b' ? 'create-seller-profile'
        : r.marketplaceType === 'general-classifieds' ? 'publish-classified' : 'post-advertisement',
      // The marketplace collection records no per-platform submission URL, so
      // the projection carries none. It does not invent one from the website.
      actionUrl: null,
      cost: r.costModel, nativeQuality: q.value, nativeSignal: q.signal,
      evidence: r.currentStatus === 'unknown' ? 'needs-browser-check' : 'reachable',
      marketplaceType: r.marketplaceType, alsoCovers: r.alsoCovers || [],
      sellerTypes: r.sellerTypes, priority: null,
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

// ── fit ─────────────────────────────────────────────────────────────────────

function businessFit(op, profileKey) {
  const profile = REC.PROFILE_BY_KEY.get(profileKey);
  if (!profile) throw new Error(`Unknown business profile: ${profileKey}`);
  if (op.sourceCollection === 'media') {
    const bf = REC.businessFit(op.record, profile);
    return { value: bf.value, reason: bf.reason };
  }
  if (op.sourceCollection === 'directories') {
    const flags = DIRECTORY_ACCEPTS[profileKey] || [];
    const accepted = flags.filter((f) => op.accepts[f] === true);
    if (accepted.length) {
      return { value: REC.FIT_CATEGORY, reason: `explicitly accepts ${accepted.join(', ')} businesses` };
    }
    if (flags.some((f) => op.accepts[f] === false)) {
      return { value: 0, reason: 'explicitly does not accept this kind of business', excluded: true };
    }
    if (op.category === 'local-business') {
      return { value: REC.FIT_ADJACENT, reason: 'a general local-business directory' };
    }
    return { value: REC.FIT_GENERAL, reason: 'a general directory with no stated business-type rule' };
  }
  // Marketplaces: WHO may list, and WHAT the marketplace carries. Both must
  // hold — a vehicles classifieds site accepting business sellers is still not
  // a place to list enterprise software.
  if (op.sellerTypes === 'private') {
    return { value: 0, reason: 'accepts private sellers only, not companies', excluded: true };
  }
  const fitting = MARKETPLACE_TYPES_FOR[profileKey] || [];
  const types = [op.marketplaceType, ...(op.alsoCovers || [])];
  if (!fitting.length) {
    return { value: 0, excluded: true,
      reason: 'this collection holds no marketplace type that carries this kind of business' };
  }
  if (!fitting.some((t) => types.includes(t))) {
    return { value: 0, excluded: true,
      reason: `carries ${op.marketplaceType.replace(/-/g, ' ')} listings, which is not what this business sells` };
  }
  const strength = op.sellerTypes === 'business' ? REC.FIT_CATEGORY : REC.FIT_ADJACENT;
  return { value: strength,
    reason: `carries ${op.marketplaceType.replace(/-/g, ' ')} listings and accepts ${op.sellerTypes === 'business' ? 'business' : 'business and private'} sellers` };
}

function objectiveFit(op, objectiveKey) {
  const objective = OBJECTIVE_BY_KEY.get(objectiveKey);
  if (!objective) throw new Error(`Unknown objective: ${objectiveKey}`);
  if (!objective.collections.includes(op.sourceCollection)) {
    const c = COLLECTION_BY_KEY.get(op.sourceCollection);
    return { value: 0, excluded: true,
      reason: `${c.label} cannot deliver ${objective.label.toLowerCase()}` };
  }
  if (op.sourceCollection === 'media') {
    const mediaKey = MEDIA_OBJECTIVE[objectiveKey];
    if (!mediaKey) return { value: 0, excluded: true, reason: 'not a media objective' };
    const of = REC.objectiveFit(op.record, REC.OBJECTIVE_BY_KEY.get(mediaKey));
    return { value: of.value, reason: of.reason, excluded: of.excluded };
  }
  if (op.sourceCollection === 'directories') {
    // A directory delivers a citation and a profile. It does not deliver
    // coverage, and the objective list above already refuses those.
    const V = { 'seo-citations': 96, 'local-discovery': 92, 'b2b-buyer-discovery': 76,
      'referral-traffic': 68, 'lead-generation': 64, 'brand-authority': 52 };
    let v = V[objectiveKey];
    if (typeof v !== 'number') return { value: 0, excluded: true, reason: 'not a directory objective' };
    // A general local-business directory is excellent for local discovery and
    // weak for reaching B2B buyers. Without this the German phone books
    // outranked a specialist manufacturing publication for buyer discovery,
    // because every directory scored the same 76 whatever it was a directory OF.
    if (op.category === 'local-business'
      && ['b2b-buyer-discovery', 'brand-authority'].includes(objectiveKey)) {
      v = Math.round(v * 0.45);
      return { value: v, reason: 'a general local directory, which reaches consumers rather than B2B buyers' };
    }
    if (op.actionType === 'investigate') {
      return { value: Math.round(v * 0.55), reason: 'the listing route is not established, so this is a lead rather than a task' };
    }
    return { value: v, reason: `${ACTION_TYPES[op.actionType].label.toLowerCase()} serves ${objective.label.toLowerCase()}` };
  }
  const V = { 'marketplace-exposure': 96, 'classified-advertising': 94, 'lead-generation': 82,
    'local-discovery': 78, 'referral-traffic': 70, 'product-launch': 58, 'b2b-buyer-discovery': 66 };
  const v = V[objectiveKey];
  if (typeof v !== 'number') return { value: 0, excluded: true, reason: 'not a marketplace objective' };
  return { value: v, reason: `${ACTION_TYPES[op.actionType].label.toLowerCase()} serves ${objective.label.toLowerCase()}` };
}

function geographyFit(op, market) {
  if (!market || market === '*') return { value: 70, reason: 'no market filter applied' };
  if (op.country === market) return { value: 100, reason: 'published in the target market' };
  if (op.country === 'global') return { value: 82, reason: 'a global platform' };
  if (op.audienceGeography === 'global') return { value: 78, reason: 'global audience reaches the target market' };
  if (op.audienceGeography === 'regional') return { value: 44, reason: 'regional audience may not reach the target market' };
  return { value: 16, reason: 'serves a different market' };
}

function costFit(op, budgetKey) {
  const budget = BUDGET_BY_KEY.get(budgetKey) || BUDGET_BY_KEY.get('any');
  if (!budget.accepts) return { ok: true, reason: `cost: ${op.cost}` };
  if (op.cost === 'unknown') {
    // Unknown cost is not a refusal. Under a free-only budget it is a caveat,
    // priced as uncertainty rather than excluded — the employee is told.
    return { ok: true, uncertain: true, reason: 'cost not established; confirm before committing' };
  }
  if (budget.accepts.includes(op.cost)) return { ok: true, reason: `cost: ${op.cost}` };
  return { ok: false, reason: `costs ${op.cost}, outside the ${budget.label.toLowerCase()} budget` };
}

// ── planner score ───────────────────────────────────────────────────────────
// Fit first, native quality second. Documented and deterministic, and it never
// pretends the three native qualities are the same measurement — quality only
// scales a result that already fits.
const UNRATED_QUALITY = 52;
const UNRATED_DISCOUNT = 0.78;

function scoreOpportunity(op, { business, objective, market = '*', budget = 'any' }) {
  const bf = businessFit(op, business);
  const of = objectiveFit(op, objective);
  const gf = geographyFit(op, market);
  const cf = costFit(op, budget);

  const exclusions = [];
  if (bf.excluded) exclusions.push(bf.reason);
  if (of.excluded) exclusions.push(of.reason);
  if (!cf.ok) exclusions.push(cf.reason);
  if (op.evidence === 'dead') exclusions.push('the platform is no longer operating');
  if (exclusions.length) {
    return { score: 0, excluded: true, reasons: exclusions, businessFit: bf, objectiveFit: of,
      geographyFit: gf, costFit: cf };
  }

  const fit = (bf.value * 0.40) + (of.value * 0.35) + (gf.value * 0.25);
  const quality = op.nativeQuality === null ? UNRATED_QUALITY * UNRATED_DISCOUNT : op.nativeQuality;
  let score = (fit / 100) * quality * 1.2;
  if (op.actionUrl) score += 4;                   // a route you can click today
  if (op.evidence === 'needs-browser-check') score -= 6;
  if (cf.uncertain) score -= 4;

  const reasons = [bf.reason, of.reason, gf.reason, cf.reason, op.nativeSignal];
  if (!op.actionUrl) reasons.push('no action URL is recorded in the source collection');
  if (op.evidence === 'needs-browser-check') reasons.push('behind a bot filter — confirm in a browser');
  return { score: clamp(score), excluded: false, reasons, businessFit: bf, objectiveFit: of,
    geographyFit: gf, costFit: cf };
}

// ── the plan ────────────────────────────────────────────────────────────────
// Groups are derived from canonical facts, never from a curated name list.
const GROUPS = [
  { key: 'quick-wins', label: 'Quick wins',
    blurb: 'High fit, low friction: a route you can act on today, at no cost, with no editor in the way.',
    test: (op, s) => s.score >= 55 && op.actionUrl && ['free', 'freemium'].includes(op.cost)
      && op.actionType !== 'investigate'
      && !['pitch-editor', 'contribute-article', 'submit-news', 'enter-award'].includes(op.actionType) },
  { key: 'authority-plays', label: 'Authority plays',
    blurb: 'Selective opportunities where an editor decides. Slower and worth more when they land.',
    test: (op, s) => s.score >= 50
      && ['pitch-editor', 'contribute-article', 'submit-news', 'enter-award'].includes(op.actionType) },
  { key: 'local-coverage', label: 'Local and market coverage',
    blurb: 'Surfaces that make a company findable in the target market.',
    test: (op, s, ctx) => s.score >= 45 && ctx.market !== '*' && op.country === ctx.market },
  { key: 'marketplace-listings', label: 'Marketplace and classified listings',
    blurb: 'Direct listing and advertising surfaces. A listing is not editorial coverage.',
    test: (op, s) => s.score >= 45 && op.sourceCollection === 'marketplaces' },
  { key: 'paid-placement', label: 'Paid placement',
    blurb: 'Commercial placement. Useful, and clearly labelled as bought rather than earned.',
    test: (op, s) => s.score >= 45 && (op.cost === 'paid' || op.actionType === 'sponsor-placement') },
  { key: 'longer-term', label: 'Longer term and unverified',
    blurb: 'Worth pursuing, but the route needs establishing first or the platform needs a browser check.',
    test: (op, s) => s.score >= 35 && (op.actionType === 'investigate' || !op.actionUrl
      || op.evidence === 'needs-browser-check') },
];

function plan(opportunities, ctx, { perLane = 25, perGroup = 8 } = {}) {
  const scored = opportunities
    .map((op) => ({ op, s: scoreOpportunity(op, ctx) }))
    .filter((x) => !x.s.excluded && x.s.score > 0)
    .sort((a, b) => b.s.score - a.s.score
      || S.compareStable(a.op.name, b.op.name)
      || S.compareStable(a.op.platformId, b.op.platformId));

  const lanes = COLLECTIONS.map((c) => ({
    collection: c,
    results: scored.filter((x) => x.op.sourceCollection === c.key).slice(0, perLane),
    total: scored.filter((x) => x.op.sourceCollection === c.key).length,
  }));

  // An opportunity lands in the FIRST group whose test it satisfies, so a plan
  // is a sequence of actions rather than the same platform repeated six times.
  const used = new Set();
  const groups = [];
  for (const g of GROUPS) {
    const picks = [];
    for (const x of scored) {
      if (used.has(x.op.platformId)) continue;
      if (!g.test(x.op, x.s, ctx)) continue;
      picks.push(x);
      used.add(x.op.platformId);
      if (picks.length >= perGroup) break;
    }
    if (picks.length) groups.push({ ...g, picks });
  }
  return { lanes, groups, totalScored: scored.length };
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

module.exports = {
  PLANNER_PATH, COLLECTIONS, COLLECTION_BY_KEY, ACTION_TYPES, OBJECTIVES, OBJECTIVE_BY_KEY, BUDGETS,
  BUDGET_BY_KEY, GROUPS, MEDIA_OBJECTIVE, DIRECTORY_ACCEPTS,
  UNRATED_QUALITY, UNRATED_DISCOUNT,
  project, loadAll, plan, scoreOpportunity, businessFit, objectiveFit, geographyFit, costFit,
  directoryAction, mediaAction, directoryQuality, marketplaceQuality,
  ACCEPTS_KEYS: BD.ACCEPTS_KEYS,
};
