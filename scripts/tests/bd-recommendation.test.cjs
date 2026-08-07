'use strict';

// Directory Intelligence v3 — recommendation intelligence.
//
// The claim this layer makes is narrow and testable: the same platform gets a
// DIFFERENT score for a different kind of business, computed from a declaration
// rather than a curated list, and every number arrives with the reasons that
// produced it.
//
// Two guards below exist because of defects the implementation actually hit.
//
// `no profile proxies a business type it cannot express` — the first version
// declared manufacturers as `accepts: ['enterprise']`, because the accepts
// vocabulary has no manufacturer flag. Hugging Face accepts enterprises, so it
// ranked first for Manufacturers, and The Legal 500 ranked first for Exporters.
//
// `keywords are unambiguous across industries` — "practitioner" matched The
// Legal 500, which describes legal practitioners, and put a law directory at
// the top of Healthcare.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const DATA = path.join(ROOT, 'data', 'business-directories');
const R = require(path.join(ROOT, 'scripts/lib/bd-recommend.cjs'));
const S = require(path.join(ROOT, 'scripts/lib/bd-schema.cjs'));
const O = require(path.join(ROOT, 'scripts/lib/bd-opportunities.cjs'));
const csv = require(path.join(ROOT, 'scripts/lib/bd-csv.cjs'));

const COUNTRIES = new Set(JSON.parse(
  fs.readFileSync(path.join(DATA, 'countries.json'), 'utf8')).map((c) => c.slug));
const CATEGORIES = new Set(JSON.parse(
  fs.readFileSync(path.join(DATA, 'categories.json'), 'utf8')).map((c) => c.slug));
const DIR = path.join(DATA, 'directories');
const EDITORIAL = fs.readdirSync(DIR).filter((f) => f.endsWith('.json'))
  .flatMap((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')));
const ROWS = O.loadOpportunities(DATA, COUNTRIES, CATEGORIES);
const ACTIONABLE = csv.actionableOpportunities(EDITORIAL, ROWS);

// --- the core claim ---------------------------------------------------------

test('the same platform scores differently for different businesses', () => {
  // If this ever collapses, the layer is a second Directory Score wearing a hat.
  const gbp = ACTIONABLE.find((r) => r.id === 'global-google-business-profile');
  assert.ok(gbp, 'Google Business Profile is missing from the actionable set');
  const local = R.recommend(gbp, 'local-business').score;
  const saas = R.recommend(gbp, 'saas').score;
  assert.ok(local > saas * 2,
    `Google Business Profile scored ${local} for local business and ${saas} for SaaS; `
    + 'a map listing is not a SaaS listing and the gap should be large');

  const g2 = ACTIONABLE.find((r) => r.id === 'global-g2');
  assert.ok(R.recommend(g2, 'saas').score > R.recommend(g2, 'construction').score * 2,
    'G2 should suit SaaS far better than construction');
});

test('every recommendation carries the reasons that produced it', () => {
  for (const profile of R.PROFILES) {
    for (const { record, recommendation } of R.rankFor(ACTIONABLE, profile.key, { limit: 10, minLevel: 'marginal' })) {
      assert.ok(Array.isArray(recommendation.reasons) && recommendation.reasons.length > 0,
        `${record.id} is recommended for ${profile.key} with no reason given`);
      assert.ok(typeof recommendation.score === 'number');
      assert.ok(recommendation.level, 'a scored recommendation must carry a level');
    }
  }
});

test('the ranking is deterministic', () => {
  for (const profile of R.PROFILES.slice(0, 6)) {
    const a = R.rankFor(ACTIONABLE, profile.key, { limit: 25, minLevel: 'marginal' })
      .map((x) => `${x.record.id}:${x.recommendation.score}`);
    const b = R.rankFor([...ACTIONABLE].reverse(), profile.key, { limit: 25, minLevel: 'marginal' })
      .map((x) => `${x.record.id}:${x.recommendation.score}`);
    assert.deepStrictEqual(a, b, `${profile.key} ranked differently from a reordered input`);
  }
});

// --- nothing is hardcoded ---------------------------------------------------

test('no profile names a platform', () => {
  // A profile that had to name a platform would be a curated list in disguise.
  const source = fs.readFileSync(path.join(ROOT, 'scripts/lib/bd-recommend.cjs'), 'utf8');
  const declarations = source.slice(source.indexOf('const PROFILES = ['), source.indexOf('];', source.indexOf('const PROFILES = [')));
  for (const id of ['global-g2', 'global-capterra', 'global-clutch', 'global-trustpilot',
    'huggingface', 'alibaba', 'thomasnet', 'crunchbase', 'producthunt']) {
    assert.ok(!declarations.toLowerCase().includes(id.replace('global-', '')),
      `the profile declarations name "${id}" — recommendations must be computed, not curated`);
  }
});

test('no profile proxies a business type it cannot express', () => {
  // `accepts` has twelve flags and none of them means "manufacturer". Proxying
  // that with `enterprise` put Hugging Face top of Manufacturers.
  for (const p of R.PROFILES) {
    for (const k of p.accepts) {
      assert.ok(S.ACCEPTS_KEYS.includes(k), `${p.key} names "${k}", which is not an accepts flag`);
    }
    assert.ok(p.accepts.length || p.categories.length || (p.keywords || []).length,
      `${p.key} declares no accepts flag, category or keyword`);
  }
  // The specific regression: a B2B industrial profile must not be led by a
  // platform that merely accepts enterprises.
  const top = R.rankFor(ACTIONABLE, 'manufacturer', { limit: 1, minLevel: 'marginal' })[0];
  assert.ok(top, 'Manufacturers ranked nothing at all');
  assert.ok(!/hugging face|legal 500|chambers and partners/i.test(top.record.name),
    `Manufacturers is led by ${top.record.name}, which is not an industrial platform`);
});

test('keywords are unambiguous across industries', () => {
  // "practitioner" reads as medical and as legal; a keyword that can mean two
  // industries is not evidence of fit in either.
  const healthcare = R.PROFILE_BY_KEY.get('healthcare');
  assert.ok(!healthcare.keywords.includes('practitioner'),
    '"practitioner" matches legal prose and must not be a healthcare keyword');
  const top5 = R.rankFor(ACTIONABLE, 'healthcare', { limit: 5, minLevel: 'marginal' });
  assert.ok(!top5.some((x) => /legal 500|chambers and partners/i.test(x.record.name)),
    'a legal directory is ranked among the top healthcare recommendations');
});

// --- an explicit no is disqualifying ----------------------------------------

test('a platform that refuses a business type is excluded, not merely ranked low', () => {
  const refuses = { id: 'x', name: 'X', tier: 'tier1', currentStatus: 'active',
    category: 'saas', accepts: { saas: false }, backlinkType: 'dofollow',
    listingQuality: 'high', submissionModel: 'free',
    intelligence: { profileIndexed: true, countryReach: 'global', approvalMode: 'instant' } };
  const rec = R.recommend(refuses, 'saas');
  assert.strictEqual(rec.level, 'excluded');
  assert.strictEqual(rec.score, 0);
  assert.match(rec.reasons.join(' '), /does not accept/i);
  // And it must not appear in the ranking at any level.
  assert.strictEqual(R.rankFor([refuses], 'saas', { minLevel: 'marginal' }).length, 0);
});

test('fit strength is ordered: stated beats category beats keyword beats nothing', () => {
  assert.ok(R.FIT_ESTABLISHED > R.FIT_CATEGORY);
  assert.ok(R.FIT_CATEGORY > R.FIT_KEYWORD);
  assert.ok(R.FIT_KEYWORD > R.FIT_UNKNOWN);
  assert.ok(R.FALLBACK_DISCOUNT < 1, 'a fallback quality must never look as good as a real score');
});

// --- the published pages ----------------------------------------------------

test('every profile page that exists is backed by the engine', () => {
  const dir = path.join(ROOT, 'research', 'business-directories', 'for');
  assert.ok(fs.existsSync(dir), 'no recommendation pages were generated');
  const slugs = fs.readdirSync(dir);
  assert.ok(slugs.length >= 15, `only ${slugs.length} profile pages were generated`);
  for (const slug of slugs) {
    const profile = R.PROFILES.find((p) => p.slug === slug);
    assert.ok(profile, `the page /for/${slug}/ has no profile behind it`);
    const html = fs.readFileSync(path.join(dir, slug, 'index.html'), 'utf8');
    const rendered = (html.match(/data-bd-rec-level=/g) || []).length;
    const ranked = R.rankFor(ACTIONABLE, profile.key, { limit: 25, minLevel: 'marginal' });
    assert.strictEqual(rendered, ranked.length,
      `/for/${slug}/ renders ${rendered} rows against ${ranked.length} from the engine`);
    assert.ok(html.includes('How these were selected'), `/for/${slug}/ has no methodology section`);
    assert.ok(html.includes('Limitations'), `/for/${slug}/ has no limitations section`);
  }
});

test('a page is never generated for a profile with almost nothing to say', () => {
  const dir = path.join(ROOT, 'research', 'business-directories', 'for');
  for (const p of R.PROFILES) {
    const ranked = R.rankFor(ACTIONABLE, p.key, { limit: 25, minLevel: 'marginal' });
    const exists = fs.existsSync(path.join(dir, p.slug, 'index.html'));
    if (ranked.length < 5) {
      assert.ok(!exists, `/for/${p.slug}/ exists with only ${ranked.length} recommendations`);
    } else {
      assert.ok(exists, `/for/${p.slug}/ is missing despite ${ranked.length} recommendations`);
    }
  }
});
