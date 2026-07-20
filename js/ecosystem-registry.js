/*!
 * HELPERG Ecosystem — Centralized Product Registry (portable core)
 * ------------------------------------------------------------------
 * Single, site-agnostic source of truth for the global ecosystem banner.
 * Contains NO site-specific selectors or "current site" identity — that
 * lives in the per-site ecosystem-config.js. This file is safe to reuse
 * verbatim across every HELPERG property.
 *
 * The banner renderer (js/ecosystem-banner.js) and the integrity/coverage
 * validator (scripts/validate-ecosystem-registry.cjs) both read from here.
 *
 * Honesty rules baked into the data (do not "fix" by inventing links):
 *   - A platform is rendered as a real link ONLY when its status is
 *     "available" AND it has a non-empty URL. Everything else renders as
 *     a muted, non-interactive status with accessible text.
 *   - CV Resume ships iOS only; its Android URL is null / "unavailable".
 *   - Do not invent app URLs for products that only have a website.
 *
 * Status values : available | coming-soon | unavailable | unknown
 * Type values   : ecosystem | platform | publication | application | personal
 * Group values  : platforms | knowledge | ecosystem | applications
 *
 * Display controls (independent booleans + numeric ordering):
 *   featured           stronger treatment in expanded surfaces
 *   showInTimeline     may appear in the permanently visible desktop timeline
 *   showInAllProducts  appears in the expanded complete product panel
 *   showInSearch       included in local search results
 *   displayPriority    numeric ordering (lower first)
 * These are NORMALIZED with deterministic defaults so a missing value can
 * never produce inconsistent behavior.
 *
 * Works in the browser (window.HELPERG_ECOSYSTEM) and in Node
 * (module.exports) so the validator/injector can require() it directly.
 */
;(function (root, factory) {
  'use strict';
  var data = factory();
  if (root) { root.HELPERG_ECOSYSTEM = data; }
  if (typeof module !== 'undefined' && module.exports) { module.exports = data; }
})(typeof globalThis !== 'undefined' ? globalThis
   : (typeof self !== 'undefined' ? self
   : (typeof window !== 'undefined' ? window : this)),
function () {
  'use strict';

  /* Raw product records. URLs and statuses are transcribed verbatim from
     the approved brief — do not silently alter. */
  var rawProducts = [
    /* ============ Ecosystem ============ */
    {
      id: 'helperg', name: 'HELPERG', type: 'ecosystem', group: 'ecosystem',
      websiteUrl: 'https://helperg.com', webAppUrl: null, iosUrl: null, androidUrl: null,
      websiteStatus: 'available', webAppStatus: 'unavailable', iosStatus: 'coming-soon', androidStatus: 'coming-soon',
      featured: true, showInTimeline: true, showInAllProducts: true, showInSearch: true, displayPriority: 1,
      currentSiteDomains: ['helperg.com', 'www.helperg.com'],
      shortDescription: 'The HELPERG product ecosystem hub.'
    },
    {
      id: 'petrohrys', name: 'Petro Hrys', type: 'personal', group: 'ecosystem',
      websiteUrl: 'https://petrohrys.com', webAppUrl: null, iosUrl: null, androidUrl: null,
      websiteStatus: 'available', webAppStatus: 'unavailable', iosStatus: 'coming-soon', androidStatus: 'coming-soon',
      featured: true, showInTimeline: true, showInAllProducts: true, showInSearch: true, displayPriority: 2,
      currentSiteDomains: ['petrohrys.com', 'www.petrohrys.com'],
      shortDescription: 'Independent research & building practice.'
    },

    /* ============ Platforms & tools ============ */
    {
      id: 'webmasterid', name: 'WebmasterID', type: 'platform', group: 'platforms',
      websiteUrl: 'https://www.webmasterid.com', webAppUrl: 'https://www.webmasterid.com', iosUrl: null, androidUrl: null,
      websiteStatus: 'available', webAppStatus: 'available', iosStatus: 'coming-soon', androidStatus: 'coming-soon',
      featured: true, showInTimeline: true, showInAllProducts: true, showInSearch: true, displayPriority: 3,
      currentSiteDomains: ['webmasterid.com', 'www.webmasterid.com'],
      shortDescription: 'Privacy-first web analytics.'
    },
    {
      /* Cash Workspace: the public marketing website is LIVE and clickable.
         This does NOT imply the separate authenticated web app is live —
         webApp stays coming-soon with no invented URL. */
      id: 'cashworkspace', name: 'Cash Workspace', type: 'platform', group: 'platforms',
      websiteUrl: 'https://www.cashworkspace.com', webAppUrl: null, iosUrl: null, androidUrl: null,
      websiteStatus: 'available', webAppStatus: 'coming-soon', iosStatus: 'coming-soon', androidStatus: 'coming-soon',
      featured: true, showInTimeline: true, showInAllProducts: true, showInSearch: true, displayPriority: 4,
      currentSiteDomains: ['cashworkspace.com', 'www.cashworkspace.com'],
      shortDescription: 'Cash management workspace.'
    },
    {
      id: 'geobusinessiq', name: 'GeoBusinessIQ', type: 'platform', group: 'platforms',
      websiteUrl: 'https://geobusinessiq.com', webAppUrl: 'https://geobusinessiq.com', iosUrl: null, androidUrl: null,
      websiteStatus: 'available', webAppStatus: 'available', iosStatus: 'coming-soon', androidStatus: 'coming-soon',
      featured: true, showInTimeline: true, showInAllProducts: true, showInSearch: true, displayPriority: 5,
      currentSiteDomains: ['geobusinessiq.com', 'www.geobusinessiq.com'],
      shortDescription: 'Business & market intelligence.'
    },
    {
      id: 'talentpartnerid', name: 'TalentPartnerID', type: 'platform', group: 'platforms',
      websiteUrl: 'https://talentpartnerid.com', webAppUrl: null, iosUrl: null, androidUrl: null,
      websiteStatus: 'available', webAppStatus: 'unavailable', iosStatus: 'coming-soon', androidStatus: 'coming-soon',
      featured: false, showInTimeline: false, showInAllProducts: true, showInSearch: true, displayPriority: 20,
      currentSiteDomains: ['talentpartnerid.com', 'www.talentpartnerid.com'],
      shortDescription: 'Recruitment & talent partner network.'
    },
    {
      id: 'hrhelperg', name: 'HRHelperG', type: 'platform', group: 'platforms',
      websiteUrl: 'https://hrhelperg.com', webAppUrl: null, iosUrl: null, androidUrl: null,
      websiteStatus: 'available', webAppStatus: 'unavailable', iosStatus: 'coming-soon', androidStatus: 'coming-soon',
      featured: false, showInTimeline: false, showInAllProducts: true, showInSearch: true, displayPriority: 21,
      currentSiteDomains: ['hrhelperg.com', 'www.hrhelperg.com'],
      shortDescription: 'HR platform & knowledge base.'
    },
    {
      id: 'twinphone', name: 'Twin Phone', type: 'platform', group: 'platforms',
      websiteUrl: 'https://twin-phone.com', webAppUrl: 'https://twin-phone.com', iosUrl: null, androidUrl: null,
      websiteStatus: 'available', webAppStatus: 'available', iosStatus: 'coming-soon', androidStatus: 'coming-soon',
      featured: false, showInTimeline: false, showInAllProducts: true, showInSearch: true, displayPriority: 22,
      currentSiteDomains: ['twin-phone.com', 'www.twin-phone.com'],
      shortDescription: 'Second-number calling & messaging.'
    },
    {
      /* eSIMky: only the public website is verified. A separate browser-based
         web app is NOT independently verified, so webApp is "unknown" with no
         URL — do NOT reuse the website URL as the web-app URL. */
      id: 'esimky', name: 'eSIMky', type: 'platform', group: 'platforms',
      websiteUrl: 'https://esimky.com', webAppUrl: null, iosUrl: null, androidUrl: null,
      websiteStatus: 'available', webAppStatus: 'unknown', iosStatus: 'unavailable', androidStatus: 'unavailable',
      featured: false, showInTimeline: false, showInAllProducts: true, showInSearch: true, displayPriority: 23,
      currentSiteDomains: ['esimky.com', 'www.esimky.com'],
      shortDescription: 'eSIM connectivity service.'
    },
    {
      id: 'socialsporthub', name: 'SocialSportHub', type: 'platform', group: 'platforms',
      websiteUrl: 'https://socialsporthub.com', webAppUrl: 'https://socialsporthub.com', iosUrl: null, androidUrl: null,
      websiteStatus: 'available', webAppStatus: 'available', iosStatus: 'coming-soon', androidStatus: 'coming-soon',
      featured: false, showInTimeline: false, showInAllProducts: true, showInSearch: true, displayPriority: 24,
      currentSiteDomains: ['socialsporthub.com', 'www.socialsporthub.com'],
      shortDescription: 'Social hub for sport communities.'
    },

    /* ============ Knowledge & intelligence ============ */
    {
      id: 'globalcityintelligence', name: 'Global City Intelligence', type: 'platform', group: 'knowledge',
      websiteUrl: 'https://globalcityintelligence.com', webAppUrl: 'https://globalcityintelligence.com', iosUrl: null, androidUrl: null,
      websiteStatus: 'available', webAppStatus: 'available', iosStatus: 'coming-soon', androidStatus: 'coming-soon',
      featured: true, showInTimeline: true, showInAllProducts: true, showInSearch: true, displayPriority: 6,
      currentSiteDomains: ['globalcityintelligence.com', 'www.globalcityintelligence.com'],
      shortDescription: 'City-level data & intelligence.'
    },
    {
      id: 'agricultureid', name: 'AgricultureID', type: 'publication', group: 'knowledge',
      websiteUrl: 'https://agricultureid.com', webAppUrl: null, iosUrl: null, androidUrl: null,
      websiteStatus: 'available', webAppStatus: 'unavailable', iosStatus: 'coming-soon', androidStatus: 'coming-soon',
      featured: false, showInTimeline: false, showInAllProducts: true, showInSearch: true, displayPriority: 30,
      currentSiteDomains: ['agricultureid.com', 'www.agricultureid.com'],
      shortDescription: 'Agriculture knowledge & intelligence.'
    },
    {
      id: 'asteriastar', name: 'AsteriaStar', type: 'publication', group: 'knowledge',
      websiteUrl: 'https://asteriastar.com', webAppUrl: null, iosUrl: null, androidUrl: null,
      websiteStatus: 'available', webAppStatus: 'unavailable', iosStatus: 'coming-soon', androidStatus: 'coming-soon',
      featured: false, showInTimeline: false, showInAllProducts: true, showInSearch: true, displayPriority: 31,
      currentSiteDomains: ['asteriastar.com', 'www.asteriastar.com'],
      shortDescription: 'Astronomy & space knowledge.'
    },
    {
      id: 'faunahub', name: 'FaunaHub', type: 'publication', group: 'knowledge',
      websiteUrl: 'https://faunahub.com', webAppUrl: null, iosUrl: null, androidUrl: null,
      websiteStatus: 'available', webAppStatus: 'unavailable', iosStatus: 'coming-soon', androidStatus: 'coming-soon',
      featured: false, showInTimeline: false, showInAllProducts: true, showInSearch: true, displayPriority: 32,
      currentSiteDomains: ['faunahub.com', 'www.faunahub.com'],
      shortDescription: 'Wildlife & fauna knowledge.'
    },
    {
      id: 'builddesignhub', name: 'BuildDesignHub', type: 'publication', group: 'knowledge',
      websiteUrl: 'https://builddesignhub.com', webAppUrl: null, iosUrl: null, androidUrl: null,
      websiteStatus: 'available', webAppStatus: 'unavailable', iosStatus: 'coming-soon', androidStatus: 'coming-soon',
      featured: false, showInTimeline: false, showInAllProducts: true, showInSearch: true, displayPriority: 33,
      currentSiteDomains: ['builddesignhub.com', 'www.builddesignhub.com'],
      shortDescription: 'Building & design knowledge.'
    },
    {
      id: 'printerarchive', name: 'PrinterArchive', type: 'publication', group: 'knowledge',
      websiteUrl: 'https://printerarchive.net', webAppUrl: null, iosUrl: null, androidUrl: null,
      websiteStatus: 'available', webAppStatus: 'unavailable', iosStatus: 'coming-soon', androidStatus: 'coming-soon',
      featured: false, showInTimeline: false, showInAllProducts: true, showInSearch: true, displayPriority: 34,
      currentSiteDomains: ['printerarchive.net', 'www.printerarchive.net'],
      shortDescription: 'Printing technology encyclopedia.'
    },
    {
      id: 'virtueandpower', name: 'Virtue & Power', type: 'publication', group: 'knowledge',
      websiteUrl: 'https://virtueandpower.com', webAppUrl: null, iosUrl: null, androidUrl: null,
      websiteStatus: 'available', webAppStatus: 'unavailable', iosStatus: 'coming-soon', androidStatus: 'coming-soon',
      featured: false, showInTimeline: false, showInAllProducts: true, showInSearch: true, displayPriority: 35,
      currentSiteDomains: ['virtueandpower.com', 'www.virtueandpower.com'],
      shortDescription: 'Ideas on virtue, power & society.'
    },

    /* ============ Applications (mobile) ============ *
     * No standalone website URLs. `detailUrl` points at a verified existing
     * internal product page reused as a product-detail landing (existing URLs
     * preserved; store links kept). detailUrl is host-relative and only
     * meaningful on PetroHrys.com; other sites can ignore it. */
    {
      id: 'zip', name: 'ZIP', type: 'application', group: 'applications',
      websiteUrl: null, webAppUrl: null, detailUrl: '/unzip/',
      iosUrl: 'https://apps.apple.com/app/id6753772583',
      androidUrl: 'https://play.google.com/store/apps/details?id=com.ziparchivator.zip&pcampaignid=web_share',
      websiteStatus: 'unavailable', webAppStatus: 'unavailable', iosStatus: 'available', androidStatus: 'available',
      featured: false, showInTimeline: false, showInAllProducts: true, showInSearch: true, displayPriority: 40,
      currentSiteDomains: [], shortDescription: 'Extract RAR, ZIP, 7z on iPhone & Android.'
    },
    {
      id: 'printer', name: 'Printer', type: 'application', group: 'applications',
      websiteUrl: null, webAppUrl: null, detailUrl: '/smart-printer/',
      iosUrl: 'https://apps.apple.com/app/id6746067890',
      androidUrl: 'https://play.google.com/store/apps/details?id=com.helperg.smart.printer',
      websiteStatus: 'unavailable', webAppStatus: 'unavailable', iosStatus: 'available', androidStatus: 'available',
      featured: false, showInTimeline: false, showInAllProducts: true, showInSearch: true, displayPriority: 41,
      currentSiteDomains: [], shortDescription: 'Wireless printing from your phone.'
    },
    {
      id: 'fax', name: 'Fax', type: 'application', group: 'applications',
      websiteUrl: null, webAppUrl: null, detailUrl: '/fax/',
      iosUrl: 'https://apps.apple.com/app/id6760895885',
      androidUrl: 'https://play.google.com/store/apps/details?id=com.helperg.fax.app&pcampaignid=web_share',
      websiteStatus: 'unavailable', webAppStatus: 'unavailable', iosStatus: 'available', androidStatus: 'available',
      featured: false, showInTimeline: false, showInAllProducts: true, showInSearch: true, displayPriority: 42,
      currentSiteDomains: [], shortDescription: 'Send & receive fax from your phone.'
    },
    {
      id: 'pdfeditor', name: 'PDF Editor', type: 'application', group: 'applications',
      websiteUrl: null, webAppUrl: null, detailUrl: '/pdf-editor/',
      iosUrl: 'https://apps.apple.com/app/id6747341672',
      androidUrl: 'https://play.google.com/store/apps/details?id=com.helperg.editor.documents&pcampaignid=web_share',
      websiteStatus: 'unavailable', webAppStatus: 'unavailable', iosStatus: 'available', androidStatus: 'available',
      featured: false, showInTimeline: false, showInAllProducts: true, showInSearch: true, displayPriority: 43,
      currentSiteDomains: [], shortDescription: 'Scan, convert, sign & edit PDFs.'
    },
    {
      id: 'cvresume', name: 'CV Resume', type: 'application', group: 'applications',
      websiteUrl: null, webAppUrl: null, detailUrl: '/cv-builder/',
      iosUrl: 'https://apps.apple.com/app/id6745150815', androidUrl: null,
      websiteStatus: 'unavailable', webAppStatus: 'unavailable', iosStatus: 'available', androidStatus: 'unavailable',
      featured: false, showInTimeline: false, showInAllProducts: true, showInSearch: true, displayPriority: 44,
      currentSiteDomains: [], shortDescription: 'ATS-ready resumes on iPhone.'
    },
    {
      id: 'invoicemaker', name: 'Invoice Maker', type: 'application', group: 'applications',
      websiteUrl: null, webAppUrl: null, detailUrl: '/invoice-maker/',
      iosUrl: 'https://apps.apple.com/app/id6747311276',
      androidUrl: 'https://play.google.com/store/apps/details?id=com.helperg.invoicer',
      websiteStatus: 'unavailable', webAppStatus: 'unavailable', iosStatus: 'available', androidStatus: 'available',
      featured: false, showInTimeline: false, showInAllProducts: true, showInSearch: true, displayPriority: 45,
      currentSiteDomains: [], shortDescription: 'Professional invoices in a minute.'
    },
    {
      id: 'pocketmanager', name: 'Pocket Manager', type: 'application', group: 'applications',
      websiteUrl: null, webAppUrl: null, detailUrl: '/pocket-manager/',
      iosUrl: 'https://apps.apple.com/app/id6743084126',
      androidUrl: 'https://play.google.com/store/apps/details?id=com.helperg.money',
      websiteStatus: 'unavailable', webAppStatus: 'unavailable', iosStatus: 'available', androidStatus: 'available',
      featured: false, showInTimeline: false, showInAllProducts: true, showInSearch: true, displayPriority: 46,
      currentSiteDomains: [], shortDescription: 'Privacy-first budget & expenses.'
    }
  ];

  /* --------------------------------------------------------------- *
   * Normalization — deterministic defaults so a missing display flag *
   * can never produce inconsistent behavior.                         *
   * --------------------------------------------------------------- */
  function bool(v, dflt) { return typeof v === 'boolean' ? v : dflt; }
  function normalizeProduct(p) {
    return {
      id: p.id, name: p.name, type: p.type, group: p.group,
      websiteUrl: p.websiteUrl != null ? p.websiteUrl : null,
      webAppUrl: p.webAppUrl != null ? p.webAppUrl : null,
      iosUrl: p.iosUrl != null ? p.iosUrl : null,
      androidUrl: p.androidUrl != null ? p.androidUrl : null,
      detailUrl: p.detailUrl != null ? p.detailUrl : null,
      websiteStatus: p.websiteStatus || 'unknown',
      webAppStatus: p.webAppStatus || 'unknown',
      iosStatus: p.iosStatus || 'unknown',
      androidStatus: p.androidStatus || 'unknown',
      featured: bool(p.featured, false),
      showInTimeline: bool(p.showInTimeline, false),
      showInAllProducts: bool(p.showInAllProducts, true),
      showInSearch: bool(p.showInSearch, true),
      displayPriority: typeof p.displayPriority === 'number' ? p.displayPriority : 999,
      currentSiteDomains: Array.isArray(p.currentSiteDomains) ? p.currentSiteDomains : [],
      shortDescription: p.shortDescription || ''
    };
  }
  var products = rawProducts.map(normalizeProduct);

  /* --------------------------------------------------------------- *
   * Portable current-site detection (no site-specific selectors).    *
   * --------------------------------------------------------------- */
  function normalizeHost(h) {
    h = String(h == null ? '' : h).trim().toLowerCase();
    h = h.replace(/^[a-z][a-z0-9+.-]*:\/\//, ''); // strip protocol
    h = h.replace(/[/?#].*$/, '');                // strip path / query / hash
    h = h.replace(/:\d+$/, '');                   // strip port
    h = h.replace(/\.$/, '');                     // strip trailing dot
    h = h.replace(/^www\./, '');                  // strip leading www.
    return h;
  }
  // EXACT match after normalization — never partial/substring matching.
  function productIdForHost(host) {
    var n = normalizeHost(host);
    if (!n) return null;
    for (var i = 0; i < products.length; i++) {
      var doms = products[i].currentSiteDomains || [];
      for (var j = 0; j < doms.length; j++) {
        if (normalizeHost(doms[j]) === n) return products[i].id;
      }
    }
    return null;
  }

  /* Panel groups (render order + localized headings). */
  var groups = [
    { id: 'platforms',    labelKey: 'groupPlatforms' },
    { id: 'knowledge',    labelKey: 'groupKnowledge' },
    { id: 'ecosystem',    labelKey: 'groupEcosystem' },
    { id: 'applications', labelKey: 'groupApplications' }
  ];

  /* Curated, compact desktop timeline (ids, in visible order). Every id here
     MUST have showInTimeline:true (asserted by the validator). */
  var timeline = [
    'helperg', 'petrohrys', 'webmasterid',
    'cashworkspace', 'geobusinessiq', 'globalcityintelligence'
  ];

  /* Default ecosystem hub (a site config may override via ecosystemHomeUrl). */
  var hubUrl = 'https://helperg.com';

  /* -------------------------------------------------------------- *
   * Localized interface labels. Brand & product names are NEVER     *
   * translated. iOS / Android / App Store / Google Play unchanged.  *
   * {name} is interpolated at render time.                          *
   * -------------------------------------------------------------- */
  var labels = {
    en: {
      brand: 'HELPERG Ecosystem',
      tagline: 'Products for work, research, knowledge, and business.',
      exploreAll: 'Explore all products',
      allProducts: 'All products',
      products: 'Products',
      apps: 'Apps',
      website: 'Website',
      webApp: 'Web App',
      ios: 'iOS',
      android: 'Android',
      available: 'Available',
      comingSoon: 'Coming soon',
      soonShort: 'Soon',
      unavailable: 'Unavailable',
      unknown: 'Unknown',
      currentSite: 'Current site',
      close: 'Close',
      siteNav: 'Primary',
      searchLabel: 'Search products',
      noResults: 'No matching products',
      groupPlatforms: 'Platforms & tools',
      groupKnowledge: 'Knowledge & intelligence',
      groupEcosystem: 'Ecosystem',
      groupApplications: 'Applications',
      visitWebsite: 'Visit {name} website',
      openWebApp: 'Open the {name} web application',
      openAppStore: 'Open {name} on the App Store',
      openGooglePlay: 'Open {name} on Google Play',
      openDetail: 'About {name}'
    },
    es: {
      brand: 'Ecosistema HELPERG',
      tagline: 'Productos para el trabajo, la investigación, el conocimiento y los negocios.',
      exploreAll: 'Explorar todos los productos',
      allProducts: 'Todos los productos',
      products: 'Productos',
      apps: 'Aplicaciones',
      website: 'Sitio web',
      webApp: 'Aplicación web',
      ios: 'iOS',
      android: 'Android',
      available: 'Disponible',
      comingSoon: 'Próximamente',
      soonShort: 'Pronto',
      unavailable: 'No disponible',
      unknown: 'Desconocido',
      currentSite: 'Sitio actual',
      close: 'Cerrar',
      siteNav: 'Principal',
      searchLabel: 'Buscar productos',
      noResults: 'No hay productos coincidentes',
      groupPlatforms: 'Plataformas y herramientas',
      groupKnowledge: 'Conocimiento e inteligencia',
      groupEcosystem: 'Ecosistema',
      groupApplications: 'Aplicaciones',
      visitWebsite: 'Visitar el sitio web de {name}',
      openWebApp: 'Abrir la aplicación web de {name}',
      openAppStore: 'Abrir {name} en el App Store',
      openGooglePlay: 'Abrir {name} en Google Play',
      openDetail: 'Acerca de {name}'
    },
    fr: {
      brand: 'Écosystème HELPERG',
      tagline: 'Des produits pour le travail, la recherche, la connaissance et les affaires.',
      exploreAll: 'Explorer tous les produits',
      allProducts: 'Tous les produits',
      products: 'Produits',
      apps: 'Applications',
      website: 'Site web',
      webApp: 'Application web',
      ios: 'iOS',
      android: 'Android',
      available: 'Disponible',
      comingSoon: 'Bientôt disponible',
      soonShort: 'Bientôt',
      unavailable: 'Indisponible',
      unknown: 'Inconnu',
      currentSite: 'Site actuel',
      close: 'Fermer',
      siteNav: 'Principale',
      searchLabel: 'Rechercher des produits',
      noResults: 'Aucun produit correspondant',
      groupPlatforms: 'Plateformes et outils',
      groupKnowledge: 'Connaissance et intelligence',
      groupEcosystem: 'Écosystème',
      groupApplications: 'Applications',
      visitWebsite: 'Visiter le site web de {name}',
      openWebApp: 'Ouvrir l’application web de {name}',
      openAppStore: 'Ouvrir {name} sur l’App Store',
      openGooglePlay: 'Ouvrir {name} sur Google Play',
      openDetail: 'À propos de {name}'
    },
    de: {
      brand: 'HELPERG-Ökosystem',
      tagline: 'Produkte für Arbeit, Forschung, Wissen und Business.',
      exploreAll: 'Alle Produkte entdecken',
      allProducts: 'Alle Produkte',
      products: 'Produkte',
      apps: 'Apps',
      website: 'Website',
      webApp: 'Web-App',
      ios: 'iOS',
      android: 'Android',
      available: 'Verfügbar',
      comingSoon: 'Demnächst verfügbar',
      soonShort: 'Bald',
      unavailable: 'Nicht verfügbar',
      unknown: 'Unbekannt',
      currentSite: 'Aktuelle Website',
      close: 'Schließen',
      siteNav: 'Hauptmenü',
      searchLabel: 'Produkte suchen',
      noResults: 'Keine passenden Produkte',
      groupPlatforms: 'Plattformen & Tools',
      groupKnowledge: 'Wissen & Intelligenz',
      groupEcosystem: 'Ökosystem',
      groupApplications: 'Apps',
      visitWebsite: '{name}-Website besuchen',
      openWebApp: '{name} Web-App öffnen',
      openAppStore: '{name} im App Store öffnen',
      openGooglePlay: '{name} bei Google Play öffnen',
      openDetail: 'Über {name}'
    }
  };

  return {
    version: 2,
    products: products,
    groups: groups,
    timeline: timeline,
    hubUrl: hubUrl,
    labels: labels,
    normalizeHost: normalizeHost,
    productIdForHost: productIdForHost
  };
});
