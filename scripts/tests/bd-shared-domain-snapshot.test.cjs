// scripts/tests/bd-shared-domain-snapshot.test.cjs
'use strict';

// Domain Rating collection is frozen, but "frozen" is a rule about MEASUREMENT,
// not about whether an already-measured number may appear twice. A Domain
// Rating is a fact about a domain, so when a second registry is published on a
// domain the dataset has already measured, repeating that domain's stored
// snapshot collects nothing: same value, same provider, same date, same status,
// no network call, no credential.
//
// What must stay impossible is the opposite: a NEW measurement, a differing
// figure for one domain, a refreshed date, a swapped provider, or a value
// copied onto a record that lives on a different domain. Those would each
// publish something the stored measurement does not say.
//
// These tests drive scripts/lib/bd-schema.cjs#sharedDomainSnapshotProblems,
// which is the single rule the validator and bd-truth both call.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const S = require('../lib/bd-schema.cjs');
const { loadRegistry } = require('../lib/bd-registry.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const D = loadRegistry().directories;

// A minimal record carrying a snapshot. Only the fields the rule reads.
function rec(id, website, dr, over = {}) {
  return {
    id,
    website,
    domainRating: dr,
    editorNotes: '',
    metricsProvenance: dr === null ? {} : {
      domainRating: {
        provider: 'Ahrefs',
        measuredAt: '2026-08-04',
        status: 'historicalSnapshot',
        measuredDomain: S.normaliseDomain(website),
        ...over,
      },
    },
  };
}

// --- 1. identical shared-domain snapshot is allowed --------------------------

test('an identical snapshot repeated on one measured domain is allowed', () => {
  const problems = S.sharedDomainSnapshotProblems([
    rec('a', 'https://ised-isde.canada.ca/cc/lgcy/fdrlCrpSrch.html', 92),
    rec('b', 'https://ised-isde.canada.ca/cipo/trademark-search/srch', 92),
  ]);
  assert.deepStrictEqual(problems, [], 'reuse of an identical stored snapshot must be permitted');
});

test('reuse is permitted across three records and across countries', () => {
  // One domain can legitimately carry records filed under different countries;
  // they must still agree about what was measured.
  const problems = S.sharedDomainSnapshotProblems([
    rec('a', 'https://example.gov/one', 71),
    rec('b', 'https://example.gov/two', 71),
    rec('c', 'https://www.example.gov/three', 71),
  ]);
  assert.deepStrictEqual(problems, []);
});

// --- 2. different values on one measuredDomain fail --------------------------

test('two different Domain Ratings for one measured domain are rejected', () => {
  const problems = S.sharedDomainSnapshotProblems([
    rec('a', 'https://ised-isde.canada.ca/one', 92),
    rec('b', 'https://ised-isde.canada.ca/two', 78),
  ]);
  assert.strictEqual(problems.length, 1);
  assert.strictEqual(problems[0].id, 'b');
  assert.strictEqual(problems[0].field, 'domainRating');
  assert.match(problems[0].reason, /one dated snapshot/);
});

// --- 3. different dates fail --------------------------------------------------

test('the same value under two measurement dates is rejected', () => {
  // This is what a silent refresh would look like, and it is the failure the
  // frozen-collection policy exists to prevent.
  const problems = S.sharedDomainSnapshotProblems([
    rec('a', 'https://ised-isde.canada.ca/one', 92),
    rec('b', 'https://ised-isde.canada.ca/two', 92, { measuredAt: '2026-08-05' }),
  ]);
  assert.strictEqual(problems.length, 1);
  assert.strictEqual(problems[0].field, 'metricsProvenance.domainRating.measuredAt');
});

// --- 4. different providers fail ----------------------------------------------

test('the same value under two providers is rejected', () => {
  const problems = S.sharedDomainSnapshotProblems([
    rec('a', 'https://ised-isde.canada.ca/one', 92),
    rec('b', 'https://ised-isde.canada.ca/two', 92, { provider: 'Semrush' }),
  ]);
  assert.strictEqual(problems.length, 1);
  assert.strictEqual(problems[0].field, 'metricsProvenance.domainRating.provider');
});

test('a snapshot presented as current rather than historical is rejected', () => {
  const problems = S.sharedDomainSnapshotProblems([
    rec('a', 'https://ised-isde.canada.ca/one', 92),
    rec('b', 'https://ised-isde.canada.ca/two', 92, { status: 'current' }),
  ]);
  assert.strictEqual(problems.length, 1);
  assert.strictEqual(problems[0].field, 'metricsProvenance.domainRating.status');
});

// --- 5. a snapshot copied onto another domain fails ---------------------------

test('a snapshot copied onto a different domain is rejected', () => {
  const problems = S.sharedDomainSnapshotProblems([
    rec('a', 'https://ised-isde.canada.ca/one', 92),
    { ...rec('b', 'https://brevets-patents.ic.gc.ca/search', 92),
      metricsProvenance: {
        domainRating: {
          provider: 'Ahrefs',
          measuredAt: '2026-08-04',
          status: 'historicalSnapshot',
          measuredDomain: 'ised-isde.canada.ca',
        },
      } },
  ]);
  assert.strictEqual(problems.length, 1);
  assert.strictEqual(problems[0].id, 'b');
  assert.strictEqual(problems[0].field, 'metricsProvenance.domainRating.measuredDomain');
  assert.match(problems[0].reason, /exact domain it was measured on/);
});

test('a parent-domain value carried down to a subdomain is rejected', () => {
  // canada.ca measured; ised-isde.canada.ca is a different domain and a
  // different measurement, however closely related the two look.
  const problems = S.sharedDomainSnapshotProblems([
    { ...rec('sub', 'https://ised-isde.canada.ca/one', 92),
      metricsProvenance: {
        domainRating: {
          provider: 'Ahrefs',
          measuredAt: '2026-08-04',
          status: 'historicalSnapshot',
          measuredDomain: 'canada.ca',
        },
      } },
  ]);
  assert.strictEqual(problems.length, 1);
  assert.strictEqual(problems[0].field, 'metricsProvenance.domainRating.measuredDomain');
});

// --- the documented-null escape hatch ------------------------------------------

test('an undocumented null on an already measured domain is rejected', () => {
  const problems = S.sharedDomainSnapshotProblems([
    rec('a', 'https://ised-isde.canada.ca/one', 92),
    rec('b', 'https://ised-isde.canada.ca/two', null),
  ]);
  assert.strictEqual(problems.length, 1);
  assert.strictEqual(problems[0].id, 'b');
  assert.strictEqual(problems[0].field, 'domainRating');
});

test('a null on an already measured domain is allowed when the reason is recorded', () => {
  const b = rec('b', 'https://ised-isde.canada.ca/two', null);
  b.editorNotes = 'Domain Rating not reused: this record points at a distinct operator '
    + 'that merely shares the departmental host.';
  const problems = S.sharedDomainSnapshotProblems([
    rec('a', 'https://ised-isde.canada.ca/one', 92),
    b,
  ]);
  assert.deepStrictEqual(problems, []);
});

test('a null on an unmeasured domain needs no explanation at all', () => {
  const problems = S.sharedDomainSnapshotProblems([
    rec('a', 'https://ised-isde.canada.ca/one', 92),
    rec('b', 'https://companiesoffice.gov.mb.ca/', null),
  ]);
  assert.deepStrictEqual(problems, []);
});

// --- 6. no new network measurement occurs ---------------------------------------

test('reusing a snapshot performs no network call and needs no credential', () => {
  // The rule is a pure function of the records handed to it. If it ever grew a
  // fetch, a DNS lookup or a key read, these requires would appear in its
  // module and this would fail.
  const src = fs.readFileSync(path.join(ROOT, 'scripts/lib/bd-schema.cjs'), 'utf8');
  for (const forbidden of ['require(\'https\')', 'require("https")', 'require(\'http\')',
    'require(\'dns\')', 'fetch(', 'XMLHttpRequest', 'AHREFS_API_KEY', 'process.env']) {
    assert.ok(!src.includes(forbidden),
      `bd-schema.cjs references ${forbidden}; the snapshot rule must stay offline and credential-free`);
  }
  // And it must be deterministic: same input, same output, no clock, no random.
  const input = [
    rec('a', 'https://ised-isde.canada.ca/one', 92),
    rec('b', 'https://ised-isde.canada.ca/two', 92),
  ];
  assert.deepStrictEqual(S.sharedDomainSnapshotProblems(input), S.sharedDomainSnapshotProblems(input));
});

test('no measurement script is invoked anywhere in the build or validate path', () => {
  for (const f of ['scripts/build-business-directories.cjs', 'scripts/validate-business-directories.cjs',
    'scripts/migrate-business-directories.cjs', 'scripts/lib/bd-schema.cjs']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(!src.includes('measure-business-directory-dr'),
      `${f} reaches for the retired measurement utility`);
  }
});

// --- 7. historical DR stays independent of the PetroHrys Score -------------------

test('no score factor is named after or derived from Domain Rating', () => {
  for (const factor of S.SCORE_FACTORS) {
    assert.ok(!/domain|ahrefs|rating|authority|traffic|backlink|referring/i.test(factor.key),
      `score factor "${factor.key}" is named after a third-party metric`);
  }
});

test('a record’s score is unchanged by gaining or losing a Domain Rating', () => {
  // The two rankings are independent. Reusing a snapshot must not move a score.
  for (const r of D) {
    assert.strictEqual(S.computeScore(r.scoreFactors), r.petroHrysScore,
      `${r.id} score does not reproduce from its factors alone`);
  }
  const withDr = D.find((r) => r.domainRating !== null);
  assert.ok(withDr, 'expected at least one measured record');
  const stripped = { ...withDr, domainRating: null, metricsProvenance: {} };
  assert.strictEqual(S.computeScore(stripped.scoreFactors), withDr.petroHrysScore,
    'removing the Domain Rating changed the computed score');
});

test('the shipped registry holds exactly one snapshot per measured domain', () => {
  const byDomain = new Map();
  for (const r of D) {
    const p = (r.metricsProvenance || {}).domainRating;
    if (!p || !p.measuredDomain) continue;
    const key = p.measuredDomain;
    const sig = JSON.stringify([r.domainRating, p.provider, p.measuredAt, p.status]);
    if (!byDomain.has(key)) byDomain.set(key, new Set());
    byDomain.get(key).add(sig);
  }
  for (const [domain, sigs] of byDomain) {
    assert.strictEqual(sigs.size, 1,
      `${domain} carries ${sigs.size} different snapshots: ${[...sigs].join(' vs ')}`);
  }
  assert.deepStrictEqual(S.sharedDomainSnapshotProblems(D), []);
});

test('the public wording says the rating describes the domain, not the page', () => {
  // The claim about COLLECTION changed when the freeze lifted. The claim this
  // test exists for did not: a reader looking at one record among six on a
  // shared domain must be told the number is the domain's, or they will read it
  // as a verdict on the page in front of them.
  assert.match(S.DR_SNAPSHOT_POLICY_NOTE, /measured by Ahrefs/);
  assert.match(S.DR_SNAPSHOT_POLICY_NOTE,
    /describes the whole domain that was measured, not the individual page it appears beside/);
  assert.match(S.DR_SNAPSHOT_POLICY_NOTE,
    /repeat that domain’s single dated reading rather than each carrying a figure of its own/);
  assert.match(S.DR_SNAPSHOT_POLICY_NOTE, /not the same as a record measured at zero/);
});
