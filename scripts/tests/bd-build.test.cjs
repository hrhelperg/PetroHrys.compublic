// scripts/tests/bd-build.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { buildAll, pageModel, BuildError, MANIFEST_FILE, SECTION_DIR } = require('../build-business-directories.cjs');
const { loadRegistry } = require('../lib/bd-registry.cjs');
const { PATHS } = require('../lib/bd-util.cjs');
const { verifiedRecord, factors } = require('./helpers/fixtures.cjs');
const { computeScore } = require('../lib/bd-schema.cjs');

const HUB = path.join(SECTION_DIR, 'index.html');
const REF_COUNTRY = path.join(SECTION_DIR, 'united-states', 'index.html');
const REF_CATEGORY = path.join(SECTION_DIR, 'united-states', 'categories', 'general-business', 'index.html');
const SAAS = path.join(SECTION_DIR, 'united-states', 'categories', 'saas', 'index.html');
const DETAIL = path.join(SECTION_DIR, 'united-states', 'ok-dir', 'index.html');
const GERMANY = path.join(SECTION_DIR, 'germany', 'index.html');
const SITEMAP = 'sitemap-business-directories.xml';

function fixture(byCountry = {}) {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bd-d-'));
  const outRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bd-o-'));
  fs.copyFileSync(path.join(PATHS.dataRoot, 'countries.json'), path.join(dataRoot, 'countries.json'));
  fs.copyFileSync(path.join(PATHS.dataRoot, 'categories.json'), path.join(dataRoot, 'categories.json'));
  fs.mkdirSync(path.join(dataRoot, 'directories'));
  fs.mkdirSync(path.join(outRoot, 'data', 'business-directories'), { recursive: true });
  for (const country of JSON.parse(fs.readFileSync(path.join(dataRoot, 'countries.json'), 'utf8'))) {
    writeDirs(dataRoot, country.slug, byCountry[country.slug] || []);
  }
  return { dataRoot, outRoot };
}

function writeDirs(dataRoot, slug, entries) {
  fs.writeFileSync(path.join(dataRoot, 'directories', `${slug}.json`), `${JSON.stringify(entries, null, 2)}\n`);
}

const rec = (over = {}) => verifiedRecord({ id: 'us-ok', name: 'Ok Directory', slug: 'ok-dir',
  website: 'https://ok.example', lastVerified: null, nextVerification: null,
  scoreFactors: null, petroHrysScore: null,
  verification: { status: 'unverified', source: null, reviewers: [] }, ...over });

// A record that satisfies every clause of the meaningful-content contract, so
// its page is indexable and therefore reaches the sitemap.
const indexableRec = (over = {}) => rec({
  lastVerified: '2026-08-01',
  nextVerification: '2027-05-01',
  scoreFactors: factors(8),
  petroHrysScore: computeScore(factors(8)),
  verification: { status: 'verified', source: 'official-website', reviewers: [{ id: 'p', name: 'P', role: 'editor' }] },
  pros: ['Useful'],
  bestFor: ['Software vendors'],
  ...over,
});

const has = (outRoot, rel) => fs.existsSync(path.join(outRoot, rel));
const read = (outRoot, rel) => fs.readFileSync(path.join(outRoot, rel), 'utf8');

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

const fingerprint = (outRoot) => walk(path.join(outRoot, SECTION_DIR))
  .sort()
  .map((f) => `${path.relative(outRoot, f)}:${crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')}`)
  .join('|');

// --- emission policy --------------------------------------------------------

test('the lean scaffold is exactly two pages when there is no data', () => {
  const { dataRoot, outRoot } = fixture();
  const result = buildAll({ dataRoot, outRoot });
  // The hub and the reference country, plus the guides index and the
  // methodology guides, which stand on their own and depend on no record.
  // The reference CATEGORY is no longer force-emitted: a category with zero
  // verified records must not be published at all, so an empty dataset now
  // yields two directory pages rather than three.
  const guides = walk(path.join(outRoot, SECTION_DIR, 'guides')).filter((f) => f.endsWith('.html'));
  assert.strictEqual(result.pages - guides.length, 2);
  assert.ok(guides.length > 0, 'methodology guides should still be emitted');
  assert.ok(has(outRoot, HUB));
  assert.ok(has(outRoot, REF_COUNTRY));
  assert.ok(!has(outRoot, REF_CATEGORY), 'an empty category is never published');
  assert.ok(!has(outRoot, GERMANY), 'empty non-reference country must not be emitted');
  assert.ok(!has(outRoot, SAAS), 'empty non-reference category must not be emitted');
});

test('the hub is indexable and the empty reference pages are not', () => {
  const { dataRoot, outRoot } = fixture();
  buildAll({ dataRoot, outRoot });
  assert.ok(!read(outRoot, HUB).includes('name="robots"'));
  assert.ok(read(outRoot, REF_COUNTRY).includes('noindex,follow'));
  assert.ok(!has(outRoot, REF_CATEGORY), 'the empty reference category is not emitted at all');
});

test('adding a record emits its country, category and detail pages', () => {
  const { dataRoot, outRoot } = fixture({ 'united-states': [rec()] });
  buildAll({ dataRoot, outRoot });
  assert.ok(has(outRoot, SAAS));
  assert.ok(has(outRoot, DETAIL));
  assert.ok(!read(outRoot, SAAS).includes('noindex'));
});

test('a record in a new country emits that country page', () => {
  const { dataRoot, outRoot } = fixture({ germany: [rec({ id: 'de', country: 'germany' })] });
  buildAll({ dataRoot, outRoot });
  assert.ok(has(outRoot, GERMANY));
});

// --- 1, 2: byte stability ---------------------------------------------------

test('1-2 repeated builds are byte-identical and write nothing', () => {
  const { dataRoot, outRoot } = fixture({ 'united-states': [rec()] });
  buildAll({ dataRoot, outRoot });
  const before = fingerprint(outRoot);
  const second = buildAll({ dataRoot, outRoot });
  assert.deepStrictEqual(second.written, []);
  assert.deepStrictEqual(second.removed, []);
  assert.strictEqual(fingerprint(outRoot), before);
});

// --- 3, 4: minimal rewrites -------------------------------------------------

test('3-4 only changed pages are rewritten; unchanged files keep their mtime', () => {
  const { dataRoot, outRoot } = fixture();
  buildAll({ dataRoot, outRoot });
  const times = Object.fromEntries(walk(path.join(outRoot, SECTION_DIR))
    .map((f) => [f, fs.statSync(f).mtimeMs]));
  writeDirs(dataRoot, 'united-states', [rec()]);
  const result = buildAll({ dataRoot, outRoot });
  const untouched = Object.keys(times).filter((f) => fs.existsSync(f) && fs.statSync(f).mtimeMs === times[f]);
  assert.ok(result.written.length > 0);
  assert.ok(untouched.length > 0, 'at least one unchanged file must be left alone');
});

// --- 5, 7: pruning safety ---------------------------------------------------

test('5 pruning never deletes a file the generator did not create', () => {
  const { dataRoot, outRoot } = fixture({ 'united-states': [rec()] });
  buildAll({ dataRoot, outRoot });
  const manual = path.join(outRoot, SECTION_DIR, 'manual-note.txt');
  fs.writeFileSync(manual, 'hand authored');
  writeDirs(dataRoot, 'united-states', []);
  buildAll({ dataRoot, outRoot });
  assert.ok(fs.existsSync(manual), 'hand-authored file was deleted');
});

test('7 refuses to overwrite a file it does not own', () => {
  const { dataRoot, outRoot } = fixture();
  fs.mkdirSync(path.join(outRoot, SECTION_DIR), { recursive: true });
  fs.writeFileSync(path.join(outRoot, HUB), '<p>hand authored hub</p>');
  assert.throws(() => buildAll({ dataRoot, outRoot }), (err) => {
    assert.ok(err instanceof BuildError);
    assert.ok(/Refusing to overwrite/.test(err.message), err.message);
    return true;
  });
  assert.strictEqual(read(outRoot, HUB), '<p>hand authored hub</p>', 'the file must survive untouched');
});

// --- 6: isolation -----------------------------------------------------------

test('6 every generated path is inside the section or is the section sitemap', () => {
  const { dataRoot, outRoot } = fixture({ 'united-states': [rec()] });
  buildAll({ dataRoot, outRoot });
  const manifest = JSON.parse(read(outRoot, MANIFEST_FILE));
  for (const rel of Object.keys(manifest.files)) {
    const inside = rel.startsWith(`${SECTION_DIR}${path.sep}`) || rel === SITEMAP;
    assert.ok(inside, `generated path escapes the section: ${rel}`);
  }
});

// --- 8, 9, 11: identity -----------------------------------------------------

test('8-9 canonicals and output paths are unique', () => {
  const { dataRoot } = fixture({ 'united-states': [rec()] });
  const pages = pageModel(loadRegistry(dataRoot));
  const canonicals = pages.map((p) => p.meta.canonical);
  const outPaths = pages.map((p) => p.outPath);
  assert.strictEqual(new Set(canonicals).size, canonicals.length);
  assert.strictEqual(new Set(outPaths).size, outPaths.length);
});

test('11 every emitted file maps to exactly one owner', () => {
  const { dataRoot, outRoot } = fixture({ 'united-states': [rec()] });
  buildAll({ dataRoot, outRoot });
  const owners = Object.values(JSON.parse(read(outRoot, MANIFEST_FILE)).files);
  assert.strictEqual(new Set(owners).size, owners.length, `duplicate owner: ${owners}`);
  assert.ok(owners.includes('directory:us-ok'));
});

// --- 10: sitemap integrity --------------------------------------------------

test('10 the sitemap only references pages that were generated', () => {
  const { dataRoot, outRoot } = fixture({ 'united-states': [rec({ lastVerified: '2026-08-01',
    nextVerification: '2027-08-01',
    verification: { status: 'verified', source: 'official-website',
      reviewers: [{ id: 'p', name: 'P', role: 'editor' }] } })] });
  buildAll({ dataRoot, outRoot });
  const canonicals = new Set(pageModel(loadRegistry(dataRoot)).map((p) => p.meta.canonical));
  const locs = [...read(outRoot, SITEMAP).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.ok(locs.length > 0);
  for (const loc of locs) assert.ok(canonicals.has(loc), `sitemap references ungenerated ${loc}`);
});

test('10 the sitemap never lists a noindex page', () => {
  const { dataRoot, outRoot } = fixture();
  buildAll({ dataRoot, outRoot });
  const xml = read(outRoot, SITEMAP);
  assert.ok(!xml.includes('/united-states/'), 'empty reference pages must stay out of the sitemap');
  const locs = (xml.match(/<loc>/g) || []).length;
  const guides = walk(path.join(outRoot, SECTION_DIR, 'guides')).filter((f) => f.endsWith('.html'));
  assert.strictEqual(locs - guides.length, 1, 'only the hub, beyond the guides');
});

// --- 12, 13: pruning correctness --------------------------------------------

test('12-13 removing the last record prunes only its dependents', () => {
  const { dataRoot, outRoot } = fixture({ 'united-states': [rec()] });
  buildAll({ dataRoot, outRoot });
  assert.ok(has(outRoot, SAAS) && has(outRoot, DETAIL));

  writeDirs(dataRoot, 'united-states', []);
  const result = buildAll({ dataRoot, outRoot });

  assert.ok(!has(outRoot, SAAS), 'stale category page survived');
  assert.ok(!has(outRoot, DETAIL), 'stale detail page survived');
  assert.ok(has(outRoot, HUB), 'hub must survive');
  assert.ok(has(outRoot, REF_COUNTRY), 'reference country must survive');
  assert.ok(!has(outRoot, REF_CATEGORY), 'an emptied category is pruned, not kept as a scaffold');
  // The two directory pages, plus any list guide that no longer has records to
  // list. A guide with nothing in it is correctly pruned rather than published
  // empty, so the count is asserted as a floor and by membership.
  assert.ok(result.removed.includes(SAAS), 'stale category page not reported');
  assert.ok(result.removed.includes(DETAIL), 'stale detail page not reported');
  assert.ok(result.removed.every((f) => f !== HUB && f !== REF_COUNTRY));
});

test('13 no orphan page survives a full data removal', () => {
  const { dataRoot, outRoot } = fixture({ 'united-states': [rec()], germany: [rec({ id: 'de', country: 'germany', slug: 'de-dir' })] });
  buildAll({ dataRoot, outRoot });
  writeDirs(dataRoot, 'united-states', []);
  writeDirs(dataRoot, 'germany', []);
  buildAll({ dataRoot, outRoot });
  // Guides are excluded: the methodology guides stand alone and are correctly
  // still present after every directory record is removed.
  const remaining = walk(path.join(outRoot, SECTION_DIR))
    .map((f) => path.relative(outRoot, f))
    .filter((f) => !f.split(path.sep).includes('guides'))
    .sort();
  assert.deepStrictEqual(remaining, [
    path.join(SECTION_DIR, 'feed.xml'),
    HUB,
    REF_COUNTRY,
  ].sort());
});

// --- 14: fail before writing ------------------------------------------------

test('14 a validator failure aborts the build with nothing written', () => {
  const { dataRoot, outRoot } = fixture();
  buildAll({ dataRoot, outRoot });
  const before = fingerprint(outRoot);
  // Passes the loader (real country/category, safe slug, https) but fails the
  // validator: out of range and populated while unverified.
  writeDirs(dataRoot, 'united-states', [rec({ domainRating: 900, lastVerified: '2026-08-01',
    metricStatus: 'measured',
    metricsProvenance: { domainRating: { provider: 'Ahrefs', measuredAt: '2026-08-01' } } })]);
  assert.throws(() => buildAll({ dataRoot, outRoot }), (err) => {
    assert.ok(err instanceof BuildError);
    assert.ok(/refusing to build/i.test(err.message), err.message);
    return true;
  });
  assert.strictEqual(fingerprint(outRoot), before, 'the site changed despite a failed build');
});

test('14 a loader failure also aborts before any write', () => {
  const { dataRoot, outRoot } = fixture();
  buildAll({ dataRoot, outRoot });
  const before = fingerprint(outRoot);
  writeDirs(dataRoot, 'united-states', [rec({ category: 'not-a-category' })]);
  assert.throws(() => buildAll({ dataRoot, outRoot }));
  assert.strictEqual(fingerprint(outRoot), before);
});

// --- 15: transactional ------------------------------------------------------

test('15 a dry run stages and validates a full tree without writing', () => {
  const { dataRoot, outRoot } = fixture({ 'united-states': [rec()] });
  const result = buildAll({ dataRoot, outRoot, dryRun: true });
  assert.ok(result.staged > 0);
  assert.deepStrictEqual(result.written, []);
  assert.strictEqual(walk(path.join(outRoot, SECTION_DIR)).length, 0, 'dry run must write nothing');
});

test('15 staging directories are always cleaned up', () => {
  // Asserts on the specific directory this build created, not on a count of
  // bd-stage-* in the shared tmpdir: node --test runs files in parallel, so a
  // concurrent build's staging directory would make a global count flaky.
  const { dataRoot, outRoot } = fixture();
  const dry = buildAll({ dataRoot, outRoot, dryRun: true });
  assert.ok(dry.stageDir, 'a dry run should report the directory it staged into');
  assert.ok(!fs.existsSync(dry.stageDir), 'the staging directory it created was not removed');
  buildAll({ dataRoot, outRoot });
  assert.ok(!fs.existsSync(dry.stageDir));
});

// --- content correctness ----------------------------------------------------

test('every FAQ question in the JSON-LD is visible on the page', () => {
  const { dataRoot, outRoot } = fixture();
  buildAll({ dataRoot, outRoot });
  for (const rel of [HUB, REF_COUNTRY]) {
    const html = read(outRoot, rel);
    const block = html.match(/<script type="application\/ld\+json">\n([\s\S]*?)\n  <\/script>/);
    const graph = JSON.parse(block[1].replace(/\\u003c/g, '<').replace(/\\u003e/g, '>'))['@graph'];
    const faq = graph.find((n) => n['@type'] === 'FAQPage');
    assert.ok(faq, `${rel} has no FAQPage`);
    const body = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
    for (const entry of faq.mainEntity) {
      const question = entry.name.replace(/&/g, '&amp;');
      assert.ok(body.includes(question), `${rel}: FAQ question not visible: ${entry.name}`);
    }
  }
});

test('no generated page contains the bing placeholder or a www url', () => {
  const { dataRoot, outRoot } = fixture({ 'united-states': [rec()] });
  buildAll({ dataRoot, outRoot });
  for (const file of walk(path.join(outRoot, SECTION_DIR))) {
    const text = fs.readFileSync(file, 'utf8');
    assert.ok(!text.includes('PASTE_YOUR_BING'), `${file} carries the placeholder`);
    assert.ok(!/https:\/\/www\.petrohrys\.com/.test(text),
      `${file} carries a www url; production 301-redirects www to the apex`);
  }
});

test('the RSS feed is a valid empty channel until a record is verified', () => {
  const { dataRoot, outRoot } = fixture();
  buildAll({ dataRoot, outRoot });
  const xml = read(outRoot, path.join(SECTION_DIR, 'feed.xml'));
  assert.ok(xml.includes('<channel>'));
  assert.ok(!xml.includes('<item>'));
});

test('a verified record appears in both the feed and the sitemap', () => {
  const { dataRoot, outRoot } = fixture({ 'united-states': [indexableRec()] });
  buildAll({ dataRoot, outRoot });
  assert.ok(read(outRoot, path.join(SECTION_DIR, 'feed.xml')).includes('<item>'));
  assert.ok(read(outRoot, SITEMAP).includes('/united-states/ok-dir/'));
});

test('a record failing the meaningful-content contract is noindex and off the sitemap', () => {
  // Thin means the evidence package itself is incomplete — here, no pros and no
  // cons, so the page asserts nothing a reader could not get from the country
  // table. Curated relations are deliberately NOT part of this test: a record
  // with none is a gap in cross-referencing, not a thin page. The page and all
  // its links survive; it just leaves the index.
  const thin = indexableRec({ pros: [], cons: [] });
  const { dataRoot, outRoot } = fixture({ 'united-states': [thin] });
  buildAll({ dataRoot, outRoot });
  assert.ok(has(outRoot, DETAIL), 'the page is still published');
  assert.ok(read(outRoot, DETAIL).includes('noindex,follow'));
  assert.ok(!read(outRoot, SITEMAP).includes('/united-states/ok-dir/'),
    'the sitemap must equal the indexable set');
});
