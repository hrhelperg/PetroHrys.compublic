#!/usr/bin/env node
// scripts/apply-redirect-resolutions.cjs
'use strict';

// The decisions taken on the 17 audited redirect cases, written down so they
// can be re-read, argued with and re-applied.
//
// ── THE INVARIANT BEING ENFORCED ────────────────────────────────────────────
//
//   one current product  ->  one current canonical record
//
// The corpus already lives by this: zero hosts carry more than one record, and
// the schema says so out loud — "two records on one host are almost always the
// same service listed twice". So when a domain now lands on a product ALREADY
// recorded here, the old record cannot stay active. It would be the same
// product, counted twice, in the discovery results and in every campaign.
//
// The opposite error is just as easy. Two products do not become one because a
// parent bought both, and a brand does not die because its domain grew a
// hyphen. So each case is resolved by what it actually is:
//
//   DOMAIN_MOVE   the product is alive at a new address
//                 -> repoint `website`, stay active
//   ACQUISITION / CONSOLIDATION into a record already here
//                 -> mark `redirected`, name the survivor, drop out of the
//                    actionable set (the schema already excludes `redirected`)
//   REBRAND with no record at the destination
//                 -> repoint and rename in place; nothing is duplicated
//   GEOLOCATED    -> change nothing. The redirect was about this machine.
//
// ── WHY NO NEW CORPORATE-HISTORY SUBSYSTEM ──────────────────────────────────
//
// Provenance is carried in the fields that already exist: `note` records what
// happened and names the surviving record, and `website` keeps the address that
// was audited. Inventing a schema for corporate history to hold sixteen facts
// would be a bigger change than the facts justify.

const fs = require('node:fs');
const path = require('node:path');

const SAFE = require('./lib/rc-safe-apply.cjs');

const ROOT = path.resolve(__dirname, '..');
const DIRECTORIES = path.join(ROOT, 'data/business-directories/opportunities.json');
const MARKETPLACES = path.join(ROOT, 'data/marketplaces/marketplaces.json');
const AUDIT = path.join(ROOT, 'data/business-directories/.redirect-audit.json');

// Each decision states the evidence it rests on, because "the audit said so" is
// not a reason anyone can check a year from now.
const DECISIONS = {
  // ── The product moved address and is alive there ──────────────────────────
  'be-cylex': { action: 'repoint', to: 'https://www.cylex-belgie.be/', why: 'Cylex serves Belgium from a per-market domain' },
  'ch-cylex': { action: 'repoint', to: 'https://www.cylex-swiss.ch/', why: 'Cylex serves Switzerland from a per-market domain' },
  'fr-cylex': { action: 'repoint', to: 'https://www.cylex-locale.fr/', why: 'Cylex serves France from a per-market domain' },
  'it-cylex': { action: 'repoint', to: 'https://www.cylex-italia.it/', why: 'Cylex serves Italy from a per-market domain' },
  'pl-cylex': { action: 'repoint', to: 'https://www.cylex-polska.pl/', why: 'Cylex serves Poland from a per-market domain' },
  'de-myhammer': { action: 'repoint', to: 'https://www.my-hammer.de/', why: 'the same product on a hyphenated domain' },
  'ie-justeat': { action: 'repoint', to: 'https://www.just-eat.ie/', why: 'the same product on a hyphenated domain' },
  'mp-mk-reklama5': {
    collection: 'marketplaces',
    action: 'repoint',
    to: 'https://reklama5.com/',
    why: 'the Macedonian marketplace consolidated from reklama5.mk onto a .com domain',
  },

  // ── Rebrands with nothing at the destination to collide with ──────────────
  'global-accesswire': {
    action: 'rebrand',
    to: 'https://www.accessnewswire.com/',
    name: 'ACCESS Newswire',
    why: 'ACCESSWIRE was renamed ACCESS Newswire; the press-release distribution product is unchanged',
  },
  'global-seedrs': {
    action: 'rebrand',
    to: 'https://europe.republic.com/',
    name: 'Republic Europe',
    why: 'Seedrs was acquired by Republic and now trades as Republic Europe; the destination still names Seedrs Europe Limited as the regulated entity',
  },

  // ── Consolidated into a product this corpus ALREADY records ───────────────
  'uk-applegate': {
    action: 'consolidate',
    into: 'uk-businessmagnet',
    why: 'Businessmagnet announced the acquisition of the Applegate.co.uk domain on 19 September 2025, on the page the redirect lands on',
  },
  'de-opendi': {
    action: 'consolidate',
    into: 'de-stadtbranchenbuch',
    why: 'opendi.de now serves Stadtbranchenbuch, which is already recorded',
  },
  'dk-eniro': {
    action: 'consolidate',
    into: 'dk-krak',
    why: 'Eniro Denmark now serves Krak, which is already recorded',
  },
  // Barbados and Jamaica land on the SAME platform and resolve differently,
  // because the corpus's identity key is `country/domain`, not `domain`. The
  // schema says so in both collections: "two entries on one host in one country
  // are the same platform listed twice" — one host serving several countries
  // through its own per-country sections is how a regional platform is modelled
  // here already (encuentra24 holds six such records).
  //
  // So findyello's Barbados section is a real Barbados record and the only one
  // that market has. Consolidating it away would have deleted the country's
  // entire coverage to avoid a duplicate that the identity key does not
  // consider a duplicate.
  'bb-barbadosyp': {
    action: 'repoint',
    to: 'https://www.findyello.com/barbados/',
    why: 'the Barbados Yellow Pages domain now serves findyello\'s Barbados section, which is a distinct market from the Jamaica record on the same host',
  },
  'jm-jamaicayp': {
    action: 'consolidate',
    into: 'jm-findyello',
    why: 'the Jamaica Yellow Pages domain now serves findyello, which is already recorded for Jamaica — one host, one country, one product',
  },
  'au-oneflare': {
    action: 'consolidate',
    into: 'mp-au-airtasker',
    why: 'the destination states the Oneflare brand retired on 30 June 2026 and directs users to Airtasker, which is already recorded',
  },


  // ── Found by the actionability pass, 2026-08-14 ───────────────────────────
  //
  // Thirteen records believed active were answering from somewhere else. None
  // of the destinations is already a record here, so none is a duplicate: each
  // is either the same product at a new address or the same product under a new
  // name. They were classified by the same audit as the first seventeen.
  'ae-dubaichamber': { action: 'repoint', to: 'https://www.dubaichambercommerce.com/en/', why: 'the Dubai Chamber moved its business directory to a new domain' },
  'au-seek-companies': { action: 'repoint', to: 'https://au.seek.com/companies', why: 'SEEK moved its Australian company profiles onto au.seek.com' },
  'cl-computrabajo': { action: 'repoint', to: 'https://cl.computrabajo.com/', why: 'Computrabajo serves Chile from a country subdomain of its global site' },
  'global-bing-places': { action: 'repoint', to: 'https://www.bing.com/forbusiness/', why: 'Bing Places moved onto bing.com' },
  'global-notion-integrations': { action: 'repoint', to: 'https://www.notion.com/connections', why: 'Notion moved from notion.so to notion.com and renamed the directory Connections' },
  'global-smartcustomer': { action: 'repoint', to: 'https://www.smartcustomer.com/', why: 'the record already carried the new name; only the address was stale' },
  'global-techpilot': { action: 'repoint', to: 'https://www.techpilot.com/en', why: 'Techpilot moved from techpilot.net to techpilot.com' },
  'jp-nc-net': { action: 'repoint', to: 'https://www.nc-net.com/', why: 'NC Network moved from nc-net.or.jp to nc-net.com' },

  'at-mjam': { action: 'rebrand', to: 'https://www.foodora.at/', name: 'foodora Austria', why: 'mjam was rebranded to foodora in Austria' },
  'cz-damejidlo': { action: 'rebrand', to: 'https://www.foodora.cz/', name: 'foodora Czechia', why: 'Dame jidlo was rebranded to foodora in Czechia' },
  'es-construmatica': { action: 'rebrand', to: 'https://www.construnews.com/', name: 'Construnews', why: 'Construmatica now trades as Construnews' },
  // Renamed to "Annuaire Petites Affiches" in a first pass and corrected: the
  // page it lands on is still titled Hoodspot.fr. The directory moved onto the
  // Petites Affiches domain and kept its own name, which makes this a move and
  // not a rebrand. Renaming it would have retired a brand that is still trading.
  'fr-hoodspot': { action: 'repoint', to: 'https://annuaire.petitesaffiches.fr/', why: 'Hoodspot now runs on the Petites Affiches domain under its own name' },
  'it-infoimprese': { action: 'rebrand', to: 'https://www.registroimprese.it/', name: 'Registro Imprese', why: 'InfoImprese was folded into Registro Imprese, the official Italian business register run by the same operator' },

  // ── Nothing happened ──────────────────────────────────────────────────────
  // Nothing corporate happened, and nothing was established either. The prober
  // never saw the .com product — it was handed the Irish site because of where
  // this machine sits — so the status stays unknown and the note has to keep
  // saying what is outstanding, which the operations suite enforces on every
  // unknown record. An upgrade here would be evidence about a location.
  'global-ziprecruiter': {
    action: 'none',
    why: 'ziprecruiter.com served ziprecruiter.ie to this prober\'s location, so the global product itself was never seen and a browser check is needed from elsewhere; the status stays unknown',
  },
};

// Sentences left over from the browser-verification wave that describe a
// redirect as unresolved. Once resolved, they are no longer true.
//
// This tool's OWN sentence is on the list, so re-running it is idempotent. It
// was not, and a second run over the same audit appended a duplicate audit
// sentence to fifteen records — a resolution script that corrupts records when
// run twice is a trap for whoever runs it next.
const STALE = /(browser check is needed|no longer established|A browser check on \d{4}-\d{2}-\d{2}|An automated browser check on \d{4}-\d{2}-\d{2}|Audited on \d{4}-\d{2}-\d{2}|An actionability check on \d{4}-\d{2}-\d{2})/i;

function rewriteNote(note, replacement) {
  const kept = String(note || '').trim()
    .split(/(?<=\.)\s+/)
    .filter((s) => s && !STALE.test(s))
    .join(' ');
  return `${kept} ${replacement}`.replace(/\s+/g, ' ').trim();
}

function main() {
  const audited = JSON.parse(fs.readFileSync(AUDIT, 'utf8'));
  const date = audited.auditedAt;
  const files = {
    directories: JSON.parse(fs.readFileSync(DIRECTORIES, 'utf8')),
    marketplaces: JSON.parse(fs.readFileSync(MARKETPLACES, 'utf8')),
  };
  const before = JSON.parse(JSON.stringify(files));
  const collectionOf = (id) => (files.directories.some((r) => r.id === id) ? 'directories' : 'marketplaces');
  const find = (id) => files.directories.find((r) => r.id === id)
    || files.marketplaces.find((r) => r.id === id);
  const OWNER = 'redirect';

  const tally = { repoint: 0, rebrand: 0, consolidate: 0, none: 0, missing: 0 };
  const unresolved = [];

  for (const f of audited.findings) {
    const d = DECISIONS[f.id];
    if (!d) { unresolved.push(f.id); continue; }
    const record = find(f.id);
    if (!record) { tally.missing += 1; continue; }
    const collection = collectionOf(f.id);
    const dateField = collection === 'marketplaces' ? null : 'lastVerified';
    const stamp = dateField && record[dateField] !== undefined ? { [dateField]: date } : {};

    if (d.action === 'repoint') {
      SAFE.applyPatch(record, {
        website: d.to,
        note: SAFE.amendNote(record.note, `${d.why}; the record now points at the current address.`,
          { owner: OWNER, date }),
        ...stamp,
      }, { owner: OWNER, collection });
      tally.repoint += 1;
    } else if (d.action === 'rebrand') {
      SAFE.applyPatch(record, {
        website: d.to,
        name: d.name,
        note: SAFE.amendNote(record.note, `${d.why}.`, { owner: OWNER, date }),
        ...stamp,
      }, { owner: OWNER, collection });
      tally.rebrand += 1;
    } else if (d.action === 'consolidate') {
      const survivor = find(d.into);
      if (!survivor) throw new Error(`${f.id} consolidates into ${d.into}, which does not exist`);
      // `redirected` is excluded from the actionable set by the schema, which
      // is what stops the same product being offered twice. The record is NOT
      // deleted: its history is the reason anyone can audit this later.
      SAFE.applyPatch(record, {
        currentStatus: 'redirected',
        note: SAFE.amendNote(record.note,
          `${d.why}; the surviving record is ${d.into} (${survivor.website}).`, { owner: OWNER, date }),
        ...stamp,
      }, { owner: OWNER, collection });
      tally.consolidate += 1;
    } else if (d.action === 'none') {
      SAFE.applyPatch(record, {
        note: SAFE.amendNote(record.note, `${d.why}.`, { owner: OWNER, date }),
        ...stamp,
      }, { owner: OWNER, collection });
      tally.none += 1;
    }
  }

  if (unresolved.length) {
    throw new Error(`No decision recorded for: ${unresolved.join(', ')}. `
      + 'Every audited case must be terminally classified, so this refuses to write a partial resolution.');
  }

  for (const key of ['directories', 'marketplaces']) {
    SAFE.assertNoDeletion(before[key], files[key]);
  }
  // The redirect owner may rename — a rebrand IS a name change — so `name` is
  // excluded from the drift guard here and only here. Every other curated
  // field must come out exactly as it went in.
  const fingerprint = (rows) => SAFE.curatedFingerprint(
    rows.map((r) => ({ ...r, name: undefined })),
  );
  for (const key of ['directories', 'marketplaces']) {
    const drift = SAFE.diffFingerprints(fingerprint(before[key]), fingerprint(files[key]));
    if (drift.length) throw new Error(`${key}: curated fields drifted on ${drift.join(', ')}`);
  }

  fs.writeFileSync(DIRECTORIES, `${JSON.stringify(files.directories, null, 1)}\n`);
  fs.writeFileSync(MARKETPLACES, `${JSON.stringify(files.marketplaces, null, 1)}\n`);
  console.log('Resolved:', Object.entries(tally).map(([k, v]) => `${k}=${v}`).join(' '));
}

main();
