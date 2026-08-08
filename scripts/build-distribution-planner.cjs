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
const REC = require('./lib/media-recommend.cjs');
const MI = require('./lib/media-intelligence.cjs');
const c = require('./lib/bd-components.cjs');
const render = require('./lib/bd-render.cjs');
const seo = require('./lib/bd-seo.cjs');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'research', 'distribution-planner');
const PAGE_FILE = path.join(OUT_DIR, 'index.html');
const MANIFEST_FILE = path.join(ROOT, 'data', 'distribution-planner', '.build-manifest.json');

// The query the page renders statically. Chosen because it exercises all three
// lanes, so a no-JS reader sees the planner actually working.
const DEFAULT_QUERY = { business: 'local-business', objective: 'local-discovery',
  market: 'united-states', budget: 'free-freemium' };

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
    : `<span class="bd-metric bd-metric--empty">No action URL recorded</span>`;
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
    ? '<span class="bd-metric bd-metric--empty">Not rated</span>'
    : `<strong>${op.nativeQuality}</strong>`} <small>${esc(op.nativeSignal)}</small></td>
            <td class="bd-cell" data-bd-label="Why">${esc(s.reasons.join('; '))}</td>
            <td class="bd-cell bd-actions" data-bd-label="Do this">${cta}</td>
          </tr>`;
}

function renderMain(ops, countryName) {
  const result = P.plan(ops, DEFAULT_QUERY, { perLane: 20, perGroup: 6 });
  const counts = Object.fromEntries(P.COLLECTIONS.map((col) =>
    [col.key, ops.filter((o) => o.sourceCollection === col.key).length]));
  const withUrl = ops.filter((o) => o.actionUrl).length;
  const markets = [...new Set(ops.map((o) => o.country))].sort();
  const defaultProfile = REC.PROFILE_BY_KEY.get(DEFAULT_QUERY.business);
  const defaultObjective = P.OBJECTIVE_BY_KEY.get(DEFAULT_QUERY.objective);

  const laneSections = result.lanes.map((lane) => `<section id="lane-${lane.collection.key}" aria-labelledby="lane-${lane.collection.key}-h" data-dp-lane="${lane.collection.key}">
      <h3 id="lane-${lane.collection.key}-h">${esc(lane.collection.label)}</h3>
      <p>${esc(`${lane.collection.question}. ${lane.total} of the ${counts[lane.collection.key]} `
    + `opportunities in this collection qualify for the query below.`)} <a href="${lane.collection.path}">Open the full collection</a>.</p>
      ${lane.results.length ? `<div class="bd-table-wrap">
        <table class="bd-table">
          <caption>${esc(lane.collection.label)} — ranked for the default query</caption>
          <thead><tr>${['Priority', 'Platform', 'Collection', 'Action', 'Market', 'Cost', 'Native quality', 'Why', 'Do this']
    .map((h) => `<th class="bd-cell" scope="col">${esc(h)}</th>`).join('')}</tr></thead>
          <tbody data-bd-rows>
${lane.results.map((x) => opportunityRow(x.op, x.s, countryName)).join('\n')}
          </tbody>
        </table>
      </div>` : `<p class="bd-note">${esc('Nothing in this collection can deliver this objective for this kind of business. '
    + 'That is an answer, not a gap: a classified listing is not press coverage, and a directory citation is not an editorial mention.')}</p>`}
    </section>`).join('\n\n    ');

  const groupSections = result.groups.map((g) => `      <section id="group-${g.key}" aria-labelledby="group-${g.key}-h">
        <h3 id="group-${g.key}-h">${esc(g.label)}</h3>
        <p>${esc(g.blurb)}</p>
        <ul class="bd-list">
${g.picks.map((x) => `          <li><strong>${esc(x.op.name)}</strong> &mdash; ${esc(P.ACTION_TYPES[x.op.actionType].label)}, ${esc(P.COLLECTION_BY_KEY.get(x.op.sourceCollection).label)}, priority ${x.s.score}${x.op.actionUrl ? ` &mdash; <a href="${esc(x.op.actionUrl)}" rel="noopener noreferrer" target="_blank">go</a>` : ' &mdash; no action URL recorded'}</li>`).join('\n')}
        </ul>
      </section>`).join('\n');

  return [
    c.pageIntro({
      title: 'Distribution Planner',
      lede: 'Choose a business, an objective, a market and a budget posture, and get a ranked '
        + 'plan across all three Research Center databases — with the action, the cost, the '
        + 'evidence behind it and a direct link where one is recorded.',
    }),
    `<section id="what" aria-labelledby="what-h" class="bd-hero">
      <h2 id="what-h">What this combines</h2>
      <ul class="bd-stats">
${P.COLLECTIONS.map((col) => `        <li class="bd-stat"><strong>${counts[col.key]}</strong> ${esc(col.label)}</li>`).join('\n')}
        <li class="bd-stat"><strong>${ops.length}</strong> total opportunities</li>
        <li class="bd-stat"><strong>${withUrl}</strong> with a recorded action URL</li>
      </ul>
      <p>${esc('Three databases, three different questions. Business Directories: where a company '
        + 'creates or claims a professional profile. Marketplace & Classified Platforms: where it '
        + 'publishes a listing or an advertisement. Media, PR & Publishing: where it pitches, '
        + 'publishes, launches or sponsors. The planner chooses across all three and never pretends '
        + 'the three actions are the same — a directory citation is not a press mention, and a '
        + 'classified ad is not editorial coverage.')}</p>
      <p>${esc('Each collection keeps its own quality model. There is no single invented authority '
        + 'score: a media opportunity carries its Media Score, a directory carries its tier and '
        + 'priority, a marketplace carries who may list and what it costs. Every row shows which '
        + 'signal was used.')}</p>
    </section>`,
    `<section id="planner" aria-labelledby="planner-h">
      <h2 id="planner-h">Build a plan</h2>
      <div class="bd-controls" data-dp-controls>
${select({ id: 'dp-business', label: 'Business or product', value: DEFAULT_QUERY.business,
    options: REC.PROFILES.map((p) => ({ value: p.key, label: p.label })) })}
${select({ id: 'dp-objective', label: 'Objective', value: DEFAULT_QUERY.objective,
    options: P.OBJECTIVES.map((o) => ({ value: o.key, label: o.label })) })}
${select({ id: 'dp-market', label: 'Market', value: DEFAULT_QUERY.market,
    options: [{ value: '*', label: 'Any market' }, ...markets.map((m) => ({ value: m, label: countryName(m) }))] })}
${select({ id: 'dp-budget', label: 'Budget posture', value: DEFAULT_QUERY.budget,
    options: P.BUDGETS.map((b) => ({ value: b.key, label: b.label })) })}
${select({ id: 'dp-evidence', label: 'Evidence', value: 'all',
    options: [{ value: 'all', label: 'Include uncertain opportunities' },
      { value: 'route', label: 'Verified action URL only' },
      { value: 'reachable', label: 'Exclude browser-check' }] })}
      </div>
      <p class="bd-note" data-dp-status>${esc(`Showing a plan for a ${defaultProfile.label.toLowerCase()} `
    + `pursuing ${defaultObjective.label.toLowerCase()} in the United States on a free or freemium budget. `
    + `${result.totalScored} opportunities qualify.`)}</p>
      <p class="bd-note"><small>${esc('Without JavaScript the default plan below is complete and every link works. '
    + 'The controls re-rank the same prerendered rows; they load nothing.')}</small></p>
    </section>`,
    `<section id="plan" aria-labelledby="plan-h">
      <h2 id="plan-h">The plan</h2>
      <p>${esc('Grouped by what the work actually is, so the list reads as a sequence of actions '
        + 'rather than one ranking repeated six times. Each opportunity appears in one group only.')}</p>
${groupSections}
    </section>`,
    `<section id="lanes" aria-labelledby="lanes-h">
      <h2 id="lanes-h">By collection</h2>
      <p>${esc('The same results, kept in their three lanes. Each row shows its source collection, '
        + 'its native quality signal, the action it requires and what is uncertain about it.')}</p>
    ${laneSections}
    </section>`,
    `<section id="method" aria-labelledby="method-h">
      <h2 id="method-h">How the ranking works</h2>
      <p>${esc('Priority combines four things: how well the platform serves this kind of business, '
        + 'whether it can deliver this objective at all, whether it reaches the target market, and '
        + 'the quality signal its own collection records. Fit comes first and quality scales it, so '
        + 'a strong platform that cannot deliver the objective is excluded rather than ranked low.')}</p>
      <p>${esc('An objective declares which collections can serve it. Press coverage is a media '
        + 'objective and no directory or classified site can provide it; marketplace exposure is a '
        + 'marketplace objective and no publication can provide it. Those exclusions are the rule, '
        + 'not a filter a reader has to remember to set.')}</p>
      <p>${esc('Nothing here is curated. No platform is named in any profile, objective or group '
        + 'definition, and no platform receives a manual boost. Where the source collection records '
        + 'no action URL the row says so rather than sending you to a homepage.')}</p>
      <p>${esc('Opportunities behind a bot filter are included and marked. A blocked request proves '
        + 'the server answered and nothing about whether the route exists, so they are penalised '
        + 'rather than dropped.')}</p>
    </section>`,
  ].join('\n\n');
}

function main() {
  const src = P.loadAll();
  const countries = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'data/business-directories/countries.json'), 'utf8'));
  const nameBySlug = new Map(countries.map((x) => [x.slug, x.name]));
  const countryName = (slug) => nameBySlug.get(slug) || slug;
  const ops = P.project(src);

  const previous = fs.existsSync(MANIFEST_FILE)
    ? JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8')).files || [] : [];
  const written = [];
  if (ops.length) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const html = render.renderPage({
      meta: seo.buildPlannerMeta({
        collections: P.COLLECTIONS.length,
        total: ops.length,
        canonicalPath: P.PLANNER_PATH,
      }),
      main: renderMain(ops, countryName),
    });
    const existing = fs.existsSync(PAGE_FILE) ? fs.readFileSync(PAGE_FILE, 'utf8') : null;
    if (existing !== html) { fs.writeFileSync(PAGE_FILE, html); written.push(PAGE_FILE); }
  }

  const ownedRel = ops.length ? [path.relative(ROOT, PAGE_FILE)] : [];
  const OUT_REL = `${path.relative(ROOT, OUT_DIR)}/`;
  let pruned = 0;
  for (const rel of previous) {
    if (ownedRel.includes(rel)) continue;
    // Same safety rule as the sibling builds: a corrupt manifest must not let a
    // generator delete a file outside its own directory.
    if (!rel.startsWith(OUT_REL)) {
      throw new Error(`Refusing to prune ${rel}: outside ${OUT_REL}. The manifest is corrupt.`);
    }
    const abs = path.join(ROOT, rel);
    if (fs.existsSync(abs)) { fs.unlinkSync(abs); pruned += 1; }
  }
  fs.mkdirSync(path.dirname(MANIFEST_FILE), { recursive: true });
  fs.writeFileSync(MANIFEST_FILE, `${JSON.stringify({ files: ownedRel.sort() }, null, 2)}\n`);

  console.log(`Distribution Planner: ${ops.length} opportunities projected from `
    + `${P.COLLECTIONS.length} collections (`
    + `${P.COLLECTIONS.map((col) => `${col.key} ${ops.filter((o) => o.sourceCollection === col.key).length}`).join(', ')}); `
    + `${written.length} written, ${pruned} pruned.`);
}

if (require.main === module) main();
module.exports = { renderMain, DEFAULT_QUERY, opportunityRow };
