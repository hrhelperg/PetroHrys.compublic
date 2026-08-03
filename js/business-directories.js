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

  var tbody = document.querySelector('[data-bd-rows]');
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

    records.forEach(function (record) {
      var row = record.row;
      var visible = true;
      if (query && (row.getAttribute('data-bd-haystack') || '').indexOf(query) === -1) visible = false;
      active.forEach(function (f) {
        var attr = 'data-bd-' + String(f.getAttribute('data-bd-filter')).toLowerCase();
        if (row.getAttribute(attr) !== '1') visible = false;
      });
      row.hidden = !visible;
      if (visible) shown += 1;
    });

    status.textContent = shown === records.length
      ? String(records.length) + ' directories shown'
      : String(shown) + ' of ' + String(records.length) + ' directories shown';
  }

  if (sortSelect) sortSelect.addEventListener('change', apply);
  if (searchInput) searchInput.addEventListener('input', apply);
  filters.forEach(function (f) { f.addEventListener('change', apply); });

  apply();
})();
