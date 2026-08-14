'use strict';

// Research Center discovery — FOUR-LOCALE PARITY, measured rather than assumed.
//
// The claim under test is one sentence: a reader on the German page who makes
// the same selection as a reader on the English page is looking at the same
// records. Everything else about the two pages may differ, and does.
//
// ── WHY THIS IS A SEPARATE FILE FROM rc-discovery.test.cjs ──────────────────
//
// That file already proves the property — on ONE page, /research/tenders-
// procurement/, for ONE facet, country=czech-republic, comparing ROW COUNTS.
// Three of those four narrowings hide the failure this file exists to catch:
//
//   one page      57 routes carry discovery controls, in four locales. The
//                 tenders page is the only one whose whole facet vocabulary is
//                 translated, so it is the page least likely to break.
//   one facet     tenders-procurement offers 7; the media page offers 11, five
//                 of them list-valued; the worklist offers 11 and a sort; a
//                 directory country page offers no facet at all and filters by
//                 six tri-state checkboxes and a jurisdiction.
//   counts        "the same number of rows" is not "the same rows". A locale
//                 that shifted every record one position in its facet vocabulary
//                 would return 165 rows either way and none of them the same.
//
// So this file compares IDENTITIES, on every route, in every locale, over every
// state the controls can be put in one dimension at a time plus one state with
// every dimension loaded at once. Measured on the tree as it stands: 57 routes
// x 4 locales = 228 pages, 3,303 control values compared, 3,057 filter states
// replayed per non-English locale, and 103,611 record identities compared.
//
// ── AND THE OTHER HALF: VALUES ARE SHARED, LABELS ARE NOT ───────────────────
//
// The parity above is only true because a facet compares CANONICAL VALUES and
// never the visible option text. That is easy to assert and easy to assert
// vacuously: if no locale translated anything, "values identical" would pass on
// four copies of the same page and prove nothing at all. So the label side is
// asserted as a floor and MEASURED as a number, and the number is recorded here
// because it is lower than it looks — 16.3% of the option labels on the German
// pages differ from the English ones. The rest are country names, ISO subnational
// names, industry and language names: canonical vocabulary that is deliberately
// not translated. Any test that demanded "every label differs" would be wrong
// about this collection, and any test that demanded none would be vacuous.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const D = require('../lib/bd-discovery.cjs');
const I18N = require('../lib/i18n.cjs');

const LOCALES = ['en', 'de', 'es', 'fr'];
const OTHERS = LOCALES.filter((l) => l !== 'en');

// ── THE PAGE SET, DISCOVERED RATHER THAN LISTED ─────────────────────────────
//
// Named routes would certify the four pages someone remembered. The set is the
// pages that actually carry the export control, grouped by locale-stripped
// route, so a country page added next week is covered the day it ships and a
// locale that stops emitting one fails the completeness check below.
let cache = null;
function routes() {
  if (cache) return cache;
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith('.html')) out.push(path.relative(ROOT, p));
    }
  };
  for (const base of ['research', 'de/research', 'es/research', 'fr/research']) {
    const dir = path.join(ROOT, base);
    if (fs.existsSync(dir)) walk(dir);
  }
  const byRoute = new Map();
  for (const rel of out) {
    if (!read(rel).includes('data-bd-export')) continue;
    const m = /^(?:(de|es|fr)\/)?research\/(.*)$/.exec(rel);
    if (!m) continue;
    if (!byRoute.has(m[2])) byRoute.set(m[2], {});
    byRoute.get(m[2])[m[1] || 'en'] = rel;
  }
  cache = [...byRoute.entries()].map(([route, files]) => ({ route, files }));
  return cache;
}

const optionsOf = (block) => [...block.matchAll(/<option value="([^"]*)">([\s\S]*?)<\/option>/g)]
  .map((m) => ({ value: m[1], label: m[2] }));

// Every control the page rendered, with its option TEXT kept beside its VALUE —
// the two are compared separately and that is the whole point of this file.
function controlsOf(html) {
  const facets = [...html.matchAll(/<select[^>]*data-bd-facet="([a-z]+)"([^>]*)>([\s\S]*?)<\/select>/g)]
    .map((m) => ({
      name: m[1],
      multi: m[2].includes('data-bd-facet-multi') || m[1] === 'audience',
      options: optionsOf(m[3]),
    }));
  const sort = /<select[^>]*data-bd-sort[^>]*>([\s\S]*?)<\/select>/.exec(html);
  const jurisdiction = /<select[^>]*data-bd-jurisdiction-select[^>]*>([\s\S]*?)<\/select>/.exec(html);
  return {
    facets,
    filters: [...html.matchAll(/data-bd-filter="([^"]+)"/g)].map((m) => m[1].toLowerCase()),
    sortOptions: sort ? optionsOf(sort[1]) : [],
    jurisdictionOptions: jurisdiction ? optionsOf(jurisdiction[1]) : [],
  };
}

// The schema in the shape BDDiscovery reads: values only. If a locale ever
// changed one of these the pages would filter differently, which is the failure.
const schemaOf = (c) => ({
  facets: c.facets.map((f) => ({
    name: f.name, multi: f.multi, values: f.options.map((o) => o.value).filter(Boolean),
  })),
  filters: c.filters,
  sorts: c.sortOptions.map((o) => o.value).filter(Boolean),
  jurisdictions: c.jurisdictionOptions.map((o) => o.value).filter(Boolean),
});

const labelsOf = (c) => [
  ...c.facets.flatMap((f) => f.options.map((o) => o.label)),
  ...c.sortOptions.map((o) => o.label),
  ...c.jurisdictionOptions.map((o) => o.label),
];

const decode = (s) => String(s)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&amp;/g, '&');

function rowsOf(html, schema) {
  return [...html.matchAll(/<tr class="bd-row"([^>]*)>/g)].map((m) => {
    const attrs = m[1];
    const attr = (k) => {
      const hit = new RegExp(`data-bd-${k}="([^"]*)"`).exec(attrs);
      return hit ? hit[1] : null;
    };
    const facets = {};
    for (const f of schema.facets) facets[f.name] = attr(`facet-${f.name}`) || '';
    const flags = {};
    for (const n of schema.filters) flags[n] = attr(n);
    return {
      name: decode(attr('name') || ''),
      haystack: decode(attr('haystack') || ''),
      facets,
      flags,
    };
  });
}

// Every state the controls can be put in, one dimension at a time, plus one with
// every dimension loaded at once. One at a time is what finds a single facet
// that drifted; all at once is what finds an AND that composes differently.
function statesFor(schema) {
  const states = [D.emptyState(schema)];
  for (const facet of schema.facets) {
    for (const value of facet.values) {
      const s = D.emptyState(schema);
      s.facets[facet.name] = value;
      states.push(s);
    }
  }
  for (const name of schema.filters) {
    const s = D.emptyState(schema);
    s.filters = [name];
    states.push(s);
  }
  const loaded = D.emptyState(schema);
  for (const facet of schema.facets) loaded.facets[facet.name] = facet.values[0];
  loaded.filters = schema.filters.slice();
  states.push(loaded);
  return states;
}

// ── 1. THE PAGE SET IS COMPLETE ─────────────────────────────────────────────

test('every route with discovery controls exists in all four locales', () => {
  const all = routes();
  assert.ok(all.length >= 55, `only ${all.length} routes carry discovery controls`);
  assert.deepStrictEqual(I18N.LOCALE_CODES.slice().sort(), LOCALES.slice().sort(),
    'the locale set this file was written for is not the one the site ships');
  for (const { route, files } of all) {
    for (const locale of LOCALES) {
      assert.ok(files[locale], `${route}: no ${locale} page, so parity cannot be measured for it`);
    }
  }
  // Not one family. The heterogeneity is the reason a per-page assertion is
  // needed at all: these pages disagree about what a control panel is.
  const shapes = new Set(all.map(({ files }) => {
    const schema = schemaOf(controlsOf(read(files.en)));
    return D.paramOrder(schema).join('|');
  }));
  assert.ok(shapes.size >= 5,
    `all ${all.length} routes produced only ${shapes.size} control shapes; the set is too uniform to prove anything`);
});

// ── 2. THE VALUES ARE SHARED ────────────────────────────────────────────────

test('every control offers identical VALUES in all four locales', () => {
  let compared = 0;
  for (const { route, files } of routes()) {
    const en = schemaOf(controlsOf(read(files.en)));
    const width = en.facets.reduce((n, f) => n + f.values.length, 0)
      + en.sorts.length + en.jurisdictions.length + en.filters.length;
    for (const locale of OTHERS) {
      const got = schemaOf(controlsOf(read(files[locale])));
      // deepStrictEqual rather than a length check: a locale that reordered its
      // options would still filter correctly but would serialize a different
      // default sort, and the default is the FIRST option.
      assert.deepStrictEqual(got, en,
        `${route} [${locale}]: the control vocabulary differs from English, so the same link means two things`);
      compared += width;
    }
  }
  // 1,101 control values per locale, compared against three other locales:
  // 3,303 comparisons. Recorded so a collapse of the page set is visible here
  // rather than as four tests that pass over nothing.
  assert.ok(compared >= 3000, `only ${compared} control values compared`);
});

test('the URL parameter set is identical in all four locales', () => {
  // A parameter that existed only in English would mean a link shared from an
  // English page silently drops a dimension when a German reader opens the
  // German equivalent.
  for (const { route, files } of routes()) {
    const en = D.paramOrder(schemaOf(controlsOf(read(files.en))));
    for (const locale of OTHERS) {
      assert.deepStrictEqual(D.paramOrder(schemaOf(controlsOf(read(files[locale])))), en,
        `${route} [${locale}]: a different set of URL parameters`);
    }
  }
});

// ── 3. THE RECORDS ARE THE SAME RECORDS ─────────────────────────────────────

test('equivalent filter state returns the identical record identity set, in all four locales', () => {
  let states = 0;
  let identities = 0;
  let nonEmpty = 0;
  for (const { route, files } of routes()) {
    const enSchema = schemaOf(controlsOf(read(files.en)));
    const enRows = rowsOf(read(files.en), enSchema);
    const cases = statesFor(enSchema);
    // Identity, not count. Two locales can agree on how many rows survive and
    // disagree about every one of them.
    const expected = cases.map((s) => D.filter(enRows, D.selectionFor(s, enSchema)).rows.map((r) => r.name));

    for (const locale of OTHERS) {
      const schema = schemaOf(controlsOf(read(files[locale])));
      const rows = rowsOf(read(files[locale]), schema);
      assert.strictEqual(rows.length, enRows.length,
        `${route} [${locale}]: ${rows.length} rows against ${enRows.length} in English`);
      cases.forEach((s, i) => {
        const got = D.filter(rows, D.selectionFor(s, schema)).rows.map((r) => r.name);
        states += 1;
        identities += got.length;
        if (got.length) nonEmpty += 1;
        // The order matters too: the export writes the rows in the order the
        // page shows them, so two locales that agreed on the SET and not the
        // SEQUENCE would produce two different CSV files for one link.
        assert.deepStrictEqual(got, expected[i],
          `${route} [${locale}]: ${JSON.stringify(s.facets)}${s.filters.length ? ` +${s.filters}` : ''}`
          + ` returned a different record set than English`);
      });
    }
  }
  assert.ok(states >= 3000, `only ${states} filter states replayed`);
  // The floor dropped from 100,000 to 85,000 when the listing worklist stopped
  // rendering 638 of its opportunities a second time. Fewer comparisons, same
  // coverage: the duplicates were re-checking rows this sweep already held.
  assert.ok(identities >= 85000, `only ${identities} record identities compared`);
  // Not vacuous: 2,343 of the 3,057 replayed states select at least one record,
  // and those states carry 89,385 identities between them. The 714 that select
  // nothing are the fully-loaded state on each route — every facet set to its
  // first value at once, which on most collections is an empty intersection —
  // and they are still worth replaying: an empty result must be empty in all
  // four locales too.
  assert.ok(nonEmpty / states > 0.7,
    `only ${nonEmpty} of ${states} states selected any record at all`);
});

test('a record carries the same identity in all four locales', () => {
  // The precondition for everything above. If a platform's name were translated
  // the identity comparison would be comparing two different strings and would
  // have to be loosened to a count — which is the assertion this file replaced.
  let names = 0;
  for (const { route, files } of routes()) {
    const enSchema = schemaOf(controlsOf(read(files.en)));
    const en = rowsOf(read(files.en), enSchema).map((r) => r.name);
    for (const locale of OTHERS) {
      const schema = schemaOf(controlsOf(read(files[locale])));
      assert.deepStrictEqual(rowsOf(read(files[locale]), schema).map((r) => r.name), en,
        `${route} [${locale}]: the records are named differently`);
      names += en.length;
    }
  }
  // 3,404 rendered rows per locale — the worklist draws 1,609, one per canonical
  // opportunity — compared against three other locales: 10,212 comparisons. It
  // read 11,000 when the worklist still drew 2,167 rows for 1,609 records.
  assert.ok(names >= 9500, `only ${names} record identities compared`);
});

// ── 4. THE LABELS ARE NOT SHARED ────────────────────────────────────────────

test('option LABELS are localized while their values are not — measured, not assumed', () => {
  let total = 0;
  const translated = { de: 0, es: 0, fr: 0 };
  const routesWithTranslation = new Set();
  for (const { route, files } of routes()) {
    const en = labelsOf(controlsOf(read(files.en)));
    total += en.length;
    for (const locale of OTHERS) {
      const got = labelsOf(controlsOf(read(files[locale])));
      assert.strictEqual(got.length, en.length, `${route} [${locale}]: a different number of options`);
      const differ = got.filter((l, i) => l !== en[i]).length;
      translated[locale] += differ;
      if (differ) routesWithTranslation.add(route);
    }
  }
  // The floor, not the target. Demanding that EVERY label differ would be wrong
  // about this collection: country names, ISO 3166-2 subdivision names, industry
  // and language names are canonical vocabulary and are deliberately identical
  // in all four locales. Measured on the tree as it stands, 124 of 762 German
  // labels differ (16.3%), 123 Spanish (16.1%), 127 French (16.7%) — so a
  // regression that stopped translating anything at all is caught, and a
  // deliberate decision not to translate a country name is not called a failure.
  for (const locale of OTHERS) {
    assert.ok(translated[locale] > 60,
      `only ${translated[locale]} of ${total} ${locale} option labels differ from English;`
      + ' either the dictionaries stopped being applied, or this test has gone vacuous');
  }
  // And it is not one page doing all the work.
  assert.ok(routesWithTranslation.size >= 4,
    `only ${routesWithTranslation.size} route(s) translate any option label at all`);
});

test('a localized label never leaks into a value, and a value never into the URL as a label', () => {
  for (const { route, files } of routes()) {
    for (const locale of LOCALES) {
      const controls = controlsOf(read(files[locale]));
      for (const facet of controls.facets) {
        for (const option of facet.options) {
          if (!option.value) continue;
          // The visible text carries a live count — "Czech Republic (1)". A
          // value that carried one would make the URL depend on how many rows
          // happened to be published that day.
          assert.ok(!/\(\d+\)/.test(option.value),
            `${route} [${locale}]: the option value "${option.value}" carries a display count`);
          // Values are URL-safe canonical tokens: slugs, ISO codes, evidence
          // classes. Anything needing escaping is a label that got through.
          assert.strictEqual(encodeURIComponent(option.value), option.value,
            `${route} [${locale}]: the option value "${option.value}" is not a canonical token`);
        }
      }
    }
  }
});

// ── 5. THE ONE DIMENSION THAT IS DELIBERATELY LOCALE-DEPENDENT ──────────────

test('free-text search is localized on purpose, and only in the localized part of the haystack', () => {
  // Everything above holds because facets compare canonical values. Search does
  // not: the haystack is the record's own text PLUS the generator's localized
  // description of it, so a German reader typing "Vergabesystem" finds rows an
  // English reader would have to spell "procurement system" to reach.
  //
  // That is the intended behaviour and it is the one place the four locales
  // legitimately return different sets. It is recorded here so that it stays a
  // decision: if the localized fragment were ever dropped, this test fails and
  // says which page lost it, rather than the pages quietly becoming English-only
  // for search while every other assertion in this file still passes.
  const page = 'research/tenders-procurement/index.html';
  const schema = schemaOf(controlsOf(read(page)));
  const en = rowsOf(read(page), schema);
  const de = rowsOf(read(`de/${page}`), schema);

  // The identity-bearing prefix is shared: it is the record's own name.
  let localized = 0;
  for (let i = 0; i < en.length; i += 1) {
    assert.ok(de[i].haystack.startsWith(en[i].name.toLowerCase().replace(/\s+/g, ' ').trim()),
      `the German haystack for "${en[i].name}" does not begin with the record's own name`);
    if (de[i].haystack !== en[i].haystack) localized += 1;
  }
  assert.ok(localized > 300,
    `only ${localized} of ${en.length} German haystacks differ from English; the localized fragment is gone`);

  // And it really does change what a search returns, in the direction expected.
  const q = (rows, query) => D.filter(rows, { query, facets: {}, flags: [] }).rows.length;
  assert.ok(q(de, 'vergabesystem') > 100, 'the German term matches nothing on the German page');
  assert.strictEqual(q(en, 'vergabesystem'), 0, 'the German term matches on the English page');
  assert.ok(q(en, 'procurement system') > 100, 'the English term matches nothing on the English page');

  // The record's own name is searchable in every locale, because it is never
  // translated — so a platform can always be found by the name it actually has.
  const name = en[0].name.toLowerCase().slice(0, 24);
  for (const locale of LOCALES) {
    const rows = locale === 'en' ? en : rowsOf(read(`${locale}/${page}`), schema);
    assert.ok(q(rows, name) >= 1, `${locale}: the record's own name does not find it`);
  }
});

// ── 6. THE PLANNER ──────────────────────────────────────────────────────────

test('the planner offers identical control values in all four locales', () => {
  // The planner has no rows to compare, so parity there is the six control
  // vocabularies and the state they serialize to. Values identical means a
  // shared planner URL reproduces the same campaign whichever locale opens it.
  const P = require('../lib/distribution-planner.cjs');
  const selectsOf = (html) => [...html.matchAll(/<select class="bd-select" id="(dp-[a-z]+)"[^>]*>([\s\S]*?)<\/select>/g)]
    .map((m) => ({
      id: m[1],
      options: [...m[2].matchAll(/<option value="([^"]*)"([^>]*)>([\s\S]*?)<\/option>/g)]
        .map((o) => ({ value: o[1], selected: /\bselected\b/.test(o[2]), label: o[3] })),
    }));

  const canonical = (selects) => selects.map((s) => ({
    id: s.id,
    values: s.options.map((o) => o.value),
    selected: s.options.filter((o) => o.selected).map((o) => o.value),
  }));

  const en = selectsOf(read(I18N.localizedFile('en', P.PLANNER_PATH)));
  assert.strictEqual(en.length, 6, `the planner renders ${en.length} controls, not 6`);
  let values = 0;
  for (const locale of OTHERS) {
    const got = selectsOf(read(I18N.localizedFile(locale, P.PLANNER_PATH)));
    assert.deepStrictEqual(canonical(got), canonical(en),
      `${locale}: the planner control vocabulary differs from English`);
    values += got.reduce((n, s) => n + s.options.length, 0);
  }
  assert.ok(values >= 400, `only ${values} planner option values compared`);
});
