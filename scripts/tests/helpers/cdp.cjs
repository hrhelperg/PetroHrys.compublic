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
function serve(root) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let rel = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
      if (rel.endsWith('/')) rel += 'index.html';
      const file = path.join(root, rel);
      // Never serve outside the tree, even if a page asks for it.
      if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
      fs.readFile(file, (err, body) => {
        if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(body);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
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
async function harness(root) {
  const chrome = await launch();
  if (!chrome) return null;
  const { server, port } = await serve(root);
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
