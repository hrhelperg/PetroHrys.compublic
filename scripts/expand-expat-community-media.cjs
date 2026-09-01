#!/usr/bin/env node
'use strict';

// Expat & International Community Media — first, bounded 300-record wave.
//
// This importer deliberately does not collect ordinary regional newspapers.
// A candidate must serve expatriates, international residents, a diaspora, or
// an English-language/international audience in a country where that edition is
// a distinct cross-border surface. The future regional-media expansion is a
// separate corpus and must not use this category.
//
//   node scripts/expand-expat-community-media.cjs --research
//   node scripts/expand-expat-community-media.cjs --report
//   node scripts/expand-expat-community-media.cjs --apply
//
// Research is resumable. It verifies the homepage, records only route wording
// visible on the publisher's own site, and asks Ahrefs for a current DR. Apply
// refuses to publish fewer than 300 records or any record below DR 30.

const fs = require('node:fs');
const path = require('node:path');
const { askAhrefs, apiKey } = require('./research-domain-rating.cjs');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data/media-pr-publishing/media-platforms.json');
const FINDINGS = path.join(ROOT, 'data/media-pr-publishing/.expat-community-findings.json');
const DR_LEDGER = path.join(ROOT, 'data/domain-rating/.ahrefs-domain-rating.json');
const LINK_LEDGER = path.join(ROOT, 'data/link-value/.link-value.json');
const WAVE_SIZE = 300;
const MIN_DR = 30;
const TODAY = new Date().toISOString().slice(0, 10);
const USER_AGENT = 'PetroHrys Research Center/1.0 (+https://petrohrys.com)';

const SEGMENT_RANK = {
  'expat-portal': 0,
  'international-community': 1,
  'international-news': 2,
  'diaspora-media': 3,
  'global-mobility': 4,
};

// These are explicit editorial seeds, not generated domains. The Wikidata pass
// below broadens discovery, but every published record still has to pass the
// same live-site and Ahrefs gates.
const SEEDS = `
Expat.com|https://www.expat.com|global|expat-portal
Expatica|https://www.expatica.com|global|expat-portal
InterNations|https://www.internations.org|global|expat-portal
Angloinfo|https://www.angloinfo.com|global|expat-portal
Expat Focus|https://www.expatfocus.com|global|expat-portal
Expat Exchange|https://www.expatexchange.com|global|expat-portal
EasyExpat|https://www.easyexpat.com|global|expat-portal
Just Landed|https://www.justlanded.com|global|expat-portal
Expat Arrivals|https://www.expatarrivals.com|global|expat-portal
Expat Network|https://expatnetwork.com|global|expat-portal
ExpatDen|https://www.expatden.com|global|expat-portal
Escape Artist|https://www.escapeartist.com|global|expat-portal
International Living|https://internationalliving.com|global|expat-portal
Transitions Abroad|https://www.transitionsabroad.com|global|expat-portal
Expat Child|https://expatchild.com|global|expat-portal
Expat Info Desk|https://www.expatinfodesk.com|global|expat-portal
Reach Expats|https://reachexpats.com|global|global-mobility
Global Mobility Insider|https://www.globalmobilityinsider.com|global|global-mobility
Relocate Global|https://www.relocatemagazine.com|global|global-mobility
International HR Adviser|https://www.internationalhradviser.com|global|global-mobility
Worldcrunch|https://worldcrunch.com|global|international-news
Global Voices|https://globalvoices.org|global|international-community
New Internationalist|https://newint.org|global|international-news
The Diplomat|https://thediplomat.com|global|international-news
Euractiv|https://www.euractiv.com|european-union|international-news
EUobserver|https://euobserver.com|european-union|international-news
Voxeurop|https://voxeurop.eu|european-union|international-news
The European Correspondent|https://europeancorrespondent.com|european-union|international-news
The Mayor|https://www.themayor.eu|european-union|international-community
Expats.cz|https://www.expats.cz|czech-republic|expat-portal
Prague Morning|https://praguemorning.cz|czech-republic|international-community
Prague Daily News|https://praguedaily.news|czech-republic|international-news
Prague Business Journal|https://praguebusinessjournal.cz|czech-republic|international-news
Brno Daily|https://brnodaily.com|czech-republic|international-community
Czech Daily|https://czechdaily.cz|czech-republic|international-news
Notes from Poland|https://notesfrompoland.com|poland|international-news
The Warsaw Insider|https://warsawinsider.pl|poland|international-community
Krakow Post|https://www.krakowpost.com|poland|international-community
Poland Today|https://poland-today.pl|poland|international-news
Warsaw Point|https://warsawpoint.com|poland|international-news
The First News|https://www.thefirstnews.com|poland|international-news
New Eastern Europe|https://neweasterneurope.eu|poland|international-news
IamExpat Germany|https://www.iamexpat.de|germany|expat-portal
The Local Germany|https://www.thelocal.de|germany|international-news
The Berlin Spectator|https://berlinspectator.com|germany|international-community
The Munich Eye|https://themunicheye.com|germany|international-community
Toytown Germany|https://www.toytowngermany.com|germany|expat-portal
Berlin Loves You|https://berlinlovesyou.com|germany|international-community
Exberliner|https://www.exberliner.com|germany|international-community
Berlin Gazette|https://berlinergazette.de|germany|international-community
The Local France|https://www.thelocal.fr|france|international-news
The Connexion|https://www.connexionfrance.com|france|expat-portal
FrenchEntrée|https://www.frenchentree.com|france|expat-portal
France Today|https://francetoday.com|france|international-community
Bonjour Paris|https://bonjourparis.com|france|international-community
Monaco Life|https://monacolife.net|france|international-community
Riviera Radio|https://rivieraradio.mc|france|international-community
This French Life|https://thisfrenchlife.com|france|expat-portal
The Local Spain|https://www.thelocal.es|spain|international-news
The Olive Press|https://www.theolivepress.es|spain|international-community
SUR in English|https://www.surinenglish.com|spain|international-community
Euro Weekly News|https://euroweeklynews.com|spain|international-community
Majorca Daily Bulletin|https://www.majorcadailybulletin.com|spain|international-community
Murcia Today|https://murciatoday.com|spain|international-community
Spanish News Today|https://spanishnewstoday.com|spain|international-community
ThinkSPAIN|https://www.thinkspain.com|spain|expat-portal
Costa Blanca News|https://www.costablancanews.es|spain|international-community
Barcelona Metropolitan|https://www.barcelona-metropolitan.com|spain|international-community
Barcelona Connect|https://barcelonaconnect.com|spain|international-community
Spain in English|https://www.spainenglish.com|spain|international-news
The Leader Newspaper|https://theleader.info|spain|international-community
Ibiza Spotlight|https://www.ibiza-spotlight.com|spain|international-community
The Portugal News|https://www.theportugalnews.com|portugal|international-news
Portugal Resident|https://www.portugalresident.com|portugal|international-community
Portugalist|https://www.portugalist.com|portugal|expat-portal
Portugal Confidential|https://portugalconfidential.com|portugal|international-community
Essential Business|https://www.essential-business.pt|portugal|international-news
Algarve Daily News|https://algarvedailynews.com|portugal|international-community
Portugal Business News|https://www.portugalbusinessesnews.com|portugal|international-news
Portugal Pulse|https://www.portugalpulse.com|portugal|international-news
The Local Italy|https://www.thelocal.it|italy|international-news
Wanted in Rome|https://www.wantedinrome.com|italy|international-community
The Florentine|https://www.theflorentine.net|italy|international-community
Italy Magazine|https://www.italymagazine.com|italy|international-community
Italian Insider|https://www.italianinsider.it|italy|international-news
Romeing|https://www.romeing.it|italy|international-community
Easy Milano|https://easymilano.com|italy|international-community
Where Milan|https://www.wheremilan.com|italy|international-community
We the Italians|https://www.wetheitalians.com|italy|diaspora-media
La Voce di New York|https://lavocedinewyork.com|italy|diaspora-media
The Local Switzerland|https://www.thelocal.ch|switzerland|international-news
SWI swissinfo.ch|https://www.swissinfo.ch|switzerland|international-news
Le News|https://lenews.ch|switzerland|international-community
Hello Switzerland|https://helloswitzerland.ch|switzerland|expat-portal
The New Switzerland|https://www.thenewswitzerland.com|switzerland|expat-portal
Geneva Solutions|https://genevasolutions.news|switzerland|international-news
The Local Austria|https://www.thelocal.at|austria|international-news
Metropole|https://metropole.at|austria|international-community
Vienna Würstelstand|https://viennawurstelstand.com|austria|international-community
The International|https://www.theinternational.at|austria|international-community
Vindobona|https://www.vindobona.org|austria|international-news
Austrian Economics Center|https://www.austriancenter.com|austria|international-community
IamExpat Netherlands|https://www.iamexpat.nl|netherlands|expat-portal
DutchNews.nl|https://www.dutchnews.nl|netherlands|international-news
NL Times|https://nltimes.nl|netherlands|international-news
The Holland Times|https://www.hollandtimes.nl|netherlands|international-community
Expat Republic|https://www.expatrepublic.com|netherlands|expat-portal
ACCESS NL|https://access-nl.org|netherlands|expat-portal
Amsterdam Mamas|https://amsterdam-mamas.nl|netherlands|international-community
IamExpat Fair|https://iamexpatfair.nl|netherlands|expat-portal
The Brussels Times|https://www.brusselstimes.com|belgium|international-news
The Bulletin|https://www.thebulletin.be|belgium|international-community
Brussels Morning|https://brusselsmorning.com|belgium|international-news
The Brussels Magazine|https://thebrusselsmagazine.com|belgium|international-community
Together Magazine|https://togethermag.eu|belgium|international-community
The Word Magazine|https://thewordmagazine.com|belgium|international-community
Luxembourg Times|https://www.luxtimes.lu|luxembourg|international-news
Delano|https://delano.lu|luxembourg|international-community
RTL Today|https://today.rtl.lu|luxembourg|international-news
Chronicle.lu|https://chronicle.lu|luxembourg|international-community
Luxembourg Chronicle|https://www.luxembourgchronicle.lu|luxembourg|international-community
Ara City Radio|https://www.ara.lu|luxembourg|international-community
The Copenhagen Post|https://cphpost.dk|denmark|international-news
Your Danish Life|https://www.yourdanishlife.dk|denmark|expat-portal
The International Denmark|https://www.the-intl.com|denmark|international-community
Daily Danish|https://www.dailydanish.com|denmark|international-news
The Local Denmark|https://www.thelocal.dk|denmark|international-news
The Local Sweden|https://www.thelocal.se|sweden|international-news
Your Living City|https://www.yourlivingcity.com|sweden|international-community
Stockholm Expat|https://stockholmexpat.com|sweden|expat-portal
Nordic Labour Journal|https://www.nordiclabourjournal.org|sweden|global-mobility
Nordic Life|https://nordiclife.eu|sweden|international-community
Life in Norway|https://www.lifeinnorway.net|norway|expat-portal
Norway Today|https://norwaytoday.info|norway|international-news
The Barents Observer|https://thebarentsobserver.com|norway|international-news
Norway's News in English|https://www.newsinenglish.no|norway|international-news
Norway Post|https://norwaypost.no|norway|international-news
The Local Norway|https://www.thelocal.no|norway|international-news
Helsinki Times|https://www.helsinkitimes.fi|finland|international-news
Finland Today|https://finlandtoday.fi|finland|international-news
Foreigner.fi|https://www.foreigner.fi|finland|expat-portal
Daily Finland|https://www.dailyfinland.fi|finland|international-news
Good News from Finland|https://www.goodnewsfinland.com|finland|international-news
Helsinki Partners|https://www.helsinkipartners.com|finland|international-community
Iceland Review|https://www.icelandreview.com|iceland|international-news
The Reykjavik Grapevine|https://grapevine.is|iceland|international-community
Iceland Monitor|https://icelandmonitor.mbl.is|iceland|international-news
What's On in Reykjavik|https://www.whatson.is|iceland|international-community
Guide to Iceland|https://guidetoiceland.is|iceland|international-community
Estonian World|https://estonianworld.com|estonia|international-news
ERR News|https://news.err.ee|estonia|international-news
The Baltic Times|https://www.baltictimes.com|latvia|international-news
LSM English|https://eng.lsm.lv|latvia|international-news
Baltic News Network|https://bnn-news.com|latvia|international-news
The Lithuania Tribune|https://lithuaniatribune.com|lithuania|international-news
LRT English|https://www.lrt.lt/en/news-in-english|lithuania|international-news
Made in Vilnius|https://madeinvilnius.lt/en|lithuania|international-community
Total Croatia News|https://total-croatia-news.com|croatia|international-news
Croatia Week|https://www.croatiaweek.com|croatia|international-community
The Dubrovnik Times|https://www.thedubrovniktimes.com|croatia|international-community
Time Out Croatia|https://www.timeout.com/croatia|croatia|international-community
Croatia Business News|https://croatiabusinessnews.com|croatia|international-news
Serbian Monitor|https://www.serbianmonitor.com|serbia|international-news
CorD Magazine|https://cordmagazine.com|serbia|international-community
Diplomacy & Commerce|https://www.diplomacyandcommerce.rs|serbia|international-community
European Western Balkans|https://europeanwesternbalkans.com|serbia|international-news
The Slovenia Times|https://sloveniatimes.com|slovenia|international-news
Total Slovenia News|https://www.total-slovenia-news.com|slovenia|international-news
Slovenia Business|https://www.sloveniabusiness.eu|slovenia|international-news
The Sarajevo Times|https://sarajevotimes.com|bosnia-and-herzegovina|international-news
N1 English Balkans|https://n1info.ba/english|bosnia-and-herzegovina|international-news
Total Montenegro News|https://www.total-montenegro-news.com|montenegro|international-news
Montenegro Magazine|https://mne.today|montenegro|international-community
Tirana Times|https://www.tiranatimes.com|albania|international-news
Exit News|https://exit.al/en|albania|international-news
Albanian Daily News|https://albaniandailynews.com|albania|international-news
The Sofia Globe|https://sofiaglobe.com|bulgaria|international-news
Novinite|https://www.novinite.com|bulgaria|international-news
The Sofia Echo|https://sofiaecho.com|bulgaria|international-news
Vagabond|https://vagabond.bg|bulgaria|international-community
Romania Insider|https://www.romania-insider.com|romania|international-news
Business Review|https://business-review.eu|romania|international-news
Romania Journal|https://www.romaniajournal.ro|romania|international-news
Nine O'Clock|https://nineoclock.ro|romania|international-news
The Diplomat Bucharest|https://www.thediplomat.ro|romania|international-news
Budapest Business Journal|https://bbj.hu|hungary|international-news
Hungary Today|https://hungarytoday.hu|hungary|international-news
Daily News Hungary|https://dailynewshungary.com|hungary|international-news
The Budapest Times|https://www.budapesttimes.hu|hungary|international-news
XpatLoop|https://xpatloop.com|hungary|expat-portal
Diplomacy & Trade|https://dteurope.com|hungary|international-community
Greek Reporter|https://greekreporter.com|greece|international-news
Greek City Times|https://greekcitytimes.com|greece|diaspora-media
Ekathimerini|https://www.ekathimerini.com|greece|international-news
Athens Insider|https://www.athensinsider.com|greece|international-community
Neos Kosmos|https://neoskosmos.com|greece|diaspora-media
The National Herald|https://www.thenationalherald.com|greece|diaspora-media
Cyprus Mail|https://cyprus-mail.com|cyprus|international-news
Financial Mirror|https://www.financialmirror.com|cyprus|international-news
Cyprus Today|https://cyprustodayonline.com|cyprus|international-community
Cyprus Scene|https://cyprusscene.com|cyprus|international-community
In-Cyprus|https://in-cyprus.philenews.com|cyprus|international-news
Times of Malta|https://timesofmalta.com|malta|international-news
The Malta Independent|https://www.independent.com.mt|malta|international-news
MaltaToday|https://www.maltatoday.com.mt|malta|international-news
Lovin Malta|https://lovinmalta.com|malta|international-community
The Shift News|https://theshiftnews.com|malta|international-news
Daily Sabah|https://www.dailysabah.com|turkey|international-news
Hürriyet Daily News|https://www.hurriyetdailynews.com|turkey|international-news
Duvar English|https://www.duvarenglish.com|turkey|international-news
Bianet English|https://bianet.org/english|turkey|international-news
Turkey Recap|https://www.turkeyrecap.com|turkey|international-news
Georgia Today|https://georgiatoday.ge|georgia|international-news
Agenda.ge|https://agenda.ge|georgia|international-news
Civil Georgia|https://civil.ge|georgia|international-news
EVN Report|https://evnreport.com|armenia|international-news
Hetq English|https://hetq.am/en|armenia|international-news
The Kyiv Independent|https://kyivindependent.com|ukraine|international-news
Kyiv Post|https://www.kyivpost.com|ukraine|international-news
The New Voice of Ukraine|https://english.nv.ua|ukraine|international-news
Ukraine Business News|https://ubn.news|ukraine|international-news
Euromaidan Press|https://euromaidanpress.com|ukraine|international-news
UkraineWorld|https://ukraineworld.org|ukraine|international-news
The Slovak Spectator|https://spectator.sme.sk|slovakia|international-news
Slovakia Business Daily|https://slovakiabusinessdaily.com|slovakia|international-news
Japan Today|https://japantoday.com|japan|international-news
GaijinPot|https://gaijinpot.com|japan|expat-portal
Savvy Tokyo|https://savvytokyo.com|japan|international-community
Tokyo Cheapo|https://tokyocheapo.com|japan|international-community
Tokyo Weekender|https://www.tokyoweekender.com|japan|international-community
Metropolis Japan|https://metropolisjapan.com|japan|international-community
Japan Forward|https://japan-forward.com|japan|international-news
SoraNews24|https://soranews24.com|japan|international-community
The Japan News|https://japannews.yomiuri.co.jp|japan|international-news
The Mainichi|https://mainichi.jp/english|japan|international-news
The Korea Herald|https://www.koreaherald.com|south-korea|international-news
The Korea Times|https://www.koreatimes.co.kr|south-korea|international-news
Korea JoongAng Daily|https://koreajoongangdaily.joins.com|south-korea|international-news
The Korea Bizwire|https://koreabizwire.com|south-korea|international-news
10 Magazine Korea|https://10mag.com|south-korea|international-community
Groove Korea|https://groovekorea.com|south-korea|international-community
Haps Korea|https://www.hapskorea.com|south-korea|international-community
Seoul Foreign Resident Center|https://global.seoul.go.kr|south-korea|expat-portal
China Daily|https://www.chinadaily.com.cn|china|international-news
Global Times|https://www.globaltimes.cn|china|international-news
Shanghai Daily|https://www.shine.cn|china|international-news
The Beijinger|https://www.thebeijinger.com|china|international-community
SmartShanghai|https://www.smartshanghai.com|china|expat-portal
That's Magazine|https://www.thatsmags.com|china|international-community
eChinacities|https://www.echinacities.com|china|expat-portal
Caixin Global|https://www.caixinglobal.com|china|international-news
South China Morning Post|https://www.scmp.com|hong-kong|international-news
Hong Kong Free Press|https://hongkongfp.com|hong-kong|international-news
The Standard Hong Kong|https://www.thestandard.com.hk|hong-kong|international-news
Localiiz|https://www.localiiz.com|hong-kong|international-community
Sassy Hong Kong|https://www.sassyhongkong.com|hong-kong|international-community
Expat Living Hong Kong|https://expatliving.hk|hong-kong|expat-portal
Hong Kong Business|https://hongkongbusiness.hk|hong-kong|international-news
Coconuts Hong Kong|https://coconuts.co/hongkong|hong-kong|international-community
The Straits Times|https://www.straitstimes.com|singapore|international-news
CNA|https://www.channelnewsasia.com|singapore|international-news
TODAY Singapore|https://www.todayonline.com|singapore|international-news
Mothership|https://mothership.sg|singapore|international-community
Expat Living Singapore|https://expatliving.sg|singapore|expat-portal
The Honeycombers|https://thehoneycombers.com|singapore|international-community
Expat Choice|https://www.expatchoice.asia|singapore|expat-portal
Singapore Business Review|https://sbr.com.sg|singapore|international-news
Bangkok Post|https://www.bangkokpost.com|thailand|international-news
The Thaiger|https://thethaiger.com|thailand|international-news
The Nation Thailand|https://www.nationthailand.com|thailand|international-news
Pattaya Mail|https://www.pattayamail.com|thailand|international-community
The Phuket News|https://www.thephuketnews.com|thailand|international-community
Hua Hin Today|https://www.huahintoday.com|thailand|international-community
Chiang Mai Citylife|https://www.chiangmaicitylife.com|thailand|international-community
BK Magazine|https://www.bkmagazine.com|thailand|international-community
ASEAN NOW|https://aseannow.com|thailand|expat-portal
Thailand Business News|https://www.thailand-business-news.com|thailand|international-news
VnExpress International|https://e.vnexpress.net|vietnam|international-news
Vietnam News|https://vietnamnews.vn|vietnam|international-news
VietnamNet Global|https://vietnamnet.vn/en|vietnam|international-news
Tuoi Tre News|https://tuoitrenews.vn|vietnam|international-news
Saigoneer|https://saigoneer.com|vietnam|international-community
Vietnam Investment Review|https://vir.com.vn|vietnam|international-news
The Smart Local Vietnam|https://thesmartlocal.com/vietnam|vietnam|international-community
The Star Malaysia|https://www.thestar.com.my|malaysia|international-news
Malay Mail|https://www.malaymail.com|malaysia|international-news
Free Malaysia Today|https://www.freemalaysiatoday.com|malaysia|international-news
Malaysiakini|https://www.malaysiakini.com|malaysia|international-news
New Straits Times|https://www.nst.com.my|malaysia|international-news
The Expat Group|https://www.expatgo.com|malaysia|expat-portal
The Borneo Post|https://www.theborneopost.com|malaysia|international-news
The Jakarta Post|https://www.thejakartapost.com|indonesia|international-news
Jakarta Globe|https://jakartaglobe.id|indonesia|international-news
Indonesia Expat|https://indonesiaexpat.id|indonesia|expat-portal
The Bali Sun|https://thebalisun.com|indonesia|international-community
NOW! Jakarta|https://nowjakarta.co.id|indonesia|international-community
Honeycombers Bali|https://thehoneycombers.com/bali|indonesia|international-community
Coconuts Bali|https://coconuts.co/bali|indonesia|international-community
Rappler|https://www.rappler.com|philippines|international-news
Philippine Daily Inquirer|https://www.inquirer.net|philippines|international-news
The Philippine Star|https://www.philstar.com|philippines|international-news
Manila Bulletin|https://mb.com.ph|philippines|international-news
When in Manila|https://www.wheninmanila.com|philippines|international-community
Expat Philippines|https://expatphilippines.ph|philippines|expat-portal
The Phnom Penh Post|https://www.phnompenhpost.com|cambodia|international-news
Khmer Times|https://www.khmertimeskh.com|cambodia|international-news
The Cambodia Daily|https://english.cambodiadaily.com|cambodia|international-news
Cambodianess|https://cambodianess.com|cambodia|international-news
Southeast Asia Globe|https://southeastasiaglobe.com|cambodia|international-news
The Laotian Times|https://laotiantimes.com|laos|international-news
Frontier Myanmar|https://www.frontiermyanmar.net|myanmar|international-news
The Irrawaddy|https://www.irrawaddy.com|myanmar|international-news
Mizzima|https://eng.mizzima.com|myanmar|international-news
Taipei Times|https://www.taipeitimes.com|taiwan|international-news
Taiwan News|https://www.taiwannews.com.tw|taiwan|international-news
The News Lens International|https://international.thenewslens.com|taiwan|international-news
TaiwanPlus|https://www.taiwanplus.com|taiwan|international-news
The Kathmandu Post|https://kathmandupost.com|nepal|international-news
The Annapurna Express|https://theannapurnaexpress.com|nepal|international-news
Daily FT Sri Lanka|https://www.ft.lk|sri-lanka|international-news
Daily Mirror Sri Lanka|https://www.dailymirror.lk|sri-lanka|international-news
The Sunday Times Sri Lanka|https://www.sundaytimes.lk|sri-lanka|international-news
The Daily Star Bangladesh|https://www.thedailystar.net|bangladesh|international-news
The Business Standard|https://www.tbsnews.net|bangladesh|international-news
Dawn|https://www.dawn.com|pakistan|international-news
The Express Tribune|https://tribune.com.pk|pakistan|international-news
Pakistan Today|https://www.pakistantoday.com.pk|pakistan|international-news
The National UAE|https://www.thenationalnews.com|united-arab-emirates|international-news
Gulf News|https://gulfnews.com|united-arab-emirates|international-news
Khaleej Times|https://www.khaleejtimes.com|united-arab-emirates|international-news
Arabian Business|https://www.arabianbusiness.com|united-arab-emirates|international-news
What's On UAE|https://whatson.ae|united-arab-emirates|international-community
Time Out Dubai|https://www.timeoutdubai.com|united-arab-emirates|international-community
Dubai Chronicle|https://www.dubaichronicle.com|united-arab-emirates|international-community
Emirates Woman|https://emirateswoman.com|united-arab-emirates|international-community
Doha News|https://dohanews.co|qatar|international-news
Gulf Times|https://www.gulf-times.com|qatar|international-news
The Peninsula Qatar|https://thepeninsulaqatar.com|qatar|international-news
Marhaba Qatar|https://marhaba.qa|qatar|expat-portal
I Love Qatar|https://www.iloveqatar.net|qatar|international-community
Qatar Living|https://www.qatarliving.com|qatar|expat-portal
Arab News|https://www.arabnews.com|saudi-arabia|international-news
Saudi Gazette|https://saudigazette.com.sa|saudi-arabia|international-news
Destination KSA|https://destinationksa.com|saudi-arabia|international-community
Gulf Daily News|https://www.gdnonline.com|bahrain|international-news
Bahrain This Week|https://www.bahrainthisweek.com|bahrain|international-community
Bahrain Confidential|https://www.bahrain-confidential.com|bahrain|international-community
Gulf Insider|https://www.gulf-insider.com|bahrain|international-community
Kuwait Times|https://kuwaittimes.com|kuwait|international-news
Arab Times Kuwait|https://www.arabtimesonline.com|kuwait|international-news
The Times Kuwait|https://timeskuwait.com|kuwait|international-community
Kuwait Local|https://kuwaitlocal.com|kuwait|expat-portal
Times of Oman|https://timesofoman.com|oman|international-news
Oman Observer|https://www.omanobserver.om|oman|international-news
Muscat Daily|https://www.muscatdaily.com|oman|international-news
The Arabian Stories|https://www.thearabianstories.com|oman|international-community
The Jordan Times|https://jordantimes.com|jordan|international-news
L'Orient Today|https://today.lorientlejour.com|lebanon|international-news
Beirut.com|https://www.beirut.com|lebanon|international-community
Executive Magazine|https://www.executive-magazine.com|lebanon|international-news
The Times of Israel|https://www.timesofisrael.com|israel|international-news
The Jerusalem Post|https://www.jpost.com|israel|international-news
Haaretz|https://www.haaretz.com|israel|international-news
Israel National News|https://www.israelnationalnews.com|israel|international-news
Egypt Independent|https://www.egyptindependent.com|egypt|international-news
Ahram Online|https://english.ahram.org.eg|egypt|international-news
Daily News Egypt|https://www.dailynewsegypt.com|egypt|international-news
Egyptian Streets|https://egyptianstreets.com|egypt|international-community
CairoScene|https://cairoscene.com|egypt|international-community
Morocco World News|https://www.moroccoworldnews.com|morocco|international-news
The View Morocco|https://theviewmorocco.com|morocco|international-news
The Tico Times|https://ticotimes.net|costa-rica|international-news
Q Costa Rica|https://qcostarica.com|costa-rica|international-community
AM Costa Rica|https://amcostarica.com|costa-rica|international-community
Costa Rica Star|https://news.co.cr|costa-rica|international-community
Mexico News Daily|https://mexiconewsdaily.com|mexico|international-news
The Yucatan Times|https://www.theyucatantimes.com|mexico|international-community
Gringo Gazette|https://gringogazette.com|mexico|expat-portal
Mexico Daily Post|https://mexicodailypost.com|mexico|international-community
Mexperience|https://www.mexperience.com|mexico|expat-portal
Newsroom Panama|https://newsroompanama.com|panama|international-news
Panama News|https://www.thepanamanews.com|panama|international-news
The Visitor Panama|https://www.thevisitorpanama.info|panama|international-community
Colombia Reports|https://colombiareports.com|colombia|international-news
The City Paper Bogotá|https://thecitypaperbogota.com|colombia|international-community
Colombia One|https://colombiaone.com|colombia|international-news
Medellin Living|https://medellinliving.com|colombia|expat-portal
Medellin Guru|https://medellinguru.com|colombia|expat-portal
CuencaHighLife|https://cuencahighlife.com|ecuador|expat-portal
Ecuador Times|https://www.ecuadortimes.net|ecuador|international-news
Buenos Aires Times|https://www.batimes.com.ar|argentina|international-news
Buenos Aires Herald|https://buenosairesherald.com|argentina|international-news
The Rio Times|https://www.riotimesonline.com|brazil|international-news
The Brazilian Report|https://brazilian.report|brazil|international-news
RioOnWatch|https://rioonwatch.org|brazil|international-community
Chile Today|https://chiletoday.cl|chile|international-news
Santiago Times|https://santiagotimes.cl|chile|international-news
Living in Peru|https://www.livinginperu.com|peru|expat-portal
Peruvian Times|https://www.peruviantimes.com|peru|international-news
Dominican Today|https://dominicantoday.com|dominican-republic|international-news
DR1|https://dr1.com|dominican-republic|expat-portal
The South African|https://www.thesouthafrican.com|south-africa|diaspora-media
Daily Maverick|https://www.dailymaverick.co.za|south-africa|international-news
Mail & Guardian|https://mg.co.za|south-africa|international-news
BusinessTech|https://businesstech.co.za|south-africa|diaspora-media
CapeTown ETC|https://www.capetownetc.com|south-africa|international-community
Nation Africa|https://nation.africa|kenya|international-news
The EastAfrican|https://www.theeastafrican.co.ke|kenya|international-news
Business Daily Africa|https://www.businessdailyafrica.com|kenya|international-news
Capital News|https://www.capitalfm.co.ke/news|kenya|international-news
African Arguments|https://africanarguments.org|global|international-news
The Africa Report|https://www.theafricareport.com|global|international-news
African Business|https://african.business|global|international-news
OkayAfrica|https://www.okayafrica.com|global|diaspora-media
The Continent|https://thecontinent.org|global|international-news
GhanaWeb|https://www.ghanaweb.com|ghana|diaspora-media
Modern Ghana|https://www.modernghana.com|ghana|diaspora-media
Premium Times|https://www.premiumtimesng.com|nigeria|international-news
The Guardian Nigeria|https://guardian.ng|nigeria|international-news
BusinessDay Nigeria|https://businessday.ng|nigeria|international-news
Nairametrics|https://nairametrics.com|nigeria|international-news
The Namibian|https://www.namibian.com.na|namibia|international-news
New Era Live|https://neweralive.na|namibia|international-news
The New Times Rwanda|https://www.newtimes.co.rw|rwanda|international-news
The Citizen Tanzania|https://www.thecitizen.co.tz|tanzania|international-news
The Independent Uganda|https://www.independent.co.ug|uganda|international-news
Zambia Reports|https://zambiareports.com|zambia|international-news
`.trim();

const COUNTRY_LABELS = {
  'People\'s Republic of China': 'china',
  'Czech Republic': 'czech-republic',
  'South Korea': 'south-korea',
  'United Arab Emirates': 'united-arab-emirates',
  'Saudi Arabia': 'saudi-arabia',
  'Sri Lanka': 'sri-lanka',
  'Costa Rica': 'costa-rica',
  'Dominican Republic': 'dominican-republic',
  'South Africa': 'south-africa',
  'Hong Kong': 'hong-kong',
  'European Union': 'european-union',
  'Bosnia and Herzegovina': 'bosnia-and-herzegovina',
  'North Macedonia': 'north-macedonia',
};

// Countries where an English-language newspaper is not, by itself, evidence of
// an expatriate/international edition. Explicit seeds can still include a title
// there when its audience fit is known; the broad discovery query cannot.
const WIKIDATA_EXCLUDED_COUNTRIES = new Set([
  'United States', 'United States of America', 'United Kingdom', 'Canada',
  'Australia', 'New Zealand', 'Ireland', 'India', 'Nigeria', 'South Africa',
  'Malaysia', 'Singapore', 'Philippines', 'Kenya', 'Ghana', 'Uganda', 'Rwanda',
  'Tanzania', 'Zambia', 'Zimbabwe', 'Botswana', 'Namibia', 'The Gambia',
  'Jamaica', 'Guyana', 'Fiji', 'Papua New Guinea', 'Solomon Islands',
]);

const cleanHost = (value) => {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
};

const slug = (value) => String(value || '').toLowerCase()
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const compareStable = (a, b) => String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;

function seedCandidates() {
  return SEEDS.split('\n').map((line) => {
    const [name, website, country, segment] = line.split('|');
    return { name, website, country, segment, discoveredFrom: 'editorial-seed' };
  });
}

async function wikidataCandidates() {
  const query = `SELECT DISTINCT ?itemLabel ?website ?countryLabel WHERE {
    ?item wdt:P31/wdt:P279* wd:Q11032; wdt:P856 ?website; wdt:P17 ?country.
    { ?item wdt:P407 wd:Q1860. } UNION { ?item wdt:P364 wd:Q1860. }
    FILTER(STRSTARTS(STR(?website), "http"))
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en".
      ?country rdfs:label ?countryLabel. ?item rdfs:label ?itemLabel. }
  } LIMIT 1500`;
  const url = new URL('https://query.wikidata.org/sparql');
  url.searchParams.set('query', query);
  url.searchParams.set('format', 'json');
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(90000) });
  if (!res.ok) throw new Error(`Wikidata returned ${res.status}`);
  const body = await res.json();
  return body.results.bindings.flatMap((row) => {
    const countryLabel = row.countryLabel && row.countryLabel.value;
    if (!countryLabel || WIKIDATA_EXCLUDED_COUNTRIES.has(countryLabel)) return [];
    const country = COUNTRY_LABELS[countryLabel] || slug(countryLabel);
    return [{
      name: row.itemLabel.value,
      website: row.website.value.replace(/^http:/, 'https:'),
      country,
      segment: 'international-news',
      discoveredFrom: 'wikidata-english-language-newspaper',
    }];
  });
}

function dedupe(rows) {
  const old = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const knownCountries = new Set(JSON.parse(fs.readFileSync(
    path.join(ROOT, 'data/business-directories/countries.json'), 'utf8',
  )).map((country) => country.slug));
  const oldHosts = new Set(old.map((row) => cleanHost(row.website)));
  const byHost = new Map();
  for (const row of rows) {
    const host = cleanHost(row.website);
    if (!host || !knownCountries.has(row.country) || oldHosts.has(host)
      || /wikipedia|newsbank|loc\.gov|\.onion$/.test(host)) continue;
    let website;
    try {
      const parsed = new URL(row.website);
      parsed.protocol = 'https:';
      parsed.search = '';
      parsed.hash = '';
      website = parsed.href.replace(/\/$/, '');
    } catch { continue; }
    const canonical = { ...row, website, host };
    const before = byHost.get(host);
    if (!before || SEGMENT_RANK[row.segment] < SEGMENT_RANK[before.segment]) byHost.set(host, canonical);
  }
  return [...byHost.values()];
}

function visibleRoutes(html, base) {
  const anchors = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  const out = [];
  for (const match of anchors) {
    const text = match[2].replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    let href;
    try { href = new URL(match[1], base).href; } catch { continue; }
    if (!href.startsWith('https://')) continue;
    if (/\b(write for us|become a contributor|submit (an? )?(article|story|guest post)|contribute (an? )?(article|story))\b/i.test(text)) {
      out.push({ kind: 'contributed-article', url: href, text: text.slice(0, 100) });
    } else if (/\b(sponsored (content|article|post) (opportunities|packages|program)|branded content (solutions|studio|opportunities)|native advertising|partner article)\b/i.test(text)) {
      out.push({ kind: 'sponsored-content', url: href, text: text.slice(0, 100) });
    }
  }
  return out.filter((route, index) => out.findIndex((x) => x.kind === route.kind && x.url === route.url) === index);
}

async function probeSite(row) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(row.website, {
      redirect: 'follow', signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
    });
    const html = await res.text();
    const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    const title = ((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '')
      .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
    const protectedResponse = [401, 403, 429].includes(res.status);
    const parked = /domain (is|may be) for sale|buy this domain|sedo\.com|hugedomains|parking page/i
      .test(`${title} ${text.slice(0, 1800)}`);
    return {
      state: res.ok && text.length >= 300 && !parked ? 'live' : protectedResponse ? 'protected' : 'failed',
      status: res.status,
      finalUrl: res.url,
      title,
      textLength: text.length,
      parked,
      routes: res.ok ? visibleRoutes(html, res.url) : [],
      checkedAt: TODAY,
    };
  } catch (error) {
    return { state: 'failed', error: error.name === 'AbortError' ? 'timeout' : error.message, checkedAt: TODAY };
  } finally { clearTimeout(timer); }
}

const writeFindings = (value) => fs.writeFileSync(FINDINGS, `${JSON.stringify(value, null, 2)}\n`);

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

  let cursor = 0;
  const workers = Array.from({ length: 8 }, async () => {
    while (cursor < candidates.length) {
      const row = candidates[cursor++];
      const before = findings.candidates[row.host];
      if (before && before.site && before.site.checkedAt === TODAY) continue;
      // eslint-disable-next-line no-await-in-loop
      const site = await probeSite(row);
      findings.candidates[row.host] = { ...row, site, domainRating: before && before.domainRating };
      if (cursor % 20 === 0) writeFindings(findings);
    }
  });
  await Promise.all(workers);
  writeFindings(findings);

  for (let index = 0; index < candidates.length; index += 1) {
    const row = candidates[index];
    const finding = findings.candidates[row.host];
    if (finding.domainRating && finding.domainRating.measuredAt === TODAY) continue;
    // eslint-disable-next-line no-await-in-loop
    const measured = await askAhrefs(row.host, key);
    finding.domainRating = measured.ok
      ? { value: measured.domainRating, provider: 'Ahrefs', status: 'publicApiReading', measuredAt: TODAY }
      : { error: measured.why, measuredAt: TODAY };
    if (index % 10 === 0) writeFindings(findings);
    // Keep the documented public API pace below 60 requests per minute.
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
    && row.domainRating.value >= MIN_DR);
}

function rank(a, b) {
  return b.domainRating.value - a.domainRating.value
    || SEGMENT_RANK[a.segment] - SEGMENT_RANK[b.segment]
    || compareStable(a.name, b.name);
}

function select(findings) {
  const ordered = viable(findings).sort(rank);
  const selected = [];
  const selectedHosts = new Set();
  const countryCount = new Map();
  // Preserve breadth first. The second pass relaxes the cap only if needed.
  for (const cap of [12, 20, Infinity]) {
    for (const row of ordered) {
      if (selected.length >= WAVE_SIZE) break;
      if (selectedHosts.has(row.host)) continue;
      if ((countryCount.get(row.country) || 0) >= cap) continue;
      selected.push(row);
      selectedHosts.add(row.host);
      countryCount.set(row.country, (countryCount.get(row.country) || 0) + 1);
    }
  }
  return selected;
}

function explicitRecord(row) {
  if (row.host === 'expat.com') return {
    opportunityTypes: ['company-profile', 'sponsored-content'], costModel: 'mixed',
    submissionUrl: 'https://www.expat.com/en/business.html',
    advertisingUrl: 'https://www.expat.com/en/advertisement.html',
    publicProfileAvailable: true, sponsoredContentAvailable: true,
    shortNote: 'Global expatriate community portal with free and premium business profiles plus commercial audience placements.',
    limitations: 'A direct follow website link was observed on one public business profile. Placement terms and templates can change, so recheck before purchase.',
    sources: ['https://www.expat.com/en/advertisement.html', 'https://www.expat.com/en/business.html', 'https://www.expat.com/en/faq.html'],
    backlinkType: 'dofollow', linkTargetType: 'direct', listingIndexability: 'indexable',
    backlinkProvenance: {
      listingUrl: 'https://www.expat.com/en/business/27315_ags-movers-czech-republic-prague.html',
      externalUrl: 'https://www.agsmovers.com/moving-quote?utm_source=expat.com&utm_medium=listing-texte-republique-tcheque-en&utm_campaign=ags-expat-sites&campaign_id=360',
      relTokens: [], observedAt: row.site.checkedAt,
    },
  };
  if (row.host === 'expats.cz') return {
    opportunityTypes: ['company-profile', 'sponsored-content'], costModel: 'mixed',
    submissionUrl: 'https://www.expats.cz/directory',
    advertisingUrl: 'https://www.expats.cz/czech-news/article/expatscz-advertising',
    publicProfileAvailable: true, sponsoredContentAvailable: true,
    shortNote: 'English-language Czech community publisher with business directory profiles, partner articles, HR content and newsletters.',
    limitations: 'A direct follow website link was observed on one indexable directory profile. Sponsored and directory pricing varies by package.',
    sources: ['https://www.expats.cz/czech-news/article/advertising-policies', 'https://www.expats.cz/czech-news/article/expatscz-advertising', 'https://www.expats.cz/directory'],
    backlinkType: 'dofollow', linkTargetType: 'direct', listingIndexability: 'indexable',
    backlinkProvenance: {
      listingUrl: 'https://www.expats.cz/directory/listing/kronossoftware',
      externalUrl: 'http://www.kronos-software.eu', relTokens: [], observedAt: row.site.checkedAt,
    },
  };
  return null;
}

function genericRecord(row) {
  const routes = (row.site.routes || []).filter((route) => /^https:\/\//.test(route.url));
  const contributed = routes.find((route) => route.kind === 'contributed-article');
  const sponsored = routes.find((route) => route.kind === 'sponsored-content');
  const types = [contributed && 'contributed-article', sponsored && 'sponsored-content'].filter(Boolean).sort();
  const descriptions = {
    'expat-portal': 'an expatriate portal for people living and working internationally',
    'international-community': 'an international community publication for foreign residents and globally minded local readers',
    'international-news': 'an English-language or international news publication serving cross-border readers',
    'diaspora-media': 'a diaspora publication connecting a country with readers abroad',
    'global-mobility': 'a global mobility publication for relocation and international-work professionals',
  };
  const categories = ['expat-community-media'];
  if (row.segment === 'international-news' || row.segment === 'diaspora-media') categories.push('local-business-media');
  if (row.segment === 'global-mobility') categories.push('hr-recruitment-media');
  if (row.segment === 'international-community') categories.push('travel-hospitality-media');
  categories.sort();
  const routeNote = types.length
    ? ` The publisher's homepage exposes ${types.join(' and ')} wording; editorial acceptance is not guaranteed.`
    : ' No public contribution or sponsored-article route was established from the inspected homepage.';
  const languageNote = ['china', 'japan', 'south-korea'].includes(row.country)
    ? ' The recorded surface is English-language.' : '';
  const statusNote = row.site.state === 'protected'
    ? ' Homepage status stays unknown because automated inspection was blocked.' : '';
  return {
    categories,
    opportunityTypes: types.length ? types : ['unknown'],
    costModel: contributed && sponsored ? 'mixed' : sponsored ? 'paid' : contributed ? 'free' : 'unknown',
    submissionUrl: contributed ? contributed.url : null,
    advertisingUrl: sponsored ? sponsored.url : null,
    publicProfileAvailable: null,
    requiresEditorialApproval: contributed ? true : null,
    sponsoredContentAvailable: sponsored ? true : null,
    shortNote: `${row.name} is ${descriptions[row.segment]}.${languageNote}${statusNote}`,
    limitations: routeNote.trim(),
    sources: [...new Set([row.website, contributed && contributed.url, sponsored && sponsored.url].filter(Boolean))].sort(),
  };
}

function apply() {
  if (!fs.existsSync(FINDINGS)) throw new Error('Run --research before --apply.');
  const findings = JSON.parse(fs.readFileSync(FINDINGS, 'utf8'));
  const selected = select(findings);
  if (selected.length !== WAVE_SIZE) {
    throw new Error(`Refusing to apply ${selected.length} records; this wave requires exactly ${WAVE_SIZE} live/protected domains with Ahrefs DR >= ${MIN_DR}.`);
  }
  const old = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const withoutWave = old.filter((row) => !row.categories.includes('expat-community-media'));
  const records = selected.map((row) => {
    const explicit = explicitRecord(row);
    const generic = genericRecord(row);
    const dr = row.domainRating.value;
    return {
      id: `md-${slug(row.name)}-${slug(row.host).slice(0, 28)}`,
      name: row.name,
      website: row.website,
      country: row.country,
      audienceGeography: row.country === 'global' ? 'global'
        : row.country === 'european-union' ? 'regional' : 'national',
      categories: explicit ? ['expat-community-media'] : generic.categories,
      industries: row.segment === 'global-mobility' ? ['hr'] : ['general', 'travel'],
      languages: ['en'],
      currentStatus: row.site.state === 'live' ? 'active' : 'unknown',
      priority: dr >= 70 ? 'P1' : dr >= 50 ? 'P2' : 'P3',
      ...(explicit || generic),
      pitchUrl: null,
      pressReleaseUrl: null,
      mediaKitUrl: null,
      contactUrl: null,
      editorialContact: null,
      lastVerified: row.site.checkedAt,
      domainRating: dr,
      metricsProvenance: { domainRating: {
        provider: 'Ahrefs', measuredAt: row.domainRating.measuredAt,
        status: 'publicApiReading', measuredDomain: row.host,
      } },
    };
  });
  const ids = new Set();
  for (const row of records) {
    let id = row.id;
    let suffix = 2;
    while (ids.has(id) || withoutWave.some((old) => old.id === id)) id = `${row.id}-${suffix++}`;
    row.id = id;
    ids.add(id);
  }
  // Preserve the established corpus byte order. Historical batches were
  // appended, not globally sorted; reordering 486 unchanged records makes a
  // review look like they were rewritten. Only this wave is sorted.
  records.sort((a, b) => compareStable(a.id, b.id));
  const next = [...withoutWave, ...records];
  fs.writeFileSync(DATA, `${JSON.stringify(next, null, 1)}\n`);
  updateDrLedger(records);
  updateLinkLedger(records);
  console.log(`Applied ${records.length} Expat & International Community Media records.`);
}

function updateDrLedger(records) {
  const ledger = JSON.parse(fs.readFileSync(DR_LEDGER, 'utf8'));
  const byTarget = new Map(ledger.findings.map((finding) => [finding.target, finding]));
  for (const row of records) {
    const target = cleanHost(row.website);
    let finding = byTarget.get(target);
    if (!finding) {
      finding = {
        key: `ahrefs|domain-rating|${target}`,
        target,
        provider: 'Ahrefs',
        state: 'MEASURED',
        domainRating: row.domainRating,
        checkedAt: row.metricsProvenance.domainRating.measuredAt,
        records: [],
      };
      byTarget.set(target, finding);
    } else {
      finding.domainRating = row.domainRating;
      finding.checkedAt = row.metricsProvenance.domainRating.measuredAt;
      finding.state = 'MEASURED';
    }
    finding.records = finding.records.filter((record) => !(record.collection === 'media'
      && record.id === row.id));
    finding.records.push({ collection: 'media', id: row.id });
    finding.records.sort((a, b) => compareStable(a.collection, b.collection)
      || compareStable(a.id, b.id));
  }
  ledger.probedAt = TODAY;
  ledger.findings = [...byTarget.values()].sort((a, b) => compareStable(a.target, b.target));
  fs.writeFileSync(DR_LEDGER, `${JSON.stringify(ledger, null, 1)}\n`);
}

function updateLinkLedger(records) {
  const raw = fs.readFileSync(LINK_LEDGER, 'utf8');
  const ledger = JSON.parse(raw);
  const lastByKey = new Map();
  ledger.findings.forEach((finding) => { lastByKey.set(finding.key, finding); });
  const pending = [];
  for (const row of records.filter((record) => record.backlinkType)) {
    const p = row.backlinkProvenance;
    const key = `link|media|${row.id}`;
    const finding = {
      collection: 'media', id: row.id, country: row.country, url: row.website,
      domainRating: row.domainRating, actionable: true, key,
      observedAt: p.observedAt, state: 'RESOLVED',
      backlinkType: row.backlinkType, linkTargetType: row.linkTargetType,
      listingIndexability: row.listingIndexability,
      why: 'the inspected public profile website anchor carries no restrictive rel token',
      templates: [{
        listingUrl: p.listingUrl, backlinkType: row.backlinkType,
        linkTargetType: row.linkTargetType, externalUrl: p.externalUrl,
        relTokens: p.relTokens, anchorText: 'Website', indexability: row.listingIndexability,
      }],
      observations: [
        { observedAt: p.observedAt, kind: 'listing-discovered', url: p.listingUrl },
        {
          observedAt: p.observedAt, kind: 'listing-read', url: p.listingUrl,
          externalUrl: p.externalUrl, relTokens: p.relTokens,
          anchorText: 'Website', indexability: row.listingIndexability,
        },
      ],
    };
    const existing = lastByKey.get(key);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(finding)) {
        throw new Error(`${key} already exists with different raw evidence; use the link-value researcher to supersede it.`);
      }
    } else pending.push(finding);
  }
  if (!pending.length) return;
  const marker = '\n ]\n}\n';
  if (!raw.endsWith(marker)) throw new Error('The link-value ledger has an unexpected serialization shape.');
  const fragment = JSON.stringify(pending, null, 1).split('\n').slice(1, -1)
    .map((line) => ` ${line}`).join('\n');
  const comma = ledger.findings.length ? ',' : '';
  let next = raw.slice(0, -marker.length) + `${comma}\n${fragment}${marker}`;
  next = next.replace(/^( "probedAt": )"[^"]+"/m, `$1"${TODAY}"`);
  fs.writeFileSync(LINK_LEDGER, next);
}

function report(findings = null) {
  const data = findings || (fs.existsSync(FINDINGS) ? JSON.parse(fs.readFileSync(FINDINGS, 'utf8')) : null);
  if (!data) throw new Error('No findings. Run --research first.');
  const pool = Object.values(data.candidates);
  const good = viable(data);
  const selected = select(data);
  const states = Object.groupBy ? Object.groupBy(pool, (row) => row.site && row.site.state || 'unresearched') : null;
  console.log(`Candidates: ${pool.length}`);
  console.log(`DR >= ${MIN_DR} and reachable/protected: ${good.length}`);
  console.log(`Selected: ${selected.length}/${WAVE_SIZE}`);
  if (states) console.log(`States: ${Object.entries(states).map(([key, rows]) => `${key}=${rows.length}`).join(', ')}`);
  console.log(`Selected DR range: ${selected.length ? `${Math.min(...selected.map((row) => row.domainRating.value))}-${Math.max(...selected.map((row) => row.domainRating.value))}` : 'n/a'}`);
  const countryCounts = new Map();
  for (const row of selected) countryCounts.set(row.country, (countryCounts.get(row.country) || 0) + 1);
  console.log(`Countries: ${countryCounts.size}`);
  console.log([...countryCounts].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([country, count]) => `${country}=${count}`).join(', '));
}

async function main() {
  if (process.argv.includes('--research')) return research();
  if (process.argv.includes('--apply')) return apply();
  if (process.argv.includes('--report')) return report();
  throw new Error('Choose --research, --report or --apply.');
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
