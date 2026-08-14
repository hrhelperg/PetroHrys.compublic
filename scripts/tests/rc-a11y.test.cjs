'use strict';

// Research Center discovery — a STRUCTURAL accessibility audit of the controls
// that are actually emitted, and of the ones the clients create at runtime.
//
// Structural, not perceptual: this file says nothing about contrast, focus
// rings, reading order or whether a label is well worded. It asserts the four
// things that are machine-checkable and that silently break when a generator
// changes — a control with no name, an id that appears twice, an ARIA attribute
// that does not exist, and a live region that either never speaks or will not
// stop.
//
// ── WHY THE MARKUP AUDIT AND THE RUNTIME AUDIT ARE BOTH HERE ────────────────
//
// Half of these controls do not exist until JavaScript runs. The collection
// pages CREATE their status line in js/business-directories.js — it is not in
// the HTML — and the planner's summary paragraph is inert markup until
// js/distribution-planner.js adopts it. A markup-only audit would certify 232
// pages and miss the only two live regions in the Research Center; a
// runtime-only audit would miss the 1,856 labelled controls that ship in the
// HTML. So the file does both, against the real generated pages.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const { createDocument } = require('./helpers/mini-dom.cjs');
const I18N = require('../lib/i18n.cjs');
const P = require('../lib/distribution-planner.cjs');

// ── THE PAGE SET ────────────────────────────────────────────────────────────

let cache = null;
function pages() {
  if (cache) return cache;
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
  cache = out
    .filter((rel) => {
      const html = read(rel);
      return html.includes('data-bd-export') || html.includes('data-dp-controls');
    })
    .map((rel) => ({ rel, html: read(rel) }));
  return cache;
}

// WAI-ARIA 1.2. Deliberately an allowlist of what this project emits rather than
// the full specification: a misspelling like aria-labeledby is silently inert in
// every browser, and the only way to catch it is to refuse anything unrecognised.
const ARIA_ATTRS = new Set(['aria-label', 'aria-labelledby', 'aria-describedby',
  'aria-live', 'aria-current', 'aria-hidden', 'aria-atomic', 'aria-relevant',
  'aria-busy', 'aria-controls', 'aria-expanded', 'aria-disabled', 'aria-sort',
  'aria-selected', 'aria-checked', 'aria-pressed', 'aria-required', 'aria-invalid',
  'aria-modal', 'aria-haspopup', 'aria-owns', 'aria-details', 'aria-errormessage',
  'aria-keyshortcuts', 'aria-roledescription', 'aria-placeholder', 'aria-level',
  'aria-posinset', 'aria-setsize', 'aria-valuenow', 'aria-valuemin', 'aria-valuemax',
  'aria-valuetext', 'aria-multiselectable', 'aria-orientation', 'aria-readonly']);
const ROLES = new Set(['status', 'alert', 'log', 'navigation', 'main', 'banner',
  'contentinfo', 'complementary', 'list', 'listitem', 'table', 'row', 'cell',
  'columnheader', 'rowheader', 'group', 'region', 'button', 'link', 'presentation',
  'none', 'search', 'form', 'img', 'heading', 'note', 'tooltip', 'separator',
  'progressbar', 'switch', 'tab', 'tablist', 'tabpanel', 'dialog', 'menu',
  'menuitem', 'toolbar', 'grid', 'gridcell', 'definition', 'term', 'figure',
  'article', 'document', 'application', 'feed', 'math', 'timer', 'marquee']);

const idsOf = (html) => [...html.matchAll(/\sid="([^"]*)"/g)].map((m) => m[1]);

// ── 1. EVERY CONTROL HAS A NAME ─────────────────────────────────────────────

test('every input and select on a discovery page has an associated label', () => {
  let named = 0;
  const all = pages();
  assert.ok(all.length >= 230, `only ${all.length} pages carry discovery controls`);
  for (const { rel, html } of all) {
    const targets = new Set([...html.matchAll(/<label[^>]*\sfor="([^"]*)"/g)].map((m) => m[1]));
    const ids = new Set(idsOf(html));
    for (const target of targets) {
      assert.ok(ids.has(target),
        `${rel}: a <label for="${target}"> points at an element that is not on the page`);
    }
    for (const [, tag, attrs] of html.matchAll(/<(input|select|textarea)\b([^>]*)>/g)) {
      const type = (/\stype="([^"]*)"/.exec(attrs) || [])[1] || 'text';
      if (type === 'hidden') continue;
      const id = (/\sid="([^"]*)"/.exec(attrs) || [])[1];
      const aria = /\saria-label(?:ledby)?="[^"]+"/.test(attrs);
      assert.ok((id && targets.has(id)) || aria,
        `${rel}: <${tag}${id ? ` id="${id}"` : ''}${attrs.slice(0, 60)}> has no associated label,`
        + ' so a screen reader announces it as an unnamed control');
      named += 1;
    }
  }
  // 1,856 named controls across the 232 pages at the time of writing: 1,500
  // inputs (the tri-state checkboxes and the search boxes) and 356 selects.
  assert.ok(named >= 1800, `only ${named} controls audited`);
});

test('a placeholder is never the only name a control has', () => {
  // The search box carries a placeholder AND a label. A placeholder alone is not
  // an accessible name in several screen readers, and it disappears the moment
  // anyone types — so it is the classic way a labelled-looking field turns out
  // to have no name at all.
  let searchBoxes = 0;
  for (const { rel, html } of pages()) {
    const targets = new Set([...html.matchAll(/<label[^>]*\sfor="([^"]*)"/g)].map((m) => m[1]));
    for (const [, attrs] of html.matchAll(/<input([^>]*\splaceholder="[^"]*"[^>]*)>/g)) {
      const id = (/\sid="([^"]*)"/.exec(attrs) || [])[1];
      assert.ok(id && targets.has(id), `${rel}: an <input> is named only by its placeholder`);
      searchBoxes += 1;
    }
  }
  assert.ok(searchBoxes >= 200, `only ${searchBoxes} placeholder-bearing inputs found`);
});

// ── 2. NO DUPLICATE IDS ─────────────────────────────────────────────────────

test('no discovery page carries a duplicate or empty id', () => {
  // A duplicate id breaks <label for> and aria-labelledby silently: both resolve
  // to the FIRST match, so the second control loses its name and nothing about
  // the page looks wrong. It is also how the planner client could be handed the
  // wrong <section id="campaign"> to empty and refill.
  let total = 0;
  for (const { rel, html } of pages()) {
    const ids = idsOf(html);
    total += ids.length;
    const seen = new Map();
    for (const id of ids) {
      assert.notStrictEqual(id, '', `${rel}: an element carries id=""`);
      seen.set(id, (seen.get(id) || 0) + 1);
    }
    for (const [id, n] of seen) {
      assert.strictEqual(n, 1, `${rel}: id="${id}" appears ${n} times`);
    }
  }
  // 3,292 ids across the 232 pages — the jurisdiction group anchors on the
  // country pages are most of them.
  assert.ok(total >= 3000, `only ${total} ids audited`);
});

// ── 3. NO INVALID ARIA ──────────────────────────────────────────────────────

test('every ARIA attribute and role on a discovery page is real and resolves', () => {
  let attrs = 0;
  let roles = 0;
  for (const { rel, html } of pages()) {
    const ids = new Set(idsOf(html));
    for (const m of html.matchAll(/\s(aria-[a-z]+)=/g)) {
      attrs += 1;
      assert.ok(ARIA_ATTRS.has(m[1]), `${rel}: ${m[1]} is not an ARIA attribute`);
    }
    for (const m of html.matchAll(/\srole="([^"]*)"/g)) {
      roles += 1;
      for (const role of m[1].split(/\s+/).filter(Boolean)) {
        assert.ok(ROLES.has(role), `${rel}: role="${role}" is not an ARIA role`);
      }
    }
    // A reference to an id that is not on the page names nothing at all, and
    // the element falls back to whatever its content happens to be.
    for (const m of html.matchAll(/\saria-(labelledby|describedby)="([^"]*)"/g)) {
      for (const ref of m[2].split(/\s+/).filter(Boolean)) {
        assert.ok(ids.has(ref), `${rel}: aria-${m[1]}="${ref}" points at no element`);
      }
    }
    for (const m of html.matchAll(/\saria-label="([^"]*)"/g)) {
      assert.ok(m[1].trim(), `${rel}: an empty aria-label removes the name it was meant to give`);
    }
    for (const m of html.matchAll(/\saria-live="([^"]*)"/g)) {
      assert.ok(['off', 'polite', 'assertive'].includes(m[1]),
        `${rel}: aria-live="${m[1]}" is not a valid value`);
      assert.notStrictEqual(m[1], 'assertive',
        `${rel}: an assertive live region interrupts whatever the reader is listening to;`
        + ' a result count is never urgent enough for that');
    }
  }
  // 4,007 ARIA attributes and 456 roles at the time of writing.
  assert.ok(attrs >= 3800, `only ${attrs} ARIA attributes audited`);
  assert.ok(roles >= 400, `only ${roles} roles audited`);
});

// ── 4. CLEAR AND EXPORT ARE REAL BUTTONS ────────────────────────────────────

test('the clear and export controls are real buttons with names, in the tab order', () => {
  let found = 0;
  for (const { rel, html } of pages()) {
    for (const attr of ['data-bd-clear', 'data-bd-export', 'data-dp-download']) {
      const hit = new RegExp(`<([a-z]+)([^>]*\\s${attr}(?=[\\s>=])[^>]*)>`).exec(html);
      if (!hit) continue;
      found += 1;
      const [whole, tag, tagAttrs] = hit;
      // A <div> or an <a href="#"> with a click handler is not keyboard
      // reachable and is not announced as an action. A <button> is both, for
      // free, in every browser.
      assert.strictEqual(tag, 'button', `${rel}: ${attr} is a <${tag}>, not a button`);
      // Inside a form-shaped page a typeless button submits. These pages have no
      // form, which is exactly why the omission would never be noticed here and
      // would break the day one is added.
      assert.ok(/\stype="button"/.test(tagAttrs), `${rel}: ${attr} declares no type`);
      assert.ok(!/\stabindex="-1"/.test(tagAttrs), `${rel}: ${attr} is removed from the tab order`);
      assert.ok(!/\sdisabled(?=[\s>])/.test(tagAttrs),
        `${rel}: ${attr} ships disabled, so a keyboard reader cannot reach it at all`);
      const from = html.indexOf(whole) + whole.length;
      const text = html.slice(from, html.indexOf('</button>', from)).replace(/<[^>]*>/g, '').trim();
      assert.ok(text || /aria-label="[^"]+"/.test(tagAttrs),
        `${rel}: ${attr} has no accessible name`);
    }
  }
  // 228 export buttons, 4 planner download buttons, and the clear controls.
  assert.ok(found >= 230, `only ${found} action controls audited`);
});

test('a control that only works with JavaScript ships hidden, not broken', () => {
  // The other half of "keyboard reachable": a button that is reachable and does
  // nothing is worse than one that is not there. The export and the planner
  // download both depend on Blob and on a download attribute, so they ship
  // hidden and are revealed by the client once it has proved it can build a file.
  for (const { rel, html } of pages()) {
    const exportBtn = /<p[^>]*\sdata-bd-export-wrap[^>]*>/.exec(html);
    if (exportBtn) {
      assert.ok(/\shidden(?=[\s>])/.test(exportBtn[0]),
        `${rel}: the filtered export is offered before the browser has proved it can produce a file`);
    }
    const dl = /<button[^>]*\sdata-dp-download(?=[\s>])[^>]*>/.exec(html);
    if (dl) {
      assert.ok(/\shidden(?=[\s>])/.test(dl[0]),
        `${rel}: the planner download is offered to a reader with no JavaScript to build it`);
    }
  }
});

// ── 5. THE COLLECTION PAGES: THE COUNT IS ANNOUNCED, AND ONLY WHEN IT MOVES ──

const CLIENT_SOURCES = ['js/bd-order.js', 'js/bd-discovery.js', 'js/business-directories.js'].map(read);

function bootCollection(page) {
  const document = createDocument(read(`${page.replace(/^\//, '')}index.html`));
  const nativeCreate = document.createElement;
  const writes = [];
  document.createElement = (tag) => {
    const node = nativeCreate(tag);
    if (tag === 'a') { node.download = ''; node.href = ''; node.click = () => {}; }
    if (tag === 'p') {
      // Every assignment is recorded, including one that writes the same string
      // back. That is the whole measurement: a polite live region re-announces
      // on assignment, not on change, so an unconditional write is an
      // announcement whether or not anything moved.
      let value = '';
      Object.defineProperty(node, 'textContent', {
        get() { return value; },
        set(next) {
          writes.push(String(next));
          value = String(next);
          node.children = [];
          node.text = String(next);
        },
        configurable: true,
      });
    }
    return node;
  };
  const location = { pathname: page, search: '' };
  const window = {
    document,
    URLSearchParams,
    Blob: function Blob() {},
    URL: { createObjectURL: () => 'blob:0', revokeObjectURL: () => {} },
    location,
    history: {
      pushState(s, t, url) { const at = String(url).indexOf('?'); location.search = at === -1 ? '' : String(url).slice(at); },
      replaceState(s, t, url) { const at = String(url).indexOf('?'); location.search = at === -1 ? '' : String(url).slice(at); },
    },
    addEventListener() {},
  };
  const sandbox = { document, window };
  vm.createContext(sandbox);
  for (const src of CLIENT_SOURCES) vm.runInContext(src, sandbox);
  return { document, writes, status: document.querySelectorAll('.bd-status')[0] };
}

const COLLECTION_PAGES = [
  '/research/business-directories/opportunities/',
  '/research/media-pr-publishing/',
  '/research/tenders-procurement/',
  '/research/business-directories/united-states/',
];

test('the result count is announced politely, by a region the client owns', () => {
  for (const page of COLLECTION_PAGES) {
    const app = bootCollection(page);
    assert.ok(app.status, `${page}: the client rendered no status line`);
    assert.strictEqual(app.status.getAttribute('role'), 'status', `${page}: not a status region`);
    assert.strictEqual(app.status.getAttribute('aria-live'), 'polite',
      `${page}: the count is not announced politely`);
    assert.ok(app.writes.length && /\d/.test(app.writes[app.writes.length - 1]),
      `${page}: the status line carries no count`);

    // It exists ONLY when the client is managing the table. The markup ships
    // without it, so a reader with no JavaScript is not given an empty live
    // region that will never say anything.
    assert.ok(!read(`${page.replace(/^\//, '')}index.html`).includes('bd-status'),
      `${page}: a live region ships in the markup and nothing ever writes to it`);
  }
});

test('the count is written only when it changed, so a sort announces nothing', () => {
  // The measurement that motivated the guard in js/business-directories.js.
  // Re-ordering cannot change how many rows are shown, so every sort change used
  // to re-announce a sentence identical to the one before it: 3 writes and 1
  // distinct string on the United States page, 2 and 1 on the worklist. Typing
  // was noisy the same way — 3 of the 8 keystrokes in "registry" left the count
  // where it was on the United States page.
  let sortsExercised = 0;
  for (const page of COLLECTION_PAGES) {
    const app = bootCollection(page);
    const search = app.document.querySelector('[data-bd-search]');
    const sort = app.document.querySelector('[data-bd-sort]');

    if (sort) {
      const keys = sort.querySelectorAll('option')
        .map((o) => o.getAttribute('value')).filter(Boolean);
      assert.ok(keys.length > 1, `${page}: only one sort key, so this proves nothing`);
      const before = app.writes.length;
      for (const key of keys) { sort.value = key; sort.dispatch('change'); }
      assert.strictEqual(app.writes.length, before,
        `${page}: cycling ${keys.length} sort keys wrote the count`
        + ` ${app.writes.length - before} time(s); re-ordering cannot change it`);
      sortsExercised += 1;
    }

    // Typing: every write must carry a count that differs from the one before.
    const word = 'registry';
    const at = app.writes.length;
    for (let i = 1; i <= word.length; i += 1) {
      search.value = word.slice(0, i);
      search.dispatch('input');
    }
    const typed = app.writes.slice(at);
    assert.ok(typed.length > 0, `${page}: typing announced nothing at all`);
    assert.strictEqual(new Set(typed).size, typed.length,
      `${page}: typing "${word}" produced ${typed.length} announcements and only`
      + ` ${new Set(typed).size} distinct sentences`);
    for (let i = 1; i < typed.length; i += 1) {
      assert.notStrictEqual(typed[i], typed[i - 1], `${page}: consecutive identical announcements`);
    }

    // And the guard did not silence a real change: the visible text still tracks
    // the table exactly.
    const visible = app.document.querySelectorAll('.bd-row').filter((r) => !r.hidden).length;
    assert.ok(app.status.textContent.startsWith(String(visible)),
      `${page}: the status line says "${app.status.textContent}" over ${visible} visible rows`);
  }
  assert.ok(sortsExercised >= 2, `only ${sortsExercised} page(s) offered a sort control`);
});

// ── 6. THE PLANNER: A SUMMARY NOBODY WAS TOLD ABOUT ─────────────────────────

// The planner client needs a little more of the DOM than the collection client:
// selects report `options` and `selectedIndex`, and the group renderer builds
// text nodes. Added to mini-dom here rather than in the shared helper, because
// only this page needs them.
function plannerDocument() {
  const document = createDocument(read(I18N.localizedFile('en', P.PLANNER_PATH)));
  for (const node of document.root.descendants()) {
    if (node.tagName === 'SELECT') {
      const options = node.children.filter((c) => c.tagName === 'OPTION');
      Object.defineProperty(node, 'options', { get: () => options, configurable: true });
      Object.defineProperty(node, 'selectedIndex', {
        get: () => options.findIndex((o) => o.getAttribute('value') === node.value),
        configurable: true,
      });
      const preselected = options.find((o) => o.getAttribute('selected') !== null);
      if (preselected) node.value = preselected.getAttribute('value');
    }
  }
  const byId = (id) => document.root.descendants().find((n) => n.attributes.id === id) || null;
  document.getElementById = byId;
  document.createTextNode = (text) => {
    const node = document.createElement(null);
    node.text = String(text);
    return node;
  };
  return document;
}

const tick = () => new Promise((resolve) => { setTimeout(resolve, 1); });

async function bootPlanner() {
  const document = plannerDocument();
  const payload = JSON.parse(read(`${P.PLANNER_PATH.replace(/^\//, '')}${P.PLANNER_DATA_FILE.split('/').pop()}`));
  const location = { pathname: P.PLANNER_PATH, search: '' };
  const listeners = {};
  const window = {
    location,
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    history: { pushState() {}, replaceState() {} },
  };
  const sandbox = {
    document,
    window,
    URLSearchParams,
    setTimeout,
    Blob: function Blob(parts) { this.parts = parts; },
    URL: { createObjectURL: () => 'blob:planner', revokeObjectURL: () => {} },
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve(payload) }),
  };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('js/dp-engine.js'), sandbox);
  vm.runInContext(read('js/distribution-planner.js'), sandbox);
  const status = document.querySelector('[data-dp-status]');
  const before = {
    role: status.getAttribute('role'),
    live: status.getAttribute('aria-live'),
    text: status.textContent,
  };
  await tick();
  await tick();
  const control = (key) => document.querySelectorAll('[data-dp-filter]')
    .find((s) => s.getAttribute('data-dp-filter') === key);
  return { document, status, before, control };
}

test('the planner page ships no live region, and the client promotes one after it boots', async () => {
  // The defect this test was written for: six controls that recompute the whole
  // campaign — up to 100 items across four groups — and one paragraph stating
  // what happened, with no aria-live anywhere on the page. Measured before the
  // fix: 0 occurrences of aria-live and 0 of role="status" in the generated
  // planner markup, in all four locales. A screen reader heard nothing when a
  // market was chosen.
  for (const locale of I18N.LOCALE_CODES) {
    const html = read(I18N.localizedFile(locale, P.PLANNER_PATH));
    const summary = /<p class="bd-note"([^>]*)\sdata-dp-status(?=[\s>])([^>]*)>/.exec(html);
    assert.ok(summary, `${locale}: the planner renders no summary paragraph`);
    assert.ok(!/aria-live|role=/.test(summary[1] + summary[2]),
      `${locale}: the summary ships as a live region, but without JavaScript it never changes`);
  }

  const app = await bootPlanner();
  assert.strictEqual(app.before.role, null, 'the summary was already a live region before boot');
  assert.strictEqual(app.status.getAttribute('role'), 'status',
    'the client did not promote the summary to a status region');
  assert.strictEqual(app.status.getAttribute('aria-live'), 'polite',
    'the client did not make the summary announce politely');
});

test('the planner announces a recompute, and says nothing when nothing changed', async () => {
  const app = await bootPlanner();
  const before = app.status.textContent;
  assert.ok(before && /\d/.test(before), 'the summary carries no numbers');

  // A control change that really does change the campaign must change the
  // sentence — otherwise the live region is present and useless.
  const market = app.control('market');
  const other = market.options.map((o) => o.getAttribute('value'))
    .find((v) => v !== market.value && v !== '*');
  market.value = other;
  market.dispatch('change');
  await tick();
  assert.notStrictEqual(app.status.textContent, before,
    `selecting the market "${other}" left the summary saying exactly what it said before`);
  assert.ok(app.status.textContent.length > 40, 'the summary collapsed to a fragment');

  // And setting a control back to the value it already holds must not rewrite
  // it. `change` does not fire on its own in that case, but the boot path and
  // popstate both call apply() unconditionally, so the guard is what keeps a
  // no-op recompute silent.
  const writes = [];
  const node = app.status;
  let held = node.textContent;
  Object.defineProperty(node, 'textContent', {
    get() { return held; },
    set(next) { writes.push(String(next)); held = String(next); },
    configurable: true,
  });
  market.dispatch('change');
  await tick();
  assert.deepStrictEqual(writes, [],
    `recomputing the identical campaign rewrote the live region: ${JSON.stringify(writes)}`);
});
