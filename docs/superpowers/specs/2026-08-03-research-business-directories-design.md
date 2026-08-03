# Research Center → Business Directories

**Date:** 2026-08-03
**Status:** Approved design, ready for implementation planning
**Scope:** Additive only. One new site section. No redesign, no changes to existing colors, typography, spacing, layouts, components, or the homepage.

---

## 1. Context

`PetroHrys.com` is a static HTML site: 64 hand-authored `.html` files, no `package.json`, no build step, deployed on Netlify. Local Node is v24.15.0, so the built-in test runner is available. A HELPERG ecosystem banner is injected into all 64 pages by `scripts/inject-ecosystem-banner.cjs`.

The site runs **two distinct design systems**, confirmed by inspection:

- **Editorial — 8 English pages** (`/`, `/work/`, `/writing/`, `/research/`, `/essays/`, `/ai-systems/`, `/infrastructure/`, `/about/`) plus 12 localised equivalents under `es/`, `fr/`, `de/`. These load `css/petrohrys.css` (907 lines, fully token-based) and carry the primary site nav — a desktop `.nav-primary` list and a duplicate inside the `.nav-mobile-panel` `<details>` block.
- **Legacy product/blog — 23 English pages** (product landing pages, blog posts, privacy, terms). These use inline `<style>` blocks and a page-scoped `.top-nav` containing in-page anchors (`#features`, `#use-cases`, `#faq`) plus a "← Back to Petro Hrys" link. They deliberately do not carry the site nav.

Business Directories belongs to the **editorial** system, because `/research/` lives there. Only editorial pages are in scope for nav injection.

The original brief specified Next.js 16 with the App Router. That is incompatible with this repository without either a full 64-page migration or a second deploy target, both of which contradict the brief's own "do not touch existing pages" constraint. The brief's actual *requirements* — static generation, everything prerendered, no client-side fetching, structured-data-driven pages, incremental updates — are all satisfiable without a framework.

## 2. Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Framework | **Static generator script.** Node CommonJS, same pattern as the existing ecosystem-banner injector. |
| 2 | Navigation | **Add one new item, `Research Center`.** `Work`, `Research & Writing`, `About`, and the EN/ES/FR/DE switcher are untouched. Nothing is renamed, removed, or restructured. |
| 3 | URL structure | **Nested under `/research/`.** The existing `/research/` page and its content are preserved. |
| 4 | Empty pages | **Full matrix generated for validation, `noindex,follow` until populated.** Never promoted through sitemap, RSS, prominent internal navigation, or indexable listings. |
| 5 | Nav label | **`Research Center`.** `Research` alone would be ambiguous next to the existing `Research & Writing`. |
| 6 | `/research/index.html` | **One additive section** linking to Business Directories. Content only — no redesign, no removal or rewriting of existing content, no change to colors, typography, spacing, layout, or components. |
| 7 | Localisation | **EN only.** No injection into `es/`, `fr/`, `de/`. No localised routes, no hreflang entries in this phase. |
| 8 | Sitemap apex/www defect | **Flagged as a follow-up, not fixed here.** |

### Branching

Work stacks on `feat/helperg-ecosystem-banner` (current HEAD), because generated page shells must include the ecosystem banner markup that every other page now carries. New branch: `feat/research-business-directories`. This inherits the unmerged banner work; both land together, or the banner lands first.

## 3. Canonical host

Every canonical tag on the site declares `https://www.petrohrys.com/`. **All newly generated pages, canonical tags, Open Graph URLs, structured data, RSS, and sitemap entries use `https://www.petrohrys.com/` consistently.**

**Follow-up issue (out of scope here):** the existing `sitemap.xml` lists 56 apex URLs (`https://petrohrys.com/…`) and `robots.txt` advertises the apex sitemap, while every canonical tag declares `www`. The sitemap therefore advertises non-canonical URLs. This work does not modify `sitemap.xml`. The only permitted edit to `robots.txt` is the additive `Sitemap:` reference to `sitemap-business-directories.xml`.

## 4. Architecture

```
data/business-directories/
  countries.json                 10 country records
  categories.json                21 category records
  schema.json                    validation contract for directory records
  directories/
    united-states.json           [] — empty until real data
    germany.json                 []
    …one file per country

scripts/
  build-business-directories.cjs        JSON → HTML. Idempotent. Supports --country=<slug>.
  validate-business-directories.cjs     Schema + referential + honesty gate.
  lib/
    bd-registry.cjs      load, normalise, cross-link, validate
    bd-sort.cjs          comparators + null-last ordering
    bd-render.cjs        full-document shell (head, banner, nav, breadcrumb, main, footer)
    bd-components.cjs    stat grid, filter bar, sort control, cards, table, chips, pagination, empty state, FAQ
    bd-seo.cjs           canonical, OG, Twitter, JSON-LD builders
    bd-feeds.cjs         sitemap + RSS emitters
  tests/
    *.test.cjs           run with `node --test scripts/tests/`

css/business-directories.css   NEW. Consumes existing tokens only.
js/business-directories.js     NEW. Progressive enhancement only.
```

**No `package.json` at the repository root.** A root manifest would make Netlify auto-detect a build command and could break deploys of a site that currently ships raw files. Node's built-in test runner needs no manifest.

One already exists at `startups-app/package.json` — a pre-existing Next.js 14 + Prisma app in a subdirectory, committed in `9aacd8f`. It does not affect root build detection, is untouched by this work, and is not precedent for adding manifests elsewhere.

**Determinism.** Given unchanged JSON, the generator produces byte-identical HTML. No timestamps are emitted except `lastmod` values that come from the data itself. The writer compares existing file contents before writing, so a no-op rebuild produces an empty git diff. This is the "incremental updates supported" requirement.

**Data maintenance is manual.** No database, no crawler, no external SEO API, no runtime fetching, no scheduled jobs. Records are added by hand to the JSON registry and verified by a human before publication.

## 5. Routing

```
/research/business-directories/                                        hub
/research/business-directories/{country}/                              country
/research/business-directories/{country}/categories/{category}/        category
/research/business-directories/{country}/{directory}/                  directory detail
/research/business-directories/{country}/categories/{category}/page/2/ pagination
/research/business-directories/feed.xml                                RSS
/sitemap-business-directories.xml                                      section sitemap
```

Every page is emitted as `index.html` inside its own folder, matching the site's existing trailing-slash convention.

### Namespace safety

The brief put directories at `{country}/{slug}`, which collides with category slugs — a directory slugged `saas` would fight the SaaS category. Categories are therefore nested under a `/categories/` segment. Directory URLs keep exactly the shape the brief specified. As a second guard, the validator treats all 21 category slugs plus `categories`, `page`, and `feed.xml` as reserved and rejects any directory that claims one.

### Initial scale — lean reference scaffold

The full 10 × 21 matrix is **supported but not emitted**. Only three pages are written in this phase:

1. the hub `/research/business-directories/` — indexable;
2. the reference country `/research/business-directories/united-states/`;
3. the reference category `/research/business-directories/united-states/categories/general-business/`.

Every other country and category page is generated **on demand**, only once the registry holds a real directory record for that route. Directory detail pages exist as a template in code and tests, and are emitted only for real records — so none exist yet. Hundreds of empty HTML files are never created merely to validate routing; the full matrix is exercised through tests instead.

**Pruning:** when a record is removed and a route becomes empty, the generator deletes the now-stale page and any directory left empty. Pruning is confined to `research/business-directories/` and never touches `feed.xml`.

**Un-emitted routes are never linked.** The hub and country pages list them as non-linked "coming soon" text, and they are excluded from `ItemList` structured data. Linking a page that was not written would advertise a 404.

Countries: United States, Germany, United Kingdom, France, Spain, Italy, Canada, Australia, Czech Republic, Poland.

Categories (21, exactly as briefed): General Business, Local Business, SaaS, AI, Telecommunications, Healthcare, Legal, Finance, Construction, Manufacturing, Education, Marketing, Software, Developer, Startup, Government, Industry Associations, Chambers of Commerce, Review Sites, Press Release Platforms, App Directories.

## 6. Data model

35 briefed fields plus one provenance object. Metric fields are **nullable**; `null` means "not yet measured" and renders as `—` or `Not yet verified`. A metric is never defaulted to `0`, because `0` is a claim and `null` is not.

| Field | Type | Notes |
|---|---|---|
| `id` | string | Stable, immutable, globally unique |
| `name` | string | |
| `slug` | string | kebab-case, unique per country, not a reserved word |
| `country` | string | FK → `countries.json` |
| `category` | string | FK → `categories.json` |
| `website` | string | `https://` URL |
| `description` | string | |
| `tier` | enum | `tier1` \| `tier2` \| `tier3` |
| `petroHrysScore` | number \| null | 0–100. **First-party editorial metric.** |
| `domainRating` | number \| null | 0–100. **Third-party metric.** |
| `authorityScore` | number \| null | 0–100. **Third-party metric.** |
| `estimatedTraffic` | number \| null | monthly organic sessions. **Third-party metric.** |
| `referringDomains` | number \| null | **Third-party metric.** |
| `free` | boolean \| null | |
| `paid` | boolean \| null | |
| `verificationRequired` | boolean \| null | |
| `manualReview` | boolean \| null | |
| `acceptsCompanies` | boolean \| null | |
| `acceptsProducts` | boolean \| null | |
| `acceptsSaaS` | boolean \| null | |
| `acceptsApps` | boolean \| null | |
| `acceptsStartups` | boolean \| null | |
| `acceptsAI` | boolean \| null | |
| `backlinkType` | enum \| null | `dofollow` \| `nofollow` \| `sponsored` \| `ugc` \| `mixed` \| `none` |
| `robots` | enum \| null | `allowed` \| `disallowed` \| `partial` \| `unknown` |
| `sitemap` | boolean \| null | directory publishes an XML sitemap |
| `indexed` | boolean \| null | listing pages appear in search results |
| `ssl` | boolean \| null | |
| `lastVerified` | ISO date \| null | |
| `nextVerification` | ISO date \| null | must be later than `lastVerified` |
| `httpStatus` | number \| null | |
| `recommendedIndustries` | string[] | |
| `pros` | string[] | |
| `cons` | string[] | |
| `editorNotes` | string | |
| `metricsProvenance` | object | See below |

### Metric provenance

Third-party metrics are never presented as PetroHrys measurements. Each non-null third-party metric must carry a provider and a measurement date:

```json
"metricsProvenance": {
  "domainRating":     { "provider": "Ahrefs",  "measuredAt": "2026-08-01" },
  "authorityScore":   { "provider": "Semrush", "measuredAt": "2026-08-01" },
  "estimatedTraffic": { "provider": "Ahrefs",  "measuredAt": "2026-08-01" },
  "referringDomains": { "provider": "Ahrefs",  "measuredAt": "2026-08-01" }
}
```

The UI renders these as, for example, `Domain Rating 78 — Ahrefs, measured 2026-08-01`, with a standing note that Domain Rating, Authority Score, estimated traffic, and referring domains are third-party metrics produced by their respective providers, not by PetroHrys.com. The PetroHrys Score is labelled explicitly as a first-party editorial assessment.

### Data-integrity rules

Never invent a directory record, Domain Rating, Authority Score, traffic figure, referring-domain count, pricing, listing availability, backlink type, or verification requirement. Unknown values stay `null` and render as `—` or `Not yet verified`.

## 7. Sorting, filtering, search, pagination

All zero-fetch. Nothing is requested from the network after the HTML loads.

**Default order:** `petroHrysScore DESC` → tie-break `domainRating DESC` → tie-break `name ASC`. Fully deterministic. Null metrics always sort last regardless of direction.

**Optional orders:** Domain Rating DESC, Authority Score DESC, Estimated Traffic DESC, Alphabetical A–Z.

The default order is **prerendered into the HTML**. `js/business-directories.js` reorders DOM nodes that are already on the page — it never fetches an index. With JavaScript disabled the default order stands and every entry remains visible and linked.

**Filters** (free/paid, verification required, accepted entity types, backlink type, tier) act on `data-*` attributes of prerendered rows. Filter state deliberately produces **no URLs**: faceted URL generation on a section this size would open an effectively infinite crawl space for no ranking benefit.

**Search** is a client-side substring match over prerendered name, description, and recommended industries.

**Pagination is DEFERRED and not implemented in this release.**

The current release emits **one page per populated country and category**, with no entry cap. A `pagination()` component exists and is unit-tested, but the generator does not call it and contains no page-size logic. Nothing in the shipped output paginates.

This cannot affect the current release, which contains zero directory records, so no listing can exceed a single page.

**Precondition on the first large directory import:** two findings must be closed together before any substantial data is added —

- **M-a** pagination itself (`/page/2/`, a fixed page size, `rel="prev"`/`rel="next"`, self-referential canonicals);
- **M-b** `directoryTable` currently sorts its own input, so a caller cannot supply an order. Pagination must slice a known sequence, so M-b has to be fixed first or alongside.

Until then, a country or category with many verified entries would render one unbounded page.

## 8. SEO

Every page carries: `<title>`, meta description, canonical, Open Graph (title, description, url, type, site_name, image), Twitter card, and JSON-LD.

| Page | Structured data |
|---|---|
| Hub | `CollectionPage` + `ItemList` (countries) + `BreadcrumbList` + `FAQPage` |
| Country | `CollectionPage` + `ItemList` (categories) + `BreadcrumbList` + `FAQPage` |
| Category | `CollectionPage` + `ItemList` (directories) + `BreadcrumbList` |
| Directory | `WebPage` + `about` → `Organization` + `BreadcrumbList` |

**No `AggregateRating` and no `Review` markup.** The PetroHrys Score is a first-party editorial metric. Emitting it as third-party review markup would be structured-data fabrication and a search-spam-policy violation.

### Outbound link policy

External directory links carry `rel="noopener noreferrer"` and **no `nofollow`**.

This is a curated editorial knowledge base, not a link directory. Each directory page carries original methodology, strengths, limitations, recommendations, and context, so an outbound link is an editorial citation rather than a placement. Nothing here is sold, sponsored, or accepted in exchange for payment, so a blanket `nofollow` would misrepresent the section's nature.

If sponsored or user-submitted listings are ever introduced, `rel` becomes a **per-link** decision — `sponsored` or `ugc` on those specific links only, never a section-wide default. The `backlinkType` field is unrelated: it records how a *directory* treats links to its own listees, and has no bearing on how this site links out.

`ItemList` entries are emitted only for pages that actually exist and are indexable — an empty category is not listed as though it held verified entries.

Breadcrumbs match the site's existing visual `.breadcrumb` pattern and mirror the URL hierarchy:
`Home / Research / Business Directories / United States / SaaS`.

## 9. Indexing and promotion policy

- The **hub is indexable**. It carries genuine methodology, scope, and explanatory content.
- Any **country or category page with zero verified directories** receives `<meta name="robots" content="noindex,follow">`, is excluded from `sitemap-business-directories.xml`, and is excluded from RSS. Links are still followed so the architecture stays crawlable and validatable.
- Empty URLs are **never promoted** through the sitemap, RSS, prominent internal navigation, or indexable listings.
- The hub may present countries and categories as **"coming soon"** where that is genuinely useful for orientation, worded so it never implies that verified listings already exist.
- The moment a verified directory is added to the registry, its country and category pages **flip to indexable automatically** on the next build. No manual bookkeeping.
- Empty states state plainly that entries are published only after manual verification.

**No fabricated content anywhere.** No lorem ipsum, no invented directory names, no placeholder metrics, no example scores.

## 10. Feeds

- **`/sitemap-business-directories.xml`** — a new, separate sitemap containing only indexable section URLs, all with `www` hostnames. The existing `sitemap.xml` is not modified.
- **`robots.txt`** — one added line: `Sitemap: https://www.petrohrys.com/sitemap-business-directories.xml`. Nothing else in the file changes.
- **`/research/business-directories/feed.xml`** — RSS 2.0, newest verified entries first, emitting only verified indexable directories. With no data it is a valid, well-formed, empty channel.

## 11. Design containment

`css/business-directories.css` is a new file that:

- consumes **only** existing custom properties from `petrohrys.css` (`--blue`, `--rule`, `--text-2`, `--s-4`, `--ff-sans`, `--col-wide`, …);
- declares **zero** new color, font-family, font-size, or spacing literals;
- **never** redefines an existing selector — all new rules are namespaced under `.bd-*`;
- is loaded **only** by the new section's pages.

The page shell reproduces the existing header, primary nav, mobile nav `<details>` panel, language switcher, breadcrumb, footer grid, and ecosystem-banner markers **verbatim** from the current pages, so the new section is visually indistinguishable from the rest of the site.

## 12. Navigation injection

A single `<li><a href="/research/">Research Center</a></li>` is inserted into both the desktop `.nav-primary` and the mobile `.nav-mobile-panel .nav-primary` lists, positioned after `Work`.

- Applies to the **8 English editorial pages** that carry `.nav-primary` (`/`, `/work/`, `/writing/`, `/research/`, `/essays/`, `/ai-systems/`, `/infrastructure/`, `/about/`), plus every newly generated Business Directories page.
- The **23 legacy product and blog pages are not touched**. Their `.top-nav` is product-scoped by design — in-page anchors plus a "← Back to Petro Hrys" link — and injecting a site-level item there would break their established pattern.
- No English label is injected into `es/`, `fr/`, or `de/` pages.
- Uses idempotent HTML markers, the same technique as the ecosystem-banner injector, so re-running is safe.
- Sets `aria-current="page"` on the new item for pages inside `/research/`.
- `Work`, `Research & Writing`, `About`, and the language switcher are unchanged. Nothing is renamed, removed, or reordered.

`/research/index.html` gains one new section linking to Business Directories, built from the existing design system and markup patterns. Its existing hero, scope prose, entries, and related sections are untouched.

## 13. Validation and tests

`validate-business-directories.cjs` fails the build on:

- schema violation (type, enum membership, required field, 0–100 range);
- duplicate `id`, or duplicate `slug` within a country;
- a directory slug claiming a reserved word;
- a `country` or `category` reference with no matching registry record;
- `nextVerification` earlier than or equal to `lastVerified`;
- a non-`https` `website`;
- a populated metric on a record with `lastVerified: null` — the honesty gate that prevents unsourced numbers;
- a non-null third-party metric missing its `metricsProvenance` provider or `measuredAt`.

Tests under `scripts/tests/`, run with `node --test scripts/tests/`, cover: registry loading, every sort comparator including null-last behaviour, slug/reserved-word collisions, indexing-policy flips, sitemap and RSS exclusion of empty pages, JSON-LD shape, byte-identical rebuild, provenance enforcement, and confirmation that no generated CSS rule targets an existing site selector.

## 14. Non-goals

- No real directory data in this phase.
- No Next.js, no bundler, no `package.json`.
- No database, no crawler, no external SEO API, no runtime fetching, no scheduled jobs.
- No changes to the homepage, existing pages, existing CSS, or the existing `sitemap.xml`.
- No `es/fr/de` translations, localised routes, or hreflang entries for the section.
- No renaming, removal, or restructuring of any existing navigation item.
- No backend, no forms, no submission flow.

## 15. Risks

| Risk | Mitigation |
|---|---|
| 221 near-empty pages read as thin content | `noindex,follow`, excluded from sitemap/RSS, never promoted in navigation |
| Third-party metrics mistaken for first-party claims | `metricsProvenance` required; provider and date rendered inline; validator enforces |
| Directory/category slug collision | `/categories/` segment + reserved-word validator |
| Netlify detecting a build from a stray manifest | No `package.json` at the repository root |
| Visual drift from the rest of the site | Shell markup copied verbatim; CSS restricted to existing tokens and `.bd-*` namespace |
| Stacking on an unmerged banner branch | Documented; both branches land together, or the banner lands first |
| "Coming soon" wording implying listings exist | Copy reviewed against the data-integrity rules; empty states say entries are published only after manual verification |
| Section undiscoverable from the 23 legacy pages | Accepted this phase. Those pages are product landing pages whose nav is deliberately product-scoped; they already route users back via "← Back to Petro Hrys". Revisit only if the two design systems are ever unified. |

## 16. Acceptance criteria

1. `node scripts/build-business-directories.cjs` generates exactly 3 pages (hub, reference country, reference category), a section sitemap, and an RSS feed. No directory detail page exists.
2. Running it twice produces an empty `git diff` and reports `0 written, 0 pruned`.
3. `node scripts/validate-business-directories.cjs` exits 0.
4. `node --test scripts/tests/` passes.
5. Every generated page validates as HTML and carries canonical, OG, Twitter, and correct JSON-LD, all on `https://www.petrohrys.com/`.
6. The reference country and category pages carry `noindex,follow` and appear in neither sitemap nor RSS. No other country or category page exists on disk.
11. Adding a real record emits its country, category, and detail pages; removing the last record prunes them again. Both directions are covered by tests.
7. `sitemap.xml` and `css/petrohrys.css` are byte-identical. The only edits to existing files are: one nav `<li>` added to each of the 8 English editorial pages, one added section in `/research/index.html`, and one added `Sitemap:` line in `robots.txt`. The 23 legacy pages and all 33 localised pages are byte-identical.
8. Sorting, filtering, and search work with JavaScript enabled and degrade to the prerendered default order without it.
9. No fabricated directory, metric, or placeholder text appears anywhere in the output.
10. No third-party metric is rendered without its provider and measurement date.
