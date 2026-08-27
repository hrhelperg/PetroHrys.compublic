#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const CK = require('./lib/rc-checkpoint.cjs');
const SAFE = require('./lib/rc-safe-apply.cjs');
const F = require('./lib/forum-schema.cjs');

const ROOT = path.resolve(__dirname, '..');
const FINDINGS = path.join(ROOT, 'data/forums/research-findings.json');
const CANONICAL = path.join(ROOT, 'data/forums/forums.json');
const REPORT = path.join(ROOT, 'data/forums/apply-report.json');

function rank(finding) {
  const source = { 'discourse-discover': 3, 'stack-exchange-api': 2, 'forumotion-directory': 1 }[finding.discoverySource] || 0;
  const r = finding.record || {};
  return source * 100 + ((r.verification && r.verification.threadUrls || []).length * 10)
    + ((r.verification && r.verification.signals || []).length);
}

function chooseAccepted(findings) {
  const byIdentity = new Map();
  const consolidated = [];
  for (const finding of findings.filter((f) => f.state === 'ACCEPTED' && f.record)) {
    const identity = F.identityKey(finding.record);
    const previous = byIdentity.get(identity);
    if (!previous || rank(finding) > rank(previous)
      || (rank(finding) === rank(previous) && finding.key < previous.key)) {
      if (previous) consolidated.push({ identity, kept: finding.key, removed: previous.key });
      byIdentity.set(identity, finding);
    } else consolidated.push({ identity, kept: previous.key, removed: finding.key });
  }
  return { accepted: [...byIdentity.values()].sort((a, b) => a.identity.localeCompare(b.identity, 'en')), consolidated };
}

function apply() {
  fs.mkdirSync(path.dirname(CANONICAL), { recursive: true });
  const ledger = new CK.Ledger(FINDINGS);
  ledger.compact();
  const findings = ledger.all();
  const { accepted, consolidated } = chooseAccepted(findings);
  const before = fs.existsSync(CANONICAL) ? JSON.parse(fs.readFileSync(CANONICAL, 'utf8')) : [];
  const existing = new Map(before.map((r) => [F.identityKey(r), r]));
  const output = [];
  const touched = new Set();
  let added = 0; let updated = 0; let unchanged = 0;

  for (const finding of accepted) {
    const incoming = finding.record;
    const identity = F.identityKey(incoming);
    const old = existing.get(identity);
    const row = old ? JSON.parse(JSON.stringify(old)) : { id: incoming.id };
    const patch = {};
    for (const field of SAFE.ownedFields('forumVerification', 'forums')) patch[field] = incoming[field];
    const changed = SAFE.applyPatch(row, patch, { owner: 'forumVerification', collection: 'forums' });
    if (old) {
      if (changed.length) updated += 1; else unchanged += 1;
    } else added += 1;
    output.push(row);
    touched.add(identity);
  }

  // A rejection never deletes a previously accepted Forum. Removal needs a
  // separately evidenced decision under the shared no-deletion contract.
  for (const row of before) if (!touched.has(F.identityKey(row))) output.push(row);
  output.sort((a, b) => a.id.localeCompare(b.id, 'en'));
  SAFE.assertNoDeletion(before, output);
  F.validate(output);

  const text = `${JSON.stringify(output, null, 1)}\n`;
  const prior = fs.existsSync(CANONICAL) ? fs.readFileSync(CANONICAL, 'utf8') : null;
  if (prior !== text) CK.writeAtomic(CANONICAL, text);

  const tally = {};
  for (const finding of findings) tally[finding.state] = (tally[finding.state] || 0) + 1;
  const report = {
    candidatesResearched: findings.length,
    findings: Object.fromEntries(Object.entries(tally).sort()),
    acceptedFindings: findings.filter((f) => f.state === 'ACCEPTED').length,
    acceptedCanonical: output.length,
    duplicatesAndRedirectsConsolidated: consolidated.length,
    canonicalUntouchedByRejectedOrUnread: before.filter((r) => !touched.has(F.identityKey(r))).length,
  };
  CK.writeAtomic(REPORT, `${JSON.stringify(report, null, 1)}\n`);
  console.log('Forum apply:', Object.entries(report).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' '),
    `runtimeAdded=${added} runtimeUpdated=${updated} runtimeUnchanged=${unchanged}`);
  return report;
}

if (require.main === module) apply();
module.exports = { rank, chooseAccepted, apply };
