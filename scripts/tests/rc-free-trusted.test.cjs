'use strict';

// Free, and worth recommending — which are two questions, not one.
//
// A free listing on a link farm costs a business time and can cost it
// reputation, so "free" never rescues a source. And "free" itself is not one
// fact: a platform that charges nothing until something sells is a different
// proposition from one that wants a subscription first, and collapsing them
// tells someone with no budget that they cannot start when they can.

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '..', '..');
const F = require(path.join(ROOT, 'scripts/research-free-and-trusted.cjs'));
const MP = require(path.join(ROOT, 'scripts/lib/mp-schema.cjs'));
const P = require(path.join(ROOT, 'scripts/lib/distribution-planner.cjs'));
const E = require(path.join(ROOT, 'scripts/lib/dp-engine.cjs'));

const page = (title, head, over = {}) => ({
  title, head, h1: [], textLen: 3000, url: 'https://x.test/a', status: 200, error: null, ...over,
});
const target = { url: 'https://x.test/a', website: 'https://x.test/' };
const mp = (over = {}) => ({
  id: 'mp-x', name: 'X', website: 'https://x.test/', country: 'spain',
  marketplaceType: 'services', sellerTypes: 'both', costModel: 'unknown',
  currentStatus: 'active', note: '', ...over,
});

// ── FREE IS NOT ONE FACT ────────────────────────────────────────────────────

test('a fee only on a completed sale is not an upfront cost', () => {
  const v = F.classify(target, page('Sell', 'No listing fee. We take a 5% commission when it sells.'));
  assert.equal(v.state, 'ACCEPT_FREE_TRUSTED');
  assert.equal(v.cost, 'free-listing-commission');
  assert.notEqual(v.cost, 'paid');

  // And the schema keeps the two apart rather than calling both freemium.
  assert.ok(MP.SELLER_COSTS.includes('free-listing-commission'));
  assert.ok(MP.SELLER_COSTS.includes('paid-upfront'));
  assert.ok(MP.NO_UPFRONT_COST.includes('free-listing-commission'));
  assert.ok(!MP.NO_UPFRONT_COST.includes('paid-upfront'));
});

test('a free tier beside paid plans is freemium, not free', () => {
  const v = F.classify(target, page('Pricing', 'Free plan available. Pro from $29/month.'));
  assert.equal(v.state, 'ACCEPT_FREEMIUM');
  assert.equal(v.cost, 'free-tier');
});

test('a paid upgrade does not make a free basic listing paid', () => {
  // The failure this prevents: reading any mention of money as "this costs".
  const v = F.classify(target, page('Add your business',
    'List your business for free. Optional premium placement from €19 per month.'));
  assert.ok(/ACCEPT/.test(v.state), `a free basic listing was rejected as ${v.state}`);
  assert.notEqual(v.cost, 'paid');
});

test('silence about price is unknown, never free', () => {
  const v = F.classify(target, page('Contact', 'Get in touch with our team today.'));
  assert.equal(v.state, 'DEFER_COST_UNKNOWN');
  assert.equal(v.cost, undefined);
});

test('a registration page alone establishes nothing about price', () => {
  // "Sign up", "Get started" and "Join" are how every platform opens its door,
  // free or not.
  for (const head of ['Sign up now', 'Get started', 'Join today', 'Create your account']) {
    const v = F.classify(target, page('Register', head));
    assert.equal(v.state, 'DEFER_COST_UNKNOWN', `"${head}" was read as a price`);
  }
});

test('free wording is read in the language the operator writes in', () => {
  for (const [label, head] of [
    ['German', 'Kostenlos eintragen und Ihr Unternehmen präsentieren'],
    ['Spanish', 'Publica tu anuncio gratis'],
    // Was "Inscription gratuite", which the stricter rule now correctly reads
    // as registration wording rather than a free service.
    ['French', 'Déposez votre annonce gratuitement'],
    ['Russian', 'Разместить объявление бесплатно'],
    ['Turkish', 'Ücretsiz ilan ver'],
    ['Polish', 'Darmowe ogłoszenie'],
    ['Czech', 'Zdarma zapsat firmu'],
  ]) {
    const v = F.classify(target, page('x', head));
    assert.ok(/ACCEPT/.test(v.state), `${label} free wording produced ${v.state}`);
  }
});

// ── FREE IS NOT ENOUGH ──────────────────────────────────────────────────────

test('a free link farm is rejected, and trust is checked before price', () => {
  const v = F.classify(target, page('Free directory submission',
    'Free listing! Buy backlinks and guest post service. Increase your DA fast.'));
  assert.equal(v.state, 'REJECT_LOW_QUALITY',
    'a link farm was accepted because it said the word free');
  assert.equal(v.cost, undefined, 'a rejected source still carried a cost fact');
});

test('a parked domain never becomes a free source', () => {
  const v = F.classify(target, page('example.com is for sale',
    'This domain is for sale. Free listing. Buy this domain at Sedo.com.'));
  assert.equal(v.state, 'REJECT_LOW_QUALITY');
});

test('a bot challenge defers rather than deciding a price', () => {
  const v = F.classify(target, page('Just a moment...', 'Checking your browser'));
  assert.equal(v.state, 'DEFER_PROTECTED');
  assert.equal(v.cost, undefined);
});

// ── THE PRODUCT ─────────────────────────────────────────────────────────────

test('the planner budget control reads what it costs a SELLER', () => {
  const ops = P.project({
    directories: [],
    media: [],
    marketplaces: [
      mp({ id: 'mp-comm', costModel: 'freemium', sellerCost: 'free-listing-commission' }),
      mp({ id: 'mp-paid', costModel: 'freemium', sellerCost: 'paid-upfront' }),
      mp({ id: 'mp-none', costModel: 'freemium' }),
    ],
  });
  const cost = Object.fromEntries(ops.map((o) => [o.platformId, o.cost]));
  // Nothing to pay before starting, so a budget constraint should not exclude it.
  assert.equal(cost['mp-comm'], 'free');
  assert.equal(cost['mp-paid'], 'paid');
  // Unresearched records keep the platform's own value; nothing is invented.
  assert.equal(cost['mp-none'], 'freemium');

  // The precise fact survives on the record even where the planner simplifies.
  const comm = ops.find((o) => o.platformId === 'mp-comm');
  assert.equal(comm.record.sellerCost, 'free-listing-commission');
});

test('a free-only budget excludes paid and admits nothing unknown by accident', () => {
  const budgets = E.BUDGETS ? E.BUDGETS : null;
  assert.ok(budgets, 'the planner exposes no budget vocabulary');
  const freeOnly = budgets.find((b) => b.key === 'free-only');
  assert.deepEqual(freeOnly.accepts, ['free'],
    'the free-only budget accepts something other than free');
  const any = budgets.find((b) => b.key === 'any');
  assert.equal(any.accepts, null, 'the "any" budget is no longer the permissive one');
});

test('no record carries a cost value its own schema does not define', () => {
  const rows = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/marketplaces/marketplaces.json'), 'utf8'));
  for (const r of rows) {
    if (r.sellerCost === undefined) continue;
    assert.ok(MP.SELLER_COSTS.includes(r.sellerCost), `${r.id}: ${r.sellerCost}`);
  }
  // Absent stays the majority: nothing was bulk-filled to make a number move.
  const absent = rows.filter((r) => r.sellerCost === undefined).length;
  assert.ok(absent > 0, 'every record was given a seller cost, which means something was guessed');
});

test('a free-only campaign admits no paid record', () => {
  const OPS = P.project(P.loadAll());
  for (const objective of ['seo-citations', 'local-discovery', 'marketplace-exposure']) {
    const c = E.campaign(OPS, {
      business: 'local-business', objective, market: '*', budget: 'free-only',
    }, { size: 60 });
    const paid = c.picked.filter((r) => r.op.cost === 'paid' || r.op.cost === 'mixed');
    assert.deepEqual(paid.map((r) => r.op.platformId), [],
      `${objective}: a paid record reached a free-only campaign`);
  }
});

test('unknown cost under a free-only budget is a caveat, not a silent free claim', () => {
  // The engine says so itself, and this phase deliberately did not change it:
  // "Unknown cost is not a refusal. Under a free-only budget it is a caveat."
  // What matters is that unknown is never RECORDED as free — the corpus keeps
  // 1,349 directories at unknown rather than assuming.
  const rows = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/business-directories/opportunities.json'), 'utf8'));
  const unknown = rows.filter((r) => !r.submissionModel || r.submissionModel === 'unknown');
  assert.ok(unknown.length > 1000,
    `only ${unknown.length} directories remain unknown; something was filled in wholesale`);
  const free = rows.filter((r) => r.submissionModel === 'free');
  assert.ok(free.length > 100 && free.length < unknown.length,
    'the free cohort is either empty or implausibly large');
});

test('the research ledger records a terminal state for every candidate', () => {
  const file = path.join(ROOT, 'data/business-directories/.free-trusted.json');
  const { findings } = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(findings.length > 500, 'the ledger is missing');
  const STATES = new Set(['ACCEPT_FREE_TRUSTED', 'ACCEPT_FREEMIUM', 'REJECT_LOW_QUALITY',
    'REJECT_PAID_ONLY', 'DEFER_COST_UNKNOWN', 'DEFER_PROTECTED', 'UNRESOLVED']);
  for (const f of findings) {
    assert.ok(STATES.has(f.state), `${f.id} ended in "${f.state}"`);
    // A cost may only ride along with a state that earned one. A re-judgement
    // that merged over the previous verdict left three demoted records still
    // carrying "free-listing-commission", and the ledger reported a price
    // nothing had established.
    if (f.cost) {
      assert.match(f.state, /^ACCEPT|^REJECT_PAID_ONLY$/,
        `${f.id} is ${f.state} but still carries cost "${f.cost}"`);
    }
  }
});

// ── TENDER: SEEING A CONTRACT IS NOT COMPETING FOR ONE ───────────────────────

const B = require(path.join(ROOT, 'scripts/research-tender-bid-access.cjs'));
const TENDERS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/tenders-procurement/platforms.json'), 'utf8'));

test('free search never becomes free bidding', () => {
  // 293 platforms publish notices openly. Three of them charge to take part —
  // PhilGEPS, GeBIZ and Find a Tender — and an inference from search to
  // participation would have been wrong about every one.
  const divergent = TENDERS.filter((r) => r.searchAccess === 'free' && r.bidAccess && r.bidAccess !== 'free');
  assert.ok(divergent.length > 0,
    'no platform separates free search from paid participation, so the distinction is untested');

  // The classifier is blind to searchAccess by construction: the same page
  // yields the same verdict whatever a record claims about search.
  const seen = (head) => ({
    title: '', h1: [], head, textLen: 3000, url: 'https://t.test/r', status: 200, error: null,
  });
  const silent = seen('Search current tenders and view notices');
  for (const searchAccess of ['free', 'paid', 'mixed', 'unknown', undefined]) {
    const v = B.classify({ searchAccess }, silent);
    assert.equal(v.state, 'DEFER_NO_STATEMENT',
      `searchAccess=${searchAccess} changed the bid-access verdict`);
    assert.equal(v.bidAccess, undefined);
  }
});

test('a bid bond or document fee is not a platform charge', () => {
  // These are conditions a BUYER sets on one contract. Reading them as platform
  // access would make a free portal look paid because one tender was demanding.
  const seen = (head) => ({
    title: 'Tender', h1: [], head, textLen: 3000, url: 'https://t.test/r', status: 200, error: null,
  });
  for (const head of [
    'A bid bond of 2% of the tender value is required',
    'Tender document fee of USD 50 is payable',
    'Bietungsgarantie erforderlich',
    'Wadium w wysokości 5000 PLN',
  ]) {
    const v = B.classify({}, seen(head));
    assert.notEqual(v.bidAccess, 'paid', `"${head}" was read as a platform fee`);
    assert.equal(v.state, 'DEFER_NO_STATEMENT');
    assert.ok(v.opportunityLevel, 'the contract-level condition was not even noticed');
  }
});

test('bid access is only recorded where the operator states it', () => {
  const withFact = TENDERS.filter((r) => r.bidAccess !== undefined);
  assert.ok(withFact.length > 0, 'no bid-access fact exists at all');
  // The overwhelming majority stay unknown, because most procurement portals
  // simply do not state what participation costs on the page they send you to.
  const unknown = TENDERS.filter((r) => r.currentStatus === 'active' && r.bidAccess === undefined);
  assert.ok(unknown.length > withFact.length,
    'bid access was established far more often than the evidence standard allows');
});

test('the tender applier cannot touch search access', () => {
  // Enforced mechanically by the ownership contract, and asserted here on the
  // data: bid-access research owns bidAccess and nothing else.
  const SAFE = require(path.join(ROOT, 'scripts/lib/rc-safe-apply.cjs'));
  assert.ok(SAFE.OWNERSHIP.cost.tenders.includes('bidAccess'));
  const record = { id: 't', searchAccess: 'free', currentStatus: 'active' };
  assert.throws(
    () => SAFE.applyPatch(record, { currentStatus: 'unknown' }, { owner: 'cost', collection: 'tenders' }),
    /owns only/,
    'cost research was able to change platform accessibility',
  );
  assert.equal(record.currentStatus, 'active');
});

// ── THE FIVE INVARIANTS I HAD ONLY EVER CHECKED BY HAND ──────────────────────
//
// Each of these was verified interactively while building the classifier and
// never written down, so a mutation removing the guard passed the whole suite.
// Behaviour nobody encoded is behaviour nobody keeps.

test('free-account wording alone never establishes a free service', () => {
  // The distinction the marketplace phase drew for ACTIONS, restated for price:
  // signing up costs nothing almost everywhere, and what the account then lets
  // you do is the actual question.
  for (const head of [
    'Create a free account and get started',
    'Free to join — sign up today',
    'Free registration for all users',
    'Kostenlos registrieren',
  ]) {
    const v = F.classify(target, page('Join', head));
    assert.equal(v.state, 'DEFER_COST_UNKNOWN',
      `"${head}" was read as a free service`);
    assert.equal(v.cost, undefined);
  }
  // And the same wording beside a real free action still resolves.
  const withAction = F.classify(target, page('Add', 'Create a free account. List your business for free.'));
  assert.equal(withAction.cost, 'free');
});

test('a time-limited trial is a price with a delay, not a free tier', () => {
  for (const head of [
    'Start your 14-day free trial. Plans from $19/month.',
    'Try it free for 30 days',
    'Kostenlos testen — 14 Tage',
    'Prueba gratuita de 30 días',
  ]) {
    const v = F.classify(target, page('Pricing', head));
    assert.equal(v.state, 'DEFER_COST_UNKNOWN', `"${head}" became ${v.state}`);
    assert.notEqual(v.cost, 'free');
    assert.notEqual(v.cost, 'free-tier');
  }
});

test('"European Commission" is not a transaction fee', () => {
  // Two trade associations and an e-commerce news page were recorded as
  // charging sales commission because the word appears on them. In French it
  // means a committee; in Brussels it means an institution.
  for (const head of [
    'Nos commissions et clubs — devenir membre',
    'Commission hits Temu with a €200 million fine over unsafe products',
    'Le syndicat, ses commissions et ses régions',
  ]) {
    const v = F.classify(target, page('Association', head));
    assert.notEqual(v.cost, 'free-listing-commission',
      `"${head.slice(0, 40)}" established a transaction fee`);
  }
  // A real one still resolves, so the guard is not simply switched off.
  const real = F.classify(target, page('Sell', 'No listing fee. We charge a 5% commission on sale.'));
  assert.equal(real.cost, 'free-listing-commission');
});

test('a business category is not a quality judgement', () => {
  // A general directory lists casinos the way it lists bakeries. The bare stem
  // rejected Hotfrog in two countries and a Swiss directory.
  for (const head of [
    'Browse categories: restaurants, hotels, casino, bakeries, plumbers. List your business for free.',
    'Kategorien: Restaurants, Casino, Bäckerei — kostenlos eintragen',
  ]) {
    const v = F.classify(target, page('Directory', head));
    assert.notEqual(v.state, 'REJECT_LOW_QUALITY',
      'a directory was rejected for carrying a category');
    assert.equal(v.cost, 'free');
  }
  // Selling placement still is a rejection.
  const farm = F.classify(target, page('SEO', 'Free listing! Buy backlinks, casino guest post packages.'));
  assert.equal(farm.state, 'REJECT_LOW_QUALITY');
});

test('cost research cannot set accessibility in any collection', () => {
  const SAFE = require(path.join(ROOT, 'scripts/lib/rc-safe-apply.cjs'));
  for (const collection of ['directories', 'marketplaces', 'media', 'tenders']) {
    const record = { id: 'x', currentStatus: 'active' };
    assert.throws(
      () => SAFE.applyPatch(record, { currentStatus: 'unknown' }, { owner: 'cost', collection }),
      /owns only|no research pass may change/,
      `${collection}: cost research changed accessibility`,
    );
    assert.equal(record.currentStatus, 'active');
  }
  // And it owns no actionability either.
  assert.throws(
    () => SAFE.applyPatch({ id: 'x' }, { listingAction: 'create' }, { owner: 'cost', collection: 'directories' }),
    /owns only/,
  );
});
