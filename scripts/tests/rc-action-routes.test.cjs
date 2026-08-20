'use strict';

// Finding a route a business can act on, without inventing one.
//
// Every earlier phase in this corpus failed the same way before it succeeded: a
// word that meant something else. "Free" that meant free delivery. "Commission"
// that meant a committee. "Supplier fee" inside "supplier feedback". This one
// arrived with its own on the first sample of forty — a German city portal
// whose petrol-price page, "Benzinpreise", matched a link vocabulary that
// contained "preise".
//
// So the tests here are mostly about refusing things.

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const ROOT = path.resolve(__dirname, '..', '..');
const R = require(path.join(ROOT, 'scripts/research-action-routes.cjs'));
const SAFE = require(path.join(ROOT, 'scripts/lib/rc-safe-apply.cjs'));
const CK = require(path.join(ROOT, 'scripts/lib/rc-checkpoint.cjs'));
const S = require(path.join(ROOT, 'scripts/lib/bd-schema.cjs'));
const MP = require(path.join(ROOT, 'scripts/lib/mp-schema.cjs'));

const pad = (s) => `${s} ${'context '.repeat(30)}`;

// ── M1 / M6: WHAT IS NOT AN ACTION ──────────────────────────────────────────

test('M1: a generic registration or login never becomes an action', () => {
  for (const wording of [
    'Register', 'Sign up', 'Create an account', 'Log in to your account',
    'Registrieren', 'Anmelden', 'Iniciar sesión', 'Créer un compte',
    'Register now to receive our newsletter',
    'Create a free account to save your favourites',
  ]) {
    assert.strictEqual(R.judgeAction('directories', pad(wording)), null,
      `"${wording}" became a listing action`);
    assert.strictEqual(R.judgeAction('marketplaces', pad(wording)), null,
      `"${wording}" became a seller action`);
  }
});

test('M6: a URL path establishes nothing', () => {
  // The researcher judges TEXT. The path is never consulted, and this asserts
  // it at the source rather than trusting the pipeline.
  const src = fs.readFileSync(path.join(ROOT, 'scripts/research-action-routes.cjs'), 'utf8');
  const judge = src.slice(src.indexOf('function judgeAction'), src.indexOf('function judgeBid'));
  assert.ok(judge.length > 100, 'could not isolate the judgement');
  for (const forbidden of ['pathname', '.href', 'url.path', 'link.href']) {
    assert.ok(!judge.includes(forbidden), `the judgement reads ${forbidden}`);
  }
  // A path full of promising words decides nothing on its own. The hyphens are
  // the point: "add-your-company" is a slug, and the vocabulary is written in
  // the words a page says, not the words a route is spelled with.
  assert.strictEqual(R.judgeAction('directories',
    pad('https://example.test/business-listings/add-your-company')), null,
  'a URL slug produced an action');
  // The same site, saying it in prose, resolves — so the refusal above is
  // about the slug and not about the vocabulary being unreachable.
  assert.strictEqual(R.judgeAction('directories',
    pad('Add your company to the register and reach new customers')), 'create');
});

test('a page must say enough to be read at all', () => {
  assert.strictEqual(R.judgeAction('directories', 'Add your business'), null,
    'a fragment shorter than the evidence floor produced an action');
});

// ── THE ACTION VOCABULARY IS THE COLLECTION'S OWN ───────────────────────────

test('every action this researcher can produce already exists in a schema', () => {
  const directoryActions = ['create', 'claim'];
  for (const a of directoryActions) {
    assert.ok(S.LISTING_ACTIONS.includes(a), `${a} is not a directory listing action`);
  }
  for (const a of ['publish-classified', 'create-seller-profile', 'post-advertisement']) {
    assert.ok(MP.SELLER_ACTIONS.includes(a), `${a} is not a marketplace seller action`);
  }
  // Nothing else may be produced: the keys of CONFIRMS are the whole universe.
  for (const key of Object.keys(R.CONFIRMS)) {
    assert.ok(S.LISTING_ACTIONS.includes(key) || MP.SELLER_ACTIONS.includes(key),
      `${key} is an invented action type`);
  }
});

test('a real listing invitation still resolves, in several languages', () => {
  // The rule must not have been tightened into uselessness.
  for (const [wording, language] of [
    ['Add your business to our directory and reach local customers', 'English'],
    ['Firma eintragen und von Kunden gefunden werden', 'German'],
    ['Ajouter votre entreprise à notre annuaire', 'French'],
    ['Añadir empresa al directorio profesional', 'Spanish'],
    ['Přidat firmu do katalogu', 'Czech'],
    ['Lisää yrityksesi hakemistoon', 'Finnish'],
    ['Tambah bisnis anda ke direktori kami', 'Indonesian'],
  ]) {
    assert.strictEqual(R.judgeAction('directories', pad(wording)), 'create',
      `${language}: a genuine listing invitation was refused`);
  }
  for (const [wording, language] of [
    ['Become a seller and start selling today', 'English'],
    ['Verkäufer werden und sofort verkaufen', 'German'],
    ['Devenir vendeur sur notre plateforme', 'French'],
    ['Daftar penjual dan mulai berjualan', 'Indonesian'],
  ]) {
    assert.strictEqual(R.judgeAction('marketplaces', pad(wording)), 'create-seller-profile',
      `${language}: a genuine seller invitation was refused`);
  }
});

// ── M21 / M22: UNICODE ──────────────────────────────────────────────────────

test('M21/M22: non-ASCII wording is reachable, and Turkish i folds', () => {
  const T = require(path.join(ROOT, 'scripts/lib/rc-text-match.cjs'));
  // The library refuses to compile the defect rather than matching nothing.
  assert.throws(() => T.patternMatcher([/\bfirma\b/]), /cannot assert next to non-ASCII/);
  // Turkish dotted capital İ does not lowercase to ASCII i.
  assert.notEqual('İlan'.toLowerCase(), 'ilan');
  assert.ok(R.LINK_MATCH('İlan ver'), 'the Turkish link wording is unreachable');
  assert.ok(R.LINK_MATCH('Dodaj ogłoszenie'), 'Polish diacritics are unreachable');
  assert.ok(R.LINK_MATCH('добавить компанию'), 'Cyrillic is unreachable');
  assert.ok(R.LINK_MATCH('ลงประกาศ'), 'Thai is unreachable');
});

test('the loose word that produced the first false positive is gone', () => {
  // "Benzinpreise" — petrol prices — matched a link vocabulary containing
  // "preise", and the page it led to then resolved as a business listing.
  assert.ok(!R.LINK_MATCH('Benzinpreise'), '"preise" is back in the link vocabulary');
  assert.ok(!R.LINK_MATCH('Preise'), 'a bare pricing word is a candidate link again');
  assert.ok(!R.LINK_MATCH('Fees'), 'a bare fees word is a candidate link again');
  assert.ok(!R.LINK_MATCH('Suppliers'), 'a bare suppliers word is a candidate link again');
  // The specific supplier wording that names an act survives.
  assert.ok(R.LINK_MATCH('Supplier registration'));
});

test('the anchor and the destination have to agree', () => {
  // A footer saying "add your business" appears on every page of a site, so a
  // link about something else can lead to a page that mentions the action. The
  // researcher requires both, and this asserts the requirement is in the code.
  const src = fs.readFileSync(path.join(ROOT, 'scripts/research-action-routes.cjs'), 'utf8');
  assert.match(src, /anchorAgrees/, 'the anchor/destination agreement was removed');
  assert.match(src, /action && anchorAgrees/, 'the agreement is no longer required to resolve');
});

// ── M3 / M19 / M20: TENDER ACCESS ───────────────────────────────────────────

test('M3/M19: free notice search never becomes free bidding', () => {
  for (const wording of [
    'Search all public tenders free of charge',
    'Free access to tender notices for everyone',
    'Browse opportunities at no cost',
    'View contract notices without registering',
  ]) {
    const v = R.judgeBid(pad(wording));
    assert.ok(!v || v.bidAccess !== 'free',
      `"${wording}" established free bidding from free searching`);
  }
  // And a real participation statement still resolves.
  assert.strictEqual(R.judgeBid(pad('Supplier registration is free; there is no fee to register'))
    .bidAccess, 'free');
});

test('M20: a bid bond or document fee is not the platform charging', () => {
  for (const wording of [
    'A bid security of 2% of the contract value must accompany each tender',
    'Tender documents may be purchased for a document fee of 500',
    'A performance bond is required from the successful bidder',
  ]) {
    const v = R.judgeBid(pad(wording));
    assert.ok(!v || v.bidAccess !== 'paid',
      `"${wording}" became a platform participation fee`);
  }
  assert.strictEqual(R.judgeBid(pad('An annual subscription fee is payable by each supplier'))
    .bidAccess, 'paid');
});

test('a page stating both routes resolves to neither', () => {
  const v = R.judgeBid(pad('Registration is free. An annual subscription fee applies to premium suppliers.'));
  assert.ok(!v || v.bidAccess === undefined, 'a contradictory page produced a verdict');
});

// ── M11 / M23: TRANSPORT AND PARKED DOMAINS ─────────────────────────────────

test('M11: a refusal is never death', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/research-action-routes.cjs'), 'utf8');
  const research = src.slice(src.indexOf('async function research'), src.indexOf('// ── RUN'));
  assert.ok(research.length > 300, 'could not isolate the research path');
  // Comments are excluded: the reason 403 is not death is written down beside
  // the code, and grepping the prose for the word it argues against fails on
  // the explanation rather than on the behaviour.
  const code = research.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  assert.ok(!/DEAD/.test(code), 'the researcher can conclude a record is dead');
  assert.match(research, /NEEDS_BROWSER/, 'a refused request does not defer to a browser');
  // Every non-ok transport lands in NEEDS_BROWSER, never in a verdict.
  assert.match(research, /if \(!home\.ok\)[\s\S]{0,400}NEEDS_BROWSER/);
});

test('M23: a parked domain cannot be rescued by its own brand name', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/research-action-routes.cjs'), 'utf8');
  const research = src.slice(src.indexOf('async function research'), src.indexOf('// ── RUN'));
  // Parked is checked BEFORE any link is followed, so a for-sale page cannot
  // offer a candidate link and talk its way into a resolution.
  assert.ok(research.indexOf('PARKED') < research.indexOf('candidateLinks'),
    'links are harvested before the parked-domain check');
});

// ── M16 / M18: THE APPLIER ──────────────────────────────────────────────────

test('M16: the applier can only write what its owner owns', () => {
  // The fields no owner may ever touch, and the ones this owner specifically
  // may not. `note` is deliberately NOT in this list for directories and media:
  // the contract does grant it there, and asserting otherwise would be this
  // test inventing a rule the repository does not have.
  for (const collection of ['directories', 'marketplaces', 'media']) {
    for (const field of ['name', 'country', 'domainRating', 'website', 'currentStatus']) {
      assert.throws(
        () => SAFE.applyPatch({ id: 'x' }, { [field]: 'x' }, { owner: 'actionability', collection }),
        /owns only|no research pass may change/,
        `actionability can write ${collection}.${field}`,
      );
    }
  }
  // Bid access belongs to the cost owner. An action-route pass reaching for it
  // would be one research tool quietly deciding another's fact.
  assert.throws(() => SAFE.applyPatch({ id: 'x' }, { bidAccess: 'free' },
    // The refusal is even earlier than "owns only": actionability has no
    // contract for tenders at all, which is the correct shape — the Planner
    // does not project tender platforms, so there is no action for a route
    // pass to establish on one.
    { owner: 'actionability', collection: 'tenders' }), /has no contract for/);
  assert.doesNotThrow(() => SAFE.applyPatch({ id: 'x' }, { bidAccess: 'free' },
    { owner: 'cost', collection: 'tenders' }));
});

test('an action outside the collection vocabulary is refused, not absorbed', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/research-action-routes.cjs'), 'utf8');
  assert.match(src, /is not in \$\{name\}'s action vocabulary/,
    'the applier no longer refuses an unknown action type');
});

// ── M30: PROGRESS SURVIVES ──────────────────────────────────────────────────

test('M30: an interrupted run keeps every record it already judged', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-ar-'));
  const file = path.join(dir, 'f.json');
  const led = new CK.Ledger(file);
  for (let i = 1; i <= 7; i += 1) {
    led.record({ key: `route|directories|c${i}|h${i}.test`, collection: 'directories', id: `d${i}`, state: 'UNRESOLVED' });
  }
  led.close(); // the shape of a process that was killed, with no compaction
  const reopened = new CK.Ledger(file);
  assert.strictEqual(reopened.size(), 7, 'an interrupted run lost its findings');
  reopened.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the researcher checkpoints per record rather than at the end', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/research-action-routes.cjs'), 'utf8');
  const probe = src.slice(src.indexOf('async function runProbe'), src.indexOf('function report'));
  assert.match(probe, /ledger\.record\(/, 'the probe does not checkpoint');
  assert.ok(!/const findings = \[\]/.test(probe), 'findings accumulate in memory until the end');
});

test('network research writes no canonical data', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/research-action-routes.cjs'), 'utf8');
  const probe = src.slice(src.indexOf('async function research'), src.indexOf('function report'));
  assert.ok(!/writeFileSync\(\s*C\.file/.test(probe), 'the researcher writes canonical data');
});

// ── THE CORPUS ITSELF ───────────────────────────────────────────────────────

test('no canonical record carries an action type outside its vocabulary', () => {
  const directories = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'data/business-directories/opportunities.json'), 'utf8'));
  for (const r of directories) {
    if (r.listingAction == null) continue;
    assert.ok(S.LISTING_ACTIONS.includes(r.listingAction),
      `${r.id} carries listingAction "${r.listingAction}"`);
  }
  const marketplaces = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'data/marketplaces/marketplaces.json'), 'utf8'));
  for (const r of marketplaces) {
    if (r.sellerAction == null) continue;
    assert.ok(MP.SELLER_ACTIONS.includes(r.sellerAction),
      `${r.id} carries sellerAction "${r.sellerAction}"`);
  }
});

test('a recorded route always belongs to a record that names an action', () => {
  // The pairing the Planner depends on: a URL with no action is a link nobody
  // knows what to do with, and READY requires both.
  const marketplaces = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'data/marketplaces/marketplaces.json'), 'utf8'));
  for (const r of marketplaces) {
    if (!r.sellerActionUrl) continue;
    assert.ok(r.sellerAction && r.sellerAction !== 'unknown',
      `${r.id} has a seller route but no seller action`);
  }
});

test('a stored route is the link a browser would follow, not the markup', () => {
  // MapQuest's claim link is written in the page as
  // `...utm_medium=inad&amp;utm_source=yogi`. Resolved without decoding, the
  // stored URL carries a literal "&amp;" in its query string and is broken for
  // every reader who clicks it.
  assert.strictEqual(R.unescapeHtml('a=1&amp;b=2'), 'a=1&b=2');
  assert.strictEqual(R.unescapeHtml('x&#38;y'), 'x&y');
  assert.strictEqual(R.unescapeHtml('plain'), 'plain');
  const html = '<a href="https://x.test/claim?a=1&amp;b=2">Claim your business</a>';
  const [link] = R.candidateLinks(html, 'https://x.test/');
  assert.ok(link, 'the candidate link was not harvested at all');
  assert.strictEqual(link.href, 'https://x.test/claim?a=1&b=2',
    'the harvested href still carries HTML entities');
});

test('no canonical route carries an HTML entity', () => {
  const files = [
    ['data/business-directories/opportunities.json', ['submissionUrl', 'claimUrl']],
    ['data/marketplaces/marketplaces.json', ['sellerActionUrl']],
    ['data/media-pr-publishing/media-platforms.json',
      ['submissionUrl', 'pitchUrl', 'pressReleaseUrl', 'advertisingUrl']],
  ];
  for (const [rel, fields] of files) {
    for (const r of JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'))) {
      for (const f of fields) {
        if (!r[f]) continue;
        assert.ok(!/&(amp|quot|lt|gt|#\d+);/.test(r[f]),
          `${r.id}.${f} carries an HTML entity: ${r[f]}`);
      }
    }
  }
});
