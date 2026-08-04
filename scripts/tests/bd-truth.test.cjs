// scripts/tests/bd-truth.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const S = require('../lib/bd-schema.cjs');
const c = require('../lib/bd-components.cjs');
const { buildArticles } = require('../lib/bd-articles.cjs');
const { loadRegistry } = require('../lib/bd-registry.cjs');
const routes = require('../lib/bd-routes.cjs');

// Guards for the "Say What Is True, Show What Exists" phase. Each test here
// exists because the corresponding claim was once published and was false, or
// because a rendering rule silently turned a null into an assertion. They run
// against the real registry and the real emitted HTML, not fixtures: the whole
// class of defect was prose drifting away from data that had changed.

const ROOT = path.join(__dirname, '..', '..');
const SECTION = path.join(ROOT, 'research', 'business-directories');

const registry = loadRegistry();
const D = registry.directories;
const articles = buildArticles(registry);

function pages() {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name === 'index.html') out.push(p);
    }
  };
  walk(SECTION);
  return out;
}

const ALL = pages().map((p) => ({ file: path.relative(ROOT, p), html: fs.readFileSync(p, 'utf8') }));
const textOf = (html) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

// --- A8: no stale dataset-wide metric claim ---------------------------------

test('A8 no page claims a field is null dataset-wide while a record populates it', () => {
  const populated = S.THIRD_PARTY_METRICS.filter((f) => D.some((d) => d[f] !== null && d[f] !== undefined));
  assert.ok(populated.includes('domainRating'), 'precondition: Domain Rating is populated on some record');

  const LABELS = { domainRating: 'domain rating', authorityScore: 'authority score' };
  for (const { file, html } of ALL) {
    const text = textOf(html).toLowerCase();
    for (const field of populated) {
      const label = LABELS[field];
      if (!label) continue;
      // The exact shape of the claim that went stale: naming the metric and
      // asserting emptiness across the dataset in the same sentence.
      for (const sentence of text.split(/(?<=\.)\s+/)) {
        if (!sentence.includes(label)) continue;
        const claimsEmpty = /\bnull across\b|\bno measurement source (has been |was )?consulted\b/.test(sentence);
        assert.ok(!claimsEmpty,
          `${file} claims ${label} is empty dataset-wide, but ${D.filter((d) => d[field] != null).length} record(s) carry it: "${sentence.trim().slice(0, 160)}"`);
      }
    }
  }
});

// The guard above only proves something if it can fail. This pins the predicate
// against the three shapes the false claim actually took on the site, and
// against the one true sentence that must survive.
test('A8 the stale-claim predicate is non-vacuous', () => {
  const flags = (html) => {
    const out = [];
    for (const sentence of textOf(html).toLowerCase().split(/(?<=\.)\s+/)) {
      if (!sentence.includes('domain rating')) continue;
      if (/\bnull across\b|\bno measurement source (has been |was )?consulted\b/.test(sentence)) out.push(sentence);
    }
    return out;
  };
  assert.equal(flags('<p>Domain Rating, Authority Score and traffic are null across the entire dataset.</p>').length, 1);
  assert.equal(flags('<p>No measurement source was consulted for Domain Rating.</p>').length, 1);
  assert.equal(flags('<p>Every third-party metric including Domain Rating is null across the dataset because no measurement source was consulted.</p>').length, 1);
  assert.equal(flags('<p>Domain Rating is recorded on 6 of 64 records, each carrying its provider and measurement date.</p>').length, 0);
  assert.equal(flags('<p>Typical approval times are null across the entire dataset rather than estimated.</p>').length, 0);
});

test('A8 the derived metric sentence reports the real counts', () => {
  const methodology = ALL.find((p) => p.file.includes('guides/editorial-methodology'));
  assert.ok(methodology, 'the methodology guide is emitted');
  const drCount = D.filter((d) => d.domainRating != null).length;
  assert.ok(textOf(methodology.html).includes(`Domain Rating is recorded on ${drCount} of ${D.length} records`),
    'the methodology guide states the measured Domain Rating count from the registry');
});

test('A17 the verification guide keeps its still-true statement', () => {
  // typicalApprovalTime and reviewProcess really are null on every record, so
  // this sentence must survive the sweep that removed the false ones.
  const guide = ALL.find((p) => p.file.includes('guides/how-directories-are-verified'));
  assert.ok(guide, 'the verification guide is emitted');
  assert.ok(D.every((d) => d.typicalApprovalTime === null && d.reviewProcess === null));
  assert.ok(textOf(guide.html).includes('null across the entire dataset'),
    'a true statement about genuinely empty fields must not be removed');
});

// --- A9: no reference to a score factor that does not exist -----------------

test('A9 every "the X factor" phrase resolves to a declared score factor', () => {
  const labels = new Set(S.SCORE_FACTORS.map((f) => f.label.toLowerCase()));
  const keys = new Set(S.SCORE_FACTORS.map((f) => f.key.toLowerCase()));
  for (const { file, html } of ALL) {
    for (const match of textOf(html).matchAll(/\bthe ((?:[a-z]+ ){0,2}[a-z]+) factor\b/gi)) {
      const name = match[1].trim().toLowerCase();
      // 'the ten factors each scored...' is prose about the set, not a name.
      // Prose about the set as a whole ('the ten factors above, each ...') is not
      // a factor name, so any candidate containing the word itself is skipped.
      if (/\bfactors?\b/.test(name) || name === 'ten') continue;
      assert.ok(labels.has(name) || keys.has(name) || name === 'score',
        `${file} names a "${name}" factor, which is not one of the ten declared score factors`);
    }
  }
});

test('A9 every factor carries a definition and the set is exactly ten', () => {
  assert.equal(S.SCORE_FACTORS.length, 10);
  assert.equal(S.SCORE_FACTORS.reduce((sum, f) => sum + f.weight, 0), 100);
  for (const f of S.SCORE_FACTORS) {
    assert.ok(typeof f.definition === 'string' && f.definition.length > 10,
      `${f.key} has no definition in the central source`);
  }
});

test('A9 detail pages render the factor definitions from the schema', () => {
  const detail = ALL.find((p) => /united-states\/[^/]+\/index\.html$/.test(p.file));
  assert.ok(detail, 'a detail page is emitted');
  const text = textOf(detail.html);
  for (const f of S.SCORE_FACTORS) {
    assert.ok(text.includes(f.definition),
      `${f.key} definition is not rendered on the detail page — pages must render from the central source`);
  }
});

// --- A1 / A18: nothing empty is advertised ----------------------------------

test('A1 no page anywhere says "coming soon"', () => {
  for (const { file, html } of ALL) {
    assert.ok(!/coming soon/i.test(html), `${file} still advertises "coming soon"`);
  }
});

test('A18 no public category page exists with zero verified records', () => {
  for (const { file } of ALL) {
    const m = file.match(/business-directories\/([^/]+)\/categories\/([^/]+)\//);
    if (!m) continue;
    const [, country, category] = m;
    const n = D.filter((d) => d.country === country && d.category === category).length;
    assert.ok(n > 0, `${file} is published but holds no verified record`);
  }
});

test('A18 country pages link no category that holds nothing', () => {
  for (const { file, html } of ALL) {
    if (!/business-directories\/[^/]+\/index\.html$/.test(file)) continue;
    const country = file.match(/business-directories\/([^/]+)\//)[1];
    for (const match of html.matchAll(/href="[^"]*\/categories\/([^/"]+)\//g)) {
      const n = D.filter((d) => d.country === country && d.category === match[1]).length;
      assert.ok(n > 0, `${file} links category "${match[1]}" which holds no record`);
    }
  }
});

// --- A3 / A4: no dead column, no dead sort option ---------------------------

test('A3 no table renders a column whose rows are all empty', () => {
  const COLUMNS = ['Domain Rating', 'Authority Score', 'Estimated traffic'];
  for (const { file, html } of ALL) {
    for (const table of html.matchAll(/<table class="bd-table">[\s\S]*?<\/table>/g)) {
      const block = table[0];
      const heads = [...block.matchAll(/<th class="bd-cell" scope="col">([^<]+)<\/th>/g)].map((m) => m[1]);
      for (const col of COLUMNS) {
        const idx = heads.indexOf(col);
        if (idx === -1) continue;
        // Every rendered metric cell carries its label, so a column's values can
        // be read back out of the row markup without parsing table geometry.
        const cells = [...block.matchAll(new RegExp(`data-bd-label="${col}"[^>]*>([\\s\\S]*?)</td>`, 'g'))]
          .map((m) => m[1]);
        assert.ok(cells.some((cell) => !/bd-metric--empty/.test(cell)),
          `${file} renders a "${col}" column in which every row is empty`);
      }
    }
  }
});

test('A4 every sort option maps to a column the reader can see', () => {
  // Keys are the real SORT_KEYS from js/bd-order.js. Keying this map on names
  // that module does not use made the guard vacuous once already.
  const OPTION_COLUMN = {
    default: 'PetroHrys Score', 'domain-rating': 'Domain Rating',
    'authority-score': 'Authority Score', traffic: 'Estimated traffic',
  };
  const { SORT_KEYS } = require('../lib/bd-sort.cjs');
  for (const key of Object.keys(OPTION_COLUMN)) {
    assert.ok(SORT_KEYS.includes(key), `OPTION_COLUMN key '${key}' is not a real sort key`);
  }
  for (const { file, html } of ALL) {
    if (!html.includes('data-bd-sort')) continue;
    const heads = [...html.matchAll(/<th class="bd-cell" scope="col">([^<]+)<\/th>/g)].map((m) => m[1]);
    for (const match of html.matchAll(/<option value="([^"]+)"/g)) {
      const column = OPTION_COLUMN[match[1]];
      if (!column) continue;
      assert.ok(heads.includes(column),
        `${file} offers a "${match[1]}" sort option but renders no "${column}" column`);
    }
  }
});

// --- A5 / A6: the section states its own scale ------------------------------

test('A5 no page renders a mis-pluralised count', () => {
  for (const { file, html } of ALL) {
    const text = textOf(html);
    assert.ok(!/\b1 directories\b/.test(text), `${file} renders "1 directories"`);
    assert.ok(!/\b(?!1\b)\d+ directory\b/.test(text), `${file} renders "N directory"`);
    assert.ok(!/\b1 categories\b/.test(text), `${file} renders "1 categories"`);
  }
});

test('A6 the hub states the derived scale and names real directories', () => {
  const hub = ALL.find((p) => p.file.endsWith('business-directories/index.html'));
  assert.ok(hub, 'the hub is emitted');
  const text = textOf(hub.html);
  assert.ok(text.includes(`${D.length} verified directories`),
    'the hub states the derived total');
  const named = D.filter((d) => hub.html.includes(`>${d.name}<`)).length;
  assert.ok(named >= 10, `the hub names only ${named} directories; at least 10 are required`);
});

test('A6 hub counts are derived, never hard-coded', () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts', 'build-business-directories.cjs'), 'utf8');
  for (const literal of [String(D.length), '49', '11']) {
    const pattern = new RegExp(`['"\`][^'"\`]*\\b${literal} (verified|directories|countries)`, 'i');
    assert.ok(!pattern.test(source), `the generator hard-codes "${literal}" instead of deriving it`);
  }
});

// --- A10 / A19: filters and submission counts never fabricate ---------------

test('A10 filters disclose that unknown eligibility is excluded', () => {
  for (const { file, html } of ALL) {
    if (!html.includes('data-bd-filter-wrap')) continue;
    assert.ok(html.includes('Filters show confirmed matches only'),
      `${file} renders filters without the confirmed-matches disclosure`);
  }
});

test('A10 a never-established flag is never emitted as a confirmed no', () => {
  for (const { file, html } of ALL) {
    for (const match of html.matchAll(/data-bd-(accepts-[a-z]+|free-submission)="([^"]*)"/g)) {
      assert.ok(['yes', 'no', 'unknown'].includes(match[2]),
        `${file} emits ${match[1]}="${match[2]}" — filter state must be tri-state`);
    }
  }
  // The vocabulary check above cannot catch a null collapsing to 'no', because
  // 'no' is a legal value. Assert the mapping itself, on real records.
  for (const key of S.ACCEPTS_KEYS) {
    const field = `accepts-${key.toLowerCase()}`;
    const unknown = D.find((d) => d.accepts[key] === null);
    if (unknown) {
      assert.equal(c.filterValue(unknown, field), null, `${unknown.id}.${key} must resolve to null`);
      assert.equal(c.filterAttr(unknown, field), 'unknown',
        `${unknown.id}.${key} is not established and must never render as a confirmed no`);
    }
    const yes = D.find((d) => d.accepts[key] === true);
    if (yes) assert.equal(c.filterAttr(yes, field), 'yes');
    const no = D.find((d) => d.accepts[key] === false);
    if (no) assert.equal(c.filterAttr(no, field), 'no');
  }
  // And the emitted rows must agree with the resolver, record by record.
  for (const record of D) {
    const page = ALL.find((pg) => pg.file.endsWith(`${record.country}/index.html`));
    if (!page) continue;
    const row = page.html.split(`data-bd-name="${record.name.replace(/&/g, '&amp;')}"`)[1];
    if (!row) continue;
    const attr = row.slice(0, 600).match(/data-bd-accepts-ai="([^"]+)"/);
    if (attr) {
      assert.equal(attr[1], c.filterAttr(record, 'accepts-ai'),
        `${record.id} row attribute disagrees with the resolver`);
    }
  }
});

test('A19 a statutory register is neither free to submit nor a confirmed no', () => {
  const statutory = D.filter((d) => d.submissionModel === 'notApplicable');
  assert.ok(statutory.length > 0, 'precondition: some records are statutory registers');
  for (const record of statutory) {
    assert.equal(c.filterValue(record, 'free-submission'), null,
      `${record.id} must not answer the free-to-submit question at all`);
  }
  // The free-submission guide counts only records that can actually be submitted.
  assert.ok(S.SUBMITTABLE_MODELS.every((m) => m !== 'notApplicable'));
});

test('A19 statutory registers carry the not-a-submission-target label', () => {
  const statutory = D.filter((d) => d.submissionModel === 'notApplicable');
  for (const record of statutory) {
    const page = ALL.find((p) => p.file.endsWith(`${record.country}/${record.slug}/index.html`));
    if (!page) continue;
    const text = textOf(page.html);
    assert.ok(text.includes('Not a submission target'), `${page.file} is missing the statutory label`);
    assert.ok(!text.includes('Free to submit'), `${page.file} still badges a statutory register as free to submit`);
  }
});

// --- A20: every rendered metric carries provider and date -------------------

test('A20 every rendered Domain Rating shows provider and measurement date', () => {
  const withDr = D.filter((d) => d.domainRating != null);
  assert.ok(withDr.length > 0, 'precondition: some records carry a Domain Rating');
  for (const record of withDr) {
    const provenance = (record.metricsProvenance || {}).domainRating || {};
    assert.ok(provenance.provider && provenance.measuredAt,
      `${record.id} has a Domain Rating without provider and measurement date`);
  }
  for (const { file, html } of ALL) {
    for (const match of html.matchAll(/<span class="bd-metric">(\d+)<span class="bd-metric-source">([\s\S]*?)<\/span>/g)) {
      assert.ok(/measured/.test(match[2]) && /<time datetime="\d{4}-\d{2}-\d{2}"/.test(match[2]),
        `${file} renders a metric value without provider and measurement date`);
    }
  }
});

// --- A7: only dataset-wide-empty groups were suppressed ---------------------

test('A7 the accepts matrix still publishes all twelve flags with their unknowns', () => {
  const detail = ALL.find((p) => /united-states\/[^/]+\/index\.html$/.test(p.file));
  const text = textOf(detail.html);
  for (const key of S.ACCEPTS_KEYS) {
    assert.ok(text.includes(S.ACCEPTS_LABELS[key]), `the accepts matrix dropped ${key}`);
  }
  assert.ok(/Unknown/.test(text), 'per-record unknowns must survive where the field is populated elsewhere');
});

test('A7 a suppressed group is empty across the whole dataset', () => {
  // Suppression is only ever legitimate when nobody has recorded the field
  // anywhere. Anything else would hide a real per-record gap.
  const activeMetrics = c.activeMetricFields(D);
  for (const field of S.THIRD_PARTY_METRICS) {
    if (activeMetrics.includes(field)) continue;
    assert.ok(D.every((d) => d[field] === null || d[field] === undefined),
      `${field} was suppressed while a record populates it`);
  }
  const activeGuidance = c.activeGuidanceFields(D);
  for (const key of ['submissionDifficulty', 'listingQuality', 'typicalApprovalTime', 'reviewProcess']) {
    if (activeGuidance.includes(key)) continue;
    assert.ok(D.every((d) => d[key] === null || d[key] === undefined),
      `${key} was suppressed while a record populates it`);
  }
});

test('A7 a suppressed group returns as soon as one record populates it', () => {
  const one = [{ ...D[0], authorityScore: 40 }];
  assert.ok(c.activeMetricFields(one).includes('authorityScore'),
    'suppression must be data-derived, not a hard-coded exclusion');
  assert.ok(c.activeGuidanceFields([{ ...D[0], reviewProcess: 'Manual' }]).includes('reviewProcess'));
});

// --- A11: the outbound CTA names its destination ----------------------------

test('A11 every detail page has one specific, accessible outbound CTA', () => {
  for (const record of D) {
    const page = ALL.find((p) => p.file.endsWith(`${record.country}/${record.slug}/index.html`));
    if (!page) continue;
    const cta = page.html.match(/<a class="bd-cta-primary"[^>]*>[\s\S]*?<\/a>/);
    assert.ok(cta, `${page.file} has no primary outbound CTA`);
    const escaped = record.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    assert.ok(cta[0].includes(`Visit ${escaped}`), `${page.file} CTA does not name its destination`);
    assert.ok(cta[0].includes('rel="noopener noreferrer"'), `${page.file} CTA is missing rel`);
    assert.ok(!cta[0].includes('nofollow'), `${page.file} CTA must not be nofollowed`);
    assert.ok(cta[0].includes('opens in a new tab'), `${page.file} CTA lacks new-tab announcement`);
    assert.ok(/href="https:\/\//.test(cta[0]), `${page.file} CTA is not an https destination`);
  }
});

// --- indexability and cadence ----------------------------------------------

test('the sitemap equals exactly the indexable page set', () => {
  const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap-business-directories.xml'), 'utf8');
  const locs = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
  for (const { file, html } of ALL) {
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)[1];
    const noindex = /name="robots" content="noindex/.test(html);
    assert.equal(locs.has(canonical), !noindex,
      `${file} is ${noindex ? 'noindex but listed in' : 'indexable but missing from'} the sitemap`);
  }
});

test('a demoted page keeps its links and stays reachable', () => {
  const demoted = D.filter((d) => !S.indexability(d).indexable);
  for (const record of demoted) {
    const page = ALL.find((p) => p.file.endsWith(`${record.country}/${record.slug}/index.html`));
    assert.ok(page, `${record.id} was demoted but its page was not published`);
    assert.ok(/content="noindex,follow"/.test(page.html),
      `${record.id} must be noindex,follow so its links keep flowing`);
  }
});

test('the verification cadence is deterministic and never precedes the check', () => {
  for (const record of D) {
    const first = S.nextVerificationFor(record);
    assert.equal(first, S.nextVerificationFor(record), 'the scheduler must be pure');
    assert.equal(record.nextVerification, first,
      `${record.id} has a stored nextVerification that does not match the rule`);
    assert.ok(record.nextVerification > record.lastVerified,
      `${record.id} is due before it was last verified`);
  }
  // The point of the spread: no single day carries the whole dataset.
  const byDate = {};
  for (const record of D) byDate[record.nextVerification] = (byDate[record.nextVerification] || 0) + 1;
  const busiest = Math.max(...Object.values(byDate));
  assert.ok(busiest <= Math.ceil(D.length / 4),
    `${busiest} records expire on one day; the schedule is not spread`);
});

// --- guide reciprocity ------------------------------------------------------

test('a guide is linked from a record only if it names that record', () => {
  const bySlug = new Map(articles.map((a) => [a.slug, a]));
  for (const { file, html } of ALL) {
    const m = file.match(/business-directories\/([^/]+)\/([^/]+)\/index\.html$/);
    if (!m || m[1] === 'guides' || m[2] === 'categories') continue;
    const record = D.find((d) => d.country === m[1] && d.slug === m[2]);
    if (!record) continue;
    const section = html.split('id="guides"')[1];
    if (!section) continue;
    for (const link of section.matchAll(/href="[^"]*\/guides\/([^/"]+)\//g)) {
      const article = bySlug.get(link[1]);
      assert.ok(article, `${file} links guide "${link[1]}" which was never emitted`);
      assert.ok((article.features || []).includes(record.slug),
        `${file} links "${link[1]}", which does not name this directory`);
    }
  }
});

test('every guide link on a record page resolves to a generated file', () => {
  for (const { file, html } of ALL) {
    for (const link of html.matchAll(/href="(\/research\/business-directories\/[^"]*)"/g)) {
      const target = path.join(ROOT, link[1].replace(/\/$/, ''), 'index.html');
      const alt = path.join(ROOT, link[1].replace(/^\//, ''));
      assert.ok(fs.existsSync(target) || fs.existsSync(alt),
        `${file} links ${link[1]}, which does not exist`);
    }
  }
});

test('routes used by the reciprocity block are real', () => {
  assert.equal(typeof routes.hubPath(), 'string');
  assert.ok(routes.hubPath().startsWith('/'));
});

// --- derived counts -----------------------------------------------------------

test('no published count of a submission model contradicts the registry', () => {
  // "Twenty of the verified directories state a free submission model" survived a
  // reclassification that moved the real figure to 15. Any sentence stating a
  // count of a submission model must agree with the data.
  const counts = {};
  for (const model of S.SUBMISSION_MODELS) counts[model] = D.filter((d) => d.submissionModel === model).length;
  for (const { file, html } of ALL) {
    const text = textOf(html);
    for (const m of text.matchAll(/(\d+) of (?:the )?(?:\d+ )?verified directories[^.]*free submission model/gi)) {
      assert.equal(Number(m[1]), counts.free,
        `${file} claims ${m[1]} free-submission directories; the registry has ${counts.free}`);
    }
  }
});

test('no guide prose spells out a dataset count as a word', () => {
  // A spelled-out numeral cannot be derived and goes stale invisibly.
  const WORDS = /\b(ten|eleven|twelve|thirteen|fifteen|twenty|thirty|forty|fifty|sixty)\b\s+of\s+(the\s+)?(verified|records|directories)/i;
  for (const { file, html } of ALL) {
    const match = textOf(html).match(WORDS);
    assert.ok(!match, `${file} spells out a dataset count: "${match && match[0]}"`);
  }
});

test('the published verification cadence matches the scheduler', () => {
  // Two guides claimed "six months later" after the scheduler moved to 6/9/12.
  const intervals = Object.values(S.REVIEW_INTERVAL_MONTHS);
  const min = Math.min(...intervals);
  const max = Math.max(...intervals);
  for (const { file, html } of ALL) {
    const text = textOf(html);
    for (const m of text.matchAll(/next[- ]verification date[^.]{0,60}?(\w+) months? (?:later|after)/gi)) {
      const claimed = { six: 6, nine: 9, twelve: 12 }[m[1].toLowerCase()];
      if (claimed === undefined) continue;
      assert.ok(min === max && claimed === min,
        `${file} claims a fixed "${m[1]} months" cadence, but the scheduler uses ${min}-${max} months`);
    }
  }
  // And the real spread must match what the guides describe.
  const gaps = D.map((d) => (Date.parse(d.nextVerification) - Date.parse(d.lastVerified)) / 86400000);
  assert.ok(Math.min(...gaps) >= min * 28, 'a record is due sooner than the shortest declared interval');
  assert.ok(Math.max(...gaps) <= max * 31 + S.SPREAD_DAYS, 'a record is due later than the longest declared interval');
});

test('guide reciprocity carries no undefined subject', () => {
  for (const article of articles) {
    if (!Array.isArray(article.features)) continue;
    for (const slug of article.features) {
      assert.ok(typeof slug === 'string' && slug.length > 0,
        `guide "${article.slug}" has an undefined entry in features — reciprocal links would be broken`);
      assert.ok(D.some((d) => d.slug === slug),
        `guide "${article.slug}" claims to name "${slug}", which is not a record`);
    }
  }
  const covered = D.filter((d) => articles.some((a) => (a.features || []).includes(d.slug))).length;
  assert.ok(covered > D.length / 2, `only ${covered} of ${D.length} records are named by any guide`);
});

test('every sort option key is a real shared sort key', () => {
  const { SORT_KEYS } = require('../lib/bd-sort.cjs');
  for (const { file, html } of ALL) {
    for (const m of html.matchAll(/<option value="([^"]+)"/g)) {
      assert.ok(SORT_KEYS.includes(m[1]), `${file} offers sort option "${m[1]}" which bd-sort does not define`);
    }
  }
});
