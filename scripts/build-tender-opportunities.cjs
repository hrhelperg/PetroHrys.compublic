'use strict';

// Tender Opportunities — the OFFLINE generator.
//
// Reads data/tender-opportunities/opportunities.json, which ingestion wrote and
// git tracks. Makes no network call, and a test proves it cannot: this file's
// transitive require graph must not contain to-http.cjs.
//
// ── WHY THE PAGE SHOWS 150 ROWS AND THE CSV CARRIES 7,500 ───────────────────
//
// The corpus holds thousands of live notices. Rendering them all would produce
// a 3 MB page, and a 3 MB page is not a product — it is a database dump with a
// stylesheet. So the page carries the INTELLIGENCE (what the sources cover,
// what is closing, what matches which supplier, and what we do not know) and
// the CSV carries the DATA.
//
// ── AND WHY THERE IS NO PAGE PER TENDER ─────────────────────────────────────
//
// Part 59, and it is the right call. A route per notice would mint thousands
// of URLs that are dead within weeks: thin content, expired pages, duplicate
// text across four locales, and a crawl budget spent on procurement that
// closed last month. The volatile layer stays out of the crawl surface
// entirely. One route per locale, exactly as the Intelligence page does.

const fs = require('node:fs');
const path = require('node:path');
const SCHEMA = require('./lib/to-schema.cjs');
const MATCH = require('./lib/to-match.cjs');
const SOURCES = require('./lib/to-sources.cjs');
const CORPUS = require('./lib/to-corpus.cjs');
const INDEX = require('./lib/to-index.cjs');
const TP = require('./lib/tp-schema.cjs');
const componentsModule = require('./lib/bd-components.cjs');
const render = require('./lib/bd-render.cjs');
const seo = require('./lib/bd-seo.cjs');
const I18N = require('./lib/i18n.cjs');

const ROOT = path.join(__dirname, '..');
const CORPUS_FILE = path.join(ROOT, 'data', 'tender-opportunities', 'opportunities.json');
const PLATFORMS_FILE = path.join(ROOT, 'data', 'tenders-procurement', 'platforms.json');
const COUNTRIES_FILE = path.join(ROOT, 'data', 'business-directories', 'countries.json');
const MANIFEST_FILE = path.join(ROOT, 'data', 'tender-opportunities', '.build-manifest.json');
const OUT_DIR = path.join(ROOT, 'research', 'tenders-procurement', 'opportunities');
const CSV_FILE = path.join(OUT_DIR, 'opportunities.csv');
const CANONICAL_PATH = '/research/tenders-procurement/opportunities/';

// The profiles given their own ranked table. All sixteen are scored and all
// sixteen reach the CSV; seven are rendered, for the same reason the
// Intelligence page renders seven — sixteen ranked tables is a data dump.
const FEATURED = ['telecom', 'b2b-saas', 'it-software', 'manufacturer',
  'construction', 'logistics', 'engineering'];

const ROWS_PER_PROFILE = 10;
const CLOSING_SOON_ROWS = 25;

const escapeHtml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// ── time ────────────────────────────────────────────────────────────────────
//
// The build must be deterministic, so "now" comes from the corpus's own
// generatedAt stamp rather than from the clock. Two builds of the same commit
// therefore produce identical bytes — and "closing in 5 days" means five days
// from ingestion, which is the only honest reading of a static snapshot.
function corpusNow(corpus) { return corpus.generatedAt; }

// A deadline is shown exactly as the source published it when it is zoneless,
// and as a date when it is decidable. Never invented, never shifted.
function deadlineLabel(o, t) {
  const d = o.deadline;
  if (!d || d.precision === 'NONE' || (!d.iso && !d.raw)) return t('toi.noDeadline');
  if (d.iso) return d.iso.slice(0, 10);
  return `${d.raw} ${t('toi.localTimeSuffix')}`;
}

// ── CSV ─────────────────────────────────────────────────────────────────────
const COLUMNS = ['id', 'source', 'source_platform_id', 'source_notice_id', 'source_url',
  'title', 'buyer', 'country', 'project_country', 'subnational_scheme', 'subnational_code',
  'coverage', 'notice_type', 'procedure_type', 'status', 'status_basis',
  'published', 'deadline_iso', 'deadline_raw', 'deadline_precision',
  'classification_schemes', 'classification_codes', 'value_amount', 'value_min', 'value_max',
  'value_currency', 'value_basis', 'lot_count', 'language',
  'electronic_submission', 'submission_url', 'framework_agreement',
  'occurrence_count', 'multi_source', 'best_for'];

const csvField = (v) => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function renderCsv(rows) {
  const lines = [COLUMNS.join(',')];
  for (const { o, bestFor } of rows) {
    const sj = o.subnationalJurisdiction || {};
    const v = o.value || {};
    lines.push([
      o.id, o.sourceId, o.sourcePlatformId, o.sourceNoticeId, o.sourceUrl,
      o.title, o.buyerName, o.country, o.projectCountry, sj.scheme, sj.code,
      o.coverage, o.noticeType, o.procedureType, o.status, o.statusBasis,
      o.publicationDate && o.publicationDate.iso ? o.publicationDate.iso.slice(0, 10)
        : (o.publicationDate && o.publicationDate.raw) || '',
      o.deadline && o.deadline.iso ? o.deadline.iso : '',
      o.deadline && o.deadline.raw ? o.deadline.raw : '',
      o.deadline ? o.deadline.precision : '',
      [...new Set((o.classifications || []).map((c) => c.scheme))].join('; '),
      (o.classifications || []).map((c) => c.code).join('; '),
      v.amount === undefined ? '' : v.amount,
      v.amountMin === undefined ? '' : v.amountMin,
      v.amountMax === undefined ? '' : v.amountMax,
      v.currency, v.basis, o.lotCount, o.language,
      o.electronicSubmission, o.submissionUrl,
      o.frameworkAgreement === null || o.frameworkAgreement === undefined ? '' : o.frameworkAgreement,
      o.occurrenceCount, o.multiSource ? 'yes' : 'no', bestFor.join('; '),
    ].map(csvField).join(','));
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}

// ── page ────────────────────────────────────────────────────────────────────

function chip(label, tone) {
  return `<span class="tp-chip tp-chip-${tone}">${escapeHtml(label)}</span>`;
}

// A tender title is a FACT. TED publishes the Publications Office's own
// translation in all four of this site's locales and CanadaBuys publishes an
// official French title; where such a translation exists it is used, because
// it is the source's, not ours. Where it does not, the original stands
// untranslated — which is the correct outcome, not a gap.
function titleFor(o, locale) {
  return (o.titles && o.titles[locale]) || o.title;
}

function opportunityRow(o, match, { locale, t, countryName }) {
  const where = o.country ? countryName(o.country)
    : (o.projectCountry || t('toi.whereUnknown'));
  const cls = (o.classifications || []).slice(0, 3).map((c) => `${c.scheme} ${c.code}`).join(', ')
    || t('toi.noClassification');
  const why = match
    ? match.reasons.slice(0, 3).map((r) => t(`toi.reason.${r.key}`)).join('; ')
    : '';
  const unc = match && match.uncertainty.length
    ? match.uncertainty.slice(0, 2).map((u) => t(`toi.unc.${u}`)).join('; ')
    : '';
  const score = match
    ? `${match.score} · ${t(`toi.band.${match.band}`)}`
    : '';
  return `          <tr>
            <td data-label="${escapeHtml(t('toi.col.title'))}"><a href="${escapeHtml(o.sourceUrl)}" rel="noopener noreferrer" target="_blank">${escapeHtml(titleFor(o, locale))}</a></td>
            <td data-label="${escapeHtml(t('toi.col.buyer'))}">${escapeHtml(o.buyerName || t('toi.buyerUnknown'))}</td>
            <td data-label="${escapeHtml(t('toi.col.where'))}">${escapeHtml(where)}</td>
            <td data-label="${escapeHtml(t('toi.col.source'))}">${escapeHtml(t(`toi.source.${o.sourceId}`))}</td>
            <td data-label="${escapeHtml(t('toi.col.deadline'))}">${escapeHtml(deadlineLabel(o, t))}</td>
            <td data-label="${escapeHtml(t('toi.col.status'))}">${escapeHtml(t(`toi.status.${o.status}`))} <span class="bd-note">(${escapeHtml(t(`toi.basis.${o.statusBasis}`))})</span></td>
            <td data-label="${escapeHtml(t('toi.col.classification'))}">${escapeHtml(cls)}</td>
${match ? `            <td data-label="${escapeHtml(t('toi.col.match'))}">${escapeHtml(score)}</td>
            <td data-label="${escapeHtml(t('toi.col.why'))}">${escapeHtml(why)}${unc ? `<br><span class="bd-note">${escapeHtml(t('toi.unknownPrefix'))} ${escapeHtml(unc)}</span>` : ''}</td>` : ''}
          </tr>`;
}

function opportunityTable(entries, { locale, t, countryName, withMatch }) {
  const head = ['toi.col.title', 'toi.col.buyer', 'toi.col.where', 'toi.col.source',
    'toi.col.deadline', 'toi.col.status', 'toi.col.classification']
    .concat(withMatch ? ['toi.col.match', 'toi.col.why'] : []).map((k) => t(k));
  const rows = entries.map(({ o, match }) => opportunityRow(o, match, { locale, t, countryName })).join('\n');
  return `      <div class="bd-table-wrap">
        <table class="bd-table">
          <thead><tr>${head.map((h) => `<th scope="col">${escapeHtml(h)}</th>`).join('')}</tr></thead>
          <tbody>
${rows}
          </tbody>
        </table>
      </div>`;
}

function sourceTable(corpus, t) {
  const head = ['toi.col.source', 'toi.col.access', 'toi.col.reuse', 'toi.col.records',
    'toi.col.window', 'toi.col.coverage', 'toi.col.ingested'].map((k) => t(k));
  const rows = corpus.sources.map((s) => {
    const win = s.window.kind === 'most-recent'
      ? t('toi.window.mostRecent', { n: s.window.count })
      : (s.window.days ? t('toi.window.days', { n: s.window.days }) : t('toi.window.sourceSet'));
    const cov = s.complete
      ? chip(t('toi.coverage.complete'), 'good')
      : chip(t('toi.coverage.partial'), 'warn');
    return `          <tr>
            <td data-label="${escapeHtml(head[0])}">${escapeHtml(s.name)}</td>
            <td data-label="${escapeHtml(head[1])}">${escapeHtml(t(`toi.acq.${s.acquisition}`))}</td>
            <td data-label="${escapeHtml(head[2])}">${escapeHtml(t(`toi.reuse.${s.reuse}`))}</td>
            <td data-label="${escapeHtml(head[3])}">${s.recordCount}</td>
            <td data-label="${escapeHtml(head[4])}">${escapeHtml(win)}</td>
            <td data-label="${escapeHtml(head[5])}">${cov}</td>
            <td data-label="${escapeHtml(head[6])}">${escapeHtml(s.retrievedAt ? s.retrievedAt.slice(0, 10) : t('toi.never'))}</td>
          </tr>`;
  }).join('\n');
  return `      <div class="bd-table-wrap">
        <table class="bd-table">
          <thead><tr>${head.map((h) => `<th scope="col">${escapeHtml(h)}</th>`).join('')}</tr></thead>
          <tbody>
${rows}
          </tbody>
        </table>
      </div>`;
}

// ── DISCOVERY ───────────────────────────────────────────────────────────────
//
// The search product. The server renders the CONTROLS and the methodology; the
// browser renders the RESULTS, from a committed index, using the same engine
// Node tests. Nothing here decides what matches or what ranks first.
//
// Controls are built from the index facets, never from a hardcoded list, so a
// control can only offer a value that has records behind it. A select offering
// an option that returns nothing is a dead control.
const DISCOVERY_INDEX_FILE = 'tender-index.json';

// The deadline windows the UI offers. Three, because each has to mean a real
// decidable comparison and the engine's enum accepts exactly these.
const DEADLINE_WINDOWS = [7, 30, 90];

function selectControl(id, label, options, t) {
  const opts = [`<option value="">${escapeHtml(t('tds.any'))}</option>`]
    .concat(options.map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`));
  return `        <p class="td-field">
          <label for="${id}">${escapeHtml(label)}</label>
          <select id="${id}">${opts.join('')}</select>
        </p>`;
}

// The strings and lookups the browser needs, delivered as inert JSON rather
// than as generated JavaScript: nothing here is executable, and no translated
// string is ever interpolated into code.
function discoveryConfig({ t, countryName, facets, locale }) {
  const names = {};
  for (const key of ['country', 'projectCountry']) {
    for (const f of facets[key]) names[f.value] = countryName(f.value);
  }
  const map = (list, fn) => list.reduce((acc, v) => { acc[v] = fn(v); return acc; }, {});
  // Six strings carry a placeholder the BROWSER fills, because only the
  // browser knows the number — how many results, how many days, which page.
  // t() refuses to emit an unsubstituted {n}, correctly, since one reaching a
  // rendered page would be a visible bug. These are not rendered by the build;
  // they are data handed to the client, so they come through raw() and a test
  // asserts the client substitutes every one of them.
  const tpl = (key) => I18N.raw(locale, key);
  return {
    locale,
    indexUrl: `${CANONICAL_PATH}${DISCOVERY_INDEX_FILE}`,
    countryNames: names,
    t: {
      status: map(facets.status.map((x) => x.value), (v) => t(`toi.status.${v}`)),
      source: map(facets.source.map((x) => x.value), (v) => t(`toi.source.${v}`)),
      profile: map(facets.profile.map((x) => x.value), (v) => t(`tpi.profile.${v}`)),
      band: map(['STRONG', 'GOOD'], (v) => t(`toi.band.${v}`)),
      esub: map(['yes', 'no', 'unknown'], (v) => t(`tds.esub.${v}`)),
      filterLabel: map(['status', 'country', 'projectCountry', 'source', 'scheme', 'profile',
        'matchBand', 'deadlineDays', 'esubmission', 'currency', 'browserCheck'],
      (v) => t(`tds.f.${v}`)),
      notice: { VALUE_SORT_REQUIRES_CURRENCY: t('tds.notice.valueSortNeedsCurrency') },
      fQuery: t('tds.f.q'),
      fBuyer: t('toi.col.buyer'),
      fBuyerCountry: t('tds.f.country'),
      fProjectCountry: t('tds.f.projectCountry'),
      fStatus: t('toi.col.status'),
      fDeadline: t('toi.col.deadline'),
      fPublished: t('tds.fact.published'),
      fSource: t('toi.col.source'),
      fClassification: t('toi.col.classification'),
      fValue: t('tds.fact.value'),
      fEsubmission: t('tds.f.esubmission'),
      derivedTag: t('tds.derivedTag'),
      verifyTag: t('tds.verifyTag'),
      browserCheckNote: t('tds.browserCheckNote'),
      multiSourceNote: tpl('tds.multiSourceNote'),
      deadlineDays: tpl('tds.deadlineDays'),
      deadlinePassed: t('tds.deadlinePassed'),
      deadlineNone: t('tds.deadlineNone'),
      deadlineNotComparable: t('tds.deadlineNotComparable'),
      deadlineWithin: tpl('tds.deadlineWithinShort'),
      countOne: t('tds.countOne'),
      countMany: tpl('tds.countMany'),
      pageOf: tpl('tds.pageOf'),
      prev: t('tds.prev'),
      next: t('tds.next'),
      emptyTitle: t('tds.emptyTitle'),
      emptyHint: t('tds.emptyHint'),
      loadFailed: t('tds.loadFailed'),
      removeFilter: tpl('tds.removeFilter'),
      relatedCount: tpl('tds.relatedCount'),
      relatedNote: t('tds.relatedNote'),
      yes: t('tds.yes'),
      no: t('tds.no'),
    },
  };
}

// JSON destined for a <script> element. `<` and `>` are escaped so a value can
// never close the element early and turn data into markup — the one way an
// application/json block becomes an injection.
function jsonForScript(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function discoverySection(corpus, { t, countryName, facets, locale }) {
  const cfg = discoveryConfig({ t, countryName, facets, locale });
  const label = (list, fn) => list.map((x) => ({ value: x.value, label: `${fn(x.value)} (${x.count})` }));
  const cn = (v) => countryName(v);
  const indexed = facets.status.reduce((a, x) => a + x.count, 0);

  return `<section id="discovery" aria-labelledby="discovery-heading">
      <h2 id="discovery-heading">${escapeHtml(t('tds.heading'))}</h2>
      <p>${escapeHtml(t('tds.intro', { n: indexed }))}</p>
      <p class="bd-note">${escapeHtml(t('tds.defaultSort'))}</p>

      <form id="td-form" role="search" aria-labelledby="discovery-heading">
        <p class="td-field td-field-q">
          <label for="td-q">${escapeHtml(t('tds.f.q'))}</label>
          <input type="search" id="td-q" name="q" autocomplete="off"
            placeholder="${escapeHtml(t('tds.searchPlaceholder'))}">
          <button type="submit" class="bd-button">${escapeHtml(t('tds.searchButton'))}</button>
        </p>

        <fieldset class="td-group">
          <legend>${escapeHtml(t('tds.groupWhere'))}</legend>
${selectControl('td-country', t('tds.f.country'), label(facets.country, cn), t)}
${selectControl('td-project-country', t('tds.f.projectCountry'), label(facets.projectCountry, cn), t)}
        </fieldset>

        <fieldset class="td-group">
          <legend>${escapeHtml(t('tds.groupWhat'))}</legend>
${selectControl('td-scheme', t('tds.f.scheme'), label(facets.scheme, (v) => v), t)}
${selectControl('td-profile', t('tds.f.profile'), label(facets.profile, (v) => t(`tpi.profile.${v}`)), t)}
${selectControl('td-band', t('tds.f.matchBand'), ['STRONG', 'GOOD'].map((v) => ({ value: v, label: t(`toi.band.${v}`) })), t)}
        </fieldset>

        <fieldset class="td-group">
          <legend>${escapeHtml(t('tds.groupHow'))}</legend>
${selectControl('td-status-f', t('tds.f.status'), label(facets.status, (v) => t(`toi.status.${v}`)), t)}
${selectControl('td-deadline', t('tds.f.deadlineDays'), DEADLINE_WINDOWS.map((d) => ({ value: String(d), label: t('tds.deadlineWithin', { n: d }) })), t)}
${selectControl('td-source', t('tds.f.source'), label(facets.source, (v) => t(`toi.source.${v}`)), t)}
${selectControl('td-currency', t('tds.f.currency'), label(facets.currency, (v) => v), t)}
${selectControl('td-esub', t('tds.f.esubmission'), label(facets.esubmission, (v) => t(`tds.esub.${v}`)), t)}
${selectControl('td-browser', t('tds.f.browserCheck'), label(facets.browserCheck, (v) => t(`tds.${v}`)), t)}
        </fieldset>

        <p class="td-field">
          <label for="td-sort">${escapeHtml(t('tds.sortLabel'))}</label>
          <select id="td-sort">
            <option value="relevance">${escapeHtml(t('tds.sort.relevance'))}</option>
            <option value="deadline">${escapeHtml(t('tds.sort.deadline'))}</option>
            <option value="published">${escapeHtml(t('tds.sort.published'))}</option>
            <option value="value">${escapeHtml(t('tds.sort.value'))}</option>
          </select>
          <button type="button" id="td-clear" class="bd-button" hidden>${escapeHtml(t('tds.clearAll'))}</button>
        </p>
      </form>

      <p id="td-loading">${escapeHtml(t('tds.loading'))}</p>
      <div id="td-app" hidden>
        <p id="td-status" role="status" aria-live="polite"></p>
        <div id="td-notice"></div>
        <div id="td-active" class="td-active"></div>
        <div id="td-results"></div>
        <nav id="td-pagination" class="td-pagination" aria-label="${escapeHtml(t('tds.paginationLabel'))}"></nav>
      </div>
      <noscript>
        <p>${escapeHtml(t('tds.noscript'))}</p>
      </noscript>

      <h3>${escapeHtml(t('tds.methodHeading'))}</h3>
      <p>${escapeHtml(t('tds.methodSearchable'))}</p>
      <p>${escapeHtml(t('tds.methodFactVsDerived'))}</p>
      <p>${escapeHtml(t('tds.methodRelevance'))}</p>
      <p>${escapeHtml(t('tds.methodClassification'))}</p>
      <p>${escapeHtml(t('tds.methodCurrency'))}</p>
      <p>${escapeHtml(t('tds.methodDeadline'))}</p>
      <p>${escapeHtml(t('tds.methodUnknown'))}</p>
      <p>${escapeHtml(t('tds.methodDocuments'))}</p>
      <p>${escapeHtml(t('tds.methodBrowserCheck'))}</p>
      <p>${escapeHtml(t('tds.methodSourcePlatform'))}</p>
      <p>${escapeHtml(t('tds.methodRelated'))}</p>
      <p>${escapeHtml(t('tds.methodDiversity'))}</p>
      <p class="bd-note">${escapeHtml(t('tds.methodIndexing'))}</p>

      <script type="application/json" id="td-config">${jsonForScript(cfg)}</script>
      <script src="/js/tender-search.js" defer></script>
      <script src="/js/tender-related.js" defer></script>
      <script src="/js/tender-discovery.js" defer></script>
    </section>`;
}

function renderMain(corpus, { locale, t, countryName, platformsById, facets = null }) {
  const nowIso = corpusNow(corpus);
  const all = corpus.opportunities;
  const current = all.filter(SCHEMA.isCurrent);

  const TIME = require('./lib/to-time.cjs');
  const closingSoon = current
    .map((o) => ({ o, days: TIME.daysUntil(o.deadline, nowIso) }))
    .filter((x) => x.days !== null && x.days >= 0 && x.days <= MATCH.CLOSING_SOON_DAYS)
    .sort((a, b) => a.days - b.days || (a.o.id < b.o.id ? -1 : 1))
    .slice(0, CLOSING_SOON_ROWS)
    .map((x) => ({ o: x.o, match: null }));

  const withDecidableDeadline = current.filter((o) => TIME.isDecidable(o.deadline)).length;
  const historical = all.length - current.length;
  const cancelled = all.filter((o) => o.status === 'CANCELLED').length;

  const profileSections = FEATURED.map((key) => {
    const ranked = MATCH.rank(all, key, { nowIso, platformsById, limit: ROWS_PER_PROFILE })
      .map(({ opportunity, match }) => ({ o: opportunity, match }));
    const label = t(`tpi.profile.${key}`);
    if (!ranked.length) {
      return `      <h3>${escapeHtml(label)}</h3>
      <p>${escapeHtml(t('toi.noMatches'))}</p>`;
    }
    return `      <h3>${escapeHtml(label)}</h3>
      <p>${escapeHtml(t(`toi.profileNote.${key}`))}</p>
${opportunityTable(ranked, { locale, t, countryName, withMatch: true })}`;
  }).join('\n\n');

  const attributions = corpus.sources.filter((s) => s.attributionRequired)
    .map((s) => s.name).join(', ');

  return [
    `<section id="intro" aria-labelledby="intro-heading">
      <h1 id="intro-heading">${escapeHtml(t('toi.title'))}</h1>
      <p>${escapeHtml(t('toi.lede', { current: current.length, sources: corpus.sources.length }))}</p>
      <p>${escapeHtml(t('toi.threeLayers'))}</p>
      <p class="bd-note">${escapeHtml(t('toi.freshness', { date: nowIso.slice(0, 10) }))}</p>
      <p class="bd-note">${escapeHtml(t('toi.verifyDisclaimer'))}</p>
    </section>`,

    // Search comes first: it is the product. The curated tables below it are
    // the durable content that makes the page worth reading before anyone
    // types anything, and the only content a reader without JavaScript gets.
    // `facets` is absent when renderMain is called directly by a determinism
    // test, and the section is then omitted rather than half-rendered.
    facets ? discoverySection(corpus, { t, countryName, facets, locale }) : '',

    `<section id="sources" aria-labelledby="sources-heading">
      <h2 id="sources-heading">${escapeHtml(t('toi.sourcesHeading'))}</h2>
      <p>${escapeHtml(t('toi.sourcesIntro'))}</p>
${sourceTable(corpus, t)}
      <p>${escapeHtml(t('toi.sourcesRejected', { n: SOURCES.REJECTED_SOURCES.length }))}</p>
      <p class="bd-note">${escapeHtml(t('toi.attribution', { list: attributions }))}</p>
    </section>`,

    `<section id="closing" aria-labelledby="closing-heading">
      <h2 id="closing-heading">${escapeHtml(t('toi.closingHeading', { n: MATCH.CLOSING_SOON_DAYS }))}</h2>
      <p>${escapeHtml(t('toi.closingIntro', { decidable: withDecidableDeadline, current: current.length }))}</p>
${closingSoon.length ? opportunityTable(closingSoon, { locale, t, countryName, withMatch: false })
    : `      <p>${escapeHtml(t('toi.noClosing'))}</p>`}
    </section>`,

    `<section id="profiles" aria-labelledby="profiles-heading">
      <h2 id="profiles-heading">${escapeHtml(t('toi.profilesHeading'))}</h2>
      <p>${escapeHtml(t('toi.profilesIntro'))}</p>
      <p>${escapeHtml(t('toi.notAWinScore'))}</p>
${profileSections}
    </section>`,

    `<section id="limits" aria-labelledby="limits-heading">
      <h2 id="limits-heading">${escapeHtml(t('common.limitations'))}</h2>
      <p>${escapeHtml(t('toi.limitForeign'))}</p>
      <p>${escapeHtml(t('toi.limitDeadline'))}</p>
      <p>${escapeHtml(t('toi.limitCoverage'))}</p>
      <p>${escapeHtml(t('toi.limitHistorical', { n: historical, cancelled }))}</p>
      <p>${escapeHtml(t('toi.limitNoValue'))}</p>
      <p class="bd-note"><a class="bd-button" href="${CANONICAL_PATH}opportunities.csv" download>${escapeHtml(t('toi.downloadCsv', { n: all.length }))}</a></p>
      <p><a href="/research/tenders-procurement/">${escapeHtml(t('toi.backToCollection'))}</a> · <a href="/research/tenders-procurement/intelligence/">${escapeHtml(t('toi.toIntelligence'))}</a></p>
    </section>`,
  ].filter(Boolean).join('\n\n');
}

// ── build ───────────────────────────────────────────────────────────────────

function assertOwned(file) {
  const rel = path.relative(ROOT, file);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Refusing to write outside the site root: ${rel}`);
  }
  const allowed = I18N.LOCALE_CODES
    .map((l) => I18N.localizedPath(l, CANONICAL_PATH).replace(/^\//, ''));
  if (!allowed.some((prefix) => rel.startsWith(prefix))) {
    throw new Error(`Refusing to write ${rel}: outside this build's owned routes.`);
  }
}

function writeIfChanged(file, content, written) {
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (existing === content) return;
  fs.writeFileSync(file, content);
  written.push(file);
}

function main() {
  if (!fs.existsSync(CORPUS_FILE)) {
    // No corpus is not a build failure — it is a repository that has not run
    // ingestion yet. Writing an empty page would be worse than writing none.
    console.log('Tender Opportunities: no corpus at data/tender-opportunities/opportunities.json; nothing to build.');
    return;
  }
  const corpus = CORPUS.decode(JSON.parse(fs.readFileSync(CORPUS_FILE, 'utf8')));
  const countries = JSON.parse(fs.readFileSync(COUNTRIES_FILE, 'utf8'));
  const nameBySlug = new Map(countries.map((x) => [x.slug, x.name]));
  const countryName = (slug) => nameBySlug.get(slug) || slug;
  const countryIso = new Map(countries.map((x) => [x.slug, x.iso2 || null]));
  const platformsById = new Map(
    TP.loadPlatforms(PLATFORMS_FILE, countryIso).map((p) => [p.id, p]),
  );

  const previous = fs.existsSync(MANIFEST_FILE)
    ? JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8')).files || [] : [];

  const written = [];
  const owned = [];
  const all = corpus.opportunities;
  const current = all.filter(SCHEMA.isCurrent);

  if (all.length) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const meta = seo.buildOpportunitiesIntelligenceMeta({
      current: current.length, sources: corpus.sources.length, canonicalPath: CANONICAL_PATH,
    });
    // The Discovery index. Built once and shared by all four locales: one data
    // layer, four presentation layers. A per-locale copy would be four copies
    // of the same canonical facts that could drift apart.
    const searchIndex = INDEX.build(corpus, { platformsById });
    const indexFile = path.join(OUT_DIR, DISCOVERY_INDEX_FILE);
    assertOwned(indexFile);
    writeIfChanged(indexFile, INDEX.serialize(searchIndex), written);
    owned.push(indexFile);

    for (const locale of I18N.LOCALE_CODES) {
      const f = path.join(ROOT, I18N.localizedFile(locale, CANONICAL_PATH));
      assertOwned(f);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      writeIfChanged(f, render.renderPage({
        meta,
        main: renderMain(corpus, {
          locale, t: I18N.translator(locale), countryName, platformsById,
          facets: searchIndex.facets,
        }),
        locale,
      }), written);
      owned.push(f);
    }

    // The CSV carries EVERY opportunity and every profile, not the seven the
    // page renders. Best-fit is computed across all sixteen.
    const nowIso = corpusNow(corpus);
    const profileKeys = Object.keys(MATCH.PROFILES);
    const rows = all.map((o) => {
      const platform = platformsById.get(o.sourcePlatformId);
      const bestFor = SCHEMA.isCurrent(o)
        ? profileKeys
          .map((k) => ({ k, s: MATCH.matchFor(o, k, { nowIso, platform }).score }))
          .filter((x) => x.s >= 70)
          .sort((a, b) => b.s - a.s || (a.k < b.k ? -1 : 1))
          .slice(0, 3).map((x) => x.k)
        : [];
      return { o, bestFor };
    });
    writeIfChanged(CSV_FILE, renderCsv(rows), written);
    owned.push(CSV_FILE);
  }

  const ownedRel = owned.map((f) => path.relative(ROOT, f));
  let pruned = 0;
  const OWNED_PREFIXES = I18N.LOCALE_CODES
    .map((l) => I18N.localizedPath(l, CANONICAL_PATH).replace(/^\//, ''));
  for (const rel of previous) {
    if (ownedRel.includes(rel)) continue;
    if (!OWNED_PREFIXES.some((pre) => rel.startsWith(pre))) {
      throw new Error(`Refusing to prune ${rel}: outside this build's own routes.`);
    }
    const abs = path.join(ROOT, rel);
    if (fs.existsSync(abs)) { fs.unlinkSync(abs); pruned += 1; }
  }
  fs.mkdirSync(path.dirname(MANIFEST_FILE), { recursive: true });
  fs.writeFileSync(MANIFEST_FILE, `${JSON.stringify({ files: ownedRel.sort() }, null, 2)}\n`);

  console.log(`Tender Opportunities: ${current.length} current of ${all.length} ingested `
    + `across ${corpus.sources.length} sources; ${written.length} written, ${pruned} pruned.`);
}

if (require.main === module) main();
module.exports = {
  renderCsv, renderMain, discoverySection, discoveryConfig, jsonForScript,
  COLUMNS, CANONICAL_PATH, DISCOVERY_INDEX_FILE, DEADLINE_WINDOWS, FEATURED, ROWS_PER_PROFILE,
  CLOSING_SOON_ROWS, titleFor, deadlineLabel, corpusNow,
};
