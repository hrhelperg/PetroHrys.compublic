// scripts/tests/bd-routes.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const r = require('../lib/bd-routes.cjs');

test('every url is site-absolute and rooted at the section', () => {
  for (const url of [
    r.hubPath(),
    r.countryPath('united-states'),
    r.categoryPath('united-states', 'saas'),
    r.directoryPath('united-states', 'example-directory'),
    r.feedPath(),
  ]) {
    assert.ok(url.startsWith('/research/business-directories/'), `not rooted: ${url}`);
  }
});

test('directory urls sit directly under the country, not under the category', () => {
  // The C1 regression: a directory page is two segments above a category page,
  // so a relative href from a category page could never reach it.
  assert.strictEqual(r.directoryPath('united-states', 'example'),
    '/research/business-directories/united-states/example/');
  assert.ok(!r.directoryPath('united-states', 'example').includes('/categories/'));
});

test('category urls carry the categories segment', () => {
  assert.strictEqual(r.categoryPath('germany', 'saas'),
    '/research/business-directories/germany/categories/saas/');
});

test('directoryPathFor derives the country from the record', () => {
  assert.strictEqual(r.directoryPathFor({ country: 'poland', slug: 'abc' }),
    '/research/business-directories/poland/abc/');
});

test('unsafe slugs are refused rather than escaped', () => {
  for (const bad of ['../escape', '/absolute', 'has space', 'Upper', '', null, undefined, 'a--b']) {
    assert.throws(() => r.countryPath(bad), r.RouteError, `accepted country slug ${JSON.stringify(bad)}`);
    assert.throws(() => r.directoryPath('united-states', bad), r.RouteError,
      `accepted directory slug ${JSON.stringify(bad)}`);
  }
});

test('directoryPathFor rejects a non-record', () => {
  assert.throws(() => r.directoryPathFor(null), r.RouteError);
  assert.throws(() => r.directoryPathFor('x'), r.RouteError);
});

test('output paths mirror the urls exactly', () => {
  assert.strictEqual(r.hubOut(), path.join('research', 'business-directories', 'index.html'));
  assert.strictEqual(r.countryOut('united-states'),
    path.join('research', 'business-directories', 'united-states', 'index.html'));
  assert.strictEqual(r.categoryOut('united-states', 'saas'),
    path.join('research', 'business-directories', 'united-states', 'categories', 'saas', 'index.html'));
  assert.strictEqual(r.directoryOut('united-states', 'example'),
    path.join('research', 'business-directories', 'united-states', 'example', 'index.html'));
});

test('every url maps onto its own output path and back', () => {
  const cases = [
    [r.countryPath('france'), r.countryOut('france')],
    [r.categoryPath('france', 'legal'), r.categoryOut('france', 'legal')],
    [r.directoryPath('france', 'some-dir'), r.directoryOut('france', 'some-dir')],
  ];
  for (const [url, out] of cases) {
    const derived = `/${out.split(path.sep).slice(0, -1).join('/')}/`;
    assert.strictEqual(derived, url, `url and output path disagree: ${url} vs ${out}`);
  }
});

test('pagePath leaves page one at the base url', () => {
  const base = r.categoryPath('spain', 'finance');
  assert.strictEqual(r.pagePath(base, 1), base);
  assert.strictEqual(r.pagePath(base, 3), `${base}page/3/`);
  assert.throws(() => r.pagePath(base, 0), r.RouteError);
  assert.throws(() => r.pagePath(base, 1.5), r.RouteError);
});

test('no module builds a directory href outside this one', () => {
  // Guards the P1 rule: components must never construct a path by hand.
  const files = ['bd-components.cjs', 'bd-seo.cjs', 'bd-render.cjs']
    .map((f) => path.join(__dirname, '..', 'lib', f))
    .concat([path.join(__dirname, '..', 'build-business-directories.cjs')]);
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/\$\{[a-zA-Z.]*[Ss]lug\}\//.test(source),
      `${path.basename(file)} interpolates a slug into a path directly`);
    assert.ok(!/business-directories\/\$\{/.test(source),
      `${path.basename(file)} builds a section url by hand`);
  }
});
