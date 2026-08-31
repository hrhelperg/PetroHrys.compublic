'use strict';

// Media, PR & Publishing Platforms — a fourth, separate Research Center dataset.
//
// The three that already exist answer three different questions:
//
//   Business Directories        where can a company create a PROFILE?
//   Marketplace & Classifieds   where can a company publish a LISTING?
//   Media, PR & Publishing      where can a company publish, submit, pitch,
//                               sponsor, launch or contribute EXPERTISE?
//
// The separation is not tidiness. An earlier wave merged two record shapes into
// one file and 49 assertions failed, because those assertions protected real
// properties of one shape that the other did not have. A media record has an
// opportunity model and no listing action, no Domain Rating, no editorial score
// and no detail page; forcing it into either sibling schema would mean lying in
// whichever fields did not apply.
//
// Geography comes from the business-directory country file, because a country is
// a country and duplicating that list would let two files disagree about whether
// Serbia exists.
//
// ── THE RULE THIS FILE EXISTS TO ENFORCE ────────────────────────────────────
//
// A media outlet merely existing is not an opportunity. A contact page is not a
// submission route. An advertising rate card is not a guest-post programme. A
// newsroom email is not proof that contributed articles are accepted. So every
// URL field is bound to the opportunity type that would make it meaningful: a
// record cannot carry a pitchUrl without claiming editorial-pitch, and cannot
// claim press-release while pointing the reader at an editorial pitch form.
//
// Where the evidence cannot establish a usable route, the honest answer is
// opportunityTypes: ['unknown'] — and the record still has value, because
// knowing a publication is relevant but unverified is worth more than a guess.

const fs = require('node:fs');
// For the shared Domain Rating rule.
const BD = require('./bd-schema.cjs');

class MediaError extends Error {}

// ── opportunity model ───────────────────────────────────────────────────────
// What a company can actually DO here. Never inferred one from another: a
// publication that runs sponsored content has not thereby opened editorial
// pitches, and a press-release wire is not a contributed-article programme.
const OPPORTUNITY_TYPES = [
  'self-publish',            // the user publishes directly, no gatekeeper
  'press-release',           // accepts or distributes press releases
  'editorial-submission',    // a formal content/news submission process exists
  'editorial-pitch',         // story ideas accepted; publication not guaranteed
  'contributed-article',     // outside experts can submit substantive articles
  'guest-application',       // a standing application to become a contributor
  'startup-launch',          // explicitly accepts startup announcements
  'product-launch',          // explicitly accepts product announcements
  'expert-source',           // the company can register as an expert source
  'journalist-source',       // journalists post requests; experts answer them
  'podcast-guest',           // a documented guest pitch or application path
  'newsletter-submission',   // a newsletter accepts submissions or features
  'sponsored-content',       // commercial placement / advertorial
  'media-partnership',       // event, content or distribution partnership
  'company-profile',         // a media profile distinct from a directory listing
  'award-entry',             // editorial or industry awards with public entries
  'unknown',                 // relevant, but no route could be established
];

// Types that mean "an editor decides". Kept as a set because several rules turn
// on the distinction between a route you walk through and a door you knock on.
const GATEKEPT_TYPES = new Set(['editorial-submission', 'editorial-pitch',
  'contributed-article', 'guest-application', 'podcast-guest', 'award-entry']);

// Types where the company itself publishes, with no editor in the path. The
// difference from the set above is the whole reason both exist: telling a PR
// employee "you can publish here" when an editor has to accept it first wastes
// their week.
const SELF_SERVE_TYPES = new Set(['self-publish', 'press-release', 'company-profile']);

// ── what kind of publication it is ──────────────────────────────────────────
// A closed vocabulary, deliberately small. Dozens of near-duplicate names would
// make the category filter useless: nobody can choose between "tech-media",
// "technology-news" and "it-media" when all three exist.
const CATEGORIES = [
  'global-business-media',
  'local-business-media',
  'technology-media',
  'startup-media',
  'ai-media',
  'saas-media',
  'cybersecurity-media',
  'marketing-media',
  'advertising-media',
  'finance-media',
  'fintech-media',
  'manufacturing-media',
  'industrial-media',
  'telecom-media',
  'hr-recruitment-media',
  'logistics-media',
  'energy-cleantech-media',
  'engineering-media',
  'construction-media',
  'real-estate-media',
  'healthcare-media',
  'legal-media',
  'ecommerce-retail-media',
  'travel-hospitality-media',
  // Agriculture, agtech and food production. The only vertical in the Wave 3
  // matrix with no category at all; `agriculture` already existed as an
  // INDUSTRY, which is the sector a company pitches about, not the kind of
  // publication doing the pitching.
  'agriculture-food-media',
  'automotive-media',
  'developer-open-source-media',
  'press-release-distribution',
  'journalist-source-platform',
  'podcast-platform',
  'newsletter-platform',
  'contributor-platform',
  'startup-launch-platform',
  // Awards are not a publication: the artefact is a nomination deadline and a
  // public winner page. The `award-entry` opportunity type already existed in
  // the vocabulary and is reused; only the platform category was missing.
  'business-awards',
];

// The sector a company would be pitching ABOUT, which is not the same as the
// publication's own category: TechCrunch is startup-media and covers fintech,
// AI and ecommerce alike.
const INDUSTRIES = [
  'ai', 'saas', 'software', 'cloud', 'cybersecurity', 'telecom', 'fintech',
  'finance', 'insurance', 'marketing', 'advertising', 'ecommerce', 'retail',
  'manufacturing', 'industrial', 'logistics', 'energy', 'engineering',
  'construction', 'real-estate', 'healthcare', 'biotech', 'legal', 'hr',
  'education', 'travel', 'hospitality', 'automotive', 'mobility', 'agriculture',
  'media', 'gaming', 'crypto', 'open-source', 'devops', 'hardware', 'general',
];

// Who the publication reaches. Distinct from `country`, which is where it is
// published: Reuters is published somewhere and read everywhere.
const AUDIENCE_GEOGRAPHIES = ['global', 'regional', 'national', 'local'];

// Editorial pitches being free does not make the platform free — most serious
// publications sell sponsorship alongside an open pitch box. Where both exist
// the honest answer is `mixed`, and flattening that to `free` would send a PR
// employee into a paywall they were told was not there.
const COST_MODELS = ['free', 'paid', 'freemium', 'mixed', 'unknown'];

const CURRENT_STATUSES = ['active', 'unknown', 'shutting-down', 'dormant', 'redirected'];

// P1 major reputable platform with a plausible route and real audience
// P2 strong niche, national, vertical or regional platform
// P3 legitimate but narrower opportunity
// hold valuable, but the route needs a human with a browser
// reject never shown in the actionable list
const PRIORITIES = ['P1', 'P2', 'P3', 'hold', 'reject'];

const REQUIRED = ['id', 'name', 'website', 'country', 'audienceGeography', 'categories',
  'currentStatus', 'priority', 'opportunityTypes', 'costModel', 'shortNote', 'sources'];

const URL_FIELDS = ['website', 'submissionUrl', 'pitchUrl', 'pressReleaseUrl',
  'advertisingUrl', 'mediaKitUrl', 'contactUrl'];

// Which opportunity types make each URL meaningful. A URL without one of them is
// a claim the record has not made — the exact failure this dataset is built to
// avoid, where a contact page silently becomes "they accept submissions".
const URL_REQUIRES = {
  submissionUrl: ['editorial-submission', 'contributed-article', 'self-publish',
    'startup-launch', 'product-launch', 'newsletter-submission', 'award-entry',
    'guest-application', 'podcast-guest', 'expert-source', 'journalist-source',
    'company-profile'],
  pitchUrl: ['editorial-pitch', 'podcast-guest', 'media-partnership'],
  pressReleaseUrl: ['press-release'],
  advertisingUrl: ['sponsored-content', 'media-partnership'],
  mediaKitUrl: ['sponsored-content', 'media-partnership'],
};

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HTTPS_RE = /^https:\/\/[^\s"'<>]+$/;
// Deliberately broad. Anything that looks like an address is refused outright
// rather than judged, because "is this address guessed or verified?" is exactly
// the judgment call that produces a fabricated newsroom@ contact.
const EMAILISH_RE = /[\w.+-]+@[\w-]+\.[\w.-]+|\bmailto:/i;

function problemsFor(row, knownCountries) {
  const p = [];
  const id = row && row.id ? row.id : '(unnamed)';
  const at = (f, m) => p.push([`${id} ${f}`, m]);
  if (!row || typeof row !== 'object') return [['(row)', 'is not an object.']];

  for (const f of REQUIRED) {
    const v = row[f];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) {
      at(f, 'is required.');
    }
  }
  if (typeof row.id === 'string') {
    if (!SLUG_RE.test(row.id)) at('id', 'must be a lowercase hyphenated slug.');
    // Namespaced, and disjoint from the marketplace namespace. A platform can
    // legitimately appear in two datasets — Medium is somewhere to self-publish
    // and PR Newswire distributes for a fee — but the two datasets must never
    // mean different things by one id.
    if (!row.id.startsWith('md-')) at('id', 'must be namespaced to this dataset with "md-".');
  }

  for (const f of URL_FIELDS) {
    const v = row[f];
    if (v === undefined || v === null) continue;
    if (typeof v !== 'string' || !HTTPS_RE.test(v)) at(f, 'must be an https URL, or null.');
  }

  if (row.country && !knownCountries.has(row.country)) {
    at('country', `"${row.country}" is not a declared country.`);
  }
  if (row.audienceGeography && !AUDIENCE_GEOGRAPHIES.includes(row.audienceGeography)) {
    at('audienceGeography', `must be one of ${AUDIENCE_GEOGRAPHIES.join(', ')}.`);
  }
  arrayOf(p, at, row, 'categories', CATEGORIES, { min: 1 });
  arrayOf(p, at, row, 'industries', INDUSTRIES, { min: 0 });
  arrayOf(p, at, row, 'opportunityTypes', OPPORTUNITY_TYPES, { min: 1 });

  if (row.languages !== undefined && row.languages !== null) {
    if (!Array.isArray(row.languages)) at('languages', 'must be an array, or absent.');
    else {
      for (const l of row.languages) {
        if (typeof l !== 'string' || !/^[a-z]{2}$/.test(l)) {
          at('languages', `"${l}" is not a two-letter language code.`);
        }
      }
      if ([...row.languages].sort().join(',') !== row.languages.join(',')) {
        at('languages', 'must be sorted.');
      }
    }
  }

  if (row.costModel && !COST_MODELS.includes(row.costModel)) {
    at('costModel', `must be one of ${COST_MODELS.join(', ')}.`);
  }
  if (row.currentStatus && !CURRENT_STATUSES.includes(row.currentStatus)) {
    at('currentStatus', `must be one of ${CURRENT_STATUSES.join(', ')}.`);
  }
  if (row.priority && !PRIORITIES.includes(row.priority)) {
    at('priority', `must be one of ${PRIORITIES.join(', ')}.`);
  }

  // ── the semantic rules ────────────────────────────────────────────────────

  // `unknown` is an admission, not a member of a list. A record claiming both
  // "we could not establish a route" and "you can pitch here" says nothing.
  const types = Array.isArray(row.opportunityTypes) ? row.opportunityTypes : [];
  if (types.includes('unknown') && types.length > 1) {
    at('opportunityTypes', 'combines "unknown" with a definite type.');
  }
  if (types.length !== new Set(types).size) at('opportunityTypes', 'repeats a type.');
  if ([...types].sort().join(',') !== types.join(',')) at('opportunityTypes', 'must be sorted.');

  // Every URL must be backed by a type that makes it meaningful.
  for (const [field, needed] of Object.entries(URL_REQUIRES)) {
    if (!row[field]) continue;
    if (!needed.some((t) => types.includes(t))) {
      at(field, `is set, but no opportunity type justifies it (needs one of ${needed.join(', ')}).`);
    }
  }
  // And the reverse for the two routes a reader will click first: claiming the
  // type with no URL is allowed (the route may be described in prose), but
  // claiming press-release while pointing only at an editorial pitch form is
  // the conflation this dataset exists to prevent.
  if (types.includes('press-release') && row.pressReleaseUrl && row.pitchUrl
    && row.pressReleaseUrl === row.pitchUrl) {
    at('pressReleaseUrl', 'is the same URL as the editorial pitch; those are different routes.');
  }
  if (types.includes('sponsored-content') && row.sponsoredContentAvailable === false) {
    at('sponsoredContentAvailable', 'is false while sponsored-content is claimed.');
  }
  if (row.sponsoredContentAvailable === true && !types.includes('sponsored-content')) {
    at('opportunityTypes', 'omits sponsored-content while sponsoredContentAvailable is true.');
  }
  // A paid-only platform whose only opportunity is an editorial pitch is a
  // contradiction: editors do not invoice for considering a story.
  if (row.costModel === 'paid' && types.length === 1 && types[0] === 'editorial-pitch') {
    at('costModel', 'is paid for an editorial pitch, which is a contradiction.');
  }
  // Self-serve publishing and gatekept submission are opposite claims about who
  // decides. A record asserting both must say which route is which in prose.
  const selfServe = types.filter((t) => SELF_SERVE_TYPES.has(t));
  const gatekept = types.filter((t) => GATEKEPT_TYPES.has(t));
  if (selfServe.length && gatekept.length && !row.limitations) {
    at('limitations', `claims both self-serve (${selfServe.join(', ')}) and gatekept `
      + `(${gatekept.join(', ')}) routes without explaining which is which.`);
  }
  // A gatekept route means an editor decides. Saying otherwise misleads.
  if (gatekept.length && row.requiresEditorialApproval === false) {
    at('requiresEditorialApproval', `is false while claiming ${gatekept.join(', ')}.`);
  }

  // ── evidence ──────────────────────────────────────────────────────────────
  if (row.shortNote !== undefined && typeof row.shortNote !== 'string') {
    at('shortNote', 'must be a string.');
  }
  if (typeof row.shortNote === 'string' && row.shortNote.trim().length < 20) {
    at('shortNote', 'is too short to say anything a reader can act on.');
  }
  if (row.limitations !== undefined && row.limitations !== null
    && typeof row.limitations !== 'string') {
    at('limitations', 'must be a string, or null.');
  }
  if (row.lastVerified !== undefined && row.lastVerified !== null
    && !DATE_RE.test(String(row.lastVerified))) {
    at('lastVerified', 'must be an ISO date, or null.');
  }
  if (row.sources !== undefined) {
    if (!Array.isArray(row.sources)) at('sources', 'must be an array.');
    else {
      for (const s of row.sources) {
        if (typeof s !== 'string' || !HTTPS_RE.test(s)) at('sources', `"${s}" is not an https URL.`);
      }
    }
  }
  for (const f of ['publicProfileAvailable', 'requiresEditorialApproval',
    'sponsoredContentAvailable']) {
    if (row[f] !== undefined && row[f] !== null && typeof row[f] !== 'boolean') {
      at(f, 'must be true, false or null.');
    }
  }
  if (row.editorialContact !== undefined && row.editorialContact !== null) {
    if (typeof row.editorialContact !== 'string') at('editorialContact', 'must be a string, or null.');
    // A desk or role name, never an address. Storing an address means deciding
    // whether it was verified or inferred, and an inferred newsroom@ address is
    // indistinguishable from a fabricated one.
    else if (EMAILISH_RE.test(row.editorialContact)) {
      at('editorialContact', 'contains an email address; store a desk or role name and a URL.');
    }
  }
  // No email anywhere in the record, in any field.
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === 'string' && EMAILISH_RE.test(v)) {
      at(k, 'contains an email address, which this dataset never stores.');
    }
  }
  // This dataset takes no metric measurements. The directory dataset holds a
  // frozen set of historical Domain Ratings and nothing here may imply a new one.
  // See the note in mp-schema.cjs: the ban became a rule when collection was
  // unfrozen, so a measured rating is admitted and an invented one is not.
  for (const [field, reason] of BD.domainRatingProblems(row)) at(field, reason);
  for (const [field, reason] of BD.backlinkProblems(row)) at(field, reason);
  // Internal workflow state belongs in nobody's public CSV.
  for (const priv of ['assignedTo', 'internalNote', 'workflowStatus', 'submittedAt',
    'followUpDate', 'owner', 'contactedOn']) {
    if (row[priv] !== undefined) at(priv, 'is private workflow state and cannot be published.');
  }
  return p;
}

function arrayOf(problems, at, row, field, vocabulary, { min }) {
  const v = row[field];
  if (v === undefined || v === null) {
    if (min > 0) at(field, 'is required.');
    return;
  }
  if (!Array.isArray(v)) { at(field, 'must be an array.'); return; }
  if (v.length < min) at(field, `needs at least ${min} value(s).`);
  for (const item of v) {
    if (!vocabulary.includes(item)) at(field, `"${item}" is not in the vocabulary.`);
  }
  if (v.length !== new Set(v).size) at(field, 'repeats a value.');
  if ([...v].sort().join(',') !== v.join(',')) at(field, 'must be sorted.');
}

// A row an employee can act on. Same shape of rule as the sibling datasets:
// a platform behind a bot filter is `unknown`, never dropped, because a WAF
// says the server answered and nothing about whether the route exists.
function isActionable(row) {
  if (!row) return false;
  if (row.priority === 'reject') return false;
  if (['shutting-down', 'dormant', 'redirected'].includes(row.currentStatus)) return false;
  return typeof row.website === 'string' && HTTPS_RE.test(row.website);
}

// Code-unit ordering. localeCompare would make the render depend on host ICU
// and the same data would produce different bytes on different machines.
const compareStable = (a, b) => {
  const as = String(a ?? '');
  const bs = String(b ?? '');
  if (as < bs) return -1;
  if (as > bs) return 1;
  return 0;
};

const PRIORITY_RANK = { P1: 0, P2: 1, P3: 2, hold: 3, reject: 4 };

// Highest-value work first, then alphabetical. A PR employee opens this page to
// find what to do on Monday, not to browse.
function comparePlatforms(a, b) {
  const pa = PRIORITY_RANK[a.priority] ?? 9;
  const pb = PRIORITY_RANK[b.priority] ?? 9;
  if (pa !== pb) return pa - pb;
  return compareStable(a.name, b.name) || compareStable(a.id, b.id);
}

const hostOf = (url) => String(url || '')
  .replace(/^https:\/\/(www\.)?/, '').split('/')[0].toLowerCase();

function loadMediaPlatforms(file, knownCountries) {
  if (!fs.existsSync(file)) return [];
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (cause) {
    throw new MediaError(`Corrupt media platforms file: ${cause.message}`);
  }
  if (!Array.isArray(raw)) throw new MediaError('media-platforms.json must contain an array.');

  const problems = [];
  const ids = new Set();
  const hosts = new Map();
  for (const row of raw) {
    problems.push(...problemsFor(row, knownCountries));
    if (ids.has(row.id)) problems.push([`${row.id}`, 'is declared twice.']);
    ids.add(row.id);
    // One publication, one record. A language edition, a mobile host, a section
    // and a submission form are all the same publication; the host is what tells
    // them apart from a genuinely separate title.
    const host = hostOf(row.website);
    if (hosts.has(host)) problems.push([`${row.id}`, `shares a host with ${hosts.get(host)}.`]);
    else hosts.set(host, row.id);
  }
  if (problems.length) {
    throw new MediaError(`media-platforms.json failed validation:\n${
      problems.map(([f, m]) => `  ${f}: ${m}`).join('\n')}`);
  }
  return raw.map((r) => ({
    ...r,
    categories: r.categories.slice(),
    industries: r.industries ? r.industries.slice() : [],
    languages: r.languages ? r.languages.slice() : [],
    opportunityTypes: r.opportunityTypes.slice(),
    sources: r.sources.slice(),
  }));
}

// ── routes ──────────────────────────────────────────────────────────────────
// Every media path is built here and nowhere else. The repository's route
// contract forbids interpolating a slug into a path inline, and the first
// version of the recommendation meta builder did exactly that inside bd-seo —
// which is how a section ends up with two spellings of its own URL.
const BASE_PATH = '/research/media-pr-publishing/';
const collectionPath = () => BASE_PATH;
const profilePath = (slug) => {
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) {
    throw new MediaError(`Invalid profile slug: ${JSON.stringify(slug)}`);
  }
  return `${BASE_PATH}for/${slug}/`;
};

module.exports = {
  MediaError, BASE_PATH, collectionPath, profilePath, OPPORTUNITY_TYPES, CATEGORIES, INDUSTRIES, AUDIENCE_GEOGRAPHIES,
  COST_MODELS, CURRENT_STATUSES, PRIORITIES, GATEKEPT_TYPES, SELF_SERVE_TYPES,
  URL_REQUIRES, URL_FIELDS, PRIORITY_RANK,
  problemsFor, isActionable, loadMediaPlatforms, comparePlatforms, compareStable, hostOf,
};
