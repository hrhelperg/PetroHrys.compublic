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

test('every platform surface is https; a citation may be what it is', () => {
  // Two different things were conflated here until Wave T3. A platform's own
  // URLs — the front door and the four lifecycle routes — must be https: a
  // procurement system not on TLS is a finding about that system, and these are
  // links we send suppliers to. evidenceUrl is a CITATION, and some
  // authoritative government sources are genuinely http-only (Egypt's General
  // Authority for Government Services among them). Refusing to cite one would
  // push research toward a worse source to satisfy a rule aimed at something
  // else, so the citation is allowed to be http and the record records it.
  const SURFACES = S.URL_FIELDS.filter((f) => f !== 'evidenceUrl');
  for (const r of PLATFORMS) {
    for (const f of SURFACES) {
      if (r[f] == null) continue;
      assert.match(r[f], /^https:\/\//, `${r.id}.${f} is a platform surface and must be https`);
    }
    if (r.evidenceUrl != null) {
      assert.match(r.evidenceUrl, /^https?:\/\//, `${r.id}.evidenceUrl must be an http(s) URL`);
    }
  }
});

test('an http citation says so in its own limitations', () => {
  // The relaxation above is only honest if the reader can see it on the record.
  for (const r of PLATFORMS) {
    if (!r.evidenceUrl || !r.evidenceUrl.startsWith('http://')) continue;
    assert.ok((r.limitations || []).some((l) => /HTTP|http/.test(l)),
      `${r.id} cites an http source without recording that in limitations`);
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
  const banned = ['score', 'tenderScore', 'traffic', 'authorityScore',
    'contractValue', 'bidderCount', 'winRate', 'tenderCount'];
  for (const r of PLATFORMS) {
    for (const b of banned) {
      assert.ok(r[b] === undefined || r[b] === null, `${r.id} carries ${b}`);
    }
  }
});

test('every Domain Rating this dataset carries was measured, not invented', () => {
  // domainRating left the banned list when collection was unfrozen. It is the
  // only entry that ever differed in kind: the rest are numbers this project
  // would have had to make up, and a Domain Rating is one Ahrefs published. The
  // test that replaces the ban is therefore about EVIDENCE, not absence.
  const BD = require('../lib/bd-schema.cjs');
  let rated = 0;
  for (const r of PLATFORMS) {
    if (r.domainRating === undefined || r.domainRating === null) continue;
    rated += 1;
    assert.deepStrictEqual(BD.domainRatingProblems(r), [],
      `${r.id} carries a Domain Rating that does not satisfy the shared rule`);
    assert.strictEqual(r.metricsProvenance.domainRating.measuredDomain,
      BD.normaliseDomain(r.officialUrl),
      `${r.id} reports a rating measured on a domain that is not its own`);
  }
  assert.ok(rated > 0, 'no platform carries a Domain Rating, so this guard is vacuous');
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
  for (const b of ['tenderScore', 'winRate', 'contractValue', 'bidderCount']) {
    const row = base();
    row[b] = 42;
    assert.ok(caught(row, b), `${b} survived`);
  }
});

test('MUTATION: a Domain Rating with no provenance is caught', () => {
  // domainRating left the banned list above when collection was unfrozen, and
  // it is the one entry that never belonged there: the rest are numbers this
  // project would have had to invent, while a Domain Rating is a measurement
  // somebody else took and published. What must still not get in is a BARE
  // number — that is precisely what an invented metric looks like — so the ban
  // became a rule rather than disappearing.
  const bare = base();
  bare.domainRating = 42;
  // The base record is a REAL platform and now carries real provenance, so the
  // provenance has to be removed for this mutation to be the mutation it says
  // it is. Left in place the test passes for the wrong reason — it was
  // measuring a valid record and calling it bare.
  delete bare.metricsProvenance;
  assert.ok(caught(bare, 'metricsProvenance'), 'a Domain Rating with no provenance survived');

  const offScale = base();
  offScale.domainRating = 142;
  delete offScale.metricsProvenance;
  offScale.metricsProvenance = { domainRating: {
    provider: 'Ahrefs', status: 'publicApiReading', measuredAt: '2026-08-19', measuredDomain: 'x.test',
  } };
  assert.ok(caught(offScale, 'domainRating'), 'a rating outside the 0-100 scale survived');

  const stranger = base();
  stranger.domainRating = 42;
  stranger.metricsProvenance = { domainRating: {
    provider: 'Somebody', status: 'publicApiReading', measuredAt: '2026-08-19', measuredDomain: 'x.test',
  } };
  assert.ok(caught(stranger, 'metricsProvenance.domainRating.provider'),
    'a rating from an unrecognised provider survived');
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

// ── Wave T2A additions ──────────────────────────────────────────────────────
// The route-completion pass and the ecosystem deepening created three new ways
// to go wrong: a homepage shortcut in the two route fields T1 did not guard, a
// superseded system still calling itself active, and shared infrastructure
// duplicated across records. Each gets a property and a mutation.

test('T2A: a record naming a successor is never active', () => {
  const withSuccessor = PLATFORMS.filter((r) => r.replacedBy);
  assert.ok(withSuccessor.length > 0, 'no replaced record exists: this guard is vacuous');
  for (const r of withSuccessor) {
    assert.strictEqual(r.currentStatus, 'replaced',
      `${r.id} names ${r.replacedBy} as successor but claims to be "${r.currentStatus}"`);
  }
});

test('T2A MUTATION: successor-and-active is caught', () => {
  const row = base();
  row.replacedBy = 'eu-ted';
  // currentStatus stays 'active' — the exact lie the guard exists for.
  assert.ok(caught(row, 'currentStatus'), 'a superseded record posing as active survived');
});

test('T2A MUTATION: homepage copied into registration or documents route is caught', () => {
  for (const f of ['supplierRegistrationUrl', 'documentsUrl']) {
    const row = base();
    row[f] = row.officialUrl;
    assert.ok(caught(row, f), `${f} homepage shortcut survived`);
  }
});

test('T2A/T4B: one host may carry several systems only when something real distinguishes them', () => {
  // Originally: "one host, one system", which caught the 26-copies-of-SIMAP
  // failure. Wave T4B proved the rule was stated one level too coarsely.
  //
  // WHO, UNICEF and WFP each operate their own tendering site as a separate
  // tenant of a single In-tend deployment — ungm.in-tend.co.uk/who, /unicef,
  // /wfp. Three institutions, three tender universes, one vendor hostname.
  // IsDB likewise runs corporate and project-financed procurement on one
  // domain, and those are the very functions this collection exists to keep
  // apart. Host-only uniqueness silently deleted two UN agencies.
  //
  // The property is therefore: a host may carry several records when they are
  // genuinely different systems — a declared partOf/replacedBy relationship, a
  // different operator (multi-tenant vendor deployment), or a different
  // procurement nature — and their URLs differ. A bare duplicate is still a bug.
  const natureOf = (r) => {
    const m = (r.limitations || [])
      .map((l) => /^(Project-financed|Corporate|Consulting)/.exec(l)).find(Boolean);
    return m ? m[1] : '';
  };
  const byHost = new Map();
  for (const r of PLATFORMS) {
    const host = S.hostOf(r.officialUrl);
    if (!byHost.has(host)) byHost.set(host, []);
    byHost.get(host).push(r);
  }
  for (const [host, group] of byHost) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const [a, b] = [group[i], group[j]];
        const related = a.partOf === b.id || b.partOf === a.id
          || a.replacedBy === b.id || b.replacedBy === a.id;
        const differentOperator = String(a.operator || '').trim().toLowerCase()
          !== String(b.operator || '').trim().toLowerCase();
        const differentNature = natureOf(a) && natureOf(b) && natureOf(a) !== natureOf(b);
        const differentUrl = a.officialUrl !== b.officialUrl;
        assert.ok(related || ((differentOperator || differentNature) && differentUrl),
          `${a.id} and ${b.id} both live on ${host} and are indistinguishable: `
          + 'no relationship, same operator, same procurement nature');
      }
    }
  }
});

test('T4B: the In-tend tenants are modelled as separate institutions', () => {
  // The concrete case the rule above exists for. If these ever collapse back
  // into one record, two UN agencies have been silently deleted.
  const tenants = PLATFORMS.filter((r) => S.hostOf(r.officialUrl) === 'ungm.in-tend.co.uk');
  if (!tenants.length) return; // dataset may legitimately not carry them
  const operators = new Set(tenants.map((r) => r.operator));
  assert.strictEqual(operators.size, tenants.length,
    `${tenants.length} In-tend tenants but only ${operators.size} distinct operators`);
  for (const r of tenants) {
    assert.ok(r.officialUrl.includes('/'), `${r.id} has no tenant path`);
  }
});

test('T2A: every ecosystem member and its parent agree on the jurisdiction', () => {
  const byId = new Map(PLATFORMS.map((r) => [r.id, r]));
  const members = PLATFORMS.filter((r) => r.partOf);
  assert.ok(members.length > 0, 'no partOf links exist: this guard is vacuous');
  for (const r of members) {
    const parent = byId.get(r.partOf);
    assert.ok(parent, `${r.id} partOf dangles`);
    assert.strictEqual(r.country, parent.country,
      `${r.id} (${r.country}) claims membership of ${parent.id} (${parent.country})`);
  }
});

// ── Wave T2B: subnational integrity ─────────────────────────────────────────
// The wave's structural risk was pretending a US state is a country. The model
// answer was one optional ISO 3166-2 field, so these guards protect the three
// ways that field can lie and the one way the migration could have been
// non-additive.

const ISO = require('../lib/iso-3166-2.cjs');
const COUNTRY_ISO = new Map(countryList.map((c) => [
  typeof c === 'string' ? c : c.slug,
  typeof c === 'string' ? null : (c.iso2 || null),
]));
const problemsWithIso = (row) => S.problemsFor(row, COUNTRY_ISO);
const caughtIso = (row, field) => problemsWithIso(row).some(([f]) => f.includes(field));
const REGIONAL = PLATFORMS.filter((r) => r.subnationalJurisdiction);

test('T2B: every subdivision code is a real ISO 3166-2 code on the allowlist', () => {
  assert.ok(REGIONAL.length > 0, 'no coded records: these guards are vacuous');
  for (const r of REGIONAL) {
    assert.ok(ISO.isKnownCode(r.subnationalJurisdiction),
      `${r.id} carries ${r.subnationalJurisdiction}, which is not on the allowlist`);
  }
});

test('T2B: a subdivision always belongs to its record\'s own country', () => {
  for (const r of REGIONAL) {
    const want = COUNTRY_ISO.get(r.country);
    const got = ISO.countryOf(r.subnationalJurisdiction);
    if (!want) continue; // global / european-union have no alpha-2 to contradict
    assert.strictEqual(got, want,
      `${r.id} is in ${r.country} (${want}) but claims subdivision ${r.subnationalJurisdiction} (${got})`);
  }
});

test('T2B: only regional or municipal records name a subdivision', () => {
  for (const r of REGIONAL) {
    assert.ok(['regional', 'municipal'].includes(r.coverage),
      `${r.id} is "${r.coverage}" coverage yet names subdivision ${r.subnationalJurisdiction}`);
  }
  // And the converse direction that matters: a national system must not carry one.
  for (const r of PLATFORMS) {
    if (['supranational', 'national'].includes(r.coverage)) {
      assert.ok(!r.subnationalJurisdiction,
        `${r.id} is ${r.coverage} but carries ${r.subnationalJurisdiction}`);
    }
  }
});

test('T2B: the subnational field is optional — the model stayed additive', () => {
  // The migration promise was that adding this field forced zero rewrites on
  // records that predate it. Proven by construction: records without the field
  // must still validate.
  const without = PLATFORMS.filter((r) => !r.subnationalJurisdiction);
  assert.ok(without.length > 0, 'every record now has a subdivision: the optionality is untested');
  for (const r of without.slice(0, 20)) {
    assert.strictEqual(problemsWithIso(r).length, 0,
      `${r.id} fails validation without a subdivision code`);
  }
});

test('T2B MUTATION: California filed under Canada is caught', () => {
  const row = base();
  row.country = 'canada'; row.coverage = 'regional'; row.subnationalJurisdiction = 'US-CA';
  assert.ok(caughtIso(row, 'subnationalJurisdiction'), 'a US state under Canada survived');
});

test('T2B MUTATION: an invented or deprecated subdivision code is caught', () => {
  for (const code of ['US-ZZ', 'GB-EAW', 'XX-YY', 'california']) {
    const row = base();
    row.coverage = 'regional'; row.subnationalJurisdiction = code;
    assert.ok(caughtIso(row, 'subnationalJurisdiction'), `${code} survived`);
  }
});

test('T2B MUTATION: a subdivision on a national record is caught', () => {
  const row = base();
  row.coverage = 'national'; row.country = 'germany'; row.subnationalJurisdiction = 'DE-BE';
  assert.ok(caughtIso(row, 'subnationalJurisdiction'), 'a national system claiming a Land survived');
});

test('T2B MUTATION: a shared platform duplicated per state is caught', () => {
  // The pathology this wave was most exposed to: one supplier account, one
  // system, five rows because five states use it. Host identity is what
  // detects it, and it must fire even when the states differ.
  const shared = PLATFORMS[0];
  const a = { ...JSON.parse(JSON.stringify(shared)), id: 'dup-state-a', country: 'united-states', coverage: 'regional', subnationalJurisdiction: 'US-CA' };
  const b = { ...JSON.parse(JSON.stringify(shared)), id: 'dup-state-b', country: 'united-states', coverage: 'regional', subnationalJurisdiction: 'US-TX' };
  const file = path.join(require('node:os').tmpdir(), `tp-dupstate-${process.pid}.json`);
  fs.writeFileSync(file, JSON.stringify([a, b]));
  try {
    assert.throws(() => S.loadPlatforms(file, COUNTRY_ISO), /shares a host/,
      'one platform published once per state survived');
  } finally { fs.unlinkSync(file); }
});


// ── Wave T4: the multilateral layer is not a geography ──────────────────────
// T4 added UNGM, the World Bank, the regional development banks and the NATO
// agencies. The tempting shortcut was to file each under whichever country slug
// validated — the World Bank under united-states because it is headquartered in
// Washington, AIIB under china, NSPA under luxembourg. Each would be a false
// statement about who the buyer is and which law applies.
//
// No new field was needed. The shared geography file already marks its two
// non-country entries, "global" and "european-union", with
// entityType "supranational".

const SUPRANATIONAL_SLUGS = new Set(
  countryList.filter((c) => typeof c !== 'string' && c.entityType === 'supranational')
    .map((c) => c.slug));

test('T4: the geography file still distinguishes supranational entries', () => {
  // If this ever empties, the guard below silently stops protecting anything.
  assert.ok(SUPRANATIONAL_SLUGS.size >= 2,
    `expected supranational slugs in countries.json, found ${[...SUPRANATIONAL_SLUGS]}`);
  assert.ok(SUPRANATIONAL_SLUGS.has('global'));
});

test('T4: no supranational record is filed under a real country', () => {
  const supra = PLATFORMS.filter((r) => r.coverage === 'supranational');
  assert.ok(supra.length > 0, 'no supranational records: this guard is vacuous');
  for (const r of supra) {
    assert.ok(SUPRANATIONAL_SLUGS.has(r.country),
      `${r.id} claims supranational coverage but is filed under "${r.country}", a nation`);
  }
});

test('T4 MUTATION: a multilateral body filed under a nation is caught', () => {
  for (const c of ['united-states', 'china', 'luxembourg']) {
    const row = base();
    row.coverage = 'supranational'; row.country = c;
    assert.ok(caughtIso(row, 'country'), `a supranational record under ${c} survived`);
  }
});

test('T4 MUTATION: the legitimate supranational homes still validate', () => {
  // A guard that also rejects the correct case is not a guard, it is an outage.
  for (const c of ['global', 'european-union']) {
    const row = base();
    row.coverage = 'supranational'; row.country = c;
    assert.strictEqual(problemsWithIso(row).length, 0,
      `a supranational record on ${c} was wrongly rejected`);
  }
  // And a bilateral donor agency is institutional on its own country.
  const donor = base();
  donor.coverage = 'institutional'; donor.country = 'germany';
  assert.strictEqual(problemsWithIso(donor).length, 0, 'a national institutional record was rejected');
});
