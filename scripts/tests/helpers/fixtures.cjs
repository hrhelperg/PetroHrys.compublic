// scripts/tests/helpers/fixtures.cjs
'use strict';
const { ACCEPTS_KEYS, SCORE_FACTORS, RELATION_KINDS, REQUIRED_ASSET_KEYS, computeScore } =
  require('../../lib/bd-schema.cjs');

// The single definition of a valid directory record for tests. Every suite
// builds from here, so a schema change is a one-file edit rather than a hunt
// through six test files.

function accepts(overrides = {}) {
  const out = {};
  for (const key of ACCEPTS_KEYS) out[key] = key in overrides ? overrides[key] : null;
  return out;
}

// Flat factors that produce a known score, so tests can assert on it.
function factors(value = 5) {
  return Object.fromEntries(SCORE_FACTORS.map((f) => [f.key, value]));
}

// A minimal record that passes validation: verified, no metrics, no score.
function directoryRecord(overrides = {}) {
  const base = {
    id: 'us-example',
    name: 'Example Directory',
    slug: 'example-directory',
    country: 'united-states',
    category: 'saas',
    website: 'https://example.com',
    submissionUrl: null,
    description: 'A directory.',
    tier: 'tier1',
    scope: 'national',

    // Wave 1 foundation fields, in their normalised "not established" state.
    // The fixture mirrors what bd-migrate produces, so a test that validates a
    // fixture directly exercises the same shape the loader hands the validator.
    officialName: 'Example Directory',
    nativeName: null,
    englishName: null,
    englishNameSource: null,
    jurisdiction: null,
    primaryRegistryType: null,
    registryTypes: [],
    operator: null,
    publicAccess: null,

    petroHrysScore: null,
    scoreFactors: null,

    domainRating: null,
    authorityScore: null,
    estimatedTraffic: null,
    referringDomains: null,
    httpStatus: null,
    metricStatus: 'unknown',
    metricsProvenance: {},

    submissionModel: 'unknown',
    registrationRequired: null,
    reviewSystem: null,
    verificationRequired: null,
    manualReview: null,

    accepts: accepts(),

    backlinkType: null,
    robots: null,
    sitemap: null,
    indexed: null,
    ssl: null,

    lastVerified: null,
    nextVerification: null,
    verification: { status: 'unverified', source: null, reviewers: [] },

    bestFor: [],
    notRecommendedFor: [],
    submissionDifficulty: null,
    listingQuality: null,
    typicalApprovalTime: null,
    reviewProcess: null,
    commonMistakes: [],
    preparationChecklist: [],
    requiredAssets: Object.fromEntries(REQUIRED_ASSET_KEYS.map((k) => [k, null])),

    related: Object.fromEntries(RELATION_KINDS.map((k) => [k, []])),
    recommendedIndustries: [],
    editorialTags: [],
    pros: [],
    cons: [],
    editorNotes: '',
  };

  const record = { ...base, ...overrides };
  if (overrides.accepts) record.accepts = accepts(overrides.accepts);
  // Mirror bd-migrate: officialName follows name unless a test sets it
  // explicitly. Pinning it to the base name would make every fixture display
  // the same title and silently defeat any ordering test.
  if (!('officialName' in overrides)) record.officialName = record.name;
  return record;
}

// A record with a verification date, a reviewer, and a computed score.
function verifiedRecord(overrides = {}) {
  const f = overrides.scoreFactors || factors(5);
  return directoryRecord({
    lastVerified: '2026-08-01',
    nextVerification: '2027-08-01',
    verification: {
      status: 'verified',
      source: 'official-website',
      reviewers: [{ id: 'petro-hrys', name: 'Petro Hrys', role: 'editor' }],
    },
    scoreFactors: f,
    petroHrysScore: computeScore(f),
    ...overrides,
  });
}

module.exports = { directoryRecord, verifiedRecord, accepts, factors };
