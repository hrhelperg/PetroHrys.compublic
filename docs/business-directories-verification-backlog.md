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
| Is the Engineering Council a statutory regulator? | **No.** It operates "as a charity under Royal Charter"; the titles "are protected under our Royal Charter". Typed `public-law-body`, not `regulator`. |
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

---

## Wave 3A-2 — Germany & France professional registers (2026-08-06)

Second half of the professional-licence pilot, completing the split made at Wave
3A-1. Healthcare regulators remain out of scope by brief.

### The finding that matters most is negative

**Germany has no national register for most regulated professions.** This was
tested against each federal body's own words, not assumed:

| Profession | Federal body | Legal form, verbatim | Publishable? |
|---|---|---|---|
| Architects | BAK | "Bundesgemeinschaft der Architektenkammern, Körperschaften des Öffentlichen Rechts **e.V.**" | **No** |
| Engineers | BIngK | "Bundesingenieurkammer **e. V.**" | **No** |
| Doctors | BÄK | "die **Spitzenorganisation** der ärztlichen Selbstverwaltung" | **No** |
| Pharmacists | ABDA | "**Bundesvereinigung** Deutscher Apothekerverbände" | **No** |
| Vets | BTK | "als **Dachverband** der Landes-/Tierärztekammern, die Körperschaften öffentlichen Rechts sind" | **No** |

In each case the Länder chambers are the public-law bodies that hold the lists.
Publishing a federal record would publish an association directory. **A test pins
all five hosts as unpublishable** so a later wave cannot quietly add them.

The BÄK "Arztsuche" deserves its own note, because it looks like a national
register and is not one. It is a signpost to sixteen Länder services, and the
page states that the chambers and regional associations "als einzige die validen
Angaben" hold the valid data, that some offer only telephone enquiries, and that
"nicht alle Organisationen online vertreten sind". Its own coverage is admittedly
incomplete.

### Approved and published (10)

| Record | Country | Profession | Statutory basis / effect |
|---|---|---|---|
| `de-brak-anwaltsverzeichnis` | DE | Lawyers | Admission under the BRAO; required to practise |
| `de-wpk-berufsregister` | DE | Auditors | § 37(1) s.1 WPO; also the EU statutory auditor register |
| `de-patentanwaltsverzeichnis` | DE | Patent attorneys | Admission under the PAO; incl. §§ 52f/159 firms |
| `de-steuerberaterverzeichnis` | DE | Tax advisers | § 86b StBerG; unrestricted assistance |
| `de-stbk-eu-dienstleister-steuersachen` | DE | Cross-border providers | § 3b StBerG; **temporary and occasional** only |
| `de-stbk-partiell-zugelassene-steuersachen` | DE | Partial-access holders | § 3g StBerG; **restricted** to granted activities |
| `fr-tableau-architectes` | FR | Architects | Roll of the Order; title **and** reserved design work |
| `fr-annuaire-experts-comptables` | FR | Chartered accountants | Roll of the Order; "prérogative exclusive" |
| `fr-inpi-conseils-propriete-industrielle` | FR | IP attorneys | List held by INPI; reserved activity **not established** |
| `fr-notaires-annuaire-officiel` | FR | Notaries | Appointment to a notarial office by the state |

### A national interface is usually not the legal source of record

This wave found the NMLS pattern from the Wave 3A-4 brief two waves early, in
both countries:

- **BAV** — the search host states "Disciplinary control is exercised by the
  respective regional Bar to which the lawyer is admitted."
- **Steuerberaterverzeichnis** — "basiert auf den Daten der Berufsregister, die
  von den **örtlich zuständigen Steuerberaterkammern** geführt werden".
- **Tableau des architectes** — "mis à jour en permanence par les **Conseils
  régionaux** de l'Ordre".
- **Experts-comptables** — unresolved cases go to "le Conseil de l'Ordre de
  **votre région**".

A test asserts each of these four says so in rendered prose.

### Duplicate determinations

- **WPK is ONE record.** Its register "erfüllt **zugleich** die Aufgabe des
  Abschlussprüferregisters" — one system discharging both the national
  professional register and the EU Audit Directive register.
- **REJECTED as registers:** the WPK "Liste der Abschlussprüfer und
  Prüfungsgesellschaften" (a **download** for Art. 16(3) EU Reg. 537/2014
  selection procedures) and its "Suche nach Spezialkenntnissen" (a filtered view).
- **BRAK "Anwaltssuche" is a signpost page**, not a second system.
- **The three tax registers are THREE records.** Three statutory bases (§ 86b,
  § 3b, § 3g), three authorisation regimes, three populations and three hosts.
  They cross-reference each other because absence from one says nothing about the
  other two.
- **REJECTED as a marketing directory:** `architectes-pour-tous.fr` ("Trouver un
  architecte") invites a visitor to "sélectionner des architectes prêts à vous
  accompagner", filtered by project type and MaPrimeRénov' referencing. It is a
  client-matching finder run by the Order, not the roll.

### The register keeper is not the profession's own body

The French list of conseils en propriété industrielle is published by **INPI**,
the state industrial property institute — not by the CNCPI, which is the
profession's own national body. Naming the organisation as keeper is the error
corrected for ORIAS in Wave 2A and the Colegio de Registradores in Wave 1D.

### Not published — and why

| Candidate | State |
|---|---|
| **German notaries** | BNotK **is** a Körperschaft des öffentlichen Rechts with 21 regional chambers, but no statutory nationwide *Verzeichnis* was established. notar.de offers a consumer "Notarsuche"; BNotK's own site carries only a *European* notary directory. Reachability is not approval — **not published**. |
| **French avocats** | The CNB "Annuaire des avocats de France" (78,938 entries at 1 Jan 2026) is cookie-gated on the CNB page and its application at `e-annuaire.avocat.fr` is a JavaScript app that could not be read. Data comes "directement des informations enregistrées auprès de votre ordre". No official designation established — **not published**. |
| **CNCC** (commissaires aux comptes) | Host responds; the site is a JavaScript app with no extractable text. Not analysed to publication standard. |
| **French healthcare / RPPS** | `annuaire.sante.fr` returned a transport failure (000) on probe. **That is not evidence the register is absent.** Re-check in a browser. |
| **German Länder chambers** | Sixteen architects' chambers, sixteen engineers' chambers, seventeen medical chambers and their equivalents were **not** individually researched. Each would be its own record at subnational scope. |

### Findings worth carrying forward

- **`e.V.` is the tell.** A German federal body whose legal form is a registered
  association is not a register keeper, however official its name sounds.
- **A shared-host group names ONE host.** Three registers on three subdomains of
  one parent domain do not share a host, and the validator rejects a group that
  spans them. `resourceIdentity` was removed from all three tax records.
- **An already-measured domain must reuse its snapshot.** `inpi.fr` was measured
  at Wave 1-era DR 85; the new attorney directory reuses that snapshot verbatim
  rather than carrying null. Same domain, same measurement — the frozen set stays
  at 64 and the digest is unchanged. Records displaying a rating went 66 → 67.
- **A description must carry its own restriction.** A caveat that survives only in
  `cons` or `notRecommendedFor` does not travel into listings or metadata.

---

## Wave 3A-3 — Poland, Italy & Spain professional registers (2026-08-06)

Third professional-licence wave. **Six records published, not thirty.** The brief
listed roughly ten professions per country; accuracy over quantity governed what
shipped, and everything not published is recorded below with its reason.

### Approved and published (6)

| Record | Country | Profession | Effect of entry |
|---|---|---|---|
| `pl-kirp-lista-radcow-prawnych` | PL | Legal advisers | Required to practise; **includes non-practising members** |
| `pl-pibr-rejestr-bieglych-rewidentow` | PL | Statutory auditors | Required for statutory audit; **individuals only** |
| `pl-kidp-lista-doradcow-podatkowych` | PL | Tax advisers | **Statutory condition** of practising; fine up to 50,000 zł |
| `it-cndcec-albo-nazionale` | IT | Chartered accountants | Roll entry; 131 territorial Ordini, ~120,000 members |
| `it-notariato-albo-unico-notai` | IT | Notaries | Albo Unico under art. 3, D.P.R. 137/2012 |
| `es-icac-roac` | ES | Auditors & audit firms | Required for statutory audit; state-kept register |

### Status distinctions that would mislead if flattened

This wave's dominant risk was not duplication — it was **flattening a status
distinction the register genuinely records**. Four are pinned by test:

- **A Polish legal adviser may be entered but not practising.** The list exposes
  "Wykonuje zawód" / "Nie wykonuje zawodu" as a filter. A hit alone does not
  establish that someone is currently providing legal services.
- **Polish advocates (adwokaci) are a different profession.** Absence from the
  legal advisers' list says nothing about whether a person may act as a lawyer.
- **The Polish auditor register excludes firms.** Audit firms are on a separate
  chamber list.
- **Italian notaries cannot be searched by name.** The page instructs "Non
  inserire il nome del notaio" — it is a regional finder, not a name-verification
  tool.

### Aggregation, again

The national interface is not the legal source of record in any of the three:
nineteen Polish OIRP chambers, sixteen KIDP regional chambers, 131 Italian
territorial Ordini. For the Italian notaries the council states outright that "Il
CNN **non può effettuare variazioni e/o aggiornamenti** alle informazioni",
because the Ordini and the notaries themselves enter the data.

### Duplicate determinations

- **The Italian roll is ONE record.** "Ricerca Iscritti", "Ricerca Società" and
  "Ricerca Prestazioni" sit under a single "Albo Nazionale" heading — three views
  of one roll, not three registers.
- **ROAC is ONE record.** Its Art. 16.3a EU Reg. 537/2014 listing is a
  publication for selection procedures — the identical rejection made for the
  German chamber's equivalent list in Wave 3A-2. Its sanctions view and
  third-country view are views over the same register.
- **KIDP's "Rejestr podmiotów uprawnionych" is a static PDF**, not a searchable
  register. Recorded as a limitation of the tax adviser record, not published.
- **PIBR's "Lista firm audytorskich" was NOT published.** Polish audit oversight
  was restructured in 2020 and the question of which body keeps the firm list was
  not settled from official text. Not merged, not invented.

### Rejected as candidates

Two KIRP lists — representatives before the European Court of Human Rights, and
advisers supporting victims of human trafficking — are **thematic sign-up lists**,
not registers of entitlement.

### Not published, and why

| Candidate | State |
|---|---|
| **Italian statutory auditors (MEF)** | `revisionelegale.mef.gov.it` returned a **transport failure (000)** on https, http and www, and the ministry homepage carries no link to it. **This is not evidence the register is absent.** Re-check in a browser. |
| **Spanish notaries** | `notariado.org` "Elige a tu notario" is a navigation shell; no register content could be extracted. |
| **Spanish architects** | CSCAE exposes "Registro arquitectos" and "Registro sociedades" under its ventanilla única, but both pages rendered as navigation only. |
| **Spanish procuradores** | `cgpe.es` exposes a "Directorio" that resolves to a colegio list, not a register of individuals. |
| **Spanish economists** | `economistas.es` returned **HTTP 403** to automated clients — a bot filter, not absence. |
| **Spanish abogados (CGAE)** | No register or census link found on `abogacia.es`. |
| **Polish advocates (NRA)** | No register link found on `nra.pl`; the advocates' register is understood to live on a separate host that was not established from official navigation. |
| **Italian avvocati, engineers, architects, doctors, pharmacists, consulenti del lavoro** | Not analysed to publication standard. |
| **Polish notaries, bailiffs, patent attorneys, architects, engineers** | Not analysed to publication standard. |
| **Healthcare in all three** | Not analysed. |

### Findings worth carrying forward

- **A status filter is a warning, not a feature.** Where a register exposes
  practising status, the record must say the list contains both, because the
  default reading of a hit is "this person is practising".
- **The Art. 16.3a listing recurs across every EU member state's audit
  regulator.** It is a publication for selection procedures. Reject it every time.
- **A probe that only filters the arrays is incomplete.** Both Wave 3A-3
  survivors turned out to be facts that also lived in the `description`, which
  `strip()` never touched. The records were telling readers the truth; the probes
  had not injected the defect.

---

## Wave 4 — Telecommunications, spectrum & licensing registries (2026-08-06)

First telecommunications wave. **Eight records across four jurisdictions**, from a
brief listing eleven. Priority was legal truth, not count.

### The legal truth this wave establishes

Under the European Electronic Communications Code, operating a public electronic
communications network or service requires **no individual licence** — only a
**notification** under a general authorisation. Spectrum and numbering are the
opposite: those are individual rights granted one at a time. One regulator
therefore keeps several legally different registers:

| System | Legal act | Evidence |
|---|---|---|
| Operator register | **Notification** | § 13 ZEK (CZ) · § 5 TKG (DE) · art. 6.2 Ley 11/2022 (ES) |
| Numbering register | Individual **right of use** granted | art. 30.5 Ley 11/2022 (ES) |
| Spectrum register | Individual **authorisation** granted | *individuální oprávnění* (CZ) |

Being on one proves nothing about the others. Every record says so in rendered
prose, and a test asserts it.

### Approved and published (8)

| Record | Jurisdiction | System |
|---|---|---|
| `eu-berec-gadb` | EU | Union database of general-authorisation notifications |
| `cz-ctu-evidence-podnikatelu-ek` | CZ | Operator register (§ 13 ZEK notification) |
| `cz-ctu-pridelena-cisla-a-kody` | CZ | Allocated numbers and codes |
| `cz-ctu-individualni-opravneni-kmitocty` | CZ | Individual spectrum authorisations |
| `cz-ctu-evidence-postovnich-provozovatelu` | CZ | Postal operators (same regulator) |
| `de-bnetza-verzeichnis-gemeldeter-unternehmen` | DE | § 5(4) TKG directory (spreadsheet) |
| `es-cnmc-registro-operadores` | ES | Register of operators (art. 6.2) |
| `es-cnmc-registro-numeracion` | ES | Numbering rights of use (art. 30.5) |

### Listed is not operating

Three of these registers demonstrably retain entities that have stopped:

- The Czech operator register covers undertakings that **"byli či jsou oprávněni"**
  — *were or are* authorised — and offers a filter to exclude interrupted or
  terminated ones. It reported 2,845 records.
- The Czech postal register offers *"Vyhledávat i provozovatele s ukončenou
  činností"*.
- Spain confirms continuation only **every three years**, and cessation depends on
  the operator notifying it.

### What absence does not prove

**Number-independent interpersonal communications services — email and messaging —
are outside the notification duty** in Czechia and Germany. Germany quotes § 5 TKG
excluding them expressly since 1 December 2021. Spain is the instructive contrast:
those providers *do* notify, but **"a efectos estadísticos y censales"** — a
different legal effect from an operator's entry.

### Duplicate determinations

- **ČTÚ publishes fourteen search databases; four were published.** The radio and
  television transmitter overviews are **filtered views** of the individual
  spectrum authorisations — the TV one names itself *"Přehled platných
  individuálních oprávnění – televizní vysílače"*. The point-to-point 71–76/81–86
  GHz dataset is a technical view.
- **Rejected as registers:** ČTÚ's *Cenový barometr* (price comparison) and its
  blocked-website list — neither records an authorisation; CNMC's mobile and fixed
  **portability status** pages — they report the operational state of a process.
- **Predecessor databases are not separate systems.** The Czech pre-2022 operator
  database and pre-2024 postal database are temporal predecessors, described in
  the records rather than published separately.
- **The Union database is not merged with any national register**, and no national
  register is merged into it. BEREC aggregates; the **national register remains
  the legal source of record**.
- **Germany's spreadsheet IS the register's published form** under § 5(4) TKG, so
  it was published — unlike the German audit chamber's Art. 16(3) list rejected in
  Wave 3A-2, which was derived from a register that had its own search.

### No US record was added

`us-fcc-uls` (spectrum) and `us-fcc-form-499` (carrier registration) already
exist. A test asserts this wave added no US record, so any future US telecom
candidate must be tested against those two first.

### Blocked to automated clients — NOT evidence of absence

| Regulator | State |
|---|---|
| **Ofcom** (UK) | HTTP 403 |
| **FCC** (US) | HTTP 403 |
| **ACMA** (Australia) | transport failure (000) |
| **ARCEP** (France) | F5 bot shield — *"Please enable JavaScript to view the page content. Your support ID is…"* |
| **CRTC** (Canada) | responds, but served a 597-character JavaScript shell |

All five are Tier 1 in the brief. Every one must be reached in a browser before
any conclusion is recorded.

### Researched but not published

AGCOM (Italy) — the ROC was not located from official navigation to publication
standard. UKE (Poland) — the telecoms undertakings register was not exposed on the
homepage and was not established from official navigation. ISED (Canada) —
spectrum licensing not analysed. CNMC's *Registro de alias* and digital
terrestrial television register — not analysed. BNetzA numbering and frequency
systems — not analysed; only the § 5 directory was.

### Findings worth carrying forward

- **"Notification" is the word to look for in any EU telecoms register.** If a
  record says "licence" about market entry in an EU member state, it is almost
  certainly wrong.
- **Count the regulator's portals before publishing any of them.** ČTÚ has
  fourteen; four are distinct statutory systems.
- **A probe that skips the description does not inject its defect.** This was the
  survivor cause in Waves 3A-1, 3A-2 and 3A-3. The Wave 4 harness strips the
  description by construction, and had zero survivors on its first valid run.

---

## Wave 4A-2 — Core telecom regulator completion (2026-08-06)

A **boundary wave**. Seven regulators researched; **two records published**. Five
produced pending or incomplete determinations. Per the brief, a duplicate,
rejection or pending determination is a valid outcome and no regulator was forced
to yield a record.

### Approved (2)

| Record | Jurisdiction | Shape |
|---|---|---|
| `us-fcc-public-inspection-files` | US | **Disclosure/filing** system — broadcast, cable, DBS, SDARS |
| `ca-crtc-registered-telecom-providers` | CA | **Registration** — mandatory before offering service |

Neither is a licence register, and both say so. Together they add two shapes Wave
4 did not cover: a broadcaster's *disclosure obligation*, and a *registration*
that is expressly not the international licence.

### Seven-jurisdiction matrix

| Regulator | Candidate | Outcome | Reason |
|---|---|---|---|
| **Ofcom** (UK) | all systems | **pending browser** | Host refused automated clients on both apex and www. No official page reachable; no system identified. |
| **FCC** (US) | Public Inspection Files | **approved** | Distinct population and legal function; only reachable FCC host. |
| | CORES, ICFS, LMS, ASR, robocall DB, §214 | **targeted research incomplete** | Main host and app subdomains refused automated clients. |
| | ULS / Form 499 | **already published** | Unchanged; duplicate audit documented on the new record. |
| **CRTC** (CA) | Registered Telecommunications Providers | **approved** | Identity + function from official describing pages. |
| | Withdrawn and Incomplete Providers | **duplicate** | Historical face of the same registration act — a current/historical toggle. Absorbed by `ca-crtc-registered-telecom-providers`. |
| | Quality of Service Indicator | **rejected** | Reports operational performance, not an authorisation. |
| | BITS licence | **targeted research incomplete** | A genuinely distinct legal act, but only *applications* are published; no register of licensees located. |
| **ACMA** (AU) | Register of Radiocommunications Licences | **pending browser** | `web.acma.gov.au` refused automated clients; `www.acma.gov.au` did not respond at all. Host confirmed to exist. |
| **ARCEP** (FR) | operator declarations, numbering | **pending browser** | F5 bot shield — *"Please enable JavaScript to view the page content. Your support ID is…"* |
| **ANFR** (FR) | spectrum authorisations | **targeted research incomplete** | Readable, and **confirmed as the French spectrum authority**, but no discrete public register system located. |
| | Cartoradio | **rejected** | A cartographic platform. The wave contract rejects map views. |
| **AGCOM** (IT) | ROC | **pending browser** | Angular SPA at `datiroc.agcom.it/elenco-pubblico`; AGCOM links it as "ROC" but its **scope** — telecom operators, media operators or both — could not be established, which is the whole question. |
| **UKE** (PL) | Rejestr przedsiębiorców telekomunikacyjnych | **targeted research incomplete** | Homepage exposes 48 links, all news; navigation does not reach the registers. A constructed URL landed on an unrelated article and was discarded. |
| | NIS2 key-entities list | **rejected** | A cybersecurity register, **not** a telecom operator register. Recorded so the two are never confused. |

### The determination that matters most

**ARCEP is not the French spectrum authority — ANFR is.** ANFR's own site states
the spectrum belongs to the State's public domain, *"qui en a confié la gestion à
l'ANFR"*, and reports the 5G and 4G sites *"autorisés par l'ANFR"*. A test now
forbids any French record from attributing a spectrum function to ARCEP.

### Boundary rules applied

- **Do not split a historical toggle.** The CRTC withdrawn list is the negative of
  the same registration act; it is described inside the registration record so a
  reader who finds nothing knows where a removed provider goes.
- **Three FCC subdomains are three hosts**, so no shared-host group applies —
  consistent with the Czech tax-register determination in Wave 3A-2.
- **A disclosure system is not a register of authorisations.** The FCC public file
  proves an entity has a public file obligation and has filed. Nothing more.

### Browser verification queue

| Candidate | Exact URL | Blocker | One browser action | Must stay null until observed |
|---|---|---|---|---|
| Ofcom systems | `https://www.ofcom.org.uk/` | WAF (refuses automated clients) | Open and navigate to spectrum/numbering/broadcast register pages; record exact system names and URLs | everything — no system identified yet |
| ACMA RRL | `https://web.acma.gov.au/rrl/register_search.main_page` | WAF | Open; confirm the register's official name and whether spectrum and apparatus licences are one system | accessLevel, all booleans |
| ARCEP | `https://www.arcep.fr/` | F5 bot shield | Open; confirm whether an operator declaration list is still published and whether the duty persists | accessLevel, all booleans |
| AGCOM ROC | `https://datiroc.agcom.it/elenco-pubblico` | Angular SPA | Open; determine whether ROC covers telecom operators, media operators or both | scope, accessLevel, all booleans |
| UKE registers | `https://www.uke.gov.pl/` | JS-driven navigation | Open; navigate to the register index and record exact URLs | everything |
| FCC ULS / Form 499 | existing record URLs | WAF appeared **after** Wave 4 | Confirm both systems still serve browsers | nothing — records unchanged; 403 is not absence |

### Findings worth carrying forward

- **A bot filter can appear between waves.** `wireless2.fcc.gov` and
  `apps.fcc.gov` served automated clients when Waves 1–4 authored records on them
  and refuse now. The records were not changed: refusal is not absence.
- **`accessLevel: unknown` may not carry an observed boolean.** An existing guard
  and the wave brief agree. Reaching a page anonymously does not establish that
  the register behind it needs no credential.
- **No published field may contain an HTTP status code** — including
  `editorNotes`. Describe the host's behaviour instead.
- **A cross-country mutation probe must write to the target country's file**, or
  the validator catches placement and the semantic guard under test never runs.
  Four probes in this wave were initially wrong in exactly that way.

---

## Wave 4B — Telecom service & licence boundary audit (2026-08-06)

A boundary audit across VoIP, MVNO, broadcasting, satellite, fixed wireless,
number portability and postal. **One record published.** Almost everything else
resolved to an absorbed view, an operational database, or a browser-blocked
pending determination — which the brief states is a successful outcome.

### Approved (1)

| Record | Jurisdiction | Why it is not a duplicate |
|---|---|---|
| `de-bnetza-post-anbieterverzeichnis` | DE | **Entry is constitutive**, not a notification. Postal services may only be provided by entered providers, and a provider may only subcontract to an entered provider. Different Act, different population, different legal effect from the § 5 TKG telecom directory it shares a host with. |

### The service-category determination

**VoIP, MVNO and fixed wireless are service categories, not statutory
populations** — in every jurisdiction where evidence was obtainable:

- **Czechia** exposes them as *filters* on the operator register: network types
  (metallic, terrestrial radio licensed/unlicensed, satellite, 2G–5G mobile) and
  service types (number-based interpersonal fixed/mobile, M2M, internet access).
- **Germany** and **Czechia** both *exclude* number-independent interpersonal
  services — email and messaging — from the notification duty entirely.
- **Spain** includes them, but expressly *"a efectos estadísticos y censales"*.

No jurisdiction researched publishes a separate VoIP or MVNO register. A test
blocks twelve plausible invented ids and forbids any record named after a service
category.

### Czech Republic — all 14 ČTÚ databases classified

| # | Database | Status |
|---|---|---|
| 3 | Přidělená čísla a kódy | **published** (numbering) |
| 4 | Evidence podnikatelů v elektronických komunikacích | **published** (operators) |
| 6 | Evidence poštovních provozovatelů od 2024 | **published** (postal) |
| 7 | Informační portál individuálních oprávnění | **published** (spectrum) |
| 5 | Evidence poštovních provozovatelů do 2023 | absorbed — temporal predecessor |
| 8 | Technické údaje pevných rádiových systémů 71–76/81–86 GHz | absorbed — technical view of spectrum |
| 9 | Přehled rozhlasových vysílačů | absorbed — filtered spectrum view |
| 10 | Přehled televizních vysílačů | absorbed — names itself *"Přehled platných individuálních oprávnění"* |
| 11 | Evidence stanic BMIS | absorbed — coordinate-searched site inventory |
| 12 | Přehled oznámených rozhraní | absorbed — technical disclosure attached to operators already covered |
| 1–2 | Seznam schválených / oznámených zařízení | out of scope — equipment, not entities |
| 13 | Cenový barometr | rejected — price comparison |
| 14 | Jednotný seznam blokovaných internetových stránek | rejected — not an authorisation record |

**No new Czech records.** Four published, ten absorbed, rejected or out of scope.

### Germany — numbering and portability

- **Numbering** is a *hoheitliche Aufgabe* of the Bundesnetzagentur, but the
  agency publishes general rulings as PDFs rather than a searchable allocation
  register. Unlike Czechia and Spain, **no public German numbering register was
  located** → targeted research incomplete.
- **Portierungskennungen** (porting identifiers) are assigned to operators and
  documented in a number plan PDF with an application procedure. No public
  directory of assigned identifiers → not published, consistent with the wave
  default that portability systems are operational.

### Two pre-existing records were repaired

`us-fcc-uls` and `us-fcc-form-499` predate the content contract and stated
**neither** what inclusion nor what absence proves. Both now do, using only what
each record already established. This was surfaced by running the Wave 4B guard
across the whole telecom layer rather than only the new record — the alternative
would have been narrowing the guard and hiding the gap.

### Browser queue — unchanged and still blocking

Ofcom, ACMA, ARCEP, AGCOM ROC and UKE remain exactly as recorded in Wave 4A-2. No
new evidence was obtainable for any of them in this wave. **AGCOM's ROC is still
the single highest-value browser action**: its scope decides whether Italy needs
one record or three.

### Taxonomy finding — no gate triggered, but worth recording

`regulated-operator-register` now carries **12 of 13** telecom records, spanning
notification, registration, constitutive entry, numbering rights, spectrum
authorisations and postal entry. The type's own definition — *"organisations
authorised, licensed or registered to operate in a regulated sector"* — honestly
covers all of them, so **no taxonomy gate was triggered and no type was
proposed**. But the type is doing a great deal of work, and the legal distinctions
it flattens are currently carried entirely by prose and tests. A dedicated
taxonomy wave, with the browser queue cleared first so the candidate set is known,
is the right place to revisit it — not a wave that would create types for one
candidate each.

### Findings worth carrying forward

- **The validator already enforces Part 5 natively.** It rejects a record whose
  website "is not materially different … on the same host", naming query-parameter
  variants and search modes explicitly. The VoIP-filter probe was caught by that
  rule, not only by the new tests.
- **A mutation clone must carry its own `systemKey`**, or a structural collision
  masks whether the semantic guard fires. Four probes were corrected for this.
- **Running a new wave's guards across the whole existing layer finds real gaps.**
  That is how the two FCC records' missing non-proofs surfaced.

---

## Wave 1B.1 — Germany, first completed commercial-directory country (2026-08-06)

The first country in **Pillar B — Business Directory Intelligence**, and the
reference implementation for every commercial-directory country that follows.

**"Complete" means every candidate has a final status — not that every candidate
became a record.** Six candidates, four published, two deliberately not.

### Approved (4)

| Record | Category | Listing | Cost | Reviews |
|---|---|---|---|---|
| `de-gelbe-seiten` | local-business | create | free | not documented |
| `de-das-telefonbuch` | local-business | create | free | not documented |
| `de-11880` | local-business | create | free | **true** |
| `de-wlw` | general-business | create | **unknown** | not documented |

### Not published (2), and why

| Candidate | Reason |
|---|---|
| **Das Örtliche** | Business surface unreachable. `/eintrag` resolves to a **search result**, the entry-service link redirects to a mobile page, and its marketing site returns **HTTP 410 Gone**. The acceptance rule "official documentation exists" is not met. |
| **Marktplatz Mittelstand** | *"100% kostenlos & unverbindlich"* is stated, but **whether profiles are self-created or generated from other sources is documented nowhere reachable**. The acceptance rule "not scraper-generated" cannot be confirmed, and uncertainty forbids publication. |

### The duplicate decision

Gelbe Seiten, Das Telefonbuch and 11880 share a market and reference one another
as partner services. **They are three records, not one**, because each runs its
own entry service on its own domain with its own process — Gelbe Seiten routes
submissions to *"den für Ihre Region zuständigen Gelbe Seiten Verlag"* for a
*"redaktionelle Prüfung"*, which none of the others shares.

**No operator states that one entry reaches the others**, and the Das Telefonbuch
record says so explicitly so a reader does not assume cross-posting. A test scans
sentence by sentence for that claim, skipping negations.

### What was NOT asserted

No German operator documented verification methods, owner responses, indexability,
link attributes or traffic. All are `null` on all four records. `listingAction` is
`create` on all four — **no claim flow was established for any of them**, and
Gelbe Seiten's "request a change to an existing entry" route is a correction path
mediated by a publisher, not an established claim of ownership.

### Three evidence-discipline calls worth carrying forward

1. **wlw cost is `unknown`, not free.** A premium tier is offered on request; that
   establishes nothing about the basic tier. The brief forbids inferring free from
   a registration route and paid from a premium tier.
2. **11880 has ratings but no documented owner response.** The operator sells a
   paid *"Bewertungsmanagement"* product — a separate commercial offering, not
   evidence that replying is included in the free entry.
3. **Gelbe Seiten entries are requests, not publications.** Editorial review comes
   first, which is unusual among free directories and is published as a limitation
   rather than a feature.

### Methodological finding — the fetch summariser over-infers

The tool that reaches bot-filtered pages **summarises**, and it produced two
inferences that the sources do not support:

- it reported that Firmy.cz owners can respond to reviews, citing a section
  headed *"Souhrnné hodnocení"* — which means *summary rating*;
- it characterised wlw's basic profile as "appears available", which is not a
  statement about cost.

Both were rejected. It restrained itself correctly elsewhere ("not mentioned"),
which makes the failure harder to discount, not easier. **Rule: accept its direct
quotations, never its characterisations.**

### Pending for later German waves

Das Örtliche (needs a browser to reach any business surface) · Marktplatz
Mittelstand (needs profile provenance documented) · Zlaté stránky equivalents and
regional German directories, not researched.

---

## Wave 1B.2 — Czechia, second completed commercial-directory country (2026-08-06)

Five candidates, **two published**. The three rejections are the wave's most
valuable output, because every one of them would appear on a "best Czech business
directories" list written from memory.

### Approved (2)

| Record | Operator | Listing | Cost | Reviews |
|---|---|---|---|---|
| `cz-firmy-cz` | **Seznam.cz, a.s.** | create | free | true |
| `cz-zlate-stranky` | **Mediatel, spol. s r.o.** | create | **unknown** | true |

### Rejected (3)

| Candidate | Finding |
|---|---|
| **Najisto.cz** | **No longer a business directory.** Now a Ukrainian-language content site titled *"наїсто: Вболіваємо за якісний контент"* publishing weather, fuel-price and recipe articles. Zero directory vocabulary — no *firma*, *katalog*, *podnik*, *IČO*, *zapsat* — and its only internal path is `/stattia` ("article"). |
| **ČeskéFirmy.cz** | Redirects to `quaest.net`, a **parked placeholder** titled "Loading..." with no directory vocabulary at all. |
| **Atlas firem** | Redirects to `firmablizko.cz`, which **does** operate as a distance-based catalogue with an add-company flow. Rejected only because meaningful business adoption could not be established — this is a *pending* candidate, not a dead one. |

### Correction to Wave 1B

**Zlaté stránky was recorded as unreachable (transport failure 000).** That was
transient. It responds normally, is a genuine directory reporting *"823 263
kontaktů na firmy"*, and is published here. A single failed fetch is not a
property of a site.

### Duplicate decisions

- **Firmy.cz and "Seznam Firmy" are ONE system.** Firmy.cz *is* Seznam's business
  catalogue, operated by Seznam.cz, a.s. One record.
- **Firmy.cz and Zlaté stránky are separate.** Different operators (Seznam vs
  Mediatel), different catalogues, different entry flows, and neither states that
  an entry reaches the other. Zlaté stránky's add-company route resolves to
  `content-cmp.mediatel.cz`, which is how its operator was identified.

### What was not asserted

Neither Czech operator documented verification methods, owner responses, a claim
flow, indexability, link attributes or traffic. All `null`. `listingAction` is
`create` on both.

**Zlaté stránky cost is `unknown`.** Paid highlighting is promoted; nothing states
the basic entry is free. The brief forbids inferring either direction.

**Firmy.cz owner-response inference stayed rejected** — see the tool caution
recorded in Wave 1B.1. The record documents why.

### Reachability map for the remaining countries

| Country | Candidate | Result |
|---|---|---|
| **France** | PagesJaunes · Kompass FR · Solocal | **403** |
| | Hoodspot | redirects to `annuaire.petitesaffiches.fr` |
| **Poland** | Panorama Firm · pkt.pl · Firmy.net | **200 — all reachable, not yet researched** |
| **Italy** | PagineGialle · Virgilio Aziende · MisterImprese | **200 — all reachable, not yet researched** |
| **Spain** | Páginas Amarillas | **403** |
| | Empresite · eInforma | **200 — reachable, not yet researched** |

France remains the only country where no candidate can be reached.

---

## Waves 1B.3–1B.6 — France, Poland, Italy, Spain (2026-08-06)

**Three records from four countries. Two countries yield nothing**, and that is
the finding rather than a failure.

### Approved (3)

| Record | Country | Operator | Cost |
|---|---|---|---|
| `pl-panorama-firm` | Poland | WeNet | free |
| `pl-pkt` | Poland | **WeNet Group S.A.** | free |
| `it-paginegialle` | Italy | **Italiaonline S.p.A.** | free (VAT number required) |

### Two duplicate decisions that went opposite ways on the same question

This is the subtlest result of the wave. Both countries had one owner running two
directories. **Ownership decided neither. The submission system decided both.**

**Poland — TWO records.** WeNet owns Panorama Firm and pkt.pl, but each runs its
own submission form on its own domain, pkt.pl carries its own site terms, and
neither states that a submission reaches the other. Businesses manage independent
profiles.

**Italy — ONE record.** Italiaonline owns PagineGialle and Virgilio Aziende, and
**Virgilio's "Registra Azienda Gratis" call to action routes to
`italiaonline.it/self/pgit`** — the PagineGialle self-service product, confirmed
in served HTML. A business registering through Virgilio is registering in
PagineGialle. One product, two surfaces. **Virgilio is absorbed, not published.**

### France — 0 records

| Candidate | Result |
|---|---|
| PagesJaunes | **403** on both direct fetch and the summarising fetch path |
| Kompass France | **403** |
| Solocal | **403** |
| Hoodspot | Still exists, but served from `annuaire.petitesaffiches.fr` as a JavaScript app; operator relationship and listing flow unestablished |

France is the only country in the programme where **no candidate can be reached
at all**.

### Spain — 0 records

| Candidate | Result |
|---|---|
| Páginas Amarillas | **403** on both fetch paths |
| Empresite | A directory built on company data; **no listing-creation flow** established. Its own copy offers a free *search* — *"Buscador gratuito"* — not free listing |
| eInforma | **Wrong pillar.** A credit and company-information product — *informe, balance, riesgo, morosidad*, with a *Tarifas* page. Businesses do not publish profiles there |

### Poland — the provenance finding

Panorama Firm's submission form asks **"Jestem: Właścicielem / Użytkownikiem"** —
owner or user. A customer who used a business can add it. An entry is therefore
**not evidence that the named business created or approved it**, which is
published as a limitation and pinned by test.

pkt.pl promotes **"Wyższa pozycja w Google"** as a benefit. That is the operator's
marketing copy; **no ranking, indexing or traffic outcome is asserted** anywhere
in the record, and a test enforces it.

### Italy — requirement is not verification

PagineGialle's registration carries **"*Partita IVA necessaria"**. A VAT number is
*required by the form*; whether the operator verifies it against any register is
not documented. `verificationMethods` stays `null`, and a test asserts that the
required field was not promoted into a verification method.

### Pending

Firmy.net (Poland) — operator not identified, add flow is `javascript:void(0)`,
cost undocumented. MisterImprese (Italy) — free to *consult*; listing cost and
operator not established. Hoodspot (France) and Páginas Amarillas (Spain) — need
a browser.

---

## Waves 1B.7–1B.9 — United Kingdom, Canada, Australia

**27 candidates researched · 15 reachable · 8 published · 19 unpublished.**

The operator gate decided this wave. Reachability decided the previous ones; here
most candidates that *were* reachable still failed, because they name no legal
entity anywhere on the platform. Reputation is not an operator.

### Published

| Country | Platform | Operator | Action | Cost |
|---|---|---|---|---|
| UK | Thomson Local | Thomson Directories Ltd | create | freemium |
| UK | Scoot | Newfold Digital | create | freemium |
| UK | FreeIndex | FreeIndex Ltd (05716323) | create | freemium |
| UK | Approved Business | Approved Business Ltd | create | freemium |
| UK | Bizify | Outrank Limited (11723162) | create | freemium |
| CA | YellowPages.ca | Yellow Pages Digital & Media Solutions Limited | create | freemium |
| CA | n49 | N49 Interactive Inc. | create | freemium |
| AU | AussieWeb Local Search | Locafy Ltd | **create-and-claim** | freemium |

AussieWeb is the only `create-and-claim` in the wave. Both routes are documented
independently: creation by form, claiming by a per-listing **"Your business?
Claim it!"** control with its own follow-on flow. No other candidate documented a
second route, and a dashboard is not a claim flow.

### Duplicate decisions

**Touch Local → Scoot.** Previously argued from the dashboard host. Now settled
by the operator's own submission form: *"By adding yourself to this directory you
will be automatically added to our network of directories including Scoot and
Touch Local."* One submission publishes to both. Surviving record: **Scoot**.

**PagesJaunes.ca → YellowPages.ca.** One Terms of Use defines *"corporate.yp.ca,
yp.ca, pj.ca, YellowPages.ca, PagesJaunes.ca, Canada411.com"* as the same Sites
under one named operator, and the directory switches language between them. One
product, two language surfaces. Surviving record: **YellowPages.ca**.

**411.ca — deliberately NOT a duplicate, and not published.** It was 502 in an
earlier pass and responds normally now: transport failure, not absence. Its
footer names a *different* company (411 Local Search Corp) and its public profile
URLs are its own, so the duplicate tests are not met. But its only add-business
route — the single `add|claim|list` href on the whole page — is
`solutions.yp.ca/free-listing`, so it exposes no listing action of its own.
Recorded as an unresolved routing relationship. Calling it a duplicate would
assert a shared listing identity nobody documented.

**Canada411 — out of scope**, not a duplicate: a people-search product.

### Current-status findings

| Platform | Finding |
|---|---|
| **Ourbis.ca** | Shutting down, by its own announcement. Remains unpublished. |
| **CanadaOne** | Reachable, real operator (Biz-Zone Internet Group, Inc.), and **stale**: newest article **May 2020**, copyright line ends **2014**. Two independent staleness signals. Not published. |
| **Brownbook** | Self-describes as *"Free business listings for SEO and search engine marketing"*. Rejected under the search-marketing rule. |
| **MisterWhat** | Reachable, current, plainly a directory — and **anonymous**. Its entire footer is *"MisterWhat Copyright © 2011-2026"*. Fails the operator gate. |
| **Localsearch (AU)** | HTTP **202 with a zero-byte body**. Not a 403, not a redirect. Browser needed. |
| **StartLocal (AU)**, **ProfileCanada** | No response on either the apex or `www.` path, in two separate passes. |

### Browser queue

Every entry below is **blocked, not absent**. A 403 is a bot filter.

| # | Platform | Country | URL | Blocker | Exact browser action | Facts to observe | Must stay null | Blocks publication? |
|---|---|---|---|---|---|---|---|---|
| 1 | **Yell** | UK | `https://www.yell.com/` | 403 | Open the free-listing/advertise page; capture operator legal entity, listing action, cost | operator, create vs claim, base-listing cost, reviews, owner responses | all commercial fields | **Yes** — UK market leader |
| 2 | **YellowPages.ca free listing** | CA | `https://solutions.yp.ca/free-listing` | Wix JS form | Complete the form far enough to see what the free tier contains | free-tier contents, verification, claim route | verification, owner responses | No — record published; would enrich |
| 3 | **Yellow Pages Australia** | AU | `https://my.yellow.com.au/online-signup/` | JS shell; `/free-listing` and `/about-us` 403 | Open signup; capture listing action and base cost | listing action, cost, verification, reviews | everything except operator (Thryv Australia Pty Ltd, confirmed) | **Yes** — AU market leader |
| 4 | **Cylex UK** | UK | `https://www.cylex-uk.co.uk/` | 403 | Open add-business and legal pages | operator, action, cost | all | Yes |
| 5 | **TrueLocal** | AU | `https://www.truelocal.com.au/` | 403 | Open add-business and terms | operator, action, cost, reviews | all | Yes |
| 6 | **Hotfrog UK / Canada** | UK, CA | `https://www.hotfrog.co.uk/`, `https://www.hotfrog.ca/` | 403 | Open add-business and legal pages; confirm whether both are one system | operator, action, cost, **shared-dashboard test** | all | Yes |
| 7 | **White Pages Business** | AU | `https://www.whitepages.com.au/` | 403 | Open business listing pages; confirm relationship to Yellow Pages AU | operator, action, cost, duplicate relationship | all | Yes |
| 8 | **BusinessMagnet** | UK | `https://www.businessmagnet.co.uk/` | 403 | Open add-company and terms | operator, action, cost | all | No |
| 9 | **dLook** | AU | `https://www.dlook.com.au/` | 403 | Open add-business and terms | operator, action, cost | all | No |
| 10 | **Localsearch** | AU | `https://www.localsearch.com.au/` | 202, empty body | Load in a browser; confirm the product still exists | current status, operator, action, cost | all | No |
| 11 | **411.ca** | CA | `https://www.411.ca/` | Resolved — routing open | Submit a Yellow Pages free listing and check whether it appears on 411.ca | whether one submission publishes to both | — | No |
| 12 | **CanadaOne** | CA | `https://www.canadaone.com/business/addbusiness.html` | Reachable but stale | Submit and confirm whether entries are still processed | whether the directory is still maintained | all | No |

### Evidence notes worth keeping

**Thomson Local — the free listing expires.** *"A three-month time limited free
business listing"*. Also: the free tier carries no website link — *"Website link
is available when purchasing a thomsonlocal backlink product or paid
advertising"* — and the FREE/PAID table's ticks are CSS-rendered, so the
per-feature split is **not** resolvable from the served HTML and is not asserted.

**Thomson Local — citations are not listings.** *"Listings are directory entries
whereby the owner of the business or organisation has a direct relationship with
Thomson Local. Whereas citations are provided from a third party."* Most
citations come from 118 Information Ltd.

**n49 — the most candid pricing page in the dataset.** The free tier is described
by its operator as *"No Website Link"*, *"Not Verified"*, *"No Support"*. That is
why `verificationRequired` is `false` rather than unknown: it is an affirmative
product statement, not an absence of documentation.

**AussieWeb — scraper provenance, disclosed unprompted.** *"Where did my details
come from to be on this site? A. Most of the details on this site were found on
publicly available internet sites."* Published rather than treated as
disqualifying, because the operator answers the question directly.

**Bizify — the operator contradicts its own marketing.** The site promises
listings are *"built to rank"*; the terms state *"We do not provide any
warranties or guarantees as to the outcome of any of the Advertising Services,
including but not limited to traffic driven to your website, orders for your
goods or services, and placement of your website on any search engines."* The
disclaimer is the binding text. Published with the contradiction quoted, because
that is more useful to a reader than omission.

**Approved Business — a free package with a term.** The free tier carries a
*"12 month contract"* and *"Displays at the bottom of product and service
pages"*. *"Website backlink"* is a Featured-tier feature, so no link is
documented for the free package.

**FreeIndex — claiming is routed away, not merely undocumented.** *"Do not
re-register if your business is already on the site. Either login or contact us.
All duplicates are rejected."* Also *"Franchisee's and branches are automatically
rejected."* Its email step confirms a working mailbox and nothing more, which is
recorded as a bounded `email` method.

### Pass 2 corrections

Two values moved **away from null** on direct observation of live pages:

1. **Thomson Local owner responses** — drafted `null`, corrected to `true`. A
   public profile's review form states *"Get notified - if an advertiser responds
   to your review"* and *"Respond to advertisers - if they reply to your
   review"*. Bounded to the operator's own word *advertiser*; whether a free
   listing may reply is not established.
2. **Scoot reviews** — drafted `null`, corrected to `true`. Pass 1 saw only
   homepage consumer-journey copy and rightly rejected it; Pass 2 inspected live
   results carrying a review element and a *"Be the first to review"* prompt.

Three editorial leaks were also caught and removed before commit: internal wave
vocabulary ("in this wave") had reached the AussieWeb description, one pro and
one audience line, and would have been published in page text and JSON-LD.

### Structural change

The UK and Canada coverage manifests are now scoped to the **Government Registry
pillar**. They measure which territories are reached by a *statutory register*; a
commercial directory reaches none in that sense. Counting the two together would
have made the manifests — and the country pages derived from them — state
coverage figures that are not true. Both tests assert the pillar filter is
load-bearing, so deleting every commercial record cannot silently restore the old
behaviour.

---

## Wave 1C — United States, Layer A (national commercial directories)

**25 candidates researched · 2 published · 23 unpublished.**

The number is small and the reason is structural, not editorial. Reachability
shaped earlier waves; the operator gate shaped Waves 1B.7–1B.9; this wave was
shaped by something new — **most of the brief's national targets already exist in
the dataset as `global` records.**

### Published

| Platform | Operator | Action | Cost | Notes |
|---|---|---|---|---|
| MerchantCircle | Buyerlink Inc. | **claim** | freemium | First claim-only record in the dataset |
| Alignable | Alignable Corporation | create | **unknown** | Networking platform with public city directories |

### The global-overlap finding

Eight of the brief's twenty-five national targets **already exist as `global`
records**: Yelp, Google Business Profile, Trustpilot, Foursquare, Clutch, G2,
Capterra and Software Advice. Republishing them under `united-states` would
create duplicates on every test in the duplicate rules — same dashboard, same
listing, same profile. They were left as single records.

All eight are also **pre-contract**: `operator: null`, `listingAction: unknown`.
So are the other 45 `global` records — 53 in total, none carrying an operator.

**This is a remediation problem, not a US-coverage problem**, and it is the
single highest-value item outstanding in Pillar B. Yelp, Google Business Profile
and Trustpilot are the three platforms most likely to be the actual answer to
"where should a US business create a profile", and every substantive field on
them currently reads `unknown`.

Research already gathered toward that remediation, quotations verified:

- **Yelp** — operator `Yelp Inc.` (*"Copyright © 2004–2026 Yelp Inc."*). Free
  tier documented: *"It's free to be on Yelp"*, with a pricing page listing
  **Free** against *"Gain access to 20+ free features"*. Claim route documented
  in the operator's own guide, *"The simple steps to claiming your Yelp Page"*.
- **Trustpilot** — paid plans from **€79/month**, and *"All contracts are a
  12-month commitment"*. *"Respond to reviews"* is a documented feature.

Neither was remediated here. Half-remediating a 53-record layer would make
`unknown` ambiguous — researched-and-unknown versus never-researched — and a test
now pins that all 53 stay untouched until a dedicated wave does the whole layer.

### Rejected, with reasons

| Platform | Finding |
|---|---|
| **Porch** | **Pivoted to insurance.** The `/pros` directory pages still render, but the page's own `<title>` is *"Porch \| A new kind of home insurance"*, the only signup route on it is `insurance/agent/signup`, and every "claim" link is an insurance or warranty claim. No professional onboarding exists. A directory a business cannot join is not a listing opportunity. Re-verified on an independent fetch. |
| **Chamber of Commerce** | Names **no legal entity anywhere**; its entire footer is *"© 2026 - CHAMBEROFCOMMERCE.COM"*. A domain is not a company. Its `/members/add-business` route is additionally behind a Cloudflare challenge. Same failure mode as MisterWhat in the UK. |
| **Dun & Bradstreet** | **Wrong pillar** — a credit and company-data product, not a platform where a business publishes a profile. Same call already made for eInforma in Spain. It also geo-routes: requests from this location land on `/cs-cz/`. |
| **Brownbook** | Already rejected under the search-marketing rule; unchanged. |

### Browser queue

Every entry below is **blocked, not absent**.

| # | Platform | URL | Blocker | Exact browser action | Facts to observe | Publication depends on it? |
|---|---|---|---|---|---|---|
| 1 | **Yellow Pages US** | `https://www.yellowpages.com/` | 403 | Open the free-listing/advertise page and legal pages | operator, listing action, base cost, reviews, owner responses | **Yes** — largest US directory brand |
| 2 | **Better Business Bureau** | `https://www.bbb.org/` | 403 | Open "Get Accredited" and the business-profile claim flow | operator, accreditation vs free profile, cost, claim route | **Yes** — also remediates the existing `us-bbb` record |
| 3 | **Manta** | `https://www.manta.com/` | 403 | Open add/claim business and terms | operator, action, cost | Yes |
| 4 | **Angi** | `https://www.angi.com/` | 403 | Open the pro signup and terms | operator, action, cost, reviews | Yes |
| 5 | **Thumbtack** | `https://www.thumbtack.com/` | Bot challenge (202, *"we need to verify that you're not a robot"*) | Open pro signup and terms | operator, action, cost | Yes |
| 6 | **Houzz** | `https://www.houzz.com/professionals` | JS "Client Challenge" | Open the Houzz Pro signup | listing action, cost, reviews, owner responses | Partly — operator already known (**Houzz Inc.**) |
| 7 | **Nextdoor Business** | `https://business.nextdoor.com/` | `legal.nextdoor.com` returns 401 | Open the legal/terms page for the operating entity | **legal operator entity** | **Yes** — create and claim already evidenced, operator is the only gap |
| 8 | **Hotfrog US** | `https://www.hotfrog.com/` | 403 | Open add-business and terms | operator, action, cost; also test whether Hotfrog US/UK/CA are one system | Yes |
| 9 | **Cylex US** | `https://www.cylex.us.com/` | 403 | Open add-business and terms | operator, action, cost | Yes |
| 10 | **EZlocal** | `https://www.ezlocal.com/` | 403 | Open add-business and terms | operator, action, cost | No |
| 11 | **Local.com** | `https://www.local.com/` | 503 / no response on two passes | Load in a browser; confirm the product still exists | current status, operator | No |
| 12 | **Chamber of Commerce** | `https://www.chamberofcommerce.com/members/add-business` | Cloudflare challenge | Open add-business; look for any legal entity in terms or checkout | **legal operator entity**, action, cost | Yes |

### Evidence notes worth keeping

**MerchantCircle — a free profile carries competitors' advertising.** The paid
tier's selling point is *"Remove competitor ads from your listing"* and *"No ads
on your page - consumers will focus only on you!"*. That is a plain statement
about what the free tier looks like, published as a limitation.

**MerchantCircle — verification is sold, not performed.** *"Receive a verified
Badge"* is a paid-tier feature. A purchased badge is not evidence that the
operator checked anything, so `verificationMethods` stays `null`.

**MerchantCircle — the first claim-only record.** The documented call to action
is *"Claim my business"*. No route exists for registering a business absent from
the database, and an account system is not one. `listingAction: claim`.

**Alignable — cost genuinely unknown.** Joining is presented only as *"Join
Today"*, there is no pricing page, and the premium tier offers *"Try for Free"*.
A free account is not a free listing and a free trial is not a free listing, so
the value stays `unknown` rather than being rounded to free.

**Alignable — a network, not a consumer directory.** Its own profile reads
*"Alignable is the networking platform for businesses."* Public city directories
do exist and were confirmed directly, but entries are person-led. A reader
deciding where to list needs to know a profile here reaches peers, not searchers.

### Wave 1C.1 — Top 20 states, scoping note

One finding bears directly on the state programme: **chamberofcommerce.com
already publishes a full `/business-directory/<state>/` tree for all fifty
states.** That is a national platform with state *views*, not fifty state
directories — precisely the distinction Wave 1C.1 has to draw. Expect the same
pattern from Yellow Pages, Manta and Hotfrog. The state layer's real yield will
be chamber-operated and regional portals that have no national parent, and the
honest expectation is that a substantial number of the twenty states produce
nothing publishable.

---

## Wave 1C.1A — West and Southwest: research milestone, zero records

**24 candidates classified across five states. Zero records authored.**

That is the correct outcome, not a failure. The wave established where genuine
state directories exist, which apparent ones are national regional views, which
are procurement systems, which are advocacy organisations, and which have been
renamed or repurposed. What it could not establish — for any candidate — is a
**verified public discovery surface**, because every qualifying interface is
behind a WAF or served as a JavaScript application.

### Schema decision

This wave added the listing action **`apply`**, label **"Apply for inclusion"**.

Region A's genuine candidates are overwhelmingly certification and membership
directories, and every existing enum value described them falsely:

| Value | Why it was wrong |
|---|---|
| `create` | Implies submitting produces a listing; hides the certification gate |
| `invite-only` | Renders "Invite only" — denies that a business may apply at all |
| `claim` | A different action; there is no prior profile to claim |
| `unknown` | Discards documented evidence about a flow that IS documented |

`apply` means: *the business initiates an application, but inclusion depends on
operator approval based on certification, membership, eligibility or another
documented gate. Submission alone does not create or guarantee a listing.*

It is **not** for ordinary editorial moderation — nearly every directory reviews
submissions, and that stays `create`. The distinguishing feature is that
inclusion depends on **who the business is**, not merely on whether the submitted
data passes review.

**The enum does not make a candidate publishable.** Two separate proofs are still
required: an official application route, and a public discovery surface. A free
certification application is not a public searchable supplier directory.

### National duplicates — excluded across all five states

| Platform | State pattern | Finding |
|---|---|---|
| ChamberofCommerce.com | `/business-directory/<state>/`, all 50 states | Regional views of one national platform |
| MerchantCircle | city slugs (`/ca-los-angeles`) | One national system. `/california` returns **404** — no state surface exists at all |
| Alignable | `/<city>-<state>/directory` | One national system, city views under one account |

No state record may be created from any of these.

### California

| Candidate | Outcome |
|---|---|
| **CalChamber** | **Rejected** — not a directory. Its membership product is HR compliance: *"HRCalifornia.com, our members-only portal that includes the HR Library"*. No public business directory exists. |
| **CA Supplier Clearinghouse** | **Targeted research incomplete.** A genuine certification programme — *"On behalf of the California Public Utilities Commission (CPUC), we certify women, minority, LGBT, persons with disabilities, and disabled veteran business enterprises"* — but its About page is unedited WordPress theme boilerplate (testimonials from "Colabrio", a link to `ohio.clbthemes.com`) and Contact names no legal entity. **Operator unestablished.** Also **not a California directory**: *"Does the business need to be located in California to be certified by the Clearinghouse? No. The Clearinghouse certifies companies located in the United States."* |
| **CMTC → Roadmap 4 Innovation** | **Renamed successor, rejected.** *"Roadmap 4 Innovation (R4I) is a 501(c)(3) nonprofit dedicated to helping California manufacturers strengthen competitiveness through expert consulting"* — a consulting nonprofit, not a directory. |
| **Cal eProcure** | **Pending browser** — public supplier search returns an empty body. |
| **Visit California** | **Pending browser** — `/business-directory/` exists but is a JavaScript app. |

### Washington

| Candidate | Outcome |
|---|---|
| **OMWBE certified-business directory** | **Pending browser** — the region's strongest candidate. Operator unambiguous (Washington State agency), cost documented: *"There is no cost to apply for OMWBE Certification… all fees have been waived indefinitely."* But the directory itself is served from `omwbe.diversitycompliance.com`, which returns **403**. Public discovery unverified. Note the two-role split: OMWBE is the programme operator, DiversityCompliance the technical platform. |
| **Association of Washington Business** | **Rejected** — policy and advocacy; no member business directory. |
| **Choose Washington** | **Rejected** — no listing or directory route; economic-development landing pages. |
| **Impact Washington** | Targeted research incomplete. |
| **ExperienceWA** | **Pending browser** — no response on two independent passes. |

### Arizona · Colorado

Arizona: Arizona Chamber targeted incomplete; **Arizona Commerce 403**; **Visit
Arizona 403**. Colorado: **Colorado Chamber no response**; **Colorado.com 403**;
OEDIT and Manufacturer's Edge targeted incomplete. Neither state produced a
candidate whose public discovery could be verified without a browser.

### Texas

| Candidate | Outcome |
|---|---|
| **VetHUB** (formerly HUB) | **Renamed, scope narrowed.** *"VetHUB is Veteran Heroes United in Business. The program focuses on certification of service-disabled veterans (SDV)."* The historical HUB description covering minority- and women-owned businesses must not be carried forward as current. Public directory status unresolved. |
| **CMBL** | **Procurement registration, excluded from Pillar B.** Its own definition: *"The CMBL is a master database used by State of Texas purchasing entities to develop a mailing list for vendors to receive bids."* A bidders mailing list is not a public promotional directory. |
| **Texas Association of Business** | Membership workflow on a GrowthZone portal; public discovery not established. |
| **Travel Texas** | No verified listing route. |

### Browser queue — Region A

Every entry is **blocked, not absent**. Each states what stays null until verified.

| # | Platform | State | URL | Blocker | Exact browser action | Facts to observe | Stays null until verified |
|---|---|---|---|---|---|---|---|
| 1 | **OMWBE directory** | WA | `https://omwbe.diversitycompliance.com/` | 403 | Load the directory; run an anonymous search; open one result | public search without login, stable business profile, operator/platform roles | everything except operator and cost |
| 2 | **CA Supplier Clearinghouse** | US-wide | `https://sch.prismcompliance.com/` (Certified Directory) | third-party host | Open the certified-firm directory; inspect a result page | **legal operator**, public profile stability, search without login | all fields |
| 3 | **Cal eProcure** | CA | `https://caleprocure.ca.gov/pages/PublicSearch/supplier-search.aspx` | JS app, empty body | Run a public supplier search | whether results are reusable discovery or procurement lookup only | all fields |
| 4 | **Visit California** | CA | `https://www.visitcalifornia.com/business-directory/` | JS app | Open the directory; find the partner application route | who may apply, eligibility, cost, public listing stability | all fields |
| 5 | **Texas VetHUB** | TX | `https://comptroller.texas.gov/purchasing/vendor/hub/` | Public directory unresolved | Follow "Search for CMBL/VetHUB Vendors" | whether a public certified-business directory exists **separate from** the CMBL bidders list | all fields |
| 6 | **Visit Arizona** | AZ | `https://www.visitarizona.com/` | 403 | Open the partner/listing route | application route, eligibility, cost | all fields |
| 7 | **Arizona Commerce Authority** | AZ | `https://www.azcommerce.com/` | 403 | Open business/supplier directory routes | whether any public company directory exists | all fields |
| 8 | **Colorado.com** | CO | `https://www.colorado.com/` | 403 | Open the listing/partner route | application route, eligibility, cost | all fields |
| 9 | **ExperienceWA** | WA | `https://www.experiencewa.com/` | No response ×2 | Load in a browser | whether the site still operates | all fields |

### Conditions required before any Region A record is authored

1. A **public discovery surface** verified directly — anonymous search and a stable business profile, not a certification page.
2. An **official application route** for a qualifying business.
3. An **established legal operator**, distinguishing programme operator from technical platform.
4. For `apply` records, the eligibility gate must be visible in published prose, not editorNotes.

### Dependency

Global commercial records require a separate remediation wave; this regional
release does not modify or duplicate them.
