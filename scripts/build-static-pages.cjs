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
function ownedFiles() {
  const files = [];
  for (const doc of DOCUMENTS) {
    for (const locale of I18N.LOCALE_CODES) {
      files.push(I18N.localizedFile(locale, doc.canonicalPath));
    }
  }
  return files;
}

function assertOwned(rel) {
  const owned = new Set(ownedFiles());
  if (!owned.has(rel)) {
    throw new Error(`build-static-pages tried to write ${rel}, which it does not own`);
  }
}

function main() {
  const owned = ownedFiles();
  let written = 0;
  let unchanged = 0;

  for (const doc of DOCUMENTS) {
    for (const locale of I18N.LOCALE_CODES) {
      const rel = I18N.localizedFile(locale, doc.canonicalPath);
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
  console.log(`Static pages: ${DOCUMENTS.length} document(s) × ${I18N.LOCALE_CODES.length} locale(s); `
    + `${written} written, ${unchanged} unchanged, ${pruned} pruned.`);
}

if (require.main === module) main();

module.exports = { DOCUMENTS, ownedFiles, buildPage, updatedStamp, manifest };
