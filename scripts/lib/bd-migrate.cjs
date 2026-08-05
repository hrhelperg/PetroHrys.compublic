// scripts/lib/bd-migrate.cjs
'use strict';
const SCHEMA = require('./bd-schema.cjs');
const {
  ACCEPTS_KEYS, RELATION_KINDS, REQUIRED_ASSET_KEYS,
  KNOWN_RECORD_KEYS, PUBLIC_ACCESS_BOOLEANS,
} = SCHEMA;

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

// Symbol, not a string key, so it cannot collide with a record field and cannot
// be reached by anything that walks the record's own enumerable properties.
const UNKNOWN_KEYS = Symbol.for('bd.unknownKeys');

function migrateAssets(record) {
  const out = {};
  const source = record.requiredAssets && typeof record.requiredAssets === 'object'
    ? record.requiredAssets : {};
  for (const key of REQUIRED_ASSET_KEYS) {
    out[key] = key in source && source[key] !== undefined ? source[key] : null;
  }
  return out;
}

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

// --- Wave 1 foundation normalisation ----------------------------------------
// These fields are normalised IN MEMORY only. A record that does not carry them
// gets nulls here and keeps its bytes on disk, so adding the wave does not
// produce a 72-record null diff. They serialise only when a record is
// intentionally edited to populate them.

function migrateJurisdiction(record) {
  const j = record.jurisdiction;
  if (!j || typeof j !== 'object' || Array.isArray(j)) return null;
  return {
    type: j.type ?? null,
    name: j.name ?? null,
    code: j.code ?? null,
    // Carried through EXACTLY as written, including a wrong order or a repeat.
    // Migration normalises absent optional fields; it must not make invalid
    // source data valid. An unsorted covers array that arrived here sorted
    // would be reported as correct and then silently rewritten on disk, and the
    // author would never learn their record was wrong.
    covers: Array.isArray(j.covers) ? [...j.covers] : (j.covers ?? null),
    parentCountry: j.parentCountry ?? record.country ?? null,
  };
}

function migrateOperator(record) {
  const o = record.operator;
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  return { name: o.name ?? null, type: o.type ?? null, officialUrl: o.officialUrl ?? null };
}

function migratePublicAccess(record) {
  const a = record.publicAccess;
  if (!a || typeof a !== 'object' || Array.isArray(a)) return null;
  const out = { searchUrl: a.searchUrl ?? null, accessLevel: a.accessLevel ?? 'unknown' };
  for (const key of PUBLIC_ACCESS_BOOLEANS) out[key] = isNullish(a[key]) ? null : a[key];
  out.notes = a.notes ?? null;
  return out;
}

function migrateResourceIdentity(record) {
  const r = record.resourceIdentity;
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  return {
    canonicalDomain: r.canonicalDomain ?? null,
    systemKey: r.systemKey ?? null,
    sharedHostGroup: r.sharedHostGroup ?? null,
  };
}

function migrateRegistryTypes(record) {
  if (!Array.isArray(record.registryTypes)) return [];
  return [...record.registryTypes];
}

const KNOWN_KEY_SET = new Set(KNOWN_RECORD_KEYS);
const LEGACY_KEY_SET = new Set([
  ...Object.keys(LEGACY_ACCEPTS), 'verificationMethod', 'free', 'paid', 'registration', 'tags',
  'acceptsCompanies', 'acceptsProducts',
]);

// Keys the source record carried that this migration does not recognise.
// Attached NON-ENUMERABLY so the validator can reject them while they stay out
// of JSON.stringify, Object.keys and every rendered surface. Without this the
// migration would silently swallow a typo — the object literal below simply
// would not copy it — and an improvised field would vanish instead of failing.
const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// Every schema problem the migration would otherwise absorb, as
// { path, reason } with a full dotted field path. Sorted by path so two runs
// report identically.
//
// Three classes are caught:
//   1. an unknown key at the top level;
//   2. an unknown key inside a structured object — the picker would drop it;
//   3. a value of the wrong container type — the picker would coerce it away,
//      turning `registryTypes: "company-register"` into `[]` with no complaint.
function unknownKeysOf(record) {
  if (!isPlainObject(record)) return [];
  const out = [];
  const add = (path, reason) => out.push({ path, reason });

  for (const key of Object.keys(record)) {
    if (!KNOWN_KEY_SET.has(key) && !LEGACY_KEY_SET.has(key)) {
      add(key, `Unknown field "${key}". Records may only carry declared schema fields.`);
    }
  }

  for (const field of SCHEMA.OBJECT_VALUED_FIELDS) {
    const value = record[field];
    if (isNullish(value)) continue;
    if (!isPlainObject(value)) {
      add(field, `Field "${field}" must be an object, got ${Array.isArray(value) ? 'an array' : typeof value}.`);
      continue;
    }
    if (field === 'metricsProvenance') {
      for (const [metric, entry] of Object.entries(value)) {
        if (!isPlainObject(entry)) {
          add(`metricsProvenance.${metric}`, 'Each provenance entry must be an object.');
          continue;
        }
        for (const key of Object.keys(entry)) {
          if (!SCHEMA.METRIC_PROVENANCE_KEYS.includes(key)) {
            add(`metricsProvenance.${metric}.${key}`,
              `Unknown provenance field "${key}". Allowed: ${SCHEMA.METRIC_PROVENANCE_KEYS.join(', ')}.`);
          }
        }
      }
      continue;
    }
    const allowed = SCHEMA.NESTED_RECORD_KEYS[field];
    if (!allowed) continue;
    for (const key of Object.keys(value)) {
      if (!allowed.includes(key)) {
        add(`${field}.${key}`,
          `Unknown field "${field}.${key}". Allowed: ${allowed.join(', ')}.`);
      }
    }
  }

  for (const field of SCHEMA.ARRAY_VALUED_FIELDS) {
    const value = record[field];
    if (isNullish(value)) continue;
    if (!Array.isArray(value)) {
      add(field, `Field "${field}" must be an array, got ${typeof value}.`);
    }
  }

  out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return out;
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

    // Names. `officialName` falls back to `name`, so the display resolver
    // returns exactly the string it returned before this wave existed.
    officialName: record.officialName ?? record.name ?? null,
    nativeName: record.nativeName ?? null,
    englishName: record.englishName ?? null,
    englishNameSource: record.englishNameSource ?? null,

    jurisdiction: migrateJurisdiction(record),
    resourceIdentity: migrateResourceIdentity(record),
    primaryRegistryType: record.primaryRegistryType ?? null,
    registryTypes: migrateRegistryTypes(record),
    operator: migrateOperator(record),
    publicAccess: migratePublicAccess(record),

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
    // Editorial depth. Judgements (bestFor, difficulty, quality) are the
    // reviewer's; facts (approval time, review process, required assets) stay
    // null unless a submission page was actually read.
    bestFor: record.bestFor ?? [],
    notRecommendedFor: record.notRecommendedFor ?? [],
    submissionDifficulty: record.submissionDifficulty ?? null,
    listingQuality: record.listingQuality ?? null,
    typicalApprovalTime: record.typicalApprovalTime ?? null,
    reviewProcess: record.reviewProcess ?? null,
    commonMistakes: record.commonMistakes ?? [],
    preparationChecklist: record.preparationChecklist ?? [],
    requiredAssets: migrateAssets(record),
    recommendedIndustries: record.recommendedIndustries ?? [],
    editorialTags: record.editorialTags ?? record.tags ?? [],
    pros: record.pros ?? [],
    cons: record.cons ?? [],
    editorNotes: record.editorNotes ?? '',
  };
  Object.defineProperty(migrated, UNKNOWN_KEYS, {
    value: unknownKeysOf(record), enumerable: false, writable: false, configurable: false,
  });
  return migrated;
}

// --- serialisation ----------------------------------------------------------
// migrateRecord() returns the FULL normalised shape, which is what the renderer
// and validator want in memory. Writing that shape to disk would stamp a block
// of nulls onto all 72 records that predate the Wave 1 foundation — a
// repository-wide diff that says nothing and buries the records a reviewer
// actually changed.
//
// So a field added by that wave is written only when it carries information.
// `officialName` is the special case: it normalises to `name`, so storing it
// would duplicate a string already on the record.
const WAVE1_DEFAULTED = {
  officialName: (v, rec) => v === null || v === rec.name,
  nativeName: (v) => v === null,
  englishName: (v) => v === null,
  englishNameSource: (v) => v === null,
  jurisdiction: (v) => v === null,
  resourceIdentity: (v) => v === null,
  primaryRegistryType: (v) => v === null,
  registryTypes: (v) => Array.isArray(v) && v.length === 0,
  operator: (v) => v === null,
  publicAccess: (v) => v === null,
};

// Defaults NESTED inside an object field. `covers` is null on every
// single-subdivision jurisdiction, which is all 46 of them: writing it out
// would add a null to every subnational record on disk for no information at
// all. Round-trip still holds — migrateJurisdiction reads an absent covers back
// as null.
const NESTED_DEFAULTED = {
  jurisdiction: { covers: (v) => v === null || v === undefined },
};

// The on-disk projection of a normalised record. Round-trips: migrating the
// output of this function reproduces the same normalised record.
function serialisableRecord(record) {
  const out = {};
  for (const [key, value] of Object.entries(record)) {
    const isDefaulted = WAVE1_DEFAULTED[key];
    if (isDefaulted && isDefaulted(value, record)) continue;
    const nested = NESTED_DEFAULTED[key];
    if (nested && value && typeof value === 'object' && !Array.isArray(value)) {
      const inner = {};
      for (const [k, v] of Object.entries(value)) {
        const drop = nested[k];
        if (drop && drop(v)) continue;
        inner[k] = v;
      }
      out[key] = inner;
      continue;
    }
    out[key] = value;
  }
  return out;
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
    && 'submissionUrl' in record
    && 'requiredAssets' in record;
}

module.exports = {
  migrateRecord, isMigrated, LEGACY_ACCEPTS, LEGACY_SOURCE,
  UNKNOWN_KEYS, unknownKeysOf, serialisableRecord, WAVE1_DEFAULTED,
};
