'use strict';

// Unified Distribution Planner — generator.
//
// A fourth sibling build with its own manifest, writing only inside
// research/distribution-planner/. It reads all three collections and writes
// back to none of them.
//
// ── WHY ONE PAGE AND NOT A PAGE PER COMBINATION ─────────────────────────────
//
// 17 businesses x 11 objectives x 40 markets x 4 budgets is 29,920 pages of
// almost identical text. That is combinatorial SEO, it is explicitly forbidden,
// and it would bury the sitemap. The planner is ONE page: the full projected
// opportunity set is prerendered into the HTML with its facts as data
// attributes, and the client filters and re-ranks what is already there. With
// no JavaScript the reader still gets a complete, readable, ranked table and
// working links to all three source collections.
//
// The default plan shown to a no-JS reader is a real plan for a stated default
// query, not an empty shell — so the page is substantive even before a single
// control is touched.

const fs = require('node:fs');
const path = require('node:path');
const P = require('./lib/distribution-planner.cjs');
const A = require('./lib/distribution-actionability.cjs');
// The engine directly, for the surface distribution-planner.cjs does not
// re-export: the default state, the size vocabulary and the CSV field escape.
// It is the same module object either way — the re-export is a view onto this
// one — so nothing here is a second implementation.
const E = require('./lib/dp-engine.cjs');
const REC = require('./lib/media-recommend.cjs');
const MI = require('./lib/media-intelligence.cjs');
// The module-level import is the ENGLISH binding. Using it inside a localized
// render is how the breadcrumb ended up in English on 1,248 pages, so this file
// keeps only the module and binds the locale where it renders.
const componentsModule = require('./lib/bd-components.cjs');
const render = require('./lib/bd-render.cjs');
const seo = require('./lib/bd-seo.cjs');
const I18N = require('./lib/i18n.cjs');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'research', 'distribution-planner');
const PAGE_FILE = path.join(OUT_DIR, 'index.html');
const MANIFEST_FILE = path.join(ROOT, 'data', 'distribution-planner', '.build-manifest.json');
const CSV_FILE = path.join(OUT_DIR, 'execution-opportunities.csv');
// The browser payload, beside the CSV inside the route this build owns. It
// cannot live under /data/, which _redirects turns into a forced 404 so the raw
// collections are never downloadable whole. This route already publishes the
// whole projection deliberately — execution-opportunities.csv is 2,234 rows and
// a download button — so the payload widens no rights position; it is the same
// set of opportunities in the shape the page's own engine reads.
const DATA_FILE = path.join(OUT_DIR, P.PLANNER_DATA_FILE);
const TRACKER = path.join(ROOT, 'data', 'distribution-planner', 'internal-execution-tracker.template.csv');
const CAMPAIGN_SIZE = E.PLANNER_DEFAULTS.size;

// Loaded on the planner and nowhere else. The shared shell already ships the
// Research Center's row-filtering scripts to all 23,628 generated pages; the
// planner's controller re-RANKS from a data file rather than hiding prerendered
// rows, and putting its 61 KB engine in the shell would download it on 23,627
// pages with no planner controls to drive it. The engine comes first — the
// controller stands down when DPEngine is not defined.
const PAGE_SCRIPTS = ['/js/dp-engine.js', '/js/distribution-planner.js'];

// The query the page renders statically. Chosen because it exercises all three
// lanes, so a no-JS reader sees the planner actually working. `evidence` is part
// of it because the control is real now: the prerendered campaign and the
// campaign the client computes from the untouched controls must be the same one.
//
// Owned by the engine rather than declared here, because a THIRD reader of it
// arrived with the URL state: the generator renders from it, the controls carry
// it as their selected options, and a bare planner URL means it. Three copies
// that agree today is the exact shape the hardcoded market name had.
const DEFAULT_QUERY = E.PLANNER_DEFAULTS;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function select({ id, label, options, value, multi = false }) {
  return `        <div class="bd-control">
          <label class="bd-label" for="${id}">${esc(label)}</label>
          <select class="bd-select" id="${id}" data-dp-filter="${id.replace('dp-', '')}"${multi ? ' data-dp-multi' : ''}>
${options.map((o) => `            <option value="${esc(o.value)}"${o.value === value ? ' selected' : ''}>${esc(o.label)}</option>`).join('\n')}
          </select>
        </div>`;
}

function opportunityRow(op, s, countryName) {
  const action = P.ACTION_TYPES[op.actionType];
  const collection = P.COLLECTION_BY_KEY.get(op.sourceCollection);
  const cta = op.actionUrl
    ? `<a class="bd-cta-link" href="${esc(op.actionUrl)}" rel="noopener noreferrer" target="_blank">${esc(action.label)}</a>`
    : `<span class="bd-metric bd-metric--empty">${t('dp.noActionUrl')}</span>`;
  return `          <tr class="bd-row" data-dp-collection="${esc(op.sourceCollection)}" `
    + `data-dp-country="${esc(op.country)}" data-dp-cost="${esc(op.cost)}" `
    + `data-dp-action="${esc(op.actionType)}" data-dp-score="${s.score}" `
    + `data-dp-evidence="${esc(op.evidence)}">
            <td class="bd-cell" data-bd-label="Priority"><strong>${s.score}</strong></td>
            <td class="bd-cell" data-bd-label="Platform"><a href="${esc(op.website)}" rel="noopener noreferrer" target="_blank">${esc(op.name)}</a></td>
            <td class="bd-cell" data-bd-label="Collection">${esc(collection.label)}</td>
            <td class="bd-cell" data-bd-label="Action">${esc(action.label)}</td>
            <td class="bd-cell" data-bd-label="Market">${esc(countryName(op.country))}</td>
            <td class="bd-cell" data-bd-label="Cost">${esc(op.cost)}</td>
            <td class="bd-cell" data-bd-label="Native quality">${op.nativeQuality === null
    ? `<span class="bd-metric bd-metric--empty">${t('dp.notRated')}</span>`
    : `<strong>${op.nativeQuality}</strong>`} <small>${esc(op.nativeSignal)}</small></td>
            <td class="bd-cell" data-bd-label="Why">${esc(s.reasons.join('; '))}</td>
            <td class="bd-cell bd-actions" data-bd-label="Do this">${cta}</td>
          </tr>`;
}

// A queue row. Same shape everywhere, so Ready / Research / Browser read alike —
// and the shape is the ENGINE'S, not this file's. The client re-renders these
// three sections on every control change, and a row model that lived here would
// be a second row model the moment it did.
function queueRow(row) {
  const cell = (c) => {
    const inner = c.url
      ? `<a${c.action ? ' class="bd-cta-link"' : ''} href="${esc(c.url)}"${c.external
        ? ' rel="noopener noreferrer" target="_blank"' : ''}>${esc(c.text)}</a>`
      : (c.action ? `<span class="bd-metric bd-metric--empty">${esc(c.text)}</span>` : esc(c.text));
    return `            <td class="bd-cell${c.action ? ' bd-actions' : ''}" `
      + `data-bd-label="${esc(c.label)}">${inner}</td>`;
  };
  const attrs = Object.keys(row.attrs)
    .map((k) => `${k}="${esc(row.attrs[k])}"`).join(' ');
  return `          <tr class="bd-row" ${attrs}>
${row.cells.map(cell).join('\n')}
          </tr>`;
}

function queueTable(caption, head, rows) {
  return `<div class="bd-table-wrap">
        <table class="bd-table">
          <caption>${esc(caption)}</caption>
          <thead><tr>${head.map((h) => `<th class="bd-cell" scope="col">${esc(h)}</th>`).join('')}</tr></thead>
          <tbody data-bd-rows>
${rows}
          </tbody>
        </table>
      </div>`;
}

// Takes the locale so the BODY is localized, not only the shell around it.
// Previously this was called once and its English output rendered into four
// different <html lang> wrappers — which is why the German planner read English.
function renderMain(ops, countryName, locale = I18N.DEFAULT_LOCALE) {
  const t = I18N.translator(locale);
  const c = componentsModule.components(locale);
  const h = A.health(ops);
  const camp = P.campaign(ops, DEFAULT_QUERY,
    { size: CAMPAIGN_SIZE, evidence: DEFAULT_QUERY.evidence });
  const markets = [...new Set(ops.map((o) => o.country))].sort();
  const defaultProfile = REC.PROFILE_BY_KEY.get(DEFAULT_QUERY.business);
  const defaultObjective = P.OBJECTIVE_BY_KEY.get(DEFAULT_QUERY.objective);
  const defaultEvidence = P.EVIDENCE_MODE_BY_KEY.get(DEFAULT_QUERY.evidence);
  // Option labels come from the dictionary; the summary reuses the SAME strings
  // the controls show, so the sentence can never describe a state the controls
  // are not in.
  const EVIDENCE_LABEL = { ready: t('dp.readyOnly'), high: t('dp.highConfidenceOnly'),
    research: t('dp.includeResearch'), all: t('dp.everything') };
  const marketLabel = DEFAULT_QUERY.market === E.ANY_MARKET
    ? t('dp.anyMarket') : countryName(DEFAULT_QUERY.market);

  // Sections 2, 4 and 5, for the state this page is rendered in. The same four
  // labels the summary and the controls carry, so a heading cannot describe one
  // state while the sentence above it describes another.
  const wl = P.worklist(ops, DEFAULT_QUERY);
  const STATE_LABELS = {
    business: defaultProfile.label,
    objective: defaultObjective.label,
    market: marketLabel,
    budget: P.BUDGET_BY_KEY.get(DEFAULT_QUERY.budget).label,
  };
  const worklistSection = ({ key, number, title, intro, caption, head, extra = '' }) => {
    // The section's id IS the engine's section key, so the client finds each
    // one without holding a status vocabulary of its own.
    const id = key;
    const section = wl.byKey[key];
    const heading = P.worklistHeading({ title: `${number}. ${title}`, count: section.total,
      totalEligible: wl.totalEligible, ...STATE_LABELS });
    // data-dp-title carries the part the client may not invent — the number and
    // the localized title — so the browser rebuilds the same heading through the
    // same engine function rather than assembling a sentence of its own.
    return `<section id="${id}" aria-labelledby="${id}-h">
      <h2 id="${id}-h" data-dp-title="${esc(`${number}. ${title}`)}">${esc(heading)}</h2>
      <p>${esc(intro)}</p>
${queueTable(caption, head, section.rows
    .map((entry) => queueRow(P.worklistRow(entry, key, countryName))).join('\n'))}${extra}
    </section>`;
  };

  const READY_HEAD = [t('col.platform'), t('col.where'), t('col.cost'), t('col.effort'), t('col.timeToPublish'), t('col.howSure'), t('col.doThis')];
  const QUEUE_HEAD = [t('col.platform'), t('col.where'), t('col.whatIsMissing'), t('col.whyItMatters'), t('col.suggestedResearch'), t('col.doThis')];

  return [
    c.pageIntro({
      title: t('collection.planner'),
      lede: t('dp.lede'),
    }),

    `<section id="builder" aria-labelledby="builder-h">
      <h2 id="builder-h">1. Build a campaign</h2>
      <div class="bd-controls" data-dp-controls>
${select({ id: 'dp-business', label: t('dp.businessOrProduct'), value: DEFAULT_QUERY.business,
    options: REC.PROFILES.map((p) => ({ value: p.key, label: p.label })) })}
${select({ id: 'dp-objective', label: t('dp.objective'), value: DEFAULT_QUERY.objective,
    options: P.OBJECTIVES.map((o) => ({ value: o.key, label: o.label })) })}
${select({ id: 'dp-market', label: t('col.market'), value: DEFAULT_QUERY.market,
    options: [{ value: '*', label: t('dp.anyMarket') }, ...markets.map((m) => ({ value: m, label: countryName(m) }))] })}
${select({ id: 'dp-budget', label: t('dp.budget'), value: DEFAULT_QUERY.budget,
    options: P.BUDGETS.map((b) => ({ value: b.key, label: b.label })) })}
${select({ id: 'dp-size', label: t('dp.howMany'), value: String(CAMPAIGN_SIZE),
    options: E.PLANNER_SIZES.map((n) => ({ value: String(n), label: `${n}` })) })}
${select({ id: 'dp-evidence', label: t('dp.evidence'), value: DEFAULT_QUERY.evidence,
    options: P.EVIDENCE_MODES.map((m) => ({ value: m.key, label: EVIDENCE_LABEL[m.key] })) })}
      </div>
      <p class="bd-note" data-dp-status>${esc(P.summaryText({
    size: CAMPAIGN_SIZE,
    business: defaultProfile.label,
    objective: defaultObjective.label,
    market: countryName(DEFAULT_QUERY.market),
    budget: P.BUDGET_BY_KEY.get(DEFAULT_QUERY.budget).label,
    evidence: EVIDENCE_LABEL[defaultEvidence.key],
    totalEligible: camp.totalEligible,
    picked: camp.picked.length,
  }))}</p>
    </section>`,

    // The CSV link stays the WHOLE queue and says so on the button: it is the
    // catalogue export, not this state's, and section 3 is where a reader
    // downloads the campaign the controls are in.
    worklistSection({ key: P.WORKLIST_SECTIONS[0].key, number: 2, title: t('status.READY'),
      intro: t('dp.readyIntro'), caption: t('status.READY'), head: READY_HEAD,
      extra: `
      <p class="bd-note"><a class="bd-button" href="${P.PLANNER_PATH}execution-opportunities.csv" download>${t('dp.downloadQueue')}</a></p>` }),

    // The download button ships HIDDEN and is adopted by the client. It exports
    // the campaign the CONTROLS are in, which the server cannot know and a
    // no-JS reader cannot change — for them section 2 already links the full
    // queue, and a button that handed them a different campaign from the one on
    // screen is the class of defect this page was repaired for. The label comes
    // from the dictionary and the count from the client, so it stays a
    // localized string with a number appended rather than an English sentence
    // assembled in the browser.
    `<section id="campaign" aria-labelledby="campaign-h">
      <h2 id="campaign-h">3. The campaign, grouped by the work it is</h2>
      <p>${esc(t('dp.byActionIntro'))}</p>
      <p class="bd-note"><button class="bd-button" type="button" data-dp-download hidden>${esc(t('common.download'))}</button></p>
${camp.groups.map((g) => `      <section id="cg-${g.key}" data-dp-group="${esc(g.key)}" aria-labelledby="cg-${g.key}-h">
        <h3 id="cg-${g.key}-h">${esc(g.label)} <span class="bd-count">${g.items.length}</span></h3>
        <p>${esc(g.blurb)}</p>
        <ul class="bd-list">
${g.items.map((r) => `          <li><strong>${esc(r.op.name)}</strong> &mdash; ${esc(r.x.act.nextAction)}, `
      + `${esc(P.COLLECTION_BY_KEY.get(r.op.sourceCollection).label)}, ${esc(r.op.cost)}`
      + `${r.x.act.actionUrl ? ` &mdash; <a href="${esc(r.x.act.actionUrl)}" rel="noopener noreferrer" target="_blank">open</a>` : ''}`
      + `<br><small>${esc(`Selected because: ${r.x.reasons.slice(0, 3).join('; ')}`)}</small></li>`).join('\n')}
        </ul>
      </section>`).join('\n')}
    </section>`,

    worklistSection({ key: P.WORKLIST_SECTIONS[1].key, number: 4,
      title: t('status.NEEDS_RESEARCH'), intro: t('dp.needsResearchIntro'),
      caption: t('status.NEEDS_RESEARCH'), head: QUEUE_HEAD }),

    worklistSection({ key: P.WORKLIST_SECTIONS[2].key, number: 5,
      title: t('dp.needsBrowserVerification'), intro: t('dp.needsBrowserIntro'),
      caption: t('dp.needsBrowserVerification'), head: QUEUE_HEAD }),

    // Deliberately NOT state-scoped, and deliberately saying so. Readiness by
    // collection is a fact about the catalogue, not about the campaign — it is
    // the number the data work is judged by, and recomputing it per campaign
    // would turn a dataset metric into a search result. But it sat unlabelled
    // under five numbered builder steps, where a reader has every reason to read
    // it as the sixth output of them, so the scope note is now the first thing
    // in the section and the table carries the same marker.
    `<section id="health" aria-labelledby="health-h" data-dp-scope="corpus">
      <h2 id="health-h">${t('dp.collectionHealth')}</h2>
      <p class="bd-note" data-dp-scope="corpus">${esc(P.healthScopeNote(h.overall.total))}</p>
      <p>${esc(t('dp.healthIntro'))}</p>
      <div class="bd-table-wrap">
        <table class="bd-table">
          <caption>${t('dp.readinessByCollection')}</caption>
          <thead><tr>${[t('col.collection'), t('col.total'), t('dp.ready'), t('status.NEEDS_RESEARCH'), t('dp.needsBrowser'), t('status.BLOCKED'), t('dp.actionUrlCoverage'), t('dp.highConfidence')]
    .map((x) => `<th class="bd-cell" scope="col">${esc(x)}</th>`).join('')}</tr></thead>
          <tbody>
${P.COLLECTIONS.map((col) => {
    const st = h.byCollection[col.key];
    return `            <tr class="bd-row">
              <td class="bd-cell" data-bd-label="Collection"><a href="${col.path}">${esc(col.label)}</a></td>
              <td class="bd-cell" data-bd-label="Total">${st.total}</td>
              <td class="bd-cell" data-bd-label="Ready"><strong>${st.ready}</strong> (${st.actionabilityRate}%)</td>
              <td class="bd-cell" data-bd-label="Needs research">${st.needsResearch}</td>
              <td class="bd-cell" data-bd-label="Needs browser">${st.needsBrowser}</td>
              <td class="bd-cell" data-bd-label="Blocked">${st.blocked}</td>
              <td class="bd-cell" data-bd-label="Action URL coverage">${st.actionUrlCoverage}%</td>
              <td class="bd-cell" data-bd-label="High confidence">${st.highConfidence}</td>
            </tr>`;
  }).join('\n')}
            <tr class="bd-row">
              <td class="bd-cell" data-bd-label="Collection"><strong>${t('dp.allCollections')}</strong></td>
              <td class="bd-cell" data-bd-label="Total"><strong>${h.overall.total}</strong></td>
              <td class="bd-cell" data-bd-label="Ready"><strong>${h.overall.ready}</strong> (${h.overall.actionabilityRate}%)</td>
              <td class="bd-cell" data-bd-label="Needs research">${h.overall.needsResearch}</td>
              <td class="bd-cell" data-bd-label="Needs browser">${h.overall.needsBrowser}</td>
              <td class="bd-cell" data-bd-label="Blocked">${h.overall.blocked}</td>
              <td class="bd-cell" data-bd-label="Action URL coverage">${h.overall.actionUrlCoverage}%</td>
              <td class="bd-cell" data-bd-label="High confidence">${h.overall.highConfidence}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>${esc(`Research debt across all three collections is ${h.overall.researchDebt} opportunities: `
    + `${h.overall.needsResearch} need a route established and ${h.overall.needsBrowser} need a browser. `
    + t('dp.honestState'))}</p>
    </section>`,

    `<section id="method" aria-labelledby="method-h">
      <h2 id="method-h">${t('dp.whatReadyMeans')}</h2>
      <p>${esc(t('dp.readyDefinition'))}</p>
      <p>${esc(t('dp.unknownNeverReady'))}</p>
      <p>${esc(t('dp.confidenceNote'))}</p>
      <p>${esc(t('dp.adaptorNote'))}</p>
      <p>${esc(t('dp.noTrackingNote'))}</p>
    </section>`,
  ].join('\n\n');
}

// ── execution export ────────────────────────────────────────────────────────
// Practical columns for an employee working a queue, not a dump of every field
// across three schemas. Every projected opportunity is a row, so the export is
// the complete work queue rather than only the part that happens to be ready.
const CSV_COLUMNS = ['platform', 'collection', 'country', 'audience', 'actionability_status',
  'next_action', 'action_url', 'cost', 'execution_confidence', 'difficulty', 'publishing_time',
  'evidence_action_url', 'blocker', 'missing', 'native_score', 'native_signal',
  'source_collection_url'];

// The engine's escape, not a local copy. This file's copy was RFC 4180 correct
// and NOT formula-hardened, so one platform name in the 2,234-row export — the
// only value in the whole file that begins with "@" — opened in Excel as a
// formula. The client-side campaign export needs the same escape; two copies of
// it is how one of them stays unhardened.
const csvField = E.csvField;

function renderCsv(ops, countryName) {
  const rows = ops.map((op) => ({ op, a: A.actionability(op) }))
    .sort((x, y) => P.compareStableName(x.op, y.op));
  const lines = [CSV_COLUMNS.join(',')];
  for (const { op, a } of rows) {
    lines.push([op.name, P.COLLECTION_BY_KEY.get(op.sourceCollection).label,
      countryName(op.country), op.audienceGeography || '', a.status, a.nextAction,
      a.actionUrl || '', op.cost, a.confidence, a.difficultyLabel, a.publishingTimeLabel,
      a.evidence.actionUrl, a.blockers, a.missing, op.nativeQuality ?? '', op.nativeSignal,
      P.COLLECTION_BY_KEY.get(op.sourceCollection).path].map(csvField).join(','));
  }
  return `\ufeff${lines.join('\r\n')}\r\n`;
}


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

// The browser payload. Only the fields dp-engine declares it reads, so the page
// receives no contact detail, no internal note and no provenance it cannot use —
// and a test records every property access the engine makes over all 2,234
// opportunities and fails if the two sets differ in either direction.
//
// `fields` travels with the data so a client running a newer engine against a
// cached older payload can see the mismatch and stand down rather than score
// silently on missing facts.
function renderData(ops) {
  return `${JSON.stringify({
    total: ops.length,
    fields: P.FIELD_CONTRACT,
    opportunities: P.projectForClient(ops),
  })}\n`;
}

function main() {
  const src = P.loadAll();
  const countries = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'data/business-directories/countries.json'), 'utf8'));
  const nameBySlug = new Map(countries.map((x) => [x.slug, x.name]));
  const countryName = (slug) => nameBySlug.get(slug) || slug;
  const ops = P.project(src);

  const localePages = [];
  const previous = fs.existsSync(MANIFEST_FILE)
    ? JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8')).files || [] : [];
  const written = [];
  // One write path for every artifact this build owns. Before this the pages
  // went through the containment check and the CSV did not, and each carried its
  // own copy of the read-compare-write dance; a third artifact would have been a
  // third copy, and the one that forgot assertOwned would be the one that could
  // write outside the route.
  const writeIfChanged = (file, body) => {
    assertOwned(file, [P.PLANNER_PATH]);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const prev = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    if (prev !== body) { fs.writeFileSync(file, body); written.push(file); }
  };
  if (ops.length) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const plannerMeta = seo.buildPlannerMeta({
      collections: P.COLLECTIONS.length, total: ops.length, canonicalPath: P.PLANNER_PATH,
    });
    for (const locale of I18N.LOCALE_CODES) {
      const f = path.join(ROOT, I18N.localizedFile(locale, P.PLANNER_PATH));
      writeIfChanged(f, render.renderPage({
        meta: plannerMeta, main: renderMain(ops, countryName, locale), locale, scripts: PAGE_SCRIPTS,
      }));
      localePages.push(f);
    }
    writeIfChanged(CSV_FILE, renderCsv(ops, countryName));
    writeIfChanged(DATA_FILE, renderData(ops));
  }

  const ownedRel = ops.length
    ? [...localePages.map((f) => path.relative(ROOT, f)),
      path.relative(ROOT, CSV_FILE), path.relative(ROOT, DATA_FILE)]
    : [];
  const OUT_REL = `${path.relative(ROOT, OUT_DIR)}/`;
  let pruned = 0;
  for (const rel of previous) {
    if (ownedRel.includes(rel)) continue;
    // Same safety rule as the sibling builds: a corrupt manifest must not let a
    // generator delete a file outside its own directory.
    const owns = I18N.LOCALE_CODES
      .some((l) => rel.startsWith(I18N.localizedPath(l, P.PLANNER_PATH).replace(/^\//, '')));
    if (!owns) throw new Error(`Refusing to prune ${rel}: outside this build's own routes.`);
    const abs = path.join(ROOT, rel);
    if (fs.existsSync(abs)) { fs.unlinkSync(abs); pruned += 1; }
  }
  fs.mkdirSync(path.dirname(MANIFEST_FILE), { recursive: true });
  fs.writeFileSync(MANIFEST_FILE, `${JSON.stringify({ files: ownedRel.sort() }, null, 2)}\n`);

  const h = A.health(ops);
  console.log(`  ready ${h.overall.ready} (${h.overall.actionabilityRate}%), `
    + `research ${h.overall.needsResearch}, browser ${h.overall.needsBrowser}, `
    + `blocked ${h.overall.blocked}; action URL coverage ${h.overall.actionUrlCoverage}%`);
  console.log(`Distribution Planner: ${ops.length} opportunities projected from `
    + `${P.COLLECTIONS.length} collections (`
    + `${P.COLLECTIONS.map((col) => `${col.key} ${ops.filter((o) => o.sourceCollection === col.key).length}`).join(', ')}); `
    + `${written.length} written, ${pruned} pruned.`);
}

if (require.main === module) main();
module.exports = { renderMain, renderCsv, DEFAULT_QUERY, CSV_COLUMNS, CAMPAIGN_SIZE, TRACKER };
