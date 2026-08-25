#!/usr/bin/env node
/**
 * inject-social-profiles.cjs
 * ------------------------------------------------------------------
 * Renders the canonical Petro Hrys social profiles into the shared site
 * footer, and retires every stale hand-written social surface.
 *
 *   node scripts/inject-social-profiles.cjs           # write changes
 *   node scripts/inject-social-profiles.cjs --check   # report only
 *
 * Single source of truth: js/social-profiles.js. Nothing here hard-codes
 * a profile URL, so a change to the registry is a one-file change that
 * propagates to every page and every locale on the next run.
 *
 * Idempotent: the injected block is wrapped in HTML comment markers and a
 * re-run strips + rewrites it, so the component can evolve without ever
 * duplicating.
 *
 * Scope — the 64 editorial/brand pages that carry the site footer, in all
 * four locales. The generated research corpus (research/**, ~22k pages) is
 * deliberately excluded: it is programmatic dataset output, and a personal
 * follow row belongs on the brand surface, not on every data record.
 * Widening scope later is a one-line change to isResearchCorpus().
 *
 * Four things happen per page:
 *   1. FOOTER   the Follow component, static markup, no JS required.
 *   2. sameAs   Person JSON-LD is re-pointed at the canonical profiles,
 *               displacing stale URLs for platforms we now own centrally
 *               while preserving identity links on other platforms.
 *   3. LEGACY   the hand-written "Elsewhere" block on the About pages is
 *               removed — it carried an outdated LinkedIn URL and became a
 *               duplicate social surface once the footer component landed.
 *   4. CARDS    the PDF Editor community grid is re-rendered from the
 *               registry, replacing emoji glyphs and a dead `href="#"`.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const registry = require(path.join(ROOT, 'js', 'social-profiles.js'));
const CHECK_ONLY = process.argv.includes('--check');

const START = '<!-- petrohrys-social:start -->';
const END = '<!-- petrohrys-social:end -->';
const CARDS_START = '<!-- petrohrys-social-cards:start -->';
const CARDS_END = '<!-- petrohrys-social-cards:end -->';

const EXCLUDED_DIRS = new Set(['.git', 'node_modules', 'startups-app', 'docs', 'scripts', 'data']);

/* Platforms the registry now owns. Any sameAs entry on one of these hosts is
   replaced by the canonical URL rather than kept alongside it. */
const OWNED_HOSTS = [
  'linkedin.com', 'x.com', 'twitter.com', 'youtube.com', 'youtu.be',
  'instagram.com', 'reddit.com', 'facebook.com', 'fb.com', 'github.com',
  'substack.com', 'medium.com', 'pinterest.com', 'pin.it', 'hackernoon.com',
  'bsky.app'
];

/* ---------- helpers ---------- */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function stripBlock(html, start, end) {
  const re = new RegExp('[ \\t]*' + escapeRe(start) + '[\\s\\S]*?' + escapeRe(end) + '\\n?', 'g');
  return html.replace(re, '');
}
function detectLang(html) {
  const m = html.match(/<html[^>]*\blang="([a-zA-Z-]+)"/);
  return m ? m[1].slice(0, 2).toLowerCase() : 'en';
}
function hostOf(url) {
  const m = String(url).match(/^https?:\/\/([^/?#]+)/i);
  return m ? m[1].toLowerCase().replace(/^www\./, '') : '';
}
function isOwned(url) {
  const h = hostOf(url);
  return OWNED_HOSTS.some(owned => h === owned || h.endsWith('.' + owned));
}
function isResearchCorpus(rel) {
  return /^(?:[a-z]{2}\/)?research\//.test(rel.split(path.sep).join('/'));
}

/* ---------- markup builders ---------- */
function iconSvg(profile) {
  return (
    '<svg class="social-follow-icon" viewBox="0 0 24 24" width="18" height="18" ' +
    'aria-hidden="true" focusable="false"><path fill="currentColor" d="' +
    profile.icon + '"/></svg>'
  );
}

/** The footer Follow component. Static, crawlable, no-JS functional. */
function footerBlock(lang) {
  const L = registry.labelsFor(lang);
  const items = registry.enabled().map(p => {
    const label = L.linkTitle.replace('{name}', p.name);
    return (
      '        <li><a class="social-follow-link social-follow-link--' + esc(p.tier) + '" ' +
      'href="' + esc(p.url) + '" target="_blank" rel="noopener noreferrer" ' +
      'aria-label="' + esc(label) + '" data-social="' + esc(p.id) + '">' +
      iconSvg(p) + '</a></li>'
    );
  });
  return [
    '    ' + START,
    '    <section class="social-follow" aria-label="' + esc(L.sectionLabel) + '">',
    '      <h3 class="social-follow-heading">' + esc(L.heading) + '</h3>',
    '      <ul class="social-follow-list">',
    items.join('\n'),
    '      </ul>',
    '    </section>',
    '    ' + END
  ].join('\n');
}

/** Labelled cards for the PDF Editor community section. */
function cardsBlock(lang, ids) {
  const L = registry.labelsFor(lang);
  const byId = {};
  registry.enabled().forEach(p => { byId[p.id] = p; });
  const cards = ids.map(id => byId[id]).filter(Boolean).map(p => {
    const label = L.linkTitle.replace('{name}', p.name);
    return (
      '                    <a href="' + esc(p.url) + '" class="social-link-card" ' +
      'target="_blank" rel="noopener noreferrer" aria-label="' + esc(label) + '">\n' +
      '                        <span class="social-link-icon" aria-hidden="true">' + iconSvg(p) + '</span>\n' +
      '                        <span>' + esc(p.name) + '</span>\n' +
      '                    </a>'
    );
  });
  return [
    '                ' + CARDS_START,
    '                <div class="social-links-grid">',
    cards.join('\n'),
    '                </div>',
    '                ' + CARDS_END
  ].join('\n');
}

/* ---------- transforms ---------- */

/** 1 + 2: footer component and Person.sameAs. */
function injectFooter(html, lang) {
  html = stripBlock(html, START, END);
  const anchorRe = /([ \t]*<p class="footer-bottom">)/;
  if (!anchorRe.test(html)) return { html, ok: false, reason: 'no footer-bottom anchor' };
  return { html: html.replace(anchorRe, footerBlock(lang) + '\n$1'), ok: true };
}

/**
 * Re-point Person.sameAs at the canonical profiles. Entries on hosts the
 * registry owns are displaced; identity links on other platforms (Threads,
 * Quora, Telegram, Truth Social) are genuine and are preserved after them.
 */
function updateSameAs(html) {
  const re = /("sameAs":\s*\[)([\s\S]*?)(\])/g;
  let touched = false;
  const out = html.replace(re, (full, open, body, close) => {
    const existing = (body.match(/"([^"]+)"/g) || []).map(s => s.slice(1, -1));
    const retained = existing.filter(u => !isOwned(u));
    const next = registry.sameAs().concat(retained);
    if (JSON.stringify(next) === JSON.stringify(existing)) return full;
    touched = true;
    const indent = '          ';
    return open + '\n' + next.map(u => indent + JSON.stringify(u)).join(',\n') +
      '\n' + indent.slice(2) + close;
  });
  return { html: out, touched };
}

/** 3: retire the hand-written "Elsewhere" social block on the About pages. */
function removeLegacyElsewhere(html) {
  const re = /[ \t]*<section aria-labelledby="elsewhere">[\s\S]*?<\/section>\n?/g;
  if (!re.test(html)) return { html, touched: false };
  return { html: html.replace(re, ''), touched: true };
}

/** 4: re-render the PDF Editor community grid from the registry. */
function updateCards(html, lang) {
  const ids = ['x', 'reddit', 'youtube', 'github'];
  const stripped = stripBlock(html, CARDS_START, CARDS_END);
  const legacyRe = /[ \t]*<div class="social-links-grid">[\s\S]*?<\/div>\n?/;
  if (stripped !== html) {
    return { html: stripped.replace(/([ \t]*)(<p class="trust-note">)/, cardsBlock(lang, ids) + '\n$1$2'), touched: true };
  }
  if (!legacyRe.test(html)) return { html, touched: false };
  return { html: html.replace(legacyRe, cardsBlock(lang, ids) + '\n'), touched: true };
}

function transform(html, rel) {
  const lang = detectLang(html);
  const notes = [];

  const footer = injectFooter(html, lang);
  if (!footer.ok) return { ok: false, reason: footer.reason };
  html = footer.html;
  notes.push('footer');

  const same = updateSameAs(html);
  html = same.html;
  if (same.touched) notes.push('sameAs');

  const legacy = removeLegacyElsewhere(html);
  html = legacy.html;
  if (legacy.touched) notes.push('legacy-elsewhere');

  if (/social-links-grid|petrohrys-social-cards/.test(html)) {
    const cards = updateCards(html, lang);
    html = cards.html;
    if (cards.touched) notes.push('cards');
  }

  return { ok: true, html, lang, notes };
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

/** The pages the component belongs on: they carry the shared site footer
    and are not part of the generated research corpus. */
function targets() {
  return walk(ROOT, [])
    .map(f => path.relative(ROOT, f))
    .filter(rel => !isResearchCorpus(rel))
    .filter(rel => /class="footer-grid"/.test(fs.readFileSync(path.join(ROOT, rel), 'utf8')))
    .sort();
}

if (require.main === module) {
  const files = targets();
  const report = { total: files.length, changed: 0, unchanged: 0, failed: [], byLang: {}, byNote: {} };

  files.forEach(rel => {
    const abs = path.join(ROOT, rel);
    const before = fs.readFileSync(abs, 'utf8');
    const res = transform(before, rel);
    if (!res.ok) { report.failed.push(rel + ' (' + res.reason + ')'); return; }
    report.byLang[res.lang] = (report.byLang[res.lang] || 0) + 1;
    res.notes.forEach(n => { report.byNote[n] = (report.byNote[n] || 0) + 1; });
    if (res.html !== before) {
      if (!CHECK_ONLY) fs.writeFileSync(abs, res.html);
      report.changed++;
    } else {
      report.unchanged++;
    }
  });

  console.log('\nPetro Hrys social profiles' + (CHECK_ONLY ? ' (check only)' : '') + '\n');
  console.log('  Profiles in registry : ' + registry.enabled().length);
  console.log('  Pages in scope       : ' + report.total);
  console.log('  Written / updated    : ' + report.changed);
  console.log('  Already up to date   : ' + report.unchanged);
  console.log('  By language          : ' + JSON.stringify(report.byLang));
  console.log('  Transforms applied   : ' + JSON.stringify(report.byNote));
  if (report.failed.length) {
    console.log('\n  x Failed / ambiguous pages:');
    report.failed.forEach(f => console.log('    - ' + f));
    process.exit(1);
  }
  console.log('\n  OK - every page in scope carries the canonical profiles.\n');
}

module.exports = { footerBlock, cardsBlock, transform, targets, isOwned, START, END };
