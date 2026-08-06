# Wave 3A-1 — United Kingdom & Czech Republic professional registers

Prepared 2026-08-06. First wave of the professional-licence layer, and the first
half of a split: **Germany and France were not researched and are deferred to
Wave 3A-2.** Continues production from `175b8e5` (Wave 2B, PR #32). No schema
change, no route change, no new taxonomy value.

## What shipped

**Seven records across two countries.** Dataset **238 → 245**; 316 pages.

| Country | Before | After | Added |
|---|--:|--:|---|
| United Kingdom | 24 | **27** | ARB Architects Register · Engineering Council RegCheck · IPReg Register |
| Czechia | 5 | **9** | ČAK advocates · NKČR notaries · ČKA authorised architects · ČKAIT authorised persons |

Before this wave the dataset had no professional-licence coverage for Czechia at
all, and the UK layer held only the two legal-profession registers.

## The distinction this wave exists to hold

**A protected-title register is not a licence to practise.**

ARB and the Engineering Council restrict a *title*. Neither restricts the *work* —
anyone may carry out architectural or engineering work; only the words "architect"
and the chartered engineering titles are protected. The Czech chambers are the
opposite case: authorisation is required for **reserved activities**.

Both are `professional-licence-register`, but the legal effect differs, so every
record states in **rendered prose** whether registration is required to PRACTISE
or only to USE THE TITLE. A test asserts the two effects are never described
identically, and that a title-only register never claims to license practice.

**The taxonomy was not expanded.** A new `protected-professional-title-register`
would have rested on two candidates whose protection comes from different sources
— statute for ARB, Royal Charter for the Engineering Council. That distinction
belongs in prose, not in an enum with two members. The existing type's boundary
note was clarified instead.

## Four determinations worth reviewing closely

**ARB is statutory; the Engineering Council is not.** The board "was established
by Parliament in 1997". The council operates "as a charity under Royal Charter"
and its titles "are protected under our Royal Charter". It is typed
`public-law-body`, **not** `regulator` — calling a chartered body a statutory
regulator is the same class of error this dataset corrected for ORIAS in Wave 2A.

**IPReg is ONE record.** Its page says "Search our registers" — plural, reflecting
the underlying statutory registers of patent attorneys and trade mark attorneys —
but the public interface is a single form at one URL covering both professions and
firms. Splitting it would be splitting a system by its own filter. A test asserts
no second record appears on that host.

**The two Czech construction chambers stay separate.** ČKA (architects) and ČKAIT
(engineers and technicians) are distinct chambers with distinct lists. Each record
says the other exists, because **absence from one says nothing about the other** —
and a test asserts both the separation and the cross-reference.

**These registers record people, not businesses.** ARB and the Engineering Council
register individual practitioners; a firm is not registered. Each record now says
so, because a reader checking a company would otherwise draw exactly the wrong
conclusion. IPReg is the exception and records firms too — which is why its record
warns that a result must be read carefully to know which kind of entry came back.

## Access: nothing claimed that was not observed

All seven ship **`accessLevel: partially-open`** with `loginRequired: false` — an
anonymous load was observed on each — and **every other access field null**. No
search was executed on any of them, so result content, coverage and limits are
neither known nor asserted.

**Fully-unknown access: 0%. The brief's 50% ceiling passes with room to spare.**

Two limitations were significant enough to publish rather than file:

- **Engineering Council RegCheck requires an exact match**, and the council itself
  warns that an unexpected nil result does not establish that someone is
  unregistered. A reader who does not know this will misread a nil result as proof
  of absence.
- **ČKAIT publishes "Výběry ze seznamu"** — *selections from* the list. The record
  deliberately does not upgrade that into a claim to be the complete register, and
  its form requires JavaScript, so it could not be exercised.

## Three defects this wave found in its own work

Two were in the machinery that is supposed to protect the content; one was in
the content itself, and it was found by following a diff nobody asked about.

**The UK coverage manifest drifted.** Adding three UK-wide records left
`united-kingdom-territorial-coverage.json` asserting 24 records and 8 UK-wide,
against a registry holding 27 and 11. This is the same drift Canada's manifest had
in Wave 2B, and it recurred for the same reason: **nothing tied the manifest to
the registry**. It is corrected, and now pinned by test on all four totals plus
the UK-wide id list — the count alone would not have caught a swap.

**The rendered-caveat guard only checked the first limitation.** It asserted that
`cons[0]` reached the page, so dropping any *later* limitation was invisible to
it. Found by a mutation probe, and now every limitation is checked.

**Five records claimed to cover businesses that they exclude.** Rebuilding
displaced two existing records from the "If You Are a Freelancer" guide, which was
legitimate ranking — but chasing *why* surfaced a real contradiction. Five of the
seven carried `accepts.localBusiness: true` while their own rendered prose said a
firm is not registered. Established precedent is unambiguous: individual-only
registers (barristers, NMC, HCPC) carry `null`; only registers that genuinely
cover firms (SRA, IPReg) carry `true`. Corrected to `null` on all five; IPReg,
which does record firms, keeps `true`. Both halves are now pinned by test.

That last one is the one worth dwelling on. Nothing failed. The validator passed,
918 tests passed, and the only symptom was two unrelated pages changing in a
`git status` that could reasonably have been waved through as regeneration noise.

That probe is also worth recording as a method note: on its first run it reported
SURVIVED, and the honest reading was not "the guard is broken" — the limitation
was genuinely still rendered, via `notRecommendedFor`. **The probe had not
injected the defect it claimed to.** It was strengthened to strip the limitation
from every rendered field, and only then did it prove the guard.

## No new Domain Rating

No new host is an already-measured domain. All seven carry `domainRating: null`.
**66 records display a rating over 64 historical measurements**; digest
`aa7e6984…19847a4e`, unchanged since Wave 1C-2 and asserted by test.

## Verification

| Gate | Result |
|---|---|
| Validator | exit 0 |
| Migration ×2 | rewrote **0** on both runs |
| Generator ×2 | second run wrote **0**, pruned **0** |
| Tests | **918 pass, 0 fail** (898 before, 20 added) |
| Mutation probes | **19 injected, 19 caught, 0 survived, 0 broken, 0 no-op** |
| Internal links | 4,005 in-dataset hrefs, **0 broken** |
| Sitemap | equals the indexable set (**316 = 316**), 0 duplicates |
| RSS | equals published records (**245 = 245**) |
| JSON-LD | 316 blocks, **0 malformed** |
| Canonical | present on every page |
| Titles / descriptions | unique across all 316 |
| Editor notes | leak to **0** pages |
| Four roles | determined separately on every record |
| Live URL re-check | all seven **200**, no cross-host redirect |
| Country pages | UK links all 27, Czechia all 9 |
| Coverage manifest | matches the registry, and is now enforced |
| Working tree | clean |

Research was direct, in **two separate passes** — a drafting pass and an
adversarial re-verification pass that reopened every source without consulting the
first draft. This is not independent-agent verification; the agent fleet exhausted
its spend allocation twice and is not an available dependency.

**The adversarial pass changed published content**, and so did the release gate.
Existing UK guards caught three real gaps in the new records: neither the ARB nor the Engineering Council
record distinguished registering a *person* from registering a *business*, and the
IPReg record never said what inclusion does **not** establish. All three were
strengthened before commit, and the `accepts` correction above was made at the
gate, after every test was already green.

## Rollback

The branch is additive and `origin/main` is untouched at `175b8e5`.

- **Revert everything:** `git revert --no-commit <head>..<base> && git commit`, or
  simply do not merge.
- **Revert one record:** delete its object from the country JSON and rebuild. Its
  pins in `bd-professional-licences.test.cjs` will fail, which is intended —
  remove the matching assertions in the same commit if the revert is deliberate.
- **Reverting any UK record additionally requires updating**
  `united-kingdom-territorial-coverage.json`, or the new manifest test will fail.
  That failure is the guard working, not a defect.
- **No Domain Rating was touched**, so no metric rollback is needed.
- **The registry-type boundary note was edited.** Reverting it will fail the test
  that asserts the clarified boundary still demands the practise/title
  distinction.

## Remaining before Wave 3A-2

Germany and France, both explicitly out of scope here: the
Rechtsanwaltskammern, Wirtschaftsprüferkammer, Architektenkammern and
Bundesnotarkammer; the French ordres and the CNB. **No conclusion about any of
them is recorded in this wave** — they were not researched, which is different
from being rejected.

Also open: the Czech auditors' chamber (KAČR) and tax advisers' chamber, neither
analysed to publication standard; and the Law Society of Scotland, whose host
refused automated clients. A 403 is a bot filter, not evidence of absence.
