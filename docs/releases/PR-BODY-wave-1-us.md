## Wave 1 — United States government and statutory registries

Adds the United States registry layer to the Business Directories research
centre: 24 federal systems and 34 state, district and territory registers,
on a schema extended to describe statutory registers rather than commercial
directories.

> **The United States portion of Wave 1 only.** Wave 1 as a programme is not
> complete: no other country's registry layer is here, and US state coverage is
> **31 of 50**. See [Exactly what is missing](#exactly-what-is-missing).

|  | `origin/main` | This branch |
| --- | --- | --- |
| Records | 72 | 130 |
| United States | 4 | 62 (28 federal-level, 34 subnational) |
| Pages | 139 | 199 |
| Sitemap URLs | 139 | 199 |
| RSS items | 72 | 130 |
| Tests | 366 | 595 |

---

### Schema foundation

Records gained the fields a statutory register needs and a commercial directory
does not: `jurisdiction`, `officialName`/`nativeName`/`englishName` with a
provenance field, `primaryRegistryType`/`registryTypes`, `operator`,
`publicAccess`, and `resourceIdentity`. Unknown keys are rejected by path, so a
typo in a nested field cannot land silently. The migration is idempotent and is
projected on write, so adding a field does not stamp nulls across every record.

### Jurisdiction model

`jurisdiction { type, name, code, parentCountry }`, with the code validated
structurally against ISO 3166-2. One code names exactly one place across the
dataset: a second record for a jurisdiction is allowed, a second *name* for one
code is not. Scope gained `subnational` and `supranational` — now
global 53, regional 1, national 42, subnational 34.

### Registry taxonomy

19 types, each with a definition, an inclusion rule, a boundary against its
neighbours and worked examples. A second type on one record is allowed only
where official evidence supports both functions, and the evidence for every such
assignment travels with it.

### Public access model

`accessLevel`, `freeToSearch`, `loginRequired`,
`identityVerificationRequired`, `captcha`, `geographicRestriction`,
`paidDocumentsAvailable` and a note, with `accessContradictions()` refusing
combinations that cannot both hold.

**An unknown is `null`.** Never 0, never false, never borrowed from a
neighbouring state. 1 subnational records carry `accessLevel: unknown`
and 4 carry `freeToSearch: null`. Texas is `login-required` with
`freeToSearch: false`, because its own page states *"There is a $1.00
statutorily authorized fee associated with each search"*.

### US federal records (24)

- `us-usaspending` — USAspending.gov
- `us-sam-entity-information` — SAM.gov Entity Information
- `us-fdic-bankfind` — FDIC BankFind Suite
- `us-occ-institution-search` — OCC Financial Institution Search
- `us-sec-iapd` — Investment Adviser Public Disclosure
- `us-fincen-msb` — FinCEN MSB Registrant Search
- `us-nfa-basic` — NFA BASIC
- `us-nppes-npi` — NPPES NPI Registry
- `us-fda-device-establishments` — FDA Establishment Registration and Device Listing
- `us-irs-teos` — Tax Exempt Organization Search
- `us-uspto-patent-public-search` — Patent Public Search
- `us-dmca-agent-directory` — DMCA Designated Agent Directory
- `us-ttb-permittees` — TTB List of Permittees
- `us-cbp-customs-brokers` — Permitted Customs Brokers Listing
- `us-fmc-oti-list` — Federal Maritime Commission Ocean Transportation Intermediary List
- `us-fcc-uls` — FCC Universal Licensing System
- `us-fcc-form-499` — FCC Form 499 Filer Database
- `us-faa-aircraft-registry` — FAA Aircraft Registry
- `us-msha-mdrs` — MSHA Mine Data Retrieval System
- `us-fsis-mpi-directory` — FSIS Meat, Poultry and Egg Product Inspection Directory
- `us-fda-drug-establishments` — Drug Establishments Current Registration Site

### Exclusion and debarment (3)

A register of who is **barred** is not a register of who exists. It has its own
type, and nothing in this release reads a non-match as evidence of anything:

- `us-sam-exclusions` — SAM.gov Exclusions
- `us-hhs-oig-leie` — HHS OIG List of Excluded Individuals and Entities
- `us-cftc-sanctions-in-effect` — CFTC Sanctions in Effect

### Shared official hosts

`resourceIdentity { canonicalDomain, systemKey, sharedHostGroup }` lets two
genuinely different registers share one hostname without either being treated as
a duplicate:

- **sam-gov** — `us-sam-entity-information`, `us-sam-exclusions`
- **fda-accessdata** — `us-fda-device-establishments`, `us-fda-drug-establishments`

### State, district and territory coverage

31 states, 1 federal district, 2 territories.

**Official business registry coverage is available for 31 of 50 states; 19 states remain pending verification.**

That sentence renders on the United States page, derived at build time from
`data/business-directories/united-states-jurisdiction-coverage.json` and the
records actually published. It is a literal nowhere, and a test fails if the
page and the data disagree. Another refuses any wording on any page that implies
nationwide coverage while it is partial.

### Exactly what is missing

All 50 states, the district and all 5 inhabited territories were **researched**.
**None was rejected.** Every unpublished jurisdiction is unpublished for the same
reason: nobody has observed its search behave, because the register blocked
automated access. Identity and operator are often confirmed; access terms are
not, and this project does not publish an access position nobody has seen.

| Code | Jurisdiction | Candidate registry | Blocker |
| --- | --- | --- | --- |
| US-AL | Alabama | Government Records Inquiry System | But the search application itself (arc-sos.state.al.us) refused or timed out every connection from two independent network paths, so I cannot honestly |
| US-AK | Alaska | Corporations Database | But no Division of Corporations surface could be read: one host WAF-403s and the other serves an F5/Shape JavaScript challenge. The product name, sear |
| US-AZ | Arizona | Arizona Business Center | But the exact official product name, the searchable fields, the entity types covered, and whether the search is free and login-free could not be read  |
| US-GA | Georgia | _not established_ | BLOCKER: the search application at https://ecorp.sos.ga.gov/BusinessSearch is gated by a Cloudflare JavaScript/cookie interstitial that returns HTTP 4 |
| US-IL | Illinois | Illinois Secretary of State Business Entity Search | Operator and canonical search URL are confirmed on an official State of Illinois page, but the search application itself returned HTTP 403 from Akamai |
| US-IN | Indiana | Business Search | Operator, division and canonical search URL are confirmed from the Secretary of State's own official pages, and the AWS WAF blocker is precisely chara |
| US-MI | Michigan | MiBusiness Registry Portal | But no search interface was ever reachable, so entity coverage, search fields, result fields, document availability and fees are all unverified, and t |
| US-MS | Mississippi | Business Search | But the principal search screen returned HTTP 403 from an Akamai WAF on every attempt across two independent fetch paths, so its exact heading, its of |
| US-MO | Missouri | Business Search | Operator, unit, entity coverage and the office-cited search URL are confirmed from an official Secretary of State page, but the search application its |
| US-NH | New Hampshire | _not established_ | Precise blocker: every New Hampshire official surface carrying substantive description returns HTTP 403 (Akamai on www.sos.nh.gov and www.nh.gov; the  |
| US-NM | New Mexico | Business Services Online Filings Portal | But the register's public accessibility is genuinely unresolved: every portal path returns an edge-level 403, so it cannot be confirmed whether search |
| US-OH | Ohio | Ohio Secretary of State Business Search | Only the operator and the canonical hostname are verified, both from the office's own branded challenge page. Every substantive official surface — the |
| US-OK | Oklahoma | Business Entities Search | I could not resolve which is true because Turnstile prevented me from reaching a result. A human should complete one search in a browser and record ex |
| US-PA | Pennsylvania | Business Entity Search | Precise blocker: file.dos.pa.gov serves a Cloudflare interactive challenge (HTTP 403, "Just a moment... |
| US-SC | South Carolina | _not established_ | BLOCKER: two independent access failures. (1) All South Carolina Secretary of State and state-portal pages are served through an Amazon CloudFront dis |
| US-UT | Utah | _not established_ | Blocked on every readable surface. The one solid finding is negative but valuable — the classic secure.utah.gov/bes search URL is retired and 301s to  |
| US-VT | Vermont | _not established_ | Precise blocker: bizfilings.vermont.gov is a pure Angular SPA that serves an identical 4,574-byte shell on every route, so the search form's fields, t |
| US-VA | Virginia | _not established_ | BLOCKER: two independent access failures. (1) The Commission's web estate is served through an Amazon CloudFront distribution that explicitly geo-bloc |
| US-WY | Wyoming | _not established_ | Complete network unreachability from this environment across both egress paths, multiple user agents and repeated retries. No official Wyoming page wa |
| US-GU | Guam | _not established_ | The responsible operator is verified from official guam.gov sources (Department of Revenue and Taxation, General Licensing and Registration / Business |
| US-MP | Northern Mariana Islands | Office of the Registrar of Corporations | The statutory register and the responsible operator are both verified from an official CNMI government surface, but there is no public online entity s |
| US-AS | American Samoa | _not established_ | The responsible offices are verified — the Territorial Registrar within the Department of Legal Affairs records articles of incorporation under ASCA 3 |

Each carries a full backlog entry: candidate URL (or an explicitly-flagged
unverified lead where no official page confirms one), operator, blocker, fields
already confirmed, fields still unknown, and the manual browser steps that would
unblock it.

### Alabama and Mississippi

Authored as records during Wave 1B and **withdrawn before release**. Research
verdict `pending-manual-verification` for both.

- **Alabama** — Alabama's search application refused or timed out every
  connection from two independent network paths.
- **Mississippi** — the principal search screen returned HTTP 403 from an Akamai
  WAF on every attempt across two independent paths.

Neither is published on the strength of identity, operator, vendor similarity to
another state, or the registry probably existing. `statusBadges` derives its
badge from `lastVerified`, not `verification.status`, so publishing either would
have rendered a green "Verified" badge on a record nobody has seen work.

### The United States page

The section's first genuinely grouped country page: Federal, States, Federal
district, Territories, Other nationwide listings — each with its own table, its
own derived count and a jump nav. No state landing routes, no pagination.

Every count is computed from records. Columns are derived per group, so the
States table does not render a Domain Rating column in which every row is empty.
Search, filtering and the result count operate across every group; sorting
reorders within a group and never moves a record between groups. The whole
record set is in the static markup, so the page works without JavaScript. The
grouping UI shipped with no CSS at all in an earlier commit — seven class names,
no rules — which is fixed, and the asset guard now covers the components that
escaped it.

### Data policy

**Open-source only.** No paid API, no key, no bearer token, no commercial
database, no unofficial mirror, no search snippet as evidence. The build is
offline and deterministic; running it twice writes nothing the second time.

**Frozen historical Domain Rating.** 64 records carry one, every one a
snapshot taken before the policy came into force
(`metricsProvenance.domainRating.status === "historicalSnapshot"`), pinned by a
SHA-256 digest a test recomputes on each run. **No record added here carries a
Domain Rating, authority score, traffic estimate or referring-domain count.**

### Audits

| Check | Result |
| --- | --- |
| Validator | exit 0 |
| Migration, twice | second rewrites 0 files |
| Build, twice | second writes 0, prunes 0 |
| Tests | 595 pass, 0 fail |
| Internal links | 12,450 checked, 0 broken |
| Sitemap | 199 = the indexable generated set |
| RSS | 130 = published record count |
| JSON-LD | 199 blocks, 479 nodes, all parse |
| Titles / descriptions | 199 unique / 199 unique |
| Canonicals | every page self-canonical on the apex |
| Ownership | every page reproduced byte-identically into a clean root |
| Pruning | an owned page is deleted; a foreign file is left alone and refuses overwrite |
| Secrets | 151 changed files scanned, none found |
| Network | 23 build-path files, no fetch, no env-supplied host or key |
| Coverage | derived from data; no page claims complete state coverage |
| Adversarial factual | every published claim traced to the research; 0 unsupported |

An adversarial audit of all 62 US records found **49 defects across 25 records**
that the suite had passed over — operator fields leaking editorial asides into
sentence templates, prose cut at abbreviations, and `publicAccess.notes`
publishing HTTP status codes and pasted markup to readers. All are fixed, and
`bd-publication-truth.test.cjs` guards each family over every US record.

### Known deferred candidates

- **19 states and 3 territories**, all blocked on observed search behaviour.
- **Second registers** where one jurisdiction runs two distinct systems. Texas is
  the strongest case: the free public search most people actually use is the
  Comptroller's Franchise Tax Account Status Search — a different operator and a
  different statutory register from the paywalled Secretary of State system.
- **Federal candidates** identified in Wave 1A and recorded in
  `docs/business-directories-verification-backlog.md`.
- **Pre-existing records not touched here:** `us-finra-brokercheck` renders a
  "Registration required" badge beside a "Free to search with no account
  required" strength. `registrationRequired` means the *entity* must register,
  which is correct, but the badge reads as an access gate. Three global records
  (`global-rubygems`, `global-pub-dev`, `global-g2`) name a schema field in
  their editor notes. Both predate this branch and are out of its scope.

### Rollback

Fast-forward from `origin/main`; nothing on main is rewritten.

```sh
git checkout main && git reset --hard origin/main    # undo the release
git revert --no-commit <sha> && git commit           # or drop one commit
node scripts/validate-business-directories.cjs
node scripts/migrate-business-directories.cjs
node scripts/build-business-directories.cjs
node --test "scripts/tests/*.test.cjs"
```

The generator owns every page it writes and prunes what it stops owning, so
removing records and rebuilding removes their pages, sitemap entries and feed
items in one pass. There is no manual cleanup step.

### Commits

- `cc40a97` fix: publication truth pass, Nevada, and derived US coverage
- `06e5082` fix: remove raw fetch artefacts committed at repository root
- `26ec1ca` feat: add Wave 1B US state and territory registries
- `f3067bd` feat: complete Wave 1A federal registry coverage
- `ba7655a` feat: add Wave 1A US federal registries
- `e5aed4b` fix: complete Wave 1 jurisdiction integrity gate
- `a70fd83` feat: harden government registry foundation
- `b463741` feat(bd): Wave 1 foundation — jurisdiction, supranational scope, names, registry classification
