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

Fourteen candidates were probed by issuing real requests. Five qualified.

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
