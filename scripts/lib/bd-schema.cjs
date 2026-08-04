// scripts/lib/bd-schema.cjs
'use strict';

// The single declaration of what a directory record is. The validator, the
// migration, the renderer and the tests all read this file, so a field can
// never be added in one place and forgotten in another.

// --- enumerations -----------------------------------------------------------

const TIERS = ['tier1', 'tier2', 'tier3'];
const BACKLINK_TYPES = ['dofollow', 'nofollow', 'sponsored', 'ugc', 'mixed', 'none'];
const ROBOTS_STATES = ['allowed', 'disallowed', 'partial', 'unknown'];
// `notApplicable` is not a fourth pricing tier. It records that the directory has
// no submission route at all: the entry exists because of incorporation,
// registration, filing or another statutory process. It is therefore never
// counted as free, paid, freemium, or as an unanswered question.
const SUBMISSION_MODELS = ['free', 'paid', 'freemium', 'notApplicable', 'unknown'];

const SUBMISSION_MODEL_LABELS = {
  free: 'Free to submit',
  paid: 'Paid submission',
  freemium: 'Free and paid tiers',
  notApplicable: 'Not a submission target',
  unknown: 'Submission model unknown',
};

const SUBMISSION_NOT_APPLICABLE_NOTE = 'Records are created through incorporation, '
  + 'registration, filing, or statutory processes.';

// Models that describe an optional submission a business can choose to make.
// `notApplicable` is excluded: there is nothing to submit.
const SUBMITTABLE_MODELS = ['free', 'paid', 'freemium'];
const METRIC_STATUSES = ['unknown', 'verified', 'measured'];
const VERIFICATION_STATUSES = ['verified', 'unverified', 'pending'];
const VERIFICATION_SOURCES = [
  'official-website',
  'official-documentation',
  'government-register',
  'manual-verification',
  'other',
];

// --- accepts ----------------------------------------------------------------
// One object, twelve tri-state flags. Replaces the six loose acceptsX columns.
// `null` means "not established" and renders as Unknown; it is never inferred.

const ACCEPTS_KEYS = [
  'startup', 'saas', 'enterprise', 'agency', 'freelancer', 'localBusiness',
  'developer', 'openSource', 'nonprofit', 'ai', 'mobileApp', 'ecommerce',
];

const ACCEPTS_LABELS = {
  startup: 'Startups',
  saas: 'SaaS products',
  enterprise: 'Enterprises',
  agency: 'Agencies',
  freelancer: 'Freelancers',
  localBusiness: 'Local businesses',
  developer: 'Developer tools',
  openSource: 'Open-source projects',
  nonprofit: 'Non-profits',
  ai: 'AI products',
  mobileApp: 'Mobile apps',
  ecommerce: 'Ecommerce stores',
};

// --- metrics ----------------------------------------------------------------

// --- third-party metric provenance ------------------------------------------
// A metric value is meaningless without knowing who produced it and when. This
// site is statically generated and never calls an API at request time, so every
// value it shows is a dated historical snapshot, never a live reading. The
// status is stored explicitly so the page can say so rather than implying
// currency by omission.
const METRIC_SNAPSHOT_STATUS = 'historicalSnapshot';
const METRIC_PROVIDERS = ['Ahrefs'];
// Ahrefs Domain Rating is a 0-100 logarithmic scale.
const DOMAIN_RATING_RANGE = { min: 0, max: 100 };
// Required by the Ahrefs Domain Rating licence wherever a value is displayed.
const AHREFS_ATTRIBUTION = { text: 'Domain Rating by Ahrefs', href: 'https://ahrefs.com/' };

// --- open-source data policy ------------------------------------------------
// The Research Center collects no metric that needs a paid account, an API
// subscription or a mandatory credential. The Domain Ratings already in the
// dataset stay exactly as they were measured, as dated historical snapshots; no
// new ones are collected. A record without one is therefore not a record with a
// low rating, and must never render as 0 — hence an explicit label rather than a
// bare dash, and an explicit sentence on every page that shows the column.
const DR_COLLECTION_FROZEN = true;
const DR_NOT_MEASURED_LABEL = 'Not measured';
const DR_SNAPSHOT_POLICY_NOTE = 'Domain Rating values are dated historical Ahrefs snapshots. '
  + 'New measurements are not collected because the Research Center does not depend on mandatory '
  + 'authenticated APIs.';

// One deterministic domain policy. A Domain Rating describes the registrable
// domain that was measured, not a path or subdomain on it: measuring
// appsource.microsoft.com and labelling the result as "AppSource's rating" would
// claim something the number does not say. Callers record the normalised domain
// alongside the value so the page can name exactly what was measured.
function normaliseDomain(input) {
  if (typeof input !== 'string' || !input.trim()) return null;
  let host;
  try {
    host = new URL(input.includes('://') ? input : `https://${input.trim()}`).hostname;
  } catch {
    return null;
  }
  host = host.toLowerCase().replace(/\.$/, '');
  if (host.startsWith('www.')) host = host.slice(4);
  if (!host.includes('.') || /\s/.test(host)) return null;
  return host;
}

const SCORE_FIELDS = ['domainRating', 'authorityScore'];
const COUNT_FIELDS = ['estimatedTraffic', 'referringDomains', 'httpStatus'];
const THIRD_PARTY_METRICS = ['domainRating', 'authorityScore', 'estimatedTraffic', 'referringDomains'];
const NUMERIC_METRICS = [...SCORE_FIELDS, ...COUNT_FIELDS];

// --- PetroHrys Score --------------------------------------------------------
// Ten editorial factors, each scored 0-10 by a human reviewer. Weights total
// exactly 100. The published score is the weighted sum, so it is reproducible
// and the validator re-computes it rather than trusting the stored number.

// `definition` states what the reviewer weighed, in the reviewer's own terms. It
// is deliberately not a scoring rubric: no band, threshold or formula maps a
// record onto a value, because none was ever written down. Every factor is a
// human judgement from 0 to 10, and the definitions describe the question asked,
// not a mechanical test. This array is the only source of factor wording — every
// guide and page renders from it, so prose can never name a factor that does not
// exist here.
const SCORE_FACTORS = [
  { key: 'editorialTrust', weight: 15, label: 'Editorial trust',
    definition: 'How far the entries a directory publishes can be relied on as accurate.' },
  { key: 'businessUsefulness', weight: 15, label: 'Business usefulness',
    definition: 'How much practical use a listing there is to the business being listed.' },
  { key: 'verificationQuality', weight: 12, label: 'Verification quality',
    definition: 'How thoroughly the directory establishes that an entry is genuine before publishing it.' },
  { key: 'platformReputation', weight: 10, label: 'Platform reputation',
    definition: 'How the platform is regarded in its field. Deliberately not a popularity, traffic or recognition measure.' },
  { key: 'spamResistance', weight: 10, label: 'Spam resistance',
    definition: 'How well the directory keeps low-quality and promotional entries out.' },
  { key: 'industryImportance', weight: 10, label: 'Industry importance',
    definition: 'How central the directory is to its sector, independently of how useful one listing is.' },
  { key: 'longTermStability', weight: 10, label: 'Long-term stability',
    definition: 'How likely the directory is to still exist, and to still carry the entry, years from now.' },
  { key: 'submissionQuality', weight: 8, label: 'Submission quality',
    definition: 'What the submission process asks for and how workable it is for the business submitting.' },
  { key: 'transparency', weight: 5, label: 'Transparency',
    definition: 'How openly the directory states its rules, costs and criteria.' },
  { key: 'moderationQuality', weight: 5, label: 'Moderation quality',
    definition: 'How the directory maintains entries after publication.' },
];

// Published alongside the definitions. Records what the numbers are and, more
// importantly, what they are not — the factors were scored by one reviewer
// against no written rubric, so they must never be read as a measured quantity.
const SCORE_METHOD_NOTE = 'Each factor is scored from 0 to 10 by a human reviewer and '
  + 'weighted as shown. The definitions describe what was weighed, not a rubric: no '
  + 'threshold or formula maps a directory onto a value, and two reviewers could reach '
  + 'different numbers. The score is reproducible from the factors shown on every '
  + 'record, but it is an editorial judgement, not a measurement.';

const SCORE_WEIGHT_TOTAL = SCORE_FACTORS.reduce((sum, f) => sum + f.weight, 0);

// Guards the invariant at require time: a bad edit fails immediately rather
// than silently skewing every score in the dataset.
if (SCORE_WEIGHT_TOTAL !== 100) {
  throw new Error(`PetroHrys Score weights must total 100, got ${SCORE_WEIGHT_TOTAL}.`);
}

// factors are 0-10, weights total 100 => raw total is 0-1000 => /10 gives 0-100
function computeScore(factors) {
  if (!factors || typeof factors !== 'object') return null;
  let total = 0;
  for (const { key, weight } of SCORE_FACTORS) {
    const value = factors[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    total += value * weight;
  }
  return Math.round(total / 10);
}

// --- Wave 1 foundation: geography, jurisdiction, names, registry type -------
// Added for the government & statutory registries wave. Every field below is
// nullable and normalised in memory by bd-migrate, so the 72 records written
// before this wave keep their bytes and their rendered output unchanged.

// A geographic registry entry is either a sovereign country or an authority
// above several of them. The distinction is explicit because the EU is stored
// in the same file for routing convenience and must never be *presented* as a
// country — not in prose, breadcrumbs or structured data.
const ENTITY_TYPES = ['country', 'supranational'];

// Scope answers "how far does this system's authority reach", which is not the
// same question as "where is it filed". `subnational` and `regional` are the
// pair most easily confused, so both carry a definition and a test.
const SCOPES = ['global', 'supranational', 'national', 'subnational', 'regional'];
const SCOPE_DEFINITIONS = {
  global: 'Worldwide or broadly international scope.',
  supranational: 'An authority or system above multiple sovereign states.',
  national: 'One sovereign state.',
  subnational: 'An administrative jurisdiction within a state.',
  regional: 'A multi-country or functional region that is not a subnational jurisdiction.',
};

const JURISDICTION_TYPES = ['state', 'province', 'territory', 'federal-district',
  'region', 'autonomous-community', 'prefecture', 'municipality'];

// --- grouping vocabulary -----------------------------------------------------
// Presentation labels only. `jurisdiction.type` stays the canonical machine
// value; nothing here is stored on a record.
//
// It is per-country because the same machine type is called different things in
// different states, and because the wrong word is a factual error rather than a
// style choice: Spain and Italy have no federal tier, so heading their national
// registers "Federal" would misdescribe their constitution. `region` is the
// clearest case — Länder in Germany, Regions in Italy, Autonomous regions in
// China.
//
// NATIONAL_KEY is the bucket for records with no jurisdiction. It is not a
// jurisdiction type, so it is keyed separately.
const NATIONAL_KEY = 'national';

const JURISDICTION_VOCABULARY = {
  'united-states': {
    national: 'Federal',
    state: 'States',
    'federal-district': 'Federal district',
    territory: 'Territories',
  },
  canada: { national: 'Federal', province: 'Provinces', territory: 'Territories' },
  australia: { national: 'Federal', state: 'States', territory: 'Territories' },
  germany: { national: 'Federal', region: 'Länder' },
  spain: { national: 'National', 'autonomous-community': 'Autonomous communities' },
  italy: { national: 'National', region: 'Regions' },
  japan: { national: 'National', prefecture: 'Prefectures' },
  // Special administrative regions are deliberately absent: none is modelled,
  // and Hong Kong and Macao are separate legal systems that must not be folded
  // into a mainland grouping if they are ever added.
  china: {
    national: 'National',
    province: 'Provinces',
    region: 'Autonomous regions',
    municipality: 'Municipalities',
  },
  // Countries with no subnational record yet get a neutral national label and
  // nothing else. A subnational record filed under them fails loudly until
  // someone writes the correct vocabulary, rather than silently borrowing
  // American terminology.
  france: { national: 'National' },
  'united-kingdom': { national: 'National' },
  poland: { national: 'National' },
  'czech-republic': { national: 'National' },
  'european-union': { national: 'Union-wide' },
  global: { national: 'Global' },
};

const DEFAULT_NATIONAL_LABEL = 'National';

// Throws rather than guessing. An unsupported country/type pair means either
// the record is misfiled or the vocabulary is incomplete, and both are editorial
// decisions a person must make — inventing "Prefectures in Spain" is not one.
function jurisdictionLabel(countrySlug, typeKey) {
  const vocabulary = JURISDICTION_VOCABULARY[countrySlug];
  if (!vocabulary) {
    throw new Error(`No jurisdiction vocabulary is declared for country "${countrySlug}". `
      + 'Add one to JURISDICTION_VOCABULARY before publishing records for it.');
  }
  const label = vocabulary[typeKey];
  if (!label) {
    const known = Object.keys(vocabulary).filter((k) => k !== NATIONAL_KEY);
    throw new Error(`Country "${countrySlug}" has no label for jurisdiction type "${typeKey}". `
      + `It declares: ${known.length ? known.join(', ') : '(no subnational types)'}. `
      + 'Either the record is misfiled or the vocabulary needs extending.');
  }
  return label;
}

// The subnational types a country is allowed to use, for the validator.
function allowedJurisdictionTypes(countrySlug) {
  const vocabulary = JURISDICTION_VOCABULARY[countrySlug];
  if (!vocabulary) return null;
  return Object.keys(vocabulary).filter((k) => k !== NATIONAL_KEY);
}

// --- geographic codes -------------------------------------------------------
// STRUCTURAL validation only. No ISO 3166 dataset is embedded, so nothing here
// asserts that a well-formed code is a real subdivision — only that it has the
// right shape and belongs to the country it claims. Claiming more would be a
// promise this repository cannot keep without maintaining the list.
//
// ISO 3166-1 alpha-2: exactly two uppercase ASCII letters. Anchored, so "usa",
// "Us", "U5", " US " and "" are all refused.
const ISO_3166_1_RE = /^[A-Z]{2}$/;
// ISO 3166-2: the alpha-2 country, one hyphen, then 1-3 uppercase alphanumerics.
const ISO_3166_2_RE = /^[A-Z]{2}-[A-Z0-9]{1,3}$/;

// Why a code is malformed, in words a maintainer can act on. Returns null when
// the shape is acceptable.
function iso3166_2Problem(code) {
  if (typeof code !== 'string') return `must be a string, got ${typeof code}`;
  if (code !== code.trim()) return 'has leading or trailing whitespace';
  if (code === '') return 'is empty; use null when no official code exists';
  // The underscore case is checked first: "DE_US" has no hyphen either, and
  // "uses the wrong separator" is the actionable message, not "has none".
  if (/_/.test(code)) return 'uses "_" instead of "-"';
  if (!code.includes('-')) return 'has no "-" separator (expected e.g. US-CA)';
  if (code !== code.toUpperCase()) return 'must be uppercase';
  const [country, subdivision, ...rest] = code.split('-');
  if (rest.length) return 'has more than one "-" separator';
  if (!ISO_3166_1_RE.test(country)) return `country part "${country}" is not two uppercase letters`;
  if (!subdivision) return 'has an empty subdivision part';
  if (!/^[A-Z0-9]{1,3}$/.test(subdivision)) {
    return `subdivision part "${subdivision}" must be 1-3 uppercase letters or digits`;
  }
  return ISO_3166_2_RE.test(code) ? null : 'is not a well-formed ISO 3166-2 code';
}

// --- jurisdiction identity ---------------------------------------------------
// Several registry records may legitimately belong to one jurisdiction —
// California has more than one. What must be consistent is the DEFINITION of
// the jurisdiction those records point at. This resolver produces the key that
// definition is compared under, so the validator checks places, not records.
//
// Names are normalised for comparison only; the stored name is untouched.
// Case, surrounding and internal whitespace, and punctuation used decoratively
// are folded, so "District of Columbia" and "district of  columbia" are one
// place rather than two.
function normaliseJurisdictionName(name) {
  if (typeof name !== 'string') return '';
  return name.trim().toLowerCase().replace(/[\s ]+/g, ' ').replace(/[.,]/g, '');
}

// A code, where present, is the strongest identity: it is meant to be the
// jurisdiction's canonical handle. Where none is recorded, the normalised name
// carries the identity instead.
function jurisdictionIdentity(jurisdiction) {
  if (!jurisdiction || typeof jurisdiction !== 'object') return null;
  const parent = jurisdiction.parentCountry || '';
  const type = jurisdiction.type || '';
  return jurisdiction.code
    ? { key: `${parent}|${type}|code:${jurisdiction.code}`, by: 'code' }
    : { key: `${parent}|${type}|name:${normaliseJurisdictionName(jurisdiction.name)}`, by: 'name' };
}

// The reverse view: one place, keyed by name, so two codes claiming the same
// place can be caught as well as two names claiming the same code.
function jurisdictionNameKey(jurisdiction) {
  if (!jurisdiction || typeof jurisdiction !== 'object') return null;
  return `${jurisdiction.parentCountry || ''}|${jurisdiction.type || ''}|`
    + `${normaliseJurisdictionName(jurisdiction.name)}`;
}

// --- names ------------------------------------------------------------------
// Four fields, ONE resolver. Overlapping name fields are only safe if exactly
// one function decides what a reader sees, so `displayName` is the single
// answer and every renderer goes through it.
//
// `officialName` normalises to `name` for records written before this wave, so
// the resolver returns the same string it always did and their pages do not
// change by a byte.
const ENGLISH_NAME_SOURCES = ['official', 'editorial-translation'];

function displayName(record) {
  if (!record) return '';
  return record.englishName || record.officialName || record.nativeName || record.name || '';
}

// True when the English title shown is our translation rather than a name the
// operator publishes. Pages must say so: presenting an editorial rendering as
// the institution's own name misattributes it.
function isEditorialTranslation(record) {
  return !!record
    && !!record.englishName
    && record.englishNameSource === 'editorial-translation';
}

// --- registry classification ------------------------------------------------
// A registry may genuinely perform several official functions; flattening it to
// one would misdescribe it. `primaryRegistryType` is what it is chiefly for,
// and must also appear in `registryTypes`.
const REGISTRY_TYPES = [
  'company-register', 'business-entity-register', 'sole-trader-register',
  'beneficial-ownership-register', 'securities-filing-database',
  'financial-services-register', 'professional-licence-register', 'charity-register',
  'procurement-supplier-register', 'tax-verification-system', 'corporate-number-database',
  'trademark-register', 'patent-register', 'insolvency-register',
  'regulated-operator-register', 'contractor-accreditation-register',
  'public-filing-database', 'cross-border-registry-interface',
  // Added for Wave 1A completion. Three verified federal registers had no
  // honest fit: labelling a debarment list a "procurement-supplier-register"
  // states the opposite of what it is, since a supplier register records who
  // MAY bid and an exclusion register records who may not.
  'exclusion-and-debarment-register',
];

// --- operator ---------------------------------------------------------------
const OPERATOR_TYPES = ['government-agency', 'regulator', 'court', 'public-law-body',
  'supranational-institution', 'ministry', 'local-authority', 'other'];

// --- public access ----------------------------------------------------------
// accessLevel is recorded, never derived: absent booleans mean "not
// established", and inferring "open" from silence would manufacture a claim
// about accessibility that no source made.
const ACCESS_LEVELS = ['open', 'partially-open', 'login-required',
  'identity-verification-required', 'restricted', 'unknown'];

const PUBLIC_ACCESS_BOOLEANS = ['freeToSearch', 'loginRequired', 'identityVerificationRequired',
  'captcha', 'geographicRestriction', 'paidDocumentsAvailable'];

// Human wording for every enum a reader can see. Derived from the enums
// themselves at require time, so a new value cannot be added without a label —
// the alternative is a page that prints "identity-verification-required".
const ACCESS_LEVEL_LABELS = {
  open: 'Open',
  'partially-open': 'Partly open',
  'login-required': 'Login required',
  'identity-verification-required': 'Identity verification required',
  restricted: 'Restricted',
  unknown: 'Not established',
};

const OPERATOR_TYPE_LABELS = {
  'government-agency': 'Government agency',
  regulator: 'Regulator',
  court: 'Court',
  'public-law-body': 'Public-law body',
  'supranational-institution': 'Supranational institution',
  ministry: 'Ministry',
  'local-authority': 'Local authority',
  other: 'Other',
};

const SCOPE_LABELS = {
  global: 'Global',
  supranational: 'Supranational',
  national: 'National',
  subnational: 'Subnational',
  regional: 'Regional',
};

// Stated once, next to the enum it explains, so the page can say what a
// missing access level means instead of leaving a reader to guess.
const ACCESS_UNKNOWN_NOTE = 'The overall access position has not been established from an official '
  + 'source. It is recorded as unknown rather than assumed to be open.';

// Returns the reasons an access block contradicts itself. A stated level and a
// stated boolean disagreeing means one of them is wrong, and publishing either
// would tell a reader something untrue about whether they can use the register.
// What each level asserts. Published in the runbook and used by the UI, so a
// reviewer choosing a level and a reader interpreting one work from the same
// sentence.
const ACCESS_LEVEL_DEFINITIONS = {
  open: 'Public search and core result access require neither login nor identity verification.',
  'partially-open': 'Some useful public search or data is available, but fuller documents, '
    + 'extended data or operations require payment, login, identity verification or another '
    + 'restriction.',
  'login-required': 'Search or meaningful result access requires an account.',
  'identity-verification-required': 'Access requires confirmed identity, a domestic credential, '
    + 'a verified phone number or comparable identity control.',
  restricted: 'General public access is materially unavailable or limited to authorised users.',
  unknown: 'Evidence is insufficient to establish the access position.',
};

// A restriction that `partially-open` can point at. Free-to-search alone is not
// a limitation, so it is not in this list.
const ACCESS_LIMITATION_FLAGS = ['loginRequired', 'identityVerificationRequired', 'captcha',
  'geographicRestriction', 'paidDocumentsAvailable'];

function accessContradictions(access) {
  if (!access || typeof access !== 'object') return [];
  const out = [];
  const { accessLevel: level } = access;
  const hasNote = typeof access.notes === 'string' && access.notes.trim().length > 0;

  if (level === 'open') {
    if (access.loginRequired === true) out.push('accessLevel "open" with loginRequired true');
    if (access.identityVerificationRequired === true) {
      out.push('accessLevel "open" with identityVerificationRequired true');
    }
    if (access.freeToSearch === false) out.push('accessLevel "open" with freeToSearch false');
    // A geographic restriction may be something other than an access barrier —
    // a register whose CONTENT covers one region is not gated. That reading has
    // to be written down, though, or "open" silently overrides the flag.
    if (access.geographicRestriction === true && !hasNote) {
      out.push('accessLevel "open" with geographicRestriction true and no note explaining '
        + 'why the restriction is not an access barrier');
    }
    // captcha with "open" is deliberately allowed: a challenge is friction, not
    // an account or an identity check.
  }
  if (level === 'login-required' && access.loginRequired === false) {
    out.push('accessLevel "login-required" with loginRequired false');
  }
  if (level === 'identity-verification-required' && access.identityVerificationRequired === false) {
    out.push('accessLevel "identity-verification-required" with identityVerificationRequired false');
  }
  if (level === 'restricted') {
    const anyRestriction = ACCESS_LIMITATION_FLAGS.some((k) => access[k] === true);
    const allDenied = ACCESS_LIMITATION_FLAGS.every((k) => access[k] === false);
    if (!anyRestriction && allDenied && !hasNote) {
      out.push('accessLevel "restricted" with every restriction flag false and no note '
        + 'explaining what restricts access');
    }
  }
  // The level exists to say "usable, but not fully". Something has to be the
  // "not fully", or it is indistinguishable from open.
  if (level === 'partially-open') {
    const anyLimitation = ACCESS_LIMITATION_FLAGS.some((k) => access[k] === true);
    if (!anyLimitation && !hasNote) {
      out.push('accessLevel "partially-open" with no limitation flag set and no note '
        + 'describing what is limited');
    }
  }
  // Note what is NOT a contradiction: accessLevel "unknown" alongside an
  // established boolean. Knowing a register is free to search says nothing
  // about whether it also demands a login, and requiring a level to be asserted
  // would force exactly the inference this model exists to prevent.
  return out;
}

// --- required shape ---------------------------------------------------------

const REQUIRED_STRINGS = ['id', 'name', 'slug', 'country', 'category', 'website', 'description'];

// Editorial relationship kinds. Relations are curated by a reviewer and point
// at other record ids; they are never generated by similarity heuristics.
const RELATION_KINDS = ['alternatives', 'similar', 'usedWith', 'competitors'];
const RELATION_LABELS = {
  alternatives: 'Alternative directories',
  similar: 'Similar directories',
  usedWith: 'Often used together',
  competitors: 'Competing directories',
};
// Editorial depth. pros/cons already carry advantages/disadvantages, so no
// parallel field is added for them.
const SUBMISSION_DIFFICULTY = ['very-easy', 'easy', 'moderate', 'hard'];
const LISTING_QUALITY = ['high', 'mixed', 'low'];

// Factual, not editorial: only populated from a submission page that was
// actually read. Null means the form was not inspected.
const REQUIRED_ASSET_KEYS = ['logo', 'website', 'description', 'categories',
  'contact', 'screenshots', 'businessVerification'];

const ARRAY_FIELDS = ['recommendedIndustries', 'pros', 'cons', 'editorialTags',
  'bestFor', 'notRecommendedFor', 'commonMistakes', 'preparationChecklist'];
const NULLABLE_BOOLEANS = ['registrationRequired', 'reviewSystem', 'verificationRequired',
  'manualReview', 'sitemap', 'indexed', 'ssl'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// --- indexability -----------------------------------------------------------
// A detail page earns indexing by carrying substantive record-specific evidence,
// never by word count. Each clause names a fact a reader could not get from the
// country page. A record that fails is still published and still linked — it
// becomes noindex,follow, so its links keep flowing and it leaves the sitemap.

// Curated relations and guide links are valuable but deliberately NOT required.
// A record can carry a complete, verified evidence package a reader cannot get
// anywhere else and still have no editorial relation recorded — that is a gap in
// our curation, not thinness in the page, and demoting it would hide verified
// research to punish an unfinished cross-reference.
const INDEXABILITY_CLAUSES = [
  { key: 'name', label: 'an official name',
    test: (r) => typeof r.name === 'string' && r.name.trim().length > 0 },
  // Non-empty, not "long enough": a length threshold is exactly the arbitrary
  // word-count rule this contract exists to replace. Description UNIQUENESS is
  // enforced registry-wide instead, where it can actually be checked.
  { key: 'description', label: 'an editorial description',
    test: (r) => typeof r.description === 'string' && r.description.trim().length > 0 },
  { key: 'scope', label: 'a country or editorial scope',
    test: (r) => !!r.country && !!r.scope && r.scope !== 'unknown' },
  { key: 'category', label: 'a category', test: (r) => !!r.category },
  { key: 'destination', label: 'an official HTTPS destination',
    test: (r) => typeof r.website === 'string' && /^https:\/\//i.test(r.website) },
  { key: 'score', label: 'a PetroHrys Score',
    test: (r) => typeof r.petroHrysScore === 'number' },
  { key: 'factors', label: 'a complete ten-factor breakdown',
    test: (r) => !!r.scoreFactors
      && SCORE_FACTORS.every((f) => typeof r.scoreFactors[f.key] === 'number') },
  { key: 'verificationDate', label: 'a verification date', test: (r) => !!r.lastVerified },
  { key: 'verificationSource', label: 'a verification source',
    test: (r) => !!r.verification && r.verification.status === 'verified' && !!r.verification.source },
  { key: 'reviewer', label: 'a named reviewer',
    test: (r) => ((r.verification || {}).reviewers || []).length > 0 },
  { key: 'prosCons', label: 'meaningful pros or cons',
    test: (r) => (r.pros || []).length > 0 || (r.cons || []).length > 0 },
];

// Returns { indexable, missing[] } so a caller can report exactly why a record
// was demoted rather than just that it was.
function indexability(record) {
  const missing = INDEXABILITY_CLAUSES
    .filter((clause) => !clause.test(record || {}))
    .map((clause) => clause.label);
  return { indexable: missing.length === 0, missing };
}

// --- verification cadence ---------------------------------------------------
// nextVerification is derived, never hand-set, so the whole dataset cannot expire
// on one day. The interval reflects how fast the directory changes; the spread is
// a stable hash of the record id. No Date.now(), no Math.random(), no locale
// dependence, so a rebuild is byte-identical.

const REVIEW_INTERVAL_MONTHS = { fast: 6, standard: 9, statutory: 12 };

// Continuously-submittable platforms churn fastest; statutory registers barely
// move. Category is the observable that separates them.
const FAST_CATEGORIES = new Set(['review-sites', 'app-directories', 'press-release-platforms']);

function reviewBucket(record) {
  if (record.submissionModel === 'notApplicable' || record.category === 'government') return 'statutory';
  if (FAST_CATEGORIES.has(record.category)) return 'fast';
  return 'standard';
}

// FNV-1a over the id's code units. Chosen because it is short, stable across
// platforms, and has no dependency on hashing libraries or string collation.
function stableHash(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

const SPREAD_DAYS = 28;

// Adds whole months, then a deterministic 0-27 day offset. Uses UTC throughout so
// the result never depends on the machine's timezone.
function nextVerificationFor(record) {
  if (!record || !DATE_RE.test(record.lastVerified || '')) return null;
  const [y, m, d] = record.lastVerified.split('-').map(Number);
  const months = REVIEW_INTERVAL_MONTHS[reviewBucket(record)];
  const offset = stableHash(String(record.id || '')) % SPREAD_DAYS;
  const base = Date.UTC(y, m - 1 + months, d);
  const shifted = new Date(base + offset * 86400000);
  return shifted.toISOString().slice(0, 10);
}

// Enforced at require time. A new enum value without a label would otherwise
// surface as a raw machine string on a published page.
for (const [name, values, labels] of [
  ['ACCESS_LEVELS', ACCESS_LEVELS, ACCESS_LEVEL_LABELS],
  ['OPERATOR_TYPES', OPERATOR_TYPES, OPERATOR_TYPE_LABELS],
  ['SCOPES', SCOPES, SCOPE_LABELS],
  ['ACCESS_LEVELS (definitions)', ACCESS_LEVELS, ACCESS_LEVEL_DEFINITIONS],
]) {
  for (const value of values) {
    if (!labels[value]) throw new Error(`${name} value "${value}" has no display label.`);
  }
}

// --- the canonical record key set -------------------------------------------
// Every key a normalised record may carry. The validator rejects anything else,
// so a typo or an improvised per-country field fails loudly instead of being
// silently dropped by the migration. A test asserts this list matches exactly
// what bd-migrate emits, so the two cannot drift apart.
const KNOWN_RECORD_KEYS = [
  'id', 'name', 'slug', 'country', 'category', 'website', 'submissionUrl', 'description',
  'tier', 'scope',
  'officialName', 'nativeName', 'englishName', 'englishNameSource',
  'jurisdiction', 'resourceIdentity',
  'primaryRegistryType', 'registryTypes',
  'operator', 'publicAccess',
  'petroHrysScore', 'scoreFactors',
  'domainRating', 'authorityScore', 'estimatedTraffic', 'referringDomains', 'httpStatus',
  'metricStatus', 'metricsProvenance',
  'submissionModel', 'registrationRequired', 'reviewSystem', 'verificationRequired',
  'manualReview', 'accepts',
  'backlinkType', 'robots', 'sitemap', 'indexed', 'ssl',
  'lastVerified', 'nextVerification', 'verification', 'related',
  'bestFor', 'notRecommendedFor', 'submissionDifficulty', 'listingQuality',
  'typicalApprovalTime', 'reviewProcess', 'commonMistakes', 'preparationChecklist',
  'requiredAssets', 'recommendedIndustries', 'editorialTags', 'pros', 'cons', 'editorNotes',
];

// --- shared official hosts ---------------------------------------------------
// One canonical domain per country is the right default: two records on one
// host are almost always the same service listed twice. But a government
// application host breaks that assumption. accessdata.fda.gov carries dozens of
// separate FDA databases with different centres, statutes and populations, and
// treating the hostname as the identity would force us to publish one of them
// and silently drop the rest.
//
// `resourceIdentity` makes the exception explicit and evidenced rather than
// hard-coding a list of blessed domains. Sharing a domain is allowed ONLY when
// every record on it declares the same sharedHostGroup, carries its own unique
// systemKey, and points at a materially different URL. A landing page and its
// own search page still do not qualify — they are one system.
const RESOURCE_IDENTITY_KEYS = ['canonicalDomain', 'systemKey', 'sharedHostGroup'];

// A hostname and nothing else: no scheme, no path, no query, no port, no
// credentials. Those all indicate the author pasted a URL.
const CANONICAL_DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

function canonicalDomainProblem(value) {
  if (typeof value !== 'string') return `must be a string, got ${typeof value}`;
  if (value !== value.trim()) return 'has leading or trailing whitespace';
  if (!value) return 'is empty';
  if (/^[a-z]+:\/\//i.test(value)) return 'contains a URL scheme; store the hostname only';
  if (value.includes('/')) return 'contains a path; store the hostname only';
  if (value.includes('?') || value.includes('#')) return 'contains a query or fragment';
  if (value.includes('@')) return 'contains credentials';
  if (value.includes(':')) return 'contains a port';
  if (value !== value.toLowerCase()) return 'must be lowercase';
  if (value.startsWith('www.')) return 'includes a "www." prefix; store the registrable host';
  if (!CANONICAL_DOMAIN_RE.test(value)) return 'is not a well-formed hostname';
  return null;
}

// Two official URLs count as materially different only if they differ by more
// than case, a trailing slash, a query string or a language segment. This is
// what stops "the same registry, twice" from being dressed up as two systems.
const LANGUAGE_SEGMENT_RE = /\/(?:[a-z]{2}|[a-z]{2}-[a-z]{2})(?=\/|$)/gi;

function normaliseForComparison(url) {
  if (typeof url !== 'string' || !url) return '';
  let out;
  try {
    const parsed = new URL(url);
    out = `${parsed.hostname.replace(/^www\./, '')}${parsed.pathname}`.toLowerCase();
  } catch {
    out = url.toLowerCase();
  }
  out = out.replace(LANGUAGE_SEGMENT_RE, '');
  return out.replace(/\/+$/, '');
}

function urlsAreMateriallyDifferent(a, b) {
  const na = normaliseForComparison(a);
  const nb = normaliseForComparison(b);
  if (!na || !nb) return true;
  return na !== nb;
}

// --- nested key sets --------------------------------------------------------
// Top-level rejection is not enough. `jurisdiction: { typoCode: 'US-CA' }` was
// accepted and then silently emptied by the migration's fixed-key picker, so a
// misspelled nested field produced neither an error nor any data. Each
// structured object therefore declares its own key set, and the same rejection
// applies at every level with a dotted path in the message.
const NESTED_RECORD_KEYS = {
  resourceIdentity: RESOURCE_IDENTITY_KEYS,
  jurisdiction: ['type', 'name', 'code', 'parentCountry'],
  operator: ['name', 'type', 'officialUrl'],
  publicAccess: ['searchUrl', 'accessLevel', ...PUBLIC_ACCESS_BOOLEANS, 'notes'],
  verification: ['status', 'source', 'reviewers'],
  requiredAssets: REQUIRED_ASSET_KEYS,
  accepts: ACCEPTS_KEYS,
  related: RELATION_KINDS,
  scoreFactors: SCORE_FACTORS.map((f) => f.key),
};

// Provenance is keyed by metric name, so its own keys are dynamic; only the
// shape of each entry is fixed.
const METRIC_PROVENANCE_KEYS = ['provider', 'measuredAt', 'status', 'measuredDomain'];

// Fields whose stored value must be an object, and those that must be an array.
// A wrongly typed value used to be coerced away by the migration — a string
// `registryTypes` became `[]` — which lost the author's intent silently.
const OBJECT_VALUED_FIELDS = ['resourceIdentity', 'jurisdiction', 'operator', 'publicAccess', 'verification',
  'requiredAssets', 'accepts', 'related', 'scoreFactors', 'metricsProvenance'];
const ARRAY_VALUED_FIELDS = ['registryTypes', ...ARRAY_FIELDS];

module.exports = {
  NESTED_RECORD_KEYS, METRIC_PROVENANCE_KEYS, OBJECT_VALUED_FIELDS, ARRAY_VALUED_FIELDS,
  RESOURCE_IDENTITY_KEYS, CANONICAL_DOMAIN_RE, canonicalDomainProblem,
  normaliseForComparison, urlsAreMateriallyDifferent,
  ENTITY_TYPES, SCOPES, SCOPE_DEFINITIONS, JURISDICTION_TYPES,
  ISO_3166_1_RE, ISO_3166_2_RE, iso3166_2Problem,
  normaliseJurisdictionName, jurisdictionIdentity, jurisdictionNameKey,
  JURISDICTION_VOCABULARY, NATIONAL_KEY, DEFAULT_NATIONAL_LABEL,
  jurisdictionLabel, allowedJurisdictionTypes,
  ENGLISH_NAME_SOURCES, displayName, isEditorialTranslation,
  REGISTRY_TYPES, OPERATOR_TYPES, ACCESS_LEVELS, PUBLIC_ACCESS_BOOLEANS, accessContradictions,
  ACCESS_LEVEL_LABELS, OPERATOR_TYPE_LABELS, SCOPE_LABELS, ACCESS_UNKNOWN_NOTE,
  ACCESS_LEVEL_DEFINITIONS, ACCESS_LIMITATION_FLAGS,
  KNOWN_RECORD_KEYS,
  TIERS, BACKLINK_TYPES, ROBOTS_STATES, SUBMISSION_MODELS, METRIC_STATUSES,
  SUBMISSION_MODEL_LABELS, SUBMISSION_NOT_APPLICABLE_NOTE, SUBMITTABLE_MODELS,
  METRIC_SNAPSHOT_STATUS, METRIC_PROVIDERS, DOMAIN_RATING_RANGE, AHREFS_ATTRIBUTION,
  DR_COLLECTION_FROZEN, DR_NOT_MEASURED_LABEL, DR_SNAPSHOT_POLICY_NOTE,
  normaliseDomain,
  SCORE_METHOD_NOTE, INDEXABILITY_CLAUSES, indexability,
  REVIEW_INTERVAL_MONTHS, SPREAD_DAYS, reviewBucket, stableHash, nextVerificationFor,
  VERIFICATION_STATUSES, VERIFICATION_SOURCES,
  ACCEPTS_KEYS, ACCEPTS_LABELS,
  SCORE_FIELDS, COUNT_FIELDS, THIRD_PARTY_METRICS, NUMERIC_METRICS,
  SCORE_FACTORS, SCORE_WEIGHT_TOTAL, computeScore,
  REQUIRED_STRINGS, ARRAY_FIELDS, NULLABLE_BOOLEANS, DATE_RE,
  RELATION_KINDS, RELATION_LABELS,
  SUBMISSION_DIFFICULTY, LISTING_QUALITY, REQUIRED_ASSET_KEYS,
};
