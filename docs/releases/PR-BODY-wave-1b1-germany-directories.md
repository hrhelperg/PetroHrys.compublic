# feat: add Germany business directories

Prepared 2026-08-06. Continues production from `e4b4373` (PR #40). No schema
change, no route change, no taxonomy change.

## The first country in Pillar B

This is the first record set in **Business Directory Intelligence** — platforms
where a company publishes its own profile — as opposed to the Government Registry
Core, where entries follow a legal act. It is intended as the reference
implementation for every commercial-directory country that follows.

Dataset **272 → 276**; 349 pages. Germany 15 → 19.

## Complete means classified, not published

Six candidates. **Four published, two deliberately not** — and the two rejections
are the part worth reading.

**Das Örtliche** could not be published because its business surface cannot be
reached: `/eintrag` resolves to a *search result*, the entry-service link
redirects to a mobile page, and its marketing site returns **HTTP 410 Gone**.

**Marktplatz Mittelstand** states *"100% kostenlos & unverbindlich"*, but whether
profiles are created by businesses or generated from other sources is documented
nowhere reachable. The acceptance rule "not scraper-generated" cannot be
confirmed, and uncertainty forbids publication.

Publishing either would have produced a record whose central facts were guesses.

## Three directories, not one

Gelbe Seiten, Das Telefonbuch and 11880 share a market and link to each other as
partner services. They remain **three records**, because each runs its own entry
service on its own domain with its own process — Gelbe Seiten sends submissions
to *"den für Ihre Region zuständigen Gelbe Seiten Verlag"* for a *"redaktionelle
Prüfung"*, which neither of the others shares.

Shared ownership is not evidence of one system. Equally, **no operator claims
that one entry reaches the others**, so the Das Telefonbuch record tells a reader
that a business wanting presence in each must submit to each.

## What is not asserted

No German operator documented verification methods, owner responses, indexability,
link attributes or traffic. All are `null`. `listingAction` is `create` on all
four — **no claim flow was established for any**. Gelbe Seiten's route for
changing an existing entry is a correction request mediated by a publisher, which
is not a claim of ownership, so `create-and-claim` was not asserted.

## Three calls that kept records honest

**wlw cost is `unknown`, not free.** A premium profile is offered on request. That
establishes nothing about the basic tier, and the brief forbids inferring free
from the existence of a registration route.

**11880 has ratings but no documented owner response.** The operator sells a paid
*"Bewertungsmanagement"* product — a separate commercial offering, not evidence
that replying is included in the free entry.

**A Gelbe Seiten entry is a request, not a publication.** Editorial review comes
first. That is unusual among free directories and is published as a limitation.

## The tool problem, stated plainly

The fetch path that reaches bot-filtered pages **summarises**, and it produced two
inferences the sources do not support: that Firmy.cz owners can respond to reviews
(citing a heading meaning *summary rating*), and that wlw's basic profile "appears
available". Both were rejected.

It behaved correctly elsewhere, reporting "not mentioned" where nothing was
documented — which makes this harder to discount, not easier. **Only its direct
quotations are evidence; its characterisations are not.**

## Verification

| Gate | Result |
|---|---|
| Validator | exit 0 |
| Migration ×2 | rewrote **0** on both runs |
| Generator ×2 | second run wrote **0**, pruned **0** |
| Tests | **1,061 pass, 0 fail** (1,044 before, 17 added) |
| Mutation probes | **18 injected, 18 caught, 0 survived, 0 broken, 0 no-op** |
| Internal links | 4,319 hrefs, **0 broken** |
| Sitemap / RSS | 349 = 349 · 276 = 276 |
| JSON-LD | 349 blocks, **0 malformed** |
| Editor notes | leak to **0** pages |
| Live URL re-check | all six **200** |
| Germany country page | links all 19 records |
| Domain Rating | all four null; 67 records over **64** measurements, digest unchanged |
| Working tree | clean |

**Two guards were missing and were found by mutation, not by review.**
`reviewSystem` was not pinned per record, so ratings could be invented for a
directory that documented none. And the rendered-caveat check iterates the cons a
record still has — which cannot notice a con that was *deleted*. Both are now
pinned by content.

**One probe under-injected and was strengthened**: it stripped a caveat from
`cons` only, leaving it visible in `notRecommendedFor`, so the record still told
the truth and the guard correctly passed.

## Pass 2 corrections

Quotations for Gelbe Seiten, Das Telefonbuch and wlw verified through an
independent direct fetch. The 11880 check initially reported its quotations
absent — **that was a broken verification, not a finding**: the fetch had failed
silently and written no file. Re-run, all five terms were present.

## Rollback

Additive; `origin/main` untouched at `e4b4373`. No previously published record was
modified. Reverting any record requires restoring the Germany count in
`bd-germany-france-professional.test.cjs` to 15 and removing its pins from
`bd-germany-directories.test.cjs`.

## Readiness for the next country

The methodology is now established: reachability first, official documentation
only, duplicate decision by entry service rather than ownership, unknown over
inference, and every rejection recorded with its failed acceptance rule.

Czechia is next — Firmy.cz is already substantially researched (operator
**Seznam.cz, a.s.**, free registration, create flow, reviews), with Najisto
outstanding and Zlaté stránky unresponsive.
