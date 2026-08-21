'use strict';

// What a listing links like, and what may never be inferred about it.
//
// This dimension exists because a source can be high Domain Rating, free, and
// READY, and still hand a business a rel="nofollow" link — or no external
// anchor at all. Four unrelated facts about four unrelated things.
//
// The requirement here is unusual and worth stating: ZERO false-positive
// FOLLOW classifications. A wrong nofollow understates a source. A wrong
// dofollow tells someone they have earned a link they have not, which is the
// one error this dimension must never make.
//
// It made it three times while being built, and each one is a test below. All
// three came from the same place — not from reading rel attributes wrongly,
// but from reading the wrong PAGE and then reading its rel attribute
// perfectly.

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '..', '..');
const L = require(path.join(ROOT, 'scripts/research-link-value.cjs'));
const S = require(path.join(ROOT, 'scripts/lib/bd-schema.cjs'));
const SAFE = require(path.join(ROOT, 'scripts/lib/rc-safe-apply.cjs'));

const LISTING = 'https://dir.test/company/acme-ltd-1234';
const anchorPage = (text, href, rel = '') => ({
  anchors: [{ href, raw: href, rel, relRead: true, text }],
  text: '', buttonCount: 0,
});

// ── M1 / M2 / M3: THE REL TOKENS THEMSELVES ────────────────────────────────

test('M1: rel="nofollow" is never dofollow', () => {
  assert.equal(L.classifyRel('nofollow').type, 'nofollow');
  assert.equal(L.classifyRel('noopener nofollow').type, 'nofollow');
  assert.equal(L.classifyRel('NOFOLLOW').type, 'nofollow');
});

test('M2: rel="ugc" is never dofollow', () => {
  assert.equal(L.classifyRel('ugc').type, 'ugc');
  assert.equal(L.classifyRel('noopener ugc noreferrer').type, 'ugc');
});

test('M3: rel="sponsored" is never dofollow', () => {
  assert.equal(L.classifyRel('sponsored').type, 'sponsored');
  assert.equal(L.classifyRel('sponsored nofollow').type, 'sponsored');
});

test('every rel token is preserved, not flattened to one', () => {
  const v = L.classifyRel('noopener nofollow ugc');
  assert.deepEqual(v.tokens, ['noopener', 'nofollow', 'ugc']);
  assert.notEqual(v.type, 'dofollow');
});

test('rel tokens that say nothing about following are ignored', () => {
  // noopener and noreferrer are security and privacy hints. Neither prevents
  // the link from being an ordinary follow link, and treating them as if they
  // did would understate half the web.
  assert.equal(L.classifyRel('noopener noreferrer').type, 'dofollow');
  assert.equal(L.classifyRel('').type, 'dofollow');
});

// ── M10: MISSING EVIDENCE IS NOT FOLLOW ────────────────────────────────────

test('M10: an anchor whose rel was never read cannot be classified', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/research-link-value.cjs'), 'utf8');
  // An absent rel attribute means follow — that is what the web says. Never
  // having looked means nothing at all. The two are different states and the
  // researcher records which one it is in.
  assert.match(src, /relRead: true/, 'reading the attribute is recorded explicitly');
  assert.match(src, /if \(!anchor\.relRead\)/, 'an unread anchor produces no link type');
  assert.match(src, /unread: true/);
});

test('a page that could not be read produces no link type at all', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/research-link-value.cjs'), 'utf8');
  assert.match(src, /state: 'UNREADABLE'/);
  assert.ok(!/backlinkType: 'dofollow'/.test(src.slice(src.indexOf('UNREADABLE'))),
    'no default is ever substituted for an unread page');
});

// ── M6: A REDIRECT IS NOT A DIRECT LINK ────────────────────────────────────

test('M6: /out?url= is an internal redirect, not a direct external anchor', () => {
  const t = (raw, href) => L.targetTypeOf({ raw, href }, LISTING);
  assert.equal(t('/out?url=https://acme.test', 'https://dir.test/out?url=https://acme.test'),
    'internal-redirect');
  assert.equal(t('/go/1234', 'https://dir.test/go/1234'), 'internal-redirect');
  assert.equal(t('/redirect?target=https://acme.test', 'https://dir.test/redirect?target=https://acme.test'),
    'internal-redirect');
  // A crawler following that sees a link to the DIRECTORY. Whether anything
  // reaches the business depends on the directory's own redirect and robots
  // rules, which is a different fact we do not have.
  assert.equal(t('https://acme.test/', 'https://acme.test/'), 'direct');
});

test('M6: a javascript: href is not a crawlable link', () => {
  assert.equal(L.targetTypeOf({ raw: 'javascript:void(0)', href: 'javascript:void(0)' }, LISTING),
    'javascript-redirect');
});

test('M6: the two are stored in different fields', () => {
  assert.deepEqual(S.LINK_TARGET_TYPES, ['direct', 'internal-redirect', 'javascript-redirect']);
  const owned = SAFE.ownedFields('linkvalue', 'directories');
  assert.ok(owned.includes('backlinkType') && owned.includes('linkTargetType'),
    'link type and target type are separate facts');
});

// ── M11: A BUTTON IS NOT A LINK ────────────────────────────────────────────

test('M11: a control that renders no anchor is not a link', () => {
  assert.equal(L.pickWebsiteAnchor({ anchors: [], buttonCount: 12, text: '' }, LISTING), null);
  const src = fs.readFileSync(path.join(ROOT, 'scripts/research-link-value.cjs'), 'utf8');
  assert.match(src, /querySelectorAll\('a\[href\]'\)/, 'only anchors are collected');
});

// ── M5 / M4: THE PAGE THE LINK SITS ON ─────────────────────────────────────

test('M5: a noindex listing page is recorded as noindex', () => {
  assert.equal(L.indexabilityOf({ metaRobots: 'noindex, follow', text: '' }), 'noindex');
  assert.equal(L.indexabilityOf({ metaRobots: 'index, follow', text: 'Acme Ltd' }), 'indexable');
});

test('M4: a login wall is not a public page', () => {
  assert.equal(L.indexabilityOf({ metaRobots: '', text: 'Please sign in to view contact details' }),
    'login-required');
  assert.equal(L.indexabilityOf({ metaRobots: '', text: 'Members only. Please log in.' }),
    'login-required');
});

test('indexability is its own field, with its own vocabulary', () => {
  assert.deepEqual(S.LISTING_INDEXABILITY, ['indexable', 'noindex', 'robots-blocked', 'login-required']);
});

// ── M7 / M8: NOTHING ELSE MAY IMPLY A LINK TYPE ────────────────────────────

test('M7: Domain Rating cannot write a link type', () => {
  const row = { id: 'x', domainRating: 91 };
  assert.throws(
    () => SAFE.applyPatch(row, { backlinkType: 'dofollow' }, { owner: 'metrics', collection: 'directories' }),
    /owns only|no research pass may change/,
    'the metrics owner must not be able to assert a link type',
  );
  assert.equal(row.backlinkType, undefined);
});

test('M8: a free listing cannot write a link type', () => {
  const row = { id: 'x', submissionModel: 'free' };
  assert.throws(
    () => SAFE.applyPatch(row, { backlinkType: 'dofollow' }, { owner: 'cost', collection: 'directories' }),
    /owns only|no research pass may change/,
  );
  assert.equal(row.backlinkType, undefined);
});

test('and link value cannot write back the other way', () => {
  const row = { id: 'x', domainRating: 10, submissionModel: 'paid', listingAction: 'create' };
  for (const patch of [{ domainRating: 90 }, { submissionModel: 'free' }, { listingAction: 'claim' }]) {
    assert.throws(() => SAFE.applyPatch(row, patch, { owner: 'linkvalue', collection: 'directories' }),
      /owns only|no research pass may change/);
  }
  assert.equal(row.domainRating, 10);
  assert.equal(row.submissionModel, 'paid');
});

// ── M9: ONE LISTING IS NOT EVERY LISTING ───────────────────────────────────

test('M9: "mixed" needs two inspected templates that differ', () => {
  const base = { backlinkType: 'mixed' };
  const oneTemplate = S.backlinkProblems({
    ...base,
    backlinkProvenance: { listingUrl: 'https://d.test/c/1', observedAt: '2026-08-20', templates: ['free'] },
  });
  assert.ok(oneTemplate.some(([f]) => f === 'backlinkProvenance.templates'),
    'a single observation cannot support a claim about several templates');

  const twoTemplates = S.backlinkProblems({
    ...base,
    backlinkProvenance: {
      listingUrl: 'https://d.test/c/1',
      observedAt: '2026-08-20',
      templates: [{ listingUrl: 'https://d.test/c/1', backlinkType: 'dofollow' },
        { listingUrl: 'https://d.test/c/2', backlinkType: 'nofollow' }],
    },
  });
  assert.deepEqual(twoTemplates, []);
});

test('M9: two listings that disagree resolve to mixed, not to the first one', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/research-link-value.cjs'), 'utf8');
  assert.match(src, /if \(types\.length > 1\)[\s\S]{0,200}backlinkType: 'mixed'/);
});

// ── PROVENANCE IS NOT OPTIONAL ─────────────────────────────────────────────

test('a link type without provenance is refused', () => {
  const p = S.backlinkProblems({ backlinkType: 'dofollow' });
  assert.ok(p.some(([f]) => f === 'backlinkProvenance'));
});

test('provenance must name the listing and the date', () => {
  assert.ok(S.backlinkProblems({
    backlinkType: 'dofollow',
    backlinkProvenance: { observedAt: '2026-08-20', externalUrl: 'https://a.test/' },
  }).some(([f]) => f === 'backlinkProvenance.listingUrl'));

  assert.ok(S.backlinkProblems({
    backlinkType: 'dofollow',
    backlinkProvenance: { listingUrl: 'https://d.test/c/1', externalUrl: 'https://a.test/' },
  }).some(([f]) => f === 'backlinkProvenance.observedAt'));
});

test('"none" may not carry a link, and a link type may not lack one', () => {
  assert.ok(S.backlinkProblems({
    backlinkType: 'none',
    backlinkProvenance: { listingUrl: 'https://d.test/c/1', observedAt: '2026-08-20', externalUrl: 'https://a.test/' },
  }).some(([f]) => f === 'backlinkProvenance.externalUrl'));

  assert.ok(S.backlinkProblems({
    backlinkType: 'dofollow',
    backlinkProvenance: { listingUrl: 'https://d.test/c/1', observedAt: '2026-08-20' },
  }).some(([f]) => f === 'backlinkProvenance.externalUrl'));
});

test('an unrecognised link type is refused', () => {
  assert.ok(S.backlinkProblems({ backlinkType: 'follow' }).some(([f]) => f === 'backlinkType'));
  assert.ok(S.backlinkProblems({ linkTargetType: 'redirect' }).some(([f]) => f === 'linkTargetType'));
  assert.ok(S.backlinkProblems({ listingIndexability: 'crawlable' }).some(([f]) => f === 'listingIndexability'));
});

// ── THE THREE FALSE POSITIVES THIS DIMENSION ACTUALLY PRODUCED ─────────────
//
// None of them was a rel attribute read wrongly. All three were the wrong page,
// read perfectly.

test('a platform footer link is not a business website link', () => {
  // First run: four "dofollow" verdicts, all of them a platform's own footer.
  // The rule that produced them was "the label starts with the host's first
  // word", which matched "Developers" beside developer.android.com and
  // "Investors" beside investor.pinterestinc.com.
  for (const [text, href] of [
    ['Developers', 'http://developer.android.com/index.html'],
    ['Investors', 'https://investor.pinterestinc.com/investor-overview/default.aspx'],
    ['Subscribe to blog', 'https://forms.feedblitz.com/ea4?src=topnavbutton'],
    ['Sign in with Adobe ID', 'https://ims-na1.adobelogin.com/ims/authorize/v1'],
  ]) {
    assert.equal(L.pickWebsiteAnchor(anchorPage(text, href), LISTING), null,
      `"${text}" must not be read as a business website link`);
  }
});

test('a bare-URL label only counts when it points at a front door', () => {
  // Second run: Squarespace's support article printed "https://sqsp.link/hMaBjw"
  // as its own link text, and a short-link to a help asset became a dofollow
  // backlink. A business's website link goes to its homepage.
  assert.equal(L.pickWebsiteAnchor(anchorPage('https://sqsp.link/hMaBjw', 'https://sqsp.link/hMaBjw'), LISTING), null);
  assert.equal(L.pickWebsiteAnchor(anchorPage('bit.ly/abc123', 'https://bit.ly/abc123'), LISTING), null);
  // A later batch removed the bare-domain path altogether, so this one is now
  // refused as well. Measured over 21 resolutions, an explicitly LABELLED
  // anchor was right 4 times out of 4 and a bare domain 9 times out of 16.
  assert.equal(L.pickWebsiteAnchor(anchorPage('acme.test', 'https://acme.test/'), LISTING), null);
  assert.ok(L.pickWebsiteAnchor(anchorPage('Website', 'https://acme.test/'), LISTING));
});

test('the platform talking about itself is not a listing', () => {
  // Third run: Alibaba's category page (linking to its own sister site
  // 1688.com) and Semrush's cookie-policy page (linking to allaboutcookies.org)
  // both resolved. Contact words identify a contact page just as well as a
  // profile, which is why the URL has to be excluded outright.
  for (const p of ['/category/smart-watches_127684037.html', '/company/legal/cookie-policy/',
    '/hc/en-us/articles/33258341881869', '/dp/B00D1ARZMC/', '/en-us/security/business/get-started/contact-us',
    '/store/apps/eventdetails/4828997282539043473', '/us/iphone/editorial/6753950852']) {
    assert.ok(L.NOT_A_LISTING.test(p), `${p} must never be treated as a business listing`);
  }
  // And a real one still is.
  for (const p of ['/partnerplus/directory/company/7008',
    '/wien/der-bestatter-franz-etl-gmbh-7696884.html', '/firmen/acme-gmbh-98765.html']) {
    assert.ok(!L.NOT_A_LISTING.test(p), `${p} is a real listing`);
  }
});

test('a website link must be labelled as one', () => {
  // The single guard that carries the zero-false-positive requirement.
  for (const label of ['Website', 'Visit website', 'Webseite', 'Sitio web', 'Site web',
    'Strona internetowa', 'веб-сайт']) {
    assert.ok(L.WEBSITE_LABEL.test(label), `${label} names a website`);
  }
  for (const label of ['Learn more', 'Developers', 'Investors', 'Contact', 'Read more', 'Directions']) {
    assert.ok(!L.WEBSITE_LABEL.test(label), `${label} does not`);
  }
});

// ── M12: A LINK DOES NOT MAKE A RECORD READY ───────────────────────────────

test('M12: the planner has never heard of link value', () => {
  const engine = fs.readFileSync(path.join(ROOT, 'scripts/lib/dp-engine.cjs'), 'utf8');
  for (const field of ['backlinkType', 'linkTargetType', 'listingIndexability', 'backlinkProvenance']) {
    assert.ok(!engine.includes(field),
      `the planner must not read ${field} — a follow link is not an action route`);
  }
});

// ── RESEARCH NEVER TOUCHES THE CORPUS ──────────────────────────────────────

test('the researcher writes only its own findings file', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/research-link-value.cjs'), 'utf8');
  const probe = src.slice(src.indexOf('async function runProbe'), src.indexOf('function report'));
  assert.ok(!/writeFileSync/.test(probe), 'the research stage writes no canonical file');
  assert.match(src, /const FINDINGS = path\.join\(ROOT, 'data\/link-value\/\.link-value\.json'\)/);
});

test('no listing is ever created for research', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/research-link-value.cjs'), 'utf8');
  // Only navigation and reading. Nothing submits anything.
  for (const forbidden of ['Input.dispatchKeyEvent', 'form.submit', '.click()', 'Page.navigate({ url: submit']) {
    assert.ok(!src.includes(forbidden), `${forbidden} would mean interacting with a site, not reading it`);
  }
});

test('the build never invokes link-value research', () => {
  const r = require('node:child_process').spawnSync('git',
    ['grep', '-l', 'research-link-value', '--', 'scripts/build-*.cjs', 'scripts/run-tests.cjs', 'js/'],
    { cwd: ROOT, encoding: 'utf8' });
  assert.equal((r.stdout || '').trim(), '', 'nothing in the build path may invoke it');
});

// ── THE SIX FALSE DOFOLLOWS FROM THE FIRST REAL BATCH ──────────────────────
//
// Twenty-one records resolved and eleven said dofollow. Six of those eleven
// were the platform's own furniture, and they all got in the same way: the
// anchor label WAS a bare domain, which is exactly how a real directory prints
// a business's website.

const page = (text, href, chrome = false) => ({
  anchors: [{ href, raw: href, rel: '', relRead: true, text, chrome }],
  text: '', buttonCount: 0,
});

test('a platform\'s own country domain is not a business website', () => {
  // "OLX.bg" on an OLX page, "AbeBooks.co.uk" on an AbeBooks page.
  assert.equal(L.pickWebsiteAnchor(page('OLX.bg', 'https://olx.bg/'), 'https://www.olx.pl/x/y-1234'), null);
  assert.equal(L.pickWebsiteAnchor(page('AbeBooks.co.uk', 'https://www.abebooks.co.uk/'),
    'https://www.abebooks.com/books/x-1234'), null);
  // A genuinely different business is untouched — when the operator labels it.
  assert.ok(L.pickWebsiteAnchor(page('Website', 'https://www.theexpress.nl/'),
    'https://www.webwinkelkeur.nl/webshop/TheeXpress-nl_10624'));
});

test('an anchor in the footer or nav is site furniture', () => {
  // mobile.de on Kleinanzeigen, dpa.com on Presseportal, superlawyers.com on
  // FindLaw — three sibling companies under three different names, none of
  // which shares a brand token, all of them in the chrome of the page.
  for (const [text, href] of [['mobile.de', 'https://www.mobile.de/'],
    ['Homepage', 'http://www.dpa.com/'], ['SuperLawyers.com', 'https://www.superlawyers.com/']]) {
    assert.equal(L.pickWebsiteAnchor(page(text, href, true), 'https://dir.test/company/x-1234'), null,
      `${text} sits in the furniture`);
  }
  // The same anchor inside the profile body is evidence, once labelled.
  assert.ok(L.pickWebsiteAnchor(page('Website', 'https://acme.test/', false),
    'https://dir.test/company/x-1234'));
  // And in the furniture it is not, however it is labelled.
  assert.equal(L.pickWebsiteAnchor(page('Website', 'https://acme.test/', true),
    'https://dir.test/company/x-1234'), null);
});

test('a tracking parameter cannot make a category page look like a listing', () => {
  // OLX's /dla-dzieci/artykuly-szkolne/plecaki-szkolne/?utm_campaign=...2026
  // satisfied a "path ends in four or more digits" test on its query string.
  const tail = L.LISTING_TAIL;
  assert.equal(tail.test('/dla-dzieci/artykuly-szkolne/plecaki-szkolne/'), false);
  assert.ok(tail.test('/wien/der-bestatter-franz-etl-gmbh-7696884.html'));
});

test('a blog subdomain is not a listing, however its path reads', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/research-link-value.cjs'), 'utf8');
  assert.match(src, /NOT_A_LISTING_HOST/,
    'blog.mappy.com carried a privacy notice that resolved as a business listing');
  const rx = /NOT_A_LISTING_HOST = (\/.*\/i);/.exec(src);
  assert.ok(rx);
  // eslint-disable-next-line no-eval
  const pattern = eval(rx[1]);
  for (const h of ['blog.mappy.com', 'support.example.com', 'rulechannel.alibaba.com', 'hi.omr.com']) {
    assert.ok(pattern.test(h), `${h} is the platform talking, not listing`);
  }
  assert.ok(!pattern.test('www.ibm.com'));
  assert.ok(!pattern.test('trustedtraders.which.co.uk'));
});

// ── LISTING INDEXABILITY IS ITS OWN FACT ───────────────────────────────────

test('G: page indexability is stored and filtered separately from link type', () => {
  const owned = SAFE.ownedFields('linkvalue', 'directories');
  assert.ok(owned.includes('backlinkType') && owned.includes('listingIndexability'));
  // Two independent filters, neither derived from the other.
  const known = { linkTypes: ['follow'], indexability: ['indexable'], facets: [], filters: [], sorts: [] };
  const followOnNoindex = { backlinkType: 'dofollow', listingIndexability: 'noindex' };
  const nofollowOnIndexable = { backlinkType: 'nofollow', listingIndexability: 'indexable' };
  const D2 = require(path.join(ROOT, 'scripts/lib/bd-discovery.cjs'));
  const want = (linkType, indexability) => D2.selectionFor(
    { linkType, indexability, facets: {}, filters: [] }, known,
  );
  assert.equal(D2.evaluate(followOnNoindex, want('follow', '')).visible, true);
  assert.equal(D2.evaluate(followOnNoindex, want('follow', 'indexable')).visible, false,
    'a follow link on a noindex page must not answer "indexable"');
  assert.equal(D2.evaluate(nofollowOnIndexable, want('', 'indexable')).visible, true);
  assert.equal(D2.evaluate(nofollowOnIndexable, want('follow', 'indexable')).visible, false);
});

test('M9: a noindex page is never reported as indexable', () => {
  assert.equal(L.indexabilityOf({ metaRobots: 'noindex', text: '' }), 'noindex');
  assert.equal(L.indexabilityOf({ metaRobots: 'noindex, nofollow', text: '' }), 'noindex');
  assert.equal(L.indexabilityOf({ metaRobots: 'none', text: '' }) === 'indexable', false,
    '"none" means noindex,nofollow');
});

test('M14: unknown is never converted into "no external link"', () => {
  const D2 = require(path.join(ROOT, 'scripts/lib/bd-discovery.cjs'));
  const known = { linkTypes: ['none', 'unknown'], facets: [], filters: [], sorts: [] };
  const unresearched = {};
  const noLink = { backlinkType: 'none' };
  const askNone = D2.selectionFor({ linkType: 'none', facets: {}, filters: [] }, known);
  assert.equal(D2.evaluate(unresearched, askNone).visible, false,
    'a source nobody inspected must not answer "no external link"');
  assert.equal(D2.evaluate(noLink, askNone).visible, true);
  // And the schema refuses a "none" that carries a link.
  assert.ok(S.backlinkProblems({
    backlinkType: 'none',
    backlinkProvenance: { listingUrl: 'https://d.test/c/1', observedAt: '2026-08-21', externalUrl: 'https://a.test/' },
  }).length);
});

// ── M12 / M13: EVIDENCE DOES NOT TRAVEL ────────────────────────────────────

test('M12: one country\'s listing evidence is not propagated to siblings', () => {
  // Identity is country + host, and the applier keys on the record id. A
  // finding carries the listing URL it came from, so a sibling record cannot
  // silently inherit it.
  const src = fs.readFileSync(path.join(ROOT, 'scripts/research-link-value.cjs'), 'utf8');
  assert.match(src, /byKey\.set\(`\$\{f\.collection\}:\$\{f\.id\}`, f\)/,
    'findings are applied per record identity, never per host');
  assert.ok(!/registrable\(|hostOf\(r\.website\)/.test(src.slice(src.indexOf('function runApply'))),
    'the applier must not group records by host');
});

test('M13: a paid template does not speak for the free one', () => {
  // Two templates that disagree resolve to mixed, and the schema refuses
  // "mixed" unless two differing templates were actually inspected.
  const oneOnly = S.backlinkProblems({
    backlinkType: 'mixed',
    backlinkProvenance: {
      listingUrl: 'https://d.test/c/1', observedAt: '2026-08-21',
      templates: [{ listingUrl: 'https://d.test/c/1', backlinkType: 'dofollow' }],
    },
  });
  assert.ok(oneOnly.some(([f]) => f === 'backlinkProvenance.templates'));
  const src = fs.readFileSync(path.join(ROOT, 'scripts/research-link-value.cjs'), 'utf8');
  assert.match(src, /if \(types\.length > 1\)[\s\S]{0,240}backlinkType: 'mixed'/,
    'the researcher must not pick the more favourable of two templates');
});

// ── M15: A LINK IS NOT A ROUTE ─────────────────────────────────────────────

test('M15: FOLLOW cannot create Planner READY', () => {
  const engine = fs.readFileSync(path.join(ROOT, 'scripts/lib/dp-engine.cjs'), 'utf8');
  for (const field of ['backlinkType', 'listingIndexability', 'linkTargetType', 'backlinkProvenance']) {
    assert.ok(!engine.includes(field), `the planner must not read ${field}`);
  }
});

// ── M17: THE CSV AGREES WITH THE TABLE ─────────────────────────────────────

test('M17: the export reads the same fields the filter does', () => {
  const D2 = require(path.join(ROOT, 'scripts/lib/bd-discovery.cjs'));
  const known = { linkTypes: ['follow'], indexability: ['indexable'], facets: [], filters: [], sorts: [] };
  const cols = D2.exportColumns(known).map((c) => c.key);
  for (const c of ['link_type', 'link_target_type', 'listing_page_indexability',
    'link_evidence_checked_at']) {
    assert.ok(cols.includes(c), `${c} must be exported where the page offers the filter`);
  }
  // And an unresearched record exports blank, never a guess.
  assert.equal(D2.exportCell({}, { key: 'link_type', from: 'linkType' }), '');
  assert.equal(D2.exportCell({}, { key: 'listing_page_indexability', from: 'listingIndexability' }), '');
  assert.equal(D2.exportCell({}, { key: 'link_evidence_checked_at', from: 'linkCheckedAt' }), '');
  // A measured one exports what was measured.
  assert.equal(D2.exportCell({ backlinkType: 'nofollow' }, { key: 'link_type', from: 'linkType' }), 'nofollow');
});

// ── M18: THE APPLIER STAYS INSIDE ITS CONTRACT ─────────────────────────────

test('M18: the applier cannot touch a description or a note', () => {
  const row = { id: 'x', note: 'written by a person', description: 'also written by a person' };
  for (const field of ['note', 'description', 'shortNote', 'limitations']) {
    assert.throws(
      () => SAFE.applyPatch(row, { [field]: 'rewritten' }, { owner: 'linkvalue', collection: 'directories' }),
      /owns only|no research pass may change/,
      `linkvalue must not be able to write ${field}`,
    );
  }
  assert.equal(row.note, 'written by a person');
  assert.equal(row.description, 'also written by a person');
});

test('the applier validates against the schema before it writes', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/research-link-value.cjs'), 'utf8');
  const apply = src.slice(src.indexOf('function runApply'));
  assert.match(apply, /S\.backlinkProblems\(\{ \.\.\.r, \.\.\.patch \}\)/,
    'a finding that cannot justify itself must never reach the corpus');
  assert.match(apply, /tally\.refused \+= 1/);
});

// ── PRODUCT WORDING STAYS FACTUAL ──────────────────────────────────────────

test('no locale promises an SEO outcome', () => {
  // Two groups. The first may never appear anywhere. The second is the word
  // "guarantee" in four languages, which the help text is allowed to use
  // BECAUSE it is negating it — and the separate test below checks that the
  // negation is actually there. Keying the exemption off the English stem
  // missed "garantiert" and "garantiza" entirely.
  const NEVER = [/passes? authority/i, /will (be )?index/i, /higher rank/i, /boost.*rank/i];
  const ONLY_NEGATED = [/guarantee/i, /garantiz/i, /garantie/i, /garantiert/i, /garanti/i];
  for (const loc of ['en', 'de', 'es', 'fr']) {
    const strings = JSON.parse(fs.readFileSync(path.join(ROOT, `data/i18n/${loc}.json`), 'utf8'));
    for (const [key, value] of Object.entries(strings)) {
      if (!/linkType|listingPage/.test(key)) continue;
      for (const bad of NEVER) {
        assert.ok(!bad.test(value), `${loc} ${key} promises an outcome: ${value}`);
      }
      if (key === 'bd.linkType.help') continue;
      for (const bad of ONLY_NEGATED) {
        assert.ok(!bad.test(value), `${loc} ${key} uses the language of guarantees: ${value}`);
      }
    }
  }
});

test('the help text says plainly that nothing downstream is guaranteed', () => {
  for (const loc of ['en', 'de', 'es', 'fr']) {
    const strings = JSON.parse(fs.readFileSync(path.join(ROOT, `data/i18n/${loc}.json`), 'utf8'));
    const help = strings['bd.linkType.help'];
    assert.ok(help, `${loc} has no help text`);
    assert.match(help, /not guaranteed|nicht garantiert|no se garantiza|ne sont pas garantis/i);
  }
});

// ── TENDERS ARE OUT OF SCOPE, DELIBERATELY ─────────────────────────────────

test('tender platforms are not given a link-value field they cannot have', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/research-link-value.cjs'), 'utf8');
  const collections = src.slice(src.indexOf('const COLLECTIONS'), src.indexOf('// Hosts a listing'));
  assert.ok(!collections.includes('tenders-procurement/platforms.json'),
    'a procurement portal publishes no public business profile carrying the supplier website');
  assert.match(src, /Tender platforms are deliberately absent/);
  const owned = SAFE.OWNERSHIP.linkvalue;
  assert.ok(!owned.tenders, 'linkvalue owns nothing on tenders');
});

test('M12: a shared host does not let one country speak for another', () => {
  // FindYello is why this exists. jm-findyello is a Jamaica record whose
  // website is the regional root findyello.com/, and every listing reachable
  // from it was /barbados/... — so Jamaica was given Barbados's evidence purely
  // because the two share a host. Sharing a host is not sharing a template.
  assert.equal(L.wrongCountry('https://www.findyello.com/barbados/steamatic/profile/', 'jamaica'), true);
  assert.equal(L.wrongCountry('https://www.findyello.com/barbados/steamatic/profile/', 'barbados'), false);
  // A listing with no country in its path is judged on other grounds.
  assert.equal(L.wrongCountry('https://www.cylex.us.com/company/x-1234.html', 'united-states'), false);
  assert.equal(L.wrongCountry('https://www.example.de/firmen/acme-1234.html', 'germany'), false);
});

test('M12: no applied record carries another country\'s listing', () => {
  const files = ['data/business-directories/opportunities.json',
    'data/marketplaces/marketplaces.json', 'data/media-pr-publishing/media-platforms.json'];
  let checked = 0;
  for (const rel of files) {
    for (const r of JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'))) {
      const p = r.backlinkProvenance;
      if (!p || !p.listingUrl) continue;
      checked += 1;
      assert.equal(L.wrongCountry(p.listingUrl, r.country), false,
        `${r.id} (${r.country}) cites ${p.listingUrl}`);
    }
  }
  assert.ok(checked > 0, 'the cohort must not be empty');
});

// ── EVIDENCE STATES: SEPARATING WITHOUT PROMOTING ──────────────────────────
//
// The corpus recorded 1961 sources as UNKNOWN. That one word was covering five
// different situations the research pass had already distinguished — a listing
// read and carrying no link, a listing read whose link could not be attributed,
// a listing discovered and unread, a platform offering no discoverable listing,
// and a platform that never rendered. Only the last is ignorance.
//
// Separating them is worth doing only if it moves nobody up the ladder.

const EV = require(path.join(ROOT, 'scripts/report-link-evidence.cjs'));

test('the deriver opens nothing and writes no canonical field', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/report-link-evidence.cjs'), 'utf8');
  for (const forbidden of ['cdp.cjs', 'launch(', 'openPage', 'fetch(', 'https.get', 'http.get']) {
    assert.ok(!src.includes(forbidden), `${forbidden} would mean new network work`);
  }
  // The only file it may write is its own derived artefact.
  const writes = [...src.matchAll(/writeFileSync\(([A-Za-z_.]+)/g)].map((m) => m[1]);
  assert.deepEqual(writes, ['ARTEFACT'], 'the deriver may write only its own artefact');
});

test('nothing is promoted: VERIFIED_FOLLOW only where the corpus already says so', () => {
  const rows = EV.derive();
  assert.ok(rows.length > 1000, 'the cohort must not be empty');
  for (const r of rows) {
    if (r.evidenceState === 'VERIFIED_FOLLOW') {
      assert.equal(r.canonicalLinkType, 'dofollow',
        `${r.id} claims verified follow without the canonical fact`);
    }
    if (r.canonicalLinkType === 'dofollow') {
      assert.equal(r.evidenceState, 'VERIFIED_FOLLOW');
    }
  }
});

test('an absent listing is never read as an absent link', () => {
  // The distinction the brief is most explicit about: NO_PUBLIC_LISTING_DISCOVERED
  // is a fact about the platform, and says nothing about what its listings carry.
  assert.equal(EV.evidenceStateOf({
    state: 'NO_LISTING_FOUND', why: 'no public business listing was reachable from the front page',
  }), 'NO_PUBLIC_LISTING_DISCOVERED');
  assert.equal(EV.evidenceStateOf({
    state: 'RESOLVED', backlinkType: 'none',
  }), 'PUBLIC_LISTING_OBSERVED_NO_EXTERNAL_LINK');
  // And neither of those is the other.
  assert.notEqual('NO_PUBLIC_LISTING_DISCOVERED', 'PUBLIC_LISTING_OBSERVED_NO_EXTERNAL_LINK');

  const rows = EV.derive();
  for (const r of rows) {
    if (r.evidenceState === 'NO_PUBLIC_LISTING_DISCOVERED') {
      assert.equal(r.canonicalLinkType, null,
        `${r.id} has a canonical link type from a platform where no listing was found`);
    }
  }
});

test('a discovered-but-unread listing is not evidence about its links', () => {
  assert.equal(EV.evidenceStateOf({
    state: 'UNREADABLE', why: 'the listing pages could not be read',
  }), 'PUBLIC_LISTING_DISCOVERED_NOT_READ');
  // A platform that never rendered is plain ignorance, and must not borrow the
  // stronger state just because both were filed as UNREADABLE.
  assert.equal(EV.evidenceStateOf({
    state: 'UNREADABLE', why: 'browser: navigation timeout',
  }), 'UNKNOWN');
});

test('disqualified evidence is not weak evidence', () => {
  // An event page, and another country's listing on a shared host. Both were
  // refused for cause, so neither leaves a residue on the ladder.
  assert.equal(EV.evidenceStateOf({
    state: 'UNRESOLVED', why: 'the only evidence came from an event page or a platform link, not a business placement',
  }), 'UNKNOWN');
  assert.equal(EV.evidenceStateOf({
    state: 'UNRESOLVED', why: "the only listings reachable were another country's on a shared host",
  }), 'UNKNOWN');
});

test('an unattributed link is not "no link", and not a follow link either', () => {
  const s = EV.evidenceStateOf({
    state: 'UNRESOLVED', why: 'the website link was not labelled as one by the operator',
  });
  assert.equal(s, 'PUBLIC_LISTING_OBSERVED_LINK_UNATTRIBUTED');
  assert.notEqual(s, 'PUBLIC_LISTING_OBSERVED_NO_EXTERNAL_LINK');
  assert.ok(!s.startsWith('VERIFIED'));
});

test('an indexable page never becomes a follow link', () => {
  const rows = EV.derive();
  const indexableUnproven = rows.filter((r) => r.listingIndexability === 'indexable'
    && !r.canonicalLinkType);
  for (const r of indexableUnproven) {
    assert.notEqual(r.evidenceState, 'VERIFIED_FOLLOW',
      `${r.id} was promoted by its page being indexable`);
  }
  // And the two axes stay separate in the schema.
  const owned = SAFE.ownedFields('linkvalue', 'directories');
  assert.ok(owned.includes('backlinkType') && owned.includes('listingIndexability'));
});

test('the derived states cover every record exactly once', () => {
  const rows = EV.derive();
  const known = new Set(EV.STATES);
  for (const r of rows) assert.ok(known.has(r.evidenceState), `${r.evidenceState} is not on the ladder`);
  // And the separation is real rather than a relabelling of everything as
  // UNKNOWN: most of the corpus must land on a rung that says something.
  const informative = rows.filter((r) => r.evidenceState !== 'UNKNOWN').length;
  assert.ok(informative > rows.length / 2,
    `only ${informative} of ${rows.length} records carry any observation`);
});
