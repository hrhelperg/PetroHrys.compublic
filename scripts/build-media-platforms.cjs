'use strict';

// Media, PR & Publishing Platforms — generator.
//
// A sibling of the business-directories and marketplaces builds, not part of
// either. It owns its own manifest under data/media-pr-publishing/, writes only
// inside research/media-pr-publishing/, and shares nothing with them except the
// geography file and the rendering conventions.
//
// Same three properties as every other artefact here:
//   DETERMINISTIC  same data in, byte-identical output, on any machine
//   OFFLINE        no network at build time, ever
//   NO EMPTY PAGE  the page and the export refuse to exist with nothing to say
//
// One rule shapes the whole render: a button is never drawn for a URL that does
// not exist. A greyed-out "Submit" that goes nowhere teaches a reader that the
// route exists and the site is broken, when the truth is that no route was
// established. Where a URL is absent the cell simply has one fewer action.

const fs = require('node:fs');
const path = require('node:path');
const MD = require('./lib/media-schema.cjs');
const MI = require('./lib/media-intelligence.cjs');
const REC = require('./lib/media-recommend.cjs');
const c = require('./lib/bd-components.cjs');
const render = require('./lib/bd-render.cjs');
const seo = require('./lib/bd-seo.cjs');

const ROOT = path.join(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'data', 'media-pr-publishing', 'media-platforms.json');
const COUNTRIES_FILE = path.join(ROOT, 'data', 'business-directories', 'countries.json');
const MANIFEST_FILE = path.join(ROOT, 'data', 'media-pr-publishing', '.build-manifest.json');
const OUT_DIR = path.join(ROOT, 'research', 'media-pr-publishing');
const PAGE_FILE = path.join(OUT_DIR, 'index.html');
const CSV_FILE = path.join(OUT_DIR, 'opportunities.csv');
const FOR_DIR = path.join(OUT_DIR, 'for');
// A recommendation page exists only where it has something to recommend. Below
// this it is a thin page carrying a heading and an apology, so it is not built
// at all and the sitemap never learns about it.
const MIN_RECOMMENDATIONS = 5;
const REC_LIMIT = 25;

const escapeHtml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// ── labels ──────────────────────────────────────────────────────────────────
// Every label is written once. A vocabulary value that gains a label here and
// nowhere else cannot drift between the filter, the row and the export.
const OPPORTUNITY_LABELS = {
  'self-publish': 'Self-publish',
  'press-release': 'Press release',
  'editorial-submission': 'Editorial submission',
  'editorial-pitch': 'Editorial pitch',
  'contributed-article': 'Contributed article',
  'guest-application': 'Guest application',
  'startup-launch': 'Startup launch',
  'product-launch': 'Product launch',
  'expert-source': 'Expert source',
  'journalist-source': 'Journalist source',
  'podcast-guest': 'Podcast guest',
  'newsletter-submission': 'Newsletter submission',
  'sponsored-content': 'Sponsored content',
  'media-partnership': 'Media partnership',
  'company-profile': 'Company profile',
  'award-entry': 'Award entry',
  unknown: 'Route not established',
};
const CATEGORY_LABELS = {
  'global-business-media': 'Global business media',
  'local-business-media': 'Local business media',
  'technology-media': 'Technology media',
  'startup-media': 'Startup media',
  'ai-media': 'AI media',
  'saas-media': 'SaaS media',
  'cybersecurity-media': 'Cybersecurity media',
  'marketing-media': 'Marketing media',
  'advertising-media': 'Advertising media',
  'finance-media': 'Finance media',
  'fintech-media': 'FinTech media',
  'manufacturing-media': 'Manufacturing media',
  'industrial-media': 'Industrial media',
  'telecom-media': 'Telecom media',
  'hr-recruitment-media': 'HR & recruitment media',
  'logistics-media': 'Logistics media',
  'energy-cleantech-media': 'Energy & cleantech media',
  'engineering-media': 'Engineering media',
  'construction-media': 'Construction media',
  'real-estate-media': 'Real estate media',
  'healthcare-media': 'Healthcare media',
  'legal-media': 'Legal media',
  'ecommerce-retail-media': 'Ecommerce & retail media',
  'travel-hospitality-media': 'Travel & hospitality media',
  'agriculture-food-media': 'Agriculture & food media',
  'automotive-media': 'Automotive media',
  'developer-open-source-media': 'Developer & open source media',
  'press-release-distribution': 'Press release distribution',
  'journalist-source-platform': 'Journalist source platform',
  'podcast-platform': 'Podcast platform',
  'newsletter-platform': 'Newsletter platform',
  'contributor-platform': 'Contributor platform',
  'startup-launch-platform': 'Startup launch platform',
  'business-awards': 'Business awards',
};
const COST_LABELS = {
  free: 'Free', paid: 'Paid', freemium: 'Free tier', mixed: 'Free and paid', unknown: 'Unknown',
};
const GEO_LABELS = {
  global: 'Global', regional: 'Regional', national: 'National', local: 'Local',
};
const STATUS_LABELS = { active: 'Active', unknown: 'Needs browser check' };
const PRIORITY_LABELS = { P1: 'P1', P2: 'P2', P3: 'P3', hold: 'Hold' };
const industryLabel = (s) => s.replace(/-/g, ' ').replace(/^./, (m) => m.toUpperCase());

// ── CSV ─────────────────────────────────────────────────────────────────────
// RFC 4180, CRLF, UTF-8 BOM — the same contract as the sibling exports, because
// an employee opens all three in the same spreadsheet.
//
// Public and editorial data only. No workflow state: the schema refuses the
// fields outright, and this list is the second place that refusal is visible.
const COLUMNS = ['id', 'name', 'website', 'country', 'audience_geography', 'categories',
  'industries', 'languages', 'opportunity_types', 'cost_model', 'priority', 'current_status',
  'submission_url', 'pitch_url', 'press_release_url', 'advertising_url', 'media_kit_url',
  'requires_editorial_approval', 'sponsored_content_available',
  // Derived columns. Computed at export time, never stored on a record, and
  // deliberately only four: the CSV is an employee work queue, not a dump of
  // every internal dimension.
  'media_score', 'media_score_band', 'publishing_model', 'best_for',
  'note', 'limitations', 'last_verified'];

function csvField(value) {
  if (value === null || value === undefined) return '';
  const s = Array.isArray(value) ? value.join('; ') : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const bool = (v) => (v === true ? 'yes' : v === false ? 'no' : '');

// Memoised so a 385-row export does not recompute the same score six times.
const SCORE_CACHE = new Map();
const scoreOf = (r) => {
  if (!SCORE_CACHE.has(r.id)) SCORE_CACHE.set(r.id, MI.mediaScore(r));
  return SCORE_CACHE.get(r.id);
};
// The business profiles this platform ranks well for, derived from the same
// engine the recommendation pages use — so the column and the page can never
// disagree about what a platform is good for.
const BEST_FOR_CACHE = new Map();
function bestForOf(r) {
  if (BEST_FOR_CACHE.has(r.id)) return BEST_FOR_CACHE.get(r.id);
  const hits = REC.PROFILES
    .map((p) => ({ p, rec: REC.recommend(r, p.key) }))
    .filter((x) => !x.rec.excluded && x.rec.score >= 70)
    .sort((a, b) => b.rec.score - a.rec.score)
    .slice(0, 3)
    .map((x) => x.p.slug);
  BEST_FOR_CACHE.set(r.id, hits);
  return hits;
}

function renderCsv(rows) {
  const lines = [COLUMNS.join(',')];
  for (const r of rows) {
    lines.push([r.id, r.name, r.website, r.country, r.audienceGeography, r.categories,
      r.industries, r.languages, r.opportunityTypes, r.costModel, r.priority, r.currentStatus,
      r.submissionUrl, r.pitchUrl, r.pressReleaseUrl, r.advertisingUrl, r.mediaKitUrl,
      bool(r.requiresEditorialApproval), bool(r.sponsoredContentAvailable),
      scoreOf(r).score ?? '', scoreOf(r).band ?? '', MI.publishingModel(r), bestForOf(r),
      r.shortNote, r.limitations, r.lastVerified].map(csvField).join(','));
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}

// ── page ────────────────────────────────────────────────────────────────────
// `multi` marks a facet whose row attribute holds a space-separated list, so the
// client filters on membership rather than equality. A record has several
// categories, industries, opportunity types and languages; it has exactly one
// country, cost and priority. Declared per facet rather than inferred from the
// name, because a facet named "category" that happened to be single-valued
// would otherwise silently get the wrong matcher.
function facet({ name, label, values, labels, multi = false }) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  const options = [...counts.entries()]
    .sort((a, b) => (b[1] - a[1]) || MD.compareStable(a[0], b[0]))
    .map(([v, n]) => `          <option value="${escapeHtml(v)}">${escapeHtml(labels[v] || v)} (${n})</option>`)
    .join('\n');
  return `      <div class="bd-control">
        <label class="bd-label" for="md-facet-${name}">${escapeHtml(label)}</label>
        <select class="bd-select" id="md-facet-${name}" data-bd-facet="${name}"${multi ? ' data-bd-facet-multi' : ''}>
          <option value="">All</option>
${options}
        </select>
      </div>`;
}

// Actions are drawn only for URLs that exist. Never a disabled control, never a
// link to a homepage standing in for a route that was not found.
function actions(r) {
  const links = [
    [r.website, 'Visit'],
    [r.submissionUrl, 'Submit'],
    [r.pitchUrl, 'Pitch'],
    [r.pressReleaseUrl, 'Send release'],
    [r.advertisingUrl, 'Advertise'],
    [r.mediaKitUrl, 'Media kit'],
    [r.contactUrl, 'Contact'],
  ].filter(([url]) => typeof url === 'string' && url);
  return links.map(([url, text]) =>
    `<a class="bd-cta-link" href="${escapeHtml(url)}" rel="noopener noreferrer" target="_blank">${text}</a>`)
    .join(' ');
}

// Which profiles earn a page: enough results, and enough of them actually about
// this kind of business. Computed once and used by BOTH the page emitter and the
// worklist's link list — the first version let the worklist link all 17 profiles
// while only 13 pages were generated, so four links went nowhere.
function eligibleProfiles(rows) {
  return REC.PROFILES.filter((profile) => {
    const ranked = REC.rankFor(rows, profile.key, { limit: REC_LIMIT, minLevel: 'Marginal' });
    const specific = ranked.filter((x) => REC.qualifiesForProfile(x.recommendation)).length;
    return ranked.length >= MIN_RECOMMENDATIONS && specific >= MIN_RECOMMENDATIONS;
  });
}

function renderMain(rows, countryName) {
  const countries = new Set(rows.map((r) => r.country));
  const cats = new Set(rows.flatMap((r) => r.categories));
  const types = new Set(rows.flatMap((r) => r.opportunityTypes));
  const p1 = rows.filter((r) => r.priority === 'P1').length;
  const cov = MI.coverage(rows);

  const tableRows = rows.map((r) => {
    const typeText = r.opportunityTypes.map((t) => OPPORTUNITY_LABELS[t] || t).join(', ');
    const catText = r.categories.map((t) => CATEGORY_LABELS[t] || t).join(', ');
    const indText = r.industries.map(industryLabel).join(', ');
    const haystack = [r.name, countryName(r.country), catText, indText, typeText,
      r.shortNote].join(' ').toLowerCase();
    return `          <tr class="bd-row" data-bd-haystack="${escapeHtml(haystack)}" `
      + `data-bd-facet-country="${escapeHtml(r.country)}" `
      + `data-bd-facet-audience="${escapeHtml(r.audienceGeography)}" `
      + `data-bd-facet-category="${escapeHtml(r.categories.join(' '))}" `
      + `data-bd-facet-industry="${escapeHtml(r.industries.join(' '))}" `
      + `data-bd-facet-opportunity="${escapeHtml(r.opportunityTypes.join(' '))}" `
      + `data-bd-facet-language="${escapeHtml(r.languages.join(' '))}" `
      + `data-bd-facet-cost="${escapeHtml(r.costModel)}" `
      + `data-bd-facet-priority="${escapeHtml(r.priority)}" `
      + `data-bd-facet-status="${escapeHtml(r.currentStatus)}" `
      + `data-bd-facet-band="${escapeHtml(scoreOf(r).band || 'unscored')}" `
      + `data-bd-facet-bestfor="${escapeHtml(bestForOf(r).join(' '))}">
            <td class="bd-cell" data-bd-label="Platform"><a href="${escapeHtml(r.website)}" rel="noopener noreferrer" target="_blank">${escapeHtml(r.name)}</a></td>
            <td class="bd-cell" data-bd-label="Country">${escapeHtml(countryName(r.country))}</td>
            <td class="bd-cell" data-bd-label="Audience">${escapeHtml(GEO_LABELS[r.audienceGeography])}</td>
            <td class="bd-cell" data-bd-label="Category">${escapeHtml(catText)}</td>
            <td class="bd-cell" data-bd-label="Industry">${escapeHtml(indText)}</td>
            <td class="bd-cell" data-bd-label="Opportunity">${escapeHtml(typeText)}</td>
            <td class="bd-cell" data-bd-label="Cost">${escapeHtml(COST_LABELS[r.costModel])}</td>
            <td class="bd-cell" data-bd-label="Priority">${escapeHtml(PRIORITY_LABELS[r.priority] || r.priority)}</td>
            <td class="bd-cell" data-bd-label="Status">${escapeHtml(STATUS_LABELS[r.currentStatus] || r.currentStatus)}</td>
            <td class="bd-cell" data-bd-label="Media Score">${scoreOf(r).score === null
    ? '<span class="bd-metric bd-metric--empty">Not yet scored</span>'
    : `<strong>${scoreOf(r).score}</strong> ${escapeHtml(scoreOf(r).band)}`}</td>
            <td class="bd-cell" data-bd-label="Best for">${escapeHtml(bestForOf(r)
    .map((slug) => (REC.PROFILE_BY_KEY.get(slug.replace(/-/g, '-')) || {}).label
      || (REC.PROFILES.find((p) => p.slug === slug) || {}).label || slug).join(', '))}</td>
            <td class="bd-cell" data-bd-label="What it is">${escapeHtml(r.shortNote)}${
  r.limitations ? ` <em>${escapeHtml(r.limitations)}</em>` : ''}</td>
            <td class="bd-cell bd-actions" data-bd-label="Actions">${actions(r)}</td>
          </tr>`;
  }).join('\n');

  const head = ['Platform', 'Country', 'Audience', 'Category', 'Industry', 'Opportunity',
    'Cost', 'Priority', 'Status', 'Media Score', 'Best for', 'What it is', 'Actions'];

  const countryLabels = Object.fromEntries([...countries].map((s) => [s, countryName(s)]));
  const industryLabels = Object.fromEntries(
    [...new Set(rows.flatMap((r) => r.industries))].map((s) => [s, industryLabel(s)]));
  const languageLabels = Object.fromEntries(
    [...new Set(rows.flatMap((r) => r.languages))].map((s) => [s, s.toUpperCase()]));

  return [
    c.pageIntro({
      title: 'Media, PR & Publishing Platforms',
      lede: 'A global research database of media outlets, press release networks, contributor '
        + 'programmes, startup publications, journalist-source platforms and other publishing '
        + 'opportunities for companies, founders and experts.',
    }),
    `<section id="overview" aria-labelledby="overview-heading" class="bd-hero">
      <h2 id="overview-heading" class="bd-vh">Overview</h2>
      <ul class="bd-stats">
        <li class="bd-stat"><strong>${rows.length}</strong> opportunities</li>
        <li class="bd-stat"><strong>${countries.size}</strong> markets</li>
        <li class="bd-stat"><strong>${cats.size}</strong> categories</li>
        <li class="bd-stat"><strong>${types.size}</strong> opportunity types</li>
        <li class="bd-stat"><strong>${p1}</strong> top priority</li>
        <li class="bd-stat"><strong>${cov.scored}</strong> scored</li>
        <li class="bd-stat"><strong>${cov.routeVerified}</strong> verified routes</li>
      </ul>
    </section>`,
    `<section id="how-to-read" aria-labelledby="how-to-read-heading">
      <h2 id="how-to-read-heading">How to read this</h2>
      <p>${escapeHtml('A media outlet existing is not an opportunity. A contact page is not a '
        + 'submission route, an advertising rate card is not a contributor programme, and a '
        + 'newsroom address is not proof that outside articles are accepted. Every row states '
        + 'the opportunity type that was actually established, and where none could be, the '
        + 'row says so rather than guessing.')}</p>
      <p>${escapeHtml('The types are not interchangeable. Self-publish means you press publish. '
        + 'Press release means the platform carries your announcement. Editorial pitch means an '
        + 'editor decides and usually says no. Contributed article means outside experts can '
        + 'write. Sponsored content means you pay. Journalist source means reporters come '
        + 'looking for you. Reading one as another wastes a week.')}</p>
      <p>${escapeHtml('A blank cell means the fact was researched and not established — it never '
        + 'means no. Platforms behind a bot filter are marked "Needs browser check": the server '
        + 'answered, which says nothing about whether the route exists. An action button appears '
        + 'only where a real URL was found.')}</p>
    </section>`,
    `<section id="platforms" aria-labelledby="platforms-heading">
      <h2 id="platforms-heading">Platforms</h2>
      <div class="bd-controls">
        <div class="bd-control">
          <label class="bd-label" for="md-search">Search</label>
          <input class="bd-input" id="md-search" type="search" data-bd-search placeholder="Platform, category, note">
        </div>
${facet({ name: 'country', label: 'Country', values: rows.map((r) => r.country), labels: countryLabels })}
${facet({ name: 'audience', label: 'Audience', values: rows.map((r) => r.audienceGeography), labels: GEO_LABELS })}
${facet({ name: 'category', label: 'Category', values: rows.flatMap((r) => r.categories), labels: CATEGORY_LABELS, multi: true })}
${facet({ name: 'industry', label: 'Industry', values: rows.flatMap((r) => r.industries), labels: industryLabels, multi: true })}
${facet({ name: 'opportunity', label: 'Opportunity type', values: rows.flatMap((r) => r.opportunityTypes), labels: OPPORTUNITY_LABELS, multi: true })}
${facet({ name: 'cost', label: 'Cost', values: rows.map((r) => r.costModel), labels: COST_LABELS })}
${facet({ name: 'language', label: 'Language', values: rows.flatMap((r) => r.languages), labels: languageLabels, multi: true })}
${facet({ name: 'priority', label: 'Priority', values: rows.map((r) => r.priority), labels: PRIORITY_LABELS })}
${facet({ name: 'status', label: 'Status', values: rows.map((r) => r.currentStatus), labels: STATUS_LABELS })}
${facet({ name: 'band', label: 'Media Score', values: rows.map((r) => scoreOf(r).band || 'unscored'), labels: Object.fromEntries([...MI.BANDS.map((b) => [b.label, b.label]), ['unscored', 'Not yet scored']]) })}
${facet({ name: 'bestfor', label: 'Best for (business)', values: rows.flatMap((r) => bestForOf(r)), labels: Object.fromEntries(REC.PROFILES.map((p) => [p.slug, p.label])), multi: true })}
        <div class="bd-control">
          <button class="bd-button bd-button--ghost" type="button" data-bd-clear>Clear filters</button>
        </div>
      </div>
      <p class="bd-note"><a class="bd-button" href="${MD.collectionPath()}opportunities.csv" download>Download all ${rows.length} opportunities as CSV</a></p>
      <div class="bd-table-wrap">
        <table class="bd-table">
          <caption>Media, PR and publishing opportunities, highest priority first</caption>
          <thead><tr>${head.map((h) => `<th class="bd-cell" scope="col">${escapeHtml(h)}</th>`).join('')}</tr></thead>
          <tbody data-bd-rows>
${tableRows}
          </tbody>
        </table>
      </div>
    </section>`,
    `<section id="media-score" aria-labelledby="media-score-heading">
      <h2 id="media-score-heading">What Media Score means</h2>
      <p>${escapeHtml(`Media Score rates the opportunity itself, not your business. It is computed `
        + `from ${MI.DIMENSIONS.length} dimensions — ${MI.DIMENSIONS.map((d) => d.label.toLowerCase()).join(', ')} — `
        + `weighted to ${MI.TOTAL_WEIGHT}. It is never stored; it is recomputed from the record every build.`)}</p>
      <p>${escapeHtml(`A platform is scored only when at least ${MI.MIN_DIMENSIONS} dimensions and `
        + `${MI.MIN_WEIGHT} of the ${MI.TOTAL_WEIGHT} weight are available. Below that it reads `
        + `"Not yet scored", which is a statement about our research and not about the platform. `
        + `${cov.scored} of ${cov.total} are scored today; the other ${cov.unscored} have no `
        + `established opportunity route yet.`)}</p>
      <p>${escapeHtml('Media Score does not depend on who is asking. Whether a platform suits YOUR '
        + 'business is a different question, answered by the recommendation pages below, which '
        + 'combine this score with category fit, campaign objective and target market.')}</p>
      <p class="bd-note">${eligibleProfiles(rows).map((p) => `<a class="bd-cta-link" href="${MD.profilePath(p.slug)}">${escapeHtml(p.label)}</a>`).join(' ')}</p>
    </section>`,

    `<section id="scope" aria-labelledby="scope-heading">
      <h2 id="scope-heading">What is and is not here</h2>
      <p>${escapeHtml('Included: media outlets with an established publishing, pitching or '
        + 'contribution route; press release distribution networks; journalist-source platforms; '
        + 'startup and product launch platforms; contributor programmes; and paid editorial '
        + 'products where they are labelled as paid.')}</p>
      <p>${escapeHtml('Excluded: business directories and company registries, and marketplace and '
        + 'classified platforms — both answer different questions and live in their own datasets. '
        + 'Also excluded, deliberately: link farms, private blog networks, guest-post farms, sites '
        + 'that publish arbitrary unrelated content for money, expired domains, sites whose main '
        + 'offer is selling dofollow links, and anonymous release dumps with no readership. This '
        + 'database is meant to stay compatible with sustainable reputation building, which means '
        + 'refusing rows that would inflate the count.')}</p>
      <p>${escapeHtml('One publication is one record. Language editions, country mirrors sharing '
        + 'one editorial operation, sections, AMP hosts, and a submission form separate from the '
        + 'publication it serves are not separate opportunities.')}</p>
    </section>`,
  ].join('\n\n');
}


// ── recommendation pages (PART 18) ──────────────────────────────────────────
// Same engine as the worklist column and the CSV. There is exactly one place
// that decides what a platform is good for, so a page and a filter can never
// disagree.
function renderProfilePage(profile, ranked, countryName) {
  const rows = ranked.map(({ record: r, recommendation: rec }, i) => `          <tr class="bd-row" data-bd-rec-level="${escapeHtml(rec.level)}">
            <td class="bd-cell" data-bd-label="Rank">${i + 1}</td>
            <td class="bd-cell" data-bd-label="Platform"><a href="${escapeHtml(r.website)}" rel="noopener noreferrer" target="_blank">${escapeHtml(r.name)}</a></td>
            <td class="bd-cell" data-bd-label="Fit"><strong>${rec.score}</strong> ${escapeHtml(rec.level)}</td>
            <td class="bd-cell" data-bd-label="Media Score">${rec.mediaScore === null
    ? '<span class="bd-metric bd-metric--empty">Not yet scored</span>' : `${rec.mediaScore} ${escapeHtml(rec.mediaBand)}`}</td>
            <td class="bd-cell" data-bd-label="Market">${escapeHtml(countryName(r.country))}</td>
            <td class="bd-cell" data-bd-label="Opportunity">${escapeHtml(r.opportunityTypes.map((t) => OPPORTUNITY_LABELS[t] || t).join(', '))}</td>
            <td class="bd-cell" data-bd-label="Cost">${escapeHtml(COST_LABELS[r.costModel])}</td>
            <td class="bd-cell" data-bd-label="Why">${escapeHtml(rec.reasons.join('; '))}</td>
            <td class="bd-cell bd-actions" data-bd-label="Action">${actions(r)}</td>
          </tr>`).join('\n');
  const head = ['#', 'Platform', 'Fit', 'Media Score', 'Market', 'Opportunity', 'Cost', 'Why', 'Action'];
  const levels = {};
  for (const x of ranked) levels[x.recommendation.level] = (levels[x.recommendation.level] || 0) + 1;

  return [
    c.pageIntro({
      title: `Media opportunities for ${profile.label}`,
      lede: `${ranked.length} ranked places where a ${profile.label.toLowerCase()} business can `
        + 'publish, pitch, submit or sponsor — with the reason for every ranking.',
    }),
    `<section id="ranking" aria-labelledby="ranking-heading">
      <h2 id="ranking-heading">Ranked opportunities</h2>
      <p>${escapeHtml(`${Object.entries(levels).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(', ')}. `
        + 'Ranked by fit for this kind of business, not by fame. A platform appears here because '
        + 'the engine scored it, never because it was placed here by hand.')}</p>
      <div class="bd-table-wrap">
        <table class="bd-table">
          <caption>${escapeHtml(`Media opportunities ranked for ${profile.label}`)}</caption>
          <thead><tr>${head.map((h) => `<th class="bd-cell" scope="col">${escapeHtml(h)}</th>`).join('')}</tr></thead>
          <tbody data-bd-rows>
${rows}
          </tbody>
        </table>
      </div>
    </section>`,
    `<section id="method" aria-labelledby="method-heading">
      <h2 id="method-heading">How these were selected</h2>
      <p>${escapeHtml(`This profile is declared abstractly: publication categories `
        + `(${profile.categories.join(', ')})`
        + `${(profile.adjacent || []).length ? `, adjacent categories (${profile.adjacent.join(', ')})` : ''}`
        + `, industries (${profile.industries.join(', ')}) and subject keywords. It names no platform. `
        + 'Every result below is produced by matching those declarations against the registry, so the '
        + 'same rules that ranked this page rank every other one.')}</p>
      <p>${escapeHtml('A recommendation combines four things: how well the publication serves this '
        + 'kind of business, whether its opportunity type delivers the objective, whether it reaches '
        + 'the target market, and the intrinsic Media Score of the opportunity. A platform with no '
        + 'Media Score is still recommended, at a discount, because an unscored platform reflects a '
        + 'gap in our research rather than a fault in the platform.')}</p>
      <p>${escapeHtml('Explicit negative evidence disqualifies: a platform that has closed, was '
        + 'rejected on quality grounds, or offers no opportunity type capable of delivering the '
        + 'objective is excluded outright rather than ranked low. Missing evidence never excludes.')}</p>
    </section>`,
    `<section id="limitations" aria-labelledby="limitations-heading">
      <h2 id="limitations-heading">Limitations</h2>
      <p>${escapeHtml('The ranking is only as good as the underlying facts. Where a platform sits '
        + 'behind a bot filter its route could not be read, and the row says so — treat those as '
        + 'leads to confirm in a browser, not as verified opportunities.')}</p>
      <p>${escapeHtml('Media Score carries no traffic, Domain Rating or audience figures, because '
        + 'this repository measures none of those and will not estimate them. It is an editorial '
        + 'reading of the opportunity, not a prediction of results.')}</p>
      <p class="bd-note"><a class="bd-button" href="${MD.collectionPath()}">Back to the full database</a></p>
    </section>`,
  ].join('\n\n');
}

// ── build ───────────────────────────────────────────────────────────────────
function main() {
  const countries = JSON.parse(fs.readFileSync(COUNTRIES_FILE, 'utf8'));
  const nameBySlug = new Map(countries.map((x) => [x.slug, x.name]));
  const countryName = (slug) => nameBySlug.get(slug) || slug;
  const all = MD.loadMediaPlatforms(DATA_FILE, new Set(nameBySlug.keys()));
  const rows = all.filter(MD.isActionable).sort(MD.comparePlatforms);

  const profilePages = [];
  const suppressed = [];
  const previous = fs.existsSync(MANIFEST_FILE)
    ? JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8')).files || [] : [];

  const written = [];
  if (rows.length) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const html = render.renderPage({
      meta: seo.buildMediaMeta({
        count: rows.length,
        countries: new Set(rows.map((r) => r.country)).size,
        p1: rows.filter((r) => r.priority === 'P1').length,
      }),
      main: renderMain(rows, countryName),
    });
    writeIfChanged(PAGE_FILE, html, written);
    writeIfChanged(CSV_FILE, renderCsv(rows), written);

    const eligible = eligibleProfiles(rows);
    const eligibleKeys = new Set(eligible.map((p) => p.key));
    for (const profile of REC.PROFILES) {
      if (!eligibleKeys.has(profile.key)) {
        const ranked = REC.rankFor(rows, profile.key, { limit: REC_LIMIT, minLevel: 'Marginal' });
        const specific = ranked.filter((x) => REC.qualifiesForProfile(x.recommendation)).length;
        suppressed.push(`${profile.slug} (${specific} specific)`);
        continue;
      }
      const ranked = REC.rankFor(rows, profile.key, { limit: REC_LIMIT, minLevel: 'Marginal' });
      const file = path.join(ROOT, MD.profilePath(profile.slug).replace(/^\//, ''), 'index.html');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      writeIfChanged(file, render.renderPage({
        meta: seo.buildMediaProfileMeta({
          profile,
          count: ranked.length,
          objectiveLabel: 'brand awareness',
          canonicalPath: MD.profilePath(profile.slug),
          collectionPath: MD.collectionPath(),
        }),
        main: renderProfilePage(profile, ranked, countryName),
      }), written);
      profilePages.push(file);
    }
  }

  const owned = rows.length ? [PAGE_FILE, CSV_FILE, ...profilePages] : [];
  const ownedRel = owned.map((f) => path.relative(ROOT, f));
  const OUT_REL = `${path.relative(ROOT, OUT_DIR)}/`;
  let pruned = 0;
  for (const rel of previous) {
    if (ownedRel.includes(rel)) continue;
    // Prune only inside this build's own directory. The manifest is a file on
    // disk, and a build that deletes whatever the manifest names will delete
    // whatever a corrupted manifest names — during mutation testing a manifest
    // listing "sitemap.xml" caused exactly that, and the site sitemap was
    // removed by a generator that has no business touching it. A stale entry
    // outside the output directory is a bug to shout about, not a licence.
    if (!rel.startsWith(OUT_REL)) {
      throw new Error(`Refusing to prune ${rel}: outside ${OUT_REL}. `
        + 'The build manifest is corrupt — inspect it rather than deleting the file.');
    }
    const abs = path.join(ROOT, rel);
    if (fs.existsSync(abs)) { fs.unlinkSync(abs); pruned += 1; }
  }
  // A pruned page leaves its directory behind, and an empty directory under
  // /for/ looks like a route that exists and serves nothing. Removed here, and
  // only ever inside this build's own output.
  if (fs.existsSync(FOR_DIR)) {
    for (const entry of fs.readdirSync(FOR_DIR)) {
      const dir = path.join(FOR_DIR, entry);
      if (fs.statSync(dir).isDirectory() && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
    }
  }

  fs.mkdirSync(path.dirname(MANIFEST_FILE), { recursive: true });
  fs.writeFileSync(MANIFEST_FILE, `${JSON.stringify({ files: ownedRel.sort() }, null, 2)}\n`);

  const cov = MI.coverage(rows);
  console.log(`Media, PR & Publishing: ${rows.length} opportunity(ies) across `
    + `${new Set(rows.map((r) => r.country)).size} markets; ${cov.scored} scored; `
    + `${profilePages.length} recommendation page(s)`
    + `${suppressed.length ? ` (${suppressed.length} suppressed below ${MIN_RECOMMENDATIONS}: ${suppressed.join(', ')})` : ''}; `
    + `${written.length} written, ${pruned} pruned.`);
}

function writeIfChanged(file, content, written) {
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (existing === content) return;
  fs.writeFileSync(file, content);
  written.push(file);
}

if (require.main === module) main();
module.exports = {
  renderCsv, renderMain, renderProfilePage, eligibleProfiles, COLUMNS, MIN_RECOMMENDATIONS, REC_LIMIT, OPPORTUNITY_LABELS, CATEGORY_LABELS, COST_LABELS,
  GEO_LABELS, STATUS_LABELS, PRIORITY_LABELS, actions,
};
