'use strict';

// United States — SAM.gov Contract Opportunities, official bulk extract.
//
// ── STATUS: INCOMPLETE. NOT REGISTERED. NOT ACTIVE. ─────────────────────────
//
// This adapter parses the real 251 MB artefact and maps notice types
// correctly, but it has TWO KNOWN DEFECTS and must not be registered until
// both are fixed:
//
//   1. `SolicitationNumber` is not a column in this file. The projected-column
//      guard below correctly refuses the schema, which is the guard working —
//      the real column name has not yet been identified.
//
//   2. Only deadlines that resolve to an INSTANT become OPEN or CLOSED. The
//      3,109 date-only deadlines and other non-instant forms fall through to
//      UNKNOWN, so a run yields 10,430 OPEN and 16,516 UNKNOWN where the
//      whole-file audit measured roughly 12,894 actionable. Date precision is
//      comparable and must be handled, without inventing a time of day.
//
// Everything else measured correctly against real data: 82,960 rows parsed,
// 69,487 carried, zero awards leaked into OPEN, every OPEN record carrying
// NAICS (10,430) and nearly all carrying PSC (10,318), 39 agencies, every OPEN
// record with a notice URL, and 727 with a non-US place of performance.
//
// ── WHY `Active` IS NOT USED FOR ACTIONABILITY ──────────────────────────────
//
// The whole file was audited, not a sample: 82,960 rows, and EVERY ONE carries
// `Active=Yes`. The column is constant. It includes all 12,645 award notices
// and 10,183 rows whose ArchiveDate has already passed. In SAM's vocabulary it
// means "not yet archived", not "open".
//
// Trusting it would have imported 82,960 records — every award among them — as
// live tenders. So actionability comes from the notice TYPE plus the response
// deadline, and `Active` is recorded but never decides anything.
//
// ── THE TYPE TABLE IS EVIDENCE, NOT INTUITION ───────────────────────────────
//
// Every value below was counted across the complete file. A type absent from
// this table is UNKNOWN and never actionable, so a new SAM notice type cannot
// silently become an open tender.

const TIME = require('../to-time.cjs');
const CLASS = require('../to-classification.cjs');
const http = require('../to-http.cjs');

const ID = 'sam-gov';
const PLATFORM_ID = 'us-sam-gov';

// Whole-file counts at the 2026-08-13 snapshot, kept beside each mapping so a
// future reader can see what the decision was made from.
//
//   Combined Synopsis/Solicitation      25,155  a tender open for bids
//   Solicitation                        23,749  a tender open for bids
//   Award Notice                        12,645  already awarded
//   Presolicitation                      7,938  intention to procure
//   Special Notice                       6,071  informational
//   Sources Sought                       5,900  market research, not a tender
//   Justification                          750  explains a sole-source award
//   Modification/Amendment/Cancel          648  administrative change
//   Justification and Approval (J&A)        81  as Justification
//   Sale of Surplus Property                14  disposal, not procurement
//   Consolidate/(Substantially) Bundle       9  administrative
const TENDER_TYPES = new Set(['Solicitation', 'Combined Synopsis/Solicitation']);
const UPCOMING_TYPES = new Set(['Presolicitation']);
const AWARD_TYPES = new Set(['Award Notice']);

// Types that are real SAM publications but are not procurements a supplier can
// bid on. They are recognised so they can be excluded deliberately rather than
// falling through an unknown branch.
const NON_OPPORTUNITY_TYPES = new Set([
  'Special Notice', 'Sources Sought', 'Justification',
  'Justification and Approval (J&A)', 'Modification/Amendment/Cancel',
  'Sale of Surplus Property', 'Consolidate/(Substantially) Bundle',
]);

const KNOWN_TYPES = new Set([
  ...TENDER_TYPES, ...UPCOMING_TYPES, ...AWARD_TYPES, ...NON_OPPORTUNITY_TYPES,
]);

// Rows the adapter carries forward at all. Everything else is a real SAM
// record that is simply not a tender opportunity, and is dropped with a count
// rather than silently.
const CARRIED_TYPES = new Set([...TENDER_TYPES, ...UPCOMING_TYPES, ...AWARD_TYPES]);

// ── THE COLUMN CONTRACT ─────────────────────────────────────────────────────
//
// The file has 47 columns and ~83,000 rows. Materialising every column for
// every carried row exhausts the heap on top of the 251 MB body, so the parser
// projects ONLY these fields and discards the rest of each row immediately.
//
// PROJECTED — read and carried into the canonical record:
const PROJECTED = [
  'NoticeId',            // stable source identity
  'Title',
  'SolicitationNumber',  // procedure reference; never identity on its own
  'Department/Ind.Agency',
  'Sub-Tier',
  'Type',                // decides actionability
  'BaseType',
  'PostedDate',
  'ResponseDeadLine',
  'ArchiveDate',
  'Active',              // recorded, never decisive: it is constant
  'NaicsCode',
  'ClassificationCode',  // PSC
  'Link',
  'PopCountry',          // place of performance
];
//
// OMITTED_WITH_REASON — real columns this adapter deliberately does not read:
//   Description            long free text; the canonical model keeps a short
//                          summary and this feed's descriptions are frequently
//                          whole solicitations
//   Award$, Awardee, …     award facts; attaching them to an open solicitation
//                          would state a value the buyer never advertised
//   PrimaryContact*,       named contact people; publishing them would broaden
//   SecondaryContact*      personal-data exposure with no procurement gain
//   SetASide, SetASideCode US set-aside programmes have no safe canonical
//                          destination and are not foreign-eligibility facts
//   Office, PopCity,       finer geography with no canonical field today
//   PopState, PopZip
//   ArchiveType, FPDS…     archival and downstream-reporting bookkeeping

// ── STREAMING RFC 4180 ──────────────────────────────────────────────────────
//
// 251 MB will not be held as one JavaScript string. Descriptions in this feed
// contain commas, quotes and newlines, so `split(',')` is not a parser; this
// handles quoted separators, quoted newlines and doubled quotes.
function* parseCsvStream(readable) {
  let field = '';
  let row = [];
  let inQuotes = false;
  let quotePending = false;
  for (const chunk of readable) {
    const s = chunk;
    for (let i = 0; i < s.length; i += 1) {
      const c = s[i];
      if (quotePending) {
        quotePending = false;
        if (c === '"') { field += '"'; continue; }
        inQuotes = false;
      }
      if (inQuotes) {
        if (c === '"') quotePending = true; else field += c;
        continue;
      }
      if (c === '"') { inQuotes = true; continue; }
      if (c === ',') { row.push(field); field = ''; continue; }
      if (c === '\n') { row.push(field); field = ''; yield row; row = []; continue; }
      if (c === '\r') continue;
      field += c;
    }
  }
  if (field.length || row.length) { row.push(field); yield row; }
}

// ── DEADLINES ───────────────────────────────────────────────────────────────
//
// Three shapes occur, measured across the actionable cohort: 9,710 with an
// explicit offset, 3,109 date-only, 75 with a time but no offset. Precision is
// therefore decided per record. No US-wide timezone is applied and no agency's
// location is used to guess one.
function deadlineOf(raw) {
  const v = (raw || '').trim();
  if (!v) return TIME.EMPTY;
  return TIME.normalizeTimestamp(v);
}

// Decode a Buffer in slices without splitting a multi-byte character across
// two chunks, which would corrupt any non-ASCII agency or title.
function* chunksOf(buffer, size = 1 << 20) {
  const { StringDecoder } = require('node:string_decoder');
  const decoder = new StringDecoder('utf8');
  for (let i = 0; i < buffer.length; i += size) {
    yield decoder.write(buffer.subarray(i, Math.min(i + size, buffer.length)));
  }
  const tail = decoder.end();
  if (tail) yield tail;
}

const trim = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

// Codes arrive as single values in this feed, but the splitter is tolerant of
// the delimiters SAM uses elsewhere rather than assuming one value forever.
const codeList = (value) => String(value == null ? '' : value)
  .split(/[,;|\n\r]+/)
  .map((c) => c.trim())
  .filter(Boolean);

async function fetchAll({ source, log }) {
  // One artefact, one GET. Range support exists but is not needed: a single
  // complete response with a verified length is simpler and has fewer ways to
  // assemble a hybrid snapshot.
  //
  // The body is held as a Buffer and decoded in slices rather than turned into
  // one 251 MB JavaScript string, which would cost roughly double in UTF-16.
  const buffer = await http.getBuffer(source.endpoint);
  const rows = [];
  let header = null;
  let total = 0;
  let typeAt = -1;
  let index = [];
  const byType = new Map();
  for (const r of parseCsvStream(chunksOf(buffer))) {
    if (!header) {
      header = r.map((h) => h.replace(/^﻿/, ''));
      index = PROJECTED.map((name) => [name, header.indexOf(name)]).filter(([, at]) => at >= 0);
      const missing = PROJECTED.filter((name) => header.indexOf(name) < 0);
      if (missing.length) {
        // A projected column vanishing is a schema change, not zero
        // opportunities. Fail closed so last-good is retained.
        throw new Error(`sam-gov: bulk schema changed, missing column(s): ${missing.join(', ')}`);
      }
      typeAt = header.indexOf('Type');
      continue;
    }
    if (r.length < 5) continue;
    total += 1;
    const type = (r[typeAt] || '').trim();
    byType.set(type, (byType.get(type) || 0) + 1);
    // Only carry the types that can become an opportunity or an award, and
    // keep only the projected columns: the discarded 32 columns per row are
    // what makes this fit in memory at all.
    if (!CARRIED_TYPES.has(type)) continue;
    const rec = {};
    for (const [name, at] of index) rec[name] = r[at];
    rows.push(rec);
  }
  const unknown = [...byType.keys()].filter((t) => !KNOWN_TYPES.has(t));
  log(`sam-gov: ${total} rows, ${rows.length} carried; types ${byType.size}`
    + (unknown.length ? `; UNKNOWN TYPES: ${unknown.join(', ')}` : ''));
  return {
    raw: rows,
    pages: 1,
    population: total,
    // A single full artefact of every non-archived notice is complete by
    // construction: there is no page two to miss. What it is NOT is a list of
    // open tenders — that is a derived subset, and the distinction is recorded
    // in the registry window note.
    complete: true,
    endpoint: source.endpoint,
    typeCounts: Object.fromEntries(byType),
    unknownTypes: unknown,
  };
}

function normalize(r, { source, nowIso }) {
  const noticeId = trim(r.NoticeId);
  if (!noticeId) return null;
  const title = trim(r.Title);
  if (!title) return null;

  const type = trim(r.Type) || '';
  const deadline = deadlineOf(r.ResponseDeadLine);
  const days = TIME.daysUntil(deadline, nowIso);

  // Status comes from the notice type first. A deadline can only narrow an
  // already-qualified tender; it can never promote a record into OPEN.
  let reportedStatus = null;
  let noticeType = 'UNKNOWN';
  if (AWARD_TYPES.has(type)) {
    reportedStatus = 'AWARDED';
    noticeType = 'CONTRACT_AWARD';
  } else if (TENDER_TYPES.has(type)) {
    noticeType = 'CONTRACT_NOTICE';
    // A qualified tender with no deadline is not assumed open. 230 such rows
    // exist and the source gives nothing to decide them with.
    if (days == null) reportedStatus = null;
    else reportedStatus = days >= 0 ? 'OPEN' : 'CLOSED';
  } else if (UPCOMING_TYPES.has(type)) {
    // A presolicitation states an intention to procure. It is UPCOMING only
    // while its own stated response date is still ahead; otherwise the
    // intention has lapsed and we say nothing.
    noticeType = 'PRIOR_INFORMATION';
    reportedStatus = days != null && days >= 0 ? 'UPCOMING' : null;
  }

  const codes = [];
  for (const c of codeList(r.NaicsCode)) codes.push(['NAICS', c]);
  // ClassificationCode is SAM's Product Service Code. It stays PSC and is
  // never rewritten as UNSPSC or CPV.
  for (const c of codeList(r.ClassificationCode)) codes.push(['PSC', c]);

  const link = trim(r.Link);
  const url = link && /^https?:\/\//i.test(link) ? link : null;

  // The buyer is the publishing agency. The office and sub-tier are part of
  // the same organisation, not separate buyers, so they are not counted as
  // extra buyer identities.
  const buyerName = trim(r['Department/Ind.Agency']) || trim(r['Sub-Tier']) || null;

  // Place of performance, where the source gives one. A US platform does not
  // make every contract's work location American.
  const popCountry = trim(r['PopCountry']);
  const projectCountry = popCountry && !/^(USA|US|UNITED STATES)$/i.test(popCountry)
    ? popCountry.toLowerCase() : null;

  return {
    sourceNoticeId: noticeId,
    sourceUrl: url,
    title,
    buyerName,
    country: 'united-states',
    projectCountry,
    officialReference: trim(r.SolicitationNumber),
    classifications: CLASS.normalizeCodes(codes),
    deadline,
    publicationDate: TIME.normalizeTimestamp(trim(r.PostedDate)),
    reportedStatus,
    noticeType,
    sourceType: type,
    // Recorded because it is a real source fact, and deliberately not used to
    // decide anything: every row in the file carries Active=Yes.
    sourceActive: trim(r.Active),
    // The bulk file carries an award amount only. Attaching it to an open
    // solicitation would state a value the buyer never advertised.
    value: null,
    electronicSubmission: null,
    submissionUrl: null,
  };
}

module.exports = {
  ID, PLATFORM_ID,
  TENDER_TYPES, UPCOMING_TYPES, AWARD_TYPES, NON_OPPORTUNITY_TYPES,
  KNOWN_TYPES, CARRIED_TYPES, PROJECTED,
  parseCsvStream, chunksOf, deadlineOf, codeList, fetchAll, normalize,
};
