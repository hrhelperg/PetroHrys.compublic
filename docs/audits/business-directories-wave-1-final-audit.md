# Wave 1 — government registries final coverage audit

Read-only audit, 2026-08-05, against production HEAD `342ff8d`
(PR #26, Wave 1C-3 United Kingdom). No registry data, generated page, schema or
UI was modified.

Companions: [country matrix](business-directories-wave-1-country-matrix.md) ·
[backlog audit](business-directories-wave-1-backlog-audit.md).

---

## 1. Production baseline (recomputed, not carried over)

| Measure | Value |
|---|--:|
| Published records | 189 |
| — of which government-category | **120** |
| — of which non-government (`global`) | 69 |
| Generated pages | 258 |
| Sitemap URLs | 258 |
| RSS items | 189 |
| Records displaying a Domain Rating | 66 |
| Distinct historical measurements | **64** |
| Per-domain snapshot digest | `aa7e6984…19847a4e` |
| Build/validate/migrate network or credential dependencies | 0 |
| Tests | 758 pass, 0 fail |

Validator exit 0; migration idempotent; generator dry-run clean; working tree
unchanged throughout.

## 2. The headline finding

**Wave 1 is not complete.** The record count target was met; the geographic
target was not.

Of the 13 declared Wave 1 geographies, **4 carry real coverage** (US, UK, Canada,
Australia = 127 records), **6 are thin legacy stubs** (continental Europe = 9
records total), and **3 have zero records** (EU, China, Japan).

Put plainly: **127 of the 136 country-attached records — 93% — are in four
English-speaking common-law jurisdictions.** The project today is a
US/UK/Canada/Australia government-registry asset with nine European placeholders
attached, not yet a global government-registry database.

## 3. Structural defects in the continental European records — **the most serious finding**

All nine European records predate the Wave 1 quality contract. Four of them do
not merely lack fields; **they misidentify the legal source of record.** This is
the exact error class the dataset's own standards were written to prevent, and
it is currently published.

### 3.1 Germany — `de-registerportal` — **critical**

The record makes handelsregister.de the constitutive company register. It is not.

- **HGB § 8(1):** the Handelsregister is kept electronically *by the courts*.
- **HRV § 1:** each Amtsgericht at a Landgericht seat keeps the register for that
  district.
- **HGB § 9(1):** the Länder justice administrations *designate the electronic
  information and communication system* through which register data is retrieved,
  and may designate a joint cross-state system.

So the legal registers sit with the Registergerichte; handelsregister.de is the
designated **access** system. The record's own description compounds the error by
calling it an aggregator — wrong in the opposite direction, since official
printouts and court certifications run through it under HGB § 9(3)–(4).

It also understates scope: the portal covers Handels-, Genossenschafts-,
Partnerschafts-, **Gesellschafts-** and Vereinsregister, plus
Registerbekanntmachungen. The Gesellschaftsregister (eGbR, live 1 January 2024)
and the Bekanntmachungen are both missing from the description.

### 3.2 France — `fr-annuaire-entreprises` — **critical**

Treated as a source of record. It is a DINUM-operated *consultation interface*
over registers held elsewhere (INSEE Sirene, INPI and others). INSEE, the
operator of the underlying Sirene register, says so on its own pages.

`fr-inpi` separately carries **three registry types on one record** —
`company-register` + `trademark-register` + `patent-register`. INPI does run the
Registre National des Entreprises *and* the trade mark and patent registers, but
these are different registers with different search systems and should be
separate records. `publicAccess` is null.

### 3.3 Spain — `es-registradores` — **critical**

The record makes the **Colegio de Registradores** the company register. Its own
Estatutos describe it as a *corporación de derecho público* — the professional
body of registrars. The company register is the Registro Mercantil.

It further claims two registry types operated by other bodies:
- `insolvency-register` — RD 892/2013 art. 2.2 places the Registro Público
  Concursal under the Ministry of Justice.
- `beneficial-ownership-register` — likewise not the Colegio's register.

**Spain currently has no record for its actual company register.**

### 3.4 Italy — `it-registro-imprese` — **major**

`operator.name` is *"InfoCamere, with the Italian Chambers of Commerce"* with
`operator.type: "other"`. Registro Imprese is held by the Chambers of Commerce
under law; InfoCamere is their IT consortium. The operator attribution inverts
the relationship.

### 3.5 Field-level legacy gaps across all nine

| Gap | Records affected |
|---|---|
| `publicAccess` entirely null | 5 — `de-registerportal`, `de-bundesanzeiger`, `fr-inpi`, `es-registradores`, `it-registro-imprese` |
| `operator.officialUrl` null | 9 of 9 |
| `publicAccess.searchUrl` null | 9 of 9 |
| No `bestFor` and no `notRecommendedFor` | 5 |
| `englishNameSource` null despite `nativeName` set | 8 of 9 |

## 4. Confirmed publication-truth defects

A repository-wide scan of all 189 records across every reader-facing field
produced 823 raw hits. **811 were false positives** and are recorded as such:
the "sentence does not end as a sentence" probe fires on the legacy `global`
bullet-fragment style, and the overclaim probe matched across clause boundaries
in careful sentences of the form *"proves X; it is **not** proof of Y."*

Confirmed defects after reading every candidate:

| # | Record | Field | Defect | Severity |
|---|---|---|---|---|
| 1 | `de-registerportal` | description, primaryRegistryType | Access portal presented as the constitutive register | **critical** |
| 2 | `fr-annuaire-entreprises` | description, registryTypes | Consultation interface presented as source of record | **critical** |
| 3 | `es-registradores` | name, primaryRegistryType, registryTypes | Professional body presented as the register; claims two registers operated by other bodies | **critical** |
| 4 | `it-registro-imprese` | operator.name, operator.type | Operator misattributed to the IT consortium | **major** |
| 5 | `us-georgia-business-search` | operator.name | Contains a **named incumbent officeholder** ("Brad Raffensperger"). Will go stale on the next election and a person's name does not belong in an operator field | **major** |
| 6 | `de-registerportal` | editorNotes | References a field `paid` that does not exist in the schema | **minor** |

Nothing in the scan found: truncated published prose, raw HTML, HTTP status codes
in prose, schema vocabulary leaking to readers, literal dataset counts, stale
Domain Rating wording, page-level interpretation of domain metrics, or a
procurement system described as a supplier register.

**None of these defects was fixed in this audit**, per the brief.

## 5. Registry type coverage (21 types)

| Observation | Detail |
|---|---|
| Types with ≥1 record | 20 of 21 |
| Zero-record types | **1** — `registered-design-register` |
| Enum ↔ glossary parity | 21 ↔ 21, every type has label, definition, inclusion, boundary, examples |
| Most used | `business-entity-register` 65 records (54% of government records) |
| Second | `public-filing-database` 42 records (26%) |

**`registered-design-register` is a justified zero.** It was added in Wave 1C-3
for a verified future need — UKIPO designs, and now EUIPO and J-PlatPat — and
withholding a record because the UKIPO search is captcha-blocked is correct
behaviour, not an omission.

**`business-entity-register` is at risk of overuse.** At 54% it is doing work
that `company-register` should sometimes do. Ten records carry *both* types
(nine Canadian provincial registries plus ASIC), which is defensible where a
register genuinely spans companies and other entity kinds, but the boundary
should be re-read before the next wave rather than after.

**`procurement-supplier-register` has exactly 1 record** and `cross-border-registry-interface`
exactly 1. Both are correctly narrow, and the Wave 1C-3 decision to create
`public-procurement-notice-database` rather than stretch the supplier type is
vindicated by the 5 records now on it.

## 6. Data completeness (120 government records)

| Field | Populated | % |
|---|--:|--:|
| operator, primaryRegistryType, registryTypes, verification source/date/reviewer, submissionModel, pros, cons | 120 | 100% |
| `publicAccess` object present | 115 | 96% |
| bestFor / notRecommendedFor | 112 | 93% |
| `publicAccess.searchUrl` | 93 | 78% |
| `accessLevel` other than `unknown` | 94 | 78% |
| `freeToSearch` non-null | 91 | 76% |
| any relation | 66 | 55% |
| `paidDocumentsAvailable` non-null | 52 | 43% |
| **`operator.officialUrl`** | **36** | **30%** |
| `domainRating` | 15 | 13% |
| `nativeName` | 12 | 10% |
| `englishNameSource` | 9 | 8% |

**Honest nulls that should stay null:** `domainRating` (collection frozen),
`nativeName` and `englishNameSource` on English-language jurisdictions,
`accessLevel: unknown` where a host was never exercised, `freeToSearch` where a
fee position was never observed. Blanket backfill of these would fabricate.

**Genuine gaps worth closing:** `operator.officialUrl` at 30% is the single
largest structural hole and is cheap to close from sources already cited in
`editorNotes`. Relations at 55% weakens cross-referencing.

## 7. UX and information architecture

258 pages: 1 hub, 12 country, 26 category, 189 detail, 30 guides.

| Country page | Size | Records |
|---|--:|--:|
| United States | 137.3 KB | 74 |
| Global | 71.9 KB | 53 |
| United Kingdom | 47.4 KB | 24 |
| Canada | 35.6 KB | 16 |
| Australia | 34.3 KB | 13 |
| Poland / France / Germany | ~18 KB | 2 each |
| Czech Republic / Italy / Spain | ~17 KB | 1 each |

- **No pages exist for China, Japan or the European Union**, and the hub does not
  link them. This is correct behaviour — generating an empty country page would
  advertise a 404 — but it means three declared geographies are invisible.
- **Six country pages carry 1–2 records** at ~17–18 KB of shell each. They are
  not defects, but they are the thinnest surfaces in the section.
- **The US page at 137 KB** is by far the largest and is the one page where size
  may eventually warrant attention.
- **Browse dimensions available today:** country (routes), registry type, score,
  access, and free-text — all through on-page filters. Jurisdiction is a *group*
  on country pages but not a browse route, which the jurisdiction model
  deliberately specifies. **No new route family is recommended**; the evidence
  does not show a gap the current model fails to serve.
- **Guide coverage is the real IA weakness:** 68 detail pages link to a guide,
  **121 carry "No guide covers this directory yet."** Nearly two thirds of detail
  pages have no editorial cross-link.

## 8. SEO and indexability

All clean: sitemap equals the indexable set (258 = 258, 0 `noindex`); RSS carries
every published record; every page has an absolute canonical on the apex host;
258 JSON-LD blocks parse with no `AggregateRating`, `Review`, `Product` or
`SearchAction`; titles and meta descriptions unique; 14,758 internal links, 0
broken; every generated page owned by the build manifest.

No page is recommended for a state change. The thin country pages are indexable
and correctly so — each carries verified records.

## 9. Open-source data policy

Fully intact. No build-time network call, no credential or env dependency, the
measurement utility remains retired behind an explicit override, **64 historical
measurements** unchanged, single provider, all `historicalSnapshot`, no
measurement dated after the 2026-08-04 freeze, no shared-domain inconsistency,
and no public wording suggesting live data.

Shared-domain reuse is working exactly as designed: **66 records display a rating
drawn from 64 measurements**, and the per-domain digest is unchanged.

## 10. Strategic verdict

**1. Is Wave 1 complete?** No. Complete in count, incomplete in geography.

**2. Meaningfully complete:** United States, United Kingdom. Both have federal
plus subnational depth, jurisdiction manifests, and blocker-coded backlogs.

**3. Substantially complete but with named holes:** Canada (no charity coverage;
4 subdivisions outstanding, one permanently), Australia (NSW missing; no
procurement or insolvency coverage).

**4. Thin:** Germany, France, Spain, Italy, Poland, Czech Republic — 9 records
between them, four of which misidentify the source of record.

**5. Not started:** European Union, Japan. **Research-blocked:** China.

**6. Minimum before Telecommunications:** the four source-of-record defects must
be corrected. They are published, false, and concern the most authoritative
registries in four G7 economies. Everything else can be scheduled.

**7. Highest authority gain per verified record:** Poland KRS, Germany
Unternehmensregister and Transparenzregister, Spain Registro Mercantil Central,
Japan NTA Corporate Number site, EUIPO eSearch plus. All are principal national
or supranational registers, all reachable, all low difficulty.

**8. Highest-priority pending candidates:** CRA List of Charities, FINTRAC MSB,
NSW incorporated associations, UKIPO trade marks, CNMI (blocker likely obsolete).

**9. Is the 150–250 target achieved in count but not breadth?** Yes, precisely.
189 records against a 150–250 target, but 93% of country-attached records in four
jurisdictions.

**10. What is this project today?** A **high-quality US/UK/Canada/Australia
government-registry database** with strong methodology, honest blocker handling
and an unusually rigorous truth contract — plus nine European legacy records that
do not meet that contract. It is not yet a global government-registry database,
and the gap is geographic, not qualitative.

## 11. Recommended completion plan

Only phases the audit justifies. Ordered by ratio of authority gained to risk.

### Wave 1D — European legacy correction *(mandatory before Wave 2)*
- **Records:** ~9 corrected, 0 new. **Countries:** DE, FR, ES, IT.
- **Work:** fix the four source-of-record defects; split `fr-inpi` into RNE plus
  IP records; correct the Italian operator; re-file `de-registerportal` as an
  access system; remove Spain's unsupported insolvency and beneficial-ownership
  type claims; fix `us-georgia-business-search` operator name.
- **Difficulty:** low — every fact is already evidenced in this audit.
- **Schema needs:** none. **Blockers:** none.
- **Stop criteria:** no record presents an access portal, consultation interface
  or professional body as a legal source of record.

### Wave 1E — Continental Europe core registries
- **Records:** 25–35. **Countries:** PL, CZ, DE, FR, ES, IT.
- **Priorities:** KRS, ARES, ISIR, Unternehmensregister, Transparenzregister,
  DPMAregister, RNE, Sirene, BODACC, Registro Mercantil Central, BORME, OEPM.
- **Difficulty:** low–medium; most reachable. **Schema needs:** none.
- **Authority gain:** highest available. **Stop criteria:** every one of the six
  countries has its principal company register plus at least one of IP,
  insolvency or beneficial ownership.

### Wave 1F — European Union
- **Records:** 8–12. **Priorities:** EUIPO eSearch plus (fills the zero-record
  `registered-design-register`), TED, BRIS, VIES, EBA/ESMA, EDES.
- **Difficulty:** low. **Schema needs:** none — `supranational` scope,
  `cross-border-registry-interface` and the procurement type all exist.
- **Caveat:** BRIS must be filed as an interface, never as a source of record;
  the EPO is not an EU institution.

### Wave 1G — Japan
- **Records:** 5–7. **Start with** the NTA Corporate Number site
  (`englishNameSource: "official"`), then EDINET, the FSA register, the invoice
  issuer site, then J-PlatPat.
- **Difficulty:** low–medium. **Blockers:** `登記情報提供サービス` is fee-only with
  no free search route, which **exposes a genuine gap in `ACCESS_LEVELS`** —
  neither `partially-open` nor `restricted` is honest. Settle that editorially
  *before* authoring it. `gBizINFO` has no honest type and should be left alone.
- **Verify CJK handling** in sorting and SEO length budgets before the first
  record; the schema fields exist but no record carries CJK today.

### Wave 1H — blocked and manual-verification completion
- **Records:** 10–18. US pending states and territories, Canada NB/PE/YT, CRA and
  FINTRAC, NSW, UKIPO, Law Society of Scotland.
- **Difficulty:** low per item, but requires a real browser — this is the phase
  that cannot be done from this environment.
- **Start with CNMI**, whose blocker now appears obsolete.

### Deferred — China
Hold. Five of six principal systems are unreachable to non-browser clients. Do
not author from secondary sources. Revisit only when a browser-based verification
route exists. Note the audit found a live territorial hazard to settle first:
`CN-TW` is admitted by the ISO allowlist as a province, and there is no
jurisdiction type for the Hong Kong and Macao SARs despite `CN-HK` and `CN-MO`
being present.

### Deferred — guide coverage
121 of 189 detail pages have no guide link. Real, but editorial rather than
factual, and safely deferred.

## 12. Audit method note

Six parallel research agents audited continental Europe, the EU, China and Japan
against official sources. Two further agents — the repository-wide truth scan and
the UX/SEO audit — **failed on a monthly spend limit** and were re-run directly
by the auditor; their sections above are complete and computed locally, not
estimated.
