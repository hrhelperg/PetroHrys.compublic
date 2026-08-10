# Data Rights — Research Center datasets

Copyright © 2026 Petro Hrys. All rights reserved.

This document forms part of `LICENSE.md` and explains how rights are claimed —
and, just as importantly, **not** claimed — over the research datasets published
by this project.

It is written conservatively. Where a legal outcome depends on facts and on the
jurisdiction, this document says so rather than asserting a conclusion.

---

## 1. What this covers

The Research Center collections in `data/` and their published pages under
`research/` (and the `de/`, `es/`, `fr/` locale copies):

| Collection | Data location |
|---|---|
| Business Directories | `data/business-directories/` |
| Marketplace & Classified Platforms | `data/marketplaces/` |
| Media / PR / Publishing Platforms | `data/media-pr-publishing/` |
| Distribution Intelligence / Planner | `data/distribution-planner/` |

together with the systems built on them: the PetroHrys Score and its factor
model, the recommendation and ranking logic, the category and jurisdiction
taxonomies, the verification and enrichment workflow, and the generators and
validators that publish them.

## 2. The distinction this document turns on

There are two different things in these datasets, and they are treated
differently.

**A. Individual underlying facts.**
That a particular directory, marketplace or publication exists; the address of
its website; that it operates a submission form; the name of the company that
operates it; a date on which something was observed. These are facts about the
world. Facts are not owned by the person who writes them down, and this project
does not claim to own them.

**B. The original work performed on those facts.**
Deciding which platforms are worth including and which are rejected; going and
checking each one against its own primary sources; recording what could and
could not be established; organising the result into countries, categories,
tiers and jurisdictions; scoring it against a defined editorial model; writing
the notes, the pros and cons, the limitations and the caveats; deciding how it
is arranged and presented. That is original work, and rights in it are
reserved.

The short form: **the facts are not claimed; the compilation, the assessment
and the expression are.**

## 3. Independently obtainable facts

This notice does **not** claim exclusive ownership of publicly available facts,
and does not purport to prevent anyone from independently discovering,
recording or publishing the same information.

Anyone is free to go to the same registries, platforms and primary sources this
project consulted, do the work themselves, and publish what they find. That is
independent effort producing an independent dataset, and nothing here restricts
it.

What is reserved is this project's own compilation: its particular selection and
rejection decisions, its structure, its verification and enrichment work, its
original annotations, its scores and assessments, and its presentation. Copying
that compiled and enriched dataset is a different act from independently
obtaining the same underlying facts, and only the first is addressed by this
notice.

## 4. Rights reserved

To the extent each is available under applicable law, the following are
reserved:

- **Copyright in original expression** — the editorial prose, notes,
  descriptions, assessments, guides and documentation, and the code that
  publishes them.
- **Copyright in original compilations** — the selection and arrangement of the
  datasets, where that selection or arrangement is the author's own
  intellectual creation.
- **Database rights, where the legal requirements are satisfied** — in
  jurisdictions that provide a sui generis database right (for example under EU
  Directive 96/9/EC and the national laws implementing it, including in the
  Czech Republic), and where the conditions for that right are in fact met on
  the facts of a given database.

This document does **not** assert that every dataset here definitely qualifies
for sui generis database protection, and does **not** assert that database
rights apply worldwide. Many jurisdictions provide no such right at all. Whether
the right subsists, and in which of these collections, is a question of fact and
of local law. It is claimed only where it is actually available.

Likewise, no claim is made that the datasets are protected in every respect. A
dataset can contain protectable compilation work and unprotectable facts at the
same time; that is the ordinary position, and it is the position assumed here.

## 5. Extraction and re-use

No licence is granted for the systematic extraction, reproduction or commercial
republication of the protected dataset compilation, in whole or in a substantial
part — whether by manual copying, bulk download, scripted collection or
automated scraping — except as permitted by applicable law, or with prior
written permission.

For clarity, and without limiting Section 3, this restriction is **not** aimed
at, and does not purport to reach:

- reading and using the published site normally;
- citing, quoting or linking to it, within what applicable law allows;
- acting on a recommendation — going and listing a business on a directory this
  project identified is the intended use of the research, not a breach of it;
- building an independent dataset from original sources.

Applicable law may permit uses that this section would otherwise describe as
unlicensed. Where it does, that permission prevails.

## 6. Third-party material inside the datasets

The datasets record a great deal of information about organisations that have
nothing to do with this project. None of it becomes this project's property by
being recorded.

- **Platform, company and publication names** are third-party trade marks or
  trade names and remain the property of their owners.
- **Website addresses, submission URLs, official URLs and source URLs** are
  recorded as factual references. Recording a URL claims nothing over the domain
  or the site it points to.
- **Operator names** recorded in fields such as `operator` identify the company
  that runs a platform. That is a fact about that company.
- **Quoted material** — including operator terms, footer text and other wording
  quoted verbatim in `editorNotes` and similar fields as evidence for a
  verification decision — remains the property of its original author and is
  recorded for identification, evidence and research purposes.
- **Third-party metrics** — Domain Rating snapshots recorded with
  `metricsProvenance` are third-party measurements attributed to their provider
  (Ahrefs) with their measurement date. They are third-party data, not this
  project's data, and no ownership of them is claimed. See
  `docs/ahrefs-domain-rating-key.md`.
- **Public registry records** — government and regulator registries listed in
  the datasets are public records maintained by those bodies. Listing one claims
  nothing over the registry or its contents.

Listing an organisation, platform or website in any of these datasets does not
imply endorsement, sponsorship, partnership, authorisation or affiliation in
either direction. See `THIRD-PARTY-NOTICES.md`.

## 7. Provenance must be preserved

The verification model depends on provenance: `sources`, `officialUrl`,
`website`, `lastVerified`, `verification.source`, `metricsProvenance` and the
evidence quoted in `editorNotes` are how a published claim can be checked
against the thing it describes.

Nothing in this rights framework authorises the removal of source URLs,
attribution or provenance metadata from any record. Hardening the rights
position around this project's own work is not a licence to strip attribution
from anyone else's.

## 8. Rights matrix

A summary. It is a guide to the treatment described above, not a substitute for
it — and it **does not override any third-party licence**. Where a component
carries its own licence, that licence governs.

| Material | General treatment |
|---|---|
| Original PetroHrys source code, generators, validators, tests | Proprietary — all rights reserved |
| Original PetroHrys editorial and written content | Proprietary — all rights reserved |
| Original design implementation, stylesheets, page templates | Proprietary — all rights reserved |
| PetroHrys Score, scoring factors and weighting model | Proprietary — all rights reserved to the extent protectable |
| Recommendation, ranking and classification logic | Proprietary — all rights reserved to the extent protectable |
| Dataset selection, arrangement, categorisation, enrichment, verification work, presentation | Rights reserved to the extent protected by applicable law, including database rights where their requirements are satisfied |
| Original annotations, editor notes, derived assessments | Proprietary — all rights reserved |
| Individual public facts recorded in the datasets | No exclusive ownership claimed merely by inclusion |
| Facts independently obtainable from their original sources | Not restricted; independent collection is unaffected |
| Third-party trade marks, brands, company and publication names | Rights remain with their respective owners |
| Third-party URLs, domains and website addresses | No ownership claimed merely by inclusion |
| Third-party quotations and source-derived material | Remain with the original rights holder, subject to their own terms |
| Third-party metrics (e.g. Ahrefs Domain Rating snapshots) | Third-party data, attributed to its provider; no ownership claimed |
| Public government and regulator registry records | Public records of the issuing body; no ownership claimed |
| Third-party licensed software, services and assets | Governed by their own licences — see `THIRD-PARTY-NOTICES.md` |

## 9. Permissions

Requests for permission to re-use the protected compilation, or questions about
what this document covers, can be sent to the operator at the contact address
published in the site's Terms of Service:

- Petro Hrys — <hrhelperg@gmail.com>

---

This document sets out the rights position the operator asserts. It is not
legal advice.

See also: `LICENSE.md` · `THIRD-PARTY-NOTICES.md` · `README.md`
