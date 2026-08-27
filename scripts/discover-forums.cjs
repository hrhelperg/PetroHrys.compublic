#!/usr/bin/env node
'use strict';

// Candidate discovery only. Nothing here can write the canonical Forum corpus.
// Every candidate must still pass scripts/research-forums.cjs against the
// target itself before scripts/apply-forum-findings.cjs can accept it.

const fs = require('node:fs');
const path = require('node:path');
const F = require('./lib/forum-schema.cjs');
const CK = require('./lib/rc-checkpoint.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'data/forums/candidates.json');
const UA = 'PetroHrysForumResearch/1.0 (+https://petrohrys.com/research/forums/)';
const TIMEOUT_MS = 20000;

// Deliberate software-family rounds complement the two large network
// inventories below. These are candidate seeds from official software
// communities, first-party showcases or first-party verified-community lists;
// the software hint is never copied into the canonical record. The target must
// still establish its own forum index, discussions, identity and evidence.
const SOFTWARE_ROUNDS = [
  ['XenForo', 'https://xenforo.com/community/', 'https://xenforo.com/customers/showcase'],
  ['XenForo', 'https://www.avforums.com/forums/', 'https://xenforo.com/customers/showcase'],
  ['XenForo', 'https://forums.macrumors.com/', 'https://xenforo.com/customers/showcase'],
  ['XenForo', 'https://www.resetera.com/', 'https://xenforo.com/customers/showcase'],
  ['phpBB', 'https://www.phpbb.com/community/', 'https://www.phpbb.com/showcase/'],
  ['phpBB', 'https://forums.linuxmint.com/', 'https://www.phpbb.com/showcase/'],
  ['phpBB', 'https://forums.raspberrypi.com/', 'https://www.phpbb.com/showcase/'],
  ['phpBB', 'https://forum.freecad.org/', 'https://www.phpbb.com/showcase/'],
  ['vBulletin', 'https://forum.vbulletin.com/', 'https://forum.vbulletin.com/'],
  ['vBulletin', 'https://www.city-data.com/forum/', 'https://forum.vbulletin.com/'],
  ['Invision Community', 'https://invisioncommunity.com/forums/', 'https://invisioncommunity.com/showcase/'],
  ['Invision Community', 'https://linustechtips.com/', 'https://invisioncommunity.com/showcase/'],
  ['Invision Community', 'https://www.neowin.net/forum/', 'https://invisioncommunity.com/showcase/'],
  ['Invision Community', 'https://www.bleepingcomputer.com/forums/', 'https://invisioncommunity.com/showcase/'],
  ['MyBB', 'https://community.mybb.com/', 'https://community.mybb.com/'],
  ['MyBB', 'https://forums.getpaint.net/', 'https://community.mybb.com/'],
  ['MyBB', 'https://forum.toribash.com/', 'https://community.mybb.com/'],
  ['Flarum', 'https://discuss.flarum.org/', 'https://flarum.org/verified-communities'],
  ['Flarum', 'https://discuss.flarum.org.cn/', 'https://flarum.org/verified-communities'],
  ['Flarum', 'https://flarum.fi/', 'https://flarum.org/verified-communities'],
  ['Flarum', 'https://www.flarum.fr/', 'https://flarum.org/verified-communities'],
  ['Flarum', 'https://flarumde.com/', 'https://flarum.org/verified-communities'],
  ['Flarum', 'https://flarum.it/', 'https://flarum.org/verified-communities'],
  ['Flarum', 'https://flarum.pl/', 'https://flarum.org/verified-communities'],
  ['Flarum', 'https://flarum.es/', 'https://flarum.org/verified-communities'],
  ['Vanilla', 'https://open.vanillaforums.com/', 'https://vanillaforums.com/en/showcase/'],
  ['Vanilla', 'https://success.vanillaforums.com/', 'https://vanillaforums.com/en/showcase/'],
  ['Vanilla', 'https://forums.penny-arcade.com/', 'https://vanillaforums.com/en/showcase/'],
  ['Custom', 'https://news.ycombinator.com/', 'https://news.ycombinator.com/'],
  ['Custom', 'https://lobste.rs/', 'https://lobste.rs/'],
];

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
};

function decodeHtml(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, ' ').trim();
}

async function get(url, json = false) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: json ? 'application/json' : 'text/html' }, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return json ? await res.json() : await res.text();
  } finally { clearTimeout(timer); }
}

function candidate(source, url, fields = {}) {
  let discoveredUrl;
  try { discoveredUrl = F.canonicalUrl(url); } catch { return null; }
  const host = F.canonicalHost(discoveredUrl);
  if (!host || F.SOCIAL_HOSTS.test(host) || F.DIRECTORY_HOSTS.test(host)) return null;
  return {
    key: `${host}${new URL(discoveredUrl).pathname.replace(/\/+$/, '') || '/'}`,
    source,
    discoveredUrl,
    discoveredAt: new Date().toISOString().slice(0, 10),
    ...fields,
  };
}

async function discoverDiscourse() {
  const out = [];
  for (let page = 0; page < 100; page += 1) {
    let body;
    try { body = await get(`https://discover.discourse.com/c/discover/5.json?page=${page}`, true); }
    catch (e) { if (page === 0) console.warn(`Discourse Discover: ${e.message}`); break; }
    const topics = body && body.topic_list && body.topic_list.topics || [];
    if (!topics.length) break;
    for (const topic of topics) {
      const row = candidate('discourse-discover', topic.featured_link, {
        discoveryPage: `https://discover.discourse.com/t/${topic.slug}/${topic.id}`,
        sourceName: decodeHtml(topic.title),
        sourceTags: Array.isArray(topic.tags) ? topic.tags : [],
      });
      if (row) out.push(row);
    }
    if (topics.length < 30) break;
  }
  return out;
}

async function discoverStackExchange() {
  const out = [];
  for (let page = 1; page <= 10; page += 1) {
    let body;
    try {
      body = await get(`https://api.stackexchange.com/2.3/sites?page=${page}&pagesize=100&filter=default`, true);
    } catch (e) { if (page === 1) console.warn(`Stack Exchange: ${e.message}`); break; }
    for (const site of body.items || []) {
      // Meta mirrors are support surfaces for their main community, not a
      // second Forum entity for this inventory.
      if (site.site_type !== 'main_site') continue;
      const row = candidate('stack-exchange-api', site.site_url, {
        discoveryPage: 'https://api.stackexchange.com/docs/sites',
        sourceName: decodeHtml(site.name),
        sourceDescription: decodeHtml(site.audience),
        sourceLanguage: site.api_site_parameter && site.api_site_parameter.split('.')[0],
      });
      if (row) out.push(row);
    }
    if (!body.has_more) break;
  }
  return out;
}

function directoryLinks(html) {
  const links = new Set();
  for (const m of String(html).matchAll(/href="(\/directory\/[^"]+)"/g)) {
    const clean = m[1].replace(/\/\d+(?:\/(?:users|posts|point)\/m\/desc)?\/?$/, '').replace(/\/$/, '');
    if (!/forums-directory$/.test(clean)) links.add(clean);
  }
  return [...links].sort();
}

function forumotionRows(html, discoveryPage) {
  const out = [];
  const blocks = String(html).split(/<div class="search-result">/i).slice(1);
  for (const block of blocks) {
    const h3 = block.match(/<h3[\s\S]*?<a href="(https?:\/\/[^"#]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!h3) continue;
    const desc = block.match(/<\/h3>[\s\S]*?<p>([\s\S]*?)<\/p>/i);
    const row = candidate('forumotion-directory', h3[1], {
      discoveryPage,
      sourceName: decodeHtml(h3[2]),
      sourceDescription: decodeHtml(desc && desc[1]),
    });
    if (row) out.push(row);
  }
  return out;
}

async function discoverForumotion(maxCandidates) {
  const origin = 'https://www.forumotion.com';
  const roots = directoryLinks(await get(`${origin}/`));
  const leaves = new Set();
  for (const root of roots) {
    try {
      const found = directoryLinks(await get(`${origin}${root}`)).filter((x) => x !== root);
      for (const leaf of (found.length ? found : [root])) leaves.add(leaf);
    } catch (e) { console.warn(`Forumotion category ${root}: ${e.message}`); }
  }
  const out = [];
  const pages = Number(arg('--forumotion-pages', '50'));
  for (const leaf of [...leaves].sort()) {
    for (let page = 1; page <= pages; page += 1) {
      const url = `${origin}${leaf}/${page}/posts/m/desc`;
      let rows;
      try { rows = forumotionRows(await get(url), url); }
      catch (e) { console.warn(`Forumotion ${leaf} page ${page}: ${e.message}`); break; }
      if (!rows.length) break;
      out.push(...rows);
      if (out.length >= maxCandidates) return out.slice(0, maxCandidates);
      if (rows.length < 30) break;
    }
  }
  return out;
}

function discoverSoftwareRounds() {
  return SOFTWARE_ROUNDS.map(([softwareHint, url, discoveryPage]) => candidate('software-round', url, {
    discoveryPage, softwareHint,
  })).filter(Boolean);
}

function writeCandidates(all, sourceDiscoveries = all.length) {
  const deduped = new Map();
  for (const row of all) if (!deduped.has(row.key)) deduped.set(row.key, row);
  const candidates = [...deduped.values()].sort((a, b) => a.key.localeCompare(b.key, 'en'));
  CK.writeAtomic(OUT, `${JSON.stringify({
    generatedAt: new Date().toISOString().slice(0, 10),
    methodology: 'Discovery sources only; every accepted record requires a later direct-target finding.',
    discovered: sourceDiscoveries,
    duplicatesRemoved: sourceDiscoveries - candidates.length,
    candidates,
  }, null, 1)}\n`);
  console.log(`Candidates: ${candidates.length} unique (${sourceDiscoveries - candidates.length} discovery duplicates removed).`);
  return candidates;
}

async function main() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  if (process.argv.includes('--append-software-rounds')) {
    if (!fs.existsSync(OUT)) throw new Error('--append-software-rounds requires an existing candidate inventory.');
    const previous = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    const softwareRounds = discoverSoftwareRounds();
    console.log(`Software-family rounds: ${softwareRounds.length}`);
    writeCandidates([...previous.candidates, ...softwareRounds], previous.discovered + softwareRounds.length);
    return;
  }
  const maxForumotion = Number(arg('--forumotion-max', '5000'));
  const all = [];
  const discourse = await discoverDiscourse();
  console.log(`Discourse Discover: ${discourse.length}`);
  all.push(...discourse);
  const stack = await discoverStackExchange();
  console.log(`Stack Exchange main sites: ${stack.length}`);
  all.push(...stack);
  const softwareRounds = discoverSoftwareRounds();
  console.log(`Software-family rounds: ${softwareRounds.length}`);
  all.push(...softwareRounds);
  const forumotion = await discoverForumotion(maxForumotion);
  console.log(`Forumotion directory: ${forumotion.length}`);
  all.push(...forumotion);

  // Discovery dedupe is deliberately host + candidate root. Redirect and
  // Forum entity dedupe happen only after direct verification establishes the
  // destination and its actual forum base path.
  writeCandidates(all);
}

if (require.main === module) main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });

module.exports = { decodeHtml, candidate, directoryLinks, forumotionRows, discoverDiscourse,
  discoverStackExchange, discoverForumotion, discoverSoftwareRounds, writeCandidates, SOFTWARE_ROUNDS };
