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
const { RELATION_KINDS } = require('../lib/bd-schema.cjs');

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

test('A17 the verification guide states the true position on process fields', () => {
  // typicalApprovalTime and reviewProcess were null on every record when this
  // guide was written. They are populated only where a directory's own
  // documentation states them, so the sentence is derived from the registry and
  // must track it in both directions rather than being asserted once.
  const guide = ALL.find((p) => p.file.includes('guides/how-directories-are-verified'));
  assert.ok(guide, 'the verification guide is emitted');
  const text = textOf(guide.html);
  const documented = D.filter((d) => d.typicalApprovalTime !== null || d.reviewProcess !== null);

  if (documented.length === 0) {
    assert.ok(text.includes('null across the entire dataset'),
      'a true statement about genuinely empty fields must not be removed');
    return;
  }
  assert.ok(!text.includes('null across the entire dataset'),
    `the guide claims these fields are null everywhere, but ${documented.length} record(s) populate them`);
  assert.ok(text.includes(`null on ${D.length - documented.length} of ${D.length} records`),
    'the guide does not state how many records leave the process fields null');
  for (const d of documented) {
    assert.ok(text.includes(d.name),
      `${d.id} documents its process but the guide does not name it as an exception`);
  }
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
  const hub = ALL.find((p) => p.file === path.join('research', 'business-directories', 'index.html'));
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
    // The CTA names the record through the display resolver, so a record with an
    // English title advertises that title rather than its native name.
    const escaped = S.displayName(record).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
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

// --- indexability contract ----------------------------------------------------

test('every published record carries a unique name and description', () => {
  // The contract asks for a UNIQUE editorial description. Uniqueness is a
  // registry-wide property, so it is checked here rather than inside the
  // per-record predicate, and without any length threshold.
  const names = new Map();
  const descriptions = new Map();
  for (const record of D) {
    const name = record.name.trim().toLowerCase();
    const description = record.description.trim().toLowerCase();
    assert.ok(!names.has(name), `${record.id} repeats the name of ${names.get(name)}`);
    assert.ok(!descriptions.has(description),
      `${record.id} repeats the description of ${descriptions.get(description)}`);
    names.set(name, record.id);
    descriptions.set(description, record.id);
  }
});

test('curated relations are not required for indexing', () => {
  // Relations and guide links are valuable but optional. A record with a full
  // evidence package and no relation must stay indexable: the missing relation
  // is a gap in our cross-referencing, not thinness in the page.
  const withoutRelations = D.filter((r) => !RELATION_KINDS.some((k) => ((r.related || {})[k] || []).length));
  assert.ok(withoutRelations.length > 0, 'precondition: some records carry no relation');
  for (const record of withoutRelations) {
    const { indexable, missing } = S.indexability(record);
    assert.ok(indexable, `${record.id} was demoted for: ${missing.join(', ')}`);
  }
});

test('the indexability predicate still rejects a genuinely thin record', () => {
  // Non-vacuity: the relaxation must not have made the predicate unfailable.
  const base = D[0];
  assert.ok(S.indexability(base).indexable);
  assert.ok(!S.indexability({ ...base, pros: [], cons: [] }).indexable, 'no pros and no cons is thin');
  assert.ok(!S.indexability({ ...base, scoreFactors: null }).indexable, 'no factor breakdown is thin');
  assert.ok(!S.indexability({ ...base, website: 'http://insecure.example' }).indexable, 'non-HTTPS is rejected');
  assert.ok(!S.indexability({ ...base, verification: { status: 'unverified', source: null, reviewers: [] } }).indexable);
  assert.ok(!S.indexability({ ...base, description: '  ' }).indexable, 'an empty description is thin');
});

// --- canonical host -----------------------------------------------------------
// Production serves the apex and 301-redirects www to it. A canonical, sitemap
// entry or feed link on the www host points at a URL that does not serve.

test('the apex is the only absolute host in generated output', () => {
  const seo = require('../lib/bd-seo.cjs');
  assert.equal(seo.ORIGIN, 'https://petrohrys.com');
  const targets = [
    ...ALL.map((p) => ({ file: p.file, text: p.html })),
    { file: 'sitemap-business-directories.xml', text: fs.readFileSync(path.join(ROOT, 'sitemap-business-directories.xml'), 'utf8') },
    { file: 'feed.xml', text: fs.readFileSync(path.join(SECTION, 'feed.xml'), 'utf8') },
  ];
  for (const { file, text } of targets) {
    assert.ok(!/https:\/\/www\.petrohrys\.com/.test(text),
      `${file} emits a www URL; production 301-redirects www to the apex`);
  }
});

test('every canonical is self-referential on the apex', () => {
  for (const { file, html } of ALL) {
    const canonical = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
    assert.ok(canonical, `${file} has no canonical`);
    assert.ok(canonical.startsWith('https://petrohrys.com/'), `${file} canonical is not on the apex: ${canonical}`);
    const expected = `https://petrohrys.com/${path.relative(ROOT, path.join(ROOT, file)).replace(/index\.html$/, '')}`;
    assert.equal(canonical, expected, `${file} canonical does not match its own URL`);
  }
});

test('sitemap and feed URLs resolve directly, without a host redirect', () => {
  const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap-business-directories.xml'), 'utf8');
  const feed = fs.readFileSync(path.join(SECTION, 'feed.xml'), 'utf8');
  const urls = [
    ...[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]),
    ...[...feed.matchAll(/<link>([^<]+)<\/link>/g)].map((m) => m[1]),
  ];
  assert.ok(urls.length > 0);
  for (const url of urls) {
    assert.ok(url.startsWith('https://petrohrys.com/'), `${url} is not on the apex`);
    // and it must correspond to a file we actually generated
    const rel = url.replace('https://petrohrys.com/', '');
    const asFile = path.join(ROOT, rel);
    assert.ok(fs.existsSync(asFile) || fs.existsSync(path.join(asFile, 'index.html')),
      `${url} does not map to a generated file`);
  }
});

test('robots.txt advertises the section sitemap on the apex', () => {
  const robots = fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8');
  assert.ok(robots.includes('Sitemap: https://petrohrys.com/sitemap-business-directories.xml'),
    'robots.txt must point at the apex sitemap URL');
  assert.ok(!/Sitemap:\s*https:\/\/www\./.test(robots), 'robots.txt still advertises a www sitemap');
});

test('no JSON-LD node carries a www URL', () => {
  for (const { file, html } of ALL) {
    for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
      const data = JSON.parse(m[1]);
      assert.ok(!/https:\/\/www\.petrohrys\.com/.test(JSON.stringify(data)), `${file} JSON-LD carries a www URL`);
    }
  }
});

// --- dual ranking: Domain Rating and PetroHrys Score --------------------------
// The two must stay independent. A blended number would let a high-authority
// domain launder a weak directory, and would make the editorial score
// unauditable.

const order = require('../../js/bd-order.js');

test('a Domain Rating never exists without provider, date and snapshot status', () => {
  for (const record of D) {
    if (record.domainRating === null || record.domainRating === undefined) continue;
    const p = (record.metricsProvenance || {}).domainRating;
    assert.ok(p, `${record.id} has a Domain Rating with no provenance`);
    assert.ok(S.METRIC_PROVIDERS.includes(p.provider), `${record.id} provider "${p.provider}" is not approved`);
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(p.measuredAt), `${record.id} measuredAt is not an ISO date`);
    assert.equal(p.status, S.METRIC_SNAPSHOT_STATUS, `${record.id} is not labelled a historical snapshot`);
    assert.ok(p.measuredDomain, `${record.id} does not record which domain was measured`);
    assert.ok(Number.isInteger(record.domainRating), `${record.id} Domain Rating is not an integer`);
    assert.ok(record.domainRating >= S.DOMAIN_RATING_RANGE.min
      && record.domainRating <= S.DOMAIN_RATING_RANGE.max, `${record.id} Domain Rating out of range`);
  }
});

test('an unmeasured Domain Rating is null, never 0', () => {
  for (const record of D) {
    assert.notEqual(record.domainRating, 0,
      `${record.id} stores 0 — an unmeasured metric must be null, not a floor value`);
  }
  // And the renderer must not print 0 for a null either.
  const html = c.metric(null, undefined, 'unknown');
  assert.ok(!/>0</.test(html), 'a null metric rendered as 0');
});

test('Domain Rating is not part of the PetroHrys Score arithmetic', () => {
  const factorKeys = S.SCORE_FACTORS.map((f) => f.key);
  assert.ok(!factorKeys.some((k) => /domain|rating|authority|ahrefs/i.test(k)),
    'a score factor is named after a third-party metric');
  for (const record of D) {
    if (!record.scoreFactors) continue;
    // Recompute from factors alone; the stored score must match without DR.
    assert.equal(S.computeScore(record.scoreFactors), record.petroHrysScore,
      `${record.id} score does not reproduce from its factors alone`);
    // Changing DR must not change the score.
    const moved = { ...record, domainRating: 1 };
    assert.equal(S.computeScore(moved.scoreFactors), record.petroHrysScore,
      `${record.id} score responds to Domain Rating`);
  }
});

test('DR sorting places nulls last and tiebreaks on score', () => {
  const sample = [
    { name: 'A', domainRating: 90, petroHrysScore: 70 },
    { name: 'B', domainRating: 90, petroHrysScore: 85 },
    { name: 'C', domainRating: null, petroHrysScore: 99 },
    { name: 'D', domainRating: 95, petroHrysScore: 50 },
  ];
  const byDr = order.sortRecords(sample.slice(), 'domain-rating').map((r) => r.name);
  assert.deepEqual(byDr, ['D', 'B', 'A', 'C'], 'DR desc, score tiebreak, null last');
  const byScore = order.sortRecords(sample.slice(), 'default').map((r) => r.name);
  assert.deepEqual(byScore, ['C', 'B', 'A', 'D'], 'score desc, DR tiebreak');
  // A null-DR record is ordered last, never dropped.
  assert.equal(order.sortRecords(sample.slice(), 'domain-rating').length, sample.length);
});

test('server and client ordering come from one implementation', () => {
  const sort = require('../lib/bd-sort.cjs');
  assert.equal(sort.SORTS, order.SORTS, 'the server must not hold its own comparator table');
  const sample = D.slice(0, 20);
  for (const key of order.SORT_KEYS) {
    assert.deepEqual(
      sort.sortDirectories(sample.slice(), key).map((r) => r.id),
      order.sortRecords(sample.slice(), key).map((r) => r.id),
      `server and client disagree on "${key}"`,
    );
  }
});

test('domain normalisation is deterministic and rejects nonsense', () => {
  const cases = [
    ['https://www.g2.com/', 'g2.com'],
    ['g2.com', 'g2.com'],
    ['HTTPS://G2.COM/products/x', 'g2.com'],
    ['https://appsource.microsoft.com/en-us/', 'appsource.microsoft.com'],
    ['wordpress.org/plugins/', 'wordpress.org'],
    ['not a domain', null],
    ['', null],
    [null, null],
    ['https://localhost', null],
  ];
  for (const [input, expected] of cases) {
    assert.equal(S.normaliseDomain(input), expected, `normaliseDomain(${JSON.stringify(input)})`);
    assert.equal(S.normaliseDomain(input), S.normaliseDomain(input), 'not deterministic');
  }
});

test('no two records share a measured domain without it being visible', () => {
  const seen = new Map();
  for (const record of D) {
    const domain = S.normaliseDomain(record.website);
    if (!domain) continue;
    if (seen.has(domain)) {
      // Allowed, but both must then carry the same measurement — one domain has
      // one rating, and showing two different numbers for it would be incoherent.
      const other = D.find((r) => r.id === seen.get(domain));
      assert.equal(record.domainRating, other.domainRating,
        `${record.id} and ${other.id} share ${domain} but report different Domain Ratings`);
    }
    seen.set(domain, record.id);
  }
});

test('every rendered Domain Rating names its provider and date', () => {
  for (const { file, html } of ALL) {
    for (const m of html.matchAll(/data-bd-label="Domain Rating">([\s\S]*?)<\/td>/g)) {
      const cell = m[1];
      if (/bd-metric--empty/.test(cell)) continue; // unmeasured, correctly neutral
      assert.ok(/Ahrefs snapshot, measured/.test(cell), `${file} shows a Domain Rating without provider`);
      assert.ok(/<time datetime="\d{4}-\d{2}-\d{2}"/.test(cell), `${file} shows a Domain Rating without a date`);
    }
  }
});

test('no page claims a Domain Rating brings ranking or SEO benefit', () => {
  const BANNED = [
    /domain rating[^.]{0,80}(improve|boost|increase)[^.]{0,40}rank/i,
    /domain rating[^.]{0,60}google (ranking|trust)/i,
    /petrohrys score[^.]{0,40}(domain authority|seo authority|backlink value)/i,
    // Only a positive claim. "does not guarantee ..." is the disclaimer we require.
    /(?<!not )(?<!never )guarantees?\s+(a\s+)?(dofollow|indexing|ranking improvement)/i,
  ];
  for (const { file, html } of ALL) {
    const text = textOf(html);
    for (const pattern of BANNED) {
      assert.ok(!pattern.test(text), `${file} makes an unsupported SEO claim: ${pattern}`);
    }
  }
});

test('the Ahrefs attribution appears wherever a Domain Rating is shown', () => {
  for (const { file, html } of ALL) {
    if (!/data-bd-label="Domain Rating"/.test(html)) continue;
    if (!/Ahrefs snapshot, measured/.test(html)) continue;
    // The literal is pinned, not read from the constant: asserting against the
    // same value the renderer uses would pass even if the constant were emptied.
    assert.equal(S.AHREFS_ATTRIBUTION.text, 'Domain Rating by Ahrefs');
    assert.equal(S.AHREFS_ATTRIBUTION.href, 'https://ahrefs.com/');
    assert.ok(html.includes('Domain Rating by Ahrefs'),
      `${file} displays a Domain Rating without the required Ahrefs attribution`);
    assert.ok(html.includes('https://ahrefs.com/'), `${file} attribution is not linked`);
  }
});

test('ranking views claim no quantity the dataset does not support', () => {
  const hub = ALL.find((p) => p.file === path.join('research', 'business-directories', 'index.html'));
  const text = textOf(hub.html);
  assert.ok(!/Top\s+\d+/.test(text), 'the hub claims a fixed "Top N"');
  const measured = D.filter((r) => r.domainRating !== null && r.domainRating !== undefined).length;
  assert.ok(text.includes(`${measured} of ${D.length} records carry a measurement`),
    'the authority view does not state how much of the dataset is measured');
});

test('the measurement utility never runs during a build', () => {
  const build = fs.readFileSync(path.join(ROOT, 'scripts', 'build-business-directories.cjs'), 'utf8');
  assert.ok(!/measure-business-directory-dr/.test(build), 'the build references the measurement utility');
  for (const lib of ['bd-seo.cjs', 'bd-components.cjs', 'bd-articles.cjs', 'bd-feeds.cjs', 'bd-render.cjs']) {
    const src = fs.readFileSync(path.join(ROOT, 'scripts', 'lib', lib), 'utf8');
    assert.ok(!/fetch\(|api\.ahrefs\.com/.test(src), `${lib} performs a network call during generation`);
  }
});

test('the measurement utility never stores or prints a credential', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'measure-business-directory-dr.cjs'), 'utf8');
  assert.ok(src.includes('AHREFS_API_KEY'), 'the key variable is not referenced');
  // The key may be read and sent, but never logged or written.
  // Reporting that a key is PRESENT is required; emitting its value is not.
  const emitsValue = /(console\.log|process\.(stdout|stderr)\.write)\([^)]*\$\{apiKey\}/;
  assert.ok(!emitsValue.test(src), 'the key value could be printed');
  assert.ok(!/writeFileSync\([^)]*apiKey/i.test(src), 'the key could be written to disk');
  assert.ok(!/apiKey[^;]{0,40}JSON\.stringify/.test(src), 'the key could be serialised');
  assert.ok(/apiKey \? 'present' : 'absent'/.test(src), 'presence should be reported without the value');
  // And no record may carry anything resembling one.
  for (const record of D) {
    assert.ok(!/AHREFS_API_KEY|Bearer /.test(JSON.stringify(record)), `${record.id} contains credential-like text`);
  }
});
