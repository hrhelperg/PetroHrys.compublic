#!/usr/bin/env node
// scripts/research-link-value.cjs
'use strict';

// What a listing here actually links like.
//
// ── WHY THIS IS ITS OWN DIMENSION ───────────────────────────────────────────
//
// A source can be high Domain Rating, free, and READY, and still hand a
// business a link that carries rel="nofollow" — or no external anchor at all.
// Those are unrelated facts about unrelated things: DR measures the domain's
// own backlink profile, cost measures what the submission costs, actionability
// measures whether there is a route. None of the three has ever been evidence
// about the anchor a listing eventually renders, and the field ownership
// contract refuses to let any of them write here.
//
// ── WHAT COUNTS AS EVIDENCE ─────────────────────────────────────────────────
//
// One thing only: an anchor, on a public listing page, read out of the rendered
// DOM. Not the platform's documentation, not a support article, not the shape
// of the URL. Directories change this behaviour quietly and their help pages
// lag by years.
//
// Two distinctions the web makes that a boolean cannot:
//
//   A wrapper such as /out?url=https://example.com is not an external anchor.
//   A crawler following it sees a link to the DIRECTORY, and what happens next
//   depends on that directory's redirect and robots rules. Recorded as
//   internal-redirect, never as a direct link that happens to end up there.
//
//   A follow link on a noindex listing page is a different proposition from one
//   on an indexable page. Both are recorded; neither is scored here.
//
// And one distinction that matters more than it looks: an anchor we read which
// carries no rel attribute IS a follow link — that is what the absence of rel
// means on the web. An anchor we could NOT read is not. The difference between
// "observed, no rel present" and "never observed" is the difference between a
// fact and a guess, so nothing is classified unless the attribute was actually
// inspected.
//
// No listing is ever created or submitted. Only listings that already exist are
// read.
//
//   node scripts/research-link-value.cjs --inventory
//   node scripts/research-link-value.cjs --limit 50
//   node scripts/research-link-value.cjs --report
//   node scripts/research-link-value.cjs --apply
//
// Nothing in the build, the validator or the test suite invokes this file.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CK = require('./lib/rc-checkpoint.cjs');
const SAFE = require('./lib/rc-safe-apply.cjs');
const S = require('./lib/bd-schema.cjs');
const REFUSAL = require('./lib/rc-refusal.cjs');
const { launch, openPage, chromePath } = require('./tests/helpers/cdp.cjs');

const FINDINGS = path.join(ROOT, 'data/link-value/.link-value.json');
const OWNER = 'linkvalue';

const CONCURRENCY = 3;
const NAV_TIMEOUT_MS = 18000;
const SETTLE_FLOOR_MS = 1200;
const SETTLE_TIMEOUT_MS = 10000;
const RECORD_BUDGET_MS = 70000;
const MAX_LISTINGS = 3;

const COLLECTIONS = {
  directories: {
    file: path.join(ROOT, 'data/business-directories/opportunities.json'),
    urlField: 'website',
  },
  marketplaces: {
    file: path.join(ROOT, 'data/marketplaces/marketplaces.json'),
    urlField: 'website',
  },
  media: {
    file: path.join(ROOT, 'data/media-pr-publishing/media-platforms.json'),
    urlField: 'website',
  },
  // Tender platforms are deliberately absent. A procurement portal publishes
  // notices and supplier registrations, not a public business profile carrying
  // the supplier's website — so the question this file asks has no answer
  // there, and forcing the field onto them would manufacture UNKNOWNs about a
  // concept that does not apply. If a portal is later found to publish crawlable
  // supplier profiles, it belongs here with evidence, not by assumption.
};

// Hosts a listing links to that are never the business's own website.
const NOT_A_BUSINESS_SITE = /^(www\.)?(facebook|instagram|twitter|x|linkedin|youtube|tiktok|pinterest|wa\.me|whatsapp|t\.me|telegram|google|goo\.gl|maps\.google|apple|itunes|play\.google|doubleclick|googlesyndication|googletagmanager|gstatic|cloudflare|jsdelivr|gravatar|wikipedia|paypal|stripe)\./i;

// A same-host href that carries the destination in a parameter, or announces
// itself as a hop. This is the /out?url= shape and everything like it.
const REDIRECT_PATH = /\/(out|goto|go|redirect|redir|link|visit|away|exit|track|click|ref)(\/|\?|$)/i;
const REDIRECT_PARAM = /[?&](url|u|to|target|dest|destination|link|goto|redirect|r)=/i;

// A page that shows ONE business. The first version also accepted "any deep
// URL ending in four or more digits", which is how Google Play's
// /store/apps/eventdetails/4828997282539043473 and Apple's
// /iphone/editorial/6753950852 became "business listings". A named path
// segment is required, and a numeric tail only counts alongside one.
const LISTING_PATH = /\/(company|companies|business|businesses|listing|listings|profile|firma|firmen|unternehmen|empresa|empresas|entreprise|entreprises|azienda|aziende|bedrijf|firm|place|branch|shop-detail|detail|details)\//i;
const LISTING_TAIL = /[-_/]\d{4,}(\.html?)?\/?$/i;

// Pages that are emphatically not a business listing, however deep their URL.
// Pages that are emphatically not a business listing, however deep their URL.
// Everything after "about" was added because a first pass recorded Apple's
// support guide, HubSpot's contact page, Microsoft's contact-us page,
// Zendesk's startups page, Facebook's page-creation form and three Amazon
// product pages as business listings — all of which carry the contact words
// that were supposed to identify a profile, because contact pages do.
const NOT_A_LISTING = /\/(login|signin|sign-in|register|account|auth|oauth|sso|blog|news|help|support|guide|editorial|grouping|eventdetails|privacy|terms|about|hc|articles?|contact|contact-us|creation|get-started|startups|security|pricing|docs|developer|dp|gp|product|item|category|categories|kategorie|legal|cookie|cookie-policy|policy|policies|imprint|impressum)(\/|\?|#|-|_|$)/i;

// A listing shows contact details. Without at least one of these the page is
// something else that happens to sit at a plausible address.
const PROFILE_SIGNAL = /(address|adresse|dirección|indirizzo|endereço|adres|telephone|tel\.|phone|teléfono|téléphone|telefon|opening hours|öffnungszeiten|horario|contact details|kontakt)/i;
const PROFILE_SIGNAL_ALL = new RegExp(PROFILE_SIGNAL.source, 'gi');

// What a directory calls the link to the business's own site.
const WEBSITE_LABEL = /^(website|web site|visit website|visit site|visit web ?site|go to website|official website|homepage|home page|site web|site internet|voir le site|webseite|zur website|website besuchen|sitio web|visitar sitio|página web|sito web|visita il sito|strona internetowa|odwiedź stronę|website bezoeken|hemsida|nettsted|verkkosivut|веб-сайт|сайт|web sitesi)$/i;

// A page that lists many businesses: a category, a city, a search result.
const INDEX_PATH = /\/(category|categories|kategorie|kategorien|rubrique|categoria|categorias|branchen|verzeichnis|directory|search|suche|buscar|recherche|find|browse|city|stadt|ciudad|ville|a-z|listings?)(\/|\?|$)/i;

// A listing that no longer exists is not evidence about listings that do.
const GONE = /(page not found|not available|404|no longer available|seite nicht gefunden|página no encontrada)/i;

const LOGIN_WALL = ['sign in to view', 'log in to view', 'login required',
  'members only', 'please sign in', 'please log in', 'create an account to see'];

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : (process.argv[i + 1] || true);
};

const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return null; } };
// Listing shape is a property of the PATH. Cylex prints every listing link on
// its homepage with a "#Special-Offer" fragment appended, and a tail pattern
// anchored to end-of-string matched none of them.
// The PATH only. Including the query string let OLX's
// /dla-dzieci/artykuly-szkolne/plecaki-szkolne/?utm_campaign=plecakiszkolne2026
// satisfy a "ends in four or more digits" test on its tracking parameter.
const pathOf = (u) => { try { return new URL(u).pathname; } catch { return String(u).split('?')[0].split('#')[0]; } };
const family = (h) => (h ? h.split('.').slice(-2).join('.') : null);
const sameFamily = (a, b) => family(hostOf(a)) === family(hostOf(b));
// "olx" out of olx.pl and olx.bg; "abebooks" out of abebooks.com and
// abebooks.co.uk. Same brand, different country — one company, not a backlink.
const brandToken = (u) => {
  const h = hostOf(u);
  if (!h) return null;
  const parts = h.split('.');
  const known = new Set(['co', 'com', 'org', 'net', 'gov', 'ac']);
  let i = parts.length - 2;
  if (i > 0 && known.has(parts[i])) i -= 1;
  return parts[i] || null;
};

// Subdomains that are the platform talking, not the platform listing. Mappy's
// privacy notice sits at blog.mappy.com, and "blog" in a HOST is invisible to a
// pattern that only reads the path.
const NOT_A_LISTING_HOST = /^(blog|news|support|help|docs|developer|developers|api|status|rulechannel|hi|info|corporate|about|investor|investors|press)\./i;

// ── SETTLING ────────────────────────────────────────────────────────────────

async function settle(page) {
  let previous = null;
  let stable = 0;
  const started = Date.now();
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const now = await page.eval(() => ({
      links: document.querySelectorAll('a[href]').length,
      len: (document.body ? document.body.innerText || '' : '').length,
    })).catch(() => null);
    if (!now) return false;
    const shape = `${now.links}:${now.len}`;
    stable = shape === previous ? stable + 1 : 0;
    previous = shape;
    if (stable >= 2 && now.len > 0 && Date.now() - started >= SETTLE_FLOOR_MS) return true;
    if (Date.now() - started > SETTLE_TIMEOUT_MS) return now.len > 0;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { setTimeout(r, 350); });
  }
}

// ── READING A PAGE ──────────────────────────────────────────────────────────
//
// Anchors come out of the DOM with their rel attribute as the browser resolved
// it, which is the only place this fact exists. `relRead` records that we got
// as far as looking — a page we could not inspect must not produce a link type.

async function readAnchors(page) {
  return page.eval(() => {
    const anchors = [];
    for (const a of document.querySelectorAll('a[href]')) {
      const href = a.href;
      if (!/^https?:/i.test(href)) continue;
      anchors.push({
        href,
        raw: a.getAttribute('href') || '',
        // An absent rel attribute and rel="" both mean an ordinary follow link.
        // "We never looked" means nothing at all, and the two must never
        // collapse — so the fact that we looked is recorded explicitly rather
        // than implied by the empty string.
        rel: (a.getAttribute('rel') || '').toLowerCase().trim(),
        relRead: true,
        // Where the anchor SITS. A country switcher, a partner strip and a
        // corporate "Homepage" link all live in the furniture, and every one of
        // them was read as a business's website: olx.bg on an OLX page,
        // abebooks.co.uk on an AbeBooks page, mobile.de on Kleinanzeigen,
        // superlawyers.com on FindLaw, dpa.com on Presseportal.
        chrome: Boolean(a.closest('footer, nav, header, [class*="footer"], [class*="nav"], [id*="footer"], [id*="nav"]')),
        text: (a.innerText || a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
      });
    }
    const meta = [...document.querySelectorAll('meta[name="robots"], meta[name="googlebot"]')]
      .map((m) => (m.getAttribute('content') || '').toLowerCase()).join(',');
    const canonical = (document.querySelector('link[rel="canonical"]') || {}).href || '';
    return {
      url: location.href,
      title: document.title || '',
      text: (document.body ? document.body.innerText || '' : '').replace(/\s+/g, ' ').slice(0, 3000),
      anchors,
      metaRobots: meta,
      canonical,
      // Buttons are counted but never treated as links: a control that renders
      // no anchor is not something a crawler can follow.
      buttonCount: document.querySelectorAll('button, [role="button"]').length,
    };
  }).catch(() => null);
}

// ── CLASSIFYING ONE ANCHOR ──────────────────────────────────────────────────

function classifyRel(rel) {
  // rel is case-insensitive in HTML, and rel="NOFOLLOW" is valid. This
  // lowercases for itself rather than trusting the caller to have done it:
  // relying on that made an uppercase nofollow classify as an ordinary follow
  // link, which is the one error this dimension may never make.
  const tokens = String(rel).split(/[\s,]+/).filter(Boolean);
  const lower = tokens.map((t) => t.toLowerCase());
  // Order matters only for reporting a single value; all tokens are preserved
  // in provenance so a multi-token rel is never flattened away.
  if (lower.includes('sponsored')) return { type: 'sponsored', tokens };
  if (lower.includes('ugc')) return { type: 'ugc', tokens };
  if (lower.includes('nofollow')) return { type: 'nofollow', tokens };
  return { type: 'dofollow', tokens };
}

function targetTypeOf(anchor, listingUrl) {
  const raw = anchor.raw || anchor.href;
  if (sameFamily(anchor.href, listingUrl)) {
    if (REDIRECT_PARAM.test(anchor.href) || REDIRECT_PATH.test(anchor.href)) return 'internal-redirect';
    return null; // an internal link that is not a hop is not the business's site
  }
  if (/^javascript:/i.test(raw)) return 'javascript-redirect';
  return 'direct';
}

// The business's own website among everything else a listing links to.
function pickWebsiteAnchor(pageData, listingUrl) {
  const candidates = [];
  for (const a of pageData.anchors) {
    const host = hostOf(a.href);
    if (!host || NOT_A_BUSINESS_SITE.test(`${host}.`)) continue;
    if (a.chrome) continue;
    const target = targetTypeOf(a, listingUrl);
    if (!target) continue;
    // A platform's other domains are not a business's website. Sharing the
    // brand token is the cheap half of this; the DOM position above is the half
    // that catches siblings under a different name.
    if (brandToken(a.href) && brandToken(a.href) === brandToken(listingUrl)) continue;
    const label = a.text.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');
    let score = 0;
    // The operator says it is the business's website. This is the only strong
    // signal, and the first version did without it: a fuzzy "label starts with
    // the host's first word" rule matched "Developers" beside
    // developer.android.com and "Investors" beside investor.pinterestinc.com,
    // so four platform footers were recorded as business website links.
    if (WEBSITE_LABEL.test(label)) score += 5;
    // The bare-domain path is deliberately gone. Measured over 21 resolutions:
    // an explicitly LABELLED anchor was right 4 times out of 4, and a label
    // that was merely the domain was right 9 times out of 16 — mercadopago.cl
    // off a MercadoLibre help page, sec.gov off an Autodesk investor page,
    // croisieres.com off a Petit Futé article, mobile.de off a Kleinanzeigen
    // ad. A coin flip cannot meet a zero-false-positive requirement, and the
    // recall it buys is not worth what it costs.
    if (score === 0) continue;
    if (target === 'direct') score += 1;
    candidates.push({ ...a, target, score });
  }
  candidates.sort((x, y) => y.score - x.score);
  return candidates[0] || null;
}

function indexabilityOf(pageData) {
  const robots = pageData.metaRobots || '';
  // `content="none"` is shorthand for noindex,nofollow. Checking only for the
  // word "noindex" reported such a page as indexable, which is the one
  // direction this field must never be wrong in.
  if (/\bnoindex\b/.test(robots) || /(^|[,\s])none([,\s]|$)/.test(robots)) return 'noindex';
  const text = String(pageData.text || '').toLowerCase();
  if (LOGIN_WALL.some((p) => text.includes(p))) return 'login-required';
  return 'indexable';
}

// ── ONE RECORD ──────────────────────────────────────────────────────────────

async function researchOne(page, target) {
  const started = Date.now();

  const open = async (url) => {
    try {
      await Promise.race([
        page.goto(url),
        new Promise((_, reject) => { setTimeout(() => reject(new Error('navigation timeout')), NAV_TIMEOUT_MS); }),
      ]);
      await settle(page);
      return await readAnchors(page);
    } catch (e) { return { error: e.message }; }
  };

  const home = await open(target.url);
  if (!home || home.error) {
    return { state: 'UNREADABLE', why: `browser: ${(home && home.error) || 'no response'}` };
  }
  if (REFUSAL.isRefusal(`${home.title}\n${home.text}`) || home.anchors.length < 5) {
    return { state: 'PROTECTED', why: 'the front page refused a browser or rendered nothing' };
  }

  // A page showing ONE business, found among the directory's own links. Never
  // created — only an existing listing is read.
  const listingLinks = home.anchors
    .filter((a) => sameFamily(a.href, target.url))
    // Discovery is loose and proof is strict, which is the same division this
    // corpus uses for action routes. Cylex publishes its listings at
    // /{city}/{business-name}-6757116.html with no named segment at all, so
    // requiring one found nothing; what keeps Google Play's
    // /store/apps/eventdetails/4828997282539043473 out is the page having to
    // carry contact details and the anchor having to be LABELLED a website.
    .filter((a) => (LISTING_PATH.test(pathOf(a.href)) || LISTING_TAIL.test(pathOf(a.href)))
      && !NOT_A_LISTING.test(pathOf(a.href))
      && !NOT_A_LISTING_HOST.test(hostOf(a.href) || ''))
    .map((a) => a.href);
  const seen = new Set();
  const listings = listingLinks.filter((u) => !seen.has(u) && seen.add(u)).slice(0, MAX_LISTINGS);


  // Yell and 11880 put no listing link on their front page at all — they are
  // search-first, and the only way in is through a category or city index. One
  // hop, then look again.
  if (!listings.length) {
    const index = home.anchors
      .filter((a) => sameFamily(a.href, target.url))
      .filter((a) => INDEX_PATH.test(pathOf(a.href)) && !NOT_A_LISTING.test(pathOf(a.href)))
      .slice(0, 2);
    for (const a of index) {
      if (Date.now() - started > RECORD_BUDGET_MS) break;
      // eslint-disable-next-line no-await-in-loop
      const page2 = await open(a.href);
      if (!page2 || page2.error || !page2.anchors) continue;
      for (const b of page2.anchors) {
        if (!sameFamily(b.href, target.url)) continue;
        if (!(LISTING_PATH.test(pathOf(b.href)) || LISTING_TAIL.test(pathOf(b.href)))) continue;
        if (NOT_A_LISTING.test(pathOf(b.href))) continue;
        if (!seen.has(b.href)) { seen.add(b.href); listings.push(b.href); }
        if (listings.length >= MAX_LISTINGS) break;
      }
      if (listings.length) break;
    }
  }

  if (!listings.length) {
    return { state: 'NO_LISTING_FOUND', why: 'no public business listing was reachable from the front page' };
  }

  const inspected = [];
  for (const listingUrl of listings) {
    if (Date.now() - started > RECORD_BUDGET_MS) break;
    // eslint-disable-next-line no-await-in-loop
    const listing = await open(listingUrl);
    if (!listing || listing.error || !listing.anchors) continue;
    if (REFUSAL.isRefusal(`${listing.title}\n${listing.text}`)) continue;
    if (GONE.test(listing.title) || GONE.test(listing.text.slice(0, 200))) continue;

    const indexability = indexabilityOf(listing);
    const anchor = pickWebsiteAnchor(listing, listing.url);
    if (!anchor) {
      // Recording "this platform's listings carry no website link" is a claim
      // about the platform, so the page has to be a business profile before it
      // may be made. A labelled website anchor proves itself; its ABSENCE
      // proves nothing unless we know we were looking at the right kind of
      // page. Requiring contact details for the positive case blocked Cylex,
      // whose listing carries <a rel="" href="...">Webseite</a> and puts the
      // address further down the page than the text sample reaches.
      // Two independent contact signals, not one: a single "contact" appears
      // on every corporate page in existence, which is exactly how a handful
      // of vendors' own contact pages were recorded as listings that carry no
      // website link.
      const signals = new Set((listing.text.match(PROFILE_SIGNAL_ALL) || [])
        .map((m) => m.toLowerCase()));
      if (signals.size < 2) continue;
      inspected.push({
        listingUrl: listing.url,
        backlinkType: 'none',
        indexability,
        // Kept so "there is a button but no anchor" stays distinguishable from
        // "there is nothing here at all".
        buttonCount: listing.buttonCount,
      });
      continue;
    }
    if (!anchor.relRead) {
      // Reached only if an anchor arrived from somewhere that did not inspect
      // the DOM. No link type may be derived from it.
      inspected.push({ listingUrl: listing.url, indexability, unread: true });
      continue;
    }
    const { type, tokens } = classifyRel(anchor.rel);
    inspected.push({
      listingUrl: listing.url,
      backlinkType: anchor.target === 'direct' ? type : type,
      linkTargetType: anchor.target,
      externalUrl: anchor.href,
      relTokens: tokens,
      anchorText: anchor.text,
      indexability,
    });
  }

  if (!inspected.length) {
    return { state: 'UNREADABLE', why: 'the listing pages could not be read' };
  }

  // Two templates that disagree are not one fact. "mixed" is the honest answer
  // and it carries both observations.
  const usable = inspected.filter((i) => i.backlinkType);
  if (!usable.length) {
    return { state: 'UNREADABLE', why: 'a website link was found but its rel attribute could not be read' };
  }
  const types = [...new Set(usable.map((i) => i.backlinkType))];
  if (types.length > 1) {
    return {
      state: 'RESOLVED',
      backlinkType: 'mixed',
      linkTargetType: usable[0].linkTargetType || null,
      listingIndexability: usable[0].indexability,
      why: `two listings differ: ${types.join(' and ')}`,
      templates: inspected,
    };
  }

  const one = usable[0];
  return {
    state: 'RESOLVED',
    backlinkType: one.backlinkType,
    linkTargetType: one.linkTargetType || null,
    listingIndexability: one.indexability,
    why: one.backlinkType === 'none'
      ? 'the public listing renders no external website link'
      : `the listing's website anchor carries rel=${JSON.stringify(one.relTokens.join(' '))}`,
    templates: inspected,
  };
}

// ── TARGETS ─────────────────────────────────────────────────────────────────

function targets() {
  const wanted = arg('--collection');
  const out = [];
  for (const [name, C] of Object.entries(COLLECTIONS)) {
    if (wanted && wanted !== name) continue;
    const rows = JSON.parse(fs.readFileSync(C.file, 'utf8'));
    for (const r of rows) {
      if (r.currentStatus && r.currentStatus !== 'active') continue;
      if (r.backlinkType) continue;
      const url = r[C.urlField];
      if (!url) continue;
      out.push({
        collection: name, id: r.id, country: r.country, url,
        domainRating: r.domainRating ?? null,
        // Whether this source has a known route. Used ONLY to decide what to
        // research first: a source somebody can actually publish on is where
        // knowing the link type changes a decision. It is not evidence, and
        // the ownership contract will not let it become any.
        actionable: Boolean(r.submissionUrl || r.claimUrl || r.sellerActionUrl
          || r.pressReleaseUrl || r.pitchUrl || r.advertisingUrl),
        key: `link|${name}|${r.id}`,
      });
    }
  }
  const country = arg('--country');
  const DENSE = new Set(['united-states', 'germany', 'united-kingdom', 'india', 'france',
    'japan', 'brazil', 'canada', 'spain', 'italy', 'netherlands', 'poland', 'australia']);
  const actionableOnly = process.argv.includes('--actionable');
  return out
    .filter((t) => !country || t.country === country)
    .filter((t) => !actionableOnly || t.actionable)
    // Research ORDER, and nothing more. A source somebody can publish on, in a
    // market with many of them, is where the answer changes a decision — so
    // that is where the browser goes first. None of these three is evidence
    // about the anchor, and the field ownership contract refuses to let any of
    // them write here.
    .sort((a, b) => (Number(b.actionable) - Number(a.actionable))
      || (Number(DENSE.has(b.country)) - Number(DENSE.has(a.country)))
      || ((b.domainRating ?? -1) - (a.domainRating ?? -1))
      || (a.id < b.id ? -1 : 1));
}

// ── RUN ─────────────────────────────────────────────────────────────────────

async function runProbe() {
  if (!chromePath()) { console.error('No Chrome on this machine.'); process.exit(1); }
  fs.mkdirSync(path.dirname(FINDINGS), { recursive: true });
  const ledger = new CK.Ledger(FINDINGS);
  if (ledger.recovered) console.log(`Recovered ${ledger.recovered} finding(s) from an interrupted run.`);

  let list = targets();
  const already = list.filter((t) => ledger.has(t.key)).length;
  if (!process.argv.includes('--refresh')) list = list.filter((t) => !ledger.has(t.key));
  const limit = arg('--limit');
  if (limit) list = list.slice(0, Number(limit));

  console.log(`Link value: ${list.length} source(s) to inspect (${already} already answered, ${ledger.size()} on disk).`);
  if (!list.length) { report(ledger.all()); return; }

  CK.onInterrupt(ledger, 'Link value');
  const chrome = await launch({ headless: false });
  if (!chrome) { console.error('Chrome did not start.'); process.exit(1); }

  const queue = list.slice();
  let done = 0;
  const started = Date.now();

  const worker = async () => {
    let page = await openPage(chrome.wsUrl);
    for (;;) {
      const target = queue.shift();
      if (!target) break;
      let verdict;
      try {
        // eslint-disable-next-line no-await-in-loop
        verdict = await researchOne(page, target);
      } catch (e) {
        verdict = { state: 'UNREADABLE', why: `browser worker: ${e.message}` };
        try { await page.close(); } catch { /* gone */ }
        // eslint-disable-next-line no-await-in-loop
        page = await openPage(chrome.wsUrl);
      }
      ledger.record({ ...target, observedAt: new Date().toISOString().slice(0, 10), ...verdict });
      done += 1;
      if (done % 10 === 0) {
        console.log(`  ${done}/${list.length}  (~${Math.round(done / ((Date.now() - started) / 3600000))}/hour)`);
      }
    }
    try { await page.close(); } catch { /* gone */ }
  };

  try {
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  } finally {
    const kept = ledger.compact({ probedAt: new Date().toISOString().slice(0, 10) });
    try { chrome.proc.kill('SIGKILL'); } catch { /* gone */ }
    try { fs.rmSync(chrome.profile, { recursive: true, force: true }); } catch { /* reaped */ }
    console.log(`${kept} finding(s) on disk.`);
  }
  report(ledger.all());
}

function report(findings) {
  const state = {};
  for (const f of findings) state[f.state] = (state[f.state] || 0) + 1;
  console.log('\nLINK VALUE LEDGER');
  for (const [k, v] of Object.entries(state).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(5)}  ${k}`);
  }
  const tally = (field) => {
    const o = {};
    for (const f of findings) if (f[field]) o[f[field]] = (o[f[field]] || 0) + 1;
    return JSON.stringify(o);
  };
  console.log('  backlinkType:      ', tally('backlinkType'));
  console.log('  linkTargetType:    ', tally('linkTargetType'));
  console.log('  listingIndexability:', tally('listingIndexability'));
}

// ── APPLY ───────────────────────────────────────────────────────────────────

function runApply() {
  const ledger = new CK.Ledger(FINDINGS);
  const resolved = ledger.all().filter((f) => f.state === 'RESOLVED' && f.backlinkType);
  ledger.close();
  if (!resolved.length) { console.log('No resolved link-value findings to apply.'); return; }

  const byKey = new Map();
  for (const f of resolved) byKey.set(`${f.collection}:${f.id}`, f);

  const tally = { written: 0, unchanged: 0, refused: 0 };
  for (const [name, C] of Object.entries(COLLECTIONS)) {
    const rows = JSON.parse(fs.readFileSync(C.file, 'utf8'));
    const before = JSON.stringify(rows);
    for (const r of rows) {
      const f = byKey.get(`${name}:${r.id}`);
      if (!f) continue;
      const first = (f.templates || [])[0] || {};
      const patch = {
        backlinkType: f.backlinkType,
        linkTargetType: f.linkTargetType || undefined,
        listingIndexability: f.listingIndexability || undefined,
        backlinkProvenance: {
          listingUrl: first.listingUrl,
          externalUrl: first.externalUrl,
          relTokens: first.relTokens || [],
          observedAt: f.observedAt,
          ...(f.backlinkType === 'mixed'
            ? { templates: (f.templates || []).map((t) => ({ listingUrl: t.listingUrl, backlinkType: t.backlinkType })) }
            : {}),
        },
      };
      // Validated against the schema BEFORE it is written, so a finding that
      // cannot justify itself never reaches the corpus.
      const problems = S.backlinkProblems({ ...r, ...patch });
      if (problems.length) {
        tally.refused += 1;
        console.log(`  refused ${r.id}: ${problems[0][0]} ${problems[0][1]}`);
        continue;
      }
      const same = r.backlinkType === patch.backlinkType
        && r.linkTargetType === patch.linkTargetType
        && JSON.stringify(r.backlinkProvenance) === JSON.stringify(patch.backlinkProvenance);
      if (same) { tally.unchanged += 1; continue; }
      SAFE.applyPatch(r, patch, { owner: OWNER, collection: name });
      tally.written += 1;
    }
    // Indent 1, which is what these files are stored with. Writing indent 2
    // reformats all eight thousand lines and buries the two that changed — a
    // retraction script in this phase did exactly that and the diff was 8118
    // insertions for six real edits.
    if (before !== JSON.stringify(rows)) fs.writeFileSync(C.file, `${JSON.stringify(rows, null, 1)}\n`);
  }
  console.log(`Link value applied: written=${tally.written} unchanged=${tally.unchanged} refused=${tally.refused}`);
}

function runInventory() {
  const list = targets();
  const byCollection = {};
  for (const t of list) byCollection[t.collection] = (byCollection[t.collection] || 0) + 1;
  console.log('sources with no link-value evidence:', list.length, JSON.stringify(byCollection));
}

module.exports = {
  FINDINGS, targets, researchOne, runApply, classifyRel, targetTypeOf,
  pickWebsiteAnchor, indexabilityOf, settle, REDIRECT_PARAM, REDIRECT_PATH,
  NOT_A_LISTING, LISTING_PATH, LISTING_TAIL, WEBSITE_LABEL,
};

if (require.main === module) {
  if (process.argv.includes('--apply')) runApply();
  else if (process.argv.includes('--inventory')) runInventory();
  else if (process.argv.includes('--report')) report(new CK.Ledger(FINDINGS).all());
  else runProbe().catch((e) => { console.error(e.message); process.exit(1); });
}
