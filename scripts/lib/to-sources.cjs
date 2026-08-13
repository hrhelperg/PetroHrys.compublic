'use strict';

// Tender Opportunity Intelligence v1 — the SOURCE REGISTRY.
//
// ── WHY A REGISTRY AND NOT A LIST OF SCRAPERS ───────────────────────────────
//
// The platforms collection answers "where does procurement happen?" for 382
// systems. Almost none of those 382 can be ingested: they are HTML behind a
// WAF, a session-scoped search form, or a login. Treating "we know this
// platform exists" as "we can ingest this platform" is the single most
// expensive mistake available here, because it turns an intelligence product
// into a scraper farm that breaks weekly and republishes other people's
// copyrighted solicitation documents.
//
// So ingestion capability is recorded as DATA, per source, with the access
// method that was actually observed and the reuse terms that were actually
// read. A source enters the pilot because its access method and its terms both
// hold up — never because it is famous.
//
// ── WHAT WAS PROBED, AND WHAT CAME BACK ─────────────────────────────────────
//
// Every classification below was established by issuing a real request from
// this repository and reading the real response. Nothing here is inferred from
// a platform's reputation or from documentation alone.
//
//   TED               POST /v3/notices/search           200, keyless, CPV present
//   UK Find a Tender  GET  /api/1.0/ocdsReleasePackages 200, keyless, OCDS 1.1
//   CanadaBuys        GET  open data CSV                200, 6.3 MB, 54,838 rows
//   World Bank        GET  /api/v2/procnotices          200, 414,749 notices
//   SECOP II          GET  Socrata /resource/p6dx-8zbt  200, keyless, UNSPSC
//
//   AusTender         GET  atom-tenders.xml             403 — WAF
//   ADB               GET  tenders/rss.xml              403 — WAF
//   EBRD ECEPP        GET  /respond/api                 403 — WAF
//   SAM.gov           GET  opportunities/v2/search      empty — API key required
//   NZ GETS           GET  ExternalIndex.htm            200 HTML only, no feed
//   UNGM              GET  /Public/Notice               200 HTML only, POST search
//   Singapore GeBIZ   GET  data.gov.sg datastore        200 — AWARDS, not notices
//   Prozorro          GET  /api/2.5/tenders             200 — see note below
//   Brazil PNCP       GET  /api/consulta/v1/...         200 but empty for window
//
// Prozorro deserves its own sentence, because rejecting an open API looks
// wrong. Its public API is a sequential CHANGES FEED: each page returns
// {id, dateModified} and `opt_fields` widens that only to `status` and
// `tenderID` — the title, buyer, CPV and deadline are not obtainable without
// one additional HTTP request PER NOTICE. Ingesting a bounded current window
// would mean thousands of individual requests against a public service to
// assemble what the other four sources hand over in one paginated call. That
// is a rate-respect decision, not a capability judgement, and it is reversible
// the moment a bulk endpoint exists.

// ── ACQUISITION MODES ───────────────────────────────────────────────────────
// The vocabulary the audit assigns. UNKNOWN is a real answer and stays.
const ACQUISITION_MODES = [
  'OFFICIAL_API',
  'OFFICIAL_FEED',
  'OFFICIAL_EXPORT',
  'STRUCTURED_PUBLIC_DATA',
  'PUBLIC_HTML',
  'BROWSER_REQUIRED',
  'LOGIN_REQUIRED',
  'MANUAL_ONLY',
  'NOT_SUITABLE',
  'UNKNOWN',
];

// ── REUSE CLASSIFICATION ────────────────────────────────────────────────────
//
// This is an ENGINEERING classification of what the published terms say. It is
// not a legal opinion and it is not advice. Where the operator's own documents
// disagree with each other, the answer is UNCLEAR and the storage policy
// tightens accordingly — it does not resolve itself in our favour.
const REUSE_CLASSES = ['PERMITTED', 'LIKELY_PERMITTED', 'UNCLEAR', 'RESTRICTED', 'UNKNOWN'];

// What a source is allowed to contribute to the published dataset.
//
//   FULL_METADATA    — factual notice metadata may be stored and shown.
//   MINIMAL_METADATA — identity, buyer, dates, codes and a link. No description
//                      text, no notice body, no attachments.
//
// Nothing anywhere permits mirroring solicitation documents, and no mode
// permits storing a named contact person. Those are handled below, in the
// field-level policy, so they cannot be forgotten per adapter.
const STORAGE_POLICIES = ['FULL_METADATA', 'MINIMAL_METADATA'];

// ── FIELDS NO SOURCE MAY CONTRIBUTE ─────────────────────────────────────────
//
// Procurement notices carry a named officer, their direct email and their
// direct phone number. Every pilot source publishes them; the World Bank feed
// hands over contact_name, contact_email and contact_phone_no on every single
// record. Republishing those would build a contact-person database as a side
// effect of building a tender index, and would do it to real people who did
// not choose to be in it.
//
// The normalizer strips these before a record is ever written, for every
// source, regardless of that source's reuse class. Buyer ORGANISATION identity
// is retained — that is the procuring entity, not a person.
const FORBIDDEN_FIELD_PATTERNS = [
  /contact_?name/i, /contact_?email/i, /contact_?phone/i, /contact_?fax/i,
  /contactinfo/i, /informationscontact/i,
  /\bemail\b/i, /\bphone\b/i, /\btelephone\b/i,
];

// ── THE PILOT SOURCES ───────────────────────────────────────────────────────
//
// `platformId` binds each source to a canonical TenderPlatform record. It is
// not decorative: the schema refuses an opportunity whose platform does not
// exist, so a source cannot invent a procurement system by being ingested.
//
// `window` is the bounded current slice this pilot retains. It is documented
// per source because "recent" means different things to a 2,000-notice-a-day
// EU aggregator and to a development bank publishing a few hundred a week.

const SOURCES = [
  {
    id: 'ted',
    name: 'TED — Tenders Electronic Daily',
    platformId: 'eu-ted',
    operator: 'Publications Office of the European Union',
    acquisition: 'OFFICIAL_API',
    endpoint: 'https://api.ted.europa.eu/v3/notices/search',
    method: 'POST',
    authRequired: false,
    javascriptRequired: false,
    browserRequired: false,
    // ted.europa.eu/en/legal-notice: notices "can be freely reused, for
    // commercial or non-commercial purposes"; editorial content CC BY 4.0,
    // metadata CC0 1.0. Attribution given on the published page.
    reuse: 'PERMITTED',
    reuseBasis: 'Commission reuse policy; notice content CC BY 4.0, metadata CC0 1.0',
    attributionRequired: true,
    storage: 'FULL_METADATA',
    robotsRelevant: false, // api.ted.europa.eu serves no robots.txt; this is an API client, not a crawler
    stableIdentifier: 'publication-number',
    exposesModifiedDate: false,
    exposesStatus: true, // via scope=ACTIVE and notice lifecycle, not a per-record status string
    exposesAttachments: true, // links.pdf / links.html — linked, never mirrored
    classificationScheme: 'CPV',
    updateFrequency: 'continuous, business days',
    // ~2,000 notices/day across the EU. A one-day window is reachable to
    // exhaustion inside the page cap, which is what makes the completeness
    // flag meaningful rather than decorative.
    window: { kind: 'publication', days: 1 },
    pageSize: 250,
    // 30 × 250 = 7,500, comfortably above the ~6,500 a day produces. The cap
    // is a runaway guard, not a coverage limit: the loop stops when the source
    // says it has delivered everything, so the window is ingested COMPLETE
    // rather than truncated at an arbitrary page.
    maxPages: 30,
    rateLimitNote: 'No published quota. One request at a time, 250/page, hard page cap.',
    knownRestrictions: [],
  },
  {
    id: 'uk-fts',
    name: 'Find a Tender (FTS)',
    platformId: 'uk-find-a-tender',
    operator: 'UK Cabinet Office',
    acquisition: 'OFFICIAL_API',
    endpoint: 'https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages',
    method: 'GET',
    authRequired: false,
    javascriptRequired: false,
    browserRequired: false,
    // UK public-sector notice data is published under the Open Government
    // Licence v3.0. The API returns OCDS release packages, the schema the
    // service itself documents for reuse.
    reuse: 'LIKELY_PERMITTED',
    reuseBasis: 'Open Government Licence v3.0 (UK public sector information)',
    attributionRequired: true,
    storage: 'FULL_METADATA',
    robotsRelevant: false, // the /api/ path is a documented reuse interface
    stableIdentifier: 'ocid',
    exposesModifiedDate: true, // release.date + package publishedDate
    exposesStatus: true, // tender.status
    exposesAttachments: true,
    classificationScheme: 'CPV',
    updateFrequency: 'continuous, business days',
    // Three days, page cap raised so the window can be exhausted rather than
    // truncated. Seven days did not fit inside a sane cap; three does.
    window: { kind: 'updated', days: 3 },
    pageSize: 100,
    maxPages: 25,
    rateLimitNote: 'No published quota. Sequential cursor paging, hard page cap.',
    knownRestrictions: [],
  },
  {
    id: 'canadabuys',
    name: 'CanadaBuys / AchatsCanada',
    platformId: 'ca-canadabuys',
    operator: 'Public Services and Procurement Canada',
    acquisition: 'OFFICIAL_EXPORT',
    endpoint: 'https://canadabuys.canada.ca/opendata/pub/openTenderNotice-ouvertAvisAppelOffres.csv',
    method: 'GET',
    authRequired: false,
    javascriptRequired: false,
    browserRequired: false,
    // Open Government Licence – Canada: worldwide, royalty-free, perpetual,
    // includes commercial use, requires acknowledgement. The licence
    // explicitly EXCLUDES personal information — which is why the contact
    // columns in this very file are dropped rather than stored.
    reuse: 'PERMITTED',
    reuseBasis: 'Open Government Licence – Canada (excludes personal information)',
    attributionRequired: true,
    storage: 'FULL_METADATA',
    robotsRelevant: false, // published open-data artefact, not a crawled page
    stableIdentifier: 'referenceNumber',
    exposesModifiedDate: true, // amendmentDate
    exposesStatus: true, // tenderStatus
    exposesAttachments: true,
    classificationScheme: 'UNSPSC',
    updateFrequency: 'daily',
    // The file IS the bounded window: PSPC publishes "open tender notices",
    // and the set it contains is the set that is open. Imposing a publication
    // cut-off on top of that would discard notices that are genuinely open
    // because they were posted early — one in the probe closes in 2029.
    window: { kind: 'source-defined', days: null, note: 'the published open-notice set' },
    pageSize: null, // single file
    maxPages: 1,
    rateLimitNote: 'One 6.3 MB file per refresh. Never fetched more than once per run.',
    knownRestrictions: ['File contains contact-person columns; they are dropped at normalization.'],
  },
  {
    id: 'worldbank',
    name: 'World Bank Group Procurement Notices',
    platformId: 'int-world-bank-group-procurement',
    operator: 'World Bank Group',
    acquisition: 'OFFICIAL_API',
    endpoint: 'https://search.worldbank.org/api/v2/procnotices',
    method: 'GET',
    authRequired: false,
    javascriptRequired: false,
    browserRequired: false,
    // The World Bank's own documents disagree. The Data Catalog states CC BY
    // 4.0 as the default for Bank-produced datasets, permitting commercial
    // reuse with attribution. The general Terms & Conditions state that
    // derivative works and commercial use — naming API-facilitated commercial
    // applications specifically — require prior written consent.
    //
    // Two published positions, opposite conclusions, and this repository is a
    // commercial site. The honest classification is UNCLEAR, and UNCLEAR
    // tightens storage rather than resolving in our favour: identity, buyer,
    // country, dates, procurement method and a link out. The bid_description
    // and the full notice_text — the parts that would actually substitute for
    // visiting the Bank's own page — are not stored.
    reuse: 'UNCLEAR',
    reuseBasis: 'Data Catalog default CC BY 4.0 vs. general T&C restricting commercial API use',
    attributionRequired: true,
    storage: 'MINIMAL_METADATA',
    robotsRelevant: false, // search.worldbank.org serves no robots.txt
    stableIdentifier: 'id',
    exposesModifiedDate: false,
    exposesStatus: true, // notice_status
    exposesAttachments: false,
    classificationScheme: null, // procurement_group / method, not a code scheme
    updateFrequency: 'daily',
    // 414,749 notices exist. This window is defined by RECENCY rather than by
    // a date range: the 1,000 most recently published, notice-date descending.
    // That is a reproducible, bounded slice — not a partial attempt at the
    // whole archive — and the snapshot records it as such.
    window: { kind: 'most-recent', count: 1000, days: null },
    pageSize: 100,
    maxPages: 10,
    rateLimitNote: 'No published quota. Sequential offset paging, hard page cap.',
    knownRestrictions: [
      'Reuse terms unclear — minimal metadata only, no description text stored.',
      'Every record carries contact person name, email and phone; all dropped at normalization.',
      'notice_text is a full HTML solicitation document and is never stored.',
    ],
  },
  {
    id: 'secop2',
    name: 'SECOP II',
    platformId: 'co-secop-ii',
    operator: 'Colombia Compra Eficiente',
    acquisition: 'STRUCTURED_PUBLIC_DATA',
    endpoint: 'https://www.datos.gov.co/resource/p6dx-8zbt.json',
    method: 'GET',
    authRequired: false, // a Socrata app token raises quota; it is not required
    javascriptRequired: false,
    browserRequired: false,
    // datos.gov.co is Colombia's national open-data portal, publishing under
    // the national open-data framework (Ley 1712 de 2014). The dataset is
    // served through Socrata's public resource API.
    reuse: 'LIKELY_PERMITTED',
    reuseBasis: 'Colombian national open data portal (Ley 1712 de 2014 transparency framework)',
    attributionRequired: true,
    storage: 'FULL_METADATA',
    // datos.gov.co DOES serve robots.txt, and it matters: Crawl-delay 1 and a
    // set of Disallow rules — all of which target /browse HTML search
    // permutations, not /resource/ API paths. Honoured either way: one
    // request at a time, no /browse access.
    robotsRelevant: true,
    stableIdentifier: 'id_del_proceso',
    exposesModifiedDate: true, // fecha_de_ultima_publicaci
    exposesStatus: true, // fase
    exposesAttachments: false,
    classificationScheme: 'UNSPSC',
    updateFrequency: 'daily',
    // Seven days of OPEN, COMPETITIVE procedures. The three qualifiers are
    // load-bearing: seven days because the dataset lags two, open because the
    // portal says so, and competitive because 92% of Colombia's open notices
    // are direct awards nobody can bid for.
    window: { kind: 'publication', days: 7, filter: 'open, competitive procedures only' },
    pageSize: 500,
    maxPages: 12,
    rateLimitNote: 'robots.txt Crawl-delay 1 honoured; sequential paging, hard page cap.',
    knownRestrictions: [
      'Category codes carry a "V1." prefix over the UNSPSC commodity code.',
      'Publication data lags: on the pilot date the newest record was two days old.',
      'No submission deadline is published in this dataset at all.',
    ],
  },
  // ── PHASE 2 ───────────────────────────────────────────────────────────────
  //
  // Three sources added after v1, chosen against the finding v1 produced
  // rather than against a wish list. v1 reported ZERO cross-source duplicates
  // because its five sources covered disjoint jurisdictions, which left the
  // deduplication graph tested only against fixtures. Two of the three below
  // are EU national portals that deliberately overlap TED — they publish a
  // flag saying so — and the third widens African coverage through a format
  // that makes the next OCDS publisher nearly free.
  {
    id: 'tenderned',
    name: 'TenderNed',
    platformId: 'nl-tenderned',
    operator: 'Ministerie van Economische Zaken (Netherlands)',
    acquisition: 'OFFICIAL_API',
    endpoint: 'https://www.tenderned.nl/papi/tenderned-rs-tns/v2/publicaties',
    method: 'GET',
    authRequired: false,
    javascriptRequired: false,
    browserRequired: false,
    // TenderNed is the statutory Dutch publication platform; its publication
    // API is public and unauthenticated. No explicit reuse licence is
    // published against the API itself, so this is classified on the basis of
    // it being the mandated public register rather than on a licence text.
    reuse: 'LIKELY_PERMITTED',
    reuseBasis: 'Statutory Dutch public procurement register; public unauthenticated publication API',
    attributionRequired: true,
    storage: 'FULL_METADATA',
    robotsRelevant: false,
    stableIdentifier: 'publicatieId',
    exposesModifiedDate: true,
    exposesStatus: true,
    exposesAttachments: false,
    classificationScheme: null, // the list endpoint publishes no CPV
    updateFrequency: 'continuous, business days',
    window: { kind: 'publication', days: 3 },
    pageSize: 100,
    maxPages: 12,
    rateLimitNote: 'No published quota. Sequential paging, hard page cap.',
    knownRestrictions: [
      'Deadlines are published without a time zone.',
      'The list endpoint carries no CPV; contract nature only.',
    ],
  },
  {
    id: 'boamp',
    name: 'BOAMP — Bulletin officiel des annonces des marchés publics',
    platformId: 'fr-boamp',
    operator: 'Direction de l’information légale et administrative (France)',
    acquisition: 'OFFICIAL_API',
    endpoint: 'https://www.boamp.fr/api/explore/v2.1/catalog/datasets/boamp/records',
    method: 'GET',
    authRequired: false,
    javascriptRequired: false,
    browserRequired: false,
    // boamp.fr states in its own footer: "Sauf mention contraire, tous les
    // contenus de ce site sont sous licence etalab-2.0" — the Licence Ouverte
    // 2.0, which permits commercial reuse with attribution. The dataset
    // metadata itself declares no licence field, which is why this is
    // LIKELY_PERMITTED rather than PERMITTED.
    reuse: 'LIKELY_PERMITTED',
    reuseBasis: 'Licence Ouverte / Etalab 2.0 stated site-wide; dataset metadata declares no licence field',
    attributionRequired: true,
    storage: 'FULL_METADATA',
    robotsRelevant: false,
    stableIdentifier: 'idweb',
    exposesModifiedDate: false,
    exposesStatus: true, // `etat`
    exposesAttachments: false,
    classificationScheme: null, // CPV is buried in an eForms blob; see the adapter
    updateFrequency: 'daily, business days',
    window: { kind: 'publication', days: 3 },
    pageSize: 100,
    maxPages: 15,
    rateLimitNote: 'No published quota. Sequential offset paging, hard page cap.',
    knownRestrictions: [
      'CPV is not addressable in the flat record; no classification is stored.',
      'Department numbers are INSEE codes, not ISO 3166-2 subdivisions.',
    ],
  },
  {
    id: 'za-etenders',
    name: 'eTender Publication Portal (South Africa)',
    platformId: 'za-etender-publication-portal',
    operator: 'National Treasury (South Africa)',
    acquisition: 'OFFICIAL_API',
    endpoint: 'https://ocds-api.etenders.gov.za/api/OCDSReleases',
    method: 'GET',
    authRequired: false,
    javascriptRequired: false,
    browserRequired: false,
    // The API declares its own licence in every response package:
    // opendatacommons.org/licenses/pddl/1-0 — a public domain dedication, the
    // most permissive classification any source in this project carries.
    reuse: 'PERMITTED',
    reuseBasis: 'PDDL 1.0 public domain dedication, declared in the API response package',
    attributionRequired: true,
    storage: 'FULL_METADATA',
    robotsRelevant: false,
    stableIdentifier: 'ocid',
    exposesModifiedDate: true,
    exposesStatus: true,
    exposesAttachments: true, // linked, never mirrored
    classificationScheme: null, // no coded classification published
    updateFrequency: 'daily',
    window: { kind: 'publication', days: 21 },
    pageSize: 100,
    maxPages: 12,
    rateLimitNote: 'No published quota. Sequential page paging, hard page cap.',
    knownRestrictions: [
      'tender.title is often a bare reference; the subject is in tender.description.',
      'Every release carries a contactPerson object; dropped at normalization.',
    ],
    noticeUrl: (r) => `https://www.etenders.gov.za/Home/TenderDetails?id=${encodeURIComponent(r.ocid || '')}`,
  },
  // ── PHASE 3 ───────────────────────────────────────────────────────────────
  {
    id: 'uk-contracts-finder',
    name: 'Contracts Finder (UK)',
    platformId: 'uk-contracts-finder',
    operator: 'UK Cabinet Office',
    acquisition: 'OFFICIAL_API',
    endpoint: 'https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search',
    method: 'GET',
    authRequired: false,
    javascriptRequired: false,
    browserRequired: false,
    // The API declares its own licence in every response package:
    // nationalarchives.gov.uk/doc/open-government-licence/version/3/, with
    // publisher "Cabinet Office". Declared rather than inferred, which is why
    // this is PERMITTED where Find a Tender is LIKELY_PERMITTED.
    reuse: 'PERMITTED',
    reuseBasis: 'Open Government Licence v3.0, declared in the API response package',
    attributionRequired: true,
    storage: 'FULL_METADATA',
    robotsRelevant: false,
    stableIdentifier: 'ocid',
    exposesModifiedDate: true,
    exposesStatus: true,
    exposesAttachments: true,
    classificationScheme: 'CPV',
    updateFrequency: 'continuous, business days',
    // Added for what it adds beyond Find a Tender, not for a second UK logo:
    // Contracts Finder carries BELOW-threshold procurement that never reaches
    // the Official Journal or FTS, and it publishes CPV and real contract
    // values. It also overlaps FTS on above-threshold notices, which gives the
    // deduplication graph a second live cross-source pair to resolve.
    window: { kind: 'publication', days: 3 },
    pageSize: 100,
    maxPages: 20,
    rateLimitNote: 'No published quota. Cursor paging via links.next, hard page cap.',
    knownRestrictions: [],
  },
  {
    id: 'de-vergabe',
    name: 'Datenservice Öffentlicher Einkauf (oeffentlichevergabe.de)',
    platformId: 'de-bekanntmachungsservice',
    operator: 'Beschaffungsamt des Bundesministeriums des Innern und für Heimat',
    acquisition: 'OFFICIAL_EXPORT',
    endpoint: 'https://oeffentlichevergabe.de/api/notice-exports',
    method: 'GET',
    authRequired: false,
    javascriptRequired: false,
    browserRequired: false,
    // Upgraded from LIKELY_PERMITTED in Phase 4. The API does not merely
    // permit reuse by implication — every OCDS package it emits declares
    // license https://opendefinition.org/licenses/cc-zero/, a public domain
    // dedication, alongside publisher "Bekanntmachungsservice" and a
    // publicationPolicy URL. Declared, machine-readable, per response.
    reuse: 'PERMITTED',
    reuseBasis: 'CC0 public domain dedication, declared in every OCDS package the API emits',
    attributionRequired: true,
    storage: 'FULL_METADATA',
    robotsRelevant: false,
    stableIdentifier: 'ocid',
    exposesModifiedDate: false,
    exposesStatus: true, // in the ocds2 variant only
    exposesAttachments: true,
    classificationScheme: 'CPV',
    updateFrequency: 'daily',
    window: { kind: 'publication', days: 3 },
    pageSize: null, // one ZIP archive per published day
    maxPages: 3,
    rateLimitNote: 'One archive per day requested; no published quota.',
    // ── ACTIVATED IN PHASE 4 ────────────────────────────────────────────────
    //
    // Phase 3 held this source back because oeffentlichevergabe.de had no
    // canonical platform record, and a source may not mint one. Phase 4 did
    // the platform research first, in the right order.
    //
    // The question was whether the Bekanntmachungsservice has platform
    // identity at all, or is merely an open-data endpoint. It has: it is the
    // federal notice publication and discovery service, operated by the
    // Beschaffungsamt des BMI, aggregating federal, Länder, municipal and
    // Bremen notices — reachable without registration, and carrying no
    // bidding function. That is precisely the class TED already occupies in
    // this collection, and de-had at Land level. Suppliers search here and
    // submit on e-Vergabe or the issuing Land portal, each already a separate
    // canonical record.
    //
    // So the record was created to the collection's own standard (evidence
    // class A, from the service's machine-readable self-declaration), and only
    // then was this source linked to it.
    readyState: 'ACTIVE',
    knownRestrictions: [
      'Only ZIP content types are served; application/json returns 406.',
      'The `ocds` variant publishes NO status and NO deadline on any record; the `ocds2` variant must be used.',
      'A discovery surface, not a bidding platform: the submission route is the issuing platform, not this one.',
    ],
  },
  // ── EXPANSION v2 ──────────────────────────────────────────────────────────
  {
    id: 'sam-gov',
    name: 'SAM.gov Contract Opportunities',
    platformId: 'us-sam-gov',
    operator: 'General Services Administration (United States)',
    acquisition: 'OFFICIAL_EXPORT',
    endpoint: 'https://sam.gov/api/prod/fileextractservices/v1/api/download/Contract%20Opportunities/datagov/ContractOpportunitiesFullCSV.csv?privacy=Public',
    method: 'GET',
    // ── THE CORRECTION THAT UNBLOCKED THIS SOURCE ───────────────────────────
    //
    // v1 probed /opportunities/v2/search, got an empty response without a key,
    // and recorded SAM as LOGIN_REQUIRED. That finding was true about the
    // SEARCH API and false about SAM.gov: the daily bulk extract published for
    // data.gov is served to an unauthenticated GET, and it is the complete
    // file rather than a paged query. 251,608,326 bytes, 82,960 rows, no key,
    // no session, nothing bypassed.
    //
    // The lesson is narrower than "re-probe everything". An access finding is
    // about the ENDPOINT that was probed, and filing it against the whole
    // platform is what kept this source closed for two phases.
    authRequired: false,
    javascriptRequired: false,
    browserRequired: false,
    // Works of the United States Government are not subject to copyright
    // within the United States (17 U.S.C. § 105), and this extract is the
    // artefact GSA publishes for data.gov redistribution.
    reuse: 'PERMITTED',
    reuseBasis: '17 U.S.C. § 105 — US Government works; published as the data.gov bulk extract',
    attributionRequired: true,
    storage: 'FULL_METADATA',
    robotsRelevant: false, // a published open-data artefact, not a crawled page
    stableIdentifier: 'NoticeId',
    exposesModifiedDate: false, // the extract carries no modification stamp
    exposesStatus: false,       // `Active` is constant across all 82,960 rows
    exposesAttachments: false,
    // NAICS is the primary scheme. PSC is published alongside it on 96% of
    // rows and is carried natively — both are official US taxonomies, and
    // NEITHER is converted to CPV or UNSPSC.
    classificationScheme: 'NAICS',
    classificationSchemes: ['NAICS', 'PSC'],
    updateFrequency: 'daily',
    // ── THE WINDOW ──────────────────────────────────────────────────────────
    //
    // The artefact is every notice SAM has not yet archived — awards, expired
    // solicitations, market research and all. What is INGESTED is the current-
    // opportunity slice of it: 14,765 of 82,960 rows on the pilot date.
    //
    // Stated as source-defined rather than as a day count because no date
    // range describes it. Records in this file close years out; a publication
    // cut-off would discard them for having been posted early.
    window: {
      kind: 'source-defined',
      days: null,
      note: 'the current-opportunity slice of the daily full extract (awards and lapsed notices excluded)',
    },
    pageSize: null, // single file
    maxPages: 1,
    rateLimitNote: 'One 251 MB file per refresh, never fetched more than once per run. No published quota.',
    // ── ACTIVATED ───────────────────────────────────────────────────────────
    //
    // Registered STAGED first — `enabled: false`, enforced in rebuildCorpus
    // rather than merely documented — and activated only once the gates were
    // green: the whole file fetched and parsed from the live endpoint, 14,765
    // current opportunities validated against the canonical schema with zero
    // rejections, dedup measured against the existing corpus, and every
    // failure mode proven to keep last-good (see sam-activation.test.cjs).
    readyState: 'ACTIVE',
    knownRestrictions: [
      'Active=Yes on all 82,960 rows; it means "not archived" and is never read as OPEN.',
      'The file carries ten contact-person columns; none is projected.',
      'Description is frequently an entire solicitation document and is not stored.',
      'The solicitation number is spelled `Sol#`, and 13,026 of them are borne by more than one notice.',
      'No modification stamp is published, so supersession relies on the notice id alone.',
    ],
  },
];

// Sources probed and NOT selected. Kept as data because "we checked and it
// does not work" is the finding most likely to be lost, and the one most
// likely to be re-litigated next quarter.
//
// SAM.gov used to head this list, on a finding about /opportunities/v2/search
// that was correct about that endpoint and wrong about the platform. It is now
// an active source; the entry is not deleted quietly but moved, with the
// correction recorded above.
const REJECTED_SOURCES = [
  { id: 'austender', name: 'AusTender', acquisition: 'BROWSER_REQUIRED', reason: 'Atom feed returns 403 to a non-browser client (WAF).' },
  { id: 'adb', name: 'Asian Development Bank', acquisition: 'BROWSER_REQUIRED', reason: 'Tender RSS returns 403 to a non-browser client (WAF).' },
  { id: 'ecepp', name: 'EBRD ECEPP', acquisition: 'BROWSER_REQUIRED', reason: 'API path returns 403 to a non-browser client (WAF).' },
  { id: 'nz-gets', name: 'New Zealand GETS', acquisition: 'PUBLIC_HTML', reason: 'No feed or API; search index is HTML only.' },
  { id: 'ungm', name: 'UN Global Marketplace', acquisition: 'PUBLIC_HTML', reason: 'Public notice list is HTML; search is an internal POST interface, not a documented reuse API.' },
  { id: 'gebiz', name: 'Singapore GeBIZ', acquisition: 'STRUCTURED_PUBLIC_DATA', reason: 'Open dataset publishes AWARDED tenders, not open opportunities. Wrong entity for this layer.' },
  { id: 'prozorro', name: 'Prozorro', acquisition: 'OFFICIAL_API', reason: 'Open API is a sequential changes feed; usable metadata needs one request per notice. Deferred on rate respect, not capability.' },
  { id: 'pncp', name: 'Brazil PNCP', acquisition: 'OFFICIAL_API', reason: 'API responds but returned no records for the probed current window; needs a further access study before selection.' },
];

const SOURCE_BY_ID = new Map(SOURCES.map((s) => [s.id, s]));

// A source may only publish what its reuse class allows. Called by the
// normalizer so the policy is enforced in code rather than remembered.
function mayStoreDescription(sourceId) {
  const s = SOURCE_BY_ID.get(sourceId);
  return Boolean(s) && s.storage === 'FULL_METADATA';
}

// Strip anything matching the forbidden-field patterns from a raw record.
//
// RECURSIVE, because the shape that actually carries the risk is nested: OCDS
// puts the officer's address inside parties[].contactPoint.email, three levels
// down. A top-level-only strip would have looked correct against the World
// Bank's flat payload and quietly passed every UK contact through.
//
// Returns a new structure; the original is untouched so the adapter layer
// stays honest about what arrived.
function stripPersonalFields(raw) {
  if (Array.isArray(raw)) return raw.map(stripPersonalFields);
  if (!raw || typeof raw !== 'object') return raw;
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (FORBIDDEN_FIELD_PATTERNS.some((re) => re.test(k))) continue;
    out[k] = stripPersonalFields(v);
  }
  return out;
}

// ── REDACTION, NOT REJECTION ────────────────────────────────────────────────
//
// Buyers write contact addresses into free-text descriptions. The pilot found
// six UK notices doing it in a single window. The first version of this
// pipeline REJECTED those notices, which is the wrong trade: it protected the
// officer's address by throwing away a real, open procurement opportunity that
// a supplier might have wanted.
//
// Structured contact FIELDS are dropped — nobody needs a contact database.
// An address that appears inside prose is redacted in place, and the rest of
// the sentence survives. The notice stays, the person does not.
const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/g;
// Deliberately conservative: long digit runs in procurement prose are usually
// reference numbers, budgets or CPV codes, so only internationally-formatted
// numbers with a + prefix are treated as telephone numbers.
const PHONE_RE = /\+\d[\d\s().-]{7,}\d/g;

function redactPersonalText(value) {
  if (typeof value !== 'string') return value;
  return value.replace(EMAIL_RE, '[contact removed]').replace(PHONE_RE, '[contact removed]');
}

// ── HOW SHORT A "SHORT SUMMARY" IS ──────────────────────────────────────────
//
// Part 32 permits a short source-derived summary and forbids mirroring the
// solicitation document. The pilot found a UK notice whose description field
// was 32,212 characters — the full specification, pasted into a metadata
// field. Storing it whole would have been mirroring the document by accident
// rather than by intent, which is the same outcome.
//
// 400 characters is enough to tell a supplier what the procurement is about
// and nowhere near enough to substitute for reading the notice. Truncation is
// marked so a reader knows the text continues at the source.
const SUMMARY_MAX_CHARS = 400;

function shortSummary(text) {
  if (typeof text !== 'string') return null;
  const clean = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  if (clean.length <= SUMMARY_MAX_CHARS) return clean;
  // Cut on a word boundary so the summary does not end mid-word.
  const cut = clean.slice(0, SUMMARY_MAX_CHARS);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > SUMMARY_MAX_CHARS * 0.6 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

// A source may be registered, governed and adapter-complete without being
// ingested. `enabled: false` says so out loud, so the registry stays truthful
// about which sources actually contribute records (Part 61).
const ENABLED = () => SOURCES.filter((s) => s.enabled !== false);

function sourceIds() { return ENABLED().map((s) => s.id); }
function allSourceIds() { return SOURCES.map((s) => s.id); }

module.exports = {
  ACQUISITION_MODES,
  REUSE_CLASSES,
  STORAGE_POLICIES,
  FORBIDDEN_FIELD_PATTERNS,
  SOURCES,
  REJECTED_SOURCES,
  SOURCE_BY_ID,
  sourceIds,
  allSourceIds,
  ENABLED,
  mayStoreDescription,
  stripPersonalFields,
  redactPersonalText,
  shortSummary,
  SUMMARY_MAX_CHARS,
  EMAIL_RE,
  PHONE_RE,
};
