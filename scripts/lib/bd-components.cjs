// scripts/lib/bd-components.cjs
'use strict';
const { escapeHtml } = require('./bd-util.cjs');
const { safeExternalUrl } = require('./bd-seo.cjs');
const { sortDirectories, SORTS, SORT_KEYS } = require('./bd-sort.cjs');
const { directoryPathFor } = require('./bd-routes.cjs');
const S = require('./bd-schema.cjs');

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
// `status` lets an unmeasured metric say "Unknown" rather than showing a bare
// dash with no explanation. It never substitutes a number.
function metric(value, provenance, status) {
  if (isNullish(value)) {
    return status === 'unknown'
      ? `<span class="bd-metric bd-metric--empty">Unknown</span>`
      : dash();
  }
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
    const value = metric(directory[field], thirdParty ? provenance[field] : undefined,
      thirdParty ? directory.metricStatus : undefined);
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

  const SUBMISSION_TEXT = {
    free: 'Free to submit', paid: 'Paid submission', freemium: 'Free and paid tiers',
  };
  badges.push(SUBMISSION_TEXT[directory.submissionModel]
    ? { state: directory.submissionModel, text: SUBMISSION_TEXT[directory.submissionModel] }
    : { state: 'unknown', text: 'Submission model unknown' });

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
function filterValue(directory, field) {
  if (field === 'free-submission') {
    return directory.submissionModel === 'free' || directory.submissionModel === 'freemium';
  }
  const key = field.replace(/^accepts-/, '');
  const match = S.ACCEPTS_KEYS.find((k) => k.toLowerCase() === key);
  return match ? (directory.accepts || {})[match] === true : false;
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
    `data-bd-name="${escapeHtml(String(directory.name || ''))}"`,
    `data-bd-haystack="${escapeHtml(haystack(directory))}"`,
    `data-bd-score="${escapeHtml(numAttr(directory.petroHrysScore))}"`,
    `data-bd-dr="${escapeHtml(numAttr(directory.domainRating))}"`,
    `data-bd-as="${escapeHtml(numAttr(directory.authorityScore))}"`,
    `data-bd-traffic="${escapeHtml(numAttr(directory.estimatedTraffic))}"`,
    ...FILTERS.map((f) => `${dataKey(f.field)}="${filterValue(directory, f.field) ? '1' : '0'}"`),
  ].join(' ');
  return `          <tr class="bd-row" ${attrs}>
            <th class="bd-cell" scope="row"><a href="${escapeHtml(directoryPathFor(directory))}">${escapeHtml(directory.name)}</a></th>
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
        <${h} class="bd-card-title"><a href="${escapeHtml(directoryPathFor(directory))}">${escapeHtml(directory.name)}</a></${h}>
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
function scoreBreakdown(directory) {
  if (!directory.scoreFactors) return '';
  const rows = S.SCORE_FACTORS.map(({ key, weight, label }) => {
    const value = directory.scoreFactors[key];
    return `        <div class="bd-def">
          <dt class="bd-def-t">${escapeHtml(label)} <span class="bd-tag">${weight}%</span></dt>
          <dd class="bd-def-d"><span class="bd-metric">${escapeHtml(value)} / 10</span></dd>
        </div>`;
  }).join('\n');
  return `      <dl class="bd-defs">
${rows}
      </dl>
      <p class="bd-note">The PetroHrys Score is a first-party editorial assessment, not a third-party
      authority metric. It is the weighted sum of the ten factors above, each scored from 0 to 10 by a
      human reviewer, with weights totalling 100%.</p>`;
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
  const href = safeHref(directory.submissionUrl);
  if (!href) {
    return '      <p class="bd-cta bd-cta--unavailable">Official submission page not verified.</p>';
  }
  return `      <p class="bd-cta"><a class="bd-cta-link" href="${escapeHtml(href)}" `
    + `rel="${REL_EXTERNAL}" target="_blank">Official submission page`
    + `${vh(' (opens in a new tab)')}</a></p>`;
}

module.exports = {
  breadcrumbs, pageIntro, countryCard, categoryCard, cardGrid,
  directoryTable, directoryRow, directoryCard, metric, metricsBlock, metricNote,
  statusBadges, prosCons, bestForTags, bulletList, emptyState, faqSection,
  searchControls, filterControls, sortControls, pagination,
  verificationBlock, acceptsList, scoreBreakdown, filterValue,
  relatedDirectories, submissionLink,
  methodologyNote, provenanceBlock, externalLinkCta,
  FILTERS, VERIFICATION_NOTE, REL_EXTERNAL,
};
