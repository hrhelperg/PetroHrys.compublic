/* Business Directories — progressive enhancement only.
 *
 * Reorders and hides table rows that are already prerendered. Performs no
 * network request of any kind, and writes only textContent, never markup.
 *
 * Ordering is delegated entirely to BDOrder (js/bd-order.js), the same module
 * the generator uses server-side, so an enhanced page can never disagree with
 * the prerendered one.
 *
 * ── WHAT THIS FILE IS ALLOWED TO DECIDE ─────────────────────────────────────
 *
 * DOM, history and downloads. Nothing else.
 *
 * What matches, what a URL means, and what a row looks like in a CSV are all
 * answered by BDDiscovery (js/bd-discovery.js), a byte-identical copy of
 * scripts/lib/bd-discovery.cjs that Node tests directly. This file reads the
 * controls, hands them over, and renders the answer.
 *
 * ── IT RUNS ON 23,628 PAGES, MOST OF WHICH HAVE NO CONTROLS ────────────────
 *
 * Only 288 of them carry a filterable table and 1,672 load the predicate at
 * all. Every capability this file uses is therefore checked before it is used
 * and every absence returns early, so a directory record page pays for a script
 * that finds nothing to do and stops — never a broken one.
 */
(function () {
  'use strict';

  var order = typeof BDOrder !== 'undefined' ? BDOrder
    : (typeof window !== 'undefined' ? window.BDOrder : null);
  if (!order) return; // ordering model unavailable: leave the server order alone

  // The matching decision lives in BDDiscovery, shipped verbatim from
  // scripts/lib/bd-discovery.cjs, so the browser and the test suite cannot
  // disagree about what "matching" means. If it is missing the page keeps its
  // prerendered order rather than filtering by a second implementation.
  var D = typeof BDDiscovery !== 'undefined' ? BDDiscovery
    : (typeof window !== 'undefined' ? window.BDDiscovery : null);
  if (!D) return;

  // Every group's tbody. Once a country page groups by jurisdiction there is
  // one per group, and a singular query would leave search, filter and sort
  // touching only the first — with a status count for the whole page.
  var bodies = Array.prototype.slice.call(document.querySelectorAll('[data-bd-rows]'));
  if (!bodies.length) return;

  // Which jurisdiction group a row sits in, read from the box that encloses it.
  // The id carries the key: "<country>-jurisdiction-<key>".
  function groupKeyOf(row) {
    var box = groupBoxOf(row);
    var id = box && box.getAttribute ? (box.getAttribute('id') || '') : '';
    var at = id.indexOf('-jurisdiction-');
    return at === -1 ? null : id.slice(at + 14);
  }

  // The enclosing group box, so a group whose rows all filter out can be hidden
  // rather than left as a caption and a heading above nothing.
  function groupBoxOf(node) {
    var el = node;
    while (el && el.parentNode) {
      el = el.parentNode;
      var cls = el.getAttribute ? el.getAttribute('class') : null;
      if (cls && (' ' + cls + ' ').indexOf(' bd-jgroup ') !== -1) return el;
    }
    return null;
  }

  var sortSelect = document.querySelector('[data-bd-sort]');
  // The one control that is not an equality match: a floor on Domain Rating.
  var minDrSelect = document.querySelector('[data-bd-min-dr]');
  var searchInput = document.querySelector('[data-bd-search]');
  var filters = Array.prototype.slice.call(document.querySelectorAll('[data-bd-filter]'));
  // Select-based facets for the opportunities worklist. Each select names the
  // row attribute it filters, so adding a facet needs no change here.
  var facets = Array.prototype.slice.call(document.querySelectorAll('[data-bd-facet]'));
  var clearBtn = document.querySelector('[data-bd-clear]');
  var jSelect = document.querySelector('[data-bd-jurisdiction-select]');
  // Every state's card, published or pending. A pending state has a card and no
  // row, so selecting it must narrow the grid rather than empty the page.
  var stateCards = Array.prototype.slice.call(document.querySelectorAll('[data-bd-state-code]'));
  var coverageSummary = document.querySelector('.bd-coverage-summary');
  var coverageBase = coverageSummary ? coverageSummary.textContent : '';
  var exportBtn = document.querySelector('[data-bd-export]');
  // The paragraph around it, which is what carries `hidden`: .bd-note draws a
  // left rule, so hiding only the button would leave a stray line behind.
  var exportWrap = document.querySelector('[data-bd-export-wrap]');

  // Reveal the controls only once the behaviour behind them exists. Without
  // JavaScript they stay hidden and the prerendered table is complete.
  ['[data-bd-sort-wrap]', '[data-bd-filter-wrap]', '[data-bd-search-wrap]',
    '[data-bd-jselect-wrap]', '[data-bd-min-dr-wrap]'].forEach(function (sel) {
    var el = document.querySelector(sel);
    if (el) el.hidden = false;
  });

  // ── THE CONTROL SCHEMA ────────────────────────────────────────────────────
  //
  // Read from the controls this page rendered, never written down. It is what
  // BDDiscovery uses to decide which URL parameters exist, which values are
  // legal in each of them, and which columns a filtered export carries — see
  // the long note in scripts/lib/bd-discovery.cjs for why all three are derived
  // from one place rather than listed by hand five times.
  //
  // A page with no facet selects has no facet parameters and no facet columns.
  // That is not a degraded case: a directory country page genuinely filters by
  // six tri-state checkboxes and a jurisdiction, and nothing else.
  function optionValues(select) {
    var out = [];
    if (!select) return out;
    var options = select.querySelectorAll('option');
    for (var i = 0; i < options.length; i += 1) {
      var value = options[i].getAttribute('value');
      // The "All" option carries value="" and means no restriction, so it is
      // not a value a URL can carry.
      if (value) out.push(value);
    }
    return out;
  }

  var schema = {
    facets: facets.map(function (sel) {
      var name = String(sel.getAttribute('data-bd-facet'));
      return {
        name: name,
        // List-valued facets declare themselves. The legacy 'audience' name is
        // still honoured because the business-directory pages emit it without
        // the attribute.
        multi: sel.getAttribute('data-bd-facet-multi') !== null || name === 'audience',
        values: optionValues(sel)
      };
    }),
    filters: filters.map(function (f) {
      return String(f.getAttribute('data-bd-filter')).toLowerCase();
    }),
    sorts: optionValues(sortSelect),
    jurisdictions: optionValues(jSelect),
    // The thresholds this page offers. Derived like everything else here, so a
    // page without the control has no min-dr parameter at all.
    minDr: optionValues(minDrSelect)
  };

  function num(row, key) {
    var raw = row.getAttribute('data-bd-' + key);
    return raw === '' || raw === null ? null : Number(raw);
  }

  // Rebuilds the record the server sorted, from the attributes it emitted, so
  // the shared comparator sees exactly the same shape on both sides.
  //
  // The facet and flag values are read ONCE here rather than per row per
  // keystroke: the attributes cannot change, and the media page was re-reading
  // 11 of them across 385 rows on every character typed.
  function recordOf(row) {
    var rowFacets = {};
    schema.facets.forEach(function (facet) {
      rowFacets[facet.name] = row.getAttribute('data-bd-facet-' + facet.name) || '';
    });
    var rowFlags = {};
    schema.filters.forEach(function (name) {
      rowFlags[name] = row.getAttribute('data-bd-' + name);
    });
    return {
      name: row.getAttribute('data-bd-name') || '',
      petroHrysScore: num(row, 'score'),
      domainRating: num(row, 'dr'),
      authorityScore: num(row, 'as'),
      estimatedTraffic: num(row, 'traffic'),
      facets: rowFacets,
      flags: rowFlags,
      row: row
    };
  }

  // One entry per tbody. Sorting happens WITHIN a group, never across groups,
  // so re-sorting cannot move a Californian registry into the Federal table.
  var groups = bodies.map(function (body) {
    return {
      body: body,
      box: groupBoxOf(body),
      records: Array.prototype.slice.call(body.querySelectorAll('.bd-row')).map(recordOf)
    };
  }).filter(function (g) { return g.records.length > 0; });
  if (!groups.length) return;

  var records = groups.reduce(function (all, g) { return all.concat(g.records); }, []);

  // Created only once we know there is something to count. An empty table must
  // be left exactly as the server rendered it — announcing "0 directories
  // shown" over a page the script is not managing would be a lie about state.
  var status = document.createElement('p');
  status.className = 'bd-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  var firstBox = groups[0].box;
  var anchor = firstBox || groups[0].body.parentNode;
  if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(status, anchor);

  // The records currently on screen, in the order they are on screen. Held
  // because the filtered export must hand back exactly those identities in
  // exactly that order, and rebuilding the set from anything other than the
  // page would be a second answer for the export to disagree with.
  var visible = [];

  // Group by group, in the page's own order, because sorting happens WITHIN a
  // group: flattening every record into one sorted list would interleave a
  // state registry into the federal table in the exported file even though the
  // page never shows them that way.
  //
  // `row.hidden` is the flag the pass below has just written from the
  // predicate's verdict, so this cannot select a different set than the table
  // displays. The sort is repeated rather than captured during the append loop
  // for a reason worth stating: that loop is the subject of two mutation probes
  // that match it by its exact source text, and a copy of the display order
  // smuggled into it would silently make both of them vacuous. Measured on the
  // largest page in the collection — 2,167 rows — the second sort costs 4.3 ms
  // of a 15.0 ms render.
  function displayedRecords() {
    var key = sortSelect ? sortSelect.value : 'default';
    var out = [];
    groups.forEach(function (g) {
      order.sortRecords(g.records, key).forEach(function (record) {
        if (!record.row.hidden) out.push(record);
      });
    });
    return out;
  }

  function apply() {
    var key = sortSelect ? sortSelect.value : 'default';
    groups.forEach(function (g) {
      order.sortRecords(g.records, key).forEach(function (record) {
        g.body.appendChild(record.row);
      });
    });

    // The selection, in the shape the predicate reads. The conversion is the
    // shared module's and it is the SAME one a URL goes through, so a link and a
    // control panel can never be turned into two different selections.
    var selection = D.selectionFor(readState(), schema);
    var shown = 0;
    var unknownHidden = 0;

    // The jurisdiction selection is either 'all', one group, or one state.
    var jValue = jSelect ? jSelect.value : 'all';
    var wantGroup = jValue.indexOf('group:') === 0 ? jValue.slice(6) : null;
    var wantState = jValue.indexOf('state:') === 0 ? jValue.slice(6) : null;

    records.forEach(function (record) {
      var row = record.row;
      var show = true;
      // Selecting one state shows that state's registries and nothing else;
      // selecting a group shows that group. The two never combine, because the
      // control offers one value.
      if (wantState && row.getAttribute('data-bd-jurisdiction-code') !== wantState) show = false;
      if (wantGroup && groupKeyOf(row) !== wantGroup) show = false;
      // Attributes are tri-state: 'yes', 'no' or 'unknown'. A positive filter
      // matches only 'yes'. 'unknown' is hidden because it is not a confirmed
      // match, NOT because it is a confirmed miss — the fieldset says so in
      // words, and the unknown tally is printed next to each filter label.
      // A facet whose row attribute holds a space-separated list matches on
      // MEMBERSHIP; every other facet matches on equality, and which is which
      // was settled in the schema above rather than by this matcher naming the
      // facets it knows about.
      // ── ONE PREDICATE, SHARED WITH THE TESTS ────────────────────────────
      //
      // Search, facets and tri-state filters all compose with AND inside
      // BDDiscovery.evaluate. The row's attributes were read into a plain
      // object once at load; the deciding is not done in this file.
      var verdict = D.evaluate(
        {
          haystack: row.getAttribute('data-bd-haystack') || '',
          facets: record.facets,
          flags: record.flags,
          // The Domain Rating floor reads this. Building the row without it
          // meant every record answered "no rating" and any threshold emptied
          // the table completely — the most alarming possible failure, and one
          // that only appears once the control is actually used.
          domainRating: record.domainRating
        },
        selection
      );
      if (!verdict.visible) show = false;

      row.hidden = !show;
      if (show) shown += 1;
      if (!show && verdict.hiddenForUnknown) unknownHidden += 1;
    });

    // Read back off the page, now that every row carries its verdict.
    visible = displayedRecords();

    // The state grid narrows with the selection. Selecting a PENDING state must
    // leave its card visible and say so, rather than emptying the page — the
    // point of asking about a state is to learn where it stands.
    var statesShown = 0;
    var selectedPending = null;
    stateCards.forEach(function (card) {
      var code = card.getAttribute('data-bd-state-code');
      var wanted = !wantState || code === wantState;
      // A group selection other than "state" is about tables, not the grid, so
      // the grid hides entirely rather than showing an unrelated 50 cards.
      if (wantGroup) wanted = false;
      card.hidden = !wanted;
      if (wanted) statesShown += 1;
      if (wantState && code === wantState
        && card.getAttribute('data-bd-state-status') === 'pending') selectedPending = card;
    });
    if (coverageSummary) {
      if (wantState) {
        var nameEl = null;
        stateCards.forEach(function (card) {
          if (card.getAttribute('data-bd-state-code') === wantState) {
            nameEl = card.querySelector('.bd-state-name');
          }
        });
        var stateName = nameEl ? nameEl.textContent : wantState;
        coverageSummary.textContent = selectedPending
          ? stateName + ': pending verification — no registry record is published yet'
          : stateName + ': 1 verified registry';
      } else {
        coverageSummary.textContent = coverageBase;
      }
    }

    // A group with nothing left to show is hidden entirely, so a screen reader
    // is not walked through a heading and a caption over an empty table.
    groups.forEach(function (g) {
      if (!g.box) return;
      var anyVisible = g.records.some(function (r) { return !r.row.hidden; });
      g.box.hidden = !anyVisible;
    });

    // The noun agrees with the total, not the subset: "1 of 4 directories".
    var noun = records.length === 1 ? ' directory shown' : ' directories shown';
    var base = shown === records.length
      ? String(records.length) + noun
      : String(shown) + ' of ' + String(records.length) + noun;
    var text = unknownHidden > 0
      ? base + ' (' + String(unknownHidden) + ' with unknown eligibility not shown)'
      : base;
    // "31 of 50 states" and "62 directories" count different things. Where a
    // state selection is active, say which is which in the same breath so the
    // two can never be read as one number.
    if (wantState && shown === 0) {
      text = 'No published directory for this jurisdiction — ' + String(statesShown)
        + ' state coverage entry shown';
    }
    // Written only when it CHANGED. This is a polite live region, and assigning
    // textContent replaces the text node whether or not the string moved, which
    // is a fresh announcement either way. Measured on the generated pages:
    // cycling the sort control writes the same sentence every time — 3 writes,
    // 1 distinct string on the United States page, 2 and 1 on the opportunities
    // worklist — because re-ordering cannot change how many rows are shown. And
    // 3 of the 8 keystrokes in "registry" leave the count where it was.
    //
    // The guard changes nothing a sighted reader sees; it removes announcements
    // that carry no information for a reader who is listening.
    if (status.textContent !== text) status.textContent = text;
    updateExport();
  }

  // ── URL STATE ─────────────────────────────────────────────────────────────
  //
  // The controls are the source of truth and the URL is their serialization,
  // never the other way round: readState() asks the DOM what is selected and
  // BDDiscovery turns that into a query string, so a control that exists on the
  // page is in the link and one that does not cannot be.
  //
  // Degradation is total and silent. Without history.pushState or
  // URLSearchParams — the two capabilities this needs — filtering still works
  // exactly as it did before, on the same prerendered table; only the address
  // bar stops following along. Nothing is written into markup either way: the
  // one free-text value reaches input.value and the predicate, and every other
  // value has already been checked against the options this page offers.
  //
  // AND THE URL BELONGS TO WHOEVER OWNS THE CONTROLS. This file adopts any page
  // carrying a [data-bd-rows] table. The Distribution Planner carries three of
  // them and none of these controls: its state lives in [data-dp-filter] selects
  // and is serialized by its own client, which cannot boot until a 1.2 MB
  // payload has arrived. Measured in Chrome — the boot below ran first, read an
  // empty state out of a page with no controls to read, and REPLACED
  //   /research/distribution-planner/?business=ai-startup&market=germany&…
  // with the bare path. Every shared campaign link therefore opened as the
  // default campaign, with the address bar quietly agreeing. A page whose
  // controls this file does not render has no state here to serialize, so it
  // has no business rewriting that page's address.
  var ownsState = !!(searchInput || jSelect || sortSelect) || !!filters.length || !!facets.length;
  var canSyncUrl = ownsState
    && typeof window !== 'undefined'
    && !!window.history && typeof window.history.pushState === 'function'
    && typeof window.history.replaceState === 'function'
    && typeof window.URLSearchParams === 'function'
    && !!window.location && typeof window.location.pathname === 'string';

  function readState() {
    var chosen = {};
    facets.forEach(function (sel, i) { chosen[schema.facets[i].name] = sel.value; });
    var checked = [];
    filters.forEach(function (f, i) { if (f.checked) checked.push(schema.filters[i]); });
    return {
      q: searchInput ? searchInput.value : '',
      facets: chosen,
      filters: checked,
      jurisdiction: jSelect ? jSelect.value : '',
      sort: sortSelect ? sortSelect.value : '',
      minDr: minDrSelect ? minDrSelect.value : ''
    };
  }

  function writeState(state) {
    if (searchInput) searchInput.value = state.q || '';
    facets.forEach(function (sel, i) {
      sel.value = (state.facets || {})[schema.facets[i].name] || '';
    });
    filters.forEach(function (f, i) {
      f.checked = (state.filters || []).indexOf(schema.filters[i]) !== -1;
    });
    if (jSelect) jSelect.value = state.jurisdiction || D.defaultJurisdiction(schema);
    if (sortSelect) sortSelect.value = state.sort || D.defaultSort(schema);
    if (minDrSelect) minDrSelect.value = state.minDr || '';
  }

  function syncUrl(push) {
    if (!canSyncUrl) return;
    var url = window.location.pathname + D.serializeState(readState(), schema);
    if (push) window.history.pushState(null, '', url);
    else window.history.replaceState(null, '', url);
  }

  // What a discrete control does: re-render, then record the new selection as a
  // history entry so Back returns to the previous one.
  function interact() {
    apply();
    syncUrl(true);
  }

  // What typing does: the same render, but REPLACING the current entry instead
  // of adding one. Search fires on every keystroke, and pushing per keystroke
  // would make "india" five history entries deep — Back would walk the reader
  // backwards through their own typing, five presses to leave the page. The URL
  // still tracks the query exactly; it just does not accumulate.
  function typed() {
    apply();
    syncUrl(false);
  }

  // ── FILTERED EXPORT ───────────────────────────────────────────────────────
  //
  // A SECOND action, deliberately not a replacement. The "Download all N" link
  // beside it is a static file and keeps working with no JavaScript at all;
  // this button exports the rows on screen and therefore cannot exist without
  // JavaScript, so it stays hidden until the capabilities it needs are proven
  // present.
  var exportLabel = exportBtn ? (exportBtn.getAttribute('data-bd-export-label') || '') : '';
  var exportName = exportBtn ? (exportBtn.getAttribute('data-bd-export-name') || '') : '';
  var canExport = !!exportBtn && typeof window !== 'undefined'
    && typeof window.Blob === 'function'
    && !!window.URL && typeof window.URL.createObjectURL === 'function'
    && 'download' in document.createElement('a');

  function updateExport() {
    if (!canExport) return;
    // The count is the length of the array that will actually be written, read
    // after every render. A count taken from anywhere else — the status line,
    // the row total, a cached number — is a promise the file may not keep.
    exportBtn.textContent = exportLabel.split('{n}').join(String(visible.length));
    // Nothing to export is a state, not an error, and it is shown as one. The
    // alternative failure is the dangerous one: a reader who filtered down to
    // nothing presses export and silently receives the whole collection.
    exportBtn.disabled = visible.length === 0;
  }

  if (canExport) {
    if (exportWrap) exportWrap.hidden = false;
    else exportBtn.hidden = false;
    exportBtn.addEventListener('click', function () {
      if (!visible.length) return;
      var csv = D.renderFilteredCsv(visible, D.exportColumns(schema));
      var blob = new window.Blob([csv], { type: 'text/csv;charset=utf-8' });
      var href = window.URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = href;
      // Deterministic, sanitized, and carrying nothing the reader typed.
      link.download = D.exportFilename(exportName);
      // Some browsers only act on a click if the anchor is in the document, so
      // it is put there and taken straight back out; nothing is left behind.
      if (document.body) document.body.appendChild(link);
      if (typeof link.click === 'function') link.click();
      if (document.body && link.parentNode === document.body) document.body.removeChild(link);
      // Released on the next tick, not this one: revoking synchronously can
      // cancel the download the click has only just started.
      var release = function () {
        if (typeof window.URL.revokeObjectURL === 'function') window.URL.revokeObjectURL(href);
      };
      if (typeof setTimeout === 'function') setTimeout(release, 0);
      else release();
    });
  }

  if (jSelect) jSelect.addEventListener('change', interact);
  if (sortSelect) sortSelect.addEventListener('change', interact);
  if (searchInput) searchInput.addEventListener('input', typed);
  filters.forEach(function (f) { f.addEventListener('change', interact); });
  facets.forEach(function (sel) { sel.addEventListener('change', interact); });
  if (minDrSelect) minDrSelect.addEventListener('change', interact);
  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      if (searchInput) searchInput.value = '';
      filters.forEach(function (f) { f.checked = false; });
      facets.forEach(function (sel) { sel.value = ''; });
      if (jSelect) jSelect.value = D.defaultJurisdiction(schema);
      if (minDrSelect) minDrSelect.value = '';
      // The sort goes back to the page's own order too. Leaving it behind made
      // "clear" mean "clear most of it": a reader who had sorted by Domain
      // Rating, filtered, then cleared, was returned to an unfiltered list
      // still ranked by an external metric they had asked for three clicks ago,
      // with a URL that no longer said so.
      if (sortSelect) sortSelect.value = D.defaultSort(schema);
      interact();
      if (searchInput) searchInput.focus();
    });
  }

  // Back and forward restore the CONTROLS and the RESULTS together. Restoring
  // one without the other is worse than restoring neither: the page would show
  // one selection and the results of a different one, with nothing on screen
  // admitting the two disagree.
  if (canSyncUrl && typeof window.addEventListener === 'function') {
    window.addEventListener('popstate', function () {
      writeState(D.parseState(new window.URLSearchParams(window.location.search), schema));
      apply();
    });
  }

  // Boot. A link that arrives with a selection in it is applied before the
  // first render, so the reader never sees the unfiltered table flash past.
  // The URL is then REPLACED rather than pushed: arriving on a page is not a
  // navigation the Back button should have to undo, and replacing also
  // normalises a hand-written link — dropped junk parameters and all — into the
  // exact address that reproduces what is on screen.
  if (canSyncUrl) {
    writeState(D.parseState(new window.URLSearchParams(window.location.search), schema));
    apply();
    syncUrl(false);
  } else {
    apply();
  }
})();
