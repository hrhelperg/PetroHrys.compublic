'use strict';

// Tender Opportunity Intelligence v1 — the ONLY place this project talks to
// the network.
//
// ── WHERE THIS MODULE MAY BE LOADED ─────────────────────────────────────────
//
// From scripts/ingest-tender-opportunities.cjs, and nowhere else. The site
// build reads a committed snapshot and must keep working when every
// procurement API in the pilot is down, mid-migration, or has revoked access.
// A test asserts that no build script reaches this module, directly or
// transitively, because "we only meant to fetch during ingestion" is a
// property that decays the first time someone adds a convenient import.
//
// ── RATE DISCIPLINE ─────────────────────────────────────────────────────────
//
// Every request is sequential. There is no concurrency here, on purpose: the
// pilot's five sources are public infrastructure funded by taxpayers, and the
// throughput this project needs — a few thousand records once a day — does not
// justify parallel pressure on any of them.
//
// Retries are bounded and exponential, and a 4xx is never retried: a 403 or a
// 400 is an answer, and hammering it is how a polite client becomes an abusive
// one. There is no infinite retry anywhere in this file.

const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 1000;
const DEFAULT_TIMEOUT_MS = 60000;
const MIN_GAP_MS = 250; // floor between any two requests, all sources

// datos.gov.co publishes Crawl-delay: 1. find-tender returned 429 during the
// pilot at a 250 ms cadence, which is the service telling us its rate — so it
// gets a second, honoured the same way. Per host, so respecting one source
// does not slow the others.
const HOST_MIN_GAP_MS = {
  'www.datos.gov.co': 1000,
  'www.find-tender.service.gov.uk': 1500,
};

const USER_AGENT = 'PetroHrys-Research/1.0 (+https://petrohrys.com/research/; procurement opportunity index; contact via site)';

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

const lastRequestAt = new Map();

async function pace(host) {
  const gap = HOST_MIN_GAP_MS[host] || MIN_GAP_MS;
  const last = lastRequestAt.get(host) || 0;
  const wait = last + gap - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt.set(host, Date.now());
}

class HttpError extends Error {
  constructor(status, url, body) {
    super(`HTTP ${status} for ${url}`);
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

// One request, with pacing, bounded retry and a hard timeout.
//
// Returns { status, headers, text }. Non-2xx throws HttpError — the caller
// decides whether that is fatal, and for this pilot it always is, because
// fail-closed beats a half-ingested snapshot (see Part 28 / to-snapshot.cjs).
async function request(url, { method = 'GET', headers = {}, body = null, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const host = new URL(url).host;
  let lastErr = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    await pace(host);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...headers },
        body,
        signal: controller.signal,
        redirect: 'follow',
      });
      const text = await res.text();
      if (res.ok) return { status: res.status, headers: res.headers, text };

      const err = new HttpError(res.status, url, text.slice(0, 500));
      // A client error is a decision by the server. Do not argue with it.
      if (res.status >= 400 && res.status < 500 && res.status !== 429) throw err;
      lastErr = err;
    } catch (e) {
      if (e instanceof HttpError && e.status >= 400 && e.status < 500 && e.status !== 429) throw e;
      lastErr = e;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < MAX_ATTEMPTS) await sleep(BASE_BACKOFF_MS * (2 ** (attempt - 1)));
  }
  throw lastErr;
}

async function getJson(url, opts) {
  const res = await request(url, opts);
  try {
    return JSON.parse(res.text);
  } catch {
    throw new Error(`Response from ${url} was not JSON (${res.text.slice(0, 200)})`);
  }
}

async function postJson(url, payload, opts) {
  const res = await request(url, {
    ...opts,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(opts && opts.headers) },
    body: JSON.stringify(payload),
  });
  try {
    return JSON.parse(res.text);
  } catch {
    throw new Error(`Response from ${url} was not JSON (${res.text.slice(0, 200)})`);
  }
}

// Binary-safe retrieval. Germany publishes OCDS only as a ZIP, and decoding
// those bytes as UTF-8 — which every other helper here does — silently
// corrupts the archive rather than failing. Kept separate so the text helpers
// stay simple and nobody has to remember which one is safe for binary.
async function getBuffer(url, { headers = {}, timeoutMs = 90000 } = {}) {
  const host = new URL(url).host;
  let lastErr = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    await pace(host);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // eslint-disable-next-line no-await-in-loop
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, ...headers },
        signal: controller.signal,
        redirect: 'follow',
      });
      if (!res.ok) {
        const err = new HttpError(res.status, url, '');
        if (res.status >= 400 && res.status < 500 && res.status !== 429) throw err;
        lastErr = err;
      } else {
        // eslint-disable-next-line no-await-in-loop
        const buf = Buffer.from(await res.arrayBuffer());
        // ── TRUNCATION ────────────────────────────────────────────────────
        //
        // A connection dropped at 60% delivers a valid Buffer holding 60% of a
        // file. For a CSV that parses cleanly and looks exactly like a quiet
        // week at the procurement office; for a ZIP it fails loudly, which is
        // why this went unnoticed until a 251 MB CSV joined the registry.
        //
        // The server states a length. Comparing against it is the only check
        // that can tell a short file from a small one — no heuristic about
        // record counts can, because both shapes are "fewer records".
        //
        // Enforced only when the body arrived unencoded: with Content-Encoding
        // the declared length describes the compressed stream while `buf`
        // holds the decompressed bytes, and comparing them would reject every
        // gzipped response.
        const declared = Number(res.headers.get('content-length'));
        const encoded = res.headers.get('content-encoding');
        if (!encoded && Number.isFinite(declared) && declared > 0 && buf.length !== declared) {
          throw new Error(`Truncated response from ${url}: received ${buf.length} bytes, `
            + `server declared ${declared}`);
        }
        return buf;
      }
    } catch (e) {
      if (e instanceof HttpError && e.status >= 400 && e.status < 500 && e.status !== 429) throw e;
      lastErr = e;
    } finally {
      clearTimeout(timer);
    }
    // eslint-disable-next-line no-await-in-loop
    if (attempt < MAX_ATTEMPTS) await sleep(BASE_BACKOFF_MS * (2 ** (attempt - 1)));
  }
  throw lastErr;
}

async function getText(url, opts) {
  const res = await request(url, { ...opts, headers: { Accept: 'text/csv, */*', ...(opts && opts.headers) } });
  return res.text;
}

module.exports = {
  HttpError, request, getJson, postJson, getText, getBuffer,
  MAX_ATTEMPTS, BASE_BACKOFF_MS, USER_AGENT, HOST_MIN_GAP_MS,
};
