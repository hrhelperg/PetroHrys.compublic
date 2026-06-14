# Premium Personal Ecosystem (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify PetroHrys.com to a premium personal ecosystem — 4-item nav (Home · Work · Research & Writing · About), one alive single-page homepage, new `/work/` and `/writing/` hubs, redistributed full-colour portraits, and a simpler Civilist mark — while preserving every existing URL, analytics, and SEO structure.

**Architecture:** Static HTML + one stylesheet (`css/petrohrys.css`), no build step, Netlify. Only the 8 *editorial* pages get the new shell (`index`, `about`, `research`, `infrastructure`, `ai-systems`, `essays`, new `work`, new `writing`). All old-design pages (9 products, blog, articles, privacy, terms, artificial-intelligence, startups, templates) stay byte-unchanged and remain linked from the footer.

**Tech Stack:** HTML5, CSS custom properties (existing design tokens), no JS framework. Verification is grep-based assertions + a local static server + manual browser checks (there is no unit-test runner in this repo).

**Spec:** `docs/superpowers/specs/2026-06-14-premium-personal-ecosystem-design.md`

**Branch:** `feat/premium-personal-ecosystem` (already created, off `feat/editorial-identity-phase-1.5`).

---

## Verification conventions (read once)

This is a static site with no test framework. Each task's "test" steps are **assertions**:
- `grep` checks with an expected match/no-match.
- A link-integrity check that every internal `href` resolves to a file on disk.
- A local server for manual visual/responsive checks: `python3 -m http.server 8000` then open `http://localhost:8000/`.

Run the link-integrity helper (used by several tasks) from repo root:

```bash
# scripts check: every root-absolute href in a file points to an existing file/dir
check_links() {
  for f in "$@"; do
    grep -oE 'href="/[^"#?]*"' "$f" | sed -E 's/href="(.*)"/\1/' | sort -u | while read -r url; do
      p=".${url}"
      if [ -d "$p" ] && [ -f "${p%/}/index.html" ]; then continue; fi
      if [ -f "$p" ]; then continue; fi
      echo "BROKEN in $f -> $url"
    done
  done
}
```

A clean run prints nothing.

---

## Canonical shared markup (referenced by multiple tasks)

**NEW TOP NAV** — `nav-primary` block (appears **twice** per page: once in the desktop `<ul class="nav-primary">` and once inside `.nav-mobile-panel`). On a given page, add `aria-current="page"` to the item for that page (Work page → Work; the four sections + Writing page → Research & Writing; About page → About; homepage → none, the wordmark carries Home).

```html
      <ul class="nav-primary">
        <li><a href="/work/">Work</a></li>
        <li><a href="/writing/">Research &amp; Writing</a></li>
        <li><a href="/about/">About</a></li>
      </ul>
```

**NEW FOOTER** — full `<footer>` used on every editorial page. Note `id="footer-tools"` stays on the Products section to preserve the existing in-page anchor `/about/#footer-tools`.

```html
  <footer role="contentinfo">
    <div class="footer-grid">
      <section id="footer-tools">
        <h3>Products</h3>
        <ul>
          <li><a href="/pdf-editor/">PDF Editor</a></li>
          <li><a href="/unzip/">Unzip</a></li>
          <li><a href="/smart-printer/">Smart Printer</a></li>
          <li><a href="/invoice-maker/">Invoice Maker</a></li>
          <li><a href="/pocket-manager/">Pocket Manager</a></li>
          <li><a href="/fax/">FAX</a></li>
          <li><a href="/twinphone/">TwinPhone</a></li>
          <li><a href="/cv-builder/">CV Builder</a></li>
          <li><a href="/tcg-scanner/">TCG Scanner</a></li>
        </ul>
      </section>
      <section>
        <h3>Research &amp; Writing</h3>
        <ul>
          <li><a href="/essays/">Essays</a></li>
          <li><a href="/research/">Research</a></li>
          <li><a href="/infrastructure/">Infrastructure</a></li>
          <li><a href="/ai-systems/">AI Systems</a></li>
          <li><a href="/artificial-intelligence/">Artificial Intelligence</a></li>
        </ul>
      </section>
      <section>
        <h3>Index</h3>
        <ul>
          <li><a href="/blog/">Blog</a></li>
          <li><a href="/articles/">Articles</a></li>
          <li><a href="/sitemap.xml">Sitemap</a></li>
        </ul>
      </section>
      <section>
        <h3>Legal</h3>
        <ul>
          <li><a href="/privacy/">Privacy</a></li>
          <li><a href="/terms/">Terms</a></li>
        </ul>
      </section>
    </div>
    <p class="footer-bottom">&copy; 2026 Petro Hrys</p>
  </footer>
```

---

## Task 1: Replace the Civilist mark (single white star on red square)

**Files:**
- Modify: `images/logo-red.svg` (full overwrite)

- [ ] **Step 1: Overwrite `images/logo-red.svg`** with the simpler mark (same `viewBox`, so CSS `hero-mark`/`star-divider`/footer-signature and the favicon all inherit it):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="Petro Hrys"><rect width="100" height="100" fill="#C20203"/><path fill="#ffffff" d="M50,17 L57.64,39.48 L81.38,39.81 L62.36,54.02 L69.40,76.70 L50,63 L30.60,76.70 L37.64,54.02 L18.62,39.81 L42.36,39.48 Z"/></svg>
```

- [ ] **Step 2: Verify it is a single-star, single-path mark**

Run: `grep -c '<path' images/logo-red.svg`
Expected: `1`

- [ ] **Step 3: Verify references are untouched (no markup churn needed)**

Run: `grep -rln "logo-red.svg" --include="*.html" --include="*.css" . | grep -v '\.git' | wc -l`
Expected: a non-zero count (CSS + per-page favicons still point at the same filename).

- [ ] **Step 4: Visual check** — `python3 -m http.server 8000`, open `http://localhost:8000/`, confirm the hero mark, footer signature, and browser-tab favicon now show one star on a red square.

- [ ] **Step 5: Commit**

```bash
git add images/logo-red.svg
git commit -m "feat(mark): simplify Civilist mark to single white star on red square"
```

---

## Task 2: Add Phase 2 CSS components

**Files:**
- Modify: `css/petrohrys.css` — replace the `About — full-colour portrait trio` block (lines ~520–545) and append a new Phase 2 section before `/* ===== End ===== */`.

- [ ] **Step 1: Replace the old About trio block.** Find this block:

```css
/* About — full-colour portrait trio */
.bio .portrait-trio {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--s-2);
  max-width: 480px;
  margin: var(--s-2) 0 var(--s-5);
}
.bio .portrait-trio img {
  width: 100%;
  aspect-ratio: 4 / 5;
  object-fit: cover;
  object-position: 50% 22%;
  border: var(--rule-w) solid var(--rule);
}
.bio .portrait-trio figcaption {
  grid-column: 1 / -1;
  margin-top: var(--s-1);
  font-family: var(--ff-mono);
  font-size: var(--fs-xs);
  letter-spacing: 0.03em;
  color: var(--text-3);
}
@media (max-width: 640px) {
  .bio .portrait-trio { gap: var(--s-1); }
}
```

Replace the whole block with:

```css
/* ===== Phase 2 — Premium Personal Ecosystem ===== */

/* Shared portrait treatment — full colour, uniform 4:5, hairline border.
   Width is set per context; consistency comes from ratio + border, not desaturation. */
.portrait {
  display: block;
  max-width: 100%;
  aspect-ratio: 4 / 5;
  object-fit: cover;
  object-position: 50% 22%;
  border: var(--rule-w) solid var(--rule);
}

/* Current Focus — small mono-label row (homepage) */
.current-focus {
  border-top: var(--rule-w) solid var(--rule);
  border-bottom: var(--rule-w) solid var(--rule);
  padding: var(--s-4) 0;
}
.current-focus h2 {
  font-family: var(--ff-mono);
  font-size: var(--fs-xs);
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-3);
  margin-bottom: var(--s-3);
}
.current-focus ul { display: flex; flex-wrap: wrap; gap: var(--s-1) var(--s-4); }
.current-focus li { font-family: var(--ff-serif); font-size: var(--fs-md); color: var(--text); }

/* Identity chip (homepage) + Writing personal note — portrait beside a short note */
.identity { display: grid; grid-template-columns: 150px 1fr; gap: var(--s-5); align-items: start; }
.identity .portrait { width: 150px; }
.identity .note { max-width: var(--col-text); }
.identity .note p + p { margin-top: var(--s-3); }
@media (max-width: 640px) {
  .identity { grid-template-columns: 1fr; gap: var(--s-3); }
  .identity .portrait { width: 140px; }
}

/* Product list (Work full index, homepage Selected products, Writing categories) */
.product-list { border-top: var(--rule-w) solid var(--rule); }
.product-list li { border-bottom: var(--rule-w) solid var(--rule); }
.product-list a {
  display: grid;
  grid-template-columns: 16ch 1fr auto;
  gap: var(--s-4);
  padding: var(--s-3) var(--s-2);
  text-decoration: none;
  align-items: baseline;
  transition: background 150ms ease;
}
.product-list a:hover { background: var(--hover-tint); }
.product-list .name { font-family: var(--ff-serif); font-size: var(--fs-md); font-weight: 500; color: var(--text); }
.product-list .desc { font-size: var(--fs-sm); color: var(--text-2); }
.product-list .arrow { color: var(--text-3); align-self: center; }
@media (max-width: 640px) {
  .product-list a { grid-template-columns: 1fr; gap: var(--s-0); }
  .product-list .arrow { display: none; }
}

/* Featured products — 3 framed blocks, no badges */
.featured-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--s-4); }
.featured-grid a {
  display: block;
  padding: var(--s-4);
  border: var(--rule-w) solid var(--rule);
  text-decoration: none;
  transition: background 150ms ease;
}
.featured-grid a:hover { background: var(--hover-tint); }
.featured-grid .name {
  font-family: var(--ff-serif); font-size: var(--fs-lg); font-weight: 500;
  color: var(--text); display: block; margin-bottom: var(--s-1);
}
.featured-grid .desc { font-size: var(--fs-sm); color: var(--text-2); }
@media (max-width: 760px) { .featured-grid { grid-template-columns: 1fr; } }

/* About — single anchor portrait, 2-col with bio */
.bio.bio-2col { display: grid; grid-template-columns: 320px 1fr; gap: var(--s-6); align-items: start; }
.bio.bio-2col .portrait-figure { margin: 0; }
.bio.bio-2col .portrait { width: 100%; max-width: 320px; }
.bio.bio-2col figcaption {
  margin-top: var(--s-1);
  font-family: var(--ff-mono); font-size: var(--fs-xs);
  letter-spacing: 0.03em; color: var(--text-3);
}
.bio.bio-2col .bio-text p + p { margin-top: var(--s-3); }
@media (max-width: 760px) {
  .bio.bio-2col { grid-template-columns: 1fr; gap: var(--s-4); }
  .bio.bio-2col .portrait { max-width: 260px; margin-inline: auto; }
}

/* Work trust — small café portrait + caption */
.work-trust { display: flex; align-items: center; gap: var(--s-3); }
.work-trust .portrait { width: 96px; flex: 0 0 auto; }
.work-trust figcaption {
  margin: 0;
  font-family: var(--ff-mono); font-size: var(--fs-xs);
  letter-spacing: 0.03em; color: var(--text-3);
}
```

- [ ] **Step 2: Confirm the End comment still terminates the file.** The file ends with `/* ===== End ===== */`. Leave it in place after the new block.

- [ ] **Step 3: Verify no stray `portrait-trio` rules remain**

Run: `grep -c "portrait-trio" css/petrohrys.css`
Expected: `0`

- [ ] **Step 4: Verify new classes exist**

Run: `grep -cE '\.current-focus|\.product-list|\.featured-grid|\.identity|\.bio-2col|\.work-trust|^\.portrait ' css/petrohrys.css`
Expected: `7` or more.

- [ ] **Step 5: Commit**

```bash
git add css/petrohrys.css
git commit -m "feat(css): add Phase 2 components (portrait, product-list, featured, identity, current-focus, work-trust)"
```

---

## Task 3: Update the 4 section pages to the new nav/footer/breadcrumb

Applies identically to `research/index.html`, `infrastructure/index.html`, `ai-systems/index.html`, `essays/index.html`. Body content is unchanged; only nav, footer, breadcrumb (HTML + JSON-LD) change.

**Files:**
- Modify: `research/index.html`, `infrastructure/index.html`, `ai-systems/index.html`, `essays/index.html`

For each page, use its own values:

| File | Section name | Section URL |
|---|---|---|
| research | Research | /research/ |
| infrastructure | Infrastructure | /infrastructure/ |
| ai-systems | AI Systems | /ai-systems/ |
| essays | Essays | /essays/ |

- [ ] **Step 1: Replace the desktop nav list.** In each file find the old `nav-primary` block (the 5 `<li>` items, first occurrence) and replace with the NEW TOP NAV (see Canonical shared markup), marking Research & Writing current:

```html
      <ul class="nav-primary">
        <li><a href="/work/">Work</a></li>
        <li><a href="/writing/" aria-current="page">Research &amp; Writing</a></li>
        <li><a href="/about/">About</a></li>
      </ul>
```

- [ ] **Step 2: Replace the mobile nav list** (second occurrence of the same old 5-item `nav-primary` block, inside `.nav-mobile-panel`) with the identical new block above (keep `aria-current="page"` on Research & Writing).

- [ ] **Step 3: Replace the HTML breadcrumb.** Find:

```html
    <p class="breadcrumb">
      <a href="/">Home</a><span class="sep">/</span><span aria-current="page">Research</span>
    </p>
```

Replace with (substitute the section name per the table):

```html
    <p class="breadcrumb">
      <a href="/">Home</a><span class="sep">/</span><a href="/writing/">Research &amp; Writing</a><span class="sep">/</span><span aria-current="page">Research</span>
    </p>
```

- [ ] **Step 4: Replace the whole `<footer>`** with the NEW FOOTER (Canonical shared markup).

- [ ] **Step 5: Update the JSON-LD breadcrumb** to insert the Research & Writing level. Find the `itemListElement` array and replace with (substitute section name + URL):

```json
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.petrohrys.com/" },
        { "@type": "ListItem", "position": 2, "name": "Research & Writing", "item": "https://www.petrohrys.com/writing/" },
        { "@type": "ListItem", "position": 3, "name": "Research", "item": "https://www.petrohrys.com/research/" }
      ]
```

- [ ] **Step 6: Verify old nav is gone and new nav present on all four**

Run:
```bash
grep -L 'href="/work/"' research/index.html infrastructure/index.html ai-systems/index.html essays/index.html
grep -l '>Infrastructure</a></li>\s*<li><a href="/ai-systems/">' research/index.html 2>/dev/null
```
Expected: first command prints nothing (all four contain the Work link); second prints nothing (old 5-item nav gone).

- [ ] **Step 7: Verify footer renamed**

Run: `grep -c '<h3>Products</h3>' research/index.html infrastructure/index.html ai-systems/index.html essays/index.html`
Expected: each file `1`.

- [ ] **Step 8: Link-integrity check** (paste the `check_links` helper first)

Run: `check_links research/index.html infrastructure/index.html ai-systems/index.html essays/index.html`
Expected: nothing printed.

- [ ] **Step 9: Commit**

```bash
git add research/index.html infrastructure/index.html ai-systems/index.html essays/index.html
git commit -m "feat(nav): move section pages under Research & Writing; new nav/footer/breadcrumb"
```

---

## Task 4: Update the About page (single suit portrait, 2-col, new shell)

**Files:**
- Modify: `about/index.html`

- [ ] **Step 1: Replace desktop + mobile nav** (both `nav-primary` occurrences) with the NEW TOP NAV, marking About current:

```html
      <ul class="nav-primary">
        <li><a href="/work/">Work</a></li>
        <li><a href="/writing/">Research &amp; Writing</a></li>
        <li><a href="/about/" aria-current="page">About</a></li>
      </ul>
```

- [ ] **Step 2: Replace the bio section.** Find the existing `<section ... class="prose bio">` … `</section>` (the one containing `figure class="portrait-trio"`). Replace the figure + opening section tag so the section becomes 2-col with a single portrait. Replace:

```html
    <section aria-labelledby="bio" class="prose bio">
      <h2 id="bio" class="visually-hidden">Biography</h2>
      <figure class="portrait-trio">
        <img src="/images/portrait-1.jpg" width="480" height="640" alt="Portrait of Petro Hrys" loading="lazy" decoding="async">
        <img src="/images/portrait-2.jpg" width="480" height="591" alt="" loading="lazy" decoding="async">
        <img src="/images/portrait-3.jpg" width="480" height="724" alt="" loading="lazy" decoding="async">
        <figcaption>Petro Hrys &middot; independent research practice</figcaption>
      </figure>
```

with:

```html
    <section aria-labelledby="bio" class="prose bio bio-2col">
      <h2 id="bio" class="visually-hidden">Biography</h2>
      <figure class="portrait-figure">
        <img class="portrait" src="/images/portrait-2.jpg" width="480" height="591" alt="Petro Hrys, independent digital-infrastructure researcher and builder." loading="lazy" decoding="async">
        <figcaption>Petro Hrys &middot; independent research practice</figcaption>
      </figure>
      <div class="bio-text">
```

- [ ] **Step 3: Close the new `bio-text` div.** The four `<p>` bio paragraphs now sit inside `.bio-text`. Immediately before the section's closing `</section>`, add the closing `</div>` for `.bio-text`. (The paragraphs themselves are unchanged.)

- [ ] **Step 4: Replace the whole `<footer>`** with the NEW FOOTER.

- [ ] **Step 5: Add a BreadcrumbList to the head JSON-LD** if not present (About currently has none). Leave existing meta as-is; this is additive — skip if About already has a `breadcrumb`. Verify with `grep -c BreadcrumbList about/index.html` (0 → add the block below into the existing `<script type="application/ld+json">`; if there is no JSON-LD script on About, add one before `</head>`):

```html
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": "About",
    "url": "https://www.petrohrys.com/about/",
    "isPartOf": { "@type": "WebSite", "url": "https://www.petrohrys.com/" },
    "breadcrumb": {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.petrohrys.com/" },
        { "@type": "ListItem", "position": 2, "name": "About", "item": "https://www.petrohrys.com/about/" }
      ]
    }
  }
  </script>
```

- [ ] **Step 6: Verify single portrait + new shell**

Run:
```bash
grep -c "portrait-trio" about/index.html          # expect 0
grep -c 'src="/images/portrait-2.jpg"' about/index.html  # expect 1
grep -c 'src="/images/portrait-1.jpg"\|src="/images/portrait-3.jpg"' about/index.html  # expect 0
grep -c '<h3>Products</h3>' about/index.html       # expect 1
```

- [ ] **Step 7: Visual check** — open `http://localhost:8000/about/`; desktop shows portrait left + bio right; at ≤760px the portrait stacks on top, centered, capped ~260px. Confirm `#footer-tools` anchor still scrolls to Products (`/about/#footer-tools`).

- [ ] **Step 8: Commit**

```bash
git add about/index.html
git commit -m "feat(about): single suit portrait, 2-col layout, new nav/footer"
```

---

## Task 5: Create the `/work/` page

**Files:**
- Create: `work/index.html`
- Create: `images/portrait-3-work.jpg` (tight face/shoulders crop of `portrait-3.jpg`)

- [ ] **Step 1: Create the tight café crop** to reduce the "lifestyle" read (drops the coffee cup). Using macOS `sips` (always available) to crop the existing 480×724 to a 4:5 face/shoulders frame (top-weighted):

```bash
cp images/portrait-3.jpg images/portrait-3-work.jpg
# crop to 384x480 (4:5) from the top region where the face/shoulders are
sips --cropToHeightWidth 480 384 --cropOffset 40 48 images/portrait-3-work.jpg
```
If `--cropOffset` is unsupported on the installed `sips`, fall back to a centered 4:5 crop: `sips -c 480 384 images/portrait-3-work.jpg`. Confirm result: `sips -g pixelWidth -g pixelHeight images/portrait-3-work.jpg` → 384×480 (or close 4:5).

- [ ] **Step 2: Write `work/index.html`** in full:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <script id="cookieyes" type="text/javascript" src="https://cdn-cookieyes.com/client_data/af075fab2c66644b181224ee/script.js"></script>
  <!-- WebmasterID analytics — consent-gated via CookieYes (analytics category); fires only after consent -->
  <script id="webmasterid-tracker" type="text/plain" data-cookieyes="cookieyes-analytics" defer src="https://webmasterid.com/tracker.iife.min.js" data-wmid="wm_bktqqtd7heom5nkl" data-endpoint="https://webmasterid-ingest-api.vercel.app/api/events"></script>
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-4RE6YCJZBD"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-4RE6YCJZBD');
  </script>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>Work — Petro Hrys</title>
  <meta name="description" content="Independent tools and products built and maintained by Petro Hrys: PDF Editor, CV Builder, Invoice Maker, and more.">

  <meta property="og:title" content="Work — Petro Hrys">
  <meta property="og:description" content="Independent tools and products, built and maintained solo.">
  <meta property="og:url" content="https://www.petrohrys.com/work/">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Petro Hrys">
  <meta property="og:image" content="https://www.petrohrys.com/images/og-default.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@petrohrys">
  <meta name="twitter:title" content="Work — Petro Hrys">
  <meta name="twitter:description" content="Independent tools and products, built and maintained solo.">
  <meta name="twitter:image" content="https://www.petrohrys.com/images/og-default.png">

  <link rel="canonical" href="https://www.petrohrys.com/work/">
  <link rel="sitemap" type="application/xml" href="https://www.petrohrys.com/sitemap.xml">
  <link rel="icon" href="/images/logo-red.svg">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&family=JetBrains+Mono:wght@500&family=Source+Serif+4:opsz,wght@8..60,400;8..60,500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/petrohrys.css">

  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": "Work",
    "url": "https://www.petrohrys.com/work/",
    "isPartOf": { "@type": "WebSite", "url": "https://www.petrohrys.com/" },
    "breadcrumb": {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.petrohrys.com/" },
        { "@type": "ListItem", "position": 2, "name": "Work", "item": "https://www.petrohrys.com/work/" }
      ]
    },
    "mainEntity": {
      "@type": "ItemList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "PDF Editor", "url": "https://www.petrohrys.com/pdf-editor/" },
        { "@type": "ListItem", "position": 2, "name": "CV Builder", "url": "https://www.petrohrys.com/cv-builder/" },
        { "@type": "ListItem", "position": 3, "name": "Invoice Maker", "url": "https://www.petrohrys.com/invoice-maker/" },
        { "@type": "ListItem", "position": 4, "name": "Smart Printer", "url": "https://www.petrohrys.com/smart-printer/" },
        { "@type": "ListItem", "position": 5, "name": "Pocket Manager", "url": "https://www.petrohrys.com/pocket-manager/" },
        { "@type": "ListItem", "position": 6, "name": "Unzip", "url": "https://www.petrohrys.com/unzip/" },
        { "@type": "ListItem", "position": 7, "name": "FAX", "url": "https://www.petrohrys.com/fax/" },
        { "@type": "ListItem", "position": 8, "name": "TwinPhone", "url": "https://www.petrohrys.com/twinphone/" },
        { "@type": "ListItem", "position": 9, "name": "TCG Scanner", "url": "https://www.petrohrys.com/tcg-scanner/" }
      ]
    }
  }
  </script>
</head>
<body>
  <a class="skip" href="#main">Skip to content</a>

  <header role="banner">
    <nav aria-label="Primary">
      <a href="/" class="wordmark">Petro Hrys</a>
      <ul class="nav-primary">
        <li><a href="/work/" aria-current="page">Work</a></li>
        <li><a href="/writing/">Research &amp; Writing</a></li>
        <li><a href="/about/">About</a></li>
      </ul>
      <ul class="nav-lang" aria-label="Language">
        <li><a href="/">EN</a></li>
        <li><a href="/es/">ES</a></li>
        <li><a href="/fr/">FR</a></li>
        <li><a href="/de/">DE</a></li>
      </ul>
      <details class="nav-mobile">
        <summary>Menu</summary>
        <div class="nav-mobile-panel">
          <ul class="nav-primary">
            <li><a href="/work/" aria-current="page">Work</a></li>
            <li><a href="/writing/">Research &amp; Writing</a></li>
            <li><a href="/about/">About</a></li>
          </ul>
          <ul class="nav-lang" aria-label="Language">
            <li><a href="/">EN</a></li>
            <li><a href="/es/">ES</a></li>
            <li><a href="/fr/">FR</a></li>
            <li><a href="/de/">DE</a></li>
          </ul>
        </div>
      </details>
    </nav>
  </header>

  <main id="main">
    <p class="breadcrumb">
      <a href="/">Home</a><span class="sep">/</span><span aria-current="page">Work</span>
    </p>

    <article class="page-hero">
      <h1>Work</h1>
      <p class="lede">Independent tools and products — built and maintained solo.</p>
    </article>

    <section aria-labelledby="featured">
      <h2 id="featured">Featured products</h2>
      <div class="featured-grid">
        <a href="/pdf-editor/">
          <span class="name">PDF Editor</span>
          <span class="desc">Edit, convert, merge, and sign PDFs right in the browser — no upload, no install.</span>
        </a>
        <a href="/cv-builder/">
          <span class="name">CV Builder</span>
          <span class="desc">Build a clean, ATS-ready résumé from a guided editor and export to PDF.</span>
        </a>
        <a href="/invoice-maker/">
          <span class="name">Invoice Maker</span>
          <span class="desc">Create, brand, and send professional invoices in minutes.</span>
        </a>
      </div>
    </section>

    <section aria-labelledby="all-products">
      <h2 id="all-products">All products</h2>
      <ul class="product-list">
        <li><a href="/pdf-editor/"><span class="name">PDF Editor</span><span class="desc">Edit, convert, and sign PDFs in the browser.</span><span class="arrow" aria-hidden="true">&rarr;</span></a></li>
        <li><a href="/cv-builder/"><span class="name">CV Builder</span><span class="desc">Clean, ATS-ready résumés fast.</span><span class="arrow" aria-hidden="true">&rarr;</span></a></li>
        <li><a href="/invoice-maker/"><span class="name">Invoice Maker</span><span class="desc">Professional invoices in minutes.</span><span class="arrow" aria-hidden="true">&rarr;</span></a></li>
        <li><a href="/smart-printer/"><span class="name">Smart Printer</span><span class="desc">Wireless printing tools for any device.</span><span class="arrow" aria-hidden="true">&rarr;</span></a></li>
        <li><a href="/pocket-manager/"><span class="name">Pocket Manager</span><span class="desc">Lightweight personal-finance tracking.</span><span class="arrow" aria-hidden="true">&rarr;</span></a></li>
        <li><a href="/unzip/"><span class="name">Unzip</span><span class="desc">Extract archive files online, no install.</span><span class="arrow" aria-hidden="true">&rarr;</span></a></li>
        <li><a href="/fax/"><span class="name">FAX</span><span class="desc">Send &amp; receive faxes without a machine.</span><span class="arrow" aria-hidden="true">&rarr;</span></a></li>
        <li><a href="/twinphone/"><span class="name">TwinPhone</span><span class="desc">A second number on your existing phone.</span><span class="arrow" aria-hidden="true">&rarr;</span></a></li>
        <li><a href="/tcg-scanner/"><span class="name">TCG Scanner</span><span class="desc">Scan and value trading-card collections.</span><span class="arrow" aria-hidden="true">&rarr;</span></a></li>
      </ul>
    </section>

    <div class="star-divider" aria-hidden="true"></div>

    <section aria-labelledby="maker">
      <h2 id="maker" class="visually-hidden">Maker</h2>
      <figure class="work-trust">
        <img class="portrait" src="/images/portrait-3-work.jpg" width="384" height="480" alt="Petro Hrys, who builds and maintains these tools." loading="lazy" decoding="async">
        <figcaption>Built and maintained by Petro Hrys.</figcaption>
      </figure>
    </section>
  </main>

  <footer role="contentinfo">
    <div class="footer-grid">
      <section id="footer-tools">
        <h3>Products</h3>
        <ul>
          <li><a href="/pdf-editor/">PDF Editor</a></li>
          <li><a href="/unzip/">Unzip</a></li>
          <li><a href="/smart-printer/">Smart Printer</a></li>
          <li><a href="/invoice-maker/">Invoice Maker</a></li>
          <li><a href="/pocket-manager/">Pocket Manager</a></li>
          <li><a href="/fax/">FAX</a></li>
          <li><a href="/twinphone/">TwinPhone</a></li>
          <li><a href="/cv-builder/">CV Builder</a></li>
          <li><a href="/tcg-scanner/">TCG Scanner</a></li>
        </ul>
      </section>
      <section>
        <h3>Research &amp; Writing</h3>
        <ul>
          <li><a href="/essays/">Essays</a></li>
          <li><a href="/research/">Research</a></li>
          <li><a href="/infrastructure/">Infrastructure</a></li>
          <li><a href="/ai-systems/">AI Systems</a></li>
          <li><a href="/artificial-intelligence/">Artificial Intelligence</a></li>
        </ul>
      </section>
      <section>
        <h3>Index</h3>
        <ul>
          <li><a href="/blog/">Blog</a></li>
          <li><a href="/articles/">Articles</a></li>
          <li><a href="/sitemap.xml">Sitemap</a></li>
        </ul>
      </section>
      <section>
        <h3>Legal</h3>
        <ul>
          <li><a href="/privacy/">Privacy</a></li>
          <li><a href="/terms/">Terms</a></li>
        </ul>
      </section>
    </div>
    <p class="footer-bottom">&copy; 2026 Petro Hrys</p>
  </footer>
</body>
</html>
```

- [ ] **Step 3: Verify analytics + canonical + links**

Run:
```bash
grep -c 'wm_bktqqtd7heom5nkl' work/index.html         # expect 1
grep -c 'G-4RE6YCJZBD' work/index.html                # expect 2
grep -c 'canonical" href="https://www.petrohrys.com/work/"' work/index.html  # expect 1
check_links work/index.html                            # expect nothing
```

- [ ] **Step 4: Visual check** — open `http://localhost:8000/work/`; 3 featured blocks (stack at ≤760px), full 9-item list below, small café portrait + caption. No App Store badges anywhere.

- [ ] **Step 5: Commit**

```bash
git add work/index.html images/portrait-3-work.jpg
git commit -m "feat(work): new /work/ hub — featured + full product index + maker portrait"
```

---

## Task 6: Create the `/writing/` page

**Files:**
- Create: `writing/index.html`

- [ ] **Step 1: Write `writing/index.html`** in full:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <script id="cookieyes" type="text/javascript" src="https://cdn-cookieyes.com/client_data/af075fab2c66644b181224ee/script.js"></script>
  <!-- WebmasterID analytics — consent-gated via CookieYes (analytics category); fires only after consent -->
  <script id="webmasterid-tracker" type="text/plain" data-cookieyes="cookieyes-analytics" defer src="https://webmasterid.com/tracker.iife.min.js" data-wmid="wm_bktqqtd7heom5nkl" data-endpoint="https://webmasterid-ingest-api.vercel.app/api/events"></script>
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-4RE6YCJZBD"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-4RE6YCJZBD');
  </script>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>Research &amp; Writing — Petro Hrys</title>
  <meta name="description" content="Essays and research on search systems, infrastructure, and AI by Petro Hrys.">

  <meta property="og:title" content="Research &amp; Writing — Petro Hrys">
  <meta property="og:description" content="Essays and research on search systems, infrastructure, and AI.">
  <meta property="og:url" content="https://www.petrohrys.com/writing/">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Petro Hrys">
  <meta property="og:image" content="https://www.petrohrys.com/images/og-default.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@petrohrys">
  <meta name="twitter:title" content="Research &amp; Writing — Petro Hrys">
  <meta name="twitter:description" content="Essays and research on search systems, infrastructure, and AI.">
  <meta name="twitter:image" content="https://www.petrohrys.com/images/og-default.png">

  <link rel="canonical" href="https://www.petrohrys.com/writing/">
  <link rel="sitemap" type="application/xml" href="https://www.petrohrys.com/sitemap.xml">
  <link rel="icon" href="/images/logo-red.svg">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&family=JetBrains+Mono:wght@500&family=Source+Serif+4:opsz,wght@8..60,400;8..60,500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/petrohrys.css">

  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": "Research & Writing",
    "url": "https://www.petrohrys.com/writing/",
    "isPartOf": { "@type": "WebSite", "url": "https://www.petrohrys.com/" },
    "breadcrumb": {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.petrohrys.com/" },
        { "@type": "ListItem", "position": 2, "name": "Research & Writing", "item": "https://www.petrohrys.com/writing/" }
      ]
    }
  }
  </script>
</head>
<body>
  <a class="skip" href="#main">Skip to content</a>

  <header role="banner">
    <nav aria-label="Primary">
      <a href="/" class="wordmark">Petro Hrys</a>
      <ul class="nav-primary">
        <li><a href="/work/">Work</a></li>
        <li><a href="/writing/" aria-current="page">Research &amp; Writing</a></li>
        <li><a href="/about/">About</a></li>
      </ul>
      <ul class="nav-lang" aria-label="Language">
        <li><a href="/">EN</a></li>
        <li><a href="/es/">ES</a></li>
        <li><a href="/fr/">FR</a></li>
        <li><a href="/de/">DE</a></li>
      </ul>
      <details class="nav-mobile">
        <summary>Menu</summary>
        <div class="nav-mobile-panel">
          <ul class="nav-primary">
            <li><a href="/work/">Work</a></li>
            <li><a href="/writing/" aria-current="page">Research &amp; Writing</a></li>
            <li><a href="/about/">About</a></li>
          </ul>
          <ul class="nav-lang" aria-label="Language">
            <li><a href="/">EN</a></li>
            <li><a href="/es/">ES</a></li>
            <li><a href="/fr/">FR</a></li>
            <li><a href="/de/">DE</a></li>
          </ul>
        </div>
      </details>
    </nav>
  </header>

  <main id="main">
    <p class="breadcrumb">
      <a href="/">Home</a><span class="sep">/</span><span aria-current="page">Research &amp; Writing</span>
    </p>

    <article class="page-hero">
      <h1>Research &amp; Writing</h1>
      <p class="lede">Essays and applied research on search systems, infrastructure, and AI.</p>
    </article>

    <section aria-labelledby="note" class="identity">
      <h2 id="note" class="visually-hidden">Note</h2>
      <img class="portrait" src="/images/portrait-1.jpg" width="480" height="640" alt="Petro Hrys." loading="lazy" decoding="async">
      <div class="note">
        <p>Most of the work here studies one question: how machines decide what is worth surfacing. The writing spans long-form essays and shorter empirical notes — grouped below by area.</p>
      </div>
    </section>

    <section aria-labelledby="areas">
      <h2 id="areas">Areas</h2>
      <ul class="product-list">
        <li><a href="/essays/"><span class="name">Essays</span><span class="desc">Occasional writing on technology, infrastructure, and the digital web.</span><span class="arrow" aria-hidden="true">&rarr;</span></a></li>
        <li><a href="/research/"><span class="name">Research</span><span class="desc">Studies of search systems, indexing behavior, and crawl architecture.</span><span class="arrow" aria-hidden="true">&rarr;</span></a></li>
        <li><a href="/infrastructure/"><span class="name">Infrastructure</span><span class="desc">Notes on the systems that support discovery and distribution on the open web.</span><span class="arrow" aria-hidden="true">&rarr;</span></a></li>
        <li><a href="/ai-systems/"><span class="name">AI Systems</span><span class="desc">How language models, retrieval, and structured data shape web intelligence.</span><span class="arrow" aria-hidden="true">&rarr;</span></a></li>
        <li><a href="/artificial-intelligence/"><span class="name">Artificial Intelligence</span><span class="desc">AI as a practical operating layer — the pillar essay.</span><span class="arrow" aria-hidden="true">&rarr;</span></a></li>
      </ul>
    </section>

    <section aria-labelledby="recent">
      <h2 id="recent">Recent</h2>
      <ul class="entries">
        <li>
          <a href="/artificial-intelligence/">
            <span class="meta">2026 &middot; AI</span>
            <span class="title">Artificial intelligence as a practical operating layer</span>
          </a>
        </li>
        <li>
          <a href="/blog/what-is-business-globalization-open-economies.html">
            <span class="meta">2026 &middot; Essay</span>
            <span class="title">What business really is, and why open economies grow</span>
          </a>
        </li>
      </ul>
      <p class="more"><a href="/blog/">Blog archive &rarr;</a></p>
    </section>
  </main>

  <footer role="contentinfo">
    <div class="footer-grid">
      <section id="footer-tools">
        <h3>Products</h3>
        <ul>
          <li><a href="/pdf-editor/">PDF Editor</a></li>
          <li><a href="/unzip/">Unzip</a></li>
          <li><a href="/smart-printer/">Smart Printer</a></li>
          <li><a href="/invoice-maker/">Invoice Maker</a></li>
          <li><a href="/pocket-manager/">Pocket Manager</a></li>
          <li><a href="/fax/">FAX</a></li>
          <li><a href="/twinphone/">TwinPhone</a></li>
          <li><a href="/cv-builder/">CV Builder</a></li>
          <li><a href="/tcg-scanner/">TCG Scanner</a></li>
        </ul>
      </section>
      <section>
        <h3>Research &amp; Writing</h3>
        <ul>
          <li><a href="/essays/">Essays</a></li>
          <li><a href="/research/">Research</a></li>
          <li><a href="/infrastructure/">Infrastructure</a></li>
          <li><a href="/ai-systems/">AI Systems</a></li>
          <li><a href="/artificial-intelligence/">Artificial Intelligence</a></li>
        </ul>
      </section>
      <section>
        <h3>Index</h3>
        <ul>
          <li><a href="/blog/">Blog</a></li>
          <li><a href="/articles/">Articles</a></li>
          <li><a href="/sitemap.xml">Sitemap</a></li>
        </ul>
      </section>
      <section>
        <h3>Legal</h3>
        <ul>
          <li><a href="/privacy/">Privacy</a></li>
          <li><a href="/terms/">Terms</a></li>
        </ul>
      </section>
    </div>
    <p class="footer-bottom">&copy; 2026 Petro Hrys</p>
  </footer>
</body>
</html>
```

- [ ] **Step 2: Verify analytics + canonical + links**

Run:
```bash
grep -c 'wm_bktqqtd7heom5nkl' writing/index.html       # expect 1
grep -c 'G-4RE6YCJZBD' writing/index.html              # expect 2
grep -c 'canonical" href="https://www.petrohrys.com/writing/"' writing/index.html  # expect 1
check_links writing/index.html                          # expect nothing
```

- [ ] **Step 3: Visual check** — open `http://localhost:8000/writing/`; train portrait beside the note (stacks on mobile), 5 category rows, recent entries. Confirm category links land on the existing live section pages.

- [ ] **Step 4: Commit**

```bash
git add writing/index.html
git commit -m "feat(writing): new Research & Writing hub linking the live section pages"
```

---

## Task 7: Rewrite the homepage

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Update the hero lede.** Find:

```html
      <p class="lede">Researching search systems, AI architectures, automation, and digital intelligence networks.</p>
```

Replace with:

```html
      <p class="lede">Building and researching search systems, AI architectures, automation, and independent digital products.</p>
```

- [ ] **Step 2: Replace desktop + mobile nav** (both `nav-primary` occurrences) with the NEW TOP NAV. The homepage marks none current (the wordmark `aria-current="page"` already represents Home — keep it):

```html
      <ul class="nav-primary">
        <li><a href="/work/">Work</a></li>
        <li><a href="/writing/">Research &amp; Writing</a></li>
        <li><a href="/about/">About</a></li>
      </ul>
```

- [ ] **Step 3: Replace the body sections.** Replace everything from `<section aria-labelledby="now" class="prose">` through the end of the `Selected writing` section's closing `</section>` (i.e. the `Now` section, the `Sections` TOC `<ol>`, and the old `Selected writing` section) with the new ordered sections below. Keep the existing `<article class="hero">…</article>` above and the `star-divider` + `Contact` below; the identity block is inserted before the divider.

Find the run starting at:

```html
    <section aria-labelledby="now" class="prose">
```

…and ending at the `</section>` that closes Selected writing (immediately before `<div class="star-divider" aria-hidden="true"></div>`). Replace that entire run with:

```html
    <section aria-labelledby="positioning" class="prose">
      <h2 id="positioning" class="visually-hidden">Positioning</h2>
      <p>I work independently on the layer beneath the visible web — how search systems index and retrieve content, how language models surface information, and how discovery is shifting from keyword matching toward entity and intent understanding. Alongside the research, I build and maintain a small set of independent digital products.</p>
    </section>

    <section aria-labelledby="focus" class="current-focus">
      <h2 id="focus">Current focus</h2>
      <ul>
        <li>Search-system indexing behavior</li>
        <li>Retrieval &amp; LLM surfacing</li>
        <li>Independent product maintenance</li>
      </ul>
    </section>

    <section aria-labelledby="products">
      <h2 id="products">Selected products</h2>
      <ul class="product-list">
        <li><a href="/pdf-editor/"><span class="name">PDF Editor</span><span class="desc">Edit, convert, and sign PDFs in the browser.</span><span class="arrow" aria-hidden="true">&rarr;</span></a></li>
        <li><a href="/cv-builder/"><span class="name">CV Builder</span><span class="desc">Clean, ATS-ready résumés fast.</span><span class="arrow" aria-hidden="true">&rarr;</span></a></li>
        <li><a href="/invoice-maker/"><span class="name">Invoice Maker</span><span class="desc">Professional invoices in minutes.</span><span class="arrow" aria-hidden="true">&rarr;</span></a></li>
        <li><a href="/smart-printer/"><span class="name">Smart Printer</span><span class="desc">Wireless printing tools for any device.</span><span class="arrow" aria-hidden="true">&rarr;</span></a></li>
        <li><a href="/pocket-manager/"><span class="name">Pocket Manager</span><span class="desc">Lightweight personal-finance tracking.</span><span class="arrow" aria-hidden="true">&rarr;</span></a></li>
      </ul>
      <p class="more"><a href="/work/">All work &rarr;</a></p>
    </section>

    <section aria-labelledby="selected">
      <h2 id="selected">Selected writing</h2>
      <ul class="entries">
        <li>
          <a href="/artificial-intelligence/">
            <span class="meta">2026 &middot; AI</span>
            <span class="title">Artificial intelligence as a practical operating layer</span>
          </a>
        </li>
        <li>
          <a href="/blog/what-is-business-globalization-open-economies.html">
            <span class="meta">2026 &middot; Essay</span>
            <span class="title">What business really is, and why open economies grow</span>
          </a>
        </li>
      </ul>
      <p class="more"><a href="/writing/">All writing &rarr;</a></p>
    </section>

    <section aria-labelledby="identity" class="identity">
      <h2 id="identity" class="visually-hidden">About</h2>
      <img class="portrait" src="/images/portrait-2.jpg" width="480" height="591" alt="Petro Hrys." loading="lazy" decoding="async">
      <div class="note">
        <p>I'm Petro Hrys — an independent researcher and builder working between Europe and the United States. The practice is small and self-directed: long-form writing, applied research, and a steady cadence of independent product work.</p>
        <p class="more"><a href="/about/">More about me &rarr;</a></p>
      </div>
    </section>
```

(The existing `<div class="star-divider">` and `Contact` section remain directly after this.)

- [ ] **Step 4: Replace the whole `<footer>`** with the NEW FOOTER.

- [ ] **Step 5: Verify the TOC is gone and the new blocks exist**

Run:
```bash
grep -c 'class="toc"' index.html               # expect 0
grep -c 'class="current-focus"' index.html      # expect 1
grep -c 'class="product-list"' index.html        # expect 1
grep -c 'src="/images/portrait-2.jpg"' index.html # expect 1
grep -c '<h3>Products</h3>' index.html            # expect 1
grep -c 'href="/work/"' index.html                # expect >=2 (nav + All work + footer)
```

- [ ] **Step 6: Link-integrity + analytics**

Run:
```bash
check_links index.html                            # expect nothing
grep -c 'wm_bktqqtd7heom5nkl' index.html          # expect 1
grep -c 'G-4RE6YCJZBD' index.html                 # expect 2
```

- [ ] **Step 7: Visual check** — open `http://localhost:8000/`; order is Hero → positioning → Current focus → Selected products → Selected writing → identity (suit portrait + note) → divider → Contact. On mobile the portrait stacks above the note (human presence present).

- [ ] **Step 8: Commit**

```bash
git add index.html
git commit -m "feat(home): premium single-page index — current focus, selected products, identity block"
```

---

## Task 8: Add the new pages to the sitemap

**Files:**
- Modify: `sitemap.xml`

- [ ] **Step 1: Inspect current entries** to match the exact `<url>` format used:

Run: `grep -n '<loc>' sitemap.xml | head -5`

- [ ] **Step 2: Add `/work/` and `/writing/`** entries following the existing format. Insert after the homepage `<url>` block (substitute today's date for `<lastmod>`, matching the file's existing date format):

```xml
  <url>
    <loc>https://www.petrohrys.com/work/</loc>
    <lastmod>2026-06-14</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://www.petrohrys.com/writing/</loc>
    <lastmod>2026-06-14</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
```

(If the existing entries omit `changefreq`/`priority`, omit them here too — match the file.)

- [ ] **Step 3: Verify both URLs present and XML is well-formed**

Run:
```bash
grep -c 'petrohrys.com/work/</loc>' sitemap.xml      # expect 1
grep -c 'petrohrys.com/writing/</loc>' sitemap.xml   # expect 1
python3 -c "import xml.dom.minidom,sys; xml.dom.minidom.parse('sitemap.xml'); print('XML OK')"
```
Expected: `XML OK`.

- [ ] **Step 4: Commit**

```bash
git add sitemap.xml
git commit -m "feat(seo): add /work/ and /writing/ to sitemap"
```

---

## Task 9: Regenerate the OG card to match the simpler mark

**Files:**
- Create (temp): `images/og-default.svg`
- Modify: `images/og-default.png`

The OG card is a 1200×630 raster referenced by every page's `og:image`. It currently shows the old constellation. Regenerate to the single-star mark. This step is environment-dependent on having an SVG rasterizer.

- [ ] **Step 1: Write `images/og-default.svg`** (1200×630 card):

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#fafaf8"/>
  <g transform="translate(96,255)">
    <rect width="120" height="120" rx="0" fill="#C20203"/>
    <path fill="#ffffff" transform="scale(1.2)" d="M50,17 L57.64,39.48 L81.38,39.81 L62.36,54.02 L69.40,76.70 L50,63 L30.60,76.70 L37.64,54.02 L18.62,39.81 L42.36,39.48 Z"/>
  </g>
  <text x="248" y="320" font-family="Georgia, 'Times New Roman', serif" font-size="60" fill="#0e0e10">Petro Hrys</text>
  <text x="248" y="372" font-family="Georgia, 'Times New Roman', serif" font-size="30" fill="#5a5a5e">Digital infrastructure builder</text>
</svg>
```

- [ ] **Step 2: Rasterize to PNG using the first available tool.** Try in order:

```bash
if command -v rsvg-convert >/dev/null; then
  rsvg-convert -w 1200 -h 630 images/og-default.svg -o images/og-default.png
elif command -v magick >/dev/null; then
  magick -background none -density 144 images/og-default.svg -resize 1200x630 images/og-default.png
elif command -v convert >/dev/null; then
  convert -background none -density 144 images/og-default.svg -resize 1200x630 images/og-default.png
else
  echo "NO RASTERIZER — leaving existing og-default.png; track as follow-up"
fi
```

- [ ] **Step 3: Verify dimensions** (only if a rasterizer ran)

Run: `sips -g pixelWidth -g pixelHeight images/og-default.png`
Expected: pixelWidth 1200, pixelHeight 630.

If no rasterizer was available, **do not block** — the existing red card stays; note "OG card regeneration pending (no local SVG rasterizer)" in the final PR description and stop this task here.

- [ ] **Step 4: Remove the temp SVG and commit**

```bash
rm -f images/og-default.svg
git add images/og-default.png
git commit -m "feat(og): regenerate OG card with simplified single-star mark"
```

---

## Task 10: Polish Pass (before verification & deployment)

A refinement pass after all build tasks — visual, copy, and consistency polish only. Each step is a concrete check with its target state; **fix-forward** if a check fails, then re-run it. **No architectural changes.** If a *major* structural issue surfaces here, stop and raise it rather than redesigning silently.

**Files:** potentially any editorial page + `css/petrohrys.css` (small refinements only).

- [ ] **Step 1: Nav/footer parity.** All 8 editorial footers should be byte-identical (Products / Research & Writing / Index / Legal).

Run:
```bash
for f in index about work writing research infrastructure ai-systems essays; do
  p=$([ "$f" = index ] && echo index.html || echo $f/index.html)
  sed -n '/<footer role="contentinfo">/,/<\/footer>/p' "$p" > /tmp/foot_$f.txt
done
md5 /tmp/foot_*.txt | awk -F'= ' '{print $2}' | sort -u | wc -l | tr -d ' '
```
Expected: `1`. If not, reconcile the drift against the NEW FOOTER block.

- [ ] **Step 2: Mark sizing.** The single star reads heavier than the old constellation at small sizes. Inspect hero-mark (54px), star-divider (18px), footer signature (15px), and the browser favicon. If the star looks cramped/heavy at 15–18px, nudge `.star-divider` / `.footer-bottom::before` sizes down a touch in `css/petrohrys.css`. Target: a calm, legible glyph — not a red blob.

- [ ] **Step 3: Portrait framing.** For each portrait (home suit, about suit, writing train, work café) confirm the face sits well inside the 4:5 crop. Shared default is `object-position: 50% 22%`; add a per-context override if any face is clipped or too low. The `portrait-3-work.jpg` crop must exclude the coffee cup — recrop if it still reads "lifestyle."

- [ ] **Step 4: Typographic polish.** Check hero H1/lede line breaks at 375/768/1280px; confirm em-dashes (—), `&middot;`, and `&rarr;` render consistently; no double spaces. Spacing rhythm of `.eyebrow` / `h2` / `.lede` matches the existing editorial pages.

- [ ] **Step 5: Interactive states.** Tab through each new/edited page: skip link → nav → product-list rows → featured blocks → portrait links. Focus outlines visible, hover tints consistent, the product-list `→` vertically centered with its row.

- [ ] **Step 6: Copy accuracy.** Open each of the 9 product pages' `<title>` / `<meta name="description">` and confirm the one-liners in `/work/` + the homepage match the real positioning; tighten any that misstate a product. Re-read Current Focus and the personal-note copy — warm but serious, no SaaS clichés.

Run (to read the source meta quickly):
```bash
for d in pdf-editor cv-builder invoice-maker smart-printer pocket-manager unzip fax twinphone tcg-scanner; do
  echo "== $d =="; grep -m1 -E '<title>|name="description"' "$d/index.html"
done
```

- [ ] **Step 7: Contrast / a11y.** Confirm `--text-2` (#5a5a5e) and `--text-3` (#9a9aa0) on `--bg` (#fafaf8) meet WCAG AA at the sizes used (tighten a token only if a real failure — note `--text-3` is borderline for small text); every `<img>` has meaningful `alt` + explicit width/height; exactly one `<h1>` per page; headings ordered.

- [ ] **Step 8: Dead CSS / DRY.** The homepage dropped the `.toc` block. Check whether any page still uses it:

Run: `grep -rl 'class="toc"' --include='*.html' . | grep -v '\.git'`
If nothing prints, the `.toc` rules are unused — leave them (harmless, may be reused) **or** remove for leaner CSS. Never remove a selector still referenced.

- [ ] **Step 9: Commit any polish changes** (skip if none were needed):

```bash
git add -A
git commit -m "polish: cross-page parity, mark sizing, portrait framing, copy + a11y pass"
```

---

## Task 11: Final verification sweep

**Files:** none modified (verification only; fix-forward if anything fails).

- [ ] **Step 1: Analytics present + correct on every editorial page**

Run:
```bash
for f in index.html about/index.html work/index.html writing/index.html research/index.html infrastructure/index.html ai-systems/index.html essays/index.html; do
  printf "%s  wmid=%s gtag=%s cookieyes=%s\n" "$f" \
    "$(grep -c wm_bktqqtd7heom5nkl "$f")" \
    "$(grep -c G-4RE6YCJZBD "$f")" \
    "$(grep -c 'id="cookieyes"' "$f")"
done
```
Expected every line: `wmid=1 gtag=2 cookieyes=1`.

- [ ] **Step 2: No editorial page still links the removed 5-item top nav.** The old nav had Infrastructure/AI Systems/Essays as *top-level* items; confirm none of the editorial pages has a top-nav `<li>` for them (they now live only in the footer + /writing/).

Run:
```bash
grep -rn 'class="nav-primary"' index.html about/index.html work/index.html writing/index.html research/index.html infrastructure/index.html ai-systems/index.html essays/index.html -A4 | grep -E '/(essays|infrastructure|ai-systems)/' | grep -v 'writing'
```
Expected: nothing (those links appear only in footer/areas lists, not in `nav-primary`).

- [ ] **Step 3: Every editorial page exposes Work + Research & Writing + About in nav**

Run:
```bash
for f in index.html about/index.html work/index.html writing/index.html research/index.html infrastructure/index.html ai-systems/index.html essays/index.html; do
  printf "%s work=%s writing=%s about=%s\n" "$f" \
    "$(grep -c 'href="/work/"' "$f")" "$(grep -c 'href="/writing/"' "$f")" "$(grep -c 'href="/about/"' "$f")"
done
```
Expected: each count ≥ 2 (nav desktop + mobile/footer).

- [ ] **Step 4: All existing product/section URLs still resolve from the footer**

Run (paste `check_links` helper first):
```bash
check_links index.html about/index.html work/index.html writing/index.html research/index.html infrastructure/index.html ai-systems/index.html essays/index.html
```
Expected: nothing printed.

- [ ] **Step 5: Old-design pages untouched**

Run: `git status --porcelain | grep -E 'pdf-editor|unzip|smart-printer|invoice-maker|pocket-manager|fax|twinphone|cv-builder|tcg-scanner|blog/|articles/|privacy/|terms/|artificial-intelligence/'`
Expected: nothing (those pages were not modified).

- [ ] **Step 6: Responsive + a11y manual pass** at `http://localhost:8000/` with DevTools at 375px and 1280px:
  - Mobile menu opens; nav shows Work / Research & Writing / About.
  - Each page has ≥1 portrait visible on mobile (home: suit; about: suit; writing: train; work: café).
  - No layout shift on image load (explicit width/height present).
  - Skip link works; focus outlines visible; portrait `alt` present and meaningful.

- [ ] **Step 7: Push the branch**

```bash
git push -u origin feat/premium-personal-ecosystem
```

- [ ] **Step 8: (Optional) open a PR** if the user wants review before deploy.

---

## Self-review notes (author)

- **Spec coverage:** nav model (T3,T4,T5,T6,T7) · homepage incl. Current Focus + identity (T7) · Work incl. Featured (T5) · Writing hub (T6) · sections stay live, no redirects (T3 + footer links, no redirect tasks) · simpler mark (T1) · portraits suit/train/café (T4,T7,T6,T5) · SEO additive + sitemap + JSON-LD (T5,T6,T8, breadcrumbs in T3/T4) · analytics identical block (every new/edited page + T11 sweep) · OG card (T9) · Polish Pass before verify/deploy (T10) · final verification + push (T11). All spec sections map to a task.
- **Placeholder scan:** no TBD/TODO; the only conditional is T9's rasterizer fallback, which is fully specified with a documented no-op path.
- **Consistency:** class names (`.portrait`, `.product-list`, `.featured-grid`, `.identity`, `.current-focus`, `.work-trust`, `.bio-2col`) defined in T2 are exactly the ones used in T4–T7. Portrait files: `portrait-2` (home+about), `portrait-1` (writing), `portrait-3-work` (work). Analytics IDs identical across tasks.
