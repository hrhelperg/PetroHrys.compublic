// scripts/tests/bd-uk-territories.test.cjs
'use strict';

// The United Kingdom is the first country whose registers do not map one-to-one
// onto ISO subdivisions. A charity regulator covers "England and Wales" — one
// legal jurisdiction over two ISO codes — and the obvious shortcut is to invent
// GB-EAW for it. GB-EAW is a real-looking identifier that Unicode CLDR still
// carries a display name for, which is precisely why downstream libraries make
// it look valid. It is not an ISO 3166-2 subdivision, and the old format-only
// check accepted it, along with GB-ZZZ.
//
// These tests hold three lines: the allowlist knows which codes exist, the
// covers model expresses a multi-subdivision territory without inventing one,
// and Canada and Australia are untouched by any of it.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const S = require('../lib/bd-schema.cjs');
const ISO = require('../lib/iso-3166-2.cjs');
const c = require('../lib/bd-components.cjs');
const { validateRegistry } = require('../validate-business-directories.cjs');
const { loadRegistry } = require('../lib/bd-registry.cjs');
const { migrateRecord, serialisableRecord } = require('../lib/bd-migrate.cjs');
const { verifiedRecord } = require('./helpers/fixtures.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const REGISTRY = loadRegistry();
const okOf = (dirs) => validateRegistry({ ...REGISTRY, directories: [...REGISTRY.directories, ...dirs] });
const reasons = (r) => r.errors.map((e) => `${e.field}: ${e.reason}`).join(' | ');

const uk = (id, jurisdiction) => verifiedRecord({
  id, slug: id, country: 'united-kingdom', website: `https://${id}.example.gov.uk/`,
  scope: jurisdiction ? 'subnational' : 'national', jurisdiction,
});
const J = (type, name, code = null, covers = null) => ({
  type, name, code, covers, parentCountry: 'united-kingdom',
});

// --- the allowlist ----------------------------------------------------------

test('the allowlist knows the four UK constituent-level codes and their ISO categories', () => {
  assert.strictEqual(ISO.subdivision('GB-ENG').category, 'Country');
  assert.strictEqual(ISO.subdivision('GB-SCT').category, 'Country');
  assert.strictEqual(ISO.subdivision('GB-WLS').category, 'Country');
  // Northern Ireland is a Province in ISO's own categorisation. Calling it a
  // country here would be tidier and would misdescribe the standard.
  assert.strictEqual(ISO.subdivision('GB-NIR').category, 'Province');
  for (const code of ['GB-ENG', 'GB-SCT', 'GB-WLS', 'GB-NIR']) {
    assert.strictEqual(ISO.unknownCodeProblem(code), null, `${code} was rejected`);
    assert.strictEqual(ISO.countryOf(code), 'GB');
  }
});

test('the deprecated UK compound identifiers are rejected by name, with a reason', () => {
  for (const [code, must] of [
    ['GB-EAW', /deprecated compound entity.*England and Wales/],
    ['GB-GBN', /deprecated compound entity.*Great Britain/],
    ['GB-UKM', /deprecated compound entity.*United Kingdom/],
  ]) {
    const problem = ISO.unknownCodeProblem(code);
    assert.ok(problem, `${code} was accepted`);
    assert.match(problem, must, `${code}: "${problem}"`);
    // A bare "not in the list" would not tell an author what to do instead.
    assert.match(problem, /covers|scope "national"/, `${code} does not say what to use instead`);
  }
});

test('identifiers from other schemes are rejected as such, not as typos', () => {
  // These share the "GB-" shape and none is an ISO 3166-2 subdivision.
  assert.match(ISO.unknownCodeProblem('GB-CHC'), /org-id\.guide/);
  assert.match(ISO.unknownCodeProblem('GB-COH'), /org-id\.guide/);
  assert.match(ISO.unknownCodeProblem('GB-CYM'), /alternative form of GB-WLS/);
  assert.match(ISO.unknownCodeProblem('GB-NIC'), /charity-registration prefix/);
});

test('a structurally valid but non-existent code is rejected', () => {
  // The whole point: shape is not existence. The old check passed this.
  assert.strictEqual(S.iso3166_2Problem('GB-ZZZ'), null, 'GB-ZZZ is structurally well-formed');
  assert.ok(ISO.unknownCodeProblem('GB-ZZZ'), 'GB-ZZZ was accepted by the allowlist');
  assert.match(ISO.unknownCodeProblem('GB-ZZZ'), /not an ISO 3166-2 subdivision of "GB"/);
  assert.ok(ISO.unknownCodeProblem('US-ZZ'), 'US-ZZ was accepted');
});

test('the allowlist is internally consistent and states its own scope', () => {
  const all = Object.values(ISO.SUBDIVISIONS).flat();
  const codes = all.map((r) => r[0]);
  assert.strictEqual(new Set(codes).size, codes.length, 'a code appears twice');
  for (const [code] of all) {
    assert.strictEqual(code, code.toUpperCase(), `${code} is not uppercase`);
    assert.strictEqual(ISO.countryOf(code), code.split('-')[0], `${code} has the wrong parent`);
  }
  // Scope is declared, not implied. An uncovered country says so.
  assert.ok(ISO.SUPPORTED_COUNTRIES.length >= 9);
  assert.match(ISO.unknownCodeProblem('FR-IDF'), /does not cover/);
  assert.match(ISO.unknownCodeProblem('FR-IDF'), /Extend scripts\/lib\/iso-3166-2\.cjs/);
  // And none of the deprecated compounds leaked into the data itself.
  for (const bad of ['GB-EAW', 'GB-GBN', 'GB-UKM']) {
    assert.ok(!codes.includes(bad), `${bad} is in the allowlist`);
  }
});

test('the allowlist module performs no I/O', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/lib/iso-3166-2.cjs'), 'utf8');
  for (const forbidden of ['require(\'node:fs\')', 'require("node:fs")', 'require(\'fs\')',
    'fetch(', 'XMLHttpRequest', 'readFileSync', 'execSync', 'https']) {
    assert.ok(!src.includes(forbidden), `the allowlist module uses ${forbidden}`);
  }
});

// --- the covers model -------------------------------------------------------

test('the four UK constituent countries validate and carry no covers', () => {
  const res = okOf([
    uk('t-eng', J('country', 'England', 'GB-ENG')),
    uk('t-sct', J('country', 'Scotland', 'GB-SCT')),
    uk('t-wls', J('country', 'Wales', 'GB-WLS')),
    uk('t-nir', J('province', 'Northern Ireland', 'GB-NIR')),
  ]);
  assert.strictEqual(res.ok, true, reasons(res));
});

test('a cross-territory jurisdiction is expressed by covers, never an invented code', () => {
  const res = okOf([
    uk('t-eaw', J('cross-territory', 'England and Wales', null, ['GB-ENG', 'GB-WLS'])),
    uk('t-gbn', J('cross-territory', 'Great Britain', null, ['GB-ENG', 'GB-SCT', 'GB-WLS'])),
  ]);
  assert.strictEqual(res.ok, true, reasons(res));
  // And the shortcut is closed.
  const invented = okOf([uk('t-bad', J('cross-territory', 'England and Wales', 'GB-EAW'))]);
  assert.strictEqual(invented.ok, false, 'GB-EAW was accepted as a code');
  assert.match(reasons(invented), /deprecated compound entity/);
});

test('code and covers are mutually exclusive', () => {
  const both = okOf([uk('t-both', J('cross-territory', 'X', 'GB-ENG', ['GB-ENG', 'GB-WLS']))]);
  assert.strictEqual(both.ok, false, 'a jurisdiction carried both');
  assert.match(reasons(both), /carries both "code" and "covers"/);
});

test('covers is rejected unless it is a real, sorted, unique, in-country set of two or more', () => {
  const cases = [
    [['GB-ENG'], /at least two subdivisions/, 'one item'],
    [['GB-ENG', 'GB-ENG'], /more than once/, 'a duplicate'],
    [['GB-WLS', 'GB-ENG'], /must be sorted/, 'wrong order'],
    [['GB-ENG', 'GB-EAW'], /deprecated compound entity/, 'a deprecated code'],
    [['GB-ENG', 'GB-ZZZ'], /not an ISO 3166-2 subdivision/, 'a fake code'],
    [['GB-ENG', 'GB-CHC'], /org-id\.guide/, 'an org-id prefix'],
    [['GB-ENG', 'US-CA'], /does not belong to the parent country/, 'a foreign code'],
  ];
  for (const [covers, expected, what] of cases) {
    const res = okOf([uk('t-c', J('cross-territory', 'Test', null, covers))]);
    assert.strictEqual(res.ok, false, `${what} was accepted: ${JSON.stringify(covers)}`);
    assert.match(reasons(res), expected, `${what} produced: ${reasons(res)}`);
  }
});

test('covers belongs only to a cross-territory jurisdiction, and it must have one', () => {
  const wrongType = okOf([uk('t-w', J('country', 'England', null, ['GB-ENG', 'GB-WLS']))]);
  assert.strictEqual(wrongType.ok, false);
  assert.match(reasons(wrongType), /Only jurisdiction type "cross-territory" may carry "covers"/);

  const missing = okOf([uk('t-m', J('cross-territory', 'England and Wales', null, null))]);
  assert.strictEqual(missing.ok, false);
  assert.match(reasons(missing), /must list the subdivisions it covers/);
});

test('a name-identified jurisdiction with no code remains valid', () => {
  // Deliberate pre-existing allowance: null is the honest value where no ISO
  // code exists, and forcing one would invent exactly what this phase forbids.
  const res = okOf([verifiedRecord({
    id: 't-noc', slug: 't-noc', country: 'united-states', website: 'https://n.example.gov/',
    scope: 'subnational',
    jurisdiction: { type: 'state', name: 'Somewhere', code: null, covers: null, parentCountry: 'united-states' },
  })]);
  assert.strictEqual(res.ok, true, reasons(res));
});

// --- identity ---------------------------------------------------------------

test('a covers set identifies a jurisdiction, and order does not change it', () => {
  const a = S.jurisdictionIdentity(J('cross-territory', 'England and Wales', null, ['GB-ENG', 'GB-WLS']));
  const b = S.jurisdictionIdentity(J('cross-territory', 'england and  wales', null, ['GB-WLS', 'GB-ENG']));
  assert.strictEqual(a.by, 'covers');
  assert.strictEqual(a.key, b.key, 'the same territory in a different order is a different identity');
  assert.match(a.key, /covers:GB-ENG,GB-WLS/);
  // A different set is a different place.
  const gb = S.jurisdictionIdentity(J('cross-territory', 'Great Britain', null, ['GB-ENG', 'GB-SCT', 'GB-WLS']));
  assert.notStrictEqual(a.key, gb.key);
});

test('one covers set cannot carry two different names', () => {
  const res = okOf([
    uk('t-a', J('cross-territory', 'England and Wales', null, ['GB-ENG', 'GB-WLS'])),
    uk('t-b', J('cross-territory', 'England & Wales Region', null, ['GB-ENG', 'GB-WLS'])),
  ]);
  assert.strictEqual(res.ok, false, 'two names claimed one territory');
  assert.match(reasons(res), /cannot have two names/);
});

test('several records may share one jurisdiction', () => {
  // Jurisdiction identity is not record identity: two regulators can both
  // cover England and Wales.
  const res = okOf([
    uk('t-1', J('cross-territory', 'England and Wales', null, ['GB-ENG', 'GB-WLS'])),
    uk('t-2', J('cross-territory', 'England and Wales', null, ['GB-ENG', 'GB-WLS'])),
  ]);
  assert.strictEqual(res.ok, true, reasons(res));
});

test('a UTF-8 jurisdiction name survives normalisation and identity', () => {
  const res = okOf([verifiedRecord({
    id: 't-utf', slug: 't-utf', country: 'spain', website: 'https://u.example.es/',
    scope: 'subnational',
    jurisdiction: { type: 'autonomous-community', name: 'Cataluña', code: 'ES-CT', covers: null, parentCountry: 'spain' },
  })]);
  assert.strictEqual(res.ok, true, reasons(res));
  assert.match(S.jurisdictionIdentity({ type: 'autonomous-community', name: 'Cataluña', code: 'ES-CT', parentCountry: 'spain' }).key, /ES-CT/);
});

// --- grouping ---------------------------------------------------------------

const UK_FIXTURE = [
  uk('f-wide', null),
  uk('f-eng', J('country', 'England', 'GB-ENG')),
  uk('f-sct', J('country', 'Scotland', 'GB-SCT')),
  uk('f-nir', J('province', 'Northern Ireland', 'GB-NIR')),
  uk('f-eaw', J('cross-territory', 'England and Wales', null, ['GB-ENG', 'GB-WLS'])),
];

test('the UK page groups UK-wide, constituent countries, then cross-territory', () => {
  const groups = c.jurisdictionGroups(UK_FIXTURE, 'united-kingdom');
  assert.deepStrictEqual(groups.map((g) => g.label),
    ['UK-wide', 'Constituent countries', 'Cross-territory jurisdictions']);
  assert.deepStrictEqual(groups.map((g) => g.count), [1, 3, 1]);
});

test('country and province merge into one Constituent countries group, sorted by name', () => {
  // Northern Ireland is `province` and England and Scotland are `country`.
  // Two boxes with the same heading would claim there are two kinds.
  const groups = c.jurisdictionGroups(UK_FIXTURE, 'united-kingdom');
  const constituent = groups.filter((g) => g.label === 'Constituent countries');
  assert.strictEqual(constituent.length, 1, `${constituent.length} groups share one label`);
  assert.deepStrictEqual(constituent[0].items.map((d) => d.jurisdiction.name),
    ['England', 'Northern Ireland', 'Scotland']);
});

test('every record reaches a group', () => {
  const groups = c.jurisdictionGroups(UK_FIXTURE, 'united-kingdom');
  const placed = groups.flatMap((g) => g.items.map((d) => d.id)).sort();
  assert.deepStrictEqual(placed, UK_FIXTURE.map((d) => d.id).sort());
});

test('a UK-wide record is not a constituent country, and England is not UK-wide', () => {
  const groups = c.jurisdictionGroups(UK_FIXTURE, 'united-kingdom');
  const wide = groups.find((g) => g.label === 'UK-wide');
  assert.ok(wide.items.every((d) => !d.jurisdiction), 'a subnational record was filed as UK-wide');
  const constituent = groups.find((g) => g.label === 'Constituent countries');
  assert.ok(constituent.items.every((d) => d.jurisdiction), 'a UK-wide record was filed as constituent');
});

// --- Canada and Australia must be untouched ---------------------------------

test('Canada still groups Federal, Provinces, Territories', () => {
  const recs = [
    verifiedRecord({ id: 'c-f', slug: 'c-f', country: 'canada', website: 'https://f.example.ca/' }),
    verifiedRecord({ id: 'c-on', slug: 'c-on', country: 'canada', website: 'https://on.example.ca/', scope: 'subnational', jurisdiction: { type: 'province', name: 'Ontario', code: 'CA-ON', covers: null, parentCountry: 'canada' } }),
    verifiedRecord({ id: 'c-nt', slug: 'c-nt', country: 'canada', website: 'https://nt.example.ca/', scope: 'subnational', jurisdiction: { type: 'territory', name: 'Northwest Territories', code: 'CA-NT', covers: null, parentCountry: 'canada' } }),
  ];
  assert.strictEqual(okOf(recs).ok, true, reasons(okOf(recs)));
  assert.deepStrictEqual(c.jurisdictionGroups(recs, 'canada').map((g) => g.label),
    ['Federal', 'Provinces', 'Territories']);
});

test('Australia still groups Federal, States, Territories', () => {
  const recs = [
    verifiedRecord({ id: 'a-f', slug: 'a-f', country: 'australia', website: 'https://f.example.au/' }),
    verifiedRecord({ id: 'a-nsw', slug: 'a-nsw', country: 'australia', website: 'https://nsw.example.au/', scope: 'subnational', jurisdiction: { type: 'state', name: 'New South Wales', code: 'AU-NSW', covers: null, parentCountry: 'australia' } }),
    verifiedRecord({ id: 'a-act', slug: 'a-act', country: 'australia', website: 'https://act.example.au/', scope: 'subnational', jurisdiction: { type: 'territory', name: 'Australian Capital Territory', code: 'AU-ACT', covers: null, parentCountry: 'australia' } }),
  ];
  assert.strictEqual(okOf(recs).ok, true, reasons(okOf(recs)));
  assert.deepStrictEqual(c.jurisdictionGroups(recs, 'australia').map((g) => g.label),
    ['Federal', 'States', 'Territories']);
});

test('a code cannot be used under the wrong country', () => {
  const cases = [
    ['canada', 'province', 'Scotland', 'GB-SCT', /has prefix "GB" but Canada is "CA"/],
    ['australia', 'state', 'Ontario', 'CA-ON', /has prefix "CA" but Australia is "AU"/],
    ['united-kingdom', 'country', 'New South Wales', 'AU-NSW', /has prefix "AU" but United Kingdom is "GB"/],
  ];
  for (const [country, type, name, code, expected] of cases) {
    const res = okOf([verifiedRecord({
      id: 'x-w', slug: 'x-w', country, website: 'https://w.example.gov/', scope: 'subnational',
      jurisdiction: { type, name, code, covers: null, parentCountry: country },
    })]);
    assert.strictEqual(res.ok, false, `${code} was accepted under ${country}`);
    assert.match(reasons(res), expected, `${code} under ${country}: ${reasons(res)}`);
  }
});

// --- display ----------------------------------------------------------------

test('a cross-territory record shows its territories, never array syntax or a fake code', () => {
  const html = c.registryInformation(uk('d-eaw', J('cross-territory', 'England and Wales', null, ['GB-ENG', 'GB-WLS'])));
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.match(text, /England and Wales/);
  assert.match(text, /Covers England · Wales/);
  assert.ok(!/\[|\]/.test(text), `array syntax leaked: ${text}`);
  assert.ok(!/GB-EAW|GB-GBN|GB-UKM/.test(html), 'a synthetic code was displayed');
  assert.ok(!/covers:/.test(text), 'a machine identity string leaked');
});

test('a single-territory record still shows its code', () => {
  const html = c.registryInformation(uk('d-sct', J('country', 'Scotland', 'GB-SCT')));
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.match(text, /Scotland/);
  assert.match(text, /GB-SCT/);
});

// --- data and build stability -----------------------------------------------

test('adding covers changes no record on disk', () => {
  // The field is null on every existing jurisdiction, and a null that appears
  // in 46 records on disk is 46 lines of no information.
  const dir = path.join(ROOT, 'data/business-directories/directories');
  for (const file of fs.readdirSync(dir)) {
    const raw = fs.readFileSync(path.join(dir, file), 'utf8');
    assert.ok(!raw.includes('"covers"'), `${file} serialises covers`);
  }
});

test('migration is idempotent and round-trips covers', () => {
  const withCovers = {
    ...uk('m-eaw', J('cross-territory', 'England and Wales', null, ['GB-ENG', 'GB-WLS'])),
  };
  const once = migrateRecord(withCovers);
  const twice = migrateRecord(serialisableRecord(once));
  assert.deepStrictEqual(twice.jurisdiction, once.jurisdiction, 'covers did not round-trip');
  assert.deepStrictEqual(once.jurisdiction.covers, ['GB-ENG', 'GB-WLS']);
  // A null covers is dropped on the way to disk and read back as null.
  const plain = migrateRecord(uk('m-sct', J('country', 'Scotland', 'GB-SCT')));
  assert.strictEqual(plain.jurisdiction.covers, null);
  assert.ok(!Object.prototype.hasOwnProperty.call(serialisableRecord(plain).jurisdiction, 'covers'),
    'a null covers reached the serialised form');
});

test('migration does not repair invalid source data', () => {
  // An unsorted array that arrived here sorted would be reported as correct and
  // silently rewritten, and the author would never learn the record was wrong.
  const bad = migrateRecord({
    ...uk('m-bad', J('cross-territory', 'X', null, ['GB-WLS', 'GB-ENG'])),
  });
  assert.deepStrictEqual(bad.jurisdiction.covers, ['GB-WLS', 'GB-ENG'], 'migration sorted covers');
  const dupe = migrateRecord({ ...uk('m-d', J('cross-territory', 'X', null, ['GB-ENG', 'GB-ENG'])) });
  assert.deepStrictEqual(dupe.jurisdiction.covers, ['GB-ENG', 'GB-ENG'], 'migration deduplicated covers');
});

test('an unknown key inside jurisdiction is rejected by path', () => {
  const rec = uk('u-x', J('country', 'Scotland', 'GB-SCT'));
  for (const key of ['coverage', 'cover', 'isoCodes', 'subdivisionCodes', 'territoryCodes']) {
    const withKey = { ...rec, jurisdiction: { ...rec.jurisdiction, [key]: ['GB-ENG'] } };
    const problems = require('../lib/bd-migrate.cjs').unknownKeysOf(withKey);
    assert.ok(problems.some((p) => p.path === `jurisdiction.${key}`),
      `jurisdiction.${key} was not reported: ${JSON.stringify(problems)}`);
  }
});

test('no new route family was created', () => {
  const dir = path.join(ROOT, 'research/business-directories');
  for (const country of ['united-kingdom', 'canada', 'australia']) {
    const p = path.join(dir, country);
    if (!fs.existsSync(p)) continue;
    for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      assert.ok(!['jurisdictions', 'territories', 'states', 'provinces', 'countries'].includes(entry.name),
        `${country}/${entry.name}/ is a new jurisdiction route family`);
    }
  }
});
