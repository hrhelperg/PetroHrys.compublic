# Tender Opportunity — source policy

What each ingested source is, how it is accessed, what its published terms say,
and what this repository does and does not store as a result.

**This is an engineering and research classification, not legal advice.** Where
an operator's own documents disagree with each other, the classification is
`UNCLEAR` and the storage policy tightens. It does not resolve in our favour.

The machine-readable version of everything below is `scripts/lib/to-sources.cjs`,
which the ingester and the tests both read. This file explains it; that file
enforces it.

---

## How a source qualifies

Two questions, both answered by evidence rather than reputation:

1. **Can it be accessed without circumvention?** No bypassing authentication,
   CAPTCHAs, WAFs or rate limits. If a source answers 403 to a plain HTTP
   client, that is the operator declining, and the answer is taken.
2. **Do its published terms permit what we intend to store?** Metadata and a
   link, always; description text only where reuse terms are clear.

Fourteen candidates were probed for v1; five qualified. Phase 2 probed
twenty-one more and added three. Phase 3 probed sixty-five and added one active
source plus one adapter-ready.

**9 active sources from ~100 probed candidates — a 9% qualification rate.**
The full Phase 3 blocker taxonomy is in `TENDER-OPPORTUNITY-PHASE3.md`.

## Acquisition modes

`OFFICIAL_API` · `OFFICIAL_FEED` · `OFFICIAL_EXPORT` · `STRUCTURED_PUBLIC_DATA`
· `PUBLIC_HTML` · `BROWSER_REQUIRED` · `LOGIN_REQUIRED` · `MANUAL_ONLY` ·
`NOT_SUITABLE` · `UNKNOWN`

Preference order is API → official structured data → official export →
structured public endpoint → public HTML. **No source in this pilot is scraped
from HTML.** Browser automation is not used anywhere.

## Reuse classification

`PERMITTED` · `LIKELY_PERMITTED` · `UNCLEAR` · `RESTRICTED` · `UNKNOWN`

Storage follows from it:

| Reuse | Storage | What that means |
|---|---|---|
| PERMITTED / LIKELY_PERMITTED | `FULL_METADATA` | factual metadata plus a short summary |
| UNCLEAR / RESTRICTED | `MINIMAL_METADATA` | identity, buyer, dates, codes, link — **no description text** |

A test asserts the second row: a source classified `UNCLEAR` that stores full
metadata fails the build.

---

## The five selected sources

### TED — Tenders Electronic Daily

| | |
|---|---|
| Platform | `eu-ted` |
| Access | `OFFICIAL_API` — `POST https://api.ted.europa.eu/v3/notices/search` |
| Auth | none |
| Reuse | **PERMITTED** — notices "can be freely reused, for commercial or non-commercial purposes"; content CC BY 4.0, metadata CC0 1.0 |
| Attribution | required, given on the page |
| robots.txt | none served on the API host; this is an API client, not a crawler |
| Window | notices published in the last **1 day**, `scope=ACTIVE`, contract notices only |
| Stored | publication number, official title in 24 languages, buyer, country, CPV, per-lot deadlines, lot count, procedure type, published value |
| Not stored | notice PDFs, notice HTML, attachments — linked only |
| Rate | sequential, 250/page, hard page cap |

Award and prior-information notices are excluded at query level. They are half
of TED's daily output and neither is an opportunity a supplier can bid on.

### Find a Tender (FTS) — United Kingdom

| | |
|---|---|
| Platform | `uk-find-a-tender` |
| Access | `OFFICIAL_API` — `GET /api/1.0/ocdsReleasePackages` (OCDS 1.1) |
| Auth | none |
| Reuse | **LIKELY_PERMITTED** — Open Government Licence v3.0 |
| Window | releases updated in the last **3 days** |
| Stored | OCID, title, description summary, buyer, NUTS region, CPV, tender period end, lots, framework flag, **electronic submission policy**, submission route |
| Not stored | `parties[].contactPoint` — officer name, email, phone |
| Rate | 1.5 s between requests |

The only source publishing electronic-submission policy and a submission route
**per notice**. It returned HTTP 429 during the pilot at a 250 ms cadence; the
gap was widened to 1.5 s in response.

### CanadaBuys / AchatsCanada

| | |
|---|---|
| Platform | `ca-canadabuys` |
| Access | `OFFICIAL_EXPORT` — one open-data CSV, ~6 MB, refreshed daily |
| Auth | none |
| Reuse | **PERMITTED** — Open Government Licence – Canada |
| Window | the published open-notice set (the file *is* the window) |
| Stored | reference number, official EN and FR titles, buyer, province (ISO 3166-2), UNSPSC, GSIN, closing date, solicitation number, amendment number |
| Not stored | six contact columns: name, email, phone, fax and two addresses |

OGL-Canada explicitly excludes personal information from what it licenses. The
licence and this repository's policy agree, and the columns are dropped.

### World Bank Group Procurement Notices

| | |
|---|---|
| Platform | `int-world-bank-group-procurement` (project-financed surface) |
| Access | `OFFICIAL_API` — `GET https://search.worldbank.org/api/v2/procnotices` |
| Auth | none |
| Reuse | **UNCLEAR** |
| Storage | **MINIMAL_METADATA** |
| Window | the 1,000 most recent notices, by notice date |
| Stored | notice id, title, buyer organisation, project country, project id, dates, procurement method, notice type, link |
| Not stored | `bid_description`, `notice_text`, and contact name / email / phone |

**Why UNCLEAR.** The World Bank Data Catalog states CC BY 4.0 as the default
for Bank-produced datasets, permitting commercial reuse with attribution. The
Bank's general Terms & Conditions state that derivative works and commercial
use — naming API-facilitated commercial applications specifically — require
prior written consent. Two published positions by one institution, pointing
opposite ways, and this site is commercial.

The consequence is visible on the page: World Bank rows carry no summary.
`notice_text` is a complete HTML solicitation document and is never stored.

`country` here is the **project** country, not the Bank's. The Bank is the
financier; the buyer is a borrower ministry or agency.

### SECOP II — Colombia

| | |
|---|---|
| Platform | `co-secop-ii` |
| Access | `STRUCTURED_PUBLIC_DATA` — Socrata dataset `p6dx-8zbt` on datos.gov.co |
| Auth | none (an app token raises quota; it is not required) |
| Reuse | **LIKELY_PERMITTED** — national open-data portal, Ley 1712 de 2014 |
| robots.txt | **relevant** — `Crawl-delay: 1`, honoured; `/browse` disallowed and never touched |
| Window | published in the last **7 days**, open procedures, competitive modalities only |
| Stored | process id, title, description summary, buying entity, UNSPSC, base price (COP), phase, lot count, process URL |
| Not stored | supplier/award fields for procedures already decided |

Three window qualifiers, all load-bearing:

- **7 days** because the dataset lags: on the pilot date its newest publication
  was two days old, and a 1-day window returned 32 records where a 2-day window
  returned 7,709.
- **open** because the portal itself says so
  (`estado_de_apertura_del_proceso = 'Abierto'`).
- **competitive** because 7,075 of 7,709 open notices in two days were
  `Contratación directa` or `Contratación régimen especial` — awards made
  without a competition. Listing those as opportunities would be listing
  decisions as invitations. The `(con ofertas)` variants of both are kept.

This source publishes **no submission deadline at all**. Not a null column:
none. It is why status resolution puts the source's own word first.

### TenderNed — Netherlands *(Phase 2)*

| | |
|---|---|
| Platform | `nl-tenderned` |
| Access | `OFFICIAL_API` — `GET /papi/tenderned-rs-tns/v2/publicaties` |
| Auth | none |
| Reuse | **LIKELY_PERMITTED** — statutory Dutch publication register, public unauthenticated API; no explicit licence text published against the API |
| Window | published in the last **3 days** (~200 notices of 145,058 total) |
| Stored | publication id, title, description, buyer, closing date, procedure, publication status, buyer reference, EU-wide flag |
| Not stored | no CPV is published on the list endpoint; contract nature is not filed as one |

Added because it publishes `europees: true` on notices that also go to the
Official Journal. v1 had **zero** cross-source duplicates and could only test
the merge graph against fixtures; TenderNed and BOAMP are in the corpus so that
the graph has real cross-publication to resolve.

Deadlines are published without a time zone and are treated accordingly.

### BOAMP — France *(Phase 2)*

| | |
|---|---|
| Platform | `fr-boamp` |
| Access | `OFFICIAL_API` — Opendatasoft Explore v2.1, 1.7 M records |
| Auth | none |
| Reuse | **LIKELY_PERMITTED** — boamp.fr states site-wide "tous les contenus de ce site sont sous licence etalab-2.0" (Licence Ouverte 2.0); the dataset metadata itself declares no licence field, which is why this is not PERMITTED |
| Attribution | required |
| Window | published in the last **3 days** (~880 notices) |
| Stored | idweb, objet, buyer, publication and response-deadline dates, notice nature, procedure, EU-wide flag (`famille: JOUE`) |
| Not stored | **no classification** — see below |

BOAMP's flat record carries `descripteur_code`, which is BOAMP's own descriptor
vocabulary and not CPV. The real CPV sits inside `donnees`, an eForms document
serialised to JSON under a single `EFORMS` key whose internal path varies by
schema version. Guessing at that path would produce a classification that is
right until the schema moves and wrong silently, so BOAMP records carry none
and matching falls back to title terms with `NO_CLASSIFICATION` shown.

Department numbers are INSEE codes, not ISO 3166-2 subdivisions, and are not
stored as though they were.

### eTender Publication Portal — South Africa *(Phase 2)*

| | |
|---|---|
| Platform | `za-etender-publication-portal` |
| Access | `OFFICIAL_API` — OCDS releases, via the **shared OCDS adapter** |
| Auth | none |
| Reuse | **PERMITTED** — PDDL 1.0, a public domain dedication, declared by the API in every response package |
| Window | published in the last **21 days** |
| Stored | ocid, title, description, buyer, tender period, method, value where non-zero |
| Not stored | `contactPerson`, present on every release |

The first source built on the reusable OCDS adapter rather than a bespoke one.
That matters more than the record count: South Africa, Moldova, Paraguay,
Uganda, Kenya and Georgia all emit the same format, so the next OCDS publisher
is a configuration block rather than a new file.

### Contracts Finder — United Kingdom *(Phase 3)*

| | |
|---|---|
| Platform | `uk-contracts-finder` |
| Access | `OFFICIAL_API` — OCDS 1.1, via the shared OCDS adapter (`publishedFromCursor`) |
| Auth | none |
| Reuse | **PERMITTED** — Open Government Licence v3.0, declared in every API response package, publisher "Cabinet Office" |
| Window | published in the last **3 days**, `stages=tender` |
| Stored | ocid, title, description, buyer, tender period, CPV, declared value, procurement method |

Added for what it adds beyond Find a Tender rather than for a second UK entry:
**below-threshold** procurement that never reaches the Official Journal or FTS,
plus CPV and real contract values. It also overlaps FTS on above-threshold
notices, which gives deduplication a second live cross-source pair.

### Datenservice Öffentlicher Einkauf — Germany *(Phase 3, ADAPTER-READY)*

| | |
|---|---|
| Platform | **none — this is why it is not active** |
| Access | `OFFICIAL_EXPORT` — one ZIP archive per published day |
| Auth | none |
| Reuse | **LIKELY_PERMITTED** — federal open notice service, no restrictive licence found |
| Window | last **3 days**, one archive each |
| State | `ADAPTER_READY_PLATFORM_MISSING` — written, verified against 1,153 real releases, **not ingesting** |

Blocked on referential integrity, not capability. `oeffentlichevergabe.de` has
no canonical `TenderPlatform` record; the closest, `de-evergabe-bund`, is
evergabe-online.de — the federal e-procurement *platform*, a different system
from the federal *notice service*. Part 43 forbids a source auto-creating a
platform.

Two probe findings worth recording:

- Only ZIP content types are served; `application/json` returns **406**.
- The `ocds` variant publishes **no status and no deadline on any record** —
  ingesting it would have added 697 permanently-unusable German notices. The
  `ocds2` variant carries `tender.status` and lot-level deadlines and is the
  one the adapter reads.

---

## Probed and not selected

| Source | Mode | Why not |
|---|---|---|
| SAM.gov | `LOGIN_REQUIRED` | needs an api.data.gov key; none available here, and v1 is not blocked on one vendor |
| AusTender | `BROWSER_REQUIRED` | Atom feed returns 403 to a non-browser client |
| Asian Development Bank | `BROWSER_REQUIRED` | tender RSS returns 403 |
| EBRD ECEPP | `BROWSER_REQUIRED` | API path returns 403 |
| New Zealand GETS | `PUBLIC_HTML` | no feed or API; HTML index only |
| UNGM | `PUBLIC_HTML` | public list is HTML; search is an internal POST interface, not a documented reuse API |
| Singapore GeBIZ | `STRUCTURED_PUBLIC_DATA` | the open dataset publishes **awarded** tenders, not open opportunities — wrong entity for this layer |
| Prozorro | `OFFICIAL_API` | open API is a sequential changes feed; `opt_fields` yields only status and tender id, so usable metadata needs **one request per notice** |
| Brazil PNCP | `OFFICIAL_API` | responds, but returned no records for the probed window; needs a further access study |
| Norway Doffin | `LOGIN_REQUIRED` | API returns 401 without a key *(Phase 2)* |
| Spain PLACSP | `UNKNOWN` | ATOM syndication host did not resolve from this environment; needs re-probing *(Phase 2)* |
| Portugal BASE | `UNKNOWN` | documented REST paths returned 404 *(Phase 2)* |
| Ireland eTenders | `UNKNOWN` | OCDS path returned 404 *(Phase 2)* |
| Italy ANAC | `STRUCTURED_PUBLIC_DATA` | CKAN catalogue reachable; the open datasets are awards and contracts rather than open notices, and need a dataset study *(Phase 2)* |
| Lithuania, Estonia, Denmark, Philippines, Albania | `UNKNOWN` | probed API paths returned 404 *(Phase 2)* |
| Greece, Uganda, Nigeria, Mexico | `UNKNOWN_FROM_CURRENT_EGRESS` | hosts did not resolve; re-probed in Phase 3 with the same result. Not a capability judgement |

### Phase 3 re-audit of every previously deferred source

Each was re-probed because access conditions change. None had.

| Source | Phase 3 verdict | Evidence |
|---|---|---|
| SAM.gov | `STILL_DEFERRED` | 404 without a key; no key in this environment |
| AusTender | `STILL_DEFERRED` | Atom feed still 403 |
| ADB | `STILL_DEFERRED` | tender RSS still 403 |
| EBRD ECEPP | `STILL_DEFERRED` | returns HTML, not data |
| NZ GETS | `NOT_SUITABLE` | HTML only |
| UNGM | `NOT_SUITABLE` | HTML only |
| Singapore GeBIZ | `NOT_SUITABLE` | dataset is awards; newest record predates the current window |
| Prozorro | `STILL_DEFERRED` | feed is current and reachable, but still one request per notice for usable metadata |
| Brazil PNCP | `STILL_DEFERRED` | request timed out; needs a further access study |

### Phase 3 new rejections

| Source | Class | Evidence |
|---|---|---|
| Moldova MTender | `STALE_OR_HISTORICAL` | responds; newest record **2018** |
| Poland eZamówienia | `STALE_OR_HISTORICAL` | responds; newest record **2024** |
| Norway Doffin | `AUTH_REQUIRED` | 401 without a key |
| Paraguay DNCP | `STILL_DEFERRED` | OCDS and current, but 10 items/page over 1,000 pages; status not populated |
| Spain PLACSP, Uruguay, service.bund.de | `NON_JSON_STRUCTURED` | ATOM/XML; needs a parser, not a blocker |
| Chile, Argentina, Philippines, Tanzania, Kenya, Italy ANAC, Denmark, Belgium, AIIB | `HTML_NOT_DATA` | endpoint returns a page, not a dataset |
| Indonesia INAPROC, IADB, AfDB | `WAF` | 403 to a non-browser client |
| Korea KONEPS, India CPPP, Vietnam, Rwanda, Ghana, Hungary, Slovenia, Croatia, Czechia, Finland, Estonia, Lithuania, Switzerland, Sweden, Ireland, Portugal, Brazil ComprasNet, UNDP, UNOPS, World Bank corporate | `HTTP_FAIL` | documented or guessed paths return 404/400/500 |
| Georgia, Peru, Ecuador, Ghana | `UNKNOWN_FROM_CURRENT_EGRESS` | host did not resolve |

Prozorro is deferred on **rate respect, not capability**. Assembling a bounded
current window would mean thousands of individual requests against a public
service to obtain what the other four hand over in one paginated call. It is
reversible the moment a bulk endpoint exists.

---

## Rules that apply to every source

**Personal data.** Structured contact fields are dropped before normalization,
recursively — OCDS nests the officer three levels down, inside
`parties[].contactPoint.email`, and a top-level-only strip would have passed
every UK contact through. Contact details appearing inside prose are
**redacted in place**, not used as grounds to reject the notice: six UK notices
carried an address in the description field, and discarding a real open
procurement to avoid republishing an email is the wrong trade.

**Document mirroring.** No solicitation document, PDF or attachment is
downloaded or stored. Summaries are capped at 400 characters — one pilot notice
had a 32,212-character "description", which is a specification pasted into a
metadata field, and storing it whole would have been mirroring the document by
accident rather than by intent.

**Rate discipline.** Every request is sequential; there is no concurrency
anywhere. Retries are bounded to three with exponential backoff, and a 4xx is
never retried — a 403 is an answer, not an obstacle.

**No circumvention.** No CAPTCHA solving, no WAF evasion, no authentication
bypass, no private-API reverse engineering, no automated registration or bid
submission. Public discovery and verification only.

**Attribution.** Every source requiring attribution is credited on the page.
