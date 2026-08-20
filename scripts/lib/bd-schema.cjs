// scripts/lib/bd-schema.cjs
'use strict';

// The single declaration of what a directory record is. The validator, the
// migration, the renderer and the tests all read this file, so a field can
// never be added in one place and forgotten in another.

// --- enumerations -----------------------------------------------------------

const TIERS = ['tier1', 'tier2', 'tier3'];
// `backlinkType` already existed and already carried the right shape, which is
// why nothing new was invented for it: a listing's outbound link is not a
// boolean. 'none' means the public listing renders no external website link at
// all, and that is a different fact from 'nofollow'. UNKNOWN is null — the
// absence of a measurement, never a value.
const BACKLINK_TYPES = ['dofollow', 'nofollow', 'sponsored', 'ugc', 'mixed', 'none'];

// How the listing reaches the business site. A wrapper such as /out?url=... is
// not an external anchor: a crawler sees a link to the directory, and whether
// anything is passed onward depends on the directory's own redirect and robots
// rules. Recorded separately so it can never be folded into backlinkType.
const LINK_TARGET_TYPES = ['direct', 'internal-redirect', 'javascript-redirect'];

// Whether the page carrying the link can be crawled at all. A follow link on a
// noindex page is a different proposition from one on an indexable page, and
// collapsing them would overstate both.
const LISTING_INDEXABILITY = ['indexable', 'noindex', 'robots-blocked', 'login-required'];
const ROBOTS_STATES = ['allowed', 'disallowed', 'partial', 'unknown'];
// `notApplicable` is not a fourth pricing tier. It records that the directory has
// no submission route at all: the entry exists because of incorporation,
// registration, filing or another statutory process. It is therefore never
// counted as free, paid, freemium, or as an unanswered question.
const SUBMISSION_MODELS = ['free', 'paid', 'freemium', 'notApplicable', 'unknown'];

// ── Commercial listing schema ───────────────────────────────────────────────
// submissionModel above is a COST axis. It cannot express what a business may
// actually DO on a platform, which is the question a commercial directory
// record exists to answer. LISTING_ACTIONS is that missing axis, kept separate
// so a statutory register's "notApplicable" cost posture never has to double as
// a statement about listing flows.
//
// "create-and-claim" — not "create-or-claim" — because the value asserts that
// BOTH official flows were confirmed, not that either might exist.
//
// "apply" was added for eligibility-gated inclusion, which none of the other
// values could describe without asserting something false. A certified-supplier
// directory, a chamber member directory and a tourism-partner listing all share
// one shape: the business initiates, and the OPERATOR decides on certification,
// membership or eligibility. Before "apply" existed the choices were to call
// that "create" (which hides the gate), "invite-only" (which renders as "Invite
// only" and denies that a business may apply at all), or "unknown" (which
// discards documented evidence). Each is a different untruth.
//
// "apply" is NOT for ordinary editorial moderation. Almost every directory
// reviews submissions; that alone stays "create". The distinguishing feature is
// that inclusion depends on WHO the business is — certification, membership or
// eligibility — not merely on whether the submitted data passes review.
const LISTING_ACTIONS = ['create', 'claim', 'create-and-claim', 'apply',
  'invite-only', 'not-applicable', 'unknown'];

// ── Business-listing operations layer ───────────────────────────────────────
// These four fields answer an OPERATIONAL question the editorial record could
// not: "where should we publish this business, and should we do it first?"
// They are deliberately few. Everything else an employee needs already exists —
// country is the platform country, lastVerified is the last check, description
// is the short note, cons/notRecommendedFor are the limitations, and tier is the
// reputation tier. Adding parallel fields for those would have created two
// sources of truth for the same fact.

// The audience a platform actually reaches. Distinct from `scope`, which is a
// LEVEL (global/national/regional), and from `country`, which is where the
// platform sits. A German operator can serve DACH; a Swiss platform can be
// local. Never inferred from the operator's country.
const AUDIENCE_GEOGRAPHIES = ['global', 'europe', 'european-union', 'dach',
  'nordics', 'north-america', 'united-states', 'canada', 'united-kingdom',
  'australia', 'latam', 'middle-east', 'africa', 'asia', 'india', 'japan',
  'china', 'country-specific', 'regional', 'local'];

// An editorial work recommendation, not a queue state and not a quality score.
// "hold" means potentially valuable but not yet actionable; "reject" means do
// not use. Both are deliberately distinct from null, which means unassessed.
const PRIORITIES = ['P1', 'P2', 'P3', 'hold', 'reject'];

// Whether the researched PRODUCT still operates. "redirected" records a domain
// that now resolves into a successor — which is not proof the successor offers
// the same service, so a redirected record is not actionable unless it has been
// re-modelled as the live successor.
const CURRENT_STATUSES = ['active', 'shutting-down', 'redirected', 'dormant', 'unknown'];

// Sort order for the operational views and the CSV. Kept explicit rather than
// derived from the array above so that reordering PRIORITIES for display can
// never silently change the export.
const PRIORITY_RANK = { P1: 0, P2: 1, P3: 2, hold: 3, reject: 4 };
const priorityRank = (p) => (p in PRIORITY_RANK ? PRIORITY_RANK[p] : 5);

// A deterministic, locale-independent comparator. localeCompare is explicitly
// NOT used: its result depends on the host ICU data, which would make the CSV
// non-reproducible across machines.
const compareStable = (a, b) => {
  const x = String(a); const y = String(b);
  if (x < y) return -1;
  if (x > y) return 1;
  return 0;
};

// Problems with the operational fields, as a pure function shared by the
// validator and its tests.
function operationsProblems(entry) {
  if (!entry) return [];
  const problems = [];
  const ag = entry.audienceGeography;
  if (ag !== undefined && ag !== null) {
    if (!Array.isArray(ag)) {
      problems.push(['audienceGeography', 'Must be an array of audience tokens, or null when the audience was never established.']);
    } else if (ag.length === 0) {
      // [] would read as "reaches nobody", which is never what was meant.
      problems.push(['audienceGeography', 'Is an empty array. Use null when the audience is not established; an empty list asserts that the platform reaches no audience.']);
    } else {
      for (const t of ag) {
        if (!AUDIENCE_GEOGRAPHIES.includes(t)) {
          problems.push(['audienceGeography', `Contains "${t}". Allowed: ${AUDIENCE_GEOGRAPHIES.join(', ')}.`]);
        }
      }
      if (new Set(ag).size !== ag.length) {
        problems.push(['audienceGeography', 'Contains a duplicate token.']);
      }
      const sorted = ag.slice().sort(compareStable);
      if (ag.join('|') !== sorted.join('|')) {
        problems.push(['audienceGeography', `Is not in deterministic order. Expected: ${JSON.stringify(sorted)}.`]);
      }
    }
  }
  if (entry.priority !== undefined && entry.priority !== null
    && !PRIORITIES.includes(entry.priority)) {
    problems.push(['priority', `Must be one of: ${PRIORITIES.join(', ')}, or null when unassessed.`]);
  }
  if (entry.currentStatus !== undefined && entry.currentStatus !== null
    && !CURRENT_STATUSES.includes(entry.currentStatus)) {
    problems.push(['currentStatus', `Must be one of: ${CURRENT_STATUSES.join(', ')}, or null when never evaluated.`]);
  }
  const ppa = entry.publicProfileAvailable;
  if (ppa !== undefined && ppa !== null && typeof ppa !== 'boolean') {
    problems.push(['publicProfileAvailable', 'Must be true, false, or null when not established.']);
  }
  return problems;
}

// THE central definition of an actionable opportunity. Every count, the CSV, the
// public list and batch reporting derive from this one function, so a platform
// can never be actionable in one view and archived in another.
function isActionableOpportunity(record, isGovernmentPillarFn) {
  if (!record) return false;
  if (isGovernmentPillarFn(record)) return false;          // government-only
  if (record.priority === 'reject') return false;
  if (['shutting-down', 'dormant', 'redirected'].includes(record.currentStatus)) return false;
  if (!record.website || !/^https:\/\//.test(record.website)) return false;
  return true;
}

// How a platform verifies the person claiming or creating a listing. This is
// deliberately NOT derivable from verificationRequired: knowing that a platform
// verifies says nothing about whether it posts a card, calls a number or checks
// a document, and that difference decides whether a business can realistically
// complete the flow.
//
// null  — methods not established.
// []    — official evidence establishes that NO verification is required.
// [...] — only methods directly observed or officially documented.
const VERIFICATION_METHODS = ['email', 'phone', 'sms', 'postcard', 'video',
  'documents', 'domain', 'identity', 'business-registration', 'other'];

// The pillars, by category. Pillar A is the Government Registry Core; its
// records normalise to listingAction "not-applicable" mechanically, from this
// contract, rather than being guessed record by record.
const PILLAR_A_CATEGORIES = ['government', 'finance', 'healthcare', 'telecommunications'];
const isGovernmentPillar = (record) => PILLAR_A_CATEGORIES.includes(record && record.category);

// The listingAction a record carries when nothing has been established. A
// statutory register is not an unresolved commercial platform — it has no
// listing concept at all — so the two defaults differ by pillar.
// The "apply" contract, as a pure function so the validator and its tests share
// one implementation. Extracted after the first version lived only inside the
// validator: testing it there meant mutating the real registry on disk, which
// raced against every other test file reading the same registry in parallel.
//
// Returns [] when the record is not "apply" or satisfies the contract.
function applyContractProblems(entry) {
  if (!entry || entry.listingAction !== 'apply') return [];
  const problems = [];
  const visible = [entry.description, ...(entry.pros || []), ...(entry.cons || []),
    ...(entry.bestFor || []), ...(entry.notRecommendedFor || [])]
    .filter((v) => typeof v === 'string').join(' ');
  // The gate is the defining fact about an eligibility-gated platform. If it is
  // not in a published field, a reader never learns inclusion is conditional.
  if (!/eligib|certif|member|accredit|qualif|approv|admitted|vetted|criteria/i.test(visible)) {
    problems.push(['listingAction', 'Is "apply", but no visible field explains the eligibility, certification or membership gate. The gate must be published, not left in editorNotes.']);
  }
  if (!entry.submissionUrl) {
    problems.push(['listingAction', 'Is "apply", but no submissionUrl records the official application route.']);
  }
  // Applying is not claiming. Both together means the action was resolved
  // wrongly, or a second flow went undocumented.
  if (entry.claimUrl) {
    problems.push(['claimUrl', 'Is set alongside listingAction "apply". Applying for inclusion and claiming an existing profile are different actions; resolve which one the platform documents.']);
  }
  return problems;
}

const defaultListingAction = (record) => (isGovernmentPillar(record) ? 'not-applicable' : 'unknown');


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
// A reading taken from Ahrefs' public Domain Rating API on a stated date. Both
// statuses describe a dated measurement; they differ only in how it was
// obtained, and the value is presented the same way either way.
const METRIC_READING_STATUS = 'publicApiReading';
const METRIC_PROVENANCE_STATUSES = [METRIC_SNAPSHOT_STATUS, METRIC_READING_STATUS];
const METRIC_PROVIDERS = ['Ahrefs'];
// Ahrefs Domain Rating is a 0-100 logarithmic scale.
const DOMAIN_RATING_RANGE = { min: 0, max: 100 };
// Required by the Ahrefs Domain Rating licence wherever a value is displayed.
const AHREFS_ATTRIBUTION = { text: 'Domain Rating by Ahrefs', href: 'https://ahrefs.com/' };

// --- third-party data policy ------------------------------------------------
//
// ── THE FREEZE, AND WHY IT WAS LIFTED ───────────────────────────────────────
//
// This block used to read: "The Research Center collects no metric that needs a
// paid account, an API subscription or a mandatory credential… Collection is
// therefore frozen: no new measurements are taken." That was a deliberate
// policy, not an oversight, and it held 64 hand-measured snapshots in place for
// a fortnight.
//
// It is lifted, deliberately and by decision of the repository's owner, on one
// specific ground: Ahrefs publishes Domain Rating through TWO endpoints, and
// the frozen policy was written against the wrong one. The Site Explorer
// endpoint does require an eligible paid plan. The public endpoint —
// /v3/public/domain-rating-free — consumes no API units and needs only an API
// key, which Ahrefs issues free with a free account. So the cost the policy
// was protecting against was never the cost of this data.
//
// What the policy protected that has NOT changed:
//
//   • the build still makes no network request, ever. Ratings are acquired by
//     a research pass and committed; pages read committed data.
//   • the credential is read from the environment by that research pass alone.
//     No build, validator or test reads it, and a test enforces that.
//   • a record without a rating still renders an explicit label rather than a
//     dash, and never a zero, because an unmeasured domain is not a domain that
//     scored badly.
//
// ── WHAT A RATING DESCRIBES ─────────────────────────────────────────────────
//
// A Domain Rating describes a DOMAIN. When several records are published on one
// measured domain they repeat that domain's single dated reading rather than
// each carrying a figure of its own — six Encuentra24 country records report
// one number, because there is one number. They remain six records:
// `sharedDomainSnapshotProblems()` below enforces the repetition, and nothing
// anywhere collapses records because they share a rating.
const DR_COLLECTION_FROZEN = false;
const DR_NOT_MEASURED_LABEL = 'Not measured';
const DR_SNAPSHOT_POLICY_NOTE = 'Domain Rating is measured by Ahrefs and read through their '
  + 'public Domain Rating API. Each value carries the date it was read and describes the whole '
  + 'domain that was measured, not the individual page it appears beside. Where several records '
  + 'are published on one measured domain they repeat that domain\u2019s single dated reading '
  + 'rather than each carrying a figure of its own. A record shown as not measured is a record '
  + 'nobody has a reading for, which is not the same as a record measured at zero.';

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

// One statement of what a valid Domain Rating looks like, for every collection.
//
// Three datasets used to forbid the field outright — "may not be set: this
// dataset takes no metric measurements" — which was correct while collection
// was frozen and is wrong now. Forbidding it was doing two jobs: keeping
// invented numbers out, and keeping collected ones out. Only the first job
// still needs doing, so the ban is replaced by a rule rather than removed.
//
// A rating must be a whole number on the 0-100 scale, and it must arrive with
// provenance naming the provider, the date and the domain measured. A bare
// number with no provenance is exactly what an invented metric looks like.
// Link value is four independent facts and a record of how they were seen.
// Every one of them may be absent; none of them may be guessed.
function backlinkProblems(row) {
  const out = [];
  const p = row.backlinkProvenance;
  const has = (v) => v !== undefined && v !== null;

  if (has(row.backlinkType) && !BACKLINK_TYPES.includes(row.backlinkType)) {
    out.push(['backlinkType', `is ${JSON.stringify(row.backlinkType)}, which is not a recognised link type.`]);
  }
  if (has(row.linkTargetType) && !LINK_TARGET_TYPES.includes(row.linkTargetType)) {
    out.push(['linkTargetType', `is ${JSON.stringify(row.linkTargetType)}, which is not a recognised target type.`]);
  }
  if (has(row.listingIndexability) && !LISTING_INDEXABILITY.includes(row.listingIndexability)) {
    out.push(['listingIndexability', `is ${JSON.stringify(row.listingIndexability)}, which is not a recognised indexability state.`]);
  }

  // A link type without provenance is an assertion. The whole point of this
  // dimension is that it was observed on a named page on a named date.
  if (has(row.backlinkType) && !p) {
    out.push(['backlinkProvenance', 'a link type must record which listing was inspected, and when.']);
  }
  if (!p) {
    if (has(row.linkTargetType)) out.push(['backlinkProvenance', 'a link target type must record which listing was inspected.']);
    return out;
  }
  if (!/^https?:\/\//.test(String(p.listingUrl || ''))) {
    out.push(['backlinkProvenance.listingUrl', 'must name the public listing that was inspected.']);
  }
  if (!DATE_RE.test(String(p.observedAt || ''))) {
    out.push(['backlinkProvenance.observedAt', `is ${JSON.stringify(p.observedAt)}, which is not a date.`]);
  }
  if (p.relTokens !== undefined && !Array.isArray(p.relTokens)) {
    out.push(['backlinkProvenance.relTokens', 'must be a list of the rel tokens actually seen.']);
  }
  // 'none' means no external anchor existed, so there cannot be one recorded.
  if (row.backlinkType === 'none' && p.externalUrl) {
    out.push(['backlinkProvenance.externalUrl', 'records an external link on a listing typed as having none.']);
  }
  // The reverse: any other type asserts a link, so it has to say which.
  if (has(row.backlinkType) && row.backlinkType !== 'none' && row.backlinkType !== 'mixed'
    && !p.externalUrl) {
    out.push(['backlinkProvenance.externalUrl', 'a link type other than "none" must name the link it describes.']);
  }
  // 'mixed' is a claim about more than one template, so one example cannot
  // support it. This is the guard against propagating a single observation.
  if (row.backlinkType === 'mixed' && !(Array.isArray(p.templates) && p.templates.length >= 2)) {
    out.push(['backlinkProvenance.templates', '"mixed" requires at least two inspected templates that differ.']);
  }
  return out;
}

function domainRatingProblems(row) {
  const out = [];
  const v = row.domainRating;
  if (v === undefined || v === null) {
    if (row.metricsProvenance && row.metricsProvenance.domainRating) {
      out.push(['metricsProvenance', 'carries Domain Rating provenance for a rating that is not set.']);
    }
    return out;
  }
  if (typeof v !== 'number' || !Number.isInteger(v)
    || v < DOMAIN_RATING_RANGE.min || v > DOMAIN_RATING_RANGE.max) {
    out.push(['domainRating', `must be a whole number from ${DOMAIN_RATING_RANGE.min} to `
      + `${DOMAIN_RATING_RANGE.max} (got ${JSON.stringify(v)}).`]);
    return out;
  }
  const p = (row.metricsProvenance || {}).domainRating;
  if (!p) {
    out.push(['metricsProvenance', 'a Domain Rating must record who measured it, when, and on which domain.']);
    return out;
  }
  if (!METRIC_PROVIDERS.includes(p.provider)) {
    out.push(['metricsProvenance.domainRating.provider', `names an unrecognised provider ${JSON.stringify(p.provider)}.`]);
  }
  if (!METRIC_PROVENANCE_STATUSES.includes(p.status)) {
    out.push(['metricsProvenance.domainRating.status', `is ${JSON.stringify(p.status)}, which is not a recognised measurement status.`]);
  }
  if (!DATE_RE.test(String(p.measuredAt || ''))) {
    out.push(['metricsProvenance.domainRating.measuredAt', 'is not a YYYY-MM-DD date.']);
  }
  if (!p.measuredDomain) {
    out.push(['metricsProvenance.domainRating.measuredDomain', 'does not say which domain was measured.']);
  }
  return out;
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

// A jurisdiction TYPE describes what kind of subnational unit a record belongs
// to. It is not the geographic registry's notion of a country: `entityType`
// there names a sovereign state, whereas `jurisdiction.type = 'country'` names
// a constituent country INSIDE one — England, Scotland and Wales are countries
// in this sense and the United Kingdom is not.
//
// Northern Ireland stays `province`, which is the category ISO 3166-2 itself
// assigns it. Using `country` for it would be tidier and would misdescribe the
// standard the codes come from.
//
// `cross-territory` is for a jurisdiction that spans several subdivisions and
// has no code of its own — England and Wales is one legal jurisdiction over two
// ISO subdivisions, and the register that serves it is neither England's nor
// Wales's. Such a record carries `covers`, never `code`.
const JURISDICTION_TYPES = ['state', 'province', 'territory', 'federal-district',
  'region', 'autonomous-community', 'prefecture', 'municipality',
  'country', 'cross-territory'];

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
// NATIONAL_KEY is the bucket for records with no jurisdiction that are national
// in scope. It is not a jurisdiction type, so it is keyed separately.
//
// OTHER_KEY catches the rest: a record with no jurisdiction whose scope is not
// national — a regional or global body filed under one country. Without it the
// Better Business Bureau, a private nonprofit with regional scope, would render
// under a heading reading "Federal", which is a factual error about what it is.
// The bucket renders only when such a record exists, so a country whose records
// are all federal or subnational never sees it.
const NATIONAL_KEY = 'national';
const OTHER_KEY = 'other';

const JURISDICTION_VOCABULARY = {
  'united-states': {
    national: 'Federal',
    other: 'Other nationwide listings',
    state: 'States',
    'federal-district': 'Federal district',
    territory: 'Territories',
  },
  canada: { national: 'Federal', other: 'Other nationwide listings', province: 'Provinces', territory: 'Territories' },
  australia: { national: 'Federal', other: 'Other nationwide listings', state: 'States', territory: 'Territories' },
  germany: { national: 'Federal', other: 'Other nationwide listings', region: 'Länder' },
  spain: { national: 'National', other: 'Other nationwide listings', 'autonomous-community': 'Autonomous communities' },
  italy: { national: 'National', other: 'Other nationwide listings', region: 'Regions' },
  japan: { national: 'National', other: 'Other nationwide listings', prefecture: 'Prefectures' },
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
  france: { national: 'National', other: 'Other nationwide listings' },
  // The United Kingdom is not one jurisdiction. A register may cover the whole
  // UK, one constituent country, or a legal jurisdiction spanning several —
  // and calling an England-only register "UK-wide" is the error this vocabulary
  // exists to prevent. "Great Britain" is not a synonym for the United Kingdom
  // either: it excludes Northern Ireland, and a GB-wide system is modelled as a
  // cross-territory jurisdiction covering England, Scotland and Wales.
  'united-kingdom': {
    national: 'UK-wide',
    other: 'Other nationwide listings',
    country: 'Constituent countries',
    province: 'Constituent countries',
    'cross-territory': 'Cross-territory jurisdictions',
  },
  poland: { national: 'National', other: 'Other nationwide listings' },
  'czech-republic': { national: 'National', other: 'Other nationwide listings' },
  'european-union': { national: 'Union-wide', other: 'Other Union-wide listings' },
  global: { national: 'Global', other: 'Other global listings' },
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
    const known = Object.keys(vocabulary).filter((k) => k !== NATIONAL_KEY && k !== OTHER_KEY);
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
  return Object.keys(vocabulary).filter((k) => k !== NATIONAL_KEY && k !== OTHER_KEY);
}

// --- geographic codes -------------------------------------------------------
// STRUCTURAL validation only. No ISO 3166 dataset is embedded, so nothing here
// asserts that a well-formed code is a real subdivision — only that it has the
// right shape and belongs to the country it claims. Claiming more would be a
// promise this repository cannot keep without maintaining the list.
//
// ISO 3166-1 alpha-2: exactly two uppercase ASCII letters. Anchored, so "usa",
// "Us", "U5", " US " and "" are all refused.
const ISO = require('./iso-3166-2.cjs');

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

// --- cross-territory coverage ------------------------------------------------
// A jurisdiction is identified either by ONE ISO 3166-2 code, or — when it
// spans several subdivisions and has no code of its own — by the SET of codes
// it covers. England and Wales is the case that forces this: it is one legal
// jurisdiction over two ISO subdivisions, and inventing "GB-EAW" to name it
// would put a deprecated non-ISO identifier into a field that claims to hold
// ISO codes.
//
// `covers` is stored sorted so that the same set is always the same bytes and
// the same identity. Sorting is done here rather than left to the author,
// because two records covering the same territory in different orders would
// otherwise be two different jurisdictions.
const sortedCovers = (covers) => (Array.isArray(covers) ? [...covers].sort() : covers);

// Returns a list of reasons `covers` is unusable, or [] if it is fine. The
// caller supplies the parent country's ISO 3166-1 code so membership can be
// checked; without it that particular check is skipped rather than faked.
function coversProblems(covers, parentIso2) {
  const out = [];
  if (!Array.isArray(covers)) return ['must be an array of ISO 3166-2 codes'];
  if (covers.length < 2) {
    out.push('must list at least two subdivisions; a single-subdivision '
      + 'jurisdiction uses "code" instead');
  }
  const seen = new Set();
  for (const code of covers) {
    if (typeof code !== 'string') { out.push(`contains a ${typeof code}, not a code`); continue; }
    if (seen.has(code)) out.push(`lists ${JSON.stringify(code)} more than once`);
    seen.add(code);
    const shape = iso3166_2Problem(code);
    if (shape) { out.push(`${JSON.stringify(code)} ${shape}`); continue; }
    const unknown = ISO.unknownCodeProblem(code);
    if (unknown) { out.push(`${JSON.stringify(code)} ${unknown}`); continue; }
    if (parentIso2 && !code.startsWith(`${parentIso2}-`)) {
      out.push(`${JSON.stringify(code)} does not belong to the parent country "${parentIso2}"`);
    }
  }
  // The stored order is part of the identity, so an unsorted array is a fault
  // to report rather than something to quietly fix on the way past.
  const sorted = [...covers].filter((c) => typeof c === 'string').sort();
  const given = covers.filter((c) => typeof c === 'string');
  if (given.length === sorted.length && given.join(',') !== sorted.join(',')) {
    out.push(`must be sorted; expected [${sorted.join(', ')}]`);
  }
  return out;
}

// Exactly one of code / covers. Both is ambiguous; neither leaves the
// jurisdiction unidentifiable.
function codeCoversProblem(jurisdiction) {
  const hasCode = jurisdiction.code !== null && jurisdiction.code !== undefined;
  const hasCovers = jurisdiction.covers !== null && jurisdiction.covers !== undefined;
  if (hasCode && hasCovers) {
    return 'carries both "code" and "covers"; a jurisdiction has one code, or covers '
      + 'several subdivisions, never both';
  }
  if (!hasCode && !hasCovers) {
    return 'carries neither "code" nor "covers"; one is required to identify the territory';
  }
  return null;
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
  if (jurisdiction.code) {
    return { key: `${parent}|${type}|code:${jurisdiction.code}`, by: 'code' };
  }
  // A covers set identifies the territory as firmly as a code does, and sorting
  // it means the same two subdivisions in either order are one jurisdiction.
  if (Array.isArray(jurisdiction.covers) && jurisdiction.covers.length) {
    return { key: `${parent}|${type}|covers:${sortedCovers(jurisdiction.covers).join(',')}`, by: 'covers' };
  }
  return { key: `${parent}|${type}|name:${normaliseJurisdictionName(jurisdiction.name)}`, by: 'name' };
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
  // Added for Wave 1C-3 completion, for the same reason and in the same
  // direction: a system that publishes procurement NOTICES is not a register of
  // suppliers, and a registered design right is neither a trade mark nor a
  // patent. Both were held back as classification blockers rather than forced
  // into a neighbouring type.
  'public-procurement-notice-database',
  'registered-design-register',
  // Added for Wave 1F.1, for the same reason again: five verified EU systems had
  // no honest fit and were held back as classification blockers rather than
  // squeezed into a neighbouring type. The two sanctions types are deliberately
  // SEPARATE from each other and from exclusion-and-debarment-register: a regime
  // is not a designation, and a designation under a restrictive-measures regime
  // is not a debarment from a funding programme.
  'clinical-trial-register',
  'geographical-indication-register',
  'sanctions-and-restrictive-measures-index',
  'sanctions-designation-list',
  'plant-protection-product-authorisation-register',
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
  'manualReview',
  // Commercial listing schema — the action, verification and claim axes that
  // submissionModel (a cost enum) cannot express.
  'listingAction', 'verificationMethods', 'ownerResponseSupport', 'claimUrl',
  'audienceGeography', 'priority', 'currentStatus', 'publicProfileAvailable',
  'accepts',
  'backlinkType', 'robots', 'sitemap', 'indexed', 'ssl',
  'lastVerified', 'nextVerification', 'verification', 'related',
  'bestFor', 'notRecommendedFor', 'submissionDifficulty', 'listingQuality',
  'typicalApprovalTime', 'reviewProcess', 'commonMistakes', 'preparationChecklist',
  'requiredAssets', 'recommendedIndustries', 'editorialTags', 'pros', 'cons', 'editorNotes',
  // Directory Intelligence v2. One nested object rather than ten loose columns:
  // the attributes are read together, and a single key keeps the projection able
  // to drop the whole layer while it is unpopulated.
  'intelligence',
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
  jurisdiction: ['type', 'name', 'code', 'covers', 'parentCountry'],
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

// --- shared measured-domain snapshot consistency -----------------------------
// A Domain Rating is a fact about a DOMAIN, so the dataset may hold exactly one
// snapshot per measured domain. Two records reporting 92 and 78 for the same
// domain, or the same value under two different dates or providers, would
// publish two contradictory facts about one thing.
//
// Reuse is legitimate and collects nothing: a second registry on an
// already-measured domain repeats the stored value, provider, date and status
// verbatim. What this function rejects is a snapshot that DIFFERS from the one
// the dataset already holds for that domain, and a snapshot copied onto a
// record whose own site is a different domain.
//
// A record on an already-measured domain may still carry `domainRating: null` —
// the value is optional, not mandatory — but only with an explicit reason in
// editorNotes, so that "we chose not to reuse it" can never be confused with
// "someone forgot". The marker is deliberately literal and greppable.
const DR_OMISSION_MARKER = /Domain Rating not reused:/;

function sharedDomainSnapshotProblems(records) {
  const problems = [];
  const list = Array.isArray(records) ? records : [];
  const byDomain = new Map();

  for (const r of list) {
    if (!r || typeof r !== 'object') continue;
    const p = (r.metricsProvenance || {}).domainRating;
    if (!p || !p.measuredDomain) continue;

    // A snapshot must describe the record's own site. Copying a value onto a
    // record hosted somewhere else attributes another domain's authority to it.
    const own = normaliseDomain(r.website);
    if (own && p.measuredDomain !== own) {
      problems.push({
        id: r.id,
        field: 'metricsProvenance.domainRating.measuredDomain',
        reason: `Is "${p.measuredDomain}" but this record's own measured domain is "${own}". `
          + 'A Domain Rating may only be reused on the exact domain it was measured on; '
          + 'copying it to a related domain or from a parent domain to a subdomain '
          + 'attributes a measurement the number does not make.',
      });
      continue;
    }

    if (!byDomain.has(p.measuredDomain)) byDomain.set(p.measuredDomain, []);
    byDomain.get(p.measuredDomain).push(r);
  }

  // Every record on one measured domain must repeat one identical snapshot.
  for (const [domain, rs] of byDomain) {
    if (rs.length < 2) continue;
    const [first] = rs;
    const fp = first.metricsProvenance.domainRating;
    for (const r of rs.slice(1)) {
      const p = r.metricsProvenance.domainRating;
      const mismatch = (field, a, b) => {
        if (a === b) return;
        problems.push({
          id: r.id,
          field: field === 'domainRating' ? 'domainRating' : `metricsProvenance.domainRating.${field}`,
          reason: `Is ${JSON.stringify(b)} but "${first.id}" reports ${JSON.stringify(a)} for the same `
            + `measured domain "${domain}". One domain has one dated snapshot; records sharing it `
            + 'must repeat it verbatim rather than carry differing figures.',
        });
      };
      mismatch('domainRating', first.domainRating, r.domainRating);
      mismatch('provider', fp.provider, p.provider);
      mismatch('measuredAt', fp.measuredAt, p.measuredAt);
      mismatch('status', fp.status, p.status);
    }
  }

  // A null on an already-measured domain is allowed, but must be deliberate.
  const measured = new Map();
  for (const [domain, rs] of byDomain) measured.set(domain, rs[0].id);
  for (const r of list) {
    if (!r || typeof r !== 'object') continue;
    if (r.domainRating !== null && r.domainRating !== undefined) continue;
    const own = normaliseDomain(r.website);
    if (!own || !measured.has(own)) continue;
    if (DR_OMISSION_MARKER.test(r.editorNotes || '')) continue;
    problems.push({
      id: r.id,
      field: 'domainRating',
      reason: `Is null on "${own}", which "${measured.get(own)}" has already measured. Reuse that `
        + 'domain\'s stored snapshot verbatim, or record why it is not reused by writing '
        + '"Domain Rating not reused: <reason>" in editorNotes.',
    });
  }

  return problems;
}

module.exports = {
  LISTING_ACTIONS,
  VERIFICATION_METHODS,
  PILLAR_A_CATEGORIES,
  isGovernmentPillar,
  defaultListingAction,
  AUDIENCE_GEOGRAPHIES, PRIORITIES, CURRENT_STATUSES,
  priorityRank, compareStable, operationsProblems, isActionableOpportunity,
  applyContractProblems,
  DR_OMISSION_MARKER, sharedDomainSnapshotProblems,
  NESTED_RECORD_KEYS, METRIC_PROVENANCE_KEYS, OBJECT_VALUED_FIELDS, ARRAY_VALUED_FIELDS,
  RESOURCE_IDENTITY_KEYS, CANONICAL_DOMAIN_RE, canonicalDomainProblem,
  normaliseForComparison, urlsAreMateriallyDifferent,
  ENTITY_TYPES, SCOPES, SCOPE_DEFINITIONS, JURISDICTION_TYPES,
  ISO_3166_1_RE, ISO_3166_2_RE, iso3166_2Problem,
  normaliseJurisdictionName, jurisdictionIdentity, jurisdictionNameKey,
  sortedCovers, coversProblems, codeCoversProblem, ISO,
  JURISDICTION_VOCABULARY, NATIONAL_KEY, OTHER_KEY, DEFAULT_NATIONAL_LABEL,
  jurisdictionLabel, allowedJurisdictionTypes,
  ENGLISH_NAME_SOURCES, displayName, isEditorialTranslation,
  REGISTRY_TYPES, OPERATOR_TYPES, ACCESS_LEVELS, PUBLIC_ACCESS_BOOLEANS, accessContradictions,
  ACCESS_LEVEL_LABELS, OPERATOR_TYPE_LABELS, SCOPE_LABELS, ACCESS_UNKNOWN_NOTE,
  ACCESS_LEVEL_DEFINITIONS, ACCESS_LIMITATION_FLAGS,
  KNOWN_RECORD_KEYS,
  TIERS, BACKLINK_TYPES, ROBOTS_STATES, SUBMISSION_MODELS, METRIC_STATUSES,
  SUBMISSION_MODEL_LABELS, SUBMISSION_NOT_APPLICABLE_NOTE, SUBMITTABLE_MODELS,
  METRIC_SNAPSHOT_STATUS, METRIC_READING_STATUS, METRIC_PROVENANCE_STATUSES,
  domainRatingProblems,
  backlinkProblems,
  LINK_TARGET_TYPES,
  LISTING_INDEXABILITY,
  METRIC_PROVIDERS, DOMAIN_RATING_RANGE, AHREFS_ATTRIBUTION,
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
