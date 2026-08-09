'use strict';
// Extract the legal page bodies into structured localized content files.
//
// The prose is copied BYTE-FOR-BYTE. Nothing is retranslated, reworded or
// "harmonized": these are legal documents, and the shipped German text is the
// German text of record. The only edits are presentational class renames, which
// are asserted below to leave the text content untouched.

const fs = require('node:fs');
const path = require('node:path');
const ROOT = '/Users/petrohrys/Developer/PetroHrys.compublic';
const OUT = path.join(ROOT, 'content', 'legal');

const DOCS = ['privacy', 'terms'];
const LOCALES = ['en', 'es', 'fr', 'de'];
const srcPath = (doc, loc) => path.join(ROOT, loc === 'en' ? '' : loc, doc, 'index.html');

// Plain text of a fragment, used to prove the migration changed presentation only.
const textOf = (html) => html
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim();

fs.mkdirSync(OUT, { recursive: true });
const manifest = {};

for (const doc of DOCS) {
  manifest[doc] = {};
  for (const loc of LOCALES) {
    const html = fs.readFileSync(srcPath(doc, loc), 'utf8');

    // The legacy body is everything inside .container. The back-link is chrome,
    // not content — the shared shell provides a breadcrumb instead.
    const start = html.indexOf('<div class="container">');
    if (start < 0) throw new Error(`no .container in ${doc}/${loc}`);
    let body = html.slice(start + '<div class="container">'.length);
    body = body.slice(0, body.lastIndexOf('</div>'));

    // Drop the back-link FIRST. It is chrome, not content — the shared shell
    // provides a breadcrumb — so the preservation baseline is taken after it is
    // gone. Taking it before would make the check fail on the one deletion that
    // is deliberate, and hide the deletions that would not be.
    body = body.replace(/\s*<a href="[^"]*" class="back">[\s\S]*?<\/a>\s*/, '\n');
    const before = textOf(body);

    // Pull the h1 and the "last updated" stamp out — the shell renders those in
    // a page hero, so they must not be duplicated inside the prose.
    const h1 = (body.match(/<h1>([\s\S]*?)<\/h1>/) || [])[1];
    const updated = (body.match(/<span class="updated">([\s\S]*?)<\/span>/) || [])[1];
    if (!h1 || !updated) throw new Error(`missing h1/updated in ${doc}/${loc}`);
    body = body.replace(/<h1>[\s\S]*?<\/h1>\s*/, '');
    body = body.replace(/\s*<span class="updated">[\s\S]*?<\/span>\s*/, '\n');

    // Legacy presentation classes → shared semantic primitives.
    body = body.replace(/<div class="highlight">/g, '<div class="doc-callout">');
    body = body.replace(/<div class="box">/g, '<div class="doc-box">');

    // Wide tables scroll inside their own container instead of scrolling the page.
    body = body.replace(/<table>/g, '<div class="table-wrap" tabindex="0"><table class="doc-table">');
    body = body.replace(/<\/table>/g, '</table></div>');

    body = body.split('\n').map((l) => l.replace(/\s+$/, '')).filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').trim();

    // The migration must be presentation-only. Compare the text content of what
    // we are storing plus the two extracted fields against the original text.
    const after = textOf(`${h1} ${updated} ${body}`);
    if (before !== after) {
      const i = [...before].findIndex((c, k) => c !== after[k]);
      throw new Error(`TEXT CHANGED in ${doc}/${loc} at ${i}:\n  was: ${before.slice(Math.max(0, i - 60), i + 60)}\n  now: ${after.slice(Math.max(0, i - 60), i + 60)}`);
    }

    fs.writeFileSync(path.join(OUT, `${doc}.${loc}.html`), `${body}\n`);
    manifest[doc][loc] = {
      h1: h1.trim(),
      updated: updated.trim(),
      title: (html.match(/<title>([^<]*)<\/title>/) || [])[1],
      description: (html.match(/name="description" content="([^"]*)"/) || [])[1],
      bytes: Buffer.byteLength(body),
      sections: (body.match(/<h2>/g) || []).length,
      textChars: after.length,
    };
    console.log(`${doc}/${loc}: ${manifest[doc][loc].sections} sections, ${manifest[doc][loc].bytes}B, text preserved exactly`);
  }
}

fs.writeFileSync(path.join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log('\nmanifest written');
for (const doc of DOCS) {
  const chars = LOCALES.map((l) => `${l}=${manifest[doc][l].textChars}`).join(' ');
  const secs = LOCALES.map((l) => manifest[doc][l].sections);
  console.log(`${doc}: sections ${secs.join('/')} ${new Set(secs).size === 1 ? '(parity)' : '*** MISMATCH ***'} | chars ${chars}`);
}
