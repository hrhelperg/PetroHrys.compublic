# Distribution Intelligence v2 — Actionability & Campaign Execution

## Purpose

v1 answered *"where should this business be promoted?"*. v2 answers the question
an employee actually has on Monday: **"what exactly do I do next, where, and how
sure are we?"**

## The audit came first, and it added zero stored fields

Every operational concept requested already had a canonical home:

| Concept | Canonical field | Coverage |
|---|---|---|
| action | `listingAction` / `marketplaceType`+`sellerTypes` / `opportunityTypes` | 32/1563 dirs; all mp; all media |
| action URL | `submissionUrl`, `claimUrl`, `pitchUrl`, `pressReleaseUrl`, `advertisingUrl` | 139 / 2234 |
| cost | `submissionModel` / `costModel` | 48 dirs; all others |
| verification | `verificationMethods` | 2 / 1563 |
| required assets | `requiredAssets` | 77 / 1563 |
| difficulty | `submissionDifficulty` | 36 / 1563 |
| moderation | `intelligence.approvalMode`, `requiresEditorialApproval` | 31 dirs, 62 media |
| geography / languages | `country`, `audienceGeography`, `languages` | full / media only |

**The gap is evidence, not schema.** Adding `publishingTime` or
`accountRequired` columns would have produced 2,234 empty cells and a dashboard
reporting how many fields exist rather than how much is known. Publishing time is
derived from `approvalMode` where that exists and is `unknown` everywhere else.

## The state machine

| State | Meaning |
|---|---|
| `READY` | Known action + a recorded route that matches it + no known blocker |
| `NEEDS_RESEARCH` | Relevant, but something operational is missing |
| `NEEDS_BROWSER` | Behind a bot filter; needs a human with a rendered browser |
| `BLOCKED` | A known restriction prevents the action |
| `NOT_APPLICABLE` | Excluded for the selected business or objective |

## What READY means — and what it does not

READY means three things are true: we know what action the platform supports, we
have a recorded URL that **matches that action**, and nothing known prevents it.

READY does **not** mean the submission will be accepted, that it is free, or that
anything will be published. An editor may still say no.

**Unknown is never promoted to READY.** A platform whose route was never
established is in Needs research. A platform behind a bot filter is in Needs
browser — a separate state, because it needs different work from a different
person. A 403 proves the server answered and nothing about the product, so it
never means dead.

## Collection-native readiness

- **Directories** — `create`/`create-and-claim` needs `submissionUrl`; `claim` needs `claimUrl` **specifically**, because a submission route does not claim an existing profile.
- **Marketplaces** — the collection records no per-platform route, so no marketplace is READY today. None is fabricated from the homepage.
- **Media** — the route must match the opportunity: a release goes to `pressReleaseUrl`, a pitch to `pitchUrl`, a sponsorship to `advertisingUrl`.

## Execution confidence

| Band | Rule |
|---|---|
| HIGH | READY, and cost, moderation and effort are all established |
| MEDIUM | READY, one secondary fact unknown |
| LOW | READY, two or more secondary facts unknown |
| INSUFFICIENT | Not READY |

Every band states what it is missing. No band shows a number on its own.

## Campaign ranking

Readiness **multiplies** the v1 fit score rather than nudging it: READY 1.0,
NEEDS_RESEARCH 0.45, NEEDS_BROWSER 0.4, BLOCKED 0. A theoretically excellent
platform with no usable route cannot outrank a workable one — but it is not
deleted, it lands in the research group.

Diversification is a **tie-break, not a quota**: among candidates within 4 points
of the best remaining score the campaign prefers the least-drawn collection. A
collection that does not fit is never added to fill a slot.

## Current health — all derived

| Collection | Total | Ready | Needs research | Needs browser | Blocked | Action URL coverage | High confidence |
|---|---|---|---|---|---|---|---|
| Business Directories | 1563 | 27 (1.7%) | 1073 | 463 | 0 | 2.3% | 2 |
| Marketplace & Classified | 286 | 0 (0%) | 176 | 109 | 1 | 0% | 0 |
| Media, PR & Publishing | 385 | 99 (25.7%) | 224 | 62 | 0 | 26.8% | 0 |
| **All** | **2234** | **126 (5.6%)** | 1473 | 634 | 1 | 6.2% | 2 |

**Research debt: 2107.** This is the honest state of the catalogue. It is
reported rather than smoothed over by lowering what READY means — a smaller
truthful queue is worth more than a large one built on assumptions.

## Why there is no workflow state

No Completed / Submitted / Approved. Those need per-company persistent storage,
and this is a knowledge base, not a CRM. A header-only template is committed at
`data/distribution-planner/internal-execution-tracker.template.csv` for teams
keeping that state elsewhere; a test asserts it stays header-only.

## Limitations

- **6.2% action URL coverage** is the binding constraint on everything above.
- Marketplaces contribute **0 READY**: the collection holds no route field at all.
- Only **2** opportunities reach HIGH confidence, because moderation and difficulty are recorded for very few records.
- Publishing time is `instant` only where an operator states instant approval; everywhere else `unknown`.
- The browser queue (634) cannot be worked in this environment — no rendered-browser capability exists.
