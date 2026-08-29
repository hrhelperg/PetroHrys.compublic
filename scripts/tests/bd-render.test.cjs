// scripts/tests/bd-render.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { renderPage } = require('../lib/bd-render.cjs');
const seo = require('../lib/bd-seo.cjs');

const COUNTRY = { slug: 'united-states', name: 'United States', titleName: 'the United States' };
const CATEGORY = { slug: 'saas', name: 'SaaS', description: 'Listing sites for subscription software.' };
const DIRECTORY = {
  id: 'us-example', slug: 'example', name: 'Example Directory',
  website: 'https://example.com', description: 'A directory.',
  country: 'united-states', category: 'saas',
};

const hub = () => renderPage({
  meta: seo.buildHubMeta({
    countries: [{ name: 'United States', path: '/research/business-directories/united-states/' }],
    faqs: [{ q: 'Why?', a: 'Because.' }],
  }),
  main: '<p>Body</p>',
});

const emptyCountry = () => renderPage({
  meta: seo.buildCountryMeta({ country: COUNTRY, categories: [], directories: [] }),
  main: '<p>Body</p>',
});

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr']);
function tagBalance(html) {
  // Strips script contents first: their text is not markup.
  const stripped = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '<script></script>');
  const stack = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\/?)>/g;
  let m;
  while ((m = re.exec(stripped)) !== null) {
    const [, closing, rawName, , selfClose] = m;
    const name = rawName.toLowerCase();
    if (VOID.has(name) || selfClose || name === '!doctype') continue;
    if (closing) {
      const open = stack.pop();
      assert.strictEqual(open, name, `</${name}> closes <${open}>`);
    } else {
      stack.push(name);
    }
  }
  return stack;
}

test('emits a complete html document', () => {
  const html = hub();
  assert.ok(html.startsWith('<!DOCTYPE html>'));
  assert.ok(html.includes('<html lang="en">'));
  assert.ok(html.trimEnd().endsWith('</html>'));
});

test('the document is tag-balanced', () => {
  assert.deepStrictEqual(tagBalance(hub()), []);
  assert.deepStrictEqual(tagBalance(emptyCountry()), []);
});

test('canonical comes from the seo builder and uses the apex origin', () => {
  assert.ok(hub().includes('<link rel="canonical" href="https://petrohrys.com/research/business-directories/">'));
});

test('no apex-domain url appears anywhere in the document', () => {
  for (const html of [hub(), emptyCountry()]) {
    assert.ok(!/https:\/\/www\.petrohrys\.com/.test(html), 'www url leaked');
  }
});

test('robots is emitted only when the builder marks the page noindex', () => {
  assert.ok(!hub().includes('name="robots"'), 'hub must be indexable');
  assert.ok(emptyCountry().includes('<meta name="robots" content="noindex,follow">'));
});

test('title and description come from the builder', () => {
  const html = hub();
  assert.ok(html.includes('<title>Business Directories — Petro Hrys</title>'));
  assert.ok(/<meta name="description" content="A country-by-country research index/.test(html));
});

test('all Open Graph and Twitter tags are present', () => {
  const html = hub();
  for (const tag of ['og:title', 'og:description', 'og:url', 'og:type', 'og:site_name', 'og:image',
    'twitter:card', 'twitter:site', 'twitter:title', 'twitter:description', 'twitter:image']) {
    assert.ok(html.includes(`"${tag}"`), `missing ${tag}`);
  }
});

test('loads the site stylesheet and the section stylesheet, in that order', () => {
  const html = hub();
  const site = html.indexOf('/css/petrohrys.css');
  const section = html.indexOf('/css/business-directories.css');
  assert.ok(site > -1 && section > -1);
  assert.ok(site < section, 'section styles must come after the site styles');
});

test('never contains the unfilled bing verification placeholder', () => {
  assert.ok(!hub().includes('PASTE_YOUR_BING_VERIFICATION_CODE_HERE'));
  assert.ok(!hub().includes('msvalidate.01'));
});

test('reuses the site nav and adds exactly one Research Center item per list', () => {
  const html = hub();
  assert.strictEqual((html.match(/class="nav-primary"/g) || []).length, 2, 'desktop + mobile');
  // The label is now translated per locale, so the English literal only appears
  // on the English render. The invariant is one Research Center item per nav
  // LIST — desktop and mobile — which is asserted through the route it points
  // at rather than through the English words it happens to use.
  // Counted INSIDE the two nav-primary lists. The label is now translated per
  // locale, so counting the English words across the whole document also
  // catches the footer and the breadcrumb; the invariant is one item per nav
  // list, which is what is asserted.
  const I18N = require('../lib/i18n.cjs');
  const navLists = (doc) => [...doc.matchAll(/<ul class="nav-primary">([\s\S]*?)<\/ul>/g)].map((m) => m[1]);
  const lists = navLists(html);
  assert.strictEqual(lists.length, 2, 'expected a desktop and a mobile nav list');
  for (const list of lists) {
    assert.strictEqual((list.match(/aria-current="true"/g) || []).length, 1,
      'expected exactly one Research Center item per nav list');
    assert.ok(list.includes('href="/research/"'), 'the Research Center item lost its route');
  }
  // The old count of 2 assumed only the nav used this label. The breadcrumb now
  // uses the same translation key, which is correct — so the count is no longer
  // the invariant, and the per-list assertions above are.
  assert.ok(html.includes('href="/work/">Work<'));
  assert.ok(html.includes('>Research &amp; Writing<'));
  assert.ok(html.includes('href="/about/">About<'));
});

test('the language switcher is reproduced unchanged', () => {
  const html = hub();
  assert.strictEqual((html.match(/class="nav-lang"/g) || []).length, 2);
  for (const lang of ['>EN<', '>ES<', '>FR<', '>DE<']) {
    assert.ok(html.includes(lang), `missing ${lang}`);
  }
});

test('includes the ecosystem banner markers and markup', () => {
  const html = hub();
  assert.ok(html.includes('helperg-eco:head:start'));
  assert.ok(html.includes('helperg-eco:head:end'));
  assert.ok(html.includes('helperg-eco:body:start'));
  assert.ok(html.includes('helperg-eco:body:end'));
  assert.ok(html.includes('data-helperg-eco'));
});

test('includes the skip link and a main landmark', () => {
  const html = hub();
  assert.ok(html.includes('<a class="skip" href="#main">Skip to content</a>'));
  assert.ok(html.includes('<main id="main">'));
});

test('renders the breadcrumb component with a labelled nav', () => {
  const html = hub();
  assert.ok(html.includes('aria-label="Breadcrumb"'));
  assert.ok(html.includes('<ol class="bd-crumbs">'));
  assert.ok(html.includes('aria-current="page">Business Directories<'));
});

test('the breadcrumb trail matches the page depth', () => {
  const html = renderPage({
    meta: seo.buildCategoryMeta({ country: COUNTRY, category: CATEGORY, directories: [DIRECTORY] }),
    main: '<p>x</p>',
  });
  const crumbs = html.match(/<li class="bd-crumb">/g) || [];
  assert.strictEqual(crumbs.length, 5);
  assert.ok(html.includes('aria-current="page">SaaS<'));
});

test('JSON-LD is embedded and parses', () => {
  const html = hub();
  const match = html.match(/<script type="application\/ld\+json">\n([\s\S]*?)\n  <\/script>/);
  assert.ok(match, 'no ld+json block found');
  const raw = match[1].replace(/\\u003c/g, '<').replace(/\\u003e/g, '>');
  const parsed = JSON.parse(raw);
  assert.strictEqual(parsed['@context'], 'https://schema.org');
  assert.ok(Array.isArray(parsed['@graph']));
});

test('a script breakout in page data cannot escape the JSON-LD block', () => {
  const html = renderPage({
    meta: seo.buildDirectoryMeta({
      country: COUNTRY, category: CATEGORY,
      directory: { ...DIRECTORY, name: '</script><img src=x onerror=alert(1)>' },
    }),
    main: '<p>x</p>',
  });
  assert.ok(!html.includes('</script><img'));
  assert.deepStrictEqual(tagBalance(html), []);
});

test('the client script is deferred and loaded once', () => {
  const html = hub();
  assert.strictEqual((html.match(/business-directories\.js/g) || []).length, 1);
  assert.ok(html.includes('<script src="/js/business-directories.js" defer></script>'));
});

test('the shared ordering module is loaded before the enhancement script', () => {
  const html = hub();
  assert.ok(html.includes('<script src="/js/bd-order.js" defer></script>'));
  assert.ok(html.indexOf('/js/bd-order.js') < html.indexOf('/js/business-directories.js'),
    'BDOrder must be defined before the script that consumes it');
});

test('the RSS feed is advertised', () => {
  assert.ok(hub().includes('rel="alternate" type="application/rss+xml"'));
});

test('the main content is inserted verbatim', () => {
  const html = renderPage({
    meta: seo.buildHubMeta({ countries: [] }),
    main: '<section class="bd-section"><h2>Marker</h2></section>',
  });
  assert.ok(html.includes('<section class="bd-section"><h2>Marker</h2></section>'));
});

test('rendering is deterministic', () => {
  const runs = new Set(Array.from({ length: 20 }, hub));
  assert.strictEqual(runs.size, 1);
});

test('no build-time timestamp is embedded', () => {
  const html = hub();
  const withoutAnalytics = html.replace(/new Date\(\)/g, '');
  assert.ok(!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(withoutAnalytics));
});

test('exactly one h1 is present, from the page main', () => {
  const html = renderPage({
    meta: seo.buildHubMeta({ countries: [] }),
    main: '<article class="page-hero"><h1>Business Directories</h1></article>',
  });
  assert.strictEqual((html.match(/<h1[ >]/g) || []).length, 1);
});

test('the shell markup matches the live editorial pages', () => {
  const live = fs.readFileSync(path.join(__dirname, '..', '..', 'research', 'index.html'), 'utf8');
  const html = hub();
  for (const fragment of [
    '<a href="/" class="wordmark">Petro Hrys</a>',
    '<ul class="nav-lang" aria-label="Language">',
    '<details class="nav-mobile">',
    '<p class="footer-bottom">&copy; 2026 Petro Hrys</p>',
    '<link rel="stylesheet" href="/css/petrohrys.css">',
  ]) {
    assert.ok(live.includes(fragment), `fixture drift: live page lacks ${fragment}`);
    assert.ok(html.includes(fragment), `rendered page lacks ${fragment}`);
  }
});

test('the section nav item claims section, not page', () => {
  // Generated pages sit inside the Research Center but are never /research/,
  // so aria-current="page" would be a false claim about this link's target.
  const html = hub();
  assert.ok(html.includes('<a href="/research/" aria-current="true">Research Center</a>'));
  assert.ok(!html.includes('href="/research/" aria-current="page"'));
});

test('the compact footer points to the Research hub, not every collection', () => {
  const html = hub();
  const footer = html.slice(html.indexOf('<footer role="contentinfo">'));
  assert.ok(footer.includes('<a href="/research/">Research</a>'));
  assert.ok(!footer.includes('<a href="/research/business-directories/"'));
});
