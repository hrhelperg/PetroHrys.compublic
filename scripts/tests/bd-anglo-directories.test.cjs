'use strict';
// Waves 1B.7–1B.9 — United Kingdom, Canada, Australia.
//
// Eight records from twenty-seven candidates. What this file mostly defends is
// the reasoning that kept nineteen of them OUT, because every one of those
// exclusions is the kind a later wave would quietly reverse from reputation:
//
//   Yell, TrueLocal, Hotfrog, Cylex, White Pages AU — BLOCKED, not absent.
//     Each refuses automated clients. A 403 is a bot filter, and a record that
//     called any of them dead would be asserting a fact nobody established.
//   CanadaOne — reachable, real operator, and STALE: newest article May 2020,
//     copyright line ending 2014. The current-status gate exists for this.
//   MisterWhat — trading since 2011 and naming no legal entity anywhere.
//     Reputation is not an operator.
//   Ourbis — shutting down, by its own announcement.
//   Brownbook — self-describes as a search-marketing product.
//   Touch Local — absorbed into Scoot, on the operator's own submission form.
//   411.ca — NOT absorbed and NOT published. Different operator, own profile
//     URLs, but no listing route of its own. An unresolved routing relationship
//     is not a duplicate, and calling it one would invent a shared identity.
//
// The two Pass 2 corrections are pinned too, because both moved a value AWAY
// from null on direct observation, and a later wave reverting them would be
// discarding evidence rather than being cautious.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const S = require('../lib/bd-schema.cjs');
const { loadRegistry } = require('../lib/bd-registry.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const ALL = loadRegistry().directories;
const byId = new Map(ALL.map((r) => [r.id, r]));

const WAVE = ['uk-thomson-local', 'uk-scoot', 'uk-freeindex', 'uk-approved-business',
  'uk-bizify', 'ca-yellowpages', 'ca-n49', 'au-aussieweb'];
const NEW = WAVE.map((id) => byId.get(id));

const visible = (r) => [r.description, ...r.pros, ...r.cons, ...r.bestFor, ...r.notRecommendedFor].join(' \n ');
const limitsOf = (r) => [...r.cons, ...r.notRecommendedFor].join(' ');
const hostOf = (u) => new URL(u).hostname.replace(/^www\./, '');
const commercialIn = (c) => ALL.filter((r) => r.country === c && !S.isGovernmentPillar(r));
const pageOf = (r) => fs.readFileSync(
  path.join(ROOT, 'research', 'business-directories', r.country, r.slug, 'index.html'), 'utf8');
const bodyText = (html) => html.replace(/<[^>]+>/g, ' ')
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&')
  .replace(/&pound;/g, '£').replace(/&#8217;/g, '’')
  .replace(/\s+/g, ' ');

test('every record this wave claims to have published exists', () => {
  assert.strictEqual(WAVE.length, 8, 'the wave manifest changed size without this test changing');
  for (const id of WAVE) assert.ok(byId.get(id), `missing record ${id}`);
  assert.strictEqual(commercialIn('united-kingdom').length, 5);
  assert.strictEqual(commercialIn('canada').length, 2);
  assert.strictEqual(commercialIn('australia').length, 1);
});

// ── 1 + 17. the operator gate ───────────────────────────────────────────────
test('every published record names a legal operator with an official URL', () => {
  // This is the gate that decided the wave. MisterWhat was rejected on it
  // despite being reachable, current and plainly a directory.
  for (const r of NEW) {
    assert.ok(r.operator && typeof r.operator.name === 'string' && r.operator.name.trim().length > 2,
      `${r.id} has no operator name`);
    assert.ok(r.operator.officialUrl && r.operator.officialUrl.startsWith('https://'),
      `${r.id} has no official URL for its operator`);
    // A placeholder is worse than nothing, because it looks resolved.
    assert.ok(!/^(unknown|n\/a|tbd|pending|none)$/i.test(r.operator.name.trim()),
      `${r.id} carries a placeholder operator`);
    // The operator must be a company, not the brand restated.
    assert.match(r.operator.name, /\b(Ltd|Limited|Inc\.?|Pty|S\.p\.A\.|a\.s\.|AG|GmbH|Corp\.?|Digital|Verlage|Group)\b/,
      `${r.id} operator "${r.operator.name}" does not read as a legal entity`);
  }
});

test('a candidate with no established operator stays unpublished', () => {
  // MisterWhat: reachable, current, a directory, and anonymous. Its whole
  // footer is "MisterWhat Copyright © 2011-2026". That is not an operator.
  for (const host of ['misterwhat.co.uk', 'misterwhat.com']) {
    assert.ok(!ALL.find((r) => hostOf(r.website) === host),
      `${host} was published without an established operator`);
  }
});

// ── 2. homepage copy is not enough ──────────────────────────────────────────
test('no record rests on homepage marketing copy', () => {
  // Every approved record must cite an operator URL that is a LEGAL or PRODUCT
  // page, not the front door. Yellow Pages Australia failed exactly here: its
  // operator is known (Thryv Australia) but its listing pages are 403 and its
  // signup is a JavaScript shell, so nothing but homepage copy was available.
  for (const r of NEW) {
    const u = new URL(r.operator.officialUrl);
    const isBareHome = u.pathname === '/' || u.pathname === '';
    if (isBareHome) {
      // Only permitted when the operator identity is IN the front page itself,
      // which is true for AussieWeb's footer attribution and nothing else here.
      assert.strictEqual(r.id, 'au-aussieweb',
        `${r.id} cites a bare homepage as its operator evidence`);
    }
  }
  assert.ok(!ALL.find((r) => hostOf(r.website) === 'yellowpages.com.au'),
    'Yellow Pages Australia was published, but only homepage and footer copy was reachable');
});

// ── 3. create and claim stay distinct ───────────────────────────────────────
test('create and claim are never conflated', () => {
  const actions = Object.fromEntries(NEW.map((r) => [r.id, r.listingAction]));
  // Seven creates and exactly one create-and-claim. If a later wave upgrades a
  // record to create-and-claim, it must do so deliberately and re-verify.
  assert.strictEqual(actions['au-aussieweb'], 'create-and-claim');
  for (const r of NEW) {
    if (r.id === 'au-aussieweb') continue;
    assert.strictEqual(r.listingAction, 'create',
      `${r.id} asserts "${r.listingAction}" without an independently confirmed second route`);
  }
  // The one create-and-claim must show its evidence for BOTH routes in prose.
  const aw = byId.get('au-aussieweb');
  assert.match(visible(aw), /Claim it!/, 'AussieWeb does not show the claim control it relies on');
  assert.match(visible(aw), /just fill in this form/, 'AussieWeb does not show its creation route');
});

test('a dashboard, an account or the word "claim" is never treated as a claim flow', () => {
  // Scoot has a dashboard. Bizify's FAQ says "claimed your listing". Thomson
  // Local's own structured data says "Claim your FREE advertising spot".
  // None of those is a claim workflow, and all three stayed create.
  for (const id of ['uk-scoot', 'uk-bizify', 'uk-thomson-local']) {
    assert.strictEqual(byId.get(id).listingAction, 'create',
      `${id} was upgraded to a claim action without a documented workflow`);
    assert.strictEqual(byId.get(id).claimUrl, null, `${id} asserts a claim URL`);
  }
  assert.match(limitsOf(byId.get('uk-bizify')), /no claim workflow is documented/i,
    'the Bizify record does not explain why the FAQ’s "claimed" wording was not adopted');
  // FreeIndex is stronger than undocumented: the operator routes you AWAY from
  // claiming. That distinction must survive.
  assert.match(limitsOf(byId.get('uk-freeindex')), /There is no claim flow/i,
    'the FreeIndex record no longer records that claiming is routed elsewhere');
});

// ── 4 + 5. the cost gate ────────────────────────────────────────────────────
test('a free account is never recorded as a free listing', () => {
  // Three records require an account. None of them may call the listing free
  // on that basis; each is freemium on separately documented tier evidence.
  for (const id of ['uk-freeindex', 'uk-bizify', 'ca-n49']) {
    const r = byId.get(id);
    assert.strictEqual(r.registrationRequired, true, `${id} no longer records that an account is needed`);
    assert.notStrictEqual(r.submissionModel, 'free',
      `${id} is recorded free; an account being free establishes nothing about the listing`);
  }
});

test('a premium product never decides the base cost', () => {
  // Every record here has paid tiers. Not one is recorded "paid" because of
  // them, and not one is recorded "free" because a free tier is advertised.
  for (const r of NEW) {
    assert.strictEqual(r.submissionModel, 'freemium',
      `${r.id} is "${r.submissionModel}"; every record in this wave documents both a free and a paid tier`);
  }
  // And the two records whose operators are most explicit must show the split.
  assert.match(visible(byId.get('ca-n49')), /No Website Link/,
    'the n49 record no longer shows what the operator says the free tier lacks');
  assert.match(visible(byId.get('au-aussieweb')), /a single named exception for an optional promoted listing/i,
    'the AussieWeb record no longer shows the exception to "free"');
});

test('AussieWeb was not recorded free despite an absolute free claim', () => {
  // "We will not charge you a cent" is as absolute as an operator gets. The
  // very next clause is "Unless you purchase a Promoted listing". Reading the
  // first without the second is the mistake this test prevents.
  const r = byId.get('au-aussieweb');
  assert.strictEqual(r.submissionModel, 'freemium');
  assert.match(r.editorNotes, /COST DECISION/, 'the cost decision is no longer recorded');
});

// ── 6. reviews do not imply owner responses ─────────────────────────────────
test('a review system never implies that owners can respond', () => {
  const withReviews = NEW.filter((r) => r.reviewSystem === true);
  assert.ok(withReviews.length >= 5, `only ${withReviews.length} records document reviews`);
  for (const r of withReviews) {
    if (r.ownerResponseSupport === true) continue;
    assert.strictEqual(r.ownerResponseSupport, null,
      `${r.id} resolved owner responses to false without evidence of absence`);
  }
  // n49 sells an AI review tool on its top tier. That is not owner responses.
  assert.strictEqual(byId.get('ca-n49').ownerResponseSupport, null);
  assert.match(limitsOf(byId.get('ca-n49')), /AI review tool .* is a separate product/i,
    'the n49 record no longer rejects the AI-tool inference');
});

// ── Pass 2 corrections, pinned so they are not reverted as "caution" ────────
test('the two Pass 2 corrections survive', () => {
  // Thomson Local: drafted null, corrected to true on an actual profile page.
  const tl = byId.get('uk-thomson-local');
  assert.strictEqual(tl.ownerResponseSupport, true,
    'the Thomson Local owner-response correction was reverted');
  assert.match(limitsOf(tl), /advertiser responds to your review/,
    'the evidence for the owner-response correction is no longer shown to a reader');
  assert.match(limitsOf(tl), /whether a free listing can reply is not established/i,
    'the correction was published without its bound');
  assert.match(tl.editorNotes, /PASS 2 CORRECTION/, 'the correction is not recorded');

  // Scoot: drafted null from homepage copy, corrected to true on real results.
  const sc = byId.get('uk-scoot');
  assert.strictEqual(sc.reviewSystem, true, 'the Scoot review correction was reverted');
  assert.match(sc.editorNotes, /PASS 2 CORRECTION/, 'the Scoot correction is not recorded');
  assert.strictEqual(sc.ownerResponseSupport, null,
    'the Scoot correction was over-applied to owner responses');
});

// ── 7. Touch Local ──────────────────────────────────────────────────────────
test('Touch Local stays absorbed into Scoot, on submission-system grounds', () => {
  assert.ok(!byId.get('uk-touch-local'), 'Touch Local was published as a separate record');
  for (const host of ['touchlocal.com', 'touchlocal.co.uk', 'dashboard.scoot.co.uk']) {
    assert.ok(!ALL.find((r) => hostOf(r.website) === host), `${host} was published`);
  }
  const sc = byId.get('uk-scoot');
  assert.match(sc.editorNotes, /TOUCH LOCAL ABSORBED/, 'the absorption is not recorded');
  // The decisive evidence must be the one that actually decides it.
  assert.match(sc.editorNotes, /One submission publishes to both/i,
    'the absorption no longer rests on the submission-system test');
  // And a reader, not only an editor, must be told.
  assert.match(visible(sc), /Touch Local/, 'readers are never told the submission reaches Touch Local');
});

// ── 8 + 9 + CanadaOne. the current-status and acceptance gates ──────────────
test('shut-down, stale and rejected platforms stay unpublished', () => {
  const FORBIDDEN_HOSTS = [
    'ourbis.ca',            // shutting down, by its own announcement
    'brownbook.net',        // self-described search-marketing product
    'canadaone.com',        // reachable, but newest article May 2020
    'profilecanada.com',    // no response on either path
    'startlocal.com.au',    // no response on either path
  ];
  for (const host of FORBIDDEN_HOSTS) {
    assert.ok(!ALL.find((r) => hostOf(r.website) === host),
      `${host} was published despite failing an acceptance or current-status rule`);
  }
  for (const id of ['ca-ourbis', 'uk-brownbook', 'ca-canadaone', 'ca-profilecanada', 'au-startlocal']) {
    assert.ok(!byId.get(id), `${id} was published`);
  }
});

test('411.ca is neither published nor called a duplicate', () => {
  // The subtlest decision in the wave. It would have been easy to absorb it
  // into Yellow Pages because its submission routes there — but its operator
  // and its profile URLs are its own, so a duplicate finding would be invented.
  assert.ok(!ALL.find((r) => hostOf(r.website) === '411.ca'), '411.ca was published');
  const yp = byId.get('ca-yellowpages');
  assert.match(yp.editorNotes, /411\.CA NOT ABSORBED AND NOT PUBLISHED/,
    'the 411.ca decision is no longer recorded');
  assert.match(yp.editorNotes, /transport failure, not absence/i,
    'the record no longer distinguishes 411.ca’s earlier 502 from absence');
});

test('PagesJaunes.ca is absorbed and the surviving record is named', () => {
  assert.ok(!byId.get('ca-pagesjaunes'), 'PagesJaunes.ca was published separately');
  const yp = byId.get('ca-yellowpages');
  assert.match(yp.editorNotes, /PAGESJAUNES\.CA ABSORBED/, 'the absorption is not recorded');
  assert.match(yp.editorNotes, /The surviving record is this one/,
    'the duplicate decision does not name a surviving record');
});

// ── 10. blocked is not absent ───────────────────────────────────────────────
test('no blocked market leader is described as dead, gone or absent', () => {
  // A 403 is a bot filter. Describing Yell as absent would be a false claim
  // about a live business, and the most damaging error available here.
  const BLOCKED = ['Yell', 'TrueLocal', 'Hotfrog', 'Cylex', 'White Pages', 'Yellow Pages Australia'];
  const DEAD = /\b(?:is dead|no longer exists|has shut down|is defunct|has closed|is gone|does not exist|no longer operates)\b/i;
  const prose = ALL.map((r) => `${visible(r)} ${r.editorNotes}`).join(' \n ');
  for (const name of BLOCKED) {
    const re = new RegExp(`[^.!?]*\\b${name}\\b[^.!?]*[.!?]`, 'gi');
    for (const sentence of prose.match(re) || []) {
      assert.ok(!DEAD.test(sentence), `${name} is described as absent or dead: ${sentence.trim()}`);
    }
  }
});

// ── 11. no exhaustive coverage claim ────────────────────────────────────────
test('no country page claims exhaustive or complete coverage', () => {
  const CLAIMS = /\bexhaustive\b|\b(?:complete|comprehensive|definitive) list\b|\b(?:every|all) (?:UK|British|Canadian|Australian) (?:business )?director(?:y|ies)\b/i;
  for (const country of ['united-kingdom', 'canada', 'australia']) {
    const body = bodyText(fs.readFileSync(
      path.join(ROOT, 'research', 'business-directories', country, 'index.html'), 'utf8'));
    assert.ok(!CLAIMS.test(body), `the ${country} page claims exhaustive coverage`);
  }
  // The guard has to be able to fire, or it proves nothing.
  assert.ok(CLAIMS.test('This is an exhaustive list.'), 'the exhaustive-coverage guard cannot fire');
  assert.ok(CLAIMS.test('every UK business directory'), 'the guard misses the plainest phrasing');
});

// ── 12. pending candidates reach no published surface ───────────────────────
test('every browser-pending candidate is absent from the registry, sitemap and feed', () => {
  const PENDING = ['yell', 'truelocal', 'hotfrog', 'cylex', 'whitepages', 'dlook',
    'localsearch', 'ourbis', 'brownbook', 'canadaone', '411', 'misterwhat',
    'profilecanada', 'startlocal', 'touch-local', 'pagesjaunes'];
  const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap-business-directories.xml'), 'utf8');
  const feed = fs.readFileSync(path.join(ROOT, 'research/business-directories/feed.xml'), 'utf8');
  for (const slug of PENDING) {
    assert.ok(!ALL.find((r) => r.slug === slug), `${slug} is in the registry`);
    assert.ok(!new RegExp(`/${slug}/`).test(sitemap), `${slug} is in the sitemap`);
    assert.ok(!new RegExp(`/${slug}/`).test(feed), `${slug} is in the feed`);
  }
  // And the published set must actually be present, or the test above is vacuous.
  for (const r of NEW) {
    assert.ok(sitemap.includes(`/${r.country}/${r.slug}/`), `${r.id} is missing from the sitemap`);
  }
});

// ── 13. no promised SEO outcome ─────────────────────────────────────────────
test('no record promises a backlink, ranking, indexing, traffic or lead outcome', () => {
  const FORBIDDEN = /\b(?:dofollow|nofollow)\b|guaranteed (?:backlink|traffic|ranking|indexing|leads?)|will (?:rank|improve your ranking)|boost your seo|drives traffic|more customers guaranteed/i;
  for (const r of NEW) {
    // The operators' own product wording may be QUOTED, but only inside a
    // limitation, and never as this record's own claim.
    for (const field of [r.description, ...r.pros, ...r.bestFor]) {
      assert.ok(!FORBIDDEN.test(field), `${r.id} makes an unestablished SEO or traffic claim: ${field}`);
    }
    assert.strictEqual(r.backlinkType, null, `${r.id} asserts a link attribute`);
    assert.strictEqual(r.indexed, null, `${r.id} asserts indexing`);
    assert.strictEqual(r.robots, null, `${r.id} asserts a robots posture`);
    assert.strictEqual(r.sitemap, null, `${r.id} asserts a sitemap posture`);
    // Every record must positively disown outcome claims.
    assert.match(limitsOf(r), /No ranking, indexing, traffic or lead outcome is asserted/,
      `${r.id} does not disown outcome claims`);
  }
});

test('the two operators who advertise link attributes are quoted, not believed', () => {
  // n49 sells a "Do follow Website link". Approved Business sells a "Website
  // backlink". Both appear as PAID-tier product descriptions. Neither may
  // become a claim by this platform.
  for (const id of ['ca-n49', 'uk-approved-business']) {
    const r = byId.get(id);
    assert.strictEqual(r.backlinkType, null, `${id} adopted the operator’s link claim`);
    assert.match(r.editorNotes, /is NOT adopted|NOT adopted as a link-attribute claim/i,
      `${id} does not record that the operator’s link wording was not adopted`);
  }
  // And the free tier's absence of a link must reach the reader.
  assert.match(limitsOf(byId.get('ca-n49')), /No Website Link/,
    'the n49 record hides that the free tier carries no link');
});

test('the Bizify contradiction is published rather than resolved silently', () => {
  const r = byId.get('uk-bizify');
  assert.match(visible(r), /We do not provide any warranties or guarantees as to the outcome/,
    'the operator’s own disclaimer is not shown to the reader');
  assert.match(r.editorNotes, /ACCEPTANCE DECISION/,
    'the record does not explain why Bizify was published where Brownbook was not');
});

// ── 14. metrics ─────────────────────────────────────────────────────────────
test('no new record carries a metric and the frozen snapshot is untouched', () => {
  for (const r of NEW) {
    assert.strictEqual(r.domainRating, null, `${r.id} carries a Domain Rating`);
    assert.strictEqual(r.authorityScore, null, `${r.id} carries an authority score`);
    assert.strictEqual(r.estimatedTraffic, null, `${r.id} carries a traffic estimate`);
    assert.strictEqual(r.referringDomains, null, `${r.id} carries a referring-domain count`);
    assert.deepStrictEqual(r.metricsProvenance, {}, `${r.id} invented metrics provenance`);
    assert.strictEqual(r.metricStatus, 'unknown', `${r.id} claims a metric status`);
  }
  const domains = new Set();
  let measured = 0;
  for (const r of ALL) {
    const p = r.metricsProvenance && r.metricsProvenance.domainRating;
    if (p && p.measuredDomain) { domains.add(p.measuredDomain); }
    if (r.domainRating !== null && r.domainRating !== undefined) measured += 1;
  }
  assert.strictEqual(domains.size, 64, 'the frozen measurement set changed size');
  assert.strictEqual(measured, 67, 'the number of records carrying a Domain Rating changed');
});

// ── 16. no network or API dependency ────────────────────────────────────────
test('nothing this wave added introduces a network or API dependency', () => {
  // Scan what SHIPS, not this file: a test that greps for the word "fetch"
  // will always match its own source, which proves nothing.
  const FILES = [
    'data/business-directories/directories/united-kingdom.json',
    'data/business-directories/directories/canada.json',
    'data/business-directories/directories/australia.json',
    ...NEW.map((r) => `research/business-directories/${r.country}/${r.slug}/index.html`),
  ];
  const NETWORK = new RegExp([
    'require\\((?:.)(?:node:)?(?:https?|net|dgram|dns|tls)',
    String.raw`\bfetch\s*\(`, 'XMLHttpRequest', 'axios', 'node-fetch',
  ].join('|'));
  for (const f of FILES) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(!NETWORK.test(src), `${f} introduces a network dependency`);
  }
  // And the repo must still have no package manifest or dependency tree.
  for (const f of ['package.json', 'package-lock.json', 'node_modules']) {
    assert.ok(!fs.existsSync(path.join(ROOT, f)), `${f} appeared; the build is meant to be dependency-free`);
  }
  // No API key or endpoint smuggled into a record.
  for (const r of NEW) {
    const blob = JSON.stringify(r);
    assert.ok(!/api[_-]?key|bearer |authorization:|client_secret/i.test(blob),
      `${r.id} contains something that looks like a credential`);
    for (const url of [r.website, r.submissionUrl, r.operator.officialUrl].filter(Boolean)) {
      assert.match(url, /^https:\/\//, `${r.id} has a non-https URL: ${url}`);
    }
  }
});

// ── 18. every asserted action shows its workflow evidence ───────────────────
test('every asserted listing action is backed by a submission route and visible evidence', () => {
  for (const r of NEW) {
    assert.ok(r.submissionUrl && r.submissionUrl.startsWith('https://'),
      `${r.id} asserts "${r.listingAction}" with no submission route`);
    // The route must belong to the platform or a host it documents.
    const site = hostOf(r.website).split('.').slice(-3).join('.');
    const sub = hostOf(r.submissionUrl);
    const RELATED = { 'ca-yellowpages': 'yp.ca', 'au-aussieweb': 'aussieweb.com.au' };
    assert.ok(sub.endsWith(site) || sub.endsWith(RELATED[r.id] || ' '),
      `${r.id} submits to ${sub}, which is unrelated to ${site} and undocumented`);
  }
});

// ── pillar boundary ─────────────────────────────────────────────────────────
test('no record is a government record or claims to be a registry', () => {
  for (const r of NEW) {
    assert.ok(!S.isGovernmentPillar(r), `${r.id} landed in the Government Registry pillar`);
    assert.deepStrictEqual(r.registryTypes, [], `${r.id} claims a registry type`);
    assert.strictEqual(r.primaryRegistryType, null, `${r.id} claims a primary registry type`);
    assert.strictEqual(r.publicAccess, null, `${r.id} carries a statutory access block`);
    assert.ok(!/\bstatutory\b|official register|source of record/i.test(visible(r)),
      `${r.id} describes a commercial directory in statutory language`);
  }
});

test('no government record in these three countries gained a listing action', () => {
  for (const c of ['united-kingdom', 'canada', 'australia']) {
    for (const r of ALL.filter((x) => x.country === c && S.isGovernmentPillar(x))) {
      assert.strictEqual(r.listingAction, 'not-applicable', `${r.id} gained a listing action`);
      assert.strictEqual(r.submissionModel, 'notApplicable', `${r.id} gained a submission model`);
      assert.strictEqual(r.verificationMethods, null, `${r.id} gained verification methods`);
      assert.strictEqual(r.ownerResponseSupport, null, `${r.id} gained owner-response support`);
    }
  }
});

// ── evidence discipline on the one heavily-asserted record ──────────────────
test('AussieWeb asserts only what its operator documents', () => {
  const r = byId.get('au-aussieweb');
  assert.deepStrictEqual(r.verificationMethods, ['email', 'phone'],
    'the AussieWeb verification methods changed');
  assert.strictEqual(r.verificationRequired, true);
  assert.strictEqual(r.manualReview, true);
  // The website cross-check is corroboration, NOT domain control.
  assert.ok(!r.verificationMethods.includes('domain'),
    'a website consistency check was upgraded into domain verification');
  assert.match(r.editorNotes, /corroboration rather than proof of domain control/i,
    'the record no longer explains why no domain method is claimed');
  // Reviews are genuinely undocumented here and must stay null.
  assert.strictEqual(r.reviewSystem, null, 'AussieWeb reviews were asserted without evidence');
  // The scraper disclosure must reach the reader.
  assert.match(visible(r), /found on publicly available internet sites/,
    'readers are not told most entries were compiled from public sources');
});

test('a required form field is never promoted into a verification method', () => {
  // Thomson Local, Scoot, Bizify and Approved Business all collect contact
  // details. None of them documents verifying any of it.
  for (const id of ['uk-thomson-local', 'uk-scoot', 'uk-bizify', 'uk-approved-business', 'ca-yellowpages']) {
    assert.strictEqual(byId.get(id).verificationMethods, null,
      `${id} asserts verification methods the operator never documented`);
  }
  // FreeIndex is the one email method in the UK set, and it must be bounded.
  const fi = byId.get('uk-freeindex');
  assert.deepStrictEqual(fi.verificationMethods, ['email']);
  assert.match(limitsOf(fi), /It is not verification of the business/i,
    'the FreeIndex record no longer bounds what its email step proves');
});

// ── critical caveats, pinned by content so deletion fails ───────────────────
const CRITICAL_CAVEATS = {
  'uk-thomson-local': [
    [/three-month time limited free business listing/i, 'that the free listing expires'],
    [/citations are provided from a third party/i, 'that much of the database is bought in'],
  ],
  'uk-scoot': [
    [/who may wish to provide services to businesses like yours/i, 'that their details are passed to suppliers'],
    [/automatically added to our network/i, 'that one submission propagates'],
  ],
  'uk-freeindex': [
    [/Franchisee.{0,3}s and branches are automatically rejected/i, 'that franchisees cannot register'],
    [/All duplicates are rejected/i, 'that duplicate registration fails'],
  ],
  'uk-approved-business': [
    [/12 month contract/i, 'that the free package carries a term'],
    [/Displays at the bottom of product and service pages/i, 'where a free listing appears'],
  ],
  'uk-bizify': [
    [/two different registered addresses/i, 'that the operator’s own disclosures disagree'],
  ],
  'ca-yellowpages': [
    [/REQUEST YOUR FREE ONLINE LISTING|requested, not published/i, 'that the listing is requested'],
  ],
  'ca-n49': [
    [/Not Verified/i, 'that the free tier is unverified'],
    [/may change its fees from time to time/i, 'that the free tier is not guaranteed to last'],
  ],
  'au-aussieweb': [
    [/we.{0,3}re not happy promoting our competitors/i, 'that outbound directory links are refused'],
    [/no control over the results that come up from searches/i, 'that search visibility is not controlled'],
  ],
};

test('every critical caveat survives in rendered prose', () => {
  for (const [id, checks] of Object.entries(CRITICAL_CAVEATS)) {
    const v = visible(byId.get(id));
    for (const [re, what] of checks) {
      assert.ok(re.test(v), `${id} no longer tells a reader ${what}`);
    }
  }
});

// ── rendering ───────────────────────────────────────────────────────────────
test('the listing block renders and editor notes do not', () => {
  const LABELS = { create: 'Create a listing', 'create-and-claim': 'Create or claim a profile' };
  for (const r of NEW) {
    const body = bodyText(pageOf(r));
    assert.ok(body.includes(LABELS[r.listingAction]),
      `${r.id} does not render its listing action "${r.listingAction}"`);
    for (const leak of ['PLATFORM OPERATOR:', 'LISTING CONTROL:', 'DUPLICATE DECISION',
      'NOT ASSERTED', 'COST DECISION', 'PASS 2 CORRECTION', 'ACCEPTANCE DECISION',
      'TOUCH LOCAL ABSORBED', 'FEATURE SPLIT NOT ASSERTED', 'VERIFICATION DECISION',
      'SCRAPER DISCLOSURE', 'MARKETING CLAIM NOT ADOPTED']) {
      assert.ok(!body.includes(leak), `${r.id} page publishes the editor note "${leak}"`);
    }
    // Every limitation must actually reach the page.
    for (const con of r.cons) {
      const probe = con.replace(/\s+/g, ' ').slice(0, 40);
      assert.ok(body.includes(probe), `${r.id} limitation does not reach the page: ${probe}`);
    }
  }
});

test('every record documents the four non-statutory identity roles', () => {
  for (const r of NEW) {
    for (const role of ['PLATFORM OPERATOR:', 'LISTING CONTROL:',
      'MODERATION AUTHORITY:', 'PUBLIC INTERFACE:']) {
      assert.ok(r.editorNotes.includes(role), `${r.id} does not determine ${role}`);
    }
    assert.ok(!r.editorNotes.includes('LEGAL SOURCE OF RECORD:'),
      `${r.id} uses the statutory identity contract on a commercial platform`);
  }
});

test('every record was verified on a dated second pass', () => {
  for (const r of NEW) {
    assert.strictEqual(r.lastVerified, '2026-08-06', `${r.id} carries a different verification date`);
    assert.strictEqual(r.verification.source, 'official-documentation', `${r.id} was not verified from official documentation`);
    assert.match(r.editorNotes, /re-verified in a separate direct pass/,
      `${r.id} records no second pass`);
    assert.strictEqual(r.nextVerification, S.nextVerificationFor(r), `${r.id} verification date was hand-set`);
    assert.strictEqual(S.computeScore(r.scoreFactors), r.petroHrysScore, `${r.id} score does not reproduce`);
  }
});

// ── 23. backlog consistency ─────────────────────────────────────────────────
test('the backlog documents this wave, and its browser queue is real', () => {
  const doc = fs.readFileSync(
    path.join(ROOT, 'docs', 'business-directories-verification-backlog.md'), 'utf8');
  const section = doc.slice(doc.indexOf('## Waves 1B.7–1B.9'));
  assert.ok(section.length > 2000, 'the wave is not documented in the backlog');

  // Every published record must appear by name.
  for (const r of NEW) {
    assert.ok(section.includes(r.name), `${r.id} is not in the backlog`);
  }
  // Every blocked candidate must have a queue entry with a URL and an action.
  for (const p of ['Yell', 'Cylex UK', 'TrueLocal', 'Hotfrog', 'White Pages Business',
    'BusinessMagnet', 'dLook', 'Localsearch', 'Yellow Pages Australia']) {
    assert.ok(section.includes(p), `${p} has no browser-queue entry`);
  }
  // A queue entry without a blocker and an action is not a queue entry.
  for (const blocker of ['403', '202, empty body', 'JS shell']) {
    assert.ok(section.includes(blocker), `the queue never records the blocker "${blocker}"`);
  }
  // The three current-status determinations must be recorded with their reasons.
  assert.match(section, /Ourbis[\s\S]{0,200}[Ss]hutting down/, 'the Ourbis finding is not recorded');
  assert.match(section, /CanadaOne[\s\S]{0,300}May 2020/, 'the CanadaOne staleness finding is not recorded');
  assert.match(section, /Brownbook[\s\S]{0,200}search engine marketing/, 'the Brownbook rejection is not recorded');
  // And both Pass 2 corrections. Markdown hard-wraps, so quoted evidence spans
  // line breaks; match against whitespace-normalised prose, not raw source.
  const flat = section.replace(/\s+/g, ' ');
  assert.match(flat, /Pass 2 corrections/i, 'the Pass 2 corrections are not recorded');
  assert.match(flat, /advertiser responds to your review/, 'the Thomson Local correction evidence is missing');
  assert.match(flat, /Be the first to review/, 'the Scoot correction evidence is missing');
});

test('no blocked candidate in the backlog is called dead', () => {
  // The backlog is prose, and prose is where "blocked" quietly becomes "gone".
  const doc = fs.readFileSync(
    path.join(ROOT, 'docs', 'business-directories-verification-backlog.md'), 'utf8');
  const section = doc.slice(doc.indexOf('## Waves 1B.7–1B.9'));
  assert.match(section, /blocked, not absent/i,
    'the backlog no longer states the blocked-is-not-absent rule');
  const DEAD = /\b(?:is dead|no longer exists|is defunct|has closed down)\b/i;
  for (const sentence of section.split(/(?<=[.!?])\s+/)) {
    if (!/Yell|TrueLocal|Hotfrog|Cylex|White Pages|dLook|BusinessMagnet/.test(sentence)) continue;
    assert.ok(!DEAD.test(sentence), `a blocked platform is called dead: ${sentence.trim()}`);
  }
});
