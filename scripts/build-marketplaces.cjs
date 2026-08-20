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
// Module-level import is the ENGLISH binding; the locale-bound set is derived
// from the translator each render function already receives. `t.locale` exists
// precisely so a renderer never has to be told the locale twice and cannot be
// told it inconsistently.
const componentsModule = require('./lib/bd-components.cjs');
const componentsFor = (t) => componentsModule.components(t.locale);
const render = require('./lib/bd-render.cjs');
const seo = require('./lib/bd-seo.cjs');
// Only for AHREFS_ATTRIBUTION. The Ahrefs licence requires the credit next to
// any displayed Domain Rating, so the text and href are read from the one
// constant every collection shares rather than retyped per page — a hardcoded
// copy is how one page ends up crediting the wrong provider after a change.
const S = require('./lib/bd-schema.cjs');
const I18N = require('./lib/i18n.cjs');
// The readiness facet below publishes the Distribution Planner's own verdict,
// read from the one engine that decides it — not a second opinion computed
// here. A page that re-derived "can an employee act on this today" from the raw
// fields would drift from the planner the first time either of them changed,
// and the two would then disagree in public about the same platform.
const P = require('./lib/distribution-planner.cjs');
const E = require('./lib/dp-engine.cjs');

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
  'second-hand': 'Second-hand',
};
const SELLER_LABELS = { business: 'Businesses only', private: 'Private only', both: 'Businesses and private' };
const COST_LABELS = { free: 'Free', paid: 'Paid', freemium: 'Free tier', unknown: 'Unknown' };
const STATUS_LABELS = { active: 'Active', unknown: 'Needs browser check' };

// --- CSV --------------------------------------------------------------------
// RFC 4180, CRLF, UTF-8 BOM — the same contract as the directory export, because
// an employee opens both in the same spreadsheet.
const COLUMNS = ['id', 'name', 'website', 'country', 'marketplace_type', 'also_covers',
  'seller_types', 'cost', 'operator', 'current_status', 'note'];

// One CSV cell writer for the whole Research Center, shared with the browser —
// see the note in scripts/lib/bd-discovery.cjs. RFC 4180 quoting plus the
// formula guard, so the static export and the filtered one agree.
const { csvQuote: csvField } = require('./lib/bd-discovery.cjs');

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
function facet({ name, label, values, labels, t }) {
  const counts = new Map();
  // An absent value is not an option. The empty string is already spoken for by
  // "All", so a row that carries `data-bd-facet-x=""` is simply unrestricted in
  // that dimension rather than a category of its own — the same rule
  // facetSelect() applies in bd-components.cjs. A no-op for the five facets
  // below, whose fields are required; load-bearing for the two that follow,
  // whose fields are researched per platform and often absent.
  for (const v of values) {
    if (!v) continue;
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  const options = [...counts.entries()]
    .sort((a, b) => (b[1] - a[1]) || MP.compareStable(a[0], b[0]))
    .map(([v, n]) => `          <option value="${escapeHtml(v)}">${escapeHtml(labels[v] || v)} (${n})</option>`)
    .join('\n');
  return `      <div class="bd-control">
        <label class="bd-label" for="mp-facet-${name}">${escapeHtml(label)}</label>
        <select class="bd-select" id="mp-facet-${name}" data-bd-facet="${name}">
          <option value="">${escapeHtml(t('common.all'))}</option>
${options}
        </select>
      </div>`;
}

// A Domain Rating is absent far more often than it is present, and an absent
// one must never read as a zero: `null` is "nobody has a reading", `0` is a
// measured floor. Hence the empty string, and hence the explicit label in the
// cell rather than a bare dash.
const hasDr = (r) => r.domainRating !== null && r.domainRating !== undefined;
const drAttr = (r) => (hasDr(r) ? String(r.domainRating) : '');

// The four states the planner's actionability() can return for a marketplace,
// named from the engine rather than retyped, so a rename there fails here
// instead of silently emitting a filter value nothing matches. The order is the
// order a reader works down: what can be done today, then what is missing.
const READINESS_STATUSES = [
  E.STATUS.READY, E.STATUS.NEEDS_RESEARCH, E.STATUS.NEEDS_BROWSER, E.STATUS.BLOCKED,
];

// Every marketplace's planner status, keyed by platform id. Built ONCE per
// build: P.loadAll() re-reads all three collections from disk, and calling it
// per row — or even per locale — would read them 358 or 4 times over for an
// answer that cannot differ between reads. A platform the planner does not
// project carries no status rather than a guessed one.
function readinessByPlatformId() {
  const readiness = new Map();
  for (const op of P.project(P.loadAll())) {
    if (op.sourceCollection !== 'marketplaces') continue;
    readiness.set(op.platformId, E.actionability(op).status);
  }
  return readiness;
}

// `readiness` defaults to empty so a caller that only wants the table — a test,
// or a future page — is never forced to load three collections to get one.
function renderPage(rows, countryName, t, readiness = new Map()) {
  const c = componentsFor(t);
  const countries = new Set(rows.map((r) => r.country));
  // The column renders only when at least one row in THIS set carries a
  // reading. A column of nothing but "Not measured" tells a reader less than no
  // column at all. The data attribute below is emitted either way, because the
  // browser sorts from the attribute and must be able to sort rows it cannot
  // see a column for — the same split as directoryRow() in bd-components.cjs.
  const showDr = rows.some(hasDr);
  const drLabel = t('col.domainRating');
  // Both are researched per platform and absent far more often than not, and
  // absence is a finding rather than a value: an unresearched seller route is
  // not "unknown the category", it is nothing yet. So it becomes an empty facet
  // attribute, which every filter but "All" excludes.
  const sellerActionOf = (r) => r.sellerAction || '';
  const readinessOf = (r) => readiness.get(r.id) || '';
  const tableRows = rows.map((r) => {
    const types = [r.marketplaceType, ...(r.alsoCovers || [])]
      .map((x) => t(`mpType.${x}`)).join(', ');
    // The row must declare itself to the shared discovery script, which
    // collects by `.bd-row` and gives up entirely when no tbody carries
    // `data-bd-rows`. Five working facet selects sat above a table it never
    // bound to, so Country = India moved the control and left all 286 rows on
    // screen. Same defect and same two attributes as the procurement page —
    // see the longer note in build-tenders-procurement.cjs.
    const haystack = [r.name, countryName(r.country), types,
      t(`seller.${r.sellerTypes}`), t(`cost.${r.costModel}`)].join(' ').toLowerCase();
    const drCell = showDr
      ? `\n            <td data-label="${escapeHtml(drLabel)}">${
        escapeHtml(hasDr(r) ? String(r.domainRating) : t('bd.drNotMeasured'))}</td>`
      : '';
    return `          <tr class="bd-row" data-bd-name="${escapeHtml(r.name)}" `
      + `data-bd-haystack="${escapeHtml(haystack)}" `
      + `data-bd-dr="${escapeHtml(drAttr(r))}" `
      + `data-bd-facet-country="${escapeHtml(r.country)}" `
      + `data-bd-facet-type="${escapeHtml(r.marketplaceType)}" `
      + `data-bd-facet-cost="${escapeHtml(r.costModel)}" `
      + `data-bd-facet-sellers="${escapeHtml(r.sellerTypes)}" `
      + `data-bd-facet-status="${escapeHtml(r.currentStatus)}" `
      + `data-bd-facet-selleraction="${escapeHtml(sellerActionOf(r))}" `
      + `data-bd-facet-actionability="${escapeHtml(readinessOf(r))}">
            <td data-label="${escapeHtml(t('col.platform'))}"><a href="${escapeHtml(r.website)}" rel="noopener noreferrer" target="_blank">${escapeHtml(r.name)}</a></td>
            <td data-label="${escapeHtml(t('col.country'))}">${escapeHtml(countryName(r.country))}</td>
            <td data-label="${escapeHtml(t('col.type'))}">${escapeHtml(types)}</td>
            <td data-label="${escapeHtml(t('col.whoCanList'))}">${escapeHtml(t(`seller.${r.sellerTypes}`))}</td>
            <td data-label="${escapeHtml(t('col.cost'))}">${escapeHtml(t(`cost.${r.costModel}`))}</td>
            <td data-label="${escapeHtml(t('col.operator'))}">${escapeHtml(r.operator || '')}</td>${drCell}
            <td data-label="${escapeHtml(t('col.status'))}">${escapeHtml(t(`currentStatus.${r.currentStatus}`))}</td>
            <td data-label="${escapeHtml(t('col.notes'))}">${escapeHtml(r.note || '')}</td>
          </tr>`;
  }).join('\n');

  // Kept in lockstep with the cells above: the Domain Rating heading appears in
  // the same position, under the same condition, as the <td>.
  const head = ['col.platform', 'col.country', 'col.type', 'col.whoCanList', 'col.cost',
    'col.operator', ...(showDr ? ['col.domainRating'] : []), 'col.status', 'col.notes']
    .map((k) => t(k));

  // Sorting is client-side, so the control is hidden until the script that
  // implements it runs — the same progressive-enhancement contract as
  // sortControls() in bd-components.cjs. The option values are the stable
  // machine keys from js/bd-order.js and are never localized; only the labels
  // beside them are.
  const sortControl = showDr ? `        <div class="bd-control" data-bd-sort-wrap hidden>
          <label class="bd-label" for="mp-sort">${escapeHtml(t('bd.sortBy'))}</label>
          <select class="bd-select" id="mp-sort" data-bd-sort>
            <!-- First, and therefore the client's initial state: adding a sort
                 control must not silently re-order a page that had none. -->
            <option value="as-published">${escapeHtml(t('sort.asPublished'))}</option>
            <option value="domain-rating">${escapeHtml(t('sort.drDesc'))}</option>
            <option value="domain-rating-asc">${escapeHtml(t('sort.drAsc'))}</option>
            <option value="alphabetical">${escapeHtml(t('sort.alphabetical'))}</option>
          </select>
        </div>\n` : '';

  // The threshold filter, like the sort control, is client-side and therefore
  // ships hidden until the script that implements it runs; the component emits
  // nothing at all when no row on the page carries a reading, so the trailing
  // newline is added here rather than baked into a component that may return
  // nothing. Its option values are numbers, never localized.
  const minDr = c.minDomainRatingControl({ idPrefix: 'mp', rows });
  const minDrControl = minDr ? `${minDr}\n` : '';

  // Required by the Ahrefs licence wherever a Domain Rating is displayed, as a
  // working link. Tied to the column and to nothing else: it appears whenever
  // the number does, and is never hidden.
  const drAttribution = showDr
    ? `\n      <p class="bd-note"><a href="${escapeHtml(S.AHREFS_ATTRIBUTION.href)}" `
      + `rel="noopener noreferrer" target="_blank">`
      + `${escapeHtml(S.AHREFS_ATTRIBUTION.text)}</a></p>`
    : '';
  return [
    c.pageIntro({
      // Both numbers are derived. An earlier version hardcoded "in Europe" and
      // kept saying it through four waves that took the dataset worldwide.
      title: t('mp.title', { n: rows.length, c: countries.size }),
      lede: t('mp.lede'),
    }),
    `<section id="platforms" aria-labelledby="platforms-heading">
      <h2 id="platforms-heading">${escapeHtml(t('mp.platforms'))}</h2>
      <p>${escapeHtml(t('mp.summary', { n: rows.length, c: countries.size }))}</p>
      <div class="bd-controls">
        <div class="bd-control">
          <label class="bd-label" for="mp-search">${escapeHtml(t('common.search'))}</label>
          <input class="bd-input" id="mp-search" type="search" data-bd-search placeholder="${escapeHtml(t('mp.searchPlaceholder'))}">
        </div>
${facet({ name: 'country', t, label: t('mp.f.country'), values: rows.map((r) => r.country), labels: Object.fromEntries([...countries].map((s) => [s, countryName(s)])) })}
${facet({ name: 'type', t, label: t('mp.f.type'), values: rows.map((r) => r.marketplaceType), labels: Object.fromEntries(MP.MARKETPLACE_TYPES.map((x) => [x, t(`mpType.${x}`)])) })}
${facet({ name: 'cost', t, label: t('mp.f.cost'), values: rows.map((r) => r.costModel), labels: Object.fromEntries(MP.COST_MODELS.map((x) => [x, t(`cost.${x}`)])) })}
${facet({ name: 'sellers', t, label: t('mp.f.sellers'), values: rows.map((r) => r.sellerTypes), labels: Object.fromEntries(MP.SELLER_TYPES.map((x) => [x, t(`seller.${x}`)])) })}
${facet({ name: 'status', t, label: t('mp.f.status'), values: rows.map((r) => r.currentStatus), labels: Object.fromEntries(['active', 'unknown'].map((x) => [x, t(`currentStatus.${x}`)])) })}
${facet({ name: 'selleraction', t, label: t('mp.f.sellerAction'), values: rows.map(sellerActionOf), labels: Object.fromEntries(MP.SELLER_ACTIONS.map((x) => [x, t(`sellerAction.${x}`)])) })}
${facet({ name: 'actionability', t, label: t('bd.actionability'), values: rows.map(readinessOf), labels: Object.fromEntries(READINESS_STATUSES.map((x) => [x, t(`act.${x}`)])) })}
${minDrControl}${sortControl}        <div class="bd-control">
          <button class="bd-button bd-button--ghost" type="button" data-bd-clear>${escapeHtml(t('common.clearFilters'))}</button>
        </div>
      </div>
      <p class="bd-note"><a class="bd-button" href="/research/marketplaces/marketplaces.csv" download>${escapeHtml(t('mp.downloadCsv', { n: rows.length }))}</a></p>
${c.filteredExportControl({ name: 'marketplaces', count: rows.length })}
      <div class="bd-table-wrap">
        <table class="bd-table">
          <caption>${escapeHtml(t('mp.caption'))}</caption>
          <thead><tr>${head.map((h) => `<th scope="col">${escapeHtml(h)}</th>`).join('')}</tr></thead>
          <tbody data-bd-rows>
${tableRows}
          </tbody>
        </table>
      </div>${drAttribution}
    </section>`,
    `<section id="scope" aria-labelledby="scope-heading">
      <h2 id="scope-heading">${escapeHtml(t('mp.scope'))}</h2>
      <p>${escapeHtml(t('mp.scope1'))}</p>
      <p>${escapeHtml(t('mp.scope2'))}</p>
    </section>`,
  ].join('\n\n');
}

// --- build ------------------------------------------------------------------

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
  const all = MP.loadMarketplaces(DATA_FILE, new Set(nameBySlug.keys()));
  const rows = all.filter(MP.isPublishable).sort(MP.comparePlatforms);

  const previous = fs.existsSync(MANIFEST_FILE)
    ? JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8')).files || [] : [];

  // No empty artefact: with nothing publishable, the page and the export do not
  // exist rather than existing empty.
  const written = [];
  const ownedPages = [];
  if (rows.length) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    // Same shell as every other page on the site: one renderer, so the header,
    // footer, canonical and structured data can never drift between sections.
    const meta = seo.buildMarketplacesMeta({
      count: rows.length, countries: new Set(rows.map((r) => r.country)).size,
    });
    // One canonical route, one file per locale. The 286 records are read once
    // and rendered four times; no locale receives a copy of the data. The
    // planner's statuses are resolved once here for the same reason — a status
    // is a fact about a platform, not about a language.
    const readiness = readinessByPlatformId();
    for (const locale of I18N.LOCALE_CODES) {
      const f = path.join(ROOT, I18N.localizedFile(locale, meta.canonicalPath));
      assertOwned(f, ['/research/marketplaces/']);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      writeIfChanged(f, render.renderPage({
        meta, main: renderPage(rows, countryName, I18N.translator(locale), readiness), locale,
      }), written);
      ownedPages.push(f);
    }
    writeIfChanged(CSV_FILE, renderCsv(rows), written);
  }

  const owned = rows.length ? [...ownedPages, CSV_FILE] : [];
  const ownedRel = owned.map((f) => path.relative(ROOT, f));
  let pruned = 0;
  const OWNED = I18N.LOCALE_CODES
    .map((l) => I18N.localizedPath(l, '/research/marketplaces/').replace(/^\//, ''));
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
