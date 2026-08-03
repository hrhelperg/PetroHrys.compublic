# PetroHrys Score — methodology

The PetroHrys Score is a **first-party editorial assessment** of how much value a listing on a given directory offers a serious business. It is not derived from Ahrefs, Semrush, or any other third-party metric, and it is not a review rating.

It is deliberately *not* a popularity or traffic measure. A directory can be enormous and still score poorly if a listing there is worth little.

---

## Scale

0–100, expressed as the sum of five independently-judged dimensions worth 20 points each.

| # | Dimension | What earns points |
|---|---|---|
| 1 | **Authority and permanence** | Statutory or official standing; long operating history; unlikely to disappear or be sold for parts. A national company register scores at the top; a three-year-old aggregator does not. |
| 2 | **Editorial usefulness** | Does appearing there genuinely help a real business be discovered or evaluated by the right audience? Reach into a specific, relevant audience beats raw size. |
| 3 | **Data quality and verification rigour** | Are entries checked? Are reviews verified against real engagements? Is stale data corrected? Open, unverified submission scores lower. |
| 4 | **Accessibility** | Can a legitimate business appear without paying? Free and open scores highest; freemium mid; pay-to-appear lowest. Paid *enhancement* is treated far more leniently than paid *inclusion*. |
| 5 | **Transparency** | Is ownership clear? Are ranking and monetisation disclosed? Are the rules of inclusion published? Undisclosed pay-for-placement is penalised heavily. |

## How a score is arrived at

Each dimension is scored 0, 5, 10, 15 or 20 — deliberately coarse, because finer granularity would imply precision the assessment does not have. The five are summed. No weighting, no normalisation, no rounding.

## What the bands mean

| Band | Reading |
|---|---|
| 90–100 | Statutory or effectively unavoidable. Being absent is itself a problem. |
| 80–89 | Strong, durable platform where a listing carries real weight. |
| 70–79 | Worth doing for the right business, with caveats. |
| 60–69 | Situational. Useful in a specific niche or geography only. |
| Below 60 | Not currently represented in this dataset. |

The dataset holds nothing below 60 because directories that would score lower are rejected rather than recorded. The score is a ranking tool among directories worth considering, not a pass/fail gate.

## What the score explicitly is not

- **Not Domain Rating.** Ahrefs DR, Semrush Authority Score, traffic estimates and referring-domain counts are third-party metrics. Where recorded they carry their provider and measurement date, and they never feed into this score.
- **Not a review rating.** No `AggregateRating` or `Review` structured data is emitted anywhere in this section, because presenting an internal editorial judgement as third-party review markup would be fabrication.
- **Not SEO value.** A directory's usefulness for link acquisition is not a scoring dimension. Several high-scoring entries here are `nofollow` or unknown.

## Honesty constraints

- The score is only recorded for a directory that has actually been verified. The registry validator refuses any metric on a record whose `lastVerified` is `null`.
- Where a factual input to the score could not be established — for instance, whether a basic listing is free — the underlying field stays `null` and the dimension is scored conservatively rather than optimistically.
- Scores are reviewed when a record is re-verified. `nextVerification` is set six months out.

## Worked examples

**Companies House Register — 96.** Authority 20 (statutory UK register). Usefulness 20 (legally required; the primary source everyone checks). Rigour 18 (structured filings, though Companies House states it does not verify accuracy). Accessibility 20 (free, no login). Transparency 18 (government-operated, published rules).

**DesignRush — 68.** Authority 12 (established but commercial and replaceable). Usefulness 14 (real agency-buyer audience). Rigour 14 (star ratings, but weaker verification than Clutch). Accessibility 14 (listing cost not disclosed). Transparency 14 (awards and ranking model is commercially driven and not fully documented).
