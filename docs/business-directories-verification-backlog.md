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
