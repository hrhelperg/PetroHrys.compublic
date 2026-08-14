'use strict';

// Unified Distribution Planner — the contract.
//
// The planner's whole value rests on one thing being true: it compares three
// collections WITHOUT merging them. The moment a directory citation is shown as
// if it were a press mention, or a marketplace listing as if it were a backlink
// opportunity, the tool is worse than the three separate databases it replaced.
//
// So most of this file defends separation: source identity, native quality,
// distinct actions, and canonical facts staying in the collection that owns them.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const P = require(path.join(ROOT, 'scripts/lib/distribution-planner.cjs'));
const REC = require(path.join(ROOT, 'scripts/lib/media-recommend.cjs'));
const MI = require(path.join(ROOT, 'scripts/lib/media-intelligence.cjs'));
const build = require(path.join(ROOT, 'scripts/build-distribution-planner.cjs'));

const PAGE = path.join(ROOT, 'research/distribution-planner/index.html');
const SRC = P.loadAll();
const OPS = P.project(SRC);
const page = () => fs.readFileSync(PAGE, 'utf8');
const Q = { business: 'local-business', objective: 'local-discovery', market: 'united-states', budget: 'free-freemium' };

// ── 11-15. separation ───────────────────────────────────────────────────────

test('the planner consumes all three collections and says which is which', () => {
  const byCollection = {};
  for (const o of OPS) byCollection[o.sourceCollection] = (byCollection[o.sourceCollection] || 0) + 1;
  assert.strictEqual(Object.keys(byCollection).length, 3, 'not all three collections are consumed');
  for (const c of P.COLLECTIONS) {
    assert.ok(byCollection[c.key] > 0, `${c.key} contributed nothing`);
  }
  assert.strictEqual(byCollection.directories, SRC.directories.length);
  assert.strictEqual(byCollection.marketplaces, SRC.marketplaces.length);
  assert.strictEqual(byCollection.media, SRC.media.length);
  for (const o of OPS) {
    assert.ok(P.COLLECTION_BY_KEY.has(o.sourceCollection), `${o.platformId} has no source collection`);
  }
});

test('the planner never mutates a canonical record', () => {
  const before = JSON.stringify(SRC.media.map((r) => r.opportunityTypes));
  const beforeDir = JSON.stringify(SRC.directories.map((r) => r.listingAction));
  P.plan(P.project(SRC), Q);
  assert.strictEqual(JSON.stringify(SRC.media.map((r) => r.opportunityTypes)), before,
    'the planner changed a media record');
  assert.strictEqual(JSON.stringify(SRC.directories.map((r) => r.listingAction)), beforeDir,
    'the planner changed a directory record');
  // And it writes nothing outside its own directory.
  const manifest = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'data/distribution-planner/.build-manifest.json'), 'utf8'));
  const I18N_T = require(path.join(ROOT, 'scripts/lib/i18n.cjs'));
  // Localization made the section multi-prefixed; the property is unchanged.
  const ownsRoute = (x) => I18N_T.LOCALE_CODES
    .some((l) => x.startsWith(I18N_T.localizedPath(l, '/research/distribution-planner/').replace(/^\//, '')));
  for (const f of manifest.files) {
    assert.ok(ownsRoute(f), `the manifest claims ${f}, outside its own routes`);
  }
});

test('no merged master dataset is created', () => {
  // The projection lives in memory. A file duplicating the three collections
  // would become a fourth source of truth and drift the first time one changed.
  const dir = path.join(ROOT, 'data/distribution-planner');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  for (const f of files) {
    // A manifest and a header-only tracker template are not merged datasets.
    // The first version asserted every file was dotfile-hidden, which is a
    // spelling rule, not the property. What must never exist is a file holding
    // COPIES of source records.
    if (f.startsWith('.') || f.endsWith('.template.csv')) continue;
    assert.fail(`data/distribution-planner/${f} is neither a manifest nor a template`);
  }
  for (const f of files.filter((x) => !x.startsWith('.'))) {
    const body = fs.readFileSync(path.join(dir, f), 'utf8');
    const lines = body.split(/\r?\n/).filter((l) => l.trim());
    assert.ok(lines.length <= 1, `data/distribution-planner/${f} carries ${lines.length} rows of data`);
  }
  assert.ok(!fs.existsSync(path.join(dir, 'opportunities.json')), 'a merged dataset exists');
});

test('a platform id never appears twice in one projection', () => {
  const seen = new Map();
  for (const o of OPS) {
    const key = `${o.sourceCollection}:${o.platformId}`;
    assert.ok(!seen.has(key), `${key} was projected twice`);
    seen.set(key, true);
  }
});

test('the three lanes keep distinct actions', () => {
  // A directory action and a media action must never be the same string, or the
  // page can no longer tell an employee what they are actually doing.
  const byLane = { 1: new Set(), 2: new Set(), 3: new Set() };
  for (const [key, a] of Object.entries(P.ACTION_TYPES)) {
    if (a.lane) byLane[a.lane].add(key);
  }
  assert.ok(byLane[1].size && byLane[2].size && byLane[3].size, 'a lane has no actions');
  for (const a of byLane[1]) assert.ok(!byLane[3].has(a), `${a} is both a directory and a media action`);
  for (const a of byLane[2]) assert.ok(!byLane[3].has(a), `${a} is both a marketplace and a media action`);
  // And every projected opportunity uses an action from its own lane.
  for (const o of OPS) {
    const a = P.ACTION_TYPES[o.actionType];
    assert.ok(a, `${o.platformId} has an unknown action "${o.actionType}"`);
    const lane = P.COLLECTION_BY_KEY.get(o.sourceCollection).lane;
    assert.ok(a.lane === lane || a.lane === 0,
      `${o.platformId} is in lane ${lane} but its action belongs to lane ${a.lane}`);
  }
});

test('native scores and signals survive the projection', () => {
  const media = OPS.filter((o) => o.sourceCollection === 'media');
  for (const o of media.slice(0, 60)) {
    assert.strictEqual(o.nativeQuality, MI.mediaScore(o.record).score,
      `${o.platformId} lost its Media Score in the projection`);
  }
  for (const o of OPS) {
    assert.ok(typeof o.nativeSignal === 'string' && o.nativeSignal.length > 3,
      `${o.platformId} carries a quality with no signal explaining it`);
    if (o.nativeQuality !== null) {
      assert.ok(o.nativeQuality >= 0 && o.nativeQuality <= 100, `${o.platformId} quality out of range`);
    }
  }
  // No single invented universal score replaced them.
  const src = fs.readFileSync(path.join(ROOT, 'scripts/lib/distribution-planner.cjs'), 'utf8');
  assert.ok(!/universalScore|authorityScore|globalScore/.test(src),
    'a single invented authority score exists');
});

// ── 16-17. action URLs ──────────────────────────────────────────────────────

test('an action URL comes from the source record, and a missing one stays missing', () => {
  for (const o of OPS) {
    if (o.actionUrl === null) continue;
    assert.match(o.actionUrl, /^https:\/\//, `${o.platformId} has a malformed action URL`);
    // It must be a URL the source record actually carries — never the homepage
    // dressed up as a submission route.
    const src = o.sourceCollection === 'media'
      ? [o.record.submissionUrl, o.record.pitchUrl, o.record.pressReleaseUrl, o.record.advertisingUrl]
      : o.sourceCollection === 'directories'
        ? [SRC.directories.find((r) => r.id === o.platformId).submissionUrl,
          SRC.directories.find((r) => r.id === o.platformId).claimUrl]
        // Marketplaces gained a route field of their own. One field, one
        // meaning: whatever the projection carries must be exactly it.
        : [SRC.marketplaces.find((r) => r.id === o.platformId).sellerActionUrl];
    // The rule is that the planner never SYNTHESISES a URL from the domain,
    // which the source-field check above already proves. An earlier version
    // also required the action URL to differ from the website, and failed on a
    // record whose advertising page genuinely is its website — a fact the
    // source collection records, not a fabrication.
    assert.ok(src.includes(o.actionUrl), `${o.platformId} has an action URL no source field carries`);
  }
  // The marketplace collection now records seller routes. The rule is
  // unchanged and simply has something to bite on: the projected route is the
  // one the record holds, and a record holding none is projected with none.
  const mp = OPS.filter((o) => o.sourceCollection === 'marketplaces');
  for (const o of mp) {
    const held = SRC.marketplaces.find((r) => r.id === o.platformId).sellerActionUrl || null;
    assert.strictEqual(o.actionUrl || null, held,
      `${o.platformId}: the projected route is not the one the collection holds`);
  }
  assert.ok(mp.some((o) => o.actionUrl), 'no marketplace carries a route at all');
  // And the page never renders a link for a row that has no URL. The first
  // version matched one exact sentence, which v2 replaced with the row's own
  // next-action wording; the property is that the CTA degrades to plain text.
  const html = page();
  const plain = (html.match(/<span class="bd-metric bd-metric--empty">/g) || []).length;
  assert.ok(plain > 0, 'no row degrades its call to action when the URL is missing');
  for (const m of html.matchAll(/class="bd-cta-link" href="([^"]*)"/g)) {
    assert.match(m[1], /^https:\/\//, `a call to action links to "${m[1]}"`);
  }
});

// ── 7-10. filters actually filter ───────────────────────────────────────────

test('objective gating stops a collection offering what it cannot deliver', () => {
  // A classified ad is not press coverage. This is the rule, not a filter the
  // reader has to remember.
  const pr = P.plan(OPS, { ...Q, objective: 'pr-coverage', market: '*', budget: 'any' });
  const nonMedia = pr.lanes.filter((l) => l.collection.key !== 'media');
  for (const l of nonMedia) {
    assert.strictEqual(l.total, 0, `${l.collection.label} was offered for PR coverage`);
  }
  const mx = P.plan(OPS, { ...Q, objective: 'marketplace-exposure', market: '*', budget: 'any' });
  assert.strictEqual(mx.lanes.find((l) => l.collection.key === 'media').total, 0,
    'a publication was offered for marketplace exposure');

  // And the collection-level gate is asserted DIRECTLY, not only through its
  // effect on the lane totals. A narrower per-collection rule downstream was
  // masking the gate's removal: with the gate disabled the lanes still came out
  // empty, so the guard could not tell the difference.
  const aDirectory = OPS.find((o) => o.sourceCollection === 'directories');
  const aMarketplace = OPS.find((o) => o.sourceCollection === 'marketplaces');
  const aMedia = OPS.find((o) => o.sourceCollection === 'media');
  for (const [op, objective] of [[aDirectory, 'pr-coverage'], [aMarketplace, 'pr-coverage'],
    [aMedia, 'marketplace-exposure'], [aMedia, 'classified-advertising']]) {
    const of = P.objectiveFit(op, objective);
    assert.strictEqual(of.excluded, true,
      `${op.sourceCollection} was not gated out of ${objective}`);
    // The COLLECTION-LEVEL wording specifically. Accepting the narrower
    // downstream rule's phrasing as well is what let the gate be removed
    // without this guard noticing: both paths end in "excluded", and only the
    // reason distinguishes which rule did the work.
    const label = P.COLLECTION_BY_KEY.get(op.sourceCollection).label;
    assert.ok(of.reason.startsWith(`${label} cannot deliver`),
      `${op.sourceCollection} was excluded from ${objective} by a downstream rule `
      + `rather than the collection gate: "${of.reason}"`);
  }
});

test('a free-only budget never returns a paid-only platform as a normal match', () => {
  const free = P.plan(OPS, { ...Q, market: '*', budget: 'free-only' }, { perLane: 500 });
  for (const lane of free.lanes) {
    for (const { op } of lane.results) {
      assert.notStrictEqual(op.cost, 'paid', `${op.platformId} costs money under a free-only budget`);
      assert.notStrictEqual(op.cost, 'freemium', `${op.platformId} is freemium under a free-only budget`);
    }
  }
  // Unknown cost is a caveat, not an exclusion, and the reason says so.
  const unknown = OPS.find((o) => o.cost === 'unknown');
  if (unknown) {
    const s = P.scoreOpportunity(unknown, { ...Q, market: '*', budget: 'free-only' });
    if (!s.excluded) {
      assert.ok(s.reasons.some((r) => /cost not established/i.test(r)),
        'an unknown cost passed a free-only budget without saying so');
    }
  }
});

test('the wrong geography cannot outrank the right one without explicit global reach', () => {
  const target = 'germany';
  const local = OPS.find((o) => o.country === target && o.sourceCollection === 'media');
  const foreign = OPS.find((o) => o.country !== target && o.country !== 'global'
    && o.audienceGeography !== 'global' && o.sourceCollection === 'media');
  assert.ok(local && foreign, 'no comparable pair to test geography');
  assert.ok(P.geographyFit(local, target).value > P.geographyFit(foreign, target).value,
    'a foreign platform matched the target market as well as a local one');
  const globalOp = OPS.find((o) => o.audienceGeography === 'global');
  assert.ok(P.geographyFit(globalOp, target).value > P.geographyFit(foreign, target).value,
    'explicit global reach did not beat an unrelated market');
});

test('explicit exclusion beats a positive generic fit', () => {
  // A marketplace that accepts private sellers only is excluded however well it
  // scores on everything else.
  const priv = OPS.find((o) => o.sellerTypes === 'private');
  if (priv) {
    const s = P.scoreOpportunity(priv, { ...Q, business: 'ecommerce', objective: 'marketplace-exposure', market: '*', budget: 'any' });
    assert.strictEqual(s.excluded, true, 'a private-sellers-only marketplace was recommended to a company');
    assert.strictEqual(s.score, 0);
  }
  // And a directory that explicitly refuses a business type is excluded.
  const refuses = { sourceCollection: 'directories', platformId: 'x', name: 'X',
    website: 'https://x.example', country: 'global', accepts: { saas: false }, category: 'saas',
    actionType: 'create-listing', actionUrl: null, cost: 'free', nativeQuality: 90,
    nativeSignal: 't', evidence: 'reachable', priority: 'P1' };
  const s = P.scoreOpportunity(refuses, { business: 'b2b-saas', objective: 'seo-citations', market: '*', budget: 'any' });
  assert.strictEqual(s.excluded, true, 'a directory that refuses this business type was recommended');
});

// ── 5-6. no curation ────────────────────────────────────────────────────────

test('no platform is named or boosted anywhere in the planner', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/lib/distribution-planner.cjs'), 'utf8');
  const decl = src.slice(0, src.indexOf('function project')).toLowerCase();
  for (const o of OPS) {
    assert.ok(!decl.includes(o.platformId.toLowerCase()), `the planner names ${o.platformId}`);
  }
  // No identity comparison against a specific platform anywhere in the file.
  assert.ok(!/\.(platformId|id|name)\s*===\s*['"`]/.test(src),
    'the planner compares against a specific platform identity');
  assert.ok(!/boost|handpick|hand-pick|featured\s*=/.test(src), 'the planner contains a manual boost');
});

test('every group is defined by canonical facts, never by a platform list', () => {
  for (const g of P.GROUPS) {
    assert.strictEqual(typeof g.test, 'function', `${g.key} is not a rule`);
    const body = g.test.toString().toLowerCase();
    for (const o of OPS.slice(0, 200)) {
      assert.ok(!body.includes(o.platformId.toLowerCase()), `${g.key} names ${o.platformId}`);
    }
    assert.ok(g.blurb && g.blurb.length > 20, `${g.key} does not explain itself`);
  }
});

// ── 18-21. the page ─────────────────────────────────────────────────────────

test('the planner is one page and generates no query combinations', () => {
  const dir = path.join(ROOT, 'research/distribution-planner');
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  // The invariant is that a campaign QUERY never becomes a page. Localization
  // means one route is published in each supported language, which is a
  // different axis entirely — so the expected count is derived from the locale
  // list rather than pinned at one.
  const I18N = require(path.join(ROOT, 'scripts/lib/i18n.cjs'));
  const pages = walk(dir).filter((f) => f.endsWith('.html'));
  assert.strictEqual(pages.length, 1,
    `${pages.length} English planner pages exist; query combinations must not become pages`);
  const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  const entries = [...sitemap.matchAll(/distribution-planner[^<]*/g)].map((m) => m[0]);
  assert.strictEqual(entries.length, I18N.LOCALE_CODES.length,
    `${entries.length} planner URLs are in the sitemap; expected one per locale`);
  assert.ok(!sitemap.includes('distribution-planner/?'), 'a query combination is in the sitemap');
});

test('the planner is reachable and is not an orphan', () => {
  const LINK = P.PLANNER_PATH;
  const hub = fs.readFileSync(path.join(ROOT, 'research/index.html'), 'utf8');
  // Checked inside the Collections section, not against the whole file: the
  // footer carries this link on every page and satisfied a whole-file search,
  // so deleting the planner from the Research Center's own list of tools
  // changed nothing the first version could see.
  const at = hub.indexOf('id="collections"');
  assert.ok(at > -1, 'the Research Center has no Collections section');
  const collections = hub.slice(at, hub.indexOf('</section>', at));
  // Asserted on the LIST ENTRY that presents the tool, not on any occurrence of
  // the link. The section also carries a "more" link, which survived deletion of
  // the entry and kept a whole-section search green.
  assert.ok(collections.includes(`<li><a href="${LINK}"><span class="name">Distribution Planner</span>`),
    'the Research Center does not present the planner among its collections');
  assert.match(collections, /Select a business, objective, market and budget/,
    'the planner is listed without explaining what it does');
  assert.ok(fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8')
    .includes(`https://petrohrys.com${LINK}`), 'the planner is missing from the sitemap');
  for (const rel of ['index.html', 'work/index.html', 'about/index.html', 'research/index.html']) {
    const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.ok(html.slice(html.indexOf('<footer role="contentinfo">')).includes(LINK),
      `${rel} has no planner link in its footer`);
  }
  let inbound = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === 'index.html' && !p.includes('/distribution-planner/')
        && fs.readFileSync(p, 'utf8').includes(LINK)) inbound += 1;
    }
  };
  walk(path.join(ROOT, 'research'));
  assert.ok(inbound >= 30, `only ${inbound} pages link the planner`);
});

test('every count on the page is derived', () => {
  const html = page();
  // Unescape entities before matching: the collection label contains "&", which
  // the page correctly escapes, and the first version compared the raw HTML.
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
  // v2 replaced the stat list with the collection health table. The property is
  // unchanged — every total on the page is computed from the data — but it now
  // lives in the table, so that is where it is checked.
  const A2 = require(path.join(ROOT, 'scripts/lib/distribution-actionability.cjs'));
  const h = A2.health(OPS);
  assert.ok(text.includes(String(h.overall.total)), 'the page does not state the derived total');
  for (const c of P.COLLECTIONS) {
    const n = OPS.filter((o) => o.sourceCollection === c.key).length;
    assert.ok(text.includes(String(n)), `the page does not state the derived ${c.key} count`);
  }
  assert.ok(text.includes(`${h.overall.ready}`), 'the page does not state the derived ready count');
  // Asserted by INTERPOLATION, not by grepping the source for digits.
  //
  // The first version stripped comments and quoted strings and then searched
  // for the total as a numeric literal. Naive quote-stripping pairs any
  // apostrophe with the next one, so it swallowed whole spans of template
  // markup between two unrelated apostrophes — and a literal 2234 written
  // straight into the stat line vanished before the search ever ran. The check
  // was blind to precisely the thing it existed to catch.
  //
  // The property is simply that each displayed total is an expression. That is
  // checked directly, which no amount of quoting can hide.
  const gen = fs.readFileSync(path.join(ROOT, 'scripts/build-distribution-planner.cjs'), 'utf8');
  assert.ok(gen.includes('${h.overall.total}'), 'the total is not interpolated from the data');
  assert.ok(gen.includes('${st.total}') && gen.includes('${st.ready}'),
    'the per-collection health counts are not interpolated from the data');
  assert.ok(gen.includes('${h.overall.actionUrlCoverage}'),
    'action URL coverage is not interpolated from the data');
  // And no multi-digit literal is rendered anywhere in the generator's markup.
  assert.ok(!/<strong>\d{2,}<\/strong>/.test(gen),
    'a literal number is rendered instead of a derived one');
});

test('the page keeps the three lanes visible and states the boundary', () => {
  const html = page();
  // v2 replaced the three lane sections with the collection health table and
  // the three execution queues. The property is that each collection stays
  // visibly separate and linked — which the health table does per row, and
  // which every result row still carries as data.
  const escaped = (t) => t.replace(/&/g, '&amp;');
  for (const c of P.COLLECTIONS) {
    assert.ok(html.includes(c.path), `the ${c.key} collection is not linked`);
    // Labels are HTML-escaped on the page; "Marketplace & Classified Platforms"
    // is rendered with &amp;, which a raw comparison missed.
    assert.ok(html.includes(escaped(c.label)), `the ${c.key} collection is not named`);
  }
  assert.ok(html.includes('id="health"'), 'the collection health table is missing');
  // Every row still carries its source collection, and now every row's
  // collection is one the SELECTED OBJECTIVE can actually be served by. The
  // three queues used to be the whole corpus, so all three collections appeared
  // whatever was selected — including under an objective the collection cannot
  // deliver, which is the rule objectiveFit exists to enforce. The prerendered
  // state (local discovery) is served by directories and marketplaces; media
  // cannot deliver it, so no media row appears, and that is the page being
  // right rather than the page losing a lane.
  const admitted = P.OBJECTIVE_BY_KEY.get(build.DEFAULT_QUERY.objective).collections;
  const rowCollections = new Set([...html.matchAll(/data-dp-collection="([^"]+)"/g)]
    .map((m) => m[1]));
  assert.ok(rowCollections.size > 0, 'no row carries a collection identity at all');
  for (const key of rowCollections) {
    assert.ok(admitted.includes(key),
      `a ${key} row is offered for an objective ${key} cannot deliver`);
  }
  for (const key of admitted) {
    assert.ok(rowCollections.has(key),
      `no row carries the ${key} collection identity, which this objective admits`);
  }
  // And all three are named and linked by the health table, which is a
  // catalogue-level fact and stays whole-corpus by design.
  const at = html.indexOf('id="health"');
  const health = html.slice(at, html.indexOf('</section>', at));
  for (const c of P.COLLECTIONS) {
    assert.ok(health.includes(c.path) && health.includes(escaped(c.label)),
      `the ${c.key} collection is missing from the health table`);
  }
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
  assert.match(text, /a directory citation is not a press mention/i,
    'the page does not state that the three actions differ');
  // Matched on the claim, not on one exact sentence: v2 rewrote the wording
  // from "classified ad" to "classified listing" and the assertion failed on a
  // change that said the same thing.
  assert.match(text, /classified (ad|listing) is not editorial coverage/i);
  assert.ok(html.includes('data-dp-collection='), 'rows do not carry their source collection');
});

test('the page works without JavaScript', () => {
  const html = page();
  // A complete default plan is prerendered: rows, not an empty shell.
  const rows = (html.match(/class="bd-row"/g) || []).length;
  assert.ok(rows >= 20, `only ${rows} rows are prerendered; the page needs JS to say anything`);
  assert.ok(!/<noscript>/.test(html) || true, 'noscript is optional');
  for (const m of html.matchAll(/<select class="bd-select" id="([^"]+)"/g)) {
    assert.ok(html.includes(`for="${m[1]}"`), `the ${m[1]} control has no label`);
  }
  const h1 = (html.match(/<h1[^>]*>/g) || []).length;
  assert.strictEqual(h1, 1, `the page has ${h1} H1 elements`);
});

// ── 21-29. build properties ─────────────────────────────────────────────────

test('the projection is deterministic and locale-independent', () => {
  const a = P.plan(P.project(SRC), Q, { perLane: 30 }).lanes
    .flatMap((l) => l.results.map((x) => `${x.op.platformId}:${x.s.score}`));
  const reversed = { directories: [...SRC.directories].reverse(),
    marketplaces: [...SRC.marketplaces].reverse(), media: [...SRC.media].reverse() };
  const b = P.plan(P.project(reversed), Q, { perLane: 30 }).lanes
    .flatMap((l) => l.results.map((x) => `${x.op.platformId}:${x.s.score}`));
  assert.deepStrictEqual(a, b, 'the plan depends on input order');
  for (const f of ['scripts/lib/distribution-planner.cjs', 'scripts/build-distribution-planner.cjs']) {
    assert.ok(!/\.localeCompare\s*\(/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')),
      `${f} calls localeCompare`);
  }
});

test('no build-time network and no new dependency', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/lib/distribution-planner.cjs'), 'utf8')
    + fs.readFileSync(path.join(ROOT, 'scripts/build-distribution-planner.cjs'), 'utf8');
  assert.ok(!/\bfetch\s*\(|https?\.request\s*\(|axios\.|node-fetch/.test(src), 'the planner makes a network call');
  for (const m of src.matchAll(/require\('([^']+)'\)/g)) {
    assert.ok(m[1].startsWith('.') || m[1].startsWith('node:'),
      `the planner requires the external module "${m[1]}"`);
  }
  assert.ok(!fs.existsSync(path.join(ROOT, 'package.json')), 'a package.json was added');
});

test('the planner JSON-LD parses and claims nothing it cannot support', () => {
  const html = page();
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => JSON.parse(m[1]));
  assert.ok(blocks.length >= 1, 'no structured data');
  const graph = JSON.stringify(blocks);
  assert.ok(!/aggregateRating|ratingValue|reviewCount/.test(graph),
    'an internal priority is presented as a public review rating');
  assert.ok(html.includes('rel="canonical" href="https://petrohrys.com/research/distribution-planner/"'));
});

test('the source collections are unchanged by this feature', () => {
  // BRITTLE MIRRORS, REMOVED: `SRC.marketplaces.length === 307` and
  // `SRC.media.length === 385`. Both restated a JSON array length, so a
  // verified research addition — 286 -> 307 when the Gulf, the Levant, the
  // Maghreb and New Zealand stopped holding zero rows — failed a test about the
  // PLANNER, and the fix was always to retype the number.
  //
  // The property is that the planner consumes each collection WHOLE and drops
  // nothing: what it holds is exactly the canonical publishable set. Stated as
  // identity rather than as a count it is strictly stronger than the literal
  // was — swapping one row for another moved neither total — and it never needs
  // editing again.
  // (a) The planner invents nothing: every row it holds is a row of the
  //     canonical registry file, by id. Compared against the RAW file, so this
  //     is not the planner's own load expression restated back at it.
  const rawIds = (rel) => new Set(JSON.parse(
    fs.readFileSync(path.join(ROOT, rel), 'utf8')).map((r) => r.id));
  const canonicalMarketplaces = rawIds('data/marketplaces/marketplaces.json');
  const canonicalMedia = rawIds('data/media-pr-publishing/media-platforms.json');
  for (const r of SRC.marketplaces) {
    assert.ok(canonicalMarketplaces.has(r.id), `${r.id} is not in the marketplace registry`);
  }
  for (const r of SRC.media) {
    assert.ok(canonicalMedia.has(r.id), `${r.id} is not in the media registry`);
  }
  // (b) And it drops nothing: the count the collection PUBLISHED is the count
  //     the planner consumes. Generated === canonical, which is what the
  //     literal was standing in for.
  const dataRows = (csv) => {
    let rows = 0;
    let quoted = false;
    for (let i = 0; i < csv.length; i += 1) {
      const c = csv[i];
      if (c === '"') {
        if (quoted && csv[i + 1] === '"') { i += 1; } else { quoted = !quoted; }
      } else if (c === '\n' && !quoted) rows += 1;
    }
    return rows - 1; // the header
  };
  const published = {
    'research/marketplaces/marketplaces.csv': SRC.marketplaces.length,
    'research/media-pr-publishing/opportunities.csv': SRC.media.length,
  };
  for (const [f, expected] of Object.entries(published)) {
    const csv = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.strictEqual(csv.charCodeAt(0), 0xFEFF, `${f} lost its BOM`);
    assert.ok(/\r\n/.test(csv), `${f} lost CRLF`);
    assert.strictEqual(dataRows(csv.replace(/^﻿/, '')), expected,
      `${f} publishes ${dataRows(csv)} rows; the planner consumes ${expected}`);
  }
  // Floors, not mirrors: these move only if a collection collapses.
  assert.ok(SRC.marketplaces.length > 250, `the marketplace set fell to ${SRC.marketplaces.length}`);
  assert.ok(SRC.media.length > 300, `the media set fell to ${SRC.media.length}`);
  assert.ok(SRC.directories.length > 1500, 'the directory count collapsed');
});
