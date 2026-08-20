'use strict';
// The publication contract (docs/publication-contract.md) is only worth having if
// something enforces the parts of it that a machine can check. This suite does
// three things and deliberately no more:
//
//   1. Keeps the §1 pillar mapping EXHAUSTIVE. The registry loader already
//      rejects a category that is not declared in categories.json, so the real
//      drift path is DECLARING a new category and using it without assigning it
//      to a pillar — which is what this catches. This is also the rule my own
//      first draft broke: three vertical categories hold government registries,
//      and measuring compliance by `category === 'government'` misclassified
//      fifteen statutory registers.
//   2. Pins Pillar 1's achieved structural standard at 100% as a FLOOR, so it
//      cannot regress while attention moves to Phases B and C.
//   3. Holds the contract's own metric rules to the registry.
//
// It deliberately does NOT assert the §7 compliance percentages. Those are a
// dated measurement, not an invariant, and pinning them would force an edit on
// every wave that improves a record — punishing exactly the behaviour the
// migration policy asks for.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { loadRegistry } = require('../lib/bd-registry.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const CONTRACT = path.join(ROOT, 'docs', 'publication-contract.md');
const ALL = loadRegistry().directories;

// §1. Every category in use belongs to exactly one pillar.
const PILLARS = {
  1: ['government', 'finance', 'healthcare', 'telecommunications'],
  2: ['local-business', 'general-business', 'review-sites', 'marketing',
    'press-release-platforms', 'legal'],
  3: ['startup', 'software', 'developer', 'app-directories'],
};
const PILLAR_1 = new Set(PILLARS[1]);

test('the publication contract exists and is versioned', () => {
  assert.ok(fs.existsSync(CONTRACT), 'docs/publication-contract.md is missing');
  const doc = fs.readFileSync(CONTRACT, 'utf8');
  assert.match(doc, /\*\*Version \d+\.\d+\*\*/, 'the contract carries no version');
  // The sections other waves are told to follow must actually be present.
  for (const s of ['## 1. Scope and pillars', '## 2. Universal rules',
    '## 3. Identity contract', '## 4. Observation classes', '## 5. Rejection contract',
    '## 6. Verification and testing discipline', '## 7. Current compliance',
    '## 8. What a machine enforces', '## 9. Amendment']) {
    assert.ok(doc.includes(s), `the contract is missing section: ${s}`);
  }
});

test('the pillar mapping covers every category in use, and claims none that is not', () => {
  const declared = new Set([...PILLARS[1], ...PILLARS[2], ...PILLARS[3]]);
  assert.strictEqual(declared.size, PILLARS[1].length + PILLARS[2].length + PILLARS[3].length,
    'a category is claimed by more than one pillar');

  const inUse = new Set(ALL.map((r) => r.category));
  for (const c of inUse) {
    assert.ok(declared.has(c),
      `category "${c}" is in use but belongs to no pillar in the contract — add it to §1 deliberately, do not let it drift in`);
  }
  for (const c of declared) {
    assert.ok(inUse.has(c),
      `the contract claims category "${c}" but no record uses it`);
  }

  // And the contract text must name the same categories the code does.
  const doc = fs.readFileSync(CONTRACT, 'utf8');
  for (const c of declared) {
    assert.ok(doc.includes(`\`${c}\``), `§1 does not name the category "${c}"`);
  }
});

test('the vertical categories that hold government systems are pillar 1', () => {
  // This is the correction that prompted the test. Records like the FCA Register,
  // FCC ULS and the Care Quality Commission sit under vertical categories, not
  // under `government`. If any of them lost its operator the split would be wrong.
  const VERTICAL_GOV = ['gb-fca-register', 'us-fcc-uls', 'us-fcc-form-499',
    'gb-cqc', 'us-finra-brokercheck', 'us-fdic-bankfind', 'us-sec-iapd'];
  for (const id of VERTICAL_GOV) {
    const r = ALL.find((x) => x.id === id);
    assert.ok(r, `${id} disappeared`);
    assert.ok(PILLAR_1.has(r.category),
      `${id} is a statutory system but its category "${r.category}" is not in pillar 1`);
  }
});

// §7 floor. Pillar 1 reached 100% on both structural fields; that is now a floor.
test('every pillar 1 record carries an operator and registry types', () => {
  const p1 = ALL.filter((r) => PILLAR_1.has(r.category));
  assert.ok(p1.length >= 218, `pillar 1 shrank to ${p1.length}`);
  const noOperator = p1.filter((r) => !r.operator || !r.operator.name);
  const noTypes = p1.filter((r) => !Array.isArray(r.registryTypes) || r.registryTypes.length === 0);
  assert.deepStrictEqual(noOperator.map((r) => r.id), [],
    'a pillar 1 record lost its operator — the achieved standard regressed');
  assert.deepStrictEqual(noTypes.map((r) => r.id), [],
    'a pillar 1 record lost its registry types — the achieved standard regressed');
});

// NOTE: an "operator must be an institution" guard was drafted here and removed.
// Detecting an institution by keyword needs an ever-growing list — it rejected
// "National Futures Association" on first run — and bd-source-of-record.test.cjs
// already asserts that no government record names a current officeholder as its
// operator, which is the defect that actually matters. A guard that needs
// maintenance to avoid false positives is a liability, not a safeguard.

// §2.6. The contract's metric rules must hold on the registry.
test('the metric rules in the contract hold on the registry', () => {
  // CHANGED (policy reversal): this pinned the measured-domain set at 64 and
  // required the contract to keep restating that count and the frozen digest
  // aa7e6984…. The freeze has been lifted by decision of the repository owner —
  // Ahrefs publishes Domain Rating through /v3/public/domain-rating-free, which
  // costs nothing and needs only a free key — and the whole corpus has been read
  // from it. A pinned count and digest would now fail on every refresh, which is
  // precisely what a guard must not do.
  //
  // I did NOT revise the contract: §2.6 rules 19-21 still state the freeze, the
  // 64-measurement count and the digest, and that wording is now stale. Editing
  // docs/ is outside this change, so those sentences are simply no longer pinned
  // by a test — asserting them would hold the registry to a policy that has been
  // withdrawn.
  //
  // The §2.6 rule that SURVIVED the reversal is the reuse rule, and it is worth
  // more than a count: it is asserted against the registry itself.
  const doc = fs.readFileSync(CONTRACT, 'utf8');
  // "reading" rather than "snapshot": the contract now uses one word for the
  // thing throughout, because "snapshot" carried the frozen-historical sense
  // that the policy reversal retired.
  assert.ok(doc.includes('An already-measured domain reuses its stored reading verbatim'),
    'the contract no longer states the shared-domain reuse rule');
  const S = require('../lib/bd-schema.cjs');
  const shared = S.sharedDomainSnapshotProblems(ALL);
  assert.deepStrictEqual(shared, [],
    `records on one measured domain do not repeat one identical reading:\n${shared.map((x) => `${x.id} ${x.field}`).join('\n')}`);

  // And what the frozen digest was standing in for: no published rating is an
  // invented number, and none is a measurement of somebody else's domain.
  const measured = ALL.filter((r) => r.domainRating !== null && r.domainRating !== undefined);
  assert.ok(measured.length > 0, 'no record carries a Domain Rating: this guard is vacuous');
  for (const r of measured) {
    assert.deepStrictEqual(S.domainRatingProblems(r), [],
      `${r.id} publishes a Domain Rating that is not a measurement`);
    assert.strictEqual(r.metricsProvenance.domainRating.measuredDomain, S.normaliseDomain(r.website),
      `${r.id} displays a rating measured on a domain that is not its own`);
  }
});

// §2.7. Derived fields are derived, contract-wide.
test('no record hand-sets a derived field', () => {
  const S = require('../lib/bd-schema.cjs');
  const wrong = ALL.filter((r) => r.scoreFactors && r.petroHrysScore !== S.computeScore(r.scoreFactors));
  assert.deepStrictEqual(wrong.map((r) => r.id), [],
    'a record carries a score that does not follow from its factors');
});

// §2.1 / §5. No record may be published on a non-https or placeholder URL.
test('every record is published on a real https URL', () => {
  for (const r of ALL) {
    assert.match(r.website, /^https:\/\//, `${r.id} is not served over https`);
    assert.ok(!/example\.|localhost|127\.0\.0\.1|TODO|PLACEHOLDER/i.test(r.website),
      `${r.id} carries a placeholder URL`);
  }
});

// §8 honesty check: the contract claims the validator enforces the shared-host
// material-difference rule. If that stops being true the claim must be revised.
test('the validator still enforces the shared-host material-difference rule', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'bd-schema.cjs'), 'utf8')
    + fs.readFileSync(path.join(ROOT, 'scripts', 'validate-business-directories.cjs'), 'utf8');
  assert.match(src, /not materially different/i,
    '§8 claims the validator rejects non-material URL differences on a shared host, but that check is gone');
});
