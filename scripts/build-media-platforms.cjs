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
  'requires_editorial_approval', 'sponsored_content_available', 'note', 'limitations',
  'last_verified'];

function csvField(value) {
  if (value === null || value === undefined) return '';
  const s = Array.isArray(value) ? value.join('; ') : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const bool = (v) => (v === true ? 'yes' : v === false ? 'no' : '');

function renderCsv(rows) {
  const lines = [COLUMNS.join(',')];
  for (const r of rows) {
    lines.push([r.id, r.name, r.website, r.country, r.audienceGeography, r.categories,
      r.industries, r.languages, r.opportunityTypes, r.costModel, r.priority, r.currentStatus,
      r.submissionUrl, r.pitchUrl, r.pressReleaseUrl, r.advertisingUrl, r.mediaKitUrl,
      bool(r.requiresEditorialApproval), bool(r.sponsoredContentAvailable),
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

function renderMain(rows, countryName) {
  const countries = new Set(rows.map((r) => r.country));
  const cats = new Set(rows.flatMap((r) => r.categories));
  const types = new Set(rows.flatMap((r) => r.opportunityTypes));
  const p1 = rows.filter((r) => r.priority === 'P1').length;

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
      + `data-bd-facet-status="${escapeHtml(r.currentStatus)}">
            <td class="bd-cell" data-bd-label="Platform"><a href="${escapeHtml(r.website)}" rel="noopener noreferrer" target="_blank">${escapeHtml(r.name)}</a></td>
            <td class="bd-cell" data-bd-label="Country">${escapeHtml(countryName(r.country))}</td>
            <td class="bd-cell" data-bd-label="Audience">${escapeHtml(GEO_LABELS[r.audienceGeography])}</td>
            <td class="bd-cell" data-bd-label="Category">${escapeHtml(catText)}</td>
            <td class="bd-cell" data-bd-label="Industry">${escapeHtml(indText)}</td>
            <td class="bd-cell" data-bd-label="Opportunity">${escapeHtml(typeText)}</td>
            <td class="bd-cell" data-bd-label="Cost">${escapeHtml(COST_LABELS[r.costModel])}</td>
            <td class="bd-cell" data-bd-label="Priority">${escapeHtml(PRIORITY_LABELS[r.priority] || r.priority)}</td>
            <td class="bd-cell" data-bd-label="Status">${escapeHtml(STATUS_LABELS[r.currentStatus] || r.currentStatus)}</td>
            <td class="bd-cell" data-bd-label="What it is">${escapeHtml(r.shortNote)}${
  r.limitations ? ` <em>${escapeHtml(r.limitations)}</em>` : ''}</td>
            <td class="bd-cell bd-actions" data-bd-label="Actions">${actions(r)}</td>
          </tr>`;
  }).join('\n');

  const head = ['Platform', 'Country', 'Audience', 'Category', 'Industry', 'Opportunity',
    'Cost', 'Priority', 'Status', 'What it is', 'Actions'];

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
        <div class="bd-control">
          <button class="bd-button bd-button--ghost" type="button" data-bd-clear>Clear filters</button>
        </div>
      </div>
      <p class="bd-note"><a class="bd-button" href="/research/media-pr-publishing/opportunities.csv" download>Download all ${rows.length} opportunities as CSV</a></p>
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

// ── build ───────────────────────────────────────────────────────────────────
function main() {
  const countries = JSON.parse(fs.readFileSync(COUNTRIES_FILE, 'utf8'));
  const nameBySlug = new Map(countries.map((x) => [x.slug, x.name]));
  const countryName = (slug) => nameBySlug.get(slug) || slug;
  const all = MD.loadMediaPlatforms(DATA_FILE, new Set(nameBySlug.keys()));
  const rows = all.filter(MD.isActionable).sort(MD.comparePlatforms);

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
  }

  const owned = rows.length ? [PAGE_FILE, CSV_FILE] : [];
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
  fs.mkdirSync(path.dirname(MANIFEST_FILE), { recursive: true });
  fs.writeFileSync(MANIFEST_FILE, `${JSON.stringify({ files: ownedRel.sort() }, null, 2)}\n`);

  console.log(`Media, PR & Publishing: ${rows.length} opportunity(ies) across `
    + `${new Set(rows.map((r) => r.country)).size} markets; `
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
  renderCsv, renderMain, COLUMNS, OPPORTUNITY_LABELS, CATEGORY_LABELS, COST_LABELS,
  GEO_LABELS, STATUS_LABELS, PRIORITY_LABELS, actions,
};
