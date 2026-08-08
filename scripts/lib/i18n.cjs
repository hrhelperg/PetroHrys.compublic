'use strict';

// Research Center internationalization.
//
// ── THE RULE THAT SHAPES EVERYTHING ─────────────────────────────────────────
//
// One data layer, four presentation layers. The 1,563 directory records, 286
// marketplace records and 385 media records exist ONCE. Nothing here copies a
// dataset per locale, because four copies of a fact drift the first time one is
// corrected and a year later nobody knows which is right.
//
// Localization happens at render time: the generator reads the same canonical
// record and asks this module for the words around it.
//
// ── WHAT IS NEVER TRANSLATED ────────────────────────────────────────────────
//
// Platform names, URLs, submission routes, identifiers, country slugs, machine
// enum values, evidence provenance and measured values are FACTS. "PR TIMES" is
// not "PR ZEITEN" and prtimes.jp is not prtimes.de. Enum values stay canonical
// in the data; only their human-readable LABELS are localized, and only on the
// way to the screen.
//
// ── EPISTEMIC STATUS SURVIVES TRANSLATION ───────────────────────────────────
//
// "unknown", "not verified", "needs browser check", "route not established" all
// have translations that stay uncertain. A German reader must not be told
// something is confirmed because the English hedge was smoothed away.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const DICT_DIR = path.join(ROOT, 'data', 'i18n');

// Discovered from the site's actual architecture — /es/, /fr/, /de/ exist and
// the shipped language switcher lists exactly these four in this order. No
// locale is invented here.
const LOCALES = [
  { code: 'en', label: 'EN', name: 'English', htmlLang: 'en', ogLocale: 'en_US', prefix: '' },
  { code: 'es', label: 'ES', name: 'Español', htmlLang: 'es', ogLocale: 'es_ES', prefix: '/es' },
  { code: 'fr', label: 'FR', name: 'Français', htmlLang: 'fr', ogLocale: 'fr_FR', prefix: '/fr' },
  { code: 'de', label: 'DE', name: 'Deutsch', htmlLang: 'de', ogLocale: 'de_DE', prefix: '/de' },
];
const LOCALE_CODES = LOCALES.map((l) => l.code);
const DEFAULT_LOCALE = 'en';
const LOCALE_BY_CODE = new Map(LOCALES.map((l) => [l.code, l]));

class I18nError extends Error {}

const dictionaries = new Map();
function dictionary(locale) {
  if (!dictionaries.has(locale)) {
    const file = path.join(DICT_DIR, `${locale}.json`);
    if (!fs.existsSync(file)) throw new I18nError(`No dictionary for locale "${locale}"`);
    dictionaries.set(locale, JSON.parse(fs.readFileSync(file, 'utf8')));
  }
  return dictionaries.get(locale);
}

// Strict by default. A missing key throws at BUILD time rather than rendering an
// empty element that nobody notices until a German reader sees a blank column
// heading. There is no silent fallback to English: a page half in two languages
// is worse than a build that refuses to finish.
function t(locale, key, params) {
  const dict = dictionary(locale);
  let value = dict[key];
  if (value === undefined) {
    throw new I18nError(`Missing translation: "${key}" for locale "${locale}"`);
  }
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      value = value.split(`{${k}}`).join(String(v));
    }
  }
  if (/\{[a-zA-Z]+\}/.test(value)) {
    throw new I18nError(`Unsubstituted placeholder in "${key}" for "${locale}": ${value}`);
  }
  return value;
}

// The stored string, without substitution or placeholder checking. For audits
// and tests that enumerate keys — rendering always goes through t(), which
// stays strict so an unsubstituted {n} can never reach a page.
function raw(locale, key) {
  const value = dictionary(locale)[key];
  if (value === undefined) throw new I18nError(`Missing translation: "${key}" for locale "${locale}"`);
  return value;
}

// A translator bound to one locale, so a generator never has to thread the
// locale through every call site and can never mix two locales on one page.
function translator(locale) {
  if (!LOCALE_BY_CODE.has(locale)) throw new I18nError(`Unknown locale "${locale}"`);
  const fn = (key, params) => t(locale, key, params);
  fn.locale = locale;
  fn.meta = LOCALE_BY_CODE.get(locale);
  fn.has = (key) => dictionary(locale)[key] !== undefined;
  return fn;
}

// ── routes ──────────────────────────────────────────────────────────────────
// One canonical path per page, prefixed per locale. The English path is the
// canonical one and carries no prefix, matching the convention already used by
// /work/ and /de/work/.
function localizedPath(locale, canonicalPath) {
  if (!canonicalPath.startsWith('/')) throw new I18nError(`Path must be absolute: ${canonicalPath}`);
  const l = LOCALE_BY_CODE.get(locale);
  if (!l) throw new I18nError(`Unknown locale "${locale}"`);
  return `${l.prefix}${canonicalPath}`;
}

// The output file for a localized page, relative to the repository root.
function localizedFile(locale, canonicalPath) {
  return path.join(localizedPath(locale, canonicalPath).replace(/^\//, ''), 'index.html');
}

// A complete, bidirectional hreflang cluster. Every locale points at every
// other one INCLUDING itself, plus x-default at the English route — the
// convention already shipped on /work/. Reciprocity is structural here: the
// cluster is generated from one list, so a one-way link is not expressible.
function hreflangCluster(canonicalPath, absolute) {
  const alternates = LOCALES.map((l) => ({
    hreflang: l.code, href: absolute(localizedPath(l.code, canonicalPath)),
  }));
  alternates.push({ hreflang: 'x-default', href: absolute(canonicalPath) });
  return alternates;
}

// Where the language switcher sends a reader. Semantic destination: from
// /research/media-pr-publishing/ the DE link goes to the German version of THAT
// page, never to the German homepage.
function switcherFor(canonicalPath, currentLocale) {
  return LOCALES.map((l) => ({
    code: l.code, label: l.label, name: l.name,
    href: localizedPath(l.code, canonicalPath),
    current: l.code === currentLocale,
  }));
}

// ── enum labels ─────────────────────────────────────────────────────────────
// The VALUE stays canonical in the data; only the label is localized, and only
// here. A generator that wrote its own label map would fork the vocabulary.
function label(locale, namespace, value) {
  const key = `${namespace}.${value}`;
  const dict = dictionary(locale);
  if (dict[key] !== undefined) return dict[key];
  // An unlabelled enum value is a real gap and says so, rather than printing a
  // raw machine value into a German sentence.
  throw new I18nError(`No ${locale} label for ${namespace} value "${value}"`);
}

// ── audit helpers, used by the tests ────────────────────────────────────────
function allKeys(locale) { return Object.keys(dictionary(locale)).sort(); }

function missingKeys() {
  const base = new Set(allKeys(DEFAULT_LOCALE));
  const out = {};
  for (const code of LOCALE_CODES) {
    if (code === DEFAULT_LOCALE) continue;
    const have = new Set(allKeys(code));
    const missing = [...base].filter((k) => !have.has(k));
    const extra = [...have].filter((k) => !base.has(k));
    if (missing.length || extra.length) out[code] = { missing, extra };
  }
  return out;
}

module.exports = {
  I18nError, LOCALES, LOCALE_CODES, LOCALE_BY_CODE, DEFAULT_LOCALE,
  t, raw, translator, dictionary, label,
  localizedPath, localizedFile, hreflangCluster, switcherFor,
  allKeys, missingKeys,
};
