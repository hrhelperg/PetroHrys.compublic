// scripts/lib/bd-seo.cjs
'use strict';

const routes = require('./bd-routes.cjs');
// Titles, breadcrumbs and JSON-LD all name a record through the one display
// resolver, so a page cannot show a different name from its structured data.
const S = require('./bd-schema.cjs');

// The canonical public host. Production serves the apex and 301-redirects
// www.petrohrys.com to it, so every absolute URL this section emits — canonical,
// Open Graph, JSON-LD, breadcrumbs, sitemap and RSS — must use the apex. A
// canonical pointing at a redirecting hostname makes every page self-reference a
// URL that does not serve, and fills the sitemap with URLs that redirect.
//
// This is the ONLY place the host is written. Nothing else may hard-code it.
const ORIGIN = 'https://petrohrys.com';
const SITE_NAME = 'Petro Hrys';
const TWITTER_SITE = '@petrohrys';
const OG_IMAGE = `${ORIGIN}/images/og-default.png`;
const NOINDEX = 'noindex,follow';
const BASE = routes.BASE;

class SeoError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SeoError';
  }
}

// Hard-coded origin: never read a hostname from the environment, so an apex or
// preview-domain URL can never be emitted.
function absoluteUrl(pathname) {
  if (typeof pathname !== 'string' || pathname.trim() === '') {
    throw new SeoError(`Invalid path: ${JSON.stringify(pathname)}`);
  }
  let p = pathname.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(p)) {
    let parsed;
    try {
      parsed = new URL(p);
    } catch {
      throw new SeoError(`Invalid URL: ${p}`);
    }
    if (parsed.origin !== ORIGIN) {
      throw new SeoError(`Refusing to emit a URL outside ${ORIGIN}: ${p}`);
    }
    p = parsed.pathname;
  }
  p = p.split('#')[0].split('?')[0];
  if (!p.startsWith('/')) p = `/${p}`;
  p = p.replace(/\/{2,}/g, '/');
  if (p.split('/').includes('..')) {
    throw new SeoError(`Path traversal is not allowed: ${pathname}`);
  }
  return `${ORIGIN}${p}`;
}

// Outbound directory websites are registry data, so treat them as untrusted.
// HTTPS only, matching the registry validator exactly: two components
// disagreeing about what a valid URL is means the looser one eventually
// renders something the stricter one rejected.
function safeExternalUrl(value) {
  if (typeof value !== 'string') return null;
  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  return parsed.toString();
}

function breadcrumbList(trail) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((entry, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: entry.name,
      item: absoluteUrl(entry.path),
    })),
  };
}

function collectionPage({ name, description, url }) {
  return {
    '@type': 'CollectionPage',
    name,
    description,
    url,
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: `${ORIGIN}/` },
  };
}

function webPage({ name, description, url }) {
  return {
    '@type': 'WebPage',
    name,
    description,
    url,
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: `${ORIGIN}/` },
  };
}

// Returns null when there is nothing real to list, so callers omit the node
// entirely rather than publishing an empty or placeholder ItemList.
function itemList(items) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return {
    '@type': 'ItemList',
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      url: absoluteUrl(item.path),
    })),
  };
}

function faqPage(faqs) {
  if (!Array.isArray(faqs) || faqs.length === 0) return null;
  return {
    '@type': 'FAQPage',
    mainEntity: faqs.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };
}

function organisationAbout(directory) {
  const about = { '@type': 'Organization', name: S.displayName(directory) };
  const url = safeExternalUrl(directory.website);
  if (url) about.url = url;
  return about;
}

function meta({ title, description, canonicalPath, robots, breadcrumbTrail, graph }) {
  const canonical = absoluteUrl(canonicalPath);
  const fullTitle = `${title} — ${SITE_NAME}`;
  return {
    title,
    fullTitle,
    description,
    canonicalPath,
    canonical,
    robots: robots || undefined,
    openGraph: {
      title: fullTitle,
      description,
      url: canonical,
      type: 'website',
      siteName: SITE_NAME,
      image: OG_IMAGE,
    },
    twitter: {
      card: 'summary_large_image',
      site: TWITTER_SITE,
      title: fullTitle,
      description,
      image: OG_IMAGE,
    },
    breadcrumbTrail,
    jsonLd: graph.filter(Boolean),
  };
}

const ROOT_TRAIL = [
  { name: 'Home', path: '/' },
  { name: 'Research', path: '/research/' },
  { name: 'Business Directories', path: BASE },
];

function buildHubMeta({ countries = [], faqs = [] } = {}) {
  const title = 'Business Directories';
  const description = 'A country-by-country research index of business directories, '
    + 'recording what each one accepts, how listing works, and when it was last verified.';
  const trail = ROOT_TRAIL;
  return meta({
    title,
    description,
    canonicalPath: BASE,
    robots: undefined,
    breadcrumbTrail: trail,
    graph: [
      collectionPage({ name: title, description, url: absoluteUrl(BASE) }),
      itemList(countries),
      faqPage(faqs),
      breadcrumbList(trail),
    ],
  });
}

function buildCountryMeta({ country, categories = [], directories = [], faqs = [] }) {
  const canonicalPath = routes.countryPath(country.slug);
  // A country may override the generated title. "Business Directories in
  // Global" is not English; the Global scope needs its own phrasing.
  const title = country.pageTitle || `Business Directories in ${country.name}`;
  const description = `Business directories relevant to companies operating in ${country.titleName}, `
    + 'organised by category and verified by hand.';
  const trail = [...ROOT_TRAIL, { name: country.name, path: canonicalPath }];
  const populated = directories.length > 0;
  return meta({
    title,
    description,
    canonicalPath,
    robots: populated ? undefined : NOINDEX,
    breadcrumbTrail: trail,
    graph: [
      collectionPage({ name: title, description, url: absoluteUrl(canonicalPath) }),
      populated ? itemList(categories) : null,
      faqPage(faqs),
      breadcrumbList(trail),
    ],
  });
}

function buildCategoryMeta({ country, category, directories = [] }) {
  const countryPath = routes.countryPath(country.slug);
  const canonicalPath = routes.categoryPath(country.slug, category.slug);
  const title = `${category.name} directories in ${country.name}`;
  const description = `${category.description} This page covers ${country.titleName}.`;
  const trail = [
    ...ROOT_TRAIL,
    { name: country.name, path: countryPath },
    { name: category.name, path: canonicalPath },
  ];
  return meta({
    title,
    description,
    canonicalPath,
    robots: directories.length > 0 ? undefined : NOINDEX,
    breadcrumbTrail: trail,
    graph: [
      collectionPage({ name: title, description, url: absoluteUrl(canonicalPath) }),
      itemList(directories.map((d) => ({ name: S.displayName(d), path: routes.directoryPathFor(d) }))),
      breadcrumbList(trail),
    ],
  });
}

// Editorial articles. Article schema, never FAQPage unless the caller supplies
// FAQ content that is actually rendered on the page.
function buildArticleMeta({ article, faqs = [] }) {
  const canonicalPath = routes.articlePath(article.slug);
  const trail = [
    ...ROOT_TRAIL,
    { name: 'Guides', path: routes.articlesPath() },
    { name: article.title, path: canonicalPath },
  ];
  const node = {
    '@type': 'Article',
    headline: article.title,
    description: article.description,
    url: absoluteUrl(canonicalPath),
    inLanguage: 'en',
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: `${ORIGIN}/` },
    author: { '@type': 'Person', name: SITE_NAME, url: `${ORIGIN}/` },
    publisher: { '@type': 'Person', name: SITE_NAME, url: `${ORIGIN}/` },
  };
  if (article.dateModified) node.dateModified = article.dateModified;
  return meta({
    title: article.title,
    description: article.description,
    canonicalPath,
    robots: undefined,
    breadcrumbTrail: trail,
    graph: [node, faqPage(faqs), breadcrumbList(trail)],
  });
}

function buildArticleIndexMeta({ articles = [] }) {
  const canonicalPath = routes.articlesPath();
  const title = 'Business Directory Guides';
  const description = 'Editorial guides to business directories, drawn from the verified '
    + 'PetroHrys directory dataset.';
  const trail = [...ROOT_TRAIL, { name: 'Guides', path: canonicalPath }];
  return meta({
    title, description, canonicalPath, robots: undefined, breadcrumbTrail: trail,
    graph: [
      collectionPage({ name: title, description, url: absoluteUrl(canonicalPath) }),
      itemList(articles.map((a) => ({ name: a.title, path: routes.articlePath(a.slug) }))),
      breadcrumbList(trail),
    ],
  });
}

// The employee working list. One page, deliberately: 500-700 opportunities must
// not become 500-700 thin detail pages, and sixteen new geographies must not
// become sixteen one-record country pages.
// One page per business profile. Same shape as the opportunities meta because
// they are the same kind of page — a collection with a documented selection
// rule — and the trail keeps the profile pages under Opportunities rather than
// inventing a second top-level section.
function buildRecommendationMeta({ label, slug, blurb, count }) {
  const canonicalPath = routes.recommendationPath(slug);
  const title = `Best business directories for ${label}`;
  const description = `${count} platforms ranked for ${label}, scored on fit and platform `
    + 'quality with the reason for every recommendation shown.';
  const trail = [...ROOT_TRAIL,
    { name: 'Opportunities', path: `${routes.BASE}opportunities/` },
    { name: label, path: canonicalPath }];
  return meta({
    title, description, canonicalPath, robots: undefined, breadcrumbTrail: trail,
    graph: [
      collectionPage({ name: title, description: blurb, url: absoluteUrl(canonicalPath) }),
      breadcrumbList(trail),
    ],
  });
}

// The marketplaces dataset is a sibling section, so it gets its own root trail
// rather than hanging off the business-directories breadcrumb — the two answer
// different questions and neither is a child of the other.
// The title said "in Europe" for four waves after the dataset stopped being
// European. Waves M2 to M5 added North America, Australia, Asia, Latin America
// and Africa without touching this string, so a page holding platforms in
// Brazil, Nigeria and Japan described itself as a European collection — and
// would never match anyone looking for those markets.
//
// The geography claim is gone rather than corrected. Naming continents means
// maintaining a country-to-continent mapping this repository does not have, and
// the next wave would stale it the same way. The country count is derived from
// the rows and cannot.
function buildMarketplacesMeta({ count, countries }) {
  const canonicalPath = '/research/marketplaces/';
  const title = 'Marketplace and classified platforms';
  const description = `${count} platforms across ${countries} countries where a business `
    + 'or a person can publish a listing, with type, cost and who may list for each.';
  const trail = [ROOT_TRAIL[0], { name: 'Marketplaces', path: canonicalPath }];
  return meta({
    title, description, canonicalPath, robots: undefined, breadcrumbTrail: trail,
    graph: [
      collectionPage({ name: title, description, url: absoluteUrl(canonicalPath) }),
      breadcrumbList(trail),
    ],
  });
}

// Media, PR & Publishing Platforms. A sibling collection, not a child of the
// business-directory hub — it answers a different question and neither is a
// parent of the other, so the trail is Home / Research / Media.
//
// Every number is derived. The marketplace page hardcoded a geography and kept
// asserting it through four waves that moved the dataset; nothing here states a
// count or a coverage claim that the dataset does not compute.
function buildMediaMeta({ count, countries, p1 }) {
  const canonicalPath = '/research/media-pr-publishing/';
  const title = 'Media, PR & Publishing Platforms';
  const description = `${count} media outlets, press release networks, contributor programmes and `
    + `journalist-source platforms across ${countries} markets, with the opportunity type, the cost `
    + `and the submission route for each. ${p1} are top-priority.`;
  const trail = [ROOT_TRAIL[0], { name: 'Media, PR & Publishing', path: canonicalPath }];
  return meta({
    title, description, canonicalPath, robots: undefined, breadcrumbTrail: trail,
    graph: [
      collectionPage({ name: title, description, url: absoluteUrl(canonicalPath) }),
      breadcrumbList(trail),
    ],
  });
}

// A media recommendation page. Indexable only where it carries real utility —
// the generator refuses to emit one below a minimum recommendation count, so a
// thin page cannot exist to be indexed in the first place.
function buildMediaProfileMeta({ profile, count, objectiveLabel, canonicalPath, collectionPath }) {
  const title = `Media opportunities for ${profile.label}`;
  const description = `${count} ranked media, PR and publishing opportunities for a `
    + `${profile.label.toLowerCase()} business, scored on category fit, ${objectiveLabel.toLowerCase()} `
    + 'fit and the quality of the opportunity itself, with the reason for each ranking.';
  const trail = [ROOT_TRAIL[0], { name: 'Media, PR & Publishing', path: collectionPath },
    { name: profile.label, path: canonicalPath }];
  return meta({
    title, description, canonicalPath, robots: undefined, breadcrumbTrail: trail,
    graph: [
      collectionPage({ name: title, description, url: absoluteUrl(canonicalPath) }),
      breadcrumbList(trail),
    ],
  });
}

// Tender & Procurement Platforms. A fourth sibling collection, same trail shape
// as marketplaces and media. Every number is derived from the dataset: a
// hardcoded count is a claim the data cannot correct, which is the lesson the
// marketplace description already paid for once.
function buildTendersMeta({ count, countries }) {
  const canonicalPath = '/research/tenders-procurement/';
  const title = 'Tender & Procurement Platforms';
  const description = `${count} verified public and institutional procurement platforms, tender `
    + `portals and supplier systems across ${countries} jurisdictions, with the discovery, `
    + 'registration and submission route for each where evidence establishes it.';
  const trail = [ROOT_TRAIL[0], { name: 'Tenders & Procurement', path: canonicalPath }];
  return meta({
    title, description, canonicalPath, robots: undefined, breadcrumbTrail: trail,
    graph: [
      collectionPage({ name: title, description, url: absoluteUrl(canonicalPath) }),
      breadcrumbList(trail),
    ],
  });
}

// Country Intelligence. ONE page whose country is a FILTER, and therefore ONE
// canonical URL with no query string in it.
//
// 124 countries x 4 collections is 496 routes, 172 of them under five rows, and
// this repository settled that question once already: build-business-directories
// publishes one worklist for every actionable opportunity rather than "a country
// page per geography", so that sixteen new geographies could arrive without
// generating a single thin page. The reasoning applies with more force here,
// because a country's four channel lists are one reading task, not four pages.
//
// The consequence for this function is the part that must not drift: the
// canonical is the bare route. A filtered view — ?country=italy&collection=media
// — is a state of one page and not a second document, and canonicalizing to it
// would ask a crawler to index 2,816 rows under thousands of near-identical
// URLs. absoluteUrl() strips a query string anyway; saying so here is what makes
// that a decision rather than an accident.
function buildCountriesMeta({ countries, sources }) {
  const canonicalPath = '/research/countries/';
  const title = 'Country Intelligence';
  // Both numbers are derived from the corpus by the caller. They count what this
  // research holds — never a share of a market, which would need a denominator
  // nobody has.
  const description = `${sources} verified sources across ${countries} countries: business `
    + 'directories, marketplace and classified platforms, media and PR platforms and tender '
    + 'portals, filtered by country, cost, readiness and Domain Rating on one page.';
  const trail = [ROOT_TRAIL[0], { name: 'Country Intelligence', path: canonicalPath }];
  return meta({
    title, description, canonicalPath, robots: undefined, breadcrumbTrail: trail,
    graph: [
      collectionPage({ name: title, description, url: absoluteUrl(canonicalPath) }),
      breadcrumbList(trail),
    ],
  });
}

// Procurement Intelligence. ONE page, deliberately. The brief sketched a dozen
// candidate routes (/best/foreign-suppliers/, /best/telecom/, ...) and warned in
// the same breath against near-duplicate SEO pages. Those answers share one
// dataset, one methodology and one set of caveats; split across twelve routes
// they would be twelve thin pages differing by a sort order. Kept together they
// are one substantial page a supplier can actually work through.
// Tender Opportunities. ONE page again, and for a sharper reason than the
// Intelligence page: these records EXPIRE. A per-tender route would mint
// thousands of URLs whose content is dead in six weeks, and a site that
// publishes ten thousand expired pages has not built an index, it has built a
// graveyard with a sitemap. The page is indexable because it carries durable
// explanatory content — what the sources are, what is knowable, what is not —
// and the volatile part lives in a CSV rather than in the crawl surface.
// Tender Monitoring. Indexable, and for a reason that survives a quiet day:
// the page carries durable first-party methodology — what change detection
// tracks, why a disappearance is not a cancellation, what "newly observed"
// means — independently of how many alerts happen to exist this morning. A
// page whose only content is a volatile list is a thin page most of the time.
//
// Filter states are NOT routes and never enter the sitemap.
function buildMonitoringMeta({ alerts, sources, canonicalPath }) {
  const title = 'Tender Monitoring';
  const description = 'What changed in public procurement between validated snapshots: new '
    + `notices, deadline changes, cancellations and awards across ${sources} official sources, `
    + 'matched to supplier profiles with the reason and the remaining uncertainty shown.';
  const trail = [ROOT_TRAIL[0], { name: 'Tenders & Procurement', path: '/research/tenders-procurement/' },
    { name: title, path: canonicalPath }];
  return meta({
    title, description, canonicalPath, robots: undefined, breadcrumbTrail: trail,
    graph: [
      collectionPage({ name: title, description, url: absoluteUrl(canonicalPath) }),
      breadcrumbList(trail),
    ],
  });
}

function buildOpportunitiesIntelligenceMeta({ current, sources, canonicalPath }) {
  const title = 'Tender Opportunities';
  const description = `${current} currently open procurement opportunities ingested from `
    + `${sources} official sources, matched to supplier profiles by published classification `
    + 'codes — with the source, deadline, status basis and remaining uncertainty shown for each.';
  const trail = [ROOT_TRAIL[0], { name: 'Tenders & Procurement', path: '/research/tenders-procurement/' },
    { name: title, path: canonicalPath }];
  return meta({
    title, description, canonicalPath, robots: undefined, breadcrumbTrail: trail,
    graph: [
      collectionPage({ name: title, description, url: absoluteUrl(canonicalPath) }),
      breadcrumbList(trail),
    ],
  });
}

// One canonical procurement record.
//
// The title is the buyer's own, in the buyer's own language, and is never
// translated. Because many procurements share a title, the buyer is appended
// as a FACT rather than as padding, so two pages with the same title are still
// distinguishable in a result list.
function buildOpportunityDetailMeta({
  title, buyer, where, deadline, sourceName, reference, canonicalPath, indexable,
}) {
  const parts = [title];
  if (buyer) parts.push(buyer);
  const fullTitle = `${parts.join(' — ')} | Tender opportunity`;
  const facts = [];
  if (buyer) facts.push(`Buyer: ${buyer}`);
  if (where) facts.push(`Location: ${where}`);
  if (deadline) facts.push(`Closes: ${deadline}`);
  if (reference) facts.push(`Reference: ${reference}`);
  if (sourceName) facts.push(`Published by ${sourceName}`);
  const description = facts.length
    ? `${facts.join('. ')}. Source record, provenance and supplier-profile relevance.`
    : 'Procurement opportunity record with source provenance and supplier-profile relevance.';
  const trail = [ROOT_TRAIL[0],
    { name: 'Tenders & Procurement', path: '/research/tenders-procurement/' },
    { name: 'Tender Opportunities', path: '/research/tenders-procurement/opportunities/' },
    { name: title, path: canonicalPath }];
  return meta({
    title: fullTitle,
    description: description.slice(0, 300),
    canonicalPath,
    // Source-visible noindex: a crawler reads the HTML, so a client-injected
    // tag would be worth nothing.
    robots: indexable ? undefined : NOINDEX,
    breadcrumbTrail: trail,
    // Conservative schema only. There is no schema.org type for a tender, and
    // Product/Offer/Event would be a fabricated rich snippet.
    graph: [
      webPage({ name: fullTitle, description, url: absoluteUrl(canonicalPath) }),
      breadcrumbList(trail),
    ],
  });
}

function buildTendersIntelligenceMeta({ scored, profiles, canonicalPath }) {
  const title = 'Procurement Intelligence';
  const description = `Which procurement systems to investigate first, by supplier type and `
    + `objective. ${scored} platforms scored on discoverability, onboarding, submission `
    + `capability and evidence certainty, across ${profiles} supplier profiles — with the `
    + 'evidence level and the reason shown for every recommendation.';
  const trail = [ROOT_TRAIL[0], { name: 'Tenders & Procurement', path: '/research/tenders-procurement/' },
    { name: title, path: canonicalPath }];
  return meta({
    title, description, canonicalPath, robots: undefined, breadcrumbTrail: trail,
    graph: [
      collectionPage({ name: title, description, url: absoluteUrl(canonicalPath) }),
      breadcrumbList(trail),
    ],
  });
}

// The Distribution Planner. Indexable because it carries substantial static
// explanatory content and a complete prerendered plan — not because it targets
// a keyword. Its query combinations are NOT separate pages and never enter the
// sitemap.
function buildPlannerMeta({ collections, total, canonicalPath }) {
  const title = 'Distribution Planner';
  const description = `Choose a business, objective, market and budget and get a ranked plan across `
    + `all ${collections} Research Center databases — ${total} opportunities spanning business `
    + 'directories, marketplaces and media, each with its action, cost, evidence and native quality.';
  const trail = [ROOT_TRAIL[0], { name: 'Distribution Planner', path: canonicalPath }];
  return meta({
    title, description, canonicalPath, robots: undefined, breadcrumbTrail: trail,
    graph: [
      collectionPage({ name: title, description, url: absoluteUrl(canonicalPath) }),
      breadcrumbList(trail),
    ],
  });
}

function buildOpportunitiesMeta() {
  const canonicalPath = `${routes.BASE}opportunities/`;
  const title = 'Business Listing Opportunities';
  const description = 'A working list of platforms where a business can create, claim or apply '
    + 'for a public profile, with cost, listing action and priority for each.';
  const trail = [...ROOT_TRAIL, { name: 'Opportunities', path: canonicalPath }];
  return meta({
    title, description, canonicalPath, robots: undefined, breadcrumbTrail: trail,
    graph: [
      collectionPage({ name: title, description, url: absoluteUrl(canonicalPath) }),
      breadcrumbList(trail),
    ],
  });
}

function buildDirectoryMeta({ country, category, directory, indexable = true }) {
  const countryPath = routes.countryPath(country.slug);
  const canonicalPath = routes.directoryPath(country.slug, directory.slug);
  // A subnational record is titled by its jurisdiction, not its country. Four
  // states publish a register officially called "Business Entity Search", so
  // titling them all "… — United States" produces duplicate titles across
  // distinct pages — a real defect for both readers and search engines.
  const place = directory.jurisdiction && directory.jurisdiction.name
    ? directory.jurisdiction.name
    : country.name;
  const title = `${S.displayName(directory)} — ${place}`;
  const description = directory.description;
  const trail = [
    ...ROOT_TRAIL,
    { name: country.name, path: countryPath },
    { name: category.name, path: routes.categoryPath(country.slug, category.slug) },
    { name: S.displayName(directory), path: canonicalPath },
  ];
  const page = webPage({ name: S.displayName(directory), description, url: absoluteUrl(canonicalPath) });
  page.about = organisationAbout(directory);
  return meta({
    title,
    description,
    canonicalPath,
    // A record that fails the meaningful-content contract keeps its page and
    // every link on it, but leaves the index and the sitemap.
    robots: indexable ? undefined : NOINDEX,
    breadcrumbTrail: trail,
    graph: [page, breadcrumbList(trail)],
  });
}

// Escapes only the characters that can terminate a script element or break a
// JavaScript parse. All other Unicode is preserved verbatim.
function renderJsonLd(graph) {
  const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return `  <script type="application/ld+json">\n${json}\n  </script>`;
}

module.exports = {
  ORIGIN, SeoError, absoluteUrl, safeExternalUrl, renderJsonLd,
  breadcrumbList, collectionPage, webPage, itemList, faqPage, organisationAbout,
  buildHubMeta, buildCountryMeta, buildCategoryMeta, buildDirectoryMeta,
  buildArticleMeta, buildArticleIndexMeta, buildOpportunitiesMeta, buildRecommendationMeta,
  buildMarketplacesMeta,
  buildCountriesMeta,
  buildMediaMeta,
  buildMediaProfileMeta,
  buildPlannerMeta,
  buildTendersMeta,
  buildTendersIntelligenceMeta,
  buildOpportunitiesIntelligenceMeta,
  buildOpportunityDetailMeta,
  buildMonitoringMeta,
};
