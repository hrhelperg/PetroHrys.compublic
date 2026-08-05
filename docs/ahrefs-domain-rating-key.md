# Ahrefs API key — WITHDRAWN

> **Do not follow this document.** It is kept only to explain the provenance of
> the 64 Domain Rating snapshots already in the registry, and why no more were
> taken. **Nothing in this repository needs an Ahrefs key. Do not create one, do
> not export `AHREFS_API_KEY`, do not configure it in CI.**

## What changed

This document previously instructed maintainers to obtain a free Ahrefs key
before **2026-08-10**, the date the endpoint became key-mandatory.

On **2026-08-04** the Research Center adopted an open-source data policy: it
collects no metric that requires a paid account, an API subscription, a
mandatory API key, a bearer token or any other private credential. A metric that
cannot be verified from an openly accessible source is recorded as `null`, never
estimated and never sourced from an unofficial mirror.

The instruction to obtain a key was therefore withdrawn before the deadline it
was written for. It was never acted on in an active workflow.

## Where that leaves Domain Rating

- The **64 existing snapshots are preserved unchanged**, each with its provider,
  value, measurement date, measured domain and `historicalSnapshot` status. They
  are dated historical readings and are never refreshed.
- **No new Domain Rating measurements are made.** Records added from Batch 1
  onward carry `domainRating: null` on any domain the dataset has not already
  measured, which the site renders as "Not measured" — never as 0, and never as
  a live figure.
- **An existing snapshot may be reused on the exact domain it measured.**
  Because a Domain Rating is a fact about a *domain*, a second registry
  published on an already-measured domain repeats that domain's stored snapshot
  verbatim — same value, provider, date and `historicalSnapshot` status. That
  performs no measurement, no request and no credential read, so it does not
  reopen the question this document closed. Copying a value between different
  domains, between a parent domain and a subdomain, or under a changed date or
  provider all remain forbidden; `sharedDomainSnapshotProblems()` in
  `bd-schema.cjs` rejects each case and
  `scripts/tests/bd-shared-domain-snapshot.test.cjs` proves it.
- Records without a Domain Rating are fully publishable and fully visible. They
  sort after measured records in the Domain Rating view only. The PetroHrys
  Score, which never incorporated Domain Rating, remains available for every
  qualified record and is the primary maintained ranking.
- `scripts/measure-business-directory-dr.cjs` is retired and refuses to run
  without `--run-retired-utility`. That flag exists only to reproduce the
  provenance of the values already committed.

## Why the file is kept

Deleting it would erase the audit trail for how the 64 snapshots were produced
and under which endpoint terms. `scripts/tests/bd-open-source-policy.test.cjs`
enforces that this document tells no one to obtain a key, and that no build,
validator or test reads `AHREFS_API_KEY`.

## Provenance of the existing snapshots

Recorded for audit only. The contract below is the one the 64 committed
snapshots were measured under, verified against official documentation on
2026-08-04:

    GET https://api.ahrefs.com/v3/public/domain-rating-free?target=<domain>
    Authorization: Bearer <token>        (became mandatory 2026-08-10)
    -> { "domain_rating": { "domain_rating": <number>, "license": <url>, "warning": <string|null> } }

Each stored value carries its provider, measurement date, measured domain and
`historicalSnapshot` status, so any reader can see exactly what was measured
and when.

## Standing rules

These outlast the withdrawal and apply to every metric, not just this one:

- Do not scrape Ahrefs HTML, use third-party Domain Rating mirrors, or copy a
  value from memory. A rating without a verifiable source and date does not
  belong in the registry.
- Do not add a key to any file in this repository, and do not create a committed
  `.env`. There is no `.env` loader in this project.
- Never substitute 0 for a missing metric, and never estimate one.
