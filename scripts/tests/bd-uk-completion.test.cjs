// scripts/tests/bd-uk-completion.test.cjs
'use strict';

// Wave 1C-3 completion added two registry types and six records. Both types
// exist because forcing a system into a neighbouring type would have stated
// something false about it:
//
//   public-procurement-notice-database — a system publishing procurement
//     NOTICES is not a register of suppliers. procurement-supplier-register
//     records who MAY bid; these record what is being bought. Calling one the
//     other inverts the meaning, which is why four UK systems and CanadaBuys
//     were held back as a classification blocker rather than misfiled.
//
//   registered-design-register — a design right is neither a trade mark nor a
//     patent. The type is added on its merits so official design registers have
//     an honest home, INDEPENDENTLY of whether any record uses it yet. A type
//     with no records is not a defect here; a record forced into the wrong type
//     would be.
//
// The Companies House pair is the other half: two genuinely distinct statutory
// systems on one official host, which is allowed only through resourceIdentity.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const S = require('../lib/bd-schema.cjs');
const T = require('../lib/bd-registry-types.cjs');
const { loadRegistry } = require('../lib/bd-registry.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const ALL = loadRegistry().directories;
const byId = new Map(ALL.map((r) => [r.id, r]));
const PROCUREMENT = ALL.filter((r) => r.registryTypes.includes('public-procurement-notice-database'));

// --- both new types are complete across enum, glossary and label ---------------

test('public-procurement-notice-database is complete and correctly bounded', () => {
  assert.ok(S.REGISTRY_TYPES.includes('public-procurement-notice-database'));
  const def = T.registryTypeDefinition('public-procurement-notice-database');
  assert.ok(def, 'the type has no glossary entry');
  assert.strictEqual(def.label, 'Public procurement notice database');
  assert.strictEqual(T.registryTypeLabel('public-procurement-notice-database'),
    'Public procurement notice database');
  assert.match(def.definition, /procurement opportunities, tender notices, contract award/);
  // The boundary against supplier registers is the whole reason the type exists.
  assert.match(def.boundary, /NOT a procurement-supplier-register/);
  assert.match(def.boundary, /not a commercial tender aggregator/i);
  assert.match(def.boundary, /not a generic government open-data portal/i);
  assert.match(def.boundary, /eligibility/i, 'the boundary must disclaim supplier eligibility');
  assert.ok(def.inclusion.length > 80 && def.examples.length >= 1);
});

test('registered-design-register is complete and distinguished from trade marks and patents', () => {
  assert.ok(S.REGISTRY_TYPES.includes('registered-design-register'));
  const def = T.registryTypeDefinition('registered-design-register');
  assert.ok(def, 'the type has no glossary entry');
  assert.strictEqual(def.label, 'Registered designs register');
  assert.strictEqual(T.registryTypeLabel('registered-design-register'), 'Registered designs register');
  assert.match(def.definition, /registered industrial designs/);
  assert.match(def.boundary, /Not a trademark-register and not a patent-register/);
  assert.match(def.boundary, /copyright/i);
  assert.ok(def.inclusion.length > 80 && def.examples.length >= 1);
});

test('the enum and the glossary stay the same size as each other', () => {
  assert.strictEqual(T.REGISTRY_TYPE_DEFINITIONS.length, S.REGISTRY_TYPES.length);
  const enumIds = new Set(S.REGISTRY_TYPES);
  for (const d of T.REGISTRY_TYPE_DEFINITIONS) {
    assert.ok(enumIds.has(d.id), `${d.id} is glossed but not in the enum`);
    assert.ok(d.label && d.definition && d.inclusion && d.boundary && Array.isArray(d.examples),
      `${d.id} has an incomplete glossary entry`);
  }
  for (const id of S.REGISTRY_TYPES) {
    assert.ok(T.REGISTRY_TYPE_BY_ID.has(id), `${id} is in the enum with no glossary entry`);
    assert.doesNotThrow(() => T.registryTypeLabel(id), `${id} has no display label`);
  }
});

test('a registry type with no records is allowed, but every record type is real', () => {
  // registered-design-register is deliberately unused: the UKIPO designs search
  // is behind a captcha and was not verifiable. The type is still correct.
  for (const r of ALL) {
    for (const t of r.registryTypes) {
      assert.ok(T.REGISTRY_TYPE_BY_ID.has(t), `${r.id} uses undefined type "${t}"`);
    }
  }
});

// --- the four UK procurement systems, plus CanadaBuys, Italy's PVL and TED ------

test('every procurement system is classified as a notice database, never as a supplier register', () => {
  const ids = ['gb-find-a-tender', 'gb-contracts-finder', 'gb-public-contracts-scotland',
    'gb-sell2wales', 'ca-canadabuys', 'it-pubblicita-legale-anac', 'eu-ted'];
  for (const id of ids) {
    const r = byId.get(id);
    assert.ok(r, `${id} is missing`);
    assert.strictEqual(r.primaryRegistryType, 'public-procurement-notice-database',
      `${id} does not lead with the procurement notice type`);
    assert.ok(!r.registryTypes.includes('procurement-supplier-register'),
      `${id} is classified as a supplier register, which inverts what it is`);
    assert.strictEqual(r.submissionModel, 'notApplicable', `${id} is ${r.submissionModel}`);
    // Each must say in published prose that it is not a supplier register.
    const prose = [r.description, ...r.cons, ...r.notRecommendedFor].join(' ');
    assert.match(prose, /not a supplier register|notice database, not a/i,
      `${id} never says it is not a supplier register`);
  }
  // Every record carrying the type must be in the checked set. Pinning an exact
  // count would break on each legitimate addition; pinning SET EQUALITY keeps the
  // guard honest — a new procurement record must be added here and checked, not
  // silently admitted.
  assert.deepStrictEqual(PROCUREMENT.map((r) => r.id).sort(), [...ids].sort(),
    'a record carries the procurement type without being covered by this guard');
});

test('no procurement record implies publication confers eligibility, award or trustworthiness', () => {
  for (const r of PROCUREMENT) {
    const published = [r.description, ...r.pros, ...r.bestFor].join(' ');
    assert.ok(!/\b(?:proves|guarantees|certifies|ensures|confirms)\b[^.]*\b(?:eligib|approved|compliant|trustworth|qualified)\b/i.test(published),
      `${r.id} implies publication confers eligibility or approval`);
    // And each must positively disclaim it.
    const caveats = [...r.cons, ...r.notRecommendedFor].join(' ');
    assert.match(caveats, /establishes nothing about|eligibility|standing/i,
      `${r.id} never disclaims what publication does not establish`);
  }
});

test('the procurement territories are exact and mutually consistent', () => {
  // Find a Tender is the UK-wide publication point; Contracts Finder follows the
  // extent of the regulations it implements, which excludes Scotland; the
  // devolved services cover one territory each. Getting any of these wrong would
  // tell a supplier to look in the wrong place.
  const fts = byId.get('gb-find-a-tender');
  assert.strictEqual(fts.scope, 'national');
  assert.strictEqual(fts.jurisdiction, null);
  // ...and it must disclose that Scottish coverage is not complete.
  assert.match([...fts.cons].join(' '), /Scotland/,
    'Find a Tender does not disclose its Scottish limitation');

  const cf = byId.get('gb-contracts-finder');
  assert.strictEqual(cf.scope, 'subnational');
  assert.strictEqual(cf.jurisdiction.type, 'cross-territory');
  assert.strictEqual(cf.jurisdiction.code, null);
  assert.deepStrictEqual(cf.jurisdiction.covers, ['GB-ENG', 'GB-NIR', 'GB-WLS'],
    'Contracts Finder must cover England, Wales and Northern Ireland, and not Scotland');
  assert.ok(!cf.jurisdiction.covers.includes('GB-SCT'), 'Contracts Finder must not claim Scotland');
  // It must not be presented as UK-wide.
  assert.ok(!/\bUnited Kingdom-wide\b|\bUK-wide\b/.test(cf.description),
    'Contracts Finder is described as UK-wide');

  assert.strictEqual(byId.get('gb-public-contracts-scotland').jurisdiction.code, 'GB-SCT');
  assert.strictEqual(byId.get('gb-sell2wales').jurisdiction.code, 'GB-WLS');

  const cb = byId.get('ca-canadabuys');
  assert.strictEqual(cb.country, 'canada');
  assert.strictEqual(cb.scope, 'national');
  assert.strictEqual(cb.jurisdiction, null);
});

test('the four UK procurement services are four distinct systems', () => {
  const ids = ['gb-find-a-tender', 'gb-contracts-finder', 'gb-public-contracts-scotland', 'gb-sell2wales'];
  const records = ids.map((id) => byId.get(id));
  const hosts = records.map((r) => S.normaliseDomain(r.website));
  assert.strictEqual(new Set(hosts).size, hosts.length, `procurement services share a host: ${hosts}`);
  for (let i = 0; i < records.length; i += 1) {
    for (let j = i + 1; j < records.length; j += 1) {
      assert.ok(S.urlsAreMateriallyDifferent(records[i].website, records[j].website),
        `${records[i].id} and ${records[j].id} point at the same place`);
    }
  }
});

test('CanadaBuys records why a prior rejection was reversed, and on what ground', () => {
  // Reversing a published editorial decision silently is how a dataset loses its
  // audit trail. The reversal must be classification-only and must say so.
  const cb = byId.get('ca-canadabuys');
  assert.match(cb.editorNotes, /reject/i, 'the reversal of the prior rejection is not recorded');
  assert.match(cb.editorNotes, /classification/i,
    'the record does not state that the reversal is a classification decision');
  // The original editorial standard must be reaffirmed, not weakened.
  assert.match([cb.editorNotes, ...cb.cons].join(' '), /not a supplier register/i,
    'the record does not reaffirm that it is still not a supplier register');
});

// --- Companies House shared host ------------------------------------------------

test('the disqualified directors register is a distinct system on a shared host', () => {
  const dq = byId.get('gb-companies-house-disqualified-directors');
  const ch = byId.get('gb-companies-house');
  assert.ok(dq && ch, 'a Companies House record is missing');

  // Same host, declared on both sides, with distinct system keys.
  assert.strictEqual(S.normaliseDomain(dq.website), S.normaliseDomain(ch.website));
  assert.strictEqual(dq.resourceIdentity.sharedHostGroup, 'companies-house-service');
  assert.strictEqual(ch.resourceIdentity.sharedHostGroup, 'companies-house-service');
  assert.notStrictEqual(dq.resourceIdentity.systemKey, ch.resourceIdentity.systemKey);
  assert.strictEqual(dq.resourceIdentity.canonicalDomain, ch.resourceIdentity.canonicalDomain);

  // Materially different destination, not a query-string variant.
  assert.ok(S.urlsAreMateriallyDifferent(dq.website, ch.website),
    'the disqualification search is not materially different from the company search');

  // Different function and different population.
  assert.strictEqual(dq.primaryRegistryType, 'exclusion-and-debarment-register');
  assert.strictEqual(ch.primaryRegistryType, 'company-register');
  assert.ok(!dq.registryTypes.includes('company-register'),
    'the disqualification register is classified as a company register');
});

test('the disqualification record never conflates itself with the company register', () => {
  const dq = byId.get('gb-companies-house-disqualified-directors');
  const prose = [dq.description, ...dq.cons, ...dq.notRecommendedFor].join(' ');
  // The three honesty points required of this record.
  assert.match(prose, /[Aa]bsence[^.]*does not prove|no longer a live restriction/,
    'absence is not disclaimed as proof a person was never disqualified');
  assert.match(prose, /does not describe every restriction|other registers hold other restrictions/i,
    'the record implies it describes every restriction');
  assert.match(prose, /separate systems|separate search|distinct/i,
    'the record does not separate company registration from director disqualification');
  // And the shared Domain Rating must be attributed to the domain, not the page.
  assert.match([...dq.cons].join(' '), /shared Companies House domain|dated measurement/i,
    'the reused Domain Rating is not attributed to the shared domain');
});

test('the reused Companies House snapshot measures nothing new', () => {
  const dq = byId.get('gb-companies-house-disqualified-directors');
  const ch = byId.get('gb-companies-house');
  assert.strictEqual(dq.domainRating, ch.domainRating);
  assert.deepStrictEqual(dq.metricsProvenance.domainRating, ch.metricsProvenance.domainRating);
  // POLICY REVERSAL: the Domain Rating collection freeze was lifted, so the
  // pinned status 'historicalSnapshot' and the pinned literal date '2026-08-04'
  // both died with it — this domain now carries a dated reading from Ahrefs'
  // free public endpoint. What those two pins protected is that neither record
  // INVENTS a figure, so both are put through the schema's own rule instead: a
  // whole number on the 0-100 scale, arriving with provenance that names the
  // provider, the date and the domain measured.
  assert.deepStrictEqual(S.domainRatingProblems(dq), [],
    'the disqualification register carries a rating that is off-scale or unprovenanced');
  assert.deepStrictEqual(S.domainRatingProblems(ch), [],
    'the company register carries a rating that is off-scale or unprovenanced');
  assert.strictEqual(dq.metricsProvenance.domainRating.measuredDomain, S.normaliseDomain(dq.website));
  assert.deepStrictEqual(S.sharedDomainSnapshotProblems(ALL), []);
  // The dataset must still hold exactly one measurement per measured domain.
  const measured = ALL.filter((r) => r.domainRating !== null);
  const domains = new Set(measured.map((r) => r.metricsProvenance.domainRating.measuredDomain));
  // POLICY REVERSAL: the pin of 64 measured domains WAS the freeze — it counted
  // the hand-measured set that was being held still, and every domain in the
  // corpus has since been read. The invariant behind it is that one domain holds
  // one reading, which sharedDomainSnapshotProblems asserts above. What is
  // checked here instead is that measured domains are strictly fewer than
  // measuring records, so the repetition this test is named for is genuinely
  // exercised by shipped data rather than asserted into thin air.
  assert.ok(domains.size > 0, 'no domain in the dataset carries a reading at all');
  assert.ok(measured.length > domains.size, 'reuse is not actually exercised in the shipped data');
});

test('every procurement record carries a real rating, measured on its own domain', () => {
  // POLICY REVERSAL: this test used to require domainRating null, metricStatus
  // 'unknown' and an empty metricsProvenance on all five records, because
  // Domain Rating collection was frozen. The freeze is lifted — Ahrefs'
  // /v3/public/domain-rating-free endpoint costs nothing and needs no paid plan,
  // and every domain in the corpus has been read through it — so "carries no
  // rating" is no longer the thing worth guarding. The two things that are: a
  // rating is never INVENTED, and it describes the record's OWN domain rather
  // than a neighbouring or parent one.
  for (const id of ['gb-find-a-tender', 'gb-contracts-finder', 'gb-public-contracts-scotland',
    'gb-sell2wales', 'ca-canadabuys']) {
    const r = byId.get(id);
    assert.deepStrictEqual(S.domainRatingProblems(r), [],
      `${id} carries a Domain Rating that is off-scale or missing its provenance`);
    assert.strictEqual(r.metricsProvenance.domainRating.measuredDomain, S.normaliseDomain(r.website),
      `${id} reports a rating measured on a domain that is not its own`);
  }
  // Missing is still not zero — but the corpus no longer holds an unmeasured
  // record to demonstrate it with, so the shapes that must stay distinguishable
  // are held against fixtures rather than dropped. These are record-shaped
  // objects built here, not entries in the dataset.
  const provenance = {
    provider: 'Ahrefs', measuredAt: '2026-08-19', status: 'publicApiReading', measuredDomain: 'example.gov.uk',
  };
  assert.deepStrictEqual(S.domainRatingProblems({ domainRating: null, metricsProvenance: {} }), [],
    'an unmeasured record — no rating and no provenance — is no longer a legal shape');
  assert.deepStrictEqual(S.domainRatingProblems({ domainRating: 0, metricsProvenance: { domainRating: provenance } }), [],
    'a measured 0 is refused, which would leave an absence no way to be published except as a zero');
  assert.ok(S.domainRatingProblems({ domainRating: 72, metricsProvenance: {} }).length > 0,
    'a bare number with no provenance is accepted, which is exactly what an invented metric looks like');
  assert.ok(S.domainRatingProblems({ domainRating: null, metricsProvenance: { domainRating: provenance } }).length > 0,
    'provenance is accepted for a rating that is not set');
});

// --- publication surface ---------------------------------------------------------

test('no internal identifier reaches a published page', () => {
  const targets = ['gb-companies-house-disqualified-directors', 'gb-companies-house',
    'gb-find-a-tender', 'gb-contracts-finder', 'ca-canadabuys'];
  for (const id of targets) {
    const r = byId.get(id);
    const file = path.join(ROOT, 'research/business-directories', r.country, r.slug, 'index.html');
    assert.ok(fs.existsSync(file), `${id} has no detail page`);
    const html = fs.readFileSync(file, 'utf8');
    for (const secret of ['systemKey', 'sharedHostGroup', 'canonicalDomain',
      r.resourceIdentity ? r.resourceIdentity.systemKey : null,
      r.resourceIdentity ? r.resourceIdentity.sharedHostGroup : null]) {
      if (!secret) continue;
      assert.ok(!html.includes(secret), `${id} page exposes internal identifier "${secret}"`);
    }
    // Nor may the raw registry-type slug leak; the label is what a reader sees.
    assert.ok(!html.includes('public-procurement-notice-database'),
      `${id} page renders a raw registry type slug`);
  }
});

test('procurement records show their type label and carry no bespoke route', () => {
  for (const r of PROCUREMENT) {
    const file = path.join(ROOT, 'research/business-directories', r.country, r.slug, 'index.html');
    const html = fs.readFileSync(file, 'utf8');
    assert.ok(html.includes('Public procurement notice database'),
      `${r.id} page does not display the registry type label`);
    assert.ok(html.includes(r.operator.name), `${r.id} page does not name its operator`);
  }
  // No procurement-specific route family may exist.
  for (const country of ['united-kingdom', 'canada']) {
    const dir = path.join(ROOT, 'research/business-directories', country);
    const slugs = new Set(ALL.filter((r) => r.country === country).map((r) => r.slug));
    for (const name of fs.readdirSync(dir)) {
      if (!fs.statSync(path.join(dir, name)).isDirectory()) continue;
      if (name === 'categories') continue;
      assert.ok(slugs.has(name), `unexpected route /${country}/${name}/`);
    }
  }
});
