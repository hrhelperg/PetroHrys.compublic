'use strict';

// Directory Intelligence v3 — recommendation intelligence.
//
// The Directory Score answers "how good is this platform?". It is the same
// number for everyone. This module answers a different question: "how good is
// this platform FOR THIS BUSINESS?" — and that number is different for a local
// plumber and a Series-A SaaS company looking at the same directory.
//
// FOUR RULES.
//
// 1. NOTHING IS HARDCODED. There is no curated list of "best directories for
//    SaaS" anywhere in this file. A profile declares what it needs; every
//    platform in the registry is scored against that declaration; the ranking
//    falls out. Adding a platform to the registry changes the recommendations
//    with no edit here.
//
// 2. EVERY RECOMMENDATION EXPLAINS ITSELF, from the same computation that
//    produced it. The reasons are not prose written alongside a number — they
//    are emitted by the scoring steps, so a reason can never contradict the
//    score it accompanies.
//
// 3. AN EXPLICIT NO IS DISQUALIFYING. `accepts` is tri-state. If a platform
//    states it does not accept a business type, no amount of quality can make
//    it a recommendation — it is excluded, with that reason. This is the one
//    place where a rule beats a score, and it must, because recommending a
//    platform that will reject the submission wastes the employee's time.
//
// 4. UNKNOWN FIT IS NOT ZERO FIT. Most rows have no `accepts` data at all.
//    Treating that as "does not accept" would empty every page; treating it as
//    "accepts" would fill the pages with noise. It scores as weak-but-eligible
//    and is always labelled, so a reader can see which recommendations rest on
//    an established fit and which on a category match alone.

const S = require('./bd-schema.cjs');
const INTEL = require('./bd-intelligence.cjs');

// --- business profiles ------------------------------------------------------
// A profile is a DECLARATION, not a list. `accepts` names the tri-state flags
// that establish fit; `categories` names the registry categories whose
// platforms serve this kind of business; `label`/`blurb` are for the page.
//
// A profile never names a platform. If a profile had to name one, that would be
// evidence the declaration is wrong.

const PROFILES = [
  { key: 'saas', label: 'SaaS companies', slug: 'saas',
    accepts: ['saas'], categories: ['saas', 'software', 'review-sites'],
    blurb: 'Software products sold by subscription, where buyers compare on review sites before they trial.' },
  { key: 'ai-startup', label: 'AI startups', slug: 'ai-startups',
    accepts: ['ai', 'startup'], categories: ['ai', 'startup', 'saas'],
    blurb: 'Early-stage AI products, where launch surfaces and startup databases carry most of the discovery.' },
  { key: 'local-business', label: 'local businesses', slug: 'local-businesses',
    accepts: ['localBusiness'], categories: ['local-business', 'general-business'],
    blurb: 'Businesses serving a physical catchment, where map and local-search listings decide who is found.' },
  { key: 'manufacturer', label: 'manufacturers', slug: 'manufacturers',
    accepts: [], categories: ['manufacturing'],
    keywords: ['manufactur', 'supplier', 'industrial', 'factory', 'oem', 'wholesale'],
    blurb: 'Producers selling to other businesses, where industrial catalogues and trade bodies carry the buyers.' },
  { key: 'exporter', label: 'export companies', slug: 'exporters',
    accepts: [], categories: ['manufacturing'],
    keywords: ['export', 'import', 'trade', 'sourcing', 'supplier'],
    blurb: 'Companies selling across borders, where export councils and international B2B marketplaces matter most.' },
  { key: 'agency', label: 'agencies', slug: 'agencies',
    accepts: ['agency'], categories: ['marketing', 'software', 'review-sites'],
    blurb: 'Service firms sold on credibility, where a rated public profile is often the first thing a client reads.' },
  { key: 'enterprise-software', label: 'enterprise software vendors', slug: 'enterprise-software',
    accepts: ['enterprise', 'saas'], categories: ['saas', 'software'],
    blurb: 'Software sold into large organisations, where vendor partner directories carry procurement weight.' },
  { key: 'ecommerce', label: 'ecommerce stores', slug: 'ecommerce',
    accepts: ['ecommerce'], categories: ['general-business', 'review-sites'],
    blurb: 'Online retailers, where verified review platforms and marketplaces drive both trust and traffic.' },
  { key: 'law-firm', label: 'law firms', slug: 'law-firms',
    accepts: [], categories: ['legal'],
    keywords: ['lawyer', 'solicitor', 'attorney', 'legal', 'advocat', 'law firm'],
    blurb: 'Legal practices, where professional bodies and specialist directories are the credible listings.' },
  { key: 'accounting', label: 'accounting firms', slug: 'accounting-firms',
    accepts: [], categories: [],
    keywords: ['account', 'audit', 'tax ', 'cpa', 'chartered'],
    blurb: 'Accountancy practices, where institute directories carry more weight than general listings.' },
  { key: 'healthcare', label: 'healthcare providers', slug: 'healthcare-providers',
    accepts: [], categories: [],
    // "practitioner" is deliberately absent: it matched The Legal 500, which
    // describes legal practitioners, and put a law directory at the top of
    // Healthcare. A keyword has to be unambiguous across industries to be
    // usable as evidence of fit.
    keywords: ['doctor', 'clinic', 'health', 'medical', 'dentist', 'patient', 'pharmac',
      'hospital', 'physician', 'therapist'],
    blurb: 'Clinics and practitioners, where booking platforms and professional locators reach patients directly.' },
  { key: 'cybersecurity', label: 'cybersecurity companies', slug: 'cybersecurity',
    accepts: ['saas'], categories: ['software', 'saas'],
    blurb: 'Security vendors and consultancies, where vendor partner status is a buying signal.' },
  { key: 'cloud', label: 'cloud companies', slug: 'cloud-companies',
    accepts: ['developer', 'saas'], categories: ['software', 'saas'],
    blurb: 'Cloud and infrastructure providers, where hyperscaler partner directories are the primary route.' },
  { key: 'fintech', label: 'fintech companies', slug: 'fintech',
    accepts: ['saas', 'startup'], categories: ['saas', 'startup', 'software'],
    blurb: 'Financial technology products, where review platforms and startup databases carry discovery.' },
  { key: 'hr', label: 'HR companies', slug: 'hr-companies',
    accepts: ['saas', 'agency'], categories: ['saas', 'general-business'],
    blurb: 'HR software and services, where software review sites and employer platforms overlap.' },
  { key: 'logistics', label: 'logistics companies', slug: 'logistics',
    accepts: [], categories: [],
    keywords: ['logistic', 'freight', 'forwarder', 'shipping', 'transport', 'courier',
      'supply chain', 'cargo'],
    blurb: 'Freight and logistics firms, where network membership directories are how partners find each other.' },
  { key: 'construction', label: 'construction companies', slug: 'construction',
    accepts: [], categories: ['construction'],
    keywords: ['construct', 'builder', 'contractor', 'roofing', 'plumb', 'electrical',
      'architect', 'renovat', 'hvac', 'tradesperson', 'tradespeople'],
    blurb: 'Builders and trades, where vetted-trader schemes and trade bodies decide who gets called.' },
  { key: 'real-estate', label: 'real estate companies', slug: 'real-estate',
    accepts: [], categories: [],
    keywords: ['real estate', 'property', 'estate agent', 'realtor', 'makler', 'immobil'],
    blurb: 'Agencies and brokerages, where local directories and portal profiles carry the enquiries.' },
  { key: 'education', label: 'education companies', slug: 'education',
    accepts: [], categories: ['education'],
    keywords: ['school', 'education', 'course', 'training', 'tutor', 'universit', 'student'],
    blurb: 'Schools, training providers and edtech, where course directories carry the search demand.' },
];

// `accepts` may only name real tri-state flags. There is no flag for
// "manufacturer" or "law firm", and an earlier version proxied those with
// `enterprise` and `localBusiness` — which put Hugging Face at the top of
// Manufacturers and The Legal 500 at the top of Exporters, because both accept
// enterprises. A profile with no corresponding flag declares `accepts: []` and
// is driven by category alone, which scores lower on purpose: category is
// weaker evidence of fit than the platform's own statement.
for (const p of PROFILES) {
  for (const k of p.accepts) {
    if (!S.ACCEPTS_KEYS.includes(k)) {
      throw new Error(`Profile "${p.key}" names "${k}", which is not an accepts flag.`);
    }
  }
  if (!p.accepts.length && !p.categories.length && !(p.keywords || []).length) {
    throw new Error(`Profile "${p.key}" declares no accepts flag, category or keyword.`);
  }
}

const PROFILE_BY_KEY = new Map(PROFILES.map((p) => [p.key, p]));

// --- fit --------------------------------------------------------------------
// How well the PLATFORM matches the BUSINESS, before any quality judgement.
//
// Three states, and the distinction between the last two is the whole point:
//   established  the platform states it accepts this type
//   category     no accepts data, but the platform's category serves this type
//   unknown      neither — eligible, but nothing supports it
const FIT_ESTABLISHED = 100;
const FIT_CATEGORY = 55;
// The platform's OWN prose names the industry. Weaker than a category, because
// a word can appear incidentally; stronger than nothing, because the words are
// the operator's rather than ours.
//
// Added because `category` alone is a coarse instrument. Several profiles have
// no category that corresponds to them at all, and leaning on
// `industry-associations` to cover the gap put ABTA at the top of Construction
// and Alibaba at the top of Logistics — both are associations, neither is
// either of those things.
const FIT_KEYWORD = 45;
const FIT_UNKNOWN = 25;

function fitOf(record, profile) {
  const accepts = record.accepts && typeof record.accepts === 'object' ? record.accepts : null;
  const reasons = [];

  // Rule 3: an explicit no ends it, whatever the quality.
  if (accepts) {
    const refused = profile.accepts.filter((k) => accepts[k] === false);
    if (refused.length && !profile.accepts.some((k) => accepts[k] === true)) {
      return {
        fit: 0, basis: 'excluded', reasons: [`The platform states it does not accept ${profile.label}.`],
      };
    }
    const stated = profile.accepts.filter((k) => accepts[k] === true);
    if (stated.length) {
      reasons.push(`Accepts ${stated.map((k) => S.ACCEPTS_LABELS[k] || k).join(' and ').toLowerCase()}.`);
      return { fit: FIT_ESTABLISHED, basis: 'established', reasons };
    }
  }
  if (profile.categories.includes(record.category)) {
    reasons.push(`Listed under ${record.category.replace(/-/g, ' ')}, a category that serves ${profile.label}.`);
    return { fit: FIT_CATEGORY, basis: 'category', reasons };
  }
  if ((profile.keywords || []).length) {
    const prose = `${record.name} ${record.description || ''}`.toLowerCase();
    const hit = profile.keywords.find((w) => prose.includes(w));
    if (hit) {
      reasons.push(`The platform's own description names this field ("${hit.trim()}").`);
      return { fit: FIT_KEYWORD, basis: 'keyword', reasons };
    }
  }
  return { fit: FIT_UNKNOWN, basis: 'unknown', reasons: [] };
}

// --- recommendation score ---------------------------------------------------
// Suitability, not quality. FIT is the multiplier because a perfect platform for
// the wrong business is not a recommendation; QUALITY is what separates two
// platforms that fit equally well.
//
//   recommendation = fit% × quality
//
// QUALITY prefers the Directory Score. Where there is not enough evidence to
// compute one, it falls back to the reachable signals every row has — tier and
// status — at a documented discount, because a fallback must never look as
// authoritative as the real thing.
const FALLBACK_DISCOUNT = 0.7;

function qualityOf(record) {
  const score = INTEL.directoryScore(record);
  if (score.scored) {
    return { quality: score.overall, source: 'directory-score', score };
  }
  const parts = [];
  if (record.tier) parts.push({ tier1: 90, tier2: 65, tier3: 40 }[record.tier] ?? null);
  if (record.currentStatus === 'active') parts.push(85);
  const known = parts.filter((n) => typeof n === 'number');
  if (!known.length) return { quality: null, source: 'none', score };
  const raw = known.reduce((a, b) => a + b, 0) / known.length;
  return { quality: Math.round(raw * FALLBACK_DISCOUNT), source: 'fallback', score };
}

// Reasons are emitted by the same steps that produce the number, so a reason can
// never contradict its score.
function qualityReasons(record, score) {
  const out = [];
  const d = score.dimensions || {};
  if (typeof d.seoValue === 'number' && d.seoValue >= 70) out.push('Strong SEO value from its link and indexing behaviour.');
  if (typeof d.referralPotential === 'number' && d.referralPotential >= 70) out.push('High referral potential.');
  if (typeof d.trust === 'number' && d.trust >= 70) out.push('Verified listings — the directory checks entries before publishing.');
  if (typeof d.easeOfApproval === 'number' && d.easeOfApproval >= 70) out.push('Straightforward to join.');
  if (record.submissionModel === 'free') out.push('Free listing.');
  else if (record.submissionModel === 'freemium') out.push('Free tier available.');
  const intel = record.intelligence || {};
  if (intel.profileIndexed === true) out.push('Profile pages are indexed.');
  if (intel.approvalMode === 'instant') out.push('Publishes without waiting for review.');
  if (intel.hasApi === true) out.push('Has a submission API.');
  if (record.tier === 'tier1') out.push('A leading platform in its field.');
  return out;
}

// Bands describe how firmly a recommendation is supported. `possible` exists so
// a reader can see that a row surfaced on category alone.
function level(score, basis) {
  if (score === null) return null;
  if (basis === 'excluded') return 'excluded';
  if (score >= 70 && basis === 'established') return 'priority';
  if (score >= 55) return 'recommended';
  if (score >= 35) return 'possible';
  return 'marginal';
}

const LEVEL_LABELS = {
  priority: 'Priority', recommended: 'Recommended', possible: 'Possible',
  marginal: 'Marginal', excluded: 'Not applicable',
};

function recommend(record, profileKey) {
  const profile = typeof profileKey === 'string' ? PROFILE_BY_KEY.get(profileKey) : profileKey;
  if (!profile) throw new Error(`Unknown business profile: ${profileKey}`);
  const f = fitOf(record, profile);
  const q = qualityOf(record);
  if (f.basis === 'excluded') {
    return { profile: profile.key, score: 0, level: 'excluded', fit: f.basis, quality: null, reasons: f.reasons };
  }
  if (q.quality === null) {
    return { profile: profile.key, score: null, level: null, fit: f.basis, quality: null, reasons: [] };
  }
  const score = Math.round((f.fit / 100) * q.quality);
  const reasons = [...f.reasons, ...qualityReasons(record, q.score)];
  if (q.source === 'fallback') {
    reasons.push('Scored from reputation and status only — not enough evidence yet for a full Directory Score.');
  }
  if (f.basis === 'unknown') {
    reasons.push('Fit is not established: the platform has not stated which business types it accepts.');
  }
  return { profile: profile.key, score, level: level(score, f.basis), fit: f.basis, quality: q.quality, reasons };
}

// The ranked list for one profile. Deterministic all the way down: ties break on
// id, which is unique, so the same registry always produces the same order.
function rankFor(records, profileKey, { limit = null, minLevel = 'possible' } = {}) {
  const order = ['priority', 'recommended', 'possible', 'marginal'];
  const floor = order.indexOf(minLevel);
  const out = [];
  for (const r of records) {
    const rec = recommend(r, profileKey);
    if (rec.score === null || rec.level === 'excluded') continue;
    if (order.indexOf(rec.level) > floor) continue;
    out.push({ record: r, recommendation: rec });
  }
  out.sort((a, b) => (b.recommendation.score - a.recommendation.score)
    || S.compareStable(a.record.id, b.record.id));
  return limit ? out.slice(0, limit) : out;
}

module.exports = {
  PROFILES, PROFILE_BY_KEY, LEVEL_LABELS,
  FIT_ESTABLISHED, FIT_CATEGORY, FIT_KEYWORD, FIT_UNKNOWN, FALLBACK_DISCOUNT,
  fitOf, qualityOf, qualityReasons, level, recommend, rankFor,
};
