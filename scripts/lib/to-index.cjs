'use strict';

// Tender Discovery & Search v1 — the search index projection.
//
// This turns canonical opportunities into the artifact the browser downloads.
// It is a PROJECTION, not a second corpus: every field here is either copied
// from a canonical fact or derived by an engine that already exists. Nothing
// is invented, and nothing canonical is edited.
//
// ── WHY THE INDEX STORES ORIGINALS, NOT NORMALIZED TEXT ─────────────────────
//
// The search engine scores against lowercased, diacritic-folded text. The
// obvious design stores that normalized text in the index. It is the wrong
// one twice over:
//
//   1. The page also needs the ORIGINAL title to display. Storing both the
//      original and the normalized form writes every word to the artifact
//      twice, and the artifact is a browser download.
//   2. A stored normalized title is a second copy of a canonical fact that can
//      drift from it. The title a buyer chose is the title we show.
//
// So the index carries originals and the engine normalizes once at load. That
// keeps ONE normalization implementation — the engine's — and makes it
// structurally impossible for the displayed title to disagree with the
// searched title.
//
// This is also why the pre-concatenated all-text blob is gone and must not
// return: it stored every searchable word a second time and took the artifact
// from 9.31 MB to 4.07 MB when removed.

const MATCH = require('./to-match.cjs');
const SCHEMA = require('./to-schema.cjs');
const TIME = require('./to-time.cjs');
const RELATED = require('./to-related.cjs');

const FORMAT = 'discovery-1';

// ── THE FIELD CONTRACT ──────────────────────────────────────────────────────
//
// Every key a projected record may carry, declared once. Phase 2 lost
// `publishedEuWide` twice because a columnar encoder silently dropped a field
// it had no column for, so this projection refuses the same failure: a record
// carrying an undeclared key is a crash, not a quiet omission.
//
// Short keys because this file is downloaded. The mapping to their meaning is
// here and nowhere else.
const FIELDS = [
  'i',   // canonical opportunity id
  'ti',  // title, ORIGINAL — never translated, never normalized
  'bu',  // buyer name, ORIGINAL
  'de',  // description summary, truncated for payload
  'cd',  // classification codes, space-joined, for exact-code search
  'la',  // classification labels, ORIGINAL source labels
  'sc',  // classification schemes present (CPV / UNSPSC), comma-joined
  's',   // canonical status
  'co',  // buyer country
  'pc',  // project / procurement country
  'sr',  // source id
  'pl',  // source platform id
  'cu',  // declared value currency, source-reported
  'vl',  // declared value amount, source-reported, NEVER converted
  'dl',  // days until deadline — only when the deadline resolved to an instant
  'dr',  // deadline as the source wrote it, for display
  'pb',  // publication date, YYYY-MM-DD
  'es',  // electronic submission tri-state: yes / no / unknown
  'bc',  // browser check required — a property of the PLATFORM surface
  'u',   // official notice url
  'su',  // submission url, when the source gives a distinct one
  'ms',  // observed by more than one source
  'oc',  // occurrence count
  'm',   // derived supplier-profile match bands — DERIVED, not canonical
  'f',   // retrieval family id — DERIVED presentation grouping, never a merge
];

const KNOWN = new Set(FIELDS);

function unknownFields(rec) {
  return Object.keys(rec).filter((k) => !KNOWN.has(k)).sort();
}

// Fields deliberately NOT projected, so that "why is this missing" has an
// answer rather than being an oversight:
//
//   titles, fieldSources, occurrences, statusBasis,
//   electronicSubmissionBasis, sourceModifiedDate, subnationalJurisdiction,
//   coverage, noticeType, procedureType, language, lotCount,
//   officialReference, projectId, frameworkAgreement, hasAmendments,
//   isAmendment, publishedEuWide
//
// These are provenance and bookkeeping. They are what makes the corpus
// auditable, not what makes a tender findable, and shipping them would grow a
// browser download to carry data no control reads.
const OMITTED = [
  'titles', 'fieldSources', 'occurrences', 'statusBasis',
  'electronicSubmissionBasis', 'sourceModifiedDate', 'subnationalJurisdiction',
  'coverage', 'noticeType', 'procedureType', 'language', 'lotCount',
  'officialReference', 'projectId', 'frameworkAgreement', 'hasAmendments',
  'isAmendment', 'publishedEuWide',
];

// Canonical fields this projection READS. Together with OMITTED this must
// account for every key a canonical opportunity carries.
const CONSUMED = [
  'id', 'title', 'buyerName', 'descriptionSummary', 'classifications',
  'status', 'country', 'projectCountry', 'sourceId', 'sourcePlatformId',
  'sourceNoticeId', 'value', 'deadline', 'publicationDate',
  'electronicSubmission', 'sourceUrl', 'submissionUrl', 'multiSource',
  'occurrenceCount',
];

const ACCOUNTED = new Set([...CONSUMED, ...OMITTED]);

// ── THE GUARD THAT ACTUALLY GUARDS ──────────────────────────────────────────
//
// The first version of this checked the fields of the record this module
// BUILDS. That check can never fire: the output is an object literal written
// right here, so it cannot contain a key the literal does not mention. It
// would have passed forever while a new canonical fact was silently dropped —
// which is precisely the Phase 2 failure it was meant to prevent.
//
// The loss happens on the way IN, so the guard belongs on the input. A new
// canonical field must be either projected or explicitly listed as omitted;
// appearing in neither is a crash.
function unaccountedFields(o) {
  return Object.keys(o).filter((k) => !ACCOUNTED.has(k)).sort();
}

// Descriptions are the largest text field and the least load-bearing for
// finding a tender: the title and the classification carry the signal. Capped
// rather than dropped, because a description hit is still a real hit.
const DESCRIPTION_CAP = 120;

// Only STRONG and GOOD bands are stored. Below GOOD the matching engine's own
// alert floor treats a match as noise, and storing five bands for sixteen
// profiles on seven thousand records would be most of the payload.
const STORED_BANDS = { STRONG: 1, GOOD: 1 };

// ── PERSONAL DATA ───────────────────────────────────────────────────────────
//
// The corpus already redacts contact prose and drops structured contact
// fields at ingestion. This is the second gate, at the publication boundary:
// an address that survived upstream must not reach a public artifact.
// Only addresses. A phone-number pattern was tried here and removed: it
// rewrote 465 real titles, because "mandat 2026-2032", "PROGRAMME 2026-2028"
// and reference numbers like "2026-186-DPER" all look exactly like a phone
// number to a regex. Destroying a procurement fact to redact data that is not
// there is a worse failure than the one it guards against, and the corpus
// already strips contact fields and redacts contact prose at ingestion.
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

function scrub(text) {
  if (!text) return '';
  return String(text).replace(EMAIL, '[contact removed]');
}

// ── NEGATIONS IN CLASSIFICATION LABELS ──────────────────────────────────────
//
// Classification labels are the source's own words, and some of them name a
// thing only in order to EXCLUDE it:
//
//   CPV 30 — "Office and computing machinery ... except furniture and
//             software packages"
//   CPV 51 — "Installation services (except software)"
//
// Searching the label verbatim reads "except software" as evidence FOR
// software. It was the single largest source of false positives in the
// relevance audit: 143 of 502 "software" hits matched only through one of
// those two exclusions, and in 136 of them the word appeared nowhere else in
// the record. An envelope framework and a water-meter replacement were
// returned as software procurements.
//
// So the exclusion clause is dropped from the SEARCHABLE text. The canonical
// label is untouched — this changes what the label matches, never what it
// says, and the code and scheme still travel with the record.
const NEGATION = /\s*[(,]?\s*\b(?:except|excluding|other than)\b[^),;]*\)?/gi;

function searchableLabel(label) {
  return String(label || '').replace(NEGATION, '').replace(/\s{2,}/g, ' ').trim();
}

// ── PROJECTION ──────────────────────────────────────────────────────────────

function projectOne(o, { nowIso, platformsById, profiles }) {
  const unaccounted = unaccountedFields(o);
  if (unaccounted.length) {
    throw new Error(`Discovery index has no field for: ${unaccounted.join(', ')} `
      + `(record ${o.id}). Project it in FIELDS or list it in OMITTED, rather than losing the fact.`);
  }
  const platform = platformsById.get(o.sourcePlatformId) || null;
  const classifications = o.classifications || [];

  // Match bands come from the frozen matching engine. This module does not
  // know what score makes a match Strong and must never learn.
  const m = {};
  for (let i = 0; i < profiles.length; i += 1) {
    const key = profiles[i];
    const r = MATCH.matchFor(o, key, { nowIso, platform });
    if (STORED_BANDS[r.band]) m[key] = r.band;
  }

  const days = TIME.daysUntil(o.deadline, nowIso);

  const rec = {
    i: o.id,
    ti: scrub(o.title),
    bu: scrub(o.buyerName) || null,
    de: scrub((o.descriptionSummary || '').slice(0, DESCRIPTION_CAP)) || null,
    cd: classifications.map((c) => c.code).join(' ') || null,
    la: classifications.map((c) => searchableLabel(c.label)).filter(Boolean).join(' ') || null,
    sc: [...new Set(classifications.map((c) => c.scheme))].sort().join(',') || null,
    s: o.status,
    co: o.country || null,
    pc: o.projectCountry || null,
    sr: o.sourceId,
    pl: o.sourcePlatformId,
    cu: o.value ? o.value.currency : null,
    // amountMax is used only when a single amount is absent: a range's upper
    // bound is what the source declared, not a midpoint we computed.
    vl: o.value ? (o.value.amount != null ? o.value.amount : (o.value.amountMax != null ? o.value.amountMax : null)) : null,
    dl: days == null ? null : days,
    dr: o.deadline && o.deadline.raw ? o.deadline.raw : null,
    pb: o.publicationDate && o.publicationDate.iso ? o.publicationDate.iso.slice(0, 10) : null,
    es: o.electronicSubmission || 'unknown',
    // A property of the platform surface, carried onto the record so the
    // browser needs one file. It says the SOURCE needs a real browser to
    // verify — never that the procurement is doubtful.
    bc: platform ? platform.browserCheckRequired === true : false,
    u: o.sourceUrl || null,
    su: o.submissionUrl || null,
    ms: o.multiSource === true,
    oc: o.occurrenceCount || 1,
    m,
  };

  // Second half of the contract: the record built here may only use declared
  // keys. The input guard above catches a lost canonical fact; this catches a
  // key added to the projection without being declared.
  const unknown = unknownFields(rec);
  if (unknown.length) {
    throw new Error(`Discovery index emitted an undeclared field: ${unknown.join(', ')} `
      + `(record ${o.id}). Add it to FIELDS.`);
  }
  return rec;
}

// Build the whole index.
//
// Only CURRENT opportunities are projected. Discovery is a product for finding
// tenders a supplier can still act on; an awarded contract from last year is a
// different product with different semantics. Excluding them at projection
// time — not only at filter time — means no query, crafted or accidental, can
// surface a cancelled procurement as an opportunity.
function build(corpus, { platformsById, profiles = Object.keys(MATCH.PROFILES).slice().sort() } = {}) {
  const nowIso = corpus.generatedAt;
  const records = corpus.opportunities
    .filter((o) => SCHEMA.isCurrent(o))
    .map((o) => projectOne(o, { nowIso, platformsById, profiles }))
    // Deterministic order by canonical id, so two builds of the same corpus
    // produce a byte-identical artifact regardless of corpus array order.
    .sort((a, b) => (a.i < b.i ? -1 : a.i > b.i ? 1 : 0));
  const byId = new Map(records.map((r) => [r.i, r]));

  // Retrieval families are a property of the corpus, not of a query, so they
  // are computed once here rather than in every browser on every keystroke.
  // Only members carry the field: 235 of 6,964 records, so the artifact grows
  // by the families that exist rather than by the records that do not.
  const search = require('./to-search.cjs');
  search.hydrate({ records });
  const { families } = RELATED.detectFamilies(records);
  for (const fam of families) {
    for (const id of fam.memberIds) byId.get(id).f = fam.familyId;
  }

  return {
    format: FORMAT,
    generatedAt: nowIso,
    // Facets are computed here, once, from the records actually present. The
    // page never hardcodes a source list or a country list: a control that
    // offers a value with no records behind it is a dead control.
    facets: facetsOf(records),
    records,
  };
}

// Distinct values with counts, for building filter controls that can only
// offer what the data contains.
function facetsOf(records) {
  const tally = (fn) => {
    const m = new Map();
    for (const r of records) {
      const v = fn(r);
      if (v == null || v === '') continue;
      m.set(v, (m.get(v) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1))
      .map(([value, count]) => ({ value, count }));
  };
  const profiles = new Map();
  for (const r of records) {
    for (const k of Object.keys(r.m)) profiles.set(k, (profiles.get(k) || 0) + 1);
  }
  return {
    status: tally((r) => r.s),
    country: tally((r) => r.co),
    projectCountry: tally((r) => r.pc),
    source: tally((r) => r.sr),
    platform: tally((r) => r.pl),
    currency: tally((r) => r.cu),
    esubmission: tally((r) => r.es),
    browserCheck: tally((r) => (r.bc ? 'yes' : 'no')),
    scheme: tally((r) => r.sc).flatMap((e) => e.value.split(',').map((v) => ({ value: v, count: e.count })))
      .reduce((acc, e) => {
        const hit = acc.find((x) => x.value === e.value);
        if (hit) hit.count += e.count; else acc.push({ value: e.value, count: e.count });
        return acc;
      }, []).sort((a, b) => b.count - a.count),
    profile: [...profiles.entries()].sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1))
      .map(([value, count]) => ({ value, count })),
  };
}

// Serialize deterministically. Key order follows FIELDS so the artifact is
// stable across Node versions and object-construction order.
function serialize(index) {
  const rows = index.records.map((r) => {
    const out = {};
    for (const f of FIELDS) {
      const v = r[f];
      if (v === null || v === undefined) continue;
      if (f === 'm' && Object.keys(v).length === 0) continue;
      if (f === 'ms' && v === false) continue;
      if (f === 'bc' && v === false) continue;
      if (f === 'oc' && v === 1) continue;
      out[f] = v;
    }
    return out;
  });
  return `${JSON.stringify({
    format: index.format,
    generatedAt: index.generatedAt,
    facets: index.facets,
    records: rows,
  })}\n`;
}

module.exports = {
  FORMAT, FIELDS, OMITTED, DESCRIPTION_CAP, STORED_BANDS,
  CONSUMED, NEGATION, unknownFields, unaccountedFields, scrub, searchableLabel,
  projectOne, build, facetsOf, serialize,
};
