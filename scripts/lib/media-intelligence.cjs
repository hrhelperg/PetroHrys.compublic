'use strict';

// Media Intelligence v1 — a DERIVATION LAYER, not a second dataset.
//
// ── WHAT THE AUDIT FOUND (PART 2) ───────────────────────────────────────────
//
// The brief listed roughly twenty intelligence concepts. Auditing them against
// the existing media schema, every single one turned out to be either a fact
// the registry already holds or a value derivable from one:
//
//   REQUESTED CONCEPT          EXISTING CANONICAL FACT              NEW FIELD?
//   category                   categories                           no
//   market / geography         country + audienceGeography          no
//   language                   languages                            no
//   cost                       costModel                            no
//   status / stability         currentStatus + lastVerified         no
//   opportunity types          opportunityTypes                     no
//   submissionRouteVerified    submissionUrl/pitchUrl/pressRelease…  no — derived
//   requiresEditorialApproval  requiresEditorialApproval            no
//   requiresPitch / selfService opportunityTypes ∩ GATEKEPT/SELF_SERVE no — derived
//   sponsoredContentAvailable  sponsoredContentAvailable            no
//   publicProfileAvailable     publicProfileAvailable               no
//   industryRelevance          industries                           no
//   browserCheckRequired       currentStatus === 'unknown'          no — derived
//   editorialSelectivity       requiresEditorialApproval + types    no — derived
//   editorialCredibility       derived from the publishing model    no — derived
//   spamResistance             inverse of the open-submission model no — derived
//   audienceSpecificity        audienceGeography + categories       no — derived
//   searchVisibilityPotential  opportunity type + publicProfile…    no — derived
//   brandVisibilityPotential   opportunity type + audience reach    no — derived
//   referralPotential          opportunity type + audience reach    no — derived
//
// So this file adds ZERO stored fields and the migration rewrites ZERO records.
// That is not laziness; it is the point of PART 2. A parallel `mediaCategory`
// or `mediaCost` would be a second source of truth for a fact the registry
// already owns, and the two would drift the first time one was corrected.
//
// The genuinely new information this layer produces is the DERIVATION itself:
// a documented, reproducible reading of those facts into six dimensions and one
// score. Everything here is a pure function of a record. Nothing is stored.
//
// ── EVIDENCE CLASSES (PART 3) ───────────────────────────────────────────────
//
// Every dimension declares where its inputs come from. Class C is not a licence
// to invent: an editorial dimension is a documented rule applied to Class A or
// Class B inputs, and where those inputs are absent the dimension is null.

const S = require('./media-schema.cjs');

const EVIDENCE_CLASS = {
  VERIFIED: 'verified',      // A — the platform states it (a submission page, a rate card)
  OBSERVABLE: 'observable',  // B — established from public platform behaviour
  EDITORIAL: 'editorial',    // C — computed here from documented rules over A/B inputs
};

// ── the publishing model ────────────────────────────────────────────────────
// Derived, never stored. This is the single most informative thing about a
// platform and it falls straight out of the opportunity types: who decides what
// gets published, and therefore what a published item is worth.
const PUBLISHING_MODELS = ['staff-editorial', 'contributor-network', 'open-submission',
  'wire-carrier', 'marketplace', 'unknown'];

function publishingModel(r) {
  const t = new Set(r.opportunityTypes);
  if (t.has('unknown')) return 'unknown';
  // A wire carries what you send. Checked first because a wire may also sell
  // sponsorship, and the carrier model is what governs the value of the output.
  if (r.categories.includes('press-release-distribution')) return 'wire-carrier';
  // A matching or listing platform is not a publication at all.
  if (t.has('journalist-source') || t.has('expert-source') || t.has('podcast-guest')
    || t.has('company-profile') || t.has('award-entry')) {
    if (!t.has('contributed-article') && !t.has('editorial-pitch')
      && !t.has('editorial-submission')) return 'marketplace';
  }
  if (t.has('contributed-article') || t.has('guest-application')) return 'contributor-network';
  if (t.has('self-publish')) return 'open-submission';
  if (t.has('editorial-pitch') || t.has('editorial-submission')) return 'staff-editorial';
  if (t.has('press-release')) return 'wire-carrier';
  return 'unknown';
}

// Is there a route a person can actually click? Derived from the URL fields,
// which are themselves Class A: each was reachable and carried route language.
function routeVerified(r) {
  return Boolean(r.submissionUrl || r.pitchUrl || r.pressReleaseUrl);
}

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

// ── DIMENSION 1. Opportunity quality (weight 25) ────────────────────────────
// What you actually end up with. A signed article on a staff-edited publication
// is a different asset from a release on a wire, and flattening the two is the
// mistake this whole dataset exists to avoid. Values are the editorial reading
// of each opportunity type, highest available type wins.
const OPPORTUNITY_VALUE = {
  'contributed-article': 95,
  'editorial-submission': 88,
  'editorial-pitch': 85,
  'guest-application': 80,
  'expert-source': 74,
  'journalist-source': 72,
  'podcast-guest': 70,
  'award-entry': 66,
  'startup-launch': 64,
  'product-launch': 62,
  'newsletter-submission': 60,
  'company-profile': 46,
  'media-partnership': 46,
  'press-release': 40,
  'self-publish': 34,
  'sponsored-content': 30,
};
function opportunityQuality(r) {
  const vals = r.opportunityTypes.map((t) => OPPORTUNITY_VALUE[t]).filter((v) => typeof v === 'number');
  if (!vals.length) return null;
  // Best available route, with a small credit for having more than one, because
  // a platform offering two real routes gives an employee a fallback.
  const best = Math.max(...vals);
  return clamp(best + Math.min(vals.length - 1, 3) * 2);
}

// ── DIMENSION 2. Route certainty (weight 20) ────────────────────────────────
// How sure are we that an employee will find a way in? Class A/B throughout.
function routeCertainty(r) {
  if (r.opportunityTypes.includes('unknown')) return null;
  let v = 55;                            // a named route type, described in prose
  if (routeVerified(r)) v += 30;         // and a URL that was reached
  if (r.currentStatus === 'unknown') v -= 25; // but the page is behind a bot filter
  if (r.contactUrl) v += 5;
  return clamp(v);
}

// ── DIMENSION 3. Editorial standing (weight 20) ─────────────────────────────
// Does anybody decide? A gate is what makes publication mean something; an open
// dump means the archive carries no signal. Note the deliberate inversion of
// PART 7's warning: harder is not worse here, it is BETTER, and difficulty is
// priced separately in Accessibility.
const MODEL_STANDING = {
  'staff-editorial': 92,
  'contributor-network': 78,
  marketplace: 58,
  'wire-carrier': 34,
  'open-submission': 26,
};
function editorialStanding(r) {
  const model = publishingModel(r);
  if (model === 'unknown') return null;
  let v = MODEL_STANDING[model];
  if (typeof v !== 'number') return null;
  if (r.requiresEditorialApproval === true) v += 8;
  if (r.requiresEditorialApproval === false) v -= 10;
  return clamp(v);
}

// ── DIMENSION 4. Durable visibility (weight 15) ─────────────────────────────
// Does the result leave something at a stable public URL that a person or a
// search engine can find later? Deliberately NOT a traffic or Domain Rating
// estimate — this repository fabricates neither.
function durableVisibility(r) {
  const model = publishingModel(r);
  if (model === 'unknown') return null;
  const t = new Set(r.opportunityTypes);
  let v;
  if (t.has('contributed-article') || t.has('editorial-submission') || t.has('editorial-pitch')) v = 88;
  else if (t.has('company-profile') || t.has('award-entry')) v = 74;
  else if (t.has('startup-launch') || t.has('product-launch')) v = 70;
  else if (t.has('self-publish')) v = 62;
  else if (t.has('press-release')) v = 52;
  else if (t.has('podcast-guest')) v = 58;
  else if (t.has('expert-source') || t.has('journalist-source')) v = 40; // the article is elsewhere
  else if (t.has('sponsored-content')) v = 48;
  else if (t.has('newsletter-submission')) v = 30;                       // an email, rarely archived
  else return null;
  if (r.publicProfileAvailable === true) v += 8;
  if (r.publicProfileAvailable === false) v -= 12;
  return clamp(v);
}

// ── DIMENSION 5. Audience reach (weight 10) ─────────────────────────────────
// Class A: the platform's own statement of who it serves. Reach is not quality —
// a local trade title can be the right answer — so it carries a small weight.
const REACH = { global: 88, regional: 72, national: 64, local: 44 };
function audienceReach(r) {
  const v = REACH[r.audienceGeography];
  return typeof v === 'number' ? v : null;
}

// ── DIMENSION 6. Accessibility (weight 10) ──────────────────────────────────
// How much effort and money before anything happens. Small weight on purpose:
// The Harvard Business Review being hard to get into is not a defect.
function accessibility(r) {
  if (r.costModel === 'unknown') return null;
  const COST = { free: 90, freemium: 76, mixed: 62, paid: 44 };
  let v = COST[r.costModel];
  if (typeof v !== 'number') return null;
  if (routeVerified(r)) v += 6;
  if (r.requiresEditorialApproval === true) v -= 14;   // an editor may say no
  if (r.currentStatus === 'unknown') v -= 10;          // you may not even reach the form
  return clamp(v);
}

// ── the score ───────────────────────────────────────────────────────────────
const DIMENSIONS = [
  { key: 'opportunityQuality', label: 'Opportunity quality', weight: 25, evidence: EVIDENCE_CLASS.EDITORIAL, fn: opportunityQuality },
  { key: 'routeCertainty', label: 'Route certainty', weight: 20, evidence: EVIDENCE_CLASS.VERIFIED, fn: routeCertainty },
  { key: 'editorialStanding', label: 'Editorial standing', weight: 20, evidence: EVIDENCE_CLASS.OBSERVABLE, fn: editorialStanding },
  { key: 'durableVisibility', label: 'Durable visibility', weight: 15, evidence: EVIDENCE_CLASS.EDITORIAL, fn: durableVisibility },
  { key: 'audienceReach', label: 'Audience reach', weight: 10, evidence: EVIDENCE_CLASS.VERIFIED, fn: audienceReach },
  { key: 'accessibility', label: 'Accessibility', weight: 10, evidence: EVIDENCE_CLASS.VERIFIED, fn: accessibility },
];
const TOTAL_WEIGHT = DIMENSIONS.reduce((s, d) => s + d.weight, 0);

// The evidence floor (PART 9). Below it there is no score at all — not a low
// score. A platform we know almost nothing about must read "Not yet scored",
// because a 38 would be a claim about the platform when it is really a
// statement about our research.
const MIN_DIMENSIONS = 4;
const MIN_WEIGHT = 60;

const BANDS = [
  { min: 88, label: 'Exceptional' },
  { min: 78, label: 'Strong' },
  { min: 66, label: 'Good' },
  { min: 52, label: 'Moderate' },
  { min: 0, label: 'Limited' },
];
function band(score) {
  if (typeof score !== 'number') return null;
  return BANDS.find((b) => score >= b.min).label;
}

// Computed on every call, never stored. Returns null below the floor.
function mediaScore(r) {
  const parts = [];
  for (const d of DIMENSIONS) {
    const v = d.fn(r);
    if (typeof v === 'number') parts.push({ ...d, value: v });
  }
  const weight = parts.reduce((s, p) => s + p.weight, 0);
  if (parts.length < MIN_DIMENSIONS || weight < MIN_WEIGHT) {
    return { score: null, band: null, dimensions: parts, weightAvailable: weight,
      reason: `Below the evidence floor: ${parts.length} of ${DIMENSIONS.length} dimensions `
        + `and ${weight} of ${TOTAL_WEIGHT} weight available (need ${MIN_DIMENSIONS} and ${MIN_WEIGHT}).` };
  }
  // Renormalise across the dimensions that ARE available, so a platform is not
  // punished for a dimension nobody could establish.
  const score = clamp(parts.reduce((s, p) => s + p.value * p.weight, 0) / weight);
  return { score, band: band(score), dimensions: parts, weightAvailable: weight, reason: null };
}

// Coverage, all derived. Nothing here may be written down as a literal.
function coverage(rows) {
  const scored = rows.filter((r) => mediaScore(r).score !== null);
  return {
    total: rows.length,
    scored: scored.length,
    unscored: rows.length - scored.length,
    routeVerified: rows.filter(routeVerified).length,
    browserCheck: rows.filter((r) => r.currentStatus === 'unknown').length,
    withEstablishedType: rows.filter((r) => !r.opportunityTypes.includes('unknown')).length,
  };
}

module.exports = {
  EVIDENCE_CLASS, DIMENSIONS, TOTAL_WEIGHT, MIN_DIMENSIONS, MIN_WEIGHT, BANDS,
  OPPORTUNITY_VALUE, PUBLISHING_MODELS, MODEL_STANDING,
  publishingModel, routeVerified, mediaScore, band, coverage,
  // exported for tests, so a dimension cannot be silently rewired
  opportunityQuality, routeCertainty, editorialStanding, durableVisibility,
  audienceReach, accessibility,
  GATEKEPT: S.GATEKEPT_TYPES, SELF_SERVE: S.SELF_SERVE_TYPES,
};
