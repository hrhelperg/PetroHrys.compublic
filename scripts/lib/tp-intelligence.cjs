'use strict';

// Procurement Intelligence v1 — a DERIVED layer over the canonical dataset.
//
// Nothing in this module is stored. Every value is computed from facts already
// in data/tenders-procurement/platforms.json, which is why Intelligence v1 adds
// zero fields to the schema and changes zero records. If a fact is not in the
// dataset, the answer here is "unknown" — never a guess that makes a ranking
// look complete.
//
// ── WHAT THE AUDIT FOUND, AND WHY THE DESIGN LOOKS LIKE THIS ────────────────
//
// The dataset records, per platform: four lifecycle routes (search, register,
// documents, submit), whether electronic submission exists, whether foreign
// suppliers are accepted, an evidence class, whether a browser check is still
// needed, the procurement scope, the platform type, and the procurement
// instruments carried (tender, RFP, RFQ, framework-agreement, DPS...).
//
// It records NO INDUSTRY. `opportunityTypes` is instruments, not sectors, and
// the nineteen `sector-procurement` records name their sector only inside a
// free-text platform name. Inferring "this is a telecom platform" from a name
// or from prose in an evidence note is exactly the fabrication the collection
// exists to avoid.
//
// So industry fit is NOT claimed as a property of any platform. What the
// recommendation layer does instead is documented and honest: for a given
// supplier type it ranks GENERAL-PURPOSE systems by the capabilities that
// supplier actually needs — a SaaS vendor cares whether framework agreements
// and dynamic purchasing systems are recorded, because that is how software is
// bought; a construction firm cares whether tender documents can be reached,
// because drawings live there. Those are canonical facts. The mapping from
// supplier type to which facts matter is EDITORIAL, is labelled EDITORIAL
// everywhere it surfaces, and never asserts that a platform specialises in a
// sector.
//
// ── THE TWO SCORES ARE DIFFERENT QUESTIONS ─────────────────────────────────
//
// UTILITY  — "how strong and actionable is this procurement source?"
// FIT      — "how relevant is this source to this supplier and objective?"
//
// They are deliberately not the same number. A national platform with modest
// evidence can be the single most relevant source for a supplier targeting that
// country, and a superbly documented multilateral bank can be irrelevant to a
// local SME. Collapsing them would produce a ranking that is confident and
// useless.

const EVIDENCE = { A: 'VERIFIED', B: 'OBSERVABLE', C: 'DERIVED', unknown: 'UNKNOWN' };

// A record is scored only when its own evidence is established. Fourteen
// records carry evidenceClass "unknown"; scoring them would dress a research
// gap as a measurement.
const SCORABLE_EVIDENCE = new Set(['A', 'B', 'C']);

const has = (r, f) => Boolean(r && r[f]);

// ── capability derivation ───────────────────────────────────────────────────

function capabilities(r) {
  return {
    discovery: has(r, 'tenderSearchUrl'),
    registration: has(r, 'supplierRegistrationUrl'),
    documents: has(r, 'documentsUrl'),
    submission: has(r, 'submissionUrl'),
  };
}

// What a supplier can actually DO, from established routes only. A homepage is
// not an action: a record with no verified route yields MONITOR_ONLY, which is
// honest — you can watch the site, and we have not established more.
function supplierActions(r) {
  const c = capabilities(r);
  const out = [];
  if (c.discovery) out.push('SEARCH');
  if (c.registration) out.push('REGISTER');
  if (c.documents) out.push('DOWNLOAD_DOCUMENTS');
  if (c.submission && r.electronicSubmission === 'yes') out.push('SUBMIT_ELECTRONICALLY');
  else if (c.submission) out.push('SUBMIT');
  if (!out.length) out.push('MONITOR_ONLY');
  if (r.browserCheckRequired) out.push('REQUIRES_BROWSER_CHECK');
  return out;
}

// The operating model. Derived from routes plus the record's own declared
// procurement nature, never from marketing language.
function procurementModel(r) {
  const c = capabilities(r);
  const nature = natureOf(r);
  if (r.partOf) return 'authorized-marketplace-or-tenant';
  if (nature === 'Project-financed') return 'project-financed-surface';
  if (nature === 'Corporate') {
    return c.submission ? 'corporate-procurement-transactional' : 'corporate-procurement-surface';
  }
  if (c.submission && r.electronicSubmission === 'yes') return 'full-electronic-procurement';
  if (c.submission) return 'discovery-plus-submission';
  if (c.discovery && c.documents) return 'discovery-plus-documents';
  if (c.discovery && c.registration) return 'discovery-plus-registration';
  if (c.discovery) return 'discovery-only';
  if (c.registration) return 'registration-system';
  return 'unknown';
}

// The nature statement Wave T4 wrote into limitations. Read, never guessed.
function natureOf(r) {
  const m = (r.limitations || [])
    .map((l) => /^(Project-financed|Corporate|Consulting)/.exec(l)).find(Boolean);
  return m ? m[1] : null;
}

// Foreign eligibility is a three-state fact with consequences, so it gets its
// own vocabulary rather than being folded into a score. "Unknown" is never
// rendered as a negative; it is rendered as unverified.
function foreignEligibilityState(r) {
  if (r.foreignSuppliersAccepted === 'yes') return 'VERIFIED_ACCEPTED';
  if (r.foreignSuppliersAccepted === 'no') return 'RESTRICTED';
  return 'NOT_VERIFIED';
}

function browserCheckState(r) {
  if (!r.browserCheckRequired) return 'NOT_REQUIRED';
  const note = `${r.evidenceNote || ''} ${(r.limitations || []).join(' ')}`.toLowerCase();
  if (/cloudflare|just a moment|attention required/.test(note)) return 'BOT_PROTECTION';
  if (/waf|403|forbidden/.test(note)) return 'WAF';
  if (/cookie/.test(note)) return 'COOKIE_GATE';
  if (/shell|client-rendered|javascript|angular|spa\b/.test(note)) return 'SCRIPT_RENDERED';
  if (/timeout|timed out|connection|tls|dns/.test(note)) return 'TRANSPORT_FAILURE';
  return 'UNSPECIFIED';
}

// ── utility score ───────────────────────────────────────────────────────────
//
// Six dimensions over canonical facts. Weights are stated here and nowhere
// else; there are no adjustments, no per-platform constants and no tie-breaks
// that name a platform.
//
// browserCheckRequired deliberately costs only inside CERTAINTY, and only
// partially. It is a research state — "we could not open this without a
// browser" — not a defect in the platform, and a system behind Cloudflare is
// not a worse procurement system than one that is not.
const WEIGHTS = {
  discoverability: 25,   // can a supplier find opportunities at all
  onboarding: 15,        // is the registration path established
  submission: 20,        // can a bid actually be lodged
  certainty: 20,         // how well established are these facts
  accessibility: 10,     // free search, verified foreign access
  reach: 10,             // how much procurement the platform covers
};

function dimensionScores(r) {
  const c = capabilities(r);

  let discoverability = 0;
  if (c.discovery) discoverability += 0.75;
  if (r.searchAccess === 'free') discoverability += 0.25;
  else if (r.searchAccess === 'mixed') discoverability += 0.10;

  let onboarding = 0;
  if (c.registration) onboarding += 0.7;
  if (r.supplierRegistrationRequired && r.supplierRegistrationRequired !== 'unknown') {
    onboarding += 0.3; // knowing registration is NOT required is also clarity
  }

  let submission = 0;
  if (c.submission) submission += 0.6;
  if (r.electronicSubmission === 'yes') submission += 0.4;
  else if (r.electronicSubmission === 'no') submission += 0.1; // established, just not electronic

  let certainty = 0;
  if (r.evidenceClass === 'A') certainty += 0.7;
  else if (r.evidenceClass === 'B') certainty += 0.5;
  else if (r.evidenceClass === 'C') certainty += 0.3;
  if (!r.browserCheckRequired) certainty += 0.3;
  else certainty += 0.1; // a pending browser check is uncertainty, not failure

  let accessibility = 0;
  if (r.searchAccess === 'free') accessibility += 0.5;
  if (r.foreignSuppliersAccepted === 'yes') accessibility += 0.5;
  else if (r.foreignSuppliersAccepted === 'no') accessibility += 0; // established restriction

  const REACH = {
    supranational: 1.0, national: 0.8, regional: 0.55, municipal: 0.35, institutional: 0.5,
  };
  const reach = REACH[r.coverage] ?? 0.4;

  return {
    discoverability: Math.min(1, discoverability),
    onboarding: Math.min(1, onboarding),
    submission: Math.min(1, submission),
    certainty: Math.min(1, certainty),
    accessibility: Math.min(1, accessibility),
    reach,
  };
}

function utilityScore(r) {
  if (!SCORABLE_EVIDENCE.has(r.evidenceClass)) return null; // evidence floor
  const d = dimensionScores(r);
  let total = 0;
  for (const [k, w] of Object.entries(WEIGHTS)) total += d[k] * w;
  return Math.round(total);
}

// Bands are set after inspecting the real distribution; see the docs.
function band(score) {
  if (score === null) return 'NOT_YET_SCORED';
  if (score >= 80) return 'EXCEPTIONAL';
  if (score >= 65) return 'STRONG';
  if (score >= 50) return 'GOOD';
  if (score >= 35) return 'MODERATE';
  return 'LIMITED';
}

// ── supplier profiles ───────────────────────────────────────────────────────
//
// EDITORIAL, and labelled as such wherever it surfaces. Each profile says which
// CANONICAL facts matter to that supplier and why. No profile asserts that a
// platform specialises in an industry, because the dataset does not record that.
const PROFILES = {
  'foreign-supplier': {
    label: 'Foreign supplier',
    rationale: 'Ranks on verified foreign eligibility first, then on whether a supplier can '
      + 'actually register and submit from abroad. Platforms whose eligibility is unverified are '
      + 'shown, clearly marked, and never presented as foreign-friendly.',
    weights: { foreignVerified: 45, submission: 20, registration: 15, discovery: 10, reach: 10 },
  },
  'eu-company': {
    label: 'EU company',
    rationale: 'Combines EU-level and EU national systems with multilateral systems an EU '
      + 'supplier can reach. Geography is relevance, not eligibility: an EU platform does not '
      + 'confer verified eligibility, and the two are scored separately.',
    weights: { euRelevance: 40, discovery: 20, submission: 20, certainty: 20 },
  },
  'it-software': {
    label: 'IT / software company',
    rationale: 'Software is usually bought through framework agreements and dynamic purchasing '
      + 'systems rather than one-off works tenders, so systems recording those instruments rank '
      + 'higher. This is an instrument fact from the dataset, not a claim that the platform '
      + 'specialises in IT.',
    weights: { frameworkInstruments: 35, submission: 25, discovery: 20, reach: 20 },
  },
  'b2b-saas': {
    label: 'B2B SaaS company',
    rationale: 'As IT/software, but weighted further toward electronic submission and catalogue '
      + 'style instruments, since subscription software is rarely procured on paper.',
    weights: { frameworkInstruments: 30, electronicSubmission: 30, discovery: 20, reach: 20 },
  },
  telecom: {
    label: 'Telecom / VoIP / UCaaS',
    rationale: 'Weighted toward framework agreements and toward institutional and utility buyers, '
      + 'which is where communications services are typically contracted. The dataset does not '
      + 'record sector specialisation and none is claimed.',
    weights: { frameworkInstruments: 30, institutionalReach: 25, submission: 25, discovery: 20 },
  },
  manufacturer: {
    label: 'Manufacturer',
    rationale: 'Weighted toward goods instruments, cross-border reach and verified foreign '
      + 'eligibility, because manufacturing supply is frequently cross-border.',
    weights: { goodsInstruments: 30, foreignVerified: 25, discovery: 25, reach: 20 },
  },
  'industrial-supplier': {
    label: 'Industrial supplier',
    rationale: 'As manufacturer, with more weight on registration, since industrial supply often '
      + 'runs through qualified-supplier registers.',
    weights: { goodsInstruments: 25, registration: 30, discovery: 25, reach: 20 },
  },
  construction: {
    label: 'Construction company',
    rationale: 'Weighted toward established document routes — drawings and bills of quantities '
      + 'live there — and toward national and regional systems, where public works are tendered.',
    weights: { documents: 35, nationalRegionalReach: 30, discovery: 20, submission: 15 },
  },
  infrastructure: {
    label: 'Infrastructure contractor',
    rationale: 'As construction, with weight on project-financed surfaces, since large '
      + 'infrastructure is frequently funded by development banks.',
    weights: { documents: 25, projectFinanced: 30, discovery: 25, reach: 20 },
  },
  engineering: {
    label: 'Engineering company',
    rationale: 'Weighted toward consulting instruments — expressions of interest and RFPs — which '
      + 'is how engineering services are commonly procured.',
    weights: { consultingInstruments: 35, documents: 25, discovery: 20, reach: 20 },
  },
  'professional-services': {
    label: 'Professional services / consulting',
    rationale: 'Weighted toward consulting instruments and toward institutional and multilateral '
      + 'buyers, which procure advisory work heavily.',
    weights: { consultingInstruments: 40, institutionalReach: 25, discovery: 20, certainty: 15 },
  },
  logistics: {
    label: 'Logistics / freight',
    rationale: 'Weighted toward framework agreements and cross-border reach, since transport is '
      + 'usually contracted as a standing arrangement across jurisdictions.',
    weights: { frameworkInstruments: 30, reach: 30, discovery: 25, submission: 15 },
  },
  energy: {
    label: 'Energy / utilities supplier',
    rationale: 'Weighted toward utility and institutional buyers and toward established document '
      + 'routes, given the technical specification volume in energy tendering.',
    weights: { institutionalReach: 35, documents: 25, discovery: 20, submission: 20 },
  },
  healthcare: {
    label: 'Healthcare / medical supplier',
    rationale: 'Weighted toward goods instruments and toward institutional and multilateral '
      + 'buyers, which run large medical supply programmes.',
    weights: { goodsInstruments: 30, institutionalReach: 30, discovery: 20, submission: 20 },
  },
  'local-sme': {
    label: 'Local SME',
    rationale: 'Weighted toward national, regional and municipal systems with free search and a '
      + 'clear registration path. Multilateral systems rank low here by design, not by defect.',
    weights: { localReach: 40, registration: 25, freeSearch: 20, discovery: 15 },
  },
  exporter: {
    label: 'International exporter',
    rationale: 'Weighted toward verified foreign eligibility and supranational reach — the two '
      + 'facts that determine whether an exporter can participate at all.',
    weights: { foreignVerified: 40, reach: 30, submission: 15, discovery: 15 },
  },
};

// Instrument families, read from canonical opportunityTypes.
const FRAMEWORK_INSTRUMENTS = ['framework-agreement', 'dynamic-purchasing-system'];
const CONSULTING_INSTRUMENTS = ['eoi', 'rfp', 'rfi'];
const GOODS_INSTRUMENTS = ['rfq', 'tender', 'electronic-auction'];

const EU_SLUGS = new Set(['european-union']);

function fitSignals(r, euCountrySlugs) {
  const c = capabilities(r);
  const ot = new Set(r.opportunityTypes || []);
  const anyOf = (list) => list.some((t) => ot.has(t));
  return {
    foreignVerified: r.foreignSuppliersAccepted === 'yes' ? 1 : 0,
    discovery: c.discovery ? 1 : 0,
    registration: c.registration ? 1 : 0,
    documents: c.documents ? 1 : 0,
    submission: c.submission ? 1 : 0,
    electronicSubmission: r.electronicSubmission === 'yes' ? 1 : 0,
    certainty: r.evidenceClass === 'A' ? 1 : r.evidenceClass === 'B' ? 0.6 : 0.3,
    freeSearch: r.searchAccess === 'free' ? 1 : 0,
    frameworkInstruments: anyOf(FRAMEWORK_INSTRUMENTS) ? 1 : 0,
    consultingInstruments: anyOf(CONSULTING_INSTRUMENTS) ? 1 : 0,
    goodsInstruments: anyOf(GOODS_INSTRUMENTS) ? 1 : 0,
    projectFinanced: natureOf(r) === 'Project-financed' ? 1 : 0,
    reach: r.coverage === 'supranational' ? 1 : r.coverage === 'national' ? 0.75 : 0.5,
    localReach: ['national', 'regional', 'municipal'].includes(r.coverage) ? 1 : 0,
    nationalRegionalReach: ['national', 'regional'].includes(r.coverage) ? 1 : 0,
    institutionalReach: ['institutional', 'supranational'].includes(r.coverage) ? 1 : 0,
    euRelevance: EU_SLUGS.has(r.country) ? 1 : (euCountrySlugs.has(r.country) ? 0.8 : 0.2),
  };
}

// Fit is 0-100 and is NOT the utility score. Reasons are emitted alongside so no
// ranking is ever unexplained.
function fitFor(r, profileKey, euCountrySlugs) {
  const p = PROFILES[profileKey];
  if (!p) throw new Error(`unknown profile: ${profileKey}`);
  const s = fitSignals(r, euCountrySlugs);
  let total = 0;
  const reasons = [];
  for (const [signal, weight] of Object.entries(p.weights)) {
    const v = s[signal] ?? 0;
    total += v * weight;
    if (v >= 0.75) reasons.push(REASONS[signal] || signal);
  }
  return { fit: Math.round(total), reasons };
}

const REASONS = {
  foreignVerified: 'foreign supplier eligibility is verified by the operator',
  discovery: 'a tender search route is established',
  registration: 'a supplier registration route is established',
  documents: 'tender documents can be reached through an established route',
  submission: 'a bid submission route is established',
  electronicSubmission: 'electronic submission is established',
  certainty: 'the record rests on operator or directly observed evidence',
  freeSearch: 'opportunity search is free',
  frameworkInstruments: 'framework agreements or dynamic purchasing systems are recorded',
  consultingInstruments: 'expressions of interest or RFPs are recorded',
  goodsInstruments: 'goods instruments (RFQ, tender, auction) are recorded',
  projectFinanced: 'publishes project-financed opportunities',
  reach: 'wide procurement reach',
  localReach: 'covers national, regional or municipal procurement',
  nationalRegionalReach: 'covers national or regional procurement',
  institutionalReach: 'institutional or supranational buyer',
  euRelevance: 'EU-level or EU national procurement',
};

// ── the intelligence record ─────────────────────────────────────────────────

function intelligenceFor(r) {
  const score = utilityScore(r);
  return {
    id: r.id,
    utilityScore: score,
    band: band(score),
    scored: score !== null,
    model: procurementModel(r),
    actions: supplierActions(r),
    capabilities: capabilities(r),
    foreignEligibility: foreignEligibilityState(r),
    electronicSubmission: r.electronicSubmission || 'unknown',
    browserCheck: browserCheckState(r),
    evidence: EVIDENCE[r.evidenceClass] || 'UNKNOWN',
    dimensions: SCORABLE_EVIDENCE.has(r.evidenceClass) ? dimensionScores(r) : null,
  };
}

function rank(records, profileKey, euCountrySlugs, { limit = 10, filter = null } = {}) {
  const pool = filter ? records.filter(filter) : records;
  return pool
    .map((r) => {
      const intel = intelligenceFor(r);
      const { fit, reasons } = fitFor(r, profileKey, euCountrySlugs);
      return { record: r, intel, fit, reasons };
    })
    // Fit orders the list; utility breaks ties. A record with no utility score is
    // ranked last within its fit level rather than dropped, because "not yet
    // scored" is a research state and hiding it would misrepresent coverage.
    .sort((a, b) => b.fit - a.fit
      || (b.intel.utilityScore ?? -1) - (a.intel.utilityScore ?? -1)
      || (a.record.id < b.record.id ? -1 : 1))
    .slice(0, limit);
}

module.exports = {
  EVIDENCE, WEIGHTS, PROFILES, SCORABLE_EVIDENCE,
  FRAMEWORK_INSTRUMENTS, CONSULTING_INSTRUMENTS, GOODS_INSTRUMENTS, REASONS,
  capabilities, supplierActions, procurementModel, natureOf,
  foreignEligibilityState, browserCheckState,
  dimensionScores, utilityScore, band, fitSignals, fitFor,
  intelligenceFor, rank,
};
