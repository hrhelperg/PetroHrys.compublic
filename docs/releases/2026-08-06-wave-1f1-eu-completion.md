# Wave 1F.1 — European Union completion

Released 2026-08-06. Continues production from `09e6c96` (Wave 1F merge, PR #29).
Completes the three EU areas Wave 1F could not research when its agent fleet hit
a spend limit. No schema change, no route change.

## What was outstanding, and what happened to it

| Area | Wave 1F status | Now |
|---|---|---|
| Intellectual property | not researched | **Researched.** 3 published, 1 blocked, EPO excluded |
| Sanctions and exclusions | not researched | **Researched.** 1 published, 3 blocked, 5 rejected |
| Chemicals, trials, regulated products | not researched | **Researched.** 2 published, 2 blocked, 1 rejected |

**No candidate remains `not researched`.** Eighteen candidates reached a
determination; **six published**. All 9 research and verification agents
completed this time — the spend limit did not recur.

## What shipped

**Six records.** Dataset **217 → 223**. European Union **9 → 15**.

| Record | Type | Access |
|---|---|---|
| EUIPO eSearch plus | `trademark-register` + `registered-design-register` | unknown |
| TMview | `cross-border-registry-interface` | unknown |
| DesignView | `cross-border-registry-interface` | unknown |
| EUDAMED | `regulated-operator-register` | unknown |
| ECHA CHEM | `public-filing-database` | partially-open |
| EIB exclusion decisions | `exclusion-and-debarment-register` | open |

## The distinction this wave exists to protect

EUIPO **keeps** the EU trade mark and EU design Registers. The regulations
themselves separate the instrument from the software: the office is obliged to
keep a Register, and *separately* to store the particulars in an electronic
database. So:

- **eSearch plus** is the public interface over those registers — not the
  registers. Saying otherwise is the same error as the TMview one, only subtler.
- **TMview** covers "trade marks of all participating official trade mark
  offices at national, international and EU level". It aggregates.
- **DesignView** provides "access to the EUIPO database of registered designs
  along with the databases of other national registries". It aggregates.

Both aggregators are typed `cross-border-registry-interface` and **nothing else**.
An earlier draft gave TMview `trademark-register` while stating three times that
it is not a register; that contradiction was removed rather than reconciled.

**Two contrasting cases are pinned by test**, because without them the
distinction collapses into a habit: for **ECHA CHEM** the agency *is* the source
of record (REACH dossiers are filed with ECHA, which is legally obliged to
publish specified parts), and for the **EIB** the bank takes the exclusion
decisions itself.

## Scoping answers

**The EUIPO trade mark and design searches are ONE system**, one application with
tabs for trade marks, designs, owners and representatives. So one record, not
two, and certainly not one per tab. The two rights are carried by two registry
types inside that record. A test asserts exactly one record sits on the EUIPO
host.

**TMview and DesignView are two records on one host** (`tmdn.org`), both
declaring `resourceIdentity`. Their shells are byte-identical — technically one
application serving two branded products — but they cover different rights, with
different participating-office populations, and the office describes them
separately. Flagged rather than decided silently; say the word if you want them
merged into one record.

## What was NOT published, and why that is not a gap

**Six real, live, official systems were held back because no type in the closed
21-type vocabulary describes them honestly.** Per the brief, the minimal type is
*proposed*, not created:

| System | Proposed minimal type |
|---|---|
| CTIS — Clinical Trials Information System | `clinical-trial-register` |
| GIview | `geographical-indication-register` |
| EU Sanctions Map | `sanctions-and-restrictive-measures-index` |
| Consolidated EU financial sanctions list (FSF) | `sanctions-designation-list` |
| EU Sanctions Tracker | `sanctions-designation-list` |
| EU Pesticides Database | `plant-protection-product-authorisation-register` |

**Five distinct types are proposed, covering six systems** — the consolidated
list and the Sanctions Tracker share one. An earlier draft of this note said
"three", which was simply wrong: the table above has always contained five
distinct values. **That decision is yours.** Two points
of substance behind the sanctions blocks: the Sanctions Map's own disclaimer says
*"Only the legal acts published in the Official Journal of the European Union are
authentic and produce legal effects"* — it visualises regimes, it is not a
designation register; and CFSP restrictive measures are legally distinct from
procurement debarment under the Financial Regulation, so typing either as
`exclusion-and-debarment-register` would be a category error.

**Rejected outright**: RASFF (an alert feed — the Commission states notifications
do not reveal commercial details), the DG COMP case database (an enforcement case
archive), the EU Sanctions Helpdesk (an advisory platform), the whistleblower
tool (a one-way form), the EDES *policy* page (would duplicate `eu-edes`), and
six live EUIPO services that are not registers (case law, TMclass, DESIGNclass,
Similarity, IPEP, certified copies).

**Out of scope**: the European Patent Register. The EPO is intergovernmental
under the European Patent Convention, not an EU institution. Pinned by test and
recorded in the backlog. It is **not** an EU coverage gap.

## One additive change to a published record

EUDAMED sits on `ec.europa.eu`, which the already-published **VIES** record also
uses. The architecture admits two systems on one official host only when both
declare a shared host group, so **VIES gained a `resourceIdentity` block**. The
authoring script asserts that nothing else about that record changes, and a test
pins its website, types, access position, date and Domain Rating independently.

## Currency corrections

- **EUDAMED is no longer voluntary.** The Commission announced that its first
  four modules became mandatory on **28 May 2026**. The long-standing "still
  voluntary" characterisation is out of date; the record states the current
  position and a test bars the old one.
- **"Registered Community design" is obsolete.** Regulation (EU) 2024/2822
  renamed the right to *registered EU design* and the register to the *Register
  of EU designs* from 1 May 2025. Barred from public text by test.
- **EU CTR is live but superseded for new trials** — its own page says all
  ongoing EU/EEA trials are in CTIS while it continues to display EudraCT trials.
  Recorded as a live legacy system, not an archive.

## Bot filters are not outages

`echa.europa.eu` returns HTTP 403 behind an Azure WAF, and `euipo.europa.eu`
refuses some automated paths while serving a normal browser. Both are recorded in
the backlog so a future pass does not conclude those sites are dead. Conversely
`tmdn.org` returns 200 for unmatched paths, so a 200 there proves nothing.

## No new Domain Rating

No new host is an already-measured domain. Every new record carries
`domainRating: null`. **66 records over 64 measurements**; digest unchanged at
`aa7e6984…19847a4e`.

## Verification

Validator exit 0 · second migration rewrote 0 · second build wrote 0 and pruned 0
· **853 tests pass, 0 fail** (833 before, 20 added) · **22 injected defects all
caught, 0 survived, 0 broken probes** · 21,532 links, 0 broken · sitemap equals
the indexable set (294 = 294) · RSS equals 223 published records · 294 JSON-LD
blocks · unique titles and descriptions · EU page linked from the hub, badged
**Supranational**, 15 record links · Global still badged **Global** · no network
or credential dependency · clean tree.

The mutation set deliberately reinjects **old defect classes from earlier waves**
— an unobserved access position (the Wave 1E.1 KRZ class), a CAPTCHA asserted
absent (the OEPM class), an invented subdomain (the Wave 1F VIES class), a bare
"European Union" operator, and a shared host losing its `resourceIdentity`. All
were caught.

**The architecture caught a defect during authoring**: the registry loader
refused the EUDAMED record outright for sharing `ec.europa.eu` with VIES until
both declared a shared host group. That is the duplicate-host guard doing exactly
what it was built for.

## Is Wave 1F complete?

**The research is complete; the publication is not, and cannot be without a
decision from you.** Every area is now researched and every candidate has a
determination. Six systems — including the EU's clinical trials portal and its
entire sanctions estate — are verified real and official but unpublishable until
three narrow registry types are approved or refused.

---

# Addendum — taxonomy expansion approved and applied

The five proposed types were **approved**. The closed vocabulary went from **21
to 26** values, and five of the six blocked systems are now published.

**Correction carried through this document:** an earlier draft said "three narrow
types". That was wrong — the proposal always contained **five distinct values**;
two of the six systems (the consolidated list and the Sanctions Tracker) shared
one proposed type, which is where the miscount came from. Corrected here, in the
backlog and in the report.

## Exact values added

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

**European Union 15 → 20. Dataset 223 → 228.**

## The boundaries, and why they are the whole point

A type is only worth adding for what it **excludes**. Each boundary names the
neighbouring type it is distinct from, and each is asserted from both directions
by test — the record must carry the right type *and* must be unreachable by the
wrong one:

- a sanctions **regime index** is not a **designation list**;
- a **designation list** is not an **exclusion/debarment register** — a
  designation is a foreign-policy measure, exclusion under the Financial
  Regulation bars a party from EU-funded procedures, and a test forbids any
  record from carrying both;
- a **geographical indication** protects origin, not a brand, so it is never a
  **trade mark register**;
- a **clinical trial register** is never widened into a general health, medicine
  or research database;
- a **plant protection authorisation database** is not a **chemicals register** —
  and a test asserts the pesticides database and the ECHA platform never share a
  primary type.

`eu-eib-exclusion` and `eu-edes` **keep** `exclusion-and-debarment-register`,
pinned by test.

Two operator disclaimers are required to stay explicit and are enforced: the
Sanctions Map must keep naming the **Official Journal** acts as the authentic
sources, and the pesticides database must keep its own **"no legal value"**
statement.

## EU Sanctions Tracker — the one system still blocked

**Determination: keep blocked. `sanctions-designation-list` was NOT assigned.**

The rule was to publish it as a designation list only if the official system
exposes designation records as its *primary* function. Two independent grounds
say it does not:

1. **No official describing page exists.** The Commission's own sanctions
   resources page lists the Sanctions Map, the helpdesk, the consolidated list,
   the whistleblower tool and EUR-Lex — and **not** the Tracker. Nor does the
   open data portal's news index. Its canonical function cannot be established
   from any official source.
2. **The only functional signal points elsewhere.** Its sole server-rendered
   evidence is the nav order — **Dashboard · Regimes · Nationalities ·
   Individuals · Entities**. It leads with a dashboard and organises by regime and
   nationality, with individuals and entities as views inside that frame. That is
   option **(3), an analytical or tracking interface**, with elements of (2).

Narrowest honest type, **proposed but not recommended**:
`sanctions-designation-analytics-interface`. I recommend against creating it on a
single candidate whose official description could not be found.

## Verification

Validator exit 0 · second migration rewrote 0 · second build wrote 0 and pruned 0
· **868 tests pass, 0 fail** (853 before, 15 added) · **17 injected defects all
caught, 0 survived, 0 broken probes**, including all five required negative
probes · 21,888 links, 0 broken · sitemap equals the indexable set (299 = 299) ·
RSS equals 228 published records · 299 JSON-LD blocks, 0 malformed · unique
titles and descriptions · EU page linked from the hub, badged **Supranational**,
20 record links · no new Domain Rating (66 records over 64 measurements, digest
`aa7e6984…19847a4e` unchanged) · clean tree.

**Previously published records are unchanged**, with one strictly additive
exception carried over from earlier in this wave: VIES holds a `resourceIdentity`
block so EUDAMED could share its host. A test pins its substance independently.
