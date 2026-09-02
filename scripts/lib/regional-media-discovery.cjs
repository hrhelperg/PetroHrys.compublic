'use strict';

// What makes a candidate REGIONAL, stated once so it can be tested.
//
// ── THE FAILURE THIS FILE EXISTS TO PREVENT ─────────────────────────────────
//
// Wave 4 started from a country-scoped Wikidata query that accepted any outlet
// carrying a headquarters or a place of publication. Every newspaper has a
// headquarters. Le Monde is headquartered in Paris and its Wikidata description
// is "French daily evening newspaper": no "national" token to veto it, a place
// to satisfy the gate, and a Domain Rating of 91 to sail past the quality bar.
// That rule would have filled a regional registry with national papers of
// record and called the result evidence. A headquarters says where a newsroom
// sits; it does not say whom the newsroom covers, and the registry's entire
// claim is about coverage.
//
// So a headquarters alone is never sufficient here. A candidate is admitted
// only on one of four signals, in descending strength:
//
//   regional-class            its Wikidata class MEANS subnational — "local
//                             newspaper", "regional daily press", "papur bro".
//   structured-jurisdiction   P1001 applies-to-jurisdiction or P2541 operating
//                             area names a place that is not its own country.
//   licensed-local-broadcast  a licensed broadcast STATION (never a network or
//                             channel) with a city of licence. Unlike a
//                             newspaper's head office, a station's licensed
//                             locality IS its market — that is what the licence
//                             grants — so the locality is coverage evidence.
//   regional-description      the item's own description, in ANY language,
//                             says local/regional/county/provincial. Wikidata's
//                             English descriptions are sparse outside the
//                             anglosphere, so reading only `en` would have
//                             quietly restricted wave 4 to English-speaking
//                             countries.
//
// A national marker in any description vetoes all of these except
// regional-class, where the class statement is the stronger evidence.

// ── WIKIDATA ROOT CLASSES ───────────────────────────────────────────────────
//
// The starting code listed Q1580166 as "news website". Q1580166 is
// "dictionary entry"; its descendants are Wiktionary pages, ghost words and
// lexicographic errors. It is dropped rather than corrected because
// Q1153191 (online newspaper) already covers the digital-native outlets it was
// meant to reach.
const WIKIDATA_ROOTS = {
  Q11032: 'newspaper',
  Q1153191: 'online newspaper',
  Q1616075: 'television station',
  Q14350: 'radio station',
};

// ── CLASSES THAT MEAN SUBNATIONAL ───────────────────────────────────────────
const REGIONAL_CLASSES = new Set([
  'Q1868552', // local newspaper
  'Q2138556', // regional newspaper
  'Q27156322', // regional newspapers
  'Q106651444', // community newspaper
  'Q5155035', // community paper
  'Q11335135', // block newspaper
  'Q14472063', // papur bro (Welsh community paper)
  'Q2390658', // village newspaper
  'Q3129162', // regional weekly
  'Q3414785', // regional daily press
  'Q2328176', // district newspaper
  'Q20919310', // provincial newspaper
  'Q130633255', // neighborhood paper
  'Q11968661', // fellesaviser (Norwegian multi-municipality papers)
  'Q1868541', // local radio station
  'Q67146622', // French local radio station
  'Q1179112', // community radio
  'Q5155072', // community television
  'Q5155071', // community television in Australia
  'Q88391602', // ORF regional studios
  'Q107170444', // resort newspaper
]);

// ── CLASSES THAT DISQUALIFY ─────────────────────────────────────────────────
//
// Grouped by why, because "excluded" without a reason is unmaintainable.
const EXCLUDED_CLASSES = new Set([
  // National scope, networks, and publisher groups.
  'Q11389521', 'Q1416653', 'Q120068370', 'Q7019804', 'Q3416957', 'Q6054765',
  'Q115477322', 'Q3416935', 'Q19795283', 'Q752106', 'Q6841189',
  // Formats, editions and printing conventions — not outlets.
  'Q187051', 'Q669935', 'Q665319', 'Q1449648', 'Q895089', 'Q106650967',
  'Q121066194', 'Q7572780', 'Q3535851', 'Q3402495', 'Q1278984', 'Q1514286',
  'Q2466157', 'Q7531230', 'Q12902861', 'Q118587151', 'Q2966795', 'Q11435607',
  'Q11650541', 'Q3899141', 'Q5369583', 'Q2048876', 'Q569348', 'Q107181871',
  // Lists, categories and single outlets mistakenly used as classes.
  'Q17016787', 'Q109420226', 'Q13510398', 'Q6158891', 'Q5436093', 'Q25040622',
  'Q61864264', 'Q61864274', 'Q132646844', 'Q16853516', 'Q57207479',
  'Q125763466', 'Q15909153', 'Q11482924', 'Q5739197', 'Q7512967',
  'Q127101587', 'Q125728097', 'Q140546442', 'Q138839806', 'Q119167233',
  'Q134173265', 'Q12046361', 'Q118496406', 'Q63121712', 'Q123523525',
  'Q31739997', 'Q105637045', 'Q5104179', 'Q5100946', 'Q106508612',
  // Academic, school and other captive-audience publications.
  'Q738377', 'Q4468966', 'Q20850562', 'Q106661426', 'Q107227701', 'Q106162750',
  'Q27963520', 'Q6296062', 'Q1436229', 'Q1622285', 'Q1451256', 'Q6516740',
  'Q7627897', 'Q321745', 'Q107258494', 'Q20821444', 'Q832165', 'Q106664450',
  'Q16969555', 'Q2024265', 'Q106676147', 'Q107182185', 'Q1935225', 'Q106668646',
  'Q106687540', 'Q107183126', 'Q107181559', 'Q107183145', 'Q107182201',
  'Q107182208', 'Q107170655', 'Q107181454', 'Q2006125',
  // Government gazettes and official record publications.
  'Q2065227', 'Q3186812', 'Q480422', 'Q17541977', 'Q6692697', 'Q27719224',
  'Q3276608', 'Q4151357', 'Q124061099', 'Q87527714', 'Q107236916',
  // Genres that exist only historically; a live site under one is a museum.
  'Q3186988', 'Q2291158', 'Q22981456', 'Q11976958', 'Q3186859', 'Q1741521',
  'Q107236966', 'Q107237013', 'Q107178453', 'Q106651322', 'Q107179479',
  'Q107236883', 'Q107181979', 'Q107183138', 'Q107182456', 'Q107170485',
  'Q107208914', 'Q18680105', 'Q56296973', 'Q107181855', 'Q106668702',
  'Q107258714', 'Q106676275', 'Q106687644', 'Q106650857', 'Q107258644',
  'Q107258724', 'Q107208916', 'Q106676417',
  // Party, advocacy and religious press: audience is a cause, not a place.
  'Q442927', 'Q107236680', 'Q107259292', 'Q106651430', 'Q106668471',
  'Q106687570', 'Q106650895', 'Q106651089', 'Q107171980', 'Q106651150',
  'Q113486165', 'Q106651156', 'Q106651148', 'Q107171978', 'Q106677862',
  'Q107171982', 'Q107183119', 'Q107183151', 'Q106671524', 'Q107259317',
  'Q106677807', 'Q107182322', 'Q131785467', 'Q106678098', 'Q106678195',
  'Q106664582', 'Q106676186', 'Q25101925', 'Q55631054', 'Q19046104',
  'Q106651338',
  // Trade and special-interest press: audience is a trade, not a place.
  'Q106651372', 'Q106635283', 'Q106668332', 'Q106668535', 'Q106687639',
  'Q106668248', 'Q106651073', 'Q107170506', 'Q106635276', 'Q107236776',
  'Q106677940', 'Q11313190', 'Q7426758', 'Q62470341', 'Q106668420',
  'Q106651333', 'Q106652786', 'Q107182194', 'Q106651387', 'Q2497638',
  'Q1249529', 'Q106652977', 'Q106634743', 'Q115689759', 'Q61856389',
  'Q61719079', 'Q106652971', 'Q106687653', 'Q107170468', 'Q107236603',
  'Q107236849', 'Q107236569', 'Q10493961',
  // Broadcast classes that carry no newsroom at all.
  'Q140699', 'Q114359721', 'Q115246447', 'Q5759948', 'Q5165490', 'Q1969511',
  'Q877017', 'Q3416690', 'Q6071714', 'Q7197843', 'Q80942514', 'Q2920351',
  'Q3416955', 'Q773067', 'Q18652006', 'Q5223107', 'Q3416968', 'Q5130615',
  'Q1407358', 'Q3902101', 'Q123485443', 'Q561068', 'Q125698895', 'Q5001853',
  'Q1787375', 'Q5287666', 'Q6942441', 'Q132083517',
  // The mislabelled "news website" root and its dictionary descendants.
  'Q1580166', 'Q20088085', 'Q20088089', 'Q1511109', 'Q6537711', 'Q109819438',
]);

// Defence in depth for classes nobody has enumerated yet: Wikidata gains new
// subclasses constantly, and an unlisted one must not become a silent
// admission route. The label is checked as well as the identifier.
const EXCLUDED_CLASS_LABEL = /\b(national|nationwide|state broadcaster|public service|network|chain|format|edition|student|school|college|university|campus|academic|scholarly|church|parish|party|propaganda|gazette|government|official journal|pirate|numbers station|weather radio|marine|emergency|defunct|historic|list of|category)\b/i;

// ── DESCRIPTION SIGNALS ─────────────────────────────────────────────────────
//
// Read in every language Wikidata carries. Restricting these to `en` is what
// made the starting code's yield collapse outside the anglosphere: only 355 of
// 5,038 newspapers with a website carry a regional English description, while
// the local-language descriptions say "Regionalzeitung", "lokalavis",
// "quotidien régional" and "地方紙" in abundance.
const STRONG_REGIONAL_DESCRIPTION = new RegExp([
  // English
  'local', 'regional', 'community', 'county', 'district', 'provincial',
  'municipal', 'metropolitan', 'statewide', 'state-wide',
  // German, Dutch, Scandinavian
  'lokal', 'regional', 'heimatzeitung', 'kreiszeitung', 'landkreis',
  'stadtteil', 'bezirk', 'streekblad', 'streekkrant', 'regionaal', 'regionale',
  'dagblad voor', 'lokalavis', 'lokaltidning', 'landsortstidning',
  'distriktsavis', 'fylkesavis', 'amtsavis',
  // Finnish, Estonian, Latvian, Lithuanian
  'paikallislehti', 'paikallinen', 'maakuntalehti', 'alueellinen',
  'kohalik', 'maakonnaleht', 'novada', 'rajono',
  // Romance
  'r[ée]gional', 'd[ée]partemental', 'comarcal', 'provincial', 'comunale',
  'quotidiano locale', 'quotidien r[ée]gional', 'peri[oó]dico local',
  'jornal local', 'jornal regional', 'diario local', 'diario regional',
  'jude[țt]ean', 'locala', 'local[ăa]',
  // Slavic
  'lokaln', 'regionaln', 'powiatow', 'gminn', 'wojew[oó]dzk', 'miejsk',
  'krajsk', 'okresn', 'm[eě]stsk', 'm[ií]stn', '[žz]upanijsk', 'gradsk',
  'oblastn', 'rajonn', '[оo]бласт?н', 'районн', 'м[іi]ськ', 'регионал',
  'рег[іi]ональн', 'м[еe]стн', 'м[іi]сцев', 'краев', 'губернск',
  // Hungarian, Greek, Turkish, Hebrew, Arabic
  'megyei', 'helyi', 'v[áa]rosi', 'τοπικ', 'περιφερειακ',
  'yerel', 'b[öo]lgesel', 'kent gazetesi', 'מקומי', 'אזורי',
  'محلية', 'إقليمية', 'محلي',
  // East and Southeast Asia
  '地方紙', '地方新聞', '県紙', 'ブロック紙', '地域紙', '地方报', '地区报',
  '지역', '지방', 'lokal', 'daerah', 'wilayah', 'ท้องถิ่น', '[đd]ịa phương',
].join('|'), 'i');

// Weaker words that only become evidence next to a named place: a description
// saying "published in the city of X" tells you where the press sits, which is
// the headquarters problem again unless X is also the coverage claim.
const WEAK_PLACE_DESCRIPTION = /\b(city|town|village|borough|neighbou?rhood|serving|published in|based in|island)\b/i;

// "International" is not "national", and a paper described as "regional and
// international" must not be vetoed by the word hiding inside the second
// adjective. Every Latin-script national root is therefore guarded against the
// `inter-` prefix.
const NATIONAL_DESCRIPTION = new RegExp([
  '(?<!inter)national', '(?<!inter)nationwide', 'countrywide',
  'newspaper of record', 'paper of record',
  'public-service broadcaster', 'state broadcaster',
  '[üu]berregional', 'bundesweit', 'landelijk', 'rikst[äa]ckande', 'rikstidning',
  'riksdekkende', 'riksavis', 'landsd[æa]kkende', 'valtakunnallinen',
  'og[óo]lnopolsk', 'og[óo]lnokrajow', 'celost[áa]tn', 'orsz[áa]gos',
  '(?<!inter)na[țt]ional', '(?<!inter)nacional', '(?<!inter)nazionale',
  'общенациональн', 'всероссийск', 'федеральн', 'загальнонац[іi]ональн',
  'всеукра[їi]нськ', '全国紙', '全國性', '全国性', 'ulusal gazete',
].join('|'), 'i');

// ── HOSTS THAT ARE NEVER A REGIONAL PUBLISHER ───────────────────────────────
const ARCHIVE_HOST = /(^|\.)(archive\.org|archive\.today|britishnewspaperarchive\.co\.uk|calameo\.com|gallica\.bnf\.fr|loc\.gov|retronews\.fr|digi\.kansalliskirjasto\.fi|trove\.nla\.gov\.au|chroniclingamerica\.loc\.gov|europeana\.eu|issuu\.com|yumpu\.com|archives?\.[^.]+\.[a-z]{2,})$/i;
const ARCHIVE_PATH = /\/(archive|archives|archivio|chroniclingamerica|digitised|fonds|historic-newspapers|newspaper-archive|presse-regionale)(\/|\?|$)/i;
const SHARED_PUBLISHING_HOST = /(^|\.)(beehiiv\.com|blogspot\.[a-z.]+|campaign-archive\.com|ghost\.io|medium\.com|mailchi\.mp|myshopify\.com|netlify\.app|sites\.google\.com|substack\.com|tumblr\.com|vercel\.app|webflow\.io|weebly\.com|wixsite\.com|wordpress\.com|blogger\.com|livejournal\.com|over-blog\.com|canalblog\.com|jimdo(free)?\.com|joomla\.com|squarespace\.com|godaddysites\.com|000webhostapp\.com|neocities\.org|github\.io|pages\.dev|notion\.site|wp\.pl|onet\.pl)$/i;
const SOCIAL_HOST = /(^|\.)(facebook\.com|fb\.com|instagram\.com|linkedin\.com|linktr\.ee|x\.com|twitter\.com|youtube\.com|youtu\.be|tiktok\.com|t\.me|telegram\.me|vk\.com|threads\.net|bsky\.app|mastodon\.[a-z.]+|whatsapp\.com|pinterest\.[a-z.]+|soundcloud\.com|spotify\.com|apple\.com|flickr\.com|myspace\.com|reddit\.com|discord\.com)$/i;
// Academic and research infrastructure, including university roots that carry
// no news operation of their own.
const INSTITUTIONAL_HOST = /\.(ac|edu|sch)\.[a-z]{2}$|\.edu$|\.ac$|(^|\.)(crl\.edu|revistas\.usp\.br|scielo\.[a-z.]+|jstor\.org|doaj\.org|researchgate\.net|academia\.edu|springer\.com|elsevier\.com|tandfonline\.com|sagepub\.com|wiley\.com|zenodo\.org|osf\.io|arxiv\.org|hal\.science|persee\.fr|erudit\.org|redalyc\.org|dialnet\.unirioja\.es|uni-[a-z-]+\.de|univ-[a-z-]+\.fr|universi(dad|dade|ty|tat|tet)[a-z-]*\.[a-z.]+)$/i;
// Aggregators, syndication wires and directory surfaces: they carry other
// publishers' journalism, so a link from one is not a link from a local paper.
const AGGREGATOR_HOST = /(^|\.)(news\.google\.[a-z.]+|news\.yahoo\.[a-z.]+|flipboard\.com|feedly\.com|smartnews\.com|msn\.com|apnews\.com|reuters\.com|afp\.com|dpa\.com|pa\.media|ansa\.it|efe\.com|tass\.ru|interfax\.[a-z.]+|prnewswire\.com|businesswire\.com|globenewswire\.com|einpresswire\.com|openpr\.[a-z.]+|presseportal\.de|newswire\.ca|pressat\.co\.uk|24heures\.ch\/newsnet|allsides\.com|mediabiasfactcheck\.com|newspapers\.com|paperboy\.com|onlinenewspapers\.com|w3newspapers\.com|thepaperboy\.com|abyznewslinks\.com|pressreader\.com|newspaperindex\.com|mondotimes\.com|kiosko\.net|zeitung\.de|paperkiosk\.[a-z.]+|iheart\.com|iheartradio\.[a-z.]+|onlineradiobox\.com|tunein\.com|radio\.net|streema\.com|radio-browser\.info|mytuner-radio\.com)$/i;
// The `.gov` family, plus the government hosts that carry no such suffix:
// German federal and state portals are plain `.de`, and `regierung-mv.de` — the
// Mecklenburg-Vorpommern state government — arrived in a selected wave with a
// Domain Rating of 81 and a Wikidata jurisdiction naming its own state.
const GOVERNMENT_HOST = /\.(gov|mil)(\.[a-z]{2})?$|\.(gouv\.fr|gob\.[a-z]{2}|go\.[a-z]{2}|govt\.nz|gc\.ca|admin\.ch|bund\.de|europa\.eu)$|(^|\.)(regierung|landesregierung|bundesregierung|staatskanzlei|senatsverwaltung|ministerium|regjeringen|regeringen|valtioneuvosto|kormany|vlada|rzad)[-.]/i;

// Organisations that publish something, but not regional journalism. Every one
// of these was found by the false-authority audit sitting in a selected wave
// with a Domain Rating in the eighties or nineties, admitted because Wikidata
// types it as a broadcaster and it has an address.
const NON_NEWS_ORGANISATION_HOSTS = new Set([
  // Sports leagues and federations.
  'nfl.com', 'nba.com', 'mlb.com', 'nhl.com', 'dfb.de', 'fifa.com', 'uefa.com',
  'lequipe.fr',
  // Weather and utility services.
  'wetter.com', 'weather.com', 'accuweather.com', 'wetter.de', 'meteo.fr',
  // Religious broadcasters: the audience is a faith, not a place.
  'cbn.com', 'ewtn.com', 'trinitybroadcasting.com', 'godtv.com', 'k-love.com',
  // Entertainment networks and children's channels.
  'nick.com', 'nickelodeon.com', 'mtv.com', 'disney.com', 'cartoonnetwork.com',
  // University roots that no host pattern catches: no `.edu`, no `.ac.`, no
  // "universi" in the name.
  'uchile.cl', 'ufrgs.br', 'usp.br', 'unam.mx', 'puc.cl', 'itesm.mx',
]);
const isNonNewsOrganisationHost = (host) => Boolean(host)
  && [...NON_NEWS_ORGANISATION_HOSTS].some((known) => host === known || host.endsWith(`.${known}`));

const NATIONAL_BROADCASTER_HOSTS = new Set([
  'bbc.co.uk', 'bbc.com', 'itv.com', 'channel4.com', 'channel5.com', 'sky.com',
  'france24.com', 'francetvinfo.fr', 'ard.de', 'zdf.de', 'rai.it', 'rtve.es',
  'rtp.pt', 'rtbf.be', 'vrt.be', 'nos.nl', 'nhk.or.jp', 'nhk.jp', 'cctv.com',
  'kbs.co.kr', 'mbc.co.kr', 'sbs.co.kr', 'sbs.com.au', 'abc.net.au', 'cbc.ca',
  'radio-canada.ca', 'sabc.co.za', 'npr.org', 'pbs.org', 'yle.fi', 'svt.se',
  'sr.se', 'nrk.no', 'dr.dk', 'ceskatelevize.cz', 'polskieradio.pl', 'tvp.pl',
  'rtvslo.si', 'hrt.hr', 'rts.rs', 'trt.net.tr', 'ertnews.gr', 'rte.ie',
  'orf.at', 'srf.ch', 'rtl.lu', 'lrt.lt', 'lsm.lv', 'err.ee', 'mtva.hu',
  'tvr.ro', 'bnt.bg', 'rtvs.sk', 'rtsh.al', 'mrt.com.mk', 'rtcg.me',
  'suspilne.media', 'ntv.ru', '1tv.ru', 'aljazeera.com', 'aljazeera.net',
  'cnn.com', 'foxnews.com', 'nbcnews.com', 'cbsnews.com', 'abcnews.go.com',
  // Added by the wave-4 false-authority audit: every one reached a selected
  // wave on "licensed broadcast station with an address", carrying a Domain
  // Rating between 83 and 90 that belongs to a national network.
  'radiofrance.fr', 'bfmtv.com', 'franceinfo.fr', 'tf1.fr', 'rts.ch', 'rtl.de',
  'n-tv.de', '3sat.de', 'tbs.co.jp', 'tv-tokyo.co.jp', 'fujitv.co.jp',
  'j-wave.co.jp', 'ntv.co.jp', 'cnnbrasil.com.br', 'cnbctv18.com',
  'thairath.co.th', 'lenta.ru', 'ctvnews.ca', 'globalnews.ca', 'faz.net',
  // National networks whose Wikidata jurisdiction is one of their LOCAL
  // stations: Cadena SER's scope reads "Baix Camp", Univision's reads
  // "Austin", and each carries the whole network's Domain Rating.
  'sverigesradio.se', 'cadenaser.com', 'cope.es', 'ondacero.es', 'rac1.cat',
  'univision.com', 'telemundo.com', 'kommersant.ru', 'vedomosti.ru', 'rbc.ru',
]);

const isArchiveHost = (host) => ARCHIVE_HOST.test(host);
const isSharedPublishingHost = (host) => SHARED_PUBLISHING_HOST.test(host);
const isSocialHost = (host) => SOCIAL_HOST.test(host);
const isInstitutionalHost = (host) => INSTITUTIONAL_HOST.test(host);
const isAggregatorHost = (host) => AGGREGATOR_HOST.test(host);
const isGovernmentHost = (host) => GOVERNMENT_HOST.test(host);
// Suffix match, not equality. `noe.orf.at` is ORF Lower Austria — a genuine
// regional studio — but it is a subdomain of the Austrian national
// broadcaster, so the Domain Rating measured on it is orf.at's 89. Matching
// only the exact host let every national broadcaster back in through its own
// regional subdomains, each one wearing the parent's authority.
const isNationalBroadcasterHost = (host) => Boolean(host) && [...NATIONAL_BROADCASTER_HOSTS]
  .some((known) => host === known || host.endsWith(`.${known}`));

// Pan-regional and international outlets that are neither national nor local.
// Africanews is headquartered in Pointe-Noire and covers a continent; the
// headquarters made it look like a Congolese city station.
const SUPRANATIONAL_HOSTS = new Set([
  'africanews.com', 'euronews.com', 'euractiv.com', 'politico.eu', 'dw.com',
  'rfi.fr', 'voanews.com', 'bbc.co.uk', 'trtworld.com', 'cgtn.com',
  'arabnews.com', 'scmp.com', 'channelnewsasia.com', 'straitstimes.com',
]);
const isSupranationalHost = (host) => Boolean(host) && [...SUPRANATIONAL_HOSTS]
  .some((known) => host === known || host.endsWith(`.${known}`));

// A street, a building or a corporate campus is where a newsroom SITS, which is
// the head-office problem in its most literal form. "Maison de la Radio",
// "One Astor Plaza", "Roppongi Hills Mori Tower", "Osaka Business Park",
// "avenue du President-Kennedy" and "Varshavskoye Highway" all arrived as
// coverage areas on national broadcasters.
const ADDRESS_NOT_A_MARKET = /\b(tower|plaza|building|centre|center|campus|business park|complex|studios?|house|haus|maison|palais|avenue|boulevard|highway|street|road|strasse|straße|allee|platz|piazza|rua|calle|avenida|chome|dori|[0-9]{1,4}\s)\b/i;

// A scope statement that names the planet, a continent or a trading bloc is
// not a subnational jurisdiction, however structured it looks.
const NON_SUBNATIONAL_SCOPE = /^(worldwide|world|global|international|internet|earth|europe|european union|africa|asia|america|americas|north america|south america|latin america|central america|caribbean|oceania|middle east|arab world|commonwealth of nations|nordic countries|balkans|sub-saharan africa)$/i;

// Pragmatic public-suffix handling. A complete PSL is a fifteen-thousand-line
// dependency; all this needs to do is tell a registrable domain from a
// subdomain of one, because a subdomain's Domain Rating is its parent's.
const SECOND_LEVEL_SUFFIX = /\.(co|com|net|org|gov|edu|ac|or|ne|go|in|nom|asn|sch|mil|info|biz|gen|ltd|plc|firm|web|adv|press)\.[a-z]{2,3}$/i;

function isSubdomain(host) {
  if (!host) return false;
  const labels = host.split('.').length;
  return SECOND_LEVEL_SUFFIX.test(host) ? labels > 3 : labels > 2;
}

// One statement of "this URL is a publisher's own front door", used by both
// discovery and the pre-publication audit so the two can never disagree.
function hostRejection(host, website) {
  if (!host) return 'unparseable host';
  if (isArchiveHost(host)) return 'newspaper archive or digitisation service';
  if (isSharedPublishingHost(host)) return 'shared publishing platform';
  if (isSocialHost(host)) return 'social or video platform';
  if (isInstitutionalHost(host)) return 'academic repository or university root';
  if (isAggregatorHost(host)) return 'aggregator, wire or directory';
  if (isGovernmentHost(host)) return 'government or military domain';
  if (isNationalBroadcasterHost(host)) return 'national broadcaster or national title';
  if (isSupranationalHost(host)) return 'pan-regional or international outlet';
  if (isNonNewsOrganisationHost(host)) return 'not a news organisation';
  // A subdomain carries its parent's Domain Rating, not its own: measuring
  // `bhfm.globo.com` returns globo.com's 91. Publishing that as the local
  // station's authority is the clearest false-authority failure there is.
  if (isSubdomain(host)) return "subdomain, whose Domain Rating is its parent's";
  if (website) {
    let pathname;
    try { pathname = new URL(website).pathname; } catch { return 'unparseable URL'; }
    if (ARCHIVE_PATH.test(pathname)) return 'archive section rather than a publisher root';
    // A publisher root is the front door. A section, a search or an article is
    // a page inside somebody's site and cannot stand in for the outlet.
    if (/\/(search|suche|recherche|busca|tag|tags|category|categoria|kategorie|author|autor|feed|rss|amp)(\/|$)/i.test(pathname)) {
      return 'section or search page rather than a publisher root';
    }
    if (/\.(html?|php|aspx?|jsp)$/i.test(pathname)) return 'article page rather than a publisher root';
  }
  return null;
}

const isPublisherOwnedTarget = (row) => !hostRejection(row && row.host, row && row.website);

// ── COVERAGE TYPE ───────────────────────────────────────────────────────────
//
// Inferred only from what the evidence actually says. When the evidence
// establishes that coverage is subnational but not at what level, the claim
// made is the most modest one the schema offers, never the most impressive.
function coverageTypeFor({ description = '', classId, licensedBroadcast = false }) {
  const text = String(description);
  if (/\b(county|district|borough|okres|powiat|jude[țt]|megyei|kreis|landkreis)\b/i.test(text)) return 'county-district';
  if (/\b(state|province|prefecture|territor|provincia|province|wojew[oó]dzt|obl[aă]st|fylke|l[äa]n|maakunta)\b/i.test(text)) return 'state-province';
  if (/\b(metropolitan|metro area|city|municipal|stadt|ciudad|citt[àa]|ville)\b/i.test(text)) return 'metro-city';
  if (/\b(multi-region|several regions|two regions)\b/i.test(text)) return 'multi-region';
  if (/\bregional|region\b/i.test(text)) return 'region';
  if (classId === 'Q2138556' || classId === 'Q3129162' || classId === 'Q3414785'
    || classId === 'Q20919310' || classId === 'Q27156322') return 'region';
  if (classId === 'Q2328176') return 'county-district';
  if (licensedBroadcast) return 'metro-city';
  return 'local-area';
}

// ── THE GATE ────────────────────────────────────────────────────────────────

// `licensedBroadcast` is true only for an item whose class is a broadcast
// STATION class and that carries a locality. Networks, channels and platforms
// are already excluded above, so a station reaching here holds a licence to
// serve the named place.
function classifyRegionalEvidence({
  classId,
  classLabel = '',
  description = '',
  hasSubnationalScope = false,
  scopeName = '',
  hasPlace = false,
  placeName = '',
  rootKind = 'newspaper',
}) {
  if (EXCLUDED_CLASSES.has(classId)) return { eligible: false, reason: 'excluded class' };
  if (classLabel && EXCLUDED_CLASS_LABEL.test(classLabel)) {
    return { eligible: false, reason: `class label reads as out of scope: ${classLabel}` };
  }

  const text = String(description || '');
  const national = NATIONAL_DESCRIPTION.test(text);

  // The class statement outranks a terse description: an item explicitly typed
  // "local newspaper" is local even if somebody wrote "national" in a sentence
  // about its parent group.
  if (REGIONAL_CLASSES.has(classId)) return { eligible: true, evidence: 'regional-class' };

  if (national) return { eligible: false, reason: 'description asserts national scope' };

  if (hasSubnationalScope && !NON_SUBNATIONAL_SCOPE.test(String(scopeName || '').trim())) {
    return { eligible: true, evidence: 'structured-jurisdiction' };
  }

  const broadcast = rootKind === 'television station' || rootKind === 'radio station';
  if (broadcast && hasPlace) return { eligible: true, evidence: 'licensed-local-broadcast' };

  if (STRONG_REGIONAL_DESCRIPTION.test(text)) return { eligible: true, evidence: 'regional-description' };

  if (hasPlace && placeName && WEAK_PLACE_DESCRIPTION.test(text)
    && text.toLocaleLowerCase().includes(String(placeName).toLocaleLowerCase())) {
    return { eligible: true, evidence: 'description-location-match' };
  }

  // Everything that is left has a head office and nothing else. That is the
  // Le Monde case, and it is refused.
  return { eligible: false, reason: 'no subnational signal beyond a head office' };
}

// Ranked strength, used both to order the measurement queue and to break ties
// during selection so the strongest evidence is published first.
// `weekly-publication-place`, the weakest tier the earlier waves used, is
// absent on purpose. It meant "this is a weekly and we know where it is
// printed", which is the head-office claim under another name. Wave 4 does not
// publish on it, and a candidate carrying it is refused rather than ranked
// last: an evidence value with no entry here is not viable.
const EVIDENCE_CONFIDENCE = {
  'regional-class': 6,
  'curated-regional-dataset': 6,
  'editorial-seed': 5,
  'structured-jurisdiction': 4,
  'licensed-local-broadcast': 3,
  'regional-description': 3,
  'description-location-match': 2,
};

module.exports = {
  WIKIDATA_ROOTS,
  REGIONAL_CLASSES,
  EXCLUDED_CLASSES,
  EXCLUDED_CLASS_LABEL,
  STRONG_REGIONAL_DESCRIPTION,
  WEAK_PLACE_DESCRIPTION,
  NATIONAL_DESCRIPTION,
  NATIONAL_BROADCASTER_HOSTS,
  EVIDENCE_CONFIDENCE,
  ARCHIVE_HOST,
  ARCHIVE_PATH,
  SHARED_PUBLISHING_HOST,
  SOCIAL_HOST,
  INSTITUTIONAL_HOST,
  AGGREGATOR_HOST,
  GOVERNMENT_HOST,
  isArchiveHost,
  isSharedPublishingHost,
  isSocialHost,
  isInstitutionalHost,
  isAggregatorHost,
  isGovernmentHost,
  isNationalBroadcasterHost,
  hostRejection,
  isPublisherOwnedTarget,
  isSubdomain,
  isSupranationalHost,
  NON_SUBNATIONAL_SCOPE,
  ADDRESS_NOT_A_MARKET,
  SUPRANATIONAL_HOSTS,
  NON_NEWS_ORGANISATION_HOSTS,
  isNonNewsOrganisationHost,
  coverageTypeFor,
  classifyRegionalEvidence,
};
