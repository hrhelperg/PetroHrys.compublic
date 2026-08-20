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
