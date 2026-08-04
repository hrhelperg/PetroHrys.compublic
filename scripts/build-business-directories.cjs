// scripts/build-business-directories.cjs
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PATHS, writeIfChanged } = require('./lib/bd-util.cjs');
const { loadRegistry, directoriesFor } = require('./lib/bd-registry.cjs');
const { sortDirectories } = require('./lib/bd-sort.cjs');
const seo = require('./lib/bd-seo.cjs');
const c = require('./lib/bd-components.cjs');
const { renderPage } = require('./lib/bd-render.cjs');
const { renderSitemap, renderRss } = require('./lib/bd-feeds.cjs');
const routes = require('./lib/bd-routes.cjs');
const SCHEMA = require('./lib/bd-schema.cjs');
const { validateRegistry, formatReport } = require('./validate-business-directories.cjs');

const BASE = routes.BASE;
const SECTION_DIR = routes.SECTION_DIR;
const SITEMAP_FILE = routes.sitemapOut();
const FEED_FILE = routes.feedOut();
const MANIFEST_FILE = path.join('data', 'business-directories', '.build-manifest.json');
const REFERENCE_COUNTRY = 'united-states';
const REFERENCE_CATEGORY = 'general-business';

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

function categoryEmitted(registry, country, category) {
  if (directoriesFor(registry, country.slug, category.slug).length > 0) return true;
  return country.slug === REFERENCE_COUNTRY && category.slug === REFERENCE_CATEGORY;
}

// --- approved static copy ---------------------------------------------------

const HUB_FAQS = [
  { q: 'What is this section?',
    a: 'A research index of business directories, organised by country and category. Each entry records what a directory accepts, how it links out, and how it was verified.' },
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

  const countryLinks = registry.countries.map((country) => ({
    name: country.name,
    path: routes.countryPath(country.slug),
    pending: !countryEmitted(registry, country),
  }));

  const hubMeta = seo.buildHubMeta({
    countries: countryLinks.filter((l) => !l.pending),
    faqs: HUB_FAQS,
  });

  pages.push({
    kind: 'hub',
    owner: 'hub',
    outPath: routes.hubOut(),
    meta: hubMeta,
    main: [
      c.pageIntro({ title: 'Business Directories', lede: hubMeta.description }),
      section('methodology', 'Methodology', `${c.methodologyNote()}\n${c.metricNote()}`),
      section('countries', 'Countries',
        c.cardGrid(countryLinks.map((l) => c.countryCard({ ...l, headingLevel: 3 })),
          { label: 'Countries' })),
      section('faq', 'Questions', c.faqSection(HUB_FAQS)),
    ].join('\n\n'),
  });

  for (const country of registry.countries) {
    if (!countryEmitted(registry, country)) continue;

    const countryPath = routes.countryPath(country.slug);
    const countryEntries = sortDirectories(directoriesFor(registry, country.slug));
    const categoryLinks = registry.categories.map((category) => ({
      name: category.name,
      path: routes.categoryPath(country.slug, category.slug),
      description: category.description,
      pending: !categoryEmitted(registry, country, category),
    }));
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
        section('categories', 'Directory categories',
          c.cardGrid(categoryLinks.map((l) => c.categoryCard({ ...l, headingLevel: 3 })),
            { label: 'Directory categories' })),
        section('directories', 'All directories', [
          c.searchControls({ idPrefix: country.slug }),
          c.filterControls({ idPrefix: country.slug }),
          c.sortControls({ idPrefix: country.slug }),
          c.directoryTable({ directories: countryEntries, caption: `Directories in ${country.name}` }),
          c.metricNote(),
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
            c.filterControls({ idPrefix: `${country.slug}-${category.slug}` }),
            c.sortControls({ idPrefix: `${country.slug}-${category.slug}` }),
            c.directoryTable({ directories: entries, caption: `${category.name} directories in ${country.name}` }),
            c.metricNote(),
          ].join('\n')),
        ].join('\n\n'),
      });
    }

    for (const directory of countryEntries) {
      const category = registry.categories.find((cat) => cat.slug === directory.category);
      const dirMeta = seo.buildDirectoryMeta({ country, category, directory });

      pages.push({
        kind: 'directory',
        owner: `directory:${directory.id}`,
        outPath: routes.directoryOut(country.slug, directory.slug),
        lastmod: directory.lastVerified || undefined,
        meta: dirMeta,
        main: [
          c.pageIntro({ title: directory.name, lede: directory.description }),
          c.externalLinkCta({ url: directory.website }),
          c.submissionLink(directory),
          c.statusBadges(directory),
          section('audiences', 'What this directory accepts', c.acceptsList(directory)),
          section('metrics', 'Metrics', `${c.metricsBlock(directory)}\n${c.metricNote()}`),
          section('score', 'How the PetroHrys Score was reached', c.scoreBreakdown(directory)),
          section('verification', 'Verification', c.verificationBlock(directory)),
          section('industries', 'Recommended industries', c.bestForTags(directory.recommendedIndustries)),
          section('assessment', 'Assessment', c.prosCons({ pros: directory.pros, cons: directory.cons, headingLevel: 3 })),
          section('guidance', 'Submission guidance', c.editorialGuidance(directory)),
          section('related', 'Related directories', c.relatedDirectories(
            SCHEMA.RELATION_KINDS.map((kind) => ({
              label: SCHEMA.RELATION_LABELS[kind],
              items: (directory.related[kind] || [])
                .map((targetId) => registry.directories.find((d) => d.id === targetId))
                .filter(Boolean)
                .map((target) => ({ name: target.name, path: routes.directoryPathFor(target) })),
            })))),
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
