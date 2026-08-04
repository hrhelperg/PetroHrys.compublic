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
  var tbody = bodies[0];
  if (!tbody) return;

  var rows = Array.prototype.slice.call(tbody.querySelectorAll('.bd-row'));
  if (!rows.length) return;

  var sortSelect = document.querySelector('[data-bd-sort]');
  var searchInput = document.querySelector('[data-bd-search]');
  var filters = Array.prototype.slice.call(document.querySelectorAll('[data-bd-filter]'));

  // Reveal the controls only once the behaviour behind them exists. Without
  // JavaScript they stay hidden and the prerendered table is complete.
  ['[data-bd-sort-wrap]', '[data-bd-filter-wrap]', '[data-bd-search-wrap]'].forEach(function (sel) {
    var el = document.querySelector(sel);
    if (el) el.hidden = false;
  });

  // Filtering changes what is visible, so announce the resulting count.
  var status = document.createElement('p');
  status.className = 'bd-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  var table = tbody.parentNode;
  if (table && table.parentNode) table.parentNode.insertBefore(status, table);

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

  var records = rows.map(recordOf);

  function apply() {
    var key = sortSelect ? sortSelect.value : 'default';
    order.sortRecords(records, key).forEach(function (record) {
      tbody.appendChild(record.row);
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
