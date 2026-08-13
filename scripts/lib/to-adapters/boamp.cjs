'use strict';

// BOAMP — Bulletin officiel des annonces des marchés publics (France).
//
// France's national notice bulletin, published as open data through an
// Opendatasoft Explore API. 1.7 million records; a four-day window is ~870.
//
// ── WHY IT IS HERE ──────────────────────────────────────────────────────────
//
// Two reasons, in order. First, `famille` marks whether a notice went to the
// Official Journal (`JOUE`), so like TenderNed this source overlaps TED
// deliberately and gives the deduplication graph real cross-publication to
// resolve. Second, France is the largest EU procurement market absent from the
// v1 pilot.
//
// ── WHAT IT DOES NOT GIVE US ────────────────────────────────────────────────
//
// A usable CPV code. The flat record carries `descripteur_code` — BOAMP's own
// descriptor vocabulary, not CPV — and the real CPV lives inside `donnees`, an
// eForms XML document serialised to JSON under a single `EFORMS` key whose
// internal path varies by notice schema version.
//
// Reaching into that structure to guess at a CPV path would produce a
// classification that is right until the schema moves, and wrong silently.
// So BOAMP records carry NO classification, exactly as World Bank records do,
// and matching falls back to the title terms with `NO_CLASSIFICATION` shown as
// an uncertainty. Extracting CPV properly is a scoped piece of work against
// the eForms schema, not a regex.
//
// ── DEADLINES ───────────────────────────────────────────────────────────────
//
// `datelimitereponse` arrives as a full instant with an explicit offset
// ("2026-09-15T09:59:00+00:00"), which is the best shape any source in this
// project publishes.

const http = require('../to-http.cjs');
const TIME = require('../to-time.cjs');
const SCHEMA = require('../to-schema.cjs');

// `nature` — the notice kind, from BOAMP's own controlled vocabulary.
const NATURE = {
  APPEL_OFFRE: 'CONTRACT_NOTICE',
  AVIS_MARCHE: 'CONTRACT_NOTICE',
  MAPA: 'CONTRACT_NOTICE',
  ATTRIBUTION: 'CONTRACT_AWARD',
  RESULTAT: 'CONTRACT_AWARD',
  AVIS_PREALABLE: 'PRIOR_INFORMATION',
  PREINFORMATION: 'PRIOR_INFORMATION',
  RECTIFICATIF: 'CONTRACT_NOTICE',
  ANNULATION: 'OTHER',
};

// `etat` — the lifecycle state BOAMP publishes for the notice itself.
const ETAT = {
  INITIAL: null,      // published and standing: defer to the deadline
  RECTIFICATIF: null, // corrected but still standing
  ANNULE: 'CANCELLED',
  SUPPRIME: 'CANCELLED',
};

const trim = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

async function fetchAll({ source, nowIso, log }) {
  const from = new Date(Date.parse(nowIso) - source.window.days * 86400000);
  const since = `${from.getUTCFullYear()}-${String(from.getUTCMonth() + 1).padStart(2, '0')}-${String(from.getUTCDate()).padStart(2, '0')}`;
  const where = encodeURIComponent(`dateparution>='${since}'`);
  const raw = [];
  let population = null;
  let pages = 0;
  let complete = false;

  for (let page = 0; page < source.maxPages; page += 1) {
    const url = `${source.endpoint}?limit=${source.pageSize}&offset=${page * source.pageSize}`
      + `&where=${where}&order_by=${encodeURIComponent('dateparution DESC, idweb ASC')}`;
    // eslint-disable-next-line no-await-in-loop
    const res = await http.getJson(url);
    pages += 1;
    if (population === null) population = Number(res.total_count);
    const results = Array.isArray(res.results) ? res.results : [];
    if (!results.length) { complete = true; break; }
    raw.push(...results);
    if (raw.length >= population || results.length < source.pageSize) { complete = true; break; }
  }

  if (!complete) {
    log(`boamp: stopped at the ${source.maxPages}-page cap with ${raw.length} of ${population} `
      + 'notices. Coverage is PARTIAL and recorded as such.');
  }
  return { raw, pages, population, complete, endpoint: source.endpoint };
}

function normalize(r, { source, nowIso }) {
  const noticeId = trim(r.idweb);
  if (!noticeId) return null;
  const title = trim(r.objet);
  if (!title) return null;

  const deadline = TIME.normalizeTimestamp(r.datelimitereponse);
  const published = TIME.normalizeTimestamp(r.dateparution);

  const noticeType = NATURE[trim(r.nature)] || 'OTHER';
  const reported = ETAT[trim(r.etat)] || null;
  const { status, statusBasis } = SCHEMA.resolveStatus({
    reportedStatus: reported, deadline, nowIso, noticeType,
  });

  return {
    id: SCHEMA.opportunityId(source.id, noticeId),
    sourceId: source.id,
    sourcePlatformId: source.platformId,
    sourceNoticeId: noticeId,
    sourceUrl: trim(r.url_avis) || `https://www.boamp.fr/pages/avis/?q=idweb:${encodeURIComponent(noticeId)}`,
    title,
    titles: { fr: title },
    // The flat record carries no description field distinct from `objet`,
    // which is already the title. Repeating it as a summary would pad the
    // record without adding a fact.
    descriptionSummary: null,
    buyerName: trim(r.nomacheteur),
    country: 'france',
    // `code_departement` is an INSEE department number ("35"), not an ISO
    // 3166-2 subdivision code, and this project does not translate between
    // coding systems it cannot verify.
    subnationalJurisdiction: null,
    projectCountry: null,
    coverage: 'national',
    classifications: [], // see the header note on CPV
    publicationDate: published,
    deadline,
    sourceModifiedDate: null,
    status,
    statusBasis,
    noticeType,
    procedureType: trim(r.procedure_libelle),
    value: null, // not published in the flat record
    language: 'fr',
    lotCount: null,
    officialReference: trim(r.contractfolderid) || trim(r.id),
    // `famille: JOUE` means the notice also went to the Official Journal, so
    // TED should be expected to carry it too.
    publishedEuWide: trim(r.famille) === 'JOUE',
  };
}

module.exports = { id: 'boamp', NATURE, ETAT, fetchAll, normalize };
