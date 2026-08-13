// scripts/tests/bd-australia.test.cjs
'use strict';

// Australia is the first country in the dataset where the obvious mistake is a
// factual one rather than a structural one: company registration is FEDERAL,
// through ASIC, and there are no state company registers. A state record that
// implied otherwise would be wrong about Australian law, not merely misfiled.
//
// The state and territory records here are incorporated-association registers
// (bodies with no ACN that ASIC does not register at all) and occupational
// licensing registers (state-issued licences ASIC has no role in). These tests
// hold that boundary, the ACT/NT territory classification, and the rule that no
// ASIC Connect view is duplicated.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const S = require('../lib/bd-schema.cjs');
const ISO = require('../lib/iso-3166-2.cjs');
const T = require('../lib/bd-registry-types.cjs');
const c = require('../lib/bd-components.cjs');
const order = require('../../js/bd-order.js');
const discovery = require('../../js/bd-discovery.js');
const { loadRegistry } = require('../lib/bd-registry.cjs');
const { createDocument } = require('./helpers/mini-dom.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const AU = loadRegistry().directories.filter((r) => r.country === 'australia');
// Wave 1B.9 put commercial directories in Australia for the first time. This file
// is about STATUTORY REGISTERS: it asserts registry types, notApplicable
// submission and a populated publicAccess block, none of which a commercial
// platform has or should have. REG is the set those assertions apply to. The
// prose guards below deliberately keep sweeping AU, because "do not claim a
// listing proves trustworthiness" is if anything more important for a commercial
// platform than for a register.
const REG = AU.filter((r) => S.isGovernmentPillar(r));
const SUB = REG.filter((r) => r.jurisdiction);
const FEDERAL = REG.filter((r) => !r.jurisdiction);
const PAGE = fs.readFileSync(path.join(ROOT, 'research/business-directories/australia/index.html'), 'utf8');
const CLIENT = fs.readFileSync(path.join(ROOT, 'js/business-directories.js'), 'utf8');

// --- shape ------------------------------------------------------------------

test('the wave produced a real Australian subnational layer', () => {
  assert.ok(AU.length >= 12, `only ${AU.length} Australian records`);
  assert.ok(SUB.length >= 8, `only ${SUB.length} subnational records`);
  assert.ok(FEDERAL.length >= 3, `only ${FEDERAL.length} federal records`);
});

test('every Australian subdivision code is real and belongs to Australia', () => {
  const VALID = new Set(['AU-NSW', 'AU-VIC', 'AU-QLD', 'AU-WA', 'AU-SA', 'AU-TAS', 'AU-ACT', 'AU-NT']);
  for (const r of SUB) {
    const j = r.jurisdiction;
    assert.strictEqual(S.iso3166_2Problem(j.code), null, `${r.id} code ${j.code} is malformed`);
    assert.strictEqual(ISO.unknownCodeProblem(j.code), null, `${r.id} code ${j.code} is not a real code`);
    assert.ok(VALID.has(j.code), `${r.id} uses ${j.code}, which is not an Australian state or territory`);
    assert.strictEqual(j.parentCountry, 'australia');
    assert.strictEqual(r.scope, 'subnational');
    assert.strictEqual(j.covers, null, `${r.id} carries covers; no Australian jurisdiction spans subdivisions`);
  }
});

test('the ACT and the Northern Territory are territories, not states', () => {
  // Getting this wrong is the classic Australian error, and it would put them
  // in the wrong group on the country page.
  const byCode = new Map(SUB.map((r) => [r.jurisdiction.code, r]));
  for (const code of ['AU-ACT', 'AU-NT']) {
    const r = byCode.get(code);
    if (!r) continue;
    assert.strictEqual(r.jurisdiction.type, 'territory',
      `${r.id} classifies ${code} as "${r.jurisdiction.type}"`);
    assert.strictEqual(ISO.subdivision(code).category, 'Territory',
      `${code} is not an ISO Territory`);
  }
  for (const code of ['AU-NSW', 'AU-VIC', 'AU-QLD', 'AU-WA', 'AU-SA', 'AU-TAS']) {
    const r = byCode.get(code);
    if (!r) continue;
    assert.strictEqual(r.jurisdiction.type, 'state', `${r.id} classifies ${code} as a non-state`);
  }
});

// --- the Australian factual boundary ----------------------------------------

test('no state or territory record claims to be a company register', () => {
  // Company registration in Australia is federal. A state company register does
  // not exist, and typing one would assert a system that has no counterpart in
  // Australian law.
  for (const r of SUB) {
    assert.ok(!r.registryTypes.includes('company-register'),
      `${r.id} is typed company-register, but Australian company registration is federal`);
    assert.notStrictEqual(r.primaryRegistryType, 'company-register', r.id);
  }
});

test('every state record says what it covers that ASIC does not', () => {
  for (const r of SUB) {
    const prose = [r.description, ...r.pros, ...r.cons, r.editorNotes].join(' ');
    assert.match(prose, /ASIC|company registration|incorporated association|licence|licensing/i,
      `${r.id} never distinguishes itself from federal registration`);
  }
});

// A negator makes a sentence a DISCLAIMER of the thing, not a claim of it.
// "A website link is conditional, not guaranteed" is the sentence this platform
// should be printing; a guard that fails on it is punishing the right answer.
const NEGATED = /\b(?:no|not|never|nor|neither|without|cannot|can’t|can't|does not|do not|is not|are not|none|nothing)\b/i;

test('nothing implies a state registration substitutes for ASIC, or that a licence proves trustworthiness', () => {
  for (const r of AU) {
    const sentences = [r.description, ...r.pros, ...r.cons, ...r.bestFor, ...r.notRecommendedFor,
      (r.publicAccess || {}).notes || '']
      .flatMap((v) => v.split(/(?<=[.!?])\s+/));
    // Each of these would be a false statement about Australian law or a claim
    // the register cannot support.
    for (const [pattern, why, negatable] of [
      [/replaces ASIC|instead of ASIC|substitute for ASIC registration/i, 'implies it replaces ASIC', false],
      [/proves? (?:the )?(?:business|company|entity) is (?:trustworthy|reputable|solvent)/i, 'reads a licence as trustworthiness', true],
      [/an ABN (?:proves|establishes|confirms) (?:active )?company registration/i, 'reads an ABN as company registration', false],
      [/guarantee[sd]?\b/i, 'guarantees something', true],
      [/\bdefinitive\b/i, 'claims to be definitive', true],
    ]) {
      for (const s of sentences) {
        if (!pattern.test(s)) continue;
        if (negatable && NEGATED.test(s)) continue;
        assert.fail(`${r.id} ${why}: ${s.trim()}`);
      }
    }
  }
});

test('the negation exemption cannot be used to smuggle in a real guarantee', () => {
  // The exemption above is only safe if it is narrow. A sentence that both
  // promises an outcome AND happens to contain a negator elsewhere must still
  // fail, so the guard is re-proved here against a fabricated claim.
  const CLAIM = 'We guarantee your listing will rank, and no competitor will outrank you.';
  const DISCLAIMER = 'A website link is conditional, not guaranteed.';
  const fires = (s) => /guarantee[sd]?\b/i.test(s) && !NEGATED.test(s);
  assert.ok(!fires(DISCLAIMER), 'the guard still punishes a correct disclaimer');
  // The fabricated claim contains "no", so the negator test alone would clear it.
  // That is exactly why an outcome promise needs its own guard, asserted here.
  const PROMISES_OUTCOME = /\bguarantee[sd]?\b[^.!?]*\b(?:rank|ranking|traffic|leads?|indexed|placement)\b/i;
  assert.ok(PROMISES_OUTCOME.test(CLAIM), 'the outcome guard does not catch a real guarantee');
  assert.ok(!PROMISES_OUTCOME.test(DISCLAIMER), 'the outcome guard misfires on a disclaimer');
  for (const r of AU) {
    for (const s of [r.description, ...r.pros, ...r.cons, ...r.bestFor, ...r.notRecommendedFor]) {
      assert.ok(!PROMISES_OUTCOME.test(s), `${r.id} guarantees a search or traffic outcome: ${s}`);
    }
  }
});

test('an incorporated-association register is never described as a company register', () => {
  const assoc = SUB.filter((r) => /association/i.test(r.name + r.description));
  assert.ok(assoc.length >= 4, `only ${assoc.length} association registers to check`);
  for (const r of assoc) {
    const prose = `${r.description} ${r.pros.join(' ')} ${r.cons.join(' ')}`;
    assert.match(prose, /\bnot an? ACN\b|no ACN|not.{0,40}compan|ASIC (?:does not|neither)|about ASIC|distinct from ASIC/i,
      `${r.id} does not state that incorporated associations are not companies`);
  }
});

// --- duplicate control -------------------------------------------------------

test('no record duplicates an ASIC Connect view', () => {
  const asic = AU.find((r) => r.id === 'au-asic-registers');
  assert.ok(asic, 'the existing ASIC record is missing');
  for (const r of AU) {
    if (r.id === 'au-asic-registers') continue;
    const host = new URL(r.website).hostname.replace(/^www\./, '');
    assert.ok(!/^(asic\.gov\.au|connectonline\.asic\.gov\.au)$/.test(host),
      `${r.id} sits on an ASIC host and duplicates ${asic.id}`);
  }
  // And the same register is not published twice under different names.
  const hosts = AU.map((r) => new URL(r.website).hostname.replace(/^www\./, ''));
  assert.strictEqual(new Set(hosts).size, hosts.length,
    `two Australian records share a host: ${hosts.filter((h, i) => hosts.indexOf(h) !== i)}`);
  const ids = AU.map((r) => r.id);
  const slugs = AU.map((r) => r.slug);
  assert.strictEqual(new Set(ids).size, ids.length);
  assert.strictEqual(new Set(slugs).size, slugs.length);
});

test('a record sharing an official host declares a resourceIdentity', () => {
  const byHost = new Map();
  for (const r of AU) {
    const host = new URL(r.website).hostname.replace(/^www\./, '');
    if (!byHost.has(host)) byHost.set(host, []);
    byHost.get(host).push(r);
  }
  for (const [host, rs] of byHost) {
    if (rs.length < 2) continue;
    for (const r of rs) {
      assert.ok(r.resourceIdentity, `${r.id} shares ${host} with ${rs.length - 1} other(s) and declares no resourceIdentity`);
    }
  }
});

// --- record contract ---------------------------------------------------------

// Scoped to what this wave published. au-abn-lookup and au-asic-registers were
// authored in Batch 1 under an earlier contract, and au-abn-lookup carries no
// audience guidance — a real gap, but a pre-existing one, and widening this
// wave to rewrite them would be scope creep. It is disclosed in the report.
const PRE_EXISTING = new Set(['au-abn-lookup', 'au-asic-registers']);
const NEW = REG.filter((r) => !PRE_EXISTING.has(r.id));

test('every Australian record meets the publication contract', () => {
  for (const r of NEW) {
    assert.ok(r.id && r.slug && r.name, 'a record is missing an identifier');
    assert.match(r.website, /^https:\/\//, `${r.id} website is not https`);
    assert.ok(r.operator && r.operator.name.trim(), `${r.id} has no operator`);
    assert.ok(S.OPERATOR_TYPES.includes(r.operator.type), `${r.id} operator type invalid`);
    assert.ok(r.registryTypes.length > 0, `${r.id} has no registry type`);
    for (const t of r.registryTypes) {
      assert.ok(T.REGISTRY_TYPE_BY_ID.has(t), `${r.id} uses undefined type "${t}"`);
    }
    assert.strictEqual(r.primaryRegistryType, r.registryTypes[0], `${r.id} primary type is not first`);
    assert.ok(r.publicAccess, `${r.id} has no publicAccess`);
    assert.ok(S.ACCESS_LEVELS.includes(r.publicAccess.accessLevel), `${r.id} access level invalid`);
    assert.deepStrictEqual(S.accessContradictions(r.publicAccess), [], `${r.id} access contradiction`);
    assert.strictEqual(r.verification.status, 'verified', `${r.id} is not verified`);
    assert.ok(r.verification.source, `${r.id} has no verification source`);
    assert.ok(r.verification.reviewers.length > 0, `${r.id} has no reviewer`);
    assert.match(r.lastVerified, /^\d{4}-\d{2}-\d{2}$/, `${r.id} has no verification date`);
    assert.ok(r.description.length > 100, `${r.id} description is thin`);
    assert.ok(r.pros.length > 0 && r.cons.length > 0, `${r.id} has no assessment`);
    assert.ok(r.bestFor.length > 0 || r.notRecommendedFor.length > 0, `${r.id} has no audience guidance`);
    assert.strictEqual(S.computeScore(r.scoreFactors), r.petroHrysScore, `${r.id} score does not reproduce`);
  }
});

test('every Australian statutory register is notApplicable for submission', () => {
  for (const r of REG) {
    assert.strictEqual(r.submissionModel, 'notApplicable',
      `${r.id} is "${r.submissionModel}"; a licence or filing fee is not a paid directory listing`);
  }
});

test('no Australian record carries a metric', () => {
  // The two pre-existing records hold frozen snapshots; nothing added may.
  const PRE = new Set(['au-abn-lookup', 'au-asic-registers']);
  for (const r of AU) {
    if (PRE.has(r.id)) continue;
    for (const k of ['domainRating', 'authorityScore', 'estimatedTraffic', 'referringDomains']) {
      assert.strictEqual(r[k], null, `${r.id} carries ${k} = ${r[k]}`);
    }
    assert.strictEqual(r.metricStatus, 'unknown', r.id);
    assert.deepStrictEqual(r.metricsProvenance, {}, r.id);
  }
});

test('an access claim is carried by the access block', () => {
  for (const r of REG) {
    const pa = r.publicAccess;
    const assertions = [r.description, ...r.pros, ...r.cons]
      .flatMap((v) => v.split(/(?<=[.!?])\s+/))
      .filter((x) => !/\b(?:whether|not state|no official page|unknown|cannot be established)\b/i.test(x))
      .join(' ');
    if (/can be searched free of charge|is published free of charge/.test(assertions)) {
      assert.strictEqual(pa.freeToSearch, true, `${r.id} claims free access, freeToSearch is ${pa.freeToSearch}`);
    }
    if (/without an account/.test(assertions)) {
      assert.strictEqual(pa.loginRequired, false, `${r.id} claims no account, loginRequired is ${pa.loginRequired}`);
    }
    // A register with no search must not claim one.
    if (pa.searchUrl === null && /can be searched/.test(assertions)) {
      assert.fail(`${r.id} has no searchUrl but says it can be searched`);
    }
  }
});

test('no published Australian field carries a research note', () => {
  for (const r of AU) {
    const fields = Object.entries({
      description: r.description, editorNotes: r.editorNotes,
      notes: (r.publicAccess || {}).notes || '',
      pros: r.pros.join(' | '), cons: r.cons.join(' | '),
      bestFor: r.bestFor.join(' | '), notRecommendedFor: r.notRecommendedFor.join(' | '),
    }).filter(([, v]) => v);
    for (const [field, text] of fields) {
      for (const [pattern, what] of [
        [/HTTP \d{3}|returned HTTP/i, 'an HTTP status code'],
        [/\b(?:curl|WebFetch|user-agent|scripted request)\b/i, 'the fetch tooling'],
        [/<[a-zA-Z][^>]*>/, 'raw markup'],
        [/\bI (?:did|could|was|ran|read|tested)\b/, 'first-person voice'],
        [/\b(?:submissionModel|registryTypes|accessLevel|publicAccess|scoreFactors)\b/, 'a schema field name'],
        [/[…]\s*$/, 'a truncated ending'],
      ]) {
        assert.ok(!pattern.test(text), `${r.id} ${field} publishes ${what}: "${text.slice(0, 110)}"`);
      }
      assert.strictEqual((text.match(/"/g) || []).length % 2, 0, `${r.id} ${field} has an unbalanced quote`);
    }
  }
});

test('relations are specific, not stamped on every record', () => {
  const withRelations = AU.filter((r) => S.RELATION_KINDS.some((k) => (r.related[k] || []).length));
  assert.ok(withRelations.length > 0, 'no Australian record declares a relation');
  const all = loadRegistry().directories.map((r) => r.id);
  for (const r of AU) {
    for (const kind of S.RELATION_KINDS) {
      for (const target of r.related[kind] || []) {
        assert.ok(all.includes(target), `${r.id} points at unknown record "${target}"`);
        assert.notStrictEqual(target, r.id, `${r.id} relates to itself`);
      }
    }
  }
  // The same relation set on every state record would be decoration.
  const sets = SUB.map((r) => S.RELATION_KINDS.flatMap((k) => r.related[k] || []).sort().join(','));
  assert.ok(new Set(sets).size > 1, 'every subnational record declares the same relations');
});

// --- the country page --------------------------------------------------------

test('the Australia page groups Federal, States, Territories in that order', () => {
  const groups = c.jurisdictionGroups(AU, 'australia');
  assert.ok(groups, 'the Australia page is not grouped');
  assert.deepStrictEqual(groups.map((g) => g.label), ['Federal', 'States', 'Territories']);
  const states = groups.find((g) => g.key === 'state');
  const names = states.items.map((d) => d.jurisdiction.name);
  assert.deepStrictEqual(names, [...names].sort(), 'states are not in A-Z order');
  for (const d of groups.find((g) => g.key === 'territory').items) {
    assert.strictEqual(d.jurisdiction.type, 'territory', `${d.id} is in Territories but is a ${d.jurisdiction.type}`);
  }
  for (const d of groups.find((g) => g.key === 'national').items) {
    assert.strictEqual(d.jurisdiction, null, `${d.id} is federal but carries a jurisdiction`);
  }
});

test('counts on the page derive from the records', () => {
  const groups = c.jurisdictionGroups(AU, 'australia');
  const rendered = [...PAGE.matchAll(/bd-jgroup-count">(\d+) registr/g)].map((m) => Number(m[1]));
  assert.deepStrictEqual(rendered, groups.map((g) => g.count));
  assert.strictEqual((PAGE.match(/class="bd-row"/g) || []).length, AU.length);
  assert.strictEqual(rendered.reduce((a, b) => a + b, 0), AU.length);
});

test('no state landing route was created', () => {
  const dir = path.join(ROOT, 'research/business-directories/australia');
  const slugs = new Set(AU.map((r) => r.slug));
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'categories') continue;
    assert.ok(slugs.has(entry.name), `/australia/${entry.name}/ is not a record route`);
  }
});

// --- the page behaves --------------------------------------------------------

function boot() {
  const document = createDocument(PAGE);
  vm.runInContext(CLIENT, vm.createContext({ document, BDOrder: order, BDDiscovery: discovery, window: {} }));
  return {
    document,
    rows: document.querySelectorAll('.bd-row'),
    boxes: document.querySelectorAll('.bd-jgroup'),
    status: document.querySelector('.bd-status'),
    search: document.querySelector('[data-bd-search]'),
    sort: document.querySelector('[data-bd-sort]'),
    filters: document.querySelectorAll('[data-bd-filter]'),
  };
}

test('search, filters and the count span every Australian group', () => {
  let p = boot();
  assert.strictEqual(p.rows.length, AU.length, 'the no-JS page is incomplete');
  assert.match(p.status.textContent, new RegExp(`${AU.length} directories shown`), p.status.textContent);

  p = boot();
  p.search.value = 'incorporated association';
  p.search.dispatch('input');
  const hits = p.rows.filter((r) => !r.hidden);
  assert.ok(hits.length >= 3, `search found ${hits.length} association registers`);
  for (const r of hits) {
    assert.match(r.getAttribute('data-bd-haystack'), /incorporated association/i,
      'a row matched without containing the term');
  }
  // Every group must have been processed, not merely present.
  for (const box of p.boxes) {
    const title = box.querySelector('.bd-jgroup-title').textContent.trim();
    assert.ok(box.querySelectorAll('.bd-row').some((r) => r.hidden),
      `no row was hidden in "${title}" — that table was never filtered`);
  }
});

test('sorting reorders within a group and never moves a record between groups', () => {
  const p = boot();
  const before = p.boxes.map((b) => b.querySelectorAll('.bd-row').map((r) => r.getAttribute('data-bd-name')));
  p.sort.value = 'alphabetical';
  p.sort.dispatch('change');
  const after = p.boxes.map((b) => b.querySelectorAll('.bd-row').map((r) => r.getAttribute('data-bd-name')));
  before.forEach((names, i) => {
    assert.strictEqual(names.length, after[i].length, 'a group changed size on sort');
    assert.deepStrictEqual([...names].sort(), [...after[i]].sort(), 'a record crossed a group boundary');
  });
  assert.ok(before.some((names, i) => names.join('|') !== after[i].join('|')), 'sort changed nothing');
});

test('the Australia page stays small and fully styled', () => {
  const bytes = Buffer.byteLength(PAGE);
  const gz = require('node:zlib').gzipSync(PAGE).length;
  assert.ok(gz < 40 * 1024, `${gz} bytes gzipped is too large for ${AU.length} rows`);
  const css = fs.readFileSync(path.join(ROOT, 'css/business-directories.css'), 'utf8');
  const styled = new Set((css.match(/\.bd-[a-zA-Z0-9_-]+/g) || []).map((s) => s.slice(1)));
  const emitted = new Set();
  for (const m of PAGE.matchAll(/class="([^"]+)"/g)) {
    for (const cls of m[1].split(/\s+/)) if (cls.startsWith('bd-')) emitted.add(cls);
  }
  assert.deepStrictEqual([...emitted].filter((cls) => !styled.has(cls)), [],
    'the Australia page uses unstyled classes');
  // Mobile: every cell carries the label its card view renders from.
  assert.ok((PAGE.match(/data-bd-label/g) || []).length >= AU.length * 2, 'mobile labels were lost');
  assert.ok(bytes > 0);
});

test('jump links resolve to the groups they name', () => {
  const groups = c.jurisdictionGroups(AU, 'australia');
  const anchors = [...PAGE.matchAll(/href="#(australia-jurisdiction-[a-z-]+)"/g)].map((m) => m[1]);
  assert.strictEqual(anchors.length, groups.length, `${anchors.length} links for ${groups.length} groups`);
  for (const id of anchors) assert.ok(PAGE.includes(`id="${id}"`), `${id} is a dangling anchor`);
});
