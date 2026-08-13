'use strict';

// United States — SAM.gov Contract Opportunities, official daily bulk extract.
//
// ── WHAT THE ARTEFACT IS ────────────────────────────────────────────────────
//
// One 251 MB CSV, 47 columns, 82,960 rows, republished daily by the General
// Services Administration. It is every contract-opportunity notice SAM has not
// yet archived — which is NOT the same thing as every open tender, and the gap
// between those two sentences is most of this file.
//
// Every number in the comments below was counted across the complete file, not
// sampled. Where a figure is a decision input it is stated so the next reader
// can check the decision rather than trust it.
//
// ── WHY `Active` IS NOT USED FOR ACTIONABILITY ──────────────────────────────
//
// All 82,960 rows carry `Active=Yes`. The column is constant. It includes all
// 12,645 award notices. In SAM's vocabulary it means "not yet archived", not
// "open for bids", and trusting it would have imported the entire file — every
// award among it — as live tenders.
//
// So actionability comes from the notice TYPE and the response deadline.
// `Active` is recorded as a source fact and decides nothing.
//
// ── TYPE IS CURRENT STATE; BaseType IS ORIGINAL STATE ───────────────────────
//
// The two disagree on 13,459 rows, and the pattern says which is which:
// 7,657 rows are `Type=Award Notice, BaseType=Combined Synopsis/Solicitation`
// — a solicitation that has since been awarded. 2,182 are `Type=Solicitation,
// BaseType=Presolicitation` — an intention that has since become a tender.
// BaseType is where the notice started; Type is where it is now.
//
// Type therefore decides. BaseType gets one job: a veto. Twelve rows say
// `Type=Combined Synopsis/Solicitation, BaseType=Award Notice`, and when the
// source's two type fields disagree in the direction of "this is an award" we
// decline to advertise it as open. Twelve records is a negligible price for a
// guarantee that no award can reach a supplier as an opportunity.
//
// ── WHAT THIS ADAPTER INGESTS ───────────────────────────────────────────────
//
// The CURRENT-OPPORTUNITY SLICE, not the archive. Award notices and lapsed
// solicitations are not carried into the corpus, for the same reason TED is
// queried with scope=ACTIVE and CanadaBuys publishes an open-notice file: the
// corpus is a current view. Retaining SAM's 12,645 awards and ~28,000 expired
// notices would make four fifths of this repository's tender corpus dead US
// paperwork.
//
// Award types are excluded STRUCTURALLY — they never enter `raw` at all — and
// `normalize` independently refuses them a second time. Two guards, because
// this is the failure with the worst consequence.
//
// ── DEADLINES, AND THE DEFECT THAT HID 9,428 TENDERS ────────────────────────
//
// Response deadlines arrive in three shapes among the tender types:
//
//   INSTANT      38,605   "2026-09-02T15:00:00-04:00"  explicit offset
//   BARE_DATE     9,428   "2026-09-02"                 no time, no zone
//   ZONELESS_DT     641   "2026-09-02T15:00:00"        time, no zone
//
// An earlier version could only decide INSTANT deadlines, so 16,516 records
// fell to UNKNOWN — including 9,428 that state a perfectly clear date. The fix
// is NOT to attach a US timezone to them. It is in to-time.cjs: a zoneless
// deadline names a 26-hour BAND on the timeline, and outside that band every
// zone on Earth agrees on whether it has passed. No offset is invented, and
// the deadline is still displayed exactly as SAM printed it.
//
// ── PERSONAL DATA ───────────────────────────────────────────────────────────
//
// The file carries ten contact columns — title, full name, email, phone and
// fax for a primary and a secondary officer, on every row. None is projected.
// Building a contact database for federal contracting officers as a side
// effect of building a tender index is not a thing this repository does.

const TIME = require('../to-time.cjs');
const CLASS = require('../to-classification.cjs');
const SCHEMA = require('../to-schema.cjs');
const ISO = require('../iso-3166-2.cjs');
const http = require('../to-http.cjs');

const ID = 'sam-gov';
// Resolved from the existing TenderPlatform registry, never minted here.
const PLATFORM_ID = 'us-sam-gov';

// Whole-file type counts at the 2026-08-13 snapshot, kept beside the mapping
// so a reader can see what the decision was made from.
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

// Real SAM publications that are not procurements anyone can bid on. Listed so
// they are excluded deliberately rather than by falling through a default.
//
// `Modification/Amendment/Cancel` earns its place here: it is an administrative
// change to a notice that already exists. Carrying it would create a second
// live tender for one procurement — exactly the phantom this corpus must not
// grow — and the amended notice itself is already in the file under its own id.
const NON_OPPORTUNITY_TYPES = new Set([
  'Special Notice', 'Sources Sought', 'Justification',
  'Justification and Approval (J&A)', 'Modification/Amendment/Cancel',
  'Sale of Surplus Property', 'Consolidate/(Substantially) Bundle',
]);

const KNOWN_TYPES = new Set([
  ...TENDER_TYPES, ...UPCOMING_TYPES, ...AWARD_TYPES, ...NON_OPPORTUNITY_TYPES,
]);

// Rows carried out of the parser at all. Awards are excluded here, structurally.
const CARRIED_TYPES = new Set([...TENDER_TYPES, ...UPCOMING_TYPES]);

const NOTICE_TYPE = {
  Solicitation: 'CONTRACT_NOTICE',
  'Combined Synopsis/Solicitation': 'CONTRACT_NOTICE',
  Presolicitation: 'PRIOR_INFORMATION',
  'Award Notice': 'CONTRACT_AWARD',
};

// ── THE COLUMN CONTRACT ─────────────────────────────────────────────────────
//
// 47 columns × 82,960 rows will not be materialised. The parser projects ONLY
// these and discards the rest of each row immediately; without that the heap
// is exhausted on top of the 251 MB body.
//
// Every name here was read from the file's own header. `Sol#` is spelled
// exactly that way — an earlier version guessed `SolicitationNumber`, which is
// not a column in this file, and the missing-column guard below correctly
// refused the whole schema rather than carrying a silent null.
const PROJECTED = [
  'NoticeId',            // stable source identity
  'Title',
  'Sol#',                // the buyer's solicitation number; never identity alone
  'Department/Ind.Agency',
  'Sub-Tier',
  'Office',              // the contracting office — the actual buying entity
  'Type',                // decides actionability
  'BaseType',            // original state; used only as an award veto
  'PostedDate',
  'ResponseDeadLine',
  'ArchiveDate',         // narrows actionability, never widens it
  'Active',              // recorded, never decisive: it is constant
  'NaicsCode',
  'ClassificationCode',  // PSC
  'State',               // the contracting office's jurisdiction
  'Link',
  'PopCountry',          // place of performance
];
//
// OMITTED_WITH_REASON — real columns this adapter deliberately does not read:
//   Description            frequently an entire solicitation document; the
//                          canonical model carries a short summary and this
//                          feed cannot supply one without mirroring the notice
//   Award$, Awardee,       award facts; attaching them to an open solicitation
//   AwardNumber, AwardDate would state a value the buyer never advertised
//   PrimaryContact*,       ten columns of named officers, their emails, phones
//   SecondaryContact*      and faxes. Never projected. See the header.
//   SetASide, SetASideCode US set-aside programmes have no safe canonical
//                          destination and are not foreign-eligibility facts
//   PopStreetAddress,      finer place-of-performance geography with no
//   PopCity, PopState,     canonical destination in this model
//   PopZip
//   Office address fields  City, ZipCode, CountryCode — the office's postal
//                          address, not a procurement fact
//   ArchiveType, FPDS      archival and downstream-reporting bookkeeping
//   Code, CGAC, AAC Code,
//   OrganizationType,
//   AdditionalInfoLink

// ── STREAMING RFC 4180 ──────────────────────────────────────────────────────
//
// 251 MB is not held as one JavaScript string. Descriptions in this feed
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

// ── THE FILE IS NOT UTF-8 ───────────────────────────────────────────────────
//
// It is Windows-1252, and this was measured across the whole artefact rather
// than assumed from a failure:
//
//   bytes >= 0x80                       108,336
//   valid UTF-8 multi-byte sequences      1,846
//   bytes that cannot be UTF-8          104,047
//
// and the invalid ones are not random. The top of the distribution is
// 0x96 (22,487), 0x92 (21,644), 0x94 (12,082), 0x93 (11,387), 0x95 (8,498),
// 0x85 (6,888), 0x97 (3,730) — en dash, curly quotes, bullet, ellipsis, em
// dash. That is the Windows-1252 punctuation block, exactly what a Windows
// desktop produces when a contracting officer pastes a title out of Word.
//
// Decoding it as UTF-8 replaced 103,907 characters with U+FFFD, and it looked
// harmless: "PATRIOT SPARES <?> LOCKHEED MARTIN SOLE SOURCE" is still legible,
// so nothing failed and every one of those titles was quietly wrong.
//
// Windows-1252 is single-byte, so slicing a buffer can never split a character
// — the boundary problem that made this a streaming decoder in the first place
// does not exist in this encoding. `stream: true` is kept anyway so the
// contract holds if the encoding ever changes.
const ENCODING = 'windows-1252';

// ── PROVING THE ENCODING RATHER THAN ASSUMING IT ────────────────────────────
//
// Windows-1252 maps all 256 byte values, so decoding it can never produce a
// replacement character. That makes "look for U+FFFD" useless as a guard here:
// if SAM switched to UTF-8 tomorrow, this decoder would emit "â€“" where the
// file said "–" — readable-looking nonsense, no error, no replacement char,
// and 100,000 quietly wrong titles. The same silent-corruption failure as
// before, with the encodings swapped.
//
// So the assumption is checked against the bytes. Every non-ASCII byte either
// begins a valid UTF-8 multi-byte sequence or it cannot be UTF-8 at all, and
// the two counts separate the encodings cleanly. Measured on the real file:
// 1,846 valid sequences against 104,047 impossible bytes. A UTF-8 file would
// invert that completely.
function utf8Evidence(buffer) {
  let valid = 0;
  let impossible = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    const b = buffer[i];
    if (b < 0x80) continue;
    let len = 0;
    if (b >= 0xC2 && b <= 0xDF) len = 2;
    else if (b >= 0xE0 && b <= 0xEF) len = 3;
    else if (b >= 0xF0 && b <= 0xF4) len = 4;
    if (len) {
      let ok = true;
      for (let k = 1; k < len; k += 1) {
        const c = buffer[i + k];
        if (c === undefined || c < 0x80 || c > 0xBF) { ok = false; break; }
      }
      if (ok) { valid += 1; i += len - 1; continue; }
    }
    impossible += 1;
  }
  return { valid, impossible };
}

function* chunksOf(buffer, size = 1 << 20) {
  const decoder = new TextDecoder(ENCODING);
  for (let i = 0; i < buffer.length; i += size) {
    yield decoder.decode(buffer.subarray(i, Math.min(i + size, buffer.length)), { stream: true });
  }
  const tail = decoder.decode();
  if (tail) yield tail;
}

const trim = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

// ── PLACE OF PERFORMANCE IS A COUNTRY, NOT A CODE ───────────────────────────
//
// PopCountry is ISO 3166-1 alpha-3. The corpus identifies countries by SLUG,
// and the coverage layer reads `projectCountry || country` as the geography of
// a procurement — so emitting the raw code put a country called "jpn" into the
// geography matrix alongside "united-states" and "germany".
//
// All 103 codes that appear across the file are transcribed here. Anything not
// listed, and anything whose slug is not in the canonical country collection,
// yields NULL: the record then keeps its US country and simply makes no claim
// about where the work happens. A missing signal is recoverable; a country we
// invented is not. `AX1` is in the file and is not an ISO code at all.
const ALPHA3_TO_SLUG = {
  ALB: 'albania', ARG: 'argentina', ARM: 'armenia', AUS: 'australia', AUT: 'austria',
  AZE: 'azerbaijan', BDI: 'burundi', BEL: 'belgium', BGD: 'bangladesh', BHR: 'bahrain',
  BRA: 'brazil', BRB: 'barbados', CAN: 'canada', CHE: 'switzerland', CHL: 'chile',
  COL: 'colombia', CYP: 'cyprus', CZE: 'czech-republic', DEU: 'germany', DJI: 'djibouti',
  DOM: 'dominican-republic', DZA: 'algeria', ECU: 'ecuador', EGY: 'egypt', ESP: 'spain',
  EST: 'estonia', ETH: 'ethiopia', FJI: 'fiji', FRA: 'france', FSM: 'micronesia',
  GAB: 'gabon', GBR: 'united-kingdom', GEO: 'georgia', GHA: 'ghana', GIN: 'guinea',
  GRC: 'greece', GRL: 'greenland', GTM: 'guatemala', HKG: 'hong-kong', HND: 'honduras',
  HRV: 'croatia', HUN: 'hungary', IDN: 'indonesia', IND: 'india', IRQ: 'iraq',
  ITA: 'italy', JAM: 'jamaica', JOR: 'jordan', JPN: 'japan', KEN: 'kenya',
  KGZ: 'kyrgyzstan', KHM: 'cambodia', KOR: 'south-korea', KWT: 'kuwait', LAO: 'laos',
  LBN: 'lebanon', LBR: 'liberia', LKA: 'sri-lanka', LTU: 'lithuania', LVA: 'latvia',
  MAR: 'morocco', MDG: 'madagascar', MEX: 'mexico', MKD: 'north-macedonia', MMR: 'myanmar',
  MNE: 'montenegro', MWI: 'malawi', MYS: 'malaysia', NAM: 'namibia', NGA: 'nigeria',
  NLD: 'netherlands', NOR: 'norway', NPL: 'nepal', PAK: 'pakistan', PAN: 'panama',
  PER: 'peru', PHL: 'philippines', PNG: 'papua-new-guinea', POL: 'poland', PRT: 'portugal',
  PRY: 'paraguay', QAT: 'qatar', RWA: 'rwanda', SAU: 'saudi-arabia', SEN: 'senegal',
  SGP: 'singapore', SLE: 'sierra-leone', SLV: 'el-salvador', SRB: 'serbia', SUR: 'suriname',
  SVK: 'slovakia', SWE: 'sweden', THA: 'thailand', TKM: 'turkmenistan', TLS: 'timor-leste',
  TUN: 'tunisia', TUR: 'turkey', UKR: 'ukraine', UZB: 'uzbekistan', VEN: 'venezuela',
  VNM: 'vietnam', ZAF: 'south-africa',
};

const US_CODES = /^(USA|US|UNITED STATES)$/i;

// Codes arrive as single values in this feed, but the splitter tolerates the
// delimiters SAM uses elsewhere rather than assuming one value forever.
const codeList = (value) => String(value == null ? '' : value)
  .split(/[,;|\n\r]+/)
  .map((c) => c.trim())
  .filter(Boolean);

async function fetchAll({ source, log }) {
  // One artefact, one GET. The body is held as a Buffer and decoded in slices
  // rather than turned into one 251 MB JavaScript string, which would cost
  // roughly double in UTF-16.
  //
  // The default 90-second budget is sized for API responses. A quarter of a
  // gigabyte is not one, and letting it time out would misreport a slow link
  // as a transport failure — which retains last-good, correctly, but for the
  // wrong reason and forever. Ten minutes, still bounded, still fails closed.
  //
  // A truncated download is the failure this source is most exposed to, and it
  // is caught in getBuffer against the server's declared length rather than
  // here — half a CSV parses cleanly and no record-count heuristic can tell it
  // from a quiet week.
  const buffer = await http.getBuffer(source.endpoint, { timeoutMs: 600000 });
  log(`sam-gov: ${buffer.length} bytes received.`);
  return parseBuffer(buffer, { source, log });
}

// Split out from fetchAll so the parse can be exercised — and its failure modes
// proven — against a fixture with no network involved.
function parseBuffer(buffer, { source, log = () => {} } = {}) {
  // Checked BEFORE decoding: once the bytes are text the evidence is gone.
  const enc = utf8Evidence(buffer);
  if (enc.valid > enc.impossible) {
    throw new Error(`sam-gov: the bulk file looks like UTF-8, not ${ENCODING} `
      + `(${enc.valid} valid UTF-8 sequences vs ${enc.impossible} impossible bytes). `
      + 'Decoding it with the wrong table would silently corrupt every accented '
      + 'title, so this refuses rather than publishing mojibake.');
  }

  const rows = [];
  let header = null;
  let total = 0;
  let typeAt = -1;
  let index = [];
  let short = 0;
  const byType = new Map();
  for (const r of parseCsvStream(chunksOf(buffer))) {
    if (!header) {
      header = r.map((h) => h.replace(/^﻿/, ''));
      const missing = PROJECTED.filter((name) => header.indexOf(name) < 0);
      if (missing.length) {
        // A projected column vanishing is a SCHEMA CHANGE, not zero
        // opportunities. Fail closed so last-good is retained.
        throw new Error(`sam-gov: bulk schema changed, missing column(s): ${missing.join(', ')}`);
      }
      index = PROJECTED.map((name) => [name, header.indexOf(name)]);
      typeAt = header.indexOf('Type');
      continue;
    }
    // A row shorter than the header is a truncated or corrupted line. Counted,
    // never silently absorbed — see the ratio guard below.
    if (r.length < header.length) { short += 1; continue; }
    total += 1;
    const type = (r[typeAt] || '').trim();
    byType.set(type, (byType.get(type) || 0) + 1);
    if (!CARRIED_TYPES.has(type)) continue;
    const rec = {};
    for (const [name, at] of index) rec[name] = r[at];
    rows.push(rec);
  }

  if (!header) throw new Error('sam-gov: bulk file contained no header row');

  // A replacement character cannot come out of the Windows-1252 table, so if
  // one is here the SOURCE published it — the corruption happened upstream and
  // republishing it would launder someone else's mojibake into our corpus.
  const damaged = rows.filter((r) => String(r.Title || '').includes('�')).length;
  if (damaged) {
    throw new Error(`sam-gov: ${damaged} title(s) arrived containing a replacement `
      + 'character. Refusing to publish text that is already corrupted at the source.');
  }

  // ── PARSER CORRUPTION GUARD ───────────────────────────────────────────────
  //
  // A mangled quote can turn thousands of rows into one giant field, and the
  // result looks exactly like a quiet day. If a material share of lines did not
  // yield a full row, the parse is not trustworthy and must not replace
  // last-good.
  const seen = total + short;
  if (seen && short / seen > 0.01) {
    throw new Error(`sam-gov: ${short} of ${seen} lines did not parse to a full row `
      + '— refusing a corrupt parse rather than publishing a partial file');
  }

  const unknown = [...byType.keys()].filter((t) => t && !KNOWN_TYPES.has(t));
  log(`sam-gov: ${total} rows, ${rows.length} carried; ${byType.size} type(s)`
    + (short ? `; ${short} short row(s)` : '')
    + (unknown.length ? `; UNKNOWN TYPES: ${unknown.join(', ')}` : ''));
  return {
    raw: rows,
    pages: 1,
    population: total,
    // A single full artefact of every non-archived notice is complete by
    // construction: there is no page two to miss. What it is NOT is a list of
    // open tenders — that is a derived subset, recorded in the registry window.
    complete: true,
    endpoint: source && source.endpoint,
    typeCounts: Object.fromEntries(byType),
    unknownTypes: unknown,
    shortRows: short,
  };
}

function normalize(r, { source, nowIso, knownCountrySlugs = null }) {
  const noticeId = trim(r.NoticeId);
  if (!noticeId) return null;
  const title = trim(r.Title);
  if (!title) return null;

  const type = trim(r.Type) || '';
  const baseType = trim(r.BaseType) || '';
  // Awards never become opportunities. The parser already excluded them; this
  // is the second, independent guard, and it also catches the twelve rows whose
  // BaseType says award while Type does not.
  if (AWARD_TYPES.has(type) || AWARD_TYPES.has(baseType)) return null;
  if (!CARRIED_TYPES.has(type)) return null;

  const deadline = TIME.normalizeTimestamp(trim(r.ResponseDeadLine));
  const passed = TIME.hasPassed(deadline, nowIso);

  // SAM publishes no usable status string, so the notice TYPE is the source's
  // own statement about the stage this procurement has reached.
  //
  // A presolicitation announces an intention to procure. That is UPCOMING while
  // its stated response date is still ahead; once the date has gone the
  // intention has lapsed and we say nothing rather than guessing.
  let reportedStatus = null;
  if (UPCOMING_TYPES.has(type) && passed === false) reportedStatus = 'UPCOMING';

  const noticeType = NOTICE_TYPE[type] || 'UNKNOWN';
  const { status, statusBasis } = SCHEMA.resolveStatus({
    reportedStatus, deadline, nowIso, noticeType,
  });

  // ── ARCHIVE DATE NARROWS, NEVER WIDENS ────────────────────────────────────
  //
  // SAM archives a notice on this date. A notice whose archive date has passed
  // is no longer being offered, whatever its response deadline says. This is
  // only ever allowed to remove a record from the current view — it can never
  // promote one into it.
  const archived = TIME.hasPassed(TIME.normalizeTimestamp(trim(r.ArchiveDate)), nowIso);
  if (archived === true) return null;

  // The current-opportunity slice. Everything else is a real SAM record that is
  // simply not a live tender, and is dropped with a count rather than silently.
  if (!SCHEMA.isCurrent({ status })) return null;

  const codes = [];
  for (const c of codeList(r.NaicsCode)) codes.push(['NAICS', c]);
  // ClassificationCode is SAM's Product Service Code. It stays PSC and is never
  // rewritten as UNSPSC or CPV — five taxonomies in this repository, no
  // crosswalk between any of them.
  for (const c of codeList(r.ClassificationCode)) codes.push(['PSC', c]);

  const link = trim(r.Link);
  const url = link && /^https?:\/\//i.test(link) ? link : null;
  if (!url) return null; // sourceUrl is required; a notice we cannot link to is not publishable

  // ── WHO THE BUYER IS ──────────────────────────────────────────────────────
  //
  // `Department/Ind.Agency` holds 56 distinct values across the whole file —
  // "DEPT OF DEFENSE" covers tens of thousands of notices from hundreds of
  // separate contracting activities. `Office` holds 1,636, and the office is
  // the entity that actually issues the solicitation and receives the bid.
  //
  // Using the department would have reported 56 American buyers and would have
  // put every DoD notice in one deduplication bucket. The office is both the
  // more truthful answer and the more useful one; 1,084 rows carry no office
  // and fall back to the sub-tier, then the department.
  const buyerName = trim(r.Office) || trim(r['Sub-Tier']) || trim(r['Department/Ind.Agency']);

  // Place of performance, where the source gives one. A US platform does not
  // make every contract's work location American. `projectCountry` is set only
  // when the source names somewhere that is NOT the US and that resolves to a
  // country this corpus already knows.
  const popCountry = trim(r.PopCountry);
  const mapped = popCountry && !US_CODES.test(popCountry)
    ? ALPHA3_TO_SLUG[popCountry.toUpperCase()] : null;
  const projectCountry = mapped
    && (!knownCountrySlugs || knownCountrySlugs.has(mapped)) ? mapped : null;

  // The office's own jurisdiction, kept only when it is a real ISO subdivision.
  // 250 distinct strings appear in this column and they are not all states.
  const stateCode = trim(r.State) ? `US-${trim(r.State).toUpperCase()}` : null;
  const subnationalJurisdiction = stateCode && ISO.isKnownCode(stateCode)
    ? { scheme: 'ISO-3166-2', code: stateCode } : null;

  return {
    id: SCHEMA.opportunityId(source.id, noticeId),
    sourceId: source.id,
    sourcePlatformId: source.platformId,
    sourceNoticeId: noticeId,
    sourceUrl: url,
    title,
    titles: null,
    // The Description column is an entire solicitation document. Not stored.
    descriptionSummary: null,
    buyerName,
    country: 'united-states',
    subnationalJurisdiction,
    projectCountry,
    coverage: 'national',
    classifications: CLASS.normalizeCodes(codes),
    publicationDate: TIME.normalizeTimestamp(trim(r.PostedDate)),
    deadline,
    sourceModifiedDate: null, // the bulk file states no modification stamp
    status,
    statusBasis,
    noticeType,
    procedureType: null,
    value: null, // the extract publishes an award amount only; see the header
    language: 'en',
    lotCount: null,
    amendsNoticeId: null,
    isAmendment: false,
    // The buyer's own solicitation number. Distinct from the notice id, and
    // deliberately NOT identity on its own: 13,026 of these are borne by more
    // than one notice, and one — a government-wide acquisition vehicle — is
    // borne by 6,919. See the reference-collision rule in to-dedupe.cjs.
    officialReference: trim(r['Sol#']),
    electronicSubmission: null,
    submissionUrl: null,
    // Recorded because it is a real source fact, and deliberately not used to
    // decide anything: every row in the file carries Active=Yes.
    sourceActive: trim(r.Active),
    sourceType: type,
  };
}

module.exports = {
  id: ID, ID, PLATFORM_ID,
  TENDER_TYPES, UPCOMING_TYPES, AWARD_TYPES, NON_OPPORTUNITY_TYPES,
  KNOWN_TYPES, CARRIED_TYPES, NOTICE_TYPE, PROJECTED, ALPHA3_TO_SLUG, ENCODING,
  parseCsvStream, chunksOf, parseBuffer, utf8Evidence, codeList, fetchAll, normalize,
};
