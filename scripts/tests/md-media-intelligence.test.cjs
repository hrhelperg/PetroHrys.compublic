'use strict';

// Media Intelligence v1 + Media Recommendations v1 — the contract.
//
// Two claims are being defended, and they are different claims:
//
//   Media Score        how good is this opportunity?  Same answer for everyone.
//   Recommendation     should THIS business use it?   Different for everyone.
//
// Collapsing them is the failure this suite exists to prevent, along with the
// three that killed the first version of the ranking rules: a profile's fifth
// category scoring like its first, a curated list smuggled in as a profile, and
// a page built entirely of general business titles that would read identically
// under every heading.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const MD = require(path.join(ROOT, 'scripts/lib/media-schema.cjs'));
const MI = require(path.join(ROOT, 'scripts/lib/media-intelligence.cjs'));
const REC = require(path.join(ROOT, 'scripts/lib/media-recommend.cjs'));
const build = require(path.join(ROOT, 'scripts/build-media-platforms.cjs'));

const DATA_FILE = path.join(ROOT, 'data/media-pr-publishing/media-platforms.json');
const FOR_DIR = path.join(ROOT, 'research/media-pr-publishing/for');
const CSV = path.join(ROOT, 'research/media-pr-publishing/opportunities.csv');
const COUNTRIES = new Set(JSON.parse(
  fs.readFileSync(path.join(ROOT, 'data/business-directories/countries.json'), 'utf8')).map((c) => c.slug));
const RAW = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
const ROWS = MD.loadMediaPlatforms(DATA_FILE, COUNTRIES).filter(MD.isActionable);

// ── 1-4. evidence discipline ────────────────────────────────────────────────

test('every dimension declares an evidence class from the vocabulary', () => {
  const valid = new Set(Object.values(MI.EVIDENCE_CLASS));
  assert.ok(MI.DIMENSIONS.length >= 5, 'too few dimensions to be a score');
  for (const d of MI.DIMENSIONS) {
    assert.ok(valid.has(d.evidence), `${d.key} declares "${d.evidence}", not an evidence class`);
    assert.strictEqual(typeof d.fn, 'function', `${d.key} has no implementation`);
    assert.ok(d.weight > 0, `${d.key} carries no weight`);
  }
});

test('no intelligence concept duplicates a canonical registry fact', () => {
  // The audit's whole point: this layer adds no stored fields. If a dimension
  // ever needs one, it must be added to the schema deliberately — not invented
  // here as a parallel truth the registry does not know about.
  const stored = new Set(Object.keys(RAW[0]));
  for (const banned of ['mediaCategory', 'mediaCountry', 'mediaCost', 'mediaOpportunityType',
    'mediaScore', 'mediaScoreBand', 'intelligence', 'mediaIntelligence']) {
    assert.ok(!stored.has(banned), `the registry stores "${banned}", duplicating a canonical fact`);
  }
  for (const r of RAW) {
    for (const k of Object.keys(r)) {
      assert.ok(!/^media(Score|Band|Intelligence)/.test(k), `${r.id} stores ${k}`);
    }
  }
});

test('unknown is never silently turned into false, zero or low', () => {
  // A dimension with no evidence returns null. A record with an unknown route
  // must not acquire a confident dimension value from nowhere.
  const bare = { id: 'x', name: 'X', website: 'https://x.example', country: 'global',
    audienceGeography: 'global', categories: ['technology-media'], industries: [], languages: [],
    currentStatus: 'active', priority: 'P3', opportunityTypes: ['unknown'], costModel: 'unknown',
    submissionUrl: null, pitchUrl: null, pressReleaseUrl: null, advertisingUrl: null,
    mediaKitUrl: null, contactUrl: null, publicProfileAvailable: null,
    requiresEditorialApproval: null, sponsoredContentAvailable: null,
    shortNote: 'a platform with nothing established about it', limitations: 'nothing established',
    lastVerified: null, sources: ['https://x.example/'] };
  for (const key of ['opportunityQuality', 'routeCertainty', 'editorialStanding',
    'durableVisibility', 'accessibility']) {
    assert.strictEqual(MI[key](bare), null, `${key} invented a value from no evidence`);
  }
  assert.strictEqual(MI.mediaScore(bare).score, null, 'a record with no evidence was scored');
  assert.notStrictEqual(MI.mediaScore(bare).score, 0, 'unknown became zero');
});

test('a browser-check platform is penalised but never zeroed or reclassified', () => {
  // Selected by the PROSE, not by currentStatus. The first version selected
  // rows where currentStatus === 'unknown' and then asserted currentStatus was
  // not 'active' — so promoting a row to active simply removed it from the set
  // and the guard could not fail. The same self-defeating shape as a test that
  // filters by the property it is about to check.
  // Only the bot-filter phrase. A wider pattern also matched "confirm in a
  // browser", which appears on rows where NO route was found — a different
  // fact, and one that does not imply the site blocked us.
  const blocked = ROWS.filter((r) => /behind a bot filter/i
    .test(`${r.shortNote} ${r.limitations || ''}`));
  assert.ok(blocked.length > 20, `expected a browser-check population, found ${blocked.length}`);
  for (const r of blocked) {
    assert.strictEqual(r.currentStatus, 'unknown',
      `${r.id} says it is behind a bot filter but claims status "${r.currentStatus}"`);
    const s = MI.mediaScore(r);
    assert.ok(s.score === null || s.score > 0, `${r.id} scored exactly zero for being blocked`);
  }
});

// ── 5-10. the score itself ──────────────────────────────────────────────────

test('the Media Score is derived and never stored', () => {
  const blob = fs.readFileSync(DATA_FILE, 'utf8');
  assert.ok(!/"mediaScore"|"media_score"|"score"\s*:/.test(blob), 'a score is stored in the data');
  // And it is genuinely a function of the record: same input, same output.
  for (const r of ROWS.slice(0, 40)) {
    assert.deepStrictEqual(MI.mediaScore(r).score, MI.mediaScore({ ...r }).score);
  }
});

test('the weights total exactly 100', () => {
  assert.strictEqual(MI.DIMENSIONS.reduce((s, d) => s + d.weight, 0), 100);
  assert.strictEqual(MI.TOTAL_WEIGHT, 100);
});

test('the evidence floor is enforced on both axes independently', () => {
  // Two separate floors, and a case that isolates each. A sibling engine had a
  // floor that could not fail, because lowering the dimension count changed
  // nothing while the weight floor still rejected the example.
  const base = ROWS.find((r) => MI.mediaScore(r).score !== null);
  assert.ok(base, 'nothing is scored, so the floor cannot be tested');
  assert.ok(MI.MIN_DIMENSIONS >= 3 && MI.MIN_WEIGHT >= 50, 'the floor is too low to mean anything');
  for (const r of ROWS) {
    const s = MI.mediaScore(r);
    if (s.score === null) {
      assert.ok(s.dimensions.length < MI.MIN_DIMENSIONS || s.weightAvailable < MI.MIN_WEIGHT,
        `${r.id} is unscored while meeting the floor`);
      assert.ok(s.reason, `${r.id} is unscored with no reason given`);
    } else {
      assert.ok(s.dimensions.length >= MI.MIN_DIMENSIONS && s.weightAvailable >= MI.MIN_WEIGHT,
        `${r.id} was scored below the floor`);
    }
  }
});

test('insufficient evidence produces no score, not a low one', () => {
  const unscored = ROWS.filter((r) => MI.mediaScore(r).score === null);
  assert.ok(unscored.length > 0, 'expected some unscored platforms');
  for (const r of unscored) assert.strictEqual(MI.band(MI.mediaScore(r).score), null);
  // And the page says so in words rather than showing a number.
  const html = fs.readFileSync(path.join(ROOT, 'research/media-pr-publishing/index.html'), 'utf8');
  assert.ok(html.includes('Not yet scored'), 'the page shows no "Not yet scored" state');
});

test('renormalisation is deterministic and bounded', () => {
  for (const r of ROWS) {
    const s = MI.mediaScore(r);
    if (s.score === null) continue;
    assert.ok(Number.isInteger(s.score) && s.score >= 0 && s.score <= 100, `${r.id} scored ${s.score}`);
    const manual = Math.round(s.dimensions.reduce((a, d) => a + d.value * d.weight, 0)
      / s.dimensions.reduce((a, d) => a + d.weight, 0));
    assert.strictEqual(s.score, Math.max(0, Math.min(100, manual)),
      `${r.id} does not reproduce from its own dimensions`);
  }
});

test('the bands are exhaustive, non-overlapping and actually discriminate', () => {
  const mins = MI.BANDS.map((b) => b.min);
  assert.deepStrictEqual(mins, [...mins].sort((a, b) => b - a), 'bands are not ordered');
  assert.strictEqual(mins[mins.length - 1], 0, 'the bands do not cover 0');
  assert.strictEqual(new Set(mins).size, mins.length, 'two bands share a boundary');
  for (const n of [0, 1, 49, 50, 51, 65, 66, 77, 78, 87, 88, 99, 100]) {
    assert.ok(MI.band(n), `no band covers ${n}`);
  }
  // Calibration: a score where nearly everything lands in one band is not a score.
  const counts = {};
  const scored = ROWS.map((r) => MI.mediaScore(r)).filter((s) => s.score !== null);
  for (const s of scored) counts[s.band] = (counts[s.band] || 0) + 1;
  assert.ok(Object.keys(counts).length >= 4, `only ${Object.keys(counts).length} bands are populated`);
  const biggest = Math.max(...Object.values(counts));
  assert.ok(biggest / scored.length < 0.6,
    `${Math.round(biggest / scored.length * 100)}% of scored platforms are in one band`);
  const top = (counts.Exceptional || 0) + (counts.Strong || 0);
  assert.ok(top / scored.length < 0.8,
    `${Math.round(top / scored.length * 100)}% are Strong or Exceptional; the score does not discriminate`);
});

// ── 11-15. recommendations ──────────────────────────────────────────────────

test('no recommendation profile names a platform', () => {
  // The rule that keeps this an engine rather than a curated list.
  const src = fs.readFileSync(path.join(ROOT, 'scripts/lib/media-recommend.cjs'), 'utf8');
  const start = src.indexOf('const PROFILES = [');
  const decl = src.slice(start, src.indexOf('\n];', start)).toLowerCase();
  for (const r of ROWS) {
    assert.ok(!decl.includes(r.id.toLowerCase()), `a profile names the id ${r.id}`);
    assert.ok(!decl.includes(MD.hostOf(r.website)), `a profile names the host of ${r.id}`);
    const name = r.name.toLowerCase();
    // Single dictionary words ("forbes" no, "startup" yes) — only test names
    // distinctive enough that their presence could only be a platform reference.
    if (name.length >= 6 && /\s/.test(r.name)) {
      assert.ok(!decl.includes(name), `a profile names the platform "${r.name}"`);
    }
  }
});

test('every profile and objective declares only real vocabulary', () => {
  for (const p of REC.PROFILES) {
    for (const c of [...p.categories, ...(p.adjacent || [])]) {
      assert.ok(MD.CATEGORIES.includes(c), `${p.key} declares category "${c}", which does not exist`);
    }
    for (const i of p.industries) {
      assert.ok(MD.INDUSTRIES.includes(i), `${p.key} declares industry "${i}", which does not exist`);
    }
    assert.ok(p.categories.length, `${p.key} declares no primary category`);
    // The proxy defect: a profile must not borrow a category that does not mean it.
    for (const c of p.categories) {
      assert.ok(!(p.adjacent || []).includes(c), `${p.key} lists "${c}" as both primary and adjacent`);
    }
  }
  for (const o of REC.OBJECTIVES) {
    for (const t of Object.keys(o.types)) {
      assert.ok(MD.OPPORTUNITY_TYPES.includes(t), `${o.key} maps "${t}", which is not an opportunity type`);
    }
  }
});

test('a primary category outranks an adjacent one', () => {
  // The pathology that produced identical B2B SaaS and AI top tens.
  assert.ok(REC.FIT_CATEGORY > REC.FIT_INDUSTRY);
  assert.ok(REC.FIT_INDUSTRY > REC.FIT_ADJACENT);
  assert.ok(REC.FIT_ADJACENT > REC.FIT_KEYWORD);
  assert.ok(REC.FIT_KEYWORD > REC.FIT_GENERAL);
  assert.ok(REC.FIT_GENERAL > REC.FIT_NONE);
  // And the effect is visible: the telecom page is led by telecom publications.
  const top = REC.rankFor(ROWS, 'telecom-voip-ucaas', { limit: 5, minLevel: 'Marginal' });
  assert.ok(top.length >= 5, 'the telecom profile ranks too little to check');
  const specialist = top.filter((x) => x.record.categories.includes('telecom-media')).length;
  assert.ok(specialist >= 3,
    `only ${specialist} of the top 5 telecom results are telecom publications`);
});

test('the same platform is recommended differently to different businesses', () => {
  // If this collapses, Recommendation Score is Media Score wearing a hat.
  const telecom = ROWS.find((r) => r.categories.includes('telecom-media')
    && !r.opportunityTypes.includes('unknown'));
  assert.ok(telecom, 'no scored telecom platform to compare');
  const forTelecom = REC.recommend(telecom, 'telecom-voip-ucaas').score;
  const forAgri = REC.recommend(telecom, 'agtech-food').score;
  assert.ok(forTelecom > forAgri * 1.5,
    `${telecom.name} scored ${forTelecom} for telecom and ${forAgri} for agriculture; too close`);
  // While its intrinsic Media Score is the same in both cases.
  assert.strictEqual(REC.recommend(telecom, 'telecom-voip-ucaas').mediaScore,
    REC.recommend(telecom, 'agtech-food').mediaScore,
    'the intrinsic Media Score changed with the asking business');
});

test('explicit exclusion beats every positive signal, and unknown never excludes', () => {
  const base = ROWS.find((r) => REC.recommend(r, 'b2b-saas').score > 60);
  // A perfect category match that has closed is excluded, not ranked low.
  const closed = { ...base, currentStatus: 'dormant' };
  const rec = REC.recommend(closed, 'b2b-saas');
  assert.strictEqual(rec.excluded, true, 'a dormant platform was ranked rather than excluded');
  assert.strictEqual(rec.score, 0);
  // An objective nothing on the platform can deliver is an exclusion too.
  const wire = ROWS.find((r) => r.opportunityTypes.length === 1
    && r.opportunityTypes[0] === 'press-release');
  if (wire) {
    assert.strictEqual(REC.recommend(wire, 'b2b-saas', { objective: 'podcast-appearance' }).excluded,
      true, 'a wire was recommended for a podcast appearance');
  }
  // But an unknown route is NOT an exclusion.
  const unknown = ROWS.find((r) => r.opportunityTypes.includes('unknown'));
  assert.strictEqual(REC.recommend(unknown, 'b2b-saas').excluded, false,
    'an unresearched route was treated as a refusal');
});

test('the ranking is deterministic and the levels are ordered', () => {
  for (const p of REC.PROFILES.slice(0, 6)) {
    const a = REC.rankFor(ROWS, p.key, { limit: 25 }).map((x) => `${x.record.id}:${x.recommendation.score}`);
    const b = REC.rankFor([...ROWS].reverse(), p.key, { limit: 25 }).map((x) => `${x.record.id}:${x.recommendation.score}`);
    assert.deepStrictEqual(a, b, `${p.key} ranked differently from a reordered input`);
  }
  const mins = REC.LEVELS.map((l) => l.min);
  assert.deepStrictEqual(mins, [...mins].sort((x, y) => y - x), 'levels are not ordered');
  assert.strictEqual(mins[mins.length - 1], 0, 'levels do not cover 0');
});

test('every recommendation reason corresponds to a real scoring input', () => {
  for (const p of REC.PROFILES) {
    for (const { record, recommendation: r } of REC.rankFor(ROWS, p.key, { limit: 10 })) {
      assert.ok(Array.isArray(r.reasons) && r.reasons.length >= 3,
        `${record.id} is recommended for ${p.key} with too few reasons`);
      assert.ok(r.reasons.includes(r.businessFit.reason), 'the business fit reason is missing');
      assert.ok(r.reasons.includes(r.objectiveFit.reason), 'the objective fit reason is missing');
      assert.ok(r.reasons.includes(r.geographyFit.reason), 'the geography fit reason is missing');
      if (r.mediaScore === null) {
        assert.ok(r.reasons.some((x) => /not yet scored/i.test(x)),
          `${record.id} is unscored and does not say so`);
      } else {
        assert.ok(r.reasons.some((x) => x.includes(String(r.mediaScore))),
          `${record.id} does not report the Media Score it used`);
      }
      if (record.currentStatus === 'unknown') {
        assert.ok(r.reasons.some((x) => /browser/i.test(x)),
          `${record.id} is behind a bot filter and the recommendation does not say so`);
      }
    }
  }
});

// ── 16-20. the generated pages ──────────────────────────────────────────────

test('no recommendation page is empty or thin', () => {
  assert.ok(fs.existsSync(FOR_DIR), 'no recommendation pages were generated');
  const slugs = fs.readdirSync(FOR_DIR);
  assert.ok(slugs.length >= 8, `only ${slugs.length} recommendation pages exist`);
  for (const slug of slugs) {
    const profile = REC.PROFILES.find((p) => p.slug === slug);
    assert.ok(profile, `/for/${slug}/ has no profile behind it`);
    const ranked = REC.rankFor(ROWS, profile.key, { limit: build.REC_LIMIT, minLevel: 'Marginal' });
    assert.ok(ranked.length >= build.MIN_RECOMMENDATIONS,
      `/for/${slug}/ exists with only ${ranked.length} recommendations`);
    const specific = ranked.filter((x) => REC.qualifiesForProfile(x.recommendation)).length;
    assert.ok(specific >= build.MIN_RECOMMENDATIONS,
      `/for/${slug}/ has only ${specific} results actually about ${profile.label}`);
    const html = fs.readFileSync(path.join(FOR_DIR, slug, 'index.html'), 'utf8');
    assert.strictEqual((html.match(/data-bd-rec-level=/g) || []).length, ranked.length,
      `/for/${slug}/ renders a different number of rows than the engine produced`);
    for (const section of ['How these were selected', 'Limitations']) {
      assert.ok(html.includes(section), `/for/${slug}/ has no "${section}" section`);
    }
  }
});

test('a profile with nothing specific to say gets no page at all', () => {
  for (const p of REC.PROFILES) {
    const ranked = REC.rankFor(ROWS, p.key, { limit: build.REC_LIMIT, minLevel: 'Marginal' });
    const specific = ranked.filter((x) => REC.qualifiesForProfile(x.recommendation)).length;
    const exists = fs.existsSync(path.join(FOR_DIR, p.slug, 'index.html'));
    if (ranked.length < build.MIN_RECOMMENDATIONS || specific < build.MIN_RECOMMENDATIONS) {
      assert.ok(!exists, `/for/${p.slug}/ exists with only ${specific} specific results`);
    } else {
      assert.ok(exists, `/for/${p.slug}/ is missing despite ${specific} specific results`);
    }
  }
  // And no empty directory is left behind pretending to be a route.
  if (fs.existsSync(FOR_DIR)) {
    for (const d of fs.readdirSync(FOR_DIR)) {
      assert.ok(fs.readdirSync(path.join(FOR_DIR, d)).length > 0, `/for/${d}/ is an empty directory`);
    }
  }
});

test('the sitemap lists every generated page and nothing else', () => {
  const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  const listed = [...sitemap.matchAll(/research\/media-pr-publishing\/for\/([a-z0-9-]+)\//g)]
    .map((m) => m[1]);
  const built = fs.existsSync(FOR_DIR) ? fs.readdirSync(FOR_DIR) : [];
  assert.deepStrictEqual([...new Set(listed)].sort(), [...built].sort(),
    'the sitemap and the generated pages disagree');
});

test('the same engine feeds the pages, the worklist column and the export', () => {
  // One place decides what a platform is good for. If the CSV and the page can
  // disagree, an employee filtering the spreadsheet gets a different answer
  // from an employee reading the site.
  const csv = fs.readFileSync(CSV, 'utf8');
  const header = csv.replace(/^﻿/, '').split('\r\n')[0].split(',');
  for (const col of ['media_score', 'media_score_band', 'best_for', 'publishing_model']) {
    assert.ok(header.includes(col), `the export has no ${col} column`);
  }
  const html = fs.readFileSync(path.join(ROOT, 'research/media-pr-publishing/index.html'), 'utf8');
  assert.ok(html.includes('data-bd-facet="band"'), 'the worklist has no Media Score filter');
  assert.ok(html.includes('data-bd-facet="bestfor"'), 'the worklist has no business filter');
  // Every value offered by the business filter is a real profile slug.
  const at = html.indexOf('data-bd-facet="bestfor"');
  const block = html.slice(at, html.indexOf('</select>', at));
  const slugs = new Set(REC.PROFILES.map((p) => p.slug));
  for (const m of block.matchAll(/value="([^"]+)"/g)) {
    assert.ok(slugs.has(m[1]), `the business filter offers "${m[1]}", which is not a profile`);
  }
});

test('no page states a count that is not derived', () => {
  const html = fs.readFileSync(path.join(ROOT, 'research/media-pr-publishing/index.html'), 'utf8');
  const cov = MI.coverage(ROWS);
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.ok(text.includes(`${cov.scored} of ${cov.total} are scored`),
    'the page does not state the derived scored count');
  const src = fs.readFileSync(path.join(ROOT, 'scripts/build-media-platforms.cjs'), 'utf8');
  // Checked against numeric literals in CODE, not any occurrence of the digits.
  // Localization made the generator mention locale counts, and a bare substring
  // search cannot tell a hardcoded total from an unrelated number in prose.
  const codeOnly = src.replace(/\/\/[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
  for (const stale of ['385', '144', '241']) {
    assert.ok(!new RegExp(`=\\s*${stale}\\b`).test(codeOnly),
      `the generator assigns the hardcoded total ${stale}`);
  }
});

test('no fabricated audience, traffic or authority metric appears anywhere', () => {
  const sources = ['scripts/lib/media-intelligence.cjs', 'scripts/lib/media-recommend.cjs',
    'scripts/build-media-platforms.cjs'].map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('');
  for (const banned of [/domainRating\s*[:=]\s*\d/, /domainAuthority/, /monthlyTraffic/,
    /estimatedTraffic\s*[:=]\s*\d/, /subscriberCount/, /openRate/]) {
    assert.ok(!banned.test(sources), `a fabricated metric appears: ${banned}`);
  }
  // And Media Score is never dressed up as a public review rating.
  for (const slug of (fs.existsSync(FOR_DIR) ? fs.readdirSync(FOR_DIR) : [])) {
    const html = fs.readFileSync(path.join(FOR_DIR, slug, 'index.html'), 'utf8');
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      const parsed = JSON.parse(m[1]);
      const graph = JSON.stringify(parsed);
      assert.ok(!/aggregateRating|ratingValue|reviewCount|"@type"\s*:\s*"Review"/.test(graph),
        `/for/${slug}/ presents an internal score as a public review rating`);
    }
  }
});

test('the existing media contract still holds', () => {
  // The intelligence layer must not have changed a single fact.
  for (const r of RAW) assert.deepStrictEqual(MD.problemsFor(r, COUNTRIES), [], `${r.id} broke`);
  const csv = fs.readFileSync(CSV, 'utf8');
  assert.strictEqual(csv.charCodeAt(0), 0xFEFF, 'the CSV lost its BOM');
  const lines = csv.replace(/^﻿/, '').split('\r\n').filter(Boolean);
  assert.strictEqual(lines.length - 1, ROWS.length, 'CSV parity broke');
});
