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
| NCUA credit union research tools | https://mapping.ncua.gov/ | The primary named URL was never reachable; records were parsed from an official NCUA open-data host instead. Confirm the interactive tool loads and fix the canonical URL | Medium |
| NMLS Consumer Access | https://www.nmlsconsumeraccess.org/ | Cloudflare. Also reclassified: the operator is CSBS / State Regulatory Registry LLC, a private association of state regulators — this belongs in a state or multistate wave, not the federal layer | Medium |
| FMCSA Licensing & Insurance | https://li-public.fmcsa.dot.gov/ | FMCSA states it holds only historical records as of 14 May 2026 and the docket numbers it is keyed on are being abolished. Publish as an explicit archive or replace with Motus | Medium |
| DOL OFLC disclosure data and debarment list | https://flag.dol.gov/ | Every dol.gov URL, including a static PDF, was refused with an edge 403. Split into two records on approval: disclosure data, and the debarment list as a separate exclusions register | Medium |
| CMS Provider of Services File (CLIA) | https://data.cms.gov/ | A 103-field coded quarterly CSV with no human search; the QCOR front end returned 403. Resolve the data dictionary first | Low |

## Wave 1D — Spain, opened by the source-of-record correction (2026-08-05)

Correcting `es-registradores` removed two register claims from a record that
never held those registers. The registers themselves are real and unpublished,
so they are recorded here rather than lost.

| Candidate | Operator | Official URL | Status | Next action |
|---|---|---|---|---|
| Registro Mercantil Central | Registro Mercantil Central (Spanish mercantile registry system) | `https://www.rmc.es/` | Not researched | **High priority for Wave 1E.** Spain currently has NO record for its actual company register — only for the registrars' professional body. Establish the constitutive position: the mercantile registers are kept by registrars in office, with the Central as the central institution. |
| Registro Público Concursal | Ministry of Justice (material management of the publicity service entrusted to the Colegio de Registradores under RD 892/2013 art. 2.3) | `https://www.publicidadconcursal.es/` | Not researched | Verify the current official host and access position. Record the Ministry of Justice as the responsible body per RD 892/2013 art. 2.2 and art. 4, and the Colegio's role as delegated management, not ownership. |
| Registro Central de Titularidades Reales | To be established | To be established | Not researched | The Spanish beneficial-ownership register. `beneficial-ownership-register` was removed from `es-registradores` because no official source establishing that body as responsible was read; identify the responsible body before authoring. |

### Resolved — the shared-host blocker was solved (2026-08-05)

| Candidate | Official URL | Published as |
|---|---|---|
| FDA Drug Establishments Current Registration Site | https://www.accessdata.fda.gov/scripts/cder/drls/default.cfm | `us-fda-drug-establishments` |

Held because it shares `accessdata.fda.gov` with the published device register
and the canonical-domain rule forbade two records on one host. That was solved
by the `resourceIdentity` shared-host model: both records declare the
`fda-accessdata` group with distinct `systemKey` values and materially different
destinations. The Wave 1 final audit found this row still listed as blocked;
corrected in Wave 1D.

### Resolved — the glossary decision was taken (2026-08-05)

These three were held because, at the time, no registry type in the closed list
described an exclusion or debarment register. **That blocker no longer exists.**
`exclusion-and-debarment-register` was added in the Wave 1A completion, with an
explicit boundary against `procurement-supplier-register` — a supplier register
records who MAY bid, an exclusion register records who may not — and all three
candidates were authored against it.

| Candidate | Official URL | Published as |
|---|---|---|
| SAM.gov Exclusions | https://sam.gov/search/?index=ex | `us-sam-exclusions` |
| HHS OIG List of Excluded Individuals and Entities | https://exclusions.oig.hhs.gov/ | `us-hhs-oig-leie` |
| CFTC Sanctions in Effect | https://sirt.cftc.gov/sirt/sirt.aspx?Topic=SanctionsInEffect | `us-cftc-sanctions-in-effect` |

The historical note is retained deliberately: it records that a classification
blocker was reported rather than worked around, which is the behaviour to repeat.
The Wave 1 final audit found this section still asserting the blocker as live,
which made it a false statement about the current schema; corrected in Wave 1D.

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

### Resolved — published in the completion pass (2026-08-05)

| Candidate | Operator | Official URL | Resolution |
|---|---|---|---|
| Canadian Trademarks Database | Canadian Intellectual Property Office | `ised-isde.canada.ca/cipo/trademark-search/srch` | **Published as `ca-cipo-trademarks-database`.** It had been withheld only because it shares the measured domain `ised-isde.canada.ca` with the federal corporation search, which collided with the then-current rule that every new record carries `domainRating: null`. That rule was the wrong shape: the freeze is about *measurement*, not about whether an already-measured number may appear twice. The rule now reads "a new record must not create a new Domain Rating measurement, but may reuse an existing frozen snapshot when its normalised `measuredDomain` exactly matches an already measured domain". The record reuses the stored snapshot verbatim — 92, Ahrefs, 2026-08-04, `historicalSnapshot` — read directly off `ca-corporations-canada`. Sources were revalidated live before publication. No measurement, no request, no credential: the per-domain snapshot digest is byte-identical either side of the change. |

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

---

## Wave 1C-3 — United Kingdom (2026-08-05)

Thirty-two candidates researched, sixteen published. What follows is everything
**not** published, and why. No access fact is asserted for any of it.

Host reachability shaped several verdicts. Most UK official hosts responded, but
`trademarks.ipo.gov.uk`, `www.search-for-intellectual-property.service.gov.uk`,
`www.registered-design.service.gov.uk` and `www.lawscot.org.uk` all returned
HTTP 403 behind captcha or bot-mitigation interstitials, reproduced with and
without a browser user-agent.

### Resolved — classification blocker cleared (2026-08-05)

The four UK procurement systems are **now published**. The blocker was the type
vocabulary, not the research: they publish procurement *notices*, and no existing
type described that. A central type was added —
`public-procurement-notice-database` — with an explicit boundary against
`procurement-supplier-register`, and all four were authored against it.

| System | Record | Territory |
|---|---|---|
| Find a Tender | `gb-find-a-tender` | United Kingdom-wide, with Scottish below-threshold and full-lifecycle notices out of scope |
| Contracts Finder | `gb-contracts-finder` | England, Wales and Northern Ireland (`covers` GB-ENG + GB-NIR + GB-WLS); **not** Scotland |
| Public Contracts Scotland | `gb-public-contracts-scotland` | Scotland (GB-SCT) |
| Sell2Wales | `gb-sell2wales` | Wales (GB-WLS) |

Two corrections came out of revalidation and are worth recording:

- **Find a Tender is no longer "high value only".** From 24 February 2025 it
  publishes below-threshold notices as well, except below-threshold in Scotland.
  The GOV.UK guidance page still carries the older "usually above £139,688"
  framing and is stale on this point; the service's own pages were treated as
  authoritative. The stale figure is deliberately not repeated as current.
- **Contracts Finder is neither UK-wide nor England-only.** Its territory was
  taken from the extent of the Public Contracts Regulations 2015, which reaches
  England, Wales and Northern Ireland but not Scotland, with devolved Welsh and
  Northern Irish authorities outside its scope. An earlier England-only proposal
  was refuted by the operator's own OCDS data.

**CanadaBuys was re-evaluated and is now published** as `ca-canadabuys`. The
Wave 1C-2 rejection was correct under the type vocabulary then available; the
reversal is on the classification question only and the editorial standard is
unchanged — it is still not a supplier register, and the record says so. Its
`editorNotes` records the reversal and the ground for it, and a test asserts that
the reversal note survives.

**The Companies House disqualified directors register is now published** as
`gb-companies-house-disqualified-directors`, through the `resourceIdentity`
shared-host mechanism. It reuses the domain's existing frozen Domain Rating
snapshot verbatim; no measurement was made.

### Pending manual verification

| Candidate | Operator | Official URL | Block reason | Verification steps required |
|---|---|---|---|---|
| UK trade marks register | Intellectual Property Office | `trademarks.ipo.gov.uk/ipo-tmtext/start` | HTTP 403 behind an IPO "Service Captcha" interstitial, reproduced with and without a browser user-agent. The register was never observed. | Open in a desktop browser; record the official register name, the search fields, whether search is free and account-free, and the exact search host. **High priority** — this is the UK counterpart to registers already published for Canada. |
| UK patents register | Intellectual Property Office | `www.search-for-intellectual-property.service.gov.uk` | HTTP 403 behind a GOV.UK anti-data-mining security check. | As above. |
| UK registered designs | Intellectual Property Office | `www.registered-design.service.gov.uk/find/` | HTTP 403 behind an IPO "Service Captcha". **The classification half of this blocker is now cleared:** a `registered-design-register` type was added, with an explicit boundary against trade marks and patents. Only the access blocker remains. | Open in a desktop browser; record the official register name, the search fields, whether search is free and account-free, and the exact search host. The type is ready and waiting; do not force the record into `patent-register`. |
| Law Society of Scotland — Find a Solicitor | Law Society of Scotland | `www.lawscot.org.uk/find-a-solicitor/` | HTTP 403 behind a Cloudflare block page on two attempts with different user-agents. Nothing on the host was read. | Open in a desktop browser; establish whether this is the statutory roll or a voluntary directory before considering publication — the England and Wales and Northern Ireland equivalents turned out to be voluntary directories and were rejected. |
| DRO and BRO Register (Northern Ireland) | Insolvency Service, Department for the Economy | `insolvency.economy-ni.gov.uk/Insolvency.Public/DRORegisterSearchWizard.aspx` | The register host serves a client-side shell; the search was never exercised. Its existence and operator are evidenced by an official Department for the Economy page. | Open in a browser, run one search, and record the returned fields and access position. Publishing it would complete Northern Ireland insolvency coverage, which the published IVA register does not provide alone. |
| OrgBook BC follow-on: none for the UK | — | — | — | — |

### Duplicates — already represented

| Candidate | Reason |
|---|---|
| Companies House disqualified directors register | **Resolved and published** as `gb-companies-house-disqualified-directors` via the `resourceIdentity` shared-host mechanism, with a distinct `systemKey`, the shared group `companies-house-service`, and the domain's existing frozen Domain Rating snapshot reused verbatim. |
| Care Quality Commission provider register | Host collision with the published `gb-cqc`. Researched only to carry the territorial correction, which has been applied. |

### Rejected — do not propose again

| Candidate | Reason |
|---|---|
| Insolvency Service director disqualification outcomes | Not a register. It is a rolling three-month publication of recent outcomes, and the Insolvency Service states on the page itself that it should not be relied on as a complete record. |
| Law Society of England and Wales — Find a Solicitor | The operator states it is not a register: it lists only those who choose to be listed, does not contain details of all solicitors, and includes non-solicitors holding Law Society accreditations. The statutory register for England and Wales is the SRA's, which **is** published. |
| Law Society of Northern Ireland — Find a Solicitor | The operator expressly disclaims it: it is "not a copy of the Register of Solicitors", lists only firms willing to be displayed, and excludes in-house, government and opted-out solicitors. |
| Faculty of Advocates — Find an Advocate | An independent professional body, not a government agency, statutory regulator, court or public-law body. No statutory register basis was evidenced. |
| Food Hygiene Information Scheme as a separate record | FHIS is Scotland's hygiene scheme, but the Food Standards Scotland page for it is scheme *guidance*, not a register search. Scottish results are served through `ratings.food.gov.uk`, which **is** published and which states it holds information for England, Northern Ireland, Wales and Scotland. Publishing the guidance page as a register would repeat the FINTRAC error caught in Wave 1C-2. The Scottish scheme difference is instead published as a con on the ratings record. |

### Not surveyed

The General Medical Council register, the General Pharmaceutical Council and
Pharmaceutical Society of Northern Ireland registers, Social Work England and its
devolved counterparts, Ofsted and Estyn provider registers, the Gambling
Commission and Ofcom licence registers, the Employment Agency Standards and
Gangmasters and Labour Abuse Authority registers, Scottish and Northern Ireland
company-adjacent registers, and the Land Registry / Registers of Scotland /
Land and Property Services title registers. None was reached in this wave; none
is rejected.

---

## Wave 1E — Continental Europe (2026-08-05)

Seventeen candidates researched, eleven published. What follows is what was not.

### Pending manual verification

| Candidate | Country | Operator | Official URL | Blocker | Next action |
|---|---|---|---|---|---|
| Albo delle imprese di assicurazione (IVASS) | Italy | IVASS | `ivass.it` / `infostat-ivass.bancaditalia.it` | Identity, authority and the platform/interface split are established from a fetched IVASS page, but the **access position** of the public inquiry application could not be established. | Exercise the RIGA public inquiry application and record the access position. |
| Registro dei revisori legali | Italy | Ministero dell'Economia e delle Finanze | `revisionelegale.mef.gov.it` | **Host unreachable.** DNS resolves but the HTTPS connection never completes (timeout at 25 s and 60 s). Nothing about it was established. | Retry from a different network; if it stays down, look for an official MEF mirror. |
| CONSOB registers | Italy | CONSOB | `consob.it` | Not established to publication standard in this wave. | Research the individual albi ed elenchi and determine whether each is a distinct register. |

### Duplicate — not published

| Candidate | Reason |
|---|---|
| Portál veřejných rejstříků a evidencí (`verejnerejstriky.msp.gov.cz`) | A newer ministry portal over the same Czech public register already published as `cz-verejny-rejstrik` (or.justice.cz). Publishing both would be a landing/search pair for one registry, which the duplicate guard forbids. Worth revisiting only if the ministry retires the older surface. |

### A brief discrepancy worth recording

The Wave 1E brief listed **ISIR** among the Polish targets. ISIR is the **Czech**
Insolvenční rejstřík. Poland's insolvency register is the Krajowy Rejestr
Zadłużonych (KRZ). Both were researched: ISIR is published under Czechia, and KRZ
was published in Wave 1E.1 below.

### Carried forward, not started

Poland: Biała lista podatników VAT, Centralny Rejestr Beneficjentów
Rzeczywistych, UPRP, KNF. Germany: BaFin. France: ORIAS, REGAFI, INPI trade mark
and patent bases as records separate from `fr-inpi`. Spain: Banco de España,
Registro Central de Titularidades Reales.

---

## Wave 1E.1 — Continental Europe completion (2026-08-05)

Seventeen candidates researched across the six countries, twelve approved by
research, **eight published**.
Every approved candidate came back from the adversarial pass as
publish-with-corrections rather than publish-as-is, and two carried **fabricated
quotations** that were removed rather than repaired. What follows is what was not
published, and why.

### Resolved from the Wave 1E backlog

| Candidate | How it was resolved |
|---|---|
| Krajowy Rejestr Zadłużonych (KRZ) | **Published** as `pl-krz`. The Incapsula block was reproduced and still stands, and `api-krz.ms.gov.pl` does not resolve, so no access fact was observed. Identity, responsible authority, scope and statutory basis are established from the Ministry of Justice's own page and the Act's text on the Sejm ELI service, and the record ships with `accessLevel: unknown` and every access boolean null — the treatment already applied to `fr-rne`. |
| Evidence skutečných majitelů (ESM) | **Published** as `cz-evidence-skutecnych-majitelu`, and the blocker is resolved in the negative: the Ministry of Justice **withdrew public access on 17 December 2025**. The page the register's own navigation labels as the public-part search was retrieved and serves the withdrawal notice instead of a search form, so the absence of a public search was confirmed on the surface that would carry it. |

### Pending manual verification

| Candidate | Country | Operator | Official URL | Blocker | Next action |
|---|---|---|---|---|---|
| Živnostenský rejstřík | Czech Republic | Živnostenský úřad ČR / Ministerstvo průmyslu a obchodu | `rzp.gov.cz` | **Role attribution contested and unresolvable from a reachable official source.** The MPO page and § 60 of the trade licensing act were reported to disagree on which body is the register's *správce*. The search surface is an Angular application with no server-rendered content; `www.rzp.gov.cz` does not respond; the MPO landing page is a navigation stub; and e-Sbírka, the official legislation portal, serves only a JavaScript shell to every path tried including its API host. | Obtain § 60 and § 71 of zákon č. 455/1991 Sb. from a server-rendered official source, then settle whether MPO acts *as* the Živnostenský úřad ČR or is a separate principal. Publishing a contested operator attribution would breach this wave's own acceptance criterion. |
| Marktstammdatenregister (MaStR) | Germany | Bundesnetzagentur | `marktstammdatenregister.de` | Research **fabricated an imprint contact** (a named individual under a "Projektierung" heading) that verification confirmed absent from the page, and misstated the snapshot range on the download page. The register itself is real, open and reachable; the record was not published because its technical-platform field rested on invented detail. | Re-derive the four roles from EnWG § 111e and the imprint alone, assert no personnel, and record that natural-person operators are anonymised in the public view. |
| Albo nazionale gestori ambientali | Italy | Comitato nazionale, at the environment ministry | `albonazionalegestoriambientali.it` | Identity and access are established, but one cited quotation exists only inside an `alt` attribute rather than as page text, and the institutional pages naming the Comitato could not be located from the reachable navigation. `operatorType` is also unsettled: the committee sits *inside* a ministry rather than standing apart from it. | Locate the committee's own institutional page, re-quote from page text, and settle the operator type against the vocabulary. |
| Casellario Informatico dei contratti pubblici — annotazioni riservate | Italy | ANAC | `annotazioni.anticorruzione.it` | The record cited **repealed law**: the *reputazione dell'impresa* clause it relied on was suppressed by D.Lgs. 209/2024, and only the original 2023 gazette text was consulted. A scope tension also stands — the reserved annotations have no public search, but other levels of the same statutory casellario are freely consultable on separate ANAC hosts. | Re-read the consolidated art. 222 and ANAC's Delibera 225/2025, then decide whether the publishable unit is the reserved annotations or the casellario as a whole. |
| Registro Nazionale degli Aiuti di Stato (RNA) | Italy | MIMIT | `rna.gov.it` | **Host unreachable.** DNS resolves but every HTTPS request timed out on three separate paths; the apex does not resolve. Nothing was established. | Retry from a different network. |
| Registro dei revisori legali | Italy | Ministero dell'Economia e delle Finanze | `revisionelegale.mef.gov.it` | Carried forward from Wave 1E. Host still not retried. | Retry from a different network; if it stays down, look for an official MEF mirror. |
| CONSOB registers | Italy | CONSOB | `consob.it` | Carried forward from Wave 1E. | Research the individual albi ed elenchi and determine whether each is a distinct register. |

### Rejected on classification, not on quality

| Candidate | Reason |
|---|---|
| Banca dati nazionale dei contratti pubblici (BDNCP) | Real and now fully evidenced in law, but it has **no separate public access interface of its own**. Its public surface is the legal-publicity platform already published as `it-pubblicita-legale-anac`. Publishing both would be a landing/search pair for one system. |
| REA — Repertorio Economico Amministrativo | Legally a distinct *repertorio*, but it is constituted *at* the business register office and has no interface of its own; it is reached through `registroimprese.it`, already published as `it-registro-imprese`. |
| Vereinsregister (Germany) | No portal of its own — it is reached through `handelsregister.de`, already published as `de-registerportal`, so publishing it would collide on hostname as well as duplicate. |
| Portál veřejných rejstříků a evidencí (`verejnerejstriky.msp.gov.cz`) | Still in *ověřovací provoz* (verification operation) and its own banner says so. Carried forward from Wave 1E, now with the additional finding that the Ministry is running it as a replacement surface for `or.justice.cz`. **Revisit when it leaves pilot operation** — at that point the published `cz-verejny-rejstrik` may need its URL migrated rather than a second record added. |

---

## Wave 1F — European Union (2026-08-05)

Sixteen candidates reached a determination; **nine published**. Three research
clusters never ran to completion, so their candidates are recorded here as
**not researched** rather than as gaps in EU coverage.

### Not researched — the wave was cut short

The research fleet lost **fourteen of seventeen agents to a monthly spend
limit**, including *every* adversarial verifier. Verification of the nine
published records was carried out directly instead. These three subject areas
produced no usable research at all and must be re-run:

| Area | Candidates named in the brief | Status |
|---|---|---|
| Intellectual property | EUIPO trade mark search, EUIPO registered Community design search, TMview, DesignView | **Not researched.** Agent terminated mid-run. |
| Sanctions | EU Sanctions Map, consolidated EU financial sanctions list | **Not researched.** Agent terminated at the point of returning its answer. |
| Chemicals, products, regulated goods | ECHA chemicals databases, CTIS clinical trials portal, EUDAMED, RASFF, plant-protection and biocidal registers | **Not researched.** Agent terminated mid-run. |

Nothing above should be read as a judgement on those systems. They were not
assessed.

### Out of scope — intergovernmental, not EU

| Candidate | Reason |
|---|---|
| European Patent Office / European Patent Register | The EPO is an intergovernmental organisation under the **European Patent Convention**, not an EU institution. Serving European states does not make a body an EU body. It is **not** an EU coverage gap and must not be counted as one. Revisit only if the architecture ever gains an explicit intergovernmental geography model, which Wave 1F deliberately did not create. |

### Rejected — real, but not a publishable register here

| Candidate | Reason |
|---|---|
| ESMA Registers portal (`registers.esma.europa.eu`) | Live and official, but a **common search front-end over dozens of legally distinct registers**, each with its own regulation, scope and source of record. Publishing it would merge unrelated databases into one record. The single ESMA register published instead is the credit rating agency list, which has one legal basis and where ESMA is itself the supervisor. |
| EIOPA register of insurance intermediaries | Not a register. It is a **country-by-country table of links** to national registers containing no intermediary records of its own; EIOPA's own page calls it a provisional database of hyperlinks. Publishing it would imply an EU-wide intermediary register that does not currently exist. |
| European e-Justice "Find a company" as a separate record | **Duplicate of BRIS.** The portal's own text states that "Find a company" *is part of* BRIS, and both would share one URL and one embedded application. Published once, as `eu-bris`. |

### Pending manual verification

| Candidate | Operator | Verified lead URL | Blocker | Next action |
|---|---|---|---|---|
| EORI number validation | European Commission (DG TAXUD) | `https://ec.europa.eu/taxation_customs/dds2/eos/eori_home.jsp?Lang=en` | Live and official, but the classification is unresolved: it very often confirms validity **without identifying the trader**, because where the operator did not authorise publication the name and address are withheld. Neither `corporate-number-database` nor `tax-verification-system` fits cleanly when the identifying payload is usually absent. | Settle the type against the boundary notes, then publish. Do not force it. |
| Financial Transparency System (FTS) | European Commission (DG Budget) | `https://ec.europa.eu/budget/financial-transparency-system/` | Live and official, and it publishes beneficiaries of EU funds. But it is a **spending disclosure database keyed to award decisions**, not a register of entities, and the registry contract fit is arguable. | Decide whether a beneficiary-disclosure database belongs in a registry dataset at all. If yes, a new type may be needed rather than forcing `public-filing-database`. |
| EU Funding & Tenders Portal — Participant Register (PIC) | European Commission | `https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/how-to-participate/participant-register-search` | Access position unestablished; the search runs behind the portal's application shell. | Exercise the participant search and record the access position. |

### Dead, moved or non-existent — recorded so they are never proposed again

| Address | Finding |
|---|---|
| `vies.ec.europa.eu` | **Does not exist.** DNS does not resolve. This is the single most plausible-looking invented URL in the EU set: it was hypothesised, tested and disproved. VIES lives at `ec.europa.eu/taxation_customs/vies/`. |
| `ec.europa.eu/taxation_customs/vies/faqvies.do`, `viesdisc.do`, `viesspec.do` | HTTP 404. Still linked from inside the live VIES application's own text — the rewrite left stale internal links behind. |
| `taxation-customs.ec.europa.eu/online-services/.../vies-vat-number-validation_en` | HTTP 404. A plausible path that was constructed and then tested rather than assumed. The real entry point is the online-services index. |
| `webgate.ec.europa.eu/bris-search/` | Not a public entry point. The BRIS application is reached at `webgate.ec.europa.eu/bris?lang=en`. |
| `ec.europa.eu/taxation_customs/dds2/eos/eori_help.jsp` | HTTP 404. The working help path is `/dds2/eos/help/index.jsp`. |
| `e-justice.europa.eu/489/EN/business_registers__search_for_a_company_in_the_eu` | **Moved, not dead.** HTTP 301 to the `/topics/...` slug, which is now canonical. Any dataset holding the old numeric-ID form should be updated. |
| Commission Implementing Regulation (EU) 2015/884 | **No longer in force**, yet still cited on the live official BRIS page. Superseded via 2020/2244 by Implementing Regulation (EU) 2021/1042. The published record therefore describes the legal basis in general terms rather than repeating a stale citation. |

---

## Wave 1F.1 — European Union completion (2026-08-06)

The three areas Wave 1F could not research are now researched. **No candidate
remains `not researched`.** Eighteen candidates reached a determination; **six
published**.

### Resolved from Wave 1F's "not researched" list

| Area | Outcome |
|---|---|
| Intellectual property | **Researched.** eSearch plus, TMview and DesignView published. GIview classification-blocked. European Patent Register confirmed out of scope. |
| Sanctions and exclusions | **Researched.** EIB exclusion decisions published. Every EU sanctions surface classification-blocked or rejected — see below. |
| Chemicals, clinical trials, regulated products | **Researched.** EUDAMED and ECHA CHEM published. CTIS and the EU Pesticides Database classification-blocked. RASFF rejected. |

### Classification-blocked — real, official, live, but no honest type exists

These are **not** rejections and **not** coverage gaps. Each is a genuine
official system that the closed 21-type vocabulary cannot describe without
lying. Per the brief, the minimal type is proposed rather than created.

| Candidate | Official URL | Why blocked | Minimal type proposed |
|---|---|---|---|
| **CTIS — Clinical Trials Information System** | `https://euclinicaltrials.eu/` | The registered object is a **clinical trial** — not a company, licence, security, supplier, IP right, insolvency or debarment. `public-filing-database` would technically stretch to cover it, but every other member of that type is a corporate or financial filing, so it would misdescribe the record. Also note CTIS is the **publication** interface: the authorisation decision is taken by the Member States concerned, not by EMA. | `clinical-trial-register` — an internationally standard category, not a catch-all |
| **GIview** | `https://www.tmdn.org/giview/` | Geographical indications are neither trade marks nor designs nor any listed type. Its source of record is also **split**: GIs for agricultural products, wines and spirits are registered by the Commission (eAmbrosia), while EUIPO handles GIs for craft and industrial products. | `geographical-indication-register` |
| **EU Sanctions Map** | `https://www.sanctionsmap.eu/` | Its own served disclaimer settles it: the purpose is to **visualise** restrictive measures, and *"Only the legal acts published in the Official Journal of the European Union are authentic and produce legal effects."* It indexes regimes and their constituting acts, not designated persons. It must **not** be typed `exclusion-and-debarment-register`: CFSP restrictive measures (Art. 29 TEU / Art. 215 TFEU) are legally distinct from procurement debarment under the Financial Regulation. | `sanctions-and-restrictive-measures-index` |
| **Consolidated list of EU financial sanctions** (Financial Sanctions Files) | `https://webgate.ec.europa.eu/fsd/fsf` | In substance a structured designation register managed by DG FISMA and regenerated daily, but no listed type fits a CFSP asset-freeze designation list, for the same legal-instrument reason as above. Access also unresolved: the web application entered a redirect loop for an anonymous client, indicating it is credential-gated. | `sanctions-designation-list` |
| **EU Sanctions Tracker** | `https://data.europa.eu/apps/eusanctionstracker/` | The free, login-free searchable surface over the same designations. Blocked on the same vocabulary ground, and it is by its own framing a navigation tool over lists published elsewhere rather than the source. | `sanctions-designation-list` (as its public interface) |
| **EU Pesticides Database** | `https://ec.europa.eu/food/plant/pesticides/eu-pesticides-database/` | Blocked on classification **and** carrying a disclaimer strong enough to justify outright rejection: *"This database is made available solely for the purpose of information. It has no legal value."* The official information is published in the Official Journal. Part aggregator too — Member States are responsible for authorisations. | `plant-protection-product-authorisation-register` — deliberately **not** a broad "regulated products database" |

**A decision is required before any of these can ship.** **Five** distinct narrow
types are proposed, covering six systems — two of the six (the consolidated list
and the Sanctions Tracker) share one proposed type, which is why an earlier draft
of this section miscounted them as three. None should be created speculatively.

### Rejected — real and official, but not a register

| Candidate | Reason |
|---|---|
| **RASFF Window** | An **alert system**, not a register. The Commission's own page states notifications *do not* reveal commercial details, so there is no identifiable-product register behind it. |
| **DG Competition case search** (`competition-cases.ec.europa.eu`) | An enforcement **case archive** — a searchable index of antitrust, cartel, merger, State aid, DMA and Foreign Subsidies cases and their documents. A case archive is not a register, and the registry contract is not met. |
| **EU Sanctions Helpdesk** | A compliance **support and advisory platform** for SMEs — resources, publications, events, a helpdesk. It publishes no register. |
| **EU Sanctions Whistleblower Tool** | A one-way anonymous **reporting form**. It publishes nothing and holds no publicly searchable records. |
| **EDES policy page** (`.../anti-fraud-measures/edes_en`) | The parent **information page** for EDES, not the register. The register itself is already published as `eu-edes`; publishing the policy page would duplicate it with a page that holds no data. |
| **eSearch Case Law, TMclass, DESIGNclass, Similarity, IPEP, certified copies** | All live EUIPO services, none a register: case-law database, classification tools, an examiner comparison tool, a restricted enforcement platform, and a document-retrieval utility. Recorded so they are not re-proposed. |

### Out of scope — intergovernmental, not EU

| Candidate | Reason |
|---|---|
| **European Patent Register / EPO** | `https://register.epo.org/` is real, live and official, but the European Patent Office is an **intergovernmental organisation under the European Patent Convention**, not an EU institution. It is **not** an EU coverage gap. Revisit only if the architecture gains an explicit intergovernmental geography model — which Wave 1F.1 again deliberately did not create. |

### Dead, obsolete or renamed — recorded so they are never re-proposed

| Item | Finding |
|---|---|
| "Registered Community design" / "Register of Community designs" | **Obsolete terminology.** Regulation (EU) 2024/2822 renamed the right to **registered EU design** and the register to the **Register of EU designs**, applicable from 1 May 2025. The old wording is barred from public text by test. |
| EU Clinical Trials Register (`clinicaltrialsregister.eu`) | **Live but superseded for new trials.** Its own page states that all ongoing EU/EEA trials are displayed through CTIS, while EU CTR *"continues to display information on EudraCT trials"* including newly submitted results. A live legacy system with a defined residual scope — not an archive, not the current register. |
| `echa.europa.eu` (agency corporate site) | Returns HTTP 403 behind an Azure web application firewall to automated clients. **This is a bot filter, not an outage** — a future pass seeing 403 must not conclude the pages are dead. |
| `euipo.europa.eu` | Refuses some automated fetch paths with HTTP 403 while serving HTTP 200 to a normal browser. Same caution applies. |
| `www.tmdn.org` unmatched paths | Serve the application shell with HTTP 200. **A 200 on that host is not evidence that a resource exists.** |

---

## Wave 1F.1 taxonomy decision (2026-08-06)

**Five closed-vocabulary values were approved and applied.** The vocabulary went
from 21 to **26**. Five of the six systems blocked above are now published; one
remains blocked on a further functional determination.

| Approved value | Applied to | Record |
|---|---|---|
| `clinical-trial-register` | CTIS | `eu-ctis` |
| `geographical-indication-register` | GIview | `eu-giview` |
| `sanctions-and-restrictive-measures-index` | EU Sanctions Map | `eu-sanctions-map` |
| `sanctions-designation-list` | Consolidated list of EU financial sanctions | `eu-consolidated-financial-sanctions` |
| `plant-protection-product-authorisation-register` | EU Pesticides Database | `eu-pesticides-database` |

The boundaries are documented in the operator runbook and asserted from both
directions by test. In short: a **regime index** is not a **designation list**; a
designation list is not an **exclusion/debarment register**; a **geographical
indication** is not a **trade mark**; a **clinical trial register** is not a
general health database; and a **plant protection authorisation database** is not
a **chemicals register**.

### EU Sanctions Tracker — still blocked, and why

**Determination: keep blocked. Do not assign `sanctions-designation-list`.**

The decision rule was to publish it as a designation list *only if the official
system itself exposes designation records as its primary function*. It does not
demonstrably do so, on two independent grounds:

1. **No official describing page exists.** The Commission's own sanctions
   resources page — which lists the Sanctions Map, the sanctions helpdesk, the
   consolidated list, the whistleblower tool and EUR-Lex — **does not mention the
   Tracker at all**. Neither does the open data portal's news index. Its canonical
   function therefore cannot be established from any official source, which is
   itself disqualifying under the real-site rule.
2. **The only functional evidence points away from a designation list.** The
   application is client-rendered; its sole server-rendered signal is the
   navigation, in this order: **Dashboard · Regimes · Nationalities · Individuals
   · Entities**. It leads with a *Dashboard* and organises by *Regime* and
   *Nationality*, with individuals and entities as views inside that frame. On the
   three-way test that reads as **(3) an analytical or tracking interface**, with
   elements of **(2) a regime-navigation interface** — not **(1)** a designation
   list whose primary function is exposing designation records. The product name
   is, literally, "Tracker".

**Narrowest honest type, proposed but NOT recommended for creation:**
`sanctions-designation-analytics-interface` — an analytical interface over
designation data published elsewhere. **I recommend against creating it on a
single candidate.** The dataset's own rule is that a type needs evidence from
more than one system, and this one would be defined around a service whose
official description could not be found.

**Next action:** locate an official Commission or open-data-portal page that
states the Tracker's purpose. If that page shows designation records are its
primary function, publish as `sanctions-designation-list`. If it confirms an
analytical role, leave it unpublished unless a second analytics candidate ever
justifies the type. Do not publish on the navigation alone.

### Access positions worth carrying forward

- **Consolidated list (`webgate.ec.europa.eu/fsd/fsf`)** — the web application
  entered a **redirect loop** for an anonymous client and never served a page,
  indicating it is credential-gated. Published with `accessLevel: unknown` and
  every boolean null. Next action: establish whether an EU Login account is
  required, and locate the stable download URL the Commission documents.
- **CTIS** — open access is recorded from EMA's own documentation, not from an
  executed search: *"Anybody can view information held in CTIS on clinical trials
  in the EU and EEA, by using the searchable public website."*
- **GIview, Sanctions Map, EU Pesticides Database** — all client-rendered; every
  access boolean null.

---

## Wave 2A — Continental Europe financial & regulatory registries (2026-08-06)

Ten candidates reached a determination across six countries; **eight published**.

**Researched and adversarially reviewed directly, in two separate passes.** The
agent fleet failed twice on the monthly spend limit — five of five agents in the
Wave 2 dispatch, returning nothing — so it is not an available dependency and
nothing in this wave rests on subagent output.

### Approved and published

| Candidate | Country | Operator | Note |
|---|---|---|---|
| REGAFI / REFASSU | France | ACPR | One portal, two populations — published as **one** record |
| ORIAS | France | Register-keeping body under Treasury supervision | **Not** the regulator |
| BaFin Unternehmensdatenbank | Germany | BaFin | Warning lists deliberately excluded |
| KNF Wyszukiwarka podmiotów | Poland | KNF | Carries the operator's own incompleteness caveat |
| ČNB seznamy regulovaných subjektů | Czechia | ČNB | One application, three output modes — **one** record |
| Registro on-line de entidades | Spain | Banco de España | Shared host with the agents register |
| Registro de agentes | Spain | Banco de España | Distinct population, distinct official name |
| Albi ed elenchi di vigilanza | Italy | Banca d'Italia | Unauthorised activity is criminally sanctioned |

### Pending manual verification

| Candidate | Country | Blocker | Next action |
|---|---|---|---|
| **IVASS public inquiry** | Italy | **Access established as credential-gated.** `infostat-ivass.bancaditalia.it` redirects to a Banca d'Italia **one-time-password login**. A login page is not an open public registry. This resolves the access question left open since Wave 1E — the answer is that there is no anonymous route. | Determine whether IVASS publishes any *open* register surface elsewhere on `ivass.it`. If it does not, the honest outcome may be a record with a gated access level rather than no record. |

### Targeted research incomplete

| Candidate | Country | Blocker | Next action |
|---|---|---|---|
| **CONSOB registers** | Italy | The supervised-entities page returns a **Radware CAPTCHA page** to automated clients. The CONSOB homepage itself serves normally, so this is a bot filter on the register path, not an outage. Identity could not be established from a register page. | Reach the albi ed elenchi through a browser, confirm which are distinct statutory registers, and settle whether any duplicates the existing CNMV-style coverage. |

### Not researched in this phase, by scope

United Kingdom, United States, Canada and Australia were **explicitly out of scope**
for Wave 2A and are carried to **Wave 2B**. The open questions there are already
identified: PRA versus FCA duplication (UK), NMLS / NCUA / MSRB (US), OSFI / CIRO /
FINTRAC (Canada), and AUSTRAC plus the ASIC/APRA duplication question (Australia).

### Findings worth carrying forward

- **`app.bde.es` hosts several Bank of Spain applications**, only two of which are
  registers. `ree_mle` is a business-multilocation visualiser and `sew_www` is a
  sectorisation of the Spanish economy — neither is a register, and neither should
  be proposed.
- **Guessed paths are not evidence.** Constructed URLs for Banco de España, CONSOB,
  Banca d'Italia and ČNB all returned 404 before navigation found the real ones.
  Every published URL in this wave was reached by following official navigation.

---

## Wave 2B — UK, US, Canada & Australia financial registries (2026-08-06)

**Nineteen candidates determined. Two published.** This wave's dominant output is
duplicate determinations, which the brief correctly anticipated: the FCA, ASIC and
APRA entries already in the dataset are deliberately broad and absorb most
candidates. Researched directly in two passes; no subagents.

### Approved and published (2)

| Candidate | Country | Decision |
|---|---|---|
| **FINTRAC Money Services Business Registry** | Canada | The register, reached by navigating the agency's own site — deliberately **not** the guidance landing page, which is a different URL. |
| **NCUA Credit Union Locator** | United States | **One** record covering both the locator and the Research a Credit Union view: one dataset, one host, two UI views. |

### Duplicate — absorbed by an existing record (5)

| Candidate | Absorbed by | Evidence |
|---|---|---|
| **PRA-authorised firms** | `gb-fca-register` | The Bank of England's own page states PRA firm data is *"published on the Financial Services Register"*, and directs readers to the register's "Other Registers" section for Bank Holding Companies. The FCA record already states it covers firms authorised by the FCA **or the PRA**. |
| **PRA standalone firm lists** (e.g. designated investment firms CSV) | `gb-fca-register` | Downloadable **publications** of a subset already in the register, not a separate searchable system. |
| **FCA Warning List** | `gb-fca-register` | The existing record already states it carries warnings about unauthorised and clone firms. |
| **ASIC financial advisers / banned and disqualified views** | `au-asic-registers` | The existing record explicitly covers "financial adviser and banned-person registers". ASIC Connect tabs are filtered views. |
| **APRA per-sector lists** (ADIs, insurers, superannuation) | `au-apra-registers` | Filtered populations inside one published register set. |

### Pending manual verification — host blocked to automated clients (4)

| Candidate | Country | Blocker | Next action |
|---|---|---|---|
| **NMLS Consumer Access** | US | `nmlsconsumeraccess.org` returns **HTTP 403** to every automated request. | Reach it in a browser. Then settle the source-of-record question the brief raises: NMLS is operated through a multistate regulator association, and **state regulators remain the source of record for each state licence**. It must not be described as a federal register. |
| **CIRO** | Canada | `ciro.ca` returns **HTTP 403**. | Reach it in a browser and determine whether the public product is an advisor search, a dealer-member directory, an enforcement database, or a combination — and that CIRO membership is **not** universal Canadian securities authorisation. |
| **AUSTRAC** | Australia | `austrac.gov.au` did not respond at all (connection failure, not a 403) on repeated attempts with full browser headers. | Reach it in a browser. Determine whether a public register exists at all, and distinguish **remittance-sector registration** and digital currency exchange registration from general AML reporting-entity status — not all reporting entities appear publicly. |
| **OSFI regulated entities** | Canada | Institution-list links were not locatable from the OSFI homepage navigation, and guessed paths 404. | Navigate in a browser. Determine whether one list covers all federally regulated financial institutions or whether banks, insurers, trust companies and pension plans are separate systems — **do not split by sector without evidence**. |

### Targeted research incomplete (3)

| Candidate | Country | State |
|---|---|---|
| **MSRB / EMMA** | US | Both hosts respond. Not analysed to publication standard. The key question is unresolved: EMMA is a **securities disclosure** database, not a professional licence register, and municipal disclosures must not be classified as a licence register. |
| **The Pensions Regulator** | UK | Host responds. Not analysed. Determine whether the scheme register is publicly searchable. |
| **Bank of England FMI / recognised payment system lists** | UK | Not analysed. Likely publications rather than registers. |

### Rejected (0 this wave)

None. No candidate was rejected outright; the ones not published are duplicates,
pending, or incomplete.

### Findings worth carrying forward

- **The FCA register is the UK's single financial front door.** PRA authorisation
  is surfaced through it. Any future UK financial candidate must be tested against
  that record first.
- **Anglophone financial regulators are heavily bot-protected.** NMLS (403), CIRO
  (403), AUSTRAC (no response) and NCUA's application host (no response) all
  refused automated clients, while the regulators' own describing pages served
  normally. A 403 is a bot filter, not evidence that a register does not exist.
- **NCUA's application host does not respond to automated requests**, so its record
  rests on identity and function confirmed from `ncua.gov` itself. That limitation
  is disclosed in the published text, not only in editor notes.

---

## Wave 3A-1 — United Kingdom & Czech Republic professional registers (2026-08-06)

First wave of the professional-licence layer. Wave 3A was split on scope: Germany
and France are deferred to Wave 3A-2 and were **not researched here**, so nothing
below should be read as a finding about them.

Healthcare regulators were excluded by the brief and are not candidates.

### Approved and published (7)

| Record | Country | Profession | Effect of entry |
|---|---|---|---|
| `gb-arb-architects-register` | UK | Architects | **Title only.** Required to use the word "architect", not to do the work. |
| `gb-engc-regcheck` | UK | Engineers | **Title only**, and under a Royal Charter rather than statute. |
| `gb-ipreg-register` | UK | Patent & trade mark attorneys | Regulated status; two professions and firms in one search. |
| `cz-cak-advokati` | CZ | Advocates | **Practice.** Entry in the statutory register of advocates. |
| `cz-nkcr-notari` | CZ | Notaries | Holding of a notarial office, appointed by the state. |
| `cz-cka-autorizovani-architekti` | CZ | Authorised architects | **Practice.** Authorisation for reserved activities. |
| `cz-ckait-autorizovane-osoby` | CZ | Authorised engineers & technicians | **Practice.** Authorisation for reserved activities. |

### The distinction this wave exists to hold

**A protected-title register is not a licence to practise.** ARB and the
Engineering Council both restrict a *title*; neither restricts the *work*. The
Czech chambers restrict *reserved activities*. Both kinds are
`professional-licence-register`, but the legal effect differs, and every record
now states which it is **in rendered prose** — not in editor notes.

The type boundary in `bd-registry-types.cjs` was clarified rather than split. A
new `protected-professional-title-register` type would have rested on two
candidates whose protection comes from different sources (statute for ARB, Royal
Charter for the Engineering Council), which is a distinction that belongs in
prose, not in the enum.

### Determinations that must not be silently reversed

| Question | Determination | Evidence |
|---|---|---|
| Is ARB statutory? | **Yes.** | The board states it "was established by Parliament in 1997 to regulate the architects' profession in the UK". |
| Is the Engineering Council a statutory regulator? | **No.** It operates "as a charity under Royal Charter"; the titles "are protected under our Royal Charter". Typed `chartered-body`, not `regulator`. |
| Is IPReg one record or two? | **One.** The page says "Search our registers" (plural — reflecting the underlying statutory registers), but the public interface is a single form at one URL covering both professions and firms. Splitting it would split a system by its own filter. |
| Are the two Czech construction chambers one? | **No.** ČKA (architects) and ČKAIT (engineers and technicians) are separate chambers with separate lists. Each record says the other exists, because absence from one says nothing about the other. |
| Do these registers cover individuals or firms? | **Individuals**, except IPReg, which records firms too. ARB and the Engineering Council register practitioners, not employers — now stated in each record, because a reader checking a business would otherwise draw the wrong conclusion. |

### Access — nothing claimed that was not observed

All seven ship `accessLevel: partially-open` with `loginRequired: false` (an
anonymous load was observed) and **every other access field null**. No search was
executed on any of them, so result content, coverage and limits are not asserted.

**Fully-unknown access: 0% — the brief's 50% ceiling passes with room to spare.**

Note on `accepts`: these registers cover **individual practitioners**, so they
carry `accepts.localBusiness: null`, matching the barristers/NMC/HCPC precedent.
IPReg is the single exception — it records firms alongside individuals.

Two limitations worth carrying:

- **ČKAIT's page presents "Výběry ze seznamu"** — *selections from* the list — and
  the record deliberately does not upgrade that into a claim to be the complete
  register. Its form also requires JavaScript, so it could not be exercised.
- **Engineering Council RegCheck requires an exact match**, and the council itself
  warns that an unexpected nil result does not establish that someone is
  unregistered. This is in the published limitations, because a reader who does
  not know it will misread a nil result as proof.

### Not researched in this phase, by scope

Germany and France (Wave 3A-2): Rechtsanwaltskammern, Wirtschaftsprüferkammer,
Architektenkammern, Bundesnotarkammer; the French ordres and CNB. **No conclusion
about any of them is recorded here.**

UK candidates deliberately not added: solicitors, barristers and Scottish
solicitors were checked against existing records and **already covered** —
`gb-sra-solicitors-register` and `gb-barristers-register` are published, and no
duplicate was created. The Law Society of Scotland's host refused automated
clients; a 403 is a bot filter, not evidence of absence.

Czech candidates not published: the auditors' chamber (KAČR) and the tax advisers'
chamber were not analysed to publication standard in this wave.

### Findings worth carrying forward

- **Reachability is not approval.** Every record here was reachable; publication
  still turned on whether an official body responsible for the profession holds
  the register and entry follows its registration decision.
- **A coverage manifest drifts silently.** Adding three UK-wide records left
  `united-kingdom-territorial-coverage.json` claiming 24 records and 8 UK-wide.
  It was corrected to 27 and 11, and is now **pinned to the registry by test** —
  the same defect Canada's manifest had in Wave 2B, which nothing was enforcing.
- **Structured data can contradict rendered prose without anything failing.**
  Five records carried `accepts.localBusiness: true` while their own text said a
  firm is not registered — which would have listed them in an audience guide for
  readers looking for their business. Corrected to `null`; only IPReg, which
  genuinely records firms, keeps `true`. The rule is now pinned by test in both
  directions. It was found by chasing why two unrelated pages changed in a
  `git status`, not by any check.
- **A rendered-caveat guard must check every limitation, not the first.** The
  existing check only asserted `cons[0]` reached the page, so dropping any later
  limitation was invisible. It now checks all of them.
