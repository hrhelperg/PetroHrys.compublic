// scripts/tests/bd-open-source-policy.test.cjs
'use strict';

// Guards for the open-source data policy: the Research Center collects no metric
// that requires a paid account or an API subscription. A metric that cannot be
// verified from an openly accessible source is null — never estimated, never
// zero, never taken from an unofficial mirror.
//
// CHANGED 2026-08-19 — the policy was REVERSED by the repository owner on one
// point. It had been written against Ahrefs' plan-gated Site Explorer endpoint,
// and it froze Domain Rating collection at 64 hand-measured readings. Ahrefs also
// publishes /v3/public/domain-rating-free, which costs nothing and needs only a
// free key, so the cost the freeze protected against was never the cost of this
// data. Every domain in the corpus has now been read from that free endpoint.
// The guards that pinned the frozen set are replaced by the invariant they were
// really protecting: a rating is never INVENTED, and it describes the record's
// own domain.
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
const c = require('../lib/bd-components.cjs');
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
// while the population it walks exists.

// CHANGED (policy reversal): this used to demand that BOTH populations be
// non-empty. Since every record has now been read from the free public endpoint,
// the corpus holds no unmeasured record, and that demand would fail on a corpus
// that is MORE completely measured than before. What it protected — that the
// null-handling guards never quietly become no-ops — is kept by supplying a
// fixture where the corpus no longer supplies an example, not by deleting those
// guards. The fixture is a real record with its rating and provenance removed.
const UNMEASURED_FIXTURE = {
  ...D[0], id: 'fixture-unmeasured-record', domainRating: null, metricsProvenance: {},
};
const UNMEASURED_SAMPLE = UNMEASURED.length ? UNMEASURED : [UNMEASURED_FIXTURE];

test('every published Domain Rating is a measurement, never an invented number', () => {
  assert.ok(MEASURED.length > 0, 'no record carries a Domain Rating: the reading guards are vacuous');
  // This is what replaces the frozen digest. domainRatingProblems() demands the
  // 0-100 scale and provenance naming the provider, the date and the measured
  // domain, so a hand-typed number cannot pass as a reading.
  const invented = [];
  for (const r of D) {
    for (const [field, why] of S.domainRatingProblems(r)) invented.push(`${r.id} ${field}: ${why}`);
  }
  assert.deepStrictEqual(invented, [], `a published Domain Rating is not a measurement:\n${invented.join('\n')}`);
  // The stand-in for a population the corpus no longer has must itself be a
  // legal unmeasured record, or the null-handling guards below prove nothing.
  assert.deepStrictEqual(S.domainRatingProblems(UNMEASURED_FIXTURE), [],
    'the unmeasured fixture is not a legal record');
  assert.ok(UNMEASURED_SAMPLE.length > 0, 'no unmeasured example exists to check null handling against');
});

// --- 1. no active workflow requires a credential ----------------------------

test('no build, validator or test reads AHREFS_API_KEY', () => {
  const active = [
    'scripts/build-business-directories.cjs',
    'scripts/build-country-intelligence.cjs',
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
  'scripts/build-country-intelligence.cjs',
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

// --- 3 & 4. every published rating is one somebody actually measured --------
//
// These four tests used to pin a frozen digest over 64 readings, because
// collection was frozen and any change to a value was by definition wrong.
// Collection is no longer frozen — Ahrefs' public Domain Rating endpoint is
// free and the policy had been written against the plan-gated one — so a pinned
// digest would now fail every time the corpus is refreshed, which is the one
// thing it must not do.
//
// What replaces it is stricter about the thing that actually matters. A frozen
// digest proved nobody had EDITED a rating. These prove nobody INVENTED one:
// every value published anywhere in the corpus has to be traceable to a reading
// in the committed findings ledger, measured on the record's own domain, by a
// named provider, on a real date. A hand-typed 90 fails that; so does a value
// copied from a parent domain onto a subdomain.

const CK = require(path.join(ROOT, 'scripts/lib/rc-checkpoint.cjs'));
const DR_FINDINGS = path.join(ROOT, 'data/domain-rating/.ahrefs-domain-rating.json');

function measuredByTarget() {
  if (!fs.existsSync(DR_FINDINGS)) return new Map();
  const led = new CK.Ledger(DR_FINDINGS);
  const out = new Map();
  for (const f of led.all()) if (f.state === 'MEASURED') out.set(f.target, f);
  led.close();
  return out;
}

// One row per measured domain. Records reusing one reading collapse to a single
// row; records disagreeing about a domain would produce two, on top of failing
// sharedDomainSnapshotProblems().
function measurementRows() {
  const rows = new Set();
  for (const r of MEASURED) {
    const p = (r.metricsProvenance || {}).domainRating || {};
    rows.add(`${p.measuredDomain}:${r.domainRating}:${p.provider}:${p.measuredAt}:${p.status}`);
  }
  return [...rows].sort();
}

test('no published Domain Rating was invented', () => {
  const found = measuredByTarget();
  if (!found.size) {
    // Nothing has been acquired yet. The corpus may still carry the readings
    // that predate the ledger, and those are covered by the provenance tests
    // below; what must not happen is this test passing vacuously while ALSO
    // claiming to have checked something.
    assert.equal(MEASURED.filter((r) => r.metricsProvenance.domainRating.status
      === S.METRIC_READING_STATUS).length, 0,
    'records claim an API reading but no findings ledger exists to back it');
    return;
  }
  for (const r of MEASURED) {
    const p = r.metricsProvenance.domainRating;
    if (p.status !== S.METRIC_READING_STATUS) continue;
    const f = found.get(p.measuredDomain);
    assert.ok(f, `${r.id} publishes a rating for "${p.measuredDomain}" that no finding records`);
    assert.strictEqual(r.domainRating, f.domainRating,
      `${r.id} publishes ${r.domainRating} where the finding for "${p.measuredDomain}" says ${f.domainRating}`);
    assert.strictEqual(p.measuredAt, f.checkedAt,
      `${r.id} dates its rating ${p.measuredAt} but the reading was taken ${f.checkedAt}`);
  }
  // Reuse must never become divergence: one domain, one reading.
  assert.deepStrictEqual(S.sharedDomainSnapshotProblems(D), []);
});

test('a shared domain adds records but never a second measurement', () => {
  const domains = new Set(MEASURED.map((r) => r.metricsProvenance.domainRating.measuredDomain));
  assert.ok(MEASURED.length >= domains.size,
    'more measured domains than records carrying them is impossible');
  assert.ok(measurementRows().length === domains.size,
    'one domain produced two different readings');
  for (const r of MEASURED) {
    assert.strictEqual(r.metricsProvenance.domainRating.measuredDomain, S.normaliseDomain(r.website),
      `${r.id} displays a rating measured on a domain that is not its own`);
  }
});

test('every Domain Rating is a dated reading from a named provider', () => {
  for (const r of MEASURED) {
    const p = (r.metricsProvenance || {}).domainRating;
    assert.ok(p, `${r.id} has a Domain Rating with no provenance`);
    assert.ok(S.METRIC_PROVIDERS.includes(p.provider), `${r.id} names an unrecognised provider`);
    assert.ok(S.METRIC_PROVENANCE_STATUSES.includes(p.status),
      `${r.id} marks its Domain Rating with an unrecognised status "${p.status}"`);
    assert.match(p.measuredAt, S.DATE_RE, `${r.id} has no measurement date`);
    assert.ok(p.measuredDomain, `${r.id} does not record which domain was measured`);
    assert.ok(r.domainRating >= S.DOMAIN_RATING_RANGE.min && r.domainRating <= S.DOMAIN_RATING_RANGE.max,
      `${r.id} publishes ${r.domainRating}, outside the 0-100 scale`);
  }
});

test('no rating is dated in the future', () => {
  // The freeze date is gone, but a date still has to be a date that happened.
  // A reading stamped tomorrow is a clock bug or a hand edit, and either way the
  // freshness policy would then never consider it stale.
  const now = new Date().toISOString().slice(0, 10);
  for (const r of MEASURED) {
    const p = r.metricsProvenance.domainRating;
    assert.ok(p.measuredAt <= now,
      `${r.id} carries a Domain Rating measured ${p.measuredAt}, which is in the future`);
  }
});

// --- 5. a missing metric is null, never zero --------------------------------

test('a missing authority metric is null and never zero', () => {
  // CHANGED (policy reversal): walks UNMEASURED_SAMPLE, which is the corpus's own
  // unmeasured records where it has any and the fixture where it has none. The
  // rule is unchanged — absence is null, never a zero standing in for one.
  for (const r of UNMEASURED_SAMPLE) {
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

test('the pages that show Domain Rating say who measured it and when', () => {
  // The note no longer claims measurements are never collected — they are. What
  // it must still do is stop a reader taking the number for something it is
  // not: a live reading, a judgement of the page rather than the domain, or a
  // zero where nobody has looked.
  assert.match(S.DR_SNAPSHOT_POLICY_NOTE, /measured by Ahrefs/);
  assert.match(S.DR_SNAPSHOT_POLICY_NOTE, /the date it was read/);
  assert.match(S.DR_SNAPSHOT_POLICY_NOTE, /not the individual page/);
  assert.match(S.DR_SNAPSHOT_POLICY_NOTE, /not the same as a record measured at zero/);
  const components = read('scripts/lib/bd-components.cjs');
  assert.ok(components.includes('DR_SNAPSHOT_POLICY_NOTE'),
    'the renderer never emits the policy note');

  const hub = read(path.join('research', 'business-directories', 'index.html'));
  assert.ok(hub.includes('measured by Ahrefs'),
    'the hub does not tell a reader who measured the ratings');
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
  // CHANGED (policy reversal): every record now carries a reading, so the corpus
  // no longer supplies an unmeasured example. The property under test is that
  // ranking and indexing never depend on a Domain Rating, which the fixture
  // exercises exactly as a real unmeasured record did.
  for (const r of UNMEASURED_SAMPLE) {
    assert.strictEqual(typeof r.petroHrysScore, 'number',
      `${r.id} has no Domain Rating and no score, so it ranks nowhere`);
    assert.ok(S.indexability(r).indexable,
      `${r.id} is not indexable: ${S.indexability(r).missing.join(', ')}`);
  }
});

// --- 10 & 11. ordering treats absence as absence ----------------------------

test('the Domain Rating view places unmeasured records after measured ones', () => {
  // CHANGED (policy reversal): sorted over the corpus PLUS the unmeasured fixture.
  // The corpus alone no longer contains a record without a rating, so ordering
  // "nulls last" could not be observed from it at all; appending the fixture puts
  // the comparator back under test instead of dropping the check.
  const ordered = sortDirectories([...D, UNMEASURED_FIXTURE], 'domain-rating');
  const lastMeasured = ordered.reduce((acc, r, i) => (hasDR(r) ? i : acc), -1);
  const firstUnmeasured = ordered.findIndex((r) => !hasDR(r));
  assert.ok(firstUnmeasured > lastMeasured,
    'an unmeasured record sorts above a measured one in the Domain Rating view');
  assert.strictEqual(ordered.length, D.length + 1, 'the authority view drops records');
});

test('the default view ranks on the PetroHrys Score, not on Domain Rating', () => {
  const ordered = sortDirectories(D, 'default');
  for (let i = 1; i < ordered.length; i += 1) {
    assert.ok(ordered[i - 1].petroHrysScore >= ordered[i].petroHrysScore,
      `default order breaks at ${ordered[i].id}: score rose after falling`);
  }
  // Non-vacuity. CHANGED (policy reversal): this used to require an unmeasured
  // record to outrank a measured one, which every record carrying a reading has
  // made unobservable. Independence is demonstrated two ways instead, and both
  // are stronger about the actual claim than the old form was.
  //
  // On the real corpus: the default order must NOT be the Domain Rating order,
  // so somewhere a lower-rated domain outranks a higher-rated one.
  const inverted = ordered.some((r, i) => i > 0 && ordered[i - 1].domainRating < r.domainRating);
  assert.ok(inverted,
    'the default order never inverts Domain Rating, so it is indistinguishable from ranking on it');
  // And on the comparator itself: a record with no rating at all is ranked on its
  // score, ahead of a highly rated record that scores worse.
  const sample = [
    { id: 'high-rating-low-score', domainRating: 95, petroHrysScore: 40 },
    { id: 'no-rating-high-score', domainRating: null, petroHrysScore: 90 },
  ];
  assert.deepStrictEqual(sortDirectories(sample.slice(), 'default').map((r) => r.id),
    ['no-rating-high-score', 'high-rating-low-score'],
    'the default view ranks a rated record above an unrated one that scores higher');
});

test('an absent rating renders as words, never as a number', () => {
  assert.strictEqual(S.DR_NOT_MEASURED_LABEL, 'Not measured');
  const components = read('scripts/lib/bd-components.cjs');
  assert.ok(components.includes('DR_NOT_MEASURED_LABEL'),
    'the renderer does not use the shared not-measured label');

  // CHANGED (policy reversal): every record now carries a reading, so no page is
  // generated for an unmeasured record and the emitted-HTML loop below has nothing
  // to walk. Rather than drop the check, the renderer is called directly with an
  // absent rating: what mattered was never that such a page exists, it was that an
  // absence renders as words and never as a number.
  const rendered = c.metric(UNMEASURED_FIXTURE.domainRating, undefined, undefined, S.DR_NOT_MEASURED_LABEL);
  assert.ok(rendered.includes(S.DR_NOT_MEASURED_LABEL),
    'the renderer does not label an absent Domain Rating');
  assert.ok(!/>\s*0\s*</.test(rendered), 'the renderer prints 0 for an absent Domain Rating');

  // And where the corpus does hold an unmeasured record, its published page must
  // say so. This loop is unchanged; it walks nothing while every record is read.
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
  assert.ok(UNMEASURED.length === 0 || checked > 0,
    'an unmeasured record exists but no generated page for one was checked: the guard is vacuous');
});
