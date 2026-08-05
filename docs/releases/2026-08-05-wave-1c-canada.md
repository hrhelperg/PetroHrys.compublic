# Wave 1C-2 — Canada government registries

Released 2026-08-05. Continues production from `6769ec7` (Wave 1C-1, Australia).
Canada only. No UK, no Europe, no Asia, no Wave 2.

## What shipped

Fourteen new Canadian government registry records, taking the dataset from
**153 to 167** records and Canada from **1 to 15**.

| Layer | Records |
|---|---|
| Federal | Canadian Trademarks Database · Canadian Patents Database · MRAS Canadian Business Registry · SEDAR+ (plus the pre-existing federal corporation search) |
| Provinces | Ontario · Quebec enterprise register · Quebec RBQ licence holders · British Columbia · Manitoba · Nova Scotia · Newfoundland and Labrador · Saskatchewan |
| Territories | Northwest Territories · Nunavut |

Nine of Canada's thirteen provinces and territories now carry a record.

The registry mix is deliberately broader than corporate registers alone, as
requested: it includes a trademark register, a patent register, a securities
filing database, a beneficial-ownership register (Quebec), a contractor
accreditation register (RBQ) and a cross-border registry interface (MRAS).

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

## The shared-domain snapshot decision, resolved

The **Canadian Trademarks Database** was held back in the first pass by a rule
that turned out to be the wrong shape, not by any gap in evidence. It is now
published as `ca-cipo-trademarks-database`.

CIPO's trademark search lives on `ised-isde.canada.ca`, the same host as the
federal corporation search, and no alternate official host exists
(`marques-trademarks.ic.gc.ca` does not resolve). The old rule — *every new
record carries `domainRating: null`* — would have forced the two records to
report different Domain Ratings for one domain, which `bd-truth` rightly
forbids.

The rule now reads:

> A new record must not create a new Domain Rating measurement. A record may
> reuse an existing frozen historical snapshot when its normalised
> `measuredDomain` exactly matches an already measured domain.

That is the distinction the freeze was always about. A Domain Rating is a fact
about a **domain**; repeating a stored reading for the same domain measures
nothing, calls nothing and needs no credential. Reuse is permitted only on an
exact `measuredDomain` match, with the value, provider, date and
`historicalSnapshot` status copied verbatim. Copying between different domains,
between a parent domain and a subdomain, or under a changed date or provider all
remain forbidden.

**Proof that nothing was measured:** the snapshot digest keyed by measured
domain is byte-identical either side of this change —
`aa7e6984d516017ea37c3fb5f3ab94791f060787fec1c8dda3a913cd19847a4e`, over 64
measurements, before and after. What grew is the number of *records* displaying
a rating (64 → 65), never the number of *readings*.

A new central guard, `sharedDomainSnapshotProblems()` in `bd-schema.cjs`, is the
single enforcement point; the validator and `bd-truth` both call it so they
cannot drift. It rejects differing values, dates, providers or statuses on one
measured domain, and rejects a snapshot whose `measuredDomain` is not the
record's own. A record on an already-measured domain may still decline the
value, but only by writing the literal marker `Domain Rating not reused: …` in
`editorNotes`, so a forgotten value can never pass as a considered one.

**What the reader is told.** Every page carrying the column now states that
Domain Rating "is a dated historical measurement of the shared domain, not an
assessment of this individual registry page". Two registries on one departmental
host therefore show the same number without either appearing to have earned it,
and the PetroHrys Score remains the number that actually differs between them.

**The two systems stay distinct.** The trademark register and the corporation
register have different legal functions, different search URLs, different
populations and different registry types. The record states in published prose
that it records "trademarks, not businesses", that an entry establishes nothing
about the owner's incorporation, legitimacy or standing, and that unregistered
common-law rights appear in no register at all. Tests assert each of these.

## Deliberate non-changes

- `ca-corporations-canada` keeps all of its research: same verification date,
  same score, same Domain Rating value and provenance, same URL, same
  classification. Its **only** change is gaining the `resourceIdentity`
  shared-host declaration the architecture requires once a second statutory
  system is published on the same official host. A test pins every one of those
  fields.
- No existing Domain Rating was altered and no new one was measured. Thirteen of
  the fourteen new records carry `domainRating: null` and
  `metricStatus: "unknown"`; the fourteenth reuses its own domain's existing
  frozen snapshot.
- No schema change, no new registry type, no new jurisdiction type. The Wave
  1C-0 jurisdiction model already supported Federal / Province / Territory and
  was used as-is.
- No new route family. Detail URLs remain
  `/research/business-directories/canada/<slug>/`.

## Side effects of the build

Two are worth knowing about, and both are the generator working correctly:

- Guide prose counts moved from "84 of 153" to "98 of 167" because dataset
  counts are build-time tokens, never literals — fourteen new records, all of
  them official or statutory registers.
- Several higher-scoring Canadian records displaced US records from guide
  "top 12" tables, which removed the corresponding guide backlinks from a few US
  and global detail pages. No record was changed; only generated cross-links.

## Verification

Validator exit 0 · second migration rewrote 0 · second build wrote 0 and pruned 0
· **716 tests pass, 0 fail** (666 at production HEAD; 32 Canada assertions and 17
shared-domain snapshot assertions added, and one wave-1A guard re-expressed) ·
13,512 internal links checked, 0 broken · sitemap equals the indexable set
(236 = 236, 0 noindex) · every indexable record URL present in the RSS feed ·
236 JSON-LD blocks parse with no `AggregateRating`, `Review`, `Product` or
`SearchAction` markup · every page carries an absolute canonical and is owned by
the build manifest · no build, validator or migration path can make a request or
read a credential · **64 measured domains before and after, per-domain snapshot
digest unchanged** · eight deliberate mutations all caught · working tree clean
after build-then-test.

### Adversarial review in this pass

Three claims were re-checked against page text rather than against notes:

- The four searchable mark categories (certification marks, distinguishing
  guise, geographical indications, plant breeders' rights denominations) were
  confirmed present on the live search form, not taken from a summary.
- The Saskatchewan record was checked sentence by sentence for any claim of
  government operation. The only occurrence of "government-operated" is inside
  the clause explaining that *Alberta* has none — the distinction the record
  exists to keep visible. That check is now a permanent test.
- One release-gate check initially flagged `AggregateRating` on a guide page.
  It is prose inside an FAQ answer stating that no such markup is emitted, is
  byte-identical at `b2abdc0` and `origin/main`, and is not markup. The gate
  check was corrected to inspect `@type` values and property keys rather than
  text content.
