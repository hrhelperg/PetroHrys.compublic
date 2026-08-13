'use strict';

// The adapter registry, and the one contract every adapter honours.
//
// ── THE CONTRACT ────────────────────────────────────────────────────────────
//
//   id                                 matches a source id in to-sources.cjs
//   fetchAll({source, nowIso, log})    NETWORK. Returns
//                                        { raw, pages, population, complete, endpoint }
//   normalize(raw, ctx)                PURE. Returns a canonical opportunity,
//                                        or null to reject the record
//
// The split is the whole design. `fetchAll` is the only part that touches the
// network and it appears exactly once per source; `normalize` is a pure
// function of one raw record, which is why the tests can exercise every
// source's normalization — including the failure modes — with no network at
// all, and why the site build never needs either.
//
// Raw payloads stay source-shaped on purpose. TED returns multilingual maps,
// the UK returns OCDS release packages, Canada returns CSV rows, and forcing
// those into a common raw schema would mean inventing a lowest common
// denominator before anyone has looked at the data. Canonicalization is the
// shared boundary; everything above it is allowed to be different.

const ted = require('./ted.cjs');
const ukFts = require('./uk-fts.cjs');
const canadabuys = require('./canadabuys.cjs');
const worldbank = require('./worldbank.cjs');
const secop2 = require('./secop2.cjs');
const tenderned = require('./tenderned.cjs');
const boamp = require('./boamp.cjs');
const { makeOcdsAdapter } = require('./ocds.cjs');

// Phase 2. South Africa is built from the shared OCDS factory rather than
// hand-written: it is the first of several OCDS publishers, and the second one
// should cost a configuration block rather than a file.
const zaEtenders = makeOcdsAdapter({
  id: 'za-etenders', pager: 'pageNumberDateRange', country: 'south-africa',
});

// Phase 3. Contracts Finder is OCDS 1.1 with a cursor, so it is another
// configuration of the same factory. Germany is not — see de-vergabe.cjs for
// why "both say OCDS" was not sufficient reason to share an adapter.
const ukContractsFinder = makeOcdsAdapter({
  id: 'uk-contracts-finder', pager: 'publishedFromCursor', country: 'united-kingdom',
});
const deVergabe = require('./de-vergabe.cjs');

// Expansion v2. The United States, from GSA's daily bulk extract — one 251 MB
// CSV rather than a paged API, which is why it streams and projects columns
// instead of materialising whole rows like every adapter above it.
const samGov = require('./sam-gov.cjs');

// Poland's statutory below-EU-threshold bulletin. A paged JSON board rather
// than a bulk file, and the first source whose window is defined by a DEADLINE
// filter instead of a publication date — which is what makes its current
// universe addressable at all.
const plBzp = require('./pl-bzp.cjs');

const ADAPTERS = [ted, ukFts, canadabuys, worldbank, secop2, tenderned, boamp, zaEtenders,
  ukContractsFinder, deVergabe, samGov, plBzp];
const BY_ID = new Map(ADAPTERS.map((a) => [a.id, a]));

function adapterFor(sourceId) {
  const a = BY_ID.get(sourceId);
  if (!a) throw new Error(`No adapter registered for source "${sourceId}"`);
  return a;
}

// Every adapter must satisfy the contract. Checked in tests rather than
// assumed, so a sixth adapter cannot join with a missing half.
function contractProblems(a) {
  const p = [];
  if (!a || typeof a.id !== 'string' || !a.id) p.push('adapter has no id');
  if (typeof (a && a.fetchAll) !== 'function') p.push(`${a && a.id}: fetchAll is not a function`);
  if (typeof (a && a.normalize) !== 'function') p.push(`${a && a.id}: normalize is not a function`);
  if (a && a.normalize && a.normalize.length < 2) p.push(`${a.id}: normalize must take (raw, context)`);
  return p;
}

module.exports = { ADAPTERS, BY_ID, adapterFor, contractProblems };
