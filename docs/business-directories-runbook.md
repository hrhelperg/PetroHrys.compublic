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
