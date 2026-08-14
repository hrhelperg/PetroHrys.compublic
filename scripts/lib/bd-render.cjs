// scripts/lib/bd-render.cjs
'use strict';
const { escapeHtml } = require('./bd-util.cjs');
const { renderJsonLd } = require('./bd-seo.cjs');
// Bound per render, not destructured at module load. Destructuring took the
// module's DEFAULT English binding, so every localized page rendered its
// breadcrumb — including the aria-label a screen reader announces — in English
// no matter which locale the page was. The leak detector caught this on all
// 1,248 localized Research pages.
const componentsModule = require('./bd-components.cjs');
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
// ── ANALYTICS, BEHIND THIS SITE'S OWN CONSENT ───────────────────────────────
//
// There was a third-party consent service here. It stopped existing: its script
// answered 403 with CookieYes's own "We can't find the page you are looking
// for", which is the same response a fabricated client id gets — the site key
// was gone, not blocked. Because the WebmasterID tracker was emitted as
// `type="text/plain" data-cookieyes="cookieyes-analytics"`, and only that
// service ever rewrote the type, the tracker never executed. Measured in a real
// browser against production: zero requests for tracker.iife.min.js, zero
// events posted, `type` still text/plain minutes after load.
//
// Google Analytics sat directly beneath it as a plain `<script async>` and ran
// unconditionally. So one analytics tool was gated behind a gate that could
// never open while the other collected regardless.
//
// Both are now gated by js/consent.js, on identical terms. `text/plain` is what
// stops the browser executing them; the data-consent attribute is what the
// consent script looks for. The GA config block is gated too — loading gtag.js
// without its config would fetch the library and measure nothing.
//
// Order is preserved on activation, so gtag.js still precedes the config that
// calls it.
const ANALYTICS = `  <script src="/js/consent.js" defer></script>
  <!-- Analytics below is inert until a visitor accepts. See js/consent.js. -->
  <script id="webmasterid-tracker" type="text/plain" data-consent="analytics" defer src="https://webmasterid.com/tracker.iife.min.js" data-wmid="wm_bktqqtd7heom5nkl" data-endpoint="https://webmasterid-ingest-api.vercel.app/api/events"></script>
  <script type="text/plain" data-consent="analytics" async src="https://www.googletagmanager.com/gtag/js?id=G-4RE6YCJZBD"></script>
  <script type="text/plain" data-consent="analytics">
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
    `<li><a href="${p('/work/')}">${t('shell.nav.work')}</a></li>`,
    `<li><a href="${p('/research/')}" aria-current="true">${escapeHtml(t('nav.researchCenter'))}</a></li>`,
    `<li><a href="${p('/writing/')}">${t('shell.nav.writing')}</a></li>`,
    `<li><a href="${p('/about/')}">${t('shell.nav.about')}</a></li>`,
  ].map((item) => `${indent}${item}`).join('\n');
};

// Semantic destination. A reader on /research/media-pr-publishing/ who clicks
// DE lands on the German version of THAT page, not on the German homepage —
// which is what the shipped switcher did, because it linked locale roots.
const LANGS = (indent, canonicalPath, locale, availableLocales) => I18N.switcherFor(canonicalPath, locale, availableLocales)
  .map((l) => `${indent}<li><a href="${l.href}"${l.current ? ' aria-current="page"' : ''}>${l.label}</a></li>`)
  .join('\n');

const HEADER = (canonicalPath, locale, t, availableLocales) => {
  if (typeof t !== 'function') {
    throw new TypeError(`HEADER requires a translator for locale "${locale}"; refusing to render English into a localized page`);
  }
  return `  <header role="banner">
    <nav aria-label="Primary">
      <a href="/" class="wordmark">Petro Hrys</a>
      <ul class="nav-primary">
${NAV_ITEMS('        ', locale, t)}
      </ul>
      <ul class="nav-lang" aria-label="${escapeHtml(t('nav.language'))}">
${LANGS('        ', canonicalPath, locale, availableLocales)}
      </ul>
      <details class="nav-mobile">
        <summary>${t('shell.menu')}</summary>
        <div class="nav-mobile-panel">
          <ul class="nav-primary">
${NAV_ITEMS('            ', locale, t)}
          </ul>
          <ul class="nav-lang" aria-label="${escapeHtml(t('nav.language'))}">
${LANGS('            ', canonicalPath, locale, availableLocales)}
          </ul>
        </div>
      </details>
    </nav>
  </header>`;
};

// The marketplace dataset is generated by a sibling build with its own manifest,
// so this renderer cannot ask it for a route — but both datasets share this
// footer, and a research collection that nothing links to is a collection nobody
// finds. The path is the one build-marketplaces.cjs writes, and a test asserts
// the two agree so they cannot drift apart silently.

// Product routes are not localized yet — several product pages exist only in
// English. Linking a German reader to /de/fax/ would be a 404, so these stay on
// the canonical route until the page itself has a German twin. The migration
// audit tracks which ones still do.
const PRODUCTS = [
  ['/webmasterid/', 'WebmasterID'], ['/pdf-editor/', 'PDF Editor'], ['/unzip/', 'Unzip'],
  ['/smart-printer/', 'Smart Printer'], ['/invoice-maker/', 'Invoice Maker'],
  ['/pocket-manager/', 'Pocket Manager'], ['/fax/', 'FAX'], ['/twinphone/', 'TwinPhone'],
  ['/esimky/', 'eSIMky'], ['/cv-builder/', 'CV Builder'], ['/tcg-scanner/', 'TCG Scanner'],
];
// Product names are brands, not prose: eSIMky is eSIMky in every language.
const PRODUCT_LINKS = (locale) => PRODUCTS
  .map(([href, name]) => `          <li><a href="${href}">${name}</a></li>`)
  .join('\n');

const MARKETPLACES_PATH = '/research/marketplaces/';
const MEDIA_PATH = '/research/media-pr-publishing/';
const PLANNER_PATH = '/research/distribution-planner/';
const TENDERS_PATH = '/research/tenders-procurement/';

// Every label comes from the dictionary and every internal link is
// locale-prefixed, so a German reader clicking "Datenschutz" reaches /de/privacy/
// rather than being dropped back onto the English site. `t` is required: a
// default of null used to let a caller silently render the whole footer in
// English on a German page.

// The four Research Center collections plus the essay/infrastructure pages.
// Collection labels reuse the collection.* vocabulary the Research Center
// already translates, rather than opening a second set of names for the same
// four datasets.
const RESEARCH_LINKS = (currentPath, locale, t) => {
  const p = (path) => I18N.localizedPath(locale, path);
  const cur = (path) => (currentPath === path ? ' aria-current="page"' : '');
  return [
    ['/essays/', t('shell.footer.essays'), false],
    ['/research/', t('shell.footer.research'), true],
    [routes.hubPath(), t('collection.directories'), true],
    [MARKETPLACES_PATH, t('collection.marketplaces'), true],
    [MEDIA_PATH, t('collection.media'), true],
    [TENDERS_PATH, t('collection.tenders'), true],
    [PLANNER_PATH, t('collection.planner'), true],
    ['/infrastructure/', t('shell.footer.infrastructure'), false],
    ['/ai-systems/', t('shell.footer.aiSystems'), false],
    ['/artificial-intelligence/', t('shell.footer.artificialIntelligence'), false],
  ]
    .map(([href, label, localized]) => `          <li><a href="${localized ? p(href) : href}"${cur(href)}>${label}</a></li>`)
    .join('\n');
};

const FOOTER = (currentPath, locale, t) => {
  // Fail loudly rather than falling back to English. This used to default to
  // `t = null`, which meant a caller that forgot the translator rendered a
  // perfectly valid-looking German page with an entirely English footer — the
  // exact failure that is invisible in review and obvious to a reader.
  if (typeof t !== 'function') {
    throw new TypeError(`FOOTER requires a translator for locale "${locale}"; refusing to render English into a localized page`);
  }
  return `  <footer role="contentinfo">
    <div class="footer-grid">
      <section id="footer-tools">
        <h3>${t('shell.footer.products')}</h3>
        <ul>
${PRODUCT_LINKS(locale)}
        </ul>
      </section>
      <section>
        <h3>${t('shell.footer.researchWriting')}</h3>
        <ul>
${RESEARCH_LINKS(currentPath, locale, t)}
        </ul>
      </section>
      <section>
        <h3>${t('shell.footer.index')}</h3>
        <ul>
          <li><a href="/blog/">${t('shell.footer.blog')}</a></li>
          <li><a href="/articles/">${t('shell.footer.articles')}</a></li>
          <li><a href="/sitemap.xml">${t('shell.footer.sitemap')}</a></li>
        </ul>
      </section>
      <section>
        <h3>${t('shell.footer.legal')}</h3>
        <ul>
          <li><a href="${I18N.localizedPath(locale, '/privacy/')}">${t('shell.footer.privacy')}</a></li>
          <li><a href="${I18N.localizedPath(locale, '/terms/')}">${t('shell.footer.terms')}</a></li>
        </ul>
      </section>
    </div>
    <p class="footer-bottom">${t('shell.footer.rights')}</p>
    <p class="footer-credit"><a href="https://www.webmasterid.com">${t('shell.footer.credit')}</a></p>
  </footer>`;
};

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
// `availableLocales` defaults to every locale, so existing callers are
// untouched. A generator that produces one canonical route per record passes
// ['en'] and gets neither a phantom hreflang cluster nor a switcher pointing
// at pages that do not exist.
// `scripts` are EXTRA client modules for this page only, appended after the
// shared block. It defaults to none, so every existing caller is untouched. The
// alternative — adding a page's module to the shared block — is what this
// parameter exists to avoid: 23,628 generated pages carry that block, and the
// Distribution Planner's engine alone is 61 KB.
function renderPage({ meta, main, locale = I18N.DEFAULT_LOCALE, availableLocales = null,
  scripts = [] }) {
  const L = I18N.LOCALE_BY_CODE.get(locale);
  if (!L) throw new Error(`renderPage: unknown locale "${locale}"`);
  const t = I18N.translator(locale);
  // The canonical path of the ENGLISH page. Every locale's canonical, hreflang
  // cluster and switcher are derived from it, which is what makes the cluster
  // reciprocal by construction rather than by discipline.
  const canonicalPath = meta.canonicalPath;
  const selfPath = I18N.localizedPath(locale, canonicalPath);
  if (availableLocales && !availableLocales.includes(locale)) {
    throw new Error(`renderPage: rendering "${locale}" but it is not in availableLocales`);
  }
  const alternates = I18N.hreflangCluster(canonicalPath, (p) => `${ORIGIN}${p}`, availableLocales)
    .map((a) => `\n  <link rel="alternate" hreflang="${a.hreflang}" href="${a.href}">`).join('');
  const robotsTag = meta.robots
    ? `\n  <meta name="robots" content="${escapeHtml(meta.robots)}">`
    : '';

  const social = [
    metaTag('og:title', meta.openGraph.title),
    metaTag('og:description', meta.openGraph.description),
    // og:url must be the SELF URL, not the English one.
    //
    // meta.openGraph.url comes from the SEO builder, which is locale-independent
    // and therefore always English. Emitting it unchanged meant 1,248 localized
    // pages declared a canonical <link> pointing at themselves and an og:url
    // pointing at the English page — two contradicting canonical signals on the
    // same document. Google treats og:url as a canonical hint, so a German page
    // was effectively telling it "I am really the English page", which is
    // precisely the "Alternate page with proper canonical tag" classification.
    //
    // Derived from selfPath, the same value the canonical link uses, so the two
    // cannot disagree again.
    metaTag('og:url', `${ORIGIN}${selfPath}`),
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
  <a class="skip" href="#main">${t('shell.skip')}</a>
${eco.bodyBlock ? eco.bodyBlock(L.htmlLang) : ECO_BODY}

${HEADER(canonicalPath, locale, t, availableLocales)}

  <main id="main">
${componentsModule.components(locale).breadcrumbs(localizeTrail(meta.breadcrumbTrail, locale, t))}

${main}
  </main>

${FOOTER(selfPath, locale, t)}
  <script src="/js/bd-order.js" defer></script>
  <script src="/js/bd-discovery.js" defer></script>
  <script src="/js/business-directories.js" defer></script>${scripts
  .map((src) => `\n  <script src="${escapeHtml(src)}" defer></script>`).join('')}
</body>
</html>
`;
}

// ANALYTICS and FONTS are exported so page-shell.cjs can assemble static pages
// from the SAME constants rather than keeping a second copy of the tracking
// snippet that drifts the first time one of them is updated.
module.exports = {
  renderPage, HEADER, FOOTER, ANALYTICS, FONTS, ECO_HEAD, ECO_BODY,
  MARKETPLACES_PATH, MEDIA_PATH, PLANNER_PATH, TENDERS_PATH,
};
