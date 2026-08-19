'use strict';

// A real browser, driven over the Chrome DevTools Protocol.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// The Distribution Planner shipped with 101 passing Node tests, a byte-identity
// guard between the server engine and the shipped one, and server/client parity
// proven over 96 campaign states — and it did not work in a browser. Every one
// of those tests ran the client under `node:vm` against a hand-written DOM
// shim, and a shim models the DOM you remembered to model. It cannot fail on a
// module that never loaded, a path that resolves differently under /de/, a
// global that is not where the consumer looks for it, or an exception thrown
// before the first listener is attached.
//
// So this harness makes no DOM. It starts the actual Chrome on this machine,
// loads the actual generated page over HTTP, and asks the page what happened.
//
// No dependency: Chrome speaks CDP over a WebSocket and Node has had a global
// WebSocket since v22, so the whole driver is this file.

const { spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

function chromePath() {
  for (const p of CHROME_CANDIDATES) if (fs.existsSync(p)) return p;
  return null;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
};

// Serves the generated tree the way Netlify does: a directory resolves to its
// index.html. Nothing is rewritten — the bytes a user receives are the bytes
// under test.
//
// ── WHY THE BYTES ARE FROZEN ON FIRST READ ──────────────────────────────────
//
// Twenty-odd test files invoke generators, and generators rewrite the very
// pages this server hands to Chrome. Under `node --test` those files run
// concurrently with the browser suites, so a page could be rebuilt between the
// moment a test computed what it expected and the moment the browser rendered
// it. The suite failed once, then not at all, then six times, on identical
// input — and every affected test passed when run alone.
//
// So each path is read once and cached for the lifetime of this server. A
// browser test then sees one consistent tree from its first request to its
// last, whatever else the suite is doing to the working directory. The cache
// dies with the server, so a later test still gets current bytes.
//
// This is isolation rather than serialisation: nothing is forced to wait, and
// the production generators are untouched.
// `preload` freezes a set of paths TOGETHER, before the browser starts.
//
// Freezing each file at its own first request keeps one page stable, but a test
// that compares several pages with each other can still straddle a rebuild: the
// English planner read at one moment and the German one a second later are two
// different generations, and the locale-parity test failed on exactly that.
// Pages compared with one another have to come from one generation.
function serve(root, preload = []) {
  const snapshot = new Map();
  // A directory preloads WHOLLY, and the whole set is read until it is STABLE.
  //
  // Freezing index.html alone was not enough — the planner fetches its data
  // separately and planner-data.json is rebuilt by the same generators — and
  // freezing whole directories was not enough either, because a generator
  // writes locales one after another. A snapshot taken mid-write preserves the
  // inconsistency it found: English already rebuilt, French not yet, and the
  // locale-parity test reports a product disagreement that never existed.
  //
  // So the set is read repeatedly until two consecutive passes are identical.
  // That is a consistent generation by construction rather than by luck.
  const readSet = () => {
    const out = new Map();
    const take = (file) => {
      try { out.set(file, fs.readFileSync(file)); } catch { out.set(file, null); }
    };
    for (const rel of preload) {
      const target = path.join(root, rel);
      let isDir = false;
      try { isDir = fs.statSync(target).isDirectory(); } catch { isDir = false; }
      if (isDir) {
        let names = [];
        try { names = fs.readdirSync(target).sort(); } catch { names = []; }
        for (const name of names) {
          const file = path.join(target, name);
          try { if (fs.statSync(file).isFile()) take(file); } catch { /* vanished mid-read */ }
        }
      } else {
        take(path.join(root, rel.endsWith('/') ? `${rel}index.html` : rel));
      }
    }
    return out;
  };

  const digest = (m) => [...m.entries()]
    .map(([k, v]) => `${k}:${v ? v.length : 'x'}:${v ? v.subarray(0, 64).toString('hex') : ''}`)
    .join('|');

  if (preload.length) {
    let current = readSet();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const again = readSet();
      if (digest(again) === digest(current)) { current = again; break; }
      current = again;
    }
    for (const [file, body] of current) {
      snapshot.set(file, body ? { body } : { missing: true });
    }
  }

  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let rel = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
      if (rel.endsWith('/')) rel += 'index.html';
      const file = path.join(root, rel);
      // Never serve outside the tree, even if a page asks for it.
      if (!file.startsWith(root)) { res.writeHead(403).end(); return; }

      const cached = snapshot.get(file);
      if (cached) {
        if (cached.missing) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(cached.body);
        return;
      }
      fs.readFile(file, (err, body) => {
        if (err) {
          snapshot.set(file, { missing: true });
          res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
          return;
        }
        snapshot.set(file, { body });
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(body);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, snapshot }));
  });
}

async function launch() {
  const bin = chromePath();
  if (!bin) return null;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-profile-'));
  const proc = spawn(bin, [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check',
    '--disable-gpu', '--disable-dev-shm-usage',
    '--disable-extensions', '--disable-background-networking',
    '--disable-sync', '--metrics-recording-only', '--mute-audio',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  // Chrome prints the DevTools endpoint to stderr once it is listening.
  const wsUrl = await new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error('Chrome did not report a DevTools endpoint')), 30000);
    proc.stderr.on('data', (chunk) => {
      buf += chunk.toString();
      const m = /ws:\/\/[^\s]+/.exec(buf);
      if (m) { clearTimeout(timer); resolve(m[0]); }
    });
    proc.on('exit', (code) => { clearTimeout(timer); reject(new Error(`Chrome exited ${code}`)); });
  });

  return { proc, wsUrl, profile };
}

// One CDP session against one tab.
class Session {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
        return;
      }
      const list = this.handlers.get(msg.method);
      if (list) for (const fn of list) fn(msg.params);
    });
  }

  send(method, params = {}) {
    this.id += 1;
    const id = this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 60000);
    });
  }

  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(fn);
  }
}

// Open a page and start collecting everything that matters for a boot audit:
// console output, uncaught exceptions, and the outcome of every request.
async function openPage(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('CDP socket failed')), { once: true });
  });
  const browser = new Session(ws);
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });

  // A flat session multiplexes over the same socket, so wrap send/on.
  const page = {
    console: [],
    errors: [],
    requests: [],
    // Every URL the page ASKED for, recorded when the request is issued rather
    // than when it answers. `requests` only sees responses, so a request that
    // fails leaves no URL behind — which would let "nothing was requested" pass
    // for a page that requested plenty and merely got no reply.
    attempts: [],
    // Document-level redirect hops, in order, so a chain can be replayed.
    redirects: [],
    _id: 0,
    _pending: new Map(),
  };
  const rawSend = (method, params) => {
    page._id += 1;
    const id = page._id + 1000000;
    return new Promise((resolve, reject) => {
      page._pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
      setTimeout(() => {
        if (page._pending.has(id)) {
          page._pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 60000);
    });
  };
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.sessionId !== sessionId) return;
    if (msg.id && page._pending.has(msg.id)) {
      const { resolve, reject } = page._pending.get(msg.id);
      page._pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      page.console.push({
        type: msg.params.type,
        text: (msg.params.args || []).map((a) => (a.value !== undefined ? String(a.value)
          : (a.description || a.type))).join(' '),
      });
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      page.errors.push(d.exception ? (d.exception.description || d.exception.value || d.text) : d.text);
    }
    if (msg.method === 'Network.requestWillBeSent') {
      page.attempts.push({ url: msg.params.request.url, type: msg.params.type });
      // A redirect arrives as a NEW requestWillBeSent carrying the response that
      // caused it. Recording each hop is the difference between "this domain
      // moved" and "this domain moved, twice, ending somewhere else entirely" —
      // and only the chain distinguishes a rebrand from an acquisition.
      if (msg.params.redirectResponse && msg.params.type === 'Document') {
        page.redirects.push({
          from: msg.params.redirectResponse.url,
          to: msg.params.request.url,
          status: msg.params.redirectResponse.status,
        });
      }
    }
    if (msg.method === 'Network.responseReceived') {
      page.requests.push({ url: msg.params.response.url, status: msg.params.response.status });
    }
    if (msg.method === 'Network.loadingFailed') {
      page.requests.push({ url: '(failed)', status: 0, error: msg.params.errorText });
    }
  });

  page.send = rawSend;
  await rawSend('Runtime.enable', {});
  await rawSend('Network.enable', {});
  await rawSend('Page.enable', {});

  page.goto = async (url) => {
    page.console.length = 0;
    page.errors.length = 0;
    page.requests.length = 0;
    page.attempts.length = 0;
    page.redirects.length = 0;
    await rawSend('Page.navigate', { url });
    // Wait for the document to finish and for deferred scripts to run.
    const deadline = Date.now() + 30000;
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const r = await rawSend('Runtime.evaluate', {
        expression: 'document.readyState', returnByValue: true,
      });
      if (r.result.value === 'complete') break;
      if (Date.now() > deadline) throw new Error(`page never completed: ${url}`);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r2) => { setTimeout(r2, 50); });
    }
    return page;
  };

  // Evaluate in the page and return the value. Rejects on a thrown exception
  // rather than silently yielding undefined, which is how a shim hides a bug.
  page.eval = async (fn, ...args) => {
    const expression = `(${fn.toString()}).apply(null, ${JSON.stringify(args)})`;
    const r = await rawSend('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true,
    });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error(d.exception ? (d.exception.description || d.exception.value) : d.text);
    }
    return r.result.value;
  };

  page.close = () => browser.send('Target.closeTarget', { targetId });
  page.ws = ws;
  return page;
}

// One browser and one server for a whole test file.
async function harness(root, { preload = [] } = {}) {
  const chrome = await launch();
  if (!chrome) return null;
  const { server, port } = await serve(root, preload);
  const page = await openPage(chrome.wsUrl);
  return {
    page,
    origin: `http://127.0.0.1:${port}`,
    async close() {
      try { await page.close(); } catch { /* the tab may already be gone */ }
      try { page.ws.close(); } catch { /* socket already closed */ }
      server.close();
      chrome.proc.kill('SIGKILL');
      fs.rmSync(chrome.profile, { recursive: true, force: true });
    },
  };
}

module.exports = { harness, chromePath, serve, launch, openPage };
