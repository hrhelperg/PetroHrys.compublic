'use strict';
const { loadRegistry, reservedSlugs } = require('./lib/bd-registry.cjs');
const S = require('./lib/bd-schema.cjs');

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

    for (const field of S.REQUIRED_STRINGS) {
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

    // --- enumerations -------------------------------------------------------
    for (const [field, allowed] of [['tier', S.TIERS], ['backlinkType', S.BACKLINK_TYPES],
      ['robots', S.ROBOTS_STATES]]) {
      if (!isNullish(entry[field]) && !allowed.includes(entry[field])) {
        add(field, `Field "${field}" has invalid value "${entry[field]}". Allowed: ${allowed.join(', ')}.`);
      }
    }
    if (!S.SUBMISSION_MODELS.includes(entry.submissionModel)) {
      add('submissionModel', `Must be one of: ${S.SUBMISSION_MODELS.join(', ')}.`);
    }
    if (!S.METRIC_STATUSES.includes(entry.metricStatus)) {
      add('metricStatus', `Must be one of: ${S.METRIC_STATUSES.join(', ')}.`);
    }

    // --- tri-state booleans (null means not established) --------------------
    for (const field of S.NULLABLE_BOOLEANS) {
      if (!isNullish(entry[field]) && typeof entry[field] !== 'boolean') {
        add(field, `Field "${field}" must be true, false, or null for unknown.`);
      }
    }

    // --- accepts ------------------------------------------------------------
    if (!entry.accepts || typeof entry.accepts !== 'object' || Array.isArray(entry.accepts)) {
      add('accepts', 'Field "accepts" must be an object of audience flags.');
    } else {
      for (const key of S.ACCEPTS_KEYS) {
        if (!(key in entry.accepts)) {
          add('accepts', `Missing audience flag "${key}". Use null for unknown.`);
        } else if (!isNullish(entry.accepts[key]) && typeof entry.accepts[key] !== 'boolean') {
          add('accepts', `Audience flag "${key}" must be true, false, or null.`);
        }
      }
      for (const key of Object.keys(entry.accepts)) {
        if (!S.ACCEPTS_KEYS.includes(key)) add('accepts', `Unknown audience flag "${key}".`);
      }
    }

    // --- verification -------------------------------------------------------
    const v = entry.verification;
    if (!v || typeof v !== 'object' || Array.isArray(v)) {
      add('verification', 'Field "verification" must be an object.');
    } else {
      if (!S.VERIFICATION_STATUSES.includes(v.status)) {
        add('verification.status', `Must be one of: ${S.VERIFICATION_STATUSES.join(', ')}.`);
      }
      if (!isNullish(v.source) && !S.VERIFICATION_SOURCES.includes(v.source)) {
        add('verification.source', `Must be one of: ${S.VERIFICATION_SOURCES.join(', ')}.`);
      }
      if (!Array.isArray(v.reviewers)) {
        add('verification.reviewers', 'Reviewers must be an array, so multiple reviewers are possible.');
      } else {
        for (const reviewer of v.reviewers) {
          if (!reviewer || typeof reviewer.id !== 'string' || typeof reviewer.name !== 'string') {
            add('verification.reviewers', 'Each reviewer needs an id and a name.');
          }
        }
      }
      if (v.status === 'verified') {
        if (!entry.lastVerified) add('verification.status', 'A verified record must carry lastVerified.');
        if (!v.source) add('verification.source', 'A verified record must record how it was verified.');
        if (Array.isArray(v.reviewers) && v.reviewers.length === 0) {
          add('verification.reviewers', 'A verified record must name at least one reviewer.');
        }
      }
    }

    // --- metrics ------------------------------------------------------------
    for (const field of S.NUMERIC_METRICS) {
      const value = entry[field];
      if (isNullish(value)) continue;
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        add(field, `Field "${field}" must be a finite number or null, got ${JSON.stringify(value)}.`);
      } else if (S.SCORE_FIELDS.includes(field) && (value < 0 || value > 100)) {
        add(field, `Field "${field}" is out of range 0-100: ${value}.`);
      } else if (S.COUNT_FIELDS.includes(field) && value < 0) {
        add(field, `Field "${field}" must not be negative: ${value}.`);
      }
    }

    if (isNullish(entry.lastVerified)) {
      for (const field of S.NUMERIC_METRICS) {
        if (!isNullish(entry[field])) add(field, `Field "${field}" is populated but lastVerified is null.`);
      }
      if (!isNullish(entry.petroHrysScore)) {
        add('petroHrysScore', 'Field "petroHrysScore" is populated but lastVerified is null.');
      }
    }

    for (const field of S.THIRD_PARTY_METRICS) {
      if (isNullish(entry[field])) continue;
      const provenance = (entry.metricsProvenance || {})[field];
      if (!provenance || !provenance.provider || !provenance.measuredAt) {
        add(field, `Third-party metric "${field}" requires provenance (provider and measuredAt).`);
      } else if (!S.DATE_RE.test(provenance.measuredAt)) {
        add(field, `Provenance measuredAt for "${field}" must be an ISO date (YYYY-MM-DD).`);
      }
      if (entry.metricStatus === 'unknown') {
        add('metricStatus', `Metric "${field}" is populated, so metricStatus cannot be "unknown".`);
      }
    }

    // --- PetroHrys Score ----------------------------------------------------
    if (!isNullish(entry.petroHrysScore)) {
      if (typeof entry.petroHrysScore !== 'number' || entry.petroHrysScore < 0 || entry.petroHrysScore > 100) {
        add('petroHrysScore', `Field "petroHrysScore" is out of range 0-100: ${entry.petroHrysScore}.`);
      }
      if (!entry.scoreFactors || typeof entry.scoreFactors !== 'object') {
        add('scoreFactors', 'A published score must record the ten editorial factors it was derived from.');
      } else {
        for (const { key } of S.SCORE_FACTORS) {
          const value = entry.scoreFactors[key];
          if (typeof value !== 'number' || value < 0 || value > 10) {
            add('scoreFactors', `Factor "${key}" must be a number from 0 to 10.`);
          }
        }
        const expected = S.computeScore(entry.scoreFactors);
        if (expected !== null && expected !== entry.petroHrysScore) {
          add('petroHrysScore',
            `Score ${entry.petroHrysScore} does not match its weighted factors, which give ${expected}.`);
        }
      }
    }

    // --- arrays, dates, uniqueness ------------------------------------------
    for (const field of S.ARRAY_FIELDS) {
      const value = entry[field];
      if (!Array.isArray(value)) add(field, `Field "${field}" must be an array of strings.`);
      else if (!value.every((item) => typeof item === 'string')) {
        add(field, `Field "${field}" must contain only strings.`);
      }
    }
    if (!isNullish(entry.editorNotes) && typeof entry.editorNotes !== 'string') {
      add('editorNotes', 'Field "editorNotes" must be a string.');
    }
    for (const field of ['lastVerified', 'nextVerification']) {
      if (!isNullish(entry[field]) && !S.DATE_RE.test(entry[field])) {
        add(field, `Field "${field}" must be an ISO date (YYYY-MM-DD).`);
      }
    }
    if (entry.lastVerified && entry.nextVerification && !(entry.nextVerification > entry.lastVerified)) {
      add('nextVerification', 'nextVerification must be later than lastVerified.');
    }

    if (id !== null) {
      if (seenId.has(id)) add('id', `Duplicate id "${id}".`);
      seenId.add(id);
    }
    if (typeof entry.country === 'string' && typeof entry.slug === 'string') {
      const slugKey = `${entry.country}/${entry.slug}`;
      if (seenSlug.has(slugKey)) add('slug', `Duplicate slug "${entry.slug}" within country "${entry.country}".`);
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
  if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else console.log(formatReport(result));
  if (!result.ok) process.exit(1);
}

module.exports = { validateRegistry, formatReport };
