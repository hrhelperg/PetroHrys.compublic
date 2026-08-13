# Tender Opportunity Coverage — Phase A

**Status: PHASE A, B1, B2 COMPLETE. B3A (native taxonomy) COMPLETE. B3B
(research terminality) COMPLETE. B3 SOURCE #1 — SAM.gov — ACTIVE. C1
RE-BASELINE COMPLETE.**

> **Metric correction.** Earlier phases of this document counted "classified"
> as "carries CPV or UNSPSC". That is wrong for global procurement and is
> corrected below: a record carrying NAICS, PSC or GSIN is **classified**, it
> is simply not mapped into the 19 analytical sectors.

Measured against the committed corpus at `cca4f5af`: 9,577 canonical
opportunities, 6,964 current, 10 sources, 5,324 buyers.

---

## The premise this analysis corrects

The expansion brief describes a corpus "perceived primarily through
telecommunications-related opportunities". **The data says the opposite.**

Telecom is one of the *weakest* sectors in the corpus — **106 current
opportunities, `WEAK`, `PRIORITY_2`** — while construction has 1,418. The
telecom impression comes from the *supplier-profile* layer, where telecom is a
featured profile on the Intelligence and Opportunities pages, not from what the
corpus contains.

That distinction matters for this phase: expanding to fix a perceived telecom
bias would have targeted the wrong gap entirely.

## Method

Cohorts are derived from **classification codes only** — CPV divisions and
UNSPSC segments, mapped *independently* onto one analytical vocabulary. This is
**not** a CPV↔UNSPSC crosswalk and never becomes one.

Keyword classification was rejected. The Discovery relevance audit already
showed what it does: matching "construction" against text pulls in Defence
Construction Canada's *name*, and a division label drags a lift-servicing
contract into construction. A code is what the buyer actually asserted.

Nothing is written back to `TenderOpportunity`. A procurement has
classification codes; it does not have an "industry".

## Sector matrix — current opportunities

| sector | current | buyers | countries | sources | CPV | UNSPSC | top source | status | priority |
|---|---|---|---|---|---|---|---|---|---|
| *unclassified* | 1,912 | 835 | 79 | 7 | 0 | 1 | 48% | — | — |
| construction | 1,418 | 1,086 | 33 | 5 | 1,330 | 78 | 64% | STRONG | SUFFICIENT |
| professional-services | 716 | 600 | 29 | 5 | 627 | 101 | 46% | STRONG | SUFFICIENT |
| healthcare | 598 | 436 | 30 | 5 | 672 | 54 | 75% | STRONG | SUFFICIENT |
| it-software | 362 | 312 | 29 | 5 | 550 | 34 | 68% | ADEQUATE | SUFFICIENT |
| facilities | 361 | 314 | 29 | 5 | 775 | 26 | 73% | ADEQUATE | SUFFICIENT |
| office-supplies | 360 | 321 | 30 | 5 | 819 | 56 | 67% | ADEQUATE | SUFFICIENT |
| automotive | 326 | 291 | 33 | 5 | 666 | 21 | 76% | ADEQUATE | **PRIORITY_3** |
| environment | 316 | 283 | 29 | 4 | 461 | 7 | 81% | ADEQUATE | **PRIORITY_3** |
| electronics-electrical | 260 | 232 | 30 | 4 | 782 | 18 | 83% | ADEQUATE | **PRIORITY_3** |
| manufacturing | 223 | 201 | 27 | 4 | 714 | 36 | 50% | ADEQUATE | SUFFICIENT |
| agriculture-food | 187 | 169 | 23 | 4 | 419 | 46 | 52% | ADEQUATE | SUFFICIENT |
| hospitality | 177 | 165 | 22 | 5 | 237 | 35 | 44% | ADEQUATE | SUFFICIENT |
| logistics | 162 | 132 | 22 | 5 | 172 | 27 | 52% | ADEQUATE | SUFFICIENT |
| education | 152 | 133 | 24 | 5 | 316 | 41 | 36% | ADEQUATE | SUFFICIENT |
| **energy** | 147 | 137 | 25 | 4 | 283 | 17 | 65% | WEAK | **PRIORITY_2** |
| **telecom** | 106 | 94 | 17 | 4 | 489 | 0 | 76% | WEAK | **PRIORITY_2** |
| **security-defence** | 94 | 88 | 15 | 5 | 356 | 19 | 54% | WEAK | **PRIORITY_2** |
| **chemicals-materials** | 73 | 67 | 18 | 5 | 273 | 16 | 62% | WEAK | **PRIORITY_2** |
| **textiles-ppe** | 67 | 65 | 20 | 4 | 94 | 17 | 60% | WEAK | **PRIORITY_2** |

Status is derived from **breadth, not volume**: `STRONG` needs ≥400 current AND
≥100 buyers AND ≥8 countries AND ≥3 sources. One pipe is not coverage, however
many records come down it.

## The largest single gap is not a sector

**1,912 current opportunities — 27% — carry no classification at all.**

They come from four sources that publish none: **canadabuys (915), worldbank
(297), tenderned (207), za-etenders (46)**. Every one of those records is
invisible to sector analysis, to CPV/UNSPSC filtering in Discovery, and to
classification-based supplier matching.

Closing this is worth more than any new source: it would reclassify a quarter
of the current corpus into sectors that already exist.

**Root cause found and fixed in Stage B1 — see below.** The Phase A summary
said "our adapter reads none of them". That was imprecise: the adapter read the
right columns and the classification layer already supported UNSPSC and GSIN.
The loss was one line further in.

## Source contribution — unique *current* after dedup

| source | canonical | current | historical | **unique current** | dup | buyers | countries | sectors | CPV | UNSPSC |
|---|---|---|---|---|---|---|---|---|---|---|
| ted | 3,087 | 3,070 | 17 | **2,748** | 10% | 2,327 | 36 | 19 | 2,509 | 0 |
| secop2 | 1,287 | 1,287 | 0 | **1,287** | 0% | 683 | 1 | 18 | 0 | 650 |
| canadabuys | 915 | 915 | 0 | **915** | 0% | 80 | 1 | **0** | 0 | 0 |
| de-vergabe | 1,058 | 625 | 433 | **441** | 29% | 464 | 1 | 19 | 685 | 0 |
| uk-fts | 1,535 | 340 | **1,195** | **336** | 1% | 260 | 1 | 19 | 731 | 0 |
| boamp | 884 | 470 | 414 | **332** | 29% | 417 | 1 | 19 | 224 | 0 |
| worldbank | 852 | 297 | 555 | **297** | 0% | 176 | 73 | **0** | 0 | 0 |
| tenderned | 207 | 207 | 0 | **207** | 0% | 138 | 1 | **0** | 0 | 0 |
| za-etenders | 46 | 46 | 0 | **46** | 0% | 34 | 1 | 0 | 0 | 0 |
| uk-contracts-finder | 33 | 33 | 0 | **29** | 12% | 23 | 1 | 14 | 30 | 0 |

**uk-fts is 78% historical** — 1,535 records, 340 current. Judged on raw volume
it looks like the second-largest source; judged on unique current contribution
it is fifth. That is exactly the trap this metric exists to avoid.

## Geography

113 countries have current opportunities. **109 of them have exactly one
source.** 79 have coverage in one sector or none.

| country | current | buyers | sources | sectors | top source |
|---|---|---|---|---|---|
| colombia | 1,287 | 683 | 1 | 18 | 100% |
| germany | 1,158 | 722 | 2 | 19 | 62% |
| canada | 915 | 80 | 1 | **0** | 100% |
| poland | 576 | 401 | 1 | 19 | 100% |
| france | 570 | 490 | 2 | 19 | 58% |
| united-kingdom | 369 | 276 | 2 | 19 | 92% |

Outside Germany and France, essentially every country rests on one pipe. The
73 countries reached only through World Bank have **zero** sector coverage,
because that source publishes no classifications.

## Source-dependency risk

**16 of 19 sectors draw ≥50% of their current opportunities from one source.**
Five exceed 75%: electronics-electrical (83%), environment (81%), automotive
(76%), telecom (76%), healthcare (75%).

## Expansion priorities

**PRIORITY_1 — classification, not sources.** 1,912 unclassified current
records from four sources. Investigate whether CanadaBuys, TenderNed, World
Bank and eTenders expose classification fields the adapters do not read, before
adding anything new.

**PRIORITY_2 — genuinely weak sectors.** energy (147), telecom (106),
security-defence (94), chemicals-materials (73), textiles-ppe (67).

**PRIORITY_3 — adequate but fragile.** automotive, environment,
electronics-electrical: enough records, too few sources.

**Geographic.** Italy, Spain, Belgium, Romania, Czech Republic and the Nordics
appear only through TED. National portals exist for all of them and none is
ingested. The United States, Japan, Australia, India and Brazil have no
national source at all.

## Phase A gate — answered

1. **Weak sectors:** energy, telecom, security-defence, chemicals-materials,
   textiles-ppe.
2. **Weak countries:** 109 of 113 single-source; the largest economies absent
   entirely are US, Japan, Australia, India, Brazil.
3. **Weak classification:** 27% of current records unclassified; UNSPSC exists
   on one source only (secop2).
4. **Mostly duplicates:** none are duplicate-only. Highest overlap is
   de-vergabe and boamp at 29%, both against TED — expected for EU notices.
5. **Sector single-source dependence:** 16 of 19 ≥50%.
6. **Geographic single-source dependence:** 109 of 113.
7. **Missing buyer ecosystems:** utilities, transport operators, hospitals and
   universities outside the EU notice threshold — they publish below the TED
   threshold and appear only where a national portal is ingested.
8. **Source types that would close the most:** national portals for the six
   TED-only EU countries, and classification enrichment on the four sources
   that publish none.

## Phase B

**Not started.** Phase A was the gate and is now complete; the priorities above
are the input. Network egress from this environment is confirmed working
(TED, BOAMP reachable), so the research is feasible.

The corpus is untouched by this phase: `cca4f5af` before and after.


---

# Stage B1 — Existing-source classification recovery

## The defect

CanadaBuys serializes a multi-code cell as a **newline-separated list with an
asterisk on each entry**:

```
"*10191500\n*77121608"
```

The adapter split on `/[,;]\s*/` only. The whole cell therefore survived as a
single token, failed the `^\d{2,10}$` check in `normalizeCode`, and was
dropped without a word.

**778 of 921 rows — 84.5% — carry a UNSPSC code, and every one was discarded.**

Both the adapter's column names (`unspsc`, `gsin-nibs`) and the classification
layer (which already supported UNSPSC and GSIN as distinct schemes) were
correct. The bug sat between them, in the splitter, and had been there since
the original ingestion phase.

## The fix

Split on commas, semicolons **and newlines**, then strip the leading asterisk.
GSIN stays GSIN: it is Canada's own goods-and-services identifier, kept as an
opaque code with no division, and is never rewritten as UNSPSC or CPV.

## Measured recovery

| | before | after |
|---|---|---|
| CanadaBuys records classified | 0 / 915 | **816 / 915** |
| UNSPSC codes attached | 0 | 1,865 (1,082 unique) |
| GSIN codes attached | 0 | 50 (34 unique) |
| corpus UNSPSC-coded | 1,192 | **1,964** |
| corpus CPV-coded | 4,585 | 4,585 *(unchanged — no crosswalk)* |
| **unclassified current** | **1,912 (27.5%)** | **1,140 (16.4%)** |

99 CanadaBuys records remain unclassified because the source publishes no code
for them.

**822 source records were rewritten and the canonical count did not move**:
9,577 before, 9,577 after. Enrichment changed content, never identity.

# Stage B2 — Re-baseline

Identical methodology, recomputed. **The priority list materially changed** —
which is exactly why this stage is mandatory before adding any source.

| sector | A (Phase A) | B (after recovery) | delta | status | priority |
|---|---|---|---|---|---|
| construction | 1,418 | 1,562 | +144 | STRONG | SUFFICIENT |
| professional-services | 716 | 918 | +202 | STRONG | SUFFICIENT |
| healthcare | 598 | 629 | +31 | STRONG | SUFFICIENT |
| **automotive** | 326 | 422 | +96 | ADEQUATE → **STRONG** | PRIORITY_3 → SUFFICIENT |
| **office-supplies** | 360 | 417 | +57 | ADEQUATE → **STRONG** | SUFFICIENT |
| facilities | 361 | 399 | +38 | ADEQUATE | SUFFICIENT |
| it-software | 362 | 397 | +35 | ADEQUATE | SUFFICIENT |
| environment | 316 | 332 | +16 | ADEQUATE | PRIORITY_3 |
| manufacturing | 223 | 288 | +65 | ADEQUATE | SUFFICIENT |
| **electronics-electrical** | 260 | 287 | +27 | ADEQUATE | PRIORITY_3 → SUFFICIENT |
| education | 152 | 233 | +81 | ADEQUATE | SUFFICIENT |
| logistics | 162 | 221 | +59 | ADEQUATE | SUFFICIENT |
| agriculture-food | 187 | 213 | +26 | ADEQUATE | SUFFICIENT |
| hospitality | 177 | 191 | +14 | ADEQUATE | SUFFICIENT |
| **energy** | 147 | 177 | +30 | WEAK → **ADEQUATE** | PRIORITY_2 → SUFFICIENT |
| security-defence | 94 | 132 | +38 | WEAK | **PRIORITY_2** |
| **telecom** | 106 | 106 | **+0** | WEAK | **PRIORITY_2** |
| chemicals-materials | 73 | 86 | +13 | WEAK | **PRIORITY_2** |
| textiles-ppe | 67 | 74 | +7 | WEAK | **PRIORITY_2** |

**Four sectors left the priority list** without a single new source: energy,
automotive, electronics-electrical and office-supplies. They were never weak —
we simply were not reading the classifications we already had.

**Telecom is the only sector that gained nothing** (+0). Canada's UNSPSC
segment 43 maps to it-software under the existing rules, and no Canadian
records landed in telecom. Telecom is now unambiguously the clearest
remaining gap, which is the opposite of where Phase A's brief pointed.

## Re-baselined priorities for Stage B3

**PRIORITY_2:** telecom (106), security-defence (132), chemicals-materials
(86), textiles-ppe (74).
**PRIORITY_3:** environment.
**Geographic:** unchanged by B1 — classification recovery adds no country.
109 of 113 countries remain single-source.

# Stage B3 — research complete, no source activated

Candidates were probed against the B2 priorities with live requests. Full
terminal ledger: [TENDER-SOURCE-CANDIDATE-LEDGER.md](TENDER-SOURCE-CANDIDATE-LEDGER.md).

**Five qualified:** Spain (ATOM/CODICE, CPV, verified future deadlines), Italy
ANAC PPVL (JSON, same-day notices), United States SAM.gov bulk extract (no key,
refreshed daily), Brazil PNCP (17,389 open in one modality), Lithuania (HTML,
last resort).

**Rejected on evidence:** Sweden — structurally impossible, since SFS 2019:668
places notice publication in privately-run databases the state only aggregates.
Lithuania's legacy CVPP (20 months stale) and its data.gov.lt feed
(awards-only). **Deferred:** Australia's OCDS API is the best-engineered feed
probed but publishes contract notices only, so it cannot supply one open
deadline; Belgium needs a token; SAM.gov's API needs a key its bulk extract
does not.

**No adapter was written and no source activated.** Two findings change the
plan before any is:

1. **Two of the four best candidates carry no CPV or UNSPSC.** Brazil has no
   commodity code at all; the US has NAICS/PSC. Ingesting them would grow the
   corpus and the *unclassified* share simultaneously — the metric B1 just
   improved by 40%. The coverage methodology needs a way to represent native
   taxonomies honestly first. Not by crosswalk.
2. **Brazil's CC BY-ND licence is a real blocker.** NoDerivatives sits badly
   with a derived corpus, and the gov.br site footer is not a dataset licence.

## Scale at this checkpoint

corpus 10.20 MB raw / 2.06 MB gzip · Discovery index 4.60 MB raw / **0.92 MB
gzip** · 6,817 detail pages. Unchanged in kind by B1; **storage verdict
KEEP_GIT_FOR_NOW**.


---

# Stage B3A — native taxonomy architecture

The classification model was already generic: one `SCHEMES` list, one
validation point, per-scheme label lookup. **NAICS and PSC were added through
it**, not around it, with per-vocabulary format rules:

| scheme | format | top level |
|---|---|---|
| CPV | 2–10 digits, optional check digit | 2-digit division |
| UNSPSC | 2–10 digits | 2-digit segment |
| GSIN | alphanumeric, 2–10 | none asserted |
| NAICS | 2–6 digits | 2-digit sector |
| PSC | exactly 4 chars, digits or letter-led | first character |

**No crosswalk exists and a test forbids one.** NAICS 54 does not borrow the
CPV division-54 wording; PSC 7030 does not borrow UNSPSC segment 70. Only CPV
and UNSPSC are read into sectors, and that limit is declared in
`SECTOR_MAPPED_SCHEMES` rather than hidden.

## The corrected classification metric

| | current opportunities |
|---|---|
| **ANY_OFFICIAL_CLASSIFICATION** | **5,869 (84.3%)** |
| no classification at all | 1,095 (15.7%) |
| classified but not sector-mapped | 45 |

By scheme: CPV 3,861 records / 2,783 unique codes · UNSPSC 1,964 / 1,572 ·
GSIN 44 / 34.

The previously reported "1,140 unclassified (16.4%)" conflated two states: 1,095
records with no code at all and 45 carrying only GSIN. The corpus was slightly
better classified than reported.

# Stage B3B — research terminality

All researched candidates are terminal: **8 ACCEPT_CANDIDATE, 7 REJECT,
5 DEFER, 2 UNRESOLVED**. Poland (BZP), Czech Republic (VVZ) and Romania
(SICAP) all qualified as PUBLIC_STRUCTURED and are recorded in the ledger.

# Not done

No adapter written, no source activated, no A→B→C expansion matrix, Brazil
licence unresolved. The architecture that had to precede activation now exists.


---

# Stage B3C — Spain: adapter built and validated, not activated

## TLS: the research finding was wrong, in our favour

The probe reported that the Spanish chain fails validation. That was `curl`.
**Node validates it with verification ON** (`authorized: true`, no
`authorizationError`), because AC RAIZ FNMT-RCM ships in Node's bundled
Mozilla trust store. So there is **no custom CA bundle, no
`NODE_EXTRA_CA_CERTS`, and no agent override** — the adapter simply uses
default verification, which is the safest position and the one the spec most
wanted. A test asserts the adapter never touches `rejectUnauthorized`,
`checkServerIdentity` or ships certificate material.

## Platform, feed and format are three different things

- **Platform** — Plataforma de Contratación del Sector Público, operated by the
  Dirección General del Patrimonio del Estado.
- **Feed** — an ATOM syndication of that platform's notices.
- **Format** — CODICE, Spain's UBL 2 profile, embedded per entry.

The adapter records the platform id and mints nothing.

## What the feed actually contains

Of 28 live entries, by the platform's own `ContractFolderStatusCode`:

| code | meaning | count | mapped to |
|---|---|---|---|
| EV | en evaluación | 10 | CLOSED |
| **PUB** | **publicada** | **8** | **OPEN** |
| RES | resuelta | 5 | AWARDED |
| ADJ | adjudicada | 4 | AWARDED |
| ANUL | anulada | 1 | CANCELLED |

**Only 29% are open.** A "future deadline means open" rule would have imported
20 awarded, closed and cancelled procurements as live opportunities. Status is
read first and the deadline never overrides it; an unlisted code stays UNKNOWN.

## Field coverage on live data

buyer 28/28 · CPV 28/28 · deadline 27/28 · value 28/28 · reference 28/28 ·
region 26/28.

Deadlines are **date + time with no offset anywhere** — recorded as `ZONELESS`
with the source wording kept and `iso` left null. No timezone is invented.
Values keep the platform's stated `currencyID="EUR"`.

## Two parsing facts worth recording

Namespace prefixes vary *within one document*: the status arrives as
`cbc-place-ext:ContractFolderStatusCode` while its siblings are plain `cbc:`.
The reader matches on **local name** and ignores prefixes.

The `next` link is followed only when it stays on the platform's own host over
https, so a feed cannot redirect ingestion at an arbitrary server.

## The window is the blocker — measured, not assumed

Walking four pages settled it:

| page | entries | `updated` range |
|---|---|---|
| 1 | 182 | 2026-08-10 14:51 → 19:34 |
| 2 | 499 | 13:01 → 14:50 |
| 3 | 498 | 11:12 → 13:01 |
| 4 | 498 | 09:34 → 11:12 |

1,677 distinct entries covering **ten hours of one day**, ordered by `updated`
descending. This is a **`DELTA_FEED`** — a chronological update stream — not a
list of open opportunities. A tender published last month and still accepting
bids appears only if it was recently updated.

Two consequences:

1. **Traversing to the end would not yield the currently open Spanish
   tenders.** Feed completeness and current-opportunity completeness are
   different facts, and only the first is reachable here.
2. **Absence proves nothing**, so Spain must never feed disappearance
   detection — a tender missing from today's window would become a false
   closure. A test asserts the health layer refuses a partial-window source for
   removal detection.

**Spain is therefore NOT activated.** Activation needs either a bounded-window
ingest design with disappearance suppression, or a different official endpoint
that is genuinely a current-opportunity view.

Two further corrections from this pass: the platform **already existed** in the
registry as `es-plataforma-de-contratacion` (PLACSP), so it is reused and the
adapter's own constant was wrong; and a sixth status code, **`PRE`**
(anuncio previo), was observed live and is deliberately left out of the status
map so it resolves to UNKNOWN rather than being promoted to UPCOMING on our
authority.


---

# Spain: terminally deferred, and why the next source is the US

A bounded search of both official PLACSP syndication feeds settled it. The
second feed, `PlataformasAgregadasSinMenores`, is **also a chronological delta
stream** — 274 entries across ~13 hours, ordered by `updated`, with a dated
continuation file. The guessed "EnPlazo" endpoint does not exist, and the
syndication index returns 403.

**No official PLACSP endpoint enumerates the currently open universe**, so
Spain is deferred with the reason
`CURRENT_UNIVERSE_NOT_ENUMERABLE_FROM_QUALIFIED_OFFICIAL_SOURCE`. The validated
adapter stays in the tree as evidence and as the basis for later change
observation; it is not a current-corpus bootstrap.

The contrast is the whole point. SAM.gov's bulk extract is a **251 MB full
daily file with an explicit `Active` column**, refreshed the morning of the
probe. A complete file that states its own current-state flag is a snapshot by
construction, which is precisely what a chronological feed can never be. That
is why the US is next and Spain is not.


---

# US SAM.gov bulk — whole-file audit (2026-08-13). NOT ACTIVATED.

Platform already exists in the registry as **`us-sam-gov`** — reused, none minted.

## The complete file, not a head sample

`ContractOpportunitiesFullCSV.csv` downloaded in full: **251,608,326 bytes,
exactly matching the declared `content-length`**, `ETag
"43d5577fff489cd40549b44d39503f79-30"`, `Last-Modified` 2026-08-13 03:30 GMT,
SHA-256 captured. Parsed with a streaming RFC 4180 reader (quoted commas,
quoted newlines, escaped quotes) — **82,960 rows, 82,960 distinct `NoticeId`,
zero duplicates**.

The raw file lives in a scratch directory outside the repository and is not
committed.

## `Active` is worthless as a current-state flag

**Every one of the 82,960 rows is `Active=Yes`.** The column is constant and
carries no information. Worse:

- all **12,645 Award Notices** are `Active=Yes`
- **10,183** rows are `Active=Yes` with an `ArchiveDate` already in the past

The previous session's plan was to "prove `Active` is authoritative across the
whole file". It is not authoritative — it is constant. Trusting it would have
imported 82,960 records, awards included, as open tenders. `Active` in SAM's
sense means "not yet archived", not "open".

Actionability therefore comes from `Type` plus `ResponseDeadLine`.

## Notice types, whole file

| Type | rows |
|---|---|
| Combined Synopsis/Solicitation | 25,155 |
| Solicitation | 23,749 |
| Award Notice | 12,645 |
| Presolicitation | 7,938 |
| Special Notice | 6,071 |
| Sources Sought | 5,900 |
| Justification | 750 |
| Modification/Amendment/Cancel | 648 |
| Justification and Approval (J&A) | 81 |
| Sale of Surplus Property | 14 |
| Consolidate/(Substantially) Bundle | 9 |

## The actionable set

Solicitation + Combined Synopsis/Solicitation = 48,904 tender-type rows, of
which:

- **12,894 have a future deadline — the actionable current set**
- 35,780 have a deadline already passed
- 230 have no deadline

Presolicitation adds **1,663** with a future deadline as UPCOMING candidates.

Of the 12,894 actionable records: **39 agencies · 585 unique NAICS codes across
23 two-digit sectors · 977 unique PSC codes · zero records with neither**.
Deadlines: 9,710 carry an offset, 3,109 are date-only, 75 have a time with no
offset — so precision must be preserved per record, not assumed uniform.

## Why this is not activated

The qualification evidence is strong and there is **no hard blocker**. What is
missing is the work itself: adapter, canonical ingest, cross-source overlap,
UNIQUE CURRENT after dedup, health integration, six failure proofs, durable
last-good, fresh-clone recovery, and the C1 re-baseline.

---

# C1 — SAM.gov ACTIVE

**SAM_UNIQUE_CURRENT = 10,511.** Source #1 of Expansion v2 B3 is active and
contributing to the published corpus.

## A → B → C1

| | A (Phase A) | B (post-B1/B2) | C1 (SAM active) |
|---|---|---|---|
| canonical opportunities | 9,572 | 9,577 | **20,088** |
| current opportunities | 6,964 | 6,964 | **17,475** |
| sources | 10 | 10 | **11** |
| buyers (all) | — | 5,324 | **6,314** |
| buyers (current) | — | 5,324 | **5,161** |
| countries (current) | — | 72 | **73** |
| geography rows | — | ~150 | **200** |
| records with an official classification | — | 5,869 | **16,380** |
| Discovery index, raw | — | 4,823,339 B | **8,970,862 B** |
| Discovery index, gzip | — | 982,396 B | **1,806,721 B** |
| Detail pages published | — | 6,817 | **16,526** |

Corpus growth is **+10,511 canonical, all of it unique and all of it current**.
Nothing was displaced: every pre-existing source contributes exactly what it
contributed before.

## Where SAM sits against the other ten

Unique current contribution after canonical dedup:

```
sam-gov      10,511      ted     2,748      secop2     1,287
canadabuys      915      de-vergabe 441     uk-fts       336
boamp           332      worldbank  297     tenderned    207
za-etenders      46      uk-contracts-finder 29
```

SAM contributes **3.8× the whole previous corpus's current opportunities**.
Cross-source overlap is **zero**, which is the expected result rather than a
pleasant one: no other registered source publishes US federal procurement, so
there was nothing for it to duplicate. The dedup graph confirmed it rather than
assumed it.

## What SAM is

One 251,608,326-byte CSV, republished daily by GSA for data.gov, fetched with
no key and nothing bypassed. 82,960 rows → 56,842 carried (tender and
presolicitation types only) → **14,761 current opportunities** → **10,511
canonical after same-source dedup**.

The v1 registry recorded SAM as `LOGIN_REQUIRED` on the evidence of
`/opportunities/v2/search` returning empty without a key. That was true of the
endpoint and false of the platform, and it kept this source closed for two
phases. The finding is now recorded against the endpoint it was about.

## The four defects this activation fixed

**1. `Sol#`, not `SolicitationNumber`.** Read from the header. The
projected-column guard had been refusing the whole schema rather than carrying
a silent null, which is the guard working.

**2. Zoneless deadlines are comparable.** A deadline with no offset names a
26-hour BAND on the timeline — UTC+14 to UTC-12 — not a point. Outside that
band every zone on Earth agrees on whether it has passed; inside it the answer
stays `null`. No offset is invented, `iso` stays null, and the deadline is
still displayed exactly as the source printed it. This recovered 9,428 date-only
SAM deadlines and is a **general** fix: CanadaBuys, SECOP II and TenderNed
publish zoneless deadlines and were losing the same records.

**3. The file is Windows-1252, not UTF-8.** Measured across the whole artefact:
104,047 bytes cannot be UTF-8 against 1,846 that can, and the invalid ones are
the cp1252 punctuation block — en dash 22,487, curly quotes 33,726, bullet
8,498, ellipsis 6,888. Decoding as UTF-8 replaced **103,907 characters** with
U+FFFD and nothing failed, because `PATRIOT SPARES <?> LOCKHEED MARTIN` is
still legible. That is the whole danger: silent corruption of exactly the field
a human reads.

The guard now inspects the BYTES before they become text, because the symmetric
failure — SAM switching to UTF-8 — would produce `â€"` mojibake with no
replacement character anywhere for a downstream check to find.

**4. A merge group published an arbitrary deadline.** SAM publishes amendments
as new notice ids, so one procurement arrives as several records that dedup
correctly merges. The collapse then chose between their fields by
**lexicographic notice id**. 337 real merge groups carried the wrong deadline:
**267 earlier** than the buyer's actual date — hiding a still-open tender, one
advertised as closing 2026-08-17 when it had been extended to 2026-09-03 — and
**64 later**, telling a supplier to prepare a bid for a shut procedure.

Recency now breaks the tie, using the source's modification stamp or its
publication date. That took 337 down to 60, and all 60 are groups whose notices
were posted on the same day; SAM publishes no clock time on `PostedDate`, so
nothing in the data orders them. They stay deterministic and arbitrary rather
than guessed, and every version remains in `occurrences`.

## Deduplication and the modification chain

14,761 source records → 10,511 canonical. **4,250 records merged into 2,376
groups**, every one of them a same-source amendment chain: shared solicitation
number, shared contracting office, title similarity ≥ 0.85. No cross-source
merge occurred and none was expected.

The existing rules were used unchanged. A shared `Sol#` alone never merges —
that matters here, because one solicitation number, `47QSMD20R0001`, is borne
by **6,919 notices** across the file. It is a government-wide acquisition
vehicle, not a procedure reference. 13,026 solicitation numbers are shared by
more than one notice.

`Modification/Amendment/Cancel` notices (648) are excluded by type, so an
administrative change can never appear as a second live tender.

The deduplication block cap now **reports what it did not compare**. Seven
blocks exceeded it, holding 5,750 records, the largest being one contracting
office with 2,440 current notices. Only same-source title resemblance was
skipped, and that can never merge anything on its own — reference blocks are
separate and were all compared — but a bounded search that says "no duplicates"
without saying what it skipped reads as an exhaustive one.

## Native US taxonomy — NOT mapped into the 19 sectors

10,511 current US records, **every one carrying at least one official
classification**: 10,217 with NAICS, 7,382 with PSC, **598 distinct NAICS codes
across 23 two-digit sectors** and **965 distinct PSC codes across 33 groups**.

These are `ANY_OFFICIAL_CLASSIFICATION = YES` and `NOT_SECTOR_MAPPED = YES`
simultaneously, and that is the correct answer. The 19-sector matrix reads CPV
and UNSPSC only, and **it was not widened to make SAM appear in sector totals**
— inventing a NAICS→CPV crosswalk would manufacture equivalences that no
standards body publishes. The `not-sector-mapped` row grew to 10,559 current
records, which is a truthful statement about our analytical mapping and not a
statement about American procurement being unclassified.

Largest NAICS sectors: 33 (manufacturing, 6,131), 23 (construction, 1,430),
54 (professional/scientific/technical, 625), 56 (administrative support, 441),
81 (other services, 286). Largest PSC groups: 5 (weapons/ammunition and
subsistence, 845), 6 (chemicals and lab equipment, 818), Z (maintenance and
repair of real property, 775), J (maintenance and repair of equipment, 604).

## Geography

`projectCountry` resolves to the corpus's own country vocabulary. Emitting the
raw ISO alpha-3 put a country called **`jpn`** into the coverage geography
matrix beside `united-states` and `germany`, because that layer reads
`projectCountry || country`. All 103 codes present in the file are transcribed;
anything unresolved — including `AX1`, which is not an ISO code — yields null,
so the record keeps its US country and makes no claim about where the work
happens. 18 codes name countries this site's collection does not cover and
correctly resolve to null rather than being deleted from the table.

584 current records name a non-US place of performance. Japan is now the 12th
largest geography in the corpus at 146 current records.

## Operational state

**ACTIVE**, run status HEALTHY, durable state written. Registered STAGED first —
`enabled: false`, enforced in `rebuildCorpus` rather than merely documented —
and activated only once every gate was green.

Fifteen failure proofs pass, each driving the real ingestion path:

| failure | outcome |
|---|---|
| transport error / 403 | last-good retained, failure classified |
| truncated download | refused against the server's declared `Content-Length` |
| truncated at a row boundary | collapse guard refuses; last-good retained |
| empty but successful response | refused |
| schema change (renamed column) | fails closed, `SCHEMA_CHANGED` |
| parser corruption / mass row loss | refused above a 1% short-row ratio |
| records missing identity | refused as a set |
| native classification loss | content hash moves; coverage measurable |
| encoding switch to UTF-8 | refused on byte evidence |
| fresh clone | recovers 14,761 occurrences from the committed corpus |
| failure after fresh-clone recovery | recovered data retained |

**Durable last-good is the committed corpus**, not the gitignored snapshot.
A fresh clone reconstructs 14,761 SAM source records from occurrence provenance
and re-deduplicates them to exactly the 10,511 canonical opportunities the
corpus publishes — verified, not asserted. ACTIVE never depends on the local
251 MB file, which is not committed and is not read by any build script.

## Scale and the storage verdict

Search stays fast: **hydration 72 ms, JSON.parse 17 ms, mean query 17.7 ms,
worst 26.9 ms** across ten representative queries at 17,475 records. The
~25,000-record figure from Discovery v1 was an estimate, and measurement does
not support it as a limit on CPU.

**The cost is transfer, not compute.** The browser index went from 982 KB to
**1.81 MB gzip**. That is the real finding of this phase's scale work, and it
is the constraint the next source runs into first — not the corpus, not the
build, not search latency.

Repository: working tree 522 MB, of which 308 MB is the detail-page tree
(16,526 pages). Git is far smaller than that suggests — the packed repository is
**56 MB**, because these pages share almost all of their structure and delta
well. Corpus 10.7 MB → **18.2 MB**.

**Verdict: sustainable for one more source of this size, not for several.** The
1.81 MB index is the binding constraint. Before a source of comparable volume is
added, the Discovery index needs a size strategy — a narrower record projection,
a split index, or server-side search. That is a Discovery decision and it should
not be made by quietly changing what Search does to accommodate new data.
