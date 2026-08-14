'use strict';

// Whether a published route can be relied on, and whether a bad afternoon on
// one machine can delete the answer.
//
// The routes covered here are the ones the product shows to users as things
// they can go and do. They earn a stricter standard than the rest of the
// corpus, and the standard has two halves that pull in opposite directions:
//
//   a route must be downgraded when the evidence says it is wrong
//   a route must NOT be downgraded when the evidence says nothing at all
//
// Getting the second half wrong is worse. A timeout is not a finding.

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '..', '..');
const H = require(path.join(ROOT, 'scripts/research-action-route-health.cjs'));
const E = require(path.join(ROOT, 'scripts/lib/dp-engine.cjs'));
const P = require(path.join(ROOT, 'scripts/lib/distribution-planner.cjs'));

const route = (over = {}) => ({
  url: 'https://shop.test/sell', website: 'https://shop.test/',
  action: 'create-seller-profile', ...over,
});
const seen = (over = {}) => ({
  title: '', h1: [], head: '', textLen: 3000, url: 'https://shop.test/sell',
  status: 200, forms: 0, password: 0, chain: [], error: null, ...over,
});

// ── TRANSPORT FAILURE IS NOT EVIDENCE ───────────────────────────────────────

test('nothing transient can turn a verified route into a dead one', () => {
  // Each of these is a fact about this run. None is a fact about the action.
  const transient = [
    ['timeout', { error: 'CDP timeout: Page.navigate' }],
    ['DNS failure', { error: 'net::ERR_NAME_NOT_RESOLVED' }],
    ['TLS failure', { error: 'net::ERR_CERT_DATE_INVALID' }],
    ['browser crash', { error: 'CDP socket failed' }],
    ['403', { status: 403 }],
    ['429', { status: 429 }],
    ['500-class', { status: 503 }],
    ['bot challenge', { title: 'Just a moment...' }],
    ['nothing rendered', { textLen: 12 }],
  ];
  for (const [label, obs] of transient) {
    const v = H.classify(route(), seen(obs));
    assert.equal(v.state, 'PROTECTED_UNVERIFIABLE', `${label} produced ${v.state}`);
    assert.ok(v.transient, `${label} was not marked transient`);
    assert.ok(!H.DOWNGRADES.has(v.state), `${label} is in the set that clears routes`);
  }
});

test('only positive contradictory evidence downgrades a route', () => {
  // The three that DO clear a route, and nothing else in the vocabulary.
  assert.deepEqual([...H.DOWNGRADES].sort(),
    ['DEAD', 'GENERAL_HOME_REDIRECT', 'WRONG_ACTION']);
  for (const state of ['PROTECTED_UNVERIFIABLE', 'PRODUCT_MISMATCH',
    'LOGIN_GATE_FOR_CORRECT_ACTION', 'VALID_ACTION_DESTINATION', 'VALID_ACTION_AFTER_REDIRECT']) {
    assert.ok(!H.DOWNGRADES.has(state), `${state} would clear a route`);
  }
});

// ── HTTP 200 IS NOT RELIABILITY ─────────────────────────────────────────────

test('a 200 that lands on the homepage is not a route', () => {
  const v = H.classify(route(), seen({ url: 'https://shop.test/', head: 'Welcome to our shop' }));
  assert.equal(v.state, 'GENERAL_HOME_REDIRECT');
  assert.ok(H.DOWNGRADES.has(v.state), 'a homepage redirect would be kept as a route');
});

test('a 200 that no longer offers the action is not a route', () => {
  const v = H.classify(route({ action: 'press-release' }),
    seen({ title: 'Careers at Example', head: 'Open positions and benefits' }));
  assert.equal(v.state, 'WRONG_ACTION');
});

test('an error page served with 200 is dead, not healthy', () => {
  const v = H.classify(route(), seen({ status: 200, title: 'Page not found' }));
  assert.equal(v.state, 'DEAD');
});

// ── LOGIN GATES ─────────────────────────────────────────────────────────────

test('a bare login page is not seller onboarding', () => {
  const v = H.classify(route(), seen({
    password: 1, title: 'Sign in', h1: ['Sign in'], head: 'Email Password Forgot your password',
  }));
  assert.equal(v.state, 'WRONG_ACTION',
    'a generic login became a seller route on the strength of being a login');
});

test('a login inside the action’s own context is a legitimate route', () => {
  const v = H.classify(route(), seen({
    password: 1, title: 'Seller Centre — sign in',
    h1: ['Sign in to your seller account'], head: 'Seller account. Manage your listings.',
  }));
  assert.equal(v.state, 'LOGIN_GATE_FOR_CORRECT_ACTION');
  assert.ok(!H.DOWNGRADES.has(v.state));
});

// ── IDENTITY ────────────────────────────────────────────────────────────────

test('a route that leaves the operator’s product is a mismatch, not a success', () => {
  const v = H.classify(route(), seen({ url: 'https://somewhere-else.test/sell', head: 'sell with us' }));
  assert.equal(v.state, 'PRODUCT_MISMATCH');
  // And a mismatch is NOT auto-cleared: it needs a person, because the
  // destination may be the same operator under a new name.
  assert.ok(!H.DOWNGRADES.has(v.state));
});

test('a subdomain of the operator’s own site is not a mismatch', () => {
  const v = H.classify(route(), seen({
    url: 'https://sellers.shop.test/start', head: 'become a seller and start selling',
  }));
  assert.equal(v.state, 'VALID_ACTION_AFTER_REDIRECT');
});

// ── STEM MATCHING, THE DEFECT THAT DELETES ROUTES ───────────────────────────

test('destination semantics match stems, not boundaries', () => {
  // Written with word boundaries, "advertis" catches neither "advertising" nor
  // "advertisement", and "anuncio" misses "anuncios". Every healthy Romance
  // and Slavic marketplace route would have been reported WRONG_ACTION and,
  // applied, deleted. 74 of them were, before this was found.
  const cases = [
    ['post-advertisement', 'Vender Carro Usado ou Seminovo - Anuncie na Webmotors'],
    ['post-advertisement', 'Advertising options and rate card'],
    ['publish-classified', 'Revolico - Anuncios clasificados en Cuba'],
    ['publish-classified', 'Ogłoszenia motoryzacyjne'],
    ['create-seller-profile', 'Стать продавцом на площадке'],
  ];
  for (const [action, title] of cases) {
    assert.ok(H.STILL_OFFERS[action](title), `"${title}" did not satisfy ${action}`);
  }
  // And it is still discriminating: a stem list that matched everything would
  // be worse than no check.
  assert.ok(!H.STILL_OFFERS['create-seller-profile']('Contact customer support'));
  assert.ok(!H.STILL_OFFERS['publish-classified']('My account settings'));
  assert.ok(!H.STILL_OFFERS.create('Our address is 5 Main Street'),
    'the stem "add" matched "address"');
});

// ── THE PRODUCT SURFACE ─────────────────────────────────────────────────────

test('an execution CTA is never built from an unsafe URL', () => {
  // Both the server renderer and the browser client assign href straight from
  // the row model, so the guard has to live in the model.
  for (const hostile of ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,<b>',
    'vbscript:msgbox', '//evil.test/x', 'file:///etc/passwd', 'java\tscript:alert(1)']) {
    assert.equal(E.safeExternalUrl(hostile), null, `${hostile} survived the guard`);
  }
  for (const safe of ['https://ok.test/sell', 'http://ok.test/x?a=1#b']) {
    assert.equal(E.safeExternalUrl(safe), safe);
  }
});

test('every route stored in the corpus survives the CTA guard', () => {
  const files = [
    ['data/business-directories/opportunities.json', ['submissionUrl', 'claimUrl']],
    ['data/marketplaces/marketplaces.json', ['sellerActionUrl']],
    ['data/media-pr-publishing/media-platforms.json',
      ['submissionUrl', 'pitchUrl', 'pressReleaseUrl', 'advertisingUrl']],
  ];
  let checked = 0;
  for (const [file, fields] of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
    const rows = Array.isArray(raw) ? raw : Object.values(raw).find(Array.isArray);
    for (const r of rows) {
      for (const f of fields) {
        if (!r[f]) continue;
        checked += 1;
        assert.equal(E.safeExternalUrl(r[f]), r[f], `${r.id}.${f} would be dropped by the CTA guard`);
      }
    }
  }
  assert.ok(checked > 200, `only ${checked} routes checked`);
});

test('a READY row without a route shows no execution link', () => {
  // READY and the UI must agree. A CTA with nothing behind it is worse than no
  // CTA: it looks like the work is ready to start.
  const ops = P.project({
    directories: [],
    media: [],
    marketplaces: [{
      id: 'mp-x', name: 'X', website: 'https://x.test/', country: 'spain',
      marketplaceType: 'general-classifieds', sellerTypes: 'both', costModel: 'free',
      currentStatus: 'active', note: '', sellerAction: 'publish-classified',
    }],
  });
  const a = E.actionability(ops[0]);
  const row = E.worklistRow({ op: ops[0], x: { act: a } }, 'ready', (c) => c);
  const cta = row.cells.find((c) => c.action);
  assert.ok(cta, 'the row has no action cell at all');
  assert.equal(cta.url, null, 'a CTA link was rendered for a record with no route');
  assert.notEqual(a.status, 'READY', 'a record with no route reached READY');
});

test('the CTA label names the action, not a generic verb', () => {
  // "Start selling" and "Post an advertisement" are different promises, and the
  // ontology already distinguishes them. The label must not flatten that.
  const labels = new Set();
  for (const [key, meta] of Object.entries(E.ACTION_TYPES)) {
    if (key === 'investigate') continue;
    assert.ok(meta.label && meta.label.length > 3, `${key} has no usable label`);
    assert.ok(!/^(execute|go|open|click)$/i.test(meta.label), `${key} has a generic label`);
    labels.add(meta.label);
  }
  assert.equal(labels.size, Object.keys(E.ACTION_TYPES).length - 1,
    'two action types share a label, so the CTA cannot tell them apart');
});
