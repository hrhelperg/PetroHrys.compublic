'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/forums/protected-baseline.json'), 'utf8'));
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex');

test('Forum V1 leaves every protected canonical corpus and algorithm byte-identical', () => {
  const drift = [];
  for (const [file, expected] of Object.entries(baseline.files)) {
    const actual = sha(file);
    if (actual !== expected) drift.push({ file, expected, actual });
  }
  assert.deepEqual(drift, []);
});
