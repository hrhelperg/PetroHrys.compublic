#!/usr/bin/env node
// scripts/research-browser-evidence.cjs
'use strict';

// Reading the pages that refused a script.
//
// ── WHAT THIS IS FOR ────────────────────────────────────────────────────────
//
// The HTTP pass reached 2115 records and resolved 20. Not because the evidence
// was absent — because it was unreachable: 278 records answered a plain 403,
// and 1729 more served a shell whose navigation is assembled by JavaScript, so
// a fetch saw a page with no links on it. Both are the same finding stated two
// ways: a script cannot see this site, and a browser can.
//
// So this opens a real Chrome, waits for the page to settle, and reads the
// links a person would actually see. Nothing about the judgement changes — the
// vocabulary, the anchor/destination agreement and the refusals are imported
// from the HTTP researcher rather than restated, because two matchers drift and
// the second one is always the looser.
//
// ── WHAT IT WILL NOT DO ─────────────────────────────────────────────────────
//
// It does not solve challenges, defeat access controls, rotate identities or
// pretend to be a browser it is not. It opens the site the way a person would
// and reads what is there. A site that still refuses is recorded as protected
// and left alone — an honest UNKNOWN, which is the correct answer and not a
// failure of the run.
//
//   node scripts/research-browser-evidence.cjs --inventory
//   node scripts/research-browser-evidence.cjs --limit 100
//   node scripts/research-browser-evidence.cjs --report
//   node scripts/research-browser-evidence.cjs --apply
//
// Nothing in the build, the validator or the test suite invokes this file.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CK = require('./lib/rc-checkpoint.cjs');
const SAFE = require('./lib/rc-safe-apply.cjs');
const T = require('./lib/rc-text-match.cjs');
const REFUSAL = require('./lib/rc-refusal.cjs');
const AR = require('./research-action-routes.cjs');
const { launch, openPage, chromePath } = require('./tests/helpers/cdp.cjs');

const FINDINGS = path.join(ROOT, 'data/action-routes/.browser-evidence.json');
const SOURCE_LEDGER = path.join(ROOT, 'data/action-routes/.action-routes.json');

// ── BOUNDS ──────────────────────────────────────────────────────────────────
//
// Chosen to keep a long run finishing rather than to squeeze the last record.
// A site that needs more than a minute of a browser's attention is a site whose
// evidence this pass is not going to get, and spending three minutes on it
// costs the six records behind it in the queue.
const CONCURRENCY = 3;
const NAV_TIMEOUT_MS = 18000;
const SETTLE_TIMEOUT_MS = 10000;
const SETTLE_FLOOR_MS = 1200;
const RECORD_BUDGET_MS = 55000;
const MAX_FOLLOW = 3;
const EVIDENCE_CHARS = 4000;
const MIN_TEXT = 200;
const MIN_LINKS = 5;
// Below this a followed page is chrome, not content.
const PARTIAL_TEXT = 2000;

const CHALLENGE = REFUSAL.isRefusal;
const PARKED = REFUSAL.isParked;

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : (process.argv[i + 1] || true);
};

const deadlineExceeded = (started) => Date.now() - started > RECORD_BUDGET_MS;

// fr.example.com is example.com. Treating a language subdomain as a foreign
// host was a real defect in an earlier phase; treating an unrelated domain as
// the operator's would be a worse one, because it would publish somebody else's
// page as this platform's route.
// A blog, a help centre or a newsroom is the operator writing ABOUT its
// product, not offering the action. Kaidee's blog carried a Thai page headed
// "contact to advertise" and it resolved as a route to post a classified ad —
// buying display advertising and placing a classified are different acts, and
// the same confusion cost an earlier phase a Canadian marketplace.
const NOT_AN_ACTION_HOST = /^(blog|news|newsroom|support|help|docs|kb|status|about|press|investor|investors|careers|jobs)\./i;

function sameHostFamily(a, b) {
  try {
    const fam = (u) => new URL(u).hostname.replace(/^www\./, '').split('.').slice(-2).join('.');
    return fam(a) === fam(b);
  } catch { return false; }
}

// Text that also appears on the homepage is the site's furniture, not this
// page's offer. Compared on a normalised window rather than whole strings,
// because a banner is often re-wrapped between templates.
function isBoilerplate(sentence, homeText) {
  const key = String(sentence).replace(/\s+/g, ' ').trim().slice(0, 60);
  if (key.length < 20) return false;
  return String(homeText).replace(/\s+/g, ' ').includes(key);
}

// How promising a link looks, used ONLY to decide what to open first. This is
// the one place the URL is allowed to matter, and it is allowed because
// choosing where to look is not deciding what is true — the destination's own
// wording still has to state the action, and a path that merely LOOKS right
// resolves nothing. Cylex Austria is why this exists: its homepage offers
// ANMELDEN, REGISTRIEREN -> /signin, JETZT STARTEN and, further down,
// REGISTRIEREN -> /register-company. A budget of three pages spent in document
// order never reaches the fourth.
const URL_PROMISING = /(add|submit|list|claim|register|create|join|sell|seller|merchant|vendor|supplier|advertis|publish|press|contribut|write|pitch)[-_/]?(business|company|firm|listing|entry|profile|shop|store|ad|release|us|you)|register-company|add-business|add-listing|business-listing|for-business/i;
const URL_DEAD_END = /(sign-?in|log-?in|password|forgot|privacy|cookie|terms|legal|imprint|impressum|datenschutz)/i;

// A page explaining how a thing is done is not the place it is done. eBay's
// export site has an article at /first-steps/how-to-create-listing/ whose
// wording names the act perfectly and which is documentation, not a route.
const URL_EXPLAINER = /(how-to|how_to|\/help\/|\/support\/|\/faq|\/guide|first-steps|getting-started|\/blog\/|\/news\/|\/article)/i;
// A record inside the directory, rather than a page of the directory. Cylex
// resolved to /company/selling-my-mineral-rights-40693918.html — one business's
// own listing, reached by a link bearing that business's name.
const URL_IS_A_RECORD = /\/(company|companies|business|listing|profile|firma|empresa|entreprise)\/[^/]+[-_]\d{4,}/i;

function promise(link) {
  let score = 0;
  if (AR.LINK_MATCH(link.text)) score += 4;
  if (URL_PROMISING.test(link.href)) score += 2;
  if (URL_DEAD_END.test(link.href)) score -= 3;
  return score;
}

// The window of text around the phrase that resolved it — enough to audit the
// decision, far too little to be a stored copy of the page.
function excerpt(text, action, collection) {
  const confirms = AR.CONFIRMS[action];
  if (!confirms) return '';
  for (const sentence of String(text).split(/(?<=[.!?])\s+|\n/)) {
    if (sentence.length >= 12 && confirms(sentence)) return sentence.slice(0, 300);
  }
  return String(text).slice(0, 300);
}

// ── SETTLING ────────────────────────────────────────────────────────────────
//
// Not the load event. A single-page application fires load with an empty shell
// and then draws the navigation this pass exists to read, so waiting for load
// is waiting for the wrong thing. Two identical reads of the rendered text and
// link count mean the page has stopped changing, which is the property that
// actually matters.
// TWO consecutive identical observations, plus a floor on elapsed time.
//
// One match was not enough, and the failure was quiet. Cylex Austria's
// /register-company renders its header and footer first and fetches the main
// panel afterwards; two reads 350ms apart both saw the same header-and-footer
// shell, settle declared the page finished, and the researcher judged a page
// whose actual content — "Firma registrieren", "kostenlosen Firmeneintrag" —
// had not arrived yet. It recorded "rendered, offers no action" about a page
// that offers exactly the action, which is the same class of false negative as
// the headless refusals: a fact invented out of a measurement taken too early.
//
// Stability is still what decides; the floor only stops the first two reads
// from landing inside the same animation frame.
async function settle(page) {
  let previous = null;
  let stable = 0;
  const started = Date.now();
  const deadline = started + SETTLE_TIMEOUT_MS;
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
    if (Date.now() > deadline) return now.len > 0;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { setTimeout(r, 350); });
  }
}

// What a person can see and click. Anchor text comes from innerText, so a link
// hidden behind a collapsed menu still counts — it is navigation the operator
// published — while an element with no text does not.
async function readPage(page) {
  return page.eval((max) => {
    const text = (document.body ? document.body.innerText || '' : '').replace(/\s+/g, ' ').trim();
    const links = [];
    for (const a of document.querySelectorAll('a[href]')) {
      const label = (a.innerText || a.textContent || '').replace(/\s+/g, ' ').trim();
      if (!label || label.length > 60) continue;
      const href = a.href;
      if (!/^https?:/.test(href)) continue;
      links.push({ href, text: label });
    }
    return { title: document.title || '', text: text.slice(0, max), url: location.href, links };
  }, EVIDENCE_CHARS).catch(() => null);
}

// ── ONE RECORD ──────────────────────────────────────────────────────────────

async function researchOne(page, target) {
  const started = Date.now();
  const visited = [];
  let partial = 0;

  const open = async (url) => {
    const timer = setTimeout(() => { /* the navigation promise below settles anyway */ }, NAV_TIMEOUT_MS);
    try {
      await Promise.race([
        page.goto(url),
        new Promise((_, reject) => { setTimeout(() => reject(new Error('navigation timeout')), NAV_TIMEOUT_MS); }),
      ]);
      await settle(page);
      return await readPage(page);
    } catch (e) {
      return { error: e.message };
    } finally {
      clearTimeout(timer);
    }
  };

  const home = await open(target.url);
  if (!home || home.error) {
    return { state: 'PROTECTED', why: `browser: ${(home && home.error) || 'no response'}`, evidenceUrl: target.url };
  }
  // A real homepage carries navigation. A challenge or block page carries a
  // sentence and a link to a privacy policy. The pilot run mistook the second
  // for the first and recorded eleven refusals as "rendered, offers nothing",
  // which understates the corpus twice over: it hides how much is unread, and
  // it slanders sites that do publish a route.
  if (!home.text || home.text.length < MIN_TEXT || home.links.length < MIN_LINKS) {
    return {
      state: 'PROTECTED',
      why: `the page rendered ${home.links.length} link(s) and ${home.text ? home.text.length : 0} characters, which is a refusal rather than a site`,
      evidenceUrl: home.url,
    };
  }
  if (PARKED(home.text)) return { state: 'PARKED', why: 'a parked or for-sale domain', evidenceUrl: home.url };
  if (CHALLENGE(home.text)) {
    // The site answered and refused. That is a fact about access, never about
    // the platform, and it is emphatically not death.
    return { state: 'PROTECTED', why: 'a bot challenge in the rendered page', evidenceUrl: home.url };
  }

  // Candidate selection uses the BROAD vocabulary and proves nothing on its own
  // — a generic "Registrieren" gets a page opened, and only that page's wording
  // decides what it means. Strongest wording first, because the budget is three
  // pages and a homepage may offer a dozen plausible links. Deduplicated by
  // destination, because a homepage commonly repeats one "add your business"
  // link in the header, a hero panel and the footer, and three visits to one
  // URL is not three chances.
  const ranked = home.links.slice().sort((a, b) => promise(b) - promise(a));
  const candidates = [];
  const seen = new Set();
  for (const l of ranked) {
    if (!AR.FOLLOW_MATCH(l.text) || seen.has(l.href)) continue;
    seen.add(l.href);
    candidates.push(l);
    if (candidates.length >= MAX_FOLLOW * 2) break;
  }

  for (const link of candidates) {
    if (deadlineExceeded(started) || visited.length >= MAX_FOLLOW) break;
    // eslint-disable-next-line no-await-in-loop
    const page2 = await open(link.href);
    if (!page2 || page2.error || !page2.text) { visited.push(link.href); continue; }
    visited.push(link.href);
    // A followed page that renders only its header and footer has not shown us
    // its content, and saying "this page states no action" about it would be a
    // claim we did not earn. Cylex Austria does exactly this: its
    // /register-company loads fully on a first visit and returns chrome only
    // once the session has already loaded the homepage. Counted, and reported.
    if (page2.text.length < PARTIAL_TEXT) partial += 1;

    if (target.collection === 'tenders') {
      const bid = AR.judgeBid(page2.text);
      if (bid && bid.bidAccess) {
        return {
          state: 'RESOLVED', bidAccess: bid.bidAccess, why: bid.why,
          evidenceUrl: page2.url, anchor: link.text, rendered: true, visited: visited.length,
        };
      }
      continue;
    }

    const action = AR.judgeAction(target.collection, page2.text);
    const evidenceText = action ? excerpt(page2.text, action, target.collection) : '';
    const destHost = (() => { try { return new URL(page2.url).hostname; } catch { return ''; } })();
    if (action && sameHostFamily(target.url, page2.url)
      && !NOT_AN_ACTION_HOST.test(destHost)
      && !URL_EXPLAINER.test(page2.url) && !URL_IS_A_RECORD.test(page2.url)
      // The sentence must belong to THIS page. A site-wide banner appears on
      // the homepage too, and "Register Your Business on Cylex Today!" is
      // printed above every company record in the directory — which is how a
      // stranger's listing page became a submission route.
      && !isBoilerplate(evidenceText, home.text)
      // Either the link named the act or the address looks like a route.
      // Neither is proof on its own — the page's wording is still what
      // resolves — but a page reached by an "About Us" link at an /about-us
      // address, whose only relevant sentence explains that sponsored content
      // is LABELLED, is not an offer to advertise.
      && promise(link) > 0) {
      return {
        state: 'RESOLVED', actionType: action, actionUrl: page2.url,
        why: 'the rendered destination page states the action in the operator\'s own words',
        evidenceUrl: page2.url,
        anchor: link.text,
        // The sentence that decided it, kept so the applier can re-check the
        // actual evidence against the current vocabulary instead of trusting a
        // verdict recorded under an older one.
        evidenceText,
        rendered: true, visited: visited.length,
      };
    }
  }

  // Rendered successfully and said nothing actionable. Deliberately its own
  // state: "the browser could not read this" and "the browser read it and the
  // site offers nothing" are different facts, and collapsing them would hide
  // how much of the corpus is genuinely not actionable.
  return {
    state: 'RENDERED_NO_EVIDENCE',
    why: candidates.length
      ? `followed ${visited.length} candidate(s); none stated the action`
        + (partial ? `, and ${partial} rendered only navigation` : '')
      : 'the rendered page offered no link whose wording names an action',
    evidenceUrl: home.url,
    rendered: true,
    visited: visited.length,
    partiallyRendered: partial,
  };
}

// ── TARGETS ─────────────────────────────────────────────────────────────────

function targets() {
  const source = new CK.Ledger(SOURCE_LEDGER);
  const wanted = arg('--state') || 'NEEDS_BROWSER';
  const out = source.all()
    .filter((f) => f.state === wanted)
    .map((f) => ({
      collection: f.collection, id: f.id, country: f.country, url: f.url,
      domainRating: f.domainRating ?? null,
      key: `browser|${f.key}`,
      httpWhy: f.why,
    }));
  source.close();
  const country = arg('--country');
  const collection = arg('--collection');
  return out
    .filter((t) => (!country || t.country === country) && (!collection || t.collection === collection))
    .sort((a, b) => (b.domainRating ?? -1) - (a.domainRating ?? -1) || (a.id < b.id ? -1 : 1));
}

// ── RUN ─────────────────────────────────────────────────────────────────────

async function runProbe() {
  if (!chromePath()) { console.error('No Chrome, Chromium or Edge on this machine.'); process.exit(1); }
  const ledger = new CK.Ledger(FINDINGS);
  if (ledger.recovered) {
    console.log(`Recovered ${ledger.recovered} finding(s) from an interrupted run's journal.`);
  }
  let list = targets();
  const already = list.filter((t) => ledger.has(t.key)).length;
  if (!process.argv.includes('--refresh')) list = list.filter((t) => !ledger.has(t.key));
  const limit = arg('--limit');
  if (limit) list = list.slice(0, Number(limit));

  console.log(`Browser evidence: ${list.length} record(s) to open `
    + `(${already} already answered, ${ledger.size()} finding(s) on disk).`);
  if (!list.length) { report(ledger.all()); return; }

  CK.onInterrupt(ledger, 'Browser evidence');
  const chrome = await launch({ headless: false });
  if (!chrome) { console.error('Chrome did not start.'); process.exit(1); }

  const queue = list.slice();
  let done = 0;
  const started = Date.now();

  // One browser, a few tabs, reused for the whole run. Launching Chrome per
  // record would spend more time starting browsers than reading pages.
  const worker = async (n) => {
    let page = await openPage(chrome.wsUrl);
    for (;;) {
      const target = queue.shift();
      if (!target) break;
      let verdict;
      try {
        // eslint-disable-next-line no-await-in-loop
        verdict = await researchOne(page, target);
      } catch (e) {
        verdict = { state: 'PROTECTED', why: `browser worker: ${e.message}`, evidenceUrl: target.url };
        // A tab that threw is not trusted again; a fresh one costs a second.
        try { await page.close(); } catch { /* already gone */ }
        // eslint-disable-next-line no-await-in-loop
        page = await openPage(chrome.wsUrl);
      }
      ledger.record({ ...target, observedAt: new Date().toISOString().slice(0, 10), ...verdict });
      done += 1;
      if (done % 20 === 0) {
        const rate = Math.round((done / ((Date.now() - started) / 3600000)));
        console.log(`  ${done}/${list.length}  (~${rate}/hour)`);
      }
    }
    try { await page.close(); } catch { /* already gone */ }
  };

  try {
    await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));
  } finally {
    const kept = ledger.compact({ probedAt: new Date().toISOString().slice(0, 10) });
    try { chrome.proc.kill('SIGKILL'); } catch { /* already gone */ }
    try { fs.rmSync(chrome.profile, { recursive: true, force: true }); } catch { /* the OS reaps it */ }
    const mins = Math.max(1, Math.round((Date.now() - started) / 60000));
    console.log(`${kept} finding(s) on disk. ${done} record(s) in ${mins} min `
      + `(~${Math.round(done / (mins / 60))}/hour).`);
  }
  report(ledger.all());
}

function report(findings) {
  const tally = {};
  for (const f of findings) tally[f.state] = (tally[f.state] || 0) + 1;
  console.log('\nBROWSER EVIDENCE LEDGER');
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(5)}  ${k}`);
  }
  const actions = {};
  for (const f of findings) if (f.actionType) actions[f.actionType] = (actions[f.actionType] || 0) + 1;
  if (Object.keys(actions).length) console.log('  actions:', JSON.stringify(actions));
  const bids = {};
  for (const f of findings) if (f.bidAccess) bids[f.bidAccess] = (bids[f.bidAccess] || 0) + 1;
  if (Object.keys(bids).length) console.log('  bidAccess:', JSON.stringify(bids));
  const rendered = findings.filter((f) => f.rendered).length;
  console.log(`  rendered successfully: ${rendered} of ${findings.length}`);
}

// ── APPLY ───────────────────────────────────────────────────────────────────
//
// Delegated to the HTTP researcher's applier, which already owns the rules
// this phase must not weaken: the route field follows the action, a stored
// verdict is re-checked against the current vocabulary, and an HTML entity in
// a URL is refused. Reimplementing that here is how the two would diverge.
function runApply() {
  const browser = new CK.Ledger(FINDINGS);
  const resolved = browser.all().filter((f) => f.state === 'RESOLVED');
  browser.close();
  if (!resolved.length) { console.log('No resolved browser findings to apply.'); return; }

  const main = new CK.Ledger(SOURCE_LEDGER);
  for (const f of resolved) {
    // Written into the shared ledger under the HTTP identity, so one applier
    // and one audit trail cover both stages.
    const key = f.key.replace(/^browser\|/, '');
    main.record({ ...f, key, evidenceSource: 'browser' });
  }
  const kept = main.compact();
  console.log(`Merged ${resolved.length} browser finding(s) into the shared ledger (${kept} total).`);
  AR.runApply();
}

function runInventory() {
  const list = targets();
  const byCollection = {};
  const byCountry = {};
  for (const t of list) {
    byCollection[t.collection] = (byCollection[t.collection] || 0) + 1;
    byCountry[t.country] = (byCountry[t.country] || 0) + 1;
  }
  console.log('records awaiting a browser:', list.length);
  console.log('by collection:', JSON.stringify(byCollection));
  console.log('densest:', Object.entries(byCountry).sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([c, n]) => `${c}=${n}`).join(' '));
}

module.exports = { FINDINGS, targets, settle, researchOne, runApply, CONCURRENCY, MAX_FOLLOW };

if (require.main === module) {
  if (process.argv.includes('--apply')) runApply();
  else if (process.argv.includes('--inventory')) runInventory();
  else if (process.argv.includes('--report')) report(new CK.Ledger(FINDINGS).all());
  else runProbe().catch((e) => { console.error(e.message); process.exit(1); });
}
