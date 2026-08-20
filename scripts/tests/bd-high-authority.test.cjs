'use strict';
// High-authority expansion wave — three records and two corrections.
//
// The corrections matter more than the additions. Two published German records
// asserted that no operator claims one submission reaches the others. DTM
// Deutsche Tele Medien's entry service says precisely that. And two earlier
// REJECTIONS were reversed here — but only one of them legitimately:
//
//   Das Örtliche  reversed. Its failure was "business surface unreachable,
//                 marketing site 410 Gone". The entry service is now live and
//                 documented, so the reason no longer holds.
//   Firmy.net     reversed. Its failure was "operator unidentified, add flow a
//                 javascript handler, cost undocumented". All three resolved.
//   Marktplatz    NOT reversed. Its failure was undocumented profile
//     Mittelstand provenance, and this wave established an operator and a
//                 registration route but never that. A rejection may only be
//                 reversed by resolving the reason it was made.
//
// That last line is what this file mostly defends.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const S = require('../lib/bd-schema.cjs');
const { loadRegistry } = require('../lib/bd-registry.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const ALL = loadRegistry().directories;
const byId = new Map(ALL.map((r) => [r.id, r]));
const WAVE = ['de-das-oertliche', 'pl-firmy-net', 'global-provenexpert'];
const NEW = WAVE.map((id) => byId.get(id));
const visible = (r) => [r.description, ...r.pros, ...r.cons, ...r.bestFor, ...r.notRecommendedFor].join(' \n ');
const limitsOf = (r) => [...r.cons, ...r.notRecommendedFor].join(' ');
const hostOf = (u) => new URL(u).hostname.replace(/^www\./, '');

test('every record this wave claims to have published exists', () => {
  assert.strictEqual(WAVE.length, 3, 'the wave manifest changed size without this test changing');
  for (const id of WAVE) assert.ok(byId.get(id), `missing record ${id}`);
});

// ── a rejection may only be reversed by resolving its stated reason ─────────
test('Marktplatz Mittelstand stays rejected because its reason is unresolved', () => {
  assert.ok(!byId.get('de-marktplatz-mittelstand'), 'Marktplatz Mittelstand was published');
  assert.ok(!ALL.find((r) => hostOf(r.website) === 'marktplatz-mittelstand.de'),
    'marktplatz-mittelstand.de was published; profile provenance is still undocumented');
});

test('the two reversed rejections each record the reason that was resolved', () => {
  assert.match(byId.get('pl-firmy-net').editorNotes, /EARLIER WAVE CORRECTED/,
    'the Firmy.net record does not record what changed since its rejection');
  assert.match(byId.get('de-das-oertliche').editorNotes, /CORRECTION TO AN EARLIER WAVE/,
    'the Das Örtliche record does not record what changed since its rejection');
});

// ── the shared-entry correction ─────────────────────────────────────────────
test('the German shared-entry correction survives on both older records', () => {
  for (const id of ['de-gelbe-seiten', 'de-das-telefonbuch']) {
    const n = byId.get(id).editorNotes;
    assert.match(n, /CORRECTED 2026-08-06/, `${id} lost its shared-entry correction`);
    assert.match(n, /DTM Deutsche Tele Medien/,
      `${id} no longer names the operator whose service disproved the old claim`);
    // The old, now-false claim must be gone.
    assert.ok(!/No operator states that one submission produces entries in the others\./.test(n),
      `${id} still carries the claim DTM's entry service disproves`);
  }
  // And the three stay three records, not one.
  for (const id of ['de-gelbe-seiten', 'de-das-telefonbuch', 'de-das-oertliche']) {
    assert.ok(byId.get(id), `${id} was collapsed away`);
  }
  assert.match(byId.get('de-das-oertliche').editorNotes, /A shared submission form is not the same as a shared listing identity/,
    'the reason the three stay separate is no longer recorded');
});

test('readers are told the submission reaches three directories', () => {
  assert.match(visible(byId.get('de-das-oertliche')), /Das Telefonbuch, Gelbe Seiten und Das Örtliche/,
    'readers are never told one submission publishes to three directories');
});

// ── Domain Rating is never invented ─────────────────────────────────────────
// POLICY REVERSAL (2026-08-19). The Domain Rating freeze was lifted by the
// repository owner: it had been written against the plan-gated Site Explorer
// endpoint, while /v3/public/domain-rating-free costs nothing and needs only a
// free key. Every record in this registry, these three included, now carries
// a reading. The four assertions that pinned the freeze — domainRating null,
// metricsProvenance {}, metricStatus 'unknown', and the 64-domain / 67-record
// frozen totals — state the opposite of the fact and are replaced by what they
// were actually protecting: a rating is never INVENTED, and it describes the
// record's OWN domain.
test('no new record invents a Domain Rating', () => {
  for (const r of NEW) {
    // domainRatingProblems is the invention guard: it demands the 0-100 scale
    // AND provenance naming the provider, the date and the domain measured, so
    // a bare number with no provenance cannot pass it.
    assert.deepStrictEqual(S.domainRatingProblems(r), [],
      `${r.id} carries a Domain Rating that is not fully evidenced`);
    assert.strictEqual(r.metricsProvenance.domainRating.measuredDomain,
      S.normaliseDomain(r.website),
      `${r.id} reports a rating measured on a domain that is not its own`);
    // The absence rule survives, gated rather than deleted: where a record has
    // no rating the limitation must still say so, so a reader never sees a
    // blank. None of these three is unmeasured now, so the branch is inert
    // here and the rule is proved on a fixture below instead.
    if (r.domainRating === null || r.domainRating === undefined) {
      assert.match(limitsOf(r), /No Domain Rating is published for this platform/,
        `${r.id} does not tell a reader why no metric is shown`);
    }
  }
  // One measured domain has one dated reading. Records that share a domain
  // repeat it verbatim rather than each carrying a figure of its own.
  assert.deepStrictEqual(S.sharedDomainSnapshotProblems(ALL), [],
    'records sharing a measured domain disagree about its reading');
  // Missing is still not zero. The corpus no longer holds an unmeasured record,
  // so FIXTURES stand in for the two cases the frozen totals used to cover.
  assert.deepStrictEqual(S.domainRatingProblems({ domainRating: null, metricsProvenance: {} }), [],
    'an absent rating is now reported as a fault; absence must stay legal');
  assert.ok(S.domainRatingProblems({ domainRating: 0, metricsProvenance: {} }).length > 0,
    'a zero with no provenance passed; that is what "missing rendered as 0" looks like');
  assert.ok(S.domainRatingProblems({ domainRating: 76, metricsProvenance: {} }).length > 0,
    'a bare number with no provenance passed; that is what an invented rating looks like');
});

// ── cost truth ──────────────────────────────────────────────────────────────
test('cost is evidenced, and a trial is never treated as a free tier', () => {
  assert.strictEqual(byId.get('de-das-oertliche').submissionModel, 'free');
  assert.strictEqual(byId.get('pl-firmy-net').submissionModel, 'free');
  const pe = byId.get('global-provenexpert');
  assert.strictEqual(pe.submissionModel, 'freemium');
  assert.match(limitsOf(pe), /A trial is not a free tier/,
    'the ProvenExpert record does not separate the 30-day trial from the free tier');
  assert.match(pe.editorNotes, /explicitly NOT treated as evidence of a free tier/,
    'the trial-versus-free-tier decision is no longer recorded');
  // Two records require an account; neither may derive cost from that.
  for (const id of ['pl-firmy-net', 'global-provenexpert']) {
    assert.strictEqual(byId.get(id).registrationRequired, true, `${id} no longer records the account requirement`);
  }
});

// ── no unsupported outcome claims, including the operators' own ─────────────
test('operator marketing claims are quoted, never adopted', () => {
  const FORBIDDEN = /\b(?:dofollow|nofollow)\b|guaranteed (?:backlink|traffic|ranking|indexing|leads?)|will rank|boost your seo/i;
  for (const r of NEW) {
    for (const field of [r.description, ...r.pros, ...r.bestFor]) {
      assert.ok(!FORBIDDEN.test(field), `${r.id} makes an unestablished SEO claim: ${field}`);
    }
    assert.strictEqual(r.backlinkType, null, `${r.id} asserts a link attribute`);
    assert.strictEqual(r.indexed, null, `${r.id} asserts indexing`);
    assert.match(limitsOf(r), /No ranking, indexing, traffic or lead outcome is asserted/,
      `${r.id} does not disown outcome claims`);
  }
  // Firmy.net promises search positions; ProvenExpert markets Google indexing.
  // Both must appear as disowned claims, not as this platform's assertions.
  assert.match(byId.get('pl-firmy-net').editorNotes, /MARKETING CLAIM NOT ADOPTED/,
    'the Firmy.net ranking claim is no longer disowned');
  assert.match(limitsOf(byId.get('global-provenexpert')), /is NOT adopted here/,
    'the ProvenExpert indexing claim is no longer disowned');
});

// ── duplicate control ───────────────────────────────────────────────────────
test('no global platform gained a country duplicate', () => {
  const globalHosts = new Set(ALL.filter((r) => r.country === 'global').map((r) => hostOf(r.website)));
  for (const r of ALL.filter((x) => x.country !== 'global')) {
    assert.ok(!globalHosts.has(hostOf(r.website)),
      `${r.id} duplicates a global record on host ${hostOf(r.website)}`);
  }
  // ProvenExpert is stored once, as global, despite a German-speaking home market.
  const pe = ALL.filter((r) => hostOf(r.website) === 'provenexpert.com');
  assert.strictEqual(pe.length, 1, 'ProvenExpert has more than one record');
  assert.strictEqual(pe[0].country, 'global');
  assert.strictEqual(byId.get('pl-firmy-net').operator.name, 'NNV Sp. z o.o.');
  assert.notStrictEqual(byId.get('pl-firmy-net').operator.name, byId.get('pl-panorama-firm').operator.name,
    'Firmy.net was merged with the WeNet properties on ownership grounds');
});

// ── contract ────────────────────────────────────────────────────────────────
test('every record meets the commercial publication contract', () => {
  for (const r of NEW) {
    assert.ok(!S.isGovernmentPillar(r), `${r.id} landed in the Government Registry pillar`);
    assert.deepStrictEqual(r.registryTypes, [], `${r.id} claims a registry type`);
    assert.strictEqual(r.publicAccess, null, `${r.id} carries a statutory access block`);
    assert.ok(r.operator && r.operator.name.trim().length > 2, `${r.id} has no operator`);
    assert.match(r.operator.name, /\b(?:GmbH|AG|Ltd|Limited|Inc\.?)\b|Sp\. z o\.o\./,
      `${r.id} operator "${r.operator.name}" does not read as a legal entity`);
    assert.ok(r.submissionUrl && r.submissionUrl.startsWith('https://'), `${r.id} has no submission route`);
    assert.strictEqual(r.nextVerification, S.nextVerificationFor(r), `${r.id} date was hand-set`);
    assert.strictEqual(S.computeScore(r.scoreFactors), r.petroHrysScore, `${r.id} score does not reproduce`);
    assert.match(r.editorNotes, /re-verified in a separate direct pass/, `${r.id} records no second pass`);
    for (const role of ['PLATFORM OPERATOR:', 'LISTING CONTROL:', 'MODERATION AUTHORITY:', 'PUBLIC INTERFACE:']) {
      assert.ok(r.editorNotes.includes(role), `${r.id} does not determine ${role}`);
    }
  }
});

test('the listing block renders and editor notes do not', () => {
  for (const r of NEW) {
    const body = fs.readFileSync(
      path.join(ROOT, 'research', 'business-directories', r.country, r.slug, 'index.html'), 'utf8')
      .replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
      .replace(/&#8217;/g, '’').replace(/\s+/g, ' ');
    assert.ok(body.includes('Create a listing'), `${r.id} does not render its listing action`);
    for (const leak of ['PLATFORM OPERATOR:', 'DUPLICATE DECISION', 'NOT ASSERTED',
      'COST DECISION', 'CORRECTION TO AN EARLIER WAVE', 'EARLIER WAVE CORRECTED',
      'MARKETING CLAIM NOT ADOPTED', 'DOMAIN RATING:']) {
      assert.ok(!body.includes(leak), `${r.id} page publishes the editor note "${leak}"`);
    }
    for (const con of r.cons) {
      const probe = con.replace(/\s+/g, ' ').slice(0, 40);
      assert.ok(body.includes(probe), `${r.id} limitation does not reach the page: ${probe}`);
    }
  }
});
