#!/usr/bin/env node
'use strict';

// Bounded real-browser fallback for candidates whose direct HTTP target was
// unread. This reuses the repository's shared windowed-Chrome/CDP harness; it
// does not spoof, solve challenges or weaken the direct-evidence rules.

const fs = require('node:fs');
const path = require('node:path');
const CK = require('./lib/rc-checkpoint.cjs');
const REFUSAL = require('./lib/rc-refusal.cjs');
const R = require('./research-forums.cjs');
const { launch, openPage, chromePath } = require('./tests/helpers/cdp.cjs');

const ROOT = path.resolve(__dirname, '..');
const CANDIDATES = path.join(ROOT, 'data/forums/candidates.json');
const FINDINGS = path.join(ROOT, 'data/forums/research-findings.json');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
};

const CHALLENGE = REFUSAL.isRefusal;

async function main() {
  if (!chromePath()) throw new Error('No Chrome, Chromium or Edge on this machine.');
  const source = JSON.parse(fs.readFileSync(CANDIDATES, 'utf8'));
  const ledger = new CK.Ledger(FINDINGS, { batch: 1 });
  CK.onInterrupt(ledger, 'Forum browser research');
  const sourceName = arg('--source', 'software-round');
  const onlyKey = arg('--key', null);
  const refreshAccepted = process.argv.includes('--refresh-accepted');
  const limit = Math.max(1, Number(arg('--limit', '50')));
  const candidates = source.candidates.filter((candidate) => {
    if (onlyKey && candidate.key !== onlyKey) return false;
    const previous = ledger.get(`forums|${candidate.key}`);
    return candidate.source === sourceName && previous
      && (refreshAccepted ? previous.state === 'ACCEPTED' : previous.state === 'UNREAD');
  }).slice(0, limit);
  console.log(`Forum browser research: ${candidates.length} ${refreshAccepted ? 'accepted refresh' : 'unread'} ${sourceName} target(s).`);
  if (!candidates.length) return;

  const chrome = await launch({ headless: false });
  const page = await openPage(chrome.wsUrl);
  try {
    let done = 0;
    for (const candidate of candidates) {
      let finding;
      try {
        await page.goto(candidate.discoveredUrl);
        await new Promise((resolve) => { setTimeout(resolve, 900); });
        const snapshot = await page.eval(() => ({
          url: location.href,
          html: document.documentElement ? document.documentElement.outerHTML : '',
        }));
        if (!snapshot.html || CHALLENGE(snapshot.html)) {
          finding = R.findingBase(candidate, 'UNREAD', {
            reason: 'BROWSER_CHALLENGE_OR_EMPTY',
            observations: [{ url: snapshot.url || candidate.discoveredUrl,
              method: 'DIRECT_BROWSER', verdict: 'challenge or empty document' }],
          });
        } else {
          const direct = await R.verifyHtmlForum(candidate, {
            ok: true, challenged: false, status: 200, url: snapshot.url, text: snapshot.html,
          });
          if (direct.unread) {
            finding = R.findingBase(candidate, 'UNREAD', {
              reason: 'BROWSER_TARGET_UNREAD', observations: [{ url: snapshot.url,
                method: 'DIRECT_BROWSER', verdict: 'target unread' }],
            });
          } else if (direct.reject) {
            finding = R.findingBase(candidate, 'REJECTED', {
              reason: direct.reject, observations: [{ url: snapshot.url,
                method: 'DIRECT_BROWSER', verdict: direct.reject }],
            });
          } else {
            finding = R.acceptedFinding(candidate, direct, 'DIRECT_BROWSER');
            finding.observations = (finding.observations || []).map((x) => ({ ...x,
              method: 'DIRECT_BROWSER' }));
          }
        }
      } catch (error) {
        finding = R.findingBase(candidate, 'UNREAD', {
          reason: `BROWSER_ERROR: ${error.message}`,
          observations: [{ url: candidate.discoveredUrl, method: 'DIRECT_BROWSER',
            verdict: 'browser error' }],
        });
      }
      const previous = ledger.get(`forums|${candidate.key}`);
      finding.observations = [...(previous && previous.observations || []), ...(finding.observations || [])];
      ledger.record(finding);
      done += 1;
      console.log(`  ${done}/${candidates.length} ${finding.state} ${candidate.discoveredUrl}`);
    }
    ledger.compact({ browserResearchedAt: new Date().toISOString().slice(0, 10) });
  } finally {
    try { page.ws.close(); } catch { /* socket may already be closed */ }
    chrome.proc.kill('SIGKILL');
    try { fs.rmSync(chrome.profile, { recursive: true, force: true }); } catch { /* OS reaps it */ }
  }
}

if (require.main === module) main().then(() => process.exit(0)).catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});

module.exports = { challenge: CHALLENGE, main };
