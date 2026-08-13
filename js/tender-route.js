/* eslint-disable */
// Tender Opportunity detail routes — the ONE implementation of the rule.
//
// UMD, because the same rule has to run in three places: the generator that
// writes the pages, the browser that links to them, and the tests that check
// both agree. A second implementation is how a link and a page drift apart.
//
// ── WHY THE BROWSER DERIVES THE ROUTE INSTEAD OF READING IT ─────────────────
//
// The first integration published a route string on every search-index record.
// It cost 188 KB gzip — a 20% increase on a payload every visitor downloads —
// to store 6,817 strings that are all a pure function of two fields already in
// the record. So the route is derived, and this file is the function.
//
// Identity is the CANONICAL OPPORTUNITY ID. The slug is cosmetic: it makes a
// URL readable and nothing more. Two opportunities whose titles normalize
// identically still get different routes, because the id is in the path, and a
// retitle does not move a page, because the id is unchanged.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TenderRoute = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var BASE = '/research/tenders-procurement/opportunities/';
  var SLUG_MAX = 60;

  // Cosmetic half of the path. Diacritics folded so the URL is ASCII, and
  // bounded so a 400-character tender title does not become a 400-character
  // directory name.
  function slugify(text) {
    return String(text == null ? '' : text)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, SLUG_MAX)
      .replace(/-+$/g, '');
  }

  // Identity half. A canonical id looks like "ted:558691-2026" or
  // "de-vergabe:ocds-mnwr74-1107...", and has to survive as one path segment.
  function idSegment(id) {
    return String(id == null ? '' : id)
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
  }

  function detailPath(id, title) {
    var seg = idSegment(id);
    if (!seg) return null;
    var slug = slugify(title);
    return BASE + (slug ? slug + '-' : '') + seg + '/';
  }

  // Does a path have the SHAPE of a detail route? Shape is not authorization —
  // it says the URL looks like one, not that the opportunity exists.
  function isDetailShape(route) {
    if (typeof route !== 'string') return false;
    if (route.indexOf(BASE) !== 0) return false;
    var tail = route.slice(BASE.length);
    if (!tail || tail.charAt(tail.length - 1) !== '/') return false;
    var inner = tail.slice(0, -1);
    // Exactly one segment, no nesting, no query, no fragment, no traversal.
    if (!inner.length || inner.indexOf('/') !== -1) return false;
    return /^[a-z0-9][a-z0-9-]*$/.test(inner);
  }

  return {
    BASE: BASE,
    SLUG_MAX: SLUG_MAX,
    slugify: slugify,
    idSegment: idSegment,
    detailPath: detailPath,
    isDetailShape: isDetailShape,
  };
}));
