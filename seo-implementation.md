# SEO & Indexing Implementation Report — petrohrys.com

*Generated: April 11, 2026 | Senior Technical SEO Audit*

---

## 1. Sitemap.xml — DELIVERED

**File:** `new-sitemap.xml` (ready to deploy as `/sitemap.xml`)

10 indexable pages included. Only pages that actually exist and return 200 are listed. Blog hub (`/blog/`) intentionally excluded until the page is built — submitting URLs that 404 wastes crawl budget and signals poor site hygiene to Googlebot.

**When to update:** Add `/blog/` entry once the hub page is live. Add individual blog posts as they publish. Update `<lastmod>` dates whenever page content changes materially.

---

## 2. Robots.txt — DELIVERED

**File:** `new-robots.txt` (ready to deploy as `/robots.txt`)

Key decisions:

- **Allow everything for search crawlers.** The site is small (10 pages) — no reason to restrict Googlebot, Bingbot, etc.
- **Block common junk paths** (`/cgi-bin/`, `*.json`, `/wp-admin/`, `/wp-includes/`) to prevent accidental indexing if a CMS layer is ever added.
- **Block AI training crawlers** (GPTBot, ChatGPT-User, CCBot, Google-Extended, Bytespider, anthropic-ai). This is optional but recommended — it prevents your content from being used in AI training datasets without consent, and it has zero impact on search rankings.

---

## 3. Meta Tags — ALL 10 PAGES UPDATED

Every page now has:

| Tag | Before (count with it) | After |
|-----|----------------------|-------|
| `<title>` | 10/10 | 10/10 (improved wording + brand suffix) |
| `meta description` | 10/10 | 10/10 (rewritten for CTR) |
| `link rel="canonical"` | 1/10 | **10/10** |
| `meta og:title` | 3/10 | **10/10** |
| `meta og:description` | 3/10 | **10/10** |
| `meta og:url` | 3/10 | **10/10** |
| `meta og:type` | 3/10 | **10/10** |
| `meta og:image` | 3/10 | **10/10** |
| `meta og:site_name` | 0/10 | **10/10** |
| `meta twitter:card` | 3/10 | **10/10** |
| `meta twitter:site` | 0/10 | **10/10** |
| `meta twitter:title` | 3/10 | **10/10** |
| `meta twitter:description` | 3/10 | **10/10** |
| `meta twitter:image` | 3/10 | **10/10** |

### Title Tag Strategy

Format: `[Product Name] — [Key Benefit/Feature] | Petro Hrys`

The brand suffix `| Petro Hrys` reinforces entity recognition and branded search. Titles are 50–65 characters (within Google's display limit).

| Page | Title |
|------|-------|
| Homepage | Petro Hrys – Privacy-First App Developer |
| PDF Editor | PDF Editor — Edit, Convert & Sign PDFs on iOS & Android \| Petro Hrys |
| Unzip | Unzip — RAR, ZIP, 7z Extractor for iOS & Android \| Petro Hrys |
| Pocket Manager | Pocket Manager — Budget Tracker & Expense Tracking App \| Petro Hrys |
| Smart Printer | Smart Printer: Wireless Printing & Document Scanner for iPhone \| Petro Hrys |
| Invoice Maker | Invoice Maker — Create Professional Invoices in 60 Seconds \| Petro Hrys |
| CV Builder | CV Builder — ATS-Friendly Resume Builder for iPhone \| Petro Hrys |
| TCG Scanner | TCG Card Value Scanner — AI Card Recognition & Price Tracking \| Petro Hrys |
| TwinPhone | TwinPhone — Virtual Phone Numbers in 145+ Countries \| Petro Hrys |
| FAX | FAX: Send from Phone — Send Faxes from Your iPhone \| Petro Hrys |

### Meta Description Strategy

Each description is 140–160 characters, includes the product's key value prop, and ends with a differentiator (privacy, offline, free, etc.) to boost CTR from SERPs.

### Canonical Tags

Every page now self-references with `https://www.petrohrys.com/[slug]/` (trailing slash, www prefix). This is critical to prevent duplicate content issues between `www` and non-www, and between trailing-slash and no-trailing-slash variants.

**Server-side requirement:** Configure your hosting to 301-redirect `petrohrys.com` → `www.petrohrys.com` and non-trailing-slash → trailing-slash. Without this, canonicals are suggestions, not directives.

---

## 4. Open Graph + Twitter Cards — ALL 10 PAGES UPDATED

### OG Image Strategy

All pages reference `https://www.petrohrys.com/og/[product-slug].png`. You need to create a `/og/` directory with these images:

| File | Dimensions | Content suggestion |
|------|-----------|-------------------|
| `/og/pdf-editor.png` | 1200×630 | Product name + app icon + "Edit PDFs on iPhone" tagline |
| `/og/unzip.png` | 1200×630 | Product name + app icon + "Extract any archive" tagline |
| `/og/pocket-manager.png` | 1200×630 | Product name + app icon + "Track expenses in 30 seconds" |
| `/og/smart-printer.png` | 1200×630 | Product name + app icon + "Print from iPhone" |
| `/og/invoice-maker.png` | 1200×630 | Product name + app icon + "Invoice in 60 seconds" |
| `/og/cv-builder.png` | 1200×630 | Product name + app icon + "ATS-friendly resumes" |
| `/og/tcg-scanner.png` | 1200×630 | Product name + app icon + "Scan cards, get prices" |
| `/og/twinphone.png` | 1200×630 | Product name + logo + "145+ countries" |
| `/og/fax.png` | 1200×630 | Product name + app icon + "Fax from iPhone" |

The homepage uses the existing `/photo1.jpg`. This works, but consider creating a dedicated `/og/homepage.png` with "Petro Hrys — Privacy-First Apps" for better social sharing.

**Design guidelines for OG images:**
- 1200×630px (2:1 ratio, works on all platforms)
- White or light background (#f7f7f5 to match site)
- App icon prominently displayed
- Product name in DM Sans bold
- 1-line tagline
- No URL text (waste of space — the platform shows the URL separately)

---

## 5. Internal Linking — Audit & Recommendations

### Current State

The homepage links to all 9 product pages (good). Each product page links to 2–3 related products (good). However, there are structural gaps:

### Issues Found

**Issue 1: Ghost pages referenced in navigation and footers**

Several pages link to paths that don't exist yet:

| Ghost Path | Referenced From | Impact |
|-----------|----------------|--------|
| `/blog/` | Homepage, most product pages | Clicks → 404 |
| `/about/` | Homepage footer, several product pages | Clicks → 404 |
| `/contact/` | PDF Editor, Pocket Manager, TCG Scanner, FAX | Clicks → 404 |
| `/privacy/` | Homepage footer, several product pages | Clicks → 404 |
| `/terms/` | Homepage footer, several product pages | Clicks → 404 |
| `/support/` | PDF Editor, TCG Scanner, FAX | Clicks → 404 |
| `/faq/` | PDF Editor, FAX | Clicks → 404 |
| `/document-tools/` | Unzip, Smart Printer breadcrumbs | Clicks → 404 |
| `/business-tools/` | Pocket Manager breadcrumbs | Clicks → 404 |
| Various `/blog/[slug]` | Multiple product pages | Clicks → 404 |

**Recommendation:** These are not SEO-blocking, but they hurt UX. Priority fix order:

1. **Immediate:** Remove `/about/`, `/contact/`, `/privacy/`, `/terms/` from navigation if they don't exist. OR: Create minimal placeholder pages. The homepage already has `#about` and `#contact` sections — link to those anchors instead of standalone pages.
2. **Soon:** Create the `/blog/` hub page (even if it's just a landing page with "Coming soon" and an email signup).
3. **Later:** Create category pages (`/document-tools/`, `/business-tools/`) once you have enough content to justify them.

**Issue 2: Isolated products**

FAX, TCG Scanner, and TwinPhone are only cross-linked from the homepage. Other product pages don't link to them in their "Related" sections.

**Recommendation:** Update related-product sections:
- Smart Printer should link to FAX (both are document-output tools)
- CV Builder should link to TCG Scanner (both are "personal" tools)
- PDF Editor should link to FAX (both handle documents)

**Issue 3: Blog links to non-existent articles**

23 unique blog article URLs are referenced across product pages. These will all 404 until articles are published.

**Recommendation:** This is acceptable as a forward-looking structure. However, if you won't publish blog content within 30 days, temporarily remove the blog preview sections from product pages. Googlebot penalizes pages with many broken outbound links.

### Internal Linking Matrix (Current)

```
                  PDF  Unzip  PM  SP  IM  CV  TCG  TP  FAX
Homepage     →     ✅    ✅   ✅   ✅   ✅   ✅   ✅   ✅   ✅
PDF Editor   →     —    ✅    —   ✅   ✅    —    —    —    —
Unzip        →    ✅     —   ✅   ✅    —    —    —    —    —
Pocket Mgr   →    ✅     —    —    —   ✅   ✅    —    —    —
Smart Print  →    ✅    ✅    —    —   ✅    —    —    —    —
Invoice Mkr  →    ✅     —   ✅    —    —   ✅    —    —    —
CV Builder   →    ✅     —   ✅    —   ✅    —    —    —    —
TCG Scanner  →    ✅     —   ✅    —    —   ✅    —    —    —
TwinPhone    →    ✅     —    —    —   ✅   ✅    —    —    —
FAX          →    ✅     —    —   ✅   ✅    —    —    —    —
```

**Inbound link count per product page:**
- PDF Editor: 8 (excellent)
- Invoice Maker: 6 (good)
- CV Builder: 5 (good)
- Pocket Manager: 4 (okay)
- Smart Printer: 3 (needs more)
- Unzip: 3 (needs more)
- TCG Scanner: 1 (homepage only — critical gap)
- TwinPhone: 1 (homepage only — critical gap)
- FAX: 1 (homepage only — critical gap)

**Recommended additions:**
- TCG Scanner: Add link from CV Builder ("Other personal tools") and Pocket Manager
- TwinPhone: Add link from Invoice Maker ("For international clients") and FAX
- FAX: Add link from Smart Printer, PDF Editor
- Unzip: Add link from PDF Editor (natural relation)

---

## 6. URL Structure Validation

### Current URLs

| Page | URL Path | Status |
|------|----------|--------|
| Homepage | `/` | ✅ Clean |
| PDF Editor | `/pdf-editor/` | ✅ Clean, descriptive |
| Unzip | `/unzip/` | ✅ Clean, matches product name |
| Pocket Manager | `/pocket-manager/` | ✅ Clean, hyphenated |
| Smart Printer | `/smart-printer/` | ✅ Clean, hyphenated |
| Invoice Maker | `/invoice-maker/` | ✅ Clean, hyphenated |
| CV Builder | `/cv-builder/` | ✅ Clean, hyphenated |
| TCG Scanner | `/tcg-scanner/` | ✅ Clean, hyphenated |
| TwinPhone | `/twinphone/` | ⚠️ No hyphen (inconsistent with others) |
| FAX | `/fax/` | ✅ Clean, short |

**Issue: `/twinphone/` vs `/twin-phone/`**

All other multi-word products use hyphens (`pdf-editor`, `pocket-manager`, `smart-printer`, `invoice-maker`, `cv-builder`, `tcg-scanner`). But `twinphone` has no hyphen.

**Recommendation:** Keep it as-is. The URL matches the product brand name "TwinPhone" (one word). Changing it would break existing backlinks and require a 301 redirect. The SEO cost of the inconsistency is negligible compared to the cost of a URL change.

### Trailing Slash Consistency

All canonical tags use trailing slashes (`/pdf-editor/`). Make sure your server serves these pages with trailing slashes and 301-redirects the non-slash variants.

### www vs non-www

All canonicals use `www.petrohrys.com`. Set up a 301 redirect from `petrohrys.com` → `www.petrohrys.com` in your DNS/hosting.

### HTTPS

All URLs use `https://`. Make sure your hosting has a valid SSL certificate and HTTP → HTTPS redirect.

---

## 7. Indexing Strategy

### Pages to INDEX (all 10)

| Page | Priority | Reasoning |
|------|----------|-----------|
| Homepage | Highest | Brand authority page, links to all products |
| PDF Editor | High | Highest-volume product keyword ("PDF editor app") |
| CV Builder | High | High-intent keyword ("resume builder app") |
| Unzip | High | Specific utility keyword ("unzip RAR iPhone") |
| Invoice Maker | High | High commercial intent ("invoice maker app") |
| Pocket Manager | High | Competitive keyword ("budget tracker app") |
| Smart Printer | Medium | Niche but specific ("print from iPhone") |
| TCG Scanner | Medium | Growing niche ("trading card scanner app") |
| FAX | Medium | Low-volume but high-intent ("fax from iPhone") |
| TwinPhone | Medium | Niche SaaS, external product with own domain |

### Pages to NOINDEX

None currently. With only 10 pages, every page carries weight. Once utility pages are created:

| Future Page | Recommendation |
|-------------|---------------|
| `/privacy/` | `noindex, follow` — legal boilerplate, not worth indexing |
| `/terms/` | `noindex, follow` — legal boilerplate |
| `/support/` | `noindex, follow` — unless it has substantial content |
| `/blog/` (hub) | `index, follow` — once live |
| `/blog/[slug]` | `index, follow` — each article is a ranking opportunity |

### Crawl Priority

Google will naturally prioritize based on internal link count and sitemap priority. Current priority alignment is correct — homepage at 1.0, all products at 0.9.

---

## 8. SEO Issues Found

### Critical (fix before launch)

1. **No server-side redirect rules.** Canonical tags are hints, not enforcement. You MUST configure:
   - `http://` → `https://` (301)
   - `petrohrys.com` → `www.petrohrys.com` (301)
   - `/pdf-editor` → `/pdf-editor/` (trailing slash 301)

2. **OG images don't exist yet.** All 9 product pages reference `/og/[slug].png` files that need to be created. Until they exist, social shares will show blank images — bad for CTR from social platforms.

### High Priority (fix within first week)

3. **23 broken blog links.** Product pages link to `/blog/[slug]` articles that don't exist. Either create the articles, create a generic `/blog/` page that catches these gracefully, or remove the blog preview sections.

4. **Ghost navigation links.** `/about/`, `/contact/`, `/privacy/`, `/terms/` referenced in footers and navs but don't exist. Replace with homepage anchors (`/#about`, `/#contact`) or create placeholder pages.

5. **PDF Editor footer has wrong social links.** The footer section has been fixed (X, Instagram, LinkedIn, YouTube) but verify the links are the correct full URLs (this was addressed in the previous session).

### Medium Priority (fix within first month)

6. **No `hreflang` tags.** If you plan to target non-English markets or use the Czech App Store links, consider adding `hreflang="en"` to signal to Google that the content is in English.

7. **Missing `preconnect` hints on some pages.** Smart Printer, Invoice Maker, TCG Scanner, and FAX are missing `<link rel="preconnect" href="https://fonts.googleapis.com">`. This slows font loading.

8. **Structured data (JSON-LD) inconsistencies.** Some pages have `SoftwareApplication` schema, others don't. Standardize across all product pages for rich snippets in Google.

### Low Priority (optimization)

9. **No favicon consistency.** Homepage uses an inline SVG favicon. Product pages don't specify a favicon (they'll inherit the browser default or nothing). Add a consistent favicon across all pages.

10. **`meta keywords` tag present on some pages.** Google has ignored `meta keywords` since 2009. It does no harm, but it does expose your keyword strategy to competitors. Consider removing it.

---

## 9. OG Image Checklist

Create these files in a `/og/` directory at the root of your site:

```
/og/
├── pdf-editor.png      (1200×630)
├── unzip.png           (1200×630)
├── pocket-manager.png  (1200×630)
├── smart-printer.png   (1200×630)
├── invoice-maker.png   (1200×630)
├── cv-builder.png      (1200×630)
├── tcg-scanner.png     (1200×630)
├── twinphone.png       (1200×630)
└── fax.png             (1200×630)
```

---

## 10. Quick-Win SEO Checklist

- [ ] Deploy `new-sitemap.xml` as `/sitemap.xml`
- [ ] Deploy `new-robots.txt` as `/robots.txt`
- [ ] Set up 301 redirects (http→https, non-www→www, no-slash→slash)
- [ ] Create `/og/` directory with 9 product images (1200×630)
- [ ] Submit sitemap to Google Search Console
- [ ] Submit sitemap to Bing Webmaster Tools
- [ ] Replace ghost nav links with anchor links (`/#about`, `/#contact`)
- [ ] Fix `preconnect` hints on Smart Printer, Invoice Maker, TCG Scanner, FAX
- [ ] Add consistent favicon to all product pages
- [ ] Create `/blog/` hub page (even minimal)
- [ ] Verify structured data with Google Rich Results Test
- [ ] Test all pages with Google PageSpeed Insights
- [ ] Test OG tags with Facebook Sharing Debugger and Twitter Card Validator
