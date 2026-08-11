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
