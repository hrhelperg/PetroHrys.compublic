'use strict';

// Wave L1 — Europe expansion.
//
// What this wave actually added is 145 Level 1 operational rows across the
// seventeen European countries, and the guards below protect the two things
// that went wrong while adding them.
//
// 1. A compromised domain. evropskadatabanka.cz answered 200 and looked like a
//    Czech B2B company database. It redirects offsite into an advertising blog.
//    A 200 is not evidence that a domain still hosts the product it is named
//    after, and the only defence is checking where it lands.
//
// 2. A comparator that was not a total order. Two records shared a country, a
//    priority and a display name (cylex.fr and cylex-france.fr, both "Cylex
//    France"), so the CSV row order fell through to input array order — which
//    is not a property of the data. The existing determinism test caught it
//    only because the collision happened to exist. A total order makes the
//    file reproducible whether or not one ever does.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const DATA = path.join(ROOT, 'data', 'business-directories');
const csv = require(path.join(ROOT, 'scripts/lib/bd-csv.cjs'));
const O = require(path.join(ROOT, 'scripts/lib/bd-opportunities.cjs'));

const COUNTRIES = new Set(JSON.parse(
  fs.readFileSync(path.join(DATA, 'countries.json'), 'utf8')).map((c) => c.slug));
const CATEGORIES = new Set(JSON.parse(
  fs.readFileSync(path.join(DATA, 'categories.json'), 'utf8')).map((c) => c.slug));

const DIR = path.join(DATA, 'directories');
const EDITORIAL = fs.readdirSync(DIR).filter((f) => f.endsWith('.json'))
  .flatMap((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')));
const ROWS = O.loadOpportunities(DATA, COUNTRIES, CATEGORIES);

const EUROPE = ['germany', 'france', 'united-kingdom', 'italy', 'spain', 'poland',
  'czech-republic', 'austria', 'netherlands', 'belgium', 'switzerland', 'denmark',
  'sweden', 'norway', 'finland', 'portugal', 'ireland'];

test('the CSV comparator is a total order', () => {
  const all = csv.actionableOpportunities(EDITORIAL, ROWS);
  const ties = [];
  for (let i = 1; i < all.length; i += 1) {
    if (csv.compareRecords(all[i - 1], all[i]) === 0) ties.push(`${all[i - 1].id} / ${all[i].id}`);
  }
  assert.deepStrictEqual(ties, [],
    'two rows compare equal, so their CSV order comes from input array order rather than from the data');
});

test('the comparator still separates records that share country, priority and name', () => {
  // The failure this replaces: without an id tiebreaker these returned 0.
  const a = { country: 'france', priority: 'P3', name: 'Cylex France', id: 'fr-cylex' };
  const b = { country: 'france', priority: 'P3', name: 'Cylex France', id: 'fr-cylex-france' };
  assert.ok(csv.compareRecords(a, b) < 0);
  assert.ok(csv.compareRecords(b, a) > 0);
  assert.strictEqual(csv.compareRecords(a, a), 0, 'a record must still equal itself');
});

test('no two listing opportunities in the same country share a display name', () => {
  // This guard exists because of what the total-order fix above TOOK AWAY.
  //
  // cylex.fr and cylex-france.fr were caught only by accident: they tied in the
  // sort, and the determinism test noticed the tie. Adding the id tiebreaker
  // made the comparator correct and, in the same stroke, made that collision
  // invisible. A sort property is not a duplicate detector, so the duplicate
  // rule needs a check of its own that does not depend on ordering at all.
  //
  // Two hosts under one brand in one country mean one submission, not two
  // opportunities. Different names on one host are fine, and so is one name
  // across different countries — that is what a country arm is.
  const S = require(path.join(ROOT, 'scripts/lib/bd-schema.cjs'));
  const key = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '');
  const seen = new Map();
  const clashes = [];
  for (const r of [...EDITORIAL, ...ROWS]) {
    if (S.isGovernmentPillar(r)) continue;
    const k = `${r.country}|${key(r.name)}`;
    if (seen.has(k)) clashes.push(`${seen.get(k)} / ${r.id} -> ${r.name} (${r.country})`);
    else seen.set(k, r.id);
  }
  assert.deepStrictEqual(clashes, [],
    'the same platform is listed twice in one country under two domains');
});

test('no two listing opportunities in the same country share a host', () => {
  // Two domains of one network in one country mean one submission, not two
  // opportunities. cylex.fr and cylex-france.fr were exactly this.
  //
  // Government records are exempt and must stay exempt: one authority routinely
  // publishes several genuinely distinct registers from a single domain — the
  // Czech telecoms regulator alone runs four — and each is its own source of
  // truth with its own search. That is not a duplicate submission path.
  const S = require(path.join(ROOT, 'scripts/lib/bd-schema.cjs'));
  const host = (u) => String(u).replace(/^https:\/\/(www\.)?/, '').split('/')[0].toLowerCase();
  const seen = new Map();
  const clashes = [];
  for (const r of [...EDITORIAL, ...ROWS]) {
    if (S.isGovernmentPillar(r)) continue;
    const key = `${r.country}|${host(r.website)}`;
    if (seen.has(key)) clashes.push(`${seen.get(key)} / ${r.id} -> ${host(r.website)}`);
    else seen.set(key, r.id);
  }
  assert.deepStrictEqual(clashes, []);
});

test('no row points at a domain known to have been repurposed', () => {
  // Each of these answered 200 during research and turned out to serve
  // something else entirely: an ad blog, a parking page, or a retailer.
  const REPURPOSED = [
    'evropskadatabanka.cz',   // 302 into an advertising blog
    'oferia.pl',              // redirects into leroymerlin.pl
    'katalogfirm.com.pl',     // now a general news site
    'firmy24.pl',             // domain parking
    'katalog-firm.biz.pl',    // domain parking
    'katalogfirem.cz',        // now sells gift vouchers
    'branchenbuch.at',        // for sale
    'gewerbeauskunft-zentrale.de', // for sale
    'businessdirectory.ie',   // for sale
    'aziendeitalia.it',       // a hosting company
    'paginesi.it',            // a web agency
  ];
  const websites = [...EDITORIAL, ...ROWS].map((r) => r.website.toLowerCase());
  for (const bad of REPURPOSED) {
    assert.ok(!websites.some((w) => w.includes(bad)),
      `${bad} no longer hosts the platform it is named after and must not be listed`);
  }
});

test('every European row carries the operational fields an employee needs', () => {
  const european = ROWS.filter((r) => EUROPE.includes(r.country));
  assert.ok(european.length >= 250, `expected a substantial European working list, got ${european.length}`);
  for (const r of european) {
    assert.ok(r.priority, `${r.id} has no priority`);
    assert.ok(r.currentStatus, `${r.id} has no currentStatus`);
    assert.ok(Array.isArray(r.audienceGeography) && r.audienceGeography.length,
      `${r.id} has no audienceGeography`);
    assert.match(r.website, /^https:\/\//, `${r.id} is not https`);
    assert.strictEqual(r.domainRating, null,
      `${r.id} carries a Domain Rating; rows never do`);
  }
});

test('a blocked platform is recorded as unknown, never as dead', () => {
  // A WAF answering 403 says the server is up and says nothing about the
  // product. Every row behind one is unknown with a note saying a browser check
  // is outstanding — none is marked dormant.
  //
  // The wording changed on 2026-08-14; the rule did not. That wave visited all
  // 445 pending rows in a real browser and rewrote each note with what it
  // found, so "bot filter" and "human-verification gate" no longer appear
  // anywhere: 227 rows resolved to active, and the 218 still unresolved now say
  // an automated check was refused and one by a person is needed. Matching the
  // retired words would quietly select nothing and assert nothing, so this keys
  // on the phrase that wave deliberately preserves — the same phrase the
  // marketplace and operations suites read.
  const blocked = ROWS.filter((r) => /browser check is needed/i.test(r.description || ''));
  assert.ok(blocked.length > 0, 'expected browser-pending rows');
  for (const r of blocked) {
    assert.strictEqual(r.currentStatus, 'unknown',
      `${r.id} is behind a bot filter, which is not evidence of its status either way`);
  }
});

test('all seventeen Wave L1 countries are represented', () => {
  const missing = EUROPE.filter((c) => ![...EDITORIAL, ...ROWS].some((r) => r.country === c));
  assert.deepStrictEqual(missing, []);
});
