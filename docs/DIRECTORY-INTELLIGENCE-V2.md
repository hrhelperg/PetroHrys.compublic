# Directory Intelligence v2

**Version 2.0 · 2026-08-07**

## 1. What changed, and why

Version 1 answered *"where can I publish my company?"* — 1,563 actionable
platforms, each with enough operational detail to submit to.

Version 2 answers *"is this platform worth it for **this** business, and why?"*

Nothing was researched to build it. The registry already carried most of what a
buying decision needs; what it lacked was ten attributes and a way to read them
together.

## 2. The three evidence classes

Every attribute belongs to exactly one, and the class is declared in code
(`EVIDENCE_CLASS`), not just in prose. A guard fails if an attribute has none.

| Class | Source | Example |
|---|---|---|
| **A — Verified** | The operator states it in writing | `hasApi`, `bulkSubmission`, `approvalMode` |
| **B — Observable** | Established from public behaviour | `profileIndexed`, `profileUrlPattern` |
| **C — Editorial** | Computed by documented rule | Directory Score and its six dimensions |

There is no fourth class for "seems likely". Missing evidence is `null`.

## 3. Reuse before adding

The single most consequential design decision: **the intelligence layer restates
nothing the registry already holds.** Two sources of truth for one fact drift,
and the drift is silent.

| The brief asked for | Already in the registry as |
|---|---|
| Business Fit (B2B, SaaS, AI, Agency, Local, Enterprise…) | `accepts` — twelve tri-state flags |
| Follow / NoFollow / Mixed | `backlinkType` |
| Email / Phone / Business verification | `verificationMethods` |
| Free / Paid / Freemium | `submissionModel` |
| Countries accepted, Local vs Global | `audienceGeography` |
| Manual approval, difficulty | `submissionDifficulty`, `manualReview` |
| Spam level, moderation | `listingQuality`, `spamResistance` (score factor) |

A test asserts that no `intelligence` key collides with an existing record key
or an `accepts` key.

### The ten attributes that are genuinely new

**Class A — verified from documentation**

| Attribute | Type | Meaning |
|---|---|---|
| `hasApi` | bool \| null | A documented submission or listing API exists |
| `bulkSubmission` | bool \| null | Many listings can be submitted at once |
| `multipleLocations` | bool \| null | One account can hold several locations |
| `franchiseSupport` | bool \| null | Franchise or multi-brand structures are supported |
| `languages` | ISO 639-1[] \| null | Languages a listing can be published in |
| `countryReach` | `global` \| `regional` \| `single` | How far a listing travels |
| `approvalMode` | `instant` \| `manual` \| `mixed` | What happens after submit |

**Class B — observable from the live site**

| Attribute | Type | Meaning |
|---|---|---|
| `profileIndexed` | bool \| null | Profile pages are indexable and indexed |
| `profileUrlPattern` | https string \| null | The shape of a public profile URL |
| `ranksByCompanyName` | bool \| null | A profile can rank for the company's own name |

`languages` must be sorted and deduplicated — an unsorted array would make the
render non-deterministic. `profileUrlPattern` must be https, so it can be
checked against a live profile rather than believed.

## 4. The Directory Score

Six dimensions, each 0–100, each a documented function of stated inputs. Weights
total exactly 100, and a require-time check throws if that ever stops being true.

| Dimension | Weight | Reads | Cannot see |
|---|---|---|---|
| SEO value | 30 | `backlinkType`, `profileIndexed`, `ranksByCompanyName` | Actual ranking positions |
| Trust | 20 | `verificationMethods`, `listingQuality` | Whether verification is enforced |
| Referral potential | 20 | `profileIndexed`, `countryReach`, `tier` | Traffic — no estimate is used anywhere |
| Stability | 15 | `currentStatus`, `tier` | The operator's finances |
| Ease of approval | 10 | `approvalMode`, `submissionModel`, `submissionDifficulty` | Queue length in practice |
| Business breadth | 5 | `accepts`, practical flags | Whether the accepted type is served *well* |

### Three properties the score must have

**It is computed, never stored.** A stored score can disagree with its inputs the
moment one changes, and every scoring change would rewrite the dataset. A guard
fails if any record carries `directoryScore`, `scoreBand` or `seoValue` on disk.

**Missing evidence yields `null`, never a midpoint.** A platform nobody assessed
must not score like one assessed and found average.

**It refuses to score on thin evidence.** A score needs **≥ 4 of 6 dimensions**
*and* **≥ 60 of 100 weight**. Both floors are checked, and each has its own test
case — a record can clear one while failing the other, so a single example proves
only whichever threshold bites first.

The overall score renormalises over the weight actually present, so a missing
dimension does not drag the total toward zero.

### Bands

`strong` ≥ 80 · `good` ≥ 60 · `moderate` ≥ 40 · `limited` < 40. Deliberately
coarse: the number is not precise to the point, and the band should not pretend
it is.

### A resolution requirement, learned the hard way

The first implementation averaged three SEO components, two of which were
booleans mapped to 0 or 100. Every platform that was indexed *and* ranked for its
name therefore scored exactly **100**, and eighteen very different platforms all
came out "strong". A dimension that cannot separate its inputs is decoration.

The fix weights the components and caps each below 100 on its own — being indexed
tops out at 70, name-ranking at 85, and only a dofollow link on an indexed,
name-ranking profile approaches 100. `the score discriminates` now asserts that
link types produce strictly ordered, distinct values:

| Link type (indexed + name-ranking) | SEO value |
|---|---|
| dofollow | 89 |
| mixed | 67 |
| nofollow | 48 |
| none | 34 |
| unknown link type | 75 |
| indexed only | 70 |
| not indexed | 0 |
| nothing established | `null` |

## 5. This is not the PetroHrys Score

They coexist and must never merge.

| | PetroHrys Score | Directory Score |
|---|---|---|
| Nature | Editorial opinion | Computed function |
| Inputs | Ten factors judged 0–10 by a human | Facts already on the record |
| Rubric | None — its own note says two reviewers could differ | Fully documented above |
| Stored? | Yes, with its factors | No, ever |
| Coverage | Editorial records only | Any record with enough evidence |

## 6. Migration impact

**Zero records rewritten.** `intelligence` normalises to `null` when absent, and
the on-disk projection drops it again on write. Adding the layer changed no
existing byte; populating 18 platforms changed only those 18 files.

Round-trip is asserted: migrating the projection of a populated record reproduces
the same normalised record.

## 7. What is populated

18 representative platforms, chosen to exercise every attribute and every
dimension — Google Business Profile, Yelp, BBB, Trustpilot, G2, Capterra,
Crunchbase, Clutch, Product Hunt, HubSpot Marketplace, Europages, Alibaba,
IndiaMART, Kompass, Thomasnet, Microsoft Partner, AWS Partner, SAP Partner.

**49 rows carry a Directory Score**, not 18. The other 31 reach the evidence
floor from fields the registry already had — which is the reuse design working as
intended.

Class B values were verified by probe: a `profileUrlPattern` is recorded only
where the platform's own router accepted the path. Where a guessed pattern
returned 404 — Europages, IndiaMART company pages, Alibaba company search — the
field is `null` rather than carrying a shape nobody confirmed.

## 8. Published surfaces

**CSV** gains five columns: `directory_score`, `seo_value`, `approval_mode`,
`country_reach`, `has_api`. All computed at render time. A test re-derives every
score from the module and compares, over the whole export.

**Working list** gains three filters: Directory Score band, Approval, Country
reach. Platforms with too little evidence show as *Not yet scored* rather than
being hidden or guessed at. A test asserts every value a filter offers exists on
a row — a filter that yields an empty table reads as a broken page.

No new page types, no new generators, no redesign.

## 9. Future enrichment roadmap

In priority order, by value per unit of work:

1. **Clear the browser queue** — 459 rows sit at `currentStatus: unknown` behind
   bot filters. A person with a browser resolves each in seconds, and it feeds
   the Stability dimension directly.
2. **`listingAction` and `submissionModel`** — mostly empty because automated
   probing cannot establish them. Both feed Ease of approval.
3. **`backlinkType`** — the heaviest SEO input, and observable: open a profile,
   inspect the outbound link's `rel`. Currently the largest single gap.
4. **`accepts` on operational rows** — the flags exist on editorial records only,
   so Business breadth scores for a minority.
5. **Then, and only then, new fields** — moderation speed, B2B/B2C split,
   follow/nofollow per tier. Each needs a schema change and should be scoped
   deliberately rather than added mid-wave.

## 10. Limitations

- The score reflects **evidence recorded**, not platform quality. A well-covered
  mediocre platform can outscore a barely-covered excellent one. `dimensionsPresent`
  and the coverage helper exist so a reader can see how much is behind a number.
- No traffic estimate is used anywhere, by design. No Domain Rating feeds the
  score either: most rows have none, and reading absence as weakness would score
  an unmeasured platform below a measured one for no reason.
- Weights are an editorial judgement about what matters. They are documented and
  fixed, so the score is reproducible — but reproducible is not the same as
  objectively correct, and the weights should be revisited as the queue clears.
