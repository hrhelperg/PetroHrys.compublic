'use strict';

// What a browser is allowed to conclude.
//
// The pilot run of this phase got twelve records wrong before it got one right,
// and the failure is worth keeping written down: headless Chrome asked twelve
// sites for their homepage, eleven of them served a Cloudflare interstitial,
// and the runner recorded all eleven as "rendered successfully, offers no
// action". Both halves of that sentence were false. The pages had not rendered
// — they had been refused — and the sites were not offering nothing, they were
// offering nothing TO A HEADLESS BROWSER. Fiverr went from 0 links to 119 the
// moment the same Chrome ran with a window.
//
// A refusal recorded as an answer is the most expensive mistake this corpus can
// make, because it is indistinguishable from research: the counts go up, the
// backlog goes down, and the fact is invented. So most of what follows is about
// keeping "could not read" and "read it, nothing there" apart.

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawn, execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const B = require(path.join(ROOT, 'scripts/research-browser-evidence.cjs'));
const R = require(path.join(ROOT, 'scripts/research-action-routes.cjs'));
const CK = require(path.join(ROOT, 'scripts/lib/rc-checkpoint.cjs'));
const SAFE = require(path.join(ROOT, 'scripts/lib/rc-safe-apply.cjs'));

const pad = (s) => `${s} ${'context '.repeat(30)}`;

// `git grep -l` exits 1 when it matches nothing, and "matches nothing" is the
// passing case for both tests below, so the exit code cannot be an error here.
function grepFiles(pattern, pathspec) {
  const r = require('node:child_process').spawnSync('git',
    ['grep', '-l', pattern, '--', ...pathspec], { cwd: ROOT, encoding: 'utf8' });
  return (r.stdout || '').trim().split('\n').filter(Boolean);
}

// ── M14: A REFUSAL IS NOT A DEATH ───────────────────────────────────────────

test('M14: a WAF refusal is never recorded as dead or dormant', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/research-browser-evidence.cjs'), 'utf8');
  // The vocabulary of death does not appear in this researcher at all. A site
  // that refuses a script is a site whose evidence is unread, and the only
  // honest states for it are PROTECTED or UNKNOWN.
  assert.ok(!/'DEAD'|'DORMANT'|state: 'GONE'/.test(src),
    'the browser researcher must not be able to conclude that a site is dead');
});

test('M14: a challenge page is PROTECTED, not RENDERED_NO_EVIDENCE', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/research-browser-evidence.cjs'), 'utf8');
  assert.match(src, /CHALLENGE\(home\.text\)[\s\S]{0,200}state: 'PROTECTED'/,
    'a rendered bot challenge must classify as protected');
});

// The exact page that fooled the pilot: Cloudflare's interstitial is a title, a
// sentence, and a link to a privacy policy.
test('M14: the pilot\'s Cloudflare interstitial is detected as a refusal', () => {
  const interstitial = 'Just a moment... www.example.com needs to review the security '
    + 'of your connection before proceeding. Ray ID: 8f2a1b Performance and security by Cloudflare Privacy';
  const home = { text: interstitial, links: [{ href: 'https://cloudflare.com', text: 'Cloudflare' }], url: 'https://x.test/' };
  // Two independent guards would each catch it: too few links, and the wording.
  assert.ok(home.links.length < 5, 'a challenge page carries almost no navigation');
  assert.match(interstitial.toLowerCase(), /just a moment|ray id|performance and security by/);
});

test('a thin render is a refusal even when the wording is unfamiliar', () => {
  // Not every block page says "captcha". The link count is the signal that does
  // not depend on guessing the operator's phrasing, and it is why Fiverr — 605
  // characters, zero links — is now protected rather than "offers nothing".
  const src = fs.readFileSync(path.join(ROOT, 'scripts/research-browser-evidence.cjs'), 'utf8');
  assert.match(src, /home\.links\.length < MIN_LINKS[\s\S]{0,300}state: 'PROTECTED'/);
});

test('rendered-and-empty is a different state from could-not-render', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/research-browser-evidence.cjs'), 'utf8');
  assert.ok(src.includes('RENDERED_NO_EVIDENCE') && src.includes("state: 'PROTECTED'"),
    'the two outcomes must be separately representable');
  // And the honest one must be reachable: a site that renders 900 links and
  // names no action is a real finding about that site.
  assert.match(src, /state: 'RENDERED_NO_EVIDENCE'/);
});

// ── M1 / M2: GENERIC ACCOUNT WORDING IS NOT AN ACTION ───────────────────────

test('M1/M2: Register, Login and Sign up never establish a route', () => {
  for (const wording of ['Register', 'Login', 'Sign up', 'Create an account',
    'Registrieren', 'Se connecter', 'Iniciar sesión', 'My account']) {
    for (const collection of ['directories', 'marketplaces']) {
      assert.equal(R.judgeAction(collection, pad(wording)), null,
        `"${wording}" must not resolve an action on ${collection}`);
    }
  }
});

test('M1: a seller route needs seller wording, not account wording', () => {
  assert.equal(R.judgeAction('marketplaces', pad('Create your free account today')), null);
  assert.equal(R.judgeAction('marketplaces', pad('Become a seller on our platform')), 'create-seller-profile');
});

// ── M16: THE URL IS NOT EVIDENCE ────────────────────────────────────────────

test('M16: a /add-business/ path proves nothing without visible wording', () => {
  // The page below is at the most promising URL in the corpus and says nothing.
  assert.equal(R.judgeAction('directories', pad('Welcome. Please choose a category to continue.')), null);
});

test('M16: only the destination page\'s own wording resolves an action', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/research-browser-evidence.cjs'), 'utf8');
  // What is opened and what is believed are deliberately different vocabularies.
  // Cylex Austria publishes REGISTRIEREN -> /register-company: the anchor is
  // generic and the path is not evidence, but the page behind it says
  // "Registrieren Sie Ihr Unternehmen" and settles the question. A researcher
  // that refuses to open a generic link can never read that page.
  assert.match(src, /AR\.FOLLOW_MATCH\(l\.text\)/, 'candidates are chosen with the broad vocabulary');
  assert.match(src, /const action = AR\.judgeAction\(target\.collection, page2\.text\)/,
    'the verdict is taken from the destination TEXT, never from its URL');
  assert.ok(!/judgeAction\([^)]*page2\.url/.test(src), 'the URL must never be judged');
});

test('M16: a generic anchor is followed but cannot itself prove anything', () => {
  assert.equal(R.FOLLOW_MATCH('REGISTRIEREN'), true, 'it must be opened');
  assert.equal(R.judgeAction('directories', pad('REGISTRIEREN')), null, 'it must prove nothing');
  assert.equal(R.judgeAction('directories', pad('Registrieren Sie Ihr Unternehmen kostenlos')), 'create',
    'the page behind it is what decides');
});

test('M15: a route on a foreign domain is refused', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/research-browser-evidence.cjs'), 'utf8');
  assert.match(src, /action && sameHostFamily\(target\.url, page2\.url\)/,
    'a resolved route must live on the operator\'s own host family');
  const fam = src.slice(src.indexOf('function sameHostFamily'), src.indexOf('function excerpt'));
  assert.ok(fam.includes("replace(/^www\\./, '')"), 'www is not a different site');
  assert.ok(fam.includes('slice(-2)'), 'a language subdomain is not a foreign host');
});

test('the sentence that decided a verdict is stored for re-checking', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/research-browser-evidence.cjs'), 'utf8');
  assert.match(src, /evidenceText: excerpt\(/);
  const apply = fs.readFileSync(path.join(ROOT, 'scripts/research-action-routes.cjs'), 'utf8');
  assert.match(apply, /confirms\(String\(f\.evidenceText \|\| ''\)\)/,
    'the applier re-checks the stored evidence against the CURRENT vocabulary');
  // And the excerpt is a sentence, not a copy of the page.
  assert.match(src, /\.slice\(0, 300\)/);
});

// ── M6 / M7: LOCALIZED MATCHING ─────────────────────────────────────────────

test('M6: Benzinpreise is not a pricing route', () => {
  assert.equal(R.LINK_MATCH('Benzinpreise'), false);
  assert.equal(R.LINK_MATCH('Aktuelle Benzinpreise in Hamburg'), false);
});

test('M6: compounds do not swallow their parts', () => {
  for (const decoy of ['Mitarbeiterangebote', 'Supplier feedback', 'Membership feedback',
    'Preisvergleich', 'Anunciantes', 'Verkäuferschutz']) {
    assert.equal(R.LINK_MATCH(decoy), false, `"${decoy}" must not be a candidate`);
  }
});

test('M7: non-Latin phrases still match, and are not silently dead', () => {
  // An ASCII word boundary next to Cyrillic matches nothing, which fails
  // closed: the phrase is never found and the corpus quietly stops researching
  // an entire language. Both of these are real vocabulary entries.
  assert.equal(R.LINK_MATCH('Добавить компанию'), true);
  assert.equal(R.LINK_MATCH('İlan ver'), true);
});

test('M7: Turkish dotted and dotless I fold correctly', () => {
  assert.equal(R.LINK_MATCH('ilan ver'), true);
  assert.equal(R.LINK_MATCH('İLAN VER'), true);
});

// ── M3 / M4: CLAIM IS NOT CREATE ────────────────────────────────────────────

test('M3/M4: the route field follows the action', () => {
  const dir = R.COLLECTIONS.directories;
  assert.equal(dir.routeField('claim'), 'claimUrl');
  assert.equal(dir.routeField('create'), 'submissionUrl');
  // The mutation: one field for both. It would file a page that asks a reader
  // to prove they already own a listing as the place to submit a new one.
  assert.notEqual(dir.routeField('claim'), dir.routeField('create'));
});

test('M3: claim wording resolves to claim, not create', () => {
  assert.equal(R.judgeAction('directories', pad('Claim your business listing')), 'claim');
  assert.equal(R.judgeAction('directories', pad('Add your business to our directory')), 'create');
});

// ── M5: URL SAFETY ──────────────────────────────────────────────────────────

test('M5: HTML entities never survive into a canonical URL', () => {
  // The real defect this guards: MapQuest's claim link was harvested straight
  // out of markup, where an ampersand is written &amp;, and stored that way.
  assert.equal(R.unescapeHtml('https://x.test/a?b=1&amp;c=2'), 'https://x.test/a?b=1&c=2');
  assert.equal(R.unescapeHtml('https://x.test/?a=1&#38;b=2'), 'https://x.test/?a=1&b=2');
  // Decoding happens once, deliberately. Repeating it until nothing changes
  // would turn a literal "&amp;amp;" in a real URL into a different URL.
  assert.equal(R.unescapeHtml('https://x.test/?a=1&amp;amp;b=2'), 'https://x.test/?a=1&amp;b=2');
});

test('M5: the applier decodes again rather than trusting the stored value', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/research-action-routes.cjs'), 'utf8');
  const apply = src.slice(src.indexOf('function runApply'));
  assert.ok(apply.includes('unescapeHtml'),
    'a verdict stored by an older run must be re-decoded at apply time');
});

test('javascript: and data: URLs are refused', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/research-browser-evidence.cjs'), 'utf8');
  assert.match(src, /\/\^https\?:\/\.test\(href\)/,
    'only http and https links may become candidates');
});

// ── M15: A SUBDOMAIN IS NOT A FOREIGN HOST ──────────────────────────────────

test('M15: fr.example.com belongs to example.com', () => {
  const host = (u) => new URL(u).hostname.replace(/^www\./, '');
  const family = (h) => h.split('.').slice(-2).join('.');
  assert.equal(family(host('https://fr.example.com/pro')), family(host('https://example.com/')));
});

// ── M23 / M9 / M24: SEARCH IS NOT BIDDING ───────────────────────────────────

test('M23: searchAccess and bidAccess are independent fields', () => {
  const owned = SAFE.OWNERSHIP.cost.tenders || [];
  const src = fs.readFileSync(path.join(ROOT, 'scripts/research-action-routes.cjs'), 'utf8');
  assert.ok(src.includes('bidAccess'), 'the researcher must name bidAccess explicitly');
  assert.ok(!/searchAccess\s*=\s*bidAccess|bidAccess\s*=\s*.*searchAccess/.test(src),
    'one must never be derived from the other');
});

test('M9: free search is not free bidding', () => {
  assert.equal(R.judgeBid(pad('Search all published tender notices free of charge.')), null);
  assert.equal(R.judgeBid(pad('Browse opportunities at no cost. View awards free.')), null);
});

test('M9: a free account is not free bidding', () => {
  assert.equal(R.judgeBid(pad('Create your free user account to save searches.')), null);
});

test('M24: a buyer-side fee is not a supplier bid fee', () => {
  const verdict = R.judgeBid(pad('Contracting authorities pay an annual publication fee to advertise notices.'));
  assert.notEqual(verdict && verdict.bidAccess, 'paid',
    'a fee charged to buyers must not make bidding paid for suppliers');
});

test('M10: an optional paid service is not a bidding fee', () => {
  const verdict = R.judgeBid(pad('Optional premium alerts and analytics are available from £29 per month.'));
  assert.notEqual(verdict && verdict.bidAccess, 'paid');
});

test('M24: "membership feedback" is not "membership fee"', () => {
  const verdict = R.judgeBid(pad('Read our membership feedback from suppliers across the country.'));
  assert.equal(verdict, null);
});

// ── M8 / M11: COST ──────────────────────────────────────────────────────────

test('M8: free registration is not a free listing', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/research-action-routes.cjs'), 'utf8');
  assert.ok(!/FREE.*'free registration'|'free registration'.*FREE_/s.test(src)
    || src.includes('CONSUMER_FREE_PHRASES'),
    'generic free-account wording must be excluded from listing cost');
});

test('M11: commission outside seller economics is not a seller cost', () => {
  // "Commission" appears on public-sector sites as a body of government far
  // more often than as a fee.
  const text = pad('The European Commission publishes these notices.');
  const verdict = R.judgeBid(text);
  assert.equal(verdict, null);
});

// ── M17: RESEARCH MUST NOT TOUCH CANONICAL DATA ─────────────────────────────

test('M17: the browser researcher writes only its own findings file', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/research-browser-evidence.cjs'), 'utf8');
  const probe = src.slice(src.indexOf('async function runProbe'), src.indexOf('function report'));
  assert.ok(!/data\/business-directories|data\/marketplaces|data\/media|data\/tenders/.test(probe),
    'the research stage must never name a canonical collection path');
  assert.match(src, /const FINDINGS = path\.join\(ROOT, 'data\/action-routes\/\.browser-evidence\.json'\)/);
});

test('M17: findings are stored apart from canonical collections', () => {
  // The ledger IS tracked — the previous phase committed it on purpose as an
  // audit trail for every verdict. What matters is that it is not a collection:
  // nothing in the product reads it, and the applier is the only path from a
  // finding to a canonical field.
  const tracked = execFileSync('git', ['ls-files', 'data/action-routes/'], { cwd: ROOT, encoding: 'utf8' })
    .trim().split('\n').filter(Boolean);
  for (const f of tracked) {
    assert.ok(f.startsWith('data/action-routes/'), 'research files stay in their own directory');
  }
  assert.deepEqual(grepFiles('action-routes', ['scripts/build-*.cjs', 'js/']), [],
    'no generator and no client script may read the research ledger');
});

// ── M18 / M19: DURABILITY ───────────────────────────────────────────────────

test('M18: a SIGKILL cannot erase a completed finding', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bev-kill-'));
  const file = path.join(dir, 'findings.json');
  const ledger = new CK.Ledger(file);
  ledger.record({ key: 'browser|a', state: 'RESOLVED', actionType: 'create' });
  ledger.record({ key: 'browser|b', state: 'PROTECTED' });
  // No compaction, no close: exactly the state a killed process leaves behind.
  const journal = fs.readFileSync(file + CK.JOURNAL_SUFFIX, 'utf8').trim().split('\n');
  assert.equal(journal.length, 2, 'each completed record is durable the moment it completes');

  const resumed = new CK.Ledger(file);
  assert.equal(resumed.size(), 2);
  assert.ok(resumed.has('browser|a') && resumed.has('browser|b'));
  resumed.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('M19: resume does not research an identity twice', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bev-resume-'));
  const file = path.join(dir, 'findings.json');
  const first = new CK.Ledger(file);
  first.record({ key: 'browser|kept', state: 'RENDERED_NO_EVIDENCE' });
  first.close();

  const second = new CK.Ledger(file);
  const queue = [{ key: 'browser|kept' }, { key: 'browser|fresh' }]
    .filter((t) => !second.has(t.key));
  assert.deepEqual(queue.map((t) => t.key), ['browser|fresh'],
    'an answered identity must not be opened again');
  second.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('M18: findings carry enough provenance to audit the verdict', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/research-browser-evidence.cjs'), 'utf8');
  for (const field of ['evidenceUrl', 'anchor', 'observedAt', 'why', 'collection']) {
    assert.ok(src.includes(field), `a finding must record ${field}`);
  }
});

// ── M20 / M21: THE APPLIER ──────────────────────────────────────────────────

test('M20: the applier cannot write a field it does not own', () => {
  const row = { name: 'X', note: 'a human-written note', submissionUrl: null };
  // Domain Rating belongs to the metrics owner. Actionability asking for it is
  // the mutation, and it must raise rather than quietly succeed.
  assert.throws(
    () => SAFE.applyPatch(row, { domainRating: 50 }, { owner: 'actionability', collection: 'directories' }),
    /owns only|no research pass may change/,
  );
  assert.equal(row.domainRating, undefined, 'the refused write left no trace');
  // The owned field goes through.
  SAFE.applyPatch(row, { submissionUrl: 'https://x.test/add' }, { owner: 'actionability', collection: 'directories' });
  assert.equal(row.submissionUrl, 'https://x.test/add');
  assert.equal(row.note, 'a human-written note', 'a note nobody claimed is untouched');
});

test('M21: applying twice changes nothing the second time', () => {
  // Proven for real against the tree in the phase run; here the invariant is
  // that the applier compares before writing rather than writing unconditionally.
  const src = fs.readFileSync(path.join(ROOT, 'scripts/research-action-routes.cjs'), 'utf8');
  const apply = src.slice(src.indexOf('function runApply'));
  assert.ok(/if \(.*===.*\)\s*continue|already|unchanged|=== *value/.test(apply),
    'the applier must skip a value that is already correct');
});

test('M25: a weaker later finding does not overwrite a stronger one', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/research-action-routes.cjs'), 'utf8');
  const apply = src.slice(src.indexOf('function runApply'));
  assert.ok(/'RESOLVED'/.test(apply),
    'only resolved findings may be applied; unresolved ones cannot clear a known value');
});

// ── M12 / M13: THE PLANNER IS NOT PERSUADED BY BROWSERS ─────────────────────

test('M12: a high Domain Rating cannot promote a record', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/lib/dp-engine.cjs'), 'utf8');
  assert.ok(!/domainRating[\s\S]{0,80}READY/.test(src),
    'Domain Rating must not appear in the readiness decision');
});

test('M13: rendering successfully cannot promote a record', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/lib/dp-engine.cjs'), 'utf8');
  for (const word of ['RENDERED_NO_EVIDENCE', 'PROTECTED', 'browserEvidence']) {
    assert.ok(!src.includes(word), `the planner must not know about ${word}`);
  }
});

// ── M22: NO COHORT MAY BE EMPTY ─────────────────────────────────────────────

test('M22: this suite\'s own cohorts are non-empty', () => {
  assert.ok(Object.keys(R.CONFIRMS).length >= 4, 'the confirmation vocabulary must be populated');
  assert.ok(Object.keys(R.COLLECTIONS).length >= 4, 'every collection must be researchable');
});

// ── THE BROWSER ITSELF ──────────────────────────────────────────────────────

test('the shared harness still defaults to headless for tests', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/tests/helpers/cdp.cjs'), 'utf8');
  assert.match(src, /const headless = opts\.headless !== false;/,
    'headless must remain the default so no test opens a window');
  assert.match(src, /headless \? \['--headless=new'\]/);
});

test('settling waits for the page to stop changing, not for load', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/research-browser-evidence.cjs'), 'utf8');
  const settle = src.slice(src.indexOf('async function settle'), src.indexOf('async function readPage'));
  assert.ok(settle.includes('shape === previous'),
    'two identical observations, not a fixed sleep, decide that a page has settled');
  assert.ok(settle.includes('links') && settle.includes('len'),
    'link count and text length are both part of the shape');
});

test('navigation is bounded in time and in depth', () => {
  assert.ok(B.MAX_FOLLOW <= 3, 'this is not a crawler');
  assert.ok(B.CONCURRENCY <= 4, 'concurrency stays polite');
  const src = fs.readFileSync(path.join(ROOT, 'scripts/research-browser-evidence.cjs'), 'utf8');
  assert.match(src, /RECORD_BUDGET_MS/);
  assert.match(src, /NAV_TIMEOUT_MS/);
});

test('no researcher in the repository uses circumvention', () => {
  // Not just this file. The cost researcher shipped with the automation flag
  // hidden and a spoofed user agent, which is a disguise this corpus does not
  // build — and which did not work anyway: headless Chrome is refused whatever
  // its user agent claims. An ordinary windowed browser needs no disguise.
  const dir = path.join(ROOT, 'scripts');
  const researchers = fs.readdirSync(dir).filter((f) => f.startsWith('research-') && f.endsWith('.cjs'));
  assert.ok(researchers.length >= 4, 'the cohort of researchers must not be empty');
  for (const file of researchers) {
    const src = fs.readFileSync(path.join(dir, file), 'utf8');
    for (const forbidden of ['AutomationControlled', 'setUserAgentOverride', 'stealth',
      'solveCaptcha', 'rotateUserAgent', 'puppeteer-extra']) {
      assert.ok(!src.includes(forbidden), `${file} contains ${forbidden}`);
    }
  }
});

test('research browsers are launched through the shared harness', () => {
  const dir = path.join(ROOT, 'scripts');
  for (const file of fs.readdirSync(dir).filter((f) => f.startsWith('research-') && f.endsWith('.cjs'))) {
    const src = fs.readFileSync(path.join(dir, file), 'utf8');
    assert.ok(!src.includes("'--headless=new'"),
      `${file} spawns its own headless Chrome instead of using launch()`);
  }
});

test('the build never invokes browser research', () => {
  // No build file, no test and no generator may reach a live site. Research is
  // something a person runs on purpose.
  assert.deepEqual(
    grepFiles('research-browser-evidence', ['scripts/build-*.cjs', 'scripts/run-tests.cjs', '_redirects', 'js/']),
    [], 'nothing in the build path may invoke browser research');
});


// ── THE TWO BUGS THIS PHASE FOUND IN THE BID VOCABULARY ─────────────────────
//
// Both were live on the branch this one is stacked on. Neither had produced a
// wrong fact yet, only because that phase's tender research resolved nothing at
// all — and this phase exists to research exactly those pages.

test('M24: a feedback page cannot make a tender platform paid to bid', () => {
  const pad2 = (s) => `${s} ${'context '.repeat(30)}`;
  // "fee" reaching the end of "feedback" is what a stem matcher does. The link
  // vocabulary was hardened against it an earlier phase; the bid vocabulary
  // was not, so a supplier feedback form declared bidding paid.
  assert.equal(R.BID_PAID(pad2('Read our supplier feedback form responses.')), false);
  assert.equal(R.BID_PAID(pad2('Membership feedback from our users.')), false);
  // And the genuine article still resolves, singular and plural.
  assert.equal(R.BID_PAID(pad2('An annual membership fee of 200 applies to suppliers.')), true);
  assert.equal(R.BID_PAID(pad2('Supplier fees are payable before bidding.')), true);
});

test('M9: "free to registered users" is a restriction, not free bidding', () => {
  const pad2 = (s) => `${s} ${'context '.repeat(30)}`;
  // A stem let "free to register" reach this sentence, which says the opposite
  // of what it was taken to mean: viewing is limited to people who signed up.
  assert.equal(R.BID_FREE(pad2('Notices are free to registered users only.')), false);
  // And "free to submit" reached registration forms. The object of the verb
  // now has to be a bid.
  assert.equal(R.BID_FREE(pad2('It is free to submit your details to our database.')), false);
  assert.equal(R.BID_FREE(pad2('It is free to submit a bid on any notice.')), true);
  assert.equal(R.BID_FREE(pad2('Registration is free for all suppliers.')), true);
});

test('the bid vocabularies use phrase boundaries, not stems', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/research-action-routes.cjs'), 'utf8');
  assert.match(src, /const BID_PAID = T\.phraseMatcher\(/);
  assert.match(src, /const BID_FREE = T\.phraseMatcher\(/);
});
