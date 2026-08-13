// scripts/tests/bd-open-source-policy.test.cjs
'use strict';

// Guards for the open-source data policy adopted 2026-08-04: the Research
// Center collects no metric that requires a paid account, an API subscription
// or a mandatory credential. A metric that cannot be verified from an openly
// accessible source is null — never estimated, never zero, never taken from an
// unofficial mirror.
//
// Several guards would pass trivially on a dataset that happened to have no
// unmeasured records, or no measured ones. Each of those asserts its own
// preconditions first, so a future dataset cannot silently turn the guard into
// a no-op.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const S = require('../lib/bd-schema.cjs');
const { loadRegistry } = require('../lib/bd-registry.cjs');
const { sortDirectories } = require('../lib/bd-sort.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const D = loadRegistry().directories;
const hasDR = (r) => r.domainRating !== null && r.domainRating !== undefined;
const MEASURED = D.filter(hasDR);
const UNMEASURED = D.filter((r) => !hasDR(r));

// --- preconditions ----------------------------------------------------------
// Asserted once, loudly. Every "no record does X" guard below is only meaningful
// while both populations exist.

test('the dataset contains both measured and unmeasured records', () => {
  assert.ok(MEASURED.length > 0, 'no record carries a Domain Rating: the freeze guards are vacuous');
  assert.ok(UNMEASURED.length > 0,
    'every record carries a Domain Rating: the null-handling guards are vacuous');
});

// --- 1. no active workflow requires a credential ----------------------------

test('no build, validator or test reads AHREFS_API_KEY', () => {
  const active = [
    'scripts/build-business-directories.cjs',
    'scripts/validate-business-directories.cjs',
    'scripts/migrate-business-directories.cjs',
    // Recursive: scripts/lib now contains a subdirectory (to-adapters), and a
    // flat readdir handed a directory path to readFileSync.
    ...libFilesRecursive(path.join(ROOT, 'scripts', 'lib')),
    ...fs.readdirSync(path.join(ROOT, 'scripts', 'tests'))
      .filter((f) => f.endsWith('.cjs'))
      .map((f) => `scripts/tests/${f}`),
  ];
  for (const rel of active) {
    if (rel.endsWith('bd-open-source-policy.test.cjs') || rel.endsWith('bd-truth.test.cjs')) continue;
    const src = read(rel);
    assert.ok(!/process\.env\S*AHREFS|process\.env\[[^\]]*AHREFS/.test(src),
      `${rel} reads an Ahrefs credential from the environment`);
  }
});

test('the retired utility refuses to run without its explicit override', () => {
  const src = read('scripts/measure-business-directory-dr.cjs');
  assert.match(src, /RETIREMENT_OVERRIDE\s*=\s*'--run-retired-utility'/,
    'the retirement override flag is not declared');
  assert.match(src, /if \(!process\.argv\.slice\(2\)\.includes\(RETIREMENT_OVERRIDE\)\)/,
    'the retirement gate is not enforced before the run begins');
  const gate = src.indexOf('RETIREMENT_OVERRIDE)');
  const keyRead = src.indexOf('process.env[KEY_VAR]');
  assert.ok(gate !== -1 && keyRead !== -1 && gate < keyRead,
    'the credential is read before the retirement gate is checked');
});

test('no operator documentation instructs a maintainer to obtain or configure a key', () => {
  for (const rel of ['docs/business-directories-runbook.md', 'docs/ahrefs-domain-rating-key.md']) {
    const src = read(rel);
    assert.ok(!/^\s*export AHREFS_API_KEY=/m.test(src), `${rel} still shows a key export`);
    assert.ok(!/app\.ahrefs\.com\/account\/api-keys/.test(src),
      `${rel} still links to the key-creation page`);
  }
});

// --- 2. generation performs no network call ---------------------------------

// The property is "GENERATION performs no network call". It used to be checked
// by listing scripts/lib/*.cjs and asserting none of them could fetch — exact
// for as long as every library in that directory was a build library, and no
// longer exact once Tender Opportunity ingestion added one that is not.
//
// scripts/lib/to-http.cjs exists to make network requests. It is reached only
// from scripts/ingest-tender-opportunities.cjs, which is run by hand and is not
// part of any build. Adding it to an exemption list would have been the easy
// fix and the wrong one: exemption lists grow, and the second entry is the one
// that quietly puts a fetch back into the build.
//
// So the guard now walks the ACTUAL require graph from every build entry point.
// That is strictly stronger than the directory listing: it follows requires
// into subdirectories, catches a build that reaches a network module through
// three intermediaries, and needs no maintenance when a library is added.
const NETWORK = /\bfetch\s*\(|require\('node:https?'\)|require\("node:https?"\)|api\.ahrefs\.com|XMLHttpRequest/;

function libFilesRecursive(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...libFilesRecursive(abs, base));
    else if (entry.name.endsWith('.cjs')) out.push(path.relative(ROOT, abs));
  }
  return out.sort();
}

// Every generator and validator a release runs. A test below asserts this list
// matches the scripts on disk, so it cannot silently fall behind.
const BUILD_ENTRY_POINTS = [
  'scripts/build-business-directories.cjs',
  'scripts/build-distribution-planner.cjs',
  'scripts/build-marketplaces.cjs',
  'scripts/build-media-platforms.cjs',
  'scripts/build-static-pages.cjs',
  'scripts/build-tender-detail.cjs',
  'scripts/build-tender-monitoring.cjs',
  'scripts/build-tender-opportunities.cjs',
  'scripts/build-tenders-intelligence.cjs',
  'scripts/build-tenders-procurement.cjs',
  'scripts/validate-business-directories.cjs',
  'scripts/validate-ecosystem-registry.cjs',
];

// Resolve the transitive local require graph of a script.
function requireGraph(entryRel) {
  const seen = new Set();
  const stack = [path.join(ROOT, entryRel)];
  while (stack.length) {
    const abs = stack.pop();
    if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) continue;
    const rel = path.relative(ROOT, abs);
    if (seen.has(rel)) continue;
    seen.add(rel);
    for (const m of fs.readFileSync(abs, 'utf8').matchAll(/require\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
      let target = path.resolve(path.dirname(abs), m[1]);
      if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.cjs');
      else if (!fs.existsSync(target)) target = `${target}.cjs`;
      stack.push(target);
    }
  }
  return seen;
}

test('nothing reachable from a build entry point can make a network request', () => {
  assert.ok(BUILD_ENTRY_POINTS.length > 0, 'no build entry points declared: the guard is vacuous');
  // Asserted over the union, not per entry: validate-ecosystem-registry.cjs is
  // legitimately standalone, and demanding that every script require something
  // would fail an honest script rather than an unsafe one.
  const union = new Set();
  for (const entry of BUILD_ENTRY_POINTS) for (const rel of requireGraph(entry)) union.add(rel);
  assert.ok(union.size > BUILD_ENTRY_POINTS.length,
    'the require walk resolved no libraries: the guard is vacuous');
  for (const entry of BUILD_ENTRY_POINTS) {
    const graph = requireGraph(entry);
    for (const rel of graph) {
      assert.ok(!NETWORK.test(read(rel)),
        `${entry} can reach ${rel}, which can perform a network request during generation`);
    }
  }
});

test('the build entry point list has not fallen behind the scripts on disk', () => {
  const onDisk = fs.readdirSync(path.join(ROOT, 'scripts'))
    .filter((f) => /^(build|validate)-.*\.cjs$/.test(f))
    .map((f) => `scripts/${f}`).sort();
  const missing = onDisk.filter((f) => !BUILD_ENTRY_POINTS.includes(f));
  assert.deepStrictEqual(missing, [],
    `these generators are not covered by the network guard: ${missing.join(', ')}`);
});

// The guard above would pass trivially if nothing in the repository could make
// a request. Something can, deliberately — this asserts the detector still
// recognises it, so a broken regex cannot read as a clean build path.
test('the network detector still fires on the module that does use the network', () => {
  assert.ok(NETWORK.test(read('scripts/lib/to-http.cjs')),
    'to-http.cjs no longer looks like a network client: the detector may be broken');
  const ingest = requireGraph('scripts/ingest-tender-opportunities.cjs');
  assert.ok([...ingest].some((rel) => NETWORK.test(read(rel))),
    'the ingestion entry point cannot reach the network: the graph walk is not working');
});

// --- 3 & 4. the snapshots are frozen ----------------------------------------

// Pinned 2026-08-04 over the 64 measurements carried into Batch 1.
//
// The pin is over MEASUREMENTS, keyed by the domain each one measured — not
// over the records that display them. That is the distinction the freeze is
// really about: a Domain Rating is a fact about a domain, so publishing a
// second registry on an already-measured domain repeats an existing reading and
// collects nothing, while a newly measured domain, an edited value, a refreshed
// date or a swapped provider all change this digest and fail the test.
const SNAPSHOT_PIN = { domains: 64 };

// One row per measured domain. Records reusing one snapshot collapse to a
// single row; records disagreeing about a domain would produce two rows and
// break the digest, on top of failing sharedDomainSnapshotProblems().
function measurementRows() {
  const rows = new Set();
  for (const r of MEASURED) {
    const p = (r.metricsProvenance || {}).domainRating || {};
    rows.add(`${p.measuredDomain}:${r.domainRating}:${p.provider}:${p.measuredAt}:${p.status}`);
  }
  return [...rows].sort();
}

function snapshotDigest() {
  return crypto.createHash('sha256').update(measurementRows().join('\n')).digest('hex');
}

// Recomputed on 2026-08-05 when the pin moved from per-record to per-domain
// keying. The 64 underlying readings are byte-for-byte the ones Batch 1 froze:
// this digest was verified identical across the change that added a record
// reusing an existing snapshot, which is exactly the property it must have.
const FROZEN_DIGEST = 'aa7e6984d516017ea37c3fb5f3ab94791f060787fec1c8dda3a913cd19847a4e';

test('the historical Domain Rating snapshots are unchanged', () => {
  const rows = measurementRows();
  assert.strictEqual(rows.length, SNAPSHOT_PIN.domains,
    'the number of Domain Rating measurements changed: none may be added, removed or refreshed');
  assert.strictEqual(snapshotDigest(), FROZEN_DIGEST,
    'a Domain Rating value or its provenance changed; snapshots are frozen historical readings');
  // Reuse must never become divergence: one domain, one reading.
  assert.deepStrictEqual(S.sharedDomainSnapshotProblems(D), []);
});

test('a reused snapshot adds a record but never a measurement', () => {
  // The count allowed to grow is records; the count that is frozen is
  // measurements. Asserting both keeps the difference explicit.
  const domains = new Set(MEASURED.map((r) => r.metricsProvenance.domainRating.measuredDomain));
  assert.strictEqual(domains.size, SNAPSHOT_PIN.domains,
    `${domains.size} domains measured; the freeze pins ${SNAPSHOT_PIN.domains}`);
  assert.ok(MEASURED.length >= domains.size,
    'more measured domains than records carrying them is impossible');
  for (const r of MEASURED) {
    assert.strictEqual(r.metricsProvenance.domainRating.measuredDomain, S.normaliseDomain(r.website),
      `${r.id} displays a rating measured on a domain that is not its own`);
  }
});

test('every Domain Rating is a dated historical snapshot from a named provider', () => {
  for (const r of MEASURED) {
    const p = (r.metricsProvenance || {}).domainRating;
    assert.ok(p, `${r.id} has a Domain Rating with no provenance`);
    assert.ok(S.METRIC_PROVIDERS.includes(p.provider), `${r.id} names an unrecognised provider`);
    assert.strictEqual(p.status, S.METRIC_SNAPSHOT_STATUS,
      `${r.id} does not mark its Domain Rating as a historical snapshot`);
    assert.match(p.measuredAt, S.DATE_RE, `${r.id} has no measurement date`);
    assert.ok(p.measuredDomain, `${r.id} does not record which domain was measured`);
  }
});

test('records added after the freeze carry no Domain Rating', () => {
  // The freeze took effect on 2026-08-04 alongside Batch 1. Every record whose
  // rating was measured carries that same date, so "measured after the freeze"
  // is detectable: any provenance dated later is a new collection.
  for (const r of MEASURED) {
    const p = (r.metricsProvenance || {}).domainRating;
    assert.ok(p.measuredAt <= '2026-08-04',
      `${r.id} carries a Domain Rating measured ${p.measuredAt}, after collection was frozen`);
  }
});

// --- 5. a missing metric is null, never zero --------------------------------

test('a missing authority metric is null and never zero', () => {
  for (const r of UNMEASURED) {
    assert.strictEqual(r.domainRating, null, `${r.id} uses a non-null placeholder for an absent rating`);
    assert.notStrictEqual(r.domainRating, 0, `${r.id} substitutes 0 for an absent rating`);
  }
  for (const r of D) {
    for (const field of S.THIRD_PARTY_METRICS) {
      if (r[field] === null || r[field] === undefined) continue;
      assert.notStrictEqual(r[field], 0, `${r.id} publishes 0 for ${field}; absence must be null`);
    }
  }
});

// --- 6. nothing gated is presented as current -------------------------------

test('the pages that show Domain Rating say new measurements are not collected', () => {
  assert.match(S.DR_SNAPSHOT_POLICY_NOTE, /historical Ahrefs snapshots/);
  assert.match(S.DR_SNAPSHOT_POLICY_NOTE, /New measurements are not collected/);
  const components = read('scripts/lib/bd-components.cjs');
  assert.ok(components.includes('DR_SNAPSHOT_POLICY_NOTE'),
    'the renderer never emits the freeze note');

  const hub = read(path.join('research', 'business-directories', 'index.html'));
  assert.ok(hub.includes('historical Ahrefs snapshots'),
    'the hub does not tell a reader the ratings are historical');
  assert.ok(!/live|real-?time|current(ly)? measured/i.test(
    hub.slice(Math.max(0, hub.indexOf('Domain Rating') - 200), hub.indexOf('Domain Rating') + 400)),
  'the hub describes Domain Rating in language implying a live reading');
});

// --- 7 & 8. provenance is mandatory -----------------------------------------

test('every published third-party metric carries a source and a date', () => {
  let checked = 0;
  for (const r of D) {
    for (const field of S.THIRD_PARTY_METRICS) {
      if (r[field] === null || r[field] === undefined) continue;
      const p = (r.metricsProvenance || {})[field];
      assert.ok(p && p.provider && p.measuredAt,
        `${r.id} publishes ${field} without provider and measurement date`);
      assert.ok(S.METRIC_PROVIDERS.includes(p.provider),
        `${r.id} sources ${field} from "${p.provider}", which is not a recognised provider`);
      checked += 1;
    }
  }
  assert.ok(checked > 0, 'no third-party metric was checked: the guard is vacuous');
});

// --- 9. the score stays independent -----------------------------------------

test('the PetroHrys Score is reproducible from its factors alone', () => {
  const scored = D.filter((r) => typeof r.petroHrysScore === 'number');
  assert.ok(scored.length > 0, 'no record carries a score: the guard is vacuous');
  for (const r of scored) {
    assert.strictEqual(S.computeScore(r.scoreFactors), r.petroHrysScore,
      `${r.id} has a score that does not reproduce from its ten factors`);
  }
});

test('no score factor is named after a third-party metric', () => {
  // Field names only. A definition that mentions "traffic" to DISCLAIM it —
  // platformReputation says it is "deliberately not a popularity, traffic or
  // recognition measure" — is evidence of independence, not a violation, so a
  // bare keyword scan would fail the guard on the very wording that proves it.
  const banned = /domainRating|authorityScore|referringDomains|estimatedTraffic|backlink|Ahrefs/i;
  for (const f of S.SCORE_FACTORS) {
    assert.ok(!banned.test(f.key), `factor "${f.key}" is named after a third-party metric`);
    assert.ok(!banned.test(f.definition), `factor "${f.key}" is defined in terms of a third-party metric`);
  }
  const schema = read('scripts/lib/bd-schema.cjs');
  const fn = schema.slice(schema.indexOf('function computeScore'), schema.indexOf('// --- required shape'));
  assert.ok(!banned.test(fn), 'computeScore reads a third-party metric');
});

test('an unmeasured record still earns a score and stays publishable', () => {
  for (const r of UNMEASURED) {
    assert.strictEqual(typeof r.petroHrysScore, 'number',
      `${r.id} has no Domain Rating and no score, so it ranks nowhere`);
    assert.ok(S.indexability(r).indexable,
      `${r.id} is not indexable: ${S.indexability(r).missing.join(', ')}`);
  }
});

// --- 10 & 11. ordering treats absence as absence ----------------------------

test('the Domain Rating view places unmeasured records after measured ones', () => {
  const ordered = sortDirectories(D, 'domain-rating');
  const lastMeasured = ordered.reduce((acc, r, i) => (hasDR(r) ? i : acc), -1);
  const firstUnmeasured = ordered.findIndex((r) => !hasDR(r));
  assert.ok(firstUnmeasured > lastMeasured,
    'an unmeasured record sorts above a measured one in the Domain Rating view');
  assert.strictEqual(ordered.length, D.length, 'the authority view drops records');
});

test('the default view ranks on the PetroHrys Score, not on Domain Rating', () => {
  const ordered = sortDirectories(D, 'default');
  for (let i = 1; i < ordered.length; i += 1) {
    assert.ok(ordered[i - 1].petroHrysScore >= ordered[i].petroHrysScore,
      `default order breaks at ${ordered[i].id}: score rose after falling`);
  }
  // Non-vacuity: an unmeasured record must actually outrank a measured one
  // somewhere, or this proves nothing about independence from Domain Rating.
  const firstUnmeasured = ordered.findIndex((r) => !hasDR(r));
  const lastMeasured = ordered.reduce((acc, r, i) => (hasDR(r) ? i : acc), -1);
  assert.ok(firstUnmeasured !== -1 && firstUnmeasured < lastMeasured,
    'no unmeasured record outranks a measured one, so the default view is not demonstrably independent');
});

test('an absent rating renders as words, never as a number', () => {
  assert.strictEqual(S.DR_NOT_MEASURED_LABEL, 'Not measured');
  const components = read('scripts/lib/bd-components.cjs');
  assert.ok(components.includes('DR_NOT_MEASURED_LABEL'),
    'the renderer does not use the shared not-measured label');

  const pages = UNMEASURED.map((r) => path.join('research', 'business-directories',
    r.country, r.slug, 'index.html'));
  let checked = 0;
  for (const rel of pages) {
    if (!fs.existsSync(path.join(ROOT, rel))) continue;
    const html = read(rel);
    assert.ok(html.includes(S.DR_NOT_MEASURED_LABEL),
      `${rel} does not label its absent Domain Rating`);
    assert.ok(!/>0<\/(td|dd)>/.test(html), `${rel} renders a bare 0 in a metric cell`);
    checked += 1;
  }
  assert.ok(checked > 0, 'no generated page for an unmeasured record was checked: the guard is vacuous');
});
