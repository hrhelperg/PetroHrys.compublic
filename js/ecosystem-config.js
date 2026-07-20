/*!
 * HELPERG Ecosystem — per-site configuration (PetroHrys.com)
 * ------------------------------------------------------------------
 * This is the ONLY site-specific file. The registry, renderer and styles
 * are generic and reused verbatim across HELPERG properties; each site
 * ships its own ecosystem-config.js.
 *
 * Load order (all deferred): registry -> config -> banner.
 *
 * Fields:
 *   currentProductId   which registry product IS this site (explicit).
 *                      If omitted/unknown, the renderer falls back to
 *                      hostname matching against each product's
 *                      currentSiteDomains (exact match).
 *   ecosystemHomeUrl   hub link for the brand + "Explore all products".
 *   showApps           show the Apps popover trigger (desktop).
 *   showSearch         show the product search box in the All-products panel.
 *   locale             optional forced locale; omit to use <html lang>.
 *   headerSelector     this site's OWN sticky/fixed top bar(s) that must be
 *                      offset below the banner (used for scroll-stack
 *                      measurement). Not the banner itself.
 *   stickyHeaderMode   'stacked' = keep the site header directly below the
 *                      banner; 'none' = the banner just sits on top.
 *   insertionTarget    where the banner mounts (the injector uses <body>).
 */
;(function (root, factory) {
  'use strict';
  var cfg = factory();
  if (root) { root.HELPERGEcosystemConfig = cfg; }
  if (typeof module !== 'undefined' && module.exports) { module.exports = cfg; }
})(typeof globalThis !== 'undefined' ? globalThis
   : (typeof self !== 'undefined' ? self
   : (typeof window !== 'undefined' ? window : this)),
function () {
  'use strict';
  return {
    currentProductId: 'petrohrys',
    ecosystemHomeUrl: 'https://helperg.com',
    showApps: true,
    showSearch: true,
    // PetroHrys hosts two page systems: editorial pages use a sticky
    // <header role="banner">; legacy pages use a fixed/sticky <body> > nav.
    headerSelector: 'header[role="banner"], body > nav:not([data-helperg-eco])',
    stickyHeaderMode: 'stacked',
    insertionTarget: 'body'
  };
});
