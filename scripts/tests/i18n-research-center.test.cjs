'use strict';

// Research Center internationalization — the contract.
//
// The value of this phase rests on one thing: ONE data layer, four presentation
// layers. If a locale ever gets its own copy of the 1,563 directory records,
// then a year from now nobody knows which copy is right, and the corrections
// made to one will silently not exist in the others. Most of this file defends
// that, plus the two SEO properties that break silently: reciprocal hreflang
// and self-referencing canonicals.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const I = require(path.join(ROOT, 'scripts/lib/i18n.cjs'));
const ORIGIN = 'https://petrohrys.com';

const manifests = ['business-directories', 'marketplaces', 'media-pr-publishing', 'regional-media', 'distribution-planner']
  .map((d) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', d, '.build-manifest.json'), 'utf8')));
const allOwned = manifests.flatMap((m) => (Array.isArray(m.files) ? m.files : Object.keys(m.files)));
const ownedHtml = allOwned.filter((f) => f.endsWith('.html'));
const canonicalHtml = ownedHtml.filter((f) => f.startsWith('research/'));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ── 1-3. locales and dictionaries ───────────────────────────────────────────

test('the locale set is the one the site actually ships', () => {
  // Discovered, not invented: /es/, /fr/ and /de/ exist in the repository and
  // the shipped language switcher lists exactly these four.
  assert.deepStrictEqual(I.LOCALE_CODES, ['en', 'es', 'fr', 'de']);
  for (const l of I.LOCALES) {
    if (l.code === I.DEFAULT_LOCALE) { assert.strictEqual(l.prefix, ''); continue; }
    assert.ok(fs.existsSync(path.join(ROOT, l.code)), `/${l.code}/ does not exist in the repository`);
    assert.strictEqual(l.prefix, `/${l.code}`);
  }
});

test('every translation key exists in every locale, and none is unused', () => {
  assert.deepStrictEqual(I.missingKeys(), {},
    'the dictionaries disagree about which keys exist');
  const keys = I.allKeys('en');
  assert.ok(keys.length > 100, `only ${keys.length} keys; the UI cannot be covered`);
  for (const code of I.LOCALE_CODES) {
    for (const k of keys) {
      const v = I.raw(code, k);
      assert.ok(typeof v === 'string' && v.trim(), `${code}.${k} is empty`);
    }
  }
});

test('a missing key fails the build instead of rendering nothing', () => {
  assert.throws(() => I.t('de', 'this.key.does.not.exist'), /Missing translation/,
    'a missing key returned quietly; a blank column heading is worse than a failed build');
  assert.throws(() => I.label('de', 'opportunity', 'not-a-real-value'), /No de label/);
  assert.throws(() => I.translator('kl'), /Unknown locale/);
});

test('uncertainty survives translation in every locale', () => {
  // The single most dangerous failure mode: a German reader told something is
  // confirmed because the English hedge was smoothed away in translation.
  const HEDGED = ['evidence.unknown', 'evidence.notVerified', 'evidence.needsBrowser',
    'evidence.routeNotEstablished', 'opportunity.unknown', 'status.NEEDS_RESEARCH',
    'status.NEEDS_BROWSER', 'band.unscored', 'confidence.INSUFFICIENT'];
  // Markers of epistemic hedging, listed per language rather than accreted
  // patch by patch. A translation of a hedged English string must contain at
  // least one of these, or the German reader is being told something is settled
  // when the English says it is not.
  const UNCERTAIN = new RegExp([
    // English
    'unknown', 'not verified', 'not yet', 'not established', 'not enough', 'needs', 'check', 'research',
    // Spanish
    'desconocid', 'sin verificar', 'requiere', 'no establecid', 'sin puntuar',
    'insuficiente', 'investigaci', 'comprobaci',
    // French
    'inconnu', 'non vérifié', 'requise', 'non établie', 'pas encore', 'insuffisant',
    'recherche', 'vérification',
    // German
    'unbekannt', 'nicht verifiziert', 'erforderlich', 'nicht ermittelt', 'noch nicht',
    'nicht ausreichend', 'prüfung', 'recherche',
  ].join('|'), 'i');
  for (const code of I.LOCALE_CODES) {
    for (const key of HEDGED) {
      assert.match(I.raw(code, key), UNCERTAIN,
        `${code}.${key} = "${I.raw(code, key)}" reads as certain; the English is not`);
    }
  }
});

// ── 4-6. route parity ───────────────────────────────────────────────────────

test('every canonical Research route exists in every locale', () => {
  assert.ok(canonicalHtml.length > 400, `only ${canonicalHtml.length} canonical routes found`);
  const missing = [];
  for (const rel of canonicalHtml) {
    const canonicalPath = `/${rel.replace(/index\.html$/, '')}`;
    for (const code of I.LOCALE_CODES) {
      const f = I.localizedFile(code, canonicalPath);
      if (!fs.existsSync(path.join(ROOT, f))) missing.push(f);
    }
  }
  assert.deepStrictEqual(missing.slice(0, 5), [], `${missing.length} localized routes are missing`);
  // And the hand-written Research hub too.
  for (const code of I.LOCALE_CODES) {
    assert.ok(fs.existsSync(path.join(ROOT, I.localizedFile(code, '/research/'))),
      `the ${code} Research Center hub is missing`);
  }
});

test('the localized route count is derived, not asserted', () => {
  // canonical routes x locales, with the hub counted once per locale.
  const expected = (canonicalHtml.length + 1) * I.LOCALE_CODES.length;
  let found = 0;
  for (const rel of [...canonicalHtml, 'research/index.html']) {
    const p = `/${rel.replace(/index\.html$/, '')}`;
    for (const code of I.LOCALE_CODES) {
      if (fs.existsSync(path.join(ROOT, I.localizedFile(code, p)))) found += 1;
    }
  }
  assert.strictEqual(found, expected,
    `${found} localized pages exist for an expected universe of ${expected}`);
});

test('every Research hub exposes the English-only Product Launch Platforms collection', () => {
  const route = '/research/product-launch-platforms/';
  for (const code of I.LOCALE_CODES) {
    const html = read(I.localizedFile(code, '/research/'));
    assert.ok(html.includes(`href="${route}"`),
      `${code} Research hub does not link to Product Launch Platforms`);
    if (code !== 'en') {
      assert.ok(!html.includes(`href="/${code}${route}"`),
        `${code} Research hub advertises a nonexistent localized Product Launch route`);
    }
  }
});

// ── 7-10. SEO correctness ───────────────────────────────────────────────────

const sample = () => {
  const picks = ['research/marketplaces/index.html', 'research/media-pr-publishing/index.html',
    'research/regional-media/index.html',
    'research/distribution-planner/index.html', 'research/business-directories/index.html',
    'research/media-pr-publishing/for/telecom-voip-ucaas/index.html'];
  return picks.filter((p) => fs.existsSync(path.join(ROOT, p)));
};

test('every localized page self-canonicalises and declares its own lang', () => {
  for (const rel of sample()) {
    const canonicalPath = `/${rel.replace(/index\.html$/, '')}`;
    for (const code of I.LOCALE_CODES) {
      const html = read(I.localizedFile(code, canonicalPath));
      const lang = (html.match(/<html lang="([^"]+)"/) || [])[1];
      assert.strictEqual(lang, I.LOCALE_BY_CODE.get(code).htmlLang, `${rel} @${code}: wrong <html lang>`);
      const canonical = (html.match(/rel="canonical" href="([^"]+)"/) || [])[1];
      assert.strictEqual(canonical, `${ORIGIN}${I.localizedPath(code, canonicalPath)}`,
        `${rel} @${code}: canonical does not point at itself`);
      // The classic silent failure: a translated page canonicalising to English
      // tells search engines the translation should not be indexed at all.
      if (code !== 'en') {
        assert.notStrictEqual(canonical, `${ORIGIN}${canonicalPath}`,
          `${rel} @${code}: canonical points back at the English page`);
      }
      assert.ok(!/name="robots"[^>]*noindex/.test(html), `${rel} @${code}: accidentally noindex`);
      // Localized Open Graph. Without og:locale a shared link is announced in
      // the wrong language even though the page itself is translated.
      const og = (html.match(/property="og:locale" content="([^"]+)"/) || [])[1];
      assert.strictEqual(og, I.LOCALE_BY_CODE.get(code).ogLocale,
        `${rel} @${code}: og:locale is missing or wrong`);
      const ogUrl = (html.match(/property="og:url" content="([^"]+)"/) || [])[1];
      assert.ok(ogUrl, `${rel} @${code}: no og:url`);
      const title = (html.match(/<title>([^<]+)<\/title>/) || [])[1];
      const desc = (html.match(/name="description" content="([^"]+)"/) || [])[1];
      assert.ok(title && title.trim(), `${rel} @${code}: no title`);
      assert.ok(desc && desc.trim(), `${rel} @${code}: no meta description`);
    }
  }
});

test('hreflang clusters are complete and reciprocal', () => {
  for (const rel of sample()) {
    const canonicalPath = `/${rel.replace(/index\.html$/, '')}`;
    const clusters = {};
    for (const code of I.LOCALE_CODES) {
      const html = read(I.localizedFile(code, canonicalPath));
      const alts = [...html.matchAll(/rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)]
        .map((m) => [m[1], m[2]]);
      const map = Object.fromEntries(alts);
      for (const c of I.LOCALE_CODES) {
        assert.ok(map[c], `${rel} @${code}: no hreflang for ${c}`);
        assert.strictEqual(map[c], `${ORIGIN}${I.localizedPath(c, canonicalPath)}`,
          `${rel} @${code}: hreflang ${c} points at the wrong URL`);
      }
      assert.strictEqual(map['x-default'], `${ORIGIN}${canonicalPath}`,
        `${rel} @${code}: x-default is wrong`);
      clusters[code] = map;
    }
    // Reciprocity means every page in the cluster lists every other one and
    // they all agree WHERE each locale lives. The first version compared
    // clusters[a][b] with clusters[b][a] — two deliberately different URLs —
    // which is not what reciprocity means and failed on a correct cluster.
    for (const a of I.LOCALE_CODES) {
      for (const b of I.LOCALE_CODES) {
        assert.strictEqual(clusters[a][b], clusters[b][b],
          `${rel}: ${a} and ${b} disagree about where ${b} lives`);
      }
    }
  }
});

test('the language switcher keeps the semantic destination', () => {
  // A reader on the media page who clicks DE must land on the German MEDIA
  // page, not the German homepage.
  for (const rel of sample()) {
    const canonicalPath = `/${rel.replace(/index\.html$/, '')}`;
    for (const code of I.LOCALE_CODES) {
      const html = read(I.localizedFile(code, canonicalPath));
      const at = html.indexOf('class="nav-lang"');
      const block = html.slice(at, html.indexOf('</ul>', at));
      for (const target of I.LOCALE_CODES) {
        const want = I.localizedPath(target, canonicalPath);
        assert.ok(block.includes(`href="${want}"`),
          `${rel} @${code}: the ${target} switch goes somewhere other than ${want}`);
      }
      assert.ok(!/href="\/(es|fr|de)\/"/.test(block),
        `${rel} @${code}: the switcher sends the reader to a locale homepage`);
    }
  }
});

test('every localized Research route is in the sitemap exactly once', () => {
  const sitemap = read('sitemap.xml');
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const seen = new Set();
  for (const l of locs) {
    assert.ok(!seen.has(l), `${l} appears twice in the sitemap`);
    seen.add(l);
  }
  for (const code of I.LOCALE_CODES.filter((c) => c !== 'en')) {
    for (const p of ['/research/', '/research/marketplaces/', '/research/media-pr-publishing/',
      '/research/distribution-planner/']) {
      assert.ok(seen.has(`${ORIGIN}${I.localizedPath(code, p)}`),
        `${I.localizedPath(code, p)} is missing from the sitemap`);
    }
  }
  // And nothing in the sitemap points at a page that was not generated.
  for (const l of locs.filter((x) => x.includes('/research/'))) {
    const rel = l.replace(`${ORIGIN}/`, '');
    assert.ok(fs.existsSync(path.join(ROOT, rel, 'index.html')) || fs.existsSync(path.join(ROOT, rel)),
      `the sitemap lists ${l}, which does not exist`);
  }
});

// ── 11-13. the data layer is not duplicated ─────────────────────────────────

test('no dataset is copied per locale', () => {
  // The whole point. One canonical record set; four renders.
  for (const dir of ['data/business-directories', 'data/marketplaces', 'data/media-pr-publishing',
    'data/tenders-procurement']) {
    for (const code of I.LOCALE_CODES.filter((c) => c !== 'en')) {
      assert.ok(!fs.existsSync(path.join(ROOT, dir, code)), `${dir}/${code} duplicates the dataset`);
      assert.ok(!fs.existsSync(path.join(ROOT, `${dir}-${code}`)), `${dir}-${code} duplicates the dataset`);
    }
  }
  for (const code of I.LOCALE_CODES.filter((c) => c !== 'en')) {
    const d = path.join(ROOT, code, 'data');
    assert.ok(!fs.existsSync(d), `/${code}/data duplicates the dataset`);
  }
  // The dictionaries hold UI strings only — never platform records. Two checks
  // guard that property. The URL check is the direct one: a record always
  // carries its website, so a dataset cannot arrive without tripping it. The
  // key ceiling is the blunt one, and it is calibrated to UI growth: it stood
  // at 500 when three collections used ~450 keys, then 750 when
  // tenders-procurement added ~50, then 1000 because Tender Monitoring added
  // ~127 first-party UI keys, and now 1250 because the source finder added 26
  // — a Domain Rating threshold label, four readiness states, seven seller
  // routes, two tender access dimensions and four access values. Every one
  // names a CONCEPT the UI renders, and the shape check below is what actually
  // distinguishes those from a record copy. A real dataset copy is hundreds of
  // records times a dozen fields — thousands of keys — so the ceiling still
  // catches it by an order of magnitude.
  //
  // The shape check below is the one that actually matters: a per-record key
  // is what a dataset copy looks like, whatever the count.
  for (const code of I.LOCALE_CODES) {
    const dict = I.dictionary(code);
    assert.ok(Object.keys(dict).length < 1250, `${code}.json has ${Object.keys(dict).length} keys; that is a dataset`);
    // No key may be scoped to an individual record. UI keys name a concept
    // ("mon.severity.CRITICAL"); a dataset copy names an instance
    // ("platform.eu-ted.name"), and that is detectable regardless of volume.
    for (const key of Object.keys(dict)) {
      assert.ok(!/\.(eu|uk|de|fr|nl|ca|co|za|int)-[a-z0-9-]{4,}\./.test(key),
        `${code}.json key "${key}" is scoped to a single record`);
    }
    for (const v of Object.values(dict)) {
      assert.ok(!/^https?:\/\//.test(v), `${code}.json contains a URL: ${v}`);
    }
  }
});

test('platform names and URLs are never translated', () => {
  // "PR TIMES" is not "PR ZEITEN" and prtimes.jp is not prtimes.de.
  const MD = require(path.join(ROOT, 'scripts/lib/media-schema.cjs'));
  const countries = new Set(JSON.parse(read('data/business-directories/countries.json')).map((c) => c.slug));
  const media = MD.loadMediaPlatforms(path.join(ROOT, 'data/media-pr-publishing/media-platforms.json'), countries)
    .filter(MD.isActionable);
  const en = read('research/media-pr-publishing/index.html');
  for (const code of I.LOCALE_CODES.filter((c) => c !== 'en')) {
    const loc = read(I.localizedFile(code, '/research/media-pr-publishing/'));
    for (const r of media.slice(0, 120)) {
      assert.ok(loc.includes(r.name.replace(/&/g, '&amp;')),
        `${code}: the platform name "${r.name}" was altered`);
      assert.ok(loc.includes(r.website), `${code}: the URL for ${r.id} was altered`);
    }
    // The same number of outbound platform links in every locale.
    const count = (h) => (h.match(/rel="noopener noreferrer"/g) || []).length;
    assert.strictEqual(count(loc), count(en), `${code}: a different number of platform links`);
  }
});

test('the localized pages carry the same records as the English one', () => {
  for (const rel of sample()) {
    const canonicalPath = `/${rel.replace(/index\.html$/, '')}`;
    const rows = (h) => (h.match(/class="bd-row"|<tr data-bd-facet-country/g) || []).length;
    const en = rows(read(rel));
    for (const code of I.LOCALE_CODES.filter((c) => c !== 'en')) {
      assert.strictEqual(rows(read(I.localizedFile(code, canonicalPath))), en,
        `${rel} @${code}: a different number of records is rendered`);
    }
  }
});

// ── 14-16. integrity ────────────────────────────────────────────────────────

test('localized pages parse and their internal links resolve', () => {
  let checked = 0;
  for (const code of I.LOCALE_CODES.filter((c) => c !== 'en')) {
    for (const rel of sample()) {
      const canonicalPath = `/${rel.replace(/index\.html$/, '')}`;
      const html = read(I.localizedFile(code, canonicalPath));
      for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
        JSON.parse(m[1]);
      }
      assert.strictEqual((html.match(/<h1[^>]*>/g) || []).length, 1, `${rel} @${code}: not exactly one H1`);
      for (const m of html.replace(/<script[\s\S]*?<\/script>/g, '').matchAll(/href="(\/[^"#?]*)"/g)) {
        const t = m[1].replace(/^\//, '');
        assert.ok(fs.existsSync(path.join(ROOT, t)) || fs.existsSync(path.join(ROOT, t, 'index.html')),
          `${rel} @${code} links ${m[1]}, which does not exist`);
        checked += 1;
      }
    }
  }
  assert.ok(checked > 100, `only ${checked} internal links checked`);
});

test('the generators emit one page per locale from one render path', () => {
  // N locales must not mean N generators.
  const gens = ['build-business-directories', 'build-marketplaces', 'build-media-platforms',
    'build-distribution-planner', 'build-forums'];
  for (const g of gens) {
    const src = read(`scripts/${g}.cjs`);
    assert.ok(src.includes('I18N.LOCALE_CODES') || src.includes('I18N.localizedFile'),
      `${g} does not loop locales`);
    for (const code of ['es', 'fr', 'de']) {
      assert.ok(!new RegExp(`build-${code}|${code}Generator|generator_${code}`).test(src),
        `${g} looks like a per-locale generator`);
    }
  }
  for (const code of ['es', 'fr', 'de']) {
    assert.ok(!fs.existsSync(path.join(ROOT, `scripts/build-marketplaces.${code}.cjs`)),
      `a per-locale generator exists for ${code}`);
  }
});

test('no framework or dependency was added for localization', () => {
  assert.ok(!fs.existsSync(path.join(ROOT, 'package.json')));
  const src = read('scripts/lib/i18n.cjs');
  for (const m of src.matchAll(/require\('([^']+)'\)/g)) {
    assert.ok(m[1].startsWith('.') || m[1].startsWith('node:'), `i18n requires "${m[1]}"`);
  }
  assert.ok(!/\bfetch\s*\(/.test(src), 'the i18n layer makes a network call');
});

// ── language contamination ──────────────────────────────────────────────────

test('no English generator prose leaks onto a DE, ES or FR page', () => {
  // Targeted at GENERATOR-OWNED strings, identified by their translation key —
  // never at free text, because a platform legitimately named "Business Wire"
  // or a note quoting an English submission page is third-party fact, not
  // presentation copy, and must survive untouched.
  const PROSE_KEYS = ['mp.lede', 'mp.summary', 'mp.scope1', 'mp.scope2',
    'md.lede', 'md.howToRead1', 'md.howToRead2', 'md.howToRead3',
    'md.mediaScore3', 'md.scope1', 'md.scope2', 'md.scope3',
    'rec.rankedNote', 'rec.method2', 'rec.method3', 'rec.lim1', 'rec.lim2'];
  const PAGES = {
    'mp.': '/research/marketplaces/',
    'md.': '/research/media-pr-publishing/',
    'rec.': '/research/media-pr-publishing/for/telecom-voip-ucaas/',
  };
  const strip = (h) => h.replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"').replace(/&mdash;/g, '—').replace(/\s+/g, ' ');
  const leaks = [];
  for (const key of PROSE_KEYS) {
    const route = PAGES[key.split('.')[0] + '.'];
    const english = I.raw('en', key).replace(/\{[a-z]+\}/gi, '');
    // A distinctive fragment: long enough that it cannot appear by accident.
    const probe = english.split(/[.!?]/).map((x) => x.trim()).filter((x) => x.length > 45)[0];
    if (!probe) continue;
    for (const code of I.LOCALE_CODES.filter((c) => c !== 'en')) {
      const html = strip(read(I.localizedFile(code, route)));
      if (html.includes(probe)) leaks.push(`${code}: ${key}`);
      // And the translation IS present, so the check cannot pass by the string
      // simply being absent from the page altogether.
      const translated = I.raw(code, key).replace(/\{[a-z]+\}/gi, '');
      const tProbe = translated.split(/[.!?]/).map((x) => x.trim()).filter((x) => x.length > 45)[0];
      if (tProbe) {
        assert.ok(html.includes(tProbe),
          `${code}: the translation of ${key} is not on the page at all`);
      }
    }
  }
  assert.deepStrictEqual(leaks, [], 'English generator prose is showing on localized pages');
});

test('third-party brand names are never translated', () => {
  // The reverse failure. Platform names are facts: "Business Wire" stays
  // "Business Wire" in German, and 钛媒体 stays 钛媒体 everywhere.
  const MD = require(path.join(ROOT, 'scripts/lib/media-schema.cjs'));
  const countries = new Set(JSON.parse(read('data/business-directories/countries.json')).map((c) => c.slug));
  const media = MD.loadMediaPlatforms(
    path.join(ROOT, 'data/media-pr-publishing/media-platforms.json'), countries).filter(MD.isActionable);
  const SENTINELS = media.filter((r) => /Business Wire|PR Newswire|Harvard Business Review|钛媒体|매일경제|日本経済新聞|PR TIMES/.test(r.name));
  assert.ok(SENTINELS.length >= 4, 'expected brand-name sentinels in the dataset');

  // Compared ENGLISH RENDER against LOCALIZED RENDER, not against the dataset.
  // The first version read the expected names from the dataset and looked for
  // them on the page — so editing the dataset moved both sides together and the
  // guard could not fail. The property is that the render path never alters a
  // third-party name or URL, which is exactly an EN-vs-locale comparison.
  const namesOn = (html) => new Set([...html.matchAll(
    /<a href="(https:\/\/[^"]+)" rel="noopener noreferrer" target="_blank">([^<]+)<\/a>/g)]
    .map((m) => `${m[2]}\u0000${m[1]}`));
  const en = namesOn(read('research/media-pr-publishing/index.html'));
  assert.ok(en.size > 300, `only ${en.size} platform links found on the English page`);
  for (const code of I.LOCALE_CODES.filter((c) => c !== 'en')) {
    const loc = namesOn(read(I.localizedFile(code, '/research/media-pr-publishing/')));
    assert.deepStrictEqual([...loc].sort(), [...en].sort(),
      `${code}: a third-party name or URL differs from the English render`);
    for (const r of SENTINELS) {
      assert.ok([...loc].some((x) => x.startsWith(`${r.name}\u0000`)),
        `${code}: the brand name "${r.name}" is missing or altered`);
    }
  }
});

test('canonical enum values stay canonical in the data', () => {
  // The UI may render "Unbekannt"; the record must still say "unknown".
  const blob = read('data/media-pr-publishing/media-platforms.json');
  for (const foreign of ['Unbekannt', 'Desconocido', 'Inconnu', 'Bereit zur Ausführung',
    'Nicht verifiziert', 'Requiere investigación']) {
    assert.ok(!blob.includes(foreign), `a translated label leaked into the dataset: ${foreign}`);
  }
  assert.ok(blob.includes('"currentStatus": "unknown"'), 'the canonical enum value is gone');
});
