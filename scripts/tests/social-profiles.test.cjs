'use strict';

// Guards for the canonical Petro Hrys social profile surface.
//
// ── WHAT WENT WRONG BEFORE ──────────────────────────────────────────────────
//
// The site carried three hand-written social surfaces that had drifted apart:
// a Person.sameAs array on four homepages, an "Elsewhere" paragraph on four
// About pages, and a community card grid on the PDF Editor page. Between them
// they shipped an outdated LinkedIn URL (petro-hrys-8306b9401), a stale
// Instagram handle (wwwpetrohryscom), a Reddit handle that no longer resolved,
// four emoji standing in for platform marks, and a dead `href="#"`. Eight of
// the twelve official profiles appeared nowhere at all.
//
// The fix was a single registry (js/social-profiles.js) plus a renderer
// (scripts/inject-social-profiles.cjs). These tests assert the property that
// keeps it from drifting back: the registry is the ONLY place a profile URL is
// written, and what ships on disk is what the registry says.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const registry = require('../../js/social-profiles.js');
const injector = require('../inject-social-profiles.cjs');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// The owner-supplied canonical destinations, transcribed here a SECOND time and
// independently of the registry. If someone "tidies" a URL in the registry —
// strips a query string, fixes capitalisation — this list disagrees and fails.
const OWNER_SUPPLIED = {
  x: 'https://x.com/PetroHrys',
  github: 'https://github.com/hrhelperg',
  facebook: 'https://www.facebook.com/profile.php?id=61591740083024',
  youtube: 'https://www.youtube.com/@Petrohrys',
  instagram: 'https://www.instagram.com/thisispetrohrys?igsi=MXMwdGNlMnAzOGhiOQ%3D%3D&utm_source=qr',
  substack: 'https://substack.com/@petrohrys?utm_source=user-menu',
  pinterest: 'https://pin.it/6rm8WazKc',
  medium: 'https://medium.com/@hrhelperg',
  reddit: 'https://www.reddit.com/u/Petrohryscom/s/ue4YbUY65s',
  hackernoon: 'https://hackernoon.com/u/petrohrys',
  bluesky: 'https://bsky.app/profile/petrohrys.bsky.social',
  linkedin: 'https://www.linkedin.com/in/petro-hrys-471109411/'
};

// Social URLs that were on the site before and must never reappear.
const RETIRED = [
  'petro-hrys-8306b9401',
  'instagram.com/wwwpetrohryscom',
  'reddit.com/u/PetroHrys/',
  'reddit.com/u/PetroHrys"',
  'x.com/petrohrys?s=21',
  'facebook.com/share/178dtga3uH',
  'youtube.com/@petrohrys"',
  't.me/Petro_Hrysp',
  // Retired at the owner's request: no traffic, and the association is not
  // one the site wants to carry. Listed here so it cannot drift back in.
  'truthsocial.com/@HPetro'
];

// Identity profiles on platforms the registry does NOT own. They are not part
// of the visible twelve-icon footer and are deliberately absent from the
// registry, so the ONLY thing keeping them alive is updateSameAs() preserving
// every host it does not own. That is a property worth a test: a future change
// that rebuilt sameAs from the registry alone would silently delete four real
// profiles, and nothing else here would notice.
const RETAINED_IDENTITY = [
  'https://www.threads.com/@wwwpetrohryscom',
  'https://www.quora.com/profile/Petro-Hrys',
  'https://t.me/PetroHryscom'
];

const PAGES = injector.targets();

test('all twelve official profiles are registered, enabled, and ordered', () => {
  const enabled = registry.enabled();
  assert.equal(enabled.length, 12, 'expected exactly twelve enabled profiles');
  assert.deepEqual(
    enabled.map((p) => p.id),
    ['linkedin', 'github', 'x', 'youtube', 'instagram', 'bluesky',
     'substack', 'medium', 'reddit', 'hackernoon', 'facebook', 'pinterest'],
    'display order must match the owner-approved priority'
  );
  const priorities = enabled.map((p) => p.priority);
  assert.deepEqual(priorities, [...priorities].sort((a, b) => a - b));
  assert.equal(new Set(priorities).size, 12, 'priorities must be unique');
});

test('every profile URL is the owner-supplied destination, verbatim', () => {
  for (const p of registry.enabled()) {
    assert.equal(p.url, OWNER_SUPPLIED[p.id], `${p.id} URL was altered`);
  }
  assert.equal(Object.keys(OWNER_SUPPLIED).length, 12);
});

test('every profile carries a real platform mark, not a letter or an emoji', () => {
  for (const p of registry.enabled()) {
    assert.ok(p.icon && p.icon.length > 40, `${p.id} has no usable SVG path`);
    // A path, not a placeholder circle or a text glyph.
    assert.match(p.icon, /^[Mm]/, `${p.id} icon must be an SVG path`);
    assert.doesNotMatch(p.icon, /[\u{1F300}-\u{1FAFF}]/u, `${p.id} icon contains an emoji`);
  }
  const paths = registry.enabled().map((p) => p.icon);
  assert.equal(new Set(paths).size, 12, 'each platform needs its own distinct mark');
});

test('the component ships on every page that has the site footer', () => {
  assert.ok(PAGES.length >= 60, `expected the brand pages in scope, got ${PAGES.length}`);
  for (const rel of PAGES) {
    const html = read(rel);
    assert.ok(html.includes(injector.START), `${rel} is missing the social block`);
    assert.equal(
      html.split(injector.START).length - 1, 1,
      `${rel} has a duplicate social block`
    );
    for (const p of registry.enabled()) {
      assert.ok(html.includes(`href="${p.url.replace(/&/g, '&amp;')}"`),
        `${rel} does not link ${p.id}`);
    }
  }
});

test('every icon-only link has an explicit accessible name', () => {
  for (const rel of PAGES) {
    const html = read(rel);
    const block = html.slice(html.indexOf(injector.START), html.indexOf(injector.END));
    const links = block.match(/<a\b[^>]*>/g) || [];
    assert.equal(links.length, 12, `${rel} should render twelve links`);
    for (const a of links) {
      assert.match(a, /aria-label="[^"]{4,}"/, `${rel}: icon link without an accessible name`);
      assert.match(a, /rel="noopener noreferrer"/, `${rel}: target=_blank without rel`);
      assert.match(a, /target="_blank"/);
    }
    // The mark itself must be hidden from the accessibility tree so the
    // aria-label is the single announced name.
    const svgs = block.match(/<svg\b[^>]*>/g) || [];
    assert.equal(svgs.length, 12);
    for (const s of svgs) assert.match(s, /aria-hidden="true"/);
    // No <title> standing in for a label, per the brief.
    assert.doesNotMatch(block, /<title>/);
  }
});

test('no page ships a dead, empty or placeholder social link', () => {
  for (const rel of PAGES) {
    const html = read(rel);
    const block = html.slice(html.indexOf(injector.START), html.indexOf(injector.END));
    assert.doesNotMatch(block, /href="#"/, `${rel}: placeholder href`);
    assert.doesNotMatch(block, /href=""/, `${rel}: empty href`);
    assert.doesNotMatch(block, /aria-disabled/, `${rel}: disabled social link`);
  }
});

test('the retired social URLs are gone from every public page', () => {
  for (const rel of PAGES) {
    const html = read(rel);
    for (const stale of RETIRED) {
      assert.ok(!html.includes(stale), `${rel} still carries the retired URL ${stale}`);
    }
  }
});

test('the interface labels localize but the platform names never do', () => {
  const byLang = { en: 'Follow', es: 'Seguir', fr: 'Suivre', de: 'Folgen' };
  for (const [lang, heading] of Object.entries(byLang)) {
    const block = injector.footerBlock(lang);
    assert.ok(block.includes(`>${heading}<`), `${lang} heading did not localize`);
    for (const p of registry.enabled()) {
      assert.ok(block.includes(p.url.replace(/&/g, '&amp;')), `${lang} lost ${p.id}`);
      assert.ok(block.includes(`aria-label="Petro Hrys `), `${lang} label malformed`);
    }
  }
  // The URL set is identical in all four locales.
  const urls = (l) => (injector.footerBlock(l).match(/href="([^"]+)"/g) || []).sort();
  assert.deepEqual(urls('es'), urls('en'));
  assert.deepEqual(urls('fr'), urls('en'));
  assert.deepEqual(urls('de'), urls('en'));
});

test('localized pages render their own language, not English', () => {
  const expected = { de: 'Folgen', es: 'Seguir', fr: 'Suivre' };
  for (const [lang, heading] of Object.entries(expected)) {
    const rel = `${lang}/index.html`;
    const html = read(rel);
    const block = html.slice(html.indexOf(injector.START), html.indexOf(injector.END));
    assert.ok(block.includes(`>${heading}<`), `${rel} rendered an English heading`);
    assert.ok(!block.includes('>Follow<'), `${rel} leaked the English heading`);
  }
});

test('Person.sameAs carries the canonical profiles and still parses', () => {
  for (const rel of ['index.html', 'de/index.html', 'es/index.html', 'fr/index.html']) {
    const html = read(rel);
    const raw = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1];
    const graph = JSON.parse(raw)['@graph'];
    const person = graph.find((n) => n['@type'] === 'Person');
    assert.ok(person, `${rel} lost its Person node`);
    for (const p of registry.enabled()) {
      assert.ok(person.sameAs.includes(p.url), `${rel} sameAs is missing ${p.id}`);
    }
    for (const url of RETAINED_IDENTITY) {
      assert.ok(person.sameAs.includes(url), `${rel} sameAs dropped the retained profile ${url}`);
    }
    assert.equal(new Set(person.sameAs).size, person.sameAs.length, `${rel} sameAs has duplicates`);
    assert.equal(person.sameAs.length, registry.enabled().length + RETAINED_IDENTITY.length,
      `${rel} sameAs has entries that are neither canonical nor retained`);
    // Retained profiles are sameAs-only: they must not appear in the icon row.
    const block = html.slice(html.indexOf(injector.START), html.indexOf(injector.END));
    for (const url of RETAINED_IDENTITY) {
      assert.ok(!block.includes(url), `${rel} leaked ${url} into the visible footer`);
    }
    for (const stale of RETIRED) {
      assert.ok(!person.sameAs.some((u) => u.includes(stale)), `${rel} sameAs kept ${stale}`);
    }
    // Personal identity links only — no product or corporate URLs.
    const org = graph.find((n) => n['@type'] === 'Organization');
    if (org) assert.ok(!org.sameAs, 'personal profiles must not be copied into Organization.sameAs');
  }
});

test('the analytics and ecosystem surfaces are untouched', () => {
  for (const rel of PAGES) {
    const html = read(rel);
    assert.ok(html.includes('<!-- helperg-eco:body:start -->'),
      `${rel} lost the HELPERG Ecosystem banner`);
    assert.ok(html.includes('/js/ecosystem-registry.js'), `${rel} lost the product registry`);
    // The social block must sit outside the ecosystem banner entirely.
    const socialAt = html.indexOf(injector.START);
    const ecoEnd = html.indexOf('<!-- helperg-eco:body:end -->');
    assert.ok(socialAt > ecoEnd, `${rel}: the social block landed inside the ecosystem banner`);
  }
  // WebmasterID is configured in exactly one place and is unchanged.
  const home = read('index.html');
  assert.ok(home.includes('wm_bktqqtd7heom5nkl'), 'WebmasterID site id changed');
  assert.ok(home.includes('webmasterid-ingest-api.vercel.app/api/events'), 'WebmasterID endpoint changed');
});

test('the legacy hand-written social surfaces are retired', () => {
  for (const rel of ['about/index.html', 'de/about/index.html', 'es/about/index.html', 'fr/about/index.html']) {
    const html = read(rel);
    assert.ok(!html.includes('class="socials"'), `${rel} still has the old Elsewhere block`);
    assert.ok(!html.includes('aria-labelledby="elsewhere"'), `${rel} left an empty Elsewhere section`);
  }
  const pdf = read('pdf-editor/index.html');
  assert.doesNotMatch(pdf, /<span class="social-link-icon">[^<]*[\u{1F300}-\u{1FAFF}\u{1D400}-\u{1D7FF}]/u,
    'the PDF Editor cards still use emoji glyphs');
  assert.ok(!pdf.includes('Notion — Coming Soon'), 'the dead Notion placeholder is still shipping');
});
