#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const render = require('./lib/bd-render.cjs');
const seo = require('./lib/bd-seo.cjs');

const ROOT = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'data/product-launch-platforms/platforms.json');
const OUT_DIR = path.join(ROOT, 'research/product-launch-platforms');
const PAGE_FILE = path.join(OUT_DIR, 'index.html');
const CSV_FILE = path.join(OUT_DIR, 'platforms.csv');

const TYPES = new Set(['launch-board', 'startup-directory', 'ai-software-directory',
  'product-directory', 'developer-community', 'software-review', 'crowdfunding',
  'business-directory', 'newsletter-directory', 'submission-service']);
const PRICES = new Set(['free', 'freemium', 'mixed', 'paid', 'unknown']);
const AVAILABILITY = new Set(['live', 'protected', 'not-probed', 'unreachable']);
const EVIDENCE = new Set(['observed-follow', 'observed-mixed', 'observed-nofollow',
  'source-claimed-follow', 'unknown']);
const TYPE_LABELS = {
  'launch-board': 'Launch board',
  'startup-directory': 'Startup directory',
  'ai-software-directory': 'AI / software directory',
  'product-directory': 'Product directory',
  'developer-community': 'Developer community',
  'software-review': 'Software review',
  crowdfunding: 'Crowdfunding',
  'business-directory': 'Business directory',
  'newsletter-directory': 'Newsletter',
  'submission-service': 'Submission service',
};
const EVIDENCE_LABELS = {
  'observed-follow': 'Follow observed',
  'observed-mixed': 'Conditional / mixed',
  'observed-nofollow': 'Nofollow observed',
  'source-claimed-follow': 'Follow claim to verify',
  unknown: 'Link type unknown',
};
const PRICE_LABELS = {
  free: 'Free', freemium: 'Free tier', mixed: 'Free and paid', paid: 'Paid', unknown: 'Unknown',
};

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const csv = (value) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

function scoreFor(row) {
  const evidence = { 'observed-follow': 34, 'observed-mixed': 24, 'source-claimed-follow': 12,
    'observed-nofollow': 7, unknown: 0 };
  const availability = { live: 12, protected: 5, 'not-probed': 0, unreachable: -20 };
  const type = { 'launch-board': 20, 'startup-directory': 17, 'ai-software-directory': 15,
    'product-directory': 13, 'developer-community': 11, 'software-review': 11,
    crowdfunding: 9, 'business-directory': 6, 'newsletter-directory': 7,
    'submission-service': 5 };
  const pricing = { free: 10, freemium: 8, mixed: 6, paid: 3, unknown: 0 };
  const indexability = { indexable: 10, mixed: 5, unknown: 0, noindex: -10 };
  const authority = row.domainRating >= 80 ? 8 : row.domainRating >= 60 ? 7
    : row.domainRating >= 40 ? 5 : row.domainRating >= 20 ? 3 : row.domainRating > 0 ? 1 : 0;
  const submission = row.submissionUrl && row.submissionRouteObserved ? 18
    : row.submissionUrl ? 10 : 0;
  return evidence[row.followEvidence] + availability[row.availability]
    + submission + type[row.platformType] + pricing[row.pricing]
    + authority + (indexability[row.listingIndexability] || 0);
}

function compareForRanking(a, b) {
  const evidence = { 'observed-follow': 4, 'observed-mixed': 3, 'source-claimed-follow': 2,
    'observed-nofollow': 1, unknown: 0 };
  const indexability = { indexable: 3, mixed: 2, unknown: 1, noindex: 0 };
  const availability = { live: 3, protected: 2, 'not-probed': 1, unreachable: 0 };
  const actionability = (row) => row.submissionUrl && row.submissionRouteObserved ? 2
    : row.submissionUrl ? 1 : 0;
  const nameOf = (row) => String(row.name || '').toLowerCase();
  return b.opportunityScore - a.opportunityScore
    || evidence[b.followEvidence] - evidence[a.followEvidence]
    || actionability(b) - actionability(a)
    || indexability[b.listingIndexability] - indexability[a.listingIndexability]
    || availability[b.availability] - availability[a.availability]
    || b.domainRating - a.domainRating
    || (nameOf(a) < nameOf(b) ? -1 : nameOf(a) > nameOf(b) ? 1 : 0)
    || (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);
}

function validate(rows) {
  if (!Array.isArray(rows) || rows.length !== 900) {
    throw new Error(`Product launch collection must contain exactly 900 rows; found ${rows.length}.`);
  }
  const ids = new Set();
  const hosts = new Set();
  rows.forEach((row, index) => {
    const label = row && row.id ? row.id : `row ${index + 1}`;
    if (row.rank !== index + 1) throw new Error(`${label}: rank is not contiguous.`);
    if (!/^plp-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.id)) throw new Error(`${label}: invalid id.`);
    if (ids.has(row.id)) throw new Error(`${label}: duplicate id.`);
    ids.add(row.id);
    let parsed;
    try { parsed = new URL(row.website); } catch { throw new Error(`${label}: invalid website.`); }
    if (parsed.protocol !== 'https:') throw new Error(`${label}: website is not HTTPS.`);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    if (hosts.has(host)) throw new Error(`${label}: duplicate host ${host}.`);
    hosts.add(host);
    if (!TYPES.has(row.platformType)) throw new Error(`${label}: invalid platform type.`);
    if (!PRICES.has(row.pricing)) throw new Error(`${label}: invalid pricing.`);
    if (!AVAILABILITY.has(row.availability)) throw new Error(`${label}: invalid availability.`);
    if (!EVIDENCE.has(row.followEvidence)) throw new Error(`${label}: invalid evidence state.`);
    if (row.followEvidence.startsWith('observed') && !row.evidenceUrl) {
      throw new Error(`${label}: observed evidence has no public listing URL.`);
    }
    const provenance = row.metricsProvenance && row.metricsProvenance.domainRating;
    if (!Number.isInteger(row.domainRating) || row.domainRating < 0 || row.domainRating > 100
      || !provenance || provenance.provider !== 'Ahrefs' || provenance.measuredDomain !== host) {
      throw new Error(`${label}: invalid Domain Rating provenance.`);
    }
    if (row.opportunityScore !== scoreFor(row)) throw new Error(`${label}: stale opportunity score.`);
    if (index > 0 && compareForRanking(rows[index - 1], row) > 0) {
      throw new Error(`${label}: collection is not in evidence-first ranking order.`);
    }
  });
  return rows;
}

function renderCsv(rows) {
  const columns = ['rank', 'id', 'name', 'website', 'platform_type', 'pricing', 'availability',
    'submission_url', 'follow_evidence', 'evidence_url', 'listing_indexability',
    'domain_rating', 'opportunity_score', 'last_verified', 'limitations'];
  const lines = [columns.join(',')];
  for (const row of rows) {
    lines.push([row.rank, row.id, row.name, row.website, row.platformType, row.pricing,
      row.availability, row.submissionUrl, row.followEvidence, row.evidenceUrl,
      row.listingIndexability, row.domainRating, row.opportunityScore, row.lastVerified,
      row.limitations].map(csv).join(','));
  }
  return `﻿${lines.join('\n')}\n`;
}

function renderMain(rows) {
  const observed = rows.filter((row) => row.followEvidence === 'observed-follow').length;
  const mixed = rows.filter((row) => row.followEvidence === 'observed-mixed').length;
  const nofollow = rows.filter((row) => row.followEvidence === 'observed-nofollow').length;
  const claims = rows.filter((row) => row.followEvidence === 'source-claimed-follow').length;
  const unknown = rows.filter((row) => row.followEvidence === 'unknown').length;
  const free = rows.filter((row) => ['free', 'freemium'].includes(row.pricing)).length;
  const linkStatusOf = (row) => {
    if (row.followEvidence === 'observed-follow') return 'follow';
    if (row.followEvidence === 'observed-nofollow') return 'nofollow';
    if (row.followEvidence === 'observed-mixed') return 'mixed';
    return 'unknown';
  };
  const facet = ({ id, label, values, labels }) => `        <div class="bd-control">
          <label class="bd-label" for="plp-${id}">${escapeHtml(label)}</label>
          <select class="bd-select" id="plp-${id}" data-bd-facet="${escapeHtml(id)}">
            <option value="">All</option>
${values.map((value) => `            <option value="${escapeHtml(value)}">${escapeHtml(labels[value] || value)}</option>`).join('\n')}
          </select>
        </div>`;
  const linkLabels = { follow: 'Follow observed', nofollow: 'Nofollow observed',
    mixed: 'Mixed / conditional', unknown: 'Unknown or claimed' };
  const availabilityLabels = { live: 'Live', protected: 'Browser protected',
    'not-probed': 'Not probed', unreachable: 'Unreachable' };
  const indexabilityLabels = { indexable: 'Indexable', noindex: 'Noindex', mixed: 'Mixed',
    unknown: 'Unknown' };
  const body = rows.map((row) => {
    const actions = [`<a class="bd-cta-link" href="${escapeHtml(row.website)}" rel="noopener noreferrer" target="_blank">Visit</a>`];
    if (row.submissionUrl) actions.push(`<a class="bd-cta-link" href="${escapeHtml(row.submissionUrl)}" rel="noopener noreferrer" target="_blank">Submit</a>`);
    if (row.evidenceUrl) actions.push(`<a class="bd-cta-link" href="${escapeHtml(row.evidenceUrl)}" rel="noopener noreferrer" target="_blank">Evidence</a>`);
    if (['source-claimed-follow', 'unknown'].includes(row.followEvidence)) {
      const researchSource = row.sources.find((source) => /launch-directories\.nicklaunches\.com|github\.com\/truvery|thestacc\.com/.test(source));
      if (researchSource) actions.push(`<a class="bd-cta-link" href="${escapeHtml(researchSource)}" rel="noopener noreferrer" target="_blank">Research source</a>`);
    }
    const haystack = [row.name, row.platformType, row.focus, row.shortNote].join(' ').toLowerCase();
    return `          <tr class="bd-row" data-bd-name="${escapeHtml(row.name)}" data-bd-haystack="${escapeHtml(haystack)}" data-bd-score="${row.opportunityScore}" data-bd-dr="${row.domainRating}" data-bd-facet-link="${linkStatusOf(row)}" data-bd-facet-evidence="${escapeHtml(row.followEvidence)}" data-bd-facet-cost="${escapeHtml(row.pricing)}" data-bd-facet-type="${escapeHtml(row.platformType)}" data-bd-facet-availability="${escapeHtml(row.availability)}" data-bd-facet-indexability="${escapeHtml(row.listingIndexability)}">
            <td class="bd-cell" data-bd-label="Rank"><strong>#${row.rank}</strong></td>
            <td class="bd-cell bd-cell--stack" data-bd-label="Platform"><div class="bd-cell-main"><a href="${escapeHtml(row.website)}" rel="noopener noreferrer" target="_blank">${escapeHtml(row.name)}</a><span class="bd-note">${escapeHtml(row.shortNote)}</span></div></td>
            <td class="bd-cell" data-bd-label="Type">${escapeHtml(TYPE_LABELS[row.platformType])}</td>
            <td class="bd-cell bd-cell--stack" data-bd-label="Follow evidence"><div class="bd-cell-main"><span class="bd-metric">${escapeHtml(EVIDENCE_LABELS[row.followEvidence])}</span><span class="bd-note">${escapeHtml(row.limitations)}</span></div></td>
            <td class="bd-cell" data-bd-label="Price">${escapeHtml(PRICE_LABELS[row.pricing])}</td>
            <td class="bd-cell" data-bd-label="DR"><span class="bd-metric">${row.domainRating}<span class="bd-metric-source"><a href="https://ahrefs.com/legal/domain-rating-license" rel="noopener noreferrer" target="_blank">Ahrefs</a> snapshot, measured <time datetime="2026-09-01">2026-09-01</time></span></span></td>
            <td class="bd-cell" data-bd-label="Score"><strong>${row.opportunityScore}</strong></td>
            <td class="bd-cell bd-actions" data-bd-label="Actions">${actions.join(' ')}</td>
          </tr>`;
  }).join('\n');
  return `    <article class="page-hero">
      <h1>Product Launch Platforms</h1>
      <p class="lede">${rows.length} ranked launch, startup, AI and software discovery platforms with separated follow evidence, pricing, submission routes and Domain Rating.</p>
    </article>

    <section class="bd-summary" aria-label="Collection summary">
      <p><strong>${observed}</strong> follow observed &middot; <strong>${nofollow}</strong> nofollow observed &middot; <strong>${mixed}</strong> mixed &middot; <strong>${claims}</strong> follow claims &middot; <strong>${unknown}</strong> unknown &middot; <strong>${free}</strong> free or freemium.</p>
      <p><a class="bd-cta-link" href="/research/product-launch-platforms/platforms.csv" download>Download CSV</a></p>
    </section>

    <section class="prose" aria-labelledby="methodology">
      <h2 id="methodology">How to read the ranking</h2>
      <p><strong>Follow observed</strong> means a direct external link without <code>nofollow</code>, <code>ugc</code> or <code>sponsored</code> was inspected on a public listing. <strong>Conditional / mixed</strong> means templates or tiers differed. <strong>Follow claim to verify</strong> is a discovery lead, not verified backlink evidence.</p>
      <p>The opportunity score weights observed link evidence and listing indexability first, followed by a verified submission route, availability, platform relevance and price. Ahrefs Domain Rating contributes at most eight points, so authority cannot outrank a materially better verified opportunity. Paid placements should use the appropriate <a href="https://developers.google.com/search/docs/crawling-indexing/qualify-outbound-links" rel="noopener noreferrer" target="_blank">link qualification</a>; this table does not promise ranking gains.</p>
    </section>

    <section aria-labelledby="ranked-platforms">
      <h2 id="ranked-platforms">Ranked platforms</h2>
      <div class="bd-controls" data-bd-filter-wrap hidden>
        <div class="bd-control" data-bd-search-wrap hidden>
          <label class="bd-label" for="plp-search">Search</label>
          <input class="bd-input" id="plp-search" type="search" data-bd-search autocomplete="off">
        </div>
        <div class="bd-control" data-bd-sort-wrap hidden>
          <label class="bd-label" for="plp-sort">Sort by</label>
          <select class="bd-select" id="plp-sort" data-bd-sort>
            <option value="as-published">Recommended order</option>
            <option value="domain-rating">Domain Rating: high to low</option>
            <option value="domain-rating-asc">Domain Rating: low to high</option>
            <option value="alphabetical">Name: A to Z</option>
          </select>
        </div>
        <div class="bd-control" data-bd-min-dr-wrap hidden>
          <label class="bd-label" for="plp-min-dr">Minimum Domain Rating</label>
          <select class="bd-select" id="plp-min-dr" data-bd-min-dr>
            <option value="">Any DR</option>
            <option value="20">20+</option><option value="40">40+</option>
            <option value="60">60+</option><option value="80">80+</option>
          </select>
        </div>
${facet({ id: 'link', label: 'Link status', values: ['follow', 'nofollow', 'mixed', 'unknown'], labels: linkLabels })}
${facet({ id: 'evidence', label: 'Evidence quality', values: [...EVIDENCE], labels: EVIDENCE_LABELS })}
${facet({ id: 'cost', label: 'Price', values: [...PRICES], labels: PRICE_LABELS })}
${facet({ id: 'type', label: 'Platform type', values: [...TYPES], labels: TYPE_LABELS })}
${facet({ id: 'availability', label: 'Availability', values: [...AVAILABILITY], labels: availabilityLabels })}
${facet({ id: 'indexability', label: 'Listing indexability', values: ['indexable', 'noindex', 'mixed', 'unknown'], labels: indexabilityLabels })}
        <div class="bd-control"><button class="bd-button" type="button" data-bd-clear>Clear filters</button></div>
      </div>
      <div class="bd-table-wrap">
        <table class="bd-table">
          <thead><tr><th>Rank</th><th>Platform</th><th>Type</th><th>Follow evidence</th><th>Price</th><th>DR</th><th>Score</th><th>Actions</th></tr></thead>
          <tbody data-bd-rows>
${body}
          </tbody>
        </table>
      </div>
    </section>`;
}

function main() {
  const rows = validate(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')));
  const meta = seo.buildProductLaunchPlatformsMeta({ count: rows.length });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(PAGE_FILE, render.renderPage({
    meta,
    main: renderMain(rows),
    locale: 'en',
    availableLocales: ['en'],
  }));
  fs.writeFileSync(CSV_FILE, renderCsv(rows));
  console.log(`Product launch platforms: ${rows.length} ranked; wrote page and CSV.`);
}

if (require.main === module) main();
module.exports = { validate, scoreFor, compareForRanking, renderCsv, renderMain,
  TYPES, PRICES, AVAILABILITY, EVIDENCE };
