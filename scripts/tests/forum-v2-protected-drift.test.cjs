'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const F = require('../lib/forum-schema.cjs');
const V2 = require('../lib/forum-link-schema.cjs');
const A = require('../apply-forum-link-value.cjs');
const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/forums/protected-v2-baseline.json'), 'utf8'));
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex');

test('Forum V2 leaves every protected non-Forum corpus and algorithm byte-identical', () => {
  const drift = [];
  for (const [file, expected] of Object.entries(baseline.files)) {
    const actual = sha(file);
    if (actual !== expected) drift.push({ file, expected, actual });
  }
  assert.deepEqual(drift, []);
});

test('Forum V2 leaves the complete V1 projection byte-equivalent', () => {
  const rows = F.load(path.join(ROOT, 'data/forums/forums.json'));
  assert.equal(rows.length, baseline.forumCount);
  assert.equal(V2.sha256(JSON.stringify(A.v1Projection(rows))), baseline.forumV1ProjectionSha256);
});
