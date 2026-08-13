'use strict';

// Tender Opportunity Intelligence v1 — the CANONICAL OPPORTUNITY MODEL.
//
// ── AN OPPORTUNITY IS NOT A PLATFORM ────────────────────────────────────────
//
// The platforms collection has 382 records answering "where does procurement
// happen?". This model answers "what is being procured, by whom, until when?".
// They are different entities with different lifetimes: a platform is stable
// for years, an opportunity is dead in six weeks. Mixing them would give the
// platforms collection a decay rate it does not have and would make every
// tender look like infrastructure.
//
// The link is one field — `sourcePlatformId` — and it is a hard reference. An
// opportunity whose platform is not in the canonical collection is rejected,
// not auto-created. Ingestion cannot mint procurement systems.
//
// ── THREE LAYERS, NEVER COLLAPSED ───────────────────────────────────────────
//
//   RAW        what the source sent, per occurrence, untouched apart from the
//              personal-data strip
//   CANONICAL  normalized fields with the source that produced each one
//   DERIVED    anything computed — status from dates, match scores, bands
//
// A derived value never overwrites a source fact and never inherits a source
// fact's authority. `status` carries `statusBasis` for exactly this reason: a
// reader must be able to tell "the buyer says this is cancelled" from "nobody
// said anything and the deadline is in the past".
//
// ── THE FIELD AUDIT ─────────────────────────────────────────────────────────
//
// The brief listed ~35 candidate fields. Each was checked against the five
// pilot payloads before earning a place:
//
//   COMMON (all or nearly all sources)
//     id, sourceId, sourcePlatformId, sourceNoticeId, sourceUrl, title,
//     buyerName, country, publicationDate, deadline, status, noticeType
//
//   SOURCE_SPECIFIC (kept, nullable)
//     classifications (4/5 — the World Bank publishes no subject code)
//     procedureType (3/5), value (3/5), language (2/5), lotCount (1/5),
//     projectCountry (1/5 — multilateral only), subnationalJurisdiction (2/5)
//
//   DERIVED (computed, never stored as source fact)
//     statusBasis, daysUntilDeadline, freshness
//
//     electronicSubmission, submissionUrl, frameworkAgreement (1/5 — only the
//     UK's OCDS payload states these per notice; see below)
//
//   NOT_RELIABLY_AVAILABLE — DROPPED
//     foreignSupplierEligibility  no pilot source states it per notice
//     openingDate, awardDate      award-stage fields, out of scope for "open"
//     dynamicPurchasingSystem     no pilot source exposes it in the fields read
//     documentsUrl                no source gives a per-notice document route
//                                 distinct from the notice page itself
//
// ── THE TWO FIELDS THAT LOOK ALIKE AND ARE NOT ──────────────────────────────
//
// `electronicSubmission` exists on the PLATFORM record for 382 systems and it
// exists here for a handful of UK notices, and they mean different things.
// The platform field says "this system can accept electronic bids". The
// opportunity field says "THIS procedure accepts them". A system that supports
// e-submission still runs procedures that demand sealed paper.
//
// So the opportunity value is set ONLY from a source statement — UK FTS
// publishes tender.submissionTerms.electronicSubmissionPolicy — and is null
// everywhere else. It is never seeded from the platform, and a test asserts
// that the 382 platform values cannot leak into a single opportunity.
//
// Dropping `foreignSupplierEligibility` is the most important decision in this
// file. Part 46 warns against inheriting the platform's value; the audit found
// something stronger — NO pilot source publishes it at notice level at all. So
// it is not a nullable field that happens to be empty, it is a field this
// layer cannot honestly carry. Foreign eligibility is surfaced as the
// PLATFORM's verified state, explicitly labelled as such, and the opportunity
// never claims it.

const CLASS = require('./to-classification.cjs');
const TIME = require('./to-time.cjs');
const ISO = require('./iso-3166-2.cjs');

// Two subnational vocabularies, kept apart on purpose. See the validation note
// below — a NUTS region and an ISO subdivision are not interchangeable, and
// the pilot proved it by shipping both.
const SUBNATIONAL_SCHEMES = ['ISO-3166-2', 'NUTS'];

// ── STATUS ──────────────────────────────────────────────────────────────────
//
// Derived from what the sources actually say, not from the brief's sketch.
// Observed vocabularies:
//
//   UK FTS      tender.status: active | complete | cancelled | withdrawn | planned
//   CanadaBuys  tenderStatus:  Open | Closed | Cancelled | Awarded ...
//   SECOP II    fase:          Presentación de oferta | Fase de ofertas |
//                              Adjudicado | Terminado | Convocatoria ...
//   World Bank  notice_status: Published | Cancelled | Draft
//   TED         no per-notice status field; scope=ACTIVE is a query filter
//
// Five vocabularies, one canonical set. The mapping lives in the adapters —
// each source knows its own words — and the canonical set stays small.
const STATUSES = ['OPEN', 'UPCOMING', 'CLOSED', 'AWARDED', 'CANCELLED', 'UNKNOWN'];

// How we came to believe the status. This is the field that keeps the system
// honest about the difference between a fact and an inference.
const STATUS_BASES = [
  'SOURCE_REPORTED',        // the source published a status and we mapped it
  'SOURCE_SCOPE',           // the source's query scope guarantees it (TED ACTIVE)
  'DERIVED_FROM_DEADLINE',  // no status published; the deadline decided it
  'UNKNOWN',                // no status, no decidable deadline
];

const NOTICE_TYPES = [
  'CONTRACT_NOTICE', 'PRIOR_INFORMATION', 'EXPRESSION_OF_INTEREST',
  'REQUEST_FOR_PROPOSAL', 'REQUEST_FOR_QUOTATION', 'INVITATION_FOR_BIDS',
  'CONTRACT_AWARD', 'OTHER', 'UNKNOWN',
];

const VALUE_BASES = ['ESTIMATED', 'MAXIMUM', 'AWARDED', 'UNKNOWN'];

const REQUIRED = ['id', 'sourceId', 'sourcePlatformId', 'sourceNoticeId', 'sourceUrl', 'title'];

// ── DETERMINISTIC IDENTITY ──────────────────────────────────────────────────
//
// Never a UUID. This repository builds byte-identical output from the same
// input, and a random id would make every ingestion rewrite every page.
//
// Identity is (source, source notice id). Title is deliberately NOT part of
// it: titles are neither unique nor stable — an amended notice keeps its
// reference and changes its title, and treating that as a new opportunity is
// how a corpus fills with phantom tenders.
function opportunityId(sourceId, sourceNoticeId) {
  const slug = String(sourceNoticeId || '')
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  if (!slug) return null;
  return `${sourceId}:${slug}`;
}

// A source-scoped fallback for the rare notice with no stable identifier.
// Built from the strongest stable properties available, in a fixed order, so
// the same notice yields the same id on every run. Still deterministic; still
// not a hash of the whole record, because then any typo fix would fork it.
function derivedNoticeId(parts) {
  const basis = parts.filter(Boolean).map((p) => String(p).trim().toLowerCase()).join('|');
  if (!basis) return null;
  let h = 0x811c9dc5;
  for (let i = 0; i < basis.length; i += 1) {
    h ^= basis.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `d${h.toString(36)}`;
}

// ── STATUS DERIVATION ───────────────────────────────────────────────────────
//
// Source-reported status ALWAYS wins. A buyer that cancelled a procedure has
// said something we cannot improve on by looking at a calendar, and a deadline
// in the future does not reopen a cancelled tender.
//
// Only when the source published nothing does the deadline get a vote — and
// only when that deadline is decidable (see to-time.cjs). A zoneless deadline
// decides nothing.
function resolveStatus({ reportedStatus, deadline, nowIso, noticeType = null }) {
  // A CONTRACT AWARD notice announces a decision. The World Bank marks such
  // notices notice_status "Published", which maps to OPEN and produced 554
  // records in the pilot claiming that an already-awarded contract was open
  // for bids. The notice TYPE overrides the publication status here, because
  // "published" describes the notice and "awarded" describes the procurement.
  if (noticeType === 'CONTRACT_AWARD'
    && (!reportedStatus || reportedStatus === 'OPEN' || reportedStatus === 'UNKNOWN')) {
    return { status: 'AWARDED', statusBasis: 'SOURCE_REPORTED' };
  }
  if (reportedStatus && STATUSES.includes(reportedStatus) && reportedStatus !== 'UNKNOWN') {
    return { status: reportedStatus, statusBasis: 'SOURCE_REPORTED' };
  }
  const passed = TIME.hasPassed(deadline, nowIso);
  if (passed === true) return { status: 'CLOSED', statusBasis: 'DERIVED_FROM_DEADLINE' };
  if (passed === false) return { status: 'OPEN', statusBasis: 'DERIVED_FROM_DEADLINE' };
  return { status: 'UNKNOWN', statusBasis: 'UNKNOWN' };
}

// Statuses that may appear in a "current opportunities" view. AWARDED and
// CLOSED are historical; CANCELLED is emphatically not current; UNKNOWN is not
// asserted as open.
const CURRENT_STATUSES = new Set(['OPEN', 'UPCOMING']);

function isCurrent(o) { return CURRENT_STATUSES.has(o.status); }

// ── VALIDATION ──────────────────────────────────────────────────────────────
//
// `knownPlatformIds` is required, not optional. Validation without it would
// silently skip the one check that stops ingestion inventing platforms.
function problemsFor(o, knownPlatformIds) {
  const p = [];
  const at = (f, msg) => p.push(`${f}: ${msg}`);

  for (const f of REQUIRED) {
    if (!o[f] || String(o[f]).trim() === '') at(f, 'is required');
  }

  if (o.id && o.sourceId && o.sourceNoticeId) {
    const expected = opportunityId(o.sourceId, o.sourceNoticeId);
    if (expected && o.id !== expected) at('id', `is not derived from its source identity (expected ${expected})`);
  }

  // Referential integrity. The whole point of Part 43.
  if (!(knownPlatformIds instanceof Set)) {
    at('sourcePlatformId', 'cannot be validated without the canonical platform set');
  } else if (o.sourcePlatformId && !knownPlatformIds.has(o.sourcePlatformId)) {
    at('sourcePlatformId', `"${o.sourcePlatformId}" is not a canonical procurement platform`);
  }

  if (o.sourceUrl && !/^https?:\/\//.test(o.sourceUrl)) at('sourceUrl', 'must be an absolute http(s) URL');

  if (!STATUSES.includes(o.status)) at('status', `"${o.status}" is not a canonical status`);
  if (!STATUS_BASES.includes(o.statusBasis)) at('statusBasis', `"${o.statusBasis}" is not a canonical basis`);
  if (o.status !== 'UNKNOWN' && o.statusBasis === 'UNKNOWN') {
    at('statusBasis', 'a known status must record how it was established');
  }
  if (o.noticeType && !NOTICE_TYPES.includes(o.noticeType)) at('noticeType', `"${o.noticeType}" is not canonical`);

  // A cancelled notice may never also be current. Guarded here rather than
  // only at render time, so no downstream view can reintroduce it.
  if (o.status === 'CANCELLED' && isCurrent(o)) at('status', 'cancelled cannot be current');
  // Nor may an award notice be advertised as an open opportunity.
  if (o.noticeType === 'CONTRACT_AWARD' && isCurrent(o)) at('status', 'a contract award notice cannot be current');

  // Timestamps must be normalized shapes, not bare strings.
  for (const f of ['publicationDate', 'deadline', 'sourceModifiedDate']) {
    const ts = o[f];
    if (ts === null || ts === undefined) continue;
    if (typeof ts !== 'object' || !('precision' in ts)) at(f, 'must be a normalized timestamp');
    else if (!TIME.PRECISIONS.includes(ts.precision)) at(f, `precision "${ts.precision}" is not canonical`);
    else if (ts.iso && !/^\d{4}-\d{2}-\d{2}T/.test(ts.iso)) at(f, 'iso must be an ISO instant');
    // The rule the whole time module exists for.
    else if (ts.precision === 'ZONELESS' && ts.iso) at(f, 'a zoneless timestamp must not carry an ISO instant');
  }

  // No invented value. Part 6, enforced.
  //
  // A notice may publish ONE figure or one figure PER LOT. Summing lot values
  // into a notice total would be arithmetic the buyer did not publish, so a
  // multi-lot notice carries a range instead: amountMin/amountMax are both
  // real published figures. Exactly one of the two shapes must be present.
  if (o.value !== null && o.value !== undefined) {
    if (typeof o.value !== 'object') at('value', 'must be an object or null');
    else {
      // A published zero is the ABSENCE of a figure wearing a number's clothes
      // — UK FTS returns amountGross 0 on notices that publish no value — so
      // zero is refused here as well as in the adapter that meets it.
      const single = typeof o.value.amount === 'number' && Number.isFinite(o.value.amount)
        && o.value.amount > 0;
      const ranged = typeof o.value.amountMin === 'number' && Number.isFinite(o.value.amountMin)
        && typeof o.value.amountMax === 'number' && Number.isFinite(o.value.amountMax)
        && o.value.amountMin > 0 && o.value.amountMax > 0;
      if (!single && !ranged) at('value', 'needs either a published amount or a published min/max range');
      if (single && ranged) at('value', 'cannot be both a single amount and a range');
      if (ranged && o.value.amountMin > o.value.amountMax) at('value', 'range is inverted');
      if (!o.value.currency || !/^[A-Z]{3}$/.test(o.value.currency)) at('value.currency', 'must be an ISO 4217 code when a value is present');
      if (!VALUE_BASES.includes(o.value.basis)) at('value.basis', 'must record whether the figure is estimated, maximum or awarded');
      if (o.value.scope && !['NOTICE', 'LOTS'].includes(o.value.scope)) at('value.scope', 'must be NOTICE or LOTS');
    }
  }

  // Opportunity-level submission facts. Tri-state: a missing value is null,
  // never "no". `sourceStated` is mandatory when a value is present, so a
  // future adapter cannot set this from anything but a source statement.
  if (o.electronicSubmission !== null && o.electronicSubmission !== undefined) {
    if (!['yes', 'no'].includes(o.electronicSubmission)) at('electronicSubmission', 'must be "yes", "no" or null');
    if (o.electronicSubmissionBasis !== 'SOURCE_REPORTED') {
      at('electronicSubmission', 'may only be set from an explicit source statement');
    }
  }
  if (o.submissionUrl && !/^https?:\/\//.test(o.submissionUrl)) at('submissionUrl', 'must be an absolute http(s) URL');

  // Subnational jurisdiction carries its SCHEME, because the pilot's sources
  // speak two incompatible ones: CanadaBuys publishes provinces that map to
  // ISO 3166-2 (CA-ON), while UK FTS publishes NUTS/ITL regions (UKC12).
  // Storing "UKC12" in a field validated as ISO would either reject a valid
  // fact or force the validator to accept anything. Naming the scheme keeps
  // both honest, and an ISO code is still checked against the project's
  // existing allowlist rather than a second, drifting copy.
  if (o.subnationalJurisdiction !== null && o.subnationalJurisdiction !== undefined) {
    const sj = o.subnationalJurisdiction;
    if (typeof sj !== 'object' || !sj.scheme || !sj.code) {
      at('subnationalJurisdiction', 'must be {scheme, code} or null');
    } else if (!SUBNATIONAL_SCHEMES.includes(sj.scheme)) {
      at('subnationalJurisdiction', `scheme "${sj.scheme}" is not supported`);
    } else if (sj.scheme === 'ISO-3166-2' && !ISO.isKnownCode(sj.code)) {
      at('subnationalJurisdiction', `"${sj.code}" is not a known ISO 3166-2 code`);
    }
  }
  if (o.frameworkAgreement !== null && o.frameworkAgreement !== undefined
    && typeof o.frameworkAgreement !== 'boolean') at('frameworkAgreement', 'must be boolean or null');

  if (o.classifications !== undefined) {
    if (!Array.isArray(o.classifications)) at('classifications', 'must be an array');
    else {
      for (const c of o.classifications) {
        if (!CLASS.SCHEMES.includes(c.scheme)) at('classifications', `scheme "${c.scheme}" is not supported`);
        if (!c.code) at('classifications', 'every classification needs a code');
      }
    }
  }

  // Provenance is not optional. A canonical field with no source occurrence
  // behind it is an assertion nobody made.
  if (!Array.isArray(o.occurrences) || o.occurrences.length === 0) {
    at('occurrences', 'every opportunity must retain at least one source occurrence');
  } else {
    for (const occ of o.occurrences) {
      if (!occ.sourceId || !occ.sourceNoticeId || !occ.sourceUrl) {
        at('occurrences', 'each occurrence needs sourceId, sourceNoticeId and sourceUrl');
      }
    }
  }

  // The personal-data rule, checked on the way out as well as on the way in.
  for (const f of ['buyerName', 'title', 'descriptionSummary']) {
    const v = o[f];
    if (typeof v === 'string' && /\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/.test(v)) {
      at(f, 'contains an email address');
    }
  }

  return p;
}

function isValid(o, knownPlatformIds) { return problemsFor(o, knownPlatformIds).length === 0; }

// Deterministic ordering. Sorting by deadline alone is unstable — thousands
// share a date — so identity always breaks the tie.
function compareOpportunities(a, b) {
  const ad = a.deadline && a.deadline.iso ? a.deadline.iso : '￿';
  const bd = b.deadline && b.deadline.iso ? b.deadline.iso : '￿';
  if (ad !== bd) return ad < bd ? -1 : 1;
  return a.id < b.id ? -1 : 1;
}

module.exports = {
  STATUSES, STATUS_BASES, NOTICE_TYPES, VALUE_BASES, REQUIRED, CURRENT_STATUSES,
  SUBNATIONAL_SCHEMES,
  opportunityId, derivedNoticeId, resolveStatus, isCurrent,
  problemsFor, isValid, compareOpportunities,
};
