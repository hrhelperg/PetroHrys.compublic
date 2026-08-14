'use strict';

// Media Recommendations v1.
//
// Media Score answers "how good is this opportunity?" and is the same number
// whoever is asking. This file answers the different question: "should THIS
// business, pursuing THIS objective, in THIS market, use it?" UC Today is an
// excellent publication for a UCaaS vendor and close to useless for a jeweller,
// and only one of those two facts belongs in the intrinsic score.
//
// ── WHERE THE MODEL LIVES ───────────────────────────────────────────────────
//
// The profiles, the campaign objectives and the two fits that consume them moved
// to dp-engine.cjs and are re-exported below. They had to: the Distribution
// Planner scores its media lane with this exact engine, and the planner now
// recomputes in the browser, so the model has to be in the one module that is
// pure, requires nothing and is shipped to the client verbatim. Keeping a copy
// here would mean the /for/ recommendation pages and the planner could rank the
// same publication differently for the same business.
//
// The rule that shapes the model travelled with it: a profile may NEVER name a
// platform. The moment a profile can say telecomPlatforms: ['UC Today'] it stops
// being a model and becomes a curated list wearing a model's clothes, and the
// engine stops being reproducible. A test asserts the declarations contain no
// platform id, name or host from the dataset — it now reads dp-engine.cjs.
//
// What stays here is what only the recommendation PAGES need: the media
// geography fit, the level bands, exclusion, and the two entry points that
// combine all of it with the Media Score.

const S = require('./media-schema.cjs');
const MI = require('./media-intelligence.cjs');
const E = require('./dp-engine.cjs');

// ── the model, bound from the shared engine ─────────────────────────────────
// One implementation, re-exported under the names this module has always used.
const {
  MEDIA_OBJECTIVES: OBJECTIVES, MEDIA_OBJECTIVE_BY_KEY: OBJECTIVE_BY_KEY,
  MEDIA_PROFILES: PROFILES, MEDIA_PROFILE_BY_KEY: PROFILE_BY_KEY,
  mediaBusinessFit: businessFit, mediaObjectiveFit: objectiveFit,
  FIT_CATEGORY, FIT_INDUSTRY, FIT_ADJACENT, FIT_KEYWORD, FIT_GENERAL, FIT_NONE,
} = E;

// A platform with no Media Score still deserves a recommendation, discounted,
// because "we could not score it" is a statement about our research and not
// about the platform. The discount keeps it below an equally-fitting scored one.
const UNSCORED_QUALITY = 55;
const UNSCORED_DISCOUNT = 0.75;

const LEVELS = [
  { min: 85, label: 'Priority' },
  { min: 70, label: 'Strong' },
  { min: 55, label: 'Useful' },
  { min: 40, label: 'Marginal' },
  { min: 0, label: 'Low fit' },
];
const levelFor = (n) => LEVELS.find((l) => n >= l.min).label;

// '*' means "no market requested" — everything is eligible and nothing is boosted.
function geographyFit(r, market) {
  if (!market || market === '*') return { value: 70, reason: 'no market filter applied' };
  if (r.country === market) return { value: 100, reason: `published in the target market` };
  if (r.audienceGeography === 'global') return { value: 78, reason: 'global audience reaches the target market' };
  if (r.audienceGeography === 'regional') return { value: 46, reason: 'regional audience may not reach the target market' };
  return { value: 18, reason: 'published for a different market' };
}

// ── exclusions (PART 16) ────────────────────────────────────────────────────
// Explicit negative evidence disqualifies. Absence of evidence does not.
function exclusionFor(r, profile, objective) {
  if (['shutting-down', 'dormant', 'redirected'].includes(r.currentStatus)) {
    return 'the platform is no longer operating';
  }
  if (r.priority === 'reject') return 'the platform was rejected on quality grounds';
  const of = objectiveFit(r, objective);
  if (of.excluded) return of.reason;
  return null;
}

function recommend(record, profileKey, { objective: objectiveKey = 'brand-awareness', market = '*' } = {}) {
  const profile = PROFILE_BY_KEY.get(profileKey);
  if (!profile) throw new Error(`Unknown business profile: ${profileKey}`);
  const objective = OBJECTIVE_BY_KEY.get(objectiveKey);
  if (!objective) throw new Error(`Unknown objective: ${objectiveKey}`);

  const excluded = exclusionFor(record, profile, objective);
  if (excluded) {
    return { score: 0, level: 'Excluded', excluded: true, reasons: [excluded],
      businessFit: null, objectiveFit: null, geographyFit: null, mediaScore: null };
  }

  const bf = businessFit(record, profile);
  const of = objectiveFit(record, objective);
  const gf = geographyFit(record, market);

  // Documented formula. A weighted blend rather than a product: multiplying
  // three sub-100 fractions drives almost everything to single digits and the
  // ranking stops discriminating at the top, which is the pathology PART 14
  // warns about. The blend keeps the range usable and still lets any one weak
  // fit pull a result down hard.
  const fit = (bf.value * 0.45) + (of.value * 0.35) + (gf.value * 0.20);
  const ms = MI.mediaScore(record);
  const quality = ms.score === null ? UNSCORED_QUALITY * UNSCORED_DISCOUNT : ms.score;
  const score = Math.max(0, Math.min(100, Math.round((fit / 100) * quality * 1.18)));

  const reasons = [bf.reason, of.reason, gf.reason];
  if (ms.score === null) reasons.push('not yet scored, so this recommendation is discounted');
  else reasons.push(`Media Score ${ms.score} (${ms.band})`);
  if (record.currentStatus === 'unknown') reasons.push('behind a bot filter — confirm the route in a browser');
  if (MI.routeVerified(record)) reasons.push('a submission route was reached and recorded');

  return { score, level: levelFor(score), excluded: false, reasons,
    businessFit: bf, objectiveFit: of, geographyFit: gf, mediaScore: ms.score, mediaBand: ms.band };
}

// A result "qualifies" for a profile when the platform is linked to that kind of
// business by something specific — its category, its industry, an adjacent
// category or its own prose. A general business publication scoring Useful is a
// real recommendation, but a PAGE built entirely of them has nothing specific to
// say: the first legal page ranked six general business titles, because every
// specialist legal publication in the registry still has an unresearched route
// and therefore scored below them. Suppressing that page is more honest than
// publishing it, and the suppression is reported rather than hidden.
function qualifiesForProfile(rec) {
  return !rec.excluded && rec.businessFit !== null && rec.businessFit.value >= FIT_KEYWORD;
}

// One engine, used by the pages and by anything else that ranks.
function rankFor(rows, profileKey, { objective = 'brand-awareness', market = '*', limit = 25,
  minLevel = 'Marginal' } = {}) {
  const floor = LEVELS.find((l) => l.label === minLevel);
  const min = floor ? floor.min : 0;
  return rows
    .map((record) => ({ record, recommendation: recommend(record, profileKey, { objective, market }) }))
    .filter((x) => !x.recommendation.excluded && x.recommendation.score >= min)
    .sort((a, b) => b.recommendation.score - a.recommendation.score
      || S.compareStable(a.record.name, b.record.name)
      || S.compareStable(a.record.id, b.record.id))
    .slice(0, limit);
}

module.exports = {
  PROFILES, PROFILE_BY_KEY, OBJECTIVES, OBJECTIVE_BY_KEY, LEVELS,
  FIT_CATEGORY, FIT_INDUSTRY, FIT_ADJACENT, FIT_KEYWORD, FIT_GENERAL, FIT_NONE,
  UNSCORED_QUALITY, UNSCORED_DISCOUNT,
  recommend, rankFor, levelFor, qualifiesForProfile, businessFit, objectiveFit, geographyFit, exclusionFor,
};
