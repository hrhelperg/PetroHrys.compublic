# feat: complete core telecom regulator coverage

Continues production from `315f639` (Wave 4 Core, PR #36).
No schema change, no route change, **no taxonomy change**.

## Two records from seven regulators, and that is the result

This is a boundary wave. Seven regulators were researched; **two produced a
publishable record**. Five produced pending-browser or incomplete determinations.
The brief is explicit that a duplicate, rejection or pending determination is a
valid outcome and that no regulator should be forced to yield a record — so the
determinations below *are* the deliverable, not a shortfall around it.

Dataset **269 → 271**; 342 pages.

| Record | Jurisdiction | Shape it adds |
|---|---|---|
| `us-fcc-public-inspection-files` | US | A **disclosure obligation**, not an authorisation |
| `ca-crtc-registered-telecom-providers` | CA | A **registration**, expressly not the international licence |

## What each new record actually proves

**FCC Public Inspection Files** covers a precisely stated population — *"licensed
full-service radio and television broadcast stations, Class A television stations,
cable television systems, direct broadcast satellite ("DBS") providers, and
satellite radio … ("SDARS") licensees"* — and publishes what they must disclose:
political time, quarterly issues and programs lists, ownership data, pending
applications. Presence proves an entity has a public file obligation and has
filed. It proves **nothing** about licence status, and broadcasting is not general
telecommunications.

**CRTC registered providers** rests on a duty stated plainly: *"Before an
organization can offer or provide customers with telecommunications services, it
must register with the CRTC."* It is free, and it is **not** the international
licence — *"All telecommunications providers that carry telecommunications traffic
internationally must obtain a BITS licence."*

The most important sentence on that record is the Commission's own: *"The
information on these pages has been provided by external sources. The Commission
is not responsible for the accuracy, reliability or currency of the information
contained on these pages."* A regulator disclaiming its own list is exactly the
kind of fact that belongs in published limitations rather than editor notes, and a
test enforces that it reaches the reader.

## The determination that matters most produced no record at all

**ARCEP is not the French spectrum authority — ANFR is.** ANFR's own site states
the spectrum belongs to the State's public domain *"qui en a confié la gestion à
l'ANFR"*, and reports the 5G and 4G sites *"autorisés par l'ANFR"*. Part 11 of the
brief asked for this distinction explicitly; it is now enforced by a test that
forbids any French record from attributing a spectrum function to ARCEP, whether
or not a French spectrum record ever exists.

## Boundary decisions

**The CRTC withdrawn list is a duplicate, not a register.** It contains providers
*removed* from the registration lists — the historical face of the same act, which
the wave contract classifies as a current/historical toggle. It is described inside
the registration record instead, because a reader who finds nothing needs to know
where a removed provider goes.

**Rejected:** the CRTC quality-of-service indicator (operational performance, not
authorisation); ANFR's Cartoradio (a cartographic platform); and UKE's NIS2
key-entities list, which is a **cybersecurity** register and must never be
confused with the telecoms operator register.

**Three FCC subdomains are three hosts**, so no shared-host group applies —
consistent with the Czech tax-register determination in Wave 3A-2. The new record
documents its duplicate audit against ULS and Form 499 explicitly.

## Five regulators are blocked, and blocked is not absent

Ofcom, ACMA and ARCEP refuse automated clients; AGCOM's ROC is an Angular SPA
whose **scope** — telecom operators, media operators or both — could not be
established, which is the entire question about it; UKE's navigation exposes 48
links, all news, and a constructed URL landed on an unrelated article and was
discarded rather than used. Every one is in a browser queue with an exact URL, the
blocker, one precise action, and the fields that must stay null until observed.

**A bot filter can also appear between waves.** `wireless2.fcc.gov` and
`apps.fcc.gov` served automated clients when their records were authored and
refuse now. Those records were **not** changed: refusal is not absence.

## Three access-truth corrections the guards forced

1. **`accessLevel: unknown` may not carry `loginRequired: false`.** An existing
   guard and the brief agree. Reaching a page anonymously does not establish that
   the register behind it needs no credential — the CRTC record now carries
   `unknown` with **every** boolean null.
2. **No published field may contain an HTTP status code**, including
   `editorNotes`. Both mentions were rewritten to describe the host's behaviour.
3. **The Canada coverage manifest drifted.** `federalPublished` moved 7 → 8. That
   is the third wave in which a coverage manifest needed updating, and the guard
   caught it each time.

## Verification

| Gate | Result |
|---|---|
| Validator | exit 0 |
| Migration ×2 | rewrote **0** on both runs |
| Generator ×2 | second run wrote **0**, pruned **0** |
| Tests | **993 pass, 0 fail** (975 before, 18 added) |
| Mutation probes | **20 injected, 20 caught, 0 survived, 0 broken, 0 no-op** |
| Internal links | 4,258 in-dataset hrefs, **0 broken** |
| Sitemap | equals the indexable set (**342 = 342**), 0 duplicates |
| RSS | equals published records (**271 = 271**) |
| JSON-LD | 342 blocks, **0 malformed** |
| Canonical / titles / descriptions | present, unique |
| Editor notes and duplicate-audit notes | leak to **0** pages |
| Four roles | determined separately on both records |
| Publication truth | clean across all 271 records |
| Live URL re-check | both new records **200** |
| Country pages | US links all 76, Canada all 18 |
| Domain Rating | both null; 67 records over **64** measurements, digest unchanged |
| Network dependency | none in the build path; no `package.json`, no `node_modules` |
| Working tree | clean |

**Four mutation probes were initially invalid and were fixed before the run was
accepted.** They cloned a record into another country's file, so the validator
caught a *placement* error and the semantic guard under test never ran. Corrected,
the ARCEP, AGCOM, Ofcom and ROC guards each fire on their own merits.

## Pass 2 corrections

**Zero quotation corrections.** Every quotation was re-verified against contiguous
official text on a second independent fetch, and the FCC page body was identical
in length between passes. The Pass 2 changes were all access-truth, listed above.

## Rollback

Additive; `origin/main` untouched at `315f639`.

- **Revert everything:** `git revert --no-commit <head>..<base> && git commit`.
- **Revert one record:** delete it from the country JSON and rebuild; its pins in
  `bd-telecom-regulators.test.cjs` will fail, which is intended.
- **Reverting `ca-crtc-registered-telecom-providers` additionally requires**
  restoring `canada-jurisdiction-coverage.json` `federalPublished` to 7, or the
  manifest guard will fail.
- No previously published **record** was modified; the only pre-existing file
  changed is the Canada coverage manifest.

## Readiness for Wave 4B

Wave 4B (Service and Licence Boundary Audit) can proceed on the EU/CZ/DE/ES
material already published, but **the five blocked regulators must clear the
browser queue first** or 4B will re-derive the same pending determinations. The
highest-value single browser action is AGCOM's ROC: its scope decides whether
Italy needs one record or three.
