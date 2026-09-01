#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const DR = require('./research-domain-rating.cjs');
const build = require('./build-product-launch-platforms.cjs');

const ROOT = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'data/product-launch-platforms/platforms.json');
const FINDINGS_FILE = path.join(ROOT, 'data/product-launch-platforms/.quality-findings.json');
const DR_FILE = path.join(ROOT, 'data/domain-rating/.ahrefs-domain-rating.json');
const SOURCE = 'https://submitmap.com';
const TODAY = new Date().toISOString().slice(0, 10);
const USER_AGENT = 'PetroHrys Research Center quality audit/1.0';
const TIMEOUT_MS = 15000;
const CONCURRENCY = 16;
const EXCLUDED_DESCRIPTION = /not taking submissions|no submission form|no way to publish|no sign-in route/i;

const decodeHtml = (value) => String(value || '')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'")
  .replace(/&#x2F;/g, '/').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

const hostOf = (value) => {
  try { return new URL(value).hostname.replace(/^www\./, '').toLowerCase(); } catch { return null; }
};

const originOf = (value) => {
  try { return new URL(value).origin; } catch { return value; }
};

const slug = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

const goodProbe = (probe) => probe && ['live', 'protected'].includes(probe.availability);

async function request(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' },
      signal: controller.signal,
    });
    const contentType = response.headers.get('content-type') || '';
    let body = '';
    if (contentType.includes('text') || contentType.includes('html')) body = await response.text();
    else if (response.body) await response.body.cancel();
    return {
      status: response.status,
      finalUrl: response.url,
      body,
      xRobotsTag: response.headers.get('x-robots-tag') || '',
    };
  } catch (error) {
    return { status: 0, finalUrl: url, body: '', error: error.name || error.message, xRobotsTag: '' };
  } finally {
    clearTimeout(timer);
  }
}

function availabilityFor(result) {
  if (!result || !result.status) return 'unreachable';
  const interstitial = /cloudflare|captcha|access denied|just a moment/i
    .test(String(result.body || '').slice(0, 6000));
  if ([401, 403, 406, 429].includes(result.status) || interstitial) return 'protected';
  return result.status >= 200 && result.status < 400 ? 'live' : 'unreachable';
}

async function mapLimit(values, worker, limit = CONCURRENCY) {
  const output = new Array(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      // eslint-disable-next-line no-await-in-loop
      output[index] = await worker(values[index], index);
    }
  }));
  return output;
}

function parseSpec(body, label) {
  const pattern = new RegExp(`${label}<\\/span>[\\s\\S]{0,750}?<span[^>]*>(?:<a[^>]+>)?([^<]+)`, 'i');
  return decodeHtml((body.match(pattern) || [])[1]).trim();
}

function parseDetail(slugValue, result) {
  const body = result.body || '';
  const visit = body.match(/<a href="(https?:\/\/[^"<]+)" target="_blank" rel="nofollow noopener noreferrer" class="btn-teal[^>]*>Visit<\/a>/i);
  if (!visit) return null;
  const website = decodeHtml(visit[1]);
  const submit = body.match(/Submit page<\/span>[\s\S]{0,900}?<a href="([^"]+)"/i);
  return {
    slug: slugValue,
    name: decodeHtml((body.match(/<title>How to submit to (.*?) \| SubmitMap<\/title>/i) || [])[1]),
    description: decodeHtml((body.match(/<meta name="description" content="([^"]*)"/i) || [])[1]),
    website,
    host: hostOf(website),
    detailUrl: result.finalUrl,
    sourceDomainRating: Number(parseSpec(body, 'Domain rating')) || 0,
    pricing: parseSpec(body, 'Pricing').toLowerCase(),
    sourceFollowClaim: /^yes$/i.test(parseSpec(body, 'Dofollow link')),
    backlinkRequired: parseSpec(body, 'Backlink required'),
    submissionUrl: submit ? decodeHtml(submit[1]) : null,
  };
}

async function collectDetails() {
  const detailSlugs = new Set();
  for (let page = 1; page <= 24; page += 1) {
    // eslint-disable-next-line no-await-in-loop
    const result = await request(`${SOURCE}/platforms/${page === 1 ? '' : `?page=${page}`}`);
    for (const match of result.body.matchAll(/href="\/platform\/([a-z0-9-]+)\/"/g)) {
      detailSlugs.add(match[1]);
    }
  }
  const values = [...detailSlugs];
  const details = await mapLimit(values, async (value, index) => {
    const result = await request(`${SOURCE}/platform/${value}/`);
    if ((index + 1) % 100 === 0) console.error(`SubmitMap details: ${index + 1}/${values.length}`);
    return parseDetail(value, result);
  });
  return details.filter(Boolean);
}

function externalLinks(body) {
  const links = [];
  for (const match of String(body || '').matchAll(/<a\b[^>]*?href="([^"]+)"[^>]*>/gi)) {
    const href = decodeHtml(match[1]);
    try {
      const url = new URL(href, `${SOURCE}/`);
      if (url.protocol.startsWith('http') && hostOf(url.href) !== 'submitmap.com') links.push(url.href);
    } catch { /* Ignore malformed discovery links. */ }
  }
  return [...new Set(links)];
}

function inspectEvidence(url, result) {
  const relSets = [];
  for (const match of String(result.body || '').matchAll(/<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>/gi)) {
    try {
      const target = new URL(decodeHtml(match[2]), result.finalUrl);
      if (hostOf(target.href) !== 'submitmap.com') continue;
      const attributes = `${match[1]} ${match[3]}`;
      const rel = (attributes.match(/\brel=["']([^"']*)["']/i) || [])[1] || '';
      relSets.push(rel.toLowerCase().split(/\s+/).filter(Boolean));
    } catch { /* Ignore malformed listing links. */ }
  }
  if (!relSets.length) return null;
  const blocked = (tokens) => tokens.some((token) => ['nofollow', 'ugc', 'sponsored'].includes(token));
  const followed = relSets.some((tokens) => !blocked(tokens));
  const qualified = relSets.some(blocked);
  const robots = `${result.xRobotsTag} ${(result.body.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)/i) || [])[1] || ''}`;
  return {
    url,
    finalUrl: result.finalUrl,
    status: result.status,
    backlinkType: followed && qualified ? 'observed-mixed' : followed
      ? 'observed-follow' : 'observed-nofollow',
    listingIndexability: /noindex/i.test(robots) ? 'noindex' : 'indexable',
    relTokens: [...new Set(relSets.flat())].sort(),
  };
}

async function collectEvidence() {
  const home = await request(`${SOURCE}/`);
  const links = externalLinks(home.body);
  const findings = await mapLimit(links, async (url) => inspectEvidence(url, await request(url)), 12);
  return findings.filter(Boolean);
}

async function probeDetails(details) {
  const eligible = details.filter((row) => row.host && row.submissionUrl
    && row.sourceDomainRating >= 20 && row.sourceFollowClaim);
  return mapLimit(eligible, async (row) => {
    const [home, submission] = await Promise.all([request(row.website), request(row.submissionUrl)]);
    return {
      ...row,
      homeProbe: { status: home.status, finalUrl: home.finalUrl, availability: availabilityFor(home) },
      submissionProbe: {
        status: submission.status,
        finalUrl: submission.finalUrl,
        availability: availabilityFor(submission),
      },
    };
  });
}

async function measureNewCandidates(details, existingHosts) {
  const cache = JSON.parse(fs.readFileSync(DR_FILE, 'utf8'));
  const measured = new Map(cache.findings.filter((row) => row.state === 'MEASURED')
    .map((row) => [row.target, row]));
  const targets = [...new Set(details.filter((row) => !existingHosts.has(row.host)
    && goodProbe(row.homeProbe) && goodProbe(row.submissionProbe)
    && row.backlinkRequired === 'No' && !EXCLUDED_DESCRIPTION.test(row.description))
    .map((row) => row.host))];
  const key = DR.apiKey();
  if (!key && targets.some((target) => !measured.has(target))) {
    throw new Error('AHREFS_API_KEY is required to measure new quality candidates.');
  }
  const results = [];
  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    const cached = measured.get(target);
    // eslint-disable-next-line no-await-in-loop
    const answer = cached ? { ok: true, domainRating: cached.domainRating, cached: true }
      : await DR.askAhrefs(target, key);
    results.push({ target, ...answer, checkedAt: cached ? cached.checkedAt : TODAY });
    if ((index + 1) % 20 === 0 || index + 1 === targets.length) {
      console.error(`Ahrefs quality targets: ${index + 1}/${targets.length}`);
    }
    if (!cached && index + 1 < targets.length) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => { setTimeout(resolve, 1200); });
    }
  }
  return results;
}

async function scan() {
  const existing = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const existingHosts = new Set(existing.map((row) => hostOf(row.website)));
  const details = await collectDetails();
  console.error(`SubmitMap details collected: ${details.length}`);
  const probed = await probeDetails(details);
  console.error(`Actionable source candidates probed: ${probed.length}`);
  const evidence = await collectEvidence();
  console.error(`Independent listing templates observed: ${evidence.length}`);
  const domainRatings = await measureNewCandidates(probed, existingHosts);
  const storedDetails = probed.map(({ description, ...row }) => ({
    ...row,
    wasExisting: existingHosts.has(row.host),
    excludedBySourceSignal: EXCLUDED_DESCRIPTION.test(description),
    inferredType: typeFor(row),
    inferredFocus: focusFor(row),
  }));
  const payload = {
    generatedAt: new Date().toISOString(),
    checkedAt: TODAY,
    source: SOURCE,
    sourcePlatformCount: details.length,
    details: storedDetails,
    evidence,
    domainRatings,
  };
  fs.writeFileSync(FINDINGS_FILE, `${JSON.stringify(payload, null, 2)}\n`);
  report(payload);
}

function typeFor(row) {
  const text = `${row.name} ${row.description} ${row.host}`.toLowerCase();
  if (/mcp|developer|boilerplate|prompt/.test(text)) return 'developer-community';
  if (/launch|hunt|go-public|publicly/.test(text)) return 'launch-board';
  if (/\bai\b|ai tool/.test(text)) return 'ai-software-directory';
  if (/business/.test(text)) return 'business-directory';
  return 'product-directory';
}

function focusFor(row) {
  const text = `${row.name} ${row.description} ${row.host}`.toLowerCase();
  if (/mcp|developer|boilerplate|prompt/.test(text)) return 'developers';
  if (/\bai\b|ai tool/.test(text)) return 'ai';
  if (/design|gallery|footer|resource/.test(text)) return 'design';
  if (/indie|solo|micro/.test(text)) return 'indie';
  if (/saas|startup|launch/.test(text)) return 'startups';
  return 'general';
}

function noteFor(row, type) {
  const labels = {
    'launch-board': 'Product launch board',
    'developer-community': 'Developer product registry',
    'ai-software-directory': 'AI and software directory',
    'business-directory': 'Business directory',
    'product-directory': 'Product discovery directory',
  };
  return `${labels[type]} with a public submission route documented and checked during the quality audit.`;
}

function limitationFor(row, evidence) {
  const cost = row.pricing === 'paid' ? ' Submission was paid when checked.' : '';
  const reciprocal = row.backlinkRequired === 'Yes'
    ? ' The source reports a reciprocal backlink or badge requirement; treat this as a link-exchange risk.' : '';
  if (evidence) {
    const kind = evidence.backlinkType === 'observed-follow' ? 'follow'
      : evidence.backlinkType === 'observed-nofollow' ? 'nofollow' : 'mixed';
    const index = evidence.listingIndexability === 'noindex' ? ' The inspected page was noindex.' : '';
    return `A direct ${kind} link was observed on the cited public listing template.${index}`
      + ` The submission route was reached, but placement rules can change.${reciprocal}${cost}`;
  }
  return 'SubmitMap reports follow treatment and no required reciprocal backlink, and the submission route was reached. '
    + `No public listing template was independently verified in this pass, so this remains a source claim rather than guaranteed backlink evidence.${cost}`;
}

function appendSource(row, source) {
  if (source && !row.sources.includes(source)) row.sources.push(source);
}

function updateDomainRatingLedger(rows, ratings) {
  const cache = JSON.parse(fs.readFileSync(DR_FILE, 'utf8'));
  const byTarget = new Map(cache.findings.map((finding) => [finding.target, finding]));
  for (const row of rows) {
    const target = hostOf(row.website);
    const rating = ratings.get(target);
    if (!rating || !rating.ok) continue;
    const record = { collection: 'product-launch-platforms', id: row.id };
    const current = byTarget.get(target);
    if (current) {
      if (!current.records.some((item) => item.collection === record.collection && item.id === record.id)) {
        current.records.push(record);
      }
      continue;
    }
    const finding = {
      key: `ahrefs|domain-rating|${target}`,
      target,
      provider: 'Ahrefs',
      state: 'MEASURED',
      domainRating: rating.domainRating,
      checkedAt: rating.checkedAt,
      records: [record],
    };
    cache.findings.push(finding);
    byTarget.set(target, finding);
  }
  cache.probedAt = TODAY;
  cache.findings.sort((a, b) => a.target.localeCompare(b.target));
  fs.writeFileSync(DR_FILE, `${JSON.stringify(cache, null, 1)}\n`);
}

function apply() {
  const findings = JSON.parse(fs.readFileSync(FINDINGS_FILE, 'utf8'));
  const rows = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const byHost = new Map(rows.map((row) => [hostOf(row.website), row]));
  const details = new Map(findings.details.map((row) => [row.host, row]));
  const evidence = new Map(findings.evidence.map((row) => [hostOf(row.finalUrl || row.url), row]));
  const ratings = new Map(findings.domainRatings.map((row) => [row.target, row]));
  let upgradedEvidence = 0;
  let filledRoutes = 0;
  let upgradedClaims = 0;

  for (const row of rows) {
    const host = hostOf(row.website);
    const detail = details.get(host);
    const observed = evidence.get(host);
    const observedUrl = observed && (observed.finalUrl || observed.url);
    if (observed && ['unknown', 'source-claimed-follow'].includes(row.followEvidence)) {
      row.followEvidence = observed.backlinkType;
      row.evidenceUrl = observedUrl;
      row.listingIndexability = observed.listingIndexability;
      row.limitations = limitationFor(detail || { pricing: row.pricing }, observed);
      appendSource(row, row.evidenceUrl);
      upgradedEvidence += 1;
    } else if (observed && row.evidenceUrl === observedUrl
      && row.followEvidence === observed.backlinkType) {
      row.limitations = limitationFor(detail || { pricing: row.pricing }, observed);
    }
    if (!detail || !goodProbe(detail.homeProbe) || !goodProbe(detail.submissionProbe)) continue;
    if (!row.submissionUrl && detail.submissionUrl) {
      row.submissionUrl = detail.submissionUrl;
      row.submissionRouteObserved = true;
      appendSource(row, detail.submissionUrl);
      filledRoutes += 1;
    }
    if (row.followEvidence === 'unknown' && detail.sourceFollowClaim
      && detail.backlinkRequired === 'No') {
      row.followEvidence = 'source-claimed-follow';
      row.evidenceUrl = null;
      row.limitations = limitationFor(detail, null);
      upgradedClaims += 1;
    }
    if (detail.homeProbe.availability === 'live' && row.availability !== 'live') {
      row.availability = 'live';
    }
    appendSource(row, detail.detailUrl);
    row.lastVerified = findings.checkedAt;
  }

  const selected = findings.details.filter((row) => !byHost.has(row.host)
    && row.sourceFollowClaim && row.backlinkRequired === 'No'
    && goodProbe(row.homeProbe) && goodProbe(row.submissionProbe)
    && !row.excludedBySourceSignal
    && ratings.get(row.host)?.ok && ratings.get(row.host).domainRating >= 20);

  const added = [];
  for (const detail of selected) {
    const rating = ratings.get(detail.host);
    const observed = evidence.get(detail.host);
    const type = detail.inferredType || typeFor(detail);
    const id = `plp-${slug(detail.host)}`;
    if (rows.some((row) => row.id === id)) throw new Error(`Duplicate generated id: ${id}`);
    const row = {
      rank: 0,
      id,
      name: detail.name,
      website: originOf(detail.website),
      platformType: type,
      focus: detail.inferredFocus || focusFor(detail),
      pricing: ['free', 'freemium', 'paid', 'mixed'].includes(detail.pricing)
        ? detail.pricing : 'unknown',
      availability: detail.homeProbe.availability,
      submissionUrl: detail.submissionUrl,
      submissionRouteObserved: true,
      followEvidence: observed ? observed.backlinkType : 'source-claimed-follow',
      evidenceUrl: observed ? observed.finalUrl || observed.url : null,
      listingIndexability: observed ? observed.listingIndexability : 'unknown',
      domainRating: rating.domainRating,
      metricsProvenance: {
        domainRating: {
          provider: 'Ahrefs',
          measuredAt: rating.checkedAt,
          status: 'publicApiReading',
          measuredDomain: detail.host,
        },
      },
      opportunityScore: 0,
      shortNote: noteFor(detail, type),
      limitations: limitationFor(detail, observed),
      lastVerified: findings.checkedAt,
      sources: [originOf(detail.website), detail.submissionUrl,
        ...(observed ? [observed.finalUrl || observed.url] : []), detail.detailUrl],
    };
    rows.push(row);
    byHost.set(detail.host, row);
    added.push(row);
  }

  for (const row of rows) row.opportunityScore = build.scoreFor(row);
  rows.sort(build.compareForRanking);
  rows.forEach((row, index) => { row.rank = index + 1; });
  build.validate(rows);
  fs.writeFileSync(DATA_FILE, `${JSON.stringify(rows, null, 2)}\n`);
  updateDomainRatingLedger(added, ratings);
  console.log(`Quality apply: added ${added.length}; evidence upgrades ${upgradedEvidence}; `
    + `claim upgrades ${upgradedClaims}; submission routes filled ${filledRoutes}.`);
}

function report(payload = JSON.parse(fs.readFileSync(FINDINGS_FILE, 'utf8'))) {
  const ratings = new Map(payload.domainRatings.map((row) => [row.target, row]));
  const candidates = payload.details.filter((row) => !row.wasExisting);
  const publishable = candidates.filter((row) => row.sourceFollowClaim
    && row.backlinkRequired === 'No' && goodProbe(row.homeProbe) && goodProbe(row.submissionProbe)
    && !row.excludedBySourceSignal
    && ratings.get(row.host)?.domainRating >= 20);
  console.log('PRODUCT LAUNCH QUALITY FINDINGS');
  console.log(`  source platform records: ${payload.sourcePlatformCount}`);
  console.log(`  actionable records probed: ${payload.details.length}`);
  console.log(`  independent listing templates: ${payload.evidence.length}`);
  console.log(`  new source candidates: ${candidates.length}`);
  console.log(`  publishable without reciprocal link: ${publishable.length}`);
  console.log(`  reciprocal-link candidates retained only in findings: ${candidates.filter((row) => row.backlinkRequired === 'Yes').length}`);
}

if (require.main === module) {
  if (process.argv.includes('--scan')) scan().catch((error) => { console.error(error); process.exit(1); });
  else if (process.argv.includes('--apply')) apply();
  else report();
}

module.exports = { scan, apply, report, typeFor, focusFor, availabilityFor, inspectEvidence };
