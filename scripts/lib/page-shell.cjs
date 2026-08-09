'use strict';

// The shared shell for hand-authored static pages.
//
// ── WHY THIS DELEGATES INSTEAD OF DEFINING ITS OWN SHELL ────────────────────
//
// The header, footer, analytics, fonts and ecosystem banner are ALREADY defined
// once, in bd-render.cjs, and are exercised by ~1,700 generated pages. Writing a
// second copy here would give the site two shells that look identical on the day
// they are written and drift on the first change to either — which is exactly
// how the legacy pages ended up with their own headers in the first place.
//
// So this module owns no shell markup. It owns *document assembly* for pages
// whose body is authored content rather than generated from a dataset, and it
// gets every piece of chrome from the same functions the Research Center uses.
//
// ── WHAT A STATIC PAGE NEEDS THAT A RESEARCH PAGE DOES NOT ──────────────────
//
// Research pages carry the business-directories stylesheet, an RSS alternate and
// a dataset-derived breadcrumb trail. A privacy policy needs none of those. This
// module therefore builds a leaner <head> — but from the same constants, so a
// change to the analytics snippet reaches both without anybody remembering to
// copy it.

const path = require('node:path');
const I18N = require('./i18n.cjs');
const { escapeHtml } = require('./bd-util.cjs');
const { ORIGIN } = require('./bd-seo.cjs');
const render = require('./bd-render.cjs');
const eco = require('../inject-ecosystem-banner.cjs');

// Pulled from the one place they are defined. If bd-render stops exporting one
// of these the build fails here rather than silently emitting a page with no
// analytics — which is why these are asserted rather than optional-chained.
const { HEADER, FOOTER, ANALYTICS, FONTS, ECO_HEAD } = render;
for (const [name, value] of Object.entries({ HEADER, FOOTER, ANALYTICS, FONTS, ECO_HEAD })) {
  if (value === undefined) {
    throw new Error(`page-shell: bd-render must export ${name}; refusing to render a page with a partial shell`);
  }
}

const absolute = (p) => `${ORIGIN}${p}`;

// og:image is the site default. A page that wants its own passes one; nothing
// here invents a screenshot URL that may not exist on disk.
const DEFAULT_OG_IMAGE = '/images/og-default.png';

function metaTag(key, content, kind = 'property') {
  return `  <meta ${kind}="${key}" content="${escapeHtml(content)}">`;
}

/**
 * Assemble one localized static page.
 *
 * @param {object}  page
 * @param {string}  page.canonicalPath  Locale-independent route, e.g. '/privacy/'.
 * @param {string}  page.locale
 * @param {string}  page.title          Already localized.
 * @param {string}  page.description    Already localized.
 * @param {string}  page.main           Body HTML for <main>, already localized.
 * @param {Array}   [page.breadcrumb]   [{label, href}] — label already localized.
 * @param {object}  [page.jsonLd]       Structured data object, or null.
 * @param {boolean} [page.noindex]
 * @param {string}  [page.ogImage]
 */
function renderStaticPage({
  canonicalPath, locale, title, description, main,
  breadcrumb = null, jsonLd = null, noindex = false, ogImage = DEFAULT_OG_IMAGE,
}) {
  const L = I18N.LOCALE_BY_CODE.get(locale);
  if (!L) throw new Error(`page-shell: unknown locale "${locale}"`);
  const t = I18N.translator(locale);
  const selfPath = I18N.localizedPath(locale, canonicalPath);

  // Self-canonical, always. A localized page that canonicalizes to English is
  // telling Google the German version should not be indexed — which silently
  // undoes the entire translation effort.
  const alternates = I18N.hreflangCluster(canonicalPath, absolute)
    .map((a) => `\n  <link rel="alternate" hreflang="${a.hreflang}" href="${a.href}">`)
    .join('');

  const social = [
    metaTag('og:title', title),
    metaTag('og:description', description),
    metaTag('og:url', absolute(selfPath)),
    metaTag('og:type', 'website'),
    metaTag('og:site_name', 'Petro Hrys'),
    metaTag('og:locale', L.ogLocale),
    metaTag('og:image', absolute(ogImage)),
    metaTag('twitter:card', 'summary_large_image', 'name'),
    metaTag('twitter:title', title, 'name'),
    metaTag('twitter:description', description, 'name'),
    metaTag('twitter:image', absolute(ogImage), 'name'),
  ].join('\n');

  const crumbs = breadcrumb
    ? `    <p class="breadcrumb">${breadcrumb
      .map((c, i) => (c.href && i < breadcrumb.length - 1
        ? `<a href="${c.href}">${escapeHtml(c.label)}</a>`
        : `<span aria-current="page">${escapeHtml(c.label)}</span>`))
      .join(' <span aria-hidden="true">/</span> ')}</p>\n`
    : '';

  const structured = jsonLd
    ? `  <script type="application/ld+json">\n${JSON.stringify(jsonLd, null, 2)}\n  </script>\n`
    : '';

  const robots = noindex ? '\n  <meta name="robots" content="noindex, follow">' : '';

  return `<!DOCTYPE html>
<html lang="${L.htmlLang}">
<head>
  <meta charset="UTF-8">
${ANALYTICS}
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">${robots}

${social}

  <link rel="canonical" href="${absolute(selfPath)}">${alternates}
  <link rel="sitemap" type="application/xml" href="${absolute('/sitemap.xml')}">
  <link rel="icon" href="/images/logo-red.svg">

${FONTS}
  <link rel="stylesheet" href="/css/petrohrys.css">

${structured}${ECO_HEAD}
</head>
<body>
  <a class="skip" href="#main">${t('shell.skip')}</a>
${eco.bodyBlock(L.htmlLang)}

${HEADER(canonicalPath, locale, t)}

  <main id="main">
${crumbs}${main}
  </main>

${FOOTER(canonicalPath, locale, t)}
</body>
</html>
`;
}

// Where a localized static page is written, relative to the repository root.
const outputFile = (locale, canonicalPath) => I18N.localizedFile(locale, canonicalPath);

module.exports = { renderStaticPage, outputFile, DEFAULT_OG_IMAGE, absolute };
