'use strict';

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const CANONICAL = [
  'pdf-editor/index.html',
  'pocket-manager/index.html',
  'cv-builder/index.html',
  'unzip/index.html',
  'tcg-scanner/index.html',
  'fax/index.html',
  'webmasterid/index.html',
  'invoice-maker/index.html',
  'smart-printer/index.html'
];
const LOCALIZED = ['es', 'fr', 'de'].flatMap((locale) => [
  `${locale}/pdf-editor/index.html`,
  `${locale}/pocket-manager/index.html`,
  `${locale}/cv-builder/index.html`,
  `${locale}/webmasterid/index.html`,
  `${locale}/invoice-maker/index.html`
]);
const PAGES = [...CANONICAL, ...LOCALIZED];
const COMPARISON_PAGES = CANONICAL.filter((page) => page !== 'webmasterid/index.html');
const PRODUCT_SLUGS = CANONICAL.map((page) => page.split('/')[0]);

// A compact semantic snapshot of the production baseline. It covers product
// copy, metadata, canonicals/hreflang, JSON-LD, product links and image data,
// while deliberately excluding the shell and visual-only FAQ toggle glyphs.
const BASELINE_DIGESTS = {
  'pdf-editor/index.html': 'd790edd8448049287543dcc673b99f6322e6d9f457057932c99dcbf8e60f4983',
  'pocket-manager/index.html': 'bd3fbc120ab442948f2066b42fcf007d7bb4dd8a9c136450a1eff890bbb6451b',
  'cv-builder/index.html': '67a7f87ba6355688a03dcd9437237851d75055677ef46eb5ea9ca9ab58980f8a',
  'unzip/index.html': '4f6c0fca37240a30b9bbd14b370466a9b30dbc6cc2cd3276f7f2b14d0a0bd914',
  'tcg-scanner/index.html': 'c3d8949d884627d0430ddc1998090147e2de20912669b776d2661c22150f0df1',
  'fax/index.html': '25c18b7b7a040dd6a9cfdf0c53b5a3064eca710aba18225179fcfd1d0be6961d',
  'webmasterid/index.html': 'a96b9acd6e329b8bdedf81378354df633d9849a47df816a35f74ec755bf68ee0',
  'invoice-maker/index.html': 'f2104605abea73576652bf18f7eff400073e88b53c46f785c683745fadc89240',
  'smart-printer/index.html': 'da7dfdc69c516c190a8eb9c36f23c59a2219168acbfd88828bd8fc36566d8573',
  'es/pdf-editor/index.html': 'f554e14c561ffcd1ade93e7113bca5d688b63c7144adb179355d3f1c035b3b7b',
  'es/pocket-manager/index.html': 'fccd93792b3e92f896b725fc39436cfe5d332846f2729f2c7b0c3024cece1e22',
  'es/cv-builder/index.html': '24ce8aae45241d3037d5039238fb719ed0b025ad54c234cf01864dbf149286f3',
  'es/webmasterid/index.html': '4762cecf707ab04c67edbf1136bd1588cbd4a05c7f44d56d43fc5a53e0be858a',
  'es/invoice-maker/index.html': '61ae530dc5741ca37e61acc1308c8ac114a6fc32df1a84984502f000fec26967',
  'fr/pdf-editor/index.html': '41f76c0b27af38d357b4d36f8c253d6f1146bdcda4e3fdf27c8c32d2e291833a',
  'fr/pocket-manager/index.html': '80a2f34fb5b69d3fadbe3b08b97133aa4727dad958ca1288a87a205b3e1503f9',
  'fr/cv-builder/index.html': 'e246b379608cc958c4ce58296d994430fff60296ea0d06d38f01e650fb078c30',
  'fr/webmasterid/index.html': 'd05b37599e8d6e2bd4297387fc41398732f49a3ea6dac6070361f1913ad51917',
  'fr/invoice-maker/index.html': 'cc431181cc62c590d251022017b81d0072b6f137c10566368966a204aeeeea4d',
  'de/pdf-editor/index.html': 'e0d9337e23ae58020ad32a36e30a4d2bf25d93d1e9169aebd2c06e5e06c01b13',
  'de/pocket-manager/index.html': 'd8fe025b47608062fa8e9a23cda92f23db824439347ff742d51d7f0aefc35b6e',
  'de/cv-builder/index.html': '2e275a47f0af335ec4fe793a55d7be9e68fd568ffe81c764a74567683a4cb42a',
  'de/webmasterid/index.html': '95f3c3d8eb85704d963c4e097363277ee8cb3bb9eb05605fdba35f1d9040130f',
  'de/invoice-maker/index.html': 'ffe0be2988a311ce0d8a4da3d269f9d3b57c58dbeb27b45e5b1d731758f3132a'
};

function attributes(tag) {
  return Object.fromEntries(
    [...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]])
  );
}

function productContent(html) {
  const ecosystemEnd = html.indexOf('<!-- helperg-eco:body:end -->');
  const start = html.indexOf('<section', ecosystemEnd);
  const end = html.indexOf('<footer', start);
  return html.slice(start, end).replace(/\s*<\/main>\s*$/, '');
}

function visibleProductText(html) {
  return productContent(html)
    .replace(/<span class="faq-toggle">[\s\S]*?<\/span>/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function semanticSnapshot(html) {
  const head = html.slice(0, html.indexOf('</head>'));
  const content = productContent(html);
  const metadata = [];
  for (const match of head.matchAll(/<meta\b[^>]*>/g)) {
    const attrs = attributes(match[0]);
    if (attrs.name || attrs.property) metadata.push([attrs.name || attrs.property, attrs.content || '']);
  }
  for (const match of head.matchAll(/<link\b[^>]*>/g)) {
    const attrs = attributes(match[0]);
    if (attrs.rel === 'canonical' || attrs.rel === 'alternate') {
      metadata.push([attrs.rel, attrs.hreflang || '', attrs.href || '']);
    }
  }
  metadata.push(['title', (head.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '']);

  const jsonLd = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((match) => JSON.parse(match[1]));
  const urls = [...content.matchAll(/\b(?:href|src)="([^"]+)"/g)]
    .map((match) => match[1])
    .sort();
  const images = [...content.matchAll(/<img\b[^>]*>/g)].map((match) => {
    const attrs = attributes(match[0]);
    return [attrs.src || '', attrs.alt || '', attrs.width || '', attrs.height || ''];
  });
  return { text: visibleProductText(html), meta: metadata, json: jsonLd, urls, images };
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function localeFor(relativePath) {
  const locale = relativePath.split('/')[0];
  return ['es', 'fr', 'de'].includes(locale) ? locale : 'en';
}

function extract(source, openingPattern, closingTag) {
  const match = source.match(openingPattern);
  assert.ok(match && match.index !== undefined, `missing ${openingPattern}`);
  const end = source.indexOf(closingTag, match.index);
  assert.notStrictEqual(end, -1, `missing ${closingTag}`);
  return source.slice(match.index, end + closingTag.length);
}

function parseBalancedHtml(relativePath, html) {
  const voidElements = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
    'meta', 'param', 'source', 'track', 'wbr',
    'circle', 'ellipse', 'line', 'path', 'polygon', 'polyline', 'rect', 'stop'
  ]);
  const clean = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<!doctype[^>]*>/gi, '');
  const stack = [];
  for (const match of clean.matchAll(/<(\/)?([a-z][a-z0-9-]*)\b((?:"[^"]*"|'[^']*'|[^>])*)(\/?)>/gi)) {
    const closing = Boolean(match[1]);
    const name = match[2].toLowerCase();
    if (closing) {
      const actual = stack.pop();
      assert.strictEqual(actual, name,
        `${relativePath}: expected </${actual || 'none'}> before </${name}>`);
    } else if (!voidElements.has(name) && !match[4]) {
      stack.push(name);
    }
  }
  assert.deepStrictEqual(stack, [], `${relativePath}: unclosed elements: ${stack.join(', ')}`);
}

function expectedShell(locale) {
  const prefix = locale === 'en' ? '' : `${locale}/`;
  const reference = read(`${prefix}work/index.html`);
  const pathPrefix = locale === 'en' ? '' : `/${locale}`;
  const workHref = `${pathPrefix}/work/`;
  const ecosystemStart = reference.indexOf('<!-- helperg-eco:body:start -->');
  const ecosystemEnd = reference.indexOf('<!-- helperg-eco:body:end -->', ecosystemStart)
    + '<!-- helperg-eco:body:end -->'.length;
  const header = extract(reference, /<header role="banner">/, '</header>')
    .replaceAll(`<a href="${workHref}" aria-current="page">`, `<a href="${workHref}">`);
  return {
    skip: (reference.match(/<a class="skip" href="#main">[^<]+<\/a>/) || [])[0],
    ecosystem: reference.slice(ecosystemStart, ecosystemEnd),
    header,
    footer: extract(reference, /<footer role="contentinfo">/, '</footer>')
  };
}

test('all canonical and localized pages use only the shared visual system', () => {
  for (const relativePath of PAGES) {
    const html = read(relativePath);
    assert.ok(html.includes('<body class="product-page">'), `${relativePath}: missing product-page root`);
    assert.ok(html.includes('<link rel="stylesheet" href="/css/petrohrys.css">'),
      `${relativePath}: missing shared stylesheet`);
    assert.strictEqual((html.match(/<style\b/g) || []).length, 0, `${relativePath}: inline style block`);
    assert.strictEqual((html.match(/\sstyle=/g) || []).length, 0, `${relativePath}: inline style attribute`);
    assert.strictEqual((html.match(/\son[a-z]+=/g) || []).length, 0, `${relativePath}: inline event handler`);
  }
});

test('all migrated documents pass the strict structural HTML parser', () => {
  for (const relativePath of PAGES) parseBalancedHtml(relativePath, read(relativePath));
});

test('the shared shell is byte-identical to the locale reference shell', () => {
  for (const relativePath of PAGES) {
    const html = read(relativePath);
    const shell = expectedShell(localeFor(relativePath));
    assert.ok(html.includes(shell.skip), `${relativePath}: skip link drift`);
    assert.ok(html.includes(shell.ecosystem), `${relativePath}: ecosystem shell drift`);
    assert.ok(html.includes(shell.header), `${relativePath}: header drift`);
    assert.ok(html.includes(shell.footer), `${relativePath}: footer drift`);
    assert.strictEqual((html.match(/<main id="main">/g) || []).length, 1, `${relativePath}: main landmark`);
    const primaryNav = extract(html, /<header role="banner">/, '</header>');
    assert.ok(!primaryNav.includes('href="/work/" aria-current="page"')
      && !/href="\/(?:es|fr|de)\/work\/" aria-current="page"/.test(primaryNav),
    `${relativePath}: product page marks Work as the current page`);
  }
});

test('production content, links, images, metadata and JSON-LD are preserved', () => {
  for (const relativePath of PAGES) {
    const actual = digest(semanticSnapshot(read(relativePath)));
    assert.strictEqual(actual, BASELINE_DIGESTS[relativePath], `${relativePath}: semantic baseline changed`);
  }
});

test('titles and descriptions remain present and unique across the migrated set', () => {
  const titles = new Map();
  const descriptions = new Map();
  for (const relativePath of PAGES) {
    const html = read(relativePath);
    const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
    const description = (html.match(/<meta name="description" content="([^"]+)"/i) || [])[1];
    assert.ok(title, `${relativePath}: title missing`);
    assert.ok(description, `${relativePath}: description missing`);
    assert.ok(!titles.has(title), `${relativePath}: duplicate title with ${titles.get(title)}`);
    assert.ok(!descriptions.has(description),
      `${relativePath}: duplicate description with ${descriptions.get(description)}`);
    titles.set(title, relativePath);
    descriptions.set(description, relativePath);
  }
});

test('JSON-LD parses and FAQ schema is backed by a visible FAQ section', () => {
  for (const relativePath of PAGES) {
    const html = read(relativePath);
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((match) => JSON.parse(match[1]));
    const faq = blocks.find((block) => block['@type'] === 'FAQPage');
    if (!faq) continue;
    const visibleQuestions = (html.match(/<details class="faq-item"/g) || []).length;
    assert.ok(visibleQuestions >= faq.mainEntity.length,
      `${relativePath}: FAQ schema has more questions than the visible FAQ`);
  }
});

test('heading, image and disclosure accessibility contracts hold', () => {
  for (const relativePath of PAGES) {
    const html = read(relativePath);
    assert.strictEqual((html.match(/<h1\b/g) || []).length, 1, `${relativePath}: expected one H1`);
    const levels = [...productContent(html).matchAll(/<h([1-6])\b/g)].map((match) => Number(match[1]));
    assert.strictEqual(levels[0], 1, `${relativePath}: product content does not start with H1`);
    for (let index = 1; index < levels.length; index += 1) {
      assert.ok(levels[index] <= levels[index - 1] + 1, `${relativePath}: heading level jump`);
    }
    for (const image of html.matchAll(/<img\b[^>]*>/g)) {
      const attrs = attributes(image[0]);
      assert.ok(Object.hasOwn(attrs, 'alt'), `${relativePath}: image lacks alt attribute`);
    }
    const faqCount = (html.match(/<details class="faq-item"/g) || []).length;
    assert.ok(faqCount >= 4, `${relativePath}: FAQ disclosures were lost`);
    assert.strictEqual((html.match(/class="faq-question"/g) || []).length, faqCount,
      `${relativePath}: FAQ summary contract changed`);
  }
});

test('comparisons and galleries keep explicit mobile-safe containers', () => {
  for (const relativePath of COMPARISON_PAGES) {
    const html = read(relativePath);
    const tableCount = (html.match(/<table\b/g) || []).length;
    assert.ok(tableCount >= 1, `${relativePath}: comparison table missing`);
    assert.ok((html.match(/class="comparison-table table-scroll"/g) || []).length >= tableCount,
      `${relativePath}: table is not in a mobile scroll shell`);
    assert.strictEqual((html.match(/<thead>/g) || []).length, tableCount,
      `${relativePath}: table head markup is malformed`);
    assert.ok(/<th scope="col"/.test(html), `${relativePath}: column scope missing`);
    assert.ok(/<th scope="row"/.test(html), `${relativePath}: row scope missing`);
  }
  const pdf = read('pdf-editor/index.html');
  assert.ok(pdf.includes('class="screenshots-grid"'), 'PDF Editor gallery missing');
  assert.strictEqual((pdf.match(/class="screenshot-item"/g) || []).length, 4,
    'PDF Editor gallery item count changed');
  const css = read('css/petrohrys.css');
  assert.match(css, /\.product-page \.table-scroll \{[\s\S]*?overflow-x: auto;/,
    'table overflow contract missing');
  assert.match(css, /\.product-page \.screenshots-grid \{[\s\S]*?grid-template-columns:/,
    'gallery responsive grid contract missing');
});

test('new shared CSS is reusable, tokenized and free of product selectors', () => {
  const css = read('css/petrohrys.css');
  const start = css.indexOf('/* ===== Shared product-page primitives =====');
  const end = css.indexOf('/* ===== End ===== */', start);
  const productCss = css.slice(start, end);
  assert.ok(start >= 0 && end > start, 'shared product CSS block missing');
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(productCss), 'shared product CSS adds a raw hex colour');
  for (const slug of PRODUCT_SLUGS) {
    assert.ok(!productCss.includes(slug), `global CSS contains product-specific selector ${slug}`);
  }
  for (const className of ['product-page', 'product-hero', 'product-section', 'product-cta', 'table-scroll']) {
    assert.match(productCss, new RegExp(`\\.${className}\\b`), `.${className} is not styled`);
    assert.ok(PAGES.some((page) => read(page).includes(className)), `.${className} is unused`);
  }
});

test('tracking remains consent-gated and functionally unchanged', () => {
  const cookieYes = '<script id="cookieyes" type="text/javascript" src="https://cdn-cookieyes.com/client_data/af075fab2c66644b181224ee/script.js"></script>';
  const webmasterId = '<script id="webmasterid-tracker" type="text/plain" data-cookieyes="cookieyes-analytics" defer src="https://webmasterid.com/tracker.iife.min.js" data-wmid="wm_bktqqtd7heom5nkl" data-endpoint="https://webmasterid-ingest-api.vercel.app/api/events"></script>';
  for (const relativePath of PAGES) {
    const html = read(relativePath);
    assert.strictEqual((html.match(/id="cookieyes"/g) || []).length, 1, `${relativePath}: CookieYes count`);
    assert.ok(html.includes(cookieYes), `${relativePath}: CookieYes changed`);
    assert.strictEqual((html.match(/id="webmasterid-tracker"/g) || []).length, 1,
      `${relativePath}: WebmasterID count`);
    assert.ok(html.includes(webmasterId), `${relativePath}: WebmasterID changed`);
    assert.ok(html.includes('https://www.googletagmanager.com/gtag/js?id=G-4RE6YCJZBD'),
      `${relativePath}: GA loader changed`);
    assert.ok(html.includes("gtag('config', 'G-4RE6YCJZBD')")
      || html.includes("gtag('config','G-4RE6YCJZBD')"), `${relativePath}: GA config changed`);
  }
});

function localTarget(relativePath, url) {
  const clean = url.split('#')[0].split('?')[0];
  if (!clean) return path.join(ROOT, relativePath);
  if (clean.startsWith('/')) {
    const local = clean.slice(1);
    return path.join(ROOT, local.endsWith('/') ? local + 'index.html' : local);
  }
  return path.resolve(path.dirname(path.join(ROOT, relativePath)), clean);
}

test('target pages have no broken local links or static assets', () => {
  for (const relativePath of PAGES) {
    const html = read(relativePath);
    for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
      const url = match[1];
      if (/^(?:https?:|mailto:|tel:|data:|#)/.test(url)) continue;
      const target = localTarget(relativePath, url);
      assert.ok(fs.existsSync(target), `${relativePath}: missing local target ${url}`);
    }
  }
});

test('the migration is idempotent and introduces no network or dependency path', () => {
  const script = read('scripts/migrate-legacy-product-pages.cjs');
  assert.ok(!/\b(?:fetch|https?\.request|XMLHttpRequest)\s*\(/.test(script), 'migration can reach the network');
  assert.ok(!fs.existsSync(path.join(ROOT, 'package.json')), 'root package.json was introduced');
  const output = execFileSync(process.execPath, ['scripts/migrate-legacy-product-pages.cjs'], {
    cwd: ROOT,
    encoding: 'utf8'
  });
  assert.match(output, /0 page\(s\) rewritten/, 'second migration is not a no-op');
});

function validateMutation(relativePath, html, css) {
  const errors = [];
  if (/<style\b|\sstyle=/.test(html)) errors.push('INLINE_STYLE');
  if (!html.includes('/css/petrohrys.css')) errors.push('SHARED_CSS');
  if (!html.includes('<header role="banner">') || !html.includes('<footer role="contentinfo">')
    || !html.includes('<main id="main">')) errors.push('SHELL');
  if ((html.match(/<h1\b/g) || []).length !== 1) errors.push('H1');
  const expectedJsonLd = (read(relativePath).match(/application\/ld\+json/g) || []).length;
  if ((html.match(/application\/ld\+json/g) || []).length !== expectedJsonLd) errors.push('JSONLD');
  if (relativePath === 'pdf-editor/index.html' && !html.includes('class="screenshots-grid"')) {
    errors.push('MEDIA');
  }
  const productBlock = css.slice(css.indexOf('/* ===== Shared product-page primitives ====='));
  if (/#[0-9a-f]{3,8}\b/i.test(productBlock)) errors.push('RAW_HEX');
  if (PRODUCT_SLUGS.some((slug) => productBlock.includes(`.${slug}`))) errors.push('PRODUCT_SELECTOR');
  return errors;
}

test('all eight required mutation probes are killed', () => {
  const pdf = read('pdf-editor/index.html');
  const esPdf = read('es/pdf-editor/index.html');
  const css = read('css/petrohrys.css');
  const probes = [
    ['inline style', 'pdf-editor/index.html', pdf.replace('</head>', '<style>.x{display:none}</style></head>'), css, 'INLINE_STYLE'],
    ['shared stylesheet', 'pdf-editor/index.html', pdf.replace('<link rel="stylesheet" href="/css/petrohrys.css">', ''), css, 'SHARED_CSS'],
    ['canonical shell', 'pdf-editor/index.html', pdf.replace(/<header role="banner">[\s\S]*?<\/header>/, ''), css, 'SHELL'],
    ['screenshot gallery', 'pdf-editor/index.html', pdf.replace('class="screenshots-grid"', 'class="screenshots-grid-broken"'), css, 'MEDIA'],
    ['structured data', 'pdf-editor/index.html', pdf.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, ''), css, 'JSONLD'],
    ['raw hex', 'pdf-editor/index.html', pdf, css + '\n.product-page{color:#123456}', 'RAW_HEX'],
    ['product selector', 'pdf-editor/index.html', pdf, css + '\n.pdf-editor-hero{display:block}', 'PRODUCT_SELECTOR'],
    ['localized styling', 'es/pdf-editor/index.html', esPdf.replace('<link rel="stylesheet" href="/css/petrohrys.css">', ''), css, 'SHARED_CSS']
  ];
  const summary = { survived: 0, broken: 0, noop: 0 };
  for (const [name, relativePath, mutatedHtml, mutatedCss, expected] of probes) {
    if (mutatedHtml === read(relativePath) && mutatedCss === css) {
      summary.noop += 1;
      continue;
    }
    try {
      const errors = validateMutation(relativePath, mutatedHtml, mutatedCss);
      if (!errors.includes(expected)) summary.survived += 1;
    } catch (error) {
      summary.broken += 1;
      assert.fail(`${name} probe crashed: ${error.message}`);
    }
  }
  assert.deepStrictEqual(summary, { survived: 0, broken: 0, noop: 0 });
});
