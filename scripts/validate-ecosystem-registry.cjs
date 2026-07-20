#!/usr/bin/env node
/**
 * validate-ecosystem-registry.cjs
 * ------------------------------------------------------------------
 * Integrity + coverage tests for the HELPERG Ecosystem banner.
 *
 *   node scripts/validate-ecosystem-registry.cjs
 *
 * Exits 0 when everything passes, 1 on any failure. Checks:
 *   1. Registry shape (required fields, enums, uniqueness, display controls).
 *   2. Status/link honesty (available => real URL; null URL => not available).
 *   3. Exact match against the approved brief (17 web + 7 apps = 24).
 *   4. Cash Workspace: website available/clickable; web app coming-soon/null.
 *   5. CV Resume: iOS-only; Android null + unavailable (never invented).
 *   6. eSIMky present + configured correctly.
 *   7. Display controls deterministic; timeline<=>showInTimeline; search flags.
 *   8. Exact hostname normalization + matching (deceptive hosts never match).
 *   9. Localized label parity across en/es/fr/de.
 *  10. SVG platform icons are locally defined; no icon dependency added.
 *  11. Public-page banner coverage (both markers on every public HTML file).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const registry = require(path.join(ROOT, 'js', 'ecosystem-registry.js'));

const HEAD_START = '<!-- helperg-eco:head:start -->';
const HEAD_END = '<!-- helperg-eco:head:end -->';
const BODY_START = '<!-- helperg-eco:body:start -->';
const BODY_END = '<!-- helperg-eco:body:end -->';
const EXCLUDED_DIRS = new Set(['.git', 'node_modules', 'startups-app', 'docs']);

const errors = [];
const notes = [];
function check(cond, msg) { if (!cond) errors.push(msg); }

/* --------------------------------------------------------------- *
 * Expected data — transcribed VERBATIM from the approved brief.    *
 * --------------------------------------------------------------- */
const EXPECTED_WEB = {
  helperg:                { url: 'https://helperg.com',                website: 'available',   webApp: 'unavailable', ios: 'coming-soon', android: 'coming-soon' },
  petrohrys:              { url: 'https://petrohrys.com',              website: 'available',   webApp: 'unavailable', ios: 'coming-soon', android: 'coming-soon' },
  webmasterid:            { url: 'https://www.webmasterid.com',        website: 'available',   webApp: 'available',   ios: 'coming-soon', android: 'coming-soon' },
  cashworkspace:          { url: 'https://www.cashworkspace.com',      website: 'available',   webApp: 'coming-soon', ios: 'coming-soon', android: 'coming-soon' },
  geobusinessiq:          { url: 'https://geobusinessiq.com',          website: 'available',   webApp: 'available',   ios: 'coming-soon', android: 'coming-soon' },
  talentpartnerid:        { url: 'https://talentpartnerid.com',        website: 'available',   webApp: 'unavailable', ios: 'coming-soon', android: 'coming-soon' },
  hrhelperg:              { url: 'https://hrhelperg.com',              website: 'available',   webApp: 'unavailable', ios: 'coming-soon', android: 'coming-soon' },
  twinphone:              { url: 'https://twin-phone.com',             website: 'available',   webApp: 'available',   ios: 'coming-soon', android: 'coming-soon' },
  esimky:                 { url: 'https://esimky.com',                 website: 'available',   webApp: 'available',   ios: 'unavailable', android: 'unavailable' },
  socialsporthub:         { url: 'https://socialsporthub.com',         website: 'available',   webApp: 'available',   ios: 'coming-soon', android: 'coming-soon' },
  globalcityintelligence: { url: 'https://globalcityintelligence.com', website: 'available',   webApp: 'available',   ios: 'coming-soon', android: 'coming-soon' },
  agricultureid:          { url: 'https://agricultureid.com',          website: 'available',   webApp: 'unavailable', ios: 'coming-soon', android: 'coming-soon' },
  asteriastar:            { url: 'https://asteriastar.com',            website: 'available',   webApp: 'unavailable', ios: 'coming-soon', android: 'coming-soon' },
  faunahub:               { url: 'https://faunahub.com',               website: 'available',   webApp: 'unavailable', ios: 'coming-soon', android: 'coming-soon' },
  builddesignhub:         { url: 'https://builddesignhub.com',         website: 'available',   webApp: 'unavailable', ios: 'coming-soon', android: 'coming-soon' },
  printerarchive:         { url: 'https://printerarchive.net',         website: 'available',   webApp: 'unavailable', ios: 'coming-soon', android: 'coming-soon' },
  virtueandpower:         { url: 'https://virtueandpower.com',         website: 'available',   webApp: 'unavailable', ios: 'coming-soon', android: 'coming-soon' }
};
const EXPECTED_APP = {
  zip:           { ios: 'https://apps.apple.com/app/id6753772583', android: 'https://play.google.com/store/apps/details?id=com.ziparchivator.zip&pcampaignid=web_share', iosStatus: 'available', androidStatus: 'available' },
  printer:       { ios: 'https://apps.apple.com/app/id6746067890', android: 'https://play.google.com/store/apps/details?id=com.helperg.smart.printer',                    iosStatus: 'available', androidStatus: 'available' },
  fax:           { ios: 'https://apps.apple.com/app/id6760895885', android: 'https://play.google.com/store/apps/details?id=com.helperg.fax.app&pcampaignid=web_share',     iosStatus: 'available', androidStatus: 'available' },
  pdfeditor:     { ios: 'https://apps.apple.com/app/id6747341672', android: 'https://play.google.com/store/apps/details?id=com.helperg.editor.documents&pcampaignid=web_share', iosStatus: 'available', androidStatus: 'available' },
  cvresume:      { ios: 'https://apps.apple.com/app/id6745150815', android: null,                                                                                          iosStatus: 'available', androidStatus: 'unavailable' },
  invoicemaker:  { ios: 'https://apps.apple.com/app/id6747311276', android: 'https://play.google.com/store/apps/details?id=com.helperg.invoicer',                          iosStatus: 'available', androidStatus: 'available' },
  pocketmanager: { ios: 'https://apps.apple.com/app/id6743084126', android: 'https://play.google.com/store/apps/details?id=com.helperg.money',                            iosStatus: 'available', androidStatus: 'available' }
};

const EXPECTED_TIMELINE = ['helperg', 'petrohrys', 'webmasterid', 'cashworkspace', 'geobusinessiq', 'globalcityintelligence'];

const STATUS_ENUM = ['available', 'coming-soon', 'unavailable', 'unknown'];
const TYPE_ENUM = ['ecosystem', 'platform', 'publication', 'application', 'personal'];
const GROUP_ENUM = ['platforms', 'knowledge', 'ecosystem', 'applications'];
const REQUIRED_FIELDS = [
  'id', 'name', 'type', 'group', 'websiteUrl', 'webAppUrl', 'iosUrl', 'androidUrl',
  'websiteStatus', 'webAppStatus', 'iosStatus', 'androidStatus',
  'featured', 'showInTimeline', 'showInAllProducts', 'showInSearch',
  'displayPriority', 'currentSiteDomains'
];
const DISPLAY_BOOLS = ['featured', 'showInTimeline', 'showInAllProducts', 'showInSearch'];

const products = registry.products;
const byId = {};
products.forEach(p => { byId[p.id] = p; });

/* -------------------- 1. shape + display controls -------------------- */
const ids = products.map(p => p.id);
check(new Set(ids).size === ids.length, 'Duplicate product ids: ' + ids.filter((v, i) => ids.indexOf(v) !== i).join(', '));

products.forEach(p => {
  REQUIRED_FIELDS.forEach(f => check(Object.prototype.hasOwnProperty.call(p, f), `[${p.id}] missing required field: ${f}`));
  check(TYPE_ENUM.indexOf(p.type) !== -1, `[${p.id}] invalid type: ${p.type}`);
  check(GROUP_ENUM.indexOf(p.group) !== -1, `[${p.id}] invalid group: ${p.group}`);
  ['websiteStatus', 'webAppStatus', 'iosStatus', 'androidStatus'].forEach(s =>
    check(STATUS_ENUM.indexOf(p[s]) !== -1, `[${p.id}] invalid ${s}: ${p[s]}`));
  check(Array.isArray(p.currentSiteDomains), `[${p.id}] currentSiteDomains must be an array`);
  // display controls must be deterministic (never undefined after normalization)
  DISPLAY_BOOLS.forEach(b => check(typeof p[b] === 'boolean', `[${p.id}] ${b} must be a boolean, got ${typeof p[b]}`));
  check(typeof p.displayPriority === 'number', `[${p.id}] displayPriority must be a number`);

  ['websiteUrl', 'webAppUrl', 'iosUrl', 'androidUrl'].forEach(u => {
    if (p[u] != null) {
      try { new URL(p[u]); } catch (e) { errors.push(`[${p.id}] ${u} is not a valid URL: ${p[u]}`); }
      check(!/["'<>` ]/.test(p[u]), `[${p.id}] ${u} contains unsafe characters`);
      check(p[u] !== '#' && !/^#/.test(p[u]), `[${p.id}] ${u} is a placeholder anchor`);
    }
  });
  if (p.detailUrl != null) check(/^\//.test(p.detailUrl), `[${p.id}] detailUrl must be root-relative: ${p.detailUrl}`);
});

/* -------------------- 2. status/link honesty -------------------- */
[['websiteStatus', 'websiteUrl'], ['webAppStatus', 'webAppUrl'], ['iosStatus', 'iosUrl'], ['androidStatus', 'androidUrl']].forEach(([s, u]) => {
  products.forEach(p => {
    if (p[s] === 'available') check(p[u] != null && p[u] !== '', `[${p.id}] ${s}=available but ${u} is empty`);
    if (p[u] == null || p[u] === '') check(p[s] !== 'available', `[${p.id}] ${u} empty but ${s}=available`);
  });
});
['iosUrl', 'androidUrl'].forEach(field => {
  const seen = {};
  products.forEach(p => {
    if (p[field] == null) return;
    if (seen[p[field]]) errors.push(`Duplicate ${field} shared by ${seen[p[field]]} and ${p.id}`);
    else seen[p[field]] = p.id;
  });
});
(() => {
  const seen = {};
  products.forEach(p => {
    if (p.websiteUrl == null) return;
    if (seen[p.websiteUrl]) errors.push(`Duplicate websiteUrl shared by ${seen[p.websiteUrl]} and ${p.id}`);
    else seen[p.websiteUrl] = p.id;
  });
})();

/* -------------------- 3. exact brief match (17 web + 7 apps) -------------------- */
const webProducts = products.filter(p => p.type !== 'application');
const appProducts = products.filter(p => p.type === 'application');
check(webProducts.length === 17, `Expected 17 web products, found ${webProducts.length}`);
check(appProducts.length === 7, `Expected 7 applications, found ${appProducts.length}`);
check(products.length === 24, `Expected 24 total registry records, found ${products.length}`);

Object.keys(EXPECTED_WEB).forEach(id => {
  const p = byId[id]; const e = EXPECTED_WEB[id];
  if (!p) { errors.push(`Missing expected web product: ${id}`); return; }
  check(p.websiteUrl === e.url, `[${id}] websiteUrl ${p.websiteUrl} != brief ${e.url}`);
  check(p.websiteStatus === e.website, `[${id}] websiteStatus ${p.websiteStatus} != brief ${e.website}`);
  check(p.webAppStatus === e.webApp, `[${id}] webAppStatus ${p.webAppStatus} != brief ${e.webApp}`);
  check(p.iosStatus === e.ios, `[${id}] iosStatus ${p.iosStatus} != brief ${e.ios}`);
  check(p.androidStatus === e.android, `[${id}] androidStatus ${p.androidStatus} != brief ${e.android}`);
});
Object.keys(EXPECTED_APP).forEach(id => {
  const p = byId[id]; const e = EXPECTED_APP[id];
  if (!p) { errors.push(`Missing expected application: ${id}`); return; }
  check(p.iosUrl === e.ios, `[${id}] iosUrl mismatch`);
  check(p.androidUrl === e.android, `[${id}] androidUrl mismatch`);
  check(p.iosStatus === e.iosStatus, `[${id}] iosStatus mismatch`);
  check(p.androidStatus === e.androidStatus, `[${id}] androidStatus mismatch`);
});

/* -------------------- 4. Cash Workspace explicit assertions -------------------- */
(() => {
  const c = byId.cashworkspace;
  check(c && c.websiteUrl === 'https://www.cashworkspace.com', 'Cash Workspace websiteUrl must be https://www.cashworkspace.com');
  check(c && c.websiteStatus === 'available', 'Cash Workspace website MUST be available (live, clickable)');
  check(c && c.webAppUrl === null, 'Cash Workspace webAppUrl MUST stay null (no invented app URL)');
  check(c && c.webAppStatus === 'coming-soon', 'Cash Workspace webApp MUST stay coming-soon');
})();

/* -------------------- 5. CV Resume guard -------------------- */
(() => {
  const cv = byId.cvresume;
  check(cv && cv.androidUrl === null, 'CV Resume Android URL MUST remain null (never invented)');
  check(cv && cv.androidStatus === 'unavailable', 'CV Resume Android status MUST be unavailable');
  check(cv && cv.iosUrl && cv.iosStatus === 'available', 'CV Resume must keep its available iOS link');
})();

/* -------------------- 6. eSIMky assertions -------------------- */
(() => {
  const e = byId.esimky;
  check(e && e.type === 'platform' && e.group === 'platforms', 'eSIMky must be a platform in the platforms group');
  check(e && e.websiteUrl === 'https://esimky.com' && e.websiteStatus === 'available', 'eSIMky website must be https://esimky.com / available');
  check(e && e.iosUrl === null && e.androidUrl === null, 'eSIMky must not invent store links');
  check(e && e.iosStatus === 'unavailable' && e.androidStatus === 'unavailable', 'eSIMky iOS/Android must be unavailable (not coming-soon)');
  check(e && e.showInTimeline === false, 'eSIMky must NOT be in the visible timeline');
  check(e && e.showInAllProducts === true && e.showInSearch === true, 'eSIMky must be in All Products + search');
  const tp = byId.twinphone, ss = byId.socialsporthub;
  check(e && tp && ss && tp.displayPriority < e.displayPriority && e.displayPriority < ss.displayPriority,
    'eSIMky must be ordered after Twin Phone and before SocialSportHub');
})();

/* -------------------- 7. display controls / timeline / search -------------------- */
check(registry.timeline.length === 6, `Timeline should have 6 entries, has ${registry.timeline.length}`);
check(registry.timeline.join(',') === EXPECTED_TIMELINE.join(','), 'Timeline order != recommended sequence');
registry.timeline.forEach(id => {
  check(byId[id], `Timeline references unknown product: ${id}`);
  check(byId[id] && byId[id].showInTimeline === true, `Timeline product not flagged showInTimeline: ${id}`);
});
// showInTimeline set must exactly equal the timeline set
products.filter(p => p.showInTimeline).forEach(p =>
  check(registry.timeline.indexOf(p.id) !== -1, `showInTimeline product missing from timeline: ${p.id}`));
// search must never surface a showInSearch:false product (none expected, but assert the flag exists + is honored downstream)
check(products.filter(p => p.showInSearch).length >= 1, 'At least one product should be searchable');
registry.groups.forEach(g => {
  check(GROUP_ENUM.indexOf(g.id) !== -1, `Unknown group id: ${g.id}`);
  check(products.filter(p => p.group === g.id).length > 0, `Group ${g.id} has no products`);
});

/* -------------------- 8. hostname normalization + exact matching -------------------- */
check(typeof registry.productIdForHost === 'function', 'registry.productIdForHost must be exported');
check(typeof registry.normalizeHost === 'function', 'registry.normalizeHost must be exported');
const HOST_CASES = [
  ['petrohrys.com', 'petrohrys'],
  ['www.petrohrys.com', 'petrohrys'],
  ['https://www.petrohrys.com/about/', 'petrohrys'],
  ['PETROHRYS.COM:443', 'petrohrys'],
  ['petrohrys.com.', 'petrohrys'],
  ['fakepetrohrys.com', null],
  ['petrohrys.com.evil.com', null],
  ['esimky.com', 'esimky'],
  ['www.esimky.com', 'esimky'],
  ['https://esimky.com/plans', 'esimky'],
  ['fakeesimky.com', null],
  ['esimky.com.attacker.net', null],
  ['cashworkspace.com', 'cashworkspace'],
  ['unrelated.example', null]
];
HOST_CASES.forEach(([host, expected]) => {
  const got = registry.productIdForHost(host);
  check(got === expected, `Host match "${host}" => ${got}, expected ${expected}`);
});

/* -------------------- 9. label parity + new search labels -------------------- */
const LANGS = ['en', 'es', 'fr', 'de'];
LANGS.forEach(l => check(registry.labels[l], `Missing label set: ${l}`));
const enKeys = Object.keys(registry.labels.en).sort();
['searchLabel', 'noResults'].forEach(k => check(enKeys.indexOf(k) !== -1, `Missing label key: ${k}`));
LANGS.forEach(l => {
  if (!registry.labels[l]) return;
  const k = Object.keys(registry.labels[l]).sort();
  check(k.join('|') === enKeys.join('|'), `Label key mismatch for ${l}`);
  enKeys.forEach(key => check(registry.labels[l][key] && String(registry.labels[l][key]).trim() !== '', `Empty label ${l}.${key}`));
});

/* -------------------- 10. SVG icons local; no icon dependency -------------------- */
(() => {
  const banner = fs.readFileSync(path.join(ROOT, 'js', 'ecosystem-banner.js'), 'utf8');
  check(/function platformIcon\s*\(/.test(banner), 'platformIcon() must be defined locally in banner.js');
  check(/createElementNS/.test(banner), 'SVG icons must be built with createElementNS (local, no network)');
  check(!/(fontawesome|feather|material-icons|iconify|cdn\.).*\.(js|css|svg)/i.test(banner), 'No external icon library/CDN may be referenced');
  // no <img>/<use xlink:href> to a remote icon
  check(!/xlink:href\s*=\s*["']https?:/i.test(banner), 'Icons must not reference remote sprite URLs');
})();

/* -------------------- 11. page coverage -------------------- */
function walk(dir, acc) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) { if (EXCLUDED_DIRS.has(entry.name)) continue; walk(path.join(dir, entry.name), acc); }
    else if (entry.isFile() && entry.name.endsWith('.html')) acc.push(path.join(dir, entry.name));
  }
  return acc;
}
const htmlFiles = walk(ROOT, []);
let covered = 0;
const missing = [], dupes = [];
htmlFiles.forEach(f => {
  const html = fs.readFileSync(f, 'utf8');
  const rel = path.relative(ROOT, f);
  const hasHead = html.includes(HEAD_START) && html.includes(HEAD_END);
  const hasBody = html.includes(BODY_START) && html.includes(BODY_END);
  if (hasHead && hasBody) covered++; else missing.push(rel);
  const count = (m) => html.split(m).length - 1;
  if (count(BODY_START) > 1 || count(HEAD_START) > 1) dupes.push(rel);
});
check(missing.length === 0, `Pages missing banner: ${missing.join(', ')}`);
check(dupes.length === 0, `Pages with duplicated banner markers: ${dupes.join(', ')}`);

notes.push(`Products: ${products.length} (web ${webProducts.length}, apps ${appProducts.length})`);
notes.push(`Timeline: ${registry.timeline.length}; searchable: ${products.filter(p => p.showInSearch).length}; in-all-products: ${products.filter(p => p.showInAllProducts).length}`);
notes.push(`HTML files scanned: ${htmlFiles.length}; banner present on ${covered}`);

if (errors.length) {
  console.error('\n✗ Ecosystem registry validation FAILED (' + errors.length + ' issue(s)):\n');
  errors.forEach(e => console.error('  • ' + e));
  console.error('');
  notes.forEach(n => console.error('  ' + n));
  process.exit(1);
} else {
  console.log('\n✓ Ecosystem registry validation passed.\n');
  notes.forEach(n => console.log('  ' + n));
  console.log('');
  process.exit(0);
}
