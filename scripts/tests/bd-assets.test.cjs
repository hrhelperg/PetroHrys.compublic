// scripts/tests/bd-assets.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const components = require('../lib/bd-components.cjs');

const root = path.resolve(__dirname, '..', '..');
const css = () => fs.readFileSync(path.join(root, 'css', 'business-directories.css'), 'utf8');
const js = () => fs.readFileSync(path.join(root, 'js', 'business-directories.js'), 'utf8');
const orderJs = () => fs.readFileSync(path.join(root, 'js', 'bd-order.js'), 'utf8');
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '');

// Mirrors the group box the builder emits around each jurisdiction table.
const JGROUP = '<div class="bd-jgroup" id="x">'
  + '<h3 class="bd-jgroup-title">States <span class="bd-jgroup-count">2 registries</span></h3></div>';

const DIR = {
  id: 'a', slug: 'a', name: 'A', description: 'd', website: 'https://a.example',
  country: 'united-states', category: 'saas',
  petroHrysScore: null, domainRating: null, authorityScore: null, estimatedTraffic: null,
  free: true, paid: null, verificationRequired: null, acceptsSaaS: null,
  acceptsStartups: null, acceptsAI: null, lastVerified: null, nextVerification: null,
  recommendedIndustries: [], pros: [], cons: [], metricsProvenance: {},
};

const RENDERED = () => [
  components.breadcrumbs([{ name: 'H', path: '/' }, { name: 'X', path: '/x/' }]),
  components.cardGrid([components.countryCard({ name: 'A', path: '/a/' }),
    components.countryCard({ name: 'B', path: '/b/', pending: true })]),
  components.cardGrid([components.categoryCard({ name: 'C', path: '/c/', description: 'd' })]),
  components.directoryTable({ directories: [DIR] }),
  components.directoryCard({ directory: DIR }),
  components.metricsBlock(DIR), components.statusBadges(DIR),
  components.prosCons({ pros: ['p'], cons: ['c'] }), components.bestForTags(['x']),
  components.emptyState('e'), components.searchControls({}), components.filterControls({}),
  components.sortControls({}), components.pagination({ current: 1, total: 2, basePath: '/x/' }),
  components.methodologyNote(), components.provenanceBlock(DIR),
  components.externalLinkCta({ url: 'https://a.example' }),
  // The grouped-country UI. It was absent from this list once, and seven class
  // names — the whole jurisdiction grouping and its jump nav — shipped with no
  // rules at all while this test still passed. Anything the build can render
  // has to be represented here or the guard is decorative.
  components.jurisdictionFilter([{ key: 'state', label: 'States', count: 2 }]),
  components.coverageStatement(
    { country: 'x', jurisdictions: [{ code: 'US-XX', kind: 'state' }] }, new Set()),
  // The state coverage surface, in both of its states: a published card is a
  // link, a pending one is deliberately not.
  components.stateCoverageSummary([{ code: 'US-AA', name: 'A', record: DIR, path: '/a/' }]),
  components.stateGrid([
    { code: 'US-AA', name: 'A', record: DIR, path: '/a/', blockerCode: 'none' },
    { code: 'US-BB', name: 'B', record: null, path: null, blockerCode: 'waf-blocked' },
  ]),
  components.jurisdictionSelect(
    [{ code: 'US-AA', name: 'A', record: DIR }, { code: 'US-BB', name: 'B', record: null }],
    [{ key: 'national', label: 'Federal', count: 1 }]),
  JGROUP,
  '<p class="bd-status"></p>',
].join('\n');

// --- stylesheet -------------------------------------------------------------

test('every selector in the section stylesheet is bd- namespaced', () => {
  for (const block of stripComments(css()).split('}')) {
    const selector = block.split('{')[0].trim();
    if (!selector || selector.startsWith('@')) continue;
    for (const part of selector.split(',')) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      assert.ok(trimmed.includes('.bd-'), `selector is not bd- namespaced: ${trimmed}`);
    }
  }
});

test('the stylesheet declares no raw hex colour', () => {
  assert.strictEqual(css().match(/#[0-9a-fA-F]{3,8}\b/g), null);
});

test('the stylesheet declares no rgb/hsl colour literal', () => {
  assert.strictEqual(stripComments(css()).match(/\b(rgb|rgba|hsl|hsla)\s*\(/g), null);
});

test('every font declaration uses an existing token', () => {
  for (const decl of stripComments(css()).match(/font-(family|size)\s*:[^;]+;/g) || []) {
    assert.ok(decl.includes('var(--'), `font declaration must use a token: ${decl}`);
  }
});

// Matches only class tokens in selector position. A bare /\.[\w-]+/ also picks
// up file extensions inside comments and url() values, which is how ".css"
// previously showed up as a "class".
const CLASS_RE = /(?:^|[\s,>+~(])\.([a-zA-Z][a-zA-Z0-9_-]*)/g;
const classesIn = (text) => new Set(
  [...stripComments(text).matchAll(CLASS_RE)].map((m) => m[1]));

test('the stylesheet never redefines an existing site selector', () => {
  const existing = classesIn(fs.readFileSync(path.join(root, 'css', 'petrohrys.css'), 'utf8'));
  for (const cls of classesIn(css())) {
    assert.ok(!existing.has(cls), `section CSS reuses existing site class: .${cls}`);
  }
});

test('every bd- class the components emit is styled', () => {
  const emitted = new Set();
  for (const match of RENDERED().matchAll(/class="([^"]+)"/g)) {
    for (const cls of match[1].split(/\s+/)) if (cls.startsWith('bd-')) emitted.add(cls);
  }
  const styled = new Set((css().match(/\.bd-[a-zA-Z0-9_-]+/g) || []).map((s) => s.slice(1)));
  const missing = [...emitted].filter((cls) => !styled.has(cls));
  assert.deepStrictEqual(missing, [], `unstyled classes: ${missing.join(', ')}`);
});

test('the visually hidden helper is defined', () => {
  assert.ok(/\.bd-vh\s*\{/.test(css()));
  assert.ok(css().includes('position: absolute'));
});

// --- client script ----------------------------------------------------------

test('the client script performs no network request', () => {
  const source = js();
  for (const forbidden of ['fetch(', 'XMLHttpRequest', 'import(', 'WebSocket',
    'navigator.sendBeacon', 'EventSource']) {
    assert.ok(!source.includes(forbidden), `client script must not use ${forbidden}`);
  }
});

test('the client script writes no markup and uses no eval', () => {
  const source = js();
  for (const forbidden of ['innerHTML', 'outerHTML', 'insertAdjacentHTML',
    'document.write', 'eval(', 'new Function']) {
    assert.ok(!source.includes(forbidden), `client script must not use ${forbidden}`);
  }
  assert.ok(source.includes('textContent'), 'text updates must go through textContent');
});

test('the client script binds handlers with addEventListener only', () => {
  const source = stripComments(js());
  assert.ok(source.includes('addEventListener'));
  assert.ok(!/\.on(click|change|input|load)\s*=/.test(source), 'no on* property assignment');
});

test('the client script avoids locale-dependent ordering', () => {
  const source = stripComments(js());
  assert.ok(!/\.localeCompare\s*\(/.test(source));
  assert.ok(!/toLocale(Lower|Upper)Case\s*\(/.test(source));
});

test('the client and server share one ordering module', () => {
  // Not "the same keys appear in both files" — literally the same file.
  const sort = fs.readFileSync(path.join(root, 'scripts', 'lib', 'bd-sort.cjs'), 'utf8');
  assert.ok(sort.includes("require('../../js/bd-order.js')"),
    'the server comparator must come from js/bd-order.js');
  assert.ok(js().includes('BDOrder'), 'the client must consume BDOrder');
  assert.ok(!/function nullLastDesc/.test(js()), 'the client must not re-implement the comparator');
  const { SORT_KEYS } = require('../lib/bd-sort.cjs');
  for (const key of SORT_KEYS) {
    assert.ok(orderJs().includes(`'${key}'`), `shared module is missing sort key ${key}`);
  }
});

test('the shared ordering module loads in both environments', () => {
  const source = orderJs();
  assert.ok(source.includes('module.exports'), 'must be requirable by Node');
  assert.ok(source.includes('root.BDOrder'), 'must expose a browser global');
  assert.ok(!/\.localeCompare\s*\(/.test(source.replace(/\/\*[\s\S]*?\*\//g, '')));
});

test('every data attribute the client reads is emitted by the components', () => {
  // A subnational row and the state coverage surface are part of what the
  // client reads, so both have to be in the sample. Without the subnational
  // row, data-bd-jurisdiction-code looks like an attribute nothing emits.
  const SUBNATIONAL = {
    ...DIR,
    id: 'b',
    slug: 'b',
    name: 'B',
    scope: 'subnational',
    jurisdiction: { type: 'state', name: 'A', code: 'US-AA', parentCountry: 'united-states' },
  };
  const html = components.directoryTable({ directories: [DIR, SUBNATIONAL] })
    + components.searchControls({}) + components.filterControls({}) + components.sortControls({})
    + components.stateGrid([
      { code: 'US-AA', name: 'A', record: DIR, path: '/a/', blockerCode: 'none' },
      { code: 'US-BB', name: 'B', record: null, path: null, blockerCode: 'waf-blocked' },
    ])
    + components.jurisdictionSelect(
      [{ code: 'US-AA', name: 'A', record: DIR }], [{ key: 'national', label: 'Federal', count: 1 }])
    // The opportunities worklist controls. Included here so an attribute the
    // client reads but no component emits still fails this audit.
    + components.clearFiltersControl()
    + components.facetSelect({
      idPrefix: 'a', facet: { name: 'country', key: 'country' }, label: 'Market', rows: [DIR],
    })
    // The link-value control, which renders only where records carry the
    // evidence — so the sample has to carry one.
    + components.linkTypeControl({ idPrefix: 'a', rows: [{ backlinkType: 'dofollow' }] })
    // The Media, PR & Publishing page shares this client script and emits one
    // attribute of its own: data-bd-facet-multi, which marks a facet whose row
    // value is a space-separated list. The property this audit protects is that
    // every attribute the client READS is emitted by something the repository
    // generates. Scanning only bd-components quietly narrowed that to "emitted
    // by bd-components", and a second legitimate generator then failed a rule
    // it had not broken.
    + fs.readFileSync(path.join(root, 'research', 'media-pr-publishing', 'index.html'), 'utf8');
  const read = new Set();
  for (const m of js().matchAll(/'(data-bd-[a-z-]+)'/g)) read.add(m[1]);
  for (const m of js().matchAll(/\[(data-bd-[a-z-]+)\]/g)) read.add(m[1]);
  // Dynamic reads are built as 'data-bd-' + suffix, so resolve the suffix from
  // the call site rather than scraping the concatenation itself.
  for (const m of js().matchAll(/num\([a-z.]+, '([a-z]+)'\)/g)) read.add(`data-bd-${m[1]}`);
  const missing = [...read].filter((attr) => !html.includes(attr));
  assert.deepStrictEqual(missing, [], `client reads attributes the components never emit: ${missing.join(', ')}`);
});

test('the filter fields the client reads are all rendered as row attributes', () => {
  const row = components.directoryTable({ directories: [DIR] });
  for (const filter of components.FILTERS) {
    assert.ok(row.includes(`data-bd-${filter.field.toLowerCase()}=`), `row lacks ${filter.field}`);
  }
});

test('the script reveals the control wrappers the components render hidden', () => {
  const source = js();
  for (const wrap of ['data-bd-sort-wrap', 'data-bd-filter-wrap', 'data-bd-search-wrap']) {
    assert.ok(source.includes(wrap), `script never reveals ${wrap}`);
    assert.ok(RENDERED().includes(wrap), `components never render ${wrap}`);
  }
});

test('the script exits cleanly when there is no table', () => {
  // Shape check only. The BEHAVIOUR — that an empty or table-less page is left
  // exactly as the server rendered it, with no status region injected — is
  // executed against real markup in bd-grouped-dom.test.cjs.
  const source = js();
  assert.ok(/if \(!bodies\.length\) return;/.test(source), 'must no-op without a directory table');
  assert.ok(/if \(!groups\.length\) return;/.test(source), 'must no-op with zero rows');
});

test('filtering announces the visible count for assistive technology', () => {
  const source = js();
  assert.ok(source.includes("setAttribute('role', 'status')"));
  assert.ok(source.includes("aria-live"));
  assert.ok(source.includes('directories shown'));
});
