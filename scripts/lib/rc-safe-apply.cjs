'use strict';

// The contract every research pass writes through.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// Three separate research passes damaged canonical data in three different
// ways, and each was found by reading output rather than by a guard:
//
//   A Media pass OVERWROTE all 62 human descriptions with a procedural
//   sentence. "Dutch management and entrepreneurship media. MT and Sprout
//   merged into one title, and both mt.nl and sprout.nl now redirect here."
//   became "An automated browser check was refused by the site."
//
//   The same pass DELETED Healthcare IT News and PhocusWire — two real
//   publications — because an ontology classifier that was wrong on two of its
//   first two rejections was allowed to prune.
//
//   Two appliers were NOT IDEMPOTENT. A second run appended a duplicate audit
//   sentence to fifteen records, and re-flagged thirteen resolved redirects
//   with a note asking for work their own status said was finished.
//
// Every one of those is the same underlying mistake: a research pass treated
// the whole record as its own. It is not. A pass owns the handful of fields it
// establishes, and nothing else — and it may not remove records at all.
//
// So this module is the only way those passes write, and it enforces:
//
//   1. FIELD OWNERSHIP  a pass declares what it may write; writing anything
//                       else throws rather than silently succeeding.
//   2. IDEMPOTENCE      a note sentence carries its owner, so re-applying the
//                       same result replaces its own previous sentence instead
//                       of appending a second copy.
//   3. NO DELETION      removal needs an explicit, evidenced decision, never a
//                       classifier's opinion.
//   4. IDENTITY         canonical identity is per collection, and for these
//                       collections it is country + host — never host alone.

// ── 1. FIELD OWNERSHIP ──────────────────────────────────────────────────────
//
// What a research pass of each kind is allowed to establish. Everything absent
// from a list is somebody else's: curated descriptions, canonical names,
// geography, ontology, and any provenance a human wrote.
const OWNERSHIP = {
  // Does this site answer at all, and with its own content?
  accessibility: {
    directories: ['currentStatus', 'lastVerified', 'note'],
    marketplaces: ['currentStatus', 'note'],
    media: ['currentStatus', 'lastVerified', 'shortNote', 'limitations'],
  },
  // What can a business actually DO here? Deliberately cannot write
  // currentStatus: accessibility and actionability are separate facts, and a
  // pass that establishes one may not quietly restate the other.
  actionability: {
    directories: ['listingAction', 'submissionUrl', 'claimUrl', 'lastVerified', 'note'],
    // Seller actionability owns the two structured fields and NOTHING ELSE —
    // deliberately not `note`.
    //
    // The marketplace collection PRINTS its notes in the product, in four
    // languages. A first version wrote research prose there and put 271
    // English sentences onto the German page, which the localisation guard
    // caught as "86% English tokens". The finding belongs in the committed
    // evidence file; the record carries the fact, not the account of how it was
    // found. currentStatus is excluded too: a route hunt does not get to revise
    // whether the site is reachable.
    marketplaces: ['sellerAction', 'sellerActionUrl'],
    media: ['opportunityTypes', 'submissionUrl', 'pitchUrl', 'pressReleaseUrl',
      'advertisingUrl', 'mediaKitUrl', 'contactUrl', 'lastVerified', 'shortNote', 'limitations'],
  },
  // What does the useful action COST. A third fact, owned separately from the
  // other two on purpose: a pass that establishes a price has no business
  // deciding whether the site is reachable or what the action is, and the
  // contract refused exactly that attempt rather than letting it through.
  cost: {
    directories: ['submissionModel'],
    marketplaces: ['sellerCost', 'costModel'],
    media: ['costModel'],
    tenders: ['searchAccess', 'bidAccess'],
  },
  // What does a placement here LINK LIKE. A fifth fact, and independent of the
  // other four on purpose: a high Domain Rating does not make a listing pass a
  // follow link, a free listing does not either, and an actionable route says
  // nothing about the anchor the listing eventually renders. This owner may
  // write none of those fields and none of them may write these.
  linkvalue: {
    directories: ['backlinkType', 'linkTargetType', 'listingIndexability', 'backlinkProvenance'],
    'directory-opportunities': ['backlinkType', 'linkTargetType', 'listingIndexability', 'backlinkProvenance'],
    marketplaces: ['backlinkType', 'linkTargetType', 'listingIndexability', 'backlinkProvenance'],
    media: ['backlinkType', 'linkTargetType', 'listingIndexability', 'backlinkProvenance'],
  },
  // Where does this record point, and is it still its own product? Owns the
  // canonical name because a rebrand is exactly a name change — and only with
  // a written decision behind it.
  redirect: {
    directories: ['website', 'name', 'currentStatus', 'lastVerified', 'note'],
    marketplaces: ['website', 'name', 'currentStatus', 'note'],
    media: ['website', 'name', 'currentStatus', 'lastVerified', 'shortNote'],
  },
  // A third-party measurement of the DOMAIN, and nothing about the record.
  //
  // Domain Rating describes a backlink profile. It says nothing about whether
  // the site answers, what a business can do there, or what that costs — so it
  // owns none of those fields and none of the owners above can write it back.
  // It cannot write `website` either: the domain a rating was measured on is
  // recorded inside the provenance, and a measurement is never a reason to
  // change where a record points.
  metrics: {
    // `metricStatus` travels with the measurement rather than beside it: the
    // registry validator refuses a populated metric on a record still marked
    // "unknown", so writing a rating without moving the status writes an
    // invalid record. It is owned here for that reason and no other.
    directories: ['domainRating', 'metricsProvenance', 'metricStatus'],
    'directory-opportunities': ['domainRating', 'metricsProvenance'],
    marketplaces: ['domainRating', 'metricsProvenance'],
    media: ['domainRating', 'metricsProvenance'],
    tenders: ['domainRating', 'metricsProvenance'],
    forums: ['domainRating', 'metricsProvenance'],
  },
  // A directly verified Forum finding owns the factual Forum record it
  // creates. Once accepted, later passes use their own narrower owners; this
  // contract is deliberately unavailable to every other collection.
  forumVerification: {
    forums: ['name', 'url', 'canonicalHost', 'forumBasePath', 'country',
      'languages', 'primaryLanguage', 'primaryTopic', 'topics', 'forumType',
      'status', 'lastVerifiedAt', 'software', 'description', 'verification'],
  },
};

// Fields no research pass may ever touch, whatever it claims to own. Listed
// separately so the prohibition is legible rather than implied by absence.
//
// `domainRating` used to be here, owned by nobody, because the only ratings in
// the corpus were hand-curated snapshots and no automated pass had any business
// touching them. It now has exactly ONE owner — `metrics` — which is stricter
// than it sounds: every other owner is still refused, so an accessibility or
// cost pass that tried to write a rating is rejected the same way it was
// before. What changed is that one named pass may write it, not that the field
// became open.
const NEVER = new Set([
  'id', 'country', 'category', 'tier', 'priority', 'audienceGeography',
  'categories', 'industries', 'languages', 'marketplaceType', 'sellerTypes',
  'intelligence', 'resourceIdentity', 'sources',
]);

class SafeApplyError extends Error {}

function ownedFields(owner, collection) {
  const byCollection = OWNERSHIP[owner];
  if (!byCollection) throw new SafeApplyError(`Unknown owner "${owner}".`);
  const fields = byCollection[collection];
  if (!fields) throw new SafeApplyError(`Owner "${owner}" has no contract for "${collection}".`);
  return fields;
}

// Write a patch onto a record, or refuse. Returns the fields that actually
// changed, so a caller can report real work rather than attempted work.
function applyPatch(record, patch, { owner, collection }) {
  const allowed = new Set(ownedFields(owner, collection));
  const changed = [];
  for (const [field, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (NEVER.has(field) && !(owner === 'forumVerification' && collection === 'forums')) {
      throw new SafeApplyError(`${owner} tried to write "${field}", which no research pass may change.`);
    }
    if (!allowed.has(field)) {
      throw new SafeApplyError(`${owner} tried to write "${field}" on ${collection}; it owns only: ${[...allowed].join(', ')}.`);
    }
    if (JSON.stringify(record[field]) === JSON.stringify(value)) continue;
    record[field] = value;
    changed.push(field);
  }
  return changed;
}

// ── 2. IDEMPOTENT NOTES ─────────────────────────────────────────────────────
//
// A procedural sentence is tagged with the pass that wrote it. Re-applying the
// same result finds its own previous sentence and replaces it, so the second
// run produces byte-identical output — which is the property that was missing
// when fifteen records ended up saying the same thing twice.
//
// Human sentences carry no tag and are never touched.
const TAG_OPEN = '[';
const TAG_CLOSE = ']';
const taggedBy = (owner) => new RegExp(`\\${TAG_OPEN}${owner}:\\d{4}-\\d{2}-\\d{2}\\${TAG_CLOSE}`);

// Sentences written before this module existed, recognised so a record can be
// migrated to tagged form exactly once instead of accumulating both.
const LEGACY_PROCEDURAL = [
  /^An automated browser check on \d{4}-\d{2}-\d{2}\b/i,
  /^Verified in a browser on \d{4}-\d{2}-\d{2}\b/i,
  /^Checked in a browser on \d{4}-\d{2}-\d{2}\b/i,
  /^A browser check on \d{4}-\d{2}-\d{2}\b/i,
  /^Audited on \d{4}-\d{2}-\d{2}\b/i,
  /^An actionability check on \d{4}-\d{2}-\d{2}\b/i,
  /^A browser pass on \d{4}-\d{2}-\d{2}\b/i,
  // The second half of a two-sentence consolidation note written before tags
  // existed. Without it, each run stripped the tagged first sentence, left this
  // one standing, and appended a fresh copy — the note grew by one sentence
  // every time the resolver ran.
  /^The surviving record is /i,
];

// A tagged sentence must BE one sentence. A period inside it ends the tag's
// reach, and everything after it survives the next strip and is appended again.
function assertSingleSentence(sentence, owner) {
  const inner = String(sentence).trim().replace(/\.$/, '');
  if (/\.\s/.test(inner)) {
    throw new SafeApplyError(`${owner} passed a multi-sentence note to amendNote: `
      + `"${String(sentence).slice(0, 80)}…". Only the first sentence would carry the tag, `
      + 'and the rest would accumulate on every re-run. Join it with a semicolon.');
  }
}

function splitSentences(text) {
  return String(text || '').trim().split(/(?<=\.)\s+/).filter(Boolean);
}

// Append or replace this owner's sentence. `legacy` opts into removing the
// untagged sentences a previous generation of the same pass wrote.
function amendNote(existing, sentence, { owner, date, legacy = true } = {}) {
  if (!owner || !date) throw new SafeApplyError('amendNote needs an owner and a date.');
  assertSingleSentence(sentence, owner);
  const mine = taggedBy(owner);
  const kept = splitSentences(existing).filter((s) => {
    if (mine.test(s)) return false;
    if (legacy && LEGACY_PROCEDURAL.some((re) => re.test(s))) return false;
    return true;
  });
  const tagged = `${TAG_OPEN}${owner}:${date}${TAG_CLOSE} ${String(sentence).trim()}`;
  return [...kept, tagged].join(' ').replace(/\s+/g, ' ').trim();
}

// Has this owner already spoken about this record?
function hasOwnerSentence(existing, owner) {
  return taggedBy(owner).test(String(existing || ''));
}

// PRECEDENCE. Two owners can hold contradictory views of the same record, and
// one of them is stale. `redirect` is terminal: once a case has been audited
// and resolved, an accessibility pass still holding "this looks like a redirect,
// someone should settle it" is describing work that is finished.
//
// This is not hypothetical — five consolidated records ended up carrying a
// resolution and a request to resolve them, side by side, from two owners that
// were each individually correct.
const OUTRANKS = { redirect: ['accessibility', 'actionability'] };

function isSettledBy(existing, owner) {
  return Object.entries(OUTRANKS)
    .some(([senior, juniors]) => juniors.includes(owner) && hasOwnerSentence(existing, senior));
}

// Precedence has to work in BOTH directions. Refusing to write a junior
// sentence stops the contradiction appearing next time; it does nothing about
// one already sitting in the record from before the case was settled. So when
// a senior owner resolves something, it retracts the junior sentences that ask
// for exactly what it just answered — and only those. A junior sentence saying
// "the site loads and serves its own content" is still true and stays.
const ASKS_FOR_RESOLUTION = /needed by a person to settle what this (entry|record) should point at|investigate (the )?redirect/i;

function retractSettled(text) {
  return splitSentences(text)
    .filter((sentence) => !ASKS_FOR_RESOLUTION.test(sentence))
    .join(' ').replace(/\s+/g, ' ').trim();
}

// A record with nothing further to say from this owner: drop its sentence and
// leave the human text alone.
function clearNote(existing, { owner, legacy = true } = {}) {
  const mine = taggedBy(owner);
  return splitSentences(existing).filter((s) => {
    if (mine.test(s)) return false;
    if (legacy && LEGACY_PROCEDURAL.some((re) => re.test(s))) return false;
    return true;
  }).join(' ').replace(/\s+/g, ' ').trim() || null;
}

// ── 3. NO DELETION ──────────────────────────────────────────────────────────
//
// A classifier may recommend; only a written removal decision may remove. The
// four states below are the only grounds, and each has to name its evidence.
const REMOVAL_DECISIONS = new Set([
  'CONFIRMED_DUPLICATE',
  'CONFIRMED_CLOSED',
  'CONFIRMED_WRONG_ONTOLOGY',
  'CONFIRMED_ACQUISITION_COLLAPSE',
]);

function assertNoDeletion(before, after, removals = []) {
  const beforeIds = new Set(before.map((r) => r.id));
  const afterIds = new Set(after.map((r) => r.id));
  const authorised = new Map(removals.map((d) => [d.id, d]));

  const gone = [...beforeIds].filter((id) => !afterIds.has(id));
  for (const id of gone) {
    const decision = authorised.get(id);
    if (!decision) {
      throw new SafeApplyError(`${id} was removed with no removal decision. `
        + 'A research classifier may recommend review; it may not prune the corpus.');
    }
    if (!REMOVAL_DECISIONS.has(decision.state)) {
      throw new SafeApplyError(`${id} was removed under "${decision.state}", which is not a removal decision.`);
    }
    if (!decision.evidence || String(decision.evidence).length < 20) {
      throw new SafeApplyError(`${id} was removed under ${decision.state} with no evidence recorded.`);
    }
  }
  return gone;
}

// ── 4. IDENTITY ─────────────────────────────────────────────────────────────
//
// Canonical identity is per collection, and both directory and marketplace
// schemas state it the same way: "two entries on one host in one country are
// the same platform listed twice". One host serving several countries through
// its own sections is how a regional platform is modelled here — encuentra24
// holds six such records, and findyello holds Barbados and Jamaica.
//
// Deduplicating by host alone would have deleted Barbados's entire directory
// coverage. It nearly did.
const TWO_LEVEL = new Set([
  'co.uk', 'org.uk', 'me.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au',
  'co.nz', 'com.br', 'com.mx', 'com.ar', 'co.jp', 'or.jp', 'co.kr', 'co.in',
  'co.za', 'com.sg', 'com.my', 'com.hk', 'com.tw', 'com.tr', 'com.cn', 'com.ua',
  'com.pl', 'com.ph', 'com.vn', 'co.id', 'com.eg', 'com.sa', 'com.ng', 'co.ke',
  'com.pk', 'com.cy', 'com.mt', 'co.il', 'com.co', 'com.pe', 'com.ve', 'com.do',
  'com.ec', 'com.uy', 'com.py', 'com.bo', 'com.gt', 'com.pa', 'co.tt', 'co.zm',
  'co.zw', 'co.bw', 'co.tz', 'com.na', 'com.lb',
]);

function registrable(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^www\./, '');
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  const lastTwo = parts.slice(-2).join('.');
  return TWO_LEVEL.has(lastTwo) ? parts.slice(-3).join('.') : lastTwo;
}

const URL_FIELD = {
  directories: 'website', marketplaces: 'website', media: 'website', tenders: 'officialUrl',
  forums: 'url',
};

// Directories, marketplaces and media key on country + host. Tenders key on
// country + host + path, because one institution runs several distinct
// procurement systems on one domain — AIIB's corporate and project procurement
// are different systems with different suppliers and different rules.
// IDENTITY USES THE FULL HOSTNAME, NOT THE REGISTRABLE DOMAIN.
//
// These are two different questions and conflating them breaks in both
// directions:
//
//   REDIRECT COMPARISON asks "did we land on a different SITE", and there a
//   subdomain is the same site — fr.avis-verifies.com is avis-verifies.com.
//
//   IDENTITY asks "is this the same PRODUCT", and there a subdomain routinely
//   is not: play.google.com and chromewebstore.google.com are different
//   products, and iub.gov.lv and eis.gov.lv are different institutions.
//
// Collapsing to the registrable domain reported both of those as duplicates.
// Both existing validators already key on the full hostname; this follows them
// rather than inventing a third rule.
function identityKey(collection, record) {
  const url = record[URL_FIELD[collection] || 'website'];
  let parsed = null;
  try { parsed = new URL(url); } catch { return `${record.country}|${record.id}`; }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  // A Forum entity is its canonical host plus the forum root path. This keeps
  // two genuinely separate hosted communities distinct while collapsing
  // category, topic, tracking and www variants of the same community.
  if (collection === 'forums') {
    const base = String(record.forumBasePath || parsed.pathname || '/')
      .replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
    return `${host}${base}`;
  }
  // Tenders additionally separate by path: one institution runs several
  // distinct procurement systems on one host, with different suppliers and
  // different rules.
  if (collection === 'tenders') {
    return `${record.country}|${host}${parsed.pathname.replace(/\/+$/, '')}`;
  }
  return `${record.country}|${host}`;
}

// ── 5. DRIFT ────────────────────────────────────────────────────────────────
//
// The fields a research pass must leave exactly as it found them, hashed so a
// pass can prove it did.
const CURATED = ['name', 'country', 'category', 'categories', 'industries',
  'languages', 'audienceGeography', 'tier', 'priority'];

function curatedFingerprint(rows, extra = []) {
  const out = new Map();
  for (const r of rows) {
    const picked = {};
    for (const f of [...CURATED, ...extra]) if (r[f] !== undefined) picked[f] = r[f];
    out.set(r.id, JSON.stringify(picked));
  }
  return out;
}

function diffFingerprints(before, after) {
  const changed = [];
  for (const [id, hash] of before) {
    if (after.has(id) && after.get(id) !== hash) changed.push(id);
  }
  return changed;
}

module.exports = {
  OWNERSHIP,
  NEVER,
  SafeApplyError,
  applyPatch,
  ownedFields,
  amendNote,
  clearNote,
  assertSingleSentence,
  hasOwnerSentence,
  isSettledBy,
  retractSettled,
  ASKS_FOR_RESOLUTION,
  OUTRANKS,
  taggedBy,
  LEGACY_PROCEDURAL,
  REMOVAL_DECISIONS,
  assertNoDeletion,
  registrable,
  identityKey,
  curatedFingerprint,
  diffFingerprints,
  CURATED,
};
