'use strict';

// The planner's URL state and its campaign export.
//
// ── WHY THESE TESTS COMPARE IDENTITIES ──────────────────────────────────────
//
// The planner's original defect was a page whose every count was internally
// consistent while being about the wrong market. Counting proves nothing here
// either: a URL that restores 25 opportunities restores the right 25 or it is
// the same bug wearing a query string. So every assertion below compares WHICH
// platforms, in which groups, in which order.
//
// ── THE TWO THINGS THAT CAN GO WRONG ────────────────────────────────────────
//
// A shared URL that reproduces a DIFFERENT campaign is worse than no sharing at
// all, because both ends believe they are looking at the same plan. And a URL
// is the one input to this page that arrives from outside it: dp-engine's
// businessFit THROWS on a profile it does not know, so ?business=<script> is
// not a value that scores badly — it is an exception inside the render, and the
// campaign the reader would be left staring at is whatever the server rendered,
// under a set of controls claiming something else.
//
// The client is therefore EXECUTED here, against a DOM whose controls are built
// from the real page's own option values, with a real hostile query string in
// the address bar. A source-shaped test would pass on a parser that validated
// nothing.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const P = require(path.join(ROOT, 'scripts/lib/distribution-planner.cjs'));
// The BROWSER copy, loaded the way the page loads it. dp-client.test.cjs proves
// the two files are the same bytes; this file tests the one that ships.
const E = require(path.join(ROOT, 'js/dp-engine.js'));
const BUILD = require(path.join(ROOT, 'scripts/build-distribution-planner.cjs'));

const OPS = P.project(P.loadAll());
const PAYLOAD = JSON.parse(read('research/distribution-planner/planner-data.json'));
const SLIM = PAYLOAD.opportunities;
const PAGE = read('research/distribution-planner/index.html');
const ENGINE_SRC = read('js/dp-engine.js');
const CLIENT_SRC = read('js/distribution-planner.js');
const PLANNER_PATH = '/research/distribution-planner/';

// ── the controls, taken from the real page ──────────────────────────────────

const decode = (s) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

function controlsFrom(html) {
  const out = {};
  const re = /<select class="bd-select" id="dp-[a-z]+" data-dp-filter="([a-z]+)"[^>]*>([\s\S]*?)<\/select>/g;
  for (const m of html.matchAll(re)) {
    out[m[1]] = [...m[2].matchAll(/<option value="([^"]*)"( selected)?>([^<]*)<\/option>/g)]
      .map((o) => ({ value: decode(o[1]), label: decode(o[3]), selected: Boolean(o[2]) }));
  }
  return out;
}

const CONTROLS = controlsFrom(PAGE);
const KNOWN = { markets: CONTROLS.market.map((o) => o.value) };
const DEFAULTS = E.PLANNER_DEFAULTS;

test('the page offers all six controls and every one has options behind it', () => {
  assert.deepStrictEqual(Object.keys(CONTROLS).sort(), [...E.PLANNER_PARAMS].sort(),
    'the controls parsed off the page are not the six the URL carries');
  for (const key of E.PLANNER_PARAMS) {
    assert.ok(CONTROLS[key].length >= 4, `${key} offers only ${CONTROLS[key].length} options`);
    assert.strictEqual(CONTROLS[key].filter((o) => o.selected).length, 1,
      `${key} does not have exactly one selected option`);
  }
});

// ── 1. URL ROUND-TRIP ───────────────────────────────────────────────────────

// Twelve states that move every control off its default at least twice, so a
// serializer that dropped one parameter fails rather than passing on the five
// it kept.
const STATES = [
  { business: 'local-business', objective: 'local-discovery', market: 'united-states', budget: 'free-freemium', size: 25, evidence: 'ready' },
  { business: 'b2b-saas', objective: 'seo-citations', market: 'united-kingdom', budget: 'any', size: 10, evidence: 'all' },
  { business: 'ai-startup', objective: 'product-launch', market: 'germany', budget: 'free-only', size: 50, evidence: 'high' },
  { business: 'ecommerce', objective: 'marketplace-exposure', market: 'india', budget: 'paid-allowed', size: 100, evidence: 'research' },
  { business: 'manufacturer', objective: 'b2b-buyer-discovery', market: '*', budget: 'free-freemium', size: 25, evidence: 'ready' },
  { business: 'telecom-voip-ucaas', objective: 'pr-coverage', market: 'czech-republic', budget: 'any', size: 10, evidence: 'high' },
  { business: 'cybersecurity', objective: 'brand-authority', market: 'united-states', budget: 'free-only', size: 50, evidence: 'all' },
  { business: 'hr-recruitment', objective: 'lead-generation', market: 'canada', budget: 'paid-allowed', size: 100, evidence: 'ready' },
  { business: 'legal', objective: 'referral-traffic', market: 'france', budget: 'free-freemium', size: 10, evidence: 'research' },
  { business: 'healthcare', objective: 'founder-visibility', market: '*', budget: 'any', size: 25, evidence: 'high' },
  { business: 'startup', objective: 'classified-advertising', market: 'spain', budget: 'free-only', size: 50, evidence: 'all' },
  { business: 'marketing-agency', objective: 'seo-citations', market: 'australia', budget: 'paid-allowed', size: 100, evidence: 'ready' },
  { business: 'professional-services', objective: 'local-discovery', market: 'united-kingdom', budget: 'free-freemium', size: 25, evidence: 'research' },
];

test('every state in the matrix is one the controls can actually be put in', () => {
  // Otherwise the round-trip below would be testing the fallback, not the
  // parser: an invented market normalises to the default and round-trips fine.
  const vocab = E.plannerVocabulary(KNOWN);
  for (const s of STATES) {
    for (const key of E.PLANNER_PARAMS) {
      assert.ok(vocab[key].indexOf(String(s[key])) !== -1,
        `${key}=${s[key]} is not a value the ${key} control offers`);
      assert.ok(CONTROLS[key].some((o) => o.value === String(s[key])),
        `${key}=${s[key]} is not an option on the page`);
    }
  }
  assert.ok(STATES.length >= 12, `only ${STATES.length} states`);
  for (const key of E.PLANNER_PARAMS) {
    const distinct = new Set(STATES.map((s) => String(s[key])));
    assert.ok(distinct.size >= 3,
      `the matrix only ever puts ${key} in ${distinct.size} state(s), so it proves nothing about it`);
  }
});

test('the planner URL round-trips every one of the thirteen states', () => {
  for (const s of STATES) {
    const qs = E.serializeState(s, KNOWN);
    const back = E.parseState(new URLSearchParams(qs), KNOWN);
    assert.deepStrictEqual(back, E.normalizeState(s, KNOWN),
      `${JSON.stringify(s)} did not survive "${qs}"`);
    // And serializing what was parsed produces the identical URL, so a link
    // that has been opened and re-copied is the same link.
    assert.strictEqual(E.serializeState(back, KNOWN), qs, `"${qs}" is not stable under re-serialization`);
  }
});

test('the default state serializes to nothing, and everything else to all six', () => {
  assert.strictEqual(E.serializeState(DEFAULTS, KNOWN), '',
    'the default state puts a query string on the planner canonical URL');
  for (const s of STATES.filter((x) => E.PLANNER_PARAMS.some((k) => String(x[k]) !== String(DEFAULTS[k])))) {
    const qs = E.serializeState(s, KNOWN);
    const params = new URLSearchParams(qs);
    assert.deepStrictEqual([...params.keys()], [...E.PLANNER_PARAMS],
      `${qs} does not carry all six parameters in a fixed order`);
  }
});

// ── 2. A SHARED URL IS THE SAME CAMPAIGN ────────────────────────────────────

const identity = (result) => ({
  picked: result.picked.map((r) => r.op.platformId),
  groups: result.groups.map((g) => ({ key: g.key, items: g.items.map((r) => r.op.platformId) })),
  totalEligible: result.totalEligible,
});

const campaignFor = (state) => E.campaign(SLIM, {
  business: state.business, objective: state.objective, market: state.market, budget: state.budget,
}, { size: Number(state.size), evidence: state.evidence });

test('a shared planner URL reproduces the same picked platforms', () => {
  const seen = new Set();
  for (const s of STATES) {
    const url = PLANNER_PATH + E.serializeState(s, KNOWN);
    // The receiving end knows nothing except the URL.
    const received = E.parseState(new URLSearchParams(url.slice(url.indexOf('?') + 1)), KNOWN);
    assert.deepStrictEqual(identity(campaignFor(received)), identity(campaignFor(s)),
      `${url} rebuilds a different campaign from the one it was copied from`);
    seen.add(url);
  }
  assert.strictEqual(seen.size, STATES.length, 'two different states produced the same URL');
});

test('the URL is what carries the campaign, not a coincidence of the defaults', () => {
  // Without this the test above would pass on a parser that ignored the query
  // string entirely and returned the default state every time.
  const pickedFor = (qs) => campaignFor(E.parseState(new URLSearchParams(qs), KNOWN))
    .picked.map((r) => r.op.platformId);
  const base = pickedFor('');
  const distinct = new Set([JSON.stringify(base)]);
  for (const s of STATES.slice(1)) {
    distinct.add(JSON.stringify(pickedFor(E.serializeState(s, KNOWN).slice(1))));
  }
  assert.ok(distinct.size >= 10,
    `thirteen states produced only ${distinct.size} distinct campaigns`);
  // The market alone moves it, which is the defect the planner was repaired for.
  const uk = pickedFor(E.serializeState({ ...DEFAULTS, market: 'united-kingdom' }, KNOWN).slice(1));
  assert.notDeepStrictEqual(uk, base, 'a market parameter changes nothing about the campaign');
});

// ── 3. HOSTILE AND STALE URLS ───────────────────────────────────────────────

const HOSTILE = [
  'business=<script>alert(1)</script>',
  'business=__proto__&objective=constructor',
  'business=b2b-saas-&objective=seo-citations%00',
  'market=../../etc/passwd&size=1e9',
  'size=999&evidence=%27%20OR%201%3D1',
  'budget=free-freemium%3Bdrop&evidence=ready%3Cimg',
  'objective=marketplace-exposure%3F&business=nonexistent-profile',
  'business=&objective=&market=&budget=&size=&evidence=',
  'BUSINESS=b2b-saas&Market=germany',
  'business[]=b2b-saas&size[]=10',
  'market=germany%3Cscript%3E',
  'size=-1&evidence=all%20',
  'business=local-business&business=<script>',
];

test('a hostile or stale URL falls back to the default state, in full', () => {
  for (const qs of HOSTILE) {
    const state = E.parseState(new URLSearchParams(qs), KNOWN);
    assert.deepStrictEqual(state, E.normalizeState({}, KNOWN),
      `"${qs}" was not rejected: ${JSON.stringify(state)}`);
    // Nothing from the query string is echoed back into the URL either.
    assert.strictEqual(E.serializeState(state, KNOWN), '',
      `"${qs}" survived into a serialized URL`);
  }
});

test('the engine still throws on the value the parser rejects, so the guard is load-bearing', () => {
  // If this ever stops throwing, the parser is still right but this suite would
  // silently stop proving anything, so the throw is asserted rather than assumed.
  assert.throws(() => E.campaign(SLIM, { business: '<script>', objective: 'seo-citations',
    market: '*', budget: 'any' }, { size: 10, evidence: 'ready' }), /Unknown business profile/);
  // And a parsed hostile URL never reaches it in that shape.
  for (const qs of HOSTILE) {
    const s = E.parseState(new URLSearchParams(qs), KNOWN);
    assert.doesNotThrow(() => campaignFor(s), `"${qs}" reached the engine`);
  }
});

test('one bad parameter costs only that parameter', () => {
  // Per-parameter fallback, not all-or-nothing. A stale link whose business
  // profile was renamed should still honour the market and budget the sender
  // chose; throwing the whole state away would quietly hand them a campaign
  // for a market they never picked.
  const s = E.parseState(new URLSearchParams(
    'business=nonexistent-profile&objective=marketplace-exposure&market=germany'
    + '&budget=paid-allowed&size=50&evidence=all'), KNOWN);
  assert.deepStrictEqual(s, { business: DEFAULTS.business, objective: 'marketplace-exposure',
    market: 'germany', budget: 'paid-allowed', size: 50, evidence: 'all' });
});

test('a duplicated parameter resolves to the first value, deterministically', () => {
  const s = E.parseState(new URLSearchParams('market=germany&market=india'), KNOWN);
  assert.strictEqual(s.market, 'germany',
    'a second copy of a parameter overrides the one a reader would see first');
});

test('a market the corpus does not contain is refused even though it is well formed', () => {
  const s = E.parseState(new URLSearchParams('market=atlantis'), KNOWN);
  assert.strictEqual(s.market, DEFAULTS.market);
  // And the vocabulary is the control's own, not a hardcoded list.
  assert.ok(KNOWN.markets.length > 30, `only ${KNOWN.markets.length} markets on the control`);
  assert.ok(KNOWN.markets.includes('germany') && !KNOWN.markets.includes('atlantis'));
});

// ── a DOM, only as much as this client touches ──────────────────────────────

class N {
  constructor(tag, doc) {
    this.tagName = tag ? tag.toUpperCase() : null;
    this.attributes = {};
    this.children = [];
    this.parentNode = null;
    this.text = '';
    this.listeners = {};
    this.doc = doc || null;
  }

  get id() { return this.attributes.id || ''; }
  set id(v) { this.attributes.id = String(v); }
  get className() { return this.attributes.class || ''; }
  set className(v) { this.attributes.class = String(v); }
  get hidden() { return this.attributes.hidden !== undefined; }
  set hidden(v) { if (v) this.attributes.hidden = ''; else delete this.attributes.hidden; }
  get options() { return this.children.filter((c) => c.tagName === 'OPTION'); }
  get selectedIndex() { return this._sel === undefined ? -1 : this._sel; }
  set selectedIndex(i) { this._sel = i; }

  get value() {
    if (this.tagName === 'SELECT') {
      const o = this.options[this.selectedIndex];
      return o ? o.value : '';
    }
    return this._value !== undefined ? this._value : (this.attributes.value || '');
  }

  set value(v) {
    if (this.tagName === 'SELECT') { this._sel = this.options.findIndex((o) => o.value === String(v)); return; }
    this._value = String(v);
  }

  get textContent() {
    return this.children.length ? this.children.map((c) => c.textContent).join('') : this.text;
  }

  set textContent(v) { this.children = []; this.text = String(v); }

  getAttribute(k) {
    return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null;
  }

  setAttribute(k, v) { this.attributes[k] = String(v); }

  appendChild(c) {
    if (c.parentNode) c.parentNode.removeChild(c);
    c.parentNode = this; this.children.push(c); return c;
  }

  removeChild(c) {
    const i = this.children.indexOf(c);
    if (i >= 0) this.children.splice(i, 1);
    c.parentNode = null; return c;
  }

  addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
  dispatch(t) { (this.listeners[t] || []).slice().forEach((fn) => fn({ type: t, target: this })); }
  click() { if (this.doc) this.doc.clicks.push(this); this.dispatch('click'); }

  descendants(acc = []) {
    for (const c of this.children) { acc.push(c); c.descendants(acc); }
    return acc;
  }

  matches(sel) {
    const attr = /^\[([a-zA-Z0-9-]+)\]$/.exec(sel);
    if (attr) return Object.prototype.hasOwnProperty.call(this.attributes, attr[1]);
    if (sel.startsWith('.')) return this.className.split(/\s+/).includes(sel.slice(1));
    return this.tagName === sel.toUpperCase();
  }

  querySelector(s) { return this.descendants().find((n) => n.matches(s)) || null; }
  querySelectorAll(s) { return this.descendants().filter((n) => n.matches(s)); }
}

// The planner page, built from the REAL page's controls and the REAL default
// campaign's group keys. Nothing here is invented: a control the generator stops
// emitting disappears from this document too.
function plannerDocument(defaultResult) {
  const doc = { clicks: [] };
  const root = new N('main', doc);
  const mk = (tag) => new N(tag, doc);

  const controls = mk('div');
  controls.setAttribute('data-dp-controls', '');
  for (const key of E.PLANNER_PARAMS) {
    const sel = mk('select');
    sel.setAttribute('id', `dp-${key}`);
    sel.setAttribute('data-dp-filter', key);
    for (const o of CONTROLS[key]) {
      const opt = mk('option');
      opt.setAttribute('value', o.value);
      opt.textContent = o.label;
      sel.appendChild(opt);
    }
    sel.value = (CONTROLS[key].find((o) => o.selected) || CONTROLS[key][0]).value;
    controls.appendChild(sel);
  }
  root.appendChild(controls);

  const status = mk('p');
  status.setAttribute('data-dp-status', '');
  status.textContent = 'the prerendered summary';
  root.appendChild(status);

  const section = mk('section');
  section.setAttribute('id', 'campaign');
  section.appendChild(mk('h2'));
  section.appendChild(mk('p'));
  const note = mk('p');
  const button = mk('button');
  button.setAttribute('data-dp-download', '');
  button.hidden = true;
  button.textContent = 'Download as CSV';
  note.appendChild(button);
  section.appendChild(note);
  // The prerendered campaign, marked replaceable exactly as the generator marks it.
  for (const g of defaultResult.groups) {
    const box = mk('section');
    box.setAttribute('data-dp-group', g.key);
    section.appendChild(box);
  }
  root.appendChild(section);

  doc.root = root;
  doc.querySelector = (s) => root.querySelector(s);
  doc.querySelectorAll = (s) => root.querySelectorAll(s);
  doc.getElementById = (id) => root.descendants().find((n) => n.attributes.id === id) || null;
  doc.createElement = (tag) => mk(tag);
  doc.createTextNode = (t) => { const n = mk(null); n.text = String(t); return n; };
  return doc;
}

function makeWindow(startUrl) {
  const loc = { pathname: PLANNER_PATH, search: '' };
  const stack = [startUrl];
  let idx = 0;
  const apply = (url) => {
    const q = url.indexOf('?');
    loc.pathname = q === -1 ? url : url.slice(0, q);
    loc.search = q === -1 ? '' : url.slice(q);
  };
  apply(startUrl);
  const listeners = {};
  return {
    location: loc,
    listeners,
    addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    history: {
      pushState(s, t, url) { stack.length = idx + 1; stack.push(String(url)); idx += 1; apply(stack[idx]); },
      replaceState(s, t, url) { stack[idx] = String(url); apply(stack[idx]); },
    },
    url: () => stack[idx],
    entries: () => stack.slice(),
    back() {
      if (idx === 0) return false;
      idx -= 1;
      apply(stack[idx]);
      (listeners.popstate || []).slice().forEach((fn) => fn({ type: 'popstate' }));
      return true;
    },
  };
}

const tick = () => new Promise((r) => { setTimeout(r, 1); });

async function boot({ search = '', payload = PAYLOAD, ok = true, history = true } = {}) {
  const defaultResult = campaignFor(DEFAULTS);
  const doc = plannerDocument(defaultResult);
  const win = makeWindow(PLANNER_PATH + search);
  if (!history) delete win.history;
  const blobs = [];
  const revoked = [];

  const sandbox = {
    document: doc,
    window: win,
    URLSearchParams,
    setTimeout,
    console,
    Blob: function Blob(parts, opts) { this.parts = parts; this.type = (opts || {}).type; },
    URL: {
      createObjectURL(b) { blobs.push(b); return `blob:planner-${blobs.length}`; },
      revokeObjectURL(u) { revoked.push(u); },
    },
    fetch: () => Promise.resolve({ ok, json: () => Promise.resolve(payload) }),
  };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(ENGINE_SRC, sandbox);
  vm.runInContext(CLIENT_SRC, sandbox);
  await tick();
  await tick();

  const control = (key) => doc.querySelectorAll('[data-dp-filter]')
    .find((s) => s.getAttribute('data-dp-filter') === key);
  return {
    doc,
    win,
    blobs,
    revoked,
    control,
    values: () => {
      const out = {};
      for (const key of E.PLANNER_PARAMS) out[key] = control(key).value;
      return out;
    },
    rendered: () => doc.querySelectorAll('[data-dp-group]').map((g) => ({
      key: g.getAttribute('data-dp-group'),
      items: g.querySelectorAll('li').map((li) => li.querySelector('strong').textContent),
    })),
    button: () => doc.querySelector('[data-dp-download]'),
    set: async (key, value) => {
      const sel = control(key);
      sel.value = value;
      sel.dispatch('change');
      await tick();
    },
  };
}

const expected = (state) => campaignFor(state).groups
  .map((g) => ({ key: g.key, items: g.items.map((r) => r.op.name) }));

// ── 4. THE CLIENT, EXECUTED ─────────────────────────────────────────────────

test('the client boots a bare URL into the campaign the page was rendered with', async () => {
  const h = await boot();
  assert.deepStrictEqual(h.values(), {
    business: DEFAULTS.business, objective: DEFAULTS.objective, market: DEFAULTS.market,
    budget: DEFAULTS.budget, size: String(DEFAULTS.size), evidence: DEFAULTS.evidence,
  });
  assert.deepStrictEqual(h.rendered(), expected(DEFAULTS));
  assert.strictEqual(h.win.url(), PLANNER_PATH, 'a bare planner URL grew a query string on boot');
});

test('a hostile URL renders the default campaign, does not throw, and is scrubbed', async () => {
  for (const qs of HOSTILE) {
    const h = await boot({ search: `?${qs}` });
    assert.deepStrictEqual(h.rendered(), expected(DEFAULTS),
      `"?${qs}" did not render the default campaign`);
    assert.deepStrictEqual(h.values(), {
      business: DEFAULTS.business, objective: DEFAULTS.objective, market: DEFAULTS.market,
      budget: DEFAULTS.budget, size: String(DEFAULTS.size), evidence: DEFAULTS.evidence,
    }, `"?${qs}" left a control describing something else`);
    assert.strictEqual(h.win.url(), PLANNER_PATH,
      `"?${qs}" was left in the address bar instead of being replaced`);
  }
});

test('a shared URL boots the client straight into that campaign', async () => {
  for (const s of STATES) {
    const h = await boot({ search: E.serializeState(s, KNOWN) });
    assert.deepStrictEqual(h.rendered(), expected(s),
      `${E.serializeState(s, KNOWN)} did not render its own campaign`);
    for (const key of E.PLANNER_PARAMS) {
      assert.strictEqual(h.control(key).value, String(s[key]),
        `the ${key} control does not show what the URL asked for`);
    }
  }
});

test('a control change pushes a shareable URL for exactly what is on screen', async () => {
  const h = await boot();
  await h.set('market', 'germany');
  const after = { ...DEFAULTS, market: 'germany' };
  assert.strictEqual(h.win.url(), PLANNER_PATH + E.serializeState(after, KNOWN));
  assert.deepStrictEqual(h.rendered(), expected(after));
  await h.set('evidence', 'all');
  const both = { ...after, evidence: 'all' };
  assert.strictEqual(h.win.url(), PLANNER_PATH + E.serializeState(both, KNOWN));
  assert.deepStrictEqual(h.rendered(), expected(both));
  assert.strictEqual(h.win.entries().length, 3, 'two control changes did not make two history entries');
});

test('popstate restores the controls and the rendered campaign together', async () => {
  const h = await boot();
  await h.set('market', 'united-kingdom');
  await h.set('size', '10');
  const uk10 = { ...DEFAULTS, market: 'united-kingdom', size: 10 };
  assert.deepStrictEqual(h.rendered(), expected(uk10));

  h.win.back();
  await tick();
  const uk25 = { ...DEFAULTS, market: 'united-kingdom' };
  assert.strictEqual(h.control('size').value, '25', 'back left the size control where it was');
  assert.strictEqual(h.control('market').value, 'united-kingdom');
  assert.deepStrictEqual(h.rendered(), expected(uk25),
    'back restored the controls but left the previous campaign on screen');

  h.win.back();
  await tick();
  assert.strictEqual(h.control('market').value, DEFAULTS.market);
  assert.deepStrictEqual(h.rendered(), expected(DEFAULTS));
  // And back does not push: the history it navigated is still there to go
  // forward into.
  assert.strictEqual(h.win.entries().length, 3);
});

test('the client stands down on a failed payload and touches neither controls nor URL', async () => {
  const h = await boot({ search: E.serializeState(STATES[2], KNOWN), ok: false });
  // The server's campaign is still on screen, the controls still describe it,
  // and the URL was not rewritten to claim a state nothing rendered.
  assert.deepStrictEqual(h.rendered().map((g) => g.key), campaignFor(DEFAULTS).groups.map((g) => g.key));
  assert.strictEqual(h.control('market').value, DEFAULTS.market);
  assert.strictEqual(h.win.url(), PLANNER_PATH + E.serializeState(STATES[2], KNOWN));
});

test('a browser without history still gets a planner that recomputes', async () => {
  // URL state is an enhancement of an enhancement. Losing the ability to SHARE
  // a campaign is a smaller loss than losing the ability to build one, so the
  // client must not stand down over a missing history API.
  const h = await boot({ history: false });
  assert.deepStrictEqual(h.rendered(), expected(DEFAULTS), 'the client stood down without history');
  await h.set('market', 'germany');
  assert.deepStrictEqual(h.rendered(), expected({ ...DEFAULTS, market: 'germany' }),
    'a control change did nothing once history was unavailable');
  assert.strictEqual(h.button().hidden, false, 'the export went with the URL state');
});

// ── 5. THE CAMPAIGN EXPORT ──────────────────────────────────────────────────

function parseCsv(text) {
  assert.strictEqual(text.charCodeAt(0), 0xFEFF, 'the export lost its BOM');
  const body = text.slice(1);
  const rows = [];
  let row = []; let cur = ''; let quoted = false; let i = 0;
  while (i < body.length) {
    const c = body[i];
    if (quoted) {
      if (c === '"') {
        if (body[i + 1] === '"') { cur += '"'; i += 2; continue; }
        quoted = false; i += 1; continue;
      }
      cur += c; i += 1; continue;
    }
    if (c === '"') { quoted = true; i += 1; continue; }
    if (c === ',') { row.push(cur); cur = ''; i += 1; continue; }
    if (c === '\r' && body[i + 1] === '\n') {
      row.push(cur); rows.push(row); row = []; cur = ''; i += 2; continue;
    }
    assert.notStrictEqual(c, '\n', 'a bare LF outside quotes: the export is not RFC 4180');
    cur += c; i += 1;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

const EXPORT_STATES = [
  DEFAULTS,
  { ...DEFAULTS, market: 'germany' },
  { ...DEFAULTS, business: 'b2b-saas', objective: 'seo-citations', market: '*', budget: 'any', size: 100, evidence: 'all' },
  { ...DEFAULTS, business: 'ecommerce', objective: 'marketplace-exposure', market: 'india', size: 50, evidence: 'research' },
  { ...DEFAULTS, business: 'ai-startup', objective: 'pr-coverage', budget: 'paid-allowed', size: 10, evidence: 'high' },
];

test('the campaign export is the campaign: same identities, same order, nothing else', () => {
  for (const s of EXPORT_STATES) {
    const result = campaignFor(s);
    const rows = parseCsv(E.campaignCsv(result));
    assert.deepStrictEqual(rows[0], E.CAMPAIGN_CSV_COLUMNS, 'the header is not the declared columns');
    const body = rows.slice(1);
    const label = `${s.business}/${s.objective}/${s.market}/${s.budget}/${s.size}/${s.evidence}`;

    // Identity by name, and names are proven unique within the campaign first,
    // so the exported name list determines the exported platformId list.
    const byName = new Map();
    for (const r of result.picked) {
      assert.ok(!byName.has(r.op.name), `${label}: two picked opportunities share the name ${r.op.name}`);
      byName.set(r.op.name, r.op.platformId);
    }
    const orderExpected = E.campaignRows(result);
    assert.strictEqual(body.length, orderExpected.length, `${label}: the export has a different number of rows`);
    assert.strictEqual(body.length, result.picked.length,
      `${label}: the export is not the picked set (${body.length} rows for ${result.picked.length} picks)`);

    assert.deepStrictEqual(body.map((r) => r[1]), orderExpected.map((x) => x.r.op.name),
      `${label}: the export is not in the order the page rendered`);
    assert.deepStrictEqual(body.map((r) => r[0]), orderExpected.map((x) => x.group),
      `${label}: a row is filed under a different group from the one it was rendered in`);
    assert.deepStrictEqual(new Set(body.map((r) => byName.get(r[1]))),
      new Set(result.picked.map((r) => r.op.platformId)),
      `${label}: the exported identity set is not the picked identity set`);
    // The market and the cost the row claims are the record's own.
    for (let i = 0; i < body.length; i += 1) {
      assert.strictEqual(body[i][3], orderExpected[i].r.op.country);
      assert.strictEqual(body[i][4], orderExpected[i].r.op.cost);
    }
  }
});

test('the campaign export changes when the market changes', () => {
  const rowsFor = (market, size = DEFAULTS.size) => parseCsv(
    E.campaignCsv(campaignFor({ ...DEFAULTS, market, size }))).slice(1);
  const names = (rows) => rows.map((r) => r[1]);
  const us = rowsFor('united-states');
  const uk = rowsFor('united-kingdom');
  const de = rowsFor('germany');
  assert.notDeepStrictEqual(names(uk), names(us), 'the export ignores the market control');
  assert.notDeepStrictEqual(names(de), names(us), 'the export ignores the market control');
  assert.notDeepStrictEqual(names(de), names(uk), 'two different markets export the same campaign');

  // Only 126 of the 2,234 opportunities are READY, so at 25 a market often
  // reorders the same shortlist rather than replacing it. At 10 the shortlist
  // is short enough that the SET moves too, which is the stronger claim and
  // the one worth making.
  assert.notDeepStrictEqual(new Set(names(rowsFor('germany', 10))),
    new Set(names(rowsFor('united-states', 10))),
    'a market change cannot even change which ten platforms are exported');

  // And the group column is the market's own: "Local discovery" means
  // published in the selected market, in the file as well as on the page.
  for (const [market, rows] of [['united-kingdom', uk], ['germany', de]]) {
    const local = rows.filter((r) => r[0] === 'local');
    for (const r of local) {
      assert.strictEqual(r[3], market,
        `a ${r[3]} platform is filed under local discovery for ${market}`);
    }
  }
});

test('an empty campaign exports a header and no rows, never the full queue', () => {
  // A software business asked for marketplace exposure: the marketplace
  // vocabulary genuinely carries nothing for it, and saying so is the answer.
  const empty = campaignFor({ ...DEFAULTS, business: 'telecom-voip-ucaas',
    objective: 'marketplace-exposure', market: '*', budget: 'any', evidence: 'high' });
  assert.strictEqual(empty.picked.length, 0, 'the chosen state is no longer an empty campaign');
  const csv = E.campaignCsv(empty);
  const rows = parseCsv(csv);
  assert.strictEqual(rows.length, 1, 'an empty campaign exported rows');
  assert.deepStrictEqual(rows[0], E.CAMPAIGN_CSV_COLUMNS);
  const queue = read('research/distribution-planner/execution-opportunities.csv');
  assert.ok(csv.length < 400 && csv.length * 100 < queue.length,
    'an empty campaign exported something the size of the full queue');
});

test('the export is RFC 4180 and safe to open in a spreadsheet', () => {
  assert.strictEqual(E.csvField('=1+1'), "'=1+1");
  assert.strictEqual(E.csvField('@Reply'), "'@Reply");
  assert.strictEqual(E.csvField('+1 area'), "'+1 area");
  assert.strictEqual(E.csvField('-lot 3'), "'-lot 3");
  assert.strictEqual(E.csvField('a,b'), '"a,b"');
  assert.strictEqual(E.csvField('say "hi"'), '"say ""hi"""');
  assert.strictEqual(E.csvField('=a,b'), '"\'=a,b"');
  assert.strictEqual(E.csvField(null), '');
  assert.strictEqual(E.csvField(undefined), '');
  assert.strictEqual(E.csvField(['a', 'b']), 'a; b');
  assert.strictEqual(E.csvField('line\r\nbreak'), '"line\r\nbreak"');
  // And the generator uses this one rather than a second, unhardened copy.
  const gen = read('scripts/build-distribution-planner.cjs');
  assert.match(gen, /const csvField = E\.csvField;/,
    'the generator declares its own CSV escape again');
  const queue = read('research/distribution-planner/execution-opportunities.csv');
  for (const line of queue.slice(1).split('\r\n')) {
    assert.ok(!/^[=+@\t]/.test(line), `the full queue export starts a row with a formula: ${line.slice(0, 40)}`);
  }
});

test('the export filename is deterministic and made only of canonical values', () => {
  const seen = new Set();
  for (const s of STATES) {
    const name = E.campaignFilename(s, KNOWN);
    assert.strictEqual(name, E.campaignFilename(s, KNOWN), 'the filename is not stable');
    assert.match(name, /^campaign-[a-z0-9-]+\.csv$/, `${name} is not a safe file name`);
    assert.ok(!seen.has(name), `${name} is produced by two different states`);
    seen.add(name);
  }
  assert.match(E.campaignFilename({ ...DEFAULTS, market: '*' }, KNOWN), /-any-market-/);
  // A hostile state cannot reach the file system through the name.
  assert.strictEqual(E.campaignFilename({ business: '../../etc/passwd' }, KNOWN),
    E.campaignFilename(DEFAULTS, KNOWN));
});

test('the button downloads the campaign on screen, under the name the state implies', async () => {
  const h = await boot();
  const btn = h.button();
  assert.strictEqual(btn.hidden, false, 'the download button was never adopted by the client');
  const rows = E.campaignRows(campaignFor(DEFAULTS)).length;
  assert.ok(btn.textContent.endsWith(`(${rows})`),
    `the button says "${btn.textContent}" for a ${rows}-row campaign`);

  await h.set('market', 'germany');
  const de = { ...DEFAULTS, market: 'germany' };
  assert.ok(h.button().textContent.endsWith(`(${E.campaignRows(campaignFor(de)).length})`));

  btn.dispatch('click');
  assert.strictEqual(h.blobs.length, 1, 'the button did not produce a file');
  const written = h.blobs[0].parts.join('');
  assert.strictEqual(written, E.campaignCsv(campaignFor(de)),
    'the button exported a campaign other than the one on screen');
  assert.strictEqual(h.doc.clicks.length, 1);
  assert.strictEqual(h.doc.clicks[0].download, E.campaignFilename(de, KNOWN));
  // The anchor is furniture for one event and does not stay in the campaign.
  // The campaign's own "open" links are anchors too, so this asks for the
  // downloading one specifically.
  assert.strictEqual(h.doc.querySelectorAll('a').filter((a) => a.download).length, 0,
    'the download anchor was left in the page');
  await tick();
  assert.deepStrictEqual(h.revoked, ['blob:planner-1'], 'the object URL was never revoked');
  // Not the full queue, under any circumstances.
  assert.ok(!written.includes('source_collection_url'), 'the button exported the full-queue columns');
});

test('the button is client-only: the page ships it hidden and empty of a route', () => {
  assert.match(PAGE, /<button class="bd-button" type="button" data-dp-download hidden>/,
    'the download button is not shipped hidden, so a no-JS reader sees a dead control');
  const at = PAGE.indexOf('id="campaign"');
  const section = PAGE.slice(at, PAGE.indexOf('<section id="research"', at));
  assert.ok(section.includes('data-dp-download'), 'the button is not in the campaign section');
  assert.ok(section.indexOf('data-dp-download') < section.indexOf('data-dp-group'),
    'the button is rendered after the groups, so a recompute would move it');
  // Section 2 still links the static full-queue export, which is what a no-JS
  // reader gets and what the button must never be confused with.
  assert.ok(PAGE.includes('execution-opportunities.csv'), 'the full queue export was dropped');
  assert.ok(fs.existsSync(path.join(ROOT, 'research/distribution-planner/execution-opportunities.csv')));
});

// ── 6. ONE DEFAULT, FOUR LOCALES, NO QUERY IN THE SITEMAP ───────────────────

test('the generator, the controls and a bare URL agree on one default state', () => {
  // Identity against the SERVER copy, which is the module the generator loads.
  // js/dp-engine.js is the same bytes but a separate module instance by
  // construction, so === across that gap would be meaningless.
  const SERVER = require(path.join(ROOT, 'scripts/lib/dp-engine.cjs'));
  assert.strictEqual(BUILD.DEFAULT_QUERY, SERVER.PLANNER_DEFAULTS,
    'the generator holds its own copy of the default query');
  assert.deepStrictEqual(BUILD.DEFAULT_QUERY, E.PLANNER_DEFAULTS,
    'the shipped engine and the generator disagree about the default state');
  assert.strictEqual(BUILD.CAMPAIGN_SIZE, E.PLANNER_DEFAULTS.size);
  for (const key of E.PLANNER_PARAMS) {
    const selected = CONTROLS[key].find((o) => o.selected);
    assert.strictEqual(selected.value, String(DEFAULTS[key]),
      `the ${key} control does not default to the state the page was rendered in`);
  }
  assert.deepStrictEqual(E.parseState(new URLSearchParams(''), KNOWN), E.normalizeState(DEFAULTS, KNOWN));
  // The size control offers exactly the sizes the URL will accept.
  assert.deepStrictEqual(CONTROLS.size.map((o) => o.value), E.PLANNER_SIZES.map(String));
});

test('the URL parameters are canonical values, identical in every locale', () => {
  const I18N = require(path.join(ROOT, 'scripts/lib/i18n.cjs'));
  const en = controlsFrom(PAGE);
  for (const code of I18N.LOCALE_CODES) {
    const html = read(I18N.localizedFile(code, '/research/distribution-planner/'));
    const there = controlsFrom(html);
    for (const key of E.PLANNER_PARAMS) {
      assert.deepStrictEqual(there[key].map((o) => o.value), en[key].map((o) => o.value),
        `@${code}: the ${key} control offers different VALUES, so a shared URL would not resolve`);
      assert.deepStrictEqual(there[key].map((o) => o.selected), en[key].map((o) => o.selected),
        `@${code}: the ${key} control defaults elsewhere`);
    }
    // Labels are translated, values are not — that is the whole point.
    if (code !== 'en') {
      assert.notDeepStrictEqual(there.market.map((o) => o.label), en.market.map((o) => o.label),
        `@${code}: the market labels were never translated`);
    }
  }
});

test('no planner query URL enters the sitemap and the canonical stays clean', () => {
  const sitemap = read('sitemap.xml');
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  for (const l of locs) {
    assert.ok(!l.includes('?'), `a query URL entered the sitemap: ${l}`);
  }
  const planner = locs.filter((l) => l.includes('distribution-planner'));
  assert.ok(planner.length >= 4, `only ${planner.length} planner pages in the sitemap`);
  for (const l of planner) assert.match(l, /distribution-planner\/$/);

  const I18N = require(path.join(ROOT, 'scripts/lib/i18n.cjs'));
  for (const code of I18N.LOCALE_CODES) {
    const html = read(I18N.localizedFile(code, '/research/distribution-planner/'));
    const canonical = /rel="canonical" href="([^"]+)"/.exec(html)[1];
    assert.ok(!canonical.includes('?'), `@${code}: the canonical carries a query: ${canonical}`);
  }
  // And the default state is the reason it can stay clean.
  assert.strictEqual(E.serializeState(DEFAULTS, KNOWN), '');
});

test('the client owns history and the engine owns the vocabulary', () => {
  const code = CLIENT_SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  for (const [what, pattern] of [
    ['pushState', /history\.pushState\(/],
    ['replaceState', /history\.replaceState\(/],
    ['a popstate listener', /addEventListener\('popstate'/],
    ['the shared parser', /E\.parseState\(/],
    ['the shared serializer', /E\.serializeState\(/],
    ['the shared export', /E\.campaignCsv\(/],
  ]) {
    assert.match(code, pattern, `the client does not use ${what}`);
  }
  // No second vocabulary, and no value invented in the browser.
  for (const [what, pattern] of [
    ['its own default state', /local-business|local-discovery|free-freemium/],
    ['its own market list', /united-states|united-kingdom/],
    ['its own size list', /\b10\s*,\s*25\s*,\s*50\b/],
    ['its own parameter list', /'business'\s*,\s*'objective'/],
    ['markup written from data', /innerHTML|outerHTML|insertAdjacentHTML|document\.write/],
  ]) {
    assert.ok(!pattern.test(code), `the client contains ${what}`);
  }
});
