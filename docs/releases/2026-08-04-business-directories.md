# Release — Research Center → Business Directories

**Branch:** `feat/research-business-directories` (28 commits, independent, 0 behind `main`)
**Date:** 2026-08-04
**Type:** Additive feature. **+12,717 / −0** across 61 files — no line is removed anywhere.

---

## What ships

A new **Research Center → Business Directories** section: a country-by-country research index of business directories, generated entirely from a JSON registry by a deterministic static build.

**Live URLs (3 pages):**

| URL | Indexing |
|---|---|
| `/research/business-directories/` | indexable |
| `/research/business-directories/united-states/` | `noindex,follow` |
| `/research/business-directories/united-states/categories/general-business/` | `noindex,follow` |

Plus `/research/business-directories/feed.xml` (valid empty RSS channel) and `/sitemap-business-directories.xml` (1 URL).

**This release contains zero directory records.** It ships the architecture, the reference scaffold, and the operator workflow. Nothing is fabricated: no invented directories, scores, ratings, traffic figures, or availability claims.

## Navigation

- One additive `Research Center` item in the primary nav — desktop list and mobile panel — on the 8 English editorial pages.
- One `Collections` section added to `/research/`, reusing the existing `.prose` pattern.
- Reachable in two clicks: `/` → `/research/` → `/research/business-directories/`.

Existing labels, ordering, `aria-current` behaviour, and the EN/ES/FR/DE switcher are unchanged. `/research/` remains current under "Research & Writing"; navigation taxonomy cleanup is deferred.

## Not touched

`sitemap.xml`, `css/petrohrys.css`, all ecosystem assets, all 33 localised ES/FR/DE pages, all 23 legacy inline-style pages. `robots.txt` gains exactly one `Sitemap:` line (+1/−0). No root `package.json`.

---

## Architecture

Registry-driven static generation. No framework, no dependencies, no build server, no database, no crawler, no external API, no runtime fetching.

- **`bd-routes.cjs`** — the single source of every URL and output path.
- **`bd-order.js`** — the single comparator specification, required by the generator *and* loaded by the browser, so server and client order can never diverge.
- **`validateRegistry`** — the single build gate; nothing is written unless it reports `ok`.
- **Stage → validate → reconcile** — every failure mode precedes any mutation, so a failed build changes nothing. Writes only changed files.
- **Ownership manifest** — pruning can only delete files the generator created; it refuses to overwrite anything it does not own.

## Editorial and SEO policy

- Unknown values stay `null` and render as an em dash with a spoken equivalent. Never `0`.
- Third-party metrics (Domain Rating, Authority Score, traffic, referring domains) require provider and measurement date, and are labelled as third-party. The PetroHrys Score is labelled first-party editorial.
- No `AggregateRating`, `Review`, `Product`, or `SearchAction` structured data.
- Outbound links carry `rel="noopener noreferrer"` and **no `nofollow`** — these are editorial citations, not paid placements.
- Empty pages are `noindex,follow` and excluded from sitemap, RSS and internal promotion; un-emitted routes are shown as unlinked "coming soon" text rather than advertised 404s.
- All URLs use `https://petrohrys.com` (apex). Production serves the apex and
  301-redirects `www` to it; an earlier draft of this section canonicalised to
  `www`, which made every canonical and sitemap entry point at a redirect.
  Corrected in `hotfix/business-directories-apex-canonical`.

---

## Verification

| Check | Result |
|---|---|
| Test suite | **301 pass**, 0 fail, 0 skipped, 0 todo |
| Build determinism | twice → `0 written, 0 pruned`; hashes unchanged |
| Nav injector | idempotent → `0 page(s)` |
| Registry validator | valid, exit 0 |
| Internal links | 486 audited — 0 relative, 0 broken |
| Smoke test | 8 routes + 9 assets all HTTP 200, correct content types |
| Client/server order equivalence | verified over served markup |
| Diff | +12,717 / **−0** |

Smoke test confirmed over HTTP: canonical, `noindex` on empty pages, 4 visible FAQ items matching the JSON-LD, 9 countries as "coming soon" with 1 linked, sitemap and robots served correctly, and the live region announcing "3 directories shown".

---

## Known deferred work

None hidden.

| Item | Severity | Gate |
|---|---|---|
| Pagination + `directoryTable` internal sorting | Medium | **Must close together before the first large import.** Cannot manifest at 0 records. |
| Shell drift protection | Medium | `bd-render.cjs` duplicates the site header/footer; only 5 fragments guarded. Proposal delivered, Option A recommended. |
| Mini-DOM test infrastructure | Medium | 161 hand-rolled lines with no tests of its own. Proven non-vacuous. |
| Apex-vs-www in pre-existing `sitemap.xml` | Medium | Pre-existing, untouched, documented. |
| Public manifest location | Low | `data/` is web-reachable by design; public research data. Deliberately not robots-hidden. |
| Navigation taxonomy overlap | Low | "Research Center" vs "Research & Writing". Deferred by decision. |
| Unfilled `msvalidate.01` placeholder on existing pages | Low | Pre-existing; deliberately not replicated into generated pages. |

## Operating it

See `docs/business-directories-runbook.md` — adding, updating and removing directories, rebuilding, and recovering from validation or manifest failures.

## Rollback

Revert the merge commit. The section is entirely additive: the 8 nav edits and the one `robots.txt` line are the only changes to pre-existing files, and all are `−0`.
