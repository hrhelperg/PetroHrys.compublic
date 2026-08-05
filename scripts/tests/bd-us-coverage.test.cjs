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
  const codes = MANIFEST.jurisdictions.map((j) => j.jurisdictionCode);
  assert.strictEqual(new Set(codes).size, codes.length, 'a jurisdiction is listed twice');
  for (const j of MANIFEST.jurisdictions) {
    assert.strictEqual(S.iso3166_2Problem(j.jurisdictionCode), null, `${j.jurisdictionCode} is not a valid ISO 3166-2 code`);
    assert.ok(j.jurisdictionCode.startsWith('US-'), `${j.jurisdictionCode} is not a US subdivision`);
  }
});

test('the manifest carries the full Part 11 shape for every jurisdiction', () => {
  const REQUIRED = ['jurisdictionCode', 'stateName', 'kind', 'researchStatus', 'publicationStatus',
    'recordId', 'officialCandidateName', 'officialCandidateUrl', 'operator', 'blockerCode',
    'blockerSummary', 'lastResearched', 'nextAction'];
  const CODES = ['none', 'connection-blocked', 'waf-blocked', 'geo-blocked',
    'login-required-unverified', 'js-only-unverified', 'official-url-unresolved',
    'system-transition', 'manual-browser-check', 'other'];
  for (const j of MANIFEST.jurisdictions) {
    for (const key of REQUIRED) {
      assert.ok(key in j, `${j.jurisdictionCode || '(no code)'} is missing "${key}"`);
    }
    assert.ok(CODES.includes(j.blockerCode), `${j.jurisdictionCode} blockerCode "${j.blockerCode}" is not allowed`);
    assert.ok(['published', 'not-published'].includes(j.publicationStatus),
      `${j.jurisdictionCode} publicationStatus "${j.publicationStatus}"`);
    assert.ok(['approved', 'pending-manual-verification', 'deferred', 'rejected'].includes(j.researchStatus),
      `${j.jurisdictionCode} researchStatus "${j.researchStatus}"`);
    assert.match(j.lastResearched, /^\d{4}-\d{2}-\d{2}$/, `${j.jurisdictionCode} lastResearched`);
    // A published entry must resolve to a record; a pending one must not point
    // at a public page.
    if (j.publicationStatus === 'published') {
      assert.ok(j.recordId, `${j.jurisdictionCode} is published with no recordId`);
      assert.ok(PUBLISHED.has(j.jurisdictionCode), `${j.jurisdictionCode} recordId does not resolve`);
    } else {
      assert.strictEqual(j.recordId, null, `${j.jurisdictionCode} is pending but names a record`);
    }
  }
});

test('the manifest agrees with the records actually published', () => {
  for (const j of MANIFEST.jurisdictions) {
    const record = PUBLISHED.get(j.jurisdictionCode);
    if (j.publicationStatus === 'published') {
      assert.ok(record, `${j.jurisdictionCode} is marked published but no record exists`);
      assert.strictEqual(record.id, j.recordId, `${j.jurisdictionCode} points at the wrong record`);
      assert.strictEqual(record.website, j.officialCandidateUrl, `${j.jurisdictionCode} URL diverges from its record`);
    } else {
      assert.ok(!record, `${j.jurisdictionCode} is marked ${j.publicationStatus} but a record exists (${record && record.id})`);
    }
  }
  // And nothing published may be missing from the manifest.
  for (const code of PUBLISHED.keys()) {
    assert.ok(MANIFEST.jurisdictions.some((j) => j.jurisdictionCode === code),
      `${code} has a record but is absent from the manifest`);
  }
});

test('the manifest totals are arithmetic, not assertions', () => {
  const t = MANIFEST.totals;
  assert.strictEqual(t.states, states.length);
  assert.strictEqual(t.statesPublished, states.filter((j) => j.publicationStatus === 'published').length);
  assert.strictEqual(t.statesPending,
    states.filter((j) => j.publicationStatus !== 'published').length);
  assert.strictEqual(t.statesPublished + t.statesPending, t.states,
    'the state statuses do not sum to 50');
  assert.strictEqual(t.territoriesPublished, territories.filter((j) => j.publicationStatus === 'published').length);
});

test('every unpublished jurisdiction carries a usable backlog entry', () => {
  for (const j of MANIFEST.jurisdictions.filter((x) => x.publicationStatus !== 'published')) {
    assert.ok(j.blockerSummary && j.blockerSummary.length > 40,
      `${j.jurisdictionCode} has no substantive blocker recorded`);
    assert.ok(typeof j.nextAction === 'string' && j.nextAction.length > 30,
      `${j.jurisdictionCode} records no next action`);
    assert.ok(j.blockerCode && j.blockerCode !== 'none',
      `${j.jurisdictionCode} is unpublished with blockerCode "${j.blockerCode}"`);
    assert.ok(typeof j.lastResearched === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(j.lastResearched),
      `${j.jurisdictionCode} has no research date`);
    // A backlog entry needs either a verified candidate URL or an explicit
    // statement of why there is none. South Carolina and Virginia have only a
    // search-engine lead, which the research says must not be published as
    // verified — so it is recorded as a lead, never as the register's URL.
    if (j.status === 'pending-manual-verification') {
      if (j.officialCandidateUrl) {
        assert.match(j.officialCandidateUrl, /^https?:\/\//, `${j.jurisdictionCode} url is not a URL`);
        assert.ok(!j.unverifiedLead, `${j.jurisdictionCode} carries both a verified URL and an unverified lead`);
      } else {
        assert.ok(j.officialCandidateUrlNote && j.officialCandidateUrlNote.length > 20,
          `${j.jurisdictionCode} has no candidate URL and no explanation of why`);
      }
    }
  }
});

test('a record published without an observed search claims no access behaviour', () => {
  // The earlier rule — "nobody has watched the search behave, therefore no
  // publication" — withheld registers whose identity, operator and canonical
  // URL were all established from official documentation. It has been replaced:
  // identity and existence are verifiable separately from live behaviour. What
  // may never be published is an access CLAIM nobody has seen or found stated.
  //
  // Alabama and Mississippi are the two the rule was rewritten for. Alabama's
  // application accepts no connection at all; Mississippi's search screen
  // refuses automated clients. Both are published on Secretary of State
  // evidence, and both must be silent about fees, accounts and challenges.
  for (const code of ['US-AL', 'US-MS']) {
    const record = PUBLISHED.get(code);
    assert.ok(record, `${code} is not published, though official evidence establishes it`);
    const pa = record.publicAccess;
    assert.strictEqual(pa.freeToSearch, null,
      `${code} asserts freeToSearch ${pa.freeToSearch} for a search nobody has run`);
    assert.strictEqual(pa.loginRequired, null,
      `${code} asserts loginRequired ${pa.loginRequired} for a search nobody has run`);
    assert.strictEqual(pa.captcha, null,
      `${code} asserts captcha ${pa.captcha} for a search nobody has run`);
    assert.ok(['unknown', 'partially-open'].includes(pa.accessLevel),
      `${code} claims accessLevel "${pa.accessLevel}" without an observed search`);
    // And the page must tell the reader that, rather than leaving the silence
    // to be read as "open".
    assert.ok(record.cons.some((x) => /does not publish the terms|not stated on the official pages|cannot be established in advance/i.test(x)),
      `${code} leaves its unknown access position unexplained`);
  }
});

test('no published record asserts an access position the research did not establish', () => {
  // Every state published in this phase had at least one access field left
  // null. A later edit that quietly fills them in is the failure this guards.
  const SUB = [...PUBLISHED.values()].filter((r) => r.jurisdiction.type === 'state');
  const withUnknowns = SUB.filter((r) => r.publicAccess.freeToSearch === null
    || r.publicAccess.loginRequired === null || r.publicAccess.captcha === null);
  assert.ok(withUnknowns.length >= 10,
    `only ${withUnknowns.length} state records carry an unknown; the conservative rule is not being exercised`);
  for (const r of withUnknowns) {
    const pa = r.publicAccess;
    if (pa.freeToSearch === null) {
      const prose = [r.description, ...r.pros, ...r.cons, pa.notes || '']
        .join(' ')
        .split(/(?<=[.!?])\s+/)
        .filter((x) => !/\b(?:whether|not state|no official page|cannot be established|does not publish)\b/i.test(x))
        .join(' ');
      assert.ok(!/free of charge|freely searchable|free to search/i.test(prose),
        `${r.id} says searching is free while freeToSearch is null`);
    }
    assert.deepStrictEqual(S.accessContradictions(pa), [], `${r.id} access contradiction`);
  }
});

// --- the claim on the page --------------------------------------------------

test('the US page states coverage, derived and correct', () => {
  const covered = states.filter((j) => PUBLISHED.has(j.jurisdictionCode)).length;
  const pending = states.length - covered;
  const match = US_PAGE.match(/<p class="bd-coverage">([^<]+)<\/p>/);
  assert.ok(match, 'the US page publishes no coverage statement');
  const text = match[1];
  assert.ok(text.includes(`${covered} of ${states.length} states`),
    `the page says "${text}" but ${covered} of ${states.length} states are covered`);
  assert.ok(text.includes(`${pending} state`), `the page does not disclose the ${pending} pending states`);
});

test('nothing on the US page claims nationwide state coverage', () => {
  const covered = states.filter((j) => PUBLISHED.has(j.jurisdictionCode)).length;
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
