# Research Center Internationalization v1

## The rule that shapes everything

**One data layer, four presentation layers.** The directory, marketplace and
media records exist once. Nothing is copied per locale, because four copies of a
fact drift the first time one is corrected and a year later nobody knows which is
right.

    canonical dataset → shared generator → locale dictionary → localized output

Never `canonical dataset → four copied datasets`.

## Supported locales, and how they were discovered

Not invented — read from the architecture already shipped: `/es/`, `/fr/` and
`/de/` exist in the repository and the shipped language switcher lists exactly
these four. A test asserts the locale list matches the directories on disk.

| Code | `<html lang>` | `og:locale` | Prefix |
|---|---|---|---|
| `en` | en | en_US | *(none — canonical)* |
| `es` | es | es_ES | `/es` |
| `fr` | fr | fr_FR | `/fr` |
| `de` | de | de_DE | `/de` |

## URL convention

`/{prefix}{canonicalPath}` — matching `/work/` and `/de/work/`, which shipped
before this phase. English carries no prefix and is the canonical path from
which every other locale, the hreflang cluster and the switcher are derived.

## Dictionary architecture

`data/i18n/{code}.json` — flat key → string. UI strings only: a test asserts the
dictionaries hold no URLs and stay small enough that they cannot be a dataset.

- `t(locale, key, params)` — **strict**. A missing key *throws at build time*.
  There is no silent fallback to English: a page half in two languages is worse
  than a build that refuses to finish.
- `raw(locale, key)` — the stored string without substitution, for audits and
  tests that enumerate keys. Rendering always goes through `t()`.
- `label(locale, namespace, value)` — enum labels. The **value** stays canonical
  in the data; only the label is localized, and only on the way to the screen.

An unsubstituted `{n}` reaching a page is also a build error.

## Protected canonical data — never translated

Platform and publication names (including 钛媒体, 매일경제, 日本経済新聞),
URLs, submission routes, identifiers, country slugs, machine enum values,
evidence provenance, measured values and scores.

`currentStatus: "unknown"` stays `"unknown"` in the record; German renders
*Unbekannt*. A test compares the English render against each localized render and
requires the set of platform names and URLs to be **identical**.

## Uncertainty survives translation

Every hedged string has a hedged translation, checked against a per-language
list of uncertainty markers. A German reader must never be told something is
confirmed because the English hedge was smoothed away.

## Fallback policy

**There is none, deliberately.** Missing key → build fails. This is the right
trade for a generated static site: the failure is loud, early, and impossible to
ship. A runtime product with user-supplied locales would need a different answer.

## hreflang and canonical

Every page self-canonicalises to its own localized URL. The cluster lists all
four locales plus `x-default` at the English route. **Reciprocity is structural**
— the cluster is generated from one list, so a one-way link is not expressible.

## Language switcher

Semantic destination: a reader on `/research/media-pr-publishing/` who clicks DE
lands on `/de/research/media-pr-publishing/`, never the German homepage. Tested
across hubs, country pages, category pages, `/for/` pages and the planner.

## Generator ownership

Four generators, each looping the locale list through **one** render path — not
N generators for N locales, which a test asserts. Each has a pre-write
containment assertion: a generator may write only the routes it owns, in any
locale. That guard exists because a mutation pointed one build at
`de/index.html` and it overwrote the German homepage.

The ecosystem banner comes from `inject-ecosystem-banner.cjs`, imported by the
renderer. Before that the generator emitted an English banner and the injector
rewrote it on every run, forever. That module's scan is now guarded by
`require.main === module` so importing it has no side effects.

## Testing strategy

Route parity, key parity, missing/unused keys, uncertainty preservation,
canonical/hreflang/lang/OG correctness, switcher destinations, sitemap parity,
dataset non-duplication, brand-name protection, English-prose contamination, and
"one render path" — plus a 14-case mutation suite.

## Adding a locale

1. Add one entry to `LOCALES` in `scripts/lib/i18n.cjs`.
2. Add `data/i18n/{code}.json` with every key.
3. Run the builds.

Everything else is derived: routes, hreflang, switcher, sitemap entries and the
expected route universe. **No HTML file is edited by hand.**
