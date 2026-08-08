'use strict';

// Media Recommendations v1.
//
// Media Score answers "how good is this opportunity?" and is the same number
// whoever is asking. This file answers the different question: "should THIS
// business, pursuing THIS objective, in THIS market, use it?" UC Today is an
// excellent publication for a UCaaS vendor and close to useless for a jeweller,
// and only one of those two facts belongs in the intrinsic score.
//
// ── THE RULE THAT SHAPES THE FILE ───────────────────────────────────────────
//
// A profile may NEVER name a platform. The moment a profile can say
// telecomPlatforms: ['UC Today'] it stops being a model and becomes a curated
// list wearing a model's clothes, and the engine stops being reproducible. Every
// profile declares only abstract requirements — categories, industries,
// keywords, markets — and a test asserts the declarations contain no platform
// id, name or host from the dataset.
//
// A sibling engine in this repository learned two lessons the hard way and both
// are designed out here:
//
//   1. Proxying a business type through a flag that does not mean it. That
//      engine expressed "manufacturers" as accepts:['enterprise'] and put a
//      machine-learning platform top of the manufacturer list. Here a profile
//      that has no honest category signal declares an empty category list and
//      leans on industries and keywords instead — and a test asserts every
//      declared category and industry is real vocabulary.
//   2. Ambiguous keywords. "practitioner" matched a legal directory and put it
//      top of healthcare. Keywords here are checked for cross-profile collision.

const S = require('./media-schema.cjs');
const MI = require('./media-intelligence.cjs');

// ── campaign objectives (PART 12) ───────────────────────────────────────────
// An objective is a mapping from what you want to the opportunity types that
// actually deliver it. This is where the dataset's refusal to flatten
// opportunity types finally pays: a wire is excellent for distributing a
// release and irrelevant for founder exposure, and the engine can say so.
const OBJECTIVES = [
  { key: 'brand-awareness', label: 'Brand awareness', slug: 'brand-awareness',
    types: { 'editorial-pitch': 100, 'editorial-submission': 95, 'contributed-article': 90,
      'sponsored-content': 78, 'podcast-guest': 72, 'award-entry': 70, 'company-profile': 55,
      'press-release': 45, 'self-publish': 40 } },
  { key: 'product-launch', label: 'Product launch', slug: 'product-launch',
    types: { 'product-launch': 100, 'startup-launch': 92, 'press-release': 80,
      'editorial-pitch': 76, 'company-profile': 60, 'newsletter-submission': 58,
      'sponsored-content': 55, 'award-entry': 45 } },
  { key: 'founder-exposure', label: 'Founder exposure', slug: 'founder-exposure',
    types: { 'podcast-guest': 100, 'expert-source': 88, 'contributed-article': 86,
      'editorial-pitch': 80, 'journalist-source': 78, 'guest-application': 76,
      'award-entry': 50 } },
  { key: 'thought-leadership', label: 'Thought leadership', slug: 'thought-leadership',
    types: { 'contributed-article': 100, 'guest-application': 92, 'editorial-submission': 84,
      'expert-source': 76, 'podcast-guest': 70, 'self-publish': 52 } },
  { key: 'seo-visibility', label: 'Search visibility', slug: 'seo-visibility',
    // A durable indexed page with your name on it. A newsletter send is an
    // email; a podcast is audio. Neither is a page, and the score says so.
    types: { 'contributed-article': 100, 'editorial-submission': 92, 'self-publish': 82,
      'company-profile': 80, 'editorial-pitch': 78, 'award-entry': 70, 'press-release': 62,
      'product-launch': 60, 'sponsored-content': 58 } },
  { key: 'press-release-distribution', label: 'Press release distribution', slug: 'press-release-distribution',
    types: { 'press-release': 100, 'company-profile': 40, 'self-publish': 35 } },
  { key: 'lead-generation', label: 'Lead generation', slug: 'lead-generation',
    types: { 'sponsored-content': 92, 'newsletter-submission': 88, 'company-profile': 84,
      'product-launch': 76, 'contributed-article': 62, 'award-entry': 55 } },
  { key: 'expert-positioning', label: 'Expert positioning', slug: 'expert-positioning',
    types: { 'expert-source': 100, 'journalist-source': 96, 'contributed-article': 78,
      'podcast-guest': 70, 'guest-application': 66 } },
  { key: 'podcast-appearance', label: 'Podcast appearance', slug: 'podcast-appearance',
    types: { 'podcast-guest': 100, 'expert-source': 46 } },
  { key: 'newsletter-sponsorship', label: 'Newsletter sponsorship', slug: 'newsletter-sponsorship',
    types: { 'newsletter-submission': 96, 'sponsored-content': 92, 'media-partnership': 70 } },
  { key: 'contributed-content', label: 'Contributed content', slug: 'contributed-content',
    types: { 'contributed-article': 100, 'guest-application': 94, 'editorial-submission': 82,
      'self-publish': 58 } },
  { key: 'local-awareness', label: 'Local awareness', slug: 'local-awareness',
    types: { 'editorial-pitch': 96, 'press-release': 88, 'editorial-submission': 86,
      'company-profile': 70, 'contributed-article': 66, 'award-entry': 60 } },
];
const OBJECTIVE_BY_KEY = new Map(OBJECTIVES.map((o) => [o.key, o]));

// ── business profiles (PART 11) ─────────────────────────────────────────────
// categories  — publication kinds that serve this business, from the registry vocabulary
// industries  — sectors this business would be pitching ABOUT, from the registry vocabulary
// keywords    — words whose presence in a platform's own prose indicates fit
// markets     — where this kind of business usually needs coverage; '*' means anywhere
const PROFILES = [
  { key: 'b2b-saas', slug: 'b2b-saas', label: 'B2B SaaS',
    categories: ['saas-media'],
    adjacent: ['technology-media', 'startup-media', 'developer-open-source-media', 'marketing-media'],
    industries: ['saas', 'software', 'cloud', 'devops'],
    keywords: ['saas', 'b2b software', 'enterprise software', 'cloud software', 'product management'],
    markets: ['*'] },
  { key: 'ai-startup', slug: 'ai-startup', label: 'AI startup',
    categories: ['ai-media'],
    adjacent: ['technology-media', 'startup-media', 'developer-open-source-media'],
    industries: ['ai'],
    keywords: ['artificial intelligence', 'machine learning', 'generative ai', 'ai research'],
    markets: ['*'] },
  { key: 'telecom-voip-ucaas', slug: 'telecom-voip-ucaas', label: 'Telecom, VoIP & UCaaS',
    categories: ['telecom-media'],
    adjacent: ['technology-media'],
    industries: ['telecom'],
    keywords: ['telecom', 'voip', 'ucaas', 'ccaas', 'cpaas', 'unified communications',
      'contact centre', 'contact center', 'cloud telephony', 'business phone', 'esim', 'carrier'],
    markets: ['*'] },
  { key: 'manufacturer', slug: 'manufacturer', label: 'Manufacturer',
    categories: ['manufacturing-media', 'industrial-media'],
    adjacent: ['engineering-media', 'construction-media'],
    industries: ['manufacturing', 'industrial', 'hardware', 'engineering'],
    keywords: ['manufactur', 'machining', 'metalwork', 'assembly', 'industrial', 'factory',
      'packaging', 'additive manufacturing', 'automation'],
    markets: ['*'] },
  { key: 'ecommerce', slug: 'ecommerce', label: 'Ecommerce & retail',
    categories: ['ecommerce-retail-media'],
    adjacent: ['marketing-media'],
    industries: ['ecommerce', 'retail'],
    keywords: ['ecommerce', 'e-commerce', 'retail', 'merchant', 'dtc', 'online retail', 'commerce'],
    markets: ['*'] },
  { key: 'startup', slug: 'startup', label: 'Early-stage startup',
    categories: ['startup-media', 'startup-launch-platform'],
    adjacent: ['contributor-platform', 'technology-media'],
    industries: ['saas', 'software'],
    keywords: ['startup', 'founder', 'seed', 'venture capital', 'early-stage', 'launch'],
    markets: ['*'] },
  { key: 'local-business', slug: 'local-business', label: 'Local business',
    categories: ['local-business-media'],
    adjacent: [],
    industries: ['general'],
    keywords: ['metropolitan', 'statewide', 'regional business', 'city business', 'local business'],
    markets: ['*'] },
  { key: 'hr-recruitment', slug: 'hr-recruitment', label: 'HR & recruitment',
    categories: ['hr-recruitment-media'],
    adjacent: [],
    industries: ['hr'],
    keywords: ['human resources', 'recruit', 'talent acquisition', 'staffing', 'workforce',
      'employment law', 'people leader'],
    markets: ['*'] },
  { key: 'cybersecurity', slug: 'cybersecurity', label: 'Cybersecurity',
    categories: ['cybersecurity-media'],
    adjacent: ['technology-media'],
    industries: ['cybersecurity'],
    keywords: ['cybersecurity', 'information security', 'infosec', 'threat', 'malware', 'ciso'],
    markets: ['*'] },
  { key: 'finance-fintech', slug: 'finance-fintech', label: 'Finance & fintech',
    categories: ['finance-media', 'fintech-media'],
    adjacent: ['global-business-media'],
    industries: ['finance', 'fintech', 'insurance'],
    keywords: ['fintech', 'banking', 'payments', 'capital markets', 'accounting', 'financial'],
    markets: ['*'] },
  { key: 'energy-cleantech', slug: 'energy-cleantech', label: 'Energy & cleantech',
    categories: ['energy-cleantech-media'],
    adjacent: ['industrial-media'],
    industries: ['energy'],
    keywords: ['renewable', 'solar', 'wind', 'energy storage', 'utility', 'grid', 'cleantech',
      'power generation'],
    markets: ['*'] },
  { key: 'agtech-food', slug: 'agtech-food', label: 'AgTech & food',
    categories: ['agriculture-food-media'],
    adjacent: ['manufacturing-media'],
    industries: ['agriculture'],
    keywords: ['agricultur', 'farm', 'agtech', 'food processing', 'produce', 'livestock'],
    markets: ['*'] },
  { key: 'hospitality-travel', slug: 'hospitality-travel', label: 'Hospitality & travel',
    categories: ['travel-hospitality-media'],
    adjacent: [],
    industries: ['hospitality', 'travel'],
    keywords: ['hotel', 'hospitality', 'travel industry', 'restaurant', 'foodservice', 'tourism'],
    markets: ['*'] },
  { key: 'healthcare', slug: 'healthcare', label: 'Healthcare',
    categories: ['healthcare-media'],
    adjacent: [],
    industries: ['healthcare', 'biotech'],
    // "practitioner" is deliberately absent: it reads as medical AND as legal,
    // and in a sibling engine it put a law directory top of healthcare.
    keywords: ['healthcare', 'hospital', 'medical device', 'health it', 'payer', 'provider', 'medtech'],
    markets: ['*'] },
  { key: 'legal', slug: 'legal', label: 'Legal',
    categories: ['legal-media'],
    adjacent: [],
    industries: ['legal'],
    keywords: ['law firm', 'legal industry', 'legal technology', 'litigation', 'general counsel'],
    markets: ['*'] },
  { key: 'marketing-agency', slug: 'marketing-agency', label: 'Marketing agency',
    categories: ['marketing-media', 'advertising-media'],
    adjacent: ['ecommerce-retail-media'],
    industries: ['marketing', 'advertising'],
    // "advertising" and "brand" are deliberately absent: they appear in almost
    // every platform's description of its OWN advertising sales, so they
    // matched ad-sales boilerplate rather than marketing coverage and put a
    // 3D-printing trade title into the marketing agency results.
    keywords: ['marketing', 'search marketing', 'martech', 'media buying', 'ad agency'],
    markets: ['*'] },
  { key: 'professional-services', slug: 'professional-services', label: 'Professional services',
    categories: ['global-business-media'],
    adjacent: ['local-business-media'],
    industries: ['general', 'finance', 'legal'],
    keywords: ['management', 'executive', 'consulting', 'professional services', 'business strategy'],
    markets: ['*'] },
];
const PROFILE_BY_KEY = new Map(PROFILES.map((p) => [p.key, p]));

// ── fit strengths (documented, ordered, testable) ───────────────────────────
// Ordered by how specifically the platform serves this kind of business.
//
// The split between PRIMARY and ADJACENT exists because the first version had
// only one category tier, and every category a profile listed scored the same
// 100. Three pathologies followed immediately, all the same defect:
//   - B2B SaaS and AI startup returned IDENTICAL top tens, because both listed
//     startup-media and regional startup outlets then tied with the specialist
//     SaaS and AI publications;
//   - the telecom page was led by general technology media, because
//     technology-media scored exactly what telecom-media scored;
//   - no AI-specific publication appeared on the AI page at all.
// A profile's fifth-choice category is not its first choice, and the model now
// says so.
const FIT_CATEGORY = 100;  // primary: the kind of publication this business lives in
const FIT_INDUSTRY = 78;   // the publication covers this sector
const FIT_ADJACENT = 66;   // adjacent kind: sometimes right, never the first answer
const FIT_KEYWORD = 55;    // the platform's own prose names this business's subject
const FIT_GENERAL = 26;    // a general business publication: possible, unfocused
const FIT_NONE = 10;       // no signal either way — low, but not an exclusion
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

const haystack = (r) => `${r.name} ${r.shortNote} ${r.limitations || ''} ${r.categories.join(' ')}`
  .toLowerCase();

// ── the three fits ──────────────────────────────────────────────────────────
function businessFit(r, profile) {
  if (r.categories.some((c) => profile.categories.includes(c))) {
    return { value: FIT_CATEGORY, reason: `a specialist ${profile.label.toLowerCase()} publication` };
  }
  if (r.industries.some((i) => profile.industries.includes(i))) {
    return { value: FIT_INDUSTRY, reason: `covers the ${profile.industries.filter((i) => r.industries.includes(i)).join(', ')} sector` };
  }
  if (r.categories.some((c) => (profile.adjacent || []).includes(c))) {
    return { value: FIT_ADJACENT, reason: `an adjacent publication that sometimes covers ${profile.label.toLowerCase()}` };
  }
  const hay = haystack(r);
  const hit = profile.keywords.find((k) => hay.includes(k));
  if (hit) return { value: FIT_KEYWORD, reason: `its own description names "${hit}"` };
  if (r.categories.includes('global-business-media') || r.categories.includes('local-business-media')) {
    return { value: FIT_GENERAL, reason: 'a general business publication rather than a specialist one' };
  }
  return { value: FIT_NONE, reason: 'no established link to this kind of business' };
}

function objectiveFit(r, objective) {
  if (r.opportunityTypes.includes('unknown')) {
    // Unknown is not exclusion (PART 16). It scores as a neutral mid-value so
    // an otherwise excellent platform is not buried for being under-researched.
    return { value: 45, reason: 'the route is not yet established, so objective fit is unproven', unknown: true };
  }
  const vals = r.opportunityTypes.map((t) => objective.types[t]).filter((v) => typeof v === 'number');
  if (!vals.length) {
    return { value: 0, reason: `offers nothing that delivers ${objective.label.toLowerCase()}`, excluded: true };
  }
  const best = Math.max(...vals);
  const which = r.opportunityTypes.find((t) => objective.types[t] === best);
  return { value: best, reason: `${which.replace(/-/g, ' ')} suits ${objective.label.toLowerCase()}` };
}

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
