'use strict';

// Canonical, redirect and indexation contracts.
//
// ── WHAT GOOGLE ACTUALLY SAW ────────────────────────────────────────────────
//
// Search Console reported two things at once, and they were the same defect:
//
//   "Page with redirect"                        https://www.petrohrys.com/...
//   "Alternate page with proper canonical tag"  https://petrohrys.com/...
//
// The apex pages declared `canonical = https://www.petrohrys.com/...`, and the
// www host 301s to the apex. So Google was told the apex page was an alternate
// of a URL that redirects back to the apex. Neither could be indexed. Both
// reports were the same broken loop seen from two ends.
//
// A second, subtler version of the same contradiction survived on 1,248
// localized pages: `<link rel="canonical">` pointed at the page itself while
// `og:url` pointed at the ENGLISH page. Google treats og:url as a canonical
// hint, so a German page was quietly claiming to be the English one.
//
// These tests assert that every canonical signal a page emits agrees with every
// other one, and that nothing first-party ever points at a host that redirects.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const I18N = require('../lib/i18n.cjs');
const { ORIGIN } = require('../lib/bd-seo.cjs');

const SKIP = new Set(['.git', 'node_modules', 'startups-app', 'docs', 'scripts',
  'data', 'css', 'js', 'images', 'fonts', 'content']);

function walk(dir, ext, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (dir === ROOT && SKIP.has(e.name)) continue;
      walk(p, ext, out);
    } else if (ext.test(e.name)) out.push(path.relative(ROOT, p).replace(/\\/g, '/'));
  }
  return out;
}

const pages = walk(ROOT, /\.html$/);
const feeds = walk(ROOT, /\.xml$/);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// The URL a file is served at. Derived from its path, so it cannot drift from
// what the server actually does.
const urlFor = (rel) => `${ORIGIN}/${rel.replace(/index\.html$/, '')}`;

// Does a first-party URL correspond to a file that exists?
function resolves(url) {
  if (!url.startsWith(ORIGIN)) return true; // external, not our concern here
  let p = url.slice(ORIGIN.length).replace(/^\//, '');
  if (p === '') p = 'index.html';
  else if (!p.endsWith('.html')) p = `${p.replace(/\/$/, '')}/index.html`;
  return fs.existsSync(path.join(ROOT, p));
}

// A host that 301s. Verified against production: www.petrohrys.com and any
// http:// origin redirect to https://petrohrys.com.
const REDIRECTING = /https?:\/\/www\.petrohrys\.com|http:\/\/petrohrys\.com/;

test('A/B the canonical origin is a single https apex host', () => {
  assert.strictEqual(ORIGIN, 'https://petrohrys.com');
});

test('C/D no page declares a canonical on a redirecting host', () => {
  const bad = pages.filter((rel) => {
    const c = (read(rel).match(/rel="canonical" href="([^"]+)"/) || [])[1];
    return c && REDIRECTING.test(c);
  });
  assert.deepStrictEqual(bad.slice(0, 10), [], `${bad.length} pages canonicalize to a redirecting host`);
});

test('H/I/J/K/L every page self-canonicalizes to its own served URL', () => {
  // Covers the homepage, product pages, blog articles and localized pages in
  // one assertion, because the property is identical for all of them and a
  // per-family test would have to be remembered when a family is added.
  const bad = [];
  for (const rel of pages) {
    const c = (read(rel).match(/rel="canonical" href="([^"]+)"/) || [])[1];
    if (!c) { bad.push(`${rel}: no canonical`); continue; }
    if (c !== urlFor(rel)) bad.push(`${rel}: canonical ${c}, served at ${urlFor(rel)}`);
  }
  assert.deepStrictEqual(bad.slice(0, 10), [], `${bad.length} pages are not self-canonical`);
});

test('S canonical, og:url and JSON-LD agree on one URL per page', () => {
  // The 1,248-page defect: canonical said "me", og:url said "the English page".
  const bad = [];
  for (const rel of pages) {
    const html = read(rel);
    const c = (html.match(/rel="canonical" href="([^"]+)"/) || [])[1];
    const og = (html.match(/property="og:url" content="([^"]+)"/) || [])[1];
    if (og && og !== c) bad.push(`${rel}: og:url ${og} != canonical ${c}`);
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      let parsed;
      try { parsed = JSON.parse(m[1]); } catch { continue; }
      const visit = (node) => {
        if (!node || typeof node !== 'object') return;
        for (const [k, v] of Object.entries(node)) {
          if (['url', '@id', 'item'].includes(k) && typeof v === 'string' && REDIRECTING.test(v)) {
            bad.push(`${rel}: JSON-LD ${k} on a redirecting host: ${v}`);
          } else if (typeof v === 'object') visit(v);
        }
      };
      (Array.isArray(parsed) ? parsed : [parsed]).forEach(visit);
    }
  }
  assert.deepStrictEqual(bad.slice(0, 10), [], `${bad.length} canonical-signal disagreements`);
});

test('Q/R no first-party link points at a redirecting host', () => {
  // Google should never have to follow a redirect our own markup created.
  const bad = [];
  for (const rel of [...pages, ...feeds]) {
    for (const m of read(rel).matchAll(/(?:href|src|content)="([^"]+)"/g)) {
      if (REDIRECTING.test(m[1])) bad.push(`${rel} -> ${m[1]}`);
    }
  }
  assert.deepStrictEqual(bad.slice(0, 10), [], `${bad.length} first-party links to a redirecting host`);
});

test('E/F/G/V sitemaps list only canonical, existing, indexable URLs', () => {
  const bad = [];
  for (const rel of feeds.filter((f) => f.startsWith('sitemap'))) {
    const xml = read(rel);
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    assert.ok(urls.length > 0, `${rel} is empty`);
    for (const u of urls) {
      if (REDIRECTING.test(u)) bad.push(`${rel}: redirecting host ${u}`);
      else if (!resolves(u)) bad.push(`${rel}: phantom ${u}`);
      else {
        // Must be the preferred URL: the page it points at must self-canonicalize
        // to exactly this URL, and must not be noindex.
        let p = u.slice(ORIGIN.length).replace(/^\//, '');
        if (p === '') p = 'index.html';
        else if (!p.endsWith('.html')) p = `${p.replace(/\/$/, '')}/index.html`;
        const html = read(p);
        const c = (html.match(/rel="canonical" href="([^"]+)"/) || [])[1];
        if (c !== u) bad.push(`${rel}: ${u} canonicalizes to ${c}`);
        if (/name="robots"[^>]*noindex/.test(html)) bad.push(`${rel}: noindex ${u}`);
      }
    }
  }
  assert.deepStrictEqual(bad.slice(0, 10), [], `${bad.length} sitemap defects`);
});

test('M/N/O/P hreflang targets exist, are canonical-host and reciprocate', () => {
  const bad = [];
  for (const rel of pages) {
    const html = read(rel);
    const alts = [...html.matchAll(/rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)]
      .map((m) => ({ lang: m[1], href: m[2] }));
    if (!alts.length) continue;

    for (const a of alts) {
      if (REDIRECTING.test(a.href)) bad.push(`${rel}: hreflang ${a.lang} on a redirecting host`);
      if (!resolves(a.href)) bad.push(`${rel}: hreflang ${a.lang} -> nonexistent ${a.href}`);
    }
    // x-default is required whenever a cluster is declared.
    if (!alts.some((a) => a.lang === 'x-default')) bad.push(`${rel}: cluster without x-default`);
    // Self-reference: the page must appear in its own cluster.
    if (!alts.some((a) => a.href === urlFor(rel))) bad.push(`${rel}: cluster omits itself`);

    // Reciprocity: every target must declare the same cluster back.
    for (const a of alts.filter((x) => x.lang !== 'x-default')) {
      let p = a.href.slice(ORIGIN.length).replace(/^\//, '');
      if (p === '') p = 'index.html';
      else if (!p.endsWith('.html')) p = `${p.replace(/\/$/, '')}/index.html`;
      if (!fs.existsSync(path.join(ROOT, p))) continue;
      if (!read(p).includes(`href="${urlFor(rel)}"`)) {
        bad.push(`${rel}: ${a.lang} target does not link back`);
      }
    }
  }
  assert.deepStrictEqual(bad.slice(0, 10), [], `${bad.length} hreflang defects`);
});

test('W no localized route is advertised that does not exist', () => {
  // Phantom locale URLs are worse than a missing cluster: they publish 404s.
  const bad = [];
  for (const rel of pages) {
    for (const m of read(rel).matchAll(/rel="alternate" hreflang="(?!x-default)([^"]+)" href="([^"]+)"/g)) {
      if (!resolves(m[2])) bad.push(`${rel}: ${m[1]} -> ${m[2]}`);
    }
  }
  assert.deepStrictEqual(bad, [], bad.join('\n'));
});

test('T/U the trailing-slash convention is directory-slash, without exception', () => {
  // Derived from the convention the site already uses, not imposed: every
  // canonical either ends in "/" or names an .html file. Mixing the two is what
  // produces slash -> non-slash -> slash chains.
  const bad = [];
  for (const rel of pages) {
    const c = (read(rel).match(/rel="canonical" href="([^"]+)"/) || [])[1] || '';
    const p = c.slice(ORIGIN.length);
    if (!p.endsWith('/') && !p.endsWith('.html')) bad.push(`${rel}: ${c}`);
  }
  assert.deepStrictEqual(bad.slice(0, 10), [], `${bad.length} trailing-slash violations`);
});

test('robots.txt advertises sitemaps on the canonical host only', () => {
  const robots = read('robots.txt');
  const declared = [...robots.matchAll(/Sitemap:\s*(\S+)/gi)].map((m) => m[1]);
  assert.ok(declared.length > 0, 'robots.txt declares no sitemap');
  for (const u of declared) {
    assert.ok(!REDIRECTING.test(u), `robots.txt points at a redirecting host: ${u}`);
    assert.ok(u.startsWith(ORIGIN), `robots.txt sitemap is off-origin: ${u}`);
    const file = u.slice(ORIGIN.length).replace(/^\//, '');
    assert.ok(fs.existsSync(path.join(ROOT, file)), `robots.txt names a missing sitemap: ${u}`);
  }
});

test('every locale of a localized route is reachable from its cluster', () => {
  // Guards the localization architecture against an SEO change quietly dropping
  // a language: if /de/x/ exists, the EN page must advertise it.
  const bad = [];
  for (const rel of pages) {
    const locale = I18N.LOCALE_CODES.find((c) => c !== 'en' && rel.startsWith(`${c}/`));
    if (!locale) continue;
    const canonicalRel = rel.slice(locale.length + 1);
    if (!fs.existsSync(path.join(ROOT, canonicalRel))) continue;
    if (!read(canonicalRel).includes(`hreflang="${locale}"`)) {
      bad.push(`${canonicalRel} does not advertise its ${locale} twin`);
    }
  }
  assert.deepStrictEqual(bad.slice(0, 10), [], `${bad.length} unadvertised locales`);
});
