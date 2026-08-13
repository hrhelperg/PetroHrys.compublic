'use strict';

// Tender Opportunity Expansion v2 — Phase A coverage analysis.
//
// ── THIS IS ANALYSIS, NOT A CANONICAL FACT ──────────────────────────────────
//
// Nothing here is ever written back to a TenderOpportunity. A procurement does
// not have an "industry": it has classification codes its buyer assigned, and
// a sector cohort is our reading of those codes for the purpose of finding
// gaps. Adding `industry` to the canonical model would turn an analytical
// convenience into a fabricated source fact, which is the failure this whole
// stack is built to avoid.
//
// ── HOW A COHORT IS DECIDED ─────────────────────────────────────────────────
//
// Evidence order, strongest first:
//
//   1. CPV division    (the first two digits of a CPV code)
//   2. UNSPSC segment  (the first two digits of a UNSPSC code)
//   3. UNCLASSIFIED    — no code, so no claim
//
// CPV and UNSPSC are mapped INDEPENDENTLY onto the cohort vocabulary. This is
// not a CPV↔UNSPSC crosswalk and must never become one: no CPV code is ever
// translated into a UNSPSC code or vice versa. Two separate taxonomies happen
// to be readable against one analytical question.
//
// A record with no classification is UNCLASSIFIED, never guessed from its
// title. Keyword classification was considered and rejected: the Discovery
// relevance audit showed that matching "construction" against text pulls in
// Defence Construction Canada's name and a lift-servicing contract filed under
// a construction division label. Codes are what the buyer actually asserted.

const SECTORS = [
  'construction', 'manufacturing', 'energy', 'it-software', 'telecom',
  'logistics', 'healthcare', 'agriculture-food', 'facilities',
  'professional-services', 'office-supplies', 'environment', 'education',
  'automotive', 'security-defence', 'hospitality', 'textiles-ppe',
  'chemicals-materials', 'electronics-electrical',
];

// CPV divisions → analytical cohort. Division labels are the Publications
// Office's own; the cohort is ours.
const CPV_DIVISION = {
  '03': 'agriculture-food',        // agricultural, farming, fishing, forestry
  '09': 'energy',                  // petroleum, fuel, electricity
  14: 'chemicals-materials',       // mining, basic metals
  15: 'agriculture-food',          // food, beverages, tobacco
  16: 'agriculture-food',          // agricultural machinery
  18: 'textiles-ppe',              // clothing, footwear, luggage
  19: 'chemicals-materials',       // leather, textile, plastic, rubber
  22: 'office-supplies',           // printed matter
  24: 'chemicals-materials',       // chemical products
  30: 'office-supplies',           // office and computing machinery
  31: 'electronics-electrical',    // electrical machinery
  32: 'telecom',                   // radio, TV, communication, telecom
  33: 'healthcare',                // medical equipment, pharmaceuticals
  34: 'automotive',                // transport equipment
  35: 'security-defence',          // security, fire-fighting, police, defence
  37: 'hospitality',               // musical instruments, sport goods
  38: 'electronics-electrical',    // laboratory, optical, precision equipment
  39: 'office-supplies',           // furniture, furnishings, appliances
  41: 'environment',               // collected and purified water
  42: 'manufacturing',             // industrial machinery
  43: 'manufacturing',             // mining/quarrying/construction machinery
  44: 'construction',              // construction structures and materials
  45: 'construction',              // construction work
  48: 'it-software',               // software packages and information systems
  50: 'facilities',                // repair and maintenance services
  51: 'facilities',                // installation services
  55: 'hospitality',               // hotel, restaurant, retail
  60: 'logistics',                 // transport services
  63: 'logistics',                 // supporting transport services
  64: 'telecom',                   // postal and telecommunications services
  65: 'energy',                    // public utilities
  66: 'professional-services',     // financial and insurance
  70: 'facilities',                // real estate services
  71: 'construction',              // architectural, engineering, inspection
  72: 'it-software',               // IT services
  73: 'education',                 // research and development
  75: 'professional-services',     // administration, defence, social security
  76: 'energy',                    // services related to oil and gas
  77: 'agriculture-food',          // agricultural, forestry, horticultural
  79: 'professional-services',     // business services
  80: 'education',                 // education and training
  85: 'healthcare',                // health and social work
  90: 'environment',               // sewage, refuse, cleaning, environmental
  92: 'hospitality',               // recreational, cultural, sporting
  98: 'professional-services',     // other community, social, personal
};

// UNSPSC segments → the same cohort vocabulary, decided independently.
const UNSPSC_SEGMENT = {
  10: 'agriculture-food',
  11: 'chemicals-materials',
  12: 'chemicals-materials',
  13: 'chemicals-materials',
  14: 'office-supplies',
  15: 'energy',
  20: 'manufacturing',
  21: 'agriculture-food',
  22: 'construction',
  23: 'manufacturing',
  24: 'logistics',
  25: 'automotive',
  26: 'energy',
  27: 'manufacturing',
  30: 'construction',
  31: 'manufacturing',
  32: 'electronics-electrical',
  39: 'electronics-electrical',
  40: 'manufacturing',
  41: 'education',
  42: 'healthcare',
  43: 'it-software',
  44: 'office-supplies',
  45: 'office-supplies',
  46: 'security-defence',
  47: 'facilities',
  48: 'hospitality',
  49: 'hospitality',
  50: 'agriculture-food',
  51: 'healthcare',
  52: 'office-supplies',
  53: 'textiles-ppe',
  55: 'office-supplies',
  56: 'office-supplies',
  60: 'education',
  70: 'agriculture-food',
  71: 'energy',
  72: 'construction',
  73: 'manufacturing',
  76: 'facilities',
  77: 'environment',
  78: 'logistics',
  80: 'professional-services',
  81: 'professional-services',
  82: 'professional-services',
  83: 'energy',
  84: 'professional-services',
  85: 'healthcare',
  86: 'education',
  90: 'hospitality',
  91: 'facilities',
  92: 'security-defence',
  93: 'professional-services',
  94: 'professional-services',
  95: 'facilities',
};

// Two different states that Phase A wrongly counted as one.
//
// NO_CLASSIFICATION  — the source published no code at all.
// NOT_SECTOR_MAPPED  — the source published an official code in a vocabulary
//                      this analysis does not interpret into sectors (NAICS,
//                      PSC, GSIN). The record IS classified; we simply decline
//                      to guess which of the 19 cohorts it belongs to.
//
// Calling the second "unclassified" understates the corpus and would penalise
// a US or Canadian source for not being European. Preserving the taxonomy and
// admitting the analytical limit is the honest pair.
const UNCLASSIFIED = 'no-classification';
const NOT_SECTOR_MAPPED = 'not-sector-mapped';

// Vocabularies this analysis can read into sectors. NAICS, PSC and GSIN are
// preserved as canonical facts but deliberately NOT interpreted: a defensible
// NAICS-to-cohort reading would need the official hierarchy and its own
// documented methodology, and inventing one to raise a coverage percentage is
// exactly the failure this file exists to avoid.
const SECTOR_MAPPED_SCHEMES = ['CPV', 'UNSPSC'];

// The cohorts a single opportunity belongs to, with the evidence that put it
// there. A procurement with codes in two divisions genuinely spans two
// sectors — a hospital IT contract is both — so this returns a SET, and the
// matrices count an opportunity once per sector it evidences.
function sectorsOf(o) {
  const out = new Map();
  for (const c of o.classifications || []) {
    const code = String(c.code || '');
    if (c.scheme === 'CPV') {
      const div = code.slice(0, 2);
      const sector = CPV_DIVISION[div] || CPV_DIVISION[Number(div)];
      if (sector) out.set(sector, 'CPV_DIVISION');
    } else if (c.scheme === 'UNSPSC') {
      const seg = Number(code.slice(0, 2));
      const sector = UNSPSC_SEGMENT[seg];
      if (sector) out.set(sector, 'UNSPSC_SEGMENT');
    }
  }
  if (!out.size) {
    const hasNative = (o.classifications || []).length > 0;
    out.set(hasNative ? NOT_SECTOR_MAPPED : UNCLASSIFIED,
      hasNative ? 'CLASSIFIED_IN_UNMAPPED_SCHEME' : 'NO_CLASSIFICATION');
  }
  return out;
}

// ── COVERAGE STATUS ─────────────────────────────────────────────────────────
//
// Derived from breadth, not from volume alone. A sector with 2,000 records
// from one buyer in one country through one source is not well covered: it is
// one pipe. The thresholds are stated here rather than tuned per sector.
const STATUS_RULES = {
  STRONG: 'current >= 400 AND buyers >= 100 AND countries >= 8 AND sources >= 3',
  ADEQUATE: 'current >= 150 AND buyers >= 40 AND countries >= 4 AND sources >= 2',
  WEAK: 'current >= 30',
  VERY_WEAK: 'current > 0',
  UNMEASURED: 'current == 0',
};

function statusFor({ current, buyers, countries, sources }) {
  if (current === 0) return 'UNMEASURED';
  if (current >= 400 && buyers >= 100 && countries >= 8 && sources >= 3) return 'STRONG';
  if (current >= 150 && buyers >= 40 && countries >= 4 && sources >= 2) return 'ADEQUATE';
  if (current >= 30) return 'WEAK';
  return 'VERY_WEAK';
}

// Expansion priority. Explicit categories with stated rules — never an opaque
// 0-100 score, which cannot be argued with and drifts.
function priorityFor(row) {
  if (row.status === 'UNMEASURED' || row.status === 'VERY_WEAK') return 'PRIORITY_1';
  if (row.status === 'WEAK') return 'PRIORITY_2';
  // Adequate-looking sectors that rest on one pipe are still fragile.
  if (row.status === 'ADEQUATE' && (row.topSourceShare >= 0.75 || row.sources < 3)) return 'PRIORITY_3';
  return 'SUFFICIENT';
}

const share = (n, total) => (total ? n / total : 0);

function tally(list) {
  const m = new Map();
  for (const v of list) {
    if (v == null || v === '') continue;
    m.set(v, (m.get(v) || 0) + 1);
  }
  return m;
}

function topShare(m, total) {
  if (!m.size || !total) return 0;
  return Math.max(...m.values()) / total;
}

// ── THE MATRICES ────────────────────────────────────────────────────────────

function sectorMatrix(opportunities, { isCurrent }) {
  const rows = new Map();
  const ensure = (s) => {
    if (!rows.has(s)) {
      rows.set(s, {
        sector: s, canonical: 0, current: 0, open: 0, upcoming: 0,
        buyers: new Set(), countries: new Set(), sources: new Set(),
        cpv: new Set(), unspsc: new Set(), withValue: 0, esubStated: 0,
        _bySource: [], _byBuyer: [],
      });
    }
    return rows.get(s);
  };
  for (const s of [...SECTORS, UNCLASSIFIED, NOT_SECTOR_MAPPED]) ensure(s);

  for (const o of opportunities) {
    const cur = isCurrent(o);
    for (const sector of sectorsOf(o).keys()) {
      const r = ensure(sector);
      r.canonical += 1;
      if (!cur) continue;
      r.current += 1;
      if (o.status === 'OPEN') r.open += 1;
      if (o.status === 'UPCOMING') r.upcoming += 1;
      if (o.buyerName) { r.buyers.add(o.buyerName); r._byBuyer.push(o.buyerName); }
      const geo = o.projectCountry || o.country;
      if (geo) r.countries.add(geo);
      r.sources.add(o.sourceId);
      r._bySource.push(o.sourceId);
      for (const c of o.classifications || []) {
        if (c.scheme === 'CPV') r.cpv.add(c.code);
        else if (c.scheme === 'UNSPSC') r.unspsc.add(c.code);
      }
      if (o.value) r.withValue += 1;
      if (o.electronicSubmission) r.esubStated += 1;
    }
  }

  return [...rows.values()].map((r) => {
    const out = {
      sector: r.sector,
      canonical: r.canonical,
      current: r.current,
      open: r.open,
      upcoming: r.upcoming,
      buyers: r.buyers.size,
      countries: r.countries.size,
      sources: r.sources.size,
      cpvCodes: r.cpv.size,
      unspscCodes: r.unspsc.size,
      withValue: r.withValue,
      esubStated: r.esubStated,
      topSourceShare: topShare(tally(r._bySource), r.current),
      topBuyerShare: topShare(tally(r._byBuyer), r.current),
    };
    out.status = statusFor(out);
    out.priority = priorityFor(out);
    return out;
  }).sort((a, b) => b.current - a.current);
}

function geographyMatrix(opportunities, { isCurrent }) {
  const rows = new Map();
  for (const o of opportunities) {
    const geo = o.projectCountry || o.country;
    if (!geo) continue;
    if (!rows.has(geo)) {
      rows.set(geo, {
        country: geo, canonical: 0, current: 0, buyers: new Set(),
        sources: new Set(), sectors: new Set(), _bySource: [],
      });
    }
    const r = rows.get(geo);
    r.canonical += 1;
    if (!isCurrent(o)) continue;
    r.current += 1;
    if (o.buyerName) r.buyers.add(o.buyerName);
    r.sources.add(o.sourceId);
    r._bySource.push(o.sourceId);
    for (const s of sectorsOf(o).keys()) if (s !== UNCLASSIFIED && s !== NOT_SECTOR_MAPPED) r.sectors.add(s);
  }
  return [...rows.values()].map((r) => ({
    country: r.country,
    canonical: r.canonical,
    current: r.current,
    buyers: r.buyers.size,
    sources: r.sources.size,
    sectors: r.sectors.size,
    topSourceShare: topShare(tally(r._bySource), r.current),
  })).sort((a, b) => b.current - a.current);
}

// Unique CURRENT contribution — the metric that decides whether a source is
// worth having. A source whose records are all duplicates of TED's adds
// nothing however many rows it returns, and a source of 100,000 awards adds
// nothing to a product about tenders you can still bid on.
function sourceContribution(opportunities, { isCurrent }) {
  const rows = new Map();
  for (const o of opportunities) {
    const occurrenceSources = [...new Set((o.occurrences || []).map((x) => x.sourceId))];
    const contributors = occurrenceSources.length ? occurrenceSources : [o.sourceId];
    const unique = contributors.length === 1;
    for (const sid of contributors) {
      if (!rows.has(sid)) {
        rows.set(sid, {
          sourceId: sid, canonical: 0, current: 0, uniqueCurrent: 0, shared: 0,
          buyers: new Set(), countries: new Set(), sectors: new Set(),
          cpv: new Set(), unspsc: new Set(), historical: 0,
        });
      }
      const r = rows.get(sid);
      r.canonical += 1;
      if (!isCurrent(o)) { r.historical += 1; continue; }
      r.current += 1;
      if (unique) r.uniqueCurrent += 1; else r.shared += 1;
      if (o.buyerName) r.buyers.add(o.buyerName);
      const geo = o.projectCountry || o.country;
      if (geo) r.countries.add(geo);
      for (const s of sectorsOf(o).keys()) if (s !== UNCLASSIFIED && s !== NOT_SECTOR_MAPPED) r.sectors.add(s);
      for (const c of o.classifications || []) {
        if (c.scheme === 'CPV') r.cpv.add(c.code);
        else if (c.scheme === 'UNSPSC') r.unspsc.add(c.code);
      }
    }
  }
  return [...rows.values()].map((r) => ({
    sourceId: r.sourceId,
    canonical: r.canonical,
    current: r.current,
    historical: r.historical,
    uniqueCurrent: r.uniqueCurrent,
    sharedCurrent: r.shared,
    duplicateShare: share(r.shared, r.current),
    buyers: r.buyers.size,
    countries: r.countries.size,
    sectors: r.sectors.size,
    cpvCodes: r.cpv.size,
    unspscCodes: r.unspsc.size,
  })).sort((a, b) => b.uniqueCurrent - a.uniqueCurrent);
}

// Which sectors and countries rest on one pipe. High concentration is a
// coverage risk even where the record count looks healthy.
function dependencyRisk(matrix, key) {
  return matrix.filter((r) => r.current > 0 && r.topSourceShare >= 0.5)
    .map((r) => ({
      [key]: r[key], current: r.current, sources: r.sources,
      topSourceShare: Number(r.topSourceShare.toFixed(3)),
      band: r.topSourceShare >= 0.9 ? 'OVER_90' : r.topSourceShare >= 0.75 ? 'OVER_75' : 'OVER_50',
    }))
    .sort((a, b) => b.current - a.current);
}

// Classification coverage, per vocabulary. This replaces the binary
// "classified" figure, which silently meant "carries CPV or UNSPSC".
function classificationCoverage(opportunities) {
  const bySchemeRecords = {};
  const bySchemeCodes = {};
  let anyOfficial = 0;
  let none = 0;
  for (const o of opportunities) {
    const schemes = new Set();
    for (const c of o.classifications || []) {
      schemes.add(c.scheme);
      (bySchemeCodes[c.scheme] = bySchemeCodes[c.scheme] || new Set()).add(c.code);
    }
    if (schemes.size) anyOfficial += 1; else none += 1;
    for (const s of schemes) bySchemeRecords[s] = (bySchemeRecords[s] || 0) + 1;
  }
  const codes = {};
  for (const [k, v] of Object.entries(bySchemeCodes)) codes[k] = v.size;
  return {
    total: opportunities.length,
    anyOfficialClassification: anyOfficial,
    noClassification: none,
    recordsByScheme: bySchemeRecords,
    uniqueCodesByScheme: codes,
    sectorMappedSchemes: SECTOR_MAPPED_SCHEMES.slice(),
  };
}

function classificationBreadth(opportunities) {
  const cpv = { codes: new Set(), divisions: new Set(), coded: 0 };
  const unspsc = { codes: new Set(), segments: new Set(), coded: 0 };
  for (const o of opportunities) {
    let hasCpv = false;
    let hasUnspsc = false;
    for (const c of o.classifications || []) {
      const code = String(c.code || '');
      if (c.scheme === 'CPV') {
        hasCpv = true; cpv.codes.add(code); cpv.divisions.add(code.slice(0, 2));
      } else if (c.scheme === 'UNSPSC') {
        hasUnspsc = true; unspsc.codes.add(code); unspsc.segments.add(code.slice(0, 2));
      }
    }
    if (hasCpv) cpv.coded += 1;
    if (hasUnspsc) unspsc.coded += 1;
  }
  return {
    cpv: { coded: cpv.coded, uniqueCodes: cpv.codes.size, divisions: cpv.divisions.size },
    unspsc: { coded: unspsc.coded, uniqueCodes: unspsc.codes.size, segments: unspsc.segments.size },
  };
}

module.exports = {
  SECTORS, UNCLASSIFIED, NOT_SECTOR_MAPPED, SECTOR_MAPPED_SCHEMES,
  CPV_DIVISION, UNSPSC_SEGMENT, STATUS_RULES, classificationCoverage,
  sectorsOf, statusFor, priorityFor, sectorMatrix, geographyMatrix,
  sourceContribution, dependencyRisk, classificationBreadth,
};
