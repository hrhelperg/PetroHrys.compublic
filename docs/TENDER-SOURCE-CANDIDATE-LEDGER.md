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

### Spain — Plataforma de Contratación del Sector Público — **DEFER**

**Terminal state: DEFER — `CURRENT_UNIVERSE_NOT_ENUMERABLE_FROM_QUALIFIED_OFFICIAL_SOURCE`.**
The adapter is built, validated and committed; the source cannot bootstrap a
current corpus. See the window finding below and in the coverage doc.

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
| ACCEPT_CANDIDATE (qualified, none yet activated) | 7 |
| REJECT | 7 |
| DEFER | 6 |
| UNRESOLVED | 2 |

ACCEPT_CANDIDATE: Italy ANAC PPVL, United States SAM.gov bulk, Brazil
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


---

## Spain — bounded current-window search, 2026-08-13

Both official PLACSP syndication feeds were probed for a current-opportunity
view. Neither provides one.

| endpoint | HTTP | finding |
|---|---|---|
| `sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom` | 200 | chronological delta; 1,677 entries over ten hours of one day |
| `sindicacion_1044/PlataformasAgregadasSinMenores.atom` | 200 | **also chronological**; 274 entries over ~13 hours, dated `next` file |
| `sindicacion_643/licitacionesPerfilesContratanteEnPlazo.atom` | 200 | redirect page, not a feed — the name was a guess and it does not exist |
| `/sindicacion/` (index) | 403 | not enumerable |

Both real feeds are ordered by `updated` descending with dated continuation
files. **No official PLACSP syndication endpoint enumerates the currently open
universe.**

**Spain terminal state: DEFER.** The delta feed remains valuable later — for
change observation, enrichment and second-source provenance on opportunities
already known from TED — but it cannot bootstrap a current corpus, and
activating it would advertise partial Spanish coverage while generating false
closures.

## United States — SAM.gov bulk: the completeness property Spain lacks

Re-probed the same day. `ContractOpportunitiesFullCSV.csv`:
**HTTP 206, 251,608,326 bytes, `Last-Modified` 2026-08-13 03:30 GMT**, 47
columns including an explicit **`Active`** flag (col 24) alongside
`ArchiveDate`, `ArchiveType`, `ResponseDeadLine`, `NoticeId`, `Type`,
`BaseType`, `NaicsCode`, `ClassificationCode`, `Link`, `PostedDate`.

A full daily file carrying its own current-state flag is a **complete snapshot
by construction** — exactly the property the Spanish feeds do not have. Range
requests are honoured, so ingestion need not hold 251 MB in memory.

**Whole-file audit done (2026-08-13).** `Active` proved **not** authoritative:
all 82,960 rows are `Active=Yes`, including 12,645 award notices and 10,183
rows already past their `ArchiveDate`. The flag means "not archived", not
"open". Actionability comes from `Type` + `ResponseDeadLine`:
**12,894 actionable current** (Solicitation + Combined Synopsis/Solicitation
with a future deadline) plus 1,663 upcoming presolicitations, across 39
agencies, 585 NAICS codes and 977 PSC codes.

State: **ACCEPT_CANDIDATE, qualified, not activated.** No hard blocker; the
adapter and operational proofs remain to be built.

---

# Source #2 — SELECTED: Poland, Biuletyn Zamówień Publicznych (eZamówienia)

Selected on C1 evidence, not on the ledger's ordering. Adapter NOT built.

## Why Poland, against the two alternatives

The three ACCEPT_CANDIDATEs were Poland BZP, Czech VVZ and Romania SICAP. C1
separates them on the criteria the brief asks for:

| | current records | buyers | sources | top-source share |
|---|---|---|---|---|
| **Poland** | **577** | **402** | 2 | **100% TED** |
| Czech Republic | 148 | 102 | 2 | 99% TED |
| Romania | 117 | 96 | 1 | 100% TED |

Poland is **3.9× the Czech volume and 4.9× Romania's**, and it is the largest
single-source dependency in Europe: 577 current Polish opportunities, every one
of them reaching this corpus through TED. If TED has a bad week, Polish
coverage goes to zero — the same exposure the United States had before SAM, at
European scale.

Czech and Romania remain ACCEPT_CANDIDATE and are the natural #3 and #4. Nothing
about them was disqualified; they are simply smaller versions of the same case.

## Probe — 2026-08-13, one request, keyless

```
GET https://ezamowienia.gov.pl/mo-board/api/v1/Board/Search
      ?SortingColumnName=PublicationDate&SortingDirection=DESC
      &PageNumber=1&PageSize=5
  -> 200  application/json; charset=utf-8  6,930 bytes
```

A JSON array of notices, unauthenticated, no key, nothing bypassed. The first
record carries `noticeNumber "2026/BZP 00392343/01"`, `noticeType
"ContractNotice"`, `publicationDate` as a full UTC instant, and a Polish
`orderObject` title.

## The field that decides the case

```json
"isTenderAmountBelowEU": true
```

BZP states, per notice, whether the procurement is **below the EU publication
threshold**. Below-threshold Polish procurement is not published in TED at all —
it is not required to be. That is the source of the unique contribution, and it
is now an observed source fact rather than an assumption about overlap.

It also means the expected UNIQUE CURRENT cannot be estimated from the 577
records TED already carries: those are the above-threshold ones. The below-
threshold population is the part TED cannot supply, and its size must be
measured from BZP itself before any promise is made about it.

## What is NOT yet established

Deliberately listed so the next session starts from the gaps rather than
rediscovering them:

- **Window semantics.** Whether `Board/Search` is a current-opportunity view or
  a chronological publication stream. Spain was terminally deferred on exactly
  this question, and it must be answered before an adapter is written, not
  after.
- **Reuse terms.** No licence statement has been read. BZP is the statutory
  Polish publication register, which is suggestive and is not a licence.
- **Platform record.** Whether `pl-ezamowienia` (or equivalent) exists in the
  canonical TenderPlatform collection. An adapter may not mint one.
- **Deadline and status vocabulary**, CPV presence per notice, and whether the
  list endpoint carries them or needs one request per notice — the constraint
  that deferred Prozorro on rate respect.
- **Personal data.** Polish notices name a contact person; the columns must be
  identified and dropped before parsing completes.

## The constraint that applies to source #2 regardless

C1's storage verdict: the Discovery browser index is **1.81 MB gzip** and is the
binding constraint on this corpus, ahead of the build, the repository and search
latency. Poland at roughly 600–3,000 current records is a far smaller addition
than SAM's 10,511 and does not by itself force the issue, but the index strategy
should be decided before a third source of SAM's scale is considered.

---

# Czech Republic VVZ — QUALIFIED, NOT ACTIVATED

Probed 2026-08-13. Recorded so the next session starts from a reachable
endpoint rather than from the ledger's one-line note.

## What was established

`vvz.nipez.cz` is a React SPA and returns `text/html` for every path, so the
API had to be read out of the app's own bundle rather than guessed — the same
method the Polish notice URL needed.

```
GET https://api.vvz.nipez.cz/api/submissions/search?itemsPerPage=2
  -> 400  application/problem+json
     {"detail":"Query parameter \"formGroup\" is required",
      "code":"FILTER_CONSTRAINT_VIOLATION"}
```

Three things follow, and they are the ones that decide qualification:

1. **The endpoint is public.** A 400 naming a missing filter is not a 401 or a
   403. Nothing challenged for a credential, and nothing needs bypassing.
2. **It is a real structured API**, answering RFC-7807 problem documents with
   machine-readable error codes.
3. **`robots.txt` declares `Disallow:` with an empty value** — no restriction.

The client also declares Keycloak configuration (`REACT_APP_KEYCLOAK_URL`,
`_REALM`, `_CLIENT_ID`). That is for the AUTHORING side of the register —
contracting authorities filing notices — and the earlier ledger note that "only
a token stands between us and the data" appears to have conflated the two. The
public search path answered without one.

Related endpoints declared by the same bundle: `/api/submissions`,
`/api/submissions/public/{id}`, `/api/submissions/children/search`,
`/api/organizations`, `/api/enumerations/search`.

## What remains before an adapter

- The `formGroup` vocabulary, obtainable from `/api/enumerations/search`.
- Window semantics — the Poland gate. Whether the search can be constrained to
  notices still accepting offers, or only to a publication range.
- Page size and whether a full current window is reachable inside a sane cap.
- Status and deadline fields, CPV presence, and the contact-person columns.
- Reuse terms. VVZ is the statutory Czech register; the Czech implementation of
  Directive (EU) 2019/1024 is the likely basis, and it has not been read.

## Why it was not activated in this wave

Time, not capability. Poland was taken through to ACTIVE first because C1
evidence ranked it 3.9× larger, and the wave ended with Czech qualified rather
than half-built. `ISVZ Open Data bulk export` remains DEFER — VVZ is still the
preferred Czech route and this probe strengthens that.

**State: ACCEPT_CANDIDATE, endpoint confirmed reachable and unauthenticated.**

---

# Romania SICAP — NOT RE-PROBED IN THIS WAVE

Unchanged from the ledger: **ACCEPT_CANDIDATE**, `api-pub` SICAP/SEAP public
notices API. C1 measured Romania at 117 current opportunities, 100% via TED —
the same single-source dependency as Poland and Czech, at the smallest scale of
the three. It stays third in the ordering for that reason.
