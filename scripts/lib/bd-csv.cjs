'use strict';

// The employee working list, as a spreadsheet.
//
// This exists because the record pages answer "what is this platform?" and an
// employee needs "where do I publish next, and in what order?". One CSV, one
// row per actionable opportunity, sortable and filterable in Excel or Sheets.
//
// Three properties matter more than anything else here:
//
//   DETERMINISTIC — same registry in, byte-identical file out, on any machine.
//     That rules out localeCompare, whose result depends on host ICU data.
//   PUBLIC ONLY   — editorial facts. No employee, no credential, no submission
//     state. Those live in the separate tracker template, uncommitted.
//   ONE SOURCE    — rows come from S.isActionableOpportunity and nothing else,
//     so the CSV can never disagree with the site's own count.

const S = require('./bd-schema.cjs');

// RFC 4180: quote when the value contains a comma, quote, CR or LF, and escape
// an embedded quote by doubling it.
function csvField(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const COLUMNS = [
  'id', 'name', 'website', 'platform_country', 'audience_geography', 'category',
  'listing_action', 'cost', 'domain_rating', 'tier', 'priority',
  'public_profile_available', 'submission_url', 'claim_url', 'best_for',
  'limitations', 'last_verified', 'current_status',
];

// Columns that must NEVER appear. Asserted by test rather than trusted.
const FORBIDDEN_COLUMNS = ['assigned_to', 'internal_note', 'workflow_status',
  'submitted_at', 'follow_up_date', 'password', 'token', 'credential', 'email'];

// A boolean renders as its word; null renders empty so a reader is never told
// "false" where the truth is "not established".
const tri = (v) => (v === true ? 'true' : v === false ? 'false' : '');

// Arrays become a stable, human-readable, spreadsheet-safe string. Semicolons
// rather than commas so the common case needs no quoting at all.
const joinList = (v) => (Array.isArray(v) && v.length ? v.join('; ') : '');

// The first sentence only. bestFor and cons are full paragraphs on the site;
// a spreadsheet cell wants one legible line.
function firstItem(list) {
  if (!Array.isArray(list) || !list.length) return '';
  return String(list[0]).replace(/\s+/g, ' ').trim();
}

function rowFor(record) {
  return [
    record.id,
    record.name,
    record.website,
    record.country,
    joinList(record.audienceGeography),
    record.category,
    record.listingAction || '',
    record.submissionModel || '',
    record.domainRating === null || record.domainRating === undefined ? '' : record.domainRating,
    record.tier || '',
    record.priority || '',
    tri(record.publicProfileAvailable),
    record.submissionUrl || '',
    record.claimUrl || '',
    firstItem(record.bestFor),
    firstItem(record.cons.length ? record.cons : record.notRecommendedFor),
    record.lastVerified || '',
    record.currentStatus || '',
  ];
}

// Sort: country, then work priority, then name. Every comparison is
// locale-independent, so the file is reproducible.
function compareRecords(a, b) {
  const byCountry = S.compareStable(a.country, b.country);
  if (byCountry !== 0) return byCountry;
  const byPriority = S.priorityRank(a.priority) - S.priorityRank(b.priority);
  if (byPriority !== 0) return byPriority;
  return S.compareStable(a.name, b.name);
}

// Accepts the editorial registry plus, optionally, the Level 1 operational rows.
// Both are sorted by the same comparator into one list, because an employee
// working the queue does not care which level a row came from.
function actionableOpportunities(directories, operationalRows = []) {
  const editorial = directories.filter((r) => S.isActionableOpportunity(r, S.isGovernmentPillar));
  const rows = operationalRows.filter((r) => S.isActionableOpportunity(r, () => false));
  return editorial.concat(rows).sort(compareRecords);
}

// BOM first: without it Excel on Windows misreads UTF-8 accents, which matters
// for a list full of Örtliche, Páginas and Zlaté.
const BOM = '﻿';

function renderCsv(directories, operationalRows = []) {
  const rows = actionableOpportunities(directories, operationalRows);
  const lines = [COLUMNS.join(',')];
  for (const r of rows) lines.push(rowFor(r).map(csvField).join(','));
  // RFC 4180 line ending, and a trailing break so the file ends cleanly.
  return BOM + lines.join('\r\n') + '\r\n';
}

module.exports = {
  COLUMNS, FORBIDDEN_COLUMNS, BOM,
  csvField, renderCsv, actionableOpportunities, compareRecords,
};
