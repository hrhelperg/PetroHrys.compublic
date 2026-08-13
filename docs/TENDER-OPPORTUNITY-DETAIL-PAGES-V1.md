# Tender Opportunity Detail Pages v1 — domain layer

**Status: NOT COMPLETE.** The projection, identity/routing rule and
indexability rule are built, tested and committed. **No pages are published.**

Detail pages were generated in full during this phase, measured, and then
withdrawn. What follows is why — the numbers are the deliverable.

---

## What was built

`scripts/lib/to-detail.cjs` — the canonical detail projection:

- **Identity**: the canonical opportunity id, not the title. A retitle, a new
  source occurrence, a status transition, a deadline change and a value
  correction all leave the route untouched; the slug is cosmetic.
- **Indexability**: explicit booleans, never a score — meaningful title (≥15
  chars), buyer, official URL, ≥6 distinct facts, and current status. Each
  failure returns a reason code.
- **Layer separation**: source fact / normalized fact / provenance / derived,
  kept apart so a computed supplier match can never be rendered with the
  authority of a published deadline.
- **Field contract**: every canonical field is consumed or explicitly declared
  unused; a new one throws rather than vanishing.
- **Safety**: only `http(s)` URLs survive projection; titles are copied
  verbatim with no redaction rule that could rewrite them.

Measured over the real corpus: **9,577 records projected in 350 ms, 6,817
indexable, 2,760 not** (2,613 not current, 1,056 too few facts, 194 no
meaningful title, 31 no buyer). No route collisions.

## What was measured, and why publishing stopped

All 6,817 indexable pages were generated and inspected. Four findings, in
order of severity:

### 1. Phantom hreflang — a real defect, 20,451 bad URLs

`bd-render.renderPage` always emits the full four-locale `hreflang` cluster;
it has no option to restrict it. Every generated page therefore advertised
`/de/`, `/es/` and `/fr/` versions of itself that **do not exist** — 6,817
pages × 3 = **20,451 URLs pointing at nothing**. Three existing site guards
caught it. Fixing it means adding locale restriction to `renderPage`, which is
a shared component used by every Research Center page.

### 2. Route policy is built for exceptions, not for thousands

`data/route-policy.json` requires a written disposition for every route that
lacks DE/ES/FR coverage. It currently holds **20** entries, each with a
human-authored reason. English-only detail pages would require **6,817** more.
The registry is an anti-drift guard for a handful of deliberate exceptions;
filling it programmatically would defeat its purpose.

### 3. Weight

| | measured |
|---|---|
| mean page | 18,933 B (median 18,952, max 23,271) |
| shared shell alone | 11,525 B — 61% of a page before it says anything |
| 6,817 indexable, EN only | **123 MB** |
| 9,577 all, × 4 locales | **531 MB** |
| site today | 66.8 MB across 1,767 HTML files |

Publishing the indexable set alone roughly **triples the site's HTML**. Four
locales would be eight times it, for pages whose title, buyer, dates, codes,
currency and URLs are all source facts that must not be translated — that is
near-duplicate content at scale.

Rendering is not the problem: 6,817 pages build in **1.48 s**.

### 4. Discovery integration costs the search payload

Linking Discovery results to detail pages means carrying the route in the
search index — the alternative, re-deriving the slug in the browser, is a
second implementation that can drift. Measured cost: the index grows from
**0.90 MB to 1.11 MB gzip (+188 KB, +20%)** on a payload every visitor
downloads.

## The conclusion

At ~9,600 opportunities with an 11.5 KB shared shell, **per-opportunity static
pages are past the point where this repository's architecture carries them
well**. That is a threshold, not a defect in the design: identity, indexability
and the fact-layer separation are all sound and are committed.

Publishing them needs three decisions that are larger than this phase:

1. **Restrict the hreflang cluster** in `bd-render.renderPage` for
   single-locale routes — a change to a component every page depends on.
2. **Extend the route policy** to express a rule ("this generated family is
   English-only, for this reason") instead of one entry per URL.
3. **Accept ~123 MB of generated HTML**, or reduce the eligible set on a
   product basis — closing-soon only, or matched-profile only — rather than an
   arbitrary cap.

None of those should be decided inside a page-rendering phase.

## What is deliberately NOT in this layer

- **No platform fact restated as a tender fact.** `documentsUrl`,
  `foreignSuppliersAccepted` and `supplierRegistrationRequired` are never read.
  The only platform field consumed is `browserCheckRequired`, which is
  explicitly a property of the source surface.
- **No currency conversion.** Values keep the source's currency and the
  source's own basis word.
- **No fabricated deadline.** A zoneless date keeps its wording and gets no
  instant; an unparseable one keeps its wording too. A deadline past while the
  source still says OPEN keeps **both** facts.
- **No invented industry**, and no match threshold of its own — bands are read
  from the frozen matching engine.
- **No search-index dependency.** The Discovery projection truncates
  descriptions at 120 characters; a detail record built from it would publish a
  preview as though it were the notice.

## Lifecycle (designed, not yet exercised)

Historical records — awarded, cancelled, closed, unknown — are **retained in
the projection and never indexable**. Nothing is deleted when a tender closes,
so no URL churns; the record simply stops being a crawl target.

## Freshness

Phase 5B remains unverified. Nothing here claims a refresh cadence.

## Tests

25 property tests in `scripts/tests/to-detail.test.cjs`, covering identity
stability, route collisions, indexability determinism, the platform/tender
firewall, tri-state preservation, URL-scheme safety, the field contract and
canonical drift. One asserts the tree matches this report: no sitemap, no
per-opportunity directories.

Full suite: **1,977 passing.** Canonical corpus, platforms and match weights
unchanged.
