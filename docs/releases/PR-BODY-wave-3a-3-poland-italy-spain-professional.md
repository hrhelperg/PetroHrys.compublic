# feat: add Wave 3A-3 Poland Italy Spain professional registers

Third professional-licence wave. Continues production from
`e49ad64` (Wave 3A-2, PR #34). No schema change, no route change, no new taxonomy
value.

## Six records, not thirty

The brief listed roughly ten professions per country. **Six shipped.** That is the
result of applying "accuracy has absolute priority over quantity" honestly rather
than filling a table: Spain ships **one** record because one Spanish candidate
could be evidenced to publication standard. Everything else is in the backlog with
its reason, and several reasons are "the host refused automated clients", which is
**not** evidence a register is absent.

| Country | Before | After | Added |
|---|--:|--:|---|
| Poland | 5 | **8** | Legal advisers · Statutory auditors · Tax advisers |
| Italy | 5 | **7** | Chartered accountants · Notaries |
| Spain | 7 | **8** | ROAC auditors |

Dataset **255 → 261**; 332 pages.

## The risk in this wave was not duplication

It was **flattening a status distinction the register genuinely records**. Four are
published and pinned by test:

- **A Polish legal adviser may be entered but not practising.** The list exposes
  "Wykonuje zawód" / "Nie wykonuje zawodu" as a filter, so a hit alone does not
  establish that someone is currently providing legal services. That is the single
  most likely misreading of this record and it is stated in the limitations.
- **Polish advocates (adwokaci) are a different profession** with their own
  register. Absence from the legal advisers' list settles nothing about whether a
  person may act as a lawyer in Poland.
- **The Polish auditor register excludes firms**, which are on a separate chamber
  list.
- **Italian notaries cannot be searched by name.** The page instructs "Non inserire
  il nome del notaio". It is a regional finder, not a name-verification tool — and
  a reader who does not know that will draw the wrong conclusion from an empty
  result.

## The strongest statutory language in the dataset so far

The Polish tax adviser list states the legal consequence outright: "Warunkiem
wykonywania czynności doradztwa podatkowego jest posiadanie numeru wpisu na
listę", and warns that unauthorised practice is punishable by a fine of up to
50,000 złoty under Article 81 of the Tax Advisory Act of 5 July 1996. Few
registers in this dataset state their own effect that plainly, and it is published
rather than paraphrased.

The Italian notary roll is the other: "Albo Unico professionale elettronico –
Articolo 3, D.P.R. 7 agosto 2012, n. 137".

## Aggregation, for the third wave running

The national interface is not the legal source of record in any of the three
countries: nineteen Polish OIRP chambers, sixteen KIDP regional chambers, 131
Italian territorial Ordini. The Italian notaries' council goes furthest, stating
that "Il CNN **non può effettuare variazioni e/o aggiornamenti** alle
informazioni" because the Ordini and the notaries themselves enter the data — so
an error has to be corrected at source, not centrally.

## Duplicate determinations

**The Italian roll is ONE record.** "Ricerca Iscritti", "Ricerca Società" and
"Ricerca Prestazioni" sit under one "Albo Nazionale" heading — three views of one
roll.

**ROAC is ONE record**, and its Art. 16.3a EU Reg. 537/2014 listing is a
publication for selection procedures. That is the *identical* rejection made for
the German chamber's equivalent list in Wave 3A-2; the pattern now recurs across
EU audit regulators and should be rejected every time.

**Two things were deliberately not published rather than guessed:** PIBR's audit
firm list, because Polish audit oversight was restructured in 2020 and the
question of which body keeps it was not settled from official text; and KIDP's
register of entitled entities, which is a static PDF rather than a searchable
register.

**Two KIRP lists were rejected as candidates** — representatives before the
European Court of Human Rights, and advisers supporting trafficking victims. Those
are thematic sign-up lists, not registers of entitlement.

## Access

Four of six ship `partially-open` with `loginRequired: false` and everything else
null. **Two Polish registers rendered result rows to an anonymous client** — 57,288
legal advisers and 4,811 auditors — so `freeToSearch: true` records something
seen, and a test asserts that flag may only be true where the notes say results
were rendered.

One access barrier is published rather than filed: **the Polish tax adviser search
cannot be submitted without acknowledging the privacy policy.** Reading that list
is not a single anonymous click, and record pages do not render access notes, so
the caveat is in the limitations.

## Two probes that had not injected their defect

Both Wave 3A-3 survivors turned out to be the same mistake, and it is worth naming
because it has now recurred in three consecutive waves: the mutation helper
stripped a fact from `cons`, `pros`, `bestFor` and `notRecommendedFor` — but not
from the `description`, where both facts also lived. The records were still
telling readers the truth. The probes were strengthened to rewrite the description
too, and only then did they prove the guards.

## No new Domain Rating

No new host is an already-measured domain. All six carry `domainRating: null`.
**67 records display a rating over 64 historical measurements**; digest
`aa7e6984…19847a4e`, unchanged.

## Verification

| Gate | Result |
|---|---|
| Validator | exit 0 |
| Migration ×2 | rewrote **0** on both runs |
| Generator ×2 | second run wrote **0**, pruned **0** |
| Tests | **956 pass, 0 fail** (940 before, 16 added) |
| Mutation probes | **20 injected, 20 caught, 0 survived, 0 broken, 0 no-op** |
| Internal links | 4,156 in-dataset hrefs, **0 broken** |
| Sitemap | equals the indexable set (**332 = 332**), 0 duplicates |
| RSS | equals published records (**261 = 261**) |
| JSON-LD | 332 blocks, **0 malformed** |
| Canonical / titles / descriptions | present, unique |
| Editor notes | leak to **0** pages |
| Four roles | determined separately on every record |
| Operators | every one a public-law body, agency, regulator or ministry |
| Publication truth | clean |
| Country pages | Poland links all 8, Italy all 7, Spain all 8 |
| Working tree | clean |

Research was direct, in two separate passes. This is not independent-agent
verification; the agent fleet is not an available dependency.

## Rollback

Additive; `origin/main` untouched at `e49ad64`. **No previously published record
was modified by this wave** — unlike Wave 3A-2, which added a field to `fr-inpi`.

- **Revert everything:** `git revert --no-commit <head>..<base> && git commit`.
- **Revert one record:** delete it from the country JSON and rebuild; its pins in
  `bd-poland-italy-spain-professional.test.cjs` will fail, which is intended.
- **No Domain Rating was touched**, so no metric rollback is needed.

## Remaining

Italian statutory auditors (`revisionelegale.mef.gov.it` returned a transport
failure on every scheme — **not** evidence of absence); Spanish notaries,
architects, procuradores, economists (403) and abogados; Polish advocates,
notaries, bailiffs, patent attorneys, architects and engineers; Italian avvocati,
engineers, architects, doctors and pharmacists; and healthcare in all three.
