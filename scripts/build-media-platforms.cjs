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
// Module-level import is the ENGLISH binding; the locale-bound set is derived
// from the translator each render function already receives. `t.locale` exists
// precisely so a renderer never has to be told the locale twice and cannot be
// told it inconsistently.
const componentsModule = require('./lib/bd-components.cjs');
const componentsFor = (t) => componentsModule.components(t.locale);
const render = require('./lib/bd-render.cjs');
const seo = require('./lib/bd-seo.cjs');
const I18N = require('./lib/i18n.cjs');

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
function facet({ name, label, values, labels, multi = false, t }) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  const options = [...counts.entries()]
    .sort((a, b) => (b[1] - a[1]) || MD.compareStable(a[0], b[0]))
    .map(([v, n]) => `          <option value="${escapeHtml(v)}">${escapeHtml(labels[v] || v)} (${n})</option>`)
    .join('\n');
  return `      <div class="bd-control">
        <label class="bd-label" for="md-facet-${name}">${escapeHtml(label)}</label>
        <select class="bd-select" id="md-facet-${name}" data-bd-facet="${name}"${multi ? ' data-bd-facet-multi' : ''}>
          <option value="">${escapeHtml(t('common.all'))}</option>
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

function renderMain(rows, countryName, t) {
  const c = componentsFor(t);
  const countries = new Set(rows.map((r) => r.country));
  const cats = new Set(rows.flatMap((r) => r.categories));
  const types = new Set(rows.flatMap((r) => r.opportunityTypes));
  const p1 = rows.filter((r) => r.priority === 'P1').length;
  const cov = MI.coverage(rows);

  const tableRows = rows.map((r) => {
    const typeText = r.opportunityTypes.map((x) => t(`opportunity.${x}`)).join(', ');
    const catText = r.categories.map((x) => CATEGORY_LABELS[x] || x).join(', ');
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
            <td class="bd-cell" data-bd-label="${escapeHtml(t('col.platform'))}"><a href="${escapeHtml(r.website)}" rel="noopener noreferrer" target="_blank">${escapeHtml(r.name)}</a></td>
            <td class="bd-cell" data-bd-label="${escapeHtml(t('col.country'))}">${escapeHtml(countryName(r.country))}</td>
            <td class="bd-cell" data-bd-label="${escapeHtml(t('col.audience'))}">${escapeHtml(t(`geo.${r.audienceGeography}`))}</td>
            <td class="bd-cell" data-bd-label="${escapeHtml(t('col.category'))}">${escapeHtml(catText)}</td>
            <td class="bd-cell" data-bd-label="${escapeHtml(t('col.industry'))}">${escapeHtml(indText)}</td>
            <td class="bd-cell" data-bd-label="${escapeHtml(t('col.opportunity'))}">${escapeHtml(typeText)}</td>
            <td class="bd-cell" data-bd-label="${escapeHtml(t('col.cost'))}">${escapeHtml(t(`cost.${r.costModel}`))}</td>
            <td class="bd-cell" data-bd-label="${escapeHtml(t('col.priority'))}">${escapeHtml(t(`priority.${r.priority}`))}</td>
            <td class="bd-cell" data-bd-label="${escapeHtml(t('col.status'))}">${escapeHtml(t(`currentStatus.${r.currentStatus}`))}</td>
            <td class="bd-cell" data-bd-label="${escapeHtml(t('col.mediaScore'))}">${scoreOf(r).score === null
    ? `<span class="bd-metric bd-metric--empty">${escapeHtml(t('band.unscored'))}</span>`
    : `<strong>${scoreOf(r).score}</strong> ${escapeHtml(scoreOf(r).band)}`}</td>
            <td class="bd-cell" data-bd-label="${escapeHtml(t('col.bestFor'))}">${escapeHtml(bestForOf(r)
    .map((slug) => (REC.PROFILE_BY_KEY.get(slug.replace(/-/g, '-')) || {}).label
      || (REC.PROFILES.find((p) => p.slug === slug) || {}).label || slug).join(', '))}</td>
            <td class="bd-cell" data-bd-label="${escapeHtml(t('col.whatItIs'))}">${escapeHtml(r.shortNote)}${
  r.limitations ? ` <em>${escapeHtml(r.limitations)}</em>` : ''}</td>
            <td class="bd-cell bd-actions" data-bd-label="${escapeHtml(t('col.actions'))}">${actions(r)}</td>
          </tr>`;
  }).join('\n');

  const head = ['col.platform', 'col.country', 'col.audience', 'col.category', 'col.industry',
    'col.opportunity', 'col.cost', 'col.priority', 'col.status', 'col.mediaScore', 'col.bestFor',
    'col.whatItIs', 'col.actions'].map((k) => t(k));

  const countryLabels = Object.fromEntries([...countries].map((s) => [s, countryName(s)]));
  const industryLabels = Object.fromEntries(
    [...new Set(rows.flatMap((r) => r.industries))].map((s) => [s, industryLabel(s)]));
  const languageLabels = Object.fromEntries(
    [...new Set(rows.flatMap((r) => r.languages))].map((s) => [s, s.toUpperCase()]));

  return [
    c.pageIntro({
      title: t('md.title'),
      lede: t('md.lede'),
    }),
    `<section id="overview" aria-labelledby="overview-heading" class="bd-hero">
      <h2 id="overview-heading" class="bd-vh">${escapeHtml(t('common.overview'))}</h2>
      <ul class="bd-stats">
        <li class="bd-stat"><strong>${rows.length}</strong> ${escapeHtml(t('md.opportunities'))}</li>
        <li class="bd-stat"><strong>${countries.size}</strong> ${escapeHtml(t('md.markets'))}</li>
        <li class="bd-stat"><strong>${cats.size}</strong> ${escapeHtml(t('md.categories'))}</li>
        <li class="bd-stat"><strong>${types.size}</strong> ${escapeHtml(t('md.oppTypes'))}</li>
        <li class="bd-stat"><strong>${p1}</strong> ${escapeHtml(t('md.topPriority'))}</li>
        <li class="bd-stat"><strong>${cov.scored}</strong> ${escapeHtml(t('md.scoredStat'))}</li>
        <li class="bd-stat"><strong>${cov.routeVerified}</strong> ${escapeHtml(t('md.verifiedRoutes'))}</li>
      </ul>
    </section>`,
    `<section id="how-to-read" aria-labelledby="how-to-read-heading">
      <h2 id="how-to-read-heading">${escapeHtml(t('md.howToRead'))}</h2>
      <p>${escapeHtml(t('md.howToRead1'))}</p>
      <p>${escapeHtml(t('md.howToRead2'))}</p>
      <p>${escapeHtml(t('md.howToRead3'))}</p>
    </section>`,
    `<section id="platforms" aria-labelledby="platforms-heading">
      <h2 id="platforms-heading">${escapeHtml(t('mp.platforms'))}</h2>
      <div class="bd-controls">
        <div class="bd-control">
          <label class="bd-label" for="md-search">${escapeHtml(t('common.search'))}</label>
          <input class="bd-input" id="md-search" type="search" data-bd-search placeholder="${escapeHtml(t('md.searchPlaceholder'))}">
        </div>
${facet({ name: 'country', t, label: t('col.country'), values: rows.map((r) => r.country), labels: countryLabels })}
${facet({ name: 'audience', t, label: t('md.f.audience'), values: rows.map((r) => r.audienceGeography), labels: Object.fromEntries(MD.AUDIENCE_GEOGRAPHIES.map((x) => [x, t(`geo.${x}`)])) })}
${facet({ name: 'category', t, label: t('md.f.category'), values: rows.flatMap((r) => r.categories), labels: CATEGORY_LABELS, multi: true })}
${facet({ name: 'industry', t, label: t('md.f.industry'), values: rows.flatMap((r) => r.industries), labels: industryLabels, multi: true })}
${facet({ name: 'opportunity', t, label: t('md.f.opportunity'), values: rows.flatMap((r) => r.opportunityTypes), labels: Object.fromEntries(MD.OPPORTUNITY_TYPES.map((x) => [x, t(`opportunity.${x}`)])), multi: true })}
${facet({ name: 'cost', t, label: t('col.cost'), values: rows.map((r) => r.costModel), labels: Object.fromEntries(MD.COST_MODELS.map((x) => [x, t(`cost.${x}`)])) })}
${facet({ name: 'language', t, label: t('md.f.language'), values: rows.flatMap((r) => r.languages), labels: languageLabels, multi: true })}
${facet({ name: 'priority', t, label: t('md.f.priority'), values: rows.map((r) => r.priority), labels: Object.fromEntries(['P1', 'P2', 'P3', 'hold'].map((x) => [x, t(`priority.${x}`)])) })}
${facet({ name: 'status', t, label: t('col.status'), values: rows.map((r) => r.currentStatus), labels: Object.fromEntries(['active', 'unknown'].map((x) => [x, t(`currentStatus.${x}`)])) })}
${facet({ name: 'band', t, label: t('md.f.band'), values: rows.map((r) => scoreOf(r).band || 'unscored'), labels: Object.fromEntries([...MI.BANDS.map((b) => [b.label, t(`band.${b.label}`)]), ['unscored', t('band.unscored')]]) })}
${facet({ name: 'bestfor', t, label: t('md.f.bestfor'), values: rows.flatMap((r) => bestForOf(r)), labels: Object.fromEntries(REC.PROFILES.map((p) => [p.slug, p.label])), multi: true })}
        <div class="bd-control">
          <button class="bd-button bd-button--ghost" type="button" data-bd-clear>${escapeHtml(t('common.clearFilters'))}</button>
        </div>
      </div>
      <p class="bd-note"><a class="bd-button" href="${MD.collectionPath()}opportunities.csv" download>${escapeHtml(t('md.downloadCsv', { n: rows.length }))}</a></p>
      <div class="bd-table-wrap">
        <table class="bd-table">
          <caption>${escapeHtml(t('md.caption'))}</caption>
          <thead><tr>${head.map((h) => `<th class="bd-cell" scope="col">${escapeHtml(h)}</th>`).join('')}</tr></thead>
          <tbody data-bd-rows>
${tableRows}
          </tbody>
        </table>
      </div>
    </section>`,
    `<section id="media-score" aria-labelledby="media-score-heading">
      <h2 id="media-score-heading">${escapeHtml(t('md.mediaScoreH'))}</h2>
      <p>${escapeHtml(t('md.mediaScore1', { d: MI.DIMENSIONS.length, list: MI.DIMENSIONS.map((x) => x.label.toLowerCase()).join(', '), w: MI.TOTAL_WEIGHT }))}</p>
      <p>${escapeHtml(t('md.mediaScore2', { min: MI.MIN_DIMENSIONS, mw: MI.MIN_WEIGHT, w: MI.TOTAL_WEIGHT, scored: cov.scored, total: cov.total, unscored: cov.unscored }))}</p>
      <p>${escapeHtml(t('md.mediaScore3'))}</p>
      <p class="bd-note">${eligibleProfiles(rows).map((p) => `<a class="bd-cta-link" href="${MD.profilePath(p.slug)}">${escapeHtml(p.label)}</a>`).join(' ')}</p>
    </section>`,

    `<section id="scope" aria-labelledby="scope-heading">
      <h2 id="scope-heading">${escapeHtml(t('md.scopeH'))}</h2>
      <p>${escapeHtml(t('md.scope1'))}</p>
      <p>${escapeHtml(t('md.scope2'))}</p>
      <p>${escapeHtml(t('md.scope3'))}</p>
    </section>`,
  ].join('\n\n');
}


// ── recommendation pages (PART 18) ──────────────────────────────────────────
// Same engine as the worklist column and the CSV. There is exactly one place
// that decides what a platform is good for, so a page and a filter can never
// disagree.
function renderProfilePage(profile, ranked, countryName, t) {
  const c = componentsFor(t);
  const rows = ranked.map(({ record: r, recommendation: rec }, i) => `          <tr class="bd-row" data-bd-rec-level="${escapeHtml(rec.level)}">
            <td class="bd-cell" data-bd-label="${escapeHtml(t('col.rank'))}">${i + 1}</td>
            <td class="bd-cell" data-bd-label="${escapeHtml(t('col.platform'))}"><a href="${escapeHtml(r.website)}" rel="noopener noreferrer" target="_blank">${escapeHtml(r.name)}</a></td>
            <td class="bd-cell" data-bd-label="${escapeHtml(t('col.fit'))}"><strong>${rec.score}</strong> ${escapeHtml(rec.level)}</td>
            <td class="bd-cell" data-bd-label="${escapeHtml(t('col.mediaScore'))}">${rec.mediaScore === null
    ? `<span class="bd-metric bd-metric--empty">${escapeHtml(t('band.unscored'))}</span>` : `${rec.mediaScore} ${escapeHtml(rec.mediaBand)}`}</td>
            <td class="bd-cell" data-bd-label="${escapeHtml(t('col.market'))}">${escapeHtml(countryName(r.country))}</td>
            <td class="bd-cell" data-bd-label="${escapeHtml(t('col.opportunity'))}">${escapeHtml(r.opportunityTypes.map((t) => OPPORTUNITY_LABELS[t] || t).join(', '))}</td>
            <td class="bd-cell" data-bd-label="${escapeHtml(t('col.cost'))}">${escapeHtml(t(`cost.${r.costModel}`))}</td>
            <td class="bd-cell" data-bd-label="${escapeHtml(t('col.why'))}">${escapeHtml(rec.reasons.join('; '))}</td>
            <td class="bd-cell bd-actions" data-bd-label="${escapeHtml(t('col.actions'))}">${actions(r)}</td>
          </tr>`).join('\n');
  const head = ['col.rank', 'col.platform', 'col.fit', 'col.mediaScore', 'col.market',
    'col.opportunity', 'col.cost', 'col.why', 'col.actions'].map((k) => t(k));
  const levels = {};
  for (const x of ranked) levels[x.recommendation.level] = (levels[x.recommendation.level] || 0) + 1;

  return [
    c.pageIntro({
      title: t('rec.title', { p: profile.label }),
      lede: t('rec.lede', { n: ranked.length, p: profile.label.toLowerCase() }),
    }),
    `<section id="ranking" aria-labelledby="ranking-heading">
      <h2 id="ranking-heading">${escapeHtml(t('rec.ranked'))}</h2>
      <p>${escapeHtml(`${Object.entries(levels).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(', ')}. `
        + t('rec.rankedNote'))}</p>
      <div class="bd-table-wrap">
        <table class="bd-table">
          <caption>${escapeHtml(t('rec.title', { p: profile.label }))}</caption>
          <thead><tr>${head.map((h) => `<th class="bd-cell" scope="col">${escapeHtml(h)}</th>`).join('')}</tr></thead>
          <tbody data-bd-rows>
${rows}
          </tbody>
        </table>
      </div>
    </section>`,
    `<section id="method" aria-labelledby="method-heading">
      <h2 id="method-heading">${escapeHtml(t('rec.method'))}</h2>
      <p>${escapeHtml(t('rec.method1', { cat: profile.categories.join(', '), adj: (profile.adjacent || []).length ? t('rec.method1adj', { adj: profile.adjacent.join(', ') }) : '', ind: profile.industries.join(', ') }))}</p>
      <p>${escapeHtml(t('rec.method2'))}</p>
      <p>${escapeHtml(t('rec.method3'))}</p>
    </section>`,
    `<section id="limitations" aria-labelledby="limitations-heading">
      <h2 id="limitations-heading">${escapeHtml(t('common.limitations'))}</h2>
      <p>${escapeHtml(t('rec.lim1'))}</p>
      <p>${escapeHtml(t('rec.lim2'))}</p>
      <p class="bd-note"><a class="bd-button" href="${MD.collectionPath()}">${escapeHtml(t('common.back'))}</a></p>
    </section>`,
  ].join('\n\n');
}

// ── build ───────────────────────────────────────────────────────────────────

// Pre-write containment. The directory build has had this since it was written;
// the sibling builds did not, and a mutation that pointed one of them at
// de/index.html happily overwrote the German homepage. A generator must be
// unable to write outside the routes it owns, in any locale — not merely
// unlikely to.
function assertOwned(file, ownedBases) {
  const rel = path.relative(ROOT, file);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Refusing to write outside the site root: ${rel}`);
  }
  const allowed = ownedBases.flatMap((base) => I18N.LOCALE_CODES
    .map((l) => I18N.localizedPath(l, base).replace(/^\//, '')));
  if (!allowed.some((prefix) => rel.startsWith(prefix))) {
    throw new Error(`Refusing to write ${rel}: outside this build's owned routes `
      + `(${allowed.join(', ')}).`);
  }
}

function main() {
  const countries = JSON.parse(fs.readFileSync(COUNTRIES_FILE, 'utf8'));
  const nameBySlug = new Map(countries.map((x) => [x.slug, x.name]));
  const countryName = (slug) => nameBySlug.get(slug) || slug;
  const all = MD.loadMediaPlatforms(DATA_FILE, new Set(nameBySlug.keys()));
  const rows = all.filter(MD.isActionable).sort(MD.comparePlatforms);

  const profilePages = [];
  const localePages = [];
  const suppressed = [];
  const previous = fs.existsSync(MANIFEST_FILE)
    ? JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8')).files || [] : [];

  const written = [];
  if (rows.length) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const mediaMeta = seo.buildMediaMeta({
      count: rows.length,
      countries: new Set(rows.map((r) => r.country)).size,
      p1: rows.filter((r) => r.priority === 'P1').length,
    });
    // One canonical route rendered per locale. The 385 records are read once.
    for (const locale of I18N.LOCALE_CODES) {
      const f = path.join(ROOT, I18N.localizedFile(locale, mediaMeta.canonicalPath));
      assertOwned(f, [MD.collectionPath()]);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      writeIfChanged(f, render.renderPage({ meta: mediaMeta, main: renderMain(rows, countryName, I18N.translator(locale)), locale }), written);
      localePages.push(f);
    }
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
      const profileMeta = seo.buildMediaProfileMeta({
        profile,
        count: ranked.length,
        objectiveLabel: 'brand awareness',
        canonicalPath: MD.profilePath(profile.slug),
        collectionPath: MD.collectionPath(),
      });
      for (const locale of I18N.LOCALE_CODES) {
        const f = path.join(ROOT, I18N.localizedFile(locale, profileMeta.canonicalPath));
        assertOwned(f, [MD.collectionPath()]);
        fs.mkdirSync(path.dirname(f), { recursive: true });
        writeIfChanged(f, render.renderPage({
          meta: profileMeta, main: renderProfilePage(profile, ranked, countryName, I18N.translator(locale)), locale,
        }), written);
        profilePages.push(f);
      }
    }
  }

  const owned = rows.length ? [...localePages, CSV_FILE, ...profilePages] : [];
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
    const owns = I18N.LOCALE_CODES
      .some((l) => rel.startsWith(I18N.localizedPath(l, MD.collectionPath()).replace(/^\//, '')));
    if (!owns) {
      throw new Error(`Refusing to prune ${rel}: outside this build's own routes. `
        + 'The build manifest is corrupt — inspect it rather than deleting the file.');
    }
    const abs = path.join(ROOT, rel);
    if (fs.existsSync(abs)) { fs.unlinkSync(abs); pruned += 1; }
  }
  // A pruned page leaves its directory behind, and an empty directory under
  // /for/ looks like a route that exists and serves nothing. Removed here, and
  // only ever inside this build's own output.
  for (const locale of I18N.LOCALE_CODES) {
    const dir = path.join(ROOT, I18N.localizedPath(locale, `${MD.collectionPath()}for/`).replace(/^\//, ''));
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir)) {
      const d = path.join(dir, entry);
      if (fs.statSync(d).isDirectory() && fs.readdirSync(d).length === 0) fs.rmdirSync(d);
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
