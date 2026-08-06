'use strict';
// Wave 1B.2 — Czechia, the second completed commercial-directory country.
//
// Five candidates, two published. The three rejections are the wave's most
// valuable output, because each would appear on any "best Czech business
// directories" list written from memory:
//
//   Najisto.cz     — no longer a directory at all; a content site
//   ČeskéFirmy.cz  — redirects to a parked placeholder
//   Atlas firem    — redirects to firmablizko.cz; adoption unestablished
//
// Nothing but a test stops a later wave re-adding them from reputation.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const S = require('../lib/bd-schema.cjs');
const { loadRegistry } = require('../lib/bd-registry.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const ALL = loadRegistry().directories;
const byId = new Map(ALL.map((r) => [r.id, r]));

const WAVE = ['cz-firmy-cz', 'cz-zlate-stranky'];
const NEW = WAVE.map((id) => byId.get(id));

const visible = (r) => [r.description, ...r.pros, ...r.cons, ...r.bestFor, ...r.notRecommendedFor].join(' \n ');
const limitsOf = (r) => [...r.cons, ...r.notRecommendedFor].join(' ');
const hostOf = (u) => new URL(u).hostname.replace(/^www\./, '');

test('every record this wave claims to have published exists', () => {
  assert.strictEqual(WAVE.length, 2, 'the wave manifest changed size without this test changing');
  for (const id of WAVE) assert.ok(byId.get(id), `missing record ${id}`);
  assert.strictEqual(ALL.filter((r) => r.country === 'czech-republic').length, 15);
});

// ── the three rejections must not be reversed from reputation ───────────────
test('the rejected Czech candidates remain unpublished', () => {
  const FORBIDDEN_IDS = ['cz-najisto', 'cz-ceskefirmy', 'cz-atlas-firem', 'cz-firmablizko'];
  for (const id of FORBIDDEN_IDS) {
    assert.ok(!byId.get(id), `${id} was published despite a failed acceptance rule`);
  }
  const FORBIDDEN_HOSTS = ['najisto.cz', 'ceskefirmy.cz', 'quaest.net', 'atlasfirem.cz', 'firmablizko.cz'];
  for (const host of FORBIDDEN_HOSTS) {
    const hit = ALL.find((r) => hostOf(r.website) === host);
    assert.ok(!hit, `${host} was published; its acceptance criteria were never met`);
  }
});

// ── pillar boundary ─────────────────────────────────────────────────────────
test('no Czech directory is a government record or claims to be a registry', () => {
  for (const r of NEW) {
    assert.ok(!S.isGovernmentPillar(r), `${r.id} landed in the Government Registry pillar`);
    assert.deepStrictEqual(r.registryTypes, [], `${r.id} claims a registry type`);
    assert.ok(!/statutory|official register|source of record/i.test(visible(r)),
      `${r.id} describes a commercial catalogue in statutory language`);
  }
  // And it must actively distinguish itself from the Czech commercial register.
  assert.match(limitsOf(byId.get('cz-firmy-cz')), /not the Czech commercial register/i,
    'the Firmy.cz record does not distinguish itself from the statutory register');
});

test('no Czech government record was turned into a listing opportunity', () => {
  for (const r of ALL.filter((x) => x.country === 'czech-republic' && S.isGovernmentPillar(x))) {
    assert.strictEqual(r.listingAction, 'not-applicable', `${r.id} gained a listing action`);
    assert.strictEqual(r.submissionModel, 'notApplicable', `${r.id} gained a submission model`);
  }
});

// ── duplicate boundary ──────────────────────────────────────────────────────
test('Firmy.cz and Zlaté stránky stay separate systems', () => {
  const a = byId.get('cz-firmy-cz');
  const b = byId.get('cz-zlate-stranky');
  assert.notStrictEqual(hostOf(a.website), hostOf(b.website));
  assert.notStrictEqual(a.operator.name, b.operator.name, 'the two share an operator name');
  for (const r of NEW) {
    assert.match(r.editorNotes, /DUPLICATE DECISION/, `${r.id} does not record its duplicate decision`);
  }
  // Firmy.cz must record that it IS Seznam's catalogue, not a separate product.
  assert.match(a.editorNotes, /ONE system, not two/i,
    'the Firmy.cz record does not resolve the Firmy.cz / Seznam question');
  assert.strictEqual(a.operator.name, 'Seznam.cz, a.s.');
});

// ── evidence discipline ─────────────────────────────────────────────────────
test('nothing undocumented is asserted', () => {
  for (const r of NEW) {
    assert.strictEqual(r.verificationMethods, null, `${r.id} asserts verification methods`);
    assert.strictEqual(r.ownerResponseSupport, null, `${r.id} asserts owner-response support`);
    assert.strictEqual(r.listingAction, 'create', `${r.id} asserts a listing action beyond create`);
    assert.strictEqual(r.claimUrl, null, `${r.id} asserts a claim URL`);
  }
});

test('Zlaté stránky records cost as unknown rather than inferring it', () => {
  const r = byId.get('cz-zlate-stranky');
  assert.strictEqual(r.submissionModel, 'unknown',
    'cost was inferred; paid highlighting establishes nothing about the basic entry');
  assert.match(limitsOf(r), /NOT documented|recorded as unknown/i,
    'the record does not tell a reader its cost is unestablished');
  assert.strictEqual(r.registrationRequired, true, 'sign-in before adding is documented and should be recorded');
});

test('Firmy.cz free registration is recorded and its owner-response inference stayed rejected', () => {
  const r = byId.get('cz-firmy-cz');
  assert.strictEqual(r.submissionModel, 'free');
  assert.strictEqual(r.ownerResponseSupport, null);
  assert.match(r.editorNotes, /Souhrnné hodnocení|summary rating/i,
    'the record no longer documents why the owner-response inference was rejected');
});

// ── review truth, pinned per record ─────────────────────────────────────────
test('review support matches what each operator documented', () => {
  assert.strictEqual(byId.get('cz-firmy-cz').reviewSystem, true);
  assert.strictEqual(byId.get('cz-zlate-stranky').reviewSystem, true);
});

// ── no unsupported outcome claims ───────────────────────────────────────────
test('no record claims a backlink, indexing, ranking or traffic outcome', () => {
  const FORBIDDEN = /dofollow|nofollow|guaranteed (backlink|traffic|ranking|indexing)|improve your ranking|boost your seo|will rank|drives traffic/i;
  for (const r of NEW) {
    assert.ok(!FORBIDDEN.test(visible(r)), `${r.id} makes an unestablished SEO or traffic claim`);
    assert.strictEqual(r.backlinkType, null);
    assert.strictEqual(r.indexed, null);
  }
});

// ── critical caveats, pinned by content so deletion fails ───────────────────
const CRITICAL_CAVEATS = {
  'cz-firmy-cz': [
    [/Ratings exist, but whether a business owner can respond/i, 'that owner responses are undocumented'],
    [/not the Czech commercial register/i, 'that it is not the statutory register'],
  ],
  'cz-zlate-stranky': [
    [/cost is recorded as unknown/i, 'that its cost is unestablished'],
    [/not an anonymous submission/i, 'that an account is required first'],
    [/operator’s own figure/i, 'that the contact count is the operator’s own claim'],
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

// ── metrics ─────────────────────────────────────────────────────────────────
test('no new record carries a metric and the frozen snapshot is untouched', () => {
  for (const r of NEW) {
    assert.strictEqual(r.domainRating, null, `${r.id} carries a Domain Rating`);
    assert.deepStrictEqual(r.metricsProvenance, {}, `${r.id} invented metrics provenance`);
  }
  const domains = new Set();
  for (const r of ALL) {
    const p = r.metricsProvenance && r.metricsProvenance.domainRating;
    if (p && p.measuredDomain) domains.add(p.measuredDomain);
  }
  assert.strictEqual(domains.size, 64, 'the frozen measurement set changed size');
});

// ── rendering ───────────────────────────────────────────────────────────────
test('the listing block renders and editor notes do not', () => {
  for (const r of NEW) {
    const html = fs.readFileSync(
      path.join(ROOT, 'research', 'business-directories', r.country, r.slug, 'index.html'), 'utf8');
    const body = html.replace(/<[^>]+>/g, ' ')
      .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ');
    assert.ok(body.includes('Create a listing'), `${r.id} does not render its listing action`);
    for (const leak of ['PLATFORM OPERATOR:', 'DUPLICATE DECISION', 'NOT ASSERTED',
      'EVIDENCE CAUTION', 'COST DECISION', 'CORRECTION TO AN EARLIER WAVE']) {
      assert.ok(!body.includes(leak), `${r.id} page publishes the editor note "${leak}"`);
    }
    for (const con of r.cons) {
      const probe = con.replace(/\s+/g, ' ').slice(0, 40);
      assert.ok(body.includes(probe), `${r.id} limitation does not reach the page: ${probe}`);
    }
  }
});

test('every record documents the non-statutory identity roles', () => {
  for (const r of NEW) {
    for (const role of ['PLATFORM OPERATOR:', 'LISTING CONTROL:',
      'MODERATION AUTHORITY:', 'PUBLIC INTERFACE:']) {
      assert.ok(r.editorNotes.includes(role), `${r.id} does not determine ${role}`);
    }
    assert.ok(!r.editorNotes.includes('LEGAL SOURCE OF RECORD:'),
      `${r.id} uses the statutory identity contract on a commercial platform`);
  }
});
