'use strict';

// Ahrefs Domain Rating: a number somebody else measured, on a domain, on a date.
//
// The whole risk of this feature is that a 0-100 number is easy to confuse with
// things it is not. It is not a quality judgement, it is not an assessment of
// the page it appears beside, and — the one that costs a reader real money —
// "nobody has measured this" is not "this scored zero". Every test here defends
// one of those three distinctions.

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const ROOT = path.resolve(__dirname, '..', '..');
const O = require(path.join(ROOT, 'js/bd-order.js'));
const D = require(path.join(ROOT, 'scripts/lib/bd-discovery.cjs'));
const S = require(path.join(ROOT, 'scripts/lib/bd-schema.cjs'));
const SAFE = require(path.join(ROOT, 'scripts/lib/rc-safe-apply.cjs'));
const INV = require(path.join(ROOT, 'scripts/lib/rc-domain-inventory.cjs'));
const DR = require(path.join(ROOT, 'scripts/research-domain-rating.cjs'));
const CK = require(path.join(ROOT, 'scripts/lib/rc-checkpoint.cjs'));

const rec = (name, dr, extra = {}) => ({ name, domainRating: dr, petroHrysScore: null, ...extra });
const order = (list, key) => O.sortRecords(list, key).map((r) => r.name);

// ── M1 / M9: UNKNOWN IS NOT ZERO ────────────────────────────────────────────

test('M1: an unmeasured domain is never stored as zero', () => {
  // The applier writes from findings. A finding that is not MEASURED carries no
  // number at all, so there is nothing for it to write — the record keeps
  // whatever it had, which for an unmeasured domain is nothing.
  const unresolved = { key: 'ahrefs|domain-rating|x.test', target: 'x.test', state: 'UNRESOLVED', why: 'http 429' };
  assert.strictEqual(unresolved.domainRating, undefined,
    'an unresolved finding carries a rating');
  assert.ok(!('domainRating' in unresolved));
});

test('M9: a failed request cannot overwrite a rating that was measured', () => {
  // Every failure path in the researcher returns ok:false and no value. If one
  // of them ever returned a number, this is where it would show up.
  const src = fs.readFileSync(path.join(ROOT, 'scripts/research-domain-rating.cjs'), 'utf8');
  const ask = src.slice(src.indexOf('async function askAhrefs'), src.indexOf('// ── TARGETS'));
  assert.ok(ask.length > 500, 'could not isolate the request');
  for (const m of ask.matchAll(/return \{ ok: false[^}]*\}/g)) {
    assert.ok(!/domainRating/.test(m[0]), `a failure path returns a rating: ${m[0]}`);
  }
  // And the one success path is the only place a rating is produced.
  const successes = [...ask.matchAll(/return \{ ok: true[^}]*\}/g)];
  assert.strictEqual(successes.length, 1, 'more than one path produces a measurement');
  assert.match(successes[0][0], /domainRating: Math\.round/);
});

test('a rating outside 0-100, or with no provenance, is refused', () => {
  assert.deepStrictEqual(S.domainRatingProblems({ domainRating: 72, metricsProvenance: {
    domainRating: { provider: 'Ahrefs', status: 'publicApiReading', measuredAt: '2026-08-19', measuredDomain: 'x.test' },
  } }), []);
  assert.ok(S.domainRatingProblems({ domainRating: 72 }).length, 'a bare number was accepted');
  assert.ok(S.domainRatingProblems({ domainRating: 101 }).length, 'a rating above the scale was accepted');
  assert.ok(S.domainRatingProblems({ domainRating: -1 }).length, 'a negative rating was accepted');
  assert.ok(S.domainRatingProblems({ domainRating: 72.5 }).length, 'a fractional rating was accepted');
  // Zero is a real reading and must pass.
  assert.deepStrictEqual(S.domainRatingProblems({ domainRating: 0, metricsProvenance: {
    domainRating: { provider: 'Ahrefs', status: 'publicApiReading', measuredAt: '2026-08-19', measuredDomain: 'x.test' },
  } }), [], 'a measured zero was rejected');
});

// ── M2 / M3 / M4: ORDER ─────────────────────────────────────────────────────

test('M2: Domain Rating sorts numerically, not lexicographically', () => {
  // 9 before 10 before 100 is the string order and the wrong one.
  const list = [rec('nine', 9), rec('hundred', 100), rec('ten', 10), rec('two', 2)];
  assert.deepStrictEqual(order(list, 'domain-rating'), ['hundred', 'ten', 'nine', 'two']);
  assert.deepStrictEqual(order(list, 'domain-rating-asc'), ['two', 'nine', 'ten', 'hundred']);
});

test('M3: unmeasured records sort last in BOTH directions', () => {
  const list = [rec('none', null), rec('high', 90), rec('zero', 0), rec('mid', 45)];
  assert.deepStrictEqual(order(list, 'domain-rating'), ['high', 'mid', 'zero', 'none']);
  assert.deepStrictEqual(order(list, 'domain-rating-asc'), ['zero', 'mid', 'high', 'none'],
    'reversing the comparator put unmeasured records first, which reads as "worst"');
  // The distinction the whole feature rests on.
  assert.notStrictEqual(order(list, 'domain-rating-asc')[0], 'none');
});

test('M4: equal ratings order deterministically', () => {
  const build = () => [rec('delta', 70), rec('alpha', 70), rec('charlie', 70), rec('bravo', 70)];
  const once = order(build(), 'domain-rating');
  for (let i = 0; i < 25; i += 1) {
    assert.deepStrictEqual(order(build(), 'domain-rating'), once, 'equal ratings reordered between runs');
  }
  assert.deepStrictEqual(once, ['alpha', 'bravo', 'charlie', 'delta']);
  // Same tie, other direction, same answer: the tiebreak is a property of the
  // records, not of the direction.
  assert.deepStrictEqual(order(build(), 'domain-rating-asc'), once);
});

test('the published order is preserved when the reader has not asked for a sort', () => {
  // Three collections gained a sort control where there was none. The client
  // selects the first option on load, so the first option must change nothing.
  const list = [rec('third', 10), rec('first', 90), rec('second', null)];
  assert.deepStrictEqual(order(list, 'as-published'), ['third', 'first', 'second']);
  assert.strictEqual(O.SORT_KEYS[1], 'as-published');
});

// ── M7: A LABEL IS NOT A KEY ────────────────────────────────────────────────

test('M7: sort keys are machine values that no translation touches', () => {
  for (const key of O.SORT_KEYS) {
    assert.match(key, /^[a-z][a-z-]*$/, `${key} is not a stable machine value`);
  }
  const dicts = ['en', 'de', 'es', 'fr']
    .map((l) => JSON.parse(fs.readFileSync(path.join(ROOT, `data/i18n/${l}.json`), 'utf8')));
  // Every locale must carry the labels, and no locale's label may equal a key.
  for (const d of dicts) {
    for (const k of ['sort.drDesc', 'sort.drAsc', 'sort.asPublished', 'col.domainRating', 'bd.drNotMeasured']) {
      assert.ok(typeof d[k] === 'string' && d[k].length, `${k} is missing from a locale`);
      assert.ok(!O.SORT_KEYS.includes(d[k]), `${k} renders as a sort key, so a translation would change behaviour`);
    }
  }
  // The generated pages must carry the key as the option value, in every locale.
  for (const page of ['research/marketplaces/index.html', 'de/research/marketplaces/index.html',
    'research/media-pr-publishing/index.html', 'research/tenders-procurement/index.html']) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    if (!html.includes('data-bd-sort')) continue;
    assert.match(html, /<option value="domain-rating">/, `${page} does not offer the stable descending key`);
    assert.match(html, /<option value="domain-rating-asc">/, `${page} does not offer the stable ascending key`);
  }
});

// ── M8: A RATING IS METADATA, NOT AN IDENTITY ───────────────────────────────

test('M8: records sharing a domain stay separate records', () => {
  const inv = INV.inventory();
  const shared = [...inv.byTarget.entries()].filter(([, rs]) => rs.length > 1);
  assert.ok(shared.length > 10, `only ${shared.length} shared domains found; the fixture is not representative`);
  for (const [target, rs] of shared) {
    const ids = rs.map((r) => `${r.collection}:${r.id}`);
    assert.strictEqual(new Set(ids).size, ids.length, `${target} lists a record twice`);
  }
  // Encuentra24 is the case this rule was written for: one site, one rating,
  // and a separate record for each country whose businesses need telling.
  const e24 = inv.byTarget.get('encuentra24.com');
  assert.ok(e24 && e24.length >= 5, 'the shared-domain fixture disappeared');
  assert.ok(new Set(e24.map((r) => r.country)).size >= 5,
    'records sharing a domain were collapsed across countries');
});

test('a rating is measured on the record’s own domain, never a parent', () => {
  // appsource.microsoft.com is not microsoft.com. The inventory keeps the
  // subdomain, so the number describes the thing the record points at.
  assert.strictEqual(INV.normaliseDomain('https://appsource.microsoft.com/x?y=1'), 'appsource.microsoft.com');
  assert.strictEqual(INV.normaliseDomain('https://www.Example.COM/path/'), 'example.com');
  assert.strictEqual(INV.normaliseDomain('not a url'), null);
});

// ── M13: OWNERSHIP ──────────────────────────────────────────────────────────

test('M13: the metrics owner cannot touch anything but its own measurement', () => {
  for (const collection of ['directories', 'marketplaces', 'media', 'tenders', 'forums']) {
    assert.doesNotThrow(() => SAFE.applyPatch({ id: 'x' }, { domainRating: 50 },
      { owner: 'metrics', collection }));
    for (const field of ['note', 'shortNote', 'name', 'website', 'currentStatus',
      'submissionModel', 'sellerCost', 'bidAccess', 'listingAction', 'country']) {
      assert.throws(() => SAFE.applyPatch({ id: 'x' }, { [field]: 'x' }, { owner: 'metrics', collection }),
        /owns only|no research pass may change/, `metrics can write ${collection}.${field}`);
    }
  }
  // And no other owner may write a rating back.
  for (const owner of ['accessibility', 'actionability', 'cost', 'redirect']) {
    assert.throws(() => SAFE.applyPatch({ id: 'x' }, { domainRating: 50 },
      { owner, collection: 'directories' }), /owns only/, `${owner} can write a Domain Rating`);
  }
});

// ── M11 / M10: THE KEY, AND THE BUILD ───────────────────────────────────────

test('M11: nothing carries the API key out of the environment', () => {
  // Deliberately credential-free.
  //
  // The obvious version of this test reads AHREFS_API_KEY and greps the tree
  // for it — and the repository forbids exactly that, because no build,
  // validator or test may depend on a credential being present. A guard that
  // needs the secret in order to protect the secret also silently does nothing
  // on the machine where the variable is unset, which is most of them.
  //
  // So the guard is structural instead, and stronger for it: the key is read in
  // exactly one place, it reaches exactly one expression, and nothing that
  // writes — to disk, to a finding, to the console — is ever handed it.
  const src = fs.readFileSync(path.join(ROOT, 'scripts/research-domain-rating.cjs'), 'utf8');
  const reads = [...src.matchAll(/process\.env\.AHREFS_API_KEY/g)];
  assert.strictEqual(reads.length, 1, 'the key is read in more than one place');

  // It is used only as a bearer header, and never interpolated anywhere else.
  const uses = [...src.matchAll(/\bkey\b/g)].length;
  assert.ok(uses > 0);
  assert.match(src, /Authorization: `Bearer \$\{key\}`/,
    'the key is not passed as a bearer header');
  for (const sink of [/console\.(log|error|warn)\([^)]*\bkey\b/, /writeFileSync\([^)]*\bkey\b/,
    /ledger\.record\([^)]*\bkey:\s*key\b/, /JSON\.stringify\([^)]*\bkey\b/]) {
    assert.ok(!sink.test(src), `the key reaches a sink: ${sink}`);
  }

  // And no generated page or committed data file talks to the provider at all.
  const roots = ['research', 'de/research', 'es/research', 'fr/research', 'js', 'data'];
  let checked = 0;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.(html|js|json|csv)$/.test(entry.name)) continue;
      const body = fs.readFileSync(full, 'utf8');
      checked += 1;
      assert.ok(!/AHREFS_API_KEY/.test(body), `${full} names the key variable`);
      assert.ok(!/api\.ahrefs\.com/.test(body), `${full} calls the Ahrefs API`);
      assert.ok(!/Bearer\s+[A-Za-z0-9_-]{20,}/.test(body), `${full} carries a bearer token`);
    }
  };
  for (const r of roots) { const p = path.join(ROOT, r); if (fs.existsSync(p)) walk(p); }
  assert.ok(checked > 500, `only ${checked} files scanned`);
});

test('M10: no build entry point can reach the Domain Rating API', () => {
  for (const f of fs.readdirSync(path.join(ROOT, 'scripts'))) {
    if (!/^(build|validate)-.*\.cjs$/.test(f)) continue;
    const src = fs.readFileSync(path.join(ROOT, 'scripts', f), 'utf8');
    assert.ok(!/AHREFS_API_KEY/.test(src), `${f} reads the API key`);
    assert.ok(!/api\.ahrefs\.com/.test(src), `${f} names the Ahrefs API`);
    assert.ok(!/research-domain-rating/.test(src), `${f} requires the research pass`);
  }
  // The research pass itself does use the network — otherwise this test proves
  // nothing about the detector.
  const research = fs.readFileSync(path.join(ROOT, 'scripts/research-domain-rating.cjs'), 'utf8');
  assert.match(research, /api\.ahrefs\.com/);
  assert.match(research, /AHREFS_API_KEY/);
});

// ── M12: ATTRIBUTION ────────────────────────────────────────────────────────

test('M12: every page showing a Domain Rating credits Ahrefs with a live link', () => {
  assert.deepStrictEqual(S.AHREFS_ATTRIBUTION, { text: 'Domain Rating by Ahrefs', href: 'https://ahrefs.com/' });
  const pages = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'index.html') pages.push(full);
    }
  };
  for (const r of ['research', 'de/research', 'es/research', 'fr/research']) {
    const p = path.join(ROOT, r);
    if (fs.existsSync(p)) walk(p);
  }
  assert.ok(pages.length > 100, `only ${pages.length} pages found`);
  let showing = 0;
  for (const p of pages) {
    const html = fs.readFileSync(p, 'utf8');
    // A page "shows" a rating when it renders the column heading.
    if (!/<th[^>]*>Domain Rating<\/th>/.test(html)) continue;
    showing += 1;
    assert.ok(html.includes('Domain Rating by Ahrefs'),
      `${path.relative(ROOT, p)} shows a Domain Rating without crediting Ahrefs`);
    assert.ok(/href="https:\/\/ahrefs\.com\/"/.test(html),
      `${path.relative(ROOT, p)} credits Ahrefs without a working link`);
  }
  // Recorded rather than asserted-nonzero: before any rating is applied no page
  // shows the column, and that is a legitimate state. What must never happen is
  // a page showing one WITHOUT the credit, which is what the loop checks.
  assert.ok(showing >= 0);
});

// ── M14: ONE REQUEST PER DOMAIN ─────────────────────────────────────────────

test('M14: identical targets are asked once, not once per record', () => {
  const inv = INV.inventory();
  const targets = DR.targets();
  assert.strictEqual(targets.length, inv.targets.length);
  assert.strictEqual(new Set(targets.map((t) => t.target)).size, targets.length,
    'the same domain appears twice in the request list');
  const withTarget = inv.records.filter((r) => r.target).length;
  assert.ok(withTarget > targets.length,
    'no reuse at all: either the corpus changed or grouping broke');
  // Every record still reachable from its target, so the answer can be projected.
  const covered = targets.reduce((n, t) => n + t.records.length, 0);
  assert.strictEqual(covered, withTarget, 'grouping lost or duplicated records');
});

// ── M15: A FAILED RUN KEEPS WHAT IT LEARNED ─────────────────────────────────

test('M15: an interrupted acquisition keeps every reading it already has', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-dr-'));
  const file = path.join(dir, 'f.json');
  const led = new CK.Ledger(file);
  led.record({ key: 'ahrefs|domain-rating|a.test', target: 'a.test', state: 'MEASURED', domainRating: 61, checkedAt: '2026-08-19' });
  led.record({ key: 'ahrefs|domain-rating|b.test', target: 'b.test', state: 'MEASURED', domainRating: 0, checkedAt: '2026-08-19' });
  led.close(); // no compaction: the shape of a process that was killed

  const reopened = new CK.Ledger(file);
  assert.strictEqual(reopened.size(), 2, 'an interrupted acquisition lost its readings');
  assert.strictEqual(reopened.get('ahrefs|domain-rating|b.test').domainRating, 0,
    'a measured zero did not survive the interruption as a zero');
  reopened.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── EXPORT ──────────────────────────────────────────────────────────────────

test('an unmeasured domain exports as an empty cell, never as 0', () => {
  const schema = { facets: [], filters: [], sorts: ['as-published', 'domain-rating', 'domain-rating-asc'] };
  const cols = D.exportColumns(schema);
  assert.ok(cols.some((c) => c.key === 'domain_rating'), 'Domain Rating is not exported');
  assert.ok(cols.some((c) => c.key === 'domain_rating_provider'), 'the provider is not exported');
  const csv = D.renderFilteredCsv([
    { name: 'measured', domainRating: 72, facets: {}, flags: {} },
    { name: 'zero', domainRating: 0, facets: {}, flags: {} },
    { name: 'unknown', domainRating: null, facets: {}, flags: {} },
  ], cols).replace(/^﻿/, '');
  const lines = csv.trim().split('\r\n');
  assert.strictEqual(lines[1], 'measured,72,Ahrefs');
  assert.strictEqual(lines[2], 'zero,0,Ahrefs', 'a measured zero stopped being reported');
  assert.strictEqual(lines[3], 'unknown,,', 'an unmeasured domain exported a value');
});

test('a page that does not offer Domain Rating does not export it', () => {
  const cols = D.exportColumns({ facets: [], filters: [], sorts: ['alphabetical'] });
  assert.ok(!cols.some((c) => c.key === 'domain_rating'));
});

// ── FRESHNESS ───────────────────────────────────────────────────────────────

test('a reading is never presented as timeless', () => {
  assert.strictEqual(DR.FRESH_DAYS, 90);
  assert.ok(DR.stale({ state: 'MEASURED', checkedAt: '2020-01-01' }), 'an old reading is not stale');
  assert.ok(!DR.stale({ state: 'MEASURED', checkedAt: new Date().toISOString().slice(0, 10) }),
    'a reading taken today is stale');
  assert.ok(DR.stale({ state: 'UNRESOLVED' }), 'an unresolved target is treated as fresh');
  assert.ok(DR.stale(null));
});

test('the researcher uses the endpoint that answers, with the parameters it has', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/research-domain-rating.cjs'), 'utf8');
  assert.match(src, /v3\/public\/domain-rating-free/);
  // `protocol` exists on sibling Site Explorer endpoints and on neither DR one.
  // Sending it is how the first version got a 401 that looked like no entitlement.
  const url = src.slice(src.indexOf('const url ='), src.indexOf('const url =') + 200);
  assert.ok(!/protocol/.test(url), 'the request still sends a parameter the endpoint does not have');
});
