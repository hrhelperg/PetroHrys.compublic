'use strict';

// DataForSEO — a SECOND opinion, never a substitute for an Ahrefs measurement.
//
// ── WHY THIS MODULE IS DELIBERATELY SMALL ───────────────────────────────────
//
// The Regional Media registry publishes exactly one metric, Domain Rating, and
// it publishes it as an Ahrefs reading. DataForSEO sells its own authority-like
// scores (rank, backlink counts, "domain rank"). Those numbers are computed on
// a different index by a different method, and printing one in a column headed
// "Domain Rating by Ahrefs" would be a fabrication regardless of how close the
// two happen to land. So this module deliberately exposes NO metric accessor.
// It answers two questions only:
//
//   1. Does this host resolve to a real, indexed, non-parked website?
//   2. Does a site: query for this host return results at all?
//
// Both are liveness questions, and liveness is exactly where a direct fetch is
// unreliable: a Cloudflare interstitial, a geo-block, or a JS-only shell all
// look like failure to `fetch` while the site is perfectly alive.
//
// ── COST DISCIPLINE ─────────────────────────────────────────────────────────
//
// DataForSEO bills per task. Calling it for every candidate would cost real
// money to re-derive what an HTTP 200 already proved. `shouldConsult` is the
// gate: it says yes only for candidates whose direct probe was ambiguous —
// a timeout, a TLS error, a 5xx, an empty body, or a block status — and never
// for a candidate that answered cleanly one way or the other.
//
// ── CREDENTIALS ─────────────────────────────────────────────────────────────
//
// DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD are read once, held only in the
// Authorization header of an outbound request, and never returned, logged,
// serialised, cached or written to disk. Every error path below reports a
// STATUS, never the request or its headers. When either variable is absent the
// module reports `configured() === false` and every call returns null, so a run
// without credentials degrades to "no second opinion" rather than to a guess.

const ENDPOINT = 'https://api.dataforseo.com/v3';
const TIMEOUT_MS = 25000;
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [1500, 4000];

// Read fresh on every call. Caching the pair in a module-level constant is how
// a credential ends up in a heap snapshot or a serialised module registry.
function credentials() {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !login.trim() || !password || !password.trim()) return null;
  return { login: login.trim(), password: password.trim() };
}

const configured = () => credentials() !== null;

// A probe result is ambiguous when the network could not settle the question.
// A clean 200 with real text, and an outright DNS failure, are both answers;
// everything in between is worth a paid second look.
const AMBIGUOUS_ERROR = /timeout|socket|ECONNRESET|EPROTO|ETIMEDOUT|certificate|TLS|SSL|fetch failed|network/i;

function shouldConsult(site) {
  if (!site) return true;
  if (site.state === 'live') return false;
  if (site.state === 'redirected') return false;
  if (site.state === 'protected') return true;
  if (site.status && site.status >= 500) return true;
  if (site.status === 404 || site.status === 410) return false;
  if (site.parked) return false;
  return Boolean(site.error && AMBIGUOUS_ERROR.test(String(site.error)));
}

async function post(pathname, payload) {
  const auth = credentials();
  if (!auth) return null;
  const header = `Basic ${Buffer.from(`${auth.login}:${auth.password}`).toString('base64')}`;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      // eslint-disable-next-line no-await-in-loop
      const res = await fetch(`${ENDPOINT}${pathname}`, {
        method: 'POST',
        headers: { Authorization: header, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.status === 401 || res.status === 402 || res.status === 403) {
        // A rejected key, an empty balance and a forbidden endpoint are all
        // decisions the provider has already made. Retrying cannot change one.
        return { ok: false, why: `http ${res.status}` };
      }
      if (!res.ok) {
        if (attempt === MAX_ATTEMPTS) return { ok: false, why: `http ${res.status}` };
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => { setTimeout(resolve, BACKOFF_MS[attempt - 1]); });
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const body = await res.json();
      return { ok: true, body };
    } catch (error) {
      clearTimeout(timer);
      if (attempt === MAX_ATTEMPTS) {
        return { ok: false, why: error.name === 'AbortError' ? 'timeout' : 'network' };
      }
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => { setTimeout(resolve, BACKOFF_MS[attempt - 1]); });
    }
  }
  return { ok: false, why: 'exhausted' };
}

// Google's index is a liveness oracle a firewall cannot mask: a site that
// stopped existing stops returning results for its own host within weeks.
// The reading is recorded as `serpIndexedResults`, a count, and is never
// converted into an authority number.
async function siteIndexed(host) {
  if (!configured()) return null;
  const result = await post('/serp/google/organic/live/advanced', [{
    keyword: `site:${host}`, language_code: 'en', location_code: 2840, depth: 10,
  }]);
  if (!result || !result.ok) {
    return { provider: 'DataForSEO', check: 'serp-site-query', error: (result && result.why) || 'unconfigured' };
  }
  const task = ((result.body || {}).tasks || [])[0] || {};
  const item = ((task.result || [])[0]) || {};
  const count = Number.isInteger(item.se_results_count) ? item.se_results_count
    : Array.isArray(item.items) ? item.items.length : 0;
  return {
    provider: 'DataForSEO',
    check: 'serp-site-query',
    serpIndexedResults: count,
    observedAt: new Date().toISOString().slice(0, 10),
  };
}

module.exports = { configured, shouldConsult, siteIndexed, ENDPOINT };
