#!/usr/bin/env node
// scripts/research-free-and-trusted.cjs
'use strict';

// What a business with no marketing budget can actually use.
//
// ── WHY THE PRICE IS READ ON THE ACTION PAGE ────────────────────────────────
//
// A homepage says what a platform is. The page you are sent to in order to
// list, submit or sell is where it says what that costs — and 373 of those
// pages are already recorded and verified reachable. So the price question is
// asked where the answer lives, and falls back to the homepage only when a
// record has no route.
//
// ── FREE IS NOT ONE FACT ────────────────────────────────────────────────────
//
// "Freemium" collapses situations that are nothing alike to someone with no
// money. Free to list with a fee when something sells means a business can
// start today and pays out of revenue it has already earned. A mandatory
// monthly plan means it cannot start at all. Both were freemium.
//
// ── FREE IS NOT ENOUGH ──────────────────────────────────────────────────────
//
// A free listing on a link farm is worth less than nothing: it costs the
// business time and can cost it reputation. So free wording alone never
// accepts a record — the trust gate runs first, and a page whose only evidence
// of legitimacy is its own domain wording fails it.
//
//   node scripts/research-free-and-trusted.cjs          # probe
//   node scripts/research-free-and-trusted.cjs --apply  # merge findings
//
// Nothing in the build, the validator or the test suite invokes this file.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { openPage } = require('./tests/helpers/cdp.cjs');
const SAFE = require('./lib/rc-safe-apply.cjs');
const CK = require('./lib/rc-checkpoint.cjs');
const T = require('./lib/rc-text-match.cjs');

const ROOT = path.resolve(__dirname, '..');
const FINDINGS = path.join(ROOT, 'data/business-directories/.free-trusted.json');

const COLLECTIONS = {
  directories: {
    data: path.join(ROOT, 'data/business-directories/opportunities.json'),
    costField: 'submissionModel',
    route: (r) => r.submissionUrl || r.claimUrl || null,
  },
  marketplaces: {
    data: path.join(ROOT, 'data/marketplaces/marketplaces.json'),
    costField: 'sellerCost',
    route: (r) => r.sellerActionUrl || null,
  },
  media: {
    data: path.join(ROOT, 'data/media-pr-publishing/media-platforms.json'),
    costField: 'costModel',
    route: (r) => r.submissionUrl || r.pressReleaseUrl || r.pitchUrl || null,
  },
};

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

// ── VOCABULARY, Unicode-safe throughout ─────────────────────────────────────

const CHALLENGE = T.patternMatcher([
  'attention required', 'just a moment', 'checking your browser',
  'verify (you are|you.re) human', 'access denied', 'unusual traffic', 'captcha',
]);

const PARKED = T.patternMatcher([
  'domain (is|may be) for sale', 'buy this domain', 'parked domain',
  'hugedomains', 'sedo.com', 'afternic', 'under construction',
]);

// The operator saying, in its own words, that the useful action costs nothing.
const FREE_WORDING = T.stemMatcher([
  'free listing', 'list your business for free', 'list for free', 'free to list',
  'add your business for free', 'free business listing', 'post a free ad',
  'free ad', 'free plan', 'free forever', 'free account', 'free submission',
  'submit for free', 'no cost', 'at no charge', 'free of charge', 'free basic',
  'kostenlos', 'gratis', 'gratuit', 'gratuito', 'grátis', 'бесплатн', 'безкоштов',
  'ücretsiz', 'darmow', 'bezplatn', 'ingyenes', 'zdarma', 'besplatno', 'δωρεάν',
]);

// ── WORDING THAT LOOKS FREE AND IS NOT ──────────────────────────────────────
//
// Each of these is a real sentence a platform writes, and each one would make
// a naive free-matcher say yes to something a business cannot actually use for
// nothing.
//
// A TRIAL ends. "14-day free trial" is a price with a delay, and after it the
// only route is paid — so a trial can never establish free or freemium.
//
// A FREE ACCOUNT is not a free service. Signing up costs nothing almost
// everywhere; what the account then lets you do is the question. This is the
// same rule the marketplace seller phase established for actions, restated for
// price.
//
// A WAIVED FEE is one fee. "No listing fee" beside a mandatory subscription is
// not free, and "from $0" is a price range whose bottom may be unusable.
const TRIAL_PHRASES = [
  'free trial', 'trial period', 'try it free', 'try free for', 'day trial',
  'days free', 'first month free', 'testphase', 'kostenlos testen',
  'prueba gratuita', 'essai gratuit', 'prova gratuita', 'okres próbny',
  'пробный период', 'ücretsiz deneme',
].map(T.normalize);
const TRIAL_WORDING = T.stemMatcher(TRIAL_PHRASES);

// Registration/account language, which says nothing about the useful action.
const REGISTRATION_PHRASES = [
  'free account', 'free to join', 'free sign up', 'free signup',
  'free registration', 'create a free account', 'registration is free',
  'sign up free', 'join for free', 'kostenlos registrieren', 'registro gratis',
  'inscription gratuite', 'бесплатная регистрация',
].map(T.normalize);
const REGISTRATION_ONLY = T.stemMatcher(REGISTRATION_PHRASES);

// Payment required before anything happens.
const PAID_WORDING = T.stemMatcher([
  'subscription required', 'paid plan required', 'membership required',
  'per month', 'per year', '/month', '/mo', 'monthly fee', 'annual fee',
  'pricing starts', 'starting at', 'from $', 'from €', 'from £',
  'upgrade to', 'buy now', 'purchase a plan',
]);

// A fee that only exists once money has already been made.
// "Commission" alone is a homonym trap. In French it means a COMMITTEE — two
// trade associations were recorded as charging sales commission because their
// pages list "commissions" — and "Commission" is also the European institution,
// which an e-commerce trade body naturally mentions in its news. So the word
// only counts beside something that makes it a fee on a sale.
const COMMISSION_WORDING = T.stemMatcher([
  'final value fee', 'selling fee', 'transaction fee', 'seller fee',
  'only pay when', 'when it sells', 'when you sell', 'of the sale price',
  'sales commission', 'commission on sale', 'commission on each', 'commission per',
  'commission fee', 'commission rate', '% commission', 'commission of',
  'prowizja od', 'comisión por', 'comisión de venta', 'commissione di vendita',
  'provision pro verkauf', 'комиссия с продаж',
]);

// ── THE TRUST GATE ──────────────────────────────────────────────────────────
//
// Evidence-backed indicators only. No invented score.
const INSTITUTIONAL = T.stemMatcher([
  'chamber of commerce', 'chambre de commerce', 'handelskammer', 'cámara de comercio',
  'camera di commercio', 'ministry', 'ministerio', 'ministère', 'ministerium',
  'government', 'gobierno', 'gouvernement', 'regierung', 'municipal', 'city council',
  'official', 'oficial', 'officiel', 'amtlich', 'public sector', 'agency',
]);

// What a link farm looks like when it stops pretending.
// What a link farm looks like when it stops pretending — and NOT a category a
// general directory happens to carry. The bare stem "casino" rejected Hotfrog
// in two countries and a Swiss directory, all of which simply list casinos the
// way they list bakeries. The contamination signal is the SELLING of placement,
// not the presence of a vice category.
const LOW_QUALITY = T.stemMatcher([
  'buy backlinks', 'backlink package', 'buy dofollow', 'link building service',
  'guest post service', 'guest posting service', 'dofollow links for',
  'seo submission service', 'increase your da', 'boost your domain authority',
  'sponsored post price', 'we accept paid guest posts', 'paid guest post',
  'casino guest post', 'gambling guest post', 'casino backlink',
  'payday loan backlink', 'essay writing service',
]);

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : (process.argv[i + 1] || true);
};

function startChrome() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'free-trusted-'));
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
    try { await page.close(); } catch { /* already gone */ }
    try { page.ws.close(); } catch { /* already closed */ }
  }
}

// One judgement, and the only place a cost fact is decided.
function classify(target, obs) {
  if (obs.error || !obs.url) return { state: 'UNRESOLVED', why: obs.error || 'the browser could not open it' };
  const hay = `${obs.title}\n${obs.h1.join('\n')}\n${obs.head}`;
  if (PARKED(hay)) return { state: 'REJECT_LOW_QUALITY', why: 'a parked or for-sale domain' };
  if (CHALLENGE(hay)) return { state: 'DEFER_PROTECTED', why: 'a bot challenge' };
  if (obs.status >= 400) return { state: 'DEFER_PROTECTED', why: `http ${obs.status}` };
  if (obs.textLen < MIN_TEXT) return { state: 'UNRESOLVED', why: `only ${obs.textLen} characters rendered` };

  // TRUST FIRST. Free never rescues a source nobody should be sent to.
  if (LOW_QUALITY(hay)) {
    return { state: 'REJECT_LOW_QUALITY', why: 'the page sells links or carries affiliate contamination' };
  }

  const freeRaw = FREE_WORDING(hay);
  const paid = PAID_WORDING(hay);
  const commission = COMMISSION_WORDING(hay);
  const institutional = INSTITUTIONAL(hay);
  const trial = TRIAL_WORDING(hay);
  const registrationOnly = REGISTRATION_ONLY(hay);

  // A trial is a price with a delay. It never establishes a usable free tier,
  // and where it is the ONLY free-looking wording the record stays unknown.
  // Free-account wording alone is the same: it describes the door, not the room.
  //
  // The test is "is there free wording LEFT once the registration and trial
  // phrases are taken out". A first version stripped only the English ones
  // while the free list is multilingual, so "Kostenlos registrieren" kept its
  // "kostenlos" and was read as a free service — the same asymmetry that makes
  // an ASCII boundary fail on Cyrillic, in a different disguise.
  const stripped = REGISTRATION_PHRASES.concat(TRIAL_PHRASES)
    .reduce((text, phrase) => text.split(phrase).join(' '), T.normalize(hay));
  const onlyTrial = trial && !paid;
  const free = freeRaw && FREE_WORDING(stripped);

  if (trial && !free && !commission) {
    return {
      state: 'DEFER_COST_UNKNOWN',
      why: onlyTrial
        ? 'the only free wording is a time-limited trial, which is a price with a delay'
        : 'a trial is offered and no ongoing free route is stated',
      institutional,
    };
  }
  if (registrationOnly && !free && !paid && !commission) {
    return {
      state: 'DEFER_COST_UNKNOWN',
      why: 'the page offers a free account, which says nothing about what the action costs',
      institutional,
    };
  }

  if (!free && !paid && !commission) {
    return { state: 'DEFER_COST_UNKNOWN', why: 'the page states no price either way', institutional };
  }
  if (free && commission) {
    return {
      state: 'ACCEPT_FREE_TRUSTED',
      cost: 'free-listing-commission',
      why: 'free to list, with a fee only on a completed sale',
      institutional,
    };
  }
  if (free && paid) {
    return {
      state: 'ACCEPT_FREEMIUM',
      cost: 'free-tier',
      why: 'a free tier stated alongside paid plans',
      institutional,
    };
  }
  if (free) {
    return { state: 'ACCEPT_FREE_TRUSTED', cost: 'free', why: 'the operator states the action is free', institutional };
  }
  if (commission && !paid) {
    return {
      state: 'ACCEPT_FREE_TRUSTED',
      cost: 'free-listing-commission',
      why: 'a fee only on a completed sale, with no upfront charge stated',
      institutional,
    };
  }
  return { state: 'REJECT_PAID_ONLY', cost: 'paid', why: 'payment is required before the action', institutional };
}

// Which countries already have somewhere a business can act for nothing. A
// country with no such source at all is where an unknown is most expensive:
// until one is found the planner has nothing free to offer there, so those
// records are researched before a country that already has ten free options.
function countriesWithoutFreeOption() {
  const covered = new Set();
  const all = new Set();
  for (const C of Object.values(COLLECTIONS)) {
    for (const r of JSON.parse(fs.readFileSync(C.data, 'utf8'))) {
      if (r.currentStatus !== 'active') continue;
      all.add(r.country);
      if (NO_UPFRONT.has(r[C.costField])) covered.add(r.country);
    }
  }
  return new Set([...all].filter((c) => !covered.has(c)));
}

const NO_UPFRONT = new Set(['free', 'freemium', 'free-tier', 'free-listing-commission']);

function targets() {
  const out = [];
  const uncovered = countriesWithoutFreeOption();
  for (const [name, C] of Object.entries(COLLECTIONS)) {
    const rows = JSON.parse(fs.readFileSync(C.data, 'utf8'));
    for (const r of rows) {
      if (r.currentStatus !== 'active') continue;
      const known = r[C.costField];
      if (known && known !== 'unknown') continue;
      const url = C.route(r) || r.website;
      if (!url) continue;
      const onRoute = Boolean(C.route(r));
      // Ordering, most valuable first. File order is nearly alphabetical by
      // country, so a truncated pass that took records as they came would
      // research Albania exhaustively and never reach Germany.
      //
      // The vocabulary is the corpus's own: tier1/tier2/tier3 and P1/P2/P3.
      // Guessing at "tier-1" and "high" instead produced a score that never
      // once fired, which is a ranking that silently does not rank.
      const priority = (onRoute ? 8 : 0)                        // the price is stated where the action is
        + (uncovered.has(r.country) ? 4 : 0)                    // the country has nothing free yet
        + (r.tier === 'tier1' || r.priority === 'P1' ? 2 : 0)   // the planner reaches for these first
        + (r.lastVerified ? 1 : 0);                             // already confirmed to exist
      out.push({
        collection: name, id: r.id, country: r.country, url,
        onRoute, website: r.website, priority,
        key: CK.targetKey(name, r),
      });
    }
  }
  return out;
}

// One place that knows how a stored finding maps onto the identity contract,
// used by every entry point so probe, report, re-judge and apply agree about
// which record a finding belongs to.
function openLedger() {
  const ledger = new CK.Ledger(FINDINGS);
  const byId = new Map();
  for (const [name, C] of Object.entries(COLLECTIONS)) {
    for (const r of JSON.parse(fs.readFileSync(C.data, 'utf8'))) byId.set(`${name}:${r.id}`, [name, r]);
  }
  const moved = CK.backfillKeys(ledger, (f) => {
    const hit = byId.get(`${f.collection}:${f.id}`);
    return hit ? CK.targetKey(hit[0], hit[1]) : null;
  });
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
  // A record already carrying a verdict is not visited again. Re-asking costs
  // a page load and can only replace a considered answer with a noisier one;
  // a caller who genuinely wants it re-read says --refresh.
  if (!process.argv.includes('--refresh')) list = list.filter((t) => !ledger.has(t.key));
  list.sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : 1));
  const limit = arg('--limit');
  if (limit) list = list.slice(0, Number(limit));

  console.log(`Free & trusted: ${list.length} record(s) to visit `
    + `(${already} already answered, ${ledger.size()} finding(s) on disk, `
    + `${list.filter((x) => x.onRoute).length} readable on their own action page).`);
  if (!list.length) { report(ledger.all()); return; }

  CK.onInterrupt(ledger, 'Free & trusted');
  const chrome = await startChrome();
  const queue = list.slice();
  let done = 0;
  const worker = async () => {
    for (;;) {
      const target = queue.shift();
      if (!target) return;
      // eslint-disable-next-line no-await-in-loop
      const obs = await probe(chrome.wsUrl, target);
      // Durable here, before the next navigation. This is the whole point of
      // the file: the verdict exists on disk the moment it exists at all.
      ledger.record({
        ...target,
        observed: {
          status: obs.status, finalUrl: obs.url || null, title: obs.title || null,
          h1: obs.h1 || [], head: (obs.head || ''), textLen: obs.textLen || 0,
        },
        ...classify(target, obs),
      });
      done += 1;
      if (done % 25 === 0) console.log(`  ${done}/${list.length}`);
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
  console.log('\nLEDGER');
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(5)}  ${k}`);
  }
  const byCost = {};
  for (const f of findings.filter((x) => x.cost)) byCost[f.cost] = (byCost[f.cost] || 0) + 1;
  console.log('  costs:', JSON.stringify(byCost));
}

// Re-run the judgement over evidence already captured. No network.
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
    // The verdict is REPLACED, not merged over. Spreading the new one on top of
    // the old kept a `cost` the record no longer earned: three trade
    // associations were correctly demoted to DEFER_COST_UNKNOWN and carried
    // "free-listing-commission" out of the previous run regardless. The ledger
    // was reporting a price nothing had established.
    const { state, cost, why, institutional, ...rest } = f;
    return { ...rest, ...v };
  });
  for (const f of rejudged) ledger.byKey.set(f.key, f);
  ledger.compact();
  console.log(`Re-judged from stored evidence: ${moved} verdict(s) changed.`);
  report(rejudged);
}

// Only ACCEPT states write a cost. Everything else stays unknown, which is the
// true answer and the one a later pass can improve on.
const COST_FOR = {
  directories: { free: 'free', 'free-tier': 'freemium', 'free-listing-commission': 'free', paid: 'paid' },
  marketplaces: {
    free: 'free', 'free-tier': 'free-tier', 'free-listing-commission': 'free-listing-commission', paid: 'paid-upfront',
  },
  media: { free: 'free', 'free-tier': 'freemium', 'free-listing-commission': 'free', paid: 'paid' },
};

// The values this pass is capable of having written. A record holding one of
// them got it from here, which is what makes it safe to take back; a value
// this pass never writes was somebody else's finding and is left alone.
const KNOWN_VALUES = {
  directories: new Set(['free', 'freemium', 'paid']),
  marketplaces: new Set(['free', 'free-tier', 'free-listing-commission', 'paid-upfront']),
  media: new Set(['free', 'freemium', 'paid']),
};

function runApply() {
  const ledger = openLedger();
  ledger.compact();
  const { probedAt = 'unknown' } = ledger.meta;
  const findings = ledger.all();
  const tally = {
    free: 0, freemium: 0, commission: 0, paid: 0, cleared: 0, left: 0,
  };

  for (const [name, C] of Object.entries(COLLECTIONS)) {
    const rows = JSON.parse(fs.readFileSync(C.data, 'utf8'));
    const before = JSON.parse(JSON.stringify(rows));
    const byId = new Map(rows.map((r) => [r.id, r]));

    for (const f of findings.filter((x) => x.collection === name)) {
      const r = byId.get(f.id);
      if (!r) { tally.left += 1; continue; }

      const earned = f.cost && /^ACCEPT|^REJECT_PAID_ONLY$/.test(f.state)
        ? COST_FOR[name][f.cost] : null;

      // RECLASSIFICATION REPLACES. A record that once earned a cost and no
      // longer does must lose it, or the corpus keeps a price nothing supports
      // — five records were demoted to unknown when trial and free-account
      // wording stopped counting, and without this they would have gone on
      // saying "free" forever. An applier that only ever writes forward is how
      // stale facts become permanent.
      if (!earned) {
        const wasOurs = KNOWN_VALUES[name].has(r[C.costField]);
        if (wasOurs && f.state && /^DEFER|^UNRESOLVED|^REJECT_LOW_QUALITY$/.test(f.state)) {
          SAFE.applyPatch(r, { [C.costField]: 'unknown' }, { owner: 'cost', collection: name });
          tally.cleared = (tally.cleared || 0) + 1;
        } else {
          tally.left += 1;
        }
        continue;
      }
      const value = earned;
      SAFE.applyPatch(r, { [C.costField]: value }, { owner: 'cost', collection: name });
      if (value === 'free') tally.free += 1;
      else if (value === 'free-listing-commission') tally.commission += 1;
      else if (/free-tier|freemium/.test(value)) tally.freemium += 1;
      else tally.paid += 1;
    }

    SAFE.assertNoDeletion(before, rows);
    const drift = SAFE.diffFingerprints(SAFE.curatedFingerprint(before), SAFE.curatedFingerprint(rows));
    if (drift.length) throw new Error(`${name}: curated fields drifted on ${drift.join(', ')}`);
    fs.writeFileSync(C.data, `${JSON.stringify(rows, null, 1)}\n`);
  }
  console.log(`Applied (${probedAt}):`, Object.entries(tally).map(([k, v]) => `${k}=${v}`).join(' '));
}

module.exports = {
  classify, targets, FREE_WORDING, PAID_WORDING, COMMISSION_WORDING, LOW_QUALITY, COST_FOR,
  FINDINGS, COLLECTIONS, runApply, KNOWN_VALUES,
};

if (require.main === module) {
  if (process.argv.includes('--apply')) runApply();
  else if (process.argv.includes('--rejudge')) runRejudge();
  else if (process.argv.includes('--report')) report(openLedger().all());
  else runProbe().catch((e) => { console.error(e); process.exit(1); });
}
