/* Canonical ordering model for Business Directories.
 *
 * This file is the ONE authoritative comparator specification. The generator
 * requires it through scripts/lib/bd-sort.cjs; the browser loads it as a global
 * before js/business-directories.js. Both therefore sort through the identical
 * functions, so a prerendered page and the same page after enhancement can
 * never disagree.
 *
 * Written in ES5 with a UMD wrapper so one file serves Node and the browser
 * without a build step. Deliberately avoids localeCompare: its ordering depends
 * on the platform's ICU build, so identical data could sort differently on two
 * machines.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BDOrder = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function nullLastDesc(a, b) {
    var aNull = a === null || a === undefined;
    var bNull = b === null || b === undefined;
    if (aNull && bNull) return 0;
    if (aNull) return 1;
    if (bNull) return -1;
    return b - a;
  }

  // Unicode default case folding, then a UTF-16 code-unit tiebreak so the order
  // is total and identical on every platform.
  function compareByName(a, b) {
    var an = String(a && a.name != null ? a.name : '');
    var bn = String(b && b.name != null ? b.name : '');
    var af = an.toLowerCase();
    var bf = bn.toLowerCase();
    if (af < bf) return -1;
    if (af > bf) return 1;
    if (an < bn) return -1;
    if (an > bn) return 1;
    return 0;
  }

  function byMetric(field) {
    return function (a, b) {
      return nullLastDesc(a[field], b[field]) || compareByName(a, b);
    };
  }

  var SORTS = {
    'default': {
      key: 'default',
      label: 'PetroHrys Score',
      compare: function (a, b) {
        return nullLastDesc(a.petroHrysScore, b.petroHrysScore)
          || nullLastDesc(a.domainRating, b.domainRating)
          || compareByName(a, b);
      }
    },
    'domain-rating': { key: 'domain-rating', label: 'Domain Rating', compare: byMetric('domainRating') },
    'authority-score': { key: 'authority-score', label: 'Authority Score', compare: byMetric('authorityScore') },
    'traffic': { key: 'traffic', label: 'Estimated Traffic', compare: byMetric('estimatedTraffic') },
    'alphabetical': { key: 'alphabetical', label: 'Alphabetical', compare: compareByName }
  };

  var SORT_KEYS = ['default', 'domain-rating', 'authority-score', 'traffic', 'alphabetical'];

  // Stability comes from the explicit index tiebreak, not from the engine's
  // sort being stable, so behaviour is identical on any runtime.
  function sortRecords(list, key) {
    var compare = (SORTS[key] || SORTS['default']).compare;
    var decorated = [];
    var i;
    for (i = 0; i < list.length; i += 1) decorated.push({ item: list[i], index: i });
    decorated.sort(function (a, b) { return compare(a.item, b.item) || (a.index - b.index); });
    var out = [];
    for (i = 0; i < decorated.length; i += 1) out.push(decorated[i].item);
    return out;
  }

  // The fields the comparators read. The renderer emits exactly these as data
  // attributes so a DOM row can be turned back into a comparable record.
  var COMPARED_FIELDS = ['name', 'petroHrysScore', 'domainRating', 'authorityScore', 'estimatedTraffic'];

  return {
    nullLastDesc: nullLastDesc,
    compareByName: compareByName,
    SORTS: SORTS,
    SORT_KEYS: SORT_KEYS,
    sortRecords: sortRecords,
    COMPARED_FIELDS: COMPARED_FIELDS
  };
}));
