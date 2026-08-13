'use strict';

// SECOP II — Colombia's national electronic procurement system, read through
// the national open-data portal (Socrata dataset p6dx-8zbt on datos.gov.co).
//
// ── WHY THIS SOURCE EARNS ITS PLACE ─────────────────────────────────────────
//
// It is the pilot's only STRUCTURED_PUBLIC_DATA source, its only Spanish-
// language source, and — the reason it is genuinely useful as a test — the
// only source that publishes a STATUS but NO DEADLINE.
//
// There is no closing-date column in this dataset. Not a null one: none. That
// combination breaks any design where "is this open?" is answered by comparing
// a deadline to now, and it is exactly why status resolution puts the source's
// own word first. `estado_de_apertura_del_proceso` says "Abierto", so these
// records are OPEN on the buyer's authority with a null deadline — and they
// can never appear in a "closing soon" view, because nothing was published to
// close.
//
// A design that derived status from dates would have had to either drop this
// source or invent deadlines for it. Both were available and both are wrong.
//
// ── TWO PORTAL ARTEFACTS ────────────────────────────────────────────────────
//
//   Category codes arrive as "V1.80111600". The "V1." is Colombia Compra's
//   dataset versioning, not part of UNSPSC; the classification normalizer
//   strips it so the code deduplicates against Canada's plain UNSPSC.
//
//   Colombian departments (Magdalena, Antioquia…) have real ISO 3166-2 codes,
//   but this project's ISO allowlist covers nine countries and Colombia is not
//   one of them. Hand-writing CO-* codes here would be exactly the
//   fabrication the platforms collection refused in Wave T3. So the department
//   is not stored as a subdivision, and Colombian records carry a null
//   subnational jurisdiction until the allowlist is regenerated from an
//   authoritative source.
//
// Access: GET /resource/p6dx-8zbt.json, keyless (an app token raises quota but
// is not required). robots.txt publishes Crawl-delay: 1 and disallows /browse
// HTML search permutations; this client honours the delay and never touches
// /browse.

const http = require('../to-http.cjs');
const TIME = require('../to-time.cjs');
const CLASS = require('../to-classification.cjs');
const SCHEMA = require('../to-schema.cjs');

// `estado_de_apertura_del_proceso` — the clearest open/closed statement.
const APERTURA = { abierto: 'OPEN', cerrado: 'CLOSED' };

// `fase` — the procedure phase. Used when apertura is absent, and it is the
// field that distinguishes a live bidding window from an awarded procedure.
const FASE = {
  'presentación de oferta': 'OPEN',
  'presentacion de oferta': 'OPEN',
  'fase de ofertas': 'OPEN',
  'fase de selección': 'OPEN',
  convocatoria: 'UPCOMING',
  planeación: 'UPCOMING',
  borrador: 'UPCOMING',
  adjudicado: 'AWARDED',
  celebrado: 'AWARDED',
  terminado: 'CLOSED',
  terminado_anormal_despues_convocado: 'CANCELLED',
  cancelado: 'CANCELLED',
  descartado: 'CANCELLED',
};

const CONTRACT_TYPE = {
  'licitación pública': 'INVITATION_FOR_BIDS',
  'selección abreviada': 'CONTRACT_NOTICE',
  'concurso de méritos': 'REQUEST_FOR_PROPOSAL',
  'mínima cuantía': 'REQUEST_FOR_QUOTATION',
  'contratación directa': 'OTHER',
  'contratación régimen especial': 'OTHER',
};

function isoDateOnly(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

async function fetchAll({ source, nowIso, log }) {
  const from = new Date(Date.parse(nowIso) - source.window.days * 86400000);
  // Three conditions, all about being a BIDDABLE OPPORTUNITY rather than about
  // size.
  //
  //   open      `estado_de_apertura_del_proceso = 'Abierto'` is the portal's
  //             own statement that bidding is open.
  //   competitive  Colombia published 7,709 open notices in two days, and
  //             7,075 of them were `Contratación directa` or `Contratación
  //             régimen especial` — awards made without a competition. A
  //             supplier cannot bid for those; listing them as opportunities
  //             would be listing decisions as invitations. The "(con ofertas)"
  //             variants of both DO invite offers and are kept.
  //   recent    a 7-day window, because this dataset lags: on the day of the
  //             pilot its newest publication date was two days behind, and a
  //             1-day window returned 32 records where a 2-day window returned
  //             7,709.
  const where = encodeURIComponent(
    `fecha_de_publicacion_del > '${isoDateOnly(from)}T00:00:00.000'`
    + " AND estado_de_apertura_del_proceso='Abierto'"
    + " AND modalidad_de_contratacion NOT IN"
    + " ('Contratación directa', 'Contratación régimen especial')",
  );
  const raw = [];
  let pages = 0;

  for (let page = 0; page < source.maxPages; page += 1) {
    const url = `${source.endpoint}?$limit=${source.pageSize}&$offset=${page * source.pageSize}`
      + `&$where=${where}&$order=id_del_proceso`;
    // eslint-disable-next-line no-await-in-loop
    const batch = await http.getJson(url);
    pages += 1;
    if (!Array.isArray(batch) || !batch.length) break;
    raw.push(...batch);
    if (batch.length < source.pageSize) {
      // A short page means the window is exhausted, which is the only way this
      // source can honestly report complete coverage.
      log(`secop2: window exhausted after ${pages} page(s), ${raw.length} records.`);
      return { raw, pages, population: raw.length, complete: true, endpoint: source.endpoint };
    }
  }

  log(`secop2: stopped at the ${source.maxPages}-page cap with ${raw.length} records. `
    + 'Coverage is PARTIAL and recorded as such.');
  return { raw, pages, population: null, complete: false, endpoint: source.endpoint };
}

const trim = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const norm = (v) => (trim(v) || '').toLowerCase();

function normalize(r, { source, nowIso }) {
  const noticeId = trim(r.id_del_proceso);
  if (!noticeId) return null;
  const title = trim(r.nombre_del_procedimiento);
  if (!title) return null;

  const codes = [];
  if (trim(r.codigo_principal_de_categoria)) codes.push(['UNSPSC', r.codigo_principal_de_categoria]);
  const extra = trim(r.categorias_adicionales);
  if (extra && norm(extra) !== 'no definido') {
    for (const c of extra.split(/[,;]\s*/)) if (c) codes.push(['UNSPSC', c]);
  }

  const published = TIME.normalizeTimestamp(r.fecha_de_publicacion_del);
  const modified = TIME.normalizeTimestamp(r.fecha_de_ultima_publicaci);

  // No deadline column exists in this dataset. Stated as EMPTY rather than
  // guessed from the procedure duration, which measures the contract, not the
  // bidding window.
  const deadline = TIME.EMPTY;

  const reported = APERTURA[norm(r.estado_de_apertura_del_proceso)]
    || FASE[norm(r.fase)]
    || FASE[norm(r.estado_resumen)]
    || null;
  const noticeType = CONTRACT_TYPE[norm(r.modalidad_de_contratacion)] || 'OTHER';
  const { status, statusBasis } = SCHEMA.resolveStatus({ reportedStatus: reported, deadline, nowIso, noticeType });

  // `precio_base` is the published base price of the procedure. Colombian
  // pesos throughout this dataset; a zero means no figure was published.
  let value = null;
  const base = Number(r.precio_base);
  if (Number.isFinite(base) && base > 0) {
    value = { amount: base, currency: 'COP', basis: 'ESTIMATED', scope: 'NOTICE' };
  }

  const lots = Number(r.numero_de_lotes);

  const url = r.urlproceso && typeof r.urlproceso === 'object' ? trim(r.urlproceso.url) : trim(r.urlproceso);

  return {
    id: SCHEMA.opportunityId(source.id, noticeId),
    sourceId: source.id,
    sourcePlatformId: source.platformId,
    sourceNoticeId: noticeId,
    sourceUrl: url || 'https://community.secop.gov.co/Public/Tendering/ContractNoticeManagement/Index',
    title,
    titles: { es: title },
    descriptionSummary: trim(r.descripci_n_del_procedimiento),
    buyerName: trim(r.entidad),
    country: 'colombia',
    // See the note at the top: Colombia is not on this project's ISO 3166-2
    // allowlist, and inventing CO-* codes is not an option.
    subnationalJurisdiction: null,
    projectCountry: null,
    coverage: 'national',
    classifications: CLASS.normalizeCodes(codes),
    publicationDate: published,
    deadline,
    sourceModifiedDate: modified.precision === 'NONE' ? null : modified,
    status,
    statusBasis,
    noticeType,
    procedureType: trim(r.modalidad_de_contratacion),
    value,
    language: 'es',
    lotCount: Number.isFinite(lots) && lots > 0 ? lots : null,
    amendsNoticeId: null,
    officialReference: trim(r.referencia_del_proceso),
  };
}

module.exports = { id: 'secop2', APERTURA, FASE, CONTRACT_TYPE, fetchAll, normalize };
