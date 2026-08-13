'use strict';

// Opportunity matching — "why might THIS tender be relevant to THIS supplier?"
//
// ── WHAT THIS SCORE IS NOT ──────────────────────────────────────────────────
//
// It is not a probability of winning. It is not a competition estimate. It is
// not buyer attractiveness or contract quality. Nothing in this file can
// compute any of those, because nothing in the data supports them: the corpus
// records what was published, and no source publishes bidder counts, award
// odds, or how crowded a procedure is.
//
// It is RELEVANCE TO A SUPPLIER PROFILE, and it is labelled "Opportunity
// match" everywhere it surfaces — never "win score", never "chance".
//
// ── THREE SCORES IN THIS PRODUCT, KEPT APART ────────────────────────────────
//
//   Procurement Intelligence Score  how strong a PLATFORM is (tp-intelligence)
//   Opportunity Match Score         how relevant a TENDER is to a supplier
//   — no third —                    "opportunity quality" is not computed
//
// The platform score is deliberately NOT multiplied into the match score. A
// tender for hospital catering is irrelevant to a telecom supplier no matter
// how excellent the platform carrying it, and letting platform quality lift an
// irrelevant tender is the exact failure Part 42 names. Platform strength
// enters only as a small CONFIDENCE contribution, capped, and only for
// opportunities that already have category relevance.
//
// ── THE PROFILE VOCABULARY IS BORROWED, NOT FORKED ──────────────────────────
//
// The 16 supplier profiles come from tp-intelligence.cjs unchanged. A second,
// nearly-identical profile list is how two parts of one product start
// disagreeing about what "manufacturer" means, so there is exactly one list
// and this module adds per-profile CLASSIFICATION preferences keyed to it.

const INTEL = require('./tp-intelligence.cjs');
const TIME = require('./to-time.cjs');

// ── CLASSIFICATION PREFERENCES ──────────────────────────────────────────────
//
// Per profile, the CPV divisions and UNSPSC segments that procurement in that
// supplier's line of business actually falls under. These are structural facts
// about the classifications — CPV division 45 IS construction work — not
// claims about any platform or buyer.
//
// PRIMARY prefixes score full category fit. SECONDARY prefixes score partial:
// a telecom supplier plausibly bids IT services procurement, but it is not the
// same signal as a telecommunications services contract.
//
// Prefixes are matched at whatever length they are written, because two digits
// is sometimes too coarse. CPV division 64 is "Postal AND telecommunications
// services", and matching on "64" recommended a Post Office branch tenancy to
// a telecom supplier during the pilot. Telecom therefore matches "642"
// (telecommunications services) and not "641" (post and courier services).
// The division stays where it is honest and narrows where it conflates.
//
// Four profiles have NO classification preference, and that is the honest
// answer rather than a gap: "foreign supplier", "EU company", "local SME" and
// "exporter" are not industries. They describe WHERE a supplier can trade, not
// WHAT it sells, so their match is driven by geography and actionability and
// their category dimension is neutral rather than invented.
const PROFILE_CLASSIFICATIONS = {
  'foreign-supplier': null,
  'eu-company': null,
  'local-sme': null,
  exporter: null,

  'it-software': {
    CPV: { primary: ['48', '72'], secondary: ['30', '32'] },
    UNSPSC: { primary: ['43'], secondary: ['81'] },
  },
  'b2b-saas': {
    CPV: { primary: ['48', '72'], secondary: ['30'] },
    UNSPSC: { primary: ['43'], secondary: ['81', '80'] },
  },
  telecom: {
    // Both of telecom's obvious divisions conflate, so both are narrowed.
    //   64  = postal AND telecommunications  → 642 (telecommunications)
    //   32  = radio, TV, communication AND related equipment, which also
    //         contains photographic film (32354800). A catering-disposables
    //         tender reached the telecom top three through it during the
    //         pilot. → 322 (transmission), 324 (network equipment),
    //         325 (telephone and communications equipment)
    // Division 32 as a whole stays a SECONDARY signal: broadcast and
    // audio-visual work is adjacent to telecom, it is just not the same thing.
    CPV: { primary: ['322', '324', '325', '642'], secondary: ['32', '72', '48', '50'] },
    UNSPSC: { primary: ['43'], secondary: ['81', '26'] },
  },
  manufacturer: {
    CPV: { primary: ['42', '31', '34', '39'], secondary: ['16', '18', '19', '24', '38', '44'] },
    UNSPSC: { primary: ['23', '24', '25', '26', '31', '32'], secondary: ['27', '39', '40', '41', '44', '52', '56'] },
  },
  'industrial-supplier': {
    CPV: { primary: ['42', '43', '44', '31'], secondary: ['14', '24', '38', '50', '51'] },
    UNSPSC: { primary: ['22', '23', '24', '26', '27'], secondary: ['20', '31', '32', '39', '40'] },
  },
  construction: {
    CPV: { primary: ['45', '44'], secondary: ['43', '71', '50'] },
    UNSPSC: { primary: ['72', '30'], secondary: ['22', '81'] },
  },
  infrastructure: {
    CPV: { primary: ['45', '71'], secondary: ['34', '44', '65', '90'] },
    UNSPSC: { primary: ['72', '81'], secondary: ['22', '30', '83'] },
  },
  engineering: {
    CPV: { primary: ['71', '73'], secondary: ['45', '38', '79'] },
    UNSPSC: { primary: ['81'], secondary: ['72', '41', '80'] },
  },
  'professional-services': {
    CPV: { primary: ['79', '73'], secondary: ['80', '66', '72'] },
    UNSPSC: { primary: ['80', '82'], secondary: ['81', '84', '86'] },
  },
  logistics: {
    CPV: { primary: ['60', '63'], secondary: ['34', '50', '90'] },
    UNSPSC: { primary: ['78'], secondary: ['24', '25'] },
  },
  energy: {
    CPV: { primary: ['09', '65', '31'], secondary: ['71', '76', '42', '45'] },
    UNSPSC: { primary: ['15', '26'], secondary: ['71', '83', '81'] },
  },
  healthcare: {
    CPV: { primary: ['33', '85'], secondary: ['38', '79'] },
    UNSPSC: { primary: ['42', '51', '85'], secondary: ['41'] },
  },
};

// ── TEXT MATCHING, HEAVILY CONSTRAINED ──────────────────────────────────────
//
// Part 15 is explicit: generic words must not dominate. So text is the LAST
// signal, contributes at most a fraction of what a classification match does,
// and only fires on terms that are meaningless outside the sector.
//
// "communication" is not in the telecom list. "Communication" appears in
// communication strategies, communication campaigns and internal communication
// training — a telecom supplier matching all of those is exactly the noise the
// brief warns about. "VoIP" and "SIP trunk" are in it, because nothing else is
// called that.
//
// Terms are matched as whole words against the TITLE only. Descriptions are
// long, multilingual and full of boilerplate, and a term buried in a paragraph
// is not evidence of subject matter.
const PROFILE_TERMS = {
  telecom: ['voip', 'sip', 'telephony', 'telecom', 'telecommunication', 'telecommunications',
    'ucaas', 'pbx', 'telefonie', 'telefonia', 'telefonía', 'téléphonie', 'mobilfunk',
    'roaming', 'broadband', 'fibre', 'fiber', 'lte', 'gsm'],
  'it-software': ['software', 'saas', 'erp', 'crm', 'middleware', 'application', 'informatique',
    'informatica', 'informática', 'datenbank', 'database', 'cloud', 'helpdesk', 'servidor'],
  'b2b-saas': ['saas', 'subscription', 'cloud', 'platform-as-a-service', 'licence', 'license',
    'abonnement', 'suscripción'],
  construction: ['construction', 'refurbishment', 'renovation', 'bauarbeiten', 'obra', 'obras',
    'travaux', 'roofing', 'demolition', 'groundworks', 'sanierung'],
  logistics: ['freight', 'haulage', 'courier', 'warehousing', 'logistics', 'logistik',
    'transporte', 'transport', 'shipping'],
  healthcare: ['pharmaceutical', 'medical', 'clinical', 'hospital', 'diagnostic', 'medicamento',
    'arzneimittel', 'médical'],
  energy: ['photovoltaic', 'electricity', 'gas', 'heating', 'renewable', 'solar', 'wind',
    'stromversorgung', 'energía', 'énergie'],
  engineering: ['engineering', 'ingénierie', 'ingeniería', 'ingenieur', 'geotechnical',
    'structural', 'surveying'],
  manufacturer: ['manufacture', 'fabrication', 'machinery', 'equipment', 'herstellung',
    'fabricación', 'maschinen'],
};

// ── SCORE MODEL ─────────────────────────────────────────────────────────────
//
// Six dimensions, 100 points. Weights are stated here rather than buried in
// the arithmetic so they can be argued with — and a test inverts them to prove
// the ranking actually depends on them.
const WEIGHTS = {
  category: 40,      // does this procurement match what the supplier sells?
  geography: 20,     // can the supplier plausibly trade here?
  actionability: 15, // is there a route to act on it?
  deadline: 15,      // is there usable time left?
  confidence: 10,    // how well established is what we know?
};

const EU_MEMBERS = new Set(['austria', 'belgium', 'bulgaria', 'croatia', 'cyprus', 'czech-republic',
  'denmark', 'estonia', 'finland', 'france', 'germany', 'greece', 'hungary', 'ireland', 'italy',
  'latvia', 'lithuania', 'luxembourg', 'malta', 'netherlands', 'poland', 'portugal', 'romania',
  'slovakia', 'slovenia', 'spain', 'sweden']);

// A deadline closer than this is not a realistic bidding window for anyone who
// has just discovered the tender. Documented rather than hardcoded in copy.
const CLOSING_SOON_DAYS = 7;
const MIN_USABLE_DAYS = 3;
const AMPLE_DAYS = 21;

function categoryScore(o, profileKey) {
  const prefs = PROFILE_CLASSIFICATIONS[profileKey];
  // A profile with no industry is neutral, not zero. Scoring it zero would
  // push every geography-driven profile to the bottom of every list.
  if (prefs === null || prefs === undefined) return { score: 0.5, signal: 'PROFILE_NOT_INDUSTRY' };

  const codes = o.classifications || [];
  if (!codes.length) {
    // No code published. Fall back to the title terms, which are worth less.
    const t = textScore(o, profileKey);
    if (t.hit) return { score: 0.45, signal: 'TITLE_TERM', term: t.term };
    return { score: 0, signal: 'NO_CLASSIFICATION' };
  }

  let best = 0;
  let signal = 'CLASSIFICATION_MISMATCH';
  let matched = null;
  const startsWithAny = (code, prefixes) => prefixes.some((pre) => code.startsWith(pre));
  for (const c of codes) {
    const p = prefs[c.scheme];
    if (!p || !c.code) continue;
    if (startsWithAny(c.code, p.primary)) {
      if (best < 1) { best = 1; signal = 'CLASSIFICATION_PRIMARY'; matched = c; }
    } else if (startsWithAny(c.code, p.secondary) && best < 0.6) {
      best = 0.6; signal = 'CLASSIFICATION_SECONDARY'; matched = c;
    }
  }
  if (best === 0) {
    // Codes exist in a scheme this profile does not understand — a Canadian
    // GSIN against a CPV-only preference, say. That is not a mismatch, it is
    // an unreadable signal, and it must not look like a rejection.
    const understood = codes.some((c) => prefs[c.scheme]);
    if (!understood) return { score: 0.35, signal: 'SCHEME_NOT_UNDERSTOOD' };
    const t = textScore(o, profileKey);
    if (t.hit) return { score: 0.4, signal: 'TITLE_TERM', term: t.term };
  }
  return { score: best, signal, matched };
}

function textScore(o, profileKey) {
  const terms = PROFILE_TERMS[profileKey];
  if (!terms) return { hit: false };
  const title = String(o.title || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  for (const term of terms) {
    // Whole word only. "sip" must not match "Mississippi".
    if (new RegExp(`(^|[^a-z0-9])${term}([^a-z0-9]|$)`).test(title)) return { hit: true, term };
  }
  return { hit: false };
}

function geographyScore(o, profileKey) {
  const country = o.country;
  const supranational = o.coverage === 'supranational';

  if (profileKey === 'eu-company') {
    if (country && EU_MEMBERS.has(country)) return { score: 1, signal: 'EU_MEMBER_STATE' };
    if (o.sourceId === 'ted') return { score: 0.9, signal: 'EU_WIDE_SYSTEM' };
    if (supranational) return { score: 0.5, signal: 'SUPRANATIONAL' };
    return { score: 0.25, signal: 'OUTSIDE_EU' };
  }
  if (profileKey === 'local-sme') {
    // A local SME is served by national and subnational procurement, not by
    // multilateral development finance.
    if (supranational) return { score: 0.1, signal: 'SUPRANATIONAL_NOT_LOCAL' };
    if (o.subnationalJurisdiction) return { score: 1, signal: 'SUBNATIONAL' };
    return { score: 0.7, signal: 'NATIONAL' };
  }
  if (profileKey === 'foreign-supplier' || profileKey === 'exporter') {
    if (supranational) return { score: 1, signal: 'CROSS_BORDER_SYSTEM' };
    return { score: 0.6, signal: 'NATIONAL_SYSTEM' };
  }
  if (profileKey === 'infrastructure') {
    if (o.projectCountry) return { score: 1, signal: 'PROJECT_FINANCED' };
  }
  return { score: supranational ? 0.8 : 0.7, signal: supranational ? 'CROSS_BORDER_SYSTEM' : 'NATIONAL_SYSTEM' };
}

// Can a supplier actually do something about this notice today?
//
// Note what is NOT here: the platform's e-submission capability. A tender is
// actionable when THIS notice has a route, not when the system that carries it
// theoretically supports one.
function actionabilityScore(o) {
  let s = 0.3; // there is always a notice URL — the schema requires it
  const signals = ['SOURCE_LINK'];
  if (o.submissionUrl) { s += 0.4; signals.push('SUBMISSION_ROUTE'); }
  if (o.electronicSubmission === 'yes') { s += 0.3; signals.push('ELECTRONIC_SUBMISSION_STATED'); }
  else if (o.electronicSubmission === 'no') { signals.push('ELECTRONIC_SUBMISSION_EXCLUDED'); }
  return { score: Math.min(1, s), signals };
}

function deadlineScore(o, nowIso) {
  const days = TIME.daysUntil(o.deadline, nowIso);
  if (days === null) {
    // Undecidable or absent. Neutral, not zero: SECOP II publishes no deadline
    // at all and its notices are still real, open opportunities.
    return { score: 0.5, signal: 'DEADLINE_NOT_DECIDABLE', days: null };
  }
  if (days < 0) return { score: 0, signal: 'DEADLINE_PASSED', days };
  if (days < MIN_USABLE_DAYS) return { score: 0.3, signal: 'DEADLINE_VERY_NEAR', days };
  if (days <= CLOSING_SOON_DAYS) return { score: 0.7, signal: 'CLOSING_SOON', days };
  if (days <= AMPLE_DAYS) return { score: 1, signal: 'AMPLE_TIME', days };
  return { score: 0.85, signal: 'DISTANT_DEADLINE', days };
}

// How well established is what we are telling the user?
//
// This is where platform strength is allowed in — capped at a third of a
// dimension that is itself only 10 points, so a superb platform can move a
// match by about three points and can never rescue an irrelevant tender.
function confidenceScore(o, platform) {
  let s = 0;
  const signals = [];
  if (o.statusBasis === 'SOURCE_REPORTED') { s += 0.45; signals.push('STATUS_FROM_SOURCE'); }
  else if (o.statusBasis === 'SOURCE_SCOPE') { s += 0.3; signals.push('STATUS_FROM_SOURCE_SCOPE'); }
  else if (o.statusBasis === 'DERIVED_FROM_DEADLINE') { s += 0.15; signals.push('STATUS_DERIVED'); }
  if ((o.classifications || []).length) { s += 0.2; signals.push('CLASSIFIED'); }
  if (o.multiSource) { s += 0.05; signals.push('CONFIRMED_BY_TWO_SOURCES'); }
  if (platform) {
    const util = INTEL.utilityScore(platform);
    if (util !== null) { s += Math.min(0.3, (util / 100) * 0.3); signals.push('PLATFORM_ESTABLISHED'); }
  }
  return { score: Math.min(1, s), signals };
}

// ── THE MATCH ───────────────────────────────────────────────────────────────

function matchFor(o, profileKey, { nowIso, platform = null } = {}) {
  if (!INTEL.PROFILES[profileKey]) throw new Error(`Unknown supplier profile "${profileKey}"`);

  const cat = categoryScore(o, profileKey);
  const geo = geographyScore(o, profileKey);
  const act = actionabilityScore(o);
  const dl = deadlineScore(o, nowIso);
  const conf = confidenceScore(o, platform);

  const score = Math.round(
    cat.score * WEIGHTS.category
    + geo.score * WEIGHTS.geography
    + act.score * WEIGHTS.actionability
    + dl.score * WEIGHTS.deadline
    + conf.score * WEIGHTS.confidence,
  );

  // Every recommendation explains itself, and the uncertainty is part of the
  // explanation rather than a footnote (Part 21).
  const reasons = [];
  if (cat.signal === 'CLASSIFICATION_PRIMARY') reasons.push({ key: 'CLASSIFICATION_PRIMARY', detail: cat.matched });
  else if (cat.signal === 'CLASSIFICATION_SECONDARY') reasons.push({ key: 'CLASSIFICATION_SECONDARY', detail: cat.matched });
  else if (cat.signal === 'TITLE_TERM') reasons.push({ key: 'TITLE_TERM', detail: { term: cat.term } });
  reasons.push({ key: geo.signal });
  for (const s of act.signals) if (s !== 'SOURCE_LINK') reasons.push({ key: s });
  if (dl.signal !== 'DEADLINE_NOT_DECIDABLE') reasons.push({ key: dl.signal, detail: { days: dl.days } });
  if (o.multiSource) reasons.push({ key: 'CONFIRMED_BY_TWO_SOURCES' });

  const uncertainty = [];
  if (cat.signal === 'PROFILE_NOT_INDUSTRY') uncertainty.push('PROFILE_NOT_INDUSTRY');
  if (cat.signal === 'NO_CLASSIFICATION') uncertainty.push('NO_CLASSIFICATION');
  if (cat.signal === 'SCHEME_NOT_UNDERSTOOD') uncertainty.push('SCHEME_NOT_UNDERSTOOD');
  if (cat.signal === 'TITLE_TERM') uncertainty.push('MATCHED_ON_TITLE_ONLY');
  if (dl.signal === 'DEADLINE_NOT_DECIDABLE') uncertainty.push('DEADLINE_NOT_DECIDABLE');
  if (o.electronicSubmission === null) uncertainty.push('ELECTRONIC_SUBMISSION_UNKNOWN');
  // Always. No pilot source states foreign eligibility per notice, and the
  // platform's value is never inherited.
  uncertainty.push('FOREIGN_ELIGIBILITY_NOT_STATED');
  if (o.statusBasis === 'DERIVED_FROM_DEADLINE') uncertainty.push('STATUS_INFERRED_FROM_DATE');

  return {
    score,
    band: band(score),
    dimensions: {
      category: cat.score, geography: geo.score, actionability: act.score,
      deadline: dl.score, confidence: conf.score,
    },
    reasons,
    uncertainty,
    daysUntilDeadline: dl.days,
  };
}

function band(score) {
  if (score >= 80) return 'STRONG';
  if (score >= 65) return 'GOOD';
  if (score >= 50) return 'MODERATE';
  if (score >= 35) return 'WEAK';
  return 'MINIMAL';
}

// Rank current opportunities for a profile. Only opportunities that are
// actually current are eligible — a cancelled or closed tender is never a
// recommendation, whatever it scores.
function rank(opportunities, profileKey, { nowIso, platformsById = new Map(), limit = 10, minScore = 0 } = {}) {
  const SCHEMA = require('./to-schema.cjs');
  return opportunities
    .filter((o) => SCHEMA.isCurrent(o))
    .map((o) => ({ opportunity: o, match: matchFor(o, profileKey, { nowIso, platform: platformsById.get(o.sourcePlatformId) }) }))
    .filter((x) => x.match.score >= minScore)
    .sort((a, b) => b.match.score - a.match.score
      || (a.opportunity.id < b.opportunity.id ? -1 : 1))
    .slice(0, limit);
}

module.exports = {
  PROFILE_CLASSIFICATIONS, PROFILE_TERMS, WEIGHTS, EU_MEMBERS,
  CLOSING_SOON_DAYS, MIN_USABLE_DAYS, AMPLE_DAYS,
  categoryScore, textScore, geographyScore, actionabilityScore, deadlineScore, confidenceScore,
  matchFor, band, rank,
  PROFILES: INTEL.PROFILES,
};
