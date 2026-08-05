# Wave 1C-2 — Canada government registries

Released 2026-08-05. Continues production from `6769ec7` (Wave 1C-1, Australia).
Canada only. No UK, no Europe, no Asia, no Wave 2.

## What shipped

Thirteen new Canadian government registry records, taking the dataset from
**153 to 166** records and Canada from **1 to 14**.

| Layer | Records |
|---|---|
| Federal | Canadian Patents Database · MRAS Canadian Business Registry · SEDAR+ (plus the pre-existing federal corporation search) |
| Provinces | Ontario · Quebec enterprise register · Quebec RBQ licence holders · British Columbia · Manitoba · Nova Scotia · Newfoundland and Labrador · Saskatchewan |
| Territories | Northwest Territories · Nunavut |

Nine of Canada's thirteen provinces and territories now carry a record.

The registry mix is deliberately broader than corporate registers alone, as
requested: it includes a patent register, a securities filing database, a
beneficial-ownership register (Quebec), a contractor accreditation register
(RBQ) and a cross-border registry interface (MRAS).

## What did not ship, and why

Four jurisdictions carry no record. **None of these is an oversight**, and all
four are asserted as unpublished by the test suite so they cannot be quietly
filled in later:

- **Alberta** — there is no government-operated public corporate search to
  publish. Alberta states that registry agents provide all search services, for
  a government fee plus an unregulated service fee. Recorded in the coverage
  manifest as `no-public-registry`, deliberately **not** as a blocker. Do not
  resolve it by substituting a private registry agent, an aggregator, or MRAS.
- **New Brunswick, Prince Edward Island, Yukon** — every official host returned
  an interstitial bot challenge or no response at all. Their identity and access
  model were never established, so nothing was asserted about them.

Six federal candidates are pending for the same kind of reason, the two highest
priority being the **CRA List of Charities** (client-rendered; the canada.ca
description page was unreachable) and the **FINTRAC MSB registry** (the register
itself is 403 on two hosts). Both are real registries that belong in the dataset;
neither was reachable.

Full detail, including verification steps for each, is in
[the verification backlog](../business-directories-verification-backlog.md).

## One decision needed before Wave 1C-3

**The Canadian Trademarks Database is fully researched, fully verified, and
withheld by an architectural constraint rather than by any gap in evidence.**
It is the highest-value unpublished Canadian registry.

The conflict is narrow. CIPO's trademark search lives on
`ised-isde.canada.ca` — the same host as the already-published federal
corporation search — and no alternate official host exists
(`marques-trademarks.ic.gc.ca` does not resolve). The architecture permits two
records on one host through `resourceIdentity` + `sharedHostGroup`, which is
exactly what that mechanism is for. But `bd-truth.test.cjs` also holds that one
measured domain reports one Domain Rating, and `ca-corporations-canada` carries
a dated Ahrefs snapshot of 92 for that host. A new record on the same host must
therefore either carry 92 too, or break the invariant.

This wave's Domain Rating policy is explicit that **every new record carries
`domainRating: null`**, so the record was withheld rather than resolve the
conflict unilaterally. Two clean options:

1. **Reuse the existing snapshot.** Give the trademark record `domainRating: 92`
   with the same provenance (`Ahrefs`, `2026-08-04`, `historicalSnapshot`,
   `measuredDomain: ised-isde.canada.ca`). This collects nothing new and uses no
   API — it reuses one already-committed measurement of the same domain. It does
   depart from the letter of "every new record is null".
2. **Scope the invariant to records that carry a rating.** Let a null sit
   alongside a measured value on a shared host, on the ground that null means
   "not measured" rather than a competing number.

Either is a one-line change. Neither needs more research. Publishing the record
then takes about ten minutes.

## Deliberate non-changes

- `ca-corporations-canada` is **byte-for-byte untouched**. It was not re-dated,
  not re-scored, and did not gain a `resourceIdentity`. A test asserts this.
- No existing Domain Rating was altered and no new one was collected. All
  thirteen new records carry `domainRating: null` and `metricStatus: "unknown"`.
- No schema change, no new registry type, no new jurisdiction type. The Wave
  1C-0 jurisdiction model already supported Federal / Province / Territory and
  was used as-is.
- No new route family. Detail URLs remain
  `/research/business-directories/canada/<slug>/`.

## Side effects of the build

Two are worth knowing about, and both are the generator working correctly:

- Guide prose counts moved from "84 of 153" to "97 of 166" because dataset
  counts are build-time tokens, never literals — thirteen new records, all of
  them official or statutory registers.
- Several higher-scoring Canadian records displaced US records from guide
  "top 12" tables, which removed the corresponding guide backlinks from a few US
  and global detail pages. No record was changed; only generated cross-links.

## Verification

Validator clean · migration idempotent across two runs · build byte-identical on
the second run (`0 written, 0 pruned`) · **692 tests pass, 0 fail** (666 before,
30 new Canada assertions) · eight deliberate mutations all caught · working tree
clean after build-then-test.
