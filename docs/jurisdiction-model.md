# The jurisdiction model

Operational reference for how the Business Directories registry records *where*
a register has effect. This is a data-modelling document. It describes how to
file a record; it is not legal or constitutional advice, and nothing here should
be read as a statement about the status of any territory.

---

## Two different things both called "country"

These are unrelated fields and confusing them is the most likely mistake in this
model.

| | Meaning | Example |
|---|---|---|
| `entityType: 'country'` in the geographic registry | A sovereign state that the section publishes a country page for | United Kingdom, Canada, Australia |
| `jurisdiction.type: 'country'` on a record | A **constituent country inside** a sovereign state | England, Scotland, Wales |

A record for a UK-wide register has `scope: 'national'` and **no jurisdiction at
all**. A record for a Scottish register has `scope: 'subnational'` and a
jurisdiction of type `country`.

---

## Jurisdiction types

| Type | Used for |
|---|---|
| `state` | United States, Australia |
| `province` | Canada, and **Northern Ireland** |
| `territory` | United States, Canada, Australia |
| `federal-district` | District of Columbia |
| `region` | Germany (Länder), Italy |
| `autonomous-community` | Spain |
| `prefecture` | Japan |
| `municipality` | China |
| `country` | England, Scotland, Wales |
| `cross-territory` | A jurisdiction spanning several subdivisions, e.g. England and Wales |

### Why Northern Ireland is `province`

Because that is the subdivision category ISO 3166-2 itself assigns `GB-NIR`,
while `GB-ENG`, `GB-SCT` and `GB-WLS` carry the category `Country`. Filing
Northern Ireland as `country` would be tidier and would misdescribe the standard
the codes are drawn from.

On the page this makes no visible difference: the United Kingdom vocabulary maps
both `country` and `province` to the single group **Constituent countries**, and
the grouping code merges types that share a label so a reader never sees two
boxes with the same heading.

---

## `code` versus `covers`

A jurisdiction is identified by **one** ISO 3166-2 code, or — where it spans
several subdivisions and has no code of its own — by the **set** of codes it
covers.

```jsonc
// One subdivision: use code.
{ "type": "country", "name": "Scotland", "code": "GB-SCT", "parentCountry": "united-kingdom" }

// Several subdivisions: use covers, and no code.
{ "type": "cross-territory", "name": "England and Wales",
  "code": null, "covers": ["GB-ENG", "GB-WLS"], "parentCountry": "united-kingdom" }
```

Rules the validator enforces:

- never **both** `code` and `covers`;
- `covers` only on `cross-territory`, and `cross-territory` must have it;
- at least **two** entries, unique, **sorted**, all real ISO codes belonging to
  the parent country.

`covers` is stored sorted so the same territory is always the same bytes and the
same identity — two records covering England and Wales in different orders are
one jurisdiction, not two.

**`covers` is omitted from the file when it is null.** It is null on every
single-subdivision jurisdiction, and writing it out would add a null to every
subnational record on disk for no information.

### Great Britain is not the United Kingdom

Great Britain is England, Scotland and Wales. The United Kingdom is Great
Britain **and Northern Ireland**. A register covering Great Britain is a
`cross-territory` jurisdiction:

```jsonc
{ "type": "cross-territory", "name": "Great Britain",
  "code": null, "covers": ["GB-ENG", "GB-SCT", "GB-WLS"], "parentCountry": "united-kingdom" }
```

A UK-wide register is not a jurisdiction at all — it is `scope: 'national'` with
`jurisdiction: null`.

---

## Forbidden identifiers

`scripts/lib/iso-3166-2.cjs` rejects these **by name**, with a reason, because a
bare "unknown code" would not tell an author what to use instead.

| Identifier | What it actually is |
|---|---|
| `GB-EAW` | A deprecated compound entity ("England and Wales"). Never an ISO 3166-2 subdivision — ISO listed it as supplementary material "for completeness" and Unicode CLDR marks it deprecated. Use `covers: ["GB-ENG", "GB-WLS"]`. |
| `GB-GBN` | Same, for Great Britain. Use `covers: ["GB-ENG", "GB-SCT", "GB-WLS"]`. |
| `GB-UKM` | Same, for the United Kingdom. A UK-wide system is `scope: 'national'`. |
| `GB-CYM` | An alternative form of `GB-WLS` carried inside its ISO name, not a separate subdivision. Use `GB-WLS`. |
| `GB-CHC`, `GB-COH` | org-id.guide **organisation-list prefixes** (Charity Commission, Companies House). Not subdivisions. |
| `GB-NIC` | A charity-registration prefix. Northern Ireland is `GB-NIR`. |

**Not every identifier beginning `GB-` is an ISO 3166-2 subdivision.** Company
numbers, charity numbers, org-id.guide prefixes and internal database codes all
share the shape. Only the codes in the allowlist are subdivisions.

CLDR still carries display names for the deprecated compounds, which is exactly
why they look valid in downstream libraries — and why a format check is not
enough.

---

## The ISO 3166-2 allowlist

`scripts/lib/iso-3166-2.cjs` is a **project-maintained allowlist for the
jurisdictions the Research Center currently supports**. It is not the complete
ISO register and does not claim to be.

Covered: **US, CA, AU, DE, ES, IT, JP, CN, GB** — 591 subdivisions.

The previous check was structural only: it verified a code *looked* like
`XX-YYY`. `GB-ZZZ` passed. So did `GB-EAW`. Shape is not existence.

The module performs **no I/O** at runtime or build time. It is regenerated by
hand from the documented source when a country is added, and the source digest
is recorded in its header. Adding a country is a deliberate act — regenerate,
then review the diff.

An unlisted country fails with an actionable message rather than silently
passing:

> `"FR-IDF" belongs to "FR", which this allowlist does not cover (covered: US, CA, AU, DE, ES, IT, JP, CN, GB). Extend scripts/lib/iso-3166-2.cjs from its documented source before publishing records for it`

---

## Display

| Case | Rendered as |
|---|---|
| UK-wide | Scope: National |
| Single territory | Jurisdiction: Scotland · `GB-SCT` |
| Cross-territory | Jurisdiction: England and Wales · Covers England · Wales |

The jurisdiction's own name is primary; covered territories are secondary
metadata. Array syntax, synthetic codes and machine identity strings never
reach a page.

**No jurisdiction route family exists.** Detail URLs are unchanged:
`/research/business-directories/<country>/<registry-slug>/`.

---

## Worked examples

```jsonc
// United Kingdom — one register per legal territory
{ "type": "country",         "name": "England",           "code": "GB-ENG" }
{ "type": "country",         "name": "Scotland",          "code": "GB-SCT" }
{ "type": "country",         "name": "Wales",             "code": "GB-WLS" }
{ "type": "province",        "name": "Northern Ireland",  "code": "GB-NIR" }
{ "type": "cross-territory", "name": "England and Wales", "code": null,
  "covers": ["GB-ENG", "GB-WLS"] }

// Canada — unchanged by this phase
{ "type": "province",  "name": "Ontario",               "code": "CA-ON" }
{ "type": "territory", "name": "Northwest Territories", "code": "CA-NT" }

// Australia — unchanged by this phase
{ "type": "state",     "name": "New South Wales",             "code": "AU-NSW" }
{ "type": "territory", "name": "Australian Capital Territory","code": "AU-ACT" }
```

Canada groups as Federal / Provinces / Territories and Australia as Federal /
States / Territories, exactly as before.

---

## What migration will and will not do

Migration normalises **absent optional fields**. It does not make invalid source
data valid.

It will **not** silently fix a lower-case code, a deprecated code, an unsorted
`covers`, a duplicated entry or a wrong-country code. Each is reported against
its full field path with the file and record id, because an author who never
sees the error never learns the record was wrong.
