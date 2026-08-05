# Release — Wave 1B Completion: US state coverage and state-first navigation

**Branch:** `feat/business-directories-wave-1b-state-coverage-completion`
**Head:** `fb4cca1`
**Baseline:** `origin/main` @ `1698e19` (2 ahead, 0 behind)
**Date:** 2026-08-05
**Type:** Additive. Twelve state registries, and a state-first United States page.

### Lineage

- `fb4cca1` fix: three prose leaks found by the release audit, and a .gitignore
- `a1f5ce8` feat: complete US state registry coverage and navigation

Preceded by **PR #21** and **PR #22** (merge `1698e19`), which released Wave 1
for the United States: the schema foundation, 24 federal systems, 34 state,
district and territory registers, and the grouped country page this phase
builds on.

---

## Totals

|  | `origin/main` | This release |
| --- | --- | --- |
| Records | 130 | 142 |
| United States | 62 | 74 (28 federal, 46 subnational) |
| States published | 31 of 50 | **43 of 50** |
| Generated pages | 199 | 211 |
| Sitemap URLs | 199 | 211 |
| RSS items | 130 | 142 |
| Tests | 595 | 614 |

---

## State coverage: 31 → 43 of 50

All 50 states were researched. **None was rejected.** Twelve cleared the five
publication criteria — system identity, operator, active function, canonical URL
confirmed from an official page, and public entity-search purpose — and each
approval was then independently attacked by a second pass that tried to refute
it. All twelve survived, and every correction those passes demanded was applied:

- **Indiana** — SOS Business Entity Search (Indiana Secretary of State, Business Services Division)
- **Mississippi** — Business Search (Mississippi Secretary of State — Business Services & External Affairs (Business Services Division))
- **Arizona** — Arizona Business Center (Arizona Corporation Commission)
- **Michigan** — Business Entity Search (Michigan Department of Licensing and Regulatory Affairs (LARA), Corporations, Securities & Commercial Licensing Bureau, Corporations Division)
- **New Mexico** — Business Services Online Filings Portal (New Mexico Secretary of State, Business Services Division)
- **Georgia** — Business Search (Corporations Division of the Georgia Secretary of State's Office (Office of the Georgia Secretary of State, Brad Raffensperger))
- **Missouri** — Business Search (Missouri Secretary of State — Corporations Division)
- **Oklahoma** — Business Entities Search (Oklahoma Secretary of State — Business Records Department)
- **Pennsylvania** — Business Name Search (Pennsylvania Department of State, Bureau of Corporations and Charitable Organizations)
- **Vermont** — Business Search (Vermont Secretary of State, Business Services Division)
- **South Carolina** — Business Entities Online (South Carolina Secretary of State's Office, Business Filings Division)
- **Alabama** — Government Records Inquiry System (Alabama Secretary of State — Business Services, Business Entities Division)

Several corrections were to names. Indiana shipped as "SOS Business Entity
Search", not the researcher's coinage "INBiz Business Search", which appears on
no official page. New Mexico was nearly published as "New Mexico Business
Portal" — the self-declared name of a **different** state system at biz.nm.gov
which has its own "Business Search", so the record would have pointed readers at
the wrong place. Georgia lost an "(eCorp)" parenthetical occurring only inside
href URLs and one JavaScript error string.

### Territories

2 of 5 published (Puerto Rico, United States Virgin Islands); 3 pending (Guam, Northern Mariana Islands, American Samoa).
The federal district is published.

---

## The publication rule that changed

Alabama and Mississippi were withheld from the previous release under the rule
*"nobody has watched the search behave, therefore no publication"*. That rule
was too strict: it discarded registers whose identity, operator and canonical
address were all established from Secretary of State pages, purely because our
network could not reach the application. It is replaced by:

> **Do not publish an access behaviour that has not been observed or officially
> documented.** Identity and existence are verifiable separately from live
> behaviour.

Both are now published, and both are silent about fees, accounts and challenges:
`freeToSearch`, `loginRequired` and `captcha` are `null`, `accessLevel`
is `partially-open`, and a con on each page tells the reader why.

**13 of 46** subnational records carry `freeToSearch: null`. Access levels across
the subnational layer: open 23, partially-open 18, unknown 4, login-required 1.

The one access fact this phase adds affirmatively is New Mexico's geographic
restriction, because the Secretary of State publishes it: the register is
"available to anyone within the United States" and access from other countries
is restricted.

---

## State-first navigation

Inside the States group, a grid of all fifty states, each appearing exactly
once. A published state is a card linking to its registry page, showing the
operator, the score and an access badge. A pending state is **deliberately
inert**: no link, no detail route, no sitemap entry, no feed item, no JSON-LD —
only its name, "Pending verification", and a reader-facing label chosen by
blocker code. There is nothing behind a pending card, so nothing pretends there
is.

A jurisdiction selector lists every state and every group. Selecting a published
state shows its registry; selecting a pending one narrows the grid to that state
and reports *"No published directory for this jurisdiction — 1 state coverage
entry shown"*, so a coverage count can never be read as a directory count.

**No state route family was created.** Most states have exactly one principal
registry, and fifty landing pages over fifty single records would be fifty thin
intermediaries. Revisit when **either** at least 15 states have 3+ verified
state-specific resources, **or** state content grows beyond one principal
entity register.

### Measured

|  |  |
| --- | --- |
| United States page | 140,343 bytes / 18,309 gzipped |
| Rows / state cards / groups | 74 / 50 / 5 |
| Clickable / inert cards | 43 / 7 |
| bd- classes, unstyled | 49, 0 |
| Jump links resolving | 5 of 5 |

---

## Publication-truth corrections

Release preparation re-ran every guard over the twelve new records and five
named ones (FINRA BrokerCheck, Texas, Puerto Rico, the US Virgin Islands, the
District of Columbia). Three defects survived the phase's own checks, all
Vermont's, all the same mistake: an account of the research reaching the page —
a description carrying "Not directly observed … no form markup was
retrievable", a con opening "(2) " from a list it had been lifted out of, and a
con explaining how the evidence was weighed.

### The FINRA badge

"Registration required" was ambiguous. On a statutory register it means
regulated entities must register by law; it read as "you need an account", and
FINRA BrokerCheck carried it beside "free to search with no account required" on
the same screen. Entity registration and user access are now separate badges —
**"Entity registration required by law"** and **"No user account required to
search"** — and a legal obligation no longer borrows the gated styling.

### Editorial prose

Seven records named a schema field in visible prose ("so submissionModel is
unknown", "manualReview is left null"). All rewritten. No record in the dataset
now names an implementation term in editorial text.

---

## Data policy, unchanged

**Open-source only.** No paid API, no key, no commercial database, no unofficial
mirror, no search snippet as evidence. Research used official registry
applications, the agency pages linking to them, official help and filing
documentation, state open-data portals and statutes — in that order.

**Frozen historical Domain Rating.** 64 records carry one, every one a snapshot
predating the policy, pinned by a SHA-256 digest a test recomputes each run.
**No record added in this release carries a Domain Rating, authority score,
traffic estimate or referring-domain count.**

The build makes no network request and reads no host, key or endpoint from the
environment.

---

## Backlog

Seven states and three territories remain. Each carries a blocker code, an
internal summary, a candidate URL where one is officially confirmed, and the
single manual step that would resolve it.

| Code | Jurisdiction | Candidate | Blocker | Next action |
| --- | --- | --- | --- | --- |
| US-AK | Alaska | Search Corporations Database (the Corporations Database of the Corporations Section) | Official application blocked to automated access | Open https://corporations.alaska.gov in an ordinary desktop browser, let it follow through to the Corporations Section p |
| US-IL | Illinois | _not established_ | Official application blocked to automated access | Open https://apps.ilsos.gov/businessentitysearch/ in an ordinary desktop browser and record four things: the heading the |
| US-NH | New Hampshire | _not established_ | Official application blocked to automated access | Open https://quickstart.sos.nh.gov/online/BusinessInquire in an ordinary consumer browser on a US residential connection |
| US-OH | Ohio | _not established_ | Official application blocked to automated access | Open https://businesssearch.ohiosos.gov/ in a real browser with JavaScript and cookies enabled, clear the security check |
| US-UT | Utah | Named on Utah state government pages as "Utah Business Entity Search" (Utah State Courts) and "Utah Department of Commer | Official application blocked to automated access | Open https://businessregistration.utah.gov/ in a real browser to clear the Cloudflare interactive challenge, then confir |
| US-VA | Virginia | _not established_ | Official application restricted by region | From a US-based browser, open the Commission's business pages at https://www.scc.virginia.gov/businesses/ and follow its |
| US-WY | Wyoming | _not established_ | Official application unreachable | In an ordinary browser on an unfiltered connection, open https://sos.wyo.gov/Business/Default.aspx, follow its link to t |
| US-GU | Guam | _not established_ | Access behaviour unconfirmed | Open https://www.guamtax.com/ in an ordinary desktop browser. |
| US-MP | Northern Mariana Islands | Office of the Registrar of Corporations | Access behaviour unconfirmed | Open https://registrar.cnmi.gov/ in an ordinary desktop browser. |
| US-AS | American Samoa | _not established_ | Access behaviour unconfirmed | Open https://legalaffairs.as.gov/ in an ordinary desktop browser. |

Virginia's and Wyoming's candidate addresses come from search-engine leads
rather than official pages, and are recorded as leads, never as the register's
URL. South Carolina had the same problem and is nonetheless published, because
the Secretary of State's own accountability report names the system
independently.

---

## ⚠️ Move this repository out of iCloud

`/Users/petrohrys/Desktop/PetroHrys.compublic` sits under an iCloud-synchronised Desktop. iCloud resolves a sync
conflict by writing a second copy beside the original, and during this phase it
produced **72 of them** in one session — `china 2.json`,
`bd-registry-types 2.cjs`, `index 2.html` across sixty-odd generated
directories. The registry loader refused to start until they were cleared,
which is the only reason they were noticed.

None was ever committed, but only by luck: the repository had no
`.gitignore` at all, and an earlier release did commit two saved HTTP
responses at the repository root, which would have been served publicly. A
`.gitignore` now covers the pattern, and it is a guard rail, not a fix.

**Move the working copy to a path iCloud does not sync** — `~/Projects`,
`~/src`, anywhere outside Desktop and Documents. Until then, run
`find . -name "* [0-9].*" -not -path "./.git/*"` before every commit.

---

## Rollback

Fast-forward from `origin/main`; nothing on main is rewritten.

```sh
git checkout main && git reset --hard origin/main    # undo the whole release
git revert --no-commit <sha> && git commit           # or drop one commit
node scripts/validate-business-directories.cjs
node scripts/migrate-business-directories.cjs
node scripts/build-business-directories.cjs
node --test "scripts/tests/*.test.cjs"
```

The generator owns every page it writes and prunes what it stops owning, so
removing records and rebuilding removes their pages, sitemap entries and feed
items in one pass. Reverting the twelve records returns coverage to
31 of 50 and the state grid follows automatically: it is derived from the
manifest and the registry, never written down.
