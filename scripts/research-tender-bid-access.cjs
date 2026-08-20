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
const { openPage, launch } = require('./tests/helpers/cdp.cjs');
const SAFE = require('./lib/rc-safe-apply.cjs');
const CK = require('./lib/rc-checkpoint.cjs');
const T = require('./lib/rc-text-match.cjs');
const REFUSAL = require('./lib/rc-refusal.cjs');

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

const CHALLENGE = REFUSAL.isRefusal;

// The operator saying participation costs nothing. Deliberately phrase-level:
// "free" on its own is the single most overloaded word on a procurement site.
// ── PARTICIPATION, STATED IN THE OPERATOR'S OWN WORDS ───────────────────────
//
// Phrases, matched on word boundaries. A stem match reads "supplier feedback
// service" as "supplier fee" and "Platinum membership feedback form" as
// "membership fee" — which is how Find a Tender and PhilGEPS, the two
// platforms this phase names as regressions, both came to be recorded as
// charging suppliers to bid.
// Wording that names the supplier's own cost outright. "free to submit" is
// deliberately absent: it reached "it is free to submit your company details",
// which is registration wearing the vocabulary of bidding. Where the corpus
// needs the object of the verb to be a bid, the phrase says so.
const FREE_PARTICIPATION = T.phraseMatcher([
  'no registration fee', 'no fee to register', 'no cost to register',
  'no charge to suppliers', 'free for suppliers', 'free supplier registration',
  'submission is free', 'no subscription required',
  'free to submit a bid', 'free to submit a tender', 'free to submit an offer',
  'free to submit your bid', 'free to submit a quotation',
]);

// Free-registration wording is only about SUPPLIERS when a supplier is nearby.
// "Free registration for buyers and journalists" is a real sentence on real
// procurement portals, and it says nothing whatever about what a bidder pays.
const FREE_REGISTRATION = [
  'registration is free', 'free registration', 'free to register',
  'registrazione gratuita', 'inscripción gratuita', 'registro gratuito',
  'inscription gratuite', 'kostenlose registrierung', 'kostenlos registrieren',
  'registo gratuito', 'darmowa rejestracja', 'bezpłatna rejestracja',
  'бесплатная регистрация', 'безкоштовна реєстрація', 'ücretsiz kayıt',
  'gratis registratie', 'registrering er gratis',
];
const SUPPLIER_CONTEXT = [
  'supplier', 'suppliers', 'tenderer', 'tenderers', 'bidder', 'bidders',
  'vendor', 'vendors', 'contractor', 'economic operator', 'lieferant',
  'bieter', 'proveedor', 'licitador', 'fournisseur', 'soumissionnaire',
  'wykonawca', 'dostawca',
];
const FREE_REGISTRATION_NEAR = T.proximityMatcher(FREE_REGISTRATION, SUPPLIER_CONTEXT, 120);

// "Free of charge" and "at no cost" are true of something on almost every
// government page. NATO's says its broadcast video is free of charge; a German
// notice service says its search functions are. Neither is a statement about
// bidding, and both were recorded as free participation. So the generic
// wording only counts beside the thing it would have to be about.
const FREE_GENERIC = ['free of charge', 'at no cost', 'kostenfrei', 'costs nothing'];
const PARTICIPATION_CONTEXT = [
  'register', 'registration', 'registrieren', 'registrierung', 'supplier',
  'suppliers', 'tenderer', 'bidder', 'bid', 'submit a tender', 'submit your bid',
  'respond to a tender', 'participate', 'teilnahme', 'lieferant', 'bieter',
  'proveedor', 'licitador', 'fournisseur', 'soumissionnaire',
];
const FREE_GENERIC_NEAR = T.proximityMatcher(FREE_GENERIC, PARTICIPATION_CONTEXT, 80);

// The operator charging for the account or the submission itself.
// "paid plan" and "pricing plans" were here and are gone. Almost every
// procurement portal sells optional alerting and analytics, so those phrases
// marked bidding paid on platforms where bidding is free and only the tender
// ALERTS cost money — the exact inference this file exists to refuse.
const PAID_PARTICIPATION = T.phraseMatcher([
  'subscription fee', 'annual subscription', 'registration fee of',
  'supplier fee', 'supplier fees', 'membership fee', 'membership fees',
  'access fee', 'access fees', 'licence fee', 'license fee',
  'per year to register', 'fee to submit a bid', 'fee to submit a tender',
  'cuota de suscripción', 'abonnement payant', 'jahresgebühr', 'teilnahmegebühr',
  'opłata abonamentowa', 'абонентская плата',
]);

// A fee the operator itself calls optional is not the price of participating.
const OPTIONAL_SERVICE = [
  'optional', 'premium', 'upgrade', 'add-on', 'if you wish', 'alerts',
  'analytics', 'notification service', 'optionale', 'opcional',
];

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

// Every browser researcher in this repository had grown its own copy of this
// function, each spawning a headless Chrome with the automation flag hidden and
// a spoofed user agent. The disguise is circumvention, which this corpus does
// not build, and it did not work: headless Chrome is refused by a large share of
// the public web whatever its user agent claims. A windowed browser needs no
// disguise, and there is one launcher for all of them.
function startChrome() {
  return launch({ headless: false });
}

async function probe(wsUrl, target) {
  const page = await openPage(wsUrl);
  try {
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

  const free = FREE_PARTICIPATION(hay) || FREE_GENERIC_NEAR(hay) || FREE_REGISTRATION_NEAR(hay);
  // A paid statement sitting inside optional-service wording is removed before
  // it is read, the same way denials are removed elsewhere in this corpus.
  const paidText = OPTIONAL_SERVICE.reduce(
    (text, word) => text.split(word).join(' '), T.normalize(hay),
  );
  const paid = PAID_PARTICIPATION(paidText);
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
      // Identity, not index: a tender platform is country + host + path,
      // because one ministry runs several distinct systems on one hostname.
      key: CK.targetKey('tenders', r),
    }))
    .filter((x) => x.url)
    .sort((a, b) => (b.onRegistrationPage ? 1 : 0) - (a.onRegistrationPage ? 1 : 0)
      || (a.id < b.id ? -1 : 1));
}

function openLedger() {
  const ledger = new CK.Ledger(FINDINGS);
  const byId = new Map(JSON.parse(fs.readFileSync(DATA, 'utf8')).map((r) => [r.id, r]));
  const moved = CK.backfillKeys(ledger, (f) => (byId.has(f.id) ? CK.targetKey('tenders', byId.get(f.id)) : null));
  if (moved) console.log(`Gave ${moved} pre-checkpoint finding(s) their canonical identity.`);
  return ledger;
}

async function runProbe() {
  if (!CHROME) { console.error('No Chrome on this machine.'); process.exit(1); }
  const ledger = openLedger();
  if (ledger.recovered) {
    console.log(`Recovered ${ledger.recovered} finding(s) from an interrupted run's journal.`);
  }
  let list = targets();
  const already = list.filter((t) => ledger.has(t.key)).length;
  if (!process.argv.includes('--refresh')) list = list.filter((t) => !ledger.has(t.key));
  const limit = arg('--limit');
  if (limit) list = list.slice(0, Number(limit));
  console.log(`Tender bid access: ${list.length} platform(s) to visit `
    + `(${already} already answered, ${ledger.size()} finding(s) on disk, `
    + `${list.filter((x) => x.onRegistrationPage).length} with a supplier registration page).`);
  if (!list.length) { report(ledger.all()); return; }

  CK.onInterrupt(ledger, 'Tender bid access');
  const chrome = await startChrome();
  const queue = list.slice();
  let done = 0;
  const worker = async () => {
    for (;;) {
      const target = queue.shift();
      if (!target) return;
      // eslint-disable-next-line no-await-in-loop
      const obs = await probe(chrome.wsUrl, target);
      ledger.record({
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
  try {
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  } finally {
    chrome.proc.kill('SIGKILL');
    const kept = ledger.compact({ probedAt: new Date().toISOString().slice(0, 10) });
    console.log(`${kept} finding(s) on disk.`);
    try { fs.rmSync(chrome.profile, { recursive: true, force: true }); } catch { /* reaped */ }
  }
  report(ledger.all());
  console.log('Nothing merged — rerun with --apply.');
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
  const ledger = openLedger();
  const file = { findings: ledger.all() };
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
  for (const f of rejudged) ledger.byKey.set(f.key, f);
  ledger.compact();
  console.log(`Re-judged from stored evidence: ${moved} verdict(s) changed.`);
  report(rejudged);
}

function runApply() {
  const ledger = openLedger();
  ledger.compact();
  const { probedAt = 'unknown' } = ledger.meta;
  const findings = ledger.all();
  const rows = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const before = JSON.parse(JSON.stringify(rows));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const tally = { free: 0, paid: 0, mixed: 0, left: 0 };

  // RECLASSIFICATION REPLACES. An applier that only writes forward makes a
  // wrong finding permanent: correcting the classifier moved four platforms
  // off their verdicts — NATO's free video downloads, a German notice service's
  // free search, and PhilGEPS and Find a Tender, which had been recorded as
  // charging suppliers because "membership fee" and "supplier fee" are inside
  // "membership feedback" and "supplier feedback" — and every one of them kept
  // the fact it no longer earned.
  const OURS = new Set(['free', 'paid', 'mixed']);
  for (const f of findings) {
    const r = byId.get(f.id);
    if (!r) { tally.left += 1; continue; }
    const earned = f.bidAccess && (f.state === 'ESTABLISHED' || f.state === 'DEFER_MIXED')
      ? f.bidAccess : null;
    if (!earned) {
      if (OURS.has(r.bidAccess) && /^DEFER|^UNRESOLVED/.test(f.state || '')) {
        SAFE.applyPatch(r, { bidAccess: undefined }, { owner: 'cost', collection: 'tenders' });
        delete r.bidAccess;
        tally.cleared = (tally.cleared || 0) + 1;
      } else {
        tally.left += 1;
      }
      continue;
    }
    SAFE.applyPatch(r, { bidAccess: earned }, { owner: 'cost', collection: 'tenders' });
    tally[earned] = (tally[earned] || 0) + 1;
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
  else if (process.argv.includes('--report')) report(openLedger().all());
  else runProbe().catch((e) => { console.error(e); process.exit(1); });
}
