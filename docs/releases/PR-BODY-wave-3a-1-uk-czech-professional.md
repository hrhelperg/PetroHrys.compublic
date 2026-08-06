# feat: add Wave 3A-1 UK and Czech professional registers

First wave of the professional-licence layer, and the first half of a deliberate
split: **Germany and France were not researched and are deferred to Wave 3A-2.**
Continues production from `175b8e5` (Wave 2B, PR #32).

**Dataset 238 → 245. Seven statutory professional registers across two
countries.** No schema change, no route change, no new taxonomy value.

| Country | Before | After | Added |
|---|--:|--:|---|
| **United Kingdom** | 24 | **27** | ARB Architects Register · Engineering Council RegCheck · IPReg Register |
| **Czechia** | 5 | **9** | ČAK advocates · NKČR notaries · ČKA authorised architects · ČKAIT authorised persons |

Czechia had no professional-licence coverage at all before this wave; the UK
layer held only the two legal-profession registers.

---

## The distinction this wave exists to hold

**A protected-title register is not a licence to practise.**

ARB and the Engineering Council restrict a *title*. Neither restricts the *work* —
anyone may carry out architectural or engineering work; only the word "architect"
and the chartered engineering titles are protected. The Czech chambers are the
opposite case: authorisation is required for **reserved activities**.

Both are `professional-licence-register`, so every record states in **rendered
prose** whether registration is required to PRACTISE or only to USE THE TITLE. A
test asserts the two effects are never described identically, and that a
title-only register never claims to license practice.

**The taxonomy was deliberately not expanded.** A new
`protected-professional-title-register` would have rested on two candidates whose
protection comes from different sources — statute for ARB, Royal Charter for the
Engineering Council. That distinction belongs in prose, not in a two-member enum.
The existing type's boundary note was clarified instead.

## Four decisions worth reviewing closely

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
says the other exists, because **absence from one says nothing about the other**.

**These registers record people, not businesses.** ARB and the Engineering Council
register individual practitioners; a firm is not registered. Each record says so,
because a reader checking a company would otherwise draw exactly the wrong
conclusion. IPReg is the exception and records firms too — which is why its record
warns that a result must be read carefully to know which kind of entry came back.

## Access honesty

**All seven ship `accessLevel: partially-open` with `loginRequired: false`** — an
anonymous load was observed on each — and **every other access field null**. No
search was executed anywhere, so result content, coverage and limits are neither
known nor asserted.

**Fully-unknown access: 0%**, against the brief's 50% ceiling.

Two limitations were significant enough to publish rather than file:

- **Engineering Council RegCheck requires an exact match**, and the council itself
  warns that an unexpected nil result does not establish that someone is
  unregistered. A reader who does not know this will misread nil as proof.
- **ČKAIT publishes "Výběry ze seznamu"** — *selections from* the list. The record
  does not upgrade that into a claim to be the complete register, and its form
  requires JavaScript, so it could not be exercised.

## Three defects found — none of which anything was failing on

Two were in the machinery meant to protect the content; one was in the content.

1. **The UK coverage manifest drifted.** Adding three UK-wide records left
   `united-kingdom-territorial-coverage.json` asserting 24 records and 8 UK-wide
   against a registry holding 27 and 11 — the same silent drift Canada's manifest
   had in Wave 2B, and for the same reason: **nothing tied it to the registry**.
   Corrected, and now pinned by test on all four totals **plus the UK-wide id
   list**, because a count alone would not catch a swap.
2. **The rendered-caveat guard only checked `cons[0]`.** Dropping any *later*
   limitation was invisible to it. Found by mutation probe; now checks every one.
3. **Five records claimed `accepts.localBusiness` while their own prose said a
   firm is not registered** — which would have listed them in an audience guide
   for readers looking for their business. Corrected to `null`; IPReg, which does
   record firms, keeps `true`. Pinned in both directions.

The third is the one worth dwelling on. Nothing failed. The validator passed, every
test passed, and the only symptom was two unrelated pages changing in a
`git status` that could reasonably have been waved through as regeneration noise.

**A method note on the probes.** One probe initially reported SURVIVED. The honest
reading was not "the guard is broken" — the limitation was still rendered, via
`notRecommendedFor`. **The probe had not injected the defect it claimed to.** It
was strengthened to strip the limitation from every rendered field, and only then
did it prove the guard.

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

**The adversarial pass changed published content.** Existing UK guards caught three
real gaps: neither the ARB nor the Engineering Council record distinguished
registering a *person* from a *business*, and the IPReg record never said what
inclusion does **not** establish. All three were strengthened before commit.

## Rollback

The branch is additive and `origin/main` is untouched at `175b8e5`. No data
migration, no route change and no redirect is involved in either direction.

- **Revert everything:** `git revert --no-commit <head>..<base> && git commit`, or
  simply do not merge.
- **Revert one record:** delete its object from the country JSON and run
  `node scripts/build-business-directories.cjs`. Its pins in
  `bd-professional-licences.test.cjs` will then fail, which is intended — remove
  the matching assertions in the same commit if the revert is deliberate.
- **Reverting any UK record additionally requires updating**
  `united-kingdom-territorial-coverage.json`, or the new manifest test will fail.
  That failure is the guard working, not a defect.
- **The registry-type boundary note was edited.** Reverting it will fail the test
  asserting the clarified boundary still demands the practise/title distinction.
- **No Domain Rating was touched**, so no metric rollback is needed.

## Not done, deliberately

No Germany or France research — that is Wave 3A-2, and the dominant risk there is
**German federalism**: many professions are organised through Länder chambers
rather than a national register. No healthcare regulators (excluded by brief). No
new countries, no redesign, no localisation.

Also open and explicitly not concluded: the Czech auditors' chamber (KAČR) and tax
advisers' chamber, neither analysed to publication standard; and the Law Society of
Scotland, whose host refused automated clients. **A 403 is a bot filter, not
evidence of absence.**
