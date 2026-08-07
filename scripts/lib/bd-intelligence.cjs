'use strict';

// Directory Intelligence v2.
//
// The working list answers "where can I publish?". This layer answers "is this
// platform worth it for THIS business, and why?" — in a form an employee can
// read in seconds.
//
// THREE RULES SHAPED EVERY DECISION HERE.
//
// 1. REUSE BEFORE ADDING. The registry already carries most of what a buying
//    decision needs: `accepts` is twelve business-fit flags, `backlinkType` is
//    the follow/nofollow axis, `verificationMethods` is the verification axis,
//    `submissionModel` is cost, `audienceGeography` is reach. Restating any of
//    those here would create two sources of truth that drift. The `intelligence`
//    object below adds ONLY the ten attributes none of them can express.
//
// 2. THE SCORE IS COMPUTED, NEVER STORED. A stored score is a derived value that
//    can disagree with its inputs the moment one changes. Every score in this
//    module is a pure function of facts already on the record, recomputed on
//    each build. That also means adding scoring rewrites no record — there is
//    nothing to write.
//
// 3. THIS IS NOT THE PetroHrys SCORE. That score is ten factors judged 0-10 by a
//    human against no rubric, and its own method note says two reviewers could
//    reach different numbers. It is an editorial opinion and must stay one. The
//    Directory Score is the opposite: a documented function of observable facts,
//    reproducible by anyone with the same record. The two never mix, and a
//    record can carry either, both or neither.
//
// MISSING EVIDENCE PRODUCES null, NEVER A DEFAULT. A platform that was never
// inspected must not score the same as one inspected and found wanting.

const S = require('./bd-schema.cjs');

// --- Class A: verified facts, from official documentation -------------------
// Each is something an operator states in writing. Never inferred from
// behaviour, never assumed from a platform's size or reputation.

// How far a listing can travel. `global` accepts businesses anywhere; `regional`
// serves a bloc or continent; `single` accepts one country only.
const COUNTRY_REACH = ['global', 'regional', 'single'];

// What happens after submit. `instant` publishes without human review; `manual`
// holds for review; `mixed` publishes some tiers instantly and reviews others.
const APPROVAL_MODES = ['instant', 'manual', 'mixed'];

// --- Class B: observable facts, from public behaviour -----------------------
// Established by looking at the live site, not by reading its marketing.

const CLASS_A_KEYS = ['hasApi', 'bulkSubmission', 'multipleLocations',
  'franchiseSupport', 'languages', 'countryReach', 'approvalMode'];
const CLASS_B_KEYS = ['profileIndexed', 'profileUrlPattern', 'ranksByCompanyName'];

const BOOLEAN_KEYS = ['hasApi', 'bulkSubmission', 'multipleLocations',
  'franchiseSupport', 'profileIndexed', 'ranksByCompanyName'];

const INTELLIGENCE_KEYS = [...CLASS_A_KEYS, ...CLASS_B_KEYS];

const EVIDENCE_CLASS = Object.fromEntries([
  ...CLASS_A_KEYS.map((k) => [k, 'A']),
  ...CLASS_B_KEYS.map((k) => [k, 'B']),
]);

const LABELS = {
  hasApi: 'Submission API',
  bulkSubmission: 'Bulk submission',
  multipleLocations: 'Multiple locations',
  franchiseSupport: 'Franchise support',
  languages: 'Listing languages',
  countryReach: 'Country reach',
  approvalMode: 'Approval mode',
  profileIndexed: 'Profile pages indexed',
  profileUrlPattern: 'Profile URL pattern',
  ranksByCompanyName: 'Ranks for company name',
};

// ISO 639-1. Two lowercase letters, nothing else — a language field that accepts
// "English" and "en" and "en-GB" cannot be filtered on.
const LANG_RE = /^[a-z]{2}$/;

function problemsFor(intel, id = '(unnamed)') {
  const p = [];
  const at = (f, m) => p.push([`${id} intelligence.${f}`, m]);
  if (intel === null || intel === undefined) return p;
  if (typeof intel !== 'object' || Array.isArray(intel)) {
    p.push([`${id} intelligence`, 'must be an object or null.']);
    return p;
  }
  for (const key of Object.keys(intel)) {
    if (!INTELLIGENCE_KEYS.includes(key)) at(key, 'is not a declared intelligence attribute.');
  }
  for (const key of BOOLEAN_KEYS) {
    const v = intel[key];
    if (v !== undefined && v !== null && typeof v !== 'boolean') at(key, 'must be true, false or null.');
  }
  if (intel.countryReach != null && !COUNTRY_REACH.includes(intel.countryReach)) {
    at('countryReach', `must be one of ${COUNTRY_REACH.join(', ')}.`);
  }
  if (intel.approvalMode != null && !APPROVAL_MODES.includes(intel.approvalMode)) {
    at('approvalMode', `must be one of ${APPROVAL_MODES.join(', ')}.`);
  }
  if (intel.languages != null) {
    if (!Array.isArray(intel.languages) || intel.languages.length === 0) {
      at('languages', 'must be a non-empty array of ISO 639-1 codes, or null.');
    } else {
      for (const l of intel.languages) {
        if (typeof l !== 'string' || !LANG_RE.test(l)) at('languages', `"${l}" is not an ISO 639-1 code.`);
      }
      const sorted = [...intel.languages].sort();
      if (sorted.join(',') !== intel.languages.join(',')) at('languages', 'must be sorted, for a deterministic render.');
      if (new Set(intel.languages).size !== intel.languages.length) at('languages', 'contains a duplicate.');
    }
  }
  if (intel.profileUrlPattern != null) {
    if (typeof intel.profileUrlPattern !== 'string' || !intel.profileUrlPattern.trim()) {
      at('profileUrlPattern', 'must be a non-empty string, or null.');
    } else if (!/^https:\/\//.test(intel.profileUrlPattern)) {
      at('profileUrlPattern', 'must be an https URL pattern, so it can be checked against a live profile.');
    }
  }
  return p;
}

// Normalises to the in-memory shape. Absence stays absent: an object of ten
// nulls is not the same as "never assessed", and the projection must be able to
// drop the field entirely.
function normalise(intel) {
  if (!intel || typeof intel !== 'object' || Array.isArray(intel)) return null;
  const out = {};
  for (const key of INTELLIGENCE_KEYS) {
    if (intel[key] !== undefined && intel[key] !== null) {
      out[key] = Array.isArray(intel[key]) ? intel[key].slice() : intel[key];
    }
  }
  return Object.keys(out).length ? out : null;
}

// ============================================================================
// DIRECTORY SCORE
// ============================================================================
//
// Six dimensions, each 0-100, each a documented function of stated inputs.
// A dimension returns null when its evidence is absent — it never falls back to
// a midpoint, because "unknown" and "average" are different claims.
//
// Every dimension below states: what it measures, what it reads, and what it
// cannot see. The last part matters most: a score that hides its blind spots
// invites more confidence than it has earned.

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

// --- SEO value --------------------------------------------------------------
// MEASURES: whether a listing here can be found through search at all.
// READS: backlinkType, intelligence.profileIndexed, intelligence.ranksByCompanyName.
// CANNOT SEE: actual ranking positions, or whether the platform's authority
//   transfers to the linked site. Domain Rating is deliberately NOT an input —
//   most rows have none, and reading its absence as weakness would score an
//   unmeasured platform below a measured one for no reason.
// WEIGHTED, not averaged, and no component may reach 100 on its own. An earlier
// version averaged three components where two were booleans mapped to 0 or 100 —
// so any platform that was indexed and ranked scored exactly 100, and eighteen
// very different platforms all came out "strong". A dimension that cannot
// separate its inputs is decoration, not information.
//
// The link type carries the most weight because it is the actual SEO question.
// Being indexed is necessary but not sufficient, so it tops out at 70 alone;
// ranking for the company name tops out at 85. Only a dofollow link on an
// indexed, name-ranking profile approaches 100.
const SEO_WEIGHTS = { backlinkType: 55, profileIndexed: 30, ranksByCompanyName: 15 };

function seoValue(r) {
  const intel = r.intelligence || {};
  const parts = [];
  if (r.backlinkType) {
    const v = { dofollow: 100, mixed: 60, sponsored: 40, ugc: 30, nofollow: 25, none: 0 }[r.backlinkType];
    if (typeof v === 'number') parts.push([v, SEO_WEIGHTS.backlinkType]);
  }
  if (typeof intel.profileIndexed === 'boolean') {
    parts.push([intel.profileIndexed ? 70 : 0, SEO_WEIGHTS.profileIndexed]);
  }
  if (typeof intel.ranksByCompanyName === 'boolean') {
    parts.push([intel.ranksByCompanyName ? 85 : 35, SEO_WEIGHTS.ranksByCompanyName]);
  }
  if (!parts.length) return null;
  const weight = parts.reduce((s, [, w]) => s + w, 0);
  return clamp(parts.reduce((s, [v, w]) => s + v * w, 0) / weight);
}

// --- Trust ------------------------------------------------------------------
// MEASURES: how hard it is to publish something untrue here, which is what makes
//   a listing worth having rather than just present.
// READS: verificationMethods (count, capped at three), listingQuality.
// CANNOT SEE: whether verification is enforced in practice.
function trust(r) {
  const methods = Array.isArray(r.verificationMethods) ? r.verificationMethods.length : null;
  const parts = [];
  if (methods !== null) parts.push(clamp(Math.min(methods, 3) / 3 * 100));
  if (r.listingQuality) parts.push({ high: 100, mixed: 55, low: 15 }[r.listingQuality] ?? null);
  const known = parts.filter((n) => typeof n === 'number');
  if (!known.length) return null;
  return clamp(known.reduce((a, b) => a + b, 0) / known.length);
}

// --- Ease of approval -------------------------------------------------------
// MEASURES: how much work a submission costs, in employee time.
// READS: intelligence.approvalMode, submissionModel, submissionDifficulty.
// CANNOT SEE: queue length. A platform can approve instantly in policy and take
//   three weeks in fact; only the browser queue can settle that.
// NOTE the inversion: a HIGHER score means EASIER. A paid platform is not worse,
//   it is more work to get onto, and this dimension measures exactly that.
function easeOfApproval(r) {
  const intel = r.intelligence || {};
  const parts = [];
  if (intel.approvalMode) parts.push({ instant: 100, mixed: 60, manual: 35 }[intel.approvalMode] ?? null);
  if (r.submissionModel) {
    parts.push({ free: 100, freemium: 80, paid: 40, notApplicable: null, unknown: null }[r.submissionModel] ?? null);
  }
  if (r.submissionDifficulty) {
    parts.push({ 'very-easy': 100, easy: 80, moderate: 50, hard: 20 }[r.submissionDifficulty] ?? null);
  }
  const known = parts.filter((n) => typeof n === 'number');
  if (!known.length) return null;
  return clamp(known.reduce((a, b) => a + b, 0) / known.length);
}

// --- Stability --------------------------------------------------------------
// MEASURES: whether the listing will still be there in a year.
// READS: currentStatus, tier.
// CANNOT SEE: the operator's finances. tier1 platforms have shut down before.
function stability(r) {
  const parts = [];
  if (r.currentStatus) {
    const byStatus = { active: 100, unknown: null, dormant: 10, 'shutting-down': 0, redirected: 0 };
    const v = byStatus[r.currentStatus];
    if (typeof v === 'number') parts.push(v);
  }
  if (r.tier) parts.push({ tier1: 100, tier2: 70, tier3: 40 }[r.tier] ?? null);
  const known = parts.filter((n) => typeof n === 'number');
  if (!known.length) return null;
  return clamp(known.reduce((a, b) => a + b, 0) / known.length);
}

// --- Referral potential -----------------------------------------------------
// MEASURES: whether a human might actually arrive from the listing.
// READS: intelligence.profileIndexed, intelligence.countryReach, tier.
// CANNOT SEE: traffic. No traffic estimate is used anywhere in this programme,
//   and inventing one here would break that rule for a number nobody can check.
function referralPotential(r) {
  const intel = r.intelligence || {};
  const parts = [];
  if (typeof intel.profileIndexed === 'boolean') parts.push(intel.profileIndexed ? 90 : 30);
  if (intel.countryReach) parts.push({ global: 100, regional: 70, single: 55 }[intel.countryReach] ?? null);
  if (r.tier) parts.push({ tier1: 100, tier2: 65, tier3: 35 }[r.tier] ?? null);
  const known = parts.filter((n) => typeof n === 'number');
  if (!known.length) return null;
  return clamp(known.reduce((a, b) => a + b, 0) / known.length);
}

// --- Business value ---------------------------------------------------------
// MEASURES: how many kinds of business this platform is actually for. A
//   platform that accepts one narrow type is not worse — it is more specific,
//   and the fit filters express that. This dimension only says how broadly
//   applicable a listing is.
// READS: accepts (twelve tri-state flags), intelligence practical flags.
// CANNOT SEE: whether the accepted type is served WELL.
function businessValue(r) {
  const accepts = r.accepts && typeof r.accepts === 'object' ? r.accepts : null;
  if (!accepts) return null;
  const stated = S.ACCEPTS_KEYS.filter((k) => typeof accepts[k] === 'boolean');
  if (!stated.length) return null;
  const yes = stated.filter((k) => accepts[k] === true).length;
  // Breadth relative to what was ESTABLISHED, not to all twelve: a record with
  // three flags set and nine unknown must not be scored as 3/12.
  const breadth = yes / stated.length * 100;
  const intel = r.intelligence || {};
  const practical = ['multipleLocations', 'franchiseSupport', 'bulkSubmission']
    .filter((k) => intel[k] === true).length;
  return clamp(breadth * 0.8 + practical / 3 * 100 * 0.2);
}

const DIMENSIONS = [
  { key: 'seoValue', label: 'SEO value', weight: 30, compute: seoValue },
  { key: 'trust', label: 'Trust', weight: 20, compute: trust },
  { key: 'referralPotential', label: 'Referral potential', weight: 20, compute: referralPotential },
  { key: 'stability', label: 'Stability', weight: 15, compute: stability },
  { key: 'easeOfApproval', label: 'Ease of approval', weight: 10, compute: easeOfApproval },
  { key: 'businessValue', label: 'Business breadth', weight: 5, compute: businessValue },
];

const DIMENSION_WEIGHT_TOTAL = DIMENSIONS.reduce((s, d) => s + d.weight, 0);
if (DIMENSION_WEIGHT_TOTAL !== 100) {
  throw new Error(`Directory Score weights must total 100, got ${DIMENSION_WEIGHT_TOTAL}.`);
}

// A score built from one dimension out of six would be a number with the
// authority of a guess. Four is the documented floor, and it is a floor on
// WEIGHT as well as count: the two heaviest dimensions cannot both be missing.
const MIN_DIMENSIONS = 4;
const MIN_WEIGHT = 60;

// Reproducible from the record alone. Same record in, same number out, on any
// machine, forever — no host locale, no clock, no network.
function directoryScore(record) {
  const dimensions = {};
  let weighted = 0;
  let weightPresent = 0;
  let present = 0;
  for (const d of DIMENSIONS) {
    const v = d.compute(record);
    dimensions[d.key] = v;
    if (typeof v === 'number') {
      present += 1;
      weightPresent += d.weight;
      weighted += v * d.weight;
    }
  }
  const scored = present >= MIN_DIMENSIONS && weightPresent >= MIN_WEIGHT;
  return {
    dimensions,
    // Renormalised over the weight actually present, so a missing dimension
    // does not silently drag the total toward zero.
    overall: scored ? clamp(weighted / weightPresent) : null,
    dimensionsPresent: present,
    weightPresent,
    scored,
  };
}

// How complete a record's intelligence is, as a plain count. Used by the
// working list to show which rows are worth trusting a score from.
function coverage(record) {
  const intel = record.intelligence || {};
  const filled = INTELLIGENCE_KEYS.filter((k) => intel[k] !== undefined && intel[k] !== null).length;
  return { filled, total: INTELLIGENCE_KEYS.length };
}

// Bands exist so the page can say "strong" without implying the number is
// precise to the point. Deliberately coarse.
function band(score) {
  if (typeof score !== 'number') return null;
  if (score >= 80) return 'strong';
  if (score >= 60) return 'good';
  if (score >= 40) return 'moderate';
  return 'limited';
}

const BAND_LABELS = {
  strong: 'Strong', good: 'Good', moderate: 'Moderate', limited: 'Limited',
};

module.exports = {
  COUNTRY_REACH, APPROVAL_MODES, INTELLIGENCE_KEYS, CLASS_A_KEYS, CLASS_B_KEYS,
  BOOLEAN_KEYS, EVIDENCE_CLASS, LABELS,
  DIMENSIONS, DIMENSION_WEIGHT_TOTAL, MIN_DIMENSIONS, MIN_WEIGHT,
  problemsFor, normalise, directoryScore, coverage, band, BAND_LABELS,
  seoValue, trust, easeOfApproval, stability, referralPotential, businessValue,
};
