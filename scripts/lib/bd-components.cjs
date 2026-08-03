// scripts/lib/bd-components.cjs
'use strict';
const { escapeHtml } = require('./bd-util.cjs');
const { safeExternalUrl } = require('./bd-seo.cjs');
const { sortDirectories, SORTS, SORT_KEYS } = require('./bd-sort.cjs');

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
function countryCard({ name, path, pending = false, headingLevel = 3 }) {
  const h = headingTag(headingLevel);
  const title = pending
    ? `<span class="bd-pending">${escapeHtml(name)}</span> <span class="bd-tag">coming soon</span>`
    : `<a href="${escapeHtml(path)}">${escapeHtml(name)}</a>`;
  return `        <li class="bd-card">
          <${h} class="bd-card-title">${title}</${h}>
        </li>`;
}

function categoryCard({ name, path, description, pending = false, headingLevel = 3 }) {
  const h = headingTag(headingLevel);
  const title = pending
    ? `<span class="bd-pending">${escapeHtml(name)}</span> <span class="bd-tag">coming soon</span>`
    : `<a href="${escapeHtml(path)}">${escapeHtml(name)}</a>`;
  const body = description ? `\n          <p class="bd-card-body">${escapeHtml(description)}</p>` : '';
  return `        <li class="bd-card">
          <${h} class="bd-card-title">${title}</${h}>${body}
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
function metric(value, provenance) {
  if (isNullish(value)) return dash();
  const shown = escapeHtml(value);
  if (provenance && provenance.provider && provenance.measuredAt) {
    return `<span class="bd-metric">${shown}<span class="bd-metric-source">`
      + `${escapeHtml(provenance.provider)}, measured `
      + `<time datetime="${escapeHtml(provenance.measuredAt)}">${escapeHtml(provenance.measuredAt)}</time>`
      + `</span></span>`;
  }
  return `<span class="bd-metric">${shown}</span>`;
}

const METRIC_ROWS = [
  ['petroHrysScore', 'PetroHrys Score', false],
  ['domainRating', 'Domain Rating', true],
  ['authorityScore', 'Authority Score', true],
  ['estimatedTraffic', 'Estimated traffic', true],
  ['referringDomains', 'Referring domains', true],
];

function metricsBlock(directory) {
  const provenance = directory.metricsProvenance || {};
  const rows = METRIC_ROWS.map(([field, label, thirdParty]) => {
    const value = metric(directory[field], thirdParty ? provenance[field] : undefined);
    return `        <div class="bd-def">
          <dt class="bd-def-t">${escapeHtml(label)}</dt>
          <dd class="bd-def-d">${value}</dd>
        </div>`;
  }).join('\n');
  return `      <dl class="bd-defs">
${rows}
      </dl>`;
}

function metricNote() {
  return '      <p class="bd-note">Domain Rating, Authority Score, estimated traffic and referring '
    + 'domains are third-party metrics produced by their respective providers, not by '
    + 'PetroHrys.com. The PetroHrys Score is a first-party editorial assessment.</p>';
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

  if (directory.free === true && directory.paid === true) {
    badges.push({ state: 'mixed', text: 'Free and paid tiers' });
  } else if (directory.free === true) {
    badges.push({ state: 'free', text: 'Free listing' });
  } else if (directory.paid === true) {
    badges.push({ state: 'paid', text: 'Paid listing' });
  } else {
    badges.push({ state: 'unknown', text: 'Listing cost not recorded' });
  }

  if (directory.verificationRequired === true) {
    badges.push({ state: 'gated', text: 'Verification required' });
  } else if (directory.verificationRequired === false) {
    badges.push({ state: 'open', text: 'No verification required' });
  } else {
    badges.push({ state: 'unknown', text: 'Verification requirement not recorded' });
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

const FILTERS = [
  { field: 'free', label: 'Free listing' },
  { field: 'paid', label: 'Paid listing' },
  { field: 'verificationRequired', label: 'Verification required' },
  { field: 'acceptsSaaS', label: 'Accepts SaaS' },
  { field: 'acceptsStartups', label: 'Accepts startups' },
  { field: 'acceptsAI', label: 'Accepts AI products' },
];

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

function filterControls({ idPrefix = 'bd' } = {}) {
  const boxes = FILTERS.map((f) => {
    const id = `${escapeHtml(idPrefix)}-filter-${escapeHtml(f.field)}`;
    return `          <div class="bd-check">
            <input type="checkbox" id="${id}" data-bd-filter="${escapeHtml(f.field)}">
            <label for="${id}">${escapeHtml(f.label)}</label>
          </div>`;
  }).join('\n');
  return `      <fieldset class="bd-control" data-bd-filter-wrap hidden>
        <legend class="bd-label">Filter</legend>
        <div class="bd-checks">
${boxes}
        </div>
      </fieldset>`;
}

function sortControls({ idPrefix = 'bd' } = {}) {
  const id = `${escapeHtml(idPrefix)}-sort`;
  const options = SORT_KEYS.map((key) =>
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
  return [directory.name, directory.description, ...(directory.recommendedIndustries || [])]
    .filter((part) => typeof part === 'string')
    .join(' ')
    .toLowerCase();
}

function numAttr(value) {
  return isNullish(value) ? '' : String(value);
}

function directoryRow(directory) {
  const provenance = directory.metricsProvenance || {};
  const attrs = [
    `data-bd-name="${escapeHtml(String(directory.name || '').toLowerCase())}"`,
    `data-bd-haystack="${escapeHtml(haystack(directory))}"`,
    `data-bd-score="${escapeHtml(numAttr(directory.petroHrysScore))}"`,
    `data-bd-dr="${escapeHtml(numAttr(directory.domainRating))}"`,
    `data-bd-as="${escapeHtml(numAttr(directory.authorityScore))}"`,
    `data-bd-traffic="${escapeHtml(numAttr(directory.estimatedTraffic))}"`,
    ...FILTERS.map((f) => `${dataKey(f.field)}="${directory[f.field] === true ? '1' : '0'}"`),
  ].join(' ');
  return `          <tr class="bd-row" ${attrs}>
            <th class="bd-cell" scope="row"><a href="${escapeHtml(directory.slug)}/">${escapeHtml(directory.name)}</a></th>
            <td class="bd-cell">${metric(directory.petroHrysScore)}</td>
            <td class="bd-cell">${metric(directory.domainRating, provenance.domainRating)}</td>
            <td class="bd-cell">${metric(directory.authorityScore, provenance.authorityScore)}</td>
            <td class="bd-cell">${metric(directory.estimatedTraffic, provenance.estimatedTraffic)}</td>
          </tr>`;
}

// Server order always comes from bd-sort, so the table is correct before any
// JavaScript runs. No row cap and no pagination logic lives here.
function directoryTable({ directories, caption = 'Directories' }) {
  if (!Array.isArray(directories) || directories.length === 0) {
    return emptyState('No directories are published here yet.');
  }
  const rows = sortDirectories(directories).map(directoryRow).join('\n');
  return `      <table class="bd-table">
        <caption class="bd-caption">${escapeHtml(caption)}</caption>
        <thead>
          <tr>
            <th class="bd-cell" scope="col">Directory</th>
            <th class="bd-cell" scope="col">PetroHrys Score</th>
            <th class="bd-cell" scope="col">Domain Rating</th>
            <th class="bd-cell" scope="col">Authority Score</th>
            <th class="bd-cell" scope="col">Estimated traffic</th>
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
        <${h} class="bd-card-title"><a href="${escapeHtml(directory.slug)}/">${escapeHtml(directory.name)}</a></${h}>
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

function methodologyNote() {
  return '      <p class="bd-note">Every directory is checked by hand before publication. Each '
    + 'record stores what the directory accepts, whether listing is free or paid, whether '
    + 'verification or manual review is required, how it links out, and the date it was '
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
// 17. External-link CTA
// ---------------------------------------------------------------------------

// An unusable scheme (javascript:, data:, file:, malformed) is never rendered
// as a link. The raw value is shown as text so nothing is silently dropped.
function externalLinkCta({ url, label = 'Visit directory' }) {
  const href = safeHref(url);
  if (!href) {
    return `      <p class="bd-cta bd-cta--unavailable">${escapeHtml(label)}: `
      + `<span class="bd-metric bd-metric--empty">no usable address recorded</span></p>`;
  }
  return `      <p class="bd-cta"><a class="bd-cta-link" href="${escapeHtml(href)}" `
    + `rel="${REL_EXTERNAL}" target="_blank">${escapeHtml(label)}`
    + `${vh(' (opens in a new tab)')}</a></p>`;
}

module.exports = {
  breadcrumbs, pageIntro, countryCard, categoryCard, cardGrid,
  directoryTable, directoryRow, directoryCard, metric, metricsBlock, metricNote,
  statusBadges, prosCons, bestForTags, bulletList, emptyState, faqSection,
  searchControls, filterControls, sortControls, pagination,
  methodologyNote, provenanceBlock, externalLinkCta,
  FILTERS, VERIFICATION_NOTE, REL_EXTERNAL,
};
