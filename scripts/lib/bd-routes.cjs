// scripts/lib/bd-routes.cjs
'use strict';
const path = require('node:path');

// The single source of truth for every URL and output path in the section.
// Nothing else may build a directory href by hand: relative links broke on
// category pages because the detail page lives two segments above them, and a
// component cannot know how deep the page rendering it happens to be.
const BASE = '/research/business-directories/';
const SECTION_DIR = path.join('research', 'business-directories');
const SITEMAP_FILE = 'sitemap-business-directories.xml';
const CATEGORY_SEGMENT = 'categories';
const PAGE_SEGMENT = 'page';
const GUIDES_SEGMENT = 'guides';

class RouteError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RouteError';
  }
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function requireSlug(value, label) {
  if (typeof value !== 'string' || !SLUG_RE.test(value)) {
    throw new RouteError(`Invalid ${label} slug ${JSON.stringify(value)}.`);
  }
  return value;
}

// --- site-absolute URLs (always rooted, never relative) ----------------------

const hubPath = () => BASE;

const countryPath = (country) => `${BASE}${requireSlug(country, 'country')}/`;

const categoryPath = (country, category) =>
  `${countryPath(country)}${CATEGORY_SEGMENT}/${requireSlug(category, 'category')}/`;

const directoryPath = (country, directory) =>
  `${countryPath(country)}${requireSlug(directory, 'directory')}/`;

const articlesPath = () => `${BASE}${GUIDES_SEGMENT}/`;
const articlePath = (slug) => `${articlesPath()}${requireSlug(slug, 'article')}/`;

const feedPath = () => `${BASE}feed.xml`;

const sitemapPath = () => `/${SITEMAP_FILE}`;

function pagePath(basePath, pageNumber) {
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    throw new RouteError(`Invalid page number ${pageNumber}.`);
  }
  return pageNumber === 1 ? basePath : `${basePath}${PAGE_SEGMENT}/${pageNumber}/`;
}

// A record carries its own country, so callers never have to thread it through.
function directoryPathFor(directory) {
  if (!directory || typeof directory !== 'object') {
    throw new RouteError('directoryPathFor requires a directory record.');
  }
  return directoryPath(directory.country, directory.slug);
}

// --- repository-relative output paths ---------------------------------------

const toOutPath = (urlPath) => path.join(SECTION_DIR, ...urlPath
  .slice(BASE.length)
  .split('/')
  .filter(Boolean), 'index.html');

const hubOut = () => path.join(SECTION_DIR, 'index.html');
const countryOut = (country) => toOutPath(countryPath(country));
const categoryOut = (country, category) => toOutPath(categoryPath(country, category));
const directoryOut = (country, directory) => toOutPath(directoryPath(country, directory));
const articlesOut = () => path.join(SECTION_DIR, GUIDES_SEGMENT, 'index.html');
const articleOut = (slug) => toOutPath(articlePath(slug));
const feedOut = () => path.join(SECTION_DIR, 'feed.xml');
const sitemapOut = () => SITEMAP_FILE;

module.exports = {
  BASE, SECTION_DIR, SITEMAP_FILE, CATEGORY_SEGMENT, PAGE_SEGMENT, GUIDES_SEGMENT, RouteError,
  hubPath, countryPath, categoryPath, directoryPath, directoryPathFor,
  feedPath, sitemapPath, pagePath, articlesPath, articlePath,
  hubOut, countryOut, categoryOut, directoryOut, feedOut, sitemapOut, articlesOut, articleOut,
};
