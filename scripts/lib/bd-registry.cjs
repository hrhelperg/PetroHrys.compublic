'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { PATHS } = require('./bd-util.cjs');
const { migrateRecord } = require('./bd-migrate.cjs');

const STRUCTURAL_RESERVED = ['categories', 'page', 'feed.xml', 'index', 'guides'];
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

class RegistryError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RegistryError';
  }
}

function readJson(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (cause) {
    throw new RegistryError(`Cannot read registry file ${filePath}: ${cause.code || cause.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (cause) {
    throw new RegistryError(`Malformed JSON in ${filePath}: ${cause.message}`);
  }
}

function requireArray(value, filePath) {
  if (!Array.isArray(value)) throw new RegistryError(`${filePath} must contain a JSON array.`);
  return value;
}

// Defence in depth: registry slugs become path segments, so anything outside a
// strict kebab-case shape is refused before it can reach the filesystem.
function assertSafeSlug(slug, label, filePath) {
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) {
    throw new RegistryError(
      `Unsafe or malformed ${label} slug ${JSON.stringify(slug)} in ${filePath}. ` +
      'Slugs must be lowercase alphanumeric words separated by single hyphens.');
  }
}

function resolveInside(rootDir, ...segments) {
  const root = path.resolve(rootDir);
  const target = path.resolve(root, ...segments);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new RegistryError(`Refusing to read outside the registry root ${root}: ${target}`);
  }
  return target;
}

function canonicalDomain(website) {
  try {
    return new URL(website).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null; // shape of `website` is the validator's concern, not the loader's
  }
}

function assertUniqueSlugs(items, label, filePath) {
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.slug)) {
      throw new RegistryError(`Duplicate ${label} slug "${item.slug}" in ${filePath}.`);
    }
    seen.add(item.slug);
  }
}

function loadRegistry(dataRoot = PATHS.dataRoot) {
  const root = path.resolve(dataRoot);
  const countriesFile = resolveInside(root, 'countries.json');
  const categoriesFile = resolveInside(root, 'categories.json');

  const countries = requireArray(readJson(countriesFile), countriesFile);
  const categories = requireArray(readJson(categoriesFile), categoriesFile);

  for (const country of countries) assertSafeSlug(country.slug, 'country', countriesFile);
  for (const category of categories) assertSafeSlug(category.slug, 'category', categoriesFile);
  assertUniqueSlugs(countries, 'country', countriesFile);
  assertUniqueSlugs(categories, 'category', categoriesFile);

  const dirsRoot = resolveInside(root, 'directories');
  if (!fs.existsSync(dirsRoot)) {
    throw new RegistryError(`Missing directories folder: ${dirsRoot}`);
  }

  // Orphan detection. readdir order is not stable across platforms, so sort it.
  const declared = new Set(countries.map((c) => `${c.slug}.json`));
  const present = fs.readdirSync(dirsRoot).filter((f) => f.endsWith('.json')).sort();
  for (const file of present) {
    if (!declared.has(file)) {
      throw new RegistryError(
        `Orphan directory file ${path.join(dirsRoot, file)}: country ` +
        `"${file.replace(/\.json$/, '')}" is not declared in ${countriesFile}.`);
    }
  }

  const countrySlugs = new Set(countries.map((c) => c.slug));
  const categorySlugs = new Set(categories.map((c) => c.slug));

  const directories = [];
  const seenId = new Map();
  const seenSlug = new Map();
  const seenDomain = new Map();

  // Iterate declaration order, never readdir order, so output is deterministic.
  for (const country of countries) {
    const file = resolveInside(dirsRoot, `${country.slug}.json`);
    if (!fs.existsSync(file)) {
      throw new RegistryError(
        `Missing directories file for declared country "${country.slug}": ${file}. ` +
        'Create it containing [].');
    }

    for (const entry of requireArray(readJson(file), file)) {
      const label = entry && entry.id ? entry.id : JSON.stringify(entry && entry.slug);
      assertSafeSlug(entry.slug, 'directory', file);

      if (!countrySlugs.has(entry.country)) {
        throw new RegistryError(
          `Directory "${label}" in ${file} references undeclared country "${entry.country}".`);
      }
      if (entry.country !== country.slug) {
        throw new RegistryError(
          `Directory "${label}" declares country "${entry.country}" but is stored in ` +
          `"${country.slug}.json" (${file}).`);
      }
      if (!categorySlugs.has(entry.category)) {
        throw new RegistryError(
          `Directory "${label}" in ${file} references undeclared category "${entry.category}".`);
      }

      if (seenId.has(entry.id)) {
        throw new RegistryError(
          `Duplicate directory id "${entry.id}" in ${file}; first seen in ${seenId.get(entry.id)}.`);
      }
      seenId.set(entry.id, file);

      const slugKey = `${entry.country}/${entry.slug}`;
      if (seenSlug.has(slugKey)) {
        throw new RegistryError(
          `Duplicate directory slug "${entry.slug}" for country "${entry.country}" in ${file}.`);
      }
      seenSlug.set(slugKey, file);

      // Per country, not global: one service may legitimately be listed for
      // several countries as separate records sharing a domain.
      //
      // An official application host can also carry several genuinely distinct
      // registries — accessdata.fda.gov and sam.gov both do. That is permitted
      // only when every record on the host declares resourceIdentity with a
      // sharedHostGroup. The loader checks the shape; the validator checks that
      // the groups agree, the systemKeys differ and the URLs are materially
      // different, and reports those as errors rather than throwing.
      const domain = canonicalDomain(entry.website);
      if (domain) {
        const domainKey = `${entry.country}/${domain}`;
        const prior = seenDomain.get(domainKey);
        const group = entry.resourceIdentity && entry.resourceIdentity.sharedHostGroup;
        if (prior && !(prior.group && group)) {
          throw new RegistryError(
            `Duplicate canonical domain "${domain}" for country "${entry.country}" in ${file}; ` +
            `first seen in ${prior.file}. Records may share an official host only when each ` +
            'declares resourceIdentity.sharedHostGroup.');
        }
        if (!prior) seenDomain.set(domainKey, { file, group });
      }

      // Migrated on load, so a record still written in the pre-expansion shape
      // keeps working. The migration only moves data; it never invents a value.
      directories.push(migrateRecord(entry));
    }
  }

  return { countries, categories, directories };
}

function getCountry(registry, slug) {
  return registry.countries.find((c) => c.slug === slug);
}

function getCategory(registry, slug) {
  return registry.categories.find((c) => c.slug === slug);
}

function directoriesFor(registry, countrySlug, categorySlug) {
  return registry.directories.filter(
    (d) => d.country === countrySlug && (categorySlug === undefined || d.category === categorySlug),
  );
}

function groupByCategory(registry, countrySlug) {
  const grouped = new Map();
  for (const category of registry.categories) {
    grouped.set(category.slug, directoriesFor(registry, countrySlug, category.slug));
  }
  return grouped;
}

function reservedSlugs(categories) {
  const reserved = new Set(STRUCTURAL_RESERVED);
  for (const category of categories) reserved.add(category.slug);
  return reserved;
}

function isIndexable(entries) {
  return entries.length > 0;
}

module.exports = {
  RegistryError, loadRegistry, getCountry, getCategory, directoriesFor,
  groupByCategory, reservedSlugs, isIndexable, STRUCTURAL_RESERVED,
};
