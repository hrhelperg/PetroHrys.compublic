'use strict';

// Country Intelligence — generator.
//
// A fifth sibling build with its own manifest, writing only inside
// research/countries/ and its three locale mirrors. It reads the four
// collections through scripts/lib/rc-country-intelligence.cjs and writes back to
// none of them.
//
// Same three properties as every other artefact in this repository:
//   DETERMINISTIC  same data in, byte-identical output, on any machine
//   OFFLINE        no network at build time, ever
//   NO EMPTY PAGE  the page refuses to exist with nothing to say
//
// ── ONE PAGE, WITH COUNTRY AS A FILTER ──────────────────────────────────────
//
// Not 124 country pages, and not 496 country-by-collection pages. The rule is
// this repository's own, stated at build-business-directories.cjs near line 462:
// "ONE page for every actionable opportunity, rather than a detail page per row
// or a country page per geography… sixteen new geographies could be added
// without generating a single thin page." 172 of the 496 candidate routes would
// carry fewer than five rows, and the reader's question — "what can I actually
// do in Italy" — is answered by four lists on one screen, not by four documents.
//
// So no per-country route is generated, and no query-string URL ever reaches a
// sitemap, a canonical or an hreflang tag. The canonical is the bare route; the
// filtered views are states of it.
//
// ── FOUR TABLES, AND NO ARITHMETIC BETWEEN THEM ─────────────────────────────
//
// A directory listing, a marketplace seller account, a press submission and a
// tender registration are different work with different costs and different
// outcomes. This page therefore renders four groups and computes NOTHING across
// them: no score, no band, no ranking, no prose about a country. Every value in
// every cell is a field of the view model in rc-country-intelligence.cjs, which
// is the one place that decides what a country's universe contains.
//
// The four groups are `.bd-jgroup` boxes for a reason that is behavioural
// rather than cosmetic: js/business-directories.js sorts WITHIN a group and
// hides a group whose rows have all filtered out, so a Domain Rating sort
// cannot lift a tender platform into the directories table and an empty
// collection does not leave a heading standing over nothing.

const fs = require('node:fs');
const path = require('node:path');

const C = require('./lib/rc-country-intelligence.cjs');
// The module-level import is the ENGLISH binding; the locale-bound set is
// derived from the translator each render function receives. `t.locale` exists
// precisely so a renderer cannot be told the locale twice and inconsistently.
const componentsModule = require('./lib/bd-components.cjs');
const componentsFor = (t) => componentsModule.components(t.locale);
const render = require('./lib/bd-render.cjs');
const seo = require('./lib/bd-seo.cjs');
// Only for AHREFS_ATTRIBUTION. The Ahrefs licence requires the credit wherever a
// Domain Rating is displayed, so the text and the href are read from the one
// constant every collection shares rather than retyped here.
const S = require('./lib/bd-schema.cjs');
const I18N = require('./lib/i18n.cjs');
const { escapeHtml } = require('./lib/bd-util.cjs');
// The shared server/browser sort contract. An option whose key is not in this
// list renders and then does nothing, so the list is checked at build time.
const { SORT_KEYS } = require('./lib/bd-sort.cjs');

const ROOT = path.join(__dirname, '..');
const COUNTRIES_FILE = path.join(ROOT, 'data', 'business-directories', 'countries.json');
const MANIFEST_FILE = path.join(ROOT, 'data', 'country-intelligence', '.build-manifest.json');
const CANONICAL_PATH = '/research/countries/';

// ── THE FOUR STRINGS THAT HAVE NO DICTIONARY KEY ────────────────────────────
//
// Everything else on this page is localized through an EXISTING key — the
// collection names, every column heading, every option label, every control
// label. These four have no key and the brief forbids inventing one, so they are
// English in all four locales, deliberately and visibly, rather than smuggled in
// as four new dictionary entries this build would then own.
//
// They are kept short for exactly that reason: an untranslated paragraph on a
// German page is a localization defect, an untranslated four-word heading is a
// known gap. Listed here in one place so the gap is countable.
const EN = {
  title: 'Country Intelligence',
  lede: 'Every source in the Research Center, grouped by collection and filtered by country.',
  sources: 'Every source, by collection',
  summaryCaption: 'Sources by collection',
  countries: 'Countries',
};

// ── VOCABULARY ORDERS ───────────────────────────────────────────────────────
//
// Facet options are ordered by these lists first and by frequency second, so the
// order is a decision rather than a side effect of how many rows happen to be
// published today. Every value is canonical and identical in all four locales:
// only the labels beside them are translated.
const COST_ORDER = ['free', 'freemium', 'mixed', 'paid', 'unknown'];
const STATUS_ORDER = ['READY', 'NEEDS_RESEARCH', 'NEEDS_BROWSER', 'BLOCKED'];
const ACCESS_ORDER = ['free', 'mixed', 'paid', 'unknown'];

// The orderings this page offers, as [stable key, i18n key] pairs. 'as-published'
// is FIRST and is therefore the client's initial state: adding a sort control
// must not silently re-order a page that had none.
const SORT_OPTIONS = [
  ['as-published', 'sort.asPublished'],
  ['domain-rating', 'sort.drDesc'],
  ['domain-rating-asc', 'sort.drAsc'],
  ['alphabetical', 'sort.alphabetical'],
];

for (const [key] of SORT_OPTIONS) {
  if (!SORT_KEYS.includes(key)) {
    throw new Error(`Sort key "${key}" is not in js/bd-order.js SORT_KEYS `
      + `(${SORT_KEYS.join(', ')}): the option would render and do nothing.`);
  }
}

// ── THE FACETS ──────────────────────────────────────────────────────────────
//
// `name` is the URL parameter and the row attribute suffix; `key` is the field
// of the view model it reads. They differ where the canonical field name is
// camelCase and the attribute must not be — js/business-directories.js and
// scripts/tests/rc-parity.test.cjs both read `data-bd-facet="([a-z]+)"`.
//
// One list drives the selects, the row attributes and the export columns, so a
// facet cannot exist as a control without existing as an attribute.
function facetDefs(t, countryLabels, countryOrder) {
  const label = (ns, values) => Object.fromEntries(values.map((v) => [v, t(`${ns}.${v}`)]));
  const actionValues = [...new Set(
    C.countries().flatMap((s) => C.allOf(C.forCountry(s)))
      .map((r) => r.actionType).filter(Boolean),
  )].sort();
  return [
    { name: 'country', key: 'country', label: t('col.country'), labels: countryLabels, order: countryOrder },
    {
      name: 'collection',
      key: 'collection',
      label: t('col.collection'),
      labels: collectionLabels(t),
      order: C.COLLECTIONS,
    },
    { name: 'cost', key: 'cost', label: t('col.cost'), labels: label('cost', COST_ORDER), order: COST_ORDER },
    {
      name: 'actionability',
      key: 'actionability',
      label: t('bd.actionability'),
      labels: label('act', STATUS_ORDER),
      order: STATUS_ORDER,
    },
    { name: 'action', key: 'actionType', label: t('col.actions'), labels: label('action', actionValues), order: [] },
    {
      name: 'searchaccess',
      key: 'searchAccess',
      label: t('tp.f.searchAccess'),
      labels: label('access', ACCESS_ORDER),
      order: ACCESS_ORDER,
    },
    {
      name: 'bidaccess',
      key: 'bidAccess',
      label: t('tp.f.bidAccess'),
      labels: label('access', ACCESS_ORDER),
      order: ACCESS_ORDER,
    },
  ];
}

// The collection names come from the dictionary, which already holds all four:
// this page names no collection in its own words.
const collectionLabels = (t) => ({
  directories: t('collection.directories'),
  marketplaces: t('collection.marketplaces'),
  media: t('collection.media.full'),
  tenders: t('collection.tenders'),
});

// A facet a row does not have carries the empty string, which every selection
// but "All" excludes. Absence is never rewritten as a value: an unresearched
// bidding fee is not "free", and a tender platform has no readiness at all.
const facetValue = (row, def) => (row[def.key] === null || row[def.key] === undefined
  ? '' : String(row[def.key]));

// A Domain Rating is `null` when nobody has a reading and `0` only when someone
// measured a floor. The attribute is the EMPTY STRING for the first case, never
// 0: js/bd-order.js sorts an empty reading last in both directions, while a 0
// would file every unmeasured record as the worst on the page.
const hasDr = (r) => r.domainRating !== null && r.domainRating !== undefined;
const drAttr = (r) => (hasDr(r) ? String(r.domainRating) : '');

// The label on an execution link. It names the action the collection itself
// recorded — never one derived from the URL. A tender platform's only route is
// its supplier registration, which is what the view model puts in `actionUrl`.
function actionLabel(row, t) {
  if (row.actionType) return t(`action.${row.actionType}`);
  if (row.collection === 'tenders') return t('tp.act.register');
  return t('action.investigate');
}

// ── COLUMNS ─────────────────────────────────────────────────────────────────
//
// Derived PER GROUP rather than once for the page. Tender platforms carry two
// access facts and no readiness and no action type — the planner does not
// project them, and inventing a status for them here would be a second, quieter
// definition of readiness. The other three carry readiness and an action and no
// access facts. One shared column set would therefore be four columns of
// nothing wide, and a column of nothing tells a reader less than no column.
function columnsFor(rows, collection) {
  const cols = [{ key: 'col.platform', cell: 'name' }, { key: 'col.country', cell: 'country' }];
  if (collection === 'tenders') {
    cols.push({ key: 'tp.f.searchAccess', cell: 'searchAccess' });
    cols.push({ key: 'tp.f.bidAccess', cell: 'bidAccess' });
  } else {
    cols.push({ key: 'col.cost', cell: 'cost' });
    cols.push({ key: 'bd.actionability', cell: 'actionability' });
    cols.push({ key: 'col.actions', cell: 'action' });
  }
  // The data attribute is emitted on every row either way, because the browser
  // sorts from the attribute and must be able to sort rows whose column is not
  // rendered — the same split every other collection makes.
  if (rows.some(hasDr)) cols.push({ key: 'col.domainRating', cell: 'dr' });
  if (rows.some((r) => r.actionUrl)) cols.push({ key: 'col.doThis', cell: 'route' });
  return cols;
}

function cellHtml(row, col, t, countryName) {
  switch (col.cell) {
    case 'name':
      return `<a href="${escapeHtml(row.website)}" rel="noopener noreferrer" target="_blank">`
        + `${escapeHtml(row.name)}</a>`;
    case 'country':
      return escapeHtml(countryName(row.country));
    case 'cost':
      return escapeHtml(t(`cost.${row.cost}`));
    case 'actionability':
      return escapeHtml(row.actionability ? t(`act.${row.actionability}`) : t('common.notRecorded'));
    case 'action':
      return escapeHtml(row.actionType ? t(`action.${row.actionType}`) : t('common.notRecorded'));
    // Two separately researched facts, rendered as two cells. They do not imply
    // one another — 294 platforms publish notices for nothing and 8 are
    // established as accepting a bid for nothing — so neither is ever derived
    // from the other, and neither is merged into a single "free" claim.
    case 'searchAccess':
      return escapeHtml(t(`access.${row.searchAccess || 'unknown'}`));
    case 'bidAccess':
      return escapeHtml(t(`access.${row.bidAccess || 'unknown'}`));
    case 'dr':
      return escapeHtml(hasDr(row) ? String(row.domainRating) : t('bd.drNotMeasured'));
    // No route, no link. A record with no `actionUrl` gets the empty marker the
    // worklist already uses, and never a link invented from its website.
    case 'route':
      return row.actionUrl
        ? `<a class="bd-cta-link" href="${escapeHtml(row.actionUrl)}" rel="noopener noreferrer" `
          + `target="_blank">${escapeHtml(actionLabel(row, t))}</a>`
        : `<span class="bd-metric bd-metric--empty">${escapeHtml(t('common.notRecorded'))}</span>`;
    default:
      throw new Error(`Unknown cell "${col.cell}"`);
  }
}

// ── THE ROW ─────────────────────────────────────────────────────────────────
//
// `class="bd-row"` and `data-bd-rows` on the tbody are not decoration. The
// shared discovery script collects rows by that class and returns on its third
// statement when no tbody declares itself — which is how the procurement page
// once shipped seven working selects above a table nothing was bound to.
function rowHtml(row, columns, facets, t, countryName, collectionLabel) {
  // The search corpus, lower-cased once here rather than on every keystroke in
  // the browser. It carries what a person types — the platform, its country and
  // the localized words for its cost, readiness, action and access — and
  // deliberately not the prose around the table.
  const haystack = [
    row.name,
    countryName(row.country),
    collectionLabel,
    row.cost ? t(`cost.${row.cost}`) : '',
    row.actionability ? t(`act.${row.actionability}`) : '',
    row.actionType ? t(`action.${row.actionType}`) : '',
    row.searchAccess ? t(`access.${row.searchAccess}`) : '',
    row.bidAccess ? t(`access.${row.bidAccess}`) : '',
    row.domain || '',
  ].filter(Boolean).join(' ').toLowerCase();

  const attrs = facets
    .map((def) => ` data-bd-facet-${def.name}="${escapeHtml(facetValue(row, def))}"`)
    .join('');
  const cells = columns.map((col) => `            <td class="bd-cell" `
    + `data-bd-label="${escapeHtml(t(col.key))}">${cellHtml(row, col, t, countryName)}</td>`)
    .join('\n');
  return `          <tr class="bd-row" data-bd-name="${escapeHtml(row.name)}" `
    + `data-bd-haystack="${escapeHtml(haystack)}" `
    + `data-bd-dr="${escapeHtml(drAttr(row))}"${attrs}>
${cells}
          </tr>`;
}

// One collection's box. `.bd-jgroup` is what js/business-directories.js walks up
// to when it needs to hide a group whose rows have all filtered out.
function groupHtml(collection, rows, facets, t, countryName) {
  const id = `collection-${collection}`;
  const columns = columnsFor(rows, collection);
  const label = collectionLabels(t)[collection];
  const head = columns
    .map((col) => `<th class="bd-cell" scope="col">${escapeHtml(t(col.key))}</th>`).join('');
  return `      <section class="bd-jgroup" id="${id}" aria-labelledby="${id}-title">
        <h3 class="bd-jgroup-title" id="${id}-title">${escapeHtml(label)} `
    + `<span class="bd-jgroup-count">${rows.length}</span></h3>
        <div class="bd-table-wrap">
          <table class="bd-table">
            <caption class="bd-caption">${escapeHtml(label)}</caption>
            <thead><tr>${head}</tr></thead>
            <tbody data-bd-rows>
${rows.map((r) => rowHtml(r, columns, facets, t, countryName, label)).join('\n')}
            </tbody>
          </table>
        </div>
      </section>`;
}

// ── THE SUMMARY ─────────────────────────────────────────────────────────────
//
// Counts, and nothing that pretends to be a proportion of a market. We know how
// many sources this corpus holds; we do not know how many exist, so "1,610
// business directories" is a fact and "38% coverage" would be an invention with
// a denominator nobody has. Every number here is summed from C.summaryFor(),
// the same function the model already uses to count one country.
function totals() {
  const summaries = C.countries().map((slug) => C.summaryFor(slug));
  const sum = (field) => summaries.reduce((n, s) => n + s[field], 0);
  return {
    countries: summaries.length,
    total: sum('total'),
    directories: sum('directories'),
    marketplaces: sum('marketplaces'),
    media: sum('media'),
    tenders: sum('tenders'),
  };
}

function summaryHtml(counts, t) {
  const labels = collectionLabels(t);
  const rows = C.COLLECTIONS.map((key) => `            <tr>
              <th class="bd-cell" scope="row">${escapeHtml(labels[key])}</th>
              <td class="bd-cell" data-bd-label="${escapeHtml(t('col.total'))}">${counts[key]}</td>
            </tr>`).join('\n');
  // The country count sits OUTSIDE the table on purpose. Inside it, under a
  // column headed "Total" and above a footer reading 2,816, a sixth row saying
  // 124 would invite the reader to add it to a sum it is not part of.
  return `<section id="summary" aria-labelledby="summary-heading">
      <h2 id="summary-heading">${escapeHtml(t('common.overview'))}</h2>
      <p class="bd-note">${escapeHtml(EN.countries)}: ${counts.countries}</p>
      <div class="bd-table-wrap">
        <table class="bd-table">
          <caption class="bd-caption">${escapeHtml(EN.summaryCaption)}</caption>
          <thead><tr><th class="bd-cell" scope="col">${escapeHtml(t('col.collection'))}</th>`
    + `<th class="bd-cell" scope="col">${escapeHtml(t('col.total'))}</th></tr></thead>
          <tbody>
${rows}
          </tbody>
          <tfoot><tr>
            <th class="bd-cell" scope="row">${escapeHtml(t('common.all'))}</th>
            <td class="bd-cell" data-bd-label="${escapeHtml(t('col.total'))}">${counts.total}</td>
          </tr></tfoot>
        </table>
      </div>
    </section>`;
}

// ── THE PAGE ────────────────────────────────────────────────────────────────

function sortControl(t) {
  const options = SORT_OPTIONS
    .map(([value, key]) => `          <option value="${value}">${escapeHtml(t(key))}</option>`)
    .join('\n');
  return `      <div class="bd-control" data-bd-sort-wrap hidden>
        <label class="bd-label" for="cy-sort">${escapeHtml(t('bd.sortBy'))}</label>
        <select class="bd-select" id="cy-sort" data-bd-sort>
${options}
        </select>
      </div>`;
}

function renderMain(universe, counts, countryName, t) {
  const c = componentsFor(t);
  const rows = C.COLLECTIONS.flatMap((key) => universe[key]);
  const countrySlugs = [...new Set(rows.map((r) => r.country))];
  // Countries are ordered by their own name rather than by row count: a 124-item
  // select is read alphabetically. The name is canonical and identical in all
  // four locales, so the order is too — which is what keeps a shared link
  // meaning one thing in every language.
  const countryLabels = Object.fromEntries(countrySlugs.map((s) => [s, countryName(s)]));
  const countryOrder = countrySlugs.slice()
    .sort((a, b) => (countryLabels[a] < countryLabels[b] ? -1
      : countryLabels[a] > countryLabels[b] ? 1 : 0));
  const facets = facetDefs(t, countryLabels, countryOrder);

  const selects = facets.map((def) => c.facetSelect({
    idPrefix: 'cy',
    facet: { name: def.name, key: def.key, multi: false, fallback: '' },
    label: def.label,
    rows,
    labels: def.labels,
    order: def.order,
  })).join('\n');

  // Client-side, and therefore shipped hidden until the script that implements
  // it runs. The component emits nothing at all when no row carries a reading,
  // so the trailing newline is added here rather than baked into it.
  const minDr = c.minDomainRatingControl({ idPrefix: 'cy', rows });

  // Required by the Ahrefs licence wherever a Domain Rating is displayed, as a
  // working link — ONCE for the page, not once per row, and never hidden.
  const attribution = rows.some(hasDr)
    ? `\n      <p class="bd-note"><a href="${escapeHtml(S.AHREFS_ATTRIBUTION.href)}" `
      + `rel="noopener noreferrer" target="_blank">`
      + `${escapeHtml(S.AHREFS_ATTRIBUTION.text)}</a></p>`
    : '';

  return [
    c.pageIntro({ title: EN.title, lede: EN.lede }),
    summaryHtml(counts, t),
    `<section id="sources" aria-labelledby="sources-heading">
      <h2 id="sources-heading">${escapeHtml(EN.sources)}</h2>
      <div class="bd-controls">
${c.searchControls({ idPrefix: 'cy' })}
${selects}
${minDr ? `${minDr}\n` : ''}${sortControl(t)}
${c.clearFiltersControl()}
      </div>
${c.filteredExportControl({ name: 'countries', count: rows.length })}
${C.COLLECTIONS.filter((key) => universe[key].length)
    .map((key) => groupHtml(key, universe[key], facets, t, countryName)).join('\n')}${attribution}
    </section>`,
  ].join('\n\n');
}

// --- build ------------------------------------------------------------------

// Pre-write containment: a generator must be UNABLE to write outside the routes
// it owns, in any locale, rather than merely unlikely to. A mutation that
// pointed one of the sibling builds at de/index.html happily overwrote the
// German homepage.
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

  // The universe is read ONCE and rendered four times. No locale receives a copy
  // of the data: a record is a fact about a platform, not about a language.
  const universe = { directories: [], marketplaces: [], media: [], tenders: [] };
  for (const slug of C.countries()) {
    const groups = C.forCountry(slug);
    for (const key of C.COLLECTIONS) universe[key].push(...groups[key]);
  }
  const counts = totals();

  const previous = fs.existsSync(MANIFEST_FILE)
    ? JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8')).files || [] : [];

  const written = [];
  const ownedPages = [];
  // No empty artefact: with nothing to list, the page does not exist rather than
  // existing empty.
  if (counts.total > 0) {
    const meta = seo.buildCountriesMeta({ countries: counts.countries, sources: counts.total });
    for (const locale of I18N.LOCALE_CODES) {
      const f = path.join(ROOT, I18N.localizedFile(locale, meta.canonicalPath));
      assertOwned(f, [CANONICAL_PATH]);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      writeIfChanged(f, render.renderPage({
        meta,
        main: renderMain(universe, counts, countryName, I18N.translator(locale)),
        locale,
      }), written);
      ownedPages.push(f);
    }
  }

  const ownedRel = ownedPages.map((f) => path.relative(ROOT, f));
  const OWNED = I18N.LOCALE_CODES
    .map((l) => I18N.localizedPath(l, CANONICAL_PATH).replace(/^\//, ''));
  let pruned = 0;
  for (const rel of previous) {
    if (ownedRel.includes(rel)) continue;
    if (!OWNED.some((pre) => rel.startsWith(pre))) {
      throw new Error(`Refusing to prune ${rel}: outside this build's own routes.`);
    }
    const abs = path.join(ROOT, rel);
    if (fs.existsSync(abs)) { fs.unlinkSync(abs); pruned += 1; }
  }

  fs.mkdirSync(path.dirname(MANIFEST_FILE), { recursive: true });
  const manifest = `${JSON.stringify({ files: ownedRel.slice().sort() }, null, 2)}\n`;
  if (!fs.existsSync(MANIFEST_FILE) || fs.readFileSync(MANIFEST_FILE, 'utf8') !== manifest) {
    fs.writeFileSync(MANIFEST_FILE, manifest);
  }

  console.log(`Country Intelligence: ${counts.total} source(s) across ${counts.countries} `
    + `countries (${C.COLLECTIONS.map((k) => `${counts[k]} ${k}`).join(', ')}); `
    + `${written.length} written, ${pruned} pruned.`);
}

if (require.main === module) main();
module.exports = {
  renderMain, groupHtml, columnsFor, facetDefs, totals, collectionLabels, EN,
};
