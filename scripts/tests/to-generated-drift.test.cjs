'use strict';

// ── GENERATED-DRIFT GUARD ───────────────────────────────────────────────────
//
// WHAT WENT WRONG (commit 9f745d73b, 21,948 files, +21,948 / -0)
//
// scripts/lib/bd-render.cjs gained one line — `<script src="/js/bd-discovery.js"
// defer></script>` — in commit e11de15cb. Nothing re-ran the Tender Detail
// generator afterwards, so for many commits the committed tree did not
// reproduce from its own generator. The full suite passed in BOTH states,
// because every existing test reads either the projection (to-detail.cjs) or a
// handful of published pages for properties the missing line does not affect.
//
// WHAT THIS GUARD PROVES
//
// The generator's output is a pure function of the committed corpus. Split that
// output in two:
//
//   • the SHELL — the bytes every detail page shares, because they do not
//     depend on which opportunity the page is about. This is where the shared
//     renderer lives, and it is where the defect lived. One contract, 21,948
//     files.
//   • the BODY — the bytes derived from one opportunity's own facts.
//
// The shell is checked against EVERY committed page; the body is checked by
// exact byte identity on a deterministic, shape-diverse sample.
//
// WHY IT IS CHEAP
//
// Nothing here re-renders 21,948 pages. The shell contract is DERIVED by
// rendering four well-separated real pages through the generator itself and
// keeping the bytes all four share; the sweep then reads only that many bytes
// from the head and tail of each committed file with positioned reads. Measured
// on this tree: ~0.4 s of I/O for the sweep, on top of the one-off ~2.3 s the
// generator's own prepare() costs. Re-rendering and byte-comparing all 21,948
// pages costs ~3.3 s and is what `node scripts/build-tender-detail.cjs` already
// does — that is the full check, and it belongs in the build, not in every
// unit-test run.
//
// NOT A HARDCODED FINGERPRINT. Both sides of every comparison are derived at
// run time: the expected shell from the current generator, the actual shell
// from the committed files. Adding an opportunity, retitling one, or changing
// the shared renderer and regenerating never requires editing this file. The
// only thing that fails it is committed output that no longer reproduces.
//
// ── WHAT THIS DOES **NOT** COVER ────────────────────────────────────────────
//
//  1. Per-page BODY drift outside the sample. If a renderMain change alters
//     only pages whose shape the sample misses, the sweep will not see it —
//     the shell is unaffected by definition. The sample is chosen for shape
//     diversity to shrink this gap, not to close it.
//  2. The middle of <head>, in the SWEEP. The page-independent shell is only
//     contiguous as a prefix (through the analytics block) and a suffix (from
//     the static Limitations section through </html>). The CSS links, the
//     ecosystem head block and the JSON-LD sit between per-page values, so the
//     sweep cannot reach them. Drift there is still caught, because it is
//     page-independent and therefore uniform: every page changes at once, so
//     the exact-render sample sees it on its first page. What is genuinely
//     uncovered is mid-head drift on SOME pages only — which no generator
//     produces, but a hand edit could. The boundary is asserted, not assumed:
//     see the last mutation test.
//  3. Anything upstream of the generator. A wrong corpus, a wrong platform
//     registry or a wrong match engine reproduces perfectly; this guard says
//     "the committed pages are what this generator emits", never "the facts are
//     right". Those are to-detail / to-coverage / tp-* tests.
//  4. Other generators. Business Directories, Marketplaces, Media and the
//     Distribution Planner have their own manifests and their own tests; this
//     file owns the Tender Detail family alone.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const BUILD = require('../build-tender-detail.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const MANIFEST = JSON.parse(fs.readFileSync(BUILD.MANIFEST_FILE, 'utf8')).files;

// The generator's own pipeline — not a second copy of it. Everything below
// compares committed bytes against what THIS produces.
const ctx = BUILD.prepare();
const { pages, renderFor, fileFor } = ctx;

// ── DERIVING THE SHELL ──────────────────────────────────────────────────────
//
// Four real pages, spread across the corpus so they share no accident of
// authorship, rendered by the generator. Whatever all four agree on at the head
// and at the tail is page-independent by construction. Both affixes are then
// trimmed to a line boundary, so a coincidence — four titles that happen to
// start with the same letter — cannot smuggle a page-specific byte into the
// contract.
const PROBE_INDEXES = [0, Math.floor(pages.length / 3), Math.floor((2 * pages.length) / 3),
  pages.length - 1];
const probes = PROBE_INDEXES.map((i) => renderFor(pages[i]));

const commonPrefix = (a, b) => {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return a.slice(0, i);
};
const commonSuffix = (a, b) => {
  let i = 0;
  while (i < a.length && i < b.length && a[a.length - 1 - i] === b[b.length - 1 - i]) i += 1;
  return a.slice(a.length - i);
};

const SHELL = (() => {
  let head = probes[0];
  let tail = probes[0];
  for (const p of probes.slice(1)) {
    head = commonPrefix(head, p);
    tail = commonSuffix(tail, p);
  }
  head = head.slice(0, head.lastIndexOf('\n') + 1);
  tail = tail.slice(tail.indexOf('\n') + 1);
  return { head: Buffer.from(head), tail: Buffer.from(tail) };
})();

// The single predicate. The sweep applies it to files; the mutation test
// applies it to bytes held in memory, so both are proving the same thing.
function shellMatches(buf) {
  if (buf.length < SHELL.head.length + SHELL.tail.length) return false;
  return buf.subarray(0, SHELL.head.length).equals(SHELL.head)
    && buf.subarray(buf.length - SHELL.tail.length).equals(SHELL.tail);
}

// Reads exactly the shell window of a file — never the whole page.
function shellWindow(abs) {
  const fd = fs.openSync(abs, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    if (size < SHELL.head.length + SHELL.tail.length) return null;
    const head = Buffer.alloc(SHELL.head.length);
    const tail = Buffer.alloc(SHELL.tail.length);
    fs.readSync(fd, head, 0, head.length, 0);
    fs.readSync(fd, tail, 0, tail.length, size - tail.length);
    return { head, tail };
  } finally {
    fs.closeSync(fd);
  }
}

const HTML_FILES = MANIFEST.filter((rel) => rel.endsWith('index.html'));

// ── THE GUARD ───────────────────────────────────────────────────────────────

test('the manifest is exactly the set of files this generator owns', () => {
  // The sweep enumerates from the manifest, so a stale manifest would quietly
  // shrink its own coverage. Anchor it to the generator's owned set first.
  const owned = pages.map((p) => path.relative(ROOT, fileFor(p)))
    .concat(path.relative(ROOT, BUILD.SITEMAP_FILE)).sort();
  assert.deepStrictEqual(MANIFEST, owned,
    'the committed .detail-manifest.json is not what this generator would write');
  assert.strictEqual(HTML_FILES.length, pages.length);
});

// The scripts the shared renderer appends AFTER the footer — the block the
// missing line belonged to. Derived from a fresh render, never listed here.
const TAIL_SCRIPTS = [...probes[0].slice(probes[0].lastIndexOf('</footer>'))
  .matchAll(/<script src="(\/js\/[^"]+)" defer><\/script>/g)];

test('the shell contract is non-vacuous and carries the end-of-document scripts', () => {
  // A shell that collapsed to a few bytes would make the sweep pass forever.
  assert.ok(SHELL.head.length > 200, `shell head is only ${SHELL.head.length} bytes`);
  assert.ok(SHELL.tail.length > 1000, `shell tail is only ${SHELL.tail.length} bytes`);
  const shellText = SHELL.head.toString() + SHELL.tail.toString();
  assert.ok(shellText.includes('</html>'), 'the shell does not reach the end of the document');

  // THE DEFECT CLASS, STATED AS A PROPERTY. The stale line was one of the
  // scripts the renderer appends after the footer, so every script in that
  // block must fall inside the swept window — otherwise a tag could be added to
  // or removed from the shared template and no committed page would be checked
  // against it again. Derived from a fresh render, so a fourth script in that
  // block needs no edit here.
  assert.ok(TAIL_SCRIPTS.length >= 3,
    `only ${TAIL_SCRIPTS.length} scripts follow the footer`);
  for (const [, src] of TAIL_SCRIPTS) {
    assert.ok(SHELL.tail.toString().includes(`<script src="${src}"`),
      `${src} is emitted after the footer but sits outside the swept shell window`);
  }

  // And the derived affixes must be page-independent for real: no probe's own
  // title or route may have leaked into them.
  for (const i of PROBE_INDEXES) {
    const p = pages[i];
    assert.ok(!shellText.includes(p.route), `${p.route} leaked into the shell contract`);
    assert.ok(!shellText.includes(p.source.title.slice(0, 24)),
      'a probe title leaked into the shell contract');
  }
});

test('every committed detail page carries the current generator\'s shell', () => {
  const stale = [];
  for (const rel of HTML_FILES) {
    const w = shellWindow(path.join(ROOT, rel));
    if (!w || !w.head.equals(SHELL.head) || !w.tail.equals(SHELL.tail)) {
      stale.push(rel);
      if (stale.length > 5) break;
    }
  }
  assert.deepStrictEqual(stale, [],
    `${stale.length}+ committed pages do not reproduce from scripts/build-tender-detail.cjs. `
    + 'Re-run: node scripts/build-tender-detail.cjs');
});

test('a deterministic, shape-diverse sample is byte-identical to a fresh render', () => {
  // Shape predicates first, so every branch renderMain can take is represented;
  // evenly spaced indexes after, so the sample is not clustered at the front.
  const shapes = [
    ['has a description', (p) => p.source.description],
    ['has no description', (p) => !p.source.description],
    ['has a declared value', (p) => p.source.value],
    ['has no classification', (p) => p.source.classifications.length === 0],
    ['has many classifications', (p) => p.source.classifications.length > 2],
    ['has no supplier match', (p) => p.derived.matches.length === 0],
    ['has supplier matches', (p) => p.derived.matches.length > 3],
    ['is multi-source', (p) => p.provenance.multiSource],
    ['needs a browser check', (p) => p.provenance.browserCheckRequired],
    ['has a separate submission URL',
      (p) => p.source.submissionUrl && p.source.submissionUrl !== p.source.url],
    ['has a zoneless deadline', (p) => p.dates.deadline && !p.dates.deadline.decidable],
    ['is past deadline but open at source',
      (p) => p.dates.deadline && p.dates.deadline.passedButSourceOpen],
    ['has a project country distinct from the buyer country',
      (p) => p.source.projectCountry && p.source.projectCountry !== p.source.country],
    ['has an official reference', (p) => p.source.officialReference],
  ];

  const sample = new Map();
  let covered = 0;
  for (const [label, fn] of shapes) {
    const hit = pages.find(fn);
    if (hit) { sample.set(hit.id, hit); covered += 1; }
  }
  assert.ok(covered >= 10, `only ${covered} of ${shapes.length} page shapes exist in the corpus`);
  const step = Math.floor(pages.length / 24);
  for (let i = 0; i < pages.length; i += step) sample.set(pages[i].id, pages[i]);
  sample.set(pages[pages.length - 1].id, pages[pages.length - 1]);

  for (const p of sample.values()) {
    const committed = fs.readFileSync(fileFor(p), 'utf8');
    assert.strictEqual(committed, renderFor(p),
      `${p.route} does not reproduce from the generator. `
      + 'Re-run: node scripts/build-tender-detail.cjs');
  }
  assert.ok(sample.size >= 30, `the sample collapsed to ${sample.size} pages`);
});

test('the generated sitemap reproduces byte for byte', () => {
  assert.strictEqual(fs.readFileSync(BUILD.SITEMAP_FILE, 'utf8'), ctx.sitemap());
});

// ── PROOF THE GUARD IS NOT VACUOUS ──────────────────────────────────────────
//
// The exact defect, replayed in memory against the same predicate the sweep
// uses. No file is touched.

test('MUTATION: the reconciled staleness is rejected on every page', () => {
  const good = fs.readFileSync(fileFor(pages[0]));
  assert.ok(shellMatches(good), 'the unmutated page already fails the guard');

  for (const [tag, src] of TAIL_SCRIPTS) {
    // Drop one end-of-document script tag — literally what the 21,948 stale
    // pages were missing.
    const dropped = Buffer.from(good.toString().replace(`  ${tag}\n`, ''));
    assert.notStrictEqual(dropped.length, good.length, `the mutation for ${src} did not take`);
    assert.ok(!shellMatches(dropped), `dropping ${src} slips past the shell guard`);
  }
});

test('MUTATION: head-side and tail-side shell drift are both caught', () => {
  const good = fs.readFileSync(fileFor(pages[0])).toString();
  const tailFrom = good.lastIndexOf('</footer>');
  const cases = [
    ['the analytics id changes', good.replace('G-4RE6YCJZBD', 'G-0000000000')],
    ['a trailing script loses defer',
      good.slice(0, tailFrom) + good.slice(tailFrom).replace('" defer></script>', '"></script>')],
    ['a byte is appended', `${good}\n`],
    ['a footer link is dropped', good.replace(/\n\s*<li><a href="\/blog\/">[^\n]*/, '')],
  ];
  for (const [label, mutated] of cases) {
    assert.notStrictEqual(mutated, good, `the mutation "${label}" did not take`);
    assert.ok(!shellMatches(Buffer.from(mutated)), `"${label}" slips past the shell guard`);
  }
});

test('MUTATION: mid-head drift is out of the sweep and inside the sample', () => {
  // The honest boundary, asserted rather than only described. The ecosystem
  // <head> block sits between per-page values (title, social metas, JSON-LD),
  // so it is not in a contiguous prefix or suffix and the cheap sweep cannot
  // see it. It is page-INDEPENDENT, though, so drift there is uniform across
  // all 21,948 pages — which is exactly what one exact re-render catches.
  const p = pages[0];
  const good = fs.readFileSync(fileFor(p), 'utf8');
  const mutated = good.replace('/js/ecosystem-registry.js', '/js/ecosystem-registry-v2.js');
  assert.notStrictEqual(mutated, good, 'the mutation did not take');
  assert.ok(shellMatches(Buffer.from(mutated)),
    'mid-head drift is now inside the swept window — update the coverage note above');
  assert.notStrictEqual(mutated, renderFor(p),
    'the exact-render layer does not see mid-head drift, so nothing covers it');
  assert.strictEqual(good, renderFor(p));
});
