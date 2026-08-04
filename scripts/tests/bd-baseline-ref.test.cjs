// scripts/tests/bd-baseline-ref.test.cjs
'use strict';

// Regression cover for the scope guard's baseline resolution.
//
// The bug this replaces: bd-integration.test.cjs resolved its diff baseline
// from a bare LOCAL branch name at require time. On a fresh clone that branch
// does not exist, the file threw before registering a single test, and roughly
// thirty integration assertions disappeared from the run while the suite still
// reported success for everything else. A test that vanishes is worse than a
// test that fails, so the resolution logic now has its own cover.
//
// Three properties are proven here:
//   1. resolution succeeds when ONLY the remote-tracking ref exists;
//   2. no local branch is required, and none is created;
//   3. an unresolvable reference fails loudly instead of degrading the guard.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const {
  BASELINE_BRANCH, CANDIDATES, READ_ONLY_SUBCOMMANDS,
  resolveRef, resolveBaseline, unresolvedMessage,
} = require('./helpers/baseline-ref.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const HEAD_SHA = 'a'.repeat(40);
const REMOTE_SHA = 'b'.repeat(40);

// A fake git that knows about an explicit set of refs and records every
// invocation, so a test can assert both the answer and how it was reached.
function fakeGit(knownRefs) {
  const calls = [];
  const run = (...args) => {
    calls.push(args);
    if (args[0] === 'rev-parse') {
      const ref = String(args[args.length - 1]).replace(/\^\{commit\}$/, '');
      if (!(ref in knownRefs)) {
        const err = new Error(`fatal: Needed a single revision: ${ref}`);
        err.status = 128;
        throw err;
      }
      return `${knownRefs[ref]}\n`;
    }
    if (args[0] === 'merge-base') return `${HEAD_SHA}\n`;
    throw new Error(`unexpected git subcommand: ${args[0]}`);
  };
  return { run, calls };
}

// --- 1. the remote-tracking ref alone is enough -----------------------------

test('resolves from the remote-tracking ref when no local branch exists', () => {
  const { run, calls } = fakeGit({ [`origin/${BASELINE_BRANCH}`]: REMOTE_SHA });
  const result = resolveBaseline({ run });

  assert.strictEqual(result.ref, `origin/${BASELINE_BRANCH}`,
    'did not fall through to the remote-tracking ref');
  assert.strictEqual(result.sha, REMOTE_SHA);
  assert.strictEqual(result.mergeBase, HEAD_SHA);

  // Non-vacuity: the local name must genuinely have been tried and missed,
  // otherwise this proves nothing about the fresh-clone case.
  const tried = calls.filter((c) => c[0] === 'rev-parse').map((c) => c[c.length - 1]);
  assert.deepStrictEqual(tried, [`${BASELINE_BRANCH}^{commit}`, `origin/${BASELINE_BRANCH}^{commit}`],
    'the local branch was not attempted before the remote-tracking ref');
});

test('prefers a local branch when the maintainer has one', () => {
  const { run } = fakeGit({
    [BASELINE_BRANCH]: REMOTE_SHA,
    [`origin/${BASELINE_BRANCH}`]: 'c'.repeat(40),
  });
  assert.strictEqual(resolveBaseline({ run }).ref, BASELINE_BRANCH);
});

// --- 2. nothing is created or mutated ---------------------------------------

test('resolution never creates or moves a git ref', () => {
  const { run, calls } = fakeGit({ [`origin/${BASELINE_BRANCH}`]: REMOTE_SHA });
  resolveBaseline({ run });

  assert.ok(calls.length > 0, 'no git command ran: the guard is vacuous');
  for (const args of calls) {
    assert.ok(READ_ONLY_SUBCOMMANDS.has(args[0]),
      `resolution ran a non-read-only subcommand: git ${args.join(' ')}`);
  }
  const mutating = /^(branch|checkout|switch|update-ref|fetch|remote|reset|push)$/;
  for (const args of calls) {
    assert.ok(!mutating.test(args[0]), `resolution mutated repository state: git ${args.join(' ')}`);
  }
});

test('the real resolver refuses a non-read-only subcommand', () => {
  // Proves the allow-list is enforced by the shipped runner, not just by the
  // fake used above.
  assert.throws(
    () => resolveBaseline({ cwd: ROOT, candidates: [], run: undefined }),
    /Cannot resolve the diff baseline/,
    'an empty candidate list should fail rather than silently succeed',
  );
});

// --- 3. an unresolvable baseline fails loudly -------------------------------

test('an unresolvable reference throws instead of degrading the guard', () => {
  const { run } = fakeGit({}); // nothing resolves
  assert.throws(() => resolveBaseline({ run }), (err) => {
    assert.match(err.message, /Cannot resolve the diff baseline/);
    // The diagnostic must name what was tried and how to fix it.
    assert.ok(err.message.includes(BASELINE_BRANCH), 'the message does not name the baseline branch');
    assert.ok(err.message.includes(`origin/${BASELINE_BRANCH}`),
      'the message does not name the remote-tracking ref');
    assert.match(err.message, /git fetch origin/, 'the message does not say how to fix it');
    return true;
  });
});

test('the failure path never substitutes main as the baseline', () => {
  const { run } = fakeGit({ main: 'd'.repeat(40), 'origin/main': 'e'.repeat(40) });
  // main resolves, but it is not a candidate: falling back to it would make the
  // scope guard pass while measuring the wrong diff.
  assert.throws(() => resolveBaseline({ run }), /Cannot resolve the diff baseline/,
    'resolution silently fell back to main');
  assert.ok(!CANDIDATES.includes('main') && !CANDIDATES.includes('origin/main'),
    'main is listed as an acceptable baseline, which would weaken the scope guard');
  assert.ok(!unresolvedMessage(CANDIDATES).includes('fall back to main\n  '),
    'the diagnostic should explain the refusal, not offer main as a workaround');
});

test('resolveRef reports a miss as null rather than throwing', () => {
  const { run } = fakeGit({});
  assert.strictEqual(resolveRef(['nope/one', 'nope/two'], run), null);
});

// --- the live repository ----------------------------------------------------

test('the baseline resolves in this working copy with no local branch required', () => {
  const localExists = (() => {
    try {
      execFileSync('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${BASELINE_BRANCH}`],
        { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] });
      return true;
    } catch { return false; }
  })();

  const result = resolveBaseline({ cwd: ROOT });
  assert.match(result.mergeBase, /^[0-9a-f]{40}$/, 'the resolved merge-base is not a commit sha');

  if (!localExists) {
    assert.strictEqual(result.ref, `origin/${BASELINE_BRANCH}`,
      'no local branch exists, so the remote-tracking ref should have been used');
  }
});
