'use strict';

// Matching operator wording without lying about what the web says.
//
// Two defects in this repository produced silence rather than an error, and
// silence in a research matcher is indistinguishable from a finding. Both are
// covered here, plus the classes they belong to.

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '..', '..');
const T = require(path.join(ROOT, 'scripts/lib/rc-text-match.cjs'));

// ── THE TWO DEFECTS ─────────────────────────────────────────────────────────

test('an ASCII word boundary can never assert next to Cyrillic', () => {
  // The defect, demonstrated rather than described: this is what the matcher
  // used to contain, and it matches nothing at all.
  assert.equal(/\bподать объявление\b/i.test('Подать объявление'), false,
    'the premise of this test is wrong; \\b now works next to Cyrillic');

  // What replaced it.
  const m = T.phraseMatcher(['подать объявление']);
  assert.ok(m('Подать объявление'));
  assert.ok(m('ПОДАТЬ ОБЪЯВЛЕНИЕ'));
  assert.ok(m('Хотите подать объявление?'));
  // And it is still a boundary: the phrase inside a longer word does not count.
  assert.ok(!m('неподать объявлениеx'));
});

test('Turkish dotted and dotless i fold to one letter', () => {
  // 'İlan'.toLowerCase() is 'i̇lan' — i plus a combining dot — so no ASCII
  // pattern can match it, and /i/ does not help.
  assert.notEqual('İlan'.toLowerCase(), 'ilan');

  const m = T.phraseMatcher(['ilan ver']);
  for (const written of ['İlan ver', 'ilan ver', 'İLAN VER', 'ILAN VER', 'İlan Ver']) {
    assert.ok(m(written), `"${written}" did not match`);
  }
  // The dotless ı too, which is how Turkish writes the lowercase of I.
  assert.ok(T.phraseMatcher(['satici'])('Satıcı'));
});

// ── THE CLASSES THEY BELONG TO ──────────────────────────────────────────────

test('accents match whether the page composes them or not', () => {
  const m = T.phraseMatcher(['déposer une annonce']);
  assert.ok(m('Déposer une annonce'), 'composed form failed');
  assert.ok(m('Déposer une annonce'), 'decomposed form failed');
  assert.ok(m('DÉPOSER UNE ANNONCE'), 'uppercase failed');
});

test('Polish and other diacritics survive case folding', () => {
  const m = T.phraseMatcher(['dodaj ogłoszenie', 'zostań sprzedawcą']);
  assert.ok(m('Dodaj ogłoszenie'));
  assert.ok(m('DODAJ OGŁOSZENIE'));
  assert.ok(m('Zostań sprzedawcą'));
});

test('typographic punctuation does not defeat a pattern', () => {
  // Sites publish non-breaking spaces, smart apostrophes and en dashes in
  // navigation labels constantly.
  const m = T.phraseMatcher(["s'inscrire comme vendeur", 'become a seller']);
  assert.ok(m('S’inscrire comme vendeur'), 'smart apostrophe failed');
  assert.ok(m('Become a seller'), 'non-breaking space failed');
  assert.ok(m('Become  a   seller'), 'repeated whitespace failed');
});

test('an exact label is exact: "Sell" is a route, "Best sellers" is a shelf', () => {
  const m = T.exactMatcher(['sell', 'vender']);
  assert.ok(m('Sell'));
  assert.ok(m(' VENDER '));
  assert.ok(!m('Best sellers'));
  assert.ok(!m('Sell your car'));
});

// ── THE GUARD THAT KEEPS IT FROM COMING BACK ────────────────────────────────

test('the matcher refuses to compile a pattern that cannot work', () => {
  assert.throws(() => T.patternMatcher([/\bsell\b/]), /cannot assert next to non-ASCII/);
  // Written without boundaries, it compiles and behaves.
  const m = T.patternMatcher(['sell(er)?']);
  assert.ok(m('Seller centre'));
  assert.ok(!m('Bestseller'));
});

test('no live pattern in the research tooling pairs \\b with non-ASCII text', () => {
  // The repository-wide version of the same rule. Comments are excluded: the
  // defect is documented in prose in several files, deliberately.
  const files = fs.readdirSync(path.join(ROOT, 'scripts'))
    .filter((f) => /^(research|verify|audit)-.*\.cjs$/.test(f));
  assert.ok(files.length >= 4, 'the research tooling was not found');

  for (const file of files) {
    const source = fs.readFileSync(path.join(ROOT, 'scripts', file), 'utf8');
    const code = source.split('\n')
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join('\n');
    const patterns = code.match(/\/[^/\n]*\\b[^/\n]*\/[gimsuy]*/g) || [];
    for (const p of patterns) {
      assert.ok(![...p].some((c) => c.charCodeAt(0) > 127),
        `${file} contains ${p}, which can never match`);
    }
  }
});

test('normalisation is applied to both sides or it is applied to neither', () => {
  // An asymmetric normaliser is its own silent failure: the needle is folded,
  // the haystack is not, and nothing matches for reasons nobody can see.
  const raw = 'İLAN VER';
  const pattern = 'ilan ver';
  assert.equal(T.normalize(raw), T.normalize(pattern),
    'the same words in two forms did not normalise to one string');
});
