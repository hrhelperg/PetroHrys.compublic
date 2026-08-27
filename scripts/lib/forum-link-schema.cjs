'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const F = require('./forum-schema.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const FORUMS = path.join(ROOT, 'data/forums/forums.json');
const COHORT = path.join(ROOT, 'data/forums/forum-posting-link-value-v2-cohort.csv');

const REGISTRATION_ACCESS = ['OPEN', 'INVITE_ONLY', 'CLOSED', 'UNKNOWN'];
const REGISTRATION_COST = ['FREE', 'PAID', 'UNKNOWN'];
const POSTING_ACCESS = ['AVAILABLE', 'RESTRICTED', 'UNAVAILABLE', 'UNKNOWN'];
const BACKLINK_TYPES = ['FOLLOW', 'NOFOLLOW', 'UGC', 'SPONSORED', 'MIXED', 'UNKNOWN'];
const LINK_TARGET_TYPES = ['DIRECT_EXTERNAL', 'INTERNAL_REDIRECT', 'JAVASCRIPT_REDIRECT', 'UNKNOWN'];
const INDEXABILITY = ['INDEXABLE', 'NOINDEX', 'ROBOTS_BLOCKED', 'LOGIN_REQUIRED', 'UNKNOWN'];
const AVAILABILITY = ['OBSERVED', 'NOT_OBSERVED', 'UNKNOWN'];
const PROFILE_DISCOVERY = ['PUBLIC_PROFILE_DISCOVERED', 'PUBLIC_PROFILE_NOT_DISCOVERED', 'UNKNOWN'];
const ATTEMPT_STATES = ['READ', 'UNREAD', 'TIMEOUT', 'CHALLENGE'];
const SCOPES = ['NORMAL_MEMBER', 'OBSERVED_MEMBER_TEMPLATE', 'STAFF_OR_MODERATOR',
  'CATEGORY_SPECIFIC', 'PUBLIC_PAGE', 'UNKNOWN'];
const SURFACES = ['PROFILE_WEBSITE', 'PROFILE_BIO', 'POST_BODY', 'SIGNATURE'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const isUrl = (value) => {
  if (value === null || value === undefined) return true;
  try { return /^https?:$/.test(new URL(value).protocol); } catch { return false; }
};

function cohortRows(rows = F.load(FORUMS)) {
  return rows.slice().sort((a, b) => {
    const active = Number(b.status === 'ACTIVE') - Number(a.status === 'ACTIVE');
    if (active) return active;
    const ad = a.domainRating === null || a.domainRating === undefined ? -1 : a.domainRating;
    const bd = b.domainRating === null || b.domainRating === undefined ? -1 : b.domainRating;
    return (bd - ad) || a.name.localeCompare(b.name, 'en');
  }).slice(0, 500);
}

function cohortIdentitySha(rows = cohortRows()) {
  return sha256(rows.map((r) => r.id).join('\n'));
}

function surfaceEmpty() {
  return {
    availability: 'UNKNOWN',
    backlinkType: 'UNKNOWN',
    backlinkTypesObserved: [],
    linkTargetType: 'UNKNOWN',
    pageIndexability: 'UNKNOWN',
    evidenceUrl: null,
    observedAt: null,
    scope: 'UNKNOWN',
    relInspected: false,
    relTokens: [],
  };
}

function emptyEvidence(checkedAt) {
  return {
    attemptState: 'UNREAD',
    evidenceCheckedAt: checkedAt,
    participation: {
      registrationAccess: 'UNKNOWN',
      registrationCost: 'UNKNOWN',
      threadCreation: 'UNKNOWN',
      replyPosting: 'UNKNOWN',
      restrictionFacts: [],
    },
    publicProfile: {
      discoveryState: 'UNKNOWN',
      representativeUrl: null,
      indexability: 'UNKNOWN',
      canonicalUrl: null,
      observedAt: null,
    },
    threadPage: {
      representativeUrl: null,
      indexability: 'UNKNOWN',
      canonicalUrl: null,
      observedAt: null,
    },
    linkSurfaces: Object.fromEntries(SURFACES.map((name) => [name, surfaceEmpty()])),
    evidenceUrls: {
      registration: null,
      rules: null,
      memberDirectory: null,
      representativeProfile: null,
      representativeThread: null,
      postExternalLink: null,
      signatureExample: null,
    },
  };
}

function backlinkType(relTokens) {
  const tokens = [...new Set((relTokens || []).map((x) => String(x).toLowerCase()).filter(Boolean))];
  if (tokens.includes('sponsored')) return 'SPONSORED';
  if (tokens.includes('ugc')) return 'UGC';
  if (tokens.includes('nofollow')) return 'NOFOLLOW';
  return 'FOLLOW';
}

function aggregateType(values) {
  const types = [...new Set((values || []).filter((x) => x && x !== 'UNKNOWN'))];
  if (!types.length) return 'UNKNOWN';
  return types.length === 1 ? types[0] : 'MIXED';
}

function problemsForSurface(name, value) {
  const p = [];
  const at = (field, message) => p.push(`${name}.${field} ${message}`);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [`${name} must be an object.`];
  if (!AVAILABILITY.includes(value.availability)) at('availability', 'uses an unknown state.');
  if (!BACKLINK_TYPES.includes(value.backlinkType)) at('backlinkType', 'uses an unknown state.');
  if (!Array.isArray(value.backlinkTypesObserved)
    || value.backlinkTypesObserved.some((x) => !BACKLINK_TYPES.includes(x) || x === 'MIXED')) {
    at('backlinkTypesObserved', 'must contain directly observed non-MIXED link types.');
  }
  if (!LINK_TARGET_TYPES.includes(value.linkTargetType)) at('linkTargetType', 'uses an unknown state.');
  if (!INDEXABILITY.includes(value.pageIndexability)) at('pageIndexability', 'uses an unknown state.');
  if (!SCOPES.includes(value.scope)) at('scope', 'uses an unknown state.');
  if (!isUrl(value.evidenceUrl)) at('evidenceUrl', 'must be null or HTTP(S).');
  if (value.observedAt !== null && !DATE_RE.test(value.observedAt || '')) at('observedAt', 'must be null or an ISO date.');
  if (!Array.isArray(value.relTokens)) at('relTokens', 'must be an array.');
  if (value.backlinkType !== 'UNKNOWN') {
    if (value.availability !== 'OBSERVED') at('availability', 'must be OBSERVED when a link type is established.');
    if (!value.relInspected) at('relInspected', 'must be true when a link type is established.');
    if (!value.evidenceUrl || !value.observedAt) at('evidenceUrl', 'and observedAt are required for a link type.');
  }
  if (value.backlinkType === 'FOLLOW' && (value.relTokens || []).some((x) =>
    ['nofollow', 'ugc', 'sponsored'].includes(String(x).toLowerCase()))) {
    at('backlinkType', 'cannot be FOLLOW when rel carries nofollow, ugc or sponsored.');
  }
  if (value.backlinkType === 'NOFOLLOW' && !(value.relTokens || []).includes('nofollow')) {
    at('relTokens', 'must contain nofollow.');
  }
  if (value.backlinkType === 'UGC' && !(value.relTokens || []).includes('ugc')) at('relTokens', 'must contain ugc.');
  if (value.backlinkType === 'SPONSORED' && !(value.relTokens || []).includes('sponsored')) {
    at('relTokens', 'must contain sponsored.');
  }
  if (value.backlinkType === 'MIXED' && new Set(value.backlinkTypesObserved || []).size < 2) {
    at('backlinkTypesObserved', 'must preserve at least two directly observed types for MIXED.');
  }
  return p;
}

function problemsFor(value) {
  const p = [];
  const at = (field, message) => p.push(`forumLinkValue.${field} ${message}`);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['forumLinkValue must be an object.'];
  if (!ATTEMPT_STATES.includes(value.attemptState)) at('attemptState', 'uses an unknown state.');
  if (!DATE_RE.test(value.evidenceCheckedAt || '')) at('evidenceCheckedAt', 'must be an ISO date.');
  const participation = value.participation || {};
  if (!REGISTRATION_ACCESS.includes(participation.registrationAccess)) at('participation.registrationAccess', 'uses an unknown state.');
  if (!REGISTRATION_COST.includes(participation.registrationCost)) at('participation.registrationCost', 'uses an unknown state.');
  if (!POSTING_ACCESS.includes(participation.threadCreation)) at('participation.threadCreation', 'uses an unknown state.');
  if (!POSTING_ACCESS.includes(participation.replyPosting)) at('participation.replyPosting', 'uses an unknown state.');
  if (!Array.isArray(participation.restrictionFacts)) at('participation.restrictionFacts', 'must be an array.');
  const profile = value.publicProfile || {};
  if (!PROFILE_DISCOVERY.includes(profile.discoveryState)) at('publicProfile.discoveryState', 'uses an unknown state.');
  if (!INDEXABILITY.includes(profile.indexability)) at('publicProfile.indexability', 'uses an unknown state.');
  if (!isUrl(profile.representativeUrl) || !isUrl(profile.canonicalUrl)) at('publicProfile', 'URLs must be null or HTTP(S).');
  const thread = value.threadPage || {};
  if (!INDEXABILITY.includes(thread.indexability)) at('threadPage.indexability', 'uses an unknown state.');
  if (!isUrl(thread.representativeUrl) || !isUrl(thread.canonicalUrl)) at('threadPage', 'URLs must be null or HTTP(S).');
  if (!value.linkSurfaces || typeof value.linkSurfaces !== 'object') at('linkSurfaces', 'must be an object.');
  else for (const surface of SURFACES) p.push(...problemsForSurface(`forumLinkValue.linkSurfaces.${surface}`,
    value.linkSurfaces[surface]));
  const urls = value.evidenceUrls || {};
  for (const key of ['registration', 'rules', 'memberDirectory', 'representativeProfile',
    'representativeThread', 'postExternalLink', 'signatureExample']) {
    if (!isUrl(urls[key])) at(`evidenceUrls.${key}`, 'must be null or HTTP(S).');
  }
  return p;
}

function validateEvidence(value) {
  const problems = problemsFor(value);
  if (problems.length) throw new Error(`Forum Link Value validation failed:\n- ${problems.join('\n- ')}`);
  return value;
}

function assertCohortParity() {
  const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/forums/protected-v2-baseline.json'), 'utf8'));
  const bytes = fs.readFileSync(COHORT);
  if (sha256(bytes) !== baseline.cohortFileSha256) throw new Error('The committed V1 cohort file changed.');
  const rows = cohortRows();
  if (rows.length !== 500 || cohortIdentitySha(rows) !== baseline.cohortIdentitySha256) {
    throw new Error('The re-derived V2 cohort does not have exact V1 identity parity.');
  }
  return rows;
}

module.exports = {
  REGISTRATION_ACCESS, REGISTRATION_COST, POSTING_ACCESS, BACKLINK_TYPES,
  LINK_TARGET_TYPES, INDEXABILITY, AVAILABILITY, PROFILE_DISCOVERY, ATTEMPT_STATES,
  SCOPES, SURFACES, cohortRows, cohortIdentitySha, assertCohortParity, surfaceEmpty,
  emptyEvidence, backlinkType, aggregateType, problemsForSurface, problemsFor,
  validateEvidence, sha256,
};
