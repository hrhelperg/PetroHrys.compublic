#!/usr/bin/env node
'use strict';

// Forum Intelligence static collection. One canonical dataset is rendered into
// four localized shells; generation never opens a socket.

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const F = require('./lib/forum-schema.cjs');
const I18N = require('./lib/i18n.cjs');
const componentsModule = require('./lib/bd-components.cjs');
const render = require('./lib/bd-render.cjs');
const seo = require('./lib/bd-seo.cjs');
const S = require('./lib/bd-schema.cjs');
const { csvField } = require('./lib/bd-discovery.cjs');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data/forums/forums.json');
const COUNTRIES = path.join(ROOT, 'data/business-directories/countries.json');
const MANIFEST = path.join(ROOT, 'data/forums/.build-manifest.json');
const OUT = path.join(ROOT, 'research/forums');
const CSV = path.join(OUT, 'forums.csv');
const ROUTE = '/research/forums/';

const EXPORT_COLUMNS = ['forum', 'url', 'country', 'language', 'primary_topic', 'topics',
  'forum_type', 'status', 'domain_rating', 'domain_rating_provider', 'last_verified_at'];

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const hasDr = (r) => r.domainRating !== null && r.domainRating !== undefined;
const languageName = (code, locale) => {
  try { return new Intl.DisplayNames([locale], { type: 'language' }).of(code) || code.toUpperCase(); }
  catch { return code.toUpperCase(); }
};

function exportValue(r, key, countryName) {
  const values = {
    forum: r.name,
    url: r.url,
    country: r.country ? countryName(r.country) : '',
    language: r.languages,
    primary_topic: r.primaryTopic,
    topics: r.topics,
    forum_type: r.forumType,
    status: r.status,
    domain_rating: hasDr(r) ? r.domainRating : '',
    domain_rating_provider: hasDr(r) ? 'Ahrefs' : '',
    last_verified_at: r.lastVerifiedAt,
  };
  return values[key];
}

function renderCsv(rows, countryName) {
  const lines = [EXPORT_COLUMNS.join(',')];
  for (const r of rows) lines.push(EXPORT_COLUMNS.map((key) => csvField(exportValue(r, key, countryName))).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}

function sortControl(t) {
  return `      <div class="bd-control" data-bd-sort-wrap hidden>
        <label class="bd-label" for="forums-sort">${esc(t('bd.sortBy'))}</label>
        <select class="bd-select" id="forums-sort" data-bd-sort>
          <option value="as-published">${esc(t('sort.asPublished'))}</option>
          <option value="domain-rating">${esc(t('sort.drDesc'))}</option>
          <option value="domain-rating-asc">${esc(t('sort.drAsc'))}</option>
          <option value="alphabetical">${esc(t('sort.alphabetical'))}</option>
        </select>
      </div>`;
}

function rowHtml(r, { t, countryName, locale }) {
  const topicLabels = r.topics.map((x) => t(`forumTopic.${x}`));
  const other = topicLabels.slice(1).join(', ');
  const country = r.country ? countryName(r.country) : t('common.unknown');
  const languages = r.languages.map((x) => languageName(x, locale));
  const haystack = `${r.name} ${r.canonicalHost}`.toLowerCase();
  const attrs = EXPORT_COLUMNS.map((key) => `data-bd-export-${key}="${esc(
    Array.isArray(exportValue(r, key, countryName)) ? exportValue(r, key, countryName).join('; ')
      : exportValue(r, key, countryName))}"`).join(' ');
  return [
    `<tr class="bd-row" data-bd-name="${esc(r.name)}" data-bd-haystack="${esc(haystack)}"`,
    ` data-bd-dr="${hasDr(r) ? r.domainRating : ''}" data-bd-facet-topic="${esc(r.topics.join(' '))}"`,
    ` data-bd-facet-country="${esc(r.country || '')}" data-bd-facet-language="${esc(r.languages.join(' '))}"`,
    ` data-bd-facet-type="${esc(r.forumType)}" data-bd-facet-status="${esc(r.status)}" ${attrs}>`,
    `<td data-label="${esc(t('forum.col.forum'))}"><a href="${esc(r.url)}" rel="noopener noreferrer" `,
    `target="_blank">${esc(r.name)}</a></td>`,
    `<td data-label="${esc(t('forum.col.primaryTopic'))}">${esc(topicLabels[0])}</td>`,
    `<td data-label="${esc(t('forum.col.otherTopics'))}">${esc(other || t('common.notRecorded'))}</td>`,
    `<td data-label="${esc(t('col.country'))}">${esc(country)}</td>`,
    `<td data-label="${esc(t('forum.col.language'))}">${esc(languages.join(', ') || t('common.unknown'))}</td>`,
    `<td data-label="${esc(t('forum.col.type'))}">${esc(t(`forumType.${r.forumType}`))}</td>`,
    `<td data-label="${esc(t('col.status'))}">${esc(t(`forumStatus.${r.status}`))}</td>`,
    `<td data-label="${esc(t('col.domainRating'))}">${esc(hasDr(r) ? r.domainRating : t('bd.drNotMeasured'))}</td></tr>`,
  ].join('');
}

function renderMain(rows, countryName, locale) {
  const t = I18N.translator(locale);
  const c = componentsModule.components(locale);
  const countries = [...new Set(rows.map((r) => r.country).filter(Boolean))];
  const languages = [...new Set(rows.flatMap((r) => r.languages))];
  const topicLabels = Object.fromEntries(F.TOPICS.map((x) => [x, t(`forumTopic.${x}`)]));
  const typeLabels = Object.fromEntries(F.FORUM_TYPES.map((x) => [x, t(`forumType.${x}`)]));
  const statusLabels = Object.fromEntries(F.STATUSES.map((x) => [x, t(`forumStatus.${x}`)]));
  const countryLabels = Object.fromEntries(countries.map((x) => [x, countryName(x)]));
  const languageLabels = Object.fromEntries(languages.map((x) => [x, languageName(x, locale)]));
  const tableRows = rows.map((r) => rowHtml(r, { t, countryName, locale })).join('\n');
  const headers = ['forum.col.forum', 'forum.col.primaryTopic', 'forum.col.otherTopics', 'col.country',
    'forum.col.language', 'forum.col.type', 'col.status', 'col.domainRating'];
  const minDr = c.minDomainRatingControl({ idPrefix: 'forums', rows });
  return [
    c.pageIntro({ title: t('forum.title', { n: rows.length }), lede: t('forum.lede') }),
    `    <section id="forums" aria-labelledby="forums-heading">
      <h2 id="forums-heading">${esc(t('forum.tableHeading'))}</h2>
      <p>${esc(t('forum.summary', { n: rows.length, c: countries.length, l: languages.length }))}</p>
      <div class="bd-controls">
      <div class="bd-control">
        <label class="bd-label" for="forums-search">${esc(t('common.search'))}</label>
        <input class="bd-input" id="forums-search" type="search" data-bd-search placeholder="${esc(t('forum.searchPlaceholder'))}">
      </div>
${c.facetSelect({ idPrefix: 'forums', facet: { name: 'topic', key: 'topics', multi: true }, label: t('forum.f.topic'), rows, labels: topicLabels, order: F.TOPICS })}
${c.facetSelect({ idPrefix: 'forums', facet: { name: 'country', key: 'country' }, label: t('forum.f.country'), rows, labels: countryLabels })}
${c.facetSelect({ idPrefix: 'forums', facet: { name: 'language', key: 'languages', multi: true }, label: t('forum.f.language'), rows, labels: languageLabels })}
${c.facetSelect({ idPrefix: 'forums', facet: { name: 'type', key: 'forumType' }, label: t('forum.f.type'), rows, labels: typeLabels, order: F.FORUM_TYPES })}
${c.facetSelect({ idPrefix: 'forums', facet: { name: 'status', key: 'status' }, label: t('forum.f.status'), rows, labels: statusLabels, order: F.STATUSES })}
${minDr}
${sortControl(t)}
${c.clearFiltersControl()}
      </div>
      <p class="bd-note"><a class="bd-button" href="/research/forums/forums.csv" download>${esc(t('forum.downloadCsv', { n: rows.length }))}</a></p>
${c.filteredExportControl({ name: 'forums', count: rows.length, columns: EXPORT_COLUMNS })}
      <div class="bd-table-wrap">
        <table class="bd-table">
          <caption>${esc(t('forum.caption'))}</caption>
          <thead><tr>${headers.map((key) => `<th scope="col">${esc(t(key))}</th>`).join('')}</tr></thead>
          <tbody data-bd-rows>
${tableRows}
          </tbody>
        </table>
      </div>
      <p class="bd-note"><a href="${esc(S.AHREFS_ATTRIBUTION.href)}" rel="noopener noreferrer" target="_blank">${esc(S.AHREFS_ATTRIBUTION.text)}</a></p>
    </section>`,
    `    <section id="methodology" aria-labelledby="methodology-heading" class="prose">
      <h2 id="methodology-heading">${esc(t('common.methodology'))}</h2>
      <p>${esc(t('forum.methodology1'))}</p>
      <p>${esc(t('forum.methodology2'))}</p>
    </section>`,
    `    <section id="limitations" aria-labelledby="limitations-heading" class="prose">
      <h2 id="limitations-heading">${esc(t('common.limitations'))}</h2>
      <p>${esc(t('forum.limitations1'))}</p>
      <p>${esc(t('forum.limitations2'))}</p>
    </section>`,
  ].join('\n\n');
}

function assertOwned(file) {
  const rel = path.relative(ROOT, file);
  const allowed = I18N.LOCALE_CODES.map((locale) => I18N.localizedPath(locale, ROUTE).replace(/^\//, ''));
  if (rel.startsWith('..') || path.isAbsolute(rel) || !allowed.some((base) => rel.startsWith(base))) {
    throw new Error(`Forum build refuses to write outside its routes: ${rel}`);
  }
}

function writeIfChanged(file, text, written) {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  written.push(file);
}

function main() {
  const rows = F.load(DATA).slice().sort((a, b) => a.name.localeCompare(b.name, 'en') || a.id.localeCompare(b.id, 'en'));
  if (!rows.length) throw new Error('Forum build refuses to publish an empty collection.');
  const countries = JSON.parse(fs.readFileSync(COUNTRIES, 'utf8'));
  const countryName = (slug) => (countries.find((c) => c.slug === slug) || {}).name || slug;
  const meta = seo.buildForumsMeta({
    count: rows.length,
    countries: new Set(rows.map((r) => r.country).filter(Boolean)).size,
    languages: new Set(rows.map((r) => r.primaryLanguage).filter(Boolean)).size,
  });
  const written = [];
  const files = [];
  for (const locale of I18N.LOCALE_CODES) {
    const file = path.join(ROOT, I18N.localizedFile(locale, ROUTE));
    assertOwned(file);
    writeIfChanged(file, render.renderPage({ meta, main: renderMain(rows, countryName, locale), locale }), written);
    files.push(file);
  }
  assertOwned(CSV);
  writeIfChanged(CSV, renderCsv(rows, countryName), written);
  files.push(CSV);

  const previous = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')).files || [] : [];
  const owned = files.map((f) => path.relative(ROOT, f)).sort();
  let pruned = 0;
  for (const rel of previous) {
    if (owned.includes(rel)) continue;
    const file = path.join(ROOT, rel); assertOwned(file);
    if (fs.existsSync(file)) { fs.unlinkSync(file); pruned += 1; }
  }
  fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
  const manifest = `${JSON.stringify({ files: owned }, null, 2)}\n`;
  if (!fs.existsSync(MANIFEST) || fs.readFileSync(MANIFEST, 'utf8') !== manifest) fs.writeFileSync(MANIFEST, manifest);
  const html = fs.readFileSync(files[0]);
  console.log(`Forums: ${rows.length} canonical record(s); ${written.length} written, ${pruned} pruned; `
    + `${html.length} raw bytes, ${zlib.gzipSync(html).length} gzip bytes.`);
}

if (require.main === module) main();
module.exports = { ROUTE, EXPORT_COLUMNS, exportValue, renderCsv, rowHtml, renderMain, main };
