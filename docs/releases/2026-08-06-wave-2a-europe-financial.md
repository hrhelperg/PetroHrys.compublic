# Wave 2A — Continental Europe financial & regulatory registries

Released 2026-08-06. First wave of the Registry Expansion Program. Continues
production from `b8a8671` (Wave 1F.1, PR #30). No schema change, no route change,
no taxonomy change.

## Researched without agents, reviewed twice by hand

The agent fleet failed on the monthly spend limit **twice** — most recently five
of five agents in the Wave 2 dispatch, which burned 337,929 tokens and returned
nothing. It is not an available dependency.

Everything here was therefore researched **directly**, and reviewed in a **second
separate direct adversarial pass** that re-opened every source without consulting
the first draft. That is a different assurance shape from the independent-agent
review earlier waves received, and it is stated plainly rather than glossed.

What the second pass caught: a quotation from Banca d'Italia transcribed with a
straight apostrophe where the page serves a typographic one. The sentence was
genuine; the transcription was not, and it was corrected rather than published as
approximate. **Nine of ten quotations verified verbatim on the first check; the
tenth was fixed, not dropped.**

## What shipped

**Eight records across six countries.** Dataset **228 → 236**.

| Country | Before | After | Added |
|---|--:|--:|---|
| France | 5 | **7** | REGAFI/REFASSU · ORIAS |
| Germany | 6 | **7** | BaFin Unternehmensdatenbank |
| Spain | 5 | **7** | Registro de entidades · Registro de agentes |
| Poland | 4 | **5** | KNF Wyszukiwarka podmiotów |
| Czechia | 4 | **5** | ČNB seznamy regulovaných subjektů |
| Italy | 4 | **5** | Albi ed elenchi di vigilanza |

France, Poland, Czechia and Italy had **no financial regulatory record at all**
before this wave.

## The distinctions this wave had to hold

**A register keeper is not a regulator.** ORIAS keeps the French official
register of insurance, banking and finance intermediaries — in its own words,
*"l'organisme en charge du Registre officiel… placé sous la tutelle de la
Direction Générale du Trésor"* — and registration is compulsory. It is typed as a
public-law body, **not** a regulator, and its page says so. Calling it the
regulator would be the same error as calling the Colegio de Registradores the
Spanish company register.

**A search system is not split by its own filters.** REGAFI and REFASSU are one
portal serving two populations; the Czech application offers direct search, basic
lists and time series over one dataset. Each is **one** record. A test asserts
exactly one record sits on each host.

**But two separately named registers on one host are still two.** The Bank of
Spain publishes *Registro on-line de entidades* and *Registro de agentes de
establecimientos de cambio… y de los agentes de las entidades de crédito* under
two distinct official names covering materially different populations. Two
records, both declaring `resourceIdentity`, each pointing at the other.

**An incomplete search must say so.** The Polish supervisor states on its own
search page that a user should also check registers *not* included in it. That
caveat is in the published cons, not buried in editor notes, because it is the
single most important thing a reader needs: **absence there is not absence from
supervision.**

## Access: nothing was claimed that was not observed

**Every one of the eight ships with `accessLevel: unknown` and every access
boolean null.** Each is a client-rendered or session-bootstrapped application
whose search was never executed. Loading a form is not observing a search.

Two specific disciplines are enforced by test:

- **An API is not evidence of public interface access.** REGAFI advertises one; it
  was not exercised, and `freeToSearch` stays null.
- **A login page is not an open registry.** The Italian insurance supervisor's
  portal redirects to a **one-time-password login**, so it is not published. That
  resolves an access question open since Wave 1E — the answer is that no anonymous
  route exists.

## What did not ship

- **IVASS** — pending. Credential-gated, as above.
- **CONSOB** — targeted research incomplete. Its supervised-entities page returns a
  **Radware CAPTCHA** to automated clients while the homepage serves normally, so
  this is a bot filter on the register path, not an outage. Identity could not be
  established from a register page, and guessing one is not permitted.

Also recorded so they are not re-proposed: `app.bde.es` hosts a
business-multilocation visualiser and a sectorisation of the Spanish economy —
**neither is a register**.

## No new Domain Rating

No new host is an already-measured domain. Every record carries
`domainRating: null`. **66 records over 64 measurements**; digest
`aa7e6984…19847a4e`, unchanged.

## Verification

Validator exit 0 · second migration rewrote 0 · second build wrote 0 and pruned 0
· **882 tests pass, 0 fail** (868 before, 14 added) · **18 injected defects all
caught, 0 survived, 0 broken probes** · 22,462 links, 0 broken · sitemap equals
the indexable set (307 = 307) · RSS equals 236 published records · 307 JSON-LD
blocks, 0 malformed · canonical on every page · unique titles and descriptions ·
every touched country page links every one of its records · no network or
credential dependency · clean tree.

**One guard produced a false positive and was narrowed rather than accepted:** a
completeness check matched the KNF *disclaimer* ("does not cover every register")
instead of a completeness *claim* — the opposite of the defect, and precisely the
sentence that should be there.

## Remaining for Wave 2B

United Kingdom, United States, Canada and Australia, all explicitly out of scope
here. The open questions are already identified: PRA versus FCA duplication;
NMLS, NCUA and MSRB; OSFI, CIRO and FINTRAC; AUSTRAC plus the ASIC/APRA
duplication question. Duplication, not discovery, is the dominant risk in all
four — their existing entries are broad.
