#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const F = require('./lib/forum-schema.cjs');
const V2 = require('./lib/forum-link-schema.cjs');
const CK = require('./lib/rc-checkpoint.cjs');

const ROOT = path.resolve(__dirname, '..');
const CANONICAL = path.join(ROOT, 'data/forums/forums.json');
const FINDINGS = path.join(ROOT, 'data/forums/forum-link-value-findings.json');
const OUT = path.join(ROOT, 'data/forums/forum-link-value-report.json');
const PRIORITY_TOPICS = new Set(['BUSINESS_ENTREPRENEURSHIP', 'MARKETING_SEO_GROWTH',
  'ECOMMERCE_MARKETPLACES', 'TECHNOLOGY_SOFTWARE', 'PROGRAMMING_DEVELOPMENT', 'TELECOM_VOIP']);

const distribution = (values, states) => Object.fromEntries(states.map((state) =>
  [state, values.filter((value) => value === state).length]));

function evidenceOf(row) { return row.forumLinkValue || V2.emptyEvidence(row.lastVerifiedAt); }
function surfaceOf(row, name) { return evidenceOf(row).linkSurfaces[name]; }
function countWhere(rows, predicate) { return rows.filter(predicate).length; }
function normalProfileSurface(row) {
  const surface = surfaceOf(row, 'PROFILE_WEBSITE');
  return surface.scope === 'STAFF_OR_MODERATOR' ? V2.surfaceEmpty() : surface;
}

function segment(rows) {
  return {
    attempted: rows.length,
    read: countWhere(rows, (row) => evidenceOf(row).attemptState === 'READ'),
    registrationOpen: countWhere(rows, (row) => evidenceOf(row).participation.registrationAccess === 'OPEN'),
    registrationFree: countWhere(rows, (row) => evidenceOf(row).participation.registrationCost === 'FREE'),
    threadCreationAvailable: countWhere(rows, (row) => evidenceOf(row).participation.threadCreation === 'AVAILABLE'),
    replyPostingAvailable: countWhere(rows, (row) => evidenceOf(row).participation.replyPosting === 'AVAILABLE'),
    profileWebsiteObserved: countWhere(rows, (row) => normalProfileSurface(row).availability === 'OBSERVED'),
    postBodyLinkObserved: countWhere(rows, (row) => surfaceOf(row, 'POST_BODY').availability === 'OBSERVED'),
    threadIndexable: countWhere(rows, (row) => evidenceOf(row).threadPage.indexability === 'INDEXABLE'),
    profileIndexable: countWhere(rows, (row) => evidenceOf(row).publicProfile.indexability === 'INDEXABLE'),
  };
}

function summarize(rows, findings) {
  const attemptedIds = new Set(findings.map((finding) => finding.id));
  const attempted = rows.filter((row) => attemptedIds.has(row.id));
  const cohortIds = new Set(V2.cohortRows(rows).map((row) => row.id));
  const primary = attempted.filter((row) => cohortIds.has(row.id));
  const expansion = attempted.filter((row) => !cohortIds.has(row.id));
  const findingsById = new Map(findings.map((finding) => [finding.id, finding]));
  const attempts = attempted.map((row) => evidenceOf(row).attemptState);
  const participation = (key) => attempted.map((row) => evidenceOf(row).participation[key]);
  const surfaces = Object.fromEntries(V2.SURFACES.map((name) => {
    const values = attempted.map((row) => surfaceOf(row, name));
    return [name, {
      availability: distribution(values.map((value) => value.availability), V2.AVAILABILITY),
      backlinkType: distribution(values.map((value) => value.backlinkType), V2.BACKLINK_TYPES),
      linkTargetType: distribution(values.map((value) => value.linkTargetType), V2.LINK_TARGET_TYPES),
    }];
  }));
  const profileFollow = (row) => normalProfileSurface(row).backlinkType === 'FOLLOW'
    && evidenceOf(row).publicProfile.indexability === 'INDEXABLE';
  const postThread = (type) => (row) => surfaceOf(row, 'POST_BODY').backlinkType === type
    && evidenceOf(row).threadPage.indexability === 'INDEXABLE';
  const freePosting = (row) => evidenceOf(row).participation.registrationCost === 'FREE'
    && evidenceOf(row).participation.threadCreation === 'AVAILABLE';
  const priorityTopic = (row) => row.topics.some((topic) => PRIORITY_TOPICS.has(topic));
  const pageCounts = { read: 0, unread: 0, timeout: 0, challenge: 0 };
  for (const row of attempted) {
    const counts = findingsById.get(row.id).counts || {};
    pageCounts.read += counts.readPages || 0;
    pageCounts.unread += counts.unreadPages || 0;
    pageCounts.timeout += counts.timeoutPages || 0;
    pageCounts.challenge += counts.challengePages || 0;
  }
  return {
    generatedAt: attempted.map((row) => evidenceOf(row).evidenceCheckedAt).sort().at(-1) || null,
    canonicalRecords: rows.length,
    recordsAttempted: attempted.length,
    segments: { primaryCohort: segment(primary), expansion: segment(expansion) },
    recordAttemptStates: distribution(attempts, V2.ATTEMPT_STATES),
    renderedPageOutcomes: pageCounts,
    representativeProfilesDiscovered: countWhere(attempted, (row) =>
      evidenceOf(row).publicProfile.discoveryState === 'PUBLIC_PROFILE_DISCOVERED'),
    representativeThreadsDiscovered: countWhere(attempted, (row) =>
      Boolean(evidenceOf(row).threadPage.representativeUrl)),
    registrationAccess: distribution(participation('registrationAccess'), V2.REGISTRATION_ACCESS),
    registrationCost: distribution(participation('registrationCost'), V2.REGISTRATION_COST),
    threadCreation: distribution(participation('threadCreation'), V2.POSTING_ACCESS),
    replyPosting: distribution(participation('replyPosting'), V2.POSTING_ACCESS),
    surfaces,
    threadIndexability: distribution(attempted.map((row) => evidenceOf(row).threadPage.indexability), V2.INDEXABILITY),
    profileIndexability: distribution(attempted.map((row) => evidenceOf(row).publicProfile.indexability), V2.INDEXABILITY),
    intersections: {
      freeRegistrationPostingAvailable: countWhere(attempted, freePosting),
      freeRegistrationPostingAvailableDr50: countWhere(attempted, (row) => freePosting(row) && row.domainRating >= 50),
      freeRegistrationPostingAvailableDr70: countWhere(attempted, (row) => freePosting(row) && row.domainRating >= 70),
      profileFollowIndexable: countWhere(attempted, profileFollow),
      profileFollowIndexableDr50: countWhere(attempted, (row) => profileFollow(row) && row.domainRating >= 50),
      profileFollowIndexableDr70: countWhere(attempted, (row) => profileFollow(row) && row.domainRating >= 70),
      postBodyFollowThreadIndexable: countWhere(attempted, postThread('FOLLOW')),
      postBodyUgcThreadIndexable: countWhere(attempted, postThread('UGC')),
      priorityTopicsFreePostingDr50: countWhere(attempted, (row) =>
        priorityTopic(row) && freePosting(row) && row.domainRating >= 50),
    },
  };
}

function main() {
  const rows = F.load(CANONICAL);
  const ledger = new CK.Ledger(FINDINGS);
  ledger.compact();
  const report = summarize(rows, ledger.all());
  CK.writeAtomic(OUT, `${JSON.stringify(report, null, 1)}\n`);
  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (require.main === module) main();
module.exports = { OUT, PRIORITY_TOPICS, distribution, summarize, main };
