# Wave 1D — European legacy truth correction

Released 2026-08-05. Continues production from `342ff8d` (Wave 1C-3, United
Kingdom). A corrective phase: **no new records were added**, and no country
expansion was started.

The Wave 1 final coverage audit found four published records that did not merely
lack fields — they **misidentified who holds a register**. This phase corrects
them, plus one operator naming an individual, plus two stale backlog claims.

## What was wrong, and what it says now

### Germany — `de-registerportal`

Presented handelsregister.de as the constitutive German commercial register.

Handelsgesetzbuch **§ 8(1)**: *"Das Handelsregister wird von den Gerichten
elektronisch geführt."* — the register is kept **by the courts**.
Handelsregisterverordnung § 1 assigns each register to the Amtsgericht at a
Landgericht seat. Handelsgesetzbuch **§ 9(1)** has the Länder justice
administrations *determine the electronic information and communication system*
through which register data is retrieved, and permits a joint cross-Land system.

| | Before | After |
|---|---|---|
| primaryRegistryType | `company-register` | `public-filing-database` |
| registryTypes | `[company-register]` | `[public-filing-database]` |
| operator | Justizverwaltungen der Länder (German state justice administrations) | Landesjustizverwaltungen (justice administrations of the German Länder) |
| Framing | "portal **aggregating** the registers" | designated retrieval route; **registers kept by the courts** |

Reclassified to `public-filing-database` because § 9(1) covers inspection of the
register *and of the documents filed with it* — the earlier note claiming the
evidence showed "register aggregation, not a filed-document database" was wrong.
The record now also records that a court can certify retrieved data (§ 9(3)).

### France — `fr-annuaire-entreprises`

Presented as a register. It is the government's official **search interface**;
its own sources page lists the Registre National des Entreprises and the Base
Sirene among the administrations whose data it uses.

| | Before | After |
|---|---|---|
| primaryRegistryType | `business-entity-register` | `corporate-number-database` |
| Framing | "directory publishing official legal information" | search interface resolving SIREN/SIRET, drawing on RNE and Sirene |

`corporate-number-database`'s own boundary note covers this exactly: an
identifier lookup is not automatically the legal register, and where the
identifier is issued by a statistical body while incorporation happens elsewhere,
this type applies rather than `company-register`.

### Spain — `es-registradores`

Presented the **Colegio de Registradores** — a public-law corporation *of
registrars* — as the company register, and claimed two further registers.

Real Decreto **892/2013 art. 2.2**: *"El Registro Público Concursal depende del
Ministerio de Justicia"*. **Art. 2.3** entrusts only *"la gestión material del
servicio de publicidad"* to the Colegio, *"bajo la dependencia del Ministerio de
Justicia"*. **Art. 4** names the Ministry as the register's responsible body.

| | Before | After |
|---|---|---|
| primaryRegistryType | `company-register` | `public-filing-database` |
| registryTypes | `[company-register, insolvency-register, beneficial-ownership-register]` | `[public-filing-database]` |
| **PetroHrys Score** | **88** | **85** |

The delegated management role is real and is **stated in prose**, not deleted —
but it does not make the Colegio the register. `beneficial-ownership-register`
was removed because no official source establishing the Colegio as the
responsible register was read in this phase.

**This is the one score that changed.** `businessUsefulness` 8→7 and
`industryImportance` 9→7, because the record now covers an access service to
three registry systems rather than the four register functions it claimed. That
is a genuine reduction in what a reader gets, not a presentational change. No
other factor moved.

### Italy — `it-registro-imprese`

Attributed the operator to **InfoCamere**, the Chambers of Commerce's own IT
consortium. The site publishes itself as *"I dati Ufficiali della Camera di
Commercio"*.

| | Before | After |
|---|---|---|
| operator.name | InfoCamere, with the Italian Chambers of Commerce | Italian Chambers of Commerce |
| operator.type | `other` | `public-law-body` |

**Registry types are unchanged.** Unlike Germany, France and Spain, this system
genuinely *is* the constitutive register, so `company-register` and
`public-filing-database` both remain correct. Only the attribution was wrong. The
consortium's real technical role is recorded in prose rather than deleted.

### United States — `us-georgia-business-search`

`operator.name`, the description, three pros and the editor notes all named the
**sitting Secretary of State**. An operator field identifies the responsible
office; an incumbent's name goes stale at the next election.

Now `Corporations Division, Office of the Georgia Secretary of State` throughout.
A con that recorded observation notes about bot management and the absence of a
CAPTCHA was also removed from published prose — that is research provenance, and
the access block already records `captcha: false`.

## Backlog corrections

Two sections asserted blockers that no longer exist:

1. **"Held pending a glossary decision"** claimed no registry type described an
   exclusion register. `exclusion-and-debarment-register` exists and all three
   candidates are published (`us-sam-exclusions`, `us-hhs-oig-leie`,
   `us-cftc-sanctions-in-effect`). Moved to resolved, historical note retained.
2. **FDA Drug Establishments** was listed as blocked by the canonical-domain
   rule. That was solved by the `resourceIdentity` shared-host model; it is
   published as `us-fda-drug-establishments`. Moved to resolved.

Two Spanish candidates were **added** to the backlog for Wave 1E: the Registro
Mercantil Central (Spain still has no record for its actual company register) and
the Registro Público Concursal.

## What did not change

Ids, slugs, websites, routes, countries, categories, tiers, verification dates,
reviewers, Domain Rating values and Domain Rating provenance are **pinned** — the
correction script asserts they are byte-identical before and after, and a test
pins them independently.

No new Domain Rating measurement: **64 measurements, digest
`aa7e6984…19847a4e`, unchanged**. No route moved, so no redirect was needed.

Four of the five scores are unchanged, because in those cases what was wrong was
the *description of the system*, not its usefulness or reliability.

## The rule this establishes

Documented permanently in the operator runbook:

> An official search portal, interoperability layer or consultation interface
> must not be described as the legal source of record unless the responsible law
> or official documentation establishes that role.

With four worked distinctions: **where the register is constituted**, **the
responsible authority**, **who runs the access route**, and **who provides the
technology**.

**No schema change was needed.** A `responsibleAuthority` / `technicalOperator` /
`sourceOfRecord` split was considered and rejected as premature — all four
records corrected cleanly inside the current model, with `operator` naming the
authority, the registry type carrying the constitutive-versus-access
distinction, and prose carrying the technical provider.

## Verification

Validator exit 0 · second migration rewrote 0 · second build wrote 0 and pruned 0
· **770 tests pass, 0 fail** (758 before, 12 added) · **11 injected defects all
caught** · 14,758 links, 0 broken · sitemap equals the indexable set · RSS equals
published records · corrected operators render correctly with no stale JSON-LD,
no duplicated sections and no schema terminology in visible text.

One defect was caught by the *existing* suite during this work: a rewritten
Georgia description welded a second clause onto an "It covers" stem, which
`bd-publication-truth.test.cjs` rejected. Fixed by splitting the sentence.
