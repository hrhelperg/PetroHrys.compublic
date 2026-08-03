// scripts/lib/bd-util.cjs
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const HTML = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const XML = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

function escapeWith(map, value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (ch) => map[ch]);
}

const escapeHtml = (value) => escapeWith(HTML, value);
const escapeXml = (value) => escapeWith(XML, value);

function writeIfChanged(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8') === contents) return false;
  fs.writeFileSync(filePath, contents, 'utf8');
  return true;
}

const siteRoot = path.resolve(__dirname, '..', '..');
const PATHS = {
  siteRoot,
  dataRoot: path.join(siteRoot, 'data', 'business-directories'),
  sectionRoot: path.join(siteRoot, 'research', 'business-directories'),
};

module.exports = { escapeHtml, escapeXml, writeIfChanged, PATHS };
