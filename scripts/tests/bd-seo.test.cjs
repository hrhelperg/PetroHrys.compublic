// scripts/tests/bd-seo.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const seo = require('../lib/bd-seo.cjs');

const COUNTRY = { slug: 'united-states', name: 'United States', titleName: 'the United States' };
const CATEGORY = { slug: 'saas', name: 'SaaS', description: 'Listing sites focused on subscription software.' };
const DIRECTORY = {
  id: 'us-example', slug: 'example', name: 'Example Directory',
  website: 'https://example.com', description: 'A directory.',
  country: 'united-states', category: 'saas',
};
const CAT_LINKS = [{ name: 'SaaS', path: '/research/business-directories/united-states/categories/saas/' }];
const COUNTRY_LINKS = [{ name: 'United States', path: '/research/business-directories/united-states/' }];

const types = (meta) => meta.jsonLd.map((node) => node['@type']);
const node = (meta, type) => meta.jsonLd.find((n) => n['@type'] === type);

test('ORIGIN is the canonical www host', () => {
  assert.strictEqual(seo.ORIGIN, 'https://www.petrohrys.com');
});

test('absoluteUrl joins paths without doubling slashes', () => {
  assert.strictEqual(seo.absoluteUrl('/research/business-directories/'),
    'https://www.petrohrys.com/research/business-directories/');
  assert.strictEqual(seo.absoluteUrl('research/x/'), 'https://www.petrohrys.com/research/x/');
});

test('absoluteUrl collapses duplicate slashes', () => {
  assert.strictEqual(seo.absoluteUrl('//research///x//'), 'https://www.petrohrys.com/research/x/');
});

test('absoluteUrl strips query strings and fragments', () => {
  assert.strictEqual(seo.absoluteUrl('/a/?utm_source=x#frag'), 'https://www.petrohrys.com/a/');
});

test('absoluteUrl rejects traversal segments', () => {
  assert.throws(() => seo.absoluteUrl('/a/../../etc/passwd'), seo.SeoError);
});

test('absoluteUrl rejects a URL on any other origin', () => {
  assert.throws(() => seo.absoluteUrl('https://evil.example/x'), seo.SeoError);
  assert.throws(() => seo.absoluteUrl('https://petrohrys.com/x'), seo.SeoError);
});

test('absoluteUrl rejects empty and non-string input', () => {
  assert.throws(() => seo.absoluteUrl(''), seo.SeoError);
  assert.throws(() => seo.absoluteUrl(null), seo.SeoError);
});

test('no builder ever emits an apex-domain URL', () => {
  const metas = [
    seo.buildHubMeta({ countries: COUNTRY_LINKS }),
    seo.buildCountryMeta({ country: COUNTRY, categories: CAT_LINKS, directories: [DIRECTORY] }),
    seo.buildCategoryMeta({ country: COUNTRY, category: CATEGORY, directories: [DIRECTORY] }),
    seo.buildDirectoryMeta({ country: COUNTRY, category: CATEGORY, directory: DIRECTORY }),
  ];
  for (const meta of metas) {
    const blob = JSON.stringify(meta);
    assert.ok(!/https:\/\/petrohrys\.com/.test(blob), 'apex URL leaked');
    assert.ok(meta.canonical.startsWith('https://www.petrohrys.com/'));
  }
});

test('safeExternalUrl normalises valid https urls', () => {
  assert.strictEqual(seo.safeExternalUrl('https://example.com'), 'https://example.com/');
  assert.strictEqual(seo.safeExternalUrl('  https://example.com/list  '), 'https://example.com/list');
});

test('safeExternalUrl accepts https only, matching the registry validator', () => {
  // The validator rejects any non-https website. This must agree with it, or
  // the looser rule eventually renders something the stricter one refused.
  assert.strictEqual(seo.safeExternalUrl('http://example.com'), null, 'http must be rejected');
  assert.strictEqual(seo.safeExternalUrl('HTTP://EXAMPLE.COM'), null);
});

test('safeExternalUrl rejects every dangerous or malformed scheme', () => {
  const rejected = [
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    'file:///etc/passwd',
    'ftp://example.com',
    'vbscript:msgbox(1)',
    'not a url',
    '//example.com',
    '',
    '   ',
  ];
  for (const value of rejected) {
    assert.strictEqual(seo.safeExternalUrl(value), null, `accepted ${JSON.stringify(value)}`);
  }
});

test('safeExternalUrl rejects non-string input', () => {
  for (const value of [null, undefined, 42, {}, [], true]) {
    assert.strictEqual(seo.safeExternalUrl(value), null, `accepted ${JSON.stringify(value)}`);
  }
});

test('hub metadata is complete and indexable', () => {
  const meta = seo.buildHubMeta({ countries: COUNTRY_LINKS, faqs: [{ q: 'Why?', a: 'Because.' }] });
  assert.strictEqual(meta.canonical, 'https://www.petrohrys.com/research/business-directories/');
  assert.strictEqual(meta.robots, undefined, 'hub must be indexable');
  assert.strictEqual(meta.fullTitle, 'Business Directories — Petro Hrys');
  assert.strictEqual(meta.openGraph.url, meta.canonical);
  assert.strictEqual(meta.openGraph.siteName, 'Petro Hrys');
  assert.strictEqual(meta.twitter.card, 'summary_large_image');
  assert.ok(meta.description.length > 0);
});

test('hub emits CollectionPage, ItemList, FAQPage and BreadcrumbList', () => {
  const meta = seo.buildHubMeta({ countries: COUNTRY_LINKS, faqs: [{ q: 'Why?', a: 'Because.' }] });
  assert.deepStrictEqual(types(meta), ['CollectionPage', 'ItemList', 'FAQPage', 'BreadcrumbList']);
});

test('hub omits ItemList when no country is emitted', () => {
  const meta = seo.buildHubMeta({ countries: [] });
  assert.ok(!types(meta).includes('ItemList'), 'empty ItemList must be omitted');
});

test('hub omits FAQPage when no approved faqs are supplied', () => {
  const meta = seo.buildHubMeta({ countries: COUNTRY_LINKS });
  assert.ok(!types(meta).includes('FAQPage'));
});

test('populated country metadata is indexable with an ItemList', () => {
  const meta = seo.buildCountryMeta({
    country: COUNTRY, categories: CAT_LINKS, directories: [DIRECTORY],
    faqs: [{ q: 'Q', a: 'A' }],
  });
  assert.strictEqual(meta.robots, undefined);
  assert.strictEqual(meta.canonical, 'https://www.petrohrys.com/research/business-directories/united-states/');
  assert.ok(types(meta).includes('ItemList'));
  assert.ok(types(meta).includes('FAQPage'));
  assert.strictEqual(meta.title, 'Business Directories in United States');
});

test('empty country is noindex,follow and omits ItemList', () => {
  const meta = seo.buildCountryMeta({ country: COUNTRY, categories: CAT_LINKS, directories: [] });
  assert.strictEqual(meta.robots, 'noindex,follow');
  assert.ok(!types(meta).includes('ItemList'));
  assert.ok(types(meta).includes('CollectionPage'));
  assert.ok(types(meta).includes('BreadcrumbList'));
});

test('populated category metadata is indexable with an ItemList', () => {
  const meta = seo.buildCategoryMeta({ country: COUNTRY, category: CATEGORY, directories: [DIRECTORY] });
  assert.strictEqual(meta.robots, undefined);
  assert.strictEqual(meta.canonical,
    'https://www.petrohrys.com/research/business-directories/united-states/categories/saas/');
  assert.ok(types(meta).includes('ItemList'));
});

test('empty category is noindex,follow and omits ItemList', () => {
  const meta = seo.buildCategoryMeta({ country: COUNTRY, category: CATEGORY, directories: [] });
  assert.strictEqual(meta.robots, 'noindex,follow');
  assert.ok(!types(meta).includes('ItemList'));
});

test('category never emits FAQPage', () => {
  const meta = seo.buildCategoryMeta({ country: COUNTRY, category: CATEGORY, directories: [DIRECTORY] });
  assert.ok(!types(meta).includes('FAQPage'));
});

test('directory detail emits WebPage with an Organization about', () => {
  const meta = seo.buildDirectoryMeta({ country: COUNTRY, category: CATEGORY, directory: DIRECTORY });
  assert.strictEqual(meta.robots, undefined);
  assert.strictEqual(meta.canonical,
    'https://www.petrohrys.com/research/business-directories/united-states/example/');
  const page = node(meta, 'WebPage');
  assert.strictEqual(page.about['@type'], 'Organization');
  assert.strictEqual(page.about.name, 'Example Directory');
  assert.strictEqual(page.about.url, 'https://example.com/');
});

test('directory about omits url when the website is unusable', () => {
  const meta = seo.buildDirectoryMeta({
    country: COUNTRY, category: CATEGORY,
    directory: { ...DIRECTORY, website: 'javascript:alert(1)' },
  });
  const page = node(meta, 'WebPage');
  assert.ok(!('url' in page.about), 'must not emit a bogus about.url');
  assert.ok(!JSON.stringify(meta).includes('javascript:'));
});

test('breadcrumb hierarchy is correct for every page type', () => {
  assert.deepStrictEqual(
    seo.buildHubMeta({ countries: [] }).breadcrumbTrail.map((b) => b.name),
    ['Home', 'Research', 'Business Directories']);
  assert.deepStrictEqual(
    seo.buildCountryMeta({ country: COUNTRY, categories: [], directories: [] })
      .breadcrumbTrail.map((b) => b.name),
    ['Home', 'Research', 'Business Directories', 'United States']);
  assert.deepStrictEqual(
    seo.buildCategoryMeta({ country: COUNTRY, category: CATEGORY, directories: [] })
      .breadcrumbTrail.map((b) => b.name),
    ['Home', 'Research', 'Business Directories', 'United States', 'SaaS']);
  assert.deepStrictEqual(
    seo.buildDirectoryMeta({ country: COUNTRY, category: CATEGORY, directory: DIRECTORY })
      .breadcrumbTrail.map((b) => b.name),
    ['Home', 'Research', 'Business Directories', 'United States', 'SaaS', 'Example Directory']);
});

test('BreadcrumbList positions start at 1 and use absolute urls', () => {
  const meta = seo.buildCategoryMeta({ country: COUNTRY, category: CATEGORY, directories: [] });
  const crumbs = node(meta, 'BreadcrumbList').itemListElement;
  assert.deepStrictEqual(crumbs.map((c) => c.position), [1, 2, 3, 4, 5]);
  assert.strictEqual(crumbs[1].item, 'https://www.petrohrys.com/research/');
});

test('ItemList preserves input order and numbers from 1', () => {
  const directories = [
    { ...DIRECTORY, id: 'a', slug: 'aaa', name: 'Aaa' },
    { ...DIRECTORY, id: 'b', slug: 'bbb', name: 'Bbb' },
    { ...DIRECTORY, id: 'c', slug: 'ccc', name: 'Ccc' },
  ];
  const list = node(seo.buildCategoryMeta({ country: COUNTRY, category: CATEGORY, directories }), 'ItemList');
  assert.strictEqual(list.numberOfItems, 3);
  assert.deepStrictEqual(list.itemListElement.map((i) => i.name), ['Aaa', 'Bbb', 'Ccc']);
  assert.deepStrictEqual(list.itemListElement.map((i) => i.position), [1, 2, 3]);
  assert.strictEqual(list.itemListElement[0].url,
    'https://www.petrohrys.com/research/business-directories/united-states/aaa/');
});

test('itemList returns null for an empty array', () => {
  assert.strictEqual(seo.itemList([]), null);
});

test('no builder emits a banned schema type', () => {
  const metas = [
    seo.buildHubMeta({ countries: COUNTRY_LINKS, faqs: [{ q: 'Q', a: 'A' }] }),
    seo.buildCountryMeta({ country: COUNTRY, categories: CAT_LINKS, directories: [DIRECTORY], faqs: [{ q: 'Q', a: 'A' }] }),
    seo.buildCategoryMeta({ country: COUNTRY, category: CATEGORY, directories: [DIRECTORY] }),
    seo.buildDirectoryMeta({ country: COUNTRY, category: CATEGORY, directory: DIRECTORY }),
  ];
  // Structural walk over @type rather than a substring scan: a real category is
  // named "Review Sites", and a naive scan for "Review" would false-fail on it.
  const BANNED = new Set(['AggregateRating', 'Review', 'Product', 'SearchAction']);
  const walk = (n) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (n && typeof n === 'object') {
      if (typeof n['@type'] === 'string') {
        assert.ok(!BANNED.has(n['@type']), `banned @type emitted: ${n['@type']}`);
      }
      return Object.values(n).forEach(walk);
    }
    return undefined;
  };
  for (const meta of metas) {
    walk(meta.jsonLd);
    const blob = JSON.stringify(meta);
    for (const token of ['ratingValue', 'reviewRating', 'aggregateRating', 'priceCurrency', 'bestRating']) {
      assert.ok(!blob.includes(token), `banned property emitted: ${token}`);
    }
  }
});

test('a category literally named "Review Sites" is still allowed', () => {
  const meta = seo.buildCategoryMeta({
    country: COUNTRY,
    category: { slug: 'review-sites', name: 'Review Sites', description: 'Platforms publishing customer reviews.' },
    directories: [DIRECTORY],
  });
  assert.ok(meta.title.includes('Review Sites'));
  assert.ok(!meta.jsonLd.some((n) => n['@type'] === 'Review'));
});

test('renderJsonLd makes a script breakout impossible', () => {
  const html = seo.renderJsonLd([{ '@type': 'WebPage', name: '</script><img src=x onerror=alert(1)>' }]);
  assert.ok(!html.includes('</script><img'));
  assert.ok(!/<\/script\s*>/i.test(html.replace(/<\/script>\s*$/, '')));
  assert.ok(html.includes('\\u003c'));
});

test('renderJsonLd escapes line and paragraph separators', () => {
  const LS = '\u2028';
  const PS = '\u2029';
  const html = seo.renderJsonLd([{ '@type': 'WebPage', name: `a${LS}b${PS}c` }]);
  assert.ok(!html.includes(LS), 'raw U+2028 must not survive');
  assert.ok(!html.includes(PS), 'raw U+2029 must not survive');
  assert.ok(html.includes('\\u2028'));
  assert.ok(html.includes('\\u2029'));
});

test('renderJsonLd preserves non-ASCII Unicode', () => {
  const html = seo.renderJsonLd([{ '@type': 'WebPage', name: 'Česká republika — 東京 — Ünïcodé' }]);
  assert.ok(html.includes('Česká republika'));
  assert.ok(html.includes('東京'));
  assert.ok(html.includes('Ünïcodé'));
});

test('special characters in registry data survive into JSON-LD safely', () => {
  const meta = seo.buildDirectoryMeta({
    country: COUNTRY, category: CATEGORY,
    directory: { ...DIRECTORY, name: 'A & B <Ltd> "quoted"', description: "O'Neil & Co" },
  });
  const html = seo.renderJsonLd(meta.jsonLd);
  assert.ok(html.includes('A & B \\u003cLtd\\u003e'));
  assert.ok(!html.includes('<Ltd>'));
});

test('repeated calls produce byte-identical output', () => {
  const build = () => seo.renderJsonLd(seo.buildCountryMeta({
    country: COUNTRY, categories: CAT_LINKS, directories: [DIRECTORY], faqs: [{ q: 'Q', a: 'A' }],
  }).jsonLd);
  const runs = new Set(Array.from({ length: 25 }, build));
  assert.strictEqual(runs.size, 1);
});

test('output contains no build-time timestamp or random id', () => {
  const blob = JSON.stringify(seo.buildHubMeta({ countries: COUNTRY_LINKS }));
  assert.ok(!/\d{4}-\d{2}-\d{2}T\d{2}:/.test(blob), 'no ISO timestamp may appear');
  assert.ok(!/"@id"\s*:/.test(blob), 'no generated @id may appear');
});

test('descriptions never contain fabricated counts or metrics', () => {
  const metas = [
    seo.buildHubMeta({ countries: COUNTRY_LINKS }),
    seo.buildCountryMeta({ country: COUNTRY, categories: CAT_LINKS, directories: [DIRECTORY, DIRECTORY] }),
    seo.buildCategoryMeta({ country: COUNTRY, category: CATEGORY, directories: [DIRECTORY] }),
  ];
  for (const meta of metas) {
    assert.ok(!/\d/.test(meta.description), `description must not assert a count: ${meta.description}`);
  }
});
