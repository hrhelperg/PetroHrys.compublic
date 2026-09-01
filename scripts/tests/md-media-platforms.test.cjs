'use strict';

// Media, PR & Publishing Platforms — the validation contract.
//
// The dataset makes one claim that is easy to state and easy to betray: every
// row says what a company can ACTUALLY do at that platform, and says nothing
// else. Most of these tests exist to stop the betrayals, which are all the same
// shape — one kind of opportunity quietly standing in for another:
//
//   a contact page becoming "they accept submissions"
//   an advertising rate card becoming a contributor programme
//   a press release wire becoming editorial coverage
//   a paid membership becoming staff journalism
//   a journalist-source platform becoming a publication
//
// Two of these were caught during research by the tooling built to prevent
// them, and one was caught in the tooling itself: the route verifier scored a
// 404 page PROVEN because the phrase it wanted appeared in the site navigation.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const MD = require(path.join(ROOT, 'scripts/lib/media-schema.cjs'));
// The Domain Rating contract lives in bd-schema and is shared by every
// collection, so this dataset checks its ratings against the same rules rather
// than restating them.
const BD = require(path.join(ROOT, 'scripts/lib/bd-schema.cjs'));
const build = require(path.join(ROOT, 'scripts/build-media-platforms.cjs'));
const render = require(path.join(ROOT, 'scripts/lib/bd-render.cjs'));
const seo = require(path.join(ROOT, 'scripts/lib/bd-seo.cjs'));

const DATA_FILE = path.join(ROOT, 'data/media-pr-publishing/media-platforms.json');
const PAGE = path.join(ROOT, 'research/media-pr-publishing/index.html');
const CSV = path.join(ROOT, 'research/media-pr-publishing/opportunities.csv');
const COUNTRIES = new Set(JSON.parse(
  fs.readFileSync(path.join(ROOT, 'data/business-directories/countries.json'), 'utf8'))
  .map((c) => c.slug));

const RAW = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
const ROWS = MD.loadMediaPlatforms(DATA_FILE, COUNTRIES);
const ACTIONABLE = ROWS.filter(MD.isActionable);
const page = () => fs.readFileSync(PAGE, 'utf8');
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

// RFC 4180. split(',') shifted columns on a quoted cell in a sibling dataset
// and reported a mismatch that did not exist.
function parseCsv(input) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const s = input.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\r' && s[i + 1] === '\n') {
      row.push(field); field = ''; rows.push(row); row = []; i += 1;
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// ── 1-3. identity ───────────────────────────────────────────────────────────

test('every id is unique and namespaced to this dataset', () => {
  const seen = new Set();
  for (const r of RAW) {
    assert.ok(r.id.startsWith('md-'), `${r.id} is not namespaced to the media dataset`);
    assert.ok(!seen.has(r.id), `${r.id} is declared twice`);
    seen.add(r.id);
  }
});

test('the three research datasets can never collide on an id', () => {
  // A platform CAN legitimately appear in more than one — PR.com sells press
  // release distribution and holds company profiles. What must never happen is
  // two datasets meaning different things by one id.
  const bd = path.join(ROOT, 'data/business-directories');
  const others = new Set([
    ...fs.readdirSync(path.join(bd, 'directories')).filter((f) => f.endsWith('.json'))
      .flatMap((f) => JSON.parse(fs.readFileSync(path.join(bd, 'directories', f), 'utf8')))
      .map((r) => r.id),
    ...JSON.parse(fs.readFileSync(path.join(bd, 'opportunities.json'), 'utf8')).map((r) => r.id),
    ...JSON.parse(fs.readFileSync(path.join(ROOT, 'data/marketplaces/marketplaces.json'), 'utf8'))
      .map((r) => r.id),
  ]);
  for (const r of RAW) assert.ok(!others.has(r.id), `${r.id} collides with another dataset`);
  for (const id of others) {
    assert.ok(!id.startsWith('md-'), `${id} uses the media namespace in another dataset`);
  }
});

test('one publication is one record', () => {
  // Language editions, mobile hosts, sections and a submission form are all the
  // same publication. The host is what separates them from a separate title.
  const seen = new Map();
  for (const r of ROWS) {
    const host = MD.hostOf(r.website);
    assert.ok(!seen.has(host), `${seen.get(host)} and ${r.id} are the same publication`);
    seen.set(host, r.id);
  }
});

test('a merged or absorbed title is one record, and says so', () => {
  // mt.nl and sprout.nl both redirect to mtsprout.nl; gruenderszene.de now
  // redirects into Business Insider Deutschland. Pitching each former title
  // separately is pitching the same desk twice.
  for (const host of ['mt.nl', 'sprout.nl', 'gruenderszene.de', 'accesswire.com',
    'helpab2bwriter.com', 'tinylaun.ch']) {
    const asSite = ROWS.filter((r) => MD.hostOf(r.website) === host);
    assert.strictEqual(asSite.length, 0, `${host} is listed as a live site but it redirects elsewhere`);
    const asSource = ROWS.filter((r) => r.sources.some((s) => s.includes(host)));
    assert.ok(asSource.length >= 1, `${host} redirects somewhere but no record documents it`);
    for (const r of asSource) {
      assert.ok(/redirect|merged|formerly|rebrand|no longer/i.test(`${r.shortNote} ${r.limitations || ''}`),
        `${r.id} cites ${host} without explaining the redirect or rebrand`);
    }
  }
});

// ── 4-6. vocabularies ───────────────────────────────────────────────────────

test('every row validates against the declared vocabularies', () => {
  assert.ok(RAW.length >= 100, `expected a populated dataset, found ${RAW.length}`);
  for (const r of RAW) {
    assert.deepStrictEqual(MD.problemsFor(r, COUNTRIES), [], `${r.id} failed validation`);
  }
});

test('no vocabulary value is declared and never used, or used and never declared', () => {
  const used = {
    categories: new Set(ROWS.flatMap((r) => r.categories)),
    opportunityTypes: new Set(ROWS.flatMap((r) => r.opportunityTypes)),
    costModel: new Set(ROWS.map((r) => r.costModel)),
  };
  for (const v of used.categories) assert.ok(MD.CATEGORIES.includes(v), `${v} is not a declared category`);
  for (const v of used.opportunityTypes) {
    assert.ok(MD.OPPORTUNITY_TYPES.includes(v), `${v} is not a declared opportunity type`);
  }
  for (const v of used.costModel) assert.ok(MD.COST_MODELS.includes(v), `${v} is not a declared cost model`);
});

test('every vocabulary value has exactly one label', () => {
  for (const v of MD.OPPORTUNITY_TYPES) {
    assert.ok(build.OPPORTUNITY_LABELS[v], `the opportunity type ${v} has no label`);
  }
  for (const v of MD.CATEGORIES) assert.ok(build.CATEGORY_LABELS[v], `the category ${v} has no label`);
  for (const v of MD.COST_MODELS) assert.ok(build.COST_LABELS[v], `the cost model ${v} has no label`);
});

// ── 7-13. THE SEMANTIC RULES ────────────────────────────────────────────────

test('a rejected or dead platform never reaches the actionable output', () => {
  for (const r of ROWS) {
    if (r.priority === 'reject' || ['shutting-down', 'dormant', 'redirected'].includes(r.currentStatus)) {
      assert.ok(!ACTIONABLE.includes(r), `${r.id} is rejected or dead but appears in the actionable set`);
    }
  }
  const rendered = (page().match(/class="bd-row"/g) || []).length;
  assert.strictEqual(rendered, ACTIONABLE.length, 'the page renders a different number of rows');
});

test('no record points at a domain that closed or was repurposed', () => {
  // Every one of these was reached during research and is not what its name
  // says. readwrite.com — once a respected technology publication — now serves
  // online casino content. protocol.com redirects to a domain-sale listing.
  // sourcewire.com is parked on HugeDomains. connectively.us was discontinued
  // by Cision on 9 December 2024.
  const GONE = ['readwrite.com', 'protocol.com', 'sourcewire.com', 'connectively.us',
    'newswiretoday.com', 'backpage.com', 'letgo.com'];
  const sites = ROWS.map((r) => r.website.toLowerCase());
  for (const bad of GONE) {
    assert.ok(!sites.some((w) => w.includes(bad)),
      `${bad} no longer operates as the platform it is named after`);
  }
});

test('press release is never conflated with editorial pitch', () => {
  // A wire carries your announcement. An editor decides whether to write about
  // you. Pointing both at one URL says they are the same act.
  for (const r of ROWS) {
    if (r.pressReleaseUrl && r.pitchUrl) {
      assert.notStrictEqual(r.pressReleaseUrl, r.pitchUrl,
        `${r.id} points the release route and the pitch route at one URL`);
    }
    if (r.categories.includes('press-release-distribution')) {
      assert.ok(!r.opportunityTypes.includes('editorial-pitch'),
        `${r.id} is a distribution network claiming an editorial pitch route`);
    }
  }
});

test('sponsored content is never presented as organic editorial', () => {
  for (const r of ROWS) {
    if (r.opportunityTypes.includes('sponsored-content')) {
      assert.notStrictEqual(r.sponsoredContentAvailable, false,
        `${r.id} claims sponsored content while denying it`);
      assert.ok(r.costModel !== 'free',
        `${r.id} offers sponsored content and is marked free, which cannot both be true`);
    }
    // A record carrying BOTH a free editorial route and a paid one must be
    // `mixed`, so a reader is never told the whole platform is free.
    const editorial = r.opportunityTypes.some((t) => MD.GATEKEPT_TYPES.has(t));
    if (editorial && r.opportunityTypes.includes('sponsored-content')) {
      assert.strictEqual(r.costModel, 'mixed',
        `${r.id} has a free editorial route and a paid one but is not marked mixed`);
    }
  }
});

test('a journalist-source platform is not a publication', () => {
  // Qwoted is where a reporter finds you. It does not publish you. A record
  // conflating the two would send someone to pitch an article to a database.
  for (const r of ROWS.filter((x) => x.categories.includes('journalist-source-platform'))) {
    for (const t of ['editorial-submission', 'contributed-article', 'editorial-pitch']) {
      assert.ok(!r.opportunityTypes.includes(t),
        `${r.id} is a source platform claiming "${t}", which is what a publication offers`);
    }
  }
});

test('self-publish is never the same claim as editorial submission', () => {
  for (const r of ROWS) {
    const self = r.opportunityTypes.filter((t) => MD.SELF_SERVE_TYPES.has(t));
    const gate = r.opportunityTypes.filter((t) => MD.GATEKEPT_TYPES.has(t));
    if (self.length && gate.length) {
      assert.ok(r.limitations && r.limitations.length > 30,
        `${r.id} claims both a self-serve and a gatekept route without explaining which is which`);
    }
    if (gate.length) {
      assert.notStrictEqual(r.requiresEditorialApproval, false,
        `${r.id} has a gatekept route but denies editorial approval`);
    }
  }
});

test('a paid contributor programme is never described as staff coverage', () => {
  const paidContributor = ROWS.filter((r) => r.costModel === 'paid'
    && r.opportunityTypes.includes('contributed-article'));
  assert.ok(paidContributor.length > 0, 'expected at least one paid contributor programme');
  for (const r of paidContributor) {
    assert.match(`${r.shortNote} ${r.limitations || ''}`, /paid|fee|membership/i,
      `${r.id} is a paid programme and does not say so in prose`);
    assert.ok(!/staff (coverage|journalism|report)/i.test(r.shortNote)
      || /not the same|separate|rather than/i.test(r.limitations || ''),
      `${r.id} implies staff coverage`);
  }
});

test('a URL is only present when an opportunity type justifies it', () => {
  for (const r of ROWS) {
    for (const [field, needed] of Object.entries(MD.URL_REQUIRES)) {
      if (!r[field]) continue;
      assert.ok(needed.some((t) => r.opportunityTypes.includes(t)),
        `${r.id} carries ${field} with no opportunity type behind it`);
    }
  }
});

test('"route not established" is an admission, never one item in a list', () => {
  for (const r of ROWS) {
    if (!r.opportunityTypes.includes('unknown')) continue;
    assert.strictEqual(r.opportunityTypes.length, 1,
      `${r.id} says the route is unknown and also names one`);
    for (const f of ['submissionUrl', 'pitchUrl', 'pressReleaseUrl']) {
      assert.strictEqual(r[f], null, `${r.id} has no established route but carries ${f}`);
    }
    assert.ok(r.limitations, `${r.id} has no established route and does not say why`);
  }
});

// ── 14, 19. what is never stored ────────────────────────────────────────────

test('no email address is stored anywhere in the dataset', () => {
  // Storing one means deciding whether it was verified or inferred, and an
  // inferred newsroom address is indistinguishable from a fabricated one.
  const blob = fs.readFileSync(DATA_FILE, 'utf8');
  const found = blob.match(/[\w.+-]+@[\w-]+\.[\w.-]+|mailto:/gi);
  assert.strictEqual(found, null, `the dataset stores ${found && found[0]}`);
});

test('no private workflow state reaches the data or the export', () => {
  const PRIVATE = ['assignedTo', 'internalNote', 'workflowStatus', 'submittedAt',
    'followUpDate', 'assigned_to', 'internal_note', 'workflow_status'];
  const blob = fs.readFileSync(DATA_FILE, 'utf8');
  const csv = fs.readFileSync(CSV, 'utf8');
  for (const f of PRIVATE) {
    assert.ok(!blob.includes(f), `the dataset carries the private field ${f}`);
    assert.ok(!csv.includes(f), `the export carries the private field ${f}`);
  }
});

test('no Domain Rating is fabricated', () => {
  // CHANGED BY THE DOMAIN RATING POLICY REVERSAL. This test used to forbid the
  // field outright — "this dataset takes no measurements" — which was the right
  // shape while collection was frozen: with nothing being measured anywhere,
  // "carries no value" and "carries no INVENTED value" were the same rule, and
  // the cheaper one to write was the ban. The freeze has been lifted by the
  // repository's owner, because Ahrefs also publishes Domain Rating through a
  // free public endpoint the frozen policy was never written against, and every
  // domain in the corpus has now been read from it. So the ban is false while
  // the thing it was protecting is untouched, and it becomes the rule it was
  // standing in for: a rating may exist here, but only a MEASURED one.
  assert.ok(RAW.some((r) => typeof r.domainRating === 'number'),
    'no row carries a rating at all, so the rules below assert nothing');
  for (const r of RAW) {
    // A whole number on the 0-100 scale, arriving with provenance that names
    // the provider, the date and the domain measured. A bare number with no
    // provenance is exactly what an invented metric looks like.
    assert.deepStrictEqual(BD.domainRatingProblems(r), [],
      `${r.id} carries a Domain Rating that is not a valid, provenanced reading`);
    // And the reading has to describe THIS record's own domain. A figure copied
    // from a related domain, or down from a parent to a subdomain, attributes
    // an authority the measurement never claimed.
    const p = (r.metricsProvenance || {}).domainRating;
    if (!p) continue;
    assert.strictEqual(p.measuredDomain, BD.normaliseDomain(r.website),
      `${r.id} reports a rating measured on "${p.measuredDomain}", not on its own domain`);
  }
  // A Domain Rating is a fact about a domain, so records published on one
  // measured domain repeat that domain's single dated reading verbatim rather
  // than each carrying a figure of its own.
  assert.deepStrictEqual(BD.sharedDomainSnapshotProblems(RAW), [],
    'two records on one measured domain report different readings');
  // The rules above are only worth running if they can fail, and the corpus no
  // longer holds an unmeasured or a malformed row to prove it on. Fixtures
  // rather than a deleted check: missing stays legal, and a bare number — the
  // fabrication this test is named for — is still refused.
  assert.deepStrictEqual(BD.domainRatingProblems({ id: 'md-fixture', domainRating: null }), [],
    'an unmeasured record is now reported as a problem, so "missing" has become "wrong"');
  assert.ok(BD.domainRatingProblems({ id: 'md-fixture', domainRating: 72 }).length > 0,
    'a rating carrying no provenance is accepted, which is what a fabricated metric looks like');
  const src = fs.readFileSync(path.join(ROOT, 'scripts/lib/media-schema.cjs'), 'utf8')
    + fs.readFileSync(path.join(ROOT, 'scripts/build-media-platforms.cjs'), 'utf8');
  assert.ok(!/domainRating\s*[:=]\s*\d/.test(src), 'a Domain Rating is assigned in code');
});

// ── 9, 17. the rendered page ────────────────────────────────────────────────

test('a button is never drawn for a URL that does not exist', () => {
  // A dead "Submit" teaches a reader that the route exists and the site is
  // broken. The truth is that no route was found, and one fewer button says so.
  const html = page();
  const hrefs = [...html.matchAll(/class="bd-cta-link" href="([^"]*)"/g)].map((m) => m[1]);
  assert.ok(hrefs.length > 0, 'the page renders no actions at all');
  // Two kinds of control now share this class: an outbound action on a platform
  // and an inbound link to a generated recommendation page. The property is the
  // same for both — it must point at a route that exists — so an internal link
  // is resolved against the filesystem rather than rejected for not being
  // external. The first version asserted the implementation ("starts with
  // https") and failed the moment the page gained a legitimate internal link.
  const internal = hrefs.filter((h) => h.startsWith('/'));
  const external = hrefs.filter((h) => !h.startsWith('/'));
  for (const h of external) {
    assert.ok(/^https:\/\//.test(h), `an action links to "${h}", which is not a URL`);
  }
  for (const h of internal) {
    assert.ok(fs.existsSync(path.join(ROOT, h.replace(/^\//, ''), 'index.html')),
      `an action links to ${h}, which was never generated`);
  }
  const known = new Set(ACTIONABLE.flatMap((r) => [r.website, r.submissionUrl, r.pitchUrl,
    r.pressReleaseUrl, r.advertisingUrl, r.mediaKitUrl, r.contactUrl].filter(Boolean)));
  for (const h of external) {
    assert.ok(known.has(h.replace(/&amp;/g, '&')), `the page renders ${h}, which no record carries`);
  }
  // And the count matches exactly: every URL in the data is drawn once.
  assert.strictEqual(external.length, ACTIONABLE.reduce((n, r) => n
    + [r.website, r.submissionUrl, r.pitchUrl, r.pressReleaseUrl, r.advertisingUrl,
      r.mediaKitUrl, r.contactUrl].filter(Boolean).length, 0),
  'the number of rendered actions does not match the number of URLs in the data');
});

test('every actionable row exists in static HTML and none is hidden', () => {
  const html = page();
  assert.strictEqual((html.match(/class="bd-row"/g) || []).length, ACTIONABLE.length);
  assert.ok(!/<tr class="bd-row"[^>]*\shidden/.test(html), 'rows are hidden in the served HTML');
  assert.ok(html.includes('data-bd-rows'), 'the table body is not wired for progressive enhancement');
});

test('every filter value on a control exists on a row', () => {
  const html = page();
  const body = html.slice(html.indexOf('<tbody'));
  for (const facet of ['country', 'audience', 'category', 'industry', 'opportunity', 'cost',
    'language', 'priority', 'status']) {
    const at = html.indexOf(`data-bd-facet="${facet}"`);
    assert.ok(at > -1, `the ${facet} filter is missing`);
    const block = html.slice(at, html.indexOf('</select>', at));
    const options = [...block.matchAll(/value="([^"]*)"/g)].map((m) => m[1]).filter(Boolean);
    assert.ok(options.length > 0, `the ${facet} filter offers no values`);
    const onRows = new Set([...body.matchAll(new RegExp(`data-bd-facet-${facet}="([^"]*)"`, 'g'))]
      .flatMap((m) => m[1].split(' ')).filter(Boolean));
    for (const o of options) {
      assert.ok(onRows.has(o),
        `the ${facet} filter offers "${o}", which no row carries — selecting it would empty the table`);
    }
  }
  assert.ok(html.includes('data-bd-search'), 'the page has no search field');
  assert.ok(html.includes('data-bd-clear'), 'the page has no clear-filters control');
});

test('a list-valued facet declares itself so the client matches on membership', () => {
  // A record has several categories and one country. Without the declaration
  // the client compares the whole space-separated list to one value and every
  // multi-valued row disappears from its own filter.
  const html = page();
  for (const facet of ['category', 'industry', 'opportunity', 'language']) {
    const at = html.indexOf(`data-bd-facet="${facet}"`);
    const tag = html.slice(at, html.indexOf('>', at));
    assert.ok(tag.includes('data-bd-facet-multi'), `the ${facet} filter is not declared list-valued`);
  }
  for (const facet of ['country', 'cost', 'priority', 'status']) {
    const at = html.indexOf(`data-bd-facet="${facet}"`);
    const tag = html.slice(at, html.indexOf('>', at));
    assert.ok(!tag.includes('data-bd-facet-multi'), `the ${facet} filter is wrongly declared list-valued`);
  }
  const js = fs.readFileSync(path.join(ROOT, 'js/business-directories.js'), 'utf8');
  assert.ok(js.includes('data-bd-facet-multi'), 'the client does not honour the declaration');
});

test('the default order puts the highest-priority work first', () => {
  const html = page();
  const body = html.slice(html.indexOf('<tbody'));
  const order = [...body.matchAll(/data-bd-facet-priority="([^"]*)"/g)].map((m) => m[1]);
  assert.ok(order.length > 50, 'not enough rows to check ordering');
  // The expected order is written down HERE, independently of the constant the
  // sort reads. The first version compared the page against MD.PRIORITY_RANK,
  // so inverting that constant reordered the page and the assertion together
  // and the guard could not fail — the same self-defeating shape as a test that
  // selects rows by the property it then asserts.
  const EXPECTED = ['P1', 'P2', 'P3', 'hold'];
  assert.deepStrictEqual(Object.keys(MD.PRIORITY_RANK).filter((k) => k !== 'reject'), EXPECTED,
    'the priority vocabulary changed; the intended order in this test must be updated deliberately');
  const rank = (p) => {
    const i = EXPECTED.indexOf(p);
    assert.ok(i > -1, `a row carries the unexpected priority "${p}"`);
    return i;
  };
  for (let i = 1; i < order.length; i += 1) {
    assert.ok(rank(order[i - 1]) <= rank(order[i]),
      `a ${order[i]} row precedes a ${order[i - 1]} row`);
  }
});

test('every body cell carries its mobile label and every control a real label', () => {
  const html = page();
  const cells = (html.match(/<td class="bd-cell[^"]*"/g) || []).length;
  const labelled = (html.match(/data-bd-label="/g) || []).length;
  assert.strictEqual(cells, labelled, 'a body cell has no mobile label; the table will not stack');
  for (const m of html.matchAll(/<select class="bd-select" id="([^"]+)"/g)) {
    assert.ok(html.includes(`for="${m[1]}"`), `the ${m[1]} control has no label`);
  }
  for (const m of html.matchAll(/<input class="bd-input" id="([^"]+)"/g)) {
    assert.ok(html.includes(`for="${m[1]}"`), `the ${m[1]} control has no label`);
  }
});

// ── 15. nothing is hardcoded ────────────────────────────────────────────────

test('no count and no geography claim is hardcoded', () => {
  // The marketplace page called itself European for four waves after the data
  // stopped being European, and nothing recomputed the word.
  const src = fs.readFileSync(path.join(ROOT, 'scripts/build-media-platforms.cjs'), 'utf8')
    + fs.readFileSync(path.join(ROOT, 'scripts/lib/bd-seo.cjs'), 'utf8')
      .slice(fs.readFileSync(path.join(ROOT, 'scripts/lib/bd-seo.cjs'), 'utf8').indexOf('buildMediaMeta'), -1);
  const html = page();
  const title = (html.match(/<title>([^<]*)<\/title>/) || [, ''])[1];
  const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [, ''])[1];
  for (const continent of ['Europe', 'European', 'Asia', 'Africa', 'Latin America']) {
    assert.ok(!new RegExp(`\\b${continent}\\b`).test(`${title} ${desc}`),
      `the page chrome claims ${continent}; nothing recomputes that word`);
  }
  // Look for the total as a numeric literal in code, not as any occurrence of
  // the digits. The first version stripped one array literal and then fired on
  // "385" appearing inside an unrelated string, which is not a hardcoded count.
  const codeOnly = src
    .replace(/\/\/[^\n]*/g, ' ')             // line comments
    .replace(/\/\*[\s\S]*?\*\//g, ' ')       // block comments
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")     // string literals
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
  assert.ok(!new RegExp(`(?<![\\w.])${ACTIONABLE.length}(?![\\w.])`).test(codeOnly),
    `the generator hardcodes the current total ${ACTIONABLE.length}`);
  assert.ok(desc.startsWith(`${ACTIONABLE.length} media outlets`),
    `the description does not state the derived total: "${desc}"`);
  assert.ok(text(html).includes(`${ACTIONABLE.length} opportunities`),
    'the hero does not state the derived total');
});

// ── 16. the export ──────────────────────────────────────────────────────────

test('the export is parseable, complete and agrees with the data', () => {
  const csv = fs.readFileSync(CSV, 'utf8');
  assert.strictEqual(csv.charCodeAt(0), 0xFEFF, 'the CSV needs a BOM for Excel on Windows');
  assert.ok(csv.endsWith('\r\n'), 'the CSV must end with CRLF');
  const rows = parseCsv(csv);
  assert.deepStrictEqual(rows[0], build.COLUMNS);
  assert.strictEqual(rows.length - 1, ACTIONABLE.length, 'CSV parity with the actionable set');
  for (const r of rows) {
    assert.strictEqual(r.length, build.COLUMNS.length,
      `a CSV row has ${r.length} fields for ${build.COLUMNS.length} columns`);
  }
  // Spot-check a real value round-trips, including one with a comma in it.
  const byId = new Map(rows.slice(1).map((r) => [r[0], r]));
  for (const rec of ACTIONABLE) {
    const row = byId.get(rec.id);
    assert.ok(row, `${rec.id} is missing from the export`);
    assert.strictEqual(row[1], rec.name);
    assert.strictEqual(row[build.COLUMNS.indexOf('opportunity_types')], rec.opportunityTypes.join('; '));
    assert.strictEqual(row[build.COLUMNS.indexOf('note')], rec.shortNote);
  }
});

// ── 23-25. build properties ─────────────────────────────────────────────────

test('the render is deterministic and locale-independent', () => {
  const a = build.renderCsv(ACTIONABLE.slice().sort(MD.comparePlatforms));
  const b = build.renderCsv([...ACTIONABLE].reverse().sort(MD.comparePlatforms));
  assert.strictEqual(a, b, 'the export depends on input order');
  for (const f of ['scripts/lib/media-schema.cjs', 'scripts/build-media-platforms.cjs']) {
    assert.ok(!/\.localeCompare\s*\(/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')),
      `${f} calls localeCompare, which is not reproducible across hosts`);
  }
});

test('no build-time network call was introduced', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/build-media-platforms.cjs'), 'utf8')
    + fs.readFileSync(path.join(ROOT, 'scripts/lib/media-schema.cjs'), 'utf8');
  assert.ok(!/\bfetch\s*\(|https?\.request\s*\(|axios\.|node-fetch/.test(src),
    'the media build makes a network call');
});

test('the media build owns only its own output', () => {
  const manifest = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'data/media-pr-publishing/.build-manifest.json'), 'utf8'));
  assert.ok(manifest.files.length > 0, 'the manifest claims nothing');
  const I18N_T = require(path.join(ROOT, 'scripts/lib/i18n.cjs'));
  const owns = (f) => I18N_T.LOCALE_CODES
    .some((l) => f.startsWith(I18N_T.localizedPath(l, '/research/media-pr-publishing/').replace(/^\//, '')));
  for (const f of manifest.files) {
    assert.ok(owns(f), `the media manifest claims ${f}, which is outside its own routes`);
  }
});

// ── 26. no thin detail-page explosion ───────────────────────────────────────

test('the collection is one page, not a thousand thin ones', () => {
  const dir = path.join(ROOT, 'research/media-pr-publishing');
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const pages = walk(dir).filter((f) => f.endsWith('.html'));
  // The property is that there is no page-per-record explosion, not that there
  // is exactly one page. Recommendation pages are a small fixed set, each
  // ranking many records with its own methodology and limitations — the
  // opposite of a thin page. Asserted as a ratio against the dataset plus a
  // substance floor, so 13 substantial pages pass and 385 stubs could not.
  const LOCALES_N = require(path.join(ROOT, 'scripts/lib/i18n.cjs')).LOCALE_CODES.length;
  assert.ok(pages.length <= LOCALES_N * (1 + Math.ceil(ACTIONABLE.length / 20)),
    `${pages.length} HTML pages for ${ACTIONABLE.length} records looks like a page-per-record explosion`);
  for (const p of pages) {
    const html = fs.readFileSync(p, 'utf8');
    const body = html.slice(html.indexOf('<main')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    assert.ok(body.length > 2000, `${path.relative(ROOT, p)} is a thin page (${body.length} chars of text)`);
  }
});

// ── 20-22. SEO and discoverability ──────────────────────────────────────────

test('the page is a real page with correct structured data', () => {
  const html = page();
  assert.match(html, /^<!DOCTYPE html>/, 'no document shell');
  assert.match(html, /<title>[^<]+<\/title>/, 'no title');
  assert.ok(html.includes('rel="canonical" href="https://petrohrys.com/research/media-pr-publishing/"'),
    'the canonical is missing or wrong');
  assert.ok(html.includes('property="og:title"') && html.includes('name="twitter:card"'),
    'social metadata is missing');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => JSON.parse(m[1]));
  const graph = blocks.flatMap((b) => b['@graph'] || [b]);
  const types = graph.map((n) => n['@type']);
  assert.ok(types.includes('CollectionPage'), 'no CollectionPage');
  assert.ok(types.includes('BreadcrumbList'), 'no BreadcrumbList');
  assert.ok(html.includes('class="breadcrumb'), 'no visible breadcrumb');
});

test('the page does not declare another collection’s feed as its own', () => {
  // renderPage emitted the Business Directories RSS alternate unconditionally,
  // so the Marketplace page — and this one — told feed readers that updates
  // arrive somewhere they do not.
  assert.ok(!page().includes('application/rss+xml'),
    'the media page declares an RSS feed that does not carry it');
  assert.ok(!fs.readFileSync(path.join(ROOT, 'research/marketplaces/index.html'), 'utf8')
    .includes('application/rss+xml'), 'the marketplace page declares a feed that does not carry it');
  // And the collection that DOES own the feed still declares it.
  assert.ok(fs.readFileSync(path.join(ROOT, 'research/business-directories/index.html'), 'utf8')
    .includes('application/rss+xml'), 'the business directories hub lost its own feed link');
});

test('the collection is reachable and is not an orphan', () => {
  const LINK = '/research/media-pr-publishing/';
  assert.strictEqual(render.MEDIA_PATH, seo.buildMediaMeta({ count: 1, countries: 1, p1: 1 }).canonicalPath,
    'the shared media route and canonical path disagree');
  // Checked inside the Collections section rather than against the whole file.
  const hub = fs.readFileSync(path.join(ROOT, 'research/index.html'), 'utf8');
  const at = hub.indexOf('id="collections"');
  assert.ok(at > -1, 'the Research Center has no Collections section');
  const collections = hub.slice(at, hub.indexOf('</section>', at));
  assert.ok(collections.includes(LINK),
    'the Research Center does not list the collection among its databases');
  assert.ok(/Media, PR &amp; Publishing Platforms/.test(collections),
    'the collection is linked from the hub without being named');
  assert.ok(fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8')
    .includes(`https://petrohrys.com${LINK}`), 'the collection is missing from the sitemap');
});

test('the page states the boundary between the three datasets', () => {
  const t = text(page());
  assert.match(t, /business directories and company registries/i,
    'the page does not say that business directories are excluded');
  assert.match(t, /marketplace and classified platforms/i,
    'the page does not say that marketplaces are excluded');
  assert.match(t, /link farms|guest-post farms|selling dofollow links/i,
    'the page does not state the SEO quality boundary');
});

test('the page teaches the distinction the dataset is built on', () => {
  // If a reader cannot tell an editorial pitch from a press release from a paid
  // placement, the opportunity type column is decoration.
  const t = text(page());
  assert.match(t, /a contact page is not a submission route/i);
  assert.match(t, /editorial pitch means an editor decides/i);
  assert.match(t, /never means no/i, 'the page does not explain that a blank cell is not a "no"');
});

test('the build refuses to prune a file outside its own directory', () => {
  // The manifest is a file on disk, and the prune loop deleted whatever it
  // named. A mutation run wrote "sitemap.xml" into it and the next build
  // removed the site sitemap — a generator that owns one directory reaching out
  // and deleting a tracked file elsewhere in the repository.
  const MANIFEST = path.join(ROOT, 'data/media-pr-publishing/.build-manifest.json');
  const snapshot = fs.readFileSync(MANIFEST, 'utf8');
  const sitemap = path.join(ROOT, 'sitemap.xml');
  const sitemapBefore = fs.readFileSync(sitemap, 'utf8');
  try {
    fs.writeFileSync(MANIFEST, JSON.stringify({ files: ['sitemap.xml'] }, null, 2));
    let threw = null;
    try {
      require('node:child_process').execFileSync('node',
        [path.join(ROOT, 'scripts/build-media-platforms.cjs')], { cwd: ROOT, stdio: 'pipe' });
    } catch (e) { threw = `${e.stdout || ''}${e.stderr || ''}`; }
    assert.ok(threw, 'the build accepted a manifest claiming a file outside its own directory');
    assert.match(threw, /Refusing to prune sitemap\.xml/,
      'the build failed for some other reason than the prune guard');
    assert.ok(fs.existsSync(sitemap), 'the build deleted the site sitemap');
    assert.strictEqual(fs.readFileSync(sitemap, 'utf8'), sitemapBefore,
      'the site sitemap was modified by the media build');
  } finally {
    fs.writeFileSync(MANIFEST, snapshot);
    if (!fs.existsSync(sitemap)) fs.writeFileSync(sitemap, sitemapBefore);
  }
});

test('a city-sharded network is one opportunity, not one per city', () => {
  // American City Business Journals publishes in roughly forty metros and Built
  // In in eight, but each is one platform behind one submission system:
  // phoenixbusinessjournal.com redirects to bizjournals.com/phoenix/ and
  // BostInno to bizjournals.com/boston/inno. Listing the city titles separately
  // would multiply the database by forty and mean exactly one submission — the
  // same rule that keeps Craigslist to one row in the marketplace dataset.
  for (const [host, cities] of [['bizjournals.com', ['phoenixbusinessjournal.com', 'bostinno.com']],
    ['builtin.com', ['builtinchicago.org', 'builtinaustin.com', 'builtincolorado.com']]]) {
    const rows = ROWS.filter((r) => MD.hostOf(r.website) === host);
    assert.strictEqual(rows.length, 1, `${host} has ${rows.length} rows; its city titles are one platform`);
    assert.match(rows[0].limitations || '', /one (opportunity|platform)|not forty|not one per city/i,
      `${rows[0].id} does not explain why its city titles are not separate rows`);
    for (const city of cities) {
      assert.ok(!ROWS.some((r) => MD.hostOf(r.website) === city),
        `${city} is listed separately from ${host}, which is the same submission system`);
      assert.ok(rows[0].sources.some((s) => s.includes(city)),
        `${rows[0].id} claims the city titles are one platform without citing ${city} as evidence`);
    }
  }
});

test('an award is an application route, never an article about an award', () => {
  // "Awards" is a new category this wave. The failure mode it invites is
  // listing editorial coverage OF an award — a "best companies" article — as if
  // a company could enter it. Every award row must carry a real entry route.
  const awards = ROWS.filter((r) => r.categories.includes('business-awards'));
  assert.ok(awards.length >= 4, `expected an awards family, found ${awards.length}`);
  for (const r of awards) {
    assert.ok(r.opportunityTypes.includes('award-entry') || r.opportunityTypes.includes('company-profile'),
      `${r.id} is filed under awards without an entry or profile route`);
    if (r.opportunityTypes.includes('award-entry')) {
      assert.ok(r.submissionUrl, `${r.id} claims an award entry with no submission URL`);
      assert.strictEqual(r.requiresEditorialApproval, true,
        `${r.id} is an award that nobody judges, which is a listing, not an award`);
    }
  }
});

test('a distribution wire carries a release route, never a submission route', () => {
  // Wave 3 added six national press-release wires — PR TIMES, @Press,
  // ValuePress, DreamNews, Kyodo News PR Wire, Newswire.co.kr — and every one
  // of them was first written with its route in submissionUrl. The schema
  // refused the file, because press-release binds to pressReleaseUrl and
  // submissionUrl means "an editor receives this". Sending a company
  // announcement down a route labelled as editorial submission is the exact
  // conflation this dataset exists to prevent, and it is easy to repeat.
  const wires = ROWS.filter((r) => r.categories.includes('press-release-distribution'));
  assert.ok(wires.length >= 15, `expected the wire family, found ${wires.length}`);
  for (const r of wires) {
    assert.ok(r.opportunityTypes.includes('press-release'),
      `${r.id} is filed as distribution without a press-release route`);
    assert.strictEqual(r.pitchUrl, null,
      `${r.id} is a wire claiming an editorial pitch URL; a wire has no editor to pitch`);
    if (r.submissionUrl) {
      assert.ok(r.opportunityTypes.some((t) => ['self-publish', 'company-profile'].includes(t)),
        `${r.id} carries a submissionUrl but only distributes releases; use pressReleaseUrl`);
    }
  }
});

test('the expat and international-community wave is bounded, measured and evidence-safe', () => {
  const wave = ROWS.filter((r) => r.categories.includes('expat-community-media'));
  assert.strictEqual(wave.length, 300,
    `the expat-media wave must contain exactly 300 records, found ${wave.length}`);
  assert.ok(new Set(wave.map((r) => r.country)).size >= 45,
    'the wave does not cover enough countries to be an international collection');

  for (const r of wave) {
    assert.ok(r.domainRating >= 30,
      `${r.id} entered the quality wave below the measured DR 30 floor`);
    assert.strictEqual(r.metricsProvenance.domainRating.provider, 'Ahrefs');
    assert.strictEqual(r.metricsProvenance.domainRating.status, 'publicApiReading');
    assert.match(r.shortNote,
      /expatriate|international community|English-language|diaspora|global mobility/i,
      `${r.id} does not explain its expat or international-community audience fit`);
    if (r.backlinkType) {
      assert.ok(r.backlinkProvenance && r.backlinkProvenance.listingUrl,
        `${r.id} claims a link type without an inspected public page`);
    }
  }

  const follow = wave.filter((r) => r.backlinkType === 'dofollow');
  assert.deepStrictEqual(follow.map((r) => MD.hostOf(r.website)).sort(), ['expat.com', 'expats.cz'],
    'the wave gained an uninspected follow-link claim');
  for (const host of ['expat.com', 'expats.cz']) {
    const row = follow.find((r) => MD.hostOf(r.website) === host);
    assert.ok(row, `${host} lost its inspected follow-link evidence`);
    assert.strictEqual(row.linkTargetType, 'direct');
    assert.strictEqual(row.listingIndexability, 'indexable');
  }
});

test('a local-language publication is not labelled English', () => {
  // Wave 3 was the first to research Japanese, Korean and Chinese surfaces. A
  // row for a Japanese-language publication that declares languages: ['en']
  // sends an employee to write a pitch in the wrong language, and the language
  // filter — the whole point of recording it — then lies.
  const CJK = /[぀-ヿ㐀-䶿一-鿿가-힯]/;
  const EXPECTED = { japan: 'ja', 'south-korea': 'ko', china: 'zh' };
  for (const [country, code] of Object.entries(EXPECTED)) {
    const rows = ROWS.filter((r) => r.country === country);
    assert.ok(rows.length >= 8, `${country} has only ${rows.length} rows`);
    for (const r of rows) {
      if (r.languages.includes('en') && !r.languages.includes(code)) {
        // Legitimate only for a publication that genuinely publishes in English.
        assert.ok(/english/i.test(`${r.shortNote} ${r.limitations || ''}`),
          `${r.id} is published in ${country} and declares only English without saying so`);
      }
    }
    // And a name written in the local script must carry the local language.
    for (const r of rows.filter((x) => CJK.test(x.name))) {
      assert.ok(r.languages.includes(code),
        `${r.id} has a ${country} name in local script but does not declare "${code}"`);
    }
  }
});

test('the affordable launch-platform batch stays qualified by observed link evidence', () => {
  const ids = ['md-betterlaunch', 'md-codehype', 'md-founder-best', 'md-launchfree',
    'md-launchit', 'md-launchzone', 'md-openhunts', 'md-peerpush'];
  for (const id of ids) {
    const row = ROWS.find((r) => r.id === id);
    assert.ok(row, `${id} is missing from the media registry`);
    assert.strictEqual(row.priority, 'P3', `${id} was promoted without independent audience evidence`);
    assert.ok(row.submissionUrl, `${id} has no actionable submission route`);
    assert.ok(row.backlinkType, `${id} has no observed link type`);
    assert.ok(row.backlinkProvenance && row.backlinkProvenance.listingUrl,
      `${id} has no public evidence page`);
    assert.strictEqual(row.listingIndexability, 'indexable',
      `${id} no longer has an observed indexable evidence page`);
  }
  assert.strictEqual(ROWS.find((r) => r.id === 'md-peerpush').backlinkType, 'dofollow');
  assert.strictEqual(ROWS.find((r) => r.id === 'md-launchit').backlinkType, 'nofollow');
  assert.strictEqual(ROWS.find((r) => r.id === 'md-codehype').backlinkType, 'mixed');
  assert.strictEqual(ROWS.find((r) => r.id === 'md-founder-best').backlinkType, 'mixed');
});

test('the second launch-platform batch preserves observed follow behavior', () => {
  const expected = new Map([
    ['md-toolfound', 'dofollow'],
    ['md-startup-fame', 'dofollow'],
    ['md-firsto', 'mixed'],
    ['md-earlyhunt', 'mixed'],
    ['md-fazier', 'dofollow'],
    ['md-uneed', 'dofollow'],
    ['md-startupbase', 'mixed'],
    ['md-saashub', 'dofollow'],
    ['md-betalist', 'nofollow'],
  ]);

  for (const [id, backlinkType] of expected) {
    const row = ROWS.find((r) => r.id === id);
    assert.ok(row, `${id} is missing from the media registry`);
    assert.strictEqual(row.backlinkType, backlinkType,
      `${id} no longer matches the observed link behavior`);
    assert.strictEqual(row.listingIndexability, 'indexable',
      `${id} no longer has an observed indexable evidence page`);
    assert.ok(row.backlinkProvenance && row.backlinkProvenance.listingUrl,
      `${id} has no public evidence page`);
  }

  assert.strictEqual(ROWS.some((r) => MD.hostOf(r.website) === 'smollaunch.com'), false,
    'Smol Launch was added despite both inspected free listings using nofollow links');
});

test('the third launch-platform batch keeps free and paid link evidence separate', () => {
  const expected = new Map([
    ['md-nick-launches', 'dofollow'],
    ['md-magicbox-tools', 'dofollow'],
    ['md-aura-plus-plus', 'nofollow'],
    ['md-deeplaunch', 'dofollow'],
    ['md-shinylaunch', 'dofollow'],
    ['md-tinylaunchpad', 'mixed'],
    ['md-shipboost', 'mixed'],
    ['md-indiehunt', 'mixed'],
    ['md-hunt0', 'dofollow'],
    ['md-shipybara', 'nofollow'],
  ]);

  for (const [id, backlinkType] of expected) {
    const row = ROWS.find((r) => r.id === id);
    assert.ok(row, `${id} is missing from the media registry`);
    assert.strictEqual(row.priority, 'P3', `${id} was promoted without independent audience evidence`);
    assert.strictEqual(row.backlinkType, backlinkType,
      `${id} no longer matches the inspected listing template`);
    assert.strictEqual(row.listingIndexability, 'indexable');
    assert.ok(row.domainRating !== null, `${id} has no measured Ahrefs Domain Rating`);
    assert.ok(row.backlinkProvenance && row.backlinkProvenance.listingUrl,
      `${id} has no public evidence page`);
  }

  for (const id of ['md-aura-plus-plus', 'md-shipybara']) {
    const row = ROWS.find((r) => r.id === id);
    assert.match(row.limitations, /no (?:paid follow|Premium) template was independently observed/i,
      `${id} presents a paid follow promise as observed evidence`);
  }
});

test('the mobile card layout keeps filtered rows hidden', () => {
  const css = fs.readFileSync(path.join(ROOT, 'css/business-directories.css'), 'utf8');
  assert.match(css, /\.bd-table \.bd-row\[hidden\]\s*\{\s*display:\s*none;/,
    'the mobile display:block rule overrides filtered rows');
});
