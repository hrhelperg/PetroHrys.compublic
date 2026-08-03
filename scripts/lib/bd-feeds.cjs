// scripts/lib/bd-feeds.cjs
'use strict';
const { escapeXml } = require('./bd-util.cjs');
const { absoluteUrl } = require('./bd-seo.cjs');

const FEED_PATH = '/research/business-directories/feed.xml';

function renderSitemap(entries) {
  const urls = entries.map((entry) => {
    const lastmod = entry.lastmod ? `\n    <lastmod>${escapeXml(entry.lastmod)}</lastmod>` : '';
    return `  <url>\n    <loc>${escapeXml(absoluteUrl(entry.path))}</loc>${lastmod}\n  </url>`;
  }).join('\n');
  const body = urls ? `\n${urls}\n` : '\n';
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>
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
