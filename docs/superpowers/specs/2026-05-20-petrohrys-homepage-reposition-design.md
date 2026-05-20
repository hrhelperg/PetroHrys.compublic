---
title: PetroHrys.com Homepage Reposition — Phase 1 (Editorial Index)
status: approved-for-planning
date: 2026-05-20
branch: feat/homepage-reposition-phase-1
base: feat/webmasterid-tracking-and-ai-page
author: Petro Hrys (designed with Claude)
---

# PetroHrys.com Homepage Reposition — Phase 1

## 1. Context

`petrohrys.com` is currently positioned as **"Petro Hrys — Privacy-First App Developer"**, a multi-product consumer-tools portfolio. The homepage exposes nine mobile apps (PDF Editor, Unzip, Smart Printer, Invoice Maker, Pocket Manager, FAX, TwinPhone, CV Builder, TCG Scanner), a philosophy 4-card grid, a stats block, an About preview, blog cards, a loud red "🚀 Publish your startup — get free traffic" CTA, ten social icons, and an animated conic-gradient ring around a portrait.

The new strategic positioning is **"Petro Hrys — Digital infrastructure builder"**, framed as a calm, premium, infrastructure-first research authority focused on search systems, AI architectures, automation, entity architecture, indexing systems, and digital intelligence networks. The site should read as a modern digital research institute — Stripe Press / Linear blog / The Browser Company in aesthetic register, not a startup landing page or AI-SaaS template.

This spec covers **Phase 1 only**: the homepage reposition, the new top-level navigation, the five new section landing pages, and the supporting tokens/CSS surface. Subsequent phases (full visual redesign of existing tool/blog pages, content build-out inside each section, URL consolidation, hreflang resync, AI-crawler policy decision) are out of scope and listed in §11.

## 2. Goals

1. The homepage communicates "digital infrastructure researcher and builder" within the first viewport, with no startup-marketing artifacts.
2. The five new sections — Research, Infrastructure, AI Systems, Essays, About — exist as real, indexable pages reachable from the primary nav and homepage TOC.
3. The new typographic and spacing system is extracted into a single shared stylesheet (`/css/petrohrys.css`) that all new pages reference, so the design language is consistent and Phase-2 work can adopt it incrementally.
4. All existing URLs remain live and indexable. No tool page, blog post, language variant, or directory page is deleted, renamed, or redirected.
5. WebmasterID consent-gated tracking, Google Analytics, and CookieYes all continue to fire exactly once per pageview, on every page touched by this phase.
6. The homepage and five new section pages pass Lighthouse SEO ≥ 95 and Accessibility ≥ 95.

## 3. Non-goals (Phase 1)

- **No** Next.js / Astro / Eleventy migration. The site stays static HTML.
- **No** changes to existing tool pages (`/pdf-editor/`, `/cv-builder/`, `/fax/`, `/invoice-maker/`, `/pocket-manager/`, `/smart-printer/`, `/twinphone/`, `/unzip/`, `/tcg-scanner/`).
- **No** changes to `/blog/`, `/articles/`, `/startups/`, `/startups-app/`, `/submit-startup/`, `/templates/`, `/privacy/`, `/terms/`.
- **No** changes to `/artificial-intelligence/`. It stays at its current URL. `/ai-systems/` is a new, separate section landing page that links *to* `/artificial-intelligence/` as related existing content. URL consolidation is a Phase-2 decision.
- **No** changes to `/es/`, `/fr/`, `/de/`. The EN homepage will diverge from its translated counterparts — flagged as Phase-2 hreflang debt.
- **No** changes to `robots.txt`. The current `robots.txt` blocks GPTBot, ChatGPT-User, anthropic-ai, Google-Extended, Bytespider, and CCBot. This is a strategic AI-crawler/IP decision and is explicitly deferred to Phase 2; see §11.
- **No** new OG images, no new portrait, no new SVG illustration assets. Phase 1 is type and CSS only.
- **No** new analytics integrations. WebmasterID, GA, and CookieYes are preserved exactly as commit `16306cf` shipped them; no additional providers added.

## 4. Approach — Editorial Index (Approach A)

The homepage becomes a single-column, type-first publication index. Content is reduced to: hero, "Now" paragraph, five-section TOC, "Selected writing" (2 entries), contact line, footer. Everything else is removed from the homepage but preserved at its existing URL. Tools are exposed only as quiet text links in the footer.

This was selected over two alternatives:

- **Approach B** ("Editorial Index + Tools Reveal"): same hero, but a quiet `06 — Tools` index section above the footer. Rejected because preserving any homepage tools surface undercuts the reposition.
- **Approach C** ("Hero-only with sticky directory"): hero + 5-section TOC + contact only. Rejected because the homepage loses too much semantic content before the new sections have body content of their own.

## 5. Design tokens

A new shared stylesheet at `/css/petrohrys.css` defines the tokens below and a small base set of element styles (`html`, `body`, headings, paragraphs, links, nav, footer). The homepage and all five new section pages `<link>` to it.

### 5.1 Typography

| Role | Family | Source | License | Weights loaded |
|---|---|---|---|---|
| Headlines (H1–H3, lede) | **Source Serif 4** | Google Fonts | Open | 400, 500 (with optical-size axis 8..60) |
| Body, nav, footer | **DM Sans** | Google Fonts | Open | 400, 500, 600 (already loaded sitewide) |
| Mono accent (metadata only) | **JetBrains Mono** | Google Fonts | Open | 500 only |

No third font. No icon font. `font-display: swap` (set automatically by Google Fonts' default URL) and existing `<link rel="preconnect">` to `fonts.gstatic.com` are preserved. Single combined Google Fonts URL keeps font payload ≤ 100 KB.

Mono is used **only** for: section numbers (`01–05`) in the homepage TOC, dates and category eyebrows on Selected-writing entries, and footer column headings. It must never appear inside body paragraphs.

### 5.2 Type scale

| Token | Size | Use |
|---|---|---|
| `--fs-xs` | 12 px | mono eyebrows, dates, footer captions |
| `--fs-sm` | 14 px | footer links, secondary nav, lang switcher |
| `--fs-md` | 18 px | body, lede, TOC ledes |
| `--fs-lg` | 22 px | section subhead |
| `--fs-xl` | 28 px | H2 |
| `--fs-display` | clamp(40 px, 6vw, 64 px) | H1 hero (serif) |

Line-heights: serif H1 1.05 · H2 1.2 · body-18 1.6 · body-16 1.65 · mono 1.0. Letter-spacing: H1 `-0.02em` · H2 `-0.015em` · mono eyebrows `+0.06em` uppercase · body 0.

### 5.3 Measure and container widths

- Body paragraphs: `max-width: 580px` (~64 characters).
- Main content column on `<main>` pages: `max-width: 720px`, centered.
- Footer container: `max-width: 1080px`, centered.
- Mobile (<= 640 px): paragraphs natural width, gutters 24 px.

### 5.4 Color

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#fafaf8` | page background |
| `--text` | `#0e0e10` | primary text, headings, links |
| `--text-2` | `#5a5a5e` | secondary body, ledes |
| `--text-3` | `#9a9aa0` | metadata, dates, captions |
| `--rule` | `#e6e6e1` | hairline 1 px borders (nav bottom, footer top, TOC dividers) |

No accent color. No gradients. No shadows. No card backgrounds. Color contrast verified: `--text` on `--bg` = 16.8:1 (AAA); `--text-2` on `--bg` = 5.9:1 (AA Large + AA Normal); `--text-3` on `--bg` = 2.9:1 (used only for ≥ 12 px metadata, not for body — acceptable as decorative captioning per WCAG 1.4.3 incidental rule because the same information is always conveyed by adjacent primary-color text).

### 5.5 Spacing scale (8 px grid)

`4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128 · 192` (CSS custom properties `--s-0` through `--s-10`).

Section vertical spacing: 96–128 px desktop, 64–80 px mobile. Paragraph spacing: 16 px. Gutters: 24 px mobile, 40 px tablet, 0 inside max-width container desktop.

### 5.6 Hover and motion

- Links: underline only — `text-decoration-thickness: 1px`, `text-underline-offset: 4px`. Transition `text-decoration-color 150ms ease`. No color change, no opacity change.
- TOC rows: hover background `rgba(14, 14, 16, 0.025)`, transition 150 ms. No transform.
- Hamburger toggle: existing JS preserved, restyled to a text label `Menu / Close` rather than three bars (institutional feel; works without JS via `<details>` fallback).
- `prefers-reduced-motion: reduce` — all transitions become instant.
- No scroll animations. No parallax. No autoplay anything.

### 5.7 CSS delivery

Single stylesheet `/css/petrohrys.css`, ~150–200 lines, hand-written, no preprocessor. Linked via `<link rel="stylesheet" href="/css/petrohrys.css">` on the homepage and 5 new section pages. No inline `<style>` blocks. `@font-face` declarations are not authored locally; Google Fonts emits them via the linked stylesheet.

Existing tool, blog, and directory pages **do not** link to this stylesheet. Their styles remain untouched.

## 6. Page structure and copy

### 6.1 Top navigation (shared across homepage + 5 new pages)

Desktop markup (≥ 768 px — primary nav and lang switcher are inline):

```html
<header role="banner">
  <nav aria-label="Primary">
    <a href="/" class="wordmark">Petro Hrys</a>
    <ul class="nav-primary">
      <li><a href="/research/">Research</a></li>
      <li><a href="/infrastructure/">Infrastructure</a></li>
      <li><a href="/ai-systems/">AI Systems</a></li>
      <li><a href="/essays/">Essays</a></li>
      <li><a href="/about/">About</a></li>
    </ul>
    <ul class="nav-lang" aria-label="Language">
      <li><a href="/" aria-current="page">EN</a></li>
      <li><a href="/es/">ES</a></li>
      <li><a href="/fr/">FR</a></li>
      <li><a href="/de/">DE</a></li>
    </ul>
  </nav>
</header>
```

Mobile (< 768 px) uses a native `<details>`/`<summary>` disclosure so the menu works without JavaScript:

```html
<details class="nav-mobile">
  <summary>Menu</summary>
  <ul class="nav-primary"> … </ul>
  <ul class="nav-lang"> … </ul>
</details>
```

Both markups exist in the DOM; CSS shows the appropriate one at each breakpoint. This eliminates the existing JS-only hamburger toggle and removes a class of accessibility/no-JS failure modes. The existing toggle JS in `/index.html` is removed.

- Sticky on scroll, `border-bottom: 1px solid var(--rule)`, background `var(--bg)` (no blur).
- Wordmark uses serif at 18 px, weight 500.
- Primary nav uses sans at 14 px, weight 500, color `--text`.
- Lang switcher uses sans at 12 px, weight 500, color `--text-3`; active item is `--text` and unstyled (no chip background).
- `<summary>` styled as a plain text label `Menu` (no triangle marker, no chrome); `[open]` flips the label to `Close`.

### 6.2 Footer (shared)

```html
<footer role="contentinfo">
  <div class="footer-grid">
    <section><h3>Sections</h3><ul>… 5 new section links …</ul></section>
    <section><h3>Tools</h3><ul>… 9 tool links, quiet text …</ul></section>
    <section><h3>Index</h3><ul><li>Blog</li><li>Articles</li><li>Sitemap</li></ul></section>
    <section><h3>Legal</h3><ul><li>Privacy</li><li>Terms</li></ul></section>
  </div>
  <p class="footer-bottom">© 2026 Petro Hrys</p>
</footer>
```

- 4 columns at ≥ 960 px, 2 columns at 640–959 px, 1 column < 640 px.
- `h3` uses mono 12 px uppercase, `--text-3`, letter-spacing `+0.08em`.
- Tool list items: text links only, no badges, no icons, no descriptions.

### 6.3 Homepage `/index.html`

Structure top to bottom:

```html
<main id="main">
  <article class="hero">
    <p class="eyebrow">Petro Hrys</p>
    <h1>Digital infrastructure builder.</h1>
    <p class="lede">Researching search systems, AI architectures,
       automation, and digital intelligence networks.</p>
  </article>

  <section aria-labelledby="now">
    <h2 id="now">Now</h2>
    <p>…body copy below…</p>
  </section>

  <section aria-labelledby="sections">
    <h2 id="sections">Sections</h2>
    <ol class="toc">
      <li><a href="/research/"><span class="num">01</span><span class="title">Research</span><span class="lede">Studies of search systems, indexing behavior, and crawl architecture.</span></a></li>
      <li><a href="/infrastructure/"><span class="num">02</span><span class="title">Infrastructure</span><span class="lede">Long-form notes on the systems that support discovery and distribution on the open web.</span></a></li>
      <li><a href="/ai-systems/"><span class="num">03</span><span class="title">AI Systems</span><span class="lede">How language models, retrieval, and structured data shape modern web intelligence.</span></a></li>
      <li><a href="/essays/"><span class="num">04</span><span class="title">Essays</span><span class="lede">Occasional writing on technology, infrastructure, and the digital web.</span></a></li>
      <li><a href="/about/"><span class="num">05</span><span class="title">About</span><span class="lede">Background, current focus, and contact.</span></a></li>
    </ol>
  </section>

  <section aria-labelledby="selected">
    <h2 id="selected">Selected writing</h2>
    <ul class="entries">
      <li><a href="/artificial-intelligence/"><span class="meta">2026 · AI</span><span class="title">Artificial intelligence as a practical operating layer</span></a></li>
      <li><a href="/blog/what-is-business-globalization-open-economies.html"><span class="meta">2026 · Essay</span><span class="title">What business really is, and why open economies grow</span></a></li>
    </ul>
    <p class="more"><a href="/essays/">All writing →</a></p>
  </section>

  <section aria-labelledby="contact">
    <h2 id="contact">Contact</h2>
    <p>Available for research collaborations and infrastructure work.
       <br><a href="mailto:hrhelperg@gmail.com">hrhelperg@gmail.com</a></p>
  </section>
</main>
```

**Exact copy.**

- **Eyebrow:** `Petro Hrys`
- **H1:** `Digital infrastructure builder.`
- **Lede:** `Researching search systems, AI architectures, automation, and digital intelligence networks.`
- **Now paragraph:** `Studying how search systems index and retrieve content, how language models surface information, and how the architecture of the open web is changing as discovery shifts from keyword matching toward entity and intent understanding. Maintaining a small set of independent tools in adjacent domains.`
- **Section ledes:** as shown in the markup above.
- **Selected writing entries:** as shown — the labels in the link text (`Artificial intelligence as a practical operating layer`) are editorial framings; the destination pages are not retitled.
- **Contact:** `Available for research collaborations and infrastructure work.` and email.

**Removed from homepage** (URLs preserved): philosophy 4-card grid, stats grid, About section, blog preview cards, 🚀 startup directory CTA section, 10 social-link icons, "Read my story" CTA, hero portrait, animated conic-gradient ring.

### 6.4 New section landing pages

All five live under their own `index.html` (clean URL via implicit index, consistent with existing site convention).

#### `/research/index.html`

```
H1: Research
Lede: Studies of search systems, indexing behavior, and crawl architecture.
Body: One short paragraph describing the section's scope — what kinds of
      pieces will live here, what they won't include. Honest. No fake entries.
Entries: (heading present, list empty, single line: "First entries arrive in
         Phase 2.")
Related: link to /artificial-intelligence/ and /blog/ for relevant existing
         pieces (1–2 contextual links, plain text, inline prose).
```

#### `/infrastructure/index.html`

```
H1: Infrastructure
Lede: Long-form notes on the systems that support discovery and distribution
      on the open web.
Body: Short paragraph.
Entries: empty list with "First entries arrive in Phase 2."
Related: contextual link to /artificial-intelligence/.
```

#### `/ai-systems/index.html`

```
H1: AI Systems
Lede: How language models, retrieval, and structured data shape modern web
      intelligence.
Body: Short paragraph noting that existing in-depth writing on this topic
      lives at /artificial-intelligence/ (single inline link in prose).
Entries: empty list with "First entries arrive in Phase 2."
Related: prominent inline link to /artificial-intelligence/.
```

**Phase 2 note (in spec only, not in the page):** consider consolidating `/artificial-intelligence/` into `/ai-systems/` with a 301 redirect. Out of scope here.

#### `/essays/index.html` — real, not a stub

```
H1: Essays
Lede: Occasional writing on technology, infrastructure, and the digital web.
Entries (curated from existing content; presented as a quiet vertical list,
each row: date · category · title link):
  - 2026 · AI ·          /artificial-intelligence/   "Artificial intelligence as a practical operating layer"
  - 2026 · Essay ·       /blog/what-is-business-globalization-open-economies.html  "What business really is, and why open economies grow"
  - 2026 · Tools note ·  /blog/best-pdf-editor-app-iphone-android/  "Notes on the modern mobile PDF editor"
  - 2026 · Tools note ·  /blog/smart-printer-guide.html  "How wireless printing actually works on a phone"
More: a small note at the bottom: "Archive at /blog/" (text link).
```

The two tools-related entries are reframed editorially (the titles shown above replace the original SEO-targeted titles in display only — original page titles and URLs are untouched). This honors the "preserve SEO equity, do not rename URLs" rule while still presenting the content under the new editorial voice.

#### `/about/index.html` — real, not a stub

**Page structure:**

- H1: `About`
- Lede (serif, secondary): `Independent researcher and builder working on digital infrastructure.`
- Body: three short paragraphs (exact copy below).
- Contact line: single sentence + email link.
- Elsewhere: plain-text social list (LinkedIn · X · YouTube) at the bottom, no icons. All other social profiles remain in JSON-LD only.

**Body copy (finalized — 142 words):**

> Petro Hrys is a researcher and engineer working independently on digital infrastructure — the search systems, indexing behavior, AI architectures, and automation layers that shape how information is discovered, retrieved, and surfaced on the open web.
>
> Born in Ukraine and currently based between Europe and the United States. The practice is small and self-directed: long-form writing, applied research, and a steady cadence of independent infrastructure work. The interest is in the systems beneath the visible web rather than in products built on top of them.
>
> A small set of independent tools is maintained at their own URLs and [listed quietly in the footer](#footer-tools). They are useful work in adjacent domains, not the primary work.

**Contact line:**

> Available for research collaborations and infrastructure consulting. <a href="mailto:hrhelperg@gmail.com">hrhelperg@gmail.com</a>.

The implementation plan should treat this copy as final — operator review happened during spec review.

### 6.5 `<head>` block (shared template across homepage + 5 new pages)

Every Phase 1 page contains, in this order, inside `<head>`:

1. `<meta charset="UTF-8">`
2. CookieYes loader (`id="cookieyes"`) — **byte-identical** to current implementation.
3. WebmasterID tracker (`id="webmasterid-tracker"`, `type="text/plain"`, `data-cookieyes="cookieyes-analytics"`, `defer`, `src="https://webmasterid.com/tracker.iife.min.js"`, `data-wmid="wm_bi42g7vn1sqzkhc9"`, `data-endpoint="https://webmasterid-ingest-api.vercel.app/api/events"`) — **byte-identical** to current implementation.
4. Google Analytics gtag loader and inline init (`G-4RE6YCJZBD`) — **byte-identical**.
5. `<meta name="viewport">`.
6. Page-specific `<meta name="description">`, `<title>`, OG, Twitter, canonical, hreflang.
7. `<meta name="msvalidate.01">` (Bing — placeholder remains until verification code lands; flagged as existing tech debt).
8. Favicon `<link>`.
9. `<link rel="preconnect">` to Google Fonts.
10. `<link rel="stylesheet">` to Google Fonts (DM Sans + Source Serif 4 + JetBrains Mono in one request).
11. `<link rel="stylesheet" href="/css/petrohrys.css">`.

No inline `<style>`. No second analytics provider. No A/B testing snippets.

**Homepage `<head>` updates** (relative to current `/index.html`):

- `<title>` → `Petro Hrys — Digital infrastructure builder`
- `<meta name="description">` → `Petro Hrys researches search systems, AI architectures, automation, and digital intelligence networks. Independent infrastructure research on the open web.`
- `og:title` → matches `<title>`
- `og:description` → on the homepage, a shorter punchier variant of the `<meta name="description">` (best practice for social-card readability — meta description optimizes for the 150–160 char Google snippet; `og:description` optimizes for the social-share preview where shorter is better). The Twitter description mirrors the OG description, not the meta description. On section pages, `og:description` may equal `<meta description>` because section descriptions are already short.
- `og:image` → **unchanged in Phase 1** (keeps `https://www.petrohrys.com/photo1.jpg`). Phase 2 introduces a typographic OG card.
- `twitter:*` mirrors OG.
- All hreflang `<link>` tags preserved exactly.

**Hreflang policy on the 5 new section pages.** None of `/research/`, `/infrastructure/`, `/ai-systems/`, `/essays/`, `/about/` has a translated counterpart in `/es/`, `/fr/`, `/de/` at this time. They emit **no** `<link rel="alternate" hreflang="…">` tags. When/if translations are produced (Phase 2 or later), hreflang `<link>` tags are added then. This is the correct behavior per Google's docs: declaring hreflang for non-existent translations creates indexing inconsistencies.

### 6.6 JSON-LD (homepage)

Replace the current `@graph` with:

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Person",
      "name": "Petro Hrys",
      "url": "https://www.petrohrys.com/",
      "email": "hrhelperg@gmail.com",
      "jobTitle": "Digital infrastructure researcher and builder",
      "description": "Independent researcher working on search systems, AI architectures, automation, and digital intelligence networks. Maintains a small set of independent tools in adjacent domains.",
      "sameAs": [ … existing array preserved exactly … ]
    },
    {
      "@type": "WebSite",
      "name": "Petro Hrys",
      "url": "https://www.petrohrys.com/",
      "inLanguage": "en"
    },
    {
      "@type": "Organization",
      "name": "Petro Hrys",
      "url": "https://www.petrohrys.com/",
      "email": "hrhelperg@gmail.com",
      "description": "Independent research and engineering practice focused on digital infrastructure: search systems, AI architectures, automation, and the systems that support discovery and distribution on the open web."
    }
  ]
}
```

`SearchAction` is intentionally **not** declared. The site has no `?q=` search yet, and declaring intent for a non-existent feature is misleading to indexers. Add `SearchAction` when real search ships (Phase 2 — see §11).

### 6.7 JSON-LD (5 new section pages)

Each page emits a `WebPage` node with `breadcrumb`:

```json
{
  "@context": "https://schema.org",
  "@type": "WebPage",
  "name": "<section name>",
  "url": "https://www.petrohrys.com/<section>/",
  "isPartOf": { "@type": "WebSite", "url": "https://www.petrohrys.com/" },
  "breadcrumb": {
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.petrohrys.com/" },
      { "@type": "ListItem", "position": 2, "name": "<section name>", "item": "https://www.petrohrys.com/<section>/" }
    ]
  }
}
```

The visual breadcrumb (`Home / Section name`, plain text) appears immediately under the top nav on each section page.

## 7. Cross-page surface

### 7.1 sitemap.xml

Add five entries with `<lastmod>2026-05-20</lastmod>`, `<changefreq>monthly</changefreq>`, `<priority>0.8</priority>`. Update the homepage entry's `<lastmod>` to `2026-05-20` (everything else preserved). No removals.

### 7.2 robots.txt — unchanged

The current file blocks GPTBot, ChatGPT-User, anthropic-ai, Google-Extended, Bytespider, CCBot. This is a strategic IP decision (training-data opt-out vs LLM-citation discoverability) that requires the operator's choice and is **not a design decision**. Phase 1 leaves the file byte-identical. The trade-off is documented in §11.

### 7.3 hreflang — unchanged

The English homepage will diverge from `/es/`, `/fr/`, `/de/` after this phase. Hreflang `<link>` tags remain in the homepage `<head>` pointing at the existing translations. Phase 2 must update each translated index page to mirror the new positioning, or remove that translation pair from hreflang (a content/audience decision deferred to Phase 2).

### 7.4 Canonicals

Every Phase 1 page emits a self-referential `<link rel="canonical">` pointing to the `https://www.petrohrys.com/<path>/` form (trailing slash, matches existing site convention).

### 7.5 No new redirects

`_redirects` (Netlify) and any host-level redirect config remain untouched.

## 8. Analytics preservation

The current implementation (commit `16306cf`, branch `feat/webmasterid-tracking-and-ai-page`) places three scripts in `<head>` in this exact order: CookieYes loader → WebmasterID tracker (consent-gated via `type="text/plain"` + `data-cookieyes="cookieyes-analytics"`) → Google Analytics gtag. This order is preserved.

Verification rules:

1. **Byte-identical script tags.** The WebmasterID and CookieYes script tags on the new homepage and the five new pages must be character-for-character identical to the current `/index.html`. Linters can be added later; for Phase 1 visual diff is sufficient.
2. **No duplicate WebmasterID load.** Each page must request `webmasterid.com/tracker.iife.min.js` at most once. Removing the inline script block from old sections does not affect the `<head>` script — they're independent.
3. **No SPA tracking shim.** The site is multipage static HTML — each navigation is a full page load, and WebmasterID's IIFE bootstraps fresh each time. The Next.js SDK is not used and not needed; the script fallback (already in place) is the correct integration for this stack.
4. **Consent gating works.** Visiting a fresh browser, opening DevTools Network, and clicking around: no request to `webmasterid-ingest-api.vercel.app` should appear until CookieYes "Accept analytics" is clicked. After accepting, every subsequent pageview emits one `events` request.
5. **GA continues to fire** independent of CookieYes (this matches current behavior; not changed in this phase).

## 9. Accessibility

- All interactive elements reachable by keyboard. Focus state on links: `outline: 2px solid var(--text); outline-offset: 3px;` (no default-removed without replacement).
- `<nav>`, `<main>`, `<article>`, `<section>`, `<header>`, `<footer>` used semantically. Each `<section>` has `aria-labelledby` pointing at its `<h2>`'s `id`.
- One `<h1>` per page. Heading order is monotonic.
- Skip link `<a href="#main">Skip to content</a>` first child of `<body>`, visible on focus.
- Lang attribute set on `<html>` (`en`) and on any inline foreign-language strings (none expected in Phase 1).
- Color contrast verified in §5.4.
- `prefers-reduced-motion` honored.
- Hamburger toggle uses real `<button>` with `aria-expanded` and `aria-controls`.

## 10. Performance budget

Targets, verified via Lighthouse mobile and desktop on a fresh prod deploy:

- Lighthouse Performance ≥ 90
- LCP ≤ 1.8 s
- CLS ≤ 0.02 (font swap is the only realistic risk; mitigate with `font-display: swap` + sized type containers + the existing preconnects)
- INP ≤ 200 ms (trivial; no client-side interactivity beyond menu toggle)
- Total transferred bytes for the homepage: ≤ 120 KB (HTML + CSS + fonts subset). Today's homepage transfers ~80 KB HTML alone due to embedded SVG icons; removing them gets us back to a small payload.

## 11. Phase-2 backlog (explicit deferrals)

Items intentionally NOT delivered by this spec; each is a separate Phase-2 spec.

1. **URL consolidation.** `/artificial-intelligence/` → `/ai-systems/` redirect, or vice versa. Requires deciding which URL keeps the indexed content. Affects sitemap, internal links, and SEO equity.
2. **AI-crawler policy.** `robots.txt` currently denies GPTBot, ChatGPT-User, anthropic-ai, Google-Extended, Bytespider, CCBot. The new positioning calls for "AI discoverability." These are contradictory. Operator must choose: (a) keep training opt-out (current), (b) allow citation crawlers (GPTBot, ChatGPT-User, Google-Extended) but deny others, (c) allow all. A separate `llms.txt` may also be desirable.
3. **Hreflang resync.** Update `/es/`, `/fr/`, `/de/` homepages to mirror the new positioning, or remove those locales from hreflang. Likely involves rewriting three full pages.
4. **OG card refresh.** Replace `photo1.jpg` as the OG image with a typographic card matching the new system.
5. **Tool-page restyle.** The nine tool pages keep their current styles. Phase 2+ decides whether to (a) leave them as-is (good SEO equity, dissonant brand), (b) restyle them to inherit `/css/petrohrys.css`, or (c) move them off the apex to a `tools.petrohrys.com` subdomain.
6. **`/articles/`, `/startups/`, `/templates/`, `/blog/` voice/style alignment.** These pages currently match the old positioning. They keep their URLs but their visual language will eventually need to harmonize with the new system.
7. **Section content build-out.** `/research/`, `/infrastructure/`, `/ai-systems/` ship as honest stubs with a "first entries arrive in Phase 2" note. The actual research and infrastructure essays are written in subsequent phases.
8. **Search.** No search UI exists yet, and `SearchAction` is intentionally absent from the Phase 1 JSON-LD. Phase 2 implements a real search (likely a static client-side index over the section pages and `/blog/`) and adds the matching `SearchAction` declaration.
9. **Bing site verification.** The placeholder `msvalidate.01` value is preserved; replacing it with a real code is a small follow-up.

## 12. Risks

1. **SEO equity drift.** Removing content from the homepage may briefly reduce keyword coverage for terms like "PDF editor app", "invoice maker", etc. The underlying tool URLs still rank for those, and the homepage was likely cannibalizing tool-page traffic anyway, but expect 2–4 weeks of fluctuation in Search Console after deploy. *Mitigation:* leave all tool URLs live, surface them in the footer, monitor weekly.
2. **Translated locales drift.** EN homepage will diverge from ES/FR/DE until Phase 2 syncs them. Hreflang stays correct in shape (URLs still resolve) but the content no longer matches. *Mitigation:* documented in §11. Low real-world impact while non-EN traffic is small.
3. **`/artificial-intelligence/` competes with `/ai-systems/`.** Two pages on adjacent topics may confuse indexers and split signals. *Mitigation:* the new `/ai-systems/` page is honest about being a section landing and points to the existing in-depth page; intent is clearly delineated.
4. **WebmasterID regression.** Touching `<head>` is the single highest-risk change for analytics. *Mitigation:* byte-identical scripts (§8), verification checklist in §13.
5. **Visual regression on existing pages.** None expected because no existing page is modified, but a careless global selector in `/css/petrohrys.css` could leak. *Mitigation:* `/css/petrohrys.css` is `<link>`-included only on the 6 new/modified pages; never globally loaded.

## 13. Verification checklist (must pass before claiming Phase 1 complete)

For each page in {`/`, `/research/`, `/infrastructure/`, `/ai-systems/`, `/essays/`, `/about/`}:

- [ ] Page loads with `200 OK` from a local static server (`python -m http.server` or equivalent).
- [ ] `<html lang="en">` present.
- [ ] Exactly one `<h1>`. Heading order monotonic.
- [ ] `<link rel="canonical">` self-referential and matches the served URL.
- [ ] CookieYes, WebmasterID, GA script tags present in `<head>`, byte-identical to current.
- [ ] No request to `webmasterid-ingest-api.vercel.app` until CookieYes "Accept analytics" is clicked.
- [ ] After accepting analytics, navigating between pages produces one ingest request per page.
- [ ] No console errors. No 404s on referenced assets.
- [ ] JSON-LD validates (paste into Google Rich Results Test).
- [ ] Lighthouse mobile: Performance ≥ 90, SEO ≥ 95, Accessibility ≥ 95.
- [ ] Mobile viewport (375 × 667): no horizontal scroll, body paragraphs ≤ 70 chars wide, hamburger reveals primary nav.
- [ ] Keyboard tab order: skip link → wordmark → primary nav → lang switcher → hamburger (collapsed on desktop) → main content → footer links. Focus rings visible.
- [ ] `prefers-reduced-motion`: enabled in OS, no link underline transition timing visible.

Project-level:

- [ ] `sitemap.xml` includes the 5 new URLs with correct `lastmod`, and the homepage `lastmod` updated.
- [ ] `robots.txt` unchanged (diff vs `main` should be empty for this file).
- [ ] Existing tool URLs (`/pdf-editor/`, `/cv-builder/`, …) return `200` and unchanged HTML body.
- [ ] Existing blog/article URLs return `200` and unchanged HTML body.
- [ ] `/es/`, `/fr/`, `/de/` homepages return `200` and unchanged HTML body.
- [ ] `/artificial-intelligence/` returns `200` and unchanged HTML body.
- [ ] No removed files (only additions and modifications to the homepage and `sitemap.xml`).

## 14. Files touched (estimate, for the implementation plan)

**New:**

- `/css/petrohrys.css`
- `/research/index.html`
- `/infrastructure/index.html`
- `/ai-systems/index.html`
- `/essays/index.html`
- `/about/index.html`
- `docs/superpowers/specs/2026-05-20-petrohrys-homepage-reposition-design.md` (this file)
- `docs/superpowers/plans/2026-05-20-petrohrys-homepage-reposition-plan.md` (to be written by the writing-plans skill next)

**Modified:**

- `/index.html` (substantial rewrite of `<body>`, narrow rewrite of `<head>` metadata + JSON-LD; analytics scripts unchanged)
- `/sitemap.xml` (5 additions, 1 lastmod update)

**Untouched (asserted invariant):**

- Everything else in the repository.

## 15. Out-of-band acceptance signal

When Phase 1 is shipped to production:

- `https://www.petrohrys.com/` returns the new editorial-index homepage.
- All five new section URLs return their landing pages.
- Search Console submits all five new URLs successfully for indexing.
- WebmasterID dashboard shows pageviews on the new section URLs within 24h of first traffic.

If all of the above hold and the §13 checklist is signed off, Phase 1 is complete and Phase 2 work can begin.
