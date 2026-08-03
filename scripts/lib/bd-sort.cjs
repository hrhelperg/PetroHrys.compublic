// scripts/lib/bd-sort.cjs
'use strict';

// The comparator specification lives in js/bd-order.js, which the browser also
// loads. This module is a thin server-side adapter over it, so there is exactly
// one ordering implementation rather than a Node copy and a browser copy that
// can drift apart.
const order = require('../../js/bd-order.js');

// Returns a frozen array. Elements are deliberately NOT frozen: they are the
// caller's registry records and freezing them would mutate shared state.
function sortDirectories(list, key = 'default') {
  return Object.freeze(order.sortRecords(list, key));
}

module.exports = {
  SORTS: order.SORTS,
  SORT_KEYS: order.SORT_KEYS,
  compareByName: order.compareByName,
  COMPARED_FIELDS: order.COMPARED_FIELDS,
  sortDirectories,
};
