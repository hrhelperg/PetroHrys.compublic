# Wave 1C-3 — United Kingdom government registries

Released 2026-08-05. Continues production from `499cdc1` (Wave 1C-2, Canada).
United Kingdom only. No other country, no Wave 2.

## What shipped

Twenty-one new UK records plus one territorial correction, taking the dataset
from **167 to 189** records and the United Kingdom from **3 to 24**. Canada also
gains one record, and two central registry types were added.

| Group | Count | Records |
|---|---|---|
| **UK-wide** | 8 | Companies House Register\* · Financial Services Register\* · NMC Register · GDC Registers · HCPC Register · Food Hygiene Ratings · Find a Tender · Disqualified Directors Register |
| **Constituent countries** | 11 | Care Quality Commission\*† (England) · Scottish Charity Register · Register of Insolvencies (Scotland) · Healthcare Improvement Scotland · Care Inspectorate (Scotland) · Care Inspectorate Wales · Register of Charities (Northern Ireland) · IVA Register (Northern Ireland) · RQIA Register of Services · Public Contracts Scotland · Sell2Wales |
| **Cross-territory** | 5 | Register of Charities (England and Wales) · Individual Insolvency Register (England and Wales) · Solicitors Register · The Barristers' Register · Contracts Finder (England, Wales and Northern Ireland) |

\* pre-existing † territorially corrected by this wave

All four constituent territories are reached: England by 6 records, Scotland by
5, Wales by 7, Northern Ireland by 4.

## The correction: CQC was published as UK-wide and is England-only

`gb-cqc` carried `scope: "national"` with no jurisdiction, which asserts
United Kingdom-wide reach. GOV.UK states that the Care Quality Commission
"regulates all health and social care services in **England**".

The record is now `subnational` under `GB-ENG`. Only the territorial fields
changed — verification date, score, Domain Rating and provenance are untouched,
and a test pins each of them. The correction is recorded in the record's own
`editorNotes` rather than made silently.

This mattered beyond one record. An England-only regulator filed as UK-wide sat
beside genuinely UK-wide registers, and it hid the fact that Scotland, Wales and
Northern Ireland have their own regulators — which this wave publishes.

## Territorial truth is the whole point of this wave

Great Britain is **not** the United Kingdom: it excludes Northern Ireland. A
Great Britain system is a cross-territory jurisdiction covering England,
Scotland and Wales. England and Wales has **no ISO 3166-2 code of its own** and
is modelled with `covers: ["GB-ENG", "GB-WLS"]`.

No deprecated or invented compound identifier is used anywhere: `GB-EAW`,
`GB-GBN`, `GB-UKM`, `GB-CHC`, `GB-COH`, `GB-NIC` and `GB-CYM` are each still
rejected by the allowlist, and a test asserts none appears as an identifier or
in reader-facing prose on any record or page. The one place `GB-EAW` is written
down is an `editorNotes` line explaining why it is *not* used — deleting that
would remove the warning along with the error.

**Five care and health regulators, five records.** CQC (England), Healthcare
Improvement Scotland (independent healthcare in Scotland), the Care Inspectorate
(care services in Scotland), Care Inspectorate Wales and RQIA (Northern Ireland)
regulate different populations in different territories. The two Scottish bodies
each state in published prose that they are not the other. A test asserts all
five exist on five distinct hosts with the right five territories.

**Three charity regulators, three records.** England and Wales
(cross-territory), Scotland, Northern Ireland — each stating which territories
it does not cover, so a reader cannot take one for all three.

## What did not ship

Ten candidates remain unpublished. Full detail with verification steps is in the
[verification backlog](../business-directories-verification-backlog.md).

### The classification blocker is resolved

The four procurement systems held back in the first pass are **now published**.
The blocker was never the research — it was that no registry type described them
honestly. Two central types were added:

**`public-procurement-notice-database`** — an official system publishing
procurement opportunities, tender notices, award notices or contract data. Its
boundary is explicit: a `procurement-supplier-register` records **who may bid**;
this type records **what is being bought**. Calling one the other inverts the
meaning, and every record of this type states that publication says nothing
about a supplier's eligibility, standing or trustworthiness.

**`registered-design-register`** — a design right protects appearance, a trade
mark a brand indicator, a patent a technical invention. The type was added on
its merits and **currently has no records**, because the UKIPO designs search
sits behind a captcha. A type with no records is correct; a record forced into
the wrong type would not be.

Two corrections came out of revalidating the procurement systems:

- **Find a Tender is no longer "high value only".** From 24 February 2025 it
  publishes below-threshold notices too, except below-threshold in Scotland. The
  GOV.UK guidance page still carries the old "usually above £139,688" framing
  and is stale; the service's own pages were treated as authoritative and the
  stale figure is not repeated.
- **Contracts Finder is neither UK-wide nor England-only.** Its territory comes
  from the extent of the Public Contracts Regulations 2015 — England, Wales and
  Northern Ireland, excluding Scotland, with devolved Welsh and Northern Irish
  authorities out of scope. It is filed as a cross-territory jurisdiction
  covering GB-ENG, GB-NIR and GB-WLS.

**CanadaBuys is re-evaluated and published.** The Wave 1C-2 rejection was right
under the vocabulary then available. The reversal is classification-only, the
editorial standard is unchanged, and the record still says plainly that it is
not a supplier register. Its `editorNotes` records the reversal and its ground,
and a test asserts that note survives.

**The Companies House disqualified directors register is published** through the
`resourceIdentity` shared-host mechanism — a genuinely distinct statutory
population sharing one official host with the company register, with its own
`systemKey`, the shared group `companies-house-service`, and the domain's
existing frozen Domain Rating snapshot reused verbatim. It states that absence
does not prove a person was never disqualified, that inclusion does not describe
every restriction, and that company registration and director disqualification
are separate systems.

### Blocked, rejected and deduplicated

- **Pending** — IPO trade marks, patents and registered designs (all HTTP 403
  behind captcha interstitials), Law Society of Scotland (Cloudflare block), and
  the Northern Ireland DRO and BRO register (client-side shell).
- **Rejected** — three "find a solicitor" directories whose own operators state
  they are not registers and list only those who opt in; the Insolvency Service
  three-month disqualification outcomes page, which the Service itself says is
  not a complete record; and the Faculty of Advocates, an independent
  professional body rather than a public-law one.
- **Not published as a separate record** — the Food Hygiene Information Scheme.
  Scotland's scheme is real, but the Food Standards Scotland page for it is
  *guidance*, not a register; Scottish results are served through the published
  `ratings.food.gov.uk`. Publishing the guidance page would have repeated the
  FINTRAC error caught in Wave 1C-2.
- **Duplicates** — the CQC provider register collides with the published CQC
  record. The Companies House disqualified-directors search also shared a host,
  and was the one case where that was resolved rather than deferred: it is now
  published through `resourceIdentity`.

## Domain Rating

No new measurement anywhere in this wave. Twenty of the twenty-one new UK
records and the one new Canadian record carry `domainRating: null` and
`metricStatus: "unknown"`, because none of their hosts has ever been measured.

The single exception is the disqualified directors register, which sits on the
**same measured domain** as the already-published company register and therefore
**reuses that domain's stored snapshot verbatim** — 92, Ahrefs, 2026-08-04,
`historicalSnapshot`. Repeating a stored reading measures nothing. The
per-domain snapshot digest is unchanged at `aa7e6984…19847a4e` over **64**
measurements; what grew is the number of records displaying one, 65 → 66.

## Research method and what adversarial review changed

Twenty-eight agents researched and adversarially cross-examined candidates
against official sources, then every publishable claim was re-verified directly.
That second pass mattered: **seven of twenty-one verified candidates had at
least one quote that was not verbatim on the page cited** — truncated sentences
presented as complete, added punctuation, or text assembled from separate DOM
nodes. Two more overstated what had actually been observed about access.

The response was not to correct the quotes but to **stop publishing quotes that
were not personally verified**. Where a record now quotes a source, the wording
was read on the page during authoring. Most published prose paraphrases verified
facts instead.

## Verification

Validator exit 0 · second migration rewrote 0 · second build wrote 0 and pruned 0
· **743 tests pass, 0 fail** (716 before; 27 UK assertions added and one
`covers` guard corrected) · **12 injected defects all caught** · 14,423 internal
links, 0 broken · sitemap equals the indexable set (252 = 252, 0 `noindex`) ·
RSS carries every published record · 252 JSON-LD blocks parse with no
`AggregateRating`, `Review`, `Product` or `SearchAction` · every page has a
unique title and meta description, an absolute canonical, and manifest ownership
· no network or credential dependency · UK page renders 6 / 9 / 4 = 19 in the
required group order, all rows served without JavaScript, every `bd-` class
styled, every jump link resolving.

### The `covers` guard, corrected not weakened

`bd-uk-territories.test.cjs` asserted that no file on disk serialises `covers`.
That was true only while the dataset contained zero cross-territory records —
its own comment shows the real intent was that a **null** covers must not be
written out. It now asserts the actual rule: `covers` appears only on
cross-territory jurisdictions, sorted, with at least two entries and no `code`,
and never on a single-subdivision jurisdiction. It also fails if the
cross-territory records ever disappear, so it cannot become vacuous.
