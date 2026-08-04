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
const SCHEMA = require('./lib/bd-schema.cjs');
const { buildArticles, guidesFor } = require('./lib/bd-articles.cjs');
const { validateRegistry, formatReport } = require('./validate-business-directories.cjs');

const BASE = routes.BASE;
const SECTION_DIR = routes.SECTION_DIR;
const SITEMAP_FILE = routes.sitemapOut();
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
    .filter((country) => country.slug !== GLOBAL_SCOPE)
    .map((country) => ({
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

  const hubMeta = seo.buildHubMeta({
    countries: [...globalLink, ...countryLinks.filter((l) => !l.pending)],
    faqs: HUB_FAQS,
  });

  // Every number is derived. Counts must not reach a meta description — the SEO
  // tests forbid digits there precisely so a count can never be fabricated into
  // one — so the scale is stated in body copy.
  const scopeCount = publishedCountries.length + (globalEntries.length ? 1 : 0);
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
        `      <p class="bd-stat">${escapeHtml(`${countryEntries.length} verified `
          + `${countryEntries.length === 1 ? 'directory' : 'directories'} in `
          + `${categoryLinks.length} ${categoryLinks.length === 1 ? 'category' : 'categories'}.`)}</p>`,
        ...(categoryLinks.length ? [section('categories', 'Directory categories',
          c.cardGrid(categoryLinks.map((l) => c.categoryCard({ ...l, headingLevel: 3 })),
            { label: 'Directory categories' }))] : []),
        section('directories', 'All directories', [
          c.searchControls({ idPrefix: country.slug }),
          c.filterControls({ idPrefix: country.slug, directories: countryEntries }),
          c.sortControls({ idPrefix: country.slug, columns: countryColumns }),
          c.directoryTable({
            directories: countryEntries,
            caption: `Directories in ${country.name}`,
            columns: countryColumns,
          }),
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
      const dirMeta = seo.buildDirectoryMeta({ country, category, directory, indexable });
      if (!indexable) noindexReport.push({ id: directory.id, missing });

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
          c.pageIntro({ title: directory.name, lede: directory.description }),
          c.externalLinkCta({ url: directory.website, name: directory.name }),
          c.statusBadges(directory),
          section('score', 'PetroHrys Score', `${c.metricsBlock(directory, activeMetrics)}\n${c.metricNote(activeMetrics)}`),
          section('verification', 'Verification', c.verificationBlock(directory)),
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

  const feedItems = registry.directories
    .filter((d) => d.lastVerified)
    .slice()
    .sort((a, b) => (a.lastVerified < b.lastVerified ? 1 : a.lastVerified > b.lastVerified ? -1 : 0))
    .map((d) => ({
      title: d.name,
      path: routes.directoryPathFor(d),
      description: d.description,
      pubDate: toPubDate(d.lastVerified),
    }));
  files.set(FEED_FILE, renderRss(feedItems));

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
  const owners = { [SITEMAP_FILE]: 'sitemap', [FEED_FILE]: 'feed' };
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
