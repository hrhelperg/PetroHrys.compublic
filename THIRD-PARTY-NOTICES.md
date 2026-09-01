# Third-Party Notices

This repository and the site it publishes refer to, link to and record
information about a great many organisations, platforms and publications, and
they load a small number of third-party services and assets at runtime.

None of that material belongs to this project. This document sets out the
boundary.

Nothing in `LICENSE.md` or `DATA-RIGHTS.md` asserts ownership over any
third-party material described here, and neither document overrides any
third-party licence. **Where a component carries its own licence or terms, that
licence or those terms govern it.**

---

## 1. Trade marks and brands

All third-party trade marks, service marks, trade names, company names,
publication names, platform names, product names and logos referred to anywhere
in this repository or on the site remain the property of their respective
owners.

They are used for identification, reference and research purposes only. Such
use does not imply any claim of ownership, and does not grant anyone any right
to use those marks.

## 2. No affiliation, endorsement or sponsorship

Inclusion of an organisation, platform, publication or website in any of the
following does **not** imply endorsement, sponsorship, partnership,
authorisation, certification or affiliation — in either direction — unless it is
explicitly stated:

- a business directory record or country/category listing;
- the marketplace and classified platform dataset;
- the media, PR and publishing platform dataset;
- the Distribution Planner or any recommendation output;
- a Research Center page, guide, comparison or ranking;
- an article, essay or other editorial content;
- any dataset, table or score published here.

A record describes a platform. It does not represent that platform, speak for
it, or indicate any relationship with it. Scores, tiers, rankings, pros, cons
and limitations published here are this project's own editorial assessment, not
statements by or on behalf of the organisations assessed.

## 3. External websites

External websites and services linked or referenced here operate under their
own terms of service, privacy policies, acceptable-use rules and intellectual
property rights. This project does not control them and is not responsible for
their content, availability or practices. Accessing them is subject to their
terms, not to this repository's.

Recording a domain name, website address, submission URL or source URL claims
nothing over that domain, that website, or the content published on it.

## 4. Factual references

Factual references to organisations, registries and websites are recorded for
informational and research purposes. Recording a fact about a third party
neither creates a right in that fact nor transfers anything belonging to that
third party to this project.

Public government and regulator registries listed in the datasets are public
records maintained by the issuing bodies. Their contents remain theirs.

## 5. Quotations and source-derived material

Where third-party wording is quoted — including operator terms of use, footer
text, policy language and site copy quoted verbatim as evidence in
`editorNotes`, `sources` and similar fields — that wording remains the property
of its original author and remains subject to its own rights and any applicable
attribution requirements. It is quoted for identification, evidence and
research purposes, to the extent applicable law permits quotation.

Any third-party image, excerpt or other material used anywhere in this
repository is likewise subject to its original rights.

## 6. Third-party services and assets loaded at runtime

These are **not redistributed by this repository**. They are referenced by URL
and fetched from their providers when a page loads. Each is governed by its
provider's own licence and terms. The list below reflects what is referenced in
the site's page shell.

| Component | Provider / source | Notes |
|---|---|---|
| Google Fonts — DM Sans, JetBrains Mono, Source Serif 4 | `fonts.googleapis.com`, `fonts.gstatic.com` | Loaded remotely; no font files are bundled in this repository. Each family is distributed by Google Fonts under the licence stated on its own family page. |
| Google Analytics 4 / Google Tag Manager | `www.googletagmanager.com` | Analytics service. Named as a processor in the site's Privacy Policy §6 (Google Ireland Ltd.). |
| WebmasterID analytics tracker | `webmasterid.com` | Loaded behind consent. WebmasterID is a HELPERG-ecosystem product; the footer credit "Analytics powered by WebmasterID." is an existing attribution and is retained. |

Consent is handled by this site's own `js/consent.js` — there is no third-party
consent-management service, and nothing is fetched to ask the question. Both
analytics providers above ship as `type="text/plain" data-consent="analytics"`
and stay inert until a visitor accepts; declining loads nothing at all. The site
previously used CookieYes, whose script began answering 403, leaving the gate
permanently shut while Google Analytics ran ungated beside it. See the header
comment in `js/consent.js` for the measurement and the reasoning.

The site's Privacy Policy (`content/legal/privacy.en.html` §6) is the
authoritative description of these providers as data processors.

## 7. Declared software dependencies

The main site has **no build dependencies and no root `package.json`** — it
ships as raw static files.

The `startups-app/` subproject is a separate Node application that declares
dependencies in `startups-app/package.json`. Its `node_modules/` is not
committed, so no third-party package source is vendored into or redistributed
by this repository. Those packages are resolved at install time and each is
governed by the licence declared in its own package metadata and shipped in its
own distribution — **that licence, not this notice, governs the package.**

Declared at the time of writing:

- Runtime: `next`, `react`, `react-dom`, `next-auth`, `@prisma/client`,
  `bcryptjs`
- Development: `prisma`, `typescript`, `tailwindcss`, `postcss`,
  `autoprefixer`, `eslint`, `eslint-config-next`, `tsx`, and the `@types/*`
  type definition packages

The authoritative licence for each is the licence file distributed inside the
installed package. This notice deliberately does not restate those licences,
because doing so from memory risks misattributing them.

## 8. Brand icons vendored into the page shell

Unlike the components in §6, these are **not fetched at runtime — they are
copied into this repository** and served from it, so they are recorded here
separately.

`js/social-profiles.js` embeds one single-path SVG mark per social platform, on
a 24×24 grid, drawn in `currentColor`. Eleven of the twelve are transcribed from
[Simple Icons](https://github.com/simple-icons/simple-icons), whose collection is
released under **CC0 1.0 Universal**. The twelfth, LinkedIn, is not carried by
Simple Icons and is drawn from the platform's own published glyph.

| Item | Source | Notes |
|---|---|---|
| X, GitHub, YouTube, Instagram, Bluesky, Substack, Medium, Reddit, Hacker Noon, Facebook, Pinterest marks | Simple Icons (`simple-icons`, v16.28.0) | Collection released under CC0 1.0. No Simple Icons code, package or tooling is bundled — only the eleven path strings, copied verbatim. |
| LinkedIn mark | LinkedIn's own published glyph | Not present in Simple Icons. Reproduced for identification only. |

The **CC0 dedication covers Simple Icons' own compilation work; it does not and
cannot waive the trade mark rights of the platforms depicted.** Each mark
remains the property of its platform, is reproduced here at icon size solely to
identify a link to the operator's own profile on that platform, and is subject
to §1 and §2 above. Several of these platforms publish brand-usage guidelines
that govern any use beyond that. No endorsement or affiliation is implied.

Simple Icons additionally asks that users read its own disclaimer before
including an icon in a project; that disclaimer, not this notice, governs the
collection.

## 9. First-party components shared across HELPERG properties

`js/ecosystem-registry.js`, `js/ecosystem-banner.js` and
`css/ecosystem-banner.css` are described in `docs/helperg-ecosystem-banner.md`
as a portable core intended to be deployed identically across HELPERG
properties. They are not third-party open-source components and are not offered
under an open-source licence by this repository. The HELPERG name and the
product names in that registry are handled as brand material of their
respective owners.

## 10. Third-party metrics in the datasets

Domain Rating values recorded in the business directories dataset are
third-party measurements. Each carries its provider, value, measurement date and
measured domain in `metricsProvenance`, and is recorded as a dated historical
snapshot. The provider recorded for these snapshots is Ahrefs. Those metrics are
third-party data; no ownership of them is claimed. See
`docs/ahrefs-domain-rating-key.md`.

## 11. Research datasets used for discovery

The Regional Media registry uses the following public datasets to discover
candidate outlets. The project republishes only selected factual outlet fields,
its own verification notes and dated Ahrefs measurements; it does not mirror
the source datasets.

| Dataset | Provider / licence | Use and attribution |
|---|---|---|
| Local News Dataset | Leon Yin, [GitHub repository](https://github.com/yinleon/LocalNewsDataset), MIT License | Used to discover United States local newspapers and broadcasters. Copyright (c) 2018 Leon Yin. The repository's MIT licence governs the source dataset and code. |
| Public Interest Publishers Index (PIPI) Q2 2026 | Gary Dickson, [project page](https://gary-dickson.com/pipi/) | Used to discover current open Australian community, local, metro and state publishers. Source export dated 1 July 2026. Citation: Dickson G. 2025. *Public Interest Publishers Index*. |
| Wikidata | Wikimedia Foundation and contributors, [Wikidata](https://www.wikidata.org/) | Used for structured discovery and geographic classification. Wikidata structured data is available under CC0 1.0. |

The source links stored on individual registry records identify where a
candidate was discovered; they are not evidence of publication access, cost or
link attributes. Those fields remain unknown until verified on the relevant
outlet page.

## 12. Provenance flagged for review

The following are recorded honestly rather than guessed at, and are listed for
the operator to confirm:

- **Image assets** (`PHOTO1.jpg`, `images/portrait-*.jpg`, product screenshots
  under `images/`, `images/logo-red.svg`, `images/og-default.png`). No
  attribution or credit metadata is present anywhere in the repository for
  these files, and none is asserted here. They are presumed to be first-party
  material of the operator or of the operator's own products. If any of them is
  in fact licensed stock, commissioned work, or otherwise third-party, that
  attribution should be added to this document.
- **`images/portrait-3.jpg`** is not referenced by any page and appears to be an
  unused asset. Noted only so that its provenance is not overlooked.
- **The relationship between Petro Hrys and the HELPERG ecosystem.** The site's
  published legal documents name Petro Hrys, sole trader, as the operator and
  rights holder. The repository also carries HELPERG ecosystem branding and a
  sibling-product registry. Which entity holds which rights across those
  properties is a question for the operator and, if needed, an attorney; this
  document does not decide it.

## 13. Corrections

If you believe material of yours is referenced here incorrectly, is attributed
incorrectly, or should be attributed and is not, please contact the operator:

- Petro Hrys — <hrhelperg@gmail.com>

Corrections to attribution will be made on their merits, and are not conditioned
on any of the rights positions asserted in `LICENSE.md` or `DATA-RIGHTS.md`.

---

See also: `LICENSE.md` · `DATA-RIGHTS.md` · `README.md`
