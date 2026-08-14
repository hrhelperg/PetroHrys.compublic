#!/usr/bin/env node
// scripts/audit-redirects.cjs
'use strict';

// What happened to a record whose domain now answers as somewhere else.
//
// ── WHY THIS IS NOT "FOLLOW THE REDIRECT AND UPDATE THE URL" ────────────────
//
// A 301 is a fact about DNS and a web server. It is not a fact about a
// business, and the two come apart constantly:
//
//   cylex.be  -> cylex-belgie.be     same operator, per-market domain
//   myhammer.de -> my-hammer.de      same product, punctuation
//   applegate.co.uk -> businessmagnet.co.uk/businessmagnet-acquires-applegate
//                                    one company bought another
//   seedrs.com -> europe.republic.com
//                                    acquired, rebranded, product folded in
//   ziprecruiter.com -> ziprecruiter.ie
//                                    NOTHING happened; this machine is in the EU
//
// Rewriting all five the same way would record three different falsehoods. So
// this tool gathers evidence and classifies; it does not edit the corpus.
//
// ── WHAT IT COLLECTS ────────────────────────────────────────────────────────
//
// The full hop chain, the destination's own identity, whether the destination
// is ALREADY a record here (the duplicate risk), whether the landing page says
// in words that an acquisition happened, and whether the original brand still
// appears on the destination at all.
//
// ── GEOLOCATION IS NOT A CORPORATE EVENT ────────────────────────────────────
//
// A ccTLD swap on the same registrable brand is almost always the site reading
// an IP address. That is a fact about the prober, not the product, and it is
// flagged rather than classified.
//
//   node scripts/audit-redirects.cjs            # audit every known redirect
//   node scripts/audit-redirects.cjs --ids a,b  # a named subset
//
// Nothing in the build, the validator or the test suite invokes this file.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { openPage } = require('./tests/helpers/cdp.cjs');

const ROOT = path.resolve(__dirname, '..');
const SOURCES = [
  { key: 'directories', data: path.join(ROOT, 'data/business-directories/opportunities.json') },
  { key: 'marketplaces', data: path.join(ROOT, 'data/marketplaces/marketplaces.json') },
];
const FINDINGS = path.join(ROOT, 'data/business-directories/.redirect-audit.json');

const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
].find((p) => fs.existsSync(p));

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const SETTLE_MS = 3500;
const PACE_MS = 900;

// Words an operator uses when one company has taken over another. Matched
// against the destination's own page, near the original brand name — a page
// that merely contains "acquired" somewhere in a footer proves nothing.
const ACQUISITION = /\b(acquir(e|ed|es|ing|isition)|has joined|now part of|merged with|taken over by|is now)\b/i;

const TWO_LEVEL = new Set([
  'co.uk', 'org.uk', 'me.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au',
  'co.nz', 'com.br', 'com.mx', 'com.ar', 'co.jp', 'co.kr', 'co.in', 'co.za',
  'com.sg', 'com.my', 'com.hk', 'com.tw', 'com.tr', 'com.cn', 'com.ua', 'com.pl',
  'com.ph', 'com.vn', 'co.id', 'com.eg', 'com.sa', 'com.ng', 'co.ke', 'com.pk',
  'com.cy', 'com.mt', 'co.il', 'com.co', 'com.pe', 'com.ve', 'com.do', 'com.ec',
  'com.uy', 'com.py', 'com.bo', 'com.gt', 'com.pa', 'co.tt', 'co.zm', 'co.zw',
  'co.bw', 'co.tz', 'com.na', 'com.lb', 'com.eg',
]);

function registrable(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^www\./, '');
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  const lastTwo = parts.slice(-2).join('.');
  return TWO_LEVEL.has(lastTwo) ? parts.slice(-3).join('.') : lastTwo;
}

// The brand part of a registrable domain: cylex.be and cylex-belgie.be share
// "cylex", which is what makes them a family rather than a departure.
function brandOf(hostname) {
  const label = registrable(hostname).split('.')[0];
  return label.replace(/[^a-z0-9]/g, '');
}

function tldOf(hostname) {
  const r = registrable(hostname);
  return r.slice(r.indexOf('.'));
}

function startChrome() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'redirect-audit-'));
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

async function visit(wsUrl, url, originalName) {
  const page = await openPage(wsUrl);
  try {
    await page.send('Network.setUserAgentOverride', { userAgent: UA });
    await page.goto(url);
    await new Promise((r) => { setTimeout(r, SETTLE_MS); });
    const seen = await page.eval((brand) => {
      const text = document.body ? document.body.innerText : '';
      // Does the destination still speak the original brand's name, and if so,
      // in a sentence that explains what happened to it?
      const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
      const mentions = brand
        ? lines.filter((l) => l.toLowerCase().includes(brand.toLowerCase())).slice(0, 6)
        : [];
      return {
        title: document.title || '',
        head: text.slice(0, 2000),
        textLen: text.length,
        url: location.href,
        mentions,
      };
    }, originalName);
    return { ...seen, chain: page.redirects.slice(), error: null };
  } catch (e) {
    return { error: String(e.message || e).slice(0, 160), chain: [], url: null };
  } finally {
    try { await page.close(); } catch { /* already gone */ }
    try { page.ws.close(); } catch { /* already closed */ }
  }
}

// The classification. Evidence in, one label out, and UNRESOLVED whenever the
// evidence does not actually decide it.
function classify(record, obs, corpusByHost) {
  if (obs.error || !obs.url) return { state: 'UNRESOLVED', why: obs.error || 'the browser could not open it' };

  const fromHost = new URL(record.website).hostname;
  const toHost = new URL(obs.url).hostname;
  const fromReg = registrable(fromHost);
  const toReg = registrable(toHost);

  if (fromReg === toReg) {
    return { state: 'NO_CHANGE', why: 'the destination is the same registrable domain', to: obs.url };
  }

  const sameBrand = brandOf(fromHost) && brandOf(toHost)
    && (brandOf(toHost).startsWith(brandOf(fromHost)) || brandOf(fromHost).startsWith(brandOf(toHost)));

  // Geolocation has a direction: a GENERIC domain hands you off to a country
  // one, because it read your IP. The reverse — a country domain moving to
  // .com — is a business consolidating onto a global name, which is a real
  // change to record. Treating both as geolocation would have written off
  // reklama5.mk -> reklama5.com as an artefact of where this machine sits.
  const GENERIC = /^\.(com|net|org|io|co)$/;
  if (sameBrand && brandOf(fromHost) === brandOf(toHost) && tldOf(fromHost) !== tldOf(toHost)) {
    if (GENERIC.test(tldOf(fromHost)) && !GENERIC.test(tldOf(toHost))) {
      return { state: 'GEOLOCATED', why: `${fromReg} served ${toReg} to this prober's location`, to: obs.url };
    }
    return { state: 'DOMAIN_MOVE', why: `same brand, moved from ${fromReg} to ${toReg}`, to: obs.url };
  }

  if (sameBrand) {
    return { state: 'DOMAIN_MOVE', why: `same brand on a new domain (${fromReg} -> ${toReg})`, to: obs.url };
  }

  // A different brand answering. Does its own page say why?
  const mention = (obs.mentions || []).find((l) => ACQUISITION.test(l));
  const alreadyHere = corpusByHost.get(toReg) || null;
  if (mention) {
    return {
      state: 'ACQUISITION',
      why: `${toReg} states it: "${mention.slice(0, 120)}"`,
      to: obs.url,
      duplicateOf: alreadyHere,
    };
  }
  return {
    state: 'REBRAND_OR_ACQUISITION',
    why: `${toReg} answers for ${fromReg} but does not say why on the landing page`,
    to: obs.url,
    duplicateOf: alreadyHere,
  };
}

async function main() {
  if (!CHROME) { console.error('No Chrome on this machine.'); process.exit(1); }

  const corpusByHost = new Map();
  const targets = [];
  for (const src of SOURCES) {
    const rows = JSON.parse(fs.readFileSync(src.data, 'utf8'));
    for (const r of rows) {
      try { corpusByHost.set(registrable(new URL(r.website).hostname), `${src.key}:${r.id}`); } catch { /* skip */ }
    }
    for (const r of rows) {
      if (/no longer established|browser check on .* found that/i.test(r.note || '')) {
        targets.push({ ...r, collection: src.key });
      }
    }
  }

  // Named records are selected from every collection, not from the queue that
  // note wording happens to build. "Audit exactly these" has to mean that:
  // filtering the queue would silently audit nothing and report success, which
  // is what happened when thirteen redirects found by the actionability pass
  // carried wording this filter did not recognise.
  const ids = process.argv.indexOf('--ids');
  let list = targets;
  if (ids !== -1 && process.argv[ids + 1]) {
    const want = new Set(process.argv[ids + 1].split(',').map((s) => s.trim()));
    const everything = [];
    for (const src of SOURCES) {
      for (const r of JSON.parse(fs.readFileSync(src.data, 'utf8'))) {
        everything.push({ ...r, collection: src.key });
      }
    }
    list = everything.filter((r) => want.has(r.id));
  }

  console.log(`Redirect audit: ${list.length} record(s).`);
  const chrome = await startChrome();
  const findings = [];
  for (const record of list) {
    // eslint-disable-next-line no-await-in-loop
    const obs = await visit(chrome.wsUrl, record.website, record.name);
    const verdict = classify(record, obs, corpusByHost);
    findings.push({
      id: record.id,
      collection: record.collection,
      name: record.name,
      website: record.website,
      country: record.country,
      chain: (obs.chain || []).map((h) => `${h.status} ${h.from} -> ${h.to}`),
      finalUrl: obs.url || null,
      finalTitle: obs.title || null,
      mentionsOriginal: (obs.mentions || []).slice(0, 3),
      ...verdict,
    });
    console.log(`  ${String(verdict.state).padEnd(24)}${record.id}`);
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { setTimeout(r, PACE_MS); });
  }
  chrome.proc.kill('SIGKILL');

  // A subset run REPLACES what it re-examined and keeps the rest. Writing a
  // partial run over a full one deletes verified classifications silently,
  // which is the one failure mode this whole audit exists to prevent.
  let merged = findings;
  if (fs.existsSync(FINDINGS)) {
    const prior = JSON.parse(fs.readFileSync(FINDINGS, 'utf8')).findings || [];
    if (prior.length > findings.length) {
      const fresh = new Map(findings.map((f) => [f.id, f]));
      merged = prior.map((f) => fresh.get(f.id) || f)
        .concat(findings.filter((f) => !prior.some((p) => p.id === f.id)));
      console.log(`Merged ${findings.length} fresh into ${prior.length} existing.`);
    }
  }

  merged.sort((a, b) => (a.id < b.id ? -1 : 1));
  fs.writeFileSync(FINDINGS, `${JSON.stringify({
    auditedAt: new Date().toISOString().slice(0, 10), findings: merged,
  }, null, 1)}\n`);

  const tally = {};
  for (const f of merged) tally[f.state] = (tally[f.state] || 0) + 1;
  console.log('\n', Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' '));
  console.log(`Written to ${path.relative(ROOT, FINDINGS)}. Nothing changed — classification is a human call.`);
  try { fs.rmSync(chrome.profile, { recursive: true, force: true }); } catch { /* the OS will reap it */ }
}

module.exports = { classify, registrable, brandOf, tldOf };

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
