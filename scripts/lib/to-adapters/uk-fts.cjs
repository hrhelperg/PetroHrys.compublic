'use strict';

// Find a Tender Service — UK above-threshold procurement, published as OCDS.
//
// The richest payload in the pilot and the only one that answers questions at
// NOTICE level that every other source answers only at platform level:
//
//   tender.submissionTerms.electronicSubmissionPolicy  → e-submission, per procedure
//   tender.submissionMethodDetails                     → the actual bid route
//   tender.techniques.hasFrameworkAgreement            → framework, per procedure
//   tender.lots[]                                      → real lot structure
//
// That is why the field audit in to-schema.cjs carries those three as
// nullable canonical fields instead of dropping them: one source publishes
// them, four do not, and "null" says exactly that.
//
// Two traps in this payload, both handled below:
//
//   value.amountGross is 0 on notices that publish no value. Zero is not a
//   contract worth nothing; it is the absence of a figure wearing a number's
//   clothes. Stored as null.
//
//   parties[].contactPoint.email carries a named officer's address on most
//   records. The recursive strip in to-sources.cjs removes it before this
//   adapter ever sees it.
//
// Access: GET /api/1.0/ocdsReleasePackages, keyless. Paging is a CURSOR in
// links.next, not a page number — which is why the loop below follows the
// link rather than incrementing anything.

const http = require('../to-http.cjs');
const TIME = require('../to-time.cjs');
const CLASS = require('../to-classification.cjs');
const SCHEMA = require('../to-schema.cjs');

// OCDS tender.status → canonical. OCDS's vocabulary is small and documented,
// so this map is complete rather than best-effort.
const STATUS = {
  active: 'OPEN',
  planned: 'UPCOMING',
  cancelled: 'CANCELLED',
  unsuccessful: 'CLOSED',
  complete: 'AWARDED',
  withdrawn: 'CANCELLED',
};

// OCDS has no notice-type enum; the UK expresses intent through tag[] on the
// release. Only tags with unambiguous meaning are mapped.
const TAG_TYPE = {
  tender: 'CONTRACT_NOTICE',
  tenderAmendment: 'CONTRACT_NOTICE',
  planning: 'PRIOR_INFORMATION',
  award: 'CONTRACT_AWARD',
  contract: 'CONTRACT_AWARD',
};

function isoDateOnly(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

async function fetchAll({ source, nowIso, log }) {
  const from = new Date(Date.parse(nowIso) - source.window.days * 86400000);
  let url = `${source.endpoint}?updatedFrom=${isoDateOnly(from)}T00:00:00&limit=${source.pageSize}`;
  const raw = [];
  const seenCursors = new Set();
  let pages = 0;
  let complete = false;

  for (let page = 1; page <= source.maxPages; page += 1) {
    // A cursor that repeats means the server is looping us. Detected rather
    // than trusted: an unbounded follow-the-link loop is how a polite client
    // becomes a denial of service against a public API.
    if (seenCursors.has(url)) {
      log('uk-fts: pagination cursor repeated; stopping to avoid a loop.');
      break;
    }
    seenCursors.add(url);
    // eslint-disable-next-line no-await-in-loop
    const res = await http.getJson(url);
    pages += 1;
    const releases = Array.isArray(res.releases) ? res.releases : [];
    raw.push(...releases);
    const next = res.links && res.links.next;
    // The API returns a `next` link even on the final page; an empty or short
    // page is the real terminator.
    if (!next || releases.length === 0 || releases.length < source.pageSize) { complete = true; break; }
    url = next;
  }

  if (!complete) {
    log(`uk-fts: stopped at the ${source.maxPages}-page cap with ${raw.length} releases. `
      + 'Coverage is PARTIAL and recorded as such.');
  }
  // The API publishes no total, so population is genuinely unknown rather
  // than zero. Recording 0 here would make a complete ingest look empty.
  return { raw, pages, population: null, complete, endpoint: source.endpoint };
}

function normalize(r, { source, nowIso }) {
  const tender = r.tender || {};
  const noticeId = r.ocid || r.id;
  if (!noticeId) return null;
  const title = tender.title || null;
  if (!title) return null;

  const buyer = r.buyer || {};
  const party = (Array.isArray(r.parties) ? r.parties : [])
    .find((p) => p.id && buyer.id && p.id === buyer.id) || {};
  const address = party.address || {};

  // CPV appears both as tender.classification and per item. Every one is
  // collected; normalizeCodes deduplicates.
  const codes = [];
  if (tender.classification && tender.classification.scheme === 'CPV') codes.push(['CPV', tender.classification.id]);
  for (const item of tender.items || []) {
    if (item.classification && item.classification.scheme === 'CPV') codes.push(['CPV', item.classification.id]);
    for (const c of item.additionalClassifications || []) {
      if (c.scheme === 'CPV') codes.push(['CPV', c.id]);
    }
  }

  const deadline = TIME.normalizeTimestamp(
    (tender.tenderPeriod && tender.tenderPeriod.endDate) || null,
  );
  const published = TIME.normalizeTimestamp(r.date || null);

  const tags = Array.isArray(r.tag) ? r.tag : [];
  const noticeType = tags.map((t) => TAG_TYPE[t]).find(Boolean) || 'CONTRACT_NOTICE';

  const reported = STATUS[tender.status] || null;
  const { status, statusBasis } = SCHEMA.resolveStatus({ reportedStatus: reported, deadline, nowIso, noticeType });

  // A published zero is not a value.
  let value = null;
  const v = tender.value || {};
  const amount = [v.amount, v.amountGross].map(Number).find((n) => Number.isFinite(n) && n > 0);
  if (amount && v.currency && /^[A-Z]{3}$/.test(v.currency)) {
    value = { amount, currency: v.currency, basis: 'ESTIMATED', scope: 'NOTICE' };
  }

  // The only notice-level e-submission statement in the pilot.
  const policy = tender.submissionTerms && tender.submissionTerms.electronicSubmissionPolicy;
  let electronicSubmission = null;
  let electronicSubmissionBasis = null;
  if (policy === 'allowed' || policy === 'required') {
    electronicSubmission = 'yes';
    electronicSubmissionBasis = 'SOURCE_REPORTED';
  } else if (policy === 'notAllowed') {
    electronicSubmission = 'no';
    electronicSubmissionBasis = 'SOURCE_REPORTED';
  }

  // submissionMethodDetails is a FREE-TEXT field that often begins with a URL
  // and then keeps going. One notice in the pilot held a portal link, a
  // newline, and the council's enquiries mailbox — and storing the field whole
  // published that address. Only the first whitespace-delimited token is taken,
  // and only if the whole token is a URL.
  const rawSubmission = typeof tender.submissionMethodDetails === 'string'
    ? tender.submissionMethodDetails.trim().split(/\s+/)[0] : '';
  const submissionUrl = /^https?:\/\/[^\s]+$/.test(rawSubmission)
    && !/@/.test(rawSubmission) ? rawSubmission : null;

  const languages = (tender.submissionTerms && tender.submissionTerms.languages) || [];

  return {
    id: SCHEMA.opportunityId(source.id, noticeId),
    sourceId: source.id,
    sourcePlatformId: source.platformId,
    sourceNoticeId: noticeId,
    sourceUrl: `https://www.find-tender.service.gov.uk/Notice/${encodeURIComponent(r.id || noticeId)}`,
    title,
    titles: { en: title },
    descriptionSummary: typeof tender.description === 'string' ? tender.description : null,
    buyerName: buyer.name || party.name || null,
    country: 'united-kingdom',
    // NUTS/ITL region as published — declared as NUTS, not quietly filed as
    // an ISO subdivision it is not.
    subnationalJurisdiction: address.region ? { scheme: 'NUTS', code: address.region } : null,
    projectCountry: null,
    coverage: 'national',
    classifications: CLASS.normalizeCodes(codes),
    publicationDate: published,
    deadline,
    sourceModifiedDate: published,
    status,
    statusBasis,
    noticeType,
    procedureType: tender.procurementMethod || null,
    value,
    language: r.language || languages[0] || null,
    lotCount: Array.isArray(tender.lots) ? tender.lots.length : null,
    amendsNoticeId: null,
    officialReference: tender.id || r.id || null,
    electronicSubmission,
    electronicSubmissionBasis,
    submissionUrl,
    frameworkAgreement: tender.techniques && typeof tender.techniques.hasFrameworkAgreement === 'boolean'
      ? tender.techniques.hasFrameworkAgreement : null,
  };
}

module.exports = { id: 'uk-fts', STATUS, TAG_TYPE, fetchAll, normalize };
