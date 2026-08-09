'use strict';

// Deterministic generator for hand-authored static pages.
//
// ── WHAT THIS REPLACES ──────────────────────────────────────────────────────
//
// Eight legal pages that each carried their own <style> block, their own header,
// their own footer and their own colour values. Eight copies of a shell means
// eight places to fix anything, and in practice it meant the localized ones were
// never fixed at all: none of /es/, /fr/ or /de/ had a single hreflang tag, and
// all eight canonicalized to www.petrohrys.com, which 301-redirects to the
// apex — so every legal page pointed search engines at a redirect.
//
// ── THE CONTENT / PRESENTATION SPLIT ────────────────────────────────────────
//
// The prose lives in content/legal/<doc>.<locale>.html and was copied out of the
// shipped pages byte-for-byte, with a text-equality assertion proving the
// extraction changed markup only. It is NOT retranslated: a legal document's
// German text is the German text of record, and regenerating it from English
// would quietly replace a reviewed translation with an unreviewed one.
//
// This generator owns presentation and metadata. It never edits prose.

const fs = require('node:fs');
const path = require('node:path');
const I18N = require('./lib/i18n.cjs');
const { renderStaticPage } = require('./lib/page-shell.cjs');

const ROOT = path.join(__dirname, '..');
const CONTENT = path.join(ROOT, 'content', 'legal');
const MANIFEST_FILE = path.join(ROOT, 'data', 'static-pages-manifest.json');

const manifest = JSON.parse(fs.readFileSync(path.join(CONTENT, 'manifest.json'), 'utf8'));

const EDITORIAL_DIR = path.join(ROOT, 'content', 'editorial');
const editorial = JSON.parse(fs.readFileSync(path.join(EDITORIAL_DIR, 'manifest.json'), 'utf8'));

// Editorial pages are English-only for now; Phase 3 assigns each a localization
// disposition. Rendering them here already removes eleven inline stylesheets,
// eleven hand-rolled headers and eleven footers, and puts them behind the same
// shell as everything else — which is what makes localizing them later a data
// change rather than another migration.
const EDITORIAL_LOCALES = ['en'];

// ── the Research Center hub ─────────────────────────────────────────────────
// Previously four independently hand-maintained HTML files. They had drifted
// badly: the English hub had four sections, an <h1> and a <main>; the German,
// Spanish and French hubs had two sections, no <h1>, no <main> at all — so their
// skip link pointed at a #main that did not exist — an unclosed <header>, and an
// entirely English navigation with unprefixed links.
//
// Now generated for all four locales from content/research-hub/<locale>.json, so
// the structure cannot drift again: a missing section is a missing key, and the
// parity test names it.
const HUB_DIR = path.join(ROOT, 'content', 'research-hub');
const HUB_PATH = '/research/';
const hubContent = (locale) => JSON.parse(fs.readFileSync(path.join(HUB_DIR, `${locale}.json`), 'utf8'));

// Each document's canonical route and the dictionary key naming it in the
// breadcrumb. The label is not stored per locale here — it already exists in the
// footer vocabulary, and a second copy would be a second thing to translate.
const DOCUMENTS = [
  { id: 'privacy', canonicalPath: '/privacy/', crumbKey: 'shell.footer.privacy' },
  { id: 'terms', canonicalPath: '/terms/', crumbKey: 'shell.footer.terms' },
];

// ── date handling ───────────────────────────────────────────────────────────
// The "last updated" stamp is a FACT and each locale already carries it in its
// own written form ("15 April 2026", "15 de abril de 2026", "15. April 2026").
// Those strings are reused verbatim rather than reformatted from a parsed date:
// re-deriving them would mean this build could silently change the date shown on
// a legal document, which is exactly the class of change that must not happen
// as a side effect of a design migration.
function updatedStamp(doc, locale) {
  const raw = manifest[doc][locale].updated;
  // Stored as "<label>: <date>" in every locale. Keep the date, re-label through
  // the dictionary so the label matches the rest of the localized chrome.
  const idx = raw.indexOf(':');
  const date = idx >= 0 ? raw.slice(idx + 1).trim() : raw.trim();
  return { date, rendered: I18N.t(locale, 'legal.updated', { date }) };
}

function buildPage(doc, locale) {
  const entry = manifest[doc.id][locale];
  const body = fs.readFileSync(path.join(CONTENT, `${doc.id}.${locale}.html`), 'utf8').trim();
  const { rendered: updated } = updatedStamp(doc.id, locale);
  const t = I18N.translator(locale);

  const main = `    <article class="legal-prose">
      <h1>${entry.h1}</h1>
      <p class="doc-updated">${updated}</p>
${body.split('\n').map((l) => (l ? `      ${l}` : l)).join('\n')}
    </article>`;

  return renderStaticPage({
    canonicalPath: doc.canonicalPath,
    locale,
    title: entry.title,
    description: entry.description,
    main,
    breadcrumb: [
      { label: t('legal.backHome'), href: I18N.localizedPath(locale, '/') },
      { label: t(doc.crumbKey) },
    ],
  });
}

// ── ownership ───────────────────────────────────────────────────────────────
// This build writes only routes it declares. The assertion below is what stops a
// generator from stepping on another collection's output — the failure mode that
// once had a corrupt manifest delete sitemap.xml.
// Two shapes of route exist. /privacy/ is a directory and gets index.html;
// /blog/smart-printer-guide.html is a file and must stay exactly that URL —
// rewriting it to a directory would silently 404 every existing inbound link.
function fileFor(locale, canonicalPath) {
  if (canonicalPath.endsWith('.html')) {
    return I18N.localizedPath(locale, canonicalPath).replace(/^\//, '');
  }
  return I18N.localizedFile(locale, canonicalPath);
}

function ownedFiles() {
  const files = [];
  for (const locale of I18N.LOCALE_CODES) files.push(fileFor(locale, HUB_PATH));
  for (const doc of DOCUMENTS) {
    for (const locale of I18N.LOCALE_CODES) files.push(fileFor(locale, doc.canonicalPath));
  }
  for (const [, entry] of Object.entries(editorial)) {
    for (const locale of EDITORIAL_LOCALES) files.push(fileFor(locale, entry.canonicalPath));
  }
  return files;
}

function assertOwned(rel) {
  const owned = new Set(ownedFiles());
  if (!owned.has(rel)) {
    throw new Error(`build-static-pages tried to write ${rel}, which it does not own`);
  }
}

// Structured data is carried through from the source page, with the host
// normalized to the apex. It is NOT regenerated: these blocks contain headlines,
// dates and FAQ answers that were written by hand, and rebuilding them from
// page metadata would quietly reword published structured data.
function buildEditorialPage(id, entry, locale) {
  const body = fs.readFileSync(path.join(EDITORIAL_DIR, `${id}.${locale}.html`), 'utf8').trim();
  const t = I18N.translator(locale);
  const isArticle = entry.canonicalPath.startsWith('/blog/') && entry.canonicalPath !== '/blog/';

  const main = `    <article class="article-prose">
${body.split('\n').map((l) => (l ? `      ${l}` : l)).join('\n')}
    </article>`;

  const crumbs = [{ label: t('legal.backHome'), href: I18N.localizedPath(locale, '/') }];
  if (isArticle) crumbs.push({ label: t('shell.footer.blog'), href: I18N.localizedPath(locale, '/blog/') });
  crumbs.push({ label: entry.h1 || entry.title });

  return renderStaticPage({
    canonicalPath: entry.canonicalPath,
    locale,
    title: entry.title,
    description: entry.description,
    main,
    breadcrumb: crumbs,
    availableLocales: EDITORIAL_LOCALES,
    jsonLd: entry.jsonLd && entry.jsonLd.length
      ? (entry.jsonLd.length === 1 ? entry.jsonLd[0] : entry.jsonLd)
      : null,
  });
}

// Collection names and routes come from the places that already own them: the
// collection.* dictionary keys and the generators' own route constants. Storing
// either in the hub content files would create a second name for the same
// dataset and a link that goes stale when a collection moves.
function buildHubPage(locale) {
  const c = hubContent(locale);
  const t = I18N.translator(locale);
  const p = (route) => I18N.localizedPath(locale, route);
  const routes = require('./lib/bd-routes.cjs');
  const render = require('./lib/bd-render.cjs');

  // Escape bare ampersands. The dictionary is inconsistent by history — some
  // values store "&" and some store "&amp;" — so emitting a value straight into
  // markup produced invalid HTML for exactly the collections whose names contain
  // one. This normalizes without double-escaping an existing entity.
  const esc = (v) => v.replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]*|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');

  // The hub names each collection in full; the footer uses the short form. Both
  // are real, so they are separate keys rather than one key stretched to serve
  // two jobs.
  const names = {
    directories: esc(t('collection.directories')),
    marketplaces: esc(t('collection.marketplaces')),
    media: esc(t('collection.media.full')),
  };
  const chooseBody = c.collections.chooseBody
    .replace('{directories}', names.directories)
    .replace('{marketplaces}', names.marketplaces)
    .replace('{media}', names.media);

  const item = (href, name, desc) => `        <li><a href="${href}">`
    + `<span class="name">${name}</span>`
    + `<span class="desc">${desc}</span>`
    + '<span class="arrow" aria-hidden="true">&rarr;</span></a></li>';

  const collectionItems = [
    item(p(routes.hubPath()), names.directories, c.collections.items.directories),
    item(p(`${routes.hubPath()}opportunities/`), esc(t('opportunity.workingList')), c.collections.items.opportunities),
    item(p(render.MEDIA_PATH), names.media, c.collections.items.media),
    item(p(render.MARKETPLACES_PATH), names.marketplaces, c.collections.items.marketplaces),
  ].join('\n');

  const main = `    <article class="page-hero">
      <h1>${c.h1}</h1>
      <p class="lede">${c.lede}</p>
    </article>

    <section aria-labelledby="scope" class="prose">
      <h2 id="scope">${c.scope.heading}</h2>
${c.scope.paragraphs.map((x) => `      <p>${x}</p>`).join('\n')}
    </section>

    <section aria-labelledby="collections">
      <h2 id="collections">${c.collections.heading}</h2>
      <p>${c.collections.intro}</p>
      <ul class="product-list">
${collectionItems}
      </ul>
      <h3>${c.collections.chooseHeading}</h3>
      <p>${chooseBody}</p>
      <ul class="product-list">
${item(p(render.PLANNER_PATH), esc(t('collection.planner')), c.collections.plannerDesc)}
      </ul>
      <p class="more"><a href="${p(render.PLANNER_PATH)}">${c.collections.plannerCta}</a></p>
    </section>

    <section aria-labelledby="entries" class="prose">
      <h2 id="entries">${c.entries.heading}</h2>
      <p>${c.entries.body}</p>
    </section>

    <section aria-labelledby="related" class="prose">
      <h2 id="related">${c.related.heading}</h2>
      <p>${c.related.bodyPrefix}<a href="${p('/artificial-intelligence/')}">${c.related.aiLabel}</a> &middot; <a href="${p('/blog/')}">${c.related.blogLabel}</a>.</p>
    </section>`;

  return renderStaticPage({
    canonicalPath: HUB_PATH,
    locale,
    title: c.title,
    description: c.description,
    main,
    breadcrumb: [
      { label: t('legal.backHome'), href: p('/') },
      { label: t('shell.nav.writing'), href: p('/writing/') },
      { label: c.h1 },
    ],
  });
}

function main() {
  const owned = ownedFiles();
  let written = 0;
  let unchanged = 0;

  for (const doc of DOCUMENTS) {
    for (const locale of I18N.LOCALE_CODES) {
      const rel = fileFor(locale, doc.canonicalPath);
      assertOwned(rel);
      const abs = path.join(ROOT, rel);
      const html = buildPage(doc, locale);
      const existing = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
      if (existing === html) { unchanged += 1; continue; }
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, html);
      written += 1;
    }
  }

  for (const [id, entry] of Object.entries(editorial)) {
    for (const locale of EDITORIAL_LOCALES) {
      const rel = fileFor(locale, entry.canonicalPath);
      assertOwned(rel);
      const abs = path.join(ROOT, rel);
      const html = buildEditorialPage(id, entry, locale);
      const existing = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
      if (existing === html) { unchanged += 1; continue; }
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, html);
      written += 1;
    }
  }

  for (const locale of I18N.LOCALE_CODES) {
    const rel = fileFor(locale, HUB_PATH);
    assertOwned(rel);
    const abs = path.join(ROOT, rel);
    const html = buildHubPage(locale);
    const existing = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
    if (existing === html) { unchanged += 1; } else {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, html);
      written += 1;
    }
  }

  // Prune scope is this build's own routes and nothing else. A stale entry in
  // the previous manifest that is no longer owned gets removed; a file outside
  // the owned set is never touched, however the manifest is corrupted.
  let pruned = 0;
  if (fs.existsSync(MANIFEST_FILE)) {
    const previous = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8')).files || [];
    const ownedSet = new Set(owned);
    for (const rel of previous) {
      if (ownedSet.has(rel)) continue;
      // Only prune inside the families this build is responsible for.
      if (!DOCUMENTS.some((d) => rel.endsWith(`${d.canonicalPath}index.html`))) continue;
      const abs = path.join(ROOT, rel);
      if (fs.existsSync(abs)) { fs.unlinkSync(abs); pruned += 1; }
    }
  }

  fs.writeFileSync(MANIFEST_FILE, `${JSON.stringify({ files: owned.sort() }, null, 2)}\n`);
  console.log(`Static pages: ${DOCUMENTS.length} legal × ${I18N.LOCALE_CODES.length} locale(s) + `
    + `${Object.keys(editorial).length} editorial × ${EDITORIAL_LOCALES.length} + hub × ${I18N.LOCALE_CODES.length}; `
    + `${written} written, ${unchanged} unchanged, ${pruned} pruned.`);
}

if (require.main === module) main();

module.exports = { DOCUMENTS, HUB_PATH, hubContent, buildHubPage, ownedFiles, fileFor, buildPage, buildEditorialPage, updatedStamp, manifest, editorial, EDITORIAL_LOCALES };
