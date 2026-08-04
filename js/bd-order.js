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

  // The name a reader actually sees. The server holds the full record; the
  // browser rebuilds one from data-bd-name, which already carries the resolved
  // display name. Resolving in the same order on both sides is what keeps the
  // prerendered order and the re-sorted order identical — comparing raw `name`
  // here while the row advertises the resolved name made them disagree.
  function displayNameOf(r) {
    if (!r) return '';
    return String(r.englishName || r.officialName || r.nativeName || r.name || '');
  }

  // Unicode default case folding, then a UTF-16 code-unit tiebreak so the order
  // is total and identical on every platform.
  function compareByName(a, b) {
    var an = displayNameOf(a);
    var bn = displayNameOf(b);
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
    // The two rankings are independent and each names its own tiebreak, so a
    // reader sorting by authority still sees editorial value separating equal
    // Domain Ratings, and vice versa. Nulls sort last in both: a record with no
    // measurement is not a record with a low one.
    'domain-rating': {
      key: 'domain-rating',
      label: 'Domain Rating',
      compare: function (a, b) {
        return nullLastDesc(a.domainRating, b.domainRating)
          || nullLastDesc(a.petroHrysScore, b.petroHrysScore)
          || compareByName(a, b);
      }
    },
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
    displayNameOf: displayNameOf,
    compareByName: compareByName,
    SORTS: SORTS,
    SORT_KEYS: SORT_KEYS,
    sortRecords: sortRecords,
    COMPARED_FIELDS: COMPARED_FIELDS
  };
}));
