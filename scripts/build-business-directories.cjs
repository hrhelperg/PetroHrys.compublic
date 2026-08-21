// scripts/build-business-directories.cjs
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PATHS, writeIfChanged, escapeHtml } = require('./lib/bd-util.cjs');
const { loadRegistry, directoriesFor } = require('./lib/bd-registry.cjs');
const { sortDirectories } = require('./lib/bd-sort.cjs');
const seo = require('./lib/bd-seo.cjs');
// Bound per locale inside pageModel(), not once at module load. The body of a
// page used to be built exactly once and then poured into four different
// shells, which is precisely why all four locales shipped the same English
// body under a correctly translated header.
const componentsModule = require('./lib/bd-components.cjs');
const { renderPage } = require('./lib/bd-render.cjs');
const I18N = require('./lib/i18n.cjs');
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
const RECOMMEND = require('./lib/bd-recommend.cjs');
// Readiness is read from the Distribution Planner, never recomputed here. See
// directoryReadiness() below for why this generator asks instead of answering.
const PLANNER = require('./lib/distribution-planner.cjs');
const DP = require('./lib/dp-engine.cjs');
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

// Built per locale rather than frozen at module load: a module-level constant
// is evaluated once, in whatever locale happened to be first, and would ship
// that language to all four.
const hubFaqs = (t) => [
  { q: t('bdx.faqQ.section'), a: t('bdx.indexDesc') },
  { q: t('bdx.faqQ.score'), a: t('bdx.faqFirstParty') },
  { q: t('bdx.faqQ.thirdParty'), a: t('bdx.faqThirdParty') },
  { q: t('bdx.faqQ.empty'), a: t('bdx.faqVerification') },
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

function jurisdictionSections(country, entries, columns, c) {
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

// Singular and plural are separate keys rather than an English "(s)" or a
// ternary on the English word: German, Spanish and French inflect the noun and
// the verb differently, so the sentence has to be written once per form.
function countryFaqs(country, count, t) {
  return [
    { q: t('bdx.faqQ.whichListed', { country: country.titleName }),
      a: count === 0
        ? t('bdx.faqA.noneYet', { country: country.titleName })
        : t(count === 1 ? 'bdx.faqA.countOne' : 'bdx.faqA.countMany',
          { count, country: country.titleName }) },
    { q: t('bdx.faqQ.paidPlacements'), a: t('bdx.faqNotSold') },
  ];
}


function section(id, heading, body) {
  return `    <section class="bd-section" aria-labelledby="${id}">
      <h2 id="${id}">${heading}</h2>
${body}
    </section>`;
}

// --- readiness --------------------------------------------------------------
//
// "Can an employee act on this platform today?" already has exactly one owner:
// dp-engine's actionability(), which the Distribution Planner publishes on its
// own page and in its own export. Deriving a second answer here from the same
// records would drift apart from that one the first time either rule changed,
// and the worklist would then disagree with the planner about the same platform
// on the same morning. So this asks, and stores nothing: the status is a view
// of canonical facts, not a new fact about the record.
//
// The projection is loaded ONCE per process. pageModel runs four times, once
// per locale, and a status is a machine value identical in all four — loading
// all three collections again per locale would quadruple the build's reading to
// rebuild the same map.
let readinessCache = null;
function directoryReadiness() {
  if (readinessCache) return readinessCache;
  const ops = PLANNER.project(PLANNER.loadAll());
  const map = new Map();
  for (const op of ops) {
    // Directories only. The projection spans three collections, and a
    // marketplace or media id must never answer for a directory.
    if (op.sourceCollection !== 'directories') continue;
    map.set(op.platformId, DP.actionability(op).status);
  }
  readinessCache = map;
  return map;
}

// One more facet attribute on rows bd-components already renders.
//
// That module owns the row markup and emits a fixed set of facet attributes,
// every one of them read from a field the directory record itself carries.
// Readiness is not such a field: it is computed by another module from a
// projection of the record, so handing it to the renderer through the schema
// would mean inventing a stored fact that nothing owns and that no validator
// could check.
//
// So the rendered rows are labelled instead, in the order the table rendered
// them — the worklist passes `sortKey: null`, which is directoryTable's explicit
// contract to render the array exactly as given. The count guard is the point
// of the function: if the table ever emits a different number of rows than the
// array it was handed, the build stops here rather than shifting every status
// by one row, so the page's one-identity-one-row invariant is checked once more
// on the way out.
const ROW_OPEN = '<tr class="bd-row" ';
function withRowFacet(tableHtml, rows, name, valueOf) {
  const parts = tableHtml.split(ROW_OPEN);
  if (parts.length - 1 !== rows.length) {
    throw new BuildError(`The worklist table rendered ${parts.length - 1} row(s) for `
      + `${rows.length} opportunities; refusing to label them.`);
  }
  return parts
    .map((part, i) => (i === 0 ? part
      : `${ROW_OPEN}data-bd-facet-${name}="${escapeHtml(String(valueOf(rows[i - 1]) || ''))}" ${part}`))
    .join('');
}

// --- page model -------------------------------------------------------------
// Every page declares an `owner`: the single registry fact responsible for it.
// Pruning and ownership checks rely on this being one-to-one.

function pageModel(registry, locale = I18N.DEFAULT_LOCALE) {
  // One implementation, four bindings. `c` is this locale's component set; the
  // registry it renders is the same 1,563 canonical records for every locale.
  const c = componentsModule.components(locale);
  const t = I18N.translator(locale);
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
    faqs: hubFaqs(t),
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
      caption: t('bdx.globalDirectories'),
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
      c.pageIntro({ title: t('collection.directories'), lede: hubMeta.description }),
      // The worklist was an orphan: generated, sitemapped, and linked from
      // nowhere. This hero is the primary entry point, placed above the
      // editorial tables because it is what most readers actually want.
      ...(worklist.length ? [`    <section class="bd-section bd-hero" aria-labelledby="worklist-hero">
      <p class="bd-eyebrow">${t('bdx.visibilityDb')}</p>
      <h2 id="worklist-hero">${escapeHtml(`${worklist.length} business listing opportunities`)}</h2>
      <p>${escapeHtml(t('bdx.hubLede'))}</p>
      <p class="bd-actions">
        <a class="bd-button" href="${OPPORTUNITIES_PATH}">${escapeHtml(`Browse all ${worklist.length} opportunities`)}</a>
        <a class="bd-button bd-button--ghost" href="${routes.BASE}opportunities.csv" download>${t('bdx.downloadCsv')}</a>
      </p>
      <ul class="bd-list bd-stats">
        <li>${escapeHtml(`${worklist.length} active opportunities`)}</li>
        <li>${escapeHtml(`${worklistMarkets} markets`)}</li>
        <li>${escapeHtml(`${worklistEditorial} detailed platform guides`)}</li>
        <li>${escapeHtml(`${worklistRows} compact working-list entries`)}</li>
      </ul>
    </section>`,
      section('two-levels', t('bdx.twoLevels'), [
        '      <div class="bd-cards">',
        `        <div class="bd-card"><h3>${t('bdx.detailedGuides')}</h3>`,
        `          <p>${escapeHtml(t('bdx.detailedDesc'))}</p>`,
        `          <p class="bd-count">${escapeHtml(`${worklistEditorial} guides`)}</p>`,
        `          <p><a href="${routes.BASE}">${t('bdx.browseGuides')}</a></p></div>`,
        `        <div class="bd-card"><h3>${t('bdx.operationalOpps')}</h3>`,
        `          <p>${escapeHtml(t('bdx.workingListDesc'))}</p>`,
        `          <p class="bd-count">${escapeHtml(`${worklist.length} opportunities`)}</p>`,
        `          <p><a href="${OPPORTUNITIES_PATH}">${t('bdx.openWorkingList')}</a></p></div>`,
        '      </div>',
      ].join('\n'))] : []),
      statLine,
      // A. Authority — the domain, measured by a third party.
      ...(authorityEntries.length ? [section('highest-authority', t('bdx.highestAuthority'), [
        `      <p>${escapeHtml(`Ranked by Domain Rating, a dated Ahrefs snapshot of the measured `
          + `domain's authority. ${measured.length} of ${allDirectories.length} records carry a `
          + 'measurement. A high Domain Rating describes the domain; it does not guarantee that a '
          + 'listing there is valuable, indexed, followed, or that a profile page inherits the '
          + "domain's authority.")}</p>`,
        c.directoryTable({
          directories: authorityEntries,
          caption: t('bdx.highestAuthorityIn'),
          columns: authorityColumns,
          sortKey: 'domain-rating',
        }),
      ].join('\n'))] : []),
      // B. Value — the directory, assessed editorially.
      section('best-directories', t('bdx.bestDirectories'), [
        `      <p>${escapeHtml(t('bdx.rankedByScore'))} `
          + `<a href="${routes.articlePath('how-petrohrys-score-works')}">${t('bdx.howScoreProduced')}</a>.</p>`,
        c.directoryTable({
          directories: bestEntries,
          caption: t('bdx.bestDirectoriesIn'),
          columns: bestColumns,
        }),
        c.metricNote(activeMetrics),
      ].join('\n')),
      ...(globalBody ? [section('global', t('bdx.globalDirectories'), globalBody)] : []),
      ...(supranationalLinks.length ? [section('supranational', t('bdx.supranational'), [
        `      <p>${escapeHtml(t('bdx.supranationalDesc'))}</p>`,
        c.cardGrid(supranationalLinks.map((l) => c.countryCard({ ...l, headingLevel: 3 })),
          { label: t('bdx.supranational') }),
      ].join('\n'))] : []),
      section('countries', t('bdx.byCountry'),
        c.cardGrid(publishedCountries.map((l) => c.countryCard({ ...l, headingLevel: 3 })),
          { label: t('bdx.byCountry') })),
      section('guides', t('bdx.editorialGuides'),
        `      <p>${t('bdx.guidesIntro')}</p>\n`
        + `      <p class="bd-cta"><a href="${routes.articlesPath()}">${t('bdx.browseEditorial')}</a></p>`),
      section('methodology', t('common.methodology'), `${c.methodologyNote()}\n${c.metricNote(activeMetrics)}`),
      section('faq', t('bdx.questions'), c.faqSection(hubFaqs(t))),
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
        title: t('bdx.guidesTitle'),
        lede: t('bdx.guidesDesc'),
      }),
      section('guides', t('bdx.guides'), c.cardGrid(articles.map((a) => c.categoryCard({
        name: a.title, path: routes.articlePath(a.slug), description: a.description, headingLevel: 3,
      })), { label: t('bdx.guides') })),
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
    const readiness = directoryReadiness();
    const actionable = csv.actionableOpportunities(allDirectories, opRows).map((r) => {
      const score = INTEL.directoryScore(r);
      const intel = r.intelligence || {};
      // Which business profiles this platform is actually a strong choice for.
      // Computed from the same engine the profile pages use, so the filter and
      // the pages can never disagree.
      const bestForProfiles = RECOMMEND.PROFILES
        .filter((p) => ['priority', 'recommended'].includes(RECOMMEND.recommend(r, p.key).level))
        .map((p) => p.key);
      return {
        ...r,
        directoryScore: score.overall,
        scoreBand: INTEL.band(score.overall),
        approvalMode: intel.approvalMode || null,
        countryReach: intel.countryReach || null,
        bestForProfiles,
        // The canonical Planner status for this platform, or '' where the
        // projection holds none — an empty value is offered by no option and
        // matched by no selection, which is what "not established" must do.
        actionability: readiness.get(r.id) || '',
      };
    });
    // ── ONE CANONICAL OPPORTUNITY, ONE INTERACTIVE ROW ─────────────────────
    //
    // countryLinks previously carried no slug, so this Set was {undefined} and
    // NOTHING ever matched — every row was repeated in "Other countries",
    // doubling the page. Global is a published destination too and must be
    // excluded from "other" alongside the national pages.
    //
    // Fixing the Set stopped the page doubling and left the real defect in
    // place: `other` was a strict SUBSET of `actionable`, and BOTH were rendered
    // by c.directoryTable, which emits the interactive contract every time —
    // `<tbody data-bd-rows>` around `<tr class="bd-row">`. js/business-directories.js
    // adopts EVERY such tbody on the page and treats every row in it as a
    // record, so 638 canonical opportunities were two records each. Measured in
    // Chrome before this change: 2,247 DOM rows over 1,609 opportunities, 638
    // duplicate identities, a status line reading "2,247 directories shown", an
    // export button offering 2,247 — and a real filtered CSV that, with the
    // country facet on India, wrote 104 data rows for 52 Indian platforms.
    //
    // So the second TABLE is gone and the NAVIGATION it existed for stays.
    // The section's own copy conceded what it was: "N of THESE platforms" is a
    // re-presentation of rows already above, not a set of new records. What a
    // reader actually needs from it is the list of COUNTRIES that have no page
    // of their own — which is a fact about this site's structure, not about the
    // work — so that is what it now renders: one card per country, each a link
    // that puts the page's own country facet on that value. The facet options
    // are built from all 1,609 rows, so every one of those countries is already
    // selectable; the cards simply make them findable without scrolling.
    //
    // ── WHY NOT THE OTHER TWO REPAIRS ──────────────────────────────────────
    //
    // Making the two partitions mutually exclusive would satisfy the invariant
    // and break the worklist. The client sorts WITHIN a tbody — see the
    // groups.forEach in js/business-directories.js — so splitting the rows by
    // "does this country have a page here" would fragment one global sort into
    // two along a criterion that has nothing to do with the work: under Domain
    // Rating the strongest platform in an unpaged country would sit below 967
    // weaker ones, and "1,609 platforms across N markets" would no longer
    // describe the table beneath it.
    //
    // Keeping a non-interactive copy of the table would be correct exactly
    // until someone touched a filter. Selecting France would narrow the worklist
    // and leave 638 unrelated rows standing underneath the result, which is a
    // worse failure than the one being fixed: it looks like state and isn't.
    const publishedCountrySlugs = new Set([
      ...publishedCountries.map((c) => c.slug),
      ...(globalEntries.length ? [GLOBAL_SCOPE] : []),
    ]);
    const countryNameBySlug = new Map(registry.countries.map((x) => [x.slug, x.name]));
    // Grouped from the SAME `actionable` array the table renders, so the counts
    // beside the country names and the rows a click reveals are one number.
    const otherCountryCounts = new Map();
    for (const d of actionable) {
      if (publishedCountrySlugs.has(d.country)) continue;
      otherCountryCounts.set(d.country, (otherCountryCounts.get(d.country) || 0) + 1);
    }
    const otherCountries = [...otherCountryCounts.entries()]
      .map(([slug, count]) => ({ slug, name: countryNameBySlug.get(slug) || slug, count }))
      // Most-covered first, then a stable name order — the same rule the hub's
      // country grid uses, so the two grids do not order the world differently.
      .sort((a, b) => (b.count - a.count) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const otherCountryRows = otherCountries.reduce((n, x) => n + x.count, 0);
    const OPP_COLUMNS = ['name', 'country', 'category', 'submissionModel', 'listingAction',
      'tier', 'domainRating'];
    // Every number on the page is derived. A hardcoded total would drift the
    // moment a row is added, and the page would then state something untrue.
    const editorialCount = actionable.filter((d) => !d.isOperationalRow).length;
    const rowCount = actionable.filter((d) => d.isOperationalRow).length;
    const countryCount = new Set(actionable.map((d) => d.country)).size;
    const FACETS = [
      { name: 'country', key: 'country', label: t('col.market') },
      { name: 'category', key: 'category', label: t('bdx.platformType') },
      { name: 'priority', key: 'priority', label: t('col.priority'), fallback: 'unassessed',
        order: ['P1', 'P2', 'P3', 'hold'],
        labels: { P1: t('bdx.p1'), P2: t('bdx.p2'), P3: t('bdx.p3'), hold: t('priority.hold'), unassessed: t('bdx.notAssessed') } },
      { name: 'cost', key: 'submissionModel', label: t('col.cost'), fallback: 'unknown',
        order: ['free', 'freemium', 'paid', 'unknown'],
        labels: { free: t('cost.free'), freemium: t('bdx.freemium'), paid: t('cost.paid'), unknown: t('common.unknown') } },
      { name: 'action', key: 'listingAction', label: t('bdx.listingAction'), fallback: 'unknown',
        order: ['create', 'claim', 'create-and-claim', 'apply', 'invite-only', 'unknown'],
        labels: { create: t('bdx.create'), claim: t('bdx.claim'), 'create-and-claim': t('bdx.createOrClaim'), apply: t('bdx.apply'), 'invite-only': t('bdx.inviteOnly'), unknown: t('common.unknown') } },
      { name: 'tier', key: 'tier', label: t('bdx.reputation'),
        order: ['tier1', 'tier2', 'tier3'],
        labels: { tier1: t('bdx.tierA'), tier2: t('bdx.tierB'), tier3: t('bdx.tierC') } },
      { name: 'status', key: 'currentStatus', label: t('col.status'), fallback: 'unknown',
        order: ['active', 'unknown'],
        labels: { active: t('currentStatus.active'), unknown: t('currentStatus.unknown') } },
      // Directory Intelligence v2 filters. Every value is computed from facts
      // already on the record; a platform with too little evidence to score
      // shows as "Not yet scored" rather than being hidden or guessed at.
      { name: 'score', key: 'scoreBand', label: t('bdx.directoryScore'), fallback: 'unscored',
        order: ['strong', 'good', 'moderate', 'limited', 'unscored'],
        labels: { ...INTEL.BAND_LABELS, unscored: t('band.unscored') } },
      { name: 'approval', key: 'approvalMode', label: t('bdx.approval'), fallback: 'unknown',
        order: ['instant', 'mixed', 'manual', 'unknown'],
        labels: { instant: t('bdx.instant'), mixed: t('bd.mixed'), manual: t('bdx.manualReview'), unknown: t('common.unknown') } },
      { name: 'reach', key: 'countryReach', label: t('bdx.countryReach'), fallback: 'unknown',
        order: ['global', 'regional', 'single', 'unknown'],
        labels: { global: t('geo.global'), regional: t('geo.regional'), single: t('bdx.singleCountry'), unknown: t('common.unknown') } },
      // List-valued: a platform is a strong choice for several profiles at once,
      // and the row attribute is the whole set. It reads bestForProfiles, not a
      // single derived key — deriving one from the first entry made the control
      // offer 6 of the 10 profiles that actually have rows, and equality then
      // matched the 16 saas rows zero times because none of them is saas alone.
      { name: 'bestfor', key: 'bestForProfiles', multi: true, label: t('col.bestFor'), fallback: '',
        order: RECOMMEND.PROFILES.map((p) => p.key),
        labels: Object.fromEntries(RECOMMEND.PROFILES.map((p) => [p.key, p.label])) },
      // Readiness, in the Planner's own vocabulary. The option VALUE is the
      // status dp-engine assigns — READY, NEEDS_RESEARCH, NEEDS_BROWSER,
      // BLOCKED — because a shared URL carries the value and a localized string
      // in ?actionability= would filter nothing in the next reader's language.
      // Only the label is translated. Options come from the rows, so a status
      // no row holds is never offered: BLOCKED is a real state in the
      // vocabulary and simply does not occur in this collection today, and
      // listing it would be a filter that can only empty the table.
      { name: 'actionability', key: 'actionability', label: t('bd.actionability'), fallback: '',
        order: ['READY', 'NEEDS_RESEARCH', 'NEEDS_BROWSER', 'BLOCKED'],
        labels: { READY: t('act.READY'), NEEDS_RESEARCH: t('act.NEEDS_RESEARCH'),
          NEEDS_BROWSER: t('act.NEEDS_BROWSER'), BLOCKED: t('act.BLOCKED') } },
    ];

    pages.push({
      kind: 'opportunities',
      owner: 'opportunities',
      outPath: path.join(SECTION_DIR, 'opportunities', 'index.html'),
      meta: seo.buildOpportunitiesMeta(),
      main: [
        c.pageIntro({
          title: `${actionable.length} Business Listing Opportunities`,
          lede: t('bdx.oppsLede'),
        }),
        section('worklist', t('bdx.workingList'), [
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
          // A FLOOR on Domain Rating, not a facet on it. 77 of these rows carry
          // a reading and the rest were never measured, so an equality facet
          // would offer a spread of numbers that each hide the whole corpus
          // behind them; a floor asks the question a reader actually has and
          // composes with the sort instead of competing with it. The control
          // returns nothing at all when no row on the page has a rating.
          c.minDomainRatingControl({ idPrefix: 'opp', rows: actionable }),
          c.linkTypeControl({ idPrefix: 'opp', rows: actionable }),
          c.listingPageControl({ idPrefix: 'opp', rows: actionable }),
          // The same control the country pages use, given the same column set
          // the table below renders. Without a select the client still sorts —
          // js/business-directories.js falls back to 'default' — so the page
          // was already reordered by a PetroHrys Score it does not show, with
          // no way for a reader to change or even name the order.
          //
          // Passing OPP_COLUMNS is what withholds the dead keys: of 1563 rows,
          // 50 carry a Domain Rating and 77 a PetroHrys Score, while authority
          // score and estimated traffic are null on every one — sorting by
          // either would silently collapse to name order. Only Domain Rating is
          // a rendered column here, so the offered keys are domain-rating and
          // alphabetical.
          c.sortControls({ idPrefix: 'opp', columns: OPP_COLUMNS }),
          c.clearFiltersControl(),
          '      </div>',
          `      <p class="bd-note"><a class="bd-button" href="/research/business-directories/opportunities.csv" download>`
            + `Download all ${actionable.length} opportunities as CSV</a> `
            + `${escapeHtml(t('bdx.csvNote'))}</p>`,
          // The second action. "Download all" above is a static file and stays
          // that way; this one is the current selection, and only the browser
          // knows what that is.
          //
          // The count is the number of CANONICAL opportunities on this page,
          // which is now the same as the number of interactive rows because
          // there is exactly one row per opportunity. It used to be
          // `actionable.length + other.length` — the row total including the
          // repeats — with a comment conceding that the button mirrored an
          // inflated page rather than the collection. The button, the status
          // line, the table and the exported file now all state one number.
          c.filteredExportControl({
            name: 'business-listing-opportunities',
            count: actionable.length,
          }),
          // Same rows, same order, one attribute more: every row states its
          // readiness so the facet above filters on the row itself rather than
          // on anything the client would have to recompute.
          withRowFacet(c.directoryTable({
            directories: actionable,
            caption: t('bdx.listingOpps'),
            columns: OPP_COLUMNS,
            sortKey: null,
          }), actionable, 'actionability', (d) => d.actionability),
          `      <p class="bd-note"><a href="${escapeHtml(SCHEMA.AHREFS_ATTRIBUTION.href)}" `
            + `rel="noopener noreferrer" target="_blank">${escapeHtml(SCHEMA.AHREFS_ATTRIBUTION.text)}</a>. `
            + `${escapeHtml(t('bdx.drCaveat'))}</p>`,
        ].join('\n')),
        // A country INDEX, not a second table. `bd-grid`/`bd-card` carry no
        // `data-bd-rows` and no `.bd-row`, so nothing here enters the result
        // universe the client counts, filters, sorts and exports — which is the
        // whole point: these 97 countries' platforms are already rows in the
        // worklist above, and rendering them again is what made one canonical
        // opportunity two interactive records.
        //
        // The cards deliberately do NOT link. The first version pointed each at
        // `?country=<slug>#worklist`, which reads as an obvious convenience and
        // is the one thing this site cannot afford: the crawl-surface policy
        // rests on the canonical never carrying a query AND nothing internal
        // linking to a filtered state, and 97 such links are exactly the facet
        // crawl path it forbids. The country facet directly above already
        // offers every one of these values, so the index only has to make them
        // findable without scrolling 1,609 rows — naming them does that.
        ...(otherCountries.length ? [section('other-countries', t('bdx.otherCountries'), [
          `      <p>${escapeHtml(t('bdx.otherCountriesNote', {
            n: otherCountryRows, c: otherCountries.length,
          }))}</p>`,
          c.cardGrid(otherCountries.map((x) => c.countryCard({
            name: x.name,
            count: x.count,
            linked: false,
          })), { label: t('bdx.otherCountries') }),
        ].join('\n'))] : []),
      ].join('\n\n'),
    });

    // --- Directory Intelligence v3: one page per business profile -----------
    // Nothing here is curated. Each page asks the recommendation engine to rank
    // the SAME actionable set against a profile's declaration, and renders what
    // comes back. Adding a platform to the registry changes these pages with no
    // edit to this file.
    const PAGE_LIMIT = 25;
    const MIN_ENTRIES = 5;
    for (const profile of RECOMMEND.PROFILES) {
      const ranked = RECOMMEND.rankFor(actionable, profile.key,
        { limit: PAGE_LIMIT, minLevel: 'marginal' });
      // The no-empty-artefact rule the whole section follows: a page that would
      // recommend almost nothing is not a page.
      if (ranked.length < MIN_ENTRIES) continue;
      const rows = ranked.map(({ record, recommendation }) => ({
        ...record,
        recommendationScore: recommendation.score,
        recommendationLevel: RECOMMEND.LEVEL_LABELS[recommendation.level] || '',
        recommendationBasis: recommendation.fit,
        recommendationReasons: recommendation.reasons,
      }));
      const byLevel = (lv) => ranked.filter((r) => r.recommendation.level === lv).length;
      pages.push({
        kind: 'recommendation',
        owner: `recommendation:${profile.key}`,
        outPath: routes.recommendationOut(profile.slug),
        meta: seo.buildRecommendationMeta({
          label: profile.label, slug: profile.slug, blurb: profile.blurb, count: ranked.length,
        }),
        main: [
          c.pageIntro({
            title: `Best business directories for ${profile.label}`,
            lede: profile.blurb,
          }),
          section('ranked', t('bdx.rankedRecs'), [
            `      <p>${escapeHtml(`${ranked.length} platforms, ranked by how well each suits `
              + `${profile.label} rather than by how good it is in general. `
              + `${byLevel('priority')} priority, ${byLevel('recommended')} recommended, `
              + `${byLevel('possible')} possible, ${byLevel('marginal')} marginal. `
              + t('bdx.recScoreNote'))}</p>`,
            c.recommendationTable({ rows, profileLabel: profile.label }),
          ].join('\n')),
          section('methodology', t('rec.method'), [
            `      <p>${escapeHtml('Nothing on this page is a curated list. Every actionable '
              + 'platform in the database was scored against one declaration of what '
              + `${profile.label} need, and the ranking is what came back.`)}</p>`,
            '      <ul class="bd-list">',
            `        <li>${escapeHtml('Fit comes first. Where a platform states which business '
              + 'types it accepts, that statement is used. Where it does not, the platform\'s '
              + 'category is used, and failing that the words in its own description. Each row '
              + 'shows which of the three applied.')}</li>`,
            `        <li>${escapeHtml(t('bdx.excludedOutright'))}</li>`,
            `        <li>${escapeHtml(t('bdx.qualityFallback'))}</li>`,
            '      </ul>',
          ].join('\n')),
          section('limitations', t('common.limitations'), [
            `      <p>${escapeHtml('These rankings reflect evidence recorded, not a survey of '
              + 'outcomes. A well-documented platform can outrank a better one that has been '
              + 'researched less. Rows marked Possible or Marginal rest on a category or a '
              + 'keyword rather than the platform\'s own statement of who it accepts — treat '
              + 'them as candidates to check, not conclusions.')}</p>`,
            `      <p class="bd-note"><a class="bd-button" href="${OPPORTUNITIES_PATH}">`
              + `${escapeHtml(t('bdx.browseAllOpps'))}</a></p>`,
          ].join('\n')),
        ].join('\n\n'),
      });
    }
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
    const faqs = countryFaqs(country, countryEntries.length, t);
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
          `      <ul class="bd-badges" aria-label="${escapeHtml(t('bdx.geographicScope'))}">\n`
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
        ...(categoryLinks.length ? [section('categories', t('bdx.directoryCategories'),
          c.cardGrid(categoryLinks.map((l) => c.categoryCard({ ...l, headingLevel: 3 })),
            { label: t('bdx.directoryCategories') }))] : []),
        section('directories', t('bdx.allDirectories'), [
          c.searchControls({ idPrefix: country.slug }),
          c.filterControls({ idPrefix: country.slug, directories: countryEntries }),
          c.sortControls({ idPrefix: country.slug, columns: countryColumns }),
          c.filteredExportControl({ name: country.slug, count: countryEntries.length }),
          // A country with no subnational record renders exactly one table, as
          // it always has. Grouping appears only once the coverage exists, so
          // the United States does not carry an empty "States" heading before
          // any state registry is published.
          ...(jurisdictionSections(country, countryEntries, countryColumns, c)
            || [c.directoryTable({
              directories: countryEntries,
              caption: `Directories in ${country.name}`,
              columns: countryColumns,
            })]),
          c.metricNote(activeMetrics),
        ].join('\n')),
        section('faq', t('bdx.questions'), c.faqSection(faqs)),
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
          section('directories', t('bd.directories'), [
            c.searchControls({ idPrefix: `${country.slug}-${category.slug}` }),
            c.filterControls({ idPrefix: `${country.slug}-${category.slug}`, directories: entries }),
            c.sortControls({ idPrefix: `${country.slug}-${category.slug}`, columns: c.tableColumnsFor(entries) }),
            c.filteredExportControl({ name: `${country.slug}-${category.slug}`, count: entries.length }),
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
      ].join('\n') : `      <p class="bd-empty">${t('bdx.noGuideYet')}</p>`;

      // Where this record sits, in words rather than slugs, so the reader can
      // climb back out without using the breadcrumb.
      const context = `      <ul class="bd-list">
        <li><a href="${routes.countryPath(country.slug)}">All directories in ${escapeHtml(country.name)}</a></li>
${category ? `        <li><a href="${routes.categoryPath(country.slug, category.slug)}">${escapeHtml(category.name)} directories in ${escapeHtml(country.name)}</a></li>\n` : ''}        <li><a href="${routes.hubPath()}">${t('bdx.indexTitle')}</a></li>
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
          section('score', t('bd.petrohrysScore'), `${c.metricsBlock(directory, activeMetrics)}\n${c.metricNote(activeMetrics)}`),
          section('verification', t('bdx.verification'), c.verificationBlock(directory)),
          // Conditional: renders nothing at all for a record that carries none
          // of the structured registry fields, so pre-Wave-1 pages are unchanged.
          ...(c.listingInformation(directory)
            ? [section('listing-information', t('bdx.listing'), c.listingInformation(directory))]
            : []),
          ...(c.registryInformation(directory)
            ? [section('registry-information', t('bdx.registryInformation'), c.registryInformation(directory))]
            : []),
          section('assessment', t('bdx.assessment'), c.prosCons({ pros: directory.pros, cons: directory.cons, headingLevel: 3 })),
          section('guidance', t('bdx.submissionGuidance'),
            `${c.submissionLink(directory)}\n${c.editorialGuidance(directory, activeGuidance)}`),
          section('audiences', t('bdx.whatAccepts'), c.acceptsList(directory)),
          section('industries', t('bd.recommendedIndustries'), c.bestForTags(directory.recommendedIndustries)),
          section('breakdown', t('bdx.howScoreReached'), c.scoreBreakdown(directory)),
          section('related', t('bdx.relatedDirectories'), c.relatedDirectories(
            SCHEMA.RELATION_KINDS.map((kind) => ({
              label: SCHEMA.RELATION_LABELS[kind],
              items: (directory.related[kind] || [])
                .map((targetId) => registry.directories.find((d) => d.id === targetId))
                .filter(Boolean)
                .map((target) => ({ name: target.name, path: routes.directoryPathFor(target) })),
            })))),
          section('guides', t('bdx.guidesCovering'), guideLinks),
          section('context', t('bdx.whereThisSits'), context),
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

  // Each canonical page is rendered once per locale. The registry is read ONCE
  // and the same 1,563 records feed all four renders — no locale gets a copy.
  // The English page keeps its existing outPath so nothing already published
  // moves; the other locales are written under their prefix.
  // The page MODEL is rebuilt per locale so the body is localized, not just the
  // shell. Rebuilding is cheap next to the alternative: a single English body
  // rendered into four shells, which is the defect this replaces.
  for (const locale of I18N.LOCALE_CODES) {
    const localePages = locale === I18N.DEFAULT_LOCALE ? pages : pageModel(registry, locale);
    for (let i = 0; i < localePages.length; i += 1) {
      const page = localePages[i];
      const out = locale === I18N.DEFAULT_LOCALE
        ? page.outPath
        : I18N.localizedFile(locale, page.meta.canonicalPath);
      files.set(out, renderPage({ meta: page.meta, main: page.main, locale }));
    }
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
  // The section, in every supported locale. The property is unchanged — this
  // build writes only its own pages — but a localized route IS its own page,
  // one prefix further down. Enumerated from the locale list rather than by
  // loosening the check, so a stray path outside the section still fails.
  const sectionDirs = I18N.LOCALE_CODES
    .map((l) => I18N.localizedPath(l, `/${SECTION_DIR}/`).replace(/^\//, '').replace(/\/$/, ''));
  const inSection = normalised === SITEMAP_FILE
    || sectionDirs.some((dir) => normalised.startsWith(dir + path.sep));
  if (!inSection) {
    throw new BuildError(
      `Generated path is outside the section: ${relPath}. `
      + `Only ${sectionDirs.join('/**, ')}/** and ${SITEMAP_FILE} may be written.`);
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
  //
  // The staged set now covers every LOCALE of every page, not just the English
  // canonical. The sitemap began emitting localized URLs — 1,200 pages that
  // existed and were indexable but appeared in no sitemap — and this check
  // rejected them, correctly by its own logic and wrongly in effect: those
  // pages are staged, they were simply absent from a set built only from
  // English canonicals. Derived from the locale registry so it cannot drift.
  const staged = new Set();
  for (const page of pages) {
    for (const locale of I18N.LOCALE_CODES) {
      staged.add(`${seo.ORIGIN}${I18N.localizedPath(locale, page.meta.canonicalPath)}`);
    }
    staged.add(page.meta.canonical);
  }
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
  // Every locale variant of a page is owned by that page. Without this the
  // localized keys carried an undefined owner, JSON.stringify dropped them, and
  // the next build refused to overwrite files it had written itself.
  for (const page of pages) {
    for (const locale of I18N.LOCALE_CODES) {
      const out = locale === I18N.DEFAULT_LOCALE
        ? page.outPath
        : I18N.localizedFile(locale, page.meta.canonicalPath);
      owners[out] = page.owner;
    }
  }
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
