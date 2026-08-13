'use strict';

// TED — Tenders Electronic Daily. EU-wide above-threshold procurement.
//
// The pilot's anchor source: 6,000+ notices in a rolling three-day window,
// CPV on nearly every record, and — the reason this adapter is worth its
// length — OFFICIAL notice titles in all 24 EU languages, including the four
// this site publishes. Part 62 forbids machine-translating a tender title;
// TED hands over the Publications Office's own translation, so DE/ES/FR
// readers get an official title rather than ours or none.
//
// Access: POST /v3/notices/search, keyless, `fields` explicitly enumerated.
// Paging: `page` (1-based) with `limit` 250 max, `totalNoticeCount` returned
// on every response — which is what makes the completeness flag a fact rather
// than a hope.

const http = require('../to-http.cjs');
const TIME = require('../to-time.cjs');
const CLASS = require('../to-classification.cjs');
const SCHEMA = require('../to-schema.cjs');

// The notice types that represent a live, biddable procurement. Award and
// prior-information notices are deliberately excluded — see the query below.
const BIDDABLE_NOTICE_TYPES = ['cn-standard', 'cn-social', 'cn-desg'];

const FIELDS = [
  'publication-number', 'notice-title', 'buyer-name', 'buyer-country',
  'classification-cpv', 'deadline-receipt-tender-date-lot', 'publication-date',
  'notice-type', 'procedure-type', 'notice-identifier', 'description-lot',
  'official-language', 'estimated-value-lot', 'estimated-value-cur-lot',
  'modification-previous-notice-identifier', 'links',
];

// ISO 3166-1 alpha-3 → the project's country slugs, for the states TED
// actually publishes for (EU 27 + EEA + candidates + UK legacy notices).
// Transcribed from ISO 3166-1; an unmapped code yields a null country, which
// is honest, rather than a guess.
const COUNTRY_BY_ALPHA3 = {
  AUT: 'austria', BEL: 'belgium', BGR: 'bulgaria', HRV: 'croatia', CYP: 'cyprus',
  CZE: 'czech-republic', DNK: 'denmark', EST: 'estonia', FIN: 'finland', FRA: 'france',
  DEU: 'germany', GRC: 'greece', HUN: 'hungary', IRL: 'ireland', ITA: 'italy',
  LVA: 'latvia', LTU: 'lithuania', LUX: 'luxembourg', MLT: 'malta', NLD: 'netherlands',
  POL: 'poland', PRT: 'portugal', ROU: 'romania', SVK: 'slovakia', SVN: 'slovenia',
  ESP: 'spain', SWE: 'sweden',
  ISL: 'iceland', LIE: 'liechtenstein', NOR: 'norway', CHE: 'switzerland',
  GBR: 'united-kingdom', ALB: 'albania', MNE: 'montenegro', MKD: 'north-macedonia',
  SRB: 'serbia', TUR: 'turkey', BIH: 'bosnia-and-herzegovina', UKR: 'ukraine',
  MDA: 'moldova', GEO: 'georgia',
};

// TED notice-type codes → the canonical vocabulary. Only codes actually
// observed or documented are mapped; anything else becomes OTHER rather than
// being forced into a neighbouring bucket.
const NOTICE_TYPE = {
  'cn-standard': 'CONTRACT_NOTICE',
  'cn-social': 'CONTRACT_NOTICE',
  'cn-desg': 'CONTRACT_NOTICE',
  'subco': 'CONTRACT_NOTICE',
  'pin-only': 'PRIOR_INFORMATION',
  'pin-buyer': 'PRIOR_INFORMATION',
  'pin-rtl': 'PRIOR_INFORMATION',
  'pin-tran': 'PRIOR_INFORMATION',
  'can-standard': 'CONTRACT_AWARD',
  'can-social': 'CONTRACT_AWARD',
  'can-desg': 'CONTRACT_AWARD',
  'can-tran': 'CONTRACT_AWARD',
};

// Our four locales → TED's ISO 639-2/B language keys.
const LOCALE_TO_TED = { en: 'eng', de: 'deu', es: 'spa', fr: 'fra' };

const firstString = (v) => {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.length ? firstString(v[0]) : null;
  return null;
};

// TED multilingual objects are {langKey: string | [string]}.
function pickLang(obj, langKey) {
  if (!obj || typeof obj !== 'object') return null;
  return firstString(obj[langKey]);
}

async function fetchAll({ source, log }) {
  const raw = [];
  let population = null;
  let pages = 0;

  for (let page = 1; page <= source.maxPages; page += 1) {
    const body = {
      // The bounded window, stated in the source's own query language so the
      // server does the filtering and we do not download a year to keep a day.
      //
      // The notice-type restriction is not a size trick. TED's daily output is
      // half CONTRACT AWARD notices and prior-information notices — records of
      // procurement that has already been decided, or that has not started.
      // Neither is an opportunity a supplier can bid on, and carrying them
      // would make the corpus twice as large and half as true to its own name.
      query: `publication-date>=today(-${source.window.days}) AND notice-type IN (${BIDDABLE_NOTICE_TYPES.join(' ')})`,
      fields: FIELDS,
      limit: source.pageSize,
      page,
      scope: 'ACTIVE',
    };
    // eslint-disable-next-line no-await-in-loop
    const res = await http.postJson(source.endpoint, body);
    if (population === null) population = Number(res.totalNoticeCount) || 0;
    const notices = Array.isArray(res.notices) ? res.notices : [];
    pages += 1;
    if (!notices.length) break;
    raw.push(...notices);
    if (raw.length >= population) break;
    if (notices.length < source.pageSize) break;
  }

  const complete = population !== null && raw.length >= population;
  if (!complete) {
    log(`ted: ingested ${raw.length} of ${population} in the ${source.window.days}-day window `
      + `(page cap ${source.maxPages} × ${source.pageSize}). Coverage is PARTIAL and recorded as such.`);
  }
  return { raw, pages, population, complete, endpoint: source.endpoint };
}

function normalize(r, { source, nowIso }) {
  const noticeId = firstString(r['publication-number']);
  if (!noticeId) return null;

  const titles = {};
  for (const [locale, key] of Object.entries(LOCALE_TO_TED)) {
    const v = pickLang(r['notice-title'], key);
    if (v) titles[locale] = v;
  }
  const title = titles.en || firstString(Object.values(r['notice-title'] || {})[0]);
  if (!title) return null;

  // buyer-name is keyed by the buyer's own language; there is one buyer, so
  // the single value is taken whatever key it sits under. A buyer's legal name
  // is a fact and is never translated.
  const buyerName = firstString(Object.values(r['buyer-name'] || {})[0]);

  const alpha3 = firstString(r['buyer-country']);
  const country = alpha3 ? (COUNTRY_BY_ALPHA3[alpha3.toUpperCase()] || null) : null;

  const cpv = Array.isArray(r['classification-cpv']) ? r['classification-cpv'] : [];
  const classifications = CLASS.normalizeCodes(cpv.map((c) => ['CPV', c]));

  // One deadline entry per lot. The EARLIEST governs whether the notice is
  // still open — a supplier bidding one lot cannot rely on another lot's later
  // date — and the array length is the lot count, which is a fact the source
  // published rather than something we counted from prose.
  const lotDeadlines = (Array.isArray(r['deadline-receipt-tender-date-lot'])
    ? r['deadline-receipt-tender-date-lot'] : []).map(TIME.normalizeTimestamp)
    .filter((t) => t.precision !== 'NONE');
  const decidable = lotDeadlines.filter(TIME.isDecidable).sort((a, b) => (a.iso < b.iso ? -1 : 1));
  const deadline = decidable[0] || lotDeadlines[0] || TIME.EMPTY;
  const lotCount = Array.isArray(r['deadline-receipt-tender-date-lot'])
    ? r['deadline-receipt-tender-date-lot'].length : null;

  // Values are published per lot. Summing them would be arithmetic the buyer
  // did not do, so a single lot yields an amount and several yield the real
  // published range.
  let value = null;
  const currency = firstString(r['estimated-value-cur-lot']);
  const amounts = (Array.isArray(r['estimated-value-lot']) ? r['estimated-value-lot'] : [])
    .map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
  if (currency && /^[A-Z]{3}$/.test(currency) && amounts.length) {
    const min = Math.min(...amounts);
    const max = Math.max(...amounts);
    value = min === max
      ? { amount: min, currency, basis: 'ESTIMATED', scope: 'NOTICE' }
      : { amountMin: min, amountMax: max, currency, basis: 'ESTIMATED', scope: 'LOTS' };
  }

  // TED publishes no per-notice status string. scope=ACTIVE is a guarantee
  // from the query, so the basis is SOURCE_SCOPE — weaker than a buyer saying
  // "this is open", stronger than us reading a calendar, and labelled as
  // neither.
  const passed = TIME.hasPassed(deadline, nowIso);
  const status = passed === true ? 'CLOSED' : 'OPEN';
  const statusBasis = passed === true ? 'DERIVED_FROM_DEADLINE' : 'SOURCE_SCOPE';

  const links = r.links || {};
  const sourceUrl = (links.html && (links.html.ENG || Object.values(links.html)[0]))
    || `https://ted.europa.eu/en/notice/-/detail/${noticeId}`;

  return {
    id: SCHEMA.opportunityId(source.id, noticeId),
    sourceId: source.id,
    sourcePlatformId: source.platformId,
    sourceNoticeId: noticeId,
    sourceUrl,
    title,
    titles,
    descriptionSummary: pickLang(r['description-lot'], LOCALE_TO_TED.en)
      || firstString(Object.values(r['description-lot'] || {})[0]) || null,
    buyerName: buyerName || null,
    country,
    subnationalJurisdiction: null,
    projectCountry: null,
    coverage: 'supranational',
    classifications,
    publicationDate: TIME.normalizeTimestamp(r['publication-date']),
    deadline,
    sourceModifiedDate: null,
    status,
    statusBasis,
    noticeType: NOTICE_TYPE[firstString(r['notice-type'])] || 'OTHER',
    procedureType: firstString(r['procedure-type']) || null,
    value,
    language: firstString(r['official-language']) || null,
    lotCount,
    // TED states when a notice modifies an earlier one. That is the amendment
    // signal Part 40 asks for, published rather than inferred.
    amendsNoticeId: firstString(r['modification-previous-notice-identifier']) || null,
    officialReference: firstString(r['notice-identifier']) || null,
  };
}

module.exports = { id: 'ted', FIELDS, BIDDABLE_NOTICE_TYPES, COUNTRY_BY_ALPHA3, NOTICE_TYPE, LOCALE_TO_TED, fetchAll, normalize };
