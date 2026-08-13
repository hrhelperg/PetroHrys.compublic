'use strict';

// Spain — Plataforma de Contratación del Sector Público (PCSP).
//
// ── WHAT THIS SOURCE IS ─────────────────────────────────────────────────────
//
// PLATFORM: the Plataforma de Contratación del Sector Público, operated by the
//           Dirección General del Patrimonio del Estado (Ministerio de
//           Hacienda). That is the procurement system.
// FEED:     an ATOM syndication of that platform's notices.
// FORMAT:   CODICE, Spain's UBL 2 profile, embedded in each ATOM entry.
//
// Those are three different things. The ATOM feed is not the platform and
// CODICE is not the operator, so the canonical TenderPlatform is resolved from
// the platform, and this adapter never mints one.
//
// ── TLS ─────────────────────────────────────────────────────────────────────
//
// Certificate verification is ON and stays on. The research note said the
// chain does not validate — that was `curl` on one machine. Node validates it
// with its bundled Mozilla trust store (`authorized: true`, no authError),
// because AC RAIZ FNMT-RCM is in that store. So there is no custom CA bundle,
// no NODE_EXTRA_CA_CERTS and no agent override here: the safest position was
// available and is what we use. If that ever changes the fetch fails closed.
//
// ── WHAT THE FEED ACTUALLY CONTAINS ─────────────────────────────────────────
//
// Every entry is a contract folder at some point in its life, and the status
// code says which: a folder under evaluation, awarded or cancelled is in the
// feed alongside one still accepting bids. Treating "has a future deadline" as
// "open" would import awarded procurements as opportunities, so status is read
// first and the deadline is never allowed to override it.
//
// ── THE WINDOW, WHICH IS WHY THIS SOURCE IS NOT ACTIVE ──────────────────────
//
// Measured by walking four pages: the feed is a CHRONOLOGICAL UPDATE STREAM
// ordered by `updated` descending, not a list of open opportunities.
//
//   page 1  182 entries  2026-08-10 14:51 -> 19:34
//   page 2  499 entries  2026-08-10 13:01 -> 14:50
//   page 3  498 entries  2026-08-10 11:12 -> 13:01
//   page 4  498 entries  2026-08-10 09:34 -> 11:12
//
// 1,677 distinct entries covering ten hours of ONE DAY. A tender published
// last month and still accepting bids appears only if it happened to be
// updated recently; reaching it means walking back through every intervening
// publication.
//
// Two consequences, and they are the reason this adapter is registered but
// disabled:
//
//   1. Traversing to the end of the chain would NOT yield the set of currently
//      open Spanish tenders. Feed completeness and current-opportunity
//      completeness are different facts, and only the first is achievable here.
//   2. Absence from any bounded traversal therefore means nothing. Spain must
//      never feed disappearance detection, or a tender missing from today's
//      window becomes a false closure.
//
// The window is DELTA_FEED. Activation needs either a bounded-window ingest
// design with disappearance suppression, or a different official endpoint that
// is genuinely a current-opportunity view.

const TIME = require('../to-time.cjs');
const SCHEMA = require('../to-schema.cjs');
const CLASS = require('../to-classification.cjs');

const ID = 'es-pcsp';

// Chronological update stream. NOT a current-opportunity window: see below.
const WINDOW = 'DELTA_FEED';
// Resolved from the existing TenderPlatform registry, not minted here.
const PLATFORM_ID = 'es-plataforma-de-contratacion';

// ── XML READING ─────────────────────────────────────────────────────────────
//
// A regex reader rather than a parser dependency, matching the repository's
// existing no-dependency posture. It is deliberately incapable of resolving an
// external entity or fetching a DTD: it never interprets `<!DOCTYPE` or `&ent;`
// beyond the five XML built-ins, so XXE is not reachable from here.
//
// Namespace prefixes vary within one document — the status code arrives as
// `cbc-place-ext:ContractFolderStatusCode` while its siblings are plain `cbc:`
// — so the reader matches on LOCAL NAME and ignores the prefix.
function localTag(name) {
  return new RegExp(`<(?:[A-Za-z][\\w.-]*:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[A-Za-z][\\w.-]*:)?${name}>`);
}

function localTagAll(name) {
  return new RegExp(`<(?:[A-Za-z][\\w.-]*:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[A-Za-z][\\w.-]*:)?${name}>`, 'g');
}

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };

function decode(text) {
  return String(text == null ? '' : text)
    .replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENTITIES[m])
    // Numeric character references are data, not markup, and are safe.
    .replace(/&#(\d{1,7});/g, (_, n) => String.fromCodePoint(Number(n)))
    .trim();
}

function pick(xml, name) {
  const m = localTag(name).exec(xml || '');
  return m ? decode(m[1]) : null;
}

function pickAll(xml, name) {
  return [...String(xml || '').matchAll(localTagAll(name))].map((m) => decode(m[1]));
}

function attr(xml, name, attribute) {
  const m = new RegExp(`<(?:[A-Za-z][\\w.-]*:)?${name}\\b[^>]*\\b${attribute}="([^"]*)"`).exec(xml || '');
  return m ? decode(m[1]) : null;
}

function block(xml, name) {
  const m = localTag(name).exec(xml || '');
  return m ? m[1] : null;
}

// ── STATUS ──────────────────────────────────────────────────────────────────
//
// CODICE ContractFolderStatusCode, read from the platform's own code list.
// Anything not listed stays UNKNOWN rather than being guessed into OPEN.
//
//   PUB  publicada          — accepting bids
//   EV   en evaluación      — bidding closed, under evaluation
//   ADJ  adjudicada         — awarded
//   RES  resuelta           — resolved/formalised
//   ANUL anulada            — cancelled
//   PRE  anuncio previo     — prior information, a plan rather than a tender
const STATUS = {
  PUB: 'OPEN',
  EV: 'CLOSED',
  ADJ: 'AWARDED',
  RES: 'AWARDED',
  ANUL: 'CANCELLED',
  // PRE (anuncio previo) is a prior-information notice: an intention, not a
  // procedure anyone can bid on. It is deliberately absent from this map so it
  // resolves to UNKNOWN rather than being promoted to UPCOMING on our own
  // authority. Observed live on pages 3 and 4.
};

// A prior-information notice announces an intention, not a procedure a
// supplier can bid on today. It is carried as UPCOMING only when the platform
// says PRE; it is never inferred from a distant deadline.
const NOTICE_TYPE = {
  PUB: 'CONTRACT_NOTICE',
  EV: 'CONTRACT_NOTICE',
  ADJ: 'CONTRACT_AWARD',
  RES: 'CONTRACT_AWARD',
  ANUL: 'CONTRACT_NOTICE',
  PRE: 'PRIOR_INFORMATION',
};

// ── ENTRY → SOURCE RECORD ───────────────────────────────────────────────────

function normalizeEntry(entry, { nowIso }) {
  const id = pick(entry, 'id');
  if (!id) return null;

  // The ATOM id is a stable platform URL ending in the notice's own number.
  // That number is the identity; the URL around it is not.
  const noticeId = (id.match(/(\d+)\s*$/) || [])[1] || id;

  const status = (pick(entry, 'ContractFolderStatusCode') || '').toUpperCase() || null;
  const project = block(entry, 'ProcurementProject') || '';
  const party = block(entry, 'LocatedContractingParty') || block(entry, 'ContractingParty') || entry;

  // Buyer: the contracting authority the platform names. Never the platform.
  const partyName = block(party, 'PartyName');
  const buyerName = partyName ? pick(partyName, 'Name') : null;

  // CPV. `cbc:ItemClassificationCode` inside RequiredCommodityClassification
  // is genuinely CPV on this platform; no other numeric field is read as one.
  const commodity = pickAll(entry, 'ItemClassificationCode');
  const codes = commodity.map((c) => ['CPV', c]);

  // Deadline: a date and a separate time, with NO offset anywhere in the
  // document. Combining them yields a local wall-clock time whose instant is
  // unknown, which is exactly what ZONELESS precision exists to record. An
  // offset is never invented.
  const deadlineBlock = block(entry, 'TenderSubmissionDeadlinePeriod');
  const endDate = deadlineBlock ? pick(deadlineBlock, 'EndDate') : null;
  const endTime = deadlineBlock ? pick(deadlineBlock, 'EndTime') : null;
  const deadline = endDate
    ? TIME.normalizeTimestamp(endTime ? `${endDate}T${endTime}` : endDate)
    : TIME.EMPTY;

  // Value. The platform states a currency attribute; it is preserved and never
  // converted. TotalAmount is the project budget as declared.
  const budget = block(entry, 'BudgetAmount') || project;
  const totalRaw = pick(budget, 'TotalAmount');
  const currency = attr(budget, 'TotalAmount', 'currencyID');
  const amount = totalRaw != null && totalRaw !== '' && Number.isFinite(Number(totalRaw))
    ? Number(totalRaw) : null;

  const location = block(entry, 'RealizedLocation');
  const region = location ? pick(location, 'CountrySubentity') : null;

  // The notice's own page on the platform, from the ATOM link. Never the
  // platform homepage.
  const link = attr(entry, 'link', 'href');

  const title = pick(entry, 'title');
  const summary = pick(entry, 'summary');

  return {
    sourceNoticeId: noticeId,
    sourceUrl: link && /^https?:\/\//i.test(link) ? link : id,
    title,
    descriptionSummary: summary && summary !== title ? summary : null,
    buyerName: buyerName || null,
    // The platform is Spanish and publishes Spanish public procurement; the
    // country is a property of the system, not a guess about the notice. Any
    // finer geography stays as the region string the source gave.
    country: 'spain',
    subnationalName: region || null,
    officialReference: pick(entry, 'ContractFolderID'),
    classifications: CLASS.normalizeCodes(codes),
    deadline,
    // ATOM `updated` is when the FEED entry changed, which is not the notice's
    // publication date. It is carried as the source's own modification stamp
    // and never promoted to publicationDate.
    sourceModifiedDate: TIME.normalizeTimestamp(pick(entry, 'updated')),
    reportedStatus: STATUS[status] || null,
    noticeType: NOTICE_TYPE[status] || 'UNKNOWN',
    statusCode: status,
    value: amount != null && currency ? { amount, currency, basis: 'ESTIMATED' } : null,
    // Not established per notice by this feed, and never inherited from the
    // platform: electronic submission, document availability and foreign
    // supplier eligibility all stay unknown.
    electronicSubmission: null,
    submissionUrl: null,
  };
}

// Split a feed document into entries without parsing the whole thing.
function entriesOf(xml) {
  return [...String(xml || '').matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
}

// The `next` link is followed only when it stays on the platform's own host: a
// feed must not be able to redirect ingestion at an arbitrary server.
function nextLink(xml, currentUrl) {
  const m = /<link\b[^>]*rel="next"[^>]*>/.exec(xml || '');
  if (!m) return null;
  const href = (m[0].match(/href="([^"]*)"/) || [])[1];
  if (!href) return null;
  let url;
  try { url = new URL(decode(href), currentUrl); } catch { return null; }
  if (url.protocol !== 'https:') return null;
  if (url.host !== new URL(currentUrl).host) return null;
  return url.href;
}

module.exports = {
  ID, PLATFORM_ID, WINDOW, STATUS, NOTICE_TYPE,
  localTag, decode, pick, pickAll, attr, block,
  entriesOf, nextLink, normalizeEntry,
};
