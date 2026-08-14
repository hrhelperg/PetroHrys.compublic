#!/usr/bin/env node
// scripts/research-media-backlog.cjs
'use strict';

// The 62 Media records that were never researched past their own name.
//
// ── WHAT "IDENTIFICATION ONLY" MEANT ────────────────────────────────────────
//
// Each record had a name, a domain, a country and nothing else: every route
// null, `opportunityTypes: ['unknown']`, `costModel: unknown`, status unknown.
// That is not a claim about the publication. It is an absence of research, and
// it is worse than a blocked record, because a blocked record at least records
// what stopped it.
//
// ── WHY MEDIA CANNOT REUSE THE DIRECTORY PASS ───────────────────────────────
//
// A directory answers "can a business get listed here". A publication answers
// something else entirely, and answers it in several incompatible ways at once:
// it may take a press release, or an article pitch, or a news tip, or paid
// placement, or none of them. Those are different actions with different
// routes, and a single "is it alive" verdict says nothing about any of them.
//
// So this pass asks three separate questions and refuses to let one stand in
// for another:
//
//   1. Is the site live?               (the same browser standard as elsewhere)
//   2. Is it actually a publication?   (ONTOLOGY — see below)
//   3. What does it publish a route for, in its own words?
//
// ── ONTOLOGY, BECAUSE THE COLLECTION IS NOT "SITES THAT SOUND EDITORIAL" ────
//
// A marketing agency, a blog, a business directory, a link farm and a parked
// domain will all render 200 with words on them. Several will have "media" or
// "news" in the domain. The record is only kept in Media if the page carries
// evidence of PUBLISHING: a feed, article markup, datelines, a masthead
// vocabulary. A site that sells marketing services is rejected however
// editorial its name sounds.
//
// ── ROUTES COME FROM WORDING ────────────────────────────────────────────────
//
// `/submit`, `/contact` and `/register` prove nothing. A link that reads
// "Submit a press release" is the operator publishing a route. Anchor text
// decides, and the opportunity type follows the wording rather than the path.
//
//   node scripts/research-media-backlog.cjs           # probe
//   node scripts/research-media-backlog.cjs --apply   # merge findings
//
// Nothing in the build, the validator or the test suite invokes this file.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { openPage } = require('./tests/helpers/cdp.cjs');
const SAFE = require('./lib/rc-safe-apply.cjs');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data/media-pr-publishing/media-platforms.json');
const FINDINGS = path.join(ROOT, 'data/media-pr-publishing/.media-research.json');
const ACTIONABILITY_FINDINGS = path.join(ROOT, 'data/media-pr-publishing/.media-actionability.json');

const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
].find((p) => fs.existsSync(p));

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const SETTLE_MS = 4000;
const CONCURRENCY = 4;
const PACE_MS = 800;
const MIN_TEXT = 400;

const CHALLENGE = [
  [/attention required/i, 'cloudflare-attention'],
  [/just a moment/i, 'cloudflare-interstitial'],
  [/checking your browser/i, 'browser-check'],
  [/verify (you are|you're) human/i, 'human-verification'],
  [/access denied|forbidden/i, 'access-denied'],
  [/enable javascript and cookies/i, 'js-cookie-gate'],
  [/unusual traffic|automated queries/i, 'rate-limit'],
  [/captcha/i, 'captcha'],
];

const PARKED = [
  [/\bdomain\b[^!?\n]{0,60}\b(is|are|may be|might be) for sale\b/i, 'domain for sale'],
  [/\b(buy|purchase|enquire about) this domain\b/i, 'domain for sale'],
  [/\b(parked|parking) (domain|page)\b/i, 'parked domain'],
  [/\bhugedomains\b|\bsedo\.com\b|\bafternic\b|\bdan\.com\b/i, 'domain marketplace'],
  [/\bunder construction\b|\bcoming soon\b/i, 'placeholder page'],
];

// Each route is a pair: what the operator's link SAYS, and what that means in
// the collection's existing vocabulary. Nothing here invents an opportunity
// type — every value is already in media-schema's OPPORTUNITY_TYPES.
const ROUTES = [
  {
    field: 'pressReleaseUrl',
    type: 'press-release',
    text: [
      /\bsubmit (a |your )?press release\b/i,
      /\bpress release submission\b/i,
      /\bsend (us )?(a |your )?press release\b/i,
      /\bsubmit (a |your )?(news )?release\b/i,
    ],
  },
  {
    field: 'submissionUrl',
    type: 'contributed-article',
    text: [
      /\bwrite for us\b/i,
      /\bbecome a (contributor|writer|columnist)\b/i,
      /\bcontribute (an? )?(article|post|story)\b/i,
      /\bsubmit (an? )?(article|post|guest post|op-?ed)\b/i,
      /\bguest (post|article|contribution)\b/i,
    ],
  },
  {
    field: 'submissionUrl',
    type: 'editorial-submission',
    text: [
      /\bsubmit (a |your )?(news )?tip\b/i,
      /\bsend (us )?a tip\b/i,
      /\bnews tips?\b/i,
      /\bsubmit (your )?(news|story)\b/i,
      /\bsubmit an event\b/i,
    ],
  },
  {
    field: 'pitchUrl',
    type: 'editorial-pitch',
    text: [
      /\bpitch (us|a story|your story)\b/i,
      /\bstory (ideas?|pitches?)\b/i,
      /\bcontact (the )?(editor|editorial|newsroom)\b/i,
      // "Editorial Team" was here and had to go: it is a masthead listing —
      // who they are — not an invitation to pitch them. Three records took an
      // editorial-pitch route from it, which the operator never offered.
      /\beditorial (contact|enquiries|inquiries)\b/i,
      /\bsubmit a pitch\b/i,
    ],
  },
  // NOTHING for plain "Advertise with us" or "Media kit".
  //
  // Ten records took one of those routes and the schema refused every one:
  // advertisingUrl and mediaKitUrl may only be set when an opportunity type
  // justifies them, and the only types that do are sponsored-content and
  // media-partnership. That rule is right and it is the collection saying what
  // it is for. This is a register of EDITORIAL opportunities; a display-ad rate
  // card is not one, and "we sell advertising" does not evidence that a
  // publication accepts sponsored articles.
  //
  // So the URL is recorded only where the wording offers the placement, which
  // is the same case that evidences the type.
  {
    field: 'advertisingUrl',
    type: 'sponsored-content',
    // A nav link reading "Sponsored Content" leads to a SECTION of sponsored
    // articles; it is not an offer to buy one. Travel Weekly's match was an
    // article headline — "Sponsored Content: Travel Planners International…".
    // Only wording that offers the placement counts.
    text: [
      /\bsponsored (content|post|article) (opportunities|packages|programs?)\b/i,
      /\bsubmit (a )?sponsored\b/i,
      /\bbranded content (opportunities|solutions|studio)\b/i,
      /\bnative advertising\b/i,
    ],
  },
];

// Pages an operator links from its own homepage that are where submission
// routes usually live. Following one of these is not crawling the site — it is
// walking the navigation the publisher put there, one step, and it is the
// difference between "we looked at the front page" and "we looked where the
// answer is kept".
const SECOND_HOP = [
  /^(contact|contact us|contacts)$/i,
  /^(about|about us)$/i,
  /\badvertise\b/i,
  /\bwrite for us\b/i,
  /\bsubmit\b/i,
  /\b(press|media) (room|centre|center|kit)\b/i,
];
const MAX_HOPS = 2;

// Evidence that a site PUBLISHES, as opposed to merely existing.
const PUBLISHING_WORDS = /\b(newsroom|editorial|editor|reporter|journalist|columnist|subscribe|newsletter|magazine|journal|daily|weekly|breaking|headlines?|opinion|op-?ed|archives?|published|correspondent)\b/i;

// Evidence that a site SELLS SERVICES, which is what an agency does.
const AGENCY_WORDS = /\b(our (services|clients|agency|team of experts)|marketing agency|seo agency|we help brands|request a (quote|proposal)|book a (call|demo)|case studies)\b/i;

// Same family rule as the redirect audit: a subdomain is the same site.
const { registrable } = require('./audit-redirects.cjs');

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : (process.argv[i + 1] || true);
};

function startChrome() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'media-research-'));
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

async function probe(wsUrl, record) {
  const page = await openPage(wsUrl);
  try {
    await page.send('Network.setUserAgentOverride', { userAgent: UA });
    await page.goto(record.website);
    await new Promise((r) => { setTimeout(r, SETTLE_MS); });
    const seen = await page.eval(() => {
      const text = document.body ? document.body.innerText : '';
      const anchors = [...document.querySelectorAll('a[href]')].map((a) => ({
        text: (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90),
        href: a.href,
      })).filter((a) => a.text && /^https?:/.test(a.href));
      return {
        title: document.title || '',
        head: text.slice(0, 3000),
        textLen: text.length,
        url: location.href,
        anchors,
        // Structural evidence of publishing, gathered where it actually lives.
        feed: !!document.querySelector('link[type="application/rss+xml"], link[type="application/atom+xml"]'),
        articles: document.querySelectorAll('article').length,
        times: document.querySelectorAll('time[datetime]').length,
        ogType: (document.querySelector('meta[property="og:type"]') || {}).content || '',
        lang: document.documentElement.getAttribute('lang') || '',
      };
    });
    const doc = page.requests.find((r) => r.url === seen.url) || page.requests[0] || null;

    // One step further, along links the publisher itself put in its navigation.
    // Same origin only, at most MAX_HOPS, and failures are simply absent —
    // a contact page that will not load is not evidence of anything.
    const deepAnchors = [];
    const origin = (() => { try { return new URL(seen.url).origin; } catch { return null; } })();
    const hops = [];
    for (const a of seen.anchors) {
      if (hops.length >= MAX_HOPS) break;
      if (!SECOND_HOP.some((re) => re.test(a.text))) continue;
      if (!origin || !a.href.startsWith(origin)) continue;
      if (a.href === seen.url || hops.includes(a.href)) continue;
      hops.push(a.href);
    }
    for (const href of hops) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await page.goto(href);
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => { setTimeout(r, 1500); });
        // eslint-disable-next-line no-await-in-loop
        const more = await page.eval(() => [...document.querySelectorAll('a[href]')].map((a) => ({
          text: (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90),
          href: a.href,
        })).filter((a) => a.text && /^https?:/.test(a.href)));
        deepAnchors.push(...more);
      } catch { /* a page that will not load establishes nothing */ }
    }

    return {
      ...seen, deepAnchors, hops, status: doc ? doc.status : 0, error: null,
    };
  } catch (e) {
    return { error: String(e.message || e).slice(0, 160), status: 0 };
  } finally {
    try { await page.close(); } catch { /* already gone */ }
    try { page.ws.close(); } catch { /* already closed */ }
  }
}

// Anchor text decides; the same matcher is used wherever the anchors came from.
// A route is somewhere a person goes to do something. A PDF, a spreadsheet or
// an image is a document about it — fine for a media kit, wrong for an action.
const ASSET = /\.(pdf|docx?|xlsx?|pptx?|zip|jpe?g|png|gif|svg|mp4)(\?|#|$)/i;

function routesFrom(anchors, record, finalUrl) {
  const routes = {};
  const types = new Set();
  for (const spec of ROUTES) {
    for (const a of anchors) {
      if (!spec.text.some((re) => re.test(a.text))) continue;
      if (a.href === record.website || a.href === finalUrl) continue;
      if (spec.field !== 'mediaKitUrl' && ASSET.test(a.href)) continue;
      if (!routes[spec.field]) routes[spec.field] = { text: a.text, href: a.href };
      if (spec.type) types.add(spec.type);
      break;
    }
  }
  return { routes, types: [...types].sort() };
}

function assess(record, obs) {
  if (obs.error || !obs.url) return { state: 'UNRESOLVED', why: obs.error || 'the browser could not open it' };
  const hay = `${obs.title}\n${obs.head}`;
  for (const [re, label] of PARKED) if (re.test(hay)) return { state: 'ONTOLOGY_REJECTED', why: `${label}, not a publication` };
  for (const [re, label] of CHALLENGE) if (re.test(hay)) return { state: 'UNKNOWN_PROTECTED', why: label };
  if (obs.status >= 400) return { state: 'UNKNOWN_PROTECTED', why: `http ${obs.status}` };
  if (obs.textLen < MIN_TEXT) return { state: 'UNRESOLVED', why: `only ${obs.textLen} characters rendered` };

  // Ontology. Structural evidence counts for more than vocabulary, because a
  // feed and dated article markup are things a publication has and an agency
  // brochure does not.
  const signals = [];
  if (obs.feed) signals.push('publishes a feed');
  if (obs.articles >= 3) signals.push(`${obs.articles} article elements`);
  if (obs.times >= 3) signals.push(`${obs.times} datelines`);
  if (PUBLISHING_WORDS.test(hay)) signals.push('masthead vocabulary');
  const agency = AGENCY_WORDS.test(hay);

  // A publication that now answers from a different registrable domain has not
  // simply been verified — its identity has changed. channelfutures.com landed
  // on "Welcome to Channel Dive", and accepting that as ACTIVE_VERIFIED would
  // have recorded a rebrand as a routine confirmation.
  const moved = (() => {
    try {
      return registrable(new URL(record.website).hostname) !== registrable(new URL(obs.url).hostname);
    } catch { return false; }
  })();
  if (moved) {
    return {
      state: 'REDIRECTED',
      why: `${new URL(record.website).hostname} now answers as ${new URL(obs.url).hostname} ("${(obs.title || '').slice(0, 60)}")`,
      to: obs.url,
    };
  }

  // A publication usually says so in its own <title>: "… News", "News on …",
  // "… Magazine". This signal was missing on the first run and both rejections
  // it produced were WRONG — Healthcare IT News and PhocusWire are plainly
  // publications, and an automated verdict deleted them.
  if (/\b(news|magazine|journal|daily|weekly|times|post|wire|report(er)?|gazette|herald|tribune|review)\b/i.test(obs.title || '')) {
    signals.push('the masthead names itself as a publication');
  }

  // Nothing here deletes a record. An ontology classifier that got 2 of 2
  // rejections wrong has not earned the right to remove anything, and `unknown`
  // is a valid final state in this collection. Only an unmistakable parked
  // domain is rejected outright, and that is decided above.
  if (signals.length === 0) {
    return {
      state: 'ONTOLOGY_UNCONFIRMED',
      why: agency ? 'reads as a services business and nothing evidences that it publishes'
        : 'nothing on the page evidences that it publishes',
    };
  }
  if (agency && !obs.feed && obs.articles < 3 && signals.length < 2) {
    return { state: 'ONTOLOGY_UNCONFIRMED', why: `reads as a services business; ${signals.join(', ')} is not enough to settle it` };
  }

  // Routes, from the operator's own words, on the homepage and on the one or
  // two pages it points at for this purpose.
  const { routes, types } = routesFrom(
    [...(obs.anchors || []), ...(obs.deepAnchors || [])], record, obs.url,
  );

  return {
    state: 'ACTIVE_VERIFIED',
    why: signals.join('; '),
    routes,
    opportunityTypes: types,
    scope: obs.lang || null,
  };
}

// The backlog pass asks whether a record is a live publication. The
// actionability pass asks what an ACTIVE publication lets a business do — a
// different question, over a different cohort, and the two are kept apart
// because a record can be settled on one and open on the other.
const ACTIONABILITY = process.argv.includes('--actionability');

async function runProbe() {
  if (!CHROME) { console.error('No Chrome on this machine.'); process.exit(1); }
  const rows = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  let targets = rows.filter((r) => r.currentStatus === 'unknown');

  if (ACTIONABILITY) {
    const ROUTE_FIELDS = ['submissionUrl', 'pitchUrl', 'pressReleaseUrl', 'advertisingUrl'];
    const covered = {};
    for (const r of rows) if (ROUTE_FIELDS.some((f) => r[f])) covered[r.country] = (covered[r.country] || 0) + 1;
    const score = (r) => {
      let s = 0;
      const c = covered[r.country] || 0;
      if (c === 0) s += 40; else if (c <= 2) s += 24; else if (c <= 5) s += 12;
      s += { P1: 30, P2: 18, P3: 6 }[r.priority] || 0;
      if (/browser check is needed/i.test(r.shortNote || '')) s -= 50;
      return s;
    };
    targets = rows
      .filter((r) => r.currentStatus === 'active' && !ROUTE_FIELDS.some((f) => r[f]))
      .map((r) => ({ r, s: score(r) }))
      .sort((a, b) => b.s - a.s || (a.r.id < b.r.id ? -1 : 1))
      .map((x) => x.r);
    console.log(`Media actionability: ${targets.length} active record(s) with no route, ranked.`);
  }
  const limit = arg('--limit');
  if (limit) targets = targets.slice(0, Number(limit));
  const ids = arg('--ids');
  if (ids && ids !== true) {
    const want = new Set(String(ids).split(',').map((s) => s.trim()));
    targets = rows.filter((r) => want.has(r.id));
  }

  console.log(ACTIONABILITY
    ? `Probing ${targets.length} record(s) for operator-published routes.`
    : `Media research: ${targets.length} identification-only record(s).`);
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
        observed: {
          status: obs.status, finalUrl: obs.url || null, title: obs.title || null,
          textLen: obs.textLen || 0, feed: !!obs.feed, articles: obs.articles || 0, times: obs.times || 0,
        },
        ...verdict,
      });
      done += 1;
      if (done % 15 === 0) console.log(`  ${done}/${targets.length}`);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => { setTimeout(r, PACE_MS); });
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  chrome.proc.kill('SIGKILL');

  let merged = findings;
  const OUT = ACTIONABILITY ? ACTIONABILITY_FINDINGS : FINDINGS;
  if (fs.existsSync(OUT)) {
    const prior = JSON.parse(fs.readFileSync(OUT, 'utf8')).findings || [];
    if (prior.length) {
      const fresh = new Map(findings.map((f) => [f.id, f]));
      merged = prior.map((f) => fresh.get(f.id) || f)
        .concat(findings.filter((f) => !prior.some((p) => p.id === f.id)));
    }
  }
  merged.sort((a, b) => (a.id < b.id ? -1 : 1));
  fs.writeFileSync(ACTIONABILITY ? ACTIONABILITY_FINDINGS : FINDINGS, `${JSON.stringify({
    probedAt: new Date().toISOString().slice(0, 10), findings: merged,
  }, null, 1)}\n`);

  const tally = {};
  for (const f of merged) tally[f.state] = (tally[f.state] || 0) + 1;
  console.log('\n', Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' '));
  const withRoutes = merged.filter((f) => f.routes && Object.keys(f.routes).length);
  console.log(`Routes established on ${withRoutes.length} record(s). Nothing merged — rerun with --apply.`);
  try { fs.rmSync(chrome.profile, { recursive: true, force: true }); } catch { /* the OS reaps it */ }
}


// Human research is never replaced, only added to. Every one of these 62
// records already carried a written description — "Dutch management and
// entrepreneurship media. MT and Sprout merged into one title, and both mt.nl
// and sprout.nl now redirect here." — and a first pass overwrote all 62 with a
// procedural sentence. That sentence is worth less than what it deleted, and
// the deletion was silent.
//
// So: drop any procedural sentence a PREVIOUS run of this tool left behind,
// keep everything else, append the new one.
const PROCEDURAL = /^(An automated browser check|Verified in a browser|A browser check)\b/i;

function amend(existing, sentence) {
  const kept = String(existing || '').trim()
    .split(/(?<=\.)\s+/)
    .filter((x) => x && !PROCEDURAL.test(x))
    .join(' ');
  return `${kept} ${sentence}`.replace(/\s+/g, ' ').trim();
}

// A limitation recorded because a fetch could not read the site stops being
// true the moment a browser reads it. Leaving it in place is the contradictory
// note pathology in its original form.
const STALE_LIMITATION = /(reached but behind a bot filter[^.]*\.|a human needs to open it in a browser[^.]*\.)/gi;

function clearStaleLimitation(text) {
  const out = String(text || '').replace(STALE_LIMITATION, '').replace(/\s+/g, ' ').trim();
  return out || null;
}

function runApply() {
  // An actionability run answers "what does this publication let a business
  // do". It must not touch accessibility: a record verified active does not
  // become unknown because a route hunt could not re-confirm the masthead, and
  // Program 11's rule is that one dimension never resets the other.
  const SOURCE = ACTIONABILITY ? ACTIONABILITY_FINDINGS : FINDINGS;
  const { probedAt, findings } = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
  const rows = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const before = JSON.parse(JSON.stringify(rows));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const tally = {
    active: 0, recommendedForReview: 0, redirected: 0, protectedStill: 0, unresolved: 0, routes: 0, types: 0,
  };
  const review = [];

  for (const f of findings) {
    const r = byId.get(f.id);
    if (!r) continue;

    if (ACTIONABILITY) {
      // Routes and types only, and only where nothing is recorded yet: this
      // pass adds knowledge, it does not revise anyone else's.
      const patch = {};
      for (const [field, route] of Object.entries(f.routes || {})) {
        if (!r[field]) { patch[field] = route.href; tally.routes += 1; }
      }
      if (f.opportunityTypes && f.opportunityTypes.length) {
        const known = (r.opportunityTypes || []).filter((t) => t !== 'unknown');
        const merged = [...new Set([...known, ...f.opportunityTypes])].sort();
        if (JSON.stringify(merged) !== JSON.stringify(r.opportunityTypes)) {
          patch.opportunityTypes = merged;
          tally.types += 1;
        }
      }
      if (Object.keys(patch).length) {
        patch.lastVerified = probedAt;
        SAFE.applyPatch(r, patch, { owner: 'actionability', collection: 'media' });
        tally.active += 1;
      }
      continue;
    }

    if (f.state === 'ACTIVE_VERIFIED') {
      SAFE.applyPatch(r, {
        currentStatus: 'active',
        lastVerified: probedAt,
        shortNote: SAFE.amendNote(r.shortNote, `verified in a browser: ${f.why}.`,
          { owner: 'accessibility', date: probedAt }),
        // A limitation recorded because a fetch could not read the site stops
        // being true the moment a browser reads it.
        limitations: SAFE.clearNote(r.limitations, { owner: 'accessibility' }),
      }, { owner: 'accessibility', collection: 'media' });
      tally.active += 1;

      const patch = {};
      for (const [field, route] of Object.entries(f.routes || {})) {
        if (!r[field]) { patch[field] = route.href; tally.routes += 1; }
      }
      if (f.opportunityTypes && f.opportunityTypes.length) {
        patch.opportunityTypes = f.opportunityTypes;
        tally.types += 1;
      }
      const established = ['submissionUrl', 'pitchUrl', 'pressReleaseUrl', 'advertisingUrl']
        .some((field) => r[field] || patch[field]);
      if (!established) {
        patch.limitations = `The homepage and the contact and about pages it links to publish no submission, pitch or press-release route in words, so none is recorded; one may exist deeper in the site and a person would have to find it.`;
      }
      if (Object.keys(patch).length) {
        SAFE.applyPatch(r, patch, { owner: 'actionability', collection: 'media' });
      }
    } else if (f.state === 'ONTOLOGY_REJECTED' || f.state === 'ONTOLOGY_UNCONFIRMED') {
      // NOTHING is deleted here. A classifier that was wrong on two of its
      // first two rejections — Healthcare IT News and PhocusWire are plainly
      // publications — recommends review and no more. Removal needs its own
      // evidenced decision, which this pass does not issue.
      SAFE.applyPatch(r, {
        lastVerified: probedAt,
        shortNote: SAFE.amendNote(r.shortNote,
          `an automated browser check found the site live but could not confirm it publishes (${f.why}); the record stays for review and the status stays unknown.`,
          { owner: 'accessibility', date: probedAt }),
      }, { owner: 'accessibility', collection: 'media' });
      review.push({ id: f.id, name: f.name, website: f.website, why: f.why });
      tally.recommendedForReview += 1;
    } else if (f.state === 'REDIRECTED') {
      SAFE.applyPatch(r, {
        lastVerified: probedAt,
        shortNote: SAFE.amendNote(r.shortNote,
          `an automated browser check found that ${f.why}; a browser check is needed by a person to settle what this record should be, and the status stays unknown.`,
          { owner: 'accessibility', date: probedAt }),
      }, { owner: 'accessibility', collection: 'media' });
      tally.redirected += 1;
    } else {
      const why = f.state === 'UNKNOWN_PROTECTED'
        ? `an automated browser check was refused by the site (${f.why}); a browser check is needed by a person and the status stays unknown.`
        : `an automated browser check did not settle it (${f.why}); a browser check is needed by a person and the status stays unknown.`;
      SAFE.applyPatch(r, {
        lastVerified: probedAt,
        shortNote: SAFE.amendNote(r.shortNote, why, { owner: 'accessibility', date: probedAt }),
      }, { owner: 'accessibility', collection: 'media' });
      if (f.state === 'UNKNOWN_PROTECTED') tally.protectedStill += 1; else tally.unresolved += 1;
    }
  }

  SAFE.assertNoDeletion(before, rows);
  const drift = SAFE.diffFingerprints(SAFE.curatedFingerprint(before), SAFE.curatedFingerprint(rows));
  if (drift.length) throw new Error(`curated fields drifted on: ${drift.join(', ')}`);

  fs.writeFileSync(DATA, `${JSON.stringify(rows, null, 1)}\n`);
  if (review.length) {
    fs.writeFileSync(path.join(ROOT, 'data/media-pr-publishing/.ontology-review.json'),
      `${JSON.stringify({ reviewedAt: probedAt, recommendedForReview: review }, null, 1)}\n`);
  }
  console.log('Merged:', Object.entries(tally).map(([k, v]) => `${k}=${v}`).join(' '));
}

module.exports = { assess, ROUTES, PUBLISHING_WORDS, AGENCY_WORDS };

if (require.main === module) {
  if (process.argv.includes('--apply')) runApply();
  else runProbe().catch((e) => { console.error(e); process.exit(1); });
}
