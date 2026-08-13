# Tender Opportunity Detail Pages v1

**Status: COMPLETE.** 6,817 canonical procurement records published, one route
each, with source provenance, supplier-profile relevance and an explicit
account of what the source did *not* establish.

---

## What a detail page is

The human-readable layer between Discovery and the official notice. Discovery
answers *which tenders exist*; the official notice is authoritative; this page
sits between them and says what was published, where it came from, what we
derived, and what nobody established.

```
canonical corpus ──► detail projection ──► one page per opportunity
                          │                        │
                    to-match.cjs (FROZEN)    official notice (authoritative)
```

## Route identity

```
/research/tenders-procurement/opportunities/{slug}-{canonical-id}/
```

The **canonical opportunity id** is the identity; the slug is cosmetic. A
retitle, a new source occurrence, a status transition, a deadline change and a
value correction all leave the URL untouched — each is covered by a test. Two
opportunities whose titles normalize identically still get different routes,
because the id is in the path.

The rule lives once, in `scripts/lib/to-route.cjs`, a UMD module used by the
generator, the browser and the tests. A second slug implementation is how a
link and the page it points at drift apart.

## One route, not four — and why

The material facts on these pages are **source facts in the source's own
language**: tender title, buyer, dates, classifications, declared value,
source and official URLs. Translating them would be inventing them.

Measured: 9,577 records × 4 locales is **~531 MB** of near-identical files —
eight times the site's entire HTML — differing only in field labels. So v1
publishes **one canonical route**, and the genuinely localized products
(Discovery and Monitoring, EN/DE/ES/FR) all link to it.

Reported accurately: **Discovery and Monitoring are four-locale. Detail pages
are a single root-language shell around source-language procurement facts.**
Because identity is the canonical id and never the English title, localized
shells remain possible later without moving a single URL.

## The three blockers, and how they were resolved

### 1. Phantom hreflang → the renderer can now declare reality

`bd-render.renderPage` always emitted a four-locale cluster, so an earlier run
advertised **20,451 DE/ES/FR URLs that did not exist**.

`renderPage` and `I18N.hreflangCluster`/`switcherFor` now accept
`availableLocales`, defaulting to all four so **every existing caller is
unchanged**. A single-locale page gets *no* cluster — which is the correct
semantics, not an omission: hreflang describes alternate language versions, and
a page with no alternates has nothing to describe. The language switcher is
filtered by the same list, so a reader is never sent to a missing page.

Verified: Discovery hub still emits 5 tags in all four locales; detail pages
emit **0**, with **0** phantom locale links.

### 2. Route policy → a generated family, not 6,817 rows

`data/route-policy.json` keeps its 20 human-authored `routes` untouched, and
gains `generatedFamilies` — a second, narrower mechanism. One family:

| field | value |
|---|---|
| id | `tender-opportunity-detail` |
| prefix | `/research/tenders-procurement/opportunities/` |
| segments | 1 |
| generator | `scripts/build-tender-detail.cjs` |
| locales | `["en"]` |
| identity | canonical TenderOpportunity id |

Authorization in `scripts/lib/route-family.cjs` needs **three independent
things**: shape (single segment, no nesting, no traversal, no query), declared
locale, and **membership** — the route must be in the set the owning generator
derives from canonical data. Shape alone would authorize any invented id, so it
is deliberately insufficient.

The registry cannot be widened: `validateFamily` rejects a `/` or `/research/`
prefix, wildcards, multi-segment families and families without a reason.

### 3. Route strings in the search index → derive, don't store

Storing a route per record cost **188 KB gzip (+20%)** on a payload every
visitor downloads, to carry information already present. The index now carries
a **one-byte eligibility flag** and the browser derives the route with the
shared rule.

Measured overhead: **+2,035 bytes gzip** (949,302 → 951,337) — 99% less.

## Publication universe

| | count |
|---|---|
| canonical opportunities | 9,577 |
| **published pages** | **6,817** |
| not published | 2,760 |

The rule is the indexability rule, so there is never a page that exists only to
be hidden: current status, meaningful title (≥15 chars), buyer, official URL,
and ≥6 distinct facts. Failures carry reason codes — 2,613 `NOT_CURRENT`,
1,056 `TOO_FEW_FACTS`, 194 `NO_MEANINGFUL_TITLE`, 31 `NO_BUYER`.

**Model B was chosen**: publish what is worth finding, and never delete a URL
once published. Historical records are retained in the projection and simply
stop being crawl targets; nothing is erased when a tender closes, so no URL
churns.

## What the page refuses to say

- **No platform fact restated as a tender fact.** `documentsUrl`,
  `foreignSuppliersAccepted` and `supplierRegistrationRequired` are never read.
  The only platform field consumed is `browserCheckRequired`, which is a
  property of the source surface and is labelled as such. Both limitations are
  stated on every page.
- **No currency conversion.** Values keep the source's currency and basis.
- **No fabricated deadline.** A zoneless date keeps its wording and gets no
  instant; an unparseable one keeps its wording too. A deadline past while the
  source still says OPEN shows **both** facts.
- **No probability of winning.** Supplier matches are relevance to a profile,
  read from the frozen engine, with the engine's own reason codes.
- **No bidding.** Buttons say what their URL does. A platform homepage is never
  labelled a submission route, and the page states that this site is not
  affiliated with the buyer and submits nothing.
- **No search-index dependency.** Discovery's projection truncates descriptions
  at 120 characters; a page built from it would publish a preview as the notice.

## Integration

- **Discovery** — result titles link to the detail page when one exists,
  derived from the id; the official notice stays available separately.
- **Monitoring** — alert rows link to the detail page when one was published
  and fall back to the official notice otherwise, decided by the same
  indexability rule rather than guessed. (0 alerts today, so no rows render.)
- **Related opportunities** — reuse Relevance v1.1 families; a member is linked
  only if its page exists, and each states its own deadline and status.

## Measurements

| | |
|---|---|
| generator runtime | **1.67 s** for 6,817 pages |
| total detail HTML | **112.6 MB** |
| median page | 17,174 B |
| p95 page | 19,199 B |
| largest page | 29,166 B |
| sitemap | 6,817 URLs, **1.14 MB** (limits: 50,000 / 50 MB) |
| Discovery index | 951,337 B gzip (+2,035) |

Site HTML goes from 66.8 MB to ~179 MB. Accepted for v1: no deployment,
memory or generator-latency failure was observed, and 1.67 s is not a build
problem. Projected: **25k opportunities ≈ 290 MB / ~4 s**; **50k ≈ 580 MB /
~9 s** — at which point the sitemap still fits but repository weight becomes
the reason to move to prebuilt shards, not rendering cost.

## Freshness

Phase 5B remains unverified; no page claims a refresh cadence. Copy is "based
on the latest validated procurement snapshot" and "not a live feed".

## Known limitations

- Non-published opportunities have no page; Discovery links them straight to
  the official notice.
- 404 behaviour for unknown ids is the static host's (no file, no route). It is
  asserted structurally — no soft-404 page is generated — but not verified
  against a live deployment.
- Detail pages carry no `hreflang`, by design; revisit only if localized shells
  are ever built.
- No page-change history section: Monitoring owns change events, and
  duplicating them here would fork that product.

## Tests

45 in `scripts/tests/to-detail.test.cjs` — projection rules, publication, SEO,
route-family authorization, derived routing, plus 10 infrastructure mutations.
Suite: **1,997 passing**. Canonical corpus, platforms and match weights
unchanged.
