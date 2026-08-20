'use strict';
// The "apply" listing action — eligibility-gated inclusion.
//
// Added because Wave 1C.1A's genuine candidates were almost all certification
// directories (state supplier-diversity programmes, chamber member directories,
// tourism partner listings) and every existing enum value described them
// falsely:
//
//   create        hides the gate — implies submitting produces a listing
//   invite-only   renders "Invite only", denying that a business may apply
//   claim         a different action entirely; there is no prior profile
//   unknown       discards documented evidence
//
// This file holds the boundary between "apply" and its neighbours, and the rule
// that the enum alone never makes a candidate publishable: an application route
// and a public discovery surface are still two separate proofs.
//
// NOTHING uses "apply" yet. That is deliberate and is asserted here, because a
// schema value quietly backfilled onto existing records would be the worst
// outcome of this change.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const S = require('../lib/bd-schema.cjs');
const c = require('../lib/bd-components.cjs');
const { loadRegistry } = require('../lib/bd-registry.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const ALL = loadRegistry().directories;

// ── 1 + 2. the value and its label ──────────────────────────────────────────
test('apply is a valid listing action', () => {
  assert.ok(S.LISTING_ACTIONS.includes('apply'), '"apply" is not in LISTING_ACTIONS');
  // Additive only: every previous value survives, and none changed position
  // meaning. A record written before this change must still validate.
  for (const v of ['create', 'claim', 'create-and-claim', 'invite-only',
    'not-applicable', 'unknown']) {
    assert.ok(S.LISTING_ACTIONS.includes(v), `${v} was removed from LISTING_ACTIONS`);
  }
  assert.strictEqual(S.LISTING_ACTIONS.length, 7, 'the enum gained or lost more than "apply"');
});

test('the public label is exactly "Apply for inclusion"', () => {
  // Rendered through the real component, not by reading the constant, so a
  // renderer that ignores the label map still fails.
  const rec = {
    id: 'probe', listingAction: 'apply', verificationMethods: null,
    ownerResponseSupport: null, claimUrl: null, submissionUrl: 'https://example.org/apply',
  };
  const html = c.listingInformation(rec);
  assert.match(html, /Apply for inclusion/, 'the apply label does not render');
  assert.ok(!/Create a listing/.test(html), 'an apply record renders the create label');
  assert.ok(!/Invite only/.test(html), 'an apply record renders the invite-only label');
});

// ── 3 + 4 + 14. boundaries against the neighbours ───────────────────────────
test('apply, create, invite-only and unknown stay distinct', () => {
  const label = (a) => c.listingInformation({
    id: 'p', listingAction: a, verificationMethods: null, ownerResponseSupport: null,
    claimUrl: null, submissionUrl: 'https://example.org/x',
  });
  const rendered = ['create', 'apply', 'invite-only'].map(label);
  assert.strictEqual(new Set(rendered).size, 3, 'two actions render identically');
  // "unknown" must still render no listing block at all — adding a value must
  // not accidentally make unresearched platforms display a listing row.
  const unknown = label('unknown');
  assert.ok(!/Apply for inclusion|Create a listing|Invite only/.test(unknown),
    'an unknown action now renders a listing label');
});

// ── 5 + 6. the validation contract ──────────────────────────────────────────
// Exercised through S.applyContractProblems, the SAME function the validator
// calls. An earlier version of this file ran the real validator against a
// temporarily mutated registry; that raced against every other test file
// reading the registry in parallel and produced ten unrelated failures. One
// shared pure function removes the shared mutable state entirely.
const applyRecord = (over = {}) => ({
  id: 'probe-apply',
  submissionUrl: 'https://example.org/apply',
  description: 'A probe record used only inside a test to exercise the apply validation contract.',
  listingAction: 'apply',
  claimUrl: null,
  bestFor: ['Businesses that qualify under the programme criteria.'],
  notRecommendedFor: ['Businesses that do not meet the certification requirement.'],
  pros: ['Any qualifying business may apply for inclusion.'],
  cons: ['Acceptance is not automatic and depends on certification.'],
  ...over,
});
const problemFields = (r) => S.applyContractProblems(r).map(([f]) => f);
const problemText = (r) => S.applyContractProblems(r).map(([, m]) => m).join(' ');

test('the contract applies only to apply records', () => {
  for (const a of ['create', 'claim', 'create-and-claim', 'invite-only', 'unknown', 'not-applicable']) {
    assert.deepStrictEqual(S.applyContractProblems({ listingAction: a }), [],
      `the apply contract fired on a "${a}" record`);
  }
});

test('apply requires the eligibility gate to be visible to a reader', () => {
  assert.deepStrictEqual(S.applyContractProblems(applyRecord()), [],
    'a well-formed apply record was rejected');

  // Gate ONLY in editorNotes → rejected. This is the whole point of the rule.
  const hidden = applyRecord({
    pros: ['The platform is well established.'],
    cons: ['The platform does not document how long a decision takes.'],
    bestFor: ['Businesses wanting another listing.'],
    notRecommendedFor: ['Businesses outside the covered region.'],
    description: 'A probe record whose gate is stated only in internal notes.',
    editorNotes: 'Certification and eligibility are required.',
  });
  assert.match(problemText(hidden), /no visible field explains the eligibility/i,
    'an apply record with the gate hidden in editorNotes was accepted');
});

test('apply requires an official application route', () => {
  assert.match(problemText(applyRecord({ submissionUrl: null })),
    /no submissionUrl records the official application route/i,
    'an apply record with no application route was accepted');
});

test('apply and claim cannot both be asserted on one record', () => {
  assert.ok(problemFields(applyRecord({ claimUrl: 'https://example.org/claim' })).includes('claimUrl'),
    'a record asserted both an application route and a claim endpoint');
});

test('the validator actually calls the shared contract', () => {
  // A contract nothing enforces is documentation. Assert the wiring exists.
  const src = fs.readFileSync(path.join(ROOT, 'scripts/validate-business-directories.cjs'), 'utf8');
  assert.match(src, /S\.applyContractProblems\(/,
    'the validator no longer calls the shared apply contract');
});

// ── 10. cost stays independent of action ────────────────────────────────────
test('a free application never implies a free listing', () => {
  // The two axes must remain orthogonal: every cost posture is legal with apply,
  // because a free application says nothing about the cost of inclusion.
  for (const model of ['free', 'paid', 'freemium', 'unknown']) {
    assert.deepStrictEqual(S.applyContractProblems(applyRecord({ submissionModel: model })), [],
      `apply + ${model} was rejected, but the axes are independent`);
  }
  // And the action must not be derivable from the cost, in either direction.
  assert.ok(!S.LISTING_ACTIONS.includes('free'), 'a cost value leaked into the action enum');
  assert.ok(!S.SUBMISSION_MODELS.includes('apply'), 'the action leaked into the cost enum');
});

// ── 11 + 12. nothing was backfilled ─────────────────────────────────────────
test('no existing record was assigned apply', () => {
  const applied = ALL.filter((r) => r.listingAction === 'apply');
  assert.deepStrictEqual(applied.map((r) => r.id), [],
    'a record already uses "apply"; this schema phase must not backfill any record');
});

test('the enum addition rewrote no record and changed no page', () => {
  // Both generators are idempotent at HEAD, so a schema change that touched
  // data or output would show up here as a non-zero count.
  //
  // NOTE: this test RUNS the generators, so it writes to the working tree if
  // the registry has been mutated. A mutation harness that invokes this suite
  // must rebuild after restoring, or it will leave stale generated pages
  // behind. That hazard was found by this wave's own harness and the harness
  // now rebuilds on restore.
  const mig = execFileSync('node', ['scripts/migrate-business-directories.cjs'],
    { cwd: ROOT, encoding: 'utf8' });
  assert.match(mig, /0 file\(s\) rewritten/, `migration rewrote files:\n${mig.slice(-300)}`);
  const build = execFileSync('node', ['scripts/build-business-directories.cjs'],
    { cwd: ROOT, encoding: 'utf8' });
  assert.match(build, /0 written, 0 pruned/, `build wrote or pruned pages:\n${build.slice(-300)}`);
});

test('no rendered page mentions the new action while no record uses it', () => {
  // A label map entry must not leak into output on its own.
  const dir = path.join(ROOT, 'research', 'business-directories');
  let hits = 0;
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === 'index.html' && fs.readFileSync(p, 'utf8').includes('Apply for inclusion')) hits += 1;
    }
  }(dir));
  assert.strictEqual(hits, 0, `${hits} generated pages already render "Apply for inclusion"`);
});

// ── 15 + 16. the standing invariants ────────────────────────────────────────
test('the schema change invents no measurement and added no dependency', () => {
  // POLICY REVERSAL (2026-08-19). Domain Rating collection is no longer frozen:
  // the freeze was written against Ahrefs' plan-gated Site Explorer endpoint,
  // and /v3/public/domain-rating-free needs only a free key, so every record has
  // now been read from it. The pinned totals here (64 measured domains, 67 rated
  // records) described the frozen snapshot and are false. They are replaced by
  // the invariant they were protecting — that a schema change cannot introduce a
  // rating nobody measured — checked per record rather than as a total.
  for (const r of ALL) {
    assert.deepStrictEqual(S.domainRatingProblems(r), [],
      `${r.id} carries a Domain Rating that is not fully evidenced`);
    const p = r.metricsProvenance && r.metricsProvenance.domainRating;
    if (p) {
      assert.strictEqual(p.measuredDomain, S.normaliseDomain(r.website),
        `${r.id} reports a rating measured on a domain that is not its own`);
    }
  }
  // One measured domain has one dated reading; records sharing a domain repeat
  // it verbatim rather than each carrying a figure of its own.
  assert.deepStrictEqual(S.sharedDomainSnapshotProblems(ALL), [],
    'records sharing a measured domain disagree about its reading');

  const NETWORK = new RegExp([
    'require\\((?:.)(?:node:)?(?:https?|net|dgram|dns|tls)',
    String.raw`\bfetch\s*\(`, 'XMLHttpRequest', 'axios', 'node-fetch',
  ].join('|'));
  for (const f of ['scripts/lib/bd-schema.cjs', 'scripts/lib/bd-components.cjs',
    'scripts/validate-business-directories.cjs']) {
    assert.ok(!NETWORK.test(fs.readFileSync(path.join(ROOT, f), 'utf8')),
      `${f} introduces a network dependency`);
  }
  for (const f of ['package.json', 'package-lock.json', 'node_modules']) {
    assert.ok(!fs.existsSync(path.join(ROOT, f)), `${f} appeared; the build is dependency-free`);
  }
});

// ── 7 + 8 + 9. apply never substitutes for the public-discovery proof ───────
test('the Region A candidates that motivated apply remain unpublished', () => {
  // The enum is architectural preparation. Every one of these still needs a
  // verified public discovery surface before it may be authored, and a future
  // wave that publishes one of them without that proof should fail here first.
  const HOSTS = [
    'omwbe.wa.gov',                  // certification confirmed free; directory is 403
    'thesupplierclearinghouse.com',  // operator not established
    'caleprocure.ca.gov',            // public search is a JS shell
    'visitcalifornia.com',           // business directory is a JS app
    'comptroller.texas.gov',         // VetHUB: public directory unresolved
    'mycpa.cpa.state.tx.us',         // CMBL: procurement registration, excluded
    'txbiz.org', 'awb.org', 'calchamber.com', 'choosewashingtonstate.com',
    'azcommerce.com', 'visitarizona.com', 'colorado.com', 'coloradochamber.org',
    'roadmap4innovation.com', 'cmtc.com',
  ];
  const host = (u) => new URL(u).hostname.replace(/^www\./, '');
  for (const h of HOSTS) {
    assert.ok(!ALL.find((r) => host(r.website) === h),
      `${h} was published; its public discovery surface has not been verified`);
  }
});

test('the national state-view duplicates stay excluded', () => {
  // Established in Part 3 and re-proved here so a state wave cannot reverse it.
  const host = (u) => new URL(u).hostname.replace(/^www\./, '');
  for (const h of ['chamberofcommerce.com']) {
    assert.ok(!ALL.find((r) => host(r.website) === h), `${h} was published`);
  }
  // MerchantCircle and Alignable exist as ONE national record each, never per state.
  for (const h of ['merchantcircle.com', 'alignable.com']) {
    const recs = ALL.filter((r) => host(r.website) === h);
    assert.strictEqual(recs.length, 1, `${h} has ${recs.length} records; its city views are one system`);
    assert.strictEqual(recs[0].scope, 'national', `${h} is not recorded as a single national system`);
  }
});

// ── Region A closeout: the manifest and the backlog must agree with reality ──
test('the Region A coverage manifest is derived, not asserted', () => {
  const m = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'data', 'business-directories', 'us-region-a-coverage.json'), 'utf8'));
  assert.strictEqual(m.states.length, 5, 'Region A has five states');
  const sum = (k) => m.states.reduce((a, s) => a + (s[k] || 0), 0);
  // Every total must reproduce from the per-state rows. A hardcoded summary is
  // exactly how a coverage claim drifts away from the research behind it.
  assert.strictEqual(m.totals.stateCandidates, sum('candidates'), 'state candidate total drifted');
  assert.strictEqual(m.totals.candidates, sum('candidates') + m.totals.nationalDuplicates,
    'the candidate total does not reconcile with the national duplicates');
  assert.strictEqual(m.totals.approved, sum('approved'), 'approved total drifted');
  assert.strictEqual(m.totals.pendingBrowser, sum('pendingBrowser'), 'pending total drifted');
  assert.strictEqual(m.totals.targetedIncomplete, sum('targetedIncomplete'), 'incomplete total drifted');
  assert.strictEqual(m.totals.rejected, sum('rejected'), 'rejected total drifted');
  assert.strictEqual(m.nationalDuplicates.length, m.totals.nationalDuplicates,
    'the national duplicate list and its total disagree');

  // approvedCount must equal what the registry actually holds for these states.
  const usCommercial = ALL.filter((r) => r.country === 'united-states' && !S.isGovernmentPillar(r));
  const REGION_A_HOSTS = /omwbe|clearinghouse|caleprocure|visitcalifornia|comptroller\.texas|cpa\.state\.tx|txbiz|awb\.org|calchamber|choosewashington|azcommerce|visitarizona|colorado\.com|coloradochamber|roadmap4innovation/;
  const published = usCommercial.filter((r) => REGION_A_HOSTS.test(r.website));
  assert.strictEqual(published.length, m.totals.approved,
    'the manifest claims a different number of approved Region A records than the registry holds');
  assert.strictEqual(m.totals.approved, 0,
    'a Region A record was authored; public discovery was never verified for any candidate');

  // A state may legitimately have zero records, but it may not be called complete.
  for (const s of m.states) {
    assert.ok(['coverage-complete-with-browser-pending', 'no-qualifying-independent-platform-found',
      'research-in-progress', 'not-researched'].includes(s.researchStatus),
      `${s.state} carries status "${s.researchStatus}"`);
    assert.notStrictEqual(s.researchStatus, 'coverage-complete',
      `${s.state} is called complete while candidates remain browser-pending`);
    assert.ok(s.nextAction && s.nextAction.length > 20, `${s.state} has no actionable next step`);
  }
});

test('no generated page claims Region A coverage', () => {
  // Nothing is published, so no public page may imply state coverage exists.
  const body = fs.readFileSync(
    path.join(ROOT, 'research', 'business-directories', 'united-states', 'index.html'), 'utf8')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const CLAIMS = /\bexhaustive\b|\b(?:complete|comprehensive) (?:list|coverage)\b|\bevery (?:US|U\.S\.) state\b/i;
  assert.ok(!CLAIMS.test(body), 'the US page claims coverage this wave did not establish');
  assert.ok(CLAIMS.test('complete coverage'), 'the guard cannot fire');
});

test('the backlog records the schema decision and the browser queue', () => {
  const doc = fs.readFileSync(
    path.join(ROOT, 'docs', 'business-directories-verification-backlog.md'), 'utf8');
  const section = doc.slice(doc.indexOf('## Wave 1C.1A'));
  assert.ok(section.length > 2000, 'the wave is not documented');
  const flat = section.replace(/\s+/g, ' ');
  assert.match(flat, /Apply for inclusion/, 'the approved label is not recorded');
  assert.match(flat, /does not make a candidate publishable/i,
    'the backlog does not state that the enum is not publication approval');
  // The findings that must survive into later waves.
  assert.match(flat, /VetHUB/, 'the Texas rename is not recorded');
  assert.match(flat, /mailing list for vendors to receive bids/,
    'the CMBL procurement exclusion lost its evidence');
  assert.match(flat, /Roadmap 4 Innovation/, 'the CMTC successor finding is not recorded');
  assert.match(flat, /blocked, not absent/i, 'the blocked-is-not-absent rule is not stated');
  assert.match(flat, /Global commercial records require a separate remediation wave/,
    'the global remediation dependency is not recorded');
  // Every browser-queue entry must name a blocker.
  for (const b of ['403', 'JS app', 'No response']) {
    assert.ok(section.includes(b), `the queue never records the blocker "${b}"`);
  }
});
