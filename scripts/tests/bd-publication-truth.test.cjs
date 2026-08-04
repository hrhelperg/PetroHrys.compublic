// scripts/tests/bd-publication-truth.test.cjs
'use strict';

// An adversarial audit of the Wave 1 record set found 49 defects across 25
// records that every existing test passed over. They fell into four families,
// and each family gets a guard here.
//
// The families, with the worst example of each:
//   1. The research's own fields leaked into published prose. `operator` on
//      three records ended with an editorial aside, so the sentence template
//      produced "Not a Secretary of State is the statutory source for New
//      Jersey" and "Territorial, not federal is the statutory source for United
//      States Virgin Islands".
//   2. The sentence splitter cut at abbreviations. "Ley Núm. 164-2009" lost its
//      law number; "(Int." and "Dom." were published as sentence ends.
//   3. Templates were welded onto clauses that already had a subject and verb:
//      "It covers unusually broad.", "It covers per the DLCP Corporations
//      Division FAQ:".
//   4. Prose reported our research rather than the register: "could not be read,
//      so no claim is recorded", "roughly one month before this research".
//
// These run over EVERY united-states record, federal and subnational, because
// three of the four families were found in both waves.

const test = require('node:test');
const assert = require('node:assert');

const { loadRegistry } = require('../lib/bd-registry.cjs');

const US = loadRegistry().directories.filter((r) => r.country === 'united-states');
const SUB = US.filter((r) => r.jurisdiction);

const fields = (r) => [
  ['description', r.description],
  ['editorNotes', r.editorNotes || ''],
  ['publicAccess.notes', (r.publicAccess && r.publicAccess.notes) || ''],
  ...r.pros.map((v, i) => [`pros[${i}]`, v]),
  ...r.cons.map((v, i) => [`cons[${i}]`, v]),
  ...r.bestFor.map((v, i) => [`bestFor[${i}]`, v]),
  ...r.notRecommendedFor.map((v, i) => [`notRecommendedFor[${i}]`, v]),
  ...(r.recommendedIndustries || []).map((v, i) => [`recommendedIndustries[${i}]`, v]),
].filter(([, v]) => v);

test('the wave is large enough for these guards to mean anything', () => {
  assert.ok(US.length >= 60, `only ${US.length} US records`);
  assert.ok(SUB.length >= 30, `only ${SUB.length} subnational records`);
});

// --- family 1: research fields leaking into prose ---------------------------

test('an operator name is a name, not the evidence for it', () => {
  for (const r of US) {
    const n = r.operator && r.operator.name;
    if (!n) continue;
    assert.ok(!/\b(?:NOT?|Not) a Secretary of State\b/.test(n), `${r.id} operator carries an aside: "${n}"`);
    assert.ok(!/Territorial, not federal/i.test(n), `${r.id} operator carries an aside: "${n}"`);
    assert.ok(!/;/.test(n), `${r.id} operator carries a semicolon clause: "${n}"`);
    // A parenthetical quoting a page footer is cited evidence, not a name.
    assert.ok(!/\([^)]*["“:][^)]*\)/.test(n), `${r.id} operator embeds cited evidence: "${n}"`);
    assert.ok(!/\s[—–]\s+[a-zà-ÿ]/.test(n), `${r.id} operator ends in a descriptive clause: "${n}"`);
    assert.ok(n.length <= 170, `${r.id} operator is ${n.length} chars — that is a paragraph`);
  }
});

test('a URL is a URL', () => {
  for (const r of US) {
    for (const [label, url] of [['website', r.website], ['searchUrl', r.publicAccess && r.publicAccess.searchUrl]]) {
      if (!url) continue;
      assert.match(url, /^https:\/\/\S+$/, `${r.id} ${label} is not a bare URL: "${url}"`);
      assert.ok(!/[\s()]/.test(url), `${r.id} ${label} carries prose: "${url}"`);
      assert.doesNotThrow(() => new URL(url), `${r.id} ${label} does not parse`);
    }
  }
});

// --- family 2: truncation and unbalanced delimiters -------------------------

test('no published field is cut at an abbreviation or a delimiter', () => {
  // Real abbreviations that legitimately end a published sentence are rare;
  // a field ENDING at one is the signature of the splitter cutting too early.
  const CUT_AT_ABBREV = /\b(?:Núm|Int|Dom|For|ch|s|art|No|Ley|Corp|Div|Dept)\.$/;
  for (const r of US) {
    for (const [field, text] of fields(r)) {
      const t = text.trim();
      assert.ok(!/[…]$/.test(t) && !/\.\.\.$/.test(t), `${r.id} ${field} ends in an ellipsis`);
      assert.ok(!CUT_AT_ABBREV.test(t), `${r.id} ${field} ends at an abbreviation: "${t.slice(-60)}"`);
      assert.strictEqual((t.match(/"/g) || []).length % 2, 0, `${r.id} ${field} has an unbalanced double quote`);
      assert.strictEqual((t.match(/[“”]/g) || []).length % 2, 0, `${r.id} ${field} has an unbalanced curly quote`);
      assert.strictEqual((t.match(/\(/g) || []).length, (t.match(/\)/g) || []).length,
        `${r.id} ${field} has an unbalanced parenthesis: "${t.slice(0, 90)}"`);
      const opens = (t.match(/(?:^|[\s(])'/g) || []).length;
      const closes = (t.match(/'(?:[\s.,;:)]|$)/g) || []).length;
      assert.strictEqual(opens, closes, `${r.id} ${field} has an unbalanced single quote: "${t.slice(0, 90)}"`);
    }
  }
});

test('no published field carries a punctuation artefact', () => {
  for (const r of US) {
    for (const [field, text] of fields(r)) {
      assert.ok(!/\s{2,}/.test(text), `${r.id} ${field} has a doubled space`);
      assert.ok(!/\s[.,;:](?!\w)/.test(text), `${r.id} ${field} has a space before punctuation`);
      assert.ok(!/\.["”]\.\s/.test(text), `${r.id} ${field} has a doubled terminal stop after a quotation`);
      assert.ok(!/\b(\w+) \1\b/i.test(text), `${r.id} ${field} repeats a word`);
    }
  }
});

// --- family 3: a template welded onto a clause ------------------------------

test('a sentence template is never welded onto a clause of its own', () => {
  for (const r of SUB) {
    const stem = r.description.match(/It covers ([^.]{0,90})/);
    if (stem) {
      assert.ok(!/\b(?:is|are|was|were|has|have)\b/.test(stem[1]),
        `${r.id} welds "It covers" onto a clause with its own verb: "It covers ${stem[1]}"`);
      assert.ok(!/^(?:per|the|unusually|exceptionally|stated|official)\b/i.test(stem[1].trim()),
        `${r.id} welds "It covers" onto a non-object: "It covers ${stem[1]}"`);
    }
    // The statutory-source pro reads "<Operator> is the statutory source for X".
    // Its subject must be the operator, not a fragment left behind by one.
    const source = r.pros.find((p) => / is the statutory source for /.test(p));
    if (source) {
      const subject = source.split(' is the statutory source for ')[0];
      assert.ok(subject.includes(r.operator.name.replace(/^The /, '')),
        `${r.id} statutory-source pro has the wrong subject: "${subject}"`);
    }
    // "Coverage: Coverage:" — a lead-in doubled onto its own label.
    assert.ok(!/Coverage: ?Coverage:/.test(r.editorNotes || ''), `${r.id} doubles its coverage label`);
  }
});

test('a jurisdiction that takes an article gets one', () => {
  const ARTICLE = ['District of Columbia', 'United States Virgin Islands', 'Northern Mariana Islands'];
  for (const r of SUB) {
    const name = r.jurisdiction.name;
    if (!ARTICLE.includes(name)) continue;
    for (const [field, text] of fields(r)) {
      assert.ok(!new RegExp(`\\b(?:in|for|of) ${name}\\b`).test(text),
        `${r.id} ${field} omits the article before "${name}"`);
    }
  }
});

// --- family 4: prose about the research, not the register -------------------

test('no published field reports our research instead of the register', () => {
  const NOTEBOOK = [
    /\bI (?:did|could|was|were|read|ran|note|fetched|entered)\b/,
    /could not be (?:read|reached|fetched|established|confirmed|observed) from/i,
    /no claim is recorded/i,
    /this (?:research|environment|session|vantage|exercise|batch)\b/i,
    /so this record states/i,
    /the research (?:records|says|shows|notes)/i,
    /\bsee [a-z]+[A-Z][a-zA-Z]+/,
  ];
  for (const r of US) {
    for (const [field, text] of fields(r)) {
      for (const pattern of NOTEBOOK) {
        assert.ok(!pattern.test(text),
          `${r.id} ${field} talks about the research (${pattern}): "${text.slice(0, 110)}"`);
      }
    }
  }
});

test('no published field is a probe log', () => {
  // publicAccess.notes RENDERS on the page. It was being filled from the
  // research's working notes, so readers were shown HTTP status codes, the
  // tools used to fetch ("via both WebFetch and curl with full browser
  // headers") and, on one record, a pasted <div> of the operator's markup.
  // An access note describes what a visitor meets, not what our client received.
  const PROBE = [
    [/HTTP \d{3}|returned HTTP|status code/i, 'an HTTP status code'],
    [/\b(?:curl|WebFetch|user-agent|scripted request|automated client|anonymous POST)\b/i, 'the fetch tooling'],
    [/<[a-z]+[^>]*>/i, 'raw markup'],
    [/\bprobe\b/i, 'a probe'],
    [/Record states:/i, 'the record citing itself'],
    [/\bin this wave\b/i, 'a comparison scoped to the research batch'],
    [/is scored (?:low|down|high)|scored at \d/i, 'a score justification naming the factor'],
    [/held pending verification|not observable|retrieved during research/i, 'the state of our own pipeline'],
  ];
  for (const r of US) {
    for (const [field, text] of fields(r)) {
      for (const [pattern, what] of PROBE) {
        assert.ok(!pattern.test(text),
          `${r.id} ${field} publishes ${what}: "${text.slice(0, 120)}"`);
      }
    }
  }
});

test('an access note states terms, and only where there are terms to state', () => {
  for (const r of SUB) {
    const pa = r.publicAccess;
    const notes = pa.notes;
    if (!notes) {
      // No note is correct only where nothing limits access.
      assert.ok(pa.accessLevel === 'open' && pa.freeToSearch === true,
        `${r.id} has no access note despite accessLevel ${pa.accessLevel}`);
      continue;
    }
    assert.match(notes.trim(), /[.!?]$/, `${r.id} access note is not a sentence`);
    // Anything the note asserts must be carried by the access block.
    if (/Each search is charged/.test(notes)) assert.strictEqual(pa.freeToSearch, false, `${r.id}`);
    if (/An account must be created/.test(notes)) assert.strictEqual(pa.loginRequired, true, `${r.id}`);
    if (/A CAPTCHA must be completed/.test(notes)) assert.strictEqual(pa.captcha, true, `${r.id}`);
  }
});

test('no published field names a schema field at the reader', () => {
  for (const r of US) {
    for (const [field, text] of fields(r)) {
      for (const name of ['submissionModel', 'resourceIdentity', 'registryTypes', 'accessLevel',
        'metricsProvenance', 'scoreFactors', 'petroHrysScore', 'publicAccess']) {
        assert.ok(!text.includes(name), `${r.id} ${field} names the schema field "${name}" in prose`);
      }
    }
  }
});

// --- claims -----------------------------------------------------------------

test('an exclusion register accepts nobody', () => {
  const excl = US.filter((r) => (r.registryTypes || []).some((t) => /exclusion|debar/i.test(t)));
  assert.ok(excl.length >= 3, `only ${excl.length} exclusion registers to check`);
  for (const r of excl) {
    for (const [k, v] of Object.entries(r.accepts)) {
      // "What this directory accepts — Enterprises: Yes" on a debarment list
      // frames being barred as a form of admission.
      assert.strictEqual(v, null, `${r.id} claims to accept ${k}: being listed is a sanction, not an entry`);
    }
    assert.strictEqual(r.submissionModel, 'notApplicable', `${r.id} has a submission model`);
    const prose = fields(r).map(([, v]) => v).join(' ');
    assert.ok(!/\b(?:verified clean|good standing|trustworth|clean record)\b/i.test(prose)
      || /not (?:evidence|proof)|means only|does not (?:prove|establish|confirm)/i.test(prose),
    `${r.id} reads absence from an exclusion list as positive evidence`);
  }
});

test('a restriction is only claimed where one was established', () => {
  for (const r of SUB) {
    const pa = r.publicAccess;
    const says = r.notRecommendedFor.some((x) => /access terms do not support/i.test(x));
    if (says) {
      assert.ok(pa.freeToSearch === false || pa.loginRequired === true,
        `${r.id} says the access terms do not support anonymous checking, but nothing restricts it `
        + `(freeToSearch ${pa.freeToSearch}, loginRequired ${pa.loginRequired})`);
    }
  }
});

test('no Wave 1 record carries a metric', () => {
  // The two US records with a Domain Rating predate Wave 1 and hold a frozen
  // snapshot; nothing added here may carry one.
  const PRE_WAVE_1 = new Set(['us-bbb', 'us-uspto-trademark-search', 'us-sec-edgar', 'us-finra-brokercheck']);
  for (const r of US) {
    if (PRE_WAVE_1.has(r.id)) continue;
    for (const k of ['domainRating', 'authorityScore', 'estimatedTraffic', 'referringDomains']) {
      assert.strictEqual(r[k], null, `${r.id} carries ${k} = ${r[k]}`);
    }
    assert.strictEqual(r.metricStatus, 'unknown', `${r.id} metricStatus is ${r.metricStatus}`);
    assert.deepStrictEqual(r.metricsProvenance, {}, `${r.id} carries metric provenance`);
  }
});
