'use strict';

// Guards over the localization policy registry and the substantive-content
// parity property.
//
// ── THE FAILURE THESE EXIST TO PREVENT ──────────────────────────────────────
//
// Research Center i18n v1 shipped believing it was done. Its tests asserted that
// /de/ routes EXISTED and that <html lang="de"> was present. Both were true, and
// the pages were still English. The lesson is that route existence and shell
// correctness are necessary and nowhere near sufficient: what must be asserted
// is that the BODY differs from English in a way translation would cause.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const I18N = require('../lib/i18n.cjs');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const policy = JSON.parse(read('data/route-policy.json'));
const RF = require('../lib/route-family.cjs');
const ROUTE = require('../lib/to-route.cjs');
const DETAIL = require('../lib/to-detail.cjs');
const CORPUS = require('../lib/to-corpus.cjs');
const TP = require('../lib/tp-schema.cjs');

// Routes a declared generator can prove correspond to real canonical records.
// This is membership EVIDENCE, not a pattern: an invented id under the same
// prefix is not in this set and is therefore not authorized.
const families = RF.load();
const authorizedGenerated = (() => {
  const set = new Set();
  const file = path.join(ROOT, 'data/tender-opportunities/opportunities.json');
  if (!fs.existsSync(file)) return set;
  const corpus = CORPUS.decode(JSON.parse(fs.readFileSync(file, 'utf8')));
  const countries = JSON.parse(read('data/business-directories/countries.json'));
  const platformsById = new Map(TP.loadPlatforms(
    path.join(ROOT, 'data/tenders-procurement/platforms.json'),
    new Map(countries.map((c) => [c.slug, c.iso2 || null])),
  ).map((x) => [x.id, x]));
  for (const p of DETAIL.build(corpus, { platformsById }).pages) {
    if (p.indexable) set.add(p.route);
  }
  return set;
})();

const isAuthorizedGenerated = (route) => RF.authorize(route, families, {
  knownRoutes: authorizedGenerated, locale: 'en',
}).authorized;

const VALID_DISPOSITIONS = new Set([
  'LOCALIZE', 'INTENTIONALLY_EN_ONLY', 'NOINDEX_TECHNICAL',
  'REDIRECT_OR_OBSOLETE', 'DUPLICATE_OR_ALIAS',
]);

// ── route discovery, derived from disk ──────────────────────────────────────
const SKIP = new Set(['.git', 'node_modules', 'startups-app', 'docs', 'scripts',
  'data', 'css', 'js', 'images', 'fonts', 'content']);

function htmlFiles(dir = ROOT, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (dir === ROOT && SKIP.has(e.name)) continue;
      htmlFiles(p, out);
    } else if (e.name.endsWith('.html')) out.push(path.relative(ROOT, p).replace(/\\/g, '/'));
  }
  return out;
}

const PREFIXES = I18N.LOCALES.filter((l) => l.prefix).map((l) => [`${l.prefix.slice(1)}/`, l.code]);
const localeOf = (rel) => (PREFIXES.find(([p]) => rel.startsWith(p)) || [null, 'en'])[1];
const canonicalOf = (rel) => {
  const l = localeOf(rel);
  return l === 'en' ? rel : rel.slice(l.length + 1);
};

// canonical file path -> the route as served
const routeOf = (canonicalFile) => `/${canonicalFile.replace(/index\.html$/, '')}`;

function coverage() {
  const byCanonical = new Map();
  for (const rel of htmlFiles()) {
    const c = canonicalOf(rel);
    if (!byCanonical.has(c)) byCanonical.set(c, {});
    byCanonical.get(c)[localeOf(rel)] = rel;
  }
  return byCanonical;
}

test('every policy entry is well formed', () => {
  const seen = new Set();
  for (const entry of policy.routes) {
    assert.ok(VALID_DISPOSITIONS.has(entry.disposition),
      `${entry.route}: unknown disposition "${entry.disposition}"`);
    assert.ok(entry.reason && entry.reason.length > 40,
      `${entry.route}: a disposition needs a reason a reader can evaluate, not a label`);
    assert.ok(typeof entry.words === 'number',
      `${entry.route}: needs a measured word count so the backlog stays quantified`);
    assert.ok(!seen.has(entry.route), `${entry.route}: listed twice`);
    seen.add(entry.route);
  }
});

test('the policy covers exactly the routes that lack full locale coverage', () => {
  // This is the anti-drift guard. A new English-only page cannot be added
  // without a stated disposition, and a route that gets localized cannot be
  // left in the registry pretending it is still outstanding.
  const incomplete = [];
  for (const [canonical, locales] of coverage()) {
    if (!locales.en) continue;
    const missing = I18N.LOCALE_CODES.filter((c) => c !== 'en' && !locales[c]);
    if (missing.length) incomplete.push(routeOf(canonical));
  }

  const declared = new Set(policy.routes.map((r) => r.route));
  // A route may be covered EITHER by an explicit human-authored entry or by a
  // generated family that can prove the route corresponds to a real canonical
  // record. The two mechanisms stay separate on purpose: the explicit registry
  // keeps its value because every row in it was thought about, and adding
  // 6,817 generated rows would have destroyed exactly that.
  const undeclared = incomplete
    .filter((r) => !declared.has(r) && !isAuthorizedGenerated(r)).sort();
  const stale = [...declared].filter((r) => !incomplete.includes(r)).sort();

  assert.deepStrictEqual(undeclared, [],
    `these routes lack DE/ES/FR and have no disposition in data/route-policy.json: ${undeclared.join(', ')}`);
  assert.deepStrictEqual(stale, [],
    `these routes are listed as incomplete but now have full coverage — remove them: ${stale.join(', ')}`);
});

test('an English-only page never advertises a locale it does not have', () => {
  // Phantom hreflang is worse than absent hreflang: it publishes URLs that 404.
  // Checked against what is actually on disk, per route.
  const cov = coverage();
  const offenders = [];
  for (const [canonical, locales] of cov) {
    if (!locales.en) continue;
    const html = read(locales.en);
    const advertised = [...html.matchAll(/rel="alternate" hreflang="([^"]+)"/g)]
      .map((m) => m[1]).filter((c) => c !== 'x-default');
    for (const code of advertised) {
      if (code !== 'en' && !locales[code]) {
        offenders.push(`${routeOf(canonical)} advertises ${code} which does not exist`);
      }
    }
  }
  assert.deepStrictEqual(offenders, [], offenders.join('\n'));
});

test('every localized page is self-canonical', () => {
  // A localized page canonicalizing to English tells search engines not to index
  // it, which silently discards the translation.
  const offenders = [];
  for (const rel of htmlFiles()) {
    const locale = localeOf(rel);
    if (locale === 'en') continue;
    const canonical = (read(rel).match(/rel="canonical" href="([^"]+)"/) || [])[1];
    if (!canonical) { offenders.push(`${rel}: no canonical`); continue; }
    if (!canonical.includes(`/${locale}/`)) {
      offenders.push(`${rel}: canonicalizes to ${canonical}`);
    }
  }
  assert.deepStrictEqual(offenders.slice(0, 10), [], offenders.join('\n'));
});

test('no page canonicalizes to a host that redirects', () => {
  // www.petrohrys.com 301s to the apex. A canonical pointing at a redirect asks
  // search engines to follow a hop to reach the page they were told is
  // authoritative.
  const offenders = htmlFiles().filter((rel) => /canonical" href="https:\/\/www\./.test(read(rel)));
  assert.deepStrictEqual(offenders, [],
    `these pages canonicalize to the redirecting www host: ${offenders.slice(0, 8).join(', ')}`);
});

// ── the parity property ─────────────────────────────────────────────────────

// Text a reader actually sees, with facts that are identical in every language
// removed so they cannot inflate the similarity score.
function visibleText(html) {
  const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
  return main
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

test('a localized page is not merely an English page with a translated shell', () => {
  // The load-bearing test. For each route available in all four locales, the
  // German body must differ substantially from the English body.
  //
  // It is expressed as a similarity RATIO rather than a word list because a
  // word list would need maintaining and would pass the moment someone
  // translated exactly the words it names. Proper nouns, product names and
  // numbers are legitimately identical across locales, so the threshold allows
  // real overlap — it is calibrated to catch "the body was never translated",
  // not to police individual sentences.
  const cov = coverage();
  const failures = [];

  for (const [canonical, locales] of cov) {
    if (!locales.en || !locales.de) continue;
    const en = visibleText(read(locales.en));
    const de = visibleText(read(locales.de));
    if (en.length < 400) continue; // too thin to measure meaningfully

    const enWords = en.split(' ');
    const deWords = new Set(de.split(' '));
    const shared = enWords.filter((w) => deWords.has(w)).length;
    const ratio = shared / enWords.length;

    // Above this, the German page is reproducing the English one. Measured
    // against genuinely translated pages, which sit far below it.
    if (ratio > 0.85) {
      failures.push(`${routeOf(canonical)}: DE body is ${Math.round(ratio * 100)}% English tokens`);
    }
  }

  // The Business Directories and Planner bodies are a KNOWN, documented gap —
  // see docs/SITE-WIDE-LOCALIZATION-COMPLETION.md. They are listed explicitly so
  // the count can only shrink: if one is fixed this test fails until it is
  // removed from the allowance, and any NEW page joining them fails immediately.
  const backlog = JSON.parse(read('data/localization-backlog.json'));
  const prefixes = backlog.prefixes;

  // Anything failing outside a declared prefix is a NEW English body and fails
  // immediately — that is the regression this whole test exists to stop.
  const unexpected = failures
    .filter((f) => !prefixes.some((p) => f.startsWith(p)))
    .sort();
  assert.deepStrictEqual(unexpected, [],
    `these localized pages have an English body and are not in the documented backlog:\n${unexpected.join('\n')}`);

  // And a prefix may not linger after its routes are genuinely localized: the
  // ratchet has to turn both ways or the backlog becomes a permanent excuse.
  const emptied = prefixes.filter((p) => !failures.some((f) => f.startsWith(p)));
  assert.deepStrictEqual(emptied, [],
    `no route under these prefixes has an English body any more — remove them from `
    + `data/localization-backlog.json: ${emptied.join(', ')}`);

  // The recorded count must stay honest: if the real number drifts far from
  // what the file claims, the documentation is lying about the size of the debt.
  const claimed = backlog.measured.routesExceedingThreshold;
  assert.ok(Math.abs(failures.length - claimed) <= 5,
    `backlog claims ${claimed} routes with English bodies, measured ${failures.length} — update data/localization-backlog.json`);
});
