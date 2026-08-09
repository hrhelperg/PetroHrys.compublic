'use strict';

// English-leak detection.
//
// The failure this exists to catch is the one that makes localization look done
// while it isn't: a page served at /de/ with a German <html lang>, a German
// title, and an English body. Formally the site has four locales; in practice a
// German reader gets English.
//
// ── WHY THIS IS DRIVEN BY THE DICTIONARY ────────────────────────────────────
//
// A hardcoded list of forbidden English words is the obvious implementation and
// the wrong one: it asserts an implementation (this specific word list) rather
// than the property (no English shell string appears on a non-English page). It
// goes stale the moment a string is added, and it silently passes.
//
// So the probe is derived: for every key, if the English value DIFFERS from the
// locale's value, then finding the English value on that locale's page is a
// leak. Keys whose translation is legitimately identical to English — "Legal"
// is "Legal" in Spanish, "Blog" is "Blog" everywhere, "Index" is "Index" in
// French — are excluded automatically, because the comparison is what excludes
// them. Nobody has to remember to maintain an exceptions list.

const fs = require('node:fs');
const path = require('node:path');
const I18N = require('./i18n.cjs');

const ROOT = path.join(__dirname, '..', '..');

// Only strings long or distinctive enough that an accidental substring match is
// implausible. "EN" and "©" appear on every page in every language by design.
const MIN_PROBE_LENGTH = 5;

// Keys that name FACTS rather than prose. A brand is the same word in every
// language, so its presence on a German page is correct, not a leak.
const FACTUAL_KEYS = /^(collection\.(directories|marketplaces|media|planner)$|shell\.footer\.(blog|sitemap)$)/;

// Build, per locale, the list of English strings that must not appear.
function probesFor(locale) {
  if (locale === I18N.DEFAULT_LOCALE) return [];
  const probes = [];
  for (const key of I18N.allKeys(I18N.DEFAULT_LOCALE)) {
    if (FACTUAL_KEYS.test(key)) continue;
    const en = I18N.raw(I18N.DEFAULT_LOCALE, key);
    const loc = I18N.raw(locale, key);
    if (typeof en !== 'string' || typeof loc !== 'string') continue;
    if (en === loc) continue;                       // legitimately identical
    if (en.length < MIN_PROBE_LENGTH) continue;     // too short to match safely
    if (/\{[a-zA-Z]+\}/.test(en)) continue;         // template, not a literal
    probes.push({ key, en });
  }
  return probes;
}

// Which locale a file on disk belongs to, from the path — the same registry the
// generators use, not a second regex that could disagree with it.
const PREFIXES = I18N.LOCALES.filter((l) => l.prefix)
  .map((l) => [`${l.prefix.slice(1)}/`, l.code]);

function localeOf(relPath) {
  for (const [prefix, code] of PREFIXES) {
    if (relPath.startsWith(prefix)) return code;
  }
  return I18N.DEFAULT_LOCALE;
}

const SKIP_DIRS = new Set(['.git', 'node_modules', 'startups-app', 'docs', 'scripts', 'data', 'css', 'js', 'images', 'fonts']);

function htmlFiles(dir = ROOT, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (dir === ROOT && SKIP_DIRS.has(e.name)) continue;
      htmlFiles(p, out);
    } else if (e.name.endsWith('.html')) {
      out.push(path.relative(ROOT, p));
    }
  }
  return out;
}

// A leak report for one file. Returns [] for English pages by construction.
function leaksIn(relPath, html) {
  const locale = localeOf(relPath);
  const found = [];
  for (const probe of probesFor(locale)) {
    if (html.includes(probe.en)) found.push(probe);
  }
  return found;
}

// Scan every localized page on disk. `filter` narrows the file set so a caller
// can check one family without rescanning 1,700 files.
function scan(filter = () => true) {
  const report = [];
  for (const rel of htmlFiles()) {
    if (localeOf(rel) === I18N.DEFAULT_LOCALE) continue;
    if (!filter(rel)) continue;
    const leaks = leaksIn(rel, fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    if (leaks.length) report.push({ file: rel, locale: localeOf(rel), leaks });
  }
  return report;
}

module.exports = { probesFor, localeOf, htmlFiles, leaksIn, scan, MIN_PROBE_LENGTH, FACTUAL_KEYS };
