'use strict';

// ── PER-COUNTRY TOTALS, WITHOUT A LITERAL ───────────────────────────────────
//
// Six wave test files each opened with a line of the form
//
//     assert.strictEqual(ALL.filter((r) => r.country === 'poland').length, 11);
//
// and several had grown a changelog in the trailing comment ("+2 Wave 1B
// directories, +1 Firmy.net", "+1 Wave 4 telecoms, +1 Wave 4B postal, +4 Wave
// 1B.1 directories, +1 Das Örtliche"). The number is a mirror of how many
// records a country happens to hold, so every verified addition failed a
// handful of wave tests that had nothing to say about it — poland is pinned in
// two files, italy in two, germany in two — and the only available fix was to
// retype the number in each. That is a habit of editing red tests to match
// reality, taught by the test suite itself.
//
// What those lines were reaching for is publication integrity: the country's
// registry set and the country's published pages are the SAME set. That is
// derivable from the two sides, it is strictly stronger than a count — it
// catches a record that exists but never reached the site, and a page left
// behind by a record that was withdrawn, neither of which a total can see — and
// it stays silent when research adds a row.
//
// The floor is kept where the original count was, as a floor: additions are
// silent, a deletion is loud.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const SECTION = path.join(ROOT, 'research', 'business-directories');

function publishedSlugs(country) {
  const dir = path.join(SECTION, country);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    // `categories/` is the country's category index, not a directory record.
    .filter((e) => e.isDirectory() && e.name !== 'categories')
    .map((e) => e.name)
    .sort();
}

// `records` is the whole registry; `floor` is the count the removed literal
// held, kept only as a lower bound.
function assertCountryPublicationParity(assert, records, country, floor) {
  const mine = records.filter((r) => r.country === country);
  assert.ok(mine.length >= floor,
    `the ${country} set shrank to ${mine.length}; it held at least ${floor}`);
  assert.deepStrictEqual(publishedSlugs(country), mine.map((r) => r.slug).sort(),
    `the published ${country} pages and the ${country} registry set disagree`);
}

module.exports = { assertCountryPublicationParity, publishedSlugs };
