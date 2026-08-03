/* Business Directories — progressive enhancement only.
   Reorders and hides table rows that are already prerendered. Performs no
   network request of any kind, and writes only textContent, never markup. */
(function () {
  'use strict';

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

  // Filtering changes what is visible, so announce the result count.
  var status = document.createElement('p');
  status.className = 'bd-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  var table = tbody.closest ? tbody.closest('table') : null;
  if (table && table.parentNode) table.parentNode.insertBefore(status, table);

  function num(row, key) {
    var raw = row.getAttribute('data-bd-' + key);
    return raw === '' || raw === null ? null : Number(raw);
  }

  function nullLastDesc(a, b) {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return b - a;
  }

  // Mirrors bd-sort.cjs exactly: case-folded compare with a code-unit tiebreak.
  // localeCompare is avoided so the client order matches the server order on
  // every platform.
  function byName(a, b) {
    var an = a.getAttribute('data-bd-name') || '';
    var bn = b.getAttribute('data-bd-name') || '';
    if (an < bn) return -1;
    if (an > bn) return 1;
    return 0;
  }

  var COMPARATORS = {
    'default': function (a, b) {
      return nullLastDesc(num(a, 'score'), num(b, 'score'))
        || nullLastDesc(num(a, 'dr'), num(b, 'dr'))
        || byName(a, b);
    },
    'domain-rating': function (a, b) { return nullLastDesc(num(a, 'dr'), num(b, 'dr')) || byName(a, b); },
    'authority-score': function (a, b) { return nullLastDesc(num(a, 'as'), num(b, 'as')) || byName(a, b); },
    'traffic': function (a, b) { return nullLastDesc(num(a, 'traffic'), num(b, 'traffic')) || byName(a, b); },
    'alphabetical': byName
  };

  function apply() {
    var key = sortSelect ? sortSelect.value : 'default';
    var compare = COMPARATORS[key] || COMPARATORS['default'];

    // Stability by explicit index tiebreak, matching the server comparator.
    var decorated = rows.map(function (row, index) { return { row: row, index: index }; });
    decorated.sort(function (a, b) { return compare(a.row, b.row) || (a.index - b.index); });
    decorated.forEach(function (entry) { tbody.appendChild(entry.row); });

    var query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    var active = filters.filter(function (f) { return f.checked; });
    var shown = 0;

    rows.forEach(function (row) {
      var visible = true;
      if (query && (row.getAttribute('data-bd-haystack') || '').indexOf(query) === -1) visible = false;
      active.forEach(function (f) {
        var attr = 'data-bd-' + String(f.getAttribute('data-bd-filter')).toLowerCase();
        if (row.getAttribute(attr) !== '1') visible = false;
      });
      row.hidden = !visible;
      if (visible) shown += 1;
    });

    status.textContent = shown === rows.length
      ? String(rows.length) + ' directories shown'
      : String(shown) + ' of ' + String(rows.length) + ' directories shown';
  }

  if (sortSelect) sortSelect.addEventListener('change', apply);
  if (searchInput) searchInput.addEventListener('input', apply);
  filters.forEach(function (f) { f.addEventListener('change', apply); });

  apply();
})();
