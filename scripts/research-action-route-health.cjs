#!/usr/bin/env node
// scripts/research-action-route-health.cjs
'use strict';

// Whether the routes we publish still take a person where we say they do.
//
// ── THE QUESTION HAS CHANGED ────────────────────────────────────────────────
//
// Earlier phases asked "can we find an action URL". 365 of them are now
// recorded and shown to users, so the question is whether they can be relied
// on — and a 200 does not answer it. A URL that responds may be a homepage, a
// login wall, a country chooser, a help centre, an expired campaign, an error
// page served with 200, or a perfectly healthy page for the wrong product.
//
// ── WHAT MAKES A ROUTE RELIABLE ─────────────────────────────────────────────
//
// Three things, checked separately, because each can fail while the others
// hold:
//
//   1. it arrives somewhere            (transport)
//   2. it stays on the operator's product, in the right market   (identity)
//   3. the destination still offers the action we recorded       (semantics)
//
// A route that fails (3) while passing (1) is the dangerous one: it looks
// healthy from every automated angle and wastes the trip of anyone who takes
// it.
//
// ── TRANSPORT FAILURE IS NOT EVIDENCE ───────────────────────────────────────
//
// A timeout, a DNS failure, a 403, a 429, a TLS error or a browser crash says
// something about this run. It says nothing about whether the action still
// exists. None of them may downgrade a verified route: only positive,
// contradictory evidence can do that. This is why probing and applying are
// separate commands over a committed findings file — so a bad afternoon on one
// machine cannot quietly delete a year of verified actionability.
//
//   node scripts/research-action-route-health.cjs          # probe
//   node scripts/research-action-route-health.cjs --apply  # merge findings
//   node scripts/research-action-route-health.cjs --report # read the registry
//
// Nothing in the build, the validator or the test suite invokes this file.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { openPage, launch } = require('./tests/helpers/cdp.cjs');
const SAFE = require('./lib/rc-safe-apply.cjs');
const T = require('./lib/rc-text-match.cjs');

const ROOT = path.resolve(__dirname, '..');
const FINDINGS = path.join(ROOT, 'data/business-directories/.route-health.json');

// Every collection that publishes a route, and where each route lives. The
// action a route belongs to decides what its destination has to still offer.
const COLLECTIONS = {
  directories: {
    data: path.join(ROOT, 'data/business-directories/opportunities.json'),
    routes: [
      { field: 'submissionUrl', actionOf: (r) => r.listingAction },
      { field: 'claimUrl', actionOf: () => 'claim' },
    ],
  },
  marketplaces: {
    data: path.join(ROOT, 'data/marketplaces/marketplaces.json'),
    routes: [{ field: 'sellerActionUrl', actionOf: (r) => r.sellerAction }],
  },
  media: {
    data: path.join(ROOT, 'data/media-pr-publishing/media-platforms.json'),
    routes: [
      { field: 'submissionUrl', actionOf: () => 'submit' },
      { field: 'pitchUrl', actionOf: () => 'pitch' },
      { field: 'pressReleaseUrl', actionOf: () => 'press-release' },
      { field: 'advertisingUrl', actionOf: () => 'advertise' },
    ],
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
const MIN_TEXT = 200;
// How much of the page is judged on, and therefore how much is kept.
const EVIDENCE_CHARS = 2500;

// ── VOCABULARY, all Unicode-safe ────────────────────────────────────────────

const CHALLENGE = T.patternMatcher([
  'attention required', 'just a moment', 'checking your browser',
  'verify (you are|you.re) human', 'access denied', 'enable javascript and cookies',
  'unusual traffic', 'captcha',
]);

// The destination still offers the action. Grouped by what was recorded, in the
// languages these operators publish in.
const STILL_OFFERS = {
  'create-seller-profile': T.stemMatcher([
    'sell', 'seller', 'vendor', 'merchant', 'vender', 'vendedor', 'vendeur', 'verkauf',
    'verkäufer', 'venditore', 'продав', 'продаж', 'satıcı', 'sprzedaw', 'verkoper',
    // "shop", "store" and "boutique" were here and had to go: they are shopper
    // words at least as much as seller words, and any marketplace homepage
    // contains one. With them, a route that had degraded into a redirect to the
    // front page passed the semantic check and was recorded as reliable.
  ]),
  'publish-classified': T.stemMatcher([
    // Deliberately NOT the bare stem "ad": it appears inside "address",
    // "admin" and "advice" and would make this check meaningless.
    'advert', 'listing', 'classified', 'post an', 'publish', 'sell', 'vend',
    'anuncio', 'annonce', 'anzeige', 'inserat', 'annuncio', 'объявлен', 'ilan',
    'ogłoszen', 'advertentie', 'anúncio',
  ]),
  'post-advertisement': T.stemMatcher([
    'advertis', 'media kit', 'rate card', 'sponsor', 'werbung',
    'publicidad', 'publicité', 'pubblicità', 'реклам',
    // Romance-language marketplaces say "anunciar"/"anuncie"/"vender" where an
    // English one says "advertise". Webmotors titles itself "Vender Carro Usado
    // — Anuncie na…" and was reported as the wrong action by a vocabulary that
    // only knew the English stem.
    'anunci', 'anúnci', 'vend', 'annonce', 'inserat', 'ilan', 'ogłoszen', 'объявлен',
  ]),
  'apply-for-inclusion': T.stemMatcher(['apply', 'application', 'join', 'partner', 'become']),
  // "add" alone hides inside "address" and "additional", the same trap as the
  // bare "ad" above, so these carry enough context to mean what they say.
  // CJK has no spaces and no Latin stems, so an English-only list reported
  // Hotfrog's Hong Kong and Japan pages — 新增商戶 ("add a business") and
  // ビジネスリスティング ("business listing") — as the WRONG action, and
  // applying that would have deleted two working routes. The same widening
  // covers the developer-programme and brand-portal wording that several
  // platforms use instead of "add your business".
  create: T.stemMatcher(['add your', 'add a', 'add business', 'add company', 'submit',
    'list your', 'register', 'create a', 'sign up', 'get listed', 'anmeld', 'inscri',
    'registr', 'eintrag', 'promote your', 'developer program', 'partner program',
    'for business', 'business profile', 'listing',
    '新增', '追加', '登録', '掲載', '商戶', '企业', '企業', '리스팅', '등록']),
  // Three of these were bare stems short enough to hide inside ordinary words,
  // and this file decides whether a route is STILL OFFERED. A stem that matches
  // everything never reports anything as gone, so a route that had rotted away
  // kept its clean bill of health:
  //
  //   'claim' is inside "Disclaimer:", which is in the footer of nearly every
  //           directory in the corpus
  //   'tip'   is inside "multiple", as in "choose from multiple plans"
  //   'rate'  is inside corporate, accurate, generated, operates, moderate and
  //           separate, all of which are dense on publisher pages
  //
  // They keep the same words and gain a boundary, so every genuine use still
  // matches. Widening was not an option and neither was deleting them: a
  // narrower vocabulary here would report live routes as dead, and this file's
  // findings can retract a working route.
  claim: T.patternMatcher(['claim[a-z]*', 'verify[a-z]*', 'manage your', 'is this your',
    'own this', 'for brands', 'for business', 'business profile', 'business account']),
  'create-and-claim': T.patternMatcher(['add your', 'add a', 'claim[a-z]*', 'list your',
    'register[a-z]*', 'for business', 'business profile']),
  submit: T.patternMatcher(['submit[a-z]*', 'write[a-z]*', 'contribute[a-z]*', 'tip[a-z]*',
    'story', 'article[a-z]*']),
  pitch: T.stemMatcher(['pitch', 'editor', 'editorial', 'newsroom', 'contact']),
  'press-release': T.stemMatcher(['press release', 'newswire', 'distribute', 'submit']),
  advertise: T.patternMatcher(['advertis[a-z]*', 'media kit', 'sponsor[a-z]*', 'rate[a-z]*']),
};

// A page that exists to take you somewhere else, or to ask who you are.
const LOGIN_PAGE = T.patternMatcher([
  'sign in', 'log in', 'login', 'password', 'iniciar sesión', 'connexion',
  'anmelden', 'войти', 'giriş yap', 'zaloguj',
]);
// Wording that says the login belongs to a SELLER flow rather than to a reader.
const LOGIN_IN_CONTEXT = T.patternMatcher([
  'seller', 'vendor', 'merchant', 'business account', 'partner', 'advertiser',
  'vendedor', 'verkäufer', 'satıcı', 'продав',
]);

const NOT_FOUND = T.patternMatcher([
  'page not found', '404', 'no longer available', 'nie znaleziono',
  'seite nicht gefunden', 'página no encontrada', 'страница не найдена',
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

async function probe(wsUrl, route) {
  const page = await openPage(wsUrl);
  try {
    await page.goto(route.url);
    await new Promise((r) => { setTimeout(r, SETTLE_MS); });
    const seen = await page.eval((evidenceChars) => {
      const text = document.body ? document.body.innerText : '';
      return {
        title: document.title || '',
        // The SAME slice that gets stored. When the classifier read more than
        // the findings file kept, --rejudge reached different verdicts from the
        // probe that produced them — the evidence did not reproduce the answer,
        // which is the one property this file promises.
        head: text.slice(0, evidenceChars),
        textLen: text.length,
        url: location.href,
        h1: [...document.querySelectorAll('h1, h2')].slice(0, 6)
          .map((h) => (h.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90)),
        forms: document.querySelectorAll('form').length,
        password: document.querySelectorAll('input[type="password"]').length,
      };
    }, EVIDENCE_CHARS);
    const doc = page.requests.find((r) => r.url === seen.url) || page.requests[0] || null;
    return {
      ...seen,
      status: doc ? doc.status : 0,
      chain: page.redirects.map((h) => `${h.status} ${h.to}`),
      error: null,
    };
  } catch (e) {
    return { error: String(e.message || e).slice(0, 160), status: 0 };
  } finally {
    try { await page.close(); } catch { /* already gone */ }
    try { page.ws.close(); } catch { /* already closed */ }
  }
}

const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return null; } };
const pathOf = (u) => { try { return new URL(u).pathname.replace(/\/+$/, '') || '/'; } catch { return '/'; } };

// The whole judgement, and the only place a route's standing changes.
function classify(route, obs) {
  // ── TRANSPORT. None of these is evidence about the action. ────────────────
  if (obs.error) return { state: 'PROTECTED_UNVERIFIABLE', why: obs.error, transient: true };
  if (obs.status === 0 || !obs.url) return { state: 'PROTECTED_UNVERIFIABLE', why: 'no response', transient: true };
  if ([403, 429, 408, 502, 503, 504, 522, 523, 524, 526].includes(obs.status)) {
    return { state: 'PROTECTED_UNVERIFIABLE', why: `http ${obs.status}`, transient: true };
  }
  const hay = `${obs.title}\n${obs.h1.join('\n')}\n${obs.head}`;
  if (CHALLENGE(hay)) return { state: 'PROTECTED_UNVERIFIABLE', why: 'bot challenge', transient: true };

  // ── DEAD. Positive, contradictory evidence only. ──────────────────────────
  if ([404, 410].includes(obs.status)) return { state: 'DEAD', why: `http ${obs.status}` };
  if (NOT_FOUND(`${obs.title}\n${obs.h1.join('\n')}`)) return { state: 'DEAD', why: 'the page says it does not exist' };
  if (obs.textLen < MIN_TEXT) return { state: 'PROTECTED_UNVERIFIABLE', why: `only ${obs.textLen} characters rendered`, transient: true };

  // ── IDENTITY. Did we stay on the operator's product? ──────────────────────
  const from = hostOf(route.url);
  const to = hostOf(obs.url);
  const siteHost = hostOf(route.website);
  const sameFamily = to === from || to === siteHost
    || (to && from && (to.endsWith(`.${from}`) || from.endsWith(`.${to}`)))
    || (to && siteHost && (to.endsWith(`.${siteHost}`) || siteHost.endsWith(`.${to}`)));

  const landedHome = pathOf(obs.url) === '/' && pathOf(route.url) !== '/';
  const offers = STILL_OFFERS[route.action] || null;
  // A homepage mentions everything the site does, somewhere. So when a route
  // has degraded into a redirect to the front page, the evidence has to be
  // where a page states its own purpose — the title or a heading — and not
  // merely present in the body copy. Anywhere else, the whole rendered text is
  // fair evidence, because the page was reached deliberately.
  const statement = `${obs.title}\n${obs.h1.join('\n')}`;
  const semanticsHold = offers ? offers(landedHome ? statement : hay) : false;

  if (!sameFamily) {
    // A different product answered. Only the operator's own wording can save
    // it, and even then it is recorded as a mismatch for a person to look at.
    return {
      state: 'PRODUCT_MISMATCH',
      why: `${from} now answers as ${to}`,
      to: obs.url,
      semanticsHold,
    };
  }

  // ── SEMANTICS. Does the destination still offer what we recorded? ─────────
  const isLogin = obs.password > 0 || LOGIN_PAGE(`${obs.title}\n${obs.h1.join('\n')}`);
  if (isLogin) {
    // A seller flow may legitimately begin at a sign-in. A bare login page with
    // nothing tying it to the action is not a route to that action.
    const inContext = LOGIN_IN_CONTEXT(hay) || semanticsHold;
    return inContext
      ? { state: 'LOGIN_GATE_FOR_CORRECT_ACTION', why: 'authentication, in the recorded action’s context', to: obs.url }
      : { state: 'WRONG_ACTION', why: 'a bare login page with nothing tying it to the recorded action', to: obs.url };
  }

  if (landedHome && !semanticsHold) {
    return { state: 'GENERAL_HOME_REDIRECT', why: 'the route now lands on the homepage', to: obs.url };
  }
  if (!semanticsHold) {
    return {
      state: 'WRONG_ACTION',
      why: `the destination does not offer "${route.action}" in any wording this checks`,
      to: obs.url,
    };
  }

  const moved = obs.url !== route.url;
  return {
    state: moved ? 'VALID_ACTION_AFTER_REDIRECT' : 'VALID_ACTION_DESTINATION',
    why: `the destination still offers "${route.action}"`,
    to: obs.url,
    chainLength: (obs.chain || []).length,
  };
}

function inventory() {
  const out = [];
  for (const [name, C] of Object.entries(COLLECTIONS)) {
    const rows = JSON.parse(fs.readFileSync(C.data, 'utf8'));
    for (const r of rows) {
      for (const spec of C.routes) {
        if (!r[spec.field]) continue;
        out.push({
          collection: name,
          id: r.id,
          field: spec.field,
          url: r[spec.field],
          website: r.website,
          country: r.country,
          action: spec.actionOf(r) || 'unknown',
        });
      }
    }
  }
  return out;
}

async function runProbe() {
  if (!CHROME) { console.error('No Chrome on this machine.'); process.exit(1); }
  let routes = inventory();
  const ids = arg('--ids');
  if (ids && ids !== true) {
    const want = new Set(String(ids).split(',').map((s) => s.trim()));
    routes = routes.filter((r) => want.has(r.id));
  }
  const limit = arg('--limit');
  if (limit) routes = routes.slice(0, Number(limit));

  console.log(`Route health: ${routes.length} published route(s).`);
  const chrome = await startChrome();
  const findings = [];
  const queue = routes.slice();
  let done = 0;
  const worker = async () => {
    for (;;) {
      const route = queue.shift();
      if (!route) return;
      // eslint-disable-next-line no-await-in-loop
      const obs = await probe(chrome.wsUrl, route);
      const verdict = classify(route, obs);
      findings.push({
        ...route,
        // Enough of the page to re-reach the same verdict later WITHOUT the
        // network. Every judgement in this file has already been corrected
        // twice, and each correction cost a full re-probe of 373 sites because
        // the evidence had not been kept. Storing the statement and a slice of
        // the body makes `--rejudge` possible and keeps other people's servers
        // out of it.
        observed: {
          status: obs.status, finalUrl: obs.url || null, title: obs.title || null,
          h1: obs.h1 || [], head: obs.head || '',
          textLen: obs.textLen || 0, forms: obs.forms || 0, password: obs.password || 0,
          chain: (obs.chain || []).length,
        },
        ...verdict,
      });
      done += 1;
      if (done % 40 === 0) console.log(`  ${done}/${routes.length}`);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => { setTimeout(r, PACE_MS); });
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  chrome.proc.kill('SIGKILL');

  // A partial run replaces what it re-examined and keeps the rest, keyed on the
  // route rather than the record: one record may publish several.
  const key = (f) => `${f.collection}:${f.id}:${f.field}`;
  let merged = findings;
  if (fs.existsSync(FINDINGS)) {
    const prior = JSON.parse(fs.readFileSync(FINDINGS, 'utf8')).findings || [];
    if (prior.length) {
      const fresh = new Map(findings.map((f) => [key(f), f]));
      merged = prior.map((f) => fresh.get(key(f)) || f)
        .concat(findings.filter((f) => !prior.some((p) => key(p) === key(f))));
    }
  }
  merged.sort((a, b) => (key(a) < key(b) ? -1 : 1));
  fs.writeFileSync(FINDINGS, `${JSON.stringify({
    probedAt: new Date().toISOString().slice(0, 10), findings: merged,
  }, null, 1)}\n`);

  report(merged);
  console.log('Nothing changed — rerun with --apply.');
  try { fs.rmSync(chrome.profile, { recursive: true, force: true }); } catch { /* the OS reaps it */ }
}

function report(findings) {
  const tally = {};
  for (const f of findings) tally[f.state] = (tally[f.state] || 0) + 1;
  console.log('\nROUTE HEALTH');
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(5)}  ${k}`);
  }
  const byCollection = {};
  for (const f of findings) {
    const c = byCollection[f.collection] || (byCollection[f.collection] = { total: 0, valid: 0 });
    c.total += 1;
    if (/^VALID|LOGIN_GATE/.test(f.state)) c.valid += 1;
  }
  console.log('\n  collection      routes   reliable');
  for (const [k, v] of Object.entries(byCollection)) {
    console.log(`  ${k.padEnd(16)}${String(v.total).padStart(5)}${String(v.valid).padStart(11)}`
      + `  (${(v.valid / v.total * 100).toFixed(0)}%)`);
  }
}

// Only positive, contradictory evidence changes a canonical fact. Everything
// transient is recorded and does nothing.
const DOWNGRADES = new Set(['DEAD', 'WRONG_ACTION', 'GENERAL_HOME_REDIRECT']);

function runApply() {
  const { probedAt, findings } = JSON.parse(fs.readFileSync(FINDINGS, 'utf8'));
  const tally = {
    corrected: 0, cleared: 0, kept: 0, transient: 0, mismatch: 0,
  };
  const changes = [];

  for (const [name, C] of Object.entries(COLLECTIONS)) {
    const rows = JSON.parse(fs.readFileSync(C.data, 'utf8'));
    const before = JSON.parse(JSON.stringify(rows));
    const byId = new Map(rows.map((r) => [r.id, r]));

    for (const f of findings.filter((x) => x.collection === name)) {
      const r = byId.get(f.id);
      if (!r || r[f.field] !== f.url) continue; // the corpus moved on; the finding is stale

      if (f.transient) { tally.transient += 1; continue; }

      if (DOWNGRADES.has(f.state)) {
        // The route is gone or goes somewhere else. Remove it and let the
        // record fall back to "action known, route not established", which is
        // exactly what is true.
        SAFE.applyPatch(r, { [f.field]: null }, { owner: 'actionability', collection: name });
        changes.push(`${f.id}.${f.field}: ${f.state} — ${f.why}`);
        tally.cleared += 1;
      } else if (f.state === 'VALID_ACTION_AFTER_REDIRECT' && f.to && f.to !== f.url
        && hostOf(f.to) === hostOf(f.url)) {
        // Same host, stable destination, semantics intact: canonicalise so the
        // product stops publishing a redirect it does not need.
        SAFE.applyPatch(r, { [f.field]: f.to }, { owner: 'actionability', collection: name });
        changes.push(`${f.id}.${f.field}: canonicalised to ${f.to}`);
        tally.corrected += 1;
      } else if (f.state === 'PRODUCT_MISMATCH') {
        tally.mismatch += 1;
      } else {
        tally.kept += 1;
      }
    }

    SAFE.assertNoDeletion(before, rows);
    const drift = SAFE.diffFingerprints(SAFE.curatedFingerprint(before), SAFE.curatedFingerprint(rows));
    if (drift.length) throw new Error(`${name}: curated fields drifted on ${drift.join(', ')}`);
    fs.writeFileSync(C.data, `${JSON.stringify(rows, null, 1)}\n`);
  }

  fs.writeFileSync(path.join(ROOT, 'data/business-directories/.route-health-changes.json'),
    `${JSON.stringify({ appliedAt: probedAt, changes }, null, 1)}\n`);
  console.log('Applied:', Object.entries(tally).map(([k, v]) => `${k}=${v}`).join(' '));
}

// Re-run the judgement over evidence already captured. No network, no site
// touched, deterministic for a given findings file — which is what makes it
// safe to correct a classifier without asking 373 servers to prove it again.
function runRejudge() {
  const file = JSON.parse(fs.readFileSync(FINDINGS, 'utf8'));
  const before = {};
  for (const f of file.findings) before[f.state] = (before[f.state] || 0) + 1;

  const rejudged = file.findings.map((f) => {
    const o = f.observed || {};
    if (o.head === undefined) return f; // captured before evidence was kept
    const verdict = classify(
      { url: f.url, website: f.website, action: f.action },
      {
        title: o.title || '', h1: o.h1 || [], head: o.head || '', textLen: o.textLen || 0,
        url: o.finalUrl, status: o.status, forms: o.forms || 0, password: o.password || 0,
        chain: [], error: null,
      },
    );
    return { ...f, ...verdict };
  });

  const after = {};
  for (const f of rejudged) after[f.state] = (after[f.state] || 0) + 1;
  const moved = rejudged.filter((f, i) => f.state !== file.findings[i].state).length;

  fs.writeFileSync(FINDINGS, `${JSON.stringify({ ...file, findings: rejudged }, null, 1)}\n`);
  console.log(`Re-judged from stored evidence: ${moved} verdict(s) changed.`);
  console.log('  before:', JSON.stringify(before));
  console.log('  after :', JSON.stringify(after));
  report(rejudged);
}

module.exports = { classify, inventory, STILL_OFFERS, DOWNGRADES };

if (require.main === module) {
  if (process.argv.includes('--apply')) runApply();
  else if (process.argv.includes('--rejudge')) runRejudge();
  else if (process.argv.includes('--report')) report(JSON.parse(fs.readFileSync(FINDINGS, 'utf8')).findings);
  else runProbe().catch((e) => { console.error(e); process.exit(1); });
}
