# Directory Intelligence v3 — recommendation intelligence

**Version 3.0 · 2026-08-07**

## 1. The question this answers

The Directory Score answers *"how good is this platform?"* — the same number for
everyone. v3 answers a different question:

> **"How good is this platform for THIS business?"**

Google Business Profile scores **80 for a local business** and **20 for a SaaS
company**. G2 scores **85 for SaaS** and **21 for a construction firm**. Neither
platform changed; the business did.

## 2. Four rules

**Nothing is hardcoded.** There is no curated "best directories for SaaS" list
anywhere. A profile *declares* what it needs, every actionable platform is scored
against that declaration, and the ranking falls out. A test asserts the profile
declarations name no platform.

**Every recommendation explains itself**, from the same computation that produced
the number — so a reason can never contradict its score.

**An explicit no is disqualifying.** `accepts` is tri-state. If a platform states
it does not accept a business type, no amount of quality makes it a
recommendation. This is the one place a rule beats a score, and it must:
recommending a platform that will reject the submission wastes the employee's
time.

**Unknown fit is not zero fit.** Most rows have no `accepts` data. Treating that
as "does not accept" would empty every page; treating it as "accepts" would fill
them with noise. It scores as weak-but-eligible and is always labelled.

## 3. Business profiles

A profile is a declaration with three optional parts. It never names a platform.

```js
{ key: 'saas', label: 'SaaS companies', slug: 'saas',
  accepts: ['saas'],                                  // tri-state flags
  categories: ['saas', 'software', 'review-sites'],   // registry categories
  keywords: [...] }                                   // words in the platform's own prose
```

19 profiles ship: SaaS · AI startups · local businesses · manufacturers ·
exporters · agencies · enterprise software · ecommerce · law firms · accounting ·
healthcare · cybersecurity · cloud · fintech · HR · logistics · construction ·
real estate · education.

### Why `keywords` exists

`accepts` has twelve flags and **none of them means "manufacturer"**. The first
implementation proxied that with `enterprise` — and Hugging Face ranked first for
Manufacturers, with The Legal 500 first for Exporters, because both accept
enterprises.

The fix: a profile with no corresponding flag declares `accepts: []` and is driven
by category, then by the words in the platform's own description. A guard now
rejects any profile naming a flag that is not a real `accepts` key.

`category` alone was also too coarse — leaning on `industry-associations` put ABTA
top of Construction and Alibaba top of Logistics. Keywords fixed that, at a lower
fit weight, because a word can appear incidentally.

And a keyword must be **unambiguous across industries**: `practitioner` matched
The Legal 500 (legal practitioners) and put a law directory top of Healthcare. It
was removed, and a guard pins its absence.

## 4. The Recommendation Score

```
recommendation = fit% × quality
```

**Fit** — how well the platform matches the business, before any quality judgement:

| Basis | Weight | Meaning |
|---|---|---|
| `established` | 100 | The platform states it accepts this business type |
| `category` | 55 | Its registry category serves this type |
| `keyword` | 45 | Its own description names this field |
| `unknown` | 25 | Eligible, but nothing supports it |
| `excluded` | — | It states it does **not** accept this type |

**Quality** — the Directory Score where there is enough evidence to compute one;
otherwise a fallback from tier and status, **discounted by 0.7** so a fallback
never looks as authoritative as the real thing.

Fit is a multiplier because a perfect platform for the wrong business is not a
recommendation. Quality is what separates two platforms that fit equally well.

### Levels

`priority` ≥ 70 **and** fit established · `recommended` ≥ 55 · `possible` ≥ 35 ·
`marginal` < 35 · `excluded`.

`priority` requires an established fit deliberately: a row cannot be a top
recommendation on a keyword guess.

## 5. Worked example

**Google Business Profile**

| Profile | Score | Level | Fit basis |
|---|---|---|---|
| local businesses | 80 | priority | established |
| manufacturers | 20 | marginal | unknown |
| SaaS companies | 20 | marginal | unknown |

**Reasons shown for the local-business recommendation**, all emitted by the scoring
steps: *Accepts local businesses · High referral potential · Verified listings ·
Free listing · Profile pages are indexed · A leading platform in its field.*

## 6. Pages

`/research/business-directories/for/{slug}/` — 19 generated, each with an
overview, the ranked table (top 25), the selection methodology, and limitations.
Every row shows its score, level, fit basis and reasons.

A profile with **fewer than 5** recommendations gets **no page** — the same
no-empty-artefact rule the rest of the section follows. A test asserts the rule in
both directions.

## 7. Filtering

The working list gains a **Best for** filter, listing the profiles a platform is
`priority` or `recommended` for. Only those two levels: listing every profile a
row merely qualifies for would make the filter meaningless.

It is computed by the same engine the pages use, so filter and pages cannot
disagree.

## 8. Limitations

- Rankings reflect **evidence recorded**, not outcomes. A well-documented platform
  can outrank a better one researched less.
- `possible` and `marginal` rows rest on a category or keyword rather than the
  platform's own statement. They are candidates to check, not conclusions.
- Keyword matching is deterministic but shallow: it reads the description we
  wrote, not the platform's full site.
- Fit weights are an editorial judgement. They are documented and fixed, so the
  score is reproducible — reproducible is not the same as objectively correct.

## 9. Roadmap

1. **`accepts` on operational rows.** The flags exist on editorial records only, so
   `established` fit is available to a minority. This single field would move more
   rows to `priority` than anything else.
2. **Clear the browser queue** (447 rows) — it feeds quality, which feeds every
   profile.
3. **Per-country recommendations** — "best directories for a German manufacturer"
   needs `audienceGeography` crossed with the profile, and the data is already
   there.
4. **Business size** as a profile dimension, once `accepts.enterprise` versus
   `accepts.startup` is populated widely enough to separate them.
