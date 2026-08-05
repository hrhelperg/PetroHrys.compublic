# fix: correct European government registry provenance

Continues production from `342ff8d` (Wave 1C-3, United Kingdom). Two commits: the
Wave 1 coverage audit (`466a62b`, docs-only) and the corrections (`10c6500`).

**A corrective phase. No new records were added and no country expansion was
started.** The Wave 1 final audit found four published records that did not
merely lack fields — they **misidentified who holds a register**, which is the
error class this dataset's standards exist to prevent.

---

## Four European source-of-record corrections

### Germany — `de-registerportal`

Presented handelsregister.de as the constitutive German commercial register.

- **HGB § 8(1):** *"Das Handelsregister wird von den Gerichten elektronisch
  geführt."* — kept **by the courts**.
- **HRV § 1:** each register sits with the Amtsgericht at a Landgericht seat.
- **HGB § 9(1):** the Länder justice administrations *determine the electronic
  system* through which register data is retrieved.

`company-register` → **`public-filing-database`**, because § 9(1) covers
inspection of the register *and of the documents filed with it* — the prior note
denying a filed-document function was wrong. Aggregator framing removed; the
courts are now named as the holders; court certification under § 9(3) recorded.

### France — `fr-annuaire-entreprises`

Treated as a source of record. It publishes itself as the official **search
engine**, and its own sources page lists the **Registre National des Entreprises**
and the **Base Sirene** among the administrations whose data it uses.

`business-entity-register` → **`corporate-number-database`**, whose boundary note
covers this exactly: an identifier lookup is not automatically the legal
register, and where the identifier is issued by a statistical body while
incorporation happens elsewhere, this type applies.

### Spain — `es-registradores`

Presented the **Colegio de Registradores** — a public-law corporation *of
registrars* — as the company register, and claimed two further registers.

- **RD 892/2013 art. 2.2:** *"El Registro Público Concursal depende del Ministerio
  de Justicia"*.
- **Art. 2.3:** entrusts only *"la gestión material del servicio de publicidad"*
  to the Colegio, *"bajo la dependencia del Ministerio de Justicia"*.
- **Art. 4:** names the Ministry as the responsible body.

Types reduced from `[company-register, insolvency-register,
beneficial-ownership-register]` to **`[public-filing-database]`**. The delegated
management role is **stated in prose, not deleted** — but it does not make the
Colegio the register.

### Italy — `it-registro-imprese`

Attributed the operator to **InfoCamere**, the chambers' own IT consortium. The
site publishes itself as *"I dati Ufficiali della Camera di Commercio"*.

`operator.name` → **Italian Chambers of Commerce**; `operator.type` `other` →
**`public-law-body`**. The consortium's real technical role is kept in prose.

**Registry types unchanged.** Unlike the other three, this system genuinely *is*
the constitutive register — only the attribution was wrong.

## Georgia institutional operator correction

`us-georgia-business-search` named the **sitting Secretary of State** in
`operator.name`, the description, three pros and the editor notes. An operator
identifies the responsible office; an incumbent's name goes stale at the next
election.

Now `Corporations Division, Office of the Georgia Secretary of State` throughout.
A con carrying observation notes about bot management and the absence of a
CAPTCHA was also removed — that is research provenance, and the access block
already records `captcha: false`.

A repo-wide sweep found no other record naming an individual.

## Backlog cleanup

Two sections asserted blockers that no longer exist:

| Stale claim | Reality |
|---|---|
| "no registry type in the closed list honestly describes an exclusion or debarment register" | `exclusion-and-debarment-register` exists; `us-sam-exclusions`, `us-hhs-oig-leie` and `us-cftc-sanctions-in-effect` are all published |
| FDA Drug Establishments "blocked by the canonical-domain rule" | Solved by the `resourceIdentity` shared-host model; published as `us-fda-drug-establishments` |

Both moved to resolved sections with their historical notes retained — the record
that a classification blocker was *reported rather than worked around* is worth
keeping. Three Spanish candidates were added for Wave 1E, including the
**Registro Mercantil Central**, since Spain still has no record for its actual
company register.

## Unchanged routes and metrics

Ids, slugs, websites, routes, countries, categories, tiers, verification dates,
reviewers, Domain Rating values and provenance are **pinned** — the correction
script asserts them byte-identical before and after, and a test pins them
independently. **No route moved, so no redirect was needed.**

**No new Domain Rating measurement:** 64 measurements, digest
`aa7e6984…19847a4e`, unchanged.

**One score changed.** `es-registradores` 88 → 85: `businessUsefulness` 8→7 and
`industryImportance` 9→7, because the record now covers an access service to
three registry systems rather than the four register functions it claimed — a
real reduction in what a reader gets. The other four are unchanged, because what
was wrong there was the *description of the system*, not its usefulness or
reliability.

## Official-source evidence

Every correction was re-confirmed from primary sources during this phase, not
carried over from the audit:

| Record | Source re-read |
|---|---|
| Germany | `gesetze-im-internet.de` HGB § 8, § 9 (verbatim) |
| France | `annuaire-entreprises.data.gouv.fr` title and `/donnees/sources` |
| Spain | BOE `BOE-A-2013-12630` (RD 892/2013) arts. 2 and 4 (verbatim) |
| Italy | `registroimprese.it` page title and footer |
| Georgia | `ecorp.sos.ga.gov` official pages |

No blogs, law-firm articles, search snippets, Wikipedia, memory, paid APIs or
credentials were used.

## The rule this establishes

Documented permanently in the operator runbook:

> An official search portal, interoperability layer or consultation interface
> must not be described as the legal source of record unless the responsible law
> or official documentation establishes that role.

With four worked distinctions: **where the register is constituted**, **the
responsible authority**, **who runs the access route**, **who provides the
technology**.

**No schema change.** A `responsibleAuthority` / `technicalOperator` /
`sourceOfRecord` split was considered and **rejected as premature** — all four
records corrected cleanly inside the current model, with `operator` naming the
authority, the registry type carrying the constitutive-versus-access distinction,
and prose carrying the technical provider.

## Tests and audit results

- **770 tests pass, 0 fail** (758 before; 12 added in
  `bd-source-of-record.test.cjs`).
- **11 injected defects, all caught** — every correction reverted in turn, plus a
  second record given an officeholder name and a pinned value changed.
- Two of my own probes were **false positives and were narrowed rather than
  accepted**: an officeholder sweep that flagged "Secretary of State, Business
  Registration Division", and a schema-leak check that flagged the
  `data-bd-state="notApplicable"` CSS hook (present on 135 pages, visible on 0).
- The **existing** suite caught a defect I introduced: a rewritten Georgia
  description welded a second clause onto an "It covers" stem. Fixed by splitting
  the sentence.
- Validator exit 0 · migration idempotent · build byte-identical on rebuild ·
  14,758 links, 0 broken · sitemap equals the indexable set (258 = 258) · RSS
  equals published records · 258 JSON-LD blocks clean · unique titles and
  descriptions · no schema terminology in the visible text of any page.

## Rollback plan

Both commits are additive and confined to this branch; `origin/main` is untouched
at `342ff8d`.

- **Revert everything:** `git revert --no-commit 10c6500 466a62b && git commit`,
  or simply do not merge.
- **Keep the audit, drop the corrections:** `git revert 10c6500`. This restores
  the four source-of-record claims and the Georgia officeholder name, so it
  reinstates known-false public statements — do this only to unblock, and
  re-apply promptly.
- **Revert one record:** each correction is a self-contained block in the commit;
  restore that record's JSON object and run
  `node scripts/build-business-directories.cjs`. The matching test in
  `bd-source-of-record.test.cjs` will then fail, which is intended — delete the
  test in the same commit if the revert is deliberate.
- **No data migration, no route change, no redirect** is involved in any
  direction, and no Domain Rating was touched.

Nothing here is deployed. Wave 1E Continental Europe has not begun.
