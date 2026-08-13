'use strict';

// Tender Alerts & Monitoring v1 — semantic change detection.
//
// ── WHAT THIS LAYER IS ──────────────────────────────────────────────────────
//
// The corpus answers "what is open?". This answers "what CHANGED, and is the
// change real?". It is a derived layer: it reads two corpus states and writes
// change events. It never edits a canonical fact.
//
// ── THE MONITORED FIELD MATRIX ──────────────────────────────────────────────
//
// Derived from the corpus schema as it actually is, not from a wish list. Each
// entry states how the field is compared and why, because the comparison
// strategy is where false positives are born.
//
//   FIELD              SOURCE  ALERTABLE  COMPARISON
//   status             yes     yes        exact, on a closed vocabulary
//   deadline           yes     yes        ISO instant ONLY when both sides are
//                                         decidable — see the zoneless rule
//   value              yes     yes        amount+currency; NEVER across
//                                         currencies (see below)
//   title              yes     yes        normalized text, material only
//   descriptionSummary yes     yes        normalized text, material only
//   buyerName          yes     yes        normalized text
//   classifications    yes     yes        set comparison on scheme:code
//   submissionUrl      yes     yes        normalized URL, tracking stripped
//   noticeType         yes     yes        exact
//   occurrences        derived yes        set of sourceIds
//   lotCount           yes     low        exact
//   publicationDate    yes     no         corrections are bookkeeping
//   sourceModifiedDate yes     no         an ingestion artefact, not an event
//   statusBasis        derived no         how we know, not what changed
//   fieldSources       derived no         provenance bookkeeping
//   occurrenceCount    derived no         implied by occurrences
//   multiSource        derived no         implied by occurrences
//   titles             source  no         translations of an unchanged title
//
// Everything marked "no" is deliberately unmonitored: alerting on provenance
// bookkeeping produces noise that trains a reader to ignore the feed.
//
// ── THE RULE THAT MATTERS MOST ──────────────────────────────────────────────
//
// A record vanishing from the corpus is NOT a cancellation. Sources use bounded
// windows, APIs fail, and this project deliberately retains last-good data when
// they do. Disappearance is reported as NO_LONGER_OBSERVED, never as CLOSED —
// and it is suppressed entirely when the source is not known-healthy, because a
// degraded source would otherwise emit thousands of fake removals.

const crypto = require('node:crypto');
const TIME = require('./to-time.cjs');

// ── CHANGE TYPES ────────────────────────────────────────────────────────────
//
// Every type here has a detection rule below. A type with no rule would be a
// promise the engine cannot keep.
const CHANGE_TYPES = [
  'NEW_OPPORTUNITY',
  'NO_LONGER_OBSERVED',
  'STATUS_CHANGED',
  'CANCELLED',
  'AWARDED',
  'REOPENED',
  'DEADLINE_EXTENDED',
  'DEADLINE_SHORTENED',
  'DEADLINE_SET',
  'DEADLINE_CHANGED_UNCOMPARABLE',
  'VALUE_CHANGED',
  'BUYER_CHANGED',
  'CLASSIFICATION_CHANGED',
  'SUBMISSION_ROUTE_CHANGED',
  'MATERIAL_TEXT_CHANGED',
  'SOURCE_OCCURRENCE_ADDED',
  'SOURCE_OCCURRENCE_REMOVED',
];

const ACTIONABLE = new Set([
  'NEW_OPPORTUNITY', 'REOPENED', 'DEADLINE_SHORTENED', 'DEADLINE_EXTENDED',
  'DEADLINE_SET', 'SUBMISSION_ROUTE_CHANGED', 'MATERIAL_TEXT_CHANGED',
  'CLASSIFICATION_CHANGED', 'VALUE_CHANGED', 'SOURCE_OCCURRENCE_ADDED',
]);

// Severity is MONITORING URGENCY, not predicted business impact. A cancelled
// tender is CRITICAL because acting on it wastes a bid, not because it is
// worth more money than one that was merely extended.
const SEVERITY = {
  CANCELLED: 'CRITICAL',
  DEADLINE_SHORTENED: 'CRITICAL',
  SUBMISSION_ROUTE_CHANGED: 'HIGH',
  REOPENED: 'HIGH',
  NEW_OPPORTUNITY: 'HIGH',
  AWARDED: 'MEDIUM',
  STATUS_CHANGED: 'MEDIUM',
  DEADLINE_EXTENDED: 'MEDIUM',
  DEADLINE_SET: 'MEDIUM',
  MATERIAL_TEXT_CHANGED: 'MEDIUM',
  VALUE_CHANGED: 'MEDIUM',
  CLASSIFICATION_CHANGED: 'MEDIUM',
  BUYER_CHANGED: 'MEDIUM',
  DEADLINE_CHANGED_UNCOMPARABLE: 'LOW',
  SOURCE_OCCURRENCE_ADDED: 'LOW',
  SOURCE_OCCURRENCE_REMOVED: 'LOW',
  NO_LONGER_OBSERVED: 'INFORMATIONAL',
};

const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL'];

// ── NORMALIZATION ───────────────────────────────────────────────────────────
//
// Applied before comparison so that formatting churn is not mistaken for
// procurement news. Each rule is narrow: normalization that erases a real
// difference is worse than the noise it removes.

// Collapse whitespace, strip zero-width characters, drop trailing punctuation.
// Case is PRESERVED: "LOT 3" becoming "Lot 3" is cosmetic, but lowercasing
// everything would hide a buyer renaming a procedure in a meaningful way.
function normalizeText(v) {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[​-‍﻿]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[\s.,;:]+$/, '')
    .trim();
  return s || null;
}

// Text is compared case- and punctuation-insensitively for MATERIALITY only.
// A change that survives this is a change of words, not of typography.
function materialKey(v) {
  const s = normalizeText(v);
  if (!s) return null;
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

// Tracking parameters churn on every refresh for some publishers. Stripping
// them stops a submission-route alert firing because a campaign id rotated.
// `utm_` is a PREFIX, not a parameter name. The first version anchored it as
// /^utm_$/, which matches nothing real — utm_source, utm_campaign and the rest
// all sailed through, and a rotating campaign id would have fired a
// submission-route alert on every refresh.
const TRACKING_PARAMS = /^(utm_[a-z0-9_]*|gclid|fbclid|msclkid|mc_cid|mc_eid|_ga|ref|source)$/i;

function normalizeUrl(v) {
  if (typeof v !== 'string' || !/^https?:\/\//i.test(v)) return null;
  let u;
  try { u = new URL(v.trim()); } catch { return v.trim(); }
  for (const k of [...u.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(k)) u.searchParams.delete(k);
  }
  u.hash = '';
  u.hostname = u.hostname.toLowerCase();
  // A trailing slash is not a route change.
  u.pathname = u.pathname.replace(/\/+$/, '') || '/';
  return u.toString();
}

const codeSet = (list) => (list || []).map((c) => `${c.scheme}:${c.code}`).sort().join(',');
const sourceSet = (o) => [...new Set((o.occurrences || []).map((x) => x.sourceId))].sort();

// ── DETERMINISTIC CHANGE IDENTITY ───────────────────────────────────────────
//
// Reproducible from the same before/after pair. No UUIDs, and deliberately no
// ingestion timestamp: hashing "when we noticed" would give the same semantic
// change a new id on every rebuild, and the ledger would never converge.
function changeId(opportunityId, type, beforeKey, afterKey) {
  const basis = [opportunityId, type, beforeKey ?? '', afterKey ?? ''].join('|');
  return `chg_${crypto.createHash('sha256').update(basis).digest('hex').slice(0, 16)}`;
}

// ── COMPARISON IS ENTRY-TO-ENTRY, NOT OPPORTUNITY-TO-OPPORTUNITY ────────────
//
// The first version of this compared a rehydrated previous opportunity against
// the live one. That required reconstructing fields the baseline never stored,
// and the reconstruction was lossy: title and description were packed into one
// key and split back apart on a space, so any multi-word title came back wrong
// and fired a false MATERIAL_TEXT_CHANGED on every refresh.
//
// Comparing the compact entries directly removes the whole class of problem.
// The baseline stores exactly what is monitored; if a field is not in the
// entry it cannot be compared, which is the honest constraint rather than an
// invented reconstruction.
function changesBetween(opportunityId, prev, next) {
  const out = [];
  const at = (type, before, after, detail) => out.push({
    id: changeId(opportunityId, type, before, after),
    opportunityId,
    type,
    severity: SEVERITY[type],
    actionable: ACTIONABLE.has(type),
    before: before ?? null,
    after: after ?? null,
    ...(detail ? { detail } : {}),
  });

  // status
  if (prev.s !== next.s) {
    if (next.s === 'CANCELLED') at('CANCELLED', prev.s, next.s);
    else if (next.s === 'AWARDED') at('AWARDED', prev.s, next.s);
    else if ((prev.s === 'CANCELLED' || prev.s === 'CLOSED')
      && (next.s === 'OPEN' || next.s === 'UPCOMING')) at('REOPENED', prev.s, next.s);
    else at('STATUS_CHANGED', prev.s, next.s);
  }

  // deadline
  if (prev.d !== next.d) {
    if (!prev.d && next.d) at('DEADLINE_SET', null, next.d);
    else if (prev.d && !next.d) at('DEADLINE_CHANGED_UNCOMPARABLE', prev.d, null);
    else {
      const a = TIME.normalizeTimestamp(prev.d);
      const b = TIME.normalizeTimestamp(next.d);
      if (TIME.isDecidable(a) && TIME.isDecidable(b)) {
        if (a.iso !== b.iso) {
          const days = Math.round((Date.parse(b.iso) - Date.parse(a.iso)) / 86400000);
          at(days > 0 ? 'DEADLINE_EXTENDED' : 'DEADLINE_SHORTENED', a.iso, b.iso, { days });
        }
        // same instant, different source formatting: not news
      } else {
        at('DEADLINE_CHANGED_UNCOMPARABLE', prev.d, next.d);
      }
    }
  }

  // value — never compared across currencies
  if (prev.v !== next.v) {
    const cur = (k) => (k ? String(k).split(':')[0] : null);
    const currencyChanged = Boolean(prev.v && next.v && cur(prev.v) !== cur(next.v));
    at('VALUE_CHANGED', prev.v, next.v,
      currencyChanged ? { currencyChanged: true, comparable: false } : { comparable: true });
  }

  if (prev.b !== next.b) at('BUYER_CHANGED', prev.b, next.b);
  if (prev.c !== next.c) at('CLASSIFICATION_CHANGED', prev.c, next.c);
  if (prev.u !== next.u) at('SUBMISSION_ROUTE_CHANGED', prev.u, next.u);
  if (prev.t !== next.t) at('MATERIAL_TEXT_CHANGED', prev.t, next.t);

  if (prev.o !== next.o) {
    const a = (prev.o || '').split(',').filter(Boolean);
    const b = (next.o || '').split(',').filter(Boolean);
    const added = b.filter((x) => !a.includes(x));
    const removed = a.filter((x) => !b.includes(x));
    if (added.length) at('SOURCE_OCCURRENCE_ADDED', prev.o || null, next.o, { added });
    if (removed.length) at('SOURCE_OCCURRENCE_REMOVED', prev.o, next.o || null, { removed });
  }

  return out;
}

// ── THE BASELINE ────────────────────────────────────────────────────────────
//
// A compact semantic fingerprint per opportunity — the minimum needed to
// detect the monitored changes. It is committed, because a comparison baseline
// that lives in a gitignored file is exactly the failure Phase 5 found: a fresh
// CI clone would have nothing to compare against and would report the entire
// corpus as new.
// Text is stored as a DIGEST, not as text.
//
// The baseline exists to answer "did this change?", which a hash answers
// exactly as well as the prose does. Storing normalized title and description
// in full made the committed baseline 4.47 MB — 467 bytes per opportunity,
// rewritten on every refresh — and nearly all of it was text the engine never
// reads back.
//
// The cost is that a MATERIAL_TEXT_CHANGED alert cannot quote the previous
// wording. That is a fair trade: the current title is in the corpus, the
// previous one stops being true the moment it changes, and a stale "before"
// string is the least useful part of a text-change alert.
function textDigest(o) {
  const basis = `${materialKey(o.title) || ''} ${materialKey(o.descriptionSummary) || ''}`;
  return crypto.createHash('sha256').update(basis).digest('hex').slice(0, 12);
}

function baselineEntry(o) {
  return {
    s: o.status,
    d: o.deadline && o.deadline.raw ? o.deadline.raw : null,
    v: o.value ? `${o.value.currency}:${o.value.amount ?? ''}:${o.value.amountMin ?? ''}:${o.value.amountMax ?? ''}` : null,
    b: materialKey(o.buyerName),
    c: codeSet(o.classifications) || null,
    u: normalizeUrl(o.submissionUrl),
    t: textDigest(o),
    o: sourceSet(o).join(','),
  };
}


module.exports = {
  CHANGE_TYPES, ACTIONABLE, SEVERITY, SEVERITY_ORDER, TRACKING_PARAMS,
  normalizeText, materialKey, normalizeUrl, codeSet, sourceSet,
  changeId, changesBetween, baselineEntry, textDigest,
};
