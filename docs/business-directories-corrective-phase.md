# Corrective phase — "Say What Is True, Show What Exists"

Approved design note. One coherent generator-side phase resolving all P0 findings
and the approved P1 visibility issues from the Research Center audit.

## Governing rule introduced by this phase

> A field that is **null for every record in the registry** is an unshipped feature:
> state its absence once, in prose, and do not render a per-record tile for it.
> A field that is **populated for some records** is a per-record gap: it keeps
> rendering as Unknown / em-dash on every record where it is not established.

`domainRating` (6/64) therefore stays everywhere. `authorityScore` (0/64) does not.
All twelve `accepts` flags stay, Unknowns included, because the group is 26%
populated — suppressing it would hide real per-record gaps.

The rule is **data-derived, not a permanent editorial decision**. Suppression is
computed from the registry at build time, so the moment any record records a value
the field returns automatically. Nothing is hard-deleted from the schema.

## Decisions applied (from the owner)

1. **`notApplicable` submission model.** New first-class value. Label
   "Not a submission target"; supporting text "Records are created through
   incorporation, registration, filing, or statutory processes."
   Applied where inclusion is created by incorporation, registration, filing,
   legal status or another official process — never merely because a site is
   government-operated.
2. **Empty categories are hidden** from public HTML, sitemap, RSS, guide lists,
   filters and navigation. No "coming soon", no "0 records", no placeholder.
3. **Indexability** is decided by a central predicate over a meaningful-content
   contract, never by word count.
4. **Score factor definitions** live in one central source and every surface
   renders from it. No factor is invented; the non-existent "accessibility
   factor" is removed.
5. **Global is a scope, not a country** — separated from the national grid.
6. **Promotion** waits until the audit gate is green.
7. **Verification cadence** is deterministic, derived from record fields only.

## Conflicts found against the existing implementation, and how they resolve

**C1. `REFERENCE_COUNTRY` / `REFERENCE_CATEGORY` scaffold.**
`countryEmitted()` and `categoryEmitted()` force-emit `united-states` and its
`general-business` category even at zero records — the original "lean reference
scaffold" requirement. Decision 2 supersedes it: a category with zero verified
records must not appear publicly. Resolved by removing the category-level
reference fallback. The fallback is currently inert (general-business has 2
records), so no page changes today; the change prevents an empty category page
from ever being published. The **country-level** fallback is kept: it is what
guarantees the section always has a hub and one country page, and every country
in the registry is populated today.

**C2. Meta descriptions must contain no digits.**
`bd-seo.test.cjs` asserts `!/\d/.test(meta.description)` for the hub, country and
category builders. Derived counts therefore go in page body copy, never in a meta
description. This is a deliberate anti-fabrication guard and is preserved.

**C3. `.bd-tag` is not a "coming soon" class.**
`scoreBreakdown()` emits `.bd-tag` for every score weight on every detail page.
The class and its CSS are kept; only the pending *usage* disappears.

**C4. `.bd-cta-link` is shared** by the outbound CTA and the submission link.
Restyling the class would create two competing primary buttons. The primary CTA
gets its own class; the submission link keeps the existing quiet treatment.

**C5. `notApplicable` must not collapse to `false` in the free-submission filter.**
Under tri-state semantics `false` is an established "No". A statutory register is
not "not free to submit" — it cannot be submitted to at all. It is excluded from
both sides of that filter and stated in its own words on the record.

**C6. `countryCard`'s `pending` branch is retained.** It is what prevents linking a
country page the generator never wrote. Empty countries are filtered out of the
hub list as well, so the branch is defence in depth rather than the only guard.

**C7. Comparison links must come from emitted comparisons.** `comparisonPage()`
returns null when either slug is absent and `buildArticles` drops it, so deriving
reciprocal links from the raw `COMPARISONS` constant could link a page that was
never generated. Links are derived from the emitted set.

**C8. The verification log is a generated artifact.**
`docs/business-directories-verification-log.md` carries a "Next due" column
produced by `scripts/generate-bd-logs.cjs`. Any cadence change must regenerate it.

**C9. `bd-integration.test.cjs` runs the real generator against the repository
root**, so running the suite rewrites the tree. Verification order matters: build,
then test, then confirm the tree is clean.

## Verification cadence rule

`nextVerification` is derived from `lastVerified` plus an interval determined by
what the record is, then spread deterministically so the dataset does not expire
on one day.

| Bucket | Interval |
|---|---|
| Review platforms and marketplaces with continuous public submission | 6 months |
| Other commercial directories and app marketplaces | 9 months |
| Statutory and government registers (`submissionModel: notApplicable`) | 12 months |

The spread is a stable hash of the record `id` modulo 28 days, added to the base
interval. The hash is a plain FNV-1a over the id's code units, so it is identical
on every machine and every run — no `Date.now()`, no `Math.random()`, no locale
dependence. `nextVerification` can never precede `lastVerified`.

`lastVerified` is never altered: those dates record when a human actually checked
the record.

## Score factor definitions — status

`SCORE_FACTORS` declares key, weight and label only. **No per-factor rubric exists
anywhere in the repository**, and no test asserts factor semantics. Definitions
published now would be a reconstruction from 64 recorded value sets, not a
transcription of a written rule.

Two pairs are near-collinear in the recorded data:

- `verificationQuality` / `moderationQuality` — identical in 59 of 64 records,
  r = 0.95, 17% combined weight.
- `industryImportance` / `businessUsefulness` — r = 0.85, 30% combined weight.

Publishing two distinct definitions for a pair whose recorded values move together
would assert a distinction the data cannot support. The definitions are therefore
stored centrally and described as **what the reviewer weighed**, in conservative
language, with no invented rubric bands and no claim that the factors are
independent axes. Wording requiring the owner's confirmation is listed in the
phase report.
