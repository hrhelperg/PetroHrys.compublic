// scripts/tests/bd-util.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { escapeHtml, escapeXml, writeIfChanged } = require('../lib/bd-util.cjs');

test('escapeHtml escapes all five HTML-significant characters', () => {
  assert.strictEqual(escapeHtml(`<a href="x">O'Neil & Co</a>`),
    '&lt;a href=&quot;x&quot;&gt;O&#39;Neil &amp; Co&lt;/a&gt;');
});

test('escapeHtml renders null and undefined as empty string', () => {
  assert.strictEqual(escapeHtml(null), '');
  assert.strictEqual(escapeHtml(undefined), '');
});

test('escapeXml uses &apos; rather than a numeric apostrophe entity', () => {
  assert.strictEqual(escapeXml("O'Neil & Co"), 'O&apos;Neil &amp; Co');
});

test('writeIfChanged writes on first call and reports true', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bd-'));
  const file = path.join(dir, 'nested', 'out.txt');
  assert.strictEqual(writeIfChanged(file, 'hello'), true);
  assert.strictEqual(fs.readFileSync(file, 'utf8'), 'hello');
});

test('writeIfChanged is a no-op when contents are identical', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bd-'));
  const file = path.join(dir, 'out.txt');
  writeIfChanged(file, 'hello');
  const before = fs.statSync(file).mtimeMs;
  assert.strictEqual(writeIfChanged(file, 'hello'), false);
  assert.strictEqual(fs.statSync(file).mtimeMs, before);
});
