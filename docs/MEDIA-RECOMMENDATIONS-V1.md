# Media Recommendations v1

## Purpose

Media Score says how good an opportunity is. This engine says whether **this
business**, pursuing **this objective**, in **this market**, should use it.

## The rule that shapes the engine

**A profile may never name a platform.** The moment a profile can say
`telecomPlatforms: ['UC Today']` it stops being a model and becomes a curated list
in disguise. Profiles declare only abstract requirements, and a test asserts the
declarations contain no platform id, name or host from the dataset.

## Business profiles

| Profile | Primary categories | Adjacent categories | Industries |
|---|---|---|---|
| `b2b-saas` | saas-media | technology-media, startup-media, developer-open-source-media, marketing-media | saas, software, cloud, devops |
| `ai-startup` | ai-media | technology-media, startup-media, developer-open-source-media | ai |
| `telecom-voip-ucaas` | telecom-media | technology-media | telecom |
| `manufacturer` | manufacturing-media, industrial-media | engineering-media, construction-media | manufacturing, industrial, hardware, engineering |
| `ecommerce` | ecommerce-retail-media | marketing-media | ecommerce, retail |
| `startup` | startup-media, startup-launch-platform | contributor-platform, technology-media | saas, software |
| `local-business` | local-business-media | — | general |
| `hr-recruitment` | hr-recruitment-media | — | hr |
| `cybersecurity` | cybersecurity-media | technology-media | cybersecurity |
| `finance-fintech` | finance-media, fintech-media | global-business-media | finance, fintech, insurance |
| `energy-cleantech` | energy-cleantech-media | industrial-media | energy |
| `agtech-food` | agriculture-food-media | manufacturing-media | agriculture |
| `hospitality-travel` | travel-hospitality-media | — | hospitality, travel |
| `healthcare` | healthcare-media | — | healthcare, biotech |
| `legal` | legal-media | — | legal |
| `marketing-agency` | marketing-media, advertising-media | ecommerce-retail-media | marketing, advertising |
| `professional-services` | global-business-media | local-business-media | general, finance, legal |

### Why categories are tiered

The first version had one category tier and every listed category scored 100.
Three pathologies followed immediately:

- **B2B SaaS and AI startup returned identical top tens** — both listed `startup-media`, so regional startup outlets tied with the specialist publications;
- **the telecom page was led by general technology media**, because `technology-media` scored exactly what `telecom-media` scored;
- **no AI publication appeared on the AI page at all.**

The fix was the rule, not the ranks: a profile's fifth-choice category is not its
first choice. Primary scores 100, adjacent 66.

## Campaign objectives

| Key | Label | Top opportunity types |
|---|---|---|
| `brand-awareness` | Brand awareness | editorial-pitch 100, editorial-submission 95, contributed-article 90 |
| `product-launch` | Product launch | product-launch 100, startup-launch 92, press-release 80 |
| `founder-exposure` | Founder exposure | podcast-guest 100, expert-source 88, contributed-article 86 |
| `thought-leadership` | Thought leadership | contributed-article 100, guest-application 92, editorial-submission 84 |
| `seo-visibility` | Search visibility | contributed-article 100, editorial-submission 92, self-publish 82 |
| `press-release-distribution` | Press release distribution | press-release 100, company-profile 40, self-publish 35 |
| `lead-generation` | Lead generation | sponsored-content 92, newsletter-submission 88, company-profile 84 |
| `expert-positioning` | Expert positioning | expert-source 100, journalist-source 96, contributed-article 78 |
| `podcast-appearance` | Podcast appearance | podcast-guest 100, expert-source 46 |
| `newsletter-sponsorship` | Newsletter sponsorship | newsletter-submission 96, sponsored-content 92, media-partnership 70 |
| `contributed-content` | Contributed content | contributed-article 100, guest-application 94, editorial-submission 82 |
| `local-awareness` | Local awareness | editorial-pitch 96, press-release 88, editorial-submission 86 |

This is where the dataset's refusal to flatten opportunity types pays off: a wire
is excellent for distributing a release and irrelevant for founder exposure.

## Fit strengths

| Signal | Value |
|---|---|
| Primary category | 100 |
| Industry | 78 |
| Adjacent category | 66 |
| Keyword in the platform's own prose | 55 |
| General business publication | 26 |
| No signal | 10 |

## The formula

    fit     = businessFit x 0.45 + objectiveFit x 0.35 + geographyFit x 0.20
    quality = mediaScore, or 55 x 0.75 when unscored
    score   = clamp(round(fit / 100 x quality x 1.18), 0, 100)

A **weighted blend, not a product**. Multiplying three sub-100 fractions drives
almost everything into single digits and the ranking stops discriminating at the
top. The blend keeps the range usable while letting any one weak fit pull a
result down hard.

An unscored platform is still recommended, at a discount, because "we could not
score it" is a statement about our research, not a fault in the platform.

## Levels

- **85–100** Priority
- **70–84** Strong
- **55–69** Useful
- **40–54** Marginal
- **0–39** Low fit

## Exclusions

Explicit negative evidence disqualifies outright:

- the platform has closed, is dormant or redirects elsewhere;
- it was rejected on quality grounds;
- it offers **no** opportunity type capable of delivering the requested objective.

**Missing evidence never excludes.** An unknown route scores a neutral 45 for
objective fit rather than zero.

## Page suppression

A recommendation page is generated only when it has **at least 5 results** and
**at least 5 results with a specific business fit** — category, industry,
adjacent or keyword, not merely "a general business publication".

Currently suppressed: **hr-recruitment, hospitality-travel, healthcare, legal**.
Each has specialist publications in the registry, but their submission routes are
all still unresearched, so the page would have ranked general business titles
that read identically on every profile page. Suppressing is more honest than
publishing, and the build prints what it suppressed.

## Explainability

Every recommendation carries its score, level, Media Score, business fit reason,
objective fit reason, geography fit reason, and any uncertainty ("behind a bot
filter — confirm the route in a browser"). No recommendation says "AI recommends
this."

## Limitations

- Geography fit treats a `global` audience as reaching any market at 78. That is an editorial reading, not a measurement.
- Keyword matching reads the platform's own prose, which is short. It is the weakest signal and is priced accordingly.
- Objectives are mapped to opportunity types by documented editorial judgement, not derived from outcome data. Nobody here has outcome data.
