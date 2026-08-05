# Business Directories — pending manual verification

Candidates that could not be verified against an official source by automated
fetch. **None of these is published.** They are recorded here so the work is not
lost and so the gap in coverage is visible rather than silent.

Last attempted: 2026-08-04 (Batch 1).

**Batch 1 cleared eight of these** by reaching the same facts through a
different official surface — an official help centre, a regulator's own page, a
government portal, or the project's own public repository — rather than the
blocked host. Cleared: Google Business Profile, G2, npm, FINRA BrokerCheck, FCA
Financial Services Register, SEC EDGAR, Swift Package Index, and CEIDG (new).
The lesson is recorded in the runbook: a 403 on the front door is not evidence
that a candidate is unverifiable.

| Candidate | Official URL | Suspected category | Suspected scope | Block reason | Priority | Verification steps required |
|---|---|---|---|---|---|---|
| Microsoft AppSource | https://appsource.microsoft.com/ | app-directories | Global | **Approved wording (2026-08-04):** Current official Microsoft documentation appears consolidated under Microsoft Marketplace; do not publish the legacy name until current storefront identity is established. <br><br>Evidence: publisher docs (updated 2026-07-23) and the customer documentation hub (updated 2026-07-21) describe only "Microsoft Marketplace" at marketplace.microsoft.com; AppSource survives there only as a legacy community-forum URL and an image filename. | **High** | Confirm in a browser whether appsource.microsoft.com still serves a distinct storefront or redirects. If it is fully consolidated, add **Microsoft Marketplace** as a new candidate instead of AppSource — do not publish AppSource as a current marketplace |
| Thomasnet | https://www.thomasnet.com/ | manufacturing | United States | **Approved wording (2026-08-04):** Operator relationship and base-listing model remain insufficiently established. <br><br>Evidence: business.thomasnet.com names Thomas Publishing Company in its copyright; xometry.com/about-us counts "500K Manufacturing Suppliers Listed on Thomas" among Xometry's own figures without stating the relationship. Neither page states the cost of a basic listing. | **High** | Confirm the current corporate owner from an official statement by either company, and confirm the cost of a basic listing from Thomas's own documentation |
| Kompass | https://www.kompass.com/ | manufacturing | Global | **Approved wording (2026-08-04):** Official sources remain inaccessible. <br><br>Evidence: HTTP 403 on www.kompass.com, corporate.kompass.com and www.kompass.com/en/about-us. | Medium | Browser visit; confirm the operating entity, geographic scope and listing model |
| GMC Medical Register | https://www.gmc-uk.org/ | healthcare | United Kingdom | **Approved wording (2026-08-04):** Official sources remain inaccessible. <br><br>Evidence: HTTP 403 across the whole gmc-uk.org domain; the Professional Standards Authority page for the GMC returned 404. | Medium | Browser visit; confirm register scope, statutory basis and free public search |
| Chrome Web Store | https://chromewebstore.google.com/ | app-directories | Global | Consent wall | **High** | As above; confirm developer registration fee and review system |
| NPPES NPI Registry | https://npiregistry.cms.hhs.gov/ | healthcare | United States | JavaScript-only page | High | Browser visit; confirm CMS operation and free access |
| IHK (German chambers) | https://www.ihk.de/ | chambers-of-commerce | Germany | HTTP 403 | High | Browser visit; confirm statutory role and whether a public member directory exists |
| CCI (French chambers) | https://www.cci.fr/ | chambers-of-commerce | France | HTTP 403 | High | As above |
| Unioncamere / Camere di Commercio | https://www.unioncamere.gov.it/sistema-camerale | chambers-of-commerce | Italy | Redirect chain not followed to completion | Medium | Follow redirect; confirm statutory role and registers |
| BaFin | https://www.bafin.de/ | finance | Germany | Insufficient official information (registers not described on the page fetched) | Medium | Locate the specific public register pages and verify each |
| Avvo | https://www.avvo.com/ | legal | United States | Ownership unclear (page names the founder, not the current owner) | Medium | Confirm current corporate ownership from an official source |
| Charity Commission register | https://register-of-charities.charitycommission.gov.uk/ | government | United Kingdom | DNS failure on the subdomain attempted | Medium | Find the current canonical host and re-verify |
| Yellow Pages | https://www.yellowpages.com/ | local-business | United States | HTTP 403 | Low | Browser visit; confirm ownership and listing model |
| Hotfrog | https://www.hotfrog.com/ | local-business | Global | HTTP 403 | Low | Confirm the platform is actively maintained before considering inclusion |
| Terraform Registry | https://registry.terraform.io/ | developer | Global | Insufficient official information (page returned title only) | Medium | Confirm operator and publishing model |
| Artifact Hub | https://artifacthub.io/ | developer | Global | Insufficient official information | Medium | Confirm governing foundation and submission route |
| Free Software Directory | https://directory.fsf.org/ | developer | Global | HTTP 403 | Medium | Browser visit; confirm FSF operation and inclusion policy |
| Black Duck Open Hub | https://openhub.net/ | developer | Global | HTTP 403 | Low | Confirm the platform is still actively maintained |
| Y Combinator Startup Directory | https://www.ycombinator.com/companies | startup | Global | Insufficient official information (title only) | Medium | Confirm whether listing is restricted to portfolio companies |
| Zapier App Directory | https://zapier.com/apps | app-directories | Global | Official name not confirmable | Low | Confirm the directory's official name from Zapier documentation |
| Zoom App Marketplace | https://marketplace.zoom.us/ | app-directories | Global | Insufficient official information | Low | Confirm listing and review model |
| Figma Community | https://www.figma.com/community | app-directories | Global | HTTP 403 | Low | Confirm publishing model |
| Glassdoor | https://www.glassdoor.com/ | review-sites | Global | HTTP 403 | Medium | Confirm employer listing and review verification model |
| StackShare | https://stackshare.io/ | software | Global | HTTP 403 | Low | Confirm the platform is actively maintained |

## Wave 1A — US federal, held back (2026-08-04)

Researched against official sources and not published. Each needs one specific
check, not new research.

| Candidate | Official URL | Block reason | Priority |
|---|---|---|---|
| SBA Small Business Search | https://search.certifications.sba.gov/advanced | Confirm a logged-out search returns results. Everything else is established, and this is the authoritative check on 8(a)/HUBZone/WOSB/SDVOSB claims, which SAM.gov only holds as self-certification | **High** |
| FFIEC National Information Center | https://www.ffiec.gov/npw | JS/cookie challenge. The only system resolving bank holding-company hierarchies and the RSSD join key. Must never be described as a beneficial-ownership register — it records legal control chains | **High** |
| USPTO Assignment Search | https://assignmentcenter.uspto.gov/search/patent | Confirm search works signed out. USPTO gated the sibling Patent Center behind identity verification in September 2025, so open access cannot be assumed | **High** |
| FMCSA SAFER Company Snapshot | https://safer.fmcsa.dot.gov/CompanySnapshot.aspx | 403 to every attempt, and FMCSA states post-May-2026 Motus filings are not reflected in the legacy system. Publishing a possibly-stale carrier register as authoritative would be harmful | **High** |
| FDA Drug Establishments Current Registration Site | https://www.accessdata.fda.gov/scripts/cder/drls/default.cfm | Fully verified and publishable, but blocked by the canonical-domain rule: it shares accessdata.fda.gov with the published device register. See the schema note in the Wave 1A report | **High** |
| NCUA credit union research tools | https://mapping.ncua.gov/ | The primary named URL was never reachable; records were parsed from an official NCUA open-data host instead. Confirm the interactive tool loads and fix the canonical URL | Medium |
| NMLS Consumer Access | https://www.nmlsconsumeraccess.org/ | Cloudflare. Also reclassified: the operator is CSBS / State Regulatory Registry LLC, a private association of state regulators — this belongs in a state or multistate wave, not the federal layer | Medium |
| FMCSA Licensing & Insurance | https://li-public.fmcsa.dot.gov/ | FMCSA states it holds only historical records as of 14 May 2026 and the docket numbers it is keyed on are being abolished. Publish as an explicit archive or replace with Motus | Medium |
| DOL OFLC disclosure data and debarment list | https://flag.dol.gov/ | Every dol.gov URL, including a static PDF, was refused with an edge 403. Split into two records on approval: disclosure data, and the debarment list as a separate exclusions register | Medium |
| CMS Provider of Services File (CLIA) | https://data.cms.gov/ | A 103-field coded quarterly CSV with no human search; the QCOR front end returned 403. Resolve the data dictionary first | Low |

### Held pending a glossary decision

These three are fully verified and would ship immediately, but no registry type
in the closed list honestly describes an exclusion or debarment register. See
the Wave 1A report.

| Candidate | Official URL |
|---|---|
| SAM.gov Exclusions | https://sam.gov/search/?index=ex |
| HHS OIG List of Excluded Individuals and Entities | https://exclusions.oig.hhs.gov/ |
| CFTC Sanctions in Effect | https://sirt.cftc.gov/sirt/sirt.aspx?Topic=SanctionsInEffect |

### Deferred to a later wave, not blocked

Legitimate registries removed from Wave 1A on scope grounds, not legitimacy:
SAM.gov Contract Opportunities (procurement notices, not entities) · CMS Open
Payments (transactions) · CMS PECOS public enrolment · FCC CORES FRN Search
(weak data quality; three FCC records would be disproportionate) · FAA Airmen
Registry (individuals) · USDA APHIS Animal Care (narrow, JS-only) · TTB Public
COLA Registry (product labels; CAPTCHA) · Copyright Public Records System
(works, not businesses).

## Rejected outright, not pending

These were assessed and will not be revisited without new evidence.

| Candidate | Reason |
|---|---|
| openbase.com | Domain no longer resolves. Dead project. |
| CocoaPods | Trunk moving to read-only; not a directory to submit to today. |
| IndiaMART | Scope is national to India, which is not a declared country. Cannot be honestly assigned. |
| Made-in-China.com | Scope is national to China, which is not a declared country. |
| Europages | Pan-European scope with no honest single-country assignment under the current model. |
| PACER / PACER Case Locator | Rejected on access. A mandatory account, postal address verification with a 7–10 business day wait, and per-page charges on search results mean there is no anonymous public search. The finding worth publishing: there is no free, login-free official federal bankruptcy or insolvency register in the United States. |
| FinCEN Beneficial Ownership Information registry | No public search interface of any kind, and the 26 March 2025 interim final rule exempts all US-formed entities. There is no publicly searchable US federal beneficial-ownership register. |
| SAM.gov Contract Data (ex-FPDS) | Account-gated by GSA's own statement and duplicative of USAspending, which is open. FPDS.gov is retired and ezSearch was decommissioned 24 February 2026. |
| FAPIIS | Retired and migrated into SAM.gov Entity Information as Responsibility/Qualification records; GSA says so explicitly. |
| Unique Entity ID | An identifier scheme with no independent search surface. Not a registry. |
| USPTO Patent Center | Public access barred since 11 September 2025 — USPTO states guest and unregistered users can no longer access it — and duplicative of Patent Public Search. Widely miscited as a public patent-status lookup. |
| ClinicalTrials.gov | The unit of record is a study protocol; sponsors appear only as unvalidated free-text. A user cannot establish that a company exists or is permitted to do anything. |
| DOL OFCCP | Every official surface returned 403 or failed DNS, and the data.gov fallbacks were unavailable. No evidence a public registry exists. |

---

## Wave 1C-1 — Australia (attempted 2026-08-05)

Fourteen candidates researched from official Australian sources. Eleven were
published. The rest are recorded here so the gap is visible rather than silent.

### Pending manual verification

| Candidate | Operator | Official URL | Block reason | Verification steps required |
|---|---|---|---|---|
| NSW incorporated associations register | NSW Fair Trading | `applications.fairtrading.nsw.gov.au/assocregister/` | All five publication criteria were established from official NSW pages, but the search application's own behaviour was not observed end to end. | Open the register in a browser, run one association search, and record the result fields and whether any fee or account applies. |
| ACNC Charity Register | Australian Charities and Not-for-profits Commission | `acnc.gov.au/charity/charities` | acnc.gov.au was unreachable across repeated attempts — connection timeouts at the transport layer, not an access restriction. Identity and legal basis are established from the ACNC Act and ACNC-authored text on data.gov.au. | Open the register in a browser and record the search fields, the published data (charity status, ABN, responsible persons, Annual Information Statements) and the access model. |
| Personal Property Securities Register (PPSR) | Australian Financial Security Authority | `ppsr.gov.au` | Both ppsr.gov.au and afsa.gov.au were unreachable across repeated attempts over two transports. | Establish the fee model from an official page before publishing — PPSR searches are widely believed to be fee-bearing per search, and that must be observed, never assumed. Post-2012 company charges migrated off the ASIC register to PPSR, which is what would make it non-duplicative. |

No access facts are asserted for any of the three.

### Rejected — do not propose again

| Candidate | Reason |
|---|---|
| ASIC Banned and Disqualified Persons | One of the register views already represented by `au-asic-registers`, whose own description covers "company, business name, financial adviser and banned-person registers". A Connect tab is not a distinct register. |
| ASIC Financial Advisers Register | Same reason: a view behind the same ASIC Connect landing page. |
| Director Identification Number (ABRS) | No public lookup exists. Director IDs are issued but not published or searchable, so there is nothing for a registry record to point at. |

### Not surveyed

TGA public registers, AFSA insolvency and bankruptcy records, ACMA registers,
IP Australia patents (AusPat) and designs, and the NSW co-operatives register.
None was reached in this wave; none is rejected.

---

## Wave 1C-2 — Canada (2026-08-05)

Canada was researched federally and across all ten provinces and three
territories. Thirteen records were published. What follows is everything that
was **not** published, and why. None of it asserts an access fact.

The reachable-source picture matters for reading this section: `www.canada.ca`
did not respond over either HTTP/2 or HTTP/1.1 from this environment, while the
departmental hosts `ised-isde.canada.ca`, `brevets-patents.ic.gc.ca`,
`fintrac-canafe.canada.ca` and `apps.cra-arc.gc.ca` all did. A federal candidate
being unpublished therefore says nothing about the registry itself.

### Absent registry — not a blocker, and not to be "resolved"

| Jurisdiction | Finding |
|---|---|
| Alberta | **No government-operated public corporate search exists.** Alberta states "Registry agents provide all of the search services listed below" and "A registry agent will charge a government fee and a service fee to provide the information you need." Lead ministry: Service Alberta and Red Tape Reduction. There is nothing to publish. Do **not** substitute a private registry agent, an aggregator, or MRAS. Recorded as `no-public-registry` in the coverage manifest, deliberately not as a blocker, and asserted by `bd-canada.test.cjs`. |

Alberta and Saskatchewan are **not** the same case. Saskatchewan's registry is
statutory and is published (`ca-sk-isc-corporate-registry`); only its delivery is
commercial, through Information Services Corporation. Alberta has no government
public search at all. Collapsing the two would misdescribe both.

### Pending manual verification — blocked jurisdictions

| Candidate | Operator | Official URL | Block reason | Verification steps required |
|---|---|---|---|---|
| Corporate Affairs Registry | Service New Brunswick | `www.pxw1.snb.ca/snb7001/e/2000/2700e.asp` | Interstitial bot challenge on both `www.snb.ca` and `www.pxw1.snb.ca`, every attempt. | Open in a desktop browser; record official registry name, operating department, search URL, whether search is free, whether an account is required. |
| Corporate/Business Names Registry | Government of Prince Edward Island, Justice and Public Safety | `www.princeedwardisland.ca/en/information/justice-and-public-safety/corporate-registry` | Radware browser-verification interstitial returned on every attempt; no official page could be read. | As above. |
| Yukon Corporate Online Registry (YCOR) | Government of Yukon | `yukon.ca/en/corporate-online-registry` | `yukon.ca` returned an interstitial challenge on every attempt; `ycor-regcor.gov.yk.ca` did not respond at all. | As above. |

### Pending manual verification — federal candidates

| Candidate | Operator | Official URL | Block reason | Verification steps required |
|---|---|---|---|---|
| List of Charities | Canada Revenue Agency | `apps.cra-arc.gc.ca/ebci/hacc/srch/pub/dsplyBscSrch` | The application renders only through client-side scripts — the served page is the string `Loading/Chargement...` and nothing else. The canada.ca description page was unreachable. | Open in a desktop browser; record the official listing name, the statutory basis under the Income Tax Act, what is published per charity, and whether search is free. **High priority** — this is the authoritative Canadian charity register. |
| Money services businesses registry | FINTRAC | `fintrac-canafe.canada.ca/msb-esm/public/msb-search/search-by-name/` | The register itself returned HTTP 403 on two hosts and no response on a third. The reachable FINTRAC page is *requirements guidance*, not the register. **Withheld deliberately**: an earlier draft pointed a registry record at the guidance page, which misdescribed it. Statutory basis is established — Proceeds of Crime (Money Laundering) and Terrorist Financing Act (S.C. 2000, c. 17). | Open the MSB search in a desktop browser; confirm the register's own name, that public search is free, and what fields are returned. **High priority.** |
| Registry of Lobbyists | Office of the Commissioner of Lobbying of Canada | `lobbycanada.gc.ca` | Interstitial bot challenge on every attempt. | Open in a desktop browser; confirm registry name, statutory basis and public access model. |
| National Registration Search ("Are they registered?") | Canadian Securities Administrators | `securities-administrators.ca/registration/are-they-registered` | `aretheyregistered.ca` redirects here, and the target returned an unresolved redirect on every attempt. | Open in a desktop browser; confirm the tool's official name, coverage across CSA members, and access model. |
| Regulated financial institutions lists | Office of the Superintendent of Financial Institutions | `osfi-bsif.gc.ca` | Every candidate path tried returned HTTP 404; the current canonical location of the federally regulated financial institutions list was not established. | Locate the current canonical page from OSFI's own navigation and verify. |
| AdvisorReport | Canadian Investment Regulatory Organization | `ciro.ca/office-investor/advisorreport` | HTTP 403 on every attempt. | Open in a desktop browser; confirm operator status (self-regulatory organisation), coverage and access model. |
| OrgBook BC | Government of British Columbia | `orgbook.gov.bc.ca` | Client-rendered application; the served page carries the title only. BC is already published through `ca-bc-registry-services`, so this is an additional surface rather than a coverage gap. | Confirm whether OrgBook is a distinct registry system or a presentation layer over BC Registries before publishing; it must not duplicate the existing record. |

### Withheld by an architectural constraint, not by research

| Candidate | Operator | Official URL | Constraint |
|---|---|---|---|
| Canadian Trademarks Database | Canadian Intellectual Property Office | `ised-isde.canada.ca/cipo/trademark-search/srch` | **Fully researched and fully verified** — free, no account, coverage from 1865, "over 140 years" and "more than 1.4 million Canadian trademarks", currency stated on the page. It is withheld only because it shares the host `ised-isde.canada.ca` with the already-published federal corporation search, and no alternate official host exists (`marques-trademarks.ic.gc.ca` does not resolve). Publishing it requires either (a) giving it the same Domain Rating snapshot as `ca-corporations-canada`, which the wave's Domain Rating policy forbids for new records, or (b) relaxing the `bd-truth` invariant that one measured domain reports one rating. Both are editorial decisions outside this wave's remit. |

**This is the highest-value unpublished Canadian registry.** Resolving it is a
one-line decision, not more research. See the release notes for the two options.

### Rejected — do not propose again

| Candidate | Reason |
|---|---|
| `businessregistries.ca` | **Not a government service.** The domain is a commercial domain-sale parking page operated by a US registrar. It is a near-miss for the real MRAS entry point, `canadasbusinessregistries.ca`, and is asserted against by `bd-canada.test.cjs` so it can never be cited as the service. |
| CanadaBuys | A tender-opportunity portal, not a register of businesses. It publishes procurement notices; it does not record the existence, status or identity of suppliers in a way a registry record would describe. |
| Alberta registry agents (individual) | Private commercial operators. Publishing one as though it were the Alberta corporate registry would state the opposite of the researched finding. |

### Not surveyed

Provincial securities commissions individually (covered nationally by SEDAR+),
provincial professional-regulator registers other than Québec's RBQ, provincial
charity or not-for-profit registers where separate from the corporate registry,
CRTC and Canadian Transportation Agency operator registers, Health Canada and
CFIA licence registers, and provincial procurement supplier registers. None was
reached in this wave; none is rejected.
