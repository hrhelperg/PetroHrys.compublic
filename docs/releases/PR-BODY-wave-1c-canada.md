# feat: add Wave 1C Canada government registries

Continues production from `6769ec7` (Wave 1C-1, Australia). **Canada only** — no
UK, no Europe, no Asia, no Wave 2. Two commits: the wave itself (`b2abdc0`) and a
completion pass (`405ccc6`).

---

## Canada 1 → 15 records

The dataset goes from **153 to 167** records; Canada from **1 to 15**.

| Layer | Records |
|---|---|
| **Federal** (5) | Canadian Trademarks Database · Canadian Patents Database · MRAS Canadian Business Registry · SEDAR+ · *(pre-existing)* Search for a Federal Corporation |
| **Provinces** (8) | Ontario Business Registry · Quebec enterprise register · Quebec RBQ licence holders · BC Registry Services · Manitoba Companies Office · Nova Scotia Registry of Joint Stock Companies · Newfoundland and Labrador CADO · Saskatchewan Corporate Registry |
| **Territories** (2) | Northwest Territories Corporate Registries · Nunavut Legal Registries |

## Provincial and territorial coverage

**Nine of Canada's thirteen** provinces and territories carry a record: ON, QC,
BC, MB, NS, NL, SK, NT, NU.

The registry mix is deliberately broader than corporate registers alone: a
trademark register, a patent register, a securities filing database, a
beneficial-ownership register (Quebec publishes ultimate beneficiaries free of
charge), a contractor accreditation register (RBQ) and a cross-border registry
interface (MRAS).

Coverage is counted from `data/business-directories/canada-jurisdiction-coverage.json`,
never from a record total, so a gap stays visible rather than silent. Tests
cross-check that manifest against the registry in both directions.

## Alberta — no public registry, and not a blocker

**Alberta operates no government public corporate search.** Confirmed from
`alberta.ca/find-corporation-details`:

> "Registry agents provide all of the search services listed below."
>
> "A registry agent will charge a government fee and a service fee to provide the
> information you need."

Nothing was published for Alberta. It is recorded as
`researchStatus: "no-public-registry"` with `blockerCode: "none"` — deliberately
**not** as a fetch blocker, because a later wave that reads it as one will
eventually "fix" it by publishing a private registry agent. Tests assert both the
classification and the absence of any `CA-AB` record.

## Saskatchewan — statutory registry, private delivery

Saskatchewan is **not** the Alberta case, and collapsing the two would misdescribe
both. Its registry is statutory; only delivery is commercial, through Information
Services Corporation. The entry point at `corporateregistry.isc.ca` is titled
"ISC Customer Portal" and presents a username/password form, so
`loginRequired: true` is recorded from direct observation and `operator.type` is
`other` rather than a government type.

A test reads the record sentence by sentence and fails if it ever describes
itself as government-operated — the sole permitted occurrence of that phrase is
the clause explaining that *Alberta* has none.

## MRAS — a federated interface, never the source of record

Published as `cross-border-registry-interface`, and as its **only** registry type:
adding a register type would claim it holds records, which it does not. Its
published prose states it is not the source of record, and a test forbids any
record listing it as an *alternative* to a real register.

The official entry point is `canadasbusinessregistries.ca`, verified by request
to redirect to `ised-isde.canada.ca/cbr-rec/en/`. The lookalike domain
`businessregistries.ca` is a **commercial domain-sale parking page** with no
government connection; a test forbids it ever appearing as a link target, while
requiring the warning to stay recorded in `editorNotes`.

## Canadian Trademarks Database

Published as `ca-cipo-trademarks-database`, operated by the Canadian Intellectual
Property Office (ISED). Free, no account, coverage from 1865, "over 140 years of
Canadian trademarks data" and "more than 1.4 million Canadian trademarks",
including marks cancelled, expunged, abandoned or refused after 1979. Sources
were **revalidated live immediately before publication**.

It is kept clearly distinct from the federal corporation search — different legal
function, different search URL, different population, different registry type —
and it states in published prose that it records "trademarks, not businesses",
that an entry establishes nothing about the owner's incorporation, legitimacy or
standing, and that unregistered common-law rights appear in no register at all.
Tests assert each of those.

## Shared-domain historical DR policy

CIPO's trademark search shares the measured domain `ised-isde.canada.ca` with the
federal corporation search, and no alternate official host exists. The previous
rule — *every new record carries `domainRating: null`* — conflated two different
things: the collection freeze, and a prohibition on an already-collected number
appearing twice. The freeze never required the second.

**The rule now reads:**

> A new record must not create a new Domain Rating measurement. A record may
> reuse an existing frozen historical snapshot when its normalised
> `measuredDomain` exactly matches an already measured domain.

Reuse requires an exact `measuredDomain` match with value, provider, `measuredAt`
and `historicalSnapshot` status copied verbatim. Copying between different
domains, between a parent domain and a subdomain, or under a changed date,
provider or status all remain forbidden.

`sharedDomainSnapshotProblems()` in `bd-schema.cjs` is the single enforcement
point — the validator and `bd-truth` both call it, so they cannot drift. A record
on an already-measured domain may still decline the value, but only by writing
the literal marker `Domain Rating not reused: …` in `editorNotes`, so a forgotten
value can never pass as a considered one.

Public wording on every page carrying the column now states that Domain Rating
"is a dated historical measurement of the shared domain, not an assessment of
this individual registry page".

## No new DR measurement

The trademark record reuses `ised-isde.canada.ca`'s existing snapshot — 92,
Ahrefs, 2026-08-04, `historicalSnapshot` — **read programmatically off
`ca-corporations-canada`**, with the authoring script aborting on any drift.

| | Records carrying a DR | Distinct measurements | Per-domain digest |
|---|---|---|---|
| Before | 64 | 64 | `aa7e6984…19847a4e` |
| After | 65 | 64 | `aa7e6984…19847a4e` |

A record was added; a measurement was not. The two pre-existing guards that
pinned this were **re-expressed, not weakened**: both had pinned the count of
*records displaying* a rating, which is the wrong quantity. They now pin the count
and digest of *measurements*, so they still fail on a new domain, an edited value,
a refreshed date or a swapped provider.

`ca-corporations-canada` keeps its verification date, score, DR value and
provenance, URL and classification. Its only change is the `resourceIdentity`
shared-host declaration the architecture requires; a test pins every other field
individually.

## Official-source-only policy

Every factual statement originates from a page served by the operator's own
domain or by the government that operates it. Search engines were used only to
locate those pages. Where a page could not be read, nothing was asserted — access
fields stay `null` rather than becoming a confident `false`, and a test enforces
that for every record whose `accessLevel` is `unknown`.

Adversarial review changed the output four times rather than rubber-stamping it:

1. **FINTRAC withdrawn** — the record pointed at FINTRAC's *requirements
   guidance*, not the register, and quoted a fee statement absent from the page
   actually read. Withdrawn rather than patched.
2. **Quebec corrected** — two claims had been drafted from a search-engine
   summary. Removed; fetching Québec's own page then produced *better* evidence
   (free-of-charge consultation, ultimate beneficiaries, the Charter of the French
   language condition on English service).
3. **Quebec again** — the suite caught prose saying a person "can be searched"
   while `searchUrl` was null; resolved by publishing the official portal.
4. **Saskatchewan re-read** sentence by sentence for any claim of government
   operation; the check is now a permanent test.

## Pending federal and provincial candidates

None published merely to raise coverage. All retain official candidate URL,
blocker, research date, the exact browser action required, and what is known
versus unknown.

- **Provincial/territorial:** New Brunswick, Prince Edward Island, Yukon — every
  official host returned an interstitial bot challenge or no response.
- **Federal:** CRA List of Charities (client-rendered; `www.canada.ca` was
  unreachable from this environment) and the FINTRAC MSB register (403 on two
  hosts) are the two highest priorities. Also pending: Registry of Lobbyists, CSA
  National Registration Search, OSFI institution lists, CIRO AdvisorReport,
  OrgBook BC.
- **Rejected:** `businessregistries.ca` (parked commercial domain), CanadaBuys
  (tender portal, not a business register), individual Alberta registry agents.

Tests assert `CA-AB`, `CA-NB`, `CA-PE` and `CA-YT` carry no record, so none can
be quietly filled in without resolving its blocker.

## Tests and release audits

- Validator exit **0**; second migration rewrote **0**; second build wrote **0**
  and pruned **0**.
- **716 tests pass, 0 fail** (666 at production HEAD; +32 Canada, +17
  shared-domain snapshot, one wave-1A guard re-expressed).
- **13,512** internal links checked, **0** broken.
- Sitemap equals the indexable set (236 = 236, 0 `noindex`); every indexable
  record URL present in RSS.
- 236 JSON-LD blocks parse; no `AggregateRating`, `Review`, `Product` or
  `SearchAction` markup.
- Every page carries an absolute canonical and is owned by the build manifest.
- No build, validator or migration path can make a request or read a credential.
- 64 measured domains before and after; per-domain snapshot digest unchanged.
- Eight deliberate mutations all caught (MRAS reclassified, Saskatchewan operator
  laundered, Alberta record invented, NT refiled as a province, DR added to a new
  record, unknown access hardened to `false`, pre-existing record re-dated, score
  detached from its factors).
- Working tree clean after build-then-test.

## Rollback plan

Both commits are additive and confined to this branch; `origin/main` is untouched
at `6769ec7`.

- **Revert everything:** `git revert --no-commit 405ccc6 b2abdc0 && git commit`,
  or simply do not merge. `main` needs no action.
- **Keep the wave, drop the completion pass:** `git revert 405ccc6`. This removes
  the trademark record, the shared-domain guard and the DR policy change, and
  restores the previous per-record snapshot pin. Wave 1C-2 stands alone at
  `b2abdc0` and its gate passed independently.
- **Drop one record:** delete it from
  `data/business-directories/directories/canada.json`, then run
  `node scripts/build-business-directories.cjs`. The generator prunes the detail
  page, and the category and country pages if it was the last record, using the
  build manifest. Update `canada-jurisdiction-coverage.json` in the same commit or
  the coverage tests will fail — which is the intended behaviour.
- **Post-merge:** the only cross-cutting change is `DR_SNAPSHOT_POLICY_NOTE`,
  which rewrites the note on every page showing the Domain Rating column.
  Reverting it is a one-line change in `scripts/lib/bd-schema.cjs` followed by a
  rebuild; no data is touched.

Nothing here is deployed. No Domain Rating was measured. No UK authoring has
begun.
