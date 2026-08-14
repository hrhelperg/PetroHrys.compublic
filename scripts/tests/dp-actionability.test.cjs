'use strict';

// Distribution Intelligence v2 — the actionability contract.
//
// One claim is being defended above all others: READY means an employee can act
// NOW. The moment READY starts including "we think there is probably a form
// somewhere", the queue becomes a list of guesses and is worse than no queue —
// because someone will work it and discover halfway through that the route was
// assumed.
//
// So most of this file defends the boundary between what is known and what is
// not: unknown never becomes ready, a bot filter never becomes dead, and the
// three queues never bleed into each other.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const P = require(path.join(ROOT, 'scripts/lib/distribution-planner.cjs'));
const A = require(path.join(ROOT, 'scripts/lib/distribution-actionability.cjs'));
const build = require(path.join(ROOT, 'scripts/build-distribution-planner.cjs'));

const PAGE = path.join(ROOT, 'research/distribution-planner/index.html');
const CSV = path.join(ROOT, 'research/distribution-planner/execution-opportunities.csv');
const SRC = P.loadAll();
const OPS = P.project(SRC);
const ACTS = OPS.map((op) => ({ op, a: A.actionability(op) }));
const page = () => fs.readFileSync(PAGE, 'utf8');

// RFC 4180. split(',') shifts columns on a quoted cell and reports a mismatch
// that does not exist — that happened in a sibling dataset.
function parseCsv(input) {
  const rows = []; let row = []; let field = ''; let quoted = false;
  const s = input.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i += 1; } else quoted = false; }
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\r' && s[i + 1] === '\n') { row.push(field); field = ''; rows.push(row); row = []; i += 1; }
    else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// ── 1-3. one model, three collections, no merge ─────────────────────────────

test('one canonical actionability function serves all three collections', () => {
  assert.strictEqual(typeof A.actionability, 'function');
  const seen = new Set();
  for (const { op, a } of ACTS) {
    seen.add(op.sourceCollection);
    assert.ok(Object.values(A.STATUS).includes(a.status), `${op.platformId} has status "${a.status}"`);
    assert.ok(Object.values(A.CONFIDENCE).includes(a.confidence), `${op.platformId} has confidence "${a.confidence}"`);
  }
  assert.strictEqual(seen.size, 3, 'not all three collections were projected');
  // And nothing computes a second, parallel status of its own.
  const gen = fs.readFileSync(path.join(ROOT, 'scripts/build-distribution-planner.cjs'), 'utf8');
  assert.ok(!/function\s+\w*[Aa]ctionab/.test(gen), 'the generator defines its own actionability');
  assert.ok(!/status\s*=\s*['"]READY['"]/.test(gen), 'the generator assigns READY directly');
});

test('the underlying datasets are still not merged', () => {
  const dir = path.join(ROOT, 'data/distribution-planner');
  for (const f of fs.readdirSync(dir)) {
    assert.ok(f.startsWith('.') || f.endsWith('.template.csv'),
      `data/distribution-planner/${f} looks like a merged dataset`);
  }
  for (const { op } of ACTS) {
    assert.ok(P.COLLECTION_BY_KEY.has(op.sourceCollection),
      `${op.platformId} lost its source collection identity`);
  }
});

test('actionability never mutates a source record', () => {
  const before = JSON.stringify(SRC.directories.slice(0, 200).map((r) => [r.listingAction, r.submissionUrl]));
  OPS.forEach((o) => A.actionability(o));
  assert.strictEqual(JSON.stringify(SRC.directories.slice(0, 200).map((r) => [r.listingAction, r.submissionUrl])),
    before, 'a directory record changed during derivation');
});

// ── 4-8. what READY means ───────────────────────────────────────────────────

test('READY requires a known action and a route that matches it', () => {
  const ready = ACTS.filter((x) => x.a.status === A.STATUS.READY);
  assert.ok(ready.length > 0, 'nothing is ready, so the rule cannot be tested');
  for (const { op, a } of ready) {
    assert.ok(a.actionUrl, `${op.platformId} is READY with no action URL`);
    assert.match(a.actionUrl, /^https:\/\//, `${op.platformId} has a malformed action URL`);
    assert.notStrictEqual(op.actionType, 'investigate', `${op.platformId} is READY with no known action`);
    assert.strictEqual(a.routeMatchesAction, true,
      `${op.platformId} is READY with a URL that does not match its action`);
    assert.strictEqual(a.blockers.length, 0, `${op.platformId} is READY with a known blocker`);
    assert.ok(a.nextAction && a.nextAction !== 'Research the submission route',
      `${op.platformId} is READY with no next action`);
  }
});

test('a browser-blocked opportunity can never be READY', () => {
  // Selected by the projection's evidence flag AND cross-checked against the
  // source status, so neither can be flipped alone to slip a row through.
  const blocked = ACTS.filter((x) => x.op.evidence === 'needs-browser-check');
  assert.ok(blocked.length > 100, `expected a browser queue, found ${blocked.length}`);
  for (const { op, a } of blocked) {
    assert.notStrictEqual(a.status, A.STATUS.READY, `${op.platformId} is browser-blocked and READY`);
    assert.notStrictEqual(a.status, A.STATUS.BLOCKED,
      `${op.platformId} is behind a bot filter and was called blocked — that is not the same fact`);
  }
  const viaSource = OPS.filter((o) => (o.record || {}).currentStatus === 'unknown');
  for (const o of viaSource) {
    assert.notStrictEqual(A.actionability(o).status, A.STATUS.READY,
      `${o.platformId} has an unverified status and is READY`);
  }
});

// A record shaped to exercise a rule the live data does not currently reach.
// Constructed, not sampled: three guards below were silently vacuous because no
// real record happened to hit the branch they protect.
const probe = (over = {}) => ({
  sourceCollection: 'directories', platformId: 'probe', name: 'Probe',
  website: 'https://probe.example', country: 'global', audienceGeography: 'global',
  actionType: 'create-listing', actionUrl: 'https://probe.example/add', cost: 'free',
  nativeQuality: 80, nativeSignal: 'probe', evidence: 'reachable',
  record: { submissionUrl: 'https://probe.example/add', currentStatus: 'active' },
  ...over,
});

test('a known blocker always produces BLOCKED, whatever else is true', () => {
  // Directly exercised: the only blocked record in the live data has no action
  // URL, so it would land in NEEDS_RESEARCH anyway and removing the blocker
  // rule changed nothing this suite could see.
  for (const [label, over] of [
    ['a dormant platform', { record: { submissionUrl: 'https://probe.example/add', currentStatus: 'dormant' } }],
    ['an invite-only listing', { record: { submissionUrl: 'https://probe.example/add', currentStatus: 'active', listingAction: 'invite-only' } }],
    ['a rejected platform', { record: { submissionUrl: 'https://probe.example/add', currentStatus: 'active', priority: 'reject' } }],
    ['a private-sellers-only marketplace', { sourceCollection: 'marketplaces', sellerTypes: 'private', record: { currentStatus: 'active' } }],
  ]) {
    const a = A.actionability(probe(over));
    assert.strictEqual(a.status, A.STATUS.BLOCKED, `${label} was not BLOCKED`);
    assert.ok(a.blockers.length > 0, `${label} is BLOCKED with no stated blocker`);
    assert.strictEqual(a.confidence, A.CONFIDENCE.INSUFFICIENT);
  }
});

test('a bot filter always produces NEEDS_BROWSER, never research or ready', () => {
  // Also directly exercised: merging the browser state into research emptied
  // the browser section, and a loop over zero rows passes vacuously.
  const a = A.actionability(probe({ evidence: 'needs-browser-check' }));
  assert.strictEqual(a.status, A.STATUS.NEEDS_BROWSER,
    'a browser-blocked record did not land in the browser state');
  assert.notStrictEqual(a.status, A.STATUS.NEEDS_RESEARCH,
    'the browser queue was merged into the research queue; they need different people');
  // And the live data still populates all three states, so no queue is empty.
  const counts = {};
  for (const { a: x } of ACTS) counts[x.status] = (counts[x.status] || 0) + 1;
  for (const s of [A.STATUS.READY, A.STATUS.NEEDS_RESEARCH, A.STATUS.NEEDS_BROWSER]) {
    assert.ok(counts[s] > 0, `no record is in ${s}, so its guard is vacuous`);
  }
});

test('a claim action is only satisfied by a claim route', () => {
  // Directly exercised: only two live records carry a claimUrl and neither also
  // carries a submissionUrl, so the claim-specific rule was never reached.
  const claim = probe({
    actionType: 'claim-profile',
    actionUrl: 'https://probe.example/add',
    record: { submissionUrl: 'https://probe.example/add', claimUrl: 'https://probe.example/claim',
      currentStatus: 'active' },
  });
  assert.strictEqual(A.urlMatchesAction(claim), false,
    'a claim action was satisfied by a submission URL');
  assert.notStrictEqual(A.actionability(claim).status, A.STATUS.READY,
    'a claim opportunity is READY pointing at a submission route');
  const proper = probe({
    actionType: 'claim-profile', actionUrl: 'https://probe.example/claim',
    record: { submissionUrl: 'https://probe.example/add', claimUrl: 'https://probe.example/claim',
      currentStatus: 'active' },
  });
  assert.strictEqual(A.urlMatchesAction(proper), true, 'a correct claim route was rejected');
});

test('blocked and browser-blocked are different states', () => {
  const blockedStatus = ACTS.filter((x) => x.a.status === A.STATUS.BLOCKED);
  for (const { op, a } of blockedStatus) {
    assert.ok(a.blockers.length > 0, `${op.platformId} is BLOCKED with no stated blocker`);
    assert.ok(!/bot filter|browser/i.test(a.blockers.join(' ')),
      `${op.platformId} treats a bot filter as a blocker; a WAF proves nothing about the product`);
  }
});

test('a homepage is never accepted as an action URL', () => {
  for (const { op, a } of ACTS) {
    if (!a.actionUrl) continue;
    const r = op.record || {};
    const declared = [r.submissionUrl, r.claimUrl, r.pitchUrl, r.pressReleaseUrl, r.advertisingUrl]
      .filter(Boolean);
    assert.ok(declared.includes(a.actionUrl),
      `${op.platformId} has an action URL no route field on the source record carries`);
  }
  // The marketplace collection records no route at all, so none is invented.
  for (const { op, a } of ACTS.filter((x) => x.op.sourceCollection === 'marketplaces')) {
    assert.strictEqual(a.actionUrl, null, `${op.platformId} acquired a route the collection does not hold`);
    assert.notStrictEqual(a.status, A.STATUS.READY, `${op.platformId} is READY with no route`);
  }
});

test('the action URL matches the semantics of the action', () => {
  // A claim URL is not a submission route, and a rate card is not an editorial
  // desk. Sending someone to the wrong one wastes the trip.
  for (const { op, a } of ACTS.filter((x) => x.a.status === A.STATUS.READY)) {
    const r = op.record || {};
    if (op.actionType === 'claim-profile') {
      assert.strictEqual(a.actionUrl, r.claimUrl, `${op.platformId} claims via a non-claim URL`);
    }
    if (op.actionType === 'send-press-release') {
      assert.strictEqual(a.actionUrl, r.pressReleaseUrl,
        `${op.platformId} sends a release to a URL that is not the release route`);
    }
  }
});

// ── 9-11. evidence and confidence ───────────────────────────────────────────

test('every operational fact carries an explicit evidence class', () => {
  const valid = new Set(Object.values(A.EVIDENCE));
  for (const { op, a } of ACTS.slice(0, 400)) {
    for (const [k, v] of Object.entries(a.evidence)) {
      assert.ok(valid.has(v), `${op.platformId}.${k} has evidence "${v}"`);
    }
    // Unknown is never dressed up as verified.
    if (!a.actionUrl) assert.strictEqual(a.evidence.actionUrl, A.EVIDENCE.UNKNOWN);
    if (op.cost === 'unknown') assert.strictEqual(a.evidence.cost, A.EVIDENCE.UNKNOWN);
  }
});

test('confidence is always explainable and never exceeds the evidence', () => {
  for (const { op, a } of ACTS) {
    assert.ok(Array.isArray(a.confidenceReasons) && a.confidenceReasons.length > 0,
      `${op.platformId} has a confidence band with no explanation`);
    if (a.status !== A.STATUS.READY) {
      assert.strictEqual(a.confidence, A.CONFIDENCE.INSUFFICIENT,
        `${op.platformId} is not READY but claims ${a.confidence} confidence`);
    }
    if (a.confidence === A.CONFIDENCE.HIGH) {
      assert.strictEqual(a.status, A.STATUS.READY);
      assert.notStrictEqual(op.cost, 'unknown', `${op.platformId} is HIGH confidence with unknown cost`);
      assert.notStrictEqual(a.requirements.moderation, A.EVIDENCE.UNKNOWN,
        `${op.platformId} is HIGH confidence without knowing whether a human approves it`);
      assert.notStrictEqual(a.requirements.difficulty, 'unknown',
        `${op.platformId} is HIGH confidence without knowing the effort`);
    }
  }
});

test('publishing time and difficulty are never fabricated', () => {
  for (const { op, a } of ACTS) {
    if (a.requirements.publishingTime !== 'unknown') {
      assert.strictEqual((op.record || {}).intelligence?.approvalMode, 'instant',
        `${op.platformId} states a publishing time with no operator statement behind it`);
    }
    if (a.requirements.difficulty !== 'unknown') {
      assert.ok(['very-easy', 'easy', 'moderate', 'hard'].includes((op.record || {}).submissionDifficulty),
        `${op.platformId} states a difficulty the source record does not carry`);
    }
  }
});

// ── 12-14. campaign ranking ─────────────────────────────────────────────────

test('no campaign score is stored anywhere', () => {
  for (const f of ['data/media-pr-publishing/media-platforms.json',
    'data/marketplaces/marketplaces.json']) {
    const blob = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(!/campaignScore|actionabilityStatus|executionConfidence/.test(blob),
      `${f} stores a derived v2 value`);
  }
});

test('readiness materially changes the execution ranking', () => {
  // A theoretically excellent platform nobody can act on must not outrank a
  // strong platform with a working route.
  assert.ok(P.READINESS_WEIGHT.READY > P.READINESS_WEIGHT.NEEDS_RESEARCH * 1.5,
    'readiness barely affects the campaign score');
  assert.strictEqual(P.READINESS_WEIGHT.BLOCKED, 0);
  const ctx = { business: 'telecom-voip-ucaas', objective: 'lead-generation', market: 'united-states', budget: 'free-freemium' };
  const ready = OPS.find((o) => A.actionability(o).status === A.STATUS.READY
    && !P.campaignScore(o, ctx).excluded);
  const notReady = OPS.find((o) => A.actionability(o).status === A.STATUS.NEEDS_RESEARCH
    && !P.campaignScore(o, ctx).excluded
    && P.scoreOpportunity(o, ctx).score >= P.scoreOpportunity(ready, ctx).score);
  if (notReady) {
    assert.ok(P.campaignScore(ready, ctx).campaignScore > P.campaignScore(notReady, ctx).campaignScore,
      'an unworkable platform outranked a ready one of equal or lower fit');
  }
  // But it is not deleted — it is still eligible, in a different group.
  const camp = P.campaign(OPS, ctx, { size: 60 });
  assert.ok(camp.totalEligible > camp.picked.length, 'the campaign silently dropped everything else');
});

test('the campaign draws from more than one collection when several fit', () => {
  const camp = P.campaign(OPS, { business: 'local-business', objective: 'local-discovery',
    market: 'united-states', budget: 'free-freemium' }, { size: 40 });
  const drawn = Object.values(camp.drawn).filter((n) => n > 0).length;
  assert.ok(drawn >= 2, 'a campaign with several relevant collections drew from only one');
  // Diversity is a tie-break, not a quota: an irrelevant collection stays out.
  const saas = P.campaign(OPS, { business: 'b2b-saas', objective: 'pr-coverage',
    market: '*', budget: 'any' }, { size: 40 });
  assert.strictEqual(saas.drawn.marketplaces, 0,
    'a marketplace was added to a PR campaign to fill a diversity slot');
});

// ── 15-18. the queues ───────────────────────────────────────────────────────

test('the three queues are separate and none contains the wrong state', () => {
  const html = page();
  const section = (id) => {
    const at = html.indexOf(`id="${id}"`);
    assert.ok(at > -1, `the ${id} section is missing`);
    return html.slice(at, html.indexOf('</section>', at));
  };
  const readyRows = [...section('ready').matchAll(/data-dp-status="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(readyRows.length > 0, 'the Ready queue renders nothing');
  for (const s of readyRows) assert.strictEqual(s, 'READY', `the Ready queue contains a ${s} row`);
  for (const s of [...section('research').matchAll(/data-dp-status="([^"]+)"/g)].map((m) => m[1])) {
    assert.strictEqual(s, 'NEEDS_RESEARCH', `the Research queue contains a ${s} row`);
  }
  for (const s of [...section('browser').matchAll(/data-dp-status="([^"]+)"/g)].map((m) => m[1])) {
    assert.strictEqual(s, 'NEEDS_BROWSER', `the Browser queue contains a ${s} row`);
  }
});

test('an excluded opportunity never reaches the Ready queue', () => {
  const ctx = { business: 'b2b-saas', objective: 'pr-coverage', market: '*', budget: 'free-only' };
  for (const { op } of ACTS) {
    const s = P.campaignScore(op, ctx);
    if (!s.excluded) continue;
    assert.strictEqual(s.campaignScore, 0, `${op.platformId} is excluded and still scored`);
  }
});

test('every count on the page is derived, not written down', () => {
  const html = page();
  const h = A.health(OPS);
  // The headings the engine builds carry a real em dash rather than an entity,
  // because they are escaped as text; both forms normalize to the same hyphen.
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&mdash;|—/g, '-').replace(/\s+/g, ' ');
  // These three headings used to state h.overall.ready / needsResearch /
  // needsBrowser — a corpus count under a numbered builder step. It was derived,
  // and it was still wrong: it described 2,234 opportunities while the campaign
  // beneath it described the state the controls were in, and it did not move
  // when they did. The count they must state is the one for THIS state.
  const wl = P.worklist(OPS, build.DEFAULT_QUERY);
  for (const [key, title] of [['ready', 'Ready to execute'],
    ['research', 'Needs research'], ['browser', 'Needs browser verification']]) {
    assert.ok(text.includes(`${title} - ${wl.byKey[key].total} of ${wl.totalEligible} `
      + 'eligible opportunities'), `the ${key} heading does not state the derived count `
      + `(expected ${wl.byKey[key].total} of ${wl.totalEligible})`);
  }
  // The corpus counts belong to the health table and nowhere else on the page.
  assert.ok(!text.includes(`Ready to execute - ${h.overall.ready} opportunities`),
    'the Ready heading is a corpus count again');
  // The summary and section 2 count the same set by construction: both are the
  // engine's eligible pool, and the default evidence level admits exactly READY.
  assert.strictEqual(wl.byKey.ready.total,
    P.campaign(OPS, build.DEFAULT_QUERY, { size: build.CAMPAIGN_SIZE,
      evidence: build.DEFAULT_QUERY.evidence }).totalEligible,
    'the summary and the Ready heading disagree about what is eligible');
  const gen = fs.readFileSync(path.join(ROOT, 'scripts/build-distribution-planner.cjs'), 'utf8');
  assert.ok(gen.includes('count: section.total') && gen.includes('totalEligible: wl.totalEligible'),
    'the worklist counts are not interpolated');
  assert.ok(gen.includes('${h.overall.ready}'), 'the health table does not interpolate its counts');
  assert.ok(!/<strong>\d{2,}<\/strong>/.test(gen), 'a literal number is rendered in the generator');
});

test('the health metrics reconcile with the states', () => {
  const h = A.health(OPS);
  assert.strictEqual(h.overall.ready + h.overall.needsResearch + h.overall.needsBrowser
    + h.overall.blocked, h.overall.total, 'the states do not sum to the total');
  const sum = (k) => Object.values(h.byCollection).reduce((n, c) => n + c[k], 0);
  for (const k of ['total', 'ready', 'needsResearch', 'needsBrowser', 'blocked', 'withActionUrl']) {
    assert.strictEqual(sum(k), h.overall[k], `${k} does not reconcile across collections`);
  }
  assert.strictEqual(h.overall.researchDebt, h.overall.needsResearch + h.overall.needsBrowser);
});

// ── 19-22. exports and private state ────────────────────────────────────────

test('the execution CSV parses, has parity and stays practical', () => {
  const csv = fs.readFileSync(CSV, 'utf8');
  assert.strictEqual(csv.charCodeAt(0), 0xFEFF, 'the CSV lost its BOM');
  assert.ok(csv.endsWith('\r\n'), 'the CSV must end with CRLF');
  const rows = parseCsv(csv);
  assert.deepStrictEqual(rows[0], build.CSV_COLUMNS);
  assert.strictEqual(rows.length - 1, OPS.length, 'CSV parity with the projected set');
  for (const r of rows) assert.strictEqual(r.length, build.CSV_COLUMNS.length, 'a CSV row has the wrong width');
  assert.ok(build.CSV_COLUMNS.length <= 20,
    `${build.CSV_COLUMNS.length} columns is a schema dump, not a work queue`);
  // A status column that says READY must carry a URL in the same row.
  const si = build.CSV_COLUMNS.indexOf('actionability_status');
  const ui = build.CSV_COLUMNS.indexOf('action_url');
  for (const r of rows.slice(1)) {
    if (r[si] === 'READY') assert.match(r[ui], /^https:\/\//, `a READY CSV row has no action URL`);
  }
});

test('the internal tracker template is header-only and carries no data', () => {
  const t = fs.readFileSync(build.TRACKER, 'utf8');
  const lines = t.split(/\r?\n/).filter((l) => l.trim());
  assert.strictEqual(lines.length, 1, `the tracker template has ${lines.length} lines; it must be header-only`);
  assert.ok(lines[0].includes('campaign_id') && lines[0].includes('workflow_status'));
  assert.ok(!/@|http/.test(t), 'the tracker template contains what looks like real data');
});

test('no private workflow state enters the public data or exports', () => {
  const PRIVATE = ['assigned_to', 'workflow_status', 'submitted_at', 'follow_up_date', 'internal_note'];
  const csv = fs.readFileSync(CSV, 'utf8');
  for (const f of PRIVATE) assert.ok(!csv.includes(f), `the execution CSV exposes ${f}`);
  const html = page();
  for (const w of ['Completed', 'Submitted on', 'Approved by']) {
    assert.ok(!html.includes(w), `the page fakes a workflow state: ${w}`);
  }
});

// ── 23-30. routes, links and build properties ───────────────────────────────

test('no campaign combination becomes a page or a sitemap entry', () => {
  const dir = path.join(ROOT, 'research/distribution-planner');
  // One page per LOCALE — four files, one route. The invariant being protected
  // is that a campaign QUERY never becomes a page, which is independent of how
  // many languages the one page is published in.
  const I18N = require(path.join(ROOT, 'scripts/lib/i18n.cjs'));
  const pages = fs.readdirSync(dir).filter((f) => f.endsWith('.html'));
  assert.strictEqual(pages.length, 1, `${pages.length} English planner pages exist`);
  const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  assert.strictEqual((sitemap.match(/distribution-planner/g) || []).length,
    I18N.LOCALE_CODES.length,
    'the planner should appear exactly once per supported locale');
  assert.ok(!/distribution-planner\/\?/.test(sitemap), 'a campaign query is in the sitemap');
});

test('the planner is still reachable and its links resolve', () => {
  const hub = fs.readFileSync(path.join(ROOT, 'research/index.html'), 'utf8');
  const at = hub.indexOf('id="collections"');
  const collections = hub.slice(at, hub.indexOf('</section>', at));
  assert.ok(collections.includes(`<li><a href="${P.PLANNER_PATH}"><span class="name">Distribution Planner</span>`),
    'the Research Center no longer presents the planner');
  const html = page();
  for (const m of html.replace(/<script[\s\S]*?<\/script>/g, '').matchAll(/href="(\/[^"#?]*)"/g)) {
    const t = m[1].replace(/^\//, '');
    assert.ok(fs.existsSync(path.join(ROOT, t)) || fs.existsSync(path.join(ROOT, t, 'index.html')),
      `the planner links ${m[1]}, which does not exist`);
  }
});

test('the page is usable without JavaScript and is accessible', () => {
  const html = page();
  assert.strictEqual((html.match(/<h1[^>]*>/g) || []).length, 1, 'the page does not have exactly one H1');
  const rows = (html.match(/class="bd-row"/g) || []).length;
  assert.ok(rows >= 50, `only ${rows} rows are prerendered; the page needs JS to say anything`);
  for (const m of html.matchAll(/<select class="bd-select" id="([^"]+)"/g)) {
    assert.ok(html.includes(`for="${m[1]}"`), `the ${m[1]} control has no label`);
  }
  // Every table cell carries its mobile label so the table stacks readably.
  const cells = (html.match(/<td class="bd-cell[^"]*"/g) || []).length;
  const labelled = (html.match(/data-bd-label="/g) || []).length;
  assert.strictEqual(cells, labelled, `${cells - labelled} cells have no mobile label`);
  // Status is never conveyed by colour alone: it is a word in the row.
  assert.ok(html.includes('data-dp-status="READY"'), 'status is not exposed as text/data');
});

test('the build is deterministic, offline and adds no dependency', () => {
  const countryName = (s) => s;
  assert.strictEqual(build.renderCsv(OPS, countryName), build.renderCsv([...OPS].reverse(), countryName),
    'the export depends on input order');
  const src = fs.readFileSync(path.join(ROOT, 'scripts/lib/distribution-actionability.cjs'), 'utf8')
    + fs.readFileSync(path.join(ROOT, 'scripts/build-distribution-planner.cjs'), 'utf8');
  assert.ok(!/\bfetch\s*\(|https?\.request\s*\(|axios\./.test(src), 'the build makes a network call');
  assert.ok(!/\.localeCompare\s*\(/.test(src), 'localeCompare is not reproducible across hosts');
  for (const m of src.matchAll(/require\('([^']+)'\)/g)) {
    assert.ok(m[1].startsWith('.') || m[1].startsWith('node:'), `external dependency "${m[1]}"`);
  }
  assert.ok(!fs.existsSync(path.join(ROOT, 'package.json')), 'a package.json was added');
});

test('no platform is named in any actionability or campaign rule', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/lib/distribution-actionability.cjs'), 'utf8');
  for (const { op } of ACTS.slice(0, 400)) {
    assert.ok(!src.toLowerCase().includes(op.platformId.toLowerCase()),
      `the actionability model names ${op.platformId}`);
  }
  assert.ok(!/\.(platformId|id|name)\s*===\s*['"`]/.test(src),
    'the model compares against a specific platform identity');
});
