'use strict';

// CanadaBuys / AchatsCanada — Canadian federal tender notices, open data CSV.
//
// The only OFFICIAL_EXPORT source in the pilot: no API, one 6.3 MB file that
// PSPC republishes daily under the Open Government Licence – Canada. That
// makes it the simplest source to ingest and the one that most needs the
// safety rails, because a truncated download looks exactly like a shrinking
// procurement pipeline.
//
// Three properties worth stating:
//
//   The file IS the window. It contains the notices that are open, so every
//   record arrives with tenderStatus "Open" and there is nothing to filter by
//   publication date. One record in the probe closes in 2029; a 21-day
//   publication cut-off would have thrown it away for being posted early.
//
//   Deadlines are ZONELESS. "2029-03-31T13:00:00" with no offset, in a country
//   spanning six time zones — a 5½-hour spread between Newfoundland and the
//   Pacific. Appending "Z" would be a fabrication, so these deadlines are
//   displayed as published and never used to decide whether something is open.
//   The source's own status field decides that, which is stronger anyway.
//
//   The file publishes officer name, email, phone and fax in six columns. The
//   OGL-Canada explicitly excludes personal information from what it licenses,
//   so the licence and this repository's policy agree: dropped before parsing
//   completes.
//
// The file is bilingual by design — title-titre-eng and title-titre-fra are
// both official. FR readers get Canada's own French title, not ours.

const http = require('../to-http.cjs');
const TIME = require('../to-time.cjs');
const CLASS = require('../to-classification.cjs');
const SCHEMA = require('../to-schema.cjs');

// RFC 4180 parser. Written here rather than pulled in because this project has
// no dependencies and the format is small: quoted fields, doubled quotes, and
// embedded newlines — which this file genuinely uses, since descriptions run to
// paragraphs. A naive split('\n') sees 54,838 lines in a 908-record file.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let i = 0;
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // strip BOM

  while (i < s.length) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i += 1; continue;
      }
      field += c; i += 1; continue;
    }
    if (c === '"') { quoted = true; i += 1; continue; }
    if (c === ',') { row.push(field); field = ''; i += 1; continue; }
    if (c === '\r') { i += 1; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i += 1; continue; }
    field += c; i += 1;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];

  const header = rows[0];
  return rows.slice(1)
    .filter((r) => r.length > 1)
    .map((r) => Object.fromEntries(header.map((h, idx) => [h, r[idx] === undefined ? '' : r[idx]])));
}

const STATUS = {
  open: 'OPEN',
  active: 'OPEN',
  closed: 'CLOSED',
  cancelled: 'CANCELLED',
  canceled: 'CANCELLED',
  awarded: 'AWARDED',
  expired: 'CLOSED',
};

const NOTICE_TYPE = {
  'request for proposal': 'REQUEST_FOR_PROPOSAL',
  'request for quotation': 'REQUEST_FOR_QUOTATION',
  'request for information': 'PRIOR_INFORMATION',
  'request for supply arrangement': 'OTHER',
  'request for standing offer': 'OTHER',
  'rfp against supply arrangement': 'REQUEST_FOR_PROPOSAL',
  'invitation to qualify': 'EXPRESSION_OF_INTEREST',
  'invitation to tender': 'INVITATION_FOR_BIDS',
  'advance contract award notice': 'PRIOR_INFORMATION',
  'notice of proposed procurement': 'CONTRACT_NOTICE',
};

// Canadian provinces and territories as published in the CSV → ISO 3166-2:CA.
// Transcribed from ISO 3166-2; an unlisted string yields null rather than a
// guessed code.
const PROVINCE_CODE = {
  alberta: 'CA-AB', 'british columbia': 'CA-BC', manitoba: 'CA-MB', 'new brunswick': 'CA-NB',
  'newfoundland and labrador': 'CA-NL', 'northwest territories': 'CA-NT', 'nova scotia': 'CA-NS',
  nunavut: 'CA-NU', ontario: 'CA-ON', 'prince edward island': 'CA-PE', quebec: 'CA-QC',
  québec: 'CA-QC', saskatchewan: 'CA-SK', yukon: 'CA-YT',
};

async function fetchAll({ source, log }) {
  const text = await http.getText(source.endpoint);
  const raw = parseCsv(text);
  log(`canadabuys: parsed ${raw.length} rows from ${(text.length / 1048576).toFixed(1)} MB.`);
  // A single-artefact source is complete by construction: there is no page 2
  // to miss. The bytes-vs-records check that guards a truncated download lives
  // in the snapshot validator, where it can compare against the last good run.
  return { raw, pages: 1, population: raw.length, complete: true, endpoint: source.endpoint };
}

const trim = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

function normalize(r, { source, nowIso }) {
  const noticeId = trim(r['referenceNumber-numeroReference']);
  if (!noticeId) return null;
  const titleEn = trim(r['title-titre-eng']);
  const titleFr = trim(r['title-titre-fra']);
  const title = titleEn || titleFr;
  if (!title) return null;

  const titles = {};
  if (titleEn) titles.en = titleEn;
  if (titleFr) titles.fr = titleFr;

  // CanadaBuys serializes a multi-code cell as a NEWLINE-separated list with a
  // leading asterisk on each entry:
  //
  //     "*10191500\n*77121608"
  //
  // Splitting on commas and semicolons alone left that as a single token,
  // which then failed the numeric check in normalizeCode and was dropped
  // without a word. 778 of 921 rows — 84.5% — carry a UNSPSC code, and every
  // one was being discarded. That is most of the reason Canada showed zero
  // classified opportunities in the coverage analysis: a reader gap, not a
  // source gap.
  const codeList = (value) => String(value == null ? '' : value)
    .split(/[,;\n\r]+/)
    .map((c) => c.trim().replace(/^\*+/, '').trim())
    .filter(Boolean);

  const codes = [];
  for (const c of codeList(r.unspsc)) codes.push(['UNSPSC', c]);
  // GSIN is Canada's own goods-and-services identifier. It stays GSIN and is
  // never rewritten as UNSPSC or CPV: three taxonomies, no crosswalk.
  for (const c of codeList(r['gsin-nibs'])) codes.push(['GSIN', c]);

  const deadline = TIME.normalizeTimestamp(r['tenderClosingDate-appelOffresDateCloture']);
  const published = TIME.normalizeTimestamp(r['publicationDate-datePublication']);
  const amended = TIME.normalizeTimestamp(r['amendmentDate-dateModification']);

  const reported = STATUS[(trim(r['tenderStatus-appelOffresStatut-eng']) || '').toLowerCase()] || null;
  const noticeType = NOTICE_TYPE[(trim(r['noticeType-avisType-eng']) || '').toLowerCase()] || 'UNKNOWN';
  const { status, statusBasis } = SCHEMA.resolveStatus({ reportedStatus: reported, deadline, nowIso, noticeType });

  const province = (trim(r['contractingEntityAddressProvince-entiteContractanteAdresseProvince-eng']) || '').toLowerCase();

  // amendmentNumber "000" is the original. Anything else is a revision of the
  // same procurement, which is an amendment signal and NOT a new tender.
  const amendmentNumber = trim(r['amendmentNumber-numeroModification']);
  const isAmendment = Boolean(amendmentNumber) && !/^0+$/.test(amendmentNumber);

  return {
    id: SCHEMA.opportunityId(source.id, noticeId),
    sourceId: source.id,
    sourcePlatformId: source.platformId,
    sourceNoticeId: noticeId,
    sourceUrl: trim(r['noticeURL-URLavis-eng']) || trim(r['noticeURL-URLavis-fra'])
      || 'https://canadabuys.canada.ca/en/tender-opportunities',
    title,
    titles,
    descriptionSummary: trim(r['tenderDescription-descriptionAppelOffres-eng']),
    buyerName: trim(r['contractingEntityName-nomEntitContractante-eng'])
      || trim(r['contractingEntityName-nomEntitContractante-fra']),
    country: 'canada',
    subnationalJurisdiction: PROVINCE_CODE[province]
      ? { scheme: 'ISO-3166-2', code: PROVINCE_CODE[province] } : null,
    projectCountry: null,
    coverage: 'national',
    classifications: CLASS.normalizeCodes(codes),
    publicationDate: published,
    deadline,
    sourceModifiedDate: amended.precision === 'NONE' ? null : amended,
    status,
    statusBasis,
    noticeType,
    procedureType: trim(r['procurementMethod-methodeApprovisionnement-eng']),
    value: null, // the open-notice export publishes no contract value
    language: titleEn && titleFr ? 'en,fr' : (titleEn ? 'en' : 'fr'),
    lotCount: null,
    amendsNoticeId: null,
    isAmendment,
    // The buyer's own solicitation number. Distinct from the portal reference
    // and the strongest cross-system identity Canada publishes.
    officialReference: trim(r['solicitationNumber-numeroSollicitation']),
  };
}

module.exports = { id: 'canadabuys', parseCsv, STATUS, NOTICE_TYPE, PROVINCE_CODE, fetchAll, normalize };
