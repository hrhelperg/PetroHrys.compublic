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

module.exports = {
  TIERS, BACKLINK_TYPES, ROBOTS_STATES, SUBMISSION_MODELS, METRIC_STATUSES,
  SUBMISSION_MODEL_LABELS, SUBMISSION_NOT_APPLICABLE_NOTE, SUBMITTABLE_MODELS,
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
