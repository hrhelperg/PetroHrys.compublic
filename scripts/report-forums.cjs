#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const F = require('./lib/forum-schema.cjs');
const INV = require('./lib/rc-domain-inventory.cjs');
const { csvField } = require('./lib/bd-discovery.cjs');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data/forums/forums.json');
const CANDIDATES = path.join(ROOT, 'data/forums/candidates.json');
const FINDINGS = path.join(ROOT, 'data/forums/research-findings.json');
const APPLY = path.join(ROOT, 'data/forums/apply-report.json');
const DR_FINDINGS = path.join(ROOT, 'data/domain-rating/.ahrefs-domain-rating.json');
const REPORT = path.join(ROOT, 'data/forums/forum-report.json');
const COHORT = path.join(ROOT, 'data/forums/forum-posting-link-value-v2-cohort.csv');

function distribution(rows, getter) {
  const out = {};
  for (const r of rows) {
    const values = getter(r);
    for (const value of (Array.isArray(values) ? values : [values])) {
      const key = value === null || value === undefined || value === '' ? 'UNKNOWN' : String(value);
      out[key] = (out[key] || 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(out).sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0], 'en')));
}

function drReport(rows) {
  const bands = { '0': 0, '1-9': 0, '10-19': 0, '20-29': 0, '30-39': 0, '40-49': 0,
    '50-59': 0, '60-69': 0, '70-79': 0, '80-89': 0, '90-100': 0, UNKNOWN: 0 };
  const measured = [];
  for (const r of rows) {
    const v = r.domainRating;
    if (v === null || v === undefined) { bands.UNKNOWN += 1; continue; }
    measured.push(v);
    if (v === 0) bands['0'] += 1;
    else if (v <= 9) bands['1-9'] += 1;
    else if (v <= 19) bands['10-19'] += 1;
    else if (v <= 29) bands['20-29'] += 1;
    else if (v <= 39) bands['30-39'] += 1;
    else if (v <= 49) bands['40-49'] += 1;
    else if (v <= 59) bands['50-59'] += 1;
    else if (v <= 69) bands['60-69'] += 1;
    else if (v <= 79) bands['70-79'] += 1;
    else if (v <= 89) bands['80-89'] += 1;
    else bands['90-100'] += 1;
  }
  measured.sort((a, b) => a - b);
  const mid = Math.floor(measured.length / 2);
  const median = measured.length
    ? (measured.length % 2 ? measured[mid] : (measured[mid - 1] + measured[mid]) / 2) : null;
  return { bands, measured: measured.length, median };
}

function fileBudget(file) {
  const body = fs.readFileSync(file);
  return { rawBytes: body.length, gzipBytes: zlib.gzipSync(body).length,
    rows: (body.toString('utf8').match(/class="bd-row"/g) || []).length };
}

function cohortCsv(rows) {
  const columns = ['research_rank', 'forum', 'url', 'status', 'domain_rating', 'country',
    'primary_language', 'primary_topic', 'topics', 'forum_type', 'last_verified_at'];
  const lines = [columns.join(',')];
  rows.forEach((r, index) => lines.push([
    index + 1, r.name, r.url, r.status, r.domainRating ?? '', r.country || '', r.primaryLanguage,
    r.primaryTopic, r.topics, r.forumType, r.lastVerifiedAt,
  ].map(csvField).join(',')));
  return `﻿${lines.join('\r\n')}\r\n`;
}

function main() {
  const rows = F.load(DATA);
  const candidates = JSON.parse(fs.readFileSync(CANDIDATES, 'utf8'));
  const findings = JSON.parse(fs.readFileSync(FINDINGS, 'utf8')).findings;
  const applied = JSON.parse(fs.readFileSync(APPLY, 'utf8'));
  const drFindings = fs.existsSync(DR_FINDINGS)
    ? JSON.parse(fs.readFileSync(DR_FINDINGS, 'utf8')).findings || [] : [];
  const forumTargets = new Set(rows.map((r) => INV.normaliseDomain(r.url)).filter(Boolean));
  const forumDrFindings = drFindings.filter((f) => forumTargets.has(f.target));
  const dr = drReport(rows);
  const primaryTopics = distribution(rows, (r) => r.primaryTopic);
  const zeroTopics = F.TOPICS.filter((topic) => !primaryTopics[topic]);
  const smallTopics = F.TOPICS.filter((topic) => (primaryTopics[topic] || 0) > 0 && primaryTopics[topic] < 10);
  const report = {
    candidates: {
      discovered: candidates.candidates.length,
      sourceDiscoveriesBeforeDedupe: candidates.discovered,
      discoveryDuplicatesRemoved: candidates.duplicatesRemoved,
      directlyResearched: findings.length,
      findings: distribution(findings, (f) => f.state),
      canonicalAccepted: rows.length,
      rejected: findings.filter((f) => f.state === 'REJECTED').length,
      unread: findings.filter((f) => f.state === 'UNREAD').length,
      duplicatesAndRedirectsConsolidated: applied.duplicatesAndRedirectsConsolidated,
    },
    unique: {
      canonicalHosts: new Set(rows.map((r) => r.canonicalHost)).size,
      drTargets: forumTargets.size,
      countries: new Set(rows.map((r) => r.country).filter((x) => x && x !== 'global')).size,
      languages: new Set(rows.flatMap((r) => r.languages)).size,
      topics: new Set(rows.flatMap((r) => r.topics)).size,
    },
    status: distribution(rows, (r) => r.status),
    verificationMethods: distribution(rows, (r) => r.verification.method),
    forumTypes: distribution(rows, (r) => r.forumType),
    primaryTopics,
    topicsWithFewerThan10Forums: smallTopics,
    topicsWithZeroForums: zeroTopics,
    multiTopicForums: rows.filter((r) => r.topics.length > 1).length,
    geography: distribution(rows, (r) => r.country),
    primaryLanguages: distribution(rows, (r) => r.primaryLanguage),
    multilingualForums: rows.filter((r) => r.languages.length > 1).length,
    domainRating: {
      ...dr,
      uniqueTargets: forumTargets.size,
      measuredTargets: forumDrFindings.filter((f) => f.state === 'MEASURED').length,
      duplicateCallsAvoided: rows.length - forumTargets.size,
      providerFailuresRemaining: forumDrFindings.filter((f) => f.state === 'UNRESOLVED').length,
      highest: rows.filter((r) => r.domainRating !== null && r.domainRating !== undefined)
        .sort((a, b) => b.domainRating - a.domainRating || a.name.localeCompare(b.name, 'en'))
        .slice(0, 25).map((r) => ({ name: r.name, url: r.url, domainRating: r.domainRating })),
    },
    nextWave: {
      activeDr50: rows.filter((r) => r.status === 'ACTIVE' && r.domainRating >= 50).length,
      activeDr70: rows.filter((r) => r.status === 'ACTIVE' && r.domainRating >= 70).length,
      businessMarketingTechnologyDr50: rows.filter((r) => r.domainRating >= 50 && r.topics.some((t) => [
        'BUSINESS_ENTREPRENEURSHIP', 'MARKETING_SEO_GROWTH', 'TECHNOLOGY_SOFTWARE',
        'PROGRAMMING_DEVELOPMENT', 'AI_DATA', 'CYBERSECURITY_IT', 'WEB_HOSTING_DOMAINS',
      ].includes(t))).length,
      countrySpecificDr50: rows.filter((r) => r.country && r.country !== 'global' && r.domainRating >= 50).length,
    },
    page: {
      routeCount: 4,
      en: fileBudget(path.join(ROOT, 'research/forums/index.html')),
    },
  };

  // Priority is factual and future-facing: active first, then measured DR,
  // then stable name order. No posting or link-value field is inferred.
  const cohort = rows.slice().sort((a, b) => {
    const active = Number(b.status === 'ACTIVE') - Number(a.status === 'ACTIVE');
    if (active) return active;
    const ad = a.domainRating === null || a.domainRating === undefined ? -1 : a.domainRating;
    const bd = b.domainRating === null || b.domainRating === undefined ? -1 : b.domainRating;
    return (bd - ad) || a.name.localeCompare(b.name, 'en');
  }).slice(0, 500);
  fs.writeFileSync(REPORT, `${JSON.stringify(report, null, 1)}\n`);
  fs.writeFileSync(COHORT, cohortCsv(cohort));
  console.log(JSON.stringify(report, null, 1));
  console.log(`Future Forum Posting & Link Value V2 cohort: ${cohort.length} factual candidates.`);
}

if (require.main === module) main();
module.exports = { distribution, drReport, cohortCsv, main };
