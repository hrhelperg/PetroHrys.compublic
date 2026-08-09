#!/usr/bin/env node
/**
 * inject-ecosystem-banner.cjs
 * ------------------------------------------------------------------
 * Injects the HELPERG Ecosystem banner into every public HTML page.
 *
 *   node scripts/inject-ecosystem-banner.cjs          # write changes
 *   node scripts/inject-ecosystem-banner.cjs --check   # report only, no write
 *
 * Idempotent: each injected block is wrapped in HTML comment markers and
 * re-running strips + rewrites those blocks, so the snippet can evolve
 * without ever duplicating. The static fallback markup is generated from
 * the single Product Registry, per page language, so no product records
 * are duplicated by hand across files.
 *
 * Injects two blocks per page:
 *   HEAD (before </head>) — banner CSS + registry + renderer scripts.
 *   BODY (after the skip link if present, else after <body>) — a compact,
 *   no-JS-functional nav: brand + curated timeline + "Explore all
 *   products" link to the verified ecosystem hub.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const registry = require(path.join(ROOT, 'js', 'ecosystem-registry.js'));
const siteConfig = require(path.join(ROOT, 'js', 'ecosystem-config.js'));
const CHECK_ONLY = process.argv.includes('--check');

// The current site's product id comes from the per-site config (the registry
// core is site-agnostic). Falls back to hostname matching if unset.
const CURRENT_ID = siteConfig.currentProductId || null;

const EXCLUDED_DIRS = new Set(['.git', 'node_modules', 'startups-app', 'docs']);

const HEAD_START = '<!-- helperg-eco:head:start -->';
const HEAD_END = '<!-- helperg-eco:head:end -->';
const BODY_START = '<!-- helperg-eco:body:start -->';
const BODY_END = '<!-- helperg-eco:body:end -->';

/* ---------- helpers ---------- */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function labelsFor(lang) {
  return registry.labels[lang] || registry.labels.en;
}
const byId = {};
registry.products.forEach(p => { byId[p.id] = p; });

/* ---------- markup builders ---------- */
function headBlock() {
  return [
    HEAD_START,
    '  <link rel="stylesheet" href="/css/ecosystem-banner.css">',
    '  <script src="/js/ecosystem-registry.js" defer></script>',
    '  <script src="/js/ecosystem-config.js" defer></script>',
    '  <script src="/js/ecosystem-banner.js" defer></script>',
    HEAD_END
  ].join('\n');
}

function timelineItem(product, L) {
  const isSelf = product.id === CURRENT_ID;
  if (isSelf) {
    return (
      '<li><a class="eco-item eco-item--self" href="/" aria-current="page">' +
      esc(product.name) +
      '<span class="eco-vh"> — ' + esc(L.currentSite) + '</span>' +
      '</a></li>'
    );
  }
  if (product.websiteStatus === 'available' && product.websiteUrl) {
    return (
      '<li><a class="eco-item" href="' + esc(product.websiteUrl) + '">' +
      esc(product.name) + '</a></li>'
    );
  }
  /* coming-soon / unavailable — muted, non-interactive, text carries meaning */
  return (
    '<li><span class="eco-item eco-item--soon">' + esc(product.name) +
    '<span class="eco-tag">' + esc(L.soonShort) + '</span>' +
    '<span class="eco-vh"> (' + esc(L.comingSoon) + ')</span>' +
    '</span></li>'
  );
}

function bodyBlock(lang) {
  const L = labelsFor(lang);
  const items = registry.timeline
    .map(id => byId[id])
    .filter(Boolean)
    .map(p => '        ' + timelineItem(p, L))
    .join('\n');

  return [
    BODY_START,
    '<nav class="helperg-eco" aria-label="' + esc(L.brand) + '" data-helperg-eco>',
    '  <div class="eco-bar">',
    '    <a class="eco-brand" href="' + esc(registry.hubUrl) + '">',
    '      <span class="eco-brand-mark" aria-hidden="true"></span>',
    '      <span class="eco-brand-text">' + esc(L.brand) + '</span>',
    '    </a>',
    '    <ul class="eco-timeline">',
    items,
    '    </ul>',
    '    <a class="eco-explore" href="' + esc(registry.hubUrl) + '">' + esc(L.exploreAll) + '</a>',
    '  </div>',
    '</nav>',
    BODY_END
  ].join('\n');
}

/* ---------- injection ---------- */
function stripBlock(html, start, end) {
  const re = new RegExp('[ \\t]*' + escapeRe(start) + '[\\s\\S]*?' + escapeRe(end) + '\\n?', 'g');
  return html.replace(re, '');
}
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function detectLang(html) {
  const m = html.match(/<html[^>]*\blang="([a-zA-Z-]+)"/);
  return m ? m[1].slice(0, 2).toLowerCase() : 'en';
}

function inject(html) {
  const lang = detectLang(html);

  // 1) Remove any previously-injected blocks (idempotent re-run).
  html = stripBlock(html, HEAD_START, HEAD_END);
  html = stripBlock(html, BODY_START, BODY_END);

  // 2) HEAD block — before the first </head>.
  const headIdx = html.search(/<\/head>/i);
  if (headIdx === -1) return { html, ok: false, reason: 'no </head>' };
  html = html.slice(0, headIdx) + headBlock() + '\n' + html.slice(headIdx);

  // 3) BODY block — after the skip link if present, else after <body>.
  const body = bodyBlock(lang);
  const skipRe = /(<body[^>]*>\s*<a class="skip"[^>]*>[\s\S]*?<\/a>)/i;
  const bodyRe = /(<body[^>]*>)/i;
  if (skipRe.test(html)) {
    html = html.replace(skipRe, '$1\n' + body);
  } else if (bodyRe.test(html)) {
    html = html.replace(bodyRe, '$1\n' + body);
  } else {
    return { html, ok: false, reason: 'no <body>' };
  }

  // 4) Disambiguate landmarks: the banner adds a labelled <nav>, so give the
  //    page's OWN top nav an accessible name too (matching the site's existing
  //    "Primary"/"Principal"/… convention). Only touch a bare <nav> that is not
  //    the banner and has no aria-label/role yet — idempotent, editorial pages
  //    already carry aria-label so they are skipped.
  const afterBody = html.indexOf(BODY_END);
  if (afterBody !== -1) {
    const rest = html.slice(afterBody);
    const m = rest.match(/<nav\b[^>]*>/i);
    if (m && !/data-helperg-eco|aria-label=|\brole=/i.test(m[0])) {
      const labeled = '<nav aria-label="' + esc(labelsFor(lang).siteNav) + '"' + m[0].slice(4);
      html = html.slice(0, afterBody) + rest.slice(0, m.index) + labeled + rest.slice(m.index + m[0].length);
    }
  }

  return { html, ok: true, lang };
}

/* ---------- walk + run ---------- */
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

const files = walk(ROOT, []);
// Only run the scan when invoked directly. Importing this module for its
// bodyBlock() must not walk 1,732 files — every generator that needs the
// localized banner imports it, and an import with side effects turned each
// build into a full site scan.
if (require.main === module) {
  const report = { total: files.length, changed: 0, unchanged: 0, failed: [], byLang: {} };

  files.forEach(file => {
    const before = fs.readFileSync(file, 'utf8');
    const res = inject(before);
    const rel = path.relative(ROOT, file);
    if (!res.ok) { report.failed.push(rel + ' (' + res.reason + ')'); return; }
    report.byLang[res.lang] = (report.byLang[res.lang] || 0) + 1;
    if (res.html !== before) {
      if (!CHECK_ONLY) fs.writeFileSync(file, res.html);
      report.changed++;
    } else {
      report.unchanged++;
    }
  });

  /* ---------- report ---------- */
  console.log('\nHELPERG Ecosystem banner injection' + (CHECK_ONLY ? ' (check only)' : '') + '\n');
  console.log('  Public HTML files scanned : ' + report.total);
  console.log('  Written / updated         : ' + report.changed);
  console.log('  Already up to date        : ' + report.unchanged);
  console.log('  By language               : ' + JSON.stringify(report.byLang));
  console.log('  Excluded dirs (no public HTML): ' + Array.from(EXCLUDED_DIRS).join(', '));
  if (report.failed.length) {
    console.log('\n  ✗ Failed / ambiguous pages:');
    report.failed.forEach(f => console.log('    • ' + f));
    process.exit(1);
  }
  console.log('\n  ✓ All scanned pages carry the banner.\n');


  // Exported so the page generators can emit the SAME localized banner this
  // injector would, instead of a second English copy the injector then rewrites.
}

module.exports = { bodyBlock, labelsFor };
