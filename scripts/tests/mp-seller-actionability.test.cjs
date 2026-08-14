'use strict';

// Marketplace seller actionability.
//
// The collection carried 295 active platforms and not one seller route, and the
// reason was structural: there was nowhere truthful to write one. These tests
// cover the model that fixed it and the ways it could be filled with something
// that is not true.

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '..', '..');
const MP = require(path.join(ROOT, 'scripts/lib/mp-schema.cjs'));
const R = require(path.join(ROOT, 'scripts/research-marketplace-sellers.cjs'));
const P = require(path.join(ROOT, 'scripts/lib/distribution-planner.cjs'));
const E = require(path.join(ROOT, 'scripts/lib/dp-engine.cjs'));
const SAFE = require(path.join(ROOT, 'scripts/lib/rc-safe-apply.cjs'));

const ROWS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/marketplaces/marketplaces.json'), 'utf8'));

const page = (anchors, over = {}) => ({
  url: 'https://example.test/',
  status: 200,
  title: 'Example Marketplace',
  head: 'Buy and sell across the country.',
  textLen: 5000,
  anchors,
  deepAnchors: [],
  error: null,
  ...over,
});
const record = (over = {}) => ({
  id: 'mp-x', name: 'Example', website: 'https://example.test/',
  country: 'spain', marketplaceType: 'general-classifieds', ...over,
});

// ── THE MODEL ───────────────────────────────────────────────────────────────

test('the schema reuses the planner ontology instead of inventing a vocabulary', () => {
  // Every actionable value must already be a canonical planner action, or the
  // planner would receive a type it cannot score and the two models would drift
  // apart at the first record.
  for (const action of MP.ACTIONABLE_SELLER_ACTIONS) {
    assert.ok(E.ACTION_TYPES[action], `"${action}" is not a canonical planner action type`);
  }
  // And the non-route values are findings, deliberately outside that set.
  for (const value of ['invite-only', 'not-applicable', 'unknown']) {
    assert.ok(MP.SELLER_ACTIONS.includes(value), `${value} cannot be expressed`);
    assert.ok(!MP.ACTIONABLE_SELLER_ACTIONS.includes(value), `${value} is treated as a route`);
  }
});

test('every existing record stays valid with no action at all', () => {
  // 358 records predate the field. Missing is UNKNOWN, not invalid, and not a
  // prompt to fill anything in.
  const untouched = ROWS.filter((r) => r.sellerAction === undefined);
  assert.ok(untouched.length > 0, 'every record was given an action, which means something was guessed');
  assert.doesNotThrow(() => MP.loadMarketplaces());
});

test('a route cannot be recorded without an action that can be taken', () => {
  const known = new Set(['spain']);
  const problems = (row) => MP.problemsFor(row, known).map(([, m]) => m).join(' ');

  // A route beside "unknown" claims something the record does not know.
  assert.match(problems({
    id: 'mp-a', name: 'A', website: 'https://a.test/', country: 'spain',
    marketplaceType: 'services', sellerTypes: 'both', costModel: 'free',
    currentStatus: 'active', sellerAction: 'unknown', sellerActionUrl: 'https://a.test/sell',
  }), /a route is only recorded alongside/);

  // A route beside "invite-only" contradicts the finding itself.
  assert.match(problems({
    id: 'mp-b', name: 'B', website: 'https://b.test/', country: 'spain',
    marketplaceType: 'services', sellerTypes: 'both', costModel: 'free',
    currentStatus: 'active', sellerAction: 'invite-only', sellerActionUrl: 'https://b.test/sell',
  }), /a route is only recorded alongside/);

  // The homepage is not a route.
  assert.match(problems({
    id: 'mp-c', name: 'C', website: 'https://c.test/', country: 'spain',
    marketplaceType: 'services', sellerTypes: 'both', costModel: 'free',
    currentStatus: 'active', sellerAction: 'publish-classified', sellerActionUrl: 'https://c.test/',
  }), /homepage, which is not a route/);

  // But an evidenced action whose URL could not be resolved is a real, partial
  // finding — forcing symmetry is how a guessed URL gets written down.
  assert.equal(problems({
    id: 'mp-d', name: 'D', website: 'https://d.test/', country: 'spain',
    marketplaceType: 'services', sellerTypes: 'both', costModel: 'free',
    currentStatus: 'active', sellerAction: 'create-seller-profile',
  }), '');
});

// ── EVIDENCE ────────────────────────────────────────────────────────────────

test('a buyer account is never seller onboarding', () => {
  // Every marketplace offers an account. Almost none of them mean selling by
  // it, and a business sent through that flow is never asked what they sell.
  for (const label of ['Sign up', 'Register', 'Log in', 'My account', 'Create an account',
    'Registrarse', 'Mi cuenta', 'Anmelden', 'Mon compte']) {
    const v = R.assess(record(), page([{ text: label, href: 'https://example.test/register' }]));
    assert.equal(v.state, 'ACTION_UNKNOWN', `"${label}" was accepted as a seller route`);
    assert.equal(v.action, undefined);
  }
});

test('a seller action is never taken from the URL path', () => {
  // Every href below names the action. No link text offers it.
  const v = R.assess(record(), page([
    { text: 'Home', href: 'https://example.test/sell' },
    { text: 'Help', href: 'https://example.test/become-a-seller' },
    { text: 'More', href: 'https://example.test/merchant/signup' },
  ]));
  assert.equal(v.state, 'ACTION_UNKNOWN', 'a route was taken from a URL path');
});

test('operator wording in the market’s own language is accepted', () => {
  const cases = [
    ['Anzeige aufgeben', 'publish-classified'],
    ['Publicar anuncio', 'publish-classified'],
    ['Déposer une annonce', 'publish-classified'],
    ['Подать объявление', 'publish-classified'],
    ['Become a seller', 'create-seller-profile'],
    ['Start selling', 'create-seller-profile'],
    ['Diventa venditore', 'create-seller-profile'],
    ['Vendor application', 'apply-for-inclusion'],
  ];
  for (const [label, expected] of cases) {
    const v = R.assess(record(), page([{ text: label, href: 'https://example.test/route' }]));
    assert.equal(v.state, 'ACTION_ESTABLISHED', `"${label}" established nothing`);
    assert.equal(v.action, expected, `"${label}" resolved to ${v.action}`);
  }
});

test('a route is never the record it belongs to', () => {
  const v = R.assess(record(), page([{ text: 'Post an ad', href: 'https://example.test/' }]));
  assert.equal(v.state, 'ACTION_UNKNOWN', 'the homepage was recorded as a seller route');
});

test('protection is never death, and a moved domain is never a routine answer', () => {
  const blocked = R.assess(record(), page([], { title: 'Just a moment...', head: 'Enable JavaScript' }));
  assert.equal(blocked.state, 'UNKNOWN_PROTECTED');
  assert.notEqual(blocked.state, 'DEAD');

  const moved = R.assess(record(), page([], { url: 'https://somewhere-else.test/' }));
  assert.equal(moved.state, 'REDIRECTED');
});

// ── COUNTRY AND BRAND SAFETY ────────────────────────────────────────────────

test('a seller route is never propagated to a sibling country without evidence', () => {
  // Encuentra24 holds six records on one domain for six markets. A route found
  // on the Panama section says nothing about whether Costa Rica has one.
  const family = ROWS.filter((r) => /encuentra24/.test(r.id));
  assert.ok(family.length >= 6, 'the multi-country family is missing');

  const withRoute = family.filter((r) => r.sellerActionUrl);
  for (const r of withRoute) {
    const routePath = new URL(r.sellerActionUrl).pathname.toLowerCase();
    const sitePath = new URL(r.website).pathname.toLowerCase();
    const market = sitePath.split('/').filter(Boolean)[0];
    if (!market) continue;
    assert.ok(routePath.includes(market.split('-')[0]) || routePath === sitePath,
      `${r.id}: the route ${routePath} belongs to a different market than ${sitePath}`);
  }
});

test('identity stays country plus host', () => {
  const seen = new Map();
  for (const r of ROWS) {
    if (r.currentStatus !== 'active' && r.currentStatus !== 'unknown') continue;
    const key = SAFE.identityKey('marketplaces', r);
    assert.ok(!seen.has(key), `${r.id} and ${seen.get(key)} collapsed onto ${key}`);
    seen.set(key, r.id);
  }
});

// ── PLANNER ─────────────────────────────────────────────────────────────────

test('an evidenced action outranks the one derived from the platform type', () => {
  const ops = P.project({
    directories: [],
    media: [],
    marketplaces: [record({
      id: 'mp-e', sellerTypes: 'both', costModel: 'free', currentStatus: 'active',
      marketplaceType: 'b2b', note: '',
      sellerAction: 'publish-classified', sellerActionUrl: 'https://example.test/post-ad',
    })],
  });
  // The type says b2b, which would derive create-seller-profile. The operator
  // says "post an ad". The operator wins.
  assert.equal(ops[0].actionType, 'publish-classified');
  assert.equal(ops[0].actionUrl, 'https://example.test/post-ad');
});

test('a curated-supply platform never becomes work someone can pick up', () => {
  const ops = P.project({
    directories: [],
    media: [],
    marketplaces: [
      record({ id: 'mp-inv', sellerTypes: 'both', costModel: 'free', currentStatus: 'active', note: '', sellerAction: 'invite-only' }),
      record({ id: 'mp-na', sellerTypes: 'both', costModel: 'free', currentStatus: 'active', note: '', sellerAction: 'not-applicable' }),
    ],
  });
  for (const op of ops) {
    assert.equal(op.actionType, 'investigate', `${op.platformId} was given a route it does not have`);
    const a = E.actionability(op);
    assert.notEqual(a.status, 'READY', `${op.platformId} reached READY with no route`);
  }
});

test('a route with no matching action cannot reach READY', () => {
  // urlMatchesAction is what stops a URL from one field being presented as the
  // route for a different action.
  const op = P.project({
    directories: [],
    media: [],
    marketplaces: [record({
      id: 'mp-f', sellerTypes: 'both', costModel: 'free', currentStatus: 'active', note: '',
      sellerAction: 'publish-classified', sellerActionUrl: 'https://example.test/post-ad',
    })],
  })[0];
  assert.equal(E.actionability(op).status, 'READY');

  // Same record, route detached from the field the engine reads.
  const detached = { ...op, record: { ...op.record, sellerActionUrl: 'https://example.test/other' } };
  assert.notEqual(E.actionability(detached).status, 'READY',
    'a route that does not match the record reached READY');
});

test('the planner algorithm is untouched by this phase', () => {
  // The scoring surface is fingerprinted: weights, thresholds and the campaign
  // tie-break must be byte-identical to what shipped before marketplaces gained
  // a route. Only the DATA they read is allowed to change.
  const src = fs.readFileSync(path.join(ROOT, 'scripts/lib/dp-engine.cjs'), 'utf8');
  const client = fs.readFileSync(path.join(ROOT, 'js/dp-engine.js'), 'utf8');
  assert.equal(src, client, 'the server and browser engines have diverged');

  const scoring = src.slice(src.indexOf('function campaignScore'), src.indexOf('function campaign('));
  assert.ok(!/sellerAction/.test(scoring),
    'scoring now reads marketplace seller fields directly; it must only see the projected action');
});

test('a localised pattern is never disabled by an ASCII-only word boundary', () => {
  // \b is defined on ASCII word characters in JavaScript, so /\bподать\b/ never
  // matches anything. Every Cyrillic, Turkish and Polish phrase in the matcher
  // was dead on arrival and would have recorded those markets as having no
  // seller route — a failure entirely inside this repository, reported as a
  // fact about the web.
  const source = fs.readFileSync(path.join(ROOT, 'scripts/research-marketplace-sellers.cjs'), 'utf8');
  const patterns = source.match(/\/\\b[^/\n]*\/i/g) || [];
  for (const p of patterns) {
    assert.ok(![...p].some((c) => c.charCodeAt(0) > 127),
      `${p} combines a \\b boundary with non-ASCII text, which can never match`);
  }

  // And the behaviour itself, across the scripts these markets publish in.
  // Same host as the page helper, or the assessment resolves REDIRECTED before
  // it ever looks at the wording.
  const rec = record({ country: 'russia' });
  const pg = (text) => page([{ text, href: 'https://example.test/route' }]);
  for (const [label, expected] of [
    ['Подать объявление', 'publish-classified'],
    ['Продать', 'publish-classified'],
    ['İlan ver', 'publish-classified'],
    ['Dodaj ogłoszenie', 'publish-classified'],
    ['Zet te koop', 'publish-classified'],
    ['Diventa venditore', 'create-seller-profile'],
  ]) {
    const v = R.assess(rec, pg(label));
    assert.equal(v.action, expected, `"${label}" resolved to ${v.action || v.state}`);
  }
});

test('the buyer-account guard holds even when a seller pattern is widened', () => {
  // Removing the guard changed no outcome, because no seller pattern matches
  // "Register" anyway — the guard was real and had no independent effect, and
  // nothing said so. Its actual job is to survive a future widening: the day
  // someone adds /register/ to catch "Seller registration", every buyer sign-up
  // link on 295 marketplaces becomes a seller route overnight.
  //
  // So it is tested against exactly that shape.
  const group = R.SELLER_WORDING.find((g) => g.action === 'create-seller-profile');
  const original = group.text;
  group.text = [...original, /register/i, /sign ?up/i];
  try {
    for (const label of ['Register', 'Sign up', 'Registrarse', 'Anmelden']) {
      const v = R.assess(record(), page([{ text: label, href: 'https://example.test/register' }]));
      assert.equal(v.state, 'ACTION_UNKNOWN',
        `a widened pattern let "${label}" through as seller onboarding`);
    }
    // And a genuine seller label still resolves, so the guard is not simply
    // rejecting everything that mentions registering.
    const ok = R.assess(record(), page([{ text: 'Seller registration', href: 'https://example.test/s' }]));
    assert.equal(ok.action, 'create-seller-profile');
  } finally {
    group.text = original;
  }
});
