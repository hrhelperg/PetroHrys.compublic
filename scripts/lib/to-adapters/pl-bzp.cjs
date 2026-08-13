'use strict';

// Poland — Biuletyn Zamówień Publicznych, published through eZamówienia.
//
// ── WHY THIS SOURCE EXISTS IN THE REGISTRY ──────────────────────────────────
//
// Before this adapter, all 577 current Polish opportunities in the corpus
// arrived through TED. That is the largest single-source dependency in Europe:
// if TED has a bad week, Polish coverage goes to zero.
//
// BZP is the statutory Polish bulletin for procurement BELOW the EU
// publication thresholds — procurement that is not required to be published in
// TED and largely is not. The source says so per notice, in its own field:
//
//     "isTenderAmountBelowEU": true
//
// So the value here is not "more Polish notices". It is a body of procurement
// TED structurally cannot supply.
//
// ── THE WINDOW, WHICH IS THE FIRST GATE ─────────────────────────────────────
//
// The unfiltered board is a chronological publication stream over the entire
// archive: 3,272,748 notices, ten per page, 327,275 pages. Walking that would
// be Spain's failure at a hundred times the scale, and it would still not
// yield the set of open Polish tenders.
//
// But the board accepts filters, and one of them is a DEADLINE filter. Asking
// for notices whose offer-submission date is today or later, sorted by
// publication date ASCENDING, returns as its first page:
//
//     published 2022-08-12   deadline 2026-12-11   Przebudowa ul. Jeziornej…
//     published 2023-03-10   deadline 2026-12-18   Rozbudowa układu…
//
// A tender published four years ago and still open is reachable in ONE
// request. That is the property Spain did not have: the current universe is
// addressable directly, not by walking back through every intervening
// publication. The window is FULL_CURRENT_WINDOW and it is exhaustible.
//
// ── WHAT IS INGESTED, AND WHAT IS DELIBERATELY NOT ──────────────────────────
//
// In the current window the board carries three kinds of notice:
//
//     ContractNotice   5,975   native BZP, below-threshold  ← INGESTED
//     eforms-16        4,153   TED notices, mirrored here
//     eforms-17          610   TED notices, mirrored here
//
// The eForms rows are TED's own notices republished on the Polish board. They
// are recognisable without guessing: their `noticeNumber` is the OJS format
// ("2024/S 158-490687", not "2026/BZP 00392343/01"), their `noticeType` is
// null with `noticeTypeTed` set, their `isTenderAmountBelowEU` is false, and
// their titles carry TED's machine-generated "Polska – <CPV label> – …"
// prefix.
//
// Ingesting them would import duplicates of records TED already gives us, with
// worse metadata, and would then need deduplication to remove what we chose to
// add. They are excluded at the source query instead. The overlap that remains
// is measured rather than assumed.
//
// ── PAGE SIZE ───────────────────────────────────────────────────────────────
//
// The server caps a page at TEN records and silently ignores every attempt to
// raise it — PageSize, pageSize, Size, Limit and PerPage were each tried and
// each returned ten. So a full current window is ~600 requests.
//
// That is a real cost and it is why Prozorro was rejected, so the distinction
// matters: Prozorro needed one request PER NOTICE to obtain usable metadata.
// This is one request per TEN notices, complete with title, buyer, CPV,
// deadline and threshold flag, run once per refresh against a national
// register. Sequential, paced, and hard-capped.

const http = require('../to-http.cjs');
const TIME = require('../to-time.cjs');
const CLASS = require('../to-classification.cjs');
const SCHEMA = require('../to-schema.cjs');

const ID = 'pl-bzp';
// Resolved from the existing TenderPlatform registry, never minted here.
const PLATFORM_ID = 'pl-ezamowienia';

// The server's own cap. Stated as a constant so the request count is a
// consequence of a measured fact rather than of an arbitrary choice.
const SERVER_PAGE_SIZE = 10;

// The only notice type this adapter carries: native BZP contract notices.
const CARRIED_NOTICE_TYPE = 'ContractNotice';

// TED's OJS notice-number format. Used as a SECOND guard: if a record with
// this shape ever reaches normalization, the source query stopped filtering
// and we would be importing TED's notices back through Poland.
const TED_NOTICE_NUMBER = /^\d{4}\/S\s/;

// ── CPV ─────────────────────────────────────────────────────────────────────
//
// The field is a single string carrying code and Polish label together:
//
//   "39000000-2 (Meble (włącznie z biurowymi), wyposażenie, urządzenia…),
//    39224000-8 (Miotły i szczotki…),39224200-0 (Szczotki)"
//
// Splitting on commas is wrong — the LABELS contain commas, and parentheses
// nest. So the codes are extracted by shape instead. CPV is eight digits with
// an optional check digit; the check digit is not part of the code and the
// classification layer rejects it, so it is dropped rather than carried.
const CPV_IN_TEXT = /\b(\d{8})(?:-\d)?\b/g;

function cpvCodes(value) {
  const out = [];
  const seen = new Set();
  for (const m of String(value == null ? '' : value).matchAll(CPV_IN_TEXT)) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    out.push(['CPV', m[1]]);
  }
  return out;
}

// Polish voivodeship as published: "PL16". That is a NUTS code, one of the two
// subnational vocabularies this schema supports, and it is NOT an ISO 3166-2
// subdivision — Poland's ISO codes look like "PL-OP". Recording a NUTS code
// under the ISO scheme would be a quiet category error, so the scheme travels
// with the code.
const NUTS_PL = /^PL[0-9]{1,3}$/;

const trim = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

function noticeUrl(noticeNumber) {
  // ── READ FROM THE APPLICATION'S OWN ROUTER, NOT GUESSED ───────────────────
  //
  // eZamówienia is an Angular single-page app: every path returns the same
  // 2,343-byte shell, and a real notice id and a fabricated one are byte-
  // identical responses. A constructed link therefore cannot be verified by
  // fetching it, and a wrong pattern would give 5,975 records a dead link
  // with nothing to detect it.
  //
  // So the route table was read out of the app's own lazy-loaded bundle:
  //
  //   path: "tender-details/:noticeNumber"
  //   path: "notice-details/:noticeNumber"
  //   path: "notice-details/id/:noticeId"
  //
  // and its navigation logic chooses between them:
  //
  //   planOptionsDictionary.find(t => t.value === e.noticeType)
  //     ? navigate(["bzp","tender-details", e.noticeNumber])
  //     : redirectTo(["bzp","notice-details","id", e.noticeId])
  //
  // The first branch is for PLAN notices. A ContractNotice is not one, so it
  // resolves through notice-details, keyed by the notice number this feed
  // publishes. An earlier draft of this adapter guessed
  // "notice-details/{objectId}" — wrong in both the parameter and, for the
  // plan case, the path.
  return `https://ezamowienia.gov.pl/mo-client-board/bzp/notice-details/${encodeURIComponent(noticeNumber)}`;
}

function searchUrl(source, { page, offersFrom }) {
  const p = new URLSearchParams({
    SubmittingOffersDateFrom: offersFrom,
    NoticeType: CARRIED_NOTICE_TYPE,
    // ASCENDING by publication date, deliberately. Under DESC the newest
    // notice is page 1, so anything published mid-walk shifts every subsequent
    // page and the traversal silently skips records. Under ASC new
    // publications append to the END, past the point we have already read.
    SortingColumnName: 'PublicationDate',
    SortingDirection: 'ASC',
    PageNumber: String(page),
    PageSize: String(SERVER_PAGE_SIZE),
  });
  return `${source.endpoint}?${p.toString()}`;
}

async function fetchAll({ source, nowIso, log }) {
  // The window is anchored to the run's own date: notices still accepting
  // offers today or later. A date, not an instant — the filter is a date
  // filter and handing it a timestamp would be inventing precision.
  const offersFrom = String(nowIso).slice(0, 10);
  const raw = [];
  const seen = new Set();
  let page = 1;
  let population = null;
  let complete = false;
  const maxPages = source.maxPages || 800;

  while (page <= maxPages) {
    const url = searchUrl(source, { page, offersFrom });
    // eslint-disable-next-line no-await-in-loop
    const res = await http.request(url, { headers: { Accept: 'application/json' } });
    let items;
    try {
      items = JSON.parse(res.text);
    } catch {
      throw new Error(`pl-bzp: page ${page} was not JSON (${res.text.slice(0, 120)})`);
    }
    if (!Array.isArray(items)) {
      throw new Error(`pl-bzp: page ${page} was not an array of notices`);
    }

    // The server states the size of the filtered set in its own header, and
    // that is what makes "complete" a measured claim rather than "we stopped".
    //
    // Read on EVERY page, last one winning, because a 598-page walk takes
    // minutes against a live register. The count at the start of the walk is
    // already stale by the end of it — the first run collected 5,979 notices
    // against the 5,978 the first page reported, and those two numbers
    // disagreeing looked like over-collection when it was simply Poland
    // publishing three more tenders while we read.
    //
    // Ascending order is what makes that safe rather than lossy: new notices
    // append past the point already read instead of shifting every later page.
    const pag = res.headers.get ? res.headers.get('x-pagination') : null;
    if (pag) {
      try {
        const n = JSON.parse(pag).TotalCount;
        if (Number.isFinite(n)) population = n;
      } catch { /* keep the previous count rather than discarding it */ }
    }

    if (!items.length) { complete = true; break; }
    for (const it of items) {
      const key = trim(it.noticeNumber) || trim(it.objectId);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      raw.push(it);
    }
    if (items.length < SERVER_PAGE_SIZE) { complete = true; break; }
    page += 1;
  }

  if (!complete && page > maxPages) {
    // Truncation is recorded, never dressed up as a complete window. A partial
    // window must not be allowed to look like a shrinking one.
    log(`pl-bzp: PAGE CAP reached at ${maxPages} pages — window is PARTIAL.`);
  }

  log(`pl-bzp: ${raw.length} notices over ${page} page(s)`
    + `${population !== null ? ` of ${population} the source reports` : ''}`
    + `${complete ? '' : ' — PARTIAL'}`);

  return {
    raw,
    pages: page,
    population,
    complete,
    endpoint: source.endpoint,
  };
}

function normalize(r, { source, nowIso }) {
  // ── IDENTITY IS THE NOTICE, NOT THE VERSION ───────────────────────────────
  //
  // `noticeNumber` carries a version suffix — "2026/BZP 00392343/01" — and
  // `bzpNumber` is the same notice without it. An amendment republishes under
  // the same bzpNumber with a new suffix and a moved deadline, exactly the
  // shape SAM.gov has. Identity is therefore the bzpNumber, so the versions
  // collapse to one opportunity holding current state, and the ingester's
  // recency rule keeps the LATEST of them rather than an arbitrary one.
  const bzp = trim(r.bzpNumber);
  const noticeNumber = trim(r.noticeNumber);
  if (!bzp || !noticeNumber) return null;

  // Second guard on the TED mirrors. The source query already excludes them;
  // if one arrives anyway the filter has changed meaning and we must not
  // quietly re-import TED through Poland.
  if (TED_NOTICE_NUMBER.test(bzp) || TED_NOTICE_NUMBER.test(noticeNumber)) return null;
  if (trim(r.noticeType) !== CARRIED_NOTICE_TYPE) return null;

  const title = trim(r.orderObject);
  if (!title) return null;

  const deadline = TIME.normalizeTimestamp(trim(r.submittingOffersDate));
  const publicationDate = TIME.normalizeTimestamp(trim(r.publicationDate));

  // ── STATUS ────────────────────────────────────────────────────────────────
  //
  // BZP publishes no status string. What it publishes is EVIDENCE: a procedure
  // result, a list of contractors, and an `outdated` flag. A notice carrying a
  // result or a winning contractor has been decided, whatever its deadline
  // says — so those outrank the calendar and the deadline never promotes a
  // decided procedure back into the open set.
  const decided = Boolean(trim(r.procedureResult))
    || (Array.isArray(r.contractors) && r.contractors.length > 0);
  const outdated = r.outdated === true;
  let reportedStatus = null;
  if (decided) reportedStatus = 'AWARDED';
  else if (outdated) reportedStatus = 'CLOSED';

  const noticeType = decided ? 'CONTRACT_AWARD' : 'CONTRACT_NOTICE';
  const { status, statusBasis } = SCHEMA.resolveStatus({
    reportedStatus, deadline, nowIso, noticeType,
  });

  const province = trim(r.organizationProvince);
  const subnationalJurisdiction = province && NUTS_PL.test(province)
    ? { scheme: 'NUTS', code: province } : null;

  return {
    id: SCHEMA.opportunityId(source.id, bzp),
    sourceId: source.id,
    sourcePlatformId: source.platformId,
    sourceNoticeId: bzp,
    sourceUrl: noticeUrl(noticeNumber),
    title,
    titles: null,
    // The board's list endpoint publishes no description; `htmlBody` is null
    // on every record observed and is the notice document in any case.
    descriptionSummary: null,
    buyerName: trim(r.organizationName),
    country: 'poland',
    subnationalJurisdiction,
    projectCountry: null,
    coverage: 'national',
    classifications: CLASS.normalizeCodes(cpvCodes(r.cpvCode)),
    publicationDate,
    deadline,
    // The feed states no modification timestamp; the version suffix on
    // noticeNumber is the only amendment signal and it is not a date.
    sourceModifiedDate: null,
    status,
    statusBasis,
    noticeType,
    procedureType: null,
    value: null, // no contract value is published in the board listing
    language: 'pl',
    lotCount: null,
    // ── THE FIELD THIS SOURCE EXISTS FOR ──────────────────────────────────
    //
    // The source states whether the procurement is below the EU publication
    // threshold. Inverted, that is exactly `publishedEuWide`: the canonical
    // field for "this notice also went to the Official Journal". A false here
    // is the source telling us TED does not have this procurement.
    publishedEuWide: typeof r.isTenderAmountBelowEU === 'boolean'
      ? !r.isTenderAmountBelowEU : null,
    // The board publishes no buyer-side reference distinct from the register
    // number, and the register number is already this record's identity.
    officialReference: null,
    electronicSubmission: null,
    submissionUrl: null,
    // Recorded so the ingest scope is inspectable per record.
    sourceNoticeType: trim(r.noticeType),
  };
}

module.exports = {
  id: ID,
  ID,
  PLATFORM_ID,
  SERVER_PAGE_SIZE,
  CARRIED_NOTICE_TYPE,
  TED_NOTICE_NUMBER,
  NUTS_PL,
  cpvCodes,
  noticeUrl,
  searchUrl,
  fetchAll,
  normalize,
};
