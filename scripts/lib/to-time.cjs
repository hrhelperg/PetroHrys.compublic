'use strict';

// Tender Opportunity Intelligence v1 — time normalization.
//
// ── WHY THIS IS ITS OWN MODULE ──────────────────────────────────────────────
//
// A deadline is the one field in this system where being wrong has a cost the
// user pays. If a normalization bug shifts a Tuesday 10:00 CET deadline into
// UTC and the page then says "closes in 2 days" about a tender that closed
// yesterday, we have not made a rounding error — we have told someone to
// prepare a bid for a procedure that is shut.
//
// The pilot sources hand over four genuinely different date shapes:
//
//   TED         "2026-09-16+02:00"        date + UTC OFFSET, no clock time
//   UK FTS      "2026-09-16T10:00:00Z"    full instant, explicit zone
//   CanadaBuys  "2026-09-16 14:00:00"     local clock, zone NOT stated
//   World Bank  "2026-08-28T00:00:00Z"    midnight instant + separate "02:00"
//   SECOP II    "2026-07-02T00:00:00.000" local clock, zone NOT stated
//
// Two of the five publish a wall-clock time with no zone attached. The
// tempting move is to append "Z" and move on. That is exactly the bug above.
//
// ── THE RULE ────────────────────────────────────────────────────────────────
//
// A normalized timestamp records THREE things, always:
//
//   raw       — the source string, byte for byte, never discarded
//   iso       — an ISO instant, ONLY when the source made the zone knowable
//   precision — INSTANT | DATE | ZONELESS | NONE
//
// When the zone is not knowable, `iso` stays null and `precision` is ZONELESS.
// Downstream, a ZONELESS deadline is never used to claim a tender is still
// open — it can only be shown as the source printed it. Losing a few records
// from the "closing soon" view is the correct trade against telling anyone a
// closed tender is open.
//
// DATE precision (TED's "2026-09-16+02:00") is a real date in a real offset
// with no clock time. It is resolved to the END of that day in the stated
// offset, because a submission deadline dated the 16th is not over at 00:00 on
// the 16th. That resolution is DERIVED and labelled as such.

const PRECISIONS = ['INSTANT', 'DATE', 'ZONELESS', 'NONE'];

const EMPTY = Object.freeze({ raw: null, iso: null, precision: 'NONE', derived: false });

// Full instant with explicit zone: 2026-09-16T10:00:00Z / +02:00 / -05:00
const RE_INSTANT = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?)\s*(Z|[+-]\d{2}:?\d{2})$/;
// Date with a zone but no clock: 2026-09-16+02:00 — and 2026-09-16Z, which TED
// emits for lots whose deadline is expressed in UTC. The first version of this
// pattern accepted only a numeric offset, so a bare "Z" date fell through to
// precision NONE and a real, resolvable deadline was silently discarded.
const RE_DATE_OFFSET = /^(\d{4}-\d{2}-\d{2})(Z|[+-]\d{2}:?\d{2})$/;
// Local clock, no zone: 2026-09-16T14:00:00 / 2026-09-16 14:00:00.000
const RE_ZONELESS_DT = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?)$/;
// Bare date, no zone at all: 2026-09-16
const RE_BARE_DATE = /^(\d{4}-\d{2}-\d{2})$/;
// The World Bank prints "11-Aug-2026" in its noticedate field.
const RE_DMY = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/;
const MONTHS = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };

const pad = (o) => (o === 'Z' ? 'Z' : (o.length === 5 ? `${o.slice(0, 3)}:${o.slice(3)}` : o));

// Parse one source timestamp. Never throws: an unparseable string is recorded
// as raw with precision NONE, which is information, not a failure.
function normalizeTimestamp(value) {
  if (value === null || value === undefined) return EMPTY;
  const raw = String(value).trim();
  if (!raw) return EMPTY;

  let m = RE_INSTANT.exec(raw);
  if (m) {
    const iso = new Date(`${m[1]}T${m[2].length === 5 ? `${m[2]}:00` : m[2]}${pad(m[3])}`);
    if (Number.isNaN(iso.getTime())) return { raw, iso: null, precision: 'NONE', derived: false };
    return { raw, iso: iso.toISOString(), precision: 'INSTANT', derived: false };
  }

  m = RE_DATE_OFFSET.exec(raw);
  if (m) {
    // End of the stated day in the stated offset. DERIVED, and flagged.
    const iso = new Date(`${m[1]}T23:59:59${pad(m[2])}`);
    if (Number.isNaN(iso.getTime())) return { raw, iso: null, precision: 'NONE', derived: false };
    return { raw, iso: iso.toISOString(), precision: 'DATE', derived: true };
  }

  m = RE_DMY.exec(raw);
  if (m) {
    const mm = MONTHS[m[2].toLowerCase()];
    if (!mm) return { raw, iso: null, precision: 'NONE', derived: false };
    // No zone stated anywhere in the World Bank payload for this field.
    return { raw, iso: null, precision: 'ZONELESS', derived: false, localDate: `${m[3]}-${mm}-${m[1]}` };
  }

  m = RE_ZONELESS_DT.exec(raw);
  if (m) return { raw, iso: null, precision: 'ZONELESS', derived: false, localDate: m[1], localTime: m[2] };

  m = RE_BARE_DATE.exec(raw);
  if (m) return { raw, iso: null, precision: 'ZONELESS', derived: false, localDate: m[1] };

  return { raw, iso: null, precision: 'NONE', derived: false };
}

// Is this timestamp usable for an OPEN/CLOSED decision?
//
// Only INSTANT and DATE are. ZONELESS is displayable but not decidable: the
// window between the earliest and latest plausible zone is 26 hours, which is
// wider than the "closing soon" threshold this product uses.
function isDecidable(ts) {
  return Boolean(ts) && (ts.precision === 'INSTANT' || ts.precision === 'DATE') && Boolean(ts.iso);
}

// Whole days from `nowIso` to the deadline, or null when undecidable.
// Deliberately floor()ed: 1.9 days left is "1 day", never "2".
function daysUntil(ts, nowIso) {
  if (!isDecidable(ts)) return null;
  const then = Date.parse(ts.iso);
  const now = Date.parse(nowIso);
  if (Number.isNaN(then) || Number.isNaN(now)) return null;
  return Math.floor((then - now) / 86400000);
}

function hasPassed(ts, nowIso) {
  if (!isDecidable(ts)) return null; // null means "cannot say", not "no"
  return Date.parse(ts.iso) < Date.parse(nowIso);
}

// A source may split date and time across two fields — the World Bank does
// exactly this (submission_deadline_date + submission_deadline_time). Joining
// them does NOT create zone knowledge that neither field had.
function combineDateAndTime(dateValue, timeValue) {
  const d = normalizeTimestamp(dateValue);
  if (!timeValue || d.precision === 'NONE') return d;
  const time = String(timeValue).trim();
  if (!/^\d{1,2}:\d{2}$/.test(time)) return d;
  const hhmm = time.padStart(5, '0');
  // The date arrived as a UTC midnight instant, but the clock time it pairs
  // with is a LOCAL office time ("02:00" against a Nigerian address). Pairing
  // them yields a wall clock in an unstated zone — ZONELESS, by definition.
  const day = d.iso ? d.iso.slice(0, 10) : d.localDate;
  if (!day) return d;
  return { raw: `${d.raw} ${time}`, iso: null, precision: 'ZONELESS', derived: false, localDate: day, localTime: hhmm };
}

module.exports = {
  PRECISIONS, EMPTY, normalizeTimestamp, isDecidable, daysUntil, hasPassed, combineDateAndTime,
};
