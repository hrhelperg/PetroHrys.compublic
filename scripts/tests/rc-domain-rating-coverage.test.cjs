'use strict';

// Does the reader actually SEE the rating that was measured?
//
// This file exists because "2896 of 2896 targets measured" was true, reported,
// and useless. Every canonical file carried a rating; the Business Directories
// worklist rendered 77 of 1610 rows with one. The loader that turns an
// opportunity record into a renderable one hard-coded `domainRating: null`,
// written back when an operational row was forbidden to carry a rating at all,
// and nothing downstream noticed because nothing downstream compared the two.
//
// So the tests here deliberately do NOT ask the findings ledger whether the API
// succeeded. They walk canonical records through to the generated markup a
// browser will read, and fail on any gap between them.

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '..', '..');
const S = require(path.join(ROOT, 'scripts/lib/bd-schema.cjs'));
const INV = require(path.join(ROOT, 'scripts/lib/rc-domain-inventory.cjs'));
const DRR = require(path.join(ROOT, 'scripts/research-domain-rating.cjs'));
const O = require(path.join(ROOT, 'js/bd-order.js'));

const decode = (v) => v
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
  .replace(/&quot;/g, '"').replace(/&#x27;|&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// Every generated page that carries interactive rows, with those rows parsed.
// A row is INTERACTIVE when it carries data attributes; the guide pages render
// static comparison tables with none, no metric columns and nothing to credit.
function interactivePages(rootRel) {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (entry.name !== 'index.html') continue;
      const html = fs.readFileSync(full, 'utf8');
      const rows = [...html.matchAll(/<tr class="bd-row"([^>]*)>/g)]
        .map(([, attrs]) => attrs)
        .filter((attrs) => /data-bd-name=/.test(attrs))
        .map((attrs) => {
          const get = (a) => {
            const m = new RegExp(`data-bd-${a}="([^"]*)"`).exec(attrs);
            return m ? decode(m[1]) : null;
          };
          return { name: get('name'), dr: get('dr'), country: get('facet-country') };
        });
      if (rows.length) out.push({ rel: path.relative(ROOT, full), html, rows });
    }
  };
  const base = path.join(ROOT, rootRel);
  if (fs.existsSync(base)) walk(base);
  return out;
}

// Canonical rating, keyed by the display name the row carries. Two directories
// legitimately share a name across countries, so the value is a SET and a row
// matches if its rating is one the corpus holds for that name.
function canonicalRatings() {
  const byName = new Map();
  for (const name of Object.keys(INV.COLLECTIONS)) {
    for (const r of INV.readCollection(name)) {
      const display = String(r.englishName || r.officialName || r.nativeName || r.name || '');
      if (!display) continue;
      if (!byName.has(display)) byName.set(display, new Set());
      byName.get(display).add(r.domainRating === null || r.domainRating === undefined
        ? null : r.domainRating);
    }
  }
  return byName;
}

// ── M2 / M3 / M10: WHAT WAS MEASURED IS WHAT IS SHOWN ───────────────────────

test('M2/M3/M10: every interactive row shows its canonical Domain Rating', () => {
  const canonical = canonicalRatings();
  const pages = interactivePages('research');
  assert.ok(pages.length > 40, `only ${pages.length} interactive pages found`);
  let checked = 0;
  const missing = [];
  const wrong = [];
  for (const page of pages) {
    for (const row of page.rows) {
      const expected = canonical.get(row.name);
      if (!expected) continue; // a row whose record this audit cannot address
      checked += 1;
      const shown = row.dr === '' || row.dr === null ? null : Number(row.dr);
      if (shown === null && [...expected].some((v) => v !== null)) {
        missing.push(`${page.rel}: ${row.name} shows nothing, corpus has ${[...expected].join('/')}`);
      } else if (shown !== null && !expected.has(shown)) {
        wrong.push(`${page.rel}: ${row.name} shows ${shown}, corpus has ${[...expected].join('/')}`);
      }
    }
  }
  assert.ok(checked > 2000, `only ${checked} rows reconciled`);
  assert.deepStrictEqual(missing.slice(0, 5), [],
    `${missing.length} row(s) render blank for a measured record`);
  assert.deepStrictEqual(wrong.slice(0, 5), [],
    `${wrong.length} row(s) render a rating the corpus does not hold`);
});

test('M11: the opportunity loader carries the rating instead of nulling it', () => {
  // The exact defect. normalise() built a renderable record with
  // `domainRating: null` hard-coded, so a measured value could not survive the
  // trip from canonical JSON to the page.
  const O2 = require(path.join(ROOT, 'scripts/lib/bd-opportunities.cjs'));
  const shaped = O2.normalise({
    id: 'x', name: 'X', website: 'https://x.test/', country: 'germany',
    category: 'general', tier: 'tier2', priority: 'P3', currentStatus: 'active',
    domainRating: 61,
    metricsProvenance: { domainRating: {
      provider: 'Ahrefs', measuredAt: '2026-08-19', status: 'publicApiReading', measuredDomain: 'x.test',
    } },
  });
  assert.strictEqual(shaped.domainRating, 61, 'the loader discarded a measured rating');
  assert.strictEqual(shaped.metricsProvenance.domainRating.provider, 'Ahrefs',
    'the loader discarded the provenance');
  // And a record with no rating still normalises to null, never to 0.
  const bare = O2.normalise({ id: 'y', name: 'Y', website: 'https://y.test/', country: 'germany' });
  assert.strictEqual(bare.domainRating, null);
  assert.notStrictEqual(bare.domainRating, 0);
});

// ── M4: A MEASURED ZERO IS A NUMBER ─────────────────────────────────────────

test('M4: a measured 0 survives every truthiness check on the way to the page', () => {
  const zeros = [];
  for (const name of Object.keys(INV.COLLECTIONS)) {
    for (const r of INV.readCollection(name)) if (r.domainRating === 0) zeros.push(r);
  }
  assert.ok(zeros.length > 0, 'the corpus holds no measured zero, so this guard is vacuous');
  // In the markup: the attribute reads "0", not "".
  const worklist = fs.readFileSync(
    path.join(ROOT, 'research/business-directories/opportunities/index.html'), 'utf8');
  const zeroRows = [...worklist.matchAll(/data-bd-dr="0"/g)].length;
  assert.ok(zeroRows > 0, 'no row carries a Domain Rating of 0; `if (dr)` swallowed them');
  // And the loader keeps it.
  const O2 = require(path.join(ROOT, 'scripts/lib/bd-opportunities.cjs'));
  assert.strictEqual(O2.normalise({ id: 'z', name: 'Z', website: 'https://z.test/', country: 'x', domainRating: 0 })
    .domainRating, 0, 'a measured zero became null in the loader');
  // The comparator treats it as the lowest measured value, not as absent.
  const order = O.sortRecords(
    [{ name: 'none', domainRating: null }, { name: 'zero', domainRating: 0 }, { name: 'low', domainRating: 5 }],
    'domain-rating-asc').map((r) => r.name);
  assert.deepStrictEqual(order, ['zero', 'low', 'none']);
});

// ── M1 / M5: THE INVENTORY IS COMPLETE, AND STAYS COMPLETE ──────────────────

test('M1: every Business Directory dataset is in the Domain Rating inventory', () => {
  // One dataset was silently omitted once already: data/business-directories
  // holds two record sets with zero ids in common, and reading only one lost
  // 1541 records. Both are named here so dropping one fails loudly.
  const names = Object.keys(INV.COLLECTIONS);
  assert.ok(names.includes('directories'), 'the curated registry is not inventoried');
  assert.ok(names.includes('directory-opportunities'), 'the opportunities corpus is not inventoried');
  const registry = INV.readCollection('directories');
  const opportunities = INV.readCollection('directory-opportunities');
  assert.ok(registry.length > 250 && opportunities.length > 1400);
  const overlap = new Set(registry.map((r) => r.id))
    .intersection ? null : registry.filter((r) => opportunities.some((o) => o.id === r.id));
  if (overlap) assert.strictEqual(overlap.length, 0, 'the two sets share ids after all');
});

test('M5: a new canonical domain cannot silently bypass coverage reporting', () => {
  const report = DRR.runCoverage();
  assert.ok(report && report.perCollection, 'the coverage report returned nothing');
  assert.deepStrictEqual(report.unmeasured, [],
    `${report.unmeasured.length} canonical target(s) have never been measured`);
  assert.deepStrictEqual(report.unapplied.slice(0, 5), [],
    `${report.unapplied.length} record(s) have a measurement that was never applied`);
  assert.deepStrictEqual(report.disagreeing.slice(0, 5), [],
    `${report.disagreeing.length} record(s) disagree with their own finding`);
  for (const [name, c] of Object.entries(report.perCollection)) {
    assert.strictEqual(c.missing, 0, `${name} has ${c.missing} record(s) with no rating`);
  }
});

// ── M6 / M7: THE TARGET IS THE RECORD'S OWN DOMAIN ──────────────────────────

test('M6: a subdomain is measured as itself, never as its apex', () => {
  assert.strictEqual(INV.normaliseDomain('https://appsource.microsoft.com/x'), 'appsource.microsoft.com');
  assert.notStrictEqual(INV.normaliseDomain('https://appsource.microsoft.com/x'), 'microsoft.com');
  // And every stored rating names the record's own host.
  const wrong = [];
  for (const [name, C] of Object.entries(INV.COLLECTIONS)) {
    for (const r of INV.readCollection(name)) {
      const p = (r.metricsProvenance || {}).domainRating;
      if (!p) continue;
      const own = INV.normaliseDomain(r[C.urlField]);
      if (own && p.measuredDomain !== own) wrong.push(`${name}:${r.id} → ${p.measuredDomain} (own ${own})`);
    }
  }
  assert.deepStrictEqual(wrong.slice(0, 5), [], `${wrong.length} record(s) borrow another domain's rating`);
});

test('M7: every record on one domain receives that domain’s rating', () => {
  const inv = INV.inventory();
  const byTarget = new Map();
  for (const [name, C] of Object.entries(INV.COLLECTIONS)) {
    for (const r of INV.readCollection(name)) {
      const target = INV.normaliseDomain(r[C.urlField]);
      if (!target) continue;
      if (!byTarget.has(target)) byTarget.set(target, []);
      byTarget.get(target).push({ id: `${name}:${r.id}`, dr: r.domainRating ?? null });
    }
  }
  const shared = [...byTarget.entries()].filter(([, rs]) => rs.length > 1);
  assert.ok(shared.length > 50, `only ${shared.length} shared domains; the check is weak`);
  const disagree = [];
  for (const [target, rs] of shared) {
    const values = new Set(rs.map((r) => r.dr));
    if (values.size > 1) disagree.push(`${target}: ${rs.map((r) => `${r.id}=${r.dr}`).join(', ')}`);
  }
  assert.deepStrictEqual(disagree.slice(0, 5), [],
    `${disagree.length} domain(s) report different ratings on different records`);
  assert.ok(inv.targets.length > 2000);
});

// ── M12: ATTRIBUTION FOLLOWS THE NUMBER ─────────────────────────────────────

test('M12: every page family that shows a rating credits Ahrefs', () => {
  const offenders = [];
  let showing = 0;
  for (const root of ['research', 'de/research', 'es/research', 'fr/research']) {
    for (const page of interactivePages(root)) {
      const showsColumn = /<th[^>]*>Domain Rating<\/th>/.test(page.html);
      if (!showsColumn) continue;
      showing += 1;
      if (!page.html.includes(S.AHREFS_ATTRIBUTION.text)) offenders.push(page.rel);
      else if (!page.html.includes(`href="${S.AHREFS_ATTRIBUTION.href}"`)) offenders.push(`${page.rel} (no link)`);
    }
  }
  assert.ok(showing > 40, `only ${showing} pages render the Domain Rating column`);
  assert.deepStrictEqual(offenders.slice(0, 5), [],
    `${offenders.length} page(s) display a rating without crediting Ahrefs`);
});

// ── M9: THE EXPORT AGREES WITH THE PAGE ─────────────────────────────────────

test('M9: the exported corpus carries the rating the page shows', () => {
  const csv = path.join(ROOT, 'research/business-directories/opportunities.csv');
  if (!fs.existsSync(csv)) return;
  const text = fs.readFileSync(csv, 'utf8').replace(/^﻿/, '');
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const cols = header.split(',');
  const at = cols.indexOf('domain_rating');
  assert.ok(at !== -1, `the export has no domain_rating column: ${header}`);
  let rated = 0;
  let zero = 0;
  for (const line of lines) {
    // Only rows whose rating field is unambiguous without a full CSV parse.
    const cells = line.split(',');
    if (cells.length !== cols.length) continue;
    const v = cells[at];
    if (v === '') continue;
    assert.match(v, /^\d+$/, `a rating exported as ${JSON.stringify(v)}`);
    rated += 1;
    if (v === '0') zero += 1;
  }
  assert.ok(rated > 100, `only ${rated} exported rows carry a rating`);
  assert.ok(zero > 0, 'no measured zero survived into the export');
});
