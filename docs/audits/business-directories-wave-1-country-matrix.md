# Wave 1 — country coverage matrix

Audited 2026-08-05 against production HEAD `342ff8d` (PR #26, United Kingdom).
All figures recomputed from the registry, not carried over from release notes.

## Matrix

Counts under each registry class are **registry-type occurrences**, not records —
a record carrying two types counts in both, which is why Canada's company column
(23) exceeds its record count (16).

| Country | Total | Nat | Sub | Company | Finance | Charity | Prof | Procure | IP | Insolv | Exclusion | Status |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|---|
| United States | 74 | 27 | 46 | 46 | 7 | 3 | 6 | 1 | 2 | 0 | 3 | **strong** |
| United Kingdom | 24 | 8 | 16 | 1 | 1 | 3 | 5 | 4 | 0 | 3 | 1 | **strong** |
| Canada | 16 | 6 | 10 | 23 | 1 | 0 | 2 | 1 | 2 | 0 | 0 | **moderate** |
| Australia | 13 | 4 | 9 | 9 | 2 | 1 | 5 | 0 | 1 | 0 | 2 | **moderate** |
| Germany | 2 | 2 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **thin** |
| France | 2 | 2 | 0 | 2 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | **thin** |
| Spain | 1 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | **thin** |
| Italy | 1 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **thin** |
| Poland | 2 | 2 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **thin** |
| Czech Republic | 1 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | **thin** |
| European Union | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **not started** |
| China | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **research-blocked** |
| Japan | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **not started** |

`global` holds 53 further records. **None is a government registry** — the
category breakdown is developer (21), software (9), app-directories (9), local
(3), startup (3), general-business (2), marketing (2), legal (2), reviews (1),
press (1). The government-registry dataset is therefore **120 records**, not 189.

## Subnational coverage

| Country | Model | Covered | Outstanding |
|---|---|---|---|
| United States | 50 states + DC + 5 territories | 43 states, DC, 2 territories | 7 states, 3 territories |
| Canada | 10 provinces + 3 territories | 7 provinces, 2 territories | AB (no public registry), NB, PE, YT |
| Australia | 6 states + 2 territories | 7 of 8 | **NSW** |
| United Kingdom | 3 countries + 1 province + cross-territory | all 4 territories reached | — |

## Per-country notes

**United States — strong.** The only geography with real depth: 27 federal
systems and 46 subnational. Coverage is counted from a jurisdiction manifest
rather than a record total. Gaps are 7 states and 3 territories, all recorded
with blocker codes. **No insolvency coverage at all** (0 records) despite PACER
and state court systems existing — the single largest US registry-class hole.

**United Kingdom — strong.** The most sophisticated territorial model in the
dataset. All four constituent territories reached; five care regulators kept
distinct; procurement notices correctly typed. Note the company column reads 1
because Companies House is the only `company-register`; UK subnational registers
are charity, professional, insolvency and care registers, which is correct.

**Canada — moderate, not strong.** 9 of 13 subdivisions. Alberta is a permanent
structural absence (no government public search exists), correctly recorded as
`no-public-registry` rather than a blocker. Charity coverage is **zero** — the
CRA List of Charities is the most conspicuous single Canadian gap.

**Australia — moderate.** Federal registration layer plus state association and
licensing registers, correctly never claiming state company registration. **NSW
is the only Australian subdivision with no record**, and its incorporated
associations register is a known pending candidate.

**Germany, France, Spain, Italy, Poland, Czech Republic — thin, and worse than
the counts suggest.** All nine records predate the Wave 1 quality contract. See
the structural defects section of the main audit: four of them present an access
portal, a consultation interface or a professional body as the legal source of
record. Poland has **no KRS record** — the National Court Register, its principal
company register. Czechia has no ARES and no separate insolvency register record.

**European Union — not started.** Zero records against a declared geography. 16
candidates identified, several of them low-difficulty and reachable.

**China — research-blocked.** Zero records. Five of six principal systems return
anti-bot responses (HTTP 521/412/403) to any non-browser client, including
`gsxt.gov.cn` and every CNIPA search system. Only `cods.org.cn` responds.

**Japan — not started, but ready.** Zero records, yet six of seven candidates are
reachable and free. The NTA Corporate Number Publication Site is the single
cleanest candidate identified anywhere in this audit: the operator publishes its
own English name, so `englishNameSource: "official"` is available rather than an
editorial translation.
