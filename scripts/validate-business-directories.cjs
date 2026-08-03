'use strict';
const { loadRegistry, reservedSlugs } = require('./lib/bd-registry.cjs');

const ENUMS = {
  tier: ['tier1', 'tier2', 'tier3'],
  backlinkType: ['dofollow', 'nofollow', 'sponsored', 'ugc', 'mixed', 'none'],
  robots: ['allowed', 'disallowed', 'partial', 'unknown'],
};

const SCORE_FIELDS = ['petroHrysScore', 'domainRating', 'authorityScore'];
const COUNT_FIELDS = ['estimatedTraffic', 'referringDomains', 'httpStatus'];
const NUMERIC_FIELDS = [...SCORE_FIELDS, ...COUNT_FIELDS];
const THIRD_PARTY_FIELDS = ['domainRating', 'authorityScore', 'estimatedTraffic', 'referringDomains'];
const BOOLEAN_FIELDS = [
  'free', 'paid', 'verificationRequired', 'manualReview', 'acceptsCompanies',
  'acceptsProducts', 'acceptsSaaS', 'acceptsApps', 'acceptsStartups', 'acceptsAI',
  'sitemap', 'indexed', 'ssl',
];
const REQUIRED_STRINGS = ['id', 'name', 'slug', 'country', 'category', 'website', 'description'];
const ARRAY_FIELDS = ['recommendedIndustries', 'pros', 'cons'];
const DATE_FIELDS = ['lastVerified', 'nextVerification'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const isNullish = (v) => v === null || v === undefined;

// Code-unit comparison; localeCompare would make ordering depend on the
// platform's ICU build.
function cmp(a, b) {
  const as = String(a ?? '');
  const bs = String(b ?? '');
  if (as < bs) return -1;
  if (as > bs) return 1;
  return 0;
}

function fileFor(entry) {
  const country = typeof entry.country === 'string' && entry.country ? entry.country : '<unknown>';
  return `data/business-directories/directories/${country}.json`;
}

function canonicalDomain(website) {
  try {
    return new URL(website).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

function validateRegistry(registry) {
  const errors = [];
  const countries = registry.countries || [];
  const categories = registry.categories || [];
  const directories = registry.directories || [];

  const countrySlugs = new Set(countries.map((c) => c.slug));
  const categorySlugs = new Set(categories.map((c) => c.slug));
  const reserved = reservedSlugs(categories);

  const seenId = new Set();
  const seenSlug = new Set();
  const seenDomain = new Set();

  for (const entry of directories) {
    const file = fileFor(entry);
    const id = typeof entry.id === 'string' && entry.id ? entry.id : null;
    const add = (field, reason) => errors.push({ file, id, field, reason });

    for (const field of REQUIRED_STRINGS) {
      if (typeof entry[field] !== 'string' || entry[field].length === 0) {
        add(field, `Required field "${field}" must be a non-empty string.`);
      }
    }

    if (typeof entry.website === 'string' && !entry.website.startsWith('https://')) {
      add('website', 'Website must use https.');
    }

    if (typeof entry.slug === 'string' && reserved.has(entry.slug)) {
      add('slug', `Slug "${entry.slug}" is a reserved slug and cannot be used.`);
    }

    if (typeof entry.country === 'string' && !countrySlugs.has(entry.country)) {
      add('country', `References unknown country "${entry.country}".`);
    }
    if (typeof entry.category === 'string' && !categorySlugs.has(entry.category)) {
      add('category', `References unknown category "${entry.category}".`);
    }

    for (const [field, allowed] of Object.entries(ENUMS)) {
      if (!isNullish(entry[field]) && !allowed.includes(entry[field])) {
        add(field, `Field "${field}" has invalid value "${entry[field]}". Allowed: ${allowed.join(', ')}.`);
      }
    }

    for (const field of NUMERIC_FIELDS) {
      const value = entry[field];
      if (isNullish(value)) continue;
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        add(field, `Field "${field}" must be a finite number or null, got ${JSON.stringify(value)}.`);
      } else if (SCORE_FIELDS.includes(field) && (value < 0 || value > 100)) {
        add(field, `Field "${field}" is out of range 0-100: ${value}.`);
      } else if (COUNT_FIELDS.includes(field) && value < 0) {
        add(field, `Field "${field}" must not be negative: ${value}.`);
      }
    }

    for (const field of BOOLEAN_FIELDS) {
      if (!isNullish(entry[field]) && typeof entry[field] !== 'boolean') {
        add(field, `Field "${field}" must be a boolean or null, got ${JSON.stringify(entry[field])}.`);
      }
    }

    for (const field of ARRAY_FIELDS) {
      const value = entry[field];
      if (!Array.isArray(value)) {
        add(field, `Field "${field}" must be an array of strings.`);
      } else if (!value.every((item) => typeof item === 'string')) {
        add(field, `Field "${field}" must contain only strings.`);
      }
    }

    if (!isNullish(entry.editorNotes) && typeof entry.editorNotes !== 'string') {
      add('editorNotes', 'Field "editorNotes" must be a string.');
    }

    for (const field of DATE_FIELDS) {
      if (!isNullish(entry[field]) && !DATE_RE.test(entry[field])) {
        add(field, `Field "${field}" must be an ISO date (YYYY-MM-DD).`);
      }
    }

    // Honesty gate: an unverified record may not carry measurements.
    if (isNullish(entry.lastVerified)) {
      for (const field of NUMERIC_FIELDS) {
        if (!isNullish(entry[field])) {
          add(field, `Field "${field}" is populated but lastVerified is null.`);
        }
      }
    }

    for (const field of THIRD_PARTY_FIELDS) {
      if (isNullish(entry[field])) continue;
      const provenance = (entry.metricsProvenance || {})[field];
      if (!provenance || !provenance.provider || !provenance.measuredAt) {
        add(field, `Third-party metric "${field}" requires provenance (provider and measuredAt).`);
      } else if (!DATE_RE.test(provenance.measuredAt)) {
        add(field, `Provenance measuredAt for "${field}" must be an ISO date (YYYY-MM-DD).`);
      }
    }

    if (entry.lastVerified && entry.nextVerification
        && !(entry.nextVerification > entry.lastVerified)) {
      add('nextVerification', 'nextVerification must be later than lastVerified.');
    }

    if (id !== null) {
      if (seenId.has(id)) add('id', `Duplicate id "${id}".`);
      seenId.add(id);
    }

    if (typeof entry.country === 'string' && typeof entry.slug === 'string') {
      const slugKey = `${entry.country}/${entry.slug}`;
      if (seenSlug.has(slugKey)) {
        add('slug', `Duplicate slug "${entry.slug}" within country "${entry.country}".`);
      }
      seenSlug.add(slugKey);

      // Per country only: one service may legitimately serve several countries.
      const domain = canonicalDomain(entry.website);
      if (domain) {
        const domainKey = `${entry.country}/${domain}`;
        if (seenDomain.has(domainKey)) {
          add('website', `Duplicate canonical domain "${domain}" within country "${entry.country}".`);
        }
        seenDomain.add(domainKey);
      }
    }
  }

  errors.sort((a, b) => cmp(a.file, b.file) || cmp(a.id, b.id)
    || cmp(a.field, b.field) || cmp(a.reason, b.reason));

  return { ok: errors.length === 0, errors };
}

function formatReport(result) {
  if (result.ok) return 'Business directories registry is valid.';
  const lines = result.errors.map(
    (e) => `  ${e.file} [${e.id ?? '(no id)'}] ${e.field}: ${e.reason}`);
  const count = result.errors.length;
  return `${lines.join('\n')}\n\n${count} validation error${count === 1 ? '' : 's'}.`;
}

if (require.main === module) {
  const result = validateRegistry(loadRegistry());
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatReport(result));
  }
  if (!result.ok) process.exit(1);
}

module.exports = { validateRegistry, formatReport };
