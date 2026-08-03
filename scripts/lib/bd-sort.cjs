// scripts/lib/bd-sort.cjs
'use strict';

function nullLastDesc(a, b) {
  const aNull = a === null || a === undefined;
  const bNull = b === null || b === undefined;
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;
  return b - a;
}

// Deliberately avoids the locale-aware string comparator: its ordering depends
// on the platform's ICU build, so identical data could sort differently on two
// machines. toLowerCase() uses Unicode default case folding and is not
// locale-sensitive; the code-unit tiebreak then makes the order total.
function compareByName(a, b) {
  const an = String(a.name ?? '');
  const bn = String(b.name ?? '');
  const af = an.toLowerCase();
  const bf = bn.toLowerCase();
  if (af < bf) return -1;
  if (af > bf) return 1;
  if (an < bn) return -1;
  if (an > bn) return 1;
  return 0;
}

const SORTS = {
  default: {
    key: 'default',
    label: 'PetroHrys Score',
    compare: (a, b) =>
      nullLastDesc(a.petroHrysScore, b.petroHrysScore) ||
      nullLastDesc(a.domainRating, b.domainRating) ||
      compareByName(a, b),
  },
  'domain-rating': {
    key: 'domain-rating',
    label: 'Domain Rating',
    compare: (a, b) => nullLastDesc(a.domainRating, b.domainRating) || compareByName(a, b),
  },
  'authority-score': {
    key: 'authority-score',
    label: 'Authority Score',
    compare: (a, b) => nullLastDesc(a.authorityScore, b.authorityScore) || compareByName(a, b),
  },
  traffic: {
    key: 'traffic',
    label: 'Estimated Traffic',
    compare: (a, b) => nullLastDesc(a.estimatedTraffic, b.estimatedTraffic) || compareByName(a, b),
  },
  alphabetical: { key: 'alphabetical', label: 'Alphabetical', compare: compareByName },
};

const SORT_KEYS = ['default', 'domain-rating', 'authority-score', 'traffic', 'alphabetical'];

// Stability is guaranteed here by the explicit index tiebreak rather than by
// relying on the engine's sort being stable.
function sortDirectories(list, key = 'default') {
  const compare = (SORTS[key] || SORTS.default).compare;
  const decorated = Array.from(list, (item, index) => ({ item, index }));
  decorated.sort((a, b) => compare(a.item, b.item) || (a.index - b.index));
  // Freeze the array only. Freezing elements would mutate the caller's records.
  return Object.freeze(decorated.map(({ item }) => item));
}

module.exports = { SORTS, SORT_KEYS, sortDirectories, compareByName };
