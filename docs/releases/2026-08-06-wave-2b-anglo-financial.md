# Wave 2B — UK, US, Canada & Australia financial & regulatory registries

Released 2026-08-06. Continues production from `44c9e7e` (Wave 2A, PR #31). No
schema change, no route change, no taxonomy change.

## This wave is mostly a set of decisions not to add records

Nineteen candidates determined; **two published**. That is the correct outcome,
not a shortfall. The brief said duplication would be the dominant risk and it was:
the FCA, ASIC and APRA entries already in the dataset are deliberately broad and
absorb most plausible candidates.

**Dataset 236 → 238.**

| Country | Before | After | Added |
|---|--:|--:|---|
| Canada | 16 | **17** | FINTRAC Money Services Business Registry |
| United States | 74 | **75** | NCUA Credit Union Locator |
| United Kingdom | 24 | 24 | — all candidates duplicate or pending |
| Australia | 13 | 13 | — all candidates duplicate or pending |

## The PRA/FCA decision

**A separate PRA record would be a duplicate.** The Bank of England's own page on
which firms the PRA regulates states that firm data is *"published on the
Financial Services Register"*, and sends readers to that register's "Other
Registers" section for Bank Holding Companies. The existing `gb-fca-register`
already records that it covers firms authorised by the FCA **or the PRA**.

The PRA's standalone lists — such as the designated investment firms CSV — are
**publications of a subset already in the register**, not a separate searchable
system.

A test now fails if any UK financial record is filed on a Bank of England host, and
another fails if the FCA record ever stops recording its PRA coverage — because
that sentence is what makes the duplicate determination correct.

## The other duplicate determinations

- **FCA Warning List** → absorbed by `gb-fca-register`, which already states it
  carries warnings about unauthorised and clone firms.
- **ASIC financial advisers and banned/disqualified views** → absorbed by
  `au-asic-registers`, which explicitly covers them. ASIC Connect tabs are filtered
  views of one system.
- **APRA per-sector lists** → absorbed by `au-apra-registers`. Filtered
  populations, not distinct systems.
- **NCUA locator vs research view** → **one** record. Two named tools, one host,
  one dataset: the locator finds an institution, the research view shows its filed
  reports. Splitting them would be splitting by user-interface view.

## FINTRAC: the register, not the guidance page

The brief demanded this distinction and the agency's own navigation settles it —
the guidance landing page and the registry are different URLs, and this record
points at the **registry**.

On what registration means, in the agency's own words: *"Registration with FINTRAC
does not indicate that FINTRAC endorses or licenses the business. It indicates only
that the business has satisfied the legal requirements to register. FINTRAC does
not issue licenses or certificates of registration to businesses it regulates."*
That is carried into the published limitations, and a test fails if it is removed.

A second discipline is pinned: the agency documents that all fields are searchable
and that a downloadable version exists. That is **the operator's documentation, not
observed behaviour**, so it did not become an access boolean.

## Access honesty

Both new records ship `accessLevel: unknown` with every boolean null and no search
URL.

The NCUA record is the harder case and is stated plainly: **its application host
does not respond to automated requests**, so identity, current status and function
rest on the regulator's own site, which links the tool and describes it. That
limitation appears in the published limitations, not only in editor notes.

## What is blocked, and why that is not a coverage claim

**Anglophone financial regulators are heavily bot-protected.** NMLS returned 403,
CIRO returned 403, AUSTRAC did not respond at all, and NCUA's application host did
not respond — while the regulators' own describing pages served normally. A 403 is
a bot filter, not evidence that a register does not exist. All four are recorded as
pending with the specific browser action needed.

## No new Domain Rating

**66 records display a rating over 64 measurements**; digest `aa7e6984…19847a4e`,
unchanged.

## Verification

Validator exit 0 · second migration rewrote 0 · second build wrote 0 and pruned 0 ·
**898 tests pass, 0 fail** (882 before, 16 added) · **19 injected defects all
caught, 0 survived, 0 broken probes, 0 no-op probes** · 22,604 links, 0 broken ·
sitemap equals the indexable set (309 = 309) · RSS equals 238 published records ·
309 JSON-LD blocks, 0 malformed · canonical everywhere · titles and descriptions
unique · all four in-scope country pages link every one of their records · no
network or credential dependency · clean tree.

**Two existing guards caught real defects in this wave**, both fixed rather than
worked around:

1. The publication-truth guard rejected NCUA prose that described **our research
   session** rather than the system. Rephrased to describe the host's behaviour.
2. The Canada coverage-manifest guard rejected the commit because a new federal
   Canadian record made `federalPublished` drift from the registry. The manifest
   was corrected — a coverage manifest that drifts makes the country page lie.

**One of my own new guards was a false positive and was narrowed:** an overlap
check matched the *word* "broker" and swept in NFA BASIC (futures) and a customs
brokers listing, which are unrelated populations. Rewritten to test hosts and this
wave's own output instead.

## Readiness for Wave 3

The four in-scope countries are now at a defensible stopping point for financial
coverage: everything reachable has been determined, and everything unreachable is
recorded with a next action. Wave 3 (Professional Licences) can start from a clean
production HEAD once this merges.
