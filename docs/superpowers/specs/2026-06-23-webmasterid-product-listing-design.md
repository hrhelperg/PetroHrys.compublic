# WebmasterID — product listing + landing page

Date: 2026-06-23
Branch: `feat/international-editorial-parity`

## Goal

Add WebmasterID to petrohrys.com as a first-class product, with full parity
to the other products and a dedicated landing page, in EN/ES/FR/DE.

## Positioning (owner decision)

Lead with a **superlative** ("best privacy-first analytics") per the owner's
explicit instruction. This intentionally departs from the documented
"factual capabilities only" WebmasterID policy and the otherwise
superlative-free editorial voice — the owner was informed and chose the
superlative. Underlying capability claims stay **factual**:

- privacy-first, **cookieless by default**
- **consent-gated** (loads only after analytics consent; integrates with
  consent tools such as CookieYes)
- measures traffic sources, acquisition channels, visitor behaviour,
  conversion performance
- Web platform; single lightweight tracker snippet

### Localized one-line description (product lists)

| Lang | Description |
|------|-------------|
| EN | The best privacy-first analytics on the web. |
| ES | La mejor analítica web centrada en la privacidad. |
| FR | La meilleure analytique web axée sur la confidentialité. |
| DE | Die beste datenschutzfreundliche Web-Analyse. |

## Placement

1. Homepage **Selected products** — `index.html` + `es|fr|de/index.html` (first item).
2. `/work/` **Featured products** + **All products** — `work/` + `es|fr|de/work/` (first item).
3. Editorial footer **Products** — all 20 pages with `id="footer-tools"` (first item).
   EN footers link `/webmasterid/`; locale footers link `/<lang>/webmasterid/`.
4. New landing page **`/webmasterid/`** + `es|fr|de/webmasterid/`.
5. `sitemap.xml` — add the 4 URLs.

## Landing page

Built in the existing **green product-template** design language (same tokens,
nav, cards, FAQ accordion, dark footer) for visual consistency with the other
product pages — but **lean and fully factual**:

- Sections: head + consent-gated analytics scripts, nav + lang switcher,
  breadcrumb, hero (superlative tagline + `Visit WebmasterID` CTA → external
  https://www.webmasterid.com, new tab, `rel="noopener"`), "why" cards,
  features grid, how-it-works (3 steps), FAQ, final CTA, dark footer.
- **Excluded by design:** fabricated `aggregateRating`, competitor comparison
  table, and any image/OG asset that does not exist in the repo (text/logo
  treatment only; `og:image` omitted).
- Schema: `SoftwareApplication` (BusinessApplication, operatingSystem Web,
  author Petro Hrys) + `FAQPage`. No rating, no offers.

## Constraints / non-goals

- Do not fabricate ratings, review counts, competitor claims, or screenshots.
- Do not touch product/tool or startup-directory pages beyond the footer
  Products list parity already scoped (those use a different footer and are
  out of scope).
- Localized pages keep identical structure/markup/CSS; only visible copy,
  `lang`, hreflang self-reference, canonical, lang-switcher active state, and
  internal `/<lang>/...` links change.

## Verification

- Footer Products entry present on all 20 editorial pages, locale-correct link.
- Homepage + /work lists show WebmasterID first, localized copy.
- 4 landing pages exist, valid, internally consistent, no broken image refs,
  CTA → webmasterid.com, no fabricated data.
- sitemap includes the 4 URLs.
