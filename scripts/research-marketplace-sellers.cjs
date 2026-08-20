#!/usr/bin/env node
// scripts/research-marketplace-sellers.cjs
'use strict';

// What a business can actually do on the 295 active marketplaces.
//
// ── WHY NONE OF THEM HAD AN ANSWER ──────────────────────────────────────────
//
// Not because nobody looked. Because there was nowhere to write it down: the
// marketplace schema had no field for a seller route, so every pass that found
// one had to throw it away. The schema now holds `sellerAction` and
// `sellerActionUrl`, and this fills them.
//
// ── THE DISTINCTION THIS PASS EXISTS TO PROTECT ─────────────────────────────
//
// A marketplace will always offer you an account. Almost none of them mean the
// same thing by it. "Sign up", "Register", "Create account", "Log in" are how a
// BUYER gets a watchlist — and reading one as seller onboarding would put a
// business through a flow that never asks what they sell.
//
// So a generic account link is never enough. The operator has to say, in its
// own words, that this route is for selling: "Become a seller", "Start
// selling", "Post an ad", "List your item", "Sell on <brand>". Everything else
// leaves the record unknown, which is a true answer.
//
// ── AND NOT EVERY MARKETPLACE HAS A ROUTE AT ALL ────────────────────────────
//
// Some are curated (`invite-only`). Some carry only the operator's own stock or
// exist for buyers (`not-applicable`). Those are findings, not failures, and
// they have their own values so nothing has to be dressed up as actionable.
//
//   node scripts/research-marketplace-sellers.cjs          # probe
//   node scripts/research-marketplace-sellers.cjs --apply  # merge findings
//
// Nothing in the build, the validator or the test suite invokes this file.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { openPage, launch } = require('./tests/helpers/cdp.cjs');
const SAFE = require('./lib/rc-safe-apply.cjs');
const REFUSAL = require('./lib/rc-refusal.cjs');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data/marketplaces/marketplaces.json');
const FINDINGS = path.join(ROOT, 'data/marketplaces/.seller-actionability.json');

const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
].find((p) => fs.existsSync(p));

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const SETTLE_MS = 4000;
const CONCURRENCY = 4;
const PACE_MS = 700;
const MIN_TEXT = 400;
const MAX_ANCHOR_TEXT = 60;
const MAX_HOPS = 2;



const PARKED = [
  [/\bdomain\b[^!?\n]{0,60}\b(is|are|may be|might be) for sale\b/i, 'domain for sale'],
  [/\b(buy|purchase|enquire about) this domain\b/i, 'domain for sale'],
  [/\b(parked|parking) (domain|page)\b/i, 'parked domain'],
  [/\bhugedomains\b|\bsedo\.com\b|\bafternic\b|\bdan\.com\b/i, 'domain marketplace'],
  // "Coming soon" is a placeholder only on a page that has nothing else on it.
  // As a SECTION label on a working marketplace it means new stock is arriving,
  // and reading it as abandonment flagged EthioJobs, MagicBricks and Adpost —
  // three live platforms — for removal review. The deletion firewall is why
  // that cost nothing, but a guard that fires on healthy pages is still wrong.
  [/\bunder construction\b|\bcoming soon\b/i, 'placeholder page', { maxText: 1500 }],
];

// Wording that says, in the operator's voice, that this route is for SELLING.
// Ordered: the first matching group decides the action, so a site offering both
// a merchant application and a classified form resolves to the stronger claim.
//
// Localised deliberately — these markets do not publish in English, and an
// English-only matcher would report "no route" for most of the corpus and call
// that a finding about the platform rather than about the matcher.
//
// The non-ASCII patterns carry NO \b boundaries. In JavaScript \b is defined on
// ASCII word characters, so /\bподать объявление\b/ never matches anything at
// all — every Cyrillic, Turkish and Polish phrase here was dead on arrival, and
// the corpus would have recorded those markets as having no seller route while
// the failure was entirely in this file.
const SELLER_WORDING = [
  {
    action: 'create-seller-profile',
    text: [
      // "partner" and "supplier" were here and are gone. On a marketplace,
      // "Become a Partner" is an affiliate, franchise, API or media-partner
      // programme, and "Become a supplier" is corporate procurement — selling
      // TO the operator, not through it. Both filed a seller route: cars24
      // recorded https://www.cars24.com/become-our-partner/ as the place a
      // person goes to sell a car.
      /\b(become|be) an? (seller|vendor|merchant)\b/i,
      /\bstart selling\b/i,
      /\bsell (on|with|through) \w+/i,
      /\bseller (registration|sign ?up|account|centre|center|portal)\b/i,
      /\bopen (a |your )?(shop|store)\b/i,
      // Reflexive "se vende"/"se alquila" is how a SELLER writes an ad title —
      // "Piso se vende en el centro de Málaga" — and a classifieds homepage is
      // mostly seller-written titles. Restricted to the infinitive, and never
      // after "se".
      /(?<!\bse )\bvender (en|con) \w+/i, /\bempieza a vender\b/i, /\bvender ahora\b/i,
      /\bvendre sur \w+/i, /\bdevenir vendeur\b/i, /commencer à vendre/i,
      /\bverkaufen (auf|bei) \w+/i, /verkäufer werden/i, /\bjetzt verkaufen\b/i,
      /(?<!\ba )\bvender no \w+/i, /\bcomece a vender\b/i,
      /\bvendi su \w+/i, /\bdiventa venditore\b/i,
      /стать продавцом/i, /начать продавать/i,
      /satıcı ol/i, /satış yap/i,
      /zostań sprzedawcą/i, /zacznij sprzedawać/i,
      /\bverkopen op \w+/i, /\bword verkoper\b/i,
    ],
  },
  {
    action: 'publish-classified',
    text: [
      /\bpost (an?|your) (ad|advert|advertisement|listing|classified)\b/i,
      /\bplace (an?|your) (ad|advert|listing)\b/i,
      /\blist (an?|your) (item|product|car|property|vehicle)\b/i,
      /\bsubmit (an?|your) (ad|listing)\b/i,
      /\bsell (an?|your) (item|car|property|stuff)\b/i,
      /\bpublicar (un )?anuncio\b/i, /\bpon tu anuncio\b/i, /\bsubir producto\b/i,
      /(déposer|publier) une annonce/i,
      /\banzeige (aufgeben|schalten)\b/i, /\binserat aufgeben\b/i,
      /\bpubblica (un )?annuncio\b/i,
      /anunciar grátis/i, /publicar anúncio/i,
      /подать объявление/i, /разместить объявление/i,
      /\bilan ver\b/i,
      /dodaj ogłoszenie/i,
      /\bplaats een advertentie\b/i, /\bzet te koop\b/i,
    ],
  },
  {
    action: 'apply-for-inclusion',
    text: [
      /\b(apply|application) (to|for) (sell|become a (seller|vendor|merchant|partner))\b/i,
      /\b(vendor|merchant|supplier|partner) application\b/i,
      /\bapply to (join|be listed)\b/i,
    ],
  },
  {
    action: 'post-advertisement',
    text: [
      /\badvertise (with|on) us\b/i,
      /\badvertising (options|opportunities|packages)\b/i,
    ],
  },
];

// A nav item that is just the verb "sell", in the market's own language. This
// IS operator wording — "Vender" on MercadoLibre is the site telling you where
// selling happens — and rejecting it would leave the largest marketplace in
// Latin America recorded as having no seller route.
//
// What it establishes is that a route EXISTS. Which of the canonical actions it
// is comes from `marketplaceType`, a curated fact the collection already
// asserts, rather than from a guess by this pass. That division is the point:
// the evidence decides there is a route, the collection decides what kind of
// platform it is.
const BARE_SELL = [
  /^(sell|sell now|start selling)$/i,
  /^(vender|vende|vender ahora)$/i,
  /^(vendre|vends)$/i,
  /^(verkaufen|verkauf)$/i,
  /^(vendere|vendi)$/i,
  /^(продать|продавать)$/i,
  /^(sat|satış yap|satıcı ol|[iİ]lan ver)$/i,
  /^(sprzedaj|sprzedawaj)$/i,
  /^(verkopen)$/i,
  /^(sælg|sälj|selg|myy)$/i,
  /^(vender agora|anunciar)$/i,
];

const ACTION_FOR_TYPE = (type) => (type === 'b2b' ? 'create-seller-profile'
  : type === 'general-classifieds' ? 'publish-classified' : 'post-advertisement');

// Words that look like onboarding and are not. A BUYER gets all of these.
// Anchors that are not a route to anything, whatever else they say. The app
// banner is the reason: MercadoLibre prints "¡Compra y vende con la app!"
// across five countries, it matched the Spanish seller vocabulary, and five
// records were published telling a seller that the way to sell is to download
// an app. Argentina escaped only because a plain "Vender" link outranked it.
const NOT_A_ROUTE = [
  /(la |the |nuestra |our )?app/i, /descarga(r)?/i, /download/i,
  /google play/i, /app store/i,
  // Editorial about selling is not the place to sell.
  /^how to /i, /blog/i, /gu[ií]a/i, /cómo vender/i,
];

const BUYER_ACCOUNT = [
  /^(sign ?up|sign ?in|log ?in|register|registration|create an? account|my account|join)$/i,
  /^(registrarse|iniciar sesión|mi cuenta|regístrate)$/i,
  /^(s'inscrire|connexion|mon compte|inscription)$/i,
  /^(anmelden|registrieren|mein konto|einloggen)$/i,
  /^(войти|регистрация|мой кабинет)$/i,
];

// Pages a marketplace links to when it is explaining how selling works.
const SECOND_HOP = [
  /\bsell\b/i, /\bseller\b/i, /\bvendor\b/i, /\bmerchant\b/i,
  /\bfor (business|businesses|professionals|sellers)\b/i,
  /\badvertise\b/i,
  /\bvender\b/i, /\bvendre\b/i, /\bverkaufen\b/i, /\bvendere\b/i, /продать/i, /satıcı/i,
];

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

const collectAnchors = () => [...document.querySelectorAll('a[href]')].map((a) => ({
  text: (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90),
  href: a.href,
})).filter((a) => a.text && /^https?:/.test(a.href));

async function probe(wsUrl, record) {
  const page = await openPage(wsUrl);
  try {
    await page.goto(record.website);
    await new Promise((r) => { setTimeout(r, SETTLE_MS); });

    const seen = await page.eval((hopSrc) => {
      const hopRe = hopSrc.map((s) => new RegExp(s.slice(s.indexOf('/') + 1, s.lastIndexOf('/')), 'i'));
      const text = document.body ? document.body.innerText : '';
      const anchors = [...document.querySelectorAll('a[href]')].map((a) => ({
        text: (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90),
        href: a.href,
      })).filter((a) => a.text && /^https?:/.test(a.href));
      const hops = [];
      for (const a of anchors) {
        if (hops.length >= 4) break;
        if (!hopRe.some((re) => re.test(a.text))) continue;
        if (a.href === location.href || hops.includes(a.href)) continue;
        hops.push(a.href);
      }
      return {
        title: document.title || '',
        head: text.slice(0, 2000),
        textLen: text.length,
        url: location.href,
        anchors,
        hops,
      };
    }, SECOND_HOP.map(String));

    // One step along the operator's own "sell with us" navigation, where the
    // wording usually lives. Same-origin only.
    let deepAnchors = [];
    const origin = (() => { try { return new URL(seen.url).origin; } catch { return null; } })();
    for (const href of (seen.hops || []).filter((h) => origin && h.startsWith(origin)).slice(0, MAX_HOPS)) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await page.goto(href);
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => { setTimeout(r, 1500); });
        // eslint-disable-next-line no-await-in-loop
        deepAnchors = deepAnchors.concat(await page.eval(collectAnchors));
      } catch { /* a page that will not load establishes nothing */ }
    }

    const doc = page.requests.find((r) => r.url === seen.url) || page.requests[0] || null;
    return { ...seen, deepAnchors, status: doc ? doc.status : 0, error: null };
  } catch (e) {
    return { error: String(e.message || e).slice(0, 160), status: 0 };
  } finally {
    try { await page.close(); } catch { /* already gone */ }
    try { page.ws.close(); } catch { /* already closed */ }
  }
}

function assess(record, obs) {
  if (obs.error || !obs.url) return { state: 'UNRESOLVED', why: obs.error || 'the browser could not open it' };
  const hay = `${obs.title}\n${obs.head}`;
  for (const [re, label, opts] of PARKED) {
    if (!re.test(hay)) continue;
    if (opts && opts.maxText && obs.textLen > opts.maxText) continue;
    return { state: 'ONTOLOGY_REVIEW', why: `${label}, not a marketplace` };
  }
  const refusal = REFUSAL.refusalReason(hay);
  if (refusal) { const label = refusal; return { state: 'UNKNOWN_PROTECTED', why: label }; }
  if (obs.status >= 400) return { state: 'UNKNOWN_PROTECTED', why: `http ${obs.status}` };
  if (obs.textLen < MIN_TEXT) return { state: 'UNRESOLVED', why: `only ${obs.textLen} characters rendered` };

  // A record whose domain now answers as somewhere else is a redirect question.
  let moved = false;
  try {
    moved = SAFE.registrable(new URL(record.website).hostname) !== SAFE.registrable(new URL(obs.url).hostname);
  } catch { moved = false; }
  if (moved) {
    return {
      state: 'REDIRECTED',
      why: `${new URL(record.website).hostname} now answers as ${new URL(obs.url).hostname}`,
      to: obs.url,
    };
  }

  const anchors = [...(obs.anchors || []), ...(obs.deepAnchors || [])];
  const buyerOnly = [];
  for (const group of SELLER_WORDING) {
    for (const a of anchors) {
      if (a.text.length > MAX_ANCHOR_TEXT) continue;
      if (a.href === record.website || a.href === obs.url) continue;
      // A buyer account link is never seller evidence, however invitingly it
      // is placed. Recorded so the report can say how often it was offered.
      if (BUYER_ACCOUNT.some((re) => re.test(a.text))) { buyerOnly.push(a.text); continue; }
      if (NOT_A_ROUTE.some((re) => re.test(a.text))) continue;
      if (!group.text.some((re) => re.test(a.text))) continue;
      return {
        state: 'ACTION_ESTABLISHED',
        action: group.action,
        route: { text: a.text, href: a.href },
        why: `the operator publishes "${a.text}"`,
        buyerOnlyOffered: [...new Set(buyerOnly)].slice(0, 3),
      };
    }
  }

  // Second pass: the bare verb, checked only after the explicit phrasings so a
  // site saying both resolves on the more specific one.
  for (const a of anchors) {
    if (a.text.length > MAX_ANCHOR_TEXT) continue;
    if (a.href === record.website || a.href === obs.url) continue;
    if (!BARE_SELL.some((re) => re.test(a.text))) continue;
    return {
      state: 'ACTION_ESTABLISHED',
      action: ACTION_FOR_TYPE(record.marketplaceType),
      route: { text: a.text, href: a.href },
      why: `the operator publishes "${a.text}", and the platform is recorded as ${record.marketplaceType}`,
      buyerOnlyOffered: [...new Set(buyerOnly)].slice(0, 3),
    };
  }

  return {
    state: 'ACTION_UNKNOWN',
    why: buyerOnly.length
      ? `the site offers an account (${[...new Set(buyerOnly)].slice(0, 2).join(', ')}) but nothing on it says that route is for selling`
      : 'no seller or listing route is published in words on the homepage or the pages it links to',
    buyerOnlyOffered: [...new Set(buyerOnly)].slice(0, 3),
  };
}

async function runProbe() {
  if (!CHROME) { console.error('No Chrome on this machine.'); process.exit(1); }
  const rows = JSON.parse(fs.readFileSync(DATA, 'utf8'));

  // Active first, and ranked by what the corpus already knows: a country with
  // no seller coverage gains more from an answer than one with several.
  const covered = {};
  for (const r of rows) if (r.sellerActionUrl) covered[r.country] = (covered[r.country] || 0) + 1;
  const score = (r) => {
    let s = 0;
    const c = covered[r.country] || 0;
    if (c === 0) s += 40; else if (c <= 2) s += 20;
    if (r.sellerTypes === 'business' || r.sellerTypes === 'both') s += 20;
    if (/browser check is needed/i.test(r.note || '')) s -= 50;
    return s;
  };
  let targets = rows
    .filter((r) => r.currentStatus === 'active' && (!r.sellerAction || r.sellerAction === 'unknown'))
    .map((r) => ({ r, s: score(r) }))
    .sort((a, b) => b.s - a.s || (a.r.id < b.r.id ? -1 : 1))
    .map((x) => x.r);

  const ids = arg('--ids');
  if (ids && ids !== true) {
    const want = new Set(String(ids).split(',').map((x) => x.trim()));
    targets = rows.filter((r) => want.has(r.id));
  }
  const limit = arg('--limit');
  if (limit) targets = targets.slice(0, Number(limit));

  console.log(`Marketplace seller actionability: ${targets.length} active record(s), ranked.`);
  const chrome = await startChrome();
  const findings = [];
  const queue = targets.slice();
  let done = 0;
  const worker = async () => {
    for (;;) {
      const record = queue.shift();
      if (!record) return;
      // eslint-disable-next-line no-await-in-loop
      const obs = await probe(chrome.wsUrl, record);
      const verdict = assess(record, obs);
      findings.push({
        id: record.id,
        name: record.name,
        website: record.website,
        country: record.country,
        marketplaceType: record.marketplaceType,
        observed: {
          status: obs.status, finalUrl: obs.url || null, title: obs.title || null,
          textLen: obs.textLen || 0,
        },
        ...verdict,
      });
      done += 1;
      if (done % 25 === 0) console.log(`  ${done}/${targets.length}`);
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

  const tally = {};
  for (const f of merged) tally[f.state] = (tally[f.state] || 0) + 1;
  console.log('\n', Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' '));
  const byAction = {};
  for (const f of merged.filter((x) => x.action)) byAction[f.action] = (byAction[f.action] || 0) + 1;
  console.log('actions:', JSON.stringify(byAction));
  console.log('Nothing merged — rerun with --apply.');
  try { fs.rmSync(chrome.profile, { recursive: true, force: true }); } catch { /* the OS reaps it */ }
}

function runApply() {
  const { probedAt, findings } = JSON.parse(fs.readFileSync(FINDINGS, 'utf8'));
  const rows = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const before = JSON.parse(JSON.stringify(rows));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const tally = {
    established: 0, unknownRecorded: 0, redirected: 0, protectedStill: 0, unresolved: 0, review: 0,
  };

  for (const f of findings) {
    const r = byId.get(f.id);
    if (!r) continue;

    if (f.state === 'ACTION_ESTABLISHED') {
      SAFE.applyPatch(r, {
        sellerAction: f.action,
        sellerActionUrl: f.route.href,
      }, { owner: 'actionability', collection: 'marketplaces' });
      tally.established += 1;
    } else if (f.state === 'ACTION_UNKNOWN') {
      // Absent sellerAction already means unknown, and WHY it is unknown lives
      // in the committed findings file beside this line. It does not go into
      // the record, because this collection prints its notes to readers in four
      // languages and "the site offers an account but never says that route is
      // for selling" is a note to the next researcher, not to a user.
      tally.unknownRecorded += 1;
    } else if (f.state === 'REDIRECTED') {
      tally.redirected += 1;
    } else if (f.state === 'ONTOLOGY_REVIEW') {
      // Recommended for review, never removed.
      tally.review += 1;
    } else if (f.state === 'UNKNOWN_PROTECTED') {
      tally.protectedStill += 1;
    } else {
      tally.unresolved += 1;
    }
  }

  SAFE.assertNoDeletion(before, rows);
  const drift = SAFE.diffFingerprints(SAFE.curatedFingerprint(before), SAFE.curatedFingerprint(rows));
  if (drift.length) throw new Error(`curated fields drifted on: ${drift.join(', ')}`);

  fs.writeFileSync(DATA, `${JSON.stringify(rows, null, 1)}\n`);
  console.log('Merged:', Object.entries(tally).map(([k, v]) => `${k}=${v}`).join(' '));
}

module.exports = { assess, SELLER_WORDING, BUYER_ACCOUNT };

if (require.main === module) {
  if (process.argv.includes('--apply')) runApply();
  else runProbe().catch((e) => { console.error(e); process.exit(1); });
}
