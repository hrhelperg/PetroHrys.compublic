// scripts/lib/bd-feeds.cjs
'use strict';
const { escapeXml } = require('./bd-util.cjs');
const { absoluteUrl } = require('./bd-seo.cjs');

const FEED_PATH = '/research/business-directories/feed.xml';

// Emits every locale of every indexable route, each carrying the full
// alternate cluster.
//
// It previously emitted the English URL only, so 1,200 localized Business
// Directory pages existed, were indexable, were linked from the site — and
// appeared in no sitemap at all. The locale list comes from the registry rather
// than being spelled out, so a fifth locale needs no edit here.
//
// The xhtml:link alternates are the structure search engines expect for
// internationalized sitemaps: each URL entry declares the whole cluster,
// including itself, which is also what makes the reciprocity structural rather
// than something a maintainer has to keep in sync by hand.
function renderSitemap(entries, { locales = null } = {}) {
  const I18N = require('./i18n.cjs');
  const codes = locales || I18N.LOCALE_CODES;

  const urls = entries.flatMap((entry) => {
    const lastmod = entry.lastmod ? `\n    <lastmod>${escapeXml(entry.lastmod)}</lastmod>` : '';
    const alternates = codes.map((code) => {
      const href = absoluteUrl(I18N.localizedPath(code, entry.path));
      return `\n    <xhtml:link rel="alternate" hreflang="${code}" href="${escapeXml(href)}"/>`;
    }).join('')
      + `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(absoluteUrl(entry.path))}"/>`;

    return codes.map((code) => {
      const loc = absoluteUrl(I18N.localizedPath(code, entry.path));
      return `  <url>\n    <loc>${escapeXml(loc)}</loc>${lastmod}${alternates}\n  </url>`;
    });
  }).join('\n');

  const body = urls ? `\n${urls}\n` : '\n';
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${body}</urlset>
`;
}

function renderRss(items) {
  const entries = items.map((item) => `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(absoluteUrl(item.path))}</link>
      <guid isPermaLink="true">${escapeXml(absoluteUrl(item.path))}</guid>
      <description>${escapeXml(item.description)}</description>
      <pubDate>${escapeXml(item.pubDate)}</pubDate>
    </item>`).join('\n');
  const body = entries ? `\n${entries}` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Business Directories — Petro Hrys</title>
    <link>${escapeXml(absoluteUrl('/research/business-directories/'))}</link>
    <atom:link href="${escapeXml(absoluteUrl(FEED_PATH))}" rel="self" type="application/rss+xml"/>
    <description>Manually verified business directory research from PetroHrys.com.</description>
    <language>en</language>${body}
  </channel>
</rss>
`;
}

module.exports = { renderSitemap, renderRss, FEED_PATH };
