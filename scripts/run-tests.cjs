#!/usr/bin/env node
// scripts/run-tests.cjs
'use strict';

// The intended way to run the whole suite, and the reason it exists.
//
// ── THE RACE ────────────────────────────────────────────────────────────────
//
// `node --test "scripts/tests/*.test.cjs"` is not deterministic in this
// repository. Identical invocations produced 1 failure, then 0, then 6, while
// every affected file passed when run alone.
//
// The cause is ownership, not flakiness in the assertions. Twenty-two test
// files invoke production generators, and those generators rewrite the shared
// working tree — research/**, the three locale mirrors, planner payloads. Under
// the default runner those files execute concurrently with each other and with
// the browser suites, which serve that same tree over HTTP. So a page can be
// rebuilt between the moment a test computed what it expected and the moment
// the browser rendered it, and two generator tests can each assert "0 written"
// about a tree the other is halfway through writing.
//
// ── WHAT THIS DOES ──────────────────────────────────────────────────────────
//
// Two groups, and the split is by what a file WRITES:
//
//   PARALLEL   files that only read. The large majority, and they stay fast.
//   SERIAL     files that run a generator or write into the tree, plus the
//              browser suites that read it. One at a time, in a stable order.
//
// This is deliberately not "make the suite serial". The parallel group is most
// of the suite and most of the wall clock; only the set that genuinely shares
// one mutable resource is serialised, which is the smallest correct fix
// available without threading an output root through every generator.
//
// The browser harness additionally freezes the bytes it serves for the life of
// each test — see scripts/tests/helpers/cdp.cjs. That protects a browser test
// even if this grouping is bypassed.
//
//   node scripts/run-tests.cjs            # the whole suite, deterministically
//   node scripts/run-tests.cjs --list     # show the grouping and exit

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'scripts/tests');

// A file belongs in the serial group if it can write into the tree, or if it
// reads the tree through a browser. Detected from the source rather than from a
// hand-kept list, so a new generator test is grouped correctly the day it is
// written instead of the day someone remembers.
const WRITES = /require\(['"`][^'"`]*build-[a-z-]+\.cjs|execFileSync\([^)]*build-|writeFileSync\(/;
const BROWSER = /helpers\/cdp\.cjs/;

function classify() {
  const parallel = [];
  const serial = [];
  for (const name of fs.readdirSync(DIR).filter((f) => f.endsWith('.test.cjs')).sort()) {
    const src = fs.readFileSync(path.join(DIR, name), 'utf8');
    // Comments describe races; code causes them.
    const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    (WRITES.test(code) || BROWSER.test(code) ? serial : parallel).push(name);
  }
  return { parallel, serial };
}

function run(files, extraArgs = []) {
  if (!files.length) return { tests: 0, pass: 0, fail: 0, code: 0 };
  const args = ['--test', ...extraArgs, ...files.map((f) => path.join('scripts/tests', f))];
  const res = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e9 });
  const out = `${res.stdout || ''}${res.stderr || ''}`;
  const num = (label) => {
    const m = out.match(new RegExp(`^\\u2139 ${label} (\\d+)`, 'm'));
    return m ? Number(m[1]) : 0;
  };
  const failures = [...out.matchAll(/^✖ (.+?) \(/gm)].map((m) => m[1]);
  return {
    tests: num('tests'), pass: num('pass'), fail: num('fail'), code: res.status, failures, out,
  };
}

function main() {
  const { parallel, serial } = classify();
  if (process.argv.includes('--list')) {
    console.log(`PARALLEL (${parallel.length}) — read-only:`);
    for (const f of parallel) console.log(`  ${f}`);
    console.log(`\nSERIAL (${serial.length}) — writes the tree, or reads it through a browser:`);
    for (const f of serial) console.log(`  ${f}`);
    return;
  }

  console.log(`Running ${parallel.length} read-only file(s) in parallel, `
    + `then ${serial.length} tree-touching file(s) one at a time.`);

  const first = run(parallel);
  let tests = first.tests; let pass = first.pass; let fail = first.fail;
  const failures = [...(first.failures || [])];

  // One at a time, so no two generators write the tree at once and no browser
  // test reads it while one does.
  for (const file of serial) {
    const r = run([file]);
    tests += r.tests; pass += r.pass; fail += r.fail;
    if (r.fail) {
      failures.push(...(r.failures || []));
      process.stdout.write(r.out.split('\n').filter((l) => /^✖|AssertionError|Error:/.test(l))
        .slice(0, 6).map((l) => `  ${l}\n`).join(''));
    }
  }

  console.log(`\ntests ${tests}  pass ${pass}  fail ${fail}`);
  if (fail) {
    console.log('failing:');
    for (const f of [...new Set(failures)]) console.log(`  ${f}`);
  }
  process.exit(fail ? 1 : 0);
}

main();
