'use strict';

// Marketplace & Classified Platforms — generator.
//
// A sibling of the business-directories build, not part of it. It owns its own
// manifest under data/marketplaces/, writes only inside research/marketplaces/,
// and shares nothing with the directory generator except the geography file and
// the rendering conventions. That separation is deliberate: the two datasets
// answer different questions and must be able to change independently.
//
// Same three properties as every other artefact in this repository:
//   DETERMINISTIC  same data in, byte-identical output, on any machine
//   OFFLINE        no network at build time, ever
//   NO EMPTY PAGE  the page and the CSV refuse to exist with nothing to say

const fs = require('node:fs');
const path = require('node:path');
const MP = require('./lib/mp-schema.cjs');
const c = require('./lib/bd-components.cjs');
const render = require('./lib/bd-render.cjs');
const seo = require('./lib/bd-seo.cjs');

const ROOT = path.join(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'data', 'marketplaces', 'marketplaces.json');
const COUNTRIES_FILE = path.join(ROOT, 'data', 'business-directories', 'countries.json');
const MANIFEST_FILE = path.join(ROOT, 'data', 'marketplaces', '.build-manifest.json');
const OUT_DIR = path.join(ROOT, 'research', 'marketplaces');
const PAGE_FILE = path.join(OUT_DIR, 'index.html');
const CSV_FILE = path.join(OUT_DIR, 'marketplaces.csv');

const escapeHtml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const TYPE_LABELS = {
  'general-classifieds': 'General classifieds',
  vehicles: 'Vehicles',
  property: 'Property',
  jobs: 'Jobs',
  b2b: 'B2B trade',
  services: 'Services',
  'fashion-resale': 'Fashion resale',
  auctions: 'Auctions',
};
const SELLER_LABELS = { business: 'Businesses only', private: 'Private only', both: 'Businesses and private' };
const COST_LABELS = { free: 'Free', paid: 'Paid', freemium: 'Free tier', unknown: 'Unknown' };
const STATUS_LABELS = { active: 'Active', unknown: 'Needs browser check' };

// --- CSV --------------------------------------------------------------------
// RFC 4180, CRLF, UTF-8 BOM — the same contract as the directory export, because
// an employee opens both in the same spreadsheet.
const COLUMNS = ['id', 'name', 'website', 'country', 'marketplace_type', 'also_covers',
  'seller_types', 'cost', 'operator', 'current_status', 'note'];

function csvField(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function renderCsv(rows) {
  const lines = [COLUMNS.join(',')];
  for (const r of rows) {
    lines.push([r.id, r.name, r.website, r.country, r.marketplaceType,
      (r.alsoCovers || []).join('; '), r.sellerTypes, r.costModel,
      r.operator || '', r.currentStatus, r.note || ''].map(csvField).join(','));
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}

// --- page -------------------------------------------------------------------
function facet({ name, label, values, labels }) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  const options = [...counts.entries()]
    .sort((a, b) => (b[1] - a[1]) || MP.compareStable(a[0], b[0]))
    .map(([v, n]) => `          <option value="${escapeHtml(v)}">${escapeHtml(labels[v] || v)} (${n})</option>`)
    .join('\n');
  return `      <div class="bd-control">
        <label class="bd-label" for="mp-facet-${name}">${escapeHtml(label)}</label>
        <select class="bd-select" id="mp-facet-${name}" data-bd-facet="${name}">
          <option value="">All</option>
${options}
        </select>
      </div>`;
}

function renderPage(rows, countryName) {
  const countries = new Set(rows.map((r) => r.country));
  const tableRows = rows.map((r) => {
    const types = [r.marketplaceType, ...(r.alsoCovers || [])]
      .map((t) => TYPE_LABELS[t] || t).join(', ');
    return `          <tr data-bd-facet-country="${escapeHtml(r.country)}" `
      + `data-bd-facet-type="${escapeHtml(r.marketplaceType)}" `
      + `data-bd-facet-cost="${escapeHtml(r.costModel)}" `
      + `data-bd-facet-sellers="${escapeHtml(r.sellerTypes)}" `
      + `data-bd-facet-status="${escapeHtml(r.currentStatus)}">
            <td data-label="Platform"><a href="${escapeHtml(r.website)}" rel="noopener noreferrer" target="_blank">${escapeHtml(r.name)}</a></td>
            <td data-label="Country">${escapeHtml(countryName(r.country))}</td>
            <td data-label="Type">${escapeHtml(types)}</td>
            <td data-label="Who can list">${escapeHtml(SELLER_LABELS[r.sellerTypes])}</td>
            <td data-label="Cost">${escapeHtml(COST_LABELS[r.costModel])}</td>
            <td data-label="Operator">${escapeHtml(r.operator || '')}</td>
            <td data-label="Status">${escapeHtml(STATUS_LABELS[r.currentStatus] || r.currentStatus)}</td>
            <td data-label="Notes">${escapeHtml(r.note || '')}</td>
          </tr>`;
  }).join('\n');

  const head = ['Platform', 'Country', 'Type', 'Who can list', 'Cost', 'Operator', 'Status', 'Notes'];
  return [
    c.pageIntro({
      title: `${rows.length} marketplace and classified platforms in Europe`,
      lede: 'Platforms where a business or a person can publish a listing — goods, vehicles, '
        + 'property, jobs or services. This is a different question from a business directory, '
        + 'which is about publishing a company profile, and the two datasets are kept apart.',
    }),
    `<section id="platforms" aria-labelledby="platforms-heading">
      <h2 id="platforms-heading">Platforms</h2>
      <p>${escapeHtml(`${rows.length} platforms across ${countries.size} countries. `
        + 'A blank cell means the fact was researched and not established — it never means no. '
        + 'Platforms behind a bot filter are marked "Needs browser check": the server answered, '
        + 'which says nothing about the product.')}</p>
      <div class="bd-controls">
${facet({ name: 'country', label: 'Country', values: rows.map((r) => r.country), labels: Object.fromEntries([...countries].map((s) => [s, countryName(s)])) })}
${facet({ name: 'type', label: 'Marketplace type', values: rows.map((r) => r.marketplaceType), labels: TYPE_LABELS })}
${facet({ name: 'cost', label: 'Cost to list', values: rows.map((r) => r.costModel), labels: COST_LABELS })}
${facet({ name: 'sellers', label: 'Who can list', values: rows.map((r) => r.sellerTypes), labels: SELLER_LABELS })}
${facet({ name: 'status', label: 'Status', values: rows.map((r) => r.currentStatus), labels: STATUS_LABELS })}
      </div>
      <p class="bd-note"><a class="bd-button" href="/research/marketplaces/marketplaces.csv" download>Download all ${rows.length} platforms as CSV</a></p>
      <div class="bd-table-wrap">
        <table class="bd-table">
          <caption>Marketplace and classified platforms</caption>
          <thead><tr>${head.map((h) => `<th scope="col">${escapeHtml(h)}</th>`).join('')}</tr></thead>
          <tbody>
${tableRows}
          </tbody>
        </table>
      </div>
    </section>`,
    `<section id="scope" aria-labelledby="scope-heading">
      <h2 id="scope-heading">What is and is not here</h2>
      <p>${escapeHtml('Included: classified portals, local marketplaces, buy and sell sites, and '
        + 'vehicle, property, job and service classifieds. Excluded: business directories and '
        + 'company registries, which answer a different question and live in their own dataset; '
        + 'pure retail shops, price comparison sites, news portals and forums.')}</p>
      <p>${escapeHtml('Where one operator runs several national sites — OLX, Adevinta, the Bazos '
        + 'network — each national site is its own row, because each is a separate listing and a '
        + 'separate account. A second domain serving the same country from the same operator is '
        + 'not.')}</p>
    </section>`,
  ].join('\n\n');
}

// --- build ------------------------------------------------------------------
function main() {
  const countries = JSON.parse(fs.readFileSync(COUNTRIES_FILE, 'utf8'));
  const nameBySlug = new Map(countries.map((x) => [x.slug, x.name]));
  const countryName = (slug) => nameBySlug.get(slug) || slug;
  const all = MP.loadMarketplaces(DATA_FILE, new Set(nameBySlug.keys()));
  const rows = all.filter(MP.isPublishable).sort(MP.comparePlatforms);

  const previous = fs.existsSync(MANIFEST_FILE)
    ? JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8')).files || [] : [];

  // No empty artefact: with nothing publishable, the page and the export do not
  // exist rather than existing empty.
  const written = [];
  if (rows.length) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    // Same shell as every other page on the site: one renderer, so the header,
    // footer, canonical and structured data can never drift between sections.
    const html = render.renderPage({
      meta: seo.buildMarketplacesMeta({
        count: rows.length, countries: new Set(rows.map((r) => r.country)).size,
      }),
      main: renderPage(rows, countryName),
    });
    writeIfChanged(PAGE_FILE, html, written);
    writeIfChanged(CSV_FILE, renderCsv(rows), written);
  }

  const owned = rows.length ? [PAGE_FILE, CSV_FILE] : [];
  const ownedRel = owned.map((f) => path.relative(ROOT, f));
  let pruned = 0;
  for (const rel of previous) {
    if (ownedRel.includes(rel)) continue;
    const abs = path.join(ROOT, rel);
    if (fs.existsSync(abs)) { fs.unlinkSync(abs); pruned += 1; }
  }
  fs.mkdirSync(path.dirname(MANIFEST_FILE), { recursive: true });
  fs.writeFileSync(MANIFEST_FILE, `${JSON.stringify({ files: ownedRel.sort() }, null, 2)}\n`);

  console.log(`Marketplaces: ${rows.length} platform(s) across `
    + `${new Set(rows.map((r) => r.country)).size} countries; `
    + `${written.length} written, ${pruned} pruned.`);
}

function writeIfChanged(file, content, written) {
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (existing === content) return;
  fs.writeFileSync(file, content);
  written.push(file);
}

if (require.main === module) main();
module.exports = { renderCsv, renderPage, COLUMNS, TYPE_LABELS, SELLER_LABELS, COST_LABELS };
