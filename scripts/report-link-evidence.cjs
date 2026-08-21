#!/usr/bin/env node
// scripts/report-link-evidence.cjs
'use strict';

// What the existing evidence already says, before anyone opens a browser again.
//
// The canonical corpus records 1961 sources as UNKNOWN link value. That is one
// word covering several genuinely different situations, and the research pass
// that produced it already distinguished them — it just collapsed them on the
// way out:
//
//   a public listing was inspected and carries no website link
//   a public listing was inspected and its link could not be attributed
//   a listing was DISCOVERED and could not be read
//   the platform rendered and offered no discoverable listing at all
//   the platform never rendered
//
// The fifth of those is ignorance. The fourth is a fact about the platform. The
// first is a fact about its listings. Treating them as one word throws away
// most of what the pass cost to learn.
//
// ── WHAT THIS DOES NOT DO ───────────────────────────────────────────────────
//
// It opens nothing, fetches nothing, and writes no canonical field. FOLLOW is
// asserted here only where it is already asserted canonically — that is, where
// a public external anchor was actually observed and its rel supported it.
// Nothing below promotes a record: indexability does not imply follow, an
// absent listing does not imply no link, and a platform full of published
// businesses proves nothing about the anchor on any of them.
//
//   node scripts/report-link-evidence.cjs
//   node scripts/report-link-evidence.cjs --write
//
// Nothing in the build or the test suite invokes this file.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CK = require('./lib/rc-checkpoint.cjs');
const RLV = require('./report-link-value.cjs');

const FINDINGS = path.join(ROOT, 'data/link-value/.link-value.json');
const ARTEFACT = path.join(ROOT, 'data/link-value/evidence-states.json');

// ── THE LADDER ──────────────────────────────────────────────────────────────
//
// Ordered from most to least that the evidence supports. Every rung is a
// statement about what was OBSERVED, never about what is likely.
const STATES = [
  'VERIFIED_FOLLOW',
  'VERIFIED_NOFOLLOW',
  'VERIFIED_UGC',
  'VERIFIED_SPONSORED',
  'VERIFIED_MIXED',
  // A public listing was read, and it carries no external website link at all.
  'PUBLIC_LISTING_OBSERVED_NO_EXTERNAL_LINK',
  // A public listing was read and it does carry external links, but none could
  // be attributed to the business as its own website — so the rel tokens that
  // were captured describe a link whose role is unproven. Deliberately NOT
  // called "no external link": the link exists, its meaning does not.
  'PUBLIC_LISTING_OBSERVED_LINK_UNATTRIBUTED',
  // A public listing was read, carried contact details, and offered no link
  // labelled as the business's website. Weaker than "no external link".
  'PUBLIC_LISTING_OBSERVED_NO_LABELLED_LINK',
  // A listing URL was discovered on the platform and the page could not be
  // read. The existence of a public placement is evidence; its contents are not.
  'PUBLIC_LISTING_DISCOVERED_NOT_READ',
  // The platform rendered and no representative public placement was reachable
  // from it. A fact about the platform, and NOT a statement that its listings
  // carry no links.
  'NO_PUBLIC_LISTING_DISCOVERED',
  // Nothing was observed at all.
  'UNKNOWN',
];

// Each finding maps by what it actually recorded, not by its state name alone.
function evidenceStateOf(f) {
  if (f.state === 'RESOLVED') {
    if (f.backlinkType === 'dofollow') return 'VERIFIED_FOLLOW';
    if (f.backlinkType === 'nofollow') return 'VERIFIED_NOFOLLOW';
    if (f.backlinkType === 'ugc') return 'VERIFIED_UGC';
    if (f.backlinkType === 'sponsored') return 'VERIFIED_SPONSORED';
    if (f.backlinkType === 'mixed') return 'VERIFIED_MIXED';
    if (f.backlinkType === 'none') return 'PUBLIC_LISTING_OBSERVED_NO_EXTERNAL_LINK';
    return 'UNKNOWN';
  }
  const why = String(f.why || '');
  if (f.state === 'UNRESOLVED') {
    if (why.includes('not labelled as one by the operator')) {
      return 'PUBLIC_LISTING_OBSERVED_LINK_UNATTRIBUTED';
    }
    if (why.includes('no labelled website link was found')) {
      return 'PUBLIC_LISTING_OBSERVED_NO_LABELLED_LINK';
    }
    // Evidence that was disqualified — an event page, or another country's
    // listing on a shared host. Disqualified evidence is not weak evidence.
    return 'UNKNOWN';
  }
  if (f.state === 'LISTING_WITHOUT_LINK') return 'PUBLIC_LISTING_OBSERVED_NO_EXTERNAL_LINK';
  if (f.state === 'NO_LISTING_FOUND') return 'NO_PUBLIC_LISTING_DISCOVERED';
  if (f.state === 'UNREADABLE') {
    // Two different situations wearing one state. "the listing pages could not
    // be read" is reached only after listing URLs were found; a navigation
    // failure means the platform itself never rendered.
    if (why.includes('listing pages could not be read')) return 'PUBLIC_LISTING_DISCOVERED_NOT_READ';
    return 'UNKNOWN';
  }
  return 'UNKNOWN';
}

// Indexability observed on a page that was actually read. Kept beside the link
// state and never mixed into it: an indexable page says nothing about the rel
// on any anchor it carries.
function indexabilityOf(f) {
  if (f.listingIndexability) return f.listingIndexability;
  const t = (f.templates || [])[0];
  return (t && t.indexability) || null;
}

function derive() {
  const ledger = new CK.Ledger(FINDINGS);
  const findings = ledger.all();
  ledger.close();
  const byId = new Map();
  for (const f of findings) byId.set(`${f.collection}:${f.id}`, f);

  const rows = RLV.load();
  return rows.map((r) => {
    const f = byId.get(`${r.collection}:${r.id}`);
    return {
      id: r.id,
      collection: r.collection,
      country: r.country,
      domainRating: r.domainRating ?? null,
      canonicalLinkType: r.backlinkType || null,
      evidenceState: f ? evidenceStateOf(f) : 'UNKNOWN',
      listingIndexability: r.listingIndexability || (f ? indexabilityOf(f) : null),
      ready: RLV.hasRoute(r),
      free: RLV.isFree(r),
    };
  });
}

const count = (rows, pick) => {
  const out = {};
  for (const r of rows) out[pick(r)] = (out[pick(r)] || 0) + 1;
  return out;
};

const show = (title, counts, total) => {
  console.log(`\n${title}`);
  for (const s of STATES) {
    if (!counts[s]) continue;
    const pct = total ? ` (${((counts[s] / total) * 100).toFixed(1)}%)` : '';
    console.log(`  ${String(counts[s]).padStart(6)}  ${s}${pct}`);
  }
};

function run() {
  const rows = derive();
  const total = rows.length;
  console.log(`LINK EVIDENCE — ${total} active records, derived from the existing findings only.`);
  console.log('No browser was opened and no canonical field was written.');

  show('EVIDENCE STATE — ALL RECORDS', count(rows, (r) => r.evidenceState), total);

  // ── THE POINT OF THE EXERCISE ────────────────────────────────────────────
  const unknownCanonical = rows.filter((r) => !r.canonicalLinkType);
  show(`WHAT THE ${unknownCanonical.length} CANONICAL UNKNOWNS ACTUALLY ARE`,
    count(unknownCanonical, (r) => r.evidenceState), unknownCanonical.length);

  const stillNothing = unknownCanonical.filter((r) => r.evidenceState === 'UNKNOWN').length;
  console.log(`\n  separated: ${unknownCanonical.length - stillNothing}`);
  console.log(`  still nothing observed: ${stillNothing}`);

  // ── THE TWO COHORTS THE BRIEF NAMES ──────────────────────────────────────
  const ready = rows.filter((r) => r.ready && !r.canonicalLinkType);
  show(`READY + UNKNOWN (${ready.length} records)`, count(ready, (r) => r.evidenceState), ready.length);

  const freeReady = rows.filter((r) => r.free && r.ready && !r.canonicalLinkType);
  show(`FREE + READY + UNKNOWN (${freeReady.length} records)`,
    count(freeReady, (r) => r.evidenceState), freeReady.length);

  // ── INDEXABILITY IS ITS OWN AXIS ─────────────────────────────────────────
  const withPage = rows.filter((r) => r.listingIndexability);
  console.log(`\nLISTING PAGE OBSERVED: ${withPage.length}`);
  for (const [k, v] of Object.entries(count(withPage, (r) => r.listingIndexability))) {
    console.log(`  ${String(v).padStart(6)}  ${k}`);
  }
  const indexableUnknownRel = rows.filter((r) => r.listingIndexability === 'indexable'
    && !r.canonicalLinkType);
  console.log(`  of which indexable with NO proven rel: ${indexableUnknownRel.length}`);
  console.log('  (an indexable page is not a follow link, and is not counted as one)');

  if (process.argv.includes('--write')) {
    const payload = {
      derivedAt: new Date().toISOString().slice(0, 10),
      note: 'Derived from existing link-value findings. Not canonical. No record is '
        + 'promoted: FOLLOW appears only where a public external anchor was observed.',
      states: STATES,
      records: rows.filter((r) => r.evidenceState !== 'UNKNOWN' || r.canonicalLinkType)
        .map((r) => ({
          id: r.id, collection: r.collection, country: r.country,
          canonicalLinkType: r.canonicalLinkType, evidenceState: r.evidenceState,
          listingIndexability: r.listingIndexability,
        })),
    };
    fs.writeFileSync(ARTEFACT, `${JSON.stringify(payload, null, 1)}\n`);
    console.log(`\nWrote ${payload.records.length} derived states to ${path.relative(ROOT, ARTEFACT)}`);
  }
}

module.exports = { derive, evidenceStateOf, STATES, ARTEFACT };

if (require.main === module) run();
