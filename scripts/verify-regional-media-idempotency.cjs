#!/usr/bin/env node
'use strict';

// Apply and build twice; prove the second pass changed nothing.
//
// ── WHY THIS IS WORTH ITS OWN SCRIPT ────────────────────────────────────────
//
// The registry's append-only guarantee rests on a claim that is easy to make
// and easy to get wrong: running the pipeline again produces byte-identical
// output. A selection that depended on Map iteration order, an unstable sort,
// a timestamp taken at write time, or a Set built from a directory listing
// would all pass a single run and quietly reshuffle a thousand records on the
// next one — and because every published record's SHA-256 is pinned in the
// wave history, a reshuffle is not a cosmetic diff. It is a corpus that can no
// longer prove it is the corpus it says it is.
//
// So this hashes every artefact the pipeline owns, runs the pipeline again,
// and hashes them a second time.
//
//   node scripts/verify-regional-media-idempotency.cjs
//
// It calls --apply, which rewrites data. Run it on a clean tree, or on a tree
// whose only changes are the ones the pipeline just made.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');

const ARTEFACTS = [
  'data/regional-media/regional-media.json',
  'data/regional-media/.wave-history.json',
  'data/regional-media/.build-manifest.json',
  'data/domain-rating/.ahrefs-domain-rating.json',
  'research/regional-media/index.html',
  'research/regional-media/regional-media.csv',
  'de/research/regional-media/index.html',
  'es/research/regional-media/index.html',
  'fr/research/regional-media/index.html',
];

const digest = (rel) => {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) return 'ABSENT';
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
};

const snapshot = () => Object.fromEntries(ARTEFACTS.map((rel) => [rel, digest(rel)]));

const run = (script) => execFileSync(process.execPath,
  [path.join(ROOT, 'scripts', script[0]), ...script.slice(1)],
  { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function main() {
  const before = snapshot();
  console.log('Pass 1 hashes recorded for', ARTEFACTS.length, 'artefacts.');

  run(['expand-regional-media.cjs', '--apply']);
  run(['build-regional-media.cjs']);
  const after = snapshot();

  const drifted = ARTEFACTS.filter((rel) => before[rel] !== after[rel]);
  for (const rel of ARTEFACTS) {
    const mark = before[rel] === after[rel] ? 'same' : 'CHANGED';
    console.log(`  ${mark.padEnd(8)} ${after[rel].slice(0, 16)}  ${rel}`);
  }

  if (drifted.length) {
    console.error(`\n${drifted.length} artefact(s) changed on a second apply+build:`);
    for (const rel of drifted) console.error(`  ${rel}\n    before ${before[rel]}\n    after  ${after[rel]}`);
    console.error('\nThe pipeline is not idempotent. A published wave cannot be trusted to');
    console.error('reproduce, and the SHA-256 hashes in .wave-history.json are not stable.');
    process.exitCode = 1;
    return;
  }
  console.log(`\nIdempotent: apply + build twice produced identical bytes for all ${ARTEFACTS.length} artefacts.`);
}

main();
