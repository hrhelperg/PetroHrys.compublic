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
  wall; **not** published — needs a browser check before any record exists)

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

**UNRESOLVED (2):**
- **Albania** — `app.gov.al` verified live (305 KB) but titled as the
  procurement *agency*; platform-vs-authority not established by fetch.
- **Bosnia and Herzegovina** — `e-nabavke.gov.ba` connection failure; needs
  another vantage or a browser.
- (Azerbaijan's `etender.gov.az` also failed connection; Azerbaijan is
  therefore unresolved too — no record was created.)

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
calls-for-tenders surface):** not completed — the assigned research agent was
stopped by the spend limit. TED covers the EU-level P0. The institutional P1
pass moves to T2 with this note so it is not mistaken for a finished area.

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
