'use strict';

// Marketplace & Classified Platforms — a SEPARATE dataset.
//
// This is deliberately not part of the business-directory registry, and the
// separation is the same lesson that produced the Level 1 / Level 2 split
// there: mixing two datasets with different contracts into one file made 49
// assertions fail, because those assertions protected real properties of
// directory records that a marketplace row does not have.
//
// A business directory answers "where can a company publish a PROFILE?".
// A marketplace answers "where can a company publish a LISTING?" — an item, a
// vehicle, a property, a job, a service. The two overlap in the mind and not in
// the data: a marketplace row has a marketplace type and no listing action, no
// Domain Rating, no editorial score, no detail page.
//
// Geography is the one thing shared. Countries come from the business-directory
// geography file because a country is a country; duplicating that list would
// let two files disagree about whether Serbia exists.

const fs = require('node:fs');
const path = require('node:path');

class MarketplaceError extends Error {}

// ── SELLER ACTIONABILITY ────────────────────────────────────────────────────
//
// The header above says a marketplace row has "no listing action". That was
// true of the data and never true of the product: 295 active marketplaces and
// not one recorded route, because there was nowhere to put one. A planner that
// can tell you a marketplace exists but not how to sell on it is answering the
// wrong half of the question.
//
// This adds the smallest thing that fixes it, and deliberately invents no new
// vocabulary. The Distribution Planner already carries a canonical action
// ontology with three marketplace concepts in it — create-seller-profile,
// publish-classified, post-advertisement — and already derives one of them for
// every marketplace row from `marketplaceType`. What it says about that
// derivation is the point:
//
//   "The marketplace collection records no per-platform submission URL, so the
//    projection carries none. It does not invent one from the website."
//
// So the gap is a FIELD, not a subsystem. Two of them.
//
// The non-action values mirror the directory collection's `listingAction`,
// which learned the same lesson first: "no self-service route" is a real
// finding and needs somewhere truthful to sit, or every platform gets pushed
// toward looking actionable.
const SELLER_ACTIONS = [
  'create-seller-profile',  // open onboarding: "Become a seller", "Start selling"
  'publish-classified',     // "Post an ad", "List your item"
  'post-advertisement',     // paid placement offered to a business
  'apply-for-inclusion',    // merchant application, reviewed before approval
  'invite-only',            // supply is curated; no public route exists
  'not-applicable',         // buyer-only, or the operator supplies the inventory
  'unknown',                // NOT researched. The default, and never a guess.
];

// Values that name a route someone can actually take. The rest are findings
// about the platform, and a route recorded against one of them is a
// contradiction rather than a bonus.
const ACTIONABLE_SELLER_ACTIONS = [
  'create-seller-profile', 'publish-classified', 'post-advertisement', 'apply-for-inclusion',
];

// What KIND of listing the platform carries. A platform that carries several
// declares its primary type and lists the rest in `alsoCovers`, so a filter can
// be precise without a row having to pick one identity it does not have.
const MARKETPLACE_TYPES = [
  'general-classifieds',   // everything: the Bazoš / OLX / Marktplaats shape
  'vehicles',
  'property',
  'jobs',
  'b2b',                   // business-to-business trade listings
  'services',
  'fashion-resale',
  'auctions',
  // Peer-to-peer resale of general goods. Added when the operator/country/type
  // guard flagged Taobao and Xianyu as one platform: both are Alibaba, both are
  // Chinese, and both were 'general-classifieds' — but a merchant retail
  // marketplace and a consumer resale marketplace are not the same listing, and
  // a vocabulary that cannot tell them apart makes the guard produce a false
  // positive. The distinction is real and several platforms needed it.
  'second-hand',
];

// Who may publish. This is the axis that matters to an employee: a platform
// that only accepts private sellers is useless to a business, however large.
const SELLER_TYPES = ['business', 'private', 'both'];

// Cost to publish a listing. Same vocabulary as the directory dataset so a
// reader moving between the two is never asked to learn two words for one idea.
const COST_MODELS = ['free', 'paid', 'freemium', 'unknown'];

const CURRENT_STATUSES = ['active', 'unknown', 'shutting-down', 'dormant', 'redirected'];

const REQUIRED = ['id', 'name', 'website', 'country', 'marketplaceType', 'sellerTypes',
  'costModel', 'currentStatus'];

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function problemsFor(row, knownCountries) {
  const p = [];
  const id = row && row.id ? row.id : '(unnamed)';
  const at = (f, m) => p.push([`${id} ${f}`, m]);

  for (const f of REQUIRED) {
    if (row[f] === undefined || row[f] === null || row[f] === '') at(f, 'is required.');
  }
  if (typeof row.id === 'string' && !SLUG_RE.test(row.id)) {
    at('id', 'must be a lowercase hyphenated slug.');
  }
  if (typeof row.website === 'string' && !/^https:\/\//.test(row.website)) {
    at('website', 'must be an https URL.');
  }
  if (row.country && !knownCountries.has(row.country)) {
    at('country', `"${row.country}" is not a declared country.`);
  }
  if (row.marketplaceType && !MARKETPLACE_TYPES.includes(row.marketplaceType)) {
    at('marketplaceType', `must be one of ${MARKETPLACE_TYPES.join(', ')}.`);
  }
  if (row.alsoCovers !== undefined && row.alsoCovers !== null) {
    if (!Array.isArray(row.alsoCovers)) at('alsoCovers', 'must be an array, or absent.');
    else {
      for (const t of row.alsoCovers) {
        if (!MARKETPLACE_TYPES.includes(t)) at('alsoCovers', `"${t}" is not a marketplace type.`);
      }
      if (row.alsoCovers.includes(row.marketplaceType)) {
        at('alsoCovers', 'repeats the primary marketplace type.');
      }
      const sorted = [...row.alsoCovers].sort();
      if (sorted.join(',') !== row.alsoCovers.join(',')) at('alsoCovers', 'must be sorted.');
    }
  }
  if (row.sellerTypes && !SELLER_TYPES.includes(row.sellerTypes)) {
    at('sellerTypes', `must be one of ${SELLER_TYPES.join(', ')}.`);
  }
  if (row.costModel && !COST_MODELS.includes(row.costModel)) {
    at('costModel', `must be one of ${COST_MODELS.join(', ')}.`);
  }
  if (row.currentStatus && !CURRENT_STATUSES.includes(row.currentStatus)) {
    at('currentStatus', `must be one of ${CURRENT_STATUSES.join(', ')}.`);
  }
  if (row.operator !== undefined && row.operator !== null && typeof row.operator !== 'string') {
    at('operator', 'must be a string, or null where no operator was established.');
  }
  if (row.note !== undefined && typeof row.note !== 'string') at('note', 'must be a string.');

  if (row.sellerAction !== undefined && row.sellerAction !== null
    && !SELLER_ACTIONS.includes(row.sellerAction)) {
    at('sellerAction', `must be one of: ${SELLER_ACTIONS.join(', ')}, or absent when never researched.`);
  }
  if (row.sellerActionUrl !== undefined && row.sellerActionUrl !== null) {
    if (typeof row.sellerActionUrl !== 'string' || !/^https:\/\//.test(row.sellerActionUrl)) {
      at('sellerActionUrl', 'must be an absolute https URL, or absent.');
    }
    // A route identical to the homepage tells a seller nothing they did not
    // already have, while claiming they were given somewhere to go.
    if (row.sellerActionUrl === row.website) {
      at('sellerActionUrl', 'is the platform homepage, which is not a route.');
    }
    // And a route only means something next to an action that can be taken.
    if (!ACTIONABLE_SELLER_ACTIONS.includes(row.sellerAction)) {
      at('sellerActionUrl', `is set, but sellerAction is ${JSON.stringify(row.sellerAction ?? null)}; `
        + `a route is only recorded alongside one of: ${ACTIONABLE_SELLER_ACTIONS.join(', ')}.`);
    }
  }
  // The reverse is allowed on purpose: an evidenced action whose URL could not
  // be resolved is a real, partial finding, and forcing a URL to keep the pair
  // symmetrical is how a guessed route gets written down.
  // A Domain Rating is never carried here. The directory dataset holds 64 frozen
  // historical measurements and nothing in this dataset may imply a new one.
  if (row.domainRating !== undefined && row.domainRating !== null) {
    at('domainRating', 'may not be set: this dataset takes no metric measurements.');
  }
  return p;
}

// A row is publishable when it is reachable enough to be worth an employee's
// time. Same shape of rule as the directory dataset: a blocked platform is
// unknown, never excluded, because a bot filter says nothing about the product.
function isPublishable(row) {
  if (!row) return false;
  if (['shutting-down', 'dormant', 'redirected'].includes(row.currentStatus)) return false;
  return typeof row.website === 'string' && /^https:\/\//.test(row.website);
}

// Code-unit ordering. localeCompare would make the render depend on host ICU.
const compareStable = (a, b) => {
  const as = String(a ?? '');
  const bs = String(b ?? '');
  if (as < bs) return -1;
  if (as > bs) return 1;
  return 0;
};

function loadMarketplaces(file, knownCountries) {
  if (!fs.existsSync(file)) return [];
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (cause) {
    throw new MarketplaceError(`Corrupt marketplaces file: ${cause.message}`);
  }
  if (!Array.isArray(raw)) throw new MarketplaceError('marketplaces.json must contain an array.');

  const problems = [];
  const ids = new Set();
  const hosts = new Map();
  for (const row of raw) {
    problems.push(...problemsFor(row, knownCountries));
    if (ids.has(row.id)) problems.push([`${row.id}`, 'is declared twice.']);
    ids.add(row.id);
    // One submission, one row: two entries on one host in one country are the
    // same platform listed twice.
    const host = String(row.website || '').replace(/^https:\/\/(www\.)?/, '').split('/')[0];
    const key = `${row.country}|${host}`;
    if (hosts.has(key)) problems.push([`${row.id}`, `shares a host with ${hosts.get(key)}.`]);
    else hosts.set(key, row.id);
  }
  if (problems.length) {
    throw new MarketplaceError(`marketplaces.json failed validation:\n${
      problems.map(([f, m]) => `  ${f}: ${m}`).join('\n')}`);
  }
  return raw.map((r) => ({ ...r, alsoCovers: r.alsoCovers ? r.alsoCovers.slice() : [] }));
}

// Country then name, both locale-independent, so the page and the export are
// byte-identical on any machine.
function comparePlatforms(a, b) {
  return compareStable(a.country, b.country) || compareStable(a.name, b.name);
}

module.exports = {
  SELLER_ACTIONS,
  ACTIONABLE_SELLER_ACTIONS,
  MarketplaceError, MARKETPLACE_TYPES, SELLER_TYPES, COST_MODELS, CURRENT_STATUSES,
  problemsFor, isPublishable, loadMarketplaces, comparePlatforms, compareStable,
};
