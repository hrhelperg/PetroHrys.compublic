'use strict';

// The mutation contract every research pass writes through.
//
// Each test below corresponds to a way canonical data was actually damaged in
// this repository. None of them was caught by a test at the time; all of them
// were caught by a person reading output, which is not a control.

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '..', '..');
const SAFE = require(path.join(ROOT, 'scripts/lib/rc-safe-apply.cjs'));

const DIRECTORIES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/business-directories/opportunities.json'), 'utf8'));
const MARKETPLACES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/marketplaces/marketplaces.json'), 'utf8'));
const MEDIA = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/media-pr-publishing/media-platforms.json'), 'utf8'));
const TENDERS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/tenders-procurement/platforms.json'), 'utf8'));

// ── FIELD OWNERSHIP ─────────────────────────────────────────────────────────

test('a pass cannot write a field it does not own', () => {
  const record = { id: 'x', name: 'Real Name', note: 'Human research.' };

  // The Media pass overwrote 62 curated descriptions. Under the contract that
  // is not a bug to notice afterwards; it does not compile.
  assert.throws(
    () => SAFE.applyPatch(record, { name: 'Rewritten By A Script' },
      { owner: 'accessibility', collection: 'directories' }),
    /owns only/,
  );
  assert.equal(record.name, 'Real Name', 'the refused write still landed');

  // And some fields are nobody's, whatever a pass claims.
  for (const field of ['id', 'country', 'category', 'priority']) {
    assert.throws(
      () => SAFE.applyPatch(record, { [field]: 'anything' },
        { owner: 'redirect', collection: 'directories' }),
      /no research pass may change|owns only/,
      `${field} was writable`,
    );
  }
});

test('accessibility and actionability are separate facts and cannot restate each other', () => {
  const record = { id: 'x', currentStatus: 'unknown', listingAction: 'unknown' };

  // "The site is alive" and "here is how to list on it" are different claims.
  // A pass that establishes one may not silently assert the other.
  assert.throws(
    () => SAFE.applyPatch(record, { currentStatus: 'active' },
      { owner: 'actionability', collection: 'directories' }),
    /owns only/,
  );
  assert.throws(
    () => SAFE.applyPatch(record, { listingAction: 'create' },
      { owner: 'accessibility', collection: 'directories' }),
    /owns only/,
  );
  assert.equal(record.currentStatus, 'unknown');
  assert.equal(record.listingAction, 'unknown');
});

test('a patch reports only what actually changed', () => {
  const record = { id: 'x', currentStatus: 'active', note: 'n' };
  assert.deepEqual(
    SAFE.applyPatch(record, { currentStatus: 'active' }, { owner: 'accessibility', collection: 'directories' }),
    [], 'an unchanged value was reported as a write',
  );
});

// ── IDEMPOTENCE ─────────────────────────────────────────────────────────────

test('applying the same result twice produces byte-identical notes', () => {
  const human = 'A national directory covering the whole market.';
  const first = SAFE.amendNote(human, 'the site loads and serves its own content.',
    { owner: 'accessibility', date: '2026-08-14' });
  const second = SAFE.amendNote(first, 'the site loads and serves its own content.',
    { owner: 'accessibility', date: '2026-08-14' });
  assert.equal(second, first);
  assert.equal((first.match(/\[accessibility:/g) || []).length, 1);
});

test('no note in the corpus carries the same owner twice', () => {
  // The failure this catches produced fifteen records saying the same thing
  // twice, and would have produced sixteen on the next run.
  for (const [label, rows, fields] of [
    ['directories', DIRECTORIES, ['note']],
    ['marketplaces', MARKETPLACES, ['note']],
    ['media', MEDIA, ['shortNote', 'limitations']],
  ]) {
    for (const r of rows) {
      for (const field of fields) {
        const text = String(r[field] || '');
        for (const owner of ['accessibility', 'actionability', 'redirect']) {
          const hits = (text.match(new RegExp(`\\[${owner}:`, 'g')) || []).length;
          assert.ok(hits <= 1, `${label}/${r.id}.${field} carries ${hits} ${owner} sentences`);
        }
      }
    }
  }
});

test('a resolved redirect is not re-opened by a junior owner', () => {
  const settled = SAFE.amendNote('A directory.', 'the domain moved; the surviving record is a-b.',
    { owner: 'redirect', date: '2026-08-14' });
  assert.ok(SAFE.isSettledBy(settled, 'accessibility'),
    'an accessibility pass would still claim this needs resolving');
  assert.ok(SAFE.isSettledBy(settled, 'actionability'));
  assert.ok(!SAFE.isSettledBy('A directory.', 'accessibility'),
    'an unresolved record was reported as settled');
});

// ── DELETION FIREWALL ───────────────────────────────────────────────────────

test('a classifier cannot delete a canonical record', () => {
  const before = [{ id: 'md-healthcare-it-news' }, { id: 'md-phocuswire' }, { id: 'md-keep' }];
  const after = [{ id: 'md-keep' }];

  // Both of these are real publications that an ontology classifier removed.
  assert.throws(() => SAFE.assertNoDeletion(before, after), /no removal decision/);

  // A recommendation is not a decision.
  assert.throws(
    () => SAFE.assertNoDeletion(before, after, [
      { id: 'md-healthcare-it-news', state: 'ONTOLOGY_UNCONFIRMED', evidence: 'looked like an agency to me' },
      { id: 'md-phocuswire', state: 'ONTOLOGY_UNCONFIRMED', evidence: 'looked like an agency to me' },
    ]),
    /not a removal decision/,
  );

  // A decision without evidence is not a decision either.
  assert.throws(
    () => SAFE.assertNoDeletion(before, after, [
      { id: 'md-healthcare-it-news', state: 'CONFIRMED_DUPLICATE', evidence: 'dup' },
      { id: 'md-phocuswire', state: 'CONFIRMED_CLOSED', evidence: 'gone' },
    ]),
    /no evidence recorded/,
  );

  // With both, removal is allowed.
  assert.deepEqual(
    SAFE.assertNoDeletion(before, after, [
      { id: 'md-healthcare-it-news', state: 'CONFIRMED_DUPLICATE', evidence: 'the same publication is already recorded as md-other, same host and country' },
      { id: 'md-phocuswire', state: 'CONFIRMED_CLOSED', evidence: 'the publisher announced closure on the site on 2026-01-01' },
    ]).sort(),
    ['md-healthcare-it-news', 'md-phocuswire'],
  );
});

test('the two publications a classifier removed are still in the corpus', () => {
  for (const id of ['md-healthcare-it-news', 'md-phocuswire']) {
    assert.ok(MEDIA.some((r) => r.id === id), `${id} is missing`);
  }
});

// ── IDENTITY ────────────────────────────────────────────────────────────────

test('identity is country plus host, never host alone', () => {
  // Deduplicating findyello by host would have deleted Barbados's only
  // directory record. It nearly did.
  const barbados = { id: 'bb', country: 'barbados', website: 'https://www.findyello.com/barbados/' };
  const jamaica = { id: 'jm', country: 'jamaica', website: 'https://www.findyello.com/' };
  assert.notEqual(SAFE.identityKey('directories', barbados), SAFE.identityKey('directories', jamaica),
    'two countries on one host collapsed to one identity');

  // Same country, same host: that IS one product listed twice.
  const dupe = { id: 'jm2', country: 'jamaica', website: 'https://findyello.com/Jamaica/' };
  assert.equal(SAFE.identityKey('directories', jamaica), SAFE.identityKey('directories', dupe));
});

test('a multi-country family keeps one record per market it serves', () => {
  // Encuentra24 is the pattern: one domain, six countries, six records.
  const family = MARKETPLACES.filter((r) => /encuentra24/.test(r.id));
  assert.ok(family.length >= 6, `expected the multi-country family, found ${family.length}`);
  const keys = family.map((r) => SAFE.identityKey('marketplaces', r));
  assert.equal(new Set(keys).size, family.length,
    'a multi-country family collapsed into fewer identities than it has markets');
});

test('tender identity keeps distinct systems on one institutional domain apart', () => {
  // AIIB runs corporate procurement and project procurement as separate
  // systems; three UN agencies share one e-tendering vendor.
  const seen = new Map();
  for (const r of TENDERS) {
    if (r.currentStatus !== 'active') continue;
    const key = SAFE.identityKey('tenders', r);
    assert.ok(!seen.has(key), `${r.id} and ${seen.get(key)} collapsed onto ${key}`);
    seen.set(key, r.id);
  }
});

test('every live record across the corpus holds a distinct canonical identity', () => {
  for (const [label, rows] of [
    ['directories', DIRECTORIES], ['marketplaces', MARKETPLACES], ['media', MEDIA],
  ]) {
    const seen = new Map();
    for (const r of rows) {
      if (r.currentStatus !== 'active' && r.currentStatus !== 'unknown') continue;
      const key = SAFE.identityKey(label, r);
      assert.ok(!seen.has(key), `${label}: ${r.id} and ${seen.get(key)} share ${key}`);
      seen.set(key, r.id);
    }
  }
});

// ── DRIFT ───────────────────────────────────────────────────────────────────

test('curated fields are fingerprinted and drift is detectable', () => {
  const before = [{ id: 'a', name: 'Real', country: 'spain', note: 'x' }];
  const after = [{ id: 'a', name: 'Rewritten', country: 'spain', note: 'y' }];
  assert.deepEqual(SAFE.diffFingerprints(SAFE.curatedFingerprint(before), SAFE.curatedFingerprint(after)), ['a'],
    'a rewritten name was not detected');
  // A note change is not curated drift — that is what notes are for.
  const noteOnly = [{ id: 'a', name: 'Real', country: 'spain', note: 'different' }];
  assert.deepEqual(SAFE.diffFingerprints(SAFE.curatedFingerprint(before), SAFE.curatedFingerprint(noteOnly)), []);
});

test('the never-touch list wins even if an ownership list is widened by mistake', () => {
  // NEVER is defence in depth, and depth only counts if it holds when the
  // outer layer gives way. A mutation that disabled it survived the suite,
  // because every field in NEVER also happened to be outside every allowlist —
  // the guard was real but had no independent effect, and nothing said so.
  //
  // So it is checked against a deliberately widened contract: the shape a
  // careless future edit would produce.
  const widened = [...SAFE.OWNERSHIP.accessibility.directories, 'country'];
  const original = SAFE.OWNERSHIP.accessibility.directories;
  SAFE.OWNERSHIP.accessibility.directories = widened;
  try {
    const record = { id: 'x', country: 'spain' };
    assert.throws(
      () => SAFE.applyPatch(record, { country: 'portugal' },
        { owner: 'accessibility', collection: 'directories' }),
      /no research pass may change/,
      'a widened allowlist let a never-touch field through',
    );
    assert.equal(record.country, 'spain');
  } finally {
    SAFE.OWNERSHIP.accessibility.directories = original;
  }
});

test('no ownership list overlaps the never-touch list', () => {
  for (const [owner, byCollection] of Object.entries(SAFE.OWNERSHIP)) {
    for (const [collection, fields] of Object.entries(byCollection)) {
      for (const f of fields) {
        assert.ok(!SAFE.NEVER.has(f), `${owner}/${collection} claims "${f}", which nothing may write`);
      }
    }
  }
});

// ── REDIRECT REGRESSION ─────────────────────────────────────────────────────

test('every resolved acquisition and rebrand stays resolved', () => {
  // Thirty cases were audited and terminally classified. A later research pass
  // must not re-open one merely because an old URL appears in a legacy note.
  const byId = new Map([...DIRECTORIES, ...MARKETPLACES].map((r) => [r.id, r]));
  const RESOLVED = [
    { id: 'uk-applegate', expect: 'redirected', names: 'uk-businessmagnet' },
    { id: 'au-oneflare', expect: 'redirected', names: 'mp-au-airtasker' },
    { id: 'dk-eniro', expect: 'redirected', names: 'dk-krak' },
    { id: 'de-opendi', expect: 'redirected', names: 'de-stadtbranchenbuch' },
    { id: 'jm-jamaicayp', expect: 'redirected', names: 'jm-findyello' },
    { id: 'global-seedrs', expect: 'active', host: 'europe.republic.com' },
    { id: 'global-accesswire', expect: 'active', host: 'accessnewswire.com' },
    { id: 'bb-barbadosyp', expect: 'active', host: 'findyello.com' },
    { id: 'be-cylex', expect: 'active', host: 'cylex-belgie.be' },
    { id: 'mp-mk-reklama5', expect: 'active', host: 'reklama5.com' },
  ];

  for (const c of RESOLVED) {
    const r = byId.get(c.id);
    assert.ok(r, `${c.id} has vanished from the corpus`);
    assert.equal(r.currentStatus, c.expect, `${c.id} is ${r.currentStatus}, not ${c.expect}`);
    assert.ok(/\[redirect:/.test(r.note || ''), `${c.id} no longer carries its redirect resolution`);
    if (c.names) {
      assert.ok(String(r.note).includes(c.names), `${c.id} no longer names ${c.names} as its survivor`);
    }
    if (c.host) {
      assert.ok(new URL(r.website).hostname.endsWith(c.host),
        `${c.id} points at ${r.website}, not at ${c.host}`);
    }
    // And nothing may re-add a request to settle what is settled.
    assert.ok(!/a browser check is needed by a person to settle what this (entry|record) should point at/i.test(r.note || ''),
      `${c.id} was re-opened after being resolved`);
  }
});

test('a repointed record never keeps the route it had at its old address', () => {
  // A route is a path on a host. When the host changes, a route that still
  // points at the old one is a dead link the product would hand to a user.
  for (const r of [...DIRECTORIES, ...MARKETPLACES]) {
    if (!/\[redirect:/.test(r.note || '')) continue;
    for (const field of ['submissionUrl', 'claimUrl']) {
      if (!r[field]) continue;
      const routeHost = new URL(r[field]).hostname.replace(/^www\./, '');
      const siteHost = new URL(r.website).hostname.replace(/^www\./, '');
      assert.equal(SAFE.registrable(routeHost), SAFE.registrable(siteHost),
        `${r.id}: ${field} still points at ${routeHost} while the record moved to ${siteHost}`);
    }
  }
});
