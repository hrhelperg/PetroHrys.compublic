# Release — Wave 1: United States Government Registries

**Branch:** `feat/business-directories-wave-1-government-registries`
**Head:** `06e5082`
**Baseline:** `origin/main` @ `8c05c55` (7 ahead, 0 behind)
**Date:** 2026-08-04
**Type:** Additive. Statutory and government registries for the United States.

> **This is the United States portion of Wave 1 only.** Wave 1 as a programme —
> government and statutory registries generally — is **not complete**. No other
> country's registry layer is in this release, and United States state coverage
> itself is partial: see [State coverage](#state-coverage).

---

## Totals

|  | Before (origin/main) | After |
| --- | --- | --- |
| Records | 72 | 130 |
| United States records | 4 | 62 (28 federal-level, 34 subnational) |
| Generated pages | 139 | 199 |
| Sitemap URLs | 139 | 199 |
| RSS items | 72 | 130 |
| Tests | 366 | 595 |

Net **+58 records**: 24 federal-level and 34 subnational.

---

## What ships

### Federal systems added (24)

- `us-usaspending` — USAspending.gov (U.S. Department of the Treasury, Bureau of the Fiscal Service)
- `us-sam-entity-information` — SAM.gov Entity Information (U.S. General Services Administration, Integrated Award Environment)
- `us-fdic-bankfind` — FDIC BankFind Suite (Federal Deposit Insurance Corporation)
- `us-occ-institution-search` — OCC Financial Institution Search (Office of the Comptroller of the Currency)
- `us-sec-iapd` — Investment Adviser Public Disclosure (U.S. Securities and Exchange Commission)
- `us-fincen-msb` — FinCEN MSB Registrant Search (Financial Crimes Enforcement Network, U.S. Department of the Treasury)
- `us-nfa-basic` — NFA BASIC (National Futures Association)
- `us-nppes-npi` — NPPES NPI Registry (Centers for Medicare & Medicaid Services, U.S. Department of Health and Human Services)
- `us-fda-device-establishments` — FDA Establishment Registration and Device Listing (U.S. Food and Drug Administration, Center for Devices and Radiological Health)
- `us-irs-teos` — Tax Exempt Organization Search (Internal Revenue Service, Tax Exempt and Government Entities Division)
- `us-uspto-patent-public-search` — Patent Public Search (United States Patent and Trademark Office, U.S. Department of Commerce)
- `us-dmca-agent-directory` — DMCA Designated Agent Directory (U.S. Copyright Office, Library of Congress)
- `us-ttb-permittees` — TTB List of Permittees (Alcohol and Tobacco Tax and Trade Bureau, U.S. Department of the Treasury)
- `us-cbp-customs-brokers` — Permitted Customs Brokers Listing (U.S. Customs and Border Protection, Office of Trade, U.S. Department of Homeland Security)
- `us-fmc-oti-list` — Federal Maritime Commission Ocean Transportation Intermediary List (Federal Maritime Commission, Bureau of Certification and Licensing)
- `us-fcc-uls` — FCC Universal Licensing System (Federal Communications Commission, Wireless Telecommunications Bureau)
- `us-fcc-form-499` — FCC Form 499 Filer Database (Federal Communications Commission, Consumer and Governmental Affairs Bureau)
- `us-faa-aircraft-registry` — FAA Aircraft Registry (Federal Aviation Administration, Civil Aviation Registry)
- `us-msha-mdrs` — MSHA Mine Data Retrieval System (Mine Safety and Health Administration, U.S. Department of Labor)
- `us-fsis-mpi-directory` — FSIS Meat, Poultry and Egg Product Inspection Directory (Food Safety and Inspection Service, U.S. Department of Agriculture)
- `us-sam-exclusions` — SAM.gov Exclusions (U.S. General Services Administration, Integrated Award Environment)
- `us-hhs-oig-leie` — HHS OIG List of Excluded Individuals and Entities (Office of Inspector General, U.S. Department of Health and Human Services)
- `us-cftc-sanctions-in-effect` — CFTC Sanctions in Effect (Commodity Futures Trading Commission, Office of Proceedings)
- `us-fda-drug-establishments` — Drug Establishments Current Registration Site (U.S. Food and Drug Administration, Center for Drug Evaluation and Research)

### Exclusion and debarment systems (3)

A register of who is **barred** is not a register of who exists, and it needed its
own type rather than being filed as a company register. Absence from these lists
means only absence: no record in this release describes a non-match as evidence
of good standing or trustworthiness.

- `us-sam-exclusions` — SAM.gov Exclusions (U.S. General Services Administration, Integrated Award Environment)
- `us-hhs-oig-leie` — HHS OIG List of Excluded Individuals and Entities (Office of Inspector General, U.S. Department of Health and Human Services)
- `us-cftc-sanctions-in-effect` — CFTC Sanctions in Effect (Commodity Futures Trading Commission, Office of Proceedings)

### State, district and territory systems added (34)

31 states, 1 federal district, 2 territories.

| Jurisdiction | Registry | Record |
| --- | --- | --- |
| Arkansas | Business Entity Search | `us-arkansas-business-entity-search` |
| California | Business Search | `us-california-business-search` |
| Colorado | Business Database Search | `us-colorado-business-database-search` |
| Connecticut | Business Records Search | `us-connecticut-business-records-search` |
| Delaware | Search for a Business Entity | `us-delaware-entity-search` |
| Florida | Sunbiz | `us-florida-sunbiz-search` |
| Hawaii | Hawaii Business Entity Search | `us-hawaii-business-name-search` |
| Idaho | SOSBiz | `us-idaho-sosbiz-search` |
| Iowa | Business Entities Search | `us-iowa-business-entities-search` |
| Kansas | Business Search | `us-kansas-business-search` |
| Kentucky | Business Entity Search | `us-kentucky-business-entity-search` |
| Louisiana | Search for Louisiana Business Filings | `us-louisiana-business-filings-search` |
| Maine | Corporate Name Search (ICRS) | `us-maine-corporate-name-search` |
| Maryland | Business Entity Search | `us-maryland-business-entity-search` |
| Massachusetts | Search for a Business Entity | `us-massachusetts-business-entity-search` |
| Minnesota | Search Business Filings | `us-minnesota-business-filings-search` |
| Montana | Business Filing Portal | `us-montana-business-search` |
| Nebraska | Corporate & Business Search | `us-nebraska-corporate-business-search` |
| Nevada | Business Entity Search | `us-nevada-business-entity-search` |
| New Jersey | Business Records Service | `us-new-jersey-business-records-service` |
| New York | Corporation and Business Entity Database | `us-new-york-corporation-entity-database` |
| North Carolina | Business Registration search | `us-north-carolina-business-registration-search` |
| North Dakota | FirstStop | `us-north-dakota-firststop-business-search` |
| Oregon | Business Name Search | `us-oregon-business-registry-search` |
| Rhode Island | Search for an entity within the RI Business Portal (CIMS) | `us-rhode-island-corporate-database` |
| South Dakota | Business Information Search | `us-south-dakota-business-search` |
| Tennessee | Business Entity Search | `us-tennessee-business-information-search` |
| Texas | SOSDirect | `us-texas-sosdirect-business-search` |
| Washington | Corporations and Charities Filing System (CCFS) | `us-washington-ccfs` |
| West Virginia | Business Organization Search | `us-west-virginia-business-organization-search` |
| Wisconsin | Corporate Registration Information System (CRIS) | `us-wisconsin-corporate-registration-search` |
| District of Columbia | CorpOnline | `us-dc-corponline` |
| Puerto Rico | Registro Electrónico de Corporaciones y Entidades | `us-puerto-rico-registro-corporaciones` |
| United States Virgin Islands | Catalyst | `us-us-virgin-islands-corporate-registry` |

---

## State coverage

**Official business registry coverage is available for 31 of 50 states; 19 states remain pending verification.**

That sentence appears on the United States page itself, derived at build time from
`data/business-directories/united-states-jurisdiction-coverage.json` and the
records actually published. It is not written down anywhere as a literal, and a
test fails if the page and the data disagree.

All 50 states, the federal district and all 5 inhabited territories were **researched**.
None was rejected. Every unpublished jurisdiction is unpublished for one reason:
**nobody has observed its search behave**, because the register blocked automated
access. Identity and operator are frequently confirmed; access terms are not, and
this project does not publish an access position nobody has seen.

### Pending states (19)

| Code | State | Candidate registry | Blocker |
| --- | --- | --- | --- |
| US-AL | Alabama | Government Records Inquiry System | But the search application itself (arc-sos.state.al.us) refused or timed out every connection from two independent network paths, so I cannot honestly record whether it is open, free, CAPTCH |
| US-AK | Alaska | Corporations Database | But no Division of Corporations surface could be read: one host WAF-403s and the other serves an F5/Shape JavaScript challenge. The product name, searchable fields, fees, document availabili |
| US-AZ | Arizona | Arizona Business Center | But the exact official product name, the searchable fields, the entity types covered, and whether the search is free and login-free could not be read from any official page: the search app i |
| US-GA | Georgia | _not established_ | BLOCKER: the search application at https://ecorp.sos.ga.gov/BusinessSearch is gated by a Cloudflare JavaScript/cookie interstitial that returns HTTP 403 to every non-browser client, includin |
| US-IL | Illinois | Illinois Secretary of State Business Entity Search | Operator and canonical search URL are confirmed on an official State of Illinois page, but the search application itself returned HTTP 403 from Akamai on every attempt and every user agent,  |
| US-IN | Indiana | Business Search | Operator, division and canonical search URL are confirmed from the Secretary of State's own official pages, and the AWS WAF blocker is precisely characterised. But the search application nev |
| US-MI | Michigan | MiBusiness Registry Portal | But no search interface was ever reachable, so entity coverage, search fields, result fields, document availability and fees are all unverified, and the exact bureau/division within LARA cou |
| US-MS | Mississippi | Business Search | But the principal search screen returned HTTP 403 from an Akamai WAF on every attempt across two independent fetch paths, so its exact heading, its official product name, its search fields,  |
| US-MO | Missouri | Business Search | Operator, unit, entity coverage and the office-cited search URL are confirmed from an official Secretary of State page, but the search application itself never rendered and the office's own  |
| US-NH | New Hampshire | _not established_ | Precise blocker: every New Hampshire official surface carrying substantive description returns HTTP 403 (Akamai on www.sos.nh.gov and www.nh.gov; the state edge on quickstart.sos.nh.gov) or  |
| US-NM | New Mexico | Business Services Online Filings Portal | But the register's public accessibility is genuinely unresolved: every portal path returns an edge-level 403, so it cannot be confirmed whether searching is free, login-free or CAPTCHA-free, |
| US-OH | Ohio | Ohio Secretary of State Business Search | Only the operator and the canonical hostname are verified, both from the office's own branded challenge page. Every substantive official surface — the search app, the business services pages |
| US-OK | Oklahoma | Business Entities Search | I could not resolve which is true because Turnstile prevented me from reaching a result. A human should complete one search in a browser and record exactly which fields appear free on the cl |
| US-PA | Pennsylvania | Business Entity Search | Precise blocker: file.dos.pa.gov serves a Cloudflare interactive challenge (HTTP 403, "Just a moment... |
| US-SC | South Carolina | _not established_ | BLOCKER: two independent access failures. (1) All South Carolina Secretary of State and state-portal pages are served through an Amazon CloudFront distribution that explicitly geo-blocks thi |
| US-UT | Utah | _not established_ | Blocked on every readable surface. The one solid finding is negative but valuable — the classic secure.utah.gov/bes search URL is retired and 301s to a Cloudflare-protected registration port |
| US-VT | Vermont | _not established_ | Precise blocker: bizfilings.vermont.gov is a pure Angular SPA that serves an identical 4,574-byte shell on every route, so the search form's fields, the result layout, the entity types cover |
| US-VA | Virginia | _not established_ | BLOCKER: two independent access failures. (1) The Commission's web estate is served through an Amazon CloudFront distribution that explicitly geo-blocks this vantage — verified from the Clou |
| US-WY | Wyoming | _not established_ | Complete network unreachability from this environment across both egress paths, multiple user agents and repeated retries. No official Wyoming page was read, so the product name, operator, s |

### Pending territories (3)

| Code | Territory | Candidate registry | Blocker |
| --- | --- | --- | --- |
| US-GU | Guam | _not established_ | The responsible operator is verified from official guam.gov sources (Department of Revenue and Taxation, General Licensing and Registration / Business License Branch), but the registry's own |
| US-MP | Northern Mariana Islands | Office of the Registrar of Corporations | The statutory register and the responsible operator are both verified from an official CNMI government surface, but there is no public online entity search in existence — the official roadma |
| US-AS | American Samoa | _not established_ | The responsible offices are verified — the Territorial Registrar within the Department of Legal Affairs records articles of incorporation under ASCA 30.0202, and the Department of Commerce a |

Each of these carries a full backlog entry in the coverage manifest: candidate URL
(or an explicitly-flagged unverified lead where no official page confirms one),
operator, exact blocker, the fields already confirmed, the fields still unknown,
and the manual browser steps that would unblock it.

---

## Alabama and Mississippi

Both were authored as records during Wave 1B and both were **withdrawn before
release**. Their research verdict is `pending-manual-verification`.

**Alabama** — `https://arc-sos.state.al.us/CGI/CORPNAME.MBR/INPUT`
Operator: Office of the Alabama Secretary of State, Business Entity Division (Business Entities Division)
Blocker: But the search application itself (arc-sos.state.al.us) refused or timed out every connection from two independent network paths, so I cannot honestly record whether it is open, free, CAPTCHA-protected, or what its result fields contain.

**Mississippi** — `https://corp.sos.ms.gov/corp/portal/c/page/corpBusinessIdSearch/portal.aspx`
Operator: Mississippi Secretary of State, Business Services Division
Blocker: But the principal search screen returned HTTP 403 from an Akamai WAF on every attempt across two independent fetch paths, so its exact heading, its official product name, its search fields, whether it charges, and what a result record displays are all unread.

Neither is published on the strength of identity, operator, vendor similarity to
another state, or the registry probably existing. A record is publishable when
someone has run a search and recorded what happened, and not before.

---

## Model changes

### Jurisdiction model

`jurisdiction { type, name, code, parentCountry }` on any subnational record,
with the code validated structurally against ISO 3166-2. One code names exactly
one place across the whole dataset; a second record for the same jurisdiction is
allowed, a second *name* for the same code is not.

Scope gained `subnational` and `supranational` alongside `global`,
`national` and `regional`. Current distribution: global 53, regional 1, national 42, subnational 34.

### Registry taxonomy

19 types, each with a definition, an inclusion rule, a boundary against the
neighbouring types, and worked examples. 17 are in use. A second type on one
record is permitted only where official evidence supports both functions — the
evidence for every such assignment in this release is recorded alongside it.

### Public access model

`publicAccess` records `accessLevel`, `freeToSearch`, `loginRequired`,
`identityVerificationRequired`, `captcha`, `geographicRestriction`,
`paidDocumentsAvailable` and a note, with `accessContradictions()` refusing
combinations that cannot both be true. `unknown` is a first-class access level.

**An unknown is null.** Never 0, never false, never an assumption borrowed from a
neighbouring state. 1 subnational records carry `accessLevel: unknown`;
4 carry `freeToSearch: null`. Texas is recorded as `login-required` with
`freeToSearch: false`, because its own page states *"There is a $1.00
statutorily authorized fee associated with each search"*.

### Shared official host model

`resourceIdentity { canonicalDomain, systemKey, sharedHostGroup }` lets two
genuinely different registers share one official hostname without either being
treated as a duplicate of the other:

- **sam-gov** — `us-sam-entity-information`, `us-sam-exclusions`
- **fda-accessdata** — `us-fda-device-establishments`, `us-fda-drug-establishments`

---

## Data policy

### Open-source-only evidence

No paid API, no API key, no bearer token, no commercial database, no unofficial
mirror, and no search snippet used as evidence. The build is offline and
deterministic: it makes no network request, and running it twice writes nothing
the second time.

### Frozen historical Domain Rating

64 records carry a Domain Rating. Every one is a frozen historical snapshot
(`metricsProvenance.domainRating.status === "historicalSnapshot"`) taken before
the open-source policy came into force, pinned by a SHA-256 digest that a test
recomputes on every run. **No record added in this release carries a Domain
Rating, authority score, traffic estimate or referring-domain count.** The two
United States records that do carry one (`us-bbb`, `us-uspto-trademark-search`)
predate Wave 1 and are unchanged.

---

## The United States page

The first genuinely grouped country page in the section: Federal, States, Federal
district, Territories, Other nationwide listings, each with its own table and its
own derived count, plus a jump nav. No state landing routes and no pagination.

Every count is computed from records. Column sets are derived per group, so the
States table does not render a Domain Rating column in which every row is empty.
Search, filtering and the result count operate across every group; sorting
reorders within a group and never moves a record between groups. The full record
set is present in the static markup, so the page works with JavaScript disabled.

---

## Known deferred candidates

- **19 states and 3 territories** — all blocked on observed search behaviour; full
  backlog in the coverage manifest.
- **Second registers where one jurisdiction runs two distinct systems.** Several
  research entries argue for a second record — Texas most strongly, where the free
  public search most people actually use is the Comptroller's Franchise Tax Account
  Status Search, a different operator and a different statutory register from the
  paywalled Secretary of State system. None is in this release.
- **Federal candidates identified but not authored** in Wave 1A, recorded in
  `docs/business-directories-verification-backlog.md`.

---

## Rollback

The release is a fast-forward from `origin/main`; nothing on main is rewritten.

```sh
# Undo the whole release, keeping the branch for later
git checkout main
git reset --hard origin/main

# Or drop a single commit from the branch before merge
git checkout feat/business-directories-wave-1-government-registries
git revert --no-commit <sha> && git commit

# Regenerate the site from whatever the data then says
node scripts/validate-business-directories.cjs
node scripts/migrate-business-directories.cjs
node scripts/build-business-directories.cjs
node --test "scripts/tests/*.test.cjs"
```

The generator owns every page it writes and prunes what it no longer owns, so
removing records and rebuilding removes their pages, their sitemap entries and
their feed items in the same pass. No manual cleanup step exists or is needed.

---

## Commits

- `06e5082` fix: remove raw fetch artefacts committed at repository root
- `26ec1ca` feat: add Wave 1B US state and territory registries
- `f3067bd` feat: complete Wave 1A federal registry coverage
- `ba7655a` feat: add Wave 1A US federal registries
- `e5aed4b` fix: complete Wave 1 jurisdiction integrity gate
- `a70fd83` feat: harden government registry foundation
- `b463741` feat(bd): Wave 1 foundation — jurisdiction, supranational scope, names, registry classification
