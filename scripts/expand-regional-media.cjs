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
const { readZip } = require('./lib/to-zip.cjs');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data', 'regional-media');
const DATA = path.join(DATA_DIR, 'regional-media.json');
const FINDINGS = path.join(DATA_DIR, '.regional-media-findings.json');
const COUNTRIES = path.join(ROOT, 'data', 'business-directories', 'countries.json');
const MEDIA = path.join(ROOT, 'data', 'media-pr-publishing', 'media-platforms.json');
const DR_LEDGER = path.join(ROOT, 'data', 'domain-rating', '.ahrefs-domain-rating.json');
const WAVE_HISTORY = path.join(DATA_DIR, '.wave-history.json');

const WAVE_SIZE = 2100;
const EXPANSION_SIZE = 1000;
const BASELINE_SIZE = WAVE_SIZE - EXPANSION_SIZE;
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
const ARCHIVE_HOST = /(^|\.)(archive\.org|britishnewspaperarchive\.co\.uk|calameo\.com|gallica\.bnf\.fr|loc\.gov|retronews\.fr|digi\.kansalliskirjasto\.fi|archives?\.[^.]+\.[a-z]{2,})$/i;
const ARCHIVE_PATH = /\/(archive|archives|archivio|chroniclingamerica|digitised|fonds|historic-newspapers|newspaper-archive|presse-regionale)(\/|\?|$)/i;
const SHARED_PUBLISHING_HOST = /(^|\.)(beehiiv\.com|blogspot\.[a-z.]+|campaign-archive\.com|medium\.com|sites\.google\.com|substack\.com|webflow\.io|weebly\.com|wixsite\.com|wordpress\.com)$/i;
const NON_NEWS_HOST = /(^|\.)(crl\.edu|revistas\.usp\.br|scielo\.br)$/i;
const INSTITUTIONAL_HOST = /\.(ac|edu)\.[a-z]{2}$|\.edu$/i;
const SOCIAL_HOST = /(^|\.)(facebook\.com|instagram\.com|linkedin\.com|linktr\.ee|x\.com|twitter\.com|youtube\.com)$/i;

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
const isPublisherOwnedTarget = (row) => {
  if (!row || !row.host || ARCHIVE_HOST.test(row.host)
    || SHARED_PUBLISHING_HOST.test(row.host) || NON_NEWS_HOST.test(row.host)
    || INSTITUTIONAL_HOST.test(row.host)) return false;
  try { return !ARCHIVE_PATH.test(new URL(row.website).pathname); } catch { return false; }
};
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
      sourceKind: 'editorial-seed', sourceUrl: website,
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
  const acceptedMedia = new Set(['Newspapers', 'College Newspapers', 'TV station']);
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
    // eslint-disable-next-line no-await-in-loop
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/sparql-results+json' } });
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

async function entityDetails(ids) {
  const labels = new Map();
  const descriptions = new Map();
  const unique = [...new Set(ids)].filter(Boolean);
  for (let i = 0; i < unique.length; i += 50) {
    const url = new URL(WIKIDATA_API);
    for (const [key, value] of Object.entries({
      action: 'wbgetentities', ids: unique.slice(i, i + 50).join('|'),
      props: 'labels|descriptions', format: 'json', formatversion: '2',
    })) url.searchParams.set(key, value);
    // eslint-disable-next-line no-await-in-loop
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`Wikidata labels: HTTP ${res.status}`);
    // eslint-disable-next-line no-await-in-loop
    const body = await res.json();
    for (const entity of Object.values(body.entities || {})) {
      const labelSet = entity.labels || {};
      const chosen = labelSet.en || labelSet.mul || labelSet.de || labelSet.fr || labelSet.es
        || Object.values(labelSet).sort((a, b) => compareStable(a.language, b.language))[0];
      if (chosen) labels.set(entity.id, chosen.value);
      const descriptionSet = entity.descriptions || {};
      const description = descriptionSet.en || descriptionSet.mul || descriptionSet.de
        || descriptionSet.fr || descriptionSet.es
        || Object.values(descriptionSet).sort((a, b) => compareStable(a.language, b.language))[0];
      if (description) descriptions.set(entity.id, description.value);
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

// Wave-4 broadening: for each target country, query all instances-of any
// subclass (transitively) of newspaper, online newspaper, television station,
// radio station, magazine, or news website that has an official website. This
// yields significantly more candidates than the flat class-by-class query
// above, especially in European and Asian countries where subclasses proliferate
// (regional dailies, weekly local papers, city magazines, PSB regional
// stations). The existing regional-vs-national description filter still
// decides publication; a candidate lacking any subnational signal is dropped.
const COUNTRY_QUERY_ISOS = [
  // Europe (wave-4 priority 1) — 39 countries
  'DE', 'FR', 'IT', 'ES', 'GB', 'NL', 'BE', 'CH', 'AT', 'IE', 'PT', 'GR',
  'SE', 'NO', 'DK', 'FI', 'IS', 'EE', 'LV', 'LT', 'PL', 'CZ', 'SK', 'HU',
  'RO', 'BG', 'HR', 'SI', 'RS', 'BA', 'MK', 'AL', 'MT', 'CY', 'LU', 'UA',
  'MD', 'BY', 'RU', 'TR',
  // North America — 2 countries
  'US', 'CA',
  // Oceania — 4 countries
  'AU', 'NZ', 'FJ', 'PG',
  // Asia — 17 countries
  'JP', 'KR', 'CN', 'HK', 'TW', 'IN', 'PK', 'BD', 'LK', 'PH', 'ID', 'TH',
  'MY', 'SG', 'VN', 'AE', 'IL',
  // Latin America and Caribbean — 12 countries
  'BR', 'AR', 'CL', 'MX', 'CO', 'PE', 'EC', 'UY', 'VE', 'PY', 'BO', 'CR',
  // Africa — 12 countries
  'ZA', 'KE', 'NG', 'GH', 'ET', 'MA', 'EG', 'TN', 'DZ', 'ZW', 'TZ', 'UG',
];

// Root classes for the country-scoped query. All descendants (P279*) of these
// are eligible; the description/scope filter still enforces regional coverage.
const COUNTRY_QUERY_ROOTS = [
  'Q11032',    // newspaper
  'Q1153191',  // online newspaper
  'Q1616075',  // television station
  'Q14350',    // radio station
  'Q1580166',  // news website
];

async function sparqlByCountry(iso2) {
  // Values-list of root classes keeps a single query per country and lets WDQS
  // stream the union efficiently. Transitivity is bounded by "instance of any
  // subclass of a root class", never by unrelated deep chains.
  const rootValues = COUNTRY_QUERY_ROOTS.map((qidValue) => `wd:${qidValue}`).join(' ');
  const query = `SELECT ?item ?rootClass ?website ?country ?iso2 ?hq ?publicationPlace ?scope ?languageCode WHERE {
    VALUES ?rootClass { ${rootValues} }
    ?item wdt:P31/wdt:P279* ?rootClass;
          wdt:P856 ?website;
          wdt:P17 ?country.
    ?country wdt:P297 "${iso2}".
    BIND("${iso2}" AS ?iso2)
    OPTIONAL { ?item wdt:P159 ?hq. }
    OPTIONAL { ?item wdt:P291 ?publicationPlace. }
    OPTIONAL { ?item wdt:P1001 ?scope. }
    OPTIONAL { ?item wdt:P407 ?language. OPTIONAL { ?language wdt:P424 ?languageCode. } }
  }`;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const url = new URL(WIKIDATA_ENDPOINT);
    url.searchParams.set('query', query);
    url.searchParams.set('format', 'json');
    // eslint-disable-next-line no-await-in-loop
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/sparql-results+json' } });
    if (res.ok) {
      // eslint-disable-next-line no-await-in-loop
      const body = await res.json();
      return body.results.bindings;
    }
    if (![429, 502, 503, 504].includes(res.status) || attempt === 3) {
      throw new Error(`Wikidata country ${iso2}: HTTP ${res.status}`);
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, attempt * 2000); });
  }
  return [];
}

// National-broadcaster hosts that carry a country-wide newsroom despite being
// classified under a broadcaster subclass. They are removed here rather than
// via the description filter because their Wikidata descriptions are terse.
const NATIONAL_BROADCASTER_HOSTS = new Set([
  'bbc.co.uk', 'bbc.com', 'itv.com', 'channel4.com', 'channel5.com',
  'france24.com', 'ard.de', 'zdf.de', 'rai.it', 'rtve.es', 'rtp.pt', 'rtbf.be',
  'vrt.be', 'nos.nl', 'nhk.or.jp', 'nhk.jp', 'cctv.com', 'kbs.co.kr', 'mbc.co.kr',
  'sbs.com.au', 'abc.net.au', 'cbc.ca', 'radio-canada.ca', 'sabc.co.za',
  'npr.org', 'pbs.org', 'yle.fi', 'svt.se', 'sr.se', 'nrk.no', 'dr.dk',
  'ceskatelevize.cz', 'polskieradio.pl', 'tvp.pl',
]);

async function wikidataCountryCandidates() {
  const perCountry = [];
  for (const iso2 of COUNTRY_QUERY_ISOS) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const rows = await sparqlByCountry(iso2);
      perCountry.push(...rows);
      console.log(`  Wikidata ${iso2}: ${rows.length} raw rows`);
    } catch (error) {
      console.warn(`Wikidata country ${iso2} unavailable: ${error.message}`);
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, 400); });
  }
  const itemIds = perCountry.map((row) => qid(row, 'item'));
  const placeIds = perCountry.flatMap((row) => ['hq', 'publicationPlace', 'scope']
    .map((field) => qid(row, field))).filter(Boolean);
  const { labels, descriptions } = await entityDetails([...itemIds, ...placeIds]);
  const { byIso } = countryContext();
  const grouped = new Map();
  for (const row of perCountry) {
    const item = qid(row, 'item');
    const iso2 = row.iso2 && row.iso2.value.toUpperCase();
    const country = byIso.get(iso2);
    const region = GEO.get(iso2);
    const website = httpsUrl(row.website && row.website.value);
    if (!item || !country || !region || !website) continue;
    const host = cleanHost(website);
    if (!host || NATIONAL_BROADCASTER_HOSTS.has(host)) continue;
    const rootClass = qid(row, 'rootClass');
    const description = descriptions.get(item) || '';
    const scopeId = qid(row, 'scope');
    const countryId = qid(row, 'country');
    const publicationPlaceId = qid(row, 'publicationPlace');
    const hqId = qid(row, 'hq');
    const explicitSubnationalScope = Boolean(scopeId && scopeId !== countryId);
    const regionalDescription = /\b(local|regional|community|municipal|metropolitan|county|district|provincial|state|province|prefecture|territorial|city|town|village|borough|neighbou?rhood|island|serving|areas?\s+of|market)\b/i
      .test(description);
    const nationalDescription = /\b(national|nationwide|countrywide|newspaper of record|public-service broadcaster|state broadcaster|national broadcaster)\b/i
      .test(description);
    const hasHqOrPubPlace = Boolean(publicationPlaceId || hqId);
    const coverageArea = labels.get(scopeId) || labels.get(publicationPlaceId)
      || labels.get(hqId) || `Local or regional market in ${country.name}`;
    const locationMatch = coverageArea && description.toLocaleLowerCase()
      .includes(coverageArea.toLocaleLowerCase());
    // A candidate needs at least one subnational signal: explicit jurisdiction,
    // a regional description, description mentions its HQ city, OR an HQ that
    // is not the country capital. Otherwise it is national and dropped.
    if (!explicitSubnationalScope && !regionalDescription && !locationMatch && !hasHqOrPubPlace) continue;
    if (nationalDescription && !explicitSubnationalScope && !regionalDescription) continue;
    const coverageType = /\b(county|district|borough)\b/i.test(description) ? 'county-district'
      : /\b(state|province|prefecture|territor)\b/i.test(description) ? 'state-province'
        : /\b(city|metropolitan|municipal|town)\b/i.test(description) ? 'metro-city'
          : /\b(multi-region|several regions)\b/i.test(description) ? 'multi-region'
            : /\bregional|region\b/i.test(description) ? 'region'
              : hasHqOrPubPlace ? 'metro-city' : 'local-area';
    const publicationType = rootClass === 'Q1153191' || rootClass === 'Q1580166' ? 'digital-news'
      : rootClass === 'Q1616075' || rootClass === 'Q14350' ? 'news-broadcaster'
        : 'newspaper';
    const existing = grouped.get(host) || {
      name: labels.get(item) || host,
      website, host, country: country.slug, countryName: country.name, iso2,
      ...region,
      coverageArea,
      coverageType,
      languages: [],
      publicationType,
      sourceKind: 'wikidata-country-scoped',
      regionalEvidence: explicitSubnationalScope ? 'structured-jurisdiction'
        : regionalDescription ? 'regional-description'
          : locationMatch ? 'description-location-match'
            : 'weekly-publication-place',
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

function dedupe(rows) {
  const existingMediaHosts = new Set(JSON.parse(fs.readFileSync(MEDIA, 'utf8'))
    .map((row) => cleanHost(row.website)).filter(Boolean));
  const byHost = new Map();
  for (const row of rows) {
    if (!isPublisherOwnedTarget(row) || existingMediaHosts.has(row.host)) continue;
    const previous = byHost.get(row.host);
    // Editorial coverage detail wins over a generic Wikidata headquarters.
    if (!previous || row.sourceKind === 'editorial-seed') byHost.set(row.host, row);
  }
  return [...byHost.values()].sort((a, b) => compareStable(a.host, b.host));
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
    const parked = /domain (is|may be) for sale|buy this domain|sedo\.com|hugedomains|parking page/i
      .test(`${title} ${text.slice(0, 1800)}`);
    const finalHost = cleanHost(res.url);
    const moved = Boolean(finalHost && finalHost !== row.host);
    return {
      state: moved ? 'redirected' : res.ok && text.length >= 200 && !parked ? 'live'
        : protectedResponse ? 'protected' : 'failed',
      status: res.status, finalUrl: res.url, title, textLength: text.length,
      parked, moved, checkedAt: TODAY,
    };
  } catch (error) {
    return { state: 'failed', error: error.name === 'AbortError' ? 'timeout' : error.message, checkedAt: TODAY };
  } finally { clearTimeout(timer); }
}

function loadFreshDomainRatings() {
  const ledger = JSON.parse(fs.readFileSync(DR_LEDGER, 'utf8'));
  return new Map(ledger.findings.filter((row) => row.state === 'MEASURED'
    && Number.isInteger(row.domainRating)).map((row) => [row.target, {
    value: row.domainRating, provider: 'Ahrefs', status: 'publicApiReading', measuredAt: row.checkedAt,
  }]));
}

function measurementQueue(candidates, findings, limit = 6000) {
  const existingHosts = new Set(loadExistingRecords().map((row) => cleanHost(row.website)));
  const confidence = {
    'regional-class': 5, 'curated-regional-dataset': 5, 'structured-jurisdiction': 4,
    'regional-description': 3, 'description-location-match': 2,
    'weekly-publication-place': 1,
  };
  const eligible = candidates.filter((row) => {
    const finding = findings.candidates[row.host];
    return !existingHosts.has(row.host) && finding && finding.site
      && ['live', 'protected'].includes(finding.site.state)
      && !(finding.domainRating && Number.isInteger(finding.domainRating.value));
  }).sort((a, b) => (confidence[b.regionalEvidence] || 0) - (confidence[a.regionalEvidence] || 0)
    || compareStable(a.name, b.name) || compareStable(a.host, b.host));
  const budgets = {
    europe: 2000, 'north-america': 1500, oceania: 800, asia: 900,
    'latin-america-caribbean': 500, africa: 300,
  };
  const weights = {
    europe: 4, 'north-america': 3, oceania: 2, asia: 3,
    'latin-america-caribbean': 2, africa: 1,
  };
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

const writeFindings = (value) => {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FINDINGS, `${JSON.stringify(value, null, 2)}\n`);
};

async function measureFindings(findings, candidates, key) {
  const toMeasure = measurementQueue(candidates, findings);
  console.log(`Ahrefs: measuring ${toMeasure.length} geographically prioritised domains this pass.`);
  for (let index = 0; index < toMeasure.length; index += 1) {
    const row = toMeasure[index];
    const finding = findings.candidates[row.host];
    // eslint-disable-next-line no-await-in-loop
    const measured = await askAhrefs(row.host, key);
    finding.domainRating = measured.ok
      ? { value: measured.domainRating, provider: 'Ahrefs', status: 'publicApiReading', measuredAt: TODAY }
      : { error: measured.why, measuredAt: TODAY };
    if ((index + 1) % 10 === 0) {
      writeFindings(findings);
      console.log(`  measured ${index + 1}/${toMeasure.length}`);
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
    const { site, domainRating, ...candidate } = row;
    return candidate;
  });
  await measureFindings(findings, candidates, key);
}

async function research() {
  const key = apiKey();
  if (!key) throw new Error('AHREFS_API_KEY is required for --research.');
  const [discovered, countryScoped, usLocal, pipi] = await Promise.all([
    wikidataCandidates().catch((error) => {
      console.warn(`Wikidata discovery unavailable: ${error.message}; continuing with curated sources.`);
      return [];
    }),
    wikidataCountryCandidates().catch((error) => {
      console.warn(`Wikidata country-scoped discovery unavailable: ${error.message}`);
      return [];
    }),
    usLocalCandidates().catch((error) => {
      console.warn(`US local-news discovery unavailable: ${error.message}`);
      return [];
    }),
    pipiCandidates().catch((error) => {
      console.warn(`Australian PIPI discovery unavailable: ${error.message}`);
      return [];
    }),
  ]);
  console.log(`Sources: Wikidata-class=${discovered.length}, Wikidata-country-scoped=${countryScoped.length}, US-local=${usLocal.length}, PIPI=${pipi.length}.`);
  const candidates = dedupe([...seedCandidates(), ...discovered, ...countryScoped, ...usLocal, ...pipi]);
  const findings = fs.existsSync(FINDINGS)
    ? JSON.parse(fs.readFileSync(FINDINGS, 'utf8'))
    : { version: 1, generatedAt: TODAY, candidates: {} };
  const ledgerRatings = loadFreshDomainRatings();
  const currentHosts = new Set(candidates.map((row) => row.host));
  for (const host of Object.keys(findings.candidates)) {
    if (!currentHosts.has(host)) delete findings.candidates[host];
  }
  console.log(`Regional media discovery: ${candidates.length} unique candidate domains.`);

  let cursor = 0;
  const workers = Array.from({ length: 8 }, async () => {
    while (cursor < candidates.length) {
      const row = candidates[cursor++];
      const before = findings.candidates[row.host];
      if (before && before.site && before.site.checkedAt === TODAY
        && typeof before.site.moved === 'boolean') {
        findings.candidates[row.host] = { ...row, site: before.site, domainRating: before.domainRating };
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const site = await probeSite(row);
      findings.candidates[row.host] = {
        ...row, site, domainRating: (before && before.domainRating) || ledgerRatings.get(row.host),
      };
      if (cursor % 20 === 0) writeFindings(findings);
    }
  });
  await Promise.all(workers);
  writeFindings(findings);

  await measureFindings(findings, candidates, key);
}

function viable(findings) {
  return Object.values(findings.candidates).filter((row) => row.site
    && ['live', 'protected'].includes(row.site.state)
    && row.domainRating && Number.isInteger(row.domainRating.value)
    && row.domainRating.value >= MIN_DR && S.MACRO_REGIONS.includes(row.macroRegion)
    && S.SUBREGIONS.includes(row.subregion) && isPublisherOwnedTarget(row));
}

function rank(a, b) {
  const confidence = {
    'regional-class': 5,
    'curated-regional-dataset': 5,
    'structured-jurisdiction': 4,
    'regional-description': 3,
    'description-location-match': 2,
    'weekly-publication-place': 1,
  };
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
}

async function main() {
  if (process.argv.includes('--research')) return research();
  if (process.argv.includes('--resume')) return resumeResearch();
  if (process.argv.includes('--apply')) return apply();
  if (process.argv.includes('--report')) return report();
  throw new Error('Choose --research, --resume, --report or --apply.');
}

if (require.main === module) {
  main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
}

module.exports = {
  WAVE_SIZE, EXPANSION_SIZE, BASELINE_SIZE, CURRENT_WAVE_ID, MIN_DR, GEO,
  seedCandidates, wikidataCandidates, dedupe,
  parseCsv, usLocalCandidates, pipiCandidates, sparql, entityDetails, probeSite,
  isPublisherOwnedTarget, viable, selectExpansion, expansionBaseline, makeRecord, measureFindings,
  research, resumeResearch, apply, report,
};
