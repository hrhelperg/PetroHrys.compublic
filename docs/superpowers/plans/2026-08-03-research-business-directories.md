# Research Center → Business Directories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a strictly additive Research Center → Business Directories section to PetroHrys.com, generated entirely from a structured JSON registry, with zero real directory data and zero changes to existing design.

**Architecture:** A deterministic Node CommonJS generator reads a JSON registry and emits static `.html` files into the existing site tree. No framework, no bundler, no `package.json`. Rendering is split into focused library modules (registry, sort, seo, components, render, feeds) so each file has one responsibility and fits comfortably in context. Client-side JavaScript only reorders and filters DOM that is already prerendered.

**Tech Stack:** Node v24 (built-in `node:test`, `node:fs`, `node:path`), plain CommonJS, hand-written HTML strings, CSS custom properties from the existing `css/petrohrys.css`.

**Spec:** `docs/superpowers/specs/2026-08-03-research-business-directories-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **No `package.json`** anywhere in the repo. Adding one makes Netlify auto-detect a build and can break deploys.
- **Never modify** `css/petrohrys.css`, `sitemap.xml`, `index.html` content, the homepage layout, existing colors, typography, spacing, layouts, or components.
- **Only permitted edits to existing files:** one nav `<li>` on the 8 English editorial pages, one added section in `/research/index.html`, one added `Sitemap:` line in `robots.txt`.
- **The 8 English editorial pages** are exactly: `index.html`, `work/index.html`, `writing/index.html`, `research/index.html`, `essays/index.html`, `ai-systems/index.html`, `infrastructure/index.html`, `about/index.html`.
- **Never touch** the 23 legacy product/blog pages or the 33 `es/` `fr/` `de/` pages.
- **Nav label is exactly** `Research Center`. Never `Research`. Never rename or reorder existing items.
- **All URLs use** `https://www.petrohrys.com` — canonical, OG, JSON-LD, sitemap, RSS. Never the apex domain.
- **All new CSS classes are prefixed** `bd-`. Never redefine an existing selector. Never declare a raw color, font-family, font-size, or spacing literal — consume existing custom properties only.
- **No fabricated data.** No invented directories, scores, ratings, traffic, pricing, or availability. Unknown values stay `null` and render as `—`.
- **Do not copy** `<meta name="msvalidate.01" content="PASTE_YOUR_BING_VERIFICATION_CODE_HERE">` into generated pages. It is an unfilled placeholder on existing pages; propagating it 221 times is a defect. Recorded as a follow-up.
- **Branch:** `feat/research-business-directories` (already created, spec already committed as `f64c4a3`).
- **Run tests with:** `node --test scripts/tests/`

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
| `scripts/build-business-directories.cjs` | Orchestrates generation of 221 pages + feeds |
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
- Produces: `loadRegistry(dataRoot?): { countries, categories, directories }`, `directoriesFor(registry, countrySlug, categorySlug?): object[]`, `reservedSlugs(categories): Set<string>`, `isIndexable(entries): boolean`

- [ ] **Step 1: Write the failing test**

```js
// scripts/tests/bd-registry.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadRegistry, directoriesFor, reservedSlugs, isIndexable } = require('../lib/bd-registry.cjs');

test('loadRegistry reads 10 countries and 21 categories', () => {
  const registry = loadRegistry();
  assert.strictEqual(registry.countries.length, 10);
  assert.strictEqual(registry.categories.length, 21);
});

test('loadRegistry starts with zero directories', () => {
  assert.strictEqual(loadRegistry().directories.length, 0);
});

test('every country has a matching directories file', () => {
  const registry = loadRegistry();
  for (const country of registry.countries) {
    assert.doesNotThrow(() => directoriesFor(registry, country.slug));
  }
});

test('reservedSlugs contains every category slug plus structural words', () => {
  const registry = loadRegistry();
  const reserved = reservedSlugs(registry.categories);
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

Run: `node --test scripts/tests/bd-registry.test.cjs`
Expected: FAIL — `Cannot find module '../lib/bd-registry.cjs'`

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/bd-registry.cjs
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { PATHS } = require('./bd-util.cjs');

const STRUCTURAL_RESERVED = ['categories', 'page', 'feed.xml', 'index'];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadRegistry(dataRoot = PATHS.dataRoot) {
  const countries = readJson(path.join(dataRoot, 'countries.json'));
  const categories = readJson(path.join(dataRoot, 'categories.json'));
  const directories = [];
  for (const country of countries) {
    const file = path.join(dataRoot, 'directories', `${country.slug}.json`);
    if (!fs.existsSync(file)) {
      throw new Error(`Missing directories file for country "${country.slug}": ${file}`);
    }
    for (const entry of readJson(file)) directories.push(entry);
  }
  return { countries, categories, directories };
}

function directoriesFor(registry, countrySlug, categorySlug) {
  return registry.directories.filter(
    (d) => d.country === countrySlug && (categorySlug === undefined || d.category === categorySlug),
  );
}

function reservedSlugs(categories) {
  const reserved = new Set(STRUCTURAL_RESERVED);
  for (const category of categories) reserved.add(category.slug);
  return reserved;
}

function isIndexable(entries) {
  return entries.length > 0;
}

module.exports = { loadRegistry, directoriesFor, reservedSlugs, isIndexable, STRUCTURAL_RESERVED };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/tests/bd-registry.test.cjs`
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
- Produces: `SORTS: Record<string, {key, label, compare}>`, `sortDirectories(list, key?): object[]`, `SORT_KEYS: string[]`

- [ ] **Step 1: Write the failing test**

```js
// scripts/tests/bd-sort.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { SORTS, sortDirectories, SORT_KEYS } = require('../lib/bd-sort.cjs');

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

test('default sort breaks ties on domainRating then name', () => {
  const out = sortDirectories([
    make('C', { petroHrysScore: 50, domainRating: 10 }),
    make('A', { petroHrysScore: 50, domainRating: 80 }),
    make('B', { petroHrysScore: 50, domainRating: 80 }),
  ]);
  assert.deepStrictEqual(out.map((d) => d.name), ['A', 'B', 'C']);
});

test('null metrics always sort last', () => {
  const out = sortDirectories([make('A'), make('B', { petroHrysScore: 1 })]);
  assert.deepStrictEqual(out.map((d) => d.name), ['B', 'A']);
});

test('alphabetical sort ignores metrics entirely', () => {
  const out = sortDirectories(
    [make('Zeta', { petroHrysScore: 99 }), make('Alpha', { petroHrysScore: 1 })], 'alphabetical');
  assert.deepStrictEqual(out.map((d) => d.name), ['Alpha', 'Zeta']);
});

test('sortDirectories does not mutate its input', () => {
  const input = [make('B', { petroHrysScore: 1 }), make('A', { petroHrysScore: 9 })];
  sortDirectories(input);
  assert.deepStrictEqual(input.map((d) => d.name), ['B', 'A']);
});

test('an unknown sort key falls back to the default comparator', () => {
  const out = sortDirectories([make('A', { petroHrysScore: 1 }), make('B', { petroHrysScore: 9 })], 'nope');
  assert.deepStrictEqual(out.map((d) => d.name), ['B', 'A']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/tests/bd-sort.test.cjs`
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

function byName(a, b) {
  return a.name.localeCompare(b.name, 'en');
}

const SORTS = {
  default: {
    key: 'default',
    label: 'PetroHrys Score',
    compare: (a, b) =>
      nullLastDesc(a.petroHrysScore, b.petroHrysScore) ||
      nullLastDesc(a.domainRating, b.domainRating) ||
      byName(a, b),
  },
  'domain-rating': {
    key: 'domain-rating',
    label: 'Domain Rating',
    compare: (a, b) => nullLastDesc(a.domainRating, b.domainRating) || byName(a, b),
  },
  'authority-score': {
    key: 'authority-score',
    label: 'Authority Score',
    compare: (a, b) => nullLastDesc(a.authorityScore, b.authorityScore) || byName(a, b),
  },
  traffic: {
    key: 'traffic',
    label: 'Estimated Traffic',
    compare: (a, b) => nullLastDesc(a.estimatedTraffic, b.estimatedTraffic) || byName(a, b),
  },
  alphabetical: { key: 'alphabetical', label: 'Alphabetical', compare: byName },
};

const SORT_KEYS = ['default', 'domain-rating', 'authority-score', 'traffic', 'alphabetical'];

function sortDirectories(list, key = 'default') {
  const sort = SORTS[key] || SORTS.default;
  return [...list].sort(sort.compare);
}

module.exports = { SORTS, SORT_KEYS, sortDirectories };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/tests/bd-sort.test.cjs`
Expected: PASS, 7 tests

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
- Produces: `validateRegistry(registry): string[]` (array of error messages; empty means valid). Module runs as a CLI when invoked directly, exiting 1 on any error.

- [ ] **Step 1: Write the failing test**

```js
// scripts/tests/bd-validate.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { validateRegistry } = require('../validate-business-directories.cjs');
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

const withDirs = (dirs) => {
  const registry = loadRegistry();
  return { ...registry, directories: dirs };
};

test('the shipped empty registry is valid', () => {
  assert.deepStrictEqual(validateRegistry(loadRegistry()), []);
});

test('a fully-null record is valid', () => {
  assert.deepStrictEqual(validateRegistry(withDirs([base])), []);
});

test('rejects a duplicate id', () => {
  const errors = validateRegistry(withDirs([base, { ...base, slug: 'other' }]));
  assert.ok(errors.some((e) => e.includes('Duplicate id')));
});

test('rejects a duplicate slug within one country', () => {
  const errors = validateRegistry(withDirs([base, { ...base, id: 'us-two' }]));
  assert.ok(errors.some((e) => e.includes('Duplicate slug')));
});

test('rejects a slug that collides with a category', () => {
  const errors = validateRegistry(withDirs([{ ...base, slug: 'saas' }]));
  assert.ok(errors.some((e) => e.includes('reserved slug')));
});

test('rejects an unknown country reference', () => {
  const errors = validateRegistry(withDirs([{ ...base, country: 'atlantis' }]));
  assert.ok(errors.some((e) => e.includes('unknown country')));
});

test('rejects an unknown category reference', () => {
  const errors = validateRegistry(withDirs([{ ...base, category: 'blockchain' }]));
  assert.ok(errors.some((e) => e.includes('unknown category')));
});

test('rejects a non-https website', () => {
  const errors = validateRegistry(withDirs([{ ...base, website: 'http://example.com' }]));
  assert.ok(errors.some((e) => e.includes('must use https')));
});

test('rejects a score outside 0-100', () => {
  const errors = validateRegistry(withDirs([
    { ...base, petroHrysScore: 140, lastVerified: '2026-08-01' },
  ]));
  assert.ok(errors.some((e) => e.includes('out of range')));
});

test('rejects an invalid enum value', () => {
  const errors = validateRegistry(withDirs([{ ...base, tier: 'platinum' }]));
  assert.ok(errors.some((e) => e.includes('invalid value')));
});

test('honesty gate rejects a metric on an unverified record', () => {
  const errors = validateRegistry(withDirs([{ ...base, petroHrysScore: 80 }]));
  assert.ok(errors.some((e) => e.includes('lastVerified is null')));
});

test('rejects a third-party metric without provenance', () => {
  const errors = validateRegistry(withDirs([
    { ...base, lastVerified: '2026-08-01', domainRating: 70 },
  ]));
  assert.ok(errors.some((e) => e.includes('provenance')));
});

test('accepts a third-party metric with full provenance', () => {
  const errors = validateRegistry(withDirs([{
    ...base, lastVerified: '2026-08-01', domainRating: 70,
    metricsProvenance: { domainRating: { provider: 'Ahrefs', measuredAt: '2026-08-01' } },
  }]));
  assert.deepStrictEqual(errors, []);
});

test('rejects nextVerification on or before lastVerified', () => {
  const errors = validateRegistry(withDirs([
    { ...base, lastVerified: '2026-08-01', nextVerification: '2026-08-01' },
  ]));
  assert.ok(errors.some((e) => e.includes('nextVerification')));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/tests/bd-validate.test.cjs`
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
const NUMERIC_FIELDS = [...SCORE_FIELDS, 'estimatedTraffic', 'referringDomains', 'httpStatus'];
const THIRD_PARTY_FIELDS = ['domainRating', 'authorityScore', 'estimatedTraffic', 'referringDomains'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateRegistry(registry) {
  const errors = [];
  const countrySlugs = new Set(registry.countries.map((c) => c.slug));
  const categorySlugs = new Set(registry.categories.map((c) => c.slug));
  const reserved = reservedSlugs(registry.categories);
  const seenIds = new Set();
  const seenCountrySlug = new Set();

  for (const d of registry.directories) {
    const at = `[${d.id || d.slug || 'unknown'}]`;

    if (seenIds.has(d.id)) errors.push(`${at} Duplicate id "${d.id}"`);
    seenIds.add(d.id);

    const countryKey = `${d.country}/${d.slug}`;
    if (seenCountrySlug.has(countryKey)) errors.push(`${at} Duplicate slug "${d.slug}" in "${d.country}"`);
    seenCountrySlug.add(countryKey);

    if (reserved.has(d.slug)) errors.push(`${at} Uses reserved slug "${d.slug}"`);
    if (!countrySlugs.has(d.country)) errors.push(`${at} References unknown country "${d.country}"`);
    if (!categorySlugs.has(d.category)) errors.push(`${at} References unknown category "${d.category}"`);
    if (typeof d.website !== 'string' || !d.website.startsWith('https://')) {
      errors.push(`${at} website must use https`);
    }

    for (const [field, allowed] of Object.entries(ENUMS)) {
      if (d[field] !== null && d[field] !== undefined && !allowed.includes(d[field])) {
        errors.push(`${at} Field "${field}" has invalid value "${d[field]}"`);
      }
    }

    for (const field of SCORE_FIELDS) {
      const v = d[field];
      if (v !== null && v !== undefined && (typeof v !== 'number' || v < 0 || v > 100)) {
        errors.push(`${at} Field "${field}" out of range 0-100: ${v}`);
      }
    }

    if (d.lastVerified === null || d.lastVerified === undefined) {
      for (const field of NUMERIC_FIELDS) {
        if (d[field] !== null && d[field] !== undefined) {
          errors.push(`${at} Field "${field}" is populated but lastVerified is null`);
        }
      }
    }

    for (const field of THIRD_PARTY_FIELDS) {
      if (d[field] === null || d[field] === undefined) continue;
      const p = (d.metricsProvenance || {})[field];
      if (!p || !p.provider || !p.measuredAt) {
        errors.push(`${at} Field "${field}" requires provenance (provider + measuredAt)`);
      } else if (!DATE_RE.test(p.measuredAt)) {
        errors.push(`${at} Provenance measuredAt for "${field}" must be YYYY-MM-DD`);
      }
    }

    for (const field of ['lastVerified', 'nextVerification']) {
      if (d[field] !== null && d[field] !== undefined && !DATE_RE.test(d[field])) {
        errors.push(`${at} Field "${field}" must be YYYY-MM-DD`);
      }
    }

    if (d.lastVerified && d.nextVerification && !(d.nextVerification > d.lastVerified)) {
      errors.push(`${at} nextVerification must be later than lastVerified`);
    }
  }

  return errors;
}

if (require.main === module) {
  const errors = validateRegistry(loadRegistry());
  if (errors.length) {
    for (const e of errors) console.error(e);
    console.error(`\n${errors.length} validation error(s).`);
    process.exit(1);
  }
  console.log('Business directories registry is valid.');
}

module.exports = { validateRegistry };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/tests/bd-validate.test.cjs && node scripts/validate-business-directories.cjs`
Expected: PASS (14 tests), then `Business directories registry is valid.` and exit 0

- [ ] **Step 5: Commit**

```bash
git add scripts/validate-business-directories.cjs scripts/tests/bd-validate.test.cjs
git commit -m "feat(bd): add registry validator with honesty and provenance gates"
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
- Produces: `emptyState(message): string`, `metric(value, opts?): string`, `linkGrid(items): string`, `sortControl(): string`, `filterBar(): string`, `searchBox(): string`, `directoryRow(directory): string`, `directoryTable(directories): string`, `faqSection(faqs): string`, `pagination({current, total, basePath}): string`, `metricNote(): string`

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

function linkGrid(items) {
  if (!items.length) return '';
  const rows = items.map((item) => {
    const suffix = item.pending ? ' <span class="bd-tag">coming soon</span>' : '';
    return `      <li><a href="${escapeHtml(item.path)}">${escapeHtml(item.name)}</a>${suffix}</li>`;
  }).join('\n');
  return `    <ul class="bd-grid">\n${rows}\n    </ul>`;
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
  searchBox, directoryRow, directoryTable, faqSection, pagination,
  VERIFICATION_NOTE, FILTERS,
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
- Produces: `buildAll({ dryRun? }): { written: string[], pages: number }`. Runs as CLI when invoked directly. Accepts `--country=<slug>`.

- [ ] **Step 1: Write the failing test**

```js
// scripts/tests/bd-build.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { buildAll, pageModel } = require('../build-business-directories.cjs');
const { loadRegistry } = require('../lib/bd-registry.cjs');

const root = path.resolve(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('pageModel produces 221 pages for the empty registry', () => {
  const pages = pageModel(loadRegistry());
  assert.strictEqual(pages.length, 221);
});

test('exactly one page is the hub and it is indexable', () => {
  const hub = pageModel(loadRegistry())
    .filter((p) => p.outPath === 'research/business-directories/index.html');
  assert.strictEqual(hub.length, 1);
  assert.strictEqual(hub[0].robots, undefined);
});

test('every country and category page is noindex while empty', () => {
  for (const page of pageModel(loadRegistry())) {
    if (page.outPath === 'research/business-directories/index.html') continue;
    assert.strictEqual(page.robots, 'noindex,follow', `indexable: ${page.outPath}`);
  }
});

test('build writes the hub, a country page and a category page', () => {
  buildAll();
  assert.ok(read('research/business-directories/index.html').includes('Business Directories'));
  assert.ok(read('research/business-directories/united-states/index.html').includes('United States'));
  assert.ok(read('research/business-directories/united-states/categories/saas/index.html').includes('SaaS'));
});

test('a second build writes nothing — output is byte-stable', () => {
  buildAll();
  const second = buildAll();
  assert.deepStrictEqual(second.written, []);
});

test('the section sitemap excludes every empty page', () => {
  buildAll();
  const xml = read('sitemap-business-directories.xml');
  assert.ok(xml.includes('<loc>https://www.petrohrys.com/research/business-directories/</loc>'));
  assert.ok(!xml.includes('/united-states/'));
});

test('the RSS feed is a valid empty channel', () => {
  buildAll();
  const xml = read('research/business-directories/feed.xml');
  assert.ok(xml.includes('<channel>'));
  assert.ok(!xml.includes('<item>'));
});

test('no generated page contains the bing placeholder', () => {
  buildAll();
  assert.ok(!read('research/business-directories/index.html').includes('PASTE_YOUR_BING'));
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
const { validateRegistry } = require('./validate-business-directories.cjs');

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

function pageModel(registry) {
  const pages = [];
  const countryLinks = registry.countries.map((country) => ({
    name: country.name,
    path: `${BASE}${country.slug}/`,
    pending: directoriesFor(registry, country.slug).length === 0,
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
    outPath: 'research/business-directories/index.html',
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
      seo.itemList(countryLinks.map((l) => ({ name: l.name, path: l.path }))),
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
    const countryPath = `${BASE}${country.slug}/`;
    const countryEntries = directoriesFor(registry, country.slug);
    const categoryLinks = registry.categories.map((category) => ({
      name: category.name,
      path: `${countryPath}categories/${category.slug}/`,
      pending: directoriesFor(registry, country.slug, category.slug).length === 0,
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
      outPath: path.join('research', 'business-directories', country.slug, 'index.html'),
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
        seo.itemList(categoryLinks.map((l) => ({ name: l.name, path: l.path }))),
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
        outPath: path.join('research', 'business-directories', country.slug, 'categories', category.slug, 'index.html'),
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
  }

  return pages;
}

function buildAll(options = {}) {
  const registry = loadRegistry();
  const errors = validateRegistry(registry);
  if (errors.length) {
    throw new Error(`Registry is invalid:\n${errors.join('\n')}`);
  }

  let pages = pageModel(registry);
  if (options.country) pages = pages.filter((p) => p.outPath.includes(`/${options.country}/`));

  const written = [];
  for (const page of pages) {
    const html = renderPage(page);
    if (writeIfChanged(path.join(PATHS.siteRoot, page.outPath), html)) written.push(page.outPath);
  }

  const indexable = pageModel(registry)
    .filter((p) => p.robots === undefined)
    .map((p) => ({ path: p.canonicalPath }));
  if (writeIfChanged(path.join(PATHS.siteRoot, 'sitemap-business-directories.xml'), renderSitemap(indexable))) {
    written.push('sitemap-business-directories.xml');
  }

  const feedPath = path.join(PATHS.siteRoot, 'research', 'business-directories', 'feed.xml');
  if (writeIfChanged(feedPath, renderRss([]))) written.push('research/business-directories/feed.xml');

  return { written, pages: pages.length };
}

if (require.main === module) {
  const arg = process.argv.find((a) => a.startsWith('--country='));
  const result = buildAll({ country: arg ? arg.split('=')[1] : undefined });
  console.log(`Generated ${result.pages} page(s); ${result.written.length} file(s) changed.`);
}

module.exports = { buildAll, pageModel };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/tests/bd-build.test.cjs`
Expected: PASS, 8 tests

- [ ] **Step 5: Verify the generated tree by hand**

```bash
cd ~/PetroHrys.com
node scripts/build-business-directories.cjs
find research/business-directories -name index.html | wc -l   # expect 221
node scripts/build-business-directories.cjs                   # expect "0 file(s) changed"
grep -c '<loc>' sitemap-business-directories.xml              # expect 1
grep -L 'noindex,follow' $(find research/business-directories -name index.html)  # expect only the hub
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

test('robots.txt references the section sitemap on the www host', () => {
  assert.ok(read('robots.txt').includes('Sitemap: https://www.petrohrys.com/sitemap-business-directories.xml'));
});

test('robots.txt still contains its original directives', () => {
  const txt = read('robots.txt');
  for (const line of ['User-agent: GPTBot', 'Disallow: /wp-admin/', 'Sitemap: https://petrohrys.com/sitemap.xml']) {
    assert.ok(txt.includes(line), `lost: ${line}`);
  }
});

test('the existing sitemap.xml is unmodified on this branch', () => {
  assert.strictEqual(git('diff', 'main', '--name-only', '--', 'sitemap.xml').trim(), '');
});

test('the site stylesheet is unmodified on this branch', () => {
  assert.strictEqual(git('diff', 'main', '--name-only', '--', 'css/petrohrys.css').trim(), '');
});

test('no legacy or localised page was modified on this branch', () => {
  const changed = git('diff', 'main', '--name-only').trim().split('\n').filter(Boolean);
  const forbidden = changed.filter((f) =>
    /^(es|fr|de)\//.test(f) ||
    /^(pdf-editor|pocket-manager|smart-printer|startups|privacy|fax|unzip|articles|terms|blog|webmasterid|submit-startup|artificial-intelligence|templates|twinphone|invoice-maker|tcg-scanner|cv-builder)\//.test(f));
  assert.deepStrictEqual(forbidden, []);
});

test('no generated page uses the apex origin', () => {
  const hub = read('research/business-directories/index.html');
  assert.ok(!/https:\/\/petrohrys\.com/.test(hub));
});

test('221 section pages exist', () => {
  const count = execFileSync('bash',
    ['-c', 'find research/business-directories -name index.html | wc -l'],
    { cwd: root, encoding: 'utf8' }).trim();
  assert.strictEqual(count, '221');
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
node --test scripts/tests/
```

Expected: validator prints `Business directories registry is valid.`; build reports `0 file(s) changed`; nav reports `0 page(s)`; all tests pass.

- [ ] **Step 5: Confirm the diff against main is exactly what the spec allows**

```bash
git diff main --stat -- . ':!research/business-directories' ':!data' ':!scripts' ':!css/business-directories.css' ':!js/business-directories.js' ':!docs' ':!sitemap-business-directories.xml'
```

Expected: only the 8 editorial pages plus `robots.txt`. If anything else appears, revert it before committing.

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
