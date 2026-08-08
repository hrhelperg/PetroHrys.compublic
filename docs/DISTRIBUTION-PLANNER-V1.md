# Unified Distribution Planner v1

## Purpose

Three databases answer three different questions. The planner answers a fourth:
**for this business, this objective, this market and this budget, where should we
publish first — across all three?**

## The rule that shapes the architecture

**The three collections are never merged.** This is a projection: each is read
through an adaptor into a common shape in memory, and nothing is written back.
There is no merged master file, no duplicated record, and no invented universal
authority score. Canonical facts stay in the collection that owns them.

Every projected opportunity carries its **source collection**, its **native
quality signal** and its **native action type**, so a directory citation is never
displayed as if it were a press mention.

## Collections consumed

| Collection | Key | Opportunities | Question it answers |
|---|---|---|---|
| Business Directories | `directories` | 1563 | where a company creates or claims a professional profile |
| Marketplace & Classified Platforms | `marketplaces` | 286 | where a company publishes a listing or an advertisement |
| Media, PR & Publishing | `media` | 385 | where a company pitches, publishes, launches or sponsors |

Total projected: **2234**, of which **139** carry a recorded action URL.

## Why native quality and not one score

The three collections measure different things and measure them differently.
Media has a six-dimension Media Score with an evidence floor. Directories have a
tier, a priority and a listing action. Marketplaces have a type, a cost and a
seller rule. Flattening those into one number would invent precision nobody has.

Each adaptor reports a native quality on 0-100 **with the signal it actually
used** recorded alongside, and the planner ranks on fit first, quality second.

Domain Rating is deliberately unused: only 64 directory records carry a frozen
historical measurement, so ranking on it would rank on whether a number happened
to be taken.

## Objectives and collection gating

An objective declares which collections can serve it **at all**. This is the rule
that stops a classified ad being offered as press coverage.

| Key | Label | Collections that can deliver it |
|---|---|---|
| `seo-citations` | SEO and citations | directories, media |
| `brand-authority` | Brand authority | media, directories |
| `referral-traffic` | Referral traffic | directories, marketplaces, media |
| `lead-generation` | Lead generation | directories, marketplaces, media |
| `local-discovery` | Local discovery | directories, marketplaces |
| `product-launch` | Product launch | media, marketplaces |
| `pr-coverage` | PR coverage | media |
| `founder-visibility` | Founder visibility | media |
| `b2b-buyer-discovery` | B2B buyer discovery | directories, marketplaces, media |
| `marketplace-exposure` | Marketplace exposure | marketplaces |
| `classified-advertising` | Classified advertising | marketplaces |

## Action types stay distinct

| Key | Label | Lane |
|---|---|---|
| `create-listing` | Create a listing | 1 |
| `claim-profile` | Claim an existing profile | 1 |
| `apply-for-inclusion` | Apply for inclusion | 1 |
| `post-advertisement` | Post an advertisement | 2 |
| `create-seller-profile` | Create a seller profile | 2 |
| `publish-classified` | Publish a classified listing | 2 |
| `pitch-editor` | Pitch an editor | 3 |
| `submit-news` | Submit company news | 3 |
| `send-press-release` | Send a press release | 3 |
| `contribute-article` | Contribute an article | 3 |
| `launch-product` | Submit a product launch | 3 |
| `register-as-source` | Register as an expert source | 3 |
| `apply-podcast-guest` | Apply as a podcast guest | 3 |
| `sponsor-placement` | Buy a sponsored placement | 3 |
| `enter-award` | Enter an award | 3 |
| `publish-profile` | Publish a company profile | 3 |
| `investigate` | Investigate the route | any |

## The formula

    fit   = businessFit x 0.40 + objectiveFit x 0.35 + geographyFit x 0.25
    score = clamp(fit / 100 x nativeQuality x 1.2, 0, 100)
            + 4  if an action URL is recorded
            - 6  if the platform is behind a bot filter
            - 4  if the cost is not established

An unrated opportunity uses 52 x 0.78: not knowing is a fact about our
research, not a fault in the platform.

## Exclusions

Explicit negative evidence disqualifies: a collection that cannot deliver the
objective, a marketplace that accepts private sellers only, a marketplace type
that does not carry this business, a directory that explicitly refuses this
business type, a cost outside the budget, a dead platform. **Unknown never
excludes** — an unestablished cost is a caveat the row states.

## Campaign plan grouping

Derived from canonical facts, never from a curated name list. An opportunity
lands in the first group it satisfies, so the plan reads as a sequence of actions
rather than one ranking repeated six times.

| Group | What it is |
|---|---|
| Quick wins | High fit, low friction: a route you can act on today, at no cost, with no editor in the way. |
| Authority plays | Selective opportunities where an editor decides. Slower and worth more when they land. |
| Local and market coverage | Surfaces that make a company findable in the target market. |
| Marketplace and classified listings | Direct listing and advertising surfaces. A listing is not editorial coverage. |
| Paid placement | Commercial placement. Useful, and clearly labelled as bought rather than earned. |
| Longer term and unverified | Worth pursuing, but the route needs establishing first or the platform needs a browser check. |

## Pathologies found during development, and the rule that fixed each

1. **A wholesale homeware marketplace was offered to a UCaaS vendor at 88.**
   Marketplace fit read `sellerTypes` alone — business or private — so every
   business-accepting marketplace fitted every business equally. Seller type says
   WHO may list; it says nothing about WHAT. Fixed by matching marketplace type
   against the business, and by declaring `[]` for software-shaped businesses,
   because the collection's `b2b` type means goods trading and nobody lists
   enterprise telephony on a wholesale marketplace.

2. **German phone books outranked a specialist manufacturing publication for B2B
   buyer discovery.** Directory objective fit ignored what the directory was a
   directory OF. A general local directory now scores 45% for B2B objectives.

3. **A 3D-printing trade title appeared in marketing-agency results.** The
   keywords "advertising" and "brand" matched platforms describing their own ad
   sales, not marketing coverage. Both removed.

None of these was fixed by moving a platform.

## Route and indexation

One page at `/research/distribution-planner/`. Query combinations are **not**
pages: 17 businesses x 11 objectives x 40 markets x 4 budgets would be 29,920
near-identical documents. The full projected set is prerendered with its facts as
data attributes and the client re-ranks what is already there. Without JavaScript
the reader gets a complete default plan and working links to all three source
collections.

## Limitations

- The marketplace collection records no per-platform submission URL, so every marketplace row shows "No action URL recorded" rather than a fabricated one.
- The marketplace vocabulary cannot distinguish B2B goods trading from B2B services, which is why software businesses get no marketplace lane rather than a wrong one.
- Directory native quality uses tier and priority. Those are editorial judgements made during directory research, not measurements.
- Geography fit treats a global audience as reaching any market at 78-82. An editorial reading, not a measurement.
