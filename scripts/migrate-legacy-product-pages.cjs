'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

const PRODUCTS = [
  { slug: 'pdf-editor', label: 'PDF Editor', locales: ['en', 'es', 'fr', 'de'] },
  { slug: 'pocket-manager', label: 'Pocket Manager', locales: ['en', 'es', 'fr', 'de'] },
  { slug: 'cv-builder', label: 'CV Builder', locales: ['en', 'es', 'fr', 'de'] },
  { slug: 'unzip', label: 'Unzip', locales: ['en'] },
  { slug: 'tcg-scanner', label: 'TCG Scanner', locales: ['en'] },
  { slug: 'fax', label: 'FAX', locales: ['en'] },
  { slug: 'webmasterid', label: 'WebmasterID', locales: ['en', 'es', 'fr', 'de'] },
  { slug: 'invoice-maker', label: 'Invoice Maker', locales: ['en', 'es', 'fr', 'de'] },
  { slug: 'smart-printer', label: 'Smart Printer', locales: ['en'] }
];

const LOCALES = {
  en: { prefix: '', home: 'Home', work: 'Work' },
  es: { prefix: '/es', home: 'Inicio', work: 'Trabajo' },
  fr: { prefix: '/fr', home: 'Accueil', work: 'Travail' },
  de: { prefix: '/de', home: 'Startseite', work: 'Arbeit' }
};

const FONT_LINK = '  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&family=JetBrains+Mono:wght@500&family=Source+Serif+4:opsz,wght@8..60,400;8..60,500&display=swap" rel="stylesheet">';

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function pagePath(product, locale) {
  return locale === 'en'
    ? `${product.slug}/index.html`
    : `${locale}/${product.slug}/index.html`;
}

function extractDelimited(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end < 0) {
    throw new Error(`Missing delimited block: ${startMarker}`);
  }
  return source.slice(start, end + endMarker.length);
}

function extractElement(source, openingPattern, closingTag) {
  const match = source.match(openingPattern);
  if (!match || match.index === undefined) {
    throw new Error(`Missing element matching ${openingPattern}`);
  }
  const end = source.indexOf(closingTag, match.index);
  if (end < 0) {
    throw new Error(`Missing closing tag ${closingTag}`);
  }
  return source.slice(match.index, end + closingTag.length);
}

function shellFor(locale) {
  const prefix = locale === 'en' ? '' : `${locale}/`;
  const reference = read(`${prefix}work/index.html`);
  const ecosystem = extractDelimited(
    reference,
    '<!-- helperg-eco:body:start -->',
    '<!-- helperg-eco:body:end -->'
  );
  let header = extractElement(reference, /<header role="banner">/, '</header>');
  const workHref = LOCALES[locale].prefix + '/work/';
  header = header.replaceAll(
    `<a href="${workHref}" aria-current="page">`,
    `<a href="${workHref}">`
  );
  const footer = extractElement(reference, /<footer role="contentinfo">/, '</footer>');
  const skip = (reference.match(/<a class="skip" href="#main">[^<]+<\/a>/) || [])[0];
  if (!skip) throw new Error(`${prefix}work/index.html: missing skip link`);
  return { ecosystem, header, footer, skip };
}

function addClass(openingTag, ...classNames) {
  const classMatch = openingTag.match(/\sclass="([^"]*)"/);
  const classes = new Set(classMatch ? classMatch[1].split(/\s+/).filter(Boolean) : []);
  for (const className of classNames) classes.add(className);
  const value = [...classes].join(' ');
  if (classMatch) {
    return openingTag.replace(classMatch[0], ` class="${value}"`);
  }
  return openingTag.replace(/>$/, ` class="${value}">`);
}

function removeVisualOnlyClasses(source) {
  const removed = new Set(['fade-in', 'scroll-in', 'scroll-reveal', 'visible']);
  return source.replace(/\sclass="([^"]*)"/g, (attribute, value) => {
    const classes = value.split(/\s+/).filter((name) => name && !removed.has(name));
    return classes.length ? ` class="${classes.join(' ')}"` : '';
  });
}

function matchingDiv(source, start) {
  const token = /<\/?div\b[^>]*>/gi;
  token.lastIndex = start;
  let depth = 0;
  let match;
  while ((match = token.exec(source))) {
    if (match[0].startsWith('</')) depth -= 1;
    else depth += 1;
    if (depth === 0) {
      const openEnd = source.indexOf('>', start) + 1;
      return {
        start,
        end: token.lastIndex,
        opening: source.slice(start, openEnd),
        inner: source.slice(openEnd, match.index),
        html: source.slice(start, token.lastIndex)
      };
    }
  }
  throw new Error(`Unbalanced div at byte ${start}`);
}

function directDivChildren(source) {
  const children = [];
  const opening = /<div\b[^>]*>/gi;
  let cursor = 0;
  while (cursor < source.length) {
    opening.lastIndex = cursor;
    const match = opening.exec(source);
    if (!match) break;
    const child = matchingDiv(source, match.index);
    children.push(child);
    cursor = child.end;
  }
  return children;
}

function className(openingTag) {
  return (openingTag.match(/\sclass="([^"]*)"/) || [])[1] || '';
}

function migrateFaqs(source) {
  const itemPattern = /<div class="faq-item(?: active)?"/g;
  let cursor = 0;
  let output = '';
  let match;
  while ((match = itemPattern.exec(source))) {
    const item = matchingDiv(source, match.index);
    const children = directDivChildren(item.inner);
    const question = children.find((child) => /\bfaq-question\b/.test(className(child.opening)));
    const answer = children.find((child) => /\bfaq-answer\b/.test(className(child.opening)));
    if (!question || !answer) {
      throw new Error(`FAQ item at byte ${match.index} lacks a question or answer`);
    }
    const questionText = question.inner
      .replace(/<span class="faq-toggle">[\s\S]*?<\/span>/g, '')
      .replace(/<[^>]+>/g, '')
      .trim();
    const isOpen = /\bactive\b/.test(className(item.opening)) || /\bshow\b/.test(className(answer.opening));
    const replacement = [
      `<details class="faq-item"${isOpen ? ' open' : ''}>`,
      `  <summary class="faq-question"><span class="faq-title">${questionText}</span></summary>`,
      `  <div class="faq-answer">${answer.inner.trim()}</div>`,
      '</details>'
    ].join('\n');
    output += source.slice(cursor, item.start) + replacement;
    cursor = item.end;
    itemPattern.lastIndex = item.end;
  }
  return output + source.slice(cursor);
}

function migrateDivComparison(source) {
  const marker = '<div class="comparison-table">';
  const start = source.indexOf(marker);
  if (start < 0) return source;
  const table = matchingDiv(source, start);
  const rows = directDivChildren(table.inner);
  if (!rows.some((row) => /\btable-header\b/.test(className(row.opening)))) return source;

  const renderedRows = rows.map((row, rowIndex) => {
    const cells = directDivChildren(row.inner).map((cell) => cell.inner.trim());
    if (rowIndex === 0) {
      return `        <tr>${cells.map((cell) => `<th scope="col">${cell}</th>`).join('')}</tr>`;
    }
    return `        <tr>${cells.map((cell, cellIndex) => cellIndex === 0
      ? `<th scope="row">${cell}</th>`
      : `<td>${cell}</td>`).join('')}</tr>`;
  });
  const replacement = [
    '<div class="comparison-table table-scroll">',
    '  <table>',
    '    <thead>',
    renderedRows[0],
    '    </thead>',
    '    <tbody>',
    ...renderedRows.slice(1),
    '    </tbody>',
    '  </table>',
    '</div>'
  ].join('\n');
  return source.slice(0, table.start) + replacement + source.slice(table.end);
}

function makeTablesAccessible(source) {
  let output = source.replace(/<div class="comparison-table">\s*(?=<table)/g,
    '<div class="comparison-table table-scroll">\n');
  output = output.replace(/<table class="comparison-table">([\s\S]*?)<\/table>/g,
    '<div class="comparison-table table-scroll"><table>$1</table></div>');
  output = output.replace(/<th\b(?![^>]*\bscope=)([^>]*)>/g, '<th scope="col"$1>');
  output = output.replace(/(<tbody[^>]*>)([\s\S]*?)(<\/tbody>)/g, (block, open, rows, close) => {
    const accessibleRows = rows.replace(
      /(<tr[^>]*>\s*)<td([^>]*)>([\s\S]*?)<\/td>/g,
      '$1<th scope="row"$2>$3</th>'
    );
    return open + accessibleRows + close;
  });
  return output;
}

function markSections(source) {
  let sectionIndex = 0;
  return source.replace(/<section\b[^>]*>/g, (openingTag) => {
    const first = sectionIndex++ === 0;
    let updated = addClass(openingTag, first ? 'product-hero' : 'product-section');
    if (first) {
      updated = updated.replace(/\sclass="([^"]*)"/, (attribute, value) => {
        const classes = value.split(/\s+/).filter((name) => name !== 'hero' && name !== 'hero-section');
        return ` class="${classes.join(' ')}"`;
      });
    }
    if (/\b(?:download|cta-section)\b/.test(updated)) updated = addClass(updated, 'product-cta');
    return updated;
  });
}

function breadcrumb(locale, label) {
  const { prefix, home, work } = LOCALES[locale];
  const homeHref = prefix ? `${prefix}/` : '/';
  const workHref = `${prefix}/work/`;
  return [
    '    <p class="breadcrumb">',
    `      <a href="${homeHref}">${home}</a><span class="sep">/</span><a href="${workHref}">${work}</a><span class="sep">/</span><span aria-current="page">${label}</span>`,
    '    </p>'
  ].join('\n');
}

function migratePage(product, locale) {
  const relativePath = pagePath(product, locale);
  const absolutePath = path.join(ROOT, relativePath);
  const original = fs.readFileSync(absolutePath, 'utf8');
  if (/<body class="product-page">/.test(original)) return false;

  const bodyStart = original.indexOf('<body');
  const bodyEnd = original.indexOf('</body>');
  if (bodyStart < 0 || bodyEnd < 0) throw new Error(`${relativePath}: missing body`);

  let head = original.slice(0, bodyStart);
  head = head.replace(/\s*<style\b[^>]*>[\s\S]*?<\/style>\s*/g, '\n');
  head = head.replace(/\s*<link href="https:\/\/fonts\.googleapis\.com\/css2\?family=DM\+Sans[^>]+>\s*/g, `\n${FONT_LINK}\n`);
  if (!head.includes('/css/petrohrys.css')) {
    head = head.replace('<!-- helperg-eco:head:start -->',
      '  <link rel="stylesheet" href="/css/petrohrys.css">\n<!-- helperg-eco:head:start -->');
  }

  const ecosystemEnd = original.indexOf('<!-- helperg-eco:body:end -->', bodyStart);
  const firstSection = original.indexOf('<section', ecosystemEnd);
  const footerStart = original.indexOf('<footer', firstSection);
  const footerClose = original.indexOf('</footer>', footerStart);
  if (firstSection < 0 || footerStart < 0 || footerClose < 0) {
    throw new Error(`${relativePath}: could not identify product content`);
  }

  let content = original.slice(firstSection, footerStart).replace(/\s*<\/main>\s*/g, '\n');
  content = content.replace(/\s*<\/div>\s*(<!-- Footer -->)?\s*$/i, (_, comment) =>
    comment ? `\n${comment}\n` : '\n'
  );
  content = content.replace(/\sstyle="[^"]*"/g, '');
  content = content.replace(/\s(?:onclick|onload)="[^"]*"/g, '');
  content = content.replace(
    /(<a href="#" class="social-link-card" aria-label="Notion page \(coming soon\)")/,
    '$1 aria-disabled="true" tabindex="-1"'
  );
  content = removeVisualOnlyClasses(content);
  content = migrateFaqs(content);
  content = migrateDivComparison(content);
  content = makeTablesAccessible(content);
  content = markSections(content).trim();

  const tail = original.slice(footerClose + '</footer>'.length, bodyEnd);
  const jsonLd = [...tail.matchAll(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g)]
    .map((match) => match[0].trim());
  const shell = shellFor(locale);
  const migrated = [
    head.trimEnd(),
    '<body class="product-page">',
    `  ${shell.skip}`,
    shell.ecosystem,
    '',
    shell.header,
    '',
    '  <main id="main">',
    breadcrumb(locale, product.label),
    '',
    content.split('\n').map((line) => `    ${line}`).join('\n'),
    '  </main>',
    '',
    shell.footer,
    ...jsonLd.map((block) => `\n${block}`),
    '  <script src="/js/ecosystem-banner.js" defer></script>',
    '</body>',
    '</html>',
    ''
  ].join('\n').replace(/[ \t]+$/gm, '');

  fs.writeFileSync(absolutePath, migrated);
  return migrated !== original;
}

let rewritten = 0;
for (const product of PRODUCTS) {
  for (const locale of product.locales) {
    if (migratePage(product, locale)) rewritten += 1;
  }
}

console.log(`Legacy product migration: ${rewritten} page(s) rewritten.`);
