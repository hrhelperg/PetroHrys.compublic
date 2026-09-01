#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const build = require('./build-product-launch-platforms.cjs');

const ROOT = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'data/product-launch-platforms/platforms.json');
const FINDINGS_FILE = path.join(ROOT, 'data/product-launch-platforms/.evidence-resolution-findings.json');
const QUALITY_FILE = path.join(ROOT, 'data/product-launch-platforms/.quality-findings.json');
const TODAY = new Date().toISOString().slice(0, 10);
const USER_AGENT = 'PetroHrys Research Center evidence audit/1.0';
const TIMEOUT_MS = 12000;
const CONCURRENCY = 18;
const MAX_BODY = 1_500_000;
const BLOCKING_REL = new Set(['nofollow', 'ugc', 'sponsored']);
const SOCIAL_HOST = /(^|\.)(facebook|instagram|linkedin|twitter|x|youtube|youtu\.be|tiktok|reddit|pinterest|pin\.it|discord|telegram|t\.me|medium|substack|bsky|github|gitlab|google|apple|microsoft|stripe|paypal|cloudflare)\./i;
const ASSET_PATH = /\.(?:png|jpe?g|gif|webp|svg|ico|css|js|json|xml|pdf|zip|mp4|webm|mp3)(?:$|[?#])/i;
const EXCLUDED_PATH = /\/(?:blog|news|article|articles|press|about|contact|privacy|terms|legal|login|signin|signup|register|submit|add|advertis|pricing|sponsor|docs|help|support|academy|category|tag|author|feed|wp-admin|api)(?:\/|$)/i;
const LISTING_PATH = /\/(?:ai-?tools?|tools?|products?|startups?|companies|company|projects?|apps?|software|launches?|makers?|profiles?|directory|directories|listings?|items?|p)\/[^/?#]+/i;
const STRICT_DETAIL_PATH = /\/(?:ai-?tools?|tools?|products?|startups?|company|projects?|apps?|software|launches?|makers?|profiles?|listings?|items?|agents?|applications?|reviews?|tool-posts?)\/[^/?#]+/i;
const LISTING_TEXT = /^(?:visit(?: website| site)?|website|official(?: website| site)?|homepage|product site|launch|try it|open|view website|use it|get started|go to (?:website|site))$/i;
const LISTING_CLASS = /\b(?:visit|website|outbound|product-url|homepage)\b/i;
const HOME_TYPES = new Set(['launch-board', 'startup-directory', 'ai-software-directory',
  'product-directory', 'business-directory']);
const HOME_DIRECTORY_SIGNAL = /\b(?:directory of|tool directory|product directory|startup directory|business directory|discover (?:new |the latest )?(?:products|tools|startups|apps|software)|browse (?:products|tools|startups|apps|software)|latest (?:products|tools|startups|apps|software)|featured (?:products|tools|startups|apps|software)|launch(?:ed|ing)? (?:new )?(?:products|tools|startups|apps|software))\b/i;
const HOME_DIRECT_DENY = new Set(['plp-smartmoneymatch-com', 'plp-whodoyou-com']);
const INFRA_HOST = /(^|\.)(?:ahrefs|whatsapp|typeform|eepurl|feedburner|trustpilot|dmca|wordpress|colorlib|tawk|cookiebot|cookiedatabase|flickr|hubspot)\./i;

const decodeHtml = (value) => String(value || '')
  .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#x27;|&#39;/gi, "'")
  .replace(/&#x2F;/gi, '/').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
  .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));

const stripHtml = (value) => decodeHtml(String(value || '').replace(/<[^>]*>/g, ' '))
  .replace(/\s+/g, ' ').trim();

const hostOf = (value) => {
  try { return new URL(value).hostname.replace(/^www\./, '').toLowerCase(); } catch { return null; }
};

const sameHost = (a, b) => hostOf(a) && hostOf(a) === hostOf(b);

const sameSiteHost = (a, b) => a && b && (a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`));

function attributesOf(raw) {
  const output = {};
  for (const match of String(raw || '').matchAll(/([:\w-]+)\s*=\s*(["'])([\s\S]*?)\2/g)) {
    output[match[1].toLowerCase()] = decodeHtml(match[3]);
  }
  return output;
}

function anchorsOf(body, baseUrl) {
  const anchors = [];
  for (const match of String(body || '').matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = attributesOf(match[1]);
    if (!attrs.href) continue;
    try {
      const url = new URL(attrs.href, baseUrl);
      if (!/^https?:$/.test(url.protocol)) continue;
      anchors.push({
        url: url.href,
        text: stripHtml(match[2]),
        rel: String(attrs.rel || '').toLowerCase().split(/\s+/).filter(Boolean),
        className: `${attrs.class || ''} ${attrs['aria-label'] || ''} ${attrs.title || ''}`,
      });
    } catch { /* Ignore malformed links. */ }
  }
  return anchors;
}

async function request(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml,application/xml,text/xml;q=0.9,*/*;q=0.5' },
      signal: controller.signal,
    });
    const contentType = response.headers.get('content-type') || '';
    let body = '';
    if (/text|html|xml|json/i.test(contentType)) body = (await response.text()).slice(0, MAX_BODY);
    else if (response.body) await response.body.cancel();
    return {
      status: response.status,
      finalUrl: response.url,
      body,
      contentType,
      xRobotsTag: response.headers.get('x-robots-tag') || '',
    };
  } catch (error) {
    return { status: 0, finalUrl: url, body: '', contentType: '',
      xRobotsTag: '', error: error.name || error.message };
  } finally {
    clearTimeout(timer);
  }
}

function availabilityFor(result) {
  if (!result || !result.status) return 'unreachable';
  const interstitial = /captcha|access denied|just a moment|checking your browser|cf-chl-/i
    .test(String(result.body || '').slice(0, 10000));
  if ([401, 403, 406, 418, 429].includes(result.status) || interstitial) return 'protected';
  return result.status >= 200 && result.status < 400 ? 'live' : 'unreachable';
}

function pathScore(value) {
  let parsed;
  try { parsed = new URL(value); } catch { return -100; }
  const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
  if (ASSET_PATH.test(pathname) || EXCLUDED_PATH.test(pathname)) return -100;
  const segments = pathname.split('/').filter(Boolean);
  let score = 0;
  if (LISTING_PATH.test(pathname)) score += 14;
  if (/\/(?:showcase|discover|marketplace)\/[^/?#]+/i.test(pathname)) score += 10;
  if (segments.length >= 2) score += 3;
  if (segments.length >= 3) score += 1;
  if (/\d{4}\/\d{1,2}/.test(pathname)) score -= 12;
  if (segments.length === 1 && !/^(?:products?|tools?|startups?|directory|launches)$/i.test(segments[0])) score += 1;
  return score;
}

function internalCandidates(row, result) {
  const anchors = anchorsOf(result.body, result.finalUrl);
  const homeHost = hostOf(result.finalUrl) || hostOf(row.website);
  const candidates = new Map();
  const grouped = new Map();
  for (const anchor of anchors) {
    if (hostOf(anchor.url) !== homeHost) continue;
    const score = pathScore(anchor.url);
    if (score >= 10) candidates.set(anchor.url, { url: anchor.url, score, method: 'home-link' });
    try {
      const parsed = new URL(anchor.url);
      const segments = parsed.pathname.split('/').filter(Boolean);
      if (!segments.length || EXCLUDED_PATH.test(parsed.pathname) || ASSET_PATH.test(parsed.pathname)) continue;
      const key = `${segments[0]}:${segments.length}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(anchor.url);
    } catch { /* Ignore malformed links. */ }
  }
  for (const values of grouped.values()) {
    const unique = [...new Set(values)];
    if (unique.length < 5) continue;
    for (const url of unique.slice(0, 3)) {
      if (!candidates.has(url)) candidates.set(url, { url, score: 2, method: 'repeated-home-route' });
    }
  }
  for (const source of row.sources || []) {
    if (!sameHost(source, row.website) || source === row.website || source === row.submissionUrl) continue;
    const score = pathScore(source);
    if (score >= 10) candidates.set(source, { url: source, score: score + 3, method: 'existing-source' });
  }
  return [...candidates.values()].sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
}

function eligibleExternal(anchor, ownHost) {
  const host = hostOf(anchor.url);
  if (!host || sameSiteHost(host, ownHost) || SOCIAL_HOST.test(`${host}.`)
    || ASSET_PATH.test(anchor.url)) return false;
  return !INFRA_HOST.test(`${host}.`)
    && !/doubleclick|googlesyndication|google-analytics|googletagmanager|schema\.org|w3\.org|gravatar|cloudfront|amazonaws/i.test(host);
}

function targetMatchesPage(anchor, result) {
  const host = hostOf(anchor.url) || '';
  const root = host.split('.').filter(Boolean).at(-2) || '';
  if (root.length < 4) return false;
  const title = stripHtml((String(result.body || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
  const pageText = `${new URL(result.finalUrl).pathname} ${title}`.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return pageText.includes(root.toLowerCase().replace(/[^a-z0-9]+/g, ''));
}

function indexabilityOf(result) {
  const meta = [...String(result.body || '').matchAll(/<meta\b([^>]*)>/gi)]
    .map((match) => attributesOf(match[1]))
    .filter((attrs) => /^(?:robots|googlebot)$/i.test(attrs.name || ''))
    .map((attrs) => attrs.content || '').join(' ');
  return /noindex/i.test(`${result.xRobotsTag} ${meta}`) ? 'noindex' : 'indexable';
}

function inspectListing(row, candidate, result) {
  if (availabilityFor(result) !== 'live' || !/^https:\/\//i.test(result.finalUrl)) return null;
  const ownHost = hostOf(result.finalUrl) || hostOf(row.website);
  const external = anchorsOf(result.body, result.finalUrl)
    .filter((anchor) => eligibleExternal(anchor, ownHost));
  const distinctHosts = new Set(external.map((anchor) => hostOf(anchor.url)));
  const highConfidence = external.filter((anchor) => LISTING_TEXT.test(anchor.text.trim())
    || LISTING_CLASS.test(anchor.className));
  const isHome = new URL(result.finalUrl).pathname.replace(/\/+$/, '') === '';
  let selected = highConfidence;
  if (candidate.method === 'home-direct') {
    if (!HOME_TYPES.has(row.platformType)
      || !HOME_DIRECTORY_SIGNAL.test(stripHtml(result.body).slice(0, 120000))) return null;
    if (new Set(selected.map((anchor) => hostOf(anchor.url))).size < 4) {
      selected = distinctHosts.size >= 8 ? external : [];
    }
  } else if (!selected.length && STRICT_DETAIL_PATH.test(new URL(result.finalUrl).pathname)
    && distinctHosts.size <= 3) {
    selected = external.filter((anchor) => targetMatchesPage(anchor, result));
  }
  if (!selected.length) return null;
  const followed = selected.some((anchor) => !anchor.rel.some((token) => BLOCKING_REL.has(token)));
  const qualified = selected.some((anchor) => anchor.rel.some((token) => BLOCKING_REL.has(token)));
  if (!followed && !qualified) return null;
  return {
    resolution: followed && qualified ? 'observed-mixed' : followed
      ? 'observed-follow' : 'observed-nofollow',
    evidenceUrl: result.finalUrl,
    listingIndexability: indexabilityOf(result),
    relTokens: [...new Set(selected.flatMap((anchor) => anchor.rel))].sort(),
    externalTargetHosts: [...new Set(selected.map((anchor) => hostOf(anchor.url)))].slice(0, 8),
    selectedLinks: selected.slice(0, 8).map((anchor) => ({
      host: hostOf(anchor.url), text: anchor.text.slice(0, 100), rel: anchor.rel,
    })),
    selectedLinkCount: selected.length,
    candidateMethod: candidate.method,
    candidateScore: candidate.score,
    isHome,
  };
}

function homeDirectCandidate(row, result) {
  if (HOME_DIRECT_DENY.has(row.id) || !HOME_TYPES.has(row.platformType)
    || !HOME_DIRECTORY_SIGNAL.test(stripHtml(result.body).slice(0, 120000))) return null;
  const ownHost = hostOf(result.finalUrl) || hostOf(row.website);
  const external = anchorsOf(result.body, result.finalUrl).filter((anchor) => eligibleExternal(anchor, ownHost));
  if (new Set(external.map((anchor) => hostOf(anchor.url))).size < 4) return null;
  return { url: result.finalUrl, score: 8, method: 'home-direct' };
}

function sitemapLocations(body, baseUrl) {
  const locations = [];
  for (const match of String(body || '').matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)) {
    try { locations.push(new URL(decodeHtml(match[1]), baseUrl).href); } catch { /* Ignore. */ }
  }
  return [...new Set(locations)];
}

async function sitemapCandidates(row, homeResult) {
  const origin = new URL(homeResult.finalUrl || row.website).origin;
  const robots = await request(`${origin}/robots.txt`);
  const declared = [...String(robots.body || '').matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((match) => match[1]);
  const roots = [...new Set([...declared, `${origin}/sitemap.xml`])].slice(0, 2);
  const output = [];
  for (const root of roots) {
    // eslint-disable-next-line no-await-in-loop
    const result = await request(root);
    if (availabilityFor(result) !== 'live') continue;
    const locations = sitemapLocations(result.body, result.finalUrl);
    const childMaps = locations.filter((url) => /sitemap/i.test(new URL(url).pathname));
    const pageUrls = locations.filter((url) => !/sitemap/i.test(new URL(url).pathname));
    if (!pageUrls.length && childMaps.length) {
      const prioritized = childMaps.sort((a, b) => {
        const score = (url) => /product|tool|startup|company|project|software|listing/i.test(url) ? 1 : 0;
        return score(b) - score(a);
      }).slice(0, 2);
      for (const child of prioritized) {
        // eslint-disable-next-line no-await-in-loop
        const childResult = await request(child);
        pageUrls.push(...sitemapLocations(childResult.body, childResult.finalUrl)
          .filter((url) => !/sitemap/i.test(new URL(url).pathname)));
      }
    }
    for (const url of pageUrls) {
      const score = pathScore(url);
      if (score >= 10) output.push({ url, score, method: 'sitemap' });
    }
    if (output.length) break;
  }
  return [...new Map(output.map((item) => [item.url, item])).values()]
    .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
}

function qualityClaims() {
  if (!fs.existsSync(QUALITY_FILE)) return new Map();
  const quality = JSON.parse(fs.readFileSync(QUALITY_FILE, 'utf8'));
  return new Map((quality.details || []).filter((row) => row.host && row.sourceFollowClaim)
    .map((row) => [row.host, {
      resolution: 'source-claimed-follow',
      claimSource: row.detailUrl,
      backlinkRequired: row.backlinkRequired || 'Unknown',
    }]));
}

async function researchRow(row, claims) {
  const home = await request(row.website);
  const availability = availabilityFor(home);
  const probe = { status: home.status, finalUrl: home.finalUrl, availability,
    error: home.error || null };
  const claim = claims.get(hostOf(row.website));
  if (availability !== 'live') {
    if (claim) return { id: row.id, website: row.website, homeProbe: probe, ...claim,
      evidenceUrl: null, listingIndexability: 'unknown', checkedListings: [] };
    return { id: row.id, website: row.website, homeProbe: probe,
      resolution: availability === 'protected' || row.availability === 'protected'
        ? 'unverified-protected' : 'unverified-unreachable',
      evidenceUrl: null, listingIndexability: 'unknown', checkedListings: [] };
  }
  if (row.platformType === 'submission-service') {
    return { id: row.id, website: row.website, homeProbe: probe,
      resolution: 'not-applicable', evidenceUrl: null,
      listingIndexability: 'unknown', checkedListings: [] };
  }

  let candidates = internalCandidates(row, home);
  const direct = homeDirectCandidate(row, home);
  if (direct) candidates.push(direct);
  if (!candidates.length) candidates = await sitemapCandidates(row, home);
  const checkedListings = [];
  for (const candidate of candidates.slice(0, 3)) {
    // eslint-disable-next-line no-await-in-loop
    const result = candidate.url === home.finalUrl ? home : await request(candidate.url);
    const observed = inspectListing(row, candidate, result);
    checkedListings.push({ url: candidate.url, finalUrl: result.finalUrl, status: result.status,
      method: candidate.method, score: candidate.score, observed: observed?.resolution || null });
    if (observed) return { id: row.id, website: row.website, homeProbe: probe,
      ...observed, checkedListings };
  }
  if (claim) return { id: row.id, website: row.website, homeProbe: probe, ...claim,
    evidenceUrl: null, listingIndexability: 'unknown', checkedListings };
  return { id: row.id, website: row.website, homeProbe: probe,
    resolution: 'unverified-no-template',
    evidenceUrl: null, listingIndexability: 'unknown', checkedListings };
}

async function mapLimit(values, worker, limit = CONCURRENCY) {
  const output = new Array(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      // eslint-disable-next-line no-await-in-loop
      output[index] = await worker(values[index], index);
    }
  }));
  return output;
}

function writeFindings(payload) {
  fs.writeFileSync(FINDINGS_FILE, `${JSON.stringify(payload, null, 2)}\n`);
}

async function scan() {
  const rows = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const unknown = rows.filter((row) => row.followEvidence === 'unknown');
  if (!unknown.length) throw new Error('No unknown product-launch evidence records remain to scan.');
  const claims = qualityClaims();
  let completed = 0;
  const findings = await mapLimit(unknown, async (row) => {
    const finding = await researchRow(row, claims);
    completed += 1;
    if (completed % 25 === 0 || completed === unknown.length) {
      console.error(`Evidence research: ${completed}/${unknown.length}`);
    }
    return finding;
  });
  const payload = {
    generatedAt: new Date().toISOString(),
    checkedAt: TODAY,
    methodology: 'Public HTML listing-template inspection with bounded home, internal-route and sitemap discovery.',
    initialUnknownIds: unknown.map((row) => row.id),
    findings,
  };
  writeFindings(payload);
  report(payload);
}

function appendSource(row, source) {
  if (source && !row.sources.includes(source)) row.sources.push(source);
}

function limitationFor(finding) {
  if (finding.resolution.startsWith('observed-')) {
    const type = finding.resolution.replace('observed-', '');
    const index = finding.listingIndexability === 'noindex'
      ? ' The inspected listing carried a noindex directive.' : ' The inspected listing was indexable.';
    return `A direct external ${type} link was observed on the cited public listing template.${index} Link treatment and submission rules can change, so recheck before payment.`;
  }
  if (finding.resolution === 'source-claimed-follow') {
    const reciprocal = finding.backlinkRequired === 'Yes'
      ? ' The source reports a reciprocal backlink or badge requirement; treat this as a link-exchange risk.' : '';
    return `The cited directory source claims follow treatment, but no public listing link was independently observed in this pass. This is not guaranteed backlink evidence.${reciprocal}`;
  }
  if (finding.resolution === 'source-claimed-nofollow') {
    return 'The cited directory source claims nofollow treatment, but no public listing link was independently observed in this pass.';
  }
  if (finding.resolution === 'unverified-protected') {
    return 'The domain or listing surface was browser-protected when checked, so link rel and indexability could not be inspected. This status does not imply follow or nofollow.';
  }
  if (finding.resolution === 'unverified-unreachable') {
    return 'The domain was unreachable or returned a non-success response when checked. No current public listing link could be inspected.';
  }
  if (finding.resolution === 'not-applicable') {
    return 'This is a submission service rather than a public listing platform; no first-party public listing template was found, so follow/nofollow is not applicable.';
  }
  return 'The domain was reached, but bounded homepage, internal-route and sitemap discovery found no verifiable public listing template. This completed result does not imply follow or nofollow.';
}

function apply() {
  const payload = JSON.parse(fs.readFileSync(FINDINGS_FILE, 'utf8'));
  const rows = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const byId = new Map(payload.findings.map((finding) => [finding.id, finding]));
  const remaining = rows.filter((row) => row.followEvidence === 'unknown');
  const missing = remaining.filter((row) => !byId.has(row.id));
  if (missing.length) throw new Error(`Evidence findings missing ${missing.length} unknown records.`);
  if (payload.initialUnknownIds.length !== byId.size) {
    throw new Error('Evidence findings are incomplete or contain duplicate ids.');
  }
  for (const row of remaining) {
    const finding = byId.get(row.id);
    row.followEvidence = finding.resolution;
    row.evidenceUrl = finding.resolution.startsWith('observed-') ? finding.evidenceUrl : null;
    row.listingIndexability = finding.resolution.startsWith('observed-')
      ? finding.listingIndexability : 'unknown';
    if (['live', 'protected', 'unreachable'].includes(finding.homeProbe.availability)) {
      row.availability = finding.homeProbe.availability;
    }
    row.limitations = limitationFor(finding);
    row.lastVerified = payload.checkedAt;
    appendSource(row, row.evidenceUrl);
    appendSource(row, finding.claimSource);
  }
  for (const row of rows) row.opportunityScore = build.scoreFor(row);
  rows.sort(build.compareForRanking);
  rows.forEach((row, index) => { row.rank = index + 1; });
  build.validate(rows);
  fs.writeFileSync(DATA_FILE, `${JSON.stringify(rows, null, 2)}\n`);
  console.log(`Evidence apply: resolved ${remaining.length}; unknown remaining 0.`);
}

function report(payload = JSON.parse(fs.readFileSync(FINDINGS_FILE, 'utf8'))) {
  const counts = payload.findings.reduce((all, finding) => {
    all[finding.resolution] = (all[finding.resolution] || 0) + 1;
    return all;
  }, {});
  console.log('PRODUCT LAUNCH EVIDENCE RESOLUTION');
  console.log(`  records researched: ${payload.findings.length}`);
  for (const [state, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${state}: ${count}`);
  }
}

if (require.main === module) {
  if (process.argv.includes('--scan')) scan().catch((error) => { console.error(error); process.exit(1); });
  else if (process.argv.includes('--apply')) apply();
  else report();
}

module.exports = { scan, apply, report, availabilityFor, pathScore, inspectListing,
  internalCandidates, limitationFor };
