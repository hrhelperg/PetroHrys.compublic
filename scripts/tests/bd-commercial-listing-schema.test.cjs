'use strict';
// Commercial listing schema — four fields that carry the axes submissionModel
// (a COST enum) cannot express: what a business may DO, how it is verified,
// whether it may answer reviews, and where it claims a profile.
//
// The load-bearing property is that adding them rewrote NOTHING. Every record
// normalises in memory and projects back out to its pillar default, so all 272
// JSON files stayed byte-identical. Half these guards exist to keep that true.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const S = require('../lib/bd-schema.cjs');
const C = require('../lib/bd-components.cjs');
const { migrateRecord, serialisableRecord } = require('../lib/bd-migrate.cjs');
const { loadRegistry } = require('../lib/bd-registry.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const ALL = loadRegistry().directories;
const GOV = ALL.filter((r) => S.isGovernmentPillar(r));
const COMMERCIAL = ALL.filter((r) => !S.isGovernmentPillar(r));

const mk = (o = {}) => migrateRecord({ id: 'x', category: 'local-business', accepts: {}, verification: {}, ...o });
const mkGov = (o = {}) => migrateRecord({ id: 'g', category: 'government', accepts: {}, verification: {}, ...o });
const keys = (r) => Object.keys(serialisableRecord(r));

// ── enum shape ──────────────────────────────────────────────────────────────
test('the listing action enum is exactly the approved closed set', () => {
  assert.deepStrictEqual(S.LISTING_ACTIONS,
    ['create', 'claim', 'create-and-claim', 'invite-only', 'not-applicable', 'unknown']);
  // The rejected spelling must not creep back in.
  assert.ok(!S.LISTING_ACTIONS.includes('create-or-claim'),
    '"create-or-claim" was explicitly rejected in favour of "create-and-claim"');
});

test('the verification method enum is exactly the approved set', () => {
  assert.deepStrictEqual(S.VERIFICATION_METHODS,
    ['email', 'phone', 'sms', 'postcard', 'video', 'documents', 'domain',
      'identity', 'business-registration', 'other']);
});

test('supportedCountries is absent from the active schema', () => {
  // Deferred deliberately: absence would conflate unsupported with unverified.
  assert.ok(!S.KNOWN_RECORD_KEYS.includes('supportedCountries'),
    'supportedCountries was deferred and must not be present');
  assert.ok(!('supportedCountries' in mk()), 'migrateRecord produces supportedCountries');
  for (const r of ALL) {
    assert.ok(!('supportedCountries' in r), `${r.id} carries a deferred field`);
  }
});

test('submissionModel keeps its cost semantics unchanged', () => {
  assert.deepStrictEqual(S.SUBMISSION_MODELS,
    ['free', 'paid', 'freemium', 'notApplicable', 'unknown']);
  // Every government record still reads notApplicable; the new action axis did
  // not reinterpret the cost axis.
  for (const r of GOV) {
    assert.strictEqual(r.submissionModel, 'notApplicable',
      `${r.id} submissionModel changed meaning`);
  }
});

// ── pillar normalisation ────────────────────────────────────────────────────
test('every government record normalises to not-applicable', () => {
  assert.ok(GOV.length >= 218, `government pillar shrank to ${GOV.length}`);
  for (const r of GOV) {
    assert.strictEqual(r.listingAction, 'not-applicable',
      `${r.id} is a government record but its listingAction is "${r.listingAction}"`);
  }
});

test('no government record carries a commercial listing value', () => {
  for (const r of GOV) {
    assert.strictEqual(r.claimUrl, null, `${r.id} carries a claimUrl`);
    assert.strictEqual(r.verificationMethods, null, `${r.id} carries verificationMethods`);
    assert.strictEqual(r.ownerResponseSupport, null, `${r.id} carries ownerResponseSupport`);
  }
});

test('a commercial record defaults to unknown, not to not-applicable', () => {
  for (const r of COMMERCIAL) {
    assert.notStrictEqual(r.listingAction, 'not-applicable',
      `${r.id} is commercial but claims the government default`);
  }
  assert.strictEqual(mk().listingAction, 'unknown');
  assert.strictEqual(mkGov().listingAction, 'not-applicable');
});

// ── no default stamping: the point of the whole design ──────────────────────
test('migration stamps no defaults onto disk', () => {
  // A record holding its pillar default serialises WITHOUT the key.
  assert.ok(!keys(mkGov()).includes('listingAction'), 'a government default was stamped');
  assert.ok(!keys(mk()).includes('listingAction'), 'a commercial default was stamped');
  for (const k of ['verificationMethods', 'ownerResponseSupport', 'claimUrl']) {
    assert.ok(!keys(mk()).includes(k), `${k} was stamped at its default`);
  }
  // A record holding a real value serialises WITH the key.
  const set = mk({ listingAction: 'claim', claimUrl: 'https://x.example/claim' });
  assert.ok(keys(set).includes('listingAction'), 'an established action was dropped');
  assert.ok(keys(set).includes('claimUrl'), 'an established claim URL was dropped');
});

test('no record on disk carries a stamped commercial default', () => {
  const dir = path.join(ROOT, 'data', 'business-directories', 'directories');
  let stamped = 0;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    for (const raw of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))) {
      if (raw.listingAction === 'not-applicable' || raw.listingAction === 'unknown') stamped++;
      if (raw.verificationMethods === null || raw.ownerResponseSupport === null || raw.claimUrl === null) stamped++;
    }
  }
  assert.strictEqual(stamped, 0,
    'a default value was written to disk; the projection is not doing its job');
});

test('the serialisation projection round-trips', () => {
  for (const rec of [mkGov(), mk(), mk({ listingAction: 'create' }),
    mk({ listingAction: 'claim', claimUrl: 'https://x.example/c' }),
    mk({ verificationMethods: [] , verificationRequired: false })]) {
    const again = migrateRecord(serialisableRecord(rec));
    for (const k of ['listingAction', 'verificationMethods', 'ownerResponseSupport', 'claimUrl']) {
      assert.deepStrictEqual(again[k], rec[k], `${k} did not survive a round trip`);
    }
  }
});

// ── null vs [] ──────────────────────────────────────────────────────────────
test('null and empty array are different states and both survive', () => {
  assert.strictEqual(mk().verificationMethods, null, 'absent should normalise to null');
  assert.deepStrictEqual(mk({ verificationMethods: [] }).verificationMethods, [],
    'an empty array must not be collapsed to null');
  // And they serialise differently.
  assert.ok(!keys(mk()).includes('verificationMethods'));
  assert.ok(keys(mk({ verificationMethods: [] })).includes('verificationMethods'));
});

test('verificationRequired true never invents a method', () => {
  const r = mk({ verificationRequired: true });
  assert.strictEqual(r.verificationMethods, null,
    'knowing that a platform verifies must not manufacture how');
});

test('an invalid method reaches the validator instead of being repaired', () => {
  // The migration passes arrays through verbatim so the validator can reject.
  assert.deepStrictEqual(mk({ verificationMethods: ['carrier-pigeon'] }).verificationMethods,
    ['carrier-pigeon'], 'an invalid value was silently stripped before validation');
});

// ── reviews vs owner response ───────────────────────────────────────────────
test('reviews existing never implies owner response', () => {
  const r = mk({ reviewSystem: true });
  assert.strictEqual(r.ownerResponseSupport, null,
    'a review system must not imply that owners may reply');
});

// ── rendering ───────────────────────────────────────────────────────────────
test('government records render no commercial listing UI', () => {
  for (const r of GOV) {
    assert.strictEqual(C.listingInformation(r), '',
      `${r.id} rendered a listing block on a statutory register`);
  }
  // And no built page carries the labels.
  const walk = (d, a = []) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, a); else if (e.name === 'index.html') a.push(p);
    }
    return a;
  };
  const govSlugs = new Set(GOV.map((r) => `/${r.country}/${r.slug}/`));
  for (const p of walk(path.join(ROOT, 'research', 'business-directories'))) {
    const rel = p.replace(path.join(ROOT, 'research', 'business-directories'), '').replace(/index\.html$/, '');
    if (!govSlugs.has(rel)) continue;
    const html = fs.readFileSync(p, 'utf8');
    for (const label of ['Listing action', 'Official claim page', 'Owner responses']) {
      assert.ok(!html.includes(label), `${rel} renders "${label}" on a government record`);
    }
  }
});

test('an unestablished listing renders nothing, and null never renders as No', () => {
  assert.strictEqual(C.listingInformation(mk()), '',
    'an unknown action rendered a row saying nothing useful');
  const r = mk({ listingAction: 'create' });
  const html = C.listingInformation(r);
  assert.ok(html.includes('Create a listing'));
  assert.ok(!html.includes('Owner responses'),
    'ownerResponseSupport null rendered as a row');
  assert.ok(!html.includes('Verification'),
    'verificationMethods null rendered as a row');
});

test('create and claim render distinctly, and create-and-claim covers both', () => {
  assert.match(C.listingInformation(mk({ listingAction: 'create' })), /Create a listing/);
  assert.match(C.listingInformation(mk({ listingAction: 'claim' })), /Claim an existing profile/);
  assert.match(C.listingInformation(mk({ listingAction: 'create-and-claim' })), /Create or claim a profile/);
  assert.match(C.listingInformation(mk({ listingAction: 'invite-only' })), /Invite only/);
  // A claim-only record must never read as create.
  assert.ok(!/Create a listing/.test(C.listingInformation(mk({ listingAction: 'claim' }))));
});

test('an empty method array renders as evidence, not as silence', () => {
  const html = C.listingInformation(mk({ listingAction: 'create', verificationMethods: [], verificationRequired: false }));
  assert.match(html, /No verification required/);
});

// ── metrics and dependencies unchanged ──────────────────────────────────────
// A definite listingAction is a factual claim about what a business may do. It
// must be supported by prose the reader can see — the schema cannot know whether
// a platform really offers both flows, so the content has to carry it. This is
// the same rule as "critical caveats must render", applied to listing facts.
const ACTION_EVIDENCE = {
  // Allow a qualifier between the article and the noun ("create a company
  // profile", "creating an entry"), and accept "entry" — the standard word in
  // German directories. An earlier version required the noun to follow the
  // article directly and rejected prose that plainly stated the create flow.
  create: /creat\w+ (a |an )?(new )?(\w+ )?(profile|listing|account|page|entry|company)|add(ing)? (your|a|an) (business|listing|profile|entry|company)|submit/i,
  claim: /claim/i,
  'create-and-claim': /claim/i,
  'invite-only': /invit/i,
};

test('a definite listing action is supported by visible prose', () => {
  const visible = (r) => [r.description, ...r.pros, ...r.cons, ...r.bestFor, ...r.notRecommendedFor].join(' \n ');
  for (const r of ALL) {
    const re = ACTION_EVIDENCE[r.listingAction];
    if (!re) continue; // unknown and not-applicable assert nothing
    assert.ok(re.test(visible(r)),
      `${r.id} asserts listingAction "${r.listingAction}" but no rendered prose supports it — a listing claim may not live only in the data`);
  }
});

test('the schema change took no new measurement and added no dependency', () => {
  const domains = new Set();
  for (const r of ALL) {
    const p = r.metricsProvenance && r.metricsProvenance.domainRating;
    if (p && p.measuredDomain) domains.add(p.measuredDomain);
  }
  assert.strictEqual(domains.size, 64, 'the frozen measurement set changed size');
  assert.ok(!fs.existsSync(path.join(ROOT, 'package.json')), 'a package.json appeared');
  assert.ok(!fs.existsSync(path.join(ROOT, 'node_modules')), 'node_modules appeared');
});
