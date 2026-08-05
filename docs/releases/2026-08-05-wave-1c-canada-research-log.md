# Wave 1C-2 — Canada government registries: research log

Date of research: 2026-08-05. Researcher/reviewer: Petro Hrys.
Scope: Canada only — federal, all ten provinces, all three territories.

This is the working record of what was looked at, what was found, and what was
believed on what evidence. It is deliberately longer than the release notes,
because the value of a research log is the discarded work, not the published
work.

---

## Method

Every factual statement in a published record originates from a page served by
the operator's own domain, or by the government that operates it. Search engines
were used only to locate those pages; no search-result summary was ever used as
evidence. Where a page could not be read, nothing was asserted about it.

Two transports were used: the harness fetch, and a plain HTTPS GET rendered to
text. Neither executes JavaScript. That limitation is the single largest cause
of unresolved candidates in this wave and is recorded honestly against each one:
a client-rendered registry is *unverified*, not *inaccessible*.

### Reachability of Canadian government hosts from this environment

This matters for reading every "blocked" verdict below.

| Host | Result |
|---|---|
| `ised-isde.canada.ca` | 200 — fully readable |
| `brevets-patents.ic.gc.ca` | 200 — fully readable |
| `apps.cra-arc.gc.ca` | 200, but the body is `Loading/Chargement...` only |
| `fintrac-canafe.canada.ca` | 200 on guidance pages, 403 on the MSB register |
| `www.canada.ca` | **no response** over HTTP/2 or HTTP/1.1 |
| `www.ontario.ca`, `www.quebec.ca`, `www.alberta.ca`, `www.novascotia.ca`, `www2.gov.bc.ca`, `companiesoffice.gov.mb.ca`, `www.justice.gov.nt.ca`, `nunavutlegalregistries.ca`, `cado.eservices.gov.nl.ca`, `corporateregistry.isc.ca`, `www.rbq.gouv.qc.ca` | 200 — fully readable |
| `www.snb.ca`, `www.princeedwardisland.ca`, `yukon.ca`, `lobbycanada.gc.ca`, `rjsc.novascotia.ca`, `www.registreentreprises.gouv.qc.ca` | interstitial challenge or rate-limit refusal |
| `www.ciro.ca`, `www.sedarplus.ca` record search | 403 |

The federal picture is the counter-intuitive one: the *department* hosts are
open while the *portal* host is not, so an unpublished federal candidate says
nothing about the registry behind it.

---

## The three findings that shape the Canadian dataset

### 1. Alberta has no government public corporate search

Confirmed directly from `alberta.ca/find-corporation-details`:

> "Registry agents provide all of the search services listed below."

> "A registry agent will charge a government fee and a service fee to provide
> the information you need."

Lead ministry: Service Alberta and Red Tape Reduction. Alberta maintains a
Corporate Registry; what it does not maintain is a public search of it. Searches
are sold by private registry agents at unregulated service fees.

**Consequence:** nothing was published for Alberta. This is recorded in the
coverage manifest as `researchStatus: "no-public-registry"` with
`blockerCode: "none"` — explicitly *not* as a fetch blocker, because a future
wave that reads it as a blocker will eventually "fix" it by publishing a private
registry agent. `bd-canada.test.cjs` asserts both the classification and the
absence of any `CA-AB` record.

### 2. Saskatchewan is a different case entirely

The Saskatchewan Corporate Registry is delivered by Information Services
Corporation, a commercial operator. The entry point at `corporateregistry.isc.ca`
is titled "ISC Customer Portal" and presents a user name and password form, an
account-creation path, and a maintenance notice. The registry itself remains
statutory: the portal states the information filed is "required by the
Government of Saskatchewan".

So: **statutory registry, commercial delivery, login-gated front door.** That is
published, with `operator.type: "other"` and `loginRequired: true` recorded from
direct observation. It is materially different from Alberta and the record says
so in `editorNotes`; a test asserts that it keeps saying so.

### 3. MRAS is an interface, and `businessregistries.ca` is a parked domain

The obvious-looking domain `businessregistries.ca` was checked first. It is a
**commercial domain-sale page** operated by a US registrar — no government
connection whatsoever. Citing it would have been a serious error.

The real entry point is `canadasbusinessregistries.ca`, which was confirmed by
request to redirect to `ised-isde.canada.ca/cbr-rec/en/`, page title "MRAS
Canadian Business Registry". It is published as
`primaryRegistryType: "cross-border-registry-interface"` and its only registry
type — adding a register type would claim it holds records, which it does not.
Its published prose states it is not the source of record, and a test asserts
that no other record lists it as an *alternative* to a real register.

Its access fields are all null: the application is client-rendered and its
behaviour was never observed.

---

## Candidate-by-candidate

### Federal

| Candidate | Outcome | Evidence / reason |
|---|---|---|
| Search for a Federal Corporation | **Already published** (`ca-corporations-canada`) | Untouched by this wave. |
| Canadian Patents Database | **Approved** | `brevets-patents.ic.gc.ca` served the basic search form directly with no login; page states its own currency (2026-08-05). Limitations quoted from CIPO's "Search intellectual property databases": the 18-month publication rule and "practically impossible to find every relevant publication". |
| MRAS Canadian Business Registry | **Approved** | Redirect chain verified; see above. |
| SEDAR+ | **Approved** | Landing page read directly; operator identified from the footer as the BCSC, ASC, OSC and AMF among CSA members. The record search returned 403, so access fields are null and only *filing* fees are mentioned — no searcher fee is asserted. |
| Canadian Trademarks Database | **Withheld — architectural** | Fully verified (free, no account, 1865 onwards, "over 140 years", "more than 1.4 million"). Blocked only by the shared-host / Domain Rating conflict. See release notes. |
| CRA List of Charities | **Pending** | Renders only via client-side scripts; the canada.ca description page was unreachable. High priority. |
| FINTRAC MSB registry | **Pending — withheld deliberately** | An earlier draft of this wave pointed a *registry* record at FINTRAC's *requirements guidance* page and quoted a fee statement not present on the page actually read. Caught in adversarial review and removed. The register itself is 403 on two hosts. |
| Registry of Lobbyists | **Pending** | Interstitial challenge. |
| CSA National Registration Search | **Pending** | Unresolved redirect. |
| OSFI regulated institutions lists | **Pending** | Every candidate path 404'd; canonical location not established. |
| CIRO AdvisorReport | **Pending** | 403. |
| CanadaBuys | **Rejected** | Read directly; it is a tender-opportunity portal, not a register of businesses. |

### Provinces

| Jurisdiction | Outcome | Note |
|---|---|---|
| Ontario | **Approved** | Strongest provincial evidence in the wave. Free basic search stated verbatim; product prices ($8 / $3 / $26) and the 15-day change-reporting duty all quoted. |
| Quebec — enterprise register | **Approved** | Québec states the register is consulted **free of charge** and lists the fields covered, including **"the names of the ultimate beneficiaries"** — which is why the record carries `beneficial-ownership-register`. Also records Québec's condition that English service "is reserved for individuals covered by the exceptions stipulated in the Charter of the French language", published as a con. |
| Quebec — RBQ licence holders | **Approved** | Second Quebec record, distinct host and distinct function (construction licensing). English title is an editorial translation and is declared as one. |
| British Columbia | **Approved** | Province states business, society and cooperative registrations are "maintained as public records". Search products supplied via the search unit and BC OnLine. Application is client-rendered, so access fields are null. |
| Manitoba | **Approved** | Public-search purpose quoted verbatim. The transactional service is a login portal, so `freeToSearch` stays **null** rather than being asserted either way. |
| Nova Scotia | **Approved** | Search scope quoted, including "activity history, including filed documents and reports" — which is the evidence for `public-filing-database`. Eight governing statutes named by the province. |
| Newfoundland and Labrador | **Approved** | CADO identity and its six register sections confirmed from the served pages; the company search returned the service's own error page, so access fields are null. |
| Saskatchewan | **Approved** | See finding 2. |
| New Brunswick | **Pending** | Interstitial challenge on both hosts. |
| Prince Edward Island | **Pending** | Radware interstitial. |
| Alberta | **No public registry** | See finding 1. |

### Territories

| Jurisdiction | Outcome | Note |
|---|---|---|
| Northwest Territories | **Approved** | Best-evidenced territorial record: "Basic information such as the legal name, status, and type of entity is available free of charge", full profiles require an account with a card on file, certificates $20.00. |
| Nunavut | **Approved** | "Almost all records are available to the public to view or obtain copies." **No online corporate search interface is published** — a genuine coverage limit of the territory, recorded as such, with the division's own "under construction" notice published as a con. |
| Yukon | **Pending** | `yukon.ca` interstitial; `ycor-regcor.gov.yk.ca` no response. |

---

## What adversarial review changed

The review pass was not ceremonial. It changed the published output three times.

1. **Quebec** — two claims ("the information contained in the enterprise
   register is public"; "enterprises are responsible for the accuracy of the
   information they declare") had been drafted from a **search-engine summary**,
   not from a page actually read. Both were removed. Fetching Québec's own
   "Find an Enterprise in the Enterprise Register" page then produced better
   evidence than the discarded claims: free-of-charge consultation, the field
   list including ultimate beneficiaries, and the Charter of the French language
   condition. The record improved by being corrected.

2. **FINTRAC** — the record described `fintrac-canafe.canada.ca/msb-esm/msb-eng`
   as the MSB *registry*. Direct reading showed the page is
   "Money services businesses: FINTRAC's requirements" — obligations guidance.
   The quoted fee statement was not on it. The whole record was withdrawn rather
   than repaired, because the register itself was never reached.

3. **Quebec, again** — after the correction, the record said a natural person
   "can be searched by name" while carrying no `searchUrl`. The wave's own test
   caught the contradiction and it was resolved by publishing the Registraire's
   official portal as the search URL rather than by softening the sentence.

Two further records were removed earlier for reasons recorded above: the
Canadian Trademarks Database (architectural) and CanadaBuys (not a registry).

---

## Mutation testing

The new invariants were checked by breaking the data on purpose and confirming
the suite fails. All eight mutations were caught, and `canada.json` was verified
byte-identical afterwards:

| Mutation | Caught by |
|---|---|
| MRAS reclassified as a company register | MRAS classification test |
| Saskatchewan operator changed to `government-agency` | Saskatchewan/Alberta distinction test |
| An Alberta jurisdiction record added | Alberta absent-registry test |
| Northwest Territories refiled as a province | province/territory classification test |
| A Domain Rating added to a new record | frozen-metrics test |
| An unknown access posture hardened to `false` | null-not-false test |
| The pre-existing federal record re-dated | do-not-rewrite test |
| A score no longer reproducing from its factors | score reproduction test |
