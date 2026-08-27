#!/usr/bin/env node
'use strict';

// Forum Intelligence static collection. One canonical dataset is rendered into
// four localized shells; generation never opens a socket.

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const F = require('./lib/forum-schema.cjs');
const V2 = require('./lib/forum-link-schema.cjs');
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
  'forum_type', 'status', 'domain_rating', 'domain_rating_provider', 'last_verified_at',
  'registration_access', 'registration_cost', 'thread_creation', 'reply_posting',
  'profile_website_available', 'profile_backlink_type', 'profile_link_target_type',
  'profile_indexability', 'post_body_backlink_type', 'post_body_link_target_type',
  'thread_indexability', 'signature_backlink_type', 'evidence_checked_at'];

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const hasDr = (r) => r.domainRating !== null && r.domainRating !== undefined;
const languageName = (code, locale) => {
  try { return new Intl.DisplayNames([locale], { type: 'language' }).of(code) || code.toUpperCase(); }
  catch { return code.toUpperCase(); }
};

function forumDecisionValues(r) {
  const evidence = r.forumLinkValue;
  const participation = evidence && evidence.participation || {};
  const surfaces = evidence && evidence.linkSurfaces || {};
  const profile = surfaces.PROFILE_WEBSITE || V2.surfaceEmpty();
  const post = surfaces.POST_BODY || V2.surfaceEmpty();
  const signature = surfaces.SIGNATURE || V2.surfaceEmpty();
  const ordinaryProfile = profile.scope !== 'STAFF_OR_MODERATOR';
  return {
    registrationAccess: participation.registrationAccess || 'UNKNOWN',
    registrationCost: participation.registrationCost || 'UNKNOWN',
    posting: participation.threadCreation || 'UNKNOWN',
    replyPosting: participation.replyPosting || 'UNKNOWN',
    profileWebsite: ordinaryProfile && profile.availability === 'OBSERVED' ? 'OBSERVED' : 'UNKNOWN',
    profileLink: ordinaryProfile ? profile.backlinkType : 'UNKNOWN',
    profileTarget: ordinaryProfile ? profile.linkTargetType : 'UNKNOWN',
    profileIndexability: evidence && evidence.publicProfile.indexability || 'UNKNOWN',
    postLink: post.backlinkType || 'UNKNOWN',
    postTarget: post.linkTargetType || 'UNKNOWN',
    threadIndexability: evidence && evidence.threadPage.indexability || 'UNKNOWN',
    signatureLink: signature.backlinkType || 'UNKNOWN',
    evidenceCheckedAt: evidence && evidence.evidenceCheckedAt || '',
    rawProfileAvailability: profile.availability || 'UNKNOWN',
  };
}

function exportValue(r, key, countryName) {
  const v2 = forumDecisionValues(r);
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
    registration_access: v2.registrationAccess,
    registration_cost: v2.registrationCost,
    thread_creation: v2.posting,
    reply_posting: v2.replyPosting,
    profile_website_available: v2.rawProfileAvailability,
    profile_backlink_type: v2.profileLink,
    profile_link_target_type: v2.profileTarget,
    profile_indexability: v2.profileIndexability,
    post_body_backlink_type: v2.postLink,
    post_body_link_target_type: v2.postTarget,
    thread_indexability: v2.threadIndexability,
    signature_backlink_type: v2.signatureLink,
    evidence_checked_at: v2.evidenceCheckedAt,
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
  const v2 = forumDecisionValues(r);
  const topicLabels = r.topics.map((x) => t(`forumTopic.${x}`));
  const other = topicLabels.slice(1).join(', ');
  const country = r.country ? countryName(r.country) : t('common.unknown');
  const languages = r.languages.map((x) => languageName(x, locale));
  const haystack = `${r.name} ${r.canonicalHost}`.toLowerCase();
  const exportValues = EXPORT_COLUMNS.map((key) => {
    const value = exportValue(r, key, countryName);
    return Array.isArray(value) ? value.join('; ') : String(value == null ? '' : value);
  });
  const attrs = `data-bd-export-forum="${esc(exportValues[0])}" data-bd-export-url="${esc(exportValues[1])}" `
    + `data-bd-export-packed="${esc(JSON.stringify(exportValues))}"`;
  return [
    `<tr class="bd-row" data-bd-name="${esc(r.name)}" data-bd-haystack="${esc(haystack)}"`,
    ` data-bd-dr="${hasDr(r) ? r.domainRating : ''}" data-bd-facet-topic="${esc(r.topics.join(' '))}"`,
    ` data-bd-facet-country="${esc(r.country || '')}" data-bd-facet-language="${esc(r.languages.join(' '))}"`,
    ` data-bd-facet-type="${esc(r.forumType)}" data-bd-facet-status="${esc(r.status)}"`,
    ` data-bd-facet-registration="${esc(v2.registrationAccess)}" data-bd-facet-registrationcost="${esc(v2.registrationCost)}"`,
    ` data-bd-facet-posting="${esc(v2.posting)}" data-bd-facet-profilewebsite="${esc(v2.profileWebsite)}"`,
    ` data-bd-facet-profilelink="${esc(v2.profileLink)}" data-bd-facet-postlink="${esc(v2.postLink)}"`,
    ` data-bd-facet-threadindex="${esc(v2.threadIndexability)}" data-bd-facet-profileindex="${esc(v2.profileIndexability)}" ${attrs}>`,
    `<td data-label="${esc(t('forum.col.forum'))}"><a href="${esc(r.url)}" rel="noopener noreferrer" `,
    `target="_blank">${esc(r.name)}</a></td>`,
    `<td data-label="${esc(t('forum.col.primaryTopic'))}">${esc(topicLabels[0])}</td>`,
    `<td data-label="${esc(t('forum.col.otherTopics'))}">${esc(other || t('common.notRecorded'))}</td>`,
    `<td data-label="${esc(t('col.country'))}">${esc(country)}</td>`,
    `<td data-label="${esc(t('forum.col.language'))}">${esc(languages.join(', ') || t('common.unknown'))}</td>`,
    `<td data-label="${esc(t('forum.col.type'))}">${esc(t(`forumType.${r.forumType}`))}</td>`,
    `<td data-label="${esc(t('col.status'))}">${esc(t(`forumStatus.${r.status}`))}</td>`,
    `<td data-label="${esc(t('col.domainRating'))}">${esc(hasDr(r) ? r.domainRating : t('bd.drNotMeasured'))}</td>`,
    `<td data-label="${esc(t('forum.col.registration'))}">${esc(t(`forumRegistration.${v2.registrationAccess}`))}</td>`,
    `<td data-label="${esc(t('forum.col.posting'))}">${esc(t(`forumPosting.${v2.posting}`))}</td>`,
    `<td data-label="${esc(t('forum.col.profileLink'))}">${esc(t(`forumBacklink.${v2.profileLink}`))}</td>`,
    `<td data-label="${esc(t('forum.col.postLink'))}">${esc(t(`forumBacklink.${v2.postLink}`))}</td>`,
    `<td data-label="${esc(t('forum.col.threadIndexability'))}">${esc(t(`forumIndexability.${v2.threadIndexability}`))}</td></tr>`,
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
  const viewRows = rows.map((r) => ({ ...r, ...forumDecisionValues(r) }));
  const tableRows = viewRows.map((r) => rowHtml(r, { t, countryName, locale })).join('\n');
  const headers = ['forum.col.forum', 'forum.col.primaryTopic', 'forum.col.otherTopics', 'col.country',
    'forum.col.language', 'forum.col.type', 'col.status', 'col.domainRating', 'forum.col.registration',
    'forum.col.posting', 'forum.col.profileLink', 'forum.col.postLink', 'forum.col.threadIndexability'];
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
${c.facetSelect({ idPrefix: 'forums', facet: { name: 'registration', key: 'registrationAccess' }, label: t('forum.f.registration'), rows: viewRows, labels: Object.fromEntries(V2.REGISTRATION_ACCESS.map((x) => [x, t(`forumRegistration.${x}`)])), order: V2.REGISTRATION_ACCESS })}
${c.facetSelect({ idPrefix: 'forums', facet: { name: 'registrationcost', key: 'registrationCost' }, label: t('forum.f.registrationCost'), rows: viewRows, labels: Object.fromEntries(V2.REGISTRATION_COST.map((x) => [x, t(`forumRegistrationCost.${x}`)])), order: V2.REGISTRATION_COST })}
${c.facetSelect({ idPrefix: 'forums', facet: { name: 'posting', key: 'posting' }, label: t('forum.f.posting'), rows: viewRows, labels: Object.fromEntries(V2.POSTING_ACCESS.map((x) => [x, t(`forumPosting.${x}`)])), order: V2.POSTING_ACCESS })}
${c.facetSelect({ idPrefix: 'forums', facet: { name: 'profilewebsite', key: 'profileWebsite' }, label: t('forum.f.profileWebsite'), rows: viewRows, labels: Object.fromEntries(['OBSERVED', 'UNKNOWN'].map((x) => [x, t(`forumAvailability.${x}`)])), order: ['OBSERVED', 'UNKNOWN'] })}
${c.facetSelect({ idPrefix: 'forums', facet: { name: 'profilelink', key: 'profileLink' }, label: t('forum.f.profileLink'), rows: viewRows, labels: Object.fromEntries(V2.BACKLINK_TYPES.map((x) => [x, t(`forumBacklink.${x}`)])), order: V2.BACKLINK_TYPES })}
${c.facetSelect({ idPrefix: 'forums', facet: { name: 'postlink', key: 'postLink' }, label: t('forum.f.postLink'), rows: viewRows, labels: Object.fromEntries(V2.BACKLINK_TYPES.map((x) => [x, t(`forumBacklink.${x}`)])), order: V2.BACKLINK_TYPES })}
${c.facetSelect({ idPrefix: 'forums', facet: { name: 'threadindex', key: 'threadIndexability' }, label: t('forum.f.threadIndexability'), rows: viewRows, labels: Object.fromEntries(V2.INDEXABILITY.map((x) => [x, t(`forumIndexability.${x}`)])), order: V2.INDEXABILITY })}
${c.facetSelect({ idPrefix: 'forums', facet: { name: 'profileindex', key: 'profileIndexability' }, label: t('forum.f.profileIndexability'), rows: viewRows, labels: Object.fromEntries(V2.INDEXABILITY.map((x) => [x, t(`forumIndexability.${x}`)])), order: V2.INDEXABILITY })}
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
module.exports = { ROUTE, EXPORT_COLUMNS, forumDecisionValues, exportValue, renderCsv, rowHtml, renderMain, main };
