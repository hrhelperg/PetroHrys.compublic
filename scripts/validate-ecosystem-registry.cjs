#!/usr/bin/env node
/**
 * validate-ecosystem-registry.cjs
 * ------------------------------------------------------------------
 * Integrity + coverage tests for the HELPERG Ecosystem banner.
 *
 *   node scripts/validate-ecosystem-registry.cjs
 *
 * Exits 0 when everything passes, 1 on the first category of failures.
 * Checks:
 *   1. Registry shape (required fields, enums, uniqueness).
 *   2. Status/link honesty (available => real URL; null URL => not available).
 *   3. Exact match against the approved brief (URLs + statuses verbatim).
 *   4. CV Resume is iOS-only; Android is null + unavailable (never invented).
 *   5. Timeline / groups reference real products.
 *   6. Localized label parity across en/es/fr/de.
 *   7. Public-page banner coverage (both markers on every public HTML file).
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

/* Directories that contain no public HTML (app source / dev docs). */
const EXCLUDED_DIRS = new Set(['.git', 'node_modules', 'startups-app', 'docs']);

const errors = [];
const notes = [];
function check(cond, msg) { if (!cond) errors.push(msg); }

/* --------------------------------------------------------------- *
 * Expected data — transcribed VERBATIM from the approved brief.    *
 * If the registry ever drifts from this table the test fails.      *
 * --------------------------------------------------------------- */
const EXPECTED_WEB = {
  webmasterid:            { url: 'https://www.webmasterid.com',        website: 'available',   webApp: 'available',   ios: 'coming-soon', android: 'coming-soon' },
  cashworkspace:          { url: 'https://www.cashworkspace.com',      website: 'coming-soon', webApp: 'coming-soon', ios: 'coming-soon', android: 'coming-soon' },
  geobusinessiq:          { url: 'https://geobusinessiq.com',          website: 'available',   webApp: 'available',   ios: 'coming-soon', android: 'coming-soon' },
  talentpartnerid:        { url: 'https://talentpartnerid.com',        website: 'available',   webApp: 'unavailable', ios: 'coming-soon', android: 'coming-soon' },
  hrhelperg:              { url: 'https://hrhelperg.com',              website: 'available',   webApp: 'unavailable', ios: 'coming-soon', android: 'coming-soon' },
  twinphone:              { url: 'https://twin-phone.com',             website: 'available',   webApp: 'available',   ios: 'coming-soon', android: 'coming-soon' },
  socialsporthub:         { url: 'https://socialsporthub.com',         website: 'available',   webApp: 'available',   ios: 'coming-soon', android: 'coming-soon' },
  agricultureid:          { url: 'https://agricultureid.com',          website: 'available',   webApp: 'unavailable', ios: 'coming-soon', android: 'coming-soon' },
  asteriastar:            { url: 'https://asteriastar.com',            website: 'available',   webApp: 'unavailable', ios: 'coming-soon', android: 'coming-soon' },
  faunahub:               { url: 'https://faunahub.com',               website: 'available',   webApp: 'unavailable', ios: 'coming-soon', android: 'coming-soon' },
  builddesignhub:         { url: 'https://builddesignhub.com',         website: 'available',   webApp: 'unavailable', ios: 'coming-soon', android: 'coming-soon' },
  printerarchive:         { url: 'https://printerarchive.net',         website: 'available',   webApp: 'unavailable', ios: 'coming-soon', android: 'coming-soon' },
  virtueandpower:         { url: 'https://virtueandpower.com',         website: 'available',   webApp: 'unavailable', ios: 'coming-soon', android: 'coming-soon' },
  globalcityintelligence: { url: 'https://globalcityintelligence.com', website: 'available',   webApp: 'available',   ios: 'coming-soon', android: 'coming-soon' },
  petrohrys:              { url: 'https://petrohrys.com',              website: 'available',   webApp: 'unavailable', ios: 'coming-soon', android: 'coming-soon' },
  helperg:                { url: 'https://helperg.com',                website: 'available',   webApp: 'unavailable', ios: 'coming-soon', android: 'coming-soon' }
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

const STATUS_ENUM = ['available', 'coming-soon', 'unavailable', 'unknown'];
const TYPE_ENUM = ['ecosystem', 'platform', 'publication', 'application', 'personal'];
const GROUP_ENUM = ['platforms', 'knowledge', 'ecosystem', 'applications'];
const REQUIRED_FIELDS = [
  'id', 'name', 'type', 'websiteUrl', 'webAppUrl', 'iosUrl', 'androidUrl',
  'websiteStatus', 'webAppStatus', 'iosStatus', 'androidStatus',
  'displayPriority', 'featuredInTimeline', 'currentSiteDomains'
];

const products = registry.products;
const byId = {};
products.forEach(p => { byId[p.id] = p; });

/* -------------------- 1. shape -------------------- */
const ids = products.map(p => p.id);
check(new Set(ids).size === ids.length, 'Duplicate product ids: ' + ids.filter((v, i) => ids.indexOf(v) !== i).join(', '));

products.forEach(p => {
  REQUIRED_FIELDS.forEach(f => check(Object.prototype.hasOwnProperty.call(p, f), `[${p.id}] missing required field: ${f}`));
  check(TYPE_ENUM.indexOf(p.type) !== -1, `[${p.id}] invalid type: ${p.type}`);
  check(GROUP_ENUM.indexOf(p.group) !== -1, `[${p.id}] invalid group: ${p.group}`);
  ['websiteStatus', 'webAppStatus', 'iosStatus', 'androidStatus'].forEach(s =>
    check(STATUS_ENUM.indexOf(p[s]) !== -1, `[${p.id}] invalid ${s}: ${p[s]}`));
  check(Array.isArray(p.currentSiteDomains), `[${p.id}] currentSiteDomains must be an array`);

  /* URL syntax */
  ['websiteUrl', 'webAppUrl', 'iosUrl', 'androidUrl'].forEach(u => {
    if (p[u] != null) {
      try { new URL(p[u]); } catch (e) { errors.push(`[${p.id}] ${u} is not a valid URL: ${p[u]}`); }
      check(!/["'<>` ]/.test(p[u]), `[${p.id}] ${u} contains unsafe characters`);
    }
  });
  if (p.detailUrl != null) {
    check(/^\//.test(p.detailUrl), `[${p.id}] detailUrl must be a root-relative path: ${p.detailUrl}`);
  }
});

/* -------------------- 2. status/link honesty -------------------- */
const PAIRS = [['websiteStatus', 'websiteUrl'], ['webAppStatus', 'webAppUrl'], ['iosStatus', 'iosUrl'], ['androidStatus', 'androidUrl']];
products.forEach(p => {
  PAIRS.forEach(([s, u]) => {
    if (p[s] === 'available') check(p[u] != null && p[u] !== '', `[${p.id}] ${s}=available but ${u} is empty (would render a fake/empty link)`);
    if (p[u] == null || p[u] === '') check(p[s] !== 'available', `[${p.id}] ${u} is empty but ${s}=available`);
  });
});

/* No fake placeholder links anywhere. */
products.forEach(p => {
  ['websiteUrl', 'webAppUrl', 'iosUrl', 'androidUrl', 'detailUrl'].forEach(u => {
    if (p[u] != null) check(p[u] !== '#' && !/^#/.test(p[u]), `[${p.id}] ${u} is a placeholder anchor`);
  });
});

/* Unique store links across different apps. */
['iosUrl', 'androidUrl'].forEach(field => {
  const seen = {};
  products.forEach(p => {
    if (p[field] == null) return;
    if (seen[p[field]]) errors.push(`Duplicate ${field} shared by ${seen[p[field]]} and ${p.id}: ${p[field]}`);
    else seen[p[field]] = p.id;
  });
});
/* Unique website across different products. */
(() => {
  const seen = {};
  products.forEach(p => {
    if (p.websiteUrl == null) return;
    if (seen[p.websiteUrl]) errors.push(`Duplicate websiteUrl shared by ${seen[p.websiteUrl]} and ${p.id}: ${p.websiteUrl}`);
    else seen[p.websiteUrl] = p.id;
  });
})();

/* -------------------- 3. exact brief match -------------------- */
const webProducts = products.filter(p => p.type !== 'application');
const appProducts = products.filter(p => p.type === 'application');
check(webProducts.length === 16, `Expected 16 web products, found ${webProducts.length}`);
check(appProducts.length === 7, `Expected 7 applications, found ${appProducts.length}`);

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
  check(p.iosUrl === e.ios, `[${id}] iosUrl ${p.iosUrl} != brief ${e.ios}`);
  check(p.androidUrl === e.android, `[${id}] androidUrl ${p.androidUrl} != brief ${e.android}`);
  check(p.iosStatus === e.iosStatus, `[${id}] iosStatus ${p.iosStatus} != brief ${e.iosStatus}`);
  check(p.androidStatus === e.androidStatus, `[${id}] androidStatus ${p.androidStatus} != brief ${e.androidStatus}`);
});

/* -------------------- 4. CV Resume guard -------------------- */
(() => {
  const cv = byId.cvresume;
  check(cv && cv.androidUrl === null, 'CV Resume Android URL MUST remain null (never invented)');
  check(cv && cv.androidStatus === 'unavailable', 'CV Resume Android status MUST be unavailable');
  check(cv && cv.iosUrl && cv.iosStatus === 'available', 'CV Resume must keep its available iOS link');
})();

/* -------------------- 5. timeline / groups -------------------- */
check(registry.timeline.length === 6, `Timeline should have 6 entries, has ${registry.timeline.length}`);
registry.timeline.forEach(id => {
  check(byId[id], `Timeline references unknown product: ${id}`);
  check(byId[id] && byId[id].featuredInTimeline === true, `Timeline product not flagged featuredInTimeline: ${id}`);
});
products.filter(p => p.featuredInTimeline).forEach(p =>
  check(registry.timeline.indexOf(p.id) !== -1, `featuredInTimeline product missing from timeline order: ${p.id}`));

registry.groups.forEach(g => {
  check(GROUP_ENUM.indexOf(g.id) !== -1, `Unknown group id: ${g.id}`);
  const members = products.filter(p => p.group === g.id);
  check(members.length > 0, `Group ${g.id} has no products`);
});
check(registry.self && registry.self.id === 'petrohrys', 'self.id must be petrohrys (this site)');

/* -------------------- 6. label parity -------------------- */
const LANGS = ['en', 'es', 'fr', 'de'];
LANGS.forEach(l => check(registry.labels[l], `Missing label set: ${l}`));
const enKeys = Object.keys(registry.labels.en).sort();
LANGS.forEach(l => {
  if (!registry.labels[l]) return;
  const k = Object.keys(registry.labels[l]).sort();
  check(k.join('|') === enKeys.join('|'), `Label key mismatch for ${l} (expected ${enKeys.length} keys)`);
  enKeys.forEach(key => check(registry.labels[l][key] && String(registry.labels[l][key]).trim() !== '', `Empty label ${l}.${key}`));
});

/* -------------------- 7. page coverage -------------------- */
function walk(dir, acc) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), acc);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      acc.push(path.join(dir, entry.name));
    }
  }
  return acc;
}
const htmlFiles = walk(ROOT, []);
let covered = 0;
const missing = [];
const dupes = [];
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
notes.push(`HTML files scanned: ${htmlFiles.length}; banner present on ${covered}`);

/* -------------------- report -------------------- */
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
