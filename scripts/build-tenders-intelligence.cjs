'use strict';

// Procurement Intelligence v1 — generator.
//
// ONE page, four locales, one CSV. The brief sketched a dozen candidate routes
// (/best/foreign-suppliers/, /best/telecom/, /best/manufacturing/ …) and warned
// against near-duplicate SEO pages in the same breath. Those answers share one
// dataset, one methodology and one set of caveats; split across twelve routes
// they would be twelve thin pages differing only by sort order. Kept together
// they are one page a supplier can work through — and the crawl surface stays
// exactly one URL per locale.
//
// Everything rendered here is DERIVED at build time from the canonical dataset.
// This generator writes no facts back, and the collection's records are read
// only. Same three properties as every other artefact in the repository:
// deterministic, offline, and no empty page.

const fs = require('node:fs');
const path = require('node:path');
const TP = require('./lib/tp-schema.cjs');
const INTEL = require('./lib/tp-intelligence.cjs');
const componentsModule = require('./lib/bd-components.cjs');
const componentsFor = (t) => componentsModule.components(t.locale);
const render = require('./lib/bd-render.cjs');
const seo = require('./lib/bd-seo.cjs');
const I18N = require('./lib/i18n.cjs');

const ROOT = path.join(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'data', 'tenders-procurement', 'platforms.json');
const COUNTRIES_FILE = path.join(ROOT, 'data', 'business-directories', 'countries.json');
const MANIFEST_FILE = path.join(ROOT, 'data', 'tenders-procurement', '.intelligence-manifest.json');
const OUT_DIR = path.join(ROOT, 'research', 'tenders-procurement', 'intelligence');
const CSV_FILE = path.join(OUT_DIR, 'intelligence.csv');
const CANONICAL_PATH = '/research/tenders-procurement/intelligence/';

const escapeHtml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// EU member slugs. Used ONLY for geographic relevance in the EU profile — never
// as a proxy for eligibility, which is a separate verified fact.
const EU_MEMBERS = new Set(['austria', 'belgium', 'bulgaria', 'croatia', 'cyprus', 'czech-republic',
  'denmark', 'estonia', 'finland', 'france', 'germany', 'greece', 'hungary', 'ireland', 'italy',
  'latvia', 'lithuania', 'luxembourg', 'malta', 'netherlands', 'poland', 'portugal', 'romania',
  'slovakia', 'slovenia', 'spain', 'sweden']);

// The profiles surfaced on the page, in reading order. All sixteen are computed
// and exported to CSV; the page shows the seven the brief names as required
// answers, because a page with sixteen ranked tables is a data dump, not advice.
const FEATURED = ['foreign-supplier', 'eu-company', 'it-software', 'telecom',
  'manufacturer', 'construction', 'exporter'];

// --- CSV --------------------------------------------------------------------
const COLUMNS = ['id', 'name', 'country', 'coverage', 'platform_type',
  'procurement_intelligence_score', 'procurement_intelligence_band', 'procurement_model',
  'supplier_actions', 'foreign_eligibility_state', 'electronic_submission',
  'browser_check_state', 'evidence_level', 'best_for'];

const csvField = (v) => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function renderCsv(rows) {
  const lines = [COLUMNS.join(',')];
  for (const { record: r, intel, bestFor } of rows) {
    lines.push([r.id, r.name, r.country, r.coverage, r.platformType,
      intel.utilityScore === null ? '' : intel.utilityScore,
      intel.band, intel.model, intel.actions.join('; '),
      intel.foreignEligibility, intel.electronicSubmission, intel.browserCheck,
      intel.evidence, bestFor.join('; ')].map(csvField).join(','));
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}

// --- page -------------------------------------------------------------------

function chip(label, tone) {
  // Tone is carried as text as well as class: colour is never the only signal.
  return `<span class="tp-chip tp-chip-${tone}">${escapeHtml(label)}</span>`;
}

function recommendationTable(entries, countryName, t) {
  const head = ['tpi.col.platform', 'tpi.col.where', 'tpi.col.score', 'tpi.col.fit',
    'tpi.col.canDo', 'tpi.col.foreign', 'tpi.col.evidence', 'tpi.col.why'].map((k) => t(k));
  const rows = entries.map(({ record: r, intel, fit, reasons }) => {
    const score = intel.utilityScore === null
      ? t('tpi.notScored')
      : `${intel.utilityScore} · ${t(`tpi.band.${intel.band}`)}`;
    const actions = intel.actions.map((a) => t(`tpi.action.${a}`)).join(', ');
    const foreign = t(`tpi.foreign.${intel.foreignEligibility}`);
    const why = reasons.length
      ? reasons.map((x) => t(`tpi.reason.${keyFor(x)}`)).join('; ')
      : t('tpi.noReasons');
    return `          <tr>
            <td data-label="${escapeHtml(head[0])}"><a href="${escapeHtml(r.officialUrl)}" rel="noopener noreferrer" target="_blank">${escapeHtml(r.name)}</a></td>
            <td data-label="${escapeHtml(head[1])}">${escapeHtml(countryName(r.country))}</td>
            <td data-label="${escapeHtml(head[2])}">${escapeHtml(score)}</td>
            <td data-label="${escapeHtml(head[3])}">${fit}</td>
            <td data-label="${escapeHtml(head[4])}">${escapeHtml(actions)}</td>
            <td data-label="${escapeHtml(head[5])}">${escapeHtml(foreign)}</td>
            <td data-label="${escapeHtml(head[6])}">${escapeHtml(t(`tpi.evidence.${intel.evidence}`))}</td>
            <td data-label="${escapeHtml(head[7])}">${escapeHtml(why)}</td>
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

// Reason strings are English sentences in the module; the page needs a stable
// key to translate. Mapping here keeps the canonical reason text out of the
// dictionary and the dictionary out of the logic.
const REASON_KEYS = Object.fromEntries(
  Object.entries(INTEL.REASONS).map(([k, v]) => [v, k]));
const keyFor = (sentence) => REASON_KEYS[sentence] || 'generic';

function renderMain(all, countryName, t) {
  const c = componentsFor(t);
  const scored = all.filter((r) => INTEL.utilityScore(r) !== null);
  const notScored = all.length - scored.length;

  const sections = FEATURED.map((key) => {
    const p = INTEL.PROFILES[key];
    const entries = INTEL.rank(all, key, EU_MEMBERS, { limit: 10 });
    return `    <section id="profile-${escapeHtml(key)}" aria-labelledby="h-${escapeHtml(key)}">
      <h3 id="h-${escapeHtml(key)}">${escapeHtml(t(`tpi.profile.${key}`))}</h3>
      <p class="bd-note">${chip(t('tpi.editorial'), 'editorial')} ${escapeHtml(t(`tpi.rationale.${key}`))}</p>
${recommendationTable(entries, countryName, t)}
    </section>`;
  }).join('\n\n');

  const modelCounts = {};
  for (const r of all) {
    const m = INTEL.procurementModel(r);
    modelCounts[m] = (modelCounts[m] || 0) + 1;
  }
  const modelRows = Object.entries(modelCounts)
    .sort((a, b) => b[1] - a[1] || TP.compareStable(a[0], b[0]))
    .map(([m, n]) => `          <tr><td data-label="${escapeHtml(t('tpi.col.model'))}">${escapeHtml(t(`tpi.model.${m}`))}</td><td data-label="${escapeHtml(t('tpi.col.count'))}">${n}</td></tr>`)
    .join('\n');

  const foreignVerified = all.filter((r) => r.foreignSuppliersAccepted === 'yes').length;
  const foreignUnknown = all.filter((r) => (r.foreignSuppliersAccepted || 'unknown') === 'unknown').length;
  const browserCheck = all.filter((r) => r.browserCheckRequired).length;

  return [
    c.pageIntro({
      title: t('tpi.title', { n: scored.length, p: FEATURED.length }),
      lede: t('tpi.lede'),
    }),

    `<section id="how" aria-labelledby="how-heading">
      <h2 id="how-heading">${escapeHtml(t('tpi.how'))}</h2>
      <p>${escapeHtml(t('tpi.how1'))}</p>
      <p>${escapeHtml(t('tpi.how2'))}</p>
      <p><strong>${escapeHtml(t('tpi.how3'))}</strong></p>
    </section>`,

    `<section id="recommendations" aria-labelledby="rec-heading">
      <h2 id="rec-heading">${escapeHtml(t('tpi.recommendations'))}</h2>
      <p>${escapeHtml(t('tpi.recIntro', { n: all.length }))}</p>
${sections}
    </section>`,

    `<section id="landscape" aria-labelledby="landscape-heading">
      <h2 id="landscape-heading">${escapeHtml(t('tpi.landscape'))}</h2>
      <p>${escapeHtml(t('tpi.landscapeIntro'))}</p>
      <div class="bd-table-wrap">
        <table class="bd-table">
          <thead><tr><th scope="col">${escapeHtml(t('tpi.col.model'))}</th><th scope="col">${escapeHtml(t('tpi.col.count'))}</th></tr></thead>
          <tbody>
${modelRows}
          </tbody>
        </table>
      </div>
      <p>${escapeHtml(t('tpi.foreignSummary', { v: foreignVerified, u: foreignUnknown }))}</p>
      <p>${escapeHtml(t('tpi.browserSummary', { n: browserCheck }))}</p>
    </section>`,

    `<section id="limits" aria-labelledby="limits-heading">
      <h2 id="limits-heading">${escapeHtml(t('common.limitations'))}</h2>
      <p>${escapeHtml(t('tpi.limit1'))}</p>
      <p>${escapeHtml(t('tpi.limit2'))}</p>
      <p>${escapeHtml(t('tpi.limit3', { n: notScored }))}</p>
      <p class="bd-note"><a class="bd-button" href="/research/tenders-procurement/intelligence/intelligence.csv" download>${escapeHtml(t('tpi.downloadCsv', { n: all.length }))}</a></p>
      <p><a href="/research/tenders-procurement/">${escapeHtml(t('tpi.backToCollection'))}</a></p>
    </section>`,
  ].join('\n\n');
}

// --- build ------------------------------------------------------------------

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
  const countries = JSON.parse(fs.readFileSync(COUNTRIES_FILE, 'utf8'));
  const nameBySlug = new Map(countries.map((x) => [x.slug, x.name]));
  const countryName = (slug) => nameBySlug.get(slug) || slug;
  const countryIso = new Map(countries.map((x) => [x.slug, x.iso2 || null]));
  const all = TP.loadPlatforms(DATA_FILE, countryIso)
    .filter(TP.isPublishable).sort(TP.comparePlatforms);

  const previous = fs.existsSync(MANIFEST_FILE)
    ? JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8')).files || [] : [];

  const written = [];
  const owned = [];
  if (all.length) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const scored = all.filter((r) => INTEL.utilityScore(r) !== null).length;
    const meta = seo.buildTendersIntelligenceMeta({
      scored, profiles: Object.keys(INTEL.PROFILES).length, canonicalPath: CANONICAL_PATH,
    });
    for (const locale of I18N.LOCALE_CODES) {
      const f = path.join(ROOT, I18N.localizedFile(locale, CANONICAL_PATH));
      assertOwned(f);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      writeIfChanged(f, render.renderPage({
        meta, main: renderMain(all, countryName, I18N.translator(locale)), locale,
      }), written);
      owned.push(f);
    }

    // CSV carries every profile, not only the featured seven.
    const rows = all.map((r) => {
      const intel = INTEL.intelligenceFor(r);
      const bestFor = Object.keys(INTEL.PROFILES)
        .map((k) => ({ k, ...INTEL.fitFor(r, k, EU_MEMBERS) }))
        .filter((x) => x.fit >= 60)
        .sort((a, b) => b.fit - a.fit || (a.k < b.k ? -1 : 1))
        .slice(0, 3).map((x) => x.k);
      return { record: r, intel, bestFor };
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

  const scored = all.filter((r) => INTEL.utilityScore(r) !== null).length;
  console.log(`Procurement Intelligence: ${scored}/${all.length} scored across `
    + `${Object.keys(INTEL.PROFILES).length} profiles; ${written.length} written, ${pruned} pruned.`);
}

if (require.main === module) main();
module.exports = { renderCsv, renderMain, COLUMNS, CANONICAL_PATH, FEATURED, EU_MEMBERS, keyFor };
