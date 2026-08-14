# Research Center discovery

How a reader narrows a Research Center collection, shares what they narrowed, and
takes it away as a file. One architectural document for five page families and the
Distribution Planner. Every number below is measured on the tree as it stands.

## The surface

| | |
|---|---|
| Generated Research Center pages | 23,632 (4 locales) |
| Pages that declare the browser row contract | 288 |
| Pages with discovery controls and an export | 228 = **57 routes × 4 locales** |
| Facet selects / tri-state checkboxes / sort / jurisdiction | 136 / 1,272 / 216 / 4 |
| Pages that download the predicate (`js/bd-discovery.js`) | 1,672 |
| Pages that download the planner engine (`js/dp-engine.js`) | 4 |

Five page families share one predicate and disagree about everything else:
tenders-procurement (7 facets), marketplaces (5), media/PR/publishing (11, five
list-valued), the listing-opportunities worklist (11 + sort), and a directory
country page (0 facets — six tri-state checkboxes, a sort, and the only
jurisdiction select in the collection).

## 1. The shared predicate, and the browser row contract

`scripts/lib/bd-discovery.cjs` decides whether a row survives. It ships verbatim as
`js/bd-discovery.js` — asserted byte-identical — so the browser and the tests cannot
disagree about what "matching" means. It holds only generic mechanics:
canonical-value equality, membership for list-valued facets, tri-state filters, AND
composition, and substring search over a prepared haystack. Which facets exist and
what the haystack contains is decided by the generator that emits the row.

`js/business-directories.js` owns DOM, history and downloads. Nothing else.

**The row contract is two attributes.** `<tbody data-bd-rows>` and
`<tr class="bd-row">`. The client's third statement is:

```js
var bodies = document.querySelectorAll('[data-bd-rows]');
if (!bodies.length) return;
```

Tender Platforms and Marketplaces emitted a complete set of working facet selects and
matching row attributes — and a plain `<tbody>` and a plain `<tr>`. The client returned
before binding a single listener, so every filter on both pages was a silent no-op:
choosing Czech Republic moved the control and left all 383 platforms on screen with
Albania and Algeria among them; Country = India left all 286 marketplaces. Nothing was
broken; nothing was reaching the engine.

The failure was invisible to counting — a test asserting "Czech Republic returns some
rows" passed while 383 were visible — so every discovery test compares **identities**,
derived independently from `data/*.json`. And it was untestable before the predicate
left the DOM code: there was no seam between *decide whether this row matches* and
*hide it*. Two general guards now cover the neighbouring class: no facet may offer an
option matching zero rows, and any facet whose rows hold a space-separated set must
declare `data-bd-facet-multi` (the worklist's `bestfor` advertised "SaaS companies
(16)" and matched 0).

## 2. The Distribution Planner: one state, one engine object

The planner shipped with six controls and no client. The server rendered one fixed
state, and the summary paragraph stated "United States" as a literal — so a reader
who chose United Kingdom got a United States campaign under a sentence claiming it
was theirs. The `evidence` control was wired to nothing at all.

`js/distribution-planner.js` reads all six controls into **one state object**,
fetches the projected opportunity set once, and recomputes on every change. It
decides nothing. The defect it replaced was a page holding its state in three places —
a hardcoded query, the option `selected` attributes, and a sentence — and keeping none
of them in step.

**Parity is identity, not equivalence.** `scripts/lib/dp-engine.cjs` is the pure
decision core (no `require` calls). `distribution-planner.cjs`,
`distribution-actionability.cjs` and `media-recommend.cjs` *re-export* it, and a
test asserts `P.campaign === SERVER_ENGINE.campaign` — the same function object, not
two functions that agree today. It ships byte-identical as `js/dp-engine.js`.

## 3. The browser payload, and a field contract that is recorded

The browser evaluates the same universe from a slim projection, not the full record.
`research/distribution-planner/planner-data.json`: 2,234 opportunities, **1,218,068 B
raw / 86,539 B gzip / 69,207 B brotli** — 38.7 B per record gzipped.

The contract is **recorded, not declared**. A Proxy watches every property the engine
touches across 2,234 opportunities × 17 businesses × 11 objectives × 6 markets ×
4 budgets × 4 evidence modes, and the recorded set must equal `E.FIELD_CONTRACT`
exactly: 17 `op` fields, 19 `record`, 7 `accepts`, 1 `intelligence`. A field the
engine reads and the payload omits is a browser scoring on `undefined`; a field the
payload carries and nothing reads is data published for no reason. The client
re-checks the declared `fields` block at boot and stands down rather than scoring on a
payload written by an older engine. A separate test proves the engine never writes
back into the opportunities it is handed — in the browser that array lives for the
life of the page, so one write would drift every later recompute.

## 4. The URL-state contract

`parseState` / `serializeState` live in the shared modules — `bd-discovery.cjs` for
the five discovery families, `dp-engine.cjs` for the planner. Only the history
read/write lives in the clients.

**The parameter set is derived from the controls the page rendered, not written
down.** `scripts/lib/to-search.cjs` declares a literal `PARAM_ORDER`, and for one
page with one control panel that is right. Five families share this module and do
not agree about what a control panel is: 7 / 5 / 11 / 11 / 0 facet selects, six
tri-state checkboxes on the family with none, a sort on two, and a jurisdiction
select whose values are composite (`group:national`, `state:US-AL`). A hand-written
list would have to be right about all five at once, and a parameter that quietly
stopped existing does not fail — it drops silently out of every shared link. So there
is one parameter per rendered control, and a facet added to a generator becomes
shareable the day it ships. A test asserts all five families produce *different*
parameter lists, so the heterogeneity the design exists for cannot quietly vanish.

Parsing is a **whitelist, not a sanitizer**: unknown keys are never read, an
unrecognised value is dropped rather than cleaned, duplicates resolve to the first,
and `q` is capped at 200 characters. `?country=<script>` produces no country, not an
escaped one. This matters most for the planner, whose engine *throws* on an unknown
business profile — a test asserts both halves, so the guard cannot rot into
decoration.

History: `replaceState` on boot (arriving is not a navigation, and it normalises a
hand-written link into the address that reproduces the screen), `pushState` per
discrete control, `replaceState` while typing — five keystrokes add zero entries, so
Back leaves the page in one press. `popstate` restores the controls and the results
together; restoring one without the other is worse than restoring neither.

## 5. The SEO query firewall

Query state is runtime only and never reaches served markup. Verified rather than
assumed, across the whole generated tree:

- **1,180,110** internal `href`s across 23,632 pages — **0** carry a query string.
- **23,688** sitemap `<loc>` entries — **0** carry a query string.
- **23,632** canonicals — every one is the clean base URL.

One shared link pasted into a page would create an infinite, near-duplicate crawl
space. `/data/*` is a forced 404 in `_redirects`, which is why the planner payload
lives inside the planner's own route rather than beside the canonical datasets.

## 6. Export semantics: two downloads, two writers

**"Download all N"** is a build-time artifact of the whole collection, linked as a
plain file. It needs no JavaScript and the client never adopts it — a test boots the
client with a selection applied and asserts the static anchor is untouched.

**"Download filtered results (M)"** is built in the browser from the *same predicate
and the same order* the table is using, so the file and the screen cannot disagree.
The count is read from the visible array itself after every render, never from the
status line or a cached number. An empty selection exports a header and zero records —
never the whole collection, which is the dangerous silent failure. Columns are derived
from the same control schema as the URL parameters. The button ships `hidden` until
the browser has proved it can build a file.

**Two writers, split deliberately.** `csvQuote` is RFC 4180 quoting and nothing else:
the published collection exports use it, and their tests assert every name appears
verbatim, because those files are a machine-readable copy of the collection.
`csvField` adds the `= + - @ tab` formula guard for anything a browser hands to a
spreadsheet. The guard is load-bearing on real data — the media registry contains a
platform called `@Press`. (`scripts/lib/bd-csv.cjs` still holds its own writer for
the directory export.)

## 7. Four locales — measured, not assumed

`scripts/tests/rc-parity.test.cjs` replays, for all 57 routes × 4 locales:

- **3,303** control-value comparisons — every facet, filter, sort and jurisdiction
  value is identical in EN/DE/ES/FR, and so is the URL parameter set.
- **3,057** filter states (every value of every facet, every filter alone, and one
  state with every dimension loaded) → **103,611** record identities compared, in
  order. 2,343 of those states select at least one record.
- **11,433** record-identity comparisons: platform names are never translated, which
  is the precondition that lets parity be asserted by identity instead of by count.

Labels are the other half and are measured, not assumed: **124 of 762** German option
labels differ from English (16.3%), 123 Spanish, 127 French. The rest are country
names, ISO 3166-2 subdivision names, industry and language names — canonical
vocabulary, deliberately identical everywhere. A test that demanded *every* label
differ would be wrong about this collection; one that demanded none would be vacuous.

**Free-text search is the one dimension that is legitimately locale-dependent.** The
haystack is the record's own name plus the generator's *localized* description of it,
so `vergabesystem` matches 167 rows on the German tenders page and 0 on the English
one. That is intended, and it is asserted so it stays a decision rather than becoming
an accident.

## 8. The no-JS posture

Every page is complete and readable with no JavaScript: the table is prerendered in
full, the "Download all" link is a file on disk, and the planner's section 3 is a
real campaign for a stated default query rather than an empty shell.

53 of the 57 routes hide their controls until the client reveals them
(`data-bd-search-wrap hidden` and siblings). The four collection pages render their
34 facet selects and their search box visibly and unconditionally, so without
JavaScript they are inert. `bd-components.cjs` justifies this by saying "the wrapper
carries a `<noscript>` explanation" — **there is no `<noscript>` anywhere in the
generated Research Center**. See *Known gaps*.

## 9. Measured performance

JS only, real shipped clients over the real generated markup, no layout or paint — a
lower bound on what a browser pays. Median of 15–60 runs.

| Discovery | worklist (2,167 rows) | media (385 rows) |
|---|---|---|
| Init: schema, record extraction, first render | 55.4 ms | 26.3 ms |
| One search keystroke | 14.7 ms | 2.1 ms |
| Two facet changes back to back | 30.0 ms | 4.2 ms |
| Sort change | 15.0 ms | *(no sort control)* |
| Full re-render, nothing filtered out | 13.4 ms | 1.7 ms |
| Filtered CSV build | 9.7 ms (214 KB) | 1.8 ms (45 KB) |
| `BDDiscovery.filter` alone | **1.7 ms** | **0.4 ms** |

The predicate is 12% of a keystroke on the largest page. The rest is the sort — run
twice per render, deliberately, the second pass costing a recorded 4.3 ms of the
15.0 ms render this measurement reproduces — plus 2,167 `appendChild` calls.

| Planner (2,234 opportunities) | |
|---|---|
| `JSON.parse` of the payload | 1.8 ms |
| Recompute, size 25 / 100 | 1.5 ms / 2.3 ms |
| `campaignCsv`, size 25 / 100 | 0.02 ms / 0.1 ms |

| Artifact | raw | gzip |
|---|---|---|
| `js/bd-discovery.js` | 24,048 B | 8,171 B |
| `js/business-directories.js` | 23,639 B | 8,041 B |
| `js/bd-order.js` | 4,549 B | 1,807 B |
| `js/dp-engine.js` | 72,954 B | 21,599 B |
| `js/distribution-planner.js` | 14,353 B | 5,209 B |
| `planner-data.json` | 1,218,068 B | 86,539 B |

**Nothing here is slow enough to matter.** The worklist keystroke at 14.7 ms is the
only figure near a frame budget, and it is a full re-sort and re-append of 2,167 rows
on the largest page in the collection; the same interaction is 2.1 ms on media. The
planner engine is shipped only to the 4 pages that use it, and its 87 KB gzipped
payload buys a page that recomputes in ~2 ms instead of 29,920 generated pages.

## 10. Accessibility

Audited structurally over the 232 pages that carry discovery controls (228 collection
+ 4 planner) — `scripts/tests/rc-a11y.test.cjs`:

- **1,856 controls, all named**: 1,500 inputs and 356 selects, each with a `<label
  for>` resolving to an element that exists. No control is named only by its
  placeholder.
- **3,292 ids, 0 duplicates, 0 empty.** A duplicate id breaks `<label for>` and
  `aria-labelledby` silently, since both resolve to the first match.
- **4,007 ARIA attributes and 456 roles, all valid**, all `labelledby`/`describedby`
  references resolve, no empty `aria-label`, no `aria-live="assertive"`.
- **All 232 action controls are real `<button type="button">`**, in the tab order,
  with accessible names; those that need JavaScript ship `hidden` rather than broken.

Two defects were found and fixed:

1. **The planner announced nothing.** Six controls rebuild the whole campaign — up to
   100 items across four groups — and the only text stating what happened was a
   paragraph with no live region: 0 occurrences of `aria-live` and 0 of `role="status"`
   in the generated planner markup, in all four locales. The client now promotes the
   summary to `role="status" aria-live="polite"` **after** the boot render. The
   generator cannot do it: without JavaScript that paragraph never changes, and a live
   region over static text announces nothing.
2. **The collection status line re-announced text that had not changed.** A polite live
   region speaks on assignment, not on change. Cycling the sort control wrote the same
   sentence every time (3 writes / 1 distinct string on the United States page, 2 / 1
   on the worklist), because re-ordering cannot change how many rows are shown; 3 of
   the 8 keystrokes in "registry" also left the count where it was. Both clients now
   write only on change: sort announcements 3 → 0, keystrokes 8 → 4.

## Known gaps

Recorded, not fixed here — each is a data or i18n decision rather than a discovery
defect.

- **No `<noscript>` anywhere.** The 34 always-visible facet selects on the four
  collection pages are inert without JavaScript and say nothing about it, contrary to
  the justification written into `bd-components.cjs`.
- **The planner is English in every locale.** Its six control *labels* are localized,
  but 147 of 152 option labels are not (17 business profiles, 11 objectives,
  4 budgets, 111 market names), and `E.summaryText` assembles the whole summary
  sentence in English on the DE/ES/FR pages.
- **Two English leaks on localized pages**: the sort option "Alphabetical" (162
  non-English pages; the labels live in `js/bd-order.js`, a browser module with no
  translator) and the `"N confirmed, M unknown"` tally beside every tri-state
  checkbox (954 occurrences on DE/ES/FR pages).
- **Only 16 of 228 discovery pages offer a Clear control** — the four collection
  pages. On a country page a reader must untick six checkboxes by hand.
- **`data-dp-status` names two different things** on the planner: the summary
  paragraph and the actionability status on each of 140 rows. The client's
  `querySelector` finds the right one only because the paragraph happens to come
  first in document order.
