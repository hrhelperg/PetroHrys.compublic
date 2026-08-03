// scripts/lib/bd-seo.cjs
'use strict';

const ORIGIN = 'https://www.petrohrys.com';
const SITE_NAME = 'Petro Hrys';
const TWITTER_SITE = '@petrohrys';
const OG_IMAGE = `${ORIGIN}/images/og-default.png`;
const NOINDEX = 'noindex,follow';
const BASE = '/research/business-directories/';

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

// Outbound directory websites are registry data, so treat them as untrusted:
// anything that is not a well-formed http(s) URL becomes null and is omitted.
function safeExternalUrl(value) {
  if (typeof value !== 'string') return null;
  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
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
  const about = { '@type': 'Organization', name: directory.name };
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
    + 'recording what each one accepts, how it links, and when it was last verified.';
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
  const canonicalPath = `${BASE}${country.slug}/`;
  const title = `Business Directories in ${country.name}`;
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
  const countryPath = `${BASE}${country.slug}/`;
  const canonicalPath = `${countryPath}categories/${category.slug}/`;
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
      itemList(directories.map((d) => ({ name: d.name, path: `${countryPath}${d.slug}/` }))),
      breadcrumbList(trail),
    ],
  });
}

function buildDirectoryMeta({ country, category, directory }) {
  const countryPath = `${BASE}${country.slug}/`;
  const canonicalPath = `${countryPath}${directory.slug}/`;
  const title = `${directory.name} — ${country.name}`;
  const description = directory.description;
  const trail = [
    ...ROOT_TRAIL,
    { name: country.name, path: countryPath },
    { name: category.name, path: `${countryPath}categories/${category.slug}/` },
    { name: directory.name, path: canonicalPath },
  ];
  const page = webPage({ name: directory.name, description, url: absoluteUrl(canonicalPath) });
  page.about = organisationAbout(directory);
  return meta({
    title,
    description,
    canonicalPath,
    robots: undefined,
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
};
