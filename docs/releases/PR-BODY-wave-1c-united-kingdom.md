# feat: add Wave 1C United Kingdom government registries

Continues production from `499cdc1` (Wave 1C-2, Canada). Two commits: the wave
itself (`6db5f52`) and a completion pass (`1907ee8`).

Dataset **167 → 189** records. United Kingdom **3 → 24**. Canada **15 → 16**.

---

## The 16 original UK records

| Group | Records |
|---|---|
| **UK-wide** | NMC Register · GDC Registers · HCPC Register · Food Hygiene Ratings |
| **Constituent countries** | Scottish Charity Register · Register of Insolvencies (Scotland) · Healthcare Improvement Scotland · Care Inspectorate (Scotland) · Care Inspectorate Wales · Register of Charities (Northern Ireland) · IVA Register (Northern Ireland) · RQIA Register of Services |
| **Cross-territory** | Register of Charities (England and Wales) · Individual Insolvency Register (England and Wales) · Solicitors Register · The Barristers' Register |

Three charity regulators are three records. **Five** care and health regulators
are five records on five hosts with five territories — CQC (England), Healthcare
Improvement Scotland, the Care Inspectorate (Scotland), Care Inspectorate Wales
and RQIA — and the two Scottish bodies each state in published prose that they
are not the other.

## Procurement notice type and records

`public-procurement-notice-database` — *"An official system publishing
procurement opportunities, tender notices, contract award notices, contract
data, or other formal stages of public procurement."*

The type exists because the alternative was to state something false. A
`procurement-supplier-register` records **who may bid**; these systems record
**what is being bought**. The boundary is written into the glossary, and every
record of the type disclaims that publication confers eligibility.

| Record | Territory |
|---|---|
| Find a Tender | UK-wide, with Scottish below-threshold and full-lifecycle notices out of scope |
| Contracts Finder | England, Wales and Northern Ireland (`covers` GB-ENG + GB-NIR + GB-WLS) — **not** Scotland |
| Public Contracts Scotland | Scotland (GB-SCT) |
| Sell2Wales | Wales (GB-WLS) |
| CanadaBuys | Canada, national |

Two corrections came out of revalidation:

- **Find a Tender is no longer "high value only".** From 24 February 2025 it
  publishes below-threshold notices too, except below-threshold in Scotland. The
  GOV.UK guidance page still carries "usually above £139,688" and is stale on
  this point; the service's own pages were treated as authoritative and the
  stale figure is deliberately not repeated.
- **Contracts Finder is neither UK-wide nor England-only.** Its territory
  follows the extent of the Public Contracts Regulations 2015 — England, Wales
  and Northern Ireland, excluding Scotland, with devolved Welsh and Northern
  Irish authorities out of scope. An earlier England-only proposal was refuted
  by the operator's own OCDS data.

## Registered-design type

`registered-design-register` — a design right protects appearance, a trade mark
a brand indicator, a patent a technical invention.

**It deliberately has no records.** The UKIPO designs search sits behind a
captcha and was never verified, so nothing was authored. The type is added on
its merits so future official design registers have an honest home. A type with
no records is correct; a record forced into `patent-register` would not be.

## Companies House disqualified directors

Published as `gb-companies-house-disqualified-directors` through the
`resourceIdentity` shared-host mechanism — the register shares
`find-and-update.company-information.service.gov.uk` with the company register
but is a distinct statutory population with its own search path and tab.

- `systemKey` unique, `sharedHostGroup: companies-house-service` on both records
- destinations materially different, not a query-string variant
- reuses the domain's existing frozen Domain Rating snapshot verbatim

It states that **absence does not prove a person was never disqualified**, that
inclusion does not describe every restriction, and that company registration and
director disqualification are separate systems that happen to share a website.

## CQC territorial correction

`gb-cqc` carried `scope: "national"` with no jurisdiction, asserting UK-wide
reach. GOV.UK states the CQC "regulates all health and social care services in
**England**". It is now `GB-ENG`.

Only the territorial fields changed — verification date, score, Domain Rating
and provenance are untouched, and a test pins each. The correction is recorded
in the record's own `editorNotes` rather than made silently. It also exposed the
real gap: three other UK nations have their own care regulators, now published.

## UK jurisdiction model

- Whole UK → `scope: national`, `jurisdiction: null`
- England / Scotland / Wales → `country` (GB-ENG / GB-SCT / GB-WLS)
- Northern Ireland → `province` (GB-NIR), the category ISO 3166-2 itself assigns
- England and Wales → `cross-territory`, `covers: ["GB-ENG","GB-WLS"]`
- Contracts Finder → `cross-territory`, `covers: ["GB-ENG","GB-NIR","GB-WLS"]`

**Great Britain is not the United Kingdom.** No deprecated or invented compound
identifier is used: `GB-EAW`, `GB-GBN`, `GB-UKM`, `GB-CHC`, `GB-COH`, `GB-NIC`
and `GB-CYM` remain rejected by the allowlist, and a test forbids each as an
identifier or in reader-facing prose. The single place `GB-EAW` is written down
is an `editorNotes` line explaining why it is *not* used.

## Official-source policy

Every factual statement originates from a page served by the operator's own
domain or the government that operates it. Search engines only located pages.
Unobserved facts stay `null`, never a confident `false`.

Adversarial review earned its place: across the two passes, **quotes that were
not verbatim on the cited page were found in a third of verified candidates** —
truncated sentences presented as complete, added punctuation, text stitched from
separate DOM nodes. The response was structural rather than cosmetic: published
prose paraphrases verified facts, and any surviving quotation was read on the
page during authoring.

## No new Domain Rating measurements

Twenty-one of the twenty-two new records carry `domainRating: null`. The single
exception reuses an existing snapshot on the **same** measured domain.

| | Records displaying a DR | Distinct measurements | Per-domain digest |
|---|---|---|---|
| Before | 64 | 64 | `aa7e6984…19847a4e` |
| After | 66 | 64 | `aa7e6984…19847a4e` |

Records grew; measurements did not.

## Pending candidates

Nothing published to raise a count. All retain official URL, blocker, research
date, required browser action, and known-versus-unknown facts.

- **UKIPO** — trade marks, patents and registered designs, all HTTP 403 behind
  captcha interstitials. Designs now has a type waiting; only access is blocked.
- **Law Society of Scotland** — Cloudflare block; must be checked as statutory
  roll versus voluntary directory, since the England/Wales and NI equivalents
  turned out to be voluntary and were rejected.
- **Northern Ireland DRO and BRO register** — client-side shell.
- **Rejected** — three "find a solicitor" directories whose operators state they
  are not registers; the Insolvency Service three-month outcomes page, which the
  Service says is not a complete record; the Faculty of Advocates, not a
  public-law body; and the Food Hygiene Information Scheme page, which is
  guidance rather than a register.

## Tests and audit totals

- **758 tests pass, 0 fail** (716 at production HEAD; +27 UK, +15 completion,
  Companies House added to the shared-host production case, and two guards
  corrected rather than weakened).
- **23 injected defects across both passes, all caught** — CQC reverted to
  UK-wide, `GB-EAW` used as a code, Northern Ireland refiled as a country,
  unsorted `covers`, both code and covers, Great Britain including Northern
  Ireland, Scottish regulators merged, a supplier-register misclassification,
  Contracts Finder claiming Scotland or UK-wide, conflicting `sharedHostGroup`,
  duplicated `systemKey`, a refreshed snapshot date, a DR on a new record, an
  eligibility claim, a stripped CanadaBuys reversal note, and more.
- Validator exit 0 · migration idempotent · build byte-identical on rebuild ·
  **14,758 links, 0 broken** · sitemap equals the indexable set (258 = 258, 0
  `noindex`) · RSS equals published records · 258 JSON-LD blocks with no
  `AggregateRating`/`Review`/`Product`/`SearchAction` · unique titles and
  descriptions · every page canonical and manifest-owned · no network or
  credential dependency.
- **UK page**: 47.3 KB, groups `UK-wide / Constituent countries /
  Cross-territory` at 8 / 11 / 5 = 24, all rows served without JavaScript, every
  `bd-` class styled, every jump link resolving, and no `systemKey`,
  `sharedHostGroup` or raw registry-type slug anywhere on a page.

## Rollback plan

Both commits are additive and confined to this branch; `origin/main` is untouched
at `499cdc1`.

- **Revert everything:** `git revert --no-commit 1907ee8 6db5f52 && git commit`,
  or simply do not merge.
- **Keep the wave, drop the completion:** `git revert 1907ee8`. This removes the
  two registry types, the five procurement records, the disqualified directors
  record and the CanadaBuys record, and restores the classification blocker.
  `6db5f52` stands alone and its gate passed independently.
- **Drop one record:** delete it from its country JSON and run
  `node scripts/build-business-directories.cjs`; the generator prunes using the
  manifest. Update the matching coverage manifest in the same commit or the
  coverage tests will fail — which is intended.
- **Remove a registry type:** delete it from `REGISTRY_TYPES` in
  `bd-schema.cjs` and from `REGISTRY_TYPE_DEFINITIONS` in
  `bd-registry-types.cjs`. Any record using it must be removed or reclassified
  first, or the validator will reject the tree.
- **Un-share the Companies House host:** removing
  `gb-companies-house-disqualified-directors` also requires removing
  `resourceIdentity` from `gb-companies-house`, or the shared-host guard will
  flag a lone group member.
- **Post-merge:** the only cross-cutting change is the registry-type enum, which
  is additive; no existing record's classification changed.

Nothing here is deployed. No Domain Rating was measured. The final Wave 1 audit
has not begun.
