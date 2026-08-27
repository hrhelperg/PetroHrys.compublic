#!/usr/bin/env node
'use strict';

// Real-browser evidence execution for the committed Forum V2 cohort. One
// long-lived, ordinary windowed Chrome reads public pages only. It never creates
// an account, solves a challenge, changes a user agent or crosses a gate.

const fs = require('node:fs');
const path = require('node:path');
const CK = require('./lib/rc-checkpoint.cjs');
const REFUSAL = require('./lib/rc-refusal.cjs');
const F = require('./lib/forum-schema.cjs');
const V2 = require('./lib/forum-link-schema.cjs');
const LINK = require('./research-link-value.cjs');
const { launch, openPage, chromePath } = require('./tests/helpers/cdp.cjs');

const ROOT = path.resolve(__dirname, '..');
const FINDINGS = path.join(ROOT, 'data/forums/forum-link-value-findings.json');
const TODAY = new Date().toISOString().slice(0, 10);
const NAVIGATION_MS = 18000;
const PAGE_SETTLE_MS = 450;
const CHALLENGE = REFUSAL.isRefusal;

const REGISTER = /(register|registration|sign[ -]?up|signup|join(?: us)?|create (?:an )?account)/i;
const REGISTER_PATH = /\/(register|registration|signup|sign-up|join|account\/create|ucp\.php)(\/|\?|$)/i;
const RULES = /(rules|guidelines|community standards|terms of participation|faq)/i;
const MEMBER_DIRECTORY = /(members?|users?|people|community)(\/|\?|$)/i;
const PROFILE_PATH = /\/(u|users?|members?|profile|people)\/[^/?#]+|member\.php\?|user\/profile/i;
const THREAD_CREATE = /(new topic|create topic|start (?:a )?(?:topic|discussion|thread)|ask question|new discussion)/i;
const REPLY = /(^|\b)(reply|post reply|write a reply|answer)(\b|$)/i;
const CLOSED = /(registration(?:s| is| are)? (?:closed|disabled)|not accepting new (?:members|registrations)|read[ -]?only|posting (?:is )?closed)/i;
const INVITE = /(invite[ -]?only|invitation (?:is )?required|registration by invitation)/i;
const FREE = /(free registration|register for free|sign up for free|create (?:a )?free account|free membership)/i;
const PAID = /(paid membership|membership (?:fee|costs)|subscription required|payment required|premium membership required)/i;
const LOGIN = /(log in|login|sign in|members only|authentication required)/i;
const RESTRICTION_PATTERNS = [
  ['minimum account age', /account (?:must be|age).{0,40}(?:days?|weeks?|months?)/i],
  ['minimum post count', /(?:minimum|at least).{0,20}\d+.{0,20}posts?/i],
  ['approval or moderation', /(?:approval|moderation).{0,40}(?:required|queue|before)/i],
  ['paid membership', PAID],
  ['verified status', /verified (?:professional|member|account).{0,30}(?:required|only)/i],
  ['invitation', INVITE],
  ['category-specific permission', /(?:only|restricted).{0,35}(?:category|forum|group)/i],
];

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
};
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const host = (value) => { try { return new URL(value).hostname.replace(/^www\./, ''); } catch { return null; } };
const family = (value) => {
  const h = host(value); if (!h) return null;
  const parts = h.split('.');
  return parts.slice(-2).join('.');
};
const sameFamily = (a, b) => family(a) && family(a) === family(b);

function cleanUrl(value) {
  try {
    const u = new URL(value); u.hash = '';
    if (!/^https?:$/.test(u.protocol)) return null;
    return u.toString();
  } catch { return null; }
}

function robotsBlocked(robots, pageUrl) {
  if (!robots || !pageUrl) return false;
  let active = false;
  const pathname = new URL(pageUrl).pathname;
  for (const raw of String(robots).split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = /^([^:]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    const field = m[1].trim().toLowerCase();
    const value = m[2].trim();
    if (field === 'user-agent') active = value === '*';
    if (active && field === 'allow' && value && pathname.startsWith(value)) return false;
    if (active && field === 'disallow' && value && pathname.startsWith(value)) return true;
  }
  return false;
}

function indexability(snapshot) {
  if (!snapshot) return 'UNKNOWN';
  const robots = String(snapshot.metaRobots || '').toLowerCase();
  if (/\bnoindex\b/.test(robots) || /(^|[,\s])none([,\s]|$)/.test(robots)) return 'NOINDEX';
  if (robotsBlocked(snapshot.robotsText, snapshot.url)) return 'ROBOTS_BLOCKED';
  if (LOGIN.test(snapshot.text || '') && (snapshot.forms || 0) > 0 && (snapshot.contentLength || 0) < 2200) {
    return 'LOGIN_REQUIRED';
  }
  return snapshot.readable ? 'INDEXABLE' : 'UNKNOWN';
}

function targetType(anchor, pageUrl) {
  const lower = LINK.targetTypeOf(anchor, pageUrl);
  return { direct: 'DIRECT_EXTERNAL', 'internal-redirect': 'INTERNAL_REDIRECT',
    'javascript-redirect': 'JAVASCRIPT_REDIRECT' }[lower] || 'UNKNOWN';
}

function relevantExternal(anchor, pageUrl) {
  if (!anchor || anchor.chrome) return false;
  const type = targetType(anchor, pageUrl);
  if (type === 'INTERNAL_REDIRECT' || type === 'JAVASCRIPT_REDIRECT') return true;
  return type === 'DIRECT_EXTERNAL' && !sameFamily(anchor.href, pageUrl);
}

function surfaceFromAnchors(anchors, page, scope) {
  if (!page) return V2.surfaceEmpty();
  const usable = (anchors || []).filter((a) => relevantExternal(a, page.url));
  if (!usable.length) return {
    ...V2.surfaceEmpty(), availability: 'NOT_OBSERVED', pageIndexability: indexability(page),
    evidenceUrl: page.url, observedAt: TODAY, scope,
  };
  const types = usable.map((a) => V2.backlinkType(a.relTokens));
  const targets = usable.map((a) => targetType(a, page.url));
  const relTokens = [...new Set(usable.flatMap((a) => a.relTokens))].sort();
  return {
    availability: 'OBSERVED',
    backlinkType: V2.aggregateType(types),
    backlinkTypesObserved: [...new Set(types)].sort(),
    linkTargetType: new Set(targets).size === 1 ? targets[0] : 'UNKNOWN',
    pageIndexability: indexability(page),
    evidenceUrl: page.url,
    observedAt: TODAY,
    scope,
    relInspected: usable.every((a) => a.relRead),
    relTokens,
  };
}

async function snapshot(page) {
  return page.eval(async () => {
    const compact = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const anchors = [];
    for (const a of document.querySelectorAll('a[href]')) {
      const raw = a.getAttribute('href') || '';
      const href = a.href || raw;
      const signature = Boolean(a.closest('[class*="signature"], [id*="signature"], .post-signature, .message-signature'));
      const profileBio = Boolean(a.closest('[class*="bio"], [class*="about"], [data-field*="bio"], .user-field, .profile-field'));
      const postBody = !signature && Boolean(a.closest('.cooked, .postbody, .message-body, .message-content, .post-content, .js-post-body, .answercell, .s-prose, article[data-post-id], [itemprop="text"]'));
      const chrome = Boolean(a.closest('footer, nav, header, [class*="footer"], [class*="nav"], [id*="footer"], [id*="nav"], [class*="sidebar"]'));
      const relTokens = compact(a.getAttribute('rel')).toLowerCase().split(/[\s,]+/).filter(Boolean);
      anchors.push({
        href, raw, text: compact(a.innerText || a.textContent).slice(0, 160),
        title: compact(a.getAttribute('title')).slice(0, 120), relTokens, relRead: true,
        signature, profileBio, postBody, chrome,
        context: compact((a.closest('li, p, dd, .user-field, .profile-field, article') || a.parentElement || {}).innerText).slice(0, 240),
      });
    }
    const metaRobots = [...document.querySelectorAll('meta[name="robots"], meta[name="googlebot"]')]
      .map((m) => compact(m.getAttribute('content')).toLowerCase()).join(',');
    const canonical = (document.querySelector('link[rel="canonical"]') || {}).href || null;
    const roleText = compact([...document.querySelectorAll('.user-title, .user-role, .badge, [class*="group"], [class*="role"]')]
      .slice(0, 15).map((x) => x.innerText || x.textContent).join(' ')).slice(0, 500);
    let robotsText = '';
    try {
      const response = await Promise.race([fetch('/robots.txt', { credentials: 'omit' }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('robots timeout')), 2500))]);
      if (response.ok) robotsText = (await response.text()).slice(0, 50000);
    } catch { /* unavailable robots evidence remains absent */ }
    const text = compact(document.body ? document.body.innerText : '');
    return {
      url: location.href, title: document.title || '', text: text.slice(0, 12000),
      contentLength: text.length, anchors, metaRobots, canonical, robotsText, roleText,
      forms: document.querySelectorAll('form').length,
      registerFields: document.querySelectorAll('input[name*="user" i], input[name*="email" i], input[type="password"]').length,
      submitControls: document.querySelectorAll('button[type="submit"], input[type="submit"]').length,
      readable: Boolean(document.body && text.length >= 80),
    };
  });
}

async function open(page, url) {
  try {
    await Promise.race([page.goto(url), new Promise((_, reject) => {
      setTimeout(() => reject(new Error('navigation timeout')), NAVIGATION_MS);
    })]);
    await sleep(PAGE_SETTLE_MS);
    const value = await snapshot(page);
    if (!value || !value.readable) return { kind: 'UNREAD', url, value };
    if (CHALLENGE(`${value.title}\n${value.text}`)) return { kind: 'CHALLENGE', url, value };
    return { kind: 'READ', url, value };
  } catch (error) {
    return { kind: /timeout/i.test(error.message) ? 'TIMEOUT' : 'UNREAD', url, error: error.message };
  }
}

function firstLink(snapshots, predicate) {
  for (const page of snapshots.filter(Boolean)) {
    for (const anchor of page.anchors || []) if (predicate(anchor, page)) return cleanUrl(anchor.href);
  }
  return null;
}

function explicitRestrictions(text) {
  return RESTRICTION_PATTERNS.filter(([, re]) => re.test(text)).map(([name]) => name);
}

function postingState(snapshot, pattern) {
  if (!snapshot) return 'UNKNOWN';
  if (CLOSED.test(snapshot.text)) return 'UNAVAILABLE';
  const matches = (snapshot.anchors || []).filter((a) => pattern.test(`${a.text} ${a.title} ${a.href}`));
  if (!matches.length) return 'UNKNOWN';
  if (matches.some((a) => LOGIN.test(`${a.text} ${a.href}`))) return 'RESTRICTED';
  return 'AVAILABLE';
}

function registrationEvidence(root, registration) {
  const page = registration || root;
  const text = `${root ? root.text : ''} ${page ? page.text : ''}`;
  let access = 'UNKNOWN';
  if (INVITE.test(text)) access = 'INVITE_ONLY';
  else if (CLOSED.test(text)) access = 'CLOSED';
  else if (registration && registration.registerFields >= 2 && registration.submitControls > 0) access = 'OPEN';
  let cost = 'UNKNOWN';
  if (PAID.test(text)) cost = 'PAID';
  else if (FREE.test(text)) cost = 'FREE';
  return { registrationAccess: access, registrationCost: cost };
}

function profileScope(profile) {
  return profile && /\b(admin|administrator|moderator|staff|team member)\b/i.test(profile.roleText || '')
    ? 'STAFF_OR_MODERATOR' : 'OBSERVED_MEMBER_TEMPLATE';
}

function profileWebsiteAnchors(profile) {
  if (!profile) return [];
  return (profile.anchors || []).filter((a) => {
    const words = `${a.text} ${a.title} ${a.context}`;
    return !a.profileBio && /(website|web site|homepage|home page|personal site|portfolio|blog)/i.test(words);
  });
}

function observation(kind, result, details = {}) {
  return { kind, observedAt: TODAY, url: cleanUrl((result.value || {}).url || result.url),
    outcome: result.kind, ...details };
}

async function researchOne(page, forum) {
  const evidence = V2.emptyEvidence(TODAY);
  const observations = [];
  const counts = { readPages: 0, unreadPages: 0, timeoutPages: 0, challengePages: 0 };
  const visit = async (kind, url) => {
    const result = await open(page, url);
    counts[`${result.kind.toLowerCase()}Pages`] += 1;
    observations.push(observation(kind, result));
    return result;
  };

  const rootResult = await visit('forum-root', forum.url);
  if (rootResult.kind !== 'READ') {
    evidence.attemptState = rootResult.kind;
    V2.validateEvidence(evidence);
    return { evidence, observations, counts };
  }
  const root = rootResult.value;
  const threadUrls = (forum.verification.threadUrls || []).map(cleanUrl).filter(Boolean).slice(0, 2);
  const registrationUrl = firstLink([root], (a) => REGISTER.test(`${a.text} ${a.title}`) || REGISTER_PATH.test(a.href));
  const rulesUrl = firstLink([root], (a) => RULES.test(`${a.text} ${a.title} ${a.href}`));
  const memberDirectory = firstLink([root], (a) => sameFamily(a.href, root.url)
    && MEMBER_DIRECTORY.test(new URL(a.href).pathname) && !PROFILE_PATH.test(a.href));

  const threadResults = [];
  for (const threadUrl of threadUrls) {
    // eslint-disable-next-line no-await-in-loop
    threadResults.push(await visit('representative-thread', threadUrl));
  }
  const readableThreads = threadResults.filter((result) => result.kind === 'READ').map((result) => result.value);
  readableThreads.sort((a, b) => b.anchors.filter((x) => x.postBody && relevantExternal(x, b.url)).length
    - a.anchors.filter((x) => x.postBody && relevantExternal(x, a.url)).length);
  const thread = readableThreads[0] || null;
  const registrationResult = registrationUrl ? await visit('registration', registrationUrl) : null;
  const registration = registrationResult && registrationResult.kind === 'READ' ? registrationResult.value : null;
  const rulesResult = rulesUrl && rulesUrl !== registrationUrl ? await visit('rules', rulesUrl) : null;
  const rules = rulesResult && rulesResult.kind === 'READ' ? rulesResult.value : null;
  const profileUrls = [];
  for (const source of [...readableThreads, root]) {
    for (const anchor of source.anchors || []) {
      if (!sameFamily(anchor.href, source.url) || !PROFILE_PATH.test(anchor.href)
        || REGISTER_PATH.test(anchor.href)) continue;
      const value = cleanUrl(anchor.href);
      if (value && !profileUrls.includes(value)) profileUrls.push(value);
    }
  }
  profileUrls.sort((a, b) => Number(/profile-hidden/i.test(a)) - Number(/profile-hidden/i.test(b)));
  const profiles = [];
  for (const profileUrl of profileUrls.slice(0, 3)) {
    // eslint-disable-next-line no-await-in-loop
    const result = await visit('representative-profile', profileUrl);
    if (result.kind === 'READ') profiles.push(result.value);
  }
  profiles.sort((a, b) => {
    const score = (value) => (profileWebsiteAnchors(value).some((x) => relevantExternal(x, value.url)) ? 20 : 0)
      + (value.anchors.some((x) => x.profileBio && relevantExternal(x, value.url)) ? 10 : 0)
      + (profileScope(value) === 'STAFF_OR_MODERATOR' ? 0 : 1);
    return score(b) - score(a);
  });
  const profile = profiles[0] || null;
  const profileUrl = profile ? profile.url : (profileUrls[0] || null);

  evidence.attemptState = 'READ';
  const registrationFacts = registrationEvidence(root, registration);
  const combinedText = `${root.text} ${thread ? thread.text : ''} ${rules ? rules.text : ''}`;
  evidence.participation = {
    ...registrationFacts,
    threadCreation: postingState(thread || root, THREAD_CREATE),
    replyPosting: postingState(thread || root, REPLY),
    restrictionFacts: explicitRestrictions(combinedText),
  };
  evidence.threadPage = {
    representativeUrl: thread ? thread.url : null,
    indexability: indexability(thread),
    canonicalUrl: thread ? cleanUrl(thread.canonical) : null,
    observedAt: thread ? TODAY : null,
  };
  evidence.publicProfile = {
    discoveryState: profileUrl ? 'PUBLIC_PROFILE_DISCOVERED' : 'PUBLIC_PROFILE_NOT_DISCOVERED',
    representativeUrl: profile ? profile.url : profileUrl,
    indexability: indexability(profile),
    canonicalUrl: profile ? cleanUrl(profile.canonical) : null,
    observedAt: profile ? TODAY : null,
  };
  const scope = profileScope(profile);
  const postAnchors = thread ? thread.anchors.filter((a) => a.postBody && !a.signature) : [];
  const signatureAnchors = thread ? thread.anchors.filter((a) => a.signature) : [];
  evidence.linkSurfaces.PROFILE_WEBSITE = surfaceFromAnchors(profileWebsiteAnchors(profile), profile, scope);
  evidence.linkSurfaces.PROFILE_BIO = surfaceFromAnchors(profile
    ? profile.anchors.filter((a) => a.profileBio) : [], profile, scope);
  evidence.linkSurfaces.POST_BODY = surfaceFromAnchors(postAnchors, thread, 'PUBLIC_PAGE');
  evidence.linkSurfaces.SIGNATURE = surfaceFromAnchors(signatureAnchors, thread, 'PUBLIC_PAGE');
  evidence.evidenceUrls = {
    registration: registration ? registration.url : registrationUrl,
    rules: rules ? rules.url : rulesUrl,
    memberDirectory,
    representativeProfile: profile ? profile.url : profileUrl,
    representativeThread: thread ? thread.url : (threadUrls[0] || null),
    postExternalLink: postAnchors.find((a) => relevantExternal(a, thread.url)) ? thread.url : null,
    signatureExample: signatureAnchors.find((a) => relevantExternal(a, thread.url)) ? thread.url : null,
  };
  observations.push({ kind: 'classified-surfaces', observedAt: TODAY, url: forum.url,
    registrationAccess: evidence.participation.registrationAccess,
    registrationCost: evidence.participation.registrationCost,
    threadCreation: evidence.participation.threadCreation,
    replyPosting: evidence.participation.replyPosting,
    profileScope: scope,
    profileExternalAnchors: profile ? profile.anchors.filter((a) => relevantExternal(a, profile.url))
      .map((a) => ({ href: a.href, relTokens: a.relTokens, relRead: a.relRead,
        targetType: targetType(a, profile.url), context: a.context })).slice(0, 10) : [],
    postExternalAnchors: thread ? postAnchors.filter((a) => relevantExternal(a, thread.url))
      .map((a) => ({ href: a.href, relTokens: a.relTokens, relRead: a.relRead,
        targetType: targetType(a, thread.url) })).slice(0, 12) : [],
    signatureExternalAnchors: thread ? signatureAnchors.filter((a) => relevantExternal(a, thread.url))
      .map((a) => ({ href: a.href, relTokens: a.relTokens, relRead: a.relRead,
        targetType: targetType(a, thread.url) })).slice(0, 8) : [] });
  V2.validateEvidence(evidence);
  return { evidence, observations, counts };
}

async function main() {
  if (!chromePath()) throw new Error('No Chrome, Chromium or Edge is available.');
  const cohort = V2.assertCohortParity();
  const cohortIds = new Set(cohort.map((r) => r.id));
  const rows = process.argv.includes('--expand')
    ? F.load(path.join(ROOT, 'data/forums/forums.json'))
      .filter((r) => r.status === 'ACTIVE' && r.domainRating >= 50)
      .sort((a, b) => (b.domainRating - a.domainRating) || a.name.localeCompare(b.name, 'en'))
      .filter((r) => !cohortIds.has(r.id))
    : cohort;
  const limit = Math.max(1, Number(arg('--limit', String(rows.length))));
  const start = Math.max(0, Number(arg('--start', '0')));
  const refresh = process.argv.includes('--refresh');
  const ledger = new CK.Ledger(FINDINGS, { batch: 1 });
  CK.onInterrupt(ledger, 'Forum Link Value research');
  const targets = rows.filter((r, index) => index >= start
    && (refresh || !ledger.has(`forumLinkValue|${F.identityKey(r)}`))).slice(0, limit);
  console.log(`Forum Link Value research: ${targets.length} target(s), ${ledger.size()} already on disk.`);
  if (!targets.length) { ledger.compact({ cohortIdentitySha256: V2.cohortIdentitySha(cohort) }); return; }

  const chrome = await launch({ headless: false });
  const page = await openPage(chrome.wsUrl);
  try {
    let done = 0;
    for (const forum of targets) {
      // eslint-disable-next-line no-await-in-loop
      const result = await researchOne(page, forum);
      const key = `forumLinkValue|${F.identityKey(forum)}`;
      const previous = ledger.get(key);
      const finding = {
        key, collection: 'forums', id: forum.id, forumUrl: forum.url,
        attemptedAt: TODAY, method: 'DIRECT_BROWSER', ...result,
        observations: [...(previous && previous.observations || []), ...result.observations],
      };
      ledger.record(finding);
      done += 1;
      console.log(`  ${done}/${targets.length} ${result.evidence.attemptState} ${forum.url}`);
    }
    ledger.compact({ cohortIdentitySha256: V2.cohortIdentitySha(cohort), completedAt: TODAY });
  } finally {
    try { page.ws.close(); } catch { /* already closed */ }
    chrome.proc.kill('SIGKILL');
    try { fs.rmSync(chrome.profile, { recursive: true, force: true }); } catch { /* OS reaps it */ }
  }
}

if (require.main === module) main().then(() => process.exit(0)).catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});

module.exports = {
  FINDINGS, robotsBlocked, indexability, targetType, relevantExternal,
  surfaceFromAnchors, postingState, registrationEvidence, profileScope,
  profileWebsiteAnchors, researchOne, main, CHALLENGE,
};
