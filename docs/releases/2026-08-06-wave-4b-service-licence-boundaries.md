# Wave 4B — Telecom service & licence boundary audit

Prepared 2026-08-06. Continues production from `ca562d7` (Wave 4A-2, PR #37). No
schema change, no route change, **no taxonomy change**.

## One record, and that is the point

Wave 4B audited VoIP, MVNO, broadcasting, satellite, fixed wireless, number
portability and postal across eleven jurisdictions. **One record shipped.**
Everything else resolved to an absorbed view, an operational database, an
out-of-scope population, or a browser-blocked pending determination.

The brief says this explicitly, and it is worth restating: *"Expected outcome may
be: few new records; many absorbed views; several operational databases excluded;
several browser-pending candidates. This is a successful outcome."*

Dataset **271 → 272**; 343 pages.

## The determination the wave exists to make

**VoIP, MVNO and fixed wireless are service categories, not statutory
populations.** No jurisdiction researched publishes a separate register for any of
them. Where the label appears, it is a filter:

- **Czechia** exposes network types (metallic, terrestrial radio licensed and
  unlicensed, satellite, 2G-to-5G mobile) and service types (number-based
  interpersonal fixed and mobile, M2M, internet access) as search filters on the
  one operator register.
- **Germany and Czechia** both *exclude* number-independent interpersonal services
  — email and messaging — from the notification duty entirely.
- **Spain** includes those providers, but expressly *"a efectos estadísticos y
  censales"* — a different legal effect from an operator's entry.

Because these determinations produce no records, nothing but a test protects
them. Twelve plausible invented ids are now blocked, and no record may be named
after a service category.

## The one record that is not a duplicate

**Germany's postal Anbieterverzeichnis** is approved because it is a different
legal act from anything published. Entry is **constitutive**, not declaratory:

> *"Postdienstleistungen dürfen nur noch von Anbietern erbracht werden, die in das
> sogenannte 'Anbieterverzeichnis' eingetragen sind."*

and a provider may only subcontract to an entered provider. That is stronger than
the § 5 TKG telecommunications notification the same agency keeps on the same
host — where the undertaking declares and the agency records, granting nothing.

Both now declare `resourceIdentity` in the `bundesnetzagentur-de` group with
distinct system keys, and each points at the other.

A transitional regime was still running at verification: providers notified under
the former section 36 before 18 July 2024 may continue only until **18 August
2026**, and only if they applied by 20 July 2026 — twelve days after this record
was written. That is published as a limitation, because during the window the
directory does not yet show every lawful provider.

## Czechia: all 14 ČTÚ databases classified, no new records

Four remain published (operators, numbering, spectrum, postal). Six are absorbed —
the radio and television transmitter overviews are filtered spectrum views, the TV
one naming itself *"Přehled platných individuálních oprávnění"*; the 71–76 and
81–86 GHz dataset is a technical view; BMIS is a coordinate-searched site
inventory; the notified-interfaces database is a technical disclosure attached to
operators already covered; the pre-2024 postal database is a temporal predecessor.
Two equipment lists are out of scope. The price barometer and blocked-website list
were rejected.

## Two pre-existing records were repaired

`us-fcc-uls` and `us-fcc-form-499` predate the content contract and stated
**neither** what inclusion proves nor what absence proves. Both now do, using only
what each record already established.

This surfaced because the Wave 4B guards run across the **whole telecom layer**,
not just the new record. The alternative — scoping the guard to this wave — would
have passed cleanly and hidden a real gap in two published records.

## Verification

| Gate | Result |
|---|---|
| Validator | exit 0 |
| Migration ×2 | rewrote **0** on both runs |
| Generator ×2 | second run wrote **0**, pruned **0** |
| Tests | **1,016 pass, 0 fail** (993 before, 23 added) |
| Mutation probes | **23 injected, 23 caught, 0 survived, 0 broken, 0 no-op** |
| Internal links | 4,269 in-dataset hrefs, **0 broken** |
| Sitemap | equals the indexable set (**343 = 343**), 0 duplicates |
| RSS | equals published records (**272 = 272**) |
| JSON-LD | 343 blocks, **0 malformed** |
| Canonical / titles / descriptions | present, unique |
| Editor, shared-host and duplicate-audit notes | leak to **0** pages |
| Four roles | determined separately |
| Publication truth | clean across all 272 records |
| Live URL re-check | both German systems **200** |
| Domain Rating | null; 67 records over **64** measurements, digest unchanged |
| Network dependency | none; no `package.json`, no `node_modules` |
| Working tree | clean |

**Access distribution (telecom layer, 13 records):** partially-open 11 · open 1 ·
unknown 1. **Scores:** 90 to 81.

**Two harness defects were found and fixed before the run was accepted.** A
survivor exposed a missing regulator-homepage guard, now covering the whole
telecom layer. And four probes collided on `systemKey`, so a structural error
masked whether the semantic guard fired; each clone now carries its own key.

Worth recording: **the validator already enforces the Part 5 boundary natively** —
it rejects a record whose website "is not materially different … on the same
host", naming query-parameter variants and search modes explicitly. The
VoIP-filter probe was caught by that rule.

## Pass 2 corrections

**Zero.** All five German postal quotations matched contiguous official text on an
independent second fetch, and the register still rendered rows.

## Taxonomy

**No gate triggered, no type proposed.** `regulated-operator-register` now carries
12 of 13 telecom records — notification, registration, constitutive entry,
numbering rights, spectrum authorisations and postal entry — and its definition
honestly covers all of them. But it is doing a great deal of work, and the
distinctions it flattens are carried entirely by prose and tests. A dedicated
taxonomy wave is the right place to revisit that, **after** the browser queue is
cleared so the candidate set is actually known.

## Rollback

Additive; `origin/main` untouched at `ca562d7`.

- **Revert everything:** `git revert --no-commit <head>..<base> && git commit`.
- **Reverting `de-bnetza-post-anbieterverzeichnis`** additionally requires removing
  the `bundesnetzagentur-de` group and the relation from
  `de-bnetza-verzeichnis-gemeldeter-unternehmen`, and restoring the Germany count
  in `bd-germany-france-professional.test.cjs` to 14.
- **Three pre-existing records were modified:** the German telecom directory
  (resourceIdentity + relation), and the two FCC records (added limitations).

## Recommended next phase

Not another telecom research wave. The remaining questions — Ofcom, ACMA, ARCEP,
AGCOM ROC, UKE — are all blocked on browser access, and re-researching them will
re-derive the same pending determinations. **Clear the browser queue first**, then
run a taxonomy wave against a known candidate set.
