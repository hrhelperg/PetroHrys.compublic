#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const F = require('./lib/forum-schema.cjs');
const CK = require('./lib/rc-checkpoint.cjs');
const REFUSAL = require('./lib/rc-refusal.cjs');

const ROOT = path.resolve(__dirname, '..');
const CANDIDATES = path.join(ROOT, 'data/forums/candidates.json');
const FINDINGS = path.join(ROOT, 'data/forums/research-findings.json');
const COUNTRIES = JSON.parse(fs.readFileSync(path.join(ROOT,
  'data/business-directories/countries.json'), 'utf8'));
const UA = 'PetroHrysForumResearch/1.0 (+https://petrohrys.com/research/forums/)';
const TIMEOUT_MS = 18000;
const TODAY = new Date().toISOString().slice(0, 10);
const CHALLENGE = REFUSAL.isRefusal;

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
};

function htmlText(value) {
  return String(value || '').replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, ' ').trim();
}

function meta(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${escaped}["']`, 'i'),
  ];
  for (const re of patterns) { const m = String(html).match(re); if (m) return htmlText(m[1]); }
  return '';
}

function pageTitle(html) {
  return htmlText((String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
}

function absoluteLinks(html, base, patterns) {
  const out = new Set();
  for (const m of String(html).matchAll(/href=["']([^"'#]+)["']/gi)) {
    let u;
    try { u = new URL(m[1].replace(/&amp;/g, '&'), base); } catch { continue; }
    if (u.origin !== new URL(base).origin) continue;
    if (patterns.some((re) => re.test(`${u.pathname}${u.search}`))) {
      u.hash = '';
      out.add(u.toString());
    }
  }
  return [...out];
}

async function fetchPage(url, accept = 'text/html') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': UA, Accept: accept }, signal: controller.signal });
    const text = await res.text();
    return { ok: res.ok, status: res.status, url: res.url, text,
      challenged: res.status === 403 || CHALLENGE(text.slice(0, 12000)) };
  } catch (e) {
    return { ok: false, status: null, url, text: '', transport: e.name === 'AbortError' ? 'TIMEOUT' : e.message };
  } finally { clearTimeout(timer); }
}

function normalizeLanguage(value) {
  const code = String(value || '').toLowerCase().split(/[-_]/)[0];
  return /^[a-z]{2}$/.test(code) ? code : null;
}

function languageFromHtml(html) {
  const m = String(html).match(/<html[^>]+(?:lang|xml:lang)=["']?([a-z]{2})(?:[-_][a-z]{2})?/i)
    || String(html).match(/<meta[^>]+name=["']language["'][^>]+content=["']([^"']+)/i);
  return normalizeLanguage(m && m[1]);
}

const LANGUAGE_WORDS = {
  en: ['the', 'and', 'for', 'with', 'community', 'discussion', 'questions', 'members', 'about', 'welcome'],
  de: ['der', 'die', 'das', 'und', 'fur', 'fuer', 'mit', 'gemeinschaft', 'diskussion', 'fragen', 'mitglieder', 'uber', 'ueber', 'willkommen'],
  es: ['los', 'las', 'del', 'que', 'para', 'con', 'comunidad', 'discusion', 'preguntas', 'miembros', 'sobre', 'bienvenido'],
  fr: ['les', 'des', 'pour', 'avec', 'communaute', 'discussion', 'questions', 'membres', 'sujet', 'bienvenue'],
  pt: ['dos', 'das', 'para', 'com', 'comunidade', 'discussao', 'perguntas', 'membros', 'sobre', 'bem-vindo'],
  it: ['gli', 'delle', 'per', 'con', 'comunita', 'discussione', 'domande', 'membri', 'benvenuto'],
  nl: ['het', 'een', 'voor', 'met', 'gemeenschap', 'discussie', 'vragen', 'leden', 'over', 'welkom'],
  pl: ['oraz', 'dla', 'jest', 'spolecznosc', 'dyskusja', 'pytania', 'czlonkowie', 'tematy', 'witamy'],
  tr: ['icin', 'ile', 'topluluk', 'tartisma', 'sorular', 'uyeler', 'hakkinda', 'hosgeldiniz'],
};

function detectLanguagesFromText(value) {
  const raw = htmlText(value);
  if (!raw) return [];
  const scores = new Map();
  const scriptScore = (re) => (raw.match(re) || []).length;
  const kana = scriptScore(/[\u3040-\u30ff]/gu);
  const hangul = scriptScore(/[\uac00-\ud7af]/gu);
  const arabic = scriptScore(/[\u0600-\u06ff]/gu);
  const han = scriptScore(/[\u4e00-\u9fff]/gu);
  if (kana >= 3) scores.set('ja', kana);
  else if (han >= 3) scores.set('zh', han);
  if (hangul >= 3) scores.set('ko', hangul);
  if (arabic >= 3) scores.set('ar', arabic);
  const text = raw.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  for (const [language, words] of Object.entries(LANGUAGE_WORDS)) {
    const score = words.reduce((total, word) => total
      + (new RegExp(`\\b${word}\\b`, 'i').test(text) ? 1 : 0), 0);
    if (score >= 3) scores.set(language, score);
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'en'))
    .map(([language]) => language);
}

function detectLanguageFromText(value) { return detectLanguagesFromText(value)[0] || null; }

const TOPIC_RULES = [
  ['MARKETING_SEO_GROWTH', /\b(marketing|seo|growth hacking|advertis|webmaster|social media)\b/i],
  ['ECOMMERCE_MARKETPLACES', /\b(e-?commerce|marketplace|online shop|retail|selling)\b/i],
  ['FINANCE_INVESTING_BANKING', /\b(finance|invest|banking|stocks?|trading|accounting|money)\b/i],
  ['CRYPTO_WEB3', /\b(crypto|bitcoin|ethereum|blockchain|web3|defi)\b/i],
  ['PROGRAMMING_DEVELOPMENT', /\b(programm|developer|coding|javascript|python|java\b|php\b|software development)\b/i],
  ['AI_DATA', /\b(artificial intelligence|machine learning|data science|generative ai|chatgpt)\b/i],
  ['CYBERSECURITY_IT', /\b(cyber|security|malware|sysadmin|information technology|networking)\b/i],
  ['WEB_HOSTING_DOMAINS', /\b(web hosting|hosting|domain names?|dns|server hosting)\b/i],
  ['TELECOM_VOIP', /\b(telecom|voip|mobile network|telephony)\b/i],
  ['TECHNOLOGY_SOFTWARE', /\b(technology|software|computer|internet|tech support|hardware)\b/i],
  ['BUSINESS_ENTREPRENEURSHIP', /\b(business|entrepreneur|startup|small business|management)\b/i],
  ['CAREERS_HR_RECRUITMENT', /\b(career|jobs?|human resources|recruit|workplace|employment)\b/i],
  ['EDUCATION_STUDENTS', /\b(education|students?|teachers?|university|school|learning|academic)\b/i],
  ['SCIENCE', /\b(science|physics|chemistry|biology|astronomy|mathematics)\b/i],
  ['ENGINEERING', /\b(engineering|engineers?|mechanical|electrical engineer)\b/i],
  ['HEALTH_MEDICINE', /\b(health|medical|medicine|doctor|patient|disease|mental health)\b/i],
  ['TRAVEL_EXPAT_IMMIGRATION', /\b(travel|expat|immigration|visa|tourism)\b/i],
  ['AUTOMOTIVE', /\b(automotive|cars?|vehicles?|motorcycle|motoring)\b/i],
  ['TRANSPORT_LOGISTICS', /\b(transport|logistics|shipping|aviation|railway)\b/i],
  ['GAMING_ESPORTS', /\b(video games?|gaming|esports?|playstation|xbox|nintendo|roleplay|rpg\b)\b/i],
  ['SPORTS_FITNESS', /\b(sports?|fitness|football|soccer|basketball|running|cycling)\b/i],
  ['CONSTRUCTION', /\b(construction|builders?|building industry)\b/i],
  ['ARCHITECTURE_DESIGN', /\b(architecture|architects?|interior design|urban design)\b/i],
  ['HOME_DIY', /\b(home improvement|diy|woodworking|renovation|household)\b/i],
  ['AGRICULTURE_GARDENING', /\b(agriculture|farming|garden|horticulture|plants?)\b/i],
  ['ANIMALS_PETS', /\b(animals?|pets?|dogs?|cats?|aquarium|horse|veterinary)\b/i],
  ['PHOTOGRAPHY_VIDEO', /\b(photograph|camera|filmmaking|videography|video production)\b/i],
  ['CREATIVE_DESIGN', /\b(graphic design|creative|illustration|artwork|artists?)\b/i],
  ['MUSIC_ENTERTAINMENT_CULTURE', /\b(music|movies?|cinema|television|culture|entertainment|celebrit)\b/i],
  ['FOOD_COOKING', /\b(food|cooking|recipes?|restaurant|baking)\b/i],
  ['PARENTING_FAMILY', /\b(parenting|parents?|family|pregnancy|mothers?|fathers?)\b/i],
  ['LEGAL', /\b(legal|lawyers?|law\b|attorney|court)\b/i],
  ['GOVERNMENT_PUBLIC_SECTOR', /\b(government|public sector|civil service|municipal)\b/i],
  ['NEWS_POLITICS_SOCIETY', /\b(news|politics|society|current affairs|history)\b/i],
  ['LOCAL_REGIONAL', /\b(local community|neighborhood|regional community|city forum|town forum)\b/i],
  ['CONSUMER_DEALS_REVIEWS', /\b(deals?|coupons?|consumer|reviews?|shopping)\b/i],
  ['HOBBIES_COLLECTING_OUTDOORS', /\b(hobb|collect|outdoors?|fishing|hunting|crafts?|model railway)\b/i],
];

function classifyTopics(evidenceText) {
  const text = String(evidenceText || '');
  const matched = TOPIC_RULES.filter(([, re]) => re.test(text)).map(([topic]) => topic);
  if (!matched.length) return ['GENERAL_MULTI_TOPIC'];
  if (matched.length >= 5 || /\b(general discussion|all topics|everything|multi.?topic)\b/i.test(text)) {
    return ['GENERAL_MULTI_TOPIC', ...matched.slice(0, 4)];
  }
  return matched.slice(0, 5);
}

function countryFromEvidence(evidenceText) {
  const text = String(evidenceText || '');
  const context = 'community|forum|users?|members?|people|professionals?|fans?|investors?|market|property|support|platform|server|residents?|citizens?';
  const hits = COUNTRIES.filter((c) => {
    if (c.entityType !== 'country' || c.name.length < 4) return false;
    const name = c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:\\b(?:in|from|for|across|throughout|serving|based in|built (?:in|for)|dedicated to)\\s+(?:the\\s+)?${name}\\b|\\b${name}(?:'s|’s)\\b|\\b(?:${context})\\b.{0,40}\\b${name}\\b|\\b${name}\\b.{0,40}\\b(?:${context})\\b)`, 'i').test(text);
  });
  if (hits.length === 1) return hits[0].slug;
  if (/\b(?:global|worldwide|international) (?:online )?(?:discussion )?(?:community|forum)\b|\b(?:community|forum) (?:for |connecting |with )?(?:people |users |members |developers |engineers |investors )?(?:around the world|worldwide|globally)\b|\bmembers? in \d+ countries\b/i.test(text)) return 'global';
  return null;
}

function obviousHostedSpam(name, description) {
  const text = `${name || ''} ${description || ''}`;
  return /\b(?:situs judi|judi (?:slot|online)|togel|promo slot online|slot (?:online terpercaya|gacor|freebet)|link slot|forum slot|bonus casino|free spins all list casino|gift ?card generator|cracked accounts?)\b/i.test(text);
}

function activityFromEvidence({ html, dates = [] }) {
  const text = htmlText(html).slice(0, 80000);
  const allDates = [...dates];
  for (const m of String(html).matchAll(/(?:datetime|data-time)=["'](20\d{2}-\d{2}-\d{2})/gi)) allDates.push(m[1]);
  // Bare years are copyright and template facts as often as activity. Only a
  // date-shaped value may establish recency; otherwise status stays UNKNOWN.
  const months = 'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?';
  const dateRe = new RegExp(`\\b(?:${months})\\s+\\d{1,2},?\\s+20\\d{2}\\b`, 'gi');
  for (const m of String(html).matchAll(dateRe)) {
    const parsed = new Date(m[0]);
    if (!Number.isNaN(parsed.valueOf())) allDates.push(parsed.toISOString().slice(0, 10));
  }
  const newest = allDates.filter((x) => /^20\d{2}-\d{2}-\d{2}/.test(x)).sort().pop();
  if (/\b(archived forum|forum is archived|read[ -]only archive|no longer accepts? (?:new )?posts)\b/i.test(text)) {
    return { status: 'ARCHIVED', latestActivityAt: newest ? newest.slice(0, 10) : null };
  }
  if (!newest) return { status: 'UNKNOWN', latestActivityAt: null };
  const age = (Date.parse(TODAY) - Date.parse(newest.slice(0, 10))) / 86400000;
  if (Number.isFinite(age) && age >= 0 && age <= 366) {
    return { status: 'ACTIVE', latestActivityAt: newest.slice(0, 10) };
  }
  if (Number.isFinite(age) && age > 366) {
    return { status: 'DORMANT', latestActivityAt: newest.slice(0, 10) };
  }
  return { status: 'UNKNOWN', latestActivityAt: null };
}

function statusFromEvidence(input) { return activityFromEvidence(input).status; }

function forumTypeFor(text, software, country) {
  if (software === 'Stack Exchange') return 'Q_AND_A';
  if (/\b(question(?:s)? and answer|q&a)\b/i.test(text)) return 'Q_AND_A';
  if (/\b(official|customer|product) support (?:community|forum)|community support for\b/i.test(text)) return 'VENDOR_SUPPORT';
  if (country || /\b(local|regional|city|town|neighborhood) community\b/i.test(text)) return 'LOCAL_REGIONAL';
  if (/\b(professional|practitioners?|association members?|workplace)\b/i.test(text)) return 'PROFESSIONAL_COMMUNITY';
  if (/\b(industry|trade association|business sector)\b/i.test(text)) return 'INDUSTRY_COMMUNITY';
  if (/\b(student|teacher|university|education community)\b/i.test(text)) return 'EDUCATION_COMMUNITY';
  if (/\b(gaming|roleplay|sports?|hobby|fans?|enthusiasts?|collectors?)\b/i.test(text)) return 'HOBBY_COMMUNITY';
  return software === 'Forumotion' ? 'INDEPENDENT' : 'OTHER';
}

function findingBase(candidate, state, fields = {}) {
  return {
    key: `forums|${candidate.key}`,
    collection: 'forums',
    candidateKey: candidate.key,
    candidateUrl: candidate.discoveredUrl,
    discoverySource: candidate.source,
    state,
    checkedAt: TODAY,
    ...fields,
  };
}

function acceptedFinding(candidate, direct, method = 'DIRECT_HTTP') {
  const languages = (direct.languages || (direct.language ? [direct.language] : [])).slice(0, 5);
  const lang = languages[0] || null;
  const evidence = [direct.name, direct.description, ...(direct.categoryNames || [])].join(' ');
  const topics = classifyTopics(evidence);
  const country = countryFromEvidence(`${direct.name} ${direct.description}`);
  const type = forumTypeFor(evidence, direct.software, country && country !== 'global' ? country : null);
  const url = F.canonicalUrl(direct.forumIndexUrl);
  const record = {
    id: F.idFor(url, direct.forumBasePath),
    name: F.cleanText(direct.name).replace(/\s+[-|:]\s+(?:Portal|Forums?|Community)$/i, '').slice(0, 180),
    url,
    canonicalHost: F.canonicalHost(url),
    forumBasePath: F.basePath(direct.forumBasePath),
    country,
    languages,
    primaryLanguage: lang,
    primaryTopic: topics[0],
    topics,
    forumType: type,
    status: direct.status,
    lastVerifiedAt: TODAY,
    software: direct.software,
    description: F.cleanText(direct.description).slice(0, 320) || null,
    verification: {
      method, checkedAt: TODAY, forumIndexUrl: url,
      threadUrls: direct.threadUrls.slice(0, 3), signals: direct.signals,
      latestActivityAt: direct.latestActivityAt ? String(direct.latestActivityAt).slice(0, 10) : null,
    },
  };
  return findingBase(candidate, 'ACCEPTED', {
    identity: F.identityKey(record), record,
    observations: [{ url, status: 200, signals: direct.signals,
      threadUrls: direct.threadUrls.slice(0, 5), categoryNames: direct.categoryNames || [] }],
  });
}

async function verifyDiscourse(candidate) {
  const root = await fetchPage(candidate.discoveredUrl);
  if (!root.ok || root.challenged) return { unread: root };
  const base = new URL(root.url); base.search = ''; base.hash = ''; base.pathname = base.pathname.replace(/\/+$/, '');
  const site = await fetchPage(`${base.toString().replace(/\/$/, '')}/site.json`, 'application/json');
  const latest = await fetchPage(`${base.toString().replace(/\/$/, '')}/latest.json`, 'application/json');
  if (!site.ok || !latest.ok) return verifyHtmlForum(candidate, root);
  let s; let l;
  try { s = JSON.parse(site.text); l = JSON.parse(latest.text); } catch { return verifyHtmlForum(candidate, root); }
  const topics = l.topic_list && l.topic_list.topics || [];
  const persistent = topics.filter((t) => t.id && t.slug).slice(0, 10);
  if (persistent.length < 2) return { reject: 'fewer than two persistent public topics' };
  const forumBasePath = base.pathname || '/';
  const originBase = `${base.origin}${forumBasePath === '/' ? '' : forumBasePath}`;
  const dates = persistent.map((t) => t.bumped_at || t.last_posted_at).filter(Boolean).sort();
  const name = F.cleanText(s.title || meta(root.text, 'og:site_name') || pageTitle(root.text));
  if (!name) return { reject: 'target did not establish a meaningful community identity' };
  return {
    name, description: s.description || meta(root.text, 'description'),
    languages: detectLanguagesFromText([name, s.description,
      ...(s.categories || []).map((c) => c.name), ...persistent.map((t) => t.title)].join(' ')),
    software: 'Discourse', forumBasePath, forumIndexUrl: originBase || base.origin,
    threadUrls: persistent.map((t) => `${originBase}/t/${t.slug}/${t.id}`),
    categoryNames: (s.categories || []).map((c) => c.name).filter(Boolean).slice(0, 30),
    status: statusFromEvidence({ html: root.text, dates }),
    latestActivityAt: dates.pop() || null,
    signals: ['Discourse site.json identifies the community', 'latest.json exposes persistent public topic identities'],
  };
}

async function verifyHtmlForum(candidate, initial) {
  let page = initial || await fetchPage(candidate.discoveredUrl);
  if (!page.ok || page.challenged) return { unread: page };
  let html = page.text;
  let directUrl = page.url;
  const root = new URL(page.url);
  const hasForumLink = /href=["']\/forum\/?["']/i.test(html);
  let base = root.pathname.replace(/\/+$/, '') || '/';
  let threadUrls = absoluteLinks(html, directUrl, [
    /\/t\d+(?:-|\/)/i, /\/t\/[^/]+\/\d+/i, /\/threads\/[^/]+\.\d+/i,
    /viewtopic\.php\?(?:[^#]*&)?t=\d+/i, /showthread\.php\?(?:[^#]*&)?tid=\d+/i,
    /\/questions\/\d+/i, /\/forums\/topic\/\d+(?:-|\/)/i,
    /\/discussion\/\d+(?:\/|-)/i, /\/d\/\d+(?:-|\/|$)/i,
    /\/s\/[a-z0-9_-]+/i, /\/item\?id=\d+/i,
  ]);
  if (threadUrls.length < 2 && hasForumLink) {
    const forum = await fetchPage(`${root.origin}/forum`);
    if (forum.ok && !forum.challenged) {
      html = forum.text; directUrl = forum.url; base = '/forum';
      threadUrls = absoluteLinks(html, directUrl, [
        /\/t\d+(?:-|\/)/i, /\/t\/[^/]+\/\d+/i, /\/threads\/[^/]+\.\d+/i,
        /viewtopic\.php\?(?:[^#]*&)?t=\d+/i, /showthread\.php\?(?:[^#]*&)?tid=\d+/i,
        /\/questions\/\d+/i, /\/forums\/topic\/\d+(?:-|\/)/i,
        /\/discussion\/\d+(?:\/|-)/i, /\/d\/\d+(?:-|\/|$)/i,
        /\/s\/[a-z0-9_-]+/i, /\/item\?id=\d+/i,
      ]);
    }
  }
  const categories = absoluteLinks(html, directUrl, [
    /\/[fc]\d+(?:-|\/)/i, /\/c\/[^/]+\/\d+/i, /\/forums\/[^/]+\.\d+/i,
    /viewforum\.php\?(?:[^#]*&)?f=\d+/i, /forumdisplay\.php\?(?:[^#]*&)?fid=\d+/i,
    /\/forums\/forum\/\d+(?:-|\/)/i, /\/categories\/[a-z0-9_-]+/i,
    /\/(?:tags?|newest)(?:\/|$)/i, /\/questions\/tagged\//i,
  ]);
  const fingerprint = /forumotion|2img\.net\/i\/fa\/|topicit-connect/i.test(html)
    ? 'Forumotion'
    : /stack(?:overflow|exchange)|StackExchange\.ready/i.test(html) ? 'Stack Exchange'
      : /(?:data-flarum|flarum-loading|flarum\.core|flarum\.forum|<meta[^>]+generator[^>]+Flarum|\/assets\/forum-[^"']+\.js)/i.test(html) ? 'Flarum'
        : /(?:data-discourse|discourse-setup|<meta[^>]+generator[^>]+Discourse|\/assets\/discourse[^"']+)/i.test(html) ? 'Discourse'
          : /xenforo|js-xfUid/i.test(html) ? 'XenForo'
            : /phpBB|viewtopic\.php/i.test(html) ? 'phpBB'
              : /vbulletin/i.test(html) ? 'vBulletin'
                : /invision community|ipsLayout/i.test(html) ? 'Invision Community'
                  : /(?:vanilla|data-vv-)/i.test(html) ? 'Vanilla'
                    : /(?:mybb|showthread\.php\?tid=)/i.test(html) ? 'MyBB'
                      : 'Unknown';
  const name = meta(html, 'og:site_name') || pageTitle(html).replace(/\s+[-|:]\s+[^-|:]+$/, '');
  const description = meta(html, 'description') || '';
  const minimumThreads = fingerprint === 'Forumotion' ? 3 : 2;
  if (threadUrls.length < minimumThreads) return { reject: `target did not expose ${minimumThreads} persistent public discussion URLs` };
  if (categories.length < 1) return { reject: 'target did not establish a forum index/category structure' };
  if (!name || name.length < 2 || description.length < 15) return { reject: 'target did not establish a meaningful community identity' };
  if (/\b(create (?:your )?free forum|free forum hosting|this is a free forum)\b/i.test(`${name} ${description}`)) {
    return { reject: 'generic hosted forum shell without a distinct community identity' };
  }
  if (/\b(SEO Bot|link farm|carding|stolen accounts?)\b/i.test(`${name} ${description}`)
    || obviousHostedSpam(name, description)) {
    return { reject: 'obvious spam or illicit autogenerated shell' };
  }
  const categoryNames = categories.slice(0, 20).map((u) => decodeURIComponent(new URL(u).pathname)
    .replace(/[/._-]+/g, ' ').replace(/\b[fc]\d+\b/g, '').trim()).filter(Boolean);
  const activity = activityFromEvidence({ html });
  return {
    name, description, languages: detectLanguagesFromText([name, description,
      ...categoryNames, ...threadUrls.map((u) => decodeURIComponent(new URL(u).pathname))].join(' ')), software: fingerprint,
    forumBasePath: base, forumIndexUrl: `${new URL(directUrl).origin}${base === '/' ? '/' : base}`,
    threadUrls, categoryNames, status: activity.status,
    latestActivityAt: activity.latestActivityAt,
    signals: [`${fingerprint} forum footprint observed on target`,
      `${threadUrls.length} persistent discussion URLs and ${categories.length} forum index/category URLs observed`],
  };
}

async function researchOne(candidate) {
  const direct = candidate.source === 'discourse-discover'
    ? await verifyDiscourse(candidate) : await verifyHtmlForum(candidate);
  if (direct.unread) {
    const p = direct.unread;
    return findingBase(candidate, 'UNREAD', {
      reason: p.challenged ? 'WAF_OR_CHALLENGE' : p.transport || `HTTP_${p.status}`,
      observations: [{ url: p.url, status: p.status, transport: p.transport || null,
        challenged: Boolean(p.challenged) }],
    });
  }
  if (direct.reject) return findingBase(candidate, 'REJECTED', {
    reason: direct.reject, observations: [{ url: candidate.discoveredUrl, verdict: direct.reject }],
  });
  return acceptedFinding(candidate, direct);
}

async function main() {
  const source = JSON.parse(fs.readFileSync(CANDIDATES, 'utf8'));
  const ledger = new CK.Ledger(FINDINGS, { batch: 5 });
  CK.onInterrupt(ledger, 'Forum research');
  if (process.argv.includes('--reclassify')) {
    let changed = 0;
    for (const previous of ledger.all()) {
      if (previous.state !== 'ACCEPTED' || !previous.record) continue;
      const country = countryFromEvidence(`${previous.record.name} ${previous.record.description || ''}`);
      let finding;
      if (previous.discoverySource === 'forumotion-directory'
        && obviousHostedSpam(previous.record.name, previous.record.description)) {
        finding = { ...previous, state: 'REJECTED', record: undefined, identity: undefined,
          reason: 'obvious spam or illicit autogenerated shell' };
      } else {
        const forumType = previous.record.forumType === 'LOCAL_REGIONAL'
          && previous.record.country !== country
          ? forumTypeFor(`${previous.record.name} ${previous.record.description || ''}`,
            previous.record.software, country && country !== 'global' ? country : null)
          : previous.record.forumType;
        const latest = previous.record.verification.latestActivityAt
          ? String(previous.record.verification.latestActivityAt).slice(0, 10) : null;
        const observedText = (previous.observations || []).flatMap((o) => [
          ...(o.categoryNames || []), ...(o.threadUrls || []),
        ]).join(' ');
        const languages = detectLanguagesFromText(`${previous.record.name} ${previous.record.description || ''} ${observedText}`).slice(0, 5);
        const language = languages[0] || null;
        if (country === previous.record.country && forumType === previous.record.forumType
          && latest === previous.record.verification.latestActivityAt
          && language === previous.record.primaryLanguage
          && JSON.stringify(languages) === JSON.stringify(previous.record.languages)) continue;
        finding = { ...previous, record: { ...previous.record, country, forumType,
          languages, primaryLanguage: language,
          verification: { ...previous.record.verification, latestActivityAt: latest } } };
      }
      ledger.record(finding);
      changed += 1;
    }
    ledger.compact({ reclassifiedAt: TODAY });
    console.log(`Forum reclassification: ${changed} finding(s) updated from stored direct evidence.`);
    return;
  }
  const refresh = process.argv.includes('--refresh');
  const refreshAccepted = process.argv.includes('--refresh-accepted');
  const refreshUnsupportedActivity = process.argv.includes('--refresh-unsupported-activity');
  const retryUnread = process.argv.includes('--retry-unread');
  const refreshSourceDescription = process.argv.includes('--refresh-source-description');
  const onlyKey = arg('--key', null);
  const onlySource = arg('--source', null);
  let candidates = source.candidates.filter((c) => {
    if (onlyKey && c.key !== onlyKey) return false;
    if (onlySource && c.source !== onlySource) return false;
    const previous = ledger.get(`forums|${c.key}`);
    if (!previous) return true;
    if (refresh) return true;
    if (refreshAccepted) return previous.state === 'ACCEPTED';
    if (refreshUnsupportedActivity) {
      return previous.state === 'ACCEPTED' && previous.record
        && ['ACTIVE', 'DORMANT'].includes(previous.record.status)
        && !/^\d{4}-\d{2}-\d{2}$/.test(previous.record.verification.latestActivityAt || '');
    }
    if (retryUnread) return previous.state === 'UNREAD';
    if (refreshSourceDescription) {
      return previous.state === 'ACCEPTED' && previous.record && c.sourceDescription
        && previous.record.description === String(c.sourceDescription).slice(0, 320);
    }
    return false;
  });
  const limit = Number(arg('--limit', '0'));
  if (limit > 0) candidates = candidates.slice(0, limit);
  const concurrency = Math.max(1, Math.min(24, Number(arg('--concurrency', '12'))));
  const pace = Math.max(0, Number(arg('--pace', '0')));
  console.log(`Forum research: ${candidates.length} target(s), ${ledger.size()} resumed, concurrency ${concurrency}.`);
  let cursor = 0; let done = 0;
  async function worker() {
    while (cursor < candidates.length) {
      const index = cursor; cursor += 1;
      const c = candidates[index];
      let finding;
      try { finding = await researchOne(c); }
      catch (e) { finding = findingBase(c, 'UNREAD', { reason: `RESEARCH_ERROR: ${e.message}`, observations: [] }); }
      if (refresh || refreshAccepted || refreshUnsupportedActivity || retryUnread || refreshSourceDescription) {
        const previous = ledger.get(`forums|${c.key}`);
        const observed = previous && Array.isArray(previous.observations) ? previous.observations : [];
        finding.observations = [...observed, ...(finding.observations || [])];
      }
      ledger.record(finding);
      done += 1;
      if (done % 100 === 0) console.log(`  ${done}/${candidates.length}`);
      if (pace) await new Promise((resolve) => { setTimeout(resolve, pace); });
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  ledger.compact({ researchedAt: TODAY, candidatesDiscovered: source.candidates.length });
  const tally = {};
  for (const f of ledger.all()) tally[f.state] = (tally[f.state] || 0) + 1;
  console.log('Forum research findings:', Object.entries(tally).map(([k, v]) => `${k}=${v}`).join(' '));
}

if (require.main === module) main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });

module.exports = { htmlText, meta, absoluteLinks, normalizeLanguage, languageFromHtml,
  detectLanguagesFromText, detectLanguageFromText, classifyTopics, countryFromEvidence, activityFromEvidence, statusFromEvidence, forumTypeFor, verifyDiscourse,
  verifyHtmlForum, researchOne, acceptedFinding, findingBase, obviousHostedSpam };
