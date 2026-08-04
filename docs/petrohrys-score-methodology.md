# PetroHrys Score — methodology

The PetroHrys Score is a **first-party editorial assessment** of how much value a listing on a given directory offers a serious business. It is not derived from Ahrefs, Semrush, or any other third-party metric, and it is not a review rating.

It is deliberately *not* a popularity or traffic measure. A directory can be enormous and still score poorly if a listing there is worth little.

---

## Scale

0–100. Ten editorial factors, each scored **0–10** by a human reviewer, combined by fixed weights that total **exactly 100%**. The published score is the weighted sum, not a separate judgement:

```
petroHrysScore = round( Σ (factor × weight) / 10 )
```

Weights live in `scripts/lib/bd-schema.cjs` and are guarded at require time: if they no longer total 100, the module throws rather than silently skewing every score in the dataset.

## The ten factors

| Factor | Weight | What earns points |
|---|---|---|
| **Editorial trust** | 15% | Is the operator credible, and is the listing itself trustworthy to a reader? |
| **Business usefulness** | 15% | Does appearing there genuinely help a real business be found or evaluated? |
| **Verification quality** | 12% | Are entries and reviews checked against reality, or accepted on assertion? |
| **Platform reputation** | 10% | How the platform is regarded by the audience it serves. |
| **Spam resistance** | 10% | How hard it is to game, flood, or buy position. |
| **Industry importance** | 10% | How central the directory is to its sector. |
| **Long-term stability** | 10% | Likelihood it still exists, unchanged in character, in five years. |
| **Submission quality** | 8% | How workable the listing process is for a legitimate business. |
| **Transparency** | 5% | Is ownership, ranking and monetisation disclosed? |
| **Moderation quality** | 5% | Are bad entries and abusive reviews actually dealt with? |


Every record stores its `scoreFactors`, and **the validator recomputes the score and rejects any record whose stored number does not match its factors.** A score cannot be asserted; it can only be derived. Each directory page publishes the full breakdown, so any reader can check the arithmetic.

## What the bands mean

| Band | Reading |
|---|---|
| 90–100 | Statutory or effectively unavoidable. Being absent is itself a problem. |
| 80–89 | Strong, durable platform where a listing carries real weight. |
| 70–79 | Worth doing for the right business, with caveats. |
| 60–69 | Situational. Useful in a specific niche or geography only. |
| Below 60 | Not currently represented in this dataset. |

## What the score explicitly is not

- **Not Domain Rating.** Ahrefs DR, Semrush Authority Score, traffic estimates and referring-domain counts are third-party metrics. Where recorded they carry their provider and measurement date, and they never feed into this score.
- **Not a review rating.** No `AggregateRating` or `Review` structured data is emitted anywhere in this section, because presenting an internal editorial judgement as third-party review markup would be fabrication.
- **Not SEO value.** A directory's usefulness for link acquisition is not a scoring dimension. Several high-scoring entries here are `nofollow` or unknown.

## Honesty constraints

- The score is only recorded for a directory that has actually been verified. The registry validator refuses any metric on a record whose `lastVerified` is `null`.
- Where a factual input to the score could not be established — for instance, whether a basic listing is free — the underlying field stays `null` and the dimension is scored conservatively rather than optimistically.
- Scores are reviewed when a record is re-verified. `nextVerification` is set six months out.

## Worked examples

Both are reproducible from the stored `scoreFactors`.

**Companies House Register — 95.** Editorial trust 10, business usefulness 10, verification quality 9, platform reputation 9, spam resistance 10, industry importance 10, long-term stability 10, submission quality 8, transparency 9, moderation quality 9. Verification quality is 9 rather than 10 because Companies House states it does not check the accuracy of what is filed.

**DesignRush — 60.** Editorial trust 6, business usefulness 7, verification quality 6, platform reputation 6, spam resistance 5, industry importance 6, long-term stability 6, submission quality 6, transparency 5, moderation quality 6. Spam resistance and transparency are the weakest dimensions: listing cost is undisclosed and the awards model is commercially driven.
