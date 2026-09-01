#!/usr/bin/env node
'use strict';

// Deterministic, offline build for the Regional Media registry.

const fs = require('node:fs');
const path = require('node:path');
const RM = require('./lib/regional-media-schema.cjs');
const BD = require('./lib/bd-schema.cjs');
const I18N = require('./lib/i18n.cjs');
const seo = require('./lib/bd-seo.cjs');
const render = require('./lib/bd-render.cjs');
const componentsModule = require('./lib/bd-components.cjs');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data', 'regional-media', 'regional-media.json');
const COUNTRIES = path.join(ROOT, 'data', 'business-directories', 'countries.json');
const OUT_DIR = path.join(ROOT, 'research', 'regional-media');
const CSV = path.join(OUT_DIR, 'regional-media.csv');
const MANIFEST = path.join(ROOT, 'data', 'regional-media', '.build-manifest.json');

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const humanize = (value) => String(value || '').split('-')
  .map((part) => part ? part[0].toUpperCase() + part.slice(1) : '')
  .join(' ');

const stable = (a, b) => {
  const left = String(a ?? '');
  const right = String(b ?? '');
  return left < right ? -1 : left > right ? 1 : 0;
};

function facet({ name, label, values, labels = {}, multi = false, t }) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  const options = [...counts].sort((a, b) => (b[1] - a[1]) || stable(a[0], b[0]))
    .map(([value, count]) => `          <option value="${escapeHtml(value)}">${escapeHtml(labels[value] || humanize(value))} (${count})</option>`)
    .join('\n');
  return `      <div class="bd-control">
        <label class="bd-label" for="rm-facet-${escapeHtml(name)}">${escapeHtml(label)}</label>
        <select class="bd-select" id="rm-facet-${escapeHtml(name)}" data-bd-facet="${escapeHtml(name)}"${multi ? ' data-bd-facet-multi' : ''}>
          <option value="">${escapeHtml(t('common.all'))}</option>
${options}
        </select>
      </div>`;
}

function linkLabel(row, t) {
  if (row.backlinkType === 'dofollow') return t('bd.linkType.follow');
  if (['nofollow', 'ugc', 'sponsored'].includes(row.backlinkType)) return t('bd.linkType.restricted');
  if (row.backlinkType === 'mixed') return t('bd.linkType.mixed');
  if (row.backlinkType === 'none') return t('bd.linkType.none');
  return t('bd.linkType.unknown');
}

function linkControl(rows, t) {
  const options = [
    ['follow', 'bd.linkType.follow', (row) => row.backlinkType === 'dofollow'],
    ['restricted', 'bd.linkType.restricted', (row) => ['nofollow', 'ugc', 'sponsored'].includes(row.backlinkType)],
    ['mixed', 'bd.linkType.mixed', (row) => row.backlinkType === 'mixed'],
    ['none', 'bd.linkType.none', (row) => row.backlinkType === 'none'],
    ['unknown', 'bd.linkType.unknown', (row) => !row.backlinkType],
  ].map(([value, key, match]) => [value, key, rows.filter(match).length])
    .filter(([, , count]) => count > 0)
    .map(([value, key, count]) => `          <option value="${value}">${escapeHtml(t(key))} (${count})</option>`)
    .join('\n');
  return `      <div class="bd-control" data-bd-link-type-wrap hidden>
        <label class="bd-label" for="rm-link-type">${escapeHtml(t('bd.linkType'))}</label>
        <select class="bd-select" id="rm-link-type" data-bd-link-type aria-describedby="rm-link-help">
          <option value="">${escapeHtml(t('common.all'))}</option>
${options}
        </select>
        <p class="bd-note" id="rm-link-help">${escapeHtml(t('rm.linkHelp'))}</p>
      </div>`;
}

function drCell(row) {
  const provenance = row.metricsProvenance && row.metricsProvenance.domainRating;
  if (!Number.isInteger(row.domainRating) || !provenance) {
    return '<span class="bd-metric bd-metric--empty">Unknown</span>';
  }
  return `<span class="bd-metric"><strong>${row.domainRating}</strong><span class="bd-metric-source">Ahrefs snapshot, measured <time datetime="${escapeHtml(provenance.measuredAt)}">${escapeHtml(provenance.measuredAt)}</time></span></span>`;
}

function actions(row, t) {
  const out = [`<a class="bd-button" href="${escapeHtml(row.website)}" rel="noopener noreferrer" target="_blank">${escapeHtml(t('rm.openOutlet'))}</a>`];
  if (row.submissionUrl) out.push(`<a class="bd-button bd-button--ghost" href="${escapeHtml(row.submissionUrl)}" rel="noopener noreferrer" target="_blank">${escapeHtml(t('rm.openRoute'))}</a>`);
  if (row.advertisingUrl) out.push(`<a class="bd-button bd-button--ghost" href="${escapeHtml(row.advertisingUrl)}" rel="noopener noreferrer" target="_blank">${escapeHtml(t('rm.openAdvertising'))}</a>`);
  return out.join(' ');
}

function renderMain(rows, countryName, t) {
  const c = componentsModule.components(t.locale);
  const countries = new Set(rows.map((row) => row.country));
  const regions = new Set(rows.map((row) => row.macroRegion));
  const drRated = rows.filter((row) => Number.isInteger(row.domainRating)).length;
  const followVerified = rows.filter((row) => row.backlinkType === 'dofollow').length;
  const countryLabels = Object.fromEntries([...countries].map((key) => [key, countryName(key)]));
  const macroLabels = Object.fromEntries(RM.MACRO_REGIONS.map((key) => [key, humanize(key)]));
  const subregionLabels = Object.fromEntries(RM.SUBREGIONS.map((key) => [key, humanize(key)]));
  const languageLabels = Object.fromEntries([...new Set(rows.flatMap((row) => row.languages))]
    .map((key) => [key, key.toUpperCase()]));

  const body = rows.map((row) => {
    const haystack = [row.name, countryName(row.country), row.macroRegion, row.subregion,
      row.coverageArea, row.publicationType, row.languages.join(' '), row.shortNote].join(' ').toLowerCase();
    const routes = row.publicationRoutes.map(humanize).join(', ');
    return `          <tr class="bd-row" data-bd-name="${escapeHtml(row.name)}" data-bd-haystack="${escapeHtml(haystack)}"
            data-bd-dr="${Number.isInteger(row.domainRating) ? row.domainRating : ''}"
            data-bd-link-type="${escapeHtml(row.backlinkType || '')}"
            data-bd-listing-page="${escapeHtml(row.listingIndexability || '')}"
            data-bd-link-checked="${escapeHtml((row.backlinkProvenance || {}).observedAt || '')}"
            data-bd-facet-region="${escapeHtml(row.macroRegion)}"
            data-bd-facet-subregion="${escapeHtml(row.subregion)}"
            data-bd-facet-country="${escapeHtml(row.country)}"
            data-bd-facet-coverage="${escapeHtml(row.coverageType)}"
            data-bd-facet-publication="${escapeHtml(row.publicationType)}"
            data-bd-facet-language="${escapeHtml(row.languages.join(' '))}"
            data-bd-facet-route="${escapeHtml(row.publicationRoutes.join(' '))}"
            data-bd-facet-cost="${escapeHtml(row.costModel)}"
            data-bd-facet-priority="${escapeHtml(row.priority)}"
            data-bd-facet-status="${escapeHtml(row.currentStatus)}">
            <td class="bd-cell" data-bd-label="${escapeHtml(t('rm.colOutlet'))}"><a href="${escapeHtml(row.website)}" rel="noopener noreferrer" target="_blank">${escapeHtml(row.name)}</a></td>
            <td class="bd-cell" data-bd-label="${escapeHtml(t('rm.colRegion'))}">${escapeHtml(humanize(row.macroRegion))}</td>
            <td class="bd-cell" data-bd-label="${escapeHtml(t('rm.colSubregion'))}">${escapeHtml(humanize(row.subregion))}</td>
            <td class="bd-cell" data-bd-label="${escapeHtml(t('col.country'))}">${escapeHtml(countryName(row.country))}</td>
            <td class="bd-cell" data-bd-label="${escapeHtml(t('rm.colCoverage'))}"><strong>${escapeHtml(row.coverageArea)}</strong><br><span class="bd-muted">${escapeHtml(humanize(row.coverageType))}</span></td>
            <td class="bd-cell" data-bd-label="${escapeHtml(t('rm.colPublication'))}">${escapeHtml(humanize(row.publicationType))}</td>
            <td class="bd-cell" data-bd-label="${escapeHtml(t('rm.colLanguages'))}">${escapeHtml(row.languages.map((value) => value.toUpperCase()).join(', '))}</td>
            <td class="bd-cell" data-bd-label="${escapeHtml(t('col.domainRating'))}">${drCell(row)}</td>
            <td class="bd-cell" data-bd-label="${escapeHtml(t('bd.linkType'))}">${escapeHtml(linkLabel(row, t))}${row.backlinkProvenance ? `<br><a href="${escapeHtml(row.backlinkProvenance.listingUrl)}" rel="noopener noreferrer" target="_blank">${escapeHtml(t('rm.evidence'))}</a>` : ''}</td>
            <td class="bd-cell" data-bd-label="${escapeHtml(t('rm.colRoute'))}">${escapeHtml(routes)}</td>
            <td class="bd-cell" data-bd-label="${escapeHtml(t('col.cost'))}">${escapeHtml(t(`cost.${row.costModel}`))}</td>
            <td class="bd-cell" data-bd-label="${escapeHtml(t('col.priority'))}">${escapeHtml(t(`priority.${row.priority}`))}</td>
            <td class="bd-cell" data-bd-label="${escapeHtml(t('col.status'))}">${escapeHtml(t(`currentStatus.${row.currentStatus}`))}</td>
            <td class="bd-cell bd-actions" data-bd-label="${escapeHtml(t('col.actions'))}">${actions(row, t)}</td>
          </tr>`;
  }).join('\n');

  const head = [t('rm.colOutlet'), t('rm.colRegion'), t('rm.colSubregion'), t('col.country'),
    t('rm.colCoverage'), t('rm.colPublication'), t('rm.colLanguages'), t('col.domainRating'),
    t('bd.linkType'), t('rm.colRoute'), t('col.cost'), t('col.priority'), t('col.status'),
    t('col.actions')];

  return [
    c.pageIntro({ title: t('rm.title'), lede: t('rm.lede') }),
    `<section id="overview" aria-labelledby="overview-heading" class="bd-hero">
      <h2 id="overview-heading" class="bd-vh">${escapeHtml(t('common.overview'))}</h2>
      <ul class="bd-stats">
        <li class="bd-stat"><strong>${rows.length}</strong> ${escapeHtml(t('rm.outlets'))}</li>
        <li class="bd-stat"><strong>${countries.size}</strong> ${escapeHtml(t('rm.countries'))}</li>
        <li class="bd-stat"><strong>${regions.size}</strong> ${escapeHtml(t('rm.regions'))}</li>
        <li class="bd-stat"><strong>${drRated}</strong> ${escapeHtml(t('rm.drRated'))}</li>
        <li class="bd-stat"><strong>${followVerified}</strong> ${escapeHtml(t('rm.followVerified'))}</li>
      </ul>
    </section>`,
    `<section id="how-to-read" aria-labelledby="how-to-read-heading">
      <h2 id="how-to-read-heading">${escapeHtml(t('rm.how'))}</h2>
      <p>${escapeHtml(t('rm.how1'))}</p>
      <p>${escapeHtml(t('rm.how2'))}</p>
      <p>${escapeHtml(t('rm.how3'))}</p>
    </section>`,
    `<section id="outlets" aria-labelledby="outlets-heading">
      <h2 id="outlets-heading">${escapeHtml(t('rm.list'))}</h2>
      <div class="bd-controls">
        <div class="bd-control">
          <label class="bd-label" for="rm-search">${escapeHtml(t('common.search'))}</label>
          <input class="bd-input" id="rm-search" type="search" data-bd-search placeholder="${escapeHtml(t('rm.searchPlaceholder'))}">
        </div>
        <div class="bd-control" data-bd-sort-wrap hidden>
          <label class="bd-label" for="rm-sort">${escapeHtml(t('bd.sortBy'))}</label>
          <select class="bd-select" id="rm-sort" data-bd-sort>
            <option value="as-published">${escapeHtml(t('sort.asPublished'))}</option>
            <option value="domain-rating">${escapeHtml(t('sort.drDesc'))}</option>
            <option value="domain-rating-asc">${escapeHtml(t('sort.drAsc'))}</option>
            <option value="alphabetical">${escapeHtml(t('sort.alphabetical'))}</option>
          </select>
        </div>
${c.minDomainRatingControl({ idPrefix: 'rm', rows })}
${linkControl(rows, t)}
${facet({ name: 'region', label: t('rm.colRegion'), values: rows.map((row) => row.macroRegion), labels: macroLabels, t })}
${facet({ name: 'subregion', label: t('rm.colSubregion'), values: rows.map((row) => row.subregion), labels: subregionLabels, t })}
${facet({ name: 'country', label: t('col.country'), values: rows.map((row) => row.country), labels: countryLabels, t })}
${facet({ name: 'coverage', label: t('rm.colCoverage'), values: rows.map((row) => row.coverageType), t })}
${facet({ name: 'publication', label: t('rm.colPublication'), values: rows.map((row) => row.publicationType), t })}
${facet({ name: 'language', label: t('rm.colLanguages'), values: rows.flatMap((row) => row.languages), labels: languageLabels, multi: true, t })}
${facet({ name: 'route', label: t('rm.colRoute'), values: rows.flatMap((row) => row.publicationRoutes), multi: true, t })}
${facet({ name: 'cost', label: t('col.cost'), values: rows.map((row) => row.costModel), t })}
${facet({ name: 'priority', label: t('col.priority'), values: rows.map((row) => row.priority), t })}
${facet({ name: 'status', label: t('col.status'), values: rows.map((row) => row.currentStatus), t })}
        <div class="bd-control"><button class="bd-button bd-button--ghost" type="button" data-bd-clear>${escapeHtml(t('common.clearFilters'))}</button></div>
      </div>
      <p class="bd-note"><a class="bd-button" href="${RM.collectionPath()}regional-media.csv" download>${escapeHtml(t('rm.downloadCsv', { n: rows.length }))}</a></p>
      <div class="bd-table-wrap" tabindex="0" aria-label="${escapeHtml(t('rm.tableScroll'))}">
        <table class="bd-table">
          <caption>${escapeHtml(t('rm.caption'))}</caption>
          <thead><tr>${head.map((label) => `<th class="bd-cell" scope="col">${escapeHtml(label)}</th>`).join('')}</tr></thead>
          <tbody data-bd-rows data-rm-status-all="${escapeHtml(I18N.raw(t.locale, 'rm.countAll'))}" data-rm-status-some="${escapeHtml(I18N.raw(t.locale, 'rm.countSome'))}">
${body}
          </tbody>
        </table>
      </div>
      <p class="bd-note"><a href="${escapeHtml(BD.AHREFS_ATTRIBUTION.href)}" rel="noopener noreferrer" target="_blank">${escapeHtml(BD.AHREFS_ATTRIBUTION.text)}</a></p>
    </section>`,
    `<section id="method" aria-labelledby="method-heading">
      <h2 id="method-heading">${escapeHtml(t('rm.method'))}</h2>
      <p>${escapeHtml(t('rm.method1'))}</p>
      <p>${escapeHtml(t('rm.method2'))}</p>
    </section>`,
  ].join('\n\n');
}

const csvEscape = (value) => {
  const text = Array.isArray(value) ? value.join('|') : String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const COLUMNS = [
  ['id', (row) => row.id], ['name', (row) => row.name], ['website', (row) => row.website],
  ['macro_region', (row) => row.macroRegion], ['subregion', (row) => row.subregion],
  ['country', (row) => row.country], ['coverage_type', (row) => row.coverageType],
  ['coverage_area', (row) => row.coverageArea], ['publication_type', (row) => row.publicationType],
  ['languages', (row) => row.languages], ['domain_rating', (row) => row.domainRating],
  ['domain_rating_provider', (row) => ((row.metricsProvenance || {}).domainRating || {}).provider],
  ['domain_rating_measured_at', (row) => ((row.metricsProvenance || {}).domainRating || {}).measuredAt],
  ['link_type', (row) => row.backlinkType || 'unknown'],
  ['link_evidence_url', (row) => (row.backlinkProvenance || {}).listingUrl],
  ['publication_routes', (row) => row.publicationRoutes], ['cost_model', (row) => row.costModel],
  ['priority', (row) => row.priority], ['status', (row) => row.currentStatus],
  ['last_verified', (row) => row.lastVerified], ['source_urls', (row) => row.sources],
];

function renderCsv(rows) {
  return `${COLUMNS.map(([key]) => key).join(',')}\n${rows.map((row) => COLUMNS
    .map(([, read]) => csvEscape(read(row))).join(',')).join('\n')}\n`;
}

function writeIfChanged(file, content, written) {
  const old = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (old === content) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  written.push(path.relative(ROOT, file));
}

function addGlobalCountryNames(countryNames) {
  const displayNames = new Intl.DisplayNames(['en'], { type: 'region' });
  for (let first = 65; first <= 90; first += 1) {
    for (let second = 65; second <= 90; second += 1) {
      const iso2 = String.fromCharCode(first, second);
      const name = displayNames.of(iso2);
      if (!name || name === iso2 || name === 'Unknown Region') continue;
      const key = name.toLowerCase().normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      if (!countryNames.has(key)) countryNames.set(key, name);
    }
  }
}

function main() {
  const countries = JSON.parse(fs.readFileSync(COUNTRIES, 'utf8'));
  const countryNames = new Map(countries.map((row) => [row.slug, row.name]));
  addGlobalCountryNames(countryNames);
  const rows = RM.loadRegionalMedia(DATA, new Set(countryNames.keys()))
    .filter(RM.isActionable).sort(RM.compareRecords);
  if (!rows.length) throw new Error('Refusing to build an empty Regional Media registry.');
  const written = [];
  const owned = [];
  const meta = seo.buildRegionalMediaMeta({
    count: rows.length,
    countries: new Set(rows.map((row) => row.country)).size,
    regions: new Set(rows.map((row) => row.macroRegion)).size,
    drRated: rows.filter((row) => Number.isInteger(row.domainRating)).length,
    followVerified: rows.filter((row) => row.backlinkType === 'dofollow').length,
  });
  for (const locale of I18N.LOCALE_CODES) {
    const file = path.join(ROOT, I18N.localizedFile(locale, RM.collectionPath()));
    const html = render.renderPage({
      meta, locale,
      main: renderMain(rows, (key) => countryNames.get(key) || key, I18N.translator(locale)),
    });
    writeIfChanged(file, html, written);
    owned.push(path.relative(ROOT, file));
  }
  writeIfChanged(CSV, renderCsv(rows), written);
  owned.push(path.relative(ROOT, CSV));
  fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
  fs.writeFileSync(MANIFEST, `${JSON.stringify({ files: owned.sort() }, null, 2)}\n`);
  console.log(`Regional Media: ${rows.length} outlets across ${new Set(rows.map((row) => row.country)).size} countries; ${written.length} file(s) written.`);
}

if (require.main === module) main();
module.exports = { COLUMNS, facet, linkControl, renderMain, renderCsv };
