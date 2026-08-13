'use strict';

// oeffentlichevergabe.de — the German federal notice service
// (Datenservice Öffentlicher Einkauf).
//
// ── WHY GERMANY IS WORTH THE TROUBLE ────────────────────────────────────────
//
// The largest procurement market in the EU, and absent from the pilot through
// two phases. It is also the source that most tested Part 45's rule that a
// 200 with rows is not qualification — it took four probes to find the usable
// shape, and the first three all returned real data that would have been
// worthless.
//
//   Probe 1  ?pubDateFrom=…            400: "Neither 'pubMonth' nor 'pubDay'"
//   Probe 2  Accept: application/json  406: only ZIP content types exist
//   Probe 3  the `ocds` ZIP            1,153 releases — and ZERO deadlines,
//                                      ZERO tender.status. Every record would
//                                      have landed as UNKNOWN and been
//                                      excluded from every view.
//   Probe 4  the `ocds2` ZIP           578 releases, tender.status present,
//                                      366 with a lot-level deadline. Usable.
//
// Ingesting probe 3's output would have added 697 German "tenders" that no
// supplier could ever have seen. This adapter reads `ocds2`.
//
// ── THE SHAPE, WHICH IS NOT OCDS 1.1 ────────────────────────────────────────
//
// Close enough to OCDS to look familiar, different in the four places that
// matter, which is why this is a dedicated adapter rather than another
// configuration of the shared factory:
//
//   title      NOT on tender. It is on the LOT.
//   buyer      a REFERENCE ({id: "ORG-0001"}), resolved through parties[].
//   deadline   on lot.tenderPeriod.endDate, never on tender.tenderPeriod.
//   published  in tender.communication.noticePreferredPublicationDate;
//              the release-level `date` is undefined.
//
// Forcing this through the OCDS 1.1 factory would have produced records with
// no title, no buyer and no deadline — which is precisely the failure Part 13
// warns about: two sources are not one family because both say "OCDS".

const http = require('../to-http.cjs');
const ZIP = require('../to-zip.cjs');
const TIME = require('../to-time.cjs');
const CLASS = require('../to-classification.cjs');
const SCHEMA = require('../to-schema.cjs');

const ACCEPT = 'application/vnd.bekanntmachungsservice.ocds2.zip+zip';

const STATUS = {
  planning: 'UPCOMING',
  planned: 'UPCOMING',
  active: 'OPEN',
  cancelled: 'CANCELLED',
  withdrawn: 'CANCELLED',
  unsuccessful: 'CLOSED',
  complete: 'AWARDED',
};

const TAG_TYPE = {
  planning: 'PRIOR_INFORMATION',
  tender: 'CONTRACT_NOTICE',
  tenderAmendment: 'CONTRACT_NOTICE',
  award: 'CONTRACT_AWARD',
  contract: 'CONTRACT_AWARD',
};

const day = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

// One archive per published day. The window is therefore a small number of
// requests, each returning a complete day — which makes "complete" a fact
// about the day rather than a claim about pagination.
async function fetchAll({ source, nowIso, log }) {
  const raw = [];
  const days = [];
  let complete = true;

  for (let i = 1; i <= source.window.days; i += 1) {
    const d = new Date(Date.parse(nowIso) - i * 86400000);
    const pubDay = day(d);
    const url = `${source.endpoint}?pubDay=${pubDay}`;
    let body;
    try {
      // eslint-disable-next-line no-await-in-loop
      body = await http.getBuffer(url, { headers: { Accept: ACCEPT }, timeoutMs: 90000 });
    } catch (e) {
      // One missing day (a weekend, a holiday) is not an outage. It is
      // recorded and the window is marked incomplete rather than silently
      // reported as a full window that happened to be small.
      log(`de-vergabe: ${pubDay} unavailable (${e.message.slice(0, 60)}); window marked PARTIAL.`);
      complete = false;
      continue;
    }
    let entries;
    try {
      ({ entries } = ZIP.readJsonEntries(body));
    } catch (e) {
      log(`de-vergabe: ${pubDay} archive unreadable (${e.message.slice(0, 80)}); window marked PARTIAL.`);
      complete = false;
      continue;
    }
    days.push(pubDay);
    for (const e of entries) {
      for (const r of (e.json.releases || [])) raw.push(r);
    }
  }

  log(`de-vergabe: ${raw.length} release(s) across ${days.length} published day(s).`);
  return { raw, pages: days.length, population: raw.length, complete, endpoint: source.endpoint };
}

const trim = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

function normalize(r, { source, nowIso }) {
  const noticeId = trim(r.ocid) || trim(r.id);
  if (!noticeId) return null;
  const tender = r.tender || {};
  const lots = Array.isArray(tender.lots) ? tender.lots : [];

  // The title lives on the lot. A single-lot notice reads naturally; a
  // multi-lot notice takes the first lot's title and records the lot count, so
  // a reader can see there is more behind it. Inventing a combined title from
  // several lots would be writing a title the buyer did not.
  const title = trim(tender.title) || trim((lots.find((l) => trim(l.title)) || {}).title)
    || trim(tender.description);
  if (!title) return null;

  // buyer is a reference into parties[].
  const parties = Array.isArray(r.parties) ? r.parties : [];
  const buyerRef = r.buyer && r.buyer.id;
  const buyerParty = parties.find((p) => p.id === buyerRef)
    || parties.find((p) => (p.roles || []).includes('buyer')) || {};

  const codes = [];
  const pushCode = (c) => {
    if (!c || !c.id) return;
    const scheme = String(c.scheme || '').toUpperCase();
    if (CLASS.SCHEMES.includes(scheme)) codes.push([scheme, c.id]);
  };
  for (const item of tender.items || []) {
    pushCode(item.classification);
    for (const c of item.additionalClassifications || []) pushCode(c);
  }
  for (const lot of lots) {
    for (const item of lot.items || []) {
      pushCode(item.classification);
      for (const c of item.additionalClassifications || []) pushCode(c);
    }
  }

  // The earliest lot deadline governs: a supplier bidding one lot cannot rely
  // on another lot's later date. Same rule as TED.
  const lotDeadlines = lots
    .map((l) => (l.tenderPeriod && l.tenderPeriod.endDate ? TIME.normalizeTimestamp(l.tenderPeriod.endDate) : null))
    .filter((t) => t && t.precision !== 'NONE');
  const decidable = lotDeadlines.filter(TIME.isDecidable).sort((a, b) => (a.iso < b.iso ? -1 : 1));
  const tenderPeriodEnd = tender.tenderPeriod && tender.tenderPeriod.endDate
    ? TIME.normalizeTimestamp(tender.tenderPeriod.endDate) : null;
  const deadline = decidable[0] || lotDeadlines[0] || tenderPeriodEnd || TIME.EMPTY;

  const published = TIME.normalizeTimestamp(
    (tender.communication && tender.communication.noticePreferredPublicationDate) || r.date || null,
  );

  const tags = Array.isArray(r.tag) ? r.tag : [];
  const noticeType = tags.map((t) => TAG_TYPE[t]).find(Boolean) || 'CONTRACT_NOTICE';
  const reported = STATUS[tender.status] || null;
  const { status, statusBasis } = SCHEMA.resolveStatus({
    reportedStatus: reported, deadline, nowIso, noticeType,
  });

  let value = null;
  const v = tender.value || (lots.find((l) => l.value) || {}).value || {};
  const amount = Number(v.amount);
  if (Number.isFinite(amount) && amount > 0 && v.currency && /^[A-Z]{3}$/.test(v.currency)) {
    value = { amount, currency: v.currency, basis: 'ESTIMATED', scope: tender.value ? 'NOTICE' : 'LOTS' };
  }

  return {
    id: SCHEMA.opportunityId(source.id, noticeId),
    sourceId: source.id,
    sourcePlatformId: source.platformId,
    sourceNoticeId: noticeId,
    sourceUrl: `https://oeffentlichevergabe.de/api/notices/${encodeURIComponent(trim(r.id) || noticeId)}`,
    title,
    titles: { de: title },
    descriptionSummary: trim(tender.description),
    buyerName: trim(buyerParty.name),
    country: 'germany',
    // The party address carries a NUTS code in some notices, but not
    // consistently and not as an ISO subdivision. Not stored as one.
    subnationalJurisdiction: null,
    projectCountry: null,
    coverage: 'national',
    classifications: CLASS.normalizeCodes(codes),
    publicationDate: published,
    deadline,
    sourceModifiedDate: null,
    status,
    statusBasis,
    noticeType,
    procedureType: trim(tender.procurementMethodDetails) || trim(tender.mainProcurementCategory),
    value,
    language: trim(r.language) || 'de',
    lotCount: lots.length || null,
    officialReference: trim(tender.id),
  };
}

module.exports = { id: 'de-vergabe', ACCEPT, STATUS, TAG_TYPE, fetchAll, normalize };
