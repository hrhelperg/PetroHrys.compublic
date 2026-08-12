# Tender & Procurement Platforms — Wave T1 research log

Internal. Not published: `/docs/*` is blocked from public serving by `_redirects`.

Wave T1 scope is Europe and adjacent jurisdictions, prioritised P0/P1 (official
national procurement systems, national e-submission, EU-level infrastructure).
Regional, municipal, sector, utility and commercial-aggregator systems are
deferred to T2.

This log exists so that a later pass can tell the difference between *"not
researched yet"* and *"researched and rejected"*. Those are not the same gap and
must never be collapsed.

Research passes: 2026-08-11 (checkpoint 1 pilot, T1b fan-out of 14 research
agents covering 21 jurisdictions, and an inline pass covering 12 more after six
agent groups were stopped by an external spend limit).

---

## 1. Rejection log

Rejections are as much a research product as acceptances. 44 candidates were
rejected in checkpoint 1 + T1b combined; the full per-candidate detail with HTTP
observations lives in the T1b results archive (see §5). The classes:

### 1.1 `grant-only` — the highest-risk near-miss of this collection

The European Commission's **"national single portals"** list (27 countries)
reads exactly like a procurement portal index and is entirely **EU
funding/cohesion portals** (ERDF, ESF+). All 27 rejected; 22 hosts are denied by
name in `scripts/tests/tp-platforms.test.cjs`.

### 1.2 `authority-only` — authority ≠ platform

Confirmed by both research passes as the dominant European failure mode. The
regulator's site and the platform are almost never the same system:

| Authority (rejected) | The actual platform (accepted) |
|---|---|
| javnanabava.hr (HR policy portal) | EOJN RH — eojn.hr |
| www2.aop.bg (BG agency) | CAIS EOP — app.eop.bg |
| uvo.gov.sk (SK office) | IS EVO / EKS / Vestník |
| eadhsy.gr (GR authority, rebranded from eaadhsy.gr) | ESIDIS/Promitheus |
| kozbeszerzes.hu (HU authority) | EKR |
| iub.gov.lv (LV monitoring bureau) | EIS |
| vpt.lt (LT office, Cloudflare-403) | CVP IS — viesiejipirkimai.lt |
| uzp.gov.pl (PL office) | e-Zamówienia |
| pianoo.nl (NL expertise centre) | TenderNed |
| hankinnat.fi (FI advisory unit) | Hilma — hankintailmoitukset.fi |
| upphandlingsmyndigheten.se (SE authority) | (no single official platform — see §3 Sweden) |
| **app.gov.al (AL — unresolved)** | title identifies the Agjencia e Prokurimit Publik; whether the same host also carries the SPE platform surface was not established by fetch. Left unresolved rather than accepted. |

### 1.3 `soft-404` / unusable routes (suppressed, never published)

- `base.gov.pt/Base4/en/pesquisa/` — 404 serving the homepage body
- `etenders.gov.ie/epps/quickSearchAction.do` — 200, zero bytes
- `ejn.gov.si/eJN2` — redirect to site root
- multiple T1b candidates recorded per-jurisdiction in the results archive

### 1.4 Rebrands / migrations observed

- `eaadhsy.gr` → `eadhsy.gr` (authority rebrand)
- `eojn.nn.hr` → `eojn.hr` (HR platform replaced 2024-01-01; legacy retained as
  the pre-2024 archive/registers record, `partOf` the new system)
- `pirkimai.eviesiejipirkimai.lt` (EU-Supply CTM) → `viesiejipirkimai.lt`
  (European Dynamics ePPS). Legacy record is `currentStatus: replaced`,
  `replacedBy: lt-cvp-is`, and therefore unpublishable.
- `ekap.kik.gov.tr` → `ekapv2.kik.gov.tr` (TR platform moved to a v2 app on the
  same authority domain; one record, not two)
- `zakupki.prom.ua` → `zakupivli.pro` (UA marketplace rebrand, behind a bot
  wall; **not** published in T1 — **resolved and published in T2A** once the
  operator's authorization table confirmed it)

### 1.5 `WAF-unverifiable` / transport — not rejections, not death

`vz.nipez.cz`, `eprocurement.gov.cy` (legacy host), `marches.public.lu`,
`e-nabavke.gov.ba`, `etender.gov.az`, Bulgaria's legacy ROP register on port
7778 — connection failures from this vantage. `contrataciondelestado.es` was a
**diagnosed false alarm**: the T1b agent identified the "connection failure" as
the Spanish government CA not being in standard trust stores; the platform is
live and is published with class-A evidence.

## 2. Jurisdiction completeness matrix (final, Wave T1)

Derived from `data/tenders-procurement/platforms.json` at commit time: 70
records, 69 publishable, 41 jurisdictions with ≥1 publishable record.

**PUBLISHED (41):** EU institutions (TED) · Austria (2) · Belgium · Bulgaria ·
Croatia (2) · Cyprus · Czechia · Denmark · Estonia · Finland (2) · France (3:
BOAMP, PLACE, APProch) · Germany · Greece (2) · Hungary (2) · Ireland · Italy
(2) · Latvia (2) · Lithuania (2 + 1 replaced) · Luxembourg · Malta ·
Netherlands · Poland · Portugal · Romania · Slovakia (3) · Slovenia · Spain (2)
· Sweden (3 — see note) · UK (10: FTS, Contracts Finder, PCS + PCS-Tender,
Sell2Wales + eTenderWales, eTendersNI + eSourcing NI, Supplier Registration
Service, Digital Marketplace) · Norway · Iceland (3) · Switzerland · Ukraine
(2: Prozorro + SmartTender marketplace) · Turkey · Albania→see unresolved ·
Kosovo · Montenegro · North Macedonia · Serbia · Moldova (2: MTender +
achizitii.md) · Georgia · Armenia.

**Sweden note:** Sweden has no single official national platform; notices flow
through registered commercial systems. The three published records reflect that
documented structure rather than contradicting it.

**UNRESOLVED at the close of T1 (3) — two since resolved in T2A:**
- ~~**Albania**~~ — **resolved in T2A**: the platform is `bid.app.gov.al` (SPE,
  economic-operator section); `app.gov.al` is the agency. Same domain, two
  different things.
- ~~**Bosnia and Herzegovina**~~ — **resolved in T2A**: `e-nabavke.gov.ba` was
  not merely unreachable, it is superseded. The live portal is `ejn.gov.ba`.
- **Azerbaijan** — still unresolved after a T2A re-investigation:
  `etender.gov.az` and `tender.gov.az` both resolve in DNS but time out on
  TCP:443 from this vantage. Transport failure, not death.

**INTENTIONALLY EXCLUDED (2): Russia, Belarus.**
Official platforms exist (`zakupki.gov.ru` EIS; `goszakupki.by` / `icetrade.by`)
— their existence is a fact and is recorded here. No actionable record is
published, for the reason PART 16 anticipated: EU Council Regulation 833/2014
art. 5k (inserted by Reg. 2022/576) prohibits awarding covered EU public
contracts to Russian persons, and participation by EU suppliers in
Russian/Belarusian procurement sits under a sanctions regime whose application
is fact-specific (see the Commission's consolidated sanctions FAQ and CJEU
C-313/24, 2026-02-12). Publishing these systems as normally-actionable
destinations would be misleading. This is a research-status decision, not legal
advice; revisit only with counsel.

**Liechtenstein:** no separate platform verified; publishes via Swiss/EEA
channels as far as this pass could see; also not a declared country slug in the
shared geography. Recorded on the Swiss record's limitations.

**EU institutional deep-dive (EIB, EBRD, ECB, Funding & Tenders Portal's
calls-for-tenders surface):** not completed in T1 — the assigned research agent
was stopped by the spend limit. **Completed in Wave T2A**; see that section.

## 3. Statistics (derived, not asserted)

- 70 records; 69 publishable; 41 jurisdictions
- Evidence classes: A=36, B=28, unknown=5 (+1 replaced record)
- browserCheckRequired: 27 (WAFs, cookie gates, JS shells — none guessed at)
- Ecosystem links (`partOf`): 7 (UK devolved pairs; HR legacy; GR KIMDIS;
  FR APProch; UA SmartTender; MD achizitii.md)
- Verified distinct routes: search 32 · registration 15 · submission 4 · documents 4
- foreignSuppliersAccepted: yes=3 (all class-A with operator quotes: Latvia EIS,
  Italy Acquisti in Rete PA, UK FTS), unknown=66, no=0
- Electronic submission: yes=28, no=17, unknown=24
- T1b candidates rejected: 44 · unresolved carried: 16+

## 4. Method notes and honesty constraints

- 14 research agents ran the T1b fan-out; **6 were stopped by an external
  monthly spend limit** (CH-LI, UA, TR-GE-AM-AZ-MD, Balkans, RU-BY,
  EU-institutions). Those areas were re-researched inline in the same session at
  P0 depth only: the national platform of each jurisdiction, verified by fetch,
  with authority documentation where obtainable (Prozorro's marketplace model is
  class-A from prozorro.gov.ua/about and /for-places). Depth in those groups is
  consequently thinner than in the agent-researched groups — routes are mostly
  null and browser-checks more frequent. That asymmetry is recorded rather than
  hidden.
- No rendered browser existed in this pass. Nothing labelled "browser check"
  was performed; the flag marks exactly the records that still need one.
- WebSearch is US-region; local-language sources surfaced but ranking is
  geo-skewed.
- All 12 inline-added records were verified by direct fetch in this session;
  8 agent-group results were spot-checked against live fetches (EOJN RH, CAIS
  EOP shell size, FTS, Hilma, Doffin, PLACSP TLS diagnosis, PLACE,
  Acquisti in Rete) — every spot-check matched the agent's recorded observation.

## 5. Archives

- T1b workflow results (per-candidate rejections with HTTP observations):
  workflow run `wf_b54b3ba4-538`, 21 jurisdiction reports, 791k tokens,
  406 tool calls.
- Checkpoint-1 pilot observations are preserved in this file's git history.

## 6. What T2 should do first

1. Bosnia, Albania, Azerbaijan: resolve via browser/alternate vantage.
2. Browser-check the 27 flagged records (Cloudflare, cookie gates, JS shells).
3. EU institutional procurement: EIB, EBRD, ECB, F&T calls-for-tenders.
4. Route completion: submission/registration routes for the 12 inline records.
5. Regional/municipal/sector systems (the deferred P2 tier), starting with the
   German Länder and Swiss cantons.
6. Ukraine: verify zakupivli.pro (ex-prom.ua) and add 1–2 more authorized
   marketplaces with the same partOf modelling.

---

# Wave T2A — Institutional & Advanced Europe (2026-08-12)

Depth wave, not a breadth wave. 9 research workstreams; 34 records accepted, 40
rejected, 12 unresolved. Dataset 70 → 104 records (69 → 103 publishable),
41 → 43 jurisdictions.

## T2A completeness matrix (derived)

| Workstream | Accepted | Rejected | Unresolved | Search | Registration | Submission | Documents | Browser-check |
|---|---|---|---|---|---|---|---|---|
| EIB | 1 | 3 | 0 | 1 | 0 | 0 | 0 | 1 |
| EBRD | 2 | 4 | 1 | 1 | 2 | 1 | 0 | 1 |
| ECB + EU shared infrastructure | 2 | 5 | 1 | 2 | 2 | 1 | 0 | 1 |
| German Länder (N/E, 10 states) | 10 | 5 | 3 | 7 | 5 | 2 | 0 | 1 |
| German Länder (S/W, 6 states) | 9 | 4 | 3 | 8 | 0 | 0 | 0 | 1 |
| Swiss cantons (26) | 0 | 10 | 0 | 0 | 0 | 0 | 0 | 0 |
| Prozorro marketplaces | 6 | 2 | 1 | 4 | 2 | 0 | 0 | 4 |
| MTender ecosystem | 2 | 3 | 1 | 1 | 1 | 0 | 0 | 1 |
| AL / BA / AZ | 2 | 4 | 2 | 1 | 2 | 0 | 1 | 0 |
| **Total** | **34** | **40** | **12** | **25** | **14** | **4** | **1** | **10** |

## Route coverage — the T2A KPI

| Route | Before | After |
|---|---|---|
| tenderSearchUrl | 32/69 (46%) | 63/103 (61%) |
| supplierRegistrationUrl | 15/69 (21%) | 30/103 (29%) |
| submissionUrl | 4/69 (5%) | 8/103 (7%) |
| documentsUrl | 4/69 (5%) | 5/103 (4%) |

Evidence class A: 36 → 62. Browser-check: 27 → 37. partOf: 7 → 13.

## The findings that mattered

**Swiss cantons: zero records, and that is the result.** simap.ch is the single
shared publication platform for federal, cantonal and municipal procurement. No
canton operates a distinct operational platform; Graubünden explicitly migrated
its cantonal publications to simap. Ten canton candidates rejected as
`part-of-simap`, `retired-merged-into-simap` or `authority-only`. Creating 26
canton records would have been the single largest fabrication available in this
wave.

**EIB: one record, two spheres kept apart.** Corporate & Technical Assistance
procurement (the Bank buying for itself) is the accepted surface. Procurement
under EIB-*financed* projects is run by borrowers and promoters — the operator
states "The EIB is not a party to the resulting contracts" — so it is documented
as policy, not published as a platform. EIB corporate bids are actually
submitted on the Commission's eSubmission, which is the EU shared record, not a
second EIB one.

**EBRD: two records, genuinely distinct.** ECEPP (client/project procurement, on
BiP Solutions' Delta, with a verified notice search *and* a supplier signup
route) and corporate procurement on an EBRD instance of GEP SMART. Both verified.

**EU institutions: two records, no agency inflation.** The Funding & Tenders
Portal (SEDIA) is the operational layer — calls-for-tenders search, Participant
Register, eSubmission — alongside the existing TED notice record. Frontex,
Europol, EMA and the rest procure through that shared stack and therefore get
**zero** records. **TED eTendering is decommissioned** (etendering.ted.europa.eu
now redirects to the Portal's migration notice) and is not published as live.

**German Länder: 19 records across 16 states, three software families.** cosinex
Vergabemarktplatz, Administration Intelligence NetServer and Healy Hudson /
Deutsche eVergabe. Vendor recorded separately from operating authority
throughout. Mecklenburg-Vorpommern legitimately carries two records — the state
platform (LAiV, Administration Intelligence) and the municipal Zweckverband
eGo-MV platform (cosinex) — different operators, hosts, vendors and
constituencies. Commercial multi-Land portals (vergabe24, vergabeportal-bw,
DTVP satellites) rejected as `out-of-scope-aggregator`.

**Prozorro: 6 authorized marketplaces**, each verified against the operator's
current authorization table and linked `partOf` the central system. Two rejected
as not on the current list, including a PrivatBank-operated one. The T1
open question — zakupki.prom.ua behind a bot wall — is resolved: it rebranded to
zakupivli.pro and is now published.

**Albania and Bosnia resolved.** Albania's ambiguity is settled: the platform is
`bid.app.gov.al` (SPE, economic-operator section), while `app.gov.al` is the
agency — the two share a domain and are not the same thing. Bosnia's
`e-nabavke.gov.ba` was not merely unreachable in T1: it is **superseded**, and
the live portal is `ejn.gov.ba`. Azerbaijan remains genuinely unresolved —
etender.gov.az and tender.gov.az both resolve in DNS but time out on TCP:443
from this vantage, which is a transport failure and is recorded as such, not as
death.

## Rejection classes (40)

authority-only 11 · not-a-platform 2 · software-vendor 2 ·
authority-only-uses-shared-infrastructure 2 · duplicate-alias 2 ·
out-of-scope-aggregator 2 · unauthorized-or-unverified 2 · dead-dns 2 ·
and one each of: post-award-vendor-portal, shared-infrastructure,
decommissioned-migrated, component-of-shared-platform, documentation-only,
dead-host, duplicate-surface, info-community-site, retired-merged-into-simap,
part-of-simap, private-aggregator-analytics, private-aggregator,
stale-or-unverified, dead-domain-superseded, authority-only-merged.

## Unresolved carried forward (12)

Azerbaijan (2 hosts, TCP timeouts) · EBRD GEP public RFx listing (Angular shell)
· Europol's current procurement route (old route 404s) · e-vergabe.SH vendor
identity · Hamburg's in-portal public search (JS shell) · Niedersachsen
operating body · rlp.vergabekommunal.de · vergabeinfo.bayern.de · Saarland
state documentation (403 JS challenge) · remaining Prozorro marketplaces beyond
the six verified · Moldova's planned "e-Achiziții" successor system.

## Method notes

- Route completion was evidence-first, and the failures are as informative as
  the fills: the European Dynamics ePPS search pattern verified on Ireland does
  **not** transfer to ARMEPS (HTTP 500), Kosovo's documents route redirects to
  login, North Macedonia's is a hash route invisible to fetch, and BASE's
  English search is a soft 404 while its Portuguese one works.
- Six new records were independently spot-checked against live fetches after
  merge; all six matched the researching agent's recorded observation.
- No rendered browser existed in this wave either. 37 records carry
  browserCheckRequired; not one of them was promoted to verified.
- Russia and Belarus were not touched, per the wave scope; their T1 exclusion
  documentation stands unchanged.

---

# Wave T2B — North America & Oceania (2026-08-12)

Dataset 104 → 173 records (103 → 172 publishable), 43 → 47 countries. 69 records
now name an ISO 3166-2 subdivision. 8 research workstreams; 69 accepted, 91
rejected, 31 unresolved.

## The architectural decision: subnational modelling

Before T2B, `coverage: 'regional'` said a platform served a sub-national area
without saying which one. Fine for German Länder whose names carry the answer;
useless for twenty US states.

Rejected: giving California a country slug. That puts a lie in the field the
whole dataset joins on.

Adopted: one optional field, `subnationalJurisdiction`, holding an ISO 3166-2
code validated against `scripts/lib/iso-3166-2.cjs` — the allowlist this
repository **already maintained**, generated from an ISO-derived source with a
recorded digest, already covering US (57), CA (13), AU (8), DE (16), GB. No new
vocabulary was invented.

**The migration was additive and that was tested, not asserted:** the field is
optional, the 104 pre-existing records were byte-identical after the schema
landed, and a guard asserts records without the field still validate.

Four guards, four ways the field can lie — all with passing mutations: unknown
code (`US-ZZ`), deprecated code (`GB-EAW`, which looks real because CLDR still
carries a display name), country contradiction (California under Canada), and a
subdivision on a national/supranational record.

Enrichment, reported not silent: 25 pre-existing European regional records were
given codes (19 German Länder platforms, 6 UK devolved systems), derived
mechanically from each record's own verified name, so the page does not show
"United States · California" beside a bare "Germany". Reykjavík keeps no code
and says why — the allowlist covers nine countries and Iceland is not one.

## The deduplication decision

North American public buyers share commercial procurement infrastructure, and
the available failure was twenty rows for one supplier account. The
classification was made on operator sentences in both directions:

**Accepted as shared platforms** — one supplier account spanning many public
buyers, on that platform's own identity: BidNet Direct ("Access all Member
Agency bid opportunities" on a $0 account), MERX, Periscope S2G ("respond to all
bids from 1,000+ government organizations"), DemandStar/Euna OpenBids ("the same
platform and login you use today" across 1,400+ agencies), Euna Supplier
Network, bids&tenders, Biddingo, Public Purchase, OpenGov supplier portal,
QuestCDN.

**Rejected as software vendors** on a white-label tenant model, where each buyer
is a separate tenant and there is no cross-buyer supplier identity: **Ion Wave,
PlanetBids, JAGGAER**, SAP Ariba Discovery, Periscope BuySpeed (buyer-side), and
three corporate marketing sites.

**Rebrand caught:** Bonfire → Euna Supplier Network, published once under the
current name rather than twice.

**The guard earned its keep during the merge:** MERX arrived from both the
Canada and shared-platform workstreams and was silently deduplicated by host
identity instead of becoming two records. `softwareVendor` is now populated on
65 records, keeping "who operates this" and "whose software runs it" separately
answerable — Cal eProcure records InFlight, BidBuy records Periscope, OhioBuys
records Ivalua, PA Supplier Portal records SAP, and none of them is published as
a vendor platform.

## US federal: an ecosystem, not a row

Eight records. **SAM.gov is ONE platform**, not two: Contract Opportunities and
Entity Registration are one domain, one Login.gov identity, one workspace, and
GSA's own About page documents them as functions of the same site — so they are
captured as `tenderSearchUrl` and `supplierRegistrationUrl` on a single record.
Alongside it: GSA eBuy, eOffer/eMod, FedConnect, Unison Marketplace, PIEE
Solicitation Module, DLA DIBBS, SBA SUBNet.

Rejected: FPDS and USAspending (`award-data-only`), acquisition.gov
(`authority-only`), GSA Advantage (buyer catalogue, no supplier opportunity
surface). FBO.gov plus six other decommissioned systems recorded as superseded
by SAM.gov.

## Foreign vs out-of-state — a distinction held

Ten records carry `foreignSuppliersAccepted: yes`, every one class A with an
operator quote. 153 say unknown. The US state research repeatedly found sources
addressing **out-of-state** vendors and correctly refused to read that as
foreign eligibility — Texas CMBL documentation covers Texas and out-of-state
vendors and delivery zones, California materials address out-of-state vendors;
in both cases the field stayed unknown and the limitation says why.

## Coverage matrices (derived)

### United States (20 P0 states targeted)

| Jurisdiction | Records | Search | Registration | Submission | Documents | Browser-check |
|---|---|---|---|---|---|---|
| **National / federal** | 15 | 4 | 9 | 1 | 0 | 9 |
| Arizona (US-AZ) | 1 | 1 | 1 | 0 | 0 | 1 |
| California (US-CA) | 1 | 1 | 0 | 0 | 0 | 0 |
| Colorado (US-CO) | 1 | 0 | 0 | 0 | 0 | 1 |
| Florida (US-FL) | 1 | 0 | 0 | 0 | 0 | 1 |
| Georgia (US-GA) | 1 | 0 | 0 | 0 | 0 | 0 |
| Illinois (US-IL) | 2 | 2 | 1 | 1 | 0 | 0 |
| Indiana (US-IN) | 1 | 1 | 1 | 0 | 0 | 1 |
| Massachusetts (US-MA) | 1 | 1 | 0 | 0 | 0 | 1 |
| Michigan (US-MI) | 1 | 0 | 0 | 0 | 0 | 1 |
| Minnesota (US-MN) | 1 | 1 | 1 | 0 | 0 | 1 |
| Missouri (US-MO) | 1 | 1 | 1 | 0 | 0 | 1 |
| North Carolina (US-NC) | 1 | 1 | 1 | 0 | 0 | 0 |
| New Jersey (US-NJ) | 1 | 1 | 0 | 0 | 0 | 0 |
| New York (US-NY) | 1 | 1 | 1 | 0 | 0 | 0 |
| Ohio (US-OH) | 1 | 0 | 0 | 0 | 0 | 1 |
| Pennsylvania (US-PA) | 2 | 1 | 0 | 0 | 0 | 1 |
| Tennessee (US-TN) | 1 | 1 | 1 | 0 | 0 | 1 |
| Texas (US-TX) | 1 | 1 | 1 | 0 | 0 | 0 |
| Virginia (US-VA) | 1 | 1 | 1 | 1 | 0 | 0 |
| Washington (US-WA) | 1 | 1 | 0 | 0 | 0 | 0 |
| **Total** | 37 | 20 | 19 | 3 | 0 | 20 |

### Canada (10 provinces + 3 territories)

| Jurisdiction | Records | Search | Registration | Submission | Documents | Browser-check |
|---|---|---|---|---|---|---|
| **National / federal** | 4 | 3 | 3 | 1 | 0 | 2 |
| Alberta (CA-AB) | 1 | 1 | 1 | 0 | 0 | 1 |
| British Columbia (CA-BC) | 1 | 0 | 0 | 0 | 0 | 1 |
| New Brunswick (CA-NB) | 1 | 0 | 0 | 0 | 0 | 1 |
| Nova Scotia (CA-NS) | 1 | 0 | 0 | 0 | 0 | 1 |
| Northwest Territories (CA-NT) | 1 | 0 | 0 | 0 | 0 | 1 |
| Nunavut (CA-NU) | 1 | 0 | 1 | 0 | 0 | 0 |
| Ontario (CA-ON) | 1 | 0 | 0 | 0 | 0 | 1 |
| Prince Edward Island (CA-PE) | 1 | 0 | 0 | 0 | 0 | 1 |
| Quebec (CA-QC) | 1 | 0 | 0 | 0 | 0 | 1 |
| Saskatchewan (CA-SK) | 1 | 1 | 1 | 0 | 0 | 0 |
| Yukon (CA-YT) | 1 | 0 | 0 | 0 | 0 | 0 |
| **Total** | 15 | 5 | 6 | 1 | 0 | 10 |

**Not covered:** Manitoba (CA-MB), Newfoundland and Labrador (CA-NL)

### Australia (6 states + 2 territories)

| Jurisdiction | Records | Search | Registration | Submission | Documents | Browser-check |
|---|---|---|---|---|---|---|
| **National / federal** | 4 | 3 | 2 | 0 | 1 | 1 |
| Australian Capital Territory (AU-ACT) | 1 | 1 | 1 | 0 | 0 | 1 |
| New South Wales (AU-NSW) | 2 | 2 | 2 | 0 | 0 | 2 |
| Northern Territory (AU-NT) | 1 | 1 | 1 | 0 | 0 | 0 |
| Queensland (AU-QLD) | 2 | 1 | 1 | 0 | 0 | 1 |
| South Australia (AU-SA) | 1 | 1 | 1 | 0 | 0 | 1 |
| Tasmania (AU-TAS) | 1 | 1 | 1 | 0 | 0 | 0 |
| Victoria (AU-VIC) | 2 | 1 | 1 | 0 | 0 | 2 |
| Western Australia (AU-WA) | 1 | 1 | 1 | 0 | 0 | 0 |
| **Total** | 15 | 12 | 11 | 0 | 1 | 8 |

### New Zealand (national architecture)

| Jurisdiction | Records | Search | Registration | Submission | Documents | Browser-check |
|---|---|---|---|---|---|---|
| **National / federal** | 2 | 1 | 2 | 0 | 1 | 0 |
| **Total** | 2 | 1 | 2 | 0 | 1 | 0 |

## Rejection classes (91 across all workstreams)

authority-only (dominant, as in Europe) · award-data-only · software-vendor /
white-label-tenant · grant-only · surplus-not-procurement ·
buyer-catalog-no-supplier-opportunity-surface · vendor-directory-not-solicitation
· legacy-superseded · retired-superseded · duplicate-alias · dead-host ·
soft-404 · not-the-platform-parked-domain · tender-alert-reseller ·
out-of-scope-global-private-b2b · framework-information-only ·
buyer-instance-of-shared-vendor-software · grants-and-payments-self-service.

## Unresolved (31)

Notably: GSA eBuy and the Vendor Support Center are unreachable from this
network vantage (DNS resolves publicly to GSA address space; direct connection
times out) — an egress restriction, recorded as such rather than as a dead host.
Manitoba and Newfoundland and Labrador have no accepted record: both appear to
route suppliers to shared commercial platforms rather than operating a
provincial supplier identity, which is recorded as a finding rather than filled
with a fabricated provincial portal. 72 records carry browserCheckRequired: many
US and Australian state portals are script-rendered, and not one was promoted to
verified on the strength of a 200.

## Method notes

- One workstream (the seven largest US states) died mid-run on a connection
  error and was re-run as a focused single-agent workflow rather than dropped.
  A workflow resume then mis-slotted and produced a thinner duplicate of the
  shared-platform workstream; the original, richer result was kept and the
  duplicate discarded — noted here because "the tooling glitched" is exactly the
  kind of thing that silently loses research.
- No rendered browser in this wave either. Nothing labelled browser-check was
  checked in a browser.
- Russia and Belarus untouched; T1 exclusion documentation stands.

---

# Wave T3 — Asia, Middle East, Latin America & Africa (2026-08-12)

16 research workstreams. Dataset 173 → 310 records (172 → 309 publishable),
47 → 96 countries. 140 accepted, 174 rejected, 81 unresolved.

## Dataset

| Metric | Before | After |
|---|---|---|
| records | 173 | 310 |
| publishable | 172 | 309 |
| countries | 47 | 96 |
| evidence A | 110 | 163 |
| evidence B | 57 | 132 |
| evidence unknown | 5 | 14 |
| browser-check | 75 | 152 |

## Routes (denominator = publishable)

| Route | Before | After |
|---|---|---|
| tenderSearchUrl | 101/172 (58%) | 170/309 (55%) |
| supplierRegistrationUrl | 68/172 (39%) | 116/309 (37%) |
| submissionUrl | 12/172 (6%) | 19/309 (6%) |
| documentsUrl | 7/172 (4%) | 13/309 (4%) |

## Geography (T3 scope)

| Region | Records | Countries with >=1 |
|---|---|---|
| East Asia | 25 | 3/3 |
| South Asia | 10 | 1/5 |
| Southeast Asia | 20 | 6/9 |
| Middle East | 17 | 9/10 |
| Latin America | 41 | 16/16 |
| Africa | 24 | 14/14 |
| **T3 total** | **137** | |

### Country detail

| Region | Country | Records |
|---|---|---|
| East Asia | china | 9 |
| East Asia | japan | 10 |
| East Asia | south-korea | 6 |
| South Asia | india | 10 |
| South Asia | pakistan | 0 *(zero — reported, not padded)* |
| South Asia | bangladesh | 0 *(zero — reported, not padded)* |
| South Asia | nepal | 0 *(zero — reported, not padded)* |
| South Asia | sri-lanka | 0 *(zero — reported, not padded)* |
| Southeast Asia | indonesia | 7 |
| Southeast Asia | vietnam | 2 |
| Southeast Asia | philippines | 3 |
| Southeast Asia | malaysia | 3 |
| Southeast Asia | singapore | 1 |
| Southeast Asia | thailand | 4 |
| Southeast Asia | cambodia | 0 *(zero — reported, not padded)* |
| Southeast Asia | laos | 0 *(zero — reported, not padded)* |
| Southeast Asia | myanmar | 0 *(zero — reported, not padded)* |
| Middle East | saudi-arabia | 1 |
| Middle East | united-arab-emirates | 6 |
| Middle East | qatar | 1 |
| Middle East | kuwait | 1 |
| Middle East | oman | 1 |
| Middle East | bahrain | 1 |
| Middle East | jordan | 2 |
| Middle East | israel | 3 |
| Middle East | lebanon | 1 |
| Middle East | iraq | 0 *(zero — reported, not padded)* |
| Latin America | brazil | 13 |
| Latin America | mexico | 3 |
| Latin America | argentina | 4 |
| Latin America | colombia | 5 |
| Latin America | chile | 1 |
| Latin America | peru | 3 |
| Latin America | ecuador | 1 |
| Latin America | bolivia | 2 |
| Latin America | uruguay | 1 |
| Latin America | paraguay | 2 |
| Latin America | guatemala | 1 |
| Latin America | costa-rica | 1 |
| Latin America | panama | 1 |
| Latin America | honduras | 1 |
| Latin America | el-salvador | 1 |
| Latin America | dominican-republic | 1 |
| Africa | south-africa | 5 |
| Africa | nigeria | 3 |
| Africa | egypt | 1 |
| Africa | kenya | 3 |
| Africa | ethiopia | 1 |
| Africa | ghana | 2 |
| Africa | tanzania | 1 |
| Africa | uganda | 1 |
| Africa | morocco | 1 |
| Africa | algeria | 1 |
| Africa | rwanda | 1 |
| Africa | zambia | 1 |
| Africa | botswana | 1 |
| Africa | namibia | 2 |

## Foreign-supplier evidence

yes **25** · no **1** · unknown **283**

Every `yes`, with its class-A basis:

- **Sistemi i Prokurimit Elektronik (SPE) — Albanian Electronic Public Procurement System** (albania, class A) — "Theksojmë se, kjo dritare është e vlefshme vetëm për operatorët ekonomikë të huaj." (We emphasize that this window is valid only for foreign economic...
- **Bahrain Tender Board e-Tendering System** (bahrain, class A) — Supplier Type: Local | Individual (GCC) Supplier | International Supplier — Registration For: Tender Participation (Will Be Eligible To Participate In...
- **Compras.gov.br** (brazil, class A) — As empresas estrangeiras que não funcionem no país para participarem de licitações, devem se cadastrar no Sicaf — art. 20-A da Instrução Normativa nº ...
- **Portal de Compras Públicas** (brazil, class A) — Com o perfil internacional, você acessa oportunidades no Brasil de forma simples, transparente e segura. (operator's own 'Empresas internacionais' adh...
- **CanadaBuys / AchatsCanada** (canada, class A) — For Canadian businesses: Register for a CRA business number. For businesses outside of Canada: Register for a non-resident CRA business number...
- **Mercado Público** (chile, class A) — Persona natural o jurídica, chilena o extranjera, o agrupación de las mismas, que puedan proporcionar bienes y/o servicios a las instituciones del Est...
- **中国国际招标网 (China International Bidding Network)** (china, class A) — 《机电产品国际招标投标实施办法》第三十八条：「投标人在招标文件要求的投标截止时间前，应当在招标网免费注册，注册时应当在招标网在线填写招投标注册登记表，并将由投标人加盖公章的招投标注册登记表及工商营业执照（复印件）提交至招标网；境外投标人提交所在地登记证明材料（复印件）……投标截止时间前，投标人未在招...
- **SICOP** (costa-rica, class A) — registrar e inscribir todas las personas físicas y jurídicas, nacionales y extranjeras que deseen ofrecer bienes y servicios a las Instituciones Usuar...
- **Portal Transaccional** (dominican-republic, class A) — las personas físicas o jurídicas extranjeras no necesitan estar inscritos en el Registro de Proveedor del Estado (RPE) para participar en los procedim...
- **EIB Group Procurement portal (eib.org — Corporate & Technical Assistance procurement)** (european-union, class A) — Participation in the tender is open to all natural and legal persons. If the financing is exclusively provided by the European Commission, participati...
- **ECEPP - EBRD Client e-Procurement Portal** (european-union, class A) — The Bank welcomes individuals and companies from all countries of the world to take part in its projects as suppliers, contractors, service providers ...
- **EU Funding & Tenders Portal (SEDIA) — Calls for Tenders** (european-union, class A) — Participation in calls for tenders is open on equal terms to all natural and legal persons coming within the scope of the Treaties, as well as to inte...
- **HonduCompras** (honduras, class A) — Proveedores, ya sea nacionales o extranjeros: Para consultar nuevas oportunidades de negocio y participar de las mismas, así como recibir notificacion...
- **Acquisti in Rete PA — Consip e-procurement portal (MePA, convenzioni, accordi quadro, SDAPA, gare in ASP)** (italy, class A) — "Foreign firms can register to Acquisti in rete PA and qualify to operate on the MePA." — https://www.acquistinretepa.it/opencms/opencms/english/forei...
- **EIS — Elektronisko iepirkumu sistēma (Electronic Procurement System)** (latvia, class A) — https://www.eis.gov.lv/EIS/Publications/PublicationView.aspx?PublicationId=1203&systemCode=CORE — 'In the e-procurement system, registered users have ...
- **Portail Marocain des Marchés Publics** (morocco, class A) — Entreprise non établie au Maroc — Les informations nécessaires ainsi que les étapes à suivre pour l'inscription sont indiquées dans le formulaire suiv...
- **Pae Hokohoko | Marketplace (New Zealand Government Marketplace)** (new-zealand, class A) — All suppliers are welcome to apply to join the Marketplace, whether you are a New Zealand or overseas company....
- **إسناد (Esnad)** (oman, class A) — شركة عالمية … رقم التسجيل الدولي (مورد غير عماني)...
- **SEACE** (peru, class A) — Estar inscrito en el Registro Nacional de Proveedores (RNP) es un requisito para ser proveedor del Estado. Puedes hacerlo como persona natural o juríd...
- **Registro Nacional de Proveedores (RNP)** (peru, class A) — Puedes hacerlo como persona natural o jurídica, nacional o extranjera....
- **GeBIZ (Government Electronic Business System)** (singapore, class A) — GeBIZ ID is for foreign companies or foreign individuals WITHOUT Unique Entity Number (UEN)...
- **나라장터 (KONEPS)** (south-korea, class A) — All bidders who wish to participate in PPS's bidding must register with PPS at least one day prior to submitting their bids, however, foreign bidders ...
- **Find a Tender (FTS) / Central Digital Platform** (united-kingdom, class A) — GOV.UK supplier registration guide (https://www.gov.uk/government/publications/procurement-act-2023-short-guides/suppliers-how-to-register-your-organi...
- **Edison Supplier Portal (State of Tennessee)** (united-states, class A) — International suppliers, however, cannot be created through this online registration process. The supplier's IRS W-8 must be submitted via email to Su...
- **Hệ thống mạng đấu thầu quốc gia (Vietnam National Electronic Procurement System, VNEPS)** (vietnam, class A) — Register → 'Register as foreign contractors, investors' and 'Register as foreign individual bidder' (operator's own English navigation on https://muas...

## Ecosystem relationships

- `partOf`: 15 -> 29
- `replacedBy`: 1 -> 1
- `softwareVendor` recorded: 107
- records with zero verified routes (homepage-only, legitimate): 108

## Scripts represented

- Arabic: 10 records
- Cyrillic: 4 records
- Han (Chinese/Japanese): 18 records
- Hangul (Korean): 5 records
- Kana (Japanese): 9 records

## Structural findings — the point of the wave

**BRAZIL — publication and transaction are different systems.** PNCP
(pncp.gov.br) is the mandatory national publication portal created by Lei
14.133/2021 art. 174, covering União, Estados and Municípios; it has no supplier
registration and no bidding. Compras.gov.br is the federal transactional system
where suppliers register through SICAF and bid. Two records, related but not
merged. ComprasNet's supersession was **observed** — comprasnet.gov.br 301s to
gov.br/compras — not inferred. Brazil also carries accredited *private* bidding
platforms (Portal de Compras Públicas, BLL, BNC, Licitanet) typed as
private-company, because in Brazil a public buyer may lawfully run its
procurement on one.

**COLOMBIA — three systems, one authority.** SECOP I (publication), SECOP II
(transactional, "con cuentas para entidades y proveedores" in the operator's own
words), and the Tienda Virtual del Estado Colombiano (catalogue) are three
records; colombiacompra.gov.co is rejected as the authority. Mi Mercado Popular
is `partOf` the Tienda. Vendors recorded separately: VORTAL powers SECOP II,
Coupa powers the Tienda — neither is published as a platform.

**CHINA — four national tracks, not one portal.** The MOF track
(中国政府采购网, ccgp.gov.cn) under the Government Procurement Law; the NDRC
public-resource trading track (全国公共资源交易平台, ggzy.gov.cn) operated by the
State Information Center; the tendering/bidding public service platform; and
institutional systems (中央政府采购网, 军队采购网, 中国人民银行采购网). Provincial
layers (Beijing, Guangdong) recorded where structurally distinct. Generic
Chinese B2B marketplaces rejected.

**INDONESIA — one ecosystem, not hundreds of LPSE rows.** INAPROC is the parent;
SPSE, Katalog Elektronik, SIRUP and SIKaP are `partOf` it. The hundreds of
agency LPSE deployments are instances of SPSE and are described in notes rather
than published as records — the single largest padding opportunity in this wave,
declined.

**INDIA — GeM and CPPP are not the same thing.** A transactional marketplace and
a tender-publication/eProcurement system, modelled separately. The GePNIC
central instance was deduplicated by host against CPPP rather than published
twice — the NIC-instance trap.

**NIGERIA — the honest structural answer.** There is no single mature national
tender platform of the SECOP II or Compras.gov.br type. bpp.gov.ng is purely the
regulator and is rejected as `authority-not-platform`. What exists is a set of
narrow federal surfaces plus state fragmentation, and the record set says that
rather than inventing a national portal.

**SOUTH AFRICA — lifecycle stages split.** eTender Publication Portal is
discovery; the Central Supplier Database is registration. Both published,
because they answer different supplier questions; a supplier database is not a
tender platform.

**UAE — genuinely separate emirate systems.** Federal eSupply, Dubai's Digital
Procurement Platform, Abu Dhabi's ADGPG, Sharjah Finance and Sharjah Airport.
JAGGAER appears as `softwareVendor` on four of them and as operator on none.

## Schema decisions

**No subdivision codes were invented.** The project ISO 3166-2 allowlist in
`scripts/lib/iso-3166-2.cjs` covers US, CA, AU, DE, ES, IT, JP, CN and GB.
Chinese provincial and Japanese prefectural systems may therefore carry real
codes; Indian, Brazilian, Indonesian and Nigerian state systems carry
`coverage: regional` with **no** code and a limitation saying why. Regenerating
the allowlist from its documented source is a deliberate future act, not
something to improvise mid-wave.

**Three violations were caught at the merge gate and fixed at rule level:**
- PaDi UMKM is operated by PT Telkom, which also built it. `state-owned-enterprise`
  was removed from the vendor-displacement guard: an SOE is a company, and a
  company running its own product is the FedConnect arrangement.
- A CJK-only name slugified to nothing, leaving a trailing hyphen in an id.
- Egypt's General Authority for Government Services is http-only. The https rule
  had conflated a platform's own surfaces (must be TLS — these are links we send
  suppliers to) with a **citation** (cite what exists). Citations may now be
  http, must record it in limitations, and a test enforces that.

## Unicode integrity

Guards were written **before** the data arrived: CSV round-trip, page render,
no \u escapes in the source file, byte-stable sorting, and a mojibake detector
that reverses the corruption rather than pattern-matching signatures (the
signature version caught "Ã©"-style damage to accented Latin and missed Chinese
entirely). Han, Kana, Hangul, Arabic and Cyrillic all verified end to end.

## Browser verification

**None was performed.** No rendered browser exists in this environment.
browser-check rose 75 → 152 because T3 added many login-gated and script-rendered
systems; not one was promoted to verified on the strength of a 200. HTTP fetching
is not browser verification and is never recorded as such.

## T4 candidates — International & Multilateral Procurement

81 distinct mentions across the workstreams, clustering hard: **UNGM**, **World
Bank** (STEP / eConsultant2 / Business Opportunities), **IDB/BID**, **AfDB**,
**ADB**, **IsDB**, **AIIB**, **EBRD**, **CAF**, **FONPLATA**, **BCIE/CABEI**,
plus regional bodies (AU, ECOWAS, EAC, SADC, MERCOSUR) and bilateral donors
(JICA, KOICA, AFD, GIZ). These are architecturally global rather than
jurisdictional and were deliberately **not** forced into country records. A
dedicated wave is justified.
