'use strict';

// Research Center — shareable URL state and filtered CSV export.
//
// Two properties, one mechanism. A selection a reader makes has to survive
// being copied into a message (the URL) and being taken away as a file (the
// CSV), and both have to mean exactly what the table on screen means. So
// almost every test here compares IDENTITIES — which records — rather than
// counts, against the real generated pages and, where possible, against the
// canonical JSON independently.
//
// The client is EXECUTED, not pattern-matched. js/business-directories.js runs
// in a vm against the real markup with a small window around it, so what is
// asserted is what a browser would do, including the history writes and the
// bytes of the downloaded file.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { createDocument } = require('./helpers/mini-dom.cjs');
const D = require('../lib/bd-discovery.cjs');
const I18N = require('../lib/i18n.cjs');
const components = require('../lib/bd-components.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const ORIGIN = 'https://petrohrys.com';
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const SOURCES = ['js/bd-order.js', 'js/bd-discovery.js', 'js/business-directories.js'].map(read);

// ── THE FIVE PAGE FAMILIES ──────────────────────────────────────────────────
//
// Named here because they are what the whole design has to hold for at once:
// they disagree about every control. Anything that works on one of them and not
// on the others is not a shared mechanism.
const FAMILIES = [
  { key: 'tenders-procurement', page: '/research/tenders-procurement/' },
  { key: 'marketplaces', page: '/research/marketplaces/' },
  { key: 'media-pr-publishing', page: '/research/media-pr-publishing/' },
  { key: 'opportunities', page: '/research/business-directories/opportunities/' },
  // A country page: no facet select at all, six tri-state checkboxes, a sort,
  // and the only jurisdiction select in the collection.
  { key: 'united-states', page: '/research/business-directories/united-states/' },
];
const fileFor = (page) => `${page.replace(/^\//, '')}index.html`;
const htmlFor = (page) => read(fileFor(page));

// ── THE CONTROL SCHEMA, READ INDEPENDENTLY ──────────────────────────────────
//
// The client builds this from the live DOM. This builds it from the markup, by
// a different route, so a test can be wrong about the page without the page and
// the test being wrong together — and one test below proves the two agree by
// comparing the URL the client actually writes with the one this schema
// predicts.
function optionValues(block) {
  return [...block.matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]).filter(Boolean);
}

function schemaOf(html) {
  const facets = [...html.matchAll(/<select[^>]*data-bd-facet="([a-z]+)"([^>]*)>([\s\S]*?)<\/select>/g)]
    .map((m) => ({
      name: m[1],
      multi: m[2].includes('data-bd-facet-multi') || m[1] === 'audience',
      values: optionValues(m[3]),
    }));
  const sort = /<select[^>]*data-bd-sort[^>]*>([\s\S]*?)<\/select>/.exec(html);
  const jurisdiction = /<select[^>]*data-bd-jurisdiction-select[^>]*>([\s\S]*?)<\/select>/.exec(html);
  // Read the same way every other control is: from the page, never assumed.
  const linkType = /<select[^>]*data-bd-link-type[^>]*>([\s\S]*?)<\/select>/.exec(html);
  return {
    facets,
    linkTypes: linkType ? optionValues(linkType[1]) : [],
    filters: [...html.matchAll(/data-bd-filter="([^"]+)"/g)].map((m) => m[1].toLowerCase()),
    sorts: sort ? optionValues(sort[1]) : [],
    jurisdictions: jurisdiction ? optionValues(jurisdiction[1]) : [],
  };
}

// The rows as the client rebuilds them: identity, haystack, facet values and
// tri-state flags, all from attributes.
function rowsOf(html, schema) {
  return [...html.matchAll(/<tr class="bd-row"([^>]*)>/g)].map((m) => {
    const attrs = m[1];
    const attr = (k) => {
      const hit = new RegExp(`data-bd-${k}="([^"]*)"`).exec(attrs);
      return hit ? hit[1] : null;
    };
    const facets = {};
    for (const f of schema.facets) facets[f.name] = attr(`facet-${f.name}`) || '';
    const flags = {};
    for (const name of schema.filters) flags[name] = attr(name);
    return { name: decode(attr('name') || ''), haystack: attr('haystack') || '', facets, flags };
  });
}

const decode = (s) => String(s)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&amp;/g, '&');

// ── RUNNING THE REAL CLIENT ─────────────────────────────────────────────────
//
// mini-dom plus the handful of window members the URL and export paths touch.
// Nothing here stubs the script under test: history entries are recorded and
// then really change location, popstate really fires the listener the client
// registered, and Blob really keeps the bytes that were written to it.
function boot(page, search, mutate) {
  let html = htmlFor(page);
  if (mutate) html = mutate(html);
  const document = createDocument(html);
  // A browser's parser resolves character references while it builds the tree,
  // so getAttribute('data-bd-name') hands the client "Plateforme des achats de
  // l'État". mini-dom keeps the source text. Resolving once here, rather than
  // in each assertion, is what makes "the export is byte for byte what the page
  // shows" a claim about the client and not about the harness.
  for (const node of document.root.descendants()) {
    for (const key of Object.keys(node.attributes)) {
      node.attributes[key] = decode(node.attributes[key]);
    }
  }
  const nativeCreate = document.createElement;
  document.createElement = function (tag) {
    const node = nativeCreate(tag);
    // Enough of an anchor for the capability probe and the download itself.
    if (tag === 'a') {
      node.download = '';
      node.href = '';
      node.click = function () { node.clicked = true; };
    }
    return node;
  };

  const entries = [];
  const blobs = [];
  const revoked = [];
  const listeners = {};
  const location = { pathname: page, search: search || '' };
  const setUrl = (url) => {
    const at = String(url).indexOf('?');
    location.pathname = at === -1 ? String(url) : String(url).slice(0, at);
    location.search = at === -1 ? '' : String(url).slice(at);
  };
  function Blob(parts, options) {
    this.parts = parts;
    this.type = options && options.type;
    blobs.push(this);
  }
  const window = {
    document,
    URLSearchParams,
    Blob,
    URL: {
      createObjectURL: (blob) => `blob:${blobs.indexOf(blob)}`,
      revokeObjectURL: (url) => revoked.push(url),
    },
    location,
    history: {
      pushState(state, title, url) { entries.push(['push', url]); setUrl(url); },
      replaceState(state, title, url) { entries.push(['replace', url]); setUrl(url); },
    },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
  };
  const sandbox = { document, window };
  vm.createContext(sandbox);
  for (const src of SOURCES) vm.runInContext(src, sandbox);

  const all = () => document.querySelectorAll('.bd-row');
  const control = (selector, name) => document.querySelectorAll(selector)
    .find((el) => el.getAttribute(selector.slice(1, -1)) === name);
  return {
    document,
    entries,
    blobs,
    revoked,
    exportBtn: document.querySelector('[data-bd-export]'),
    search: document.querySelector('[data-bd-search]'),
    sort: document.querySelector('[data-bd-sort]'),
    jurisdiction: document.querySelector('[data-bd-jurisdiction-select]'),
    facet: (name) => control('[data-bd-facet]', name),
    filter: (field) => control('[data-bd-filter]', field),
    rows: all,
    visible: () => all().filter((row) => !row.hidden).map((row) => row.getAttribute('data-bd-name')),
    url: () => location.pathname + location.search,
    // Back or forward: the address changes first, then the browser tells the
    // page. Exactly the order a real popstate happens in.
    go(url) {
      setUrl(url);
      (listeners.popstate || []).forEach((fn) => fn({ type: 'popstate' }));
    },
    csv() {
      this.exportBtn.dispatch('click');
      const blob = blobs[blobs.length - 1];
      return blob ? blob.parts.join('') : null;
    },
  };
}

// An independent RFC 4180 reader. Written here rather than reused from the
// module under test: a parser that shared the writer's assumptions would agree
// with it about a file no spreadsheet could open.
function parseCsv(text) {
  const body = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (quoted) {
      if (ch !== '"') { cell += ch; continue; }
      if (body[i + 1] === '"') { cell += '"'; i += 1; continue; }
      quoted = false;
      continue;
    }
    if (ch === '"' && cell === '') { quoted = true; continue; }
    if (ch === ',') { row.push(cell); cell = ''; continue; }
    if (ch === '\r' && body[i + 1] === '\n') {
      row.push(cell); cell = ''; rows.push(row); row = []; i += 1; continue;
    }
    cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const csvNames = (text) => parseCsv(text).slice(1).map((r) => r[0]);

// What an identity looks like once it is a spreadsheet cell. The registry
// really does hold a platform called "@Press", so the formula guard fires on
// production data rather than only on a contrived one, and a test that compared
// raw names would be asserting the guard away.
const asCell = (name) => (/^[=+\-@\t\r]/.test(name) ? `'${name}` : name);

// ── 1. THE PARAMETER SET IS THE CONTROL SET ─────────────────────────────────

test('every family declares controls, and no two of them declare the same ones', () => {
  const shapes = new Set();
  for (const family of FAMILIES) {
    const schema = schemaOf(htmlFor(family.page));
    const controls = schema.facets.length + schema.filters.length
      + (schema.sorts.length ? 1 : 0) + (schema.jurisdictions.length ? 1 : 0);
    assert.ok(controls > 0, `${family.key}: no controls at all`);
    shapes.add(D.paramOrder(schema).join('|'));
    // A facet named q, sort, filters or jurisdiction would collide with the
    // state machinery and one of the two would silently win.
    for (const facet of schema.facets) {
      assert.ok(D.RESERVED.indexOf(facet.name) === -1,
        `${family.key}: the facet "${facet.name}" collides with a reserved parameter`);
    }
  }
  // The whole reason the parameter set is derived: five pages, five different
  // control panels. A hand-written PARAM_ORDER would have to be all five.
  assert.strictEqual(shapes.size, FAMILIES.length,
    'two families produced the same parameter list; the heterogeneity this design exists for is gone');
});

test('the schema this test reads and the schema the client builds are the same schema', () => {
  // Proven through behaviour rather than by comparing two parsers: the client
  // is given a selection and the URL it writes is compared with the one
  // serializeState predicts from the independently parsed schema.
  for (const family of FAMILIES) {
    const schema = schemaOf(htmlFor(family.page));
    const app = boot(family.page, '');
    const state = D.emptyState(schema);
    if (schema.facets.length) {
      const facet = schema.facets[0];
      state.facets[facet.name] = facet.values[0];
      app.facet(facet.name).value = facet.values[0];
      app.facet(facet.name).dispatch('change');
    } else {
      state.filters = [schema.filters[0]];
      app.filter(schema.filters[0]).checked = true;
      app.filter(schema.filters[0]).dispatch('change');
    }
    assert.strictEqual(app.url(), family.page + D.serializeState(state, schema),
      `${family.key}: the client and the schema disagree about the URL for one selection`);
  }
});

// ── 2. ROUND TRIP ───────────────────────────────────────────────────────────

test('state -> serialize -> parse -> the same state, on every family', () => {
  let checked = 0;
  for (const family of FAMILIES) {
    const schema = schemaOf(htmlFor(family.page));
    const states = [D.emptyState(schema)];

    // Every value of every facet, one at a time: an option a page offers must
    // be expressible in a link.
    for (const facet of schema.facets) {
      for (const value of facet.values) {
        const state = D.emptyState(schema);
        state.facets[facet.name] = value;
        states.push(state);
      }
    }
    for (const sort of schema.sorts) {
      states.push(Object.assign(D.emptyState(schema), { sort }));
    }
    for (const jurisdiction of schema.jurisdictions) {
      states.push(Object.assign(D.emptyState(schema), { jurisdiction }));
    }
    // And a fully loaded one, every dimension at once.
    const loaded = D.emptyState(schema);
    loaded.q = 'a query with spaces & an ampersand';
    loaded.filters = schema.filters.slice();
    for (const facet of schema.facets) loaded.facets[facet.name] = facet.values[0];
    if (schema.sorts.length) loaded.sort = schema.sorts[schema.sorts.length - 1];
    if (schema.jurisdictions.length) {
      loaded.jurisdiction = schema.jurisdictions[schema.jurisdictions.length - 1];
    }
    states.push(loaded);

    for (const state of states) {
      const qs = D.serializeState(state, schema);
      const back = D.parseState(new URLSearchParams(qs), schema);
      assert.deepStrictEqual(back, state,
        `${family.key}: ${qs || '(clean)'} did not round-trip`);
      // And it is stable: serializing what was parsed produces the same string.
      assert.strictEqual(D.serializeState(back, schema), qs, `${family.key}: ${qs} is not stable`);
      checked += 1;
    }
  }
  assert.ok(checked >= 200, `only ${checked} states round-tripped; the sweep proves too little`);
});

test('a clean selection yields a clean URL', () => {
  for (const family of FAMILIES) {
    const schema = schemaOf(htmlFor(family.page));
    assert.strictEqual(D.serializeState(D.emptyState(schema), schema), '',
      `${family.key}: the default state serializes to a query string`);
    // Explicitly restating each default must not add a parameter either.
    const state = D.emptyState(schema);
    state.q = '';
    state.sort = D.defaultSort(schema);
    state.jurisdiction = D.defaultJurisdiction(schema);
    assert.strictEqual(D.serializeState(state, schema), '',
      `${family.key}: a default value was written into the URL`);
  }
  // Arriving with nothing must also LEAVE nothing: the boot replaceState writes
  // the clean address, not "?" or "?sort=default".
  for (const family of FAMILIES) {
    const app = boot(family.page, '');
    assert.strictEqual(app.url(), family.page, `${family.key}: boot dirtied a clean URL`);
    assert.deepStrictEqual(app.entries, [['replace', family.page]],
      `${family.key}: boot did not replace exactly once`);
  }
});

// ── 3. A SHARED LINK REPRODUCES THE SAME RESULTS ────────────────────────────

test('a shared URL reproduces the same visible identity set', () => {
  const cases = [
    ['/research/tenders-procurement/', '?country=czech-republic', 'country', 'czech-republic'],
    ['/research/tenders-procurement/', '?country=india&esub=yes', 'country', 'india'],
    ['/research/marketplaces/', '?country=india', 'country', 'india'],
    ['/research/media-pr-publishing/', '?category=startup-media&industry=saas', 'category', 'startup-media'],
    ['/research/business-directories/opportunities/', '?bestfor=saas', 'bestfor', 'saas'],
  ];
  for (const [page, search] of cases) {
    const html = htmlFor(page);
    const schema = schemaOf(html);
    const state = D.parseState(new URLSearchParams(search), schema);
    // Derived independently from the markup, through the shared predicate.
    const expected = D.filter(rowsOf(html, schema), D.selectionFor(state, schema))
      .rows.map((r) => r.name).sort();
    assert.ok(expected.length > 0, `${page}${search}: the expectation is empty`);

    const app = boot(page, search);
    assert.deepStrictEqual(app.visible().sort(), expected,
      `${page}${search}: the shared link showed a different set of records`);
    // The link the reader would copy back out is the one they arrived with.
    assert.strictEqual(app.url(), page + search);
  }
});

test('a shared link agrees with the canonical data, not merely with the page', () => {
  const platforms = JSON.parse(read('data/tenders-procurement/platforms.json'));
  const marketplaces = JSON.parse(read('data/marketplaces/marketplaces.json'));
  for (const [page, country, records] of [
    ['/research/tenders-procurement/', 'czech-republic', platforms],
    ['/research/tenders-procurement/', 'germany', platforms],
    ['/research/marketplaces/', 'india', marketplaces],
  ]) {
    const expected = records.filter((r) => r.country === country).map((r) => r.name).sort();
    assert.ok(expected.length > 0, `${country}: nothing canonical to compare against`);
    const app = boot(page, `?country=${country}`);
    assert.deepStrictEqual(app.visible().sort(), expected,
      `${page}?country=${country}: the page and the canonical records disagree`);
  }
});

test('the search term in a link filters, and is never written into markup', () => {
  const page = '/research/tenders-procurement/';
  const html = htmlFor(page);
  const schema = schemaOf(html);
  const app = boot(page, '?q=elektronick');
  const expected = D.filter(rowsOf(html, schema), { query: 'elektronick', facets: {}, flags: [] })
    .rows.map((r) => r.name).sort();
  assert.ok(expected.length >= 2, `only ${expected.length} rows match; the case is too thin`);
  assert.deepStrictEqual(app.visible().sort(), expected);
  assert.strictEqual(app.search.value, 'elektronick', 'the search box was not restored from the link');
});

// ── 4. HOSTILE AND MALFORMED INPUT ──────────────────────────────────────────

test('invalid, unknown and hostile parameters fail safe', () => {
  const page = '/research/tenders-procurement/';
  const html = htmlFor(page);
  const schema = schemaOf(html);
  const everything = rowsOf(html, schema).map((r) => r.name).sort();

  const hostile = [
    '?country=<script>alert(1)</script>',
    '?country=" onmouseover="alert(1)',
    '?sort=nonsense',
    '?page=-1',
    '?jurisdiction=state:US-AL',
    '?filters=free-submission',
    '?nosuchkey=1&anotherone=2',
    '?country=czech-republic%00',
    '?q=',
    '?country=',
  ];
  for (const search of hostile) {
    const state = D.parseState(new URLSearchParams(search), schema);
    assert.deepStrictEqual(state, D.emptyState(schema),
      `${search}: something survived the whitelist`);

    const app = boot(page, search);
    // Fail safe means the reader sees the whole collection, not an empty table.
    assert.deepStrictEqual(app.visible().sort(), everything,
      `${search}: the page did not fall back to the unfiltered collection`);
    // And the junk is gone from the address, because boot replaces it.
    assert.strictEqual(app.url(), page, `${search}: the junk stayed in the URL`);
    // Nothing hostile reached the document. The client writes textContent only;
    // this is the assertion that the boundary held as well as the sink.
    const serialized = JSON.stringify(app.document.root.descendants()
      .map((n) => ({ a: n.attributes, t: n.text })));
    assert.ok(!serialized.includes('alert(1)'), `${search}: a hostile value reached the DOM`);
  }
});

test('the free-text query reaches the search box and nothing else in the document', () => {
  // The gap the case above leaves open. Every hostile value it tries is a FACET
  // value, and facets are whitelisted — nothing hostile ever gets past
  // parseState, so the assertion that nothing hostile reached the DOM passes
  // without the client having to be careful at all.
  //
  // q is the one value that is NOT whitelisted: it is capped at 200 characters
  // and then carried, by design, because a search box has to be able to hold
  // what a reader typed. So q is the only parameter for which "written as text,
  // never as markup" is a live claim, and it was the only one nothing tested.
  //
  // Measured against the mutation that motivated this: reflecting
  // searchInput.value into a single attribute on the status line —
  //   status.setAttribute('data-bd-query', searchInput.value)
  // — left all 208 tests in the discovery, URL, export, client, sort, grouped
  // DOM, indexation, Australia, worklist and i18n files green.
  const page = '/research/tenders-procurement/';
  const payloads = [
    '<script>alert(1)</script>',
    '"><img src=x onerror=alert(1)>',
    "');alert(1);//",
    '<svg onload=alert(1)>',
  ];
  for (const payload of payloads) {
    const app = boot(page, `?q=${encodeURIComponent(payload)}`);

    // Not vacuous: the query really did arrive, and it really is in the box.
    assert.strictEqual(app.search.value, payload,
      `${payload}: the query never reached the search input, so this proves nothing`);

    // input.value is a PROPERTY, not markup. Every attribute and every text
    // node in the document is markup, and none of them may carry it.
    for (const node of app.document.root.descendants()) {
      for (const [key, value] of Object.entries(node.attributes)) {
        assert.ok(!String(value).includes(payload),
          `${payload}: the raw query was written into the ${key} attribute of <${node.tag}>`);
      }
      assert.ok(!String(node.text || '').includes(payload),
        `${payload}: the raw query was written into the text of <${node.tag}>`);
    }
    // And the client never reaches for a markup sink in the first place.
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/
      .test(read('js/business-directories.js')),
      'the client acquired a markup sink');
  }
});

test('a value that is real on another page is still refused on this one', () => {
  // The subtle case a naive whitelist misses: "india" is a legitimate country
  // slug, and it is not one of the values the marketplaces page offers for
  // seller types. Cross-facet smuggling has to be refused by value, not by
  // shape.
  const schema = schemaOf(htmlFor('/research/marketplaces/'));
  const state = D.parseState(new URLSearchParams('?sellers=india&country=not-a-country'), schema);
  assert.deepStrictEqual(state, D.emptyState(schema));
});

test('duplicate parameters resolve to the first, deterministically', () => {
  const schema = schemaOf(htmlFor('/research/tenders-procurement/'));
  const state = D.parseState(
    new URLSearchParams('?country=czech-republic&country=india'), schema);
  assert.strictEqual(state.facets.country, 'czech-republic',
    'the last duplicate won; a reader who saw only the first was shown something else');
});

test('a very long query is capped rather than carried', () => {
  const schema = schemaOf(htmlFor('/research/tenders-procurement/'));
  const state = D.parseState(new URLSearchParams(`?q=${'a'.repeat(5000)}`), schema);
  assert.strictEqual(state.q.length, D.Q_MAX);
  assert.strictEqual(D.serializeState(state, schema).length, `?q=${'a'.repeat(D.Q_MAX)}`.length);
});

test('a page with no controls is left completely alone', () => {
  // 23,628 pages load this script and 288 carry a filterable table. The rest
  // must reach no history API and create no element.
  const app = boot('/research/business-directories/czech-republic/verejny-rejstrik/', '');
  assert.deepStrictEqual(app.entries, [], 'a record page wrote to the history API');
  assert.strictEqual(app.exportBtn, null, 'a record page carries an export button');
  assert.strictEqual(app.document.querySelector('.bd-status'), null,
    'a record page was given a status line');
});

// ── 5. BACK AND FORWARD ─────────────────────────────────────────────────────

test('popstate restores the controls and the results together', () => {
  const page = '/research/media-pr-publishing/';
  const app = boot(page, '?country=germany');
  const first = app.visible().sort();
  assert.ok(first.length > 0 && first.length < app.rows().length);

  // A second selection, made the way a reader makes one.
  app.facet('country').value = 'france';
  app.facet('country').dispatch('change');
  const second = app.visible().sort();
  assert.notDeepStrictEqual(second, first, 'the second selection shows the same records as the first');
  assert.deepStrictEqual(app.entries.map((e) => e[0]), ['replace', 'push'],
    'changing a facet did not add exactly one history entry');

  // Back.
  app.go(`${page}?country=germany`);
  assert.strictEqual(app.facet('country').value, 'germany', 'the control was not restored');
  assert.deepStrictEqual(app.visible().sort(), first, 'the results were not restored');
  // Restoring one without the other is the failure this closes: control and
  // table must never describe two different selections.
  assert.deepStrictEqual(app.visible().sort(),
    boot(page, '?country=germany').visible().sort(),
    'the restored page differs from the same link opened fresh');

  // Forward.
  app.go(`${page}?country=france`);
  assert.strictEqual(app.facet('country').value, 'france');
  assert.deepStrictEqual(app.visible().sort(), second);
  // And popstate itself writes no history entry, or Back would never finish.
  assert.deepStrictEqual(app.entries.map((e) => e[0]), ['replace', 'push']);
});

test('popstate restores the tri-state filters and the jurisdiction too', () => {
  const page = '/research/business-directories/united-states/';
  const app = boot(page, '');
  const all = app.visible().length;

  app.jurisdiction.value = 'group:national';
  app.jurisdiction.dispatch('change');
  const federal = app.visible().sort();
  assert.ok(federal.length > 0 && federal.length < all);

  app.filter('accepts-startup').checked = true;
  app.filter('accepts-startup').dispatch('change');
  const narrowed = app.visible().sort();
  assert.ok(narrowed.length < federal.length, 'ticking a filter did not narrow the set');
  assert.strictEqual(app.url(), `${page}?filters=accepts-startup&jurisdiction=group%3Anational`);

  app.go(`${page}?jurisdiction=group%3Anational`);
  assert.strictEqual(app.filter('accepts-startup').checked, false, 'the checkbox was not restored');
  assert.strictEqual(app.jurisdiction.value, 'group:national');
  assert.deepStrictEqual(app.visible().sort(), federal);

  app.go(page);
  assert.strictEqual(app.jurisdiction.value, 'all');
  assert.strictEqual(app.visible().length, all);
});

test('typing replaces the current entry; a control adds one', () => {
  // Five keystrokes must not cost five presses of Back.
  const page = '/research/marketplaces/';
  const app = boot(page, '');
  for (const value of ['i', 'in', 'ind', 'indi', 'india']) {
    app.search.value = value;
    app.search.dispatch('input');
  }
  assert.deepStrictEqual(app.entries.map((e) => e[0]), ['replace', 'replace', 'replace', 'replace', 'replace', 'replace'],
    'typing pushed history entries');
  assert.strictEqual(app.url(), `${page}?q=india`);

  app.facet('country').value = 'india';
  app.facet('country').dispatch('change');
  assert.strictEqual(app.entries[app.entries.length - 1][0], 'push',
    'changing a facet did not push');
});

test('Clear empties the controls, the results AND the address bar together', () => {
  // The address bar was the half nothing tested. Every control the page renders
  // is reset by the Clear handler and the table is re-rendered, so a mutation
  // that swapped its `interact()` for a bare `apply()` —
  //   the same render, minus the history write —
  // left all 209 tests green while the reader was looking at the whole
  // collection under an address that still said ?country=czech-republic&q=…
  //
  // That is the worst of the three states this feature can be in. A filtered
  // table under a bare URL loses a selection; a broken filter is visible. An
  // UNFILTERED table under a filtered URL is invisible and it lies to the next
  // reader: copy the address, send it, and they see 6 rows where the sender saw
  // 383 — with nothing on either screen admitting the two disagree.
  const page = '/research/tenders-procurement/';
  const html = htmlFor(page);
  const schema = schemaOf(html);
  const everything = rowsOf(html, schema).map((r) => r.name).sort();

  const app = boot(page, '?country=czech-republic&q=elektronick');
  const clear = app.document.querySelector('[data-bd-clear]');
  assert.ok(clear, 'the page renders no Clear control, so this proves nothing');
  // Not vacuous: the link really did filter before Clear was pressed.
  assert.ok(app.visible().length > 0 && app.visible().length < everything.length,
    `the link left ${app.visible().length} of ${everything.length} rows; the case is too thin`);
  assert.notStrictEqual(app.url(), page, 'the link did not put a selection in the URL');

  // mini-dom models no focus(); the handler returns focus to the search box,
  // which is behaviour this test is not about.
  app.search.focus = () => { app.search.focused = true; };
  clear.dispatch('click');
  assert.ok(app.search.focused, 'Clear did not return focus to the search box');

  assert.deepStrictEqual(app.visible().sort(), everything,
    'Clear did not restore the whole collection');
  assert.strictEqual(app.search.value, '', 'Clear left the search box populated');
  assert.strictEqual(app.facet('country').value, '', 'Clear left a facet selected');
  assert.strictEqual(app.url(), page,
    'Clear reset the page and left a stale parameter in the address bar');
  // And it is a NAVIGATION: Back must return to the selection that was cleared.
  assert.strictEqual(app.entries[app.entries.length - 1][0], 'push',
    'Clear did not record a history entry, so Back cannot undo it');
});

// ── 6. THE URL NEVER LEAKS INTO THE SITE ────────────────────────────────────

let generatedCache = null;
function generatedPages() {
  if (generatedCache) return generatedCache;
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith('.html')) out.push(path.relative(ROOT, p));
    }
  };
  for (const base of ['research', 'de/research', 'es/research', 'fr/research']) {
    const dir = path.join(ROOT, base);
    if (fs.existsSync(dir)) walk(dir);
  }
  generatedCache = out;
  return out;
}

test('no sitemap <loc> carries a query string', () => {
  const maps = fs.readdirSync(ROOT).filter((f) => /^sitemap.*\.xml$/.test(f));
  assert.ok(maps.length >= 3, `only ${maps.length} sitemaps found`);
  let locs = 0;
  for (const map of maps) {
    for (const m of read(map).matchAll(/<loc>([^<]+)<\/loc>/g)) {
      locs += 1;
      assert.ok(!m[1].includes('?'),
        `${map}: ${m[1]} is a filtered view, and a filtered view is not a page`);
    }
  }
  assert.ok(locs > 1000, `only ${locs} URLs across the sitemaps; the guard is not exercised`);
});

test('no internal href anywhere carries a query string', () => {
  // The SEO policy this whole feature had to be built around: query state is
  // for a reader who is filtering, never for a crawler. One shared link pasted
  // into a page would create an infinite, near-duplicate crawl space.
  const pages = generatedPages();
  assert.ok(pages.length > 20000, `only ${pages.length} generated pages found`);
  let internal = 0;
  const offenders = [];
  for (const rel of pages) {
    const html = read(rel);
    for (const m of html.matchAll(/href="([^"]*)"/g)) {
      const href = m[1];
      const isInternal = href.startsWith('/') || href.startsWith(ORIGIN);
      if (!isInternal) continue;
      internal += 1;
      if (href.includes('?')) offenders.push(`${rel}: ${href}`);
    }
  }
  assert.deepStrictEqual(offenders.slice(0, 5), [],
    `${offenders.length} internal links carry a query string`);
  assert.ok(internal > 100000, `only ${internal} internal links were inspected`);
});

test('the canonical stays the clean base URL on every family and locale', () => {
  for (const family of FAMILIES) {
    for (const locale of I18N.LOCALE_CODES) {
      const file = I18N.localizedFile(locale, family.page);
      const html = read(file);
      const canonical = (/<link rel="canonical" href="([^"]+)"/.exec(html) || [])[1];
      assert.strictEqual(canonical, ORIGIN + I18N.localizedPath(locale, family.page),
        `${file}: the canonical is not the clean page URL`);
      assert.ok(!canonical.includes('?'), `${file}: the canonical carries a query string`);
      const og = (/property="og:url" content="([^"]+)"/.exec(html) || [])[1];
      assert.ok(og && !og.includes('?'), `${file}: og:url carries a query string`);
    }
  }
});

// ── 7. THE FILTERED EXPORT ──────────────────────────────────────────────────

test('the static "Download all" link is untouched and needs no JavaScript', () => {
  const links = [
    ['/research/tenders-procurement/', 'research/tenders-procurement/platforms.csv'],
    ['/research/marketplaces/', 'research/marketplaces/marketplaces.csv'],
    ['/research/media-pr-publishing/', 'research/media-pr-publishing/opportunities.csv'],
    ['/research/business-directories/opportunities/', 'research/business-directories/opportunities.csv'],
  ];
  for (const [page, file] of links) {
    const html = htmlFor(page);
    const href = `/${file}`;
    assert.ok(html.includes(`<a class="bd-button" href="${href}" download>`)
      || html.includes(`href="${href}" download>`), `${page}: the static CSV link is gone`);
    assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} does not exist`);
    // It is an <a> to a file, not a button: no script runs, and the label still
    // says what it is — the whole collection.
    const anchor = new RegExp(`<a[^>]*href="${href.replace(/\//g, '\\/')}"[^>]*>([^<]+)</a>`).exec(html);
    assert.ok(anchor, `${page}: the download link is not an anchor`);
    assert.ok(/all/i.test(anchor[1]) || /\d/.test(anchor[1]),
      `${page}: "${anchor[1]}" no longer says it is the whole collection`);
  }
});

test('the client never adopts the "Download all" link, whatever is selected', () => {
  // The test above reads MARKUP, so it proves the anchor ships correct. It says
  // nothing about what the client does to it once it runs, and that is the half
  // that can go wrong: adding four lines to updateExport() that rewrite the
  // anchor's label and hand its click a Blob of the filtered rows left all 210
  // tests green. The page would then offer two buttons that both export the
  // selection and neither of which exports the collection.
  //
  // Two separate exports is the whole design. "Download all 383" is a static
  // file, correct with no JavaScript, and it is what a reader who wants the
  // dataset clicks. The filtered button beside it is the selection. A reader who
  // filtered to 6 rows and pressed "Download all 383" must get 383.
  const page = '/research/tenders-procurement/';
  const html = htmlFor(page);
  const anchor = /<a[^>]*href="(\/research\/tenders-procurement\/platforms\.csv)"[^>]*download[^>]*>([^<]+)<\/a>/
    .exec(html);
  assert.ok(anchor, 'the static download anchor is not in the markup');
  const [, href, label] = anchor;

  for (const search of ['', '?country=czech-republic', '?q=elektronick&esub=yes']) {
    const app = boot(page, search);
    const link = app.document.querySelectorAll('a').find((a) => a.getAttribute('href') === href);
    assert.ok(link, `${search}: the client removed the static download link`);

    // Not vacuous: the client really is running and really did filter.
    assert.ok(app.document.querySelector('.bd-status'), `${search}: the client did not render`);
    if (search) {
      assert.ok(app.visible().length < app.rows().length,
        `${search}: nothing was filtered, so an adopted link could not be noticed`);
    }

    assert.strictEqual(link.getAttribute('href'), href,
      `${search}: the client rewrote the static link's href`);
    assert.strictEqual(link.textContent, label,
      `${search}: the client rewrote the static link's label to follow the selection`);

    // And clicking it is a plain navigation to that file: no Blob, no override.
    const before = app.blobs.length;
    link.dispatch('click');
    assert.strictEqual(app.blobs.length, before,
      `${search}: clicking "Download all" produced a generated file instead of the static one`);
    assert.strictEqual(link.getAttribute('href'), href,
      `${search}: clicking "Download all" repointed it away from the static file`);
  }
});

test('the filtered export is hidden until the browser proves it can produce a file', () => {
  for (const family of FAMILIES) {
    const html = htmlFor(family.page);
    const wrap = /<p[^>]*data-bd-export-wrap[^>]*>[\s\S]*?<\/p>/.exec(html);
    assert.ok(wrap, `${family.key}: no filtered export control`);
    assert.ok(/<p[^>]* hidden>/.test(wrap[0]),
      `${family.key}: the export is visible in markup a reader may have no script for`);
    assert.ok(wrap[0].includes('data-bd-export '), `${family.key}: the button is outside the wrapper`);
    // And it becomes visible once the client runs.
    const app = boot(family.page, '');
    assert.strictEqual(app.document.querySelector('[data-bd-export-wrap]').hidden, false,
      `${family.key}: the export stayed hidden`);
  }
});

test('the filtered CSV carries exactly the visible identities, in the order shown', () => {
  const cases = [
    ['/research/tenders-procurement/', '?country=czech-republic'],
    ['/research/tenders-procurement/', '?type=national-procurement&esub=yes'],
    ['/research/marketplaces/', '?country=india'],
    ['/research/marketplaces/', '?q=classifieds'],
    ['/research/media-pr-publishing/', '?category=startup-media&industry=saas'],
    ['/research/business-directories/opportunities/', '?bestfor=saas'],
    ['/research/business-directories/united-states/', '?jurisdiction=group%3Anational'],
    ['/research/business-directories/czech-republic/', ''],
  ];
  let rowsChecked = 0;
  for (const [page, search] of cases) {
    const app = boot(page, search);
    const shown = app.visible();
    assert.ok(shown.length > 0, `${page}${search}: nothing is visible; the case proves nothing`);
    const exported = csvNames(app.csv());
    // Identity and ORDER, not count: the file is the table.
    assert.deepStrictEqual(exported, shown.map(asCell),
      `${page}${search}: the export is not the visible set in the visible order`);
    // The number on the button is the number of records in the file.
    assert.ok(app.exportBtn.textContent.includes(`(${shown.length})`),
      `${page}${search}: the button says "${app.exportBtn.textContent}" for ${shown.length} records`);
    rowsChecked += exported.length;
  }
  assert.ok(rowsChecked > 100, `only ${rowsChecked} exported rows were compared`);
});

test('the export is limited by nothing, and the count on the button is live', () => {
  const page = '/research/business-directories/opportunities/';
  const app = boot(page, '');
  const everything = app.visible();
  // 1,563 worklist rows plus the 604-row "other countries" table below it. That
  // second table repeats records from the first, and the export mirrors the
  // page rather than second-guessing it: the number on the button, the number
  // of rows in the file and the number of rows on screen are one number.
  assert.strictEqual(everything.length, app.rows().length,
    'something is hidden on a page with no selection');
  assert.strictEqual(csvNames(app.csv()).length, everything.length,
    'the export dropped rows the page shows — a page size or a cap has crept in');
  assert.ok(app.exportBtn.textContent.includes(`(${everything.length})`));

  // Live: the label tracks the array on every keystroke, never a stale number.
  const seen = [];
  for (const value of ['d', 'di', 'dir', 'dire']) {
    app.search.value = value;
    app.search.dispatch('input');
    const count = app.visible().length;
    seen.push(count);
    assert.ok(app.exportBtn.textContent.includes(`(${count})`),
      `after typing "${value}" the button says "${app.exportBtn.textContent}" for ${count} records`);
    assert.strictEqual(csvNames(app.csv()).length, count,
      `after typing "${value}" the file and the label disagree`);
  }
  assert.ok(seen[0] > seen[seen.length - 1], 'the query never narrowed anything');
});

test('the formula guard fires on the real registry, not only on a contrived name', () => {
  // "@Press" is a real media platform. Without the guard its row opens in Excel
  // as a formula, and that row is the one thing this file exists to carry.
  const app = boot('/research/media-pr-publishing/', '');
  const hostile = app.visible().filter((name) => /^[=+\-@\t\r]/.test(name));
  assert.ok(hostile.length > 0, 'no real record needs defusing; the guard rests on the synthetic case alone');
  const exported = csvNames(app.csv());
  for (const name of hostile) {
    assert.ok(!exported.includes(name), `"${name}" was exported as a live formula`);
    assert.ok(exported.includes(`'${name}`), `"${name}" was not defused`);
  }
  // And the page still shows the record under its own name.
  assert.ok(app.rows().some((r) => r.getAttribute('data-bd-name') === hostile[0]),
    'defusing the cell changed the record');
});

test('the export follows the sort, not the source order', () => {
  const page = '/research/business-directories/opportunities/';
  const app = boot(page, '?bestfor=saas');
  const byScore = csvNames(app.csv());

  app.sort.value = 'alphabetical';
  app.sort.dispatch('change');
  const byName = csvNames(app.csv());

  assert.deepStrictEqual([...byName].sort(), [...byScore].sort(),
    'sorting changed which records are exported');
  assert.notDeepStrictEqual(byName, byScore, 'the export ignored the sort control');
  assert.deepStrictEqual(byName, app.visible().map(asCell),
    'the export and the table disagree after sorting');
});

test('an empty selection exports no records, never the whole collection', () => {
  const page = '/research/business-directories/opportunities/';
  const total = boot(page, '').rows().length;
  // The floor only has to be large enough that "exported the whole collection
  // instead of nothing" would be unmissable. It read 2000 because it was written
  // when this page rendered 2,247 rows for 1,609 opportunities — 638 of them
  // twice. The duplicates are gone, so this number is now the truth rather than
  // the inflation.
  assert.ok(total > 1000, `only ${total} rows; the fallback would be hard to notice`);

  const app = boot(page, '?q=zzzzzznosuchplatformzzzzzz');
  assert.strictEqual(app.visible().length, 0, 'the query matched something after all');
  assert.strictEqual(app.exportBtn.disabled, true, 'the export stayed enabled with nothing to export');
  assert.ok(app.exportBtn.textContent.includes('(0)'), 'the button does not say the set is empty');

  // Pressing it anyway must produce nothing at all — not the collection.
  app.exportBtn.dispatch('click');
  assert.strictEqual(app.blobs.length, 0, 'an empty selection still produced a file');

  // And the writer itself, asked directly, writes a header and no rows.
  const schema = schemaOf(htmlFor(page));
  const csv = D.renderFilteredCsv([], D.exportColumns(schema));
  assert.strictEqual(parseCsv(csv).length, 1, 'an empty export carries data rows');
  assert.strictEqual(csvNames(csv).length, 0);
});

test('the export columns are the identity plus every dimension the page offers', () => {
  // CHANGED BY THE DOMAIN RATING POLICY REVERSAL. This expectation used to be
  // exactly the facets plus the filters, which was a complete list only because
  // Domain Rating collection was frozen and no export carried a rating. The
  // freeze has been lifted by the repository's owner — Ahrefs also publishes
  // Domain Rating through a free public endpoint the frozen policy was never
  // written against — every record now carries a reading, and the export carries
  // it with its provider, because a bare number in a spreadsheet is a number
  // whose origin the reader cannot check. So the old list is false while the
  // property it was protecting is not.
  //
  // That property is that the columns are DERIVED from what the page offers and
  // never hand-listed, and that the file's header is exactly the derived set. So
  // the expectation is still built from the page's own controls: facets, then
  // filters, then the metric pair — and the metric pair only where the page
  // offers the domain-rating sort that earns it.
  const METRIC_COLUMNS = ['domain_rating', 'domain_rating_provider'];
  // EXTENDED THE SAME WAY, for link value. Three columns rather than one
  // because they are three separate facts — what the anchor's rel says, how
  // the link reaches the site, and whether the page carrying it can be crawled
  // — and they appear only where the page offers the link-type control, which
  // itself renders only where records carry the evidence. The property is
  // unchanged: derived from the controls, never hand-listed.
  const LINK_COLUMNS = ['link_type', 'link_target_type', 'listing_page_indexability'];
  for (const family of FAMILIES) {
    const schema = schemaOf(htmlFor(family.page));
    const columns = D.exportColumns(schema).map((c) => c.key);
    assert.strictEqual(columns[0], 'name', `${family.key}: the identity is not the first column`);
    assert.deepStrictEqual(columns.slice(1),
      schema.facets.map((f) => f.name).concat(schema.filters)
        .concat(schema.sorts.includes('domain-rating') ? METRIC_COLUMNS : [])
        .concat((schema.linkTypes || []).length ? LINK_COLUMNS : []),
      `${family.key}: the export columns drifted from the controls`);
    const app = boot(family.page, '');
    assert.deepStrictEqual(parseCsv(app.csv())[0], columns,
      `${family.key}: the file's header is not the derived column set`);
  }
  // All five families offer the rating sort today, so the real pages exercise
  // that branch in one direction only. A schema that offers no such sort is
  // therefore built here rather than left untested: the metric pair has to be
  // earned by a control the page actually renders, never appended
  // unconditionally to every export in the collection.
  const noRatingSort = {
    facets: [{ name: 'country', multi: false, values: ['czech-republic'] }],
    filters: ['free-submission'],
    sorts: ['alphabetical'],
    jurisdictions: [],
  };
  assert.deepStrictEqual(D.exportColumns(noRatingSort).map((c) => c.key),
    ['name', 'country', 'free-submission'],
    'a page offering no Domain Rating sort was still given the metric columns');
});

// ── 7b. EVERY PAGE THAT HAS CONTROLS, NOT ONLY THE FIVE NAMED ONES ──────────

let controlPageCache = null;
function controlPages() {
  if (controlPageCache) return controlPageCache;
  controlPageCache = generatedPages()
    .map((rel) => ({ rel, html: read(rel) }))
    .filter((p) => p.html.includes('data-bd-export'));
  return controlPageCache;
}

test('every page with discovery controls is shareable and exportable, in every locale', () => {
  // The five families are named in this file; the pages are not. Country and
  // category pages exist per country and per locale, and a guard that only knew
  // about five URLs would certify nothing about the other 220.
  const pages = controlPages();
  assert.ok(pages.length >= 220, `only ${pages.length} pages carry the export control`);
  let facetValues = 0;
  for (const { rel, html } of pages) {
    const schema = schemaOf(html);
    assert.ok(html.includes('<tbody data-bd-rows>'), `${rel}: controls over no declared rows`);
    // The identity the export writes in its first column. A row without one
    // would export a blank line that names nothing.
    const rows = [...html.matchAll(/<tr class="bd-row"([^>]*)>/g)];
    assert.ok(rows.length > 0, `${rel}: an export control over an empty table`);
    for (const row of rows) {
      assert.ok(/data-bd-name="[^"]+"/.test(row[1]),
        `${rel}: a row carries no identity, so the export would name it nothing`);
    }
    // Shareable: the clean state is a clean URL, and every offered value round-trips.
    assert.strictEqual(D.serializeState(D.emptyState(schema), schema), '', `${rel}: dirty clean URL`);
    for (const facet of schema.facets) {
      assert.ok(D.RESERVED.indexOf(facet.name) === -1, `${rel}: facet "${facet.name}" is reserved`);
      const state = D.emptyState(schema);
      state.facets[facet.name] = facet.values[0];
      const qs = D.serializeState(state, schema);
      assert.deepStrictEqual(D.parseState(new URLSearchParams(qs), schema), state,
        `${rel}: ${qs} did not round-trip`);
      facetValues += 1;
    }
    // The label is a template with a placeholder for the live count.
    assert.ok(/data-bd-export-label="[^"]*\{n\}[^"]*"/.test(html), `${rel}: the export label is not a template`);
    // And the count the generator baked in is the number of rows it rendered.
    // The worklist gets this wrong the easy way: 1,563 opportunities are drawn
    // as 2,167 rows, because the "other countries" table repeats a subset.
    const rendered = /data-bd-export-label="[^"]*">([^<]*)</.exec(html)[1];
    assert.ok(rendered.includes(`(${rows.length})`),
      `${rel}: the button opens saying "${rendered}" over ${rows.length} rows`);
  }
  assert.ok(facetValues >= 40, `only ${facetValues} facets across every page`);
});

// ── 8. THE CSV ITSELF ───────────────────────────────────────────────────────

test('RFC 4180: quotes, commas, CR, LF and embedded newlines survive a round trip', () => {
  const awkward = [
    'plain',
    'a,b',
    'say "hi"',
    '"leading quote',
    'line\nbreak',
    'crlf\r\nbreak',
    'carriage\rreturn',
    'trailing space ',
    '',
  ];
  const rows = awkward.map((name) => ({ name }));
  const csv = D.renderFilteredCsv(rows, [{ key: 'name', from: 'name' }]);
  assert.strictEqual(csv.charCodeAt(0), 0xFEFF, 'the BOM is missing; Excel will mangle the accents');
  assert.ok(csv.endsWith('\r\n'), 'the file does not end with a CRLF');
  const back = parseCsv(csv);
  assert.deepStrictEqual(back[0], ['name']);
  assert.deepStrictEqual(back.slice(1).map((r) => r[0]), awkward.map((v) => (
    // A leading CR or a leading quote is defused by the formula guard, which is
    // a documented transformation and not a round-trip failure.
    /^[=+\-@\t\r]/.test(v) ? `'${v}` : v)));
});

test('Czech, Polish, German and French values survive exactly, from the real data', () => {
  const wanted = {
    cs: /[ěščřžýáíéúůňťď]/i,
    pl: /[ąćęłńóśźż]/i,
    de: /[äöüß]/,
    fr: /[àâçéèêëîïôùûœ]/i,
  };
  const found = {};
  for (const page of ['/research/tenders-procurement/', '/research/marketplaces/',
    '/research/media-pr-publishing/']) {
    const app = boot(page, '');
    const names = app.visible();
    const exported = csvNames(app.csv());
    assert.deepStrictEqual(exported, names.map(asCell), `${page}: the export lost or reordered a record`);
    for (const [lang, re] of Object.entries(wanted)) {
      const hit = names.find((n) => re.test(n));
      if (hit && !found[lang]) found[lang] = [hit, exported.includes(asCell(hit))];
    }
  }
  for (const lang of Object.keys(wanted)) {
    assert.ok(found[lang], `no ${lang} accented name in the real data; the case is untested`);
    assert.ok(found[lang][1], `${lang}: "${found[lang][0]}" did not survive the export byte for byte`);
  }
});

test('a name beginning with = or + is neutralised, and the record is not touched', () => {
  // The projection boundary, proved on the real page: one record is given a
  // hostile name in the markup and the exported cell must be inert.
  const page = '/research/marketplaces/';
  const hostile = '=cmd|\' /c calc\'!A1';
  const app = boot(page, '?country=india', (html) => html.replace(
    /data-bd-name="99acres"/, `data-bd-name="${hostile.replace(/"/g, '&quot;')}"`));
  const csv = app.csv();
  assert.ok(csv.includes(`"'${hostile}"`) || csv.includes(`'${hostile}`),
    'the formula was not defused');
  const cell = csvNames(csv).find((n) => n.includes('cmd|'));
  assert.strictEqual(cell, `'${hostile}`, 'the cell is not a text cell');
  // The row itself keeps its own characters: only the cell was defused.
  const row = app.rows().find((r) => (r.getAttribute('data-bd-name') || '').includes('cmd|'));
  assert.strictEqual(row.getAttribute('data-bd-name'), hostile, 'the source row was mutated');

  // Every guarded character, at the field level.
  for (const value of ['=1+1', '+1', '-1', '@SUM(A1)', '\tx', '\rx']) {
    assert.strictEqual(D.csvField(value).replace(/^"|"$/g, '').replace(/""/g, '"'), `'${value}`,
      `${JSON.stringify(value)} was not defused`);
  }
  // And nothing else is: a plain value is written plainly.
  assert.strictEqual(D.csvField('Ouedkniss'), 'Ouedkniss');
  assert.strictEqual(D.csvField(null), '');
  assert.strictEqual(D.csvField(undefined), '');
});

test('the guard matches the one the other exports already apply', () => {
  // Not a third dialect. build-tender-monitoring.cjs has had this guard since
  // it was written; this is the same rule, applied by one shared function that
  // the browser and the generators can both reach.
  const MON = require('../build-tender-monitoring.cjs');
  for (const value of ['=1+1', '@x', 'plain', 'a,b', 'say "hi"', 'line\nbreak', '', null]) {
    assert.strictEqual(D.csvField(value), MON.csvField(value),
      `the shared guard and the monitoring export disagree about ${JSON.stringify(value)}`);
  }
});

test('there is one CSV writer, and the collection exports use it unchanged', () => {
  // Three generators each held their own spelling of RFC 4180 and a fourth was
  // about to be written for the browser. They now share one, and the split
  // between the two entry points is the whole of the difference: csvQuote
  // publishes the registry's values verbatim, csvField additionally defuses a
  // cell a spreadsheet would execute.
  for (const file of ['scripts/build-tenders-procurement.cjs', 'scripts/build-marketplaces.cjs',
    'scripts/build-media-platforms.cjs']) {
    const src = read(file);
    assert.ok(/require\('\.\/lib\/bd-discovery\.cjs'\)/.test(src),
      `${file} does not use the shared CSV writer`);
    assert.ok(!/function csvField|const csvField = \(/.test(src),
      `${file} still defines its own CSV cell writer`);
  }
  for (const value of ['plain', 'a,b', 'say "hi"', 'line\nbreak', '', null, undefined, ['a', 'b']]) {
    assert.strictEqual(D.csvField(value), D.csvQuote(value),
      `the two writers disagree about ${JSON.stringify(value)}, which carries no formula`);
  }
  for (const value of ['=1+1', '+1', '-1', '@Press', '\tx']) {
    assert.strictEqual(D.csvQuote(value), value, `csvQuote rewrote ${JSON.stringify(value)}`);
    assert.notStrictEqual(D.csvField(value), D.csvQuote(value),
      `${JSON.stringify(value)} was not defused by the guarded writer`);
  }
  // And the published collection exports still carry the registry verbatim.
  const media = read('research/media-pr-publishing/opportunities.csv');
  assert.ok(media.includes(',@Press,'), 'the static export no longer carries the record\'s own name');
});

test('the export filename is deterministic, sanitized, and carries no query text', () => {
  assert.strictEqual(D.exportFilename('tenders-procurement'), 'tenders-procurement-filtered.csv');
  assert.strictEqual(D.exportFilename('united-states'), 'united-states-filtered.csv');
  assert.strictEqual(D.exportFilename(''), 'research-filtered.csv');
  assert.strictEqual(D.exportFilename(null), 'research-filtered.csv');
  // Nothing a reader could type may reach a filesystem path.
  for (const hostile of ['../../etc/passwd', 'a/b\\c', 'q="; rm -rf /', '<script>', 'ünïcødé']) {
    const name = D.exportFilename(hostile);
    assert.match(name, /^[a-z0-9-]+-filtered\.csv$/, `${hostile} produced ${name}`);
    assert.ok(!name.includes('..') && !name.includes('/'), `${hostile} produced a path`);
  }
  // Same selection, same file name: the name describes the collection, never
  // the query, so two different filters do not produce two mystery files.
  const a = boot('/research/marketplaces/', '?country=india');
  const b = boot('/research/marketplaces/', '?q=shop');
  a.csv();
  b.csv();
  assert.strictEqual(D.exportFilename('marketplaces'), 'marketplaces-filtered.csv');
  assert.ok(!D.exportFilename('marketplaces').includes('india'));
});

test('the export reaches no network and revokes what it allocates', () => {
  for (const file of ['js/bd-discovery.js', 'js/business-directories.js']) {
    const src = read(file);
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|import\s*\(/.test(src), `${file} reaches the network`);
  }
  const app = boot('/research/marketplaces/', '?country=india');
  app.csv();
  assert.strictEqual(app.blobs.length, 1);
  assert.deepStrictEqual(app.revoked, ['blob:0'], 'the object URL was never revoked');
});

// ── 9. THE COMPONENT ────────────────────────────────────────────────────────

test('the export control is localized and every class it emits is styled', () => {
  const css = read('css/business-directories.css');
  const styled = new Set((css.match(/\.bd-[a-zA-Z0-9_-]+/g) || []).map((s) => s.slice(1)));
  const labels = new Set();
  for (const locale of I18N.LOCALE_CODES) {
    const html = components.components(locale).filteredExportControl({ name: 'x', count: 7 });
    for (const m of html.matchAll(/class="([^"]+)"/g)) {
      for (const cls of m[1].split(/\s+/)) {
        if (cls.startsWith('bd-')) assert.ok(styled.has(cls), `unstyled class: .${cls}`);
      }
    }
    const label = /data-bd-export-label="([^"]+)"/.exec(html)[1];
    assert.ok(label.includes('{n}'), `${locale}: the label lost its placeholder`);
    assert.ok(html.includes('>' + label.replace('{n}', '7') + '<'),
      `${locale}: the rendered label does not carry the real count`);
    labels.add(label);
  }
  assert.strictEqual(labels.size, I18N.LOCALE_CODES.length,
    'two locales share a label; the export button is not translated');
  // And the localized pages carry the localized label, not the English one.
  for (const locale of ['de', 'es', 'fr']) {
    const html = read(I18N.localizedFile(locale, '/research/tenders-procurement/'));
    assert.ok(!html.includes('Download filtered results'),
      `${locale}: the English export label leaked onto a translated page`);
    assert.ok(/data-bd-export-label="[^"]+\{n\}[^"]*"/.test(html),
      `${locale}: no export label at all`);
  }
});

test('the shipped predicate is still the tested one, byte for byte', () => {
  assert.strictEqual(read('js/bd-discovery.js'), read('scripts/lib/bd-discovery.cjs'),
    'the shipped URL and export contract has drifted from the tested one');
});
