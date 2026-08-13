// scripts/tests/helpers/baseline-ref.cjs
'use strict';

// Resolves the commit the Business Directories scope guard diffs against.
//
// Why a baseline other than main is needed at all: this work is stacked on
// feat/helperg-ecosystem-banner, which already modifies sitemap.xml and
// css/petrohrys.css relative to main. Diffing against main would attribute that
// branch's changes to this one and the scope guard would report false positives.
// So the guard must diff against the stack base — and must NOT quietly fall back
// to main when it cannot find it, because a silently wrong baseline is worse
// than a loud failure.
//
// Why this file exists: the baseline used to be read with a bare
//   git merge-base HEAD feat/helperg-ecosystem-banner
// which names a LOCAL branch. A fresh clone has the remote-tracking ref
// (origin/feat/helperg-ecosystem-banner) but no local branch of that name, so
// the whole test file threw at require time and every test in it silently
// vanished from the run. The fix is to accept either form, prefer whichever
// exists, and fail with an actionable message when neither does.
//
// Everything here is read-only. No ref is created, moved or deleted, and no
// network call is made: resolution uses `git rev-parse --verify` and
// `git merge-base` only.

const { execFileSync } = require('node:child_process');

const BASELINE_BRANCH = 'feat/helperg-ecosystem-banner';

// ── WHY THE BASELINE IS PINNED TO A COMMIT ──────────────────────────────────
//
// The stack base, as an IMMUTABLE commit id.
//
// Resolving it by BRANCH NAME made a deletable feature branch load-bearing for
// the whole suite — and, since Phase 5, for the scheduled refresh: the
// workflow runs the full suite as its first step, so deleting this branch
// during ordinary post-merge cleanup would abort every scheduled run before a
// single source was fetched. That is a lot of blast radius for a name.
//
// The commit is safe to pin because it is an ANCESTOR OF MAIN, which makes it
// permanently reachable: it cannot be garbage-collected, and deleting the
// branch does not remove it. A test asserts that ancestry rather than trusting
// this comment, because the day it stops being true is the day the pin becomes
// the very fragility it replaced.
const BASELINE_COMMIT = '06bb5a9dd495706f2bd57a6bbeed54390eac6794';

// Order matters, and the immutable ref goes first: it is the one that cannot
// disappear. The branch names remain as fallbacks — a maintainer with the
// branch checked out is working against that ref, and keeping them costs
// nothing once the durable candidate leads.
const CANDIDATES = [BASELINE_COMMIT, BASELINE_BRANCH, `origin/${BASELINE_BRANCH}`];

// Read-only git subcommands this resolver is allowed to use. Anything that
// could create or move a ref is rejected rather than merely discouraged, so the
// no-mutation property is enforced instead of documented.
const READ_ONLY_SUBCOMMANDS = new Set(['rev-parse', 'merge-base']);

function defaultRun(cwd) {
  return (...args) => {
    if (!READ_ONLY_SUBCOMMANDS.has(args[0])) {
      throw new Error(`baseline-ref may only run read-only git subcommands, got "${args[0]}"`);
    }
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  };
}

// Returns { ref, sha } for the first candidate that resolves to a commit, or
// null if none do. `rev-parse --verify --quiet` exits non-zero for a missing
// ref, which execFileSync surfaces as a throw.
function resolveRef(candidates, run) {
  for (const ref of candidates) {
    let out;
    try {
      out = run('rev-parse', '--verify', '--quiet', `${ref}^{commit}`);
    } catch {
      continue;
    }
    const sha = String(out || '').trim();
    if (sha) return { ref, sha };
  }
  return null;
}

function unresolvedMessage(candidates) {
  return 'Cannot resolve the diff baseline for the Business Directories scope guard.\n'
    + `Tried, in order: ${candidates.join(', ')}.\n\n`
    + `This work is stacked on ${BASELINE_BRANCH}, which already modifies sitemap.xml and\n`
    + 'css/petrohrys.css relative to main. Diffing against main would report that branch\'s\n'
    + 'changes as ours, so the guard deliberately refuses to fall back to main.\n\n'
    + `Fix: run \`git fetch origin\` so that ${BASELINE_COMMIT.slice(0, 12)} is present.\n`
    + 'That commit is an ancestor of main, so a full fetch always restores it; a\n'
    + 'shallow clone (--depth 1) is the usual reason it is missing.';
}

// Throws — never returns a degraded baseline — when nothing resolves.
function resolveBaseline({ cwd, candidates = CANDIDATES, run } = {}) {
  const git = run || defaultRun(cwd);
  const found = resolveRef(candidates, git);
  if (!found) throw new Error(unresolvedMessage(candidates));
  return {
    ref: found.ref,
    sha: found.sha,
    mergeBase: String(git('merge-base', 'HEAD', found.sha)).trim(),
  };
}

module.exports = {
  BASELINE_COMMIT,
  BASELINE_BRANCH,
  CANDIDATES,
  READ_ONLY_SUBCOMMANDS,
  resolveRef,
  resolveBaseline,
  unresolvedMessage,
};
