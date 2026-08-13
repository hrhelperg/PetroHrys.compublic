# Tender Discovery Relevance v1.1 — duplicate suppression & result diversity

**Status: COMPLETE.** A presentation layer over
[Discovery & Search v1](TENDER-DISCOVERY-SEARCH-V1.md). It changes the order
results appear in and groups some of them visually. It changes no canonical
fact, merges no opportunity, and removes none.

---

## The problem, as measured rather than assumed

Discovery v1's audit noted ~26 near-identical Defence Construction Canada
notices dominating the construction cohort. Before designing anything, that was
re-measured across **120 real queries** drawn from the corpus.

**Only 9 of 120 (7.5%)** had four or more of their top ten from one buyer. And
every one of them was a query word that appears in a **buyer's name**:

| query | dominant buyer | top-10 share |
|---|---|---|
| `desarrollo` | FONDO DE DESARROLLO LOCAL DE SANTA FE | 9/10 |
| `construction` | Defence Construction Canada | 8/10 |
| `office` | Post Office Limited | 8/10 |
| `work` | Department of Public Works | 6/10 |

Buyer name is worth 8 points and it is a **per-buyer constant**: every notice
that buyer published receives it at the same instant. A buyer with 78 open
notices produces 78 records with identical scores, and the old tie-break —
deadline, then id — listed them consecutively.

**The concentration therefore lives entirely inside exact score ties.** That
single fact is what makes the fix safe.

Telecom, software, manufacturing, the default view and every filtered cohort
already showed 8–10 distinct buyers in the top ten. Most of Discovery did not
have this problem.

## Two mechanisms, because there are two problems

Inspecting the cohorts showed the dominant cases are **not the same shape**:

- **`construction` / DCC** — "Open Construction Source List for CFB Wainwright
  / 17 Wing Winnipeg / 4 Wing Cold Lake…". A template repeated across bases.
- **`desarrollo` / FONDO** — motorcycles, food, an elevator certificate, a
  defibrillator, a datalogger, advertising. Same buyer, entirely different
  procurements.

Grouping the second would be a lie. Spreading is what it needs.

### Retrieval families (high precision)

Two opportunities are one family only when **all** hold:

- identical buyer string **and** identical source (the blocking key);
- same buyer country;
- identical explicit lot signature;
- same classification scheme;
- normalized title Jaccard ≥ **0.75**;
- Jaccard of **distinctive** tokens ≥ **0.6**.

Result: **104 families, 235 members** of 6,964 records — 3.4%. Precision was
chosen over recall throughout.

**Buyer strings are never fuzzy-merged.** "Defence Construction Canada -
Western Region" and "- Pacific Region" stay separate, because nothing in the
canonical model says they are one legal entity.

### Result diversity

Reordering happens **only within runs of identical relevance score**. Two
records are swapped only when the relevance engine gave them the same number,
so nothing less relevant can ever be promoted — not by policy, but by
construction.

## Three defects found while building this

1. **Boilerplate carried families.** FONDO's shared preamble — "COTIZAR LA
   ADQUISICION DE … PARA EL FONDO DE DESARROLLO LOCAL DE SANTA FE" — dominated
   the token set and grouped a **defibrillator with a datalogger**. Fixed with
   per-buyer boilerplate detection: a token in ≥50% of one buyer's own titles
   carries no information about which procurement this is, and similarity must
   also hold on what remains.

2. **Union-find chained rejected pairs.** A and B were compared and refused,
   then joined anyway through C. Replaced with **star clustering**: every
   member must match the seed directly, so "related to this one" is literally
   true of every member.

3. **A quoted phrase never reached the intent check.** `hasBuyerIntent`
   returned early on empty `terms`, and a quoted query has none — so
   `"roof works"` was diversified despite being exact intent.

## Two design corrections the measurements forced

**The first intent rule was too aggressive.** "Are all query terms somewhere in
this buyer's name" made `construction` read as intent to search Defence
Construction Canada, switching diversity off for the one cohort that needed it.
Intent now requires the query to **cover** a buyer's name: ≥2 terms and ≥50% of
that buyer's name tokens. `construction` covers 1 of 5 → not intent;
`Defence Construction Canada` covers 3 of 5 → intent.

**The metric improved while the page did not.** Spreading on buyer alone took
construction from 3 to 5 distinct buyers in the top ten — but DCC's regional
entities are different buyer strings, so a reader still saw one organisation's
template ten times. Spreading on the title template instead improved the top
ten and made the top twenty-five worse. Neither key alone describes repetition.

So spreading is a **greedy selection scored against every dimension at once** —
family, buyer and title template — over a recent window of six. Ties break on
the original rank, so absent repetition the order is unchanged.

A loose signal is acceptable for diversity in a way it never is for grouping:
grouping makes a claim about two procurements, while diversity only reorders
results already scored identically. Being wrong costs a swap between equals.

## Activation

| State | Diversity | Why |
|---|---|---|
| `sort=relevance` with a query | **on** | the only ranking it can affect |
| `sort=deadline` / `published` / `value` | off | an explicit instruction about order |
| no query | off | everything ties at 0; spreading moved records up to **6,543** places and destroyed the deadline ordering the default view exists to show |
| query names a buyer | off | the reader asked for that buyer |
| quoted phrase | off | exact intent |
| source filter set | off | the reader constrained the source |

## Results

| cohort | buyers@10 | top buyer@10 | buyers@25 | top1@25 | top3@25 |
|---|---|---|---|---|---|
| construction | 3 → **6** | 80% → **30%** | 5 → **6** | 36% → **28%** | 76% → **64%** |
| telecom | 10 → 10 | 10% → 10% | 22 → **23** | 12% → **8%** | 24% → **20%** |
| software | 10 → 10 | — | 24 → 24 | 8% → 8% | 16% → 16% |
| manufacturing | 10 → 10 | — | 24 → **25** | 8% → **4%** | 16% → **12%** |
| default / profile-only | unchanged | — | unchanged | — | — |
| buyer-name queries | unchanged | — | unchanged | — | — |

**Integrity across every cohort: 0 opportunities lost, 0 records moved across a
different relevance score.** Max displacement 364 places, all within ties.

### What did not improve, and why that is correct

`desarrollo` (9/10 one buyer) and `office` (8/10) are **unchanged even with
diversity on**. At those scores there are no other buyers to promote —
FONDO and Post Office Limited hold every top-scoring record legitimately,
because the query word is in their name. Promoting a lower-scored result to
manufacture variety is exactly what a relevance floor forbids.

And `construction`'s top ten is still entirely Defence Construction Canada.
What changed is the **content**: ten identical "Open Construction Source List"
notices became a housing construction plan, a jetty project, a major
renovation, construction management services and a QRT source list. Diversity
varied what it could without overruling relevance. Reporting "6 buyers" as a
success would be reporting the metric rather than the page.

## Complexity and performance

Blocking by (buyer, source) reduces **24,245,166 theoretical pairs to 165,283
comparisons — a 99.64% reduction**. No all-pairs similarity, no O(n²) artifact,
no pairwise matrix shipped anywhere.

| | before | after | delta |
|---|---|---|---|
| index raw | 4,595,398 B | 4,603,182 B | +7,784 |
| index gzip | 947,056 B | 949,302 B | **+2,246** |

Family detection runs **at build time only** (181 ms); the browser reads the
precomputed `f` field. Reranking costs +0.1 ms (telecom, default), +2.3 ms
(construction), +10.2 ms worst case (`services`, 3,395 hits) — 14.9 ms total,
well inside the v1 budget.

**Scale.** Blocking is bounded by the largest buyer's notice count, not by
corpus size, so the v1 threshold of ~25,000 current opportunities is unchanged.
Comparisons grow with per-buyer concentration; at 50,000 the projection would
still be well under a second at build time.

## Counting

Pagination and the result total remain over **canonical opportunities**, never
over visual groups. A family is shown inside one card; all of its members are
still counted, still individually reachable, and each renders its own deadline,
status and notice link rather than inheriting the representative's.

## UI and copy

A native `<details>` disclosure — keyboard operable, self-announcing, no
hand-rolled ARIA. It says "**N related opportunities**", never "duplicates",
and the note states they are distinct procurements with their own deadlines.
Localized in EN/DE/ES/FR.

## SEO

No new route, no family URL, no sitemap entry, no query parameter. Diversity
leaves no trace in the URL — no seed, no toggle — so a shared link reproduces
its result set exactly. The v1 crawl firewall is unchanged.

## Limitations

- Concentration that is not a tie is untouched, by design.
- Where one buyer holds every top-scoring record, the top window stays that
  buyer's. That is relevance working, not a defect.
- Regional entities of one organisation count as different buyers, so
  buyer-diversity metrics read better than the page does; the template
  dimension is what actually carries those cases.
- Family recall is deliberately low (3.4% of records). Repetitive cohorts that
  did not group are a v1.2 question, not a reason to loosen the rule.
- Amendment relationships are not modelled, so no family is ever labelled an
  amendment.

## Freshness

Unchanged. Phase 5B remains unverified; this layer makes no freshness claim.
