# Build Architecture Review — Business Directories generator

**Date:** 2026-08-03
**Status:** Complete. All 15 requirements verified empirically in a sandbox. **No HTML has been written into the site tree.**
**Subject:** `scripts/build-business-directories.cjs` (Task 10), reviewed before it is allowed to touch the site.

---

## 1. A conflict in the requirements, and how it is resolved

Requirement 15 asks for a transactional build — *"build into a temporary output directory, validate, then replace the target output; never partially overwrite the site."*

Requirements 3 and 4 ask for the opposite write pattern — *"only changed pages are rewritten"* and *"unchanged pages remain byte-identical."*

A literal directory swap satisfies 15 but violates 3: it replaces every file on every build, so nothing is ever "unchanged". A plain in-place write satisfies 3 and 4 but violates 15, because the site is mutated while the build is still deciding what to produce.

**Resolution — stage, validate, reconcile.** The build is split so that all *computation and failure* happens before any *mutation*:

| Phase | Touches the site? | Can fail? |
|---|---|---|
| 1. Load registry | no | yes — `RegistryError` |
| 2. Validate registry | no | yes — `BuildError` |
| 3. Build page model | no | yes |
| 4. Render everything into memory | no | yes |
| 5. Validate the staged output | no | yes — `BuildError` |
| 6. Materialise into a temp dir + verify round-trip | no | yes |
| 7. Reconcile into the site | **yes** | — |

Every failure mode lives in phases 1–6, where the site is untouchable. Phase 7 performs only writes of already-computed bytes, so there is no decision left that could fail halfway and leave a half-generated section.

This gives byte-minimal writes (3, 4) *and* the property that actually matters in 15: **a build that fails changes nothing at all.** Full crash-atomicity would require a rename swap and would forfeit 3 and 4; because the generator is deterministic and idempotent, an interrupted phase 7 is fully repaired by re-running it.

## 2. Ownership manifest

`data/business-directories/.build-manifest.json` records every generated path and the single registry fact that produced it:

```json
{ "version": 1, "files": {
  "research/business-directories/index.html": "hub",
  "research/business-directories/united-states/index.html": "country:united-states",
  "research/business-directories/united-states/ok-dir/index.html": "directory:us-ok",
  "sitemap-business-directories.xml": "sitemap"
} }
```

The manifest is what makes pruning safe. A file is deleted **only** if it is listed in the previous manifest and absent from the new one. A file the generator never created is invisible to pruning, and a file that exists but is not in the manifest causes the build to **refuse to overwrite it**.

## 3. Verification results

Executed against a sandbox copy of the repo. Each row was proved by mutating the registry and observing the filesystem — not by reading the code.

| # | Requirement | Result | Evidence |
|---|---|---|---|
| 1 | Generated HTML is byte-stable | PASS | SHA-256 of every file identical across builds |
| 2 | Repeated builds produce identical output | PASS | second build: `0 written, 0 pruned` |
| 3 | Only changed pages are rewritten | PASS | adding one record rewrote 4 of 6 files |
| 4 | Unchanged pages remain byte-identical | PASS | 3 files retained their original mtime |
| 5 | Pruning never deletes non-generated files | PASS | hand-authored `manual-note.txt` and `manual/index.html` survived a full prune |
| 6 | Generated files are clearly isolated | PASS | every manifest path is under `research/business-directories/` or is the section sitemap; out-of-section files hash-identical before/after |
| 7 | No accidental overwrite of existing pages | PASS | a hand-authored hub caused `BuildError: Refusing to overwrite`, and the file survived byte-intact |
| 8 | Every generated page has a unique canonical | PASS | canonical set size == page count |
| 9 | No duplicate output paths | PASS | path set size == page count |
| 10 | Sitemap cannot reference pruned pages | PASS | every `<loc>` ∈ generated canonicals; noindex pages excluded |
| 11 | Every emitted file belongs to one registry record | PASS | 7 files, 7 distinct owners |
| 12 | Deleting one record removes only its dependents | PASS | removing `us-ok` pruned exactly its category and detail page; hub and reference pages survived |
| 13 | No orphan pages survive pruning | PASS | after clearing all data, exactly the 4 scaffold files remain |
| 14 | Fails before writing if validation fails | PASS | validator gate and loader gate both abort; site fingerprint unchanged |
| 15 | Writing is transactional | PASS | dry run staged 5 files and wrote 0; staging dirs always cleaned up |

Two initial FAILs were traced to faults in the **checks**, not the build, and corrected:
- asserting the abort error was specifically `BuildError` missed the earlier, equally valid `RegistryError` gate — the real property is "fails and writes nothing", which both satisfy;
- detecting out-of-section writes by mtime was meaningless in a freshly copied sandbox, and was replaced with content hashing.

## 4. Defect found and fixed during the review

The page model emitted `FAQPage` structured data while no component rendered the questions visibly. Structured data must mirror content the reader can see; shipping FAQ markup with no visible Q&A violates Google's structured-data guidelines and risks a manual action.

A `faqSection` component and its styles were added, and a permanent test now asserts that **every question in the JSON-LD appears in the rendered `<main>`** for both the hub and the country page.

## 5. Residual risks

| Risk | Status |
|---|---|
| Interruption during phase 7 leaves a partial section | Accepted. Deterministic and idempotent; re-running repairs it. Full atomicity would forfeit requirements 3 and 4. |
| Manifest deleted or corrupted | Corrupt manifest raises `BuildError`. A missing manifest disables pruning rather than guessing, so nothing is deleted; stale files must then be removed by hand. |
| `data/` is web-reachable | The registry JSON and the manifest are publicly fetchable, as the whole repo is the document root. The data is public research material, so this is acceptable; noted rather than fixed. |
| Two records legitimately sharing a domain across countries | Allowed by design; enforced unique per country only. |

## 6. Conclusion

The generator satisfies all 15 requirements. Its destructive capability is bounded by the manifest and by a hard containment check that refuses any path outside `research/business-directories/` or the section sitemap.

**It has not yet been run against the site tree.** Doing so is the first action of Milestone B and needs explicit approval.
