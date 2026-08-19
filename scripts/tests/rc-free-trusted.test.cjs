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
    ['French', 'Inscription gratuite pour votre entreprise'],
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
