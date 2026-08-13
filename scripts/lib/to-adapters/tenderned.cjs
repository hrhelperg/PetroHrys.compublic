'use strict';

// TenderNed — the Netherlands' national procurement portal.
//
// ── WHY THIS SOURCE MATTERS MORE THAN ITS SIZE SUGGESTS ─────────────────────
//
// v1 reported ZERO cross-source duplicates and was honest about why: its five
// sources covered disjoint jurisdictions, so no procurement could appear
// twice. The deduplication graph was tested against fixtures because live data
// gave it nothing to do.
//
// TenderNed changes that. It publishes `europees: true` on notices that also
// go to the Official Journal — which is to say, on notices that are ALSO in
// TED. Dutch above-threshold procurement is genuinely published by two systems
// in this corpus, and the merge logic finally has real work.
//
// That is the point of adding it. National coverage is the secondary benefit.
//
// ── THE SHAPE ───────────────────────────────────────────────────────────────
//
// Spring-style paging: `page`, `size`, and a `totalElements` count, plus a
// `publicatieDatumVanaf` filter that bounds the window server-side. 145,058
// publications exist in total; three days is ~200.
//
// Deadlines are ZONELESS — "2026-09-14T12:00:00" with no offset. The
// Netherlands is one time zone, so a local reading would be defensible, but
// the source did not say so and this project does not supply a zone the
// publisher withheld. They display as published and never decide open/closed;
// `publicatiestatus` does that instead.

const http = require('../to-http.cjs');
const TIME = require('../to-time.cjs');
const SCHEMA = require('../to-schema.cjs');

// `publicatiecode` distinguishes the notice kind. Only codes whose meaning is
// unambiguous are mapped; the rest fall to the type implied by the publication
// type below.
const TYPE_PUBLICATIE = {
  AAN: 'CONTRACT_NOTICE',        // Aankondiging van een opdracht
  REC: 'CONTRACT_NOTICE',        // Rectificatie — a correction to a live notice
  VOO: 'PRIOR_INFORMATION',      // Vooraankondiging
  GUN: 'CONTRACT_AWARD',         // Gunning
  MAR: 'PRIOR_INFORMATION',      // Marktconsultatie
};

const STATUS = {
  PUB: 'OPEN',        // Gepubliceerd
  GES: 'CLOSED',      // Gesloten
  ING: 'CANCELLED',   // Ingetrokken
  GUN: 'AWARDED',     // Gegund
};

const trim = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const code = (o) => (o && typeof o === 'object' ? trim(o.code) : null);

async function fetchAll({ source, nowIso, log }) {
  const from = new Date(Date.parse(nowIso) - source.window.days * 86400000);
  const since = `${from.getUTCFullYear()}-${String(from.getUTCMonth() + 1).padStart(2, '0')}-${String(from.getUTCDate()).padStart(2, '0')}`;
  const raw = [];
  let population = null;
  let pages = 0;
  let complete = false;

  for (let page = 0; page < source.maxPages; page += 1) {
    const url = `${source.endpoint}?page=${page}&size=${source.pageSize}`
      + `&publicatieDatumVanaf=${since}`;
    // eslint-disable-next-line no-await-in-loop
    const res = await http.getJson(url);
    pages += 1;
    if (population === null) population = Number(res.totalElements);
    const content = Array.isArray(res.content) ? res.content : [];
    if (!content.length) { complete = true; break; }
    raw.push(...content);
    // `last` is the server telling us there is no page after this one, which
    // is a stronger terminator than a short page.
    if (res.last === true || content.length < source.pageSize) { complete = true; break; }
  }

  if (!complete) {
    log(`tenderned: stopped at the ${source.maxPages}-page cap with ${raw.length} of `
      + `${population} publications. Coverage is PARTIAL and recorded as such.`);
  }
  return { raw, pages, population, complete, endpoint: source.endpoint };
}

function normalize(r, { source, nowIso }) {
  const noticeId = trim(r.publicatieId);
  if (!noticeId) return null;
  const title = trim(r.aanbestedingNaam);
  if (!title) return null;

  const deadline = TIME.normalizeTimestamp(r.sluitingsDatum);
  const published = TIME.normalizeTimestamp(r.publicatieDatum);

  const noticeType = TYPE_PUBLICATIE[code(r.typePublicatie)] || 'CONTRACT_NOTICE';
  const reported = STATUS[code(r.publicatiestatus)] || null;
  const { status, statusBasis } = SCHEMA.resolveStatus({
    reportedStatus: reported, deadline, nowIso, noticeType,
  });

  const link = r.link && typeof r.link === 'object' ? trim(r.link.href) : null;

  return {
    id: SCHEMA.opportunityId(source.id, noticeId),
    sourceId: source.id,
    sourcePlatformId: source.platformId,
    sourceNoticeId: noticeId,
    sourceUrl: link || `https://www.tenderned.nl/aankondigingen/overzicht/${encodeURIComponent(noticeId)}`,
    title,
    titles: { nl: title },
    descriptionSummary: trim(r.opdrachtBeschrijving),
    buyerName: trim(r.opdrachtgeverNaam),
    country: 'netherlands',
    subnationalJurisdiction: null,
    projectCountry: null,
    coverage: 'national',
    // TenderNed's list endpoint publishes no CPV. `typeOpdracht` is
    // works/supplies/services — a contract nature, not a subject code — and
    // filing it as a classification would put a made-up code in a field that
    // exists to carry real ones.
    classifications: [],
    publicationDate: published,
    deadline,
    sourceModifiedDate: published,
    status,
    statusBasis,
    noticeType,
    procedureType: (r.procedure && trim(r.procedure.omschrijving)) || null,
    value: null, // no value published on the list endpoint
    language: 'nl',
    lotCount: null,
    // `kenmerk` is the buyer's own reference for the procurement, which is the
    // identity that can survive republication on another system.
    officialReference: r.kenmerk === null || r.kenmerk === undefined ? null : String(r.kenmerk),
    // Whether this procurement also went to the Official Journal — i.e.
    // whether TED should be expected to carry it too. Retained because it is
    // the source's own statement about cross-publication.
    publishedEuWide: r.europees === true,
  };
}

module.exports = { id: 'tenderned', TYPE_PUBLICATIE, STATUS, fetchAll, normalize };
