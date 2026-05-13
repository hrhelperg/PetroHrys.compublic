# petrohrys.com — SEO + Tracker Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace gtag + CookieYes with cookieless WebmasterID across all static HTML pages, close known SEO/structured-data/internal-linking gaps, and ship a new `/about/` page plus one long-form P1 blog guide for Unzip.

**Architecture:** This is a static HTML site (no framework). The tracker change is a global find/insert across ~41 HTML files (verified with `grep`). New content surfaces are created from scratch with full SEO head blocks and JSON-LD. Internal-linking edits are surgical card insertions in product pages. Sitemap + JSON-LD changes go last so they reflect final state.

**Tech Stack:** HTML, CSS, vanilla JS. No build step. Verification via `grep`, `xmllint`, `find`, manual JSON-LD validation in Google Rich Results Test.

**Spec:** `docs/superpowers/specs/2026-05-13-petrohrys-seo-tracker-overhaul-design.md` — read it first if context is unclear.

**Test convention (adapted for static HTML/SEO):** TDD here means "verify current state → make change → verify new state → commit." Verifications are `grep` counts, `xmllint --noout`, and `curl -s -o /dev/null -w "%{http_code}"` for HTTP status spot-checks. There are no pytest-style unit tests in this repo.

---

## Task 1: Baseline verification (read-only, no changes)

**Files:** none modified — this is a pre-flight assertion that the spec's assumptions still hold.

- [ ] **Step 1: Count gtag + CookieYes occurrences (expected pre-state)**

Run:
```bash
cd /Users/petrohrys/PetroHrys.com
echo "gtag config blocks:"; grep -rl "G-4RE6YCJZBD" --include="*.html" . | wc -l
echo "CookieYes script tags:"; grep -rl "id=\"cookieyes\"" --include="*.html" . | wc -l
echo "WebmasterID tags (should be 0):"; grep -rl "webmasterid-tracker" --include="*.html" . | wc -l
echo "Bing placeholder lines (should be 1, on homepage):"; grep -rl "PASTE_YOUR_BING_VERIFICATION_CODE_HERE" --include="*.html" . | wc -l
echo "Total HTML files in scope:"; find . -name "*.html" -not -path "./startups-app/*" -not -path "./node_modules/*" -not -path "./.git/*" | wc -l
```

Expected output:
```
gtag config blocks: 41 (or close — the exact number may vary; document what you see)
CookieYes script tags: 41 (or close)
WebmasterID tags (should be 0): 0
Bing placeholder lines (should be 1, on homepage): 1
Total HTML files in scope: ~41
```

- [ ] **Step 2: Record the actual numbers in the plan**

If any count materially differs from the expected (e.g. CookieYes appears on 30 pages not 41), pause and surface to the user — the spec was based on the assumption that gtag + CookieYes are on every page.

- [ ] **Step 3: Verify sitemap.xml syntax baseline**

Run:
```bash
xmllint --noout sitemap.xml && echo "sitemap.xml is valid XML"
```

Expected: "sitemap.xml is valid XML"

- [ ] **Step 4: Commit nothing (read-only task)** — proceed to Task 2.

---

## Task 2: Remove all gtag blocks from HTML files

**Files:** All HTML files containing `G-4RE6YCJZBD`. The pattern is two adjacent `<script>` blocks: one async loader + one inline config.

**Files to modify (verified by grep in Task 1):** ~41 files. Each contains this block in `<head>`:

```html
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-4RE6YCJZBD"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'G-4RE6YCJZBD');
</script>
```

- [ ] **Step 1: Verify exact block matches across files**

Run:
```bash
grep -B1 -A6 "G-4RE6YCJZBD" index.html
```

Expected: the block above appears verbatim. If the block varies materially across files (different indentation, different surrounding markup, different GA ID), spot-check 3 other files (`pdf-editor/index.html`, `blog/index.html`, `de/index.html`) before scripting the removal.

- [ ] **Step 2: Remove the gtag blocks using a Python script**

Write and run this script (saves time vs. 41 manual edits):

```python
# /tmp/remove_gtag.py
import re
import pathlib

ROOT = pathlib.Path("/Users/petrohrys/PetroHrys.com")
EXCLUDE = ("startups-app", "node_modules", ".git")

# The block to remove. Anchored on the loader script and the closing </script>
# of the config block. Tolerant of whitespace variations.
PATTERN = re.compile(
    r"<!--\s*Google tag \(gtag\.js\)\s*-->\s*"
    r"<script async src=\"https://www\.googletagmanager\.com/gtag/js\?id=G-4RE6YCJZBD\"></script>\s*"
    r"<script>\s*"
    r"\s*window\.dataLayer = window\.dataLayer \|\| \[\];\s*"
    r"\s*function gtag\(\)\{dataLayer\.push\(arguments\);\}\s*"
    r"\s*gtag\('js', new Date\(\)\);\s*\n*"
    r"\s*gtag\('config', 'G-4RE6YCJZBD'\);\s*"
    r"</script>\s*",
    re.MULTILINE,
)

count = 0
for p in ROOT.rglob("*.html"):
    if any(ex in p.parts for ex in EXCLUDE):
        continue
    text = p.read_text(encoding="utf-8")
    new_text, n = PATTERN.subn("", text)
    if n > 0:
        p.write_text(new_text, encoding="utf-8")
        count += n
        print(f"Removed gtag block from {p.relative_to(ROOT)} ({n} match)")

print(f"\nTotal removals: {count}")
```

Run:
```bash
python3 /tmp/remove_gtag.py
```

Expected: prints one removal per file, total = the count from Task 1 Step 1.

- [ ] **Step 3: Verify removal**

Run:
```bash
grep -rl "G-4RE6YCJZBD" --include="*.html" .
```

Expected: no output (returns nothing).

Run:
```bash
grep -rl "googletagmanager.com" --include="*.html" .
```

Expected: no output.

- [ ] **Step 4: Manual spot-check on 3 files**

Open `index.html`, `pdf-editor/index.html`, `de/index.html`. Confirm the `<head>` no longer contains the gtag block but is otherwise intact (no broken structure, no stray empty lines that would suggest bad regex match).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(tracking): remove Google Analytics (gtag) from all HTML pages

Replaces gtag with cookieless WebmasterID in the next commit. See
docs/superpowers/specs/2026-05-13-petrohrys-seo-tracker-overhaul-design.md."
```

---

## Task 3: Remove CookieYes from HTML files

**Files:** All HTML files containing the CookieYes script tag.

- [ ] **Step 1: Verify the CookieYes pattern is consistent**

Run:
```bash
grep -h "id=\"cookieyes\"" index.html pdf-editor/index.html de/index.html blog/index.html
```

Expected: all four print the same line:
```
<script id="cookieyes" type="text/javascript" src="https://cdn-cookieyes.com/client_data/af075fab2c66644b181224ee/script.js"></script>
```

If any file uses a different CookieYes client ID, pause and surface to user.

- [ ] **Step 2: Remove CookieYes using sed (single-line pattern is easy)**

Run:
```bash
cd /Users/petrohrys/PetroHrys.com
find . -name "*.html" \
  -not -path "./startups-app/*" \
  -not -path "./node_modules/*" \
  -not -path "./.git/*" \
  -exec sed -i '' '/<script id="cookieyes"/d' {} +
```

Note: `sed -i ''` is the macOS BSD sed syntax (this repo is on darwin). On Linux, use `sed -i` (no empty quotes).

- [ ] **Step 3: Verify removal**

Run:
```bash
grep -rl "cookieyes" --include="*.html" .
grep -rl "cdn-cookieyes.com" --include="*.html" .
```

Expected: both return no output.

- [ ] **Step 4: Manual spot-check on 3 files (same files as Task 2)**

Confirm the CookieYes line is gone and no empty line gap remains in its place that would suggest broken markup.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(tracking): remove CookieYes consent banner from all HTML pages

WebmasterID (next commit) is cookieless and does not require a consent
banner per its stated privacy model."
```

---

## Task 4: Add WebmasterID to all HTML files

**Files:** All HTML files. The script tag goes inside `<head>`, just before `</head>` for consistency.

**Exact tag to insert** (from the brief — verbatim):

```html
<script
  id="webmasterid-tracker"
  defer
  src="https://webmasterid.com/tracker.iife.min.js"
  data-wmid="wm_bktqqtd7heom5nkl"
  data-endpoint="https://webmasterid-ingest-api.vercel.app/api/events"
></script>
```

- [ ] **Step 1: Verify no file already has the WebmasterID tag**

Run:
```bash
grep -rl "webmasterid-tracker" --include="*.html" .
```

Expected: no output.

- [ ] **Step 2: Insert the tag using a Python script**

Write and run:

```python
# /tmp/add_webmasterid.py
import pathlib

ROOT = pathlib.Path("/Users/petrohrys/PetroHrys.com")
EXCLUDE = ("startups-app", "node_modules", ".git")

TAG = '''<script
  id="webmasterid-tracker"
  defer
  src="https://webmasterid.com/tracker.iife.min.js"
  data-wmid="wm_bktqqtd7heom5nkl"
  data-endpoint="https://webmasterid-ingest-api.vercel.app/api/events"
></script>
'''

count = 0
for p in ROOT.rglob("*.html"):
    if any(ex in p.parts for ex in EXCLUDE):
        continue
    text = p.read_text(encoding="utf-8")
    if "webmasterid-tracker" in text:
        print(f"SKIP (already has tag): {p.relative_to(ROOT)}")
        continue
    if "</head>" not in text:
        print(f"WARN (no </head>): {p.relative_to(ROOT)}")
        continue
    new_text = text.replace("</head>", TAG + "</head>", 1)
    p.write_text(new_text, encoding="utf-8")
    count += 1
    print(f"Added WebmasterID to {p.relative_to(ROOT)}")

print(f"\nTotal additions: {count}")
```

Run:
```bash
python3 /tmp/add_webmasterid.py
```

Expected: one "Added" line per file, no SKIP or WARN entries, total ≈ the file count from Task 1.

- [ ] **Step 3: Verify count**

Run:
```bash
grep -rl "webmasterid-tracker" --include="*.html" . | wc -l
```

Expected: same number as Task 1 Step 1's "Total HTML files in scope".

- [ ] **Step 4: Manual spot-check**

Open `index.html`, `pdf-editor/index.html`, `de/index.html`. Confirm the script tag is present immediately before `</head>` and the `<head>` is otherwise intact.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(tracking): install WebmasterID on all HTML pages

Replaces the now-removed gtag + CookieYes stack. WebmasterID is
cookieless / fingerprint-free / DNT-respecting, so no consent banner
is required. siteId: wm_bktqqtd7heom5nkl.

See docs/superpowers/specs/2026-05-13-petrohrys-seo-tracker-overhaul-design.md."
```

---

## Task 5: Remove the Bing verification placeholder from homepage

**Files:**
- Modify: `index.html` (the line with `PASTE_YOUR_BING_VERIFICATION_CODE_HERE`)

- [ ] **Step 1: Confirm only the homepage has this placeholder**

Run:
```bash
grep -rln "PASTE_YOUR_BING_VERIFICATION_CODE_HERE" --include="*.html" .
```

Expected: `./index.html` (just one file).

- [ ] **Step 2: Remove the line**

Run:
```bash
sed -i '' '/PASTE_YOUR_BING_VERIFICATION_CODE_HERE/d' index.html
```

- [ ] **Step 3: Verify removal**

Run:
```bash
grep "PASTE_YOUR_BING_VERIFICATION_CODE_HERE" index.html
```

Expected: no output.

- [ ] **Step 4: Spot-check `<head>` integrity**

Run:
```bash
sed -n '1,40p' index.html
```

Confirm `<head>` block reads cleanly with no stray empty line where the placeholder used to be (if there is a stray blank line, leave it — single blank lines in HTML are harmless).

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "chore(seo): remove unfilled Bing site-verification placeholder

The msvalidate.01 meta tag held a literal 'PASTE_YOUR_BING_VERIFICATION_CODE_HERE'
placeholder. Re-add when a real Bing Webmaster Tools code is available."
```

---

## Task 6: Add JSON-LD to homepage (Organization + Person + WebSite)

**Files:**
- Modify: `index.html` — insert one `<script type="application/ld+json">` block in `<head>` before `</head>`.

**Schema to insert** (exact code):

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://www.petrohrys.com/#org",
      "name": "HELPERG",
      "url": "https://www.petrohrys.com/",
      "logo": "https://www.petrohrys.com/photo1.jpg",
      "founder": { "@id": "https://www.petrohrys.com/#petro" }
    },
    {
      "@type": "Person",
      "@id": "https://www.petrohrys.com/#petro",
      "name": "Petro Hrys",
      "jobTitle": "Mobile App Developer",
      "url": "https://www.petrohrys.com/",
      "image": "https://www.petrohrys.com/photo1.jpg",
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
      ],
      "worksFor": { "@id": "https://www.petrohrys.com/#org" }
    },
    {
      "@type": "WebSite",
      "@id": "https://www.petrohrys.com/#website",
      "url": "https://www.petrohrys.com/",
      "name": "Petro Hrys",
      "publisher": { "@id": "https://www.petrohrys.com/#org" }
    }
  ]
}
</script>
```

(Social handles are from `link-preservation-audit.md` §1 — verified preserved.)

- [ ] **Step 1: Verify homepage has no existing JSON-LD**

Run:
```bash
grep -c "application/ld+json" index.html
```

Expected: `0`.

- [ ] **Step 2: Edit `index.html` — insert the block above before `</head>`**

Use the Edit tool to insert the entire JSON-LD `<script>` block immediately before the closing `</head>` tag.

- [ ] **Step 3: Verify insertion + JSON validity**

Run:
```bash
grep -c "application/ld+json" index.html  # expected: 1
python3 -c "
import re, json
with open('index.html') as f:
    text = f.read()
m = re.search(r'<script type=\"application/ld\+json\">(.*?)</script>', text, re.DOTALL)
data = json.loads(m.group(1))
assert data['@graph'][0]['@type'] == 'Organization'
assert data['@graph'][1]['@type'] == 'Person'
assert data['@graph'][2]['@type'] == 'WebSite'
print('JSON-LD parses cleanly. 3 entities.')
"
```

Expected: `1` and `JSON-LD parses cleanly. 3 entities.`

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(seo): add Organization, Person, WebSite JSON-LD to homepage

Strengthens entity recognition for HELPERG (org) and Petro Hrys
(person) and links to the canonical social handles."
```

---

## Task 7: Add SoftwareApplication JSON-LD to product pages

**Files (9 product pages):**
- `pdf-editor/index.html`
- `unzip/index.html`
- `pocket-manager/index.html`
- `smart-printer/index.html`
- `invoice-maker/index.html`
- `cv-builder/index.html`
- `tcg-scanner/index.html`
- `twinphone/index.html`
- `fax/index.html`

**Schema template** (substitute per-product values from the table below):

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "<<PRODUCT_NAME>>",
  "operatingSystem": "<<OS>>",
  "applicationCategory": "<<CATEGORY>>",
  "url": "<<CANONICAL>>",
  "publisher": {
    "@type": "Organization",
    "name": "HELPERG",
    "url": "https://www.petrohrys.com/"
  },
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD"
  }
}
</script>
```

**Per-product values:**

| File | name | operatingSystem | applicationCategory | canonical |
|---|---|---|---|---|
| pdf-editor | "PDF Editor" | "iOS, Android" | "ProductivityApplication" | https://www.petrohrys.com/pdf-editor/ |
| unzip | "Unzip — RAR, Zip, 7zip+" | "iOS, Android" | "UtilitiesApplication" | https://www.petrohrys.com/unzip/ |
| pocket-manager | "Pocket Manager" | "iOS, Android" | "FinanceApplication" | https://www.petrohrys.com/pocket-manager/ |
| smart-printer | "Smart Printer: Scan Master" | "iOS, Android" | "ProductivityApplication" | https://www.petrohrys.com/smart-printer/ |
| invoice-maker | "Invoice Maker" | "iOS" | "BusinessApplication" | https://www.petrohrys.com/invoice-maker/ |
| cv-builder | "CV Builder: Make Resume" | "iOS" | "ProductivityApplication" | https://www.petrohrys.com/cv-builder/ |
| tcg-scanner | "TCG Card Value Scanner" | "iOS" | "UtilitiesApplication" | https://www.petrohrys.com/tcg-scanner/ |
| twinphone | "TwinPhone" | "Web, iOS, Android" | "CommunicationApplication" | https://www.petrohrys.com/twinphone/ |
| fax | "FAX: Send from Phone" | "iOS" | "CommunicationApplication" | https://www.petrohrys.com/fax/ |

**Note on `offers.price`:** all apps are free to install per `link-preservation-audit.md` (App Store free download). Do not add `aggregateRating` — no verified review counts. Do not invent.

- [ ] **Step 1: Verify product pages have no existing JSON-LD (or document which ones do)**

Run:
```bash
for f in pdf-editor unzip pocket-manager smart-printer invoice-maker cv-builder tcg-scanner twinphone fax; do
  count=$(grep -c "application/ld+json" "$f/index.html" 2>/dev/null || echo 0)
  echo "$f: $count"
done
```

If any product already has a JSON-LD block, read it first and decide whether to merge/replace. The spec said "some pages have it, others don't" — be conservative: if a page has JSON-LD that's better than the template, keep theirs and skip.

- [ ] **Step 2: Insert SoftwareApplication block for each product (9 edits)**

For each of the 9 files, use the Edit tool to insert the per-product JSON-LD block immediately before `</head>`. Substitute the values from the table above.

- [ ] **Step 3: Verify all 9 have the schema**

Run:
```bash
for f in pdf-editor unzip pocket-manager smart-printer invoice-maker cv-builder tcg-scanner twinphone fax; do
  if grep -q "SoftwareApplication" "$f/index.html"; then echo "✓ $f"; else echo "✗ $f"; fi
done
```

Expected: 9 `✓` lines.

- [ ] **Step 4: Validate JSON across all 9 files**

```bash
python3 -c "
import re, json, pathlib
products = ['pdf-editor','unzip','pocket-manager','smart-printer','invoice-maker','cv-builder','tcg-scanner','twinphone','fax']
for p in products:
    path = pathlib.Path(p) / 'index.html'
    text = path.read_text()
    blocks = re.findall(r'<script type=\"application/ld\+json\">(.*?)</script>', text, re.DOTALL)
    for b in blocks:
        try:
            data = json.loads(b)
            if data.get('@type') == 'SoftwareApplication':
                print(f'✓ {p}: {data[\"name\"]}')
                break
        except json.JSONDecodeError as e:
            print(f'✗ {p}: invalid JSON — {e}')
            break
"
```

Expected: 9 `✓` lines.

- [ ] **Step 5: Commit**

```bash
git add pdf-editor/index.html unzip/index.html pocket-manager/index.html smart-printer/index.html invoice-maker/index.html cv-builder/index.html tcg-scanner/index.html twinphone/index.html fax/index.html
git commit -m "feat(seo): add SoftwareApplication JSON-LD to all 9 product pages

Standardizes schema across products: name, OS, category, canonical,
HELPERG publisher, free-tier offer. No aggregateRating (no verified
review counts)."
```

---

## Task 8: Close internal-linking gaps on product pages

**Files (6 product pages, 7 card insertions total):**
- `pdf-editor/index.html` — add FAX card + Unzip card
- `smart-printer/index.html` — add FAX card
- `invoice-maker/index.html` — add TwinPhone card
- `fax/index.html` — add TwinPhone card
- `cv-builder/index.html` — add TCG Scanner card
- `pocket-manager/index.html` — add TCG Scanner card

**Anchor-text rule** (from spec §6): problem-led, not product-name-stuffed.

**Card template** (matches existing product-card markup on these pages):

```html
<div class="related-card">
  <h4><<SHORT_HOOK>></h4>
  <p><<ONE_SENTENCE_DESCRIPTION>></p>
  <a href="<<TARGET>>" class="related-link">Learn more →</a>
</div>
```

Note: this is the abstract shape. **First read the actual "Related products" / "You may also like" section markup of the page you're editing** — each product page may use a slightly different class name (`product-card`, `related-card`, etc.). Match the existing markup, don't introduce a new class.

**Card content per insertion:**

| Source page | Hook | Description | Target |
|---|---|---|---|
| pdf-editor | "Also need to fax documents?" | "Send signed PDFs directly from your phone — no machine needed." | `/fax/` |
| pdf-editor | "Working with archived files?" | "Open RAR, ZIP, 7Z, TAR, and password-protected archives." | `/unzip/` |
| smart-printer | "Also need to fax documents?" | "Send scanned documents directly as faxes from your iPhone." | `/fax/` |
| invoice-maker | "Need a number for international clients?" | "Get a separate business line that works in 145+ countries." | `/twinphone/` |
| fax | "Need a number for international clients?" | "A separate business line for global communication." | `/twinphone/` |
| cv-builder | "Manage trading-card collection value?" | "AI-powered scanner to check what your cards are worth." | `/tcg-scanner/` |
| pocket-manager | "Manage trading-card collection value?" | "Track card market prices alongside your expenses." | `/tcg-scanner/` |

- [ ] **Step 1: Read each source file's existing related-products section**

For each of the 6 source files, read the file and locate the existing "Related products" / "You may also like" / cross-link section. Note the exact class name used (`product-card`, `related-card`, etc.).

- [ ] **Step 2: Insert card per file (6 edits, pdf-editor gets two cards)**

Use the Edit tool to add each card after the last existing card in the related section. Match the existing markup style for each file.

- [ ] **Step 3: Verify inbound link counts**

Run:
```bash
echo "TwinPhone inbound (excluding self):"
grep -rl "/twinphone/" --include="*.html" . | grep -v "twinphone/index.html" | wc -l
echo "FAX inbound (excluding self):"
grep -rl "/fax/" --include="*.html" . | grep -v "fax/index.html" | wc -l
echo "TCG Scanner inbound (excluding self):"
grep -rl "/tcg-scanner/" --include="*.html" . | grep -v "tcg-scanner/index.html" | wc -l
echo "Unzip inbound (excluding self):"
grep -rl "/unzip/" --include="*.html" . | grep -v "unzip/index.html" | wc -l
```

Expected: each ≥ 3. (Counts include homepage + footer references + the new product card.)

- [ ] **Step 4: Manual spot-check**

Open `pdf-editor/index.html` and `cv-builder/index.html` in a browser. Confirm the new cards render correctly and the links resolve (clicking them goes to `/fax/`, `/tcg-scanner/`, etc.).

- [ ] **Step 5: Commit**

```bash
git add pdf-editor/index.html smart-printer/index.html invoice-maker/index.html fax/index.html cv-builder/index.html pocket-manager/index.html
git commit -m "feat(seo): close critical internal-linking gaps for TCG, TwinPhone, FAX

These three products previously had only 1 inbound link (homepage).
Adds problem-led cross-product cards on 6 product pages, raising
inbound counts to 3+ each per seo-implementation.md §5
recommendations."
```

---

## Task 9: Create `/about/` page

**Files:**
- Create: `about/index.html`

**Word count target:** 550–700 words of body copy.

**Page skeleton** (head + structure — fill prose in Step 2):

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>About Petro Hrys — Mobile App Developer & Founder of HELPERG | Petro Hrys</title>
  <meta name="description" content="Petro Hrys is the mobile app developer behind HELPERG — a small ecosystem of privacy-first iOS & Android tools for documents, files, invoicing, and more.">
  <meta property="og:title" content="About Petro Hrys — Mobile App Developer & Founder of HELPERG">
  <meta property="og:description" content="Petro Hrys is the mobile app developer behind HELPERG — a small ecosystem of privacy-first iOS & Android tools.">
  <meta property="og:image" content="https://www.petrohrys.com/photo1.jpg">
  <meta property="og:url" content="https://www.petrohrys.com/about/">
  <meta property="og:type" content="profile">
  <meta property="og:site_name" content="Petro Hrys">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@petrohrys">
  <meta name="twitter:title" content="About Petro Hrys — Mobile App Developer & Founder of HELPERG">
  <meta name="twitter:description" content="Petro Hrys is the mobile app developer behind HELPERG — a small ecosystem of privacy-first iOS & Android tools.">
  <meta name="twitter:image" content="https://www.petrohrys.com/photo1.jpg">

  <link rel="canonical" href="https://www.petrohrys.com/about/">
  <link rel="alternate" hreflang="en" href="https://www.petrohrys.com/about/">
  <link rel="alternate" hreflang="x-default" href="https://www.petrohrys.com/about/">
  <link rel="sitemap" type="application/xml" href="https://www.petrohrys.com/sitemap.xml">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%231a1a1a'/><text x='50%25' y='54%25' dominant-baseline='middle' text-anchor='middle' font-size='18' fill='white'>P</text></svg>">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap" rel="stylesheet">

  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    "url": "https://www.petrohrys.com/about/",
    "mainEntity": {
      "@type": "Person",
      "name": "Petro Hrys",
      "jobTitle": "Mobile App Developer",
      "url": "https://www.petrohrys.com/about/",
      "image": "https://www.petrohrys.com/photo1.jpg",
      "sameAs": [
        "https://www.linkedin.com/in/petro-hrys-8306b9401",
        "https://x.com/petrohrys",
        "https://youtube.com/@petrohrys",
        "https://www.instagram.com/wwwpetrohryscom"
      ],
      "worksFor": {
        "@type": "Organization",
        "name": "HELPERG",
        "url": "https://www.petrohrys.com/"
      }
    }
  }
  </script>

  <script
    id="webmasterid-tracker"
    defer
    src="https://webmasterid.com/tracker.iife.min.js"
    data-wmid="wm_bktqqtd7heom5nkl"
    data-endpoint="https://webmasterid-ingest-api.vercel.app/api/events"
  ></script>

  <style>
    /* Copy the base reset, nav, and footer styles from index.html.
       Keep page-specific styles minimal — match the rest of the site. */
    /* CRITICAL: do not redesign. Use existing color palette (#f7f7f5 bg, #1a1a1a text)
       and DM Sans font as on all other pages. */
  </style>
</head>
<body>
  <!-- Copy the existing <nav> markup from index.html. Update the "About"
       nav item to link to /about/ instead of /#about. -->

  <main class="about-main" style="max-width: 720px; margin: 120px auto 80px; padding: 0 2rem;">

    <p style="font-size: 0.85rem; color: #888; text-transform: uppercase; letter-spacing: 0.08em;">
      <a href="/" style="color: inherit; text-decoration: none;">Home</a> &rsaquo; About
    </p>

    <h1 style="font-size: 2.5rem; line-height: 1.2; margin: 1rem 0 2rem;">
      About Petro Hrys — Mobile App Developer & Founder of HELPERG
    </h1>

    <img src="/photo1.jpg" alt="Petro Hrys" style="width: 100%; max-width: 400px; height: auto; border-radius: 8px; margin-bottom: 2rem;">

    <!-- Section 1: Founder intro (~120 words). Adapted from existing
         /#about copy on homepage. Cover: name, role, geography, what,
         why. No invented credentials. -->
    <h2 style="margin-top: 2rem;">Who I am</h2>
    <!-- Write ~120 words of prose here. -->

    <!-- Section 2: HELPERG ecosystem (~150 words). The new factual layer.
         Reference visible evidence: com.helperg.* Android package names.
         List the 9 apps with internal links. No revenue/user metrics. -->
    <h2 style="margin-top: 2rem;">The HELPERG ecosystem</h2>
    <!-- Write ~150 words of prose. Include this sentence verbatim or
         in spirit: "I publish my apps under the HELPERG name — you'll
         see it as the developer on the App Store and Google Play."
         Then list all 9 apps as internal links. -->

    <!-- Section 3: What I build & why (~150 words). Restates the
         homepage philosophy pillars (No accounts / Works offline /
         One-time or free / Privacy by design). Internal link to
         /#philosophy. -->
    <h2 style="margin-top: 2rem;">What I build, and why</h2>
    <!-- Write ~150 words. -->

    <!-- Section 4: Where to find me (~80 words). Email + social
         handles. Email MUST match the live homepage current value
         (hrhelperg@gmail.com) — do not silently swap to
         info@petrohrys.com. -->
    <h2 style="margin-top: 2rem;">Where to find me</h2>
    <!-- Write ~80 words + contact list. -->

    <p style="margin-top: 3rem; text-align: center;">
      <a href="/#products" style="display: inline-block; padding: 0.8rem 1.75rem; background: #1a1a1a; color: #fff; border-radius: 8px; text-decoration: none; font-weight: 600;">
        Explore the apps →
      </a>
    </p>

  </main>

  <!-- Copy the existing <footer> from index.html. Update the "About"
       footer link to /about/ (this is covered in Task 10 as a global
       site-wide migration). -->
</body>
</html>
```

- [ ] **Step 1: Read the head/nav/footer markup of `index.html`**

Open `index.html`. Note the exact `<nav>` markup and the exact `<footer>` markup. The new `/about/index.html` should reuse these structures verbatim (just with the "About" link target adjusted later in Task 10).

- [ ] **Step 2: Create `about/index.html`**

Use the Write tool to create the file. Start from the skeleton above. Paste the actual `<nav>` and `<footer>` blocks from `index.html` into the corresponding placeholder comments. Replace the `/* ... */` style comments with either the actual page-specific styles you need, or remove the `<style>` block entirely if `index.html`'s nav/footer styles are inlined per-page.

- [ ] **Step 3: Write the four body sections (prose)**

Write the 4 H2 sections with the target word counts. Constraints:
- No invented stats, awards, clients, press mentions.
- HELPERG section must include a verifiable statement (e.g. "you'll see HELPERG as the developer on Google Play, in package names like `com.helperg.smart.printer`").
- List all 9 apps in the HELPERG section as internal links (`/pdf-editor/`, `/unzip/`, `/pocket-manager/`, `/smart-printer/`, `/invoice-maker/`, `/cv-builder/`, `/tcg-scanner/`, `/twinphone/`, `/fax/`).
- "What I build, and why" must reference and link to `/#philosophy`.
- Email is `hrhelperg@gmail.com` to match homepage. Add a one-line HTML comment noting the audit doc proposed `info@petrohrys.com` migration but the live site uses the old.

- [ ] **Step 4: Verify HTML validates**

Run:
```bash
# Lightweight check — confirms well-formedness, not full HTML5 spec compliance.
xmllint --html --noout about/index.html 2>&1 | head -20
```

Expected: no errors, or only minor warnings (xmllint is strict about HTML5; warnings are OK as long as no parse errors).

- [ ] **Step 5: Verify SEO basics**

Run:
```bash
echo "=== /about/index.html SEO check ==="
echo -n "Title: "; grep -o '<title>[^<]*</title>' about/index.html
echo -n "Canonical: "; grep -o 'rel="canonical" href="[^"]*"' about/index.html
echo -n "Meta description present: "; grep -c 'name="description"' about/index.html
echo -n "OG image present: "; grep -c 'property="og:image"' about/index.html
echo -n "JSON-LD AboutPage present: "; grep -c '"AboutPage"' about/index.html
echo -n "WebmasterID present: "; grep -c 'webmasterid-tracker' about/index.html
echo -n "Word count (rough, body only): "; grep -A1 "<h2" about/index.html | tr -d '<>' | wc -w
```

Expected: title present, canonical = `https://www.petrohrys.com/about/`, all "present" counts ≥ 1.

- [ ] **Step 6: Commit**

```bash
git add about/index.html
git commit -m "feat(content): add standalone /about/ page

New page covering founder bio, HELPERG ecosystem (the publishing
entity behind the apps), philosophy pillars, and contact. Replaces
the ghost /about/ footer link gap from seo-implementation.md §5."
```

---

## Task 10: Migrate site-wide "About" links to `/about/`

**Files:** All HTML files that contain links to `/#about` or older variants.

- [ ] **Step 1: Audit current "About" link patterns**

Run:
```bash
echo "=== Links to /#about (anchor on homepage) ==="
grep -rn 'href="/#about"' --include="*.html" . | head -30
grep -rn 'href="#about"' --include="*.html" . | head -30
echo "=== Links to /about/ (already correct) ==="
grep -rn 'href="/about/"' --include="*.html" . | head -30
echo "=== Links to /about (no trailing slash) ==="
grep -rn 'href="/about"[^/]' --include="*.html" . | head -30
```

Document what you find. The expected pattern is mostly `/#about` (anchor). Some pages may use `/about/` already (ghost link from `seo-implementation.md`).

- [ ] **Step 2: Decide which "About" links to migrate**

Migration rule:
- Footer / company nav "About" links → migrate to `/about/`
- Hero CTA on homepage "Read my story" → leave as `/#about` (still useful anchor on homepage itself)
- Anchor `#about` references **within `index.html` itself** (e.g. `<a href="#about">` from the in-page nav) → leave alone

If the audit finds many footer-style "About" links pointing to `/#about`, those are the targets.

- [ ] **Step 3: Migrate**

For each link target identified in Step 2, use sed or per-file Edit. Example for footer-style links across all pages except the homepage:

```bash
# Caution: this is broad. Only run AFTER reviewing Step 1 output.
# It changes links in *every* HTML file except index.html. If
# index.html's in-page #about anchor uses href="#about" (no slash),
# this regex won't touch it.
find . -name "*.html" \
  -not -path "./startups-app/*" \
  -not -path "./node_modules/*" \
  -not -path "./.git/*" \
  -not -path "./index.html" \
  -exec sed -i '' 's|href="/#about"|href="/about/"|g' {} +
```

Then handle `index.html` separately: its footer "About" link migrates to `/about/`, but the in-page nav anchor link `<a href="#about">` (or `href="/#about"` if anchored to current page) stays as is for in-page scrolling.

- [ ] **Step 4: Verify migration**

Run:
```bash
echo "Remaining /#about footer-style links (should be near 0):"
grep -rn 'href="/#about"' --include="*.html" . | wc -l
echo "Total /about/ links now (should be substantial):"
grep -rn 'href="/about/"' --include="*.html" . | wc -l
```

- [ ] **Step 5: Manual spot-check**

Open `pdf-editor/index.html` and a localized page like `de/index.html`. Confirm the footer "About" link now goes to `/about/`. Confirm in-page nav links on `index.html` still scroll to the `#about` anchor.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(seo): migrate site-wide 'About' footer links to /about/

The new standalone /about/ page (previous commit) replaces the
homepage #about anchor as the canonical bio surface. In-page anchor
links on index.html stay for scroll behavior."
```

---

## Task 11: Trim homepage `#about` section + add HELPERG mention

**Files:**
- Modify: `index.html` (the `<section id="about" class="about-section">` block, lines ~1159–1170 — exact lines may have shifted from earlier edits, so re-locate by section ID).

**Current content of that section (verbatim, from the live file):**

```html
<section id="about" class="about-section">
  <div class="about-image">
    <img src="photo1.jpg" alt="Petro Hrys" />
  </div>
  <div class="about-content">
    <h2>I build tools I'd want to use</h2>
    <p>I'm Petro Hrys, an app developer based between Europe and the US. I was born in Ukraine and have spent the last decade building focused, privacy-first software for iOS and Android.</p>
    <p>I'm frustrated by bloated apps, dark patterns, and the surveillance economy. Every tool I build is designed to solve a real problem without the unnecessary complexity. I believe good software respects your time, protects your data, and doesn't waste your attention.</p>
    <p>When I'm not coding, I'm exploring how technology can be built with genuine respect for users—not just for engagement metrics.</p>
    <a href="/#about" class="about-link">Read the full story →</a>
  </div>
</section>
```

**Target content (trimmed):**

```html
<section id="about" class="about-section">
  <div class="about-image">
    <img src="photo1.jpg" alt="Petro Hrys" />
  </div>
  <div class="about-content">
    <h2>I build tools I'd want to use</h2>
    <p>I'm Petro Hrys, an app developer based between Europe and the US. I publish my apps under the HELPERG name — you'll see it as the developer on the App Store and Google Play.</p>
    <p>I build focused, privacy-first software for iOS and Android: no accounts you don't need, no surveillance, no engagement-bait.</p>
    <a href="/about/" class="about-link">Read full bio →</a>
  </div>
</section>
```

Changes:
- 3 paragraphs → 2 paragraphs (~50 words total).
- New HELPERG sentence added to paragraph 1.
- Removed "frustrated by bloated apps…" paragraph (now lives on `/about/`).
- Removed "When I'm not coding…" paragraph (now lives on `/about/`).
- CTA link updated from `/#about` (self-anchor) → `/about/` (standalone page).

- [ ] **Step 1: Re-locate the section in `index.html`**

Run:
```bash
grep -n 'section id="about"' index.html
```

Note the line number; the section spans ~12 lines from that line.

- [ ] **Step 2: Edit the section to match the target content**

Use the Edit tool to replace the old `<section id="about" class="about-section">` block with the new one above (verbatim).

- [ ] **Step 3: Verify**

Run:
```bash
sed -n '/<section id="about"/,/<\/section>/p' index.html
```

Expected: prints the new trimmed section.

Also verify the HELPERG mention is present:
```bash
grep -c "HELPERG" index.html
```
Expected: ≥ 2 (one in the JSON-LD from Task 6, one in this new paragraph).

- [ ] **Step 4: Manual spot-check in browser**

Open `index.html` in a browser. Confirm the About section is shorter, mentions HELPERG, and the "Read full bio →" link goes to `/about/`.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "polish(homepage): trim About section, add HELPERG mention

Standalone /about/ is now the canonical bio surface. Homepage shows
a 2-paragraph teaser with the new factual HELPERG positioning line
and a 'Read full bio →' link."
```

---

## Task 12: Create new Unzip blog article — head block + skeleton

**Files:**
- Create: `blog/how-to-extract-zip-files-iphone/index.html`

**Skeleton with head block and structural placeholders. Prose comes in Task 13.**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>How to Extract ZIP Files on iPhone (Step-by-Step Guide) | Petro Hrys</title>
  <meta name="description" content="Extract ZIP, RAR, and 7Z files on iPhone — step-by-step using built-in iOS tools and when to use a dedicated extractor. Practical 2026 guide.">
  <meta property="og:title" content="How to Extract ZIP Files on iPhone (Step-by-Step Guide)">
  <meta property="og:description" content="Extract ZIP, RAR, and 7Z files on iPhone — step-by-step with built-in iOS tools and dedicated extractors.">
  <meta property="og:image" content="https://www.petrohrys.com/photo1.jpg">
  <meta property="og:url" content="https://www.petrohrys.com/blog/how-to-extract-zip-files-iphone/">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Petro Hrys">
  <meta property="article:published_time" content="2026-05-13">
  <meta property="article:modified_time" content="2026-05-13">
  <meta property="article:author" content="Petro Hrys">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@petrohrys">
  <meta name="twitter:title" content="How to Extract ZIP Files on iPhone (Step-by-Step Guide)">
  <meta name="twitter:description" content="Extract ZIP, RAR, and 7Z files on iPhone — step-by-step.">
  <meta name="twitter:image" content="https://www.petrohrys.com/photo1.jpg">

  <link rel="canonical" href="https://www.petrohrys.com/blog/how-to-extract-zip-files-iphone/">
  <link rel="alternate" hreflang="en" href="https://www.petrohrys.com/blog/how-to-extract-zip-files-iphone/">
  <link rel="alternate" hreflang="x-default" href="https://www.petrohrys.com/blog/how-to-extract-zip-files-iphone/">
  <link rel="sitemap" type="application/xml" href="https://www.petrohrys.com/sitemap.xml">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%231a1a1a'/><text x='50%25' y='54%25' dominant-baseline='middle' text-anchor='middle' font-size='18' fill='white'>P</text></svg>">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap" rel="stylesheet">

  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "How to Extract ZIP Files on iPhone: A Practical Guide (2026)",
    "description": "Extract ZIP, RAR, and 7Z files on iPhone — step-by-step using built-in iOS tools and when to use a dedicated extractor.",
    "image": "https://www.petrohrys.com/photo1.jpg",
    "datePublished": "2026-05-13",
    "dateModified": "2026-05-13",
    "author": {
      "@type": "Person",
      "name": "Petro Hrys",
      "url": "https://www.petrohrys.com/about/"
    },
    "publisher": {
      "@type": "Organization",
      "name": "HELPERG",
      "url": "https://www.petrohrys.com/",
      "logo": {
        "@type": "ImageObject",
        "url": "https://www.petrohrys.com/photo1.jpg"
      }
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": "https://www.petrohrys.com/blog/how-to-extract-zip-files-iphone/"
    }
  }
  </script>

  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "Can I unzip a password-protected file on iPhone?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "<<FILL IN FROM SECTION 6 OF BODY>>"
        }
      },
      {
        "@type": "Question",
        "name": "Where do unzipped files go on iOS?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "<<FILL IN FROM SECTION 6 OF BODY>>"
        }
      },
      {
        "@type": "Question",
        "name": "Can iPhone open RAR files without an app?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "<<FILL IN FROM SECTION 6 OF BODY>>"
        }
      },
      {
        "@type": "Question",
        "name": "How big a ZIP can I extract on iPhone?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "<<FILL IN FROM SECTION 6 OF BODY>>"
        }
      },
      {
        "@type": "Question",
        "name": "Does extracting use my mobile data?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "<<FILL IN FROM SECTION 6 OF BODY>>"
        }
      }
    ]
  }
  </script>

  <script
    id="webmasterid-tracker"
    defer
    src="https://webmasterid.com/tracker.iife.min.js"
    data-wmid="wm_bktqqtd7heom5nkl"
    data-endpoint="https://webmasterid-ingest-api.vercel.app/api/events"
  ></script>

  <style>
    /* Copy base styles + nav + footer styles from a sibling blog article
       like blog/best-pdf-editor-app-iphone-android/index.html for visual
       consistency. Do not redesign. */
  </style>
</head>
<body>

  <!-- Copy <nav> from blog/best-pdf-editor-app-iphone-android/index.html -->

  <article style="max-width: 720px; margin: 120px auto 80px; padding: 0 2rem; line-height: 1.7;">

    <p style="font-size: 0.85rem; color: #888; text-transform: uppercase; letter-spacing: 0.08em;">
      <a href="/" style="color: inherit; text-decoration: none;">Home</a> &rsaquo;
      <a href="/blog/" style="color: inherit; text-decoration: none;">Blog</a> &rsaquo; ZIP files on iPhone
    </p>

    <h1 style="font-size: 2.25rem; line-height: 1.2; margin: 1rem 0 1rem;">
      How to Extract ZIP Files on iPhone: A Practical Guide (2026)
    </h1>

    <p style="color: #888; font-size: 0.9rem; margin-bottom: 2.5rem;">
      By Petro Hrys · Updated 2026-05-13
    </p>

    <!-- Section 0: Intro/problem statement (~150 words). Task 13. -->
    <!-- INTRO_PARAGRAPHS -->

    <!-- Section 1: What iOS handles natively, and where it falls short (~250 words). Task 13. -->
    <h2 style="margin-top: 2.5rem;">What iOS handles natively (and where it falls short)</h2>
    <!-- SECTION_1_BODY -->

    <!-- Section 2: Step-by-step — extract ZIP with iOS Files (~300 words). Task 13. -->
    <h2 style="margin-top: 2.5rem;">Step-by-step: extract a ZIP with the iOS Files app</h2>
    <!-- SECTION_2_BODY -->

    <!-- Section 3: When you need a dedicated extractor (~300 words). Mentions Unzip in last paragraph. Task 13. -->
    <h2 style="margin-top: 2.5rem;">When you need a dedicated extractor</h2>
    <!-- SECTION_3_BODY -->

    <!-- Section 4: Troubleshooting (~300 words, 6 failure modes). Task 13. -->
    <h2 style="margin-top: 2.5rem;">Troubleshooting common failures</h2>
    <!-- SECTION_4_BODY -->

    <!-- Section 5: ZIP vs RAR vs 7Z comparison (~250 words). Task 13. -->
    <h2 style="margin-top: 2.5rem;">ZIP vs. RAR vs. 7Z — which format and when</h2>
    <!-- SECTION_5_BODY -->

    <!-- Section 6: FAQ (~250 words, 5 Q&A). Match questions to JSON-LD above. Task 13. -->
    <h2 style="margin-top: 2.5rem;">Frequently asked questions</h2>
    <!-- SECTION_6_FAQ -->

    <!-- Section 7: Soft CTA (~80 words). One link to /unzip/. Task 13. -->
    <p style="margin-top: 3rem; padding: 1.5rem; background: #f0efea; border-radius: 8px;">
      <!-- SECTION_7_CTA -->
    </p>

    <p style="margin-top: 2rem; font-size: 0.9rem; color: #888;">
      Related: <a href="/pdf-editor/">PDF Editor</a> · <a href="/smart-printer/">Smart Printer</a> · <a href="/unzip/">Unzip — file extractor</a>
    </p>

  </article>

  <!-- Copy <footer> from blog/best-pdf-editor-app-iphone-android/index.html. -->

</body>
</html>
```

- [ ] **Step 1: Read a sibling blog article for nav/footer parity**

Run:
```bash
cat blog/best-pdf-editor-app-iphone-android/index.html | head -80
```

Note the exact `<nav>` markup; copy it into the new file's nav placeholder. Same for `<footer>`.

- [ ] **Step 2: Create the directory and file**

Run:
```bash
mkdir -p blog/how-to-extract-zip-files-iphone
```

Use the Write tool to create `blog/how-to-extract-zip-files-iphone/index.html` with the skeleton above (with nav/footer substituted).

- [ ] **Step 3: Verify SEO head basics**

Run:
```bash
echo -n "Title: "; grep -o '<title>[^<]*</title>' blog/how-to-extract-zip-files-iphone/index.html
echo -n "Canonical: "; grep -o 'rel="canonical" href="[^"]*"' blog/how-to-extract-zip-files-iphone/index.html
echo -n "Article schema: "; grep -c '"@type": "Article"' blog/how-to-extract-zip-files-iphone/index.html
echo -n "FAQPage schema: "; grep -c '"@type": "FAQPage"' blog/how-to-extract-zip-files-iphone/index.html
echo -n "WebmasterID: "; grep -c 'webmasterid-tracker' blog/how-to-extract-zip-files-iphone/index.html
```

Expected: title set; canonical = `https://www.petrohrys.com/blog/how-to-extract-zip-files-iphone/`; all schema counts ≥ 1; WebmasterID = 1.

- [ ] **Step 4: Commit the skeleton**

```bash
git add blog/how-to-extract-zip-files-iphone/index.html
git commit -m "feat(content): scaffold Unzip blog article (head + structure)

P1 article from seo-content-plan.md targeting 'extract ZIP iPhone'
(2,800 monthly search volume). Body prose lands in the next commit."
```

---

## Task 13: Write the blog article body (prose)

**File:**
- Modify: `blog/how-to-extract-zip-files-iphone/index.html` — fill in the `<!-- SECTION_N_BODY -->` placeholders from Task 12 with actual prose.

**Word count target:** 1,800–2,100 words of body copy.

**Hard constraints:**
- No "studies show X%…" without a source.
- No invented company names other than HELPERG byline (already in head).
- No "best in 2026" superlative claims without comparison evidence.
- No competitor pricing claims without independent verification.
- Internal links exactly 3 in body (not counting the head "Related" line): 2× `/unzip/`, 1× `/pdf-editor/`, 1× `/smart-printer/`. Wait — re-checking spec: 3 total in body, `/unzip/` twice, plus `/pdf-editor/` once, plus `/smart-printer/` once. That's 4. Clarification: the spec lists 4 links but says "3 total" — re-read spec §8. The body soft CTA + section 3 mention give `/unzip/` 2 references; `/pdf-editor/` and `/smart-printer/` get one each in Section 5 (comparison). Total 4. Use 4.

**Factual anchors that must appear:**
- iOS Files app has supported ZIP and TAR since iOS 13.
- iOS Files does NOT natively handle RAR, 7Z, GZIP, or password-protected archives.
- ZIP is universal; RAR has better compression but is proprietary; 7Z has highest compression but is least commonly produced.

**Section-by-section guidance:**

- [ ] **Step 1: Write Section 0 (intro, ~150 words)**

Edit the `<!-- INTRO_PARAGRAPHS -->` placeholder in `blog/how-to-extract-zip-files-iphone/index.html`. Two short paragraphs:
- Paragraph 1: Problem framing — "You got a `.zip` file in email or chat; your iPhone may or may not open it."
- Paragraph 2: Scope of the article — "I'll cover what iOS handles natively, when you need an extractor app, what to look for, and how to handle the most common failures."

Wrap each paragraph in `<p>…</p>`.

- [ ] **Step 2: Write Section 1 (~250 words)**

Edit `<!-- SECTION_1_BODY -->`. Three paragraphs:
1. What iOS Files natively supports (ZIP, TAR — since iOS 13).
2. What it doesn't (RAR, 7Z, GZIP, password-protected ZIPs — fail silently or show generic error).
3. The honest take: "If your file is a plain `.zip` ≤ a few hundred MB, you don't need a separate app. Here's the 3-tap process — and here's where that flow breaks."

- [ ] **Step 3: Write Section 2 (~300 words)**

Edit `<!-- SECTION_2_BODY -->`. Numbered list (`<ol>`) of 4 steps:
1. Locate the `.zip` in Files (or save attachment from Mail/Messages to Files).
2. Tap the file (single tap, not long-press).
3. iOS unpacks to a folder beside the archive with the same base name.
4. The original `.zip` stays — delete it manually if you don't want both.

Add a closing paragraph: "Files works fine for plain ZIPs. If you hit any of these, jump to the troubleshooting section: nothing happens on tap, an error appears, you see 'cannot extract', the resulting folder is empty, or you're prompted for a password."

- [ ] **Step 4: Write Section 3 (~300 words)**

Edit `<!-- SECTION_3_BODY -->`. Four short paragraphs:
1. When iOS Files isn't enough: RAR (very common from older platforms), 7Z (developers, archived game packs), encrypted archives (work files, IT-distributed bundles).
2. What to look for in an extractor: format breadth, in-app preview before extracting, password support, on-device processing (no cloud uploads), storage-aware extraction.
3. On-device processing is a privacy point — uploading an archive to "decompress in the cloud" sends your file contents through a third party. Avoid that for sensitive material.
4. **Last paragraph (Unzip mention):** "Our app [Unzip](/unzip/) handles RAR, ZIP, 7Z, TAR, GZIP, and password-protected archives offline on iOS and Android. It exists because I needed it myself."

- [ ] **Step 5: Write Section 4 (~300 words)**

Edit `<!-- SECTION_4_BODY -->`. Six bold subheaders (or `<h3>`), each with a 1-2 sentence answer:

- **Nothing happens when I tap the file.** Usually means the file is not actually a ZIP, or the app you opened it from sandboxes the action. Use Files directly: Files → Browse → On My iPhone → tap.
- **"Cannot extract" error.** The archive is corrupt or uses an unsupported format (RAR, 7Z). Try a dedicated extractor.
- **Where did the files go?** Same directory as the archive. Look for a folder with the same name (no extension).
- **Resulting folder is empty.** Often the archive is empty, encrypted without your knowing, or the extraction silently failed mid-stream — open with a dedicated extractor to see the error.
- **Asked for a password I don't have.** Contact the sender. There is no "recover" for ZIP passwords.
- **"Not enough space" error.** ZIPs uncompress to several times their stored size. Free up storage equal to about 3× the archive's size.

- [ ] **Step 6: Write Section 5 (~250 words)**

Edit `<!-- SECTION_5_BODY -->`. One paragraph intro, then a brief comparison table or three-paragraph format.

- ZIP: universal, lowest friction, every OS handles it natively (iOS, Windows, macOS, Android).
- RAR: proprietary (WinRAR), better compression than ZIP, very common from Windows users and forum downloads. Internal link: "On iPhone, opening RAR requires an extractor — see [Unzip](/unzip/)."
- 7Z: open-source, highest compression ratio, slower to create. Common in developer/IT distribution.
- Add: "If you're sending files yourself, ZIP is the safe default. If you receive other formats, you'll need an extractor app. Once extracted, related workflows like editing or scanning are covered by [PDF Editor](/pdf-editor/) and [Smart Printer](/smart-printer/)."

This is where the `/pdf-editor/` and `/smart-printer/` internal links land.

- [ ] **Step 7: Write Section 6 (FAQ — ~250 words, 5 Q&A)**

Edit `<!-- SECTION_6_FAQ -->`. Five `<h3>` questions, each with a 2-3 sentence answer. Use these exact questions (they must match the FAQPage JSON-LD from Task 12):

1. **Can I unzip a password-protected file on iPhone?** Not with the native Files app — it doesn't prompt for passwords on encrypted ZIPs and fails silently. You need a dedicated extractor that supports encrypted archives.
2. **Where do unzipped files go on iOS?** Same directory as the archive. The Files app creates a folder beside the `.zip` with the same name (no extension), containing the extracted contents.
3. **Can iPhone open RAR files without an app?** No. iOS Files supports ZIP and TAR natively; RAR, 7Z, and GZIP need a third-party extractor.
4. **How big a ZIP can I extract on iPhone?** No hard limit beyond available storage. Extracting requires free space roughly 2–3× the compressed archive size. Very large archives (multi-GB) may also be slow because all processing happens on-device.
5. **Does extracting use my mobile data?** No — native extraction is entirely on-device. Some extractor apps offer "cloud extraction" which uploads your archive to their servers; that uses data and is a privacy trade-off, so check before opting in.

- [ ] **Step 8: Write Section 7 (Soft CTA — ~80 words)**

Edit `<!-- SECTION_7_CTA -->` (the call-out box). One paragraph:

"If you handle archives often on mobile — RAR, 7Z, password-protected, large files — a dedicated extractor saves significant time. My app [Unzip](/unzip/) is free on iOS and Android, processes everything on-device (no cloud uploads), and supports every common format. For occasional casual ZIPs the steps above cover most cases."

- [ ] **Step 9: Copy FAQ answers into the JSON-LD FAQPage block**

Now that Section 6 answers exist, update the `<<FILL IN FROM SECTION 6 OF BODY>>` placeholders in the `FAQPage` JSON-LD (top of file, Task 12) with the actual answer text. Strip HTML tags from the answers if any — the JSON-LD `text` field is plain text only.

- [ ] **Step 10: Verify body length and link count**

Run:
```bash
python3 -c "
import re
with open('blog/how-to-extract-zip-files-iphone/index.html') as f:
    text = f.read()
body_match = re.search(r'<article[^>]*>(.*?)</article>', text, re.DOTALL)
body = body_match.group(1) if body_match else ''
visible = re.sub(r'<[^>]+>', ' ', body)
words = len([w for w in visible.split() if w.strip()])
unzip_links = body.count('href=\"/unzip/\"')
pdf_links = body.count('href=\"/pdf-editor/\"')
sp_links = body.count('href=\"/smart-printer/\"')
print(f'Body word count: {words} (target 1800-2100)')
print(f'Internal links — /unzip/: {unzip_links} (target 2)')
print(f'Internal links — /pdf-editor/: {pdf_links} (target 1)')
print(f'Internal links — /smart-printer/: {sp_links} (target 1)')
"
```

Expected: word count 1,800–2,100; link counts match targets. If word count is low, expand the troubleshooting or comparison sections (those are the most natural to grow without invention).

- [ ] **Step 11: Verify FAQPage JSON-LD answers are filled**

Run:
```bash
grep -c "FILL IN FROM SECTION" blog/how-to-extract-zip-files-iphone/index.html
```

Expected: `0` (all placeholders replaced).

- [ ] **Step 12: Validate JSON for both schema blocks**

Run:
```bash
python3 -c "
import re, json
with open('blog/how-to-extract-zip-files-iphone/index.html') as f:
    text = f.read()
blocks = re.findall(r'<script type=\"application/ld\+json\">(.*?)</script>', text, re.DOTALL)
for i, b in enumerate(blocks):
    data = json.loads(b)
    print(f'Block {i+1}: @type={data.get(\"@type\")}')
print(f'Total JSON-LD blocks: {len(blocks)}')
"
```

Expected: 2 blocks, types `Article` and `FAQPage`.

- [ ] **Step 13: Commit**

```bash
git add blog/how-to-extract-zip-files-iphone/index.html
git commit -m "feat(content): write Unzip blog article body (1.8k+ words)

7 sections covering native iOS support, step-by-step extraction, when
to use a dedicated extractor, troubleshooting, format comparison, FAQ,
and a soft CTA. FAQPage JSON-LD mirrors the in-body FAQ section."
```

---

## Task 14: Wire the new blog article into the blog hub + Unzip page

**Files:**
- Modify: `blog/index.html` (blog hub — add a card for the new article).
- Modify: `unzip/index.html` (product page — add a single "Read more" link to the new article).

- [ ] **Step 1: Read the blog hub's current card layout**

```bash
sed -n '/blog-card/,/<\/div>/p' blog/index.html | head -30
```

Note the existing card class names and HTML structure. New card should match exactly.

- [ ] **Step 2: Add card to `blog/index.html`**

Use the Edit tool. Insert a new card in the blog hub's card grid (typically before or after the existing card list — chronologically the new article is the newest, so it goes first if cards are ordered newest-first).

Suggested card content (match existing markup):

```html
<div class="blog-card">
  <span class="blog-category">File Tools</span>
  <h4>How to Extract ZIP Files on iPhone (Step-by-Step Guide)</h4>
  <p>Extract ZIP, RAR, and 7Z files on iPhone — step-by-step with built-in iOS tools, when to use a dedicated extractor, and how to handle common failures.</p>
  <a href="/blog/how-to-extract-zip-files-iphone/">Read article →</a>
</div>
```

- [ ] **Step 3: Add "Read more" link to `unzip/index.html`**

Use the Edit tool to add a single link in the Unzip product page body, somewhere natural (e.g. after the features list or before the related-products section). Suggested copy:

```html
<p style="margin-top: 2rem; font-size: 0.95rem;">
  New: <a href="/blog/how-to-extract-zip-files-iphone/">How to Extract ZIP Files on iPhone — Step-by-Step Guide</a>
</p>
```

- [ ] **Step 4: Verify**

```bash
grep -c "how-to-extract-zip-files-iphone" blog/index.html  # expected: ≥ 1
grep -c "how-to-extract-zip-files-iphone" unzip/index.html  # expected: 1
```

- [ ] **Step 5: Commit**

```bash
git add blog/index.html unzip/index.html
git commit -m "feat(content): wire new Unzip article into blog hub + product page

New article gets a card on /blog/ and a single 'Read more' link on
/unzip/. Inbound link count for the article reaches 2 (hub + product)."
```

---

## Task 15: Sitemap refresh

**Files:**
- Modify: `sitemap.xml` — add 2 new entries; bump `<lastmod>` for pages touched in this session.

**New entries to add** (`<loc>`, `<lastmod>`, `<changefreq>`, `<priority>`):

```xml
<url>
  <loc>https://www.petrohrys.com/about/</loc>
  <lastmod>2026-05-13</lastmod>
  <changefreq>monthly</changefreq>
  <priority>0.8</priority>
</url>

<url>
  <loc>https://www.petrohrys.com/blog/how-to-extract-zip-files-iphone/</loc>
  <lastmod>2026-05-13</lastmod>
  <changefreq>monthly</changefreq>
  <priority>0.8</priority>
</url>
```

**Lastmod bumps to `2026-05-13`** — for these `<loc>` values only:
- `https://petrohrys.com/` (homepage)
- `https://petrohrys.com/unzip/`
- `https://petrohrys.com/pdf-editor/`
- `https://petrohrys.com/invoice-maker/`
- `https://petrohrys.com/pocket-manager/`
- `https://petrohrys.com/smart-printer/`
- `https://petrohrys.com/cv-builder/`
- `https://petrohrys.com/fax/`
- `https://petrohrys.com/blog/` (gets new card)

Do not bump entries for pages not touched (e.g. `/twinphone/` only got JSON-LD added but no body content changed — still bump if you consider JSON-LD a material change; conservative call: bump it too since structured data is part of the indexable surface).

Actually: every page that got *any* HTML edit gets a lastmod bump. That means also `/twinphone/`, `/tcg-scanner/`. Sticking with the spec's "pages I actually touch this session" rule: bump all 9 product pages (all got JSON-LD), homepage, blog hub, plus add the 2 new entries.

- [ ] **Step 1: Read current `sitemap.xml`**

```bash
cat sitemap.xml | head -80
```

Note: the current sitemap uses non-www `petrohrys.com` URLs, not `www.petrohrys.com` despite canonicals using `www.`. Decision: keep sitemap consistent with current state — do NOT silently flip the host (that'd be a bigger SEO change with potential ranking impact). The new entries I write must match the existing sitemap host (non-www).

- [ ] **Step 2: Verify host consistency before editing**

```bash
grep -o 'loc>https://[^/]*' sitemap.xml | sort -u
```

Expected: one host (likely `https://petrohrys.com`). If both `petrohrys.com` and `www.petrohrys.com` appear, surface this as a finding — there's a deeper inconsistency to clean up.

- [ ] **Step 3: Add the 2 new entries**

Use the Edit tool to add the two new `<url>` blocks to `sitemap.xml`. Match the host (non-www, if that's what the existing sitemap uses). Place the `/about/` entry near other top-level pages; place the blog article entry near the other `/blog/*` entries.

Important: in Step 1 the entries were shown with `www.petrohrys.com` host. **Update them to match the actual host in the sitemap before inserting** — if the existing sitemap uses `https://petrohrys.com/`, drop the `www.`.

- [ ] **Step 4: Bump `<lastmod>` for touched pages**

Use the Edit tool. For each of the 11 touched pages (9 product pages + homepage + blog hub), find the matching `<url>` block and update its `<lastmod>` to `2026-05-13`.

- [ ] **Step 5: Validate XML syntax**

```bash
xmllint --noout sitemap.xml && echo "sitemap.xml is valid XML"
```

Expected: "sitemap.xml is valid XML".

- [ ] **Step 6: Verify expected entries are present**

```bash
echo -n "/about/ present: "; grep -c "/about/" sitemap.xml
echo -n "/blog/how-to-extract-zip-files-iphone/ present: "; grep -c "how-to-extract-zip-files-iphone" sitemap.xml
echo -n "Pages with lastmod 2026-05-13: "; grep -c "2026-05-13" sitemap.xml
```

Expected: `/about/` ≥ 1, new article ≥ 1, lastmod count ≥ 13 (2 new + 11 bumped — actually 2 new + 11 bumped = 13).

- [ ] **Step 7: Commit**

```bash
git add sitemap.xml
git commit -m "chore(seo): add /about/ and Unzip article to sitemap, bump lastmod

Two new entries. Lastmod bumped to 2026-05-13 for all pages with
HTML changes in this session: homepage, 9 product pages, blog hub."
```

---

## Task 16: Canonical/OG/hreflang spot-check on grown surfaces

**Files:** Pages that grew after `seo-implementation.md` snapshot:
- `fax/index.html` (created post-snapshot)
- `articles/index.html`
- `templates/index.html`
- `startups/index.html`
- `startups/raising/index.html`
- `submit-startup/index.html`
- `blog/index.html`
- `blog/best-pdf-editor-app-iphone-android/index.html`
- `blog/pokemon-tcg-card-value-scanner/index.html`
- `blog/smart-printer-guide.html`
- `blog/what-is-business-globalization-open-economies.html`

This is a verify-then-patch task. Bound it: **if more than 4 pages need fixes, surface to user before continuing** rather than silently inflating scope.

- [ ] **Step 1: Audit each file for the 4 must-haves**

Run:
```bash
for f in fax/index.html articles/index.html templates/index.html startups/index.html startups/raising/index.html submit-startup/index.html blog/index.html blog/best-pdf-editor-app-iphone-android/index.html blog/pokemon-tcg-card-value-scanner/index.html blog/smart-printer-guide.html blog/what-is-business-globalization-open-economies.html; do
  if [ -f "$f" ]; then
    canonical=$(grep -c 'rel="canonical"' "$f")
    ogimage=$(grep -c 'property="og:image"' "$f")
    ogurl=$(grep -c 'property="og:url"' "$f")
    desc=$(grep -c 'name="description"' "$f")
    printf "%-60s canonical=%s og:image=%s og:url=%s desc=%s\n" "$f" "$canonical" "$ogimage" "$ogurl" "$desc"
  fi
done
```

Each column should be ≥ 1. Anything that's 0 is a gap.

- [ ] **Step 2: Tally gaps**

Count pages with any column = 0. If > 4 pages have gaps, stop and surface to user. If ≤ 4, proceed to patch.

- [ ] **Step 3: Patch gaps (per-page Edit)**

For each page with a gap, insert the missing tag(s) in `<head>`. Pattern templates:

```html
<!-- canonical -->
<link rel="canonical" href="https://www.petrohrys.com/<path>/">

<!-- og:image (use /photo1.jpg as fallback) -->
<meta property="og:image" content="https://www.petrohrys.com/photo1.jpg">

<!-- og:url -->
<meta property="og:url" content="https://www.petrohrys.com/<path>/">

<!-- meta description (one-sentence summary of the page's content) -->
<meta name="description" content="<short summary>">
```

For description, write a real one-sentence summary based on the page's `<h1>` and intro — do not generate a generic "Petro Hrys builds…" everywhere.

- [ ] **Step 4: Re-run the audit script from Step 1**

Expected: all columns now ≥ 1 for every file.

- [ ] **Step 5: Commit (only if changes were made)**

```bash
git add -A
git commit -m "chore(seo): backfill canonical/OG/description on post-April pages

Pages added since the April seo-implementation.md snapshot
(/fax/, /articles/, /templates/, /startups/, /submit-startup/, several
/blog/* articles) were missing canonical or OG basics. Patched the
gaps."
```

---

## Task 17: Final validation

**Files:** none modified — final assertion gate.

- [ ] **Step 1: Global tracker assertions**

```bash
cd /Users/petrohrys/PetroHrys.com

echo "=== Trackers ==="
echo -n "gtag references remaining (should be 0): "; grep -rc "G-4RE6YCJZBD" --include="*.html" . | grep -v ":0$" | wc -l
echo -n "googletagmanager references remaining (should be 0): "; grep -rc "googletagmanager" --include="*.html" . | grep -v ":0$" | wc -l
echo -n "CookieYes references remaining (should be 0): "; grep -rc "cookieyes" --include="*.html" . | grep -v ":0$" | wc -l
echo -n "WebmasterID tags installed (should be ~41): "; grep -rl "webmasterid-tracker" --include="*.html" . | wc -l
```

Expected: first 3 = 0; last = ~41.

- [ ] **Step 2: SEO assertions**

```bash
echo "=== SEO ==="
echo -n "Bing placeholder remaining (should be 0): "; grep -rl "PASTE_YOUR_BING_VERIFICATION_CODE_HERE" --include="*.html" . | wc -l
echo -n "Homepage Organization JSON-LD: "; grep -c '"Organization"' index.html
echo -n "Homepage Person JSON-LD: "; grep -c '"Person"' index.html
echo -n "Product pages with SoftwareApplication JSON-LD: "; grep -rl "SoftwareApplication" --include="*.html" . | wc -l
echo -n "/about/index.html exists: "; [ -f about/index.html ] && echo yes || echo NO
echo -n "/blog/how-to-extract-zip-files-iphone/index.html exists: "; [ -f blog/how-to-extract-zip-files-iphone/index.html ] && echo yes || echo NO
```

Expected: Bing placeholder = 0; Organization ≥ 1; Person ≥ 1; SoftwareApplication count = 9; both new files = yes.

- [ ] **Step 3: Sitemap assertions**

```bash
echo "=== Sitemap ==="
xmllint --noout sitemap.xml && echo "sitemap.xml is valid XML"
echo -n "/about/ in sitemap: "; grep -c "/about/" sitemap.xml
echo -n "Unzip article in sitemap: "; grep -c "how-to-extract-zip-files-iphone" sitemap.xml
echo -n "Entries with lastmod 2026-05-13: "; grep -c "2026-05-13" sitemap.xml
```

Expected: sitemap valid; /about/ ≥ 1; new article ≥ 1; 2026-05-13 lastmod count ≥ 13.

- [ ] **Step 4: Internal link gap closure**

```bash
echo "=== Internal links ==="
for product in twinphone fax tcg-scanner unzip; do
  count=$(grep -rl "/$product/" --include="*.html" . | grep -v "$product/index.html" | wc -l)
  echo "$product inbound links: $count (target: ≥ 3)"
done
```

Expected: all 4 ≥ 3.

- [ ] **Step 5: Manual browser checks (cannot script)**

Open these URLs locally (use `python3 -m http.server 8000` if needed to serve the site):
- `http://localhost:8000/` — confirm homepage trimmed-About reads cleanly, mentions HELPERG, "Read full bio" link points to /about/.
- `http://localhost:8000/about/` — confirm new page renders, all 4 sections present, all 9 app links work.
- `http://localhost:8000/blog/how-to-extract-zip-files-iphone/` — confirm article renders, all internal links resolve.
- View source on each of the 3 above — confirm WebmasterID `<script>` is in `<head>`, no gtag, no cookieyes.

- [ ] **Step 6: External validation tools (manual)**

Run these tools manually (cannot script):
1. **Google Rich Results Test** (https://search.google.com/test/rich-results) — paste:
   - `https://www.petrohrys.com/` (homepage Organization/Person/WebSite)
   - `https://www.petrohrys.com/about/` (AboutPage)
   - `https://www.petrohrys.com/blog/how-to-extract-zip-files-iphone/` (Article + FAQPage)
   - One product page, e.g. `https://www.petrohrys.com/pdf-editor/` (SoftwareApplication)
2. **Bing Markup Validator** — same URLs.
3. **Facebook Sharing Debugger** — verify OG tags render.

Document any errors or warnings in the deliverable report.

- [ ] **Step 7: Final commit (deliverable report)**

If everything passes, write a final summary to `docs/superpowers/specs/2026-05-13-petrohrys-seo-tracker-overhaul-report.md` summarizing:
1. Files modified (list)
2. Files added (`/about/`, new blog article)
3. SEO improvements added (count and category)
4. WebmasterID method (script tag, no consent gate, cookieless)
5. Validation results (per Steps 1-6)
6. Risks and follow-ups (from spec §11)

```bash
git add docs/superpowers/specs/2026-05-13-petrohrys-seo-tracker-overhaul-report.md
git commit -m "docs: implementation report for SEO + tracker overhaul

Summarizes what shipped, validation results, and follow-up items."
```

---

## Self-review notes (post-write)

**Spec coverage:** Walked the 6 spec sections + out-of-scope list:
- Section 1 (tracker) — Tasks 2, 3, 4 ✓
- Section 2 (technical SEO) — Bing placeholder Task 5 ✓, sitemap Task 15 ✓, canonical/OG audit Task 16 ✓, JSON-LD Tasks 6 + 7 ✓
- Section 3 (internal linking) — Task 8 ✓
- Section 4 (/about/) — Tasks 9 + 10 ✓
- Section 5 (blog article) — Tasks 12 + 13 + 14 ✓
- Section 6 (homepage tweaks) — Task 11 ✓
- Out-of-scope items — listed in spec §10, not in plan ✓

**Placeholder scan:** Spot-checked tasks for forbidden patterns ("TBD", "implement later", "add appropriate", etc.). All steps have concrete code/commands or a specific instruction with target output. Section 13 prose is described as "write per section guidance" — this is acceptable because the constraints, word counts, and exact content anchors are specified per section.

**Type/identifier consistency:** WebmasterID `data-wmid="wm_bktqqtd7heom5nkl"` consistent across Tasks 4, 9, 12. JSON-LD `@type` values consistent. Internal link counts in Task 13 match spec §8 (`/unzip/` ×2, `/pdf-editor/` ×1, `/smart-printer/` ×1 = 4 total — corrected mid-task because spec said "3 total" but reading carefully shows 4 distinct links).

---

## Open items / dependencies

- **Sitemap host inconsistency** flagged in Task 15 Step 2. If both `petrohrys.com` and `www.petrohrys.com` appear in sitemap (mixed hosts), that's a separate clean-up task — surface to user.
- **External validation tools** (Task 17 Step 6) require manual operation against the deployed site, not the local file tree.
- **Localized variants** of `/about/` and new blog article — explicitly out of scope this session.
