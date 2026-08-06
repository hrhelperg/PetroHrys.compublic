# Wave 4 — Telecommunications, spectrum & licensing registries

Prepared 2026-08-06. First telecommunications wave. Continues production from
`0c7604d` (Wave 3A-3, PR #35). No schema change, no route change, no new taxonomy
value.

## One legal truth, held everywhere

Under the European Electronic Communications Code, operating a public electronic
communications network or service requires **no individual licence**. It requires
a **notification** under a general authorisation. Spectrum and numbering are the
opposite: individual rights, granted one at a time.

So a single regulator keeps several legally different registers, and the
commonest error a reader can make is to treat one as another:

| System | Legal act | Stated basis |
|---|---|---|
| Operator register | **Notification** | § 13 ZEK · § 5 TKG · art. 6.2 Ley 11/2022 |
| Numbering register | Individual **right of use** | art. 30.5 Ley 11/2022 |
| Spectrum register | Individual **authorisation** | *individuální oprávnění* |

Every record carries the sentence in rendered prose, and tests assert it in both
directions: a notification register may never be described as a licence register,
and a spectrum register may never be described as proving operator status.

## What shipped

**Eight records.** Dataset **261 → 269**; 340 pages.

| Jurisdiction | Records |
|---|---|
| European Union | BEREC General Authorisation Database |
| Czechia | Operator register · Numbering · Spectrum · Postal operators |
| Germany | § 5(4) TKG directory of notified undertakings |
| Spain | Register of operators · Numbering register |

The brief listed eleven Tier 1 jurisdictions. Four shipped, because five of the
others refused automated clients entirely — see below.

## Listed is not operating

Three of these registers demonstrably retain entities that have stopped trading,
and each says so:

- The Czech operator register covers undertakings that **"byli či jsou oprávněni"**
  — *were or are* authorised — and offers an explicit filter to exclude those
  whose activity is interrupted or ended. It reported 2,845 records.
- The Czech postal register offers *"Vyhledávat i provozovatele s ukončenou
  činností"*.
- Spain confirms continuation only **every three years**, and cessation depends on
  the operator notifying it — so an entry cannot establish that a company is
  trading today.

## What absence does not prove

**Email and messaging are outside the notification duty.** Germany quotes § 5 TKG
excluding number-independent interpersonal telecommunications services expressly
since 1 December 2021; Czechia excludes them from its register on the same basis.
A reader who does not know this will read their absence as non-compliance.

Spain is the instructive contrast: those providers **do** notify, but *"a efectos
estadísticos y censales"* — statistically and for the census. Same population,
different legal effect, and the record says which.

## Boundary decisions

**ČTÚ publishes fourteen search databases. Four were published.** The radio and
television transmitter overviews are **filtered views** of the individual spectrum
authorisations — the television one names itself *"Přehled platných individuálních
oprávnění – televizní vysílače"*. The 71–76 and 81–86 GHz point-to-point dataset
is a technical view of the same authorisations.

**Rejected as registers:** ČTÚ's *Cenový barometr* and its blocked-website list,
because neither records an authorisation; and CNMC's mobile and fixed
**portability status** pages, because they report the operational state of a
process rather than a register of rights.

**Predecessor databases are not separate systems.** The Czech pre-2022 operator
database and pre-2024 postal database are temporal predecessors under superseded
classifications. They are described in the records and linked by the regulator,
not published as rival systems.

**The Union database is not the legal source.** BEREC's GADB aggregates what
national regulators transmit under Article 12 of Directive (EU) 2018/1972; the
national register remains the source of record. It is neither merged with any
national register nor allowed to absorb one.

**Germany's spreadsheet IS the register.** § 5(4) TKG requires the agency to
publish the directory, and it does so as a periodic dated spreadsheet with no
search interface. That is a different shape from every other record in this wave
and the record says so plainly. It is *not* the same case as the German audit
chamber's Article 16(3) list rejected in Wave 3A-2 — that was a publication
derived from a register that already had its own searchable interface.

## No US record was added

`us-fcc-uls` (spectrum) and `us-fcc-form-499` (carrier registration) already exist
in the dataset. This wave added no US record, and a test asserts that, so any
future US telecom candidate must be tested against those two first.

## Five Tier 1 regulators refused automated clients

| Regulator | State |
|---|---|
| **Ofcom** (UK) | HTTP 403 |
| **FCC** (US) | HTTP 403 |
| **ACMA** (Australia) | transport failure |
| **ARCEP** (France) | F5 bot shield — *"Please enable JavaScript to view the page content. Your support ID is…"* |
| **CRTC** (Canada) | responds with a 597-character JavaScript shell |

**None of this is evidence that a register is absent.** Each must be reached in a
browser before any conclusion is recorded, and each is in the backlog.

## Access

Seven of eight ship `partially-open` with `loginRequired: false` and everything
else null. **One rendered result rows to an anonymous client** — the Czech
operator register, 2,845 records — so `freeToSearch: true` records something seen.

The German record is the honest awkward case: there is no search to exercise, the
directory is a spreadsheet, and the spreadsheet was **not downloaded or opened**.
Its access note says exactly that, and a test asserts the record tells readers it
is a download rather than a search.

## Verification

| Gate | Result |
|---|---|
| Validator | exit 0 |
| Migration ×2 | rewrote **0** on both runs |
| Generator ×2 | second run wrote **0**, pruned **0** |
| Tests | **975 pass, 0 fail** (956 before, 19 added) |
| Mutation probes | **22 injected, 22 caught, 0 survived, 0 broken, 0 no-op** |
| Internal links | 4,238 in-dataset hrefs, **0 broken** |
| Sitemap | equals the indexable set (**340 = 340**), 0 duplicates |
| RSS | equals published records (**269 = 269**) |
| JSON-LD | 340 blocks, **0 malformed** |
| Canonical / titles / descriptions | present, unique |
| Editor notes | leak to **0** pages |
| Four roles | determined separately on every record |
| resourceIdentity | `ctu-gov-cz` 4 members, `cnmc-es` 2, all distinct systemKeys, no `www.` prefixes |
| Publication truth | clean across all 269 records |
| Live URL re-check | all eight **200** |
| Country pages | EU links all 21, Czechia 13, Germany 14, Spain 10 |
| Working tree | clean |

**Three earlier waves' guards fired and were satisfied rather than weakened.** The
EU suite pins the exact EU record set and every EU URL, so adding
`eu-berec-gadb` required extending both. The Wave 3A-2 and 3A-3 suites pin country
totals, so Germany 13 → 14 and Spain 8 → 10 were updated deliberately. That is the
drift guard working.

**One of my own guards was wrong and was fixed, not worked around.** The
rendered-caveat check compared raw text against HTML that escapes quotes, so any
limitation containing `"` could never match. It now decodes entities before
comparing.

**The mutation harness had zero survivors on its first valid run** — the first
time in four waves. The cause is directly traceable: Waves 3A-1, 3A-2 and 3A-3
each produced survivors that turned out to be probes which stripped a fact from
the arrays but left it in the `description`. The Wave 4 harness strips the
description by construction.

## No new Domain Rating

No new host is an already-measured domain. All eight carry `domainRating: null`.
**67 records display a rating over 64 historical measurements**; digest
`aa7e6984…19847a4e`, unchanged.

## Rollback

Additive; `origin/main` untouched at `0c7604d`. **No previously published record
was modified.**

- **Revert everything:** `git revert --no-commit <head>..<base> && git commit`.
- **Revert one record:** delete it from the country JSON and rebuild; its pins in
  `bd-telecommunications.test.cjs` will fail, which is intended.
- **Reverting `eu-berec-gadb` additionally requires** removing it from the WAVE
  list and the PINNED map in `bd-european-union.test.cjs` and restoring that
  suite's size assertion to 20.
- **Reverting any Czech, German or Spanish record** requires restoring the country
  totals in `bd-germany-france-professional.test.cjs` and
  `bd-poland-italy-spain-professional.test.cjs`.
- **Reverting either Czech or Spanish record alone** leaves a shared-host group
  with fewer members than its test asserts; update the group size in the same
  commit.

## Remaining

Ofcom, FCC, ACMA, ARCEP and CRTC, all bot-blocked. AGCOM's ROC and UKE's telecoms
register, neither locatable from official navigation to publication standard.
ISED spectrum licensing. CNMC's alias and digital terrestrial television
registers. BNetzA numbering and frequency systems. Broadcasting, satellite, VoIP
and MVNO categories from the brief are, so far, unrepresented — in several
jurisdictions they are views of the spectrum register rather than systems of their
own, which is exactly the determination the next wave has to make.
