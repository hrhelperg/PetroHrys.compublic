'use strict';

// Matching operator wording, in the languages operators actually write in.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
//
// Three separate matchers in this repository were written with the same
// unexamined assumption — that JavaScript's regex vocabulary behaves the same
// way outside ASCII — and every one of them was wrong in a way that produced
// silence rather than an error:
//
//   /\bподать объявление\b/  matched nothing, ever. `\b` is defined on ASCII
//   word characters, so a boundary next to Cyrillic can never assert. Every
//   Russian, Ukrainian and Polish phrase was inert, and the corpus would have
//   recorded those markets as having no seller route.
//
//   /ilan ver/i  never matched "İlan ver". The Turkish dotted capital İ
//   (U+0130) does not case-fold to "i" under the /i flag.
//
// Both failures LOOK like findings. "No route published" is what a broken
// matcher and an unwelcoming website produce identically, and the difference
// only shows up if someone happens to read the output. That is not a control.
//
// So all matching goes through here, and the rule is:
//
//   normalise the haystack and the needle the same way, then match on
//   Unicode-aware boundaries — never on `\b`.
//
// ── WHAT IS DELIBERATELY NOT DONE ───────────────────────────────────────────
//
// No transliteration. Turning "объявление" into "obyavlenie" to make a regex
// simpler would mean matching a language nobody writes, and the first time a
// site used a word the table did not cover it would fail silently again.

// Characters a site publishes that are not the characters a pattern is written
// with. Every one of these has been seen in real navigation labels.
const CONFUSABLES = [
  [/[      - ]/g, ' '], // non-breaking and thin spaces
  [/[‘’‚‛′ʼ]/g, "'"], // smart and modifier apostrophes
  [/[“”„‟″]/g, '"'], // smart quotes
  [/[‐-―−]/g, '-'], // dashes of every width
  [/[​-‍﻿]/g, ''], // zero-width joiners and the BOM
  [/İ/g, 'i'], // TURKISH DOTTED CAPITAL I — see below
  [/ı/g, 'i'], // Turkish dotless small i
];

// ── THE TURKISH CASE RULE ───────────────────────────────────────────────────
//
// Turkish has two i's and JavaScript's /i flag knows about neither pairing:
//
//   İ (U+0130) uppercase dotted   -> lowercases to "i̇" (i + combining dot)
//   ı (U+0131) lowercase dotless  -> uppercases to "I"
//
// `'İlan'.toLowerCase()` is NOT `'ilan'` — it is `'i̇lan'`, four code points,
// with a combining dot above that no ASCII pattern contains. Folding both
// Turkish forms to plain "i" BEFORE lowercasing is what makes "İlan ver",
// "ilan ver" and "İLAN VER" one string.
//
// The combining dot is stripped afterwards for the same reason.
const COMBINING_DOT_ABOVE = /̇/g;

// One normalisation, applied identically to what a site says and to what a
// pattern looks for. Asymmetry here is its own silent failure mode.
function normalize(input) {
  let text = String(input == null ? '' : input);
  // NFC first: "ó" may arrive as one code point or as o + combining accent, and
  // a pattern written with one will not match text written with the other.
  text = text.normalize('NFC');
  for (const [re, to] of CONFUSABLES) text = text.replace(re, to);
  text = text.toLowerCase().replace(COMBINING_DOT_ABOVE, '');
  return text.replace(/\s+/g, ' ').trim();
}

// A boundary that works in every script. `\b` asserts between an ASCII word
// character and a non-word one, which means it is always false next to
// Cyrillic, Greek, Arabic or CJK. This asks the real question — is the
// neighbouring character a letter or a digit — using Unicode properties.
const BOUNDARY_BEFORE = '(?<![\\p{L}\\p{N}])';
const BOUNDARY_AFTER = '(?![\\p{L}\\p{N}])';

// Build a matcher from plain phrases rather than from regex source, so a
// caller cannot accidentally reintroduce `\b`.
function phraseMatcher(phrases) {
  const parts = phrases.map((p) => normalize(p)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/ /g, '\\s+'));
  const re = new RegExp(`${BOUNDARY_BEFORE}(?:${parts.join('|')})${BOUNDARY_AFTER}`, 'u');
  return (text) => re.test(normalize(text));
}

// For the cases that genuinely need a pattern — optional words, alternations —
// the source is written WITHOUT boundaries and gets Unicode-safe ones here.
function patternMatcher(sources) {
  const compiled = sources.map((src) => {
    if (src instanceof RegExp) {
      if (src.source.includes('\\b')) {
        throw new Error(`Pattern ${src} uses \\b, which cannot assert next to non-ASCII text. `
          + 'Write it without boundaries and let patternMatcher add Unicode-safe ones.');
      }
      return new RegExp(`${BOUNDARY_BEFORE}(?:${src.source})${BOUNDARY_AFTER}`, 'u');
    }
    return new RegExp(`${BOUNDARY_BEFORE}(?:${src})${BOUNDARY_AFTER}`, 'u');
  });
  return (text) => {
    const hay = normalize(text);
    return compiled.some((re) => re.test(hay));
  };
}

// A STEM matcher: substring containment after normalisation, with no
// boundaries at all.
//
// This exists because boundaries are wrong for stems and the mistake is easy to
// make twice. "advertis" is written to catch advertising, advertisement and
// advertiser; wrapped in boundaries it catches none of them. "anuncio" wrapped
// in boundaries misses "anuncios". A destination checker built that way reports
// healthy routes as WRONG_ACTION and, applied, deletes them.
function stemMatcher(stems) {
  const normalised = stems.map(normalize).filter(Boolean);
  return (text) => {
    const hay = normalize(text);
    return normalised.some((stem) => hay.includes(stem));
  };
}

// An exact label, normalised on both sides. Used where a nav item must BE the
// word and not merely contain it: "Sell" is a seller route, "Best sellers" is
// a product category.
function exactMatcher(labels) {
  const set = new Set(labels.map(normalize));
  return (text) => set.has(normalize(text));
}

// ── PROXIMITY ───────────────────────────────────────────────────────────────
//
// Two words on one page are not two words about one thing.
//
// A homepage that says "envíos gratis" is offering free delivery to shoppers;
// one that says "Free entry for the public" is running an exhibition; one that
// says "Makan Bergizi Gratis" is naming an Indonesian school-meals programme.
// A matcher that only asks "does this page contain a word meaning free" reads
// all three as a free business listing, and every one of those was recorded
// before this existed.
//
// So the free word has to be found NEAR something that makes it about the
// action. The window is characters rather than words because the languages
// this corpus spans do not agree about where words end, and because page text
// arrives with navigation glued to prose.
function proximityMatcher(needles, contexts, window = 200) {
  const near = needles.map(normalize).filter(Boolean);
  const about = contexts.map(normalize).filter(Boolean);
  return (text) => {
    const hay = normalize(text);
    for (const needle of near) {
      for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + 1)) {
        const slice = hay.slice(Math.max(0, i - window), i + needle.length + window);
        if (about.some((c) => slice.includes(c))) return true;
      }
    }
    return false;
  };
}

module.exports = {
  proximityMatcher,
  normalize,
  phraseMatcher,
  patternMatcher,
  stemMatcher,
  exactMatcher,
  BOUNDARY_BEFORE,
  BOUNDARY_AFTER,
};
