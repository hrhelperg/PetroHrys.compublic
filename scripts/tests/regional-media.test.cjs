'use strict';

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const S = require('../lib/regional-media-schema.cjs');
const D = require('../lib/regional-media-discovery.cjs');
const I = require('../lib/i18n.cjs');
const BUILD = require('../build-regional-media.cjs');
const EXPAND = require('../expand-regional-media.cjs');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const countries = require(path.join(ROOT, 'data/business-directories/countries.json'));
const countrySet = new Set(countries.map((row) => row.slug));
const rows = S.loadRegionalMedia(path.join(ROOT, 'data/regional-media/regional-media.json'), countrySet);

test('the corpus is exactly four waves of schema-valid, uniquely hosted outlets', () => {
  assert.strictEqual(rows.length, EXPAND.WAVE_SIZE);
  assert.strictEqual(new Set(rows.map((row) => row.id)).size, rows.length);
  assert.strictEqual(new Set(rows.map((row) => S.normaliseHost(row.website))).size, rows.length);
  assert.ok(rows.every(S.isActionable));
});

test('wave history proves four immutable, append-only waves', () => {
  const history = JSON.parse(read('data/regional-media/.wave-history.json'));
  assert.deepStrictEqual(history.waves.map(({ id, count }) => ({ id, count })), [
    { id: 'wave-1', count: 300 },
    { id: 'wave-2', count: 500 },
    { id: 'wave-3', count: 300 },
    { id: 'wave-4', count: EXPAND.EXPANSION_SIZE },
  ]);
  assert.strictEqual(300 + 500 + 300, EXPAND.BASELINE_SIZE);
  assert.strictEqual(history.waves.reduce((n, wave) => n + wave.count, 0), EXPAND.WAVE_SIZE);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const seen = new Set();
  for (const wave of history.waves) {
    for (const [id, expectedHash] of Object.entries(wave.recordHashes)) {
      assert.ok(byId.has(id), `${id}: wave record is missing`);
      assert.ok(!seen.has(id), `${id}: assigned to more than one wave`);
      const actualHash = crypto.createHash('sha256')
        .update(JSON.stringify(byId.get(id))).digest('hex');
      assert.strictEqual(actualHash, expectedHash, `${id}: published wave record changed`);
      seen.add(id);
    }
  }
  assert.strictEqual(seen.size, rows.length);

  const waveTwoIds = new Set(Object.keys(history.waves[1].recordHashes));
  const regionCounts = rows.filter((row) => waveTwoIds.has(row.id)).reduce((counts, row) => {
    counts[row.macroRegion] = (counts[row.macroRegion] || 0) + 1;
    return counts;
  }, {});
  assert.ok(regionCounts.europe > regionCounts['north-america']);
  assert.ok(regionCounts['north-america'] >= 140);
  assert.ok(regionCounts.oceania >= 45);
  assert.ok(regionCounts.asia >= 30);

  const waveThreeIds = new Set(Object.keys(history.waves[2].recordHashes));
  const waveThree = rows.filter((row) => waveThreeIds.has(row.id));
  const waveThreeRegions = waveThree.reduce((counts, row) => {
    counts[row.macroRegion] = (counts[row.macroRegion] || 0) + 1;
    return counts;
  }, {});
  assert.strictEqual(waveThree.length, 300);
  assert.ok(waveThreeRegions['north-america'] >= 200);
  assert.ok(waveThreeRegions.oceania >= 60);
  assert.ok(waveThreeRegions['latin-america-caribbean'] >= 15);
  assert.ok(new Set(waveThree.map((row) => row.country)).size >= 10);
  // Wave 3 is checked against the rule it was PUBLISHED under — no newspaper
  // archive, no shared publishing platform. `isPublisherOwnedTarget` has since
  // been tightened for wave 4 (university roots, government domains,
  // aggregators, section pages), and asserting the new rule here would either
  // fail on records the append-only contract forbids editing or force the new
  // rule to be watered down to match old data. The stricter gate is asserted
  // on wave 4, where it actually governed selection, and the wave 1-3 records
  // that would not pass it today are recorded in
  // docs/followup-regional-media-legacy-hosts.md.
  assert.ok(waveThree.every((row) => {
    const host = S.normaliseHost(row.website);
    return host && !D.isArchiveHost(host) && !D.isSharedPublishingHost(host)
      && !D.isSocialHost(host);
  }), 'wave 3 contains an archive or shared publishing platform target');
});

test('wave 4 adds its outlets under the tightened regional and publisher gates', () => {
  const history = JSON.parse(read('data/regional-media/.wave-history.json'));
  const waveFourIds = new Set(Object.keys(history.waves[3].recordHashes));
  const waveFour = rows.filter((row) => waveFourIds.has(row.id));
  assert.strictEqual(waveFour.length, EXPAND.EXPANSION_SIZE);

  // Nothing published in an earlier wave may reappear as a wave-4 record, and
  // no wave-4 host may collide with an earlier one.
  const earlier = new Set(history.waves.slice(0, 3)
    .flatMap((wave) => Object.keys(wave.recordHashes)));
  assert.ok(waveFour.every((row) => !earlier.has(row.id)));

  for (const row of waveFour) {
    const host = S.normaliseHost(row.website);
    assert.strictEqual(D.hostRejection(host, row.website), null,
      `${row.id}: ${host} is not a publisher-owned root`);
    assert.ok(Number.isInteger(row.domainRating) && row.domainRating >= EXPAND.MIN_DR, row.id);
    assert.deepStrictEqual(row.publicationRoutes, ['unknown'],
      `${row.id}: a publication route was asserted without page-level evidence`);
    assert.strictEqual(row.costModel, 'unknown', `${row.id}: a cost was asserted`);
    assert.ok(!row.backlinkType, `${row.id}: a link type was asserted`);
    assert.ok(!row.listingIndexability, `${row.id}: indexability was asserted`);
    assert.ok(!/^https:\/\/[^/]+\/.+\.(html?|php|aspx?)$/i.test(row.website),
      `${row.id}: stores an article page rather than a publisher root`);
  }

  const regions = waveFour.reduce((counts, row) => {
    counts[row.macroRegion] = (counts[row.macroRegion] || 0) + 1;
    return counts;
  }, {});
  for (const region of S.MACRO_REGIONS) {
    assert.ok(regions[region] > 0, `wave 4 reaches no outlet in ${region}`);
  }
  assert.ok(new Set(waveFour.map((row) => row.country)).size >= 30,
    'wave 4 is concentrated in too few countries');

  // The soft geographic targets are minimums, not quotas: wave 4 is sized by
  // what qualified, so every region should meet or exceed its floor.
  for (const [region, floor] of Object.entries(EXPAND.EXPANSION_TARGETS)) {
    assert.ok(regions[region] >= Math.min(floor, 20),
      `${region} has ${regions[region] || 0} wave-4 outlets`);
  }
});

test('the corpus covers all six macro regions and at least sixty countries', () => {
  assert.deepStrictEqual([...new Set(rows.map((row) => row.macroRegion))].sort(), S.MACRO_REGIONS);
  assert.ok(new Set(rows.map((row) => row.country)).size >= 64);
  for (const region of S.MACRO_REGIONS) {
    assert.ok(rows.filter((row) => row.macroRegion === region).length >= 10,
      `${region} has fewer than ten records`);
  }
});

test('every published Domain Rating is measured, attributed and above the quality gate', () => {
  for (const row of rows) {
    assert.ok(Number.isInteger(row.domainRating) && row.domainRating >= EXPAND.MIN_DR,
      `${row.id}: low or absent DR`);
    assert.deepStrictEqual(require('../lib/bd-schema.cjs').domainRatingProblems(row), [], row.id);
    assert.strictEqual(row.metricsProvenance.domainRating.provider, 'Ahrefs');
    assert.strictEqual(row.metricsProvenance.domainRating.measuredDomain, S.normaliseHost(row.website));
  }
  assert.ok(Math.min(...rows.map((row) => row.domainRating)) >= EXPAND.MIN_DR);
  assert.ok(Math.max(...rows.map((row) => row.domainRating)) >= 90);
});

test('follow and publication routes remain unknown without page-level evidence', () => {
  for (const row of rows) {
    if (!row.backlinkType) assert.ok(!row.backlinkProvenance, `${row.id}: provenance without a reading`);
    if (row.publicationRoutes.includes('unknown')) {
      assert.deepStrictEqual(row.publicationRoutes, ['unknown']);
      assert.ok(!row.submissionUrl && !row.advertisingUrl, `${row.id}: route URL asserted while unknown`);
    }
  }
});

test('the regional corpus does not duplicate a Media, PR & Publishing host', () => {
  const mediaHosts = new Set(JSON.parse(read('data/media-pr-publishing/media-platforms.json'))
    .map((row) => S.normaliseHost(row.website)));
  assert.deepStrictEqual(rows.filter((row) => mediaHosts.has(S.normaliseHost(row.website))), []);
});

test('server order is Domain Rating descending with deterministic ties', () => {
  assert.deepStrictEqual(rows.slice().sort(S.compareRecords).map((row) => row.id),
    rows.slice().sort(S.compareRecords).map((row) => row.id));
  const built = rows.slice().sort(S.compareRecords);
  for (let index = 1; index < built.length; index += 1) {
    assert.ok(built[index - 1].domainRating >= built[index].domainRating);
  }
});

test('all localized registry pages render the complete corpus and self-canonicalize', () => {
  for (const locale of I.LOCALE_CODES) {
    const rel = I.localizedFile(locale, S.collectionPath());
    const html = read(rel);
    assert.strictEqual((html.match(/class="bd-row"/g) || []).length, rows.length, rel);
    assert.ok(html.includes(`rel="canonical" href="https://petrohrys.com${I.localizedPath(locale, S.collectionPath())}"`));
    assert.ok(!/name="robots"[^>]*noindex/.test(html));
    for (const target of I.LOCALE_CODES) {
      assert.ok(html.includes(`hreflang="${target}" href="https://petrohrys.com${I.localizedPath(target, S.collectionPath())}"`));
    }
    assert.ok(html.includes('Domain Rating by Ahrefs'));
    assert.ok(html.includes('href="https://ahrefs.com/"'));
  }
});

test('the page exposes geography, DR, follow, cost and route controls', () => {
  const html = read('research/regional-media/index.html');
  for (const marker of [
    'data-bd-search', 'data-bd-sort', 'data-bd-min-dr', 'data-bd-link-type',
    'data-bd-facet-region', 'data-bd-facet-subregion', 'data-bd-facet-country',
    'data-bd-facet-coverage', 'data-bd-facet-publication', 'data-bd-facet-language',
    'data-bd-facet-route', 'data-bd-facet-cost',
  ]) assert.ok(html.includes(marker), `missing ${marker}`);
  assert.ok(html.includes(`<option value="unknown">Unknown (${rows.length})</option>`));
  assert.ok(html.includes('data-rm-status-all="{total} outlets shown"'));
});

test('the worklist keeps Domain Rating and sorting in the primary comparison view', () => {
  const html = read('research/regional-media/index.html');
  assert.ok(html.includes('class="bd-controls bd-rm-primary-controls"'));
  assert.ok(html.includes('<option value="domain-rating" selected>Domain Rating (highest first)</option>'));
  assert.ok(html.includes('class="bd-table bd-rm-table"'));
  const head = html.match(/<thead><tr>(.*?)<\/tr><\/thead>/s);
  assert.ok(head, 'regional media table head is missing');
  assert.strictEqual((head[1].match(/<th /g) || []).length, 9);
  assert.ok(head[1].indexOf('Outlet') < head[1].indexOf('Domain Rating'));
  assert.ok(head[1].indexOf('Domain Rating') < head[1].indexOf('Country'));
});

test('CSV is one-to-one with canonical records and keeps unknown link state explicit', () => {
  const csv = read('research/regional-media/regional-media.csv');
  const lines = csv.trim().split(/\r?\n/);
  assert.strictEqual(lines.length, rows.length + 1);
  assert.ok(lines[0].includes('macro_region,subregion,country,coverage_type'));
  assert.ok(lines[0].includes('domain_rating_provider'));
  assert.ok(lines[0].includes('link_type,link_evidence_url'));
  assert.strictEqual(BUILD.renderCsv(rows.slice().sort(S.compareRecords)), csv);
});

test('structured data, robots and the download all describe the same corpus', () => {
  for (const locale of I.LOCALE_CODES) {
    const html = read(I.localizedFile(locale, S.collectionPath()));
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map(([, json]) => JSON.parse(json));
    assert.strictEqual(blocks.length, 1, `${locale}: expected exactly one JSON-LD block`);
    const graph = blocks[0]['@graph'];
    const page = graph.find((node) => node['@type'] === 'CollectionPage');
    assert.ok(page, `${locale}: no CollectionPage node`);
    // Site-wide convention: every locale's JSON-LD names the x-default URL,
    // while `rel="canonical"` is self-referential per locale (asserted above).
    // Business Directories does the same, so this is the shared `bd-seo`
    // contract rather than a Regional Media quirk. Worth revisiting across all
    // collections at some point; not worth diverging one collection from the
    // other four here.
    assert.strictEqual(page.url, `https://petrohrys.com${S.collectionPath()}`);
    // The count in the description is the count on the page. A stale number
    // here is a claim to search engines that the page does not support.
    assert.ok(page.description.includes(String(rows.length)),
      `${locale}: JSON-LD description does not state ${rows.length}`);
    assert.ok(graph.some((node) => node['@type'] === 'BreadcrumbList'));
    assert.ok(html.includes(`<strong>${rows.length}</strong>`), `${locale}: overview stat`);
    assert.ok(/<a class="bd-button" href="\/research\/regional-media\/regional-media\.csv" download>/.test(html),
      `${locale}: CSV download link`);
  }

  const robots = read('robots.txt');
  assert.match(robots, /^User-agent: \*\nAllow: \//m);
  assert.ok(!/Disallow: \/research/.test(robots), 'robots.txt blocks the research tree');
  assert.ok(robots.includes('Sitemap: https://petrohrys.com/sitemap.xml'));
});

test('Research hubs and sitemap discover every localized collection route', () => {
  const sitemap = read('sitemap.xml');
  for (const locale of I.LOCALE_CODES) {
    const route = I.localizedPath(locale, S.collectionPath());
    assert.ok(read(I.localizedFile(locale, '/research/')).includes(`href="${route}"`), `${locale} hub`);
    assert.strictEqual((sitemap.match(new RegExp(`<loc>https://petrohrys\\.com${route}</loc>`, 'g')) || []).length, 1);
  }
});

test('manifest owns only the four locale pages and CSV', () => {
  const manifest = JSON.parse(read('data/regional-media/.build-manifest.json'));
  assert.strictEqual(manifest.files.length, 5);
  assert.ok(manifest.files.includes('research/regional-media/index.html'));
  assert.ok(manifest.files.includes('research/regional-media/regional-media.csv'));
  for (const file of manifest.files) assert.ok(fs.existsSync(path.join(ROOT, file)), file);
});

test('central Ahrefs ledger references every regional media record', () => {
  const inventory = require('../lib/rc-domain-inventory.cjs');
  assert.strictEqual(inventory.readCollection('regional-media').length, rows.length);
  const ledger = JSON.parse(read('data/domain-rating/.ahrefs-domain-rating.json'));
  const refs = ledger.findings.flatMap((finding) => (finding.records || [])
    .filter((record) => record.collection === 'regional-media').map((record) => record.id));
  assert.strictEqual(new Set(refs).size, rows.length);
  assert.deepStrictEqual([...new Set(refs)].sort(), rows.map((row) => row.id).sort());
});

test('schema refuses invented DR and homepage-as-follow evidence', () => {
  const base = structuredClone(rows[0]);
  delete base.metricsProvenance;
  assert.ok(S.problemsFor(base, countrySet).some(([field]) => field.includes('metricsProvenance')));

  const link = structuredClone(rows[0]);
  link.backlinkType = 'dofollow';
  link.linkTargetType = 'direct';
  link.backlinkProvenance = {
    listingUrl: link.website, externalUrl: 'https://example.com', relTokens: [],
    observedAt: link.lastVerified,
  };
  assert.ok(S.problemsFor(link, countrySet)
    .some(([field, reason]) => field.includes('listingUrl') && /homepage/.test(reason)));
});

test('research CSV parser preserves quoted commas, newlines and escaped quotes', () => {
  assert.deepStrictEqual(EXPAND.parseCsv('\ufeffname,note\r\n"Paper, The","Line 1\nLine ""2"""\r\n'), [{
    name: 'Paper, The', note: 'Line 1\nLine "2"',
  }]);
});
