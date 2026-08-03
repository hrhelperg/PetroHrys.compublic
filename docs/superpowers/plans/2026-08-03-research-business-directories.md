# Research Center → Business Directories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a strictly additive Research Center → Business Directories section to PetroHrys.com, generated entirely from a structured JSON registry, with zero real directory data and zero changes to existing design.

**Architecture:** A deterministic Node CommonJS generator reads a JSON registry and emits static `.html` files into the existing site tree. No framework, no bundler, no `package.json`. Rendering is split into focused library modules (registry, sort, seo, components, render, feeds) so each file has one responsibility and fits comfortably in context. Client-side JavaScript only reorders and filters DOM that is already prerendered.

**Tech Stack:** Node v24 (built-in `node:test`, `node:fs`, `node:path`), plain CommonJS, hand-written HTML strings, CSS custom properties from the existing `css/petrohrys.css`.

**Spec:** `docs/superpowers/specs/2026-08-03-research-business-directories-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **Never add a `package.json` at the repository root.** A root manifest makes Netlify auto-detect a build command and can break deploys of a site that ships raw files. (Note: `startups-app/package.json` already exists — a pre-existing Next.js 14 + Prisma app in a subdirectory, committed in `9aacd8f`. It does not affect root build detection and is entirely out of scope. Do not touch it, and do not treat it as precedent for adding manifests.)
- **Never modify** `css/petrohrys.css`, `sitemap.xml`, `index.html` content, the homepage layout, existing colors, typography, spacing, layouts, or components.
- **Only permitted edits to existing files:** one nav `<li>` on the 8 English editorial pages, one added section in `/research/index.html`, one added `Sitemap:` line in `robots.txt`.
- **The 8 English editorial pages** are exactly: `index.html`, `work/index.html`, `writing/index.html`, `research/index.html`, `essays/index.html`, `ai-systems/index.html`, `infrastructure/index.html`, `about/index.html`.
- **Never touch** the 23 legacy product/blog pages or the 33 `es/` `fr/` `de/` pages.
- **Nav label is exactly** `Research Center`. Never `Research`. Never rename or reorder existing items.
- **All URLs use** `https://www.petrohrys.com` — canonical, OG, JSON-LD, sitemap, RSS. Never the apex domain.
- **All new CSS classes are prefixed** `bd-`. Never redefine an existing selector. Never declare a raw color, font-family, font-size, or spacing literal — consume existing custom properties only.
- **No fabricated data.** No invented directories, scores, ratings, traffic, pricing, or availability. Unknown values stay `null` and render as `—`.
- **Do not copy** `<meta name="msvalidate.01" content="PASTE_YOUR_BING_VERIFICATION_CODE_HERE">` into generated pages. It is an unfilled placeholder on existing pages; propagating it 221 times is a defect. Recorded as a follow-up.
- **Lean emission policy (supersedes the 221-page matrix).** Only these routes are ever written to disk:
  1. the hub `/research/business-directories/` — always, and indexable;
  2. the reference country `/research/business-directories/united-states/` — always;
  3. the reference category `/research/business-directories/united-states/categories/general-business/` — always;
  4. any country that has at least one real directory record;
  5. any category that has at least one real directory record;
  6. a detail page for every real directory record.

  Never create empty HTML files merely to validate routing. The generator, validator, sorting, filters, SEO helpers, feeds, and route builders must nonetheless support the **complete** 10 × 21 matrix, exercised through tests rather than through emitted files.
- **Pruning is mandatory.** When a directory record is removed and a route becomes empty, the generator must delete the now-stale `index.html` and any directory left empty. Pruning is confined to `research/business-directories/` and never touches `feed.xml`.
- **`validateRegistry` is the single gate.** It returns `{ ok, errors }`. Every build — Task 10 and anything added later — must refuse to write or prune anything when `ok` is false. Errors are collected in one pass and reported in deterministic order; validators never mutate the registry.
- **Never link an un-emitted route.** The hub and country pages list un-emitted countries/categories as non-linked "coming soon" text. A link to a page that was not written would be a 404.
- **No real directory data in this phase** unless separately verified and explicitly approved.
- **Branch:** `feat/research-business-directories` (already created, spec committed as `f64c4a3`, this plan as `9718139`).
- **Stacked branch.** This branch forks from `feat/helperg-ecosystem-banner`, which is itself unmerged and already modifies `sitemap.xml` and `css/petrohrys.css` relative to `main`. **Never verify scope with `git diff main`** — always diff against `$(git merge-base HEAD feat/helperg-ecosystem-banner)`.
- **Run the full suite with:** `node --test "scripts/tests/*.test.cjs"` — quoted, so Node expands the glob.
  **Do not use `node --test scripts/tests/`**: on Node 24 a bare directory argument is resolved as a module path and dies with `Cannot find module`. Verified on this machine.

---

## File Structure

| File | Responsibility |
|---|---|
| `data/business-directories/countries.json` | 10 country records |
| `data/business-directories/categories.json` | 21 category records |
| `data/business-directories/directories/<country>.json` | Per-country directory arrays, all `[]` |
| `scripts/lib/bd-util.cjs` | Escaping, deterministic file writing |
| `scripts/lib/bd-registry.cjs` | Load, index, and query the registry |
| `scripts/lib/bd-sort.cjs` | Sort comparators with null-last ordering |
| `scripts/lib/bd-seo.cjs` | URLs, `<head>`, and JSON-LD builders |
| `scripts/lib/bd-components.cjs` | Reusable HTML fragments (`.bd-*`) |
| `scripts/lib/bd-render.cjs` | Full-document shell matching the editorial system |
| `scripts/lib/bd-feeds.cjs` | Sitemap and RSS emitters |
| `scripts/validate-business-directories.cjs` | Schema, referential, and honesty gate |
| `scripts/build-business-directories.cjs` | Orchestrates on-demand generation + pruning + feeds |
| `scripts/inject-research-nav.cjs` | Idempotent nav injection on 8 editorial pages |
| `css/business-directories.css` | Section styling from existing tokens |
| `js/business-directories.js` | Progressive-enhancement sort/filter/search |
| `scripts/tests/*.test.cjs` | Test suite |

---

### Task 1: Utilities and registry data

**Files:**
- Create: `scripts/lib/bd-util.cjs`
- Create: `data/business-directories/countries.json`
- Create: `data/business-directories/categories.json`
- Create: `data/business-directories/directories/<10 files>.json`
- Test: `scripts/tests/bd-util.test.cjs`

**Interfaces:**
- Produces: `escapeHtml(value): string`, `escapeXml(value): string`, `writeIfChanged(filePath, contents): boolean`, `PATHS.dataRoot`, `PATHS.siteRoot`

- [ ] **Step 1: Write the failing test**

```js
// scripts/tests/bd-util.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { escapeHtml, escapeXml, writeIfChanged } = require('../lib/bd-util.cjs');

test('escapeHtml escapes all five HTML-significant characters', () => {
  assert.strictEqual(escapeHtml(`<a href="x">O'Neil & Co</a>`),
    '&lt;a href=&quot;x&quot;&gt;O&#39;Neil &amp; Co&lt;/a&gt;');
});

test('escapeHtml renders null and undefined as empty string', () => {
  assert.strictEqual(escapeHtml(null), '');
  assert.strictEqual(escapeHtml(undefined), '');
});

test('escapeXml uses &apos; rather than a numeric apostrophe entity', () => {
  assert.strictEqual(escapeXml("O'Neil & Co"), 'O&apos;Neil &amp; Co');
});

test('writeIfChanged writes on first call and reports true', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bd-'));
  const file = path.join(dir, 'nested', 'out.txt');
  assert.strictEqual(writeIfChanged(file, 'hello'), true);
  assert.strictEqual(fs.readFileSync(file, 'utf8'), 'hello');
});

test('writeIfChanged is a no-op when contents are identical', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bd-'));
  const file = path.join(dir, 'out.txt');
  writeIfChanged(file, 'hello');
  const before = fs.statSync(file).mtimeMs;
  assert.strictEqual(writeIfChanged(file, 'hello'), false);
  assert.strictEqual(fs.statSync(file).mtimeMs, before);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/PetroHrys.com && node --test scripts/tests/bd-util.test.cjs`
Expected: FAIL — `Cannot find module '../lib/bd-util.cjs'`

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/bd-util.cjs
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const HTML = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const XML = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

function escapeWith(map, value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (ch) => map[ch]);
}

const escapeHtml = (value) => escapeWith(HTML, value);
const escapeXml = (value) => escapeWith(XML, value);

function writeIfChanged(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8') === contents) return false;
  fs.writeFileSync(filePath, contents, 'utf8');
  return true;
}

const siteRoot = path.resolve(__dirname, '..', '..');
const PATHS = {
  siteRoot,
  dataRoot: path.join(siteRoot, 'data', 'business-directories'),
  sectionRoot: path.join(siteRoot, 'research', 'business-directories'),
};

module.exports = { escapeHtml, escapeXml, writeIfChanged, PATHS };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/tests/bd-util.test.cjs`
Expected: PASS, 5 tests

- [ ] **Step 5: Create `data/business-directories/countries.json`**

`titleName` exists so copy reads "Business directories in **the** United States" without grammar bugs.

```json
[
  { "id": "united-states",  "slug": "united-states",  "name": "United States",  "titleName": "the United States",  "iso2": "US" },
  { "id": "germany",        "slug": "germany",        "name": "Germany",        "titleName": "Germany",            "iso2": "DE" },
  { "id": "united-kingdom", "slug": "united-kingdom", "name": "United Kingdom", "titleName": "the United Kingdom", "iso2": "GB" },
  { "id": "france",         "slug": "france",         "name": "France",         "titleName": "France",             "iso2": "FR" },
  { "id": "spain",          "slug": "spain",          "name": "Spain",          "titleName": "Spain",              "iso2": "ES" },
  { "id": "italy",          "slug": "italy",          "name": "Italy",          "titleName": "Italy",              "iso2": "IT" },
  { "id": "canada",         "slug": "canada",         "name": "Canada",         "titleName": "Canada",             "iso2": "CA" },
  { "id": "australia",      "slug": "australia",      "name": "Australia",      "titleName": "Australia",          "iso2": "AU" },
  { "id": "czech-republic", "slug": "czech-republic", "name": "Czech Republic", "titleName": "the Czech Republic", "iso2": "CZ" },
  { "id": "poland",         "slug": "poland",         "name": "Poland",         "titleName": "Poland",             "iso2": "PL" }
]
```

- [ ] **Step 6: Create `data/business-directories/categories.json`**

Descriptions define what the category *means*. They make no claim about which directories exist.

```json
[
  { "id": "general-business",        "slug": "general-business",        "name": "General Business",        "description": "Broad, cross-industry listing sites that accept companies of any type or sector." },
  { "id": "local-business",          "slug": "local-business",          "name": "Local Business",          "description": "Location-driven listings built around physical presence, service areas, and map results." },
  { "id": "saas",                    "slug": "saas",                    "name": "SaaS",                    "description": "Listing sites focused on subscription software products and their buyers." },
  { "id": "ai",                      "slug": "ai",                      "name": "AI",                      "description": "Catalogues of AI tools, models, and applied machine-learning products." },
  { "id": "telecommunications",      "slug": "telecommunications",      "name": "Telecommunications",      "description": "Directories covering carriers, connectivity providers, and telecom infrastructure vendors." },
  { "id": "healthcare",              "slug": "healthcare",              "name": "Healthcare",              "description": "Listings for clinical providers, health services, and medical technology suppliers." },
  { "id": "legal",                   "slug": "legal",                   "name": "Legal",                   "description": "Directories of law firms, individual practitioners, and legal service providers." },
  { "id": "finance",                 "slug": "finance",                 "name": "Finance",                 "description": "Listings covering financial institutions, advisers, fintech, and accounting services." },
  { "id": "construction",            "slug": "construction",            "name": "Construction",            "description": "Directories for contractors, trades, building suppliers, and project services." },
  { "id": "manufacturing",           "slug": "manufacturing",           "name": "Manufacturing",           "description": "Industrial and supplier directories covering producers, fabricators, and distributors." },
  { "id": "education",               "slug": "education",               "name": "Education",               "description": "Listings for institutions, training providers, and educational technology." },
  { "id": "marketing",               "slug": "marketing",               "name": "Marketing",               "description": "Agency and marketing-service directories, including advertising and creative suppliers." },
  { "id": "software",                "slug": "software",                "name": "Software",                "description": "General software catalogues spanning desktop, mobile, and web applications." },
  { "id": "developer",               "slug": "developer",               "name": "Developer",               "description": "Directories aimed at engineers: APIs, libraries, developer tools, and platforms." },
  { "id": "startup",                 "slug": "startup",                 "name": "Startup",                 "description": "Launch platforms and early-stage company listings used for initial visibility." },
  { "id": "government",              "slug": "government",              "name": "Government",              "description": "Official public-sector registries and government-operated business listings." },
  { "id": "industry-associations",   "slug": "industry-associations",   "name": "Industry Associations",   "description": "Member directories maintained by trade bodies and professional associations." },
  { "id": "chambers-of-commerce",    "slug": "chambers-of-commerce",    "name": "Chambers of Commerce",    "description": "Chamber membership registries, typically regional and membership-gated." },
  { "id": "review-sites",            "slug": "review-sites",            "name": "Review Sites",            "description": "Platforms whose primary function is collecting and publishing customer reviews." },
  { "id": "press-release-platforms", "slug": "press-release-platforms", "name": "Press Release Platforms", "description": "Distribution services that publish company announcements and newsroom content." },
  { "id": "app-directories",         "slug": "app-directories",         "name": "App Directories",         "description": "Storefronts and catalogues listing mobile, desktop, and platform applications." }
]
```

- [ ] **Step 7: Create the 10 empty directory files**

```bash
cd ~/PetroHrys.com
mkdir -p data/business-directories/directories
for c in united-states germany united-kingdom france spain italy canada australia czech-republic poland; do
  printf '[]\n' > "data/business-directories/directories/$c.json"
done
ls data/business-directories/directories | wc -l   # expect 10
```

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/bd-util.cjs scripts/tests/bd-util.test.cjs data/business-directories
git commit -m "feat(bd): add registry data and shared utilities"
```

---

### Task 2: Registry loader

**Files:**
- Create: `scripts/lib/bd-registry.cjs`
- Test: `scripts/tests/bd-registry.test.cjs`

**Interfaces:**
- Consumes: `bd-util.cjs` → `PATHS`
- Produces: `RegistryError` (Error subclass), `loadRegistry(dataRoot?): { countries, categories, directories }`, `getCountry(registry, slug)`, `getCategory(registry, slug)`, `directoriesFor(registry, countrySlug, categorySlug?): object[]`, `groupByCategory(registry, countrySlug): Map<string, object[]>`, `reservedSlugs(categories): Set<string>`, `isIndexable(entries): boolean`, `STRUCTURAL_RESERVED: string[]`

**Integrity contract — the loader fails loudly, with the offending file path in every message:**
- every declared country has exactly one `directories/<slug>.json`; a missing one is an error naming the expected path;
- an orphan `directories/*.json` whose country is not declared is an error;
- malformed JSON reports the exact source file;
- directory `id` is globally unique; `slug` is unique per country; canonical domain is unique **per country**;
- a record must reference a declared country and category, and must sit in the file matching its `country`;
- `null` is preserved exactly — never coerced to `0`, `''`, or `false`;
- iteration follows `countries.json` declaration order, never `readdir` order; any `readdir` result is sorted before use;
- slugs are validated against `^[a-z0-9]+(?:-[a-z0-9]+)*$` and every resolved path is asserted to stay inside the registry root, so a crafted slug cannot escape via `../`.

**Deliberate decision — domain uniqueness is per country, not global.** One directory service can legitimately be listed for several countries as separate records sharing a domain. Global rejection would block real data later.

**Deliberate overlap with Task 4.** The loader enforces on-disk structural integrity and fails fast; `validateRegistry` independently checks schema, honesty, and provenance on any registry object, including ones built in memory by tests. The small overlap on duplicates and references is defensive and intended.

- [ ] **Step 1: Write the failing test**

```js
// scripts/tests/bd-registry.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  loadRegistry, getCountry, getCategory, directoriesFor,
  groupByCategory, reservedSlugs, isIndexable, RegistryError,
} = require('../lib/bd-registry.cjs');
const { PATHS } = require('../lib/bd-util.cjs');

// Copies the real countries/categories into a temp root so integrity failures
// can be provoked without touching the repository.
function fixture(byCountry = {}, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bd-reg-'));
  fs.copyFileSync(path.join(PATHS.dataRoot, 'countries.json'), path.join(root, 'countries.json'));
  fs.copyFileSync(path.join(PATHS.dataRoot, 'categories.json'), path.join(root, 'categories.json'));
  fs.mkdirSync(path.join(root, 'directories'));
  const countries = JSON.parse(fs.readFileSync(path.join(root, 'countries.json'), 'utf8'));
  for (const country of countries) {
    if (options.omit === country.slug) continue;
    fs.writeFileSync(path.join(root, 'directories', `${country.slug}.json`),
      `${JSON.stringify(byCountry[country.slug] || [], null, 2)}\n`);
  }
  return root;
}

const record = (over = {}) => ({
  id: 'us-example', name: 'Example Directory', slug: 'example-directory',
  country: 'united-states', category: 'saas', website: 'https://example.com',
  description: 'A directory.', tier: 'tier1', petroHrysScore: null, domainRating: null,
  authorityScore: null, estimatedTraffic: null, referringDomains: null, free: null,
  paid: null, verificationRequired: null, manualReview: null, acceptsCompanies: null,
  acceptsProducts: null, acceptsSaaS: null, acceptsApps: null, acceptsStartups: null,
  acceptsAI: null, backlinkType: null, robots: null, sitemap: null, indexed: null,
  ssl: null, lastVerified: null, nextVerification: null, httpStatus: null,
  recommendedIndustries: [], pros: [], cons: [], editorNotes: '', metricsProvenance: {},
  ...over,
});

test('loads the current empty registry', () => {
  const registry = loadRegistry();
  assert.strictEqual(registry.countries.length, 10);
  assert.strictEqual(registry.categories.length, 21);
  assert.strictEqual(registry.directories.length, 0);
});

test('country and category ordering follows declaration order and is stable', () => {
  const a = loadRegistry();
  const b = loadRegistry();
  assert.deepStrictEqual(a.countries.map((c) => c.slug), b.countries.map((c) => c.slug));
  assert.deepStrictEqual(a.categories.map((c) => c.slug), b.categories.map((c) => c.slug));
  assert.strictEqual(a.countries[0].slug, 'united-states', 'declaration order must be preserved');
  assert.strictEqual(a.categories[0].slug, 'general-business');
});

test('directory ordering follows country declaration order, not readdir order', () => {
  const root = fixture({
    poland: [record({ id: 'pl-1', slug: 'pl-one', country: 'poland', website: 'https://pl.example' })],
    canada: [record({ id: 'ca-1', slug: 'ca-one', country: 'canada', website: 'https://ca.example' })],
  });
  const registry = loadRegistry(root);
  const order = registry.directories.map((d) => d.country);
  assert.deepStrictEqual(order, ['canada', 'poland'], 'canada is declared before poland');
});

test('a missing country file is an error naming the expected path', () => {
  const root = fixture({}, { omit: 'germany' });
  assert.throws(() => loadRegistry(root), (err) => {
    assert.ok(err instanceof RegistryError);
    assert.ok(err.message.includes('germany.json'), err.message);
    return true;
  });
});

test('an orphan directory file is rejected and named', () => {
  const root = fixture();
  fs.writeFileSync(path.join(root, 'directories', 'atlantis.json'), '[]\n');
  assert.throws(() => loadRegistry(root), (err) => {
    assert.ok(err.message.includes('atlantis'), err.message);
    assert.ok(/orphan/i.test(err.message), err.message);
    return true;
  });
});

test('malformed JSON reports the exact source file', () => {
  const root = fixture();
  const broken = path.join(root, 'directories', 'france.json');
  fs.writeFileSync(broken, '[{ oops');
  assert.throws(() => loadRegistry(root), (err) => {
    assert.ok(err.message.includes(broken), err.message);
    assert.ok(/malformed json/i.test(err.message), err.message);
    return true;
  });
});

test('a duplicate directory id is rejected', () => {
  const root = fixture({
    'united-states': [record(), record({ slug: 'other', website: 'https://other.example' })],
  });
  assert.throws(() => loadRegistry(root), /Duplicate directory id/i);
});

test('a duplicate slug within one country is rejected', () => {
  const root = fixture({
    'united-states': [record(), record({ id: 'us-two', website: 'https://other.example' })],
  });
  assert.throws(() => loadRegistry(root), /Duplicate directory slug/i);
});

test('a duplicate canonical domain within one country is rejected', () => {
  const root = fixture({
    'united-states': [record(), record({ id: 'us-two', slug: 'other', website: 'https://www.example.com/listings' })],
  });
  assert.throws(() => loadRegistry(root), /Duplicate canonical domain/i);
});

test('the same domain is allowed in two different countries', () => {
  const root = fixture({
    'united-states': [record()],
    germany: [record({ id: 'de-1', country: 'germany' })],
  });
  const registry = loadRegistry(root);
  assert.strictEqual(registry.directories.length, 2);
});

test('an undeclared category reference is rejected', () => {
  const root = fixture({ 'united-states': [record({ category: 'blockchain' })] });
  assert.throws(() => loadRegistry(root), /undeclared category "blockchain"/i);
});

test('an undeclared country reference is rejected', () => {
  const root = fixture({ 'united-states': [record({ country: 'atlantis' })] });
  assert.throws(() => loadRegistry(root), /undeclared country "atlantis"/i);
});

test('a record stored in the wrong country file is rejected', () => {
  const root = fixture({ 'united-states': [record({ country: 'germany' })] });
  assert.throws(() => loadRegistry(root), /stored in "united-states\.json"/i);
});

test('null metrics are preserved exactly and never coerced', () => {
  const root = fixture({ 'united-states': [record()] });
  const [entry] = loadRegistry(root).directories;
  for (const field of ['petroHrysScore', 'domainRating', 'authorityScore',
    'estimatedTraffic', 'referringDomains', 'httpStatus', 'lastVerified', 'free']) {
    assert.strictEqual(entry[field], null, `${field} must stay null`);
    assert.notStrictEqual(entry[field], 0, `${field} must not become 0`);
  }
  assert.ok(Object.hasOwn(entry, 'petroHrysScore'));
});

test('a traversal slug in countries.json is rejected', () => {
  const root = fixture();
  const countries = JSON.parse(fs.readFileSync(path.join(root, 'countries.json'), 'utf8'));
  countries[0].slug = '../../etc/passwd';
  fs.writeFileSync(path.join(root, 'countries.json'), JSON.stringify(countries, null, 2));
  assert.throws(() => loadRegistry(root), (err) => {
    assert.ok(/unsafe|malformed/i.test(err.message), err.message);
    return true;
  });
});

test('a traversal slug on a directory record is rejected', () => {
  const root = fixture({ 'united-states': [record({ slug: '../escape' })] });
  assert.throws(() => loadRegistry(root), /unsafe|malformed/i);
});

test('getCountry and getCategory look records up by slug', () => {
  const registry = loadRegistry();
  assert.strictEqual(getCountry(registry, 'germany').name, 'Germany');
  assert.strictEqual(getCategory(registry, 'saas').name, 'SaaS');
  assert.strictEqual(getCountry(registry, 'atlantis'), undefined);
});

test('groupByCategory returns every category in declaration order', () => {
  const root = fixture({ 'united-states': [record()] });
  const registry = loadRegistry(root);
  const grouped = groupByCategory(registry, 'united-states');
  assert.strictEqual(grouped.size, 21);
  assert.deepStrictEqual([...grouped.keys()], registry.categories.map((c) => c.slug));
  assert.strictEqual(grouped.get('saas').length, 1);
  assert.strictEqual(grouped.get('legal').length, 0);
});

test('directoriesFor filters by country and optionally category', () => {
  const root = fixture({ 'united-states': [record()] });
  const registry = loadRegistry(root);
  assert.strictEqual(directoriesFor(registry, 'united-states').length, 1);
  assert.strictEqual(directoriesFor(registry, 'united-states', 'saas').length, 1);
  assert.strictEqual(directoriesFor(registry, 'united-states', 'legal').length, 0);
  assert.strictEqual(directoriesFor(registry, 'germany').length, 0);
});

test('reservedSlugs contains every category slug plus structural words', () => {
  const reserved = reservedSlugs(loadRegistry().categories);
  assert.ok(reserved.has('saas'));
  assert.ok(reserved.has('app-directories'));
  assert.ok(reserved.has('categories'));
  assert.ok(reserved.has('page'));
});

test('isIndexable is false for an empty list and true for a populated one', () => {
  assert.strictEqual(isIndexable([]), false);
  assert.strictEqual(isIndexable([{ id: 'x' }]), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test "scripts/tests/bd-registry.test.cjs"`
Expected: FAIL — `Cannot find module '../lib/bd-registry.cjs'`

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/bd-registry.cjs
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { PATHS } = require('./bd-util.cjs');

const STRUCTURAL_RESERVED = ['categories', 'page', 'feed.xml', 'index'];
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

class RegistryError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RegistryError';
  }
}

function readJson(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (cause) {
    throw new RegistryError(`Cannot read registry file ${filePath}: ${cause.code || cause.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (cause) {
    throw new RegistryError(`Malformed JSON in ${filePath}: ${cause.message}`);
  }
}

function requireArray(value, filePath) {
  if (!Array.isArray(value)) throw new RegistryError(`${filePath} must contain a JSON array.`);
  return value;
}

// Defence in depth: registry slugs become path segments, so anything outside a
// strict kebab-case shape is refused before it can reach the filesystem.
function assertSafeSlug(slug, label, filePath) {
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) {
    throw new RegistryError(
      `Unsafe or malformed ${label} slug ${JSON.stringify(slug)} in ${filePath}. ` +
      'Slugs must be lowercase alphanumeric words separated by single hyphens.');
  }
}

function resolveInside(rootDir, ...segments) {
  const root = path.resolve(rootDir);
  const target = path.resolve(root, ...segments);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new RegistryError(`Refusing to read outside the registry root ${root}: ${target}`);
  }
  return target;
}

function canonicalDomain(website) {
  try {
    return new URL(website).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null; // shape of `website` is the validator's concern, not the loader's
  }
}

function assertUniqueSlugs(items, label, filePath) {
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.slug)) {
      throw new RegistryError(`Duplicate ${label} slug "${item.slug}" in ${filePath}.`);
    }
    seen.add(item.slug);
  }
}

function loadRegistry(dataRoot = PATHS.dataRoot) {
  const root = path.resolve(dataRoot);
  const countriesFile = resolveInside(root, 'countries.json');
  const categoriesFile = resolveInside(root, 'categories.json');

  const countries = requireArray(readJson(countriesFile), countriesFile);
  const categories = requireArray(readJson(categoriesFile), categoriesFile);

  for (const country of countries) assertSafeSlug(country.slug, 'country', countriesFile);
  for (const category of categories) assertSafeSlug(category.slug, 'category', categoriesFile);
  assertUniqueSlugs(countries, 'country', countriesFile);
  assertUniqueSlugs(categories, 'category', categoriesFile);

  const dirsRoot = resolveInside(root, 'directories');
  if (!fs.existsSync(dirsRoot)) {
    throw new RegistryError(`Missing directories folder: ${dirsRoot}`);
  }

  // Orphan detection. readdir order is not stable across platforms, so sort it.
  const declared = new Set(countries.map((c) => `${c.slug}.json`));
  const present = fs.readdirSync(dirsRoot).filter((f) => f.endsWith('.json')).sort();
  for (const file of present) {
    if (!declared.has(file)) {
      throw new RegistryError(
        `Orphan directory file ${path.join(dirsRoot, file)}: country ` +
        `"${file.replace(/\.json$/, '')}" is not declared in ${countriesFile}.`);
    }
  }

  const countrySlugs = new Set(countries.map((c) => c.slug));
  const categorySlugs = new Set(categories.map((c) => c.slug));

  const directories = [];
  const seenId = new Map();
  const seenSlug = new Map();
  const seenDomain = new Map();

  // Iterate declaration order, never readdir order, so output is deterministic.
  for (const country of countries) {
    const file = resolveInside(dirsRoot, `${country.slug}.json`);
    if (!fs.existsSync(file)) {
      throw new RegistryError(
        `Missing directories file for declared country "${country.slug}": ${file}. ` +
        'Create it containing [].');
    }

    for (const entry of requireArray(readJson(file), file)) {
      const label = entry && entry.id ? entry.id : JSON.stringify(entry && entry.slug);
      assertSafeSlug(entry.slug, 'directory', file);

      if (!countrySlugs.has(entry.country)) {
        throw new RegistryError(
          `Directory "${label}" in ${file} references undeclared country "${entry.country}".`);
      }
      if (entry.country !== country.slug) {
        throw new RegistryError(
          `Directory "${label}" declares country "${entry.country}" but is stored in ` +
          `"${country.slug}.json" (${file}).`);
      }
      if (!categorySlugs.has(entry.category)) {
        throw new RegistryError(
          `Directory "${label}" in ${file} references undeclared category "${entry.category}".`);
      }

      if (seenId.has(entry.id)) {
        throw new RegistryError(
          `Duplicate directory id "${entry.id}" in ${file}; first seen in ${seenId.get(entry.id)}.`);
      }
      seenId.set(entry.id, file);

      const slugKey = `${entry.country}/${entry.slug}`;
      if (seenSlug.has(slugKey)) {
        throw new RegistryError(
          `Duplicate directory slug "${entry.slug}" for country "${entry.country}" in ${file}.`);
      }
      seenSlug.set(slugKey, file);

      // Per country, not global: one service may legitimately be listed for
      // several countries as separate records sharing a domain.
      const domain = canonicalDomain(entry.website);
      if (domain) {
        const domainKey = `${entry.country}/${domain}`;
        if (seenDomain.has(domainKey)) {
          throw new RegistryError(
            `Duplicate canonical domain "${domain}" for country "${entry.country}" in ${file}; ` +
            `first seen in ${seenDomain.get(domainKey)}.`);
        }
        seenDomain.set(domainKey, file);
      }

      directories.push(entry); // stored verbatim — nulls preserved, nothing normalised
    }
  }

  return { countries, categories, directories };
}

function getCountry(registry, slug) {
  return registry.countries.find((c) => c.slug === slug);
}

function getCategory(registry, slug) {
  return registry.categories.find((c) => c.slug === slug);
}

function directoriesFor(registry, countrySlug, categorySlug) {
  return registry.directories.filter(
    (d) => d.country === countrySlug && (categorySlug === undefined || d.category === categorySlug),
  );
}

function groupByCategory(registry, countrySlug) {
  const grouped = new Map();
  for (const category of registry.categories) {
    grouped.set(category.slug, directoriesFor(registry, countrySlug, category.slug));
  }
  return grouped;
}

function reservedSlugs(categories) {
  const reserved = new Set(STRUCTURAL_RESERVED);
  for (const category of categories) reserved.add(category.slug);
  return reserved;
}

function isIndexable(entries) {
  return entries.length > 0;
}

module.exports = {
  RegistryError, loadRegistry, getCountry, getCategory, directoriesFor,
  groupByCategory, reservedSlugs, isIndexable, STRUCTURAL_RESERVED,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test "scripts/tests/bd-registry.test.cjs"`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/bd-registry.cjs scripts/tests/bd-registry.test.cjs
git commit -m "feat(bd): add registry loader"
```

---

### Task 3: Sorting

**Files:**
- Create: `scripts/lib/bd-sort.cjs`
- Test: `scripts/tests/bd-sort.test.cjs`

**Interfaces:**
- Produces: `SORTS: Record<string, {key, label, compare}>`, `SORT_KEYS: string[]`, `sortDirectories(list, key?): readonly object[]`, `compareByName(a, b): number`

**Ordering contract:**
- **No locale-dependent comparison.** `localeCompare` is banned — its result depends on the platform's ICU version, so two machines could order identical data differently. Names compare via `toLowerCase()` (Unicode default case folding, which is *not* locale-sensitive) with a UTF-16 code-unit tiebreak, giving a total, platform-stable order.
- **Stability is explicit, not inherited.** Ties break on original index rather than relying on the engine's stable-sort guarantee, so equal-key records always keep input order.
- **Nulls last** in every sort, regardless of direction.
- **No mutation.** The input array is never reordered and element objects are never touched. The returned array is frozen; its **elements are deliberately not frozen**, because freezing them would mutate the caller's registry objects.

- [ ] **Step 1: Write the failing test**

```js
// scripts/tests/bd-sort.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { SORTS, SORT_KEYS, sortDirectories, compareByName } = require('../lib/bd-sort.cjs');

const make = (name, over = {}) => ({
  name, petroHrysScore: null, domainRating: null, authorityScore: null,
  estimatedTraffic: null, ...over,
});

test('exposes exactly the five specified sort keys', () => {
  assert.deepStrictEqual(SORT_KEYS,
    ['default', 'domain-rating', 'authority-score', 'traffic', 'alphabetical']);
});

test('default sort orders by PetroHrys Score descending', () => {
  const out = sortDirectories([make('A', { petroHrysScore: 40 }), make('B', { petroHrysScore: 90 })]);
  assert.deepStrictEqual(out.map((d) => d.name), ['B', 'A']);
});

test('identical scores fall through to domainRating descending', () => {
  const out = sortDirectories([
    make('C', { petroHrysScore: 50, domainRating: 10 }),
    make('A', { petroHrysScore: 50, domainRating: 80 }),
  ]);
  assert.deepStrictEqual(out.map((d) => d.name), ['A', 'C']);
});

test('identical score and domainRating fall through to name ascending', () => {
  const out = sortDirectories([
    make('Charlie', { petroHrysScore: 50, domainRating: 80 }),
    make('Alpha', { petroHrysScore: 50, domainRating: 80 }),
    make('Bravo', { petroHrysScore: 50, domainRating: 80 }),
  ]);
  assert.deepStrictEqual(out.map((d) => d.name), ['Alpha', 'Bravo', 'Charlie']);
});

test('null metrics always sort last', () => {
  const out = sortDirectories([make('A'), make('B', { petroHrysScore: 1 })]);
  assert.deepStrictEqual(out.map((d) => d.name), ['B', 'A']);
});

test('nulls sort last in every one of the metric sorts', () => {
  for (const key of ['default', 'domain-rating', 'authority-score', 'traffic']) {
    const field = { 'default': 'petroHrysScore', 'domain-rating': 'domainRating',
      'authority-score': 'authorityScore', 'traffic': 'estimatedTraffic' }[key];
    const out = sortDirectories([make('Null'), make('Real', { [field]: 5 })], key);
    assert.deepStrictEqual(out.map((d) => d.name), ['Real', 'Null'], `sort ${key}`);
  }
});

test('an all-null list falls back to name order', () => {
  const out = sortDirectories([make('Zeta'), make('Alpha'), make('Mike')]);
  assert.deepStrictEqual(out.map((d) => d.name), ['Alpha', 'Mike', 'Zeta']);
});

test('mixed-case names order case-insensitively then by code unit', () => {
  const out = sortDirectories([make('beta'), make('Alpha'), make('alpha'), make('Beta')], 'alphabetical');
  // 'alpha' pair before 'beta' pair; within each pair uppercase first by code unit.
  assert.deepStrictEqual(out.map((d) => d.name), ['Alpha', 'alpha', 'Beta', 'beta']);
});

test('name ordering is not locale-dependent', () => {
  // Under an ICU 'en' collation localeCompare puts lowercase first, so this
  // ordering fails if localeCompare is ever reintroduced.
  assert.ok(compareByName({ name: 'Alpha' }, { name: 'alpha' }) < 0);
  assert.strictEqual(compareByName({ name: 'same' }, { name: 'same' }), 0);
});

test('the implementation never calls localeCompare', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'lib', 'bd-sort.cjs'), 'utf8');
  // Strip comments before scanning, so the rationale is free to name the banned
  // API while the guard still catches a real call. The `[^:]` guard keeps `//`
  // inside a URL from being treated as a line comment.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  assert.ok(!/\.localeCompare\s*\(/.test(code), 'localeCompare is platform-dependent and banned');
  assert.ok(!/toLocale(Lower|Upper)Case\s*\(/.test(code), 'toLocale*Case is locale-sensitive and banned');
});

test('sorting is stable for fully tied records', () => {
  const input = [make('Same'), make('Same'), make('Same')];
  input.forEach((d, i) => { d.marker = i; });
  const out = sortDirectories(input);
  assert.deepStrictEqual(out.map((d) => d.marker), [0, 1, 2]);
});

test('repeated runs on the same input give identical output', () => {
  const input = [
    make('Delta', { petroHrysScore: 10 }), make('Alpha'), make('Bravo', { petroHrysScore: 10 }),
    make('Charlie', { domainRating: 3 }), make('echo', { petroHrysScore: 10, domainRating: 1 }),
  ];
  const runs = Array.from({ length: 25 }, () => sortDirectories(input).map((d) => d.name).join(','));
  assert.strictEqual(new Set(runs).size, 1, 'output must not vary between runs');
});

test('an empty array returns an empty frozen array', () => {
  const out = sortDirectories([]);
  assert.deepStrictEqual([...out], []);
  assert.ok(Object.isFrozen(out));
});

test('a single-element array is returned unchanged', () => {
  const only = make('Solo', { petroHrysScore: 7 });
  const out = sortDirectories([only]);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0], only);
});

test('sortDirectories does not mutate its input array', () => {
  const input = [make('B', { petroHrysScore: 1 }), make('A', { petroHrysScore: 9 })];
  sortDirectories(input);
  assert.deepStrictEqual(input.map((d) => d.name), ['B', 'A']);
});

test('sortDirectories does not freeze or modify the element objects', () => {
  const input = [make('B', { petroHrysScore: 1 }), make('A', { petroHrysScore: 9 })];
  const out = sortDirectories(input);
  assert.ok(!Object.isFrozen(out[0]), 'elements must stay mutable — they are the caller\'s objects');
  assert.strictEqual(out[0].petroHrysScore, 9);
  out[0].petroHrysScore = 11; // proves the element was not frozen
  assert.strictEqual(input[1].petroHrysScore, 11);
});

test('the returned array is frozen', () => {
  const out = sortDirectories([make('A'), make('B')]);
  assert.ok(Object.isFrozen(out));
  assert.throws(() => { out.push(make('C')); }, TypeError);
});

test('alphabetical sort ignores metrics entirely', () => {
  const out = sortDirectories(
    [make('Zeta', { petroHrysScore: 99 }), make('Alpha', { petroHrysScore: 1 })], 'alphabetical');
  assert.deepStrictEqual(out.map((d) => d.name), ['Alpha', 'Zeta']);
});

test('an unknown sort key falls back to the default comparator', () => {
  const out = sortDirectories([make('A', { petroHrysScore: 1 }), make('B', { petroHrysScore: 9 })], 'nope');
  assert.deepStrictEqual(out.map((d) => d.name), ['B', 'A']);
});

test('every sort exposes a human label', () => {
  for (const key of SORT_KEYS) {
    assert.strictEqual(typeof SORTS[key].label, 'string');
    assert.ok(SORTS[key].label.length > 0);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test "scripts/tests/bd-sort.test.cjs"`
Expected: FAIL — `Cannot find module '../lib/bd-sort.cjs'`

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/bd-sort.cjs
'use strict';

function nullLastDesc(a, b) {
  const aNull = a === null || a === undefined;
  const bNull = b === null || b === undefined;
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;
  return b - a;
}

// Deliberately avoids localeCompare: its ordering depends on the platform's ICU
// build, so identical data could sort differently on two machines. toLowerCase()
// uses Unicode default case folding and is not locale-sensitive; the code-unit
// tiebreak then makes the order total.
function compareByName(a, b) {
  const an = String(a.name ?? '');
  const bn = String(b.name ?? '');
  const af = an.toLowerCase();
  const bf = bn.toLowerCase();
  if (af < bf) return -1;
  if (af > bf) return 1;
  if (an < bn) return -1;
  if (an > bn) return 1;
  return 0;
}

const SORTS = {
  default: {
    key: 'default',
    label: 'PetroHrys Score',
    compare: (a, b) =>
      nullLastDesc(a.petroHrysScore, b.petroHrysScore) ||
      nullLastDesc(a.domainRating, b.domainRating) ||
      compareByName(a, b),
  },
  'domain-rating': {
    key: 'domain-rating',
    label: 'Domain Rating',
    compare: (a, b) => nullLastDesc(a.domainRating, b.domainRating) || compareByName(a, b),
  },
  'authority-score': {
    key: 'authority-score',
    label: 'Authority Score',
    compare: (a, b) => nullLastDesc(a.authorityScore, b.authorityScore) || compareByName(a, b),
  },
  traffic: {
    key: 'traffic',
    label: 'Estimated Traffic',
    compare: (a, b) => nullLastDesc(a.estimatedTraffic, b.estimatedTraffic) || compareByName(a, b),
  },
  alphabetical: { key: 'alphabetical', label: 'Alphabetical', compare: compareByName },
};

const SORT_KEYS = ['default', 'domain-rating', 'authority-score', 'traffic', 'alphabetical'];

// Stability is guaranteed here by the explicit index tiebreak rather than by
// relying on the engine's sort being stable.
function sortDirectories(list, key = 'default') {
  const compare = (SORTS[key] || SORTS.default).compare;
  const decorated = Array.from(list, (item, index) => ({ item, index }));
  decorated.sort((a, b) => compare(a.item, b.item) || (a.index - b.index));
  // Freeze the array only. Freezing elements would mutate the caller's records.
  return Object.freeze(decorated.map(({ item }) => item));
}

module.exports = { SORTS, SORT_KEYS, sortDirectories, compareByName };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test "scripts/tests/bd-sort.test.cjs"`
Expected: PASS, 20 tests

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/bd-sort.cjs scripts/tests/bd-sort.test.cjs
git commit -m "feat(bd): add deterministic sorting with null-last ordering"
```

---

### Task 4: Validator

**Files:**
- Create: `scripts/validate-business-directories.cjs`
- Test: `scripts/tests/bd-validate.test.cjs`

**Interfaces:**
- Consumes: `bd-registry.cjs` → `loadRegistry`, `reservedSlugs`
- Produces: `validateRegistry(registry): { ok: boolean, errors: ValidationError[] }` where `ValidationError = { file: string, id: string|null, field: string, reason: string }`. Also exports `formatReport(result): string`.
- CLI: `node scripts/validate-business-directories.cjs` prints a human-readable report and exits 1 when `ok` is false; `--json` prints the raw result object instead.

**Validation contract:**
- **Collect, never fail fast.** Every problem in the registry is reported in one pass, so a single run surfaces all of them.
- **Deterministic ordering.** Errors sort by `file`, then `id`, then `field`, then `reason`, using code-unit comparison — never `localeCompare`, never filesystem traversal order. Shuffling the input records must not change the reported order.
- **Every error carries `file`, `id`, `field`, `reason`.** `id` is `null` only when the record has no usable id.
- **`file` is derived, not stored.** Computed from the record's `country` as `data/business-directories/directories/<country>.json`, so the validator works on in-memory registries that never touched disk, without the loader annotating records.
- **Never mutates.** The registry object and every record are left untouched; a test deep-compares before and after.
- **Single source of truth for build gating.** Task 10 and every future build must refuse to run when `ok` is false.
- **Cross-country duplicate domains are legal.** Consistent with the loader: one service may serve several countries as separate records. Only same-country duplicates are errors.

- [ ] **Step 1: Write the failing test**

```js
// scripts/tests/bd-validate.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { validateRegistry, formatReport } = require('../validate-business-directories.cjs');
const { loadRegistry } = require('../lib/bd-registry.cjs');

const base = {
  id: 'us-example', name: 'Example', slug: 'example', country: 'united-states',
  category: 'saas', website: 'https://example.com', description: 'A directory.',
  tier: 'tier1', petroHrysScore: null, domainRating: null, authorityScore: null,
  estimatedTraffic: null, referringDomains: null, free: null, paid: null,
  verificationRequired: null, manualReview: null, acceptsCompanies: null,
  acceptsProducts: null, acceptsSaaS: null, acceptsApps: null, acceptsStartups: null,
  acceptsAI: null, backlinkType: null, robots: null, sitemap: null, indexed: null,
  ssl: null, lastVerified: null, nextVerification: null, httpStatus: null,
  recommendedIndustries: [], pros: [], cons: [], editorNotes: '', metricsProvenance: {},
};

const withDirs = (dirs) => ({ ...loadRegistry(), directories: dirs });
const reasons = (result) => result.errors.map((e) => e.reason);
const fields = (result) => result.errors.map((e) => e.field);

test('the shipped empty registry is valid', () => {
  const result = validateRegistry(loadRegistry());
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.errors, []);
});

test('an entirely empty registry object is valid', () => {
  const result = validateRegistry({ countries: [], categories: [], directories: [] });
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.errors, []);
});

test('a registry with exactly one valid directory is valid', () => {
  const result = validateRegistry(withDirs([base]));
  assert.deepStrictEqual(result.errors, []);
  assert.strictEqual(result.ok, true);
});

test('the result is machine-readable with the documented shape', () => {
  const result = validateRegistry(withDirs([{ ...base, website: 'http://example.com' }]));
  assert.strictEqual(typeof result.ok, 'boolean');
  assert.ok(Array.isArray(result.errors));
  for (const error of result.errors) {
    assert.deepStrictEqual(Object.keys(error).sort(), ['field', 'file', 'id', 'reason']);
    assert.strictEqual(typeof error.file, 'string');
    assert.strictEqual(typeof error.field, 'string');
    assert.strictEqual(typeof error.reason, 'string');
  }
  assert.ok(JSON.parse(JSON.stringify(result)), 'must survive a JSON round trip');
});

test('the derived file path points at the country registry file', () => {
  const result = validateRegistry(withDirs([{ ...base, website: 'http://example.com' }]));
  assert.strictEqual(result.errors[0].file,
    'data/business-directories/directories/united-states.json');
  assert.strictEqual(result.errors[0].id, 'us-example');
});

test('multiple simultaneous errors are all collected, not just the first', () => {
  const result = validateRegistry(withDirs([{
    ...base, website: 'http://example.com', tier: 'platinum', category: 'blockchain',
  }]));
  assert.ok(result.errors.length >= 3, `expected 3+, got ${result.errors.length}`);
  assert.ok(fields(result).includes('website'));
  assert.ok(fields(result).includes('tier'));
  assert.ok(fields(result).includes('category'));
});

test('error ordering is identical across repeated runs', () => {
  const registry = withDirs([
    { ...base, id: 'b', slug: 'b', website: 'http://b.example', tier: 'nope' },
    { ...base, id: 'a', slug: 'a', website: 'http://a.example', category: 'nope' },
  ]);
  const runs = Array.from({ length: 25 },
    () => JSON.stringify(validateRegistry(registry).errors));
  assert.strictEqual(new Set(runs).size, 1);
});

test('error ordering does not depend on record input order', () => {
  const a = { ...base, id: 'a', slug: 'a', website: 'http://a.example' };
  const b = { ...base, id: 'b', slug: 'b', website: 'http://b.example' };
  const forward = JSON.stringify(validateRegistry(withDirs([a, b])).errors);
  const reverse = JSON.stringify(validateRegistry(withDirs([b, a])).errors);
  assert.strictEqual(forward, reverse);
});

test('errors are sorted by file, id, field, reason', () => {
  const result = validateRegistry(withDirs([
    { ...base, id: 'zz', slug: 'zz', website: 'http://z.example' },
    { ...base, id: 'aa', slug: 'aa', website: 'http://a.example' },
  ]));
  const ids = result.errors.map((e) => e.id);
  assert.deepStrictEqual(ids, [...ids].sort());
});

test('validateRegistry never mutates the registry or its records', () => {
  const registry = withDirs([{ ...base, website: 'http://example.com', tier: 'bad' }]);
  const snapshot = JSON.stringify(registry);
  validateRegistry(registry);
  assert.strictEqual(JSON.stringify(registry), snapshot);
});

test('rejects a duplicate id', () => {
  const result = validateRegistry(withDirs([base, { ...base, slug: 'other' }]));
  assert.ok(reasons(result).some((r) => /duplicate id/i.test(r)));
});

test('rejects a duplicate slug within one country', () => {
  const result = validateRegistry(withDirs([base, { ...base, id: 'us-two' }]));
  assert.ok(reasons(result).some((r) => /duplicate slug/i.test(r)));
});

test('rejects a duplicate canonical domain within one country', () => {
  const result = validateRegistry(withDirs([
    base, { ...base, id: 'us-two', slug: 'other', website: 'https://www.example.com/list' },
  ]));
  assert.ok(reasons(result).some((r) => /duplicate canonical domain/i.test(r)));
});

test('accepts the same canonical domain in two different countries', () => {
  const result = validateRegistry(withDirs([
    base, { ...base, id: 'de-one', country: 'germany' },
  ]));
  assert.deepStrictEqual(result.errors, []);
  assert.strictEqual(result.ok, true);
});

test('rejects a slug that collides with a category', () => {
  const result = validateRegistry(withDirs([{ ...base, slug: 'saas' }]));
  assert.ok(reasons(result).some((r) => /reserved/i.test(r)));
});

test('rejects unknown country and category references', () => {
  const country = validateRegistry(withDirs([{ ...base, country: 'atlantis' }]));
  assert.ok(reasons(country).some((r) => /unknown country/i.test(r)));
  const category = validateRegistry(withDirs([{ ...base, category: 'blockchain' }]));
  assert.ok(reasons(category).some((r) => /unknown category/i.test(r)));
});

test('rejects a non-https website', () => {
  const result = validateRegistry(withDirs([{ ...base, website: 'http://example.com' }]));
  assert.ok(reasons(result).some((r) => /https/i.test(r)));
});

test('rejects a score outside 0-100', () => {
  const result = validateRegistry(withDirs([
    { ...base, petroHrysScore: 140, lastVerified: '2026-08-01' },
  ]));
  assert.ok(reasons(result).some((r) => /out of range/i.test(r)));
});

test('rejects an invalid enum value', () => {
  const result = validateRegistry(withDirs([{ ...base, tier: 'platinum' }]));
  assert.ok(reasons(result).some((r) => /invalid value/i.test(r)));
});

test('honesty gate rejects a metric on an unverified record', () => {
  const result = validateRegistry(withDirs([{ ...base, petroHrysScore: 80 }]));
  assert.ok(reasons(result).some((r) => /lastVerified is null/i.test(r)));
});

test('rejects a third-party metric without provenance', () => {
  const result = validateRegistry(withDirs([
    { ...base, lastVerified: '2026-08-01', domainRating: 70 },
  ]));
  assert.ok(reasons(result).some((r) => /provenance/i.test(r)));
});

test('accepts a third-party metric with full provenance', () => {
  const result = validateRegistry(withDirs([{
    ...base, lastVerified: '2026-08-01', domainRating: 70,
    metricsProvenance: { domainRating: { provider: 'Ahrefs', measuredAt: '2026-08-01' } },
  }]));
  assert.deepStrictEqual(result.errors, []);
});

test('rejects nextVerification on or before lastVerified', () => {
  const result = validateRegistry(withDirs([
    { ...base, lastVerified: '2026-08-01', nextVerification: '2026-08-01' },
  ]));
  assert.ok(reasons(result).some((r) => /nextVerification/i.test(r)));
});

test('rejects malformed optional values', () => {
  const result = validateRegistry(withDirs([{
    ...base, recommendedIndustries: 'legal', pros: [1, 2], cons: null,
    editorNotes: 42, ssl: 'yes', httpStatus: '200',
  }]));
  const bad = fields(result);
  for (const field of ['recommendedIndustries', 'pros', 'cons', 'editorNotes', 'ssl', 'httpStatus']) {
    assert.ok(bad.includes(field), `expected an error for ${field}, got ${bad.join(', ')}`);
  }
});

test('a record with no id still produces a reportable error', () => {
  const { id, ...noId } = base;
  const result = validateRegistry(withDirs([{ ...noId, website: 'http://x.example' }]));
  assert.ok(result.errors.length > 0);
  assert.ok(result.errors.every((e) => typeof e.file === 'string'));
});

test('formatReport renders a human-readable report', () => {
  const result = validateRegistry(withDirs([{ ...base, website: 'http://example.com' }]));
  const report = formatReport(result);
  assert.ok(report.includes('united-states.json'));
  assert.ok(report.includes('website'));
  assert.ok(/1 validation error/.test(report));
});

test('formatReport reports success for a valid registry', () => {
  assert.ok(/valid/i.test(formatReport(validateRegistry(loadRegistry()))));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test "scripts/tests/bd-validate.test.cjs"`
Expected: FAIL — `Cannot find module '../validate-business-directories.cjs'`

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/validate-business-directories.cjs
'use strict';
const { loadRegistry, reservedSlugs } = require('./lib/bd-registry.cjs');

const ENUMS = {
  tier: ['tier1', 'tier2', 'tier3'],
  backlinkType: ['dofollow', 'nofollow', 'sponsored', 'ugc', 'mixed', 'none'],
  robots: ['allowed', 'disallowed', 'partial', 'unknown'],
};

const SCORE_FIELDS = ['petroHrysScore', 'domainRating', 'authorityScore'];
const COUNT_FIELDS = ['estimatedTraffic', 'referringDomains', 'httpStatus'];
const NUMERIC_FIELDS = [...SCORE_FIELDS, ...COUNT_FIELDS];
const THIRD_PARTY_FIELDS = ['domainRating', 'authorityScore', 'estimatedTraffic', 'referringDomains'];
const BOOLEAN_FIELDS = [
  'free', 'paid', 'verificationRequired', 'manualReview', 'acceptsCompanies',
  'acceptsProducts', 'acceptsSaaS', 'acceptsApps', 'acceptsStartups', 'acceptsAI',
  'sitemap', 'indexed', 'ssl',
];
const REQUIRED_STRINGS = ['id', 'name', 'slug', 'country', 'category', 'website', 'description'];
const ARRAY_FIELDS = ['recommendedIndustries', 'pros', 'cons'];
const DATE_FIELDS = ['lastVerified', 'nextVerification'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const isNullish = (v) => v === null || v === undefined;

// Code-unit comparison; localeCompare would make ordering depend on the
// platform's ICU build.
function cmp(a, b) {
  const as = String(a ?? '');
  const bs = String(b ?? '');
  if (as < bs) return -1;
  if (as > bs) return 1;
  return 0;
}

function fileFor(entry) {
  const country = typeof entry.country === 'string' && entry.country ? entry.country : '<unknown>';
  return `data/business-directories/directories/${country}.json`;
}

function canonicalDomain(website) {
  try {
    return new URL(website).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

function validateRegistry(registry) {
  const errors = [];
  const countries = registry.countries || [];
  const categories = registry.categories || [];
  const directories = registry.directories || [];

  const countrySlugs = new Set(countries.map((c) => c.slug));
  const categorySlugs = new Set(categories.map((c) => c.slug));
  const reserved = reservedSlugs(categories);

  const seenId = new Set();
  const seenSlug = new Set();
  const seenDomain = new Set();

  for (const entry of directories) {
    const file = fileFor(entry);
    const id = typeof entry.id === 'string' && entry.id ? entry.id : null;
    const add = (field, reason) => errors.push({ file, id, field, reason });

    for (const field of REQUIRED_STRINGS) {
      if (typeof entry[field] !== 'string' || entry[field].length === 0) {
        add(field, `Required field "${field}" must be a non-empty string.`);
      }
    }

    if (typeof entry.website === 'string' && !entry.website.startsWith('https://')) {
      add('website', 'Website must use https.');
    }

    if (typeof entry.slug === 'string' && reserved.has(entry.slug)) {
      add('slug', `Slug "${entry.slug}" is a reserved slug and cannot be used.`);
    }

    if (typeof entry.country === 'string' && !countrySlugs.has(entry.country)) {
      add('country', `References unknown country "${entry.country}".`);
    }
    if (typeof entry.category === 'string' && !categorySlugs.has(entry.category)) {
      add('category', `References unknown category "${entry.category}".`);
    }

    for (const [field, allowed] of Object.entries(ENUMS)) {
      if (!isNullish(entry[field]) && !allowed.includes(entry[field])) {
        add(field, `Field "${field}" has invalid value "${entry[field]}". Allowed: ${allowed.join(', ')}.`);
      }
    }

    for (const field of NUMERIC_FIELDS) {
      const value = entry[field];
      if (isNullish(value)) continue;
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        add(field, `Field "${field}" must be a finite number or null, got ${JSON.stringify(value)}.`);
      } else if (SCORE_FIELDS.includes(field) && (value < 0 || value > 100)) {
        add(field, `Field "${field}" is out of range 0-100: ${value}.`);
      } else if (COUNT_FIELDS.includes(field) && value < 0) {
        add(field, `Field "${field}" must not be negative: ${value}.`);
      }
    }

    for (const field of BOOLEAN_FIELDS) {
      if (!isNullish(entry[field]) && typeof entry[field] !== 'boolean') {
        add(field, `Field "${field}" must be a boolean or null, got ${JSON.stringify(entry[field])}.`);
      }
    }

    for (const field of ARRAY_FIELDS) {
      const value = entry[field];
      if (!Array.isArray(value)) {
        add(field, `Field "${field}" must be an array of strings.`);
      } else if (!value.every((item) => typeof item === 'string')) {
        add(field, `Field "${field}" must contain only strings.`);
      }
    }

    if (!isNullish(entry.editorNotes) && typeof entry.editorNotes !== 'string') {
      add('editorNotes', 'Field "editorNotes" must be a string.');
    }

    for (const field of DATE_FIELDS) {
      if (!isNullish(entry[field]) && !DATE_RE.test(entry[field])) {
        add(field, `Field "${field}" must be an ISO date (YYYY-MM-DD).`);
      }
    }

    // Honesty gate: an unverified record may not carry measurements.
    if (isNullish(entry.lastVerified)) {
      for (const field of NUMERIC_FIELDS) {
        if (!isNullish(entry[field])) {
          add(field, `Field "${field}" is populated but lastVerified is null.`);
        }
      }
    }

    for (const field of THIRD_PARTY_FIELDS) {
      if (isNullish(entry[field])) continue;
      const provenance = (entry.metricsProvenance || {})[field];
      if (!provenance || !provenance.provider || !provenance.measuredAt) {
        add(field, `Third-party metric "${field}" requires provenance (provider and measuredAt).`);
      } else if (!DATE_RE.test(provenance.measuredAt)) {
        add(field, `Provenance measuredAt for "${field}" must be an ISO date (YYYY-MM-DD).`);
      }
    }

    if (entry.lastVerified && entry.nextVerification
        && !(entry.nextVerification > entry.lastVerified)) {
      add('nextVerification', 'nextVerification must be later than lastVerified.');
    }

    if (id !== null) {
      if (seenId.has(id)) add('id', `Duplicate id "${id}".`);
      seenId.add(id);
    }

    if (typeof entry.country === 'string' && typeof entry.slug === 'string') {
      const slugKey = `${entry.country}/${entry.slug}`;
      if (seenSlug.has(slugKey)) {
        add('slug', `Duplicate slug "${entry.slug}" within country "${entry.country}".`);
      }
      seenSlug.add(slugKey);

      // Per country only: one service may legitimately serve several countries.
      const domain = canonicalDomain(entry.website);
      if (domain) {
        const domainKey = `${entry.country}/${domain}`;
        if (seenDomain.has(domainKey)) {
          add('website', `Duplicate canonical domain "${domain}" within country "${entry.country}".`);
        }
        seenDomain.add(domainKey);
      }
    }
  }

  errors.sort((a, b) => cmp(a.file, b.file) || cmp(a.id, b.id)
    || cmp(a.field, b.field) || cmp(a.reason, b.reason));

  return { ok: errors.length === 0, errors };
}

function formatReport(result) {
  if (result.ok) return 'Business directories registry is valid.';
  const lines = result.errors.map(
    (e) => `  ${e.file} [${e.id ?? '(no id)'}] ${e.field}: ${e.reason}`);
  const count = result.errors.length;
  return `${lines.join('\n')}\n\n${count} validation error${count === 1 ? '' : 's'}.`;
}

if (require.main === module) {
  const result = validateRegistry(loadRegistry());
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatReport(result));
  }
  if (!result.ok) process.exit(1);
}

module.exports = { validateRegistry, formatReport };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test "scripts/tests/bd-validate.test.cjs" && node scripts/validate-business-directories.cjs`
Expected: PASS (27 tests), then `Business directories registry is valid.` and exit 0

- [ ] **Step 5: Commit**

```bash
git add scripts/validate-business-directories.cjs scripts/tests/bd-validate.test.cjs
git commit -m "feat(bd): add machine-readable registry validator"
```

---

### Task 5: SEO module

**Files:**
- Create: `scripts/lib/bd-seo.cjs`
- Test: `scripts/tests/bd-seo.test.cjs`

**Interfaces:**
- Consumes: nothing (pure module)
- Produces: `ORIGIN`, `SeoError`, `absoluteUrl(path)`, `safeExternalUrl(value)`, `renderJsonLd(graph)`, primitives `breadcrumbList`, `collectionPage`, `webPage`, `itemList`, `faqPage`, `organisationAbout`, and the four page builders `buildHubMeta`, `buildCountryMeta`, `buildCategoryMeta`, `buildDirectoryMeta`.

**Builder result shape** (identical keys for all four page types, so `bd-render` consumes one contract):

```
{ title, fullTitle, description, canonicalPath, canonical, robots,
  openGraph: { title, description, url, type, siteName, image },
  twitter:   { card, site, title, description, image },
  breadcrumbTrail: [{ name, path }],
  jsonLd: [ ...ordered graph nodes ] }
```

**SEO contract:**
- **Canonical host is hard-coded.** `ORIGIN` is a module constant; no environment variable, no hostname detection. Apex URLs can never be produced.
- **Path hygiene.** `absoluteUrl` strips query strings and fragments, collapses duplicate slashes, forces a leading slash, rejects `..` segments, and rejects any absolute URL whose origin is not `ORIGIN`.
- **`itemList` returns `null` when empty**, and builders drop nulls from the graph, so an `ItemList` is *omitted* rather than emitted with zero entries.
- **`FAQPage` only when the caller supplies approved FAQ content.** The module never invents questions.
- **Banned types:** `AggregateRating`, `Review`, `Product`, `SearchAction`. The PetroHrys Score is first-party editorial and must never be dressed as review markup; there is no site search endpoint, so `SearchAction` would be a false claim.
- **Descriptions carry no counts or metrics.** They describe the page's purpose only, so they stay true whatever the data holds.
- **Deterministic.** Fixed key insertion order, no timestamps, no random ids. Identical input yields byte-identical output.
- **Serialisation safety.** `renderJsonLd` escapes `<`, `>`, and U+2028/U+2029, making `</script>` breakout impossible while preserving all other Unicode.

- [ ] **Step 1: Write the failing test**

```js
// scripts/tests/bd-seo.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const seo = require('../lib/bd-seo.cjs');

const COUNTRY = { slug: 'united-states', name: 'United States', titleName: 'the United States' };
const CATEGORY = { slug: 'saas', name: 'SaaS', description: 'Listing sites focused on subscription software.' };
const DIRECTORY = {
  id: 'us-example', slug: 'example', name: 'Example Directory',
  website: 'https://example.com', description: 'A directory.',
  country: 'united-states', category: 'saas',
};
const CAT_LINKS = [{ name: 'SaaS', path: '/research/business-directories/united-states/categories/saas/' }];
const COUNTRY_LINKS = [{ name: 'United States', path: '/research/business-directories/united-states/' }];

const types = (meta) => meta.jsonLd.map((node) => node['@type']);
const node = (meta, type) => meta.jsonLd.find((n) => n['@type'] === type);

test('ORIGIN is the canonical www host', () => {
  assert.strictEqual(seo.ORIGIN, 'https://www.petrohrys.com');
});

test('absoluteUrl joins paths without doubling slashes', () => {
  assert.strictEqual(seo.absoluteUrl('/research/business-directories/'),
    'https://www.petrohrys.com/research/business-directories/');
  assert.strictEqual(seo.absoluteUrl('research/x/'), 'https://www.petrohrys.com/research/x/');
});

test('absoluteUrl collapses duplicate slashes', () => {
  assert.strictEqual(seo.absoluteUrl('//research///x//'), 'https://www.petrohrys.com/research/x/');
});

test('absoluteUrl strips query strings and fragments', () => {
  assert.strictEqual(seo.absoluteUrl('/a/?utm_source=x#frag'), 'https://www.petrohrys.com/a/');
});

test('absoluteUrl rejects traversal segments', () => {
  assert.throws(() => seo.absoluteUrl('/a/../../etc/passwd'), seo.SeoError);
});

test('absoluteUrl rejects a URL on any other origin', () => {
  assert.throws(() => seo.absoluteUrl('https://evil.example/x'), seo.SeoError);
  assert.throws(() => seo.absoluteUrl('https://petrohrys.com/x'), seo.SeoError);
});

test('absoluteUrl rejects empty and non-string input', () => {
  assert.throws(() => seo.absoluteUrl(''), seo.SeoError);
  assert.throws(() => seo.absoluteUrl(null), seo.SeoError);
});

test('no builder ever emits an apex-domain URL', () => {
  const metas = [
    seo.buildHubMeta({ countries: COUNTRY_LINKS }),
    seo.buildCountryMeta({ country: COUNTRY, categories: CAT_LINKS, directories: [DIRECTORY] }),
    seo.buildCategoryMeta({ country: COUNTRY, category: CATEGORY, directories: [DIRECTORY] }),
    seo.buildDirectoryMeta({ country: COUNTRY, category: CATEGORY, directory: DIRECTORY }),
  ];
  for (const meta of metas) {
    const blob = JSON.stringify(meta);
    assert.ok(!/https:\/\/petrohrys\.com/.test(blob), 'apex URL leaked');
    assert.ok(meta.canonical.startsWith('https://www.petrohrys.com/'));
  }
});

test('safeExternalUrl normalises valid urls and rejects junk', () => {
  assert.strictEqual(seo.safeExternalUrl('https://example.com'), 'https://example.com/');
  assert.strictEqual(seo.safeExternalUrl('not a url'), null);
  assert.strictEqual(seo.safeExternalUrl('javascript:alert(1)'), null);
  assert.strictEqual(seo.safeExternalUrl(null), null);
});

test('hub metadata is complete and indexable', () => {
  const meta = seo.buildHubMeta({ countries: COUNTRY_LINKS, faqs: [{ q: 'Why?', a: 'Because.' }] });
  assert.strictEqual(meta.canonical, 'https://www.petrohrys.com/research/business-directories/');
  assert.strictEqual(meta.robots, undefined, 'hub must be indexable');
  assert.strictEqual(meta.fullTitle, 'Business Directories — Petro Hrys');
  assert.strictEqual(meta.openGraph.url, meta.canonical);
  assert.strictEqual(meta.openGraph.siteName, 'Petro Hrys');
  assert.strictEqual(meta.twitter.card, 'summary_large_image');
  assert.ok(meta.description.length > 0);
});

test('hub emits CollectionPage, ItemList, FAQPage and BreadcrumbList', () => {
  const meta = seo.buildHubMeta({ countries: COUNTRY_LINKS, faqs: [{ q: 'Why?', a: 'Because.' }] });
  assert.deepStrictEqual(types(meta), ['CollectionPage', 'ItemList', 'FAQPage', 'BreadcrumbList']);
});

test('hub omits ItemList when no country is emitted', () => {
  const meta = seo.buildHubMeta({ countries: [] });
  assert.ok(!types(meta).includes('ItemList'), 'empty ItemList must be omitted');
});

test('hub omits FAQPage when no approved faqs are supplied', () => {
  const meta = seo.buildHubMeta({ countries: COUNTRY_LINKS });
  assert.ok(!types(meta).includes('FAQPage'));
});

test('populated country metadata is indexable with an ItemList', () => {
  const meta = seo.buildCountryMeta({
    country: COUNTRY, categories: CAT_LINKS, directories: [DIRECTORY],
    faqs: [{ q: 'Q', a: 'A' }],
  });
  assert.strictEqual(meta.robots, undefined);
  assert.strictEqual(meta.canonical, 'https://www.petrohrys.com/research/business-directories/united-states/');
  assert.ok(types(meta).includes('ItemList'));
  assert.ok(types(meta).includes('FAQPage'));
  assert.strictEqual(meta.title, 'Business Directories in United States');
});

test('empty country is noindex,follow and omits ItemList', () => {
  const meta = seo.buildCountryMeta({ country: COUNTRY, categories: CAT_LINKS, directories: [] });
  assert.strictEqual(meta.robots, 'noindex,follow');
  assert.ok(!types(meta).includes('ItemList'));
  assert.ok(types(meta).includes('CollectionPage'));
  assert.ok(types(meta).includes('BreadcrumbList'));
});

test('populated category metadata is indexable with an ItemList', () => {
  const meta = seo.buildCategoryMeta({ country: COUNTRY, category: CATEGORY, directories: [DIRECTORY] });
  assert.strictEqual(meta.robots, undefined);
  assert.strictEqual(meta.canonical,
    'https://www.petrohrys.com/research/business-directories/united-states/categories/saas/');
  assert.ok(types(meta).includes('ItemList'));
});

test('empty category is noindex,follow and omits ItemList', () => {
  const meta = seo.buildCategoryMeta({ country: COUNTRY, category: CATEGORY, directories: [] });
  assert.strictEqual(meta.robots, 'noindex,follow');
  assert.ok(!types(meta).includes('ItemList'));
});

test('category never emits FAQPage', () => {
  const meta = seo.buildCategoryMeta({ country: COUNTRY, category: CATEGORY, directories: [DIRECTORY] });
  assert.ok(!types(meta).includes('FAQPage'));
});

test('directory detail emits WebPage with an Organization about', () => {
  const meta = seo.buildDirectoryMeta({ country: COUNTRY, category: CATEGORY, directory: DIRECTORY });
  assert.strictEqual(meta.robots, undefined);
  assert.strictEqual(meta.canonical,
    'https://www.petrohrys.com/research/business-directories/united-states/example/');
  const page = node(meta, 'WebPage');
  assert.strictEqual(page.about['@type'], 'Organization');
  assert.strictEqual(page.about.name, 'Example Directory');
  assert.strictEqual(page.about.url, 'https://example.com/');
});

test('directory about omits url when the website is unusable', () => {
  const meta = seo.buildDirectoryMeta({
    country: COUNTRY, category: CATEGORY,
    directory: { ...DIRECTORY, website: 'javascript:alert(1)' },
  });
  const page = node(meta, 'WebPage');
  assert.ok(!('url' in page.about), 'must not emit a bogus about.url');
  assert.ok(!JSON.stringify(meta).includes('javascript:'));
});

test('breadcrumb hierarchy is correct for every page type', () => {
  assert.deepStrictEqual(
    seo.buildHubMeta({ countries: [] }).breadcrumbTrail.map((b) => b.name),
    ['Home', 'Research', 'Business Directories']);
  assert.deepStrictEqual(
    seo.buildCountryMeta({ country: COUNTRY, categories: [], directories: [] })
      .breadcrumbTrail.map((b) => b.name),
    ['Home', 'Research', 'Business Directories', 'United States']);
  assert.deepStrictEqual(
    seo.buildCategoryMeta({ country: COUNTRY, category: CATEGORY, directories: [] })
      .breadcrumbTrail.map((b) => b.name),
    ['Home', 'Research', 'Business Directories', 'United States', 'SaaS']);
  assert.deepStrictEqual(
    seo.buildDirectoryMeta({ country: COUNTRY, category: CATEGORY, directory: DIRECTORY })
      .breadcrumbTrail.map((b) => b.name),
    ['Home', 'Research', 'Business Directories', 'United States', 'SaaS', 'Example Directory']);
});

test('BreadcrumbList positions start at 1 and use absolute urls', () => {
  const meta = seo.buildCategoryMeta({ country: COUNTRY, category: CATEGORY, directories: [] });
  const crumbs = node(meta, 'BreadcrumbList').itemListElement;
  assert.deepStrictEqual(crumbs.map((c) => c.position), [1, 2, 3, 4, 5]);
  assert.strictEqual(crumbs[1].item, 'https://www.petrohrys.com/research/');
});

test('ItemList preserves input order and numbers from 1', () => {
  const directories = [
    { ...DIRECTORY, id: 'a', slug: 'aaa', name: 'Aaa' },
    { ...DIRECTORY, id: 'b', slug: 'bbb', name: 'Bbb' },
    { ...DIRECTORY, id: 'c', slug: 'ccc', name: 'Ccc' },
  ];
  const list = node(seo.buildCategoryMeta({ country: COUNTRY, category: CATEGORY, directories }), 'ItemList');
  assert.strictEqual(list.numberOfItems, 3);
  assert.deepStrictEqual(list.itemListElement.map((i) => i.name), ['Aaa', 'Bbb', 'Ccc']);
  assert.deepStrictEqual(list.itemListElement.map((i) => i.position), [1, 2, 3]);
  assert.strictEqual(list.itemListElement[0].url,
    'https://www.petrohrys.com/research/business-directories/united-states/aaa/');
});

test('itemList returns null for an empty array', () => {
  assert.strictEqual(seo.itemList([]), null);
});

test('no builder emits a banned schema type', () => {
  const metas = [
    seo.buildHubMeta({ countries: COUNTRY_LINKS, faqs: [{ q: 'Q', a: 'A' }] }),
    seo.buildCountryMeta({ country: COUNTRY, categories: CAT_LINKS, directories: [DIRECTORY], faqs: [{ q: 'Q', a: 'A' }] }),
    seo.buildCategoryMeta({ country: COUNTRY, category: CATEGORY, directories: [DIRECTORY] }),
    seo.buildDirectoryMeta({ country: COUNTRY, category: CATEGORY, directory: DIRECTORY }),
  ];
  // Structural walk over @type rather than a substring scan: a real category is
  // named "Review Sites", and a naive scan for "Review" would false-fail on it.
  const BANNED = new Set(['AggregateRating', 'Review', 'Product', 'SearchAction']);
  const walk = (n) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (n && typeof n === 'object') {
      if (typeof n['@type'] === 'string') {
        assert.ok(!BANNED.has(n['@type']), `banned @type emitted: ${n['@type']}`);
      }
      return Object.values(n).forEach(walk);
    }
    return undefined;
  };
  for (const meta of metas) {
    walk(meta.jsonLd);
    const blob = JSON.stringify(meta);
    for (const token of ['ratingValue', 'reviewRating', 'aggregateRating', 'priceCurrency', 'bestRating']) {
      assert.ok(!blob.includes(token), `banned property emitted: ${token}`);
    }
  }
});

test('a category literally named "Review Sites" is still allowed', () => {
  const meta = seo.buildCategoryMeta({
    country: COUNTRY,
    category: { slug: 'review-sites', name: 'Review Sites', description: 'Platforms publishing customer reviews.' },
    directories: [DIRECTORY],
  });
  assert.ok(meta.title.includes('Review Sites'));
  assert.ok(!meta.jsonLd.some((n) => n['@type'] === 'Review'));
});

test('renderJsonLd makes a script breakout impossible', () => {
  const html = seo.renderJsonLd([{ '@type': 'WebPage', name: '</script><img src=x onerror=alert(1)>' }]);
  assert.ok(!html.includes('</script><img'));
  assert.ok(!/<\/script\s*>/i.test(html.replace(/<\/script>\s*$/, '')));
  assert.ok(html.includes('\\u003c'));
});

test('renderJsonLd escapes line and paragraph separators', () => {
  const LS = '\u2028';
  const PS = '\u2029';
  const html = seo.renderJsonLd([{ '@type': 'WebPage', name: `a${LS}b${PS}c` }]);
  assert.ok(!html.includes(LS), 'raw U+2028 must not survive');
  assert.ok(!html.includes(PS), 'raw U+2029 must not survive');
  assert.ok(html.includes('\\u2028'));
  assert.ok(html.includes('\\u2029'));
});

test('renderJsonLd preserves non-ASCII Unicode', () => {
  const html = seo.renderJsonLd([{ '@type': 'WebPage', name: 'Česká republika — 東京 — Ünïcodé' }]);
  assert.ok(html.includes('Česká republika'));
  assert.ok(html.includes('東京'));
  assert.ok(html.includes('Ünïcodé'));
});

test('special characters in registry data survive into JSON-LD safely', () => {
  const meta = seo.buildDirectoryMeta({
    country: COUNTRY, category: CATEGORY,
    directory: { ...DIRECTORY, name: 'A & B <Ltd> "quoted"', description: "O'Neil & Co" },
  });
  const html = seo.renderJsonLd(meta.jsonLd);
  assert.ok(html.includes('A & B \\u003cLtd\\u003e'));
  assert.ok(!html.includes('<Ltd>'));
});

test('repeated calls produce byte-identical output', () => {
  const build = () => seo.renderJsonLd(seo.buildCountryMeta({
    country: COUNTRY, categories: CAT_LINKS, directories: [DIRECTORY], faqs: [{ q: 'Q', a: 'A' }],
  }).jsonLd);
  const runs = new Set(Array.from({ length: 25 }, build));
  assert.strictEqual(runs.size, 1);
});

test('output contains no build-time timestamp or random id', () => {
  const blob = JSON.stringify(seo.buildHubMeta({ countries: COUNTRY_LINKS }));
  assert.ok(!/\d{4}-\d{2}-\d{2}T\d{2}:/.test(blob), 'no ISO timestamp may appear');
  assert.ok(!/"@id"\s*:/.test(blob), 'no generated @id may appear');
});

test('descriptions never contain fabricated counts or metrics', () => {
  const metas = [
    seo.buildHubMeta({ countries: COUNTRY_LINKS }),
    seo.buildCountryMeta({ country: COUNTRY, categories: CAT_LINKS, directories: [DIRECTORY, DIRECTORY] }),
    seo.buildCategoryMeta({ country: COUNTRY, category: CATEGORY, directories: [DIRECTORY] }),
  ];
  for (const meta of metas) {
    assert.ok(!/\d/.test(meta.description), `description must not assert a count: ${meta.description}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test "scripts/tests/bd-seo.test.cjs"`
Expected: FAIL — `Cannot find module '../lib/bd-seo.cjs'`

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/bd-seo.cjs
'use strict';

const ORIGIN = 'https://www.petrohrys.com';
const SITE_NAME = 'Petro Hrys';
const TWITTER_SITE = '@petrohrys';
const OG_IMAGE = `${ORIGIN}/images/og-default.png`;
const NOINDEX = 'noindex,follow';
const BASE = '/research/business-directories/';

class SeoError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SeoError';
  }
}

// Hard-coded origin: never read a hostname from the environment, so an apex or
// preview-domain URL can never be emitted.
function absoluteUrl(pathname) {
  if (typeof pathname !== 'string' || pathname.trim() === '') {
    throw new SeoError(`Invalid path: ${JSON.stringify(pathname)}`);
  }
  let p = pathname.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(p)) {
    let parsed;
    try {
      parsed = new URL(p);
    } catch {
      throw new SeoError(`Invalid URL: ${p}`);
    }
    if (parsed.origin !== ORIGIN) {
      throw new SeoError(`Refusing to emit a URL outside ${ORIGIN}: ${p}`);
    }
    p = parsed.pathname;
  }
  p = p.split('#')[0].split('?')[0];
  if (!p.startsWith('/')) p = `/${p}`;
  p = p.replace(/\/{2,}/g, '/');
  if (p.split('/').includes('..')) {
    throw new SeoError(`Path traversal is not allowed: ${pathname}`);
  }
  return `${ORIGIN}${p}`;
}

// Outbound directory websites are registry data, so treat them as untrusted:
// anything that is not a well-formed http(s) URL becomes null and is omitted.
function safeExternalUrl(value) {
  if (typeof value !== 'string') return null;
  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  return parsed.toString();
}

function breadcrumbList(trail) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((entry, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: entry.name,
      item: absoluteUrl(entry.path),
    })),
  };
}

function collectionPage({ name, description, url }) {
  return {
    '@type': 'CollectionPage',
    name,
    description,
    url,
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: `${ORIGIN}/` },
  };
}

function webPage({ name, description, url }) {
  return {
    '@type': 'WebPage',
    name,
    description,
    url,
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: `${ORIGIN}/` },
  };
}

// Returns null when there is nothing real to list, so callers omit the node
// entirely rather than publishing an empty or placeholder ItemList.
function itemList(items) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return {
    '@type': 'ItemList',
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      url: absoluteUrl(item.path),
    })),
  };
}

function faqPage(faqs) {
  if (!Array.isArray(faqs) || faqs.length === 0) return null;
  return {
    '@type': 'FAQPage',
    mainEntity: faqs.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };
}

function organisationAbout(directory) {
  const about = { '@type': 'Organization', name: directory.name };
  const url = safeExternalUrl(directory.website);
  if (url) about.url = url;
  return about;
}

function meta({ title, description, canonicalPath, robots, breadcrumbTrail, graph }) {
  const canonical = absoluteUrl(canonicalPath);
  const fullTitle = `${title} — ${SITE_NAME}`;
  return {
    title,
    fullTitle,
    description,
    canonicalPath,
    canonical,
    robots: robots || undefined,
    openGraph: {
      title: fullTitle,
      description,
      url: canonical,
      type: 'website',
      siteName: SITE_NAME,
      image: OG_IMAGE,
    },
    twitter: {
      card: 'summary_large_image',
      site: TWITTER_SITE,
      title: fullTitle,
      description,
      image: OG_IMAGE,
    },
    breadcrumbTrail,
    jsonLd: graph.filter(Boolean),
  };
}

const ROOT_TRAIL = [
  { name: 'Home', path: '/' },
  { name: 'Research', path: '/research/' },
  { name: 'Business Directories', path: BASE },
];

function buildHubMeta({ countries = [], faqs = [] } = {}) {
  const title = 'Business Directories';
  const description = 'A country-by-country research index of business directories, '
    + 'recording what each one accepts, how it links, and when it was last verified.';
  const trail = ROOT_TRAIL;
  return meta({
    title,
    description,
    canonicalPath: BASE,
    robots: undefined,
    breadcrumbTrail: trail,
    graph: [
      collectionPage({ name: title, description, url: absoluteUrl(BASE) }),
      itemList(countries),
      faqPage(faqs),
      breadcrumbList(trail),
    ],
  });
}

function buildCountryMeta({ country, categories = [], directories = [], faqs = [] }) {
  const canonicalPath = `${BASE}${country.slug}/`;
  const title = `Business Directories in ${country.name}`;
  const description = `Business directories relevant to companies operating in ${country.titleName}, `
    + 'organised by category and verified by hand.';
  const trail = [...ROOT_TRAIL, { name: country.name, path: canonicalPath }];
  const populated = directories.length > 0;
  return meta({
    title,
    description,
    canonicalPath,
    robots: populated ? undefined : NOINDEX,
    breadcrumbTrail: trail,
    graph: [
      collectionPage({ name: title, description, url: absoluteUrl(canonicalPath) }),
      populated ? itemList(categories) : null,
      faqPage(faqs),
      breadcrumbList(trail),
    ],
  });
}

function buildCategoryMeta({ country, category, directories = [] }) {
  const countryPath = `${BASE}${country.slug}/`;
  const canonicalPath = `${countryPath}categories/${category.slug}/`;
  const title = `${category.name} directories in ${country.name}`;
  const description = `${category.description} This page covers ${country.titleName}.`;
  const trail = [
    ...ROOT_TRAIL,
    { name: country.name, path: countryPath },
    { name: category.name, path: canonicalPath },
  ];
  return meta({
    title,
    description,
    canonicalPath,
    robots: directories.length > 0 ? undefined : NOINDEX,
    breadcrumbTrail: trail,
    graph: [
      collectionPage({ name: title, description, url: absoluteUrl(canonicalPath) }),
      itemList(directories.map((d) => ({ name: d.name, path: `${countryPath}${d.slug}/` }))),
      breadcrumbList(trail),
    ],
  });
}

function buildDirectoryMeta({ country, category, directory }) {
  const countryPath = `${BASE}${country.slug}/`;
  const canonicalPath = `${countryPath}${directory.slug}/`;
  const title = `${directory.name} — ${country.name}`;
  const description = directory.description;
  const trail = [
    ...ROOT_TRAIL,
    { name: country.name, path: countryPath },
    { name: category.name, path: `${countryPath}categories/${category.slug}/` },
    { name: directory.name, path: canonicalPath },
  ];
  const page = webPage({ name: directory.name, description, url: absoluteUrl(canonicalPath) });
  page.about = organisationAbout(directory);
  return meta({
    title,
    description,
    canonicalPath,
    robots: undefined,
    breadcrumbTrail: trail,
    graph: [page, breadcrumbList(trail)],
  });
}

// Escapes only the characters that can terminate a script element or break a
// JavaScript parse. All other Unicode is preserved verbatim.
function renderJsonLd(graph) {
  const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return `  <script type="application/ld+json">\n${json}\n  </script>`;
}

module.exports = {
  ORIGIN, SeoError, absoluteUrl, safeExternalUrl, renderJsonLd,
  breadcrumbList, collectionPage, webPage, itemList, faqPage, organisationAbout,
  buildHubMeta, buildCountryMeta, buildCategoryMeta, buildDirectoryMeta,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test "scripts/tests/bd-seo.test.cjs"`
Expected: PASS, 33 tests

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/bd-seo.cjs scripts/tests/bd-seo.test.cjs
git commit -m "feat(bd): add SEO metadata and structured-data builders"
```

> **Note for Task 10:** `pageModel` must call `buildHubMeta` / `buildCountryMeta` / `buildCategoryMeta` / `buildDirectoryMeta` and spread the result, rather than assembling `title`, `description`, `robots`, and `jsonLd` by hand. The builders own indexability and ItemList omission.

---

### Task 6: Components

**Files:**
- Create: `scripts/lib/bd-components.cjs`
- Test: `scripts/tests/bd-components.test.cjs`

**Interfaces:**
- Consumes: `bd-util.cjs` → `escapeHtml`; `bd-seo.cjs` → `safeExternalUrl`; `bd-sort.cjs` → `sortDirectories`, `SORTS`, `SORT_KEYS`
- Produces 17 component builders: `breadcrumbs`, `pageIntro`, `countryCard`, `categoryCard`, `cardGrid`, `directoryTable`, `directoryCard`, `metricsBlock`, `statusBadges`, `prosCons`, `bestForTags`, `emptyState`, `searchControls`, `filterControls`, `sortControls`, `pagination`, `methodologyNote`, `provenanceBlock`, `externalLinkCta`, plus helpers `metric`, `metricNote`, `bulletList`, `directoryRow`, and constants `FILTERS`, `VERIFICATION_NOTE`, `REL_EXTERNAL`.

**Component contract:**
- **Existing classes are reused in markup, never redefined in CSS.** The hero uses `page-hero`/`lede` and the breadcrumb reuses `breadcrumb`, so the section inherits the site's look without a single new design token. Only genuinely new UI (table, badges, chips, controls, pagination) gets `bd-*` classes.
- **Security.** Every string is escaped for both text and attribute positions. Outbound URLs pass through `safeExternalUrl`; `javascript:`, `data:`, `file:`, and malformed values are never rendered as links — the CTA says "no usable address recorded" instead. External links carry `rel="noopener noreferrer"` and **deliberately no `nofollow`**: these are editorial citations from pages that carry original methodology and analysis, not paid placements, and blanket-nofollowing them would frame a curated knowledge base as a link directory. If sponsored or user-submitted listings are ever added, `rel` becomes a per-link decision. No inline styles, no inline event handlers, no `<script>`, no raw JSON.
- **Honesty.** A null metric renders an em dash with a visually hidden "Not recorded", never `0`. An unknown field never implies verification: badges read "Not yet verified", "Listing cost not recorded", "Verification requirement not recorded".
- **Accessibility.** Breadcrumb is `nav > ol` with `aria-label` and a single `aria-current="page"`. Pagination is `nav > ol`; the current page is a `<span>`, so it cannot be focused or activated. Every control has a `<label for>`, and `idPrefix` namespaces ids so two shells never collide. Status is always words, never colour alone. Headings are configurable and clamped to h2–h6. Cards link only their title, so no anchor ever wraps a block containing another anchor.
- **No JavaScript required.** Controls render `hidden` and are revealed by Task 9. The table is fully sorted server-side by `bd-sort` and completely readable without scripting.
- **Long values are rendered in full.** Nothing is truncated in content; any clamping is CSS's job, so source data is never silently lost.
- **Deterministic and non-mutating.** No dates, no randomness, inputs untouched.

- [ ] **Step 1: Write the failing test**

```js
// scripts/tests/bd-components.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const c = require('../lib/bd-components.cjs');

const DIR = {
  id: 'us-example', slug: 'example-directory', name: 'Example Directory',
  country: 'united-states', category: 'saas', website: 'https://example.com',
  description: 'A directory of things.', tier: 'tier1',
  petroHrysScore: null, domainRating: null, authorityScore: null,
  estimatedTraffic: null, referringDomains: null, free: null, paid: null,
  verificationRequired: null, manualReview: null, acceptsSaaS: null,
  acceptsStartups: null, acceptsAI: null, lastVerified: null, nextVerification: null,
  recommendedIndustries: [], pros: [], cons: [], editorNotes: '', metricsProvenance: {},
};

const XSS = '<script>alert(1)</script>';
const LONG = 'Ω'.repeat(5000);
const UNICODE = 'Česká republika — 東京 — Ünïcodé — ĄŻŚ';

// Minimal well-formedness checker: tokenises tags and asserts the stack balances.
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr']);
function assertWellFormed(html, label) {
  const stack = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\/?)>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const [, closing, rawName, , selfClose] = m;
    const name = rawName.toLowerCase();
    if (VOID.has(name) || selfClose) continue;
    if (closing) {
      const open = stack.pop();
      assert.strictEqual(open, name, `${label}: </${name}> closes <${open}>`);
    } else {
      stack.push(name);
    }
  }
  assert.deepStrictEqual(stack, [], `${label}: unclosed tags ${stack.join(', ')}`);
}

const ALL = () => [
  c.breadcrumbs([{ name: 'Home', path: '/' }, { name: 'Here', path: '/here/' }]),
  c.pageIntro({ title: 'T', lede: 'L' }),
  c.cardGrid([c.countryCard({ name: 'A', path: '/a/' }), c.countryCard({ name: 'B', path: '/b/', pending: true })]),
  c.cardGrid([c.categoryCard({ name: 'C', path: '/c/', description: 'd' })]),
  c.directoryTable({ directories: [DIR] }),
  c.directoryCard({ directory: DIR }),
  c.metricsBlock(DIR),
  c.statusBadges(DIR),
  c.prosCons({ pros: ['p'], cons: [] }),
  c.bestForTags(['legal']),
  c.emptyState('Nothing here.'),
  c.searchControls({}),
  c.filterControls({}),
  c.sortControls({}),
  c.pagination({ current: 1, total: 3, basePath: '/x/' }),
  c.methodologyNote(),
  c.provenanceBlock(DIR),
  c.externalLinkCta({ url: 'https://example.com' }),
];

// --- escaping and injection -------------------------------------------------

test('script payloads in text are escaped everywhere', () => {
  const evil = { ...DIR, name: XSS, description: XSS, recommendedIndustries: [XSS], pros: [XSS], cons: [XSS] };
  const html = [
    c.directoryTable({ directories: [evil] }), c.directoryCard({ directory: evil }),
    c.bestForTags([XSS]), c.prosCons({ pros: [XSS], cons: [XSS] }),
    c.pageIntro({ title: XSS, lede: XSS }), c.emptyState(XSS),
    c.countryCard({ name: XSS, path: '/x/' }), c.categoryCard({ name: XSS, path: '/x/', description: XSS }),
  ].join('\n');
  assert.ok(!html.includes('<script>'), 'raw script tag leaked');
  assert.ok(html.includes('&lt;script&gt;'));
});

// A raw double quote may only ever appear as an attribute delimiter. If one is
// followed by something shaped like an on* attribute, a real breakout happened.
// Stripping &quot; before scanning would re-create the pattern from inert text,
// so the entity is deliberately left in place.
function assertNoAttributeInjection(html, label) {
  assert.ok(!/"\s*on[a-z]+\s*=/i.test(html), `${label}: event handler injected via double quote`);
  assert.ok(!/'\s*on[a-z]+\s*=/i.test(html), `${label}: event handler injected via single quote`);
}

test('quotes in attribute positions cannot break out', () => {
  const evil = { ...DIR, name: '" onmouseover="alert(1)', slug: '" onfocus="alert(1)' };
  const html = c.directoryTable({ directories: [evil] });
  assertNoAttributeInjection(html, 'directoryTable');
  assert.ok(html.includes('&quot;'), 'the quote must survive as an escaped entity');
  assert.ok(html.includes('onmouseover'), 'the payload text itself is kept, just inert');
});

test('breadcrumb paths are escaped', () => {
  const html = c.breadcrumbs([{ name: 'A', path: '/a"onclick="x/' }, { name: 'B', path: '/b/' }]);
  assert.ok(html.includes('&quot;'));
  assertNoAttributeInjection(html, 'breadcrumbs');
});

// --- unsafe URLs ------------------------------------------------------------

test('unsafe url schemes are never rendered as links', () => {
  for (const bad of ['javascript:alert(1)', 'data:text/html;base64,PHN2Zz4=', 'file:///etc/passwd', 'not a url', '']) {
    const html = c.externalLinkCta({ url: bad });
    assert.ok(!html.includes('<a '), `scheme rendered as link: ${bad}`);
    assert.ok(html.includes('no usable address recorded'));
  }
});

test('a valid https url renders with the required rel attributes', () => {
  const html = c.externalLinkCta({ url: 'https://example.com/list' });
  assert.ok(html.includes('<a '));
  assert.ok(html.includes('rel="noopener noreferrer"'));
  assert.ok(/noopener/.test(html) && /noreferrer/.test(html));
});

test('editorial outbound links are not nofollowed', () => {
  // Outbound links are citations from original editorial pages, not paid
  // placements. Blanket nofollow would frame the section as a link directory.
  const html = c.externalLinkCta({ url: 'https://example.com/list' });
  assert.ok(!html.includes('nofollow'), 'editorial references must not be nofollowed');
  assert.strictEqual(c.REL_EXTERNAL, 'noopener noreferrer');
});

test('external cta announces that it opens a new tab', () => {
  const html = c.externalLinkCta({ url: 'https://example.com' });
  assert.ok(html.includes('target="_blank"'));
  assert.ok(html.includes('opens in a new tab'));
});

// --- null handling ----------------------------------------------------------

test('null metrics render an em dash with a spoken equivalent, never zero', () => {
  const html = c.metricsBlock(DIR);
  assert.ok(html.includes('&mdash;'));
  assert.ok(html.includes('Not recorded'));
  assert.ok(!/>0</.test(html), 'must never render 0 for an unknown value');
});

test('unknown fields never imply verification', () => {
  const html = c.statusBadges(DIR);
  assert.ok(html.includes('Not yet verified'));
  assert.ok(html.includes('Listing cost not recorded'));
  assert.ok(html.includes('Verification requirement not recorded'));
  assert.ok(!/>Verified</.test(html));
});

test('a verified record reports its date in a time element', () => {
  const html = c.provenanceBlock({ ...DIR, lastVerified: '2026-08-01' });
  assert.ok(html.includes('<time datetime="2026-08-01">2026-08-01</time>'));
});

test('an unverified record says so rather than showing a date', () => {
  assert.ok(c.provenanceBlock(DIR).includes('Not yet verified'));
});

test('third-party metrics always show provider and measurement date', () => {
  const html = c.metricsBlock({
    ...DIR, domainRating: 78, lastVerified: '2026-08-01',
    metricsProvenance: { domainRating: { provider: 'Ahrefs', measuredAt: '2026-08-01' } },
  });
  assert.ok(html.includes('78'));
  assert.ok(html.includes('Ahrefs'));
  assert.ok(html.includes('<time datetime="2026-08-01">'));
});

// --- empty and populated states --------------------------------------------

test('an empty directory table renders the empty state', () => {
  const html = c.directoryTable({ directories: [] });
  assert.ok(html.includes('bd-empty'));
  assert.ok(html.includes('manual verification'));
  assert.ok(!html.includes('<table'));
});

test('a populated table renders one row per directory with no cap', () => {
  const many = Array.from({ length: 137 }, (_, i) => ({ ...DIR, id: `i${i}`, slug: `s${i}`, name: `N${i}` }));
  const html = c.directoryTable({ directories: many });
  assert.strictEqual((html.match(/<tr class="bd-row"/g) || []).length, 137);
});

test('empty arrays produce factual empty copy, not blanks', () => {
  assert.ok(c.bestForTags([]).includes('No recommended industries recorded yet.'));
  assert.ok(c.prosCons({ pros: [], cons: [] }).includes('No strengths recorded yet.'));
  assert.ok(c.prosCons({ pros: [], cons: [] }).includes('No limitations recorded yet.'));
});

// --- semantics and accessibility -------------------------------------------

test('the table is semantic and readable without JavaScript', () => {
  const html = c.directoryTable({ directories: [DIR] });
  assert.ok(html.includes('<caption'));
  assert.ok(html.includes('<thead>'));
  assert.ok(html.includes('<tbody'));
  assert.ok((html.match(/scope="col"/g) || []).length >= 5);
  assert.ok(html.includes('scope="row"'));
});

test('breadcrumb is a labelled nav whose last item is aria-current', () => {
  const html = c.breadcrumbs([
    { name: 'Home', path: '/' }, { name: 'Research', path: '/research/' }, { name: 'Now', path: '/now/' },
  ]);
  assert.ok(html.includes('<nav'));
  assert.ok(html.includes('aria-label="Breadcrumb"'));
  assert.ok(html.includes('<ol'));
  assert.ok(html.includes('aria-current="page">Now<'));
  assert.strictEqual((html.match(/aria-current/g) || []).length, 1);
});

test('pagination is a labelled nav and the current page is not a link', () => {
  const html = c.pagination({ current: 2, total: 3, basePath: '/x/' });
  assert.ok(html.includes('aria-label="Directory pages"'));
  assert.ok(html.includes('aria-current="page"'));
  const current = html.split('\n').find((l) => l.includes('aria-current'));
  assert.ok(!current.includes('<a '), 'the current page must not be clickable');
});

test('pagination is omitted for a single page', () => {
  assert.strictEqual(c.pagination({ current: 1, total: 1, basePath: '/x/' }), '');
});

test('every form control has an associated label', () => {
  for (const html of [c.searchControls({}), c.filterControls({}), c.sortControls({})]) {
    const ids = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
    const fors = [...html.matchAll(/for="([^"]+)"/g)].map((m) => m[1]);
    for (const id of ids) assert.ok(fors.includes(id), `control ${id} has no label`);
    assert.ok(ids.length > 0);
  }
});

test('control ids can be namespaced so two shells never collide', () => {
  const a = c.searchControls({ idPrefix: 'alpha' });
  const b = c.searchControls({ idPrefix: 'beta' });
  assert.ok(a.includes('id="alpha-search"'));
  assert.ok(b.includes('id="beta-search"'));
  assert.ok(!a.includes('beta-'));
});

test('status is conveyed in words, never by colour alone', () => {
  const html = c.statusBadges({ ...DIR, free: true, verificationRequired: true, lastVerified: '2026-08-01' });
  for (const words of ['Verified', 'Free listing', 'Verification required']) {
    assert.ok(html.includes(words), `missing text for ${words}`);
  }
});

test('cards link only their title, never wrapping the whole block', () => {
  const html = c.directoryCard({ directory: DIR });
  const anchors = (html.match(/<a /g) || []).length;
  assert.strictEqual(anchors, 1);
  assert.ok(/<h3 class="bd-card-title"><a /.test(html));
});

test('heading level is configurable and clamped to a valid range', () => {
  assert.ok(c.directoryCard({ directory: DIR, headingLevel: 2 }).includes('<h2'));
  assert.ok(c.directoryCard({ directory: DIR, headingLevel: 99 }).includes('<h6'));
  assert.ok(c.directoryCard({ directory: DIR, headingLevel: 1 }).includes('<h2'));
});

test('a pending route is rendered as text, never as a link', () => {
  const html = c.countryCard({ name: 'Germany', path: '/germany/', pending: true });
  assert.ok(!html.includes('<a '));
  assert.ok(html.includes('coming soon'));
  assert.ok(html.includes('Germany'));
});

// --- markup hygiene ---------------------------------------------------------

test('no component emits an inline style or event handler', () => {
  const html = ALL().join('\n');
  assert.ok(!/\sstyle="/.test(html), 'inline style found');
  assert.ok(!/\son[a-z]+\s*=/i.test(html), 'inline event handler found');
  assertNoAttributeInjection(html, 'all components');
  assert.ok(!html.includes('javascript:'));
});

test('no component emits a script tag or raw JSON', () => {
  const html = ALL().join('\n');
  assert.ok(!/<script/i.test(html));
  assert.ok(!/application\/ld\+json/.test(html));
});

test('every fragment is well-formed', () => {
  ALL().forEach((html, i) => assertWellFormed(html, `fragment ${i}`));
});

test('no fake buttons and no interactive nesting', () => {
  const html = ALL().join('\n');
  assert.ok(!/<div[^>]*role="button"/.test(html));
  assert.ok(!/<a[^>]*>[^<]*<a /.test(html), 'nested anchors');
  assert.ok(!/<button[^>]*>[\s\S]*?<a /.test(html), 'anchor inside button');
});

// --- unicode, long values, determinism, immutability ------------------------

test('unicode survives intact in every text position', () => {
  const rec = { ...DIR, name: UNICODE, description: UNICODE, recommendedIndustries: [UNICODE] };
  const html = [c.directoryTable({ directories: [rec] }), c.directoryCard({ directory: rec }),
    c.bestForTags([UNICODE])].join('\n');
  for (const part of ['Česká republika', '東京', 'Ünïcodé', 'ĄŻŚ']) {
    assert.ok(html.includes(part), `lost ${part}`);
  }
});

test('very long values are rendered in full, never silently truncated', () => {
  const rec = { ...DIR, name: LONG, description: LONG };
  const html = c.directoryCard({ directory: rec });
  assert.ok(html.includes(LONG), 'source data was truncated');
  assert.ok(!html.includes('…'));
});

test('duplicate names and ids in the data do not break markup', () => {
  const dup = [{ ...DIR }, { ...DIR, slug: 'other' }];
  const html = c.directoryTable({ directories: dup });
  assertWellFormed(html, 'duplicate rows');
  assert.strictEqual((html.match(/<tr class="bd-row"/g) || []).length, 2);
});

test('repeated rendering is byte-identical', () => {
  const runs = new Set(Array.from({ length: 25 }, () => ALL().join('\n')));
  assert.strictEqual(runs.size, 1);
});

test('components never mutate their inputs', () => {
  const rec = { ...DIR, pros: ['a'], cons: ['b'], recommendedIndustries: ['c'] };
  const list = [rec];
  const snapshot = JSON.stringify({ rec, list });
  c.directoryTable({ directories: list });
  c.directoryCard({ directory: rec });
  c.metricsBlock(rec);
  c.statusBadges(rec);
  c.prosCons({ pros: rec.pros, cons: rec.cons });
  c.bestForTags(rec.recommendedIndustries);
  assert.strictEqual(JSON.stringify({ rec, list }), snapshot);
});

test('the table is ordered by bd-sort, not by input order', () => {
  const rows = [
    { ...DIR, id: 'a', slug: 'low', name: 'Low', petroHrysScore: 10, lastVerified: '2026-01-01' },
    { ...DIR, id: 'b', slug: 'high', name: 'High', petroHrysScore: 90, lastVerified: '2026-01-01' },
  ];
  const html = c.directoryTable({ directories: rows });
  assert.ok(html.indexOf('>High<') < html.indexOf('>Low<'), 'server order must come from bd-sort');
});

test('rows carry the data attributes the client script needs', () => {
  const html = c.directoryTable({ directories: [{ ...DIR, free: true }] });
  for (const attribute of ['data-bd-name', 'data-bd-haystack', 'data-bd-score',
    'data-bd-dr', 'data-bd-as', 'data-bd-traffic', 'data-bd-free']) {
    assert.ok(html.includes(attribute), `missing ${attribute}`);
  }
  assert.ok(html.includes('data-bd-free="1"'));
  assert.ok(html.includes('data-bd-paid="0"'));
});

test('null metrics produce empty data attributes rather than zero', () => {
  const html = c.directoryTable({ directories: [DIR] });
  assert.ok(html.includes('data-bd-score=""'));
  assert.ok(!html.includes('data-bd-score="0"'));
});

test('controls start hidden so the prerendered table stands alone', () => {
  for (const html of [c.searchControls({}), c.filterControls({}), c.sortControls({})]) {
    assert.ok(html.includes('hidden'), 'controls must be hidden until enhanced');
  }
});

test('the methodology note makes no claim about entry counts', () => {
  const html = c.methodologyNote();
  assert.ok(!/\d/.test(html), 'methodology copy must not assert numbers');
  assert.ok(html.includes('checked by hand'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test "scripts/tests/bd-components.test.cjs"`
Expected: FAIL — `Cannot find module '../lib/bd-components.cjs'`

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/bd-components.cjs
'use strict';
const { escapeHtml } = require('./bd-util.cjs');
const { safeExternalUrl } = require('./bd-seo.cjs');
const { sortDirectories, SORTS, SORT_KEYS } = require('./bd-sort.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOT_RECORDED = 'Not recorded';

// Editorial references, not paid placements. Every directory page carries
// original methodology, strengths, limitations and context, so outbound links
// are citations and must NOT be nofollowed — that would misrepresent a curated
// knowledge base as a link directory. Revisit per link only if sponsored or
// user-submitted listings are ever introduced.
const REL_EXTERNAL = 'noopener noreferrer';

const isNullish = (v) => v === null || v === undefined;

// Visually hidden text. Status and metrics must never be conveyed by colour or
// a bare glyph alone, so an em dash always carries a spoken equivalent.
function vh(text) {
  return `<span class="bd-vh">${escapeHtml(text)}</span>`;
}

function headingTag(level) {
  const n = Number.isInteger(level) ? Math.min(Math.max(level, 2), 6) : 3;
  return `h${n}`;
}

// Returns a safe href or null. Anything that is not http(s) — javascript:,
// data:, file:, malformed — is refused, and callers render plain text instead.
function safeHref(value) {
  return safeExternalUrl(value);
}

function dash() {
  return `<span class="bd-metric bd-metric--empty"><span aria-hidden="true">&mdash;</span>${vh(NOT_RECORDED)}</span>`;
}

// ---------------------------------------------------------------------------
// 1. Breadcrumbs
// ---------------------------------------------------------------------------

function breadcrumbs(trail) {
  if (!Array.isArray(trail) || trail.length === 0) return '';
  const items = trail.map((entry, index) => {
    const last = index === trail.length - 1;
    const inner = last
      ? `<span aria-current="page">${escapeHtml(entry.name)}</span>`
      : `<a href="${escapeHtml(entry.path)}">${escapeHtml(entry.name)}</a>`;
    const sep = last ? '' : '<span class="sep" aria-hidden="true">/</span>';
    return `      <li class="bd-crumb">${inner}${sep}</li>`;
  }).join('\n');
  return `    <nav class="breadcrumb bd-breadcrumb" aria-label="Breadcrumb">
      <ol class="bd-crumbs">
${items}
      </ol>
    </nav>`;
}

// ---------------------------------------------------------------------------
// 2. Page intro / hero
// ---------------------------------------------------------------------------

function pageIntro({ title, lede }) {
  const ledeHtml = lede ? `\n      <p class="lede">${escapeHtml(lede)}</p>` : '';
  return `    <article class="page-hero">
      <h1>${escapeHtml(title)}</h1>${ledeHtml}
    </article>`;
}

// ---------------------------------------------------------------------------
// 3 & 4. Country and category cards
// ---------------------------------------------------------------------------

// A pending route has not been written to disk, so it is rendered as text and
// never as a link — linking it would advertise a 404.
function countryCard({ name, path, pending = false, headingLevel = 3 }) {
  const h = headingTag(headingLevel);
  const title = pending
    ? `<span class="bd-pending">${escapeHtml(name)}</span> <span class="bd-tag">coming soon</span>`
    : `<a href="${escapeHtml(path)}">${escapeHtml(name)}</a>`;
  return `        <li class="bd-card">
          <${h} class="bd-card-title">${title}</${h}>
        </li>`;
}

function categoryCard({ name, path, description, pending = false, headingLevel = 3 }) {
  const h = headingTag(headingLevel);
  const title = pending
    ? `<span class="bd-pending">${escapeHtml(name)}</span> <span class="bd-tag">coming soon</span>`
    : `<a href="${escapeHtml(path)}">${escapeHtml(name)}</a>`;
  const body = description ? `\n          <p class="bd-card-body">${escapeHtml(description)}</p>` : '';
  return `        <li class="bd-card">
          <${h} class="bd-card-title">${title}</${h}>${body}
        </li>`;
}

function cardGrid(cards, { label } = {}) {
  if (!cards.length) return '';
  const labelAttr = label ? ` aria-label="${escapeHtml(label)}"` : '';
  return `      <ul class="bd-grid"${labelAttr}>
${cards.join('\n')}
      </ul>`;
}

// ---------------------------------------------------------------------------
// 7. Metrics
// ---------------------------------------------------------------------------

// Third-party metrics always render their provider and measurement date, so a
// reader never mistakes them for a PetroHrys measurement.
function metric(value, provenance) {
  if (isNullish(value)) return dash();
  const shown = escapeHtml(value);
  if (provenance && provenance.provider && provenance.measuredAt) {
    return `<span class="bd-metric">${shown}<span class="bd-metric-source">`
      + `${escapeHtml(provenance.provider)}, measured `
      + `<time datetime="${escapeHtml(provenance.measuredAt)}">${escapeHtml(provenance.measuredAt)}</time>`
      + `</span></span>`;
  }
  return `<span class="bd-metric">${shown}</span>`;
}

const METRIC_ROWS = [
  ['petroHrysScore', 'PetroHrys Score', false],
  ['domainRating', 'Domain Rating', true],
  ['authorityScore', 'Authority Score', true],
  ['estimatedTraffic', 'Estimated traffic', true],
  ['referringDomains', 'Referring domains', true],
];

function metricsBlock(directory) {
  const provenance = directory.metricsProvenance || {};
  const rows = METRIC_ROWS.map(([field, label, thirdParty]) => {
    const value = metric(directory[field], thirdParty ? provenance[field] : undefined);
    return `        <div class="bd-def">
          <dt class="bd-def-t">${escapeHtml(label)}</dt>
          <dd class="bd-def-d">${value}</dd>
        </div>`;
  }).join('\n');
  return `      <dl class="bd-defs">
${rows}
      </dl>`;
}

function metricNote() {
  return '      <p class="bd-note">Domain Rating, Authority Score, estimated traffic and referring '
    + 'domains are third-party metrics produced by their respective providers, not by '
    + 'PetroHrys.com. The PetroHrys Score is a first-party editorial assessment.</p>';
}

// ---------------------------------------------------------------------------
// 8. Status badges
// ---------------------------------------------------------------------------

// Every badge carries its own words. Nothing is signalled by colour alone, and
// an unknown field never renders as a claim.
function statusBadges(directory) {
  const badges = [];

  badges.push(directory.lastVerified
    ? { state: 'verified', text: 'Verified' }
    : { state: 'unverified', text: 'Not yet verified' });

  if (directory.free === true && directory.paid === true) {
    badges.push({ state: 'mixed', text: 'Free and paid tiers' });
  } else if (directory.free === true) {
    badges.push({ state: 'free', text: 'Free listing' });
  } else if (directory.paid === true) {
    badges.push({ state: 'paid', text: 'Paid listing' });
  } else {
    badges.push({ state: 'unknown', text: 'Listing cost not recorded' });
  }

  if (directory.verificationRequired === true) {
    badges.push({ state: 'gated', text: 'Verification required' });
  } else if (directory.verificationRequired === false) {
    badges.push({ state: 'open', text: 'No verification required' });
  } else {
    badges.push({ state: 'unknown', text: 'Verification requirement not recorded' });
  }

  const items = badges.map((b) =>
    `        <li class="bd-badge" data-bd-state="${escapeHtml(b.state)}">${escapeHtml(b.text)}</li>`).join('\n');
  return `      <ul class="bd-badges" aria-label="Listing status">
${items}
      </ul>`;
}

// ---------------------------------------------------------------------------
// 9 & 10. Pros / cons and best-for tags
// ---------------------------------------------------------------------------

function bulletList(items, emptyMessage) {
  if (!Array.isArray(items) || items.length === 0) {
    return `      <p class="bd-empty">${escapeHtml(emptyMessage)}</p>`;
  }
  const rows = items.map((item) => `        <li>${escapeHtml(item)}</li>`).join('\n');
  return `      <ul class="bd-list">
${rows}
      </ul>`;
}

function prosCons({ pros, cons, headingLevel = 3 }) {
  const h = headingTag(headingLevel);
  return `      <div class="bd-proscons">
        <${h} class="bd-subhead">Strengths</${h}>
${bulletList(pros, 'No strengths recorded yet.')}
        <${h} class="bd-subhead">Limitations</${h}>
${bulletList(cons, 'No limitations recorded yet.')}
      </div>`;
}

function bestForTags(industries) {
  if (!Array.isArray(industries) || industries.length === 0) {
    return `      <p class="bd-empty">No recommended industries recorded yet.</p>`;
  }
  const rows = industries.map((item) =>
    `        <li class="bd-chip">${escapeHtml(item)}</li>`).join('\n');
  return `      <ul class="bd-chips" aria-label="Recommended industries">
${rows}
      </ul>`;
}

// ---------------------------------------------------------------------------
// 11. Empty state
// ---------------------------------------------------------------------------

const VERIFICATION_NOTE = 'Entries are published only after manual verification, so this list '
  + 'stays empty until real, checked directories are added.';

function emptyState(message) {
  return `      <p class="bd-empty">${escapeHtml(message)} ${escapeHtml(VERIFICATION_NOTE)}</p>`;
}

// ---------------------------------------------------------------------------
// 12 & 13. Search / filter and sort shells
// ---------------------------------------------------------------------------

const FILTERS = [
  { field: 'free', label: 'Free listing' },
  { field: 'paid', label: 'Paid listing' },
  { field: 'verificationRequired', label: 'Verification required' },
  { field: 'acceptsSaaS', label: 'Accepts SaaS' },
  { field: 'acceptsStartups', label: 'Accepts startups' },
  { field: 'acceptsAI', label: 'Accepts AI products' },
];

const dataKey = (field) => `data-bd-${field.toLowerCase()}`;

// Controls start hidden and are revealed by Task 9's script. Without
// JavaScript the prerendered table is still complete and fully readable.
function searchControls({ idPrefix = 'bd' } = {}) {
  const id = `${escapeHtml(idPrefix)}-search`;
  return `      <div class="bd-control" data-bd-search-wrap hidden>
        <label class="bd-label" for="${id}">Search directories</label>
        <input class="bd-input" id="${id}" type="search" data-bd-search
               placeholder="Filter by name, description or industry" autocomplete="off">
      </div>`;
}

function filterControls({ idPrefix = 'bd' } = {}) {
  const boxes = FILTERS.map((f) => {
    const id = `${escapeHtml(idPrefix)}-filter-${escapeHtml(f.field)}`;
    return `          <div class="bd-check">
            <input type="checkbox" id="${id}" data-bd-filter="${escapeHtml(f.field)}">
            <label for="${id}">${escapeHtml(f.label)}</label>
          </div>`;
  }).join('\n');
  return `      <fieldset class="bd-control" data-bd-filter-wrap hidden>
        <legend class="bd-label">Filter</legend>
        <div class="bd-checks">
${boxes}
        </div>
      </fieldset>`;
}

function sortControls({ idPrefix = 'bd' } = {}) {
  const id = `${escapeHtml(idPrefix)}-sort`;
  const options = SORT_KEYS.map((key) =>
    `          <option value="${escapeHtml(key)}">${escapeHtml(SORTS[key].label)}</option>`).join('\n');
  return `      <div class="bd-control" data-bd-sort-wrap hidden>
        <label class="bd-label" for="${id}">Sort by</label>
        <select class="bd-select" id="${id}" data-bd-sort>
${options}
        </select>
      </div>`;
}

// ---------------------------------------------------------------------------
// 5. Directory table
// ---------------------------------------------------------------------------

function haystack(directory) {
  return [directory.name, directory.description, ...(directory.recommendedIndustries || [])]
    .filter((part) => typeof part === 'string')
    .join(' ')
    .toLowerCase();
}

function numAttr(value) {
  return isNullish(value) ? '' : String(value);
}

function directoryRow(directory) {
  const provenance = directory.metricsProvenance || {};
  const attrs = [
    `data-bd-name="${escapeHtml(String(directory.name || '').toLowerCase())}"`,
    `data-bd-haystack="${escapeHtml(haystack(directory))}"`,
    `data-bd-score="${escapeHtml(numAttr(directory.petroHrysScore))}"`,
    `data-bd-dr="${escapeHtml(numAttr(directory.domainRating))}"`,
    `data-bd-as="${escapeHtml(numAttr(directory.authorityScore))}"`,
    `data-bd-traffic="${escapeHtml(numAttr(directory.estimatedTraffic))}"`,
    ...FILTERS.map((f) => `${dataKey(f.field)}="${directory[f.field] === true ? '1' : '0'}"`),
  ].join(' ');
  return `          <tr class="bd-row" ${attrs}>
            <th class="bd-cell" scope="row"><a href="${escapeHtml(directory.slug)}/">${escapeHtml(directory.name)}</a></th>
            <td class="bd-cell">${metric(directory.petroHrysScore)}</td>
            <td class="bd-cell">${metric(directory.domainRating, provenance.domainRating)}</td>
            <td class="bd-cell">${metric(directory.authorityScore, provenance.authorityScore)}</td>
            <td class="bd-cell">${metric(directory.estimatedTraffic, provenance.estimatedTraffic)}</td>
          </tr>`;
}

// Server order always comes from bd-sort, so the table is correct before any
// JavaScript runs. No row cap and no pagination logic lives here.
function directoryTable({ directories, caption = 'Directories' }) {
  if (!Array.isArray(directories) || directories.length === 0) {
    return emptyState('No directories are published here yet.');
  }
  const rows = sortDirectories(directories).map(directoryRow).join('\n');
  return `      <table class="bd-table">
        <caption class="bd-caption">${escapeHtml(caption)}</caption>
        <thead>
          <tr>
            <th class="bd-cell" scope="col">Directory</th>
            <th class="bd-cell" scope="col">PetroHrys Score</th>
            <th class="bd-cell" scope="col">Domain Rating</th>
            <th class="bd-cell" scope="col">Authority Score</th>
            <th class="bd-cell" scope="col">Estimated traffic</th>
          </tr>
        </thead>
        <tbody data-bd-rows>
${rows}
        </tbody>
      </table>`;
}

// ---------------------------------------------------------------------------
// 6. Directory summary card
// ---------------------------------------------------------------------------

// Only the title is a link. The card is never wrapped in a single anchor, which
// would swallow the nested link and badges.
function directoryCard({ directory, headingLevel = 3 }) {
  const h = headingTag(headingLevel);
  return `      <article class="bd-summary">
        <${h} class="bd-card-title"><a href="${escapeHtml(directory.slug)}/">${escapeHtml(directory.name)}</a></${h}>
        <p class="bd-card-body">${escapeHtml(directory.description)}</p>
${statusBadges(directory)}
      </article>`;
}

// ---------------------------------------------------------------------------
// 14. Pagination
// ---------------------------------------------------------------------------

// A disabled page is a span, never an anchor, so it cannot be focused or
// activated by keyboard.
function pagination({ current, total, basePath }) {
  if (!Number.isInteger(total) || total <= 1) return '';
  const pages = [];
  for (let n = 1; n <= total; n += 1) {
    const href = n === 1 ? basePath : `${basePath}page/${n}/`;
    pages.push(n === current
      ? `        <li><span class="bd-page bd-page--current" aria-current="page">${vh('Page ')}${n}</span></li>`
      : `        <li><a class="bd-page" href="${escapeHtml(href)}">${vh('Page ')}${n}</a></li>`);
  }
  return `      <nav class="bd-pagination" aria-label="Directory pages">
        <ol class="bd-pages">
${pages.join('\n')}
        </ol>
      </nav>`;
}

// ---------------------------------------------------------------------------
// 15. Methodology note
// ---------------------------------------------------------------------------

function methodologyNote() {
  return '      <p class="bd-note">Every directory is checked by hand before publication. Each '
    + 'record stores what the directory accepts, whether listing is free or paid, whether '
    + 'verification or manual review is required, how it links out, and the date it was '
    + 'verified. Nothing is published from an automated crawl, and no value is estimated '
    + 'or inferred.</p>';
}

// ---------------------------------------------------------------------------
// 16. Last-verified / provenance block
// ---------------------------------------------------------------------------

function provenanceBlock(directory) {
  const verified = directory.lastVerified
    ? `<time datetime="${escapeHtml(directory.lastVerified)}">${escapeHtml(directory.lastVerified)}</time>`
    : `<span class="bd-metric bd-metric--empty">Not yet verified</span>`;
  const next = directory.nextVerification
    ? `<time datetime="${escapeHtml(directory.nextVerification)}">${escapeHtml(directory.nextVerification)}</time>`
    : dash();
  return `      <dl class="bd-defs bd-provenance">
        <div class="bd-def">
          <dt class="bd-def-t">Last verified</dt>
          <dd class="bd-def-d">${verified}</dd>
        </div>
        <div class="bd-def">
          <dt class="bd-def-t">Next verification due</dt>
          <dd class="bd-def-d">${next}</dd>
        </div>
      </dl>`;
}

// ---------------------------------------------------------------------------
// 17. External-link CTA
// ---------------------------------------------------------------------------

// An unusable scheme (javascript:, data:, file:, malformed) is never rendered
// as a link. The raw value is shown as text so nothing is silently dropped.
function externalLinkCta({ url, label = 'Visit directory' }) {
  const href = safeHref(url);
  if (!href) {
    return `      <p class="bd-cta bd-cta--unavailable">${escapeHtml(label)}: `
      + `<span class="bd-metric bd-metric--empty">no usable address recorded</span></p>`;
  }
  return `      <p class="bd-cta"><a class="bd-cta-link" href="${escapeHtml(href)}" `
    + `rel="${REL_EXTERNAL}" target="_blank">${escapeHtml(label)}`
    + `${vh(' (opens in a new tab)')}</a></p>`;
}

module.exports = {
  breadcrumbs, pageIntro, countryCard, categoryCard, cardGrid,
  directoryTable, directoryRow, directoryCard, metric, metricsBlock, metricNote,
  statusBadges, prosCons, bestForTags, bulletList, emptyState,
  searchControls, filterControls, sortControls, pagination,
  methodologyNote, provenanceBlock, externalLinkCta,
  FILTERS, VERIFICATION_NOTE, REL_EXTERNAL,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test "scripts/tests/bd-components.test.cjs"`
Expected: PASS, 39 tests

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/bd-components.cjs scripts/tests/bd-components.test.cjs
git commit -m "feat(bd): add accessible bd- component library"
```

---

### Task 7: Page shell renderer

**Files:**
- Create: `scripts/lib/bd-render.cjs`
- Test: `scripts/tests/bd-render.test.cjs`
- Read for reference: `research/index.html` (copy the head/header/footer markup verbatim)

**Interfaces:**
- Consumes: `bd-util.cjs` → `escapeHtml`; `bd-seo.cjs` → `renderJsonLd`; `bd-components.cjs` → `breadcrumbs`
- Produces: `renderPage({ meta, main }): string`, plus `HEADER`, `FOOTER`, `ECO_HEAD`, `ECO_BODY` for tests.

**Renderer contract:**
- **`meta` is a bd-seo builder result, consumed verbatim.** Title, description, canonical, robots, Open Graph, Twitter, breadcrumb trail and JSON-LD all come from one place, so indexability can never drift between the metadata and the page.
- **Shell markup is copied from the live editorial pages** — analytics, fonts, ecosystem-banner markers, header, nav, language switcher and footer. A test reads `research/index.html` and asserts the fragments still match, so upstream drift fails loudly.
- **`msvalidate.01` is deliberately omitted.** On existing pages it still holds an unfilled `PASTE_YOUR_...` placeholder; replicating it across generated pages would be a defect.
- **Breadcrumb comes from the component**, giving `nav > ol` with `aria-label` and one `aria-current="page"`.

- [ ] **Step 1: Write the failing test**

```js
// scripts/tests/bd-render.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { renderPage } = require('../lib/bd-render.cjs');
const seo = require('../lib/bd-seo.cjs');

const COUNTRY = { slug: 'united-states', name: 'United States', titleName: 'the United States' };
const CATEGORY = { slug: 'saas', name: 'SaaS', description: 'Listing sites for subscription software.' };
const DIRECTORY = {
  id: 'us-example', slug: 'example', name: 'Example Directory',
  website: 'https://example.com', description: 'A directory.',
};

const hub = () => renderPage({
  meta: seo.buildHubMeta({
    countries: [{ name: 'United States', path: '/research/business-directories/united-states/' }],
    faqs: [{ q: 'Why?', a: 'Because.' }],
  }),
  main: '<p>Body</p>',
});

const emptyCountry = () => renderPage({
  meta: seo.buildCountryMeta({ country: COUNTRY, categories: [], directories: [] }),
  main: '<p>Body</p>',
});

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr']);
function tagBalance(html) {
  // Strips script contents first: their text is not markup.
  const stripped = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '<script></script>');
  const stack = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\/?)>/g;
  let m;
  while ((m = re.exec(stripped)) !== null) {
    const [, closing, rawName, , selfClose] = m;
    const name = rawName.toLowerCase();
    if (VOID.has(name) || selfClose || name === '!doctype') continue;
    if (closing) {
      const open = stack.pop();
      assert.strictEqual(open, name, `</${name}> closes <${open}>`);
    } else {
      stack.push(name);
    }
  }
  return stack;
}

test('emits a complete html document', () => {
  const html = hub();
  assert.ok(html.startsWith('<!DOCTYPE html>'));
  assert.ok(html.includes('<html lang="en">'));
  assert.ok(html.trimEnd().endsWith('</html>'));
});

test('the document is tag-balanced', () => {
  assert.deepStrictEqual(tagBalance(hub()), []);
  assert.deepStrictEqual(tagBalance(emptyCountry()), []);
});

test('canonical comes from the seo builder and uses the www origin', () => {
  assert.ok(hub().includes('<link rel="canonical" href="https://www.petrohrys.com/research/business-directories/">'));
});

test('no apex-domain url appears anywhere in the document', () => {
  for (const html of [hub(), emptyCountry()]) {
    assert.ok(!/https:\/\/petrohrys\.com/.test(html), 'apex url leaked');
  }
});

test('robots is emitted only when the builder marks the page noindex', () => {
  assert.ok(!hub().includes('name="robots"'), 'hub must be indexable');
  assert.ok(emptyCountry().includes('<meta name="robots" content="noindex,follow">'));
});

test('title and description come from the builder', () => {
  const html = hub();
  assert.ok(html.includes('<title>Business Directories — Petro Hrys</title>'));
  assert.ok(/<meta name="description" content="A country-by-country research index/.test(html));
});

test('all Open Graph and Twitter tags are present', () => {
  const html = hub();
  for (const tag of ['og:title', 'og:description', 'og:url', 'og:type', 'og:site_name', 'og:image',
    'twitter:card', 'twitter:site', 'twitter:title', 'twitter:description', 'twitter:image']) {
    assert.ok(html.includes(`"${tag}"`), `missing ${tag}`);
  }
});

test('loads the site stylesheet and the section stylesheet, in that order', () => {
  const html = hub();
  const site = html.indexOf('/css/petrohrys.css');
  const section = html.indexOf('/css/business-directories.css');
  assert.ok(site > -1 && section > -1);
  assert.ok(site < section, 'section styles must come after the site styles');
});

test('never contains the unfilled bing verification placeholder', () => {
  assert.ok(!hub().includes('PASTE_YOUR_BING_VERIFICATION_CODE_HERE'));
  assert.ok(!hub().includes('msvalidate.01'));
});

test('reuses the site nav and adds exactly one Research Center item per list', () => {
  const html = hub();
  assert.strictEqual((html.match(/class="nav-primary"/g) || []).length, 2, 'desktop + mobile');
  assert.strictEqual((html.match(/>Research Center</g) || []).length, 2);
  assert.ok(html.includes('href="/work/">Work<'));
  assert.ok(html.includes('>Research &amp; Writing<'));
  assert.ok(html.includes('href="/about/">About<'));
});

test('the language switcher is reproduced unchanged', () => {
  const html = hub();
  assert.strictEqual((html.match(/class="nav-lang"/g) || []).length, 2);
  for (const lang of ['>EN<', '>ES<', '>FR<', '>DE<']) {
    assert.ok(html.includes(lang), `missing ${lang}`);
  }
});

test('includes the ecosystem banner markers and markup', () => {
  const html = hub();
  assert.ok(html.includes('helperg-eco:head:start'));
  assert.ok(html.includes('helperg-eco:head:end'));
  assert.ok(html.includes('helperg-eco:body:start'));
  assert.ok(html.includes('helperg-eco:body:end'));
  assert.ok(html.includes('data-helperg-eco'));
});

test('includes the skip link and a main landmark', () => {
  const html = hub();
  assert.ok(html.includes('<a class="skip" href="#main">Skip to content</a>'));
  assert.ok(html.includes('<main id="main">'));
});

test('renders the breadcrumb component with a labelled nav', () => {
  const html = hub();
  assert.ok(html.includes('aria-label="Breadcrumb"'));
  assert.ok(html.includes('<ol class="bd-crumbs">'));
  assert.ok(html.includes('aria-current="page">Business Directories<'));
});

test('the breadcrumb trail matches the page depth', () => {
  const html = renderPage({
    meta: seo.buildCategoryMeta({ country: COUNTRY, category: CATEGORY, directories: [DIRECTORY] }),
    main: '<p>x</p>',
  });
  const crumbs = html.match(/<li class="bd-crumb">/g) || [];
  assert.strictEqual(crumbs.length, 5);
  assert.ok(html.includes('aria-current="page">SaaS<'));
});

test('JSON-LD is embedded and parses', () => {
  const html = hub();
  const match = html.match(/<script type="application\/ld\+json">\n([\s\S]*?)\n  <\/script>/);
  assert.ok(match, 'no ld+json block found');
  const raw = match[1].replace(/\\u003c/g, '<').replace(/\\u003e/g, '>');
  const parsed = JSON.parse(raw);
  assert.strictEqual(parsed['@context'], 'https://schema.org');
  assert.ok(Array.isArray(parsed['@graph']));
});

test('a script breakout in page data cannot escape the JSON-LD block', () => {
  const html = renderPage({
    meta: seo.buildDirectoryMeta({
      country: COUNTRY, category: CATEGORY,
      directory: { ...DIRECTORY, name: '</script><img src=x onerror=alert(1)>' },
    }),
    main: '<p>x</p>',
  });
  assert.ok(!html.includes('</script><img'));
  assert.deepStrictEqual(tagBalance(html), []);
});

test('the client script is deferred and loaded once', () => {
  const html = hub();
  assert.strictEqual((html.match(/business-directories\.js/g) || []).length, 1);
  assert.ok(html.includes('<script src="/js/business-directories.js" defer></script>'));
});

test('the RSS feed is advertised', () => {
  assert.ok(hub().includes('rel="alternate" type="application/rss+xml"'));
});

test('the main content is inserted verbatim', () => {
  const html = renderPage({
    meta: seo.buildHubMeta({ countries: [] }),
    main: '<section class="bd-section"><h2>Marker</h2></section>',
  });
  assert.ok(html.includes('<section class="bd-section"><h2>Marker</h2></section>'));
});

test('rendering is deterministic', () => {
  const runs = new Set(Array.from({ length: 20 }, hub));
  assert.strictEqual(runs.size, 1);
});

test('no build-time timestamp is embedded', () => {
  const html = hub();
  const withoutAnalytics = html.replace(/new Date\(\)/g, '');
  assert.ok(!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(withoutAnalytics));
});

test('exactly one h1 is present, from the page main', () => {
  const html = renderPage({
    meta: seo.buildHubMeta({ countries: [] }),
    main: '<article class="page-hero"><h1>Business Directories</h1></article>',
  });
  assert.strictEqual((html.match(/<h1[ >]/g) || []).length, 1);
});

test('the shell markup matches the live editorial pages', () => {
  const live = fs.readFileSync(path.join(__dirname, '..', '..', 'research', 'index.html'), 'utf8');
  const html = hub();
  for (const fragment of [
    '<a href="/" class="wordmark">Petro Hrys</a>',
    '<ul class="nav-lang" aria-label="Language">',
    '<details class="nav-mobile">',
    '<p class="footer-bottom">&copy; 2026 Petro Hrys</p>',
    '<link rel="stylesheet" href="/css/petrohrys.css">',
  ]) {
    assert.ok(live.includes(fragment), `fixture drift: live page lacks ${fragment}`);
    assert.ok(html.includes(fragment), `rendered page lacks ${fragment}`);
  }
});

test('the section nav item claims section, not page', () => {
  // Generated pages sit inside the Research Center but are never /research/,
  // so aria-current="page" would be a false claim about this link's target.
  const html = hub();
  assert.ok(html.includes('<a href="/research/" aria-current="true">Research Center</a>'));
  assert.ok(!html.includes('href="/research/" aria-current="page"'));
});

test('a footer link to the current page is marked aria-current', () => {
  // The hub's footer links to the hub. The site marks self-links this way
  // rather than leaving an unannotated loop.
  const html = hub();
  assert.ok(html.includes('<a href="/research/business-directories/" aria-current="page">'));
});

test('a footer link to a different page is not marked', () => {
  const html = emptyCountry();
  assert.ok(html.includes('<a href="/research/business-directories/">Business Directories</a>'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test "scripts/tests/bd-render.test.cjs"`
Expected: FAIL — `Cannot find module '../lib/bd-render.cjs'`

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/bd-render.cjs
'use strict';
const { escapeHtml } = require('./bd-util.cjs');
const { renderJsonLd } = require('./bd-seo.cjs');
const { breadcrumbs } = require('./bd-components.cjs');

// Copied verbatim from the existing editorial pages so the new section is
// byte-comparable with the rest of the site. The msvalidate.01 meta is
// deliberately omitted: on existing pages it still holds an unfilled
// PASTE_YOUR_... placeholder, and replicating that would be a defect.
const ANALYTICS = `  <script id="cookieyes" type="text/javascript" src="https://cdn-cookieyes.com/client_data/af075fab2c66644b181224ee/script.js"></script>
  <!-- WebmasterID analytics — consent-gated via CookieYes (analytics category); fires only after consent -->
  <script id="webmasterid-tracker" type="text/plain" data-cookieyes="cookieyes-analytics" defer src="https://webmasterid.com/tracker.iife.min.js" data-wmid="wm_bktqqtd7heom5nkl" data-endpoint="https://webmasterid-ingest-api.vercel.app/api/events"></script>
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-4RE6YCJZBD"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-4RE6YCJZBD');
  </script>`;

const FONTS = `  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&family=JetBrains+Mono:wght@500&family=Source+Serif+4:opsz,wght@8..60,400;8..60,500&display=swap" rel="stylesheet">`;

const ECO_HEAD = `<!-- helperg-eco:head:start -->
  <link rel="stylesheet" href="/css/ecosystem-banner.css">
  <script src="/js/ecosystem-registry.js" defer></script>
  <script src="/js/ecosystem-config.js" defer></script>
  <script src="/js/ecosystem-banner.js" defer></script>
<!-- helperg-eco:head:end -->`;

const ECO_BODY = `<!-- helperg-eco:body:start -->
<nav class="helperg-eco" aria-label="HELPERG Ecosystem" data-helperg-eco>
  <div class="eco-bar">
    <a class="eco-brand" href="https://helperg.com">
      <span class="eco-brand-mark" aria-hidden="true"></span>
      <span class="eco-brand-text">HELPERG Ecosystem</span>
    </a>
    <ul class="eco-timeline">
        <li><a class="eco-item" href="https://helperg.com">HELPERG</a></li>
        <li><a class="eco-item eco-item--self" href="/" aria-current="page">Petro Hrys<span class="eco-vh"> — Current site</span></a></li>
        <li><a class="eco-item" href="https://www.webmasterid.com">WebmasterID</a></li>
        <li><a class="eco-item" href="https://www.cashworkspace.com">Cash Workspace</a></li>
        <li><a class="eco-item" href="https://geobusinessiq.com">GeoBusinessIQ</a></li>
        <li><a class="eco-item" href="https://globalcityintelligence.com">Global City Intelligence</a></li>
    </ul>
    <a class="eco-explore" href="https://helperg.com">Explore all products</a>
  </div>
</nav>
<!-- helperg-eco:body:end -->`;

// Existing items are reproduced exactly; Research Center is the single addition.
// It carries aria-current="true" rather than "page": generated pages live inside
// the Research Center section but are never /research/ itself, and "page" would
// claim this link points at the document you are reading.
const NAV_ITEMS = (indent) => [
  '<li><a href="/work/">Work</a></li>',
  '<li><a href="/research/" aria-current="true">Research Center</a></li>',
  '<li><a href="/writing/">Research &amp; Writing</a></li>',
  '<li><a href="/about/">About</a></li>',
].map((item) => `${indent}${item}`).join('\n');

const LANGS = (indent) => [
  '<li><a href="/">EN</a></li>',
  '<li><a href="/es/">ES</a></li>',
  '<li><a href="/fr/">FR</a></li>',
  '<li><a href="/de/">DE</a></li>',
].map((item) => `${indent}${item}`).join('\n');

const HEADER = `  <header role="banner">
    <nav aria-label="Primary">
      <a href="/" class="wordmark">Petro Hrys</a>
      <ul class="nav-primary">
${NAV_ITEMS('        ')}
      </ul>
      <ul class="nav-lang" aria-label="Language">
${LANGS('        ')}
      </ul>
      <details class="nav-mobile">
        <summary>Menu</summary>
        <div class="nav-mobile-panel">
          <ul class="nav-primary">
${NAV_ITEMS('            ')}
          </ul>
          <ul class="nav-lang" aria-label="Language">
${LANGS('            ')}
          </ul>
        </div>
      </details>
    </nav>
  </header>`;

const FOOTER = (currentPath) => `  <footer role="contentinfo">
    <div class="footer-grid">
      <section id="footer-tools">
        <h3>Products</h3>
        <ul>
          <li><a href="/webmasterid/">WebmasterID</a></li>
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
          <li><a href="/research/business-directories/"${currentPath === '/research/business-directories/' ? ' aria-current="page"' : ''}>Business Directories</a></li>
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
  </footer>`;

function metaTag(property, content, kind = 'property') {
  return `  <meta ${kind}="${escapeHtml(property)}" content="${escapeHtml(content)}">`;
}

// Takes a builder result from bd-seo verbatim, so indexability, canonical, and
// structured data are decided in exactly one place.
function renderPage({ meta, main }) {
  const robotsTag = meta.robots
    ? `\n  <meta name="robots" content="${escapeHtml(meta.robots)}">`
    : '';

  const social = [
    metaTag('og:title', meta.openGraph.title),
    metaTag('og:description', meta.openGraph.description),
    metaTag('og:url', meta.openGraph.url),
    metaTag('og:type', meta.openGraph.type),
    metaTag('og:site_name', meta.openGraph.siteName),
    metaTag('og:image', meta.openGraph.image),
    metaTag('twitter:card', meta.twitter.card, 'name'),
    metaTag('twitter:site', meta.twitter.site, 'name'),
    metaTag('twitter:title', meta.twitter.title, 'name'),
    metaTag('twitter:description', meta.twitter.description, 'name'),
    metaTag('twitter:image', meta.twitter.image, 'name'),
  ].join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
${ANALYTICS}
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>${escapeHtml(meta.fullTitle)}</title>
  <meta name="description" content="${escapeHtml(meta.description)}">${robotsTag}

${social}

  <link rel="canonical" href="${escapeHtml(meta.canonical)}">
  <link rel="sitemap" type="application/xml" href="https://www.petrohrys.com/sitemap.xml">
  <link rel="alternate" type="application/rss+xml" title="Business Directories — Petro Hrys" href="https://www.petrohrys.com/research/business-directories/feed.xml">
  <link rel="icon" href="/images/logo-red.svg">

${FONTS}
  <link rel="stylesheet" href="/css/petrohrys.css">
  <link rel="stylesheet" href="/css/business-directories.css">

${renderJsonLd(meta.jsonLd)}
${ECO_HEAD}
</head>
<body>
  <a class="skip" href="#main">Skip to content</a>
${ECO_BODY}

${HEADER}

  <main id="main">
${breadcrumbs(meta.breadcrumbTrail)}

${main}
  </main>

${FOOTER(meta.canonicalPath)}
  <script src="/js/business-directories.js" defer></script>
</body>
</html>
`;
}

module.exports = { renderPage, HEADER, FOOTER, ECO_HEAD, ECO_BODY };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test "scripts/tests/bd-render.test.cjs"`
Expected: PASS, 27 tests

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/bd-render.cjs scripts/tests/bd-render.test.cjs
git commit -m "feat(bd): add page shell renderer driven by SEO metadata"
```

---

### Task 8: Feeds

**Files:**
- Create: `scripts/lib/bd-feeds.cjs`
- Test: `scripts/tests/bd-feeds.test.cjs`

**Interfaces:**
- Consumes: `bd-util.cjs` → `escapeXml`; `bd-seo.cjs` → `absoluteUrl`
- Produces: `renderSitemap(entries): string` where `entries` is `[{path, lastmod?}]`; `renderRss(items): string` where `items` is `[{title, path, description, pubDate}]`

- [ ] **Step 1: Write the failing test**

```js
// scripts/tests/bd-feeds.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { renderSitemap, renderRss } = require('../lib/bd-feeds.cjs');

test('sitemap emits a valid xml declaration and urlset', () => {
  const xml = renderSitemap([{ path: '/research/business-directories/' }]);
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(xml.includes('http://www.sitemaps.org/schemas/sitemap/0.9'));
  assert.ok(xml.trimEnd().endsWith('</urlset>'));
});

test('sitemap urls use the www origin', () => {
  const xml = renderSitemap([{ path: '/research/business-directories/' }]);
  assert.ok(xml.includes('<loc>https://www.petrohrys.com/research/business-directories/</loc>'));
  assert.ok(!xml.includes('<loc>https://petrohrys.com/'));
});

test('sitemap with no entries is still valid and contains no url elements', () => {
  const xml = renderSitemap([]);
  assert.ok(xml.includes('<urlset'));
  assert.ok(!xml.includes('<url>'));
});

test('sitemap emits lastmod only when supplied', () => {
  assert.ok(renderSitemap([{ path: '/a/', lastmod: '2026-08-01' }]).includes('<lastmod>2026-08-01</lastmod>'));
  assert.ok(!renderSitemap([{ path: '/a/' }]).includes('<lastmod>'));
});

test('rss with no items is a valid empty channel', () => {
  const xml = renderRss([]);
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(xml.includes('<channel>'));
  assert.ok(!xml.includes('<item>'));
  assert.ok(xml.trimEnd().endsWith('</rss>'));
});

test('rss escapes ampersands in titles', () => {
  const xml = renderRss([{
    title: 'A & B', path: '/a/', description: 'x', pubDate: 'Sat, 01 Aug 2026 00:00:00 GMT',
  }]);
  assert.ok(xml.includes('A &amp; B'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/tests/bd-feeds.test.cjs`
Expected: FAIL — `Cannot find module '../lib/bd-feeds.cjs'`

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/bd-feeds.cjs
'use strict';
const { escapeXml } = require('./bd-util.cjs');
const { absoluteUrl } = require('./bd-seo.cjs');

const FEED_PATH = '/research/business-directories/feed.xml';

function renderSitemap(entries) {
  const urls = entries.map((entry) => {
    const lastmod = entry.lastmod ? `\n    <lastmod>${escapeXml(entry.lastmod)}</lastmod>` : '';
    return `  <url>\n    <loc>${escapeXml(absoluteUrl(entry.path))}</loc>${lastmod}\n  </url>`;
  }).join('\n');
  const body = urls ? `\n${urls}\n` : '\n';
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>
`;
}

function renderRss(items) {
  const entries = items.map((item) => `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(absoluteUrl(item.path))}</link>
      <guid isPermaLink="true">${escapeXml(absoluteUrl(item.path))}</guid>
      <description>${escapeXml(item.description)}</description>
      <pubDate>${escapeXml(item.pubDate)}</pubDate>
    </item>`).join('\n');
  const body = entries ? `\n${entries}` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Business Directories — Petro Hrys</title>
    <link>${escapeXml(absoluteUrl('/research/business-directories/'))}</link>
    <atom:link href="${escapeXml(absoluteUrl(FEED_PATH))}" rel="self" type="application/rss+xml"/>
    <description>Manually verified business directory research from PetroHrys.com.</description>
    <language>en</language>${body}
  </channel>
</rss>
`;
}

module.exports = { renderSitemap, renderRss, FEED_PATH };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/tests/bd-feeds.test.cjs`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/bd-feeds.cjs scripts/tests/bd-feeds.test.cjs
git commit -m "feat(bd): add sitemap and RSS emitters"
```

---

### Task 9: Section stylesheet and client script

**Files:**
- Create: `css/business-directories.css`
- Create: `js/business-directories.js`
- Test: `scripts/tests/bd-assets.test.cjs`

**Interfaces:**
- Produces `css/business-directories.css` and `js/business-directories.js`. No module exports.

**Asset contract:**
- The stylesheet consumes **only** existing custom properties, declares no raw colour or font literal, redefines no existing site selector, and styles every `bd-` class the components emit — enforced by a test that renders all components and diffs the class sets.
- The client script performs **no** network request, writes **no** markup (`textContent` only), binds handlers with `addEventListener`, and mirrors `bd-sort`'s comparator exactly — including avoiding `localeCompare`, so client order matches server order on every platform.
- Tests cross-check that every `data-bd-*` attribute the script reads is actually emitted by a component, and that the wrappers it reveals are the ones rendered `hidden`.
- The script adds an `aria-live` status region announcing the visible count, because filtering silently changes what is on screen.

- [ ] **Step 1: Write the failing test**

```js
// scripts/tests/bd-assets.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const components = require('../lib/bd-components.cjs');

const root = path.resolve(__dirname, '..', '..');
const css = () => fs.readFileSync(path.join(root, 'css', 'business-directories.css'), 'utf8');
const js = () => fs.readFileSync(path.join(root, 'js', 'business-directories.js'), 'utf8');
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '');

const DIR = {
  id: 'a', slug: 'a', name: 'A', description: 'd', website: 'https://a.example',
  petroHrysScore: null, domainRating: null, authorityScore: null, estimatedTraffic: null,
  free: true, paid: null, verificationRequired: null, acceptsSaaS: null,
  acceptsStartups: null, acceptsAI: null, lastVerified: null, nextVerification: null,
  recommendedIndustries: [], pros: [], cons: [], metricsProvenance: {},
};

const RENDERED = () => [
  components.breadcrumbs([{ name: 'H', path: '/' }, { name: 'X', path: '/x/' }]),
  components.cardGrid([components.countryCard({ name: 'A', path: '/a/' }),
    components.countryCard({ name: 'B', path: '/b/', pending: true })]),
  components.cardGrid([components.categoryCard({ name: 'C', path: '/c/', description: 'd' })]),
  components.directoryTable({ directories: [DIR] }),
  components.directoryCard({ directory: DIR }),
  components.metricsBlock(DIR), components.statusBadges(DIR),
  components.prosCons({ pros: ['p'], cons: ['c'] }), components.bestForTags(['x']),
  components.emptyState('e'), components.searchControls({}), components.filterControls({}),
  components.sortControls({}), components.pagination({ current: 1, total: 2, basePath: '/x/' }),
  components.methodologyNote(), components.provenanceBlock(DIR),
  components.externalLinkCta({ url: 'https://a.example' }),
  '<p class="bd-status"></p>',
].join('\n');

// --- stylesheet -------------------------------------------------------------

test('every selector in the section stylesheet is bd- namespaced', () => {
  for (const block of stripComments(css()).split('}')) {
    const selector = block.split('{')[0].trim();
    if (!selector || selector.startsWith('@')) continue;
    for (const part of selector.split(',')) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      assert.ok(trimmed.includes('.bd-'), `selector is not bd- namespaced: ${trimmed}`);
    }
  }
});

test('the stylesheet declares no raw hex colour', () => {
  assert.strictEqual(css().match(/#[0-9a-fA-F]{3,8}\b/g), null);
});

test('the stylesheet declares no rgb/hsl colour literal', () => {
  assert.strictEqual(stripComments(css()).match(/\b(rgb|rgba|hsl|hsla)\s*\(/g), null);
});

test('every font declaration uses an existing token', () => {
  for (const decl of stripComments(css()).match(/font-(family|size)\s*:[^;]+;/g) || []) {
    assert.ok(decl.includes('var(--'), `font declaration must use a token: ${decl}`);
  }
});

// Matches only class tokens in selector position. A bare /\.[\w-]+/ also picks
// up file extensions inside comments and url() values, which is how ".css"
// previously showed up as a "class".
const CLASS_RE = /(?:^|[\s,>+~(])\.([a-zA-Z][a-zA-Z0-9_-]*)/g;
const classesIn = (text) => new Set(
  [...stripComments(text).matchAll(CLASS_RE)].map((m) => m[1]));

test('the stylesheet never redefines an existing site selector', () => {
  const existing = classesIn(fs.readFileSync(path.join(root, 'css', 'petrohrys.css'), 'utf8'));
  for (const cls of classesIn(css())) {
    assert.ok(!existing.has(cls), `section CSS reuses existing site class: .${cls}`);
  }
});

test('every bd- class the components emit is styled', () => {
  const emitted = new Set();
  for (const match of RENDERED().matchAll(/class="([^"]+)"/g)) {
    for (const cls of match[1].split(/\s+/)) if (cls.startsWith('bd-')) emitted.add(cls);
  }
  const styled = new Set((css().match(/\.bd-[a-zA-Z0-9_-]+/g) || []).map((s) => s.slice(1)));
  const missing = [...emitted].filter((cls) => !styled.has(cls));
  assert.deepStrictEqual(missing, [], `unstyled classes: ${missing.join(', ')}`);
});

test('the visually hidden helper is defined', () => {
  assert.ok(/\.bd-vh\s*\{/.test(css()));
  assert.ok(css().includes('position: absolute'));
});

// --- client script ----------------------------------------------------------

test('the client script performs no network request', () => {
  const source = js();
  for (const forbidden of ['fetch(', 'XMLHttpRequest', 'import(', 'WebSocket',
    'navigator.sendBeacon', 'EventSource']) {
    assert.ok(!source.includes(forbidden), `client script must not use ${forbidden}`);
  }
});

test('the client script writes no markup and uses no eval', () => {
  const source = js();
  for (const forbidden of ['innerHTML', 'outerHTML', 'insertAdjacentHTML',
    'document.write', 'eval(', 'new Function']) {
    assert.ok(!source.includes(forbidden), `client script must not use ${forbidden}`);
  }
  assert.ok(source.includes('textContent'), 'text updates must go through textContent');
});

test('the client script binds handlers with addEventListener only', () => {
  const source = stripComments(js());
  assert.ok(source.includes('addEventListener'));
  assert.ok(!/\.on(click|change|input|load)\s*=/.test(source), 'no on* property assignment');
});

test('the client script avoids locale-dependent ordering', () => {
  const source = stripComments(js());
  assert.ok(!/\.localeCompare\s*\(/.test(source));
  assert.ok(!/toLocale(Lower|Upper)Case\s*\(/.test(source));
});

test('the client sort keys match the server sort keys exactly', () => {
  const { SORT_KEYS } = require('../lib/bd-sort.cjs');
  const source = js();
  for (const key of SORT_KEYS) {
    assert.ok(source.includes(`'${key}'`), `client script is missing sort key ${key}`);
  }
});

test('every data attribute the client reads is emitted by the components', () => {
  const html = components.directoryTable({ directories: [DIR] })
    + components.searchControls({}) + components.filterControls({}) + components.sortControls({});
  const read = new Set();
  for (const m of js().matchAll(/'(data-bd-[a-z-]+)'/g)) read.add(m[1]);
  for (const m of js().matchAll(/\[(data-bd-[a-z-]+)\]/g)) read.add(m[1]);
  // Dynamic reads are built as 'data-bd-' + suffix, so resolve the suffix from
  // the call site rather than scraping the concatenation itself.
  for (const m of js().matchAll(/num\([a-z.]+, '([a-z]+)'\)/g)) read.add(`data-bd-${m[1]}`);
  const missing = [...read].filter((attr) => !html.includes(attr));
  assert.deepStrictEqual(missing, [], `client reads attributes the components never emit: ${missing.join(', ')}`);
});

test('the filter fields the client reads are all rendered as row attributes', () => {
  const row = components.directoryTable({ directories: [DIR] });
  for (const filter of components.FILTERS) {
    assert.ok(row.includes(`data-bd-${filter.field.toLowerCase()}=`), `row lacks ${filter.field}`);
  }
});

test('the script reveals the control wrappers the components render hidden', () => {
  const source = js();
  for (const wrap of ['data-bd-sort-wrap', 'data-bd-filter-wrap', 'data-bd-search-wrap']) {
    assert.ok(source.includes(wrap), `script never reveals ${wrap}`);
    assert.ok(RENDERED().includes(wrap), `components never render ${wrap}`);
  }
});

test('the script exits cleanly when there is no table', () => {
  const source = js();
  assert.ok(/if \(!tbody\) return;/.test(source), 'must no-op without a directory table');
  assert.ok(/if \(!rows\.length\) return;/.test(source), 'must no-op with zero rows');
});

test('filtering announces the visible count for assistive technology', () => {
  const source = js();
  assert.ok(source.includes("setAttribute('role', 'status')"));
  assert.ok(source.includes("aria-live"));
  assert.ok(source.includes('directories shown'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test "scripts/tests/bd-assets.test.cjs"`
Expected: FAIL — `ENOENT ... css/business-directories.css`

- [ ] **Step 3: Write `css/business-directories.css`**

```css
/* Business Directories — Research Center.
   Consumes design tokens from petrohrys.css only. Declares no raw colour,
   font, or spacing literal, and redefines no existing site selector. */

.bd-vh {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

.bd-section { margin-top: var(--s-6); }

.bd-note {
  color: var(--text-3);
  font-size: var(--fs-sm);
  border-left: var(--rule-w) solid var(--rule);
  padding-left: var(--s-3);
  margin-top: var(--s-4);
}

.bd-empty {
  color: var(--text-2);
  background: var(--surface-blue);
  border: var(--rule-w) solid var(--rule);
  border-radius: var(--s-0);
  padding: var(--s-4);
}

/* Breadcrumb: inherits colour and size from the site's .breadcrumb class,
   so this only resets the list semantics. */
.bd-breadcrumb .bd-crumbs {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
}

.bd-breadcrumb .bd-crumb { display: inline-flex; align-items: center; }

.bd-grid {
  list-style: none;
  padding: 0;
  margin: var(--s-4) 0 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
  gap: var(--s-3);
}

.bd-card {
  border-top: var(--rule-w) solid var(--rule);
  padding-top: var(--s-2);
}

.bd-card-title {
  font-family: var(--ff-sans);
  font-size: var(--fs-md);
  margin: 0;
}

.bd-card-title a { color: var(--blue); }
.bd-card-title a:hover { color: var(--blue-strong); }

.bd-card-body {
  color: var(--text-2);
  font-size: var(--fs-sm);
  margin: var(--s-1) 0 0;
}

.bd-pending { color: var(--text-3); }

.bd-tag {
  color: var(--text-3);
  font-size: var(--fs-xs);
  font-family: var(--ff-mono);
}

.bd-summary {
  border-top: var(--rule-w) solid var(--rule);
  padding-top: var(--s-3);
  margin-top: var(--s-4);
}

.bd-controls { display: flex; flex-wrap: wrap; gap: var(--s-3); }

.bd-control {
  margin-top: var(--s-4);
  border: 0;
  padding: 0;
}

.bd-label {
  display: block;
  color: var(--text-2);
  font-size: var(--fs-sm);
  margin-bottom: var(--s-0);
  padding: 0;
}

.bd-select,
.bd-input {
  font-family: var(--ff-sans);
  font-size: var(--fs-sm);
  color: var(--text);
  background: var(--surface);
  border: var(--rule-w) solid var(--rule);
  border-radius: var(--s-0);
  padding: var(--s-1) var(--s-2);
}

.bd-select:focus-visible,
.bd-input:focus-visible,
.bd-checks input:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.bd-checks { display: flex; flex-wrap: wrap; gap: var(--s-3); }

.bd-check {
  display: inline-flex;
  align-items: center;
  gap: var(--s-0);
  color: var(--text-2);
  font-size: var(--fs-sm);
}

.bd-status {
  color: var(--text-3);
  font-size: var(--fs-sm);
  margin-top: var(--s-2);
}

.bd-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: var(--s-4);
  font-size: var(--fs-sm);
}

.bd-caption {
  text-align: left;
  color: var(--text-3);
  font-size: var(--fs-xs);
  padding-bottom: var(--s-1);
}

.bd-cell {
  text-align: left;
  padding: var(--s-2);
  border-bottom: var(--rule-w) solid var(--rule);
  vertical-align: top;
  font-weight: 400;
}

.bd-row:hover { background: var(--hover-tint); }

.bd-metric { color: var(--text); display: block; }
.bd-metric--empty { color: var(--text-3); }

.bd-metric-source {
  display: block;
  color: var(--text-3);
  font-size: var(--fs-xs);
  font-family: var(--ff-mono);
}

.bd-defs {
  margin: var(--s-4) 0 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
  gap: var(--s-3);
}

.bd-def {
  border-top: var(--rule-w) solid var(--rule);
  padding-top: var(--s-1);
}

.bd-def-t { color: var(--text-3); font-size: var(--fs-xs); }
.bd-def-d { margin: 0; color: var(--text); }

/* Status is always spelled out in the badge text; the border and tint are
   decoration only and never the sole carrier of meaning. */
.bd-badges {
  list-style: none;
  margin: var(--s-3) 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-1);
}

.bd-badge {
  border: var(--rule-w) solid var(--rule);
  border-radius: var(--s-0);
  padding: var(--s-0) var(--s-2);
  font-size: var(--fs-xs);
  color: var(--text-2);
  background: var(--surface);
}

.bd-badge[data-bd-state="verified"] { background: var(--surface-green); color: var(--green); }
.bd-badge[data-bd-state="unknown"] { color: var(--text-3); }

.bd-chips {
  list-style: none;
  margin: var(--s-3) 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-1);
}

.bd-chip {
  border: var(--rule-w) solid var(--rule);
  border-radius: var(--s-0);
  padding: var(--s-0) var(--s-2);
  font-size: var(--fs-xs);
  color: var(--text-2);
}

.bd-list {
  color: var(--text-2);
  margin: var(--s-3) 0 0;
  padding-left: var(--s-4);
}

.bd-proscons { margin-top: var(--s-4); }

.bd-subhead {
  font-family: var(--ff-sans);
  font-size: var(--fs-md);
  margin: var(--s-4) 0 0;
}

.bd-pagination { margin-top: var(--s-5); }

.bd-pages {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-1);
  margin: 0;
  padding: 0;
}

.bd-page {
  display: inline-block;
  color: var(--blue);
  border: var(--rule-w) solid var(--rule);
  border-radius: var(--s-0);
  padding: var(--s-0) var(--s-2);
  font-size: var(--fs-sm);
}

.bd-page--current {
  color: var(--text-3);
  background: var(--bg-soft);
}

.bd-cta { margin-top: var(--s-4); }

.bd-cta-link {
  color: var(--blue);
  font-family: var(--ff-mono);
  font-size: var(--fs-sm);
}

.bd-cta-link:hover { color: var(--blue-strong); }

.bd-cta--unavailable { color: var(--text-3); font-size: var(--fs-sm); }

.bd-provenance { margin-top: var(--s-4); }

@media (max-width: 40rem) {
  .bd-table { display: block; overflow-x: auto; }
}
```

- [ ] **Step 4: Write `js/business-directories.js`**

```js
/* Business Directories — progressive enhancement only.
   Reorders and hides table rows that are already prerendered. Performs no
   network request of any kind, and writes only textContent, never markup. */
(function () {
  'use strict';

  var tbody = document.querySelector('[data-bd-rows]');
  if (!tbody) return;

  var rows = Array.prototype.slice.call(tbody.querySelectorAll('.bd-row'));
  if (!rows.length) return;

  var sortSelect = document.querySelector('[data-bd-sort]');
  var searchInput = document.querySelector('[data-bd-search]');
  var filters = Array.prototype.slice.call(document.querySelectorAll('[data-bd-filter]'));

  // Reveal the controls only once the behaviour behind them exists. Without
  // JavaScript they stay hidden and the prerendered table is complete.
  ['[data-bd-sort-wrap]', '[data-bd-filter-wrap]', '[data-bd-search-wrap]'].forEach(function (sel) {
    var el = document.querySelector(sel);
    if (el) el.hidden = false;
  });

  // Filtering changes what is visible, so announce the result count.
  var status = document.createElement('p');
  status.className = 'bd-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  var table = tbody.closest ? tbody.closest('table') : null;
  if (table && table.parentNode) table.parentNode.insertBefore(status, table);

  function num(row, key) {
    var raw = row.getAttribute('data-bd-' + key);
    return raw === '' || raw === null ? null : Number(raw);
  }

  function nullLastDesc(a, b) {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return b - a;
  }

  // Mirrors bd-sort.cjs exactly: case-folded compare with a code-unit tiebreak.
  // localeCompare is avoided so the client order matches the server order on
  // every platform.
  function byName(a, b) {
    var an = a.getAttribute('data-bd-name') || '';
    var bn = b.getAttribute('data-bd-name') || '';
    if (an < bn) return -1;
    if (an > bn) return 1;
    return 0;
  }

  var COMPARATORS = {
    'default': function (a, b) {
      return nullLastDesc(num(a, 'score'), num(b, 'score'))
        || nullLastDesc(num(a, 'dr'), num(b, 'dr'))
        || byName(a, b);
    },
    'domain-rating': function (a, b) { return nullLastDesc(num(a, 'dr'), num(b, 'dr')) || byName(a, b); },
    'authority-score': function (a, b) { return nullLastDesc(num(a, 'as'), num(b, 'as')) || byName(a, b); },
    'traffic': function (a, b) { return nullLastDesc(num(a, 'traffic'), num(b, 'traffic')) || byName(a, b); },
    'alphabetical': byName
  };

  function apply() {
    var key = sortSelect ? sortSelect.value : 'default';
    var compare = COMPARATORS[key] || COMPARATORS['default'];

    // Stability by explicit index tiebreak, matching the server comparator.
    var decorated = rows.map(function (row, index) { return { row: row, index: index }; });
    decorated.sort(function (a, b) { return compare(a.row, b.row) || (a.index - b.index); });
    decorated.forEach(function (entry) { tbody.appendChild(entry.row); });

    var query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    var active = filters.filter(function (f) { return f.checked; });
    var shown = 0;

    rows.forEach(function (row) {
      var visible = true;
      if (query && (row.getAttribute('data-bd-haystack') || '').indexOf(query) === -1) visible = false;
      active.forEach(function (f) {
        var attr = 'data-bd-' + String(f.getAttribute('data-bd-filter')).toLowerCase();
        if (row.getAttribute(attr) !== '1') visible = false;
      });
      row.hidden = !visible;
      if (visible) shown += 1;
    });

    status.textContent = shown === rows.length
      ? String(rows.length) + ' directories shown'
      : String(shown) + ' of ' + String(rows.length) + ' directories shown';
  }

  if (sortSelect) sortSelect.addEventListener('change', apply);
  if (searchInput) searchInput.addEventListener('input', apply);
  filters.forEach(function (f) { f.addEventListener('change', apply); });

  apply();
})();
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test "scripts/tests/bd-assets.test.cjs"`
Expected: PASS, 17 tests

- [ ] **Step 6: Commit**

```bash
git add css/business-directories.css js/business-directories.js scripts/tests/bd-assets.test.cjs
git commit -m "feat(bd): add section stylesheet and progressive-enhancement script"
```

---

### Task 10: Build script

**Files:**
- Create: `scripts/build-business-directories.cjs`
- Test: `scripts/tests/bd-build.test.cjs`

**Interfaces:**
- Consumes: every `bd-*` library module plus `validateRegistry`/`formatReport`.
- Produces: `buildAll({dataRoot?, outRoot?, dryRun?}) -> { written, removed, pages, staged }`, `pageModel(registry)`, `stageBuild`, `validateStage`, `buildManifest`, `BuildError`, `MANIFEST_FILE`, `SECTION_DIR`.
- CLI: `node scripts/build-business-directories.cjs` builds; `--dry-run` stages and validates without writing.

**Build architecture** — see `docs/superpowers/reviews/2026-08-03-build-architecture-review.md` for the full review and evidence.

Phases, ordered so that every failure mode precedes every mutation:

1. load registry — may throw `RegistryError`
2. `validateRegistry` — the single build gate; `BuildError` if not `ok`
3. page model
4. render every artefact into memory
5. validate the staged output — containment, duplicate paths, duplicate canonicals, duplicate owners, sitemap ⊆ generated, no noindex page in the sitemap
6. materialise into a throwaway temp dir and verify each file round-trips
7. reconcile into the site: write only changed files, delete only previously-manifested files

**Ownership manifest** at `data/business-directories/.build-manifest.json` maps every generated path to the one registry fact that produced it. Pruning deletes a file only if it was in the previous manifest and is absent from the new one, so a hand-authored file inside the section is never touched. A staged path that already exists but is **not** in the manifest aborts the build rather than overwriting it.

**Containment:** any generated path outside `research/business-directories/**` or `sitemap-business-directories.xml` throws.

- [ ] **Step 1: Write the failing test**

```js
// scripts/tests/bd-build.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { buildAll, pageModel, BuildError, MANIFEST_FILE, SECTION_DIR } = require('../build-business-directories.cjs');
const { loadRegistry } = require('../lib/bd-registry.cjs');
const { PATHS } = require('../lib/bd-util.cjs');

const HUB = path.join(SECTION_DIR, 'index.html');
const REF_COUNTRY = path.join(SECTION_DIR, 'united-states', 'index.html');
const REF_CATEGORY = path.join(SECTION_DIR, 'united-states', 'categories', 'general-business', 'index.html');
const SAAS = path.join(SECTION_DIR, 'united-states', 'categories', 'saas', 'index.html');
const DETAIL = path.join(SECTION_DIR, 'united-states', 'ok-dir', 'index.html');
const GERMANY = path.join(SECTION_DIR, 'germany', 'index.html');
const SITEMAP = 'sitemap-business-directories.xml';

function fixture(byCountry = {}) {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bd-d-'));
  const outRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bd-o-'));
  fs.copyFileSync(path.join(PATHS.dataRoot, 'countries.json'), path.join(dataRoot, 'countries.json'));
  fs.copyFileSync(path.join(PATHS.dataRoot, 'categories.json'), path.join(dataRoot, 'categories.json'));
  fs.mkdirSync(path.join(dataRoot, 'directories'));
  fs.mkdirSync(path.join(outRoot, 'data', 'business-directories'), { recursive: true });
  for (const country of JSON.parse(fs.readFileSync(path.join(dataRoot, 'countries.json'), 'utf8'))) {
    writeDirs(dataRoot, country.slug, byCountry[country.slug] || []);
  }
  return { dataRoot, outRoot };
}

function writeDirs(dataRoot, slug, entries) {
  fs.writeFileSync(path.join(dataRoot, 'directories', `${slug}.json`), `${JSON.stringify(entries, null, 2)}\n`);
}

const rec = (over = {}) => ({
  id: 'us-ok', name: 'Ok Directory', slug: 'ok-dir', country: 'united-states',
  category: 'saas', website: 'https://ok.example', description: 'A directory.',
  tier: 'tier1', petroHrysScore: null, domainRating: null, authorityScore: null,
  estimatedTraffic: null, referringDomains: null, free: null, paid: null,
  verificationRequired: null, manualReview: null, acceptsCompanies: null,
  acceptsProducts: null, acceptsSaaS: null, acceptsApps: null, acceptsStartups: null,
  acceptsAI: null, backlinkType: null, robots: null, sitemap: null, indexed: null,
  ssl: null, lastVerified: null, nextVerification: null, httpStatus: null,
  recommendedIndustries: [], pros: [], cons: [], editorNotes: '', metricsProvenance: {},
  ...over,
});

const has = (outRoot, rel) => fs.existsSync(path.join(outRoot, rel));
const read = (outRoot, rel) => fs.readFileSync(path.join(outRoot, rel), 'utf8');

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

const fingerprint = (outRoot) => walk(path.join(outRoot, SECTION_DIR))
  .sort()
  .map((f) => `${path.relative(outRoot, f)}:${crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')}`)
  .join('|');

// --- emission policy --------------------------------------------------------

test('the lean scaffold is exactly three pages when there is no data', () => {
  const { dataRoot, outRoot } = fixture();
  const result = buildAll({ dataRoot, outRoot });
  assert.strictEqual(result.pages, 3);
  assert.ok(has(outRoot, HUB));
  assert.ok(has(outRoot, REF_COUNTRY));
  assert.ok(has(outRoot, REF_CATEGORY));
  assert.ok(!has(outRoot, GERMANY), 'empty non-reference country must not be emitted');
  assert.ok(!has(outRoot, SAAS), 'empty non-reference category must not be emitted');
});

test('the hub is indexable and the empty reference pages are not', () => {
  const { dataRoot, outRoot } = fixture();
  buildAll({ dataRoot, outRoot });
  assert.ok(!read(outRoot, HUB).includes('name="robots"'));
  assert.ok(read(outRoot, REF_COUNTRY).includes('noindex,follow'));
  assert.ok(read(outRoot, REF_CATEGORY).includes('noindex,follow'));
});

test('adding a record emits its country, category and detail pages', () => {
  const { dataRoot, outRoot } = fixture({ 'united-states': [rec()] });
  buildAll({ dataRoot, outRoot });
  assert.ok(has(outRoot, SAAS));
  assert.ok(has(outRoot, DETAIL));
  assert.ok(!read(outRoot, SAAS).includes('noindex'));
});

test('a record in a new country emits that country page', () => {
  const { dataRoot, outRoot } = fixture({ germany: [rec({ id: 'de', country: 'germany' })] });
  buildAll({ dataRoot, outRoot });
  assert.ok(has(outRoot, GERMANY));
});

// --- 1, 2: byte stability ---------------------------------------------------

test('1-2 repeated builds are byte-identical and write nothing', () => {
  const { dataRoot, outRoot } = fixture({ 'united-states': [rec()] });
  buildAll({ dataRoot, outRoot });
  const before = fingerprint(outRoot);
  const second = buildAll({ dataRoot, outRoot });
  assert.deepStrictEqual(second.written, []);
  assert.deepStrictEqual(second.removed, []);
  assert.strictEqual(fingerprint(outRoot), before);
});

// --- 3, 4: minimal rewrites -------------------------------------------------

test('3-4 only changed pages are rewritten; unchanged files keep their mtime', () => {
  const { dataRoot, outRoot } = fixture();
  buildAll({ dataRoot, outRoot });
  const times = Object.fromEntries(walk(path.join(outRoot, SECTION_DIR))
    .map((f) => [f, fs.statSync(f).mtimeMs]));
  writeDirs(dataRoot, 'united-states', [rec()]);
  const result = buildAll({ dataRoot, outRoot });
  const untouched = Object.keys(times).filter((f) => fs.existsSync(f) && fs.statSync(f).mtimeMs === times[f]);
  assert.ok(result.written.length > 0);
  assert.ok(untouched.length > 0, 'at least one unchanged file must be left alone');
});

// --- 5, 7: pruning safety ---------------------------------------------------

test('5 pruning never deletes a file the generator did not create', () => {
  const { dataRoot, outRoot } = fixture({ 'united-states': [rec()] });
  buildAll({ dataRoot, outRoot });
  const manual = path.join(outRoot, SECTION_DIR, 'manual-note.txt');
  fs.writeFileSync(manual, 'hand authored');
  writeDirs(dataRoot, 'united-states', []);
  buildAll({ dataRoot, outRoot });
  assert.ok(fs.existsSync(manual), 'hand-authored file was deleted');
});

test('7 refuses to overwrite a file it does not own', () => {
  const { dataRoot, outRoot } = fixture();
  fs.mkdirSync(path.join(outRoot, SECTION_DIR), { recursive: true });
  fs.writeFileSync(path.join(outRoot, HUB), '<p>hand authored hub</p>');
  assert.throws(() => buildAll({ dataRoot, outRoot }), (err) => {
    assert.ok(err instanceof BuildError);
    assert.ok(/Refusing to overwrite/.test(err.message), err.message);
    return true;
  });
  assert.strictEqual(read(outRoot, HUB), '<p>hand authored hub</p>', 'the file must survive untouched');
});

// --- 6: isolation -----------------------------------------------------------

test('6 every generated path is inside the section or is the section sitemap', () => {
  const { dataRoot, outRoot } = fixture({ 'united-states': [rec()] });
  buildAll({ dataRoot, outRoot });
  const manifest = JSON.parse(read(outRoot, MANIFEST_FILE));
  for (const rel of Object.keys(manifest.files)) {
    const inside = rel.startsWith(`${SECTION_DIR}${path.sep}`) || rel === SITEMAP;
    assert.ok(inside, `generated path escapes the section: ${rel}`);
  }
});

// --- 8, 9, 11: identity -----------------------------------------------------

test('8-9 canonicals and output paths are unique', () => {
  const { dataRoot } = fixture({ 'united-states': [rec()] });
  const pages = pageModel(loadRegistry(dataRoot));
  const canonicals = pages.map((p) => p.meta.canonical);
  const outPaths = pages.map((p) => p.outPath);
  assert.strictEqual(new Set(canonicals).size, canonicals.length);
  assert.strictEqual(new Set(outPaths).size, outPaths.length);
});

test('11 every emitted file maps to exactly one owner', () => {
  const { dataRoot, outRoot } = fixture({ 'united-states': [rec()] });
  buildAll({ dataRoot, outRoot });
  const owners = Object.values(JSON.parse(read(outRoot, MANIFEST_FILE)).files);
  assert.strictEqual(new Set(owners).size, owners.length, `duplicate owner: ${owners}`);
  assert.ok(owners.includes('directory:us-ok'));
});

// --- 10: sitemap integrity --------------------------------------------------

test('10 the sitemap only references pages that were generated', () => {
  const { dataRoot, outRoot } = fixture({ 'united-states': [rec({ lastVerified: '2026-08-01' })] });
  buildAll({ dataRoot, outRoot });
  const canonicals = new Set(pageModel(loadRegistry(dataRoot)).map((p) => p.meta.canonical));
  const locs = [...read(outRoot, SITEMAP).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.ok(locs.length > 0);
  for (const loc of locs) assert.ok(canonicals.has(loc), `sitemap references ungenerated ${loc}`);
});

test('10 the sitemap never lists a noindex page', () => {
  const { dataRoot, outRoot } = fixture();
  buildAll({ dataRoot, outRoot });
  const xml = read(outRoot, SITEMAP);
  assert.ok(!xml.includes('/united-states/'), 'empty reference pages must stay out of the sitemap');
  assert.strictEqual((xml.match(/<loc>/g) || []).length, 1);
});

// --- 12, 13: pruning correctness --------------------------------------------

test('12-13 removing the last record prunes only its dependents', () => {
  const { dataRoot, outRoot } = fixture({ 'united-states': [rec()] });
  buildAll({ dataRoot, outRoot });
  assert.ok(has(outRoot, SAAS) && has(outRoot, DETAIL));

  writeDirs(dataRoot, 'united-states', []);
  const result = buildAll({ dataRoot, outRoot });

  assert.ok(!has(outRoot, SAAS), 'stale category page survived');
  assert.ok(!has(outRoot, DETAIL), 'stale detail page survived');
  assert.ok(has(outRoot, HUB), 'hub must survive');
  assert.ok(has(outRoot, REF_COUNTRY), 'reference country must survive');
  assert.ok(has(outRoot, REF_CATEGORY), 'reference category must survive');
  assert.strictEqual(result.removed.length, 2);
});

test('13 no orphan page survives a full data removal', () => {
  const { dataRoot, outRoot } = fixture({ 'united-states': [rec()], germany: [rec({ id: 'de', country: 'germany', slug: 'de-dir' })] });
  buildAll({ dataRoot, outRoot });
  writeDirs(dataRoot, 'united-states', []);
  writeDirs(dataRoot, 'germany', []);
  buildAll({ dataRoot, outRoot });
  const remaining = walk(path.join(outRoot, SECTION_DIR)).map((f) => path.relative(outRoot, f)).sort();
  assert.deepStrictEqual(remaining, [
    path.join(SECTION_DIR, 'feed.xml'),
    HUB,
    REF_COUNTRY,
    REF_CATEGORY,
  ].sort());
});

// --- 14: fail before writing ------------------------------------------------

test('14 a validator failure aborts the build with nothing written', () => {
  const { dataRoot, outRoot } = fixture();
  buildAll({ dataRoot, outRoot });
  const before = fingerprint(outRoot);
  // Passes the loader (real country/category, safe slug, https) but fails the
  // validator: out of range and populated while unverified.
  writeDirs(dataRoot, 'united-states', [rec({ petroHrysScore: 900 })]);
  assert.throws(() => buildAll({ dataRoot, outRoot }), (err) => {
    assert.ok(err instanceof BuildError);
    assert.ok(/refusing to build/i.test(err.message), err.message);
    return true;
  });
  assert.strictEqual(fingerprint(outRoot), before, 'the site changed despite a failed build');
});

test('14 a loader failure also aborts before any write', () => {
  const { dataRoot, outRoot } = fixture();
  buildAll({ dataRoot, outRoot });
  const before = fingerprint(outRoot);
  writeDirs(dataRoot, 'united-states', [rec({ category: 'not-a-category' })]);
  assert.throws(() => buildAll({ dataRoot, outRoot }));
  assert.strictEqual(fingerprint(outRoot), before);
});

// --- 15: transactional ------------------------------------------------------

test('15 a dry run stages and validates a full tree without writing', () => {
  const { dataRoot, outRoot } = fixture({ 'united-states': [rec()] });
  const result = buildAll({ dataRoot, outRoot, dryRun: true });
  assert.ok(result.staged > 0);
  assert.deepStrictEqual(result.written, []);
  assert.strictEqual(walk(path.join(outRoot, SECTION_DIR)).length, 0, 'dry run must write nothing');
});

test('15 staging directories are always cleaned up', () => {
  const before = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('bd-stage-')).length;
  const { dataRoot, outRoot } = fixture();
  buildAll({ dataRoot, outRoot });
  buildAll({ dataRoot, outRoot, dryRun: true });
  const after = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('bd-stage-')).length;
  assert.strictEqual(after, before, 'a staging directory leaked');
});

// --- content correctness ----------------------------------------------------

test('every FAQ question in the JSON-LD is visible on the page', () => {
  const { dataRoot, outRoot } = fixture();
  buildAll({ dataRoot, outRoot });
  for (const rel of [HUB, REF_COUNTRY]) {
    const html = read(outRoot, rel);
    const block = html.match(/<script type="application\/ld\+json">\n([\s\S]*?)\n  <\/script>/);
    const graph = JSON.parse(block[1].replace(/\\u003c/g, '<').replace(/\\u003e/g, '>'))['@graph'];
    const faq = graph.find((n) => n['@type'] === 'FAQPage');
    assert.ok(faq, `${rel} has no FAQPage`);
    const body = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
    for (const entry of faq.mainEntity) {
      const question = entry.name.replace(/&/g, '&amp;');
      assert.ok(body.includes(question), `${rel}: FAQ question not visible: ${entry.name}`);
    }
  }
});

test('no generated page contains the bing placeholder or an apex url', () => {
  const { dataRoot, outRoot } = fixture({ 'united-states': [rec()] });
  buildAll({ dataRoot, outRoot });
  for (const file of walk(path.join(outRoot, SECTION_DIR))) {
    const text = fs.readFileSync(file, 'utf8');
    assert.ok(!text.includes('PASTE_YOUR_BING'), `${file} carries the placeholder`);
    assert.ok(!/https:\/\/petrohrys\.com/.test(text), `${file} carries an apex url`);
  }
});

test('the RSS feed is a valid empty channel until a record is verified', () => {
  const { dataRoot, outRoot } = fixture();
  buildAll({ dataRoot, outRoot });
  const xml = read(outRoot, path.join(SECTION_DIR, 'feed.xml'));
  assert.ok(xml.includes('<channel>'));
  assert.ok(!xml.includes('<item>'));
});

test('a verified record appears in both the feed and the sitemap', () => {
  const { dataRoot, outRoot } = fixture({ 'united-states': [rec({ lastVerified: '2026-08-01' })] });
  buildAll({ dataRoot, outRoot });
  assert.ok(read(outRoot, path.join(SECTION_DIR, 'feed.xml')).includes('<item>'));
  assert.ok(read(outRoot, SITEMAP).includes('/united-states/ok-dir/'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test "scripts/tests/bd-build.test.cjs"`
Expected: FAIL — `Cannot find module '../build-business-directories.cjs'`

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/build-business-directories.cjs
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PATHS, writeIfChanged } = require('./lib/bd-util.cjs');
const { loadRegistry, directoriesFor, isIndexable } = require('./lib/bd-registry.cjs');
const { sortDirectories } = require('./lib/bd-sort.cjs');
const seo = require('./lib/bd-seo.cjs');
const c = require('./lib/bd-components.cjs');
const { renderPage } = require('./lib/bd-render.cjs');
const { renderSitemap, renderRss } = require('./lib/bd-feeds.cjs');
const { validateRegistry, formatReport } = require('./validate-business-directories.cjs');

const BASE = '/research/business-directories/';
const SECTION_DIR = path.join('research', 'business-directories');
const SITEMAP_FILE = 'sitemap-business-directories.xml';
const FEED_FILE = path.join(SECTION_DIR, 'feed.xml');
const MANIFEST_FILE = path.join('data', 'business-directories', '.build-manifest.json');
const REFERENCE_COUNTRY = 'united-states';
const REFERENCE_CATEGORY = 'general-business';

class BuildError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BuildError';
  }
}

// --- emission policy --------------------------------------------------------

function countryEmitted(registry, country) {
  return country.slug === REFERENCE_COUNTRY
    || directoriesFor(registry, country.slug).length > 0;
}

function categoryEmitted(registry, country, category) {
  if (directoriesFor(registry, country.slug, category.slug).length > 0) return true;
  return country.slug === REFERENCE_COUNTRY && category.slug === REFERENCE_CATEGORY;
}

// --- approved static copy ---------------------------------------------------

const HUB_FAQS = [
  { q: 'What is this section?',
    a: 'A research index of business directories, organised by country and category. Each entry records what a directory accepts, how it links out, and how it was verified.' },
  { q: 'How is the PetroHrys Score produced?',
    a: 'It is a first-party editorial assessment made by Petro Hrys. It is not supplied by any third party and is not a review rating.' },
  { q: 'Are Domain Rating and Authority Score your own numbers?',
    a: 'No. Domain Rating, Authority Score, estimated traffic and referring domains are third-party metrics. Each recorded value stores its provider and the date it was measured.' },
  { q: 'Why are some pages empty?',
    a: 'Directories are published only after manual verification. Pages with no verified entries are left empty and excluded from search indexing rather than filled with placeholder data.' },
];

function countryFaqs(country, count) {
  return [
    { q: `Which directories are listed for ${country.titleName}?`,
      a: count === 0
        ? `None yet. No directory for ${country.titleName} has completed manual verification, so nothing is published on this page.`
        : `${count} verified ${count === 1 ? 'directory is' : 'directories are'} currently published for ${country.titleName}.` },
    { q: 'Are listings here paid placements?',
      a: 'No. Nothing on these pages is sold, sponsored, or accepted in exchange for payment.' },
  ];
}

function section(id, heading, body) {
  return `    <section class="bd-section" aria-labelledby="${id}">
      <h2 id="${id}">${heading}</h2>
${body}
    </section>`;
}

// --- page model -------------------------------------------------------------
// Every page declares an `owner`: the single registry fact responsible for it.
// Pruning and ownership checks rely on this being one-to-one.

function pageModel(registry) {
  const pages = [];

  const countryLinks = registry.countries.map((country) => ({
    name: country.name,
    path: `${BASE}${country.slug}/`,
    pending: !countryEmitted(registry, country),
  }));

  const hubMeta = seo.buildHubMeta({
    countries: countryLinks.filter((l) => !l.pending),
    faqs: HUB_FAQS,
  });

  pages.push({
    kind: 'hub',
    owner: 'hub',
    outPath: path.join(SECTION_DIR, 'index.html'),
    meta: hubMeta,
    main: [
      c.pageIntro({ title: 'Business Directories', lede: hubMeta.description }),
      section('methodology', 'Methodology', `${c.methodologyNote()}\n${c.metricNote()}`),
      section('countries', 'Countries',
        c.cardGrid(countryLinks.map((l) => c.countryCard({ ...l, headingLevel: 3 })),
          { label: 'Countries' })),
      section('faq', 'Questions', c.faqSection(HUB_FAQS)),
    ].join('\n\n'),
  });

  for (const country of registry.countries) {
    if (!countryEmitted(registry, country)) continue;

    const countryPath = `${BASE}${country.slug}/`;
    const countryEntries = sortDirectories(directoriesFor(registry, country.slug));
    const categoryLinks = registry.categories.map((category) => ({
      name: category.name,
      path: `${countryPath}categories/${category.slug}/`,
      description: category.description,
      pending: !categoryEmitted(registry, country, category),
    }));
    const faqs = countryFaqs(country, countryEntries.length);
    const meta = seo.buildCountryMeta({
      country,
      categories: categoryLinks.filter((l) => !l.pending),
      directories: countryEntries,
      faqs,
    });

    pages.push({
      kind: 'country',
      owner: `country:${country.slug}`,
      outPath: path.join(SECTION_DIR, country.slug, 'index.html'),
      meta,
      main: [
        c.pageIntro({ title: meta.title, lede: meta.description }),
        section('categories', 'Directory categories',
          c.cardGrid(categoryLinks.map((l) => c.categoryCard({ ...l, headingLevel: 3 })),
            { label: 'Directory categories' })),
        section('directories', 'All directories', [
          c.searchControls({ idPrefix: country.slug }),
          c.filterControls({ idPrefix: country.slug }),
          c.sortControls({ idPrefix: country.slug }),
          c.directoryTable({ directories: countryEntries, caption: `Directories in ${country.name}` }),
          c.metricNote(),
        ].join('\n')),
        section('faq', 'Questions', c.faqSection(faqs)),
      ].join('\n\n'),
    });

    for (const category of registry.categories) {
      if (!categoryEmitted(registry, country, category)) continue;

      const entries = sortDirectories(directoriesFor(registry, country.slug, category.slug));
      const catMeta = seo.buildCategoryMeta({ country, category, directories: entries });

      pages.push({
        kind: 'category',
        owner: `category:${country.slug}/${category.slug}`,
        outPath: path.join(SECTION_DIR, country.slug, 'categories', category.slug, 'index.html'),
        meta: catMeta,
        main: [
          c.pageIntro({ title: catMeta.title, lede: category.description }),
          section('directories', 'Directories', [
            c.searchControls({ idPrefix: `${country.slug}-${category.slug}` }),
            c.filterControls({ idPrefix: `${country.slug}-${category.slug}` }),
            c.sortControls({ idPrefix: `${country.slug}-${category.slug}` }),
            c.directoryTable({ directories: entries, caption: `${category.name} directories in ${country.name}` }),
            c.metricNote(),
          ].join('\n')),
        ].join('\n\n'),
      });
    }

    for (const directory of countryEntries) {
      const category = registry.categories.find((cat) => cat.slug === directory.category);
      const dirMeta = seo.buildDirectoryMeta({ country, category, directory });

      pages.push({
        kind: 'directory',
        owner: `directory:${directory.id}`,
        outPath: path.join(SECTION_DIR, country.slug, directory.slug, 'index.html'),
        lastmod: directory.lastVerified || undefined,
        meta: dirMeta,
        main: [
          c.pageIntro({ title: directory.name, lede: directory.description }),
          c.externalLinkCta({ url: directory.website }),
          c.statusBadges(directory),
          section('metrics', 'Metrics', `${c.metricsBlock(directory)}\n${c.metricNote()}`),
          section('verification', 'Verification', c.provenanceBlock(directory)),
          section('industries', 'Recommended industries', c.bestForTags(directory.recommendedIndustries)),
          section('assessment', 'Assessment', c.prosCons({ pros: directory.pros, cons: directory.cons, headingLevel: 3 })),
        ].join('\n\n'),
      });
    }
  }

  return pages;
}

// --- staging ----------------------------------------------------------------

function toPubDate(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`).toUTCString();
}

// Renders every artefact into memory, then materialises it into a throwaway
// directory. Nothing in the site tree is touched by this phase.
function stageBuild(registry, pages) {
  const files = new Map();

  for (const page of pages) {
    files.set(page.outPath, renderPage({ meta: page.meta, main: page.main }));
  }

  const indexable = pages
    .filter((page) => page.meta.robots === undefined)
    .map((page) => ({ path: page.meta.canonicalPath, lastmod: page.lastmod }));
  files.set(SITEMAP_FILE, renderSitemap(indexable));

  const feedItems = registry.directories
    .filter((d) => d.lastVerified)
    .slice()
    .sort((a, b) => (a.lastVerified < b.lastVerified ? 1 : a.lastVerified > b.lastVerified ? -1 : 0))
    .map((d) => ({
      title: d.name,
      path: `${BASE}${d.country}/${d.slug}/`,
      description: d.description,
      pubDate: toPubDate(d.lastVerified),
    }));
  files.set(FEED_FILE, renderRss(feedItems));

  return files;
}

// --- pre-write validation ---------------------------------------------------

function assertContained(relPath) {
  const normalised = path.normalize(relPath);
  if (path.isAbsolute(normalised) || normalised.split(path.sep).includes('..')) {
    throw new BuildError(`Refusing to write outside the site root: ${relPath}`);
  }
  const inSection = normalised === SITEMAP_FILE
    || normalised.startsWith(SECTION_DIR + path.sep);
  if (!inSection) {
    throw new BuildError(
      `Generated path is outside the section: ${relPath}. `
      + `Only ${SECTION_DIR}/** and ${SITEMAP_FILE} may be written.`);
  }
}

function validateStage(files, pages) {
  const errors = [];

  for (const relPath of files.keys()) assertContained(relPath);

  const byPath = new Map();
  const byCanonical = new Map();
  for (const page of pages) {
    if (byPath.has(page.outPath)) {
      errors.push(`Duplicate output path ${page.outPath} claimed by `
        + `"${byPath.get(page.outPath)}" and "${page.owner}".`);
    }
    byPath.set(page.outPath, page.owner);

    const canonical = page.meta.canonical;
    if (byCanonical.has(canonical)) {
      errors.push(`Duplicate canonical ${canonical} on ${byCanonical.get(canonical)} and ${page.outPath}.`);
    }
    byCanonical.set(canonical, page.outPath);
  }

  const owners = new Set();
  for (const page of pages) {
    if (owners.has(page.owner)) errors.push(`Duplicate owner key "${page.owner}".`);
    owners.add(page.owner);
  }

  // The sitemap may only reference pages that were actually staged.
  const staged = new Set(pages.map((page) => page.meta.canonical));
  const sitemap = files.get(SITEMAP_FILE) || '';
  for (const match of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    if (!staged.has(match[1])) {
      errors.push(`Sitemap references a URL that was not generated: ${match[1]}`);
    }
  }

  // RSS may only reference generated directory pages.
  const feed = files.get(FEED_FILE) || '';
  for (const match of feed.matchAll(/<link>([^<]+)<\/link>/g)) {
    const url = match[1];
    if (url === `${seo.ORIGIN}${BASE}`) continue;
    if (!staged.has(url)) errors.push(`RSS references a URL that was not generated: ${url}`);
  }

  const noindex = new Set(pages.filter((p) => p.meta.robots).map((p) => p.meta.canonical));
  for (const match of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    if (noindex.has(match[1])) errors.push(`Sitemap lists a noindex page: ${match[1]}`);
  }

  return errors;
}

// --- manifest ---------------------------------------------------------------

function readManifest(outRoot) {
  const file = path.join(outRoot, MANIFEST_FILE);
  if (!fs.existsSync(file)) return { files: {} };
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (cause) {
    throw new BuildError(`Corrupt build manifest ${file}: ${cause.message}`);
  }
}

function buildManifest(files, pages) {
  const owners = { [SITEMAP_FILE]: 'sitemap', [FEED_FILE]: 'feed' };
  for (const page of pages) owners[page.outPath] = page.owner;
  const sorted = {};
  for (const key of [...files.keys()].sort()) sorted[key] = owners[key];
  return { version: 1, files: sorted };
}

// --- commit -----------------------------------------------------------------

// Runs only after staging and validation both succeed. Writes only files whose
// contents changed, and deletes only files this generator previously created.
function commit(files, manifest, previous, outRoot) {
  const written = [];
  const removed = [];

  const previousFiles = new Set(Object.keys(previous.files || {}));

  for (const [relPath, contents] of files) {
    const target = path.join(outRoot, relPath);
    if (fs.existsSync(target) && !previousFiles.has(relPath)) {
      throw new BuildError(
        `Refusing to overwrite ${relPath}: it exists but was not created by this `
        + 'generator. Remove it by hand or add it to the manifest first.');
    }
    if (writeIfChanged(target, contents)) written.push(relPath);
  }

  for (const relPath of previousFiles) {
    if (files.has(relPath)) continue;
    const target = path.join(outRoot, relPath);
    if (!fs.existsSync(target)) continue;
    assertContained(relPath);
    fs.unlinkSync(target);
    removed.push(relPath);
  }

  pruneEmptyDirs(path.join(outRoot, SECTION_DIR));
  writeIfChanged(path.join(outRoot, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);

  return { written: written.sort(), removed: removed.sort() };
}

function pruneEmptyDirs(root) {
  if (!fs.existsSync(root)) return;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory()) pruneEmptyDirs(path.join(root, entry.name));
  }
  if (fs.readdirSync(root).length === 0) fs.rmdirSync(root);
}

// --- orchestration ----------------------------------------------------------

function buildAll(options = {}) {
  const dataRoot = options.dataRoot || PATHS.dataRoot;
  const outRoot = options.outRoot || PATHS.siteRoot;

  // 1. Load. A structural fault throws before anything else happens.
  const registry = loadRegistry(dataRoot);

  // 2. Validate. The single build gate — nothing is rendered, staged or
  //    written unless the registry is clean.
  const validation = validateRegistry(registry);
  if (!validation.ok) {
    throw new BuildError(`Registry is invalid; refusing to build.\n${formatReport(validation)}`);
  }

  // 3. Model and 4. stage, entirely in memory.
  const pages = pageModel(registry);
  const files = stageBuild(registry, pages);

  // 5. Validate the staged output before any disk write.
  const stageErrors = validateStage(files, pages);
  if (stageErrors.length) {
    throw new BuildError(`Staged output failed validation; nothing written.\n  ${stageErrors.join('\n  ')}`);
  }

  // 6. Materialise into a throwaway directory so the full tree exists and can
  //    be inspected before the site is touched at all.
  const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bd-stage-'));
  try {
    for (const [relPath, contents] of files) {
      const target = path.join(stageDir, relPath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, contents, 'utf8');
    }
    for (const [relPath, contents] of files) {
      const roundTrip = fs.readFileSync(path.join(stageDir, relPath), 'utf8');
      if (roundTrip !== contents) {
        throw new BuildError(`Staged file did not round-trip: ${relPath}`);
      }
    }

    if (options.dryRun) {
      return { written: [], removed: [], pages: pages.length, staged: files.size, stageDir };
    }

    // 7. Reconcile into the site tree.
    const previous = readManifest(outRoot);
    const manifest = buildManifest(files, pages);
    const result = commit(files, manifest, previous, outRoot);
    return { ...result, pages: pages.length, staged: files.size };
  } finally {
    fs.rmSync(stageDir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  const result = buildAll({ dryRun });
  if (dryRun) {
    console.log(`Dry run: ${result.pages} page(s), ${result.staged} file(s) staged and validated. Nothing written.`);
  } else {
    console.log(`Generated ${result.pages} page(s); `
      + `${result.written.length} written, ${result.removed.length} pruned.`);
  }
}

module.exports = {
  buildAll, pageModel, stageBuild, validateStage, buildManifest,
  BuildError, REFERENCE_COUNTRY, REFERENCE_CATEGORY, MANIFEST_FILE, SECTION_DIR,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test "scripts/tests/bd-build.test.cjs"`
Expected: PASS, 23 tests

- [ ] **Step 5: Dry run against the real site, writing nothing**

```bash
node scripts/build-business-directories.cjs --dry-run
# expect: Dry run: 3 page(s), 5 file(s) staged and validated. Nothing written.
git status --short   # expect: clean
```

- [ ] **Step 6: Build for real, then verify**

```bash
node scripts/build-business-directories.cjs
# expect: Generated 3 page(s); 5 written, 0 pruned.
node scripts/build-business-directories.cjs
# expect: 0 written, 0 pruned

find research/business-directories -name index.html | sort
grep -c '<loc>' sitemap-business-directories.xml          # expect 1
grep -L 'noindex,follow' $(find research/business-directories -name index.html)  # expect only the hub
```

- [ ] **Step 7: Commit**

```bash
git add scripts/build-business-directories.cjs scripts/tests/bd-build.test.cjs \
        research/business-directories sitemap-business-directories.xml \
        data/business-directories/.build-manifest.json
git commit -m "feat(bd): add transactional generator and the lean scaffold"
```

---

### Task 11: Navigation injection and parent link

**Files:**
- Create: `scripts/inject-research-nav.cjs`
- Modify: the 8 English editorial pages (nav only)
- Modify: `research/index.html` (one added section)
- Test: `scripts/tests/bd-nav.test.cjs`

**Interfaces:**
- Consumes: `bd-util.cjs` → `writeIfChanged`
- Produces: `EDITORIAL_PAGES: string[]`, `injectNav(html): string`, `run(): string[]`

- [ ] **Step 1: Write the failing test**

```js
// scripts/tests/bd-nav.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { injectNav, EDITORIAL_PAGES, run } = require('../inject-research-nav.cjs');

const root = path.resolve(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('exactly the 8 editorial pages are targeted', () => {
  assert.deepStrictEqual(EDITORIAL_PAGES.slice().sort(), [
    'about/index.html', 'ai-systems/index.html', 'essays/index.html',
    'index.html', 'infrastructure/index.html', 'research/index.html',
    'work/index.html', 'writing/index.html',
  ]);
});

test('injectNav adds the Research Center item after Work', () => {
  const input = '<ul class="nav-primary">\n<li><a href="/work/">Work</a></li>\n</ul>';
  const out = injectNav(input);
  assert.ok(out.includes('Research Center'));
  assert.ok(out.indexOf('Work') < out.indexOf('Research Center'));
});

test('injectNav is idempotent', () => {
  const input = '<ul class="nav-primary">\n<li><a href="/work/">Work</a></li>\n</ul>';
  assert.strictEqual(injectNav(injectNav(input)), injectNav(input));
});

test('injectNav never renames or removes existing items', () => {
  const input = '<ul class="nav-primary">\n<li><a href="/work/">Work</a></li>\n' +
    '<li><a href="/writing/">Research &amp; Writing</a></li>\n</ul>';
  const out = injectNav(input);
  assert.ok(out.includes('>Work<'));
  assert.ok(out.includes('>Research &amp; Writing<'));
});

test('after run, every editorial page carries the item exactly twice', () => {
  run();
  for (const page of EDITORIAL_PAGES) {
    const matches = read(page).match(/Research Center/g) || [];
    assert.strictEqual(matches.length, 2, `${page} has ${matches.length}`);
  }
});

test('legacy and localised pages are never touched', () => {
  run();
  for (const page of ['pdf-editor/index.html', 'blog/index.html', 'es/index.html', 'de/work/index.html']) {
    assert.ok(!read(page).includes('Research Center'), `${page} was modified`);
  }
});

test('the research hub links to business directories', () => {
  assert.ok(read('research/index.html').includes('/research/business-directories/'));
});

test('the research hub keeps its original sections', () => {
  const html = read('research/index.html');
  for (const heading of ['id="scope"', 'id="entries"', 'id="related"']) {
    assert.ok(html.includes(heading), `lost ${heading}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/tests/bd-nav.test.cjs`
Expected: FAIL — `Cannot find module '../inject-research-nav.cjs'`

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/inject-research-nav.cjs
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { PATHS, writeIfChanged } = require('./lib/bd-util.cjs');

const EDITORIAL_PAGES = [
  'index.html',
  'work/index.html',
  'writing/index.html',
  'research/index.html',
  'essays/index.html',
  'ai-systems/index.html',
  'infrastructure/index.html',
  'about/index.html',
];

const START = '<!-- bd-nav:start -->';
const END = '<!-- bd-nav:end -->';
const BLOCK_RE = /[ \t]*<!-- bd-nav:start -->[\s\S]*?<!-- bd-nav:end -->\n?/g;
const WORK_ITEM_RE = /^([ \t]*)<li><a href="\/work\/"[^>]*>Work<\/a><\/li>\n/gm;

function injectNav(html) {
  const cleaned = html.replace(BLOCK_RE, '');
  return cleaned.replace(WORK_ITEM_RE, (match, indent) =>
    `${match}${indent}${START}\n${indent}<li><a href="/research/">Research Center</a></li>\n${indent}${END}\n`);
}

function run() {
  const changed = [];
  for (const page of EDITORIAL_PAGES) {
    const file = path.join(PATHS.siteRoot, page);
    const html = fs.readFileSync(file, 'utf8');
    if (writeIfChanged(file, injectNav(html))) changed.push(page);
  }
  return changed;
}

if (require.main === module) {
  const changed = run();
  console.log(`Nav updated on ${changed.length} page(s).`);
}

module.exports = { EDITORIAL_PAGES, injectNav, run, START, END };
```

- [ ] **Step 4: Run the injector and verify**

```bash
cd ~/PetroHrys.com
node scripts/inject-research-nav.cjs        # expect "Nav updated on 8 page(s)."
node scripts/inject-research-nav.cjs        # expect "Nav updated on 0 page(s)."
git diff --stat                             # expect exactly 8 files, 2 insertions each block
```

- [ ] **Step 5: Add the parent link to `research/index.html`**

Open `research/index.html`. Immediately **after** the closing `</section>` of the `id="entries"` section and **before** the `id="related"` section, insert this block. Change nothing else on the page.

```html
    <section aria-labelledby="collections" class="prose">
      <h2 id="collections">Collections</h2>
      <p><a href="/research/business-directories/">Business Directories</a> &mdash; a country-by-country index of business directories, recording what each one accepts, how it links, and when it was last verified. Entries are published only after manual verification.</p>
    </section>
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test scripts/tests/bd-nav.test.cjs`
Expected: PASS, 8 tests

- [ ] **Step 7: Commit**

```bash
git add scripts/inject-research-nav.cjs scripts/tests/bd-nav.test.cjs \
  index.html work/index.html writing/index.html research/index.html \
  essays/index.html ai-systems/index.html infrastructure/index.html about/index.html
git commit -m "feat(bd): add Research Center nav item and link the section from /research/"
```

---

### Task 12: robots.txt reference and full verification

**Files:**
- Modify: `robots.txt` (one added line)
- Create: `scripts/tests/bd-integration.test.cjs`

**Interfaces:**
- Consumes: everything built so far. Produces no new module.

- [ ] **Step 1: Write the failing test**

```js
// scripts/tests/bd-integration.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });

// This branch is STACKED on feat/helperg-ecosystem-banner, which already modifies
// sitemap.xml and css/petrohrys.css relative to main. Diffing against main would
// therefore report the banner branch's changes as ours. Diff against the fork point.
const BASELINE = git('merge-base', 'HEAD', 'feat/helperg-ecosystem-banner').trim();

test('robots.txt references the section sitemap on the www host', () => {
  assert.ok(read('robots.txt').includes('Sitemap: https://www.petrohrys.com/sitemap-business-directories.xml'));
});

test('robots.txt still contains its original directives', () => {
  const txt = read('robots.txt');
  for (const line of ['User-agent: GPTBot', 'Disallow: /wp-admin/', 'Sitemap: https://petrohrys.com/sitemap.xml']) {
    assert.ok(txt.includes(line), `lost: ${line}`);
  }
});

test('the existing sitemap.xml is unmodified by this work', () => {
  assert.strictEqual(git('diff', BASELINE, '--name-only', '--', 'sitemap.xml').trim(), '');
});

test('the site stylesheet is unmodified by this work', () => {
  assert.strictEqual(git('diff', BASELINE, '--name-only', '--', 'css/petrohrys.css').trim(), '');
});

test('no legacy or localised page was modified by this work', () => {
  const changed = git('diff', BASELINE, '--name-only').trim().split('\n').filter(Boolean);
  const forbidden = changed.filter((f) =>
    /^(es|fr|de)\//.test(f) ||
    /^(pdf-editor|pocket-manager|smart-printer|startups|privacy|fax|unzip|articles|terms|blog|webmasterid|submit-startup|artificial-intelligence|templates|twinphone|invoice-maker|tcg-scanner|cv-builder)\//.test(f));
  assert.deepStrictEqual(forbidden, []);
});

test('no generated page uses the apex origin', () => {
  const hub = read('research/business-directories/index.html');
  assert.ok(!/https:\/\/petrohrys\.com/.test(hub));
});

test('only the lean scaffold is committed to the site', () => {
  const listed = execFileSync('bash',
    ['-c', 'find research/business-directories -name index.html | sort'],
    { cwd: root, encoding: 'utf8' }).trim().split('\n');
  assert.deepStrictEqual(listed, [
    'research/business-directories/index.html',
    'research/business-directories/united-states/categories/general-business/index.html',
    'research/business-directories/united-states/index.html',
  ]);
});

test('no directory detail page exists while there is no real data', () => {
  const dirs = execFileSync('bash',
    ['-c', 'ls research/business-directories/united-states/ | grep -v categories | grep -v index.html || true'],
    { cwd: root, encoding: 'utf8' }).trim();
  assert.strictEqual(dirs, '');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/tests/bd-integration.test.cjs`
Expected: FAIL on the robots.txt assertion

- [ ] **Step 3: Add the sitemap line to `robots.txt`**

Append this line to the end of `robots.txt`, directly below the existing `Sitemap:` line. Change nothing else in the file.

```
Sitemap: https://www.petrohrys.com/sitemap-business-directories.xml
```

- [ ] **Step 4: Run the full suite**

```bash
cd ~/PetroHrys.com
node scripts/validate-business-directories.cjs
node scripts/build-business-directories.cjs
node scripts/inject-research-nav.cjs
node --test "scripts/tests/*.test.cjs"
```

Expected: validator prints `Business directories registry is valid.`; build reports `0 written, 0 pruned`; nav reports `0 page(s)`; all tests pass.

- [ ] **Step 5: Confirm the diff against main is exactly what the spec allows**

```bash
BASELINE=$(git merge-base HEAD feat/helperg-ecosystem-banner)
git diff "$BASELINE" --stat -- . ':!research/business-directories' ':!data' ':!scripts' ':!css/business-directories.css' ':!js/business-directories.js' ':!docs' ':!sitemap-business-directories.xml'
```

Expected: only the 8 editorial pages plus `robots.txt`. If anything else appears, revert it before committing.

**Do not diff against `main`.** This branch is stacked on `feat/helperg-ecosystem-banner`, which already modifies `sitemap.xml` and `css/petrohrys.css`; diffing against `main` would attribute those to this work.

- [ ] **Step 6: Commit**

```bash
git add robots.txt scripts/tests/bd-integration.test.cjs
git commit -m "feat(bd): reference the section sitemap from robots.txt"
```

---

## Follow-ups (not in this plan)

1. `sitemap.xml` advertises 56 apex URLs while every canonical declares `www`. Fix the host, or add an apex→www redirect and keep the sitemap canonical.
2. `<meta name="msvalidate.01" content="PASTE_YOUR_BING_VERIFICATION_CODE_HERE">` is an unfilled placeholder on all existing pages. Fill it or remove it.
3. The 23 legacy pages use a separate inline-style design system. Unifying them would let the Research Center be reachable from product pages.
4. Localised (`es`/`fr`/`de`) Business Directories routes and hreflang, once English content is real.

## Self-Review

**Spec coverage:** §4 architecture → Tasks 1–2, 10. §5 routing → Task 10. §6 data model → Tasks 1, 4. §7 sorting/filter/search/pagination → Tasks 3, 6, 9. §8 SEO → Tasks 5, 7. §9 indexing → Task 10. §10 feeds → Tasks 8, 10, 12. §11 design containment → Tasks 7, 9. §12 nav → Task 11. §13 validation → Tasks 2–4, 12. Every spec section maps to at least one task.

**Placeholder scan:** No TBD/TODO. Every code step carries runnable code. The only literal placeholder string mentioned is `PASTE_YOUR_BING_VERIFICATION_CODE_HERE`, which appears solely in assertions that it must never be emitted.

**Type consistency:** `loadRegistry`/`directoriesFor`/`isIndexable`/`reservedSlugs` (Task 2) are consumed with matching signatures in Tasks 4 and 10. `sortDirectories(list, key)` (Task 3) is called with the same shape in Task 10. `metric(value, provenance)` (Task 6) matches its call sites in `directoryRow`. `renderPage({...})` (Task 7) receives exactly the keys `pageModel` produces in Task 10. `renderSitemap([{path, lastmod?}])` (Task 8) matches the `{path}` objects Task 10 passes.

**One known coupling to watch:** Task 5's `renderJsonLd` escapes `<` and `>` to `\u003c`/`\u003e`. The Task 5 test asserts a literal `</script>` never appears; if the implementer changes the escape strategy, that assertion must be updated to match, but the safety requirement itself does not change.
