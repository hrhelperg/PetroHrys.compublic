// scripts/inject-research-nav.cjs
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { PATHS, writeIfChanged } = require('./lib/bd-util.cjs');

// The eight English editorial pages: the only pages carrying the site's
// .nav-primary list. The 23 legacy product/blog pages use a page-scoped
// .top-nav of in-page anchors and are deliberately untouched, as are all 33
// localised pages under es/, fr/, de/.
const EDITORIAL_PAGES = [
  'index.html',
  'work/index.html',
  'writing/index.html',
    'essays/index.html',
  'ai-systems/index.html',
  'infrastructure/index.html',
  'about/index.html',
];

const START = '<!-- bd-nav:start -->';
const END = '<!-- bd-nav:end -->';
const ITEM = '<li><a href="/research/">Research Center</a></li>';

// Matches a previously injected block, including its indentation and trailing
// newline, so re-running replaces rather than stacks.
const BLOCK_RE = /[ \t]*<!-- bd-nav:start -->[\s\S]*?<!-- bd-nav:end -->\n?/g;

// Anchored on the Work item, which appears once per nav list — twice per page,
// in the desktop list and again inside the mobile <details> panel.
const WORK_ITEM_RE = /^([ \t]*)<li><a href="\/work\/"[^>]*>Work<\/a><\/li>\n/gm;

// Deliberately carries no aria-current. On research/index.html the existing
// aria-current="page" sits on "Research & Writing", matching that page's own
// breadcrumb (Home / Research & Writing / Research). A second current item in
// the same list would be invalid, and moving the existing one is outside this
// task's additive scope.
function injectNav(html) {
  const cleaned = html.replace(BLOCK_RE, '');
  return cleaned.replace(WORK_ITEM_RE, (match, indent) =>
    `${match}${indent}${START}\n${indent}${ITEM}\n${indent}${END}\n`);
}

function run(pages = EDITORIAL_PAGES) {
  const changed = [];
  for (const page of pages) {
    const file = path.join(PATHS.siteRoot, page);
    const html = fs.readFileSync(file, 'utf8');
    if (writeIfChanged(file, injectNav(html))) changed.push(page);
  }
  return changed;
}

if (require.main === module) {
  const changed = run();
  console.log(`Nav updated on ${changed.length} page(s).`);
  changed.forEach((page) => console.log(`  ~ ${page}`));
}

module.exports = { EDITORIAL_PAGES, injectNav, run, START, END, ITEM };
