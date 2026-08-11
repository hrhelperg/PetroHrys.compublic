'use strict';

// The union of every route a generator owns.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// Several guards need to answer one question: "is this file allowed to have
// been written by a build?" They used to answer it from a hardcoded list —
// `['es/research/', 'fr/research/', 'de/research/']`. That list was correct on
// the day it was written and wrong the moment a second generator started owning
// /es/privacy/, at which point the guard failed on a legitimate change and the
// tempting fix was to append another string to the list.
//
// Appending to a list is how a guard rots: it encodes today's generators rather
// than the rule. This module asks each generator what it owns, so a new
// generator is covered the moment it exists, and a guard built on this cannot
// go stale without the generator itself disappearing.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');

// Generators that expose an explicit ownership list. Each must export
// ownedFiles(): string[] of repo-relative paths.
const DECLARING_GENERATORS = ['../build-static-pages.cjs'];

// Route families written by the dataset generators. These build thousands of
// pages from a manifest rather than a short list, so they are described by
// prefix; the prefix is derived from the locale registry rather than spelled out
// per locale, so adding a fifth locale needs no edit here.
const I18N = require('./i18n.cjs');

// Derived from the generators' own route constants, NOT spelled out here.
//
// The first version of this said `['research/']`, which looked right and was
// wrong: /research/ itself is a hand-authored hub page that the nav injector
// maintains, so claiming the whole subtree told the guards a hand-edited page
// was generator-owned. Asking bd-render and bd-routes for the four collection
// roots keeps this honest — if a collection moves, this follows it.
const routes = require('./bd-routes.cjs');
const render = require('./bd-render.cjs');
const COLLECTION_ROOTS = [
  routes.hubPath(),
  render.MARKETPLACES_PATH,
  render.MEDIA_PATH,
  render.PLANNER_PATH,
  render.TENDERS_PATH,
].map((p) => p.replace(/^\//, ''));
const GENERATED_PREFIXES = COLLECTION_ROOTS;

function declaredFiles() {
  const out = new Set();
  for (const rel of DECLARING_GENERATORS) {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const mod = require(rel);
    if (typeof mod.ownedFiles !== 'function') {
      throw new Error(`owned-routes: ${rel} must export ownedFiles()`);
    }
    for (const f of mod.ownedFiles()) out.add(f.replace(/\\/g, '/'));
  }
  return out;
}

// Every prefix under which a generator writes, across all locales.
function generatedPrefixes() {
  const prefixes = [];
  for (const code of I18N.LOCALE_CODES) {
    const base = code === I18N.DEFAULT_LOCALE ? '' : `${code}/`;
    for (const p of GENERATED_PREFIXES) prefixes.push(`${base}${p}`);
  }
  return prefixes;
}

// Is this repo-relative path written by some generator?
function isGenerated(rel) {
  const norm = rel.replace(/\\/g, '/');
  if (declaredFiles().has(norm)) return true;
  return generatedPrefixes().some((p) => norm.startsWith(p));
}

// Every localized HTML file on disk, for guards that sweep the locale trees.
function localizedFiles() {
  const out = [];
  for (const code of I18N.LOCALE_CODES) {
    if (code === I18N.DEFAULT_LOCALE) continue;
    const dir = path.join(ROOT, code);
    if (!fs.existsSync(dir)) continue;
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.html')) out.push(path.relative(ROOT, p).replace(/\\/g, '/'));
      }
    };
    walk(dir);
  }
  return out;
}

module.exports = { isGenerated, declaredFiles, generatedPrefixes, localizedFiles, GENERATED_PREFIXES };
