'use strict';

// Tender Monitoring — the public product over the change-detection engine.
//
// ── ONE ROUTE ───────────────────────────────────────────────────────────────
//
// /research/tenders-procurement/monitoring/ and its three locale siblings.
// Not /alerts/ and /changes/ and /new-tenders/ as well: those would be the same
// data sorted differently, which is four thin pages competing with each other
// instead of one page worth reading.
//
// ── THE RENDERER DOES NOT DETECT ANYTHING ───────────────────────────────────
//
// It calls the engine and displays what comes back. There is no second ranking
// implementation here and none in client JavaScript, because two implementations
// of "which alert matters most" drift apart and then nobody can say which page
// is right.
//
// ── THE PAGE HAS TO BE WORTH READING WHEN NOTHING CHANGED ───────────────────
//
// Procurement is quiet most days, and today the engine reports zero changes.
// A page that is empty on a quiet day is a page that is empty most of the time,
// so the durable half — what monitoring tracks, what "newly observed" means,
// why a disappearance is not a cancellation — is first-party content that
// stands on its own. The alert list is the volatile half.

const fs = require('node:fs');
const path = require('node:path');
const CORPUS = require('./lib/to-corpus.cjs');
const CHANGES = require('./lib/to-changes.cjs');
const ALERTS = require('./lib/to-alerts.cjs');
const MATCH = require('./lib/to-match.cjs');
const SCHEMA = require('./lib/to-schema.cjs');
const TP = require('./lib/tp-schema.cjs');
const render = require('./lib/bd-render.cjs');
const seo = require('./lib/bd-seo.cjs');
const I18N = require('./lib/i18n.cjs');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'data', 'tender-opportunities');
const CORPUS_FILE = path.join(DIR, 'opportunities.json');
const BASELINE_FILE = path.join(DIR, 'monitoring-baseline.json');
const LEDGER_FILE = path.join(DIR, 'change-ledger.json');
const STATE_FILE = path.join(DIR, 'refresh-state.json');
const PLATFORMS_FILE = path.join(ROOT, 'data', 'tenders-procurement', 'platforms.json');
const COUNTRIES_FILE = path.join(ROOT, 'data', 'business-directories', 'countries.json');
const MANIFEST_FILE = path.join(DIR, '.monitoring-manifest.json');
const OUT_DIR = path.join(ROOT, 'research', 'tenders-procurement', 'monitoring');
const CSV_FILE = path.join(OUT_DIR, 'alerts.csv');
const CANONICAL_PATH = '/research/tenders-procurement/monitoring/';

// How many alerts the page renders. The CSV carries everything; a page that
// renders an unbounded ledger becomes a megabyte of table nobody scrolls.
const RENDER_LIMIT = 60;

const DETAIL = require('./lib/to-detail.cjs');
const escapeHtml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const readJson = (f, fb) => {
  if (!fs.existsSync(f)) return fb;
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; }
};

// ── CSV ─────────────────────────────────────────────────────────────────────
const COLUMNS = ['alert_id', 'opportunity_id', 'change_type', 'severity', 'actionable',
  'supplier_profile', 'match_score', 'match_band', 'title', 'buyer', 'country_or_scope',
  'source', 'previous_value', 'current_value', 'status', 'reason', 'notice_url',
  'source_health', 'observed_at'];

// ── SPREADSHEET FORMULA HARDENING ───────────────────────────────────────────
//
// A buyer can legitimately name a procedure "=- Lot 3 -=" or "+44 area works",
// and a tender title beginning with "=" opens in Excel as a formula. Prefixing
// a single quote neutralises it as text.
//
// Applied ONLY at this projection boundary. The canonical title keeps its
// original characters; it is the CSV cell that is defused, because the problem
// belongs to the spreadsheet, not to the procurement.
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function csvField(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (FORMULA_PREFIX.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}


// An alert links to our canonical record when one was published, and straight
// to the official notice when it was not. A link to a detail page that does
// not exist would be worse than no link at all, so eligibility is decided by
// the same indexability rule the generator uses rather than guessed.
function opportunityLink(o, fallbackId) {
  const label = escapeHtml(o.title || fallbackId);
  if (o.id && DETAIL.indexability(o).indexable) {
    return `<a href="${escapeHtml(DETAIL.routeFor(o))}">${label}</a>`;
  }
  const url = o.sourceUrl ? escapeHtml(o.sourceUrl) : '#';
  return `<a href="${url}" rel="noopener noreferrer" target="_blank">${label}</a>`;
}

function renderCsv(rows) {
  const lines = [COLUMNS.join(',')];
  for (const r of rows) lines.push(COLUMNS.map((c) => csvField(r[c])).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}

// ── PROJECTION ──────────────────────────────────────────────────────────────

function csvRows(alerts, byId, health, countryName) {
  return alerts.map((a) => {
    const o = byId.get(a.opportunityId) || {};
    const h = health[(o.sourceId || '')] || {};
    return {
      alert_id: a.id,
      opportunity_id: a.opportunityId,
      change_type: a.changeType,
      severity: a.severity,
      actionable: a.actionable ? 'yes' : 'no',
      supplier_profile: a.supplierProfile,
      match_score: a.matchScore,
      match_band: a.matchBand,
      title: o.title || '',
      buyer: o.buyerName || '',
      country_or_scope: o.country ? countryName(o.country) : (o.projectCountry || o.coverage || ''),
      source: a.sourceIds.join('; '),
      previous_value: a.before,
      current_value: a.after,
      status: a.status,
      // Canonical reason CODES, not translated labels: this is a machine file,
      // and a locale-dependent export would make two downloads disagree.
      reason: a.reasons.map((r) => r.code).join('; '),
      notice_url: o.sourceUrl || '',
      source_health: h.state || 'UNKNOWN',
      observed_at: a.observedAt || '',
    };
  });
}

// ── PAGE ────────────────────────────────────────────────────────────────────

function kpiGrid(stats, health, t) {
  const cards = [
    ['mon.kpi.changes', stats.changes],
    ['mon.kpi.new', stats.byType.NEW_OPPORTUNITY || 0],
    ['mon.kpi.extended', stats.byType.DEADLINE_EXTENDED || 0],
    ['mon.kpi.shortened', stats.byType.DEADLINE_SHORTENED || 0],
    ['mon.kpi.cancelled', stats.byType.CANCELLED || 0],
    ['mon.kpi.awarded', stats.byType.AWARDED || 0],
    ['mon.kpi.reopened', stats.byType.REOPENED || 0],
    ['mon.kpi.material', stats.byType.MATERIAL_TEXT_CHANGED || 0],
    ['mon.kpi.highSeverity', stats.highSeverity],
    ['mon.kpi.sourcesHealthy', health.healthy],
    ['mon.kpi.sourcesDegraded', health.degraded],
  ];
  // Zeroes are shown. Hiding them to make the page look busier would be the
  // first lie a monitoring product tells.
  return `      <div class="bd-kpi-grid">
${cards.map(([k, v]) => `        <div class="bd-kpi"><span class="bd-kpi-value">${escapeHtml(String(v))}</span><span class="bd-kpi-label">${escapeHtml(t(k))}</span></div>`).join('\n')}
      </div>`;
}

function alertRows(alerts, byId, t, countryName) {
  return alerts.map((a) => {
    const o = byId.get(a.opportunityId) || {};
    const where = o.country ? countryName(o.country) : (o.projectCountry || t('mon.scopeUnknown'));
    const reason = a.reasons.map((r) => t(`mon.reason.${r.code}`)).join('; ');
    const unc = a.uncertainty.slice(0, 2).map((u) => t(`mon.unc.${u}`)).join('; ');
    // Actionability is carried as TEXT, not only as a colour class.
    const act = a.actionable ? t('mon.actionable') : t('mon.informational');
    return `          <tr>
            <td data-label="${escapeHtml(t('mon.col.change'))}">${escapeHtml(t(`mon.change.${a.changeType}`))}<br><span class="bd-note">${escapeHtml(t(`mon.severity.${a.severity}`))} · ${escapeHtml(act)}</span></td>
            <td data-label="${escapeHtml(t('mon.col.opportunity'))}">${opportunityLink(o, a.opportunityId)}</td>
            <td data-label="${escapeHtml(t('mon.col.buyer'))}">${escapeHtml(o.buyerName || t('mon.buyerUnknown'))}</td>
            <td data-label="${escapeHtml(t('mon.col.where'))}">${escapeHtml(where)}</td>
            <td data-label="${escapeHtml(t('mon.col.profile'))}">${escapeHtml(t(`tpi.profile.${a.supplierProfile}`))}</td>
            <td data-label="${escapeHtml(t('mon.col.why'))}">${escapeHtml(reason)}${unc ? `<br><span class="bd-note">${escapeHtml(t('mon.unknownPrefix'))} ${escapeHtml(unc)}</span>` : ''}</td>
          </tr>`;
  }).join('\n');
}

function sourceHealthTable(sources, health, t) {
  const head = ['mon.col.source', 'mon.col.state', 'mon.col.lastSuccess', 'mon.col.coverage'].map((k) => t(k));
  const rows = sources.map((s) => {
    const h = health[s.id] || {};
    return `          <tr>
            <td data-label="${escapeHtml(head[0])}">${escapeHtml(s.name)}</td>
            <td data-label="${escapeHtml(head[1])}">${escapeHtml(t(`mon.health.${h.state || 'UNKNOWN'}`))}</td>
            <td data-label="${escapeHtml(head[2])}">${escapeHtml(h.lastSuccessAt ? h.lastSuccessAt.slice(0, 10) : t('mon.never'))}</td>
            <td data-label="${escapeHtml(head[3])}">${escapeHtml(t(`mon.coverage.${h.completeness || 'UNKNOWN'}`))}</td>
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

function renderMain(model, { t, countryName }) {
  const { alerts, stats, health, sources, byId, state, generatedAt, totalRetained } = model;
  const shown = alerts.slice(0, RENDER_LIMIT);

  const alertSection = shown.length
    ? `      <div class="bd-table-wrap">
        <table class="bd-table">
          <thead><tr>${['mon.col.change', 'mon.col.opportunity', 'mon.col.buyer', 'mon.col.where', 'mon.col.profile', 'mon.col.why'].map((k) => `<th scope="col">${escapeHtml(t(k))}</th>`).join('')}</tr></thead>
          <tbody>
${alertRows(shown, byId, t, countryName)}
          </tbody>
        </table>
      </div>
      <p class="bd-note">${escapeHtml(t('mon.showing', { shown: shown.length, total: alerts.length }))}</p>`
    // Truthful empty state. No sample alerts: synthetic examples belong in
    // tests, never in production output.
    : `      <p>${escapeHtml(state === 'BASELINE_INITIALIZED' ? t('mon.emptyBaseline') : t('mon.emptyNoChanges'))}</p>`;

  return [
    `<section id="intro" aria-labelledby="intro-heading">
      <h1 id="intro-heading">${escapeHtml(t('mon.title'))}</h1>
      <p>${escapeHtml(t('mon.lede'))}</p>
      <p>${escapeHtml(t('mon.threeLayers'))}</p>
      <p class="bd-note">${escapeHtml(t('mon.freshness', { date: generatedAt.slice(0, 10) }))}</p>
      <p class="bd-note">${escapeHtml(t('mon.notLive'))}</p>
    </section>`,

    `<section id="summary" aria-labelledby="summary-heading">
      <h2 id="summary-heading">${escapeHtml(t('mon.summaryHeading'))}</h2>
${kpiGrid(stats, health, t)}
    </section>`,

    `<section id="alerts" aria-labelledby="alerts-heading">
      <h2 id="alerts-heading">${escapeHtml(t('mon.alertsHeading'))}</h2>
      <p>${escapeHtml(t('mon.alertsIntro'))}</p>
${alertSection}
    </section>`,

    `<section id="sources" aria-labelledby="sources-heading">
      <h2 id="sources-heading">${escapeHtml(t('mon.sourcesHeading'))}</h2>
      <p>${escapeHtml(t('mon.sourcesIntro'))}</p>
${sourceHealthTable(sources, health, t)}
    </section>`,

    `<section id="method" aria-labelledby="method-heading">
      <h2 id="method-heading">${escapeHtml(t('mon.methodHeading'))}</h2>
      <h3>${escapeHtml(t('mon.methodNewHeading'))}</h3>
      <p>${escapeHtml(t('mon.methodNew'))}</p>
      <h3>${escapeHtml(t('mon.methodGoneHeading'))}</h3>
      <p>${escapeHtml(t('mon.methodGone'))}</p>
      <h3>${escapeHtml(t('mon.methodDeadlineHeading'))}</h3>
      <p>${escapeHtml(t('mon.methodDeadline'))}</p>
      <h3>${escapeHtml(t('mon.methodMatchHeading'))}</h3>
      <p>${escapeHtml(t('mon.methodMatch'))}</p>
    </section>`,

    `<section id="limits" aria-labelledby="limits-heading">
      <h2 id="limits-heading">${escapeHtml(t('common.limitations'))}</h2>
      <p>${escapeHtml(t('mon.limitForeign'))}</p>
      <p>${escapeHtml(t('mon.limitRetention', { n: totalRetained }))}</p>
      <p>${escapeHtml(t('mon.limitDelivery'))}</p>
      <p class="bd-note"><a class="bd-button" href="${CANONICAL_PATH}alerts.csv" download>${escapeHtml(t('mon.downloadCsv', { n: alerts.length }))}</a></p>
      <p><a href="/research/tenders-procurement/opportunities/">${escapeHtml(t('mon.toOpportunities'))}</a> · <a href="/research/tenders-procurement/">${escapeHtml(t('mon.toCollection'))}</a></p>
    </section>`,
  ].join('\n\n');
}

// ── BUILD ───────────────────────────────────────────────────────────────────

function assertOwned(file) {
  const rel = path.relative(ROOT, file);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`Refusing to write outside root: ${rel}`);
  const allowed = I18N.LOCALE_CODES.map((l) => I18N.localizedPath(l, CANONICAL_PATH).replace(/^\//, ''));
  if (!allowed.some((p) => rel.startsWith(p))) throw new Error(`Refusing to write ${rel}: outside owned routes.`);
}

function writeIfChanged(file, content, written) {
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (existing === content) return;
  fs.writeFileSync(file, content);
  written.push(file);
}

function buildModel() {
  const corpus = CORPUS.decode(JSON.parse(fs.readFileSync(CORPUS_FILE, 'utf8')));
  const baseline = readJson(BASELINE_FILE, null);
  const ledger = readJson(LEDGER_FILE, { entries: [] });
  const refreshState = readJson(STATE_FILE, { sources: {} });
  const countries = JSON.parse(fs.readFileSync(COUNTRIES_FILE, 'utf8'));
  const countryIso = new Map(countries.map((c) => [c.slug, c.iso2 || null]));
  const platformsById = new Map(TP.loadPlatforms(PLATFORMS_FILE, countryIso).map((p) => [p.id, p]));

  // Deterministic: the engine is called with the corpus's own generatedAt, not
  // with the clock, so two builds of the same commit agree.
  const nowIso = corpus.generatedAt;
  const result = ALERTS.detect({
    baseline, corpus, health: refreshState.sources, nowIso, platformsById,
  });

  const byId = new Map(corpus.opportunities.map((o) => [o.id, o]));
  const byType = {};
  for (const c of result.changes) byType[c.type] = (byType[c.type] || 0) + 1;
  const highSeverity = result.alerts.filter((a) => a.severity === 'CRITICAL' || a.severity === 'HIGH').length;

  const healthStates = Object.values(refreshState.sources || {});
  return {
    state: result.state,
    alerts: result.alerts,
    changes: result.changes,
    byId,
    generatedAt: nowIso,
    totalRetained: ledger.entries.length,
    health: {
      ...refreshState.sources,
      healthy: healthStates.filter((h) => h.state === 'HEALTHY').length,
      degraded: healthStates.filter((h) => h.state && h.state !== 'HEALTHY').length,
    },
    sources: corpus.sources.filter((s) => s.recordCount > 0),
    stats: { ...result.stats, byType, highSeverity },
    countryName: (slug) => (countries.find((c) => c.slug === slug) || {}).name || slug,
  };
}

function main() {
  if (!fs.existsSync(CORPUS_FILE) || !fs.existsSync(BASELINE_FILE)) {
    console.log('Tender Monitoring: no corpus or baseline; nothing to build.');
    return;
  }
  const model = buildModel();
  const previous = readJson(MANIFEST_FILE, { files: [] }).files || [];
  const written = [];
  const owned = [];

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const meta = seo.buildMonitoringMeta({
    alerts: model.alerts.length, sources: model.sources.length, canonicalPath: CANONICAL_PATH,
  });
  for (const locale of I18N.LOCALE_CODES) {
    const f = path.join(ROOT, I18N.localizedFile(locale, CANONICAL_PATH));
    assertOwned(f);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    writeIfChanged(f, render.renderPage({
      meta,
      main: renderMain(model, { t: I18N.translator(locale), countryName: model.countryName }),
      locale,
    }), written);
    owned.push(f);
  }

  writeIfChanged(CSV_FILE, renderCsv(csvRows(model.alerts, model.byId, model.health, model.countryName)), written);
  owned.push(CSV_FILE);

  const ownedRel = owned.map((f) => path.relative(ROOT, f));
  let pruned = 0;
  const prefixes = I18N.LOCALE_CODES.map((l) => I18N.localizedPath(l, CANONICAL_PATH).replace(/^\//, ''));
  for (const rel of previous) {
    if (ownedRel.includes(rel)) continue;
    if (!prefixes.some((p) => rel.startsWith(p))) throw new Error(`Refusing to prune ${rel}: outside owned routes.`);
    const abs = path.join(ROOT, rel);
    if (fs.existsSync(abs)) { fs.unlinkSync(abs); pruned += 1; }
  }
  fs.mkdirSync(path.dirname(MANIFEST_FILE), { recursive: true });
  fs.writeFileSync(MANIFEST_FILE, `${JSON.stringify({ files: ownedRel.sort() }, null, 2)}\n`);

  console.log(`Tender Monitoring: ${model.state}, ${model.stats.changes} change(s), `
    + `${model.alerts.length} alert(s) across ${model.sources.length} sources; `
    + `${written.length} written, ${pruned} pruned.`);
}

if (require.main === module) main();
module.exports = {
  CANONICAL_PATH, COLUMNS, RENDER_LIMIT, FORMULA_PREFIX,
  csvField, renderCsv, csvRows, renderMain, buildModel,
};
