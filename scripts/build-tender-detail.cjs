'use strict';

// Tender Opportunity Detail Pages v1 — the OFFLINE generator.
//
// One canonical opportunity, one page, one route. Reads the committed corpus
// and makes no network call.
//
// ── ONE ROUTE, NOT FOUR ─────────────────────────────────────────────────────
//
// The material facts on this page — tender title, buyer, dates,
// classifications, declared value, source and official URLs — are source facts
// in the source's own language. Translating them would be inventing them, so a
// German copy of this page would differ from the English one only in its field
// labels.
//
// Measured: 9,577 records x 4 locales is ~531 MB of near-identical files
// against a site that holds 66.8 MB of HTML. So v1 publishes ONE canonical
// route per opportunity, and the localized Discovery and Monitoring pages —
// which are genuinely localized, because they are our own prose — all link to
// it.
//
// This is a deliberate architecture, and it is declared: the page is rendered
// with availableLocales ['en'], so it advertises no hreflang alternate and no
// language switcher entry that does not exist. An earlier run of this
// generator emitted 20,451 phantom DE/ES/FR URLs precisely because the shared
// renderer had no way to say "this route exists once".
//
// Route identity is the canonical opportunity id, never the English title, so
// localized shells remain possible later without moving a single URL.

const fs = require('node:fs');
const path = require('node:path');
const CORPUS = require('./lib/to-corpus.cjs');
const DETAIL = require('./lib/to-detail.cjs');
const ROUTE = require('./lib/to-route.cjs');
const RELATED = require('./lib/to-related.cjs');
const SEARCH = require('./lib/to-search.cjs');
const TP = require('./lib/tp-schema.cjs');
const render = require('./lib/bd-render.cjs');
const seo = require('./lib/bd-seo.cjs');
const I18N = require('./lib/i18n.cjs');

const ROOT = path.join(__dirname, '..');
const CORPUS_FILE = path.join(ROOT, 'data', 'tender-opportunities', 'opportunities.json');
const PLATFORMS_FILE = path.join(ROOT, 'data', 'tenders-procurement', 'platforms.json');
const COUNTRIES_FILE = path.join(ROOT, 'data', 'business-directories', 'countries.json');
const MANIFEST_FILE = path.join(ROOT, 'data', 'tender-opportunities', '.detail-manifest.json');
const SITEMAP_FILE = path.join(ROOT, 'sitemap-tender-opportunities.xml');
const BASE_PATH = ROUTE.BASE;
const LOCALE = 'en';
const LOCALES = [LOCALE];

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function row(label, value, note) {
  if (value === null || value === undefined || value === '') return '';
  return `            <div class="td-row">
              <dt>${esc(label)}</dt>
              <dd>${value}${note ? ` <span class="bd-note">${esc(note)}</span>` : ''}</dd>
            </div>`;
}

function link(url, label) {
  const safe = DETAIL.safeUrl(url);
  if (!safe) return null;
  return `<a href="${esc(safe)}" rel="noopener noreferrer" target="_blank">${esc(label)}</a>`;
}

function dateText(d, t) {
  if (!d) return null;
  // A zoneless date is shown exactly as the source wrote it. Rendering it as
  // an instant would invent a time zone the notice never stated.
  if (d.iso) return d.iso.slice(0, 10);
  return d.raw ? `${d.raw} ${t('toi.localTimeSuffix')}` : null;
}

function valueText(v) {
  if (!v) return null;
  const n = (x) => new Intl.NumberFormat('en').format(x);
  let amount = null;
  if (v.amount != null) amount = n(v.amount);
  else if (v.amountMin != null && v.amountMax != null) amount = `${n(v.amountMin)} – ${n(v.amountMax)}`;
  else if (v.amountMax != null) amount = n(v.amountMax);
  else if (v.amountMin != null) amount = n(v.amountMin);
  if (amount == null) return null;
  return `${esc(amount)} ${esc(v.currency)}`; // original currency, never converted
}

function renderMain(p, { t, countryName, sourceName, platformName, related = [] }) {
  const s = p.source;
  const d = p.dates;
  const where = s.projectCountry && s.projectCountry !== s.country
    ? countryName(s.projectCountry) : (s.country ? countryName(s.country) : null);

  // Every button says exactly what its URL does. There is no "Apply now" and
  // no "Submit bid": this site submits nothing, and a platform homepage is not
  // a submission route for this notice.
  const actions = [];
  const notice = link(s.url, t('tdp.viewNotice'));
  if (notice) actions.push(`      <p class="bd-note"><span class="bd-button">${notice}</span></p>`);
  const submission = s.submissionUrl && s.submissionUrl !== s.url
    ? link(s.submissionUrl, t('tdp.viewSubmission')) : null;
  if (submission) actions.push(`      <p>${submission}</p>`);

  const facts = [
    row(t('toi.col.buyer'), s.buyerName ? esc(s.buyerName) : null),
    row(t('tdp.where'), where ? esc(where) : null),
    row(t('tdp.buyerCountry'), s.country && s.projectCountry && s.projectCountry !== s.country
      ? esc(countryName(s.country)) : null),
    row(t('toi.col.status'), esc(t(`toi.status.${p.status.value}`)), t(`toi.basis.${p.status.basis}`)),
    row(t('tdp.published'), dateText(d.published, t)),
    row(t('toi.col.deadline'), dateText(d.deadline, t),
      d.deadline && !d.deadline.decidable ? t('tds.deadlineNotComparable') : null),
    row(t('tdp.value'), valueText(s.value), s.value ? t('tdp.valueBasis') : null),
    row(t('tdp.reference'), s.officialReference ? esc(s.officialReference) : null),
    row(t('toi.col.source'), esc(sourceName(p.provenance.sourceId))),
    row(t('tdp.platform'), esc(platformName(p.provenance.platformId))),
    row(t('tds.f.esubmission'), esc(t(`tds.esub.${s.electronicSubmission || 'unknown'}`))),
  ].filter(Boolean).join('\n');

  const classifications = s.classifications.length
    ? `      <ul class="td-codes">
${s.classifications.map((c) => `        <li><strong>${esc(c.scheme)}</strong> ${esc(c.code)}${c.label ? ` — ${esc(c.label)}` : ''}</li>`).join('\n')}
      </ul>`
    : `      <p>${esc(t('tdp.noClassification'))}</p>`;

  const occ = p.provenance.occurrences.length
    ? `      <ul class="td-occurrences">
${p.provenance.occurrences.map((x) => {
    const l = link(x.url, sourceName(x.sourceId));
    return `        <li>${l || esc(sourceName(x.sourceId))}${x.noticeId ? ` — ${esc(x.noticeId)}` : ''}</li>`;
  }).join('\n')}
      </ul>` : '';

  // Read from the frozen matching engine: relevance to a supplier profile,
  // never a chance of winning.
  const matches = p.derived.matches.length
    ? `      <ul class="td-matches">
${p.derived.matches.slice(0, 6).map((m) => `        <li><strong>${esc(t(`tpi.profile.${m.profile}`))}</strong> — ${esc(t(`toi.band.${m.band}`))}<br>
          <span class="bd-note">${esc(m.reasons.map((r) => t(`toi.reason.${r}`)).join('; '))}</span></li>`).join('\n')}
      </ul>`
    : `      <p>${esc(t('tdp.noMatches'))}</p>`;

  // Related opportunities are DISTINCT procurements. Each keeps its own facts;
  // nothing is inherited from this page.
  const relatedBlock = related.length ? `
    <section id="related" aria-labelledby="related-heading">
      <h2 id="related-heading">${esc(t('tdp.relatedHeading'))}</h2>
      <p>${esc(t('tdp.relatedNote'))}</p>
      <ul class="td-related-list">
${related.map((r) => `        <li><a href="${esc(r.route)}">${esc(r.title)}</a> <span class="bd-note">— ${esc(t(`toi.status.${r.status}`))}${r.deadline ? ` · ${esc(r.deadline)}` : ''}</span></li>`).join('\n')}
      </ul>
    </section>` : '';

  const verify = [];
  if (p.provenance.browserCheckRequired) verify.push(t('tds.browserCheckNote'));
  if (d.deadline && d.deadline.passedButSourceOpen) verify.push(t('tdp.passedButOpen'));
  if (p.provenance.multiSource) verify.push(t('tds.multiSourceNote', { n: p.provenance.occurrenceCount }));

  return `<section id="opportunity" aria-labelledby="opportunity-heading">
      <h1 id="opportunity-heading">${esc(s.title)}</h1>
      <p>${esc(t('tdp.lede', { buyer: s.buyerName || t('toi.buyerUnknown'), source: sourceName(p.provenance.sourceId) }))}</p>
${actions.join('\n')}
      <p class="bd-note">${esc(t('tdp.notAffiliated'))}</p>
    </section>

    <section id="facts" aria-labelledby="facts-heading">
      <h2 id="facts-heading">${esc(t('tdp.factsHeading'))}</h2>
      <p class="bd-note">${esc(t('tdp.factsNote'))}</p>
      <div class="bd-table-wrap">
        <dl class="td-facts">
${facts}
        </dl>
      </div>
    </section>

    <section id="classification" aria-labelledby="classification-heading">
      <h2 id="classification-heading">${esc(t('tdp.classificationHeading'))}</h2>
      <p>${esc(t('tdp.classificationNote'))}</p>
${classifications}
    </section>
${s.description ? `
    <section id="description" aria-labelledby="description-heading">
      <h2 id="description-heading">${esc(t('tdp.descriptionHeading'))}</h2>
      <p>${esc(s.description)}</p>
      <p class="bd-note">${esc(t('tdp.descriptionExcerpt'))}</p>
    </section>` : ''}

    <section id="matches" aria-labelledby="matches-heading">
      <h2 id="matches-heading">${esc(t('tdp.matchesHeading'))}</h2>
      <p>${esc(t('tdp.matchesNote'))}</p>
${matches}
    </section>

    <section id="provenance" aria-labelledby="provenance-heading">
      <h2 id="provenance-heading">${esc(t('tdp.provenanceHeading'))}</h2>
      <p>${esc(t('tdp.provenanceNote'))}</p>
${occ}
${verify.length ? `      <p class="bd-note">${esc(verify.join(' · '))}</p>` : ''}
      <p class="bd-note">${esc(t('tdp.freshness'))}</p>
    </section>${relatedBlock}

    <section id="limits" aria-labelledby="limits-heading">
      <h2 id="limits-heading">${esc(t('common.limitations'))}</h2>
      <p>${esc(t('tdp.limitSource'))}</p>
      <p>${esc(t('tdp.limitEligibility'))}</p>
      <p>${esc(t('tdp.limitDocuments'))}</p>
      <p class="bd-note">${esc(t('tdp.oneLanguage'))}</p>
      <p><a href="${BASE_PATH}">${esc(t('tdp.backToDiscovery'))}</a></p>
    </section>`;
}

function writeIfChanged(file, content, written) {
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (existing === content) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  written.push(file);
}

// Only indexable pages enter the sitemap. A noindex page in a sitemap is a
// direct contradiction: it asks a crawler to fetch something it is then told
// not to index.
function renderSitemap(pages) {
  const urls = pages.map((p) => `  <url>\n    <loc>${seo.ORIGIN}${p.route}</loc>\n  </url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

// This generator owns exactly one route family: single-segment directories
// under the opportunities hub. It may never touch the hub's own files.
function assertOwned(file) {
  const rel = path.relative(ROOT, file);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Refusing to write outside the site root: ${rel}`);
  }
  if (rel === 'sitemap-tender-opportunities.xml') return;
  const prefix = BASE_PATH.replace(/^\//, '');
  if (!rel.startsWith(prefix)) throw new Error(`Refusing to write ${rel}: outside this build's family.`);
  const tail = rel.slice(prefix.length);
  if (!tail.includes('/')) throw new Error(`Refusing to overwrite a hub file: ${rel}`);
  if (!ROUTE.isDetailShape(`/${rel.replace(/index\.html$/, '')}`)) {
    throw new Error(`Refusing to write ${rel}: not a valid detail route shape.`);
  }
}

// ── ONE RENDER PATH, SHARED WITH THE DRIFT GUARD ────────────────────────────
//
// Everything main() needs to turn the committed corpus into page bytes lives
// here, and main() is the only caller that also WRITES. The generated-drift
// guard calls prepare() and re-renders committed pages through this exact
// function, so it compares against the real generator rather than against a
// second copy of it in a test file.
//
// A test that reimplements the pipeline can only prove that two copies of the
// generator agree with each other — which is precisely the failure mode that
// let 21,948 pages sit one line behind scripts/lib/bd-render.cjs.
function prepare() {
  const corpus = CORPUS.decode(JSON.parse(fs.readFileSync(CORPUS_FILE, 'utf8')));
  const countries = JSON.parse(fs.readFileSync(COUNTRIES_FILE, 'utf8'));
  const nameBySlug = new Map(countries.map((x) => [x.slug, x.name]));
  const countryName = (slug) => nameBySlug.get(slug) || slug;
  const countryIso = new Map(countries.map((x) => [x.slug, x.iso2 || null]));
  const platformsById = new Map(TP.loadPlatforms(PLATFORMS_FILE, countryIso).map((p) => [p.id, p]));
  const platformName = (id) => (platformsById.get(id) ? platformsById.get(id).name : id);
  const sourceById = new Map(corpus.sources.map((s) => [s.id, s.name]));
  const sourceName = (id) => sourceById.get(id) || id;
  const t = I18N.translator(LOCALE);

  const built = DETAIL.build(corpus, { platformsById });
  const pages = built.pages.filter((p) => p.indexable);
  const byId = new Map(built.pages.map((p) => [p.id, p]));
  const published = new Set(pages.map((p) => p.id));

  // Retrieval families come from Relevance v1.1, recomputed from the same
  // deterministic rule rather than re-derived with a second similarity model.
  const searchRecords = corpus.opportunities.map((o) => ({
    i: o.id, ti: o.title, bu: o.buyerName || null, co: o.country || null,
    sr: o.sourceId, sc: [...new Set((o.classifications || []).map((c) => c.scheme))].sort().join(','),
  }));
  SEARCH.hydrate({ records: searchRecords });
  const { families } = RELATED.detectFamilies(searchRecords);
  const relatedOf = new Map();
  for (const f of families) {
    for (const id of f.memberIds) {
      // Only members that actually have a page can be linked. A link to a
      // route we did not generate is a broken link, not a related opportunity.
      relatedOf.set(id, f.memberIds.filter((x) => x !== id && published.has(x)));
    }
  }

  // The bytes of ONE published page, as a pure function of the committed
  // corpus. No filesystem write, no clock, no network — so a caller can render
  // a page purely to compare it with what is on disk.
  const renderFor = (p) => {
    const s = p.source;
    const related = (relatedOf.get(p.id) || []).slice(0, 8).map((id) => {
      const other = byId.get(id);
      return {
        route: other.route,
        title: other.source.title,
        status: other.status.value,
        // Each member states its OWN deadline; nothing is inherited.
        deadline: other.dates.deadline ? dateText(other.dates.deadline, t) : null,
      };
    });
    const meta = seo.buildOpportunityDetailMeta({
      title: s.title,
      buyer: s.buyerName,
      where: (s.projectCountry || s.country) ? countryName(s.projectCountry || s.country) : null,
      deadline: p.dates.deadline ? (p.dates.deadline.iso || '').slice(0, 10) || null : null,
      sourceName: sourceName(p.provenance.sourceId),
      reference: s.officialReference,
      canonicalPath: p.route,
      indexable: p.indexable,
    });
    return render.renderPage({
      meta,
      main: renderMain(p, { t, countryName, sourceName, platformName, related }),
      locale: LOCALE,
      // The declaration that makes this route family honest.
      availableLocales: LOCALES,
    });
  };

  const fileFor = (p) => path.join(ROOT, `${p.route.replace(/^\//, '')}index.html`);

  return { corpus, built, pages, renderFor, fileFor, sitemap: () => renderSitemap(pages) };
}

function main() {
  if (!fs.existsSync(CORPUS_FILE)) {
    console.log('Tender Detail Pages: no corpus; nothing to build.');
    return;
  }
  const { built, pages, renderFor, fileFor, sitemap } = prepare();

  const previous = fs.existsSync(MANIFEST_FILE)
    ? JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8')).files || [] : [];
  const written = [];
  const owned = [];

  for (const p of pages) {
    const file = fileFor(p);
    assertOwned(file);
    writeIfChanged(file, renderFor(p), written);
    owned.push(file);
  }

  writeIfChanged(SITEMAP_FILE, sitemap(), written);
  owned.push(SITEMAP_FILE);

  const ownedRel = owned.map((f) => path.relative(ROOT, f));
  const ownedSet = new Set(ownedRel);
  let pruned = 0;
  for (const rel of previous) {
    if (ownedSet.has(rel)) continue;
    const abs = path.join(ROOT, rel);
    assertOwned(abs);
    if (fs.existsSync(abs)) {
      fs.unlinkSync(abs);
      pruned += 1;
      const dir = path.dirname(abs);
      if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
    }
  }
  fs.mkdirSync(path.dirname(MANIFEST_FILE), { recursive: true });
  fs.writeFileSync(MANIFEST_FILE, `${JSON.stringify({ files: ownedRel.sort() }, null, 2)}\n`);

  console.log(`Tender Detail Pages: ${pages.length} of ${built.pages.length} canonical `
    + `opportunities published; ${written.length} written, ${pruned} pruned.`);
}

if (require.main === module) main();

module.exports = {
  BASE_PATH, LOCALE, LOCALES, renderMain, renderSitemap, assertOwned, main, prepare,
  CORPUS_FILE, MANIFEST_FILE, SITEMAP_FILE,
};
