# Tender Opportunity Intelligence — Phase 4

Platform gap closure. The phase asked one question:

> Which high-value opportunity sources are already technically reachable but
> blocked because the platform identity layer is incomplete?

Phase 3 named one: Germany. Phase 4 resolved it — and the resolution turned on
an ontological question, not a technical one.

---

## The Germany investigation

Phase 3 built and verified an adapter for `oeffentlichevergabe.de` against
1,153 real releases, then **refused to activate it** because no canonical
`TenderPlatform` record existed. The tempting Phase 4 move was to create the
record and move on. Part 4 forbade exactly that, and it was right to.

### What the service actually is

Evidence, in order of authority:

1. **Its own machine-readable self-declaration.** Every OCDS package it emits
   carries `publisher: {"name": "Bekanntmachungsservice"}`, a
   `publicationPolicy` URL, and `license: opendefinition.org/licenses/cc-zero/`.
2. **The operator.** The Beschaffungsamt des BMI, which built it as part of the
   *Datenservice Öffentlicher Einkauf*.
3. **What it aggregates.** EU-wide notices, national notices from the federal
   procurement platform (e-Vergabe), Bremen, and `service.bund.de`.
4. **How suppliers use it.** Reachable **without registration**. It is where
   notices are found, not where bids are filed.

So it is a **notice publication and discovery service**, not a bidding
platform. Under Part 7's taxonomy it sits between C (official open-data mirror)
and E (aggregator over several platforms).

### Why that still qualifies as a platform

The decisive test was not "is it a bidding system?" — it was "does this
collection already model notice services as platforms?" It does, twice:

| Record | What it is | `electronicSubmission` | `submissionUrl` |
|---|---|---|---|
| `eu-ted` | the OJEU supplement — search only, no bidding | `no` | `null` |
| `de-had` | a Hessian tender **database** | `unknown` | `null` |
| **`de-bekanntmachungsservice`** | the German federal notice service | `no` | `null` |

TED is the exact precedent: an EU-level notice publication service where
suppliers search and never submit, carried as a platform since Wave T1. A
national equivalent operated by a federal purchasing office is the same class
of entity.

Had the answer gone the other way — had it been a bare open-data endpoint with
no discovery function — the correct outcome would have been to leave the
adapter deferred permanently, and this document would say so.

### The record

`de-bekanntmachungsservice`, evidence class **A**, from the service's own
machine-readable declaration. Its `limitations` say plainly that it is a
discovery surface and that bidding happens on the issuing platform — e-Vergabe
or the relevant Land portal, **each of which was already a separate canonical
record and remains one**. The notice service did not absorb them.

One honest gap is recorded: the web interface is a JavaScript application whose
paths all return HTTP 200 with the same shell, so no individual search route
could be independently distinguished. `browserCheckRequired: true`, and the
machine-readable export was verified directly instead.

**Reuse also upgraded**: Phase 3 classified the source `LIKELY_PERMITTED` on
the absence of a restrictive licence. The API in fact declares **CC0** in every
response — a public domain dedication — so it is now `PERMITTED` on evidence.

---

## Germany ROI — was the one-platform-gap thesis worth it?

| Measure | Value |
|---|---|
| Records ingested | 1,058 (3-day window, complete) |
| Canonical contribution | 874 |
| Current / open | 625 |
| **Germany-only notices** | **874 of 1,058 (83%)** |
| Merged with TED | 184 |
| Distinct buyers | 718 |
| Classified (CPV) | 1,032 of 1,058 |
| Multi-lot procedures | 151 (largest: **102 lots**) |
| Rejected at validation | 8 |

**83% of German notices exist nowhere else in the corpus.** That is the thesis
confirmed: a national notice service carries below-threshold and national-only
procurement that never reaches the Official Journal. Had the number been near
zero, Germany would have been an expensive TED mirror and the platform work
would not have been worth it.

The 184 TED merges are all buyer-matched with TED's machine-generated title
prefix stripped — the Phase 2 mechanism working on a third source pair without
modification.

Lot safety held under real pressure: a 102-lot German procedure is **one**
opportunity with `lotCount: 102`, not 102 opportunities.

---

## Platform drift — fully accounted

| Record | Change | Evidence | Unlocks |
|---|---|---|---|
| `de-bekanntmachungsservice` | **ADD** | A — service's own OCDS publisher/licence declaration + 1,153 verified releases | the German opportunity source |

**383 → 384 records.** One addition, one reason. No other platform record was
touched; the canonical fingerprint for the other 383 is unchanged.

A test asserts the count *and* the added record's evidence class, evidence URL,
non-token evidence note, and its structural equivalence to TED — so a future
weak record cannot slip in behind this precedent.

---

## Corpus impact

| | Phase 3 | Phase 4 |
|---|---|---|
| Active sources | 9 | **10** |
| Canonical opportunities | 8,682 | **9,572** |
| Current / open | 6,518 | **6,959** |
| Buyers | 4,851 | **5,320** |
| Classified | 4,926 | **5,777** |
| Cross-source merges | 143 | **327** |

Cross-source pairs: `boamp+ted` 139 · `de-vergabe+ted` 184 · `uk-contracts-finder+uk-fts` 4.

Match impact (STRONG / GOOD): telecom 18/203 · SaaS 78/307 · manufacturer
145/555 · construction **235/874** · logistics 15/284. Construction gained most,
which is what a German corpus should do. **No scoring rule changed** — the
weights are asserted frozen by mutation.

---

## Fail-closed, demonstrated without being asked

The full refresh at the end of this phase had two sources fail on their own:

```
Refreshed 8/10 source(s).
  ✗ za-etenders:         TRANSPORT    — previous snapshot retained (43 records), DEGRADED
  ✗ uk-contracts-finder: RATE_LIMITED — previous snapshot retained (33 records), RATE_LIMITED
```

Eight sources promoted, two retained their last-good data, corpus rebuilt from
all ten valid states, run reported honestly. That was production behaviour, not
a fixture — and `RATE_LIMITED` was classified correctly rather than as a
generic failure.

---

## Storage — re-measured, decision unchanged

| Measure | Phase 3 | Phase 4 |
|---|---|---|
| Bytes / canonical record | 1,134 | **1,114** |
| Corpus | 9.4 MB | **10.2 MB** |
| Gzipped | 1.9 MB | **2.05 MB** |
| Mean records / source | 868 | 1,064 |
| 25-source projection | ~24 MB | **~28 MB** |
| 50-source projection | ~49 MB | **~57 MB** |

Per-record cost fell again as sources were added. **KEEP_GIT_FOR_NOW** stands:
acceptable to ~25 sources, not to 50.

What will force migration remains **concurrent writes**, not size — and that
arrives with scheduling, not with the byte count.

---

## Next bottleneck

Not platform gaps. The Phase 4 inventory found exactly one adapter-ready source
blocked by platform identity, and it is now closed. Nothing else in the
registry is waiting on a platform record.

Not storage. Two phases of measurement say Git holds to ~25 sources and the
corpus is at 10.

The dominant bottleneck is now **operational**: ten sources, two of which
failed on the last run, refreshed by hand. Manual refresh was reasonable at
five sources; at ten, with real failures happening unprompted, it is the thing
most likely to make the data quietly stale.

**Recommendation: Phase 5 = production scheduling + durable refresh state**
(decision A). The orchestrator is already schedule-ready; what it needs is a
safe promotion path — scheduled job → refresh branch → validation → controlled
promotion — so that automatic commits never collide with human work on a 10 MB
file. That design decision is exactly what Phase 3 deferred and Phase 4's
failure rate now makes urgent.

Tender Alerts (option C) is attractive but premature: alerting on a corpus
refreshed by hand would promise a freshness the pipeline does not yet keep.
