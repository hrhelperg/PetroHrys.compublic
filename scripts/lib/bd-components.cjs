// scripts/lib/bd-components.cjs
'use strict';
const { escapeHtml } = require('./bd-util.cjs');
const { safeExternalUrl } = require('./bd-seo.cjs');
const { sortDirectories, SORTS, SORT_KEYS, compareByName } = require('./bd-sort.cjs');
const { directoryPathFor } = require('./bd-routes.cjs');
const S = require('./bd-schema.cjs');
const { registryTypeLabel } = require('./bd-registry-types.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOT_RECORDED = 'Not recorded';

// Editorial references, not paid placements. Every directory page carries
// original methodology, strengths, limitations and context, so outbound links
// are citations and must NOT be nofollowed — that would misrepresent a curated
// knowledge base as a link directory. Revisit per link only if sponsored or
// user-submitted listings are ever introduced.
const REL_EXTERNAL = 'noopener noreferrer';

const isNullish = (v) => v === null || v === undefined;

// Visually hidden text. Status and metrics must never be conveyed by colour or
// a bare glyph alone, so an em dash always carries a spoken equivalent.
function vh(text) {
  return `<span class="bd-vh">${escapeHtml(text)}</span>`;
}

function headingTag(level) {
  const n = Number.isInteger(level) ? Math.min(Math.max(level, 2), 6) : 3;
  return `h${n}`;
}

// Returns a safe href or null. Anything that is not http(s) — javascript:,
// data:, file:, malformed — is refused, and callers render plain text instead.
function safeHref(value) {
  return safeExternalUrl(value);
}

function dash() {
  return `<span class="bd-metric bd-metric--empty"><span aria-hidden="true">&mdash;</span>${vh(NOT_RECORDED)}</span>`;
}

// ---------------------------------------------------------------------------
// 1. Breadcrumbs
// ---------------------------------------------------------------------------

function breadcrumbs(trail) {
  if (!Array.isArray(trail) || trail.length === 0) return '';
  const items = trail.map((entry, index) => {
    const last = index === trail.length - 1;
    const inner = last
      ? `<span aria-current="page">${escapeHtml(entry.name)}</span>`
      : `<a href="${escapeHtml(entry.path)}">${escapeHtml(entry.name)}</a>`;
    const sep = last ? '' : '<span class="sep" aria-hidden="true">/</span>';
    return `      <li class="bd-crumb">${inner}${sep}</li>`;
  }).join('\n');
  return `    <nav class="breadcrumb bd-breadcrumb" aria-label="Breadcrumb">
      <ol class="bd-crumbs">
${items}
      </ol>
    </nav>`;
}

// ---------------------------------------------------------------------------
// 2. Page intro / hero
// ---------------------------------------------------------------------------

function pageIntro({ title, lede }) {
  const ledeHtml = lede ? `\n      <p class="lede">${escapeHtml(lede)}</p>` : '';
  return `    <article class="page-hero">
      <h1>${escapeHtml(title)}</h1>${ledeHtml}
    </article>`;
}

// ---------------------------------------------------------------------------
// 3 & 4. Country and category cards
// ---------------------------------------------------------------------------

// A pending route has not been written to disk, so it is rendered as text and
// never as a link — linking it would advertise a 404.
// "3 directories" / "1 directory". A count is only ever rendered when it is
// greater than zero: a card for an empty place is not published at all, so a
// zero here would mean the caller made a mistake rather than that the place is
// empty.
function countLabel(count) {
  if (!Number.isInteger(count) || count <= 0) return '';
  return ` <span class="bd-count">${count} ${count === 1 ? 'directory' : 'directories'}</span>`;
}

function countryCard({ name, path, count, pending = false, headingLevel = 3 }) {
  const h = headingTag(headingLevel);
  const title = pending
    ? `<span class="bd-pending">${escapeHtml(name)}</span>`
    : `<a href="${escapeHtml(path)}">${escapeHtml(name)}</a>`;
  return `        <li class="bd-card">
          <${h} class="bd-card-title">${title}${pending ? '' : countLabel(count)}</${h}>
        </li>`;
}

function categoryCard({ name, path, description, count, pending = false, headingLevel = 3 }) {
  const h = headingTag(headingLevel);
  const title = pending
    ? `<span class="bd-pending">${escapeHtml(name)}</span>`
    : `<a href="${escapeHtml(path)}">${escapeHtml(name)}</a>`;
  const body = description ? `\n          <p class="bd-card-body">${escapeHtml(description)}</p>` : '';
  return `        <li class="bd-card">
          <${h} class="bd-card-title">${title}${pending ? '' : countLabel(count)}</${h}>${body}
        </li>`;
}

function cardGrid(cards, { label } = {}) {
  if (!cards.length) return '';
  const labelAttr = label ? ` aria-label="${escapeHtml(label)}"` : '';
  return `      <ul class="bd-grid"${labelAttr}>
${cards.join('\n')}
      </ul>`;
}

// ---------------------------------------------------------------------------
// 7. Metrics
// ---------------------------------------------------------------------------

// Third-party metrics always render their provider and measurement date, so a
// reader never mistakes them for a PetroHrys measurement.
// `status` lets an unmeasured metric say "Unknown" rather than showing a bare
// dash with no explanation. It never substitutes a number.
// `emptyLabel` overrides that wording for a metric whose absence has a specific
// meaning. Domain Rating uses it: collection is frozen, so a missing value means
// "never measured", not "unknown to us" — and either way never 0.
function metric(value, provenance, status, emptyLabel) {
  if (isNullish(value)) {
    if (emptyLabel) return `<span class="bd-metric bd-metric--empty">${escapeHtml(emptyLabel)}</span>`;
    return status === 'unknown'
      ? `<span class="bd-metric bd-metric--empty">Unknown</span>`
      : dash();
  }
  const shown = escapeHtml(value);
  if (provenance && provenance.provider && provenance.measuredAt) {
    // "snapshot" is load-bearing: this site is generated offline and never reads
    // the provider at request time, so the number is always historical.
    return `<span class="bd-metric">${shown}<span class="bd-metric-source">`
      + `${escapeHtml(provenance.provider)} snapshot, measured `
      + `<time datetime="${escapeHtml(provenance.measuredAt)}">${escapeHtml(provenance.measuredAt)}</time>`
      + `</span></span>`;
  }
  return `<span class="bd-metric">${shown}</span>`;
}

const METRIC_ROWS = [
  ['petroHrysScore', 'PetroHrys Score', false],
  ['domainRating', 'Domain Rating', true, S.DR_NOT_MEASURED_LABEL],
  ['authorityScore', 'Authority Score', true],
  ['estimatedTraffic', 'Estimated traffic', true],
  ['referringDomains', 'Referring domains', true],
];

// A metric nobody has measured is not a per-record gap, it is a metric the
// dataset does not carry. Rendering 64 identical "Unknown" tiles for it states
// nothing and buries the values that do exist, so the row is dropped and the
// absence is stated once in metricNote(). The moment any record records a
// value the row returns on its own — this is derived, never a hard-coded list.
function activeMetricFields(records) {
  const list = Array.isArray(records) ? records : [];
  return METRIC_ROWS
    .filter(([field, , thirdParty]) => !thirdParty || list.some((r) => !isNullish(r[field])))
    .map(([field]) => field);
}

function metricsBlock(directory, active) {
  const provenance = directory.metricsProvenance || {};
  const allowed = Array.isArray(active) ? new Set(active) : null;
  const rows = METRIC_ROWS
    .filter(([field]) => !allowed || allowed.has(field))
    .map(([field, label, thirdParty, emptyLabel]) => {
      const value = metric(directory[field], thirdParty ? provenance[field] : undefined,
        thirdParty ? directory.metricStatus : undefined, emptyLabel);
      return `        <div class="bd-def">
          <dt class="bd-def-t">${escapeHtml(label)}</dt>
          <dd class="bd-def-d">${value}</dd>
        </div>`;
    }).join('\n');
  return `      <dl class="bd-defs">
${rows}
      </dl>`;
}

const METRIC_LABELS = new Map(METRIC_ROWS.map(([field, label]) => [field, label]));

// Names exactly the third-party metrics still on the page, then states which of
// them the dataset does not carry at all. Both halves are derived, so the note
// can never describe a field that is no longer shown or claim a field is empty
// when a record populates it.
function metricNote(active) {
  const thirdParty = METRIC_ROWS.filter(([, , tp]) => tp).map(([field]) => field);
  const allowed = Array.isArray(active) ? new Set(active) : new Set(thirdParty);
  const shown = thirdParty.filter((f) => allowed.has(f));
  const absent = thirdParty.filter((f) => !allowed.has(f));
  const names = (fields) => {
    const labels = fields.map((f) => METRIC_LABELS.get(f));
    if (labels.length === 1) return labels[0];
    return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
  };

  const parts = [];
  // The distinction the whole two-ranking model rests on. Stated wherever either
  // number appears, so neither can be read as the other.
  parts.push('Domain Rating is a dated Ahrefs snapshot of domain authority. '
    + 'PetroHrys Score is an independent editorial assessment of the directory\u2019s '
    + 'practical business value. They are separate measurements and are never combined.');
  // Stated wherever the column appears, so "Not measured" is never read as a
  // gap we intend to fill, and no reader can take a snapshot for a live reading.
  if (allowed.has('domainRating')) parts.push(S.DR_SNAPSHOT_POLICY_NOTE);
  if (shown.length) {
    parts.push(`${names(shown)} ${shown.length === 1 ? 'is a third-party metric' : 'are third-party metrics'} `
      + 'produced by their respective providers, not by PetroHrys.com. Each recorded value carries '
      + 'its provider and the date it was measured, and describes the domain that was measured '
      + 'rather than one page on it.');
  }
  if (absent.length) {
    parts.push(`No source has been consulted for ${names(absent).toLowerCase()}, so ${absent.length === 1
      ? 'it is'
      : 'they are'} not published for any record.`);
  }
  const attribution = `      <p class="bd-note"><a href="${escapeHtml(S.AHREFS_ATTRIBUTION.href)}" `
    + `rel="${REL_EXTERNAL}" target="_blank">${escapeHtml(S.AHREFS_ATTRIBUTION.text)}`
    + `${vh(' (opens in a new tab)')}</a></p>`;
  return `      <p class="bd-note">${escapeHtml(parts.join(' '))}</p>\n${attribution}`;
}

// ---------------------------------------------------------------------------
// 7b. Registry information
// ---------------------------------------------------------------------------

// The structured facts Wave 1 captures — who runs the register, what kind it is,
// which jurisdiction it covers, and whether a reader can actually use it.
//
// Every row is conditional. A record with none of these fields renders nothing
// at all, not an empty section and not a column of "Unknown": listing the
// schema's gaps back at a reader tells them about our data model rather than
// about the register. `accessLevel: "unknown"` IS shown, because there the
// absence is the finding — it says we looked and could not establish it.
function registryInformation(directory) {
  if (!directory) return '';
  // Scope alone does not earn the section. Every record has one, so triggering
  // on it would put a "Registry information" heading on a SaaS listing whose
  // only content is "Scope: Global" — a heading that promises registry facts
  // and delivers none. At least one genuinely registry-specific field must be
  // present; scope is then shown as context alongside it.
  const hasRegistryFact = !!(
    (directory.operator && directory.operator.name)
    || (Array.isArray(directory.registryTypes) && directory.registryTypes.length)
    || (directory.jurisdiction && directory.jurisdiction.name)
    || (directory.publicAccess && directory.publicAccess.accessLevel)
    || (directory.nativeName && directory.nativeName !== S.displayName(directory))
    || S.isEditorialTranslation(directory)
  );
  if (!hasRegistryFact) return '';

  const rows = [];
  const row = (label, value) => rows.push(
    `        <div class="bd-def">
          <dt class="bd-def-t">${escapeHtml(label)}</dt>
          <dd class="bd-def-d">${value}</dd>
        </div>`,
  );

  const operator = directory.operator;
  if (operator && operator.name) {
    const typeLabel = operator.type ? S.OPERATOR_TYPE_LABELS[operator.type] : null;
    const href = safeHref(operator.officialUrl);
    const name = href
      ? `<a href="${escapeHtml(href)}" rel="${REL_EXTERNAL}" target="_blank">`
        + `${escapeHtml(operator.name)}${vh(' (opens in a new tab)')}</a>`
      : escapeHtml(operator.name);
    row('Operator', typeLabel
      ? `${name} <span class="bd-def-note">${escapeHtml(typeLabel)}</span>`
      : name);
  }

  const types = Array.isArray(directory.registryTypes) ? directory.registryTypes : [];
  if (types.length) {
    // Primary first, then the rest in their declared order, so the lead
    // classification is the one a reader meets first.
    const ordered = [directory.primaryRegistryType, ...types.filter((t) => t !== directory.primaryRegistryType)]
      .filter(Boolean);
    row(ordered.length === 1 ? 'Registry type' : 'Registry types',
      ordered.map((t) => `<span class="bd-tag">${escapeHtml(registryTypeLabel(t))}</span>`).join(' '));
  }

  const j = directory.jurisdiction;
  if (j && j.name) {
    row('Jurisdiction', j.code
      ? `${escapeHtml(j.name)} <span class="bd-def-note">${escapeHtml(j.code)}</span>`
      : escapeHtml(j.name));
  }
  if (directory.scope && S.SCOPE_LABELS[directory.scope]) {
    row('Scope', escapeHtml(S.SCOPE_LABELS[directory.scope]));
  }

  const access = directory.publicAccess;
  if (access && access.accessLevel) {
    const label = S.ACCESS_LEVEL_LABELS[access.accessLevel] || access.accessLevel;
    const note = access.accessLevel === 'unknown' ? S.ACCESS_UNKNOWN_NOTE : access.notes;
    row('Public access', note
      ? `${escapeHtml(label)} <span class="bd-def-note">${escapeHtml(note)}</span>`
      : escapeHtml(label));
  }
  // A search URL is a route, not a permission. It is shown as a link and never
  // used to imply that the register is openly accessible.
  const searchHref = access ? safeHref(access.searchUrl) : null;
  if (searchHref) {
    row('Official search',
      `<a href="${escapeHtml(searchHref)}" rel="${REL_EXTERNAL}" target="_blank">`
      + `${escapeHtml(searchHref)}${vh(' (opens in a new tab)')}</a>`);
  }

  // Shown only when it adds something the title does not already say.
  if (directory.nativeName && directory.nativeName !== S.displayName(directory)) {
    row('Official name', `<span lang="" translate="no">${escapeHtml(directory.nativeName)}</span>`);
  }
  if (S.isEditorialTranslation(directory)) {
    row('English title', 'Editorial translation');
  }
  // Shown only where a reader would otherwise assume two records on one host are
  // the same thing. The internal identifiers (systemKey, sharedHostGroup) are
  // never exposed — only the fact a shared platform explains, in plain words.
  const ri = directory.resourceIdentity;
  if (ri && ri.sharedHostGroup && ri.canonicalDomain) {
    row('Hosting', `This registry is a distinct system hosted on the shared `
      + `${escapeHtml(ri.canonicalDomain)} platform.`);
  }

  if (!rows.length) return '';
  return `      <dl class="bd-defs bd-registry-info">
${rows.join('\n')}
      </dl>`;
}

// ---------------------------------------------------------------------------
// 8. Status badges
// ---------------------------------------------------------------------------

// Every badge carries its own words. Nothing is signalled by colour alone, and
// an unknown field never renders as a claim.
function statusBadges(directory) {
  const badges = [];

  badges.push(directory.lastVerified
    ? { state: 'verified', text: 'Verified' }
    : { state: 'unverified', text: 'Not yet verified' });

  // Labels come from the schema so a new submission model can never render as
  // "undefined" or silently fall through to "unknown".
  const submissionText = S.SUBMISSION_MODEL_LABELS[directory.submissionModel];
  badges.push(submissionText
    ? { state: directory.submissionModel, text: submissionText }
    : { state: 'unknown', text: S.SUBMISSION_MODEL_LABELS.unknown });

  if (directory.verificationRequired === true) {
    badges.push({ state: 'gated', text: 'Verification required' });
  } else if (directory.verificationRequired === false) {
    badges.push({ state: 'open', text: 'No verification required' });
  } else {
    badges.push({ state: 'unknown', text: 'Verification requirement unknown' });
  }

  if (directory.registrationRequired === true) {
    badges.push({ state: 'gated', text: 'Registration required' });
  } else if (directory.registrationRequired === false) {
    badges.push({ state: 'open', text: 'No registration required' });
  } else {
    badges.push({ state: 'unknown', text: 'Registration requirement unknown' });
  }

  if (directory.reviewSystem === true) {
    badges.push({ state: 'reviews', text: 'Has a review system' });
  } else if (directory.reviewSystem === false) {
    badges.push({ state: 'no-reviews', text: 'No review system' });
  } else {
    badges.push({ state: 'unknown', text: 'Review system unknown' });
  }

  const items = badges.map((b) =>
    `        <li class="bd-badge" data-bd-state="${escapeHtml(b.state)}">${escapeHtml(b.text)}</li>`).join('\n');
  return `      <ul class="bd-badges" aria-label="Listing status">
${items}
      </ul>`;
}

// ---------------------------------------------------------------------------
// 9 & 10. Pros / cons and best-for tags
// ---------------------------------------------------------------------------

function bulletList(items, emptyMessage) {
  if (!Array.isArray(items) || items.length === 0) {
    return `      <p class="bd-empty">${escapeHtml(emptyMessage)}</p>`;
  }
  const rows = items.map((item) => `        <li>${escapeHtml(item)}</li>`).join('\n');
  return `      <ul class="bd-list">
${rows}
      </ul>`;
}

function prosCons({ pros, cons, headingLevel = 3 }) {
  const h = headingTag(headingLevel);
  return `      <div class="bd-proscons">
        <${h} class="bd-subhead">Strengths</${h}>
${bulletList(pros, 'No strengths recorded yet.')}
        <${h} class="bd-subhead">Limitations</${h}>
${bulletList(cons, 'No limitations recorded yet.')}
      </div>`;
}

// Rendered visibly on the page. FAQPage structured data must mirror content the
// reader can actually see, so this and the JSON-LD are always built from the
// same approved array.
function faqSection(faqs, { headingLevel = 3 } = {}) {
  if (!Array.isArray(faqs) || faqs.length === 0) return '';
  const h = headingTag(headingLevel);
  const items = faqs.map(({ q, a }) => `        <div class="bd-faq-item">
          <${h} class="bd-faq-q">${escapeHtml(q)}</${h}>
          <p class="bd-faq-a">${escapeHtml(a)}</p>
        </div>`).join('\n');
  return `      <div class="bd-faq">
${items}
      </div>`;
}

function bestForTags(industries) {
  if (!Array.isArray(industries) || industries.length === 0) {
    return `      <p class="bd-empty">No recommended industries recorded yet.</p>`;
  }
  const rows = industries.map((item) =>
    `        <li class="bd-chip">${escapeHtml(item)}</li>`).join('\n');
  return `      <ul class="bd-chips" aria-label="Recommended industries">
${rows}
      </ul>`;
}

// ---------------------------------------------------------------------------
// 11. Empty state
// ---------------------------------------------------------------------------

const VERIFICATION_NOTE = 'Entries are published only after manual verification, so this list '
  + 'stays empty until real, checked directories are added.';

function emptyState(message) {
  return `      <p class="bd-empty">${escapeHtml(message)} ${escapeHtml(VERIFICATION_NOTE)}</p>`;
}

// ---------------------------------------------------------------------------
// 12 & 13. Search / filter and sort shells
// ---------------------------------------------------------------------------

// Filter keys double as data-attribute suffixes: data-bd-<field>. Keeping them
// lowercase-hyphenated means the client script needs no special casing.
const FILTERS = [
  { field: 'free-submission', label: 'Free to submit' },
  { field: 'accepts-startup', label: 'Accepts startups' },
  { field: 'accepts-saas', label: 'Accepts SaaS' },
  { field: 'accepts-localbusiness', label: 'Accepts local businesses' },
  { field: 'accepts-developer', label: 'Accepts developer tools' },
  { field: 'accepts-ai', label: 'Accepts AI products' },
];

// Resolves a filter key against a record, so the row attributes and the filter
// list can never drift apart.
//
// Returns true / false / null, never a coerced boolean. `null` means the answer
// was never established, and it must stay distinguishable from a confirmed "no":
// collapsing the two would publish 42 records as "does not accept SaaS" when
// nobody ever checked. A statutory register is `null` for free-submission too —
// "you cannot submit at all" is not the same claim as "submission is not free".
function filterValue(directory, field) {
  if (field === 'free-submission') {
    const model = directory.submissionModel;
    if (model === 'free' || model === 'freemium') return true;
    if (model === 'paid') return false;
    return null; // unknown, and notApplicable: there is nothing to submit
  }
  const key = field.replace(/^accepts-/, '');
  const match = S.ACCEPTS_KEYS.find((k) => k.toLowerCase() === key);
  if (!match) return null;
  const value = (directory.accepts || {})[match];
  return value === true ? true : value === false ? false : null;
}

// yes / no / unknown, so the client never has to infer a third state from a
// two-state attribute.
function filterAttr(directory, field) {
  const value = filterValue(directory, field);
  return value === true ? 'yes' : value === false ? 'no' : 'unknown';
}

const dataKey = (field) => `data-bd-${field.toLowerCase()}`;

// Controls start hidden and are revealed by Task 9's script. Without
// JavaScript the prerendered table is still complete and fully readable.
function searchControls({ idPrefix = 'bd' } = {}) {
  const id = `${escapeHtml(idPrefix)}-search`;
  return `      <div class="bd-control" data-bd-search-wrap hidden>
        <label class="bd-label" for="${id}">Search directories</label>
        <input class="bd-input" id="${id}" type="search" data-bd-search
               placeholder="Filter by name, description or industry" autocomplete="off">
      </div>`;
}

const FILTER_DISCLOSURE = 'Filters show confirmed matches only. Records with unknown '
  + 'eligibility are not treated as negative.';

function filterControls({ idPrefix = 'bd', directories = [] } = {}) {
  const boxes = FILTERS.map((f) => {
    const id = `${escapeHtml(idPrefix)}-filter-${escapeHtml(f.field)}`;
    // Counted from the same resolver the row attributes use, so the number a
    // reader sees is exactly what ticking the box will show.
    const confirmed = directories.filter((d) => filterValue(d, f.field) === true).length;
    const unknown = directories.filter((d) => filterValue(d, f.field) === null).length;
    const tally = directories.length
      ? ` <span class="bd-count">${confirmed} confirmed`
        + `${unknown ? `, ${unknown} unknown` : ''}</span>`
      : '';
    return `          <div class="bd-check">
            <input type="checkbox" id="${id}" data-bd-filter="${escapeHtml(f.field)}">
            <label for="${id}">${escapeHtml(f.label)}${tally}</label>
          </div>`;
  }).join('\n');
  return `      <fieldset class="bd-control" data-bd-filter-wrap hidden>
        <legend class="bd-label">Filter</legend>
        <p class="bd-note">${escapeHtml(FILTER_DISCLOSURE)}</p>
        <div class="bd-checks">
${boxes}
        </div>
      </fieldset>`;
}

// Which sort key each metric column drives. A sort option whose column is not
// rendered would silently fall through to name order, so options are emitted
// only for columns the reader can actually see.
// Keys must match js/bd-order.js SORT_KEYS exactly — that module is the shared
// server/browser contract. A key that does not appear there silently disables
// this filter, leaving the dead options it was written to remove.
const SORT_FIELD_FOR_KEY = {
  default: 'petroHrysScore',
  'domain-rating': 'domainRating',
  'authority-score': 'authorityScore',
  traffic: 'estimatedTraffic',
  // 'alphabetical' drives no metric column, so it is always offered.
};

function sortControls({ idPrefix = 'bd', columns } = {}) {
  const id = `${escapeHtml(idPrefix)}-sort`;
  const shown = Array.isArray(columns) ? new Set(columns) : null;
  const keys = SORT_KEYS.filter((key) => {
    const field = SORT_FIELD_FOR_KEY[key];
    return !shown || !field || shown.has(field);
  });
  const options = keys.map((key) =>
    `          <option value="${escapeHtml(key)}">${escapeHtml(SORTS[key].label)}</option>`).join('\n');
  return `      <div class="bd-control" data-bd-sort-wrap hidden>
        <label class="bd-label" for="${id}">Sort by</label>
        <select class="bd-select" id="${id}" data-bd-sort>
${options}
        </select>
      </div>`;
}

// ---------------------------------------------------------------------------
// 5. Directory table
// ---------------------------------------------------------------------------

function haystack(directory) {
  // Every name a reader might type: the displayed one plus the native and
  // official forms, so a Japanese or Chinese register is findable in either
  // script. Deduplicated case-insensitively — for a record whose officialName
  // simply mirrors its name, repeating the string would change the search index
  // without adding a term.
  const parts = [S.displayName(directory), directory.nativeName, directory.officialName,
    directory.description, ...(directory.recommendedIndustries || [])]
    .filter((part) => typeof part === 'string' && part.length);
  const seen = new Set();
  const unique = parts.filter((part) => {
    const key = part.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique.join(' ').toLowerCase();
}

function numAttr(value) {
  return isNullish(value) ? '' : String(value);
}

// Directory and PetroHrys Score are always present. A metric column is rendered
// only when at least one row in THIS set carries a value for it — a column of
// nothing but em dashes tells the reader less than no column at all, and makes
// the two columns that do carry data harder to read.
// Domain Rating and PetroHrys Score sit beside each other because they answer
// different questions and must never be read as one blended number: DR is a
// dated third-party measurement of the DOMAIN, the score is a first-party
// editorial assessment of the DIRECTORY.
const TABLE_METRIC_COLUMNS = [
  { field: 'domainRating', label: 'Domain Rating', emptyLabel: S.DR_NOT_MEASURED_LABEL },
  { field: 'petroHrysScore', label: 'PetroHrys Score', always: true },
];

function tableColumnsFor(directories) {
  const list = Array.isArray(directories) ? directories : [];
  return TABLE_METRIC_COLUMNS
    .filter((col) => col.always || list.some((d) => !isNullish(d[col.field])))
    .map((col) => col.field);
}

// Data attributes stay on every row for all metrics regardless of which columns
// render, so client-side sorting keeps working and the markup contract the asset
// tests assert does not change.
function directoryRow(directory, columns) {
  const provenance = directory.metricsProvenance || {};
  const shown = Array.isArray(columns) ? new Set(columns) : null;
  const attrs = [
    `data-bd-name="${escapeHtml(String(S.displayName(directory) || ''))}"`,
    `data-bd-haystack="${escapeHtml(haystack(directory))}"`,
    `data-bd-score="${escapeHtml(numAttr(directory.petroHrysScore))}"`,
    `data-bd-dr="${escapeHtml(numAttr(directory.domainRating))}"`,
    `data-bd-as="${escapeHtml(numAttr(directory.authorityScore))}"`,
    `data-bd-traffic="${escapeHtml(numAttr(directory.estimatedTraffic))}"`,
    // Emitted only for a record that HAS a jurisdiction. A national record adds
    // no attribute at all, so pages that predate subnational coverage keep
    // their exact markup.
    ...(directory.jurisdiction
      ? [`data-bd-jurisdiction="${escapeHtml(String(directory.jurisdiction.name || ''))}"`,
        `data-bd-jurisdiction-code="${escapeHtml(String(directory.jurisdiction.code || ''))}"`]
      : []),
    ...FILTERS.map((f) => `${dataKey(f.field)}="${filterAttr(directory, f.field)}"`),
  ].join(' ');
  const cells = TABLE_METRIC_COLUMNS
    .filter((col) => !shown || shown.has(col.field))
    .map((col) => `            <td class="bd-cell" data-bd-label="${escapeHtml(col.label)}">`
      + `${metric(directory[col.field], provenance[col.field], undefined, col.emptyLabel)}</td>`)
    .join('\n');
  return `          <tr class="bd-row" ${attrs}>
            <th class="bd-cell" scope="row" data-bd-label="Directory"><a href="${escapeHtml(directoryPathFor(directory))}">${escapeHtml(S.displayName(directory))}</a></th>
${cells}
          </tr>`;
}

// ---------------------------------------------------------------------------
// Jurisdiction grouping
// ---------------------------------------------------------------------------
// A country whose records are all national renders exactly as it always has:
// grouping returns null and the caller emits one table. It switches on only
// when the country actually holds subnational records, so no page ever shows an
// empty "States" heading for coverage that does not exist.
//
// Order is fixed and content-independent — federal instruments first because
// they apply everywhere, then states A-Z, then the federal district, then
// territories — so two builds of the same data agree.

// Within a group, order by jurisdiction name so a reader scans A-Z, then fall
// back to the shared name comparator for two registries in one jurisdiction.
function byJurisdictionThenName(a, b) {
  const an = (a.jurisdiction && a.jurisdiction.name) || '';
  const bn = (b.jurisdiction && b.jurisdiction.name) || '';
  if (an < bn) return -1;
  if (an > bn) return 1;
  return compareByName(a, b);
}

// Returns null when the country has no subnational record — the signal to the
// caller that nothing needs grouping and the flat table stands.
//
// Group ORDER is the country's declared vocabulary order, not a hard-coded
// list: the United States reads Federal → States → Federal district →
// Territories because that is how its vocabulary is written, and Spain reads
// National → Autonomous communities because that is how Spain's is. No American
// term can reach a Spanish page, because the label is resolved per country and
// an undeclared pair throws.
function jurisdictionGroups(entries, countrySlug) {
  const list = Array.isArray(entries) ? entries : [];
  if (!list.some((d) => d && d.jurisdiction)) return null;
  if (!countrySlug) {
    throw new Error('jurisdictionGroups needs a country slug to resolve grouping labels.');
  }

  const groups = [];
  const national = list.filter((d) => !d.jurisdiction).sort(byJurisdictionThenName);
  if (national.length) {
    groups.push({
      key: S.NATIONAL_KEY,
      label: S.jurisdictionLabel(countrySlug, S.NATIONAL_KEY),
      items: national,
      count: national.length,
    });
  }
  for (const type of S.allowedJurisdictionTypes(countrySlug) || []) {
    const items = list.filter((d) => d.jurisdiction && d.jurisdiction.type === type)
      .sort(byJurisdictionThenName);
    if (!items.length) continue;
    groups.push({
      key: type,
      label: S.jurisdictionLabel(countrySlug, type),
      items,
      count: items.length,
    });
  }

  // Conservation. A record whose type the country does not declare would
  // otherwise vanish from its own country page — the quietest possible failure.
  const placed = new Set(groups.flatMap((g) => g.items));
  const orphans = list.filter((d) => !placed.has(d));
  if (orphans.length) {
    const types = [...new Set(orphans.map((d) => (d.jurisdiction || {}).type))].join(', ');
    throw new Error(`${orphans.length} record(s) in "${countrySlug}" use jurisdiction type(s) `
      + `[${types}] that its vocabulary does not declare: ${orphans.map((d) => d.id).join(', ')}.`);
  }
  return groups;
}

// "1 registry" / "4 registries". Derived from the group, never written twice,
// and never a bare number: a lone "1" beside a heading reads as an index.
function registryCount(count) {
  return `${count} ${count === 1 ? 'registry' : 'registries'}`;
}

// One control per group present. Counts are derived, never written down twice.
function jurisdictionFilter(groups, { idPrefix = 'jurisdiction' } = {}) {
  if (!groups || groups.length < 2) return '';
  const options = groups.map((g) => `        <li><a class="bd-jfilter-link" `
    + `href="#${escapeHtml(`${idPrefix}-${g.key}`)}" data-bd-jurisdiction-filter="${escapeHtml(g.key)}">`
    + `${escapeHtml(g.label)} <span class="bd-jfilter-count">${escapeHtml(registryCount(g.count))}`
    + `</span></a></li>`).join('\n');
  return `      <nav class="bd-jfilter" aria-label="Jump to jurisdiction">
      <ul class="bd-jfilter-list">
${options}
      </ul>
      </nav>`;
}

// Server order always comes from bd-sort, so the table is correct before any
// JavaScript runs. No row cap and no pagination logic lives here.
function directoryTable({ directories, caption = 'Directories', columns, sortKey = 'default' }) {
  if (!Array.isArray(directories) || directories.length === 0) {
    return emptyState('No directories are published here yet.');
  }
  const cols = Array.isArray(columns) ? columns : tableColumnsFor(directories);
  const shown = new Set(cols);
  // Ordering contract. By default the table sorts with the shared comparator, so
  // a careless caller still gets a deterministic order rather than an accident
  // of its array. `sortKey: null` is the explicit opt-out: it means "I have
  // already ordered these rows, render them as given."
  //
  // The opt-out exists because jurisdiction grouping orders each group by
  // jurisdiction name, and a silent re-sort here threw that away — States came
  // out in PetroHrys Score order while the comparator's A-Z result was
  // discarded. Sorting now happens once, before grouping.
  const ordered = sortKey === null ? [...directories] : sortDirectories(directories, sortKey);
  const rows = ordered.map((d) => directoryRow(d, cols)).join('\n');
  const heads = TABLE_METRIC_COLUMNS
    .filter((col) => shown.has(col.field))
    .map((col) => `            <th class="bd-cell" scope="col">${escapeHtml(col.label)}</th>`)
    .join('\n');
  return `      <table class="bd-table">
        <caption class="bd-caption">${escapeHtml(caption)}</caption>
        <thead>
          <tr>
            <th class="bd-cell" scope="col">Directory</th>
${heads}
          </tr>
        </thead>
        <tbody data-bd-rows>
${rows}
        </tbody>
      </table>`;
}

// ---------------------------------------------------------------------------
// 6. Directory summary card
// ---------------------------------------------------------------------------

// Only the title is a link. The card is never wrapped in a single anchor, which
// would swallow the nested link and badges.
function directoryCard({ directory, headingLevel = 3 }) {
  const h = headingTag(headingLevel);
  return `      <article class="bd-summary">
        <${h} class="bd-card-title"><a href="${escapeHtml(directoryPathFor(directory))}">${escapeHtml(S.displayName(directory))}</a></${h}>
        <p class="bd-card-body">${escapeHtml(directory.description)}</p>
${statusBadges(directory)}
      </article>`;
}

// ---------------------------------------------------------------------------
// 14. Pagination
// ---------------------------------------------------------------------------

// A disabled page is a span, never an anchor, so it cannot be focused or
// activated by keyboard.
function pagination({ current, total, basePath }) {
  if (!Number.isInteger(total) || total <= 1) return '';
  const pages = [];
  for (let n = 1; n <= total; n += 1) {
    const href = n === 1 ? basePath : `${basePath}page/${n}/`;
    pages.push(n === current
      ? `        <li><span class="bd-page bd-page--current" aria-current="page">${vh('Page ')}${n}</span></li>`
      : `        <li><a class="bd-page" href="${escapeHtml(href)}">${vh('Page ')}${n}</a></li>`);
  }
  return `      <nav class="bd-pagination" aria-label="Directory pages">
        <ol class="bd-pages">
${pages.join('\n')}
        </ol>
      </nav>`;
}

// ---------------------------------------------------------------------------
// 15. Methodology note
// ---------------------------------------------------------------------------

// "how it links out" was removed: backlinkType is null on every record and is
// read by no renderer, so the claim described a field the dataset does not
// carry. Every remaining clause names something a record actually stores.
function methodologyNote() {
  return '      <p class="bd-note">Every directory is checked by hand before publication. Each '
    + 'record stores what the directory accepts, whether listing is free or paid, whether '
    + 'verification or manual review is required, and the date it was '
    + 'verified. Nothing is published from an automated crawl, and no value is estimated '
    + 'or inferred.</p>';
}

// ---------------------------------------------------------------------------
// 16. Last-verified / provenance block
// ---------------------------------------------------------------------------

function provenanceBlock(directory) {
  const verified = directory.lastVerified
    ? `<time datetime="${escapeHtml(directory.lastVerified)}">${escapeHtml(directory.lastVerified)}</time>`
    : `<span class="bd-metric bd-metric--empty">Not yet verified</span>`;
  const next = directory.nextVerification
    ? `<time datetime="${escapeHtml(directory.nextVerification)}">${escapeHtml(directory.nextVerification)}</time>`
    : dash();
  return `      <dl class="bd-defs bd-provenance">
        <div class="bd-def">
          <dt class="bd-def-t">Last verified</dt>
          <dd class="bd-def-d">${verified}</dd>
        </div>
        <div class="bd-def">
          <dt class="bd-def-t">Next verification due</dt>
          <dd class="bd-def-d">${next}</dd>
        </div>
      </dl>`;
}

// ---------------------------------------------------------------------------
// 18. Verification block
// ---------------------------------------------------------------------------

const VERIFICATION_SOURCE_LABELS = {
  'official-website': 'Official website',
  'official-documentation': 'Official documentation',
  'government-register': 'Government register',
  'manual-verification': 'Manual verification',
  other: 'Other',
};

const VERIFICATION_STATUS_LABELS = {
  verified: 'Verified',
  unverified: 'Not yet verified',
  pending: 'Verification pending',
};

// Exposes who checked the record, how, and when. The reviewers array is
// rendered as a list so a second reviewer needs no markup change.
function verificationBlock(directory) {
  const v = directory.verification || {};
  const status = VERIFICATION_STATUS_LABELS[v.status] || 'Not yet verified';
  const source = v.source ? VERIFICATION_SOURCE_LABELS[v.source] || v.source : null;
  const reviewers = Array.isArray(v.reviewers) ? v.reviewers : [];

  const date = directory.lastVerified
    ? `<time datetime="${escapeHtml(directory.lastVerified)}">${escapeHtml(directory.lastVerified)}</time>`
    : dash();
  const next = directory.nextVerification
    ? `<time datetime="${escapeHtml(directory.nextVerification)}">${escapeHtml(directory.nextVerification)}</time>`
    : dash();
  const by = reviewers.length
    ? reviewers.map((r) => escapeHtml(r.name)).join(', ')
    : `<span class="bd-metric bd-metric--empty">Unknown</span>`;

  return `      <dl class="bd-defs bd-provenance">
        <div class="bd-def">
          <dt class="bd-def-t">Verification status</dt>
          <dd class="bd-def-d"><span class="bd-metric">${escapeHtml(status)}</span></dd>
        </div>
        <div class="bd-def">
          <dt class="bd-def-t">Verification source</dt>
          <dd class="bd-def-d">${source ? `<span class="bd-metric">${escapeHtml(source)}</span>` : dash()}</dd>
        </div>
        <div class="bd-def">
          <dt class="bd-def-t">Last verified</dt>
          <dd class="bd-def-d">${date}</dd>
        </div>
        <div class="bd-def">
          <dt class="bd-def-t">Next verification due</dt>
          <dd class="bd-def-d">${next}</dd>
        </div>
        <div class="bd-def">
          <dt class="bd-def-t">Editorial reviewer</dt>
          <dd class="bd-def-d"><span class="bd-metric">${by}</span></dd>
        </div>
      </dl>`;
}

// ---------------------------------------------------------------------------
// 19. Accepted audiences
// ---------------------------------------------------------------------------

// All twelve flags are listed, including the ones that are false or unknown:
// knowing a directory does NOT accept freelancers is as useful as knowing it
// does, and hiding unknowns would imply an answer that was never established.
function acceptsList(directory) {
  const accepts = directory.accepts || {};
  const rows = S.ACCEPTS_KEYS.map((key) => {
    const value = accepts[key];
    const text = value === true ? 'Yes' : value === false ? 'No' : 'Unknown';
    const state = value === true ? 'yes' : value === false ? 'no' : 'unknown';
    return `        <div class="bd-def">
          <dt class="bd-def-t">${escapeHtml(S.ACCEPTS_LABELS[key])}</dt>
          <dd class="bd-def-d"><span class="bd-metric" data-bd-state="${state}">${text}</span></dd>
        </div>`;
  }).join('\n');
  return `      <dl class="bd-defs">
${rows}
      </dl>`;
}

// ---------------------------------------------------------------------------
// 20. Score breakdown
// ---------------------------------------------------------------------------

// Publishes the factors behind the score so the number is auditable rather
// than asserted.
// Every factor renders its definition from the schema, so the reader can check
// the number against what was actually being judged, and no page can describe a
// factor that does not exist.
function scoreBreakdown(directory) {
  if (!directory.scoreFactors) return '';
  const rows = S.SCORE_FACTORS.map(({ key, weight, label, definition }) => {
    const value = directory.scoreFactors[key];
    return `        <div class="bd-def">
          <dt class="bd-def-t">${escapeHtml(label)} <span class="bd-tag">${weight}%</span></dt>
          <dd class="bd-def-d"><span class="bd-metric">${escapeHtml(value)} / 10</span>
            <span class="bd-def-note">${escapeHtml(definition)}</span></dd>
        </div>`;
  }).join('\n');
  return `      <dl class="bd-defs">
${rows}
      </dl>
      <p class="bd-note">The PetroHrys Score is a first-party editorial assessment, not a third-party
      authority metric. It is the weighted sum of the ten factors above, divided by ten, so the number
      on this page is reproducible from the values shown. ${escapeHtml(S.SCORE_METHOD_NOTE)}</p>`;
}

// ---------------------------------------------------------------------------
// 17. External-link CTA
// ---------------------------------------------------------------------------

// An unusable scheme (javascript:, data:, file:, malformed) is never rendered
// as a link. The raw value is shown as text so nothing is silently dropped.
// The page's primary action. `name` makes the anchor text say where the link
// goes — "Visit directory" is identical on all 64 pages and tells a screen
// reader working through a link list nothing at all. The destination host is
// shown so the reader can see where they are being sent before clicking.
// Uses its own class: .bd-cta-link is shared with the quieter submission link,
// and restyling that would produce two competing primary buttons.
function externalLinkCta({ url, name, label }) {
  const href = safeHref(url);
  const text = label || (name ? `Visit ${name}` : 'Visit directory');
  if (!href) {
    return `      <p class="bd-cta bd-cta--unavailable">${escapeHtml(text)}: `
      + `<span class="bd-metric bd-metric--empty">no usable address recorded</span></p>`;
  }
  let host = '';
  try { host = new URL(href).host.replace(/^www\./, ''); } catch { host = ''; }
  const hostHtml = host ? `<span class="bd-cta-host">${escapeHtml(host)}</span>` : '';
  return `      <p class="bd-cta"><a class="bd-cta-primary" href="${escapeHtml(href)}" `
    + `rel="${REL_EXTERNAL}" target="_blank">${escapeHtml(text)}`
    + `${vh(' (opens in a new tab)')}${hostHtml}</a></p>`;
}

// ---------------------------------------------------------------------------
// 21. Editorial relations
// ---------------------------------------------------------------------------

// Groups are supplied already resolved to names and paths by the generator,
// which owns the registry. Relations are curated, never computed by similarity.
function relatedDirectories(groups) {
  const sections = groups.filter((g) => g.items.length).map((group) => {
    const items = group.items.map((item) =>
      `          <li><a href="${escapeHtml(item.path)}">${escapeHtml(item.name)}</a></li>`).join('\n');
    return `        <div class="bd-relation">
          <h3 class="bd-subhead">${escapeHtml(group.label)}</h3>
          <ul class="bd-list">
${items}
          </ul>
        </div>`;
  });
  if (!sections.length) {
    return '      <p class="bd-empty">No editorial relationships recorded yet.</p>';
  }
  return `      <div class="bd-relations">\n${sections.join('\n')}\n      </div>`;
}

// The official submission route, where one was verified. A null is stated
// rather than hidden, so a reader knows it was not confirmed.
function submissionLink(directory) {
  // A statutory register has no submission route to verify. Saying "not
  // verified" would imply one exists and nobody checked.
  if (directory.submissionModel === 'notApplicable') {
    return `      <p class="bd-cta bd-cta--unavailable">${escapeHtml(S.SUBMISSION_NOT_APPLICABLE_NOTE)}</p>`;
  }
  const href = safeHref(directory.submissionUrl);
  if (!href) {
    return '      <p class="bd-cta bd-cta--unavailable">Official submission page not verified.</p>';
  }
  return `      <p class="bd-cta"><a class="bd-cta-link" href="${escapeHtml(href)}" `
    + `rel="${REL_EXTERNAL}" target="_blank">Official submission page`
    + `${vh(' (opens in a new tab)')}</a></p>`;
}

// ---------------------------------------------------------------------------
// 22. Editorial guidance
// ---------------------------------------------------------------------------

const DIFFICULTY_LABELS = { 'very-easy': 'Very easy', easy: 'Easy', moderate: 'Moderate', hard: 'Hard' };
const QUALITY_LABELS = { high: 'High', mixed: 'Mixed', low: 'Low' };
const ASSET_LABELS = {
  logo: 'Logo', website: 'Website', description: 'Description', categories: 'Categories',
  contact: 'Contact information', screenshots: 'Screenshots', businessVerification: 'Business verification',
};

// Editorial judgement and verified fact are shown side by side, each labelled,
// so a reader can tell which is which. Anything unestablished says Unknown.
// Guidance groups that carry a value on at least one record. A group nobody has
// filled in anywhere is not a per-record gap — it is a question the project has
// not started answering, and 64 identical "Unknown" rows say that far less
// clearly than one sentence does. Derived, so a group returns the moment a
// record populates it.
const GUIDANCE_GROUPS = [
  { key: 'submissionDifficulty', has: (r) => !isNullish(r.submissionDifficulty) },
  { key: 'listingQuality', has: (r) => !isNullish(r.listingQuality) },
  { key: 'typicalApprovalTime', has: (r) => !isNullish(r.typicalApprovalTime) },
  { key: 'reviewProcess', has: (r) => !isNullish(r.reviewProcess) },
  { key: 'preparationChecklist', has: (r) => (r.preparationChecklist || []).length > 0 },
  { key: 'commonMistakes', has: (r) => (r.commonMistakes || []).length > 0 },
  { key: 'requiredAssets',
    has: (r) => Object.values(r.requiredAssets || {}).some((v) => !isNullish(v)) },
];

function activeGuidanceFields(records) {
  const list = Array.isArray(records) ? records : [];
  return GUIDANCE_GROUPS.filter((g) => list.some((r) => g.has(r))).map((g) => g.key);
}

// Names the suppressed groups in one sentence so their absence is stated rather
// than silently hidden.
const GUIDANCE_ABSENCE_LABELS = {
  submissionDifficulty: 'submission difficulty',
  listingQuality: 'typical listing quality',
  typicalApprovalTime: 'typical approval time',
  reviewProcess: 'review process',
  preparationChecklist: 'preparation checklists',
  commonMistakes: 'common mistakes',
  requiredAssets: 'required submission assets',
};

function guidanceAbsenceNote(active) {
  const allowed = new Set(active || []);
  const absent = GUIDANCE_GROUPS.map((g) => g.key).filter((k) => !allowed.has(k));
  if (!absent.length) return '';
  const labels = absent.map((k) => GUIDANCE_ABSENCE_LABELS[k]);
  const names = labels.length === 1
    ? labels[0]
    : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
  return `      <p class="bd-note">${escapeHtml(`Establishing ${names} requires submitting a listing `
    + 'and observing the result. That has not been done for any directory in this dataset, so '
    + `${labels.length === 1 ? 'it is' : 'they are'} not published rather than estimated.`)}</p>`;
}

function editorialGuidance(directory, active) {
  const allowed = Array.isArray(active) ? new Set(active) : null;
  const on = (key) => !allowed || allowed.has(key);

  const defs = [
    ['submissionDifficulty', 'Submission difficulty', DIFFICULTY_LABELS[directory.submissionDifficulty]],
    ['listingQuality', 'Typical listing quality', QUALITY_LABELS[directory.listingQuality]],
    ['typicalApprovalTime', 'Typical approval time', directory.typicalApprovalTime],
    ['reviewProcess', 'Review process', directory.reviewProcess],
  ].filter(([key]) => on(key)).map(([, label, value]) => `        <div class="bd-def">
          <dt class="bd-def-t">${escapeHtml(label)}</dt>
          <dd class="bd-def-d">${value ? `<span class="bd-metric">${escapeHtml(value)}</span>`
    : '<span class="bd-metric bd-metric--empty">Unknown</span>'}</dd>
        </div>`).join('\n');

  const list = (items, empty) => (items && items.length
    ? `      <ul class="bd-list">\n${items.map((i) => `        <li>${escapeHtml(i)}</li>`).join('\n')}\n      </ul>`
    : `      <p class="bd-empty">${escapeHtml(empty)}</p>`);

  const parts = [];
  if (defs) parts.push(`      <dl class="bd-defs">\n${defs}\n      </dl>`);
  parts.push(`      <h3 class="bd-subhead">Best for</h3>\n${list(directory.bestFor, 'No editorial guidance recorded yet.')}`);
  parts.push(`      <h3 class="bd-subhead">Not recommended for</h3>\n${list(directory.notRecommendedFor, 'No editorial guidance recorded yet.')}`);
  if (on('preparationChecklist')) {
    parts.push(`      <h3 class="bd-subhead">Preparation checklist</h3>\n${list(directory.preparationChecklist, 'No checklist recorded yet.')}`);
  }
  if (on('commonMistakes')) {
    parts.push(`      <h3 class="bd-subhead">Common mistakes</h3>\n${list(directory.commonMistakes, 'No common mistakes recorded yet.')}`);
  }
  if (on('requiredAssets')) {
    const assets = S.REQUIRED_ASSET_KEYS.map((key) => {
      const value = (directory.requiredAssets || {})[key];
      const text = value === true ? 'Required' : value === false ? 'Not required' : 'Unknown';
      return `        <div class="bd-def">
          <dt class="bd-def-t">${escapeHtml(ASSET_LABELS[key])}</dt>
          <dd class="bd-def-d"><span class="bd-metric">${text}</span></dd>
        </div>`;
    }).join('\n');
    parts.push(`      <h3 class="bd-subhead">Required assets</h3>
      <p class="bd-note">Marked Unknown unless the official submission form was read.</p>
      <dl class="bd-defs">\n${assets}\n      </dl>`);
  }
  const note = guidanceAbsenceNote(active);
  if (note) parts.push(note);
  return parts.join('\n\n');
}

module.exports = {
  breadcrumbs, pageIntro, countryCard, categoryCard, cardGrid,
  directoryTable, directoryRow, directoryCard, metric, metricsBlock, metricNote,
  statusBadges, prosCons, bestForTags, bulletList, emptyState, faqSection,
  registryInformation,
  searchControls, filterControls, sortControls, pagination,
  verificationBlock, acceptsList, scoreBreakdown, filterValue, filterAttr,
  relatedDirectories, submissionLink, editorialGuidance,
  methodologyNote, provenanceBlock, externalLinkCta,
  activeMetricFields, activeGuidanceFields, tableColumnsFor, countLabel,
  jurisdictionGroups, jurisdictionFilter, byJurisdictionThenName, registryCount,
  FILTERS, VERIFICATION_NOTE, REL_EXTERNAL, FILTER_DISCLOSURE,
};
