#!/usr/bin/env node
// scripts/research-free-and-trusted.cjs
'use strict';

// What a business with no marketing budget can actually use.
//
// ── WHY THE PRICE IS READ ON THE ACTION PAGE ────────────────────────────────
//
// A homepage says what a platform is. The page you are sent to in order to
// list, submit or sell is where it says what that costs — and 373 of those
// pages are already recorded and verified reachable. So the price question is
// asked where the answer lives, and falls back to the homepage only when a
// record has no route.
//
// ── FREE IS NOT ONE FACT ────────────────────────────────────────────────────
//
// "Freemium" collapses situations that are nothing alike to someone with no
// money. Free to list with a fee when something sells means a business can
// start today and pays out of revenue it has already earned. A mandatory
// monthly plan means it cannot start at all. Both were freemium.
//
// ── FREE IS NOT ENOUGH ──────────────────────────────────────────────────────
//
// A free listing on a link farm is worth less than nothing: it costs the
// business time and can cost it reputation. So free wording alone never
// accepts a record — the trust gate runs first, and a page whose only evidence
// of legitimacy is its own domain wording fails it.
//
//   node scripts/research-free-and-trusted.cjs          # probe
//   node scripts/research-free-and-trusted.cjs --apply  # merge findings
//
// Nothing in the build, the validator or the test suite invokes this file.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { openPage, launch } = require('./tests/helpers/cdp.cjs');
const SAFE = require('./lib/rc-safe-apply.cjs');
const CK = require('./lib/rc-checkpoint.cjs');
const T = require('./lib/rc-text-match.cjs');
const REFUSAL = require('./lib/rc-refusal.cjs');

const ROOT = path.resolve(__dirname, '..');
const FINDINGS = path.join(ROOT, 'data/business-directories/.free-trusted.json');

const COLLECTIONS = {
  directories: {
    data: path.join(ROOT, 'data/business-directories/opportunities.json'),
    costField: 'submissionModel',
    route: (r) => r.submissionUrl || r.claimUrl || null,
  },
  marketplaces: {
    data: path.join(ROOT, 'data/marketplaces/marketplaces.json'),
    costField: 'sellerCost',
    route: (r) => r.sellerActionUrl || null,
  },
  media: {
    data: path.join(ROOT, 'data/media-pr-publishing/media-platforms.json'),
    costField: 'costModel',
    route: (r) => r.submissionUrl || r.pressReleaseUrl || r.pitchUrl || null,
  },
};

const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
].find((p) => fs.existsSync(p));

const SETTLE_MS = 3500;
const CONCURRENCY = 4;
const PACE_MS = 600;
const EVIDENCE_CHARS = 4000;
const MIN_TEXT = 200;

// ── VOCABULARY, Unicode-safe throughout ─────────────────────────────────────

const CHALLENGE = REFUSAL.isRefusal;

const PARKED = REFUSAL.isParked;

// The operator saying, in its own words, that the useful action costs nothing.
//
// ── WHY THIS IS TWO LISTS AND NOT ONE ───────────────────────────────────────
//
// The single list this replaces held action-naming English phrases next to
// bare words for "free" in a dozen languages, and treated a hit on either as
// the same fact. On an action page that was defensible: a page reached by
// clicking "list your business" is talking about listing. On a homepage it is
// not, and 1093 of the remaining unknown records have no action page at all.
//
// Four consecutive samples from that cohort, every one accepted as free:
//
//   Rappi Peru     "envíos gratis"          free DELIVERY, to shoppers
//   HKTDC          "Free entry for the public"   free ADMISSION, to an expo
//   Ralali         "Makan Bergizi Gratis"   the name of a school-meals programme
//   Vrisko         "Δωρεάν Εγγραφή"         free REGISTRATION, which §5 excludes
//
// None of them says anything about what listing a business costs. So a bare
// word for "free" now has to be found near something that makes it about the
// action, and only phrases that already name the action stand on their own.
// Whole phrases, so they match on word boundaries rather than as substrings.
// A stem match reads "get free advice" as "free ad" and "our free planner" as
// "free plan", and both were accepted as free listings — the mirror image of
// the stem defect that made "advertis" miss "advertising". Stems are right for
// a word that grows an ending; they are wrong for a phrase that ends.
const FREE_ANCHORED = T.phraseMatcher([
  'free listing', 'list your business for free', 'list for free', 'free to list',
  'add your business for free', 'free business listing', 'post a free ad',
  'free ad', 'free ads', 'free classified', 'free claim',
  // Bare 'free page' was here and had to go: it is also a lead magnet — "run a
  // free page speed test" — and it sat on the ANCHORED list, trusted to name
  // the listing's own cost with no proximity requirement at all. Removing it
  // outright cost a correct fact, because LinkedIn Pages says "Create a free
  // page" and "You can create a Page for free", so the verb is what came back
  // rather than the noun.
  'create a free page', 'create a page for free', 'create your free page',
  'free plan', 'free forever', 'free submission', 'submit for free', 'free basic',
  'post your task for free', 'sell for free', 'sell your car for free',
  'publicar gratis', 'publica gratis', 'publica ofertas gratis', 'publique gratis',
  'anuncia gratis', 'anuncie grátis', 'anuncie gratis', 'anunciar gratis',
  'vender gratis', 'vende gratis', 'cadastro gratuito de empresa',
  'cadastre sua empresa gratuitamente', 'desapegar grátis',
  'kostenlos eintragen', 'kostenloser eintrag', 'kostenlose eintragung',
  'gratis inserieren', 'kostenlos inserieren', 'kostenloses firmenverzeichnis',
  'kostenloser firmeneintrag', 'kostenlos pressemitteilungen',
  'annonce gratuite', 'déposer une annonce gratuite', 'inserzione gratuita',
  'annuncio gratuito', 'darmowe ogłoszenie', 'dodaj ogłoszenie za darmo',
  'ogłoszenie za darmo', 'ücretsiz ilan', 'бесплатное объявление',
  'разместить бесплатно', 'подать объявление бесплатно', 'безкоштовне оголошення',
  'δωρεάν καταχώρηση', 'oglas besplatno', 'besplatno oglas', 'besplatan oglas',
  'inzerát zdarma', 'zdarma inzerát', 'zapsat firmu zdarma',
  'gratis annonse', 'gratis annons', 'anunț gratuit',
  // A denial of the listing's own fee is a statement that listing is free, and
  // it has to be read as one. Suppressing it on the paid side only — which is
  // where it started — left "No listing fee, 5% commission when it sells"
  // saying nothing at all, when it is the clearest sentence in the corpus.
  'no listing fee', 'no listing fees', 'no submission fee', 'no cost to list',
  'no fee to list', 'no fees to list', 'sin coste de publicación',
  'ohne einstellgebühren', 'keine einstellgebühr',
  // Boundaries cost the plural and the compound, so both are said outright.
  // English pluralises ("free classifieds"), German and Hungarian glue the
  // noun on ("Firmeneintrag", "hirdetésfeladás"), and a phrase list that only
  // holds the singular silently stops matching the language it was written for.
  'free classifieds', 'free classified ads', 'free listings', 'free ads',
  'ingyenes hirdetés', 'ingyenes hirdetésfeladás', 'ingyenes apróhirdetés',
  'kostenlosen eintrag', 'gratis eintrag', 'kostenlose firmeneinträge',
  'besplatni oglasi', 'inzeráty zdarma', 'darmowe ogłoszenia',
  'бесплатные объявления', 'ücretsiz ilanlar', 'anuncio gratis', 'anuncios gratis',
  'anúncio grátis', 'anúncios grátis', 'annonces gratuites', 'annonce gratuite',
  'annunci gratuiti', 'firmeneintrag kostenlos', 'eintrag kostenlos',
  'unternehmen kostenlos eintragen',
]);

// Bare words for "free", in every language the corpus reaches. Alone they mean
// nothing; beside an action term they mean the action is free.
const FREE_BARE = [
  'free', 'no cost', 'at no charge', 'free of charge',
  'kostenlos', 'gratis', 'gratuit', 'gratuito', 'grátis', 'бесплатн', 'безкоштов',
  'ücretsiz', 'darmow', 'za darmo', 'bezplatn', 'ingyenes', 'zdarma', 'besplatno',
  'δωρεάν', 'gratuita', 'gratuite',
];

// What makes a "free" nearby a statement about listing rather than about
// delivery, admission, meals, parking, a valuation or a lead-magnet report.
//
// ── ACTIONS, NOT NOUNS ──────────────────────────────────────────────────────
//
// A first version accepted bare company nouns — "empresa", "firma", "company"
// — as context. They are not context: every business page contains them, so
// "QUIERO 5 INFORMES GRATIS · Directorios de empresas" read as a free listing
// when it offers five free market reports, and a Danish car portal's "gratis
// og uforpligtende garantipris" — a free no-obligation valuation — read the
// same way because "salgsannonce" appeared earlier in the navigation.
//
// What survives is the action itself and the thing the action produces: a
// listing, an advertisement, an entry. Where a company noun appears it is part
// of a phrase that does something to it ("zapsat firmu", "add your business").
//
// Registration is deliberately ABSENT: a free account is the door, not the
// room, and admitting it as context would reinstate the conflation §5 forbids.
const LISTING_CONTEXT = [
  'listing', 'list your', 'add your business', 'add a business', 'add your company',
  'submit your', 'publish your', 'post an ad', 'post your ad', 'place an ad',
  'post your task', 'post any task', 'advertis', 'classified', 'sell on',
  'start selling', 'become a seller', 'seller', 'vendor', 'supplier',
  'business profile', 'company profile', 'create a free page',
  'anunci', 'anúnci', 'publicar', 'publica', 'publique', 'vender', 'vende tu',
  'alta de tu empresa', 'eintrag', 'eintragen', 'inserat', 'inserieren',
  'firmenverzeichnis', 'branchenbuch', 'unternehmen eintragen',
  'annonce', 'annonces', 'déposer une annonce', 'inserzione', 'annuncio',
  'ogłoszen', 'dodaj firm', 'ilan', 'firmani ekle', 'объявлен', 'разместить',
  'оголошенн', 'καταχώρηση', 'αγγελία', 'cadastr', 'anunciar', 'desapegar',
  'bedrijf toevoegen', 'advertentie', 'zapsat firmu', 'přidat firmu',
  'pridat firmu', 'inzerát', 'inzerce', 'hirdetés', 'anunț', 'adauga firma',
  'adaugă firma', 'oglas', 'обява', 'annonse', 'annons', 'ilmoitus',
  'đăng tin', 'إعلان',
];

// Sixty characters, not two hundred. The genuine cases put the free word
// inside the same phrase as the action — "publica ofertas gratis", "Postavite
// oglas BESPLATNO", "kostenloses Firmenverzeichnis", "post your task for free"
// — while the false ones are two separate offers that happen to sit near each
// other in a navigation bar. A window wide enough to span a menu is a window
// wide enough to invent a claim.
const NEAR_WINDOW = 60;

const FREE_NEAR_ACTION = T.proximityMatcher(FREE_BARE, LISTING_CONTEXT, NEAR_WINDOW);
const FREE_WORDING = (text) => FREE_ANCHORED(text) || FREE_NEAR_ACTION(text);

// ── WORDING THAT LOOKS FREE AND IS NOT ──────────────────────────────────────
//
// Each of these is a real sentence a platform writes, and each one would make
// a naive free-matcher say yes to something a business cannot actually use for
// nothing.
//
// A TRIAL ends. "14-day free trial" is a price with a delay, and after it the
// only route is paid — so a trial can never establish free or freemium.
//
// A FREE ACCOUNT is not a free service. Signing up costs nothing almost
// everywhere; what the account then lets you do is the question. This is the
// same rule the marketplace seller phase established for actions, restated for
// price.
//
// A WAIVED FEE is one fee. "No listing fee" beside a mandatory subscription is
// not free, and "from $0" is a price range whose bottom may be unusable.
const TRIAL_PHRASES = [
  'free trial', 'trial period', 'try it free', 'try free for', 'day trial',
  'days free', 'first month free', 'testphase', 'kostenlos testen',
  'prueba gratuita', 'essai gratuit', 'prova gratuita', 'okres próbny',
  'пробный период', 'ücretsiz deneme',
].map(T.normalize);
const TRIAL_WORDING = T.stemMatcher(TRIAL_PHRASES);

// Registration/account language, which says nothing about the useful action.
//
// Multilingual for the same reason the free list is: a stripper that only
// removes the English phrases leaves "Δωρεάν Εγγραφή" and "darmowa rejestracja"
// standing, and the free word inside them is then read as a free service.
const REGISTRATION_PHRASES = [
  'free account', 'free to join', 'free sign up', 'free signup',
  'free registration', 'create a free account', 'registration is free',
  'sign up free', 'join for free', 'register for free', 'free membership',
  'kostenlos registrieren', 'kostenlose registrierung', 'kostenlos anmelden',
  'registro gratis', 'registro gratuito', 'regístrate gratis', 'registrate gratis',
  'inscription gratuite', 'inscrivez-vous gratuitement', 'compte gratuit',
  'registrazione gratuita', 'iscriviti gratis', 'cadastro gratuito',
  'cadastre-se gratis', 'cadastre-se grátis', 'inscreva-se gratis',
  'darmowa rejestracja', 'zarejestruj się za darmo', 'ücretsiz kayıt',
  'ücretsiz üyelik', 'бесплатная регистрация', 'зарегистрироваться бесплатно',
  'безкоштовна реєстрація', 'δωρεάν εγγραφή', 'εγγραφείτε δωρεάν',
  'gratis registreren', 'gratis aanmelden', 'ingyenes regisztráció',
  'registrace zdarma', 'besplatna registracija',
].map(T.normalize);
const REGISTRATION_ONLY = T.stemMatcher(REGISTRATION_PHRASES);

// Things that are free and are not the action: shipping, admission, parking,
// quotes, and named programmes that happen to contain the word.
//
// Proximity alone cannot separate these, because the words around them are
// often the right words. Ralali's homepage reads "Jadi supplier resmi dari
// program Makan Bergizi Gratis" — become an official supplier to the Free
// Nutritious Meals programme — and "supplier" beside "Gratis" is exactly the
// shape of a genuine free-to-sell offer. The phrase has to be removed by name,
// the same way a trial and a free account are.
const CONSUMER_FREE_PHRASES = [
  'free shipping', 'free delivery', 'free returns', 'free postage',
  'envio gratis', 'envios gratis', 'envío gratis', 'envíos gratis',
  'entrega gratis', 'frete gratis', 'frete grátis', 'livraison gratuite',
  'versandkostenfrei', 'kostenloser versand', 'spedizione gratuita',
  'darmowa dostawa', 'бесплатная доставка', 'ücretsiz kargo', 'gratis ongkir',
  'free entry', 'free admission', 'entrada gratis', 'entrée gratuite',
  'eintritt frei', 'free parking', 'free wifi', 'free wi-fi',
  'free consultation', 'free quote', 'free estimate', 'free demo',
  'free sample', 'free download', 'free app', 'free tool', 'free guide',
  'free newsletter', 'free shipping on', 'consulta gratis', 'presupuesto gratis',
  'devis gratuit', 'makan bergizi gratis', 'free nutritious meals',
  // A valuation is the other thing a marketplace gives away, and it sits right
  // beside the sell-your-car call to action: "Opret salgsannonce … Få en gratis
  // og uforpligtende garantipris" is a free price estimate, not a free listing.
  'free valuation', 'free appraisal', 'free report', 'free reports',
  'gratis og uforpligtende', 'uforpligtende', 'gratis vurdering',
  'gratis værdiansættelse', 'kostenlose bewertung', 'valutazione gratuita',
  'informes gratis', 'informe gratis', 'valoración gratis', 'avaliação gratuita',
  'estimation gratuite', 'darmowa wycena', 'бесплатная оценка',
].map(T.normalize);


// Payment required before anything happens.
//
// ── A PRICE ON THE PAGE IS NOT THE PRICE OF LISTING ─────────────────────────
//
// This was one list of price shapes, and on a homepage it read the price of
// whatever the site sells. Thirteen of eighteen sampled paid verdicts were
// somebody else's money:
//
//   Drive.com.au    "could start from $40,000"    a Hyundai, in a news headline
//   Hotcourses      "USD 16133 per year"          university tuition
//   ikman.lk        "Rs 1,673,000 /month"         an apartment, in a listing
//   Wellness.com    "3 million visitors per month"  a traffic statistic
//   Kalaydo         "450 Euro/Monat"              a job advertisement
//   Stripe          "Affirm buy now, pay later"   a product name
//   Thunderbird     "mozillalabs.com/messaging"   the substring "/mo"
//
// §7 says it plainly: pricing existing elsewhere on the site does not make the
// action paid. So the same split the free side needed applies here — wording
// that names the cost OF LISTING stands anywhere, and a bare price shape is
// only evidence on the page the action is performed from.
const PAID_ANCHORED = T.phraseMatcher([
  //
  // "Premium listing" and "paid membership" were here and are gone. A premium
  // tier implies a non-premium one, so the phrase is evidence AGAINST paid-only
  // — it marked four platforms paid whose base listing is free, including one
  // whose own sentence reads "choose between free or premium listing plans".
  // "Paid membership" was worse: it caught a form dropdown and a news article
  // about Walmart+.
  'paid listing', 'paid listings', 'listing fee', 'listing fees',
  'submission fee', 'submission fees',
  'paid plan required', 'subscription required',
  'membership required', 'pay to list', 'per listing', 'cost per listing',
  'advertising rates', 'rate card', 'paid submission',
  'kostenpflichtig', 'kostenpflichtiger eintrag',
  'zahlungspflichtig', 'anuncio de pago', 'anuncios de pago',
  'inserción de pago', 'annuncio a pagamento', 'annonce payante',
  'ogłoszenie płatne', 'płatne ogłoszenia', 'платное объявление',
  'ücretli ilan', 'betaalde advertentie', 'placené inzeráty', 'placená inzerce',
]);

// Price shapes. Real evidence on an action page, noise on a homepage.
// "/mo" is gone: it matched "mozillalabs.com/messaging". "buy now" is gone:
// it is a checkout button and half of "buy now, pay later".
const PAID_BARE = T.stemMatcher([
  'subscription required', 'paid plan required', 'membership required',
  'per month', 'per year', '/month', '/monat', '/mois', '/mes', 'monthly fee',
  'annual fee', 'pricing starts', 'starting at', 'from $', 'from €', 'from £',
  'upgrade to', 'purchase a plan',
]);

// A period word is only a price when there is money beside it. "3 million
// visitors per month", "4 billion references per year" and "900 million per
// month active users" are audience statistics, and each one marked a directory
// paid. So an amount in some currency has to sit within a few words of the
// period, which "$29.95/month" satisfies and a traffic figure does not.
// Unicode-aware boundaries, not \b: an ASCII word boundary cannot assert next
// to "kč", "zł" or "₽", so those currencies silently never matched. The
// repository's own guard caught this the moment it was written, which is what
// that guard is for.
const MONEY = new RegExp(
  '(?:[$€£₹¥₩₪₺₽₴]|(?<![\\p{L}])(?:usd|eur|gbp|chf|aud|cad|nzd|zar|kč|zł|lei|birr|rs)(?![\\p{L}]))\\s?\\d'
  + '|\\d+(?:[.,]\\d+)?\\s?(?:usd|eur|gbp|chf|kč|zł|birr)(?![\\p{L}])',
  'giu',
);
const PERIOD = /(?:per month|per year|\/month|\/monat|\/mois|\/mes|monthly|annual|per listing|einmalig)/gi;

function pricedPeriod(text) {
  const hay = T.normalize(text);
  const money = [...hay.matchAll(MONEY)].map((m) => m.index);
  if (!money.length) return false;
  for (const m of hay.matchAll(PERIOD)) {
    if (money.some((i) => Math.abs(i - m.index) <= 40)) return true;
  }
  return false;
}

// Denials, removed before the paid vocabulary is asked anything. "No listing
// fee", "no membership required" and "free to use - no subscription" all
// marked their platforms paid, which is the opposite of what they say.
const NO_PAID_PHRASES = [
  'no listing fee', 'no listing fees', 'no fees', 'no fee', 'no subscription',
  'no subscriptions', 'no separate subscription', 'no membership required',
  'no membership fee', 'no monthly fee', 'no upfront cost', 'no hidden fees',
  'without subscription', 'keine gebühr', 'keine gebühren', 'ohne abo',
  'sin cuota', 'sin comisiones ni cuotas', 'sans abonnement', 'bez opłat',
  'без абонентской платы',
].map(T.normalize);

const PAID_WORDING = (text) => PAID_ANCHORED(text) || PAID_BARE(text);

// A fee that only exists once money has already been made.
// "Commission" alone is a homonym trap. In French it means a COMMITTEE — two
// trade associations were recorded as charging sales commission because their
// pages list "commissions" — and "Commission" is also the European institution,
// which an e-commerce trade body naturally mentions in its news. So the word
// only counts beside something that makes it a fee on a sale.
//
// "only pay when" was here and is gone: Fiverr's homepage says "only pay when
// you're happy", which is a buyer's satisfaction guarantee, not a seller's
// fee. What remains has to name the sale.
const COMMISSION_WORDING = T.stemMatcher([
  'final value fee', 'selling fee', 'transaction fee', 'seller fee',
  'when it sells', 'when you sell', 'of the sale price',
  'sales commission', 'commission on sale', 'commission on each', 'commission per',
  'commission fee', 'commission rate', '% commission', 'commission of',
  'prowizja od', 'comisión por', 'comisión de venta', 'commissione di vendita',
  'provision pro verkauf', 'комиссия с продаж',
]);

// ── THE TRUST GATE ──────────────────────────────────────────────────────────
//
// Evidence-backed indicators only. No invented score.
const INSTITUTIONAL = T.stemMatcher([
  'chamber of commerce', 'chambre de commerce', 'handelskammer', 'cámara de comercio',
  'camera di commercio', 'ministry', 'ministerio', 'ministère', 'ministerium',
  'government', 'gobierno', 'gouvernement', 'regierung', 'municipal', 'city council',
  'official', 'oficial', 'officiel', 'amtlich', 'public sector', 'agency',
]);

// What a link farm looks like when it stops pretending.
// What a link farm looks like when it stops pretending — and NOT a category a
// general directory happens to carry. The bare stem "casino" rejected Hotfrog
// in two countries and a Swiss directory, all of which simply list casinos the
// way they list bakeries. The contamination signal is the SELLING of placement,
// not the presence of a vice category.
// A directory that LISTS link-building agencies is not itself selling links,
// and "Link Building Services" is a perfectly ordinary category chip on a B2B
// services directory. Category furniture is removed before the quality
// vocabulary is asked anything, the same way denials are.
const CATEGORY_CONTEXT = [
  'browse by category', 'categories', 'all categories', 'popular categories',
  'browse categories', 'service categories',
];
const LOW_QUALITY_RAW = T.stemMatcher([
  'buy backlinks', 'backlink package', 'buy dofollow', 'link building service',
  'guest post service', 'guest posting service', 'dofollow links for',
  'seo submission service', 'boost your domain authority',
  // 'increase your da' — Domain Authority — ended in a stem matcher, where the
  // two-letter abbreviation swallowed the next word: "increase your DAILY
  // enquiries" is an ordinary local-directory headline and was rejected as a
  // link seller. Spelled out, it still catches what it was written for.
  'increase your domain authority', 'improve your domain authority',
  'sponsored post price', 'we accept paid guest posts', 'paid guest post',
  'casino guest post', 'gambling guest post', 'casino backlink',
  'payday loan backlink', 'essay writing service',
]);
// The abbreviation needs a real word boundary, which a stem matcher cannot
// give it: 'da' is inside "daily", and a trailing space does not help because
// normalize trims it. patternMatcher asserts a Unicode-safe boundary on both
// sides, so "increase your DA 50+" matches and "increase your daily enquiries"
// does not.
const LOW_QUALITY_ABBREV = T.patternMatcher([
  'increase your da', 'boost your da', 'improve your da', 'raise your da',
]);

const LOW_QUALITY = (text) => {
  const hay = T.normalize(text);
  // Only when the page is presenting a category index — otherwise unchanged.
  const isIndex = CATEGORY_CONTEXT.some((c) => hay.includes(c));
  const cleaned = isIndex ? hay.split('link building service').join(' ') : hay;
  return LOW_QUALITY_RAW(cleaned) || LOW_QUALITY_ABBREV(cleaned);
};

// Denials, removed before the commission vocabulary is asked anything.
const NO_COMMISSION_PHRASES = [
  'no commission', 'zero commission', '0% commission', 'no commissions',
  'commission free', 'commission-free', 'no selling fee', 'no seller fees',
  'no transaction fee', 'never pay', 'no fees', 'without commission',
  // "we never take a commission" was read as a platform that takes one. The
  // list held 'no commission' but not the verb forms, and a matcher that
  // cannot see a negation reports the opposite of the sentence in front of it.
  'never take a commission', 'never take commission', 'we take no commission',
  'don t take a commission', 'do not take a commission', 'take no cut',
  'never charge commission', 'no cut of your sale', 'keep 100%', 'keep 100 %',
  'keine provision', 'ohne provision', 'sin comisión', 'sin comisiones',
  'sans commission', 'senza commissioni', 'brak prowizji', 'bez prowizji',
  'без комиссии', 'komisyon yok',
].map(T.normalize);

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : (process.argv[i + 1] || true);
};

// This used to spawn its own headless Chrome with the automation flag hidden
// and a spoofed user agent. Two things were wrong with that. The disguise is
// circumvention, which this corpus does not build. And it did not even work:
// headless Chrome is refused by a large share of the public web regardless of
// what its user agent claims, which is why this ledger holds 81 records whose
// only finding is that almost nothing rendered.
//
// An ordinary windowed browser needs no disguise, and the shared launcher is
// the one the rest of the repository already uses.
function startChrome() {
  return launch({ headless: false });
}

async function settleOn(page) {
  let previous = null;
  let stable = 0;
  const started = Date.now();
  const deadline = started + SETTLE_MS * 3;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const now = await page.eval(() => ({
      links: document.querySelectorAll('a[href]').length,
      len: (document.body ? document.body.innerText || '' : '').length,
    })).catch(() => null);
    if (!now) return;
    const shape = `${now.links}:${now.len}`;
    stable = shape === previous ? stable + 1 : 0;
    previous = shape;
    // Two consecutive matches, not one: a page that renders its shell first and
    // its content afterwards looks settled to a single comparison.
    if (stable >= 2 && now.len > 0 && Date.now() - started >= 1200) return;
    if (Date.now() > deadline) return;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { setTimeout(r, 350); });
  }
}

async function probe(wsUrl, target) {
  const page = await openPage(wsUrl);
  try {
    await page.goto(target.url);
    // Two identical observations, not a fixed sleep: a single-page application
    // fires load with an empty shell and draws the pricing afterwards.
    await settleOn(page);
    const seen = await page.eval((chars) => {
      const text = document.body ? document.body.innerText : '';
      return {
        title: document.title || '',
        head: text.slice(0, chars),
        textLen: text.length,
        url: location.href,
        h1: [...document.querySelectorAll('h1, h2')].slice(0, 8)
          .map((h) => (h.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90)),
      };
    }, EVIDENCE_CHARS);
    const doc = page.requests.find((r) => r.url === seen.url) || page.requests[0] || null;
    return { ...seen, status: doc ? doc.status : 0, error: null };
  } catch (e) {
    return { error: String(e.message || e).slice(0, 160), status: 0 };
  } finally {
    try { await page.close(); } catch { /* already gone */ }
    try { page.ws.close(); } catch { /* already closed */ }
  }
}

// One judgement, and the only place a cost fact is decided.
function classify(target, obs) {
  if (obs.error || !obs.url) return { state: 'UNRESOLVED', why: obs.error || 'the browser could not open it' };
  const hay = `${obs.title}\n${obs.h1.join('\n')}\n${obs.head}`;
  if (PARKED(hay)) return { state: 'REJECT_LOW_QUALITY', why: 'a parked or for-sale domain' };
  if (CHALLENGE(hay)) return { state: 'DEFER_PROTECTED', why: 'a bot challenge' };
  if (obs.status >= 400) return { state: 'DEFER_PROTECTED', why: `http ${obs.status}` };
  if (obs.textLen < MIN_TEXT) return { state: 'UNRESOLVED', why: `only ${obs.textLen} characters rendered` };

  // TRUST FIRST. Free never rescues a source nobody should be sent to.
  if (LOW_QUALITY(hay)) {
    return { state: 'REJECT_LOW_QUALITY', why: 'the page sells links or carries affiliate contamination' };
  }

  const freeRaw = FREE_WORDING(hay);
  // On the page the action is performed from, a price beside a period is the
  // action's price. On a homepage only wording that names the listing's own
  // cost counts. Either way a denial is removed first.
  const paidText = NO_PAID_PHRASES
    .reduce((text, phrase) => text.split(phrase).join(' '), T.normalize(hay));
  const paid = PAID_ANCHORED(paidText)
    || (target.onRoute && PAID_BARE(paidText) && pricedPeriod(paidText));
  // "No commission rates - never pay for your leads" is a platform saying it
  // charges nothing, and it was read as a platform charging commission. A
  // matcher that cannot see a negation inverts the fact it is looking for.
  const commission = COMMISSION_WORDING(NO_COMMISSION_PHRASES
    .reduce((text, phrase) => text.split(phrase).join(' '), T.normalize(hay)));
  const institutional = INSTITUTIONAL(hay);
  const trial = TRIAL_WORDING(hay);
  const registrationOnly = REGISTRATION_ONLY(hay);

  // A trial is a price with a delay. It never establishes a usable free tier,
  // and where it is the ONLY free-looking wording the record stays unknown.
  // Free-account wording alone is the same: it describes the door, not the room.
  //
  // The test is "is there free wording LEFT once the registration and trial
  // phrases are taken out". A first version stripped only the English ones
  // while the free list is multilingual, so "Kostenlos registrieren" kept its
  // "kostenlos" and was read as a free service — the same asymmetry that makes
  // an ASCII boundary fail on Cyrillic, in a different disguise.
  const stripped = REGISTRATION_PHRASES.concat(TRIAL_PHRASES, CONSUMER_FREE_PHRASES)
    .reduce((text, phrase) => text.split(phrase).join(' '), T.normalize(hay));
  const onlyTrial = trial && !paid;

  // ── WHERE THE EVIDENCE WAS READ DECIDES WHAT COUNTS ───────────────────────
  //
  // On a page reached by clicking "list your business", a nearby "free" is
  // about listing: that is the only thing the page is for. A homepage is for
  // everything, and this cohort proved it — after three rounds of tightening,
  // one homepage in four still produced a free listing out of a brand name
  // (Cashfree Payments), a giveaway (our free planner), injected casino spam
  // (darmowych spinach) and a third-party banner (free treats for 3 months).
  //
  // No amount of vocabulary fixes that, because the page genuinely contains
  // those words. So a homepage has to say the thing itself — "anuncie grátis",
  // "kostenlos eintragen", "post a free ad" — and proximity is not enough.
  // Everything else stays unknown, which is the true answer and one a later
  // pass with a real action page can improve on.
  const free = freeRaw && (target.onRoute
    ? FREE_WORDING(stripped)
    : FREE_ANCHORED(stripped));

  if (trial && !free && !commission) {
    return {
      state: 'DEFER_COST_UNKNOWN',
      why: onlyTrial
        ? 'the only free wording is a time-limited trial, which is a price with a delay'
        : 'a trial is offered and no ongoing free route is stated',
      institutional,
    };
  }
  if (registrationOnly && !free && !paid && !commission) {
    return {
      state: 'DEFER_COST_UNKNOWN',
      why: 'the page offers a free account, which says nothing about what the action costs',
      institutional,
    };
  }

  if (!free && !paid && !commission) {
    return { state: 'DEFER_COST_UNKNOWN', why: 'the page states no price either way', institutional };
  }
  if (free && commission) {
    return {
      state: 'ACCEPT_FREE_TRUSTED',
      cost: 'free-listing-commission',
      why: 'free to list, with a fee only on a completed sale',
      institutional,
    };
  }
  if (free && paid) {
    return {
      state: 'ACCEPT_FREEMIUM',
      cost: 'free-tier',
      why: 'a free tier stated alongside paid plans',
      institutional,
    };
  }
  if (free) {
    return { state: 'ACCEPT_FREE_TRUSTED', cost: 'free', why: 'the operator states the action is free', institutional };
  }
  // COMMISSION ALONE ESTABLISHES NOTHING. This branch used to accept a record
  // as free to list whenever it mentioned a sale fee and no upfront price —
  // which is a conclusion drawn from silence, and §8 is explicit that absence
  // of evidence is not free. All three records it produced were wrong: a
  // buyer's guarantee, a job advert whose salary "include commission", and a
  // platform stating it charges no commission at all.
  if (commission && !paid) {
    return {
      state: 'DEFER_COST_UNKNOWN',
      why: 'a sale fee is mentioned and nothing states what listing itself costs',
      institutional,
    };
  }
  return { state: 'REJECT_PAID_ONLY', cost: 'paid', why: 'payment is required before the action', institutional };
}

// Which countries already have somewhere a business can act for nothing. A
// country with no such source at all is where an unknown is most expensive:
// until one is found the planner has nothing free to offer there, so those
// records are researched before a country that already has ten free options.
function countriesWithoutFreeOption() {
  const covered = new Set();
  const all = new Set();
  for (const C of Object.values(COLLECTIONS)) {
    for (const r of JSON.parse(fs.readFileSync(C.data, 'utf8'))) {
      if (r.currentStatus !== 'active') continue;
      all.add(r.country);
      if (NO_UPFRONT.has(r[C.costField])) covered.add(r.country);
    }
  }
  return new Set([...all].filter((c) => !covered.has(c)));
}

const NO_UPFRONT = new Set(['free', 'freemium', 'free-tier', 'free-listing-commission']);

function targets() {
  const out = [];
  const uncovered = countriesWithoutFreeOption();
  for (const [name, C] of Object.entries(COLLECTIONS)) {
    const rows = JSON.parse(fs.readFileSync(C.data, 'utf8'));
    for (const r of rows) {
      if (r.currentStatus !== 'active') continue;
      const known = r[C.costField];
      if (known && known !== 'unknown') continue;
      const url = C.route(r) || r.website;
      if (!url) continue;
      const onRoute = Boolean(C.route(r));
      // Ordering, most valuable first. File order is nearly alphabetical by
      // country, so a truncated pass that took records as they came would
      // research Albania exhaustively and never reach Germany.
      //
      // The vocabulary is the corpus's own: tier1/tier2/tier3 and P1/P2/P3.
      // Guessing at "tier-1" and "high" instead produced a score that never
      // once fired, which is a ranking that silently does not rank.
      const priority = (onRoute ? 8 : 0)                        // the price is stated where the action is
        + (uncovered.has(r.country) ? 4 : 0)                    // the country has nothing free yet
        + (r.tier === 'tier1' || r.priority === 'P1' ? 2 : 0)   // the planner reaches for these first
        + (r.lastVerified ? 1 : 0);                             // already confirmed to exist
      out.push({
        collection: name, id: r.id, country: r.country, url,
        onRoute, website: r.website, priority,
        key: CK.targetKey(name, r),
      });
    }
  }
  return out;
}

// One place that knows how a stored finding maps onto the identity contract,
// used by every entry point so probe, report, re-judge and apply agree about
// which record a finding belongs to.
function openLedger() {
  const ledger = new CK.Ledger(FINDINGS);
  const byId = new Map();
  for (const [name, C] of Object.entries(COLLECTIONS)) {
    for (const r of JSON.parse(fs.readFileSync(C.data, 'utf8'))) byId.set(`${name}:${r.id}`, [name, r]);
  }
  const moved = CK.backfillKeys(ledger, (f) => {
    const hit = byId.get(`${f.collection}:${f.id}`);
    return hit ? CK.targetKey(hit[0], hit[1]) : null;
  });
  if (moved) console.log(`Gave ${moved} pre-checkpoint finding(s) their canonical identity.`);
  return ledger;
}

async function runProbe() {
  if (!CHROME) { console.error('No Chrome on this machine.'); process.exit(1); }
  const ledger = openLedger();
  if (ledger.recovered) {
    console.log(`Recovered ${ledger.recovered} finding(s) from an interrupted run's journal.`);
  }
  let list = targets();
  const already = list.filter((t) => ledger.has(t.key)).length;
  // A record already carrying a verdict is not visited again. Re-asking costs
  // a page load and can only replace a considered answer with a noisier one;
  // a caller who genuinely wants it re-read says --refresh.
  if (!process.argv.includes('--refresh')) list = list.filter((t) => !ledger.has(t.key));
  list.sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : 1));
  const limit = arg('--limit');
  if (limit) list = list.slice(0, Number(limit));

  console.log(`Free & trusted: ${list.length} record(s) to visit `
    + `(${already} already answered, ${ledger.size()} finding(s) on disk, `
    + `${list.filter((x) => x.onRoute).length} readable on their own action page).`);
  if (!list.length) { report(ledger.all()); return; }

  CK.onInterrupt(ledger, 'Free & trusted');
  const chrome = await startChrome();
  const queue = list.slice();
  let done = 0;
  const worker = async () => {
    for (;;) {
      const target = queue.shift();
      if (!target) return;
      // eslint-disable-next-line no-await-in-loop
      const obs = await probe(chrome.wsUrl, target);
      // Durable here, before the next navigation. This is the whole point of
      // the file: the verdict exists on disk the moment it exists at all.
      ledger.record({
        ...target,
        observed: {
          status: obs.status, finalUrl: obs.url || null, title: obs.title || null,
          h1: obs.h1 || [], head: (obs.head || ''), textLen: obs.textLen || 0,
        },
        ...classify(target, obs),
      });
      done += 1;
      if (done % 25 === 0) console.log(`  ${done}/${list.length}`);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => { setTimeout(r, PACE_MS); });
    }
  };
  try {
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  } finally {
    chrome.proc.kill('SIGKILL');
    const kept = ledger.compact({ probedAt: new Date().toISOString().slice(0, 10) });
    console.log(`${kept} finding(s) on disk.`);
    try { fs.rmSync(chrome.profile, { recursive: true, force: true }); } catch { /* reaped */ }
  }
  report(ledger.all());
  console.log('Nothing merged — rerun with --apply.');
}

function report(findings) {
  const tally = {};
  for (const f of findings) tally[f.state] = (tally[f.state] || 0) + 1;
  console.log('\nLEDGER');
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(5)}  ${k}`);
  }
  const byCost = {};
  for (const f of findings.filter((x) => x.cost)) byCost[f.cost] = (byCost[f.cost] || 0) + 1;
  console.log('  costs:', JSON.stringify(byCost));
}

// Re-run the judgement over evidence already captured. No network.
function runRejudge() {
  const ledger = openLedger();
  const file = { findings: ledger.all() };
  let moved = 0;
  const rejudged = file.findings.map((f) => {
    const o = f.observed || {};
    if (o.head === undefined) return f;
    const v = classify(f, {
      title: o.title || '', h1: o.h1 || [], head: o.head || '',
      textLen: o.textLen || 0, url: o.finalUrl, status: o.status, error: null,
    });
    if (v.state !== f.state) moved += 1;
    // The verdict is REPLACED, not merged over. Spreading the new one on top of
    // the old kept a `cost` the record no longer earned: three trade
    // associations were correctly demoted to DEFER_COST_UNKNOWN and carried
    // "free-listing-commission" out of the previous run regardless. The ledger
    // was reporting a price nothing had established.
    const { state, cost, why, institutional, ...rest } = f;
    return { ...rest, ...v };
  });
  for (const f of rejudged) ledger.byKey.set(f.key, f);
  ledger.compact();
  console.log(`Re-judged from stored evidence: ${moved} verdict(s) changed.`);
  report(rejudged);
}

// Only ACCEPT states write a cost. Everything else stays unknown, which is the
// true answer and the one a later pass can improve on.
const COST_FOR = {
  directories: { free: 'free', 'free-tier': 'freemium', 'free-listing-commission': 'free', paid: 'paid' },
  marketplaces: {
    free: 'free', 'free-tier': 'free-tier', 'free-listing-commission': 'free-listing-commission', paid: 'paid-upfront',
  },
  media: { free: 'free', 'free-tier': 'freemium', 'free-listing-commission': 'free', paid: 'paid' },
};

// The values this pass is capable of having written. A record holding one of
// them got it from here, which is what makes it safe to take back; a value
// this pass never writes was somebody else's finding and is left alone.
const KNOWN_VALUES = {
  directories: new Set(['free', 'freemium', 'paid']),
  marketplaces: new Set(['free', 'free-tier', 'free-listing-commission', 'paid-upfront']),
  media: new Set(['free', 'freemium', 'paid']),
};

function runApply() {
  const ledger = openLedger();
  ledger.compact();
  const { probedAt = 'unknown' } = ledger.meta;
  const findings = ledger.all();
  const tally = {
    free: 0, freemium: 0, commission: 0, paid: 0, cleared: 0, left: 0,
  };

  for (const [name, C] of Object.entries(COLLECTIONS)) {
    const rows = JSON.parse(fs.readFileSync(C.data, 'utf8'));
    const before = JSON.parse(JSON.stringify(rows));
    const byId = new Map(rows.map((r) => [r.id, r]));

    for (const f of findings.filter((x) => x.collection === name)) {
      const r = byId.get(f.id);
      if (!r) { tally.left += 1; continue; }

      const earned = f.cost && /^ACCEPT|^REJECT_PAID_ONLY$/.test(f.state)
        ? COST_FOR[name][f.cost] : null;

      // RECLASSIFICATION REPLACES. A record that once earned a cost and no
      // longer does must lose it, or the corpus keeps a price nothing supports
      // — five records were demoted to unknown when trial and free-account
      // wording stopped counting, and without this they would have gone on
      // saying "free" forever. An applier that only ever writes forward is how
      // stale facts become permanent.
      if (!earned) {
        const wasOurs = KNOWN_VALUES[name].has(r[C.costField]);
        if (wasOurs && f.state && /^DEFER|^UNRESOLVED|^REJECT_LOW_QUALITY$/.test(f.state)) {
          SAFE.applyPatch(r, { [C.costField]: 'unknown' }, { owner: 'cost', collection: name });
          tally.cleared = (tally.cleared || 0) + 1;
        } else {
          tally.left += 1;
        }
        continue;
      }
      const value = earned;
      SAFE.applyPatch(r, { [C.costField]: value }, { owner: 'cost', collection: name });
      if (value === 'free') tally.free += 1;
      else if (value === 'free-listing-commission') tally.commission += 1;
      else if (/free-tier|freemium/.test(value)) tally.freemium += 1;
      else tally.paid += 1;
    }

    SAFE.assertNoDeletion(before, rows);
    const drift = SAFE.diffFingerprints(SAFE.curatedFingerprint(before), SAFE.curatedFingerprint(rows));
    if (drift.length) throw new Error(`${name}: curated fields drifted on ${drift.join(', ')}`);
    fs.writeFileSync(C.data, `${JSON.stringify(rows, null, 1)}\n`);
  }
  console.log(`Applied (${probedAt}):`, Object.entries(tally).map(([k, v]) => `${k}=${v}`).join(' '));
}

module.exports = {
  classify, targets, FREE_WORDING, PAID_WORDING, COMMISSION_WORDING, LOW_QUALITY, COST_FOR,
  FREE_ANCHORED, FREE_NEAR_ACTION, REGISTRATION_PHRASES, TRIAL_PHRASES, CONSUMER_FREE_PHRASES,
  PAID_ANCHORED, NO_COMMISSION_PHRASES,
  FINDINGS, COLLECTIONS, runApply, KNOWN_VALUES,
};

if (require.main === module) {
  if (process.argv.includes('--apply')) runApply();
  else if (process.argv.includes('--rejudge')) runRejudge();
  else if (process.argv.includes('--report')) report(openLedger().all());
  else runProbe().catch((e) => { console.error(e); process.exit(1); });
}
