// scripts/lib/bd-registry-types.cjs
'use strict';

// The single source of truth for what each registry type MEANS.
//
// Wave 1 classifies statutory and regulatory systems, and two reviewers already
// disagreed about company-register versus business-entity-register with nothing
// written down to settle it. Fifty US state records would have made that choice
// fifty times, inconsistently. So each type carries an operational definition, a
// test for inclusion, and — more useful in practice — the boundary that
// separates it from the type it is most often confused with.
//
// These are OPERATIONAL definitions, not legal ones. They describe what a system
// does, observably, from its own official documentation. Nothing here asserts
// the legal effect of an entry in any jurisdiction; that varies by country and
// is not ours to declare. Where a system genuinely performs several functions,
// record several types rather than forcing a single label.
//
// `examples` are illustrations of the reasoning, not rules. A record is
// classified from its own evidence, never by matching it against an example.

const REGISTRY_TYPE_DEFINITIONS = [
  {
    id: 'company-register',
    label: 'Company register',
    definition: 'The official register of incorporated companies, or the equivalent legal-entity '
      + 'register, for a jurisdiction. Entries are created by incorporation or an equivalent '
      + 'constitutive act.',
    inclusion: 'The register is the jurisdiction\'s authoritative record of a company\'s existence, '
      + 'and its official documentation presents it as such.',
    boundary: 'Not a business-entity-register, which spans entity kinds beyond companies. Not a '
      + 'public-filing-database, which exposes documents filed by entities whose legal register '
      + 'may be elsewhere. A system that only resolves identifiers is a corporate-number-database.',
    examples: ['Companies House Register (United Kingdom)', 'Registro Imprese (Italy)'],
  },
  {
    id: 'business-entity-register',
    label: 'Business entity register',
    definition: 'An official register covering several kinds of business entity — companies, '
      + 'partnerships, sole traders, branches, associations — rather than incorporated companies '
      + 'alone.',
    inclusion: 'The official scope statement names more than one legal form.',
    boundary: 'Narrower systems are a company-register or a sole-trader-register. Breadth is the '
      + 'distinguishing property, not size.',
    examples: ['ABN Lookup (Australia)', 'Baza Internetowa REGON (Poland)'],
  },
  {
    id: 'sole-trader-register',
    label: 'Sole trader register',
    definition: 'An official register of natural persons carrying on business in their own name.',
    inclusion: 'The register\'s stated population is sole traders or the self-employed.',
    boundary: 'Where companies register elsewhere, the two systems are separate records — CEIDG '
      + 'and the KRS are not one register.',
    examples: ['Centralna Ewidencja i Informacja o Działalności Gospodarczej (Poland)'],
  },
  {
    id: 'beneficial-ownership-register',
    label: 'Beneficial ownership register',
    definition: 'A register recording the natural persons who ultimately own or control an entity.',
    inclusion: 'The system holds beneficial-owner or ultimate-controller data as a distinct dataset.',
    boundary: 'Public accessibility varies widely and is recorded in publicAccess, not implied by '
      + 'this type. Shareholder lists inside a company register are not automatically a beneficial '
      + 'ownership register.',
    examples: ['Veřejný rejstřík a Sbírka listin (Czech Republic), beneficial-owner component'],
  },
  {
    id: 'securities-filing-database',
    label: 'Securities filing database',
    definition: 'A database of disclosures filed under securities law by issuers and related parties.',
    inclusion: 'The filing obligation arises from securities regulation.',
    boundary: 'Distinct from a company-register: it records disclosures, not the entity\'s '
      + 'existence. Also a public-filing-database, and usually recorded as both.',
    examples: ['EDGAR (United States)'],
  },
  {
    id: 'financial-services-register',
    label: 'Financial services register',
    definition: 'A register of firms or individuals authorised, licensed or registered to carry on '
      + 'regulated financial activity.',
    inclusion: 'Entries arise from a financial regulator\'s authorisation or registration process.',
    boundary: 'A professional-licence-register covers individual professions generally; this type '
      + 'is specific to financial regulation. The operator need not be a government agency — a '
      + 'self-regulatory organisation qualifies.',
    examples: ['Financial Services Register (United Kingdom)', 'BrokerCheck (United States)'],
  },
  {
    id: 'professional-licence-register',
    label: 'Professional licence register',
    definition: 'A register of individuals licensed, registered or authorised to practise a '
      + 'regulated profession.',
    inclusion: 'The register\'s population is individual practitioners and entry follows a '
      + 'licensing or registration decision.',
    boundary: 'A register of firms is a regulated-operator-register or a '
      + 'contractor-accreditation-register. Membership of a voluntary association is neither.',
    examples: ['Registers of authorised architects and engineers held by professional chambers'],
  },
  {
    id: 'charity-register',
    label: 'Charity register',
    definition: 'An official register of charities, non-profits or public-benefit organisations.',
    inclusion: 'Registration confers or evidences charitable or public-benefit status.',
    boundary: 'A general company register that happens to include non-profit legal forms is not a '
      + 'charity register.',
    examples: ['National charity regulators\' registers'],
  },
  {
    id: 'procurement-supplier-register',
    label: 'Procurement supplier register',
    definition: 'A register of suppliers registered, qualified or pre-qualified to bid for public '
      + 'contracts.',
    inclusion: 'The register exists to support public procurement.',
    boundary: 'A database of awarded contracts is not a supplier register. Pre-qualification '
      + 'schemes run by industry bodies are contractor-accreditation-registers.',
    examples: ['National procurement supplier qualification systems'],
  },
  {
    id: 'tax-verification-system',
    label: 'Tax verification system',
    definition: 'An official service for confirming a tax or VAT registration status.',
    inclusion: 'The system answers whether a given identifier is registered for a tax.',
    boundary: 'Confirming a tax status is not the same as constituting the entity. A system that '
      + 'only resolves an identifier without a tax status is a corporate-number-database.',
    examples: ['GST registration status within ABN Lookup (Australia)'],
  },
  {
    id: 'corporate-number-database',
    label: 'Corporate number database',
    definition: 'An official lookup that maps an entity to its assigned identifier and back.',
    inclusion: 'The system\'s primary function is identifier resolution.',
    boundary: 'An identifier database is NOT automatically the legal register of the entity. Where '
      + 'the identifier is issued by a statistical or tax body while incorporation happens '
      + 'elsewhere, record this type and not company-register.',
    examples: ['REGON identifier lookup (Poland)'],
  },
  {
    id: 'trademark-register',
    label: 'Trademark register',
    definition: 'An official register of trademark applications and registrations.',
    inclusion: 'The office maintaining it grants or records trademark rights for its jurisdiction.',
    boundary: 'Separate from patent-register even where one office runs both; record both types.',
    examples: ['USPTO Trademark Search (United States)'],
  },
  {
    id: 'patent-register',
    label: 'Patent register',
    definition: 'An official register of patent applications and granted patents.',
    inclusion: 'The office maintaining it grants or records patent rights for its jurisdiction.',
    boundary: 'Separate from trademark-register; see above.',
    examples: ['National industrial-property office patent registers'],
  },
  {
    id: 'insolvency-register',
    label: 'Insolvency register',
    definition: 'An official register of insolvency, bankruptcy, administration or liquidation '
      + 'proceedings.',
    inclusion: 'The system publishes insolvency proceedings or their outcomes as a distinct dataset.',
    boundary: 'A company register that shows a dissolved status is not thereby an insolvency '
      + 'register; the register must hold proceedings.',
    examples: ['Insolvency components of national court registers'],
  },
  {
    id: 'regulated-operator-register',
    label: 'Regulated operator register',
    definition: 'A register of organisations authorised, licensed or registered to operate in a '
      + 'regulated sector other than financial services.',
    inclusion: 'Entry follows a sectoral regulator\'s authorisation or registration decision.',
    boundary: 'Individuals belong in professional-licence-register. Financial firms belong in '
      + 'financial-services-register.',
    examples: ['Care Quality Commission provider register (England)'],
  },
  {
    id: 'contractor-accreditation-register',
    label: 'Contractor accreditation register',
    definition: 'A register of contractors or firms accredited, certified or pre-qualified against '
      + 'a published standard.',
    inclusion: 'Entry follows an assessment against stated criteria.',
    boundary: 'Where accreditation is a legal precondition to operate, regulated-operator-register '
      + 'may fit better. Where it qualifies a firm to bid, procurement-supplier-register may.',
    examples: ['Construction pre-qualification and accreditation schemes'],
  },
  {
    id: 'public-filing-database',
    label: 'Public filing database',
    definition: 'A database whose primary function is exposing documents or disclosures filed by '
      + 'entities, rather than constituting the entity\'s legal register.',
    inclusion: 'The content is filed documents — accounts, notices, statements, announcements.',
    boundary: 'May legitimately coexist with company-register where one system does both, but only '
      + 'where official evidence supports both functions. A register that merely displays fields '
      + 'from a form is not a filing database.',
    examples: ['Bundesanzeiger (Germany)', 'Filed accounts within Companies House (United Kingdom)'],
  },
  {
    id: 'exclusion-and-debarment-register',
    label: 'Exclusion and debarment register',
    definition: 'An official system identifying persons, entities, providers, contractors or '
      + 'regulated participants that are excluded, debarred, sanctioned, suspended or otherwise '
      + 'restricted from specified government programmes, procurement, regulated activity or public '
      + 'participation.',
    inclusion: 'An official operator publishes entity- or person-level searchable or structured data '
      + 'recording an exclusion, debarment, sanction, suspension or restriction, with current or '
      + 'explicitly historical status semantics, and the record has practical verification value.',
    boundary: 'Not a procurement-supplier-register, which records eligible or registered suppliers — '
      + 'this type records the opposite. Not a generic enforcement-news archive, not a court '
      + 'database, and not automatically a financial-services-register merely because the sector is '
      + 'financial. Not every page listing sanctions qualifies: there must be a searchable or '
      + 'structured register, not a narrative announcement.',
    examples: ['SAM.gov Exclusions (United States)', 'HHS OIG List of Excluded Individuals and Entities'],
  },
  {
    id: 'cross-border-registry-interface',
    label: 'Cross-border registry interface',
    definition: 'A supranational or federated access layer that searches across registers held by '
      + 'several jurisdictions.',
    inclusion: 'The system queries or aggregates underlying registers it does not itself constitute.',
    boundary: 'It is NOT automatically the legal source of record — the underlying national '
      + 'registers usually remain authoritative, and the record must say so. Normally carries '
      + 'supranational or regional scope.',
    examples: ['EU-level cross-register search interfaces'],
  },
];

const REGISTRY_TYPE_BY_ID = new Map(REGISTRY_TYPE_DEFINITIONS.map((d) => [d.id, d]));

function registryTypeLabel(id) {
  const found = REGISTRY_TYPE_BY_ID.get(id);
  if (!found) throw new Error(`Unknown registry type "${id}".`);
  return found.label;
}

function registryTypeDefinition(id) {
  return REGISTRY_TYPE_BY_ID.get(id) || null;
}

module.exports = {
  REGISTRY_TYPE_DEFINITIONS, REGISTRY_TYPE_BY_ID, registryTypeLabel, registryTypeDefinition,
};
