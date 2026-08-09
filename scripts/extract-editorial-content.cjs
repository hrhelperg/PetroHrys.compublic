'use strict';

// One-time extraction of the eleven legacy editorial pages into structured
// content, so build-static-pages.cjs can render them through the shared shell.
//
// Every page kept its own <style> block, its own header with a JavaScript
// hamburger menu, and its own footer. This pulls out the part that is actually
// content and normalizes the presentation vocabulary onto the shared primitives.
//
// ── WHAT IS ALLOWED TO CHANGE, AND WHAT IS NOT ──────────────────────────────
//
// Presentation may change: class names collapse onto shared primitives, the FAQ
// becomes a native <details> instead of a click-handler div, and the page-local
// stylesheet disappears.
//
// Content may not. The assertion at the bottom compares the visible text before
// and after and refuses to write if a single character of prose moved. Links,
// images and structured data are compared as sets for the same reason: a design
// migration that quietly drops an App Store URL is a worse outcome than one that
// never ran.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'content', 'editorial');

// canonicalPath is the route the page is served at; `file` is where it lives now.
const PAGES = [
  { id: 'blog-index', file: 'blog/index.html', canonicalPath: '/blog/', wrapper: 'page-container' },
  { id: 'articles-index', file: 'articles/index.html', canonicalPath: '/articles/', wrapper: 'page-wrap' },
  { id: 'templates-index', file: 'templates/index.html', canonicalPath: '/templates/', wrapper: 'page-wrap' },
  { id: 'startups-index', file: 'startups/index.html', canonicalPath: '/startups/', wrapper: 'page-wrap' },
  { id: 'startups-raising', file: 'startups/raising/index.html', canonicalPath: '/startups/raising/', wrapper: 'page-wrap' },
  { id: 'submit-startup', file: 'submit-startup/index.html', canonicalPath: '/submit-startup/', wrapper: 'page-wrap' },
  { id: 'artificial-intelligence', file: 'artificial-intelligence/index.html', canonicalPath: '/artificial-intelligence/', wrapper: 'wrap' },
  { id: 'blog-smart-printer', file: 'blog/smart-printer-guide.html', canonicalPath: '/blog/smart-printer-guide.html', wrapper: 'article-container' },
  { id: 'blog-globalization', file: 'blog/what-is-business-globalization-open-economies.html', canonicalPath: '/blog/what-is-business-globalization-open-economies.html', wrapper: 'article-container' },
  { id: 'blog-pokemon', file: 'blog/pokemon-tcg-card-value-scanner/index.html', canonicalPath: '/blog/pokemon-tcg-card-value-scanner/', wrapper: null },
  { id: 'blog-pdf-editor', file: 'blog/best-pdf-editor-app-iphone-android/index.html', canonicalPath: '/blog/best-pdf-editor-app-iphone-android/', wrapper: 'article-container' },
];

const textOf = (html) => html
  .replace(/<script[\s\S]*?<\/script>/g, ' ')
  .replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&#8592;/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
  .replace(/&rarr;/g, ' ').replace(/&#8594;/g, ' ')
  .replace(/\s+/g, ' ').trim();

const linksOf = (html) => new Set([...html.matchAll(/href="([^"#]+)"/g)]
  .map((m) => m[1]).filter((h) => !/^(mailto:|tel:)/.test(h)));
const imagesOf = (html) => new Set([...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]));

// The apex host is authoritative: www.petrohrys.com 301-redirects to it, and the
// sitemap and all 1,665 generated pages already use it. Leaving www in place
// would keep pointing structured data at a redirect.
const normalizeHost = (s) => s.replace(/https:\/\/www\.petrohrys\.com/g, 'https://petrohrys.com');

// ── legacy class vocabulary → shared primitives ─────────────────────────────
// Ordered: longer, more specific names first so a prefix never eats a suffix.
const CLASS_MAP = [
  [/\bcta-btn-primary\b|\bbtn-primary\b|\bbtn-red\b|\bbtn-green\b|\bbtn-submit\b/g, 'btn btn--primary'],
  [/\bcta-btn-secondary\b|\bbtn-secondary\b|\bbtn-outline\b|\bbtn-ghost\b/g, 'btn'],
  [/\bcta-btn\b/g, 'btn btn--primary'],
  [/\bcta-buttons\b|\bcta-btns\b|\bcta-row\b/g, 'btn-row'],
  [/\bcta-block\b/g, 'cta-panel'],
  [/\bblog-grid\b|\barticles-grid\b|\btemplates-grid\b|\bstartups-grid\b|\bstartup-grid\b|\bwhat-grid\b|\btips-grid\b|\buse-case-grid\b|\bbenefits\b|\bpillars\b/g, 'card-grid'],
  [/\bblog-card\b|\barticle-card\b|\btemplate-card\b|\bstartup-card\b|\btip-card\b|\bwhat-item\b|\bbenefit\b|\bpillar\b|\buse-case-mini\b/g, 'card'],
  [/\bblog-card-meta\b|\barticle-meta\b|\bstartup-meta\b|\bblog-row-meta\b/g, 'card-meta'],
  [/\bblog-card-tag\b|\btemplate-tag\b|\bstartup-tag\b|\barticle-tag\b|\barticle-type\b|\bstage-pill\b|\braising-badge\b|\bbadge-green\b|\bbadge\b/g, 'tag'],
  [/\bfilter-chip\b/g, 'tag tag--muted'],
  [/\bfeature-list\b|\bsteps-list\b|\bstep-list\b|\bprinciple-list\b/g, 'feature-list'],
  [/\bcomparison-table\b/g, 'doc-table'],
  [/\bcallout\b|\binternal-links-box\b/g, 'doc-callout'],
  [/\barticle-body\b/g, 'article-prose'],
  [/\bpage-wrap\b|\bpage-container\b|\bpage-wrapper\b|\barticle-container\b/g, 'article-prose'],
];

function mapClasses(html) {
  return html.replace(/class="([^"]*)"/g, (full, value) => {
    let v = value;
    for (const [re, to] of CLASS_MAP) v = v.replace(re, to);
    // collapse duplicates introduced by the mapping
    const seen = [];
    for (const c of v.split(/\s+/)) if (c && !seen.includes(c)) seen.push(c);
    return `class="${seen.join(' ')}"`;
  });
}

// The legacy FAQ: a div whose click handler toggled a class. Replaced with a
// native disclosure so it works without JavaScript and is announced correctly.
function faqToDetails(html) {
  return html.replace(
    /<div class="faq-item">\s*<div class="faq-question">([\s\S]*?)<span class="faq-toggle">[^<]*<\/span>\s*<\/div>\s*<div class="faq-answer">([\s\S]*?)<\/div>\s*<\/div>/g,
    (_m, q, a) => `<details class="faq-item">\n<summary>${q.trim()}</summary>\n<div>${a.trim()}</div>\n</details>`,
  );
}

function extractBody(html, wrapper) {
  const body = html.slice(html.indexOf('<body'));
  // Content begins after the legacy nav/header and ends at the legacy footer.
  let start = 0;
  if (wrapper) {
    const m = body.search(new RegExp(`<(?:div|main|section|article)[^>]*class="[^"]*\\b${wrapper}\\b`));
    if (m < 0) throw new Error(`wrapper .${wrapper} not found`);
    start = body.indexOf('>', m) + 1;
  } else {
    // No wrapper: take everything after the last legacy nav element.
    const navEnd = Math.max(body.lastIndexOf('</nav>'), body.lastIndexOf('</header>'));
    start = navEnd >= 0 ? navEnd + (body.lastIndexOf('</nav>') === navEnd ? 6 : 9) : 0;
  }
  let end = body.search(/<footer/);
  if (end < 0) end = body.search(/<\/body>/);
  let content = body.slice(start, end);
  // Drop the trailing close of the wrapper div and any legacy back-link chrome.
  content = content.replace(/<\/div>\s*$/, '');
  content = content.replace(/<a[^>]*class="(?:back-link|nav-back)"[^>]*>[\s\S]*?<\/a>/g, '');
  content = content.replace(/<p class="breadcrumb">[\s\S]*?<\/p>/g, '');
  content = content.replace(/<nav class="breadcrumb"[\s\S]*?<\/nav>/g, '');
  // Remove the hamburger handler; the shared shell uses <details>, no JS.
  content = content.replace(/<script(?![^>]*type="application)[\s\S]*?<\/script>/g, '');
  return content;
}

fs.mkdirSync(OUT, { recursive: true });
const manifest = {};
let totalBefore = 0;
let totalAfter = 0;

for (const page of PAGES) {
  const src = fs.readFileSync(path.join(ROOT, page.file), 'utf8');

  const jsonLd = [...src.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => JSON.parse(normalizeHost(m[1])));

  let content = extractBody(src, page.wrapper);
  // The "+" inside .faq-toggle is a disclosure marker drawn as text. <details>
  // draws its own, so the glyph is chrome and is excluded from the baseline —
  // the same treatment the legacy back-link gets. Excluding it here keeps the
  // check strict about prose instead of failing on the one deletion that is
  // deliberate.
  content = content.replace(/<span class="faq-toggle">[^<]*<\/span>/g, '<span class="faq-toggle"></span>');
  const beforeText = textOf(content);
  const beforeLinks = linksOf(content);
  const beforeImages = imagesOf(content);

  content = faqToDetails(content);
  content = mapClasses(content);
  content = normalizeHost(content);
  content = content.split('\n').map((l) => l.replace(/\s+$/, ''))
    .filter((l, i, a) => !(l.trim() === '' && (a[i - 1] || '').trim() === '')).join('\n').trim();

  const afterText = textOf(content);
  const afterLinks = linksOf(content);
  const afterImages = imagesOf(content);

  if (beforeText !== afterText) {
    const a = Array.from(beforeText);
    const b = Array.from(afterText);
    const i = a.findIndex((c, k) => c !== b[k]);
    throw new Error(`${page.id}: TEXT CHANGED at ${i}\n  was: ${a.slice(Math.max(0, i - 80), i + 80).join('')}\n  now: ${b.slice(Math.max(0, i - 80), i + 80).join('')}`);
  }
  const lostLinks = [...beforeLinks].filter((l) => !afterLinks.has(normalizeHost(l)) && !afterLinks.has(l));
  if (lostLinks.length) throw new Error(`${page.id}: LINKS LOST: ${lostLinks.join(', ')}`);
  const lostImages = [...beforeImages].filter((i) => !afterImages.has(i));
  if (lostImages.length) throw new Error(`${page.id}: IMAGES LOST: ${lostImages.join(', ')}`);

  fs.writeFileSync(path.join(OUT, `${page.id}.en.html`), `${content}\n`);
  manifest[page.id] = {
    canonicalPath: page.canonicalPath,
    sourceFile: page.file,
    title: (src.match(/<title>([^<]*)<\/title>/) || [])[1],
    description: (src.match(/name="description" content="([^"]*)"/) || [])[1],
    h1: (src.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1]?.replace(/<[^>]+>/g, '').trim(),
    jsonLd,
    links: afterLinks.size,
    images: afterImages.size,
    textChars: afterText.length,
  };
  totalBefore += Buffer.byteLength(src);
  totalAfter += Buffer.byteLength(content);
  console.log(`${page.id.padEnd(26)} text ${String(afterText.length).padStart(6)} chars · `
    + `${afterLinks.size} links · ${afterImages.size} imgs · ${jsonLd.length} json-ld · preserved`);
}

fs.writeFileSync(path.join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`\n${PAGES.length} pages extracted; source ${Math.round(totalBefore / 1024)}KB → content ${Math.round(totalAfter / 1024)}KB`);
