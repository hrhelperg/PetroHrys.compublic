'use strict';

// Tender & Procurement Platforms — a SEPARATE dataset (Wave T1, Europe).
//
// This is deliberately not part of the business-directory, marketplace or media
// registries, for the same reason those three are separate from each other: the
// assertions that protect one dataset are false about the others.
//
// A business directory answers "where can a company publish a PROFILE?".
// A marketplace answers  "where can a company publish a LISTING?".
// A media platform answers "where can a company place a STORY?".
// This dataset answers  "where can a company WIN A CONTRACT?" — and that
// question has a shape none of the others has: discovery, supplier
// registration, document access and electronic submission are four distinct
// systems that a single procurement ecosystem routinely splits across several
// official domains.
//
// ── WHAT THIS DATASET REFUSES TO DO ─────────────────────────────────────────
//
// 1. It does not mirror tender notices. We catalogue PLATFORMS. Republishing
//    the notices themselves would copy someone else's database, which
//    DATA-RIGHTS.md §6 is explicit about not doing.
//
// 2. It does not confuse grants with procurement. The European Commission
//    publishes a "national single portals" list covering 27 countries; every
//    entry on it is an EU funding/cohesion portal, NOT a procurement system.
//    Publishing those as tender platforms would have fabricated 27 records on
//    day one. `grant-only` is a rejection class, not a platform type.
//
// 3. It does not confuse an AUTHORITY with a PLATFORM. A procurement regulator,
//    an advisory unit and a central purchasing body all have websites; none of
//    them is necessarily a place a supplier can search for or bid on work.
//    PIANOo (NL) is an expertise centre. Hankinnat (FI) is an advisory unit.
//    Both are real and neither is a tender portal.
//
// 4. It does not read a metric it did not measure. No score, no traffic, no
//    Domain Rating, no contract values, no bidder counts, no win rates.
//
// ── WHY UNKNOWN IS A FIRST-CLASS VALUE ──────────────────────────────────────
//
// The single most damaging thing this dataset could tell a business is that a
// foreign supplier may bid when nobody established that. Opening a website in a
// browser proves the website opens. It does not prove eligibility, cost, or
// that electronic submission is available to you. So every judgement field is
// tri-state and `unknown` is never silently downgraded to `no`.
//
// ── WHY A NON-200 IS NOT DEATH ──────────────────────────────────────────────
//
// Measured during Wave T1 research: Germany's federal e-Vergabe answers 400
// with "Cookies benötigt"; TenderNed serves a 117-byte JavaScript shell;
// Lithuania's VPT and Malta's Department of Contracts both answer 403 behind
// Cloudflare. Every one of those platforms is real, official and operating. A
// transport-layer result is evidence about a fetch, not about a platform, so a
// blocked or thin response sets `browserCheckRequired` — it never sets a status
// of dead, and it never on its own justifies publishing the record at all.

const fs = require('node:fs');
// For the shared Domain Rating rule.
const BD = require('./bd-schema.cjs');
const ISO = require('./iso-3166-2.cjs');

class TenderPlatformError extends Error {}

// ── CONTROLLED VOCABULARIES ─────────────────────────────────────────────────
// Every value below has a definition. A value that cannot be defined in one
// sentence does not belong in a vocabulary, however useful it sounds.

// What the platform IS. One primary identity per record.
const PLATFORM_TYPES = [
  'national-procurement',    // the official system of a sovereign state
  'eu-procurement',          // an EU-level system serving the whole union
  'institutional-procurement', // one institution buying for itself
  'development-bank',        // an IFI publishing its own and borrower tenders
  'international-organization',
  'regional-procurement',    // a state, Land, canton, region or province
  'municipal-procurement',
  'sector-procurement',      // a defined sector: rail, health, energy, defence
  'public-utility',
  'corporate-procurement',   // one private buyer's own supplier portal
  'b2b-tender-marketplace',  // private buyers and suppliers meeting commercially
  'commercial-aggregator',   // republishes notices sourced from official systems
];

// WHO runs it. Distinct from the platform type, because the operator's nature
// is what tells a supplier whether a system is authoritative. Note that the
// software VENDOR is a fourth thing again and is recorded in `softwareVendor`:
// Ireland's eTenders is operated by the Office of Government Procurement and
// built by European Dynamics, and neither fact substitutes for the other.
const OPERATOR_TYPES = [
  'government', 'contracting-authority', 'central-purchasing-body', 'regulator',
  'eu-institution', 'international-organization', 'state-owned-enterprise',
  'private-company', 'unknown',
];

// What a supplier can actually FIND there. Canonical logic values — localized
// display labels live in the i18n layer and never mutate these.
const OPPORTUNITY_TYPES = [
  'tender', 'contract-notice', 'prior-information-notice', 'award-notice',
  'rfp', 'rfq', 'rfi', 'eoi', 'itt',
  'framework-agreement', 'dynamic-purchasing-system', 'electronic-auction',
  'supplier-registration', 'subcontracting', 'procurement-plan',
];

// Whose money is being spent. This is the public/private axis.
const PROCUREMENT_SCOPES = ['public', 'private', 'mixed'];

// How far the platform's remit reaches.
const COVERAGE_LEVELS = ['supranational', 'national', 'regional', 'municipal', 'institutional'];

// WHICH region, when coverage is regional or municipal.
//
// Wave T2B added this and nothing else to the model. Until then `coverage:
// 'regional'` said a platform served a sub-national area without ever saying
// which one — fine while the regional records were German Länder and UK
// devolved administrations whose names carry the answer, useless the moment
// twenty US states arrive and a reader wants to filter for Texas.
//
// The alternative was to give California a country slug, which would have been
// a lie in the one field the whole dataset joins on. This field is the smaller
// truth: the country stays the country, and the subdivision is named in the
// international standard for naming subdivisions.
//
// Values are ISO 3166-2 codes validated against scripts/lib/iso-3166-2.cjs —
// the allowlist this repository already maintains, already covering US, CA, AU
// and DE, already generated from an ISO-derived source with a recorded digest.
// A format check would have accepted US-ZZ; the allowlist does not.
//
// OPTIONAL, deliberately. Adding it forced zero rewrites on the 104 European
// records that existed when it landed, which is the property that makes this an
// additive migration rather than a schema change.
//
// Permitted only on regional/municipal coverage: a national or supranational
// system does not have a subdivision, and a record claiming both is confused
// about what it is.
const SUBNATIONAL_COVERAGE = ['regional', 'municipal'];

// Cost to SEARCH. Never inferred from a page being publicly viewable: plenty of
// systems show notice headlines free and gate the documents.
const ACCESS_MODELS = ['free', 'paid', 'mixed', 'unknown'];

const CURRENT_STATUSES = ['active', 'unknown', 'replaced', 'shutting-down', 'dormant'];

// Tri-state. The whole point is that the third value exists.
const TRI_STATE = ['yes', 'no', 'unknown'];

// PART 21 evidence classes.
//   A — the operator or a competent authority states the fact.
//   B — the fact is directly observable in the live platform.
//   C — derived mechanically from A/B facts by a documented rule.
//   unknown — not established. Publishable only with browserCheckRequired.
const EVIDENCE_CLASSES = ['A', 'B', 'C', 'unknown'];

const REQUIRED = ['id', 'name', 'officialUrl', 'country', 'platformType', 'operatorType',
  'procurementScope', 'coverage', 'currentStatus', 'evidenceClass', 'evidenceUrl',
  'lastVerified', 'opportunityTypes'];

// Tri-state judgement fields. Absent means unknown; there is no other default.
const TRI_FIELDS = ['electronicSubmission', 'supplierRegistrationRequired',
  'foreignSuppliersAccepted'];

const URL_FIELDS = ['officialUrl', 'tenderSearchUrl', 'supplierRegistrationUrl',
  'submissionUrl', 'documentsUrl', 'evidenceUrl'];

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function problemsFor(row, knownCountries) {
  const p = [];
  const id = row && row.id ? row.id : '(unnamed)';
  const at = (f, m) => p.push([`${id} ${f}`, m]);

  for (const f of REQUIRED) {
    const v = row[f];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) {
      at(f, 'is required.');
    }
  }
  if (typeof row.id === 'string' && !SLUG_RE.test(row.id)) {
    at('id', 'must be a lowercase hyphenated slug.');
  }
  for (const f of URL_FIELDS) {
    const v = row[f];
    if (v === undefined || v === null) continue;
    if (f === 'evidenceUrl') {
      // A citation, not a surface we send anyone to. Some authoritative
      // government sources are genuinely http-only; citing one is honest, and
      // refusing to would push research toward worse sources.
      if (typeof v !== 'string' || !/^https?:\/\//.test(v)) at(f, 'must be an http(s) URL.');
    } else if (typeof v !== 'string' || !/^https:\/\//.test(v)) {
      at(f, 'must be an https URL, or null.');
    }
  }
  if (row.country && !knownCountries.has(row.country)) {
    at('country', `"${row.country}" is not a declared country.`);
  }
  if (row.platformType && !PLATFORM_TYPES.includes(row.platformType)) {
    at('platformType', `must be one of ${PLATFORM_TYPES.join(', ')}.`);
  }
  if (row.operatorType && !OPERATOR_TYPES.includes(row.operatorType)) {
    at('operatorType', `must be one of ${OPERATOR_TYPES.join(', ')}.`);
  }
  if (row.procurementScope && !PROCUREMENT_SCOPES.includes(row.procurementScope)) {
    at('procurementScope', `must be one of ${PROCUREMENT_SCOPES.join(', ')}.`);
  }
  if (row.coverage && !COVERAGE_LEVELS.includes(row.coverage)) {
    at('coverage', `must be one of ${COVERAGE_LEVELS.join(', ')}.`);
  }
  if (row.currentStatus && !CURRENT_STATUSES.includes(row.currentStatus)) {
    at('currentStatus', `must be one of ${CURRENT_STATUSES.join(', ')}.`);
  }
  if (row.evidenceClass && !EVIDENCE_CLASSES.includes(row.evidenceClass)) {
    at('evidenceClass', `must be one of ${EVIDENCE_CLASSES.join(', ')}.`);
  }
  // Seeing a notice and being allowed to bid on it are different permissions
  // with different prices, and 294 platforms record free SEARCH. Reading that
  // as free participation is the mistake this field exists to prevent: plenty
  // of portals publish every notice openly and charge for the certificate,
  // the registration or the submission itself.
  if (row.bidAccess !== undefined && row.bidAccess !== null
    && !ACCESS_MODELS.includes(row.bidAccess)) {
    at('bidAccess', `must be one of ${ACCESS_MODELS.join(', ')}, or absent when never researched.`);
  }
  if (row.searchAccess !== undefined && !ACCESS_MODELS.includes(row.searchAccess)) {
    at('searchAccess', `must be one of ${ACCESS_MODELS.join(', ')}.`);
  }
  if (row.lastVerified && !DATE_RE.test(row.lastVerified)) {
    at('lastVerified', 'must be an ISO date (YYYY-MM-DD).');
  }
  if (Array.isArray(row.opportunityTypes)) {
    for (const t of row.opportunityTypes) {
      if (!OPPORTUNITY_TYPES.includes(t)) at('opportunityTypes', `"${t}" is not an opportunity type.`);
    }
    const sorted = [...row.opportunityTypes].sort();
    if (sorted.join(',') !== row.opportunityTypes.join(',')) {
      at('opportunityTypes', 'must be sorted.');
    }
    if (new Set(row.opportunityTypes).size !== row.opportunityTypes.length) {
      at('opportunityTypes', 'repeats a value.');
    }
  }
  for (const f of TRI_FIELDS) {
    if (row[f] === undefined) continue;
    if (!TRI_STATE.includes(row[f])) at(f, `must be one of ${TRI_STATE.join(', ')}, or absent.`);
  }

  // ── The guards that carry the dataset's integrity ─────────────────────────

  // A claim that a foreign supplier may participate is the highest-consequence
  // statement here, so it costs the most: it needs a stated source, not an
  // observation that the site loaded.
  if (row.foreignSuppliersAccepted === 'yes' && row.evidenceClass !== 'A') {
    at('foreignSuppliersAccepted',
      'may only be "yes" on evidence class A: eligibility must be stated by the operator or authority, never inferred from reachability.');
  }

  // The homepage-as-everything shortcut. If a record claims a distinct
  // discovery or submission surface, that URL must actually differ from the
  // front door; otherwise the record is asserting a capability it has not shown.
  // Wave T2A widened this from two route fields to all four. The original rule
  // covered search and submission; the route-completion pass then began filling
  // registration and documents routes at scale, and a homepage shortcut is
  // exactly as dishonest in those fields as in the first two.
  for (const f of ['tenderSearchUrl', 'submissionUrl', 'supplierRegistrationUrl', 'documentsUrl']) {
    if (row[f] && row.officialUrl && row[f] === row.officialUrl) {
      at(f, 'repeats officialUrl: a homepage may not stand in for a verified route.');
    }
  }

  // ── subnational integrity ────────────────────────────────────────────────
  // Three ways a subdivision code can lie, all guarded: it can not exist, it
  // can belong to a different country than the record, and it can sit on a
  // record that has no subdivision to name.
  if (row.subnationalJurisdiction !== undefined && row.subnationalJurisdiction !== null) {
    const code = row.subnationalJurisdiction;
    if (typeof code !== 'string' || !ISO.isKnownCode(code)) {
      at('subnationalJurisdiction',
        `"${code}" ${typeof code === 'string' ? ISO.unknownCodeProblem(code) : 'must be an ISO 3166-2 code string'}.`);
    } else if (!SUBNATIONAL_COVERAGE.includes(row.coverage)) {
      at('subnationalJurisdiction',
        `is set on a "${row.coverage}" record: only ${SUBNATIONAL_COVERAGE.join(' or ')} coverage names a subdivision.`);
    } else if (knownCountries instanceof Map) {
      // knownCountries carries slug -> iso2 when the caller can supply it, which
      // is what makes the "California in Canada" check possible at all.
      const want = knownCountries.get(row.country);
      const got = ISO.countryOf(code);
      if (want && got && want !== got) {
        at('subnationalJurisdiction',
          `is ${code} (${got}) but the record's country "${row.country}" is ${want}.`);
      }
    }
  }

  // A software vendor must not displace a PUBLIC operator. Recording the same
  // name in both fields is how "JAGGAER" ends up presented as the operator of a
  // state's procurement rather than as the software underneath it.
  //
  // Scoped to public operator types on purpose. A private company that both
  // builds and runs its own platform is a real and common arrangement —
  // FedConnect and Unison Marketplace are operated by Unison, Moldova's
  // e-licitatie.md by Esempla Systems — and an absolute rule flagged all three
  // as defects on its first run. The defect is specifically a vendor name
  // standing where a government authority belongs.
  // Deliberately excludes state-owned-enterprise: an SOE is a company, and a
  // company that builds and runs its own platform is the FedConnect/Unison
  // arrangement, not a vendor displacing an authority. Indonesia's PaDi UMKM is
  // operated by PT Telkom, which also built it.
  const PUBLIC_OPERATORS = ['government', 'contracting-authority', 'central-purchasing-body',
    'regulator', 'eu-institution', 'international-organization'];
  if (row.softwareVendor && row.operator && PUBLIC_OPERATORS.includes(row.operatorType)
      && String(row.softwareVendor).trim().toLowerCase() === String(row.operator).trim().toLowerCase()) {
    at('softwareVendor', `is identical to operator on a "${row.operatorType}" record: the software vendor has displaced the operating authority.`);
  }

  // Mojibake — UTF-8 bytes decoded as Latin-1. The result is still valid text,
  // so it round-trips through JSON, parses as CSV and renders in HTML; nothing
  // else in the pipeline can notice. Wave T3 brought Chinese, Japanese, Korean
  // and Arabic names into the dataset, and a platform name is a factual
  // identifier: a mangled one is a false statement about what the system is
  // called.
  //
  // Detected by reversing the corruption rather than by pattern-matching. A
  // signature list caught "Ã©"-style damage to accented Latin text and missed
  // CJK entirely, because three-byte sequences corrupt to a different lead
  // range. This asks the actual question: if every character fits in Latin-1,
  // do those bytes decode as valid non-ASCII UTF-8? Only mojibake does.
  for (const f of ['name', 'operator']) {
    const v = row[f];
    if (typeof v !== 'string' || !v || !/[\u0080-\u00ff]/.test(v)) continue;
    if ([...v].some((ch) => ch.codePointAt(0) > 0xff)) continue; // real non-Latin text
    const reread = Buffer.from(v, 'latin1').toString('utf8');
    if (!reread.includes('\ufffd') && reread !== v && /[^\u0000-\u007f]/.test(reread)) {
      at(f, `appears to be mojibake: its bytes decode as "${reread.slice(0, 40)}". The value is corrupted, not merely unusual.`);
    }
  }

  // A multilateral body is not a country.
  //
  // Wave T4 added the international layer — UNGM, the World Bank, the regional
  // development banks, NATO agencies. The available shortcut was to file each
  // under whichever country slug validated: the World Bank under united-states
  // because it is headquartered in Washington, AIIB under china because it sits
  // in Beijing, NSPA under luxembourg. Every one of those would be a false
  // statement about who the buyer is and which law applies.
  //
  // No new field was needed to prevent it. The shared geography file already
  // marks its two non-country entries — "global" and "european-union" — with
  // entityType "supranational", and that is the distinction this guard reads.
  // A record claiming supranational coverage must sit on a supranational slug;
  // a real country cannot host one.
  //
  // knownCountries carries slug -> alpha-2 when the caller can supply it, and a
  // real country is exactly a slug that HAS an alpha-2. That is why this works
  // without teaching the schema a second list it would have to keep in step.
  if (row.coverage === 'supranational' && knownCountries instanceof Map
      && knownCountries.has(row.country) && knownCountries.get(row.country)) {
    at('country', `is "${row.country}", a country with an ISO alpha-2 code, but the record claims supranational coverage: a multilateral body may not be filed under a nation.`);
  }

  // An unverifiable fetch is publishable only when it says so out loud.
  if (row.evidenceClass === 'unknown' && row.browserCheckRequired !== true) {
    at('evidenceClass', 'is "unknown", so browserCheckRequired must be true.');
  }

  // A platform that has been replaced must say what replaced it, or the reader
  // is left on a dead end — and the converse: a record that names a successor
  // while still calling itself active is presenting a superseded system as a
  // current destination. Both directions are lies about migration state.
  if (row.currentStatus === 'replaced' && !row.replacedBy) {
    at('replacedBy', 'is required when currentStatus is "replaced".');
  }
  if (row.replacedBy && row.currentStatus !== 'replaced') {
    at('currentStatus', `must be "replaced" when replacedBy is set (got "${row.currentStatus}").`);
  }

  // No invented procurement intelligence, ever (PART 35).
  //
  // `domainRating` left this list when Domain Rating collection was unfrozen,
  // and it is the one entry that never belonged with the others: the rest are
  // numbers this project would have had to make up, while a Domain Rating is a
  // measurement somebody else took and published. It is admitted under the
  // shared rule below, which demands the scale and the provenance; everything
  // still listed here remains forbidden outright.
  for (const [field, reason] of BD.domainRatingProblems(row)) at(field, reason);
  for (const banned of ['score', 'tenderScore', 'traffic', 'authorityScore',
    'contractValue', 'bidderCount', 'winRate', 'tenderCount']) {
    if (row[banned] !== undefined && row[banned] !== null) {
      at(banned, 'may not be set: this dataset takes no measurements and estimates no procurement metrics.');
    }
  }
  return p;
}

// Publishable = the reader can act on it. A replaced or dormant system is
// recorded for canonicalisation but never offered as somewhere to go bid.
function isPublishable(row) {
  if (!row) return false;
  if (['replaced', 'shutting-down', 'dormant'].includes(row.currentStatus)) return false;
  return typeof row.officialUrl === 'string' && /^https:\/\//.test(row.officialUrl);
}

// Code-unit ordering: localeCompare would make generated bytes depend on the
// host's ICU build, and this collection must hash identically everywhere.
const compareStable = (a, b) => {
  const as = String(a ?? '');
  const bs = String(b ?? '');
  if (as < bs) return -1;
  if (as > bs) return 1;
  return 0;
};

const hostOf = (url) => String(url || '').replace(/^https:\/\/(www\.)?/, '').split('/')[0].toLowerCase();

function loadPlatforms(file, knownCountries) {
  if (!fs.existsSync(file)) return [];
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (cause) {
    throw new TenderPlatformError(`Corrupt platforms file: ${cause.message}`);
  }
  if (!Array.isArray(raw)) throw new TenderPlatformError('platforms.json must contain an array.');

  const problems = [];
  const ids = new Set();
  const hosts = new Map();
  for (const row of raw) {
    problems.push(...problemsFor(row, knownCountries));
    if (ids.has(row.id)) problems.push([`${row.id}`, 'is declared twice.']);
    ids.add(row.id);

    // Entity resolution (PART 23). One procurement system, one row — www/apex
    // and language paths collapse to the same host key. Two records may share a
    // host ONLY when one declares itself part of the other's ecosystem, which
    // is how a national gazette and its e-submission tool can both be published
    // when they genuinely differ in function.
    // ONE OPERATIONAL SYSTEM, ONE ROW — but "one host" is not the same thing as
    // "one system", and Wave T4B proved it twice.
    //
    // WHO, UNICEF and WFP each run their own tendering site as a separate tenant
    // of one In-tend deployment: ungm.in-tend.co.uk/who, /unicef, /wfp. Three
    // institutions, three tender universes, one vendor hostname. Keying purely
    // on host silently deleted two of them. IsDB likewise publishes corporate
    // and project-financed procurement on one domain, and those are the very
    // functions this collection exists to keep apart.
    //
    // So the key stays host-based — that is what catches www/apex variants and
    // the same platform re-listed — and two records may share a host only when
    // something real distinguishes them:
    //   * a declared partOf relationship (a component of a parent system), or
    //   * a different operator (a multi-tenant vendor deployment), or
    //   * a different procurement nature (a corporate surface beside a
    //     project-financed one), read from the record's own nature statement.
    // A bare duplicate — same host, same operator, same nature, no declared
    // relationship — is still rejected.
    const natureOf = (r) => {
      const m = (r.limitations || []).map((l) => /^(Project-financed|Corporate|Consulting)/.exec(l))
        .find(Boolean);
      return m ? m[1] : '';
    };
    const key = `${row.country}|${hostOf(row.officialUrl)}`;
    if (hosts.has(key)) {
      const priorId = hosts.get(key);
      const prior = raw.find((x) => x.id === priorId);
      const related = row.partOf === priorId || (prior && prior.partOf === row.id);
      const differentOperator = prior
        && String(row.operator || '').trim().toLowerCase()
           !== String(prior.operator || '').trim().toLowerCase();
      const differentNature = prior && natureOf(row) && natureOf(prior)
        && natureOf(row) !== natureOf(prior);
      const differentUrl = prior && row.officialUrl !== prior.officialUrl;
      if (!(related || ((differentOperator || differentNature) && differentUrl))) {
        problems.push([`${row.id}`, `shares a host with ${priorId} and is indistinguishable from it: `
          + 'declare a partOf relationship, or establish a different operator or procurement nature.']);
      }
    } else hosts.set(key, row.id);
  }

  // partOf and replacedBy must point at records that exist, or the graph lies.
  for (const row of raw) {
    for (const f of ['partOf', 'replacedBy']) {
      if (row[f] && !ids.has(row[f])) {
        problems.push([`${row.id} ${f}`, `points at "${row[f]}", which is not a record in this dataset.`]);
      }
      if (row[f] && row[f] === row.id) problems.push([`${row.id} ${f}`, 'points at itself.']);
    }
  }

  if (problems.length) {
    throw new TenderPlatformError(`platforms.json failed validation:\n${
      problems.map(([f, m]) => `  ${f}: ${m}`).join('\n')}`);
  }
  return raw.map((r) => ({ ...r, opportunityTypes: r.opportunityTypes.slice() }));
}

// Country then name, both locale-independent.
function comparePlatforms(a, b) {
  return compareStable(a.country, b.country) || compareStable(a.name, b.name);
}

module.exports = {
  TenderPlatformError, PLATFORM_TYPES, OPERATOR_TYPES, OPPORTUNITY_TYPES,
  PROCUREMENT_SCOPES, COVERAGE_LEVELS, ACCESS_MODELS, CURRENT_STATUSES, TRI_STATE,
  EVIDENCE_CLASSES, REQUIRED, TRI_FIELDS, URL_FIELDS,
  problemsFor, isPublishable, loadPlatforms, comparePlatforms, compareStable, hostOf,
};
