# Ahrefs API key — operational requirement

> **Time-sensitive.** From **2026-08-10** the free Ahrefs Domain Rating endpoint
> requires a bearer token. Until then it answers unauthenticated. After that
> date, Domain Rating measurement stops working without a key — **the site build
> is unaffected either way.**

## What needs the key

Only one thing: `scripts/measure-business-directory-dr.cjs`, the editorial
utility that records Domain Rating snapshots into the registry.

**Ordinary builds do not need it.** `node scripts/build-business-directories.cjs`
makes no network calls at all — page generation is offline and deterministic, and
a test fails if any build library gains a `fetch`. Deployment, CI and local
previews never read the variable.

If the key is absent after 2026-08-10, the utility reports the authentication
failure and **writes nothing**. New records simply keep `domainRating: null`,
which renders as an honest "Not recorded" rather than a zero. Nothing breaks; the
dataset just stops gaining new measurements until a key is supplied.

## Creating the key

1. Sign in to Ahrefs (a free account is sufficient for this endpoint).
2. Go to **Account settings → API keys**: <https://app.ahrefs.com/account/api-keys>
3. Generate a key.

The endpoint is free and consumes no API units.

## Using it locally

Export it in the shell that runs the utility:

```sh
export AHREFS_API_KEY='your-key-here'
node scripts/measure-business-directory-dr.cjs --dry-run --all-unmeasured
```

To persist it for your own machine, add the export to your shell profile
(`~/.zshrc`), **not** to anything inside the repository.

## Never commit it

- Do **not** add the key to any file in this repository.
- Do **not** create a committed `.env`. There is no `.env` loader in this project
  and adding one would only create a place for the key to leak from.
- The utility reads `process.env.AHREFS_API_KEY` and nothing else. It reports
  only whether a key is *present*, never its value, and never writes it to disk
  or into a record.

Tests assert that no tracked file contains a literal key or bearer token, and
that no record contains credential-like text.

## Verifying the setup

```sh
node scripts/measure-business-directory-dr.cjs --dry-run --all-unmeasured
```

The first lines report the selection and `API key: present` or `API key: absent`.
A dry run never writes, so this is safe to run at any time.

## If the endpoint changes again

The current contract, verified against official documentation on 2026-08-04:

```
GET https://api.ahrefs.com/v3/public/domain-rating-free?target=<domain>
Authorization: Bearer <token>        (mandatory from 2026-08-10)
→ { "domain_rating": { "domain_rating": <number>, "license": <url>, "warning": <string|null> } }
```

The response carries a `warning` field that Ahrefs uses to announce changes. The
utility surfaces it verbatim in its summary, so a future deprecation shows up in
the run output rather than silently degrading. Do not scrape Ahrefs HTML, use
third-party Domain Rating mirrors, or copy a value from memory: a rating without
a verifiable source and date does not belong in the registry.
