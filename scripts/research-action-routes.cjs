#!/usr/bin/env node
// scripts/research-action-routes.cjs
'use strict';

// Finding the page a business actually acts on, and what it costs there.
//
// ── WHY A HOMEPAGE IS NOT ENOUGH ────────────────────────────────────────────
//
// Every previous pass asked a homepage a question homepages do not answer. The
// tender pass read 383 front doors and established participation cost for 10 of
// them, because a procurement portal's homepage advertises notices, not fees —
// the fee lives on /suppliers, /registration, /pricing, two clicks in. The cost
// pass had the same shape: 1093 records read at the front door produced free
// delivery, free admission and a school-meals programme.
//
// So this one navigates. Stage 1 reads the front door and harvests its links.
// Stage 2 follows the few that the site's own wording says are about acting —
// "add your business", "become a seller", "supplier registration" — and reads
// those. Stage 3 opens a browser only where HTTP was refused. The evidence that
// decides anything always comes from the page the link led to.
//
// ── WHAT IS NEVER EVIDENCE ──────────────────────────────────────────────────
//
// A URL path. /business-listings/add-your-company is a string somebody chose,
// and this file will not read a fact out of it: the destination has to SAY what
// can be done there. Nor is a generic "Register", a login, a pricing page, a
// contact form, a page title on its own, or the domain name. Those are the
// shapes every earlier false positive took.
//
//   node scripts/research-action-routes.cjs --inventory
//   node scripts/research-action-routes.cjs --limit 400 --country germany
//   node scripts/research-action-routes.cjs --report
//   node scripts/research-action-routes.cjs --apply
//
// Nothing in the build, the validator or the test suite invokes the network
// paths of this file.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CK = require('./lib/rc-checkpoint.cjs');
const SAFE = require('./lib/rc-safe-apply.cjs');
const T = require('./lib/rc-text-match.cjs');
const S = require('./lib/bd-schema.cjs');
const MP = require('./lib/mp-schema.cjs');

const FINDINGS = path.join(ROOT, 'data/action-routes/.action-routes.json');

const TIMEOUT_MS = 12000;
const PACE_MS = 250;
const MAX_CANDIDATES = 4;
const EVIDENCE_CHARS = 4000;
const MIN_TEXT = 200;

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

// ── THE COLLECTIONS, AND WHAT "ACTING" MEANS IN EACH ────────────────────────

const COLLECTIONS = {
  directories: {
    file: path.join(ROOT, 'data/business-directories/opportunities.json'),
    urlField: 'website',
    routeField: 'submissionUrl',
    actionField: 'listingAction',
    vocabulary: S.LISTING_ACTIONS,
    unresolved: (r) => !r.submissionUrl && !r.claimUrl,
  },
  marketplaces: {
    file: path.join(ROOT, 'data/marketplaces/marketplaces.json'),
    urlField: 'website',
    routeField: 'sellerActionUrl',
    actionField: 'sellerAction',
    vocabulary: MP.SELLER_ACTIONS,
    unresolved: (r) => !r.sellerActionUrl,
  },
  media: {
    file: path.join(ROOT, 'data/media-pr-publishing/media-platforms.json'),
    urlField: 'website',
    routeField: 'submissionUrl',
    actionField: null,
    vocabulary: null,
    unresolved: (r) => !r.submissionUrl && !r.pitchUrl && !r.pressReleaseUrl && !r.advertisingUrl,
  },
  tenders: {
    file: path.join(ROOT, 'data/tenders-procurement/platforms.json'),
    urlField: 'officialUrl',
    routeField: 'supplierRegistrationUrl',
    actionField: null,
    vocabulary: null,
    // Tenders are here for their ACCESS facts, not for an action type.
    unresolved: (r) => r.bidAccess === undefined || r.supplierRegistrationUrl == null,
  },
};

// ── VOCABULARY, UNICODE-SAFE ────────────────────────────────────────────────
//
// Every phrase goes through rc-text-match, which refuses to compile an ASCII
// word boundary beside non-ASCII text — the defect that made every Cyrillic,
// Turkish and Polish pattern in an earlier phase match nothing at all while
// looking like a thorough vocabulary.

const LINK_WORDS = [
  // English
  'add your business', 'add a business', 'add business', 'add your company',
  'add company', 'submit your business', 'submit a listing', 'submit listing',
  'create a listing', 'create listing', 'claim your business', 'claim listing',
  'list your business', 'get listed', 'become a seller', 'sell on', 'start selling',
  'seller registration', 'seller centre', 'seller center', 'open a shop',
  'post an ad', 'post a classified', 'place an ad', 'advertise with us',
  'submit a press release', 'submit news', 'write for us', 'contribute an article',
  'submit an article', 'guest post', 'become a contributor', 'media kit',
  // Supplier wording only where it names REGISTERING as one. Bare "suppliers",
  // "fees" and "pricing" were here and matched anything: "Benzinpreise" —
  // petrol prices — contains "preise", so a German city portal's fuel-price
  // page became a candidate and then resolved as a business listing. A link
  // vocabulary loose enough to catch every pricing page is loose enough to
  // catch every page.
  'supplier registration', 'register as a supplier', 'become a supplier',
  'vendor registration',
  // German
  'firma eintragen', 'firmeneintrag', 'unternehmen eintragen', 'eintrag hinzufügen',
  'anzeige aufgeben', 'inserat aufgeben', 'verkäufer werden', 'lieferant',
  'lieferantenregistrierung',
  // Romance
  'añadir empresa', 'agregar empresa', 'publicar anuncio', 'vender en',
  'inscrire mon entreprise', 'déposer une annonce', 'devenir vendeur',
  'ajouter une entreprise', 'inserisci attività', 'aggiungi azienda',
  'pubblica annuncio', 'diventa venditore', 'adicionar empresa', 'anunciar',
  // Nordic / Baltic / Finnish
  'lisää yritys', 'ilmoita', 'legg til bedrift', 'annonsere', 'lägg till företag',
  // Indonesian / Malay
  'tambah bisnis', 'daftar penjual', 'pasang iklan', 'jual di', 'tambah perniagaan',
  // Indic / Thai
  'अपना व्यवसाय जोड़ें', 'ลงประกาศ', 'ลงโฆษณา',
  // Slavic / Turkish
  'dodaj firmę', 'dodaj ogłoszenie', 'přidat firmu', 'firma ekle', 'ilan ver',
  'добавить компанию', 'подать объявление',
];
const LINK_MATCH = T.stemMatcher(LINK_WORDS);

// What the DESTINATION must say. Deliberately narrower than the link vocabulary:
// a link may be called anything, but the page it leads to has to describe the
// act itself.
const CONFIRMS = {
  create: T.stemMatcher([
    'add your business', 'add your company', 'submit your business', 'create a listing',
    'create your listing', 'list your business', 'get your business listed',
    'add a new business', 'submit your company', 'register your business',
    'firma eintragen', 'firmeneintrag', 'unternehmen eintragen', 'eintragen sie ihre firma',
    'añadir empresa', 'agregar tu empresa', 'inscrire mon entreprise',
    'ajouter votre entreprise', 'inserisci la tua attività', 'aggiungi la tua azienda',
    'adicionar sua empresa', 'dodaj firmę', 'přidat firmu', 'firma ekle',
    'lisää yrityksesi', 'legg til bedriften', 'lägg till ditt företag',
    'tambah bisnis anda', 'добавить компанию',
  ]),
  claim: T.stemMatcher([
    'claim your business', 'claim your listing', 'claim this business',
    'claim your profile', 'is this your business', 'manage your listing',
    'eintrag übernehmen', 'reclama tu empresa', 'revendiquer votre',
  ]),
  'publish-classified': T.stemMatcher([
    'post an ad', 'post your ad', 'place an ad', 'publish your classified',
    'post a free ad', 'anzeige aufgeben', 'inserat aufgeben', 'publicar anuncio',
    'déposer une annonce', 'pubblica annuncio', 'dodaj ogłoszenie', 'ilan ver',
    'pasang iklan', 'подать объявление', 'ลงประกาศ',
  ]),
  'create-seller-profile': T.stemMatcher([
    'become a seller', 'start selling', 'seller registration', 'open your shop',
    'create a seller account', 'sell with us', 'seller centre', 'seller center',
    'verkäufer werden', 'devenir vendeur', 'diventa venditore', 'vender en',
    'daftar penjual', 'jual di',
  ]),
  'post-advertisement': T.stemMatcher([
    'advertise with us', 'advertising options', 'rate card', 'book advertising',
    'werben sie', 'anunciarse', 'annonser hos', 'annonsere hos',
  ]),
};

// Tender participation. The one distinction the corpus spent a phase
// establishing: searching notices is not bidding on them.
const BID_FREE = T.stemMatcher([
  'registration is free', 'free to register', 'no registration fee',
  'no fee to register', 'free for suppliers', 'no charge to suppliers',
  'free to submit', 'submission is free', 'no cost to participate',
  'participation is free', 'kostenlose registrierung', 'kostenlos registrieren',
  'inscription gratuite', 'registro gratuito', 'registrazione gratuita',
  'darmowa rejestracja', 'бесплатная регистрация', 'ücretsiz kayıt',
]);
const BID_PAID = T.stemMatcher([
  'registration fee of', 'annual subscription fee', 'supplier fee', 'supplier fees',
  'membership fee', 'participation fee', 'fee to submit a bid', 'access fee',
  'subscription required to bid', 'teilnahmegebühr', 'jahresgebühr',
  'cuota de suscripción', 'abonnement payant',
]);
// A buyer's condition on one contract, never the platform's price.
const OPPORTUNITY_LEVEL = T.stemMatcher([
  'bid bond', 'bid security', 'tender security', 'earnest money', 'document fee',
  'tender document fee', 'performance bond', 'wadium', 'caution provisoire',
]);

const CHALLENGE = T.patternMatcher([
  'attention required', 'just a moment', 'checking your browser',
  'verify (you are|you.re) human', 'access denied', 'unusual traffic', 'captcha',
]);
const PARKED = T.patternMatcher([
  'domain (is|may be) for sale', 'buy this domain', 'parked domain',
  'hugedomains', 'sedo.com', 'afternic', 'under construction',
]);

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : (process.argv[i + 1] || true);
};

// ── FETCH ───────────────────────────────────────────────────────────────────

async function get(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      signal: controller.signal,
    });
    const body = res.ok ? (await res.text()).slice(0, 400000) : '';
    return { ok: res.ok, status: res.status, finalUrl: res.url, body };
  } catch (e) {
    return { ok: false, status: 0, finalUrl: url, body: '', error: e.name === 'AbortError' ? 'timeout' : e.message };
  } finally {
    clearTimeout(timer);
  }
}

const strip = (html) => html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// Links, with the words a human would have clicked. The anchor TEXT is what is
// scored; the href is only where it goes.
function candidateLinks(html, base) {
  const out = [];
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi)) {
    const text = strip(m[2]);
    if (!text || text.length > 60) continue;
    if (!LINK_MATCH(text)) continue;
    let href;
    try { href = new URL(m[1], base).toString(); } catch { continue; }
    if (!/^https?:/.test(href)) continue;
    out.push({ href, text });
  }
  // One per destination, nearest the top of the page.
  const seen = new Set();
  return out.filter((l) => (seen.has(l.href) ? false : seen.add(l.href)))
    .slice(0, MAX_CANDIDATES);
}

// ── JUDGEMENT ───────────────────────────────────────────────────────────────

function judgeAction(collection, text) {
  if (!text || text.length < MIN_TEXT) return null;
  const order = collection === 'marketplaces'
    ? ['publish-classified', 'create-seller-profile', 'post-advertisement']
    : ['create', 'claim'];
  for (const action of order) {
    if (CONFIRMS[action] && CONFIRMS[action](text)) return action;
  }
  return null;
}

function judgeBid(text) {
  if (!text || text.length < MIN_TEXT) return null;
  const free = BID_FREE(text);
  const paid = BID_PAID(text);
  if (free && paid) return { bidAccess: undefined, why: 'the page states both a free and a paid participation route' };
  if (free) return { bidAccess: 'free', why: 'the operator states supplier participation costs nothing' };
  if (paid) return { bidAccess: 'paid', why: 'the operator states a fee for supplier participation' };
  if (OPPORTUNITY_LEVEL(text)) {
    return { bidAccess: undefined, why: 'only contract-level conditions stated, which are not platform access' };
  }
  return null;
}

// ── TARGETS ─────────────────────────────────────────────────────────────────

function targets() {
  const out = [];
  const wantCountry = arg('--country');
  const wantCollection = arg('--collection');
  for (const [name, C] of Object.entries(COLLECTIONS)) {
    if (wantCollection && wantCollection !== name) continue;
    for (const r of JSON.parse(fs.readFileSync(C.file, 'utf8'))) {
      if (r.currentStatus && r.currentStatus !== 'active') continue;
      if (!C.unresolved(r)) continue;
      const url = r[C.urlField];
      if (!url) continue;
      if (wantCountry && r.country !== wantCountry) continue;
      out.push({
        collection: name, id: r.id, country: r.country, url,
        key: `route|${CK.targetKey(name === 'tenders' ? 'tenders' : name, r)}`,
        domainRating: typeof r.domainRating === 'number' ? r.domainRating : null,
      });
    }
  }
  // Highest Domain Rating first — as a PRIORITY only. It orders the queue and
  // never touches a verdict: a DR 90 record with no route stays unresolved
  // exactly like a DR 3 one.
  out.sort((a, b) => (b.domainRating ?? -1) - (a.domainRating ?? -1) || (a.id < b.id ? -1 : 1));
  return out;
}

// ── ONE RECORD ──────────────────────────────────────────────────────────────

async function research(target) {
  const home = await get(target.url);
  const homeText = strip(home.body).slice(0, EVIDENCE_CHARS);

  if (!home.ok) {
    const why = home.error ? `transport: ${home.error}` : `http ${home.status}`;
    // A refusal is a fact about this request, never about the platform. 403 and
    // 429 are what a WAF says to a script, and DEAD is not what they mean.
    return { state: 'NEEDS_BROWSER', why, evidenceUrl: target.url };
  }
  if (PARKED(homeText)) return { state: 'PARKED', why: 'a parked or for-sale domain', evidenceUrl: home.finalUrl };
  if (CHALLENGE(homeText)) return { state: 'NEEDS_BROWSER', why: 'a bot challenge', evidenceUrl: home.finalUrl };

  const links = candidateLinks(home.body, home.finalUrl);
  const visited = [];

  for (const link of links) {
    // eslint-disable-next-line no-await-in-loop
    const page = await get(link.href);
    if (!page.ok) { visited.push({ href: link.href, status: page.status }); continue; }
    const text = strip(page.body).slice(0, EVIDENCE_CHARS);
    visited.push({ href: link.href, status: page.status });

    if (target.collection === 'tenders') {
      const bid = judgeBid(text);
      if (bid && bid.bidAccess) {
        return {
          state: 'RESOLVED', bidAccess: bid.bidAccess, why: bid.why,
          evidenceUrl: page.finalUrl, anchor: link.text, visited: visited.length,
        };
      }
      continue;
    }

    const action = judgeAction(target.collection, text);
    // The ANCHOR has to name the action too, not merely lead somewhere that
    // mentions it. A destination page can say "add your business" in a footer
    // that appears on every page of the site, so agreement between what the
    // reader clicked and what they arrived at is what makes this evidence
    // rather than coincidence.
    const anchorAgrees = action && CONFIRMS[action] && CONFIRMS[action](link.text);
    if (action && anchorAgrees) {
      return {
        state: 'RESOLVED', actionType: action, actionUrl: page.finalUrl,
        why: `the destination states the action in the operator's own words`,
        evidenceUrl: page.finalUrl, anchor: link.text, visited: visited.length,
      };
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { setTimeout(r, PACE_MS); });
  }

  return {
    state: 'UNRESOLVED',
    why: links.length
      ? `followed ${visited.length} candidate page(s); none stated the action`
      : 'the front door offered no link whose wording names an action',
    evidenceUrl: home.finalUrl,
    visited: visited.length,
  };
}

// ── RUN ─────────────────────────────────────────────────────────────────────

async function runProbe() {
  const ledger = new CK.Ledger(FINDINGS);
  if (ledger.recovered) {
    console.log(`Recovered ${ledger.recovered} finding(s) from an interrupted run's journal.`);
  }
  let list = targets();
  const already = list.filter((t) => ledger.has(t.key)).length;
  if (!process.argv.includes('--refresh')) list = list.filter((t) => !ledger.has(t.key));
  const limit = arg('--limit');
  if (limit) list = list.slice(0, Number(limit));

  console.log(`Action routes: ${list.length} record(s) to research `
    + `(${already} already answered, ${ledger.size()} finding(s) on disk).`);
  if (!list.length) { report(ledger.all()); return; }

  CK.onInterrupt(ledger, 'Action routes');
  let done = 0;
  for (const t of list) {
    // eslint-disable-next-line no-await-in-loop
    const verdict = await research(t);
    ledger.record({ ...t, researchedAt: new Date().toISOString().slice(0, 10), ...verdict });
    done += 1;
    if (done % 25 === 0) console.log(`  ${done}/${list.length}`);
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { setTimeout(r, PACE_MS); });
  }
  const kept = ledger.compact({ probedAt: new Date().toISOString().slice(0, 10) });
  console.log(`${kept} finding(s) on disk.`);
  report(ledger.all());
}

function report(findings) {
  const tally = {};
  for (const f of findings) tally[f.state] = (tally[f.state] || 0) + 1;
  console.log('\nACTION ROUTE LEDGER');
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(5)}  ${k}`);
  }
  const actions = {};
  for (const f of findings) if (f.actionType) actions[f.actionType] = (actions[f.actionType] || 0) + 1;
  if (Object.keys(actions).length) console.log('  actions:', JSON.stringify(actions));
  const bids = {};
  for (const f of findings) if (f.bidAccess) bids[f.bidAccess] = (bids[f.bidAccess] || 0) + 1;
  if (Object.keys(bids).length) console.log('  bidAccess:', JSON.stringify(bids));
}

// ── APPLY ───────────────────────────────────────────────────────────────────

function runApply() {
  const ledger = new CK.Ledger(FINDINGS);
  ledger.compact();
  const byKey = new Map();
  for (const f of ledger.all()) if (f.state === 'RESOLVED') byKey.set(`${f.collection}:${f.id}`, f);
  if (!byKey.size) { console.log('No resolved findings to apply.'); return; }

  const tally = { action: 0, bid: 0, unchanged: 0, skipped: 0 };
  for (const [name, C] of Object.entries(COLLECTIONS)) {
    const rows = JSON.parse(fs.readFileSync(C.file, 'utf8'));
    const before = JSON.parse(JSON.stringify(rows));
    let touched = false;

    for (const r of rows) {
      const f = byKey.get(`${name}:${r.id}`);
      if (!f) continue;

      if (name === 'tenders') {
        if (!f.bidAccess) { tally.skipped += 1; continue; }
        if (r.bidAccess === f.bidAccess) { tally.unchanged += 1; continue; }
        SAFE.applyPatch(r, { bidAccess: f.bidAccess }, { owner: 'cost', collection: 'tenders' });
        tally.bid += 1; touched = true;
        continue;
      }

      if (!f.actionType || !f.actionUrl) { tally.skipped += 1; continue; }
      // The vocabulary is the collection's own. A verdict outside it is a bug
      // in this file, not a new kind of action, and is refused rather than
      // widening the ontology by accident.
      if (C.vocabulary && !C.vocabulary.includes(f.actionType)) {
        throw new Error(`${r.id}: "${f.actionType}" is not in ${name}'s action vocabulary`);
      }
      const patch = {};
      patch[C.routeField] = f.actionUrl;
      if (C.actionField) patch[C.actionField] = f.actionType;
      const same = Object.entries(patch).every(([k, v]) => r[k] === v);
      if (same) { tally.unchanged += 1; continue; }
      SAFE.applyPatch(r, patch, { owner: 'actionability', collection: name });
      tally.action += 1; touched = true;
    }

    if (!touched) continue;
    SAFE.assertNoDeletion(before, rows);
    const drift = SAFE.diffFingerprints(SAFE.curatedFingerprint(before), SAFE.curatedFingerprint(rows));
    if (drift.length) throw new Error(`${name}: curated fields drifted on ${drift.join(', ')}`);
    fs.writeFileSync(C.file, `${JSON.stringify(rows, null, 1)}\n`);
  }
  console.log('Applied:', Object.entries(tally).map(([k, v]) => `${k}=${v}`).join(' '));
}

function runInventory() {
  const list = targets();
  const byCollection = {};
  const byCountry = {};
  for (const t of list) {
    byCollection[t.collection] = (byCollection[t.collection] || 0) + 1;
    byCountry[t.country] = (byCountry[t.country] || 0) + 1;
  }
  console.log('unresolved records:', list.length);
  console.log('by collection:', JSON.stringify(byCollection));
  const top = Object.entries(byCountry).sort((a, b) => b[1] - a[1]).slice(0, 12);
  console.log('densest markets:', top.map(([c, n]) => `${c}=${n}`).join(' '));
}

module.exports = {
  FINDINGS, COLLECTIONS, targets, judgeAction, judgeBid, candidateLinks,
  runApply, CONFIRMS, LINK_MATCH, BID_FREE, BID_PAID,
};

if (require.main === module) {
  if (process.argv.includes('--apply')) runApply();
  else if (process.argv.includes('--inventory')) runInventory();
  else if (process.argv.includes('--report')) report(new CK.Ledger(FINDINGS).all());
  else runProbe().catch((e) => { console.error(e.message); process.exit(1); });
}
