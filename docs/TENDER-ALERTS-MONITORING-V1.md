# Tender Alerts & Monitoring v1 — engine

**Status: PARTIAL.** The change-detection and alert-derivation engine is built,
tested and committed. The public monitoring UI, its i18n, CSV export, SEO
wiring and the formal mutation suite are **not built**. See "What remains".

---

## What this layer is

The corpus answers *what is open*. This answers *what changed, and is the
change real*. It is derived: it reads two corpus states and writes change
events. It never edits a canonical fact.

```
corpus(t-1)  ─┐
              ├─► changes ─► alerts (per supplier profile)
corpus(t)    ─┘
source health ┘
```

## Monitored field matrix

| Field | Alertable | Comparison |
|---|---|---|
| status | yes | exact, closed vocabulary; named transitions (CANCELLED/AWARDED/REOPENED) |
| deadline | yes | ISO instant **only when both sides decidable** |
| value | yes | amount+currency; **never across currencies** |
| title + description | yes | one digest, material only |
| buyerName | yes | normalized text |
| classifications | yes | set of `scheme:code` |
| submissionUrl | yes | normalized URL, tracking params stripped |
| occurrences | yes | set of sourceIds |
| publicationDate, sourceModifiedDate | **no** | corrections and ingestion artefacts, not events |
| statusBasis, fieldSources, occurrenceCount, multiSource, titles | **no** | provenance bookkeeping |

Alerting on bookkeeping trains a reader to ignore the feed.

## The three rules that make it trustworthy

**1. Disappearance is never closure.** A record absent from the corpus is
`NO_LONGER_OBSERVED`, informational, never actionable — and it is **suppressed
entirely** unless the source is `HEALTHY`, was actually promoted this run, and
declares a `COMPLETE` window. Verified: 3,087 TED records removed under a
degraded source produced **0 alerts, 3,087 suppressed**; the same removal under
a healthy complete source produced 3,087 `NO_LONGER_OBSERVED`, none actionable,
and **zero invented cancellations**.

**2. First run raises nothing.** No baseline means `BASELINE_INITIALIZED` over
9,577 opportunities and zero alerts. Installing a monitor is not a procurement
event.

**3. One change, one alert per profile.** Alert identity belongs to the
canonical change, not to each source occurrence.

## Deadlines

Extension and shortening are claimed only when both sides resolve to real
instants. A zoneless deadline spans a 26-hour band, so a move inside it becomes
`DEADLINE_CHANGED_UNCOMPARABLE` — visible, honest, and not news it cannot
support. The same instant in a different format is not a change at all.

## Severity

`CRITICAL` (cancelled, deadline shortened) · `HIGH` (submission route changed,
reopened, new) · `MEDIUM` · `LOW` · `INFORMATIONAL`.

Severity is **monitoring urgency**, never predicted business impact. A
cancellation is critical because acting on it wastes a bid.

## Durable state

`monitoring-baseline.json` — **committed**, 1.68 MB, 183 bytes/opportunity. A
comparison baseline in a gitignored file is the Phase 5 failure with worse
consequences: a fresh CI clone would report all 9,577 opportunities as new.

Text is stored as a 12-char digest rather than prose — that alone took the file
from 4.47 MB to 1.68 MB. The cost is that a text-change alert cannot quote the
previous wording; the current title is in the corpus and the old one stops
being true the moment it changes.

The baseline is rewritten only when **entries** change, so a re-run with a new
`generatedAt` writes nothing.

`change-ledger.json` — bounded at 2,000 entries, newest first. Observability for
recent runs, not an archive.

## Two bugs found in this phase's own code

- The first design rehydrated a previous opportunity from the baseline and
  split a packed title/description key on a space — every multi-word title came
  back wrong and would have fired a false text-change alert on every refresh.
  Replaced with entry-to-entry comparison, which removes the class.
- `TRACKING_PARAMS` anchored `utm_` as `/^utm_$/`, which matches nothing.
  Every `utm_source` sailed through, so a rotating campaign id would have fired
  a submission-route alert on every refresh.

## What remains

Engineering debt, not an external blocker:

1. **Public monitoring route** under `/research/tenders-procurement/` — page,
   filters (change type, severity, profile, country, source, deadline window),
   KPIs.
2. **i18n** for that page across EN/DE/ES/FR.
3. **CSV export** with formula-injection protection.
4. **SEO wiring** — canonical, og:url, reciprocal hreflang, sitemap entry, and
   a decision on indexability.
5. **Formal mutation suite** (Part 47): the property tests cover the same
   invariants, but the applied/caught/restored discipline used in Phases 2–5
   has not been run for this layer.
6. **Wiring into the scheduled workflow**, which should wait for Phase 5B.

Until 1–5 land this is an engine with tests, not a product.

## Delivery channels

`IN_APP_NOT_BUILT` · `EMAIL_NOT_CONFIGURED` · `WEBHOOK_NOT_CONFIGURED`.
No delivery infrastructure exists and none was invented.
