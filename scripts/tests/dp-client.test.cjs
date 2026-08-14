'use strict';

// The Distribution Planner client — server/client parity, and the field contract
// that makes it possible.
//
// ── WHAT SHIPPED, AND WHY COUNTING WOULD NOT HAVE CAUGHT IT ─────────────────
//
// The planner had six controls and no client. Section 3 was rendered once at
// build time for one hardcoded query; the summary above it stated "United
// States" as a literal; the evidence control was decorative. A reader who chose
// United Kingdom got a United States campaign under a sentence claiming it was
// theirs, and every count on the page was internally consistent while being
// about the wrong market. So these tests compare IDENTITIES — which platforms,
// in which groups — never how many.
//
// The second failure mode is subtler and is the reason the browser is fed a
// PROJECTION rather than the full record: a payload missing one field the engine
// reads produces a page that scores every opportunity slightly differently and
// says nothing. The field contract below is derived by RECORDING every property
// access the engine makes over all 2,234 opportunities, so it cannot be
// maintained by hand and cannot fall behind the code.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const P = require(path.join(ROOT, 'scripts/lib/distribution-planner.cjs'));
const A = require(path.join(ROOT, 'scripts/lib/distribution-actionability.cjs'));
const BD = require(path.join(ROOT, 'scripts/lib/bd-schema.cjs'));
// The BROWSER copy, loaded exactly as the page loads it. Requiring the .cjs here
// would test the server module twice and prove nothing about what ships. It is a
// separate module instance by construction — same bytes, different file — which
// is why the identity checks below compare the server modules against the .cjs
// and the two files against each other, and never the two across the gap.
const E = require(path.join(ROOT, 'js/dp-engine.js'));
const SERVER_ENGINE = require(path.join(ROOT, 'scripts/lib/dp-engine.cjs'));

const SRC = P.loadAll();
const OPS = P.project(SRC);
// What the browser actually receives, read off disk rather than recomputed, so a
// generator that stops writing the file fails here.
const PAYLOAD = JSON.parse(read('research/distribution-planner/planner-data.json'));
const SLIM = PAYLOAD.opportunities;

const PAGE = read('research/distribution-planner/index.html');
const CLIENT = read('js/distribution-planner.js');

// ── THE BROWSER AND THE TESTS SHARE ONE IMPLEMENTATION ──────────────────────

test('the shipped engine and the tested engine are the same bytes', () => {
  assert.strictEqual(read('js/dp-engine.js'), read('scripts/lib/dp-engine.cjs'),
    'the shipped engine has drifted from the one the generator uses');
});

test('the engine is pure: it requires nothing and reaches no network', () => {
  const src = read('scripts/lib/dp-engine.cjs');
  assert.ok(!/\brequire\s*\(/.test(src), 'the engine requires a module and cannot run in a browser');
  assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|import\s*\(|process\.|__dirname/.test(src),
    'the engine reaches outside itself');
  assert.ok(!/\.localeCompare\s*\(/.test(src),
    'localeCompare would make the campaign depend on the reader ICU rather than the data');
});

test('there is one implementation: the server modules re-export it', () => {
  // Identity, not equivalence. Two functions that behave the same today are two
  // functions, and the point of the split is that there is only one.
  for (const [name, server] of [['campaign', P.campaign], ['scoreOpportunity', P.scoreOpportunity],
    ['campaignScore', P.campaignScore], ['plan', P.plan], ['businessFit', P.businessFit],
    ['objectiveFit', P.objectiveFit], ['geographyFit', P.geographyFit], ['costFit', P.costFit]]) {
    assert.strictEqual(server, SERVER_ENGINE[name],
      `distribution-planner.${name} is a second implementation`);
  }
  for (const name of ['actionability', 'requirementsFor', 'blockersFor', 'urlMatchesAction', 'health']) {
    assert.strictEqual(A[name], SERVER_ENGINE[name],
      `distribution-actionability.${name} is a second implementation`);
  }
  const REC = require(path.join(ROOT, 'scripts/lib/media-recommend.cjs'));
  assert.strictEqual(REC.businessFit, SERVER_ENGINE.mediaBusinessFit,
    'the media business fit was copied, not moved');
  assert.strictEqual(REC.objectiveFit, SERVER_ENGINE.mediaObjectiveFit,
    'the media objective fit was copied, not moved');
  assert.strictEqual(REC.PROFILES, SERVER_ENGINE.MEDIA_PROFILES,
    'the profiles were copied, not moved');
  // Nothing kept a private copy of the two constants a fork would have to
  // duplicate first.
  for (const rel of ['scripts/lib/distribution-planner.cjs',
    'scripts/lib/distribution-actionability.cjs', 'scripts/lib/media-recommend.cjs']) {
    assert.ok(!/READINESS_WEIGHT\s*=|const\s+STATUS\s*=|FIT_CATEGORY\s*=\s*\d/.test(read(rel)),
      `${rel} declares a constant the engine owns`);
  }
});

test('the vocabulary the engine mirrors has not drifted from bd-schema', () => {
  // bd-schema owns these and cannot be shipped to a browser, so the engine holds
  // a copy. A copy that can drift is a defect waiting to happen; this turns the
  // drift into a build failure.
  assert.deepStrictEqual(E.VERIFICATION_METHODS, BD.VERIFICATION_METHODS);
  assert.deepStrictEqual(E.SUBMISSION_DIFFICULTY, BD.SUBMISSION_DIFFICULTY);
  assert.deepStrictEqual(E.REQUIRED_ASSET_KEYS, BD.REQUIRED_ASSET_KEYS);
});

// ── THE FIELD CONTRACT ──────────────────────────────────────────────────────

// Every property the engine touches, recorded rather than declared. The proxy
// wraps the projected opportunity, its `record`, and the two nested objects the
// engine indexes into, then the engine is driven over every business, objective,
// market and budget the page offers.
function recordedReads() {
  const op = new Set(); const rec = new Set();
  const accepts = new Set(); const intel = new Set();
  const spy = (target, into) => new Proxy(target, {
    get(t, k) { if (typeof k === 'string') into.add(k); return t[k]; },
  });
  const wrap = (o) => {
    let record = o.record;
    if (record && typeof record === 'object') {
      const nested = record.intelligence && typeof record.intelligence === 'object'
        ? spy(record.intelligence, intel) : record.intelligence;
      record = new Proxy(record, {
        get(t, k) {
          if (typeof k === 'string') rec.add(k);
          return k === 'intelligence' ? nested : t[k];
        },
      });
    }
    const accepted = o.accepts && typeof o.accepts === 'object' ? spy(o.accepts, accepts) : o.accepts;
    return new Proxy(o, {
      get(t, k) {
        if (typeof k === 'string') op.add(k);
        if (k === 'record') return record;
        if (k === 'accepts') return accepted;
        return t[k];
      },
    });
  };

  const watched = OPS.map(wrap);
  const markets = ['*', 'united-states', 'united-kingdom', 'germany', 'czech-republic', 'india'];
  for (const business of E.MEDIA_PROFILES.map((p) => p.key)) {
    for (const objective of E.OBJECTIVES.map((o) => o.key)) {
      for (const market of markets) {
        for (const budget of E.BUDGETS.map((b) => b.key)) {
          for (const evidence of E.EVIDENCE_MODES.map((m) => m.key)) {
            // The CSV export is walked with the campaign, not beside it: it
            // reads the same opportunities, and a column added from a field the
            // payload does not carry would export an empty column in the
            // browser and a full one on the build machine.
            E.campaignCsv(E.campaign(watched, { business, objective, market, budget },
              { size: 10, evidence }));
          }
        }
      }
    }
  }
  E.plan(watched, { business: 'local-business', objective: 'local-discovery',
    market: 'united-states', budget: 'free-freemium' });
  E.health(watched);
  return { op: [...op].sort(), record: [...rec].sort(), accepts: [...accepts].sort(),
    intelligence: [...intel].sort() };
}

const READS = recordedReads();

test('the field contract is exactly what the engine reads — no more, no less', () => {
  for (const group of ['op', 'record', 'accepts', 'intelligence']) {
    assert.deepStrictEqual(READS[group], [...E.FIELD_CONTRACT[group]].sort(),
      `FIELD_CONTRACT.${group} disagrees with what the engine actually reads. `
      + `A field it reads and the payload omits is a browser scoring on undefined; `
      + `a field the payload carries and it never reads is data published for no reason.`);
  }
  // The guard is only worth anything if the walk drove real work.
  assert.ok(READS.op.length >= 15 && READS.record.length >= 15,
    `only ${READS.op.length} projected and ${READS.record.length} raw fields were touched`);
});

test('the payload carries every contracted field and nothing else', () => {
  assert.strictEqual(SLIM.length, OPS.length, 'the payload and the projection disagree on size');
  const contract = E.FIELD_CONTRACT;
  const extraOp = new Set(); const extraRecord = new Set();
  for (const op of SLIM) {
    for (const k of Object.keys(op)) if (!contract.op.includes(k)) extraOp.add(k);
    for (const k of Object.keys(op.record || {})) if (!contract.record.includes(k)) extraRecord.add(k);
    for (const k of Object.keys(op.accepts || {})) {
      assert.ok(contract.accepts.includes(k), `the payload ships accepts.${k}, which nothing reads`);
    }
    for (const k of Object.keys((op.record || {}).intelligence || {})) {
      assert.ok(contract.intelligence.includes(k), `the payload ships intelligence.${k}, which nothing reads`);
    }
  }
  assert.deepStrictEqual([...extraOp], [], 'the payload ships projected fields the engine never reads');
  assert.deepStrictEqual([...extraRecord], [], 'the payload ships raw fields the engine never reads');

  // Every field the engine reads must be PRESENT on at least one row, or the
  // projection is dropping a fact and the contract cannot see it.
  for (const k of contract.op.filter((x) => x !== 'record')) {
    assert.ok(SLIM.some((op) => k in op), `no row in the payload carries "${k}"`);
  }
  for (const k of contract.record.filter((x) => x !== 'intelligence')) {
    assert.ok(SLIM.some((op) => k in (op.record || {})), `no record in the payload carries "${k}"`);
  }
});

test('the payload ships no contact detail, internal note or unused provenance', () => {
  // The full record carries fields the planner has no business publishing a
  // second time. Named explicitly: the contract guard above proves only that
  // what ships is read, and a future engine that started reading an editor's
  // email address would satisfy it.
  //
  // Checked against the ACTUAL top-level keys rather than by searching the text.
  // "contact", "website" and "email" are also legitimate vocabulary VALUES —
  // requiredAssets records which assets a platform demands, and one of them is
  // called contact — so a substring search over the blob reports a payload that
  // is entirely correct.
  const BANNED = ['editorEmail', 'contactEmail', 'email', 'contact', 'internalNote', 'notes',
    'reviewedBy', 'assignedTo', 'sourceUrl', 'lastChecked', 'verifiedAt', 'checkedAt',
    'httpStatus', 'domainRating', 'authorityScore', 'estimatedTraffic', 'note', 'website',
    'description'];
  for (const op of SLIM) {
    for (const key of Object.keys(op)) {
      assert.ok(!BANNED.includes(key), `the browser payload carries op.${key}`);
    }
    for (const key of Object.keys(op.record || {})) {
      assert.ok(!BANNED.includes(key), `the browser payload carries record.${key}`);
    }
  }
  // And no VALUE anywhere looks like a way to contact a person.
  const blob = read('research/distribution-planner/planner-data.json');
  assert.ok(!/[a-z0-9._-]+@[a-z0-9-]+\.[a-z]{2,}/i.test(blob),
    'the payload contains what looks like an email address');
  assert.ok(!/"\+?\d[\d\s()-]{8,}"/.test(blob),
    'the payload contains what looks like a telephone number');
  // And it is served from the planner's own route, because /data/* is a forced
  // 404 and a client pointed there would silently receive the 404 page.
  assert.ok(fs.existsSync(path.join(ROOT, 'research/distribution-planner/planner-data.json')));
  assert.ok(!fs.existsSync(path.join(ROOT, 'data/distribution-planner/planner-data.json')),
    'the browser payload was written under /data/, which is a forced 404');
  assert.match(CLIENT, /\/research\/distribution-planner\/planner-data\.json/);
  assert.ok(!/['"]\/data\//.test(CLIENT), 'the client fetches from /data/, which is a forced 404');
});

test('the payload is owned by the build and pruned with it', () => {
  const manifest = JSON.parse(read('data/distribution-planner/.build-manifest.json'));
  assert.ok(manifest.files.includes('research/distribution-planner/planner-data.json'),
    'the payload is not in the build manifest, so nothing owns or prunes it');
  const gen = read('scripts/build-distribution-planner.cjs');
  assert.ok(/writeIfChanged\(DATA_FILE/.test(gen),
    'the payload is not written through the rewrite-only-on-change path');
});

// ── SERVER / CLIENT PARITY ──────────────────────────────────────────────────

// A matrix that moves every control the page offers. Markets are the ones the
// production bug was reported against plus the no-market case.
const MATRIX = [];
for (const market of ['united-states', 'united-kingdom', 'germany', 'czech-republic', 'india', '*']) {
  for (const [business, objective, budget, size] of [
    ['local-business', 'local-discovery', 'free-freemium', 25],
    ['b2b-saas', 'seo-citations', 'any', 10],
    ['telecom-voip-ucaas', 'pr-coverage', 'paid-allowed', 50],
    ['ecommerce', 'marketplace-exposure', 'free-only', 25],
  ]) {
    MATRIX.push({ business, objective, market, budget, size });
  }
}

const identity = (result) => ({
  picked: result.picked.map((r) => r.op.platformId),
  groups: result.groups.map((g) => ({ key: g.key, count: g.items.length,
    items: g.items.map((r) => r.op.platformId) })),
  totalEligible: result.totalEligible,
});

test('the browser engine on the slim payload equals the server on the full projection', () => {
  assert.ok(MATRIX.length >= 20, `only ${MATRIX.length} states in the matrix`);
  for (const state of MATRIX) {
    const ctx = { business: state.business, objective: state.objective,
      market: state.market, budget: state.budget };
    for (const evidence of ['ready', 'high', 'research', 'all']) {
      const server = P.campaign(OPS, ctx, { size: state.size, evidence });
      const client = E.campaign(SLIM, ctx, { size: state.size, evidence });
      const label = `${state.business}/${state.objective}/${state.market}/${state.budget}/${evidence}`;
      assert.deepStrictEqual(identity(client), identity(server),
        `${label}: the browser would show a different campaign from the one the CSV describes`);
    }
  }
});

test('actionability is identical on the slim payload for every opportunity', () => {
  // Not a sample: a single field dropped for one collection would move a handful
  // of rows between Ready and Needs research, which a sample would miss.
  const norm = (o) => JSON.stringify(o, (k, v) => (v === undefined ? null : v));
  let compared = 0;
  for (let i = 0; i < OPS.length; i += 1) {
    assert.strictEqual(OPS[i].platformId, SLIM[i].platformId, 'the payload is in a different order');
    assert.strictEqual(norm(E.actionability(SLIM[i])), norm(A.actionability(OPS[i])),
      `${OPS[i].platformId}: the browser derives a different actionability`);
    compared += 1;
  }
  assert.strictEqual(compared, 2234, `compared ${compared} opportunities, expected the full 2,234`);
});

test('the market control actually changes which platforms are picked', () => {
  // Without this the parity test above would pass on an engine that ignored the
  // market entirely: two identical wrong answers are still equal.
  const ctx = { business: 'local-business', objective: 'local-discovery', budget: 'free-freemium' };
  const pick = (market) => E.campaign(SLIM, { ...ctx, market }, { size: 25, evidence: 'ready' })
    .picked.map((r) => r.op.platformId);
  const us = pick('united-states');
  const uk = pick('united-kingdom');
  const de = pick('germany');
  assert.notDeepStrictEqual(uk, us, 'United Kingdom returns the identical campaign to the United States');
  assert.notDeepStrictEqual(de, us, 'Germany returns the identical campaign to the United States');
  // And the market's own platforms lead it, which is the point of choosing one.
  const ukLocal = SLIM.filter((o) => o.country === 'united-kingdom').map((o) => o.platformId);
  assert.ok(uk.slice(0, 3).some((id) => ukLocal.includes(id)),
    'no United Kingdom platform appears in the top three of a United Kingdom campaign');
});

test('the evidence control filters on actionability instead of doing nothing', () => {
  const ctx = { business: 'local-business', objective: 'local-discovery',
    market: 'united-states', budget: 'free-freemium' };
  const eligible = (evidence) => E.campaign(SLIM, ctx, { size: 200, evidence }).totalEligible;
  const ready = eligible('ready');
  const high = eligible('high');
  const research = eligible('research');
  const all = eligible('all');
  assert.ok(high < ready, 'high confidence is not narrower than ready');
  assert.ok(ready < research && research < all, 'the four evidence levels do not nest');
  // Identity, not just size: every candidate satisfies the level it was let in at.
  for (const [evidence, ok] of [
    ['ready', (a) => a.status === 'READY'],
    ['high', (a) => a.status === 'READY' && a.confidence === 'HIGH'],
    ['research', (a) => a.status === 'READY' || a.status === 'NEEDS_RESEARCH'],
  ]) {
    for (const r of E.campaign(SLIM, ctx, { size: 200, evidence }).picked) {
      assert.ok(ok(r.x.act), `${r.op.platformId} entered the "${evidence}" campaign without qualifying`);
    }
  }
  // The default the page renders with is the default the control shows, so the
  // first client render reproduces the server's rather than replacing it.
  const build = require(path.join(ROOT, 'scripts/build-distribution-planner.cjs'));
  assert.strictEqual(build.DEFAULT_QUERY.evidence, 'ready');
  assert.match(PAGE, /id="dp-evidence"[\s\S]*?<option value="ready" selected>/,
    'the evidence control does not default to the level the page was rendered at');
});

// ── THE REPORTED BUG ────────────────────────────────────────────────────────

test('the summary names the market that is selected, not the one it was built for', () => {
  // The production defect, stated exactly. The shipped page said "in the United
  // States" as a literal in the generator, so it stayed on screen under every
  // campaign whichever market was chosen.
  const ctx = { business: 'local-business', objective: 'local-discovery',
    market: 'united-kingdom', budget: 'free-freemium' };
  const result = E.campaign(SLIM, ctx, { size: 25, evidence: 'ready' });
  const text = E.summaryText({
    size: 25,
    business: 'Local business',
    objective: 'Local discovery',
    market: 'United Kingdom',
    budget: 'Free or freemium',
    evidence: 'Ready to execute only',
    totalEligible: result.totalEligible,
    picked: result.picked.length,
  });
  assert.ok(text.includes('United Kingdom'), `the summary does not name the market: "${text}"`);
  assert.ok(!text.includes('United States'),
    `the summary still claims the United States while United Kingdom is selected: "${text}"`);
  assert.ok(text.includes(String(result.totalEligible)) && text.includes(String(result.picked.length)),
    'the summary does not state the counts it is describing');

  // And no market name is written into the generator as a literal any more.
  const gen = read('scripts/build-distribution-planner.cjs');
  assert.ok(!/United States|United Kingdom/.test(gen),
    'the generator writes a country name into the page instead of deriving it');
});

test('the prerendered summary describes the state the controls are actually in', () => {
  const selected = {};
  for (const m of PAGE.matchAll(/<select class="bd-select" id="(dp-[a-z]+)"[\s\S]*?<\/select>/g)) {
    const label = /<option value="[^"]*" selected>([^<]*)</.exec(m[0]);
    if (label) selected[m[1]] = label[1];
  }
  const status = /<p class="bd-note" data-dp-status>([^<]*)</.exec(PAGE);
  assert.ok(status, 'the page has no summary paragraph');
  for (const id of ['dp-business', 'dp-objective', 'dp-market', 'dp-budget', 'dp-evidence']) {
    assert.ok(selected[id], `${id} has no selected option`);
    assert.ok(status[1].includes(selected[id]),
      `the summary does not mention the selected ${id} ("${selected[id]}"): "${status[1]}"`);
  }
  assert.ok(status[1].includes(`${selected['dp-size'] || 25}-opportunity`),
    'the summary does not state the selected campaign size');
});

// ── THE CLIENT ITSELF ───────────────────────────────────────────────────────

test('the planner page loads the engine before the controller, and only this page does', () => {
  assert.ok(PAGE.includes('<script src="/js/dp-engine.js" defer></script>'),
    'the engine is not shipped to the page that needs it');
  assert.ok(PAGE.includes('<script src="/js/distribution-planner.js" defer></script>'),
    'the controller is not loaded');
  assert.ok(PAGE.indexOf('/js/dp-engine.js') < PAGE.indexOf('/js/distribution-planner.js'),
    'DPEngine must be defined before the script that consumes it');
  // Every locale of the planner, and no other collection.
  const I18N = require(path.join(ROOT, 'scripts/lib/i18n.cjs'));
  for (const locale of I18N.LOCALE_CODES) {
    const rel = I18N.localizedFile(locale, P.PLANNER_PATH);
    assert.ok(read(rel).includes('/js/distribution-planner.js'), `${rel} does not load the controller`);
  }
  for (const rel of ['research/media-pr-publishing/index.html', 'research/marketplaces/index.html',
    'research/business-directories/index.html', 'research/tenders-procurement/index.html']) {
    assert.ok(!read(rel).includes('/js/dp-engine.js'),
      `${rel} downloads the planner engine and has no planner controls to drive it`);
  }
});

test('the client decides nothing on its own', () => {
  assert.ok(/E\.campaign\(/.test(CLIENT), 'the client does not call the shared engine');
  assert.ok(/E\.summaryText\(/.test(CLIENT), 'the client writes its own summary sentence');
  const body = CLIENT.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const [what, pattern] of [
    ['a score formula', /\*\s*1\.2|0\.40|0\.35|0\.25/],
    ['a readiness weight', /0\.45|1\.08/],
    ['its own group tests', /quick-wins|needs-research/],
    ['its own status vocabulary', /'READY'|"READY"/],
  ]) {
    assert.ok(!pattern.test(body), `the client contains ${what}`);
  }
});

test('the client writes text, never markup, and reads all six controls', () => {
  // Comments stripped first: the file's own header names innerHTML in order to
  // say it never uses it, and a raw search would fail on the promise instead of
  // on a breach of it.
  const code = CLIENT.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(code),
    'the client writes markup from data');
  // The controls are read generically from the attribute the generator emits, so
  // a seventh control needs no edit — but all six must be present on the page.
  assert.ok(/data-dp-filter/.test(CLIENT), 'the client does not read the controls generically');
  for (const id of ['dp-business', 'dp-objective', 'dp-market', 'dp-budget', 'dp-size', 'dp-evidence']) {
    assert.ok(PAGE.includes(`id="${id}" data-dp-filter="${id.slice(3)}"`),
      `${id} does not declare the state key it owns`);
  }
  // Every group the client can render is one the generator marks as replaceable,
  // or a recompute would append beside the prerendered campaign instead of
  // replacing it.
  assert.ok(/data-dp-group/.test(CLIENT) && /data-dp-group="/.test(PAGE),
    'the prerendered groups are not identified, so a recompute would duplicate them');
});

test('the client stands down instead of half-rendering', () => {
  const guards = [
    [/if \(!E\) return;/, 'a missing engine'],
    [/if \(!controls \|\| !statusEl \|\| !section\) return;/, 'missing page furniture'],
    [/if \(typeof fetch !== 'function'\) return;/, 'a browser without fetch'],
    [/\.catch\(/, 'a failed or malformed response'],
    [/predates this engine/, 'a payload older than the engine'],
  ];
  for (const [pattern, what] of guards) {
    assert.ok(pattern.test(CLIENT), `the client does not stand down on ${what}`);
  }
  // The no-JS page must be a real plan, not a shell the client is expected to
  // fill in: section 3 is complete in the HTML.
  const at = PAGE.indexOf('id="campaign"');
  const section = PAGE.slice(at, PAGE.indexOf('<section id="research"', at));
  assert.ok((section.match(/<li><strong>/g) || []).length >= 20,
    'the prerendered campaign is not a complete plan');
});

test('no platform is named anywhere in the engine or the client', () => {
  const src = read('scripts/lib/dp-engine.cjs');
  const low = src.toLowerCase();
  for (const op of OPS) {
    assert.ok(!low.includes(op.platformId.toLowerCase()), `the engine names ${op.platformId}`);
    assert.ok(!CLIENT.toLowerCase().includes(op.platformId.toLowerCase()),
      `the client names ${op.platformId}`);
  }
  assert.ok(!/\.(platformId|id|name)\s*===\s*['"`]/.test(src),
    'the engine compares against a specific platform identity');
  for (const g of [...E.GROUPS, ...E.CAMPAIGN_GROUPS]) {
    const body = g.test.toString().toLowerCase();
    for (const op of OPS.slice(0, 200)) {
      assert.ok(!body.includes(op.platformId.toLowerCase()), `${g.key} names ${op.platformId}`);
    }
  }
});

test('the engine never writes to the opportunities it is given', () => {
  // scripts/lib/bd-discovery.cjs has "filtering never mutates the records or the
  // input array" and the planner engine had no equivalent, so this was open:
  //
  //   function campaignScore(op, ctx) {
  //     op.cost = String(op.cost);           // a write-back into the record
  //
  // survived all 101 planner tests. Value-preserving writes are invisible to a
  // JSON snapshot, and a write that DOES change a value is only caught by
  // whichever downstream assertion happens to notice — which is luck, not a
  // guard. In the browser the target is the fetched payload the client holds for
  // the life of the page, so a write there is not a passing scratch value: every
  // later recompute scores against it, and the campaign quietly drifts from the
  // one the same URL produced a minute ago.
  //
  // A set trap rather than Object.freeze, because a silent failed write under
  // sloppy mode would prove nothing, and rather than a JSON snapshot, because
  // `op.cost = String(op.cost)` leaves a snapshot identical.
  const writes = [];
  const guard = (target, label) => new Proxy(target, {
    set(t, k, v) { writes.push(`${label}.${String(k)} = ${JSON.stringify(v)}`); t[k] = v; return true; },
    defineProperty(t, k, d) { writes.push(`defineProperty ${label}.${String(k)}`); return Reflect.defineProperty(t, k, d); },
    deleteProperty(t, k) { writes.push(`delete ${label}.${String(k)}`); return Reflect.deleteProperty(t, k); },
  });
  const wrap = (o) => {
    const record = o.record && typeof o.record === 'object'
      ? guard({ ...o.record,
        intelligence: o.record.intelligence && typeof o.record.intelligence === 'object'
          ? guard({ ...o.record.intelligence }, `${o.platformId}.record.intelligence`)
          : o.record.intelligence }, `${o.platformId}.record`)
      : o.record;
    const accepts = o.accepts && typeof o.accepts === 'object'
      ? guard({ ...o.accepts }, `${o.platformId}.accepts`) : o.accepts;
    return guard({ ...o, record, accepts }, o.platformId);
  };

  // The slim payload, because that is the object the browser actually holds.
  const watched = SLIM.map(wrap);
  const markets = ['*', 'united-states', 'united-kingdom', 'germany'];
  for (const business of E.MEDIA_PROFILES.map((p) => p.key).slice(0, 3)) {
    for (const objective of E.OBJECTIVES.map((o) => o.key).slice(0, 3)) {
      for (const market of markets) {
        for (const evidence of E.EVIDENCE_MODES.map((m) => m.key)) {
          const result = E.campaign(watched, { business, objective, market, budget: 'any' },
            { size: 10, evidence });
          E.campaignRows(result);
          E.campaignCsv(result);
        }
      }
    }
  }
  E.plan(watched, { business: 'local-business', objective: 'local-discovery',
    market: 'united-states', budget: 'free-freemium' });
  E.health(watched);
  for (const op of watched) E.actionability(op);

  assert.deepStrictEqual(writes.slice(0, 5), [],
    `the engine wrote into ${writes.length} canonical field(s); the first are above`);

  // Not vacuous: the same walk really did drive the scorer over real records.
  assert.ok(watched.length > 2000, `only ${watched.length} opportunities were exercised`);
  const proof = E.campaign(watched, { business: 'local-business', objective: 'local-discovery',
    market: 'united-states', budget: 'any' }, { size: 10, evidence: 'ready' });
  assert.ok(proof.picked.length > 0, 'the walk produced no campaign, so nothing was scored');
});

test('the projection and the payload are deterministic', () => {
  const build = require(path.join(ROOT, 'scripts/build-distribution-planner.cjs'));
  const a = JSON.stringify(E.projectForClient(OPS));
  const b = JSON.stringify(E.projectForClient(P.project(SRC)));
  assert.strictEqual(a, b, 'the payload is not reproducible from the same inputs');
  assert.strictEqual(a, JSON.stringify(SLIM),
    'the committed payload is not what the generator would write now');
  assert.ok(typeof build.renderMain === 'function');
});

test('nulls survive the projection, because the score asks about them', () => {
  // The trap this cost an afternoon to find: dropping a null field to save bytes
  // turns `op.nativeQuality === null` false, the unrated discount never applies,
  // and every unrated opportunity scores NaN and silently disappears.
  const unrated = SLIM.filter((o) => o.nativeQuality === null);
  assert.ok(unrated.length > 0, 'no unrated opportunity survives, so the case is untested');
  for (const o of unrated.slice(0, 50)) {
    assert.ok('nativeQuality' in o, 'an unrated opportunity lost the key that marks it unrated');
    const s = E.scoreOpportunity(o, { business: 'local-business', objective: 'local-discovery',
      market: '*', budget: 'any' });
    assert.ok(Number.isFinite(s.score), `${o.platformId} scored ${s.score}`);
  }
  const noUrl = SLIM.filter((o) => o.actionUrl === null);
  assert.ok(noUrl.length > 0 && 'actionUrl' in noUrl[0],
    'an opportunity with no route lost the key that says so');
});
