'use strict';
// The worklist was findable only by knowing its URL.
//
// 502 opportunities were generated, sitemapped — and linked from NOWHERE. The
// hub did not mention them, no country or category page pointed at them, and the
// Research Center listed only the editorial collection. The page existed and was
// unreachable, which is the same as not existing.
//
// These tests hold the fix: inbound links from every level, derived counts that
// cannot drift, working filters, and no dead internal links from compact rows.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const S = require('../lib/bd-schema.cjs');
const csv = require('../lib/bd-csv.cjs');
const ops = require('../lib/bd-opportunities.cjs');
const { loadRegistry } = require('../lib/bd-registry.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const REGISTRY = loadRegistry();
const ROWS = ops.loadOpportunities(
  path.join(ROOT, 'data', 'business-directories'),
  new Set(REGISTRY.countries.map((c) => c.slug)),
  new Set(REGISTRY.categories.map((c) => c.slug)),
);
const ACTIONABLE = csv.actionableOpportunities(REGISTRY.directories, ROWS);
const OPP = 'research/business-directories/opportunities/index.html';
const HUB = 'research/business-directories/index.html';
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

// ── 1-3. the page is reachable ──────────────────────────────────────────────
test('the worklist is linked from the hub, countries, categories and Research Center', () => {
  const LINK = '/research/business-directories/opportunities/';
  const hubHtml = read(HUB);
  assert.ok(hubHtml.includes(LINK), 'the Business Directories hub does not link the worklist');
  // Not merely mentioned somewhere: the hub must carry a PROMINENT call to
  // action. An earlier version of this test passed when the hero CTA was
  // gutted, because a secondary card link still mentioned the route.
  assert.match(hubHtml, new RegExp(`<a class="bd-button"[^>]*href="${LINK}"`),
    'the hub has no prominent button linking the worklist');
  assert.match(hubHtml, /class="bd-eyebrow">Business visibility database/i,
    'the hub hero panel is gone');
  assert.ok(read('research/index.html').includes(LINK),
    'the Research Center does not link the worklist');

  // Every country and category page must offer the route, so a reader who lands
  // on Germany can still reach the full list.
  const dir = path.join(ROOT, 'research/business-directories');
  let countries = 0; let categories = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'opportunities' || entry.name === 'guides') continue;
    const countryPage = path.join(dir, entry.name, 'index.html');
    if (fs.existsSync(countryPage)) {
      assert.ok(fs.readFileSync(countryPage, 'utf8').includes(LINK),
        `the ${entry.name} country page does not link the worklist`);
      countries += 1;
    }
    const cats = path.join(dir, entry.name, 'categories');
    if (fs.existsSync(cats)) {
      for (const cat of fs.readdirSync(cats)) {
        const p = path.join(cats, cat, 'index.html');
        if (!fs.existsSync(p)) continue;
        assert.ok(fs.readFileSync(p, 'utf8').includes(LINK),
          `the ${entry.name}/${cat} category page does not link the worklist`);
        categories += 1;
      }
    }
  }
  assert.ok(countries >= 8, `only ${countries} country pages link the worklist`);
  assert.ok(categories >= 8, `only ${categories} category pages link the worklist`);
});

test('the worklist is not an orphan and is in the sitemap', () => {
  const sitemap = read('sitemap-business-directories.xml');
  assert.ok(sitemap.includes('/research/business-directories/opportunities/'),
    'the worklist is missing from the sitemap');
  // Inbound links from more than one place, so removing one does not re-orphan it.
  let inbound = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === 'index.html' && !p.includes('/opportunities/')
        && fs.readFileSync(p, 'utf8').includes('/research/business-directories/opportunities/')) inbound += 1;
    }
  };
  walk(path.join(ROOT, 'research'));
  assert.ok(inbound >= 20, `only ${inbound} pages link the worklist; it is effectively unreachable`);
});

// ── 4-6. counts are derived, never hardcoded ────────────────────────────────
test('every stated count is the derived count', () => {
  const n = ACTIONABLE.length;
  const editorial = ACTIONABLE.filter((r) => !r.isOperationalRow).length;
  const rows = ACTIONABLE.filter((r) => r.isOperationalRow).length;
  assert.strictEqual(editorial + rows, n, 'the two levels do not reconcile to the total');

  const hub = text(read(HUB));
  assert.ok(hub.includes(`${n} business listing opportunities`),
    `the hub hero does not state the derived total ${n}`);
  assert.ok(hub.includes(`${n} active opportunities`), 'the hub stat line lost the derived total');
  assert.ok(hub.includes(`${editorial} detailed platform guides`),
    'the hub does not state the derived editorial count');
  assert.ok(hub.includes(`${rows} compact working-list entries`),
    'the hub does not state the derived compact-row count');

  const opp = read(OPP);
  const h1 = (opp.match(/<h1[^>]*>([^<]*)/) || [, ''])[1];
  assert.ok(h1.includes(String(n)), `the worklist H1 does not state ${n}: "${h1}"`);
});

test('no count is hardcoded anywhere in the generator', () => {
  // A literal total in the source would drift the moment a row is added.
  const src = read('scripts/build-business-directories.cjs');
  for (const stale of ['502 ', '500 opportunities', '426 ', '78 detailed']) {
    assert.ok(!src.includes(stale), `the generator hardcodes "${stale}"`);
  }
});

// ── 7-8. the working tool itself ────────────────────────────────────────────
test('the worklist renders every actionable opportunity in static HTML', () => {
  const html = read(OPP);
  const tables = html.match(/<table[\s\S]*?<\/table>/g) || [];
  assert.ok(tables.length >= 1, 'the worklist renders no table');
  const main = (tables[0].match(/<tr class="bd-row"/g) || []).length;
  assert.strictEqual(main, ACTIONABLE.length,
    `the main table renders ${main} rows for ${ACTIONABLE.length} opportunities`);
  // No-JS readers must get the whole list: rows are not hidden by default.
  assert.ok(!/<tr class="bd-row"[^>]*\shidden/.test(html), 'rows are hidden in the served HTML');
});

test('the CSV call to action exists and points at the real file', () => {
  const html = read(OPP);
  assert.ok(html.includes('/research/business-directories/opportunities.csv'),
    'the worklist does not link the CSV');
  assert.ok(read(HUB).includes('opportunities.csv'), 'the hub does not offer the CSV');
  assert.ok(fs.existsSync(path.join(ROOT, 'research/business-directories/opportunities.csv')),
    'the CSV link points at a file that does not exist');
  const rows = read('research/business-directories/opportunities.csv')
    .replace(/^﻿/, '').split('\r\n').filter(Boolean).length - 1;
  assert.strictEqual(rows, ACTIONABLE.length, 'the CSV and the page disagree on the total');
});

// ── 9-10. no dead internal links ────────────────────────────────────────────
test('a compact row links to the platform, never to a page that does not exist', () => {
  const html = read(OPP);
  // Every internal directory link on the page must resolve to a generated page.
  for (const m of html.matchAll(/href="(\/research\/business-directories\/[^"]+\/)"/g)) {
    const p = path.join(ROOT, m[1].replace(/^\//, ''), 'index.html');
    assert.ok(fs.existsSync(p), `the worklist links ${m[1]}, which was never generated`);
  }
  // And compact rows must appear as external links.
  const external = (html.match(/rel="noopener noreferrer"/g) || []).length;
  assert.ok(external >= ROWS.length / 2,
    `only ${external} external links for ${ROWS.length} compact rows`);
});

// ── 11-17. filters ──────────────────────────────────────────────────────────
test('the worklist offers the facets an employee needs', () => {
  const html = read(OPP);
  const facets = [...html.matchAll(/data-bd-facet="([a-z]+)"/g)].map((m) => m[1]);
  for (const want of ['country', 'category', 'cost', 'action', 'tier', 'priority', 'status']) {
    assert.ok(facets.includes(want), `the worklist has no ${want} filter`);
  }
  assert.ok(html.includes('data-bd-search'), 'the worklist has no search field');
  assert.ok(html.includes('data-bd-clear'), 'the worklist has no clear-filters control');
});

test('every facet value on a control exists on a row, and vice versa', () => {
  const html = read(OPP);
  const firstTable = (html.match(/<table[\s\S]*?<\/table>/) || [''])[0];
  for (const facet of ['country', 'category', 'cost', 'action', 'tier', 'priority', 'status']) {
    const block = html.split(`data-bd-facet="${facet}"`)[1] || '';
    const options = [...block.slice(0, block.indexOf('</select>')).matchAll(/value="([^"]*)"/g)]
      .map((m) => m[1]).filter(Boolean);
    assert.ok(options.length > 0, `the ${facet} filter offers no values`);
    const onRows = new Set([...firstTable.matchAll(new RegExp(`data-bd-facet-${facet}="([^"]*)"`, 'g'))]
      .flatMap((m) => m[1].split(' ')).filter(Boolean));
    for (const opt of options) {
      assert.ok(onRows.has(opt),
        `the ${facet} filter offers "${opt}", which no row carries — selecting it would empty the table`);
    }
  }
});

test('the default order puts the highest-priority work first', () => {
  const html = read(OPP);
  const firstTable = (html.match(/<table[\s\S]*?<\/table>/) || [''])[0];
  const priorities = [...firstTable.matchAll(/data-bd-facet-priority="([^"]*)"/g)].map((m) => m[1]);
  assert.ok(priorities.length > 100, 'not enough rows to check ordering');
  // Within the first market the P1 work must precede P2 and P3.
  const countries = [...firstTable.matchAll(/data-bd-facet-country="([^"]*)"/g)].map((m) => m[1]);
  const firstCountry = countries[0];
  const inFirst = priorities.filter((_, i) => countries[i] === firstCountry);
  const rank = { P1: 0, P2: 1, P3: 2, hold: 3 };
  for (let i = 1; i < inFirst.length; i += 1) {
    assert.ok((rank[inFirst[i - 1]] ?? 9) <= (rank[inFirst[i]] ?? 9),
      `within ${firstCountry} a ${inFirst[i]} row precedes a ${inFirst[i - 1]} row`);
  }
});

// ── 19-20. mobile and accessibility ─────────────────────────────────────────
test('every cell carries its mobile label and every control a real label', () => {
  const html = read(OPP);
  // Column headers carry scope="col" and legitimately have no mobile label —
  // they are the header row, not a stacked cell. Only body cells need one.
  const body = (html.match(/<t[dh] class="bd-cell"(?![^>]*scope="col")/g) || []).length;
  const labelled = (html.match(/data-bd-label="/g) || []).length;
  assert.strictEqual(body, labelled,
    `${body - labelled} body cells have no mobile label; the table will not stack readably`);
  for (const m of html.matchAll(/<select class="bd-select" id="([^"]+)"/g)) {
    assert.ok(html.includes(`for="${m[1]}"`), `the ${m[1]} control has no label`);
  }
});

// ── 22-23. copy truth and privacy ───────────────────────────────────────────
test('the pages claim nothing the dataset does not support', () => {
  // Matched against a real claim, not against adjacent dropdown labels: an
  // earlier version fired on the "All" option sitting next to "Free (28)".
  const FORBIDDEN = /fully verified director|guaranteed (?:backlink|traffic|ranking)|all \d+ (?:are )?free|high[- ]DR site|best \d+ platforms/i;
  for (const rel of [OPP, HUB]) {
    const body = text(read(rel));
    assert.ok(!FORBIDDEN.test(body), `${rel} makes an unsupported claim`);
  }
  // And the worklist must say plainly that some facts are unknown.
  const opp = text(read(OPP));
  assert.match(opp, /researched and not established|needs? a browser check/i,
    'the worklist does not tell a reader that some fields are unverified');
});

test('no internal or employee data reaches the public pages', () => {
  for (const rel of [OPP, HUB]) {
    const html = read(rel);
    for (const leak of ['assigned_to', 'internal_note', 'workflow_status', 'submitted_at', 'follow_up_date']) {
      assert.ok(!html.includes(leak), `${rel} exposes the internal field ${leak}`);
    }
  }
});
