# Business Directories — operator runbook

How to run and maintain the Research Center → Business Directories section.

Everything is driven by JSON in `data/business-directories/`. There is no database, no crawler, no external API, and no build server. You edit JSON, run one command, and commit the result.

**Prerequisites:** Node 18+ (developed on 24). No `npm install` — the project has no dependencies and no root `package.json`. Never add one: Netlify would auto-detect a build and the site ships raw files.

---

## Everyday commands

```bash
cd ~/PetroHrys.com

node scripts/validate-business-directories.cjs            # check the data
node scripts/validate-business-directories.cjs --json     # same, machine-readable
node scripts/build-business-directories.cjs --dry-run     # stage + validate, write nothing
node scripts/build-business-directories.cjs               # build for real
node --test "scripts/tests/*.test.cjs"                    # full test suite
```

Quote the test glob. `node --test scripts/tests/` fails on Node 24 — a bare directory is resolved as a module path.

---

## Adding a directory

1. Open `data/business-directories/directories/<country>.json`. The file must already exist and be named after a country declared in `countries.json`.

2. Append one record. Only `id`, `name`, `slug`, `country`, `category`, `website`, `description` and `tier` are required to be non-empty; **every metric may stay `null`.**

```json
{
  "id": "us-google-business-profile",
  "name": "Google Business Profile",
  "slug": "google-business-profile",
  "country": "united-states",
  "category": "local-business",
  "website": "https://www.google.com/business/",
  "description": "One paragraph, in your own words.",
  "tier": "tier1",
  "petroHrysScore": null,
  "domainRating": null,
  "authorityScore": null,
  "estimatedTraffic": null,
  "referringDomains": null,
  "free": null, "paid": null,
  "verificationRequired": null, "manualReview": null,
  "acceptsCompanies": null, "acceptsProducts": null, "acceptsSaaS": null,
  "acceptsApps": null, "acceptsStartups": null, "acceptsAI": null,
  "backlinkType": null, "robots": null, "sitemap": null, "indexed": null, "ssl": null,
  "lastVerified": null, "nextVerification": null, "httpStatus": null,
  "recommendedIndustries": [], "pros": [], "cons": [],
  "editorNotes": "",
  "metricsProvenance": {}
}
```

3. Validate, then build:

```bash
node scripts/validate-business-directories.cjs && node scripts/build-business-directories.cjs
```

4. Commit the JSON **and** the generated files together, including `data/business-directories/.build-manifest.json`.

### Rules that will stop you

- **`id`** is globally unique and permanent. Changing it is a delete plus an add.
- **`slug`** is lowercase kebab-case, unique within its country, and may not collide with a category slug or with `categories`, `page`, `feed.xml`, `index`. It becomes a URL segment.
- **`website`** must be `https://`. Two records in the same country may not share a domain; the same domain in two different countries is fine and expected.
- **`lastVerified: null` means every metric must be `null`.** You cannot record a number you have not verified.
- **Third-party metrics need provenance.** Setting `domainRating`, `authorityScore`, `estimatedTraffic` or `referringDomains` requires a matching entry:

```json
"lastVerified": "2026-08-01",
"domainRating": 92,
"metricsProvenance": {
  "domainRating": { "provider": "Ahrefs", "measuredAt": "2026-08-01" }
}
```

- **`petroHrysScore` is yours.** It is a first-party editorial assessment and needs no provider — but it still requires `lastVerified`.
- **Never invent a value.** Unknown stays `null` and renders as an em dash. `0` is a claim; `null` is not.

### What appears when you add the first record for a country or category

Country and category pages are generated **on demand**. Adding one record to `germany` creates `/germany/` and its category page and flips both to indexable. Until then those routes do not exist and are shown on the hub as unlinked "coming soon" text.

---

## Updating a directory

Edit the record in place, then validate and build. Only the pages that actually changed are rewritten.

When you re-verify an entry, update `lastVerified`, set `nextVerification` to a later date, and refresh each `metricsProvenance.measuredAt` you touched. `nextVerification` must be strictly later than `lastVerified`.

---

## Removing a directory

Delete the record from the country file, then build. The generator prunes:

- the directory's detail page;
- its category page, if that was the last record in that category;
- its country page, if that was the last record in the country **and** it is not `united-states`, which is kept as the permanent reference country.

`research/business-directories/index.html`, `/united-states/`, `/united-states/categories/general-business/` and `feed.xml` are never pruned.

---

## Rebuilding

```bash
node scripts/build-business-directories.cjs
```

Safe to run any number of times. With unchanged data it reports `0 written, 0 pruned` and `git diff` stays empty. It writes only files whose content actually changed.

Use `--dry-run` to see what a build would do without touching anything.

---

## Recovering from validation failures

The validator collects **every** problem in one pass and prints them sorted by file, id, field, then reason:

```
data/business-directories/directories/united-states.json [us-example] website: Website must use https.
data/business-directories/directories/united-states.json [us-example] tier: Field "tier" has invalid value "platinum". Allowed: tier1, tier2, tier3.

2 validation errors.
```

Fix the JSON and re-run. **Nothing is ever written while validation is failing** — the site is untouched, so there is no partial state to clean up.

Two different errors can stop a build:

| Error | Meaning |
|---|---|
| `RegistryError` | The files on disk are structurally wrong: missing country file, an orphan file for an undeclared country, malformed JSON, an unsafe slug. The message names the exact file. |
| `BuildError` | The data parsed but failed validation, or the staged output failed a check. |

Both abort before any write.

---

## Recovering from manifest inconsistencies

`data/business-directories/.build-manifest.json` records every file the generator created and which record produced it. It is how pruning knows what it is allowed to delete.

**If it is deleted:** pruning is disabled rather than guessed at — the next build regenerates and re-records everything, but files from records you removed while it was missing are left behind. Compare `find research/business-directories -name index.html` against the rebuilt manifest and delete the extras by hand.

**If it is corrupt:** the build stops with `Corrupt build manifest`. Delete it and follow the case above.

**If the build refuses with `Refusing to overwrite`:** a file the generator wants to write already exists and is not in the manifest — usually a hand-authored page, or a leftover from a build whose manifest was lost. Nothing is overwritten. Inspect the file, then either delete it or move it out of `research/business-directories/`.

**Commit the manifest.** It is part of the build output. A clone without it cannot prune correctly.

---

## Things that are deliberate, not bugs

- Country and category pages with no verified entries carry `noindex,follow` and are excluded from the sitemap and RSS. They become indexable automatically once a record lands.
- The hub links only to countries that actually exist; the rest are unlinked "coming soon" text, because linking an ungenerated page would advertise a 404.
- Outbound directory links carry `rel="noopener noreferrer"` and **no `nofollow`**. These are editorial citations, not paid placements.
- Structured data never contains `AggregateRating`, `Review`, `Product` or `SearchAction`.
- `data/business-directories/` is publicly reachable, since the repository root is the document root. The registry is public research data; this is accepted.

---

## If you change the site header or footer

`scripts/lib/bd-render.cjs` contains its own copy of the site shell. If you edit the header, nav, or footer of the hand-authored pages, update that file too, or the generated pages will silently diverge. See `docs/superpowers/reviews/2026-08-03-shell-duplication-proposal.md`.

## Release v1 additions

### Verification cadence

`nextVerification` is **derived, never hand-set**. Editing it by hand will fail
the test suite: the stored value must equal `nextVerificationFor(record)`.

| Bucket | Interval | What lands here |
|---|---|---|
| statutory | 12 months | `submissionModel: notApplicable`, or `category: government` |
| fast | 6 months | review-sites, app-directories, press-release-platforms |
| standard | 9 months | everything else |

The due date is `lastVerified` plus the interval, plus a 0–27 day offset from an
FNV-1a hash of the record id. That spread is what stops the dataset expiring on a
single day. It uses no `Date.now()`, no `Math.random()` and no locale-dependent
comparison, so a rebuild is byte-identical.

**After re-verifying a record**, update `lastVerified` only, then run
`node scripts/migrate-business-directories.cjs` — no, that does not reschedule.
Run the reschedule snippet:

```
node -e "const fs=require('fs'),S=require('./scripts/lib/bd-schema.cjs');const d='data/business-directories/directories';
for(const f of fs.readdirSync(d).filter(x=>x.endsWith('.json'))){const p=d+'/'+f;const r=JSON.parse(fs.readFileSync(p,'utf8'));
let t=false;for(const rec of r){const n=S.nextVerificationFor(rec);if(rec.nextVerification!==n){rec.nextVerification=n;t=true}}
if(t)fs.writeFileSync(p,JSON.stringify(r,null,2)+'\n')}"
```

then `node scripts/generate-bd-logs.cjs` and rebuild.

### Indexability contract

A detail page is indexed when the record carries **all** of: a name, a non-empty
description, a country/scope, a category, an official **HTTPS** destination, a
PetroHrys Score, the complete ten-factor breakdown, a verification date, a
verification source, a named reviewer, and at least one pro or con.

Curated relations and guide links are **optional** — a record with none stays
indexable. A missing relation is a gap in cross-referencing, not a thin page.

Description **uniqueness** is enforced registry-wide by a test, not by a length
threshold. Never introduce a word-count rule.

A failing record becomes `noindex,follow`: the page and all its links survive, and
it drops out of the sitemap automatically because the sitemap is built from the
non-noindex page set. Never hand-edit the sitemap.

### The orphan-key trap

`migrateRecord()` rebuilds every record from a fixed key list, so **any key not on
that list is silently dropped on load**. A patch that writes `tags` instead of
`editorialTags`, or `notes` instead of `editorNotes`, will validate, persist, and
never render. After any scripted edit to the registry, sweep for unknown keys:

```
node -e "const fs=require('fs'),{migrateRecord}=require('./scripts/lib/bd-migrate.cjs');
const K=new Set(Object.keys(migrateRecord({id:'x',accepts:{},verification:{}})));const d='data/business-directories/directories';
for(const f of fs.readdirSync(d).filter(x=>x.endsWith('.json')))for(const r of JSON.parse(fs.readFileSync(d+'/'+f,'utf8')))
for(const k of Object.keys(r))if(!K.has(k))console.log(f,r.id,k)"
```

### Prose must never state a count

Any number about the dataset in guide prose must be a build-time token resolved
from the registry (`{{METRICS}}`, `{{FREE_COUNT}}`, `{{CADENCE}}`). A literal — or
worse, a spelled-out numeral like "Twenty" — goes stale invisibly. Tests fail the
build if a published submission-model count disagrees with the registry, if prose
spells out a dataset count, or if the documented cadence disagrees with the
scheduler.

### Running the tests rewrites the tree

`bd-integration.test.cjs` runs the real generator against the repository root.
Build first, then test, then confirm `git status` is clean — in that order.

## Domain Rating measurement

**Domain Rating collection is frozen. There is nothing to run and no key to
configure.**

Under the open-source data policy the Research Center collects no metric that
requires a paid account, an API subscription or a mandatory credential. The
Ahrefs endpoint that produced the existing snapshots becomes key-mandatory on
2026-08-10, so collection stopped on 2026-08-04.

What this means day to day:

- The 64 Domain Ratings already in the registry stay exactly as measured. They
  are dated historical snapshots and are never refreshed.
- **A new record must not create a new Domain Rating measurement.** On a domain
  the dataset has never measured, that means `domainRating: null` — the correct
  value, not a gap to fill. The site renders it as "Not measured", never as 0.
- **A new record MAY reuse an existing frozen snapshot** when its normalised
  `measuredDomain` exactly matches a domain already measured. Reuse collects
  nothing: it repeats the stored value, provider, date and status verbatim, with
  no network call and no credential. See the next section.
- A record without a Domain Rating is fully publishable and fully visible. It
  sorts after measured records in the Domain Rating view only.
- `scripts/measure-business-directory-dr.cjs` is retired. It refuses to run
  without `--run-retired-utility`, which exists solely to reproduce the
  provenance of the snapshots already committed. Do not use it to add values.
- **Do not obtain, export or configure `AHREFS_API_KEY`.** No build, validator
  or test reads it. `scripts/tests/bd-open-source-policy.test.cjs` fails if any
  of that changes.

**Which domain was measured.** `normaliseDomain()` in `bd-schema.cjs` remains the
one policy for reading the existing snapshots: scheme and `www.` are stripped,
the host is lowercased, and the result is stored as `measuredDomain`. A rating
describes *that* domain — for a marketplace on a parent domain the number
describes the measured host, not the marketplace path, and the page says so.

### Reusing a snapshot on a shared domain

Governments publish several distinct registries on one departmental host. When a
new record's own normalised domain **exactly matches** a domain already measured,
copy the stored snapshot across, field for field:

```jsonc
"domainRating": 92,
"metricStatus": "measured",
"metricsProvenance": {
  "domainRating": {
    "provider": "Ahrefs",
    "measuredAt": "2026-08-04",
    "status": "historicalSnapshot",
    "measuredDomain": "ised-isde.canada.ca"
  }
}
```

Read those four values off the existing record first. Do not retype them from
memory and do not "tidy" the date.

**Reuse is permitted only when every one of these holds:**

- the normalised `measuredDomain` is an *exact* string match;
- the value, provider, `measuredAt` and `status` are identical;
- `status` stays `historicalSnapshot`;
- no network call, no API key, no refreshed or inferred value.

**Never:**

- copy a rating between related but different domains;
- carry a parent-domain value down to a subdomain, or up from one — `canada.ca`
  and `ised-isde.canada.ca` are two domains and two measurements;
- change the date or the provider;
- present the snapshot as current;
- describe the number as authority belonging to the individual registry page.

`sharedDomainSnapshotProblems()` in `bd-schema.cjs` is the single enforcement
point; the validator and `bd-truth.test.cjs` both call it, so they cannot drift.
It rejects differing values, dates, providers or statuses on one measured domain,
and rejects a snapshot whose `measuredDomain` is not the record's own domain.

**Declining reuse.** A record on an already-measured domain may still carry
`domainRating: null`, but only deliberately. Write the literal marker in
`editorNotes`:

```
Domain Rating not reused: <reason>
```

Without it the validator fails, so a forgotten value can never be mistaken for a
considered one.

**What the reader is told.** Every page showing the column carries
`DR_SNAPSHOT_POLICY_NOTE`, which states that Domain Rating "is a dated historical
measurement of the shared domain, not an assessment of this individual registry
page". Two registries on one host therefore show the same number without either
appearing to have earned it.

**Attribution** is required by the Ahrefs licence: "Domain Rating by Ahrefs",
linked to <https://ahrefs.com/>, is rendered wherever a value appears. A test
fails if it is missing.

## The source-of-record rule

**An official search portal, interoperability layer or consultation interface
must not be described as the legal source of record unless the responsible law
or official documentation establishes that role.**

This is the rule Wave 1D was created to enforce, after the Wave 1 audit found
four published records breaking it. It is the easiest error in the whole dataset
to make, because the thing a reader reaches is almost never the thing the law
constitutes.

**Wave 1E.1 extended it to the published text.** Getting the registry type right
is not enough, because a reader never sees the type vocabulary. Where a record
covers an access, publication or consultation surface rather than the
constitutive register, the record must say so in prose a reader actually meets —
the description, the cons, or the "not recommended for" list — and not only in
`editorNotes`, which are working material and are never published.

Two records carry that obligation and are pinned by test:

- **BODACC** gives publicity to acts recorded in the registre national des
  entreprises; its own about page says so, and names the court registries the
  data comes from. Its page says it publishes rather than registers.
- **Insolvenzbekanntmachungen** is where the German insolvency *courts* make the
  announcements § 9 InsO requires. Its page says the proceeding is the court's.

The mutation harness injects the removal of each of those sentences, and both
removals are caught.

Four distinctions do the work. Establish each one separately before authoring:

| Question | What it settles |
|---|---|
| **Where is the register constituted?** | The legal source of record. Usually a court, a ministry, a chamber or a registrar — often *not* the website. |
| **What is the responsible authority?** | The body the law makes answerable for the register. This is what `operator` should name. |
| **Who runs the access route?** | The portal or interface. It may be designated by law and still not be the register. |
| **Who provides the technology?** | A consortium or contractor. Real, worth recording in prose, and **never** the `operator`. |

### Worked examples, all from Wave 1D

**An access portal is not the register.** German commercial registers are kept by
the courts — Handelsgesetzbuch § 8(1) — while § 9(1) has the Länder justice
administrations *determine the electronic system* through which register data is
retrieved. handelsregister.de is that designated system. It is typed
`public-filing-database`, not `company-register`.

**A consultation interface is not a register at all.** L'Annuaire des Entreprises
publishes itself as the official *search engine*, and its own sources page lists
the Registre National des Entreprises and the Base Sirene among the
administrations whose data it uses. It is typed `corporate-number-database`,
whose boundary note already says an identifier lookup is not automatically the
legal register.

**A professional body is not the register its members keep, and a delegated role
is not responsibility.** The Colegio de Registradores is a public-law corporation
of registrars. On insolvency, Real Decreto 892/2013 art. 2.2 places the Registro
Público Concursal under the Ministry of Justice, and art. 2.3 entrusts only *the
material management of the publicity service* to the Colegio, "bajo la
dependencia del Ministerio de Justicia". A delegated management role is recorded
in prose; it does not earn `insolvency-register`.

**A technical provider is not the statutory authority.** The Registro Imprese is
held by the Italian Chambers of Commerce, which publish it as "I dati Ufficiali
della Camera di Commercio". InfoCamere is the chambers' own IT consortium and
runs the platform. `operator` names the chambers; the consortium's real role goes
in prose.

**An operator is an office, never the person holding it.** A sitting Secretary of
State in `operator.name` goes stale at the next election. Use the institutional
office name.

`scripts/tests/bd-source-of-record.test.cjs` holds all five of these, plus a
general guard that no record may describe itself as an interface while carrying a
constitutive register type.

### Does the schema need new fields?

Not on the evidence of these four records. `operator` names the responsible
authority, the registry type carries the constitutive-versus-access distinction,
and prose carries the technical provider. A `responsibleAuthority` /
`technicalOperator` / `sourceOfRecord` split was considered and **rejected as
premature**: four records corrected cleanly inside the current model without
prose workarounds. Revisit only if a later wave produces records that genuinely
cannot be stated honestly without it.

## Registry types added in Wave 1C-3 completion

Two types were added because forcing a system into a neighbouring type would
have stated something false about it. Both were held back as **classification
blockers** in earlier waves rather than misfiled, which is the behaviour to
repeat: if no type fits honestly, stop and report it.

### `public-procurement-notice-database`

*Public procurement notice database.* An official system publishing procurement
opportunities, tender notices, contract award notices, contract data, or other
formal stages of public procurement.

**The distinction that matters.** A `procurement-supplier-register` records
**who may bid** — suppliers who are registered, pre-qualified or eligible. A
`public-procurement-notice-database` records **what is being bought**, and
afterwards who won. Labelling one as the other inverts the meaning. Publication
of a notice says nothing whatever about a supplier's eligibility, standing or
trustworthiness, and every record of this type must say so.

Not a supplier-registration portal, not a submission dashboard without public
notice access, not a commercial aggregator, not a generic open-data portal.

### `registered-design-register`

*Registered designs register.* An official register of registered industrial
designs or comparable protected design rights.

A design right protects **appearance**. A trade mark protects a **brand
indicator**. A patent protects a **technical invention**. They are three
different rights with three different registers, and `trademark-register` or
`patent-register` would misdescribe a designs register.

**This type currently has no records, and that is correct.** The UKIPO designs
search sits behind a captcha and could not be verified. A type with no records
is not a defect; a record forced into the wrong type would be.

## Two distinct systems on one official host

Governments routinely publish several separate statutory systems on one domain.
Companies House is the worked example: the company register and the register of
disqualified company directors share
`find-and-update.company-information.service.gov.uk` but are different systems
with different populations, functions and search paths.

Publishing both requires `resourceIdentity` on **every** record on that host:

```jsonc
"resourceIdentity": {
  "canonicalDomain": "find-and-update.company-information.service.gov.uk",
  "systemKey": "companies-house-disqualified-directors-register",
  "sharedHostGroup": "companies-house-service"
}
```

- `sharedHostGroup` must be identical across the records sharing the host;
- `systemKey` must be globally unique;
- the destinations must be **materially different** — a language variant, a
  query-parameter variant, or a landing page and its own search page are one
  registry, not two;
- and the shared domain's Domain Rating snapshot must be reused verbatim by all
  of them, because one domain has one measurement.

`scripts/tests/bd-shared-host.test.cjs` holds ten rejected cases against this;
none of the identifiers above may ever reach a published page.

## The two rankings

`Domain Rating` and `PetroHrys Score` are **independent** and must never be
combined. DR is a dated third-party measurement of a *domain*; the score is a
first-party editorial assessment of a *directory*. Tests assert that no score
factor is named after a third-party metric and that every score reproduces from
its factors alone.

Sort keys live in `js/bd-order.js` (shared by server and browser):
`domain-rating` is DR desc → score desc → name; `default` is score desc → DR desc
→ name. Nulls sort **last** in both and are never hidden or rendered as 0.
`directoryTable()` takes an explicit `sortKey` — a caller that pre-sorts must pass
the matching key or the table re-sorts to the default.

## Government registry records (Wave 1)

Full model and rationale: `docs/wave-1-foundation-design.md`. Working rules:

- **Scope.** `national` = one state · `subnational` = a jurisdiction within one ·
  `supranational` = above several · `regional` = multi-country or functional, not
  subnational · `global` = worldwide. A jurisdiction requires `subnational`, and
  `subnational` requires a jurisdiction.
- **Jurisdiction codes** are ISO 3166-2 or null. The code names a place, so two
  records may share `US-CA` but may not disagree about what it is.
- **Grouping labels** come from `JURISDICTION_VOCABULARY` per country. Never
  write "Federal" for Spain, Italy or Japan. An undeclared country/type pair
  fails the validator — extend the vocabulary, do not work around it.
- **Registry types** come from the glossary in `scripts/lib/bd-registry-types.cjs`.
  Read the boundary note before choosing. Record every function the evidence
  supports; mark one primary. A verified government or finance record must carry
  at least one.
- **`corporate-number-database` is not a `company-register`.** An identifier
  lookup is not the entity's legal register unless the evidence says so.
- **`cross-border-registry-interface` is not the source of record.** The
  underlying national registers usually remain authoritative; say so in the record.
- **publicAccess.** Record what the source establishes. `accessLevel: "unknown"`
  with `freeToSearch: true` is a normal, honest state. Never infer `open` from
  the absence of stated restrictions, and never from a search URL existing.
- **Names.** Keep the native official name in `nativeName`. If you add an
  `englishName`, set `englishNameSource` — `official` if the operator publishes
  it, `editorial-translation` if we wrote it. The page discloses translations.
- **Nothing is required to be filled.** Every new field is nullable and null means
  "not established". A sparse, sourced record beats a complete, guessed one.

### Ordering

Sort once, before grouping. A caller that has already ordered rows passes
`sortKey: null` to `directoryTable`; anything else gets re-sorted by the shared
comparator.

### Jurisdiction codes and identity

- `iso2`: exactly two uppercase letters, unique. Supranational entries use null.
- `jurisdiction.code`: ISO 3166-2 shaped (`US-CA`, `CA-ON`, `DE-BY`, `ES-CT`,
  `JP-13`) or null. **Shape is validated, membership is not** — no ISO dataset is
  embedded, so a well-formed code is not thereby a real subdivision.
- The code's prefix must match the parent country's `iso2`.
- Identity is the PLACE, not the record. Two California registries are correct.
  What fails: one code with two names, one place with two codes, a code under the
  wrong country, or the same place recorded once with a code and once without.
- Null-code places deduplicate by normalised name, so casing and spacing
  differences are one jurisdiction rather than two.

### Choosing an access level

`open` needs no login and no identity check. `partially-open` means usable but
limited — it must point at a limitation flag or carry a note saying what is
limited, or it is indistinguishable from open. `unknown` is correct whenever the
evidence does not settle the position, and may sit alongside facts you *do* know:
`accessLevel: "unknown"` with `freeToSearch: true` is a normal record. Never
derive the level from the booleans.

### Exclusion and debarment registers

Use `exclusion-and-debarment-register` for a system recording who is excluded,
debarred, sanctioned, suspended or restricted. Not `procurement-supplier-register`
— that records who is eligible, which is the opposite. Never describe inclusion
as a submission, and always state in the record that **absence proves nothing**:
these lists are current-state, name-matched, and a clean result is not a clean
history.

### Two registries on one official host

Default: one canonical domain per country, enforced by both the loader and the
validator. To publish two systems on one official host, every record on that
host needs:

```json
"resourceIdentity": {
  "canonicalDomain": "accessdata.fda.gov",
  "systemKey": "fda-cder-decrs",
  "sharedHostGroup": "fda-accessdata"
}
```

- `canonicalDomain` is a bare hostname and must match the record's website.
- `systemKey` is globally unique.
- All records on the host share one `sharedHostGroup`, and a group covers one host.
- The URLs must differ by more than case, a trailing slash, a query string or a
  language segment.

If the systems are not genuinely distinct — different operator, population,
statute or official function — do not reach for this. It exists for shared
government platforms, not for listing one registry twice.

---

## Filing a subnational record

Every jurisdiction is identified by ONE ISO 3166-2 code, or — where it spans
several subdivisions — by the SET it covers. Never both.

    { "type": "country", "name": "Scotland", "code": "GB-SCT",
      "parentCountry": "united-kingdom" }

    { "type": "cross-territory", "name": "England and Wales", "code": null,
      "covers": ["GB-ENG", "GB-WLS"], "parentCountry": "united-kingdom" }

`covers` must hold at least two real ISO codes, unique, sorted, all belonging to
the parent country. Leave it out entirely when the jurisdiction has a code.

Codes are checked against `scripts/lib/iso-3166-2.cjs`, which covers US, CA, AU,
DE, ES, IT, JP, CN and GB. A code for any other country fails with instructions
to extend the allowlist first.

Do NOT use `GB-EAW`, `GB-GBN`, `GB-UKM`, `GB-CYM`, `GB-CHC` or `GB-COH`. None is
an ISO 3166-2 subdivision; the first three are deprecated compound entities and
the rest belong to other identifier schemes. The validator rejects each by name
and says what to use instead.

Migration will not repair an invalid code, an unsorted `covers` or a duplicate —
it reports them. Fix the source.

Full reference: [`docs/jurisdiction-model.md`](./jurisdiction-model.md).
