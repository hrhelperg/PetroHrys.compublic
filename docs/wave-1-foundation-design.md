# Wave 1 foundation — government & statutory registries

Design note for the schema and rendering changes that Wave 1 needs before any
registry record is authored. Approved 2026-08-04. **No Wave 1 records are added
by this phase.**

## Why the existing shape was not enough

Batch 1 shipped 72 records describing directories a business chooses to appear
in. Wave 1 describes registers a business *appears in by law*, and four things
that model could not express:

1. **Subnational jurisdiction.** `country` is a flat slug and `scope` was only
   `global` / `national` / `regional`. Fifty US state registries had nowhere to
   record which state they belong to, and encoding it in editorial tags would
   have broken filtering, breadcrumbs and sitemap semantics.
2. **Supranational scope.** The EU is not a country, and the geographic registry
   had no way to say so.
3. **Native and English names together.** `name` held whichever form the
   reviewer chose. That works for Latin script but cannot carry
   国家企业信用信息公示系统 *plus* an English title *plus* whether that title is
   the operator's own or ours.
4. **Registry classification, operator and access.** Wave 1's record contract
   requires all three as fields; they existed only as prose in `editorNotes`.

A fifth problem was structural: the validator did **not** reject unknown fields,
so "do not improvise per-country fields" was unenforceable.

## What was added

Every field is nullable and normalised in memory, so records written before this
wave keep their bytes and their rendered output.

| Field | Shape |
|---|---|
| `jurisdiction` | `{type, name, code, parentCountry}` or null. `type` from an eight-value enum; `code` is ISO 3166-2 or null |
| `scope` | now a validated enum: `global`, `supranational`, `national`, `subnational`, `regional` |
| `officialName` / `nativeName` / `englishName` / `englishNameSource` | resolved by one function, `displayName()` |
| `primaryRegistryType` / `registryTypes[]` | 18-value enum; the primary must appear in the list |
| `operator` | `{name, type, officialUrl}` or null; `type` from an eight-value enum |
| `publicAccess` | `{searchUrl, accessLevel, six tri-state booleans, notes}` or null |

Geographic registry entries gained `entityType` (`country` | `supranational`),
and the European Union, China and Japan were declared.

## Decisions worth recording

**The resolver, not the field, is the contract.** Four name fields would be a
maintenance problem if each renderer picked one. `displayName()` is the only
function allowed to choose, and titles, breadcrumbs, JSON-LD, cards, tables and
the search index all call it. `officialName` falls back to `name`, so for the 72
existing records the resolver returns exactly the string it always did.

One consequence is deliberate and tested: once `officialName` exists, changing
`name` alone does not change the display. `officialName` is the authoritative
form. A test pins this so it is a documented behaviour rather than something
discovered while debugging a render.

**`global` is modelled as `supranational`, not as a country.** The enum has two
values and `global` is neither a sovereign state nor an institution. Pairing
`entityType: supranational` with its existing `scope: "global"` distinguishes it
from the EU, which is `(supranational, supranational)`. Neither claims to be a
country, which is the property that matters. If a third kind of entry ever
appears, the enum should grow rather than be stretched further.

**Access level is recorded, never derived.** `accessLevel: "unknown"` with every
boolean null is the honest default for a register nobody has tested. Inferring
"open" from absent restrictions would manufacture a claim about whether a reader
can actually use the register. The validator rejects a stated level that
contradicts a stated boolean, in both directions — `open` with `loginRequired:
true`, `login-required` with `loginRequired: false`, and so on.

What it deliberately does *not* reject is `accessLevel: "unknown"` alongside an
established boolean. Knowing a register is free to search says nothing about
whether it also demands a login, and forcing a level to be asserted whenever any
fact is known would compel the very inference this model exists to prevent.

**Orphan keys are caught before the migration eats them.** `migrateRecord`
builds a fresh object from a fixed key list, so an unknown field was previously
dropped in silence — a typo produced no error and no data. The migration now
records unrecognised source keys on a non-enumerable `Symbol`, invisible to
`JSON.stringify`, `Object.keys` and every rendered surface, which the validator
reads and rejects.

**Jurisdiction codes identify places, not records.** Several registries can
share `US-CA`; California has more than one. What is forbidden is two records
disagreeing about what `US-CA` names, or a code whose prefix contradicts its
parent country.

## US country page

Grouping activates only when a country actually holds a subnational record.
Today the United States has four records, none of them subnational, `jurisdictionGroups()`
returns `null`, and the page renders the single table it always has — no empty
"States" heading for coverage that does not exist. Once Wave 1B lands, the page
groups as Federal → States A–Z → Federal district → Territories, each a table
with its own caption so a screen reader announces the set it is in and a narrow
viewport scrolls each independently. A jump filter with derived counts appears
once there are two or more groups.

No new route family. Detail URLs are unchanged. Pagination and `/states/<state>/`
routes are deliberately *not* built: whether they are needed is an evidence
question that Wave 1B's real page size will answer.

## Backfill

Eighteen existing government, finance-regulator and healthcare-regulator records
were backfilled with `operator`, `primaryRegistryType`, `registryTypes`, and
`nativeName` where the official name is not English. Every value came from what
that record already stated in its verified description, pros, cons or
`editorNotes` — this was a structural pass, not new research.

Two operators were corrected during adversarial review, where the first pass had
drifted from the record's own wording: `ca-corporations-canada` now names
Corporations Canada, which its description says operates the search, rather than
the parent department; and `pl-ceidg` records the Ministry of Development and
Technology as the *supervising* authority, which is the relationship its
evidence actually establishes. `pl-ceidg` also gained the official English name
its notes already cited.

`publicAccess` was populated for the thirteen records whose own verified
evidence establishes access terms, and left null for five where it does not:
`de-registerportal` (its notes say explicitly that whether every retrieval is
free was not established), `de-bundesanzeiger`, `fr-inpi`, `es-registradores`,
and `it-registro-imprese` (its notes say pricing tiers were not established).

Of those thirteen, only five carry `accessLevel: "open"` — the ones whose
evidence explicitly rules out a login or registration. The other eight state
`freeToSearch: true` with `accessLevel: "unknown"`: their sources establish that
searching costs nothing, which is not the same as establishing that nothing else
stands in the way. In this vocabulary `open` sits alongside `login-required` and
`restricted`, so claiming it from price evidence alone would be an inference.

`operator.officialUrl` is null throughout. The records name their operators but
do not cite an operator homepage, and inventing one would defeat the point.

## Known gap

The backfilled `operator`, `primaryRegistryType` and `publicAccess` values are
**captured but not yet rendered**. Surfacing them belongs with Wave 1A, where the
fields are populated across a whole wave and the UI can be designed once against
real coverage rather than eighteen retrofitted records.

Generated output changed on five pages only, all of them `pl-ceidg` and its
parents: that record gained the official English name its evidence already
cited, so the display resolver now returns it in place of the 60-character
Polish string. Every other page is byte-identical.

---

# Hardening phase

Closes the C8–C10 defects the adversarial review found, defines the registry
taxonomy, and surfaces the structured fields. Still no Wave 1 records.

## Definitions

**Scope.** `national` — one sovereign state. `subnational` — an administrative
jurisdiction within a state. `supranational` — an authority above several
sovereign states. `regional` — a multi-country or functional region that is *not*
a subnational jurisdiction. `global` — worldwide or broadly international.

`subnational` and `regional` are the pair most easily confused and are held
apart by validation: a record carrying a jurisdiction must be `subnational`, and
a `subnational` record must carry one.

**entityType.** `country` — a sovereign state, which must carry an ISO 3166-1
alpha-2 code. `supranational` — an authority above several states, which must
not. The European Union is `supranational` and is excluded from the country
grid, the country counter and the hub's ItemList.

**Jurisdiction.** `{type, name, code, parentCountry}`. `code` is ISO 3166-2 or
null. A code identifies a *place*, not a record: several registries may share
`US-CA`, but two records may not disagree about what `US-CA` names, and a code
whose prefix contradicts its parent country is rejected.

## Country grouping vocabulary (C9)

Presentation labels only — `jurisdiction.type` stays canonical and nothing is
stored per record. It is per-country because the wrong word is a factual error:
Spain and Italy have no federal tier, so heading their national registers
"Federal" would misdescribe their constitution.

| Country | Labels, in group order |
|---|---|
| United States | Federal · States · Federal district · Territories |
| Canada | Federal · Provinces · Territories |
| Australia | Federal · States · Territories |
| Germany | Federal · Länder |
| Spain | National · Autonomous communities |
| Italy | National · Regions |
| Japan | National · Prefectures |
| China | National · Provinces · Autonomous regions · Municipalities |
| France, UK, Poland, Czech Republic | National only |

Countries with no subnational record yet declare a neutral national label and
nothing else, so a subnational record filed under them fails until someone
writes the correct vocabulary rather than silently borrowing American terms. An
undeclared country/type pair throws, and the validator rejects it first.

**Adding a country or supranational entity:** add the `countries.json` entry with
its `entityType` and ISO code (or null), create the empty directories file, and
add a `JURISDICTION_VOCABULARY` entry. Skipping the vocabulary is safe — it fails
loudly the moment a subnational record needs it.

**Special administrative regions** are deliberately absent from China's
vocabulary. Hong Kong and Macao are separate legal systems and must be modelled
as their own entries if ever added, never folded into a mainland grouping.

## Ordering contract (C8)

`directoryTable` sorts with the shared comparator by default. `sortKey: null` is
the explicit opt-out meaning "already ordered, render as given". Grouped pages
use it, because sorting must happen **once, before grouping** — a silent re-sort
inside the table discarded the A–Z jurisdiction order and rendered States in
PetroHrys Score order instead.

## Nested orphan rejection (C10)

Rejection applies at every level, with dotted paths: `operator.agencyTyp`,
`jurisdiction.typoCode`, `publicAccess.requiresLogn`,
`metricsProvenance.domainRating.measuredDomian`. Wrongly typed containers are
rejected too — `registryTypes: "company-register"` used to be coerced to `[]`
with no complaint. Problems are collected before the migration's pickers can
discard them, and sorted by path so two runs report identically.

## Registry classification

The glossary lives in `scripts/lib/bd-registry-types.cjs`: 18 types, each with an
operational definition, an inclusion test, and the boundary against the type it
is most often confused with. These are operational descriptions of what a system
*does*, never claims about legal effect in any jurisdiction.

Validation is structural only. Which of `company-register` or
`business-entity-register` fits is an editorial reading of an official scope
statement, and the glossary is where that argument is recorded — a validator
cannot settle it. What is enforced: the primary type must be in the list, types
must be unique, a verified government or finance record must carry at least one,
a `cross-border-registry-interface` normally needs supranational/regional/global
scope, and `corporate-number-database` + `company-register` or
`public-filing-database` + `company-register` need the evidence to say so.

**Multifunction registries:** record every function the evidence supports. Do not
force one label. Mark as primary the function the system chiefly exists to
perform, and argue any contested pairing in `editorNotes`.

## publicAccess semantics

`accessLevel` is recorded, never derived. `unknown` with every boolean null is
the honest default for a register nobody has tested, and `unknown` alongside an
established boolean is **not** a contradiction — knowing a register is free to
search says nothing about whether it also demands a login. What is rejected is a
level contradicting a stated boolean: `open` with `loginRequired: true`,
`login-required` with `loginRequired: false`.

A `searchUrl` is a route, not a permission. It is never used to imply openness.

## Display-name resolution

One resolver, `S.displayName()`: `englishName` → `officialName` → `nativeName` →
`name`. Every title, breadcrumb, H1, CTA, card, table cell, RSS title, search
index entry and JSON-LD name goes through it, and the ordering comparator
resolves the same way so the prerendered order and the browser's re-sort agree.
Where `englishNameSource` is `editorial-translation`, the page discloses it.

## The standing rule

**A schema field is not an invitation to populate it.** Every one of these
fields is nullable, and null means "not established from an official source".
Unknown stays null; the UI renders only what is supported, so a gap costs
nothing on the page; and official evidence — not plausibility, not the shape of
the schema — decides every classification.
