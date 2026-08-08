'use strict';

// Distribution Intelligence v2 — actionability.
//
// v1 answered "where should this business be promoted?". This answers the
// different question an employee actually has on Monday morning: "what exactly
// do I do next, where, and how sure are we?"
//
// ── THE AUDIT CAME FIRST, AND IT ADDS ZERO STORED FIELDS ────────────────────
//
// Every operational concept the brief asked for already has a canonical home:
//
//   CONCEPT                 CANONICAL FIELD                          COVERAGE
//   action                  listingAction / marketplaceType+          32/1563 dirs
//                           sellerTypes / opportunityTypes            all mp, all media
//   action URL              submissionUrl, claimUrl, pitchUrl,        139 / 2234
//                           pressReleaseUrl, advertisingUrl
//   cost                    submissionModel / costModel               48 dirs, all others
//   verification            verificationMethods (VERIFICATION_METHODS) 2 / 1563
//   required assets         requiredAssets (REQUIRED_ASSET_KEYS)      77 / 1563
//   difficulty              submissionDifficulty (SUBMISSION_DIFFICULTY) 36 / 1563
//   moderation              intelligence.approvalMode,                31 dirs, 62 media
//                           requiresEditorialApproval
//   geography               country / audienceGeography / countryReach full
//   languages               languages                                 media only
//   eligibility             listingAction: invite-only + prose        sparse
//
// So the gap is EVIDENCE, not schema. Adding `publishingTime` or
// `accountRequired` columns would have produced 2,234 empty cells and a
// dashboard reporting how many fields exist rather than how much is known.
// Publishing time is derived from approvalMode where that exists and is
// `unknown` everywhere else, which is the truth.
//
// The headline consequence is uncomfortable and is reported rather than hidden:
// only a small fraction of the catalogue is executable today. A smaller
// truthful Ready queue is worth more than a large one built on assumptions.

const BD = require('./bd-schema.cjs');
const S = require('./media-schema.cjs');

// ── evidence, reused from the sibling engines ───────────────────────────────
const EVIDENCE = {
  VERIFIED: 'verified',      // A — the operator states it
  OBSERVABLE: 'observable',  // B — visible in the public product
  DERIVED: 'derived',        // C — computed from a documented rule
  UNKNOWN: 'unknown',        // not established
};

// ── the state machine ───────────────────────────────────────────────────────
// Small and explicit. UNKNOWN never becomes READY, and a bot filter never
// becomes dead.
const STATUS = {
  READY: 'READY',
  NEEDS_RESEARCH: 'NEEDS_RESEARCH',
  NEEDS_BROWSER: 'NEEDS_BROWSER',
  BLOCKED: 'BLOCKED',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
};
const STATUS_LABEL = {
  READY: 'Ready to execute',
  NEEDS_RESEARCH: 'Needs research',
  NEEDS_BROWSER: 'Needs browser check',
  BLOCKED: 'Blocked',
  NOT_APPLICABLE: 'Not applicable',
};

const CONFIDENCE = { HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW', INSUFFICIENT: 'INSUFFICIENT' };
const CONFIDENCE_LABEL = {
  HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low', INSUFFICIENT: 'Not enough to act on',
};

const DIFFICULTY_LABEL = {
  'very-easy': 'Easy', easy: 'Easy', moderate: 'Moderate', hard: 'Complex', unknown: 'Unknown',
};

// Publishing time is only ever stated where the source says so. `instant`
// approval is a genuine operator statement about timing; everything else is
// unknown, because "a large publication probably takes two weeks" is an
// assumption and this repository does not store assumptions.
const PUBLISHING_TIME = { instant: 'Instant', manual: 'Unknown — manual review', unknown: 'Unknown' };

// ── next actions, derived from canonical facts ──────────────────────────────
// Wording is per ACTION, never per platform, so 2,234 rows share seventeen
// sentences and none of them was hand-written for a particular site.
const NEXT_ACTION = {
  'create-listing': 'Create a business profile',
  'claim-profile': 'Claim the existing company profile',
  'apply-for-inclusion': 'Apply for inclusion',
  'post-advertisement': 'Post an advertisement',
  'create-seller-profile': 'Create a seller account',
  'publish-classified': 'Post a classified listing',
  'pitch-editor': 'Pitch the editorial team',
  'submit-news': 'Submit company news',
  'send-press-release': 'Distribute a press release',
  'contribute-article': 'Submit a contributed article',
  'launch-product': 'Submit a product launch',
  'register-as-source': 'Register as an expert source',
  'apply-podcast-guest': 'Apply as a podcast guest',
  'sponsor-placement': 'Buy a sponsored placement',
  'enter-award': 'Enter the award',
  'publish-profile': 'Publish a company profile',
  investigate: 'Research the submission route',
};

// ── requirements, read from wherever the owning collection keeps them ───────
function requirementsFor(op) {
  const r = op.record || {};
  const intel = r.intelligence || {};
  const verification = Array.isArray(r.verificationMethods) ? r.verificationMethods : [];
  const assets = Array.isArray(r.requiredAssets) ? r.requiredAssets : [];
  // Moderation lives in a different field per collection, which is correct —
  // each collection owns its own fact — so it is read, not copied.
  let moderation = EVIDENCE.UNKNOWN;
  if (op.sourceCollection === 'directories' && intel.approvalMode) moderation = intel.approvalMode;
  else if (op.sourceCollection === 'media' && r.requiresEditorialApproval === true) moderation = 'manual';
  return {
    verification: verification.filter((v) => BD.VERIFICATION_METHODS.includes(v)),
    assets: assets.filter((a) => BD.REQUIRED_ASSET_KEYS.includes(a)),
    moderation,
    difficulty: BD.SUBMISSION_DIFFICULTY.includes(r.submissionDifficulty)
      ? r.submissionDifficulty : 'unknown',
    publishingTime: moderation === 'instant' ? 'instant' : 'unknown',
  };
}

// ── blockers ────────────────────────────────────────────────────────────────
// A blocker is a KNOWN restriction, not an absence of information. Missing
// evidence produces NEEDS_RESEARCH, never BLOCKED.
function blockersFor(op) {
  const r = op.record || {};
  const out = [];
  if (['shutting-down', 'dormant', 'redirected'].includes(r.currentStatus)) {
    out.push('the platform is no longer operating');
  }
  if (r.listingAction === 'invite-only') out.push('listing is invitation only');
  if (r.listingAction === 'not-applicable') out.push('the platform does not accept listings');
  if (op.sourceCollection === 'marketplaces' && op.sellerTypes === 'private') {
    out.push('accepts private sellers only, not companies');
  }
  if (r.priority === 'reject') out.push('rejected on quality grounds');
  return out;
}

// Does the recorded action URL match the action we say to perform? A claim URL
// is not a submission route and a rate card is not an editorial desk; sending
// someone to the wrong one wastes the trip.
function urlMatchesAction(op) {
  const r = op.record || {};
  if (!op.actionUrl) return false;
  if (op.sourceCollection === 'directories') {
    if (op.actionType === 'claim-profile') return op.actionUrl === r.claimUrl;
    return op.actionUrl === r.submissionUrl || op.actionUrl === r.claimUrl;
  }
  if (op.sourceCollection === 'media') {
    const map = {
      'send-press-release': [r.pressReleaseUrl],
      'pitch-editor': [r.pitchUrl, r.submissionUrl],
      'sponsor-placement': [r.advertisingUrl, r.submissionUrl],
    };
    const allowed = map[op.actionType] || [r.submissionUrl, r.pitchUrl, r.pressReleaseUrl, r.advertisingUrl];
    return allowed.filter(Boolean).includes(op.actionUrl);
  }
  return false; // the marketplace collection records no route at all
}

// ── the derivation ──────────────────────────────────────────────────────────
function actionability(op) {
  const req = requirementsFor(op);
  const blockers = blockersFor(op);
  const reasons = [];
  const missing = [];

  const hasAction = op.actionType && op.actionType !== 'investigate';
  const hasUrl = Boolean(op.actionUrl);
  const routeMatches = urlMatchesAction(op);
  const blocked = op.evidence === 'needs-browser-check';

  let status;
  if (blockers.length) {
    status = STATUS.BLOCKED;
    reasons.push(...blockers);
  } else if (hasAction && hasUrl && routeMatches && !blocked) {
    // READY means an employee can act now: a known action, a route that matches
    // it, and nothing known to prevent it.
    status = STATUS.READY;
    reasons.push(`the ${NEXT_ACTION[op.actionType].toLowerCase()} route is recorded and reachable`);
  } else if (blocked) {
    // A bot filter proves the server answered and nothing about the product, so
    // this is its own state and never READY and never dead.
    status = STATUS.NEEDS_BROWSER;
    reasons.push('the route is behind a bot filter and could not be read without a browser');
    if (!hasAction) missing.push('what action the platform supports');
    if (!hasUrl) missing.push('the action URL');
  } else {
    status = STATUS.NEEDS_RESEARCH;
    if (!hasAction) { missing.push('what action the platform supports'); reasons.push('no action type established'); }
    if (!hasUrl) { missing.push('the action URL'); reasons.push('no action URL recorded'); }
    else if (!routeMatches) { missing.push('a route matching the stated action'); reasons.push('the recorded URL does not match the stated action'); }
  }

  // Confidence is about executing SAFELY, and is explainable by construction:
  // every band lists what it is missing.
  let confidence;
  const secondaryUnknowns = [];
  if (op.cost === 'unknown') secondaryUnknowns.push('cost');
  if (req.moderation === EVIDENCE.UNKNOWN) secondaryUnknowns.push('whether a human approves it');
  if (req.difficulty === 'unknown') secondaryUnknowns.push('how much work it takes');

  if (status !== STATUS.READY) confidence = CONFIDENCE.INSUFFICIENT;
  else if (secondaryUnknowns.length === 0) confidence = CONFIDENCE.HIGH;
  else if (secondaryUnknowns.length === 1) confidence = CONFIDENCE.MEDIUM;
  else confidence = CONFIDENCE.LOW;

  const confidenceReasons = status === STATUS.READY
    ? (secondaryUnknowns.length
      ? [`the route is known; still unknown: ${secondaryUnknowns.join(', ')}`]
      : ['action, route, cost, moderation and effort are all established'])
    : [`not enough is established to act: ${missing.join(', ') || reasons[0]}`];

  const nextAction = status === STATUS.READY ? NEXT_ACTION[op.actionType]
    : status === STATUS.NEEDS_BROWSER ? 'Verify the route in a browser'
      : status === STATUS.BLOCKED ? 'No executable action available'
        : missing.includes('the action URL') ? 'Research the submission route'
          : 'Check what action the platform supports';

  return {
    status,
    statusLabel: STATUS_LABEL[status],
    confidence,
    confidenceLabel: CONFIDENCE_LABEL[confidence],
    confidenceReasons,
    nextAction,
    actionUrl: op.actionUrl,
    routeMatchesAction: routeMatches,
    blockers,
    missing,
    reasons,
    requirements: req,
    difficultyLabel: DIFFICULTY_LABEL[req.difficulty],
    publishingTimeLabel: PUBLISHING_TIME[req.publishingTime],
    // Where the operational facts came from. Nothing here is upgraded: an
    // absent fact stays UNKNOWN rather than becoming a confident default.
    evidence: {
      action: hasAction ? EVIDENCE.OBSERVABLE : EVIDENCE.UNKNOWN,
      actionUrl: hasUrl ? EVIDENCE.VERIFIED : EVIDENCE.UNKNOWN,
      cost: op.cost && op.cost !== 'unknown' ? EVIDENCE.VERIFIED : EVIDENCE.UNKNOWN,
      moderation: req.moderation === EVIDENCE.UNKNOWN ? EVIDENCE.UNKNOWN : EVIDENCE.VERIFIED,
      difficulty: req.difficulty === 'unknown' ? EVIDENCE.UNKNOWN : EVIDENCE.VERIFIED,
      publishingTime: req.publishingTime === 'unknown' ? EVIDENCE.UNKNOWN : EVIDENCE.VERIFIED,
      status: EVIDENCE.DERIVED,
      confidence: EVIDENCE.DERIVED,
    },
  };
}

// ── health, all derived ─────────────────────────────────────────────────────
function health(ops) {
  const per = (subset) => {
    const acts = subset.map((o) => ({ o, a: actionability(o) }));
    const count = (s) => acts.filter((x) => x.a.status === s).length;
    return {
      total: subset.length,
      ready: count(STATUS.READY),
      needsResearch: count(STATUS.NEEDS_RESEARCH),
      needsBrowser: count(STATUS.NEEDS_BROWSER),
      blocked: count(STATUS.BLOCKED),
      withActionUrl: subset.filter((o) => o.actionUrl).length,
      highConfidence: acts.filter((x) => x.a.confidence === CONFIDENCE.HIGH).length,
    };
  };
  const overall = per(ops);
  const rate = (n, d) => (d ? Number(((n / d) * 100).toFixed(1)) : 0);
  return {
    overall: { ...overall,
      actionabilityRate: rate(overall.ready, overall.total),
      actionUrlCoverage: rate(overall.withActionUrl, overall.total),
      highConfidenceCoverage: rate(overall.highConfidence, overall.total),
      researchDebt: overall.needsResearch + overall.needsBrowser },
    byCollection: Object.fromEntries(['directories', 'marketplaces', 'media'].map((k) => {
      const s = per(ops.filter((o) => o.sourceCollection === k));
      return [k, { ...s,
        actionabilityRate: rate(s.ready, s.total),
        actionUrlCoverage: rate(s.withActionUrl, s.total),
        highConfidenceCoverage: rate(s.highConfidence, s.total),
        researchDebt: s.needsResearch + s.needsBrowser }];
    })),
  };
}

module.exports = {
  EVIDENCE, STATUS, STATUS_LABEL, CONFIDENCE, CONFIDENCE_LABEL, NEXT_ACTION,
  DIFFICULTY_LABEL, PUBLISHING_TIME,
  actionability, requirementsFor, blockersFor, urlMatchesAction, health,
  compareStable: S.compareStable,
};
