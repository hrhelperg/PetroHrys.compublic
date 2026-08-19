'use strict';
// Wave 1B.1 — Germany, the first completed commercial-directory country.
//
// "Complete" means every candidate has a final status, not that every candidate
// became a record. Four published; two deliberately not:
//
//   Das Örtliche          — business surface unreachable, marketing site 410 Gone
//   Marktplatz Mittelstand — profile provenance undocumented
//
// The guards below protect three things: that the four stay honest about what
// was never documented, that the two rejections are not quietly reversed, and
// that three directories sharing a market are not collapsed into one record —
// or, worse, described as sharing an entry when no operator says they do.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const S = require('../lib/bd-schema.cjs');
const { loadRegistry } = require('../lib/bd-registry.cjs');
// Publication parity, in place of the per-country totals this suite used to pin.
const PARITY = require('./helpers/country-parity.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const ALL = loadRegistry().directories;
const byId = new Map(ALL.map((r) => [r.id, r]));

const WAVE = ['de-gelbe-seiten', 'de-das-telefonbuch', 'de-11880', 'de-wlw'];
const NEW = WAVE.map((id) => byId.get(id));
const PHONE_BOOKS = ['de-gelbe-seiten', 'de-das-telefonbuch', 'de-11880'];

const visible = (r) => [r.description, ...r.pros, ...r.cons, ...r.bestFor, ...r.notRecommendedFor].join(' \n ');
const limitsOf = (r) => [...r.cons, ...r.notRecommendedFor].join(' ');
const hostOf = (u) => new URL(u).hostname.replace(/^www\./, '');

test('every record this wave claims to have published exists', () => {
  assert.strictEqual(WAVE.length, 4, 'the wave manifest changed size without this test changing');
  for (const id of WAVE) assert.ok(byId.get(id), `missing record ${id}`);
  // BRITTLE MIRROR, REMOVED: `... === 20`, a per-country total that had already
  // accumulated its own changelog in a trailing comment ("+1 Das Örtliche,
  // high-authority expansion"). See scripts/tests/helpers/country-parity.cjs.
  PARITY.assertCountryPublicationParity(assert, ALL, 'germany', 20);
});

// ── the pillar boundary ─────────────────────────────────────────────────────
test('no German directory is a government record, and none claims to be a registry', () => {
  for (const r of NEW) {
    assert.ok(!S.isGovernmentPillar(r),
      `${r.id} landed in the Government Registry pillar`);
    assert.deepStrictEqual(r.registryTypes, [],
      `${r.id} claims a registry type; a commercial directory is not a statutory register`);
    assert.strictEqual(r.primaryRegistryType, null);
    // And it must not read as an official source of record.
    assert.ok(!/statutory|official register|source of record|register of record/i.test(visible(r)),
      `${r.id} describes a commercial directory in statutory language`);
  }
});

test('no German government record was turned into a listing opportunity', () => {
  for (const r of ALL.filter((x) => x.country === 'germany' && S.isGovernmentPillar(x))) {
    assert.strictEqual(r.listingAction, 'not-applicable', `${r.id} gained a listing action`);
    assert.strictEqual(r.submissionModel, 'notApplicable', `${r.id} gained a submission model`);
    assert.strictEqual(r.submissionUrl, null, `${r.id} gained a submission URL`);
  }
});

// ── duplicate boundary: three directories, not one ──────────────────────────
test('the three German phone-book directories stay separate systems', () => {
  const hosts = PHONE_BOOKS.map((id) => hostOf(byId.get(id).website));
  assert.strictEqual(new Set(hosts).size, 3, 'two of the three share a host');
  // Each must have its own submission route, or the claim of independence fails.
  const subs = PHONE_BOOKS.map((id) => byId.get(id).submissionUrl).filter(Boolean);
  assert.strictEqual(new Set(subs).size, subs.length, 'two directories share a submission URL');
  // And each must record the duplicate decision.
  for (const id of PHONE_BOOKS) {
    assert.match(byId.get(id).editorNotes, /DUPLICATE DECISION/,
      `${id} does not record why it is separate from the others`);
  }
});

test('no record claims that one entry reaches the other directories', () => {
  // No operator states this. Asserting it would invent a cross-posting feature.
  //
  // Scanned sentence by sentence, skipping any sentence that NEGATES the claim —
  // an earlier version matched the disclaimer "no operator states that one entry
  // reaches all three" and flagged the very record doing the right thing.
  const CLAIM = /one (entry|submission) (also )?(appears|reaches|publishes)|entry appears in (Gelbe Seiten|Das Telefonbuch|Das Örtliche)/i;
  const NEGATED = /\bno\b|\bnot\b|nothing|must submit to each|neither/i;
  for (const r of NEW) {
    for (const sentence of visible(r).split(/(?<=[.!?])\s+/)) {
      if (!CLAIM.test(sentence) || NEGATED.test(sentence)) continue;
      assert.fail(`${r.id} claims cross-directory publication that no operator documents: "${sentence.trim().slice(0, 80)}"`);
    }
  }
  // Das Telefonbuch must actively tell a reader it does NOT.
  // CORRECTED: this previously required the record to state that entries are
  // NOT shared. DTM's entry service publishes to all three from one form, so
  // that warning would now be false. What must survive is that each directory
  // ALSO has its own independent entry service.
  assert.match(byId.get('de-das-telefonbuch').editorNotes, /CORRECTED 2026-08-06/,
    'the Das Telefonbuch shared-entry correction was reverted');
  assert.match(byId.get('de-gelbe-seiten').editorNotes, /CORRECTED 2026-08-06/,
    'the Gelbe Seiten shared-entry correction was reverted');
});

// ── the rejections must not be reversed silently ────────────────────────────
// Das Örtliche's rejection WAS reversed, on evidence, by the high-authority
// expansion wave: its Wave 1B.1 failure was "business surface unreachable —
// marketing site 410 Gone", and DTM Deutsche Tele Medien's entry service is now
// live and documents a free submission in plain terms. Marktplatz Mittelstand's
// failure was different and is still unresolved: profile provenance, i.e.
// whether entries are self-created or generated from other sources, remains
// undocumented. A rejection may only be reversed by resolving the reason it was
// made, not by researching the candidate again and finding other facts.
test('the Marktplatz Mittelstand rejection remains unreversed', () => {
  for (const id of ['de-marktplatz-mittelstand']) {
    assert.ok(!byId.get(id), `${id} was published despite an unresolved acceptance failure`);
  }
  for (const host of ['marktplatz-mittelstand.de']) {
    const hit = ALL.find((r) => hostOf(r.website) === host);
    assert.ok(!hit, `${host} was published, but its acceptance criteria were never met`);
  }
});

// ── evidence discipline ─────────────────────────────────────────────────────
test('nothing undocumented is asserted', () => {
  for (const r of NEW) {
    // Verification was documented by no German operator.
    assert.strictEqual(r.verificationMethods, null,
      `${r.id} asserts verification methods that no operator documented`);
    // Owner responses were documented by no German operator.
    assert.strictEqual(r.ownerResponseSupport, null,
      `${r.id} asserts owner-response support that no operator documented`);
    // No claim flow was established for any of them.
    assert.strictEqual(r.listingAction, 'create',
      `${r.id} asserts a listing action beyond the create flow that was actually documented`);
    assert.strictEqual(r.claimUrl, null, `${r.id} asserts a claim URL`);
  }
});

test('wlw records cost as unknown rather than inferring free', () => {
  const r = byId.get('de-wlw');
  assert.strictEqual(r.submissionModel, 'unknown',
    'wlw cost was inferred; the operator documents a premium tier, not a free basic tier');
  assert.match(limitsOf(r), /NOT documented|recorded as unknown/i,
    'the wlw record does not tell a reader that its cost is unestablished');
  // And the premium tier must never be read as making it paid.
  assert.ok(!/paid platform|requires payment/i.test(visible(r)));
});

test('11880 does not let a paid product imply a free-tier capability', () => {
  const r = byId.get('de-11880');
  assert.strictEqual(r.reviewSystem, true, 'ratings are documented and should be recorded');
  assert.strictEqual(r.ownerResponseSupport, null, 'owner responses were never documented');
  assert.match(limitsOf(r), /separate commercial offering|not evidence that responding/i,
    'the record does not warn that the paid review product is not the free entry');
});

test('Gelbe Seiten records that an entry is a request, not a publication', () => {
  const r = byId.get('de-gelbe-seiten');
  assert.strictEqual(r.manualReview, true);
  assert.match(limitsOf(r), /REQUEST, not a publication|redaktionelle Prüfung/,
    'the record does not tell a reader the entry is editorially reviewed first');
  assert.match(visible(r), /regional/i, 'the regional publisher structure is not visible');
});

// ── no unsupported SEO or outcome claims ────────────────────────────────────
test('no record claims a backlink, indexing, ranking or traffic outcome', () => {
  const FORBIDDEN = /dofollow|nofollow|guaranteed (backlink|traffic|ranking|indexing)|improve your ranking|boost your seo|will rank|drives traffic/i;
  for (const r of NEW) {
    assert.ok(!FORBIDDEN.test(visible(r)),
      `${r.id} makes an SEO or traffic claim that was never established`);
    assert.strictEqual(r.backlinkType, null, `${r.id} asserts a backlink type`);
    assert.strictEqual(r.indexed, null, `${r.id} asserts indexing`);
  }
});

test('every record states what a listing does not prove', () => {
  for (const r of NEW) {
    assert.match(limitsOf(r), /not (a check|evidence)|says nothing about|NOT documented|is not asserted/i,
      `${r.id} never says what a listing does not establish`);
  }
});

// ── metrics ─────────────────────────────────────────────────────────────────
// POLICY REVERSAL — the Domain Rating collection freeze has been lifted. This
// test asserted that the four German records carried no Domain Rating and no
// provenance, and pinned the frozen set at 64 measured domains. Every domain is
// now read from Ahrefs' free public /v3/public/domain-rating-free endpoint, so
// both claims are false. The invariant they protected — a rating is never
// INVENTED and describes the record's OWN domain — is asserted directly.
test('no new record invents a Domain Rating', () => {
  for (const r of NEW) {
    assert.deepStrictEqual(S.domainRatingProblems(r), [], `${r.id} has an unusable Domain Rating`);
    assert.strictEqual(r.metricsProvenance.domainRating.measuredDomain, S.normaliseDomain(r.website),
      `${r.id} reports a rating measured on a domain other than its own`);
  }
  assert.deepStrictEqual(S.sharedDomainSnapshotProblems(ALL), [],
    'records sharing a measured domain no longer repeat one identical reading');
  // FIXTURES. The corpus no longer holds an unmeasured record, so "missing is
  // not zero" is exercised on objects built here rather than dropped.
  assert.ok(S.domainRatingProblems({ domainRating: 78, metricsProvenance: {} }).length > 0,
    'a bare number with no provenance must be rejected as an invented metric');
  assert.ok(S.domainRatingProblems({
    domainRating: null,
    metricsProvenance: {
      domainRating: {
        provider: 'Ahrefs',
        measuredAt: '2026-08-19',
        status: 'publicApiReading',
        measuredDomain: 'gelbeseiten.de',
      },
    },
  }).length > 0, 'provenance for a rating that is not set must be rejected');
  assert.deepStrictEqual(S.domainRatingProblems({ domainRating: null, metricsProvenance: {} }), [],
    'an unmeasured record must be allowed to carry no rating, rather than a zero');
});

// ── rendering ───────────────────────────────────────────────────────────────
test('the listing block renders and the editor notes do not', () => {
  for (const r of NEW) {
    const html = fs.readFileSync(
      path.join(ROOT, 'research', 'business-directories', r.country, r.slug, 'index.html'), 'utf8');
    const body = html.replace(/<[^>]+>/g, ' ')
      .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ');
    assert.ok(body.includes('Create a listing'), `${r.id} does not render its listing action`);
    for (const leak of ['PLATFORM OPERATOR:', 'DUPLICATE DECISION', 'NOT ASSERTED',
      'EVIDENCE CAUTION', 'COST DECISION']) {
      assert.ok(!body.includes(leak), `${r.id} page publishes the editor note "${leak}"`);
    }
    for (const con of r.cons) {
      const probe = con.replace(/\s+/g, ' ').slice(0, 40);
      assert.ok(body.includes(probe), `${r.id} limitation does not reach the page: ${probe}`);
    }
  }
});

// reviewSystem was documented by exactly ONE German operator. Pinning the value
// per record stops a later edit inventing ratings for a directory that never
// documented any — the "nothing undocumented is asserted" test above checks the
// four commercial fields but not this one.
const REVIEW_TRUTH = {
  'de-gelbe-seiten': null,
  'de-das-telefonbuch': null,
  'de-11880': true,
  'de-wlw': null,
};

test('review support matches what each operator actually documented', () => {
  for (const [id, expected] of Object.entries(REVIEW_TRUTH)) {
    assert.strictEqual(byId.get(id).reviewSystem, expected,
      `${id} reviewSystem is ${byId.get(id).reviewSystem}; only 11880 documented ratings`);
  }
});

// A check that iterates the cons a record still has cannot notice a con that was
// DELETED. These are the caveats without which a record misleads, pinned by
// content so removal fails rather than passing silently.
const CRITICAL_CAVEATS = {
  'de-wlw': [
    [/B2B (procurement )?marketplace/i, 'that it is a B2B marketplace, not a local directory'],
    [/cost is recorded as unknown|NOT documented/i, 'that its cost is unestablished'],
  ],
  'de-gelbe-seiten': [
    [/REQUEST, not a publication/i, 'that an entry is a request, not a publication'],
  ],
  'de-11880': [
    [/separate commercial offering/i, 'that the paid review product is not the free entry'],
  ],
  'de-das-telefonbuch': [
    [/must submit to each/i, 'that entries are not shared between the directories'],
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

test('every record documents the non-statutory identity roles', () => {
  for (const r of NEW) {
    for (const role of ['PLATFORM OPERATOR:', 'LISTING CONTROL:',
      'MODERATION AUTHORITY:', 'PUBLIC INTERFACE:']) {
      assert.ok(r.editorNotes.includes(role), `${r.id} does not determine ${role}`);
    }
    // And never the government four roles.
    assert.ok(!r.editorNotes.includes('LEGAL SOURCE OF RECORD:'),
      `${r.id} uses the statutory identity contract on a commercial platform`);
  }
});
