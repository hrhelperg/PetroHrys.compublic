# Wave 1F — European Union registries

Released 2026-08-05. Continues production from `00349f3` (Wave 1E/1E.1 merge).
Adds the supranational European Union layer and generalises the hub's handling
of supranational geographies. No schema change.

## Read this first: the wave was cut short

The research fleet **lost fourteen of seventeen agents to a monthly spend
limit**, including *every one* of the adversarial verifiers. Three research
clusters — intellectual property, sanctions, and chemicals/products — produced
no usable output at all.

What that means for this release:

- **Verification of all nine published records was carried out directly**, not by
  an agent. Every cited URL was fetched (57 addresses), every quotation was
  machine-checked as a contiguous substring of the live page (57 confirmed
  genuine), and the primary page of each published system was read.
- **EUIPO, TMview, DesignView, the EU Sanctions Map, the consolidated sanctions
  list, ECHA, CTIS, EUDAMED and RASFF were not assessed.** They are recorded in
  the backlog as *not researched* — not as coverage gaps, and not as rejections.

## What shipped

**Nine records.** Dataset **208 → 217**. European Union **0 → 9**.

| Record | Type | Access |
|---|---|---|
| BRIS — Business Registers Interconnection System | `cross-border-registry-interface` | unknown |
| VIES VAT number validation | `tax-verification-system` | open |
| Tenders Electronic Daily (TED) | `public-procurement-notice-database` | open |
| EU Transparency Register | `public-filing-database` | open |
| ESMA list of registered credit rating agencies | `financial-services-register` | open |
| EBA credit institutions register | `financial-services-register` | unknown |
| EBA register of payment and e-money institutions | `financial-services-register` | partially-open |
| EIOPA register of insurance undertakings | `financial-services-register` | unknown |
| EDES exclusion database | `exclusion-and-debarment-register` | open |

## The acceptance criterion at EU level

Most EU-wide systems **surface records that national authorities constitute**.
Five of the nine say so in prose a reader actually meets:

- **BRIS** interconnects the national business registers. The portal's own words:
  company information "is gathered in real time from the business registers of
  the Member States". It is typed `cross-border-registry-interface` and never a
  company register — and the EU legislation behind it is expressly *not* aimed at
  creating a central store of company data.
- **VIES** queries national VAT databases. Its own help text is decisive:
  *"There is no VAT database at Community level."*
- **EBA** (both registers) and **EIOPA** compile national authorisation
  decisions. The EBA states that granting licences to credit institutions
  "remains under the remit" of the national authorities.

**ESMA's credit rating agency list is the deliberate contrast** and is pinned by
test: ESMA is the single direct supervisor of CRAs, so there the EU institution
*is* the source of record. Losing that distinction would make the other four
meaningless.

## The hub defect this wave found and fixed

Wave 1F's Part 2 check was run empirically — a throwaway EU record was authored,
built, inspected and reverted. Result: **the schema was already correct**
(`entityType: supranational`, `iso2: null`, and the validator carries a named
rule that the EU must never be modelled as a country), but the *build* was not.

The hub lifted supranational entries out of the national grid and then
compensated for `global` **by name**. With records present, the EU page
generated, entered the sitemap, and had **zero inbound links from anywhere** — an
orphan, and no test caught it.

Fixed by generalising the existing behaviour: every supranational geography with
published records is now rendered in a *Supranational registries* section.
Global's public output is unchanged. **Empty supranational entries render
nothing**, because a scope with no records is a plan.

A visible **Supranational** label was added beside the heading on the EU and
Global pages. It renders the human scope label, never the stored `entityType`,
and sits outside the H1.

> **One deliberate divergence, flagged rather than hidden.** The brief asked for a
> "Supranational" label on both pages. The label is derived from each entry's
> declared `scope`, so the EU reads **Supranational** and Global reads **Global**.
> Printing "Supranational" on Global would be less accurate — a global editorial
> scope is not a supranational institution. Say the word and I will make it a
> literal on both.

## What did not ship

Sixteen candidates determined, nine published.

- **Rejected as not a publishable register**: the ESMA Registers *portal* (a
  search front-end over dozens of legally distinct registers — publishing it
  would merge unrelated databases into one record), and the EIOPA insurance
  *intermediaries* page (a table of links to national registers, containing no
  intermediary records of its own).
- **Duplicate**: e-Justice "Find a company" is not a second system. The portal
  states it *is part of* BRIS, and both would share one URL.
- **Out of scope**: the **European Patent Office / European Patent Register** is
  an intergovernmental body under the European Patent Convention, not an EU
  institution. It is recorded as out-of-scope and **not** counted as an EU gap.
  No intergovernmental geography model was created.
- **Pending**: EORI (classification unresolved — it usually confirms validity
  *without* identifying the trader), the Financial Transparency System (a
  spending-disclosure database, registry fit arguable), and the Funding & Tenders
  Participant Register.

## Dead and invented addresses, recorded

`vies.ec.europa.eu` **does not exist** — DNS does not resolve. It was
hypothesised as a plausible URL, tested, and disproved. Three legacy VIES `.do`
pages return 404 while still being linked from inside the live application. The
e-Justice numeric-ID URL has moved to a slug. And Implementing Regulation (EU)
2015/884, **still cited on the live official BRIS page, is no longer in force** —
so the record describes the legal basis generally rather than repeating a stale
citation.

A test bars every one of these from any field a reader can follow.

## No new Domain Rating

No EU host is an already-measured domain. Every new record carries
`domainRating: null` and empty provenance. **66 records over 64 measurements**;
digest unchanged at `aa7e6984…19847a4e`.

## Verification

Validator exit 0 · second migration rewrote 0 · second build wrote 0 and pruned 0
· **833 tests pass, 0 fail** (809 before, 24 added) · **18 injected defects all
caught, 0 broken probes** · 21,102 links, 0 broken · sitemap equals the indexable
set (288 = 288) · RSS equals 217 published records · 288 JSON-LD blocks · unique
titles and descriptions · no network or credential dependency · clean tree.

**Three mutation probes initially survived and led to real fixes.** Two invented
or dead URLs passed because the build makes no network request by design, so no
test can prove a URL is live — the answer was to **pin every EU address** in a
test, making a swap a deliberate act of re-verification. The third exposed a
genuinely weak guard: BRIS could have described itself as "the European company
register" and still passed, because the check searched all visible prose rather
than the description and the limitations specifically. Both were strengthened,
and one incomplete probe was fixed rather than counted as a pass.

**Two existing guards caught defects.** The procurement classification guard
rejected the commit until TED was consciously admitted to its checked set — the
set-equality design working exactly as intended. My own pinned-URL guard then
produced a false positive on the VIES editor note, which legitimately *records*
that `vies.ec.europa.eu` does not resolve; the check was narrowed to link fields
rather than the note being deleted.
