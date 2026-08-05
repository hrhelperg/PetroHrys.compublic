# Wave 1E.1 — Continental Europe completion

Released 2026-08-05. Continues production from `2fb5fae` (Wave 1E, Continental
Europe core registries). Expansion using the existing architecture: no schema
change, no route change, no redesign.

## The acceptance criterion this wave was published against

> Where an official portal is only an **access interface** to another state
> register, that must be explicit in **both** the data model **and** the
> published page text. No consultation interface may be described as the legal
> source of record without direct official evidence.

Wave 1D established the first half of that rule after the Wave 1 audit found four
records that misidentified who holds a register. This wave adds the second half:
**getting the registry type right is not enough, because a reader never sees the
type vocabulary.** Two records here are publication surfaces rather than
registers, and both say so in prose a reader actually meets.

**BODACC.** Its own about page states that the bulletin *assures the publicity of
acts registered in the registre national des entreprises*, and names where the
data comes from — the public registers of the commercial court registries, the
proximity and judicial courts, the overseas mixed commercial courts, the courts
of first instance and the courts of appeal. It is typed `public-filing-database`,
never a company register, and its page says it publishes rather than registers.

**Insolvenzbekanntmachungen.** Its front page states that *on this website the
insolvency courts of the Federal Republic of Germany make the announcements
prescribed under the Insolvency Code*. Its imprint grounds this in § 9 InsO with
§ 2 InsBekV. The record does not describe the portal as the register of a
proceeding; the courts hold that, and the page says so.

## What shipped

**Eight records across six countries.** Dataset **200 → 208**. Continental
Europe **20 → 28**.

| Country | Before | After | New records |
|---|--:|--:|---|
| Poland | 3 | 4 | Krajowy Rejestr Zadłużonych |
| Czech Republic | 3 | 4 | Evidence skutečných majitelů |
| Germany | 4 | 6 | DPMAregister · Insolvenzbekanntmachungen |
| France | 4 | 5 | BODACC |
| Spain | 3 | 5 | OEPM · CNMV |
| Italy | 3 | 4 | Registro unico nazionale del Terzo settore |

## The two Wave 1E blockers, both resolved

**KRZ (Poland)** — the wave's highest priority, and pending since Wave 1E because
its host serves an Imperva/Incapsula interstitial and it has no sibling open API.
The block was reproduced and still stands; `api-krz.ms.gov.pl` does not resolve.
Identity, responsible authority, scope and statutory basis are established from
the Ministry of Justice's own page and the Act's text on the Sejm's ELI service.
It ships with **`accessLevel: unknown`, every access boolean null and no search
URL** — the treatment already applied to the French RNE. The Act says the register
is public and that everyone may consult it over the internet; that is the legal
position, not an observed behaviour, and the record keeps the two apart.

**ESM (Czechia)** — pending because the extent of public inspection was
unestablished. It is now established, and it is **nil**: the Ministry of Justice
**withdrew public access on 17 December 2025**. The page the register's own
navigation labels as the public-part search was retrieved and serves the
withdrawal notice instead of a search form, so the absence was confirmed on the
surface that would carry it rather than inferred from a banner. The record is
published rather than dropped, because a reader who assumes Czech beneficial
ownership data is still publicly searchable would otherwise be wrong.

## What the adversarial pass caught

**Every one of the twelve approved candidates came back
`publish-with-corrections`. None came back `publish-as-is.`** Two carried
**fabricated quotations**, which is why the two records that carried them are not
in this release:

- **Marktstammdatenregister** — an imprint contact under a "Projektierung"
  heading, including a named individual. Verification confirmed **zero
  occurrences** of either string in the page source.
- **Insolvenzbekanntmachungen** — a "quotation" stitched from four separate `<p>`
  elements with commas that do not exist in the source. The record ships, but
  that field was removed rather than repaired: **no technical platform is
  asserted**, because none is named on any page fetched.

Other corrections applied before publication:

| Finding | Resolution |
|---|---|
| OEPM `captcha: null` with "I did not observe any captcha" | **Refuted and corrected.** The patents search loads Google reCAPTCHA — I confirmed 8 occurrences. `captcha: true`, and the page discloses it. |
| ANAC casellario relied on `reputazione dell'impresa` under art. 109 | **Repealed** by D.Lgs. 209/2024. Record held to backlog. |
| DPMAregister official name used an en dash | The page's own heading uses a plain **hyphen**. Corrected. |
| DPMAregister `searchUrl` duplicated the landing page | Repointed at a real search form. |
| CNMV asserted "21 official public registers" | The count did not survive checking. **No count is stated**; the categories are described instead. |
| RUNTS decree date disputed between the portal and the gazette | The portal says 15 giugno 2020; the verifier said 15 settembre. **Neither is asserted** — the record cites D.Lgs. 117/2017 artt. 45 ff., which is unambiguous. |

Two verifier claims were themselves wrong and were **not** acted on: CNMV's
`IndiceEAO` consultation does exist, and the published UIBM URL
`www.uibm.gov.it/bancadati/` is **not** stale — it still resolves directly to the
live database. Only the UIBM institutional root redirects.

## What did not ship

Seventeen candidates researched, twelve approved, **eight published**. Held to
backlog with a stated next action:

- **Živnostenský rejstřík (Czechia)** — role attribution contested between the
  MPO page and § 60 of the trade licensing act, and unresolvable: the search
  surface is a JavaScript application, `www.rzp.gov.cz` does not respond, the MPO
  page is a navigation stub, and **e-Sbírka, the official legislation portal,
  serves only a JavaScript shell to every path tried including its API host.**
  Publishing a contested operator attribution would breach this wave's own
  acceptance criterion.
- **Marktstammdatenregister (Germany)** — fabricated imprint detail, above.
- **Albo nazionale gestori ambientali (Italy)** — one cited quotation exists only
  inside an `alt` attribute; operator type unsettled.
- **Casellario ANAC (Italy)** — stale law, above.
- **RNA (Italy)** — host unreachable; every HTTPS request timed out.
- **BDNCP, REA, Vereinsregister** — rejected on classification: none has a public
  interface of its own, and each would duplicate a published record or collide
  with it on hostname.
- **Portál veřejných rejstříků (Czechia)** — still in *ověřovací provoz*, and its
  own banner says so. Worth revisiting as a **URL migration** for the published
  `cz-verejny-rejstrik`, not as a second record.

## No new Domain Rating

None of the eight hosts is an already-measured domain, so **every new record
carries `domainRating: null`** and empty provenance. Records displaying a rating
stay at **66 over 64 measurements**; the per-domain digest is unchanged at
`aa7e6984…19847a4e`.

## Schema

**No change, and none needed.** All eight records expressed the four roles inside
the existing model. The `responsibleAuthority` / `technicalOperator` split
considered and rejected in Wave 1D is rejected a third time: BODACC has a
genuinely distinct platform provider (Opendatasoft, hosted alongside Outscale)
and it recorded cleanly with `operator` naming DILA and prose carrying the
platform.

## Verification

Validator exit 0 · second migration rewrote 0 · second build wrote 0 and pruned 0
· **809 tests pass, 0 fail** (787 before, 22 added) · **19 injected defects all
caught, 0 broken probes** · 20,333 links, 0 broken · sitemap equals the indexable
set (277 = 277) · RSS equals 208 published records · 277 JSON-LD blocks · no
network or credential dependency · working tree clean.

**Two guards caught defects I introduced.** The existing backlog test rejected the
commit while KRZ and ESM were still listed as pending after being published. My
own publication-contract test rejected DPMAregister and Insolvenzbekanntmachungen
for never stating what they do not provide; **both records were strengthened
rather than the regex loosened.**

**The first mutation run was invalid and was rerun.** It restored from `git
checkout`, which reverts to a tree without these records, so every mutation threw
instead of applying and all 19 falsely reported as caught. The harness now
restores from a Wave 1E.1 snapshot and fails loudly on a probe that throws or
changes nothing. One probe then genuinely survived — it stripped a date from three
of five visible fields — and was fixed rather than accepted.
