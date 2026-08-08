# Media Intelligence v1

## Purpose

Media Score answers one question: **how good is this opportunity?** It is the same
number whoever is asking. Whether a platform suits *your* business is a different
question, answered in [Media Recommendations v1](MEDIA-RECOMMENDATIONS-V1.md).

## Architecture: a derivation layer, not a second dataset

The audit that opened this phase mapped every requested intelligence concept
against the existing media schema. **All of them were already canonical facts or
derivable from them**, so this layer adds **zero stored fields** and the migration
rewrites **zero records**.

| Requested concept | Existing canonical fact | New field? |
|---|---|---|
| category, market, language, cost, status | `categories`, `country`/`audienceGeography`, `languages`, `costModel`, `currentStatus` | no |
| opportunity types | `opportunityTypes` | no |
| submission route verified | `submissionUrl` / `pitchUrl` / `pressReleaseUrl` | no — derived |
| requiresPitch / selfService | `opportunityTypes` against GATEKEPT / SELF_SERVE | no — derived |
| editorial selectivity, credibility, spam resistance | publishing model, from categories + types | no — derived |
| audience specificity, search/brand/referral potential | `audienceGeography` + opportunity type + `publicProfileAvailable` | no — derived |
| browser-check required | `currentStatus === 'unknown'` | no — derived |

A parallel `mediaCategory` or `mediaCost` would be a second source of truth for a
fact the registry already owns, and the two would drift the first time one was
corrected. One fact, one home.

## Evidence classes

| Class | Name | Meaning |
|---|---|---|
| A | `verified` | The platform states it — a submission page, a rate card, an audience statement. |
| B | `observable` | Established from public platform behaviour. |
| C | `editorial` | Computed here from documented rules over Class A/B inputs. |

Class C is not a licence to invent. Where the Class A/B inputs are absent the
dimension is `null` — never `0`, never `false`, never `low`.

## Publishing model (derived)

Falls out of the opportunity types and answers *who decides what gets published*:
`staff-editorial`, `contributor-network`, `open-submission`, `wire-carrier`,
`marketplace`, `unknown`.

## Dimensions and weights

| Dimension | Weight | Evidence class |
|---|---|---|
| Opportunity quality | 25 | `editorial` |
| Route certainty | 20 | `verified` |
| Editorial standing | 20 | `observable` |
| Durable visibility | 15 | `editorial` |
| Audience reach | 10 | `verified` |
| Accessibility | 10 | `verified` |

Total: **100**.

Note the deliberate opposition: **editorial standing rewards a gate**, while
**accessibility rewards the absence of one**, and accessibility carries only 10.
Harvard Business Review being hard to get into is not a defect.

## Evidence floor

A score exists only when **at least 4 dimensions** and **at least 60 of 100 weight**
are available. Below the floor `mediaScore = null` and the UI reads **"Not yet
scored"** — a statement about our research, not about the platform. Above the
floor, weights are renormalised across the available dimensions only.

## Bands and current distribution

| Range | Band | Platforms |
|---|---|---|
| 88–100 | Exceptional | 22 |
| 78–87 | Strong | 48 |
| 66–77 | Good | 18 |
| 52–65 | Moderate | 28 |
| 0–51 | Limited | 28 |

Scored **144 / 385**; unscored 241; route verified 84; browser-check 62.

The distribution is deliberately bimodal: wire carriers cluster in the 40s and
editorial publications in the high 70s and 80s. That gap is real — a release on a
wire and a bylined article are different assets — and the bands preserve it.

## Reproducing a score by hand

1. Compute each dimension from the record using the rules above.
2. Discard `null` dimensions.
3. If fewer than 4 remain, or their weights sum below 60, the score is `null`.
4. Otherwise: `round(sum(value x weight) / sum(weight))`.

## What is never done

No Domain Rating. No traffic estimate. No audience size. No subscriber count. No
open rate. The score is never stored on a record — it is recomputed every build,
and a test asserts no record contains it.

## Limitations

- 241 of 385 platforms sit below the evidence floor, almost all because no opportunity route has been established yet.
- 62 platforms are behind bot filters. Their route certainty and accessibility are penalised, not zeroed.
- The score reads the *opportunity*, not the audience. A small trade title with a verified contributor route outscores a famous publication with no established route, and that is intended.
