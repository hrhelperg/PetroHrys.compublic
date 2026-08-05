# Wave 1C-3 — United Kingdom government registries: research log

Date of research: 2026-08-05. Researcher/reviewer: Petro Hrys.
Scope: United Kingdom only — UK-wide, constituent countries, cross-territory.

## Method

Thirty-two candidates were researched by twenty-eight agents working only from
GOV.UK, official devolved-government sites, statutory regulators, official
public registers and legislation. Twenty-one approved candidates then went
through an adversarial pass whose default was to refute, re-fetching the cited
pages. Everything published was finally re-verified directly before authoring.

### Host reachability

| Host | Result |
|---|---|
| `register-of-charities.charitycommission.gov.uk`, `www.oscr.org.uk`, `www.charitycommissionni.org.uk`, `www.nmc.org.uk`, `olr.gdc-uk.org`, `www.hcpc-uk.org`, `ratings.food.gov.uk`, `www.rqia.org.uk`, `www.careinspectorate.wales`, `www.healthcareimprovementscotland.scot`, `www.insolvencydirect.bis.gov.uk`, `roi.aib.gov.uk`, `www.sra.org.uk`, `www.barstandardsboard.org.uk`, `www.gov.uk` | reachable |
| `www.careinspectorate.scot` | reachable, but serves a beta client-rendered application |
| `trademarks.ipo.gov.uk`, `www.search-for-intellectual-property.service.gov.uk`, `www.registered-design.service.gov.uk` | HTTP 403 behind captcha / anti-data-mining interstitials |
| `www.lawscot.org.uk` | HTTP 403 behind a Cloudflare block page |
| `www.barristerregister.barstandardsboard.org.uk` | no response; the BSB page that serves the register was used instead |

## The finding that changed existing data

**The Care Quality Commission is England-only and was published as UK-wide.**
GOV.UK states the CQC "regulates all health and social care services in
England". The record carried `scope: "national"` with no jurisdiction. It is now
`GB-ENG`, with the correction recorded in its own `editorNotes`. Nothing else
about the record changed, and a test pins its date, score, Domain Rating and
provenance so the correction cannot be widened later into a rewrite.

This finding is what makes the rest of the wave coherent: once CQC is England,
the Scottish, Welsh and Northern Irish care regulators are visibly missing, and
this wave publishes all four.

## What adversarial review actually caught

The verify pass was not a formality. Of twenty-one verified candidates:

- **Seven had at least one non-verbatim quote.** Truncated sentences presented
  as complete with an added full stop; text assembled from three separate DOM
  nodes; punctuation that does not appear on the page; a legislation quote
  paraphrased from the section it cited.
- **Two overstated observed access.** One claimed every URL had been fetched
  successfully when the search itself had not been exercised; one attributed a
  CSV export to a `<link rel="alternate">` declaration that was not there.
- **One had a disputed territory.** Contracts Finder was proposed as
  England-exclusive; the verifier found non-England notices in the operator's
  own OCDS feed. Since the candidate was not published, the dispute is recorded
  rather than resolved.
- **Several had smaller factual slips** — a row count off by one against the
  published spreadsheet, a login link described as serving a function it does
  not, an insolvency rule paraphrased inaccurately.

**The response was structural, not cosmetic.** Rather than repairing each quote,
published prose now paraphrases verified facts, and any surviving quotation was
read on the page during authoring. This is the same lesson as Wave 1C-2's
Quebec correction, arriving at scale: a quote sourced from anything other than
the page in front of you is not evidence.

## Candidate outcomes

**Published (16).** Three charity registers (England and Wales as
cross-territory, Scotland, Northern Ireland); three UK-wide health professional
registers (NMC, GDC, HCPC); four care and health system regulators (Healthcare
Improvement Scotland, Care Inspectorate Scotland, Care Inspectorate Wales,
RQIA); three insolvency registers (England and Wales, Scotland, Northern Ireland
IVAs); two legal-profession registers (SRA, Bar Standards Board); and UK-wide
food hygiene ratings.

**Classification blocker (4).** Find a Tender, Contracts Finder, Public
Contracts Scotland, Sell2Wales — researched fully, publishable in every respect
except that no registry type describes a procurement notice system honestly.
Reported rather than forced, and explicitly tied to the CanadaBuys rejection in
Wave 1C-2 so the two waves stay consistent.

**Pending (5).** IPO trade marks, patents and registered designs; Law Society of
Scotland; Northern Ireland DRO and BRO register. All blocked by inaccessible
official evidence, none guessed at.

**Rejected (4).** Three "find a solicitor" directories whose operators state
they are not registers, and the Faculty of Advocates as not a public-law body.

**Duplicates (2).** Companies House disqualified directors and the CQC provider
register, both colliding on already-published hosts.

**Withheld as a category error (1).** The Food Hygiene Information Scheme page
is Food Standards Scotland *guidance*, not a register; Scottish results are
served through the published ratings service. Publishing it would have repeated
the FINTRAC mistake caught in the previous wave.

## Injected defects

Twelve deliberate defects were introduced and all twelve were caught: CQC
reverted to UK-wide; England and Wales given the deprecated `GB-EAW`; Northern
Ireland refiled as a country; `covers` left unsorted; a cross-territory
jurisdiction given both a code and covers; Great Britain made to include
Northern Ireland; the two Scottish care regulators merged onto one host; a new
record given a Domain Rating; RQIA given a search URL it does not have; an
unknown access posture hardened to a confident false; a record claiming
registration proves compliance; and a pre-existing Domain Rating snapshot
altered.
