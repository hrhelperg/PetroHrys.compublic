# Wave 1C-3 — United Kingdom government registries

Released 2026-08-05. Continues production from `499cdc1` (Wave 1C-2, Canada).
United Kingdom only. No other country, no Wave 2.

## What shipped

Sixteen new UK records plus one territorial correction, taking the dataset from
**167 to 183** records and the United Kingdom from **3 to 19**.

| Group | Count | Records |
|---|---|---|
| **UK-wide** | 6 | Companies House Register\* · Financial Services Register\* · NMC Register · GDC Registers · HCPC Register · Food Hygiene Ratings |
| **Constituent countries** | 9 | Care Quality Commission\*† (England) · Scottish Charity Register · Register of Insolvencies (Scotland) · Healthcare Improvement Scotland · Care Inspectorate (Scotland) · Care Inspectorate Wales · Register of Charities (Northern Ireland) · IVA Register (Northern Ireland) · RQIA Register of Services |
| **Cross-territory** | 4 | Register of Charities (England and Wales) · Individual Insolvency Register (England and Wales) · Solicitors Register · The Barristers' Register |

\* pre-existing † territorially corrected by this wave

All four constituent territories are reached: England by 5 records, Scotland by
4, Wales by 5, Northern Ireland by 3.

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

Sixteen candidates were researched and not published. Full detail with
verification steps is in the
[verification backlog](../business-directories-verification-backlog.md).

### A classification blocker, reported rather than worked around

**Find a Tender, Contracts Finder, Public Contracts Scotland and Sell2Wales**
were researched to publication standard, including their territorial scopes:
Find a Tender is UK-wide for high-value contracts; Contracts Finder is
England-centred, with GOV.UK directing Scotland, Wales and Northern Ireland to
their own systems.

They were **not published, because no registry type fits honestly.** They
publish procurement *notices*, not suppliers. `procurement-supplier-register`
would state the opposite of what they are — a supplier register records who may
bid; these record what is being bought.

This is also a cross-wave consistency point: Wave 1C-2 rejected **CanadaBuys**
on exactly this ground. Publishing four UK equivalents while that rejection
stands would be incoherent. The decision needed is one of scope, not research:
either procurement notice systems are out of scope everywhere, or they need a
registry type that describes them honestly — and adding an enum value is an
architecture decision, not a wave decision.

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
- **Duplicates** — the Companies House disqualified-directors search and the CQC
  provider register both collide on already-published hosts.

## Domain Rating

No new measurement. No UK host matches an already-measured domain, so **every one
of the sixteen new records carries `domainRating: null`** and
`metricStatus: "unknown"`. The per-domain snapshot digest is unchanged at
`aa7e6984…19847a4e` over 64 measurements, with 65 records displaying one.

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
