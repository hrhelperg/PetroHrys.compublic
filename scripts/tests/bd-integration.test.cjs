// scripts/tests/bd-integration.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(root, rel));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });

const SECTION = path.join('research', 'business-directories');
const SITEMAP = 'sitemap-business-directories.xml';
const FEED = path.join(SECTION, 'feed.xml');
const ORIGIN = 'https://www.petrohrys.com';

// This branch is STACKED on feat/helperg-ecosystem-banner, which already
// modifies sitemap.xml and css/petrohrys.css relative to main. Diffing against
// main would report that branch's changes as ours.
const BASELINE = git('merge-base', 'HEAD', 'feat/helperg-ecosystem-banner').trim();

function walk(dir, acc = []) {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) return acc;
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, acc);
    else acc.push(rel);
  }
  return acc;
}

const generatedPages = () => walk(SECTION).filter((f) => f.endsWith('.html'));
const locs = () => [...read(SITEMAP).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

// --- robots.txt -------------------------------------------------------------

test('robots.txt advertises the section sitemap on the www host', () => {
  assert.ok(read('robots.txt').includes(`Sitemap: ${ORIGIN}/${SITEMAP}`));
});

test('robots.txt keeps every pre-existing directive, comment and ordering', () => {
  const txt = read('robots.txt');
  const expected = [
    '# robots.txt — petrohrys.com',
    'User-agent: *',
    'Allow: /',
    '# Block crawling of non-content utility paths',
    'Disallow: /cgi-bin/',
    'Disallow: /wp-admin/',
    'Disallow: /wp-includes/',
    '# Block AI training crawlers (opt-out of scraping)',
    'User-agent: GPTBot',
    'User-agent: ChatGPT-User',
    'User-agent: CCBot',
    'User-agent: anthropic-ai',
    'User-agent: Google-Extended',
    'User-agent: Bytespider',
    '# Sitemap location',
    'Sitemap: https://petrohrys.com/sitemap.xml',
  ];
  let cursor = -1;
  for (const line of expected) {
    const at = txt.indexOf(line);
    assert.ok(at > cursor, `robots.txt lost or reordered: ${line}`);
    cursor = at;
  }
});

test('robots.txt gained exactly one line', () => {
  const diff = git('diff', BASELINE, '--numstat', '--', 'robots.txt').trim();
  if (diff) {
    const [added, removed] = diff.split(/\s+/);
    assert.strictEqual(added, '1', 'more than one line added');
    assert.strictEqual(removed, '0', 'robots.txt lost a line');
  }
});

test('robots.txt is not used as an access-control mechanism', () => {
  // Disallow hides a URL from crawling; it does not protect it, and using it
  // on noindex pages would prevent the noindex being seen at all.
  const txt = read('robots.txt');
  for (const wrong of ['Disallow: /data/', 'Disallow: /research/business-directories/',
    'Disallow: /scripts/', '.build-manifest']) {
    assert.ok(!txt.includes(wrong), `robots.txt must not try to hide ${wrong}`);
  }
});

test('the pre-existing sitemap.xml is untouched by this work', () => {
  assert.strictEqual(git('diff', BASELINE, '--name-only', '--', 'sitemap.xml').trim(), '');
});

// --- section sitemap --------------------------------------------------------

test('the section sitemap is valid, namespaced XML', () => {
  const xml = read(SITEMAP);
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(xml.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'));
  assert.ok(xml.trimEnd().endsWith('</urlset>'));
  assert.strictEqual((xml.match(/<url>/g) || []).length, (xml.match(/<\/url>/g) || []).length);
  assert.strictEqual((xml.match(/<loc>/g) || []).length, (xml.match(/<\/loc>/g) || []).length);
});

test('every sitemap URL uses the www origin', () => {
  for (const loc of locs()) {
    assert.ok(loc.startsWith(`${ORIGIN}/`), `non-www or foreign origin: ${loc}`);
  }
  assert.ok(!/https:\/\/petrohrys\.com/.test(read(SITEMAP)), 'apex URL in section sitemap');
});

test('the sitemap contains no duplicates', () => {
  const all = locs();
  assert.strictEqual(new Set(all).size, all.length);
});

test('the sitemap is deterministically ordered', () => {
  // Emission order follows the page model, which is itself derived from the
  // registry's declaration order — so a rebuild cannot reshuffle it.
  const before = locs();
  execFileSync('node', ['scripts/build-business-directories.cjs'], { cwd: root });
  assert.deepStrictEqual(locs(), before);
});

test('every sitemap URL maps to a file that exists', () => {
  for (const loc of locs()) {
    const rel = loc.slice(ORIGIN.length).replace(/^\//, '');
    assert.ok(exists(path.join(rel, 'index.html')) || exists(rel), `sitemap references missing ${loc}`);
  }
});

test('the sitemap excludes every noindex page', () => {
  const noindex = generatedPages()
    .filter((f) => read(f).includes('name="robots"'))
    .map((f) => `${ORIGIN}/${path.dirname(f).split(path.sep).join('/')}/`);
  for (const url of noindex) {
    assert.ok(!locs().includes(url), `noindex page listed in sitemap: ${url}`);
  }
  assert.ok(noindex.length > 0, 'expected at least one noindex reference page');
});

test('the sitemap contains only indexable generated pages', () => {
  const indexable = generatedPages()
    .filter((f) => !read(f).includes('name="robots"'))
    .map((f) => `${ORIGIN}/${path.dirname(f).split(path.sep).join('/')}/`);
  assert.deepStrictEqual([...locs()].sort(), indexable.sort());
});

test('the sitemap excludes the feed, data files and the build manifest', () => {
  const xml = read(SITEMAP);
  for (const excluded of ['feed.xml', '/data/', '.build-manifest', 'countries.json', 'categories.json']) {
    assert.ok(!xml.includes(excluded), `sitemap must not list ${excluded}`);
  }
});

// --- RSS feed ---------------------------------------------------------------

test('the feed is valid, well-formed RSS', () => {
  const xml = read(FEED);
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(xml.includes('<rss version="2.0"'));
  assert.strictEqual((xml.match(/<channel>/g) || []).length, 1);
  assert.strictEqual((xml.match(/<item>/g) || []).length, (xml.match(/<\/item>/g) || []).length);
  assert.ok(xml.trimEnd().endsWith('</rss>'));
});

test('the feed uses www URLs only', () => {
  const xml = read(FEED);
  assert.ok(xml.includes(`${ORIGIN}/research/business-directories/`));
  assert.ok(!/https:\/\/petrohrys\.com/.test(xml), 'apex URL in feed');
});

test('the feed is a valid empty channel while no record is verified', () => {
  const xml = read(FEED);
  assert.strictEqual((xml.match(/<item>/g) || []).length, 0);
  assert.ok(xml.includes('<title>'), 'an empty channel still needs its metadata');
  assert.ok(xml.includes('<atom:link'));
});

test('the feed contains no placeholder or noindex entries', () => {
  const xml = read(FEED);
  for (const banned of ['example.com', 'placeholder', 'lorem', 'TODO', 'coming soon']) {
    assert.ok(!xml.toLowerCase().includes(banned.toLowerCase()), `feed contains ${banned}`);
  }
  for (const link of [...xml.matchAll(/<link>([^<]+)<\/link>/g)].map((m) => m[1])) {
    const rel = link.slice(ORIGIN.length).replace(/^\//, '');
    assert.ok(exists(path.join(rel, 'index.html')) || exists(rel), `feed links to missing ${link}`);
  }
});

// --- repository-wide guarantees --------------------------------------------

test('no package.json was added at the repository root', () => {
  assert.ok(!exists('package.json'));
});

test('no localised page changed on this branch', () => {
  const changed = git('diff', BASELINE, '--name-only').trim().split('\n').filter(Boolean);
  assert.deepStrictEqual(changed.filter((f) => /^(es|fr|de)\//.test(f)), []);
});

test('no legacy inline-style page changed on this branch', () => {
  const legacy = /^(pdf-editor|pocket-manager|smart-printer|startups|privacy|fax|unzip|articles|terms|blog|webmasterid|submit-startup|artificial-intelligence|templates|twinphone|invoice-maker|tcg-scanner|cv-builder)\//;
  const changed = git('diff', BASELINE, '--name-only').trim().split('\n').filter(Boolean);
  assert.deepStrictEqual(changed.filter((f) => legacy.test(f)), []);
});

test('the site stylesheet and ecosystem assets are untouched', () => {
  for (const asset of ['css/petrohrys.css', 'css/ecosystem-banner.css', 'js/ecosystem-banner.js',
    'js/ecosystem-registry.js', 'js/ecosystem-config.js', 'scripts/inject-ecosystem-banner.cjs']) {
    assert.strictEqual(git('diff', BASELINE, '--name-only', '--', asset).trim(), '',
      `${asset} was modified`);
  }
});

test('every generated page is UTF-8, balanced, and has exactly one h1', () => {
  const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr']);
  for (const page of generatedPages()) {
    const buf = fs.readFileSync(path.join(root, page));
    assert.strictEqual(buf.toString('utf8'), buf.toString('utf8'), `${page} is not valid UTF-8`);
    const doc = buf.toString('utf8');

    assert.strictEqual((doc.match(/<h1[ >]/g) || []).length, 1, `${page}: h1 count`);

    const headings = [...doc.matchAll(/<h([1-6])[ >]/g)].map((m) => Number(m[1]));
    for (let i = 1; i < headings.length; i += 1) {
      assert.ok(headings[i] - headings[i - 1] <= 1,
        `${page}: heading skip h${headings[i - 1]} -> h${headings[i]}`);
    }

    const stripped = doc.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');
    const stack = [];
    for (const m of stripped.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\/?)>/g)) {
      const [, closing, name, , self] = m;
      const tag = name.toLowerCase();
      if (VOID.has(tag) || self || tag === '!doctype') continue;
      if (closing) assert.strictEqual(stack.pop(), tag, `${page}: mismatched </${tag}>`);
      else stack.push(tag);
    }
    assert.deepStrictEqual(stack, [], `${page}: unclosed ${stack.join(', ')}`);
  }
});

test('every generated page has a www canonical and no placeholder', () => {
  for (const page of generatedPages()) {
    const doc = read(page);
    const canonical = (doc.match(/rel="canonical" href="([^"]+)"/) || [])[1];
    assert.ok(canonical && canonical.startsWith(`${ORIGIN}/`), `${page}: bad canonical ${canonical}`);
    assert.ok(!doc.includes('PASTE_YOUR_BING_VERIFICATION_CODE_HERE'), `${page}: bing placeholder`);
    assert.ok(!/https:\/\/petrohrys\.com/.test(doc), `${page}: apex URL`);
  }
});

test('no generated page emits banned structured data', () => {
  const BANNED = new Set(['AggregateRating', 'Review', 'Product', 'SearchAction']);
  for (const page of generatedPages()) {
    const block = read(page).match(/<script type="application\/ld\+json">\n([\s\S]*?)\n  <\/script>/);
    assert.ok(block, `${page}: no JSON-LD`);
    const graph = JSON.parse(block[1].replace(/\\u003c/g, '<').replace(/\\u003e/g, '>'))['@graph'];
    const walkNode = (node) => {
      if (Array.isArray(node)) return node.forEach(walkNode);
      if (node && typeof node === 'object') {
        assert.ok(!BANNED.has(node['@type']), `${page}: banned @type ${node['@type']}`);
        return Object.values(node).forEach(walkNode);
      }
      return undefined;
    };
    walkNode(graph);
  }
});

test('no generated page contains an http external link', () => {
  for (const page of generatedPages()) {
    assert.ok(!/href="http:\/\//.test(read(page)), `${page}: insecure external link`);
  }
});

test('no generated page contains a duplicate element id', () => {
  for (const page of generatedPages()) {
    const ids = [...read(page).matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    assert.strictEqual(new Set(ids).size, ids.length, `${page}: duplicate id`);
  }
});

test('no internal link anywhere in the section or editorial pages is broken', () => {
  const pages = generatedPages().concat([
    'index.html', 'work/index.html', 'writing/index.html', 'research/index.html',
    'essays/index.html', 'ai-systems/index.html', 'infrastructure/index.html', 'about/index.html',
  ]);
  const broken = [];
  for (const page of pages) {
    for (const m of read(page).matchAll(/<a [^>]*href="([^"]+)"/g)) {
      const href = m[1];
      if (href.startsWith('http') || href.startsWith('#') || href.startsWith('mailto:')) continue;
      assert.ok(href.startsWith('/'), `${page}: relative link ${href}`);
      const rel = href.replace(/^\//, '').split('#')[0];
      if (!exists(rel) && !exists(path.join(rel, 'index.html'))) broken.push(`${page} -> ${href}`);
    }
  }
  assert.deepStrictEqual(broken, []);
});

test('only the lean scaffold is present in the site tree', () => {
  assert.deepStrictEqual(generatedPages().sort(), [
    path.join(SECTION, 'index.html'),
    path.join(SECTION, 'united-states', 'categories', 'general-business', 'index.html'),
    path.join(SECTION, 'united-states', 'index.html'),
  ].sort());
});
