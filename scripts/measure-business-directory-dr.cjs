#!/usr/bin/env node
// scripts/measure-business-directory-dr.cjs
'use strict';

// RETIRED — NOT PART OF ANY ACTIVE WORKFLOW.
//
// This utility recorded Ahrefs Domain Rating snapshots into the registry. As of
// the open-source data policy (2026-08-04) the Research Center collects no
// metric that requires a paid account, an API subscription or a mandatory
// credential, and the Ahrefs endpoint below becomes key-mandatory on 2026-08-10.
// Collection is therefore frozen: the 64 snapshots already in the dataset stay
// exactly as measured, as dated historical values, and no new ones are taken.
//
// The file is kept, not deleted, so the provenance of those 64 values remains
// reproducible and auditable. It refuses to run without an explicit override
// flag, so no maintainer can reach for it out of habit and no runbook needs to
// tell anyone to configure a key. Nothing in the build, the validator or the
// test suite invokes it or reads AHREFS_API_KEY.
//
// Endpoint (verified against official documentation on 2026-08-04):
//   GET https://api.ahrefs.com/v3/public/domain-rating-free?target=<domain>
//   Authorization: Bearer <token>   — optional today, MANDATORY from 2026-08-10
//   Free: consumes no API units.
//   Response: { domain_rating: { domain_rating, license, warning } }
//
// The key is read from the AHREFS_API_KEY environment variable only. It is never
// written to a file, never printed, and never stored in a record.

const fs = require('node:fs');
const path = require('node:path');
const S = require('./lib/bd-schema.cjs');
const { loadRegistry } = require('./lib/bd-registry.cjs');
const { PATHS } = require('./lib/bd-util.cjs');

const ENDPOINT = 'https://api.ahrefs.com/v3/public/domain-rating-free';
const KEY_VAR = 'AHREFS_API_KEY';
const DIR = path.join(PATHS.dataRoot, 'directories');

// Conservative pacing. The endpoint is free but that is not licence to hammer it.
const DELAY_MS = 1500;
const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = 4000;

// Outcome classes. Every record ends in exactly one, and only `measured` ever
// writes to disk.
const OUTCOME = {
  measured: 'measured',
  unavailable: 'unavailable',
  blocked: 'blocked',
  invalidDomain: 'invalid domain',
  apiError: 'API error',
  rateLimited: 'rate limited',
  skipped: 'skipped',
};

class MeasureError extends Error {}

function parseArgs(argv) {
  const opts = { dryRun: false, force: false, ids: [], country: null, category: null, all: false, allUnmeasured: false };
  for (const arg of argv) {
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--force') opts.force = true;
    else if (arg === '--all') opts.all = true;
    else if (arg === '--all-unmeasured') opts.allUnmeasured = true;
    else if (arg.startsWith('--id=')) opts.ids.push(arg.slice(5));
    else if (arg.startsWith('--country=')) opts.country = arg.slice(10);
    else if (arg.startsWith('--category=')) opts.category = arg.slice(11);
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else throw new MeasureError(`Unknown argument: ${arg}`);
  }
  return opts;
}

const USAGE = `
Record Ahrefs Domain Rating snapshots into the Business Directories registry.

  --dry-run              resolve and report targets, write nothing
  --id=<record-id>       measure one record (repeatable)
  --country=<slug>       measure a country or scope subset
  --category=<slug>      measure a category subset
  --all-unmeasured       measure every record without a Domain Rating
  --all                  measure every record (requires --force to overwrite)
  --force                allow overwriting an existing snapshot
  --help

The API key is read from ${KEY_VAR} and is never printed or stored.
Authentication is mandatory from 2026-08-10.
`;

// Selects the records a run will touch. Without --force, a record that already
// carries a snapshot is skipped rather than silently remeasured.
function selectRecords(registry, opts) {
  const all = registry.directories;
  let chosen;
  if (opts.ids.length) {
    chosen = opts.ids.map((id) => {
      const found = all.find((r) => r.id === id);
      if (!found) throw new MeasureError(`No record with id "${id}".`);
      return found;
    });
  } else if (opts.country) {
    chosen = all.filter((r) => r.country === opts.country);
    if (!chosen.length) throw new MeasureError(`No records for country "${opts.country}".`);
  } else if (opts.category) {
    chosen = all.filter((r) => r.category === opts.category);
    if (!chosen.length) throw new MeasureError(`No records for category "${opts.category}".`);
  } else if (opts.allUnmeasured) {
    chosen = all.filter((r) => r.domainRating === null || r.domainRating === undefined);
  } else if (opts.all) {
    chosen = all.slice();
  } else {
    throw new MeasureError('Choose a target: --id, --country, --category, --all-unmeasured or --all.');
  }
  // Deterministic order so two runs over the same selection behave identically.
  return chosen.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// A Domain Rating describes the registrable domain that was measured. Recording
// which domain that was is what stops "AppSource has DR 98" being read into a
// number that actually describes microsoft.com.
function targetFor(record) {
  return S.normaliseDomain(record.website);
}

function findDuplicateDomains(records) {
  const byDomain = new Map();
  for (const record of records) {
    const domain = targetFor(record);
    if (!domain) continue;
    if (!byDomain.has(domain)) byDomain.set(domain, []);
    byDomain.get(domain).push(record.id);
  }
  return [...byDomain.entries()].filter(([, ids]) => ids.length > 1);
}

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

// Returns { outcome, value?, warning? }. An authentication failure throws,
// because continuing would burn the whole selection against a wall.
async function fetchDomainRating(domain, apiKey) {
  const url = `${ENDPOINT}?target=${encodeURIComponent(domain)}`;
  const headers = { Accept: 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response;
    try {
      response = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
    } catch (cause) {
      if (attempt === MAX_ATTEMPTS) return { outcome: OUTCOME.unavailable, detail: cause.name || 'network error' };
      await sleep(RETRY_BACKOFF_MS * attempt);
      continue;
    }

    if (response.status === 401 || response.status === 403) {
      // Expected outcome now that the endpoint is key-mandatory. The policy is
      // to stop here, not to acquire a credential: no key is to be created or
      // configured for this repository. Nothing was written.
      throw new MeasureError(
        `Authentication rejected (HTTP ${response.status}). This utility is retired and the\n`
        + 'endpoint now requires a credential, which the open-source data policy forbids.\n'
        + 'Do not create or configure a key. Leave the metric null. Nothing was written.',
      );
    }
    if (response.status === 429) {
      if (attempt === MAX_ATTEMPTS) return { outcome: OUTCOME.rateLimited };
      await sleep(RETRY_BACKOFF_MS * attempt * 2);
      continue;
    }
    if (response.status === 404) return { outcome: OUTCOME.unavailable, detail: 'no rating for target' };
    if (!response.ok) {
      if (attempt === MAX_ATTEMPTS) return { outcome: OUTCOME.apiError, detail: `HTTP ${response.status}` };
      await sleep(RETRY_BACKOFF_MS * attempt);
      continue;
    }

    let body;
    try {
      body = await response.json();
    } catch {
      return { outcome: OUTCOME.apiError, detail: 'response was not JSON' };
    }
    const node = body && body.domain_rating;
    const raw = node && node.domain_rating;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      return { outcome: OUTCOME.unavailable, detail: 'no numeric domain_rating in response' };
    }
    const value = Math.round(raw);
    if (value < S.DOMAIN_RATING_RANGE.min || value > S.DOMAIN_RATING_RANGE.max) {
      return { outcome: OUTCOME.apiError, detail: `value ${value} outside the supported range` };
    }
    return { outcome: OUTCOME.measured, value, warning: node.warning || null };
  }
  return { outcome: OUTCOME.apiError, detail: 'retries exhausted' };
}

// Writes value, provider, measurement date, status and the measured domain
// together. A partial write is what produces a number nobody can source.
function applyMeasurement(record, value, measuredAt, domain) {
  record.domainRating = value;
  record.metricsProvenance = {
    ...(record.metricsProvenance || {}),
    domainRating: {
      provider: S.METRIC_PROVIDERS[0],
      measuredAt,
      status: S.METRIC_SNAPSHOT_STATUS,
      measuredDomain: domain,
    },
  };
  record.metricStatus = 'measured';
}

function writeRegistryFiles(updatesByFile) {
  let written = 0;
  for (const [file, records] of updatesByFile) {
    const target = path.join(DIR, file);
    const current = fs.readFileSync(target, 'utf8');
    const next = `${JSON.stringify(records, null, 2)}\n`;
    if (current !== next) { fs.writeFileSync(target, next); written += 1; }
  }
  return written;
}

// The retirement gate. Collection is frozen by policy, so the default path is
// to refuse and explain. The override exists only for reproducing the
// provenance of the snapshots already committed, and it names itself plainly so
// it cannot be typed by accident or pasted from a runbook.
const RETIREMENT_OVERRIDE = '--run-retired-utility';
const RETIREMENT_NOTICE = `${path.basename(__filename)} is retired.\n\n`
  + 'The Research Center collects no metric that requires a paid account, an API\n'
  + 'subscription or a mandatory credential. Domain Rating collection is frozen:\n'
  + 'the snapshots already in the registry stay as dated historical values and no\n'
  + 'new ones are taken. New records carry domainRating: null, which the site\n'
  + `renders as "${S.DR_NOT_MEASURED_LABEL}" — never as 0.\n\n`
  + `Pass ${RETIREMENT_OVERRIDE} only to reproduce the provenance of existing\n`
  + 'snapshots. Do not use it to add new values.\n';

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { process.stdout.write(USAGE); return 0; }

  if (!process.argv.slice(2).includes(RETIREMENT_OVERRIDE)) {
    process.stdout.write(RETIREMENT_NOTICE);
    return 0;
  }

  const apiKey = process.env[KEY_VAR] || null;
  const registry = loadRegistry();
  const selection = selectRecords(registry, opts);

  const duplicates = findDuplicateDomains(registry.directories);
  if (duplicates.length) {
    process.stdout.write('Duplicate domains in the registry (one rating covers several records):\n');
    for (const [domain, ids] of duplicates) process.stdout.write(`  ${domain}: ${ids.join(', ')}\n`);
    process.stdout.write('\n');
  }

  // Resolve every target before any network call, so an invalid domain is
  // reported rather than discovered halfway through a run.
  const planned = selection.map((record) => {
    const domain = targetFor(record);
    const alreadyMeasured = record.domainRating !== null && record.domainRating !== undefined;
    let outcome = null;
    if (!domain) outcome = OUTCOME.invalidDomain;
    else if (alreadyMeasured && !opts.force) outcome = OUTCOME.skipped;
    return { record, domain, outcome };
  });

  const toMeasure = planned.filter((p) => !p.outcome);
  process.stdout.write(`Selected ${selection.length} record(s); ${toMeasure.length} to measure.\n`);
  process.stdout.write(`API key: ${apiKey ? 'present' : 'absent'}${apiKey ? '' : ' (unauthenticated access is removed on 2026-08-10)'}\n`);

  if (opts.dryRun) {
    for (const p of planned) {
      process.stdout.write(`  ${p.record.id.padEnd(32)}${(p.domain || '-').padEnd(38)}${p.outcome || 'would measure'}\n`);
    }
    process.stdout.write('\nDry run: nothing written.\n');
    return 0;
  }

  // The measurement date is the date the reading was taken. It lives in the
  // data, not in the build, so page generation stays deterministic.
  const measuredAt = new Date().toISOString().slice(0, 10);
  const tally = Object.fromEntries(Object.values(OUTCOME).map((o) => [o, 0]));
  for (const p of planned) if (p.outcome) tally[p.outcome] += 1;

  const touchedFiles = new Map();
  const fileOf = new Map();
  for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.json'))) {
    const records = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
    touchedFiles.set(file, records);
    for (const record of records) fileOf.set(record.id, file);
  }

  let firstWarning = null;
  for (const [index, p] of toMeasure.entries()) {
    if (index > 0) await sleep(DELAY_MS);
    const result = await fetchDomainRating(p.domain, apiKey);
    tally[result.outcome] += 1;
    if (result.outcome !== OUTCOME.measured) {
      // A failed reading must never erase a snapshot that was already valid.
      process.stdout.write(`  ${p.record.id.padEnd(32)}${p.domain.padEnd(38)}${result.outcome}`
        + `${result.detail ? ` (${result.detail})` : ''}\n`);
      continue;
    }
    if (result.warning && !firstWarning) firstWarning = result.warning;
    const file = fileOf.get(p.record.id);
    const target = touchedFiles.get(file).find((r) => r.id === p.record.id);
    applyMeasurement(target, result.value, measuredAt, p.domain);
    process.stdout.write(`  ${p.record.id.padEnd(32)}${p.domain.padEnd(38)}DR ${result.value}\n`);
  }

  const written = writeRegistryFiles(touchedFiles);

  process.stdout.write('\nSummary\n');
  for (const [outcome, count] of Object.entries(tally)) {
    if (count) process.stdout.write(`  ${outcome.padEnd(16)}${count}\n`);
  }
  process.stdout.write(`  files written   ${written}\n`);
  if (firstWarning) process.stdout.write(`\nProvider notice: ${firstWarning}\n`);
  return 0;
}

if (require.main === module) {
  main().then((code) => process.exit(code)).catch((error) => {
    // Never print the key, and never leave a half-applied run behind.
    process.stderr.write(`${error instanceof MeasureError ? error.message : error.stack}\n`);
    process.exit(1);
  });
}

module.exports = {
  parseArgs, selectRecords, targetFor, findDuplicateDomains, applyMeasurement,
  OUTCOME, ENDPOINT, KEY_VAR, MeasureError,
};
