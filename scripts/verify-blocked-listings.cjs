#!/usr/bin/env node
// scripts/verify-blocked-listings.cjs
'use strict';

// The browser check that 445 directory records have been waiting for.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// Records whose note reads "Live but behind a bot filter, so a browser check is
// needed" are not failures of research. They are research that stopped at
// exactly the right place: a `fetch` got a 403 or a JavaScript shell, and the
// collection's rule is that no fetch is ever called browser verification. So
// `currentStatus` stayed `unknown`, which is the honest answer, and the record
// asked for the one instrument that could settle it.
//
// This is that instrument. It visits each site once, in a real Chrome, and
// records what the page actually is.
//
// ── WHY IT IS NOT AN EVASION TOOL ───────────────────────────────────────────
//
// Chrome is asked to identify itself as the Chrome it is, rather than as
// "HeadlessChrome", and not to advertise automation. That is the whole of it.
// No proxy rotation, no fingerprint spoofing, no captcha solving, no retry
// storm. One homepage, once, at a human pace, from one machine.
//
// A site that still declines is left alone. `blocked` is a recorded outcome
// here, not a problem to defeat — the record simply keeps the `unknown` it
// already had, and says so with a date.
//
// ── WHY IT WRITES NOTHING BY DEFAULT ────────────────────────────────────────
//
// Probing and deciding are separate runs against the same evidence file. The
// default run only observes and writes findings to
// data/business-directories/.browser-verification.json. `--apply` reads that
// file back and merges the subset that is unambiguous. So the judgement can be
// re-read, re-run and argued with before a single record changes, and a
// re-probe never silently rewrites the corpus.
//
//   node scripts/verify-blocked-listings.cjs            # probe
//   node scripts/verify-blocked-listings.cjs --apply    # merge findings
//   node scripts/verify-blocked-listings.cjs --limit 20 # probe a sample
//
// Nothing in the build, the validator or the test suite invokes this file.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { openPage } = require('./tests/helpers/cdp.cjs');
const SAFE = require('./lib/rc-safe-apply.cjs');

const ROOT = path.resolve(__dirname, '..');

// Two collections carry the same backlog for the same reason. They are probed
// identically — a browser either renders a site or it does not, whatever the
// record is called — and differ only in what a finding is allowed to write.
// Marketplaces have never carried a lastVerified field, so the date lives in
// the note there rather than inventing a column for one pass.
const COLLECTIONS = {
  directories: {
    data: path.join(ROOT, 'data/business-directories/opportunities.json'),
    findings: path.join(ROOT, 'data/business-directories/.browser-verification.json'),
    routes: true,
    dateField: 'lastVerified',
  },
  marketplaces: {
    data: path.join(ROOT, 'data/marketplaces/marketplaces.json'),
    findings: path.join(ROOT, 'data/marketplaces/.browser-verification.json'),
    routes: false,
    dateField: null,
  },
};

const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
].find((p) => fs.existsSync(p));

// The real Chrome on this machine, not a fabricated identity.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

// How long a page gets to become itself. Directory homepages are heavy and
// often render late; a short budget would manufacture "blocked" verdicts.
const SETTLE_MS = 3500;
const CONCURRENCY = 4;
const PACE_MS = 700;

// A record only leaves `unknown` when the page is unmistakably a real one.
const MIN_TEXT = 400;

// Whether to walk one step into the operator's navigation. Off for the plain
// liveness pass, which only needs to know a site answers; on for actionability,
// where the whole question is what the operator offers.
const DEEP = process.argv.includes('--actionability');

// Signatures of a challenge, checked against the title as well as the body:
// Cloudflare puts "Attention Required!" in the title and almost nothing else.
const CHALLENGE = [
  [/attention required/i, 'cloudflare-attention'],
  [/just a moment/i, 'cloudflare-interstitial'],
  [/checking your browser/i, 'browser-check'],
  [/verify (you are|you're) human/i, 'human-verification'],
  [/access denied|forbidden/i, 'access-denied'],
  [/enable javascript and cookies/i, 'js-cookie-gate'],
  [/unusual traffic|automated queries/i, 'rate-limit'],
  [/captcha/i, 'captcha'],
  [/are you a robot/i, 'robot-check'],
];

// Anchor text that states a route in the operator's own words. Text, not href:
// a URL containing "signup" says nothing about who may sign up, while a link
// reading "Add your business" is the operator publishing the route.
const CREATE_TEXT = [
  /\badd (your |a |my )?(free )?(business|company|listing|firm|practice)\b/i,
  /\blist (your|a|my) (business|company|firm|practice)\b/i,
  /\b(register|create) (your |a |my )?(free )?(business|company|listing)\b/i,
  /\bsubmit (your |a )?(business|listing|site|company)\b/i,
  /\badd (a )?(new )?(entry|company|place)\b/i,
  /\bget listed\b/i,
  /\bjoin as a (business|pro|provider|supplier)\b/i,
];
const CLAIM_TEXT = [
  /\bclaim (your|this|my)? ?(free )?(business|listing|profile|page|company)\b/i,
  /\bis this your (business|listing|company)\b/i,
  /\bmanage your (listing|profile|business page)\b/i,
];

// Pages a directory itself links to when it is explaining how to get listed.
// Following one is walking the operator's own navigation, not crawling: the
// homepage of a large directory is a search box, and the route lives one click
// away under "For businesses" or "Advertise".
const SECOND_HOP = [
  /\bfor (businesses|business owners|companies)\b/i,
  /\badd (your |a )?(business|company|listing)\b/i,
  /\blist (your|a) (business|company)\b/i,
  /\bclaim (your|this) (business|listing|profile)\b/i,
  /\badvertise\b/i,
  /\bbusiness (owners?|solutions|centre|center)\b/i,
  /^(about|about us|contact|contact us)$/i,
];
const MAX_HOPS = 2;

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : (process.argv[i + 1] || true);
};

// ── CANDIDATE VERIFICATION ──────────────────────────────────────────────────
//
// Expansion works the other way round from recovery: a candidate is PROPOSED
// and has to earn its place. "The domain resolves and has words on it" is not
// enough — a parked domain, a squatter and a dead brand all clear that bar. A
// candidate is accepted only when the page carries evidence of BOTH things the
// record would claim: that it belongs to the country, and that it is the kind
// of platform the record says it is.
//
// Anything short of both is rejected and written to the log with its reason.
// The rejection rate is part of the result, not an embarrassment to hide: a
// list proposed from memory and filtered by a browser is honest precisely
// because the browser throws things out.
const COUNTRY_TLD = {
  albania: '.al', algeria: '.dz', azerbaijan: '.az', bahrain: '.bh', barbados: '.bb',
  belarus: '.by', belize: '.bz', bolivia: '.bo', 'bosnia-and-herzegovina': '.ba',
  botswana: '.bw', bulgaria: '.bg', cambodia: '.kh', 'costa-rica': '.cr', croatia: '.hr',
  cuba: '.cu', cyprus: '.cy', 'dominican-republic': '.do', 'dr-congo': '.cd', ecuador: '.ec',
  egypt: '.eg', 'el-salvador': '.sv', estonia: '.ee', georgia: '.ge', greece: '.gr',
  guatemala: '.gt', honduras: '.hn', hungary: '.hu', iceland: '.is', jordan: '.jo',
  kazakhstan: '.kz', kosovo: '.xk', kuwait: '.kw', laos: '.la', latvia: '.lv',
  lebanon: '.lb', lithuania: '.lt', luxembourg: '.lu', malta: '.mt', moldova: '.md',
  mongolia: '.mn', montenegro: '.me', myanmar: '.mm', namibia: '.na', nicaragua: '.ni',
  'north-macedonia': '.mk', oman: '.om', panama: '.pa', paraguay: '.py', 'puerto-rico': '.pr',
  qatar: '.qa', russia: '.ru', rwanda: '.rw', 'saudi-arabia': '.sa', serbia: '.rs',
  slovenia: '.si', sudan: '.sd', tanzania: '.tz', 'trinidad-and-tobago': '.tt',
  tunisia: '.tn', turkey: '.tr', ukraine: '.ua', uruguay: '.uy', uzbekistan: '.uz',
  venezuela: '.ve', zambia: '.zm', zimbabwe: '.zw',
};

// Vocabulary a directory uses about itself, in the languages these markets
// actually publish in. English-only matching would reject half of them for
// being foreign, which is the opposite of the point.
const DIRECTORY_WORDS = new RegExp([
  'director(y|io|ios)', 'business(es)?', 'compan(y|ies)', 'yellow ?pages', 'catalog(ue)?',
  'firm(s|en|as)?', 'enterprises?', 'listings?', 'empresas', 'entreprises', 'unternehmen',
  'aziende', 'bedrijven', 'firmy', 'фирм', 'компан', 'предприят', 'справочник', 'каталог',
  'katalog', 'rehber', 'işletme', 'εταιρ', 'επιχειρ', 'شرکت', 'شركات', 'دليل',
  'ettevõt', 'uzņēmum', 'įmoni', 'fyrirtæk', 'preduzeć', 'poduzeć', 'претприј',
].join('|'), 'i');

// A parked domain defeats the evidence test by accident rather than by malice:
// belizedirectory.com is for sale, and its sale page is titled
// "belizedirectory.com for sale | Spaceship.com" — which names Belize and says
// "directory", because the DOMAIN NAME does. Both signals came from the string
// being sold, not from a business behind it. This check runs first and is not
// overridable by evidence, because every signal on such a page is circular.
const PARKED = [
  // The domain name itself sits between "domain" and the verb often enough that
  // anchoring on the adjacent words misses half of these pages: "The domain
  // example.test may be for sale." So the gap is allowed for, but bounded, so
  // an article about domain trading on a real site does not trip it.
  [/\bdomain\b[^!?\n]{0,60}\b(is|are|may be|might be) for sale\b/i, 'domain for sale'],
  [/\bfor sale\b[\s\S]{0,40}\b(spaceship|godaddy|sedo|afternic|hugedomains|dan\.com|namecheap|dynadot|porkbun)\b/i, 'domain for sale'],
  [/\b(buy|purchase|enquire about) this domain\b/i, 'domain for sale'],
  [/\b(parked|parking) (domain|page)\b/i, 'parked domain'],
  [/\bhugedomains\b|\bsedo\.com\b|\bafternic\b|\bdan\.com\b/i, 'domain marketplace'],
  [/\bunder construction\b|\bcoming soon\b/i, 'placeholder page'],
  [/\bdefault web site page\b|\bit works!\b|\bapache2? (ubuntu |debian )?default\b/i, 'unconfigured server'],
];

function parkedReason(obs) {
  const hay = `${obs.title}\n${obs.head}`;
  for (const [re, label] of PARKED) if (re.test(hay)) return label;
  return null;
}

function candidateEvidence(candidate, obs) {
  const host = (() => { try { return new URL(obs.finalUrl).hostname.toLowerCase(); } catch { return ''; } })();
  const hay = `${obs.title}\n${obs.head}`;
  const tld = COUNTRY_TLD[candidate.country];
  const countryName = String(candidate.country || '').replace(/-/g, ' ');

  const evidence = [];
  if (tld && (host.endsWith(tld) || host.includes(`${tld}.`))) evidence.push(`ccTLD ${tld}`);
  if (new RegExp(countryName.replace(/\s+/g, '[ -]?'), 'i').test(hay)) evidence.push('names the country');
  const country = evidence.length > 0;

  const kind = DIRECTORY_WORDS.test(hay);
  if (kind) evidence.push('describes itself as a directory');

  return { country, kind, evidence };
}

// Two-level public suffixes common enough to matter here. Without them,
// hotfrog.co.uk and anything.co.uk would compare as the same site.
const TWO_LEVEL = new Set([
  'co.uk', 'org.uk', 'me.uk', 'ltd.uk', 'plc.uk', 'net.uk', 'sch.uk', 'ac.uk', 'gov.uk',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au', 'co.nz', 'net.nz', 'org.nz',
  'com.br', 'net.br', 'org.br', 'com.mx', 'com.ar', 'com.co', 'com.pe', 'com.ve',
  'co.jp', 'or.jp', 'ne.jp', 'ac.jp', 'go.jp', 'co.kr', 'or.kr', 'co.in', 'net.in',
  'org.in', 'co.za', 'org.za', 'com.sg', 'com.my', 'com.hk', 'com.tw', 'com.tr',
  'com.cn', 'net.cn', 'org.cn', 'com.ua', 'com.pl', 'com.ph', 'com.vn', 'co.id',
  'com.eg', 'com.sa', 'com.ng', 'co.ke', 'com.pk', 'com.bd', 'com.do', 'com.ec',
  'com.uy', 'com.py', 'com.bo', 'com.gt', 'com.pa', 'com.cy', 'com.mt', 'co.il',
]);

function registrable(hostname) {
  // Not a full public-suffix implementation, and it does not pretend to be one.
  // It answers one question: did we land on a different SITE, or merely on a
  // different part of the same one? A plain subdomain is the same site —
  // fr.avis-verifies.com and avis-verifies.com are one company, and calling
  // that a redirect would strand a live record at unknown for no reason.
  const host = String(hostname || '').toLowerCase().replace(/^www\./, '');
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  const lastTwo = parts.slice(-2).join('.');
  return TWO_LEVEL.has(lastTwo) ? parts.slice(-3).join('.') : lastTwo;
}

function startChrome() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bd-verify-'));
  const proc = spawn(CHROME, [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check',
    '--disable-gpu', '--disable-dev-shm-usage', '--mute-audio',
    '--disable-blink-features=AutomationControlled',
    '--disable-background-networking', '--disable-sync',
    'about:blank',
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

// Everything observed about one site, with no interpretation applied yet.
async function probe(wsUrl, record) {
  const page = await openPage(wsUrl);
  try {
    await page.send('Network.setUserAgentOverride', { userAgent: UA });
    await page.goto(record.website);
    await new Promise((r) => { setTimeout(r, SETTLE_MS); });

    const seen = await page.eval((createSrc, claimSrc, hopSrc) => {
      const rx = (src) => src.map((s) => new RegExp(s.slice(s.indexOf('/') + 1, s.lastIndexOf('/')), 'i'));
      const create = rx(createSrc);
      const claim = rx(claimSrc);
      const hopRe = rx(hopSrc);
      const text = document.body ? document.body.innerText : '';
      const anchors = [...document.querySelectorAll('a[href]')].map((a) => ({
        text: (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
        href: a.href,
      })).filter((a) => a.text && /^https?:/.test(a.href));
      const pick = (patterns) => {
        for (const a of anchors) for (const re of patterns) if (re.test(a.text)) return a;
        return null;
      };
      // The candidate next steps are chosen HERE, where the anchor list lives.
      // `anchors` leaves this function as a count, and a previous version tried
      // to iterate that count — 441 records failed with "number N is not
      // iterable" before anything had been asked of a single site.
      const hops = [];
      for (const a of anchors) {
        if (hops.length >= 4) break;
        if (!hopRe.some((re) => re.test(a.text))) continue;
        if (a.href === location.href || hops.includes(a.href)) continue;
        hops.push(a.href);
      }
      return {
        title: document.title || '',
        textLen: text.length,
        head: text.slice(0, 1200),
        url: location.href,
        anchors: anchors.length,
        hops,
        create: pick(create),
        claim: pick(claim),
      };
    }, CREATE_TEXT.map(String), CLAIM_TEXT.map(String), SECOND_HOP.map(String));

    // One step further, along the operator's own navigation, when the homepage
    // published no route. A directory's front page is a search box; the answer
    // to "how do I get listed" is usually one click behind it.
    let deep = null;
    if (DEEP && !seen.create && !seen.claim) {
      const origin = (() => { try { return new URL(seen.url).origin; } catch { return null; } })();
      const hops = (seen.hops || [])
        .filter((href) => origin && href.startsWith(origin))
        .slice(0, MAX_HOPS);
      for (const href of hops) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await page.goto(href);
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => { setTimeout(r, 1500); });
          // eslint-disable-next-line no-await-in-loop
          const more = await page.eval((createSrc, claimSrc) => {
            const rx = (src) => src.map((x) => new RegExp(x.slice(x.indexOf('/') + 1, x.lastIndexOf('/')), 'i'));
            const create = rx(createSrc); const claim = rx(claimSrc);
            const anchors = [...document.querySelectorAll('a[href]')].map((a) => ({
              text: (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
              href: a.href,
            })).filter((a) => a.text && /^https?:/.test(a.href));
            const pick = (ps) => {
              for (const a of anchors) for (const re of ps) if (re.test(a.text)) return a;
              return null;
            };
            return { create: pick(create), claim: pick(claim), from: location.href };
          }, CREATE_TEXT.map(String), CLAIM_TEXT.map(String));
          if (more.create || more.claim) { deep = more; break; }
        } catch { /* a page that will not load establishes nothing */ }
      }
    }

    // The status of the document itself, not of some asset it pulled in.
    const doc = page.requests.find((r) => r.url === seen.url)
      || page.requests.find((r) => r.url === record.website)
      || page.requests[0] || null;

    return {
      status: doc ? doc.status : 0,
      finalUrl: seen.url,
      title: seen.title,
      textLen: seen.textLen,
      anchors: seen.anchors,
      head: seen.head,
      create: seen.create || (deep && deep.create) || null,
      claim: seen.claim || (deep && deep.claim) || null,
      deepFrom: deep ? deep.from : null,
      error: null,
    };
  } catch (e) {
    return { status: 0, error: String(e.message || e).slice(0, 160) };
  } finally {
    try { await page.close(); } catch { /* tab already gone */ }
    try { page.ws.close(); } catch { /* socket already closed */ }
  }
}

// The only place an observation becomes a claim.
function judge(record, obs) {
  if (obs.error) return { verdict: 'unreachable', why: obs.error };
  if (!obs.finalUrl || /^chrome-error:/.test(obs.finalUrl)) {
    return { verdict: 'unreachable', why: 'the browser could not open the site at all' };
  }

  const hay = `${obs.title}\n${obs.head}`;
  for (const [re, label] of CHALLENGE) {
    if (re.test(hay)) return { verdict: 'blocked', why: label };
  }
  if (obs.status >= 400) return { verdict: 'blocked', why: `http ${obs.status}` };
  if (obs.textLen < MIN_TEXT) {
    return { verdict: 'inconclusive', why: `only ${obs.textLen} characters rendered` };
  }

  let from; let to;
  try {
    from = registrable(new URL(record.website).hostname);
    to = registrable(new URL(obs.finalUrl).hostname);
  } catch { return { verdict: 'inconclusive', why: 'unparseable url' }; }

  // Landing on a different site is a fact worth recording and NOT a licence to
  // call the record active: what is alive is the destination, not the entry.
  if (from !== to) return { verdict: 'redirected', why: `${from} now serves ${to}`, to: obs.finalUrl };

  // Creating a listing and claiming one that already exists are different acts,
  // and a link whose words say one while its path says the other has not
  // established either. Manta's homepage offers "Claim My Listing" pointing at
  // /business-listings/add-your-company; that is a question, not an answer, so
  // the route is dropped and the record keeps its unknown listingAction.
  const contradicts = (anchor, wanted) => {
    const p = (() => { try { return new URL(anchor.href).pathname.toLowerCase(); } catch { return ''; } })();
    const saysAdd = /\b(add|create|register|signup|sign-up|join|new)\b/.test(p);
    const saysClaim = /\bclaim\b/.test(p);
    return wanted === 'create' ? (saysClaim && !saysAdd) : (saysAdd && !saysClaim);
  };

  const routes = {};
  if (obs.create && obs.create.href !== record.website && !contradicts(obs.create, 'create')) {
    routes.create = obs.create;
  }
  if (obs.claim && obs.claim.href !== record.website && !contradicts(obs.claim, 'claim')) {
    routes.claim = obs.claim;
  }
  return { verdict: 'active', why: `${obs.textLen} characters of real content`, routes };
}

function collection() {
  const name = arg('--collection') || 'directories';
  if (!COLLECTIONS[name]) {
    console.error(`Unknown collection "${name}". Expected one of: ${Object.keys(COLLECTIONS).join(', ')}`);
    process.exit(1);
  }
  return { name, ...COLLECTIONS[name] };
}

async function runProbe() {
  if (!CHROME) { console.error('No Chrome on this machine.'); process.exit(1); }
  const C = collection();
  const { data: DATA } = C;
  const FINDINGS = DEEP
    ? path.join(ROOT, 'data/business-directories/.actionability.json')
    : C.findings;
  const rows = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  let targets = rows.filter((r) => r.currentStatus === 'unknown'
    && /bot filter|browser check/i.test(r.note || ''));

  // Re-probe a named subset. Used when the JUDGEMENT changed rather than the
  // sites — re-running 445 network calls to correct a hostname comparison would
  // be a waste of everyone's bandwidth, including the operators'.
  //
  // Named records are selected from the WHOLE file, not from the pending queue.
  // "Verify exactly these" has to mean that: after a redirect audit repoints a
  // record, its note no longer asks for a check, and filtering by the queue
  // would silently probe nothing while reporting success.
  // Actionability enrichment targets a different cohort entirely: records that
  // are ALIVE and whose listing action is still unknown. Liveness is settled
  // for these; what a business can actually do on them is not, and that is the
  // largest remaining gap in the planner's classification.
  if (DEEP) {
    const PRIORITY = new Set(['P1', 'P2']);
    const TIER = new Set(['tier1', 'tier2']);
    targets = rows.filter((r) => r.currentStatus === 'active'
      && (!r.listingAction || r.listingAction === 'unknown')
      && PRIORITY.has(r.priority) && TIER.has(r.tier));
    console.log(`Actionability: ${targets.length} live record(s) whose action is unknown.`);
  }

  // --limit is applied AFTER the cohort is chosen. It used to be applied before,
  // so an actionability run silently discarded it and probed all 482.
  const limit = arg('--limit');
  if (limit) targets = targets.slice(0, Number(limit));

  const ids = arg('--ids');
  if (ids && ids !== true) {
    const wanted = new Set(String(ids).split(',').map((s) => s.trim()).filter(Boolean));
    targets = rows.filter((r) => wanted.has(r.id));
    console.log(`Re-probing ${targets.length} named record(s).`);
  }

  console.log(`Browser verification (${C.name}): ${targets.length} record(s) awaiting a browser check.`);
  const chrome = await startChrome();
  const findings = [];
  let done = 0;

  const queue = targets.slice();
  const worker = async () => {
    for (;;) {
      const record = queue.shift();
      if (!record) return;
      // eslint-disable-next-line no-await-in-loop
      const obs = await probe(chrome.wsUrl, record);
      const verdict = judge(record, obs);
      findings.push({
        id: record.id,
        name: record.name,
        website: record.website,
        country: record.country,
        observed: {
          status: obs.status, finalUrl: obs.finalUrl || null, title: obs.title || null,
          textLen: obs.textLen || 0, anchors: obs.anchors || 0,
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

  // A partial probe REPLACES the records it re-examined and leaves every other
  // finding untouched. Overwriting the file with a subset would silently delete
  // verified work, which is exactly the direction that must never be automatic.
  let merged = findings;
  if (fs.existsSync(FINDINGS)) {
    const prior = JSON.parse(fs.readFileSync(FINDINGS, 'utf8')).findings || [];
    if (prior.length > findings.length) {
      const fresh = new Map(findings.map((f) => [f.id, f]));
      merged = prior.map((f) => fresh.get(f.id) || f);
      const added = findings.filter((f) => !prior.some((p) => p.id === f.id));
      merged = merged.concat(added);
      console.log(`Merged ${findings.length} fresh finding(s) into ${prior.length} existing.`);
    }
  }

  merged.sort((a, b) => (a.id < b.id ? -1 : 1));
  fs.writeFileSync(FINDINGS, `${JSON.stringify({
    probedAt: new Date().toISOString().slice(0, 10),
    userAgent: UA,
    total: merged.length,
    findings: merged,
  }, null, 1)}\n`);

  const tally = {};
  for (const f of merged) tally[f.verdict] = (tally[f.verdict] || 0) + 1;
  console.log('\nVerdicts:', Object.entries(tally).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}=${v}`).join(' '));
  console.log(`Findings written to ${path.relative(ROOT, FINDINGS)}. Nothing merged — rerun with --apply.`);

  // Only now, and never fatally: a just-killed Chrome may still be flushing its
  // profile, and losing a completed probe to a tidy-up failure is absurd.
  try { fs.rmSync(chrome.profile, { recursive: true, force: true }); } catch { /* the OS will reap it */ }
}

// A call to action is short. "Add Your Business" is a button; a 79-character
// run-on beginning "Business GuideEthiopian Business Directory - List Your
// Business Profile. Search…" is a block of page text that happened to sit
// inside an anchor, and it evidences nothing about a route.
const MAX_ANCHOR_TEXT = 60;

// Actionability answers a different question from liveness and writes different
// fields: it may set a listing action and its route on a record already known
// to be alive, and it may never change a status on that basis alone.
function runActionabilityApply() {
  const FINDINGS = path.join(ROOT, 'data/business-directories/.actionability.json');
  const DATA = COLLECTIONS.directories.data;
  const { probedAt, findings } = JSON.parse(fs.readFileSync(FINDINGS, 'utf8'));
  const rows = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const before = JSON.parse(JSON.stringify(rows));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const OWNER = 'actionability';
  const tally = { established: 0, rejectedText: 0, redirected: 0, stillUnknown: 0 };

  for (const f of findings) {
    const r = byId.get(f.id);
    if (!r) continue;

    if (f.verdict === 'redirected') {
      // A record believed active now answers from somewhere else. That is a
      // redirect question, not an actionability one — unless it has since been
      // resolved, in which case saying so again would contradict its status.
      const resolved = /Audited on \d{4}-\d{2}-\d{2}|\[redirect:/.test(r.note || '');
      if (!resolved) {
        SAFE.applyPatch(r, {
          note: SAFE.amendNote(r.note,
            `an actionability check found that ${f.why}; a browser check is needed by a person to settle what this record should point at.`,
            { owner: OWNER, date: probedAt, legacy: false }),
        }, { owner: OWNER, collection: 'directories' });
        tally.redirected += 1;
      }
      continue;
    }
    if (f.verdict !== 'active') { tally.stillUnknown += 1; continue; }

    const create = f.routes && f.routes.create;
    const claim = f.routes && f.routes.claim;
    const usable = (a) => a && a.text.length <= MAX_ANCHOR_TEXT && a.href !== r.website;
    if ((create && !usable(create)) || (!create && claim && !usable(claim))) {
      tally.rejectedText += 1;
      continue;
    }

    if (usable(create) && !r.submissionUrl) {
      SAFE.applyPatch(r, {
        submissionUrl: create.href,
        listingAction: usable(claim) ? 'create-and-claim' : 'create',
        lastVerified: probedAt,
      }, { owner: OWNER, collection: 'directories' });
      tally.established += 1;
    } else if (usable(claim) && !r.claimUrl && !create) {
      SAFE.applyPatch(r, { claimUrl: claim.href, listingAction: 'claim', lastVerified: probedAt },
        { owner: OWNER, collection: 'directories' });
      tally.established += 1;
    } else {
      tally.stillUnknown += 1;
    }
  }

  SAFE.assertNoDeletion(before, rows);
  const drift = SAFE.diffFingerprints(SAFE.curatedFingerprint(before), SAFE.curatedFingerprint(rows));
  if (drift.length) throw new Error(`curated fields drifted on: ${drift.join(', ')}`);

  fs.writeFileSync(DATA, `${JSON.stringify(rows, null, 1)}\n`);
  console.log('Actionability merged:', Object.entries(tally).map(([k, v]) => `${k}=${v}`).join(' '));
}

function runApply() {
  const C = collection();
  const { data: DATA, findings: FINDINGS } = C;
  if (!fs.existsSync(FINDINGS)) {
    console.error(`No findings file for ${C.name}. Run the probe first.`); process.exit(1);
  }
  const { probedAt, findings } = JSON.parse(fs.readFileSync(FINDINGS, 'utf8'));
  const rows = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const before = JSON.parse(JSON.stringify(rows));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const noteField = C.name === 'media' ? 'shortNote' : 'note';
  const OWNER = 'accessibility';

  const changes = { active: 0, routes: 0, redirected: 0, dated: 0, skipped: 0 };
  for (const f of findings) {
    const record = byId.get(f.id);
    if (!record) { changes.skipped += 1; continue; }

    // Every write goes through the ownership contract, and every sentence
    // carries this pass's tag so a second run replaces it rather than adding
    // a second copy. That is the whole of the idempotence guarantee.
    const patch = {};
    if (C.dateField) patch[C.dateField] = probedAt;

    if (f.verdict === 'active') {
      patch.currentStatus = 'active';
      patch[noteField] = SAFE.amendNote(record[noteField],
        'the site loads and serves its own content, checked in a browser.',
        { owner: OWNER, date: probedAt });
      changes.active += 1;
    } else if (f.verdict === 'redirected') {
      // Unless the redirect owner has already settled it, in which case this
      // pass's observation is simply out of date and is withdrawn rather than
      // restated next to the resolution.
      if (SAFE.isSettledBy(record[noteField], OWNER)) {
        patch[noteField] = SAFE.clearNote(record[noteField], { owner: OWNER, legacy: false });
      } else {
        patch[noteField] = SAFE.amendNote(record[noteField],
          `a browser check found that ${f.why}; a browser check is needed by a person to settle what this entry should point at, and the status stays unknown.`,
          { owner: OWNER, date: probedAt });
        changes.redirected += 1;
      }
    } else {
      patch[noteField] = SAFE.amendNote(record[noteField],
        `an automated browser check was refused by the site (${f.why}); a browser check is needed by a person and the status stays unknown.`,
        { owner: OWNER, date: probedAt });
      changes.dated += 1;
    }
    SAFE.applyPatch(record, patch, { owner: OWNER, collection: C.name });

    // Routes are actionability, not accessibility, and are written under that
    // owner so the two facts stay separately attributable.
    if (f.verdict === 'active' && C.routes) {
      const create = f.routes && f.routes.create;
      const claim = f.routes && f.routes.claim;
      if (create && !record.submissionUrl) {
        SAFE.applyPatch(record, {
          submissionUrl: create.href,
          listingAction: claim ? 'create-and-claim' : 'create',
        }, { owner: 'actionability', collection: C.name });
        changes.routes += 1;
      } else if (claim && !record.claimUrl && !create) {
        SAFE.applyPatch(record, { claimUrl: claim.href, listingAction: 'claim' },
          { owner: 'actionability', collection: C.name });
        changes.routes += 1;
      }
    }
  }

  SAFE.assertNoDeletion(before, rows);
  const drift = SAFE.diffFingerprints(SAFE.curatedFingerprint(before), SAFE.curatedFingerprint(rows));
  if (drift.length) throw new Error(`curated fields drifted on: ${drift.join(', ')}`);

  fs.writeFileSync(DATA, `${JSON.stringify(rows, null, 1)}\n`);
  console.log(`Merged (${C.name}):`, Object.entries(changes).map(([k, v]) => `${k}=${v}`).join(' '));
}


async function runCandidates() {
  if (!CHROME) { console.error('No Chrome on this machine.'); process.exit(1); }
  const file = arg('--candidates');
  const out = arg('--out') || '/tmp/candidate-verification.json';
  const candidates = JSON.parse(fs.readFileSync(String(file), 'utf8'));
  const existing = new Set(JSON.parse(fs.readFileSync(COLLECTIONS.directories.data, 'utf8'))
    .flatMap((r) => [r.id, (() => { try { return new URL(r.website).hostname.replace(/^www\./, ''); } catch { return null; } })()])
    .filter(Boolean));

  console.log(`Candidate verification: ${candidates.length} proposed.`);
  const chrome = await startChrome();
  const results = [];
  const queue = candidates.slice();
  let done = 0;

  const worker = async () => {
    for (;;) {
      const c = queue.shift();
      if (!c) return;
      const host = (() => { try { return new URL(c.website).hostname.replace(/^www\./, ''); } catch { return null; } })();
      if (existing.has(c.id) || (host && existing.has(host))) {
        results.push({ ...c, accepted: false, why: 'already in the collection' });
        done += 1;
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const obs = await probe(chrome.wsUrl, c);
      const verdict = judge(c, obs);
      let accepted = false;
      let why = verdict.why;
      let evidence = [];
      if (verdict.verdict !== 'active') {
        why = `${verdict.verdict}: ${verdict.why}`;
      } else {
        const parked = parkedReason(obs);
        const e = candidateEvidence(c, obs);
        evidence = e.evidence;
        if (parked) why = `${parked}, not a business behind it`;
        else if (!e.country) why = 'nothing on the page ties it to the country claimed';
        else if (!e.kind) why = 'the page does not describe itself as a directory';
        else { accepted = true; why = e.evidence.join('; '); }
      }
      results.push({
        ...c,
        accepted,
        why,
        evidence,
        observed: {
          status: obs.status, finalUrl: obs.finalUrl || null,
          title: obs.title || null, textLen: obs.textLen || 0,
        },
        routes: verdict.routes || {},
      });
      done += 1;
      if (done % 20 === 0) console.log(`  ${done}/${candidates.length}`);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => { setTimeout(r, PACE_MS); });
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  chrome.proc.kill('SIGKILL');

  results.sort((a, b) => (a.id < b.id ? -1 : 1));
  fs.writeFileSync(out, `${JSON.stringify({ probedAt: new Date().toISOString().slice(0, 10), results }, null, 1)}\n`);

  const ok = results.filter((r) => r.accepted);
  console.log(`\nAccepted ${ok.length} of ${results.length}. Written to ${out}.`);
  const byReason = {};
  for (const r of results.filter((x) => !x.accepted)) {
    const k = r.why.split(':')[0].split(';')[0];
    byReason[k] = (byReason[k] || 0) + 1;
  }
  console.log('Rejected:', Object.entries(byReason).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}=${v}`).join(' '));
  try { fs.rmSync(chrome.profile, { recursive: true, force: true }); } catch { /* the OS will reap it */ }
}

// The decision functions are pure and are the part worth testing: the network
// is not where these get things wrong, the judgement is. Exported so the suite
// can drive them on synthetic observations, with the CLI still the only thing
// that runs when this file is executed directly.
module.exports = {
  judge, candidateEvidence, parkedReason, registrable, PARKED, CREATE_TEXT, CLAIM_TEXT,
};

if (require.main === module) {
  if (process.argv.includes('--candidates')) runCandidates().catch((e) => { console.error(e); process.exit(1); });
  else if (process.argv.includes('--apply')) (DEEP ? runActionabilityApply : runApply)();
  else runProbe().catch((e) => { console.error(e); process.exit(1); });
}
