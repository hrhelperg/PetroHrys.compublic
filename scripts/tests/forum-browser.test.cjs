'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { harness, chromePath } = require('./helpers/cdp.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const skip = chromePath() ? false : 'no Chrome, Chromium or Edge on this machine';
let H;

before(async () => {
  if (chromePath()) H = await harness(ROOT, { preload: [
    '/research/forums/', '/de/research/forums/', '/es/research/forums/', '/fr/research/forums/',
    '/js/', '/css/',
  ] });
});
after(async () => { if (H) await H.close(); });

async function open(search = '', prefix = '') {
  await H.page.goto(`${H.origin}${prefix}/research/forums/${search}`);
  await new Promise((resolve) => { setTimeout(resolve, 120); });
  return H.page.eval(() => ({
    total: document.querySelectorAll('tr.bd-row').length,
    visible: [...document.querySelectorAll('tr.bd-row')].filter((r) => !r.hidden).map((r) => ({
      name: r.getAttribute('data-bd-name'), dr: r.getAttribute('data-bd-dr'),
      topic: r.getAttribute('data-bd-facet-topic'), country: r.getAttribute('data-bd-facet-country'),
      language: r.getAttribute('data-bd-facet-language'), type: r.getAttribute('data-bd-facet-type'),
      status: r.getAttribute('data-bd-facet-status'), haystack: r.getAttribute('data-bd-haystack'),
    })),
    search: location.search,
  }));
}

function qs(state) {
  const p = new URLSearchParams();
  if (state.q) p.set('q', state.q);
  for (const [k, v] of Object.entries(state.facets || {})) if (v) p.set(k, v);
  if (state.minDr) p.set('min-dr', state.minDr);
  if (state.sort) p.set('sort', state.sort);
  return `?${p}`;
}

test('Forums landing boots with a non-vacuous canonical cohort', { skip }, async () => {
  const r = await open();
  assert.ok(r.total >= 1500, `only ${r.total} Forum rows rendered`);
  assert.equal(r.visible.length, r.total);
  assert.deepEqual(H.page.errors, []);
});

test('search uses the direct row haystack', { skip }, async () => {
  const all = await open();
  const term = all.visible.find((r) => r.name.length >= 7).name.slice(0, 7).toLowerCase();
  const r = await open(qs({ q: term }));
  assert.ok(r.visible.length > 0);
  assert.ok(r.visible.every((x) => x.haystack.toLowerCase().includes(term)));
});

test('single Topic, Country, Language and Status filters each return real cohorts', { skip }, async () => {
  await open();
  const choices = await H.page.eval(() => Object.fromEntries(['topic', 'country', 'language', 'status'].map((name) => {
    const s = document.querySelector(`[data-bd-facet="${name}"]`);
    return [name, [...s.options].map((o) => o.value).find(Boolean)];
  })));
  for (const [facet, value] of Object.entries(choices)) {
    assert.ok(value, `${facet} has no non-empty option`);
    // eslint-disable-next-line no-await-in-loop
    const r = await open(qs({ facets: { [facet]: value } }));
    assert.ok(r.visible.length > 0, `${facet}=${value} is vacuous`);
    assert.ok(r.visible.every((x) => (` ${x[facet]} `).includes(` ${value} `)), `${facet} leaked stale rows`);
  }
});

for (const floor of ['50', '70']) {
  test(`DR >= ${floor} is numeric and excludes unmeasured rows`, { skip }, async () => {
    const r = await open(qs({ minDr: floor }));
    assert.ok(r.visible.length > 0, `DR ${floor}+ has no measured cohort`);
    assert.ok(r.visible.every((x) => x.dr !== '' && Number(x.dr) >= Number(floor)));
  });
}

test('Topic + Country is a non-empty AND intersection', { skip }, async () => {
  const all = await open();
  const seed = all.visible.find((r) => r.country && r.topic);
  assert.ok(seed, 'no known-country Forum exists to exercise the combination');
  const topic = seed.topic.split(' ')[0];
  const r = await open(qs({ facets: { topic, country: seed.country } }));
  assert.ok(r.visible.length > 0);
  assert.ok(r.visible.every((x) => x.country === seed.country
    && ` ${x.topic} `.includes(` ${topic} `)));
});

test('Topic + Language + DR and a five-way combination preserve every dimension', { skip }, async () => {
  const all = await open(qs({ minDr: '50' }));
  const seed = all.visible.find((r) => r.country && r.topic && r.language && r.type && r.status === 'ACTIVE');
  assert.ok(seed, 'no ACTIVE, known-country DR 50+ seed exists');
  const topic = seed.topic.split(' ')[0];
  const language = seed.language.split(' ')[0];
  const three = await open(qs({ facets: { topic, language }, minDr: '50' }));
  assert.ok(three.visible.length > 0);
  assert.ok(three.visible.every((x) => (` ${x.topic} `).includes(` ${topic} `)
    && (` ${x.language} `).includes(` ${language} `) && Number(x.dr) >= 50));
  const five = await open(qs({ facets: { topic, country: seed.country, language,
    type: seed.type, status: seed.status }, minDr: '50' }));
  assert.ok(five.visible.length > 0);
  assert.ok(five.visible.every((x) => (` ${x.topic} `).includes(` ${topic} `)
    && x.country === seed.country && (` ${x.language} `).includes(` ${language} `)
    && x.type === seed.type && x.status === seed.status && Number(x.dr) >= 50));
});

test('DR descending and ascending keep missing values last', { skip }, async () => {
  const desc = await open(qs({ sort: 'domain-rating' }));
  const asc = await open(qs({ sort: 'domain-rating-asc' }));
  const values = (rows) => rows.filter((x) => x.dr !== '').map((x) => Number(x.dr));
  assert.deepEqual(values(desc.visible), values(desc.visible).slice().sort((a, b) => b - a));
  assert.deepEqual(values(asc.visible), values(asc.visible).slice().sort((a, b) => a - b));
  const firstMissingDesc = desc.visible.findIndex((x) => x.dr === '');
  const firstMissingAsc = asc.visible.findIndex((x) => x.dr === '');
  if (firstMissingDesc >= 0) assert.ok(desc.visible.slice(firstMissingDesc).every((x) => x.dr === ''));
  if (firstMissingAsc >= 0) assert.ok(asc.visible.slice(firstMissingAsc).every((x) => x.dr === ''));
});

test('reload, Back and Forward restore the complete Forum state', { skip }, async () => {
  await open(qs({ facets: { status: 'ACTIVE' }, minDr: '50', sort: 'domain-rating' }));
  const before = await H.page.eval(() => [...document.querySelectorAll('tr.bd-row')].filter((r) => !r.hidden)
    .map((r) => r.getAttribute('data-bd-name')));
  await H.page.send('Page.reload', {});
  await new Promise((resolve) => { setTimeout(resolve, 500); });
  const reloaded = await H.page.eval(() => [...document.querySelectorAll('tr.bd-row')].filter((r) => !r.hidden)
    .map((r) => r.getAttribute('data-bd-name')));
  assert.deepEqual(reloaded, before);
  await H.page.eval(() => {
    const s = document.querySelector('[data-bd-min-dr]'); s.value = '70';
    s.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await new Promise((resolve) => { setTimeout(resolve, 250); });
  const high = await H.page.eval(() => [...document.querySelectorAll('tr.bd-row')].filter((r) => !r.hidden).length);
  assert.ok(high < before.length);
  await H.page.eval(() => history.back()); await new Promise((resolve) => { setTimeout(resolve, 300); });
  assert.equal(await H.page.eval(() => document.querySelector('[data-bd-min-dr]').value), '50');
  await H.page.eval(() => history.forward()); await new Promise((resolve) => { setTimeout(resolve, 300); });
  assert.equal(await H.page.eval(() => document.querySelector('[data-bd-min-dr]').value), '70');
});

test('reset clears state and restores the full corpus', { skip }, async () => {
  const filtered = await open(qs({ facets: { status: 'ACTIVE' }, minDr: '70', sort: 'domain-rating' }));
  assert.ok(filtered.visible.length < filtered.total);
  const reset = await H.page.eval(() => {
    document.querySelector('[data-bd-clear]').click();
    return { search: location.search, shown: [...document.querySelectorAll('tr.bd-row')].filter((r) => !r.hidden).length,
      total: document.querySelectorAll('tr.bd-row').length };
  });
  assert.equal(reset.search, '');
  assert.equal(reset.shown, reset.total);
});

test('filtered CSV contains exactly the visible rows in visible order', { skip }, async () => {
  const state = await open(qs({ facets: { status: 'ACTIVE' }, minDr: '70', sort: 'domain-rating' }));
  assert.ok(state.visible.length > 0);
  const csv = await H.page.eval(() => {
    const NativeBlob = window.Blob;
    window.__csv = '';
    window.Blob = function (parts, options) { window.__csv = parts.join(''); return new NativeBlob(parts, options); };
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {};
    URL.createObjectURL = () => 'blob:captured';
    document.querySelector('[data-bd-export]').click();
    HTMLAnchorElement.prototype.click = click;
    return window.__csv;
  });
  const lines = csv.replace(/^\uFEFF/, '').trim().split('\r\n');
  assert.equal(lines.length - 1, state.visible.length);
  assert.equal(lines[0], 'forum,url,country,language,primary_topic,topics,forum_type,status,domain_rating,domain_rating_provider,last_verified_at');
  assert.deepEqual(lines.slice(1).map((line) => line.match(/^(?:"((?:[^"]|"")*)"|([^,]*))/)[1]
    || line.match(/^(?:"((?:[^"]|"")*)"|([^,]*))/)[2]), state.visible.map((r) => r.name));
});

test('EN, DE, ES and FR render one shared corpus with localized UI', { skip }, async () => {
  const snapshots = [];
  for (const prefix of ['', '/de', '/es', '/fr']) {
    // eslint-disable-next-line no-await-in-loop
    const r = await open('', prefix);
    // eslint-disable-next-line no-await-in-loop
    const labels = await H.page.eval(() => ({ lang: document.documentElement.lang,
      h1: document.querySelector('h1').textContent, topic: document.querySelector('label[for="forums-facet-topic"]').textContent }));
    snapshots.push({ prefix, total: r.total, labels });
  }
  assert.ok(snapshots.every((x) => x.total === snapshots[0].total));
  assert.deepEqual(snapshots.map((x) => x.labels.lang), ['en', 'de', 'es', 'fr']);
  assert.equal(new Set(snapshots.map((x) => x.labels.h1)).size, 4);
  assert.equal(new Set(snapshots.map((x) => x.labels.topic)).size, 4);
});

test('Forum controls remain labelled and contained at phone width', { skip }, async () => {
  await H.page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await open();
  const result = await H.page.eval(() => {
    const controls = [...document.querySelectorAll('[data-bd-search], [data-bd-facet], [data-bd-min-dr], [data-bd-sort]')];
    return { controls: controls.length, labelled: controls.filter((x) => x.id && document.querySelector(`label[for="${x.id}"]`)).length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  assert.ok(result.controls >= 8);
  assert.equal(result.labelled, result.controls);
  assert.ok(result.overflow < 40, `page overflows by ${result.overflow}px`);
  await H.page.send('Emulation.clearDeviceMetricsOverride', {});
});
