Publishes the Business Directories Research Center: **64 hand-verified
directories across 129 generated pages**, plus the corrective phase that removed
five false published claims and the UX work that makes the dataset visible.

`main` already carries the section's scaffold and data (PR #15). This PR is the
correctness and visibility release on top of it.

## Release summary

| | |
|---|---|
| Verified directories | **64** |
| Countries and scopes | **11** (10 national + `global`) |
| Populated categories | **12** |
| Generated pages | **129** |
| Indexable pages | **129** |
| Sitemap URLs | **129** |
| RSS items | **64** |
| Guides and comparisons | **31** |
| Tests | **350 pass, 0 fail** |

**By scope** — `global` 49; Australia 2, France 2, Germany 2, United Kingdom 2,
United States 2, Canada 1, Czech Republic 1, Italy 1, Poland 1, Spain 1.

**By category** — developer 19, government 13, app-directories 9, software 8,
startup 3, general-business 2, review-sites 2, local-business 2, marketing 2,
legal 2, healthcare 1, press-release-platforms 1.

## PetroHrys Score methodology

A first-party editorial assessment — not a third-party authority metric, not a
review rating. Ten factors scored 0–10 by a human reviewer, weighted to total
exactly 100; the score is the weighted sum divided by ten, reproducible from the
values printed on every record. The validator recomputes each score and rejects
mismatches.

Factor definitions live in a single source (`SCORE_FACTORS`) that every guide and
page renders from, so no page can name a factor that does not exist. The
definitions state what the reviewer weighed and explicitly say they are not a
rubric, because none was ever written down.

## Verification provenance

Every record shows its verification date, source and named reviewer.
`nextVerification` is derived — statutory registers 12 months, marketplaces and
review platforms 6, everything else 9, plus a deterministic 0–27 day offset from
a stable hash of the record id. That yields **45 distinct due dates across 64
records**, so the dataset no longer expires on a single day. `lastVerified` is
never altered.

## Domain Rating snapshots

Recorded on **6 of 64** records, each carrying provider (Ahrefs) and exact
measurement date, presented as a historical snapshot. Authority Score, estimated
traffic and referring domains have no consulted source and are null across the
dataset — stated once in prose rather than rendered as 64 empty tiles. No
third-party metric is described as a Google ranking factor, used for ranking, or
presented as a PetroHrys figure. A Domain Rating column or sort option appears
only where a rendered row actually carries a measured value.

## Truth corrections

Five false statements were published; all are fixed and guarded by tests.

1. **Three guides claimed Domain Rating was null dataset-wide** while six records
   carried Ahrefs values. The sentence is now derived from the registry at build
   time. The genuinely true statement in `how-directories-are-verified` — about
   approval times and review processes, both really null on every record — was
   deliberately left untouched.
2. **The hub FAQ and meta description claimed records store "how it links out".**
   `backlinkType` is null on all 64 and read by no renderer.
3. **Two FAQs cited "the accessibility factor"**, which is not one of the ten.
4. **Fourteen statutory registers were badged "Free to submit."**
5. **Filters published fabricated negatives** — see below.

An adversarial review of the fix found it had reintroduced the same class of bug
in new places: a FAQ that pre-judged the derived sentence, a hard-coded "Twenty
of the verified directories" that reclassification had moved to 15, a registers
FAQ describing a capability the schema no longer carries, two guides still
documenting a fixed six-month cadence, and a sort-option filter keyed to
identifiers `bd-sort` does not use, which silently never fired. All fixed, all
guarded.

## Tri-state filtering

Filters previously collapsed `null` to `false`, so ticking "Accepts SaaS" told
the reader that 44 directories do not accept SaaS when **42 of them had never
been checked**. Filtering is now tri-state end to end — resolver, row attributes
and client. A positive filter matches only confirmed records; unknowns are
excluded from the match but never presented as a negative. Each filter shows its
confirmed and unknown counts, and the fieldset states the rule in words.

## Statutory registers

New first-class `submissionModel: notApplicable` — **"Not a submission target"**,
supported by "Records are created through incorporation, registration, filing, or
statutory processes." It is not a pricing tier: it is excluded from every free /
paid / freemium / unknown count and from *both* sides of the free-to-submit
filter, because "you cannot submit at all" is not the claim "submission is not
free". Applied to 14 records after confirming the actual listing mechanism in
each case — never because a site is government-operated.

## UX improvements

- **208 "coming soon" cards removed.** A category with no verified record is not
  published anywhere — not as a card, not as a zero, not in the sitemap or RSS.
- **The hub states its own scale**: derived record count, countries and scopes,
  most recent verification date, a highest-scored table naming 12 real
  directories, and a separate **Global** section (a scope, not a country).
- **Country and category cards carry derived counts** and sort by coverage.
- **Table columns and sort options are computed from the rows actually rendered**,
  so no column is entirely em-dashes and no sort option silently does nothing.
- **Dataset-wide-empty groups are suppressed** and their absence stated once.
  Domain Rating and all twelve `accepts` flags deliberately still render with
  their honest per-record Unknowns.
- **Detail pages reordered** to lead with the CTA, score, verification and
  assessment; nothing populated sits below a mostly empty block.
- **The outbound CTA names its destination** — "Visit &lt;Official Name&gt;" with the
  host shown, ≥ body text size, ≥ 44px target, `rel="noopener noreferrer"`, no
  `nofollow`, and a visually-hidden "opens in a new tab".
- **Guides link back to the records they name**, derived by inverting the guide
  selectors over what was actually emitted. 51 of 64 records now have at least
  one guide link, up from 0.
- **Mobile**: the five-column table becomes a labelled card stack below 40rem,
  replacing a horizontal scroll that hid exactly the columns carrying data.

## Indexability decisions

A page is indexed when the record carries a substantive verified evidence
package: unique name and description, correct scope and category, an official
HTTPS destination, a PetroHrys Score with the complete ten-factor breakdown, a
verification date, source and named reviewer, and meaningful pros or cons.

Curated relations and guide links are **optional**. An earlier draft required
them, which demoted 14 records that each carry a full evidence package — a
missing relation is a gap in cross-referencing, not thinness in the page. **All
64 records are indexable.** Description uniqueness is enforced registry-wide
rather than by a length threshold; no word-count rule is used anywhere.

Records failing the contract become `noindex,follow`, keeping the page and every
link while dropping out of the sitemap automatically.

## Verification

```
validator            exit 0, registry valid
migration ×2         0 records rewritten on the second run
generator ×2         129 pages, 0 written, 0 pruned on the second run
tests                350 pass, 0 fail
site audit           PASSED — no findings
internal links       0 broken
unresolved relations 0
sitemap              129 = the indexable set exactly
working tree         clean
```

The audit covers internal-link resolution, canonical correctness and uniqueness,
indexable/noindex consistency, sitemap coverage, RSS resolution, redirect
targets/loops/chains, JSON-LD parsing and banned types, FAQPage-needs-visible-FAQ,
single-h1 and heading order, UTF-8 and U+2028/U+2029, XSS and `javascript:` URLs,
and outbound `rel` policy. It was proven non-vacuous against five injected defect
classes.

Content assertions, all zero: false dataset-wide metric claims, nonexistent score
factors, "how it links out" claims, "coming soon" output, unresolved build
tokens, statutory registers labelled "Free to submit", zero-record public
categories.

## Deferred work

- **31 verification-backlog candidates** blocked by bot walls, consent gates or
  JS-only rendering, plus 5 rejected outright — a costed manual queue for
  Dataset v2.
- **Score factor definitions need owner confirmation** on three points:
  `verificationQuality` and `moderationQuality` hold identical values on 59 of 64
  records; `industryImportance` and `businessUsefulness` correlate at r = 0.85;
  no observable field explains `platformReputation`.
- **`typicalApprovalTime`, `reviewProcess`, `backlinkType` and `requiredAssets`
  are null on every record.** They cannot be established without submitting a
  listing — that is Dataset v2 primary research, not something to infer.
- **Footer promotion** not added; the section is reachable from `/research/`.
- **Root `sitemap.xml` uses the apex host** while this section uses `www`.
  Pre-existing, out of scope.

## Rollback

Everything under `research/business-directories/` is generated and
manifest-owned. Revert the merge commit and redeploy: pages, sitemap, feed and
redirect rules are all reproduced from `data/business-directories/` by
`node scripts/build-business-directories.cjs`. No database, no runtime
dependency, no root `package.json` — a pure content rollback with no migration
to undo.
