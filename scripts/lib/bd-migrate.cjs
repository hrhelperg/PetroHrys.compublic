// scripts/lib/bd-migrate.cjs
'use strict';
const { ACCEPTS_KEYS, RELATION_KINDS } = require('./bd-schema.cjs');

// Forward-only migration from the pre-expansion record shape. It is applied by
// the registry loader, so a record written in the old shape keeps working
// without anyone hand-editing it.
//
// It only ever MOVES data. It never invents a value: anything the old shape
// could not express arrives as null and stays null.

const LEGACY_ACCEPTS = {
  acceptsStartups: 'startup',
  acceptsSaaS: 'saas',
  acceptsApps: 'mobileApp',
  acceptsAI: 'ai',
  acceptsEnterprise: 'enterprise',
  acceptsEcommerce: 'ecommerce',
  acceptsAgency: 'agency',
  acceptsFreelancer: 'freelancer',
  acceptsLocalBusiness: 'localBusiness',
  acceptsNonprofit: 'nonprofit',
  acceptsDeveloper: 'developer',
  acceptsOpenSource: 'openSource',
  acceptsMobileApp: 'mobileApp',
};

const LEGACY_SOURCE = {
  'official-url-fetch': 'official-website',
  'official-website': 'official-website',
  'official-documentation': 'official-documentation',
  'government-register': 'government-register',
  'manual-verification': 'manual-verification',
};

const isNullish = (v) => v === null || v === undefined;

function migrateRelated(record) {
  const out = {};
  const source = record.related && typeof record.related === 'object' ? record.related : {};
  for (const kind of RELATION_KINDS) {
    out[kind] = Array.isArray(source[kind]) ? [...source[kind]] : [];
  }
  return out;
}

function migrateAccepts(record) {
  if (record.accepts && typeof record.accepts === 'object' && !Array.isArray(record.accepts)) {
    const out = {};
    for (const key of ACCEPTS_KEYS) {
      out[key] = isNullish(record.accepts[key]) ? null : record.accepts[key];
    }
    return out;
  }
  const out = {};
  for (const key of ACCEPTS_KEYS) out[key] = null;
  for (const [legacy, key] of Object.entries(LEGACY_ACCEPTS)) {
    if (!isNullish(record[legacy]) && out[key] === null) out[key] = record[legacy];
  }
  // acceptsCompanies and acceptsProducts had no successor: they described the
  // listee's type too vaguely to map onto a specific audience flag. Dropping
  // them loses no information that the twelve flags do not carry better.
  return out;
}

function migrateVerification(record) {
  if (record.verification && typeof record.verification === 'object') {
    return {
      status: record.verification.status || (record.lastVerified ? 'verified' : 'unverified'),
      source: record.verification.source || null,
      reviewers: Array.isArray(record.verification.reviewers) ? record.verification.reviewers : [],
    };
  }
  return {
    status: record.lastVerified ? 'verified' : 'unverified',
    source: LEGACY_SOURCE[record.verificationMethod] || null,
    reviewers: [],
  };
}

function migrateSubmission(record) {
  if (typeof record.submissionModel === 'string') return record.submissionModel;
  // Derive from the old free/paid pair only where it is unambiguous.
  const { free, paid } = record;
  if (free === true && paid === true) return 'freemium';
  if (free === true && paid !== true) return 'free';
  if (paid === true && free !== true) return 'paid';
  return 'unknown';
}

function migrateRegistration(record) {
  if ('registrationRequired' in record) return record.registrationRequired;
  if (record.registration === 'required') return true;
  if (record.registration === 'optional') return false;
  return null;
}

// Returns a record in the current shape. Idempotent: migrating an already
// migrated record returns an equivalent record.
function migrateRecord(record) {
  const migrated = {
    id: record.id,
    name: record.name,
    slug: record.slug,
    country: record.country,
    category: record.category,
    website: record.website,
    // Official submission page where one exists and was verified. Null is not
    // "no submission route" — it means the route was not confirmed.
    submissionUrl: record.submissionUrl ?? null,
    description: record.description,
    tier: record.tier ?? null,
    scope: record.scope ?? 'unknown',

    petroHrysScore: isNullish(record.petroHrysScore) ? null : record.petroHrysScore,
    scoreFactors: record.scoreFactors ?? null,

    domainRating: isNullish(record.domainRating) ? null : record.domainRating,
    authorityScore: isNullish(record.authorityScore) ? null : record.authorityScore,
    estimatedTraffic: isNullish(record.estimatedTraffic) ? null : record.estimatedTraffic,
    referringDomains: isNullish(record.referringDomains) ? null : record.referringDomains,
    httpStatus: isNullish(record.httpStatus) ? null : record.httpStatus,
    metricStatus: record.metricStatus ?? 'unknown',
    metricsProvenance: record.metricsProvenance ?? {},

    submissionModel: migrateSubmission(record),
    registrationRequired: migrateRegistration(record),
    reviewSystem: isNullish(record.reviewSystem) ? null : record.reviewSystem,
    verificationRequired: isNullish(record.verificationRequired) ? null : record.verificationRequired,
    manualReview: isNullish(record.manualReview) ? null : record.manualReview,

    accepts: migrateAccepts(record),

    backlinkType: isNullish(record.backlinkType) ? null : record.backlinkType,
    robots: isNullish(record.robots) ? null : record.robots,
    sitemap: isNullish(record.sitemap) ? null : record.sitemap,
    indexed: isNullish(record.indexed) ? null : record.indexed,
    ssl: isNullish(record.ssl) ? null : record.ssl,

    lastVerified: record.lastVerified ?? null,
    nextVerification: record.nextVerification ?? null,
    verification: migrateVerification(record),

    related: migrateRelated(record),
    recommendedIndustries: record.recommendedIndustries ?? [],
    editorialTags: record.editorialTags ?? record.tags ?? [],
    pros: record.pros ?? [],
    cons: record.cons ?? [],
    editorNotes: record.editorNotes ?? '',
  };
  return migrated;
}

// True when the record is already in the current shape, so callers can report
// how many records a load actually had to migrate.
function isMigrated(record) {
  return !!record
    && typeof record.accepts === 'object' && !Array.isArray(record.accepts)
    && typeof record.verification === 'object'
    && 'metricStatus' in record
    && 'registrationRequired' in record
    && typeof record.related === 'object'
    && 'submissionUrl' in record;
}

module.exports = { migrateRecord, isMigrated, LEGACY_ACCEPTS, LEGACY_SOURCE };
