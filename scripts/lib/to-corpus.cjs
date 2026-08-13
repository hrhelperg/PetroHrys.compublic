'use strict';

// The corpus file format — and why it is columnar.
//
// ── THE BLOCKER THIS SOLVES ─────────────────────────────────────────────────
//
// Tender Opportunity Intelligence v1 shipped a 15.5 MB `opportunities.json`
// holding 7,579 records: 2,146 bytes each. The v1 report named this the
// blocker for scaling past a handful of sources, because the file is rewritten
// in full on every refresh and git keeps every revision. Five sources fit.
// Twenty-five would not.
//
// Measuring where the bytes went made the fix obvious. Of 15.5 MB, only about
// 10.6 MB was field CONTENT. The remaining ~5 MB was JSON KEY NAMES — roughly
// thirty-five keys averaging twenty characters, repeated 7,579 times. A third
// of the file said `"sourcePlatformId"` over and over.
//
// So the rows are stored columnar: field names once, values in fixed-position
// arrays. Nothing is lost and nothing is compressed in a way a human cannot
// read — a reviewer opens the file, sees the `fields` array, and can count
// along a row.
//
// ── AND THREE DERIVABLE FIELDS ARE NOT STORED ───────────────────────────────
//
// Storing what a pure function can recompute is the other half of the waste:
//
//   timestamps       stored as the RAW source string only. `iso`, `precision`
//                    and `derived` come back from normalizeTimestamp, which is
//                    pure and deterministic, so the reconstituted object is
//                    identical. Saves ~1.2 MB and, better, makes it impossible
//                    for a stored `iso` to drift from the parser that made it.
//   classifications  stored as "CPV:32420000;UNSPSC:80111600". `top` and
//                    `label` are recomputed. Saves ~0.9 MB and means a
//                    correction to the CPV reference table reaches every
//                    existing record instead of only new ones.
//   occurrences      omitted when an opportunity has exactly one, because that
//                    one is fully derivable from the record's own source
//                    fields. Stored in full the moment there are two — which
//                    is precisely when it stops being derivable. Saves ~1.6 MB.
//
// The last one is the interesting case: provenance is never lost, it is just
// not written down twice. A single-source record IS its own occurrence.
//
// ── WHAT THIS DOES NOT FIX ──────────────────────────────────────────────────
//
// It buys roughly 2.5×. That takes five sources comfortably and twenty-five
// plausibly, at the record counts this project targets. It does NOT make the
// corpus unbounded: the honest lever for source count is a TIGHT WINDOW PER
// SOURCE, so twenty-five sources buy geographic coverage rather than twenty-
// five times the records. See the window budget in to-sources.cjs.

const TIME = require('./to-time.cjs');
const CLASS = require('./to-classification.cjs');

const FORMAT = 'columnar-1';

// Fixed column order. Appending is safe; reordering or removing is not, so the
// format version above changes if either happens.
const FIELDS = [
  'id', 'sourceId', 'sourcePlatformId', 'sourceNoticeId', 'sourceUrl',
  'title', 'titles', 'descriptionSummary', 'buyerName',
  'country', 'subnationalJurisdiction', 'projectCountry', 'coverage',
  'classifications', 'publicationDate', 'deadline', 'sourceModifiedDate',
  'status', 'statusBasis', 'noticeType', 'procedureType', 'value', 'language',
  'lotCount', 'officialReference', 'projectId',
  'electronicSubmission', 'electronicSubmissionBasis', 'submissionUrl',
  'frameworkAgreement', 'occurrenceCount', 'multiSource',
  'fieldSources', 'occurrences', 'hasAmendments', 'isAmendment',
  // The source's own statement that a notice also went to the Official
  // Journal, published by TenderNed and BOAMP. Retained because it is the one
  // field that says "expect TED to carry this too", which is what makes
  // under-merging measurable rather than invisible.
  'publishedEuWide',
];

// A columnar format drops anything not in FIELDS, silently. That is exactly
// how `publishedEuWide` disappeared the first time: two Phase 2 adapters
// emitted it, the column list did not have it, and the encode lost it without
// a word. Silent loss of a real source fact is worse than a crash, so the
// encoder now refuses a record carrying a field it has no column for.
function unknownFields(o) {
  const known = new Set(FIELDS);
  return Object.keys(o).filter((k) => !known.has(k)).sort();
}

const rawOf = (ts) => (ts && ts.raw ? ts.raw : null);
const codesOf = (list) => ((list && list.length)
  ? list.map((c) => `${c.scheme}:${c.code}`).join(';') : null);

function encodeRow(o) {
  const unknown = unknownFields(o);
  if (unknown.length) {
    throw new Error(`Corpus format has no column for: ${unknown.join(', ')} `
      + `(record ${o.id}). Add the column to FIELDS rather than losing the fact.`);
  }
  const single = !o.multiSource && Array.isArray(o.occurrences) && o.occurrences.length === 1;
  return FIELDS.map((f) => {
    switch (f) {
      case 'publicationDate': case 'deadline': case 'sourceModifiedDate':
        return rawOf(o[f]);
      case 'classifications':
        return codesOf(o.classifications);
      case 'occurrences':
        // Derivable while there is exactly one. Written the moment there are two.
        return single ? null : (o.occurrences || null);
      case 'fieldSources':
        return o.fieldSources || null;
      default: {
        const v = o[f];
        return v === undefined ? null : v;
      }
    }
  });
}

function decodeRow(row) {
  const o = {};
  FIELDS.forEach((f, i) => { o[f] = row[i] === undefined ? null : row[i]; });

  for (const f of ['publicationDate', 'deadline', 'sourceModifiedDate']) {
    o[f] = o[f] === null ? (f === 'sourceModifiedDate' ? null : TIME.EMPTY)
      : TIME.normalizeTimestamp(o[f]);
  }

  o.classifications = o.classifications
    ? CLASS.normalizeCodes(String(o.classifications).split(';')
      .map((s) => { const i = s.indexOf(':'); return [s.slice(0, i), s.slice(i + 1)]; }))
    : [];

  if (!o.occurrences) {
    // Reconstituted from the record's own source fields — the single
    // occurrence IS the record, which is why it was not written twice.
    o.occurrences = [{
      sourceId: o.sourceId,
      sourcePlatformId: o.sourcePlatformId,
      sourceNoticeId: o.sourceNoticeId,
      sourceUrl: o.sourceUrl,
      status: o.status,
      statusBasis: o.statusBasis,
    }];
  }
  if (o.occurrenceCount === null) o.occurrenceCount = o.occurrences.length;
  if (o.fieldSources === null) delete o.fieldSources;
  for (const f of ['hasAmendments', 'isAmendment']) if (o[f] === null) delete o[f];
  return o;
}

function encode({ generatedAt, adapterVersion, sources, stats, possibleDuplicates, opportunities }) {
  return {
    format: FORMAT,
    generatedAt,
    adapterVersion,
    sources,
    stats,
    possibleDuplicates,
    fields: FIELDS,
    rows: opportunities.map(encodeRow),
  };
}

function decode(file) {
  // A v1 corpus is a plain array of full objects under `opportunities`. Read
  // rather than rejected: a format change should not strand a checkout.
  if (!file.format && Array.isArray(file.opportunities)) return file;
  if (file.format !== FORMAT) throw new Error(`Unknown corpus format "${file.format}"`);
  const idx = new Map(file.fields.map((f, i) => [f, i]));
  const missing = FIELDS.filter((f) => !idx.has(f));
  if (missing.length) throw new Error(`Corpus is missing column(s): ${missing.join(', ')}`);
  // Decode by NAME, not by position, so a corpus written with a different
  // column order still reads correctly.
  const rows = file.rows.map((row) => FIELDS.map((f) => row[idx.get(f)]));
  return { ...file, opportunities: rows.map(decodeRow) };
}

module.exports = { FORMAT, FIELDS, encode, decode, encodeRow, decodeRow, unknownFields };
