# Tender & Procurement Platforms — Wave T1 research log

Internal. Not published: `/docs/*` is blocked from public serving by `_redirects`.

Wave T1 scope is Europe, prioritised P0/P1 (official national procurement
systems, national e-submission, EU/international institutions). Regional,
municipal, sector, utilities and commercial aggregators are deferred to T1b.

This log exists so that a later pass can tell the difference between *"not
researched yet"* and *"researched and rejected"*. Those are not the same gap and
must never be collapsed.

---

## 1. Rejection log

Rejections are as much a research product as acceptances. Each is recorded with
the class from PART 43 and what was actually observed.

### 1.1 `grant-only` — the highest-risk near-miss of this wave

The European Commission publishes a **"national single portals"** list covering
27 countries. It reads exactly like a national procurement portal index. It is
not one: every entry is an **EU funding / cohesion portal** for the 2021–2027
period (ERDF, ESF+, Cohesion Fund).

Publishing that list would have fabricated 27 procurement platforms from an
authoritative-looking source on day one. All 27 are rejected as `grant-only`,
and the hosts are additionally denied by name in
`scripts/tests/tp-platforms.test.cjs` so the mistake cannot be made later by
someone who has not read this note.

Source: <https://commission.europa.eu/funding-tenders/find-funding/funding-management-mode/national-single-portals_en>

Rejected hosts include: `eufunds.bg`, `dotaceeu.cz`, `eufonde.dk`,
`fondoseuropeos.gob.es`, `europe-en-france.gouv.fr`, `eufondovi.gov.hr`,
`palyazat.gov.hu`, `eufunds.ie`, `opencoesione.gov.it`, `esfondi.lv`,
`fondi.eu`, `europaomdehoek.nl`, `funduszeeuropejskie.gov.pl`,
`portugal2030.pt`, `fonduri-ue.ro`, `eufonder.se`, `evropskasredstva.si`,
`eurofondy.gov.sk`, `espa.gr`, `eufunds.com.cy`, `rtk.ee`,
`eurahoitusneuvonta.fi`.

### 1.2 `no-procurement-function` — authority ≠ platform

The Commission's *procurement* contact list is a mix of regulators, advisory
bodies, central purchasing bodies and actual platforms. A naive import would
have published all of them as tender portals.

| Candidate | Country | Observed | Class |
|---|---|---|---|
| `pianoo.nl` | Netherlands | 200, "PIANOo — Dutch Public Procurement Expertise Centre". An expertise centre, not a tender platform. Real platform is TenderNed. | `no-procurement-function` |
| `hankinnat.fi` | Finland | 200, procurement advisory unit. Not a notice system. | `no-procurement-function` |
| `uzp.gov.pl` | Poland | 200, host-drifts to `gov.pl/web/uzp` — the regulator's page. Platform is e-Zamówienia. | `no-procurement-function` |
| `iub.gov.lv` | Latvia | 200, Procurement Monitoring Bureau — supervisory body. | `no-procurement-function` |
| `bmwi.de/...public-procurement.html` | Germany | Ministry dossier page describing procurement law. | `no-procurement-function` |
| `bbg.gv.at` | Austria | 200, Bundesbeschaffung GmbH — central purchasing body buying for the federation, not a public notice search. | needs re-scope in T1b |

### 1.3 `soft-404` and unusable routes

Discovered by verifying candidate deep routes rather than trusting them.

| Route | Observed | Action |
|---|---|---|
| `base.gov.pt/Base4/en/pesquisa/` | **HTTP 404 while serving the homepage body** — textbook soft 404 | not published as `tenderSearchUrl` |
| `etenders.gov.ie/epps/quickSearchAction.do` | HTTP 200 with a **0-byte body** | not published |
| `ejn.gov.si/eJN2` | redirects back to the site root — homepage fallback | not published |

### 1.4 `rebrand` / host drift

| Candidate | Observed |
|---|---|
| `eaadhsy.gr` (Greece) | drifts to `eadhsy.gr` — rebrand. Canonicalise to the current host in T1b; the authority-vs-platform question is still open (platform is likely ESIDIS/promitheus). |
| `kozbeszerzes.hu/english/` (Hungary) | drifts to `english.kozbeszerzes.hu` — authority site; platform is EKR, unresearched. |

### 1.5 `WAF-unverifiable` / transport failures — **not** rejections

Recorded so a later pass does not mistake these for dead systems. **A non-200 is
not death.**

| Candidate | Observed |
|---|---|
| `vpt.lt` (Lithuania) | 403 Cloudflare "Just a moment..." |
| `contracts.gov.mt` (Malta) | 403 Cloudflare "Attention Required!" |
| `evergabe-online.de` (Germany) | **400** "Cookies benötigt" — cookie gate. Published with `browserCheckRequired: true`. |
| `tenderned.nl` (Netherlands) | 200 but **117 bytes** — JS shell. Published with `browserCheckRequired: true`. |
| `udbud.dk` (Denmark) | 200 but 902 bytes — JS shell. Published with `browserCheckRequired: true`. |
| `eprocurement.gov.cy` (Cyprus) | connection failure (000) |
| `marches.public.lu` (Luxembourg) | connection failure (000) |
| `contrataciondelestado.es` (Spain) | connection failure (000) |
| `vz.nipez.cz` (Czechia) | connection failure (000) — the NEN sibling gazette |

No rendered-browser capability was available in this pass. HTTP fetching is
**not** browser verification and is never recorded as such.

---

## 2. Country completeness matrix

`published` counts records currently in `data/tenders-procurement/platforms.json`.

| Jurisdiction | National portal identified | Verified live | Published | Status |
|---|---|---|---|---|
| EU institutions | TED | yes | 1 | P0 done; EC/EP/ECB/EIB/EIF/EBRD not yet researched |
| Czechia | NEN | yes | 1 | gazette `vz.nipez.cz` unreachable this pass |
| Germany | e-Vergabe (federal) | cookie gate | 1 | federal only; 16 Länder outstanding |
| Denmark | Udbud.dk | shell only | 1 | needs browser check |
| Ireland | eTenders | yes | 1 | vendor European Dynamics recorded separately |
| Netherlands | TenderNed | shell only | 1 | needs browser check |
| Poland | e-Zamówienia | yes | 1 | |
| Portugal | BASE | yes | 1 | transparency DB; bidding system not identified |
| Romania | SEAP / SICAP | yes | 1 | |
| Slovenia | e-JN | yes | 1 | |
| Croatia | candidate `javnanabava.hr` | partial | 0 | authority-vs-platform unresolved (EOJN) |
| Bulgaria | candidate `www2.aop.bg` | partial | 0 | authority; platform likely CAIS EOP |
| Slovakia | candidate `uvo.gov.sk` | partial | 0 | authority; platform likely IS EVO |
| Greece, Hungary, Latvia, Lithuania, Malta, Cyprus, Luxembourg, Spain, Austria, Belgium | candidates only | no | 0 | unresolved |
| Estonia, Finland, France, Italy, Sweden | not researched | — | 0 | **gap** |
| UK, Switzerland, Norway, Iceland, Liechtenstein | not researched | — | 0 | **gap** |
| Ukraine, Turkey | not researched | — | 0 | **gap** |
| Albania, Bosnia, Kosovo, Montenegro, North Macedonia, Serbia | not researched | — | 0 | **gap** |
| Moldova, Georgia, Armenia, Azerbaijan | not researched | — | 0 | **gap** |
| Russia, Belarus | not researched | — | 0 | **deliberately untouched** — PART 16 requires a sanctions/accessibility assessment before any record exists |

**Published: 10 records across 10 jurisdictions.** 34 of 44 scoped jurisdictions
are not yet researched. No placeholder rows were created for them.

---

## 3. Method notes

- Local-language querying was used where it changed results (Czech
  `veřejné zakázky`, Polish `platforma e-Zamówienia`). It is **not yet** done
  systematically per PART 9; that remains outstanding for every gap country.
- `WebSearch` is US-region. Local-language European sources still surface, but
  geo-weighted result sets are a known limitation of this pass.
- Verification used `curl` capturing status, final URL, host drift, title, byte
  size and WAF/login/parked markers. Verification is cheap (~0.4 s/URL); search
  and per-candidate judgement are the real cost.

## 4. Next (T1b)

1. Resolve authority-vs-platform for HR, BG, SK, GR, HU, LV, LT.
2. Research the five unstarted EU states: EE, FI, FR, IT, SE.
3. UK (Find a Tender / Contracts Finder + devolved), then EFTA, UA (Prozorro
   ecosystem + authorised marketplaces), TR (EKAP), Western Balkans.
4. Russia/Belarus accessibility and sanctions assessment before any record.
5. Then the public collection: generator, renderer, 4-locale pages, country and
   type pages, CSV export, sitemap integration.
