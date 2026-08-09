# Site-Wide Migration Audit

Derived inventory of every public route in the repository: locale coverage,
design status, and what remains. Every number here was measured from disk, not
carried over from a previous report.

**Measured:** 448 canonical routes · 1,732 HTML files on disk · EN 448 / ES 428 /
FR 428 / DE 428.

---

## 1. The headline finding

Research Center i18n v1 was recorded as complete. It was not, and the gap was
not small.

Localized Research pages had a German `<html lang>`, a German title, German
column headings and German enum labels — and an **entirely English page shell**:

| Element | Before | Now |
|---|---|---|
| Header nav | `Work` · `Research & Writing` · `About` | `Projekte` · `Forschung & Veröffentlichungen` · `Über mich` |
| Footer headings | `Products` · `Legal` · `Index` | `Produkte` · `Rechtliches` · `Index` |
| Skip link | `Skip to content` | `Zum Inhalt springen` |
| Mobile menu | `Menu` | `Menü` |
| `/writing/`, `/about/` links | unprefixed → **English site** | `/de/writing/`, `/de/about/` |
| `/privacy/`, `/terms/` links | unprefixed → **English site** | `/de/privacy/`, `/de/terms/` |

Two of those nav links were not locale-prefixed at all, so a German reader
clicking "About" silently left the German site. This affected **1,251 localized
Research pages**.

**Why the existing tests missed it:** they asserted that localized pages
*existed* and that `<html lang>` was correct. Existence is not translation. The
new guards in `scripts/tests/site-shell-localization.test.cjs` assert the
property that matters — a page served under a locale prefix presents its chrome
in that locale — and are verified by five mutations (see §5).

**Fixed in this pass.** The shell now renders from the dictionary in all four
locales, and `HEADER`/`FOOTER` throw rather than falling back to English.

Two further defects fixed alongside it:

- **eSIMky was absent from the shared footer entirely**, so it was unreachable
  from ~1,700 generated pages. Added.
- The four Research Center collections were missing from the localized footers.
  Added, reusing the existing `collection.*` vocabulary rather than opening a
  second set of names for the same four datasets.

---

## 2. What is still English — quantified, not hidden

The shell is localized. The **body copy of two collections is not.**
`bd-components.cjs` and `bd-articles.cjs` contain **zero** `t()` calls.

| Module | Hardcoded EN strings | What it renders |
|---|---:|---|
| `scripts/lib/bd-articles.cjs` | 23 (70 KB prose) | Long-form editorial guides |
| `scripts/lib/bd-components.cjs` | 16 | Record-page field labels, empty states |
| `scripts/build-business-directories.cjs` | 10 | Hub and index page copy |
| `scripts/build-distribution-planner.cjs` | 6 | Planner UI copy |
| `scripts/lib/bd-feeds.cjs` | 2 | RSS channel title/description |
| **Total** | **57 distinct strings** | |

Measured on a German record page: 128 of 130 body text nodes are identical to
the English page. Some of that is correct — platform names, countries and URLs
are facts and must not be translated — but `Industry importance`,
`Platform reputation`, `Best for`, `Unknown` and `Last verified` are UI chrome
and are wrong in German.

By contrast **Media & PR (93 `t()` calls) and Marketplaces (32) are properly
localized.** The gap is specific to Business Directories and the Planner.

### Why this was not fixed in the same pass

Localizing it is not a translation task, it is a refactor: `bd-components.cjs`
exposes ~25 functions, none of which take a locale, so `t` must be threaded
through every one and every call site. Doing that at the end of this pass would
have meant a large untested refactor landing next to a shell change — with 1,471
tests depending on both. `bd-articles.cjs` is a separate question again: 70 KB of
editorial prose is ~210 KB of translation across three languages, and machine
translation of research prose would degrade the dataset's credibility rather
than improve its reach.

**This backlog is pinned by a ratchet test**, not a comment. The module list is
asserted to be exactly its current membership: localizing one fails the test
until the list shrinks, and adding a new module of hardcoded English fails it
too. The backlog cannot quietly grow or be forgotten.

---

## 3. Legacy-design pages — 19 remaining

Pages carrying their own inline `<style>` block instead of the shared design
system. **79 KB of duplicated inline CSS.**

| Family | Pages | Inline CSS | Note |
|---|---:|---:|---|
| `blog/` | 5 | 154 KB | 4 long-form posts + index |
| `privacy/`, `terms/` | 8 | 137 KB | **Already exist in all 4 locales** |
| `startups/`, `submit-startup/` | 3 | 46 KB | |
| `articles/`, `templates/` | 2 | 28 KB | |
| `artificial-intelligence/` | 1 | 21 KB | |

**Not yet migrated.** The shared primitives they need were added in this pass
(`.legal-prose`, `.article-prose`, `.doc-callout`, `.doc-box`, `.doc-updated`,
`.table-wrap`, `.doc-table` in `css/petrohrys.css`, tokens only, no raw hex), so
the migration is now unblocked.

**Recommended order.** `privacy/` and `terms/` first: 8 pages, translations
already written, so it is a pure shell swap with no content risk — the highest
ratio of consistency gained to risk taken. Editorial families after.

---

## 4. EN-only routes — 20 remaining

No ES/FR/DE twin exists:

- **Products (6):** `esimky`, `twinphone`, `fax`, `smart-printer`,
  `tcg-scanner`, `unzip`
- **Editorial (14):** `blog/` index + 4 posts, `articles`, `essays`,
  `infrastructure`, `ai-systems`, `artificial-intelligence`,
  `startups` + `startups/raising`, `submit-startup`, `templates`

The shared footer deliberately links products **unprefixed**. Linking a German
reader to `/de/fax/` when no such page exists would turn a working English page
into a 404 — a worse defect than the inconsistency. A test documents this as
intentional, so the exclusion is visible rather than looking like an oversight.

---

## 5. Verification

- **1,471 / 1,471 tests pass** (1,462 before this pass + 9 new).
- All four generators **idempotent** — byte-identical output on a second run.
- **Five mutations applied, five caught**, each restored:

| # | Mutation | Result |
|---|---|---|
| M1 | Hardcode `About` back into the nav | CAUGHT |
| M2 | Drop the locale prefix from the About link | CAUGHT |
| M3 | Remove eSIMky from the footer | CAUGHT |
| M4 | Revert the skip link to English **in source** | CAUGHT |
| M5 | Disable the missing-translator guard | CAUGHT |

M4 and M5 both survived their first attempt and the guards were strengthened
rather than the mutations excused:

- **M4** survived because the test read *built files*, proving what the last
  build produced rather than what the renderer does now. It now renders fresh,
  so a source regression fails immediately without a rebuild.
- **M5** survived because the assertion checked for `TypeError`, which a missing
  translator raises anyway — the test passed whether or not the guard existed.
  It now asserts the guard's own message.

One guard was also **restated after failing correctly**: it flagged the language
switcher's `EN` link as an unprefixed leak. That link is *supposed* to leave the
locale — the guard was asserting an implementation ("no bare hrefs") rather than
the property ("navigation keeps you in your locale"), and the only way to pass
would have been to break the switcher. It now excludes the switcher explicitly.

---

## 6. Honest status

**Done:** shell localization across all four locales (1,251 pages), locale-correct
internal linking, eSIMky and the Research collections restored to the footer, the
`shell.*`/`legal.*` namespaces (223 keys × 4, parity asserted), a
dictionary-driven leak detector that cannot go stale, shared long-form CSS
primitives, and 9 mutation-verified guards.

**Not done:** 19 legacy-design pages, 20 EN-only routes, and the 57-string body
backlog in Business Directories and the Planner.

This phase is **not** complete against the full brief. It is complete against the
part of it that could be finished without leaving a large untested refactor or
machine-translated research prose in the repository — and everything unfinished
is quantified above and pinned by a test rather than described as a plan.
