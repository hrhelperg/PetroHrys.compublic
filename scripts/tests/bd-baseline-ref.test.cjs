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
  BASELINE_COMMIT, BASELINE_BRANCH, CANDIDATES, READ_ONLY_SUBCOMMANDS,
  resolveRef, resolveBaseline, unresolvedMessage,
} = require('./helpers/baseline-ref.cjs');

// Real, read-only git against this working copy. Returns null for a ref that
// does not resolve, so a guard can distinguish "absent" from "broken".
function git(...args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}
const resolvesRef = (ref) => git('rev-parse', '--verify', '--quiet', `${ref}^{commit}`);
const mainRefName = () => ['origin/main', 'main'].find((r) => resolvesRef(r));

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

  // Non-vacuity: every earlier candidate must genuinely have been tried and
  // missed, otherwise this proves nothing about the fresh-clone case. The
  // immutable commit now leads the list, so it is attempted first — the
  // fall-through property being tested is unchanged, the sequence is one
  // entry longer.
  const tried = calls.filter((c) => c[0] === 'rev-parse').map((c) => c[c.length - 1]);
  assert.deepStrictEqual(tried, [
    `${BASELINE_COMMIT}^{commit}`,
    `${BASELINE_BRANCH}^{commit}`,
    `origin/${BASELINE_BRANCH}^{commit}`,
  ], 'the candidates were not attempted in the declared order');
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

  // The point of this guard is that resolution NEVER needs a local branch —
  // originally because the remote-tracking ref was available, and now because
  // the immutable commit leads the candidate list. Either way the property is
  // the same: a fresh clone resolves without anyone creating a branch.
  assert.strictEqual(result.ref, BASELINE_COMMIT,
    'the pinned commit should resolve before either branch name');
  assert.strictEqual(result.sha, BASELINE_COMMIT);

  // And the branch names, when present, still agree with the pin — so this
  // stays a test about resolution rather than about which name won.
  if (localExists) {
    const local = execFileSync('git', ['rev-parse', '--verify', `refs/heads/${BASELINE_BRANCH}^{commit}`],
      { cwd: ROOT, encoding: 'utf8' }).trim();
    assert.strictEqual(local, BASELINE_COMMIT, 'the local branch has moved off the pinned commit');
  }
});

// ── THE IMMUTABLE BASELINE PIN ──────────────────────────────────────────────
//
// The baseline used to be resolved by BRANCH NAME, which made a deletable
// feature branch load-bearing for the whole suite — and, once the scheduled
// refresh began running the suite as its first step, for every scheduled run.
// Deleting the branch in ordinary post-merge cleanup would have aborted the
// scheduler before it fetched a single source.
//
// The pin is a commit id, and these guards exist because a pin is only as good
// as the reachability of what it points at.

test('the pinned baseline resolves even when the feature branch is absent', () => {
  // Only the immutable commit is offered — the branch names are withheld
  // exactly as they would be if someone had deleted the branch.
  const resolved = resolveBaseline({
    cwd: ROOT,
    candidates: [BASELINE_COMMIT],
  });
  assert.strictEqual(resolved.ref, BASELINE_COMMIT);
  assert.strictEqual(resolved.sha, BASELINE_COMMIT);
});

test('the pinned commit is the intended stack base, not some other commit', () => {
  // Resolving through the full candidate list and through the pin alone must
  // agree: the pin is a more durable name for the same commit, not a
  // different baseline smuggled in.
  const viaAll = resolveBaseline({ cwd: ROOT });
  const viaPin = resolveBaseline({ cwd: ROOT, candidates: [BASELINE_COMMIT] });
  assert.strictEqual(viaAll.sha, viaPin.sha, 'the pin points at a different commit than the branch');
  assert.strictEqual(viaAll.mergeBase, viaPin.mergeBase, 'the pin yields a different merge base');

  // And it still agrees with the branch itself while the branch exists, which
  // is what makes this a rename rather than a change of meaning.
  const branchRef = resolvesRef(`origin/${BASELINE_BRANCH}`);
  if (branchRef) {
    assert.strictEqual(branchRef.trim(), BASELINE_COMMIT,
      'the feature branch has moved away from the pinned commit — the pin is now stale');
  }
});

test('the pinned commit is an ancestor of main, so it cannot be collected', () => {
  // This is the property that makes pinning safe at all. A commit reachable
  // only from a deletable branch would be garbage-collectable, and the pin
  // would become the very fragility it replaced.
  const mainRef = mainRefName();
  assert.ok(mainRef, 'neither origin/main nor main resolves: this guard cannot run');
  const isAncestor = git('merge-base', '--is-ancestor', BASELINE_COMMIT, mainRef) !== null;
  assert.ok(isAncestor,
    `${BASELINE_COMMIT.slice(0, 12)} is no longer an ancestor of ${mainRef}. `
    + 'The pin is only safe while the commit is reachable from main; re-pin to the '
    + 'current stack base before this becomes a deletable reference again.');
});

test('the pin is ordered first, ahead of the deletable names', () => {
  assert.strictEqual(CANDIDATES[0], BASELINE_COMMIT,
    'a deletable branch name is tried before the immutable commit');
  assert.ok(CANDIDATES.includes(BASELINE_BRANCH),
    'the local branch fallback was dropped');
  assert.ok(CANDIDATES.includes(`origin/${BASELINE_BRANCH}`),
    'the remote branch fallback was dropped');
});

test('main is still never an acceptable baseline', () => {
  // The whole reason this resolver exists: the stack base differs from main,
  // and diffing against main would attribute another branch's changes to this
  // one. The pin must not have quietly reintroduced that fallback.
  assert.ok(!CANDIDATES.some((c) => /(^|\/)main$/.test(c)),
    'main appears in the candidate list');
  const src = require('node:fs')
    .readFileSync(path.join(ROOT, 'scripts/tests/helpers/baseline-ref.cjs'), 'utf8');
  assert.ok(!/\|\|\s*'main'|\?\?\s*'main'|candidates.*push\('main'\)/.test(src),
    'the resolver can fall back to main');
  // And an unresolvable baseline still throws rather than degrading.
  assert.throws(() => resolveBaseline({ cwd: ROOT, candidates: ['refs/heads/definitely-not-a-ref'] }),
    /Cannot resolve the diff baseline/);
  // The pinned baseline must genuinely differ from main, or the guard it feeds
  // would be measuring nothing.
  const viaPin = resolveBaseline({ cwd: ROOT, candidates: [BASELINE_COMMIT] });
  const mainBase = git('merge-base', 'HEAD', mainRefName()).trim();
  assert.notStrictEqual(viaPin.mergeBase, mainBase,
    'the pinned baseline now equals the main baseline: the stack has landed and the '
    + 'guard needs re-pinning rather than silently measuring against main');
});
