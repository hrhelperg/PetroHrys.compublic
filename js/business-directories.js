/* Business Directories — progressive enhancement only.
 *
 * Reorders and hides table rows that are already prerendered. Performs no
 * network request of any kind, and writes only textContent, never markup.
 *
 * Ordering is delegated entirely to BDOrder (js/bd-order.js), the same module
 * the generator uses server-side, so an enhanced page can never disagree with
 * the prerendered one.
 */
(function () {
  'use strict';

  var order = typeof BDOrder !== 'undefined' ? BDOrder
    : (typeof window !== 'undefined' ? window.BDOrder : null);
  if (!order) return; // ordering model unavailable: leave the server order alone

  // Every group's tbody. Once a country page groups by jurisdiction there is
  // one per group, and a singular query would leave search, filter and sort
  // touching only the first — with a status count for the whole page.
  var bodies = Array.prototype.slice.call(document.querySelectorAll('[data-bd-rows]'));
  if (!bodies.length) return;

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
  var searchInput = document.querySelector('[data-bd-search]');
  var filters = Array.prototype.slice.call(document.querySelectorAll('[data-bd-filter]'));

  // Reveal the controls only once the behaviour behind them exists. Without
  // JavaScript they stay hidden and the prerendered table is complete.
  ['[data-bd-sort-wrap]', '[data-bd-filter-wrap]', '[data-bd-search-wrap]'].forEach(function (sel) {
    var el = document.querySelector(sel);
    if (el) el.hidden = false;
  });

  function num(row, key) {
    var raw = row.getAttribute('data-bd-' + key);
    return raw === '' || raw === null ? null : Number(raw);
  }

  // Rebuilds the record the server sorted, from the attributes it emitted, so
  // the shared comparator sees exactly the same shape on both sides.
  function recordOf(row) {
    return {
      name: row.getAttribute('data-bd-name') || '',
      petroHrysScore: num(row, 'score'),
      domainRating: num(row, 'dr'),
      authorityScore: num(row, 'as'),
      estimatedTraffic: num(row, 'traffic'),
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

  function apply() {
    var key = sortSelect ? sortSelect.value : 'default';
    groups.forEach(function (g) {
      order.sortRecords(g.records, key).forEach(function (record) {
        g.body.appendChild(record.row);
      });
    });

    var query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    var active = filters.filter(function (f) { return f.checked; });
    var shown = 0;
    var unknownHidden = 0;

    records.forEach(function (record) {
      var row = record.row;
      var visible = true;
      if (query && (row.getAttribute('data-bd-haystack') || '').indexOf(query) === -1) visible = false;
      // Attributes are tri-state: 'yes', 'no' or 'unknown'. A positive filter
      // matches only 'yes'. 'unknown' is hidden because it is not a confirmed
      // match, NOT because it is a confirmed miss — the fieldset says so in
      // words, and the unknown tally is printed next to each filter label.
      var hiddenUnknown = 0;
      active.forEach(function (f) {
        var attr = 'data-bd-' + String(f.getAttribute('data-bd-filter')).toLowerCase();
        var value = row.getAttribute(attr);
        if (value !== 'yes') {
          if (value === 'unknown') hiddenUnknown += 1;
          visible = false;
        }
      });
      row.hidden = !visible;
      if (visible) shown += 1;
      if (!visible && hiddenUnknown > 0) unknownHidden += 1;
    });

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
    status.textContent = unknownHidden > 0
      ? base + ' (' + String(unknownHidden) + ' with unknown eligibility not shown)'
      : base;
  }

  if (sortSelect) sortSelect.addEventListener('change', apply);
  if (searchInput) searchInput.addEventListener('input', apply);
  filters.forEach(function (f) { f.addEventListener('change', apply); });

  apply();
})();
