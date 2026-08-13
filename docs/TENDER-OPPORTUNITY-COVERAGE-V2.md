# Tender Opportunity Coverage — Phase A

**Status: PHASE A COMPLETE. PHASE B NOT STARTED.**

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

**Verified by probe (2026-08-13).** CanadaBuys' open-data export *does* publish
classification — the payload carries `unspsc`, `unspscDescription`, `gsin` and
`gsinDescription`. **Our adapter reads none of them.** So 915 current Canadian
opportunities, 13% of the whole current corpus, are unclassified because of a
reader gap, not a source gap. This is the single highest-value action available
and it requires no new source.

TenderNed's list endpoint returns no CPV in its summary payload; whether the
per-notice detail record carries one is unresolved and worth one more probe.

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
