'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const workflow = fs.readFileSync(
  path.join(ROOT, '.github', 'workflows', 'tender-opportunity-refresh.yml'),
  'utf8',
);

test('both tender refresh test gates use a shell-expanded test glob', () => {
  const command = 'run: node --test scripts/tests/*.test.cjs';
  assert.strictEqual(workflow.split(command).length - 1, 2,
    'baseline and validation gates must both run the complete test suite');
  assert.ok(!workflow.includes('node --test "scripts/tests/*.test.cjs"'),
    'a quoted glob reaches Node literally and makes the workflow fail before refresh');
});

test('workflow actions do not target the deprecated Node 20 action runtime', () => {
  assert.ok(workflow.includes('uses: actions/checkout@v7'));
  assert.ok(workflow.includes('uses: actions/setup-node@v7'));
  assert.ok(!/uses: actions\/(?:checkout|setup-node)@v4/.test(workflow));
});
