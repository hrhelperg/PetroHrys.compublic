# PetroHrys.com Phase 1 Homepage Reposition — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reposition `petrohrys.com` from "privacy-first app developer" to "digital infrastructure builder" via an editorial-index homepage, five new section landing pages, a shared CSS token system, and an updated sitemap — without touching any existing tool/blog/directory page, the analytics pipeline, or the AI-crawler `robots.txt` policy.

**Architecture:** Static HTML, no build step. One shared stylesheet at `/css/petrohrys.css` defines the design system; six pages (homepage + 5 sections) link to it. All other site pages remain on their own styles, untouched. Analytics order in `<head>` (CookieYes → consent-gated WebmasterID → GA) is byte-identical to the current `feat/webmasterid-tracking-and-ai-page` branch.

**Tech Stack:** Vanilla HTML5 + CSS Custom Properties + Google Fonts (Source Serif 4, DM Sans, JetBrains Mono). No JS framework, no preprocessor, no build pipeline. Verification is browser-based (DevTools, Lighthouse, view-source) plus `curl` and the Google Rich Results validator.

**Spec:** `docs/superpowers/specs/2026-05-20-petrohrys-homepage-reposition-design.md` (commit `2e9e3e2`).

**Branch:** `feat/homepage-reposition-phase-1` (already created, based on `feat/webmasterid-tracking-and-ai-page` so the consent-gated WebmasterID work travels with this branch).

---

## Reading order

- **Task 0** verifies setup.
- **Task 1** creates the CSS file (no HTML uses it yet).
- **Task 2** creates `/research/index.html` and is the first user of the CSS — this is where the design system is visually proven on a real page. Tasks 3–6 mirror Task 2's structure with different content.
- **Task 7** rewrites the homepage.
- **Task 8** updates `sitemap.xml`.
- **Task 9** runs the spec §13 verification checklist.
- **Appendices** at the bottom hold the shared `<head>` template, `<header>` markup, `<footer>` markup, and the full CSS file. Tasks reference these by section number — paste from the appendix when instructed.

Do not invent code. If a task says "paste Appendix B," paste Appendix B verbatim.

---

## Task 0: Setup verification

**Files:** none (read-only checks).

- [ ] **Step 1: Confirm working directory and branch**

Run:
```bash
cd /Users/petrohrys/PetroHrys.com
pwd
git branch --show-current
```

Expected output:
```
/Users/petrohrys/PetroHrys.com
feat/homepage-reposition-phase-1
```

If branch differs, stop and fix before continuing.

- [ ] **Step 2: Confirm clean working tree**

Run:
```bash
git status
```

Expected: `nothing to commit, working tree clean` (or only the plan file you're reading staged/committed).

- [ ] **Step 3: Confirm Python 3 is available for the local server**

Run:
```bash
python3 --version
```

Expected: `Python 3.x.x` (any 3.x). If missing, install via Xcode CLI tools (`xcode-select --install`) or Homebrew.

- [ ] **Step 4: Confirm the spec is present**

Run:
```bash
test -f docs/superpowers/specs/2026-05-20-petrohrys-homepage-reposition-design.md && echo OK
```

Expected: `OK`.

- [ ] **Step 5: Confirm no `/css/` directory exists yet**

Run:
```bash
ls css/ 2>/dev/null || echo "css/ does not exist yet"
```

Expected: `css/ does not exist yet`. (If it exists, stop and reconcile — the spec assumes greenfield for this directory.)

No commit. Move to Task 1.

---

## Task 1: Create the shared stylesheet `/css/petrohrys.css`

**Files:**
- Create: `/Users/petrohrys/PetroHrys.com/css/petrohrys.css`

This task creates the design system in isolation. No HTML page references it yet — Task 2 is the first consumer.

- [ ] **Step 1: Create the directory**

Run:
```bash
mkdir -p /Users/petrohrys/PetroHrys.com/css
```

- [ ] **Step 2: Create `/css/petrohrys.css` with the full content from Appendix D**

Use the Write tool. Paste **Appendix D** of this plan verbatim. Do not edit, abbreviate, or "improve" the CSS — every selector and value is load-bearing per the spec §5.

- [ ] **Step 3: Verify the file is well-formed CSS**

Run:
```bash
wc -l /Users/petrohrys/PetroHrys.com/css/petrohrys.css
```

Expected: a number around `370` (give or take 10 for whitespace). Anything under 300 means the file is incomplete — re-paste Appendix D in full.

- [ ] **Step 4: Stage and commit**

Run:
```bash
cd /Users/petrohrys/PetroHrys.com
git add css/petrohrys.css
git commit -m "feat: add Phase 1 design system stylesheet

Editorial-index token system: Source Serif 4 headlines,
DM Sans body, JetBrains Mono for metadata. Tokens, base
type, header (desktop + mobile <details>), footer, hero,
TOC, entries list, breadcrumb, skip link, reduced-motion
honored. No page references it yet — Task 2 onward."
```

Expected: one commit on `feat/homepage-reposition-phase-1`.

---

## Task 2: Create `/research/index.html` (template-defining section page)

**Files:**
- Create: `/Users/petrohrys/PetroHrys.com/research/index.html`

This is the first page that uses `/css/petrohrys.css` and is the structural template for Tasks 3–6. After this task ships, the design system is visually verified on a real page.

- [ ] **Step 1: Create the directory**

Run:
```bash
mkdir -p /Users/petrohrys/PetroHrys.com/research
```

- [ ] **Step 2: Write `/research/index.html`**

Use the Write tool with the following exact content:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <!-- BEGIN shared head (see Appendix A) -->
  <meta charset="UTF-8">
  <script id="cookieyes" type="text/javascript" src="https://cdn-cookieyes.com/client_data/af075fab2c66644b181224ee/script.js"></script>
  <!-- WebmasterID analytics — consent-gated via CookieYes (analytics category); fires only after consent -->
  <script id="webmasterid-tracker" type="text/plain" data-cookieyes="cookieyes-analytics" defer src="https://webmasterid.com/tracker.iife.min.js" data-wmid="wm_bi42g7vn1sqzkhc9" data-endpoint="https://webmasterid-ingest-api.vercel.app/api/events"></script>
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-4RE6YCJZBD"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-4RE6YCJZBD');
  </script>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="msvalidate.01" content="PASTE_YOUR_BING_VERIFICATION_CODE_HERE">
  <!-- END shared head -->

  <title>Research — Petro Hrys</title>
  <meta name="description" content="Studies of search systems, indexing behavior, and crawl architecture. Independent research by Petro Hrys.">

  <meta property="og:title" content="Research — Petro Hrys">
  <meta property="og:description" content="Studies of search systems, indexing behavior, and crawl architecture.">
  <meta property="og:url" content="https://www.petrohrys.com/research/">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Petro Hrys">
  <meta property="og:image" content="https://www.petrohrys.com/photo1.jpg">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@petrohrys">
  <meta name="twitter:title" content="Research — Petro Hrys">
  <meta name="twitter:description" content="Studies of search systems, indexing behavior, and crawl architecture.">
  <meta name="twitter:image" content="https://www.petrohrys.com/photo1.jpg">

  <link rel="canonical" href="https://www.petrohrys.com/research/">
  <link rel="sitemap" type="application/xml" href="https://www.petrohrys.com/sitemap.xml">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%231a1a1a'/><text x='50%25' y='54%25' dominant-baseline='middle' text-anchor='middle' font-size='18' fill='white'>P</text></svg>">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&family=JetBrains+Mono:wght@500&family=Source+Serif+4:opsz,wght@8..60,400;8..60,500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/petrohrys.css">

  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": "Research",
    "url": "https://www.petrohrys.com/research/",
    "isPartOf": { "@type": "WebSite", "url": "https://www.petrohrys.com/" },
    "breadcrumb": {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.petrohrys.com/" },
        { "@type": "ListItem", "position": 2, "name": "Research", "item": "https://www.petrohrys.com/research/" }
      ]
    }
  }
  </script>
</head>
<body>
  <a class="skip" href="#main">Skip to content</a>

  <!-- BEGIN shared header (see Appendix B) -->
  <header role="banner">
    <nav aria-label="Primary">
      <a href="/" class="wordmark">Petro Hrys</a>
      <ul class="nav-primary">
        <li><a href="/research/" aria-current="page">Research</a></li>
        <li><a href="/infrastructure/">Infrastructure</a></li>
        <li><a href="/ai-systems/">AI Systems</a></li>
        <li><a href="/essays/">Essays</a></li>
        <li><a href="/about/">About</a></li>
      </ul>
      <ul class="nav-lang" aria-label="Language">
        <li><a href="/" >EN</a></li>
        <li><a href="/es/">ES</a></li>
        <li><a href="/fr/">FR</a></li>
        <li><a href="/de/">DE</a></li>
      </ul>
      <details class="nav-mobile">
        <summary>Menu</summary>
        <div class="nav-mobile-panel">
          <ul class="nav-primary">
            <li><a href="/research/" aria-current="page">Research</a></li>
            <li><a href="/infrastructure/">Infrastructure</a></li>
            <li><a href="/ai-systems/">AI Systems</a></li>
            <li><a href="/essays/">Essays</a></li>
            <li><a href="/about/">About</a></li>
          </ul>
          <ul class="nav-lang">
            <li><a href="/">EN</a></li>
            <li><a href="/es/">ES</a></li>
            <li><a href="/fr/">FR</a></li>
            <li><a href="/de/">DE</a></li>
          </ul>
        </div>
      </details>
    </nav>
  </header>
  <!-- END shared header -->

  <main id="main">
    <p class="breadcrumb">
      <a href="/">Home</a><span class="sep">/</span><span aria-current="page">Research</span>
    </p>

    <article class="page-hero">
      <h1>Research</h1>
      <p class="lede">Studies of search systems, indexing behavior, and crawl architecture.</p>
    </article>

    <section aria-labelledby="scope" class="prose">
      <h2 id="scope">Scope</h2>
      <p>Research here focuses on how search systems behave end-to-end &mdash; how crawlers discover and re-discover URLs, how indexers store and rank documents, how retrieval systems compose results, and how the web's surface area shapes what becomes findable. Entries are empirical where possible: small experiments, comparisons of observable behavior across engines, and notes on the systems beneath them.</p>
      <p>Adjacent work in entity architecture, structured data, and AI-driven retrieval is cross-linked rather than duplicated.</p>
    </section>

    <section aria-labelledby="entries">
      <h2 id="entries">Entries</h2>
      <p>First entries arrive in Phase 2.</p>
    </section>

    <section aria-labelledby="related" class="prose">
      <h2 id="related">Related</h2>
      <p>Existing relevant writing: <a href="/artificial-intelligence/">Artificial intelligence as a practical operating layer</a> &middot; <a href="/blog/">Blog archive</a>.</p>
    </section>
  </main>

  <!-- BEGIN shared footer (see Appendix C) -->
  <footer role="contentinfo">
    <div class="footer-grid">
      <section>
        <h3>Sections</h3>
        <ul>
          <li><a href="/research/">Research</a></li>
          <li><a href="/infrastructure/">Infrastructure</a></li>
          <li><a href="/ai-systems/">AI Systems</a></li>
          <li><a href="/essays/">Essays</a></li>
          <li><a href="/about/">About</a></li>
        </ul>
      </section>
      <section id="footer-tools">
        <h3>Tools</h3>
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
  <!-- END shared footer -->
</body>
</html>
```

- [ ] **Step 3: Start a local static server**

Run in a separate terminal (leave running for Tasks 2–9):
```bash
cd /Users/petrohrys/PetroHrys.com
python3 -m http.server 8000
```

Expected: `Serving HTTP on :: port 8000 (http://[::]:8000/) ...`

- [ ] **Step 4: Browser-verify the page renders correctly**

Open: `http://localhost:8000/research/`

Confirm visually:
- Top nav: wordmark "Petro Hrys" left, primary nav center, language switcher right (EN active styling).
- Below nav: breadcrumb line `Home / Research` in small mono uppercase.
- H1 `Research` in serif, big (about 48 px on desktop).
- Lede paragraph in serif, lighter color.
- Three sections (Scope, Entries, Related), each with a serif H2.
- Footer with four columns: Sections, Tools, Index, Legal. Hairline rules between footer top/bottom.
- No cards, no boxes, no colored backgrounds beyond the page bg.
- Body background is warm off-white (`#fafaf8`), text very dark graphite (`#0e0e10`).

If any of the above is missing or visually broken, STOP. The CSS or HTML is wrong; do not proceed.

- [ ] **Step 5: Resize browser to 375 px wide (iPhone SE) and verify mobile**

- Desktop primary-nav `<ul>` collapses; a `Menu` text label is visible top right.
- Clicking `Menu` opens a panel with the 5 primary nav items + EN/ES/FR/DE links.
- Body paragraphs fit within ~30–40 chars per line (no awkward 8-word lines, no horizontal scroll).
- Footer columns stack to 1 column.

- [ ] **Step 6: DevTools Console — confirm no errors**

Open DevTools (Cmd+Opt+I), Console tab. Reload `http://localhost:8000/research/`.

Expected: **zero red errors**. Yellow warnings about CookieYes or fonts are acceptable.

- [ ] **Step 7: DevTools Network — confirm WebmasterID consent gating**

DevTools → Network tab, filter "webmasterid". Reload the page in an incognito window (so CookieYes consent is fresh).

Expected:
- The script `tracker.iife.min.js` request is **NOT** made before consent.
- The script tag in HTML is `<script id="webmasterid-tracker" type="text/plain" ...>` (browser will not execute `type="text/plain"`).
- After clicking "Accept" in the CookieYes banner, CookieYes activates the script (flips its type) and the request fires once.

If the script fires *before* consent, STOP. The `type="text/plain"` and `data-cookieyes="cookieyes-analytics"` attributes are wrong.

- [ ] **Step 8: Validate JSON-LD**

In the browser, View Source. Copy the contents of the `<script type="application/ld+json">` block. Paste into Google's Rich Results Test (`https://search.google.com/test/rich-results`) using "Code" mode.

Expected: zero errors, one detected item (Breadcrumb).

- [ ] **Step 9: Commit**

Run:
```bash
cd /Users/petrohrys/PetroHrys.com
git add research/index.html
git commit -m "feat: add /research/ section landing page

First section page using /css/petrohrys.css. Validates
the design system on a real page: top nav, breadcrumb,
serif H1, three prose sections, shared footer. JSON-LD
WebPage + BreadcrumbList. Consent-gated WebmasterID,
GA, CookieYes preserved byte-identical."
```

---

## Task 3: Create `/infrastructure/index.html`

**Files:**
- Create: `/Users/petrohrys/PetroHrys.com/infrastructure/index.html`

Structurally identical to `/research/` from Task 2. Differences: title, description, breadcrumb name, H1, lede, prose body, and the `aria-current="page"` placement in the nav.

- [ ] **Step 1: Create the directory**

```bash
mkdir -p /Users/petrohrys/PetroHrys.com/infrastructure
```

- [ ] **Step 2: Write `/infrastructure/index.html`**

Start from a copy of `/research/index.html` and apply the changes below. Do not skip any change.

In `<head>`:
- `<title>` → `Infrastructure — Petro Hrys`
- `<meta name="description">` → `Long-form notes on the systems that support discovery and distribution on the open web. Independent infrastructure research by Petro Hrys.`
- `og:title` → `Infrastructure — Petro Hrys`
- `og:description` → `Long-form notes on the systems that support discovery and distribution on the open web.`
- `og:url` → `https://www.petrohrys.com/infrastructure/`
- `twitter:title` → `Infrastructure — Petro Hrys`
- `twitter:description` → matches `og:description`
- `<link rel="canonical">` → `https://www.petrohrys.com/infrastructure/`

In the JSON-LD `<script>`:
```json
{
  "@context": "https://schema.org",
  "@type": "WebPage",
  "name": "Infrastructure",
  "url": "https://www.petrohrys.com/infrastructure/",
  "isPartOf": { "@type": "WebSite", "url": "https://www.petrohrys.com/" },
  "breadcrumb": {
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.petrohrys.com/" },
      { "@type": "ListItem", "position": 2, "name": "Infrastructure", "item": "https://www.petrohrys.com/infrastructure/" }
    ]
  }
}
```

In the top nav (both desktop `<ul class="nav-primary">` and the `<details>` mobile copy): move `aria-current="page"` from the `/research/` link to the `/infrastructure/` link.

In `<main>`:

```html
<p class="breadcrumb">
  <a href="/">Home</a><span class="sep">/</span><span aria-current="page">Infrastructure</span>
</p>

<article class="page-hero">
  <h1>Infrastructure</h1>
  <p class="lede">Long-form notes on the systems that support discovery and distribution on the open web.</p>
</article>

<section aria-labelledby="scope" class="prose">
  <h2 id="scope">Scope</h2>
  <p>The web is held up by a relatively small number of systems &mdash; DNS, CDNs, indexers, ad networks, payment rails, identity providers, hosting platforms &mdash; most of which are invisible to the people who depend on them every day. This section collects long-form notes on those systems: what they do, how they fit together, how they fail, and how independent operators can build durable work on top of them.</p>
  <p>Less timely than research, more concrete than essays.</p>
</section>

<section aria-labelledby="entries">
  <h2 id="entries">Entries</h2>
  <p>First entries arrive in Phase 2.</p>
</section>

<section aria-labelledby="related" class="prose">
  <h2 id="related">Related</h2>
  <p>Existing relevant writing: <a href="/artificial-intelligence/">Artificial intelligence as a practical operating layer</a>.</p>
</section>
```

Footer is unchanged from Task 2 — paste Appendix C verbatim.

- [ ] **Step 3: Browser-verify**

Visit `http://localhost:8000/infrastructure/`. Confirm: H1 `Infrastructure`, lede matches, breadcrumb shows Infrastructure, primary nav `Infrastructure` link is visually marked as current (CSS may not visibly differentiate yet, but `aria-current` is on the right element).

View source → confirm canonical, OG, Twitter, and JSON-LD all point to `/infrastructure/`.

- [ ] **Step 4: Commit**

```bash
cd /Users/petrohrys/PetroHrys.com
git add infrastructure/index.html
git commit -m "feat: add /infrastructure/ section landing page"
```

---

## Task 4: Create `/ai-systems/index.html`

**Files:**
- Create: `/Users/petrohrys/PetroHrys.com/ai-systems/index.html`

Structurally identical to Task 3. The notable content difference: a prominent inline link to the existing `/artificial-intelligence/` page in the Scope prose, because that page already covers the topic in depth and Phase 1 is preserving its URL (URL consolidation deferred to Phase 2).

- [ ] **Step 1: Create directory**

```bash
mkdir -p /Users/petrohrys/PetroHrys.com/ai-systems
```

- [ ] **Step 2: Write `/ai-systems/index.html`**

Start from a copy of `/infrastructure/index.html` and apply:

In `<head>`:
- `<title>` → `AI Systems — Petro Hrys`
- `<meta name="description">` → `How language models, retrieval, and structured data shape modern web intelligence. Independent research by Petro Hrys.`
- `og:title` → `AI Systems — Petro Hrys`
- `og:description` → `How language models, retrieval, and structured data shape modern web intelligence.`
- `og:url` → `https://www.petrohrys.com/ai-systems/`
- `twitter:*` matches
- `<link rel="canonical">` → `https://www.petrohrys.com/ai-systems/`

JSON-LD: same shape as Task 3 with `name: "AI Systems"` and the matching URL.

In nav: `aria-current="page"` moves to `/ai-systems/` link (both desktop and mobile copies).

In `<main>`:

```html
<p class="breadcrumb">
  <a href="/">Home</a><span class="sep">/</span><span aria-current="page">AI Systems</span>
</p>

<article class="page-hero">
  <h1>AI Systems</h1>
  <p class="lede">How language models, retrieval, and structured data shape modern web intelligence.</p>
</article>

<section aria-labelledby="scope" class="prose">
  <h2 id="scope">Scope</h2>
  <p>This section examines how language models, retrieval systems, embeddings, structured data, and entity graphs are changing the web's information layer: how content is discovered when keyword search is no longer the primary interface, how authority is established when the surface of citation expands beyond hyperlinks, and what independent operators can do to remain legible to both classical and AI-driven indexers.</p>
  <p>In-depth existing writing on this topic lives at <a href="/artificial-intelligence/">Artificial intelligence as a practical operating layer</a>. New AI-systems entries arrive here in Phase 2.</p>
</section>

<section aria-labelledby="entries">
  <h2 id="entries">Entries</h2>
  <p>First entries arrive in Phase 2.</p>
</section>

<section aria-labelledby="related" class="prose">
  <h2 id="related">Related</h2>
  <p>Existing relevant writing: <a href="/artificial-intelligence/">Artificial intelligence as a practical operating layer</a>.</p>
</section>
```

- [ ] **Step 3: Browser-verify**

Visit `http://localhost:8000/ai-systems/`. Confirm rendering. Click the inline `/artificial-intelligence/` link — should navigate to the existing AI page (untouched, in its original style). This is expected; Phase 2 will decide on URL consolidation.

- [ ] **Step 4: Commit**

```bash
cd /Users/petrohrys/PetroHrys.com
git add ai-systems/index.html
git commit -m "feat: add /ai-systems/ section landing page

Links to existing /artificial-intelligence/ as related
in-depth content. URL consolidation deferred to Phase 2."
```

---

## Task 5: Create `/essays/index.html` (real list, not a stub)

**Files:**
- Create: `/Users/petrohrys/PetroHrys.com/essays/index.html`

This is the destination of the homepage "All writing →" link, so it ships with a real curated list of existing pieces.

- [ ] **Step 1: Create directory**

```bash
mkdir -p /Users/petrohrys/PetroHrys.com/essays
```

- [ ] **Step 2: Write `/essays/index.html`**

Same `<head>` template as the previous tasks, with these specifics:

- `<title>` → `Essays — Petro Hrys`
- `<meta name="description">` → `Occasional writing on technology, infrastructure, and the digital web. By Petro Hrys.`
- `og:title` → `Essays — Petro Hrys`
- `og:description` → `Occasional writing on technology, infrastructure, and the digital web.`
- `og:url` → `https://www.petrohrys.com/essays/`
- `twitter:*` matches
- `<link rel="canonical">` → `https://www.petrohrys.com/essays/`

JSON-LD: same shape with `name: "Essays"` and matching URL.

Nav: `aria-current="page"` on `/essays/` link.

In `<main>`:

```html
<p class="breadcrumb">
  <a href="/">Home</a><span class="sep">/</span><span aria-current="page">Essays</span>
</p>

<article class="page-hero">
  <h1>Essays</h1>
  <p class="lede">Occasional writing on technology, infrastructure, and the digital web.</p>
</article>

<section aria-labelledby="entries">
  <h2 id="entries">Entries</h2>
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
    <li>
      <a href="/blog/best-pdf-editor-app-iphone-android/">
        <span class="meta">2026 &middot; Tools note</span>
        <span class="title">Notes on the modern mobile PDF editor</span>
      </a>
    </li>
    <li>
      <a href="/blog/smart-printer-guide.html">
        <span class="meta">2026 &middot; Tools note</span>
        <span class="title">How wireless printing actually works on a phone</span>
      </a>
    </li>
  </ul>
  <p class="more">Archive at <a href="/blog/">/blog/</a>.</p>
</section>
```

The displayed titles for the two "Tools note" entries are editorial framings; the destination pages keep their original `<title>` tags. Do **not** modify the destination pages.

Footer unchanged — Appendix C verbatim.

- [ ] **Step 3: Browser-verify**

Visit `http://localhost:8000/essays/`. Confirm:
- Four entries render as rows with a mono date-category column and a serif title.
- Hover on each row shows a subtle tint background.
- Each link is clickable and lands on the correct destination (all four are existing, untouched URLs).
- "Archive at /blog/" link works.

- [ ] **Step 4: Commit**

```bash
cd /Users/petrohrys/PetroHrys.com
git add essays/index.html
git commit -m "feat: add /essays/ section landing page with curated list

Four entries from existing /artificial-intelligence/ and
/blog/. Tools-related entries reframed editorially in
display; destination pages untouched (per spec §6.4)."
```

---

## Task 6: Create `/about/index.html` (real page with finalized copy)

**Files:**
- Create: `/Users/petrohrys/PetroHrys.com/about/index.html`

The body copy is finalized in spec §6.4 and reproduced verbatim below — do not edit it.

- [ ] **Step 1: Create directory**

```bash
mkdir -p /Users/petrohrys/PetroHrys.com/about
```

- [ ] **Step 2: Write `/about/index.html`**

`<head>`:
- `<title>` → `About — Petro Hrys`
- `<meta name="description">` → `Petro Hrys is an independent researcher and engineer working on digital infrastructure: search systems, AI architectures, automation, and the systems that support discovery on the open web.`
- `og:title` → `About — Petro Hrys`
- `og:description` → `Independent researcher and builder working on digital infrastructure.`
- `og:url` → `https://www.petrohrys.com/about/`
- `twitter:*` matches
- `<link rel="canonical">` → `https://www.petrohrys.com/about/`

JSON-LD: same shape as previous section pages with `name: "About"` and matching URL.

Nav: `aria-current="page"` on `/about/` link.

`<main>` content:

```html
<p class="breadcrumb">
  <a href="/">Home</a><span class="sep">/</span><span aria-current="page">About</span>
</p>

<article class="page-hero">
  <h1>About</h1>
  <p class="lede">Independent researcher and builder working on digital infrastructure.</p>
</article>

<section aria-labelledby="bio" class="prose">
  <h2 id="bio" class="visually-hidden">Bio</h2>
  <p>Petro Hrys is a researcher and engineer working independently on digital infrastructure &mdash; the search systems, indexing behavior, AI architectures, and automation layers that shape how information is discovered, retrieved, and surfaced on the open web.</p>
  <p>Born in Ukraine and currently based between Europe and the United States. The practice is small and self-directed: long-form writing, applied research, and a steady cadence of independent infrastructure work. The interest is in the systems beneath the visible web rather than in products built on top of them.</p>
  <p>A small set of independent tools is maintained at their own URLs and <a href="#footer-tools">listed quietly in the footer</a>. They are useful work in adjacent domains, not the primary work.</p>
</section>

<section aria-labelledby="contact" class="prose">
  <h2 id="contact">Contact</h2>
  <p>Available for research collaborations and infrastructure consulting. <a href="mailto:hrhelperg@gmail.com">hrhelperg@gmail.com</a>.</p>
</section>

<section aria-labelledby="elsewhere">
  <h2 id="elsewhere" class="visually-hidden">Elsewhere</h2>
  <p class="socials">
    <a href="https://www.linkedin.com/in/petro-hrys-8306b9401" rel="noopener noreferrer">LinkedIn</a>
    <a href="https://x.com/petrohrys" rel="noopener noreferrer">X</a>
    <a href="https://youtube.com/@petrohrys" rel="noopener noreferrer">YouTube</a>
  </p>
</section>
```

The `visually-hidden` class hides the H2 for the bio (the page-hero H1 is sufficient context) and for "Elsewhere" (the link list reads as a footer). Add this to `/css/petrohrys.css` — see Step 3.

- [ ] **Step 3: Add `.visually-hidden` to `/css/petrohrys.css`**

Open `/css/petrohrys.css` and add at the end (before the `/* ===== End ===== */` comment):

```css
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0,0,0,0);
  white-space: nowrap;
  border: 0;
}
```

- [ ] **Step 4: Browser-verify**

Visit `http://localhost:8000/about/`. Confirm:
- H1 `About`, lede in serif secondary color.
- Three body paragraphs of bio, no visible H2 above them.
- "Contact" section with email mailto link.
- A small line of plain social text links at the bottom (LinkedIn · X · YouTube), no icons.
- Clicking the "listed quietly in the footer" anchor scrolls to the Tools section in the footer.

- [ ] **Step 5: Commit**

```bash
cd /Users/petrohrys/PetroHrys.com
git add about/index.html css/petrohrys.css
git commit -m "feat: add /about/ page with finalized copy

142-word institutional bio (approved in spec §6.4), contact
line, and three plain-text social links. Adds .visually-hidden
utility to /css/petrohrys.css for the silenced bio/elsewhere
H2s. JSON-LD WebPage + BreadcrumbList."
```

---

## Task 7: Rewrite the homepage `/index.html`

**Files:**
- Modify: `/Users/petrohrys/PetroHrys.com/index.html` (complete `<body>` rewrite; `<head>` narrow updates; `<style>` block removed; `<script>` for old hamburger removed)

This is the largest task and the one with the most surface area to verify after. Multiple sequential steps; each step is small.

- [ ] **Step 1: Back up the current homepage** (safety net, not committed)

```bash
cp /Users/petrohrys/PetroHrys.com/index.html /tmp/index.html.pre-reposition.bak
```

If anything goes wrong, the file is recoverable via `git restore` *or* the backup.

- [ ] **Step 2: Rewrite `/index.html`**

Use the Write tool with the following exact content. **This entirely replaces the file.**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <script id="cookieyes" type="text/javascript" src="https://cdn-cookieyes.com/client_data/af075fab2c66644b181224ee/script.js"></script>
  <!-- WebmasterID analytics — consent-gated via CookieYes (analytics category); fires only after consent -->
  <script id="webmasterid-tracker" type="text/plain" data-cookieyes="cookieyes-analytics" defer src="https://webmasterid.com/tracker.iife.min.js" data-wmid="wm_bi42g7vn1sqzkhc9" data-endpoint="https://webmasterid-ingest-api.vercel.app/api/events"></script>
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-4RE6YCJZBD"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-4RE6YCJZBD');
  </script>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Petro Hrys researches search systems, AI architectures, automation, and digital intelligence networks. Independent infrastructure research on the open web.">
  <meta name="msvalidate.01" content="PASTE_YOUR_BING_VERIFICATION_CODE_HERE">

  <meta property="og:title" content="Petro Hrys — Digital infrastructure builder">
  <meta property="og:description" content="Researching search systems, AI architectures, automation, and digital intelligence networks.">
  <meta property="og:image" content="https://www.petrohrys.com/photo1.jpg">
  <meta property="og:url" content="https://www.petrohrys.com/">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Petro Hrys">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@petrohrys">
  <meta name="twitter:title" content="Petro Hrys — Digital infrastructure builder">
  <meta name="twitter:description" content="Researching search systems, AI architectures, automation, and digital intelligence networks.">
  <meta name="twitter:image" content="https://www.petrohrys.com/photo1.jpg">

  <title>Petro Hrys — Digital infrastructure builder</title>

  <link rel="canonical" href="https://www.petrohrys.com/">
  <link rel="alternate" hreflang="en" href="https://www.petrohrys.com/">
  <link rel="alternate" hreflang="es" href="https://www.petrohrys.com/es/">
  <link rel="alternate" hreflang="fr" href="https://www.petrohrys.com/fr/">
  <link rel="alternate" hreflang="de" href="https://www.petrohrys.com/de/">
  <link rel="alternate" hreflang="x-default" href="https://www.petrohrys.com/">
  <link rel="sitemap" type="application/xml" href="https://www.petrohrys.com/sitemap.xml">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%231a1a1a'/><text x='50%25' y='54%25' dominant-baseline='middle' text-anchor='middle' font-size='18' fill='white'>P</text></svg>">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&family=JetBrains+Mono:wght@500&family=Source+Serif+4:opsz,wght@8..60,400;8..60,500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/petrohrys.css">

  <script type="application/ld+json">
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
        "sameAs": [
          "https://www.linkedin.com/in/petro-hrys-8306b9401",
          "https://x.com/petrohrys",
          "https://youtube.com/@petrohrys",
          "https://www.instagram.com/wwwpetrohryscom",
          "https://www.reddit.com/u/PetroHrys",
          "https://www.facebook.com/share/178dtga3uH/",
          "https://www.threads.com/@wwwpetrohryscom",
          "https://www.quora.com/profile/Petro-Hrys",
          "https://t.me/Petro_Hrysp",
          "https://truthsocial.com/@HPetro"
        ]
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
  </script>
</head>
<body>
  <a class="skip" href="#main">Skip to content</a>

  <header role="banner">
    <nav aria-label="Primary">
      <a href="/" class="wordmark" aria-current="page">Petro Hrys</a>
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
      <details class="nav-mobile">
        <summary>Menu</summary>
        <div class="nav-mobile-panel">
          <ul class="nav-primary">
            <li><a href="/research/">Research</a></li>
            <li><a href="/infrastructure/">Infrastructure</a></li>
            <li><a href="/ai-systems/">AI Systems</a></li>
            <li><a href="/essays/">Essays</a></li>
            <li><a href="/about/">About</a></li>
          </ul>
          <ul class="nav-lang">
            <li><a href="/" aria-current="page">EN</a></li>
            <li><a href="/es/">ES</a></li>
            <li><a href="/fr/">FR</a></li>
            <li><a href="/de/">DE</a></li>
          </ul>
        </div>
      </details>
    </nav>
  </header>

  <main id="main">
    <article class="hero">
      <p class="eyebrow">Petro Hrys</p>
      <h1>Digital infrastructure builder.</h1>
      <p class="lede">Researching search systems, AI architectures, automation, and digital intelligence networks.</p>
    </article>

    <section aria-labelledby="now" class="prose">
      <h2 id="now">Now</h2>
      <p>Studying how search systems index and retrieve content, how language models surface information, and how the architecture of the open web is changing as discovery shifts from keyword matching toward entity and intent understanding. Maintaining a small set of independent tools in adjacent domains.</p>
    </section>

    <section aria-labelledby="sections">
      <h2 id="sections">Sections</h2>
      <ol class="toc">
        <li>
          <a href="/research/">
            <span class="num">01</span>
            <span><span class="title">Research</span><span class="lede">Studies of search systems, indexing behavior, and crawl architecture.</span></span>
            <span class="arrow" aria-hidden="true">&rarr;</span>
          </a>
        </li>
        <li>
          <a href="/infrastructure/">
            <span class="num">02</span>
            <span><span class="title">Infrastructure</span><span class="lede">Long-form notes on the systems that support discovery and distribution on the open web.</span></span>
            <span class="arrow" aria-hidden="true">&rarr;</span>
          </a>
        </li>
        <li>
          <a href="/ai-systems/">
            <span class="num">03</span>
            <span><span class="title">AI Systems</span><span class="lede">How language models, retrieval, and structured data shape modern web intelligence.</span></span>
            <span class="arrow" aria-hidden="true">&rarr;</span>
          </a>
        </li>
        <li>
          <a href="/essays/">
            <span class="num">04</span>
            <span><span class="title">Essays</span><span class="lede">Occasional writing on technology, infrastructure, and the digital web.</span></span>
            <span class="arrow" aria-hidden="true">&rarr;</span>
          </a>
        </li>
        <li>
          <a href="/about/">
            <span class="num">05</span>
            <span><span class="title">About</span><span class="lede">Background, current focus, and contact.</span></span>
            <span class="arrow" aria-hidden="true">&rarr;</span>
          </a>
        </li>
      </ol>
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
      <p class="more"><a href="/essays/">All writing &rarr;</a></p>
    </section>

    <section aria-labelledby="contact" class="prose">
      <h2 id="contact">Contact</h2>
      <p>Available for research collaborations and infrastructure work.<br>
      <a href="mailto:hrhelperg@gmail.com">hrhelperg@gmail.com</a></p>
    </section>
  </main>

  <footer role="contentinfo">
    <div class="footer-grid">
      <section>
        <h3>Sections</h3>
        <ul>
          <li><a href="/research/">Research</a></li>
          <li><a href="/infrastructure/">Infrastructure</a></li>
          <li><a href="/ai-systems/">AI Systems</a></li>
          <li><a href="/essays/">Essays</a></li>
          <li><a href="/about/">About</a></li>
        </ul>
      </section>
      <section id="footer-tools">
        <h3>Tools</h3>
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

Note: the `/` wordmark also gets `aria-current="page"` because the user is on the home page; the EN lang option similarly. This is intentional — there are two valid "current" interpretations on the homepage (the page itself, and the current language).

- [ ] **Step 3: Verify no inline `<style>` or hamburger `<script>` remain**

Run:
```bash
grep -n "<style" /Users/petrohrys/PetroHrys.com/index.html
grep -n "hamburger" /Users/petrohrys/PetroHrys.com/index.html
```

Expected: both produce **no output**. If either prints a line, the old code wasn't fully removed.

- [ ] **Step 4: Browser-verify the homepage**

Visit `http://localhost:8000/`. Confirm:
- No animated rotating ring. No portrait. No big CTA buttons.
- Eyebrow `Petro Hrys` in small mono uppercase.
- H1 `Digital infrastructure builder.` in large serif.
- One serif lede paragraph in secondary color.
- "Now" section with one paragraph.
- "Sections" table-of-contents with 5 rows (`01 — Research`, `02 — Infrastructure`, etc.), each row clickable, subtle hover tint, no card backgrounds.
- "Selected writing" with 2 entries.
- "Contact" section with email.
- Footer with 4 columns (Sections / Tools / Index / Legal).

Click each of the 5 section TOC links → each lands on its respective page (created in Tasks 2–6).
Click "All writing →" → lands on `/essays/`.
Click each tool link in the footer → each lands on the existing tool page (untouched, original style).

- [ ] **Step 5: DevTools — verify analytics**

Open Incognito → `http://localhost:8000/`. Network tab → confirm:
- `cdn-cookieyes.com/client_data/.../script.js` requested (CookieYes loader, OK).
- `webmasterid.com/tracker.iife.min.js` **NOT** requested before consent.
- `googletagmanager.com/gtag/js?id=G-4RE6YCJZBD` requested (GA fires regardless of CookieYes — unchanged from current behavior).
- After clicking "Accept" in CookieYes banner → `tracker.iife.min.js` requested once; navigating to `/research/` or `/about/` fires one new `events` POST per page.

- [ ] **Step 6: Validate homepage JSON-LD**

View Source → copy the `<script type="application/ld+json">` → paste into Google Rich Results Test → expect zero errors, three detected items (Person, WebSite, Organization).

- [ ] **Step 7: Commit**

```bash
cd /Users/petrohrys/PetroHrys.com
git add index.html
git commit -m "feat: rewrite homepage to Editorial Index

Reposition from 'privacy-first app developer' to 'digital
infrastructure builder'. Replace product-grid homepage with
type-only hero, Now paragraph, 5-section TOC, Selected writing
(2 entries), Contact, and shared footer. JSON-LD updated:
Person.jobTitle, descriptions, and new WebSite + Organization
entities. SearchAction intentionally omitted until search
ships (Phase 2). Old inline <style> and hamburger JS removed
in favor of /css/petrohrys.css and native <details> nav.
Consent-gated WebmasterID, GA, CookieYes preserved byte-
identical."
```

---

## Task 8: Update `sitemap.xml`

**Files:**
- Modify: `/Users/petrohrys/PetroHrys.com/sitemap.xml`

Adds 5 new section URLs and updates the homepage `<lastmod>`. Preserves every existing entry.

- [ ] **Step 1: Open `sitemap.xml` and find the homepage entry**

Look for:
```xml
<!-- Homepage -->
<url>
  <loc>https://petrohrys.com/</loc>
  <lastmod>2026-04-30</lastmod>
  <changefreq>weekly</changefreq>
  <priority>1.0</priority>
</url>
```

Update `<lastmod>` to `2026-05-20`.

- [ ] **Step 2: Add the 5 new section entries immediately after the homepage entry**

Insert this block after the closing `</url>` of the homepage:

```xml

  <!-- Editorial sections (Phase 1) -->
  <url>
    <loc>https://petrohrys.com/research/</loc>
    <lastmod>2026-05-20</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://petrohrys.com/infrastructure/</loc>
    <lastmod>2026-05-20</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://petrohrys.com/ai-systems/</loc>
    <lastmod>2026-05-20</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://petrohrys.com/essays/</loc>
    <lastmod>2026-05-20</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://petrohrys.com/about/</loc>
    <lastmod>2026-05-20</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
```

- [ ] **Step 3: Validate sitemap XML well-formedness**

Run:
```bash
xmllint --noout /Users/petrohrys/PetroHrys.com/sitemap.xml && echo "VALID"
```

Expected: `VALID`. (If `xmllint` is missing, install via Xcode CLI tools.)

- [ ] **Step 4: Verify all five new URLs are present**

Run:
```bash
grep -c "petrohrys.com/\(research\|infrastructure\|ai-systems\|essays\|about\)/" /Users/petrohrys/PetroHrys.com/sitemap.xml
```

Expected: `5`.

- [ ] **Step 5: Confirm no existing entries were removed**

Run:
```bash
grep -c "<url>" /Users/petrohrys/PetroHrys.com/sitemap.xml
```

Expected: the previous count plus 5. (Before this task the file had N `<url>` entries; after, N+5.) Calculate before vs after with:

```bash
git show HEAD:sitemap.xml | grep -c "<url>"
grep -c "<url>" /Users/petrohrys/PetroHrys.com/sitemap.xml
```

The second number should be exactly the first + 5.

- [ ] **Step 6: Commit**

```bash
cd /Users/petrohrys/PetroHrys.com
git add sitemap.xml
git commit -m "feat: add 5 new section URLs to sitemap

Adds /research/, /infrastructure/, /ai-systems/, /essays/,
and /about/ with lastmod 2026-05-20, monthly changefreq,
priority 0.8. Updates homepage lastmod to 2026-05-20.
All existing entries preserved."
```

---

## Task 9: Full verification pass (spec §13)

**Files:** none (read-only validation).

Run the spec §13 checklist against the deployed local site. **Do not skip any item.**

### 9.1 Per-page validation

For each path in {`/`, `/research/`, `/infrastructure/`, `/ai-systems/`, `/essays/`, `/about/`}:

- [ ] **Step 1: HTTP 200 check**

```bash
for p in / /research/ /infrastructure/ /ai-systems/ /essays/ /about/; do
  echo -n "$p -> "
  curl -sI "http://localhost:8000$p" | head -1
done
```

Expected: `HTTP/1.0 200 OK` (or `HTTP/1.1 200 OK`) for every path.

- [ ] **Step 2: `<html lang="en">` present**

```bash
for p in / /research/ /infrastructure/ /ai-systems/ /essays/ /about/; do
  echo -n "$p -> "
  curl -s "http://localhost:8000$p" | grep -o '<html[^>]*>' | head -1
done
```

Expected: every line ends with `<html lang="en">`.

- [ ] **Step 3: Exactly one `<h1>` per page**

```bash
for p in / /research/ /infrastructure/ /ai-systems/ /essays/ /about/; do
  echo -n "$p -> "
  curl -s "http://localhost:8000$p" | grep -oc '<h1[ >]'
done
```

Expected: every line ends with `1`.

- [ ] **Step 4: Canonical URL self-referential**

```bash
for p in / /research/ /infrastructure/ /ai-systems/ /essays/ /about/; do
  echo "=== $p ==="
  curl -s "http://localhost:8000$p" | grep -o '<link rel="canonical"[^>]*>'
done
```

Expected: each `href` matches the served path (e.g. `/research/` page's canonical is `https://www.petrohrys.com/research/`).

- [ ] **Step 5: Analytics tags present and byte-identical**

```bash
for p in / /research/ /infrastructure/ /ai-systems/ /essays/ /about/; do
  echo "=== $p ==="
  curl -s "http://localhost:8000$p" | grep -E 'cookieyes|webmasterid-tracker|googletagmanager.com/gtag/js'
done
```

Expected: every page shows three matching lines (CookieYes loader, WebmasterID tracker, GA gtag loader). The WebmasterID line must contain `type="text/plain"` and `data-cookieyes="cookieyes-analytics"` literally.

- [ ] **Step 6: Browser smoke test (open each page in turn)**

Open each URL, confirm no console errors, no broken images, no horizontal scrollbar at 1280 px and at 375 px viewport widths.

- [ ] **Step 7: Consent-gating live test**

Fresh incognito → load `http://localhost:8000/`. Network tab open. Confirm:
- `tracker.iife.min.js` does **NOT** appear in the requests list.
- Click "Accept analytics" in the CookieYes banner.
- `tracker.iife.min.js` now appears.
- Navigate to `/research/` → one `webmasterid-ingest-api.vercel.app/api/events` POST request appears.
- Repeat across `/about/` and the homepage — each navigation triggers exactly one events POST.

### 9.2 Project-level validation

- [ ] **Step 8: Existing pages are unchanged**

For each existing path, confirm it still resolves with the original HTML. Spot-check three:

```bash
for p in /cv-builder/ /pdf-editor/ /blog/what-is-business-globalization-open-economies.html /artificial-intelligence/ /es/ /fr/ /de/; do
  echo -n "$p -> "
  curl -sI "http://localhost:8000$p" | head -1
done
```

Expected: every line is `HTTP/1.x 200 OK`.

- [ ] **Step 9: `robots.txt` unchanged**

```bash
cd /Users/petrohrys/PetroHrys.com
git diff main -- robots.txt
```

Expected: **empty output**. If `robots.txt` differs from `main`, STOP — Phase 1 must not touch it.

- [ ] **Step 10: No unintended file deletions**

```bash
cd /Users/petrohrys/PetroHrys.com
git diff --name-status main..HEAD
```

Expected output should be only `A` (added) and `M` (modified) entries — **no `D` (deleted) entries**. Specifically:
- `A docs/superpowers/specs/2026-05-20-petrohrys-homepage-reposition-design.md`
- `A docs/superpowers/plans/2026-05-20-petrohrys-homepage-reposition-plan.md`
- `A css/petrohrys.css`
- `A research/index.html`
- `A infrastructure/index.html`
- `A ai-systems/index.html`
- `A essays/index.html`
- `A about/index.html`
- `M index.html`
- `M sitemap.xml`

If anything is `D`, STOP. Restore the deleted file from `main` and re-verify.

- [ ] **Step 11: Lighthouse — desktop**

In Chrome DevTools → Lighthouse tab → mode "Navigation", device "Desktop", categories: Performance, Accessibility, Best Practices, SEO.

Run against `http://localhost:8000/`. Expected:
- Performance ≥ 90
- Accessibility ≥ 95
- Best Practices ≥ 90
- SEO ≥ 95

Repeat for `/research/` and `/about/` (representative samples). Same thresholds.

- [ ] **Step 12: Lighthouse — mobile**

Same setup but device "Mobile". Same thresholds. If Mobile Performance is < 80, capture LCP and CLS values and add a follow-up task to the Phase-2 backlog — do not block on this for Phase 1 acceptance unless LCP > 4 s or CLS > 0.05.

- [ ] **Step 13: JSON-LD validation across all 6 pages**

For each of the 6 pages, view source, copy the JSON-LD `<script>` content, paste into Google Rich Results Test (`https://search.google.com/test/rich-results`).

Expected: every page returns zero errors. Section pages each show one detected item (Breadcrumb). Homepage shows three detected items (Person, WebSite, Organization).

- [ ] **Step 14: Final commit (if any docs need updating from verification)**

If verification revealed anything that should be noted in the spec or plan (e.g. a Lighthouse issue worth flagging in Phase-2 backlog), update the relevant doc and commit:

```bash
cd /Users/petrohrys/PetroHrys.com
git add docs/
git commit -m "docs: verification notes from Phase 1 acceptance pass"
```

If nothing needs updating, this step is a no-op.

### 9.3 Stop the local server

- [ ] **Step 15: Stop the python server**

In the terminal running `python3 -m http.server 8000`, press `Ctrl+C`.

### 9.4 Branch summary

- [ ] **Step 16: Print the branch summary**

```bash
cd /Users/petrohrys/PetroHrys.com
git log --oneline main..HEAD
git diff --stat main..HEAD
```

Capture the output. This is the "Files changed" report for the user's final-report request.

---

## Self-review (run after writing this plan, before sharing)

**Spec coverage:**
- §2 Goals 1 (positioning above fold): Task 7.
- §2 Goal 2 (5 sections reachable): Tasks 2–6 + nav in every page.
- §2 Goal 3 (shared stylesheet): Task 1.
- §2 Goal 4 (existing URLs intact): Task 9 step 8 + step 10.
- §2 Goal 5 (analytics fire once per page): Task 9 step 5 + step 7.
- §2 Goal 6 (Lighthouse ≥ 95 SEO/A11y): Task 9 step 11 + step 12.
- §3 Non-goals: each task is scoped to additions and homepage rewrite only; no Next.js migration, no tool-page edits, no robots.txt edits.
- §5 design tokens: Appendix D.
- §6.1 nav: every section page Task + Task 7 homepage.
- §6.2 footer: every section page Task + Task 7 homepage.
- §6.3 homepage: Task 7.
- §6.4 section pages: Tasks 2–6.
- §6.5 head template: Appendix A.
- §6.6 homepage JSON-LD: Task 7 step 2.
- §6.7 section JSON-LD: Tasks 2–6.
- §7.1 sitemap: Task 8.
- §7.2 robots.txt unchanged: Task 9 step 9.
- §7.3 hreflang on new pages: not emitted (Tasks 3–6 omit hreflang `<link>` tags).
- §7.4 canonicals self-referential: every Task includes the canonical line.
- §8 analytics preservation: every Task's verification step.
- §9 accessibility: skip link in Tasks 2–7, semantic HTML throughout, `<details>` mobile nav, focus styles in Appendix D, `prefers-reduced-motion` in Appendix D, `aria-current` correctly placed.
- §10 performance: Task 9 steps 11–12.
- §11 Phase 2 backlog: not Phase-1 work, documented in spec only.
- §12 risks: addressed via verification in Task 9.
- §13 verification checklist: Task 9 implements all items.
- §14 files touched: matches Task 9 step 10 expected output exactly.

No gaps.

**Placeholder scan:** searched for `TBD`, `TODO`, `implement later`, `add appropriate`, `etc.`, `similar to`, `as needed`, `if needed`. None present in the plan body. Code blocks contain real code. Verification steps name real commands.

**Type consistency:** CSS class names referenced in HTML tasks (`.hero`, `.eyebrow`, `.lede`, `.toc`, `.entries`, `.breadcrumb`, `.page-hero`, `.prose`, `.socials`, `.visually-hidden`, `.wordmark`, `.nav-primary`, `.nav-lang`, `.nav-mobile`, `.nav-mobile-panel`, `.skip`, `.footer-grid`, `.footer-bottom`, `.num`, `.title`, `.meta`, `.arrow`, `.sep`, `.more`) all exist in Appendix D. JSON-LD entity types (`Person`, `Organization`, `WebSite`, `WebPage`, `BreadcrumbList`, `ListItem`) consistent across all tasks. Section IDs (`#main`, `#now`, `#sections`, `#selected`, `#contact`, `#scope`, `#entries`, `#related`, `#bio`, `#elsewhere`, `#footer-tools`) consistent with their references.

---

## Appendix A: Shared `<head>` template

This block appears (with per-page substitutions) in every Phase 1 page. Substitutions: `<title>`, `<meta name="description">`, the OG/Twitter `title`/`description`/`url`, `<link rel="canonical">`, JSON-LD `name` and `url`. Everything else is constant.

```html
<head>
  <meta charset="UTF-8">
  <script id="cookieyes" type="text/javascript" src="https://cdn-cookieyes.com/client_data/af075fab2c66644b181224ee/script.js"></script>
  <!-- WebmasterID analytics — consent-gated via CookieYes (analytics category); fires only after consent -->
  <script id="webmasterid-tracker" type="text/plain" data-cookieyes="cookieyes-analytics" defer src="https://webmasterid.com/tracker.iife.min.js" data-wmid="wm_bi42g7vn1sqzkhc9" data-endpoint="https://webmasterid-ingest-api.vercel.app/api/events"></script>
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-4RE6YCJZBD"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-4RE6YCJZBD');
  </script>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="msvalidate.01" content="PASTE_YOUR_BING_VERIFICATION_CODE_HERE">

  <title>{{PAGE_TITLE}}</title>
  <meta name="description" content="{{PAGE_DESCRIPTION}}">

  <meta property="og:title" content="{{PAGE_OG_TITLE}}">
  <meta property="og:description" content="{{PAGE_OG_DESCRIPTION}}">
  <meta property="og:url" content="{{PAGE_CANONICAL_URL}}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Petro Hrys">
  <meta property="og:image" content="https://www.petrohrys.com/photo1.jpg">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@petrohrys">
  <meta name="twitter:title" content="{{PAGE_OG_TITLE}}">
  <meta name="twitter:description" content="{{PAGE_OG_DESCRIPTION}}">
  <meta name="twitter:image" content="https://www.petrohrys.com/photo1.jpg">

  <link rel="canonical" href="{{PAGE_CANONICAL_URL}}">
  <link rel="sitemap" type="application/xml" href="https://www.petrohrys.com/sitemap.xml">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%231a1a1a'/><text x='50%25' y='54%25' dominant-baseline='middle' text-anchor='middle' font-size='18' fill='white'>P</text></svg>">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&family=JetBrains+Mono:wght@500&family=Source+Serif+4:opsz,wght@8..60,400;8..60,500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/petrohrys.css">

  <!-- per-page JSON-LD goes here -->
</head>
```

**Homepage-only additions** (insert between `<link rel="canonical">` and `<link rel="sitemap">`):

```html
  <link rel="alternate" hreflang="en" href="https://www.petrohrys.com/">
  <link rel="alternate" hreflang="es" href="https://www.petrohrys.com/es/">
  <link rel="alternate" hreflang="fr" href="https://www.petrohrys.com/fr/">
  <link rel="alternate" hreflang="de" href="https://www.petrohrys.com/de/">
  <link rel="alternate" hreflang="x-default" href="https://www.petrohrys.com/">
```

Section pages do **not** include hreflang `<link>` tags (no translated counterparts exist; deferred to Phase 2 per spec §7.3).

---

## Appendix B: Shared `<header>` markup

Use on all 6 pages. Place exactly one `aria-current="page"` on the primary-nav link matching the current page (the homepage uses it on the wordmark anchor and on the EN lang anchor instead).

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
    <details class="nav-mobile">
      <summary>Menu</summary>
      <div class="nav-mobile-panel">
        <ul class="nav-primary">
          <li><a href="/research/">Research</a></li>
          <li><a href="/infrastructure/">Infrastructure</a></li>
          <li><a href="/ai-systems/">AI Systems</a></li>
          <li><a href="/essays/">Essays</a></li>
          <li><a href="/about/">About</a></li>
        </ul>
        <ul class="nav-lang">
          <li><a href="/" aria-current="page">EN</a></li>
          <li><a href="/es/">ES</a></li>
          <li><a href="/fr/">FR</a></li>
          <li><a href="/de/">DE</a></li>
        </ul>
      </div>
    </details>
  </nav>
</header>
```

---

## Appendix C: Shared `<footer>` markup

Use on all 6 pages, byte-identical.

```html
<footer role="contentinfo">
  <div class="footer-grid">
    <section>
      <h3>Sections</h3>
      <ul>
        <li><a href="/research/">Research</a></li>
        <li><a href="/infrastructure/">Infrastructure</a></li>
        <li><a href="/ai-systems/">AI Systems</a></li>
        <li><a href="/essays/">Essays</a></li>
        <li><a href="/about/">About</a></li>
      </ul>
    </section>
    <section id="footer-tools">
      <h3>Tools</h3>
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

## Appendix D: Full `/css/petrohrys.css`

Paste verbatim into `/css/petrohrys.css` in Task 1, Step 2.

```css
/* /css/petrohrys.css
   Phase 1 — Editorial Index design system.
   Loaded only by homepage and the 5 new section pages.
   Source of truth: docs/superpowers/specs/2026-05-20-petrohrys-homepage-reposition-design.md */

/* ===== Tokens ===== */
:root {
  /* Color */
  --bg: #fafaf8;
  --text: #0e0e10;
  --text-2: #5a5a5e;
  --text-3: #9a9aa0;
  --rule: #e6e6e1;
  --hover-tint: rgba(14, 14, 16, 0.025);

  /* Type families */
  --ff-serif: 'Source Serif 4', Georgia, 'Times New Roman', serif;
  --ff-sans:  'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --ff-mono:  'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;

  /* Type scale */
  --fs-xs: 0.75rem;     /* 12 px */
  --fs-sm: 0.875rem;    /* 14 px */
  --fs-md: 1.125rem;    /* 18 px */
  --fs-lg: 1.375rem;    /* 22 px */
  --fs-xl: 1.75rem;     /* 28 px */
  --fs-display: clamp(2.5rem, 6vw, 4rem); /* 40 → 64 px */

  /* Spacing (8 px grid) */
  --s-0: 0.25rem;  /* 4  */
  --s-1: 0.5rem;   /* 8  */
  --s-2: 0.75rem;  /* 12 */
  --s-3: 1rem;     /* 16 */
  --s-4: 1.5rem;   /* 24 */
  --s-5: 2rem;     /* 32 */
  --s-6: 3rem;     /* 48 */
  --s-7: 4rem;     /* 64 */
  --s-8: 6rem;     /* 96 */
  --s-9: 8rem;     /* 128 */

  /* Layout widths */
  --col-main: 720px;
  --col-text: 580px;
  --col-footer: 1080px;

  /* Borders */
  --rule-w: 1px;
}

/* ===== Reset ===== */
*, *::before, *::after { box-sizing: border-box; }
body, h1, h2, h3, h4, p, ul, ol, figure { margin: 0; padding: 0; }
ul, ol { list-style: none; }
img { max-width: 100%; height: auto; display: block; }

/* ===== Base ===== */
html { scroll-behavior: smooth; }

@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after {
    transition-duration: 0.001ms !important;
    animation-duration: 0.001ms !important;
  }
}

body {
  font-family: var(--ff-sans);
  font-size: var(--fs-md);
  line-height: 1.6;
  color: var(--text);
  background: var(--bg);
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
}

h1, h2, h3 {
  font-family: var(--ff-serif);
  color: var(--text);
  font-weight: 500;
}
h1 {
  font-size: var(--fs-display);
  line-height: 1.05;
  letter-spacing: -0.02em;
  font-weight: 400;
}
h2 {
  font-size: var(--fs-xl);
  line-height: 1.2;
  letter-spacing: -0.015em;
}
h3 {
  font-size: var(--fs-lg);
  line-height: 1.3;
}

p { max-width: var(--col-text); }

a {
  color: var(--text);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 4px;
  text-decoration-color: var(--rule);
  transition: text-decoration-color 150ms ease;
}
a:hover { text-decoration-color: var(--text); }
a:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 3px;
  border-radius: 2px;
}

/* ===== Skip link ===== */
.skip {
  position: absolute;
  left: -9999px;
  top: var(--s-3);
}
.skip:focus {
  left: var(--s-3);
  background: var(--text);
  color: var(--bg);
  padding: var(--s-1) var(--s-3);
  text-decoration: none;
  z-index: 1000;
}

/* ===== Header / Top nav ===== */
header[role="banner"] {
  position: sticky;
  top: 0;
  background: var(--bg);
  border-bottom: var(--rule-w) solid var(--rule);
  z-index: 100;
}
header > nav {
  max-width: var(--col-footer);
  margin: 0 auto;
  padding: var(--s-3) var(--s-4);
  display: flex;
  align-items: center;
  gap: var(--s-5);
}
.wordmark {
  font-family: var(--ff-serif);
  font-size: var(--fs-md);
  font-weight: 500;
  text-decoration: none;
  letter-spacing: -0.01em;
  flex: 0 0 auto;
  margin-right: auto;
  color: var(--text);
}
.wordmark:hover { text-decoration: none; }
.nav-primary, .nav-lang {
  display: flex;
  gap: var(--s-4);
}
.nav-primary a {
  font-size: var(--fs-sm);
  font-weight: 500;
  text-decoration: none;
  color: var(--text);
}
.nav-primary a:hover { text-decoration: underline; text-decoration-color: var(--text); }
.nav-primary [aria-current="page"] { text-decoration: underline; text-decoration-color: var(--text); }
.nav-lang {
  gap: var(--s-2);
  margin-left: var(--s-4);
}
.nav-lang a {
  font-size: var(--fs-xs);
  font-weight: 500;
  color: var(--text-3);
  text-decoration: none;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.nav-lang [aria-current="page"] { color: var(--text); }
.nav-lang a:hover { color: var(--text); }

/* Mobile <details> nav — hidden on desktop */
.nav-mobile { display: none; }
.nav-mobile-panel { display: none; }

@media (max-width: 767px) {
  header > nav > .nav-primary,
  header > nav > .nav-lang { display: none; }

  header > nav {
    gap: var(--s-3);
    position: relative;  /* anchor for the absolute panel below */
  }

  .nav-mobile {
    display: block;
    margin-left: auto;
    position: static;
  }
  .nav-mobile summary {
    list-style: none;
    cursor: pointer;
    font-size: var(--fs-sm);
    font-weight: 500;
    padding: var(--s-1) var(--s-2);
  }
  .nav-mobile summary::-webkit-details-marker { display: none; }
  .nav-mobile summary::marker { content: ""; }
  .nav-mobile[open] summary { color: var(--text-3); }

  /* The wrapper panel: single absolutely-positioned overlay holding both ULs */
  .nav-mobile[open] > .nav-mobile-panel {
    display: flex;
    flex-direction: column;
    gap: var(--s-5);
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--bg);
    border-bottom: var(--rule-w) solid var(--rule);
    padding: var(--s-4);
    z-index: 99;
  }
  .nav-mobile-panel .nav-primary,
  .nav-mobile-panel .nav-lang {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    padding: 0;
    margin: 0;
  }
  .nav-mobile-panel .nav-lang {
    border-top: var(--rule-w) solid var(--rule);
    padding-top: var(--s-3);
  }
  .nav-mobile-panel .nav-lang a {
    color: var(--text-3);
  }
}

/* ===== Main ===== */
main {
  max-width: var(--col-main);
  margin: 0 auto;
  padding: var(--s-8) var(--s-4) var(--s-9);
}
@media (max-width: 640px) {
  main { padding: var(--s-7) var(--s-4); }
}
main > * + * { margin-top: var(--s-8); }
@media (max-width: 640px) {
  main > * + * { margin-top: var(--s-7); }
}

/* ===== Hero (homepage) ===== */
.hero .eyebrow {
  font-family: var(--ff-mono);
  font-size: var(--fs-xs);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-3);
  margin-bottom: var(--s-4);
}
.hero h1 {
  max-width: 14ch;
  margin-bottom: var(--s-4);
}
.hero .lede {
  font-family: var(--ff-serif);
  font-size: var(--fs-lg);
  line-height: 1.45;
  color: var(--text-2);
  max-width: var(--col-text);
}

/* ===== Page hero (section pages) ===== */
.page-hero h1 {
  font-size: clamp(2rem, 5vw, 3rem);
  margin-bottom: var(--s-3);
  max-width: 18ch;
}
.page-hero .lede {
  font-family: var(--ff-serif);
  font-size: var(--fs-md);
  color: var(--text-2);
  max-width: var(--col-text);
}

/* ===== Section heading ===== */
section > h2 { margin-bottom: var(--s-4); }

/* ===== Prose blocks ===== */
.prose p + p { margin-top: var(--s-3); }

/* ===== TOC (homepage) ===== */
.toc { border-top: var(--rule-w) solid var(--rule); }
.toc li { border-bottom: var(--rule-w) solid var(--rule); }
.toc a {
  display: grid;
  grid-template-columns: 4ch 1fr auto;
  gap: var(--s-4);
  padding: var(--s-4) var(--s-2);
  text-decoration: none;
  align-items: start;
  transition: background 150ms ease;
}
.toc a:hover { background: var(--hover-tint); }
.toc .num {
  font-family: var(--ff-mono);
  font-size: var(--fs-xs);
  letter-spacing: 0.06em;
  color: var(--text-3);
  padding-top: 0.4em;
}
.toc .title {
  font-family: var(--ff-serif);
  font-size: var(--fs-lg);
  font-weight: 500;
  display: block;
  color: var(--text);
}
.toc .lede {
  font-size: var(--fs-sm);
  color: var(--text-2);
  margin-top: var(--s-1);
  display: block;
  max-width: 56ch;
}
.toc .arrow {
  color: var(--text-3);
  font-size: var(--fs-md);
  align-self: center;
}
@media (max-width: 640px) {
  .toc a { grid-template-columns: 4ch 1fr; }
  .toc .arrow { display: none; }
}

/* ===== Entries list (Selected writing / Essays) ===== */
.entries { border-top: var(--rule-w) solid var(--rule); }
.entries li { border-bottom: var(--rule-w) solid var(--rule); }
.entries a {
  display: grid;
  grid-template-columns: 14ch 1fr;
  gap: var(--s-4);
  padding: var(--s-4) var(--s-2);
  text-decoration: none;
  align-items: baseline;
  transition: background 150ms ease;
}
.entries a:hover { background: var(--hover-tint); }
.entries .meta {
  font-family: var(--ff-mono);
  font-size: var(--fs-xs);
  color: var(--text-3);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.entries .title {
  font-family: var(--ff-serif);
  font-size: var(--fs-md);
  font-weight: 500;
  color: var(--text);
}
@media (max-width: 640px) {
  .entries a { grid-template-columns: 1fr; gap: var(--s-1); }
}

.more {
  margin-top: var(--s-4);
  font-size: var(--fs-sm);
}

/* ===== Breadcrumb (section pages) ===== */
.breadcrumb {
  font-family: var(--ff-mono);
  font-size: var(--fs-xs);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-3);
  margin-bottom: var(--s-5);
  max-width: none;
}
.breadcrumb a {
  color: var(--text-3);
  text-decoration: none;
}
.breadcrumb a:hover { color: var(--text); }
.breadcrumb .sep { margin: 0 var(--s-1); }

/* ===== About page socials list ===== */
.socials {
  font-size: var(--fs-sm);
  color: var(--text-3);
  max-width: none;
}
.socials a {
  color: var(--text-3);
  margin-right: var(--s-3);
  text-decoration: none;
}
.socials a:hover {
  color: var(--text);
  text-decoration: underline;
  text-decoration-color: var(--text);
}

/* ===== Visually-hidden utility ===== */
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* ===== Footer ===== */
footer[role="contentinfo"] {
  border-top: var(--rule-w) solid var(--rule);
  padding: var(--s-7) var(--s-4) var(--s-5);
  margin-top: var(--s-9);
  background: var(--bg);
}
.footer-grid {
  max-width: var(--col-footer);
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--s-5);
}
@media (max-width: 959px) {
  .footer-grid { grid-template-columns: repeat(2, 1fr); gap: var(--s-6); }
}
@media (max-width: 639px) {
  .footer-grid { grid-template-columns: 1fr; gap: var(--s-5); }
}
.footer-grid h3 {
  font-family: var(--ff-mono);
  font-size: var(--fs-xs);
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-3);
  margin-bottom: var(--s-3);
}
.footer-grid ul {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
}
.footer-grid a {
  font-size: var(--fs-sm);
  color: var(--text);
  text-decoration: none;
}
.footer-grid a:hover {
  text-decoration: underline;
  text-decoration-color: var(--text);
}
.footer-bottom {
  max-width: var(--col-footer);
  margin: var(--s-6) auto 0;
  padding-top: var(--s-4);
  border-top: var(--rule-w) solid var(--rule);
  font-size: var(--fs-xs);
  color: var(--text-3);
}

/* ===== End ===== */
```
