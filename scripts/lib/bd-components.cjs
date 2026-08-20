// scripts/lib/bd-components.cjs
'use strict';
const { escapeHtml } = require('./bd-util.cjs');
const { safeExternalUrl } = require('./bd-seo.cjs');
const { sortDirectories, SORTS, SORT_KEYS, compareByName } = require('./bd-sort.cjs');
const { directoryPathFor } = require('./bd-routes.cjs');
const S = require('./bd-schema.cjs');
const { registryTypeLabel } = require('./bd-registry-types.cjs');
const I18N = require('./i18n.cjs');

// ── LOCALE BY CLOSURE, NOT BY PARAMETER OR BY GLOBAL ────────────────────────
//
// This module exports 37 render functions used from ~65 call sites. Three ways
// to give them a locale were available and two are traps:
//
//   1. Thread `t` through all 37 signatures. Correct, but 65 call-site edits
//      where a single missed one silently renders English into a German page —
//      the exact failure class this whole programme exists to remove.
//   2. A module-scoped `let currentLocale`. Small diff, and forbidden: global
//      mutable locale state means two interleaved renders can produce a page
//      in two languages, and nothing in the type system stops it.
//   3. A factory that binds the locale once and returns the API. One
//      implementation, no per-locale branches, no shared mutable state, and a
//      function physically cannot read a locale it was not built with.
//
// This is (3). The factory is memoized per locale, so the closures are built
// four times for the whole build rather than once per page.
//
// Adding a fifth locale requires no change here at all.
function createComponents(locale) {
  const t = I18N.translator(locale);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOT_RECORDED = t('common.notRecorded');

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
  return `    <nav class="breadcrumb bd-breadcrumb" aria-label="${escapeHtml(t('bd.breadcrumb'))}">
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

// `linked: false` names a country without pointing anywhere. It is NOT the same
// as `pending`, which says a country has no verified record yet and therefore
// shows no count at all.
//
// It exists for the crawl-surface policy. This site's only defence against a
// filtered-state facet explosion is that the canonical never carries a query AND
// nothing internal links to one — a static host gives us no other lever, and
// client-injected noindex would be theatre. An index of 97 countries pointing at
// `?country=<slug>` would have built precisely the crawl path that policy
// forbids, so the index NAMES the countries and the facet above it does the
// selecting.
function countryCard({ name, path, count, pending = false, headingLevel = 3, linked = true }) {
  const h = headingTag(headingLevel);
  const title = pending || !linked
    ? `<span class="${pending ? 'bd-pending' : 'bd-card-name'}">${escapeHtml(name)}</span>`
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
      ? `<span class="bd-metric bd-metric--empty">${t('common.unknown')}</span>`
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
  ['petroHrysScore', t('bd.petrohrysScore'), false],
  ['domainRating', t('bd.domainRating'), true, S.DR_NOT_MEASURED_LABEL],
  ['authorityScore', 'Authority Score', true],
  ['estimatedTraffic', t('bd.estimatedTraffic'), true],
  ['referringDomains', t('bd.referringDomains'), true],
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
  parts.push(t('bd.drNote')
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

// Commercial listing information. Deliberately NOT part of registryInformation:
// a listing fact is not a registry fact, and rendering "Listing action" under a
// "Registry information" heading would blur the government/commercial line this
// schema exists to draw.
//
// Rendered only where at least one listing fact is ESTABLISHED. A record whose
// action is merely "unknown" shows nothing — an unverified field is silence,
// not a row reading "not established" on every unresearched platform. A
// Government Registry pillar record resolves to "not-applicable" and can never
// reach this block at all.
// "Apply for inclusion" is worded to carry the gate in the label itself. A
// reader who sees only this row must not come away believing a listing follows
// from submitting, which is exactly what "Create a listing" would imply.
const LISTING_ACTION_LABELS = {
  create: t('bd.createListing'),
  claim: t('bd.claimProfile'),
  'create-and-claim': t('bd.createOrClaim'),
  apply: t('action.apply-for-inclusion'),
  'invite-only': t('bdx.inviteOnly'),
};

function listingInformation(directory) {
  if (!directory) return '';
  const action = directory.listingAction;
  if (!action || action === 'not-applicable') return '';

  const actionLabel = LISTING_ACTION_LABELS[action] || null;
  const vm = directory.verificationMethods;
  const established = !!actionLabel
    || Array.isArray(vm)
    || directory.ownerResponseSupport === true
    || directory.ownerResponseSupport === false
    || !!safeHref(directory.claimUrl);
  if (!established) return '';

  const rows = [];
  const row = (label, value) => rows.push(
    `        <div class="bd-def">
          <dt class="bd-def-t">${escapeHtml(label)}</dt>
          <dd class="bd-def-d">${value}</dd>
        </div>`,
  );

  if (actionLabel) row(t('bdx.listingAction'), escapeHtml(actionLabel));
  // [] and null are different: [] is evidence that nothing is required, null is
  // silence. Only the array form renders.
  if (Array.isArray(vm)) {
    row(t('bdx.verification'), vm.length ? escapeHtml(vm.join(' · ')) : t('bd.noVerificationRequired'));
  }
  if (directory.ownerResponseSupport === true) {
    row('Owner responses', t('bd.canRespondReviews'));
  } else if (directory.ownerResponseSupport === false) {
    row('Owner responses', 'Not available');
  }
  const claimHref = safeHref(directory.claimUrl);
  if (claimHref) {
    row(t('bd.officialClaimPage'),
      `<a href="${escapeHtml(claimHref)}" rel="${REL_EXTERNAL}" target="_blank">`
      + `${escapeHtml(claimHref)}${vh(' (opens in a new tab)')}</a>`);
  }

  if (!rows.length) return '';
  return `      <dl class="bd-defs bd-listing-info">
${rows.join('\n')}
      </dl>`;
}

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
    row(t('col.operator'), typeLabel
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
    // A cross-territory jurisdiction has no code of its own, and showing the
    // raw covers array — ["GB-ENG","GB-WLS"] — would put machine syntax in
    // front of a reader. Name the territories instead, in the ISO names, and
    // keep the jurisdiction's own name primary: a reader looking up the Charity
    // Commission wants to see "England and Wales", not two rows.
    if (Array.isArray(j.covers) && j.covers.length) {
      const names = j.covers.map((code) => {
        const sub = S.ISO.subdivision(code);
        return escapeHtml(sub ? sub.name.replace(/\s*\[[^\]]*\]\s*$/, '') : code);
      });
      row(t('bd.jurisdiction'), `${escapeHtml(j.name)} <span class="bd-def-note">`
        + `Covers ${names.join(' · ')}</span>`);
    } else {
      row(t('bd.jurisdiction'), j.code
        ? `${escapeHtml(j.name)} <span class="bd-def-note">${escapeHtml(j.code)}</span>`
        : escapeHtml(j.name));
    }
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
    row('English title', t('bd.editorialTranslation'));
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
    ? { state: 'verified', text: t('bd.verified') }
    : { state: 'unverified', text: t('bd.notYetVerified') });

  // Labels come from the schema so a new submission model can never render as
  // "undefined" or silently fall through to "unknown".
  const submissionText = S.SUBMISSION_MODEL_LABELS[directory.submissionModel];
  badges.push(submissionText
    ? { state: directory.submissionModel, text: submissionText }
    : { state: 'unknown', text: S.SUBMISSION_MODEL_LABELS.unknown });

  if (directory.verificationRequired === true) {
    badges.push({ state: 'gated', text: t('bd.verificationRequired') });
  } else if (directory.verificationRequired === false) {
    badges.push({ state: 'open', text: t('bd.noVerificationRequired') });
  } else {
    badges.push({ state: 'unknown', text: t('bd.verificationReqUnknown') });
  }

  // `registrationRequired` answers "must an organisation register in order to
  // appear here". For a commercial directory that is a sign-up; for a statutory
  // register it is a matter of law. Rendering both as a bare "Registration
  // required" invited the opposite reading — that the READER needs an account —
  // which on a free public register is exactly backwards. FINRA BrokerCheck
  // carried that badge beside a "free to search with no account required"
  // strength on the same screen.
  const statutory = directory.submissionModel === 'notApplicable';
  if (directory.registrationRequired === true) {
    badges.push(statutory
      ? { state: 'statutory', text: t('bd.entityRegRequired') }
      : { state: 'gated', text: t('bd.listingRegRequired') });
  } else if (directory.registrationRequired === false) {
    badges.push({ state: 'open', text: t('bd.listingRegNotRequired') });
  } else {
    badges.push({ state: 'unknown', text: t('bd.listingRegUnknown') });
  }

  // Whether a READER needs an account is a different question answered by a
  // different field, and on a public register it is the one that matters.
  const login = directory.publicAccess ? directory.publicAccess.loginRequired : undefined;
  if (login === true) {
    badges.push({ state: 'gated', text: t('bd.accountRequiredSearch') });
  } else if (login === false) {
    badges.push({ state: 'open', text: t('bd.noAccountRequiredSearch') });
  }

  if (directory.reviewSystem === true) {
    badges.push({ state: 'reviews', text: t('bd.hasReviewSystem') });
  } else if (directory.reviewSystem === false) {
    badges.push({ state: 'no-reviews', text: t('bd.noReviewSystem') });
  } else {
    badges.push({ state: 'unknown', text: t('bd.reviewSystemUnknown') });
  }

  const items = badges.map((b) =>
    `        <li class="bd-badge" data-bd-state="${escapeHtml(b.state)}">${escapeHtml(b.text)}</li>`).join('\n');
  return `      <ul class="bd-badges" aria-label="${escapeHtml(t('bd.listingStatus'))}">
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
        <${h} class="bd-subhead">${t('bd.strengths')}</${h}>
${bulletList(pros, t('bd.noStrengths'))}
        <${h} class="bd-subhead">${t('common.limitations')}</${h}>
${bulletList(cons, t('bd.noLimitations'))}
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
    return `      <p class="bd-empty">${t('bd.noIndustries')}</p>`;
  }
  const rows = industries.map((item) =>
    `        <li class="bd-chip">${escapeHtml(item)}</li>`).join('\n');
  return `      <ul class="bd-chips" aria-label="${escapeHtml(t('bd.recommendedIndustries'))}">
${rows}
      </ul>`;
}

// ---------------------------------------------------------------------------
// 11. Empty state
// ---------------------------------------------------------------------------

const VERIFICATION_NOTE = t('bd.verificationNote')
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
  { field: 'free-submission', label: t('bd.freeToSubmit') },
  { field: 'accepts-startup', label: t('bd.acceptsStartups') },
  { field: 'accepts-saas', label: t('bd.acceptsSaas') },
  { field: 'accepts-localbusiness', label: t('bd.acceptsLocal') },
  { field: 'accepts-developer', label: t('bd.acceptsDevTools') },
  { field: 'accepts-ai', label: t('bd.acceptsAi') },
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
        <label class="bd-label" for="${id}">${t('bd.searchDirectories')}</label>
        <input class="bd-input" id="${id}" type="search" data-bd-search
               placeholder="${escapeHtml(t('bd.filterByText'))}" autocomplete="off">
      </div>`;
}

const FILTER_DISCLOSURE = t('bd.filterDisclosure')
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
        <legend class="bd-label">${t('bd.filter')}</legend>
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
  // Gated on the same column as its descending twin. Left unmapped it would
  // fall through the filter below and be offered on pages that render no
  // Domain Rating at all, where it can only sort by the tiebreak.
  'domain-rating-asc': 'domainRating',
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
        <label class="bd-label" for="${id}">${t('bd.sortBy')}</label>
        <select class="bd-select" id="${id}" data-bd-sort>
${options}
        </select>
      </div>`;
}

// A select-based facet. Distinct from the boolean checkboxes above: those ask
// "is this true?", these ask "which value?". Options are derived from the rows
// on the page, so a facet can never offer a value that filters to nothing.
//
// Rendered visible rather than hidden-until-JS, because the wrapper carries a
// <noscript> explanation and the whole table is present either way.
// The recommendation table. Every row carries its score, its level, the basis
// the fit rests on, and the reasons — because a recommendation an employee
// cannot interrogate is one they have to re-research, which defeats the point.
function recommendationTable({ rows, profileLabel }) {
  const head = [t('col.platform'), 'Score', 'Level', 'Fit basis', t('col.why')];
  const body = rows.map((r) => {
    const reasons = (r.recommendationReasons || []).length
      ? `<ul class="bd-reasons">${(r.recommendationReasons || [])
        .map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>`
      : `<span class="bd-muted">${escapeHtml(t('bd.noEvidence'))}</span>`;
    return `          <tr data-bd-rec-level="${escapeHtml(String(r.recommendationLevel || ''))}" `
      + `data-bd-rec-basis="${escapeHtml(String(r.recommendationBasis || ''))}">
            <td data-label="Platform"><a href="${escapeHtml(r.website)}" rel="${REL_EXTERNAL}" target="_blank">${escapeHtml(r.name)}</a></td>
            <td data-label="Score">${escapeHtml(String(r.recommendationScore))}</td>
            <td data-label="Level">${escapeHtml(String(r.recommendationLevel || ''))}</td>
            <td data-label="Fit basis">${escapeHtml(String(r.recommendationBasis || ''))}</td>
            <td data-label="Why">${reasons}</td>
          </tr>`;
  }).join('\n');
  return `      <div class="bd-table-wrap">
        <table class="bd-table">
          <caption>${escapeHtml(`Directories ranked for ${profileLabel}`)}</caption>
          <thead><tr>${head.map((h) => `<th scope="col">${escapeHtml(h)}</th>`).join('')}</tr></thead>
          <tbody>
${body}
          </tbody>
        </table>
      </div>`;
}

// `facet.multi` marks a facet whose row attribute holds a SPACE-SEPARATED SET
// rather than one value, so bd-discovery matches it by membership instead of
// equality. Declaring it is not cosmetic: the opportunities worklist offered
// bestfor="saas" against rows reading "saas ai-startup cloud fintech", and
// equality matched 0 of the 16 rows that carry the token. Three of its six
// options matched nothing at all; the other three matched only the rows whose
// whole list happened to be one token — 2 of 26 for local-business.
//
// A multi facet counts TOKENS, so the number beside an option is the number of
// rows selecting it will show. Counting joined strings advertised 24 for
// local-business where 2 rows matched, which is a second, quieter lie.
// A floor on Domain Rating, which is the one control here that is not an
// equality match.
//
// ── WHY THRESHOLDS AND NOT BANDS ────────────────────────────────────────────
//
// "40-49" reads as a category and invites the reader to believe the corpus is
// sorted into kinds. A floor asks the only question a reader actually has —
// "show me the strong ones, and let me decide where strong starts" — and it
// composes with the sort instead of competing with it.
//
// ── WHY NO WORDS ────────────────────────────────────────────────────────────
//
// No "Good", "Strong" or "Trusted". Ahrefs publishes a number on a logarithmic
// scale and publishes no bands for it, so any label here would be this
// project's opinion wearing Ahrefs' clothes. The numbers say what they say.
//
// Thresholds that would match nothing are not offered: a select full of "(0)"
// options is a control that mostly lies about what it can do.
const MIN_DR_THRESHOLDS = [10, 20, 30, 40, 50, 60, 70, 80, 90];

function minDomainRatingControl({ idPrefix = 'bd', rows = [] } = {}) {
  const ratings = rows
    .map((r) => (r && typeof r.domainRating === 'number' ? r.domainRating : null))
    .filter((v) => v !== null);
  if (!ratings.length) return '';
  const id = `${escapeHtml(idPrefix)}-min-dr`;
  const options = MIN_DR_THRESHOLDS
    .map((n) => [n, ratings.filter((v) => v >= n).length])
    .filter(([, count]) => count > 0)
    .map(([n, count]) => `          <option value="${n}">${n}+ (${count})</option>`)
    .join('\n');
  if (!options) return '';
  return `      <div class="bd-control" data-bd-min-dr-wrap hidden>
        <label class="bd-label" for="${id}">${escapeHtml(t('bd.minDr'))}</label>
        <select class="bd-select" id="${id}" data-bd-min-dr>
          <option value="">${escapeHtml(t('common.all'))}</option>
${options}
        </select>
      </div>`;
}

function facetSelect({ idPrefix, facet, label, rows, labels = {}, order = [] }) {
  const id = `${escapeHtml(idPrefix)}-facet-${escapeHtml(facet.name)}`;
  const multi = facet.multi === true;
  const counts = new Map();
  for (const r of rows) {
    const raw = r[facet.key];
    const values = multi
      ? (Array.isArray(raw) ? raw : String(raw ?? '').split(' '))
      : [String(raw ?? facet.fallback ?? '')];
    for (const value of values) {
      const v = String(value);
      if (!v) continue;
      counts.set(v, (counts.get(v) || 0) + 1);
    }
  }
  const rank = (v) => {
    const i = order.indexOf(v);
    return i === -1 ? order.length : i;
  };
  const values = [...counts.entries()].sort((a, b) => (rank(a[0]) - rank(b[0]))
    || (b[1] - a[1]) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const options = values.map(([v, n]) =>
    `          <option value="${escapeHtml(v)}">${escapeHtml(labels[v] || v)} (${n})</option>`).join('\n');
  return `      <div class="bd-control">
        <label class="bd-label" for="${id}">${escapeHtml(label)}</label>
        <select class="bd-select" id="${id}" data-bd-facet="${escapeHtml(facet.name)}"${multi ? ' data-bd-facet-multi' : ''}>
          <option value="">${t('common.all')}</option>
${options}
        </select>
      </div>`;
}

// The reset for search, checkboxes and facets. A component rather than inline
// markup so the data attribute the client script reads is emitted where the
// attribute audit can see it.
function clearFiltersControl({ label = t('common.clearFilters') } = {}) {
  return `      <div class="bd-control">
        <button class="bd-button bd-button--ghost" type="button" data-bd-clear>${escapeHtml(label)}</button>
      </div>`;
}

// ── THE FILTERED EXPORT BUTTON ─────────────────────────────────────────────
//
// The SECOND download action, and deliberately a different one. Every Research
// Center CSV is a build-time artefact of the WHOLE collection, linked as a
// plain file — "Download all 383 platforms as CSV" — and that link keeps
// working with JavaScript switched off, because it is a file on disk. This
// button exports the rows a reader is looking at after their search, facets and
// sort, which only the browser knows. So it ships `hidden` and is revealed only
// once the client has proved it can build a file at all: a button that cannot
// do the thing it names is worse than no button.
//
// {n} survives into the markup on purpose. The count must be the length of the
// array that is actually written, recomputed after every render, so the label
// is a template the client fills — not a number the generator guessed once.
//
// ── WHY THESE FOUR STRINGS ARE NOT IN data/i18n ────────────────────────────
//
// Every other string on these pages comes from the dictionaries and this one
// should too; the migration is one `common.downloadFiltered` key and the
// deletion of this map. It does not today for a reason that is specific to it:
// I18N.t() refuses to emit a string with an unsubstituted placeholder and
// throws, because a page reading "{n}" is exactly the failure it exists to
// prevent — and this is the one string that must reach the browser WITH its
// placeholder intact.
const EXPORT_LABEL = {
  en: 'Download filtered results ({n})',
  es: 'Descargar los resultados filtrados ({n})',
  fr: 'Télécharger les résultats filtrés ({n})',
  de: 'Gefilterte Ergebnisse herunterladen ({n})',
};

function filteredExportControl({ name, count = 0 } = {}) {
  const label = EXPORT_LABEL[locale] || EXPORT_LABEL[I18N.DEFAULT_LOCALE];
  // Rendered with the real row count rather than a placeholder, so the markup
  // is truthful in the moment before the client rewrites it.
  const initial = label.split('{n}').join(String(count));
  // `hidden` sits on the paragraph, not on the button: .bd-note draws a left
  // rule and a margin, so a hidden button inside a visible paragraph would
  // leave a stray vertical line on every page a reader has no script for.
  return `      <p class="bd-note" data-bd-export-wrap hidden><button class="bd-button bd-button--ghost" type="button" `
    + `data-bd-export data-bd-export-name="${escapeHtml(String(name || ''))}" `
    + `data-bd-export-label="${escapeHtml(label)}">${escapeHtml(initial)}</button></p>`;
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
  { field: 'domainRating', label: t('bd.domainRating'), emptyLabel: S.DR_NOT_MEASURED_LABEL },
  { field: 'petroHrysScore', label: t('bd.petrohrysScore'), always: true },
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
    // Facet attributes for the opportunities worklist. Emitted for every row so
    // one filter implementation serves both the boolean checkboxes and the
    // select-based facets, and so a facet can never read a value the row does
    // not actually carry.
    `data-bd-facet-country="${escapeHtml(String(directory.country || ''))}"`,
    `data-bd-facet-category="${escapeHtml(String(directory.category || ''))}"`,
    `data-bd-facet-cost="${escapeHtml(String(directory.submissionModel || 'unknown'))}"`,
    `data-bd-facet-action="${escapeHtml(String(directory.listingAction || 'unknown'))}"`,
    `data-bd-facet-tier="${escapeHtml(String(directory.tier || ''))}"`,
    `data-bd-facet-priority="${escapeHtml(String(directory.priority || 'unassessed'))}"`,
    `data-bd-facet-status="${escapeHtml(String(directory.currentStatus || 'unknown'))}"`,
    `data-bd-facet-audience="${escapeHtml((directory.audienceGeography || []).join(' '))}"`,
    // Directory Intelligence v2. The values arrive already computed on the
    // record so this stays a renderer: one module owns the scoring, and the
    // table, the facets and the CSV all read the same numbers.
    `data-bd-facet-score="${escapeHtml(String(directory.scoreBand || 'unscored'))}"`,
    `data-bd-facet-approval="${escapeHtml(String(directory.approvalMode || 'unknown'))}"`,
    `data-bd-facet-reach="${escapeHtml(String(directory.countryReach || 'unknown'))}"`,
    // v3. The business profiles this platform is a priority or recommended
    // choice for, space-separated. Only those two levels: listing every profile
    // a row merely qualifies for would make the filter meaningless.
    `data-bd-facet-bestfor="${escapeHtml((directory.bestForProfiles || []).join(' '))}"`,
  ].join(' ');
  const cells = TABLE_METRIC_COLUMNS
    .filter((col) => !shown || shown.has(col.field))
    .map((col) => `            <td class="bd-cell" data-bd-label="${escapeHtml(col.label)}">`
      + `${metric(directory[col.field], provenance[col.field], undefined, col.emptyLabel)}</td>`)
    .join('\n');
  // Level 1 operational rows carry no detail page — they exist to be worked
  // from, not read about — so their name links straight to the platform. Only a
  // record substantive enough to pass the meaningful-content contract has an
  // internal page to point at. Linking every row internally would 404 the
  // moment a compact row was added.
  //
  // The route is built for EVERY row, including compact ones, because
  // directoryPathFor is what refuses a hostile slug. Skipping the call for
  // rows that do not use the result would quietly retire that check.
  // A Level 1 operational row has no slug-based route because it never has a
  // page. Editorial records still build their route unconditionally, which is
  // what keeps the hostile-slug check live.
  const isRow = directory.isOperationalRow === true;
  const internalPath = isRow ? null : directoryPathFor(directory);
  const hasDetailPage = !isRow && S.indexability(directory).indexable;
  const nameLink = hasDetailPage
    ? `<a href="${escapeHtml(internalPath)}">${escapeHtml(S.displayName(directory))}</a>`
    : `<a href="${escapeHtml(directory.website)}" rel="${REL_EXTERNAL}" target="_blank">`
      + `${escapeHtml(S.displayName(directory))}</a>`;
  return `          <tr class="bd-row" ${attrs}>
            <th class="bd-cell" scope="row" data-bd-label="Directory">${nameLink}</th>
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
  // National scope only. A record with no jurisdiction whose scope is regional
  // or global is not federal, and must not be filed under a heading that says
  // it is.
  const national = list.filter((d) => !d.jurisdiction && d.scope === 'national')
    .sort(byJurisdictionThenName);
  if (national.length) {
    groups.push({
      key: S.NATIONAL_KEY,
      label: S.jurisdictionLabel(countrySlug, S.NATIONAL_KEY),
      items: national,
      count: national.length,
    });
  }
  // Types are grouped by LABEL, not one group per type. The United Kingdom maps
  // both `country` (England, Scotland, Wales) and `province` (Northern Ireland)
  // to "Constituent countries", and rendering those as two boxes with the same
  // heading would tell a reader there are two kinds of constituent country.
  // Where every type has its own label — the United States, Canada, Australia —
  // this merges nothing and the output is unchanged.
  const byLabel = new Map();
  for (const type of S.allowedJurisdictionTypes(countrySlug) || []) {
    const items = list.filter((d) => d.jurisdiction && d.jurisdiction.type === type);
    if (!items.length) continue;
    const label = S.jurisdictionLabel(countrySlug, type);
    const existing = byLabel.get(label);
    if (existing) existing.items.push(...items);
    // The key comes from the FIRST type to claim the label, so the anchor and
    // the jump link stay stable as later types join it.
    else byLabel.set(label, { key: type, label, items: [...items] });
  }
  for (const group of byLabel.values()) {
    group.items.sort(byJurisdictionThenName);
    groups.push({ ...group, count: group.items.length });
  }

  // Everything left with no jurisdiction: regional or global bodies filed under
  // this country. Rendered last, under a label that claims nothing about them.
  const other = list.filter((d) => !d.jurisdiction && d.scope !== 'national')
    .sort(byJurisdictionThenName);
  if (other.length) {
    groups.push({
      key: S.OTHER_KEY,
      label: S.jurisdictionLabel(countrySlug, S.OTHER_KEY),
      items: other,
      count: other.length,
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

// The coverage sentence, computed from the jurisdiction manifest and the
// records actually published — never from a record total. 34 subnational
// records could be 34 states, or 31 states plus a district plus two
// territories, or two records for one state. Only the manifest knows which.
//
// This exists to stop the page implying nationwide coverage it does not have.
// It says what is covered and what is not, in one line, and the numbers move
// on their own when a jurisdiction is published.
function coverageStatement(manifest, publishedCodes) {
  if (!manifest || !Array.isArray(manifest.jurisdictions)) return '';
  const states = manifest.jurisdictions.filter((j) => j.kind === 'state');
  if (!states.length) return '';
  const covered = states.filter((j) => publishedCodes.has(j.jurisdictionCode || j.code)).length;
  const pending = states.length - covered;
  if (!pending) {
    return `      <p class="bd-coverage">${escapeHtml(`Official business registry coverage is `
      + `available for all ${states.length} states.`)}</p>`;
  }
  return `      <p class="bd-coverage">${escapeHtml(`Official business registry coverage is `
    + `available for ${covered} of ${states.length} states; ${pending} `
    + `${pending === 1 ? 'state remains' : 'states remain'} pending verification.`)}</p>`;
}

// --- state coverage surface -------------------------------------------------
//
// A country page that lists 31 state registries answers "which registries do
// you have" and leaves "is my state covered" unanswerable without counting.
// The grid answers the second question directly: every state appears exactly
// once, whether or not it has a record.
//
// A pending state is NOT a directory. It gets no link, no detail page, no
// sitemap entry and no JSON-LD, because there is nothing to link to — only a
// truthful statement that the work is not done. Conflating the two is how a
// coverage grid turns into a claim of coverage.

// Reader-facing wording for each blocker code. The manifest's blockerSummary is
// an internal note; this is what a visitor sees, and it says what kind of
// obstacle it is without narrating the investigation.
const BLOCKER_LABELS = {
  'none': t('bd.pendingVerification'),
  'connection-blocked': t('bd.appUnreachable'),
  'waf-blocked': t('bd.appBlockedAutomated'),
  'geo-blocked': t('bd.appRegionRestricted'),
  'login-required-unverified': t('bd.accessBehaviourUnconfirmed'),
  'js-only-unverified': t('bd.accessBehaviourUnconfirmed'),
  'official-url-unresolved': t('bd.addressUnresolved'),
  'system-transition': t('bd.systemInTransition'),
  'manual-browser-check': t('bd.accessBehaviourUnconfirmed'),
  'other': t('bd.pendingVerification'),
};

const ACCESS_BADGE = {
  open: t('bd.open'),
  'partially-open': 'Partly open',
  'login-required': t('bd.accountRequired'),
  'identity-verification-required': t('bd.identityCheckRequired'),
  restricted: t('bd.restricted'),
  unknown: t('bd.accessUnconfirmed'),
};

// The coverage summary above the grid. Both numbers are counted here and
// nowhere else, so the sentence and the grid cannot disagree.
function stateCoverageSummary(entries) {
  const total = entries.length;
  const verified = entries.filter((e) => e.record).length;
  const pending = total - verified;
  const line = pending === 0
    ? `All ${total} states verified.`
    : `${verified} of ${total} states verified · ${pending} pending verification`;
  return `      <p class="bd-coverage-summary">${escapeHtml(line)}</p>`;
}

// One card per state, in alphabetical order, published and pending alike.
function stateGrid(entries, { headingId = 'state-coverage' } = {}) {
  if (!entries.length) return '';
  const cards = entries.map((e) => {
    const name = escapeHtml(e.name);
    if (e.record) {
      const r = e.record;
      const access = ACCESS_BADGE[(r.publicAccess && r.publicAccess.accessLevel) || 'unknown']
        || ACCESS_BADGE.unknown;
      const score = r.petroHrysScore === null || r.petroHrysScore === undefined
        ? '' : `<span class="bd-state-score">${escapeHtml(String(r.petroHrysScore))}</span>`;
      return `        <li class="bd-state" data-bd-state-code="${escapeHtml(e.code)}" data-bd-state-status="published">
          <a class="bd-state-link" href="${escapeHtml(e.path)}">
            <span class="bd-state-name">${name}</span>
            <span class="bd-state-registry">${escapeHtml(S.displayName(r))}</span>
          </a>
          <span class="bd-state-operator">${escapeHtml(r.operator ? r.operator.name : '')}</span>
          <span class="bd-state-meta"><span class="bd-state-access" data-bd-access="${escapeHtml((r.publicAccess && r.publicAccess.accessLevel) || 'unknown')}">${escapeHtml(access)}</span>${score}</span>
        </li>`;
    }
    // No anchor, no href, nothing to click: there is no page behind it.
    const label = BLOCKER_LABELS[e.blockerCode] || BLOCKER_LABELS.other;
    return `        <li class="bd-state" data-bd-state-code="${escapeHtml(e.code)}" data-bd-state-status="pending">
          <span class="bd-state-name">${name}</span>
          <span class="bd-state-pending">${t('bd.pendingVerification')}</span>
          <span class="bd-state-blocker">${escapeHtml(label)}</span>
        </li>`;
  }).join('\n');
  return `      <ul class="bd-states" aria-labelledby="${escapeHtml(headingId)}">
${cards}
      </ul>`;
}

// The jurisdiction selector. Every state is listed whether or not it has a
// record, because a reader looking for a pending state needs to find out that
// it is pending — an absent option would read as "no such place".
function jurisdictionSelect(entries, groups, { idPrefix = 'jurisdiction' } = {}) {
  if (!entries.length) return '';
  const id = `${idPrefix}-select`;
  const groupOptions = (groups || []).filter((g) => g.key !== 'state')
    .map((g) => `          <option value="group:${escapeHtml(g.key)}">${escapeHtml(g.label)}</option>`)
    .join('\n');
  const stateOptions = entries.map((e) => `          <option value="state:${escapeHtml(e.code)}">`
    + `${escapeHtml(e.name)}${e.record ? '' : ' — pending verification'}</option>`).join('\n');
  return `      <div class="bd-control" data-bd-jselect-wrap hidden>
        <label class="bd-label" for="${escapeHtml(id)}">${t('bd.jurisdiction')}</label>
        <select class="bd-select" id="${escapeHtml(id)}" data-bd-jurisdiction-select>
          <option value="all">${t('bd.allJurisdictions')}</option>
${groupOptions}
${stateOptions}
        </select>
      </div>`;
}

// One control per group present. Counts are derived, never written down twice.
function jurisdictionFilter(groups, { idPrefix = 'jurisdiction' } = {}) {
  if (!groups || groups.length < 2) return '';
  const options = groups.map((g) => `        <li><a class="bd-jfilter-link" `
    + `href="#${escapeHtml(`${idPrefix}-${g.key}`)}" data-bd-jurisdiction-filter="${escapeHtml(g.key)}">`
    + `${escapeHtml(g.label)} <span class="bd-jfilter-count">${escapeHtml(registryCount(g.count))}`
    + `</span></a></li>`).join('\n');
  return `      <nav class="bd-jfilter" aria-label="${escapeHtml(t('bd.jumpToJurisdiction'))}">
      <ul class="bd-jfilter-list">
${options}
      </ul>
      </nav>`;
}

// Server order always comes from bd-sort, so the table is correct before any
// JavaScript runs. No row cap and no pagination logic lives here.
function directoryTable({ directories, caption = t('bd.directories'), columns, sortKey = 'default' }) {
  if (!Array.isArray(directories) || directories.length === 0) {
    return emptyState(t('bd.noDirectories'));
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
  // Wrapped in the scroll container every other collection uses. Without it a
  // wide worklist forces the whole PAGE to scroll horizontally on a phone, and
  // longer German and French column labels make that worse rather than better.
  return `      <div class="bd-table-wrap">
      <table class="bd-table">
        <caption class="bd-caption">${escapeHtml(caption)}</caption>
        <thead>
          <tr>
            <th class="bd-cell" scope="col">${t('bd.directory')}</th>
${heads}
          </tr>
        </thead>
        <tbody data-bd-rows>
${rows}
        </tbody>
      </table>
      </div>`;
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
  return `      <nav class="bd-pagination" aria-label="${escapeHtml(t('bd.directoryPages'))}">
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
    : `<span class="bd-metric bd-metric--empty">${t('bd.notYetVerified')}</span>`;
  const next = directory.nextVerification
    ? `<time datetime="${escapeHtml(directory.nextVerification)}">${escapeHtml(directory.nextVerification)}</time>`
    : dash();
  return `      <dl class="bd-defs bd-provenance">
        <div class="bd-def">
          <dt class="bd-def-t">${t('bd.lastVerified')}</dt>
          <dd class="bd-def-d">${verified}</dd>
        </div>
        <div class="bd-def">
          <dt class="bd-def-t">${t('bd.nextVerificationDue')}</dt>
          <dd class="bd-def-d">${next}</dd>
        </div>
      </dl>`;
}

// ---------------------------------------------------------------------------
// 18. Verification block
// ---------------------------------------------------------------------------

const VERIFICATION_SOURCE_LABELS = {
  'official-website': t('bd.officialWebsite'),
  'official-documentation': t('bd.officialDocs'),
  'government-register': t('bd.governmentRegister'),
  'manual-verification': t('bd.manualVerification'),
  other: t('bd.other'),
};

const VERIFICATION_STATUS_LABELS = {
  verified: t('bd.verified'),
  unverified: t('bd.notYetVerified'),
  pending: t('bd.verificationPending'),
};

// Exposes who checked the record, how, and when. The reviewers array is
// rendered as a list so a second reviewer needs no markup change.
function verificationBlock(directory) {
  const v = directory.verification || {};
  const status = VERIFICATION_STATUS_LABELS[v.status] || t('bd.notYetVerified');
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
    : `<span class="bd-metric bd-metric--empty">${t('common.unknown')}</span>`;

  return `      <dl class="bd-defs bd-provenance">
        <div class="bd-def">
          <dt class="bd-def-t">${t('bd.verificationStatus')}</dt>
          <dd class="bd-def-d"><span class="bd-metric">${escapeHtml(status)}</span></dd>
        </div>
        <div class="bd-def">
          <dt class="bd-def-t">${t('bd.verificationSource')}</dt>
          <dd class="bd-def-d">${source ? `<span class="bd-metric">${escapeHtml(source)}</span>` : dash()}</dd>
        </div>
        <div class="bd-def">
          <dt class="bd-def-t">${t('bd.lastVerified')}</dt>
          <dd class="bd-def-d">${date}</dd>
        </div>
        <div class="bd-def">
          <dt class="bd-def-t">${t('bd.nextVerificationDue')}</dt>
          <dd class="bd-def-d">${next}</dd>
        </div>
        <div class="bd-def">
          <dt class="bd-def-t">${t('bd.editorialReviewer')}</dt>
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
    const text = value === true ? 'Yes' : value === false ? 'No' : t('common.unknown');
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
    return `      <p class="bd-empty">${t('bd.noEditorialRel')}</p>`;
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
    return `      <p class="bd-cta bd-cta--unavailable">${t('bd.submissionNotVerified')}</p>`;
  }
  return `      <p class="bd-cta"><a class="bd-cta-link" href="${escapeHtml(href)}" `
    + `rel="${REL_EXTERNAL}" target="_blank">Official submission page`
    + `${vh(' (opens in a new tab)')}</a></p>`;
}

// ---------------------------------------------------------------------------
// 22. Editorial guidance
// ---------------------------------------------------------------------------

const DIFFICULTY_LABELS = { 'very-easy': 'Very easy', easy: t('bd.easy'), moderate: t('band.Moderate'), hard: t('bd.hard') };
const QUALITY_LABELS = { high: t('confidence.HIGH'), mixed: t('bd.mixed'), low: t('confidence.LOW') };
const ASSET_LABELS = {
  logo: t('bd.logo'), website: t('bd.website'), description: t('bd.description'), categories: t('bd.categories'),
  contact: t('bd.contactInformation'), screenshots: t('bd.screenshots'), businessVerification: t('bd.businessVerification'),
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
    ['submissionDifficulty', t('bd.submissionDifficulty'), DIFFICULTY_LABELS[directory.submissionDifficulty]],
    ['listingQuality', t('bd.listingQuality'), QUALITY_LABELS[directory.listingQuality]],
    ['typicalApprovalTime', t('bd.approvalTime'), directory.typicalApprovalTime],
    ['reviewProcess', 'Review process', directory.reviewProcess],
  ].filter(([key]) => on(key)).map(([, label, value]) => `        <div class="bd-def">
          <dt class="bd-def-t">${escapeHtml(label)}</dt>
          <dd class="bd-def-d">${value ? `<span class="bd-metric">${escapeHtml(value)}</span>`
    : `<span class="bd-metric bd-metric--empty">${t('common.unknown')}</span>`}</dd>
        </div>`).join('\n');

  const list = (items, empty) => (items && items.length
    ? `      <ul class="bd-list">\n${items.map((i) => `        <li>${escapeHtml(i)}</li>`).join('\n')}\n      </ul>`
    : `      <p class="bd-empty">${escapeHtml(empty)}</p>`);

  const parts = [];
  if (defs) parts.push(`      <dl class="bd-defs">\n${defs}\n      </dl>`);
  parts.push(`      <h3 class="bd-subhead">${t('col.bestFor')}</h3>\n${list(directory.bestFor, t('bd.noGuidance'))}`);
  parts.push(`      <h3 class="bd-subhead">${t('bd.notRecommendedFor')}</h3>\n${list(directory.notRecommendedFor, t('bd.noGuidance'))}`);
  if (on('preparationChecklist')) {
    parts.push(`      <h3 class="bd-subhead">${t('bd.prepChecklist')}</h3>\n${list(directory.preparationChecklist, 'No checklist recorded yet.')}`);
  }
  if (on('commonMistakes')) {
    parts.push(`      <h3 class="bd-subhead">${t('bd.commonMistakes')}</h3>\n${list(directory.commonMistakes, 'No common mistakes recorded yet.')}`);
  }
  if (on('requiredAssets')) {
    const assets = S.REQUIRED_ASSET_KEYS.map((key) => {
      const value = (directory.requiredAssets || {})[key];
      const text = value === true ? 'Required' : value === false ? 'Not required' : t('common.unknown');
      return `        <div class="bd-def">
          <dt class="bd-def-t">${escapeHtml(ASSET_LABELS[key])}</dt>
          <dd class="bd-def-d"><span class="bd-metric">${text}</span></dd>
        </div>`;
    }).join('\n');
    parts.push(`      <h3 class="bd-subhead">${t('bd.requiredAssets')}</h3>
      <p class="bd-note">${t('bd.assetsUnknownNote')}</p>
      <dl class="bd-defs">\n${assets}\n      </dl>`);
  }
  const note = guidanceAbsenceNote(active);
  if (note) parts.push(note);
  return parts.join('\n\n');
}

  return {
  breadcrumbs, pageIntro, countryCard, categoryCard, cardGrid,
  directoryTable, directoryRow, directoryCard, metric, metricsBlock, metricNote,
  statusBadges, prosCons, bestForTags, bulletList, emptyState, faqSection,
  registryInformation,
  listingInformation,
  recommendationTable,
  searchControls, filterControls, sortControls, pagination, facetSelect, clearFiltersControl,
  minDomainRatingControl, MIN_DR_THRESHOLDS,
  filteredExportControl,
  verificationBlock, acceptsList, scoreBreakdown, filterValue, filterAttr,
  relatedDirectories, submissionLink, editorialGuidance,
  methodologyNote, provenanceBlock, externalLinkCta,
  activeMetricFields, activeGuidanceFields, tableColumnsFor, countLabel,
  jurisdictionGroups, jurisdictionFilter, byJurisdictionThenName, registryCount,
  stateGrid, stateCoverageSummary, jurisdictionSelect, BLOCKER_LABELS, ACCESS_BADGE,
  coverageStatement,
  FILTERS, VERIFICATION_NOTE, REL_EXTERNAL, FILTER_DISCLOSURE,
};
}

// Memoized: four closure sets per build, not one per page.
const cache = new Map();
function components(locale) {
  if (!cache.has(locale)) cache.set(locale, createComponents(locale));
  return cache.get(locale);
}

// The English binding is exported as the default shape so existing call sites
// keep working while they migrate. It is NOT a fallback for localized rendering:
// a generator that wants German must ask for German, and the guards below fail
// if a localized page is built from this binding.
module.exports = Object.assign(components(I18N.DEFAULT_LOCALE), {
  components,
  createComponents,
});
