# Tender Opportunity Intelligence v1

The Research Center's third procurement layer. Its companion is
`docs/TENDER-OPPORTUNITY-SOURCE-POLICY.md`, which covers where the data comes
from and what may be stored; this file covers the architecture that turns it
into something a supplier can use.

---

## Three layers, three questions

| Layer | Question | Entity | Lifetime |
|---|---|---|---|
| Tender & Procurement Platforms | Where does procurement happen? | 382 platforms | years |
| Procurement Intelligence | Which of those are worth a supplier's time? | derived over platforms | years |
| **Tender Opportunities** | **What is actually open right now?** | **8,682 notices** | **weeks** |

The third is not an extension of the first. A platform is infrastructure; an
opportunity is an event with a deadline. Mixing them would give the platforms
collection a decay rate it does not have.

The link is one hard reference — `sourcePlatformId` — and the schema rejects an
opportunity whose platform is not in the canonical collection. **Ingestion
cannot mint procurement systems.**

---

## The network / build boundary

```
node scripts/ingest-tender-opportunities.cjs     ← network, run by hand
     ↓ writes data/tender-opportunities/
node scripts/build-tender-opportunities.cjs      ← offline, part of the build
```

PetroHrys.com is static files with no build step and no dependencies. A page
that needs TED reachable in order to render is a page that disappears when
Brussels has an outage.

This is enforced, not intended. `scripts/tests/bd-open-source-policy.test.cjs`
walks the **transitive require graph** of every build entry point and asserts
nothing reachable can make a request. That guard already existed in a weaker
form — it listed `scripts/lib/*.cjs` and asserted none could fetch, which was
exact while every library there was a build library. Adding `to-http.cjs` broke
it. The fix was to make the guard stronger rather than to add an exemption:
exemption lists grow, and the second entry is the one that quietly puts a fetch
back into the build.

A companion test asserts the detector still fires on `to-http.cjs` itself, so a
broken regex cannot read as a clean build path.

---

## Raw → canonical → derived

Three layers, never collapsed:

- **RAW** — what the source sent, minus the personal-data strip
- **CANONICAL** — normalized fields, each traceable to the occurrence that
  produced it
- **DERIVED** — anything computed: status from dates, match scores, bands

A derived value never inherits a source fact's authority. `status` always
carries `statusBasis` for exactly this reason:

| Basis | Meaning |
|---|---|
| `SOURCE_REPORTED` | the source published a status and we mapped it |
| `SOURCE_SCOPE` | the source's query guarantees it (TED `scope=ACTIVE`) |
| `DERIVED_FROM_DEADLINE` | nobody said anything; the deadline decided |
| `UNKNOWN` | no status, no decidable deadline |

Source-reported always wins. A cancelled procedure with a future deadline stays
cancelled; an open procedure with a past deadline stays open, because the buyer
knows more than a calendar does.

---

## The canonical model

The brief listed ~35 candidate fields. Each was checked against the five real
payloads before earning a place.

**Common** — id, sourceId, sourcePlatformId, sourceNoticeId, sourceUrl, title,
buyerName, country, publicationDate, deadline, status, noticeType

**Source-specific, nullable** — classifications (4/5), procedureType (3/5),
value (3/5), language (2/5), lotCount (1/5), projectCountry (1/5),
subnationalJurisdiction (2/5), electronicSubmission / submissionUrl /
frameworkAgreement (1/5)

**Dropped as not reliably available** — `foreignSupplierEligibility`,
`openingDate`, `awardDate`, `dynamicPurchasingSystem`, `documentsUrl`

### The two fields that look alike and are not

`electronicSubmission` exists on the platform record for 382 systems and on a
few hundred UK notices, and they mean different things. The platform field says
*this system can accept electronic bids*. The opportunity field says *this
procedure accepts them* — and a system that supports e-submission still runs
procedures demanding sealed paper.

The opportunity value is set only from a source statement, carries
`electronicSubmissionBasis: SOURCE_REPORTED`, and the schema refuses it
otherwise. A test asserts only `uk-fts` records ever carry it.

### Why foreign eligibility was dropped entirely

The brief warns against inheriting the platform's value. The audit found
something stronger: **no pilot source publishes it at notice level at all.** So
it is not a nullable field that happens to be empty — it is a field this layer
cannot honestly carry.

Every single match therefore discloses `FOREIGN_ELIGIBILITY_NOT_STATED`, and a
test asserts that opportunities sitting on platforms with *verified* foreign
eligibility still disclose it.

### Subnational jurisdiction carries its scheme

CanadaBuys publishes provinces that map to ISO 3166-2 (`CA-ON`). UK FTS
publishes NUTS/ITL regions (`UKC12`). Storing `UKC12` in a field validated as
ISO would either reject a valid fact or force the validator to accept anything,
so the field is `{scheme, code}` and ISO codes are checked against the
project's existing allowlist.

Colombian departments have real ISO codes, but Colombia is not on that
allowlist. Hand-writing `CO-*` codes would be the fabrication Wave T3 already
refused, so Colombian records carry a null subdivision.

---

## Time

The one field where being wrong costs the user something. Four genuinely
different shapes arrive:

| Source | Example | Precision |
|---|---|---|
| TED | `2026-09-16+02:00` | `DATE` |
| UK FTS | `2026-09-16T10:00:00+01:00` | `INSTANT` |
| CanadaBuys | `2029-03-31T13:00:00` | `ZONELESS` |
| World Bank | `2026-08-28T00:00:00Z` + `"02:00"` | `ZONELESS` |
| SECOP II | *(no deadline column exists)* | — |

Every timestamp records the **raw source string**, an **ISO instant only when
the zone was knowable**, and a **precision**.

- `ZONELESS` never acquires an instant. Canada spans six time zones; appending
  `Z` to a Vancouver deadline moves it seven hours.
- A `ZONELESS` deadline is displayed as published and **never** used to decide
  whether something is open. Losing records from "closing soon" is the correct
  trade against telling someone a closed tender is open.
- `DATE` resolves to the **end** of the stated day in the stated offset — a
  deadline dated the 16th is not over at 00:00 — and is flagged `derived`.
- `daysUntil` is floored: 6 days 23 hours is "6 days", never 7.

A latent bug found by these tests: TED also emits `2026-09-14Z`, a date with a
UTC designator and no clock. The original pattern accepted only numeric
offsets, so those fell through to precision `NONE` and a resolvable deadline
was silently discarded.

---

## Deduplication is a graph, not a delete

One procurement can be published by several systems, and they disagree about
**different things** — TED carries excellent CPV, the national portal carries
the submission route. Merging into either loses something real.

```
CanonicalOpportunity
  ├─ occurrences[]   every source that published it, all retained
  └─ fieldSources{}  which occurrence each canonical field came from
```

Nothing is deleted. Field-level precedence runs national-transactional →
supranational-aggregator, except that **a cancellation from any source outranks
every other status**, whatever the precedence order says.

### Evidence tiers

| Tier | Evidence | Merged? |
|---|---|---|
| `EXACT` | same source+notice id, or same official reference with country or buyer agreeing | yes |
| `STRONG` | same buyer and reference, or same buyer with near-identical title **and agreeing deadlines** | yes |
| `POSSIBLE` | similar title, same buyer, compatible dates | **no** — recorded and published |

A false negative leaves two visible rows. A false positive silently destroys a
real second tender and no reader can tell. Given that asymmetry the
conservative choice is not close.

### Three failures the pilot actually produced

**Same-source title merging.** The first run merged two Department of National
Defence solicitations both titled "Material Handling Equipment". They were two
procurements. Within one source, only a shared official reference merges now —
cross-publication is the phenomenon this module exists for, and a department
buying oscilloscopes twice is not it.

**Absence read as agreement.** SECOP II publishes no deadline, so every pair of
similar Colombian notices had "compatible" deadlines and 163 merged. Absence is
not agreement: title-based merging now requires deadlines to actively **agree**.

**A reference that identifies nothing.** A Milton Keynes NHS contract merged
with a Colombian process because both were numbered `2026-078`. A reference is
evidence only when distinctive — it must contain a letter, or be at least 12
characters. A bare year-and-sequence identifies a procurement only inside the
office that issued it.

### What is not a duplicate

- A **lot** is not a duplicate of its notice — a ten-lot tender is one
  opportunity with `lotCount: 10`.
- An **amendment** is not a new tender. OCDS is a stream of releases sharing an
  ocid; the pilot's first UK window held 1,181 releases carrying 1,072 tenders.
  Snapshots hold current state, so releases collapse to the latest.
- A **re-issue after cancellation** *is* a new tender, and the cancelled one
  stays cancelled.

---

## Matching

### What the score is not

Not a probability of winning. Not competition, bidder count, or chance. Nothing
published supports any of those, and none is calculated. It is labelled
**opportunity match** everywhere it appears.

### Three scores, kept apart

Procurement Intelligence scores a **platform**. Opportunity match scores a
**tender against a supplier profile**. There is no third score.

Platform quality is deliberately *not* multiplied in. A hospital catering
tender is irrelevant to a telecom supplier however excellent the platform. It
enters only through the confidence dimension, capped at 3 points of 100 — a
test asserts an irrelevant tender on TED still scores below 65.

### Dimensions

| Dimension | Weight | Asks |
|---|---|---|
| Category | 40 | does this match what the supplier sells? |
| Geography | 20 | can they plausibly trade here? |
| Actionability | 15 | is there a route to act? |
| Deadline | 15 | is there usable time left? |
| Confidence | 10 | how established is what we know? |

Bands: ≥80 Strong · ≥65 Good · ≥50 Moderate · ≥35 Weak · else Minimal.

The 16 supplier profiles are **borrowed unchanged** from
`tp-intelligence.cjs`. A second, nearly-identical profile list is how two parts
of one product start disagreeing about what "manufacturer" means.

### Classification first, text last

Structured codes outrank text. Each profile declares CPV and UNSPSC **prefixes**
at whatever length is honest, because two digits is sometimes too coarse:

- CPV **64** is "postal *and* telecommunications". Matching on `64` put a Post
  Office branch tenancy in the telecom top three. Telecom matches `642`.
- CPV **32** is "radio, television, communication and related equipment" — and
  contains photographic film (`32354800`), which put catering disposables in
  the same list. Telecom matches `322`, `324`, `325`; division `32` as a whole
  stays a *secondary* signal.

Four profiles — foreign supplier, EU company, local SME, exporter — have **no**
classification stance, because they describe where a supplier can trade, not
what it sells. Their category dimension is neutral, and the match discloses
`PROFILE_NOT_INDUSTRY`.

Text matching fires only on terms meaningless outside a sector, against the
**title only**, whole-word. "Communication" is not a telecom term — it appears
in communication strategies and internal-communication training. "VoIP" and
"SIP trunk" are, because nothing else is called that.

A scheme a profile cannot read (Canadian GSIN against a CPV preference) scores
as `SCHEME_NOT_UNDERSTOOD` — unreadable, not rejected.

### Every match explains itself

Reasons come from contributing signals; uncertainty is part of the output, not
a footnote. Every match discloses at least `FOREIGN_ELIGIBILITY_NOT_STATED`,
and a test asserts every emitted reason and uncertainty key has a translation
in all four locales.

---

## Snapshot safety

A new snapshot replaces the previous one only if the fetch succeeded, it holds
at least 10 records, every record carries identity and provenance, its
duplicate ratio is under 20%, and its count has not collapsed below half the
previous. Otherwise **the previous snapshot is kept** and the failure is
reported loudly. A stale snapshot with an honest date beats a fresh empty one.

This is not theoretical: UK FTS returned HTTP 429 during the pilot and its
snapshot was preserved.

The collapse guard also fired **correctly** on two intended reductions, when
TED and SECOP II were narrowed to biddable notice types and competitive
procedures. Nothing in the data distinguishes an intended reduction from an
outage — only a human knows which happened — so the guard was not softened. It
is overridden per run with `--accept-shrink`, by someone who just changed the
scope. Every other rule still applies: the override permits a smaller snapshot,
never an empty or malformed one.

### Refresh model

Manual. `node scripts/ingest-tender-opportunities.cjs`, review, commit. The
page says so, in four languages, and says "latest ingested" rather than "live".
No scheduled job, no database, no runtime service — none is needed to validate
the architecture, and the brief is explicit about not adding infrastructure
before it is proven necessary.

---

## Public product

One route per locale: `/research/tenders-procurement/opportunities/` and its
`/de/`, `/es/`, `/fr/` siblings. Plus one CSV.

**No page per tender.** Thousands of URLs dead within weeks is not an index,
it is a graveyard with a sitemap. The page carries the durable content — what
the sources are, what is knowable, what is not — and the volatile layer stays
out of the crawl surface. A test asserts the route directory contains exactly
`index.html` and `opportunities.csv`.

The page renders ~150 curated rows (source coverage, closing soon, seven
profile tables); the CSV carries all 7,579 with every field and all 16
profiles. Rendering thousands of rows would produce a 3 MB page, which is a
database dump with a stylesheet.

### Localization

UI labels and first-party explanation are translated. **Tender titles are
facts and are not translated by us** — but TED publishes the Publications
Office's own title in all 24 EU languages including our four, and CanadaBuys
publishes an official French title. Where an official translation exists it is
used; where it does not, the original stands.

---

## Limitations

- **Bounded windows.** Each source is ingested over a documented window, not in
  full. The World Bank window is the 1,000 most recent of 414,749 notices and
  the page marks it partial.
- **Deadlines.** 1,198 records carry a zoneless deadline and SECOP II publishes
  none at all. Those never enter "closing soon".
- **Foreign eligibility.** Never claimed. No source publishes it per notice.
- **No estimates.** No contract value where none was published, no currency
  conversion, no summing across lots, no bidder counts, no win probability.
- **Cross-source duplicates are zero** in this corpus — the five sources cover
  disjoint jurisdictions, so nothing appears twice. The merge logic is tested
  against fixtures that do duplicate; the live zero is a fact about coverage,
  not about the engine.
- **Corpus size is the scaling blocker.** `opportunities.json` is ~16 MB and
  git stores every revision. Snapshots (43 MB) are gitignored for this reason.
  Five sources fit; twenty-five would not. See below.

---

## Phase 2 — what changed, and what it proved

Three sources added (TenderNed, BOAMP, South Africa eTenders), taking the pilot
to **eight**. Two of the three were chosen against v1's own findings rather
than for coverage.

### The corpus format was the blocker, and it was mostly key names

v1 stored 15.5 MB for 7,579 records — 2,146 bytes each — and named that the
scaling blocker. Measuring where the bytes went made the fix obvious: only
~10.6 MB was field content. The remaining ~5 MB was JSON KEY NAMES, thirty-five
of them repeated per record.

The corpus is now **columnar**: field names once, values in fixed-position
rows. Three derivable things are no longer stored at all — timestamps keep only
the raw source string (`iso` and `precision` are recomputed by a pure
function), classifications keep only `SCHEME:code`, and a single occurrence is
reconstituted from the record's own source fields rather than written twice.

**2,146 → ~1,100 bytes per record.** Twenty-five sources are now plausible where
five were the practical limit. The lever that keeps it that way is a tight
window per source, so more sources buy geographic coverage rather than
proportionally more records.

The format refuses to encode a record carrying a field it has no column for.
That guard exists because the first version lost `publishedEuWide` silently:
two adapters emitted it, the column list did not have it, and it vanished
without a word. It was in fact dropped **twice** — the dedup field list
discarded it before the encoder ever saw it.

### Cross-source duplicates are real now

v1 reported zero, honestly, because its five sources covered disjoint
jurisdictions. TenderNed and BOAMP both publish a flag saying a notice also
went to the Official Journal, so they overlap TED deliberately.

First run: **11 merges**. That was too few, and the reason was instructive.
TED does not publish the buyer's title — it publishes
`"France – Insurance services – <the buyer's title>"`, where the first two
segments are generated by the Publications Office. Comparing that against the
national portal's title compares French against French-plus-two-English-words,
and Jaccard fell to 0.62–0.84, under the merge threshold.

Stripping that known machine-generated prefix **for comparison only** — the
stored title is untouched, the threshold is untouched — took merges from 11 to
**139**. All 139 are BOAMP↔TED, all carry the source's own EU-wide flag, and
all share a buyer.

### A defect that predated Phase 2

Widening the merge surfaced a bug v1 shipped: same-source merging on a shared
official reference was collapsing **framework lots**. "NFCC National
Firefighter PPE - Lot 6 (Footwear)" merged into "Lot 8 (Cleaning and
Maintenance)" — separately biddable contracts, one hidden from every supplier.
Nine groups were affected.

A shared reference identifies the PROCEDURE, not the notice, and frameworks
publish one notice per lot and per call-off under one reference. Same-source
merging now requires the titles to agree as well. Identical republication
still merges — the World Bank issues one Request for Bids under a dozen notice
ids with the same description — while lots stay separate at similarity ~0.33.
**Nine bad merges → zero.**

### The OCDS adapter is now a factory

South Africa is built from a shared OCDS adapter parameterised by endpoint,
paging dialect and country, not from a copied file. Moldova, Paraguay, Uganda,
Kenya and Georgia emit the same format; the next one is a configuration block.

The UK adapter is deliberately NOT migrated onto it. UK FTS reads several
fields the generic mapping does not — electronic-submission policy, framework
technique, submission route — and rewriting a working, tested adapter to prove
a point about reuse is how a refactor becomes an outage.

## Phase 3 — source expansion and refresh

Covered in full in `TENDER-OPPORTUNITY-PHASE3.md`. In short: 65 further
candidates probed, **one** new active source (UK Contracts Finder), one
adapter-ready but blocked on a missing platform record (Germany), a refresh
orchestrator with per-source health and failure isolation, and a measured
storage decision to **keep Git** through roughly 25 sources.

The phase's main result is a finding rather than a feature: **9 active sources
from ~100 probed candidates.** The ceiling on this product is the supply of
machine-accessible official procurement data, not the architecture.

## Scaling

**To 25 sources** — now plausible on both counts. The storage blocker is
addressed (2× the sources at ~half the bytes per record), and the OCDS factory
makes same-format publishers cheap. The remaining cost is per-source
governance: probing access, reading terms, and mapping a status vocabulary.

**To 50** — needs a scheduled runner and, probably, a storage substrate that is
not git. Compaction bought roughly one order of magnitude of headroom, not two.

**To 100+, or all 382 platforms** — not reachable on this access model, and the
reason is not engineering effort. Of the fourteen candidates probed for this
pilot, five qualified. The blockers, by class:

| Class | Observed |
|---|---|
| No API, HTML only | NZ GETS, UNGM |
| Bot protection / WAF | AusTender, ADB, EBRD ECEPP |
| API key required | SAM.gov |
| Wrong entity published | Singapore GeBIZ (awards, not notices) |
| Access pattern impractical | Prozorro (one request per notice) |
| Terms unclear | World Bank (ingested, storage tightened) |
| Host unreachable from here | Greece, Uganda, Nigeria, Mexico *(not a capability judgement)* |
| Documented path returns 404 | Portugal, Ireland, Lithuania, Estonia, Denmark, Philippines, Albania |
| Wrong dataset published | Italy ANAC (awards and contracts, not open notices) |

Across both rounds, **8 of 35 probed candidates qualified — 23%**, on the most
prominent and best-documented procurement systems in the world. The tail will
be worse, not better. Any plan that assumes 382 ingestible sources is assuming
away the finding this pilot exists to produce.

The realistic ceiling for this access model is **15–25 sources**. Getting there
means the remaining OCDS publishers (cheap, via the factory), the EU national
portals whose paths need re-probing from a different network, and SAM.gov once
a key exists. Not 382, and not by scraping.
