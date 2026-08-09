# Site-Wide Localization & Design Architecture

State of the site after Phases 2–4 of the localization and design-completion
programme. Every number is derived from the repository; none is carried over
from a previous report.

**Status: SITE-WIDE LOCALIZATION NOT YET COMPLETE.** Phase 2 is finished; Phase 3
is decided but not executed; Phase 4 is diagnosed and guarded but not
implemented. Exact remaining work is in §9.

---

## 1. Locale architecture

One data layer, four presentation layers. `scripts/lib/i18n.cjs` is the single
registry:

| Code | Prefix | `html lang` | `og:locale` |
|---|---|---|---|
| en | *(none)* | en | en_US |
| es | `/es` | es | es_ES |
| fr | `/fr` | fr | fr_FR |
| de | `/de` | de | de_DE |

`t()` throws on a missing key at build time. There is deliberately **no silent
fallback to English**: a page half in two languages is worse than a build that
refuses to finish. `raw()` reads a string without substitution, for audits.

Dictionaries: `data/i18n/{en,es,fr,de}.json`, **223 keys each**, parity asserted.

### Adding a fifth locale

1. Add the entry to `LOCALES` in `scripts/lib/i18n.cjs`.
2. Add `data/i18n/<code>.json` with all 223 keys — the parity test names any missing.
3. Add the locale's legal text to `content/legal/<doc>.<code>.html`.
4. Run the generators. Routes, hreflang clusters, switcher entries, sitemap
   inclusion and prefixed internal links all follow from the registry.

Nothing else is locale-aware by hand. That is the property to preserve.

---

## 2. Design architecture

**One stylesheet: `css/petrohrys.css` (42 KB).** No page-local CSS anywhere on
the site — inline `<style>` blocks went from 19 to 0 and inline CSS from 91,053
bytes to 0.

Primitives are named for the **shape**, not the page that first needed one:

- Long-form documents: `.legal-prose`, `.article-prose`, `.doc-callout`,
  `.doc-box`, `.doc-updated`, `.doc-table`, `.table-wrap`
- Editorial: `.card-grid`, `.card`, `.card-meta`, `.tag`, `.tag--muted`, `.btn`,
  `.btn--primary`, `.btn-row`, `.faq-item`, `.feature-list`, `.cta-panel`,
  `.eyebrow`, `.subtitle`

These 13 editorial primitives replaced **138 distinct page-local class names**.
Tokens only — zero raw colour values, zero new media queries (`.card-grid` uses
`auto-fill` + `min()`, so it is intrinsically responsive rather than
breakpoint-driven).

### One shell, delegated not duplicated

`scripts/lib/bd-render.cjs` owns the header, footer, analytics, fonts and
ecosystem banner. `scripts/lib/page-shell.cjs` assembles static pages and
**imports** those constants rather than restating them; it asserts they exist and
refuses to render a partial shell. `HEADER`/`FOOTER` throw without a translator,
so a caller cannot quietly render English chrome onto a localized page.

---

## 3. Content / presentation split

| Path | Contains |
|---|---|
| `content/legal/*.{en,es,fr,de}.html` | Legal prose, extracted byte-for-byte |
| `content/editorial/*.en.html` | Editorial bodies, extracted byte-for-byte |
| `data/route-policy.json` | Localization disposition per incomplete route |
| `data/localization-backlog.json` | Routes with an English body (ratchet) |

Extraction asserts preservation: visible text, links and images are compared
before and after and the write is refused on any difference. The only text
excluded from the baseline is chrome the shared shell now provides — the legacy
back-link and the `+` glyph inside `.faq-toggle`.

**Legal text is never regenerated from English.** The shipped German text is the
German text of record. Dates are reused verbatim per locale ("15 April 2026",
"15 de abril de 2026", "15. April 2026") rather than reformatted from a parsed
date, so a design migration cannot alter the date on a legal document.

---

## 4. Canonical, hreflang and the host

**The apex is authoritative.** `www.petrohrys.com` 301-redirects to
`petrohrys.com` (verified against the live site). 57 pages were normalized; 0
pages now canonicalize to the redirecting host.

Rules, each guarded:

- Every page is **self-canonical**. A localized page canonicalizing to English
  tells search engines not to index it, discarding the translation.
- hreflang advertises **only locales that exist**. An English-only page emits no
  cluster at all — publishing `/es/blog/…` for a page that 404s is worse than
  publishing nothing.
- Clusters are generated from one list, so a one-way link is not expressible.
- The language switcher is the one element permitted to leave the current
  locale; every other internal link is locale-prefixed.

**Product routes are deliberately unprefixed in the shared footer.** Six product
pages have no localized twin, and linking a German reader to `/de/fax/` would
turn a working page into a 404. A guard documents this as intentional.

---

## 5. Protected factual tokens

Never translated, never rewritten by a presentation change:

platform and company names · URLs and domains · prices · dates · numeric scores ·
Domain Rating values · canonical enum values · submission routes · product names ·
the Data Controller's declared website in the legal documents

Enum **values** stay canonical in the data; only their **labels** are localized,
and only at render time. `NEEDS_BROWSER` remains `NEEDS_BROWSER` internally.

---

## 6. English-leak detection

`scripts/lib/english-leak.cjs` derives its probes by comparing each locale's
value against English. A string that is legitimately identical — "Legal" in
Spanish, "Blog" everywhere — is excluded **by construction**, and a newly added
string is covered automatically. A hardcoded word list would pass today and miss
everything added tomorrow.

The body-parity guard measures what fraction of a German page's body is English
tokens:

| Page class | English-token ratio |
|---|---|
| Hand-translated (`/about/`, `/cv-builder/`, `/invoice-maker/`) | **7–9%** |
| Business Directories, Planner | **100%** |
| Threshold | 85% |

The gap between 9% and 100% is why a ratio works where a word list would not.

---

## 7. Tests and guards

**1,477 tests pass** (1,471 at programme start + 6 new; earlier guards restated
rather than added to).

Mutations applied this programme — **10 applied, 10 caught**:

| # | Mutation | Result |
|---|---|---|
| 1 | Hardcode `About` into the nav | CAUGHT |
| 2 | Drop the locale prefix from the About link | CAUGHT |
| 3 | Remove eSIMky from the footer | CAUGHT |
| 4 | Revert the skip link to English in source | CAUGHT |
| 5 | Disable the missing-translator guard | CAUGHT |
| 6 | Point `/de/privacy/` canonical at the English page | CAUGHT |
| 7 | Add a phantom ES hreflang to an EN-only post | CAUGHT |
| 8 | Revert a canonical to the redirecting www host | CAUGHT |
| 9 | Add an EN-only route with no policy disposition | CAUGHT |
| 10 | Replace a translated DE body with the English one | CAUGHT |

Mutation 10 is the load-bearing one: it reproduces the exact failure this
programme exists to prevent.

### Guards restated rather than appeased

Three guards failed on legitimate changes and were fixed at the rule level:

- Two nav guards inferred **who wrote a file** from the file's **content**. That
  cannot work once a shared shell makes generated and hand-maintained pages
  identical. They now assert one-writer-per-file against ownership derived from
  the generators themselves (`scripts/lib/owned-routes.cjs`).
- The first version of that derivation was itself wrong — it claimed the whole
  `research/` subtree including the hand-authored hub — and the guard caught it.
- A link guard flagged the language switcher's `EN` entry as a locale escape.
  That link is *supposed* to leave the locale; the guard was asserting an
  implementation, and passing it would have meant breaking the switcher.

The product-page semantic baseline was re-based only after confirming all 24
pages differed in canonical/hreflang hrefs alone.

---

## 8. Fallback policy

- **Required UI strings**: no fallback. `t()` throws at build time.
- **Substantive editorial content**: a route is not published in a locale until
  its content exists in that locale. There are no localized shells wrapped
  around English bodies among the pages this programme created.
- The pre-existing exception is the Business Directories / Planner body copy,
  which is declared in `data/localization-backlog.json` rather than hidden.

---

## 9. Known limitations — the honest list

### 9.1 Business Directories and Planner bodies are English (Phase 4, not done)

`scripts/lib/bd-components.cjs` and `scripts/lib/bd-articles.cjs` make **zero
`t()` calls**. Re-derived cost:

| Module | First-party EN strings | Note |
|---|---:|---|
| `bd-components.cjs` | 86 | ~25 locale-free render functions |
| `bd-articles.cjs` | 129 | ~4,283 words of research prose |
| `build-business-directories.cjs` | 50 | |
| `build-distribution-planner.cjs` | 20 | |
| `bd-feeds.cjs` | 2 | |
| **Total** | **287** | |

**402 of 428** fully-covered routes exceed the 85% English-body threshold.
Media & PR (93 `t()` calls) and Marketplaces (32) are correctly localized — the
gap is specific to these two collections.

The previous audit estimated "57 strings / 70 KB". Both were wrong: 57 counted
only markup strings of 9+ characters, and the 70 KB is mostly code, not prose.

### 9.2 Seventeen routes await translation (Phase 3, decided not executed)

Dispositions are recorded in `data/route-policy.json` with measured word counts:
**13,778 English words** across 20 routes, ~41,000 words across three languages.
17 are `LOCALIZE`; 3 are `INTENTIONALLY_EN_ONLY` with stated reasons.

### 9.3 Three localized Research hubs are stale and malformed

`/es/research/`, `/fr/research/`, `/de/research/` are hand-maintained and were
never rebuilt. They have:

- no `<main>` landmark — so their skip link targets `#main`, which does not exist
- no `<h1>` (the English hub has one)
- an English nav with **unprefixed** `/work/`, `/writing/`, `/about/` links
- an English skip link and mobile-menu label
- unbalanced markup (`<header>` never closed)

They should be moved into `build-static-pages` like the legal and editorial
pages. Not attempted here rather than attempted badly.

### 9.4 Localized Research pages are in no sitemap

`sitemap.xml` (124 URLs) + `sitemap-business-directories.xml` (400) cover 524
URLs. Only 26 localized URLs per locale are listed, so roughly **1,251 localized
Research pages are absent from every sitemap**.

### 9.5 No rendered-browser capability

Responsive verification is **structural only** — overflow containers, fixed
widths, intrinsic grids, long DE/FR label handling. No browser QA was performed
and none is claimed.

### 9.6 Pre-existing, not introduced

- `/blog/best-pdf-editor-app-iphone-android/` declares 4 FAQ entries in schema
  against 7 visible. Schema is a *subset* of visible, which is the safe direction
  — it never claims an answer the page lacks.
- 109 pages contain a table without a scroll wrapper.
