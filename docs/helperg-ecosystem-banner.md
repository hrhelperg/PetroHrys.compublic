# HELPERG Ecosystem Banner — cross-site integration

A compact, sticky "Company Timeline" banner that advertises the HELPERG
ecosystem above a site's own header. The core is **site-agnostic**; each site
ships one small config file. Everything is static, dependency-free, and works
with no build step and no JavaScript (progressive enhancement).

---

## 1. Required files

Copy these verbatim into every site (do **not** fork the registry per repo — it
is the single source of truth for all 24 products):

| File | Role | Site-specific? |
|------|------|----------------|
| `js/ecosystem-registry.js` | Canonical product registry (17 web + 7 apps = 24), labels, host matching | No — identical everywhere |
| `js/ecosystem-banner.js` | Renderer + interactions (icons, search, dialogs) | No |
| `css/ecosystem-banner.css` | Component styles + host-integration section | No (except the host section, §8) |
| `js/ecosystem-config.js` | **This site's** configuration | **Yes** — one per site |
| `scripts/validate-ecosystem-registry.cjs` | Integrity + coverage tests | No |
| `scripts/inject-ecosystem-banner.cjs` | Static-page injector (optional convenience) | Injector reads this site's config |

## 2. Script & stylesheet order

Load, all deferred, in this order (the injector does this automatically):

```html
<link rel="stylesheet" href="/css/ecosystem-banner.css">
<script src="/js/ecosystem-registry.js" defer></script>
<script src="/js/ecosystem-config.js" defer></script>
<script src="/js/ecosystem-banner.js" defer></script>
```

`registry → config → banner` matters: the renderer reads both globals
(`window.HELPERG_ECOSYSTEM`, `window.HELPERGEcosystemConfig`).

## 3. Mount point (required)

The banner enhances an existing `<nav data-helperg-eco>` element placed as the
**first child of `<body>`** (after a skip link if present). With no JS this
element is already a working banner (brand + curated timeline + "Explore all
products" link). The injector writes it between markers:

```html
<!-- helperg-eco:body:start -->
<nav class="helperg-eco" aria-label="HELPERG Ecosystem" data-helperg-eco> … </nav>
<!-- helperg-eco:body:end -->
```

If you are not using the injector, hand-place that `<nav data-helperg-eco>`
(or an empty `<nav class="helperg-eco" data-helperg-eco></nav>` — the renderer
fills it) as the first body child.

## 4. Configuration options (`ecosystem-config.js`)

```js
window.HELPERGEcosystemConfig = {
  currentProductId: 'petrohrys',                 // which registry product IS this site
  ecosystemHomeUrl: 'https://helperg.com',       // brand + "Explore all products" target
  showApps: true,                                // show the Apps popover trigger
  showSearch: true,                              // show product search in All Products
  locale: undefined,                             // omit → use <html lang>
  headerSelector: 'header[role="banner"], body > nav:not([data-helperg-eco])',
  stickyHeaderMode: 'stacked',                   // 'stacked' | 'none'
  insertionTarget: 'body'
};
```

## 5. Setting `currentProductId`

Set it to the product id that represents this site (e.g. `webmasterid`,
`geobusinessiq`, `petrohrys`). It drives the "Current site" indicator
(`aria-current="page"` + a restrained pill). Product ids are the `id` fields in
`ecosystem-registry.js`.

## 6. Hostname fallback

If `currentProductId` is omitted (or unknown), the renderer detects the current
site by **exact** hostname match against each product's `currentSiteDomains`.
Matching normalizes: lowercase, strip protocol/path/port, strip a trailing dot,
strip leading `www.`. It is exact — `fakepetrohrys.com` and
`petrohrys.com.evil.com` never match `petrohrys.com`.

## 7. Localization

Interface labels ship for `en`, `es`, `fr`, `de` and are chosen from
`config.locale` or `<html lang>`. Brand and product names, plus `iOS`,
`Android`, `App Store`, `Google Play`, are never translated. To add a language,
add a label set to `registry.labels` (the validator enforces key parity).

## 8. Sticky-header integration

The banner is `position: sticky; top: 0`. Your site's own top bar must sit
directly below it. Two things wire this up:

- **CSS (no-flash, at first paint):** in the "HOST-PAGE INTEGRATION" section of
  `ecosystem-banner.css`, offset your header:
  ```css
  .your-site-header { top: var(--ecosystem-banner-height); }
  ```
  The shipped defaults already cover `header[role="banner"]` and
  `body > nav`. Add a line only if your header differs.
- **JS (scroll-margin measurement):** set `config.headerSelector` to your top
  bar so anchor links clear the full sticky stack. The core renderer contains
  **no** site-specific selectors.

`--ecosystem-banner-height` (46px desktop / 44px mobile) is the single offset
variable — no per-page magic numbers, no layout shift.

## 9. No-JS behavior

The injected static markup is fully functional without JavaScript: the brand
and curated timeline are real links, and "Explore all products" points at
`ecosystemHomeUrl`. JavaScript progressively adds the Apps / All-products
dialogs, icons, and search.

## 10. Registry update process

Edit `js/ecosystem-registry.js` only. Each product supports:

```
id, name, type, group,
websiteUrl, webAppUrl, iosUrl, androidUrl, detailUrl,
websiteStatus, webAppStatus, iosStatus, androidStatus,   // available | coming-soon | unavailable | unknown
featured, showInTimeline, showInAllProducts, showInSearch, // booleans (normalized; defaults false/false/true/true)
displayPriority,                                           // number, lower first
currentSiteDomains, shortDescription
```

Honesty rule (enforced by the renderer and validator): a platform is a clickable
link **only** when its status is `available` **and** it has a real URL.
`coming-soon` / `unavailable` render as muted, non-interactive status text — no
`href="#"`, no invented links. Update the registry in one place; every site
picks up the change.

## 11. Validation command

```bash
node scripts/validate-ecosystem-registry.cjs      # integrity + coverage (exit 0 = pass)
node scripts/inject-ecosystem-banner.cjs --check   # report coverage without writing
node scripts/inject-ecosystem-banner.cjs           # inject/update all public pages
```

The validator checks: 17 web + 7 apps = 24 records; exact brief URLs/statuses;
Cash Workspace website available with no invented web-app URL; CV Resume iOS-only;
eSIMky placement; deterministic display controls; timeline ⇔ `showInTimeline`;
exact hostname matching (deceptive hosts rejected); label parity; locally-defined
SVG icons with no icon dependency; and one banner per public HTML page.

## 12. Example — generic site (hand-mounted, custom header)

```js
// js/ecosystem-config.js  (e.g. geobusinessiq.com)
window.HELPERGEcosystemConfig = {
  currentProductId: 'geobusinessiq',
  ecosystemHomeUrl: 'https://helperg.com',
  showApps: true,
  showSearch: true,
  headerSelector: '.site-topbar',
  stickyHeaderMode: 'stacked'
};
```
```css
/* in the host-integration section of ecosystem-banner.css (or your own CSS) */
.site-topbar { top: var(--ecosystem-banner-height); }
```

## 13. Example — PetroHrys.com integration

PetroHrys hosts two page systems (editorial `header[role="banner"]` + legacy
`body > nav`). Its `ecosystem-config.js`:

```js
window.HELPERGEcosystemConfig = {
  currentProductId: 'petrohrys',
  ecosystemHomeUrl: 'https://helperg.com',
  showApps: true,
  showSearch: true,
  headerSelector: 'header[role="banner"], body > nav:not([data-helperg-eco])',
  stickyHeaderMode: 'stacked',
  insertionTarget: 'body'
};
```

The injector mounts the banner on all 64 public pages and, on legacy pages,
also labels the page's own nav (`Primary` / `Principal` / `Principale` /
`Hauptmenü`) so landmarks stay unambiguous.

## 14. Do not duplicate the registry

There is exactly **one** `ecosystem-registry.js`. Never copy product records
into individual pages or maintain a per-repo fork — update the shared registry
and re-run the injector/validator. Only `ecosystem-config.js` differs per site.
