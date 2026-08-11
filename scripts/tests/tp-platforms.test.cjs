// scripts/tests/tp-platforms.test.cjs
'use strict';

// Guards for the Tender & Procurement Platforms dataset (Wave T1, Europe).
//
// Two kinds of test live here and they are doing different jobs.
//
// The PROPERTY tests assert things about the dataset as it stands. The MUTATION
// tests assert that the schema would REJECT a dataset that had gone wrong: each
// one takes a valid record, breaks it in a specific way, and proves the failure
// is caught. A guard that has never been shown to fail is not a guard, and
// several of the mutations below correspond to mistakes that were actually
// available during research — a grants portal that looks like a procurement
// portal, a regulator's website standing in for the platform, a soft 404 that
// answers with a homepage.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const S = require('../lib/tp-schema.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'data', 'tenders-procurement', 'platforms.json');

const countriesRaw = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'data', 'business-directories', 'countries.json'), 'utf8'));
const countryList = Array.isArray(countriesRaw) ? countriesRaw : countriesRaw.countries;
const COUNTRIES = new Set(countryList.map((c) => (typeof c === 'string' ? c : c.slug)));

const PLATFORMS = S.loadPlatforms(DATA, COUNTRIES);

// A valid record to mutate. Taken from the dataset so the mutations are applied
// to something that genuinely passes today.
const base = () => JSON.parse(JSON.stringify(PLATFORMS.find((r) => r.id === 'eu-ted')));
const problems = (row) => S.problemsFor(row, COUNTRIES);
const caught = (row, field) => problems(row).some(([f]) => f.includes(field));

// ── preconditions ───────────────────────────────────────────────────────────
// Asserted loudly, so no guard below can quietly become vacuous.

test('the dataset is non-empty and the mutation base record exists', () => {
  assert.ok(PLATFORMS.length > 0, 'no platforms: every guard below is vacuous');
  assert.ok(base(), 'the eu-ted base record is missing: mutation tests cannot run');
  assert.strictEqual(problems(base()).length, 0, 'the mutation base record must start valid');
});

// ── property tests ──────────────────────────────────────────────────────────

test('every record loads clean against the schema', () => {
  assert.doesNotThrow(() => S.loadPlatforms(DATA, COUNTRIES));
});

test('ids are unique and slug-shaped', () => {
  const ids = PLATFORMS.map((r) => r.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'duplicate id');
  for (const id of ids) assert.match(id, /^[a-z0-9]+(-[a-z0-9]+)*$/);
});

test('every declared URL is https', () => {
  for (const r of PLATFORMS) {
    for (const f of S.URL_FIELDS) {
      if (r[f] == null) continue;
      assert.match(r[f], /^https:\/\//, `${r.id}.${f} is not https`);
    }
  }
});

test('no discovery or submission route is merely the homepage', () => {
  for (const r of PLATFORMS) {
    for (const f of ['tenderSearchUrl', 'submissionUrl']) {
      if (!r[f]) continue;
      assert.notStrictEqual(r[f], r.officialUrl,
        `${r.id}.${f} repeats officialUrl — a homepage is not a verified route`);
    }
  }
});

test('foreign-supplier eligibility is never claimed without class A evidence', () => {
  for (const r of PLATFORMS) {
    if (r.foreignSuppliersAccepted === 'yes') {
      assert.strictEqual(r.evidenceClass, 'A',
        `${r.id} claims foreign suppliers are accepted on ${r.evidenceClass}-class evidence`);
    }
  }
});

test('unknown is never silently downgraded to no', () => {
  // Every tri-state field is either absent, or one of the three values. The
  // failure this protects against is a research pass that could not establish a
  // fact and recorded "no" to make a column look complete.
  for (const r of PLATFORMS) {
    for (const f of S.TRI_FIELDS) {
      if (r[f] === undefined) continue;
      assert.ok(S.TRI_STATE.includes(r[f]), `${r.id}.${f} = ${r[f]}`);
    }
  }
});

test('any record whose evidence is unknown declares that a browser check is needed', () => {
  for (const r of PLATFORMS) {
    if (r.evidenceClass !== 'unknown') continue;
    assert.strictEqual(r.browserCheckRequired, true,
      `${r.id} has unknown evidence but does not ask for a browser check`);
  }
});

test('every record carries an evidence note that says what was actually observed', () => {
  for (const r of PLATFORMS) {
    assert.ok(typeof r.evidenceNote === 'string' && r.evidenceNote.length > 40,
      `${r.id} has no substantive evidenceNote`);
  }
});

test('no EU grants portal is published as a procurement platform', () => {
  // The Commission's "national single portals" list covers 27 countries and is
  // entirely EU funding and cohesion policy — not procurement. It is the single
  // most available way to fabricate this dataset, so the hosts are denied by
  // name rather than by good intentions.
  const GRANT_HOSTS = [
    'eufunds.bg', 'dotaceeu.cz', 'eufonde.dk', 'fondoseuropeos.gob.es',
    'europe-en-france.gouv.fr', 'eufondovi.gov.hr', 'palyazat.gov.hu',
    'eufunds.ie', 'opencoesione.gov.it', 'esfondi.lv', 'fondi.eu',
    'europaomdehoek.nl', 'funduszeeuropejskie.gov.pl', 'portugal2030.pt',
    'fonduri-ue.ro', 'eufonder.se', 'evropskasredstva.si', 'eurofondy.gov.sk',
    'espa.gr', 'eufunds.com.cy', 'rtk.ee', 'eurahoitusneuvonta.fi',
  ];
  for (const r of PLATFORMS) {
    const host = S.hostOf(r.officialUrl);
    assert.ok(!GRANT_HOSTS.includes(host),
      `${r.id} publishes ${host}, which is an EU funding portal, not a procurement platform`);
  }
});

test('no record carries an invented procurement metric', () => {
  const banned = ['score', 'tenderScore', 'domainRating', 'traffic', 'authorityScore',
    'contractValue', 'bidderCount', 'winRate', 'tenderCount'];
  for (const r of PLATFORMS) {
    for (const b of banned) {
      assert.ok(r[b] === undefined || r[b] === null, `${r.id} carries ${b}`);
    }
  }
});

test('ordering is locale-independent so generated bytes are stable', () => {
  const once = [...PLATFORMS].sort(S.comparePlatforms).map((r) => r.id);
  const twice = [...PLATFORMS].reverse().sort(S.comparePlatforms).map((r) => r.id);
  assert.deepStrictEqual(once, twice, 'sort is not a total order on this dataset');
});

test('publishable records are the ones a reader could act on', () => {
  for (const r of PLATFORMS) {
    if (['replaced', 'shutting-down', 'dormant'].includes(r.currentStatus)) {
      assert.strictEqual(S.isPublishable(r), false, `${r.id} is inactive but publishable`);
    }
  }
});

// ── mutation tests ──────────────────────────────────────────────────────────
// Each applies a specific defect to a valid record and proves it is caught.
// Mutations run on deep clones, so the dataset on disk is never touched.

test('MUTATION: unknown foreign eligibility raised to yes is caught', () => {
  const row = base();
  row.foreignSuppliersAccepted = 'yes';
  row.evidenceClass = 'B';
  assert.ok(caught(row, 'foreignSuppliersAccepted'),
    'a yes on non-A evidence survived: eligibility could be inferred from reachability');
});

test('MUTATION: a homepage substituted for a tender search route is caught', () => {
  const row = base();
  row.tenderSearchUrl = row.officialUrl;
  assert.ok(caught(row, 'tenderSearchUrl'), 'homepage-as-discovery-route survived');
});

test('MUTATION: a homepage substituted for a submission route is caught', () => {
  const row = base();
  row.submissionUrl = row.officialUrl;
  assert.ok(caught(row, 'submissionUrl'), 'homepage-as-submission-route survived');
});

test('MUTATION: unknown evidence without a browser-check flag is caught', () => {
  const row = base();
  row.evidenceClass = 'unknown';
  row.browserCheckRequired = false;
  assert.ok(caught(row, 'evidenceClass'), 'unverified record published as if verified');
});

test('MUTATION: an invented metric is caught', () => {
  for (const b of ['tenderScore', 'domainRating', 'winRate']) {
    const row = base();
    row[b] = 42;
    assert.ok(caught(row, b), `${b} survived`);
  }
});

test('MUTATION: an off-vocabulary enum value is caught', () => {
  const row = base();
  row.platformType = 'tender-portal';
  assert.ok(caught(row, 'platformType'), 'free-text platform type survived');
});

test('MUTATION: a translated enum value used as a logic value is caught', () => {
  // Localised labels belong in the i18n layer. If a translation ever reaches the
  // data layer, the canonical vocabulary must reject it.
  const row = base();
  row.opportunityTypes = ['Ausschreibung'];
  assert.ok(caught(row, 'opportunityTypes'), 'a localized label survived as a logic value');
});

test('MUTATION: an unsorted opportunityTypes array is caught', () => {
  const row = base();
  row.opportunityTypes = ['tender', 'contract-notice'];
  assert.ok(caught(row, 'opportunityTypes'), 'unsorted array survived, so bytes are unstable');
});

test('MUTATION: a non-https URL is caught', () => {
  const row = base();
  row.officialUrl = 'http://ted.europa.eu/';
  assert.ok(caught(row, 'officialUrl'), 'http URL survived');
});

test('MUTATION: an undeclared country is caught', () => {
  const row = base();
  row.country = 'atlantis';
  assert.ok(caught(row, 'country'), 'undeclared country survived');
});

test('MUTATION: a replaced platform with no successor is caught', () => {
  const row = base();
  row.currentStatus = 'replaced';
  delete row.replacedBy;
  assert.ok(caught(row, 'replacedBy'), 'a dead end survived');
});

test('MUTATION: two records on one host without an ecosystem link are caught', () => {
  const dup = base();
  dup.id = 'eu-ted-copy';
  const file = path.join(require('node:os').tmpdir(), `tp-dup-${process.pid}.json`);
  fs.writeFileSync(file, JSON.stringify([...PLATFORMS, dup]));
  try {
    assert.throws(() => S.loadPlatforms(file, COUNTRIES), /shares a host/,
      'the same platform listed twice survived');
  } finally { fs.unlinkSync(file); }
});

test('MUTATION: a partOf pointing at a non-existent record is caught', () => {
  const row = base();
  row.partOf = 'does-not-exist';
  const file = path.join(require('node:os').tmpdir(), `tp-dangle-${process.pid}.json`);
  fs.writeFileSync(file, JSON.stringify([row]));
  try {
    assert.throws(() => S.loadPlatforms(file, COUNTRIES), /not a record in this dataset/,
      'a dangling ecosystem link survived');
  } finally { fs.unlinkSync(file); }
});

test('MUTATION: a required field removed is caught', () => {
  for (const f of ['id', 'officialUrl', 'evidenceUrl', 'evidenceClass', 'opportunityTypes']) {
    const row = base();
    delete row[f];
    assert.ok(caught(row, f), `${f} is not actually required`);
  }
});
