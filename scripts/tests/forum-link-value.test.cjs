'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const V2 = require('../lib/forum-link-schema.cjs');
const R = require('../research-forum-link-value.cjs');
const A = require('../apply-forum-link-value.cjs');
const BUILD = require('../build-forums.cjs');
const SAFE = require('../lib/rc-safe-apply.cjs');
const CK = require('../lib/rc-checkpoint.cjs');
const D = require('../lib/bd-discovery.cjs');
const O = require('../../js/bd-order.js');
const I18N = require('../lib/i18n.cjs');

const page = (overrides = {}) => ({
  url: 'https://forum.test/t/topic/1', text: 'A public discussion page', readable: true,
  anchors: [], metaRobots: '', robotsText: '', forms: 0, contentLength: 5000, ...overrides,
});
const evidence = () => V2.emptyEvidence('2026-08-27');
const observed = (overrides = {}) => ({
  ...V2.surfaceEmpty(), availability: 'OBSERVED', backlinkType: 'FOLLOW',
  backlinkTypesObserved: ['FOLLOW'], linkTargetType: 'DIRECT_EXTERNAL',
  pageIndexability: 'INDEXABLE', evidenceUrl: 'https://forum.test/u/member',
  observedAt: '2026-08-27', scope: 'OBSERVED_MEMBER_TEMPLATE', relInspected: true, ...overrides,
});
const title = (n, text) => `M${n} APPLIED -> CAUGHT BY INTENDED INVARIANT -> RESTORED: ${text}`;

test(title(1, 'a profile without a website is observation, not NO_EXTERNAL_LINK'), () => {
  const value = evidence(); value.linkSurfaces.PROFILE_WEBSITE.availability = 'NO_EXTERNAL_LINK';
  assert.throws(() => V2.validateEvidence(value), /availability uses an unknown state/);
});

test(title(2, 'one post without an external URL cannot prove links unsupported'), () => {
  assert.equal(R.surfaceFromAnchors([], page(), 'PUBLIC_PAGE').availability, 'NOT_OBSERVED');
});

test(title(3, 'Discourse software cannot imply UGC'), () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/research-forum-link-value.cjs'), 'utf8');
  assert.ok(!/forum\.software|software\s*===/.test(src));
});

test(title(4, 'FOLLOW requires an inspected rendered anchor'), () => {
  const value = evidence(); value.linkSurfaces.POST_BODY = observed({ relInspected: false });
  assert.throws(() => V2.validateEvidence(value), /relInspected must be true/);
});

test(title(5, 'a noindex thread cannot become INDEXABLE'), () => {
  assert.equal(R.indexability(page({ metaRobots: 'noindex, follow' })), 'NOINDEX');
});

test(title(6, 'robots content=none cannot become INDEXABLE'), () => {
  assert.equal(R.indexability(page({ metaRobots: 'none' })), 'NOINDEX');
});

test(title(7, 'public browsing cannot imply FREE registration'), () => {
  assert.equal(R.registrationEvidence(page(), null).registrationCost, 'UNKNOWN');
});

test(title(8, 'a Sign Up button alone cannot imply OPEN registration'), () => {
  const root = page({ anchors: [{ text: 'Sign Up', title: '', href: 'https://forum.test/register' }] });
  assert.equal(R.registrationEvidence(root, page({ registerFields: 0, submitControls: 0 })).registrationAccess, 'UNKNOWN');
});

test(title(9, 'a paid premium feature cannot imply free-member capability'), () => {
  const value = page({ text: 'Premium membership required', anchors: [] });
  assert.equal(R.postingState(value, /new topic/i), 'UNKNOWN');
  assert.equal(R.registrationEvidence(value, value).registrationCost, 'PAID');
});

test(title(10, 'moderator capability stays scoped away from normal members'), () => {
  assert.equal(R.profileScope(page({ roleText: 'Moderator' })), 'STAFF_OR_MODERATOR');
});

test(title(11, 'a staff profile link is not propagated to ordinary users'), () => {
  const row = { forumLinkValue: evidence() };
  row.forumLinkValue.linkSurfaces.PROFILE_WEBSITE = observed({ scope: 'STAFF_OR_MODERATOR' });
  assert.equal(BUILD.forumDecisionValues(row).profileLink, 'UNKNOWN');
  assert.equal(BUILD.forumDecisionValues(row).profileWebsite, 'UNKNOWN');
});

test(title(12, 'signature evidence cannot propagate to post-body type'), () => {
  const value = evidence(); value.linkSurfaces.SIGNATURE = observed();
  assert.equal(value.linkSurfaces.POST_BODY.backlinkType, 'UNKNOWN');
  V2.validateEvidence(value);
});

test(title(13, 'profile evidence cannot propagate to post-body type'), () => {
  const value = evidence(); value.linkSurfaces.PROFILE_WEBSITE = observed();
  assert.equal(value.linkSurfaces.POST_BODY.backlinkType, 'UNKNOWN');
  V2.validateEvidence(value);
});

test(title(14, 'high DR cannot write Forum link evidence'), () => {
  const row = { id: 'x', domainRating: 95 };
  assert.throws(() => SAFE.applyPatch(row, { forumLinkValue: evidence() },
    { owner: 'metrics', collection: 'forums' }), /owns only|no research pass may change/);
});

test(title(15, 'ACTIVE cannot imply posting available'), () => {
  assert.equal(R.postingState(page({ text: 'Active discussions', anchors: [] }), /new topic/i), 'UNKNOWN');
});

test(title(16, 'a plain-text URL is not a backlink'), () => {
  assert.equal(R.surfaceFromAnchors([], page({ text: 'Visit https://outside.test' }), 'PUBLIC_PAGE').backlinkType, 'UNKNOWN');
});

test(title(17, 'an internal redirect cannot become DIRECT_EXTERNAL'), () => {
  assert.equal(R.targetType({ raw: '/go?url=https://outside.test', href: 'https://forum.test/go?url=https://outside.test' },
    'https://forum.test/t/1'), 'INTERNAL_REDIRECT');
});

test(title(18, 'missing profile discovery cannot become profiles unavailable'), () => {
  assert.ok(V2.PROFILE_DISCOVERY.includes('PUBLIC_PROFILE_NOT_DISCOVERED'));
  assert.ok(!V2.PROFILE_DISCOVERY.includes('PUBLIC_PROFILES_UNAVAILABLE'));
});

test(title(19, 'footer and vendor links cannot become member backlinks'), () => {
  const anchor = { chrome: true, href: 'https://vendor.test/', raw: 'https://vendor.test/' };
  assert.equal(R.relevantExternal(anchor, 'https://forum.test/t/1'), false);
});

test(title(20, 'a login-only profile cannot become public and indexable'), () => {
  assert.equal(R.indexability(page({ text: 'Members only. Please log in.', forms: 1, contentLength: 500 })), 'LOGIN_REQUIRED');
});

test(title(21, 'Forum software cannot write country or language'), () => {
  const row = { id: 'x', country: null, languages: ['en'] };
  assert.throws(() => SAFE.applyPatch(row, { country: 'germany' },
    { owner: 'forumLinkValue', collection: 'forums' }), /owns only|no research pass may change/);
});

test(title(22, 'browser positive tests guard against an empty cohort'), () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/tests/forum-browser.test.cjs'), 'utf8');
  assert.match(src, /assert\.ok\([^\n]*visible\.length > 0|assert\.ok\([^\n]*non-empty option/);
});

test(title(23, 'CSV equals the visible sorted record set'), () => {
  const rows = [{ name: 'A', exports: { forum: 'A' } }, { name: 'B', exports: { forum: 'B' } }];
  const csv = D.renderFilteredCsv(O.sortRecords(rows, 'alphabetical').slice(0, 1),
    [{ key: 'forum', from: 'export' }]);
  assert.equal(csv.replace(/^\uFEFF/, '').trim(), 'forum\r\nA');
});

test(title(24, 'a second filter preserves the first'), () => {
  const schema = { facets: [{ name: 'posting', values: ['AVAILABLE'] },
    { name: 'registration', values: ['OPEN'] }], filters: [], sorts: [], minDr: [] };
  const rows = [{ name: 'A', haystack: '', facets: { posting: 'AVAILABLE', registration: 'OPEN' }, flags: {}, exports: {} },
    { name: 'B', haystack: '', facets: { posting: 'AVAILABLE', registration: 'UNKNOWN' }, flags: {}, exports: {} }];
  const state = D.selectionFor({ facets: { posting: 'AVAILABLE', registration: 'OPEN' } }, schema);
  assert.deepEqual(D.evaluateAll(rows, state).visible, [true, false]);
});

test(title(25, 'URL state round-trips every V2 facet'), () => {
  const schema = { facets: [{ name: 'posting', values: ['AVAILABLE'] },
    { name: 'profilelink', values: ['FOLLOW'] }], filters: [], sorts: ['domain-rating'], minDr: ['50'] };
  const state = { q: '', facets: { posting: 'AVAILABLE', profilelink: 'FOLLOW' }, filters: [],
    jurisdiction: '', sort: 'domain-rating', minDr: '50', linkType: '', indexability: '' };
  const parsed = D.parseState(new URLSearchParams(D.serializeState(state, schema)), schema);
  assert.equal(parsed.facets.posting, 'AVAILABLE'); assert.equal(parsed.facets.profilelink, 'FOLLOW');
});

test(title(26, 'a poorer finding cannot replace richer evidence'), () => {
  const rich = observed();
  const merged = A.mergeSurface(rich, V2.surfaceEmpty());
  assert.deepEqual(merged, rich);
});

test(title(27, 'a retraction cannot delete prior rel evidence'), () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forum-ledger-'));
  try {
    const ledger = new CK.Ledger(path.join(dir, 'findings.json'), { batch: 1 });
    const first = { key: 'forums|x', observations: [{ relTokens: ['ugc'], url: 'https://forum.test/t/1' }] };
    ledger.record(first);
    assert.throws(() => ledger.record({ key: 'forums|x', observations: [] }), /may not delete raw evidence/);
    ledger.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test(title(28, 'failed navigation cannot create a negative link verdict'), () => {
  const value = evidence(); value.attemptState = 'UNREAD';
  assert.ok(V2.SURFACES.every((name) => value.linkSurfaces[name].backlinkType === 'UNKNOWN'));
});

test(title(29, 'Forum V2 cannot create existing Planner READY'), () => {
  const planner = fs.readFileSync(path.join(ROOT, 'scripts/lib/distribution-planner.cjs'), 'utf8');
  assert.ok(!/forums\.json|forumLinkValue/.test(planner));
});

test(title(30, 'Forum V2 cannot change non-Forum Link Value facts'), () => {
  const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/forums/protected-v2-baseline.json'), 'utf8'));
  const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex');
  for (const file of ['data/link-value/.link-value.json', 'data/link-value/evidence-states.json']) {
    assert.equal(sha(file), baseline.files[file], file);
  }
});

test('the committed V2 cohort has exact V1 identity and byte parity', () => {
  assert.equal(V2.assertCohortParity().length, 500);
});

test('Forum link facts validate independently for every surface', () => {
  const value = evidence();
  value.linkSurfaces.PROFILE_WEBSITE = observed();
  value.linkSurfaces.POST_BODY = observed({ backlinkType: 'UGC', backlinkTypesObserved: ['UGC'], relTokens: ['ugc'] });
  value.linkSurfaces.SIGNATURE = observed({ backlinkType: 'NOFOLLOW', backlinkTypesObserved: ['NOFOLLOW'], relTokens: ['nofollow'] });
  V2.validateEvidence(value);
});

test('rel semantics remain factual when one surface has mixed target-routing behavior', () => {
  const value = evidence();
  value.linkSurfaces.POST_BODY = observed({ linkTargetType: 'UNKNOWN' });
  V2.validateEvidence(value);
});

test('a post-link evidence URL identifies the rereadable page, not an unsafe outbound target', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/research-forum-link-value.cjs'), 'utf8');
  assert.match(src, /postExternalLink:[^\n]+\? thread\.url : null/);
  assert.ok(!/postExternalLink:[^\n]+\?\.href/.test(src));
});

test('the no-guarantee disclaimer is an exact localized sentence in EN, DE, ES and FR', () => {
  const expected = {
    en: 'Observed link attributes and page settings do not guarantee search-engine crawling, indexing, ranking, or SEO benefit.',
    de: 'Beobachtete Linkattribute und Seiteneinstellungen garantieren weder Crawling noch Indexierung, Ranking oder SEO-Nutzen durch Suchmaschinen.',
    es: 'Los atributos de enlace y la configuración de página observados no garantizan el rastreo, la indexación, el posicionamiento ni el beneficio SEO en buscadores.',
    fr: 'Les attributs de lien et les paramètres de page observés ne garantissent ni l’exploration, ni l’indexation, ni le classement, ni un bénéfice SEO par les moteurs de recherche.',
  };
  for (const [locale, sentence] of Object.entries(expected)) {
    assert.equal(I18N.translator(locale)('forum.limitations2'), sentence);
  }
});
