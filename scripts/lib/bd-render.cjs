// scripts/lib/bd-render.cjs
'use strict';
const { escapeHtml } = require('./bd-util.cjs');
const { renderJsonLd } = require('./bd-seo.cjs');
const { breadcrumbs } = require('./bd-components.cjs');
const routes = require('./bd-routes.cjs');
const I18N = require('./i18n.cjs');
// Reuse the ecosystem injector's own localized banner rather than emitting a
// second English copy. Two modules rendering the same banner from different
// strings is how a build and its post-processor end up rewriting each other on
// every run.
const eco = require('../inject-ecosystem-banner.cjs');
// The canonical host comes from bd-seo, which is its single source. Hard-coding
// it here is what let the sitemap and RSS links drift onto a redirecting host.
const { ORIGIN } = require('./bd-seo.cjs');

// Copied verbatim from the existing editorial pages so the new section is
// byte-comparable with the rest of the site. The msvalidate.01 meta is
// deliberately omitted: on existing pages it still holds an unfilled
// PASTE_YOUR_... placeholder, and replicating that would be a defect.
const ANALYTICS = `  <script id="cookieyes" type="text/javascript" src="https://cdn-cookieyes.com/client_data/af075fab2c66644b181224ee/script.js"></script>
  <!-- WebmasterID analytics — consent-gated via CookieYes (analytics category); fires only after consent -->
  <script id="webmasterid-tracker" type="text/plain" data-cookieyes="cookieyes-analytics" defer src="https://webmasterid.com/tracker.iife.min.js" data-wmid="wm_bktqqtd7heom5nkl" data-endpoint="https://webmasterid-ingest-api.vercel.app/api/events"></script>
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-4RE6YCJZBD"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-4RE6YCJZBD');
  </script>`;

const FONTS = `  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&family=JetBrains+Mono:wght@500&family=Source+Serif+4:opsz,wght@8..60,400;8..60,500&display=swap" rel="stylesheet">`;

const ECO_HEAD = `<!-- helperg-eco:head:start -->
  <link rel="stylesheet" href="/css/ecosystem-banner.css">
  <script src="/js/ecosystem-registry.js" defer></script>
  <script src="/js/ecosystem-config.js" defer></script>
  <script src="/js/ecosystem-banner.js" defer></script>
<!-- helperg-eco:head:end -->`;

const ECO_BODY = `<!-- helperg-eco:body:start -->
<nav class="helperg-eco" aria-label="HELPERG Ecosystem" data-helperg-eco>
  <div class="eco-bar">
    <a class="eco-brand" href="https://helperg.com">
      <span class="eco-brand-mark" aria-hidden="true"></span>
      <span class="eco-brand-text">HELPERG Ecosystem</span>
    </a>
    <ul class="eco-timeline">
        <li><a class="eco-item" href="https://helperg.com">HELPERG</a></li>
        <li><a class="eco-item eco-item--self" href="/" aria-current="page">Petro Hrys<span class="eco-vh"> — Current site</span></a></li>
        <li><a class="eco-item" href="https://www.webmasterid.com">WebmasterID</a></li>
        <li><a class="eco-item" href="https://www.cashworkspace.com">Cash Workspace</a></li>
        <li><a class="eco-item" href="https://geobusinessiq.com">GeoBusinessIQ</a></li>
        <li><a class="eco-item" href="https://globalcityintelligence.com">Global City Intelligence</a></li>
    </ul>
    <a class="eco-explore" href="https://helperg.com">Explore all products</a>
  </div>
</nav>
<!-- helperg-eco:body:end -->`;

// Existing items are reproduced exactly; Research Center is the single addition.
// It carries aria-current="true" rather than "page": generated pages live inside
// the Research Center section but are never /research/ itself, and "page" would
// claim this link points at the document you are reading.
// Nav items are locale-prefixed so a German reader never leaves the German
// site by clicking a header link.
const NAV_ITEMS = (indent, locale, t) => {
  const p = (path) => I18N.localizedPath(locale, path);
  return [
    `<li><a href="${p('/work/')}">Work</a></li>`,
    `<li><a href="${p('/research/')}" aria-current="true">${escapeHtml(t('nav.researchCenter'))}</a></li>`,
    '<li><a href="/writing/">Research &amp; Writing</a></li>',
    '<li><a href="/about/">About</a></li>',
  ].map((item) => `${indent}${item}`).join('\n');
};

// Semantic destination. A reader on /research/media-pr-publishing/ who clicks
// DE lands on the German version of THAT page, not on the German homepage —
// which is what the shipped switcher did, because it linked locale roots.
const LANGS = (indent, canonicalPath, locale) => I18N.switcherFor(canonicalPath, locale)
  .map((l) => `${indent}<li><a href="${l.href}"${l.current ? ' aria-current="page"' : ''}>${l.label}</a></li>`)
  .join('\n');

const HEADER = (canonicalPath, locale, t) => `  <header role="banner">
    <nav aria-label="Primary">
      <a href="/" class="wordmark">Petro Hrys</a>
      <ul class="nav-primary">
${NAV_ITEMS('        ', locale, t)}
      </ul>
      <ul class="nav-lang" aria-label="${escapeHtml(t('nav.language'))}">
${LANGS('        ', canonicalPath, locale)}
      </ul>
      <details class="nav-mobile">
        <summary>Menu</summary>
        <div class="nav-mobile-panel">
          <ul class="nav-primary">
${NAV_ITEMS('            ', locale, t)}
          </ul>
          <ul class="nav-lang" aria-label="${escapeHtml(t('nav.language'))}">
${LANGS('            ', canonicalPath, locale)}
          </ul>
        </div>
      </details>
    </nav>
  </header>`;

// The marketplace dataset is generated by a sibling build with its own manifest,
// so this renderer cannot ask it for a route — but both datasets share this
// footer, and a research collection that nothing links to is a collection nobody
// finds. The path is the one build-marketplaces.cjs writes, and a test asserts
// the two agree so they cannot drift apart silently.
const MARKETPLACES_PATH = '/research/marketplaces/';
const MEDIA_PATH = '/research/media-pr-publishing/';
const PLANNER_PATH = '/research/distribution-planner/';

const FOOTER = (currentPath, locale = 'en', t = null) => `  <footer role="contentinfo">
    <div class="footer-grid">
      <section id="footer-tools">
        <h3>Products</h3>
        <ul>
          <li><a href="/webmasterid/">WebmasterID</a></li>
          <li><a href="/pdf-editor/">PDF Editor</a></li>
          <li><a href="/unzip/">Unzip</a></li>
          <li><a href="/smart-printer/">Smart Printer</a></li>
          <li><a href="/invoice-maker/">Invoice Maker</a></li>
          <li><a href="/pocket-manager/">Pocket Manager</a></li>
          <li><a href="/fax/">FAX</a></li>
          <li><a href="/twinphone/">TwinPhone</a></li>
          <li><a href="/cv-builder/">CV Builder</a></li>
          <li><a href="/tcg-scanner/">TCG Scanner</a></li>
        </ul>
      </section>
      <section>
        <h3>Research &amp; Writing</h3>
        <ul>
          <li><a href="/essays/">Essays</a></li>
          <li><a href="/research/">Research</a></li>
          <li><a href="${routes.hubPath()}"${currentPath === routes.hubPath() ? ' aria-current="page"' : ''}>Business Directories</a></li>
          <li><a href="${MARKETPLACES_PATH}"${currentPath === MARKETPLACES_PATH ? ' aria-current="page"' : ''}>Marketplaces</a></li>
          <li><a href="${MEDIA_PATH}"${currentPath === MEDIA_PATH ? ' aria-current="page"' : ''}>Media &amp; PR</a></li>
          <li><a href="${PLANNER_PATH}"${currentPath === PLANNER_PATH ? ' aria-current="page"' : ''}>Distribution Planner</a></li>
          <li><a href="/infrastructure/">Infrastructure</a></li>
          <li><a href="/ai-systems/">AI Systems</a></li>
          <li><a href="/artificial-intelligence/">Artificial Intelligence</a></li>
        </ul>
      </section>
      <section>
        <h3>Index</h3>
        <ul>
          <li><a href="/blog/">Blog</a></li>
          <li><a href="/articles/">Articles</a></li>
          <li><a href="/sitemap.xml">Sitemap</a></li>
        </ul>
      </section>
      <section>
        <h3>Legal</h3>
        <ul>
          <li><a href="/privacy/">Privacy</a></li>
          <li><a href="/terms/">Terms</a></li>
        </ul>
      </section>
    </div>
    <p class="footer-bottom">&copy; 2026 Petro Hrys</p>
  </footer>`;

// The RSS alternate belongs to the Business Directories collection and to
// nothing else. It used to be emitted unconditionally, so the Marketplace page
// — and now the Media page — declared a business-directory feed as its own
// alternate: a page telling a reader and a feed reader that updates to it
// arrive somewhere they do not. Emitted only for pages inside that collection.
function feedLink(meta) {
  const path = typeof meta.canonicalPath === 'string' ? meta.canonicalPath : '';
  if (!path.startsWith(routes.BASE)) return '';
  return `\n  <link rel="alternate" type="application/rss+xml" title="Business Directories — Petro Hrys" href="${ORIGIN}${routes.feedPath()}">`;
}

// Breadcrumb labels are translated; the paths are localized so a German reader
// clicking "Startseite" stays on the German site. The trail itself remains the
// canonical one — this only changes what the reader sees and where the crumb
// points, never which page the trail describes.
const CRUMB_KEYS = {
  Home: 'nav.home',
  Research: 'nav.researchCenter',
  'Media, PR & Publishing': 'collection.media',
  'Business Directories': 'collection.directories',
  Marketplaces: 'collection.marketplaces',
  'Distribution Planner': 'collection.planner',
};
function localizeTrail(trail, locale, t) {
  if (!Array.isArray(trail)) return trail;
  return trail.map((entry) => {
    const key = CRUMB_KEYS[entry.name];
    return {
      ...entry,
      name: key && t.has(key) ? t(key) : entry.name,
      path: entry.path && entry.path.startsWith('/')
        ? I18N.localizedPath(locale, entry.path) : entry.path,
    };
  });
}

function metaTag(property, content, kind = 'property') {
  return `  <meta ${kind}="${escapeHtml(property)}" content="${escapeHtml(content)}">`;
}

// Takes a builder result from bd-seo verbatim, so indexability, canonical, and
// structured data are decided in exactly one place.
function renderPage({ meta, main, locale = I18N.DEFAULT_LOCALE }) {
  const L = I18N.LOCALE_BY_CODE.get(locale);
  if (!L) throw new Error(`renderPage: unknown locale "${locale}"`);
  const t = I18N.translator(locale);
  // The canonical path of the ENGLISH page. Every locale's canonical, hreflang
  // cluster and switcher are derived from it, which is what makes the cluster
  // reciprocal by construction rather than by discipline.
  const canonicalPath = meta.canonicalPath;
  const selfPath = I18N.localizedPath(locale, canonicalPath);
  const alternates = I18N.hreflangCluster(canonicalPath, (p) => `${ORIGIN}${p}`)
    .map((a) => `\n  <link rel="alternate" hreflang="${a.hreflang}" href="${a.href}">`).join('');
  const robotsTag = meta.robots
    ? `\n  <meta name="robots" content="${escapeHtml(meta.robots)}">`
    : '';

  const social = [
    metaTag('og:title', meta.openGraph.title),
    metaTag('og:description', meta.openGraph.description),
    metaTag('og:url', meta.openGraph.url),
    metaTag('og:type', meta.openGraph.type),
    metaTag('og:locale', L.ogLocale),
    metaTag('og:site_name', meta.openGraph.siteName),
    metaTag('og:image', meta.openGraph.image),
    metaTag('twitter:card', meta.twitter.card, 'name'),
    metaTag('twitter:site', meta.twitter.site, 'name'),
    metaTag('twitter:title', meta.twitter.title, 'name'),
    metaTag('twitter:description', meta.twitter.description, 'name'),
    metaTag('twitter:image', meta.twitter.image, 'name'),
  ].join('\n');

  return `<!DOCTYPE html>
<html lang="${L.htmlLang}">
<head>
  <meta charset="UTF-8">
${ANALYTICS}
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>${escapeHtml(meta.fullTitle)}</title>
  <meta name="description" content="${escapeHtml(meta.description)}">${robotsTag}

${social}

  <link rel="canonical" href="${ORIGIN}${selfPath}">${alternates}
  <link rel="sitemap" type="application/xml" href="${ORIGIN}/sitemap.xml">${feedLink(meta)}
  <link rel="icon" href="/images/logo-red.svg">

${FONTS}
  <link rel="stylesheet" href="/css/petrohrys.css">
  <link rel="stylesheet" href="/css/business-directories.css">

${renderJsonLd(meta.jsonLd)}
${ECO_HEAD}
</head>
<body>
  <a class="skip" href="#main">Skip to content</a>
${eco.bodyBlock ? eco.bodyBlock(L.htmlLang) : ECO_BODY}

${HEADER(canonicalPath, locale, t)}

  <main id="main">
${breadcrumbs(localizeTrail(meta.breadcrumbTrail, locale, t))}

${main}
  </main>

${FOOTER(selfPath, locale, t)}
  <script src="/js/bd-order.js" defer></script>
  <script src="/js/business-directories.js" defer></script>
</body>
</html>
`;
}

module.exports = { renderPage, HEADER, FOOTER, ECO_HEAD, ECO_BODY, MARKETPLACES_PATH, MEDIA_PATH, PLANNER_PATH };
