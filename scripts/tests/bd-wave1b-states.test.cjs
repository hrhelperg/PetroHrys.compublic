// scripts/tests/bd-wave1b-states.test.cjs
'use strict';

// Cover for the US state, district and territory layer, and for the first
// genuinely grouped country page. The DOM tests here run the real client
// against the REAL generated United States page rather than a fixture, because
// this is the page the grouping model was built for.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const S = require('../lib/bd-schema.cjs');
const T = require('../lib/bd-registry-types.cjs');
const c = require('../lib/bd-components.cjs');
const order = require('../../js/bd-order.js');
const { validateRegistry } = require('../validate-business-directories.cjs');
const { loadRegistry } = require('../lib/bd-registry.cjs');
const { createDocument } = require('./helpers/mini-dom.cjs');
const { verifiedRecord } = require('./helpers/fixtures.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const REGISTRY = loadRegistry();
const okOf = (dirs) => validateRegistry({ ...REGISTRY, directories: dirs });
const reasons = (r) => r.errors.map((e) => `${e.field}: ${e.reason}`).join(' | ');

const US = REGISTRY.directories.filter((r) => r.country === 'united-states');
const SUBNATIONAL = US.filter((r) => r.jurisdiction);
const STATES = SUBNATIONAL.filter((r) => r.jurisdiction.type === 'state');
const TERRITORIES = SUBNATIONAL.filter((r) => r.jurisdiction.type === 'territory');
const DISTRICT = SUBNATIONAL.filter((r) => r.jurisdiction.type === 'federal-district');

const US_PAGE = fs.readFileSync(
  path.join(ROOT, 'research', 'business-directories', 'united-states', 'index.html'), 'utf8');
const CLIENT = fs.readFileSync(path.join(ROOT, 'js', 'business-directories.js'), 'utf8');

function boot(html, clientSource = CLIENT) {
  const document = createDocument(html);
  vm.runInContext(clientSource, vm.createContext({ document, BDOrder: order, window: {} }));
  const rows = document.querySelectorAll('.bd-row');
  return {
    document,
    rows,
    bodies: document.querySelectorAll('[data-bd-rows]'),
    boxes: document.querySelectorAll('.bd-jgroup'),
    status: document.querySelector('.bd-status'),
    search: document.querySelector('[data-bd-search]'),
    sort: document.querySelector('[data-bd-sort]'),
    filters: document.querySelectorAll('[data-bd-filter]'),
    visible: () => rows.filter((r) => !r.hidden).map((r) => r.getAttribute('data-bd-name')),
  };
}

// --- coverage and shape ---------------------------------------------------------

test('the wave produced a substantial subnational layer', () => {
  assert.ok(STATES.length >= 30, `only ${STATES.length} state records: the guards would be thin`);
  assert.ok(DISTRICT.length === 1, `expected one federal district record, got ${DISTRICT.length}`);
  assert.ok(TERRITORIES.length >= 1, 'no territory record');
  assert.ok(US.length > SUBNATIONAL.length, 'no federal records remain to contrast with');
});

test('every state code is unique, well formed and prefixed US-', () => {
  const codes = STATES.map((r) => r.jurisdiction.code);
  assert.strictEqual(new Set(codes).size, codes.length,
    `duplicate state code: ${codes.filter((x, i) => codes.indexOf(x) !== i)}`);
  for (const r of SUBNATIONAL) {
    const code = r.jurisdiction.code;
    assert.strictEqual(S.iso3166_2Problem(code), null, `${r.id} has malformed code ${code}`);
    assert.ok(code.startsWith('US-'), `${r.id} code ${code} is not a US subdivision`);
  }
});

test('one jurisdiction code names exactly one place across the whole dataset', () => {
  const byCode = new Map();
  for (const r of SUBNATIONAL) {
    const { code, name } = r.jurisdiction;
    if (byCode.has(code)) {
      assert.strictEqual(byCode.get(code), name, `${code} is used for two different names`);
    } else byCode.set(code, name);
  }
  assert.ok(byCode.size >= 30, 'too few distinct jurisdictions to prove anything');
});

test('every subnational record is scope subnational with the right parent', () => {
  for (const r of SUBNATIONAL) {
    assert.strictEqual(r.scope, 'subnational', `${r.id} is scope ${r.scope}`);
    assert.strictEqual(r.jurisdiction.parentCountry, 'united-states', `${r.id} has the wrong parent`);
    assert.strictEqual(r.country, 'united-states');
  }
});

test('every state record carries an operator, a registry type and no Domain Rating', () => {
  for (const r of SUBNATIONAL) {
    assert.ok(r.operator && r.operator.name.trim(), `${r.id} has no operator`);
    assert.ok(S.OPERATOR_TYPES.includes(r.operator.type), `${r.id} operator type invalid`);
    assert.ok(r.registryTypes.length > 0, `${r.id} has no registry type`);
    for (const t of r.registryTypes) {
      assert.ok(T.REGISTRY_TYPE_BY_ID.has(t), `${r.id} uses undefined type "${t}"`);
    }
    assert.strictEqual(r.domainRating, null, `${r.id} carries a Domain Rating`);
    assert.strictEqual(r.submissionModel, 'notApplicable', `${r.id} is not notApplicable`);
    assert.strictEqual(S.computeScore(r.scoreFactors), r.petroHrysScore, `${r.id} score mismatch`);
    assert.deepStrictEqual(S.accessContradictions(r.publicAccess), [], `${r.id} access contradiction`);
  }
});

test('state editorial content is not templated', () => {
  const descs = SUBNATIONAL.map((r) => r.description);
  assert.strictEqual(new Set(descs).size, descs.length, 'two state descriptions are identical');
  // A description that differs only by the jurisdiction name is still a template.
  const stripped = SUBNATIONAL.map((r) => r.description
    .split(r.jurisdiction.name).join('X')
    .split(r.operator.name).join('Y')
    .split(r.name).join('Z'));
  assert.strictEqual(new Set(stripped).size, stripped.length,
    'two descriptions are identical once the names are removed — they are templated');
  // Pros must carry jurisdiction-specific facts, not one shared sentence.
  const allPros = SUBNATIONAL.flatMap((r) => r.pros);
  assert.ok(new Set(allPros).size > allPros.length * 0.8,
    'more than a fifth of state pros are shared verbatim');
});

// --- grouping model -------------------------------------------------------------

test('the US page groups Federal, States, Federal district, Territories in that order', () => {
  const groups = c.jurisdictionGroups(US, 'united-states');
  const labels = groups.map((g) => g.label);
  const expected = ['Federal', 'States', 'Federal district', 'Territories'];
  for (let i = 1; i < expected.length; i += 1) {
    assert.ok(labels.indexOf(expected[i - 1]) < labels.indexOf(expected[i]),
      `${expected[i - 1]} does not precede ${expected[i]} — got ${labels.join(' > ')}`);
  }
});

test('states render alphabetically by jurisdiction name', () => {
  const groups = c.jurisdictionGroups(US, 'united-states');
  const names = groups.find((g) => g.key === 'state').items.map((r) => r.jurisdiction.name);
  assert.deepStrictEqual(names, [...names].sort(), 'states are not in A-Z order');
  assert.ok(names.length >= 30);
});

test('a territory is never placed in the States group', () => {
  const groups = c.jurisdictionGroups(US, 'united-states');
  const stateGroup = groups.find((g) => g.key === 'state');
  for (const r of stateGroup.items) {
    assert.strictEqual(r.jurisdiction.type, 'state',
      `${r.id} is a ${r.jurisdiction.type} but sits in the States group`);
  }
  const terr = groups.find((g) => g.key === 'territory');
  assert.ok(terr, 'no Territories group rendered');
  for (const r of terr.items) assert.strictEqual(r.jurisdiction.type, 'territory');
});

test('a non-federal record with no jurisdiction is not labelled Federal', () => {
  const groups = c.jurisdictionGroups(US, 'united-states');
  const federal = groups.find((g) => g.key === 'national');
  for (const r of federal.items) {
    assert.strictEqual(r.scope, 'national',
      `${r.id} has scope ${r.scope} but renders under the Federal heading`);
  }
});

test('two registries in one state are allowed', () => {
  const state = STATES[0].jurisdiction;
  const second = verifiedRecord({
    id: 'wb-second', slug: 'wb-second', country: 'united-states',
    website: 'https://second.example.gov/', scope: 'subnational',
    jurisdiction: { ...state },
  });
  // The whole registry, not just the US slice: relations resolve across files.
  const res = okOf([...REGISTRY.directories, second]);
  assert.strictEqual(res.ok, true, `a second registry in one state was rejected: ${reasons(res)}`);
});

// --- fault injection --------------------------------------------------------------

test('FAULT: a duplicated jurisdiction code with a conflicting name is rejected', () => {
  const clash = verifiedRecord({
    id: 'wb-clash', slug: 'wb-clash', country: 'united-states',
    website: 'https://clash.example.gov/', scope: 'subnational',
    jurisdiction: { type: 'state', name: 'Kalifornia', code: 'US-CA', parentCountry: 'united-states' },
  });
  const california = verifiedRecord({
    id: 'wb-ca', slug: 'wb-ca', country: 'united-states',
    website: 'https://ca.example.gov/', scope: 'subnational',
    jurisdiction: { type: 'state', name: 'California', code: 'US-CA', parentCountry: 'united-states' },
  });
  const res = okOf([california, clash]);
  assert.strictEqual(res.ok, false, 'two names for US-CA were accepted');
  assert.match(reasons(res), /cannot have two names/);
});

test('FAULT: a wrong country prefix on a state code is rejected', () => {
  const res = okOf([verifiedRecord({
    id: 'wb-prefix', slug: 'wb-prefix', country: 'united-states',
    website: 'https://prefix.example.gov/', scope: 'subnational',
    jurisdiction: { type: 'state', name: 'Ontario', code: 'CA-ON', parentCountry: 'united-states' },
  })]);
  assert.strictEqual(res.ok, false, 'a Canadian code on a US record was accepted');
  assert.match(reasons(res), /has prefix "CA" but United States is "US"/);
});

test('FAULT: a state record with national scope is rejected', () => {
  const res = okOf([verifiedRecord({
    id: 'wb-scope', slug: 'wb-scope', country: 'united-states',
    website: 'https://scope.example.gov/', scope: 'national',
    jurisdiction: { type: 'state', name: 'Ohio', code: 'US-OH', parentCountry: 'united-states' },
  })]);
  assert.strictEqual(res.ok, false, 'a jurisdiction with national scope was accepted');
  assert.match(reasons(res), /must use scope "subnational"/);
});

test('FAULT: a subnational record with no jurisdiction is rejected', () => {
  const res = okOf([verifiedRecord({
    id: 'wb-nojur', slug: 'wb-nojur', country: 'united-states',
    website: 'https://nojur.example.gov/', scope: 'subnational', jurisdiction: null,
  })]);
  assert.strictEqual(res.ok, false, 'subnational with no jurisdiction was accepted');
  assert.match(reasons(res), /requires a jurisdiction object/);
});

test('FAULT: a malformed operator is rejected', () => {
  const res = okOf([verifiedRecord({
    id: 'wb-op', slug: 'wb-op', country: 'united-states', website: 'https://op.example.gov/',
    operator: { name: '', type: 'government-agency', officialUrl: null },
  })]);
  assert.strictEqual(res.ok, false, 'an unnamed operator was accepted');
  assert.match(reasons(res), /operator.name/);
});

test('FAULT: a territory type the country does not declare is rejected', () => {
  const res = okOf([verifiedRecord({
    id: 'wb-pref', slug: 'wb-pref', country: 'united-states', website: 'https://pref.example.gov/',
    scope: 'subnational',
    jurisdiction: { type: 'prefecture', name: 'Osaka', code: null, parentCountry: 'united-states' },
  })]);
  assert.strictEqual(res.ok, false, 'a prefecture in the United States was accepted');
  assert.match(reasons(res), /declares no grouping label for "prefecture"/);
});

// --- the real grouped page, driven by the real client -------------------------------

test('the generated US page is grouped and complete without JavaScript', () => {
  const document = createDocument(US_PAGE);
  const rows = document.querySelectorAll('.bd-row');
  assert.strictEqual(rows.length, US.length, `page shows ${rows.length} of ${US.length} records`);
  assert.ok(rows.every((r) => !r.hidden), 'a row is hidden in the server markup');
  assert.ok(document.querySelectorAll('[data-bd-rows]').length >= 4, 'the page is not grouped');
  assert.strictEqual(document.querySelector('.bd-status'), null,
    'the status region should be created by the script, not prerendered');
});

test('search reaches every group on the real page', () => {
  const page = boot(US_PAGE);
  assert.ok(page.bodies.length >= 4, 'the real page is not grouped; the test is vacuous');
  // A term that exists only in the last group.
  page.search.value = 'virgin islands';
  page.search.dispatch('input');
  const hits = page.rows.filter((r) => !r.hidden);
  assert.ok(hits.length >= 1, 'search did not reach the Territories group');
  // The haystack legitimately includes the description, so a match need not be
  // in the visible name. What matters is that every hit really does contain the
  // term somewhere searchable, and that the last group was reached at all.
  for (const r of hits) {
    assert.match(r.getAttribute('data-bd-haystack'), /virgin islands/i,
      'a row matched without containing the term');
  }
  // The Territories group sits fourth, not last — "Other nationwide listings"
  // follows it. Name the group we mean rather than assuming a position, and
  // prove the search left the first group behind: filtering only bodies[0] was
  // a real bug once, and this is the assertion that would catch its return.
  const terrBox = page.boxes.find((b) => /Territories/.test(b.querySelector('.bd-jgroup-title').textContent));
  assert.ok(terrBox, 'no Territories group on the page');
  assert.ok(terrBox.querySelectorAll('.bd-row').some((r) => !r.hidden),
    'no row survived in the Territories group, so search never reached past the first table');
  const federalBox = page.boxes[0];
  assert.ok(federalBox.querySelectorAll('.bd-row').every((r) => r.hidden),
    'a federal row survived a search for "virgin islands" — the first group is not being filtered');
  // Every group must have been *processed*, not merely present. A client that
  // filtered only the first tbody would leave later groups fully visible, which
  // looks like "reached" if you only check for survivors. Each group therefore
  // has to contain at least one row this search hid.
  for (const box of page.boxes) {
    const title = box.querySelector('.bd-jgroup-title').textContent.trim();
    assert.ok(box.querySelectorAll('.bd-row').some((r) => r.hidden),
      `no row was hidden in the "${title}" group — that table was never filtered`);
  }
});

test('the status count spans every group on the real page', () => {
  const page = boot(US_PAGE);
  assert.match(page.status.textContent, new RegExp(`${US.length} directories shown`),
    `count does not cover the page: "${page.status.textContent}"`);
});

test('a filter applies across every group on the real page', () => {
  const page = boot(US_PAGE);
  const f = page.filters.find((x) => x.getAttribute('data-bd-filter') === 'accepts-startup');
  assert.ok(f, 'the startup filter is not present');
  f.checked = true;
  f.dispatch('change');
  const shown = page.visible().length;
  assert.ok(shown > 0 && shown < US.length, `filter matched ${shown} of ${US.length}`);
  // Rows survived in more than one group.
  const groupsWithRows = page.bodies.filter(
    (b) => b.querySelectorAll('.bd-row').some((r) => !r.hidden)).length;
  assert.ok(groupsWithRows >= 2, 'the filter only kept rows in a single group');
});

test('sorting the real page never moves a row between groups', () => {
  const page = boot(US_PAGE);
  const before = page.bodies.map((b) => b.querySelectorAll('.bd-row').length);
  page.sort.value = 'alphabetical';
  page.sort.dispatch('change');
  const after = page.bodies.map((b) => b.querySelectorAll('.bd-row').length);
  assert.deepStrictEqual(after, before, 'sorting moved rows between groups');
});

test('every row on the real page keeps its mobile column labels', () => {
  const page = boot(US_PAGE);
  for (const row of page.rows) {
    assert.ok(row.querySelectorAll('[data-bd-label]').length >= 2,
      `a row lost its mobile labels: ${row.getAttribute('data-bd-name')}`);
  }
});

test('FAULT: first-tbody-only binding breaks the real page', () => {
  const broken = CLIENT.replace(
    /var groups = bodies\.map\(function \(body\) \{[\s\S]*?\}\)\.filter\(function \(g\) \{ return g\.records\.length > 0; \}\);/,
    'var groups = [{ body: bodies[0], box: groupBoxOf(bodies[0]), '
    + 'records: Array.prototype.slice.call(bodies[0].querySelectorAll(".bd-row")).map(recordOf) }];',
  );
  assert.notStrictEqual(broken, CLIENT, 'the mutation did not apply; the probe is vacuous');
  const page = boot(US_PAGE, broken);
  assert.ok(!new RegExp(`${US.length} directories shown`).test(page.status.textContent),
    'first-tbody-only binding still produced a page-wide count');
});

test('FAULT: group-destructive sorting breaks the real page', () => {
  const broken = CLIENT.replace(
    /    groups\.forEach\(function \(g\) \{\n      order\.sortRecords\(g\.records, key\)\.forEach\(function \(record\) \{\n        g\.body\.appendChild\(record\.row\);\n      \}\);\n    \}\);/,
    '    order.sortRecords(records, key).forEach(function (record) {\n'
    + '      groups[0].body.appendChild(record.row);\n    });',
  );
  assert.notStrictEqual(broken, CLIENT, 'the mutation did not apply; the probe is vacuous');
  const page = boot(US_PAGE, broken);
  const perBody = page.bodies.map((b) => b.querySelectorAll('.bd-row').length);
  assert.ok(perBody.filter((n) => n > 0).length === 1,
    'group-destructive sorting did not collapse the groups, so the probe proves nothing');
});

test('FAULT: caller-order destruction is visible in a rendered group', () => {
  const items = c.jurisdictionGroups(US, 'united-states').find((g) => g.key === 'state').items;
  const seq = (html) => [...html.matchAll(/data-bd-jurisdiction="([^"]+)"/g)].map((m) => m[1]);
  const preserved = seq(c.directoryTable({ directories: items, caption: 'x', sortKey: null }));
  const resorted = seq(c.directoryTable({ directories: items, caption: 'x' }));
  assert.deepStrictEqual(preserved, [...preserved].sort(), 'the preserved order is not A-Z');
  assert.notDeepStrictEqual(resorted, preserved,
    'the default comparator no longer reorders, so the sortKey:null contract is untested');
});

// --- page-level guarantees -----------------------------------------------------------

test('no group table renders a metric column in which every row is empty', () => {
  for (const group of US_PAGE.split('<div class="bd-jgroup"').slice(1)) {
    const label = (group.match(/bd-jgroup-title">([^<]*)/) || [])[1] || '?';
    for (const metric of ['Domain Rating', 'PetroHrys Score']) {
      if (!group.includes(`<th class="bd-cell" scope="col">${metric}</th>`)) continue;
      const cells = [...group.matchAll(new RegExp(`data-bd-label="${metric}">(.*?)</td>`, 'g'))]
        .map((m) => m[1]);
      assert.ok(cells.some((v) => !/bd-metric--empty/.test(v)),
        `the ${label.trim()} group renders a "${metric}" column with no values in it`);
    }
  }
});

test('the US page and every state page keep the apex canonical and a breadcrumb', () => {
  const pages = [path.join(ROOT, 'research', 'business-directories', 'united-states', 'index.html'),
    ...SUBNATIONAL.slice(0, 8).map((r) => path.join(ROOT, 'research', 'business-directories',
      r.country, r.slug, 'index.html'))];
  for (const p of pages) {
    const html = fs.readFileSync(p, 'utf8');
    assert.match(html, /<link rel="canonical" href="https:\/\/petrohrys\.com/, `${p} canonical`);
    assert.match(html, /aria-label="Breadcrumb"/, `${p} has no breadcrumb`);
    assert.match(html, /BreadcrumbList/, `${p} has no breadcrumb structured data`);
  }
});

test('every subnational record is indexable, in the sitemap and in the feed', () => {
  const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap-business-directories.xml'), 'utf8');
  const feed = fs.readFileSync(path.join(ROOT, 'research', 'business-directories', 'feed.xml'), 'utf8');
  for (const r of SUBNATIONAL) {
    assert.ok(S.indexability(r).indexable, `${r.id}: ${S.indexability(r).missing.join(', ')}`);
    assert.ok(sitemap.includes(`/${r.country}/${r.slug}/`), `${r.id} missing from the sitemap`);
    // The feed escapes markup entities, so compare against the escaped form.
    const escaped = r.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    assert.ok(feed.includes(escaped), `${r.id} missing from the feed`);
  }
});

test('no state record introduces a network dependency or an unsupported claim', () => {
  const banned = /\b(guarantees?|proves?) (that )?(the )?(company|entity|business) is (trustworthy|compliant|legitimate)\b|good standing is (proved|established) by/i;
  for (const r of SUBNATIONAL) {
    assert.ok(!banned.test(JSON.stringify(r)), `${r.id} makes an unsupported claim`);
    assert.ok(/does not|not recommended|no[t]? (prove|establish)/i.test(
      `${r.notRecommendedFor.join(' ')} ${r.editorNotes}`),
    `${r.id} does not say what it fails to establish`);
  }
});

// --- prose integrity --------------------------------------------------------
// The first authoring pass clipped researched prose at a character count and
// glued the fragments together: 163 published fields ended mid-word and 39
// carried an unbalanced quotation. Nothing in the suite caught it, because
// every existing check asked whether a field was PRESENT and UNIQUE, never
// whether it was readable. These two do.

// Sentence fields carry prose and quoted evidence, so they are punctuated.
// bestFor and notRecommendedFor are tag-like list items — across the other 96
// records in the dataset, 0 of 82 bestFor entries end in a full stop — so they
// are checked for integrity but not for terminal punctuation.
const SENTENCE_FIELDS = (r) => Object.entries({
  description: r.description,
  editorNotes: r.editorNotes,
  accessNotes: (r.publicAccess && r.publicAccess.notes) || '',
  ...Object.fromEntries(r.pros.map((p, i) => [`pros[${i}]`, p])),
  ...Object.fromEntries(r.cons.map((p, i) => [`cons[${i}]`, p])),
}).filter(([, v]) => v);

const PROSE_FIELDS = (r) => [
  ...SENTENCE_FIELDS(r),
  ...r.bestFor.map((p, i) => [`bestFor[${i}]`, p]),
  ...r.notRecommendedFor.map((p, i) => [`notRecommendedFor[${i}]`, p]),
].filter(([, v]) => v);

test('no published field is truncated or left mid-quotation', () => {
  for (const r of SUBNATIONAL) {
    for (const [field, text] of PROSE_FIELDS(r)) {
      assert.ok(!/[…]\s*$/.test(text) && !/\.\.\.\s*$/.test(text),
        `${r.id} ${field} ends in an ellipsis, so it was cut rather than composed`);
      assert.strictEqual((text.match(/"/g) || []).length % 2, 0,
        `${r.id} ${field} has an unbalanced quotation mark`);
      // The researcher's notebook voice is not publishable prose.
      assert.ok(!/\bI (?:did|could|was|read|ran|note)\b/.test(text),
        `${r.id} ${field} carries first-person researcher voice`);
      assert.ok(!/\bsee [a-z]+[A-Z][a-zA-Z]+/.test(text),
        `${r.id} ${field} cross-references a research field by name`);
    }
  }
});

test('every sentence field ends as a sentence', () => {
  for (const r of SUBNATIONAL) {
    for (const [field, text] of SENTENCE_FIELDS(r)) {
      assert.match(text.trim(), /[.!?"'”)]$/,
        `${r.id} ${field} does not end in terminal punctuation`);
    }
  }
  // The dataset's convention for tag-like entries is the opposite, and this
  // wave must not drift from it.
  for (const r of SUBNATIONAL) {
    for (const entry of [...r.bestFor, ...r.notRecommendedFor]) {
      assert.ok(!/\.$/.test(entry.trim()),
        `${r.id} list entry ends in a full stop: "${entry}"`);
    }
  }
});

test('a description stays a lede rather than becoming an essay', () => {
  // The description is the page lede AND the meta description. Every record
  // outside this wave lands between 69 and 270 characters; a statutory register
  // needs more room than a commercial listing, but not six times more.
  for (const r of SUBNATIONAL) {
    assert.ok(r.description.length >= 120,
      `${r.id} description is ${r.description.length} chars — too thin to be a lede`);
    assert.ok(r.description.length <= 520,
      `${r.id} description is ${r.description.length} chars — that is an essay, not a lede`);
  }
});

// --- no fabricated certainty ------------------------------------------------
// The other half of the first pass's failure: every hedged research finding was
// flattened into a confident boolean, and Texas shipped as "free to search"
// while its own page charges $1.00 per search. The research file lives outside
// the repository, so what is testable here is the internal contradiction: prose
// that asserts what the access block denies.

test('no record claims access its own access block does not carry', () => {
  for (const r of SUBNATIONAL) {
    const pa = r.publicAccess;
    const prose = PROSE_FIELDS(r).map(([, v]) => v).join(' ');
    if (/can be searched free of charge|is free of charge|freely searchable/i.test(prose)) {
      assert.strictEqual(pa.freeToSearch, true,
        `${r.id} prose claims free searching while freeToSearch is ${pa.freeToSearch}`);
    }
    if (/without an account/i.test(prose)) {
      assert.strictEqual(pa.loginRequired, false,
        `${r.id} prose claims no account while loginRequired is ${pa.loginRequired}`);
    }
    if (/raises no CAPTCHA|no CAPTCHA stands/i.test(prose)) {
      assert.strictEqual(pa.captcha, false,
        `${r.id} prose denies a CAPTCHA while captcha is ${pa.captcha}`);
    }
    assert.deepStrictEqual(S.accessContradictions(pa), [], `${r.id} access contradiction`);
  }
});

test('an unknown is recorded as null, never as a confident false', () => {
  // At least one record in the wave must actually carry unknowns, or the rule
  // above is being enforced against a dataset that never exercises it.
  const withUnknowns = SUBNATIONAL.filter((r) => {
    const pa = r.publicAccess;
    return pa.freeToSearch === null || pa.loginRequired === null
      || pa.captcha === null || pa.accessLevel === 'unknown';
  });
  assert.ok(withUnknowns.length >= 3,
    `only ${withUnknowns.length} records carry an unknown — the hedging rule is not being exercised`);
  for (const r of withUnknowns) {
    // A record that does not know its access position must not advertise one.
    if (r.publicAccess.accessLevel === 'unknown') {
      assert.ok(r.cons.some((c) => /could not be established|not stated|cannot be predicted/i.test(c)),
        `${r.id} has an unknown access level but says nothing about it to the reader`);
    }
  }
});
