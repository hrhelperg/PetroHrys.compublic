'use strict';
// Wave 3A-3 — Poland, Italy and Spain professional registers.
//
// Two themes carry over from Waves 3A-1 and 3A-2 and are pinned here:
//
//   1. The national interface is rarely the legal source of record. Polish
//      chambers aggregate 16-19 regional bodies; the Italian rolls are filled by
//      131 territorial Ordini or by the notaries themselves.
//   2. A register is not split by its own filters, and a publication derived
//      from a register is not a second register.
//
// The wave-specific risk is different, though: these registers record STATUS
// distinctions that are easy to flatten. A Polish legal adviser may be entered
// but not practising; a Polish advocate is a different profession entirely; the
// Polish auditor register excludes firms. Flattening any of those turns a true
// record into a misleading one.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { loadRegistry } = require('../lib/bd-registry.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const ALL = loadRegistry().directories;
const byId = new Map(ALL.map((r) => [r.id, r]));

const WAVE = ['pl-kirp-lista-radcow-prawnych', 'pl-pibr-rejestr-bieglych-rewidentow',
  'pl-kidp-lista-doradcow-podatkowych', 'it-cndcec-albo-nazionale',
  'it-notariato-albo-unico-notai', 'es-icac-roac'];
const NEW = WAVE.map((id) => byId.get(id));

const visible = (r) => [r.description, ...r.pros, ...r.cons, ...r.bestFor, ...r.notRecommendedFor].join(' \n ');
const hostOf = (u) => new URL(u).hostname.replace(/^www\./, '');

test('every record this wave claims to have published exists', () => {
  for (const id of WAVE) assert.ok(byId.get(id), `missing record ${id}`);
  assert.strictEqual(ALL.filter((r) => r.country === 'poland').length, 8);
  assert.strictEqual(ALL.filter((r) => r.country === 'italy').length, 7);
  assert.strictEqual(ALL.filter((r) => r.country === 'spain').length, 10); // +2 Wave 4 telecoms
});

// ── The national interface is not the legal source of record ────────────────
const AGGREGATORS = {
  'pl-kirp-lista-radcow-prawnych': /nineteen regional chambers|regional chambers/i,
  'it-cndcec-albo-nazionale': /territorial Ordini/i,
  'it-notariato-albo-unico-notai': /territorial Ordini/i,
};

test('an aggregating interface says where the register is actually kept', () => {
  for (const [id, re] of Object.entries(AGGREGATORS)) {
    assert.ok(re.test(visible(byId.get(id))),
      `${id} does not tell a reader that the underlying register is kept elsewhere`);
  }
});

// ── Status distinctions that must not be flattened ──────────────────────────
// Each entry: a fact the register actually records, which a careless edit would
// erase and which a reader would then get wrong.
const STATUS_TRUTHS = {
  'pl-kirp-lista-radcow-prawnych': [
    [/do not practise|non-practising|not currently practising/i,
      'that the list includes members who do not practise'],
    [/adwokaci|advocates? \(adwokaci\)|Polish advocates/i,
      'that Polish advocates are a separate profession with their own register'],
    [/trainees|foreign lawyers/i,
      'that trainees and foreign lawyers are on separate lists'],
  ],
  'pl-pibr-rejestr-bieglych-rewidentow': [
    [/individual auditors only|Firms are kept on a separate list|audit firms are kept/i,
      'that audit firms are kept on a separate list'],
  ],
  'pl-kidp-lista-doradcow-podatkowych': [
    [/condition of performing|required to perform tax advisory/i,
      'that entry is the statutory condition of performing tax advisory activities'],
    [/50,000 z|Article 81/i,
      'that unauthorised practice carries a statutory penalty'],
    [/PDF|downloadable/i,
      'that entitled entities are published separately as a download'],
  ],
  'it-notariato-albo-unico-notai': [
    [/D\.P\.R\. 137|Presidential Decree 137/i, 'the statutory basis of the roll'],
    [/not to enter the notary|NOT to enter the notary/i,
      'that the search is not a name-verification tool'],
    [/marketing/i, 'that marketing use of the data is a pursuable offence'],
    [/cannot make changes|cannot alter/i,
      'that the national council cannot correct entries itself'],
  ],
};

test('status distinctions survive in rendered prose', () => {
  for (const [id, checks] of Object.entries(STATUS_TRUTHS)) {
    const v = visible(byId.get(id));
    for (const [re, what] of checks) {
      assert.ok(re.test(v), `${id} no longer tells a reader ${what}`);
    }
  }
});

test('the two Polish legal professions are never conflated', () => {
  const kirp = byId.get('pl-kirp-lista-radcow-prawnych');
  // It must be about legal advisers, and it must say advocates are elsewhere.
  assert.match(kirp.description, /legal advisers|radcowie prawni/i);
  assert.ok(!/^The national (list|register) of Polish (lawyers|advocates)/i.test(kirp.description),
    'the legal advisers list is described as covering Polish lawyers generally');
  const limits = [...kirp.cons, ...kirp.notRecommendedFor].join(' ');
  assert.match(limits, /Absence here does not establish|do not appear here/i,
    'a reader is never told that absence does not settle whether someone may act as a lawyer');
});

// ── A register is not split by its filters ──────────────────────────────────
test('the Italian national roll is one record, not three searches', () => {
  const onHost = ALL.filter((r) => hostOf(r.website) === 'commercialisti.it');
  assert.strictEqual(onHost.length, 1, 'commercialisti.it must carry exactly one record');
  assert.match(visible(onHost[0]), /views of one roll|three views/i,
    'the record does not explain that the three searches are views of one roll');
});

test('the Spanish auditor register is one record and its Art. 16.3a listing is not a second', () => {
  const onHost = ALL.filter((r) => hostOf(r.website) === 'icac.gob.es');
  assert.strictEqual(onHost.length, 1, 'icac.gob.es must carry exactly one record');
  assert.match(visible(onHost[0]), /16\.3a/i,
    'the record does not disclose that a separate selection-procedure listing exists');
  assert.match(visible(onHost[0]), /publication derived from the register|not searched here/i,
    'the record does not explain that the listing is a publication rather than a register');
});

test('the Polish auditor register is one record and does not absorb the firm list', () => {
  const onHost = ALL.filter((r) => hostOf(r.website) === 'pibr.org.pl');
  assert.strictEqual(onHost.length, 1, 'pibr.org.pl must carry exactly one record');
  assert.match(byId.get('pl-pibr-rejestr-bieglych-rewidentow').editorNotes,
    /was NOT published in this wave/i,
    'the editor notes do not record why the audit firm list was not published');
});

// ── What inclusion and absence do not prove ─────────────────────────────────
test('every record states what inclusion does not prove', () => {
  for (const r of NEW) {
    const limits = [...r.cons, ...r.notRecommendedFor].join(' ');
    assert.ok(/not a statement|says nothing about|(?:does|do) not establish|not verified statements/i.test(limits),
      `${r.id} never says what inclusion does not prove`);
  }
});

test('every record states what absence does not prove', () => {
  for (const r of NEW) {
    const limits = [...r.cons, ...r.notRecommendedFor].join(' ');
    assert.ok(/absen|does not imply|do not appear here/i.test(limits),
      `${r.id} never says what absence does not prove`);
  }
});

test('every record says what entry actually permits', () => {
  for (const r of NEW) {
    assert.ok(/required to practise|required to perform|required to carry out|required to use|condition of performing|licence register/i.test(visible(r)),
      `${r.id} never states what entry actually permits`);
  }
});

// ── Access ──────────────────────────────────────────────────────────────────
test('access reflects what was observed and nothing more', () => {
  for (const r of NEW) {
    const a = r.publicAccess;
    assert.strictEqual(a.loginRequired, false, `${r.id} did not record the anonymous load`);
    assert.strictEqual(a.searchUrl, null, `${r.id} asserts a search URL that was never exercised`);
    for (const k of ['identityVerificationRequired', 'captcha', 'geographicRestriction', 'paidDocumentsAvailable']) {
      assert.strictEqual(a[k], null, `${r.id} claims ${k} without observing it`);
    }
    if (a.freeToSearch === true) {
      assert.match(a.notes, /result rows were rendered/i,
        `${r.id} claims free search without recording that results were seen`);
    }
  }
  // Exactly the two Polish server-rendered lists showed results.
  assert.deepStrictEqual(NEW.filter((r) => r.publicAccess.freeToSearch === true).map((r) => r.id).sort(),
    ['pl-kirp-lista-radcow-prawnych', 'pl-pibr-rejestr-bieglych-rewidentow']);
});

test('a gate in front of the search is disclosed to the reader', () => {
  // KIDP cannot be searched without acknowledging its privacy policy. That is a
  // real barrier and belongs in rendered prose, not only in access notes, which
  // record pages do not render.
  assert.match(visible(byId.get('pl-kidp-lista-doradcow-podatkowych')),
    /privacy policy/i,
    'the tax adviser record hides its pre-search acknowledgement from readers');
});

// ── Metrics ─────────────────────────────────────────────────────────────────
test('no new record carries a metric and the frozen snapshot is untouched', () => {
  for (const r of NEW) {
    assert.strictEqual(r.domainRating, null, `${r.id} carries a Domain Rating`);
    assert.deepStrictEqual(r.metricsProvenance, {}, `${r.id} invented metrics provenance`);
  }
  const domains = new Set();
  for (const r of ALL) {
    const p = r.metricsProvenance && r.metricsProvenance.domainRating;
    if (p && p.measuredDomain) domains.add(p.measuredDomain);
  }
  assert.strictEqual(domains.size, 64, 'the frozen measurement set changed size');
});

// ── Rendered prose, not editor notes ────────────────────────────────────────
test('critical caveats are visible, not hidden in editor notes', () => {
  for (const r of NEW) {
    const html = fs.readFileSync(
      path.join(ROOT, 'research', 'business-directories', r.country, r.slug, 'index.html'), 'utf8');
    const body = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    assert.ok(!body.includes('FOUR ROLES, determined separately'), `${r.id} page publishes the editor notes`);
    for (const con of r.cons) {
      const probe = con.replace(/\s+/g, ' ').slice(0, 40);
      assert.ok(body.includes(probe), `${r.id} limitation does not reach the rendered page: ${probe}`);
    }
  }
});

test('every record documents the four roles separately', () => {
  for (const r of NEW) {
    for (const role of ['LEGAL SOURCE OF RECORD:', 'RESPONSIBLE AUTHORITY:',
      'TECHNICAL PLATFORM:', 'PUBLIC ACCESS INTERFACE:']) {
      assert.ok(r.editorNotes.includes(role), `${r.id} does not determine ${role}`);
    }
  }
});

test('every operator is a public body, not a trade association', () => {
  for (const r of NEW) {
    assert.ok(['public-law-body', 'government-agency', 'regulator', 'ministry'].includes(r.operator.type),
      `${r.id} names a ${r.operator.type} as operator of a statutory register`);
  }
});
