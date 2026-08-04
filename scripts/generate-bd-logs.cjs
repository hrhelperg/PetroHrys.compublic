// scripts/generate-bd-logs.cjs
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { PATHS, writeIfChanged } = require('./lib/bd-util.cjs');
const { loadRegistry } = require('./lib/bd-registry.cjs');
const { sortDirectories } = require('./lib/bd-sort.cjs');

// Generates the verification log and editorial changelog FROM the registry, so
// neither can drift from the data it describes. Deterministic: no timestamps.

const SOURCE_LABELS = {
  'official-website': 'Official website',
  'official-documentation': 'Official documentation',
  'government-register': 'Government register',
  'manual-verification': 'Manual verification',
  other: 'Other',
};

function run(outRoot = PATHS.siteRoot) {
  const registry = loadRegistry();
  const all = sortDirectories(registry.directories);

  const rows = all.map((d) => {
    const reviewers = (d.verification.reviewers || []).map((r) => r.name).join(', ') || '—';
    const source = SOURCE_LABELS[d.verification.source] || '—';
    return `| ${d.name} | ${d.country} | ${d.verification.status} | ${source} | ${d.lastVerified || '—'} | ${d.nextVerification || '—'} | ${reviewers} |`;
  });

  const log = `# Business Directories — verification log

Generated from the registry by \`scripts/generate-bd-logs.cjs\`. Do not edit by hand.

Every published record must carry a verification status, a source, a date and at
least one named reviewer; the validator refuses a \`verified\` record that is
missing any of them.

**${all.length} records.**

| Directory | Country | Status | Source | Last verified | Next due | Reviewer |
|---|---|---|---|---|---|---|
${rows.join('\n')}
`;

  const byDate = {};
  for (const d of all) (byDate[d.lastVerified] = byDate[d.lastVerified] || []).push(d);
  const dates = Object.keys(byDate).sort().reverse();

  const entries = dates.map((date) => {
    const items = sortDirectories(byDate[date])
      .map((d) => `- **${d.name}** — ${d.country} / ${d.category} — PetroHrys Score ${d.petroHrysScore ?? '—'}`)
      .join('\n');
    return `## ${date}\n\n${byDate[date].length} directories added or re-verified.\n\n${items}\n`;
  });

  const changelog = `# Business Directories — editorial changelog

Generated from the registry by \`scripts/generate-bd-logs.cjs\`. Do not edit by hand.

Entries are grouped by verification date, newest first.

${entries.join('\n')}`;

  const a = writeIfChanged(path.join(outRoot, 'docs', 'business-directories-verification-log.md'), log);
  const b = writeIfChanged(path.join(outRoot, 'docs', 'business-directories-changelog.md'), changelog);
  return { records: all.length, changed: [a, b].filter(Boolean).length };
}

if (require.main === module) {
  const r = run();
  console.log(`Verification log and changelog cover ${r.records} records; ${r.changed} file(s) updated.`);
}

module.exports = { run };
