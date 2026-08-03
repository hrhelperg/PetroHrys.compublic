// scripts/tests/bd-components.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const c = require('../lib/bd-components.cjs');

const DIR = {
  id: 'us-example', slug: 'example-directory', name: 'Example Directory',
  country: 'united-states', category: 'saas', website: 'https://example.com',
  description: 'A directory of things.', tier: 'tier1',
  petroHrysScore: null, domainRating: null, authorityScore: null,
  estimatedTraffic: null, referringDomains: null, free: null, paid: null,
  verificationRequired: null, manualReview: null, acceptsSaaS: null,
  acceptsStartups: null, acceptsAI: null, lastVerified: null, nextVerification: null,
  recommendedIndustries: [], pros: [], cons: [], editorNotes: '', metricsProvenance: {},
};

const XSS = '<script>alert(1)</script>';
const LONG = 'Ω'.repeat(5000);
const UNICODE = 'Česká republika — 東京 — Ünïcodé — ĄŻŚ';

// Minimal well-formedness checker: tokenises tags and asserts the stack balances.
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr']);
function assertWellFormed(html, label) {
  const stack = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\/?)>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const [, closing, rawName, , selfClose] = m;
    const name = rawName.toLowerCase();
    if (VOID.has(name) || selfClose) continue;
    if (closing) {
      const open = stack.pop();
      assert.strictEqual(open, name, `${label}: </${name}> closes <${open}>`);
    } else {
      stack.push(name);
    }
  }
  assert.deepStrictEqual(stack, [], `${label}: unclosed tags ${stack.join(', ')}`);
}

const ALL = () => [
  c.breadcrumbs([{ name: 'Home', path: '/' }, { name: 'Here', path: '/here/' }]),
  c.pageIntro({ title: 'T', lede: 'L' }),
  c.cardGrid([c.countryCard({ name: 'A', path: '/a/' }), c.countryCard({ name: 'B', path: '/b/', pending: true })]),
  c.cardGrid([c.categoryCard({ name: 'C', path: '/c/', description: 'd' })]),
  c.directoryTable({ directories: [DIR] }),
  c.directoryCard({ directory: DIR }),
  c.metricsBlock(DIR),
  c.statusBadges(DIR),
  c.prosCons({ pros: ['p'], cons: [] }),
  c.bestForTags(['legal']),
  c.emptyState('Nothing here.'),
  c.searchControls({}),
  c.filterControls({}),
  c.sortControls({}),
  c.pagination({ current: 1, total: 3, basePath: '/x/' }),
  c.methodologyNote(),
  c.faqSection([{ q: 'Q?', a: 'A.' }]),
  c.provenanceBlock(DIR),
  c.externalLinkCta({ url: 'https://example.com' }),
];

// --- escaping and injection -------------------------------------------------

test('script payloads in text are escaped everywhere', () => {
  const evil = { ...DIR, name: XSS, description: XSS, recommendedIndustries: [XSS], pros: [XSS], cons: [XSS] };
  const html = [
    c.directoryTable({ directories: [evil] }), c.directoryCard({ directory: evil }),
    c.bestForTags([XSS]), c.prosCons({ pros: [XSS], cons: [XSS] }),
    c.pageIntro({ title: XSS, lede: XSS }), c.emptyState(XSS),
    c.countryCard({ name: XSS, path: '/x/' }), c.categoryCard({ name: XSS, path: '/x/', description: XSS }),
  ].join('\n');
  assert.ok(!html.includes('<script>'), 'raw script tag leaked');
  assert.ok(html.includes('&lt;script&gt;'));
});

// A raw double quote may only ever appear as an attribute delimiter. If one is
// followed by something shaped like an on* attribute, a real breakout happened.
// Stripping &quot; before scanning would re-create the pattern from inert text,
// so the entity is deliberately left in place.
function assertNoAttributeInjection(html, label) {
  assert.ok(!/"\s*on[a-z]+\s*=/i.test(html), `${label}: event handler injected via double quote`);
  assert.ok(!/'\s*on[a-z]+\s*=/i.test(html), `${label}: event handler injected via single quote`);
}

test('quotes in attribute positions cannot break out', () => {
  const evil = { ...DIR, name: '" onmouseover="alert(1)', slug: '" onfocus="alert(1)' };
  const html = c.directoryTable({ directories: [evil] });
  assertNoAttributeInjection(html, 'directoryTable');
  assert.ok(html.includes('&quot;'), 'the quote must survive as an escaped entity');
  assert.ok(html.includes('onmouseover'), 'the payload text itself is kept, just inert');
});

test('breadcrumb paths are escaped', () => {
  const html = c.breadcrumbs([{ name: 'A', path: '/a"onclick="x/' }, { name: 'B', path: '/b/' }]);
  assert.ok(html.includes('&quot;'));
  assertNoAttributeInjection(html, 'breadcrumbs');
});

// --- unsafe URLs ------------------------------------------------------------

test('unsafe url schemes are never rendered as links', () => {
  for (const bad of ['javascript:alert(1)', 'data:text/html;base64,PHN2Zz4=', 'file:///etc/passwd', 'not a url', '']) {
    const html = c.externalLinkCta({ url: bad });
    assert.ok(!html.includes('<a '), `scheme rendered as link: ${bad}`);
    assert.ok(html.includes('no usable address recorded'));
  }
});

test('a valid https url renders with the required rel attributes', () => {
  const html = c.externalLinkCta({ url: 'https://example.com/list' });
  assert.ok(html.includes('<a '));
  assert.ok(html.includes('rel="noopener noreferrer"'));
  assert.ok(/noopener/.test(html) && /noreferrer/.test(html));
});

test('editorial outbound links are not nofollowed', () => {
  // Outbound links are citations from original editorial pages, not paid
  // placements. Blanket nofollow would frame the section as a link directory.
  const html = c.externalLinkCta({ url: 'https://example.com/list' });
  assert.ok(!html.includes('nofollow'), 'editorial references must not be nofollowed');
  assert.strictEqual(c.REL_EXTERNAL, 'noopener noreferrer');
});

test('external cta announces that it opens a new tab', () => {
  const html = c.externalLinkCta({ url: 'https://example.com' });
  assert.ok(html.includes('target="_blank"'));
  assert.ok(html.includes('opens in a new tab'));
});

// --- null handling ----------------------------------------------------------

test('null metrics render an em dash with a spoken equivalent, never zero', () => {
  const html = c.metricsBlock(DIR);
  assert.ok(html.includes('&mdash;'));
  assert.ok(html.includes('Not recorded'));
  assert.ok(!/>0</.test(html), 'must never render 0 for an unknown value');
});

test('unknown fields never imply verification', () => {
  const html = c.statusBadges(DIR);
  assert.ok(html.includes('Not yet verified'));
  assert.ok(html.includes('Listing cost not recorded'));
  assert.ok(html.includes('Verification requirement not recorded'));
  assert.ok(!/>Verified</.test(html));
});

test('a verified record reports its date in a time element', () => {
  const html = c.provenanceBlock({ ...DIR, lastVerified: '2026-08-01' });
  assert.ok(html.includes('<time datetime="2026-08-01">2026-08-01</time>'));
});

test('an unverified record says so rather than showing a date', () => {
  assert.ok(c.provenanceBlock(DIR).includes('Not yet verified'));
});

test('third-party metrics always show provider and measurement date', () => {
  const html = c.metricsBlock({
    ...DIR, domainRating: 78, lastVerified: '2026-08-01',
    metricsProvenance: { domainRating: { provider: 'Ahrefs', measuredAt: '2026-08-01' } },
  });
  assert.ok(html.includes('78'));
  assert.ok(html.includes('Ahrefs'));
  assert.ok(html.includes('<time datetime="2026-08-01">'));
});

// --- empty and populated states --------------------------------------------

test('an empty directory table renders the empty state', () => {
  const html = c.directoryTable({ directories: [] });
  assert.ok(html.includes('bd-empty'));
  assert.ok(html.includes('manual verification'));
  assert.ok(!html.includes('<table'));
});

test('a populated table renders one row per directory with no cap', () => {
  const many = Array.from({ length: 137 }, (_, i) => ({ ...DIR, id: `i${i}`, slug: `s${i}`, name: `N${i}` }));
  const html = c.directoryTable({ directories: many });
  assert.strictEqual((html.match(/<tr class="bd-row"/g) || []).length, 137);
});

test('empty arrays produce factual empty copy, not blanks', () => {
  assert.ok(c.bestForTags([]).includes('No recommended industries recorded yet.'));
  assert.ok(c.prosCons({ pros: [], cons: [] }).includes('No strengths recorded yet.'));
  assert.ok(c.prosCons({ pros: [], cons: [] }).includes('No limitations recorded yet.'));
});

// --- semantics and accessibility -------------------------------------------

test('the table is semantic and readable without JavaScript', () => {
  const html = c.directoryTable({ directories: [DIR] });
  assert.ok(html.includes('<caption'));
  assert.ok(html.includes('<thead>'));
  assert.ok(html.includes('<tbody'));
  assert.ok((html.match(/scope="col"/g) || []).length >= 5);
  assert.ok(html.includes('scope="row"'));
});

test('breadcrumb is a labelled nav whose last item is aria-current', () => {
  const html = c.breadcrumbs([
    { name: 'Home', path: '/' }, { name: 'Research', path: '/research/' }, { name: 'Now', path: '/now/' },
  ]);
  assert.ok(html.includes('<nav'));
  assert.ok(html.includes('aria-label="Breadcrumb"'));
  assert.ok(html.includes('<ol'));
  assert.ok(html.includes('aria-current="page">Now<'));
  assert.strictEqual((html.match(/aria-current/g) || []).length, 1);
});

test('pagination is a labelled nav and the current page is not a link', () => {
  const html = c.pagination({ current: 2, total: 3, basePath: '/x/' });
  assert.ok(html.includes('aria-label="Directory pages"'));
  assert.ok(html.includes('aria-current="page"'));
  const current = html.split('\n').find((l) => l.includes('aria-current'));
  assert.ok(!current.includes('<a '), 'the current page must not be clickable');
});

test('pagination is omitted for a single page', () => {
  assert.strictEqual(c.pagination({ current: 1, total: 1, basePath: '/x/' }), '');
});

test('every form control has an associated label', () => {
  for (const html of [c.searchControls({}), c.filterControls({}), c.sortControls({})]) {
    const ids = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
    const fors = [...html.matchAll(/for="([^"]+)"/g)].map((m) => m[1]);
    for (const id of ids) assert.ok(fors.includes(id), `control ${id} has no label`);
    assert.ok(ids.length > 0);
  }
});

test('control ids can be namespaced so two shells never collide', () => {
  const a = c.searchControls({ idPrefix: 'alpha' });
  const b = c.searchControls({ idPrefix: 'beta' });
  assert.ok(a.includes('id="alpha-search"'));
  assert.ok(b.includes('id="beta-search"'));
  assert.ok(!a.includes('beta-'));
});

test('status is conveyed in words, never by colour alone', () => {
  const html = c.statusBadges({ ...DIR, free: true, verificationRequired: true, lastVerified: '2026-08-01' });
  for (const words of ['Verified', 'Free listing', 'Verification required']) {
    assert.ok(html.includes(words), `missing text for ${words}`);
  }
});

test('cards link only their title, never wrapping the whole block', () => {
  const html = c.directoryCard({ directory: DIR });
  const anchors = (html.match(/<a /g) || []).length;
  assert.strictEqual(anchors, 1);
  assert.ok(/<h3 class="bd-card-title"><a /.test(html));
});

test('heading level is configurable and clamped to a valid range', () => {
  assert.ok(c.directoryCard({ directory: DIR, headingLevel: 2 }).includes('<h2'));
  assert.ok(c.directoryCard({ directory: DIR, headingLevel: 99 }).includes('<h6'));
  assert.ok(c.directoryCard({ directory: DIR, headingLevel: 1 }).includes('<h2'));
});

test('a pending route is rendered as text, never as a link', () => {
  const html = c.countryCard({ name: 'Germany', path: '/germany/', pending: true });
  assert.ok(!html.includes('<a '));
  assert.ok(html.includes('coming soon'));
  assert.ok(html.includes('Germany'));
});

// --- markup hygiene ---------------------------------------------------------

test('no component emits an inline style or event handler', () => {
  const html = ALL().join('\n');
  assert.ok(!/\sstyle="/.test(html), 'inline style found');
  assert.ok(!/\son[a-z]+\s*=/i.test(html), 'inline event handler found');
  assertNoAttributeInjection(html, 'all components');
  assert.ok(!html.includes('javascript:'));
});

test('no component emits a script tag or raw JSON', () => {
  const html = ALL().join('\n');
  assert.ok(!/<script/i.test(html));
  assert.ok(!/application\/ld\+json/.test(html));
});

test('every fragment is well-formed', () => {
  ALL().forEach((html, i) => assertWellFormed(html, `fragment ${i}`));
});

test('no fake buttons and no interactive nesting', () => {
  const html = ALL().join('\n');
  assert.ok(!/<div[^>]*role="button"/.test(html));
  assert.ok(!/<a[^>]*>[^<]*<a /.test(html), 'nested anchors');
  assert.ok(!/<button[^>]*>[\s\S]*?<a /.test(html), 'anchor inside button');
});

// --- unicode, long values, determinism, immutability ------------------------

test('unicode survives intact in every text position', () => {
  const rec = { ...DIR, name: UNICODE, description: UNICODE, recommendedIndustries: [UNICODE] };
  const html = [c.directoryTable({ directories: [rec] }), c.directoryCard({ directory: rec }),
    c.bestForTags([UNICODE])].join('\n');
  for (const part of ['Česká republika', '東京', 'Ünïcodé', 'ĄŻŚ']) {
    assert.ok(html.includes(part), `lost ${part}`);
  }
});

test('very long values are rendered in full, never silently truncated', () => {
  const rec = { ...DIR, name: LONG, description: LONG };
  const html = c.directoryCard({ directory: rec });
  assert.ok(html.includes(LONG), 'source data was truncated');
  assert.ok(!html.includes('…'));
});

test('duplicate names and ids in the data do not break markup', () => {
  const dup = [{ ...DIR }, { ...DIR, slug: 'other' }];
  const html = c.directoryTable({ directories: dup });
  assertWellFormed(html, 'duplicate rows');
  assert.strictEqual((html.match(/<tr class="bd-row"/g) || []).length, 2);
});

test('repeated rendering is byte-identical', () => {
  const runs = new Set(Array.from({ length: 25 }, () => ALL().join('\n')));
  assert.strictEqual(runs.size, 1);
});

test('components never mutate their inputs', () => {
  const rec = { ...DIR, pros: ['a'], cons: ['b'], recommendedIndustries: ['c'] };
  const list = [rec];
  const snapshot = JSON.stringify({ rec, list });
  c.directoryTable({ directories: list });
  c.directoryCard({ directory: rec });
  c.metricsBlock(rec);
  c.statusBadges(rec);
  c.prosCons({ pros: rec.pros, cons: rec.cons });
  c.bestForTags(rec.recommendedIndustries);
  assert.strictEqual(JSON.stringify({ rec, list }), snapshot);
});

test('the table is ordered by bd-sort, not by input order', () => {
  const rows = [
    { ...DIR, id: 'a', slug: 'low', name: 'Low', petroHrysScore: 10, lastVerified: '2026-01-01' },
    { ...DIR, id: 'b', slug: 'high', name: 'High', petroHrysScore: 90, lastVerified: '2026-01-01' },
  ];
  const html = c.directoryTable({ directories: rows });
  assert.ok(html.indexOf('>High<') < html.indexOf('>Low<'), 'server order must come from bd-sort');
});

test('rows carry the data attributes the client script needs', () => {
  const html = c.directoryTable({ directories: [{ ...DIR, free: true }] });
  for (const attribute of ['data-bd-name', 'data-bd-haystack', 'data-bd-score',
    'data-bd-dr', 'data-bd-as', 'data-bd-traffic', 'data-bd-free']) {
    assert.ok(html.includes(attribute), `missing ${attribute}`);
  }
  assert.ok(html.includes('data-bd-free="1"'));
  assert.ok(html.includes('data-bd-paid="0"'));
});

test('null metrics produce empty data attributes rather than zero', () => {
  const html = c.directoryTable({ directories: [DIR] });
  assert.ok(html.includes('data-bd-score=""'));
  assert.ok(!html.includes('data-bd-score="0"'));
});

test('controls start hidden so the prerendered table stands alone', () => {
  for (const html of [c.searchControls({}), c.filterControls({}), c.sortControls({})]) {
    assert.ok(html.includes('hidden'), 'controls must be hidden until enhanced');
  }
});

test('the methodology note makes no claim about entry counts', () => {
  const html = c.methodologyNote();
  assert.ok(!/\d/.test(html), 'methodology copy must not assert numbers');
  assert.ok(html.includes('checked by hand'));
});

test('faqSection renders each question and answer visibly', () => {
  const html = c.faqSection([{ q: 'Why?', a: 'Because.' }, { q: 'How?', a: 'Carefully.' }]);
  assert.ok(html.includes('Why?'));
  assert.ok(html.includes('Because.'));
  assert.ok(html.includes('How?'));
  assert.ok(html.includes('Carefully.'));
  assert.strictEqual((html.match(/bd-faq-item/g) || []).length, 2);
});

test('faqSection is empty when there is no approved content', () => {
  assert.strictEqual(c.faqSection([]), '');
  assert.strictEqual(c.faqSection(undefined), '');
});

test('faqSection escapes question and answer text', () => {
  const html = c.faqSection([{ q: XSS, a: XSS }]);
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});
