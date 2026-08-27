'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const F = require('../lib/forum-schema.cjs');
const R = require('../research-forums.cjs');
const DISCOVERY = require('../discover-forums.cjs');
const A = require('../apply-forum-findings.cjs');
const D = require('../lib/bd-discovery.cjs');
const O = require('../../js/bd-order.js');
const I18N = require('../lib/i18n.cjs');

const countries = new Set(JSON.parse(fs.readFileSync(path.join(ROOT,
  'data/business-directories/countries.json'), 'utf8')).map((c) => c.slug));

function record(url = 'https://community.example.test/') {
  return {
    id: F.idFor(url, '/'), name: 'Example Community', url,
    canonicalHost: F.canonicalHost(url), forumBasePath: '/', country: null,
    languages: ['en'], primaryLanguage: 'en', primaryTopic: 'TECHNOLOGY_SOFTWARE',
    topics: ['TECHNOLOGY_SOFTWARE'], forumType: 'INDEPENDENT', status: 'ACTIVE',
    lastVerifiedAt: '2026-08-27', software: 'Discourse', description: 'A public technology discussion community.',
    verification: { method: 'DIRECT_HTTP', checkedAt: '2026-08-27', forumIndexUrl: url,
      threadUrls: [`${url}t/one/1`, `${url}t/two/2`], signals: ['forum index', 'persistent topics'],
      latestActivityAt: '2026-08-26' },
  };
}

const schema = {
  facets: [
    { name: 'topic', values: ['TECHNOLOGY_SOFTWARE', 'BUSINESS_ENTREPRENEURSHIP'], multi: true },
    { name: 'country', values: ['germany', 'france'] },
    { name: 'language', values: ['en', 'de'], multi: true },
    { name: 'status', values: ['ACTIVE', 'DORMANT'] },
    { name: 'type', values: ['INDEPENDENT'] },
  ],
  filters: [], sorts: ['as-published', 'domain-rating', 'domain-rating-asc', 'alphabetical'],
  minDr: ['50', '70'],
  exportColumns: ['forum', 'url', 'country', 'language', 'primary_topic', 'topics',
    'forum_type', 'status', 'domain_rating', 'domain_rating_provider', 'last_verified_at'],
};

test('M1 APPLIED -> CAUGHT -> RESTORED: a blog is not accepted as a Forum', async () => {
  const direct = await R.verifyHtmlForum({ discoveredUrl: 'https://blog.example/', sourceName: 'Blog' }, {
    ok: true, challenged: false, url: 'https://blog.example/',
    text: '<html lang="en"><title>Company Blog</title><meta name="description" content="Articles and company news"><a href="/posts/one">One</a><a href="/posts/two">Two</a></html>',
  });
  assert.match(direct.reject, /persistent public discussion/);
});

test('M2 APPLIED -> CAUGHT -> RESTORED: article comments are not Forum threads', async () => {
  const direct = await R.verifyHtmlForum({ discoveredUrl: 'https://news.example/article', sourceName: 'Comments' }, {
    ok: true, challenged: false, url: 'https://news.example/article',
    text: '<html><title>An article</title><meta name="description" content="A news article with reader comments"><a href="#comment-1">Reply</a><a href="#comment-2">Reply</a></html>',
  });
  assert.match(direct.reject, /persistent public discussion/);
});

test('M3 APPLIED -> CAUGHT -> RESTORED: social and chat groups are excluded', () => {
  for (const url of ['https://facebook.com/groups/x', 'https://discord.gg/x',
    'https://workspace.slack.com/x', 'https://t.me/x']) {
    const r = record(); r.url = url; r.canonicalHost = new URL(url).hostname;
    assert.ok(F.problemsFor(r, countries).some((x) => /social\/group host/.test(x)), url);
  }
});

test('M4 APPLIED -> CAUGHT -> RESTORED: nested subforums cannot inflate entity count', () => {
  const a = record('https://forum.example.test/');
  const b = record('https://forum.example.test/cars');
  b.id = F.idFor(b.url, '/cars'); b.forumBasePath = '/cars'; b.verification.forumIndexUrl = b.url;
  assert.throws(() => F.validate([a, b]), /nested subforum identity|duplicate Forum identity/);
  const weak = record(); weak.verification.threadUrls = [weak.verification.threadUrls[0], weak.verification.threadUrls[0]];
  assert.ok(F.problemsFor(weak, countries).some((x) => /distinct persistent discussions/.test(x)));
});

test('M5 APPLIED -> CAUGHT -> RESTORED: www and apex normalize to one identity', () => {
  assert.equal(F.canonicalUrl('http://www.Example.test/forum/?utm_source=x#top'), 'https://example.test/forum');
  assert.equal(F.identityKey({ url: 'https://www.example.test/forum', forumBasePath: '/forum' }),
    F.identityKey({ url: 'https://example.test/forum', forumBasePath: '/forum/' }));
});

test('M6 APPLIED -> CAUGHT -> RESTORED: redirect destinations consolidate', () => {
  const r = record();
  const accepted = A.chooseAccepted([
    { key: 'a', state: 'ACCEPTED', identity: F.identityKey(r), record: r, discoverySource: 'forumotion-directory' },
    { key: 'b', state: 'ACCEPTED', identity: F.identityKey(r), record: { ...r }, discoverySource: 'discourse-discover' },
  ]);
  assert.equal(accepted.accepted.length, 1);
  assert.equal(accepted.consolidated.length, 1);
});

test('M7 APPLIED -> CAUGHT -> RESTORED: network ownership does not merge distinct communities', () => {
  const a = record('https://alpha.example.test/');
  const b = record('https://beta.example.test/');
  const accepted = A.chooseAccepted([
    { key: 'a', state: 'ACCEPTED', identity: F.identityKey(a), record: a, discoverySource: 'forumotion-directory' },
    { key: 'b', state: 'ACCEPTED', identity: F.identityKey(b), record: b, discoverySource: 'forumotion-directory' },
  ]);
  assert.equal(accepted.accepted.length, 2);
});

test('M8 APPLIED -> CAUGHT -> RESTORED: topic classification has no URL input', () => {
  assert.deepEqual(R.classifyTopics('A community for general discussion'), ['GENERAL_MULTI_TOPIC']);
  assert.ok(!R.classifyTopics('A community for general discussion').includes('AUTOMOTIVE'),
    'an automotive-looking domain would have contaminated target evidence');
});

test('M9 APPLIED -> CAUGHT -> RESTORED: language alone never assigns a country', () => {
  assert.equal(R.countryFromEvidence('Eine deutschsprachige Diskussionsgemeinschaft'), null);
  assert.equal(R.countryFromEvidence('A Spanish-language discussion community'), null);
  assert.equal(R.countryFromEvidence('Software products: Rhino, Flamingo, Brazil, Neon'), null);
  assert.equal(R.countryFromEvidence('A database for global, internet-scale applications'), null);
  assert.equal(R.countryFromEvidence('A forum for disability claims in Canada'), 'canada');
  assert.equal(R.countryFromEvidence('A global community of electronics engineers'), 'global');
});

test('discussion language comes from direct visible text, not interface locale alone', () => {
  assert.equal(R.detectLanguageFromText('Welcome to the community for members with questions and discussion'), 'en');
  assert.equal(R.detectLanguageFromText('Willkommen in der Gemeinschaft fuer Mitglieder mit Fragen und Diskussion'), 'de');
  assert.equal(R.detectLanguageFromText('Comunidad para miembros con preguntas sobre temas de discusion'), 'es');
  assert.equal(R.detectLanguageFromText('Community'), null);
  assert.deepEqual(R.detectLanguagesFromText('社区讨论问题成员 欢迎 community discussion for members with questions'), ['zh', 'en']);
});

test('obvious hosted gambling/link-farm shells cannot survive reclassification', () => {
  assert.equal(R.obviousHostedSpam('Promo', 'Situs judi slot online terpercaya nomor 1'), true);
  assert.equal(R.obviousHostedSpam('Poker strategy forum', 'Discuss tournament hands and strategy'), false);
});

test('M10 APPLIED -> CAUGHT -> RESTORED: a fabricated bare DR is invalid', () => {
  const r = { ...record(), domainRating: 75 };
  assert.ok(F.problemsFor(r, countries).some((x) => x.includes('metricsProvenance')));
});

test('M11 APPLIED -> CAUGHT -> RESTORED: measured DR 0 remains a measurement', () => {
  const r = { ...record(), domainRating: 0, metricsProvenance: { domainRating: {
    provider: 'Ahrefs', measuredAt: '2026-08-27', measuredDomain: 'community.example.test',
    status: 'publicApiReading',
  } } };
  assert.equal(F.problemsFor(r, countries).length, 0);
  assert.equal(D.exportCell({ domainRating: 0 }, { key: 'domain_rating', from: 'metric' }), '0');
});

test('M12 APPLIED -> CAUGHT -> RESTORED: DR provenance cannot be stale or failed-shaped', () => {
  const r = { ...record(), domainRating: 60, metricsProvenance: { domainRating: {
    provider: 'Ahrefs', measuredAt: null, measuredDomain: null, status: 'UNRESOLVED',
  } } };
  assert.ok(F.problemsFor(r, countries).some((x) => x.includes('metricsProvenance')));
});

test('M13 APPLIED -> CAUGHT -> RESTORED: WAF and 403 are unread, never DEAD', () => {
  assert.ok(!F.STATUSES.includes('DEAD'));
  const src = fs.readFileSync(path.join(ROOT, 'scripts/research-forums.cjs'), 'utf8');
  assert.match(src, /findingBase\(candidate, 'UNREAD'/);
  assert.match(src, /WAF_OR_CHALLENGE/);
  const browser = fs.readFileSync(path.join(ROOT, 'scripts/research-forums-browser.cjs'), 'utf8');
  assert.match(browser, /launch\(\{ headless: false \}\)/);
  assert.match(browser, /BROWSER_CHALLENGE_OR_EMPTY/);
  assert.ok(!/--disable-blink-features=AutomationControlled|solveCaptcha|setUserAgentOverride/.test(browser));
});

test('M14 APPLIED -> CAUGHT -> RESTORED: old visible activity is not ACTIVE', () => {
  assert.equal(R.statusFromEvidence({ html: '<time datetime="2022-01-01">old</time>' }), 'DORMANT');
  assert.deepEqual(R.activityFromEvidence({ html: '<time datetime="2022-01-01">old</time>' }),
    { status: 'DORMANT', latestActivityAt: '2022-01-01' });
  const unsupported = record(); unsupported.verification.latestActivityAt = null;
  assert.ok(F.problemsFor(unsupported, countries).some((x) => /support ACTIVE/.test(x)));
});

test('M15 APPLIED -> CAUGHT -> RESTORED: explicit archives are ARCHIVED', () => {
  assert.equal(R.statusFromEvidence({ html: '<p>This forum is archived and no longer accepts new posts.</p>' }), 'ARCHIVED');
});

test('M16 APPLIED -> CAUGHT -> RESTORED: no filter query enters the sitemap', () => {
  const xml = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  assert.match(xml, /https:\/\/petrohrys\.com\/research\/forums\//);
  assert.ok(!/<loc>[^<]*\/research\/forums\/\?/.test(xml));
});

function rows() {
  return [
    { name: 'A', haystack: 'alpha technology', domainRating: 80,
      facets: { topic: 'TECHNOLOGY_SOFTWARE', country: 'germany', language: 'de en', status: 'ACTIVE', type: 'INDEPENDENT' }, flags: {},
      exports: { forum: 'A', url: 'https://a.test/', country: 'Germany', language: 'de; en', primary_topic: 'TECHNOLOGY_SOFTWARE', topics: 'TECHNOLOGY_SOFTWARE', forum_type: 'INDEPENDENT', status: 'ACTIVE', domain_rating: '80', domain_rating_provider: 'Ahrefs', last_verified_at: '2026-08-27' } },
    { name: 'B', haystack: 'beta business', domainRating: 60,
      facets: { topic: 'BUSINESS_ENTREPRENEURSHIP', country: 'france', language: 'en', status: 'ACTIVE', type: 'INDEPENDENT' }, flags: {}, exports: { forum: 'B' } },
  ];
}

test('M17 APPLIED -> CAUGHT -> RESTORED: a second facet preserves the first', () => {
  const state = D.selectionFor({ facets: { topic: 'TECHNOLOGY_SOFTWARE', country: 'germany' } }, schema);
  assert.deepEqual(D.evaluateAll(rows(), state).visible, [true, false]);
});

test('M18 APPLIED -> CAUGHT -> RESTORED: Forum filters are one AND intersection', () => {
  const state = D.selectionFor({ facets: { topic: 'TECHNOLOGY_SOFTWARE', country: 'france' } }, schema);
  assert.equal(D.evaluateAll(rows(), state).shown, 0, 'OR composition would have returned both rows');
});

test('M19 APPLIED -> CAUGHT -> RESTORED: DR sort round-trips with facet state', () => {
  const state = { q: '', facets: { topic: 'TECHNOLOGY_SOFTWARE', country: 'germany' }, filters: [],
    jurisdiction: '', sort: 'domain-rating', minDr: '70', linkType: '', indexability: '' };
  const qs = D.serializeState(state, schema);
  const parsed = D.parseState(new URLSearchParams(qs), schema);
  assert.equal(parsed.facets.topic, state.facets.topic);
  assert.equal(parsed.facets.country, state.facets.country);
  assert.equal(parsed.sort, 'domain-rating');
});

test('M20 APPLIED -> CAUGHT -> RESTORED: CSV is the visible sorted set exactly', () => {
  const visible = O.sortRecords(rows(), 'domain-rating').slice(0, 1);
  const csv = D.renderFilteredCsv(visible, D.exportColumns(schema));
  assert.equal(csv.split('\r\n').length - 2, visible.length);
  assert.match(csv, /\r\nA,https:\/\/a\.test\//);
  assert.ok(!csv.includes('\r\nB,'));
});

test('M21 APPLIED -> CAUGHT -> RESTORED: browser cohort guards require real rows', () => {
  const pages = ['research/forums/index.html', 'de/research/forums/index.html',
    'es/research/forums/index.html', 'fr/research/forums/index.html'];
  for (const page of pages) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    assert.ok((html.match(/class="bd-row"/g) || []).length >= 1500, `${page} has an empty/vacuous cohort`);
  }
});

test('M22 APPLIED -> CAUGHT -> RESTORED: listeners are not added during apply', () => {
  const client = fs.readFileSync(path.join(ROOT, 'js/business-directories.js'), 'utf8');
  const apply = client.slice(client.indexOf('function apply()'), client.indexOf('// ── URL STATE'));
  assert.ok(!apply.includes('addEventListener'));
  assert.equal((client.match(/exportBtn\.addEventListener\('click'/g) || []).length, 1);
});

test('M23 APPLIED -> CAUGHT -> RESTORED: locale pages share canonical Forum identities', () => {
  const canonical = F.load(path.join(ROOT, 'data/forums/forums.json'));
  for (const locale of I18N.LOCALE_CODES) {
    const file = path.join(ROOT, I18N.localizedFile(locale, '/research/forums/'));
    const html = fs.readFileSync(file, 'utf8');
    const ids = new Set([...html.matchAll(/data-bd-export-url="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&')));
    assert.equal(ids.size, canonical.length, `${locale} Forum identities diverged`);
  }
});

test('M24 APPLIED -> CAUGHT -> RESTORED: the Forum generator has no network path', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/build-forums.cjs'), 'utf8');
  for (const token of ['fetch(', 'https.request', 'http.request', 'node:https', 'node:http']) {
    assert.ok(!src.includes(token), `offline generator contains ${token}`);
  }
});

test('M25 APPLIED -> CAUGHT -> RESTORED: Forum existence cannot create Planner READY', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/lib/distribution-planner.cjs'), 'utf8');
  assert.ok(!/data\/forums|forums\.json|sourceCollection:\s*['"]forums/.test(src));
  const P = require('../lib/distribution-planner.cjs');
  const projected = P.project(P.loadAll());
  assert.equal(projected.length, 2432);
  assert.ok(projected.every((x) => x.sourceCollection !== 'forums'));
});

test('Forum taxonomy and localized labels are complete', () => {
  for (const locale of I18N.LOCALE_CODES) {
    const t = I18N.translator(locale);
    for (const topic of F.TOPICS) assert.ok(t(`forumTopic.${topic}`));
    for (const type of F.FORUM_TYPES) assert.ok(t(`forumType.${type}`));
    for (const status of F.STATUSES) assert.ok(t(`forumStatus.${status}`));
  }
});

test('software-family discovery rounds are explicit and remain candidate-only', () => {
  const expected = ['XenForo', 'phpBB', 'vBulletin', 'Invision Community', 'MyBB', 'Flarum', 'Vanilla', 'Custom'];
  const rounds = DISCOVERY.discoverSoftwareRounds();
  assert.ok(rounds.length >= expected.length);
  for (const software of expected) {
    assert.ok(rounds.some((r) => r.softwareHint === software), `${software} discovery round missing`);
  }
  assert.ok(rounds.every((r) => r.source === 'software-round' && !r.record && !r.verification));
});
