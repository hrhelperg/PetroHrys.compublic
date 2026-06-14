# International Editorial Parity (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `/es/`, `/fr/`, `/de/` to full design + content parity with the approved English Phase-2 site (rewrite 3 homepages, create 9 new pages), with translated metadata/alt, full hreflang reciprocity, and preserved analytics — so all four languages feel like one premium website.

**Architecture:** Static HTML, no build step. Localized editorial pages are **generated from the English pages as templates** (guarantees byte-identical layout), substituting reviewed translation strings (from the spec), localized internal links, localized footer, and a per-page hreflang cluster. A one-off Python generator in `/tmp` produces the 12 files; the generated HTML is committed (same pattern as Phase 2's transform scripts).

**Tech Stack:** HTML5 + `css/petrohrys.css`; Python 3 for generation; grep/curl/Python for verification (no unit-test runner exists).

**Spec (authoritative string source):** `docs/superpowers/specs/2026-06-14-international-editorial-parity-design.md` — every translated string lives there; the generator encodes those exact strings.

**Branch:** `feat/international-editorial-parity` (already created, off `feat/premium-personal-ecosystem`).

---

## Verification conventions

Static site, no test framework. "Tests" = assertions. Reuse the `check_links` helper (resolves root-absolute `href`s to files) and a `python3 -m http.server` + curl smoke check from the Phase 2 plan. New for Phase 3: an **hreflang reciprocity** Python check (Task 5).

`check_links` (paste before link checks):
```bash
check_links() { for f in "$@"; do grep -oE 'href="/[^"#?]*"' "$f" | sed -E 's/href="(.*)"/\1/' | sort -u | while read -r url; do p=".${url}"; { [ -d "$p" ] && [ -f "${p%/}/index.html" ]; } && continue; [ -f "$p" ] && continue; echo "  BROKEN $f -> $url"; done; done; }
```

---

## Canonical localized chrome (used by the generator)

### Localized nav labels & lang-active

| token | es | fr | de |
|---|---|---|---|
| HOME (wordmark target) | `/es/` | `/fr/` | `/de/` |
| WORK label | Proyectos | Travaux | Projekte |
| WRITING label | Investigación y Publicaciones | Recherche et Publications | Forschung & Veröffentlichungen |
| ABOUT label | Acerca de | À propos | Über mich |
| skip | Saltar al contenido | Aller au contenu | Zum Inhalt springen |
| menu | Menú | Menu | Menü |
| aria Primary | Principal | Principale | Hauptmenü |
| aria Language | Idioma | Langue | Sprache |

Nav HTML (per locale `L`, `lang` ∈ es/fr/de) — desktop + mobile `nav-primary` use localized labels and `/L/...` hrefs; the wordmark points to `/L/`; the lang switcher marks the current language `aria-current="page"` and points EN→`/`. Page-specific `aria-current="page"` goes on the matching primary item (Work page → Work; Writing page → Writing; About page → Writing? **no** — About→About; Home → none). Example (ES, About page):

```html
  <header role="banner">
    <nav aria-label="Principal">
      <a href="/es/" class="wordmark">Petro Hrys</a>
      <ul class="nav-primary">
        <li><a href="/es/work/">Proyectos</a></li>
        <li><a href="/es/writing/">Investigación y Publicaciones</a></li>
        <li><a href="/es/about/" aria-current="page">Acerca de</a></li>
      </ul>
      <ul class="nav-lang" aria-label="Idioma">
        <li><a href="/">EN</a></li>
        <li><a href="/es/" aria-current="page">ES</a></li>
        <li><a href="/fr/">FR</a></li>
        <li><a href="/de/">DE</a></li>
      </ul>
      <details class="nav-mobile">
        <summary>Menú</summary>
        <div class="nav-mobile-panel">
          <ul class="nav-primary">
            <li><a href="/es/work/">Proyectos</a></li>
            <li><a href="/es/writing/">Investigación y Publicaciones</a></li>
            <li><a href="/es/about/" aria-current="page">Acerca de</a></li>
          </ul>
          <ul class="nav-lang" aria-label="Idioma">
            <li><a href="/">EN</a></li>
            <li><a href="/es/" aria-current="page">ES</a></li>
            <li><a href="/fr/">FR</a></li>
            <li><a href="/de/">DE</a></li>
          </ul>
        </div>
      </details>
    </nav>
  </header>
```

### Localized footer (per locale `L`)

Group headings + item labels from spec §Navigation/footer. Link targets:
- **Products** (`id="footer-tools"`): `/L/pdf-editor/`, `/unzip/`, `/smart-printer/`, `/L/invoice-maker/`, `/L/pocket-manager/`, `/fax/`, `/twinphone/`, `/L/cv-builder/`, `/tcg-scanner/`
- **Research & Writing**: `/essays/`, `/research/`, `/infrastructure/`, `/ai-systems/`, `/artificial-intelligence/` (EN)
- **Index**: `/blog/`, `/articles/`, `/sitemap.xml` (EN)
- **Legal**: `/L/privacy/`, `/L/terms/` (localized)

ES footer (canonical example; FR/DE swap headings+labels per spec table):
```html
  <footer role="contentinfo">
    <div class="footer-grid">
      <section id="footer-tools">
        <h3>Productos</h3>
        <ul>
          <li><a href="/es/pdf-editor/">PDF Editor</a></li>
          <li><a href="/unzip/">Unzip</a></li>
          <li><a href="/smart-printer/">Smart Printer</a></li>
          <li><a href="/es/invoice-maker/">Invoice Maker</a></li>
          <li><a href="/es/pocket-manager/">Pocket Manager</a></li>
          <li><a href="/fax/">FAX</a></li>
          <li><a href="/twinphone/">TwinPhone</a></li>
          <li><a href="/es/cv-builder/">CV Builder</a></li>
          <li><a href="/tcg-scanner/">TCG Scanner</a></li>
        </ul>
      </section>
      <section>
        <h3>Investigación y Publicaciones</h3>
        <ul>
          <li><a href="/essays/">Ensayos</a></li>
          <li><a href="/research/">Investigación</a></li>
          <li><a href="/infrastructure/">Infraestructura</a></li>
          <li><a href="/ai-systems/">Sistemas de IA</a></li>
          <li><a href="/artificial-intelligence/">Inteligencia Artificial</a></li>
        </ul>
      </section>
      <section>
        <h3>Índice</h3>
        <ul>
          <li><a href="/blog/">Blog</a></li>
          <li><a href="/articles/">Artículos</a></li>
          <li><a href="/sitemap.xml">Mapa del sitio</a></li>
        </ul>
      </section>
      <section>
        <h3>Legal</h3>
        <ul>
          <li><a href="/es/privacy/">Privacidad</a></li>
          <li><a href="/es/terms/">Términos</a></li>
        </ul>
      </section>
    </div>
    <p class="footer-bottom">&copy; 2026 Petro Hrys</p>
  </footer>
```

### hreflang cluster (per page type, host `https://www.petrohrys.com`)

Each editorial page gets, after its `<link rel="canonical" href="[self]">`:
```html
  <link rel="alternate" hreflang="en" href="https://www.petrohrys.com[EN]">
  <link rel="alternate" hreflang="es" href="https://www.petrohrys.com[ES]">
  <link rel="alternate" hreflang="fr" href="https://www.petrohrys.com[FR]">
  <link rel="alternate" hreflang="de" href="https://www.petrohrys.com[DE]">
  <link rel="alternate" hreflang="x-default" href="https://www.petrohrys.com[EN]">
```
where `[EN/ES/FR/DE]` are the cluster paths: Home `/`,`/es/`,`/fr/`,`/de/`; Work `/work/`,`/es/work/`,…; Writing `/writing/`,…; About `/about/`,….

### Internal link rules (generator)
- Editorial nav/wordmark/breadcrumb/identity/"more about me"/"all work"/"all writing" → localized (`/L/`, `/L/work/`, `/L/writing/`, `/L/about/`).
- Product links → localized where page exists (pdf-editor, cv-builder, invoice-maker, pocket-manager), else EN.
- Deep-content links (`/artificial-intelligence/`, `/blog/...`, `/essays/`, `/research/`, `/infrastructure/`, `/ai-systems/`) → EN, and (for the writing-hub categories, writing-hub Recent, homepage Selected writing) get a trailing `<span class="ext-lang" title="[in-language]">EN</span>`.
- Lang switcher → `/`, `/es/`, `/fr/`, `/de/` (current = `aria-current="page"`).

---

## Task 1: Add the `.ext-lang` badge CSS

**Files:** Modify `css/petrohrys.css` (append before `/* ===== End ===== */`).

- [ ] **Step 1:** Add:
```css
/* ===== Phase 3 — i18n "EN" tag (links to untranslated English articles) ===== */
.ext-lang {
  font-family: var(--ff-mono);
  font-size: 0.625rem;
  letter-spacing: 0.06em;
  color: var(--text-3);
  border: var(--rule-w) solid var(--rule);
  border-radius: 2px;
  padding: 0 0.3em;
  margin-left: 0.5em;
  vertical-align: middle;
}
```
- [ ] **Step 2:** Verify: `grep -c '\.ext-lang' css/petrohrys.css` → `1`.
- [ ] **Step 3:** Commit: `git add css/petrohrys.css && git commit -m "feat(css): add .ext-lang i18n badge"`.

---

## Task 2: Build the i18n generator and produce all 12 localized pages

**Files:** Create `/tmp/phase3_gen.py` (generator, not committed). Create `es/{index,work/index,writing/index,about/index}.html`, `fr/...`, `de/...` (12 files).

**Approach:** For each `(lang, page)`, read the English source page, then transform:
1. `<html lang="en">` → `<html lang="{lang}">`.
2. Replace the `<header>…</header>` with the localized header (Canonical chrome) for that page (correct `aria-current`).
3. Replace the `<footer>…</footer>` with the localized footer.
4. Replace `<link rel="canonical" …>` to self (`/L/...`) and inject the hreflang cluster block right after it; remove any pre-existing alternate links.
5. Replace every English visible/meta string with its translation **exactly as written in the spec** (titles, meta, OG/Twitter, H1, lede, headings, paragraphs, product one-liners, captions, alt, breadcrumb, JSON-LD translatable fields).
6. Remap internal links per the link rules; append `.ext-lang` badges to deep-content links on home (Selected writing) and writing (categories + Recent).
7. Favicon already `/images/logo-red.svg` in the EN source — inherited.

Because step 5 must use the **exact** reviewed strings, the generator holds a per-language dict keyed to the spec. The English source pages are the structural template.

- [ ] **Step 1: Write `/tmp/phase3_gen.py`** with: (a) `LANGS = {"es":{…},"fr":{…},"de":{…}}` data dicts containing every string from spec §"Per-page content" + §Navigation/footer + the `ext_lang_title` ("en inglés"/"en anglais"/"auf Englisch"); (b) `HEADER(lang, current)` and `FOOTER(lang)` builders emitting the Canonical chrome HTML; (c) `HREF` cluster builder; (d) a `build(lang, page)` that reads `EN_SRC[page]`, applies transforms 1–7, returns HTML; (e) a loop writing all 12 files. EN source paths: `index.html`, `work/index.html`, `writing/index.html`, `about/index.html`.

- [ ] **Step 2: Run** `cd ~/PetroHrys.com && python3 /tmp/phase3_gen.py` — expect `wrote es/index.html … de/about/index.html` (12 lines) and no assertion errors. The generator must `assert` that every English string it intends to replace was found exactly once (catches drift).

- [ ] **Step 3: Verify analytics + lang + canonical on all 12** (want `wmid=1 gtag=2 cky=1`, `lang="L"`, self-canonical):
```bash
for L in es fr de; do for P in index work/index writing/index about/index; do f="$L/$P.html"; printf "%-22s lang=%s wmid=%s gtag=%s cky=%s canon=%s\n" "$f" "$(grep -c "<html lang=\"$L\"" $f)" "$(grep -c wm_bktqqtd7heom5nkl $f)" "$(grep -c G-4RE6YCJZBD $f)" "$(grep -c 'id="cookieyes"' $f)" "$(grep -c "canonical\" href=\"https://www.petrohrys.com/$L/" $f)"; done; done
```
Expected every line: `lang=1 wmid=1 gtag=2 cky=1 canon=1`.

- [ ] **Step 4: Verify no English leakage in nav/H1** (spot-check localized labels present, English nav gone):
```bash
grep -c '>Proyectos<' es/work/index.html        # 2 (desktop+mobile nav) +1 H1 +1 breadcrumb possible; expect >=2
grep -L 'Investigación y Publicaciones' es/index.html es/work/index.html es/writing/index.html es/about/index.html  # expect none
grep -rl '>Research &amp; Writing<' es fr de --include=index.html 2>/dev/null  # expect none (localized only)
```

- [ ] **Step 5: Link integrity** (paste `check_links`): `check_links es/index.html es/work/index.html es/writing/index.html es/about/index.html fr/index.html fr/work/index.html fr/writing/index.html fr/about/index.html de/index.html de/work/index.html de/writing/index.html de/about/index.html` → expect nothing (all localized + EN targets exist; localized product/privacy/terms exist).

- [ ] **Step 6: Parse** each of the 12 with Python `html.parser` (no exceptions).

- [ ] **Step 7: Commit** `git add es fr de && git commit -m "feat(i18n): localized homepage/work/writing/about for es, fr, de"`.

---

## Task 3: Add hreflang clusters to the English Work / Writing / About pages

**Files:** Modify `work/index.html`, `writing/index.html`, `about/index.html` (EN). (EN `index.html` already has the Home cluster — verify, leave.)

- [ ] **Step 1:** For each EN page, locate `<link rel="canonical" href="https://www.petrohrys.com/[work|writing|about]/">` and insert immediately after it the hreflang cluster block for that page type (en=self, es=`/es/[…]/`, fr, de, x-default=en). Use the cluster builder.

- [ ] **Step 2: Verify** each EN page now has 5 alternates:
```bash
for f in work/index.html writing/index.html about/index.html; do printf "%s alts=%s\n" "$f" "$(grep -c 'rel="alternate" hreflang=' $f)"; done   # expect 5 each
grep -c 'rel="alternate"' index.html   # home already 5
```

- [ ] **Step 3: Commit** `git add work/index.html writing/index.html about/index.html && git commit -m "feat(seo): add hreflang clusters to EN work/writing/about"`.

---

## Task 4: Add the 12 localized editorial URLs to the sitemap

**Files:** Modify `sitemap.xml`.

- [ ] **Step 1:** After the `<!-- Phase 2 hubs -->` block, insert a `<!-- Phase 3 localized editorial -->` block with 12 `<url>` entries (non-www `loc`, matching the file convention; `lastmod` `2026-06-14`, `changefreq` monthly, `priority` 0.7): `/es/`, `/es/work/`, `/es/writing/`, `/es/about/`, then `/fr/…`, `/de/…`.

- [ ] **Step 2: Verify**: `grep -c 'petrohrys.com/\(es\|fr\|de\)/\(work\|writing\|about\)\?/\?</loc>' sitemap.xml` ≥ 12; `python3 -c "import xml.dom.minidom; xml.dom.minidom.parse('sitemap.xml'); print('XML OK')"`.

- [ ] **Step 3: Commit** `git add sitemap.xml && git commit -m "feat(seo): add localized editorial URLs to sitemap"`.

---

## Task 5: International Consistency Audit (final phase)

**Files:** none modified (verification only; fix-forward if a check fails). Produces the report for the user's required quality review.

- [ ] **Step 1 — Navigation parity:** every editorial page (EN + 12 localized) has exactly 3 `nav-primary` items, twice (desktop+mobile). Check item count and that each localized page uses its localized labels (no English nav labels on localized pages).

- [ ] **Step 2 — Footer parity:** the four footer `<h3>` group headings appear once each on every page; per language the headings match the spec; `id="footer-tools"` present on each.

- [ ] **Step 3 — Photo placement parity:** each localized page references the same portrait as its EN counterpart — home+about `portrait-2.jpg`, writing `portrait-1.jpg`, work `portrait-3-work.jpg`:
```bash
for L in es fr de; do
  grep -q 'portrait-2.jpg' $L/index.html && grep -q 'portrait-2.jpg' $L/about/index.html && grep -q 'portrait-1.jpg' $L/writing/index.html && grep -q 'portrait-3-work.jpg' $L/work/index.html && echo "$L photos OK" || echo "$L PHOTO MISMATCH"
done
```

- [ ] **Step 4 — Image crop consistency:** localized pages reuse the same image files (same intrinsic `width`/`height` attributes as EN); confirm no localized page introduced a different dimension. Compare the `<img class="portrait"` tags' width/height to EN counterparts.

- [ ] **Step 5 — Hreflang reciprocity (Python):** for each cluster (home/work/writing/about), load the 4 language pages, parse their `hreflang` alternates, and assert every page lists all four languages + x-default with identical URL sets, and each `hreflang=L` URL actually exists on disk. Report any non-reciprocal or dangling alternate. Script:
```bash
python3 - <<'PY'
import re, pathlib
REPO = pathlib.Path.home()/"PetroHrys.com"
clusters = {
 "home":   {"en":"/","es":"/es/","fr":"/fr/","de":"/de/"},
 "work":   {"en":"/work/","es":"/es/work/","fr":"/fr/work/","de":"/de/work/"},
 "writing":{"en":"/writing/","es":"/es/writing/","fr":"/fr/writing/","de":"/de/writing/"},
 "about":  {"en":"/about/","es":"/es/about/","fr":"/fr/about/","de":"/de/about/"},
}
def path_for(url): return REPO/(url.strip("/")+"/index.html") if url!="/" else REPO/"index.html"
ok=True
for c,langs in clusters.items():
    expect=set(f"https://www.petrohrys.com{u}" for u in langs.values())
    for L,u in langs.items():
        f=path_for(u); html=f.read_text()
        alts=dict(re.findall(r'hreflang="([^"]+)"\s+href="([^"]+)"', html))
        for need in ("en","es","fr","de","x-default"):
            if need not in alts: print(f"  MISSING {need} in {c}:{L}"); ok=False
        if set(v for k,v in alts.items() if k!="x-default")!=expect:
            print(f"  NON-RECIPROCAL {c}:{L} -> {alts}"); ok=False
        for k,v in alts.items():
            p=path_for(v.replace('https://www.petrohrys.com',''))
            if not p.exists(): print(f"  DANGLING {c}:{L} {k} -> {v}"); ok=False
print("HREFLANG OK" if ok else "HREFLANG ISSUES")
PY
```
Expected: `HREFLANG OK`.

- [ ] **Step 6 — Metadata parity:** every localized page has translated `<title>`, `meta description`, `og:title/description`, `twitter:title/description` (non-empty, not equal to the English string). Spot-check: `for L in es fr de; do grep -o '<title>[^<]*' $L/index.html; done` shows localized titles.

- [ ] **Step 7 — EN-tag coverage:** every localized writing hub + homepage Selected-writing has `.ext-lang` badges on deep-content links, and the badge count matches the deep-link count:
```bash
for L in es fr de; do printf "%s writing-EN=%s home-EN=%s\n" "$L" "$(grep -c 'class="ext-lang"' $L/writing/index.html)" "$(grep -c 'class="ext-lang"' $L/index.html)"; done   # writing>=5, home>=2
```

- [ ] **Step 8 — Mobile parity:** local server + curl 200 for the 12 pages; manual DevTools pass at 375px on one page per language (nav menu opens, one portrait visible, no overflow). Record HTTP codes.

- [ ] **Step 9 — Desktop parity:** manual pass at 1280px on one page per language (2-col About, identity block, product list, featured grid render identically to EN). Record observations.

- [ ] **Step 10 — Analytics parity:** confirm the WebmasterID/CookieYes/GA block is byte-identical (same IDs, same order) across all 12 localized pages and the EN pages:
```bash
for L in es fr de; do for P in index work/index writing/index about/index; do f="$L/$P.html"; printf "%s wmid=%s gtag=%s cky=%s\n" "$f" "$(grep -c wm_bktqqtd7heom5nkl $f)" "$(grep -c G-4RE6YCJZBD $f)" "$(grep -c 'id="cookieyes"' $f)"; done; done
```
Expected all `wmid=1 gtag=2 cky=1`.

- [ ] **Step 11 — Write the audit report** to the PR/summary covering the user's 10 points + remaining i18n debt, then **push** `git push -u origin feat/international-editorial-parity` (await user direction on PR, consistent with Phase 2).

---

## Self-review

- **Spec coverage:** scope/rewrite+create (T2) · nav/footer/chrome localized (T2 via Canonical chrome) · hreflang model (T2 localized + T3 EN + T5 audit) · per-page translations (T2 from spec) · `.ext-lang` (T1, T2, T5 step 7) · sitemap (T4) · analytics preserved (T2 step 3, T5 step 10) · photo parity (T5 step 3-4) · 10-point audit (T5). All spec sections map to a task.
- **Placeholder scan:** none. The translation strings are not duplicated here by design — they live in the committed spec, which the generator encodes verbatim; the generator asserts each English source string is found exactly once (drift guard).
- **Consistency:** portrait files (`portrait-2` home+about, `portrait-1` writing, `portrait-3-work` work) match Phase 2 + spec; hreflang cluster paths identical in T2/T3/T5; analytics IDs identical throughout.
