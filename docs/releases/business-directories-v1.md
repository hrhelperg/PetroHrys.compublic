# Business Directories — Release v1 (English)

Canonical source version: **English**. No localisation exists or is planned for
this release. Russian, Ukrainian and Czech are approved only after the English
version passes its final completion audit.

## What ships

A country-by-country research index of business directories. Every record is
verified by hand against an official source before publication; anything that
could not be established is stored as `null` and rendered as Unknown, never as
a zero and never inferred.

| | |
|---|---|
| Verified records | 64 |
| Countries and scopes | 11 (10 national + `global`) |
| Populated categories | 12 |
| Generated pages | 129 |
| Indexable pages | 129 |
| Sitemap URLs | 129 |
| RSS items | 64 |
| Editorial guides and comparisons | 31 |
| Redirect rules | 17 |
| Tests | 350 |

### Coverage

- **By scope** — `global` 49; Australia 2, France 2, Germany 2, United Kingdom 2,
  United States 2, Canada 1, Czech Republic 1, Italy 1, Poland 1, Spain 1.
- **By category** — developer 19, government 13, app-directories 9, software 8,
  startup 3, general-business 2, review-sites 2, local-business 2, marketing 2,
  legal 2, healthcare 1, press-release-platforms 1.
- **By submission model** — unknown 25, free 15, notApplicable 14, freemium 9,
  paid 1.
- **By tier** — tier1 43, tier2 16, tier3 5.

## PetroHrys Score

A first-party editorial assessment, not a third-party authority metric and not a
review rating. Ten factors, each scored 0–10 by a human reviewer, weighted to
total exactly 100; the published score is the weighted sum divided by ten, so it
is reproducible from the values printed on every record. The validator recomputes
every score and rejects any stored number that does not match.

Factor definitions live in one place — `SCORE_FACTORS` in
`scripts/lib/bd-schema.cjs` — and every guide and page renders from it, so no
page can name a factor that does not exist. The definitions describe what the
reviewer weighed; they are explicitly not a rubric, because no rubric was ever
written down, and the published note says so.

## Verification provenance

Every record carries a verification date, a verification source, and a named
reviewer, all rendered on the page. `nextVerification` is derived, never
hand-set: statutory registers 12 months, marketplaces and review platforms 6,
everything else 9, plus a deterministic 0–27 day offset from a stable hash of
the record id. That produces 45 distinct due dates across 64 records so the
dataset does not expire on a single day. `lastVerified` is never altered — it
records when a human actually checked.

## Third-party metrics

Domain Rating is recorded on 6 of 64 records, each value carrying its provider
(Ahrefs) and the exact measurement date, presented as a historical snapshot.
Authority Score, estimated traffic and referring-domain counts have no consulted
source and are null across the dataset; they are stated as absent once rather
than rendered as 64 empty tiles. No third-party metric is described as a Google
ranking factor, none is used for ranking, and none is presented as a PetroHrys
figure.

## Honesty guarantees enforced by tests

- No page claims a field is empty dataset-wide while any record populates it.
- Every `"the X factor"` phrase resolves to one of the ten declared factors.
- No published count of a submission model contradicts the registry.
- No prose spells out a dataset count as a word.
- The published verification cadence matches the scheduler.
- A never-established value is never emitted as a confirmed negative.
- No statutory register is labelled "Free to submit".
- No category with zero verified records is published anywhere.
- No table renders a column whose rows are all empty.
- Every sort option maps to a visible column and a real sort key.
- The sitemap equals exactly the indexable page set.
- Two consecutive builds are byte-identical.

## Statutory registers

`submissionModel: notApplicable` — "Not a submission target" — records that a
directory has no submission route at all: the entry exists because of
incorporation, registration, filing or another statutory process. It is not a
pricing tier and is excluded from every free / paid / freemium / unknown count,
and from both sides of the free-to-submit filter. Applied to 14 records after
confirming the actual listing mechanism in each case, never because a site is
government-operated.

## Filtering

Tri-state throughout. Each `accepts` flag and the free-submission filter resolve
to `true`, `false` or `null`, and rows carry `yes` / `no` / `unknown`. A positive
filter matches only confirmed records; records whose eligibility was never
established are excluded from the match but never presented as a negative. Each
filter shows its confirmed and unknown counts, and the fieldset states the rule
in words.

## Indexability

A detail page is indexed when it carries a substantive verified evidence package:
unique name and description, correct scope and category, an official HTTPS
destination, a PetroHrys Score with the complete ten-factor breakdown, a
verification date, source and named reviewer, and meaningful pros or cons.
Curated relations and guide links are valuable but explicitly optional. All 64
records satisfy the contract. Records that fail become `noindex,follow`, keeping
the page and every link on it while leaving the sitemap.

## Release closed

| | |
|---|---|
| v1 PR | **#16** — merge commit `b4b4074` |
| Canonical hotfix PR | **#17** — merge commit `51517be` (fix commit `f5a6e60`) |
| Final production `main` | **`51517be`** |
| Canonical host | **`https://petrohrys.com`** (apex) |
| Production verified | 2026-08-04 |

Production verification swept **all 129 URLs** in
`sitemap-business-directories.xml`: every one returned HTTP 200 with **zero
redirect hops**, contained **zero `www` absolute URLs**, and carried a canonical
identical to its own URL. Sitemap 129 `<loc>`, RSS 64 items, `robots.txt`
advertising both sitemaps on the apex. Canonical, Open Graph, JSON-LD and
BreadcrumbList URLs are apex on every page checked.

Why the hotfix was needed: production serves the apex and 301-redirects
`www.petrohrys.com` to it, but the section had been built to canonicalise to
`www`. Every page self-referenced a URL that does not serve and every sitemap
entry redirected. The host now lives in exactly one place — `ORIGIN` in
`scripts/lib/bd-seo.cjs` — and five tests fail if it moves back.

### Site-wide legacy canonical follow-up (open)

The `www` canonical is **not** specific to this section, and the rest of the site
was deliberately left alone rather than mixed into a hotfix:

| Scope | State |
|---|---|
| Non-BD editorial pages | 192 `www` canonicals, 1 apex |
| Root `sitemap.xml` | 56 locs already apex — disagrees with the pages it lists |
| Open Graph outside BD | 175 `www` |
| JSON-LD outside BD | 166 `www` |
| hreflang | 198 of 200 tags on `www` |

Those pages are hand-written with no central URL source, so normalising them is
its own change with its own verification.

## Deferred work

- **Verification backlog** — 31 candidates blocked by bot walls, consent gates or
  JS-only rendering, plus 5 rejected outright. Recorded in
  `docs/business-directories-verification-backlog.md` as a costed manual queue.
- **Score factor definitions** need owner confirmation on three points:
  `verificationQuality` and `moderationQuality` carry identical values on 59 of
  64 records; `industryImportance` and `businessUsefulness` correlate at r = 0.85;
  and no observable field explains `platformReputation`.
- **Submission facts** — `typicalApprovalTime`, `reviewProcess`, `backlinkType`
  and `requiredAssets` are null on every record. They cannot be established
  without actually submitting a listing, which is Dataset v2 primary research.
- **Promotion** — the section is reachable from `/research/`; footer promotion is
  not yet added.
- **Root sitemap host** — `sitemap.xml` uses the apex host while this section
  uses `www`. Pre-existing and out of scope here.

## Rollback

All HTML under `research/business-directories/` is generated and
manifest-owned; nothing there is hand-edited. To roll back, revert the merge
commit on `main` and redeploy — the section's pages, sitemap, feed and redirect
rules are all reproduced from `data/business-directories/` by
`node scripts/build-business-directories.cjs`. No database, no runtime
dependency and no root `package.json` are involved, so a revert is a pure
content rollback with no migration to undo.
