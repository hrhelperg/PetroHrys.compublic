'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..', '..');

const FORUM_TYPES = [
  'INDEPENDENT', 'PROFESSIONAL_COMMUNITY', 'VENDOR_SUPPORT', 'INDUSTRY_COMMUNITY',
  'Q_AND_A', 'LOCAL_REGIONAL', 'HOBBY_COMMUNITY', 'EDUCATION_COMMUNITY', 'OTHER', 'UNKNOWN',
];

const TOPICS = [
  'GENERAL_MULTI_TOPIC', 'BUSINESS_ENTREPRENEURSHIP', 'MARKETING_SEO_GROWTH',
  'ECOMMERCE_MARKETPLACES', 'FINANCE_INVESTING_BANKING', 'CRYPTO_WEB3',
  'TECHNOLOGY_SOFTWARE', 'PROGRAMMING_DEVELOPMENT', 'AI_DATA', 'CYBERSECURITY_IT',
  'WEB_HOSTING_DOMAINS', 'TELECOM_VOIP', 'CAREERS_HR_RECRUITMENT', 'EDUCATION_STUDENTS',
  'SCIENCE', 'ENGINEERING', 'HEALTH_MEDICINE', 'TRAVEL_EXPAT_IMMIGRATION', 'AUTOMOTIVE',
  'TRANSPORT_LOGISTICS', 'GAMING_ESPORTS', 'SPORTS_FITNESS', 'HOME_DIY', 'CONSTRUCTION',
  'ARCHITECTURE_DESIGN', 'AGRICULTURE_GARDENING', 'ANIMALS_PETS', 'PHOTOGRAPHY_VIDEO',
  'CREATIVE_DESIGN', 'MUSIC_ENTERTAINMENT_CULTURE', 'FOOD_COOKING', 'PARENTING_FAMILY',
  'LEGAL', 'GOVERNMENT_PUBLIC_SECTOR', 'NEWS_POLITICS_SOCIETY', 'LOCAL_REGIONAL',
  'CONSUMER_DEALS_REVIEWS', 'HOBBIES_COLLECTING_OUTDOORS',
];

const STATUSES = ['ACTIVE', 'DORMANT', 'ARCHIVED', 'UNKNOWN'];
const SOFTWARE = ['Discourse', 'Forumotion', 'Stack Exchange', 'XenForo', 'phpBB',
  'vBulletin', 'Invision Community', 'MyBB', 'Flarum', 'Vanilla', 'Custom', 'Unknown'];
const SOCIAL_HOSTS = /(^|\.)(facebook\.com|linkedin\.com|discord\.(gg|com)|slack\.com|telegram\.(me|org)|t\.me|whatsapp\.com|reddit\.com)$/i;
// Discovery directory roots only. A separately branded community hosted at
// foo.forumotion.com is a legitimate independent Forum target and must not be
// rejected merely because its network owner also runs the directory.
const DIRECTORY_HOSTS = /^(board-directory\.net|forumotion\.com)$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LANG_RE = /^[a-z]{2}$/;

class ForumSchemaError extends Error {}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function canonicalUrl(value) {
  const input = cleanText(value);
  let u;
  try { u = new URL(input); } catch { throw new ForumSchemaError(`invalid Forum URL: ${input}`); }
  if (!/^https?:$/.test(u.protocol)) throw new ForumSchemaError(`Forum URL must use HTTP(S): ${input}`);
  u.protocol = 'https:';
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  u.username = '';
  u.password = '';
  u.search = '';
  u.hash = '';
  u.pathname = u.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
  return u.toString().replace(/\/$/, u.pathname === '/' ? '/' : '');
}

function canonicalHost(value) {
  try { return new URL(canonicalUrl(value)).hostname; } catch { return null; }
}

function basePath(value) {
  let p = cleanText(value || '/');
  if (!p.startsWith('/')) p = `/${p}`;
  p = p.replace(/\/{2,}/g, '/').replace(/\/+$/, '');
  return p || '/';
}

function identityKey(record) {
  return `${canonicalHost(record.url)}${basePath(record.forumBasePath || new URL(record.url).pathname)}`;
}

function idFor(url, forumBasePath = '/') {
  const key = `${canonicalHost(url)}${basePath(forumBasePath)}`;
  const human = key.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 52);
  return `forum-${human}-${crypto.createHash('sha256').update(key).digest('hex').slice(0, 8)}`;
}

function problemsFor(row, countries) {
  const p = [];
  const at = (field, message) => p.push(`${row && row.id ? row.id : '<forum>'}.${field} ${message}`);
  if (!row || typeof row !== 'object' || Array.isArray(row)) return ['Forum record must be an object.'];
  if (!/^forum-[a-z0-9-]+$/.test(row.id || '')) at('id', 'must be a stable forum-* slug.');
  if (!cleanText(row.name) || cleanText(row.name).length > 180) at('name', 'must be 1-180 characters.');
  let u = null;
  try { u = new URL(row.url); } catch { at('url', 'must be an absolute URL.'); }
  if (u) {
    if (u.protocol !== 'https:') at('url', 'must be the canonical HTTPS target.');
    if (u.search || u.hash) at('url', 'must not contain query or fragment state.');
    if (/^www\./i.test(u.hostname)) at('url', 'must not retain www.');
    if (SOCIAL_HOSTS.test(u.hostname)) at('url', 'is a social/group host, not a Forum entity.');
    if (DIRECTORY_HOSTS.test(u.hostname)) at('url', 'is a discovery directory, not a Forum target.');
    if (row.canonicalHost !== u.hostname.toLowerCase()) at('canonicalHost', 'must equal the URL host.');
  }
  if (row.forumBasePath !== basePath(row.forumBasePath)) at('forumBasePath', 'must be a clean root path.');
  if (row.country !== null && !(countries || new Set()).has(row.country)) at('country', 'must be null or an existing geography slug.');
  if (!Array.isArray(row.languages)) at('languages', 'must be an array of ISO 639-1 codes.');
  else {
    if (new Set(row.languages).size !== row.languages.length) at('languages', 'must not contain duplicates.');
    for (const lang of row.languages) if (!LANG_RE.test(lang)) at('languages', `contains invalid code "${lang}".`);
  }
  if (row.primaryLanguage === null) {
    if ((row.languages || []).length) at('primaryLanguage', 'may be null only when languages[] is empty.');
  } else if (!LANG_RE.test(row.primaryLanguage || '') || !(row.languages || []).includes(row.primaryLanguage)) {
    at('primaryLanguage', 'must be null or one of languages[].');
  }
  if (!TOPICS.includes(row.primaryTopic)) at('primaryTopic', 'must use the controlled taxonomy.');
  if (!Array.isArray(row.topics) || !row.topics.length || row.topics.length > 5) at('topics', 'must contain 1-5 controlled topics.');
  else {
    if (new Set(row.topics).size !== row.topics.length) at('topics', 'must not contain duplicates.');
    for (const topic of row.topics) if (!TOPICS.includes(topic)) at('topics', `contains unknown topic "${topic}".`);
    if (!row.topics.includes(row.primaryTopic)) at('topics', 'must include primaryTopic.');
  }
  if (!FORUM_TYPES.includes(row.forumType)) at('forumType', 'must use the controlled vocabulary.');
  if (!STATUSES.includes(row.status)) at('status', 'must be ACTIVE, DORMANT, ARCHIVED or UNKNOWN.');
  if (!DATE_RE.test(row.lastVerifiedAt || '')) at('lastVerifiedAt', 'must be an ISO date.');
  if (row.software !== null && row.software !== undefined && !SOFTWARE.includes(row.software)) at('software', 'is not recognized.');
  const v = row.verification;
  if (!v || !['DIRECT_HTTP', 'DIRECT_BROWSER'].includes(v.method)) {
    at('verification', 'must record direct HTTP or real-browser target verification.');
  }
  else {
    if (!DATE_RE.test(v.checkedAt || '')) at('verification.checkedAt', 'must be an ISO date.');
    if (!/^https?:\/\//.test(v.forumIndexUrl || '')) at('verification.forumIndexUrl', 'must be a direct target URL.');
    else if (canonicalHost(v.forumIndexUrl) !== row.canonicalHost) {
      at('verification.forumIndexUrl', 'must be on the canonical Forum host.');
    }
    if (!Array.isArray(v.threadUrls) || v.threadUrls.length < 2) {
      at('verification.threadUrls', 'must establish at least two persistent discussions.');
    } else {
      if (new Set(v.threadUrls).size !== v.threadUrls.length) {
        at('verification.threadUrls', 'must contain distinct persistent discussions.');
      }
      for (const threadUrl of v.threadUrls) {
        if (!/^https?:\/\//.test(threadUrl) || canonicalHost(threadUrl) !== row.canonicalHost) {
          at('verification.threadUrls', `contains a discussion outside the canonical host: ${threadUrl}`);
        }
      }
    }
    if (!Array.isArray(v.signals) || v.signals.length < 2) at('verification.signals', 'must establish at least two forum signals.');
    if (v.latestActivityAt !== null && v.latestActivityAt !== undefined && !DATE_RE.test(v.latestActivityAt)) {
      at('verification.latestActivityAt', 'must be null or an ISO date.');
    }
    if (['ACTIVE', 'DORMANT'].includes(row.status) && !DATE_RE.test(v.latestActivityAt || '')) {
      at('verification.latestActivityAt', `must support ${row.status} with the directly observed activity date.`);
    }
  }
  const dr = row.domainRating;
  if (dr !== null && dr !== undefined) {
    if (!Number.isInteger(dr) || dr < 0 || dr > 100) at('domainRating', 'must be an integer 0-100 or absent.');
    const prov = row.metricsProvenance && row.metricsProvenance.domainRating;
    if (!prov || prov.provider !== 'Ahrefs' || !DATE_RE.test(prov.measuredAt || '')
      || !prov.measuredDomain || !prov.status) at('metricsProvenance', 'must accompany every measured DR with Ahrefs provenance.');
  }
  return p;
}

function validate(rows) {
  if (!Array.isArray(rows)) throw new ForumSchemaError('Forum corpus must be a JSON array.');
  const countries = new Set(JSON.parse(fs.readFileSync(path.join(ROOT,
    'data/business-directories/countries.json'), 'utf8')).map((c) => c.slug));
  const all = rows.flatMap((row) => problemsFor(row, countries));
  const byId = new Set();
  const byIdentity = new Map();
  const byHost = new Map();
  for (const row of rows) {
    if (byId.has(row.id)) all.push(`${row.id}: duplicate id.`);
    byId.add(row.id);
    let key;
    try { key = identityKey(row); } catch { continue; }
    if (byIdentity.has(key)) all.push(`${row.id}: duplicate Forum identity with ${byIdentity.get(key)} (${key}).`);
    byIdentity.set(key, row.id);
    const host = canonicalHost(row.url);
    if (!host) continue;
    const previous = byHost.get(host) || [];
    for (const other of previous) {
      const prefix = (value) => {
        const p = basePath(value);
        return p === '/' ? '/' : `${p}/`;
      };
      const a = prefix(row.forumBasePath);
      const b = prefix(other.forumBasePath);
      if (a.startsWith(b) || b.startsWith(a)) all.push(`${row.id}: nested subforum identity duplicates ${other.id}.`);
    }
    previous.push(row);
    byHost.set(host, previous);
  }
  if (all.length) throw new ForumSchemaError(`Forum validation failed:\n- ${all.join('\n- ')}`);
  return rows;
}

function load(file) {
  return validate(JSON.parse(fs.readFileSync(file, 'utf8')));
}

module.exports = {
  FORUM_TYPES, TOPICS, STATUSES, SOFTWARE, SOCIAL_HOSTS, DIRECTORY_HOSTS,
  ForumSchemaError, canonicalUrl, canonicalHost, basePath, identityKey, idFor,
  problemsFor, validate, load, cleanText,
};
