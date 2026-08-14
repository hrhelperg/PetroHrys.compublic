'use strict';

// The ways evidence lies, and the guards that catch them.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
//
// Every case below is a mistake that was actually made in this repository and
// caught by reading output rather than by a test. They are collected here so
// the second occurrence fails loudly instead of being noticed by luck.
//
//   belizedirectory.com PASSED an evidence check because its "domain for sale"
//   page names Belize and says "directory" — both signals came from the domain
//   string being auctioned, not from a business.
//
//   fr.avis-verifies.com was classified as a redirect AWAY from
//   avis-verifies.com, because the host comparison kept three labels.
//
//   Manta publishes "Claim My Listing" pointing at /add-your-company. Reading
//   either half alone records an action the operator never offered.
//
//   445 records sat at unknown behind a 403 for months. A 403 is a fact about a
//   web server and says nothing at all about whether a product exists.
//
// These are decision functions, deliberately pure and deliberately tested on
// synthetic observations: the network is not where this gets things wrong.

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '..', '..');
const V = require(path.join(ROOT, 'scripts/verify-blocked-listings.cjs'));
const A = require(path.join(ROOT, 'scripts/audit-redirects.cjs'));

const DIRECTORIES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/business-directories/opportunities.json'), 'utf8'));
const MARKETPLACES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/marketplaces/marketplaces.json'), 'utf8'));

const obs = (over = {}) => ({
  status: 200,
  finalUrl: 'https://example.test/',
  title: '',
  head: '',
  textLen: 5000,
  error: null,
  ...over,
});

// ── 1. A parked domain cannot authenticate itself ───────────────────────────

test('a domain for sale cannot pass evidence using the words in its own name', () => {
  // The exact page that got through: every signal is the domain string.
  const candidate = { id: 'bz-x', country: 'belize', website: 'https://www.belizedirectory.com/' };
  const page = obs({
    finalUrl: 'https://www.belizedirectory.com/',
    title: 'belizedirectory.com for sale | Spaceship.com',
    head: 'belizedirectory.com is for sale. Buy this domain at Spaceship.com.',
  });

  // The evidence test alone is fooled — which is the point. It is fooled
  // HONESTLY: the words really are on the page.
  const e = V.candidateEvidence(candidate, page);
  assert.ok(e.country && e.kind,
    'the evidence test is expected to match here; that is exactly why it cannot be the only gate');

  // The parking check is what stops it, and it must fire first.
  assert.ok(V.parkedReason(page), 'a "for sale" page was not recognised as parked');
});

test('parking is recognised generically, not by one vendor or one phrase', () => {
  // A named-vendor allowlist would be a list of the pages that happened to be
  // seen once. These are the shapes, not the sellers.
  const shapes = [
    'This domain is for sale. Enquire now.',
    'Buy this domain — HugeDomains.com',
    'Parked domain. Contact the registrar.',
    'The domain example.test may be for sale.',
    'Coming soon',
    'Under construction',
    'Apache2 Ubuntu Default Page: It works!',
  ];
  for (const head of shapes) {
    assert.ok(V.parkedReason(obs({ head, title: 'Example' })),
      `not recognised as a placeholder: ${JSON.stringify(head)}`);
  }
  // And a real directory is not swept up by it.
  assert.equal(V.parkedReason(obs({
    title: 'Zambia Yellow Pages',
    head: 'Find businesses across Zambia. Add your business to the directory.',
  })), null, 'a real directory was mistaken for a parked domain');
});

// ── 2. Domain family versus departure ───────────────────────────────────────

test('a subdomain is the same site, and a different registrable domain is not', () => {
  const same = [
    ['fr.avis-verifies.com', 'avis-verifies.com'],
    ['web2.cylex.de', 'cylex.de'],
    ['in.bookmyshow.com', 'www.bookmyshow.com'],
    ['global.craft.co', 'craft.co'],
  ];
  for (const [a, b] of same) {
    assert.equal(A.registrable(a), A.registrable(b),
      `${a} and ${b} were treated as different sites`);
  }

  // Two-level public suffixes must not collapse unrelated companies.
  const different = [
    ['hotfrog.co.uk', 'example.co.uk'],
    ['oneflare.com.au', 'airtasker.com.au'],
    ['cylex.be', 'cylex-belgie.be'],
  ];
  for (const [a, b] of different) {
    assert.notEqual(A.registrable(a), A.registrable(b),
      `${a} and ${b} were treated as the same site`);
  }
});

test('a geolocated hand-off is not recorded as a corporate event', () => {
  // The audit reports where the browser ENDED UP as `url`; the verifier calls
  // the same thing `finalUrl`. Two shapes, deliberately not unified here — the
  // test drives each function with the shape it actually receives.
  const landed = (url) => ({ url, title: '', head: '', textLen: 5000, mentions: [], error: null });
  const record = { website: 'https://www.ziprecruiter.com/', name: 'ZipRecruiter' };
  const verdict = A.classify(record, landed('https://www.ziprecruiter.ie/'), new Map());
  assert.equal(verdict.state, 'GEOLOCATED',
    'a generic domain handing off to a country domain was read as a business change');

  // The reverse direction is a real consolidation and must NOT be dismissed.
  const back = A.classify(
    { website: 'https://www.reklama5.mk/', name: 'Reklama5' },
    landed('https://reklama5.com/'), new Map(),
  );
  assert.equal(back.state, 'DOMAIN_MOVE',
    'a country domain consolidating onto .com was dismissed as geolocation');
});

// ── 3. One surviving product, one active record ─────────────────────────────

test('an acquired product does not stay active alongside the product that absorbed it', () => {
  // The identity key in both collections is country + host, not host: one
  // platform may legitimately hold one record per market it serves.
  const live = (r) => r.currentStatus === 'active' || r.currentStatus === 'unknown';
  const key = (r) => {
    try { return `${r.country}|${new URL(r.website).hostname.replace(/^www\./, '')}`; } catch { return null; }
  };
  for (const [label, rows] of [['directories', DIRECTORIES], ['marketplaces', MARKETPLACES]]) {
    const seen = new Map();
    for (const r of rows.filter(live)) {
      const k = key(r);
      if (!k) continue;
      assert.ok(!seen.has(k),
        `${label}: ${r.id} and ${seen.get(k)} are both live on ${k}`);
      seen.set(k, r.id);
    }
  }
});

test('every record consolidated into another names the survivor, and the survivor exists', () => {
  const byId = new Map([...DIRECTORIES, ...MARKETPLACES].map((r) => [r.id, r]));
  const consolidated = [...DIRECTORIES, ...MARKETPLACES]
    .filter((r) => r.currentStatus === 'redirected');
  assert.ok(consolidated.length > 0, 'no record records a resolved consolidation');

  for (const r of consolidated) {
    const named = /surviving record is ([a-z0-9-]+)/i.exec(r.note || '');
    assert.ok(named, `${r.id} is redirected but does not name what survived it`);
    const survivor = byId.get(named[1]);
    assert.ok(survivor, `${r.id} names ${named[1]} as its survivor, which does not exist`);
    assert.notEqual(survivor.currentStatus, 'redirected',
      `${r.id} points at ${named[1]}, which is itself redirected — a chain, not a resolution`);
  }
});

test('a redirect resolution is terminal: nothing audited is left undecided', () => {
  const auditFile = path.join(ROOT, 'data/business-directories/.redirect-audit.json');
  const { findings } = JSON.parse(fs.readFileSync(auditFile, 'utf8'));
  assert.ok(findings.length > 0, 'the redirect audit recorded nothing');
  for (const f of findings) {
    assert.notEqual(f.state, 'UNRESOLVED', `${f.id} was audited and left unresolved`);
    assert.ok(f.finalUrl, `${f.id} has no destination recorded`);
  }
});

// ── 4. HTTP status is not a verdict about a product ─────────────────────────

test('a 403 or a challenge never means dead', () => {
  const record = { website: 'https://example.test/', country: 'greece' };
  for (const page of [
    obs({ status: 403, title: 'Attention Required! | Cloudflare', head: 'Sorry, you have been blocked' }),
    obs({ status: 200, title: 'Just a moment...', head: 'Enable JavaScript and cookies to continue' }),
    obs({ status: 429, title: 'Too Many Requests', head: 'rate limited' }),
  ]) {
    const v = V.judge(record, page);
    assert.equal(v.verdict, 'blocked', `a protected response produced ${v.verdict}`);
    assert.notEqual(v.verdict, 'dead');
  }
});

test('a 200 alone does not establish what a site is', () => {
  const candidate = { id: 'x', country: 'greece', website: 'https://example.gr/' };

  // Alive, Greek, and an online shop. Alive is not the claim being made.
  const shop = obs({ finalUrl: 'https://example.gr/', title: 'Παπούτσια online', head: 'Καλάθι αγορών' });
  assert.equal(V.judge(candidate, shop).verdict, 'active', 'the page did render');
  assert.equal(V.candidateEvidence(candidate, shop).kind, false,
    'a live page was accepted as a directory without saying it is one');

  // A rendered application shell is not an answer either.
  assert.equal(V.judge(candidate, obs({ textLen: 120 })).verdict, 'inconclusive');
});

// ── 5. An action comes from words, never from a path ────────────────────────

test('an action is never inferred from the URL alone', () => {
  const record = { website: 'https://example.test/' };
  // Paths that look conclusive and prove nothing on their own.
  const page = obs({ finalUrl: 'https://example.test/' });
  const verdict = V.judge(record, page);
  assert.deepEqual(verdict.routes, {},
    'a route was recorded for a page with no anchors at all');

  // The Manta case: the words say claim, the path says add. Neither is recorded.
  const contradictory = V.judge(record, obs({
    finalUrl: 'https://example.test/',
    create: null,
    claim: { text: 'Claim My Listing', href: 'https://example.test/business-listings/add-your-company' },
  }));
  assert.equal(contradictory.routes.claim, undefined,
    'a route was recorded whose wording and path describe different actions');
});

test('every recorded route is backed by wording, and never equals the homepage', () => {
  const withRoutes = DIRECTORIES.filter((r) => r.submissionUrl || r.claimUrl);
  assert.ok(withRoutes.length > 0, 'no record carries a route at all');
  for (const r of withRoutes) {
    const route = r.submissionUrl || r.claimUrl;
    assert.notEqual(route, r.website, `${r.id}: the route is the homepage, which is not a route`);
    assert.match(route, /^https:\/\//, `${r.id}: the route is not an absolute https URL`);
    assert.ok(['create', 'claim', 'create-and-claim', 'apply'].includes(r.listingAction),
      `${r.id} carries a route but its listingAction is ${r.listingAction}`);
  }
});

// ── 6. Notes may not contradict the record they describe ────────────────────

test('a record never claims a status its own note contradicts', () => {
  // Structured state is the canonical fact. A note left over from an earlier
  // pass is a procedural leftover, and 35 records once carried one — active,
  // while still asking for the check that would have established them.
  const asksForWork = /browser check is needed|could not be inspected|bot filter|bot challenge|no longer established/i;
  const rows = [...DIRECTORIES, ...MARKETPLACES];
  for (const r of rows) {
    if (r.currentStatus === 'active' || r.currentStatus === 'redirected') {
      assert.ok(!asksForWork.test(r.note || ''),
        `${r.id} is ${r.currentStatus} but its note still asks for the work that would settle it`);
    }
  }
  // The converse: an unresolved record must say what is outstanding.
  for (const r of rows.filter((x) => x.currentStatus === 'unknown')) {
    assert.match(r.note || '', /browser check|could not be inspected|not established|uninspected/i,
      `${r.id} is unknown and does not say what remains unresolved`);
  }
});

test('note rewriting removes a class of sentence, not one memorised phrase', () => {
  // Fifteen phrasings existed; matching the commonest left 35 contradictions.
  const phrasings = [
    'A real directory. Live but behind a bot filter, so a browser check is needed. And more.',
    'A real directory. Served a bot challenge, so a browser check is needed before submitting.',
    'A real directory. Returns an authorisation gate, so a browser check is needed.',
    'A real directory. The product could not be inspected automatically.',
  ];
  for (const note of phrasings) {
    const out = V.rewriteNote(note, 'Checked in a browser: it loads.');
    assert.ok(!/bot filter|bot challenge|browser check|could not be inspected|authorisation gate/i.test(out),
      `a stale clause survived rewriting: ${JSON.stringify(out)}`);
    assert.ok(out.includes('A real directory.'), 'rewriting deleted the human research as well');
    assert.ok(out.endsWith('Checked in a browser: it loads.'), 'the new finding was not appended');
  }
});
