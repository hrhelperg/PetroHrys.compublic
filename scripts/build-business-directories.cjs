// scripts/build-business-directories.cjs
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PATHS, writeIfChanged, escapeHtml } = require('./lib/bd-util.cjs');
const { loadRegistry, directoriesFor } = require('./lib/bd-registry.cjs');
const { sortDirectories } = require('./lib/bd-sort.cjs');
const seo = require('./lib/bd-seo.cjs');
const c = require('./lib/bd-components.cjs');
const { renderPage } = require('./lib/bd-render.cjs');
const { renderSitemap, renderRss } = require('./lib/bd-feeds.cjs');
const routes = require('./lib/bd-routes.cjs');
// One resolver for every surface that names a record.
const { displayName } = require('./lib/bd-schema.cjs');
const SCHEMA = require('./lib/bd-schema.cjs');
const { buildArticles, guidesFor } = require('./lib/bd-articles.cjs');
const { validateRegistry, formatReport } = require('./validate-business-directories.cjs');

const BASE = routes.BASE;
const SECTION_DIR = routes.SECTION_DIR;
const SITEMAP_FILE = routes.sitemapOut();
// The employee working list. Staged like any other artefact so it is owned,
// pruned and diffed by the same machinery as the pages.
const CSV_FILE = path.join(SECTION_DIR, 'opportunities.csv');
const csv = require('./lib/bd-csv.cjs');
const opportunities = require('./lib/bd-opportunities.cjs');
const INTEL = require('./lib/bd-intelligence.cjs');
const { renderCsv } = csv;
const FEED_FILE = routes.feedOut();
const MANIFEST_FILE = path.join('data', 'business-directories', '.build-manifest.json');
const REFERENCE_COUNTRY = 'united-states';
const REFERENCE_CATEGORY = 'general-business';
// `global` is an editorial scope, not a place: it is stored as a country so a
// record has exactly one home, but it is presented apart from the national grid.
const GLOBAL_SCOPE = 'global';
// How many rows the hub's two lead tables show. Enough to name real directories
// on the first screen without reprinting the whole dataset.
const HUB_TOP_COUNT = 12;

class BuildError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BuildError';
  }
}

// --- emission policy --------------------------------------------------------

function countryEmitted(registry, country) {
  return country.slug === REFERENCE_COUNTRY
    || directoriesFor(registry, country.slug).length > 0;
}

// A category earns a page by having a verified record in it. The reference
// scaffold that used to force `general-business` into existence is gone: a
// declared category is a plan, and publishing a plan as a page advertises
// coverage the dataset does not have. The country-level scaffold is kept, so the
// section always has a hub and at least one country page.
function categoryEmitted(registry, country, category) {
  return directoriesFor(registry, country.slug, category.slug).length > 0;
}

// --- approved static copy ---------------------------------------------------

const HUB_FAQS = [
  { q: 'What is this section?',
    a: 'A research index of business directories, organised by country and category. Each entry records what a directory accepts, whether listing is free or paid, and how it was verified.' },
  { q: 'How is the PetroHrys Score produced?',
    a: 'It is a first-party editorial assessment made by Petro Hrys. It is not supplied by any third party and is not a review rating.' },
  { q: 'Are Domain Rating and Authority Score your own numbers?',
    a: 'No. Domain Rating, Authority Score, estimated traffic and referring domains are third-party metrics. Each recorded value stores its provider and the date it was measured.' },
  { q: 'Why are some pages empty?',
    a: 'Directories are published only after manual verification. Pages with no verified entries are left empty and excluded from search indexing rather than filled with placeholder data.' },
];

// Renders a country's records grouped by jurisdiction — Federal, then States
// A-Z, then the federal district, then territories — with a jump filter and
// derived counts. Returns null when the country holds no subnational record, so
// the caller falls back to the single flat table it has always emitted.
//
// Each group is a real table with its own caption rather than one long list
// with headings inside it, so a screen reader announces which jurisdiction set
// it is in and a narrow viewport scrolls each table independently.
// Jurisdiction coverage manifests, one per country that has one. Absent means
// "no coverage claim is made for this country", which is the correct default:
// a country with no manifest simply renders no coverage sentence.
function loadCoverageManifests() {
  const out = new Map();
  const dir = PATHS.dataRoot;
  for (const name of fs.readdirSync(dir)) {
    const m = /^([a-z-]+)-jurisdiction-coverage\.json$/.exec(name);
    if (!m) continue;
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    // The filename and the declared country must agree, or the page would
    // quote another country's coverage.
    if (parsed.country !== m[1]) {
      throw new Error(`${name} declares country "${parsed.country}"`);
    }
    out.set(parsed.country, parsed);
  }
  return out;
}
const coverageManifests = loadCoverageManifests();

function jurisdictionSections(country, entries, columns) {
  const groups = c.jurisdictionGroups(entries, country.slug);
  if (!groups) return null;
  void columns;
  const out = [c.jurisdictionFilter(groups, { idPrefix: `${country.slug}-jurisdiction` })];
  // The coverage entries for this country, if a manifest declares them. Each is
  // a jurisdiction the section is measured against, paired with its record
  // where one exists — the pairing is done here rather than in the manifest, so
  // a manifest that drifts from the registry cannot make the grid lie.
  const manifest = coverageManifests.get(country.slug);
  const byCode = new Map(entries.filter((d) => d.jurisdiction).map((d) => [d.jurisdiction.code, d]));
  const stateEntries = manifest
    ? manifest.jurisdictions.filter((j) => j.kind === 'state').map((j) => ({
      code: j.jurisdictionCode,
      name: j.stateName,
      blockerCode: j.blockerCode || 'other',
      // Pairing is done from the REGISTRY, not from the manifest's own
      // publicationStatus: if the two ever drift, the grid follows the records
      // that actually exist rather than the file's claim about them.
      record: byCode.get(j.jurisdictionCode) || null,
      path: byCode.has(j.jurisdictionCode) ? routes.directoryPathFor(byCode.get(j.jurisdictionCode)) : null,
    }))
    : [];
  if (stateEntries.length) {
    out.push(c.jurisdictionSelect(stateEntries, groups, { idPrefix: `${country.slug}-jurisdiction` }));
  }

  for (const group of groups) {
    const id = `${country.slug}-jurisdiction-${group.key}`;
    const isStates = group.key === 'state' && stateEntries.length > 0;
    out.push(`      <div class="bd-jgroup" id="${escapeHtml(id)}">
      <h3 class="bd-jgroup-title" id="${escapeHtml(id)}-title">${escapeHtml(group.label)} `
      + `<span class="bd-jgroup-count">${escapeHtml(c.registryCount(group.count))}</span></h3>`
      + (isStates
        ? `\n${c.stateCoverageSummary(stateEntries)}\n`
          + `${c.stateGrid(stateEntries, { headingId: `${id}-title` })}`
        : '')
      + `
${c.directoryTable({
    directories: group.items,
    caption: `${group.label} registries in ${country.name}`,
    // Columns are derived PER GROUP, not once for the country. A Domain Rating
    // column computed across all US records renders in the States table too,
    // where no row has a rating — a column of nothing, which is exactly what
    // the metric-column rule exists to prevent.
    columns: c.tableColumnsFor(group.items),
    // Already ordered by jurisdiction; the table must not re-sort it.
    sortKey: null,
  })}
      </div>`);
  }
  return out;
}

function countryFaqs(country, count) {
  return [
    { q: `Which directories are listed for ${country.titleName}?`,
      a: count === 0
        ? `None yet. No directory for ${country.titleName} has completed manual verification, so nothing is published on this page.`
        : `${count} verified ${count === 1 ? 'directory is' : 'directories are'} currently published for ${country.titleName}.` },
    { q: 'Are listings here paid placements?',
      a: 'No. Nothing on these pages is sold, sponsored, or accepted in exchange for payment.' },
  ];
}

function section(id, heading, body) {
  return `    <section class="bd-section" aria-labelledby="${id}">
      <h2 id="${id}">${heading}</h2>
${body}
    </section>`;
}

// --- page model -------------------------------------------------------------
// Every page declares an `owner`: the single registry fact responsible for it.
// Pruning and ownership checks rely on this being one-to-one.

function pageModel(registry) {
  const pages = [];
  // Records demoted to noindex,follow, with the clause each one failed, so the
  // build can report exactly why rather than just how many.
  const noindexReport = [];

  const allDirectories = registry.directories;
  const activeMetrics = c.activeMetricFields(allDirectories);
  const activeGuidance = c.activeGuidanceFields(allDirectories);

  // Global is an editorial scope, not a country, so it is lifted out of the
  // national grid rather than sorted among it.
  const globalCountry = registry.countries.find((country) => country.slug === GLOBAL_SCOPE);
  const globalEntries = globalCountry
    ? sortDirectories(directoriesFor(registry, GLOBAL_SCOPE)) : [];

  const countryLinks = registry.countries
    .filter((country) => country.slug !== GLOBAL_SCOPE && country.entityType !== 'supranational')
    .map((country) => ({
      slug: country.slug,
      name: country.name,
      path: routes.countryPath(country.slug),
      count: directoriesFor(registry, country.slug).length,
      pending: !countryEmitted(registry, country),
    }))
    // Most-covered first, then a stable name order, so the grid tells the reader
    // where the research actually is instead of where the registry file happens
    // to list it.
    .sort((a, b) => (b.count - a.count) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const publishedCountries = countryLinks.filter((l) => !l.pending && l.count > 0);

  // Global is presented apart from the national grid, but it is still a
  // first-class destination: leaving it out of the hub's ItemList would drop the
  // scope holding most of the dataset from the page's structured data.
  const globalLink = globalCountry && globalEntries.length
    ? [{ name: globalCountry.name, path: routes.countryPath(GLOBAL_SCOPE), count: globalEntries.length }]
    : [];

  // Every other supranational scope is lifted out of the national grid for the
  // same reason Global is — it is not a place — but it still needs a way in.
  // This used to be hardcoded to Global alone, which meant a supranational page
  // could generate, enter the sitemap and have no inbound link anywhere. An
  // entry with no published record is not rendered at all: a scope with nothing
  // in it is a plan, and publishing a plan as a card advertises coverage that
  // does not exist.
  const supranationalLinks = registry.countries
    .filter((country) => country.entityType === 'supranational' && country.slug !== GLOBAL_SCOPE)
    .map((country) => ({
      name: country.name,
      path: routes.countryPath(country.slug),
      count: directoriesFor(registry, country.slug).length,
    }))
    .filter((link) => link.count > 0)
    .sort((a, b) => (b.count - a.count) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  // Worklist figures, derived once and shared by the hub hero and the
  // opportunities page. Two independently computed totals would eventually
  // disagree, and the hub is the first thing a reader sees.
  const worklist = csv.actionableOpportunities(allDirectories, registry.operationalRows || []);
  const worklistEditorial = worklist.filter((d) => !d.isOperationalRow).length;
  const worklistRows = worklist.filter((d) => d.isOperationalRow).length;
  const worklistMarkets = new Set(worklist.map((d) => d.country)).size;
  const OPPORTUNITIES_PATH = `${routes.BASE}opportunities/`;

  const hubMeta = seo.buildHubMeta({
    countries: [...globalLink, ...supranationalLinks, ...countryLinks.filter((l) => !l.pending)],
    faqs: HUB_FAQS,
  });

  // Every number is derived. Counts must not reach a meta description — the SEO
  // tests forbid digits there precisely so a count can never be fabricated into
  // one — so the scale is stated in body copy.
  const scopeCount = publishedCountries.length + (globalEntries.length ? 1 : 0)
    + supranationalLinks.length;
  const lastVerifiedAt = allDirectories
    .map((d) => d.lastVerified).filter(Boolean).sort().slice(-1)[0];
  const statLine = `      <p class="bd-stat">${escapeHtml(String(allDirectories.length))} verified `
    + `${allDirectories.length === 1 ? 'directory' : 'directories'} across `
    + `${escapeHtml(String(scopeCount))} ${scopeCount === 1 ? 'country and scope' : 'countries and scopes'}. `
    + `Most recently verified <time datetime="${escapeHtml(lastVerifiedAt || '')}">`
    + `${escapeHtml(lastVerifiedAt || 'not yet')}</time>.</p>`;

  // Two independent rankings, never blended. `default` is the editorial score;
  // `domain-rating` is the third-party authority snapshot. Each is truncated to
  // HUB_TOP_COUNT and titled from what the dataset actually holds.
  const bestEntries = sortDirectories(allDirectories, 'default').slice(0, HUB_TOP_COUNT);
  const bestColumns = c.tableColumnsFor(bestEntries);
  const measured = allDirectories.filter((d) => d.domainRating !== null && d.domainRating !== undefined);
  const authorityEntries = sortDirectories(measured, 'domain-rating').slice(0, HUB_TOP_COUNT);
  const authorityColumns = c.tableColumnsFor(authorityEntries);

  const globalBody = globalEntries.length ? [
    `      <p>${escapeHtml(`${globalEntries.length} directories are global in scope: they accept `
      + 'businesses regardless of country. They are listed separately because a scope is not a place.')}</p>`,
    c.directoryTable({
      directories: globalEntries.slice(0, HUB_TOP_COUNT),
      caption: 'Global directories',
      columns: c.tableColumnsFor(globalEntries.slice(0, HUB_TOP_COUNT)),
    }),
    `      <p class="bd-cta"><a href="${routes.countryPath(GLOBAL_SCOPE)}">`
      + `See all ${escapeHtml(String(globalEntries.length))} global directories</a></p>`,
  ].join('\n') : '';

  pages.push({
    kind: 'hub',
    owner: 'hub',
    outPath: routes.hubOut(),
    meta: hubMeta,
    main: [
      c.pageIntro({ title: 'Business Directories', lede: hubMeta.description }),
      // The worklist was an orphan: generated, sitemapped, and linked from
      // nowhere. This hero is the primary entry point, placed above the
      // editorial tables because it is what most readers actually want.
      ...(worklist.length ? [`    <section class="bd-section bd-hero" aria-labelledby="worklist-hero">
      <p class="bd-eyebrow">Business visibility database</p>
      <h2 id="worklist-hero">${escapeHtml(`${worklist.length} business listing opportunities`)}</h2>
      <p>${escapeHtml('Reputable directories, review platforms, supplier databases, software '
        + 'marketplaces and local-discovery services where a business can create, claim or apply '
        + 'for a public presence.')}</p>
      <p class="bd-actions">
        <a class="bd-button" href="${OPPORTUNITIES_PATH}">${escapeHtml(`Browse all ${worklist.length} opportunities`)}</a>
        <a class="bd-button bd-button--ghost" href="${routes.BASE}opportunities.csv" download>Download CSV</a>
      </p>
      <ul class="bd-list bd-stats">
        <li>${escapeHtml(`${worklist.length} active opportunities`)}</li>
        <li>${escapeHtml(`${worklistMarkets} markets`)}</li>
        <li>${escapeHtml(`${worklistEditorial} detailed platform guides`)}</li>
        <li>${escapeHtml(`${worklistRows} compact working-list entries`)}</li>
      </ul>
    </section>`,
      section('two-levels', 'Two levels of directory intelligence', [
        '      <div class="bd-cards">',
        `        <div class="bd-card"><h3>Detailed platform guides</h3>`,
        `          <p>${escapeHtml('In-depth researched pages covering platform workflows, advantages, '
          + 'limitations and verified listing details.')}</p>`,
        `          <p class="bd-count">${escapeHtml(`${worklistEditorial} guides`)}</p>`,
        `          <p><a href="${routes.BASE}">Browse detailed guides</a></p></div>`,
        `        <div class="bd-card"><h3>Operational opportunities</h3>`,
        `          <p>${escapeHtml('A larger working list of reputable platforms for employees and '
          + 'business owners to review, prioritise and submit to. Some details are still unverified '
          + 'and a few entries need a browser check before submitting.')}</p>`,
        `          <p class="bd-count">${escapeHtml(`${worklist.length} opportunities`)}</p>`,
        `          <p><a href="${OPPORTUNITIES_PATH}">Open the complete working list</a></p></div>`,
        '      </div>',
      ].join('\n'))] : []),
      statLine,
      // A. Authority — the domain, measured by a third party.
      ...(authorityEntries.length ? [section('highest-authority', 'Highest authority business directories', [
        `      <p>${escapeHtml(`Ranked by Domain Rating, a dated Ahrefs snapshot of the measured `
          + `domain's authority. ${measured.length} of ${allDirectories.length} records carry a `
          + 'measurement. A high Domain Rating describes the domain; it does not guarantee that a '
          + 'listing there is valuable, indexed, followed, or that a profile page inherits the '
          + "domain's authority.")}</p>`,
        c.directoryTable({
          directories: authorityEntries,
          caption: 'Highest authority business directories in the verified dataset',
          columns: authorityColumns,
          sortKey: 'domain-rating',
        }),
      ].join('\n'))] : []),
      // B. Value — the directory, assessed editorially.
      section('best-directories', 'Best business directories', [
        `      <p>${escapeHtml('Ranked by PetroHrys Score, a first-party editorial assessment of how '
          + 'useful, trustworthy and relevant a directory is for businesses. It is not a Domain '
          + 'Rating, an SEO or authority metric, or a review rating.')} `
          + `<a href="${routes.articlePath('how-petrohrys-score-works')}">How the score is produced</a>.</p>`,
        c.directoryTable({
          directories: bestEntries,
          caption: 'Best business directories in the verified dataset',
          columns: bestColumns,
        }),
        c.metricNote(activeMetrics),
      ].join('\n')),
      ...(globalBody ? [section('global', 'Global directories', globalBody)] : []),
      ...(supranationalLinks.length ? [section('supranational', 'Supranational registries', [
        `      <p>${escapeHtml('These registries are operated above the level of any single '
          + 'state, so they are listed apart from the national grid. A supranational system '
          + 'often provides access to records that national authorities hold and constitute.')}</p>`,
        c.cardGrid(supranationalLinks.map((l) => c.countryCard({ ...l, headingLevel: 3 })),
          { label: 'Supranational registries' }),
      ].join('\n'))] : []),
      section('countries', 'Directories by country',
        c.cardGrid(publishedCountries.map((l) => c.countryCard({ ...l, headingLevel: 3 })),
          { label: 'Directories by country' })),
      section('guides', 'Editorial guides',
        `      <p>Guides drawn from this dataset explain how directories are chosen, scored and verified.</p>\n`
        + `      <p class="bd-cta"><a href="${routes.articlesPath()}">Browse the editorial guides</a></p>`),
      section('methodology', 'Methodology', `${c.methodologyNote()}\n${c.metricNote(activeMetrics)}`),
      section('faq', 'Questions', c.faqSection(HUB_FAQS)),
    ].join('\n\n'),
  });

  // --- editorial guides ----------------------------------------------------
  const articles = buildArticles(registry);
  const articleLinks = articles.map((a) => ({ title: a.title, slug: a.slug }));

  pages.push({
    kind: 'article-index',
    owner: 'articles',
    outPath: routes.articlesOut(),
    meta: seo.buildArticleIndexMeta({ articles: articleLinks }),
    main: [
      c.pageIntro({
        title: 'Business Directory Guides',
        lede: 'Editorial guides drawn from the verified directory dataset. Every list and table is generated from those records at build time.',
      }),
      section('guides', 'Guides', c.cardGrid(articles.map((a) => c.categoryCard({
        name: a.title, path: routes.articlePath(a.slug), description: a.description, headingLevel: 3,
      })), { label: 'Guides' })),
    ].join('\n\n'),
  });

  // --- the employee working list -------------------------------------------
  // ONE page for every actionable opportunity, rather than a detail page per
  // row or a country page per geography. Countries that have no dedicated page
  // of their own surface here under "Other countries", which is why sixteen new
  // geographies could be added without generating a single thin page.
  const opRows = registry.operationalRows || [];
  if (csv.actionableOpportunities(allDirectories, opRows).length > 0) {
    // Decorate once with the computed intelligence view. The score is never
    // stored, so every consumer on this page derives it from the same call
    // rather than from a value someone wrote down.
    const actionable = csv.actionableOpportunities(allDirectories, opRows).map((r) => {
      const score = INTEL.directoryScore(r);
      const intel = r.intelligence || {};
      return {
        ...r,
        directoryScore: score.overall,
        scoreBand: INTEL.band(score.overall),
        approvalMode: intel.approvalMode || null,
        countryReach: intel.countryReach || null,
      };
    });
    // countryLinks previously carried no slug, so this Set was {undefined} and
    // NOTHING ever matched — every row was repeated in "Other countries",
    // doubling the page. Global is a published destination too and must be
    // excluded from "other" alongside the national pages.
    const publishedCountrySlugs = new Set([
      ...publishedCountries.map((c) => c.slug),
      ...(globalEntries.length ? [GLOBAL_SCOPE] : []),
    ]);
    const other = actionable.filter((d) => !publishedCountrySlugs.has(d.country));
    const OPP_COLUMNS = ['name', 'country', 'category', 'submissionModel', 'listingAction',
      'tier', 'domainRating'];
    // Every number on the page is derived. A hardcoded total would drift the
    // moment a row is added, and the page would then state something untrue.
    const editorialCount = actionable.filter((d) => !d.isOperationalRow).length;
    const rowCount = actionable.filter((d) => d.isOperationalRow).length;
    const countryCount = new Set(actionable.map((d) => d.country)).size;
    const FACETS = [
      { name: 'country', key: 'country', label: 'Market' },
      { name: 'category', key: 'category', label: 'Platform type' },
      { name: 'priority', key: 'priority', label: 'Priority', fallback: 'unassessed',
        order: ['P1', 'P2', 'P3', 'hold'],
        labels: { P1: 'P1 — do first', P2: 'P2 — valuable', P3: 'P3 — optional', hold: 'Hold', unassessed: 'Not assessed' } },
      { name: 'cost', key: 'submissionModel', label: 'Cost', fallback: 'unknown',
        order: ['free', 'freemium', 'paid', 'unknown'],
        labels: { free: 'Free', freemium: 'Freemium', paid: 'Paid', unknown: 'Unknown' } },
      { name: 'action', key: 'listingAction', label: 'Listing action', fallback: 'unknown',
        order: ['create', 'claim', 'create-and-claim', 'apply', 'invite-only', 'unknown'],
        labels: { create: 'Create', claim: 'Claim', 'create-and-claim': 'Create or claim', apply: 'Apply', 'invite-only': 'Invite only', unknown: 'Unknown' } },
      { name: 'tier', key: 'tier', label: 'Reputation',
        order: ['tier1', 'tier2', 'tier3'],
        labels: { tier1: 'Tier A — exceptional', tier2: 'Tier B — established', tier3: 'Tier C — niche' } },
      { name: 'status', key: 'currentStatus', label: 'Status', fallback: 'unknown',
        order: ['active', 'unknown'],
        labels: { active: 'Active', unknown: 'Needs browser check' } },
      // Directory Intelligence v2 filters. Every value is computed from facts
      // already on the record; a platform with too little evidence to score
      // shows as "Not yet scored" rather than being hidden or guessed at.
      { name: 'score', key: 'scoreBand', label: 'Directory Score', fallback: 'unscored',
        order: ['strong', 'good', 'moderate', 'limited', 'unscored'],
        labels: { ...INTEL.BAND_LABELS, unscored: 'Not yet scored' } },
      { name: 'approval', key: 'approvalMode', label: 'Approval', fallback: 'unknown',
        order: ['instant', 'mixed', 'manual', 'unknown'],
        labels: { instant: 'Instant', mixed: 'Mixed', manual: 'Manual review', unknown: 'Unknown' } },
      { name: 'reach', key: 'countryReach', label: 'Country reach', fallback: 'unknown',
        order: ['global', 'regional', 'single', 'unknown'],
        labels: { global: 'Global', regional: 'Regional', single: 'Single country', unknown: 'Unknown' } },
    ];

    pages.push({
      kind: 'opportunities',
      owner: 'opportunities',
      outPath: path.join(SECTION_DIR, 'opportunities', 'index.html'),
      meta: seo.buildOpportunitiesMeta(),
      main: [
        c.pageIntro({
          title: `${actionable.length} Business Listing Opportunities`,
          lede: 'Find reputable websites where companies, products and professional services can '
            + 'build visibility through public profiles, directories, reviews, marketplaces and '
            + 'supplier listings. Every row is a researched platform; nothing here is a ranking.',
        }),
        section('worklist', 'Working list', [
          `      <p>${escapeHtml(`${actionable.length} platforms across ${countryCount} markets. `
            + `${editorialCount} carry a detailed guide; ${rowCount} are compact entries for `
            + 'operational review. Records that are shutting down, dormant, redirected into a '
            + 'successor, or assessed as not worth using are excluded from this list and from the '
            + 'export. A blank cell means the fact was researched and not established — it never '
            + 'means no, and some entries still need a browser check before submitting.')}</p>`,
          '      <div class="bd-controls">',
          c.searchControls({ idPrefix: 'opp' }).replace(' hidden>', '>'),
          ...FACETS.map((f) => c.facetSelect({
            idPrefix: 'opp', facet: f, label: f.label, rows: actionable,
            labels: f.labels || {}, order: f.order || [],
          })),
          c.clearFiltersControl(),
          '      </div>',
          `      <p class="bd-note"><a class="bd-button" href="/research/business-directories/opportunities.csv" download>`
            + `Download all ${actionable.length} opportunities as CSV</a> `
            + `${escapeHtml('Designed for Excel, Google Sheets and internal submission workflows.')}</p>`,
          c.directoryTable({
            directories: actionable,
            caption: 'Business listing opportunities',
            columns: OPP_COLUMNS,
            sortKey: null,
          }),
          `      <p class="bd-note"><a href="${escapeHtml(SCHEMA.AHREFS_ATTRIBUTION.href)}" `
            + `rel="noopener noreferrer" target="_blank">${escapeHtml(SCHEMA.AHREFS_ATTRIBUTION.text)}</a>. `
            + `${escapeHtml('A Domain Rating describes the domain, not the value of a listing on it. Most rows are not measured.')}</p>`,
        ].join('\n')),
        ...(other.length ? [section('other-countries', 'Other countries', [
          `      <p>${escapeHtml(`${other.length} of these platforms are based in countries that do `
            + 'not yet have a page of their own here. They are listed together rather than split '
            + 'into single-record country pages. A country gets its own page once it has enough '
            + 'researched platforms to make one worth reading.')}</p>`,
          c.directoryTable({
            directories: other,
            caption: 'Platforms from other countries',
            columns: OPP_COLUMNS.filter((col) => col !== 'domainRating'
              || other.some((d) => d.domainRating !== null && d.domainRating !== undefined)),
            sortKey: null,
          }),
        ].join('\n'))] : []),
      ].join('\n\n'),
    });
  }

  for (const article of articles) {
    pages.push({
      kind: 'article',
      owner: `article:${article.slug}`,
      outPath: routes.articleOut(article.slug),
      meta: seo.buildArticleMeta({ article, faqs: article.faqs || [] }),
      main: [
        c.pageIntro({ title: article.title, lede: article.description }),
        article.main,
      ].join('\n\n'),
    });
  }

  for (const country of registry.countries) {
    if (!countryEmitted(registry, country)) continue;

    const countryPath = routes.countryPath(country.slug);
    const countryEntries = sortDirectories(directoriesFor(registry, country.slug));
    // Only categories that actually hold a verified record here. A category with
    // nothing in it is not rendered at all — not as a card, not as "coming
    // soon", not as a zero. Ordered by coverage so the reader meets the
    // best-covered category first.
    const categoryLinks = registry.categories
      .filter((category) => categoryEmitted(registry, country, category))
      .map((category) => ({
        name: category.name,
        path: routes.categoryPath(country.slug, category.slug),
        description: category.description,
        count: directoriesFor(registry, country.slug, category.slug).length,
      }))
      .sort((a, b) => (b.count - a.count) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const countryColumns = c.tableColumnsFor(countryEntries);
    const faqs = countryFaqs(country, countryEntries.length);
    const meta = seo.buildCountryMeta({
      country,
      categories: categoryLinks.filter((l) => !l.pending),
      directories: countryEntries,
      faqs,
    });

    pages.push({
      kind: 'country',
      owner: `country:${country.slug}`,
      outPath: routes.countryOut(country.slug),
      meta,
      main: [
        c.pageIntro({ title: meta.title, lede: meta.description }),
        // Inbound link to the worklist, so the page is reachable from every
        // market rather than only from the hub.
        ...(worklist.length ? [`    <p class="bd-note"><a href="${OPPORTUNITIES_PATH}">`
          + escapeHtml(`See all ${worklist.length} business listing opportunities across `
            + `${worklistMarkets} markets`) + '</a></p>'] : []),
        // A supranational entry is a scope, not a place, and a reader arriving
        // from a country grid has no way to know that. The label says so in the
        // reader's words: it renders the human scope label, never the stored
        // entityType, and it sits beside the heading rather than inside it so
        // the H1 stays the page's own name.
        ...(country.entityType === 'supranational' ? [
          `      <ul class="bd-badges" aria-label="Geographic scope">\n`
          + `        <li class="bd-badge">${escapeHtml(SCHEMA.SCOPE_LABELS[country.scope] || SCHEMA.SCOPE_LABELS.supranational)}</li>\n`
          + `      </ul>`,
        ] : []),
        `      <p class="bd-stat">${escapeHtml(`${countryEntries.length} verified `
          + `${countryEntries.length === 1 ? 'directory' : 'directories'} in `
          + `${categoryLinks.length} ${categoryLinks.length === 1 ? 'category' : 'categories'}.`)}</p>`,
        // A directory count is not a coverage claim. Where a jurisdiction
        // manifest exists for this country, say plainly how much of it is
        // actually covered, so 31 state registries never read as 50.
        c.coverageStatement(coverageManifests.get(country.slug),
          new Set(countryEntries.filter((d) => d.jurisdiction).map((d) => d.jurisdiction.code))),
        ...(categoryLinks.length ? [section('categories', 'Directory categories',
          c.cardGrid(categoryLinks.map((l) => c.categoryCard({ ...l, headingLevel: 3 })),
            { label: 'Directory categories' }))] : []),
        section('directories', 'All directories', [
          c.searchControls({ idPrefix: country.slug }),
          c.filterControls({ idPrefix: country.slug, directories: countryEntries }),
          c.sortControls({ idPrefix: country.slug, columns: countryColumns }),
          // A country with no subnational record renders exactly one table, as
          // it always has. Grouping appears only once the coverage exists, so
          // the United States does not carry an empty "States" heading before
          // any state registry is published.
          ...(jurisdictionSections(country, countryEntries, countryColumns)
            || [c.directoryTable({
              directories: countryEntries,
              caption: `Directories in ${country.name}`,
              columns: countryColumns,
            })]),
          c.metricNote(activeMetrics),
        ].join('\n')),
        section('faq', 'Questions', c.faqSection(faqs)),
      ].join('\n\n'),
    });

    for (const category of registry.categories) {
      if (!categoryEmitted(registry, country, category)) continue;

      const entries = sortDirectories(directoriesFor(registry, country.slug, category.slug));
      const catMeta = seo.buildCategoryMeta({ country, category, directories: entries });

      pages.push({
        kind: 'category',
        owner: `category:${country.slug}:${category.slug}`,
        outPath: routes.categoryOut(country.slug, category.slug),
        meta: catMeta,
        main: [
          c.pageIntro({ title: catMeta.title, lede: category.description }),
          ...(worklist.length ? [`    <p class="bd-note"><a href="${OPPORTUNITIES_PATH}">`
            + escapeHtml(`See all ${worklist.length} business listing opportunities`) + '</a></p>'] : []),
          section('directories', 'Directories', [
            c.searchControls({ idPrefix: `${country.slug}-${category.slug}` }),
            c.filterControls({ idPrefix: `${country.slug}-${category.slug}`, directories: entries }),
            c.sortControls({ idPrefix: `${country.slug}-${category.slug}`, columns: c.tableColumnsFor(entries) }),
            c.directoryTable({
              directories: entries,
              caption: `${category.name} directories in ${country.name}`,
              columns: c.tableColumnsFor(entries),
            }),
            c.metricNote(activeMetrics),
          ].join('\n')),
        ].join('\n\n'),
      });
    }

    for (const directory of countryEntries) {
      const category = registry.categories.find((cat) => cat.slug === directory.category);
      const { indexable, missing } = SCHEMA.indexability(directory);
      // A record that fails the meaningful-content contract is a Level 1
      // operational row: it belongs in the working list, the CSV and every
      // filter, but it has nothing substantive to put on a page of its own.
      // Generating one would be exactly the thin page the SEO policy forbids.
      // Build the route for every record, thin or not: routes.directoryOut is
      // what refuses a hostile slug, and skipping it for compact rows would
      // retire that check without anyone noticing.
      const outPath = routes.directoryOut(country.slug, directory.slug);
      if (!indexable) {
        noindexReport.push({ id: directory.id, missing });
        continue;
      }
      const dirMeta = seo.buildDirectoryMeta({ country, category, directory, indexable });

      const guides = guidesFor(articles, directory);
      const guideLinks = guides.length ? [
        `      <ul class="bd-list">\n${guides.map((g) =>
          `        <li><a href="${routes.articlePath(g.slug)}">${escapeHtml(g.title)}</a></li>`).join('\n')}\n      </ul>`,
      ].join('\n') : '      <p class="bd-empty">No guide covers this directory yet.</p>';

      // Where this record sits, in words rather than slugs, so the reader can
      // climb back out without using the breadcrumb.
      const context = `      <ul class="bd-list">
        <li><a href="${routes.countryPath(country.slug)}">All directories in ${escapeHtml(country.name)}</a></li>
${category ? `        <li><a href="${routes.categoryPath(country.slug, category.slug)}">${escapeHtml(category.name)} directories in ${escapeHtml(country.name)}</a></li>\n` : ''}        <li><a href="${routes.hubPath()}">Business Directories index</a></li>
      </ul>`;

      pages.push({
        kind: 'directory',
        owner: `directory:${directory.id}`,
        outPath: routes.directoryOut(country.slug, directory.slug),
        lastmod: directory.lastVerified || undefined,
        meta: dirMeta,
        // Order follows what a reader came for: what it is, how to reach it,
        // what we think of it and why, then the evidence, then everything else.
        // Nothing populated sits below a block that is mostly empty.
        main: [
          c.pageIntro({ title: displayName(directory), lede: directory.description }),
          c.externalLinkCta({ url: directory.website, name: displayName(directory) }),
          c.statusBadges(directory),
          section('score', 'PetroHrys Score', `${c.metricsBlock(directory, activeMetrics)}\n${c.metricNote(activeMetrics)}`),
          section('verification', 'Verification', c.verificationBlock(directory)),
          // Conditional: renders nothing at all for a record that carries none
          // of the structured registry fields, so pre-Wave-1 pages are unchanged.
          ...(c.listingInformation(directory)
            ? [section('listing-information', 'Listing', c.listingInformation(directory))]
            : []),
          ...(c.registryInformation(directory)
            ? [section('registry-information', 'Registry information', c.registryInformation(directory))]
            : []),
          section('assessment', 'Assessment', c.prosCons({ pros: directory.pros, cons: directory.cons, headingLevel: 3 })),
          section('guidance', 'Submission guidance',
            `${c.submissionLink(directory)}\n${c.editorialGuidance(directory, activeGuidance)}`),
          section('audiences', 'What this directory accepts', c.acceptsList(directory)),
          section('industries', 'Recommended industries', c.bestForTags(directory.recommendedIndustries)),
          section('breakdown', 'How the PetroHrys Score was reached', c.scoreBreakdown(directory)),
          section('related', 'Related directories', c.relatedDirectories(
            SCHEMA.RELATION_KINDS.map((kind) => ({
              label: SCHEMA.RELATION_LABELS[kind],
              items: (directory.related[kind] || [])
                .map((targetId) => registry.directories.find((d) => d.id === targetId))
                .filter(Boolean)
                .map((target) => ({ name: target.name, path: routes.directoryPathFor(target) })),
            })))),
          section('guides', 'Guides covering this directory', guideLinks),
          section('context', 'Where this sits', context),
        ].join('\n\n'),
      });
    }
  }

  return pages;
}

// --- staging ----------------------------------------------------------------

function toPubDate(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`).toUTCString();
}

// Renders every artefact into memory, then materialises it into a throwaway
// directory. Nothing in the site tree is touched by this phase.
function stageBuild(registry, pages) {
  const files = new Map();

  for (const page of pages) {
    files.set(page.outPath, renderPage({ meta: page.meta, main: page.main }));
  }

  const indexable = pages
    .filter((page) => page.meta.robots === undefined)
    .map((page) => ({ path: page.meta.canonicalPath, lastmod: page.lastmod }));
  files.set(SITEMAP_FILE, renderSitemap(indexable));

  // The feed announces PAGES, so it may only carry records that have one. A
  // Level 1 operational row has no detail page, and an item pointing at a page
  // that was never generated is a broken feed — which the pre-write validator
  // correctly refuses to publish.
  const feedItems = registry.directories
    .filter((d) => d.lastVerified && SCHEMA.indexability(d).indexable)
    .slice()
    .sort((a, b) => (a.lastVerified < b.lastVerified ? 1 : a.lastVerified > b.lastVerified ? -1 : 0))
    .map((d) => ({
      title: displayName(d),
      path: routes.directoryPathFor(d),
      description: d.description,
      pubDate: toPubDate(d.lastVerified),
    }));
  files.set(FEED_FILE, renderRss(feedItems));

  // Same no-empty-artefact rule as the opportunities page: a CSV containing
  // only a header row is not a working list, and it would survive a full data
  // removal as an orphan.
  const rows = registry.operationalRows || [];
  if (csv.actionableOpportunities(registry.directories, rows).length > 0) {
    files.set(CSV_FILE, renderCsv(registry.directories, rows));
  }

  return files;
}

// --- pre-write validation ---------------------------------------------------

function assertContained(relPath) {
  const normalised = path.normalize(relPath);
  if (path.isAbsolute(normalised) || normalised.split(path.sep).includes('..')) {
    throw new BuildError(`Refusing to write outside the site root: ${relPath}`);
  }
  const inSection = normalised === SITEMAP_FILE
    || normalised.startsWith(SECTION_DIR + path.sep);
  if (!inSection) {
    throw new BuildError(
      `Generated path is outside the section: ${relPath}. `
      + `Only ${SECTION_DIR}/** and ${SITEMAP_FILE} may be written.`);
  }
}

function validateStage(files, pages) {
  const errors = [];

  for (const relPath of files.keys()) assertContained(relPath);

  const byPath = new Map();
  const byCanonical = new Map();
  for (const page of pages) {
    if (byPath.has(page.outPath)) {
      errors.push(`Duplicate output path ${page.outPath} claimed by `
        + `"${byPath.get(page.outPath)}" and "${page.owner}".`);
    }
    byPath.set(page.outPath, page.owner);

    const canonical = page.meta.canonical;
    if (byCanonical.has(canonical)) {
      errors.push(`Duplicate canonical ${canonical} on ${byCanonical.get(canonical)} and ${page.outPath}.`);
    }
    byCanonical.set(canonical, page.outPath);
  }

  const owners = new Set();
  for (const page of pages) {
    if (owners.has(page.owner)) errors.push(`Duplicate owner key "${page.owner}".`);
    owners.add(page.owner);
  }

  // The sitemap may only reference pages that were actually staged.
  const staged = new Set(pages.map((page) => page.meta.canonical));
  const sitemap = files.get(SITEMAP_FILE) || '';
  for (const match of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    if (!staged.has(match[1])) {
      errors.push(`Sitemap references a URL that was not generated: ${match[1]}`);
    }
  }

  // RSS may only reference generated directory pages.
  const feed = files.get(FEED_FILE) || '';
  for (const match of feed.matchAll(/<link>([^<]+)<\/link>/g)) {
    const url = match[1];
    if (url === `${seo.ORIGIN}${BASE}`) continue;
    if (!staged.has(url)) errors.push(`RSS references a URL that was not generated: ${url}`);
  }

  const noindex = new Set(pages.filter((p) => p.meta.robots).map((p) => p.meta.canonical));
  for (const match of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    if (noindex.has(match[1])) errors.push(`Sitemap lists a noindex page: ${match[1]}`);
  }

  return errors;
}

// --- manifest ---------------------------------------------------------------

function readManifest(outRoot) {
  const file = path.join(outRoot, MANIFEST_FILE);
  if (!fs.existsSync(file)) return { files: {} };
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (cause) {
    throw new BuildError(`Corrupt build manifest ${file}: ${cause.message}`);
  }
}

function buildManifest(files, pages) {
  const owners = { [SITEMAP_FILE]: 'sitemap', [FEED_FILE]: 'feed', [CSV_FILE]: 'csv' };
  for (const page of pages) owners[page.outPath] = page.owner;
  const sorted = {};
  for (const key of [...files.keys()].sort()) sorted[key] = owners[key];
  return { version: 1, files: sorted };
}

// --- commit -----------------------------------------------------------------

// Runs only after staging and validation both succeed. Writes only files whose
// contents changed, and deletes only files this generator previously created.
function commit(files, manifest, previous, outRoot) {
  const written = [];
  const removed = [];

  const previousFiles = new Set(Object.keys(previous.files || {}));

  for (const [relPath, contents] of files) {
    const target = path.join(outRoot, relPath);
    if (fs.existsSync(target) && !previousFiles.has(relPath)) {
      throw new BuildError(
        `Refusing to overwrite ${relPath}: it exists but was not created by this `
        + 'generator. Remove it by hand or add it to the manifest first.');
    }
    if (writeIfChanged(target, contents)) written.push(relPath);
  }

  for (const relPath of previousFiles) {
    if (files.has(relPath)) continue;
    const target = path.join(outRoot, relPath);
    if (!fs.existsSync(target)) continue;
    assertContained(relPath);
    fs.unlinkSync(target);
    removed.push(relPath);
  }

  pruneEmptyDirs(path.join(outRoot, SECTION_DIR));
  writeIfChanged(path.join(outRoot, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);

  return { written: written.sort(), removed: removed.sort() };
}

function pruneEmptyDirs(root) {
  if (!fs.existsSync(root)) return;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory()) pruneEmptyDirs(path.join(root, entry.name));
  }
  if (fs.readdirSync(root).length === 0) fs.rmdirSync(root);
}

// --- orchestration ----------------------------------------------------------

function buildAll(options = {}) {
  const dataRoot = options.dataRoot || PATHS.dataRoot;
  const outRoot = options.outRoot || PATHS.siteRoot;

  // 1. Load. A structural fault throws before anything else happens.
  const registry = loadRegistry(dataRoot);
  // Level 1 operational rows. Validated on load and kept separate from the
  // registry: they feed the working list and the CSV, never a detail page.
  const operationalRows = opportunities.loadOpportunities(
    dataRoot,
    new Set(registry.countries.map((c) => c.slug)),
    new Set(registry.categories.map((c) => c.slug)),
  );
  registry.operationalRows = operationalRows;

  // 2. Validate. The single build gate — nothing is rendered, staged or
  //    written unless the registry is clean.
  const validation = validateRegistry(registry);
  if (!validation.ok) {
    throw new BuildError(`Registry is invalid; refusing to build.\n${formatReport(validation)}`);
  }

  // 3. Model and 4. stage, entirely in memory.
  const pages = pageModel(registry);
  const files = stageBuild(registry, pages);

  // 5. Validate the staged output before any disk write.
  const stageErrors = validateStage(files, pages);
  if (stageErrors.length) {
    throw new BuildError(`Staged output failed validation; nothing written.\n  ${stageErrors.join('\n  ')}`);
  }

  // 6. Materialise into a throwaway directory so the full tree exists and can
  //    be inspected before the site is touched at all.
  const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bd-stage-'));
  try {
    for (const [relPath, contents] of files) {
      const target = path.join(stageDir, relPath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, contents, 'utf8');
    }
    for (const [relPath, contents] of files) {
      const roundTrip = fs.readFileSync(path.join(stageDir, relPath), 'utf8');
      if (roundTrip !== contents) {
        throw new BuildError(`Staged file did not round-trip: ${relPath}`);
      }
    }

    if (options.dryRun) {
      return { written: [], removed: [], pages: pages.length, staged: files.size, stageDir };
    }

    // 7. Reconcile into the site tree.
    const previous = readManifest(outRoot);
    const manifest = buildManifest(files, pages);
    const result = commit(files, manifest, previous, outRoot);
    return { ...result, pages: pages.length, staged: files.size };
  } finally {
    fs.rmSync(stageDir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  const result = buildAll({ dryRun });
  if (dryRun) {
    console.log(`Dry run: ${result.pages} page(s), ${result.staged} file(s) staged and validated. Nothing written.`);
  } else {
    console.log(`Generated ${result.pages} page(s); `
      + `${result.written.length} written, ${result.removed.length} pruned.`);
  }
}

module.exports = {
  buildAll, pageModel, stageBuild, validateStage, buildManifest,
  BuildError, REFERENCE_COUNTRY, REFERENCE_CATEGORY, MANIFEST_FILE, SECTION_DIR,
};
