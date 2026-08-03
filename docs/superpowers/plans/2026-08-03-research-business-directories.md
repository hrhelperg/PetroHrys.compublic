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
- Consumes: `bd-util.cjs` → `escapeHtml`
- Produces: `ORIGIN: string`, `absoluteUrl(path): string`, `breadcrumbList(trail): object`, `collectionPage({name, description, url}): object`, `itemList(items): object`, `faqPage(faqs): object`, `directoryWebPage(directory, url): object`, `renderJsonLd(graph): string`

- [ ] **Step 1: Write the failing test**

```js
// scripts/tests/bd-seo.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const seo = require('../lib/bd-seo.cjs');

test('origin is the canonical www host', () => {
  assert.strictEqual(seo.ORIGIN, 'https://www.petrohrys.com');
});

test('absoluteUrl joins paths without doubling slashes', () => {
  assert.strictEqual(seo.absoluteUrl('/research/business-directories/'),
    'https://www.petrohrys.com/research/business-directories/');
});

test('breadcrumbList numbers positions from 1 and uses absolute urls', () => {
  const ld = seo.breadcrumbList([
    { name: 'Home', path: '/' },
    { name: 'Research', path: '/research/' },
  ]);
  assert.strictEqual(ld['@type'], 'BreadcrumbList');
  assert.strictEqual(ld.itemListElement[0].position, 1);
  assert.strictEqual(ld.itemListElement[1].item, 'https://www.petrohrys.com/research/');
});

test('itemList numbers entries and preserves order', () => {
  const ld = seo.itemList([
    { name: 'A', path: '/a/' },
    { name: 'B', path: '/b/' },
  ]);
  assert.strictEqual(ld['@type'], 'ItemList');
  assert.strictEqual(ld.numberOfItems, 2);
  assert.strictEqual(ld.itemListElement[1].name, 'B');
});

test('itemList on an empty array reports zero items', () => {
  const ld = seo.itemList([]);
  assert.strictEqual(ld.numberOfItems, 0);
  assert.deepStrictEqual(ld.itemListElement, []);
});

test('faqPage builds Question and Answer nodes', () => {
  const ld = seo.faqPage([{ q: 'Why?', a: 'Because.' }]);
  assert.strictEqual(ld['@type'], 'FAQPage');
  assert.strictEqual(ld.mainEntity[0]['@type'], 'Question');
  assert.strictEqual(ld.mainEntity[0].acceptedAnswer.text, 'Because.');
});

test('no builder ever emits AggregateRating or Review', () => {
  const rendered = seo.renderJsonLd([
    seo.collectionPage({ name: 'X', description: 'Y', url: seo.absoluteUrl('/x/') }),
    seo.directoryWebPage(
      { name: 'D', description: 'Desc', website: 'https://d.example' },
      seo.absoluteUrl('/d/')),
  ]);
  assert.ok(!rendered.includes('AggregateRating'));
  assert.ok(!rendered.includes('"Review"'));
});

test('renderJsonLd escapes a closing script tag in data', () => {
  const rendered = seo.renderJsonLd([{ '@type': 'WebPage', name: '</script><b>x' }]);
  assert.ok(!rendered.includes('</script><b>'));
  assert.ok(rendered.includes('<\\/script>'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/tests/bd-seo.test.cjs`
Expected: FAIL — `Cannot find module '../lib/bd-seo.cjs'`

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/bd-seo.cjs
'use strict';

const ORIGIN = 'https://www.petrohrys.com';

function absoluteUrl(pathname) {
  return `${ORIGIN}${pathname.startsWith('/') ? '' : '/'}${pathname}`;
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
    isPartOf: { '@type': 'WebSite', url: `${ORIGIN}/` },
  };
}

function itemList(items) {
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
  return {
    '@type': 'FAQPage',
    mainEntity: faqs.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };
}

// Deliberately emits no AggregateRating and no Review: the PetroHrys Score is a
// first-party editorial metric and must not be dressed as third-party review data.
function directoryWebPage(directory, url) {
  return {
    '@type': 'WebPage',
    name: directory.name,
    description: directory.description,
    url,
    about: {
      '@type': 'Organization',
      name: directory.name,
      url: directory.website,
    },
  };
}

function renderJsonLd(graph) {
  const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');
  return `  <script type="application/ld+json">\n${json}\n  </script>`;
}

module.exports = {
  ORIGIN, absoluteUrl, breadcrumbList, collectionPage,
  itemList, faqPage, directoryWebPage, renderJsonLd,
};
```

Note: the `<` / `>` escape yields `\u003c/script\u003e` in output, so the test's `<\\/script>` assertion must match. Adjust the test assertion to `assert.ok(rendered.includes('\\u003c/script'))` if the escape strategy differs — the requirement is only that a literal `</script>` can never appear.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/tests/bd-seo.test.cjs`
Expected: PASS, 8 tests

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/bd-seo.cjs scripts/tests/bd-seo.test.cjs
git commit -m "feat(bd): add SEO and structured-data builders"
```

---

### Task 6: Components

**Files:**
- Create: `scripts/lib/bd-components.cjs`
- Test: `scripts/tests/bd-components.test.cjs`

**Interfaces:**
- Consumes: `bd-util.cjs` → `escapeHtml`; `bd-sort.cjs` → `SORTS`, `SORT_KEYS`
- Produces: `emptyState(message): string`, `metric(value, provenance?): string`, `linkGrid(items): string` (items are `{name, path, pending?}`; `pending` renders unlinked text), `sortControl(): string`, `filterBar(): string`, `searchBox(): string`, `directoryRow(directory): string`, `directoryTable(directories): string`, `directoryDetail(directory): string`, `faqSection(faqs): string`, `pagination({current, total, basePath}): string`, `metricNote(): string`

- [ ] **Step 1: Write the failing test**

```js
// scripts/tests/bd-components.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const c = require('../lib/bd-components.cjs');

test('metric renders an em dash for null', () => {
  assert.strictEqual(c.metric(null), '<span class="bd-metric bd-metric--empty">&mdash;</span>');
});

test('metric renders a value with provenance when supplied', () => {
  const html = c.metric(78, { provider: 'Ahrefs', measuredAt: '2026-08-01' });
  assert.ok(html.includes('78'));
  assert.ok(html.includes('Ahrefs'));
  assert.ok(html.includes('2026-08-01'));
});

test('metric never renders zero for a null value', () => {
  assert.ok(!c.metric(null).includes('0'));
});

test('emptyState states that entries are published only after verification', () => {
  const html = c.emptyState('No directories published yet.');
  assert.ok(html.includes('manual verification') || html.includes('manually verified'));
  assert.ok(html.includes('bd-empty'));
});

test('linkGrid escapes item names', () => {
  const html = c.linkGrid([{ name: '<script>', path: '/x/' }]);
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('linkGrid renders a pending item as text, never as a link', () => {
  const html = c.linkGrid([{ name: 'Germany', path: '/germany/', pending: true }]);
  assert.ok(!html.includes('<a '), 'pending item must not be a link');
  assert.ok(html.includes('coming soon'));
  assert.ok(html.includes('Germany'));
});

test('linkGrid still links a non-pending item', () => {
  const html = c.linkGrid([{ name: 'United States', path: '/united-states/' }]);
  assert.ok(html.includes('<a href="/united-states/">'));
  assert.ok(!html.includes('coming soon'));
});

test('directoryDetail renders every unknown field as an em dash, never zero', () => {
  const html = c.directoryDetail({
    name: 'Example', slug: 'example', website: 'https://example.com',
    description: 'A directory.', tier: null, petroHrysScore: null, domainRating: null,
    authorityScore: null, estimatedTraffic: null, referringDomains: null, free: null,
    paid: null, verificationRequired: null, manualReview: null, acceptsCompanies: null,
    acceptsProducts: null, acceptsSaaS: null, acceptsApps: null, acceptsStartups: null,
    acceptsAI: null, backlinkType: null, robots: null, sitemap: null, indexed: null,
    ssl: null, lastVerified: null, nextVerification: null, httpStatus: null,
    recommendedIndustries: [], pros: [], cons: [], editorNotes: '', metricsProvenance: {},
  });
  assert.ok(html.includes('&mdash;'));
  assert.ok(!/>0</.test(html), 'must never render 0 for an unknown value');
});

test('directoryDetail marks the outbound website link as external and nofollow', () => {
  const html = c.directoryDetail({
    name: 'Example', slug: 'example', website: 'https://example.com', description: 'D',
    recommendedIndustries: [], pros: [], cons: [], editorNotes: '', metricsProvenance: {},
  });
  assert.ok(html.includes('rel="nofollow noopener"'));
});

test('sortControl lists every sort key', () => {
  const html = c.sortControl();
  for (const key of ['default', 'domain-rating', 'authority-score', 'traffic', 'alphabetical']) {
    assert.ok(html.includes(`value="${key}"`), `missing ${key}`);
  }
});

test('directoryTable returns an empty state when there are no rows', () => {
  assert.ok(c.directoryTable([]).includes('bd-empty'));
});

test('every generated class name is bd- prefixed', () => {
  const html = [c.sortControl(), c.filterBar(), c.searchBox(), c.directoryTable([]),
    c.emptyState('x'), c.metricNote()].join('\n');
  for (const match of html.matchAll(/class="([^"]+)"/g)) {
    for (const cls of match[1].split(/\s+/)) {
      assert.ok(cls.startsWith('bd-'), `non-bd class leaked: ${cls}`);
    }
  }
});

test('pagination returns empty string for a single page', () => {
  assert.strictEqual(c.pagination({ current: 1, total: 1, basePath: '/x/' }), '');
});

test('pagination links to page/2/ when there are two pages', () => {
  const html = c.pagination({ current: 1, total: 2, basePath: '/x/' });
  assert.ok(html.includes('/x/page/2/'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/tests/bd-components.test.cjs`
Expected: FAIL — `Cannot find module '../lib/bd-components.cjs'`

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/bd-components.cjs
'use strict';
const { escapeHtml } = require('./bd-util.cjs');
const { SORTS, SORT_KEYS } = require('./bd-sort.cjs');

const VERIFICATION_NOTE =
  'Entries are published only after manual verification, so this list stays empty until real, checked directories are added.';

function emptyState(message) {
  return `<p class="bd-empty">${escapeHtml(message)} ${escapeHtml(VERIFICATION_NOTE)}</p>`;
}

function metric(value, provenance) {
  if (value === null || value === undefined) {
    return '<span class="bd-metric bd-metric--empty">&mdash;</span>';
  }
  const shown = escapeHtml(value);
  if (provenance && provenance.provider && provenance.measuredAt) {
    return `<span class="bd-metric">${shown}<span class="bd-metric-source">` +
      `${escapeHtml(provenance.provider)}, measured ${escapeHtml(provenance.measuredAt)}` +
      `</span></span>`;
  }
  return `<span class="bd-metric">${shown}</span>`;
}

function metricNote() {
  return '<p class="bd-note">Domain Rating, Authority Score, estimated traffic and referring domains are ' +
    'third-party metrics produced by their respective providers, not by PetroHrys.com. ' +
    'The PetroHrys Score is a first-party editorial assessment.</p>';
}

// A pending route has not been written to disk. It must never be linked, or the
// page would advertise a 404.
function linkGrid(items) {
  if (!items.length) return '';
  const rows = items.map((item) => {
    if (item.pending) {
      return `      <li><span class="bd-pending">${escapeHtml(item.name)}</span> ` +
        `<span class="bd-tag">coming soon</span></li>`;
    }
    return `      <li><a href="${escapeHtml(item.path)}">${escapeHtml(item.name)}</a></li>`;
  }).join('\n');
  return `    <ul class="bd-grid">\n${rows}\n    </ul>`;
}

const BOOLEAN_FIELDS = [
  ['free', 'Free listing'], ['paid', 'Paid listing'],
  ['verificationRequired', 'Verification required'], ['manualReview', 'Manual review'],
  ['acceptsCompanies', 'Accepts companies'], ['acceptsProducts', 'Accepts products'],
  ['acceptsSaaS', 'Accepts SaaS'], ['acceptsApps', 'Accepts apps'],
  ['acceptsStartups', 'Accepts startups'], ['acceptsAI', 'Accepts AI products'],
  ['sitemap', 'Publishes a sitemap'], ['indexed', 'Listings indexed'], ['ssl', 'HTTPS'],
];

const PLAIN_FIELDS = [
  ['tier', 'Tier'], ['backlinkType', 'Backlink type'], ['robots', 'Crawlability'],
  ['httpStatus', 'HTTP status'], ['lastVerified', 'Last verified'],
  ['nextVerification', 'Next verification'],
];

function unknown() {
  return '<span class="bd-metric bd-metric--empty">&mdash;</span>';
}

function boolCell(value) {
  if (value === null || value === undefined) return unknown();
  return `<span class="bd-metric">${value ? 'Yes' : 'No'}</span>`;
}

function plainCell(value) {
  if (value === null || value === undefined || value === '') return unknown();
  return `<span class="bd-metric">${escapeHtml(value)}</span>`;
}

function defRow(label, valueHtml) {
  return `        <div class="bd-def"><dt class="bd-def-t">${escapeHtml(label)}</dt>` +
    `<dd class="bd-def-d">${valueHtml}</dd></div>`;
}

function bulletList(items, emptyMessage) {
  if (!items || !items.length) return `      <p class="bd-empty">${escapeHtml(emptyMessage)}</p>`;
  return `      <ul class="bd-list">\n` +
    items.map((i) => `        <li>${escapeHtml(i)}</li>`).join('\n') + `\n      </ul>`;
}

function directoryDetail(d) {
  const p = d.metricsProvenance || {};
  const rows = [
    defRow('PetroHrys Score', metric(d.petroHrysScore)),
    defRow('Domain Rating', metric(d.domainRating, p.domainRating)),
    defRow('Authority Score', metric(d.authorityScore, p.authorityScore)),
    defRow('Estimated traffic', metric(d.estimatedTraffic, p.estimatedTraffic)),
    defRow('Referring domains', metric(d.referringDomains, p.referringDomains)),
    ...PLAIN_FIELDS.map(([field, label]) => defRow(label, plainCell(d[field]))),
    ...BOOLEAN_FIELDS.map(([field, label]) => defRow(label, boolCell(d[field]))),
  ].join('\n');

  return `    <div class="bd-detail">
      <p class="bd-detail-site"><a href="${escapeHtml(d.website)}" rel="nofollow noopener" target="_blank">${escapeHtml(d.website)}</a></p>
      <dl class="bd-defs">
${rows}
      </dl>
${metricNote()}
    </div>

    <section class="bd-section" aria-labelledby="industries">
      <h2 id="industries">Recommended industries</h2>
${bulletList(d.recommendedIndustries, 'No recommended industries recorded yet.')}
    </section>

    <section class="bd-section" aria-labelledby="pros">
      <h2 id="pros">Strengths</h2>
${bulletList(d.pros, 'No strengths recorded yet.')}
    </section>

    <section class="bd-section" aria-labelledby="cons">
      <h2 id="cons">Limitations</h2>
${bulletList(d.cons, 'No limitations recorded yet.')}
    </section>

    <section class="bd-section" aria-labelledby="notes">
      <h2 id="notes">Editor notes</h2>
      ${d.editorNotes ? `<p class="bd-note">${escapeHtml(d.editorNotes)}</p>` : '<p class="bd-empty">No editor notes recorded yet.</p>'}
    </section>`;
}

function sortControl() {
  const options = SORT_KEYS.map((key) =>
    `        <option value="${key}">${escapeHtml(SORTS[key].label)}</option>`).join('\n');
  return `    <div class="bd-control" data-bd-sort-wrap hidden>
      <label class="bd-label" for="bd-sort">Sort by</label>
      <select class="bd-select" id="bd-sort" data-bd-sort>
${options}
      </select>
    </div>`;
}

const FILTERS = [
  { field: 'free', label: 'Free listing' },
  { field: 'paid', label: 'Paid listing' },
  { field: 'verificationRequired', label: 'Verification required' },
  { field: 'acceptsSaaS', label: 'Accepts SaaS' },
  { field: 'acceptsStartups', label: 'Accepts startups' },
  { field: 'acceptsAI', label: 'Accepts AI products' },
];

function filterBar() {
  const boxes = FILTERS.map((f) =>
    `        <label class="bd-check"><input type="checkbox" data-bd-filter="${f.field}"> ` +
    `${escapeHtml(f.label)}</label>`).join('\n');
  return `    <div class="bd-control" data-bd-filter-wrap hidden>
      <span class="bd-label">Filter</span>
      <div class="bd-checks">
${boxes}
      </div>
    </div>`;
}

function searchBox() {
  return `    <div class="bd-control" data-bd-search-wrap hidden>
      <label class="bd-label" for="bd-search">Search</label>
      <input class="bd-input" id="bd-search" type="search" data-bd-search
             placeholder="Filter by name, description or industry" autocomplete="off">
    </div>`;
}

function directoryRow(d) {
  const p = d.metricsProvenance || {};
  const data = [
    `data-bd-name="${escapeHtml((d.name || '').toLowerCase())}"`,
    `data-bd-haystack="${escapeHtml([d.name, d.description, ...(d.recommendedIndustries || [])].join(' ').toLowerCase())}"`,
    `data-bd-score="${d.petroHrysScore === null ? '' : escapeHtml(d.petroHrysScore)}"`,
    `data-bd-dr="${d.domainRating === null ? '' : escapeHtml(d.domainRating)}"`,
    `data-bd-as="${d.authorityScore === null ? '' : escapeHtml(d.authorityScore)}"`,
    `data-bd-traffic="${d.estimatedTraffic === null ? '' : escapeHtml(d.estimatedTraffic)}"`,
    ...FILTERS.map((f) => `data-bd-${f.field.toLowerCase()}="${d[f.field] === true ? '1' : '0'}"`),
  ].join(' ');
  return `        <tr class="bd-row" ${data}>
          <td class="bd-cell"><a href="${escapeHtml(d.slug)}/">${escapeHtml(d.name)}</a></td>
          <td class="bd-cell">${metric(d.petroHrysScore)}</td>
          <td class="bd-cell">${metric(d.domainRating, p.domainRating)}</td>
          <td class="bd-cell">${metric(d.authorityScore, p.authorityScore)}</td>
          <td class="bd-cell">${metric(d.estimatedTraffic, p.estimatedTraffic)}</td>
        </tr>`;
}

function directoryTable(directories) {
  if (!directories.length) return emptyState('No directories are published here yet.');
  return `    <table class="bd-table">
      <thead>
        <tr>
          <th class="bd-cell" scope="col">Directory</th>
          <th class="bd-cell" scope="col">PetroHrys Score</th>
          <th class="bd-cell" scope="col">Domain Rating</th>
          <th class="bd-cell" scope="col">Authority Score</th>
          <th class="bd-cell" scope="col">Estimated Traffic</th>
        </tr>
      </thead>
      <tbody data-bd-rows>
${directories.map(directoryRow).join('\n')}
      </tbody>
    </table>`;
}

function faqSection(faqs) {
  const items = faqs.map(({ q, a }) =>
    `      <div class="bd-faq-item">
        <h3 class="bd-faq-q">${escapeHtml(q)}</h3>
        <p class="bd-faq-a">${escapeHtml(a)}</p>
      </div>`).join('\n');
  return `    <div class="bd-faq">\n${items}\n    </div>`;
}

function pagination({ current, total, basePath }) {
  if (total <= 1) return '';
  const link = (n, label) => {
    const href = n === 1 ? basePath : `${basePath}page/${n}/`;
    return n === current
      ? `        <span class="bd-page bd-page--current" aria-current="page">${escapeHtml(label)}</span>`
      : `        <a class="bd-page" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
  };
  const pages = [];
  for (let n = 1; n <= total; n += 1) pages.push(link(n, String(n)));
  return `    <nav class="bd-pagination" aria-label="Pagination">\n${pages.join('\n')}\n    </nav>`;
}

module.exports = {
  emptyState, metric, metricNote, linkGrid, sortControl, filterBar,
  searchBox, directoryRow, directoryTable, directoryDetail, faqSection,
  pagination, VERIFICATION_NOTE, FILTERS,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/tests/bd-components.test.cjs`
Expected: PASS, 10 tests

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/bd-components.cjs scripts/tests/bd-components.test.cjs
git commit -m "feat(bd): add reusable bd- prefixed HTML components"
```

---

### Task 7: Page shell renderer

**Files:**
- Create: `scripts/lib/bd-render.cjs`
- Test: `scripts/tests/bd-render.test.cjs`
- Read for reference: `research/index.html` (copy the head/header/footer markup verbatim)

**Interfaces:**
- Consumes: `bd-seo.cjs`, `bd-util.cjs`
- Produces: `renderPage({title, description, canonicalPath, robots, jsonLd, breadcrumbTrail, main}): string`

**Important:** open `research/index.html` and copy the analytics block, font links, ecosystem-banner markers, `<header>`, and `<footer>` **exactly**. Do not retype from memory. Omit only the `msvalidate.01` placeholder meta.

- [ ] **Step 1: Write the failing test**

```js
// scripts/tests/bd-render.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { renderPage } = require('../lib/bd-render.cjs');

const page = () => renderPage({
  title: 'Business Directories',
  description: 'A research index of business directories.',
  canonicalPath: '/research/business-directories/',
  robots: 'noindex,follow',
  jsonLd: [{ '@type': 'WebPage', name: 'Business Directories' }],
  breadcrumbTrail: [
    { name: 'Home', path: '/' },
    { name: 'Research', path: '/research/' },
    { name: 'Business Directories', path: '/research/business-directories/' },
  ],
  main: '<p>Body</p>',
});

test('emits a complete html document', () => {
  const html = page();
  assert.ok(html.startsWith('<!DOCTYPE html>'));
  assert.ok(html.trimEnd().endsWith('</html>'));
});

test('canonical uses the www origin', () => {
  assert.ok(page().includes('<link rel="canonical" href="https://www.petrohrys.com/research/business-directories/">'));
});

test('robots directive is emitted when supplied', () => {
  assert.ok(page().includes('<meta name="robots" content="noindex,follow">'));
});

test('robots directive is omitted when not supplied', () => {
  const html = renderPage({
    title: 'T', description: 'D', canonicalPath: '/x/', jsonLd: [],
    breadcrumbTrail: [{ name: 'Home', path: '/' }], main: '<p>x</p>',
  });
  assert.ok(!html.includes('name="robots"'));
});

test('loads both the site stylesheet and the section stylesheet', () => {
  const html = page();
  assert.ok(html.includes('href="/css/petrohrys.css"'));
  assert.ok(html.includes('href="/css/business-directories.css"'));
});

test('never contains the unfilled bing verification placeholder', () => {
  assert.ok(!page().includes('PASTE_YOUR_BING_VERIFICATION_CODE_HERE'));
});

test('reuses the site nav and includes the Research Center item', () => {
  const html = page();
  assert.ok(html.includes('class="nav-primary"'));
  assert.ok(html.includes('>Research Center<'));
  assert.ok(html.includes('href="/work/"'));
  assert.ok(html.includes('>Research &amp; Writing<'));
});

test('includes the ecosystem banner markers', () => {
  const html = page();
  assert.ok(html.includes('helperg-eco:head:start'));
  assert.ok(html.includes('helperg-eco:body:start'));
});

test('renders the breadcrumb trail with the site breadcrumb class', () => {
  const html = page();
  assert.ok(html.includes('class="breadcrumb"'));
  assert.ok(html.includes('aria-current="page">Business Directories</span>'));
});

test('all four social/meta tags are present', () => {
  const html = page();
  for (const tag of ['og:title', 'og:description', 'og:url', 'twitter:card']) {
    assert.ok(html.includes(tag), `missing ${tag}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/tests/bd-render.test.cjs`
Expected: FAIL — `Cannot find module '../lib/bd-render.cjs'`

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/bd-render.cjs
'use strict';
const { escapeHtml } = require('./bd-util.cjs');
const { absoluteUrl, renderJsonLd, breadcrumbList } = require('./bd-seo.cjs');

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

const NAV_ITEMS = `            <li><a href="/work/">Work</a></li>
            <li><a href="/research/">Research Center</a></li>
            <li><a href="/writing/">Research &amp; Writing</a></li>
            <li><a href="/about/">About</a></li>`;

const LANGS = `            <li><a href="/">EN</a></li>
            <li><a href="/es/">ES</a></li>
            <li><a href="/fr/">FR</a></li>
            <li><a href="/de/">DE</a></li>`;

const HEADER = `  <header role="banner">
    <nav aria-label="Primary">
      <a href="/" class="wordmark">Petro Hrys</a>
      <ul class="nav-primary">
${NAV_ITEMS}
      </ul>
      <ul class="nav-lang" aria-label="Language">
${LANGS}
      </ul>
      <details class="nav-mobile">
        <summary>Menu</summary>
        <div class="nav-mobile-panel">
          <ul class="nav-primary">
${NAV_ITEMS}
          </ul>
          <ul class="nav-lang" aria-label="Language">
${LANGS}
          </ul>
        </div>
      </details>
    </nav>
  </header>`;

const FOOTER = `  <footer role="contentinfo">
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
          <li><a href="/research/business-directories/">Business Directories</a></li>
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

function renderBreadcrumb(trail) {
  const parts = trail.map((entry, index) => {
    const last = index === trail.length - 1;
    return last
      ? `<span aria-current="page">${escapeHtml(entry.name)}</span>`
      : `<a href="${escapeHtml(entry.path)}">${escapeHtml(entry.name)}</a>`;
  });
  return `    <p class="breadcrumb">\n      ${parts.join('<span class="sep">/</span>')}\n    </p>`;
}

function renderPage({ title, description, canonicalPath, robots, jsonLd, breadcrumbTrail, main }) {
  const canonical = absoluteUrl(canonicalPath);
  const fullTitle = `${title} — Petro Hrys`;
  const graph = [...jsonLd, breadcrumbList(breadcrumbTrail)];
  const robotsTag = robots ? `\n  <meta name="robots" content="${escapeHtml(robots)}">` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
${ANALYTICS}
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>${escapeHtml(fullTitle)}</title>
  <meta name="description" content="${escapeHtml(description)}">${robotsTag}

  <meta property="og:title" content="${escapeHtml(fullTitle)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Petro Hrys">
  <meta property="og:image" content="https://www.petrohrys.com/images/og-default.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@petrohrys">
  <meta name="twitter:title" content="${escapeHtml(fullTitle)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="https://www.petrohrys.com/images/og-default.png">

  <link rel="canonical" href="${escapeHtml(canonical)}">
  <link rel="sitemap" type="application/xml" href="https://www.petrohrys.com/sitemap.xml">
  <link rel="icon" href="/images/logo-red.svg">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&family=JetBrains+Mono:wght@500&family=Source+Serif+4:opsz,wght@8..60,400;8..60,500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/petrohrys.css">
  <link rel="stylesheet" href="/css/business-directories.css">

${renderJsonLd(graph)}
${ECO_HEAD}
</head>
<body>
  <a class="skip" href="#main">Skip to content</a>
${ECO_BODY}

${HEADER}

  <main id="main">
${renderBreadcrumb(breadcrumbTrail)}

${main}
  </main>

${FOOTER}
  <script src="/js/business-directories.js" defer></script>
</body>
</html>
`;
}

module.exports = { renderPage };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/tests/bd-render.test.cjs`
Expected: PASS, 10 tests

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/bd-render.cjs scripts/tests/bd-render.test.cjs
git commit -m "feat(bd): add page shell renderer matching the editorial system"
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
- Produces: `.bd-*` styles and a progressive-enhancement script. No module exports.

- [ ] **Step 1: Write the failing test**

```js
// scripts/tests/bd-assets.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const css = () => fs.readFileSync(path.join(root, 'css', 'business-directories.css'), 'utf8');

test('every selector in the section stylesheet is bd- namespaced', () => {
  const withoutComments = css().replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks = withoutComments.split('}');
  for (const block of blocks) {
    const selector = block.split('{')[0].trim();
    if (!selector || selector.startsWith('@')) continue;
    for (const part of selector.split(',')) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      assert.ok(trimmed.includes('.bd-'), `selector is not bd- namespaced: ${trimmed}`);
    }
  }
});

test('the stylesheet declares no raw hex colors', () => {
  assert.strictEqual(css().match(/#[0-9a-fA-F]{3,8}\b/g), null);
});

test('the stylesheet declares no font-family or font-size literals', () => {
  const withoutComments = css().replace(/\/\*[\s\S]*?\*\//g, '');
  for (const decl of withoutComments.match(/font-(family|size)\s*:[^;]+;/g) || []) {
    assert.ok(decl.includes('var(--'), `font declaration must use a token: ${decl}`);
  }
});

test('the stylesheet never redefines an existing site selector', () => {
  const site = fs.readFileSync(path.join(root, 'css', 'petrohrys.css'), 'utf8');
  const existing = new Set((site.match(/\.[a-zA-Z0-9_-]+/g) || []).map((s) => s.slice(1)));
  for (const cls of (css().match(/\.[a-zA-Z0-9_-]+/g) || []).map((s) => s.slice(1))) {
    if (existing.has(cls)) assert.fail(`section CSS reuses existing site class: .${cls}`);
  }
});

test('the client script performs no network requests', () => {
  const js = fs.readFileSync(path.join(root, 'js', 'business-directories.js'), 'utf8');
  for (const forbidden of ['fetch(', 'XMLHttpRequest', 'import(', 'WebSocket']) {
    assert.ok(!js.includes(forbidden), `client script must not use ${forbidden}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/tests/bd-assets.test.cjs`
Expected: FAIL — `ENOENT ... css/business-directories.css`

- [ ] **Step 3: Write `css/business-directories.css`**

```css
/* Business Directories — Research Center.
   Consumes tokens from petrohrys.css only. Declares no raw colors, fonts, or spacing. */

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

.bd-grid {
  list-style: none;
  padding: 0;
  margin: var(--s-4) 0 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
  gap: var(--s-2);
}

.bd-grid a { color: var(--blue); }
.bd-grid a:hover { color: var(--blue-strong); }

.bd-tag {
  color: var(--text-3);
  font-size: var(--fs-xs);
  font-family: var(--ff-mono);
}

.bd-pending { color: var(--text-3); }

.bd-detail { margin-top: var(--s-4); }

.bd-detail-site { font-family: var(--ff-mono); font-size: var(--fs-sm); }

.bd-defs {
  margin: var(--s-4) 0 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
  gap: var(--s-3);
}

.bd-def { border-top: var(--rule-w) solid var(--rule); padding-top: var(--s-1); }
.bd-def-t { color: var(--text-3); font-size: var(--fs-xs); }
.bd-def-d { margin: 0; color: var(--text); }

.bd-list { color: var(--text-2); margin: var(--s-3) 0 0; padding-left: var(--s-4); }

.bd-controls {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-3);
  margin-top: var(--s-4);
}

.bd-label {
  display: block;
  color: var(--text-2);
  font-size: var(--fs-sm);
  margin-bottom: var(--s-0);
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
.bd-input:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }

.bd-checks { display: flex; flex-wrap: wrap; gap: var(--s-2); }

.bd-check {
  color: var(--text-2);
  font-size: var(--fs-sm);
  display: inline-flex;
  align-items: center;
  gap: var(--s-0);
}

.bd-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: var(--s-4);
  font-size: var(--fs-sm);
}

.bd-cell {
  text-align: left;
  padding: var(--s-2);
  border-bottom: var(--rule-w) solid var(--rule);
  vertical-align: top;
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

.bd-faq { margin-top: var(--s-4); }
.bd-faq-item + .bd-faq-item { margin-top: var(--s-4); }
.bd-faq-q { font-size: var(--fs-md); margin: 0 0 var(--s-1); }
.bd-faq-a { color: var(--text-2); margin: 0; }

.bd-pagination { display: flex; gap: var(--s-1); margin-top: var(--s-5); }

.bd-page {
  color: var(--blue);
  border: var(--rule-w) solid var(--rule);
  border-radius: var(--s-0);
  padding: var(--s-0) var(--s-2);
  font-size: var(--fs-sm);
}

.bd-page--current { color: var(--text-3); background: var(--bg-soft); }
```

- [ ] **Step 4: Write `js/business-directories.js`**

```js
/* Business Directories — progressive enhancement only.
   Reorders and hides DOM that is already prerendered. Performs no network requests. */
(function () {
  'use strict';

  var tbody = document.querySelector('[data-bd-rows]');
  if (!tbody) return;

  var rows = Array.prototype.slice.call(tbody.querySelectorAll('.bd-row'));
  if (!rows.length) return;

  ['[data-bd-sort-wrap]', '[data-bd-filter-wrap]', '[data-bd-search-wrap]'].forEach(function (sel) {
    var el = document.querySelector(sel);
    if (el) el.hidden = false;
  });

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

  function byName(a, b) {
    return a.getAttribute('data-bd-name').localeCompare(b.getAttribute('data-bd-name'), 'en');
  }

  var COMPARATORS = {
    'default': function (a, b) {
      return nullLastDesc(num(a, 'score'), num(b, 'score'))
        || nullLastDesc(num(a, 'dr'), num(b, 'dr')) || byName(a, b);
    },
    'domain-rating': function (a, b) { return nullLastDesc(num(a, 'dr'), num(b, 'dr')) || byName(a, b); },
    'authority-score': function (a, b) { return nullLastDesc(num(a, 'as'), num(b, 'as')) || byName(a, b); },
    'traffic': function (a, b) { return nullLastDesc(num(a, 'traffic'), num(b, 'traffic')) || byName(a, b); },
    'alphabetical': byName
  };

  var sortSelect = document.querySelector('[data-bd-sort]');
  var searchInput = document.querySelector('[data-bd-search]');
  var filters = Array.prototype.slice.call(document.querySelectorAll('[data-bd-filter]'));

  function apply() {
    var key = sortSelect ? sortSelect.value : 'default';
    var ordered = rows.slice().sort(COMPARATORS[key] || COMPARATORS['default']);
    ordered.forEach(function (row) { tbody.appendChild(row); });

    var query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    var active = filters.filter(function (f) { return f.checked; });

    rows.forEach(function (row) {
      var visible = true;
      if (query && row.getAttribute('data-bd-haystack').indexOf(query) === -1) visible = false;
      active.forEach(function (f) {
        var attr = 'data-bd-' + f.getAttribute('data-bd-filter').toLowerCase();
        if (row.getAttribute(attr) !== '1') visible = false;
      });
      row.hidden = !visible;
    });
  }

  if (sortSelect) sortSelect.addEventListener('change', apply);
  if (searchInput) searchInput.addEventListener('input', apply);
  filters.forEach(function (f) { f.addEventListener('change', apply); });
})();
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test scripts/tests/bd-assets.test.cjs`
Expected: PASS, 5 tests

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
- Consumes: every `bd-*` library module
- Produces: `pageModel(registry): Page[]` where each `Page` has `kind` (`'hub'|'country'|'category'|'directory'`), `outPath`, `title`, `description`, `canonicalPath`, `robots`, `lastmod?`, `jsonLd`, `breadcrumbTrail`, `main`; and `buildAll({dataRoot?, outRoot?}): { written: string[], removed: string[], pages: number }`. Runs as CLI when invoked directly.
- **No `--country=` subset flag.** A filtered build combined with pruning would delete every route it did not regenerate. Incremental behaviour comes from `writeIfChanged`, not from partial builds.
- `dataRoot`/`outRoot` exist so tests build into temp directories and never touch the real site.

- [ ] **Step 1: Write the failing test**

```js
// scripts/tests/bd-build.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildAll, pageModel } = require('../build-business-directories.cjs');
const { loadRegistry } = require('../lib/bd-registry.cjs');
const { PATHS } = require('../lib/bd-util.cjs');

const HUB = 'research/business-directories/index.html';
const REF_COUNTRY = 'research/business-directories/united-states/index.html';
const REF_CATEGORY = 'research/business-directories/united-states/categories/general-business/index.html';
const SAAS_CATEGORY = 'research/business-directories/united-states/categories/saas/index.html';
const DETAIL = 'research/business-directories/united-states/example-directory/index.html';
const GERMANY = 'research/business-directories/germany/index.html';

// Builds an isolated data root + output root so tests never touch the real site.
function fixture(byCountry = {}) {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bd-data-'));
  const outRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bd-out-'));
  fs.copyFileSync(path.join(PATHS.dataRoot, 'countries.json'), path.join(dataRoot, 'countries.json'));
  fs.copyFileSync(path.join(PATHS.dataRoot, 'categories.json'), path.join(dataRoot, 'categories.json'));
  fs.mkdirSync(path.join(dataRoot, 'directories'));
  const countries = JSON.parse(fs.readFileSync(path.join(dataRoot, 'countries.json'), 'utf8'));
  for (const country of countries) {
    writeDirs(dataRoot, country.slug, byCountry[country.slug] || []);
  }
  return { dataRoot, outRoot };
}

function writeDirs(dataRoot, countrySlug, entries) {
  fs.writeFileSync(path.join(dataRoot, 'directories', `${countrySlug}.json`),
    `${JSON.stringify(entries, null, 2)}\n`);
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

const has = (outRoot, rel) => fs.existsSync(path.join(outRoot, rel));
const read = (outRoot, rel) => fs.readFileSync(path.join(outRoot, rel), 'utf8');

test('the hub is always emitted and is indexable', () => {
  const { dataRoot, outRoot } = fixture();
  buildAll({ dataRoot, outRoot });
  assert.ok(has(outRoot, HUB));
  assert.ok(!read(outRoot, HUB).includes('name="robots"'));
});

test('the reference country and category are emitted even with no data', () => {
  const { dataRoot, outRoot } = fixture();
  buildAll({ dataRoot, outRoot });
  assert.ok(has(outRoot, REF_COUNTRY));
  assert.ok(has(outRoot, REF_CATEGORY));
  assert.ok(read(outRoot, REF_COUNTRY).includes('noindex,follow'));
  assert.ok(read(outRoot, REF_CATEGORY).includes('noindex,follow'));
});

test('an empty non-reference country is not emitted', () => {
  const { dataRoot, outRoot } = fixture();
  buildAll({ dataRoot, outRoot });
  assert.ok(!has(outRoot, GERMANY));
});

test('an empty non-reference category is not emitted', () => {
  const { dataRoot, outRoot } = fixture();
  buildAll({ dataRoot, outRoot });
  assert.ok(!has(outRoot, SAAS_CATEGORY));
});

test('only the lean scaffold is written when there is no data', () => {
  const { dataRoot, outRoot } = fixture();
  buildAll({ dataRoot, outRoot });
  const count = countPages(path.join(outRoot, 'research', 'business-directories'));
  assert.strictEqual(count, 3, 'expected hub + reference country + reference category');
});

function countPages(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) total += countPages(path.join(dir, entry.name));
    else if (entry.name === 'index.html') total += 1;
  }
  return total;
}

test('adding the first real directory emits its country, category and detail pages', () => {
  const { dataRoot, outRoot } = fixture({ 'united-states': [record()] });
  buildAll({ dataRoot, outRoot });
  assert.ok(has(outRoot, SAAS_CATEGORY), 'category page missing');
  assert.ok(has(outRoot, DETAIL), 'detail page missing');
  assert.ok(!read(outRoot, SAAS_CATEGORY).includes('noindex'), 'populated category must be indexable');
  assert.ok(!read(outRoot, REF_COUNTRY).includes('noindex'), 'populated country must be indexable');
});

test('a directory in a new country emits that country page', () => {
  const { dataRoot, outRoot } = fixture({
    germany: [record({ id: 'de-example', country: 'germany' })],
  });
  buildAll({ dataRoot, outRoot });
  assert.ok(has(outRoot, GERMANY));
});

test('removing the last directory prunes the now-empty dependent pages', () => {
  const { dataRoot, outRoot } = fixture({ 'united-states': [record()] });
  buildAll({ dataRoot, outRoot });
  assert.ok(has(outRoot, SAAS_CATEGORY));
  assert.ok(has(outRoot, DETAIL));

  writeDirs(dataRoot, 'united-states', []);
  const result = buildAll({ dataRoot, outRoot });

  assert.ok(!has(outRoot, SAAS_CATEGORY), 'stale category page was not pruned');
  assert.ok(!has(outRoot, DETAIL), 'stale detail page was not pruned');
  assert.ok(result.removed.length >= 2);
  assert.ok(has(outRoot, REF_COUNTRY), 'reference country must survive pruning');
  assert.ok(has(outRoot, HUB), 'hub must survive pruning');
});

test('no empty route enters the sitemap', () => {
  const { dataRoot, outRoot } = fixture();
  buildAll({ dataRoot, outRoot });
  const xml = read(outRoot, 'sitemap-business-directories.xml');
  assert.ok(xml.includes('<loc>https://www.petrohrys.com/research/business-directories/</loc>'));
  assert.ok(!xml.includes('/united-states/'), 'empty reference routes must stay out of the sitemap');
});

test('RSS has no items while no verified directory exists', () => {
  const { dataRoot, outRoot } = fixture();
  buildAll({ dataRoot, outRoot });
  const xml = read(outRoot, 'research/business-directories/feed.xml');
  assert.ok(xml.includes('<channel>'));
  assert.ok(!xml.includes('<item>'));
});

test('a verified directory appears in RSS and the sitemap', () => {
  const { dataRoot, outRoot } = fixture({
    'united-states': [record({ lastVerified: '2026-08-01' })],
  });
  buildAll({ dataRoot, outRoot });
  assert.ok(read(outRoot, 'research/business-directories/feed.xml').includes('<item>'));
  assert.ok(read(outRoot, 'sitemap-business-directories.xml').includes('/united-states/example-directory/'));
});

test('the hub never links an un-emitted country', () => {
  const { dataRoot, outRoot } = fixture();
  const hub = read(outRoot, HUB) || '';
  buildAll({ dataRoot, outRoot });
  const html = read(outRoot, HUB);
  assert.ok(!html.includes('href="/research/business-directories/germany/"'),
    'hub must not link a page that was never written');
  assert.ok(html.includes('coming soon'));
  assert.ok(html.includes('href="/research/business-directories/united-states/"'));
  void hub;
});

test('a second build writes nothing — output is byte-stable', () => {
  const { dataRoot, outRoot } = fixture();
  buildAll({ dataRoot, outRoot });
  const second = buildAll({ dataRoot, outRoot });
  assert.deepStrictEqual(second.written, []);
  assert.deepStrictEqual(second.removed, []);
});

test('no generated page contains the bing placeholder', () => {
  const { dataRoot, outRoot } = fixture();
  buildAll({ dataRoot, outRoot });
  assert.ok(!read(outRoot, HUB).includes('PASTE_YOUR_BING'));
});

test('the route builder still supports the complete 10x21 matrix', () => {
  const registry = loadRegistry();
  const byCountry = {};
  let n = 0;
  for (const country of registry.countries) {
    byCountry[country.slug] = registry.categories.map((category) => {
      n += 1;
      return record({
        id: `id-${n}`, slug: `dir-${n}`, country: country.slug, category: category.slug,
      });
    });
  }
  const { dataRoot } = fixture(byCountry);
  const pages = pageModel(loadRegistry(dataRoot));
  const countries = pages.filter((p) => p.kind === 'country').length;
  const categories = pages.filter((p) => p.kind === 'category').length;
  const details = pages.filter((p) => p.kind === 'directory').length;
  assert.strictEqual(countries, 10);
  assert.strictEqual(categories, 210);
  assert.strictEqual(details, 210);
  assert.strictEqual(pages.length, 431);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/tests/bd-build.test.cjs`
Expected: FAIL — `Cannot find module '../build-business-directories.cjs'`

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/build-business-directories.cjs
'use strict';
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

const REFERENCE_COUNTRY = 'united-states';
const REFERENCE_CATEGORY = 'general-business';
const SECTION_DIR = path.join('research', 'business-directories');

// A country page is written when it is the reference country or has real data.
function countryEmitted(registry, country) {
  return country.slug === REFERENCE_COUNTRY
    || directoriesFor(registry, country.slug).length > 0;
}

// A category page is written when it has real data, or is the single reference category.
function categoryEmitted(registry, country, category) {
  if (directoriesFor(registry, country.slug, category.slug).length > 0) return true;
  return country.slug === REFERENCE_COUNTRY && category.slug === REFERENCE_CATEGORY;
}

function toPubDate(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`).toUTCString();
}

// Deletes generated index.html files that the current registry no longer produces,
// then removes any directory left empty. Confined to the section root; never
// touches feed.xml.
function pruneStale(sectionRoot, expected) {
  if (!fs.existsSync(sectionRoot)) return [];
  const removed = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'index.html' && !expected.has(full)) {
        fs.unlinkSync(full);
        removed.push(full);
      }
    }
    if (dir !== sectionRoot && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
  };
  walk(sectionRoot);
  return removed;
}

function pageModel(registry) {
  const pages = [];
  const countryLinks = registry.countries.map((country) => ({
    name: country.name,
    path: `${BASE}${country.slug}/`,
    pending: !countryEmitted(registry, country),
  }));

  const hubMain = [
    `    <article class="page-hero">
      <h1>Business Directories</h1>
      <p class="lede">A country-by-country research index of business directories, recording what each one accepts, how it links, and when it was last verified.</p>
    </article>`,
    section('methodology', 'Methodology',
      `      <p class="bd-note">Every directory is checked by hand before publication. Each record stores what the directory accepts, whether listing is free or paid, whether verification or manual review is required, how it links out, and the date it was verified. Nothing is published from an automated crawl, and no value is estimated or inferred.</p>
${c.metricNote()}`),
    section('countries', 'Countries', c.linkGrid(countryLinks)),
    section('faq', 'Questions', c.faqSection(HUB_FAQS)),
  ].join('\n\n');

  pages.push({
    kind: 'hub',
    outPath: path.join(SECTION_DIR, 'index.html'),
    title: 'Business Directories',
    description: 'A country-by-country research index of business directories, with verification dates and sourcing for every metric.',
    canonicalPath: BASE,
    robots: undefined,
    jsonLd: [
      seo.collectionPage({
        name: 'Business Directories',
        description: 'A country-by-country research index of business directories.',
        url: seo.absoluteUrl(BASE),
      }),
      // Only emitted routes may appear in ItemList; listing an unwritten page
      // would point structured data at a 404.
      seo.itemList(countryLinks.filter((l) => !l.pending).map((l) => ({ name: l.name, path: l.path }))),
      seo.faqPage(HUB_FAQS),
    ],
    breadcrumbTrail: [
      { name: 'Home', path: '/' },
      { name: 'Research', path: '/research/' },
      { name: 'Business Directories', path: BASE },
    ],
    main: hubMain,
  });

  for (const country of registry.countries) {
    if (!countryEmitted(registry, country)) continue;

    const countryPath = `${BASE}${country.slug}/`;
    const countryEntries = directoriesFor(registry, country.slug);
    const categoryLinks = registry.categories.map((category) => ({
      name: category.name,
      path: `${countryPath}categories/${category.slug}/`,
      pending: !categoryEmitted(registry, country, category),
    }));
    const faqs = countryFaqs(country, countryEntries.length);

    const countryMain = [
      `    <article class="page-hero">
      <h1>Business Directories in ${country.name}</h1>
      <p class="lede">Directories relevant to companies operating in ${country.titleName}, grouped by category.</p>
    </article>`,
      section('overview', 'Overview',
        `      <p class="bd-note">This page indexes directories for ${country.titleName}. ${countryEntries.length === 0
          ? 'No entries have completed manual verification yet, so no directories are listed.'
          : `${countryEntries.length} verified ${countryEntries.length === 1 ? 'entry is' : 'entries are'} published.`}</p>`),
      section('categories', 'Directory categories', c.linkGrid(categoryLinks)),
      section('directories', 'All directories',
        [c.searchBox(), c.filterBar(), c.sortControl(),
          c.directoryTable(sortDirectories(countryEntries)), c.metricNote()].join('\n')),
      section('faq', 'Questions', c.faqSection(faqs)),
    ].join('\n\n');

    pages.push({
      kind: 'country',
      outPath: path.join(SECTION_DIR, country.slug, 'index.html'),
      title: `Business Directories in ${country.name}`,
      description: `Business directories relevant to companies operating in ${country.titleName}, organised by category and verified by hand.`,
      canonicalPath: countryPath,
      robots: isIndexable(countryEntries) ? undefined : 'noindex,follow',
      jsonLd: [
        seo.collectionPage({
          name: `Business Directories in ${country.name}`,
          description: `Business directories for ${country.titleName}.`,
          url: seo.absoluteUrl(countryPath),
        }),
        seo.itemList(categoryLinks.filter((l) => !l.pending).map((l) => ({ name: l.name, path: l.path }))),
        seo.faqPage(faqs),
      ],
      breadcrumbTrail: [
        { name: 'Home', path: '/' },
        { name: 'Research', path: '/research/' },
        { name: 'Business Directories', path: BASE },
        { name: country.name, path: countryPath },
      ],
      main: countryMain,
    });

    for (const category of registry.categories) {
      if (!categoryEmitted(registry, country, category)) continue;

      const catPath = `${countryPath}categories/${category.slug}/`;
      const entries = sortDirectories(directoriesFor(registry, country.slug, category.slug));

      const catMain = [
        `    <article class="page-hero">
      <h1>${category.name} directories in ${country.name}</h1>
      <p class="lede">${category.description}</p>
    </article>`,
        section('directories', 'Directories',
          [c.searchBox(), c.filterBar(), c.sortControl(),
            c.directoryTable(entries), c.metricNote()].join('\n')),
      ].join('\n\n');

      pages.push({
        kind: 'category',
        outPath: path.join(SECTION_DIR, country.slug, 'categories', category.slug, 'index.html'),
        title: `${category.name} directories in ${country.name}`,
        description: `${category.description} This page covers ${country.titleName}.`,
        canonicalPath: catPath,
        robots: isIndexable(entries) ? undefined : 'noindex,follow',
        jsonLd: [
          seo.collectionPage({
            name: `${category.name} directories in ${country.name}`,
            description: category.description,
            url: seo.absoluteUrl(catPath),
          }),
          seo.itemList(entries.map((d) => ({ name: d.name, path: `${countryPath}${d.slug}/` }))),
        ],
        breadcrumbTrail: [
          { name: 'Home', path: '/' },
          { name: 'Research', path: '/research/' },
          { name: 'Business Directories', path: BASE },
          { name: country.name, path: countryPath },
          { name: category.name, path: catPath },
        ],
        main: catMain,
      });
    }

    // Detail pages exist only for real records, so nothing is emitted in this phase.
    for (const directory of countryEntries) {
      const detailPath = `${countryPath}${directory.slug}/`;
      const category = registry.categories.find((cat) => cat.slug === directory.category);

      pages.push({
        kind: 'directory',
        outPath: path.join(SECTION_DIR, country.slug, directory.slug, 'index.html'),
        title: `${directory.name} — ${country.name}`,
        description: directory.description,
        canonicalPath: detailPath,
        robots: undefined,
        lastmod: directory.lastVerified || undefined,
        jsonLd: [seo.directoryWebPage(directory, seo.absoluteUrl(detailPath))],
        breadcrumbTrail: [
          { name: 'Home', path: '/' },
          { name: 'Research', path: '/research/' },
          { name: 'Business Directories', path: BASE },
          { name: country.name, path: countryPath },
          { name: category ? category.name : directory.category,
            path: `${countryPath}categories/${directory.category}/` },
          { name: directory.name, path: detailPath },
        ],
        main: [
          `    <article class="page-hero">
      <h1>${directory.name}</h1>
      <p class="lede">${directory.description}</p>
    </article>`,
          c.directoryDetail(directory),
        ].join('\n\n'),
      });
    }
  }

  return pages;
}

function buildAll(options = {}) {
  const dataRoot = options.dataRoot || PATHS.dataRoot;
  const outRoot = options.outRoot || PATHS.siteRoot;

  const registry = loadRegistry(dataRoot);

  // The validator is the single source of truth for build gating: nothing is
  // written unless it reports ok.
  const validation = validateRegistry(registry);
  if (!validation.ok) {
    throw new Error(`Registry is invalid; refusing to build.\n${formatReport(validation)}`);
  }

  const pages = pageModel(registry);
  const written = [];
  const expected = new Set();

  for (const page of pages) {
    const file = path.join(outRoot, page.outPath);
    expected.add(file);
    if (writeIfChanged(file, renderPage(page))) written.push(page.outPath);
  }

  const removed = pruneStale(path.join(outRoot, SECTION_DIR), expected)
    .map((file) => path.relative(outRoot, file));

  const indexable = pages
    .filter((page) => page.robots === undefined)
    .map((page) => ({ path: page.canonicalPath, lastmod: page.lastmod }));
  if (writeIfChanged(path.join(outRoot, 'sitemap-business-directories.xml'), renderSitemap(indexable))) {
    written.push('sitemap-business-directories.xml');
  }

  const feedItems = registry.directories
    .filter((d) => d.lastVerified)
    .sort((a, b) => b.lastVerified.localeCompare(a.lastVerified))
    .map((d) => ({
      title: d.name,
      path: `${BASE}${d.country}/${d.slug}/`,
      description: d.description,
      pubDate: toPubDate(d.lastVerified),
    }));
  const feedFile = path.join(outRoot, SECTION_DIR, 'feed.xml');
  if (writeIfChanged(feedFile, renderRss(feedItems))) {
    written.push(path.join(SECTION_DIR, 'feed.xml'));
  }

  return { written, removed, pages: pages.length };
}

if (require.main === module) {
  const result = buildAll();
  console.log(`Generated ${result.pages} page(s); ` +
    `${result.written.length} written, ${result.removed.length} pruned.`);
}

module.exports = { buildAll, pageModel, pruneStale, REFERENCE_COUNTRY, REFERENCE_CATEGORY };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/tests/bd-build.test.cjs`
Expected: PASS, 8 tests

- [ ] **Step 5: Verify the generated tree by hand**

```bash
cd ~/PetroHrys.com
node scripts/build-business-directories.cjs
# expect "Generated 3 page(s); 3 written, 0 pruned."

find research/business-directories -name index.html | sort
# expect exactly:
#   research/business-directories/index.html
#   research/business-directories/united-states/categories/general-business/index.html
#   research/business-directories/united-states/index.html

node scripts/build-business-directories.cjs   # expect "0 written, 0 pruned"
grep -c '<loc>' sitemap-business-directories.xml               # expect 1
grep -L 'noindex,follow' $(find research/business-directories -name index.html)  # expect only the hub
grep -c '<item>' research/business-directories/feed.xml || true # expect 0
```

- [ ] **Step 6: Commit**

```bash
git add scripts/build-business-directories.cjs scripts/tests/bd-build.test.cjs research/business-directories sitemap-business-directories.xml
git commit -m "feat(bd): generate the 221-page business directories section"
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
