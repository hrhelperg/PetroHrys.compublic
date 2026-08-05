# Registry type glossary

**Generated from `scripts/lib/bd-registry-types.cjs`. Do not hand-edit — regenerate.**

The registry type vocabulary is a **closed list of 26 values**. A record may carry
only values from this list, and the validator rejects anything else. Every value
below is used by at least one published record: an unused type would be a claim
about coverage the dataset does not have.

A type is worth having for what it **excludes**. Read the *Boundary* column
before classifying anything.

| # | Value | Label | Records | Added |
|--:|---|---|--:|---|
| 1 | `company-register` | Company register | 17 | 1 (initial) |
| 2 | `business-entity-register` | Business entity register | 67 | 1 (initial) |
| 3 | `sole-trader-register` | Sole trader register | 6 | 1 (initial) |
| 4 | `beneficial-ownership-register` | Beneficial ownership register | 4 | 1 (initial) |
| 5 | `securities-filing-database` | Securities filing database | 4 | 1 (initial) |
| 6 | `financial-services-register` | Financial services register | 14 | 1 (initial) |
| 7 | `professional-licence-register` | Professional licence register | 16 | 1 (initial) |
| 8 | `charity-register` | Charity register | 8 | 1 (initial) |
| 9 | `procurement-supplier-register` | Procurement supplier register | 1 | 1 (initial) |
| 10 | `tax-verification-system` | Tax verification system | 3 | 1 (initial) |
| 11 | `corporate-number-database` | Corporate number database | 9 | 1 (initial) |
| 12 | `trademark-register` | Trademark register | 8 | 1 (initial) |
| 13 | `patent-register` | Patent register | 6 | 1 (initial) |
| 14 | `insolvency-register` | Insolvency register | 8 | 1 (initial) |
| 15 | `regulated-operator-register` | Regulated operator register | 29 | 1 (initial) |
| 16 | `contractor-accreditation-register` | Contractor accreditation register | 2 | 1 (initial) |
| 17 | `public-filing-database` | Public filing database | 53 | 1 (initial) |
| 18 | `cross-border-registry-interface` | Cross-border registry interface | 4 | 1 (initial) |
| 19 | `exclusion-and-debarment-register` | Exclusion and debarment register | 8 | 1A |
| 20 | `public-procurement-notice-database` | Public procurement notice database | 7 | 1C-3 |
| 21 | `registered-design-register` | Registered designs register | 4 | 1C-3 |
| 22 | `clinical-trial-register` | Clinical trial register | 1 | 1F.1 |
| 23 | `geographical-indication-register` | Geographical indication register | 1 | 1F.1 |
| 24 | `sanctions-and-restrictive-measures-index` | Sanctions and restrictive measures index | 1 | 1F.1 |
| 25 | `sanctions-designation-list` | Sanctions designation list | 1 | 1F.1 |
| 26 | `plant-protection-product-authorisation-register` | Plant protection product authorisation register | 1 | 1F.1 |

## Definitions

### `company-register`

**Company register** · 17 records

The official register of incorporated companies, or the equivalent legal-entity register, for a jurisdiction. Entries are created by incorporation or an equivalent constitutive act.

**Include when:** The register is the jurisdiction's authoritative record of a company's existence, and its official documentation presents it as such.

**Boundary:** Not a business-entity-register, which spans entity kinds beyond companies. Not a public-filing-database, which exposes documents filed by entities whose legal register may be elsewhere. A system that only resolves identifiers is a corporate-number-database.

*Examples:* Companies House Register (United Kingdom); Registro Imprese (Italy)

### `business-entity-register`

**Business entity register** · 67 records

An official register covering several kinds of business entity — companies, partnerships, sole traders, branches, associations — rather than incorporated companies alone.

**Include when:** The official scope statement names more than one legal form.

**Boundary:** Narrower systems are a company-register or a sole-trader-register. Breadth is the distinguishing property, not size.

*Examples:* ABN Lookup (Australia); Baza Internetowa REGON (Poland)

### `sole-trader-register`

**Sole trader register** · 6 records

An official register of natural persons carrying on business in their own name.

**Include when:** The register's stated population is sole traders or the self-employed.

**Boundary:** Where companies register elsewhere, the two systems are separate records — CEIDG and the KRS are not one register.

*Examples:* Centralna Ewidencja i Informacja o Działalności Gospodarczej (Poland)

### `beneficial-ownership-register`

**Beneficial ownership register** · 4 records

A register recording the natural persons who ultimately own or control an entity.

**Include when:** The system holds beneficial-owner or ultimate-controller data as a distinct dataset.

**Boundary:** Public accessibility varies widely and is recorded in publicAccess, not implied by this type. Shareholder lists inside a company register are not automatically a beneficial ownership register.

*Examples:* Veřejný rejstřík a Sbírka listin (Czech Republic), beneficial-owner component

### `securities-filing-database`

**Securities filing database** · 4 records

A database of disclosures filed under securities law by issuers and related parties.

**Include when:** The filing obligation arises from securities regulation.

**Boundary:** Distinct from a company-register: it records disclosures, not the entity's existence. Also a public-filing-database, and usually recorded as both.

*Examples:* EDGAR (United States)

### `financial-services-register`

**Financial services register** · 14 records

A register of firms or individuals authorised, licensed or registered to carry on regulated financial activity.

**Include when:** Entries arise from a financial regulator's authorisation or registration process.

**Boundary:** A professional-licence-register covers individual professions generally; this type is specific to financial regulation. The operator need not be a government agency — a self-regulatory organisation qualifies.

*Examples:* Financial Services Register (United Kingdom); BrokerCheck (United States)

### `professional-licence-register`

**Professional licence register** · 16 records

A register of individuals licensed, registered or authorised to practise a regulated profession.

**Include when:** The register's population is individual practitioners and entry follows a licensing or registration decision.

**Boundary:** A register of firms is a regulated-operator-register or a contractor-accreditation-register. Membership of a voluntary association is neither.

*Examples:* Registers of authorised architects and engineers held by professional chambers

### `charity-register`

**Charity register** · 8 records

An official register of charities, non-profits or public-benefit organisations.

**Include when:** Registration confers or evidences charitable or public-benefit status.

**Boundary:** A general company register that happens to include non-profit legal forms is not a charity register.

*Examples:* National charity regulators' registers

### `procurement-supplier-register`

**Procurement supplier register** · 1 record

A register of suppliers registered, qualified or pre-qualified to bid for public contracts.

**Include when:** The register exists to support public procurement.

**Boundary:** A database of awarded contracts is not a supplier register. Pre-qualification schemes run by industry bodies are contractor-accreditation-registers.

*Examples:* National procurement supplier qualification systems

### `tax-verification-system`

**Tax verification system** · 3 records

An official service for confirming a tax or VAT registration status.

**Include when:** The system answers whether a given identifier is registered for a tax.

**Boundary:** Confirming a tax status is not the same as constituting the entity. A system that only resolves an identifier without a tax status is a corporate-number-database.

*Examples:* GST registration status within ABN Lookup (Australia)

### `corporate-number-database`

**Corporate number database** · 9 records

An official lookup that maps an entity to its assigned identifier and back.

**Include when:** The system's primary function is identifier resolution.

**Boundary:** An identifier database is NOT automatically the legal register of the entity. Where the identifier is issued by a statistical or tax body while incorporation happens elsewhere, record this type and not company-register.

*Examples:* REGON identifier lookup (Poland)

### `trademark-register`

**Trademark register** · 8 records

An official register of trademark applications and registrations.

**Include when:** The office maintaining it grants or records trademark rights for its jurisdiction.

**Boundary:** Separate from patent-register even where one office runs both; record both types.

*Examples:* USPTO Trademark Search (United States)

### `patent-register`

**Patent register** · 6 records

An official register of patent applications and granted patents.

**Include when:** The office maintaining it grants or records patent rights for its jurisdiction.

**Boundary:** Separate from trademark-register; see above.

*Examples:* National industrial-property office patent registers

### `insolvency-register`

**Insolvency register** · 8 records

An official register of insolvency, bankruptcy, administration or liquidation proceedings.

**Include when:** The system publishes insolvency proceedings or their outcomes as a distinct dataset.

**Boundary:** A company register that shows a dissolved status is not thereby an insolvency register; the register must hold proceedings.

*Examples:* Insolvency components of national court registers

### `regulated-operator-register`

**Regulated operator register** · 29 records

A register of organisations authorised, licensed or registered to operate in a regulated sector other than financial services.

**Include when:** Entry follows a sectoral regulator's authorisation or registration decision.

**Boundary:** Individuals belong in professional-licence-register. Financial firms belong in financial-services-register.

*Examples:* Care Quality Commission provider register (England)

### `contractor-accreditation-register`

**Contractor accreditation register** · 2 records

A register of contractors or firms accredited, certified or pre-qualified against a published standard.

**Include when:** Entry follows an assessment against stated criteria.

**Boundary:** Where accreditation is a legal precondition to operate, regulated-operator-register may fit better. Where it qualifies a firm to bid, procurement-supplier-register may.

*Examples:* Construction pre-qualification and accreditation schemes

### `public-filing-database`

**Public filing database** · 53 records

A database whose primary function is exposing documents or disclosures filed by entities, rather than constituting the entity's legal register.

**Include when:** The content is filed documents — accounts, notices, statements, announcements.

**Boundary:** May legitimately coexist with company-register where one system does both, but only where official evidence supports both functions. A register that merely displays fields from a form is not a filing database.

*Examples:* Bundesanzeiger (Germany); Filed accounts within Companies House (United Kingdom)

### `cross-border-registry-interface`

**Cross-border registry interface** · 4 records

A supranational or federated access layer that searches across registers held by several jurisdictions.

**Include when:** The system queries or aggregates underlying registers it does not itself constitute.

**Boundary:** It is NOT automatically the legal source of record — the underlying national registers usually remain authoritative, and the record must say so. Normally carries supranational or regional scope.

*Examples:* EU-level cross-register search interfaces

### `exclusion-and-debarment-register`

**Exclusion and debarment register** · 8 records · added in Wave 1A

An official system identifying persons, entities, providers, contractors or regulated participants that are excluded, debarred, sanctioned, suspended or otherwise restricted from specified government programmes, procurement, regulated activity or public participation.

**Include when:** An official operator publishes entity- or person-level searchable or structured data recording an exclusion, debarment, sanction, suspension or restriction, with current or explicitly historical status semantics, and the record has practical verification value.

**Boundary:** Not a procurement-supplier-register, which records eligible or registered suppliers — this type records the opposite. Not a generic enforcement-news archive, not a court database, and not automatically a financial-services-register merely because the sector is financial. Not every page listing sanctions qualifies: there must be a searchable or structured register, not a narrative announcement.

*Examples:* SAM.gov Exclusions (United States); HHS OIG List of Excluded Individuals and Entities

### `public-procurement-notice-database`

**Public procurement notice database** · 7 records · added in Wave 1C-3

An official system publishing procurement opportunities, tender notices, contract award notices, contract data, or other formal stages of public procurement.

**Include when:** An official government or statutory operator publishes structured or searchable procurement notices in which individual opportunities, notices, contracts or awards are identifiable, the system carries meaningful public research value, and its coverage is current or clearly labelled as historical.

**Boundary:** NOT a procurement-supplier-register: that type records suppliers who are registered or eligible, and this type records the procurement itself. Not merely a supplier-registration portal. Not a tender submission dashboard with no public notice access. Not a commercial tender aggregator. Not a generic government open-data portal. Not automatically a contract-management system. Publication of a notice says nothing about any supplier’s eligibility, standing or suitability.

*Examples:* Find a Tender (United Kingdom); Contracts Finder (England)

### `registered-design-register`

**Registered designs register** · 4 records · added in Wave 1C-3

An official register of registered industrial designs or comparable protected design rights.

**Include when:** An official intellectual-property authority records registered design rights, or applications for them where these are publicly searchable, and an individual right, its owner or applicant, and its status or filing information are identifiable.

**Boundary:** Not a trademark-register and not a patent-register: a design right protects appearance rather than a brand indicator or a technical invention, and the three are separate rights with separate registers. Not a copyright database, which generally records no registration at all. Not a generic public-filing-database. Not a design portfolio, showcase or marketplace, none of which confers a right.

*Examples:* Official national and regional registered-design registers

### `clinical-trial-register`

**Clinical trial register** · 1 record · added in Wave 1F.1

An official register of clinical trials, recording individual trials with their sponsor, status and the information the governing law requires to be made public.

**Include when:** The registered object is a clinical trial, and an official body publishes trial records under a legal obligation to do so.

**Boundary:** Deliberately narrow. It is NOT a general health, medicine, research or science database: a register of medicinal products, of medical devices, of research institutions or of publications is none of them a clinical trial register. It is also not automatically the source of the authorisation — where the trial is authorised by national authorities and the system publishes what was submitted, the record must say so.

*Examples:* EU Clinical Trials Information System

### `geographical-indication-register`

**Geographical indication register** · 1 record · added in Wave 1F.1

An official register of protected geographical indications, protected designations of origin and equivalent rights attaching to a product’s geographical origin.

**Include when:** An official authority registers or publishes rights whose subject matter is the geographical origin of a product.

**Boundary:** NOT a trademark-register: a geographical indication protects origin, not a trader’s brand indicator, and the two are separate rights with separate registers even where one office touches both. Not a registered-design-register. Where responsibility is split between authorities by product category, the record must say which authority registers what.

*Examples:* EU geographical indication search and registration systems

### `sanctions-and-restrictive-measures-index`

**Sanctions and restrictive measures index** · 1 record · added in Wave 1F.1

An official index of restrictive-measures regimes and the legal acts that constitute them, presented so a reader can navigate what measures exist and where they come from.

**Include when:** The indexed object is a REGIME or a legal act, not a designated person or entity.

**Boundary:** NOT a sanctions-designation-list: this type indexes the measures, that type lists the persons designated under them. NOT an exclusion-and-debarment-register, which records exclusion from a specific programme or procurement system under different law. A system of this type is almost never the authentic source: where the operator states that the authentic texts are the acts published in the official journal, the record must say so.

*Examples:* Official indexes of restrictive-measures regimes and their constituting acts

### `sanctions-designation-list`

**Sanctions designation list** · 1 record · added in Wave 1F.1

An official consolidated list of the natural and legal persons designated under an authority’s restrictive-measures or asset-freeze regime.

**Include when:** The listed object is a designated person or entity, published by the authority responsible for maintaining the consolidated list.

**Boundary:** NOT an exclusion-and-debarment-register: a designation under a restrictive-measures regime is a foreign-policy measure, not exclusion from a funding or procurement programme, and the two rest on different legal instruments. NOT a sanctions-and-restrictive-measures-index, which indexes regimes rather than persons. Absence from one authority’s list never proves a party is unrestricted under any other regime or in any other jurisdiction, and the record must say so.

*Examples:* Official consolidated financial sanctions lists

### `plant-protection-product-authorisation-register`

**Plant protection product authorisation register** · 1 record · added in Wave 1F.1

An official database of active substance approvals, plant protection product authorisations and related residue limits under plant-protection law.

**Include when:** The recorded object is a substance approval, a product authorisation or a residue limit granted under plant-protection or pesticides legislation.

**Boundary:** Deliberately narrow, and NOT a generic chemical or substance register: a chemicals registration database recording filings under chemicals law is a different system with a different legal basis and a different recorded object. Where the operator states that the database has no legal value and that the official information is published elsewhere, the record must carry that. Often part aggregator, because product authorisations are granted nationally.

*Examples:* EU pesticides and plant protection product databases
