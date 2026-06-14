# PetroHrys.com — Premium Personal Ecosystem Redesign (Phase 2)

**Date:** 2026-06-14
**Repo:** `~/PetroHrys.com` (canonical; remote `github.com/hrhelperg/PetroHrys.compublic`)
**Branch:** `feat/premium-personal-ecosystem` (off `feat/editorial-identity-phase-1.5`)
**Stack:** Static HTML + `css/petrohrys.css`. Fonts: DM Sans / Source Serif 4 / JetBrains Mono. Hosting: Netlify (`_redirects`). No framework, no build step.
**Status:** Approved design (with adjustments). Spec for review before implementation planning.

---

## Goal

Turn the site from a faceless research-institute feel (and the older startup-directory feel) into a **premium personal ecosystem**: fewer top-level tabs, one alive single-page homepage, all products preserved as a curated ecosystem, and restrained human presence distributed across pages — without becoming an influencer portfolio.

**Hard constraints (do not break):**
- All existing product/tool and section URLs stay **live and indexable**.
- WebmasterID / CookieYes / GA unchanged (IDs, endpoints, consent gating).
- SEO URL structure, sitemap, canonical structure preserved; changes are additive.
- Fast static HTML, strong accessibility, no CLS regressions.

---

## Decisions log (resolved with Petro, 2026-06-14)

1. **Photo treatment:** full colour (keeps Phase 1.5 choice). Editorial consistency comes from a uniform **4:5 crop**, shared `object-position`, and the same thin `--rule` border — **not** desaturation. Do not re-propose grayscale.
2. **Section consolidation:** keep the four section pages live + indexable; build a new hub; **no redirects** (zero SEO risk).
3. **Section label:** **"Research & Writing"** (better reflects research-led content). **URL stays `/writing/`** — only the nav label and page H1 use the longer name.
4. **Portraits:** suit anchors `/about/` *and* the small homepage identity chip (the one deliberate repeat, across the two identity surfaces); train → Research & Writing; café → Work.
5. **Civilist mark:** replace the busy star-constellation with the **simpler mark (single white star on a red square)**.

---

## 1. Navigation model

**Top nav — 4 items.** Wordmark `Petro Hrys` = Home, then **Work · Research & Writing · About**. Language cluster (EN/ES/FR/DE) retained, visually separate. Identical set in the mobile `<details>` panel.

**Footer — 4 groups** (rename current "Tools" → "Products"):

| Products | Research & Writing | Index | Legal |
|---|---|---|---|
| PDF Editor, Unzip, Smart Printer, Invoice Maker, Pocket Manager, FAX, TwinPhone, CV Builder, TCG Scanner | Essays, Research, Infrastructure, AI Systems, Artificial Intelligence | Blog, Articles, Sitemap | Privacy, Terms |

The footer is the mechanism that keeps de-navved section + product pages internally linked (preserves link equity; prevents orphaning).

---

## 2. Homepage structure (single premium index)

Replaces the current "01–05 Sections" academic TOC. New order:

1. **Hero** — subtle red mark (`hero-mark`), eyebrow `Petro Hrys`, H1 **"Digital infrastructure builder."**, lede updated to: *"Building and researching search systems, AI architectures, automation, and independent digital products."*
2. **Short positioning** — one warmed-up paragraph (trimmed "Now").
3. **Current Focus** — small mono-label block (new): *search-system indexing · retrieval & LLM surfacing · independent product maintenance.* Compact, scannable, premium.
4. **Selected products** — compact ruled list (~5 picks), one line each → "All work →" (`/work/`). No cards, no App Store badges.
5. **Selected writing** — 2–3 entries → "All writing →" (`/writing/`).
6. **About / personal note** — short first-person note **+ small portrait-2 (suit)** identity chip. The mobile human-presence win.
7. **Contact** — email (unchanged).
8. **Footer** (new 4-group).

---

## 3. Work / products structure (`/work/` — new page)

- Page-hero: H1 **"Work"**, lede *"Independent tools and products — built and maintained solo."*
- **Featured Products** (new, before the full index): 3 highlighted products with a slightly fuller one-liner each. Picks (confirmed): **PDF Editor** (utility/search intent), **CV Builder** (personal/professional identity product), **Invoice Maker** (business/finance utility). Pocket Manager remains in the full index but is not featured.
- **Full product index:** all 9 products as a compact ruled list — name (link) + one-line description. No cards, no badges, no screenshot-heroes.
- **Trust element:** small **portrait-3 (café)** with caption *"Built and maintained by Petro Hrys."*
- Every product keeps its existing URL untouched; `/work/` only links to them.

Draft one-liners (verify each against the product page's own `<title>`/meta during build):

> PDF Editor — Edit, convert, and sign PDFs in the browser · Unzip — Extract archives online, no install · Smart Printer — Wireless printing tools for any device · Invoice Maker — Professional invoices in minutes · Pocket Manager — Lightweight personal-finance tracking · FAX — Send & receive faxes without a machine · TwinPhone — A second number on your existing phone · CV Builder — Clean, ATS-ready résumés fast · TCG Scanner — Scan and value trading-card collections

---

## 4. Research & Writing structure (`/writing/` — new hub)

- Page-hero: H1 **"Research & Writing"**, short lede.
- **Personal note area** with **portrait-1 (train)** — the contemplative shot fits a research/writing page.
- **Categories** linking to the existing (still-live) pages: Essays → `/essays/`, Research → `/research/`, Infrastructure → `/infrastructure/`, AI Systems → `/ai-systems/`, Artificial Intelligence → `/artificial-intelligence/` (the ~1,960-word pillar).
- **Selected / recent** entries list (AI pillar, the globalization essay, blog posts).
- `/writing/` is the umbrella; the four sections become its categories. Nothing deleted.

---

## 5. Fate of Research / Infrastructure / AI Systems / Essays

- **Stay live and indexable** — no `noindex`, **no redirects**.
- Removed from **top nav only**; re-homed under `/writing/` + footer "Research & Writing" group.
- Each gets the new 4-item nav, new footer, and breadcrumb **Home / Research & Writing / [Section]**. Body content unchanged. Self-referential canonicals unchanged.

---

## 6. Civilist mark usage

- **Replace** `images/logo-red.svg` contents in place: red square `#C20203` + one centered white 5-point star (same filename, same `viewBox="0 0 100 100"`). All ~13 references (CSS `hero-mark` / `star-divider` / footer signature, plus the favicon `<link rel="icon">` on every page) update automatically — no markup churn.
- **Regenerate** `images/og-default.png` to match the simpler mark (raster; cannot inherit the SVG change).
- Keep usage **subtle**: `hero-mark` (~54px) homepage-only; `star-divider` (~18px) between sections; footer signature (~15px); favicon; OG. No large star-field visuals, no political/movement framing or copy.

---

## 7. Portrait usage (photography proposal)

### Final placement

| Surface | Photo | Role |
|---|---|---|
| `/about/` (anchor) | **portrait-2 (suit)** | Single strongest portrait; replaces the cramped 3-up trio. |
| Homepage identity chip | **portrait-2 (suit)**, small | Same canonical headshot; brand consistency + mobile presence. |
| `/writing/` personal note | **portrait-1 (train)** | Contemplative, editorial; fits research/writing. |
| `/work/` trust element | **portrait-3 (café)**, small | Warm "a real person makes these tools" signal. |

### Why each works
The suit is the highest-credibility frame, so it anchors `/about/` and the homepage first impression. The train shot is un-posed and reflective — the safest "editorial, not influencer" image, thematically right for Research & Writing. The café shot is warmest/most approachable; small on `/work/` it humanizes the products without tipping into lifestyle. One photo per surface (suit deliberately on the two identity surfaces) fixes the isolation problem.

### Desktop layout
- **About:** two columns — portrait left (~320–360px, 4:5), bio prose right.
- **Homepage identity chip:** portrait left (~150px, 4:5), personal note + "About →" right.
- **Writing personal note:** portrait (~160px) beside short note near top of hub.
- **Work trust:** small portrait (~140px) inline with caption, near the product list.

### Mobile layout
- **About:** portrait stacks **first**, centered, capped ~260px; bio below.
- **Homepage:** identity chip stacks — portrait (~140px) above the note. *Guarantees ≥1 well-placed portrait on mobile.*
- **Writing:** portrait (~140px) above the note.
- **Work:** small portrait (~120px) above the list with caption.

### Treatment
**Full colour.** Editorial consistency via uniform **4:5 crop**, shared `object-position`, same thin `--rule` border (matches current trio), square corners, no filters. Cut one tighter face/shoulders derivative `portrait-3-work.jpg` so the café cup doesn't read "lifestyle."

### Alt text
- About (portrait-2): `Petro Hrys, independent digital-infrastructure researcher and builder.`
- Homepage chip (portrait-2): `Petro Hrys.`
- Writing (portrait-1): `Petro Hrys.`
- Work (portrait-3): `Petro Hrys, who builds and maintains these tools.`

### Performance / CLS
Every `<img>` keeps explicit `width`/`height` + CSS `aspect-ratio` (zero shift), `loading="lazy"` + `decoding="async"` (none is the LCP element — the hero is text + CSS mark). Existing files are 44–72 KB at 480px wide — ample for these restrained display sizes; only the café crop is added.

---

## 8. SEO preservation plan

- **Additive only.** No URL deleted, no redirect added. New URLs: `/work/`, `/writing/` — each with own `<title>`/description/canonical, added to `sitemap.xml` with `lastmod` bumped.
- Section pages keep self-canonicals; kept out of orphan status by footer + `/writing/` links.
- Keep homepage Person/WebSite/Organization JSON-LD; add `BreadcrumbList` to `/work/`, `/writing/`, `/about/`, and the four sections; add `ItemList` on `/work/`.
- Preserve existing `hreflang` alternates where present; new pages EN-only for now (i18n deferred). `robots.txt` and `_redirects` unchanged.
- Preserve the intentional homepage `og:description` divergence (per commit `0e04f1b`).

---

## 9. Analytics preservation plan

Identical `<head>` block, same order, on **every** edited and new page:
1. **CookieYes** consent script (`client_data/af075fab…`).
2. **WebmasterID** — consent-gated (`data-cookieyes="cookieyes-analytics"`), `data-wmid="wm_bktqqtd7heom5nkl"`, endpoint unchanged. Stays internal — no user-facing attribution.
3. **GA** `gtag` `G-4RE6YCJZBD`.

No change to IDs, endpoints, or consent gating. `/work/` and `/writing/` ship with this block from the start.

---

## 10. Implementation steps (ordered)

0. Branch `feat/premium-personal-ecosystem` (done).
1. `css/petrohrys.css`: add components (product list, featured-products, writing-hub list, single-portrait About 2-col, homepage identity chip, current-focus block, work/writing portrait blocks) using existing tokens.
2. Define canonical new **nav + footer** markup once; apply **only to the editorial pages** that already load `petrohrys.css`: `index`, `about`, `research`, `infrastructure`, `ai-systems`, `essays`, plus the two new hubs `work` and `writing`. **Old-design pages stay byte-unchanged** (the 9 product pages, `blog`, `articles`, `privacy`, `terms`, `artificial-intelligence`, `startups*`, `templates`) — they don't load the editorial system; retrofitting them would violate "preserve existing product pages unchanged." They remain reachable + indexed via the new footer's outbound links, exactly as the homepage footer already links them today. *es/fr/de deferred — old template.*
3. Replace `images/logo-red.svg` with the single-star-on-red-square mark; regenerate `images/og-default.png`.
4. Rewrite `index.html` to the new section order (drop 01–05 TOC; add Current Focus; add suit identity chip; update lede).
5. Create `/work/index.html` (Featured Products → full index → café portrait + full analytics head + canonical + JSON-LD `BreadcrumbList`/`ItemList`).
6. Create `/writing/index.html` (train personal note + categories + recent + analytics head + canonical + breadcrumb).
7. Update `/about/index.html`: trio → single portrait-2, 2-col/stacked, new nav/footer, breadcrumb.
8. Update 4 section pages: new nav/footer/breadcrumb only (content untouched).
9. Images: portrait CSS for the contexts; cut `portrait-3-work.jpg` tight crop; dims + lazy + async + alt per §7.
10. `sitemap.xml`: add `/work/`, `/writing/`; bump `lastmod`.
11. **Verify:** grep all pages for the 3 analytics IDs + correct order; confirm no top-nav link to removed sections; confirm every product/section URL still resolves and is footer-linked; HTML validate; responsive at 640px; a11y (alt/contrast/skip link); CLS sanity.
12. Commit incrementally; push branch.

---

## Out of scope (later phases)
- **Unifying old-design pages** (product pages, blog, articles, privacy, terms, artificial-intelligence, startups, templates) under the editorial nav/footer/stylesheet. They stay unchanged this phase.
- es/fr/de localization of the new structure (still old template; broken `/photo1.jpg`).
- Migrating individual blog/article posts into the new nav shell beyond footer linking.
- Any redirect-based consolidation of the section pages.
