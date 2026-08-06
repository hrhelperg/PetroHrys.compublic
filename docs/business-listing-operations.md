# Business Listing Operations — Batch 0 foundation

**Version 1.0 · 2026-08-06**

## 1. What this is for

The Research Center answers two different questions, and they must not be mixed.

| Question | Answered by |
|---|---|
| *"Where can the official status of a business be verified?"* | **Government Registry** records |
| *"Where can we publish or manage a business presence?"* | **Business Listing Opportunity** records |

This document covers the second. A statutory registration obligation is not a
marketing opportunity merely because it produces a public record, and a
commercial directory is never a source of legal truth.

## 2. The four operational fields

Added in Batch 0. All are nullable, all are additive, and **no record was
stamped with them** — absence normalises to `null` in memory and the
serialisation projection drops it again on write.

### `audienceGeography: string[] | null`

The audience a platform actually reaches. Distinct from `country` (where the
platform sits) and from `scope` (global / national / regional as a *level*).
A German operator can serve DACH; a Swiss platform can be local.

Closed vocabulary: `global`, `europe`, `european-union`, `dach`, `nordics`,
`north-america`, `united-states`, `canada`, `united-kingdom`, `australia`,
`latam`, `middle-east`, `africa`, `asia`, `india`, `japan`, `china`,
`country-specific`, `regional`, `local`.

- `null` means not established. `[]` is **invalid** — it asserts the platform
  reaches nobody, which is never what was meant.
- Duplicates are invalid. Order must be deterministic.
- **Never inferred from the operator's country.** A test asserts no record
  carries an audience that is simply its country repeated.

### `priority: 'P1' | 'P2' | 'P3' | 'hold' | 'reject' | null`

An editorial *work recommendation*: what an employee should do first. It is not
a quality score, not a Domain Rating, and not employee workflow state.

- `P1` register first · `P2` valuable · `P3` optional or niche
- `hold` — potentially valuable, not yet actionable (evidence or access unresolved)
- `reject` — do not use
- `null` — not yet assessed

`hold` records **remain** in the actionable list; `reject` records do not.

### `currentStatus: 'active' | 'shutting-down' | 'redirected' | 'dormant' | 'unknown' | null`

Whether the researched *product* still operates. `redirected` records a domain
that now resolves into a successor — **a redirect alone does not prove the
successor offers the same service**, so a redirected record is not actionable
unless it has been re-modelled as the live successor.

### `publicProfileAvailable: true | false | null`

Whether a public business, company, supplier, product or professional profile
has been directly established.

`true` is never inferred from an account registration, an advertising account,
a procurement registration, or a search-result snippet. `false` is never
inferred from missing evidence — that is `null`.

## 3. The actionable set — one definition

`S.isActionableOpportunity()` is the **single** definition. The CSV row count,
the working-list page, the public count and batch progress reporting all derive
from it, so a platform can never be actionable in one view and archived in
another.

An actionable opportunity is not a government record, not `priority: reject`,
not `shutting-down` / `dormant` / `redirected`, and has a current `https://`
website.

## 4. CSV contract

`research/business-directories/opportunities.csv`, generated at build time.

- **UTF-8 with BOM** — without it Excel on Windows mis-renders Örtliche,
  Páginas and Zlaté.
- **RFC 4180** quoting and CRLF line endings.
- **Deterministic**: sorted country → priority → name using a locale-independent
  comparator. `localeCompare` is banned because its result depends on host ICU
  data, which would make the file differ between machines.
- **Public editorial data only.** No employee, no credential, no workflow state.
- Generated only when at least one actionable opportunity exists — a header-only
  file is not a working list.

Eighteen columns: `id, name, website, platform_country, audience_geography,
category, listing_action, cost, domain_rating, tier, priority,
public_profile_available, submission_url, claim_url, best_for, limitations,
last_verified, current_status`.

## 5. The internal tracker privacy boundary

`data/business-directories/internal-tracker.template.csv` is a **header row and
nothing else**, and a test fails if any data row is committed.

Columns: `platform_id, target_product, assigned_to, workflow_status,
submitted_at, published_profile_url, follow_up_date, internal_note`.

Workflow statuses: `not-started`, `researching`, `ready-to-submit`, `submitted`,
`verification-required`, `approved`, `rejected-by-platform`, `needs-update`,
`not-applicable`.

**Never commit** employee names, email addresses, credentials, tokens, private
submission notes, customer data or unpublished profile links. Copy the template
out of the repository before filling it in.

## 6. Geography and the "no empty page" rule

Sixteen geographies were added to the data layer — Netherlands, Austria,
Switzerland, Sweden, Norway, Denmark, Finland, Belgium, Portugal, Ireland, New
Zealand, Singapore, South Korea, Brazil, Mexico, United Arab Emirates. Japan
already existed.

**A declared geography does not get a public page.** A country page exists only
where records exist. Any earlier document suggesting otherwise is superseded by
this section.

Platforms from countries without their own page appear under **Other countries**
on the working list — one consolidated view, never sixteen thin pages. A country
is promoted to its own page when it has roughly 5–10 strong active platforms and
enough unique content to be worth reading. That is guidance, not a validator
quota.

## 7. Domain Rating

Unchanged by this batch and restated because it is the easiest rule to erode.

Domain Rating is **never invented**. No Ahrefs API, no paid SEO API, no scraping
of protected tools, no estimating from brand recognition, no copying from blog
posts, no converting another provider's metric.

Allowed: an existing frozen historical measurement in the repository, or exact
reuse of a domain-level measurement under the shared-domain rule. Otherwise
`domainRating: null`, rendered **Not measured**. A strong platform is never
rejected for lacking a measurement.

## 8. No network at build time

Generation is fully static, offline and deterministic. Research happens before
data is committed. There is no `package.json`, no dependency tree, no runtime
API and no framework, and tests assert all four.

## 9. Rollback

Every Batch 0 change is additive and reversible:

1. **Revert the commit.** No record was rewritten, so no data is lost.
2. **The two generated artefacts** — `opportunities.csv` and
   `opportunities/index.html` — are owned by the build manifest and are pruned
   automatically once the generator stops emitting them.
3. **The sixteen geographies** can be removed from `countries.json` together
   with their empty `directories/*.json` files; nothing references them.
4. **The four fields** can be removed from `KNOWN_RECORD_KEYS`, migration and
   the validator. Because nothing was stamped, no record needs rewriting.

Confirm a rollback with: validator exit 0, migration rewriting 0 files, build
writing 0 and pruning the removed artefacts, and the DR digest unchanged.
