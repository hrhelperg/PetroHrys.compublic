'use strict';

// A minimal ZIP reader, because Germany publishes OCDS only as a ZIP archive.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
//
// oeffentlichevergabe.de — the German federal notice service — offers its data
// in four content types, and every one of them is a ZIP:
//
//   application/vnd.bekanntmachungsservice.ocds.zip+zip
//   application/vnd.bekanntmachungsservice.ocds2.zip+zip
//   application/vnd.bekanntmachungsservice.eforms.zip+zip
//   application/vnd.bekanntmachungsservice.csv.zip+zip
//
// Asking for application/json returns 406. There is no uncompressed option, so
// reading the archive is the price of the largest procurement market in the EU.
//
// This project has no dependencies and is not going to acquire one to unzip a
// file. Node ships `zlib`, which does the hard part; what it does not ship is
// the container format. That container is small: a sequence of local file
// headers, each followed by its compressed bytes, and a central directory at
// the end that repeats the same information.
//
// ── WHAT THIS SUPPORTS, AND WHAT IT REFUSES ─────────────────────────────────
//
// Reads the CENTRAL DIRECTORY rather than scanning local headers. Local
// headers may carry zeroed sizes with the real values in a trailing data
// descriptor, which is exactly the shape that makes a naive forward scan
// silently truncate. The central directory always has the true sizes.
//
// Supports stored (method 0) and deflate (method 8), which is everything a
// real-world data export uses. Anything else throws by name rather than
// returning a corrupted buffer — a wrong-looking error beats a plausible-
// looking empty archive, which is the same principle the snapshot validator
// runs on.
//
// ZIP64 is not supported and says so. It would matter above 65,535 entries or
// 4 GB, and a day of German procurement notices is 1,153 files in 2 MB.

const zlib = require('node:zlib');

const SIG_EOCD = 0x06054b50;      // end of central directory
const SIG_CENTRAL = 0x02014b50;   // central directory file header
const SIG_ZIP64_EOCD = 0x06064b50;

function findEndOfCentralDirectory(buf) {
  // The EOCD is at the end, after a comment of up to 65,535 bytes. Scanned
  // backwards, which is both correct and fast for the common no-comment case.
  const min = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= min; i -= 1) {
    if (buf.readUInt32LE(i) === SIG_EOCD) return i;
  }
  return -1;
}

// Read every entry. Returns [{ name, data }] with `data` as a Buffer.
function readZip(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (buf.length < 22) throw new Error('Not a ZIP archive: too short');

  const eocd = findEndOfCentralDirectory(buf);
  if (eocd === -1) throw new Error('Not a ZIP archive: no end-of-central-directory record');

  const entryCount = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);

  if (entryCount === 0xffff || offset === 0xffffffff) {
    throw new Error('ZIP64 archives are not supported by this reader');
  }
  if (buf.readUInt32LE(eocd - 20) === SIG_ZIP64_EOCD) {
    throw new Error('ZIP64 archives are not supported by this reader');
  }

  const entries = [];
  for (let i = 0; i < entryCount; i += 1) {
    if (buf.readUInt32LE(offset) !== SIG_CENTRAL) {
      throw new Error(`Corrupt central directory at entry ${i}`);
    }
    const method = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const uncompressedSize = buf.readUInt32LE(offset + 24);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localOffset = buf.readUInt32LE(offset + 42);
    const name = buf.toString('utf8', offset + 46, offset + 46 + nameLen);

    // Skip directory entries, which carry a trailing slash and no content.
    if (!name.endsWith('/')) {
      // The local header repeats the name and extra field with its OWN
      // lengths, which routinely differ from the central directory's. Reading
      // the central directory's lengths here is a classic off-by-a-few bug.
      const localNameLen = buf.readUInt16LE(localOffset + 26);
      const localExtraLen = buf.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localNameLen + localExtraLen;
      const raw = buf.subarray(start, start + compressedSize);

      let data;
      if (method === 0) data = Buffer.from(raw);
      else if (method === 8) data = zlib.inflateRawSync(raw);
      else throw new Error(`Unsupported ZIP compression method ${method} for "${name}"`);

      if (uncompressedSize && data.length !== uncompressedSize) {
        throw new Error(`"${name}" decompressed to ${data.length} bytes, expected ${uncompressedSize}`);
      }
      entries.push({ name, data });
    }
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

// Every .json entry, parsed. Entries that are not JSON are reported rather
// than skipped: a change in the archive's contents should be visible.
function readJsonEntries(buffer) {
  const out = [];
  const failed = [];
  for (const e of readZip(buffer)) {
    if (!e.name.toLowerCase().endsWith('.json')) continue;
    try { out.push({ name: e.name, json: JSON.parse(e.data.toString('utf8')) }); } catch (err) {
      failed.push({ name: e.name, error: err.message });
    }
  }
  return { entries: out, failed };
}

module.exports = { readZip, readJsonEntries, findEndOfCentralDirectory };
