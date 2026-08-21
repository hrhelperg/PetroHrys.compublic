'use strict';

// An interrupted research run must keep what it already learned.
//
// The defect this covers cost a ~900-record network pass: findings lived in an
// array until the very end, so stopping the process at minute forty threw away
// forty minutes of answers. Nothing was corrupted, which is why it was easy to
// miss — the file was simply never written.
//
// Every test here is a way a long run actually ends: a person pressing Ctrl-C,
// a supervisor sending SIGTERM, a kernel killing the process outright, and the
// ordinary case of running the same command again tomorrow.

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawn, execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const CK = require(path.join(ROOT, 'scripts/lib/rc-checkpoint.cjs'));
const SAFE = require(path.join(ROOT, 'scripts/lib/rc-safe-apply.cjs'));

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rc-ck-'));
const finding = (n, extra = {}) => ({
  key: `directories|country-${n}|host${n}.test`,
  collection: 'directories',
  id: `dir-${n}`,
  state: 'ACCEPT_FREE_TRUSTED',
  cost: 'free',
  ...extra,
});

// ── DURABILITY ──────────────────────────────────────────────────────────────

test('a finding is on disk before the next record is researched', () => {
  const dir = tmp();
  const file = path.join(dir, 'f.json');
  const led = new CK.Ledger(file);

  led.record(finding(1));
  // Not "after the batch", not "at exit" — now. This is the property whose
  // absence lost the original run.
  const journal = fs.readFileSync(file + CK.JOURNAL_SUFFIX, 'utf8');
  assert.match(journal, /dir-1/, 'the first finding never reached the disk');

  led.record(finding(2));
  assert.equal(fs.readFileSync(file + CK.JOURNAL_SUFFIX, 'utf8').trim().split('\n').length, 2);
  led.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a hard kill loses at most the record in flight', () => {
  const dir = tmp();
  const file = path.join(dir, 'f.json');
  const script = path.join(dir, 'run.cjs');
  // A run that never gets to finish, killed the way an OOM killer or a
  // `kill -9` ends one: no handler, no flush, no compaction.
  fs.writeFileSync(script, `
    const CK = require(${JSON.stringify(path.join(ROOT, 'scripts/lib/rc-checkpoint.cjs'))});
    const led = new CK.Ledger(${JSON.stringify(file)});
    let n = 0;
    setInterval(() => {
      n += 1;
      led.record({ key: 'directories|c-' + n + '|h' + n + '.test', collection: 'directories', id: 'dir-' + n, state: 'ACCEPT_FREE_TRUSTED', cost: 'free' });
      if (n === 5) console.log('READY');
    }, 12);
  `);
  const child = spawn(process.execPath, [script]);
  let out = '';
  let killed = false;
  return new Promise((resolve) => {
    // Registered once, here. Registering it inside the data handler attaches a
    // second listener when the child's own shutdown line arrives — both fire,
    // the first removes the temp directory and the second reads a path that no
    // longer exists. The test then fails for its own plumbing.
    child.on('exit', () => {
      const reopened = new CK.Ledger(file);
      assert.ok(reopened.size() >= 5,
        `a SIGKILL lost the run: ${reopened.size()} finding(s) survived`);
      assert.ok(reopened.has('directories|c-1|h1.test'), 'the first finding was lost');
      // And the recovered file is usable, not a truncated half-object.
      reopened.compact();
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      assert.ok(Array.isArray(parsed.findings) && parsed.findings.length >= 5);
      reopened.close();
      fs.rmSync(dir, { recursive: true, force: true });
      resolve();
    });
    child.stdout.on('data', (d) => {
      out += d;
      if (out.includes('READY') && !killed) { killed = true; child.kill('SIGKILL'); }
    });
  });
});

test('SIGINT leaves a compacted, valid findings file', () => {
  const dir = tmp();
  const file = path.join(dir, 'f.json');
  const script = path.join(dir, 'run.cjs');
  fs.writeFileSync(script, `
    const CK = require(${JSON.stringify(path.join(ROOT, 'scripts/lib/rc-checkpoint.cjs'))});
    const led = new CK.Ledger(${JSON.stringify(file)});
    CK.onInterrupt(led, 'test');
    let n = 0;
    setInterval(() => {
      n += 1;
      led.record({ key: 'directories|c-' + n + '|h' + n + '.test', collection: 'directories', id: 'dir-' + n, state: 'ACCEPT_FREE_TRUSTED', cost: 'free' });
      if (n === 4) console.log('READY');
    }, 12);
  `);
  const child = spawn(process.execPath, [script]);
  let out = '';
  let killed = false;
  return new Promise((resolve) => {
    child.on('exit', (code) => {
      assert.equal(code, 130, 'the interrupt handler did not run');
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      assert.ok(parsed.findings.length >= 4, 'SIGINT did not compact the findings');
      assert.ok(!fs.existsSync(file + CK.JOURNAL_SUFFIX), 'the journal outlived a clean shutdown');
      fs.rmSync(dir, { recursive: true, force: true });
      resolve();
    });
    child.stdout.on('data', (d) => {
      out += d;
      if (out.includes('READY') && !killed) { killed = true; child.kill('SIGINT'); }
    });
  });
});

test('a torn final journal line costs one record, not the file', () => {
  const dir = tmp();
  const file = path.join(dir, 'f.json');
  const led = new CK.Ledger(file);
  for (let i = 1; i <= 4; i += 1) led.record(finding(i));
  led.close();
  // Exactly what a kill during a write looks like.
  fs.appendFileSync(file + CK.JOURNAL_SUFFIX, '{"key":"directories|c-5|h5.te');

  const reopened = new CK.Ledger(file);
  assert.equal(reopened.size(), 4, 'a damaged last line took healthy records with it');
  assert.equal(reopened.damaged, 1);
  reopened.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── RESUME ──────────────────────────────────────────────────────────────────

test('a rerun resumes rather than starting from zero', () => {
  const dir = tmp();
  const file = path.join(dir, 'f.json');
  const first = new CK.Ledger(file);
  for (let i = 1; i <= 6; i += 1) first.record(finding(i));
  first.compact();

  const second = new CK.Ledger(file);
  const all = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => finding(n));
  const todo = all.filter((t) => !second.has(t.key));
  assert.deepEqual(todo.map((t) => t.id), ['dir-7', 'dir-8'],
    'the resumed run would have re-researched work it had already done');
  second.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('resuming twice does not duplicate a finding', () => {
  const dir = tmp();
  const file = path.join(dir, 'f.json');
  for (let round = 0; round < 3; round += 1) {
    const led = new CK.Ledger(file);
    for (let i = 1; i <= 5; i += 1) if (!led.has(finding(i).key)) led.record(finding(i));
    led.compact();
  }
  const { findings } = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(findings.length, 5, `three passes produced ${findings.length} findings for 5 records`);
  assert.equal(new Set(findings.map((f) => f.key)).size, 5);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('an interrupted-then-resumed run equals an uninterrupted one', () => {
  // Same deterministic findings, two histories: one straight through, one
  // stopped and restarted twice. The artefact must not be able to tell.
  const straightDir = tmp();
  const brokenDir = tmp();
  const straight = path.join(straightDir, 'f.json');
  const broken = path.join(brokenDir, 'f.json');
  const all = Array.from({ length: 12 }, (_, i) => finding(i + 1));

  const a = new CK.Ledger(straight);
  for (const f of all) a.record(f);
  a.compact({ probedAt: 'FIXED' });

  let cursor = 0;
  for (const stop of [4, 9, 12]) {
    const b = new CK.Ledger(broken);
    while (cursor < stop) { b.record(all[cursor]); cursor += 1; }
    b.close(); // an abrupt end: no compaction at all
  }
  const last = new CK.Ledger(broken);
  last.compact({ probedAt: 'FIXED' });

  assert.equal(fs.readFileSync(broken, 'utf8'), fs.readFileSync(straight, 'utf8'),
    'the interrupted history produced a different findings file');
  fs.rmSync(straightDir, { recursive: true, force: true });
  fs.rmSync(brokenDir, { recursive: true, force: true });
});

// ── IDENTITY ────────────────────────────────────────────────────────────────

test('checkpoint identity is the canonical contract, never the array index', () => {
  const rows = [
    { id: 'a', country: 'brazil', website: 'https://www.example.com/x' },
    { id: 'b', country: 'portugal', website: 'https://example.com/y' },
  ];
  const before = rows.map((r) => CK.targetKey('directories', r));
  // Generators sort. A reordered file must not shift which record is "done".
  const after = rows.slice().reverse().map((r) => CK.targetKey('directories', r));
  assert.deepEqual(before.slice().sort(), after.slice().sort());
  // Same host, two countries: two records, and the checkpoint must not
  // conflate them — this is the rule that kept Barbados's only directory.
  assert.notEqual(before[0], before[1]);
  assert.match(before[0], /^directories\|brazil\|example\.com$/);
});

test('a tender key separates two systems on one government host', () => {
  const one = { id: 't1', country: 'india', officialUrl: 'https://gov.test/eproc' };
  const two = { id: 't2', country: 'india', officialUrl: 'https://gov.test/tenders' };
  assert.notEqual(CK.targetKey('tenders', one), CK.targetKey('tenders', two),
    'two distinct procurement systems shared one checkpoint identity');
});

test('a finding with no identity is refused rather than stored namelessly', () => {
  const dir = tmp();
  const led = new CK.Ledger(path.join(dir, 'f.json'));
  assert.throws(() => led.record({ id: 'x' }), /identity key/);
  led.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── THE FIREWALL ────────────────────────────────────────────────────────────

test('network research never writes canonical data', () => {
  // The probe path must not contain a canonical write at all. Research
  // observes; the applier decides. Keeping them apart is what makes a wrong
  // classifier a deleted scratch file instead of a git recovery.
  for (const file of ['research-free-and-trusted.cjs', 'research-tender-bid-access.cjs']) {
    const src = fs.readFileSync(path.join(ROOT, 'scripts', file), 'utf8');
    const probe = src.slice(src.indexOf('async function runProbe'), src.indexOf('function report'));
    assert.ok(probe.length > 200, `${file}: could not isolate the probe`);
    assert.ok(!/writeFileSync\(\s*(DATA|C\.data)/.test(probe),
      `${file}: the probe writes canonical data`);
    assert.match(probe, /ledger\.record\(/, `${file}: the probe does not checkpoint`);
    assert.ok(!/const findings = \[\];/.test(probe),
      `${file}: findings still accumulate in memory until the end`);
  }
});

test('an atomic replacement is never observed half-written', () => {
  const dir = tmp();
  const file = path.join(dir, 'f.json');
  CK.writeAtomic(file, '{"findings":[]}\n');
  const big = `${JSON.stringify({ findings: Array.from({ length: 5000 }, (_, i) => finding(i)) })}\n`;
  CK.writeAtomic(file, big);
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(file, 'utf8')));
  // No temp file left behind to be mistaken for a findings file.
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.includes('tmp-')), []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the journal is scratch and never reaches the tracked corpus', () => {
  // Asked as a pathspec rather than by listing the whole tree: this repository
  // tracks enough files that `git ls-files` alone overruns the child-process
  // buffer and the test fails for a reason that has nothing to do with it.
  const strays = execFileSync('git', ['ls-files', '--', `*${CK.JOURNAL_SUFFIX}`, '*.tmp-*'],
    { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  assert.deepEqual(strays, [], `transient research scratch is committed: ${strays.join(', ')}`);
});

// ── RAW EVIDENCE IS APPEND-ONLY ────────────────────────────────────────────
//
// A verdict is cheap and an observation is expensive, so the two get different
// rules. This corpus learned that twice in one phase: sixteen link-value
// findings were retracted by rewriting them with `templates: undefined`, which
// destroyed real rel tokens and external URLs that git could not return because
// the retraction preceded the commit — and 841 records reported that a listing
// had been DISCOVERED without ever recording which one, so re-reading a page we
// had already found turned out to be impossible.

test('retracting a classification cannot delete captured raw evidence', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-append-'));
  const file = path.join(dir, 'findings.json');
  const ledger = new CK.Ledger(file);

  const observation = {
    observedAt: '2026-08-21',
    kind: 'listing-read',
    url: 'https://directory.test/company/acme-1234',
    externalUrl: 'https://acme.test/',
    relTokens: ['nofollow'],
  };
  ledger.record({ key: 'k', state: 'RESOLVED', backlinkType: 'nofollow', observations: [observation] });

  // The exact shape of the mistake: retract by dropping the evidence.
  assert.throws(
    () => ledger.record({ key: 'k', state: 'UNRESOLVED', observations: undefined }),
    /may not delete raw evidence/,
  );
  assert.throws(
    () => ledger.record({ key: 'k', state: 'UNRESOLVED', observations: [] }),
    /may not delete raw evidence/,
  );
  // And quietly editing what was seen is refused too.
  assert.throws(
    () => ledger.record({
      key: 'k',
      state: 'UNRESOLVED',
      observations: [{ ...observation, relTokens: [] }],
    }),
    /append-only/,
  );

  // The verdict may still be withdrawn — carrying the evidence forward.
  ledger.record({
    key: 'k',
    state: 'UNRESOLVED',
    supersededReason: 'the link was not labelled as the business website',
    backlinkType: undefined,
    observations: [observation],
  });
  const after = ledger.all().find((f) => f.key === 'k');
  assert.equal(after.state, 'UNRESOLVED');
  assert.equal(after.backlinkType, undefined, 'the verdict is gone');
  assert.equal(after.observations.length, 1, 'the observation is not');
  assert.equal(after.observations[0].relTokens[0], 'nofollow');
  assert.equal(after.observations[0].externalUrl, 'https://acme.test/');

  // A later look adds to the record rather than replacing it.
  ledger.record({
    key: 'k',
    state: 'RESOLVED',
    backlinkType: 'nofollow',
    observations: [observation, { ...observation, observedAt: '2026-08-22' }],
  });
  assert.equal(ledger.all().find((f) => f.key === 'k').observations.length, 2);

  ledger.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a finding that never carried evidence is not forced to invent it', () => {
  // The rule constrains loss, not authorship: a researcher may record a verdict
  // with nothing attached, and may later attach something.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-append2-'));
  const ledger = new CK.Ledger(path.join(dir, 'f.json'));
  ledger.record({ key: 'k', state: 'PROTECTED' });
  ledger.record({ key: 'k', state: 'PROTECTED', why: 'refused twice' });
  ledger.record({ key: 'k', state: 'RESOLVED', observations: [{ url: 'https://x.test/1' }] });
  assert.equal(ledger.all().find((f) => f.key === 'k').observations.length, 1);
  ledger.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the link-value researcher records what it discovered, not only what it read', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/research-link-value.cjs'), 'utf8');
  assert.match(src, /kind: 'listing-discovered'/,
    'a discovered listing URL must be persisted before it is opened');
  assert.match(src, /observations: discovered/,
    'a listing that could not be read must still record which listing it was');
  assert.match(src, /kind: 'listing-read'/);
  // Every exit that reports a state carries what was seen at it.
  const exits = src.match(/state: '(RESOLVED|UNREADABLE|PROTECTED|NO_LISTING_FOUND)'/g) || [];
  const attached = src.match(/observations:/g) || [];
  assert.ok(attached.length >= exits.length - 1,
    `${exits.length} state exits but only ${attached.length} carry observations`);
});
