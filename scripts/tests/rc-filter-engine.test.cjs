'use strict';

// The filter engine, and the ways it could get fast by getting wrong.
//
// The complaint that started this was that the second and third filters were
// painful. Measured, the engine was doing the same amount of work no matter how
// few rows matched: on the countries page every interaction read 2816
// attributes, wrote `hidden` on all 2816 rows whether or not it had changed,
// read it back 8448 times, re-sorted every record, and re-appended all 2816
// rows into the document. Narrowing to four rows bought nothing, so composing
// filters felt worse and worse against a shrinking result.
//
// The fix was to make the work proportional to what CHANGED. That is exactly
// the kind of optimisation that quietly breaks correctness, so most of what
// follows is about the engine still being right rather than still being fast.

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '..', '..');
const D = require(path.join(ROOT, 'scripts/lib/bd-discovery.cjs'));
const O = require(path.join(ROOT, 'js/bd-order.js'));

const CLIENT = fs.readFileSync(path.join(ROOT, 'js/business-directories.js'), 'utf8');
const SCHEMA = {
  facets: [{ name: 'country' }, { name: 'cost' }],
  filters: ['free'],
  sorts: ['default', 'domain-rating'],
  minDr: ['50'],
};
const sel = (state) => D.selectionFor(state, SCHEMA);

// ── THE ENGINE IS PURE AND BATCHED ─────────────────────────────────────────

test('the batch evaluator is a pure function of records and selection', () => {
  const records = [
    { haystack: 'alpha', facets: { country: 'de', cost: 'free' }, flags: { free: 'yes' } },
    { haystack: 'beta', facets: { country: 'fr', cost: 'paid' }, flags: { free: 'no' } },
  ];
  const before = JSON.stringify(records);
  const r = D.evaluateAll(records, sel({ facets: { country: 'de' }, flags: [] }));
  assert.deepEqual(r.visible, [true, false]);
  assert.equal(r.shown, 1);
  assert.equal(JSON.stringify(records), before, 'the engine must not mutate its input');
});

test('the engine never touches the DOM', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/lib/bd-discovery.cjs'), 'utf8');
  for (const dom of ['document', 'querySelector', 'getAttribute', 'appendChild', 'window.']) {
    assert.ok(!src.includes(dom), `the shared engine must not mention ${dom}`);
  }
});

// ── M: THE ENGINE SCANS THE DOM ON EVERY CHANGE ────────────────────────────

test('row data is read once at load, never per interaction', () => {
  // Everything the predicate reads is cached on the record when the page
  // loads, because none of it can change afterwards. The haystack is the
  // longest string on the row and was being fetched once per row per
  // keystroke.
  const record = CLIENT.slice(CLIENT.indexOf('function recordOf'), CLIENT.indexOf('// One entry per tbody'));
  for (const field of ['haystack', 'jurisdictionCode', 'groupKey']) {
    assert.ok(record.includes(`${field}:`), `${field} must be cached at load`);
  }
  // And the apply path must not re-read them.
  const apply = CLIENT.slice(CLIENT.indexOf('function apply()'), CLIENT.indexOf('// ── URL STATE'));
  assert.ok(!apply.includes("getAttribute('data-bd-haystack')"),
    'the haystack must not be re-read per interaction');
  assert.ok(!apply.includes('groupKeyOf(row)'),
    'the group key walks the tree and must not be recomputed per interaction');
});

test('a row is written only when its visibility changed', () => {
  const apply = CLIENT.slice(CLIENT.indexOf('function apply()'), CLIENT.indexOf('// ── URL STATE'));
  assert.match(apply, /if \(rec\.visible !== want\)/,
    'writing hidden on an already-hidden row costs style invalidation for nothing');
});

test('visibility is taken from the engine, never read back off the page', () => {
  const apply = CLIENT.slice(CLIENT.indexOf('function displayedRecords'), CLIENT.indexOf('// ── URL STATE'));
  assert.ok(!/\.row\.hidden(?!\s*=)/.test(apply.replace(/rec\.row\.hidden = /g, '')),
    'reading hidden back after writing it forces the browser to flush style');
  assert.match(CLIENT, /ordered\[i\]\.visible/, 'the cached verdict is the source of truth');
});

test('the table is re-ordered only when the order actually changed', () => {
  assert.match(CLIENT, /if \(key !== appliedSortKey\) \{ appliedSortKey = key; domDirty = true; \}/);
  assert.match(CLIENT, /if \(domDirty\) \{/);
  assert.match(CLIENT, /domDirty = false;/);
});

// ── M: FILTERS BECOME OR INSTEAD OF AND ────────────────────────────────────

test('filters compose with AND, and the second does not reset the first', () => {
  const records = [
    { haystack: '', facets: { country: 'de', cost: 'free' }, flags: {} },
    { haystack: '', facets: { country: 'de', cost: 'paid' }, flags: {} },
    { haystack: '', facets: { country: 'fr', cost: 'free' }, flags: {} },
  ];
  const one = D.evaluateAll(records, sel({ facets: { country: 'de' }, flags: [] }));
  assert.deepEqual(one.visible, [true, true, false]);
  // Adding the second narrows the first rather than replacing it.
  const two = D.evaluateAll(records, sel({ facets: { country: 'de', cost: 'free' }, flags: [] }));
  assert.deepEqual(two.visible, [true, false, false]);
  assert.equal(two.shown, 1);
  // If they were OR-composed this would be 3.
  assert.notEqual(two.shown, 3);
});

test('a five-way selection is still one AND', () => {
  const schema = {
    facets: [{ name: 'a' }, { name: 'b' }, { name: 'c' }, { name: 'd' }],
    filters: ['e'],
    sorts: [],
  };
  const rec = { haystack: '', facets: { a: '1', b: '2', c: '3', d: '4' }, flags: { e: 'yes' } };
  const all = D.selectionFor({ facets: { a: '1', b: '2', c: '3', d: '4' }, filters: ['e'] }, schema);
  assert.equal(D.evaluateAll([rec], all).shown, 1);
  // One wrong value in five removes it.
  const wrong = D.selectionFor({ facets: { a: '1', b: '2', c: 'x', d: '4' }, filters: ['e'] }, schema);
  assert.equal(D.evaluateAll([rec], wrong).shown, 0);
});

// ── M: UNKNOWN TREATED AS A POSITIVE MATCH ─────────────────────────────────

test('a positive filter matches only "yes", never "unknown"', () => {
  const records = [
    { haystack: '', facets: {}, flags: { free: 'yes' } },
    { haystack: '', facets: {}, flags: { free: 'no' } },
    { haystack: '', facets: {}, flags: { free: 'unknown' } },
  ];
  const r = D.evaluateAll(records, sel({ facets: {}, filters: ['free'] }));
  assert.deepEqual(r.visible, [true, false, false]);
  // And an unknown is hidden because it is unconfirmed, not because it is a
  // confirmed miss — the difference is counted and shown to the reader.
  assert.equal(r.unknownHidden, 1);
});

// ── M: DR 0 TREATED AS MISSING ─────────────────────────────────────────────

test('a measured 0 is a rating; an unmeasured record is not a 0', () => {
  const records = [
    { haystack: '', facets: {}, flags: {}, domainRating: 0 },
    { haystack: '', facets: {}, flags: {}, domainRating: null },
    { haystack: '', facets: {}, flags: {}, domainRating: 60 },
  ];
  // A floor of 50 keeps only the 60. The measured 0 fails the test on its
  // value; the unmeasured one cannot answer the question at all.
  const r = D.evaluateAll(records, sel({ facets: {}, flags: [], minDr: '50' }));
  assert.deepEqual(r.visible, [false, false, true]);

  // And in the ordering, an unmeasured record sorts LAST rather than lowest.
  const sorted = O.sortRecords(records.map((x, i) => ({ ...x, name: String(i) })), 'domain-rating');
  assert.deepEqual(sorted.map((x) => x.domainRating), [60, 0, null]);
});

// ── M: RESULT COUNT DIFFERS FROM VISIBLE ROWS ──────────────────────────────

test('the count and the verdicts are produced in one pass, so they cannot disagree', () => {
  const records = Array.from({ length: 50 }, (_, i) => ({
    haystack: '', facets: { country: i % 3 === 0 ? 'de' : 'fr' }, flags: {},
  }));
  const r = D.evaluateAll(records, sel({ facets: { country: 'de' }, flags: [] }));
  assert.equal(r.shown, r.visible.filter(Boolean).length);
  assert.equal(r.shown, 17);
});

// ── M: HIDDEN ROWS REMAIN IN THE CSV ───────────────────────────────────────

test('the export reads the same verdicts the table does', () => {
  // displayedRecords() is the single source for both the status line and the
  // export, and it filters on the engine's verdict.
  const fn = CLIENT.slice(CLIENT.indexOf('function displayedRecords'), CLIENT.indexOf('function apply()'));
  assert.match(fn, /if \(ordered\[i\]\.visible\) out\.push\(ordered\[i\]\)/);
  assert.match(CLIENT, /visible = displayedRecords\(\);/);
});

// ── M: DUPLICATE LISTENERS ACCUMULATE ──────────────────────────────────────

test('every control is bound exactly once', () => {
  const bindings = CLIENT.match(/addEventListener\('change', interact\)/g) || [];
  const seen = new Set();
  for (const line of CLIENT.split('\n')) {
    const m = /if \((\w+)\) \1\.addEventListener\('change', interact\)/.exec(line);
    if (m) {
      assert.ok(!seen.has(m[1]), `${m[1]} is bound more than once`);
      seen.add(m[1]);
    }
  }
  assert.ok(bindings.length >= 4, 'the controls must actually be bound');
  // Nothing rebinds inside the render path, which is how listeners multiply.
  const apply = CLIENT.slice(CLIENT.indexOf('function apply()'), CLIENT.indexOf('// ── URL STATE'));
  assert.ok(!apply.includes('addEventListener'), 'apply() must not bind listeners');
});

// ── M: REPEATED CHANGES ACCUMULATE WORK ────────────────────────────────────

test('nothing grows across interactions', () => {
  const apply = CLIENT.slice(CLIENT.indexOf('function apply()'), CLIENT.indexOf('// ── URL STATE'));
  // The record store is built once, outside apply(). A push inside the render
  // path is how a per-interaction leak starts.
  assert.ok(!/records\.push\(/.test(apply), 'the record store must not grow during a render');
  assert.ok(!/groups\.push\(/.test(apply));
});

// ── THE SHARED MODULE IS ACTUALLY SHARED ───────────────────────────────────

test('the browser and the tests run the same engine, byte for byte', () => {
  const browser = fs.readFileSync(path.join(ROOT, 'js/bd-discovery.js'), 'utf8');
  const node = fs.readFileSync(path.join(ROOT, 'scripts/lib/bd-discovery.cjs'), 'utf8');
  assert.equal(browser, node, 'the two copies of the engine have diverged');
});

test('there is one filter implementation for the worklists', () => {
  // Every Research Center worklist boots the same client and the same engine.
  // The Distribution Planner is the deliberate exception and is named here
  // rather than silently skipped: it renders its own tables from a 1.2 MB JSON
  // payload, its state lives in [data-dp-filter] controls, and this file's own
  // comments record why it must not adopt that page. Its performance is
  // measured separately.
  const OWN_ENGINE = new Set(['distribution-planner.js']);
  const clients = fs.readdirSync(path.join(ROOT, 'js'))
    .filter((f) => f.endsWith('.js') && f !== 'bd-discovery.js' && f !== 'bd-order.js');
  let checked = 0;
  for (const f of clients) {
    const src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
    if (!src.includes('data-bd-rows') || OWN_ENGINE.has(f)) continue;
    checked += 1;
    assert.ok(src.includes('BDDiscovery') || src.includes('bd-discovery'),
      `${f} filters rows without the shared engine`);
  }
  assert.ok(checked >= 1, 'the shared-engine cohort must not be empty');
});

// ── PERFORMANCE IS A PROPERTY OF THE SHAPE, NOT A MEASUREMENT ──────────────

test('the work is proportional to what changed, not to the table', () => {
  const apply = CLIENT.slice(CLIENT.indexOf('function apply()'), CLIENT.indexOf('// ── URL STATE'));
  // Three properties, each of which was false before and is what makes the
  // second and third filter cheap:
  //   the pure pass happens before any write
  assert.ok(apply.indexOf('D.evaluateAll(') < apply.indexOf('rec.row.hidden = !want'));
  //   only changed rows are written
  assert.match(apply, /if \(rec\.visible !== want\)/);
  //   only visible rows are placed, and only when the order is stale
  assert.match(apply, /if \(ordered\[i\]\.visible\) \{ frag\.appendChild/);
});
