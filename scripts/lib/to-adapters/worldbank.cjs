'use strict';

// World Bank Group Procurement Notices — the multilateral member of the pilot.
//
// ── WHY THIS SOURCE IS HERE, AND WHY IT IS THE MOST RESTRICTED ──────────────
//
// Part 44 asks the pilot to prove that national and multilateral procurement
// can be normalized into one model. This source is what proves it, because it
// breaks the assumption every national source shares: that the buyer's country
// and the procurement's country are the same country.
//
// A World Bank notice is issued by a BORROWER — a Nigerian ministry, a
// Bangladeshi agency — under Bank financing, and published on a Bank system.
// The Bank is the financier, not the buyer, and the platforms collection
// already draws that line (int-world-bank-group-procurement is the
// project-financed surface; WBGeProcure RFx Now is the Bank's own corporate
// buying). So `country` here is the PROJECT country and the record is not
// filed under a fictional World Bank nation.
//
// ── THE STORAGE RESTRICTION ─────────────────────────────────────────────────
//
// The Bank's Data Catalog says CC BY 4.0. The Bank's general Terms &
// Conditions say commercial use and API-facilitated commercial applications
// need prior written consent. Both are published by the same institution and
// they point opposite ways.
//
// Unresolved terms tighten storage rather than resolving in our favour. This
// adapter therefore keeps identity, buyer organisation, country, dates,
// procurement method and the link — and does NOT keep bid_description or
// notice_text. notice_text is a complete HTML solicitation document, several
// kilobytes of it, and mirroring it is exactly what Part 32 rules out.
//
// The consequence is visible and intended: World Bank rows on the published
// page carry no summary and say why.
//
// Every record also ships contact_name, contact_email and contact_phone_no for
// a named officer. Those are stripped by to-sources.stripPersonalFields before
// this adapter runs.

const http = require('../to-http.cjs');
const TIME = require('../to-time.cjs');
const SCHEMA = require('../to-schema.cjs');

const STATUS = {
  published: 'OPEN',
  cancelled: 'CANCELLED',
  canceled: 'CANCELLED',
  draft: 'UPCOMING',
  expired: 'CLOSED',
  closed: 'CLOSED',
};

const NOTICE_TYPE = {
  'request for expression of interest': 'EXPRESSION_OF_INTEREST',
  'request for expressions of interest': 'EXPRESSION_OF_INTEREST',
  'general procurement notice': 'PRIOR_INFORMATION',
  'specific procurement notice': 'CONTRACT_NOTICE',
  'invitation for bids': 'INVITATION_FOR_BIDS',
  'request for bids': 'INVITATION_FOR_BIDS',
  'request for proposals': 'REQUEST_FOR_PROPOSAL',
  'request for quotations': 'REQUEST_FOR_QUOTATION',
  'contract award': 'CONTRACT_AWARD',
  'contract award notice': 'CONTRACT_AWARD',
};

async function fetchAll({ source, log }) {
  const raw = [];
  let population = null;
  let pages = 0;

  for (let page = 0; page < source.maxPages; page += 1) {
    const url = `${source.endpoint}?format=json&rows=${source.pageSize}`
      + `&os=${page * source.pageSize}&srt=noticedate&order=desc`;
    // eslint-disable-next-line no-await-in-loop
    const res = await http.getJson(url);
    if (population === null) population = Number(res.total) || 0;
    const notices = Array.isArray(res.procnotices) ? res.procnotices : [];
    pages += 1;
    if (!notices.length) break;
    raw.push(...notices);
    if (notices.length < source.pageSize) break;
  }

  // 414,749 notices exist; this pilot deliberately takes the most recent
  // slice. Coverage is PARTIAL by design, not by accident, and saying so is
  // the difference between a bounded window and a silent cap.
  log(`worldbank: ingested the ${raw.length} most recent of ${population} notices `
    + '(deliberate bounded window; coverage is PARTIAL by design).');
  return { raw, pages, population, complete: false, endpoint: source.endpoint };
}

const trim = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

// Project country names as the Bank prints them → the project's country slugs.
// Only names actually observed in the feed are mapped; an unmapped country
// leaves `country` null and keeps `projectCountryName` as the source string,
// which is honest and still renders.
const slugify = (name) => String(name).toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function normalize(r, { source, nowIso, knownCountrySlugs }) {
  const noticeId = trim(r.id);
  if (!noticeId) return null;
  const title = trim(r.bid_description) || trim(r.project_name);
  if (!title) return null;

  const deadline = TIME.combineDateAndTime(r.submission_deadline_date, r.submission_deadline_time);
  const published = TIME.normalizeTimestamp(r.noticedate);

  const reported = STATUS[(trim(r.notice_status) || '').toLowerCase()] || null;
  const noticeType = NOTICE_TYPE[(trim(r.notice_type) || '').toLowerCase()] || 'OTHER';
  const { status, statusBasis } = SCHEMA.resolveStatus({ reportedStatus: reported, deadline, nowIso, noticeType });

  const projectCountryName = trim(r.project_ctry_name);
  const slug = projectCountryName ? slugify(projectCountryName) : null;
  const country = slug && knownCountrySlugs instanceof Set && knownCountrySlugs.has(slug) ? slug : null;

  return {
    id: SCHEMA.opportunityId(source.id, noticeId),
    sourceId: source.id,
    sourcePlatformId: source.platformId,
    sourceNoticeId: noticeId,
    sourceUrl: `https://projects.worldbank.org/en/projects-operations/procurement-detail/${encodeURIComponent(noticeId)}`,
    title,
    titles: { en: title },
    // Deliberately null. See the storage note at the top of this file.
    descriptionSummary: null,
    buyerName: trim(r.contact_organization) || trim(r.project_name),
    // The project country, not the Bank's. A multilateral notice has a
    // financier and a place, and they are different facts.
    country,
    subnationalJurisdiction: null,
    projectCountry: projectCountryName,
    coverage: 'supranational',
    classifications: [], // no subject-code scheme is published
    publicationDate: published,
    deadline,
    sourceModifiedDate: null,
    status,
    statusBasis,
    noticeType,
    procedureType: trim(r.procurement_method_name),
    value: null, // no value published in this feed
    language: trim(r.notice_lang_name),
    lotCount: null,
    amendsNoticeId: null,
    officialReference: trim(r.bid_reference_no),
    projectId: trim(r.project_id),
  };
}

module.exports = { id: 'worldbank', STATUS, NOTICE_TYPE, slugify, fetchAll, normalize };
