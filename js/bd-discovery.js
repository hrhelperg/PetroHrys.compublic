'use strict';

// The Research Center discovery predicate — the one place that decides whether
// a row survives the current search, facet and filter state.
//
// ── WHY THIS IS ITS OWN MODULE ──────────────────────────────────────────────
//
// It used to live inside js/business-directories.js, tangled up with the DOM
// mechanics that hide rows and count them. That made it untestable, and
// untestable is how a page ships with seven working filter controls wired to
// nothing: the procurement page emitted every facet attribute correctly, the
// script bailed on its third statement because no tbody declared itself, and
// selecting Czech Republic left Albania and Algeria on screen. Nothing could
// have caught it, because there was no seam to test.
//
// So the DECISION lives here as pure functions over plain objects, and the DOM
// work stays in the client. The client ships this file verbatim — the same
// UMD pattern to-search.cjs uses — so the browser and the tests can never
// disagree about what "matching" means.
//
// This module holds only GENERIC mechanics: canonical-value equality,
// membership for list-valued facets, tri-state filters, AND composition and
// substring search over a prepared haystack. Anything dataset-specific — which
// facets exist, what the haystack contains — is decided by the generator that
// emits the row, not here.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BDDiscovery = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  // ── SEARCH NORMALIZATION ──────────────────────────────────────────────────
  //
  // Casefold, trim, collapse runs of whitespace. Deliberately no stemming, no
  // fuzzy distance and no ranking: at these collection sizes a person typing
  // "india" wants the rows that say india, and anything cleverer would only
  // introduce ways to be wrong.
  function normalize(text) {
    return String(text == null ? '' : text)
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function terms(query) {
    const q = normalize(query);
    return q ? q.split(' ') : [];
  }

  // ── PHRASE, NOT BAG OF WORDS ──────────────────────────────────────────────
  //
  // The query matches as a CONTIGUOUS string against the prepared haystack.
  //
  // Treating multi-word input as an AND of its words looks more helpful and is
  // a different product: "incorporated association" would then match a
  // register that mentions incorporation in one sentence and associations in
  // another, and the Australian directory pages have several of each. That
  // behaviour is asserted by an existing test, and quietly loosening search
  // semantics while repairing a filter bug is not a repair.
  //
  // Normalization still applies to both sides, so case and stray whitespace
  // never decide a match.
  function matchesQuery(haystack, query) {
    const q = normalize(query);
    if (!q) return true;
    return normalize(haystack).indexOf(q) !== -1;
  }

  // ── FACETS ────────────────────────────────────────────────────────────────
  //
  // A facet compares CANONICAL VALUES. The visible option text is a localized
  // label — "Czech Republic (1)" — and comparing that would make a page's
  // results depend on which language it was rendered in.
  //
  // An empty selection means "no restriction in this dimension", which is not
  // the same as matching the empty string: a platform with no subnational
  // jurisdiction carries `data-bd-facet-subnational=""`, and "All" must not
  // suddenly mean "only the national ones".
  //
  // `multi` facets hold a space-separated list and match on MEMBERSHIP.
  function matchesFacet(have, want, multi) {
    if (want === '' || want === null || want === undefined) return true;
    const value = String(have == null ? '' : have);
    if (!multi) return value === want;
    return (' ' + value + ' ').indexOf(' ' + want + ' ') !== -1;
  }

  // ── TRI-STATE FILTERS ─────────────────────────────────────────────────────
  //
  // A checkbox filter matches only a canonical 'yes'. 'unknown' fails it — but
  // it fails as "not confirmed", not as "confirmed no", and the two are
  // reported separately so a page can say how many rows it withheld for want
  // of evidence rather than silently collapsing unknown into no.
  function triState(value) {
    const v = String(value == null ? '' : value);
    if (v === 'yes') return 'yes';
    if (v === 'no') return 'no';
    return 'unknown';
  }

  // ── THE PREDICATE ─────────────────────────────────────────────────────────
  //
  // AND across every dimension. One filter can never widen another's result,
  // and no dimension may short-circuit the rest.
  //
  //   row     { haystack, facets: {name: value}, flags: {name: tri} }
  //   state   { query, facets: {name: {value, multi}}, flags: [name] }
  //
  // Returns { visible, hiddenForUnknown } so the caller can count both.
  function evaluate(row, state) {
    const facets = state.facets || {};
    const flags = state.flags || [];
    let visible = matchesQuery(row.haystack, state.query || '');

    for (const name of Object.keys(facets)) {
      const sel = facets[name];
      const want = sel && typeof sel === 'object' ? sel.value : sel;
      const multi = Boolean(sel && typeof sel === 'object' && sel.multi);
      if (!matchesFacet((row.facets || {})[name], want, multi)) visible = false;
    }

    let hiddenForUnknown = false;
    for (const name of flags) {
      const tri = triState((row.flags || {})[name]);
      if (tri !== 'yes') {
        if (tri === 'unknown') hiddenForUnknown = true;
        visible = false;
      }
    }
    return { visible: visible, hiddenForUnknown: !visible && hiddenForUnknown };
  }

  // Filter a list without mutating it or the records inside it.
  function filter(rows, state) {
    const kept = [];
    let unknownHidden = 0;
    for (const row of rows) {
      const verdict = evaluate(row, state);
      if (verdict.visible) kept.push(row);
      else if (verdict.hiddenForUnknown) unknownHidden += 1;
    }
    return { rows: kept, unknownHidden: unknownHidden, total: rows.length };
  }

  return {
    normalize: normalize,
    terms: terms,
    matchesQuery: matchesQuery,
    matchesFacet: matchesFacet,
    triState: triState,
    evaluate: evaluate,
    filter: filter,
  };
}));
