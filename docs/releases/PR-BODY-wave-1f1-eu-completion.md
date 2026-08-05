# feat: complete European Union registry taxonomy and coverage

Continues production from `09e6c96` (Wave 1F, PR #29). Two commits:

- `775b4b0` — Wave 1F.1 EU completion: the three areas Wave 1F could not research
- `8c55809` — the approved taxonomy expansion, applied

**European Union 9 → 20 records. Dataset 217 → 228. Registry types 21 → 26.**

---

## Five types were added, not three

An earlier draft of the decision record said "three narrow types". **That was
wrong, and it is corrected throughout.** The proposal always contained **five
distinct enum values**.

The miscount came from category families. **Three of the six blocked systems sit
in the sanctions family** — the Sanctions Map, the consolidated financial
sanctions list, and the Sanctions Tracker — but a family is not a type. Those
three needed *different* values, because a regime index, a designation list and
an analytics interface are three different things. Counting families gives three;
counting the enum values actually required gives five.

```
clinical-trial-register
geographical-indication-register
sanctions-and-restrictive-measures-index
sanctions-designation-list
plant-protection-product-authorisation-register
```

| Value | Applied to | Record |
|---|---|---|
| `clinical-trial-register` | CTIS | `eu-ctis` |
| `geographical-indication-register` | GIview | `eu-giview` |
| `sanctions-and-restrictive-measures-index` | EU Sanctions Map | `eu-sanctions-map` |
| `sanctions-designation-list` | Consolidated list of EU financial sanctions | `eu-consolidated-financial-sanctions` |
| `plant-protection-product-authorisation-register` | EU Pesticides Database | `eu-pesticides-database` |

## The boundaries are the point

A type is only worth adding for what it **excludes**. Every boundary names the
neighbouring type it is distinct from, and each is asserted from **both**
directions by test — the record must carry the right type *and* must be
unreachable by the wrong one:

- a sanctions **regime index** is not a **designation list**;
- a **designation list** is not an **exclusion/debarment register** — a
  designation is a foreign-policy measure under the common foreign and security
  policy, while exclusion under the Financial Regulation bars a party from
  EU-funded award procedures. A test forbids **any** record from carrying both;
- a **geographical indication** protects origin, not a brand, so never a
  **trade mark register**;
- a **clinical trial register** is never widened into a general health, medicine
  or research database;
- a **plant protection authorisation database** is not a **chemicals register** —
  a test asserts it never shares a primary type with the ECHA platform.

`eu-eib-exclusion` and `eu-edes` **keep** `exclusion-and-debarment-register`.

Two operator disclaimers are required to stay explicit and are enforced in
published text: the Sanctions Map must keep naming the **Official Journal** acts
as the authentic sources, and the pesticides database must keep its own
**"no legal value"** statement.

## Four records retain unknown access, not three

A second count worth stating precisely. **Four** of the five new records carry
`accessLevel: unknown` with every boolean null, because their interactive
behaviour was not verified: **GIview, the EU Sanctions Map, the consolidated
financial sanctions list and the EU Pesticides Database**. Only **CTIS** ships as
`open`, and even that rests on EMA's own documentation rather than an executed
search — *"Anybody can view information held in CTIS on clinical trials in the EU
and EEA, by using the searchable public website."*

The consolidated list deserves a specific note: its application put an anonymous
client into a **redirect loop** and never served a page. That indicates it is
credential-gated but does **not** establish how, so `loginRequired` stays **null**
rather than being set to true. A test enforces that a redirect loop is never
described as login-required.

No access value was changed to make a record look more complete.

## The EU Sanctions Tracker remains blocked

**`sanctions-designation-list` was NOT assigned**, on two independent grounds:

1. **No official describing page exists.** The Commission's own sanctions
   resources page lists the Sanctions Map, the sanctions helpdesk, the
   consolidated list, the whistleblower tool and EUR-Lex — and **not** the
   Tracker. Neither does the open data portal's news index.
2. **Ambiguous function, and what evidence exists points away from a designation
   list.** The application is client-rendered; its only server-rendered signal is
   the navigation order — **Dashboard · Regimes · Nationalities · Individuals ·
   Entities**. It leads with a dashboard and organises by regime and nationality,
   with individuals and entities as views inside that frame.

Narrowest honest type, **proposed but not recommended**:
`sanctions-designation-analytics-interface`. Creating it on a single candidate
whose official description cannot be found is exactly what the no-broad-types
rule exists to prevent. **No sanctions analytics type was added.**

A test fails if the Tracker is ever published without an approved classification.

## What did not change

**Zero substantive changes** to the 217 records that existed on `origin/main`,
verified by a raw disk-to-disk diff rather than by assertion. The single exception
is **additive**: `eu-vies` gained a `resourceIdentity` block so EUDAMED could
share `ec.europa.eu`, which the duplicate-host guard requires. Its website,
registry types, access position, verification date and Domain Rating are pinned
unchanged by test.

**No new Domain Rating measurement.** 66 records display a rating over **64**
historical measurements; per-domain digest `aa7e6984…19847a4e`, unchanged since
Wave 1C-2.

**No API or build-time network dependency.** No `package.json`, no
`node_modules`, no fetch/http call anywhere in the build or its libraries, and
the build never references the measurement utility.

## Verification

| Gate | Result |
|---|---|
| Validator | exit 0 |
| Migration ×2 | second run rewrote **0** |
| Generator ×2 | second run wrote **0**, pruned **0** |
| Tests | **868 pass, 0 fail** |
| Mutation probes | **39 injected, 39 caught, 0 survived, 0 broken probes** (22 in `775b4b0`, 17 in `8c55809`) |
| Internal links | 21,888 scanned, **0 broken** |
| Sitemap | equals indexable set (**299 = 299**) |
| RSS | equals published records (**228 = 228**) |
| JSON-LD | 299 blocks, **0 malformed** |
| Canonical | present on every page |
| Titles / descriptions | unique |
| Registry types | 26 declared, labelled, documented, validated, **all used** |
| Shared hosts | 7 groups, every member with a unique `systemKey` |
| EU page | linked from hub, badged **Supranational**, 20 record links |
| Working tree | clean |

## Rollback

Both commits are additive and confined to this branch; `origin/main` is untouched
at `09e6c96`.

- **Revert everything:** `git revert --no-commit 8c55809 775b4b0 && git commit`,
  or simply do not merge. No data migration, no route change and no redirect is
  involved in either direction.
- **Keep the EU records, drop the taxonomy:** not possible as a clean revert.
  `git revert 8c55809` removes the five approved types **while five records still
  reference them**, so the validator will fail closed on the next run. If the
  taxonomy must be withdrawn, revert both commits together.
- **Revert one record:** delete its object from
  `data/business-directories/directories/european-union.json` and run
  `node scripts/build-business-directories.cjs`. Its guards in
  `bd-eu-taxonomy.test.cjs` and `bd-european-union.test.cjs` will then fail, which
  is intended — remove the matching pins in the same commit if the revert is
  deliberate. Note the type it used will become **unused**, which the
  every-type-is-used test also rejects; withdraw the type in the same commit.
- **Undo only the VIES change:** delete its `resourceIdentity` block. The
  duplicate-host guard will then reject EUDAMED, so remove that record too or the
  registry will not load.
- **No Domain Rating was touched**, so no metric rollback is needed.

## Not done, deliberately

No records added beyond the five. No further taxonomy change. No Japan, China or
telecommunications work. No localisation, no redesign, no deployment.
