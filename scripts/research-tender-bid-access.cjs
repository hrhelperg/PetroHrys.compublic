#!/usr/bin/env node
// scripts/research-tender-bid-access.cjs
'use strict';

// What it costs a supplier to PARTICIPATE, which is not what it costs to look.
//
// ── THE INFERENCE THIS FILE EXISTS TO REFUSE ────────────────────────────────
//
// 293 active platforms record `searchAccess: free`. Every one of them publishes
// notices anyone can read, and it would be easy — and wrong — to conclude that
// bidding on them is free too. Plenty of procurement systems publish openly and
// charge for the supplier account, the qualification, the digital certificate
// or the submission itself. Seeing a contract and being allowed to compete for
// it are different permissions with different prices.
//
// So `bidAccess` starts at nothing and is filled only from operator evidence.
// It never reads `searchAccess`, and a test asserts that the two dimensions
// stay independent.
//
// ── WHAT IS NOT PLATFORM COST ───────────────────────────────────────────────
//
// A tender may demand a bid bond, a document fee, a certificate, a deposit or
// proof of turnover. Those are conditions of a particular contract, set by the
// buyer, and they say nothing about whether the PLATFORM charges to submit.
// They are deliberately not read as `bidAccess: paid` — recording them there
// would make a free portal look paid on the strength of one demanding tender.
//
//   node scripts/research-tender-bid-access.cjs          # probe
//   node scripts/research-tender-bid-access.cjs --apply  # merge findings
//
// Nothing in the build, the validator or the test suite invokes this file.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { openPage } = require('./tests/helpers/cdp.cjs');
const SAFE = require('./lib/rc-safe-apply.cjs');
const T = require('./lib/rc-text-match.cjs');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data/tenders-procurement/platforms.json');
const FINDINGS = path.join(ROOT, 'data/tenders-procurement/.bid-access.json');

const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
].find((p) => fs.existsSync(p));

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const SETTLE_MS = 3500;
const CONCURRENCY = 4;
const PACE_MS = 600;
const EVIDENCE_CHARS = 4000;
const MIN_TEXT = 200;

const CHALLENGE = T.patternMatcher([
  'attention required', 'just a moment', 'checking your browser',
  'verify (you are|you.re) human', 'access denied', 'unusual traffic', 'captcha',
]);

// The operator saying participation costs nothing. Deliberately phrase-level:
// "free" on its own is the single most overloaded word on a procurement site.
const FREE_PARTICIPATION = T.stemMatcher([
  'registration is free', 'free registration', 'free of charge', 'free to register',
  'no registration fee', 'no fee to register', 'no cost to register', 'at no cost',
  'no charge to suppliers', 'free for suppliers', 'free supplier registration',
  'submission is free', 'free to submit', 'no subscription required',
  'registrazione gratuita', 'inscripción gratuita', 'registro gratuito',
  'inscription gratuite', 'kostenlose registrierung', 'kostenlos registrieren',
  'registo gratuito', 'darmowa rejestracja', 'bezpłatna rejestracja',
  'бесплатная регистрация', 'безкоштовна реєстрація', 'ücretsiz kayıt',
  'gratis registratie', 'registrering er gratis',
]);

// The operator charging for the account or the submission itself.
const PAID_PARTICIPATION = T.stemMatcher([
  'subscription fee', 'annual subscription', 'registration fee of',
  'supplier fee', 'membership fee', 'access fee', 'licence fee', 'license fee',
  'paid plan', 'pricing plans', 'per year to register', 'fee to submit',
  'cuota de suscripción', 'abonnement payant', 'jahresgebühr', 'teilnahmegebühr',
  'opłata abonamentowa', 'абонентская плата',
]);

// Conditions a BUYER sets on one contract. Never platform access cost.
const OPPORTUNITY_LEVEL = T.stemMatcher([
  'bid bond', 'bid security', 'tender security', 'earnest money',
  'document fee', 'tender document fee', 'processing fee for documents',
  'performance bond', 'guarantee deposit', 'garantía de mantenimiento',
  'caución', 'caution provisoire', 'bietungsgarantie', 'wadium',
]);

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : (process.argv[i + 1] || true);
};

function startChrome() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bid-access-'));
  const proc = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu',
    '--disable-dev-shm-usage', '--mute-audio',
    '--disable-blink-features=AutomationControlled',
    '--disable-background-networking', '--disable-sync', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  return new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error('Chrome did not report a DevTools endpoint')), 30000);
    proc.stderr.on('data', (chunk) => {
      buf += chunk.toString();
      const m = /ws:\/\/[^\s]+/.exec(buf);
      if (m) { clearTimeout(timer); resolve({ proc, wsUrl: m[0], profile }); }
    });
    proc.on('exit', (code) => { clearTimeout(timer); reject(new Error(`Chrome exited ${code}`)); });
  });
}

async function probe(wsUrl, target) {
  const page = await openPage(wsUrl);
  try {
    await page.send('Network.setUserAgentOverride', { userAgent: UA });
    await page.goto(target.url);
    await new Promise((r) => { setTimeout(r, SETTLE_MS); });
    const seen = await page.eval((chars) => {
      const text = document.body ? document.body.innerText : '';
      return {
        title: document.title || '',
        head: text.slice(0, chars),
        textLen: text.length,
        url: location.href,
        h1: [...document.querySelectorAll('h1, h2')].slice(0, 8)
          .map((h) => (h.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90)),
      };
    }, EVIDENCE_CHARS);
    const doc = page.requests.find((r) => r.url === seen.url) || page.requests[0] || null;
    return { ...seen, status: doc ? doc.status : 0, error: null };
  } catch (e) {
    return { error: String(e.message || e).slice(0, 160), status: 0 };
  } finally {
    try { await page.close(); } catch { /* gone */ }
    try { page.ws.close(); } catch { /* closed */ }
  }
}

function classify(target, obs) {
  if (obs.error || !obs.url) return { state: 'UNRESOLVED', why: obs.error || 'the browser could not open it' };
  const hay = `${obs.title}\n${obs.h1.join('\n')}\n${obs.head}`;
  if (CHALLENGE(hay)) return { state: 'DEFER_PROTECTED', why: 'a bot challenge' };
  if (obs.status >= 400) return { state: 'DEFER_PROTECTED', why: `http ${obs.status}` };
  if (obs.textLen < MIN_TEXT) return { state: 'UNRESOLVED', why: `only ${obs.textLen} characters rendered` };

  const free = FREE_PARTICIPATION(hay);
  const paid = PAID_PARTICIPATION(hay);
  const opportunityLevel = OPPORTUNITY_LEVEL(hay);

  // Both stated: the platform charges for something and waives something else.
  // Which applies to bidding is not decidable from a page that says both.
  if (free && paid) {
    return { state: 'DEFER_MIXED', bidAccess: 'mixed', why: 'the page states both a free and a paid participation route', opportunityLevel };
  }
  if (free) {
    return { state: 'ESTABLISHED', bidAccess: 'free', why: 'the operator states participation costs nothing', opportunityLevel };
  }
  if (paid) {
    return { state: 'ESTABLISHED', bidAccess: 'paid', why: 'the operator states a fee for participation', opportunityLevel };
  }
  // Bid bonds and document fees say nothing about platform access, and saying
  // so explicitly is the point: this is where the wrong answer would come from.
  return {
    state: 'DEFER_NO_STATEMENT',
    why: opportunityLevel
      ? 'the page describes contract-level conditions only, which are not platform access'
      : 'the page states nothing about what participation costs',
    opportunityLevel,
  };
}

function targets() {
  const rows = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  return rows
    .filter((r) => r.currentStatus === 'active' && r.bidAccess === undefined)
    // The supplier registration page is where a platform states its terms.
    // Falling back to the portal itself is weaker and marked as such.
    .map((r) => ({
      id: r.id,
      country: r.country,
      url: r.supplierRegistrationUrl || r.officialUrl,
      onRegistrationPage: Boolean(r.supplierRegistrationUrl),
      searchAccess: r.searchAccess,
    }))
    .filter((x) => x.url)
    .sort((a, b) => (b.onRegistrationPage ? 1 : 0) - (a.onRegistrationPage ? 1 : 0)
      || (a.id < b.id ? -1 : 1));
}

async function runProbe() {
  if (!CHROME) { console.error('No Chrome on this machine.'); process.exit(1); }
  let list = targets();
  const limit = arg('--limit');
  if (limit) list = list.slice(0, Number(limit));
  console.log(`Tender bid access: ${list.length} active platform(s) `
    + `(${list.filter((x) => x.onRegistrationPage).length} with a supplier registration page).`);

  const chrome = await startChrome();
  const findings = [];
  const queue = list.slice();
  let done = 0;
  const worker = async () => {
    for (;;) {
      const target = queue.shift();
      if (!target) return;
      // eslint-disable-next-line no-await-in-loop
      const obs = await probe(chrome.wsUrl, target);
      findings.push({
        ...target,
        observed: {
          status: obs.status, finalUrl: obs.url || null, title: obs.title || null,
          h1: obs.h1 || [], head: obs.head || '', textLen: obs.textLen || 0,
        },
        ...classify(target, obs),
      });
      done += 1;
      if (done % 40 === 0) console.log(`  ${done}/${list.length}`);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => { setTimeout(r, PACE_MS); });
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  chrome.proc.kill('SIGKILL');

  let merged = findings;
  if (fs.existsSync(FINDINGS)) {
    const prior = JSON.parse(fs.readFileSync(FINDINGS, 'utf8')).findings || [];
    if (prior.length) {
      const fresh = new Map(findings.map((f) => [f.id, f]));
      merged = prior.map((f) => fresh.get(f.id) || f)
        .concat(findings.filter((f) => !prior.some((p) => p.id === f.id)));
    }
  }
  merged.sort((a, b) => (a.id < b.id ? -1 : 1));
  fs.writeFileSync(FINDINGS, `${JSON.stringify({
    probedAt: new Date().toISOString().slice(0, 10), findings: merged,
  }, null, 1)}\n`);
  report(merged);
  console.log('Nothing merged — rerun with --apply.');
  try { fs.rmSync(chrome.profile, { recursive: true, force: true }); } catch { /* reaped */ }
}

function report(findings) {
  const tally = {};
  for (const f of findings) tally[f.state] = (tally[f.state] || 0) + 1;
  console.log('\nBID ACCESS');
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(5)}  ${k}`);
  }
  const byAccess = {};
  for (const f of findings.filter((x) => x.bidAccess)) byAccess[f.bidAccess] = (byAccess[f.bidAccess] || 0) + 1;
  console.log('  bidAccess:', JSON.stringify(byAccess));
  // The headline number for the inference this file refuses to make.
  const divergent = findings.filter((f) => f.searchAccess === 'free' && f.bidAccess && f.bidAccess !== 'free');
  console.log(`  free to search but NOT free to bid: ${divergent.length}`);
}

function runRejudge() {
  const file = JSON.parse(fs.readFileSync(FINDINGS, 'utf8'));
  let moved = 0;
  const rejudged = file.findings.map((f) => {
    const o = f.observed || {};
    if (o.head === undefined) return f;
    const v = classify(f, {
      title: o.title || '', h1: o.h1 || [], head: o.head || '',
      textLen: o.textLen || 0, url: o.finalUrl, status: o.status, error: null,
    });
    if (v.state !== f.state) moved += 1;
    // Replace the verdict; never layer a new one over an old one.
    const { state, bidAccess, why, opportunityLevel, ...rest } = f;
    return { ...rest, ...v };
  });
  fs.writeFileSync(FINDINGS, `${JSON.stringify({ ...file, findings: rejudged }, null, 1)}\n`);
  console.log(`Re-judged from stored evidence: ${moved} verdict(s) changed.`);
  report(rejudged);
}

function runApply() {
  const { probedAt, findings } = JSON.parse(fs.readFileSync(FINDINGS, 'utf8'));
  const rows = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const before = JSON.parse(JSON.stringify(rows));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const tally = { free: 0, paid: 0, mixed: 0, left: 0 };

  for (const f of findings) {
    const r = byId.get(f.id);
    if (!r || !f.bidAccess) { tally.left += 1; continue; }
    if (f.state !== 'ESTABLISHED' && f.state !== 'DEFER_MIXED') { tally.left += 1; continue; }
    SAFE.applyPatch(r, { bidAccess: f.bidAccess }, { owner: 'cost', collection: 'tenders' });
    tally[f.bidAccess] = (tally[f.bidAccess] || 0) + 1;
  }

  SAFE.assertNoDeletion(before, rows);
  const drift = SAFE.diffFingerprints(SAFE.curatedFingerprint(before), SAFE.curatedFingerprint(rows));
  if (drift.length) throw new Error(`curated fields drifted on ${drift.join(', ')}`);
  // searchAccess is a different fact with a different owner. Nothing here may
  // touch it, and this proves nothing did.
  for (const r of rows) {
    const was = before.find((b) => b.id === r.id);
    if (was && was.searchAccess !== r.searchAccess) {
      throw new Error(`${r.id}: bid-access research changed searchAccess`);
    }
  }
  fs.writeFileSync(DATA, `${JSON.stringify(rows, null, 1)}\n`);
  console.log(`Applied (${probedAt}):`, Object.entries(tally).map(([k, v]) => `${k}=${v}`).join(' '));
}

module.exports = {
  classify, targets, FREE_PARTICIPATION, PAID_PARTICIPATION, OPPORTUNITY_LEVEL,
};

if (require.main === module) {
  if (process.argv.includes('--apply')) runApply();
  else if (process.argv.includes('--rejudge')) runRejudge();
  else if (process.argv.includes('--report')) report(JSON.parse(fs.readFileSync(FINDINGS, 'utf8')).findings);
  else runProbe().catch((e) => { console.error(e); process.exit(1); });
}
