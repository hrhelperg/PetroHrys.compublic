'use strict';

// Level 1 operational rows — the employee working list.
//
// These live in their own file rather than in the directory registry, and that
// separation is the whole point. The registry holds EDITORIAL records: every one
// carries an operator, a ten-factor score, pros and cons, and a detail page, and
// roughly twenty-five guards enforce that. A compact row satisfies none of those
// and should not have to: it exists so an employee can open the site and finish
// the onboarding check themselves.
//
// Mixing the two into one registry was tried and rejected. It failed 49 existing
// assertions — not because the assertions were wrong, but because they protect
// real properties of editorial records that a compact row does not have. Two
// datasets, one merged view.
//
// A row here may leave operator, cost, listing action and Domain Rating unknown.
// It may NOT invent any of them.

const fs = require('node:fs');
const path = require('node:path');
const S = require('./bd-schema.cjs');
const INTEL = require('./bd-intelligence.cjs');

class OpportunityError extends Error {}

const CATEGORIES_WITH_NO_PAGE = new Set();   // reserved; rows never generate pages

// The minimum a row must state. Everything else is optional and defaults to
// null, which reads as "not established" everywhere it is displayed.
const REQUIRED = ['id', 'name', 'website', 'country', 'category', 'tier', 'priority',
  'currentStatus', 'audienceGeography'];

function problemsFor(row, knownCountries, knownCategories) {
  const p = [];
  const at = (f, m) => p.push([`${row && row.id ? row.id : '(unnamed)'} ${f}`, m]);

  for (const f of REQUIRED) {
    if (row[f] === undefined || row[f] === null || row[f] === '') at(f, 'is required on an operational row.');
  }
  if (typeof row.website === 'string' && !/^https:\/\//.test(row.website)) {
    at('website', 'must be an https URL.');
  }
  if (row.country && !knownCountries.has(row.country)) at('country', `"${row.country}" is not a declared country.`);
  if (row.category && !knownCategories.has(row.category)) at('category', `"${row.category}" is not a declared category.`);
  if (row.tier && !S.TIERS.includes(row.tier)) at('tier', `must be one of ${S.TIERS.join(', ')}.`);
  if (row.note !== undefined && typeof row.note !== 'string') at('note', 'must be a string.');
  if (row.lastVerified && !/^\d{4}-\d{2}-\d{2}$/.test(row.lastVerified)) at('lastVerified', 'must be YYYY-MM-DD.');

  // The operations vocabularies are shared with the editorial records, so a row
  // and a record can never disagree about what "P1" or "dormant" means.
  for (const [f, m] of S.operationsProblems(row)) at(f, m);

  // A row asserts nothing it has not established. These four are the fields most
  // likely to be filled in from memory, so an explicit non-null value must come
  // from the closed vocabulary rather than from prose.
  if (row.submissionModel !== undefined && row.submissionModel !== null
    && !S.SUBMISSION_MODELS.includes(row.submissionModel)) {
    at('submissionModel', `must be one of ${S.SUBMISSION_MODELS.join(', ')}.`);
  }
  if (row.listingAction !== undefined && row.listingAction !== null
    && !S.LISTING_ACTIONS.includes(row.listingAction)) {
    at('listingAction', `must be one of ${S.LISTING_ACTIONS.join(', ')}.`);
  }
  // Directory Intelligence v2. A row carries the same attribute set as an
  // editorial record — the intelligence layer is the one place the two levels
  // are deliberately identical, because a buying decision does not care which
  // level a platform was researched at.
  for (const [f, m] of INTEL.problemsFor(row.intelligence, row.id)) p.push([f, m]);

  // Domain Rating is never estimated. A row may not carry one at all: only a
  // researched editorial record can, and only from a frozen measurement.
  if (row.domainRating !== undefined && row.domainRating !== null) {
    at('domainRating', 'may not be set on an operational row. A Domain Rating comes only from a frozen measurement on an editorial record.');
  }
  return p;
}

// Normalises a raw row into the same shape the CSV and the page consume, so a
// row and an editorial record can be rendered by one code path.
function normalise(row) {
  return {
    id: row.id,
    name: row.name,
    website: row.website,
    country: row.country,
    category: row.category,
    tier: row.tier,
    priority: row.priority,
    currentStatus: row.currentStatus,
    audienceGeography: Array.isArray(row.audienceGeography) ? row.audienceGeography.slice() : null,
    publicProfileAvailable: row.publicProfileAvailable ?? null,
    listingAction: row.listingAction ?? 'unknown',
    submissionModel: row.submissionModel ?? 'unknown',
    submissionUrl: row.submissionUrl ?? null,
    claimUrl: row.claimUrl ?? null,
    domainRating: null,
    lastVerified: row.lastVerified ?? null,
    description: row.note ?? '',
    // Shape compatibility with an editorial record, so shared renderers and the
    // CSV need no special cases.
    bestFor: [], cons: [], notRecommendedFor: [], pros: [],
    metricsProvenance: {},
    intelligence: INTEL.normalise(row.intelligence),
    isOperationalRow: true,
  };
}

function loadOpportunities(dataRoot, knownCountries, knownCategories) {
  const file = path.join(dataRoot, 'opportunities.json');
  if (!fs.existsSync(file)) return [];
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (cause) {
    throw new OpportunityError(`Corrupt opportunities file: ${cause.message}`);
  }
  if (!Array.isArray(raw)) throw new OpportunityError('opportunities.json must contain an array.');

  const problems = [];
  const ids = new Set();
  for (const row of raw) {
    problems.push(...problemsFor(row, knownCountries, knownCategories));
    if (ids.has(row.id)) problems.push([`${row.id}`, 'is declared twice.']);
    ids.add(row.id);
  }
  if (problems.length) {
    const lines = problems.map(([f, m]) => `  ${f}: ${m}`).join('\n');
    throw new OpportunityError(`opportunities.json failed validation:\n${lines}`);
  }
  return raw.map(normalise);
}

// The one merged, ordered set every consumer uses. Editorial records that pass
// the actionable test come first in the comparator only by virtue of the shared
// sort — there is no ranking preference between the two levels.
function mergedActionable(directories, opportunityRows) {
  const editorial = directories.filter((r) => S.isActionableOpportunity(r, S.isGovernmentPillar));
  const rows = opportunityRows.filter((r) => S.isActionableOpportunity(r, () => false));
  return editorial.concat(rows);
}

module.exports = { OpportunityError, loadOpportunities, mergedActionable, problemsFor, normalise, CATEGORIES_WITH_NO_PAGE };
