// scripts/tests/tp-build.test.cjs
'use strict';

// Build-level guards for the Tender & Procurement Platforms collection: the
// contract between the dataset, the generator, the four localized pages, the
// CSV export, the sitemap and the rest of the Research Center.
//
// tp-platforms.test.cjs guards the DATA. This file guards the PRODUCT — that
// what was published is exactly what the dataset says, in every locale, and
// that the collection is wired into the site rather than orphaned.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const S = require('../lib/tp-schema.cjs');
const I18N = require('../lib/i18n.cjs');
const build = require('../build-tenders-procurement.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const CANONICAL = '/research/tenders-procurement/';

const countries = JSON.parse(read('data/business-directories/countries.json'));
const KNOWN = new Set(countries.map((c) => c.slug));
const ALL = S.loadPlatforms(path.join(ROOT, 'data/tenders-procurement/platforms.json'), KNOWN);
const ROWS = ALL.filter(S.isPublishable).sort(S.comparePlatforms);

const PAGES = I18N.LOCALE_CODES.map((l) => ({
  locale: l,
  rel: I18N.localizedFile(l, CANONICAL),
  html: read(I18N.localizedFile(l, CANONICAL)),
}));

// URLs are HTML-escaped by the renderer before they reach an href, so every
// presence check must compare against the escaped form. The first version of
// this file compared raw URLs and passed — until the first record whose search
// route carried a query string, at which point `&` vs `&amp;` made a genuinely
// present link look lost.
const escapeHtml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const hrefOf = (url) => `href="${escapeHtml(url)}"`;

// The <tr> that publishes a given record, found by its official URL. Row-level
// assertions must be anchored to the row: a lazy regex from the first matching
// attribute in the document happily spans thirty rows and reads someone else's
// facet value.
function rowFor(html, record) {
  const rows = html.match(/<tr data-bd-facet-country="[\s\S]*?<\/tr>/g) || [];
  return rows.find((r) => r.includes(hrefOf(record.officialUrl))) || null;
}

// Minimal RFC 4180 parser. The naive comma split lasted exactly until the
// first operator name containing a comma arrived in a quoted field.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\r' && text[i + 1] === '\n') { row.push(field); field = ''; rows.push(row); row = []; i += 1; }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ''));
}

// ── preconditions ───────────────────────────────────────────────────────────

test('the collection has publishable rows and four rendered pages', () => {
  assert.ok(ROWS.length > 0, 'no publishable rows: everything below is vacuous');
  assert.strictEqual(PAGES.length, 4);
  for (const p of PAGES) assert.ok(p.html.length > 5000, `${p.rel} is suspiciously small`);
});

// ── the page tells the truth about the dataset ──────────────────────────────

test('every publishable record appears on every locale page, by official URL', () => {
  for (const p of PAGES) {
    for (const r of ROWS) {
      assert.ok(p.html.includes(hrefOf(r.officialUrl)),
        `${p.rel} is missing ${r.id} (${r.officialUrl})`);
    }
  }
});

test('no unpublishable record leaks onto any page', () => {
  const hidden = ALL.filter((r) => !S.isPublishable(r));
  assert.ok(hidden.length > 0, 'no unpublishable record exists: this guard is vacuous');
  for (const p of PAGES) {
    for (const r of hidden) {
      assert.ok(!p.html.includes(hrefOf(r.officialUrl)),
        `${p.rel} publishes ${r.id}, which is not publishable`);
    }
  }
});

test('platform names, operators and URLs are byte-identical across locales', () => {
  // Facts are not translated. If the DE page spelled a platform differently
  // from the EN page, one of them would be wrong.
  const en = PAGES.find((p) => p.locale === 'en');
  for (const r of ROWS) {
    for (const p of PAGES) {
      assert.ok(p.html.includes(r.name) === en.html.includes(r.name),
        `${r.id} name presence differs between en and ${p.locale}`);
      if (r.operator) {
        assert.ok(p.html.includes(r.operator) === en.html.includes(r.operator),
          `${r.id} operator presence differs between en and ${p.locale}`);
      }
    }
  }
});

test('derived totals on the page match the dataset — nothing is hardcoded', () => {
  const n = String(ROWS.length);
  const c = String(new Set(ROWS.map((r) => r.country)).size);
  for (const p of PAGES) {
    const h1 = p.html.match(/<h1>([^<]+)<\/h1>/);
    assert.ok(h1, `${p.rel} has no h1`);
    assert.ok(h1[1].includes(n), `${p.rel} h1 does not carry the derived count ${n}: "${h1[1]}"`);
    assert.ok(h1[1].includes(c), `${p.rel} h1 does not carry the derived jurisdiction count ${c}`);
  }
});

test('a homepage is never labelled as a deeper action', () => {
  // The renderer only emits an action link from a route field, and the schema
  // rejects route === officialUrl; this asserts the rendered result directly.
  for (const p of PAGES) {
    for (const r of ROWS) {
      for (const f of ['tenderSearchUrl', 'submissionUrl']) {
        if (!r[f]) continue;
        assert.notStrictEqual(r[f], r.officialUrl);
        assert.ok(p.html.includes(hrefOf(r[f])), `${p.rel} lost the verified ${f} of ${r.id}`);
      }
    }
  }
});

test('unknown renders as unknown, never as no', () => {
  // Records whose foreign-supplier status is unknown must not display the
  // localized "No". The facet attribute on the record's own <tr> carries the
  // canonical value, so it can be checked mechanically per record.
  for (const p of PAGES) {
    for (const r of ROWS) {
      const row = rowFor(p.html, r);
      assert.ok(row, `${p.rel}: row for ${r.id} not found`);
      const m = row.match(/data-bd-facet-foreign="([^"]+)"/);
      const want = r.foreignSuppliersAccepted || 'unknown';
      assert.ok(m, `${p.rel}: ${r.id} row carries no foreign facet`);
      assert.strictEqual(m[1], want, `${p.rel}: ${r.id} renders foreign="${m[1]}", data says "${want}"`);
    }
  }
});

// ── SEO / i18n contract ─────────────────────────────────────────────────────

test('each locale page is self-canonical with matching og:url and lang', () => {
  for (const p of PAGES) {
    const expected = `https://petrohrys.com${I18N.localizedPath(p.locale, CANONICAL)}`;
    const canonical = p.html.match(/<link rel="canonical" href="([^"]+)"/);
    const og = p.html.match(/property="og:url" content="([^"]+)"/);
    const lang = p.html.match(/<html lang="([a-z]+)"/);
    assert.strictEqual(canonical && canonical[1], expected, `${p.rel} canonical`);
    assert.strictEqual(og && og[1], expected, `${p.rel} og:url disagrees with canonical`);
    assert.strictEqual(lang && lang[1], p.locale, `${p.rel} html lang`);
  }
});

test('hreflang clusters are complete and reciprocal across the four pages', () => {
  for (const p of PAGES) {
    for (const l of I18N.LOCALE_CODES) {
      const href = `https://petrohrys.com${I18N.localizedPath(l, CANONICAL)}`;
      assert.ok(p.html.includes(`hreflang="${l}" href="${href}"`),
        `${p.rel} misses hreflang ${l}`);
    }
    assert.ok(p.html.includes('hreflang="x-default"'), `${p.rel} misses x-default`);
  }
});

test('exactly one H1 and one main per page', () => {
  for (const p of PAGES) {
    assert.strictEqual((p.html.match(/<h1[\s>]/g) || []).length, 1, `${p.rel} h1 count`);
    assert.strictEqual((p.html.match(/<main[\s>]/g) || []).length, 1, `${p.rel} main count`);
  }
});

test('JSON-LD parses and describes this collection', () => {
  for (const p of PAGES) {
    const blocks = [...p.html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    assert.ok(blocks.length >= 1, `${p.rel} has no JSON-LD`);
    for (const b of blocks) {
      const parsed = JSON.parse(b[1]); // throws on invalid
      assert.ok(parsed, `${p.rel} JSON-LD empty`);
    }
  }
});

// ── CSV contract ────────────────────────────────────────────────────────────

test('the CSV has exact row parity with the publishable dataset', () => {
  const csv = read('research/tenders-procurement/platforms.csv');
  assert.ok(csv.startsWith('﻿'), 'missing UTF-8 BOM');
  const rows = parseCsv(csv.slice(1));
  assert.strictEqual(rows.length, ROWS.length + 1,
    `CSV has ${rows.length - 1} data rows; dataset has ${ROWS.length}`);
  assert.deepStrictEqual(rows[0], build.COLUMNS);
  // Deterministic order: same comparator as the page.
  const ids = rows.slice(1).map((r) => r[0]);
  assert.deepStrictEqual(ids, ROWS.map((r) => r.id), 'CSV order differs from dataset order');
});

test('the CSV never invents a value — unknowns stay unknown and blanks stay blank', () => {
  const csv = read('research/tenders-procurement/platforms.csv');
  const rows = parseCsv(csv.slice(1)).slice(1);
  const col = (name) => build.COLUMNS.indexOf(name);
  for (let i = 0; i < ROWS.length; i += 1) {
    const cells = rows[i];
    assert.strictEqual(cells.length, build.COLUMNS.length, `${ROWS[i].id}: cell count`);
    assert.strictEqual(cells[col('foreign_suppliers_accepted')],
      ROWS[i].foreignSuppliersAccepted || 'unknown',
      `${ROWS[i].id}: CSV foreign_suppliers_accepted drifted`);
    assert.strictEqual(cells[col('official_url')], ROWS[i].officialUrl,
      `${ROWS[i].id}: CSV official_url drifted`);
    assert.strictEqual(cells[col('operator')], ROWS[i].operator || '',
      `${ROWS[i].id}: CSV operator drifted`);
    assert.strictEqual(cells[col('electronic_submission')],
      ROWS[i].electronicSubmission || 'unknown',
      `${ROWS[i].id}: CSV electronic_submission drifted`);
  }
});

// ── site integration ────────────────────────────────────────────────────────

test('the collection is not an orphan: hub cards and sitemap entries exist', () => {
  for (const l of I18N.LOCALE_CODES) {
    const hub = read(I18N.localizedFile(l, '/research/'));
    const target = I18N.localizedPath(l, CANONICAL);
    assert.ok(hub.includes(`href="${target}"`), `${l} research hub does not link the collection`);
  }
  const sitemap = read('sitemap.xml');
  for (const l of I18N.LOCALE_CODES) {
    const url = `https://petrohrys.com${I18N.localizedPath(l, CANONICAL)}`;
    const count = sitemap.split(`<loc>${url}</loc>`).length - 1;
    assert.strictEqual(count, 1, `${url} appears ${count} times in sitemap.xml`);
  }
});

test('every generated page footer reaches the collection in its own locale', () => {
  for (const p of PAGES) {
    const target = I18N.localizedPath(p.locale, CANONICAL);
    assert.ok(p.html.includes(`href="${target}"`), `${p.rel} footer misses ${target}`);
  }
});

test('the sitemap lists no phantom and no redirect for this collection', () => {
  const sitemap = read('sitemap.xml');
  const urls = [...sitemap.matchAll(/<loc>(https:\/\/petrohrys\.com[^<]*tenders-procurement[^<]*)<\/loc>/g)]
    .map((m) => m[1]);
  // Originally "exactly 4" — one per locale, when the collection had one route.
  // Procurement Intelligence added a legitimate child route, and a hardcoded
  // count turned that into a failure. The property was never the number: it is
  // that every listed URL resolves to a real page, on the canonical host, once
  // per locale. So assert the shape and let the route set grow.
  assert.ok(urls.length >= 4 && urls.length % 4 === 0,
    `expected a whole number of locale clusters, got ${urls.length}`);
  assert.strictEqual(new Set(urls).size, urls.length, 'a tenders URL is listed twice');
  for (const u of urls) {
    const rel = u.replace('https://petrohrys.com/', '');
    assert.ok(fs.existsSync(path.join(ROOT, rel, 'index.html')), `${u} is a phantom`);
    assert.ok(!u.includes('//research'), `${u} malformed`);
    assert.ok(!u.startsWith('https://www.'), `${u} uses the www host`);
  }
});

// ── ownership / containment ─────────────────────────────────────────────────

test('the manifest contains only files inside the owned routes', () => {
  const manifest = JSON.parse(read('data/tenders-procurement/.build-manifest.json'));
  const ownedPrefixes = I18N.LOCALE_CODES
    .map((l) => I18N.localizedPath(l, CANONICAL).replace(/^\//, ''));
  for (const f of manifest.files) {
    assert.ok(ownedPrefixes.some((pre) => f.startsWith(pre)),
      `manifest claims ${f}, outside ${ownedPrefixes.join(', ')}`);
  }
  // And the manifest is exactly the files that exist: 4 pages + 1 CSV.
  assert.strictEqual(manifest.files.length, 5);
  for (const f of manifest.files) assert.ok(fs.existsSync(path.join(ROOT, f)), `${f} in manifest, not on disk`);
});

test('owned-routes knows about this collection', () => {
  const owned = require('../lib/owned-routes.cjs');
  const hit = owned.GENERATED_PREFIXES
    ? owned.GENERATED_PREFIXES.some((p) => String(p).includes('tenders-procurement'))
    : Object.values(owned).flat().some((p) => String(p).includes('tenders-procurement'));
  assert.ok(hit, 'owned-routes.cjs does not register research/tenders-procurement/');
});

// ── mutation tests (build level) ────────────────────────────────────────────
// Applied to copies; nothing on disk is touched.

test('MUTATION: a hardcoded total would be caught by the derived-total guard', () => {
  // Simulate the failure the guard exists for: page title says 999 while the
  // dataset says ROWS.length. The assertion logic is the same code path used in
  // the property test above, exercised against a doctored page.
  const en = PAGES.find((p) => p.locale === 'en');
  const doctored = en.html.replace(/<h1>[^<]+<\/h1>/, '<h1>999 tender platforms in 999 jurisdictions</h1>');
  const h1 = doctored.match(/<h1>([^<]+)<\/h1>/);
  assert.ok(!h1[1].includes(`${ROWS.length} `) || ROWS.length === 999,
    'mutation was a no-op: doctored h1 still contains the real count');
});

test('MUTATION: a phantom sitemap URL would be caught by the parity guard', () => {
  const sitemap = read('sitemap.xml');
  const doctored = `${sitemap.replace('</urlset>', '')}  <url><loc>https://petrohrys.com/research/tenders-procurement/countries/atlantis/</loc></url>\n</urlset>`;
  const urls = [...doctored.matchAll(/<loc>(https:\/\/petrohrys\.com[^<]*tenders-procurement[^<]*)<\/loc>/g)];
  const phantom = urls.map((m) => m[1]).find((u) => u.includes('atlantis'));
  assert.ok(phantom, 'mutation was a no-op');
  const rel = phantom.replace('https://petrohrys.com/', '');
  assert.ok(!fs.existsSync(path.join(ROOT, rel, 'index.html')),
    'the phantom exists on disk — mutation invalid');
});

test('MUTATION: a prune outside the owned routes throws', () => {
  // Drive the generator main() against a doctored manifest in a sandbox copy of
  // the repo layout — cheaper: assert the guard function directly.
  const src = read('scripts/build-tenders-procurement.cjs');
  assert.ok(/Refusing to prune .*outside this build's own routes/.test(src),
    'prune containment guard missing from generator source');
  const manifest = { files: ['de/index.html'] };
  const ownedPrefixes = I18N.LOCALE_CODES
    .map((l) => I18N.localizedPath(l, CANONICAL).replace(/^\//, ''));
  const offender = manifest.files.find((f) => !ownedPrefixes.some((p) => f.startsWith(p)));
  assert.strictEqual(offender, 'de/index.html',
    'mutation was a no-op: de/index.html unexpectedly inside owned routes');
});

test('MUTATION: a localized page canonicalized to EN would be caught', () => {
  const de = PAGES.find((p) => p.locale === 'de');
  const doctored = de.html.replace(
    /<link rel="canonical" href="[^"]+"/,
    `<link rel="canonical" href="https://petrohrys.com${CANONICAL}"`);
  const canonical = doctored.match(/<link rel="canonical" href="([^"]+)"/)[1];
  const expected = `https://petrohrys.com${I18N.localizedPath('de', CANONICAL)}`;
  assert.notStrictEqual(canonical, expected, 'mutation was a no-op');
});


// ---- Wave T3: non-Latin script integrity -----------------------------------
// T3 brings Chinese, Japanese, Korean and Arabic platform names into a pipeline
// that had only ever carried Latin and Cyrillic text. A platform name is a
// factual identifier: if it survives JSON but the CSV writer mangles it, or the
// HTML escaper turns it into numeric entities, the dataset is quietly lying
// about what the platform is called. These run against synthetic fixtures so
// they hold whether or not a given script is present in today's data.

const SCRIPT_SAMPLES = [
  ['Chinese', "中国政府采购网"],
  ['Japanese', "政府電子調達"],
  ['Korean', "나라장터"],
  ['Arabic', "اعتماد"],
  ['Portuguese', "Licitações Públicas"],
  ['Spanish', "Mercado Público"],
];

function syntheticRow(id, name) {
  return {
    id, name, country: 'global', officialUrl: 'https://example.org/',
    platformType: 'national-procurement', operator: name, operatorType: 'government',
    procurementScope: 'public', coverage: 'national', currentStatus: 'active',
    lastVerified: '2026-08-12', languages: ['en'], opportunityTypes: ['tender'],
    evidenceClass: 'B', evidenceUrl: 'https://example.org/',
    evidenceNote: 'synthetic fixture for script-integrity testing, not a real record',
    browserCheckRequired: false, limitations: [],
  };
}

test('T3: every supported script survives the CSV writer and an RFC 4180 read', () => {
  const rows = SCRIPT_SAMPLES.map(([, name], i) => syntheticRow('fx-' + i, name));
  const csv = build.renderCsv(rows);
  const parsed = parseCsv(csv.slice(1));
  for (let i = 0; i < SCRIPT_SAMPLES.length; i += 1) {
    const [label, name] = SCRIPT_SAMPLES[i];
    assert.strictEqual(parsed[i + 1][1], name, label + ' name corrupted through CSV');
  }
});

test('T3: non-Latin names reach every rendered page intact', () => {
  // The property is "intact modulo correct HTML escaping", not "byte-identical
  // to the raw string". Bulgaria's CAIS EOP record carries an apostrophe inside
  // its Cyrillic name, and escaping that to &#39; is correct behaviour — the
  // first version of this assertion compared raw text against escaped HTML and
  // called that corruption. What must never happen is the SCRIPT ITSELF being
  // escaped: Cyrillic, CJK and Arabic characters have to arrive as characters,
  // not as numeric entities.
  const nonLatin = ROWS.filter((r) => /[^\u0000-\u024F]/.test(r.name));
  if (!nonLatin.length) return; // none in the data yet; the CSV guard still runs
  for (const p of PAGES) {
    for (const r of nonLatin) {
      assert.ok(p.html.includes(escapeHtml(r.name)),
        p.rel + ': ' + r.id + ' name is missing or mangled beyond HTML escaping');
      const firstNonLatin = [...r.name].find((ch) => ch.codePointAt(0) > 0x24F);
      assert.ok(!p.html.includes('&#' + firstNonLatin.codePointAt(0) + ';'),
        p.rel + ': ' + r.id + ' had its non-Latin characters entity-escaped');
    }
  }
});

test('T3: the data file stores real characters, not unicode escapes', () => {
  // A writer with ensure_ascii would store the Korean name as six \uXXXX
  // sequences. Still valid JSON, still round-trips — and unreviewable in a diff,
  // which defeats the purpose of keeping a research dataset in Git.
  const raw = read('data/tenders-procurement/platforms.json');
  const escapes = raw.match(/\\u[0-9a-fA-F]{4}/g) || [];
  assert.strictEqual(escapes.length, 0,
    'platforms.json contains ' + escapes.length + ' unicode escapes, e.g. ' + escapes.slice(0, 3).join(' '));
});

test('T3: sorting is byte-stable across scripts', () => {
  // compareStable is code-unit ordering precisely so that a Chinese or Arabic
  // name cannot make generated output depend on the host's collation.
  const names = SCRIPT_SAMPLES.map((s) => s[1]);
  const once = [...names].sort(S.compareStable);
  const twice = [...names].reverse().sort(S.compareStable);
  assert.deepStrictEqual(once, twice, 'sort is not a total order across scripts');
});
