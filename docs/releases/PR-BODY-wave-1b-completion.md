## Wave 1B completion — US state coverage and state-first navigation

State coverage **31 → 43 of 50**, and the United States page becomes a
state-first research surface rather than a table of registries that happens to
contain states.

|  | `origin/main` | This branch |
| --- | --- | --- |
| Records | 130 | 142 |
| United States | 62 | 74 (28 federal, 46 subnational) |
| States published | 31 of 50 | **43 of 50** |
| Pages / sitemap / RSS | 199 / 199 / 130 | 211 / 211 / 142 |
| Tests | 595 | 614 |

### Twelve new state records

All 19 pending states were re-researched from official sources only. Twelve
cleared the five publication criteria; each approval was then independently
attacked by a second pass, and all twelve survived with corrections applied.

- **Indiana** — SOS Business Entity Search
- **Mississippi** — Business Search
- **Arizona** — Arizona Business Center
- **Michigan** — Business Entity Search
- **New Mexico** — Business Services Online Filings Portal
- **Georgia** — Business Search
- **Missouri** — Business Search
- **Oklahoma** — Business Entities Search
- **Pennsylvania** — Business Name Search
- **Vermont** — Business Search
- **South Carolina** — Business Entities Online
- **Alabama** — Government Records Inquiry System

Indiana shipped under the operator's wording, not the researcher's coinage.
New Mexico was nearly published under the name of a **different** state system
at biz.nm.gov, which would have misdirected readers.

### The pending-state honesty model

Seven states and three territories remain unpublished. **None was rejected.**
A pending jurisdiction appears on the page — a reader looking for Ohio must
learn where Ohio stands — but it is inert: no link, no detail route, no sitemap
entry, no feed item, no JSON-LD. There is nothing behind it, so nothing pretends
there is.

Selecting a pending state reports *"No published directory for this jurisdiction
— 1 state coverage entry shown"*. A coverage count is never a directory count.

### Access-claim conservatism

Alabama and Mississippi were withheld last release because nobody had watched
their searches behave. That rule discarded registers fully established from
Secretary of State pages, so it is replaced: **do not publish an access
behaviour that has not been observed or officially documented** — identity and
existence are verifiable separately.

Both are published with `freeToSearch`, `loginRequired` and `captcha` all
`null`. 13 of 46 subnational records carry `freeToSearch: null`.

### Manifest / registry parity

`united-states-jurisdiction-coverage.json` moves to the fuller schema and
`publicationStatus` is decided by the **registry**, never by the research: a
record either exists or it does not. `blockerSummary` and `nextAction` are
internal, and a test asserts neither ever reaches a page. The public coverage
sentence is derived at build time — a literal nowhere — and a test fails if the
page and the data disagree.

### FINRA badge, and prose cleanup

"Registration required" read as "you need an account" while sitting beside
"free to search with no account required". Now two badges: **"Entity
registration required by law"** and **"No user account required to search"**.
Seven records naming a schema field in visible prose were rewritten.

### No new routes

No state landing pages. Most states have one principal registry; fifty
intermediaries over fifty single records would be thin. Threshold for
revisiting is recorded in the release note.

### Audits

| Check | Result |
| --- | --- |
| Validator | exit 0 |
| Migration ×2 / build ×2 | second rewrites 0 · writes 0, prunes 0 |
| Tests | 614 pass, 0 fail |
| Internal links | 13,189 checked, 0 broken |
| Sitemap / RSS | 211 = indexable set · 142 = published records |
| JSON-LD | 211 blocks, 503 nodes, all parse |
| Titles / descriptions | 211 unique / 211 unique |
| Ownership / pruning | byte-identical clean rebuild; foreign files untouched and refused |
| Coverage | registry, manifest, page, sitemap and feed all agree |
| Publication truth | 17 records, 197 fields, 0 defects |
| Adversarial factual | every quotation traced to official evidence |
| New Domain Rating | none |
| Network / API dependency | none |
| Conflict duplicates | none; .gitignore added |

Eight isolated mutations confirm the new guards are non-vacuous, including
publishing a pending state, rendering an internal blocker note, and asserting
free access on a register nobody has observed.

### Remaining

Alaska, Illinois, New Hampshire, Ohio, Utah, Virginia, Wyoming — and Guam, Northern Mariana Islands, American Samoa.
All blocked on a human opening a browser; each has a candidate URL or an
explicitly-flagged lead, a blocker code and one next action.

### ⚠️ Repository location

The working copy is under an iCloud-synchronised Desktop, which produced 72
conflict duplicates in one session and previously allowed two saved HTTP
responses into a release. A `.gitignore` now covers the pattern, but the
repository should be moved outside iCloud-synced storage. Detail in the
release note.

### Rollback

Fast-forward from `origin/main`; nothing on main is rewritten.
`git checkout main && git reset --hard origin/main` undoes it. Reverting the
twelve records returns coverage to 31 of 50, and the state grid follows
automatically because it is derived from the manifest and the registry.

### Commits

- `fb4cca1` fix: three prose leaks found by the release audit, and a .gitignore
- `a1f5ce8` feat: complete US state registry coverage and navigation
