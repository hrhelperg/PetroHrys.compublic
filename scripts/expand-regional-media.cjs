#!/usr/bin/env node
'use strict';

// Regional Media Registry — discovery and append-only quality-gated waves.
//
//   node scripts/expand-regional-media.cjs --research
//   node scripts/expand-regional-media.cjs --resume
//   node scripts/expand-regional-media.cjs --report
//   node scripts/expand-regional-media.cjs --apply
//
// Discovery uses explicit Wikidata classes for local and regional newspapers,
// bounded editorial seeds, and curated US and Australian publisher datasets.
// Publication requires a reachable/protected site and a measured Ahrefs DR.
// Link type and publication route are never inferred from the domain: both stay
// unknown until a concrete public article/profile and a route page are checked.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { askAhrefs, apiKey } = require('./research-domain-rating.cjs');
const S = require('./lib/regional-media-schema.cjs');
const D = require('./lib/regional-media-discovery.cjs');
const DFS = require('./lib/dataforseo.cjs');
const { readZip } = require('./lib/to-zip.cjs');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data', 'regional-media');
const DATA = path.join(DATA_DIR, 'regional-media.json');
const FINDINGS = path.join(DATA_DIR, '.regional-media-findings.json');
const COUNTRIES = path.join(ROOT, 'data', 'business-directories', 'countries.json');
const MEDIA = path.join(ROOT, 'data', 'media-pr-publishing', 'media-platforms.json');
const DR_LEDGER = path.join(ROOT, 'data', 'domain-rating', '.ahrefs-domain-rating.json');
const WAVE_HISTORY = path.join(DATA_DIR, '.wave-history.json');
// Raw Wikidata responses. A journal by the repository's own convention: the
// durable half of an interrupted network pass, gitignored because it is a
// cache that discovery rebuilds by fetching, never evidence on its own.
const WIKIDATA_CACHE = path.join(DATA_DIR, '.wikidata-discovery.json.journal');

// The baseline is a fact about what is already published: waves 1, 2 and 3 are
// 300 + 500 + 300 records whose SHA-256 hashes are pinned in .wave-history.json.
//
// EXPANSION_SIZE is NOT a quota. Wave 4 is sized by how many candidates cleared
// every gate — liveness, a newsroom on the inspected page, a publisher-owned
// root, real subnational evidence, and a measured Ahrefs DR of at least 30 —
// and this constant records that count so `--apply` can refuse to publish any
// other number. Changing it to reach a target would mean either dropping
// qualified outlets or admitting unqualified ones.
const BASELINE_SIZE = 1100;
const EXPANSION_SIZE = 3122;
const WAVE_SIZE = BASELINE_SIZE + EXPANSION_SIZE;
const CURRENT_WAVE_ID = 'wave-4';
const MIN_DR = 30;
const TODAY = new Date().toISOString().slice(0, 10);
const USER_AGENT = 'PetroHrys Research Center/1.0 (+https://petrohrys.com)';
const WIKIDATA_ENDPOINT = 'https://query.wikidata.org/sparql';
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const US_LOCAL_SOURCE = 'https://raw.githubusercontent.com/yinleon/LocalNewsDataset/master/data/local_news_dataset_2018_for_domain_analysis.csv';
const PIPI_SOURCE = 'https://gary-dickson.com/wp-content/uploads/2026/07/2606-PIPI-Q2.zip';
const US_LOCAL_LIMIT = 3000;
const PIPI_LIMIT = 2000;
// Every "is this a publisher's own front door" rule now lives in one place,
// shared with the pre-publication audit so the two cannot drift apart.
const SOCIAL_HOST = D.SOCIAL_HOST;

// Exact local/regional classes are always eligible. Broader publication
// classes enter discovery only when Wikidata also carries a subnational scope
// or an explicit regional/local signal in the item's description.
const CORE_WIKIDATA_CLASSES = [
  'Q1868552', // local newspaper
  'Q2138556', // regional newspaper
  'Q106651444', // community newspaper
  'Q11335135', // block newspaper
  'Q14472063', // Welsh local community paper
  'Q2390658', // village newspaper
  'Q3129162', // regional weekly
  'Q3414785', // regional daily press
];
const CONTEXTUAL_WIKIDATA_CLASSES = [
  'Q1110794', // daily newspaper
  'Q2305295', // weekly newspaper
  'Q1153191', // online newspaper
];
const CONTEXTUAL_CLASS_SET = new Set(CONTEXTUAL_WIKIDATA_CLASSES);
const EXPANSION_TARGETS = {
  europe: 350,
  'north-america': 300,
  oceania: 100,
  asia: 150,
  'latin-america-caribbean': 60,
  africa: 40,
};
const EXPANSION_REGION_ORDER = [
  'europe', 'north-america', 'oceania', 'asia', 'latin-america-caribbean', 'africa',
];

const US_STATE_NAMES = {
  AK: 'Alaska', AL: 'Alabama', AR: 'Arkansas', AZ: 'Arizona', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DC: 'District of Columbia', DE: 'Delaware',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', IA: 'Iowa', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', MA: 'Massachusetts',
  MD: 'Maryland', ME: 'Maine', MI: 'Michigan', MN: 'Minnesota', MO: 'Missouri',
  MS: 'Mississippi', MT: 'Montana', NC: 'North Carolina', ND: 'North Dakota',
  NE: 'Nebraska', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico',
  NV: 'Nevada', NY: 'New York', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VA: 'Virginia', VT: 'Vermont',
  WA: 'Washington', WI: 'Wisconsin', WV: 'West Virginia', WY: 'Wyoming',
};
const AU_STATE_NAMES = {
  ACT: 'Australian Capital Territory', NSW: 'New South Wales', NT: 'Northern Territory',
  QLD: 'Queensland', SA: 'South Australia', TAS: 'Tasmania', VIC: 'Victoria',
  WA: 'Western Australia',
};

const compareStable = (a, b) => {
  const left = String(a ?? '');
  const right = String(b ?? '');
  return left < right ? -1 : left > right ? 1 : 0;
};

const slug = (value) => String(value || '').toLowerCase()
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '').slice(0, 72) || 'outlet';

const cleanHost = (url) => S.normaliseHost(url);
const isPublisherOwnedTarget = (row) => D.isPublisherOwnedTarget(row);
const httpsUrl = (url) => {
  try {
    const parsed = new URL(String(url));
    parsed.protocol = 'https:';
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch { return null; }
};

// Dependency-free RFC 4180 reader: both research datasets contain quoted
// commas and PIPI uses a UTF-8 BOM, so line or comma splitting is unsafe.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let index = 0;
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  while (index < input.length) {
    const char = input[index];
    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') { field += '"'; index += 2; continue; }
        quoted = false; index += 1; continue;
      }
      field += char; index += 1; continue;
    }
    if (char === '"') { quoted = true; index += 1; continue; }
    if (char === ',') { row.push(field); field = ''; index += 1; continue; }
    if (char === '\r') { index += 1; continue; }
    if (char === '\n') {
      row.push(field); rows.push(row); row = []; field = ''; index += 1; continue;
    }
    field += char; index += 1;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0];
  return rows.slice(1).filter((value) => value.length > 1)
    .map((value) => Object.fromEntries(header
      .map((key, column) => [key, value[column] === undefined ? '' : value[column]])));
}

// UN-style geographic groupings. The values are stored on every row so the
// page can filter offline; ISO is used only by the network importer.
const GEO = new Map();
function geo(macroRegion, subregion, codes) {
  for (const code of codes.trim().split(/\s+/)) GEO.set(code, { macroRegion, subregion });
}
geo('north-america', 'north-america', 'CA US');
geo('latin-america-caribbean', 'central-america', 'BZ CR GT HN MX NI PA SV');
geo('latin-america-caribbean', 'caribbean', 'AG AI AW BB BL BM BQ BS CU CW DM DO GD GP HT JM KN KY LC MF MQ MS PR SX TC TT VC VG VI');
geo('latin-america-caribbean', 'south-america', 'AR BO BR CL CO EC FK GF GY PE PY SR UY VE');
geo('europe', 'northern-europe', 'AX DK EE FI FO GB GG IE IM IS JE LT LV NO SE');
geo('europe', 'western-europe', 'AT BE CH DE FR LI LU MC NL');
geo('europe', 'eastern-europe', 'BG BY CZ HU MD PL RO RU SK UA');
geo('europe', 'southern-europe', 'AD AL BA ES GI GR HR IT ME MK MT PT RS SI SM VA');
geo('africa', 'northern-africa', 'DZ EG EH LY MA SD TN');
geo('africa', 'western-africa', 'BF BJ CI CV GH GM GN GW LR ML MR NE NG SH SL SN TG');
geo('africa', 'middle-africa', 'AO CD CF CG CM GA GQ ST TD');
geo('africa', 'eastern-africa', 'BI DJ ER ET IO KE KM MG MU MW MZ RE RW SC SO SS TZ UG YT ZM ZW');
geo('africa', 'southern-africa', 'BW LS NA SZ ZA');
geo('asia', 'central-asia', 'KG KZ TJ TM UZ');
geo('asia', 'eastern-asia', 'CN HK JP KP KR MO MN TW');
geo('asia', 'south-eastern-asia', 'BN ID KH LA MM MY PH SG TH TL VN');
geo('asia', 'southern-asia', 'AF BD BT IN LK MV NP PK');
geo('asia', 'western-asia', 'AE AM AZ BH CY GE IL IQ JO KW LB OM PS QA SA SY TR YE');
geo('oceania', 'australia-new-zealand', 'AU NZ NF');
geo('oceania', 'melanesia', 'FJ NC PG SB VU');
geo('oceania', 'micronesia', 'FM GU KI MH MP NR PW UM');
geo('oceania', 'polynesia', 'AS CK NU PF PN TK TO TV WF WS');

const DEFAULT_LANGUAGE = {
  AR: 'es', AT: 'de', AU: 'en', BE: 'nl', BG: 'bg', BR: 'pt', CA: 'en',
  CH: 'de', CL: 'es', CN: 'zh', CO: 'es', CZ: 'cs', DE: 'de', DK: 'da',
  EC: 'es', EE: 'et', EG: 'ar', ES: 'es', FI: 'fi', FR: 'fr', GB: 'en',
  GR: 'el', HK: 'zh', HR: 'hr', HU: 'hu', ID: 'id', IE: 'en', IL: 'he',
  IN: 'en', IS: 'is', IT: 'it', JP: 'ja', KE: 'en', KR: 'ko', LK: 'en',
  LT: 'lt', LV: 'lv', MA: 'ar', MX: 'es', MY: 'en', NG: 'en', NL: 'nl',
  NO: 'no', NZ: 'en', PE: 'es', PH: 'en', PK: 'en', PL: 'pl', PT: 'pt',
  RO: 'ro', RS: 'sr', RU: 'ru', SE: 'sv', SG: 'en', SI: 'sl', SK: 'sk',
  TH: 'th', TR: 'tr', TW: 'zh', UA: 'uk', US: 'en', UY: 'es', VE: 'es',
  VN: 'vi', ZA: 'en', ZW: 'en',
};

// Name | website | ISO2 | coverage area | coverage type | language.
// These are explicit publishers, never generated domains. Live and DR checks
// still decide whether any seed reaches the public registry.
const SUPPLEMENTAL = `
The Boston Globe|https://www.bostonglobe.com|US|Greater Boston and New England|metro-city|en
The Seattle Times|https://www.seattletimes.com|US|Seattle and Washington State|state-province|en
Miami Herald|https://www.miamiherald.com|US|Miami and South Florida|metro-city|en
The Dallas Morning News|https://www.dallasnews.com|US|Dallas-Fort Worth and North Texas|metro-city|en
Houston Chronicle|https://www.houstonchronicle.com|US|Houston and Southeast Texas|metro-city|en
San Francisco Chronicle|https://www.sfchronicle.com|US|San Francisco Bay Area|metro-city|en
Los Angeles Times|https://www.latimes.com|US|Los Angeles and California|state-province|en
Chicago Tribune|https://www.chicagotribune.com|US|Chicago and northern Illinois|metro-city|en
The Denver Post|https://www.denverpost.com|US|Denver and Colorado|state-province|en
The Arizona Republic|https://www.azcentral.com|US|Phoenix and Arizona|state-province|en
The Oregonian|https://www.oregonlive.com|US|Portland and Oregon|state-province|en
Minnesota Star Tribune|https://www.startribune.com|US|Minneapolis-Saint Paul and Minnesota|state-province|en
The Philadelphia Inquirer|https://www.inquirer.com|US|Philadelphia metropolitan area|metro-city|en
Atlanta Journal-Constitution|https://www.ajc.com|US|Atlanta and Georgia|state-province|en
Detroit Free Press|https://www.freep.com|US|Detroit and Michigan|state-province|en
Tampa Bay Times|https://www.tampabay.com|US|Tampa Bay and Florida|metro-city|en
The Charlotte Observer|https://www.charlotteobserver.com|US|Charlotte and the Carolinas|metro-city|en
The Kansas City Star|https://www.kansascity.com|US|Kansas City metropolitan area|metro-city|en
The Sacramento Bee|https://www.sacbee.com|US|Sacramento and northern California|metro-city|en
The San Diego Union-Tribune|https://www.sandiegouniontribune.com|US|San Diego County|county-district|en
The Baltimore Sun|https://www.baltimoresun.com|US|Baltimore and Maryland|state-province|en
Cleveland.com|https://www.cleveland.com|US|Cleveland and northeast Ohio|metro-city|en
Pittsburgh Post-Gazette|https://www.post-gazette.com|US|Pittsburgh and western Pennsylvania|metro-city|en
The Buffalo News|https://buffalonews.com|US|Buffalo and western New York|metro-city|en
St. Louis Post-Dispatch|https://www.stltoday.com|US|St. Louis metropolitan area|metro-city|en
Milwaukee Journal Sentinel|https://www.jsonline.com|US|Milwaukee and Wisconsin|state-province|en
The Salt Lake Tribune|https://www.sltrib.com|US|Salt Lake City and Utah|state-province|en
Las Vegas Review-Journal|https://www.reviewjournal.com|US|Las Vegas and southern Nevada|metro-city|en
Honolulu Civil Beat|https://www.civilbeat.org|US|Honolulu and Hawaii|state-province|en
Alaska Beacon|https://alaskabeacon.com|US|Alaska|state-province|en
The Texas Tribune|https://www.texastribune.org|US|Texas|state-province|en
The Colorado Sun|https://coloradosun.com|US|Colorado|state-province|en
CalMatters|https://calmatters.org|US|California|state-province|en
MinnPost|https://www.minnpost.com|US|Minnesota|state-province|en
VTDigger|https://vtdigger.org|US|Vermont|state-province|en
NJ Spotlight News|https://www.njspotlightnews.org|US|New Jersey|state-province|en
Mississippi Today|https://mississippitoday.org|US|Mississippi|state-province|en
Iowa Capital Dispatch|https://iowacapitaldispatch.com|US|Iowa|state-province|en
Florida Phoenix|https://floridaphoenix.com|US|Florida|state-province|en
The Maine Monitor|https://themainemonitor.org|US|Maine|state-province|en
Arizona Mirror|https://azmirror.com|US|Arizona|state-province|en
Nevada Current|https://nevadacurrent.com|US|Nevada|state-province|en
Louisiana Illuminator|https://lailluminator.com|US|Louisiana|state-province|en
New Mexico In Depth|https://nmindepth.com|US|New Mexico|state-province|en
Vancouver Sun|https://vancouversun.com|CA|Vancouver and British Columbia|state-province|en
Calgary Herald|https://calgaryherald.com|CA|Calgary and southern Alberta|metro-city|en
Edmonton Journal|https://edmontonjournal.com|CA|Edmonton and northern Alberta|metro-city|en
Montreal Gazette|https://montrealgazette.com|CA|Montreal and Quebec|metro-city|en
Ottawa Citizen|https://ottawacitizen.com|CA|Ottawa and eastern Ontario|metro-city|en
Winnipeg Free Press|https://www.winnipegfreepress.com|CA|Winnipeg and Manitoba|state-province|en
The Chronicle Herald|https://www.saltwire.com|CA|Halifax and Atlantic Canada|multi-region|en
Times Colonist|https://www.timescolonist.com|CA|Victoria and Vancouver Island|region|en
The Hamilton Spectator|https://www.thespec.com|CA|Hamilton and southern Ontario|metro-city|en
Waterloo Region Record|https://www.therecord.com|CA|Waterloo Region|region|en
Manchester Evening News|https://www.manchestereveningnews.co.uk|GB|Greater Manchester|metro-city|en
Liverpool Echo|https://www.liverpoolecho.co.uk|GB|Liverpool City Region|metro-city|en
BirminghamLive|https://www.birminghammail.co.uk|GB|Birmingham and the West Midlands|metro-city|en
The Yorkshire Post|https://www.yorkshirepost.co.uk|GB|Yorkshire|region|en
Belfast Telegraph|https://www.belfasttelegraph.co.uk|GB|Belfast and Northern Ireland|region|en
The Scotsman|https://www.scotsman.com|GB|Scotland|region|en
The Press and Journal|https://www.pressandjournal.co.uk|GB|Northern Scotland|region|en
The Courier|https://www.thecourier.co.uk|GB|Dundee, Tayside and Fife|region|en
WalesOnline|https://www.walesonline.co.uk|GB|Wales|region|en
Bristol Live|https://www.bristolpost.co.uk|GB|Bristol and southwest England|metro-city|en
Nottinghamshire Live|https://www.nottinghampost.com|GB|Nottingham and Nottinghamshire|county-district|en
Leicestershire Live|https://www.leicestermercury.co.uk|GB|Leicester and Leicestershire|county-district|en
ChronicleLive|https://www.chroniclelive.co.uk|GB|Newcastle and northeast England|metro-city|en
The Irish Examiner|https://www.irishexaminer.com|IE|Cork and southern Ireland|region|en
Berliner Zeitung|https://www.berliner-zeitung.de|DE|Berlin|metro-city|de
Hamburger Abendblatt|https://www.abendblatt.de|DE|Hamburg and northern Germany|metro-city|de
Kölner Stadt-Anzeiger|https://www.ksta.de|DE|Cologne and North Rhine-Westphalia|metro-city|de
Rheinische Post|https://rp-online.de|DE|Düsseldorf and the Rhineland|region|de
Stuttgarter Nachrichten|https://www.stuttgarter-nachrichten.de|DE|Stuttgart and Baden-Württemberg|metro-city|de
Münchner Merkur|https://www.merkur.de|DE|Munich and Bavaria|region|de
Nürnberger Nachrichten|https://www.nn.de|DE|Nuremberg and Franconia|region|de
Hannoversche Allgemeine|https://www.haz.de|DE|Hanover and Lower Saxony|metro-city|de
Der Tagesspiegel|https://www.tagesspiegel.de|DE|Berlin and Brandenburg|region|de
Ouest-France|https://www.ouest-france.fr|FR|Western France|multi-region|fr
La Voix du Nord|https://www.lavoixdunord.fr|FR|Hauts-de-France|region|fr
Sud Ouest|https://www.sudouest.fr|FR|Nouvelle-Aquitaine|region|fr
La Dépêche du Midi|https://www.ladepeche.fr|FR|Occitanie|region|fr
Nice-Matin|https://www.nicematin.com|FR|Nice and the French Riviera|region|fr
Le Télégramme|https://www.letelegramme.fr|FR|Brittany|region|fr
Le Progrès|https://www.leprogres.fr|FR|Lyon and Auvergne-Rhône-Alpes|region|fr
Il Resto del Carlino|https://www.ilrestodelcarlino.it|IT|Emilia-Romagna and Marche|multi-region|it
La Nazione|https://www.lanazione.it|IT|Tuscany and Umbria|multi-region|it
Il Mattino|https://www.ilmattino.it|IT|Naples and Campania|region|it
Gazzetta di Parma|https://www.gazzettadiparma.it|IT|Parma and Emilia-Romagna|region|it
L'Eco di Bergamo|https://www.ecodibergamo.it|IT|Bergamo and Lombardy|region|it
La Vanguardia|https://www.lavanguardia.com|ES|Barcelona and Catalonia|region|es
El Periódico|https://www.elperiodico.com|ES|Barcelona and Catalonia|region|es
Levante-EMV|https://www.levante-emv.com|ES|Valencian Community|region|es
Diario de Sevilla|https://www.diariodesevilla.es|ES|Seville and Andalusia|region|es
Faro de Vigo|https://www.farodevigo.es|ES|Vigo and Galicia|region|es
La Voz de Galicia|https://www.lavozdegalicia.es|ES|Galicia|region|es
Heraldo de Aragón|https://www.heraldo.es|ES|Aragon|region|es
De Gelderlander|https://www.gelderlander.nl|NL|Gelderland|region|nl
Eindhovens Dagblad|https://www.ed.nl|NL|Eindhoven and North Brabant|region|nl
Dagblad van het Noorden|https://www.dvhn.nl|NL|Groningen and Drenthe|multi-region|nl
Gazet van Antwerpen|https://www.gva.be|BE|Antwerp|region|nl
Het Belang van Limburg|https://www.hbvl.be|BE|Belgian Limburg|region|nl
Göteborgs-Posten|https://www.gp.se|SE|Gothenburg and western Sweden|region|sv
Sydsvenskan|https://www.sydsvenskan.se|SE|Scania|region|sv
Bergens Tidende|https://www.bt.no|NO|Bergen and western Norway|region|no
Stavanger Aftenblad|https://www.aftenbladet.no|NO|Stavanger and Rogaland|region|no
Adresseavisen|https://www.adressa.no|NO|Trondheim and Trøndelag|region|no
Turun Sanomat|https://www.ts.fi|FI|Turku and southwest Finland|region|fi
Gazeta Krakowska|https://gazetakrakowska.pl|PL|Kraków and Lesser Poland|region|pl
Głos Wielkopolski|https://gloswielkopolski.pl|PL|Greater Poland|region|pl
Dziennik Zachodni|https://dziennikzachodni.pl|PL|Silesia|region|pl
Trójmiasto.pl|https://www.trojmiasto.pl|PL|Gdańsk, Gdynia and Sopot|metro-city|pl
Brněnský deník|https://brnensky.denik.cz|CZ|Brno and South Moravia|region|cs
Cluj24|https://cluj24.ro|RO|Cluj County|county-district|ro
Ziarul de Iași|https://www.ziaruldeiasi.ro|RO|Iași County|county-district|ro
Bihoreanul|https://www.ebihoreanul.ro|RO|Bihor County|county-district|ro
Slobodna Dalmacija|https://slobodnadalmacija.hr|HR|Dalmatia|region|hr
Novi list|https://www.novilist.hr|HR|Rijeka and the northern Adriatic|region|hr
The Sydney Morning Herald|https://www.smh.com.au|AU|Sydney and New South Wales|state-province|en
The Age|https://www.theage.com.au|AU|Melbourne and Victoria|state-province|en
Brisbane Times|https://www.brisbanetimes.com.au|AU|Brisbane and Queensland|state-province|en
The Canberra Times|https://www.canberratimes.com.au|AU|Canberra and the Australian Capital Territory|state-province|en
Newcastle Herald|https://www.newcastleherald.com.au|AU|Newcastle and the Hunter Region|region|en
Geelong Advertiser|https://www.geelongadvertiser.com.au|AU|Geelong and western Victoria|region|en
WAtoday|https://www.watoday.com.au|AU|Perth and Western Australia|state-province|en
InDaily|https://www.indaily.com.au|AU|Adelaide and South Australia|state-province|en
Illawarra Mercury|https://www.illawarramercury.com.au|AU|Wollongong and the Illawarra|region|en
Otago Daily Times|https://www.odt.co.nz|NZ|Otago and Southland|multi-region|en
The Press|https://www.thepress.co.nz|NZ|Christchurch and Canterbury|region|en
Waikato Times|https://www.waikatotimes.co.nz|NZ|Waikato|region|en
Tokyo Shimbun|https://www.tokyo-np.co.jp|JP|Tokyo metropolitan area|metro-city|ja
Hokkaido Shimbun|https://www.hokkaido-np.co.jp|JP|Hokkaido|region|ja
Chunichi Shimbun|https://www.chunichi.co.jp|JP|Chūbu region|region|ja
Nishinippon Shimbun|https://www.nishinippon.co.jp|JP|Kyushu|region|ja
Kahoku Shimpo|https://kahoku.news|JP|Tōhoku region|region|ja
Kobe Shimbun|https://www.kobe-np.co.jp|JP|Kobe and Hyōgo Prefecture|region|ja
Okinawa Times|https://www.okinawatimes.co.jp|JP|Okinawa Prefecture|state-province|ja
Ryukyu Shimpo|https://ryukyushimpo.jp|JP|Okinawa Prefecture|state-province|ja
Deccan Herald|https://www.deccanherald.com|IN|Karnataka|state-province|en
Deccan Chronicle|https://www.deccanchronicle.com|IN|Telangana and Andhra Pradesh|multi-region|en
The Assam Tribune|https://assamtribune.com|IN|Assam and northeast India|region|en
Greater Kashmir|https://www.greaterkashmir.com|IN|Jammu and Kashmir|region|en
The Shillong Times|https://theshillongtimes.com|IN|Meghalaya and northeast India|region|en
MindaNews|https://mindanews.com|PH|Mindanao|region|en
SunStar|https://www.sunstar.com.ph|PH|Regional cities across the Philippines|multi-region|en
The Phuket News|https://www.thephuketnews.com|TH|Phuket|region|en
Pattaya Mail|https://www.pattayamail.com|TH|Pattaya and eastern Thailand|metro-city|en
La Voz del Interior|https://www.lavoz.com.ar|AR|Córdoba Province|state-province|es
La Capital|https://www.lacapital.com.ar|AR|Rosario and Santa Fe Province|region|es
Los Andes|https://www.losandes.com.ar|AR|Mendoza Province|state-province|es
El Litoral|https://www.ellitoral.com|AR|Santa Fe Province|state-province|es
O Tempo|https://www.otempo.com.br|BR|Minas Gerais|state-province|pt
Correio Braziliense|https://www.correiobraziliense.com.br|BR|Brasília and the Federal District|state-province|pt
Gazeta do Povo|https://www.gazetadopovo.com.br|BR|Paraná|state-province|pt
A Tarde|https://atarde.com.br|BR|Bahia|state-province|pt
Diário do Nordeste|https://diariodonordeste.verdesmares.com.br|BR|Ceará|state-province|pt
Estado de Minas|https://www.em.com.br|BR|Minas Gerais|state-province|pt
El Informador|https://www.informador.mx|MX|Guadalajara and Jalisco|state-province|es
Noroeste|https://www.noroeste.com.mx|MX|Sinaloa|state-province|es
El Imparcial|https://www.elimparcial.com|MX|Sonora and Baja California|multi-region|es
El Siglo de Torreón|https://www.elsiglodetorreon.com.mx|MX|Comarca Lagunera|region|es
Diario de Yucatán|https://www.yucatan.com.mx|MX|Yucatán|state-province|es
El Colombiano|https://www.elcolombiano.com|CO|Medellín and Antioquia|state-province|es
El País Cali|https://www.elpais.com.co|CO|Cali and Valle del Cauca|state-province|es
Vanguardia|https://www.vanguardia.com|CO|Bucaramanga and Santander|state-province|es
El Heraldo|https://www.elheraldo.co|CO|Barranquilla and Caribbean Colombia|region|es
El Búho|https://elbuho.pe|PE|Arequipa and southern Peru|region|es
El Mercurio|https://elmercurio.com.ec|EC|Cuenca and Azuay|state-province|es
Daily Trust|https://dailytrust.com|NG|Northern Nigeria and Abuja|multi-region|en
The EastAfrican|https://www.theeastafrican.co.ke|KE|East Africa|multi-region|en
Cape Times|https://www.iol.co.za/capetimes|ZA|Cape Town and Western Cape|metro-city|en
Daily News Zimbabwe|https://dailynews.co.zw|ZW|Harare and Zimbabwean regions|multi-region|en
The Namibian|https://www.namibian.com.na|NA|Namibian regions|multi-region|en
The Herald Zimbabwe|https://www.herald.co.zw|ZW|Harare and Mashonaland|region|en
The Chronicle Zimbabwe|https://www.chronicle.co.zw|ZW|Bulawayo and Matabeleland|region|en
The Witness|https://witness.co.za|ZA|Pietermaritzburg and KwaZulu-Natal|region|en
Lowvelder|https://www.citizen.co.za/lowvelder/|ZA|Mbombela and the Lowveld|region|en
George Herald|https://www.georgeherald.com|ZA|George and the Garden Route|region|en
CapeTown ETC|https://www.capetownetc.com|ZA|Cape Town and the Western Cape|metro-city|en
Mmegi|https://www.mmegi.bw|BW|Gaborone and Botswana regions|multi-region|en
Maravi Post|https://www.maravipost.com|MW|Malawi regions|multi-region|en
Daily News Tanzania|https://dailynews.co.tz|TZ|Dar es Salaam and Tanzanian regions|multi-region|en
The New Times Rwanda|https://www.newtimes.co.rw|RW|Kigali and Rwanda regions|multi-region|en
Daily Monitor|https://www.monitor.co.ug|UG|Kampala and Uganda regions|multi-region|en
Graphic Online|https://www.graphic.com.gh|GH|Accra and Ghana regions|multi-region|en
The Point|https://thepoint.gm|GM|Banjul and the Gambia|multi-region|en
Mwananchi|https://www.mwananchi.co.tz|TZ|Tanzanian regions|multi-region|sw
Nigerian Tribune|https://tribuneonlineng.com|NG|Ibadan and southwest Nigeria|region|en
Hull Daily Mail|https://www.hulldailymail.co.uk|GB|Hull and East Yorkshire|metro-city|en
Grimsby Live|https://www.grimsbytelegraph.co.uk|GB|Grimsby and North East Lincolnshire|county-district|en
Stoke-on-Trent Live|https://www.stokesentinel.co.uk|GB|Stoke-on-Trent and Staffordshire|county-district|en
Derbyshire Live|https://www.derbytelegraph.co.uk|GB|Derby and Derbyshire|county-district|en
CoventryLive|https://www.coventrytelegraph.net|GB|Coventry and Warwickshire|metro-city|en
Plymouth Live|https://www.plymouthherald.co.uk|GB|Plymouth and south Devon|metro-city|en
Cornwall Live|https://www.cornwalllive.com|GB|Cornwall|county-district|en
Devon Live|https://www.devonlive.com|GB|Devon|county-district|en
Somerset Live|https://www.somersetlive.co.uk|GB|Somerset|county-district|en
Gloucestershire Live|https://www.gloucestershirelive.co.uk|GB|Gloucestershire|county-district|en
North Wales Live|https://www.dailypost.co.uk|GB|North Wales|region|en
Lancashire Telegraph|https://www.lancashiretelegraph.co.uk|GB|Blackburn and East Lancashire|region|en
The Bolton News|https://www.theboltonnews.co.uk|GB|Bolton and Greater Manchester|local-area|en
The Northern Echo|https://www.thenorthernecho.co.uk|GB|County Durham and the North East|region|en
Teesside Live|https://www.gazettelive.co.uk|GB|Teesside and Middlesbrough|metro-city|en
Sunderland Echo|https://www.sunderlandecho.com|GB|Sunderland and Wearside|metro-city|en
Shields Gazette|https://www.shieldsgazette.com|GB|South Tyneside|local-area|en
Yorkshire Evening Post|https://www.yorkshireeveningpost.co.uk|GB|Leeds and West Yorkshire|metro-city|en
The Sheffield Star|https://www.thestar.co.uk|GB|Sheffield and South Yorkshire|metro-city|en
Hartlepool Mail|https://www.hartlepoolmail.co.uk|GB|Hartlepool|local-area|en
Lincolnshire Live|https://www.lincolnshirelive.co.uk|GB|Lincolnshire|county-district|en
Express & Star|https://www.expressandstar.com|GB|Wolverhampton and the Black Country|region|en
Shropshire Star|https://www.shropshirestar.com|GB|Shropshire|county-district|en
Worcester News|https://www.worcesternews.co.uk|GB|Worcester and Worcestershire|county-district|en
Oxford Mail|https://www.oxfordmail.co.uk|GB|Oxford and Oxfordshire|county-district|en
Swindon Advertiser|https://www.swindonadvertiser.co.uk|GB|Swindon and Wiltshire|county-district|en
Bournemouth Echo|https://www.bournemouthecho.co.uk|GB|Bournemouth and Dorset|county-district|en
Southern Daily Echo|https://www.dailyecho.co.uk|GB|Southampton and Hampshire|metro-city|en
The News Portsmouth|https://www.portsmouth.co.uk|GB|Portsmouth and south Hampshire|metro-city|en
The Argus Brighton|https://www.theargus.co.uk|GB|Brighton and Sussex|region|en
KentOnline|https://www.kentonline.co.uk|GB|Kent|county-district|en
Essex Live|https://www.essexlive.news|GB|Essex|county-district|en
Cambridgeshire Live|https://www.cambridge-news.co.uk|GB|Cambridge and Cambridgeshire|county-district|en
Eastern Daily Press|https://www.edp24.co.uk|GB|Norfolk and East Anglia|region|en
East Anglian Daily Times|https://www.eadt.co.uk|GB|Suffolk and East Anglia|region|en
Watford Observer|https://www.watfordobserver.co.uk|GB|Watford and Hertfordshire|local-area|en
Glasgow Times|https://www.glasgowtimes.co.uk|GB|Glasgow|metro-city|en
The Herald Scotland|https://www.heraldscotland.com|GB|Glasgow and west Scotland|region|en
Evening Express Aberdeen|https://www.eveningexpress.co.uk|GB|Aberdeen and north east Scotland|metro-city|en
Evening Telegraph Dundee|https://www.eveningtelegraph.co.uk|GB|Dundee and Tayside|metro-city|en
The News Letter|https://www.newsletter.co.uk|GB|Belfast and Northern Ireland|region|en
The Irish News|https://www.irishnews.com|GB|Belfast and Northern Ireland|region|en
Derry Journal|https://www.derryjournal.com|GB|Derry and north west Ireland|local-area|en
Examiner Live|https://www.examinerlive.co.uk|GB|Huddersfield and Kirklees|local-area|en
Wigan Today|https://www.wigantoday.net|GB|Wigan|local-area|en
Blackpool Gazette|https://www.blackpoolgazette.co.uk|GB|Blackpool and the Fylde coast|local-area|en
Lancashire Evening Post|https://www.lep.co.uk|GB|Preston and Lancashire|county-district|en
The York Press|https://www.yorkpress.co.uk|GB|York and North Yorkshire|county-district|en
The Scarborough News|https://www.thescarboroughnews.co.uk|GB|Scarborough and the Yorkshire coast|local-area|en
Halifax Courier|https://www.halifaxcourier.co.uk|GB|Halifax and Calderdale|local-area|en
Telegraph & Argus|https://www.thetelegraphandargus.co.uk|GB|Bradford and West Yorkshire|metro-city|en
Shinano Mainichi Shimbun|https://www.shinmai.co.jp|JP|Nagano Prefecture|state-province|ja
Kyoto Shimbun|https://www.kyoto-np.co.jp|JP|Kyoto Prefecture|state-province|ja
Chugoku Shimbun|https://www.chugoku-np.co.jp|JP|Hiroshima and the Chugoku region|region|ja
Shizuoka Shimbun|https://www.at-s.com|JP|Shizuoka Prefecture|state-province|ja
Kanagawa Shimbun|https://www.kanaloco.jp|JP|Kanagawa Prefecture|state-province|ja
Niigata Nippo|https://www.niigata-nippo.co.jp|JP|Niigata Prefecture|state-province|ja
Fukui Shimbun|https://www.fukuishimbun.co.jp|JP|Fukui Prefecture|state-province|ja
Shikoku Shimbun|https://www.shikoku-np.co.jp|JP|Kagawa Prefecture|state-province|ja
Ehime Shimbun|https://www.ehime-np.co.jp|JP|Ehime Prefecture|state-province|ja
Kumamoto Nichinichi Shimbun|https://kumanichi.com|JP|Kumamoto Prefecture|state-province|ja
Minami Nippon Shimbun|https://373news.com|JP|Kagoshima Prefecture|state-province|ja
Iwate Nippo|https://www.iwate-np.co.jp|JP|Iwate Prefecture|state-province|ja
Yamagata Shimbun|https://www.yamagata-np.jp|JP|Yamagata Prefecture|state-province|ja
Akita Sakigake Shimpo|https://www.sakigake.jp|JP|Akita Prefecture|state-province|ja
Fukushima Minpo|https://www.minpo.jp|JP|Fukushima Prefecture|state-province|ja
Shimotsuke Shimbun|https://www.shimotsuke.co.jp|JP|Tochigi Prefecture|state-province|ja
Jomo Shimbun|https://www.jomo-news.co.jp|JP|Gunma Prefecture|state-province|ja
Chiba Nippo|https://www.chibanippo.co.jp|JP|Chiba Prefecture|state-province|ja
Saitama Shimbun|https://www.saitama-np.co.jp|JP|Saitama Prefecture|state-province|ja
Gifu Shimbun|https://www.gifu-np.co.jp|JP|Gifu Prefecture|state-province|ja
Nara Shimbun|https://www.nara-np.co.jp|JP|Nara Prefecture|state-province|ja
Sanyo Shimbun|https://www.sanyonews.jp|JP|Okayama Prefecture|state-province|ja
Nihonkai Shimbun|https://www.nnn.co.jp|JP|Tottori Prefecture|state-province|ja
Kochi Shimbun|https://www.kochinews.co.jp|JP|Kochi Prefecture|state-province|ja
Saga Shimbun|https://www.saga-s.co.jp|JP|Saga Prefecture|state-province|ja
Nagasaki Shimbun|https://www.nagasaki-np.co.jp|JP|Nagasaki Prefecture|state-province|ja
Oita Godo Shimbun|https://www.oita-press.co.jp|JP|Oita Prefecture|state-province|ja
Miyazaki Nichinichi Shimbun|https://www.the-miyanichi.co.jp|JP|Miyazaki Prefecture|state-province|ja
To-o Nippo|https://www.toonippo.co.jp|JP|Aomori Prefecture|state-province|ja
Hokkoku Shimbun|https://www.hokkoku.co.jp|JP|Ishikawa Prefecture|state-province|ja
Kitanippon Shimbun|https://www.kitanippon.co.jp|JP|Toyama Prefecture|state-province|ja
Yamanashi Nichinichi Shimbun|https://www.sannichi.co.jp|JP|Yamanashi Prefecture|state-province|ja
Ise Shimbun|https://www.isenp.co.jp|JP|Mie Prefecture|state-province|ja
Sanin Chuo Shimpo|https://www.sanin-chuo.co.jp|JP|Shimane Prefecture|state-province|ja
Yamaguchi Shimbun|https://www.minato-yamaguchi.co.jp|JP|Yamaguchi Prefecture|state-province|ja
Tokushima Shimbun|https://www.topics.or.jp|JP|Tokushima Prefecture|state-province|ja
Ibaraki Shimbun|https://ibarakinews.jp|JP|Ibaraki Prefecture|state-province|ja
The Hitavada|https://www.thehitavada.com|IN|Nagpur and Vidarbha|region|en
The Tribune India|https://www.tribuneindia.com|IN|Punjab, Haryana and Himachal Pradesh|multi-region|en
The Telegraph India|https://www.telegraphindia.com|IN|Kolkata and eastern India|region|en
Mathrubhumi|https://www.mathrubhumi.com|IN|Kerala|state-province|ml
Malayala Manorama|https://www.manoramaonline.com|IN|Kerala|state-province|ml
Dinamalar|https://www.dinamalar.com|IN|Tamil Nadu|state-province|ta
Sakal|https://www.sakal.com|IN|Maharashtra|state-province|mr
Lokmat|https://www.lokmat.com|IN|Maharashtra|state-province|mr
Eenadu|https://www.eenadu.net|IN|Andhra Pradesh and Telangana|multi-region|te
Sakshi|https://www.sakshi.com|IN|Andhra Pradesh and Telangana|multi-region|te
Prajavani|https://www.prajavani.net|IN|Karnataka|state-province|kn
Gujarat Samachar|https://www.gujaratsamachar.com|IN|Gujarat|state-province|gu
Divya Bhaskar|https://www.divyabhaskar.co.in|IN|Gujarat|state-province|gu
Anandabazar Patrika|https://www.anandabazar.com|IN|West Bengal|state-province|bn
Rajasthan Patrika|https://www.patrika.com|IN|Rajasthan|state-province|hi
Nagaland Post|https://www.nagalandpost.com|IN|Nagaland|state-province|en
Imphal Free Press|https://ifp.co.in|IN|Manipur|state-province|en
The Arunachal Times|https://arunachaltimes.in|IN|Arunachal Pradesh|state-province|en
Sikkim Express|https://www.sikkimexpress.com|IN|Sikkim|state-province|en
Kashmir Life|https://kashmirlife.net|IN|Jammu and Kashmir|region|en
Rising Kashmir|https://risingkashmir.com|IN|Jammu and Kashmir|region|en
The Sentinel Assam|https://www.sentinelassam.com|IN|Assam|state-province|en
Orissa Post|https://www.orissapost.com|IN|Odisha|state-province|en
Telangana Today|https://telanganatoday.com|IN|Telangana|state-province|en
Herald Goa|https://www.heraldgoa.in|IN|Goa|state-province|en
Panay News|https://www.panaynews.net|PH|Panay Island and Western Visayas|region|en
Mindanao Times|https://mindanaotimes.com.ph|PH|Davao and Mindanao|region|en
Baguio Midland Courier|https://baguiomidlandcourier.com.ph|PH|Baguio and the Cordilleras|region|en
Bohol Chronicle|https://www.boholchronicle.com.ph|PH|Bohol|state-province|en
Pikiran Rakyat|https://www.pikiran-rakyat.com|ID|West Java|state-province|id
Solopos|https://www.solopos.com|ID|Surakarta and Central Java|region|id
Suara Merdeka|https://www.suaramerdeka.com|ID|Central Java|state-province|id
Bali Post|https://www.balipost.com|ID|Bali|state-province|id
Harian Jogja|https://harianjogja.com|ID|Yogyakarta|state-province|id
Analisa Daily|https://analisadaily.com|ID|North Sumatra|state-province|id
Riau Pos|https://riaupos.jawapos.com|ID|Riau|state-province|id
The Borneo Post|https://www.theborneopost.com|MY|Sarawak and Borneo|region|en
Daily Express Sabah|https://www.dailyexpress.com.my|MY|Sabah|state-province|en
New Sarawak Tribune|https://www.newsarawaktribune.com.my|MY|Sarawak|state-province|en
Busan Ilbo|https://www.busan.com|KR|Busan|metro-city|ko
Kookje Shinmun|https://www.kookje.co.kr|KR|Busan and South Gyeongsang|region|ko
Maeil Shinmun|https://www.imaeil.com|KR|Daegu and North Gyeongsang|region|ko
Jeonbuk Ilbo|https://www.jjan.kr|KR|North Jeolla|state-province|ko
Gangwon Ilbo|https://www.kwnews.co.kr|KR|Gangwon|state-province|ko
Jemin Ilbo|https://www.jemin.com|KR|Jeju|state-province|ko
Halla Ilbo|https://www.ihalla.com|KR|Jeju|state-province|ko
Zululand Observer|https://zululandobserver.co.za|ZA|Zululand, KwaZulu-Natal|region|en
Highway Mail|https://highwaymail.co.za|ZA|Durban Highway area|local-area|en
Northglen News|https://northglennews.co.za|ZA|Durban North|local-area|en
Sandton Chronicle|https://sandtonchronicle.co.za|ZA|Sandton, Johannesburg|local-area|en
Fourways Review|https://fourwaysreview.co.za|ZA|Fourways, Johannesburg|local-area|en
Roodepoort Record|https://roodepoortrecord.co.za|ZA|Roodepoort, Johannesburg|local-area|en
Benoni City Times|https://benonicitytimes.co.za|ZA|Benoni, Ekurhuleni|local-area|en
Boksburg Advertiser|https://boksburgadvertiser.co.za|ZA|Boksburg, Ekurhuleni|local-area|en
Germiston City News|https://germistoncitynews.co.za|ZA|Germiston, Ekurhuleni|local-area|en
Kempton Express|https://kemptonexpress.co.za|ZA|Kempton Park, Ekurhuleni|local-area|en
Midrand Reporter|https://midrandreporter.co.za|ZA|Midrand, Johannesburg|local-area|en
Randfontein Herald|https://randfonteinherald.co.za|ZA|Randfontein, West Rand|local-area|en
Springs Advertiser|https://springsadvertiser.co.za|ZA|Springs, Ekurhuleni|local-area|en
Alex News|https://alexnews.co.za|ZA|Alexandra, Johannesburg|local-area|en
Soweto Urban|https://soweturban.co.za|ZA|Soweto, Johannesburg|local-area|en
Bloemfontein Courant|https://www.bloemfonteincourant.co.za|ZA|Bloemfontein and the Free State|region|en
Knysna-Plett Herald|https://www.knysnaplettherald.com|ZA|Knysna and Plettenberg Bay|local-area|en
Mossel Bay Advertiser|https://www.mosselbayadvertiser.com|ZA|Mossel Bay and the Garden Route|local-area|en
TygerBurger|https://www.tygerburger.co.za|ZA|Northern Suburbs of Cape Town|local-area|en
People's Post|https://www.peoplespost.co.za|ZA|Southern Suburbs of Cape Town|local-area|en
Namibian Sun|https://www.namibiansun.com|NA|Namibian regions|multi-region|en
Sunday Standard Botswana|https://www.sundaystandard.info|BW|Gaborone and Botswana regions|multi-region|en
Nyasa Times|https://www.nyasatimes.com|MW|Malawi regions|multi-region|en
Le Mauricien|https://www.lemauricien.com|MU|Mauritian districts|multi-region|fr
Diário de Pernambuco|https://www.diariodepernambuco.com.br|BR|Pernambuco|state-province|pt
O Popular|https://www.opopular.com.br|BR|Goiás|state-province|pt
Correio do Povo|https://www.correiodopovo.com.br|BR|Rio Grande do Sul|state-province|pt
NSC Total|https://www.nsctotal.com.br|BR|Santa Catarina|state-province|pt
O Povo|https://www.opovo.com.br|BR|Ceará|state-province|pt
A Gazeta|https://www.agazeta.com.br|BR|Espírito Santo|state-province|pt
O Liberal|https://www.oliberal.com|BR|Pará|state-province|pt
Correio 24 Horas|https://www.correio24horas.com.br|BR|Bahia|state-province|pt
Campo Grande News|https://www.campograndenews.com.br|BR|Mato Grosso do Sul|state-province|pt
Midiamax|https://www.midiamax.com.br|BR|Mato Grosso do Sul|state-province|pt
El Diario de Juárez|https://diario.mx|MX|Ciudad Juárez and Chihuahua|region|es
El Norte|https://www.elnorte.com|MX|Monterrey and Nuevo León|metro-city|es
Mural|https://www.mural.com.mx|MX|Guadalajara and Jalisco|metro-city|es
La Jornada Maya|https://www.lajornadamaya.mx|MX|Yucatán Peninsula|region|es
El Sur de Acapulco|https://suracapulco.mx|MX|Guerrero|state-province|es
Zeta Tijuana|https://zetatijuana.com|MX|Tijuana and Baja California|region|es
El Debate|https://www.debate.com.mx|MX|Sinaloa|state-province|es
El Día La Plata|https://www.eldia.com|AR|La Plata and Buenos Aires Province|region|es
La Nueva|https://www.lanueva.com|AR|Bahía Blanca|metro-city|es
Río Negro|https://www.rionegro.com.ar|AR|Río Negro and Patagonia|region|es
El Tribuno|https://www.eltribuno.com|AR|Salta and Jujuy|multi-region|es
La Gaceta|https://www.lagaceta.com.ar|AR|Tucumán|state-province|es
Diario Uno Mendoza|https://www.diariouno.com.ar|AR|Mendoza|state-province|es
El Territorio|https://www.elterritorio.com.ar|AR|Misiones|state-province|es
Diario Norte|https://www.diarionorte.com|AR|Chaco|state-province|es
Diario Concepción|https://www.diarioconcepcion.cl|CL|Concepción and Biobío|region|es
El Día La Serena|https://www.diarioeldia.cl|CL|Coquimbo|region|es
La Patria Manizales|https://www.lapatria.com|CO|Manizales and Caldas|state-province|es
El Universal Cartagena|https://www.eluniversal.com.co|CO|Cartagena and Bolívar|region|es
Diario del Huila|https://www.diariodelhuila.com|CO|Huila|state-province|es
El Nuevo Día Ibagué|https://www.elnuevodia.com.co|CO|Ibagué and Tolima|state-province|es
Diario Correo|https://diariocorreo.pe|PE|Regional Peru|multi-region|es
La Industria|https://laindustria.pe|PE|Trujillo and La Libertad|region|es
El Deber|https://eldeber.com.bo|BO|Santa Cruz|state-province|es
Los Tiempos|https://www.lostiempos.com|BO|Cochabamba|state-province|es
Opinión Cochabamba|https://www.opinion.com.bo|BO|Cochabamba|state-province|es
The Gisborne Herald|https://www.gisborneherald.co.nz|NZ|Gisborne and Tairāwhiti|region|en
Wairarapa Times-Age|https://times-age.co.nz|NZ|Wairarapa|region|en
Ashburton Guardian|https://www.ashburtonguardian.co.nz|NZ|Mid Canterbury|region|en
Greymouth Star|https://www.greymouthstar.co.nz|NZ|West Coast|region|en
`;

function countryContext() {
  const rows = JSON.parse(fs.readFileSync(COUNTRIES, 'utf8'));
  const displayNames = new Intl.DisplayNames(['en'], { type: 'region' });
  for (const iso2 of GEO.keys()) {
    if (rows.some((row) => row.iso2 === iso2)) continue;
    const name = displayNames.of(iso2);
    if (!name || name === iso2) continue;
    rows.push({ id: slug(name), slug: slug(name), name, entityType: 'country', titleName: name, iso2 });
  }
  return {
    byIso: new Map(rows.filter((row) => row.iso2).map((row) => [row.iso2, row])),
    bySlug: new Map(rows.map((row) => [row.slug, row])),
  };
}

function seedCandidates() {
  const { byIso } = countryContext();
  return SUPPLEMENTAL.trim().split('\n').map((line) => {
    const [name, websiteRaw, iso2, coverageArea, coverageType, language] = line.split('|');
    const website = httpsUrl(websiteRaw);
    const country = byIso.get(iso2);
    const region = GEO.get(iso2);
    if (!website || !country || !region) throw new Error(`Invalid supplemental seed: ${line}`);
    return {
      name, website, host: cleanHost(website), country: country.slug,
      countryName: country.name, iso2, ...region, coverageArea, coverageType,
      languages: [language], publicationType: 'newspaper',
      sourceKind: 'editorial-seed', regionalEvidence: 'editorial-seed', sourceUrl: website,
    };
  });
}

function balancedSample(rows, groupOf, limit, compare) {
  const groups = new Map();
  for (const row of rows) {
    const key = groupOf(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  for (const group of groups.values()) group.sort(compare);
  const keys = [...groups.keys()].sort(compareStable);
  const out = [];
  let cursor = 0;
  while (out.length < limit && keys.some((key) => groups.get(key).length)) {
    const key = keys[cursor % keys.length];
    const next = groups.get(key).shift();
    if (next) out.push(next);
    cursor += 1;
  }
  return out;
}

async function fetchSource(url, label) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function usLocalCandidates() {
  const csv = (await fetchSource(US_LOCAL_SOURCE, 'US Local News Dataset')).toString('utf8');
  const rows = parseCsv(csv);
  const { byIso } = countryContext();
  const country = byIso.get('US');
  const ratings = loadFreshDomainRatings();
  const grouped = new Map();
  // College newspapers are excluded: the audience is a campus, not a place, and
  // the dataset's own category made The Harvard Crimson a "Massachusetts local
  // newspaper" with a Domain Rating of 81.
  const acceptedMedia = new Set(['Newspapers', 'TV station']);
  for (const row of rows) {
    const state = String(row.state || '').toUpperCase();
    const host = cleanHost(`https://${row.domain || ''}`);
    if (!country || !US_STATE_NAMES[state] || !host || SOCIAL_HOST.test(host)
      || !acceptedMedia.has(row.medium)) continue;
    if (!grouped.has(host)) grouped.set(host, []);
    grouped.get(host).push(row);
  }
  const candidates = [];
  for (const [host, matches] of grouped) {
    const states = [...new Set(matches.map((row) => row.state.toUpperCase()))];
    if (states.length !== 1) continue;
    const row = matches.slice().sort((a, b) => compareStable(a.name, b.name))[0];
    const state = states[0];
    candidates.push({
      name: row.name.trim(), website: `https://${host}`, host,
      country: country.slug, countryName: country.name, iso2: 'US',
      ...GEO.get('US'), coverageArea: US_STATE_NAMES[state], coverageType: 'state-province',
      languages: ['en'],
      publicationType: row.medium === 'TV station' ? 'news-broadcaster'
        : row.medium === 'College Newspapers' ? 'community-news' : 'newspaper',
      sourceKind: 'mit-us-local-dataset', sourceUrl: US_LOCAL_SOURCE,
      regionalEvidence: 'curated-regional-dataset', sourceGroup: state,
    });
  }
  const compare = (a, b) => (ratings.get(b.host)?.value || -1) - (ratings.get(a.host)?.value || -1)
    || compareStable(a.name, b.name) || compareStable(a.host, b.host);
  return balancedSample(candidates, (row) => row.sourceGroup, US_LOCAL_LIMIT, compare);
}

async function pipiCandidates() {
  const archive = await fetchSource(PIPI_SOURCE, 'Public Interest Publishers Index');
  const entry = readZip(archive).find((item) => /Producers\.csv$/i.test(item.name));
  if (!entry) throw new Error('Public Interest Publishers Index: Producers CSV is missing.');
  const rows = parseCsv(entry.data.toString('utf8'));
  const { byIso } = countryContext();
  const country = byIso.get('AU');
  const ratings = loadFreshDomainRatings();
  const grouped = new Map();
  for (const row of rows) {
    const state = String(row.State || '').toUpperCase();
    const website = httpsUrl(row.URL);
    const host = cleanHost(website);
    if (!country || row['Version Status'] !== 'Current' || row['Outlet status'] !== 'Open'
      || !['Community', 'Local', 'Metro', 'State'].includes(row.Scale)
      || !AU_STATE_NAMES[state] || !website || !host || SOCIAL_HOST.test(host)) continue;
    if (!grouped.has(host)) grouped.set(host, []);
    grouped.get(host).push({ row, website, host, state });
  }
  const candidates = [];
  for (const matches of grouped.values()) {
    if (new Set(matches.map((item) => item.row.Name)).size !== 1) continue;
    const { row, website, host, state } = matches[0];
    const coverageArea = String(row.LGAs || '').trim() || AU_STATE_NAMES[state];
    candidates.push({
      name: row.Name.trim(), website, host,
      country: country.slug, countryName: country.name, iso2: 'AU',
      ...GEO.get('AU'), coverageArea,
      coverageType: row.Scale === 'State' ? 'state-province'
        : row.Scale === 'Metro' ? 'metro-city' : 'local-area',
      languages: ['en'], publicationType: row['Primary Format'] === 'Digital'
        ? 'digital-news' : /Newspaper/i.test(row['Sub Formats']) ? 'newspaper' : 'community-news',
      sourceKind: 'pipi-australia', sourceUrl: PIPI_SOURCE,
      regionalEvidence: 'curated-regional-dataset', sourceGroup: state,
    });
  }
  const compare = (a, b) => (ratings.get(b.host)?.value || -1) - (ratings.get(a.host)?.value || -1)
    || compareStable(a.name, b.name) || compareStable(a.host, b.host);
  return balancedSample(candidates, (row) => row.sourceGroup, PIPI_LIMIT, compare);
}

// WDQS enforces its own sixty-second limit but does not always close the
// connection when it gives up, and a `fetch` with no timeout inherits that: a
// single stalled socket silently ends a discovery pass that is otherwise
// resumable. Every request therefore carries its own deadline.
const SPARQL_TIMEOUT_MS = 180000;

// WDQS occasionally emits a raw control character inside a string literal —
// a stray U+0007 or U+001F that reached Wikidata inside somebody's P856 value
// — and `res.json()` then rejects an otherwise perfectly good 5,000-row
// answer. Reading the body as text and escaping those characters recovers the
// response instead of discarding a whole class over one bad byte.
function parseSparqlBody(text) {
  const repaired = text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
  return JSON.parse(repaired);
}

async function sparql(type) {
  const query = `SELECT ?item ?website ?country ?iso2 ?hq ?publicationPlace ?scope ?languageCode WHERE {
    ?item wdt:P31 wd:${type}; wdt:P856 ?website.
    {
      ?item wdt:P17 ?country.
    } UNION {
      FILTER NOT EXISTS { ?item wdt:P17 ?declaredCountry. }
      ?item wdt:P159/wdt:P17 ?country.
    }
    ?country wdt:P297 ?iso2.
    OPTIONAL { ?item wdt:P159 ?hq. }
    OPTIONAL { ?item wdt:P291 ?publicationPlace. }
    OPTIONAL { ?item wdt:P1001 ?scope. }
    OPTIONAL { ?item wdt:P407 ?language. OPTIONAL { ?language wdt:P424 ?languageCode. } }
  } ORDER BY ?item`;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const url = new URL(WIKIDATA_ENDPOINT);
    url.searchParams.set('query', query);
    url.searchParams.set('format', 'json');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SPARQL_TIMEOUT_MS);
    let res;
    try {
      // eslint-disable-next-line no-await-in-loop
      res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/sparql-results+json' },
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timer);
      if (attempt === 3) throw new Error(`Wikidata ${type}: ${error.name === 'AbortError' ? 'timeout' : error.message}`);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => { setTimeout(resolve, attempt * 1500); });
      continue;
    }
    clearTimeout(timer);
    if (res.ok) {
      // eslint-disable-next-line no-await-in-loop
      return (await res.json()).results.bindings.map((row) => ({ ...row, classId: type }));
    }
    if (![429, 502, 503, 504].includes(res.status) || attempt === 3) {
      throw new Error(`Wikidata ${type}: HTTP ${res.status}`);
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, attempt * 1500); });
  }
  return [];
}

// Descriptions are read in EVERY language, not just English. Wikidata's
// English descriptions are sparse outside the anglosphere — 355 of 5,038
// newspapers with a website carry a regional English one, against 1,011 once
// every language counts — and reading only `en` is what would have quietly
// restricted wave 4 to English-speaking countries.
async function entityDetails(ids) {
  const labels = new Map();
  const descriptions = new Map();
  const unique = [...new Set(ids)].filter(Boolean);
  const batches = Math.ceil(unique.length / 50);
  for (let i = 0; i < unique.length; i += 50) {
    const url = new URL(WIKIDATA_API);
    for (const [key, value] of Object.entries({
      action: 'wbgetentities', ids: unique.slice(i, i + 50).join('|'),
      props: 'labels|descriptions', format: 'json', formatversion: '2',
    })) url.searchParams.set(key, value);
    let body = null;
    for (let attempt = 1; attempt <= 4 && !body; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 45000);
      try {
        // eslint-disable-next-line no-await-in-loop
        const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: controller.signal });
        // eslint-disable-next-line no-await-in-loop
        if (res.ok) body = await res.json();
        else if (attempt === 4) throw new Error(`Wikidata labels: HTTP ${res.status}`);
      } catch (error) {
        if (attempt === 4) throw error;
      } finally {
        clearTimeout(timer);
      }
      // eslint-disable-next-line no-await-in-loop
      if (!body) await new Promise((resolve) => { setTimeout(resolve, attempt * 2000); });
    }
    const batch = i / 50 + 1;
    if (batches > 20 && batch % 50 === 0) console.log(`  labels ${batch}/${batches}`);
    for (const entity of Object.values(body.entities || {})) {
      const labelSet = entity.labels || {};
      const chosen = labelSet.en || labelSet.mul || labelSet.de || labelSet.fr || labelSet.es
        || Object.values(labelSet).sort((a, b) => compareStable(a.language, b.language))[0];
      if (chosen) labels.set(entity.id, chosen.value);
      // Every description is concatenated, not just one language's. A German
      // item may say only "Tageszeitung" in German and "regional daily
      // newspaper for the Rhineland" in English, or the reverse; picking one
      // language throws away the half that carries the coverage claim.
      const descriptionSet = entity.descriptions || {};
      const values = Object.values(descriptionSet)
        .sort((a, b) => compareStable(a.language, b.language))
        .map((entry) => entry.value);
      if (values.length) descriptions.set(entity.id, values.join(' | ').slice(0, 2000));
    }
  }
  return { labels, descriptions };
}

const qid = (binding, field) => binding[field]
  && binding[field].value.split('/').pop();

async function wikidataCandidates() {
  const rows = [];
  for (const classId of [...CORE_WIKIDATA_CLASSES, ...CONTEXTUAL_WIKIDATA_CLASSES]) {
    try {
      // Sequential requests keep WDQS stable for the two high-volume classes.
      // eslint-disable-next-line no-await-in-loop
      rows.push(...await sparql(classId));
    } catch (error) {
      console.warn(`Wikidata class ${classId} unavailable: ${error.message}`);
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, 350); });
  }
  const itemIds = rows.map((row) => qid(row, 'item'));
  const placeIds = rows.flatMap((row) => ['hq', 'publicationPlace', 'scope']
    .map((field) => qid(row, field))).filter(Boolean);
  const { labels, descriptions } = await entityDetails([...itemIds, ...placeIds]);
  const { byIso } = countryContext();
  const grouped = new Map();
  for (const row of rows) {
    const item = qid(row, 'item');
    const iso2 = row.iso2 && row.iso2.value.toUpperCase();
    const country = byIso.get(iso2);
    const region = GEO.get(iso2);
    const website = httpsUrl(row.website && row.website.value);
    if (!item || !country || !region || !website) continue;
    const host = cleanHost(website);
    if (!host) continue;
    const classId = row.classId;
    const description = descriptions.get(item) || '';
    const scopeId = qid(row, 'scope');
    const countryId = qid(row, 'country');
    const publicationPlaceId = qid(row, 'publicationPlace');
    const hqId = qid(row, 'hq');
    const explicitSubnationalScope = Boolean(scopeId && scopeId !== countryId);
    const regionalDescription = /\b(local|regional|community|municipal|metropolitan|county|district|provincial|state|province|prefecture|territorial|city|town|village|borough|neighbou?rhood|island|serving)\b/i
      .test(description);
    const nationalDescription = /\b(national|nationwide|countrywide|newspaper of record)\b/i
      .test(description);
    const coverageArea = labels.get(scopeId) || labels.get(publicationPlaceId)
      || labels.get(hqId) || `Local or regional market in ${country.name}`;
    const locationMatch = coverageArea && description.toLocaleLowerCase()
      .includes(coverageArea.toLocaleLowerCase());
    const weeklyWithPlace = classId === 'Q2305295' && Boolean(publicationPlaceId || hqId);
    if (CONTEXTUAL_CLASS_SET.has(classId)
      && ((!explicitSubnationalScope && !regionalDescription && !locationMatch && !weeklyWithPlace)
        || nationalDescription)) continue;
    const coverageType = /\b(county|district|borough)\b/i.test(description) ? 'county-district'
      : /\b(state|province|prefecture|territor)\b/i.test(description) ? 'state-province'
        : /\b(city|metropolitan|municipal)\b/i.test(description) ? 'metro-city'
          : /\b(multi-region|several regions)\b/i.test(description) ? 'multi-region'
            : /\bregional|region\b/i.test(description) ? 'region'
              : classId === 'Q2138556' || classId === 'Q3129162' || classId === 'Q3414785'
                ? 'region' : 'local-area';
    const existing = grouped.get(host) || {
      name: labels.get(item) || host,
      website, host, country: country.slug, countryName: country.name, iso2,
      ...region,
      coverageArea,
      coverageType,
      languages: [],
      publicationType: classId === 'Q1153191' ? 'digital-news'
        : classId === 'Q106651444' ? 'community-news' : 'newspaper',
      sourceKind: CONTEXTUAL_CLASS_SET.has(classId) ? 'wikidata-contextual' : 'wikidata-core',
      regionalEvidence: CONTEXTUAL_CLASS_SET.has(classId)
        ? explicitSubnationalScope ? 'structured-jurisdiction'
          : regionalDescription ? 'regional-description'
            : locationMatch ? 'description-location-match' : 'weekly-publication-place'
        : 'regional-class',
      sourceUrl: `https://www.wikidata.org/wiki/${item}`, wikidataId: item,
    };
    const code = row.languageCode && row.languageCode.value.toLowerCase();
    if (code && /^[a-z]{2}$/.test(code)) existing.languages.push(code);
    grouped.set(host, existing);
  }
  for (const candidate of grouped.values()) {
    if (!candidate.languages.length) candidate.languages.push(DEFAULT_LANGUAGE[candidate.iso2] || 'en');
    candidate.languages = [...new Set(candidate.languages)].sort();
  }
  return [...grouped.values()];
}

// ── WAVE-4 BROADENING: EVIDENCE-GATED WIKIDATA SUBCLASS DISCOVERY ───────────
//
// The starting code queried, per country, every instance of any subclass of
// newspaper / online newspaper / television station / radio station / "news
// website", and admitted a candidate that merely carried a headquarters. Three
// things were wrong with it and all three are fixed here.
//
//   1. Q1580166 is "dictionary entry", not "news website". Its descendants are
//      Wiktionary pages and ghost words. The root is dropped.
//   2. A headquarters is not coverage. See lib/regional-media-discovery.cjs.
//   3. `wdt:P31/wdt:P279*` per country times out on WDQS for any large country
//      — Germany returned 502 every time. Discovery instead resolves the
//      subclass closure ONCE, then queries flat `wdt:P31 wd:<class>` per class,
//      splitting only the handful of classes too large to answer in one go.
//
// Every response is cached in the journal so an interrupted pass resumes
// without re-asking WDQS for work it already did.

function readCache() {
  const empty = { version: 2, subclasses: null, iso: null, counts: {}, items: {} };
  if (!fs.existsSync(WIKIDATA_CACHE)) return empty;
  try {
    const cache = JSON.parse(fs.readFileSync(WIKIDATA_CACHE, 'utf8'));
    return { ...empty, ...cache, counts: cache.counts || {}, items: cache.items || {} };
  } catch {
    return empty;
  }
}

function writeCache(cache) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(WIKIDATA_CACHE, JSON.stringify(cache));
}

let throttleUntil = 0;

async function runSparql(query, label, attempts = 4) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (throttleUntil > Date.now()) {
      const wait = throttleUntil - Date.now();
      console.log(`  waiting ${Math.ceil(wait / 1000)}s for the WDQS rate window to reopen`);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => { setTimeout(resolve, wait); });
    }
    const url = new URL(WIKIDATA_ENDPOINT);
    url.searchParams.set('query', query);
    url.searchParams.set('format', 'json');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SPARQL_TIMEOUT_MS);
    try {
      // eslint-disable-next-line no-await-in-loop
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/sparql-results+json' },
        signal: controller.signal,
      });
      if (res.ok) {
        // eslint-disable-next-line no-await-in-loop
        const body = parseSparqlBody(await res.text());
        return body.results.bindings;
      }
      if (![429, 500, 502, 503, 504].includes(res.status) || attempt === attempts) {
        console.warn(`  ${label}: HTTP ${res.status}`);
        return null;
      }
      // A 429 is WDQS saying the client is over its budget for the minute.
      // Retrying in three seconds spends the next minute's budget on the same
      // refusal, so a throttle waits out the window instead.
      throttleUntil = res.status === 429
        ? Math.max(throttleUntil, Date.now() + 60000) : throttleUntil;
    } catch (error) {
      if (attempt === attempts) {
        console.warn(`  ${label}: ${error.name === 'AbortError' ? 'timeout' : error.message}`);
        return null;
      }
    } finally {
      clearTimeout(timer);
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, attempt * 5000); });
  }
  return null;
}

// The subclass closure of the four roots, with labels so a class nobody has
// classified by hand can still be refused on what it calls itself.
async function subclassClosure(cache) {
  if (cache.subclasses) return cache.subclasses;
  const closure = {};
  for (const [root, rootLabel] of Object.entries(D.WIKIDATA_ROOTS)) {
    // eslint-disable-next-line no-await-in-loop
    const rows = await runSparql(
      `SELECT DISTINCT ?type ?typeLabel WHERE { ?type wdt:P279* wd:${root}. `
      + 'SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }',
      `subclasses of ${rootLabel}`,
    );
    if (!rows) continue;
    for (const row of rows) {
      const id = row.type.value.split('/').pop();
      if (!/^Q\d+$/.test(id)) continue;
      if (!closure[id]) closure[id] = { label: row.typeLabel ? row.typeLabel.value : '', rootKind: rootLabel };
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, 1200); });
  }
  cache.subclasses = closure;
  writeCache(cache);
  return closure;
}

// Classes are filtered BEFORE any item query runs: refusing "student
// newspaper" here costs one comparison, and refusing it after fetching its
// items costs a WDQS round trip plus a label lookup plus an HTTP probe.
function eligibleClasses(closure) {
  const out = [];
  for (const [id, meta] of Object.entries(closure)) {
    if (D.EXCLUDED_CLASSES.has(id)) continue;
    if (meta.label && D.EXCLUDED_CLASS_LABEL.test(meta.label)) continue;
    out.push({ id, ...meta });
  }
  return out.sort((a, b) => compareStable(a.id, b.id));
}

// A class with no websited members costs one COUNT instead of seven SELECTs,
// and most of the taxonomy is that shape.
async function classCount(cache, classId) {
  if (Number.isInteger(cache.counts[classId])) return cache.counts[classId];
  const rows = await runSparql(
    `SELECT (COUNT(DISTINCT ?item) AS ?n) WHERE { ?item wdt:P31 wd:${classId}; wdt:P856 ?w; wdt:P17 ?c. }`,
    `count ${classId}`,
  );
  // An unanswered COUNT is not a zero. Caching it as one would drop the class
  // from every future pass as well as this one.
  if (!rows || !rows[0]) return null;
  const value = Number(rows[0].n.value);
  cache.counts[classId] = Number.isFinite(value) ? value : 0;
  writeCache(cache);
  return cache.counts[classId];
}

// ── WHY DISCOVERY ASKS SEVEN CHEAP QUESTIONS INSTEAD OF ONE RICH ONE ────────
//
// The obvious query joins P856, P17 and six OPTIONALs in one SELECT. It works
// for Ireland and New Zealand and returns HTTP 504 for newspaper (Q11032,
// 5,038 items) and radio station (Q14350, 18,453) — every time, at every page
// size, with or without a country filter. OPTIONAL blocks multiply rows, and
// WDQS gives up before it finishes materialising the product.
//
// Each property is therefore asked for on its own: one two-column query per
// property per class, joined locally by item id. Seven small queries beat one
// query that never answers, and each one is cached separately, so a pass
// interrupted between properties resumes without repeating the ones that
// succeeded.

const OPTIONAL_PROPERTIES = [
  ['hq', '?item wdt:P159 ?raw.'],
  ['publicationPlace', '?item wdt:P291 ?raw.'],
  ['scope', '?item wdt:P1001 ?raw.'],
  ['operatingArea', '?item wdt:P2541 ?raw.'],
  ['locatedIn', '?item wdt:P131 ?raw.'],
  ['languageCode', '?item wdt:P407 ?language. ?language wdt:P424 ?raw.'],
];

// Two decisions here, both bought with a 504.
//
// GROUP BY holds the answer to one row per item: an outlet with three website
// statements and two country statements otherwise yields six identical rows.
//
// The country's ISO code is NOT joined in. Adding `?c wdt:P297 ?iso` to this
// pattern turns a three-second query into a sixty-five-second timeout for
// newspaper, radio station and television station alike — every large class in
// the taxonomy. The 262-row ISO table is fetched once instead and the join
// happens in memory, where it costs nothing.
const baseQuery = (classId) => `SELECT ?item (SAMPLE(?w) AS ?website) (SAMPLE(?c) AS ?country) WHERE {
  ?item wdt:P31 wd:${classId}; wdt:P856 ?w; wdt:P17 ?c.
} GROUP BY ?item`;

async function countryIsoMap(cache) {
  if (cache.iso) return cache.iso;
  const rows = await runSparql('SELECT ?country ?iso WHERE { ?country wdt:P297 ?iso. }', 'ISO country table');
  if (!rows) return null;
  const map = {};
  for (const row of rows) map[tail(row.country.value)] = row.iso.value.toUpperCase();
  cache.iso = map;
  writeCache(cache);
  return map;
}

const propertyQuery = (classId, pattern) => `SELECT ?item (SAMPLE(?raw) AS ?value) WHERE {
  ?item wdt:P31 wd:${classId}; wdt:P856 ?w.
  ${pattern}
} GROUP BY ?item`;

const tail = (value) => (value ? String(value).split('/').pop() : null);

async function fetchClassItems(cache, klass, placeable, isoByCountry) {
  if (cache.items[klass.id]) return cache.items[klass.id];
  const count = await classCount(cache, klass.id);
  if (count === null) return null;
  if (!count) return [];

  const base = await runSparql(baseQuery(klass.id), `${klass.id} base`);
  // A failed base query is not an empty class. Returning [] and caching it is
  // exactly how newspaper — the largest class in the taxonomy — disappeared
  // from an earlier pass without a word.
  if (!base) { console.warn(`  ${klass.id}: base query unavailable; will retry on the next pass.`); return null; }

  const byItem = new Map();
  for (const row of base) {
    const item = tail(row.item && row.item.value);
    const countryId = tail(row.country && row.country.value);
    const iso2 = isoByCountry[countryId] || '';
    if (!item || !row.website || !placeable.has(iso2)) continue;
    if (byItem.has(item)) continue;
    byItem.set(item, {
      item,
      website: row.website.value,
      iso2,
      countryId,
      hq: null,
      publicationPlace: null,
      scope: null,
      operatingArea: null,
      locatedIn: null,
      languageCode: null,
    });
  }
  if (!byItem.size) { cache.items[klass.id] = []; writeCache(cache); return []; }

  for (const [field, pattern] of OPTIONAL_PROPERTIES) {
    // eslint-disable-next-line no-await-in-loop
    const rows = await runSparql(propertyQuery(klass.id, pattern), `${klass.id} ${field}`);
    for (const row of rows || []) {
      const target = byItem.get(tail(row.item && row.item.value));
      if (!target || target[field]) continue;
      target[field] = field === 'languageCode'
        ? String(row.value.value).toLowerCase() : tail(row.value && row.value.value);
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, 400); });
  }

  const shaped = [...byItem.values()];
  cache.items[klass.id] = shaped;
  writeCache(cache);
  return shaped;
}

// The ISO codes the registry can place geographically. Anything outside this
// set has no macro region or subregion, so it could never be published.
const PLACEABLE_ISOS = new Set(GEO.keys());

async function wikidataSubclassCandidates() {
  const cache = readCache();
  const closure = await subclassClosure(cache);
  const classes = eligibleClasses(closure);
  console.log(`Wikidata: ${Object.keys(closure).length} subclasses, ${classes.length} eligible after class-level exclusions.`);

  const isoByCountry = await countryIsoMap(cache);
  if (!isoByCountry) throw new Error('Wikidata ISO country table unavailable; discovery cannot place anything.');

  const raw = [];
  const unavailable = [];
  const byClass = new Map();
  let done = 0;
  for (const klass of classes) {
    done += 1;
    // eslint-disable-next-line no-await-in-loop
    const rows = await fetchClassItems(cache, klass, PLACEABLE_ISOS, isoByCountry);
    if (done % 10 === 0) console.log(`  classes ${done}/${classes.length}`);
    if (rows === null) { unavailable.push(klass.id); continue; }
    if (!rows.length) continue;
    byClass.set(klass.id, klass);
    for (const row of rows) raw.push({ ...row, classId: klass.id });
  }
  writeCache(cache);
  if (unavailable.length) {
    console.warn(`Wikidata: ${unavailable.length} class(es) could not be read this pass and are NOT counted as empty: ${unavailable.join(', ')}`);
  }
  console.log(`Wikidata: ${raw.length} raw item rows across ${byClass.size} classes.`);

  const placeIds = raw.flatMap((row) => [row.hq, row.publicationPlace, row.scope,
    row.operatingArea, row.locatedIn]).filter(Boolean);
  const { labels, descriptions } = await entityDetails([
    ...raw.map((row) => row.item), ...placeIds,
  ]);

  const { byIso } = countryContext();
  const grouped = new Map();
  const refusals = new Map();
  const refuse = (reason) => refusals.set(reason, (refusals.get(reason) || 0) + 1);

  for (const row of raw) {
    const country = byIso.get(row.iso2);
    const region = GEO.get(row.iso2);
    const website = httpsUrl(row.website);
    if (!country || !region || !website) { refuse('unplaceable country or URL'); continue; }
    const host = cleanHost(website);
    const rejection = D.hostRejection(host, website);
    if (rejection) { refuse(rejection); continue; }

    const klass = byClass.get(row.classId);
    const description = descriptions.get(row.item) || '';
    // A jurisdiction or operating area counts only when it is something other
    // than the outlet's own country: "applies to France" on a French paper is
    // a restatement of P17, not a subnational claim.
    const scopeId = [row.scope, row.operatingArea]
      .find((value) => value && value !== row.countryId) || null;
    const placeId = row.publicationPlace || row.hq || row.locatedIn;
    const placeName = labels.get(placeId) || '';
    const verdict = D.classifyRegionalEvidence({
      classId: row.classId,
      classLabel: klass ? klass.label : '',
      description,
      hasSubnationalScope: Boolean(scopeId),
      scopeName: labels.get(scopeId) || '',
      hasPlace: Boolean(placeId),
      placeName,
      rootKind: klass ? klass.rootKind : 'newspaper',
    });
    if (!verdict.eligible) { refuse(verdict.reason); continue; }

    const coverageArea = labels.get(scopeId) || placeName
      || `Local or regional market in ${country.name}`;
    const licensedBroadcast = verdict.evidence === 'licensed-local-broadcast';
    const rootKind = klass ? klass.rootKind : 'newspaper';
    const publicationType = rootKind === 'television station' || rootKind === 'radio station'
      ? 'news-broadcaster'
      : rootKind === 'online newspaper' ? 'digital-news'
        : D.REGIONAL_CLASSES.has(row.classId) && /community|papur|village|neighborhood/i.test(klass ? klass.label : '')
          ? 'community-news' : 'newspaper';

    const existing = grouped.get(host) || {
      name: labels.get(row.item) || host,
      website,
      host,
      country: country.slug,
      countryName: country.name,
      iso2: row.iso2,
      ...region,
      coverageArea,
      coverageType: D.coverageTypeFor({ description, classId: row.classId, licensedBroadcast }),
      languages: [],
      publicationType,
      sourceKind: 'wikidata-subclass',
      regionalEvidence: verdict.evidence,
      wikidataClass: row.classId,
      sourceUrl: `https://www.wikidata.org/wiki/${row.item}`,
      wikidataId: row.item,
    };
    // Keep the strongest evidence when one host answers under several classes.
    if (grouped.has(host)
      && (D.EVIDENCE_CONFIDENCE[verdict.evidence] || 0)
        > (D.EVIDENCE_CONFIDENCE[existing.regionalEvidence] || 0)) {
      existing.regionalEvidence = verdict.evidence;
      existing.wikidataClass = row.classId;
      existing.coverageArea = coverageArea;
    }
    const code = row.languageCode && row.languageCode.toLowerCase();
    if (code && /^[a-z]{2}$/.test(code)) existing.languages.push(code);
    grouped.set(host, existing);
  }

  for (const candidate of grouped.values()) {
    if (!candidate.languages.length) candidate.languages.push(DEFAULT_LANGUAGE[candidate.iso2] || 'en');
    candidate.languages = [...new Set(candidate.languages)].sort();
  }
  const topRefusals = [...refusals].sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([reason, n]) => `${reason}=${n}`).join(', ');
  console.log(`Wikidata: ${grouped.size} candidates after the regional gate. Refused: ${topRefusals}`);
  return { candidates: [...grouped.values()], refusals: Object.fromEntries(refusals) };
}

// Deduplication and validity BEFORE any paid call. Every host removed here is
// an Ahrefs request that never has to be made, and the two blocklists — the
// published regional corpus and Media, PR & Publishing — are read from the
// files themselves rather than restated, so they cannot fall out of date.
function blockedHosts() {
  const blocked = new Set();
  for (const row of JSON.parse(fs.readFileSync(MEDIA, 'utf8'))) {
    const host = cleanHost(row.website);
    if (host) blocked.add(host);
  }
  for (const row of loadExistingRecords()) {
    const host = cleanHost(row.website);
    if (host) blocked.add(host);
  }
  return blocked;
}

function dedupe(rows, counters = {}) {
  const blocked = blockedHosts();
  const bump = (key) => { counters[key] = (counters[key] || 0) + 1; };
  const byHost = new Map();
  for (const row of rows) {
    if (!row.host) { bump('unparseable host'); continue; }
    const rejection = D.hostRejection(row.host, row.website);
    if (rejection) { bump(rejection); continue; }
    if (blocked.has(row.host)) { bump('already published in this or a sibling collection'); continue; }
    const previous = byHost.get(row.host);
    if (!previous) { byHost.set(row.host, row); continue; }
    bump('duplicate host across sources');
    // Editorial coverage detail wins over a generic Wikidata headquarters, and
    // otherwise the stronger regional evidence wins.
    const better = row.sourceKind === 'editorial-seed'
      || (D.EVIDENCE_CONFIDENCE[row.regionalEvidence] || 0)
        > (D.EVIDENCE_CONFIDENCE[previous.regionalEvidence] || 0);
    if (better && previous.sourceKind !== 'editorial-seed') byHost.set(row.host, row);
  }
  return [...byHost.values()].sort((a, b) => compareStable(a.host, b.host));
}

// Words that appear in the navigation of a newsroom and essentially nowhere
// else, in the languages this registry actually reaches. A licensed broadcast
// station with a locality still has to prove it publishes journalism: a
// music-format station is a regional business, not a regional news surface,
// and the registry's whole premise is that a record names somewhere a story
// could run.
const NEWSROOM_MARKER = new RegExp([
  'news', 'headlines', 'breaking', 'nyheter', 'nyheder', 'nyhende', 'nieuws',
  'nachrichten', 'aktuelles', 'meldungen', 'lokales', 'actualit[ée]s',
  'noticias', 'notizie', 'not[íi]cias', 'cronaca', 'wiadomo[śs]ci',
  'aktuality', 'zpr[áa]vy', 'spravodajstvo', 'h[íi]rek', '[șs]tiri', 'vijesti',
  'novice', 'novosti', 'uutiset', 'nauda', 'zi[ņn]as', 'naujienos',
  'новини', 'новости', 'актуально', 'ειδ[ήη]σεις', 'haberler', 'g[üu]ndem',
  'أخبار', 'חדשות', 'ニュース', '新聞', '新闻', '報道', '뉴스', '기사',
  'berita', 'kabar', 'ข่าว', 'tin t[ứu]c', 'th[ờo]i s[ựu]',
  'editorial', 'journal', 'reportage', 'obituar', 'classifieds',
].join('|'), 'i');

// Structured proof of an operating newsroom that survives a JS-only shell:
// a feed, a news sitemap, or NewsArticle/NewsMediaOrganization markup.
const NEWSROOM_MARKUP = /(application\/(rss|atom)\+xml)|(type=["\']?(NewsArticle|NewsMediaOrganization|Newspaper|BroadcastService))|news-?sitemap/i;

function newsroomSignal(html, text, title) {
  const nav = `${title} ${text.slice(0, 6000)}`;
  const markers = [];
  if (NEWSROOM_MARKER.test(nav)) markers.push('newsroom-vocabulary');
  if (NEWSROOM_MARKUP.test(html.slice(0, 200000))) markers.push('feed-or-news-markup');
  // A dated headline block is what a live newsroom looks like and a brochure
  // site never does.
  if (/\b(20[12]\d)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/.test(html.slice(0, 200000))) {
    markers.push('dated-content');
  }
  return markers;
}

async function probeSite(row) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18000);
  try {
    const res = await fetch(row.website, {
      redirect: 'follow', signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
    });
    const protectedResponse = [401, 403, 429].includes(res.status);
    let html = '';
    if (res.ok) html = (await res.text()).slice(0, 500000);
    const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    const title = ((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '')
      .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
    const parked = /domain (is|may be) for sale|buy this domain|sedo\.com|hugedomains|afternic|parking page|this domain is parked|под[её]мный домен/i
      .test(`${title} ${text.slice(0, 1800)}`);
    const finalHost = cleanHost(res.url);
    const moved = Boolean(finalHost && finalHost !== row.host);
    const newsroom = res.ok ? newsroomSignal(html, text, title) : [];
    return {
      state: moved ? 'redirected' : res.ok && text.length >= 200 && !parked ? 'live'
        : protectedResponse ? 'protected' : 'failed',
      status: res.status, finalUrl: res.url, title, textLength: text.length,
      parked, moved, newsroom, checkedAt: TODAY,
    };
  } catch (error) {
    return { state: 'failed', error: error.name === 'AbortError' ? 'timeout' : error.message, checkedAt: TODAY };
  } finally { clearTimeout(timer); }
}

// DataForSEO is consulted only where the direct probe could not settle the
// question — a block page, a 5xx, a TLS or timeout failure — and never for a
// candidate that answered cleanly. It returns a liveness reading and nothing
// that could be mistaken for an authority metric; see lib/dataforseo.cjs.
async function secondOpinion(finding) {
  if (!DFS.configured() || !DFS.shouldConsult(finding.site)) return null;
  const reading = await DFS.siteIndexed(finding.host);
  if (!reading || reading.error) return reading || null;
  return reading;
}

function loadFreshDomainRatings() {
  const ledger = JSON.parse(fs.readFileSync(DR_LEDGER, 'utf8'));
  return new Map(ledger.findings.filter((row) => row.state === 'MEASURED'
    && Number.isInteger(row.domainRating)).map((row) => [row.target, {
    value: row.domainRating, provider: 'Ahrefs', status: 'publicApiReading', measuredAt: row.checkedAt,
  }]));
}

// Is there already a publishable wave in hand? Every Ahrefs call past that
// point is money spent measuring a domain that will not be selected, so the
// pass stops once each regional target is met with a margin wide enough to
// survive the false-authority audit.
const SELECTION_MARGIN = 1.25;

// Which domains are worth a paid Ahrefs call, in what order. A candidate that
// failed the free gates — dead, parked, blocked host, no newsroom on the page
// — never reaches this queue, so the budget buys measurements of domains that
// could actually be published.
function measurementQueue(candidates, findings, limit = 20000) {
  const existingHosts = new Set(loadExistingRecords().map((row) => cleanHost(row.website)));
  const confidence = D.EVIDENCE_CONFIDENCE;
  const eligible = candidates.filter((row) => {
    const finding = findings.candidates[row.host];
    if (!finding || !finding.site || existingHosts.has(row.host)) return false;
    if (!['live', 'protected'].includes(finding.site.state) || finding.site.parked) return false;
    if (finding.domainRating && Number.isInteger(finding.domainRating.value)) return false;
    return newsroomEstablished({ ...row, site: finding.site });
  }).sort((a, b) => (confidence[b.regionalEvidence] || 0) - (confidence[a.regionalEvidence] || 0)
    || compareStable(a.name, b.name) || compareStable(a.host, b.host));
  // Budgets and weights are DEMAND-DRIVEN, not constants. Wave 4's pool is
  // 4,600 unmeasured North American broadcast candidates against 92 African
  // ones, and a fixed weighting spends the budget where the candidates are
  // rather than where the wave is short. A region already at its target buys
  // nothing by being measured further; a region 35 short of a 40 target has to
  // be measured out to the last candidate before the shortfall is real.
  const publishedHosts = new Set(loadExistingRecords().map((row) => cleanHost(row.website)));
  const already = viable(findings).filter((row) => !publishedHosts.has(row.host));
  const deficit = Object.fromEntries(EXPANSION_REGION_ORDER.map((region) => [region,
    Math.max(0, Math.ceil(EXPANSION_TARGETS[region] * SELECTION_MARGIN)
      - already.filter((row) => row.macroRegion === region).length),
  ]));
  const supply = Object.fromEntries(EXPANSION_REGION_ORDER.map((region) => [region,
    eligible.filter((row) => row.macroRegion === region).length,
  ]));
  // A region whose whole remaining pool is smaller than four times its
  // shortfall is scarce: measure all of it, because there is no later.
  // `--all` measures the entire eligible pool instead of just enough to fill
  // the regional targets. It is the right mode when the wave is sized by what
  // qualifies rather than by a quota: there is no "enough" to stop at, so
  // every candidate that could be published gets its reading.
  const measureEverything = process.argv.includes('--all');
  const budgets = Object.fromEntries(EXPANSION_REGION_ORDER.map((region) => [region,
    measureEverything || supply[region] <= deficit[region] * 4 ? supply[region]
      : Math.min(supply[region], Math.max(200, deficit[region] * 4)),
  ]));
  const weights = Object.fromEntries(EXPANSION_REGION_ORDER.map((region) => [region,
    Math.min(8, Math.max(1, Math.ceil(deficit[region] / 40))),
  ]));
  console.log(`Ahrefs plan: ${EXPANSION_REGION_ORDER
    .map((region) => `${region} need=${deficit[region]} pool=${supply[region]} budget=${budgets[region]} weight=${weights[region]}`)
    .join('; ')}`);
  const queues = Object.fromEntries(EXPANSION_REGION_ORDER.map((region) => [region,
    eligible.filter((candidate) => candidate.macroRegion === region).slice(0, budgets[region]),
  ]));
  const selected = [];
  const hosts = new Set();
  while (selected.length < limit
    && EXPANSION_REGION_ORDER.some((region) => queues[region].length)) {
    for (const region of EXPANSION_REGION_ORDER) {
      for (let index = 0; index < weights[region] && queues[region].length; index += 1) {
        const row = queues[region].shift();
        if (!hosts.has(row.host)) { selected.push(row); hosts.add(row.host); }
      }
    }
  }
  for (const row of eligible) {
    if (selected.length >= limit) break;
    if (!hosts.has(row.host)) { selected.push(row); hosts.add(row.host); }
  }
  return selected.slice(0, limit);
}

// The same window the central Ahrefs ledger uses for a Domain Rating reading.
const PROBE_FRESH_DAYS = 7;

function isFresh(checkedAt) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(checkedAt || ''))) return false;
  const age = (Date.parse(`${TODAY}T00:00:00Z`) - Date.parse(`${checkedAt}T00:00:00Z`))
    / 86400000;
  return Number.isFinite(age) && age >= 0 && age < PROBE_FRESH_DAYS;
}

const writeFindings = (value) => {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FINDINGS, `${JSON.stringify(value, null, 2)}\n`);
};

function targetsMet(findings) {
  const good = viable(findings);
  const published = new Set(loadExistingRecords().map((row) => cleanHost(row.website)));
  const fresh = good.filter((row) => !published.has(row.host));
  if (fresh.length < EXPANSION_SIZE * SELECTION_MARGIN) return false;
  return EXPANSION_REGION_ORDER.every((region) => fresh
    .filter((row) => row.macroRegion === region).length
    >= Math.ceil(EXPANSION_TARGETS[region] * SELECTION_MARGIN));
}

async function measureFindings(findings, candidates, key) {
  const toMeasure = measurementQueue(candidates, findings);
  console.log(`Ahrefs: measuring up to ${toMeasure.length} geographically prioritised domains this pass.`);
  for (let index = 0; index < toMeasure.length; index += 1) {
    const row = toMeasure[index];
    const finding = findings.candidates[row.host];
    // eslint-disable-next-line no-await-in-loop
    const measured = await askAhrefs(row.host, key);
    finding.domainRating = measured.ok
      ? { value: measured.domainRating, provider: 'Ahrefs', status: 'publicApiReading', measuredAt: TODAY }
      : { error: measured.why, measuredAt: TODAY };
    if ((index + 1) % 25 === 0) {
      writeFindings(findings);
      const good = viable(findings).length;
      console.log(`  measured ${index + 1}/${toMeasure.length} (viable pool ${good})`);
      if (!process.argv.includes('--all') && targetsMet(findings)) {
        console.log(`  every regional target is covered with a ${SELECTION_MARGIN}x margin; stopping early.`);
        break;
      }
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, 1200); });
  }
  findings.generatedAt = TODAY;
  writeFindings(findings);
  report(findings);
}

async function resumeResearch() {
  const key = apiKey();
  if (!key) throw new Error('AHREFS_API_KEY is required for --resume.');
  if (!fs.existsSync(FINDINGS)) throw new Error('Run --research before --resume.');
  const findings = JSON.parse(fs.readFileSync(FINDINGS, 'utf8'));
  const candidates = Object.values(findings.candidates).map((row) => {
    const { site, domainRating, liveness, ...candidate } = row;
    return candidate;
  });
  await measureFindings(findings, candidates, key);
}

// Discovery, probing and measurement are three separate stages with three
// separate costs — WDQS time, HTTP time, and Ahrefs money — and each writes
// its result before the next begins. A pass interrupted in the middle of the
// expensive stage resumes from the cheap stages' output rather than repeating
// them.
async function discoverCandidates() {
  // The two curated datasets are one HTTP GET each against unrelated hosts, so
  // they run alongside everything. The two Wikidata passes are NOT parallel:
  // WDQS budgets by client, and running them together simply spent that budget
  // twice as fast and earned a 429 instead of results.
  const curated = Promise.all([
    usLocalCandidates().catch((error) => {
      console.warn(`US local-news discovery unavailable: ${error.message}`);
      return [];
    }),
    pipiCandidates().catch((error) => {
      console.warn(`Australian PIPI discovery unavailable: ${error.message}`);
      return [];
    }),
  ]);
  const subclassScoped = await wikidataSubclassCandidates().catch((error) => {
    console.warn(`Wikidata subclass discovery unavailable: ${error.message}`);
    return { candidates: [], refusals: {} };
  });
  const classScoped = await wikidataCandidates().catch((error) => {
    console.warn(`Wikidata class discovery unavailable: ${error.message}; continuing with curated sources.`);
    return [];
  });
  const [usLocal, pipi] = await curated;
  const seeds = seedCandidates();
  const subclass = subclassScoped.candidates || [];
  const raw = [...seeds, ...classScoped, ...subclass, ...usLocal, ...pipi];
  const dedupeCounters = {};
  const candidates = dedupe(raw, dedupeCounters);
  const funnel = {
    discovered: {
      'editorial-seed': seeds.length,
      'wikidata-class': classScoped.length,
      'wikidata-subclass': subclass.length,
      'mit-us-local-dataset': usLocal.length,
      'pipi-australia': pipi.length,
      total: raw.length,
    },
    regionalGateRefusals: subclassScoped.refusals || {},
    dedupeRefusals: dedupeCounters,
    unique: candidates.length,
  };
  console.log(`Sources: ${Object.entries(funnel.discovered).map(([k, v]) => `${k}=${v}`).join(', ')}.`);
  console.log(`Regional media discovery: ${candidates.length} unique candidate domains after dedupe and host gates.`);
  return { candidates, funnel };
}

function loadFindings() {
  return fs.existsSync(FINDINGS)
    ? JSON.parse(fs.readFileSync(FINDINGS, 'utf8'))
    : { version: 1, generatedAt: TODAY, candidates: {} };
}

async function probeStage(findings, candidates) {
  const ledgerRatings = loadFreshDomainRatings();
  const currentHosts = new Set(candidates.map((row) => row.host));
  let pruned = 0;
  for (const host of Object.keys(findings.candidates)) {
    if (!currentHosts.has(host)) { delete findings.candidates[host]; pruned += 1; }
  }
  if (pruned) console.log(`Pruned ${pruned} stale candidate(s) that discovery no longer produces.`);

  let cursor = 0;
  let ambiguous = 0;
  // Sixteen workers rather than eight: the pool wave 4 discovers is an order of
  // magnitude larger than wave 3's, most of the wall-clock is spent waiting on
  // dead hosts to time out, and every request goes to a different origin, so
  // the concurrency is spread across thousands of servers rather than aimed at
  // any one of them.
  const workers = Array.from({ length: 16 }, async () => {
    while (cursor < candidates.length) {
      const row = candidates[cursor++];
      const before = findings.candidates[row.host];
      // Freshness, not equality. A pass that starts before midnight and adds a
      // handful of candidates the next morning would otherwise re-probe all
      // nineteen thousand hosts to learn nothing, and the run is meant to be
      // resumable across exactly that boundary.
      if (before && before.site && isFresh(before.site.checkedAt)
        && typeof before.site.moved === 'boolean' && Array.isArray(before.site.newsroom)) {
        findings.candidates[row.host] = {
          ...row, site: before.site, domainRating: before.domainRating, liveness: before.liveness,
        };
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const site = await probeSite(row);
      const finding = {
        ...row, site, domainRating: (before && before.domainRating) || ledgerRatings.get(row.host),
      };
      if (DFS.configured() && DFS.shouldConsult(site)) {
        ambiguous += 1;
        // eslint-disable-next-line no-await-in-loop
        const reading = await secondOpinion(finding);
        if (reading) finding.liveness = reading;
      }
      findings.candidates[row.host] = finding;
      if (cursor % 50 === 0) {
        writeFindings(findings);
        console.log(`  probed ${cursor}/${candidates.length}`);
      }
    }
  });
  await Promise.all(workers);
  writeFindings(findings);
  const states = new Map();
  for (const row of Object.values(findings.candidates)) {
    const state = row.site ? row.site.state : 'unresearched';
    states.set(state, (states.get(state) || 0) + 1);
  }
  console.log(`Probe: ${[...states].map(([k, v]) => `${k}=${v}`).join(', ')}.`);
  if (!DFS.configured()) {
    console.log('DataForSEO: not configured; ambiguous probes stay ambiguous rather than guessed.');
  } else {
    console.log(`DataForSEO: consulted for ${ambiguous} ambiguous probe(s); liveness only, never a metric.`);
  }
}

async function research() {
  const key = apiKey();
  if (!key) throw new Error('AHREFS_API_KEY is required for --research.');
  const { candidates, funnel } = await discoverCandidates();
  const findings = loadFindings();
  findings.funnel = funnel;
  await probeStage(findings, candidates);
  await measureFindings(findings, candidates, key);
}

async function discoverOnly() {
  const { candidates, funnel } = await discoverCandidates();
  const findings = loadFindings();
  findings.funnel = funnel;
  findings.pendingCandidates = candidates;
  findings.generatedAt = TODAY;
  writeFindings(findings);
  console.log(`Discovery cached: ${candidates.length} candidates awaiting a probe pass.`);
}

async function probeOnly() {
  const findings = loadFindings();
  const candidates = findings.pendingCandidates
    || Object.values(findings.candidates).map(({ site, domainRating, liveness, ...row }) => row);
  if (!candidates.length) throw new Error('Run --discover before --probe.');
  await probeStage(findings, candidates);
  delete findings.pendingCandidates;
  findings.generatedAt = TODAY;
  writeFindings(findings);
}


// A candidate the registry is willing to publish. Every clause is a gate the
// brief names, and none of them is relaxed to reach a target: a short wave is
// a smaller wave, not a weaker one.
//
// `newsroomEstablished` is why a licensed local radio station has to earn its
// place. The licence proves it serves a locality; only the homepage proves it
// runs a newsroom, and a station that plays music all day is a regional
// business rather than a regional news surface.
function newsroomEstablished(row) {
  if (!row.site) return false;
  // A protected host answered with a block page, so its homepage could not be
  // read. The evidence that it is a newsroom then has to come from discovery
  // — a class that MEANS local newspaper, or a curated regional press index —
  // rather than from a page nobody was allowed to see.
  if (row.site.state === 'protected') {
    return ['regional-class', 'curated-regional-dataset', 'editorial-seed', 'structured-jurisdiction']
      .includes(row.regionalEvidence);
  }
  return Array.isArray(row.site.newsroom) && row.site.newsroom.length > 0;
}

function viable(findings) {
  return Object.values(findings.candidates).filter((row) => S.MACRO_REGIONS.includes(row.macroRegion)
    && S.SUBREGIONS.includes(row.subregion)
    // One rule, not two. Every liveness, newsroom, host, evidence, coverage
    // and Domain Rating condition lives in `falseAuthorityProblems`, so a
    // candidate the audit would refuse can never be one selection took.
    && !falseAuthorityProblems(row, { includeAdvisory: false }).length);
}

function rank(a, b) {
  const confidence = D.EVIDENCE_CONFIDENCE;
  return (confidence[b.regionalEvidence] || 0) - (confidence[a.regionalEvidence] || 0)
    || b.domainRating.value - a.domainRating.value
    || compareStable(a.name, b.name) || compareStable(a.host, b.host);
}

function loadExistingRecords() {
  return fs.existsSync(DATA) ? JSON.parse(fs.readFileSync(DATA, 'utf8')) : [];
}

function expansionBaseline(records = loadExistingRecords(), history = null) {
  if (records.length !== WAVE_SIZE || !fs.existsSync(WAVE_HISTORY)) return records;
  const waveHistory = history || JSON.parse(fs.readFileSync(WAVE_HISTORY, 'utf8'));
  const currentWave = waveHistory.waves.find((wave) => wave.id === CURRENT_WAVE_ID);
  if (!currentWave) return records;
  const currentIds = new Set(Object.keys(currentWave.recordHashes || {}));
  return records.filter((row) => !currentIds.has(row.id));
}

function selectExpansion(findings, existingRecords = loadExistingRecords()) {
  const existingHosts = new Set(existingRecords.map((row) => cleanHost(row.website)));
  const ordered = viable(findings).filter((row) => !existingHosts.has(row.host)).sort(rank);
  const selected = [];
  const hosts = new Set();
  for (const region of EXPANSION_REGION_ORDER) {
    const target = EXPANSION_TARGETS[region];
    for (const row of ordered.filter((candidate) => candidate.macroRegion === region)) {
      if (selected.filter((candidate) => candidate.macroRegion === region).length >= target) break;
      selected.push(row); hosts.add(row.host);
    }
  }
  // Fill short regional quotas in the requested priority order before falling
  // back to the remaining world regions.
  for (const region of EXPANSION_REGION_ORDER) {
    for (const row of ordered.filter((candidate) => candidate.macroRegion === region)) {
      if (selected.length >= EXPANSION_SIZE) break;
      if (hosts.has(row.host)) continue;
      selected.push(row); hosts.add(row.host);
    }
  }
  for (const row of ordered) {
    if (selected.length >= EXPANSION_SIZE) break;
    if (hosts.has(row.host)) continue;
    selected.push(row); hosts.add(row.host);
  }
  return selected.slice(0, EXPANSION_SIZE);
}

// ── FALSE-AUTHORITY AUDIT ───────────────────────────────────────────────────
//
// Run BEFORE selection, on the candidates selection would actually take. A
// registry of regional media fails in one specific, expensive way: it fills up
// with high-authority national outlets, because those are the ones with the
// Domain Ratings that pass a quality gate. Every check below names a way a
// candidate could be carrying somebody else's authority rather than its own.
//
// It reports; it does not silently drop. A finding here is a reason to fix the
// gate that let the candidate through, and a gate fixed once keeps the whole
// wave clean, where a quiet deletion fixes one row and hides the rule that
// produced it.

// Capital cities and the national-press centres that are not capitals. An
// outlet whose only claimed coverage is one of these, on evidence no stronger
// than a head office, is almost always a national title.
const NATIONAL_PRESS_CENTRES = new Set([
  'london', 'paris', 'berlin', 'madrid', 'rome', 'roma', 'lisbon', 'lisboa',
  'amsterdam', 'brussels', 'bruxelles', 'brussel', 'vienna', 'wien', 'bern',
  'zurich', 'zürich', 'copenhagen', 'københavn', 'stockholm', 'oslo',
  'helsinki', 'reykjavik', 'reykjavík', 'dublin', 'warsaw', 'warszawa',
  'prague', 'praha', 'bratislava', 'budapest', 'bucharest', 'bucurești',
  'sofia', 'zagreb', 'ljubljana', 'belgrade', 'beograd', 'sarajevo', 'skopje',
  'tirana', 'athens', 'αθήνα', 'nicosia', 'valletta', 'luxembourg', 'kyiv',
  'kiev', 'chisinau', 'minsk', 'moscow', 'москва', 'ankara', 'istanbul',
  'tallinn', 'riga', 'rīga', 'vilnius', 'washington, d.c.', 'washington',
  'new york city', 'new york', 'ottawa', 'toronto', 'canberra', 'sydney',
  'wellington', 'tokyo', '東京', 'seoul', 'beijing', 'taipei', 'new delhi',
  'delhi', 'islamabad', 'dhaka', 'colombo', 'manila', 'jakarta', 'bangkok',
  'kuala lumpur', 'singapore', 'hanoi', 'abu dhabi', 'dubai', 'jerusalem',
  'tel aviv', 'brasília', 'brasilia', 'buenos aires', 'santiago', 'mexico city',
  'ciudad de méxico', 'bogotá', 'bogota', 'lima', 'quito', 'montevideo',
  'caracas', 'asunción', 'la paz', 'san josé', 'pretoria', 'johannesburg',
  'nairobi', 'abuja', 'lagos', 'accra', 'addis ababa', 'rabat', 'cairo',
  'tunis', 'algiers', 'harare', 'dar es salaam', 'kampala',
]);

// Wording that only a national outlet uses about itself.
const NATIONAL_SELF_DESCRIPTION = /\b(national|nationwide|countrywide|newspaper of record|paper of record|our nation|across the country|leading national)\b/i;

// Findings are BLOCKING or ADVISORY, and the difference matters.
//
// A blocking finding says the candidate cannot be published: it is the same
// rule `viable` applies, stated once so the gate and the audit can never
// disagree about what a regional outlet is.
//
// An advisory finding says a human should look. "Domain Rating 84 on a
// description that merely says regional" is not proof of anything — plenty of
// genuine regional publishers are that strong — but it is the shape a national
// title takes when it slips through, and a wave that reports none of them is
// claiming a confidence the evidence does not support.
function falseAuthorityProblems(row, { includeAdvisory = true } = {}) {
  const problems = [];
  const evidence = row.regionalEvidence;
  const area = String(row.coverageArea || '').trim();
  const areaKey = area.toLocaleLowerCase();
  const host = row.host || cleanHost(row.website);
  const dr = row.domainRating && Number.isInteger(row.domainRating.value)
    ? row.domainRating.value : null;

  const rejection = D.hostRejection(host, row.website);
  if (rejection) problems.push(['host', rejection, 'blocking']);

  // The headquarters hole this whole wave was rebuilt to close. If it ever
  // reopens, this is what catches it.
  if (!D.EVIDENCE_CONFIDENCE[evidence]) {
    problems.push(['evidence', evidence === 'weekly-publication-place'
      ? 'admitted on a head office alone, which is not a coverage claim'
      : `unrecognised regional evidence ${JSON.stringify(evidence)}`, 'blocking']);
  }

  // A national capital as the ONLY coverage claim, on evidence weaker than a
  // structured jurisdiction, is the shape a national daily takes when it slips
  // through: Le Monde covering "Paris", El País covering "Madrid".
  if (NATIONAL_PRESS_CENTRES.has(areaKey)
    && !['regional-class', 'curated-regional-dataset', 'editorial-seed', 'structured-jurisdiction']
      .includes(evidence)) {
    problems.push(['coverageArea', `national press centre ${JSON.stringify(area)} claimed on ${evidence} evidence`, 'blocking']);
  }
  if (D.NON_SUBNATIONAL_SCOPE.test(area)) {
    problems.push(['coverageArea', `${JSON.stringify(area)} is not a place inside a country`, 'blocking']);
  }

  // Coverage that names the whole country is not coverage of a region in it.
  if (area && row.countryName && areaKey === String(row.countryName).toLocaleLowerCase()) {
    problems.push(['coverageArea', 'names the whole country rather than a place inside it', 'blocking']);
  }
  if (/^local or regional market in /i.test(area)
    && !['regional-class', 'curated-regional-dataset', 'editorial-seed'].includes(evidence)) {
    problems.push(['coverageArea', 'is a placeholder, so no specific market was ever established', 'blocking']);
  }

  if (row.site && NATIONAL_SELF_DESCRIPTION.test(String(row.site.title || ''))) {
    problems.push(['site.title', `the outlet's own page title reads as national: ${JSON.stringify(row.site.title)}`, 'blocking']);
  }

  // Very high authority is not a disqualification, but on the weakest evidence
  // it is the exact signature of a national title, so it is worth a human look.
  // A coverage area that is a street, a building or a corporate campus is the
  // head-office problem in its most literal form.
  if (D.ADDRESS_NOT_A_MARKET.test(area)) {
    problems.push(['coverageArea', `${JSON.stringify(area)} is an address, not a market`, 'blocking']);
  }

  // Authority this high on evidence this thin is, empirically, a national
  // title. The audit first raised these as advisory and the list read:
  // myspace.com at 92, iheart.com at 91, nfl.com at 89, faz.net at 90,
  // radiofrance.fr at 90, ctvnews.ca at 90 — a social network, a radio
  // aggregator, a sports league, a national paper of record and two national
  // broadcasters, every one of them typed in Wikidata as a broadcast station
  // with an address. The specific hosts are now refused by name, but the
  // pattern generalises and the threshold stays: a genuinely local outlet with
  // a Domain Rating of 80 can still be published on a class that MEANS local,
  // on a curated regional press index, or on a structured jurisdiction. It
  // just cannot be published on a head office and a licence alone.
  //
  // This costs real records — a handful of large US metro stations and German
  // regional dailies sit above the line on thin evidence — and that is the
  // trade the brief asks for: a smaller wave, not a weaker one.
  if (dr !== null && dr >= 80 && (D.EVIDENCE_CONFIDENCE[evidence] || 0) <= 3) {
    problems.push(['domainRating', `DR ${dr} on ${evidence} evidence is national-title authority`, 'blocking']);
  }

  if (!row.site || !['live', 'protected'].includes(row.site.state)) {
    problems.push(['site', 'is neither live nor clearly protected', 'blocking']);
  }
  if (row.site && row.site.parked) problems.push(['site', 'looks like a parked domain', 'blocking']);
  if (!newsroomEstablished(row)) {
    problems.push(['newsroom', 'no newsroom was established from the inspected homepage', 'blocking']);
  }
  if (dr === null) problems.push(['domainRating', 'has no measured Ahrefs reading', 'blocking']);
  else if (dr < MIN_DR) problems.push(['domainRating', `DR ${dr} is below the ${MIN_DR} gate`, 'blocking']);

  return problems;
}

function falseAuthorityAudit() {
  const findings = fs.existsSync(FINDINGS) ? JSON.parse(fs.readFileSync(FINDINGS, 'utf8')) : null;
  if (!findings) throw new Error('No findings. Run --research first.');
  const existing = expansionBaseline();
  const selected = selectExpansion(findings, existing);
  const flagged = [];
  const byReason = new Map();
  for (const row of selected) {
    const problems = falseAuthorityProblems(row);
    if (!problems.length) continue;
    flagged.push({ host: row.host, name: row.name, problems });
    for (const [, reason] of problems) {
      const key = reason.replace(/".*?"/g, '…').replace(/DR \d+/g, 'DR …');
      byReason.set(key, (byReason.get(key) || 0) + 1);
    }
  }
  const blocking = flagged.filter((row) => row.problems.some(([, , severity]) => severity === 'blocking'));
  console.log(`False-authority audit over ${selected.length} selected candidate(s).`);
  console.log(`Blocking findings: ${blocking.length}. Advisory findings: ${flagged.length - blocking.length}.`);
  if (blocking.length) {
    console.error('A blocking finding means selection and the audit disagree, which should be impossible.');
    process.exitCode = 1;
  }
  if (!flagged.length) {
    console.log('No candidate carries authority it has not evidenced.');
    return { selected: selected.length, flagged: [] };
  }
  console.log(`${flagged.length} candidate(s) flagged:`);
  for (const [reason, count] of [...byReason].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(4)}  ${reason}`);
  }
  for (const row of flagged.slice(0, 25)) {
    console.log(`  ${row.host} — ${row.problems.map(([f, r, severity]) => `[${severity}] ${f}: ${r}`).join('; ')}`);
  }
  if (flagged.length > 25) console.log(`  … and ${flagged.length - 25} more`);
  return { selected: selected.length, flagged };
}

const hashRecord = (row) => crypto.createHash('sha256').update(JSON.stringify(row)).digest('hex');

function loadWaveHistory(existingRecords) {
  if (fs.existsSync(WAVE_HISTORY)) return JSON.parse(fs.readFileSync(WAVE_HISTORY, 'utf8'));
  return {
    version: 1,
    waves: [{
      id: 'wave-1', addedAt: '2026-09-01', count: existingRecords.length,
      recordHashes: Object.fromEntries(existingRecords.map((row) => [row.id, hashRecord(row)])),
    }],
  };
}

function assertHistoricalRecords(existingRecords, history) {
  const byId = new Map(existingRecords.map((row) => [row.id, row]));
  for (const wave of history.waves) {
    for (const [id, expected] of Object.entries(wave.recordHashes || {})) {
      const row = byId.get(id);
      if (!row || hashRecord(row) !== expected) {
        throw new Error(`${id}: a published ${wave.id} record changed during append-only expansion.`);
      }
    }
  }
}

function makeRecord(row) {
  const dr = row.domainRating.value;
  const hostSlug = slug(row.host).slice(0, 28).replace(/-+$/, '');
  const idBase = `rm-${slug(row.name)}-${hostSlug}`.replace(/-+$/, '');
  const coverageLabel = {
    'county-district': 'district or county', 'local-area': 'local',
    'metro-city': 'metropolitan', 'multi-region': 'multi-region',
    region: 'regional', 'state-province': 'state or provincial',
  }[row.coverageType];
  const statusNote = row.site.state === 'protected'
    ? ' A browser check is needed because automated inspection was blocked.' : '';
  return {
    id: idBase,
    name: row.name,
    website: row.website,
    country: row.country,
    macroRegion: row.macroRegion,
    subregion: row.subregion,
    coverageType: row.coverageType,
    coverageArea: row.coverageArea,
    publicationType: row.publicationType,
    languages: [...new Set(row.languages)].sort(),
    currentStatus: row.site.state === 'live' ? 'active' : 'unknown',
    priority: dr >= 75 ? 'P1' : dr >= 55 ? 'P2' : 'P3',
    publicationRoutes: ['unknown'],
    costModel: 'unknown',
    shortNote: `${row.name} is a ${coverageLabel} news outlet serving ${row.coverageArea} in ${row.countryName}. Publication routes and backlink attributes require page-level verification.${statusNote}`,
    lastVerified: row.site.checkedAt,
    sources: [...new Set([row.website, row.sourceUrl].filter(Boolean))].sort(),
    domainRating: dr,
    metricsProvenance: { domainRating: {
      provider: 'Ahrefs', measuredAt: row.domainRating.measuredAt,
      status: 'publicApiReading', measuredDomain: row.host,
    } },
  };
}

function updateDrLedger(records) {
  const ledger = JSON.parse(fs.readFileSync(DR_LEDGER, 'utf8'));
  for (const finding of ledger.findings) {
    finding.records = (finding.records || [])
      .filter((record) => record.collection !== 'regional-media');
  }
  const byTarget = new Map(ledger.findings.map((finding) => [finding.target, finding]));
  for (const row of records) {
    const target = cleanHost(row.website);
    let finding = byTarget.get(target);
    if (!finding) {
      finding = {
        key: `ahrefs|domain-rating|${target}`, target, provider: 'Ahrefs',
        state: 'MEASURED', domainRating: row.domainRating,
        checkedAt: row.metricsProvenance.domainRating.measuredAt, records: [],
      };
      byTarget.set(target, finding);
    }
    finding.state = 'MEASURED';
    finding.domainRating = row.domainRating;
    finding.checkedAt = row.metricsProvenance.domainRating.measuredAt;
    finding.records = (finding.records || []).filter((record) => !(record.collection === 'regional-media'
      && record.id === row.id));
    finding.records.push({ collection: 'regional-media', id: row.id });
    finding.records.sort((a, b) => compareStable(a.collection, b.collection)
      || compareStable(a.id, b.id));
  }
  ledger.probedAt = TODAY;
  ledger.findings = [...byTarget.values()].sort((a, b) => compareStable(a.target, b.target));
  fs.writeFileSync(DR_LEDGER, `${JSON.stringify(ledger, null, 1)}\n`);
}

function apply() {
  if (!fs.existsSync(FINDINGS)) throw new Error('Run --research before --apply.');
  const findings = JSON.parse(fs.readFileSync(FINDINGS, 'utf8'));
  const publishedRecords = loadExistingRecords();
  const history = loadWaveHistory(publishedRecords);
  assertHistoricalRecords(publishedRecords, history);
  const existingRecords = expansionBaseline(publishedRecords, history);
  if (existingRecords.length !== BASELINE_SIZE) {
    throw new Error(`Expected ${BASELINE_SIZE} immutable records before ${CURRENT_WAVE_ID}; found ${existingRecords.length}.`);
  }
  const selected = selectExpansion(findings, existingRecords);
  if (selected.length !== EXPANSION_SIZE || existingRecords.length + selected.length !== WAVE_SIZE) {
    throw new Error(`Refusing to apply ${selected.length}; expansion requires exactly ${EXPANSION_SIZE} new outlets and ${WAVE_SIZE} total records with Ahrefs DR >= ${MIN_DR}.`);
  }
  const additions = selected.map(makeRecord);
  const ids = new Set(existingRecords.map((row) => row.id));
  for (const row of additions) {
    let id = row.id;
    let suffix = 2;
    while (ids.has(id)) id = `${row.id}-${suffix++}`;
    row.id = id; ids.add(id);
  }
  const records = [...existingRecords, ...additions]
    .sort((a, b) => compareStable(a.id, b.id));
  history.waves = history.waves.filter((wave) => wave.id !== CURRENT_WAVE_ID);
  history.waves.push({
    id: CURRENT_WAVE_ID, addedAt: TODAY, count: additions.length,
    geographicPriority: EXPANSION_REGION_ORDER,
    recordHashes: Object.fromEntries(additions.map((row) => [row.id, hashRecord(row)])),
  });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA, `${JSON.stringify(records, null, 1)}\n`);
  fs.writeFileSync(WAVE_HISTORY, `${JSON.stringify(history, null, 2)}\n`);
  updateDrLedger(records);
  console.log(`Applied ${additions.length} new regional media records; ${records.length} total.`);
}

function report(findings = null) {
  const data = findings || (fs.existsSync(FINDINGS) ? JSON.parse(fs.readFileSync(FINDINGS, 'utf8')) : null);
  if (!data) throw new Error('No findings. Run --research first.');
  const pool = Object.values(data.candidates);
  const good = viable(data);
  const existing = expansionBaseline();
  const selected = selectExpansion(data, existing);
  const stateCounts = new Map();
  for (const row of pool) {
    const state = row.site ? row.site.state : 'unresearched';
    stateCounts.set(state, (stateCounts.get(state) || 0) + 1);
  }
  console.log(`Candidates: ${pool.length}`);
  console.log(`Reachable/protected with DR >= ${MIN_DR}: ${good.length}`);
  console.log(`Selected expansion: ${selected.length}/${EXPANSION_SIZE}`);
  console.log(`Resulting corpus: ${existing.length + selected.length}/${WAVE_SIZE}`);
  console.log(`States: ${[...stateCounts].map(([key, value]) => `${key}=${value}`).join(', ')}`);
  if (selected.length) {
    console.log(`Selected DR range: ${Math.min(...selected.map((row) => row.domainRating.value))}-${Math.max(...selected.map((row) => row.domainRating.value))}`);
  }
  const regions = new Map();
  const countries = new Set();
  for (const row of selected) {
    regions.set(row.macroRegion, (regions.get(row.macroRegion) || 0) + 1);
    countries.add(row.country);
  }
  console.log(`Regions: ${[...regions].sort().map(([key, value]) => `${key}=${value}`).join(', ')}`);
  console.log(`Countries: ${countries.size}`);

  const evidence = new Map();
  const sources = new Map();
  const types = new Map();
  const statuses = new Map();
  for (const row of selected) {
    evidence.set(row.regionalEvidence, (evidence.get(row.regionalEvidence) || 0) + 1);
    sources.set(row.sourceKind, (sources.get(row.sourceKind) || 0) + 1);
    types.set(row.publicationType, (types.get(row.publicationType) || 0) + 1);
    const state = row.site.state === 'live' ? 'active' : 'unknown';
    statuses.set(state, (statuses.get(state) || 0) + 1);
  }
  const show = (map) => [...map].sort((a, b) => b[1] - a[1])
    .map(([key, value]) => `${key}=${value}`).join(', ');
  console.log(`Evidence: ${show(evidence)}`);
  console.log(`Sources: ${show(sources)}`);
  console.log(`Publication types: ${show(types)}`);
  console.log(`Statuses: ${show(statuses)}`);
  if (selected.length) {
    const drs = selected.map((row) => row.domainRating.value);
    const mean = drs.reduce((total, value) => total + value, 0) / drs.length;
    console.log(`Selected DR: min=${Math.min(...drs)} max=${Math.max(...drs)} average=${mean.toFixed(1)}`);
  }
  if (data.funnel) {
    console.log(`Funnel discovered: ${Object.entries(data.funnel.discovered)
      .map(([key, value]) => `${key}=${value}`).join(', ')}`);
    const refusals = { ...data.funnel.regionalGateRefusals };
    for (const [key, value] of Object.entries(data.funnel.dedupeRefusals || {})) {
      refusals[key] = (refusals[key] || 0) + value;
    }
    console.log(`Funnel exclusions: ${Object.entries(refusals).sort((a, b) => b[1] - a[1])
      .map(([key, value]) => `${key}=${value}`).join('; ')}`);
  }
  const geography = new Map();
  for (const row of selected) {
    const key = `${row.macroRegion}/${row.country}`;
    geography.set(key, (geography.get(key) || 0) + 1);
  }
  console.log(`Top countries: ${[...geography].sort((a, b) => b[1] - a[1]).slice(0, 15)
    .map(([key, value]) => `${key}=${value}`).join(', ')}`);
  return { selected, viable: good, pool };
}

async function main() {
  if (process.argv.includes('--discover')) return discoverOnly();
  if (process.argv.includes('--probe')) return probeOnly();
  if (process.argv.includes('--research')) return research();
  if (process.argv.includes('--resume')) return resumeResearch();
  if (process.argv.includes('--audit')) return falseAuthorityAudit();
  if (process.argv.includes('--apply')) return apply();
  if (process.argv.includes('--report')) return report();
  throw new Error('Choose --discover, --probe, --research, --resume, --audit, --report or --apply.');
}

if (require.main === module) {
  main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
}

module.exports = {
  WAVE_SIZE, EXPANSION_SIZE, BASELINE_SIZE, CURRENT_WAVE_ID, MIN_DR, GEO,
  EXPANSION_TARGETS, EXPANSION_REGION_ORDER,
  seedCandidates, wikidataCandidates, wikidataSubclassCandidates, dedupe, blockedHosts,
  parseCsv, usLocalCandidates, pipiCandidates, sparql, entityDetails, probeSite,
  newsroomSignal, newsroomEstablished, secondOpinion,
  isPublisherOwnedTarget, viable, rank, selectExpansion, expansionBaseline, makeRecord,
  measureFindings, falseAuthorityProblems, falseAuthorityAudit,
  discoverCandidates, probeStage, research, resumeResearch, apply, report,
};
