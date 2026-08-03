# Proposal — reducing shell duplication (P5)

**Status:** Options for decision. **No renderer changes have been made.**
**Issue:** audit finding M1.

---

## The problem

`scripts/lib/bd-render.cjs` hard-codes the site shell as string constants: the analytics block, font links, ecosystem-banner markup, header, primary nav, mobile nav panel, language switcher, and the four-column footer. That is roughly 100 lines duplicated from the eight editorial pages.

Today one test asserts that five fragments still appear in `research/index.html`. Twenty-nine footer and nav links are unguarded.

**Why it matters:** the section's core promise is that it is visually indistinguishable from the rest of the site. If a product is added to the footer, a nav label is reworded, or the analytics snippet changes, the eight hand-authored pages change and the generated pages silently do not. Nothing fails. The divergence is discovered by eye, months later, and grows with every generated page.

This is the highest-probability long-term maintenance failure in the codebase. It is not urgent — the shell is stable — but it is the thing most likely to rot.

---

## Option A — Widen the drift test (smallest change)

Extract every `<a href>` and every `<script>`/`<link>` from `research/index.html` at test time and assert the generated shell contains the same set.

- **Effort:** ~1 hour. One test file.
- **Risk:** very low. No production code changes.
- **Catches:** added/removed/renamed footer and nav links, changed analytics or font URLs.
- **Misses:** whitespace, attribute order, restructured markup, CSS class changes.
- **Cost after:** the test must be updated deliberately whenever the shell legitimately changes — which is the point.

**Verdict:** highest value per unit of risk. Turns a silent failure into a loud one without touching the renderer.

## Option B — Extract the shell into a shared partial consumed by both

Move the header/footer into `scripts/lib/bd-shell.cjs`, and add a second injector (like `inject-ecosystem-banner.cjs`) that rewrites the shell region of the eight editorial pages from that same source.

- **Effort:** 1–2 days. New injector, marker comments in eight existing pages, careful diffing.
- **Risk:** **high.** It edits eight hand-authored production pages, which the brief explicitly protects. A bug rewrites the live site's header.
- **Catches:** everything. Single source of truth by construction.
- **Cost after:** low. One place to change.

**Verdict:** correct in principle, disproportionate now. Revisit only if the shell starts changing often, or if the localised `es/fr/de` pages are ever brought into the same system.

## Option C — Parse the shell out of a live page at build time

`bd-render` reads `research/index.html` during the build and lifts the `<header>` and `<footer>` from it.

- **Effort:** ~half a day.
- **Risk:** medium. Introduces an HTML-parsing dependency on a hand-authored file; a stray edit there breaks every generated page. Build determinism now depends on a file nobody thinks of as an input.
- **Catches:** everything, automatically.
- **Cost after:** low, but debugging is harder — generated output changes without the generator changing.

**Verdict:** superficially elegant, but it converts a loud failure (a test) into a quiet one (silently different output). It also makes the generator's output depend on a page the brief says may be edited freely.

## Option D — Accept the duplication, document it

Add a comment in `bd-render.cjs` and a line in the runbook: "if you change the site header or footer, update this file too."

- **Effort:** minutes.
- **Risk:** none technically; relies entirely on memory.
- **Catches:** nothing.

**Verdict:** insufficient on its own. Acceptable only in combination with A.

---

## Recommendation

**Option A now, Option B deferred.**

A converts the failure mode from silent to loud for the realistic changes (a product added to the footer, a nav item reworded) at near-zero risk, and it does not touch a single production page. B is the architecturally correct answer, but its cost is editing eight live hand-authored pages — the exact thing this phase has been careful not to do — and the shell is not currently changing often enough to justify that.

Revisit B when either the shell changes more than once or twice a year, or the localised pages join the generated system.

**Not recommended:** C, because it trades a loud failure for a quiet one; D alone, because it relies on someone remembering.

---

## Decision required

Which option to implement is yours. Nothing has been changed.
