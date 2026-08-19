#!/usr/bin/env node
// scripts/research-domain-rating.cjs
'use strict';

// Asking Ahrefs what a domain's Domain Rating is, once per domain.
//
// ── WHAT THIS MEASURES, AND WHAT IT DOES NOT ────────────────────────────────
//
// Domain Rating is Ahrefs' 0-100 measure of a site's backlink profile strength.
// It is not a quality judgement, not an accessibility fact and not a price, and
// this pass writes none of those. It writes one number, the domain it was
// measured on, who produced it and when.
//
// ── ONE REQUEST PER DOMAIN, NOT ONE PER RECORD ──────────────────────────────
//
// 3042 canonical records sit on 2896 distinct domains. Encuentra24 alone
// carries six country records because a business in Panama and a business in
// Costa Rica each need to be told about their own market — and all six would
// receive the same number from one request. Records are grouped by target and
// the answer is projected back, so 146 requests are never made.
//
// ── FAILURE IS NOT A ZERO ───────────────────────────────────────────────────
//
// DR 0 is a real measurement: a domain with no backlink profile worth counting
// scores 0, and saying so is useful. A timeout, a 429, a revoked key or a plan
// without entitlement is not a measurement at all. The two must never converge,
// so every failure path here produces UNRESOLVED and no value, and the applier
// refuses to write a number it was not given.
//
//   node scripts/research-domain-rating.cjs --inventory   # what would be asked
//   node scripts/research-domain-rating.cjs               # ask, resumably
//   node scripts/research-domain-rating.cjs --refresh     # re-ask stale targets
//   node scripts/research-domain-rating.cjs --report
//   node scripts/research-domain-rating.cjs --apply       # write canonical facts
//
// Nothing in the build, the validator or the test suite invokes the network
// paths of this file.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CK = require('./lib/rc-checkpoint.cjs');
const SAFE = require('./lib/rc-safe-apply.cjs');
const INV = require('./lib/rc-domain-inventory.cjs');

const FINDINGS = path.join(ROOT, 'data/domain-rating/.ahrefs-domain-rating.json');

const PROVIDER = 'Ahrefs';

// ── WHICH ENDPOINT, AND WHY THIS ONE ────────────────────────────────────────
//
// Ahrefs publishes Domain Rating twice.
//
//   /v3/site-explorer/domain-rating   the full one. Plan-gated: it answers only
//                                     for eligible paid subscriptions, and this
//                                     key gets 401 from it. It also takes a
//                                     `date`, so it can answer historically.
//
//   /v3/public/domain-rating-free     the public one. Free, consumes no API
//                                     units, needs nothing but an API key —
//                                     and returns the same figure for today.
//
// The public endpoint is what this pass uses. It answers, it costs nothing, and
// V1 needs current DR rather than history. The first draft of this file called
// the gated endpoint and additionally sent `protocol=both`, a parameter that
// does not exist on either DR endpoint — it belongs to sibling Site Explorer
// endpoints — so the request was wrong twice over.
const API = 'https://api.ahrefs.com/v3/public/domain-rating-free';

// Where the licence that governs displaying this data lives. The attribution
// it requires is rendered next to every value; see rc-domain-rating.cjs.
const LICENSE_URL = 'https://ahrefs.com/legal/domain-rating-license';

// ── FRESHNESS ───────────────────────────────────────────────────────────────
//
// Ninety days.
//
// Domain Rating moves slowly — it is a logarithmic measure of a backlink
// profile, and a site that gains a hundred referring domains in a month
// typically moves a point or two. Re-asking 2896 domains monthly would cost
// three times as much for a difference no reader could act on, and this corpus
// is not a rank tracker. Quarterly keeps every published figure inside one
// season of its measurement while asking the provider four times a year.
//
// The number is never presented as timeless: the measured date travels with it
// and is shown beside it.
const FRESH_DAYS = 90;

// ── REQUEST SAFETY ──────────────────────────────────────────────────────────
//
// Bounded, and deliberately unhurried. A research pass that hammers a paid API
// on failure turns one broken afternoon into a rate-limit ban, and the whole
// point of the checkpoint is that stopping early is cheap.
//
// Ahrefs documents a default cap of 60 requests per minute and additionally
// throttles dynamically under load, returning 429 for both. There is no
// Retry-After header and no documented algorithm, so the pace is set below the
// cap rather than at it — 50 a minute leaves headroom for the throttle — and a
// 429 backs off exponentially with jitter so a fleet of retries cannot
// resynchronise into a second burst.
const TIMEOUT_MS = 20000;
const PACE_MS = 1200;
const MAX_ATTEMPTS = 4;
const BACKOFF_MS = [1000, 2000, 4000];

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : (process.argv[i + 1] || true);
};

// The key is read once, never logged, never stored and never returned. Every
// error path below reports the STATUS, not the request.
function apiKey() {
  const key = process.env.AHREFS_API_KEY;
  if (!key || !key.trim()) return null;
  return key.trim();
}

const today = () => new Date().toISOString().slice(0, 10);

// Full jitter. Without it every retry in a run that hit one throttle window
// comes back at the same instant and reproduces the burst that caused it.
const jitter = (ms) => Math.round(ms * (0.5 + Math.random() * 0.5));

// ── ONE REQUEST ─────────────────────────────────────────────────────────────

async function askAhrefs(target, key) {
  // The public endpoint takes `target` and `output`. It has no `date`: it
  // answers for today, which is exactly what checkedAt then records.
  const url = `${API}?target=${encodeURIComponent(target)}&output=json`;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res;
    try {
      // eslint-disable-next-line no-await-in-loop
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      const transport = e && e.name === 'AbortError' ? `timeout after ${TIMEOUT_MS}ms` : `network: ${e.message}`;
      if (attempt === MAX_ATTEMPTS) return { ok: false, why: transport, retryable: true };
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => { setTimeout(r, jitter(BACKOFF_MS[attempt - 1])); });
      continue;
    }
    clearTimeout(timer);

    // 429 and 5xx are worth one more try; 401/403 are a decision the provider
    // has already made, and repeating the request cannot change it.
    if (res.status === 429 || res.status >= 500) {
      if (attempt === MAX_ATTEMPTS) return { ok: false, why: `http ${res.status}`, retryable: true };
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => { setTimeout(r, jitter(BACKOFF_MS[attempt - 1])); });
      continue;
    }
    // 401 and 403 are inverted from the usual REST convention here: a MISSING
    // Authorization header returns 403 and a REJECTED key returns 401. Neither
    // is worth retrying, and neither is a measurement.
    if (res.status === 401) {
      return { ok: false, why: 'http 401: the key was rejected for this endpoint', retryable: false };
    }
    if (res.status === 403) {
      // eslint-disable-next-line no-await-in-loop
      const body = await res.text().catch(() => '');
      const reason = /insufficient plan/i.test(body) ? 'the plan does not include this endpoint' : 'forbidden';
      return { ok: false, why: `http 403: ${reason}`, retryable: false };
    }
    if (!res.ok) return { ok: false, why: `http ${res.status}`, retryable: false };

    let body;
    try {
      // eslint-disable-next-line no-await-in-loop
      body = await res.json();
    } catch {
      return { ok: false, why: 'the response was not JSON', retryable: false };
    }
    // Defensive about shape rather than trusting one nesting: a provider that
    // changes its envelope must produce UNRESOLVED, never a silent zero.
    // Both DR endpoints nest the number inside an object of the same name:
    // { "domain_rating": { "domain_rating": 93.0, "license": "..." } }.
    const raw = body && body.domain_rating
      ? (body.domain_rating.domain_rating ?? body.domain_rating)
      : body && body.domainRating;
    const value = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      return { ok: false, why: 'the response carried no usable domain rating', retryable: false };
    }
    return { ok: true, domainRating: Math.round(value) };
  }
  return { ok: false, why: 'exhausted attempts', retryable: true };
}

// ── TARGETS ─────────────────────────────────────────────────────────────────

function stale(finding) {
  if (!finding || finding.state !== 'MEASURED' || !finding.checkedAt) return true;
  const age = (Date.parse(today()) - Date.parse(finding.checkedAt)) / 86400000;
  return !Number.isFinite(age) || age >= FRESH_DAYS;
}

function targets() {
  const inv = INV.inventory();
  return inv.targets.map((target) => ({
    target,
    key: `ahrefs|domain-rating|${target}`,
    records: inv.byTarget.get(target).map((r) => ({ collection: r.collection, id: r.id })),
  }));
}

// ── RUN ─────────────────────────────────────────────────────────────────────

async function runProbe() {
  const key = apiKey();
  if (!key) {
    console.error('AHREFS_API_KEY is not set. Research needs it; the build never does.');
    process.exit(1);
  }
  const ledger = new CK.Ledger(FINDINGS);
  if (ledger.recovered) {
    console.log(`Recovered ${ledger.recovered} finding(s) from an interrupted run's journal.`);
  }
  const refresh = process.argv.includes('--refresh');
  let list = targets();
  const answered = list.filter((t) => ledger.has(t.key)).length;
  list = list.filter((t) => {
    const had = ledger.get(t.key);
    if (!had) return true;
    // A measured value is left alone until it is stale. An unresolved one is
    // re-asked, because the reason it failed may have been this machine.
    if (had.state === 'MEASURED') return refresh && stale(had);
    return true;
  });
  const limit = arg('--limit');
  if (limit) list = list.slice(0, Number(limit));

  console.log(`Domain Rating: ${list.length} target(s) to ask `
    + `(${answered} already answered, ${ledger.size()} finding(s) on disk).`);
  if (!list.length) { report(ledger.all()); return; }

  CK.onInterrupt(ledger, 'Domain Rating');
  let done = 0;
  let halted = null;
  for (const t of list) {
    // eslint-disable-next-line no-await-in-loop
    const res = await askAhrefs(t.target, key);
    ledger.record(res.ok
      ? {
        key: t.key,
        target: t.target,
        provider: PROVIDER,
        state: 'MEASURED',
        domainRating: res.domainRating,
        checkedAt: today(),
        records: t.records,
      }
      : {
        key: t.key,
        target: t.target,
        provider: PROVIDER,
        state: 'UNRESOLVED',
        why: res.why,
        attemptedAt: today(),
        records: t.records,
      });
    done += 1;
    if (done % 50 === 0) console.log(`  ${done}/${list.length}`);
    // A key the provider will not accept will not be accepted 2896 times
    // either. Stopping on the first is the difference between a wasted minute
    // and a wasted hour, and the checkpoint keeps everything already learned.
    if (!res.ok && res.retryable === false && /http 40[13]/.test(res.why)) { halted = res.why; break; }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { setTimeout(r, PACE_MS); });
  }
  const kept = ledger.compact({ probedAt: today(), provider: PROVIDER, freshDays: FRESH_DAYS });
  if (halted) {
    console.log(`\nStopped after ${done} target(s): ${halted}.`);
    console.log('Every target still reads UNRESOLVED, which is the truthful state — '
      + 'a provider that will not answer has not told us the rating is zero.');
  }
  console.log(`${kept} finding(s) on disk.`);
  report(ledger.all());
}

function report(findings) {
  const tally = {};
  for (const f of findings) tally[f.state] = (tally[f.state] || 0) + 1;
  console.log('\nDOMAIN RATING LEDGER');
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(5)}  ${k}`);
  }
  const measured = findings.filter((f) => f.state === 'MEASURED');
  if (!measured.length) return;
  const BANDS = [[0, 0], [1, 9], [10, 19], [20, 29], [30, 39], [40, 49],
    [50, 59], [60, 69], [70, 79], [80, 89], [90, 100]];
  console.log('  distribution:');
  for (const [lo, hi] of BANDS) {
    const n = measured.filter((f) => f.domainRating >= lo && f.domainRating <= hi).length;
    if (n) console.log(`    ${(lo === hi ? String(lo) : `${lo}-${hi}`).padStart(6)}  ${n}`);
  }
  const why = {};
  for (const f of findings.filter((x) => x.state === 'UNRESOLVED')) why[f.why] = (why[f.why] || 0) + 1;
  if (Object.keys(why).length) {
    console.log('  unresolved because:');
    for (const [k, v] of Object.entries(why).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${String(v).padStart(5)}  ${k}`);
    }
  }
}

// ── APPLY ───────────────────────────────────────────────────────────────────
//
// One measurement per domain, projected onto every record that sits on it.
//
// Six records share encuentra24.com and all six receive the same number, the
// same provider, the same measured domain and the same date — which is what the
// registry's shared-domain validator already demands, and the reason it demands
// it: one domain has one rating, and records carrying different figures for it
// would be reporting a disagreement that does not exist. The records themselves
// stay six records. A rating is metadata about a domain, never an identity.
//
// A target with no measurement writes NOTHING. Not zero, not null-with-
// provenance, not a placeholder: the record is left exactly as it was, so a
// failed request is indistinguishable from never having asked, which is the
// truth of it.

// The status comes from the schema so there is one spelling of it in the
// repository; a research pass inventing its own would sail past the validator.
const PROVENANCE_STATUS = require('./lib/bd-schema.cjs').METRIC_READING_STATUS;

function provenanceFor(finding) {
  return {
    provider: PROVIDER,
    measuredAt: finding.checkedAt,
    status: PROVENANCE_STATUS,
    measuredDomain: finding.target,
  };
}

// Idempotence is decided by comparing what is already stored with what would be
// written, field by field — not by a timestamp. The date written is the date the
// provider was asked, which lives in the finding, so applying the same findings
// twice cannot produce a different byte.
function sameSnapshot(record, value, prov) {
  if (record.domainRating !== value) return false;
  const cur = (record.metricsProvenance || {}).domainRating;
  if (!cur) return false;
  return cur.provider === prov.provider && cur.measuredAt === prov.measuredAt
    && cur.status === prov.status && cur.measuredDomain === prov.measuredDomain;
}

function runApply() {
  const ledger = new CK.Ledger(FINDINGS);
  ledger.compact();
  const measured = new Map();
  for (const f of ledger.all()) if (f.state === 'MEASURED') measured.set(f.target, f);
  if (!measured.size) {
    console.log('No measured findings to apply.');
    return;
  }

  const tally = { written: 0, unchanged: 0, noMeasurement: 0 };
  for (const [name, C] of Object.entries(INV.COLLECTIONS)) {
    const files = C.file
      ? [C.file]
      : fs.readdirSync(C.registry).filter((f) => f.endsWith('.json'))
        .sort().map((f) => path.join(C.registry, f));

    for (const file of files) {
      const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!Array.isArray(rows) || !rows.length) continue;
      const before = JSON.parse(JSON.stringify(rows));
      let touched = false;

      for (const r of rows) {
        const target = INV.normaliseDomain(r[C.urlField]);
        const f = target && measured.get(target);
        if (!f) { tally.noMeasurement += 1; continue; }
        const prov = provenanceFor(f);
        if (sameSnapshot(r, f.domainRating, prov)) { tally.unchanged += 1; continue; }
        SAFE.applyPatch(r, {
          domainRating: f.domainRating,
          metricsProvenance: { ...(r.metricsProvenance || {}), domainRating: prov },
        }, { owner: 'metrics', collection: name });
        tally.written += 1;
        touched = true;
      }

      if (!touched) continue;
      SAFE.assertNoDeletion(before, rows);
      const drift = SAFE.diffFingerprints(SAFE.curatedFingerprint(before), SAFE.curatedFingerprint(rows));
      if (drift.length) throw new Error(`${file}: curated fields drifted on ${drift.join(', ')}`);
      fs.writeFileSync(file, `${JSON.stringify(rows, null, 1)}\n`);
    }
  }
  console.log('Applied:', Object.entries(tally).map(([k, v]) => `${k}=${v}`).join(' '));
}

function runInventory() {
  const s = INV.summary();
  console.log(JSON.stringify(s, null, 1));
  const ledger = new CK.Ledger(FINDINGS);
  const measured = ledger.all().filter((f) => f.state === 'MEASURED').length;
  console.log(`\nmeasured targets on disk: ${measured} of ${s.uniqueTargets}`);
  ledger.close();
}

module.exports = {
  FINDINGS, PROVIDER, FRESH_DAYS, API, LICENSE_URL,
  targets, stale, report, askAhrefs, apiKey, runApply, PROVENANCE_STATUS, provenanceFor,
};

if (require.main === module) {
  if (process.argv.includes('--apply')) runApply();
  else if (process.argv.includes('--inventory')) runInventory();
  else if (process.argv.includes('--report')) report(new CK.Ledger(FINDINGS).all());
  else runProbe().catch((e) => { console.error(e.message); process.exit(1); });
}
