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
// substring search over a prepared haystack — plus, for the same reason, the
// two things that have to agree with the predicate exactly and would rot if
// they were written twice: the URL state a selection serializes to, and the CSV
// projection of the rows that selection leaves visible. Anything
// dataset-specific — which facets exist, what the haystack contains — is
// decided by the generator that emits the row, not here.

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
  //   row     { haystack, domainRating, facets: {name: value}, flags: {name: tri} }
  //   state   { query, minDr, facets: {name: {value, multi}}, flags: [name] }
  //
  // `state` here is the SELECTION shape, not the URL shape: selectionFor()
  // below converts one into the other, and a caller that skips it silently
  // loses every dimension the two shapes name differently.
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

    // ── A MINIMUM DOMAIN RATING ─────────────────────────────────────────────
    //
    // The one dimension here that is not an equality match, and the two ways it
    // could quietly go wrong are both about what "no answer" means.
    //
    // Compared as NUMBERS. As strings "9" > "50" > "100", so a lexicographic
    // comparison would admit every single-digit rating to a 50+ filter and
    // exclude 100 from it.
    //
    // An UNMEASURED domain passes NO threshold. It is tempting to read a
    // missing rating as 0 and let the arithmetic decide, and that is exactly
    // the confusion the whole metric is built to avoid: 0 is a real reading
    // taken on a real domain, and null is nobody having looked. A record with
    // no rating is not a weak record, so it is not shown as one — it simply
    // cannot answer the question the reader asked.
    if (state.minDr !== '' && state.minDr !== null && state.minDr !== undefined) {
      const floor = Number(state.minDr);
      const rating = row.domainRating;
      if (typeof rating !== 'number' || !isFinite(rating) || !isFinite(floor)
        || rating < floor) visible = false;
    }

    // The same rule as the rating above, for the same reason: a source with no
    // link evidence is not a source with a bad link. It cannot answer the
    // question, so it is not offered as an answer to it.
    if (state.linkType !== '' && state.linkType !== null && state.linkType !== undefined) {
      if (!linkTypeMatches(state.linkType, row.backlinkType)) visible = false;
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

  // ── URL STATE ─────────────────────────────────────────────────────────────
  //
  // A selection nobody can link to is a selection that has to be described in
  // prose — "open the media page, then pick Germany, then press releases, then
  // sort by score" — and re-made by hand at the other end.
  //
  // ── WHY THE PARAMETER SET IS DERIVED AND NOT DECLARED ─────────────────────
  //
  // scripts/lib/to-search.cjs declares its parameters as a literal PARAM_ORDER,
  // and for that page it is right: one page, one control panel, both changed by
  // the same hand at the same time.
  //
  // FIVE page families share this module and they do not agree about what a
  // control panel is. Counted from the generated pages:
  //
  //   tenders-procurement     7 facet selects + search
  //   marketplaces            5 facet selects + search
  //   media, PR & publishing 11 facet selects (5 list-valued) + search
  //   listing opportunities  11 facet selects + search + sort
  //   directory country page  0 facet selects — 6 tri-state checkboxes,
  //                           a sort, and a jurisdiction select whose values
  //                           are composite: "group:national", "state:US-AL"
  //
  // One hand-written list would have to be right about all five at once and
  // stay right as the generators move. It would not: the media page grew from
  // 7 facets to 11 in one change, and nothing about adding a facet would have
  // reminded anyone to come back here. A parameter that quietly stopped
  // existing does not fail — it drops silently out of every shared link.
  //
  // So the parameters are READ FROM THE CONTROLS THE PAGE RENDERED: one
  // parameter per data-bd-facet select, plus q, filters, jurisdiction and sort
  // where those controls exist. A control the page does not render has no
  // parameter at all, and a facet added to a generator becomes shareable the
  // day it ships with no edit to this file.
  //
  // The price is that `known` — the control schema, built from the DOM by the
  // client and from the markup by the tests — must be passed to both functions.
  // That price is the point: neither function can invent a parameter, a value,
  // or a sort key the page does not offer.

  // A hostile query is expected. It is bounded on the way IN, so nothing
  // downstream has to remember to bound it: 200 characters is the same cap
  // to-search.cjs applies to its own q.
  const Q_MAX = 200;

  // Names the state machinery owns. A facet may not be called one of these or
  // the two would fight over one key; the generators name facets after data
  // dimensions (country, type, cost), and a test asserts the collision cannot
  // happen rather than trusting that it will not.
  const RESERVED = ['q', 'filters', 'jurisdiction', 'sort', 'min-dr', 'link-type'];

  // How a listing here links out. Kept as the nuanced states the schema stores
  // rather than a "dofollow yes/no", because a listing that renders no external
  // anchor at all and one that renders rel="nofollow" are different answers to
  // a reader's question, and "mixed" — two templates that genuinely differ — is
  // a third. Selecting Follow must never return a source we are unsure about,
  // so mixed and unknown each stand alone.
  const LINK_TYPE_VALUES = ['follow', 'restricted', 'mixed', 'none', 'unknown'];
  function linkTypesOf(known) { return (known && known.linkTypes) || []; }
  function linkTypeMatches(want, value) {
    if (want === 'follow') return value === 'dofollow';
    if (want === 'restricted') return value === 'nofollow' || value === 'ugc' || value === 'sponsored';
    if (want === 'mixed') return value === 'mixed';
    if (want === 'none') return value === 'none';
    // Unknown is the absence of a reading, never a value in its own right.
    if (want === 'unknown') return !value;
    return true;
  }

  function facetsOf(known) { return (known && known.facets) || []; }
  function filtersOf(known) { return (known && known.filters) || []; }
  function sortsOf(known) { return (known && known.sorts) || []; }
  function jurisdictionsOf(known) { return (known && known.jurisdictions) || []; }
  function minDrOf(known) { return (known && known.minDr) || []; }

  // The default is what the page shows before anyone touches it: the first sort
  // option, because that is what a <select> selects on its own.
  function defaultSort(known) {
    const sorts = sortsOf(known);
    return sorts.length ? sorts[0] : '';
  }

  function defaultJurisdiction(known) {
    const values = jurisdictionsOf(known);
    if (!values.length) return '';
    return values.indexOf('all') !== -1 ? 'all' : values[0];
  }

  // The clean state: what the page renders with no query string at all.
  function emptyState(known) {
    return {
      q: '',
      facets: {},
      filters: [],
      jurisdiction: defaultJurisdiction(known),
      sort: defaultSort(known),
      // "Any" — no floor at all. Deliberately not 0: a floor of 0 would be a
      // filter that admits every measured record and excludes every unmeasured
      // one, which is a different question and not the one the control asks.
      minDr: '',
      linkType: '',
    };
  }

  // Serialized in one fixed order, so the same selection always produces the
  // same URL. Without it a "shareable link" would differ depending on which
  // control was touched first, and two identical selections would look like two
  // different ones in a log, a bookmark or a bug report.
  function paramOrder(known) {
    const order = ['q'];
    for (const facet of facetsOf(known)) order.push(facet.name);
    if (minDrOf(known).length) order.push('min-dr');
    if (linkTypesOf(known).length) order.push('link-type');
    if (filtersOf(known).length) order.push('filters');
    if (jurisdictionsOf(known).length) order.push('jurisdiction');
    if (sortsOf(known).length) order.push('sort');
    return order;
  }

  // Reading one parameter. Duplicates resolve to the FIRST, deterministically:
  // taking the last would let ?country=france&country=albania smuggle a value
  // past a reader who saw only the first one in the link they were sent.
  function readParam(searchParams, key) {
    if (!searchParams) return null;
    let value = null;
    if (typeof searchParams.getAll === 'function') value = searchParams.getAll(key)[0];
    else if (typeof searchParams.get === 'function') value = searchParams.get(key);
    else value = searchParams[key];
    return value === undefined || value === null ? null : String(value);
  }

  // ── PARSE IS A WHITELIST ──────────────────────────────────────────────────
  //
  // Not a sanitizer. An unknown key is never read, an unrecognised value is
  // dropped rather than cleaned, and nothing that arrived in the URL is ever
  // carried in the returned state unless the page itself offers it. ?country=
  // <script> does not produce an escaped country: it produces no country, and
  // the select stays on "All".
  //
  // That is what makes the client's rule — write textContent, never markup —
  // hold at the boundary as well as at the sink. The one free-text value, q, is
  // capped and goes to input.value and to the search predicate; it is never
  // written into markup anywhere.
  function parseState(searchParams, known) {
    const state = emptyState(known);

    const q = readParam(searchParams, 'q');
    if (q) state.q = q.slice(0, Q_MAX);

    for (const facet of facetsOf(known)) {
      const value = readParam(searchParams, facet.name);
      if (value === null || value === '') continue;
      // The page's own options are the whitelist. A value no option carries
      // would filter the table to nothing, which is indistinguishable from a
      // broken page — so it is refused here instead.
      if ((facet.values || []).indexOf(value) === -1) continue;
      state.facets[facet.name] = value;
    }

    const filters = filtersOf(known);
    if (filters.length) {
      const asked = String(readParam(searchParams, 'filters') || '').split(',');
      // Iterating the KNOWN list rather than what arrived does three things at
      // once: unknown names cannot enter, duplicates collapse, and the result
      // is in the page's own order — so serialize(parse(x)) is stable however
      // the link was written.
      for (const name of filters) {
        if (asked.indexOf(name) !== -1) state.filters.push(name);
      }
    }

    const thresholds = minDrOf(known);
    if (thresholds.length) {
      const value = readParam(searchParams, 'min-dr');
      // Whitelisted against the thresholds the page actually offers, like every
      // other parameter here. ?min-dr=73 is not clamped to 70 — it is dropped,
      // because a link that silently means something other than what it says is
      // worse than one that means nothing.
      if (value !== null && thresholds.indexOf(value) !== -1) state.minDr = value;
    }
    if (linkTypesOf(known).length) {
      const want = readParam(searchParams, 'link-type');
      // Whitelisted the same way the threshold is: an unrecognised value is
      // dropped rather than coerced into the nearest one.
      if (want !== null && linkTypesOf(known).indexOf(want) !== -1) state.linkType = want;
    }

    const jurisdictions = jurisdictionsOf(known);
    if (jurisdictions.length) {
      const value = readParam(searchParams, 'jurisdiction');
      if (value !== null && jurisdictions.indexOf(value) !== -1) state.jurisdiction = value;
    }

    const sorts = sortsOf(known);
    if (sorts.length) {
      const value = readParam(searchParams, 'sort');
      if (value !== null && sorts.indexOf(value) !== -1) state.sort = value;
    }

    return state;
  }

  // Defaults are omitted, so a clean selection yields a clean URL and the page
  // a reader arrives on has the address they can copy. The same validation runs
  // here as in parseState: a state carrying a value the page does not offer
  // cannot be turned into a link that would only be dropped when it is opened.
  function serializeState(state, known) {
    const s = state || {};
    const facets = s.facets || {};
    const parts = [];

    for (const key of paramOrder(known)) {
      let value = '';
      if (key === 'q') {
        value = s.q === null || s.q === undefined ? '' : String(s.q).slice(0, Q_MAX);
      } else if (key === 'filters') {
        const chosen = [];
        for (const name of filtersOf(known)) {
          if ((s.filters || []).indexOf(name) !== -1) chosen.push(name);
        }
        value = chosen.join(',');
      } else if (key === 'jurisdiction') {
        const want = s.jurisdiction === null || s.jurisdiction === undefined ? '' : String(s.jurisdiction);
        value = (want !== defaultJurisdiction(known) && jurisdictionsOf(known).indexOf(want) !== -1)
          ? want : '';
      } else if (key === 'min-dr') {
        const want = s.minDr === null || s.minDr === undefined ? '' : String(s.minDr);
        value = minDrOf(known).indexOf(want) !== -1 ? want : '';
      } else if (key === 'link-type') {
        const want = s.linkType === null || s.linkType === undefined ? '' : String(s.linkType);
        value = linkTypesOf(known).indexOf(want) !== -1 ? want : '';
      } else if (key === 'sort') {
        const want = s.sort === null || s.sort === undefined ? '' : String(s.sort);
        value = (want !== defaultSort(known) && sortsOf(known).indexOf(want) !== -1) ? want : '';
      } else {
        const facet = findFacet(known, key);
        const want = facets[key] === null || facets[key] === undefined ? '' : String(facets[key]);
        value = (facet && (facet.values || []).indexOf(want) !== -1) ? want : '';
      }
      if (value === '') continue;
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
    }
    return parts.length ? '?' + parts.join('&') : '';
  }

  function findFacet(known, name) {
    for (const facet of facetsOf(known)) if (facet.name === name) return facet;
    return null;
  }

  // The state, in the shape evaluate() reads. One conversion in one place, so a
  // URL and a control panel can never be turned into two different selections.
  function selectionFor(state, known) {
    // minDr travels here too. It was added to evaluate() first and forgotten
    // here, and the result was a threshold that worked perfectly in a unit test
    // calling evaluate() directly and did nothing at all in the browser — the
    // control moved, the URL updated, and the table never changed. One
    // conversion in one place only helps if every dimension goes through it.
    const selection = {
      query: (state && state.q) || '',
      minDr: (state && state.minDr) || '',
      // Through the one conversion, for the reason written above it.
      linkType: (state && state.linkType) || '',
      facets: {},
      flags: [],
    };
    for (const facet of facetsOf(known)) {
      selection.facets[facet.name] = {
        value: ((state && state.facets) || {})[facet.name] || '',
        multi: facet.multi === true,
      };
    }
    for (const name of ((state && state.filters) || [])) selection.flags.push(name);
    return selection;
  }

  // ── FILTERED EXPORT ───────────────────────────────────────────────────────
  //
  // The static CSV each collection publishes is the WHOLE collection, built at
  // build time and linked as a plain file — it needs no JavaScript and it does
  // not change here. This is the other half: the records a reader is looking at
  // right now, after search, facets and sort.
  //
  // ── ONE CSV CONTRACT ──────────────────────────────────────────────────────
  //
  // RFC 4180 with CRLF and a UTF-8 BOM, exactly as the collection generators
  // write it, plus the formula guard scripts/build-tender-monitoring.cjs
  // already applies. Neither rule is reinvented here: a browser-side export
  // that quoted differently would be a second CSV dialect for the same
  // collection, and the difference would only show up in someone's spreadsheet.
  //
  // The three generators that write a Research Center collection now call
  // csvQuote below instead of keeping a copy each. scripts/lib/bd-csv.cjs still
  // holds its own — it belongs to the directory export and moving it is not
  // this change's to make.

  const BOM = '﻿';

  // RFC 4180 quoting, and nothing else. Quote when the value contains a comma,
  // a quote, a CR or an LF; escape an embedded quote by doubling it. Arrays
  // become a semicolon-separated string, which is what the four collection
  // exports already do, so the common case needs no quoting at all.
  //
  // This is the function the generators call. It is here rather than copied
  // into each of them because it was copied into each of them: five files held
  // five spellings of one rule, and a sixth was about to be written for the
  // browser.
  function csvQuote(value) {
    if (value === null || value === undefined) return '';
    const s = Array.isArray(value) ? value.join('; ') : String(value);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  // A cell starting with = + - @ or a tab is executed as a formula by Excel,
  // Sheets and LibreOffice. "=cmd|' /c calc'!A1" in a platform name is the
  // classic; a leading apostrophe neutralises it as text. The rule and the
  // character class are scripts/build-tender-monitoring.cjs's, which has had
  // this since it was written — asserted equal by test, not by resemblance.
  //
  // Applied at the PROJECTION boundary only. The record keeps its own
  // characters — the problem belongs to the spreadsheet, not to the platform —
  // which is why this defuses the string on its way into a cell and never
  // touches the row it came from.
  //
  // ── WHY THE STATIC COLLECTION EXPORTS DO NOT USE THIS ONE ─────────────────
  //
  // They are asserted, record by record, to carry the registry's own values
  // verbatim: md-media-platforms.test.cjs compares every exported name with
  // rec.name. Those files are a machine-readable copy of the collection as much
  // as they are a spreadsheet, and adding an apostrophe to one of them changes
  // published data for every consumer — a decision about the data, not about
  // this feature. The filtered export has no such contract: it is built in a
  // browser, for a person, to be opened in a spreadsheet, and that is exactly
  // the case the guard exists for.
  const FORMULA_PREFIX = /^[=+\-@\t\r]/;

  function csvField(value) {
    if (value === null || value === undefined) return '';
    let s = Array.isArray(value) ? value.join('; ') : String(value);
    if (FORMULA_PREFIX.test(s)) s = "'" + s;
    return csvQuote(s);
  }

  // The columns are derived from the same control schema the URL is: the record
  // identity, then every dimension this page lets a reader filter by. An export
  // whose columns were listed by hand would drift from the controls exactly the
  // way a hand-written PARAM_ORDER would, and the failure would be quieter —
  // a column that silently stopped being exported.
  function exportColumns(known) {
    const columns = [{ key: 'name', from: 'name' }];
    for (const facet of facetsOf(known)) columns.push({ key: facet.name, from: 'facet' });
    for (const name of filtersOf(known)) columns.push({ key: name, from: 'flag' });
    // Domain Rating is exported by the same rule the columns above follow: it
    // appears when the page offers it, and it is derived rather than listed by
    // hand. The provider travels with it, because a bare number in a spreadsheet
    // is a number whose origin the reader cannot check.
    if (known && known.sorts && known.sorts.indexOf('domain-rating') !== -1) {
      columns.push({ key: 'domain_rating', from: 'metric' });
      columns.push({ key: 'domain_rating_provider', from: 'metricProvider' });
    }
    // Link value travels the same way: present when the page offers it, three
    // separate columns because they are three separate facts, and empty rather
    // than guessed when nobody has looked.
    if (known && linkTypesOf(known).length) {
      columns.push({ key: 'link_type', from: 'linkType' });
      columns.push({ key: 'link_target_type', from: 'linkTargetType' });
      columns.push({ key: 'listing_page_indexability', from: 'listingIndexability' });
    }
    return columns;
  }

  function exportCell(row, column) {
    if (!row || !column) return '';
    if (column.from === 'facet') return (row.facets || {})[column.key];
    if (column.from === 'flag') return (row.flags || {})[column.key];
    // An unresearched listing exports as an empty cell. Writing "dofollow"
    // there because nobody looked is the one error this dimension may not make,
    // and a spreadsheet is where such a value would become permanent.
    if (column.from === 'linkType') return row.backlinkType || '';
    if (column.from === 'linkTargetType') return row.linkTargetType || '';
    if (column.from === 'listingIndexability') return row.listingIndexability || '';
    // An unmeasured domain exports as an EMPTY CELL, never as 0. A spreadsheet
    // is where that confusion becomes permanent: 0 sorts, averages and charts
    // as a real low score, and nothing downstream can tell it apart again.
    if (column.from === 'metric') {
      return (row.domainRating === null || row.domainRating === undefined)
        ? '' : String(row.domainRating);
    }
    if (column.from === 'metricProvider') {
      return (row.domainRating === null || row.domainRating === undefined) ? '' : 'Ahrefs';
    }
    return row[column.key];
  }

  // Rows in, CSV out. The caller passes the rows it is SHOWING, in the order it
  // is showing them, so this cannot disagree with the table: there is no filter
  // and no limit here to disagree with one.
  //
  // An empty selection produces a header and no data rows. It must never fall
  // back to the whole collection — a reader who filtered to nothing and pressed
  // export would silently receive 2,167 records they did not ask for and have
  // no way to notice.
  function renderFilteredCsv(rows, columns) {
    const cols = (columns && columns.length) ? columns : [{ key: 'name', from: 'name' }];
    const lines = [cols.map(function (c) { return csvField(c.key); }).join(',')];
    for (const row of rows || []) {
      lines.push(cols.map(function (c) { return csvField(exportCell(row, c)); }).join(','));
    }
    return BOM + lines.join('\r\n') + '\r\n';
  }

  // Deterministic and sanitized, and it carries NO query text: a filename is
  // written to a filesystem and shown in a downloads list, and neither is a
  // place to put whatever a reader typed into a search box.
  function exportFilename(name) {
    const slug = String(name === null || name === undefined ? '' : name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+/, '')
      .slice(0, 64)
      .replace(/-+$/, '');
    return (slug || 'research') + '-filtered.csv';
  }

  return {
    normalize: normalize,
    terms: terms,
    matchesQuery: matchesQuery,
    matchesFacet: matchesFacet,
    triState: triState,
    evaluate: evaluate,
    filter: filter,
    Q_MAX: Q_MAX,
    RESERVED: RESERVED,
    emptyState: emptyState,
    paramOrder: paramOrder,
    parseState: parseState,
    serializeState: serializeState,
    selectionFor: selectionFor,
    defaultSort: defaultSort,
    defaultJurisdiction: defaultJurisdiction,
    BOM: BOM,
    csvQuote: csvQuote,
    csvField: csvField,
    exportColumns: exportColumns,
    exportCell: exportCell,
    renderFilteredCsv: renderFilteredCsv,
    exportFilename: exportFilename,
  };
}));
