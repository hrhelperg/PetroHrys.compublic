# Tender & Procurement Intelligence v1

A derived decision-support layer over the Tender & Procurement Platforms
collection. It turns *"here are 382 procurement platforms"* into *"given what
kind of supplier you are and what you are trying to do, investigate these
first — and here is how certain we are."*

```
scored=368 notScored=14 min=18 median=61 max=100
bands={"STRONG":103,"NOT_YET_SCORED":14,"MODERATE":74,"GOOD":93,"LIMITED":49,"EXCEPTIONAL":49}
models={"discovery-plus-registration":69,"unknown":95,"discovery-only":70,"authorized-marketplace-or-tenant":30,"discovery-plus-documents":10,"full-electronic-procurement":22,"registration-system":31,"corporate-procurement-surface":34,"project-financed-surface":13,"corporate-procurement-transactional":8}
```

## 1. Purpose

The collection answers **where platforms are**. This layer answers **which to
investigate first, what you can actually do there, and how strong the evidence
is**. It is a ranking and explanation system, not an article, and not a
directory.

## 2. Canonical facts vs derived values

**Intelligence v1 adds ZERO fields to the schema and changes ZERO records.**
Every value on the intelligence page and in its CSV is computed at build time
from facts already in `data/tenders-procurement/platforms.json`.

| Concept | Classification | Source |
|---|---|---|
| Discovery capability | **B — derived** | `tenderSearchUrl` present |
| Registration capability | **B — derived** | `supplierRegistrationUrl` present |
| Documents capability | **B — derived** | `documentsUrl` present |
| Submission capability | **B — derived** | `submissionUrl` present |
| Electronic submission | **A — canonical** | `electronicSubmission` |
| Foreign eligibility | **A — canonical** | `foreignSuppliersAccepted` + `evidenceClass` |
| Browser dependency | **A — canonical** | `browserCheckRequired` |
| Procurement reach | **A — canonical** | `coverage` |
| Procurement model | **B — derived** | routes + declared nature + `partOf` |
| Supplier actions | **B — derived** | routes only |
| Industry fit | **C — editorial** | see §7 |
| Contract volume, traffic, win rate | **D — unsupported** | never computed |

## 3. Evidence classes

`VERIFIED` (operator stated) · `OBSERVABLE` (seen live) · `DERIVED` ·
`UNKNOWN`. Rendered on every recommendation row. Editorial mapping is labelled
`Editorial mapping` wherever it appears and is never rendered as verified.

## 4. Utility score

Six weighted dimensions, all over canonical facts. Weights live in
`WEIGHTS` in `scripts/lib/tp-intelligence.cjs` and nowhere else. There are no
per-platform constants and no manual promotion.

| Dimension | Weight | Measures |
|---|---|---|
| discoverability | 25 | is there a search route, and is search free |
| onboarding | 15 | is the registration path established |
| submission | 20 | can a bid actually be lodged |
| certainty | 20 | evidence class, and whether a browser check is pending |
| accessibility | 10 | free search, verified foreign access |
| reach | 10 | how much procurement the platform covers |

**Browser-check deliberately costs only inside `certainty`, and only partially.**
A system behind Cloudflare is not a worse procurement system; it is a system we
have not finished verifying. A test asserts that a browser-check record can
still reach the STRONG band.

## 5. Evidence floor

A record is scored only when `evidenceClass` is A, B or C. Records whose own
evidence is `unknown` return **NOT_YET_SCORED**. Scoring them would present a
research gap as a measurement.

Bands were set **after** inspecting the real distribution, not before:
EXCEPTIONAL ≥80 · STRONG ≥65 · GOOD ≥50 · MODERATE ≥35 · LIMITED below.

## 6. Recommendation model

**Utility and fit are different questions and are never the same number.**

- **Utility** — how strong and actionable is this source?
- **Fit** — how relevant is it to this supplier and objective?

Fit orders each list; utility breaks ties. A national platform with modest
evidence can be the most relevant source for a supplier targeting that country,
and a superbly documented development bank can be irrelevant to a local SME. A
test asserts the two rankings are not identical.

Every recommendation emits **reasons** drawn from the signals that actually
contributed, so no row is unexplained.

## 7. Supplier profiles and the industry rule

Sixteen profiles are computed; seven are featured on the page (a page with
sixteen ranked tables is a data dump, not advice). All sixteen appear in the CSV
`best_for` column.

**The dataset records no industry.** `opportunityTypes` holds procurement
*instruments* (tender, RFP, RFQ, framework-agreement, DPS), and the nineteen
`sector-procurement` records name their sector only inside a free-text platform
name. Inferring "this is a telecom platform" from a name, or from prose in an
evidence note, is exactly the fabrication this collection exists to avoid.

So **no platform is ever described as specialising in a sector.** What each
profile does instead is weight the *canonical capabilities that supplier needs*:

- IT/SaaS → framework agreements and DPS, because that is how software is bought
- Construction → established document routes, because drawings live there
- Manufacturer → goods instruments, cross-border reach, verified foreign access
- Local SME → national/regional/municipal reach, free search, clear registration

The mapping from supplier type to which facts matter is **editorial**, is
labelled editorial on every profile section, and rests on recorded facts.

## 8. Foreign supplier semantics

Three states: `VERIFIED_ACCEPTED` (operator stated, class A), `RESTRICTED`
(established restriction), `NOT_VERIFIED`.

**`NOT_VERIFIED` is never rendered as a negative.** The page says foreign
eligibility "has not been verified", never "foreign suppliers are not accepted".
Eligibility is never inferred from an English UI, a country selector, EU
membership, public visibility or multinational scope. A test asserts that of the
211 records carrying English, zero are marked verified without the canonical fact.

## 9. Multilateral semantics

The T4/T4B distinctions are preserved and enforced: UNGM appears once, not once
per UN agency; agency tenant systems stay separate; project-financed surfaces
never claim financier submission; the EBRD hosted-client exception is respected;
bilateral donors remain national.

## 10. Browser-check semantics

A **research state**, not a quality penalty. The page names the recorded blocker
category where derivable (bot protection, WAF, cookie gate, script-rendered,
transport failure) without overstating it. 403 ≠ dead. Timeout ≠ dead.

## 11. Prohibited inferences

Never computed, never estimated: traffic, contract value, tender volume, bidder
counts, supplier counts, win rate, success probability, market share,
popularity, ease of winning, Domain Rating.

## 12. Pathology findings

All fifteen PART 20 checks pass. Notable results:

- foreign-supplier top-10: **10/10 verified eligibility** (not unknown-dominated)
- EU top-10: 4 EU-level + 3 supranational — not merely ten member states
- telecom vs SaaS overlap: **6/10**, so the two are genuinely different lists
- manufacturer top-10: **10/10 record goods instruments**
- multilateral: **1 UNGM row, 0 duplicate hosts**
- World Bank project-financed records claiming submission: **0**
- top-20 foreign-supplier still contains **8 browser-check records** — the flag
  does not exile a platform from useful recommendations
- local-SME top-10: **0 supranational** records

## 13. Mutation coverage

27 tests in `scripts/tests/tp-intelligence.test.cjs`, including mutations for:
unknown eligibility upgraded, search URL used as submission, browser-check read
as dead or verified, weight inversion (proving weights are load-bearing and
restore cleanly), project-financed claiming financier submission, and scoring
without the evidence floor.

## 14. Limitations

- Scores measure **documented procurement utility**, not popularity or outcome.
- 14 platforms are unscored because their own evidence is unestablished.
- 194 records still require rendered-browser verification; none was performed
  because no rendered browser exists in this environment.
- Industry recommendations are editorial mappings over capability facts, not
  sector classifications.
