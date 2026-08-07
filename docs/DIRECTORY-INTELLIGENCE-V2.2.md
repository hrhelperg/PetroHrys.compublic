# Directory Intelligence v2.2 — attribute audit

**Version 2.2 · 2026-08-07**

## 1. What this is

The v2.2 brief proposed roughly thirty new attributes. This document records what
happened to each one, because the useful output of that brief was mostly
**rejection**: of the thirty, eight already existed, ten were already covered by
existing score factors, four were added, and the rest could not be established
without inventing them.

The intelligence layer went from 10 attributes to **14**. That is the honest
number.

## 2. Already a field — reused, not duplicated

Adding any of these would have created a second source of truth for a fact the
registry already holds.

| Proposed | Existing field |
|---|---|
| Estimated moderation time, Approval speed | `typicalApprovalTime` |
| Typical approval method | `verificationMethods` |
| Typical moderation strictness | `listingQuality` |
| Business verification difficulty | `submissionDifficulty` |
| Typical rejection reasons *(as process)* | `reviewProcess` |
| Supports profile updates | `ownerResponseSupport` |
| Typical profile completeness | `requiredAssets` |
| Manual approval | `manualReview` |

## 3. Already an editorial judgement — covered by score factors

The PetroHrys Score already carries ten human-judged factors. Restating any of
them as an "attribute" would imply a precision the underlying judgement does not
have.

`editorialTrust` · `businessUsefulness` · `verificationQuality` ·
`platformReputation` · **`spamResistance`** · `industryImportance` ·
**`longTermStability`** · `submissionQuality` · `transparency` ·
**`moderationQuality`**

The bolded three cover the brief's *spam level*, *long-term stability* and
*moderation strictness* proposals.

## 4. Added — four attributes, all Class A

Each is stated in operator documentation, and each concerns what happens **after**
a listing exists — the axis the original ten did not cover.

| Attribute | Type | Meaning |
|---|---|---|
| `supportsOwnershipTransfer` | bool \| null | A listing can be transferred to another account |
| `supportsMultipleEditors` | bool \| null | More than one person can manage the listing |
| `requiresRenewal` | bool \| null | The listing lapses without a renewal |
| `webhookSupport` | bool \| null | The platform can notify a system of listing changes |

## 5. Rejected — and why

These were not added because populating them at scale would mean asserting things
nobody checked. The programme's rule is unchanged: **unknown is preferable to
incorrect.**

| Proposed | Why not |
|---|---|
| Typical rejection reasons | Needs a sample of actual rejections. We have none. |
| Support response time, availability, channels | Needs a support interaction per platform. |
| Inactive profile cleanup, account inactivity timeout | Buried in terms of service; unread means unknown. |
| Profile deletion policy, profile recovery | Same — a policy claim with no source is invention. |
| Allows profile merge, duplicate removal | Not documented by most operators. |
| Dispute process, appeal | Documented by a handful; a field that is null on 99% earns nothing. |
| Average maintenance effort | No unit, no rubric, no evidence. Editorial with nothing behind it. |
| Documentation quality | Would need a rubric applied consistently to 1,563 platforms. |
| Profile edit difficulty | Requires holding an account on each platform. |
| Automation support | Already expressed by `hasApi` + `bulkSubmission` + `webhookSupport`. |
| API documentation | Already expressed by `hasApi`. |

A field that would be `null` on almost every record does not improve a decision —
it adds a column an employee learns to ignore.

## 6. Current shape

**14 attributes** — 11 Class A (verified from documentation), 3 Class B
(observable from the live site). Every one declares its evidence class in code;
a guard fails if an attribute has none.

See [DIRECTORY-INTELLIGENCE-V2.md](DIRECTORY-INTELLIGENCE-V2.md) for the full
architecture and the Directory Score, and
[DIRECTORY-INTELLIGENCE-V3.md](DIRECTORY-INTELLIGENCE-V3.md) for the
recommendation engine built on top of it.

## 7. Roadmap

The four new attributes are declared and validated but largely unpopulated —
establishing them means reading operator documentation platform by platform. They
are worth filling for the Tier 1 set first, where a listing is most likely to be
long-lived enough for ownership transfer and renewal to matter.
