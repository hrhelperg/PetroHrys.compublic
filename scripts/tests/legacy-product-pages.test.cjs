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
// Re-baselined 2026-08-09. The ONLY change was the canonical host: every page
// here canonicalized to https://www.petrohrys.com, which 301-redirects to the
// apex (verified against the live site), so each page pointed search engines at
// a redirect. All 24 pages were diffed against origin/main and confirmed to
// differ in canonical and hreflang hrefs alone — visible text, in-content links,
// images and JSON-LD are byte-identical.
//
// A baseline is only ever updated with that kind of evidence. Updating it
// because a test went red is how a preservation guard becomes decoration.
//
// Re-baselined 2026-08-14, four pages only: webmasterid/index.html and its de,
// es and fr translations. The site stopped using CookieYes, so the three places
// each of those pages named it as an example consent manager were widened to
// the claim that is now true and broader — the tracker ships inert, so it works
// with any consent manager, including this site's own. The two FAQ spots (the
// visible answer and its JSON-LD counterpart) were changed identically and the
// pair re-verified as matching, because an FAQ schema whose text is not on the
// page is a false claim to a search engine.
//
// Evidence: each of the four pages diffs against HEAD in exactly 8 lines — the
// analytics block being gated, plus those three prose spots. The other 20
// baselined pages recomputed BYTE-IDENTICAL, which is the check that matters:
// it proves the analytics rewrite that touched all 24 pages does not reach the
// semantic snapshot at all, so these four moved for the prose and nothing else.
const BASELINE_DIGESTS = {
  'pdf-editor/index.html': 'f1c6aa7f8e224c6b7fdcd54c4e3edabd4d3ab6635649b858320151cebfc15537',
  'pocket-manager/index.html': '0c550678eca6a2abb4b7f5240e5d4225721c49ac37855e9cd60554d581d0afb5',
  'cv-builder/index.html': 'b255db3b1c32c69aa5a1e35c9660a6b0ce9e1bf10b27fb6705516ed60e7f77c9',
  'unzip/index.html': '912721a2593ce718907db8e13288093ab58fa3d72fe0035d6ee34b836355ba56',
  'tcg-scanner/index.html': '90be500b5eddf972af1fa8ef60aec7506dbba9504aeb18edb02eb81e0315dc7f',
  'fax/index.html': '660e234e36a9c7f11d659c6793690a73773aed35178d2a159f3160939dca55b7',
  'webmasterid/index.html': 'ec0d4d23b5de69ba785cc9be9be1419412246c6a03eaaa57c492fa88a73f10f3',
  'invoice-maker/index.html': 'f7fa06b9f8c82bc81d0914404254053d97363a55551ebc42e1202a5837de9b8e',
  'smart-printer/index.html': '4061f6d6ef080356ef0e1b94b3491f4889789a1fe3bc68747e643b2fc12cc4e3',
  'es/pdf-editor/index.html': '10a6cb213c28aadf89cea1eb74647db4e238f890eff1175bef9d26c7e18cb304',
  'es/pocket-manager/index.html': '7833ecaa3fa4af4922e868a5568bd311b99a43995d99aa872f566ad785f88489',
  'es/cv-builder/index.html': '8483894dc5b4f240a4da5cea793d47314daabcb614fb6418861b02d107db9a23',
  'es/webmasterid/index.html': '22b482ff525772849b8a3290b98d07537aa4a954143e2ef9b2c04f2a49fbf795',
  'es/invoice-maker/index.html': 'dbfbbccbced24e2617dc9fd0552ece8a8d3767a92992b50803007660ecee1f49',
  'fr/pdf-editor/index.html': '9e072642817b9b3d03d4869d057597db5e8d01a10c4b2f8f77c86df42529a730',
  'fr/pocket-manager/index.html': '81734f8e8c86b7fcc97fc33819fef1e8ff437a9c0ce620c789ed0647b2544e15',
  'fr/cv-builder/index.html': '4d46f54891a1f6db609195d29e5ac4ae5c0961b157cb0788686c3a63a1f2b124',
  'fr/webmasterid/index.html': '139349890d3e99aad0a8bbcef3d4483c38d69dc6e8269b5ceadd6c3b555362ad',
  'fr/invoice-maker/index.html': 'd7888b00d473f11fc700485e4ca88948198fc9f04d0349f08a5402be38b1dcc5',
  'de/pdf-editor/index.html': 'ed5895e5b02414719592afcff03134979f1d79741d371351707c9e7c2fd658d7',
  'de/pocket-manager/index.html': 'dbe3da37405670387bc90796488e38f699f734e7ac20fdb42e7f4d47178cae4b',
  'de/cv-builder/index.html': 'b76b98c54e7d535198f7a3bd63f3dcb5a1bd87418490f5646c74ffeb623851e5',
  'de/webmasterid/index.html': 'b324a4e0c6ee4e7637ab64ba754e93c6219519d9af5710172e011da64949af0f',
  'de/invoice-maker/index.html': 'd3a0cc32a17584a453a7b85d5843476984453ae8974e80670c3051bd59543390',
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
  // The gate used to be CookieYes. Its script started answering 403 with the
  // service's own "We can't find the page you are looking for" — the same reply
  // a fabricated client id gets — so the key was gone rather than blocked. The
  // tracker shipped as `type="text/plain" data-cookieyes="..."` and only that
  // service ever rewrote the type, so it never executed: zero requests for
  // tracker.iife.min.js and zero events, measured in a real browser against
  // production. Google Analytics meanwhile ran ungated on the same pages.
  //
  // The gate is now this site's own js/consent.js, and it covers BOTH tools on
  // identical terms. These assertions are deliberately stronger than the ones
  // they replace: they pin that the third-party service is gone, that nothing
  // analytics-related is executable before a decision, and that the GA config
  // block is gated too — loading gtag.js without it would fetch the library and
  // measure nothing.
  const webmasterId = '<script id="webmasterid-tracker" type="text/plain" data-consent="analytics" defer src="https://webmasterid.com/tracker.iife.min.js" data-wmid="wm_bktqqtd7heom5nkl" data-endpoint="https://webmasterid-ingest-api.vercel.app/api/events"></script>';
  for (const relativePath of PAGES) {
    const html = read(relativePath);
    assert.ok(!/cookieyes/i.test(html), `${relativePath}: the retired consent service is still referenced`);
    assert.strictEqual((html.match(/\/js\/consent\.js/g) || []).length, 1,
      `${relativePath}: consent script count`);
    assert.strictEqual((html.match(/id="webmasterid-tracker"/g) || []).length, 1,
      `${relativePath}: WebmasterID count`);
    assert.ok(html.includes(webmasterId), `${relativePath}: WebmasterID changed`);
    assert.ok(html.includes('https://www.googletagmanager.com/gtag/js?id=G-4RE6YCJZBD'),
      `${relativePath}: GA loader changed`);
    assert.ok(html.includes("gtag('config', 'G-4RE6YCJZBD')")
      || html.includes("gtag('config','G-4RE6YCJZBD')"), `${relativePath}: GA config changed`);
    // Every analytics script must be inert as served. A single ungated one puts
    // the site back where it started.
    for (const tag of html.match(/<script[^>]*googletagmanager[^>]*>/g) || []) {
      assert.ok(/type="text\/plain"/.test(tag) && /data-consent="analytics"/.test(tag),
        `${relativePath}: the GA loader is executable before consent`);
    }
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
