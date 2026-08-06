# feat: add Continental Europe financial regulatory registries

Wave 2A — the first wave of the Registry Expansion Program. Continues production
from `b8a8671` (Wave 1F.1, PR #30).

**Dataset 228 → 236. Eight new financial and regulatory registries across six
countries.** No schema change, no route change, no taxonomy change.

---

## Four countries gain their first financial-regulatory coverage

| Country | Before | After | Added |
|---|--:|--:|---|
| **France** | 5 | **7** | REGAFI/REFASSU · ORIAS |
| **Germany** | 6 | **7** | BaFin Unternehmensdatenbank |
| **Spain** | 5 | **7** | Registro de entidades · Registro de agentes |
| **Poland** | 4 | **5** | KNF Wyszukiwarka podmiotów |
| **Czechia** | 4 | **5** | ČNB regulated and registered entities |
| **Italy** | 4 | **5** | Albi ed elenchi di vigilanza |

Before this wave **France, Poland, Czechia and Italy had no financial regulatory
record at all**. The financial layer was concentrated in the US (10) and the EU
institutions (8), which made "financial registries" a claim the dataset could not
really support for continental Europe. It can now.

## Researched without agents, reviewed twice by hand

The agent fleet failed on the monthly spend limit **twice** — most recently five
of five agents in the Wave 2 dispatch, burning 337,929 tokens and returning
nothing. It is not an available dependency.

Everything here was researched **directly**, then reviewed in a **second separate
direct adversarial pass** that reopened every source without consulting the first
draft. This is a different assurance shape from the independent-agent review
earlier waves received, and it is stated rather than glossed.

**Corrections the second pass produced:**

- A Banca d'Italia quotation transcribed with a straight apostrophe where the page
  serves a typographic one (`L&rsquo;esercizio`). The sentence was genuine; the
  transcription was not. Corrected, not published as approximate. **Nine of ten
  quotations verified verbatim on first check.**
- At release time, a re-check of all eight live URLs found the ČNB entry point
  **redirects cross-host** to a separate application host. Disclosed — and after
  checking where it would actually land, put in the published limitations rather
  than only in editor notes, because record pages render a standard
  access-unknown sentence and **not** the per-record access notes.

## Three decisions worth reviewing closely

**REGAFI/REFASSU is ONE record.** It is one portal serving two populations —
financial firms and insurance — and titles itself as such. Splitting it would be
splitting a system by the filter it offers. A test asserts exactly one record sits
on that host.

**ČNB is ONE record.** Direct search, the underlying basic lists, and entity
counts and time series are output modes of one application over one dataset, not
three systems.

**Banco de España is TWO records.** The bank publishes *Registro on-line de
entidades* and *Registro de agentes de establecimientos de cambio… y de los
agentes de las entidades de crédito* under two distinct official names covering
materially different populations — supervised entities in one, agents acting for
credit institutions and currency-exchange establishments in the other. Both
declare `resourceIdentity` in the `app-bde-es` group with distinct `systemKey`s,
and each points a reader at the other.

**And one that is not a duplication decision at all:** ORIAS keeps the French
official register under Treasury supervision — *"placé sous la tutelle de la
Direction Générale du Trésor"* — with compulsory registration. It is typed
`public-law-body`, **not** `regulator`, and its page says it does not supervise
the market. Calling a register keeper the regulator is the error this dataset
corrected for Spain in Wave 1D.

## Access honesty

**All eight ship `accessLevel: unknown` with every access boolean null and no
search URL.** Each is a client-rendered or session-bootstrapped application whose
search was never executed. Loading a form is not observing a search.

Two disciplines are enforced by test:

- **An API is not evidence of public interface access.** REGAFI advertises one; it
  was not exercised, so `freeToSearch` stays null.
- **A login page is not an open registry.** The Italian insurance supervisor's
  portal redirects to a **one-time-password login**, so it is not published — which
  resolves an access question open since Wave 1E: there is no anonymous route.

Also enforced: the Polish supervisor states on its own search page that some of
its registers are **not** included, and that caveat is in the published
limitations, because absence there is not absence from supervision.

## What is not in this PR

- **IVASS** — pending. Credential-gated, as above.
- **CONSOB** — targeted research incomplete. Its supervised-entities path returns a
  **Radware CAPTCHA** while the homepage serves normally: a bot filter, not an
  outage. Identity could not be established from a register page, and guessing a
  path is not permitted.

Recorded so they are never proposed: `app.bde.es` also hosts a
business-multilocation visualiser and a sectorisation of the Spanish economy.
**Neither is a register.**

## No new Domain Rating

No new host is an already-measured domain. Every record carries
`domainRating: null`. **66 records display a rating over 64 historical
measurements**; digest `aa7e6984…19847a4e`, unchanged since Wave 1C-2.

## Verification

| Gate | Result |
|---|---|
| Validator | exit 0 |
| Migration ×2 | second run rewrote **0** |
| Generator ×2 | second run wrote **0**, pruned **0** |
| Tests | **882 pass, 0 fail** (868 before, 14 added) |
| Mutation probes | **18 injected, 18 caught, 0 survived, 0 broken probes** |
| Internal links | 22,462 scanned, **0 broken** |
| Sitemap | equals indexable set (**307 = 307**) |
| RSS | equals published records (**236 = 236**) |
| JSON-LD | 307 blocks, **0 malformed** |
| Canonical | present on every page |
| Titles / descriptions | unique |
| Classification | all eight lead `financial-services-register`; none carries the non-financial sectoral type |
| Source of record | all four roles on every record |
| Live URL re-check | all eight **200** |
| Country pages | all six link every one of their records |
| Working tree | clean |

**One guard produced a false positive and was narrowed rather than accepted:** a
completeness check matched the KNF *disclaimer* ("does not cover every register")
instead of a completeness *claim* — the opposite of the defect, and exactly the
sentence that should be there.

## Rollback

The branch is additive and `origin/main` is untouched at `b8a8671`. No data
migration, no route change and no redirect is involved in either direction.

- **Revert everything:** `git revert --no-commit <head>..<base> && git commit`, or
  simply do not merge.
- **Revert one record:** delete its object from the country JSON and run
  `node scripts/build-business-directories.cjs`. Its pins in
  `bd-europe-financial.test.cjs` will then fail, which is intended — remove the
  matching assertions in the same commit if the revert is deliberate.
- **Reverting either Bank of Spain record alone** leaves the other holding a
  `resourceIdentity` for a shared-host group with one member. That is harmless to
  the validator, but the `app-bde-es` group should be dropped from the surviving
  record in the same commit so the model does not carry a group that no longer
  describes anything.
- **No Domain Rating was touched**, so no metric rollback is needed.
- **No previously published record was modified** by this wave, so nothing outside
  the eight new records needs restoring.

## Not done, deliberately

No UK, US, Canada or Australia research — that is Wave 2B, and the dominant risk
there is duplication against existing broad records rather than discovery. No
professional-licence work. No new countries, no redesign, no localisation.
