'use strict';

// ── "THE CANONICAL PLATFORM REGISTRY DID NOT MOVE", WITHOUT A LITERAL ───────
//
// Three phase-scope guards — to-alerts CM16/CM17/CM18, to-opportunities P3 and
// P5-M8 — each asserted `platforms.length === 384`. That is one JSON array
// length written out three times, so a single accounted platform addition
// (383 -> 384 was one) meant three edits in tests that had nothing to say about
// the addition, and each edit was indistinguishable from someone rubber-stamping
// a change they had not reviewed.
//
// The one place where the literal EARNS its keep is to-opportunities test 42,
// which pins the count and then names the single accounted addition, asserts its
// evidence class and its evidence URL. That is a curated cohort with its
// accounting attached, and it stays.
//
// What the other three were reaching for is publication integrity: the
// collection published exactly the registry it was built from. That is
// derivable, it is strictly more informative than a total (it catches a row
// that exists in the registry but never reached the CSV, which no count can
// see), and it needs no edit when research adds a platform.

const fs = require('node:fs');
const path = require('node:path');

const TP = require('../../lib/tp-schema.cjs');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const PLATFORMS_FILE = path.join(ROOT, 'data/tenders-procurement/platforms.json');
const COUNTRIES_FILE = path.join(ROOT, 'data/business-directories/countries.json');
const PUBLISHED_CSV = path.join(ROOT, 'research/tenders-procurement/platforms.csv');

// Minimal RFC 4180 record count. A naive newline split lasted exactly until the
// first operator name carrying a newline inside a quoted field.
function dataRows(csv) {
  let rows = 0;
  let quoted = false;
  for (let i = 0; i < csv.length; i += 1) {
    const c = csv[i];
    if (c === '"') {
      if (quoted && csv[i + 1] === '"') i += 1;
      else quoted = !quoted;
    } else if (c === '\n' && !quoted) rows += 1;
  }
  return rows - 1; // the header
}

function platformParity() {
  const known = new Set(JSON.parse(fs.readFileSync(COUNTRIES_FILE, 'utf8')).map((c) => c.slug));
  const all = TP.loadPlatforms(PLATFORMS_FILE, known);
  const publishable = all.filter(TP.isPublishable);
  const csv = fs.readFileSync(PUBLISHED_CSV, 'utf8').replace(/^﻿/, '');
  return { all, publishable, publishedRows: dataRows(csv) };
}

// The assertion itself, so the three call sites state the same property in the
// same words rather than three slightly different ones.
function assertPlatformPublicationParity(assert) {
  const { all, publishable, publishedRows } = platformParity();
  assert.ok(all.length > 300, `only ${all.length} platforms; the guard is near-vacuous`);
  assert.ok(publishable.length > 0, 'no publishable platform: everything below is vacuous');
  assert.strictEqual(publishedRows, publishable.length,
    `the collection published ${publishedRows} platform rows; the registry holds `
    + `${publishable.length} publishable records`);
}

module.exports = { platformParity, assertPlatformPublicationParity, dataRows };
