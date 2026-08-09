'use strict';

// First-party English detection.
//
// ── WHY THE NAIVE RATIO IS THE WRONG INSTRUMENT ─────────────────────────────
//
// The obvious test — "what fraction of the German page's words also appear on
// the English page?" — reports 88-99% on a correctly localized Research page,
// and it is not wrong to do so. Those pages are mostly CANONICAL DATA: platform
// names, country names, URLs, scores, dates and the English descriptions of
// third-party services. All of that is identical across locales by design,
// because "ABN Lookup" is "ABN Lookup" in German and translating a third
// party's description of itself would misrepresent it.
//
// So a high ratio proves nothing, and a threshold tuned to pass those pages
// would be too loose to catch a genuinely untranslated one. The measurement has
// to separate what WE wrote from what the DATASET supplied.
//
// ── HOW THIS SEPARATES THEM ─────────────────────────────────────────────────
//
// Everything first-party reaches a page through the dictionary. So the English
// dictionary IS the definition of first-party copy, and the test becomes exact
// rather than statistical:
//
//   for each English dictionary value that differs from the locale's value,
//   does the English form appear on the localized page?
//
// A hit is a genuine leak: a string we authored, that we have translated, still
// rendering in English. Anything not in the dictionary is not ours to translate
// and is never counted — no allow-list to maintain, no proper-noun heuristics.

const fs = require('node:fs');
const path = require('node:path');
const I18N = require('./i18n.cjs');

const ROOT = path.join(__dirname, '..', '..');

// Short strings match too easily inside unrelated words and inside data. A
// four-character probe like "Open" would fire on any platform whose description
// contains it, so probes must be long enough that a coincidence is implausible.
const MIN_PROBE = 8;

// Values that are deliberately identical in every language: proper names,
// metric names, and brand terms. They are excluded by the equality check below
// automatically — if EN and DE agree, there is nothing to leak — so this list
// exists only for values that differ in SOME locale but are still factual.
const FACTUAL_KEYS = /^(bd\.(domainRating|petrohrysScore)|bdx\.(directoryScore|freemium)|collection\.)/;

function probesFor(locale) {
  if (locale === I18N.DEFAULT_LOCALE) return [];
  const probes = [];
  for (const key of I18N.allKeys(I18N.DEFAULT_LOCALE)) {
    if (FACTUAL_KEYS.test(key)) continue;
    let en;
    let loc;
    try { en = I18N.raw(I18N.DEFAULT_LOCALE, key); loc = I18N.raw(locale, key); } catch { continue; }
    if (typeof en !== 'string' || typeof loc !== 'string') continue;
    if (en === loc) continue;                 // identical by design
    if (en.length < MIN_PROBE) continue;      // too short to match safely
    if (/\{[a-zA-Z]+\}/.test(en)) continue;   // template, not a literal
    probes.push({ key, en });
  }
  return probes;
}

// Only the parts of the document a reader reads. Scripts carry JSON-LD and
// analytics; <head> carries metadata that is checked separately.
function visibleBody(html) {
  const start = html.indexOf('<main');
  const end = html.indexOf('</main>');
  if (start < 0 || end < 0) return '';
  return html.slice(start, end).replace(/<script[\s\S]*?<\/script>/g, ' ');
}

// A first-party string is emitted as a COMPLETE text node or a complete
// attribute value, never as a fragment of a sentence. Matching on substrings
// reported 1,253 pages, almost all of them false: "Platform" fired inside a
// platform's own name, "Research" inside "Research Center", "Industry" inside a
// third party's description of itself. Those are dataset text, not our copy,
// and translating them is not the goal.
//
// Anchoring to node and attribute boundaries removes that entire class of false
// positive without an exception list, because the thing being asserted — "our
// string is rendering in English" — is only ever true at a boundary.
function occurrences(body, value) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const asTextNode = new RegExp(`>\\s*${escaped}\\s*<`);
  const asAttribute = new RegExp(`="\\s*${escaped}\\s*"`);
  return asTextNode.test(body) || asAttribute.test(body);
}

function leaksIn(relPath, html, locale) {
  const body = visibleBody(html);
  if (!body) return [];
  const found = [];
  for (const probe of probesFor(locale)) {
    if (occurrences(body, probe.en)) found.push(probe);
  }
  return found;
}

const PREFIXES = I18N.LOCALES.filter((l) => l.prefix)
  .map((l) => [`${l.prefix.slice(1)}/`, l.code]);
const localeOf = (rel) => (PREFIXES.find(([p]) => rel.startsWith(p)) || [null, 'en'])[1];

const SKIP = new Set(['.git', 'node_modules', 'startups-app', 'docs', 'scripts',
  'data', 'css', 'js', 'images', 'fonts', 'content']);

function htmlFiles(dir = ROOT, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (dir === ROOT && SKIP.has(e.name)) continue;
      htmlFiles(p, out);
    } else if (e.name.endsWith('.html')) out.push(path.relative(ROOT, p).replace(/\\/g, '/'));
  }
  return out;
}

// Every localized page, with the first-party English still on it.
function scan(filter = () => true) {
  const report = [];
  for (const rel of htmlFiles()) {
    const locale = localeOf(rel);
    if (locale === I18N.DEFAULT_LOCALE) continue;
    if (!filter(rel)) continue;
    const leaks = leaksIn(rel, fs.readFileSync(path.join(ROOT, rel), 'utf8'), locale);
    if (leaks.length) report.push({ file: rel, locale, leaks: leaks.map((l) => l.key), samples: leaks.slice(0, 3) });
  }
  return report;
}

module.exports = { probesFor, leaksIn, scan, htmlFiles, localeOf, visibleBody, MIN_PROBE, FACTUAL_KEYS };
