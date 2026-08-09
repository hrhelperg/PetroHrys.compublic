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
    + `${Object.keys(editorial).length} editorial × ${EDITORIAL_LOCALES.length}; `
    + `${written} written, ${unchanged} unchanged, ${pruned} pruned.`);
}

if (require.main === module) main();

module.exports = { DOCUMENTS, ownedFiles, fileFor, buildPage, buildEditorialPage, updatedStamp, manifest, editorial, EDITORIAL_LOCALES };
