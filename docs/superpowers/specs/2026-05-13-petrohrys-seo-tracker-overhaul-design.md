# petrohrys.com — SEO + Tracker Overhaul Design

**Date:** 2026-05-13
**Author:** Petro Hrys (with Claude)
**Status:** Approved by user, pending implementation
**Repo:** https://github.com/hrhelperg/PetroHrys.compublic (branch: `main`)
**Working copy:** `/Users/petrohrys/PetroHrys.com`

---

## 1. Goal

Replace gtag + CookieYes with WebmasterID (the brief's required tracker), close known SEO gaps from existing planning docs, and add two net-new content surfaces — a standalone `/about/` page and a P1 long-form Unzip blog guide. Stay within the existing "privacy-first mobile app developer / founder of HELPERG" positioning. No service-page invention.

## 2. Constraints

- **Source of truth:** the four in-repo planning docs (`seo-content-plan.md`, `seo-implementation.md`, `site-strategy.md`, `link-preservation-audit.md`). New work must not contradict them.
- **Confirmed factual claims only:** Petro Hrys is a mobile app developer and the founder of HELPERG (the publishing entity behind the apps — verifiable in `com.helperg.*` Android package names). NOT claimed: SaaS builder, AI builder, SEO strategist, growth strategist.
- **Pre-existing live copy stays:** the "9 apps / 145+ countries" stats on the homepage are not changed in this session.
- **No invented metrics, clients, awards, press, or testimonials.**
- **Zero link loss:** every URL documented in `link-preservation-audit.md` continues to resolve.

## 3. Architecture (locked decisions)

| Decision | Choice |
|---|---|
| Tracker | WebmasterID via the exact `<script id="webmasterid-tracker" …>` snippet from the brief |
| Cookie banner | None. WebmasterID is cookieless/fingerprint-free per their own privacy claim; no consent gate is required by GDPR for this model |
| gtag (`G-4RE6YCJZBD`) | Removed from all 41 HTML pages |
| CookieYes | Removed from all 41 HTML pages |
| Delivery | WebmasterID `<script>` added inline to `<head>` of every static HTML page |
| New `/about/` page | Standalone, replaces ghost `/about/` link in footers |
| New blog article | `/blog/how-to-extract-zip-files-iphone/index.html` |
| Localized variants of new pages | Out of scope this session |
| `startups-app/` Next.js subproject | Out of scope this session |

## 4. Section 1 — Tracker overhaul

**Removals:**
- Every `<script async src="https://www.googletagmanager.com/gtag/js?id=G-4RE6YCJZBD">` block.
- Every accompanying `gtag('config', 'G-4RE6YCJZBD')` inline block.
- Every `<script id="cookieyes" … cdn-cookieyes.com …>` line.

**Addition (in `<head>` of every HTML page):**
```html
<script
  id="webmasterid-tracker"
  defer
  src="https://webmasterid.com/tracker.iife.min.js"
  data-wmid="wm_bktqqtd7heom5nkl"
  data-endpoint="https://webmasterid-ingest-api.vercel.app/api/events"
></script>
```

**Verified scope of removal (41 files):** every `*.html` and `*/index.html` under the repo root excluding `startups-app/` (Next.js subproject) and the `node_modules` / `.git` paths.

**Why no consent banner:** WebmasterID's public privacy statement explicitly claims "No third-party cookies. We don't set cookies, period," "No localStorage tracking," no fingerprinting (canvas/fonts/device entropy), IP anonymization at the ingestion edge, and DNT/GPC respected. For that model GDPR consent is not required. If WebmasterID's privacy model changes in future, we add a banner then.

**Risk noted:** trusting WebmasterID's stated model is a privacy decision. If WebmasterID ever changes its privacy model (introduces cookies, fingerprinting, etc.), the unconditional install becomes non-compliant. Updating the existing `/privacy/` page to point at WebmasterID's commitment is a recommended follow-up — not in this session's scope.

## 5. Section 2 — Technical SEO polish

**A. Bing verification placeholder.** Remove the line `<meta name="msvalidate.01" content="PASTE_YOUR_BING_VERIFICATION_CODE_HERE">` from `index.html` line 29. Re-add when a real Bing Webmaster Tools code is available.

**B. Sitemap refresh.** The current `sitemap.xml` already includes `/fax/`, `/articles/`, `/templates/`, `/blog/`, all product pages, and the localized roots. The genuinely missing entries are only the new pages this session creates:
- `/about/` (priority 0.8, monthly) — added once Section 4 ships
- `/blog/how-to-extract-zip-files-iphone/` (priority 0.8, monthly) — added once Section 5 ships

Bump `<lastmod>` to `2026-05-13` only for the pages touched this session: homepage, `/unzip/`, `/about/` (new), `/blog/` (gets a new card), `/blog/how-to-extract-zip-files-iphone/` (new), plus the six product pages touched in Section 3 (internal-linking edits): `pdf-editor`, `invoice-maker`, `pocket-manager`, `smart-printer`, `cv-builder`, `fax`. Do not bump entries for pages with no content change.

**C. Canonical / OG / hreflang audit.** Spot-check new surfaces that grew after April (`fax/`, `articles/`, `templates/`, `startups/`, `startups/raising/`, `submit-startup/`, `blog/index.html`, blog articles, localized roots) and patch missing canonical/OG/hreflang basics. Surface mid-execution if the gap is larger than expected — do not silently inflate scope.

**D. JSON-LD structured data.**
- **Homepage:** add `Organization` (name "HELPERG", founder "Petro Hrys", `sameAs` social handles from `link-preservation-audit.md`), `Person` (Petro), `WebSite`. Currently the homepage has none.
- **Product pages:** add `SoftwareApplication` (name, operatingSystem, applicationCategory, offers price). Skip `aggregateRating` — no verified rating numbers and the "do not invent" rule applies.
- **Blog articles:** `Article` (datePublished, dateModified, author, publisher).
- **New `/about/`:** `AboutPage` with nested `Person`.

**E. robots.txt.** Already in good shape (AI scrapers blocked, sitemap referenced, no over-disallow). No changes.

## 6. Section 3 — Internal-linking gaps

Close the three "critical gap" inbound-link issues from `seo-implementation.md` §5.

| Edit | File | Change |
|---|---|---|
| Add TwinPhone related card | `invoice-maker/index.html` | New related-product card → `/twinphone/` |
| Add TwinPhone related card | `fax/index.html` | New related-product card → `/twinphone/` |
| Add TCG Scanner related card | `cv-builder/index.html` | New related-product card → `/tcg-scanner/` |
| Add TCG Scanner related card | `pocket-manager/index.html` | New related-product card → `/tcg-scanner/` |
| Add FAX related card | `smart-printer/index.html` | New related-product card → `/fax/` |
| Add FAX related card | `pdf-editor/index.html` | New related-product card → `/fax/` |
| Add Unzip related card | `pdf-editor/index.html` | New related-product card → `/unzip/` |

**Resulting inbound counts:** TCG 3, TwinPhone 3, FAX 3, Unzip 4. None of the gap products drop below 3.

**Anchor-text discipline:** problem-led, not product-name-stuffed. Examples:
- "Need a separate number for international clients? → TwinPhone"
- "Also send documents on paper? → FAX from your phone"
- "Manage trading-card collection value? → TCG Card Scanner"

**Not touching:** footer mega-links, legal pages, breadcrumbs.

## 7. Section 4 — New `/about/` page

**Path:** `/about/index.html`
**Word count target:** 550–700.

**Structure:**
1. **H1:** "About Petro Hrys — Mobile App Developer & Founder of HELPERG"
2. **Founder intro** (~120 words) — adapted from the existing `/#about` text on the homepage. Name, role, geographic context (Europe / US, born in Ukraine — already on live site, not invented), kind of software, why privacy-first.
3. **HELPERG ecosystem** (~150 words) — the new factual layer. Explains HELPERG as the publishing entity. Lists the 9 shipping apps in a single sentence with links to each product page. No user/revenue numbers.
4. **What I build & why** (~150 words) — restates the "No accounts / Works offline / One-time or free / Privacy by design" pillars from the homepage's philosophy section. Internal link to `/#philosophy`.
5. **Where to find me** (~80 words) — text version of the contact section. Email matches what is on the live homepage (`hrhelperg@gmail.com`); the audit-doc-proposed `info@petrohrys.com` migration is surfaced as an open question, not silently applied.
6. **Soft CTA** — single line "Explore the apps →" linking to `/#products`. No hard download CTA.

**Head block:**
- Title: `About Petro Hrys — Mobile App Developer & Founder of HELPERG | Petro Hrys`
- Meta description (~155 chars): "Petro Hrys is the mobile app developer behind HELPERG — a small ecosystem of privacy-first iOS & Android tools for documents, files, invoicing, and more."
- Canonical: `https://www.petrohrys.com/about/`
- Full OG + Twitter cards. OG image: reuse existing `/photo1.jpg`.
- hreflang: en self + x-default. No localized variants this session.
- JSON-LD: `AboutPage` with nested `Person`.

**Site-wide link migration:** update top nav and footer "About" link target across all 41 HTML pages from `/#about` (or wherever it currently points) to `/about/`. The `<section id="about">` anchor stays so existing `/#about` inbound links still scroll-to.

**Duplicate-content mitigation:** the homepage `<section id="about">` is shortened to a 2-sentence teaser + "Read full bio →" link to `/about/`. Standalone page becomes canonical bio source. Covered in Section 6.

## 8. Section 5 — New blog article

**Path:** `/blog/how-to-extract-zip-files-iphone/index.html`
**Target keyword:** "extract ZIP iPhone" (P1, ~2,800 monthly search volume, transactional intent).
**Word count target:** 1,800–2,100.

**Structure:**
1. **H1:** "How to Extract ZIP Files on iPhone: A Practical Guide (2026)"
2. Intro / problem statement (~150 words).
3. **What iOS handles natively, and where it falls short** (~250 words) — iOS Files supports ZIP since iOS 13 and TAR; does not handle RAR, 7Z, GZIP, or password-protected archives.
4. **Step-by-step — extract ZIP with iOS Files app** (~300 words) — 4 numbered steps.
5. **When you need a dedicated extractor** (~300 words) — format support beyond ZIP, preview-before-extract, file-size handling. Mentions Unzip product factually, last paragraph; internal link to `/unzip/`.
6. **Troubleshooting** (~300 words) — six failure modes with real answers.
7. **ZIP vs. RAR vs. 7Z** (~250 words) — short factual comparison. Internal link to `/unzip/` (the planned RAR-vs-ZIP article doesn't exist yet, so don't 404 link to it).
8. **FAQ** (~250 words, 5 Q&A) — each Q maps to a real long-tail keyword from the content plan. Wrapped in JSON-LD `FAQPage` schema.
9. Soft CTA (~80 words) — single internal link to `/unzip/`. No hard sell.

**Internal links (3 total):** `/unzip/` (twice), `/pdf-editor/` (once), `/smart-printer/` (once).

**Head block:**
- Title: `How to Extract ZIP Files on iPhone (Step-by-Step Guide) | Petro Hrys`
- Meta description (~155 chars): "Extract ZIP, RAR, and 7Z files on iPhone — step-by-step using built-in iOS tools and when to use a dedicated extractor. Practical 2026 guide."
- Canonical: `https://www.petrohrys.com/blog/how-to-extract-zip-files-iphone/`
- OG image fallback: `/photo1.jpg` (same as recent blog articles — proper OG image is in the out-of-scope list).
- hreflang: en self + x-default.
- JSON-LD: `Article` + `FAQPage`.

**Linking in:** blog hub card (`/blog/index.html`); single "Read more" link from `/unzip/index.html` body; sitemap entry (priority 0.8, lastmod 2026-05-13).

**Homepage "Latest guides" 4-card grid:** unchanged. New article is discoverable via the blog hub.

**Content-safety guardrails enforced while writing:**
- No "studies show X%…" without source.
- No invented company names other than the HELPERG byline.
- No "best in 2026" superlatives in the body without comparison evidence.
- No competitor pricing claims without checking.

## 9. Section 6 — Homepage tweaks

Three pinpoint edits to `index.html`:

1. **Trim the homepage About section** (currently lines 1159–1170) to ~50 words: one paragraph teaser + "Read full bio →" link to `/about/`. The `<section id="about">` anchor stays so existing `/#about` inbound links still resolve.
2. **Add factual HELPERG mention** in the trimmed About section: "I publish my apps under the HELPERG name — you'll see it as the developer on the App Store and Google Play."
3. **Bump homepage `<lastmod>`** in `sitemap.xml` to `2026-05-13`.

**Not touching on the homepage:**
- Hero copy
- "Why I build this way" philosophy section
- "Tools I've built" product cards (Section 3 edits are on the product pages, not the homepage)
- "Impact so far" stats block (`9 / 145+ countries`)
- "Latest guides" 4-card section
- Startup Directory CTA
- Contact + social-links blocks

## 10. Out of scope (explicit)

1. Full `/tools/*` + `/solutions/*` IA restructure from `site-strategy.md`.
2. The 70-article content backlog from `seo-content-plan.md` — this session ships 1 article.
3. Generating real `/og/*.png` images (1200×630).
4. Server-side 301 rules (http→https, non-www→www, no-slash→slash) — needs hosting config access.
5. Real Bing verification code — user said "i dont know"; the placeholder line is removed.
6. The `startups-app/` Next.js subproject.
7. Localized (de/es/fr) versions of new `/about/` page and new blog article.
8. Email migration `hrhelperg@gmail.com` → `info@petrohrys.com` — surfaced as open question; not silently changed.
9. Real screenshots for the new blog article — text-only this session.
10. Verifying the homepage stats claims (`145+ countries`).
11. Adding the new Unzip article to the homepage "Latest guides" 4-card grid.

## 11. Open questions for follow-up

- Real Bing Webmaster Tools verification code, when available.
- Email migration decision (`hrhelperg@gmail.com` vs `info@petrohrys.com`).
- WebmasterID install on `startups-app/` Next.js subproject?
- Localized variants of `/about/` and new blog article — yes/no?
- Should the new Unzip article replace one of the homepage "Latest guides" cards?

## 12. Validation plan (post-implementation)

- Verify `grep -r "G-4RE6YCJZBD"` returns nothing across HTML files.
- Verify `grep -r "cookieyes"` returns nothing across HTML files.
- Verify `grep -r "webmasterid-tracker"` returns one match in every HTML file.
- View-source spot-check on `/`, `/pdf-editor/`, `/about/`, `/blog/how-to-extract-zip-files-iphone/`.
- `xmllint --noout sitemap.xml` for syntax.
- Open `/about/` and the new blog article in a browser; verify HTTP 200, JSON-LD parses in Google Rich Results Test (manual).
- Verify all links in changed pages return HTTP 200 (no new ghost links introduced).

## 13. Deliverable report (after implementation)

1. Files modified (full list with line counts).
2. Files added (`/about/index.html`, `/blog/how-to-extract-zip-files-iphone/index.html`).
3. SEO improvements summary (sitemap entries added, JSON-LD added, internal links added).
4. WebmasterID implementation method used (script tag, unconditional, no consent gate).
5. Validation results (per §12).
6. Risks and recommended next steps (per §11).
