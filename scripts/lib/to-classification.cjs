'use strict';

// Tender Opportunity Intelligence v1 — classification namespaces.
//
// ── WHY NOT "JUST USE CPV" ──────────────────────────────────────────────────
//
// CPV is the right primary signal for Europe and useless everywhere else. The
// pilot's five sources speak three different vocabularies:
//
//   TED, UK FTS   CPV     8-digit, EU Regulation (EC) No 213/2008
//   CanadaBuys    UNSPSC  8-digit, plus GSIN (a Canadian-only scheme)
//   SECOP II      UNSPSC  8-digit, prefixed "V1."
//   World Bank    none    procurement_group is a method, not a subject code
//
// Forcing UNSPSC into CPV would require a crosswalk this repository does not
// have and cannot verify. Inventing one would produce confident nonsense: the
// two schemes cut the world at different joints, and a wrong crosswalk shows
// up as a construction firm being recommended a software contract.
//
// So classification is modelled as {scheme, code, label} and matching happens
// PER SCHEME. A profile declares which divisions/segments it cares about in
// each scheme it understands, and a notice classified in a scheme no profile
// understands simply produces no classification signal — which is honest, and
// visible, rather than a silent zero.
//
// ── PROVENANCE OF THE REFERENCE LABELS ──────────────────────────────────────
//
// Two small reference tables are embedded here. Both are the top level of a
// public, stable, official classification, transcribed — not derived, not
// crosswalked, not downloaded from a third-party mapping repository.
//
//   CPV divisions (2-digit)
//     Source:  Commission Regulation (EC) No 213/2008, Annex I
//     Version: CPV 2008 (the version TED and FTS both publish against)
//     Scope:   45 divisions. Nothing below division level is asserted here.
//
//   UNSPSC segments (2-digit)
//     Source:  UNSPSC published segment titles (GS1 US)
//     Version: segment level only, which has been stable across UNSPSC releases
//     Scope:   54 segments. Nothing below segment level is asserted here.
//
// Deliberately shallow. A division/segment label is a fact that can be checked
// against the regulation in a minute. A full 9,454-code CPV tree would be more
// useful and could not be verified by anyone reading this file, so it is not
// here. When finer granularity is genuinely needed, the honest move is to load
// the official published file with its own version stamp — not to deepen this
// table by hand.

const SCHEMES = ['CPV', 'UNSPSC', 'GSIN'];

// CPV 2008 divisions — Commission Regulation (EC) No 213/2008, Annex I.
const CPV_DIVISIONS = {
  '03': 'Agricultural, farming, fishing, forestry and related products',
  '09': 'Petroleum products, fuel, electricity and other sources of energy',
  14: 'Mining, basic metals and related products',
  15: 'Food, beverages, tobacco and related products',
  16: 'Agricultural machinery',
  18: 'Clothing, footwear, luggage articles and accessories',
  19: 'Leather and textile fabrics, plastic and rubber materials',
  22: 'Printed matter and related products',
  24: 'Chemical products',
  30: 'Office and computing machinery, equipment and supplies except furniture and software packages',
  31: 'Electrical machinery, apparatus, equipment and consumables; lighting',
  32: 'Radio, television, communication, telecommunication and related equipment',
  33: 'Medical equipments, pharmaceuticals and personal care products',
  34: 'Transport equipment and auxiliary products to transportation',
  35: 'Security, fire-fighting, police and defence equipment',
  37: 'Musical instruments, sport goods, games, toys, handicraft, art materials and accessories',
  38: 'Laboratory, optical and precision equipments (excl. glasses)',
  39: 'Furniture, furnishings, domestic appliances and cleaning products',
  41: 'Collected and purified water',
  42: 'Industrial machinery',
  43: 'Machinery for mining, quarrying, construction equipment',
  44: 'Construction structures and materials; auxiliary products to construction',
  45: 'Construction work',
  48: 'Software package and information systems',
  50: 'Repair and maintenance services',
  51: 'Installation services (except software)',
  55: 'Hotel, restaurant and retail trade services',
  60: 'Transport services (excl. Waste transport)',
  63: 'Supporting and auxiliary transport services; travel agencies services',
  64: 'Postal and telecommunications services',
  65: 'Public utilities',
  66: 'Financial and insurance services',
  70: 'Real estate services',
  71: 'Architectural, construction, engineering and inspection services',
  72: 'IT services: consulting, software development, Internet and support',
  73: 'Research and development services and related consultancy services',
  75: 'Administration, defence and social security services',
  76: 'Services related to the oil and gas industry',
  77: 'Agricultural, forestry, horticultural, aquacultural and apicultural services',
  79: 'Business services: law, marketing, consulting, recruitment, printing and security',
  80: 'Education and training services',
  85: 'Health and social work services',
  90: 'Sewage-, refuse-, cleaning-, and environmental services',
  92: 'Recreational, cultural and sporting services',
  98: 'Other community, social and personal services',
};

// UNSPSC segments — published segment titles, segment level only.
const UNSPSC_SEGMENTS = {
  10: 'Live Plant and Animal Material and Accessories and Supplies',
  11: 'Mineral and Textile and Inedible Plant and Animal Materials',
  12: 'Chemicals including Bio Chemicals and Gas Materials',
  13: 'Resin and Rosin and Rubber and Foam and Film and Elastomeric Materials',
  14: 'Paper Materials and Products',
  15: 'Fuels and Fuel Additives and Lubricants and Anti corrosive Materials',
  20: 'Mining and Well Drilling Machinery and Accessories',
  21: 'Farming and Fishing and Forestry and Wildlife Machinery and Accessories',
  22: 'Building and Construction Machinery and Accessories',
  23: 'Industrial Manufacturing and Processing Machinery and Accessories',
  24: 'Material Handling and Conditioning and Storage Machinery and their Accessories and Supplies',
  25: 'Commercial and Military and Private Vehicles and their Accessories and Components',
  26: 'Power Generation and Distribution Machinery and Accessories',
  27: 'Tools and General Machinery',
  30: 'Structures and Building and Construction and Manufacturing Components and Supplies',
  31: 'Manufacturing Components and Supplies',
  32: 'Electronic Components and Supplies',
  39: 'Electrical Systems and Lighting and Components and Accessories and Supplies',
  40: 'Distribution and Conditioning Systems and Equipment and Components',
  41: 'Laboratory and Measuring and Observing and Testing Equipment and Supplies',
  42: 'Medical Equipment and Accessories and Supplies',
  43: 'Information Technology Broadcasting and Telecommunications',
  44: 'Office Equipment and Accessories and Supplies',
  45: 'Printing and Photographic and Audio and Visual Equipment and Supplies',
  46: 'Defense and Law Enforcement and Security and Safety Equipment and Supplies',
  47: 'Cleaning Equipment and Supplies',
  48: 'Service Industry Machinery and Equipment and Supplies',
  49: 'Sports and Recreational Equipment and Supplies and Accessories',
  50: 'Food Beverage and Tobacco Products',
  51: 'Drugs and Pharmaceutical Products',
  52: 'Domestic Appliances and Supplies and Consumer Electronic Products',
  53: 'Apparel and Luggage and Personal Care Products',
  54: 'Timepieces and Jewelry and Gemstone Products',
  55: 'Published Products',
  56: 'Furniture and Furnishings',
  60: 'Musical Instruments and Games and Toys and Arts and Crafts and Educational Equipment and Materials and Accessories and Supplies',
  70: 'Farming and Fishing and Forestry and Wildlife Contracting Services',
  71: 'Mining and Oil and Gas Services',
  72: 'Building and Facility Construction and Maintenance Services',
  73: 'Industrial Production and Manufacturing Services',
  76: 'Industrial Cleaning Services',
  77: 'Environmental Services',
  78: 'Transportation and Storage and Mail Services',
  80: 'Management and Business Professionals and Administrative Services',
  81: 'Engineering and Research and Technology Based Services',
  82: 'Editorial and Design and Graphic and Fine Art Services',
  83: 'Public Utilities and Public Sector Related Services',
  84: 'Financial and Insurance Services',
  85: 'Healthcare Services',
  86: 'Education and Training Services',
  90: 'Travel and Food and Lodging and Entertainment Services',
  91: 'Personal and Domestic Services',
  92: 'National Defense and Public Order and Security and Safety Services',
  93: 'Politics and Civic Affairs Services',
  94: 'Organizations and Clubs',
};

const REFERENCE_PROVENANCE = {
  CPV: { source: 'Commission Regulation (EC) No 213/2008, Annex I', version: 'CPV 2008', level: 'division (2-digit)', entries: Object.keys(CPV_DIVISIONS).length },
  UNSPSC: { source: 'UNSPSC published segment titles', version: 'segment level', level: 'segment (2-digit)', entries: Object.keys(UNSPSC_SEGMENTS).length },
  GSIN: { source: null, version: null, level: 'code retained, no label asserted', entries: 0 },
};

// Normalize one raw code into {scheme, code, top, label}.
//
// `top` is the division/segment — the level at which matching happens and the
// only level for which a label is asserted. A code whose top level is not in
// the reference table keeps its code and gets a null label: an unknown code is
// still a usable identity and still deduplicates, it just cannot be named.
function normalizeCode(scheme, rawCode) {
  if (!SCHEMES.includes(scheme)) return null;
  if (rawCode === null || rawCode === undefined) return null;

  let code = String(rawCode).trim().toUpperCase();
  if (!code) return null;
  // SECOP II prefixes every UNSPSC commodity code with "V1." — a portal
  // artefact, not part of the code.
  code = code.replace(/^V\d+\./, '');
  // CPV codes may carry a "-9" style check digit suffix.
  code = code.replace(/-\d$/, '');
  if (!/^\d{2,10}$/.test(code)) {
    // GSIN is alphanumeric (e.g. "N5895"). Retained as an opaque identity.
    if (scheme === 'GSIN' && /^[A-Z0-9]{2,10}$/.test(code)) {
      return { scheme, code, top: null, label: null };
    }
    return null;
  }

  const top = code.slice(0, 2);
  let label = null;
  if (scheme === 'CPV') label = CPV_DIVISIONS[top] || CPV_DIVISIONS[Number(top)] || null;
  if (scheme === 'UNSPSC') label = UNSPSC_SEGMENTS[top] || UNSPSC_SEGMENTS[Number(top)] || null;
  return { scheme, code, top, label };
}

// Deduplicate and order a set of codes deterministically. A TED notice repeats
// its CPV once per lot; six copies of "90510000" is not six signals.
function normalizeCodes(pairs) {
  const seen = new Map();
  for (const [scheme, raw] of pairs || []) {
    const c = normalizeCode(scheme, raw);
    if (!c) continue;
    const key = `${c.scheme}:${c.code}`;
    if (!seen.has(key)) seen.set(key, c);
  }
  return [...seen.values()].sort((a, b) => (a.scheme === b.scheme
    ? (a.code < b.code ? -1 : 1)
    : (a.scheme < b.scheme ? -1 : 1)));
}

// The set of top-level divisions/segments a notice touches, per scheme.
function topsByScheme(classifications) {
  const out = {};
  for (const c of classifications || []) {
    if (!c.top) continue;
    (out[c.scheme] = out[c.scheme] || new Set()).add(c.top);
  }
  return out;
}

module.exports = {
  SCHEMES, CPV_DIVISIONS, UNSPSC_SEGMENTS, REFERENCE_PROVENANCE,
  normalizeCode, normalizeCodes, topsByScheme,
};
