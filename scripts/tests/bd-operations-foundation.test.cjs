'use strict';
// Batch 0 — the business-listing operations foundation.
//
// Four additive fields, sixteen geographies, one CSV, one working list, one
// tracker template. The systemic risks this file defends, in order of how much
// damage each would do:
//
//   1. Private data reaching a public file. The tracker template must stay a
//      header row; the CSV must never carry a workflow or employee column.
//   2. A count that disagrees with itself. Every number — CSV rows, the page's
//      own sentence, batch progress — derives from ONE function.
//   3. An empty page or empty artefact. Sixteen new geographies were added
//      without generating a single page, and both the page and the CSV refuse
//      to exist with zero rows.
//   4. Silent stamping. No record was rewritten to carry the new fields.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const S = require('../lib/bd-schema.cjs');
const csv = require('../lib/bd-csv.cjs');
const { loadRegistry } = require('../lib/bd-registry.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const ALL = loadRegistry().directories;
const CSV_PATH = path.join(ROOT, 'research/business-directories/opportunities.csv');
const TRACKER = path.join(ROOT, 'data/business-directories/internal-tracker.template.csv');
const OPP_PAGE = path.join(ROOT, 'research/business-directories/opportunities/index.html');

// ── 1. field vocabularies ───────────────────────────────────────────────────
test('the four operational vocabularies are exactly as approved', () => {
  assert.deepStrictEqual(S.AUDIENCE_GEOGRAPHIES, ['global', 'europe', 'european-union', 'dach',
    'nordics', 'north-america', 'united-states', 'canada', 'united-kingdom',
    'australia', 'latam', 'middle-east', 'africa', 'asia', 'india', 'japan',
    'china', 'country-specific', 'regional', 'local']);
  assert.deepStrictEqual(S.PRIORITIES, ['P1', 'P2', 'P3', 'hold', 'reject']);
  assert.deepStrictEqual(S.CURRENT_STATUSES, ['active', 'shutting-down', 'redirected', 'dormant', 'unknown']);
});

// ── 2 + 3. audience rules ───────────────────────────────────────────────────
test('audience geography rejects empty, duplicate, unknown and unsorted values', () => {
  const problems = (o) => S.operationsProblems(o).map(([f]) => f);
  // null is the honest "not established" and must pass.
  assert.deepStrictEqual(S.operationsProblems({ audienceGeography: null }), []);
  assert.deepStrictEqual(S.operationsProblems({ audienceGeography: ['dach', 'europe'] }), []);
  // [] would assert that the platform reaches nobody.
  assert.ok(problems({ audienceGeography: [] }).includes('audienceGeography'));
  assert.match(S.operationsProblems({ audienceGeography: [] })[0][1], /empty list asserts/i);
  assert.ok(problems({ audienceGeography: ['dach', 'dach'] }).includes('audienceGeography'));
  assert.ok(problems({ audienceGeography: ['neverland'] }).includes('audienceGeography'));
  // Deterministic order, so two records with the same audience serialise alike.
  assert.ok(problems({ audienceGeography: ['europe', 'dach'] }).includes('audienceGeography'));
  assert.ok(problems({ audienceGeography: 'dach' }).includes('audienceGeography'));
});

test('audience is never inferred from the platform country', () => {
  // Nothing was backfilled, so no record may carry an audience derived from
  // where its operator sits. If a later batch populates these, it must do so
  // from evidence about the audience, not by copying the country.
  for (const r of ALL) {
    if (!Array.isArray(r.audienceGeography)) continue;
    assert.notDeepStrictEqual(r.audienceGeography, [r.country],
      `${r.id} audience looks mechanically copied from its country`);
  }
});

test('priority, current status and public profile enforce their contracts', () => {
  const problems = (o) => S.operationsProblems(o).map(([f]) => f);
  for (const p of S.PRIORITIES) assert.deepStrictEqual(S.operationsProblems({ priority: p }), []);
  assert.ok(problems({ priority: 'P4' }).includes('priority'));
  assert.ok(problems({ priority: 'urgent' }).includes('priority'));
  for (const c of S.CURRENT_STATUSES) assert.deepStrictEqual(S.operationsProblems({ currentStatus: c }), []);
  assert.ok(problems({ currentStatus: 'alive' }).includes('currentStatus'));
  for (const v of [true, false, null]) assert.deepStrictEqual(S.operationsProblems({ publicProfileAvailable: v }), []);
  assert.ok(problems({ publicProfileAvailable: 'yes' }).includes('publicProfileAvailable'));
});

test('the validator actually enforces the operational contract', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/validate-business-directories.cjs'), 'utf8');
  assert.match(src, /S\.operationsProblems\(/, 'the validator no longer calls the shared contract');
});

// ── 4 + 5 + 6. the single actionable definition ─────────────────────────────
test('the actionable set has exactly one definition and it excludes what it should', () => {
  const gov = S.isGovernmentPillar;
  const base = { website: 'https://example.org/', category: 'local-business' };
  assert.strictEqual(S.isActionableOpportunity({ ...base }, gov), true);
  // Government records are a different pillar and a different question.
  assert.strictEqual(S.isActionableOpportunity({ ...base, category: 'government' }, gov), false);
  assert.strictEqual(S.isActionableOpportunity({ ...base, priority: 'reject' }, gov), false);
  for (const st of ['shutting-down', 'dormant', 'redirected']) {
    assert.strictEqual(S.isActionableOpportunity({ ...base, currentStatus: st }, gov), false,
      `${st} must not be actionable`);
  }
  // hold is NOT excluded: it is still a real opportunity, just not ready.
  assert.strictEqual(S.isActionableOpportunity({ ...base, priority: 'hold' }, gov), true);
  assert.strictEqual(S.isActionableOpportunity({ ...base, website: 'http://example.org/' }, gov), false);
  assert.strictEqual(S.isActionableOpportunity({ ...base, website: null }, gov), false);
});

test('every published count derives from that one function', () => {
  const actionable = csv.actionableOpportunities(ALL);
  // No government record may reach the working list.
  for (const r of actionable) {
    assert.ok(!S.isGovernmentPillar(r), `${r.id} is a government record in the opportunity set`);
  }
  // The page states the count in prose; it must be the same number.
  const body = fs.readFileSync(OPP_PAGE, 'utf8').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.ok(body.includes(`${actionable.length} platforms are listed`),
    `the page does not state the derived count of ${actionable.length}`);
});

// ── 12 + 13. CSV parity and content ─────────────────────────────────────────
test('the CSV contains exactly the actionable set, and nothing else', () => {
  const raw = fs.readFileSync(CSV_PATH, 'utf8');
  const lines = raw.replace(/^﻿/, '').split('\r\n').filter((l) => l.length);
  const rows = lines.slice(1);
  const actionable = csv.actionableOpportunities(ALL);
  assert.strictEqual(rows.length, actionable.length,
    `CSV has ${rows.length} rows for ${actionable.length} actionable opportunities`);
  const ids = rows.map((l) => l.split(',')[0]);
  assert.deepStrictEqual(ids, actionable.map((r) => r.id), 'CSV row order is not the derived order');
});

test('the CSV opens correctly in a spreadsheet', () => {
  const raw = fs.readFileSync(CSV_PATH, 'utf8');
  assert.ok(raw.startsWith('﻿'), 'the CSV has no UTF-8 BOM; Excel will mis-render accents');
  assert.ok(raw.includes('\r\n'), 'the CSV does not use RFC 4180 line endings');
  const header = raw.replace(/^﻿/, '').split('\r\n')[0];
  assert.deepStrictEqual(header.split(','), csv.COLUMNS, 'the CSV column order changed');
});

test('CSV escaping survives commas, quotes and line breaks', () => {
  assert.strictEqual(csv.csvField('plain'), 'plain');
  assert.strictEqual(csv.csvField('a,b'), '"a,b"');
  assert.strictEqual(csv.csvField('say "hi"'), '"say ""hi"""');
  assert.strictEqual(csv.csvField('line\nbreak'), '"line\nbreak"');
  assert.strictEqual(csv.csvField(null), '');
  assert.strictEqual(csv.csvField(undefined), '');
  // Every field in the real file must be balanced, or a spreadsheet will
  // silently merge rows.
  const raw = fs.readFileSync(CSV_PATH, 'utf8').replace(/^﻿/, '');
  for (const line of raw.split('\r\n').filter(Boolean)) {
    assert.strictEqual((line.match(/"/g) || []).length % 2, 0,
      `unbalanced quoting would corrupt this row: ${line.slice(0, 80)}`);
  }
});

test('the CSV sort is deterministic and locale-independent', () => {
  const a = csv.renderCsv(ALL);
  const b = csv.renderCsv(ALL.slice().reverse());
  assert.strictEqual(a, b, 'CSV output depends on input array order');
  // localeCompare would make the file differ across machines. Match the CALL,
  // not the word: both files mention it in comments explaining why it is banned,
  // and a guard that fails on its own rationale proves nothing.
  for (const f of ['scripts/lib/bd-csv.cjs', 'scripts/lib/bd-schema.cjs']) {
    assert.ok(!/\.localeCompare\s*\(/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')),
      `${f} calls localeCompare, which is not reproducible across hosts`);
  }
});

test('the CSV carries no internal or private column', () => {
  const raw = fs.readFileSync(CSV_PATH, 'utf8');
  const header = raw.replace(/^﻿/, '').split('\r\n')[0].toLowerCase();
  for (const forbidden of csv.FORBIDDEN_COLUMNS) {
    assert.ok(!header.split(',').includes(forbidden),
      `the public CSV exposes an internal column: ${forbidden}`);
  }
  assert.ok(!/@[a-z0-9.-]+\.[a-z]{2,}/i.test(raw), 'the CSV contains something shaped like an email address');
});

// ── 18 + 19. tracker privacy ────────────────────────────────────────────────
test('the internal tracker template is a header row and nothing else', () => {
  const raw = fs.readFileSync(TRACKER, 'utf8');
  const lines = raw.split('\n').filter((l) => l.trim().length);
  assert.strictEqual(lines.length, 1,
    `the tracker template has ${lines.length} lines; a committed data row would publish employee work`);
  assert.deepStrictEqual(lines[0].trim().split(','), ['platform_id', 'target_product',
    'assigned_to', 'workflow_status', 'submitted_at', 'published_profile_url',
    'follow_up_date', 'internal_note']);
});

test('no credential or personal data is committed anywhere in the operations layer', () => {
  const SECRET = /(?:password|passwd|api[_-]?key|secret|bearer\s|authorization:|client_secret|private[_-]key)/i;
  for (const f of [TRACKER, CSV_PATH, path.join(ROOT, 'scripts/lib/bd-csv.cjs')]) {
    const raw = fs.readFileSync(f, 'utf8');
    // The csv lib legitimately NAMES forbidden columns in order to ban them.
    const scan = f.endsWith('bd-csv.cjs') ? raw.replace(/FORBIDDEN_COLUMNS[\s\S]*?\];/, '') : raw;
    assert.ok(!SECRET.test(scan), `${path.basename(f)} contains something shaped like a credential`);
  }
});

// ── 20 + 21. geography without empty pages ──────────────────────────────────
test('the sixteen geographies exist in data and generated no page', () => {
  const countries = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'data/business-directories/countries.json'), 'utf8'));
  const ADDED = ['netherlands', 'austria', 'switzerland', 'sweden', 'norway', 'denmark',
    'finland', 'belgium', 'portugal', 'ireland', 'new-zealand', 'singapore',
    'south-korea', 'brazil', 'mexico', 'united-arab-emirates'];
  const bySlug = new Map(countries.map((c) => [c.slug, c]));
  for (const slug of ADDED) {
    const c = bySlug.get(slug);
    assert.ok(c, `${slug} is missing from the country vocabulary`);
    assert.ok(c.name && c.titleName && c.iso2 && c.entityType, `${slug} is incompletely declared`);
    // The whole point: declared in data, absent from the site.
    assert.ok(!fs.existsSync(path.join(ROOT, 'research/business-directories', slug, 'index.html')),
      `${slug} generated an empty country page`);
  }
  // Japan already existed and must not have been duplicated.
  assert.strictEqual(countries.filter((c) => c.slug === 'japan').length, 1);
  const slugs = countries.map((c) => c.slug);
  assert.strictEqual(new Set(slugs).size, slugs.length, 'a country slug is declared twice');
});

test('a country page exists only where records exist', () => {
  const countries = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'data/business-directories/countries.json'), 'utf8'));
  for (const c of countries) {
    const has = ALL.some((r) => r.country === c.slug);
    const page = fs.existsSync(path.join(ROOT, 'research/business-directories', c.slug, 'index.html'));
    if (!has) assert.ok(!page, `${c.slug} has no records but has a page`);
  }
});

// ── the consolidated Other countries view ───────────────────────────────────
test('Other countries is one consolidated view, not sixteen thin pages', () => {
  const body = fs.readFileSync(OPP_PAGE, 'utf8');
  const text = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  // The section renders only when there is something to put in it.
  const actionable = csv.actionableOpportunities(ALL);
  const published = new Set(ALL.filter((r) => fs.existsSync(
    path.join(ROOT, 'research/business-directories', r.country, 'index.html'))).map((r) => r.country));
  const other = actionable.filter((r) => !published.has(r.country));
  if (other.length) {
    assert.ok(text.includes('Other countries'), 'the Other countries section is missing');
  }
  // And it must not claim to be exhaustive.
  assert.ok(!/\bexhaustive\b|\bcomplete list\b/i.test(text),
    'the opportunities page claims exhaustive coverage');
});

// ── 11 + 22 + 23. nothing was stamped, nothing was measured ─────────────────
test('no record was rewritten to carry the new fields', () => {
  const dir = path.join(ROOT, 'data/business-directories/directories');
  let carrying = 0;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    for (const r of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))) {
      for (const k of ['audienceGeography', 'priority', 'currentStatus', 'publicProfileAvailable']) {
        if (k in r) carrying += 1;
      }
    }
  }
  assert.strictEqual(carrying, 0,
    `${carrying} records were physically stamped with an operational field; Batch 0 adds no data`);
});

test('the foundation took no measurement and added no dependency', () => {
  const domains = new Set();
  let measured = 0;
  for (const r of ALL) {
    const p = r.metricsProvenance && r.metricsProvenance.domainRating;
    if (p && p.measuredDomain) domains.add(p.measuredDomain);
    if (r.domainRating !== null && r.domainRating !== undefined) measured += 1;
  }
  assert.strictEqual(domains.size, 64, 'the frozen measurement set changed size');
  assert.strictEqual(measured, 67, 'the number of records carrying a Domain Rating changed');

  const NETWORK = new RegExp([
    'require\\((?:.)(?:node:)?(?:https?|net|dgram|dns|tls)',
    String.raw`\bfetch\s*\(`, 'XMLHttpRequest', 'axios', 'node-fetch',
  ].join('|'));
  for (const f of ['scripts/lib/bd-csv.cjs', 'scripts/lib/bd-schema.cjs',
    'scripts/build-business-directories.cjs', 'scripts/lib/bd-migrate.cjs']) {
    assert.ok(!NETWORK.test(fs.readFileSync(path.join(ROOT, f), 'utf8')),
      `${f} introduces a network dependency into a static build`);
  }
  for (const f of ['package.json', 'package-lock.json', 'node_modules']) {
    assert.ok(!fs.existsSync(path.join(ROOT, f)), `${f} appeared; the build is dependency-free`);
  }
});

test('migration and build are idempotent with the new artefacts', () => {
  const mig = execFileSync('node', ['scripts/migrate-business-directories.cjs'], { cwd: ROOT, encoding: 'utf8' });
  assert.match(mig, /0 file\(s\) rewritten/, `migration rewrote files:\n${mig.slice(-200)}`);
  const build = execFileSync('node', ['scripts/build-business-directories.cjs'], { cwd: ROOT, encoding: 'utf8' });
  assert.match(build, /0 written, 0 pruned/, `build wrote or pruned:\n${build.slice(-200)}`);
});

// ── the working list page ───────────────────────────────────────────────────
test('the opportunities page is usable without JavaScript and links the CSV', () => {
  const html = fs.readFileSync(OPP_PAGE, 'utf8');
  // Rows must be in the HTML, not built by script.
  const rowCount = (html.match(/<tr/g) || []).length;
  assert.ok(rowCount > 10, `only ${rowCount} table rows are present in the served HTML`);
  assert.match(html, /opportunities\.csv/, 'the page does not link the CSV export');
  // Showing a Domain Rating carries an attribution obligation.
  assert.ok(html.includes('Domain Rating by Ahrefs'), 'the page shows DR without the Ahrefs attribution');
  // No employee workflow may reach public HTML.
  for (const leak of ['assigned_to', 'internal_note', 'workflow_status', 'submitted_at']) {
    assert.ok(!html.includes(leak), `the public page exposes the internal field ${leak}`);
  }
});
