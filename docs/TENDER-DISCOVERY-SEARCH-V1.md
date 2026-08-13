# Tender Discovery & Search v1

**Status: COMPLETE.** Deterministic full-text search over the committed
canonical corpus, running in the reader's browser, on the existing
`/research/tenders-procurement/opportunities/` route in four locales.

---

## What this layer is

The corpus answers *what exists*. Monitoring answers *what changed*. This
answers *find me the one I can bid on*.

It is a **projection**, not a second corpus. Every field it publishes is either
copied from a canonical fact or computed by an engine that already existed.
Nothing here edits a canonical fact, and nothing here invents one.

```
opportunities.json ──► tender-index.json ──► browser ──► results
   (canonical)          (projection)        (one engine)
                             ▲
                    to-match.cjs (FROZEN)
```

## No search service

No Elasticsearch, Algolia, Typesense, Meilisearch, database or SaaS. The
decision was measured, not assumed: 6,964 current opportunities project to
**4.38 MB raw / 0.90 MB gzip**, 660 bytes per record, and every realistic
search runs in **0.2–2.8 ms**. A service would add an outage surface and a bill
to a problem that fits in a JSON file.

The first projection was 9.31 MB. Two changes halved it: dropping the
pre-concatenated all-text field, which stored every searchable word a second
time, and capping the description at 120 characters. **The blob must not come
back** — a test asserts it.

## One implementation, two runtimes

`scripts/lib/to-search.cjs` is a UMD module. Node requires it; `js/tender-search.js`
is a **byte-identical copy** for the browser, and a test fails if they diverge.

Two implementations of "which tender ranks first" drift, and then the page and
the test disagree with no way to say which is right.

`js/tender-discovery.js` does DOM, URL state, events and rendering — and no
search. It contains no weights, no thresholds and no filter logic.

## Originals in, normalization at load

The index stores the **original** title and buyer name, not normalized text.
The page has to display the original, and storing both would write every word
twice. `hydrate()` derives the searchable form at load (48 ms for 6,964
records), so there is exactly one normalization implementation and the
displayed title cannot disagree with the searched one.

## Searchable fields and relevance

| Field | Weight | Note |
|---|---|---|
| quoted phrase in title | 60 | adjacency required |
| exact classification code | 40 | whole token only |
| quoted phrase elsewhere | 25 | |
| title | 12 | |
| buyer | 8 | |
| classification label | 5 | exclusion clauses stripped |
| country | 3 | |
| description | 2 | first 120 characters |

**Search relevance and supplier-profile match are different measurements and
are never blended.** Choosing a profile narrows which tenders are shown; it
does not reweight the words.

## Seven defects the relevance audit found

The audit read real results for real cohorts rather than fixtures. Every fix is
a general rule — no per-record special cases — and each has a regression test.

1. **Exclusion labels read as evidence.** CPV 30 is "…except furniture and
   **software** packages" and CPV 51 is "Installation services (except
   **software**)". 143 of 502 "software" hits matched only there, and 136 of
   them contained the word nowhere else: an envelope framework and a
   water-meter replacement were returned as software procurements. Exclusion
   clauses are now stripped from the *searchable* label. The canonical label is
   untouched. `software` 502 → 363.
2. **Substring matching.** `ice` matched 3,994 of 6,964 records through
   servICEs, offICE, polICE — the two tenders actually about ice ranked 177th
   and 1,645th. Terms now match at a **token start**, so `construct` still
   finds `construction`. `ice` 3,994 → 8.
3. **Partial codes scored as exact codes.** `45` earned the full 40-point
   exact-code weight against 45000000, 45220000 and 33645000 — 906 records, not
   one of which carried code 45. Codes now require whole-token equality.
   `45` 906 → 31 (title matches only).
4. **Expired notices ranked first.** Ties broke on ascending days-to-deadline,
   so a tender 86 days expired outranked 191 live ones at the same relevance —
   while the deadline *filter* already excluded exactly those records. Ordering
   is now live → expired → undated.
5. **`__proto__` as a supplier profile.** `rec.m` comes from `JSON.parse`, so
   `rec.m['__proto__']` is truthy and a nonexistent profile returned **all
   6,964 records** labelled as matching it. Now `hasOwnProperty`. 6,964 → 0.
6. **Scheme filter was a substring test.** `scheme=C` matched both CPV and
   UNSPSC. Now equality.
7. **Unknown sort echoed back** as though honoured. Now validated against the
   enum.

Two further findings were **documented rather than fixed**, because the honest
fix is upstream:

- **TED titles embed the CPV label** (`Country – <CPV label> – <real title>`),
  so one classification fact scores title+12 *and* label+5. Mangling a
  source's title to prevent it would be worse than the double count.
- **No near-duplicate collapse.** Ranks 1–24 of "construction" are one buyer,
  Defence Construction Canada, publishing 26 near-identical source-list
  notices. They are genuinely distinct procurements; a diversity cap is a
  product decision for a later phase, not a correctness fix.

## Filters

Fourteen were specified. **Twelve shipped**, and the two that did not are the
interesting ones.

Shipped: query, buyer country, project country, source, classification scheme,
supplier profile, match band, status, deadline window, currency,
electronic submission, browser check.

**Platform: deliberately not shipped.** All ten sources currently publish from
exactly one platform each — a strict 1:1 mapping. Two controls selecting
identical record sets would imply a distinction the data does not have. The
*engine* keeps the filters separate, ready for the day a source spans several
platforms, and a test fails the moment that happens so the control can be
added.

**Documents: deliberately not shipped.** `documentsUrl` exists on the
*platform*, never on a notice. Deriving a per-tender answer from a
platform-level capability is exactly what the electronic-submission rule
forbids, and "no documents" would be a negative fact nobody established.

Every control is built from the index facets with counts, so it can only offer
a value that has records behind it. No dead controls, no hardcoded lists.

## What Discovery refuses to do

- **No currency conversion.** Values appear in the source's currency. Sorting
  by value requires choosing one currency; otherwise the engine refuses and
  says so via `VALUE_SORT_REQUIRES_CURRENCY` rather than ranking 2,000,000 CZK
  above 100,000 EUR.
- **No fabricated deadlines.** A zoneless date spans 26 hours, so it is shown
  as published, excluded from the closing-within filters, and sorted last.
- **No collapsed tri-states.** Unknown electronic submission is reachable as
  "Not stated" and is never folded into "No". The three cohorts partition the
  index exactly.
- **No invented industries.** Profiles are derived supplier matches, labelled
  as derived, read from the frozen matching engine. Discovery does not know
  what score makes a match Strong.
- **No historical browsing.** Only current opportunities are *published at
  all* — awarded, cancelled, closed and unknown-status records never enter the
  artifact, so no query can surface a cancelled procurement as an opportunity.
  Exclusion is structural, not a filter default.

## The silent-field-loss guard

The first version checked the fields of the record this module *builds*. That
check can never fire — the output is an object literal, so it cannot contain a
key the literal does not mention. It would have passed forever while a new
canonical fact was dropped, which is the exact Phase 2 failure it was meant to
prevent.

Loss happens on the way **in**, so the guard is on the input: every canonical
field must be either projected (`CONSUMED`) or explicitly listed (`OMITTED`).
A new field in neither is a crash.

## Personal data

A phone-number pattern was tried at the publication boundary and **removed**:
it rewrote 465 real titles, because `mandat 2026-2032`, `PROGRAMME 2026-2028`
and `2026-186-DPER` all look like phone numbers to a regex. Destroying
procurement facts to redact data that is not there is the worse failure. Email
redaction remains; a test asserts zero addresses in the published index.

## Result cards

Three visually distinct groups, because they have different epistemic standing:

- **Source facts** — title, buyer, geography, status, deadline, published date,
  source, classification, declared value, submission route.
- **Derived** — supplier-profile match bands, explicitly tagged.
- **How it was observed** — browser-check state, multi-source confirmation,
  deadline comparability.

## URL state

Seventeen parameters in a fixed order, so one search is always one URL.
Reload restores it, back and forward work, sharing reproduces the result set.
Invalid values are dropped against a whitelist rather than echoed; duplicate
parameters resolve first-wins; page clamps.

## SEO — the honest version

Base routes are indexable in all four locales. **Query states are not, and the
mechanism matters:**

This is a static site. A query string does not change the served HTML, so the
`?q=telecom` URL returns the same document with the same self-referential
canonical pointing at the base route. Client-injected `noindex` would be
theatre — the crawler reads the source HTML, not the DOM after JavaScript.

So the policy is enforced by **canonical plus no crawl path**: the canonical
never carries a query, nothing on the site links to a filtered state, and the
sitemap contains no parameterised URL. There is no route a crawler can walk to
find one.

The scale of what that prevents, from real cardinalities:

| Dimension | Values (incl. "Any") |
|---|---|
| buyer country | 72 |
| project country | 74 |
| source | 11 |
| scheme | 3 |
| supplier profile | 17 |
| match band | 3 |
| status | 3 |
| deadline window | 4 |
| currency | 14 |
| electronic submission | 4 |
| browser check | 3 |
| sort | 4 |

**72,310,081,536 filter and sort combinations. 20,174,512,748,544 with
pagination. Unbounded with free text.** Against **4** indexable routes — a
ratio of roughly 1 to 5 trillion. **Sitemap delta: 0**, because Discovery
extends a route that was already listed.

## i18n

69 first-party Discovery keys per locale across EN/DE/ES/FR, plus 6 supplier
profile labels that had never been translated. Canonical values are never
translated: a tender title, buyer name, classification code, scheme, source id
and currency are facts, and they appear identically in all four locales.

Six strings carry a placeholder the browser fills, because only the browser
knows the number. They reach the client through `I18N.raw()` — `t()` correctly
refuses to emit an unsubstituted `{n}` — and a test asserts the client
substitutes every one.

## Performance

Measured on Apple M4 / Node 24.

| Operation | Time |
|---|---|
| `JSON.parse` the index | 6.8 ms |
| `hydrate()` | 48.4 ms |
| cold path: parse + hydrate + first search | 59.6 ms |
| default view, no query | 1.2 ms |
| `q=telecom` | 2.4 ms |
| broad `q=services` (3,395 hits) | 2.8 ms |
| combined query + profile + country + deadline | 0.2 ms |
| worst case: 3 phrases + 12 terms | 29.0 ms |

Nothing exceeds 100 ms. Page size 25 rows, 480–616 DOM elements; `index.html`
is 135 KB raw / 20 KB gzip.

**Stated as inference, not measurement:** a mid-range phone runs 4–6× slower,
which would put `hydrate` near 200–300 ms. Network transfer of the 0.90 MB
gzip payload was not measured.

## Freshness

**Phase 5B remains unverified** — no schedule-triggered production run has
occurred. The page therefore says "based on the latest validated snapshot" and
"refreshed manually", and never *live*, *real-time*, *updated daily* or
*continuously monitored*. A test strips the page's own disclaimers and then
fails on any such claim, in all four locales.

## Known limitations

- **Snapshot, not a feed.** Deadlines are counted from ingestion time.
- **Seven records are `OPEN` with a deadline already past** — a source-status
  artifact. They are shown honestly as "Deadline has passed" and sorted after
  live tenders, but they are not filtered out, because the corpus's status is
  the source's claim and Discovery does not overrule it.
- **Descriptions are truncated to 120 characters**, so a word appearing deep in
  a description is invisible to the description signal.
- **No near-duplicate collapse and no per-buyer diversity cap** (see above).
- **No documents filter and no platform filter** (see above).
- **Search runs in the browser**, so it needs JavaScript. Without it the
  server-rendered tables and the CSV still list opportunities.
- **No filtered CSV.** The existing CSV carries all 9,577 opportunities and
  every field; a second export path would duplicate the sanitization boundary
  for a subset a reader can filter in a spreadsheet.

## Scale threshold

The in-browser design holds while the current corpus does. At roughly **25,000
current opportunities** the artifact approaches 3 MB gzip and `hydrate`
approaches half a second on a mid-range phone; at that point the projection
should move to a server-side or prebuilt-shard design. That is a threshold to
measure against, not a date.
