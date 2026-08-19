'use strict';
// Wave 1C — United States, Layer A (national commercial directories).
//
// Two records from twenty-five candidates, and the low number is the finding.
// What this file mainly defends is the reasoning that kept the other
// twenty-three out, because most of them are famous enough that a later wave
// would re-add them from reputation:
//
//   ALREADY GLOBAL — Yelp, Google Business Profile, Trustpilot, Foursquare,
//     Clutch, G2, Capterra, Software Advice. Publishing US copies would be a
//     duplicate by every test in the duplicate rules. They stay single records.
//   BLOCKED, NOT ABSENT — Yellow Pages US, Manta, Hotfrog US, Cylex US,
//     EZlocal, Angi, BBB, Thumbtack. A 403 or a bot challenge is a bot filter.
//   PORCH — the /pros directory pages still render, but the page's own title is
//     "Porch | A new kind of home insurance", the only signup route on it is for
//     insurance agents, and every "claim" link is an insurance or warranty
//     claim. A directory a business cannot join is not a listing opportunity.
//   CHAMBER OF COMMERCE — names no legal entity anywhere.
//   DUN & BRADSTREET — wrong pillar; a credit and company-data product.
//
// MerchantCircle is the dataset's FIRST claim-only record. That precision is
// the point: no creation route is documented, and an account system is not one.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const S = require('../lib/bd-schema.cjs');
const { loadRegistry } = require('../lib/bd-registry.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const ALL = loadRegistry().directories;
const byId = new Map(ALL.map((r) => [r.id, r]));

const WAVE = ['us-merchantcircle', 'us-alignable'];
const NEW = WAVE.map((id) => byId.get(id));

const visible = (r) => [r.description, ...r.pros, ...r.cons, ...r.bestFor, ...r.notRecommendedFor].join(' \n ');
const limitsOf = (r) => [...r.cons, ...r.notRecommendedFor].join(' ');
const hostOf = (u) => new URL(u).hostname.replace(/^www\./, '');
const commercialIn = (c) => ALL.filter((r) => r.country === c && !S.isGovernmentPillar(r));
const bodyText = (html) => html.replace(/<[^>]+>/g, ' ')
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&')
  .replace(/&#8217;/g, '’').replace(/\s+/g, ' ');

test('every record this wave claims to have published exists', () => {
  assert.strictEqual(WAVE.length, 2, 'the wave manifest changed size without this test changing');
  for (const id of WAVE) assert.ok(byId.get(id), `missing record ${id}`);
  // BRITTLE MIRROR, REMOVED: `commercialIn('united-states').length === 3`, a
  // per-country pillar total. us-bbb predates the publication contract and the
  // two new ones join it — which is what is asserted now, from the wave
  // manifest, so a fourth verified US commercial directory is research rather
  // than a failure of this wave's test.
  const commercial = commercialIn('united-states');
  assert.ok(commercial.length >= 3, `the US commercial pillar shrank to ${commercial.length}`);
  const commercialIds = new Set(commercial.map((r) => r.id));
  assert.ok(commercialIds.has('us-bbb'), 'us-bbb left the US commercial pillar');
  for (const id of WAVE) {
    assert.ok(commercialIds.has(id), `${id} is not in the US commercial pillar`);
  }
});

// ── the structural finding: no US copy of a global platform ─────────────────
test('no national platform is republished as a US record', () => {
  // This is the whole reason the wave is small. Each of these is already a
  // single `global` record; a US twin would be the same dashboard, the same
  // listing and the same profile under two ids.
  const GLOBAL_HOSTS = [
    'yelp.com', 'business.yelp.com', 'google.com', 'business.google.com',
    'trustpilot.com', 'business.trustpilot.com', 'foursquare.com',
    'clutch.co', 'g2.com', 'capterra.com', 'softwareadvice.com',
  ];
  for (const host of GLOBAL_HOSTS) {
    const us = ALL.filter((r) => r.country === 'united-states' && hostOf(r.website) === host);
    assert.deepStrictEqual(us.map((r) => r.id), [],
      `${host} was republished as a US record; it already exists as a global record`);
  }
  // And the global originals must still be exactly one record each.
  for (const id of ['global-yelp', 'global-trustpilot', 'global-google-business-profile',
    'global-foursquare-places', 'global-clutch', 'global-g2', 'global-capterra',
    'global-software-advice']) {
    assert.ok(byId.get(id), `${id} disappeared; the wave was supposed to leave it alone`);
  }
});

test('the pre-contract global records were not silently half-remediated', () => {
  // 53 global records predate the publication contract. Remediating a handful
  // would leave the layer inconsistent and make "unknown" ambiguous: is it
  // researched-and-unknown, or never-researched? This wave deliberately touched
  // none of them, and that decision is recorded rather than assumed.
  // The 53 PRE-CONTRACT global records must stay unremediated. The high-authority
  // expansion later ADDED global-provenexpert, which was authored to contract
  // standard from the start — so the invariant is about the legacy set, not the
  // total. Counting the total would have made a legitimate addition look like a
  // remediation.
  const global = ALL.filter((r) => r.country === 'global');
  const unremediated = global.filter((r) => !r.operator || !r.operator.name);
  assert.strictEqual(unremediated.length, 53,
    'the pre-contract global set changed size; remediation must be a whole wave, not a sample');
  for (const r of global.filter((x) => x.operator && x.operator.name)) {
    assert.ok(r.lastVerified >= '2026-08-06',
      `${r.id} carries an operator but was not authored to contract standard`);
  }
});

// ── operator gate ───────────────────────────────────────────────────────────
test('every published record names a legal operator with an official URL', () => {
  for (const r of NEW) {
    assert.ok(r.operator && r.operator.name.trim().length > 2, `${r.id} has no operator name`);
    assert.ok(r.operator.officialUrl && r.operator.officialUrl.startsWith('https://'),
      `${r.id} has no official URL for its operator`);
    assert.match(r.operator.name, /\b(Inc\.?|Corporation|Corp\.?|LLC|Ltd|Limited|Company)\b/,
      `${r.id} operator "${r.operator.name}" does not read as a legal entity`);
    // Neither operator is named on the front page, so neither may cite one.
    const u = new URL(r.operator.officialUrl);
    assert.notStrictEqual(u.pathname, '/', `${r.id} cites a bare homepage as operator evidence`);
  }
});

test('a candidate that names no legal entity stays unpublished', () => {
  // chamberofcommerce.com's entire footer is "© 2026 - CHAMBEROFCOMMERCE.COM".
  // A domain is not a company.
  assert.ok(!ALL.find((r) => hostOf(r.website) === 'chamberofcommerce.com'),
    'Chamber of Commerce was published without an established operator');
});

// ── current status: the Porch finding ───────────────────────────────────────
test('Porch stays unpublished because a business can no longer join it', () => {
  assert.ok(!ALL.find((r) => hostOf(r.website) === 'porch.com'), 'Porch was published');
  assert.ok(!byId.get('us-porch'), 'us-porch was published');
});

test('wrong-pillar and blocked candidates stay unpublished', () => {
  const FORBIDDEN = [
    'dnb.com',            // credit and company-data product, not a listing platform
    'yellowpages.com', 'manta.com', 'hotfrog.com', 'cylex.us.com',
    'ezlocal.com', 'angi.com', 'thumbtack.com', 'local.com',
    'nextdoor.com', 'business.nextdoor.com', 'houzz.com',
    'brownbook.net',
  ];
  for (const host of FORBIDDEN) {
    assert.ok(!ALL.find((r) => hostOf(r.website) === host),
      `${host} was published without clearing its blocker`);
  }
});

// ── the claim-only precedent ────────────────────────────────────────────────
test('MerchantCircle is claim-only, and says so to a reader', () => {
  const r = byId.get('us-merchantcircle');
  assert.strictEqual(r.listingAction, 'claim',
    'MerchantCircle gained a create action; no creation route is documented');
  assert.ok(r.claimUrl && r.claimUrl.startsWith('https://'), 'a claim action with no claim URL');
  assert.match(visible(r), /Claim my business/, 'readers are not shown the claim control');
  assert.match(limitsOf(r), /claiming an existing page, not creating one/i,
    'the record does not tell a reader it cannot create a new listing');
  assert.match(r.editorNotes, /LISTING ACTION DECISION — claim, not create-and-claim/,
    'the claim-only decision is no longer recorded');
});

test('an account system is never read as a creation route', () => {
  // MerchantCircle has logins, dashboards and paid tiers. None of that is a
  // documented way to register a business that is not already in the database.
  const r = byId.get('us-merchantcircle');
  assert.strictEqual(r.registrationRequired, true);
  assert.notStrictEqual(r.listingAction, 'create-and-claim');
  assert.notStrictEqual(r.listingAction, 'create');
});

// ── cost gate: free account and free trial are both non-evidence ────────────
test('Alignable cost stays unknown despite a free join and a free trial', () => {
  const r = byId.get('us-alignable');
  assert.strictEqual(r.submissionModel, 'unknown',
    'Alignable cost was resolved; a free account and a free trial are not evidence of a free listing');
  assert.strictEqual(r.registrationRequired, true);
  assert.match(limitsOf(r), /cost is NOT established and is recorded as unknown/i,
    'the record does not tell a reader its cost is unestablished');
  assert.match(limitsOf(r), /a trial, which is not evidence that anything is free thereafter/i,
    'the record no longer distinguishes a free trial from a free listing');
  assert.match(r.editorNotes, /COST DECISION — unknown, deliberately/,
    'the cost decision is no longer recorded');
});

test('MerchantCircle cost is freemium on tier evidence, not on a free account', () => {
  const r = byId.get('us-merchantcircle');
  assert.strictEqual(r.submissionModel, 'freemium');
  assert.match(visible(r), /Basic Listing/, 'the free tier evidence is not shown');
  assert.match(visible(r), /\$30 per month/, 'the paid tier price is not shown');
});

// ── reviews never imply owner responses ─────────────────────────────────────
test('owner responses are asserted only where the operator states them', () => {
  const mc = byId.get('us-merchantcircle');
  assert.strictEqual(mc.reviewSystem, true);
  assert.strictEqual(mc.ownerResponseSupport, true,
    'the free-tier "Monitor and respond to reviews" evidence was dropped');
  assert.match(visible(mc), /Monitor and respond to reviews/,
    'the owner-response evidence is not shown to a reader');
  // Alignable documents neither, and must claim neither.
  const al = byId.get('us-alignable');
  assert.strictEqual(al.reviewSystem, null, 'Alignable asserts reviews without evidence');
  assert.strictEqual(al.ownerResponseSupport, null, 'Alignable asserts owner responses without evidence');
  assert.match(limitsOf(al), /No review or rating system is documented/i,
    'the record does not tell a reader reviews are unrecorded');
});

test('a paid badge is never recorded as verification', () => {
  // "Receive a verified Badge" sits in MerchantCircle's PAID tier. Buying a
  // badge establishes nothing about whether the operator checked anything.
  const r = byId.get('us-merchantcircle');
  assert.strictEqual(r.verificationMethods, null, 'a purchased badge became a verification method');
  assert.strictEqual(r.verificationRequired, null, 'a purchased badge became a verification requirement');
  assert.match(limitsOf(r), /purchased badge is not evidence that the operator verified anything/i,
    'the record does not explain why the badge was not treated as verification');
});

// ── blocked is not absent ───────────────────────────────────────────────────
test('no blocked US platform is described as dead, gone or absent', () => {
  const BLOCKED = ['Yell', 'Yellow Pages', 'Manta', 'Hotfrog', 'Cylex', 'Angi',
    'Thumbtack', 'Better Business Bureau', 'Houzz', 'Nextdoor'];
  const DEAD = /\b(?:is dead|no longer exists|has shut down|is defunct|has closed|is gone|does not exist|no longer operates)\b/i;
  const prose = ALL.map((r) => `${visible(r)} ${r.editorNotes}`).join(' \n ');
  for (const name of BLOCKED) {
    const re = new RegExp(`[^.!?]*\\b${name}\\b[^.!?]*[.!?]`, 'gi');
    for (const sentence of prose.match(re) || []) {
      assert.ok(!DEAD.test(sentence), `${name} is described as absent or dead: ${sentence.trim()}`);
    }
  }
});

// ── coverage language ───────────────────────────────────────────────────────
test('the US country page claims no exhaustive coverage', () => {
  const CLAIMS = /\bexhaustive\b|\b(?:complete|comprehensive|definitive) list\b|\b(?:every|all) (?:US|U\.S\.|American) (?:business )?director(?:y|ies)\b/i;
  const body = bodyText(fs.readFileSync(
    path.join(ROOT, 'research', 'business-directories', 'united-states', 'index.html'), 'utf8'));
  assert.ok(!CLAIMS.test(body), 'the US page claims exhaustive coverage');
  assert.ok(CLAIMS.test('every US business directory'), 'the guard cannot fire');
});

// ── pillar boundary ─────────────────────────────────────────────────────────
test('no record is a government record or claims to be a registry', () => {
  for (const r of NEW) {
    assert.ok(!S.isGovernmentPillar(r), `${r.id} landed in the Government Registry pillar`);
    assert.deepStrictEqual(r.registryTypes, [], `${r.id} claims a registry type`);
    assert.strictEqual(r.publicAccess, null, `${r.id} carries a statutory access block`);
    assert.ok(!/\bstatutory\b|official register|source of record/i.test(visible(r)),
      `${r.id} describes a commercial directory in statutory language`);
  }
  // And the US statutory registers were not disturbed.
  //
  // BRITTLE MIRROR, REMOVED: `gov.length === 75`. This file already argues the
  // case against itself, forty lines up: "Counting the total would have made a
  // legitimate addition look like a remediation." The same is true here — a new
  // verified US statutory register is research, not a wave violation, and the
  // literal turned it into one.
  //
  // The property is that THIS WAVE put nothing in the pillar and changed
  // nothing already in it. Stated against the wave manifest, which is what the
  // test is about, plus a floor that still catches deletion.
  const gov = ALL.filter((r) => r.country === 'united-states' && S.isGovernmentPillar(r));
  assert.ok(gov.length >= 75, `the US government-registry set shrank to ${gov.length}`);
  const waveIds = new Set(WAVE);
  for (const r of gov) {
    assert.ok(!waveIds.has(r.id), `${r.id} is a commercial record of this wave inside the pillar`);
  }
  for (const r of gov) {
    assert.strictEqual(r.listingAction, 'not-applicable', `${r.id} gained a listing action`);
    assert.strictEqual(r.submissionModel, 'notApplicable', `${r.id} gained a submission model`);
  }
});

// ── no promised outcome ─────────────────────────────────────────────────────
test('no record promises a backlink, ranking, indexing, traffic or lead outcome', () => {
  const FORBIDDEN = /\b(?:dofollow|nofollow)\b|guaranteed (?:backlink|traffic|ranking|indexing|leads?)|will (?:rank|improve your ranking)|boost your seo|drives traffic/i;
  for (const r of NEW) {
    for (const field of [r.description, ...r.pros, ...r.bestFor]) {
      assert.ok(!FORBIDDEN.test(field), `${r.id} makes an unestablished SEO claim: ${field}`);
    }
    assert.strictEqual(r.backlinkType, null, `${r.id} asserts a link attribute`);
    assert.strictEqual(r.indexed, null, `${r.id} asserts indexing`);
    assert.match(limitsOf(r), /No ranking, indexing, traffic or lead outcome is asserted/,
      `${r.id} does not disown outcome claims`);
  }
  // MerchantCircle's syndication add-on markets "local search rankings". That is
  // the operator's copy and must not become this record's claim.
  assert.ok(!/local search rankings/i.test(visible(byId.get('us-merchantcircle'))),
    'the operator’s ranking claim was repeated as fact');
});

// ── metrics ─────────────────────────────────────────────────────────────────
//
// CHANGED: this test used to assert that no record in the wave carried a metric
// and that the frozen snapshot held 64 measured domains across 67 records. The
// repository owner reversed the Domain Rating freeze: the frozen policy was
// written against Ahrefs' plan-gated Site Explorer endpoint, while
// /v3/public/domain-rating-free costs nothing and needs only a free key, so the
// whole corpus has been read from it. Both a "no metric" assertion and a pinned
// snapshot count are now false, and a pinned count would fail on every refresh.
//
// What replaces them is what they were protecting: a rating is never invented,
// it describes the record's OWN domain, and one measured domain yields exactly
// one reading no matter how many records report it.
test('every published Domain Rating is an attributable reading of its own domain', () => {
  for (const r of NEW) {
    // Replaces `domainRating === null` and `metricsProvenance === {}`: the
    // shape check is what actually keeps an invented number out, since it
    // demands the 0-100 scale plus provider, date and measured domain.
    assert.deepStrictEqual(S.domainRatingProblems(r), [],
      `${r.id} publishes a Domain Rating that is not a properly attributed measurement`);
    // No metric OTHER than Domain Rating has a free source, so none is published.
    for (const k of ['authorityScore', 'estimatedTraffic', 'referringDomains']) {
      assert.strictEqual(r[k], null, `${r.id} carries ${k}`);
    }
    assert.deepStrictEqual(Object.keys(r.metricsProvenance).sort(),
      r.domainRating === null || r.domainRating === undefined ? [] : ['domainRating'],
      `${r.id} carries provenance for a metric it does not publish`);
    if (r.domainRating === null || r.domainRating === undefined) {
      // Missing is not zero.
      assert.notStrictEqual(r.domainRating, 0, `${r.id} substitutes 0 for an absent rating`);
      // Replaces `metricStatus === 'unknown'` for the measured case only: with
      // no metric there is still no status to claim.
      assert.strictEqual(r.metricStatus, 'unknown', `${r.id} claims a metric status with no metric behind it`);
      continue;
    }
    assert.strictEqual(r.metricsProvenance.domainRating.measuredDomain, S.normaliseDomain(r.website),
      `${r.id} displays a rating measured on a domain that is not its own`);
    assert.ok(S.METRIC_STATUSES.includes(r.metricStatus),
      `${r.id} claims an unrecognised metric status "${r.metricStatus}"`);
  }
  // "Missing is not zero" needs an unmeasured example and the corpus no longer
  // has one — every domain has now been read — so the null branch above cannot
  // run on real data. A fixture keeps the rule live rather than letting it lapse.
  const UNMEASURED = {
    id: 'fixture-unmeasured', website: 'https://never-measured.example.com/',
    domainRating: null, metricStatus: 'unknown', metricsProvenance: {},
  };
  assert.deepStrictEqual(S.domainRatingProblems(UNMEASURED), [],
    'a genuinely unmeasured record must remain publishable as null');
  assert.notDeepStrictEqual(S.domainRatingProblems({ ...UNMEASURED, domainRating: 0 }), [],
    'a bare 0 was accepted, so an absent rating would be indistinguishable from a domain measured at zero');

  // Replaces the two pinned totals. The dataset may hold any number of
  // readings; what it may not hold is two different readings for one domain, or
  // fewer records than domains, which would mean a domain nothing reports.
  const domains = new Set();
  let measured = 0;
  const rows = new Set();
  for (const r of ALL) {
    const p = r.metricsProvenance && r.metricsProvenance.domainRating;
    if (p && p.measuredDomain) domains.add(p.measuredDomain);
    if (r.domainRating !== null && r.domainRating !== undefined) {
      measured += 1;
      assert.ok(p, `${r.id} publishes a Domain Rating with no provenance at all`);
      rows.add(`${p.measuredDomain}:${r.domainRating}:${p.provider}:${p.measuredAt}:${p.status}`);
    }
  }
  assert.ok(measured > 0, 'no record carries a Domain Rating: the measurement guards are vacuous');
  assert.strictEqual(rows.size, domains.size, 'one measured domain produced two different readings');
  assert.ok(measured >= domains.size, 'more measured domains than records carrying them is impossible');
  assert.deepStrictEqual(S.sharedDomainSnapshotProblems(ALL), [],
    'records sharing a measured domain do not repeat one identical reading');
});

// ── no network dependency ───────────────────────────────────────────────────
test('nothing this wave added introduces a network or API dependency', () => {
  const FILES = [
    'data/business-directories/directories/united-states.json',
    ...NEW.map((r) => `research/business-directories/${r.country}/${r.slug}/index.html`),
  ];
  const NETWORK = new RegExp([
    'require\\((?:.)(?:node:)?(?:https?|net|dgram|dns|tls)',
    String.raw`\bfetch\s*\(`, 'XMLHttpRequest', 'axios', 'node-fetch',
  ].join('|'));
  for (const f of FILES) {
    assert.ok(!NETWORK.test(fs.readFileSync(path.join(ROOT, f), 'utf8')),
      `${f} introduces a network dependency`);
  }
  for (const f of ['package.json', 'package-lock.json', 'node_modules']) {
    assert.ok(!fs.existsSync(path.join(ROOT, f)), `${f} appeared; the build is dependency-free`);
  }
});

// ── critical caveats, pinned by content ─────────────────────────────────────
const CRITICAL_CAVEATS = {
  'us-merchantcircle': [
    [/Remove competitor ads from your listing/i, 'that a free profile carries competitors’ ads'],
    [/purchased badge is not evidence/i, 'that the verified badge is bought, not earned'],
  ],
  'us-alignable': [
    [/networking platform, not a consumer directory/i, 'that a profile here reaches peers, not customers'],
    [/person-led/i, 'that entries are headed by an individual rather than the business'],
  ],
};

test('every critical caveat survives in rendered prose', () => {
  for (const [id, checks] of Object.entries(CRITICAL_CAVEATS)) {
    const v = visible(byId.get(id));
    for (const [re, what] of checks) {
      assert.ok(re.test(v), `${id} no longer tells a reader ${what}`);
    }
  }
});

// ── rendering ───────────────────────────────────────────────────────────────
test('the listing block renders and editor notes do not', () => {
  const LABELS = { create: 'Create a listing', claim: 'Claim an existing profile' };
  for (const r of NEW) {
    const body = bodyText(fs.readFileSync(
      path.join(ROOT, 'research', 'business-directories', r.country, r.slug, 'index.html'), 'utf8'));
    assert.ok(body.includes(LABELS[r.listingAction]),
      `${r.id} does not render its listing action "${r.listingAction}"`);
    for (const leak of ['PLATFORM OPERATOR:', 'LISTING CONTROL:', 'MODERATION AUTHORITY:',
      'NOT ASSERTED', 'COST DECISION', 'LISTING ACTION DECISION', 'ACCEPTANCE DECISION',
      'OWNER RESPONSES:']) {
      assert.ok(!body.includes(leak), `${r.id} page publishes the editor note "${leak}"`);
    }
    for (const con of r.cons) {
      const probe = con.replace(/\s+/g, ' ').slice(0, 40);
      assert.ok(body.includes(probe), `${r.id} limitation does not reach the page: ${probe}`);
    }
  }
});

test('every record documents the four non-statutory identity roles', () => {
  for (const r of NEW) {
    for (const role of ['PLATFORM OPERATOR:', 'LISTING CONTROL:',
      'MODERATION AUTHORITY:', 'PUBLIC INTERFACE:']) {
      assert.ok(r.editorNotes.includes(role), `${r.id} does not determine ${role}`);
    }
    assert.ok(!r.editorNotes.includes('LEGAL SOURCE OF RECORD:'),
      `${r.id} uses the statutory identity contract on a commercial platform`);
  }
});

test('every record was verified on a dated second pass', () => {
  for (const r of NEW) {
    assert.strictEqual(r.lastVerified, '2026-08-06', `${r.id} carries a different verification date`);
    assert.strictEqual(r.verification.source, 'official-documentation', `${r.id} was not verified from official documentation`);
    assert.match(r.editorNotes, /re-verified in a separate direct pass/, `${r.id} records no second pass`);
    assert.strictEqual(r.nextVerification, S.nextVerificationFor(r), `${r.id} verification date was hand-set`);
    assert.strictEqual(S.computeScore(r.scoreFactors), r.petroHrysScore, `${r.id} score does not reproduce`);
  }
});

// ── backlog consistency ─────────────────────────────────────────────────────
test('the backlog documents this wave and its browser queue', () => {
  const doc = fs.readFileSync(
    path.join(ROOT, 'docs', 'business-directories-verification-backlog.md'), 'utf8');
  const section = doc.slice(doc.indexOf('## Wave 1C'));
  assert.ok(section.length > 1500, 'the wave is not documented in the backlog');
  const flat = section.replace(/\s+/g, ' ');
  for (const r of NEW) assert.ok(section.includes(r.name), `${r.id} is not in the backlog`);
  for (const p of ['Yellow Pages', 'Manta', 'Hotfrog', 'Cylex', 'EZlocal', 'Angi',
    'Thumbtack', 'Better Business Bureau', 'Houzz', 'Nextdoor']) {
    assert.ok(section.includes(p), `${p} has no browser-queue entry`);
  }
  assert.match(flat, /blocked, not absent/i, 'the backlog no longer states the blocked-is-not-absent rule');
  assert.match(flat, /Porch/, 'the Porch finding is not recorded');
  assert.match(flat, /already exist as .{0,20}global/i, 'the global-overlap finding is not recorded');
});
