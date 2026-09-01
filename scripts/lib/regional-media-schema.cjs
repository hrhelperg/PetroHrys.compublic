'use strict';

// Regional Media is intentionally separate from Media, PR & Publishing.
// The latter models publishing opportunities; this collection models the
// geographic news surfaces a company may research before pitching. At the
// expected 3,000-8,000 records, combining them would make both collections
// slower and would conflate an outlet's existence with an open submission
// route.

const fs = require('node:fs');
const BD = require('./bd-schema.cjs');

class RegionalMediaError extends Error {}

const BASE_PATH = '/research/regional-media/';

const MACRO_REGIONS = [
  'africa',
  'asia',
  'europe',
  'latin-america-caribbean',
  'north-america',
  'oceania',
];

const SUBREGIONS = [
  'australia-new-zealand',
  'caribbean',
  'central-america',
  'central-asia',
  'eastern-africa',
  'eastern-asia',
  'eastern-europe',
  'melanesia',
  'micronesia',
  'middle-africa',
  'north-america',
  'northern-africa',
  'northern-europe',
  'polynesia',
  'south-america',
  'south-eastern-asia',
  'southern-africa',
  'southern-asia',
  'southern-europe',
  'western-africa',
  'western-asia',
  'western-europe',
];

// Coverage is what makes a record regional. Country is where the publisher is
// based; coverageArea is the place whose people and institutions it reports.
const COVERAGE_TYPES = [
  'county-district',
  'local-area',
  'metro-city',
  'multi-region',
  'region',
  'state-province',
];

const PUBLICATION_TYPES = [
  'business-publication',
  'community-news',
  'digital-news',
  'newspaper',
  'news-broadcaster',
];

const PUBLICATION_ROUTES = [
  'advertising',
  'contributed-article',
  'editorial-pitch',
  'press-release',
  'sponsored-content',
  'unknown',
];

const COST_MODELS = ['free', 'paid', 'mixed', 'unknown'];
const CURRENT_STATUSES = ['active', 'unknown', 'dormant', 'redirected', 'shutting-down'];
const PRIORITIES = ['P1', 'P2', 'P3', 'hold', 'reject'];

const REQUIRED = [
  'id', 'name', 'website', 'country', 'macroRegion', 'subregion',
  'coverageType', 'coverageArea', 'publicationType', 'languages',
  'currentStatus', 'priority', 'publicationRoutes', 'costModel',
  'shortNote', 'lastVerified', 'sources',
];

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HTTPS_RE = /^https:\/\/[^\s"'<>]+$/;
const EMAILISH_RE = /[\w.+-]+@[\w-]+\.[\w.-]+|\bmailto:/i;

const has = (v) => v !== undefined && v !== null;

function globalCountrySlugs() {
  const displayNames = new Intl.DisplayNames(['en'], { type: 'region' });
  const values = new Set();
  for (let first = 65; first <= 90; first += 1) {
    for (let second = 65; second <= 90; second += 1) {
      const iso2 = String.fromCharCode(first, second);
      const name = displayNames.of(iso2);
      if (!name || name === iso2 || name === 'Unknown Region') continue;
      values.add(name.toLowerCase().normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, ''));
    }
  }
  return values;
}

const GLOBAL_COUNTRIES = globalCountrySlugs();

function arrayProblems(out, id, row, field, vocabulary, min = 1) {
  const value = row[field];
  if (!Array.isArray(value)) {
    out.push([`${id} ${field}`, 'must be an array.']);
    return;
  }
  if (value.length < min) out.push([`${id} ${field}`, `needs at least ${min} value(s).`]);
  if (value.length !== new Set(value).size) out.push([`${id} ${field}`, 'repeats a value.']);
  if ([...value].sort().join(',') !== value.join(',')) {
    out.push([`${id} ${field}`, 'must be sorted.']);
  }
  for (const item of value) {
    if (vocabulary && !vocabulary.includes(item)) {
      out.push([`${id} ${field}`, `${JSON.stringify(item)} is not in the vocabulary.`]);
    }
  }
}

function problemsFor(row, knownCountries) {
  const out = [];
  const id = row && row.id ? row.id : '(unnamed)';
  const at = (field, message) => out.push([`${id} ${field}`, message]);
  if (!row || typeof row !== 'object' || Array.isArray(row)) return [['(row)', 'is not an object.']];

  for (const field of REQUIRED) {
    const value = row[field];
    if (value === undefined || value === null || value === ''
      || (Array.isArray(value) && value.length === 0)) at(field, 'is required.');
  }

  if (typeof row.id === 'string') {
    if (!row.id.startsWith('rm-')) at('id', 'must use the rm- namespace.');
    if (!SLUG_RE.test(row.id)) at('id', 'must be a lowercase hyphenated slug.');
  }
  if (!HTTPS_RE.test(String(row.website || ''))) at('website', 'must be an https URL.');
  if (!knownCountries.has(row.country) && !GLOBAL_COUNTRIES.has(row.country)) {
    at('country', 'is not a declared country.');
  }
  if (!MACRO_REGIONS.includes(row.macroRegion)) at('macroRegion', 'is not recognised.');
  if (!SUBREGIONS.includes(row.subregion)) at('subregion', 'is not recognised.');
  if (!COVERAGE_TYPES.includes(row.coverageType)) at('coverageType', 'is not recognised.');
  if (typeof row.coverageArea !== 'string' || row.coverageArea.trim().length < 2) {
    at('coverageArea', 'must name the covered state, province, region or locality.');
  }
  if (!PUBLICATION_TYPES.includes(row.publicationType)) at('publicationType', 'is not recognised.');
  arrayProblems(out, id, row, 'languages', null);
  if (Array.isArray(row.languages)) {
    for (const language of row.languages) {
      if (!/^[a-z]{2}$/.test(language)) at('languages', `${JSON.stringify(language)} is not a two-letter code.`);
    }
  }
  arrayProblems(out, id, row, 'publicationRoutes', PUBLICATION_ROUTES);
  if (Array.isArray(row.publicationRoutes) && row.publicationRoutes.includes('unknown')
    && row.publicationRoutes.length > 1) {
    at('publicationRoutes', 'cannot combine unknown with a definite route.');
  }
  if (!COST_MODELS.includes(row.costModel)) at('costModel', 'is not recognised.');
  if (!CURRENT_STATUSES.includes(row.currentStatus)) at('currentStatus', 'is not recognised.');
  if (!PRIORITIES.includes(row.priority)) at('priority', 'is not recognised.');
  if (!DATE_RE.test(String(row.lastVerified || ''))) at('lastVerified', 'must be an ISO date.');
  if (typeof row.shortNote !== 'string' || row.shortNote.trim().length < 20) {
    at('shortNote', 'must explain the outlet and its geographic relevance.');
  }

  arrayProblems(out, id, row, 'sources', null);
  if (Array.isArray(row.sources)) {
    for (const source of row.sources) {
      if (!HTTPS_RE.test(String(source))) at('sources', `${JSON.stringify(source)} is not an https URL.`);
    }
  }

  for (const field of ['submissionUrl', 'advertisingUrl', 'contactUrl']) {
    if (has(row[field]) && !HTTPS_RE.test(String(row[field]))) at(field, 'must be an https URL, or absent.');
  }
  if (row.submissionUrl && !row.publicationRoutes.some((x) => [
    'contributed-article', 'editorial-pitch', 'press-release', 'sponsored-content',
  ].includes(x))) at('submissionUrl', 'is set without a route that justifies it.');
  if (row.advertisingUrl && !row.publicationRoutes.some((x) => [
    'advertising', 'sponsored-content',
  ].includes(x))) at('advertisingUrl', 'is set without an advertising route.');

  for (const [field, value] of Object.entries(row)) {
    if (typeof value === 'string' && EMAILISH_RE.test(value)) {
      at(field, 'contains an email address; this public dataset stores URLs only.');
    }
  }
  for (const [field, reason] of BD.domainRatingProblems(row)) at(field, reason);
  for (const [field, reason] of BD.backlinkProblems(row)) at(field, reason);

  // `unknown` is represented by an absent backlinkType. A concrete link type
  // must always be evidence about a real published page, never about an outlet
  // homepage or an assumed future article.
  if (row.backlinkProvenance && row.backlinkProvenance.listingUrl === row.website) {
    at('backlinkProvenance.listingUrl', 'cannot use the outlet homepage as backlink evidence.');
  }
  return out;
}

function normaliseHost(url) {
  return BD.normaliseDomain(url);
}

function loadRegionalMedia(file, knownCountries) {
  let rows;
  try {
    rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (cause) {
    throw new RegionalMediaError(`Cannot read regional media data: ${cause.message}`);
  }
  if (!Array.isArray(rows)) throw new RegionalMediaError('regional-media.json must contain an array.');
  const problems = [];
  const ids = new Set();
  const hosts = new Map();
  for (const row of rows) {
    problems.push(...problemsFor(row, knownCountries));
    if (ids.has(row.id)) problems.push([row.id, 'is declared twice.']);
    ids.add(row.id);
    const host = normaliseHost(row.website);
    if (hosts.has(host)) problems.push([row.id, `shares host ${host} with ${hosts.get(host)}.`]);
    else hosts.set(host, row.id);
  }
  if (problems.length) {
    throw new RegionalMediaError(`regional-media.json failed validation:\n${problems
      .map(([field, reason]) => `  ${field}: ${reason}`).join('\n')}`);
  }
  return rows.map((row) => ({
    ...row,
    languages: row.languages.slice(),
    publicationRoutes: row.publicationRoutes.slice(),
    sources: row.sources.slice(),
  }));
}

function isActionable(row) {
  return row && row.priority !== 'reject'
    && !['dormant', 'redirected', 'shutting-down'].includes(row.currentStatus)
    && HTTPS_RE.test(String(row.website || ''));
}

const PRIORITY_RANK = { P1: 0, P2: 1, P3: 2, hold: 3, reject: 4 };
function compareRecords(a, b) {
  const ad = Number.isInteger(a.domainRating) ? a.domainRating : -1;
  const bd = Number.isInteger(b.domainRating) ? b.domainRating : -1;
  if (ad !== bd) return bd - ad;
  const ap = PRIORITY_RANK[a.priority] ?? 9;
  const bp = PRIORITY_RANK[b.priority] ?? 9;
  if (ap !== bp) return ap - bp;
  const an = String(a.name || '');
  const bn = String(b.name || '');
  const af = an.toLowerCase();
  const bf = bn.toLowerCase();
  if (af !== bf) return af < bf ? -1 : 1;
  return an < bn ? -1 : an > bn ? 1 : 0;
}

const collectionPath = () => BASE_PATH;

module.exports = {
  RegionalMediaError,
  BASE_PATH,
  MACRO_REGIONS,
  SUBREGIONS,
  COVERAGE_TYPES,
  PUBLICATION_TYPES,
  PUBLICATION_ROUTES,
  COST_MODELS,
  CURRENT_STATUSES,
  PRIORITIES,
  PRIORITY_RANK,
  problemsFor,
  loadRegionalMedia,
  isActionable,
  compareRecords,
  normaliseHost,
  collectionPath,
};
