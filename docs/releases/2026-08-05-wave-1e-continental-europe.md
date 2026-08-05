# Wave 1E — Continental Europe core registries

Released 2026-08-05. Continues production from `60c4926` (Wave 1D, European
legacy truth correction). Expansion using the existing architecture: no schema
change, no route change, no redesign.

## What shipped

**Eleven records across six countries.** Dataset **189 → 200**. Continental
Europe **9 → 20** — the region more than doubled.

| Country | Before | After | New records |
|---|--:|--:|---|
| Poland | 2 | 3 | Krajowy Rejestr Sądowy |
| Czech Republic | 1 | 3 | ARES · Insolvenční rejstřík |
| Germany | 2 | 4 | Unternehmensregister · Transparenzregister |
| France | 2 | 4 | Registre national des entreprises · Répertoire Sirene |
| Spain | 1 | 3 | Registro Mercantil Central · Registro Público Concursal |
| Italy | 1 | 3 | Banca dati UIBM · Piattaforma per la pubblicità a valore legale |

The `registered-design-register` type, added two waves ago for a verified future
need and carrying **zero records** ever since, now has its first: the Italian
UIBM database covers trade marks, patents **and** designs.

## The four roles, on every record

Wave 1D existed because four European records had collapsed four distinct roles
into one claim. Every record here documents them separately in `editorNotes`,
and a test fails if any is missing:

1. **Legal source of record** — where the register is constituted in law
2. **Responsible authority** — the body the law makes answerable (the `operator`)
3. **Technical platform** — who runs the software (**never** the operator)
4. **Public access interface** — what the public actually uses

Three records have a technical platform distinct from the authority, and in each
the platform is recorded in prose while the authority holds the `operator` field:

| Record | Responsible authority | Technical platform |
|---|---|---|
| Unternehmensregister | Bundesministerium der Justiz | Bundesanzeiger Verlag GmbH |
| Transparenzregister | Bundesministerium der Finanzen | Bundesanzeiger Verlag GmbH, as entrusted register-keeping body |
| Registro Público Concursal | Ministerio de Justicia | Colegio de Registradores, material management of the publicity service |

## The traps this wave had to avoid

**ARES is an aggregator and was typed as one.** ARES constitutes nothing — every
fact it shows is constituted in another Czech register. It is
`corporate-number-database`, never a company register. This is exactly the error
Wave 1D had to correct for Germany, France and Spain, caught **before**
publication rather than after.

**Identifier registers are not constitutive registers.** France now carries both
sides of the distinction: the **RNE** constitutes (Code de commerce L123-36,
kept by INPI), **Sirene** identifies (SIREN/SIRET, kept by INSEE). Poland has the
same split, and this wave states it: **KRS** constitutes, **REGON** identifies,
**CEIDG** covers sole traders whom KRS does not touch.

**The Unternehmensregister is a publication platform, not the court-held
register.** HGB § 8b constitutes it as the central platform; HGB § 8(1) keeps the
commercial registers with the courts. It is `public-filing-database`.

**The Registro Mercantil Central is not where companies are registered.** Its own
site describes it as "una Institución Oficial dependiente del Ministerio de
Justicia" whose functions are name issuance and centralising data received from
the provincial registries. It is `business-entity-register`, deliberately not
`company-register`, because the constitutive registration happens provincially.

## Poland: four systems, four populations, never merged

The brief's highest priority. All four relationships are statutory, not inferred:

- **KRS** (ustawa z 20 sierpnia 1997) is kept by the registry courts and
  constitutes companies, cooperatives, associations and foundations.
- **CEIDG** records entrepreneurs who are **natural persons** — a population
  disjoint from the KRS register of entrepreneurs. Neither contains the other's.
- **REGON** is the statistical identifier register kept by GUS. KRS Act art. 20
  ust. 1a places the NIP and REGON numbers into KRS **automatically** after
  transmission from elsewhere, so those identifiers originate outside KRS.
- KRS Act art. 20 ust. 1c transmits KRS entry data **to** REGON.

The KRS record says all of this, including that it does **not** cover sole
traders and that its REGON number is not established by the registry court.

**A discrepancy in the brief, reported rather than silently resolved:** the brief
listed *ISIR* among the Polish targets. ISIR is the **Czech** insolvency
register. Poland's is the **Krajowy Rejestr Zadłużonych (KRZ)**. Both were
researched — ISIR is published under Czechia; KRZ is pending below.

## What did not ship

Six candidates. Nothing was published on partial evidence.

- **KRZ (Poland)** — the host returns HTTP 200 with an Incapsula interstitial and
  has **no sibling open API**, so no access fact could be observed. Legal
  identity and statutory basis are fully established. Highest-priority pending.
- **Evidence skutečných majitelů (Czechia)** — access restricted, extent of
  public inspection unestablished.
- **IVASS (Italy)** — identity and roles established; access position not.
- **Registro dei revisori legali (Italy)** — host unreachable, connection times
  out. Nothing established.
- **CONSOB (Italy)** — not researched to publication standard.
- **Portál veřejných rejstříků (Czechia)** — **duplicate**: a newer ministry
  surface over the register already published as `cz-verejny-rejstrik`.

## Honest access positions

Two records ship with access deliberately unresolved rather than guessed:

- **RNE** — `data.inpi.fr` refused automated verification. `accessLevel:
  unknown`, every boolean `null`, **no search URL published**. An earlier draft
  claimed server-rendered results; the adversarial pass disproved it.
- **Sirene** — documentation and open data were read, but no interactive search
  surface was exercised, so the search and fee position stays unestablished.

**KRS deserves a note.** Its web search sits behind bot protection, so the
interface was never observed. Free anonymous access was established instead
against the ministry's **own open API**, which returned a complete extract for a
test entity with no credential. The record says exactly that.

**A CAPTCHA was found and recorded.** The UIBM search form carries a CAPTCHA
control. An earlier draft asserted there was none; asserting absence is the
failure mode, and `captcha: true` is now recorded.

## No new Domain Rating

None of the eleven hosts is an already-measured domain, so **every new record
carries `domainRating: null`**. Records displaying a rating stay at 66 over **64
measurements**; the per-domain digest is unchanged at `aa7e6984…19847a4e`.

## Schema

**No change, and none needed.** All eleven records expressed the four roles
inside the existing model — `operator` for the authority, the registry type for
the constitutive-versus-access distinction, prose for the platform. The Wave 1D
conclusion that a `responsibleAuthority` / `technicalOperator` split is premature
survives a second, harder test: eleven records across six legal systems,
including three with a genuinely distinct technical operator.

## Verification

Validator exit 0 · second migration rewrote 0 · second build wrote 0 and pruned 0
· **787 tests pass, 0 fail** (770 before, 17 added) · **13 injected defects all
caught** · 15,368 links, 0 broken · sitemap equals the indexable set (269 = 269)
· RSS equals 200 published records · 269 JSON-LD blocks clean · unique titles and
descriptions · every page canonical and manifest-owned · no network or credential
dependency · working tree clean.

One existing guard needed updating rather than weakening: the Wave 1C-3
procurement test pinned an exact count of five, which the Italian platform makes
six. It now pins **set equality**, so a new procurement record must be added to
the checked set rather than silently admitted.
