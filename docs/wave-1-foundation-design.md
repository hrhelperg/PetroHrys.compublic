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
