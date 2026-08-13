# Tender Alerts & Monitoring v1 — engine

**Status: COMPLETE.** Engine, public product, i18n, CSV and the formal mutation
suite are all in place.

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

## The public product

**One route**, four locales: `/research/tenders-procurement/monitoring/`. Not
`/alerts/` and `/changes/` as well — those would be the same data sorted
differently, four thin pages competing with each other instead of one worth
reading.

The renderer calls the engine and displays the result. There is no second
ranking implementation in the page or in client JavaScript, because two
implementations of "which alert matters most" drift and then nobody can say
which page is right.

**KPIs** (11 cards) show zeroes honestly. Hiding a zero to look busier is the
first lie a monitoring product tells.

**Durable content.** Procurement is quiet most days and the engine currently
reports zero changes, so the page's methodology half — what "newly observed"
means, why a disappearance is not a cancellation, how deadline comparability
works, how supplier matching works — stands on its own. A page whose only
content is a volatile list is thin most of the time.

**Empty state** is truthful: the baseline is initialised and changes appear
after the next validated refresh. No synthetic sample alerts in production
output; synthetic fixtures live in tests only.

**Filters** were deliberately NOT added. Today's alert cardinality is zero and
recent-run cardinality is bounded at 60 rendered rows; a filter bar over an
empty or short list is a dead control, and Part 7 rules out dead filters. The
CSV carries every field for anyone who wants to slice it. Filters become
worthwhile once a scheduled cadence produces steady change volume.

**Indexable**, because the methodology content is durable. Self-canonical,
`og:url` matching, reciprocal hreflang plus `x-default`, one `H1`, one `main`,
sitemap entry per locale, inbound link from the collection page. No query state
is ever a route.

## CSV

`/research/tenders-procurement/monitoring/alerts.csv` — RFC 4180, UTF-8 BOM,
CRLF, 19 columns, round-trip tested against commas, quotes, newlines and
Unicode.

**Formula hardening**: a cell beginning `=`, `+`, `-`, `@` or a tab is prefixed
with a single quote. A buyer can legitimately name a procedure `=- Lot 3 -=`,
and a title beginning `=` opens in Excel as a formula. Applied only at the CSV
projection boundary — the canonical title keeps its characters, because the
problem belongs to the spreadsheet, not to the procurement.

Reason codes are exported **canonical**, not translated: this is a machine file,
and a locale-dependent export would make two downloads disagree.

## i18n

127 first-party keys per locale across EN/DE/ES/FR — headings, KPI labels,
change types, severities, health and coverage states, reason codes,
uncertainty copy, empty states, methodology.

Canonical enums are never stored translated. `DEADLINE_EXTENDED` stays
`DEADLINE_EXTENDED` in data and renders as *Frist verlängert* / *Plazo ampliado*
/ *Délai prolongé*. A mutation asserts no translated label reaches a canonical
value, and another asserts no English first-party copy leaks into a localized
page.

## Mutation coverage

16 formal mutations, applied/caught/restored, plus a suite-level guard that
every mutation actually asserts something. Zero survivors, zero no-ops.

## Delivery status

`EMAIL_NOT_CONFIGURED` · `WEBHOOK_NOT_CONFIGURED`. Monitoring is available on
the page and as CSV. The page says so rather than advertising what does not
exist.

## Known limitations

- **Zero changes today.** The corpus and baseline agree, so the page renders its
  empty state. That is the honest current state, not a defect.
- **Phase 5B is still unverified** — no schedule-triggered run has occurred. The
  page therefore says "compares validated snapshots" and "run manually", never
  "continuously monitored".
- Retained last-good records lose `fieldSources`, so a text-change alert cannot
  quote previous wording.
- No filters yet; see above.

## Delivery channels

`IN_APP_NOT_BUILT` · `EMAIL_NOT_CONFIGURED` · `WEBHOOK_NOT_CONFIGURED`.
No delivery infrastructure exists and none was invented.
