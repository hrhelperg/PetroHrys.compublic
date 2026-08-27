#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const CK = require('./lib/rc-checkpoint.cjs');
const SAFE = require('./lib/rc-safe-apply.cjs');
const F = require('./lib/forum-schema.cjs');
const V2 = require('./lib/forum-link-schema.cjs');

const ROOT = path.resolve(__dirname, '..');
const FINDINGS = path.join(ROOT, 'data/forums/forum-link-value-findings.json');
const CANONICAL = path.join(ROOT, 'data/forums/forums.json');
const REPORT = path.join(ROOT, 'data/forums/forum-link-value-apply-report.json');

const KNOWN = (value) => value !== null && value !== undefined && value !== 'UNKNOWN';

function richerValue(previous, incoming) {
  return KNOWN(incoming) ? incoming : previous;
}

function mergeSurface(previous, incoming) {
  if (!previous) return incoming;
  if (!incoming) return previous;
  if (incoming.backlinkType === 'UNKNOWN' && previous.backlinkType !== 'UNKNOWN') return previous;
  if (incoming.availability === 'UNKNOWN' && previous.availability !== 'UNKNOWN') return previous;
  return {
    ...previous,
    ...incoming,
    evidenceUrl: incoming.evidenceUrl || previous.evidenceUrl,
    observedAt: incoming.observedAt || previous.observedAt,
    relTokens: incoming.relInspected ? incoming.relTokens : previous.relTokens,
    backlinkTypesObserved: incoming.backlinkTypesObserved.length
      ? incoming.backlinkTypesObserved : previous.backlinkTypesObserved,
  };
}

function mergeEvidence(previous, incoming) {
  if (!previous) return incoming;
  const participation = {};
  for (const key of ['registrationAccess', 'registrationCost', 'threadCreation', 'replyPosting']) {
    participation[key] = richerValue(previous.participation[key], incoming.participation[key]);
  }
  participation.restrictionFacts = [...new Set([
    ...(previous.participation.restrictionFacts || []), ...(incoming.participation.restrictionFacts || []),
  ])].sort();
  const surfaces = {};
  for (const name of V2.SURFACES) {
    surfaces[name] = mergeSurface(previous.linkSurfaces[name], incoming.linkSurfaces[name]);
  }
  const urls = {};
  for (const key of Object.keys(previous.evidenceUrls)) {
    urls[key] = incoming.evidenceUrls[key] || previous.evidenceUrls[key] || null;
  }
  return {
    ...previous,
    ...incoming,
    participation,
    publicProfile: incoming.publicProfile.discoveryState === 'UNKNOWN'
      ? previous.publicProfile : { ...previous.publicProfile, ...incoming.publicProfile,
        representativeUrl: incoming.publicProfile.representativeUrl || previous.publicProfile.representativeUrl,
        canonicalUrl: incoming.publicProfile.canonicalUrl || previous.publicProfile.canonicalUrl },
    threadPage: incoming.threadPage.indexability === 'UNKNOWN'
      ? previous.threadPage : { ...previous.threadPage, ...incoming.threadPage,
        representativeUrl: incoming.threadPage.representativeUrl || previous.threadPage.representativeUrl,
        canonicalUrl: incoming.threadPage.canonicalUrl || previous.threadPage.canonicalUrl },
    linkSurfaces: surfaces,
    evidenceUrls: urls,
  };
}

function v1Projection(rows) {
  return rows.map((r) => ({
    id: r.id, name: r.name, url: r.url, canonicalHost: r.canonicalHost,
    forumBasePath: r.forumBasePath, country: r.country, languages: r.languages,
    primaryLanguage: r.primaryLanguage, primaryTopic: r.primaryTopic, topics: r.topics,
    forumType: r.forumType, status: r.status, lastVerifiedAt: r.lastVerifiedAt,
    software: r.software, description: r.description, verification: r.verification,
    domainRating: r.domainRating, metricsProvenance: r.metricsProvenance,
  }));
}

function apply() {
  V2.assertCohortParity();
  const ledger = new CK.Ledger(FINDINGS);
  ledger.compact();
  const findings = ledger.all();
  const before = F.load(CANONICAL);
  const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/forums/protected-v2-baseline.json'), 'utf8'));
  if (V2.sha256(JSON.stringify(v1Projection(before))) !== baseline.forumV1ProjectionSha256) {
    throw new Error('Forum V1 projection drifted before V2 apply.');
  }
  const byId = new Map(findings.map((finding) => [finding.id, finding]));
  const output = JSON.parse(JSON.stringify(before));
  let written = 0; let unchanged = 0;
  for (const row of output) {
    const finding = byId.get(row.id);
    if (!finding) continue;
    V2.validateEvidence(finding.evidence);
    const next = mergeEvidence(row.forumLinkValue, finding.evidence);
    V2.validateEvidence(next);
    const changed = SAFE.applyPatch(row, { forumLinkValue: next },
      { owner: 'forumLinkValue', collection: 'forums' });
    if (changed.length) written += 1; else unchanged += 1;
  }
  F.validate(output);
  if (V2.sha256(JSON.stringify(v1Projection(output))) !== baseline.forumV1ProjectionSha256) {
    throw new Error('Forum V2 apply changed a protected V1 field.');
  }
  const text = `${JSON.stringify(output, null, 1)}\n`;
  if (fs.readFileSync(CANONICAL, 'utf8') !== text) CK.writeAtomic(CANONICAL, text);
  const report = {
    findings: findings.length,
    appliedRecords: output.filter((r) => r.forumLinkValue).length,
    cohortAttempted: findings.filter((f) => V2.cohortRows(before).some((r) => r.id === f.id)).length,
    v1ProjectionSha256: baseline.forumV1ProjectionSha256,
  };
  CK.writeAtomic(REPORT, `${JSON.stringify(report, null, 1)}\n`);
  console.log(`Forum Link Value apply: findings=${report.findings} applied=${report.appliedRecords} `
    + `cohortAttempted=${report.cohortAttempted} runtimeWritten=${written} runtimeUnchanged=${unchanged}`);
  return report;
}

if (require.main === module) apply();
module.exports = { richerValue, mergeSurface, mergeEvidence, v1Projection, apply };
