// scripts/tests/bd-us-coverage.test.cjs
'use strict';

// Coverage is the one claim on this section that a record count cannot support.
// 34 subnational United States records could be 34 states, or 31 states plus a
// federal district plus two territories, or two records for one state. These
// tests hold the manifest, the registry and the rendered page to one answer,
// and refuse any wording that implies more coverage than exists.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const S = require('../lib/bd-schema.cjs');
const c = require('../lib/bd-components.cjs');
const { loadRegistry } = require('../lib/bd-registry.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const MANIFEST = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'data/business-directories/united-states-jurisdiction-coverage.json'), 'utf8'));
const US_PAGE = fs.readFileSync(
  path.join(ROOT, 'research/business-directories/united-states/index.html'), 'utf8');

const PUBLISHED = new Map();
for (const r of loadRegistry().directories) {
  if (r.jurisdiction && r.jurisdiction.parentCountry === 'united-states') {
    PUBLISHED.set(r.jurisdiction.code, r);
  }
}
const states = MANIFEST.jurisdictions.filter((j) => j.kind === 'state');
const territories = MANIFEST.jurisdictions.filter((j) => j.kind === 'territory');

test('the manifest enumerates every US jurisdiction exactly once', () => {
  assert.strictEqual(states.length, 50, `manifest lists ${states.length} states`);
  assert.strictEqual(MANIFEST.jurisdictions.filter((j) => j.kind === 'federal-district').length, 1);
  assert.strictEqual(territories.length, 5, 'the five inhabited territories must all be listed');
  const codes = MANIFEST.jurisdictions.map((j) => j.code);
  assert.strictEqual(new Set(codes).size, codes.length, 'a jurisdiction is listed twice');
  for (const j of MANIFEST.jurisdictions) {
    assert.strictEqual(S.iso3166_2Problem(j.code), null, `${j.code} is not a valid ISO 3166-2 code`);
    assert.ok(j.code.startsWith('US-'), `${j.code} is not a US subdivision`);
  }
});

test('the manifest agrees with the records actually published', () => {
  for (const j of MANIFEST.jurisdictions) {
    const record = PUBLISHED.get(j.code);
    if (j.status === 'published') {
      assert.ok(record, `${j.code} is marked published but no record exists`);
      assert.strictEqual(record.id, j.recordId, `${j.code} points at the wrong record`);
      assert.strictEqual(record.website, j.url, `${j.code} URL diverges from its record`);
    } else {
      assert.ok(!record, `${j.code} is marked ${j.status} but a record exists (${record && record.id})`);
    }
  }
  // And nothing published may be missing from the manifest.
  for (const code of PUBLISHED.keys()) {
    assert.ok(MANIFEST.jurisdictions.some((j) => j.code === code),
      `${code} has a record but is absent from the manifest`);
  }
});

test('the manifest totals are arithmetic, not assertions', () => {
  const t = MANIFEST.totals;
  assert.strictEqual(t.states, states.length);
  assert.strictEqual(t.statesPublished, states.filter((j) => j.status === 'published').length);
  assert.strictEqual(t.statesPending,
    states.filter((j) => j.status === 'pending-manual-verification').length);
  assert.strictEqual(t.statesPublished + t.statesPending + t.statesNotResearched, t.states,
    'the state statuses do not sum to 50');
  assert.strictEqual(t.territoriesPublished, territories.filter((j) => j.status === 'published').length);
});

test('every unpublished jurisdiction carries a usable backlog entry', () => {
  for (const j of MANIFEST.jurisdictions.filter((x) => x.status !== 'published')) {
    assert.ok(j.blocker && j.blocker.length > 40,
      `${j.code} has no substantive blocker recorded`);
    assert.ok(Array.isArray(j.manualSteps) && j.manualSteps.length >= 3,
      `${j.code} has no manual verification steps`);
    assert.ok(Array.isArray(j.confirmed), `${j.code} does not say what is already confirmed`);
    assert.ok(Array.isArray(j.unknown) && j.unknown.length > 0,
      `${j.code} is unpublished but nothing is recorded as unknown`);
    // A backlog entry needs either a verified candidate URL or an explicit
    // statement of why there is none. South Carolina and Virginia have only a
    // search-engine lead, which the research says must not be published as
    // verified — so it is recorded as a lead, never as the register's URL.
    if (j.status === 'pending-manual-verification') {
      if (j.url) {
        assert.match(j.url, /^https?:\/\//, `${j.code} url is not a URL`);
        assert.ok(!j.unverifiedLead, `${j.code} carries both a verified URL and an unverified lead`);
      } else {
        assert.ok(j.urlNote && j.urlNote.length > 20,
          `${j.code} has no candidate URL and no explanation of why`);
      }
    }
  }
});

test('Alabama and Mississippi stay unpublished and stay documented', () => {
  for (const code of ['US-AL', 'US-MS']) {
    const j = MANIFEST.jurisdictions.find((x) => x.code === code);
    assert.ok(j, `${code} is missing from the manifest`);
    assert.strictEqual(j.status, 'pending-manual-verification',
      `${code} changed status without the official search behaviour being verified`);
    assert.ok(!PUBLISHED.has(code), `${code} was published`);
    assert.ok(j.unknown.includes('free to search') || j.unknown.includes('access level'),
      `${code} claims to know an access position nobody has observed`);
  }
});

// --- the claim on the page --------------------------------------------------

test('the US page states coverage, derived and correct', () => {
  const covered = states.filter((j) => PUBLISHED.has(j.code)).length;
  const pending = states.length - covered;
  const match = US_PAGE.match(/<p class="bd-coverage">([^<]+)<\/p>/);
  assert.ok(match, 'the US page publishes no coverage statement');
  const text = match[1];
  assert.ok(text.includes(`${covered} of ${states.length} states`),
    `the page says "${text}" but ${covered} of ${states.length} states are covered`);
  assert.ok(text.includes(`${pending} state`), `the page does not disclose the ${pending} pending states`);
});

test('nothing on the US page claims nationwide state coverage', () => {
  const covered = states.filter((j) => PUBLISHED.has(j.code)).length;
  if (covered === states.length) return; // the claim would be true; nothing to guard.
  for (const phrase of [/all 50 states/i, /every US state/i, /every state/i,
    /nationwide coverage/i, /complete state coverage/i, /all fifty states/i]) {
    assert.ok(!phrase.test(US_PAGE),
      `the US page claims complete coverage (${phrase}) while ${covered} of ${states.length} states are published`);
  }
  // The directory count must not be mistakable for a state count.
  const stat = US_PAGE.match(/<p class="bd-stat">([^<]+)<\/p>/);
  assert.ok(stat, 'the US page lost its directory count');
  assert.ok(!/state/i.test(stat[1]),
    `the directory count mentions states, which invites reading it as coverage: "${stat[1]}"`);
});

test('the coverage sentence tracks the data rather than a literal', () => {
  // Same component, a fabricated manifest: the sentence must move.
  const fake = { country: 'x', jurisdictions: [
    { code: 'US-AA', kind: 'state' }, { code: 'US-BB', kind: 'state' }, { code: 'US-CC', kind: 'state' }] };
  const none = c.coverageStatement(fake, new Set());
  const some = c.coverageStatement(fake, new Set(['US-AA', 'US-BB']));
  const all = c.coverageStatement(fake, new Set(['US-AA', 'US-BB', 'US-CC']));
  assert.match(none, /0 of 3 states; 3 states remain pending/);
  assert.match(some, /2 of 3 states; 1 state remains pending/);
  assert.match(all, /all 3 states/);
  assert.ok(!/pending/.test(all), 'full coverage still mentions pending jurisdictions');
  // A country with no manifest makes no claim at all.
  assert.strictEqual(c.coverageStatement(undefined, new Set()), '');
  assert.strictEqual(c.coverageStatement({ country: 'x', jurisdictions: [] }, new Set()), '');
});

test('no country without a manifest publishes a coverage claim', () => {
  const dir = path.join(ROOT, 'research/business-directories');
  const withManifest = fs.readdirSync(path.join(ROOT, 'data/business-directories'))
    .filter((f) => f.endsWith('-jurisdiction-coverage.json'))
    .map((f) => f.replace('-jurisdiction-coverage.json', ''));
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(dir, entry.name, 'index.html');
    if (!fs.existsSync(file)) continue;
    const html = fs.readFileSync(file, 'utf8');
    if (/bd-coverage/.test(html)) {
      assert.ok(withManifest.includes(entry.name),
        `${entry.name} publishes a coverage claim with no manifest behind it`);
    }
  }
});
