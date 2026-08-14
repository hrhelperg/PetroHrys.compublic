'use strict';

// Tender & Procurement Platforms — generator.
//
// The fourth sibling of the business-directories build. It owns its own
// manifest under data/tenders-procurement/, writes only inside
// research/tenders-procurement/ (in every locale), and shares nothing with the
// other generators except the geography file and the rendering conventions.
//
// Same three properties as every other artefact in this repository:
//   DETERMINISTIC  same data in, byte-identical output, on any machine
//   OFFLINE        no network at build time, ever
//   NO EMPTY PAGE  the page and the CSV refuse to exist with nothing to say
//
// What this page must never do is flatten the four supplier actions into one
// link. Discovery, registration, documents and submission are separate systems
// in real procurement ecosystems; a record carries each route only where it was
// separately verified, and the page labels each action as what it actually is.
// A homepage is never labelled "Search tenders", and an unknown is rendered as
// unknown — the reader is told what we do not know, not handed a guess.

const fs = require('node:fs');
const path = require('node:path');
const TP = require('./lib/tp-schema.cjs');
const ISO = require('./lib/iso-3166-2.cjs');
const componentsModule = require('./lib/bd-components.cjs');
const componentsFor = (t) => componentsModule.components(t.locale);
const render = require('./lib/bd-render.cjs');
const seo = require('./lib/bd-seo.cjs');
const I18N = require('./lib/i18n.cjs');

const ROOT = path.join(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'data', 'tenders-procurement', 'platforms.json');
const COUNTRIES_FILE = path.join(ROOT, 'data', 'business-directories', 'countries.json');
const MANIFEST_FILE = path.join(ROOT, 'data', 'tenders-procurement', '.build-manifest.json');
const OUT_DIR = path.join(ROOT, 'research', 'tenders-procurement');
const CSV_FILE = path.join(OUT_DIR, 'platforms.csv');
const CANONICAL_PATH = '/research/tenders-procurement/';

const escapeHtml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// --- CSV --------------------------------------------------------------------
// RFC 4180, CRLF, UTF-8 BOM — the same contract as the other Research exports.
// Internal research fields (evidence notes, quotes) stay out of the export the
// same way the other collections keep editor notes internal.
const COLUMNS = ['id', 'name', 'country', 'subnational_jurisdiction', 'platform_type', 'operator', 'operator_type',
  'procurement_scope', 'coverage', 'official_url', 'tender_search_url',
  'supplier_registration_url', 'submission_url', 'documents_url', 'opportunity_types',
  'search_access', 'electronic_submission', 'supplier_registration_required',
  'foreign_suppliers_accepted', 'languages', 'part_of', 'current_status',
  'browser_check_required', 'evidence_class', 'last_verified'];

// One CSV cell writer for the whole Research Center, shared with the browser.
// RFC 4180 quoting plus the formula guard, from scripts/lib/bd-discovery.cjs —
// the same function the filtered export in the page uses, so the file a reader
// downloads from the button and the file they download from the link cannot
// quote the same value two different ways.
const { csvQuote: csvField } = require('./lib/bd-discovery.cjs');

function renderCsv(rows) {
  const lines = [COLUMNS.join(',')];
  for (const r of rows) {
    lines.push([r.id, r.name, r.country, r.subnationalJurisdiction || '', r.platformType, r.operator || '', r.operatorType,
      r.procurementScope, r.coverage, r.officialUrl, r.tenderSearchUrl || '',
      r.supplierRegistrationUrl || '', r.submissionUrl || '', r.documentsUrl || '',
      r.opportunityTypes.join('; '), r.searchAccess || 'unknown',
      r.electronicSubmission || 'unknown', r.supplierRegistrationRequired || 'unknown',
      r.foreignSuppliersAccepted || 'unknown', (r.languages || []).join('; '),
      r.partOf || '', r.currentStatus, r.browserCheckRequired ? 'yes' : 'no',
      r.evidenceClass, r.lastVerified].map(csvField).join(','));
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}

// --- page -------------------------------------------------------------------
function facet({ name, label, values, labels, t }) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  const options = [...counts.entries()]
    .sort((a, b) => (b[1] - a[1]) || TP.compareStable(a[0], b[0]))
    .map(([v, n]) => `          <option value="${escapeHtml(v)}">${escapeHtml(labels[v] || v)} (${n})</option>`)
    .join('\n');
  return `      <div class="bd-control">
        <label class="bd-label" for="tp-facet-${name}">${escapeHtml(label)}</label>
        <select class="bd-select" id="tp-facet-${name}" data-bd-facet="${name}">
          <option value="">${escapeHtml(t('common.all'))}</option>
${options}
        </select>
      </div>`;
}

// The action cell. Each verified route gets its own labelled link; a route that
// was not verified simply is not there. This is the rendering rule that keeps
// "Search tenders" from ever pointing at a homepage: the label is bound to the
// field, and the field only exists when the route was separately established.
function actionLinks(r, t) {
  const acts = [];
  if (r.tenderSearchUrl) acts.push([r.tenderSearchUrl, t('tp.act.search')]);
  if (r.supplierRegistrationUrl) acts.push([r.supplierRegistrationUrl, t('tp.act.register')]);
  if (r.documentsUrl) acts.push([r.documentsUrl, t('tp.act.documents')]);
  if (r.submissionUrl) acts.push([r.submissionUrl, t('tp.act.submit')]);
  if (!acts.length) return escapeHtml(t('common.notRecorded'));
  return acts.map(([url, label]) =>
    `<a href="${escapeHtml(url)}" rel="noopener noreferrer" target="_blank">${escapeHtml(label)}</a>`)
    .join('<br>');
}

// "United States · California". The country name is localized; the subdivision
// name is not — it is the ISO 3166-2 register's own name for the place, a
// factual identifier of the same kind as a platform name, and translating it
// would mean this project inventing subdivision names in four languages.
function jurisdictionLabel(row, countryName) {
  const base = countryName(row.country);
  if (!row.subnationalJurisdiction) return base;
  const sub = ISO.subdivision(row.subnationalJurisdiction);
  return sub ? `${base} · ${sub.name}` : base;
}

// The subdivision filter earns its place only when there is something to
// filter. Below the threshold it is not rendered at all, which is the same rule
// the rest of the Research Center uses to keep a control panel from filling up
// with facets that have one option each.
const SUBNATIONAL_FACET_MIN = 5;

function subnationalFacet(rows, t) {
  const coded = rows.filter((r) => r.subnationalJurisdiction);
  if (coded.length < SUBNATIONAL_FACET_MIN) return '';
  const labels = Object.fromEntries(coded.map((r) => {
    const sub = ISO.subdivision(r.subnationalJurisdiction);
    return [r.subnationalJurisdiction, sub ? sub.name : r.subnationalJurisdiction];
  }));
  return facet({
    name: 'subnational', t, label: t('tp.f.subnational'),
    values: coded.map((r) => r.subnationalJurisdiction), labels,
  });
}

function renderMain(rows, countryName, t) {
  const c = componentsFor(t);
  const countries = new Set(rows.map((r) => r.country));
  const idToName = new Map(rows.map((r) => [r.id, r.name]));
  const tableRows = rows.map((r) => {
    const evidence = r.browserCheckRequired
      ? t('tp.evidence.browserCheck')
      : t(`tp.evidence.${r.evidenceClass}`);
    const partOf = r.partOf ? t('tp.partOf', { name: idToName.get(r.partOf) || r.partOf }) : '';
    // ── WHAT THE ROW HAS TO CARRY ─────────────────────────────────────────
    //
    // `class="bd-row"`, and `data-bd-rows` on the tbody below, are not
    // decoration. The shared discovery script collects rows by that class and
    // returns on its THIRD STATEMENT if no tbody declares itself:
    //
    //     var bodies = document.querySelectorAll('[data-bd-rows]');
    //     if (!bodies.length) return;
    //
    // This page emitted seven working facet SELECTS and seven matching row
    // attributes, and then rendered a plain <tbody> and a plain <tr>. So the
    // script bailed before binding a single listener and every filter on the
    // page was a no-op: selecting Czech Republic left all 383 rows on screen,
    // Albania and Algeria among them.
    //
    // The haystack is the search corpus, lower-cased once here rather than on
    // every keystroke in the browser. It carries the fields a person searches
    // by — platform, jurisdiction, type, operator — and deliberately not the
    // explanatory prose around the table.
    const haystack = [r.name, jurisdictionLabel(r, countryName),
      t(`tpType.${r.platformType}`), r.operator || ''].join(' ').toLowerCase();
    return `          <tr class="bd-row" data-bd-name="${escapeHtml(r.name)}" `
      + `data-bd-haystack="${escapeHtml(haystack)}" `
      + `data-bd-facet-country="${escapeHtml(r.country)}" `
      + `data-bd-facet-subnational="${escapeHtml(r.subnationalJurisdiction || '')}" `
      + `data-bd-facet-type="${escapeHtml(r.platformType)}" `
      + `data-bd-facet-scope="${escapeHtml(r.procurementScope)}" `
      + `data-bd-facet-esub="${escapeHtml(r.electronicSubmission || 'unknown')}" `
      + `data-bd-facet-foreign="${escapeHtml(r.foreignSuppliersAccepted || 'unknown')}" `
      + `data-bd-facet-evidence="${escapeHtml(r.browserCheckRequired ? 'browser-check' : r.evidenceClass)}">
            <td data-label="${escapeHtml(t('col.platform'))}"><a href="${escapeHtml(r.officialUrl)}" rel="noopener noreferrer" target="_blank">${escapeHtml(r.name)}</a>${partOf ? `<br><small>${escapeHtml(partOf)}</small>` : ''}</td>
            <td data-label="${escapeHtml(t('col.country'))}">${escapeHtml(jurisdictionLabel(r, countryName))}</td>
            <td data-label="${escapeHtml(t('col.type'))}">${escapeHtml(t(`tpType.${r.platformType}`))}</td>
            <td data-label="${escapeHtml(t('tp.col.operator'))}">${escapeHtml(r.operator || t('common.notRecorded'))}</td>
            <td data-label="${escapeHtml(t('tp.col.actions'))}">${actionLinks(r, t)}</td>
            <td data-label="${escapeHtml(t('tp.col.esub'))}">${escapeHtml(t(`tri.${r.electronicSubmission || 'unknown'}`))}</td>
            <td data-label="${escapeHtml(t('tp.col.foreign'))}">${escapeHtml(t(`tri.${r.foreignSuppliersAccepted || 'unknown'}`))}</td>
            <td data-label="${escapeHtml(t('tp.col.evidence'))}">${escapeHtml(evidence)}</td>
          </tr>`;
  }).join('\n');

  const head = ['col.platform', 'col.country', 'col.type', 'tp.col.operator', 'tp.col.actions',
    'tp.col.esub', 'tp.col.foreign', 'tp.col.evidence'].map((k) => t(k));

  return [
    c.pageIntro({
      title: t('tp.title', { n: rows.length, c: countries.size }),
      lede: t('tp.lede'),
    }),
    `<section id="platforms" aria-labelledby="platforms-heading">
      <h2 id="platforms-heading">${escapeHtml(t('tp.platforms'))}</h2>
      <p>${escapeHtml(t('tp.summary', { n: rows.length, c: countries.size }))}</p>
      <div class="bd-controls">
        <div class="bd-control">
          <label class="bd-label" for="tp-search">${escapeHtml(t('common.search'))}</label>
          <input class="bd-input" id="tp-search" type="search" data-bd-search placeholder="${escapeHtml(t('tp.searchPlaceholder'))}">
        </div>
${facet({ name: 'country', t, label: t('tp.f.country'), values: rows.map((r) => r.country), labels: Object.fromEntries([...countries].map((s) => [s, countryName(s)])) })}
${subnationalFacet(rows, t)}
${facet({ name: 'type', t, label: t('tp.f.type'), values: rows.map((r) => r.platformType), labels: Object.fromEntries(TP.PLATFORM_TYPES.map((x) => [x, t(`tpType.${x}`)])) })}
${facet({ name: 'scope', t, label: t('tp.f.scope'), values: rows.map((r) => r.procurementScope), labels: Object.fromEntries(TP.PROCUREMENT_SCOPES.map((x) => [x, t(`tpScope.${x}`)])) })}
${facet({ name: 'esub', t, label: t('tp.f.esub'), values: rows.map((r) => r.electronicSubmission || 'unknown'), labels: Object.fromEntries(TP.TRI_STATE.map((x) => [x, t(`tri.${x}`)])) })}
${facet({ name: 'foreign', t, label: t('tp.f.foreign'), values: rows.map((r) => r.foreignSuppliersAccepted || 'unknown'), labels: Object.fromEntries(TP.TRI_STATE.map((x) => [x, t(`tri.${x}`)])) })}
${facet({ name: 'evidence', t, label: t('tp.f.evidence'), values: rows.map((r) => (r.browserCheckRequired ? 'browser-check' : r.evidenceClass)), labels: { A: t('tp.evidence.A'), B: t('tp.evidence.B'), C: t('tp.evidence.C'), unknown: t('tp.evidence.unknown'), 'browser-check': t('tp.evidence.browserCheck') } })}
        <div class="bd-control">
          <button class="bd-button bd-button--ghost" type="button" data-bd-clear>${escapeHtml(t('common.clearFilters'))}</button>
        </div>
      </div>
      <p class="bd-note"><a class="bd-button" href="/research/tenders-procurement/platforms.csv" download>${escapeHtml(t('tp.downloadCsv', { n: rows.length }))}</a></p>
${c.filteredExportControl({ name: 'tenders-procurement', count: rows.length })}
      <div class="bd-table-wrap">
        <table class="bd-table">
          <caption>${escapeHtml(t('tp.caption'))}</caption>
          <thead><tr>${head.map((h) => `<th scope="col">${escapeHtml(h)}</th>`).join('')}</tr></thead>
          <tbody data-bd-rows>
${tableRows}
          </tbody>
        </table>
      </div>
    </section>`,
    `<section id="methodology" aria-labelledby="methodology-heading">
      <h2 id="methodology-heading">${escapeHtml(t('common.methodology'))}</h2>
      <p>${escapeHtml(t('tp.method1'))}</p>
      <p>${escapeHtml(t('tp.method2'))}</p>
      <p>${escapeHtml(t('tp.method3'))}</p>
    </section>`,
    `<section id="scope" aria-labelledby="scope-heading">
      <h2 id="scope-heading">${escapeHtml(t('tp.scopeHeading'))}</h2>
      <p>${escapeHtml(t('tp.scope1'))}</p>
      <p>${escapeHtml(t('tp.scope2'))}</p>
    </section>`,
    `<section id="limitations" aria-labelledby="limitations-heading">
      <h2 id="limitations-heading">${escapeHtml(t('common.limitations'))}</h2>
      <p>${escapeHtml(t('tp.limit1'))}</p>
      <p>${escapeHtml(t('tp.limit2'))}</p>
      <p><a href="/research/tenders-procurement/intelligence/">${escapeHtml(t('tp.intelligenceLink'))}</a></p>
      <p><a href="/research/tenders-procurement/opportunities/">${escapeHtml(t('tp.opportunitiesLink'))}</a></p>
      <p><a href="/research/tenders-procurement/monitoring/">${escapeHtml(t('tp.monitoringLink'))}</a></p>
    </section>`,
  ].join('\n\n');
}

// --- build ------------------------------------------------------------------

// Pre-write containment, identical in shape to the marketplace build: this
// generator must be unable to write outside research/tenders-procurement/ in
// any locale — not merely unlikely to.
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
  // A Map of slug -> ISO 3166-1 alpha-2, not a bare Set of slugs. Membership
  // still works identically (Map.has), and the codes let the schema catch a
  // subdivision assigned to the wrong country — "California" filed under
  // Canada. `global` and `european-union` legitimately have no alpha-2 and map
  // to null, which the check reads as "no country claim to contradict".
  const countryIso = new Map(countries.map((x) => [x.slug, x.iso2 || null]));
  const all = TP.loadPlatforms(DATA_FILE, countryIso);
  const rows = all.filter(TP.isPublishable).sort(TP.comparePlatforms);

  const previous = fs.existsSync(MANIFEST_FILE)
    ? JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8')).files || [] : [];

  const written = [];
  const ownedPages = [];
  if (rows.length) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const meta = seo.buildTendersMeta({
      count: rows.length, countries: new Set(rows.map((r) => r.country)).size,
    });
    for (const locale of I18N.LOCALE_CODES) {
      const f = path.join(ROOT, I18N.localizedFile(locale, meta.canonicalPath));
      assertOwned(f, [CANONICAL_PATH]);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      writeIfChanged(f, render.renderPage({
        meta, main: renderMain(rows, countryName, I18N.translator(locale)), locale,
      }), written);
      ownedPages.push(f);
    }
    writeIfChanged(CSV_FILE, renderCsv(rows), written);
  }

  const owned = rows.length ? [...ownedPages, CSV_FILE] : [];
  const ownedRel = owned.map((f) => path.relative(ROOT, f));
  let pruned = 0;
  const OWNED = I18N.LOCALE_CODES
    .map((l) => I18N.localizedPath(l, CANONICAL_PATH).replace(/^\//, ''));
  for (const rel of previous) {
    if (ownedRel.includes(rel)) continue;
    if (!OWNED.some((pre) => rel.startsWith(pre))) {
      throw new Error(`Refusing to prune ${rel}: outside this build's own routes.`);
    }
    const abs = path.join(ROOT, rel);
    if (fs.existsSync(abs)) { fs.unlinkSync(abs); pruned += 1; }
  }
  fs.mkdirSync(path.dirname(MANIFEST_FILE), { recursive: true });
  fs.writeFileSync(MANIFEST_FILE, `${JSON.stringify({ files: ownedRel.sort() }, null, 2)}\n`);

  console.log(`Tenders & Procurement: ${rows.length} platform(s) across `
    + `${new Set(rows.map((r) => r.country)).size} jurisdictions; `
    + `${written.length} written, ${pruned} pruned.`);
}

if (require.main === module) main();
module.exports = { renderCsv, renderMain, COLUMNS, CANONICAL_PATH };
