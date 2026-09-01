#!/usr/bin/env node
'use strict';

// Regional Media Registry — discovery and first quality-gated wave.
//
//   node scripts/expand-regional-media.cjs --research
//   node scripts/expand-regional-media.cjs --report
//   node scripts/expand-regional-media.cjs --apply
//
// Discovery uses explicit Wikidata classes for local and regional newspapers,
// plus a bounded editorial seed set for markets Wikidata under-represents.
// Publication requires a reachable/protected site and a measured Ahrefs DR.
// Link type and publication route are never inferred from the domain: both stay
// unknown until a concrete public article/profile and a route page are checked.

const fs = require('node:fs');
const path = require('node:path');
const { askAhrefs, apiKey } = require('./research-domain-rating.cjs');
const S = require('./lib/regional-media-schema.cjs');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data', 'regional-media');
const DATA = path.join(DATA_DIR, 'regional-media.json');
const FINDINGS = path.join(DATA_DIR, '.regional-media-findings.json');
const COUNTRIES = path.join(ROOT, 'data', 'business-directories', 'countries.json');
const MEDIA = path.join(ROOT, 'data', 'media-pr-publishing', 'media-platforms.json');
const DR_LEDGER = path.join(ROOT, 'data', 'domain-rating', '.ahrefs-domain-rating.json');

const WAVE_SIZE = 300;
const MIN_DR = 30;
const TODAY = new Date().toISOString().slice(0, 10);
const USER_AGENT = 'PetroHrys Research Center/1.0 (+https://petrohrys.com)';
const WIKIDATA_ENDPOINT = 'https://query.wikidata.org/sparql';
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const ARCHIVE_HOST = /(^|\.)(archive\.org|britishnewspaperarchive\.co\.uk|calameo\.com|gallica\.bnf\.fr|hdl\.loc\.gov|retronews\.fr|digi\.kansalliskirjasto\.fi)$/i;

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
const httpsUrl = (url) => {
  try {
    const parsed = new URL(String(url));
    parsed.protocol = 'https:';
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch { return null; }
};

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

async function sparql(type) {
  const query = `SELECT ?item ?website ?country ?iso2 ?hq ?languageCode WHERE {
    ?item wdt:P31 wd:${type}; wdt:P856 ?website.
    {
      ?item wdt:P17 ?country.
    } UNION {
      FILTER NOT EXISTS { ?item wdt:P17 ?declaredCountry. }
      ?item wdt:P159/wdt:P17 ?country.
    }
    ?country wdt:P297 ?iso2.
    OPTIONAL { ?item wdt:P159 ?hq. }
    OPTIONAL { ?item wdt:P407 ?language. OPTIONAL { ?language wdt:P424 ?languageCode. } }
  } ORDER BY ?item`;
  const url = new URL(WIKIDATA_ENDPOINT);
  url.searchParams.set('query', query);
  url.searchParams.set('format', 'json');
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/sparql-results+json' } });
  if (!res.ok) throw new Error(`Wikidata ${type}: HTTP ${res.status}`);
  return (await res.json()).results.bindings.map((row) => ({ ...row, classId: type }));
}

async function entityLabels(ids) {
  const out = new Map();
  const unique = [...new Set(ids)].filter(Boolean);
  for (let i = 0; i < unique.length; i += 50) {
    const url = new URL(WIKIDATA_API);
    for (const [key, value] of Object.entries({
      action: 'wbgetentities', ids: unique.slice(i, i + 50).join('|'),
      props: 'labels', format: 'json', formatversion: '2',
    })) url.searchParams.set(key, value);
    // eslint-disable-next-line no-await-in-loop
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`Wikidata labels: HTTP ${res.status}`);
    // eslint-disable-next-line no-await-in-loop
    const body = await res.json();
    for (const entity of Object.values(body.entities || {})) {
      const labels = entity.labels || {};
      const chosen = labels.en || labels.mul || labels.de || labels.fr || labels.es
        || Object.values(labels).sort((a, b) => compareStable(a.language, b.language))[0];
      if (chosen) out.set(entity.id, chosen.value);
    }
  }
  return out;
}

const qid = (binding, field) => binding[field]
  && binding[field].value.split('/').pop();

async function wikidataCandidates() {
  const rows = (await Promise.all(['Q1868552', 'Q2138556'].map(sparql))).flat();
  const itemIds = rows.map((row) => qid(row, 'item'));
  const hqIds = rows.map((row) => qid(row, 'hq')).filter(Boolean);
  const labels = await entityLabels([...itemIds, ...hqIds]);
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
    const existing = grouped.get(host) || {
      name: labels.get(item) || host,
      website, host, country: country.slug, countryName: country.name, iso2,
      ...region,
      coverageArea: labels.get(qid(row, 'hq')) || `Local or regional market in ${country.name}`,
      coverageType: classId === 'Q2138556' ? 'region' : 'local-area',
      languages: [], publicationType: 'newspaper', sourceKind: 'wikidata',
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
    if (!row.host || existingMediaHosts.has(row.host) || ARCHIVE_HOST.test(row.host)) continue;
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

const writeFindings = (value) => {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FINDINGS, `${JSON.stringify(value, null, 2)}\n`);
};

async function research() {
  const key = apiKey();
  if (!key) throw new Error('AHREFS_API_KEY is required for --research.');
  const discovered = await wikidataCandidates().catch((error) => {
    console.warn(`Wikidata discovery unavailable: ${error.message}; continuing with editorial seeds.`);
    return [];
  });
  const candidates = dedupe([...seedCandidates(), ...discovered]);
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

  const toMeasure = candidates.filter((row) => {
    const finding = findings.candidates[row.host];
    return finding && finding.site && ['live', 'protected'].includes(finding.site.state)
      && !(finding.domainRating && Number.isInteger(finding.domainRating.value));
  });
  console.log(`Ahrefs: ${toMeasure.length} reachable domains need a fresh measurement.`);
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

function viable(findings) {
  return Object.values(findings.candidates).filter((row) => row.site
    && ['live', 'protected'].includes(row.site.state)
    && row.domainRating && Number.isInteger(row.domainRating.value)
    && row.domainRating.value >= MIN_DR && S.MACRO_REGIONS.includes(row.macroRegion)
    && S.SUBREGIONS.includes(row.subregion));
}

function rank(a, b) {
  return b.domainRating.value - a.domainRating.value
    || compareStable(a.name, b.name) || compareStable(a.host, b.host);
}

function select(findings) {
  const ordered = viable(findings).sort(rank);
  const selected = [];
  const hosts = new Set();
  const targets = {
    africa: 20, asia: 35, europe: 95, 'latin-america-caribbean': 30,
    'north-america': 95, oceania: 25,
  };
  for (const [region, target] of Object.entries(targets)) {
    for (const row of ordered.filter((candidate) => candidate.macroRegion === region)) {
      if (selected.filter((candidate) => candidate.macroRegion === region).length >= target) break;
      selected.push(row); hosts.add(row.host);
    }
  }
  for (const row of ordered) {
    if (selected.length >= WAVE_SIZE) break;
    if (hosts.has(row.host)) continue;
    selected.push(row); hosts.add(row.host);
  }
  return selected.slice(0, WAVE_SIZE);
}

function makeRecord(row) {
  const dr = row.domainRating.value;
  const idBase = `rm-${slug(row.name)}-${slug(row.host).slice(0, 28)}`;
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
  const selected = select(findings);
  if (selected.length !== WAVE_SIZE) {
    throw new Error(`Refusing to apply ${selected.length}; the first wave requires exactly ${WAVE_SIZE} reachable regional outlets with Ahrefs DR >= ${MIN_DR}.`);
  }
  const records = selected.map(makeRecord).sort((a, b) => compareStable(a.id, b.id));
  const ids = new Set();
  for (const row of records) {
    let id = row.id;
    let suffix = 2;
    while (ids.has(id)) id = `${row.id}-${suffix++}`;
    row.id = id; ids.add(id);
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA, `${JSON.stringify(records, null, 1)}\n`);
  updateDrLedger(records);
  console.log(`Applied ${records.length} regional media records.`);
}

function report(findings = null) {
  const data = findings || (fs.existsSync(FINDINGS) ? JSON.parse(fs.readFileSync(FINDINGS, 'utf8')) : null);
  if (!data) throw new Error('No findings. Run --research first.');
  const pool = Object.values(data.candidates);
  const good = viable(data);
  const selected = select(data);
  const stateCounts = new Map();
  for (const row of pool) {
    const state = row.site ? row.site.state : 'unresearched';
    stateCounts.set(state, (stateCounts.get(state) || 0) + 1);
  }
  console.log(`Candidates: ${pool.length}`);
  console.log(`Reachable/protected with DR >= ${MIN_DR}: ${good.length}`);
  console.log(`Selected: ${selected.length}/${WAVE_SIZE}`);
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
  if (process.argv.includes('--apply')) return apply();
  if (process.argv.includes('--report')) return report();
  throw new Error('Choose --research, --report or --apply.');
}

if (require.main === module) {
  main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
}

module.exports = {
  WAVE_SIZE, MIN_DR, GEO, seedCandidates, wikidataCandidates, dedupe,
  probeSite, viable, select, makeRecord, research, apply, report,
};
