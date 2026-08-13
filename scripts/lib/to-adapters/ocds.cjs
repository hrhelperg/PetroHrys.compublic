'use strict';

// A REUSABLE OCDS ADAPTER.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// v1 wrote one bespoke adapter per source, which was right for five sources
// that spoke five different languages. It is wrong for the road to twenty-five,
// because a large share of the remaining candidates publish the SAME format:
// the Open Contracting Data Standard. South Africa, Moldova, Paraguay, Uganda,
// Kenya, Georgia and the UK all emit OCDS releases with the same field names.
//
// Writing a seventh bespoke adapter for a seventh OCDS publisher would be
// copying 150 lines to change a URL. So OCDS becomes a FACTORY: a publisher
// supplies its endpoint, its paging dialect and its country, and gets an
// adapter. The next OCDS publisher is roughly a dozen lines of configuration
// in to-sources.cjs, not a new file.
//
// ── WHAT IS NOT SHARED ──────────────────────────────────────────────────────
//
// Paging is NOT standardised by OCDS and every publisher differs — South
// Africa uses PageNumber/PageSize with a date range, the UK uses an opaque
// cursor in links.next. So the factory takes a `pager` describing the dialect,
// and the shared part is everything below it: the release → canonical
// opportunity mapping, which OCDS genuinely does standardise.
//
// The UK adapter is deliberately NOT migrated onto this factory. It reads
// several fields this generic mapping does not — the electronic-submission
// policy, the framework technique, the submission route — and rewriting a
// working adapter that is already under test to prove a point about reuse is
// how a refactor becomes an outage. It stays bespoke, and this comment is the
// note explaining why the duplication is deliberate.

const http = require('../to-http.cjs');
const TIME = require('../to-time.cjs');
const CLASS = require('../to-classification.cjs');
const SCHEMA = require('../to-schema.cjs');

// OCDS tender.status is a closed codelist. This mapping is therefore complete
// rather than best-effort, and an unlisted value stays UNKNOWN instead of
// being rounded to the nearest familiar word.
const STATUS = {
  planning: 'UPCOMING',
  planned: 'UPCOMING',
  active: 'OPEN',
  cancelled: 'CANCELLED',
  withdrawn: 'CANCELLED',
  unsuccessful: 'CLOSED',
  complete: 'AWARDED',
};

// OCDS release tags, also a closed codelist.
const TAG_TYPE = {
  planning: 'PRIOR_INFORMATION',
  tender: 'CONTRACT_NOTICE',
  tenderAmendment: 'CONTRACT_NOTICE',
  tenderUpdate: 'CONTRACT_NOTICE',
  award: 'CONTRACT_AWARD',
  awardUpdate: 'CONTRACT_AWARD',
  contract: 'CONTRACT_AWARD',
  implementation: 'CONTRACT_AWARD',
};

function isoDateOnly(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// ── PAGING DIALECTS ─────────────────────────────────────────────────────────
//
// Each returns a URL for page n (0-based) and reads the release array out of
// whatever envelope the publisher used.
const PAGERS = {
  // ?PageNumber=1&PageSize=50&dateFrom=…&dateTo=…  (South Africa)
  pageNumberDateRange: {
    url({ source, page, nowIso }) {
      const from = new Date(Date.parse(nowIso) - source.window.days * 86400000);
      return `${source.endpoint}?PageNumber=${page + 1}&PageSize=${source.pageSize}`
        + `&dateFrom=${isoDateOnly(from)}&dateTo=${isoDateOnly(new Date(Date.parse(nowIso)))}`;
    },
  },
  // ?page=1&size=50  (several OCDS publishers)
  pageSize: {
    url({ source, page }) {
      return `${source.endpoint}?page=${page + 1}&size=${source.pageSize}`;
    },
  },
};

const releasesOf = (res) => {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.releases)) return res.releases;
  // A record package rather than a release package: each record carries a
  // compiled release, which is the current state of the contracting process.
  if (Array.isArray(res.records)) {
    return res.records.map((r) => r.compiledRelease || (r.releases || [])[0]).filter(Boolean);
  }
  return [];
};

function makeOcdsAdapter({ id, pager = 'pageNumberDateRange', country, coverage = 'national' }) {
  const dialect = PAGERS[pager];
  if (!dialect) throw new Error(`Unknown OCDS paging dialect "${pager}"`);

  async function fetchAll({ source, nowIso, log }) {
    const raw = [];
    const seen = new Set();
    let pages = 0;
    let complete = false;

    for (let page = 0; page < source.maxPages; page += 1) {
      const url = dialect.url({ source, page, nowIso });
      if (seen.has(url)) { log(`${id}: paging repeated a URL; stopping to avoid a loop.`); break; }
      seen.add(url);
      // eslint-disable-next-line no-await-in-loop
      const res = await http.getJson(url);
      pages += 1;
      const releases = releasesOf(res);
      if (!releases.length) { complete = true; break; }
      raw.push(...releases);
      if (releases.length < source.pageSize) { complete = true; break; }
    }

    if (!complete) {
      log(`${id}: stopped at the ${source.maxPages}-page cap with ${raw.length} releases. `
        + 'Coverage is PARTIAL and recorded as such.');
    }
    // OCDS packages publish no total, so population is genuinely unknown.
    // Reporting 0 would make a complete ingest look like an outage.
    return { raw, pages, population: null, complete, endpoint: source.endpoint };
  }

  function normalize(r, { source, nowIso }) {
    const tender = r.tender || {};
    const noticeId = r.ocid || r.id;
    if (!noticeId) return null;
    // Some publishers put a bare reference in `title` and the real subject in
    // `description`. Both are kept; the title is whatever the publisher called
    // a title, because renaming a buyer's field is not our decision.
    const title = tender.title || tender.description || null;
    if (!title) return null;

    const codes = [];
    const pushCode = (c) => {
      if (!c || !c.scheme || !c.id) return;
      const scheme = String(c.scheme).toUpperCase();
      if (CLASS.SCHEMES.includes(scheme)) codes.push([scheme, c.id]);
    };
    pushCode(tender.classification);
    for (const item of tender.items || []) {
      pushCode(item.classification);
      for (const c of item.additionalClassifications || []) pushCode(c);
    }

    const period = tender.tenderPeriod || {};
    const deadline = TIME.normalizeTimestamp(period.endDate || null);
    const published = TIME.normalizeTimestamp(r.date || null);

    const tags = Array.isArray(r.tag) ? r.tag : [];
    const noticeType = tags.map((t) => TAG_TYPE[t]).find(Boolean) || 'CONTRACT_NOTICE';

    const reported = STATUS[tender.status] || null;
    const { status, statusBasis } = SCHEMA.resolveStatus({
      reportedStatus: reported, deadline, nowIso, noticeType,
    });

    // A published zero is the absence of a figure, not a contract worth
    // nothing. Same trap as UK FTS; same treatment.
    let value = null;
    const v = tender.value || {};
    const amount = [v.amount, v.amountGross].map(Number).find((n) => Number.isFinite(n) && n > 0);
    if (amount && v.currency && /^[A-Z]{3}$/.test(v.currency)) {
      value = { amount, currency: v.currency, basis: 'ESTIMATED', scope: 'NOTICE' };
    }

    const buyer = r.buyer || tender.procuringEntity || {};
    const party = (Array.isArray(r.parties) ? r.parties : [])
      .find((p) => p.id && buyer.id && p.id === buyer.id) || {};

    return {
      id: SCHEMA.opportunityId(source.id, noticeId),
      sourceId: source.id,
      sourcePlatformId: source.platformId,
      sourceNoticeId: noticeId,
      sourceUrl: source.noticeUrl ? source.noticeUrl(r) : source.endpoint,
      title,
      titles: {},
      descriptionSummary: typeof tender.description === 'string' ? tender.description : null,
      buyerName: buyer.name || party.name || null,
      country,
      // Province/region strings are published by some OCDS producers, but as
      // free text rather than as a coded subdivision. A name is not a code, and
      // this project does not invent codes, so it is not stored as one.
      subnationalJurisdiction: null,
      projectCountry: null,
      coverage,
      classifications: CLASS.normalizeCodes(codes),
      publicationDate: published,
      deadline,
      sourceModifiedDate: published,
      status,
      statusBasis,
      noticeType,
      procedureType: tender.procurementMethod || tender.procurementMethodDetails || null,
      value,
      language: r.language || null,
      lotCount: Array.isArray(tender.lots) ? tender.lots.length : null,
      officialReference: tender.id || null,
    };
  }

  return { id, fetchAll, normalize, STATUS, TAG_TYPE };
}

module.exports = { makeOcdsAdapter, PAGERS, STATUS, TAG_TYPE, releasesOf };
