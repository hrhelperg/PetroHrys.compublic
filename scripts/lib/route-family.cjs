'use strict';

// Generated route families — the second mechanism in the route policy.
//
// `routes` in data/route-policy.json are individually maintained exceptions,
// each carrying a human-authored reason. That registry is an anti-drift guard,
// and its value comes from every entry having been thought about. Adding 6,817
// generated rows to it would destroy exactly the property it exists for.
//
// So a family is a second, narrower thing: permission for ONE named generator
// to emit routes under one prefix, in one shape, for one declared locale set —
// and only where the route corresponds to a record that actually exists.
//
// ── WHAT MAKES THIS SAFE ────────────────────────────────────────────────────
//
// A family is NOT a wildcard. Authorization needs three independent things:
//
//   1. SHAPE      — the path is under the prefix with exactly the declared
//                   number of segments. No nesting, no traversal, no query.
//   2. LOCALE     — the locale is one the family declares.
//   3. MEMBERSHIP — the route is in the set the owning generator derives from
//                   canonical data. This is the one that matters: shape alone
//                   would authorize any invented id under the prefix.
//
// Membership is supplied by the caller rather than recomputed here, because
// the generator is the authority on what it emits and this module must not
// become a second source of truth about canonical records.

const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..', '..');
const POLICY_FILE = path.join(ROOT, 'data', 'route-policy.json');

function load(file = POLICY_FILE) {
  const policy = JSON.parse(fs.readFileSync(file, 'utf8'));
  return policy.generatedFamilies || [];
}

// A family must be specific. These checks run over the registry itself, so a
// future edit cannot quietly widen a family into a global bypass.
function validateFamily(f) {
  const problems = [];
  if (!f.id) problems.push('MISSING_ID');
  if (!f.generator) problems.push('MISSING_GENERATOR');
  if (!Array.isArray(f.locales) || !f.locales.length) problems.push('MISSING_LOCALES');
  if (!f.reason || f.reason.length < 40) problems.push('MISSING_REASON');
  if (typeof f.prefix !== 'string' || !f.prefix.startsWith('/') || !f.prefix.endsWith('/')) {
    problems.push('BAD_PREFIX');
  } else if (f.prefix === '/' || f.prefix.split('/').filter(Boolean).length < 2) {
    // "/" or "/research/" is too broad to be a family.
    problems.push('PREFIX_TOO_BROAD');
  }
  if (f.segments !== 1) problems.push('ONLY_SINGLE_SEGMENT_FAMILIES_SUPPORTED');
  if (/[*?]/.test(f.prefix || '')) problems.push('WILDCARD_NOT_ALLOWED');
  return problems;
}

// Shape only. Deliberately separate from authorization so a caller cannot
// mistake "looks like one" for "is one".
function matchesShape(route, family) {
  if (typeof route !== 'string' || !route.startsWith(family.prefix)) return false;
  const tail = route.slice(family.prefix.length);
  if (!tail.endsWith('/')) return false;
  const inner = tail.slice(0, -1);
  if (!inner) return false;                       // the prefix itself is the hub
  if (inner.split('/').length !== family.segments) return false;
  if (inner.includes('..') || inner.includes('?') || inner.includes('#')) return false;
  return /^[a-z0-9][a-z0-9-]*$/.test(inner);
}

function familyFor(route, families) {
  return families.find((f) => matchesShape(route, f)) || null;
}

// The real question. `knownRoutes` is the set the owning generator derives
// from canonical records; without it, nothing is authorized.
function authorize(route, families, { knownRoutes, locale = 'en' } = {}) {
  const family = familyFor(route, families);
  if (!family) return { authorized: false, reason: 'NO_MATCHING_FAMILY' };
  if (!family.locales.includes(locale)) return { authorized: false, reason: 'LOCALE_NOT_IN_FAMILY', family: family.id };
  if (!knownRoutes) return { authorized: false, reason: 'NO_MEMBERSHIP_EVIDENCE', family: family.id };
  if (!knownRoutes.has(route)) return { authorized: false, reason: 'NOT_A_CANONICAL_RECORD', family: family.id };
  return { authorized: true, family: family.id, disposition: family.disposition };
}

module.exports = { POLICY_FILE, load, validateFamily, matchesShape, familyFor, authorize };
