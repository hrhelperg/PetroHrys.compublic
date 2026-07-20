/*!
 * HELPERG Ecosystem — Centralized Product Registry
 * ------------------------------------------------------------------
 * Single source of truth for the global ecosystem banner.
 *
 * This file is the ONLY place product records live. The banner renderer
 * (js/ecosystem-banner.js) and the coverage/integrity validator
 * (scripts/validate-ecosystem-registry.cjs) both read from here.
 *
 * Honesty rules baked into the data (do not "fix" by inventing links):
 *   - A platform is rendered as a real link ONLY when its status is
 *     "available" AND it has a non-empty URL. Everything else renders as
 *     a muted, non-interactive status with accessible text.
 *   - "coming-soon" / "unavailable" are never clickable, even when a URL
 *     string is present (e.g. Cash Workspace is coming-soon).
 *   - CV Resume ships iOS only; its Android URL is null and status
 *     "unavailable". Do NOT invent an Android link.
 *
 * Status values : available | coming-soon | unavailable | unknown
 * Type values   : ecosystem | platform | publication | application | personal
 * Group values  : platforms | knowledge | ecosystem | applications
 *
 * Works in the browser (assigns window.HELPERG_ECOSYSTEM) and in Node
 * (module.exports) so the validator can require() it directly.
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

  /* -------------------------------------------------------------- *
   * Products — verified web ecosystem + verified mobile apps.       *
   * URLs and statuses are transcribed verbatim from the approved    *
   * brief. Do not silently alter.                                   *
   * -------------------------------------------------------------- */
  var products = [
    /* ============ Ecosystem ============ */
    {
      id: 'helperg', name: 'HELPERG', type: 'ecosystem', group: 'ecosystem',
      websiteUrl: 'https://helperg.com', webAppUrl: null,
      iosUrl: null, androidUrl: null,
      websiteStatus: 'available', webAppStatus: 'unavailable',
      iosStatus: 'coming-soon', androidStatus: 'coming-soon',
      displayPriority: 1, featuredInTimeline: true,
      currentSiteDomains: ['helperg.com', 'www.helperg.com'],
      shortDescription: 'The HELPERG product ecosystem hub.'
    },
    {
      id: 'petrohrys', name: 'Petro Hrys', type: 'personal', group: 'ecosystem',
      websiteUrl: 'https://petrohrys.com', webAppUrl: null,
      iosUrl: null, androidUrl: null,
      websiteStatus: 'available', webAppStatus: 'unavailable',
      iosStatus: 'coming-soon', androidStatus: 'coming-soon',
      displayPriority: 2, featuredInTimeline: true,
      currentSiteDomains: ['petrohrys.com', 'www.petrohrys.com'],
      shortDescription: 'Independent research & building practice.'
    },

    /* ============ Platforms & tools ============ */
    {
      id: 'webmasterid', name: 'WebmasterID', type: 'platform', group: 'platforms',
      websiteUrl: 'https://www.webmasterid.com', webAppUrl: 'https://www.webmasterid.com',
      iosUrl: null, androidUrl: null,
      websiteStatus: 'available', webAppStatus: 'available',
      iosStatus: 'coming-soon', androidStatus: 'coming-soon',
      displayPriority: 3, featuredInTimeline: true,
      currentSiteDomains: ['webmasterid.com', 'www.webmasterid.com'],
      shortDescription: 'Privacy-first web analytics.'
    },
    {
      id: 'cashworkspace', name: 'Cash Workspace', type: 'platform', group: 'platforms',
      websiteUrl: 'https://www.cashworkspace.com', webAppUrl: 'https://www.cashworkspace.com',
      iosUrl: null, androidUrl: null,
      websiteStatus: 'coming-soon', webAppStatus: 'coming-soon',
      iosStatus: 'coming-soon', androidStatus: 'coming-soon',
      displayPriority: 4, featuredInTimeline: true,
      currentSiteDomains: ['cashworkspace.com', 'www.cashworkspace.com'],
      shortDescription: 'Cash management workspace.'
    },
    {
      id: 'geobusinessiq', name: 'GeoBusinessIQ', type: 'platform', group: 'platforms',
      websiteUrl: 'https://geobusinessiq.com', webAppUrl: 'https://geobusinessiq.com',
      iosUrl: null, androidUrl: null,
      websiteStatus: 'available', webAppStatus: 'available',
      iosStatus: 'coming-soon', androidStatus: 'coming-soon',
      displayPriority: 5, featuredInTimeline: true,
      currentSiteDomains: ['geobusinessiq.com', 'www.geobusinessiq.com'],
      shortDescription: 'Business & market intelligence.'
    },
    {
      id: 'talentpartnerid', name: 'TalentPartnerID', type: 'platform', group: 'platforms',
      websiteUrl: 'https://talentpartnerid.com', webAppUrl: null,
      iosUrl: null, androidUrl: null,
      websiteStatus: 'available', webAppStatus: 'unavailable',
      iosStatus: 'coming-soon', androidStatus: 'coming-soon',
      displayPriority: 20, featuredInTimeline: false,
      currentSiteDomains: ['talentpartnerid.com', 'www.talentpartnerid.com'],
      shortDescription: 'Recruitment & talent partner network.'
    },
    {
      id: 'hrhelperg', name: 'HRHelperG', type: 'platform', group: 'platforms',
      websiteUrl: 'https://hrhelperg.com', webAppUrl: null,
      iosUrl: null, androidUrl: null,
      websiteStatus: 'available', webAppStatus: 'unavailable',
      iosStatus: 'coming-soon', androidStatus: 'coming-soon',
      displayPriority: 21, featuredInTimeline: false,
      currentSiteDomains: ['hrhelperg.com', 'www.hrhelperg.com'],
      shortDescription: 'HR platform & knowledge base.'
    },
    {
      id: 'twinphone', name: 'Twin Phone', type: 'platform', group: 'platforms',
      websiteUrl: 'https://twin-phone.com', webAppUrl: 'https://twin-phone.com',
      iosUrl: null, androidUrl: null,
      websiteStatus: 'available', webAppStatus: 'available',
      iosStatus: 'coming-soon', androidStatus: 'coming-soon',
      displayPriority: 22, featuredInTimeline: false,
      currentSiteDomains: ['twin-phone.com', 'www.twin-phone.com'],
      shortDescription: 'Second-number calling & messaging.'
    },
    {
      id: 'socialsporthub', name: 'SocialSportHub', type: 'platform', group: 'platforms',
      websiteUrl: 'https://socialsporthub.com', webAppUrl: 'https://socialsporthub.com',
      iosUrl: null, androidUrl: null,
      websiteStatus: 'available', webAppStatus: 'available',
      iosStatus: 'coming-soon', androidStatus: 'coming-soon',
      displayPriority: 23, featuredInTimeline: false,
      currentSiteDomains: ['socialsporthub.com', 'www.socialsporthub.com'],
      shortDescription: 'Social hub for sport communities.'
    },

    /* ============ Knowledge & intelligence ============ */
    {
      id: 'globalcityintelligence', name: 'Global City Intelligence', type: 'platform', group: 'knowledge',
      websiteUrl: 'https://globalcityintelligence.com', webAppUrl: 'https://globalcityintelligence.com',
      iosUrl: null, androidUrl: null,
      websiteStatus: 'available', webAppStatus: 'available',
      iosStatus: 'coming-soon', androidStatus: 'coming-soon',
      displayPriority: 6, featuredInTimeline: true,
      currentSiteDomains: ['globalcityintelligence.com', 'www.globalcityintelligence.com'],
      shortDescription: 'City-level data & intelligence.'
    },
    {
      id: 'agricultureid', name: 'AgricultureID', type: 'publication', group: 'knowledge',
      websiteUrl: 'https://agricultureid.com', webAppUrl: null,
      iosUrl: null, androidUrl: null,
      websiteStatus: 'available', webAppStatus: 'unavailable',
      iosStatus: 'coming-soon', androidStatus: 'coming-soon',
      displayPriority: 30, featuredInTimeline: false,
      currentSiteDomains: ['agricultureid.com', 'www.agricultureid.com'],
      shortDescription: 'Agriculture knowledge & intelligence.'
    },
    {
      id: 'asteriastar', name: 'AsteriaStar', type: 'publication', group: 'knowledge',
      websiteUrl: 'https://asteriastar.com', webAppUrl: null,
      iosUrl: null, androidUrl: null,
      websiteStatus: 'available', webAppStatus: 'unavailable',
      iosStatus: 'coming-soon', androidStatus: 'coming-soon',
      displayPriority: 31, featuredInTimeline: false,
      currentSiteDomains: ['asteriastar.com', 'www.asteriastar.com'],
      shortDescription: 'Astronomy & space knowledge.'
    },
    {
      id: 'faunahub', name: 'FaunaHub', type: 'publication', group: 'knowledge',
      websiteUrl: 'https://faunahub.com', webAppUrl: null,
      iosUrl: null, androidUrl: null,
      websiteStatus: 'available', webAppStatus: 'unavailable',
      iosStatus: 'coming-soon', androidStatus: 'coming-soon',
      displayPriority: 32, featuredInTimeline: false,
      currentSiteDomains: ['faunahub.com', 'www.faunahub.com'],
      shortDescription: 'Wildlife & fauna knowledge.'
    },
    {
      id: 'builddesignhub', name: 'BuildDesignHub', type: 'publication', group: 'knowledge',
      websiteUrl: 'https://builddesignhub.com', webAppUrl: null,
      iosUrl: null, androidUrl: null,
      websiteStatus: 'available', webAppStatus: 'unavailable',
      iosStatus: 'coming-soon', androidStatus: 'coming-soon',
      displayPriority: 33, featuredInTimeline: false,
      currentSiteDomains: ['builddesignhub.com', 'www.builddesignhub.com'],
      shortDescription: 'Building & design knowledge.'
    },
    {
      id: 'printerarchive', name: 'PrinterArchive', type: 'publication', group: 'knowledge',
      websiteUrl: 'https://printerarchive.net', webAppUrl: null,
      iosUrl: null, androidUrl: null,
      websiteStatus: 'available', webAppStatus: 'unavailable',
      iosStatus: 'coming-soon', androidStatus: 'coming-soon',
      displayPriority: 34, featuredInTimeline: false,
      currentSiteDomains: ['printerarchive.net', 'www.printerarchive.net'],
      shortDescription: 'Printing technology encyclopedia.'
    },
    {
      id: 'virtueandpower', name: 'Virtue & Power', type: 'publication', group: 'knowledge',
      websiteUrl: 'https://virtueandpower.com', webAppUrl: null,
      iosUrl: null, androidUrl: null,
      websiteStatus: 'available', webAppStatus: 'unavailable',
      iosStatus: 'coming-soon', androidStatus: 'coming-soon',
      displayPriority: 35, featuredInTimeline: false,
      currentSiteDomains: ['virtueandpower.com', 'www.virtueandpower.com'],
      shortDescription: 'Ideas on virtue, power & society.'
    },

    /* ============ Applications (mobile) ============ *
     * No standalone website URLs (per brief). `detailUrl` points at a
     * verified existing PetroHrys internal product page, reused as a
     * product-detail landing (existing URLs preserved; store links kept).
     */
    {
      id: 'zip', name: 'ZIP', type: 'application', group: 'applications',
      websiteUrl: null, webAppUrl: null,
      detailUrl: '/unzip/',
      iosUrl: 'https://apps.apple.com/app/id6753772583',
      androidUrl: 'https://play.google.com/store/apps/details?id=com.ziparchivator.zip&pcampaignid=web_share',
      websiteStatus: 'unavailable', webAppStatus: 'unavailable',
      iosStatus: 'available', androidStatus: 'available',
      displayPriority: 40, featuredInTimeline: false,
      currentSiteDomains: [],
      shortDescription: 'Extract RAR, ZIP, 7z on iPhone & Android.'
    },
    {
      id: 'printer', name: 'Printer', type: 'application', group: 'applications',
      websiteUrl: null, webAppUrl: null,
      detailUrl: '/smart-printer/',
      iosUrl: 'https://apps.apple.com/app/id6746067890',
      androidUrl: 'https://play.google.com/store/apps/details?id=com.helperg.smart.printer',
      websiteStatus: 'unavailable', webAppStatus: 'unavailable',
      iosStatus: 'available', androidStatus: 'available',
      displayPriority: 41, featuredInTimeline: false,
      currentSiteDomains: [],
      shortDescription: 'Wireless printing from your phone.'
    },
    {
      id: 'fax', name: 'Fax', type: 'application', group: 'applications',
      websiteUrl: null, webAppUrl: null,
      detailUrl: '/fax/',
      iosUrl: 'https://apps.apple.com/app/id6760895885',
      androidUrl: 'https://play.google.com/store/apps/details?id=com.helperg.fax.app&pcampaignid=web_share',
      websiteStatus: 'unavailable', webAppStatus: 'unavailable',
      iosStatus: 'available', androidStatus: 'available',
      displayPriority: 42, featuredInTimeline: false,
      currentSiteDomains: [],
      shortDescription: 'Send & receive fax from your phone.'
    },
    {
      id: 'pdfeditor', name: 'PDF Editor', type: 'application', group: 'applications',
      websiteUrl: null, webAppUrl: null,
      detailUrl: '/pdf-editor/',
      iosUrl: 'https://apps.apple.com/app/id6747341672',
      androidUrl: 'https://play.google.com/store/apps/details?id=com.helperg.editor.documents&pcampaignid=web_share',
      websiteStatus: 'unavailable', webAppStatus: 'unavailable',
      iosStatus: 'available', androidStatus: 'available',
      displayPriority: 43, featuredInTimeline: false,
      currentSiteDomains: [],
      shortDescription: 'Scan, convert, sign & edit PDFs.'
    },
    {
      id: 'cvresume', name: 'CV Resume', type: 'application', group: 'applications',
      websiteUrl: null, webAppUrl: null,
      detailUrl: '/cv-builder/',
      iosUrl: 'https://apps.apple.com/app/id6745150815',
      androidUrl: null,
      websiteStatus: 'unavailable', webAppStatus: 'unavailable',
      iosStatus: 'available', androidStatus: 'unavailable',
      displayPriority: 44, featuredInTimeline: false,
      currentSiteDomains: [],
      shortDescription: 'ATS-ready resumes on iPhone.'
    },
    {
      id: 'invoicemaker', name: 'Invoice Maker', type: 'application', group: 'applications',
      websiteUrl: null, webAppUrl: null,
      detailUrl: '/invoice-maker/',
      iosUrl: 'https://apps.apple.com/app/id6747311276',
      androidUrl: 'https://play.google.com/store/apps/details?id=com.helperg.invoicer',
      websiteStatus: 'unavailable', webAppStatus: 'unavailable',
      iosStatus: 'available', androidStatus: 'available',
      displayPriority: 45, featuredInTimeline: false,
      currentSiteDomains: [],
      shortDescription: 'Professional invoices in a minute.'
    },
    {
      id: 'pocketmanager', name: 'Pocket Manager', type: 'application', group: 'applications',
      websiteUrl: null, webAppUrl: null,
      detailUrl: '/pocket-manager/',
      iosUrl: 'https://apps.apple.com/app/id6743084126',
      androidUrl: 'https://play.google.com/store/apps/details?id=com.helperg.money',
      websiteStatus: 'unavailable', webAppStatus: 'unavailable',
      iosStatus: 'available', androidStatus: 'available',
      displayPriority: 46, featuredInTimeline: false,
      currentSiteDomains: [],
      shortDescription: 'Privacy-first budget & expenses.'
    }
  ];

  /* -------------------------------------------------------------- *
   * Panel groups (render order + localized headings).              *
   * -------------------------------------------------------------- */
  var groups = [
    { id: 'platforms',    labelKey: 'groupPlatforms' },
    { id: 'knowledge',    labelKey: 'groupKnowledge' },
    { id: 'ecosystem',    labelKey: 'groupEcosystem' },
    { id: 'applications', labelKey: 'groupApplications' }
  ];

  /* Curated, compact desktop timeline (ids, in visible order). */
  var timeline = [
    'helperg', 'petrohrys', 'webmasterid',
    'cashworkspace', 'geobusinessiq', 'globalcityintelligence'
  ];

  /* Identity of THIS site, so the banner can mark "Current site". */
  var self = { id: 'petrohrys', domains: ['petrohrys.com', 'www.petrohrys.com'] };

  /* The verified ecosystem hub — used as the no-JS fallback target. */
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
      currentSite: 'Current site',
      close: 'Close',
      siteNav: 'Primary',
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
      currentSite: 'Sitio actual',
      close: 'Cerrar',
      siteNav: 'Principal',
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
      currentSite: 'Site actuel',
      close: 'Fermer',
      siteNav: 'Principale',
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
      currentSite: 'Aktuelle Website',
      close: 'Schließen',
      siteNav: 'Hauptmenü',
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
    version: 1,
    products: products,
    groups: groups,
    timeline: timeline,
    self: self,
    hubUrl: hubUrl,
    labels: labels
  };
});
