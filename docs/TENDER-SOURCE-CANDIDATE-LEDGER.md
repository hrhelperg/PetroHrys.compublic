# Tender source candidate ledger

Every source ever researched, with its terminal decision and the evidence
behind it. Nothing researched disappears from this file: a rejection is a
finding, and re-probing a known-blocked source is wasted work.

Probe dates are recorded because access classes change. A `WAF_BLOCKED` from
2026 is not a permanent verdict.

---

## Active sources (10)

`ted` · `uk-fts` · `canadabuys` · `worldbank` · `secop2` · `tenderned` ·
`boamp` · `za-etenders` · `uk-contracts-finder` · `de-vergabe`

## Terminal decisions carried forward from v1 (2026)

Recorded in `scripts/lib/to-sources.cjs`; repeated here so one file answers
"has this been looked at".

| candidate | class | decision | evidence |
|---|---|---|---|
| AusTender atom feed | WAF_BLOCKED | REJECT | 403 |
| ADB tenders RSS | WAF_BLOCKED | REJECT | 403 |
| EBRD ECEPP | WAF_BLOCKED | REJECT | 403 |
| SAM.gov opportunities API | API_KEY_REQUIRED | DEFER | empty response without key |
| NZ GETS | HTML_ONLY | REJECT | 200, no feed |
| UNGM | HTML_ONLY | REJECT | 200, POST-only search |
| Singapore GeBIZ | AWARDS_ONLY | REJECT | data.gov.sg returns awards |
| Prozorro | PARTIAL | DEFER | changes feed; title/CPV/deadline need one request per notice — a rate-respect decision, reversible if a bulk endpoint appears |
| Brazil PNCP | PARTIAL | DEFER | 200 but empty for the window tried |

---

# Stage B3 research — 2026-08-13

Probed against the **B2 re-baselined** gaps: telecom, security-defence,
chemicals-materials, textiles-ppe (PRIORITY_2), environment (PRIORITY_3), and
109 of 113 countries dependent on a single source.

## ACCEPT_CANDIDATE — qualified, not yet implemented

### Spain — Plataforma de Contratación del Sector Público
`PUBLIC_STRUCTURED` · ATOM + CODICE (Spanish UBL 2) XML · operator Dirección
General del Patrimonio del Estado.

`licitacionesPerfilesContratanteCompleto3.atom` returned 200 / 5,082,878 B,
`Last-Modified` 2026-08-10. **43 of 170 submission deadlines are in the
future**; status mix PUB 47 / EV 57 / ADJ 32 / RES 45 — live notices, not
awards. **CPV present as `cbc:ItemClassificationCode`.** Paginated via
`rel="next"`.

**TLS finding corrected (2026-08-13).** The research note said the chain does
not validate. That was `curl` on one machine. **Node validates it with
verification ON** — `authorized: true`, no `authorizationError` — because
AC RAIZ FNMT-RCM is in Node's bundled Mozilla trust store. No CA bundle, no
`NODE_EXTRA_CA_CERTS`, no agent override is needed. The safest possible
position was available and is what the adapter uses.

Target gap: Spain is TED-only with 171 current opportunities.

### Italy — ANAC Piattaforma di Pubblicità a Valore Legale (PPVL) v0
`PUBLIC_STRUCTURED` · JSON · operator ANAC.

`/api/v0/avvisi` returned 200 with `totalElements: 2535582`; a same-day notice
carried `dataPubblicazione 2026-08-13` and `dataScadenza 2026-08-28`. Spring
Data offset paging observed working.

*Caveats, both material:* `tipologia=BANDI` is **ignored server-side** — only 3
of 85 sampled records were actual tender notices, the rest sub-threshold direct
awards, so date-windowed pulls plus client-side filtering are required. And
**CPV arrives as an Italian free-text label, not a numeric code**
(`"cpv": "Servizi di trasloco"`), so it cannot populate a CPV code without a
reverse lookup that would be an invented mapping.

### United States — SAM.gov Contract Opportunities bulk extract
`PUBLIC_STRUCTURED` · CSV · operator GSA. **No key required** (unlike the API).

`ContractOpportunitiesFullCSV.csv` → 303 → signed S3, `Last-Modified`
2026-08-13 (same day). 131 of 162 sampled rows carry a deadline after the probe
date. Stable `NoticeId` GUID, canonical notice URL, buyer hierarchy.

*Caveats:* classification is **NAICS + PSC**, neither CPV nor UNSPSC — they
would enter as source-native codes or not at all, never as a crosswalk. No
currency column. 251 MB single file, so diffing on `NoticeId`/`ArchiveDate`
rather than incremental query.

Target gap: the largest absent market.

### Brazil — PNCP (Portal Nacional de Contratações Públicas)
`PUBLIC_STRUCTURED` · JSON · statutory under Lei 14.133/2021. No key.

`/api/consulta/v1/contratacoes/proposta` is a purpose-built **open-proposals**
endpoint: **17,389 open contratações in modality 6 alone**, verified future
closing dates, honest pagination counters, buyer identity down to IBGE
municipality.

*Caveats:* **no CPV and no UNSPSC anywhere** — `ncmNbsCodigo` and `catalogo`
were null on every sampled item, so sector assignment would be text-based,
which the coverage methodology explicitly rejects. And the licence is
**CC BY-ND 3.0** — the NoDerivatives clause sits badly with building a derived
corpus. **Licence must be resolved before activation.**

This supersedes the v1 `DEFER` (empty window): the window was wrong, not the
source.

### Lithuania — viesiejipirkimai.lt (CVP IS)
`HTML_ONLY` · operator Viešųjų pirkimų tarnyba.

2,168 live opportunities, deadlines through 2026-09, CPV (`BVPŽ kodai`), EUR
values, buyer, stable `resourceId`, pagination verified via
`quickSearchAction.do?...&d-3680175-p=N`. Records published the same hour as
the probe.

*Caveat:* HTML-only is the **last-resort access class**, and no licence
statement is published. Lower priority than the four structured sources above.

## REJECT

| candidate | class | reason |
|---|---|---|
| Sweden — Upphandlingsmyndigheten | n/a | **Structural.** SFS 2019:668 places notice publication in privately-run registered advertisement databases; the state aggregates only annual statistics. Any current-notice route runs through commercial aggregators, which are out of scope. |
| Lithuania — CVPP (legacy) | STALE | Publication moved 2024-12-01; nothing newer than 2024-12-24 (~20 months). CPV search and RSS explicitly out of service. |
| Lithuania — VPT on data.gov.lt | AWARDS_ONLY | Clean key-free JSON, but contract/report data: no deadline, no buyer on contract rows, no notice URL; freshest record 2026-01-28. |
| Italy — ANAC `dati.anticorruzione.it` | WAF_BLOCKED | F5 BIG-IP rejection on every path. Canonical Italian OCDS feed — worth retrying from a different egress. Recorded UNRESOLVED, not dead. |
| Australia — AusTender ATM site | WAF_BLOCKED | CloudFront 403 on `/robots.txt` itself. UNRESOLVED. |

## DEFER

| candidate | class | reason |
|---|---|---|
| Australia — AusTender OCDS API | AWARDS_ONLY | Technically the strongest feed probed: OCDS 1.1, UNSPSC, AUD values, cursor paging, **CC-BY-3.0-AU licence stated in the payload**. But the `DateType` enum admits only contract stages — it cannot supply a single open bid deadline. Accept only if award intelligence becomes in scope. |
| Belgium — e-Procurement | AUTH_REQUIRED | Endpoint, full filter schema (`cpvCodes`, `tenderSubmissionDeadlineFrom/To`) and Keycloak realm are documented in the site's own shipped config. Only a token stands between us and the data; minting one is a provisioning question. |
| Italy — HUB Contratti Pubblici (MIT) | HTML_ONLY | Legacy SCP application retired; replacement appears to consult BDNCP rather than publish. Low priority — ANAC PPVL covers Italy. |
| United States — SAM.gov API v2 | API_KEY_REQUIRED | Docs are explicit; key needs a registered account. The bulk extract above serves the same data unauthenticated, so this is a provisioning task, not a blocker. |

## Poland, Czech Republic, Romania — now terminal

Recovered from the probe transcript rather than re-probed.

| candidate | country | class | decision |
|---|---|---|---|
| Biuletyn Zamówień Publicznych (BZP) API, e-Zamówienia | Poland | PUBLIC_STRUCTURED | **ACCEPT_CANDIDATE** |
| Věstník veřejných zakázek (VVZ) submissions API | Czech Republic | PUBLIC_STRUCTURED | **ACCEPT_CANDIDATE** |
| ISVZ Open Data bulk export | Czech Republic | PUBLIC_STRUCTURED | DEFER — second Czech route; VVZ preferred |
| NEN — Národní elektronický nástroj | Czech Republic | HTML_ONLY | REJECT |
| SICAP / SEAP public notices API (api-pub) | Romania | PUBLIC_STRUCTURED | **ACCEPT_CANDIDATE** |
| data.gov.ro procurement datasets | Romania | STALE | REJECT |

**Every researched candidate is now terminal.** No candidate exists only in a
transcript.

## Terminality summary

| decision | count |
|---|---|
| ACCEPT_CANDIDATE (qualified, none yet activated) | 8 |
| REJECT | 7 |
| DEFER | 5 |
| UNRESOLVED | 2 |

ACCEPT_CANDIDATE: Spain, Italy ANAC PPVL, United States SAM.gov bulk, Brazil
PNCP, Lithuania, Poland BZP, Czech VVZ, Romania SICAP.

---

## Status

**No source was activated.** Every candidate above is qualified or rejected on
evidence, but adapter implementation, controlled ingest, dedup audit, unique
current contribution, health integration and failure testing were not done.

The two findings that most affect the plan:

1. **Two of the four best candidates carry no CPV or UNSPSC.** Brazil has no
   commodity code at all; the US has NAICS/PSC. Adding them would grow the
   corpus and the *unclassified* share at the same time — the metric B1 just
   improved. They are worth having, but the coverage methodology must be
   extended to represent native taxonomies honestly first, not by crosswalk.
2. **Brazil's CC BY-ND licence is a genuine blocker**, not a formality. It must
   be resolved before ingestion, and the site-wide gov.br footer is not a
   dataset licence.
