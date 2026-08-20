'use strict';

// Telling a refusal from a page.
//
// Eight researchers each kept their own copy of this list, and they had already
// drifted. That duplication is why two defects survived in all of them at once:
//
//   /captcha/ matched "This site is protected by reCAPTCHA and the Google
//   Privacy Policy and Terms of Service apply." That sentence is a required
//   Google attribution, printed by every site that puts reCAPTCHA on a contact
//   form or a post-an-ad form. It says a challenge MAY be shown to someone,
//   some day. It is not a challenge, and the page carrying it rendered fine.
//
//   /forbidden/ matched "Forbidden City reopens to overseas tour groups after a
//   two-year restoration" — a headline on a live travel publication, which was
//   recorded as access-denied.
//
// Both errors invent the same thing: a site that answered us becomes a site
// that refused us. That is the most expensive mistake this corpus makes,
// because the record leaves the queue looking researched.
//
// So there is one list now, and the two things it must never do have tests.

const T = require('./rc-text-match.cjs');

// Sentences that mean "a challenge exists somewhere on this site", which is not
// the same as "you have been challenged". Removed before anything is asked.
const ATTRIBUTION = [
  'protected by recaptcha',
  'recaptcha and the google privacy policy',
  'this site is protected by recaptcha',
  'protegido por recaptcha',
  'protégé par recaptcha',
  'durch recaptcha geschützt',
];

const PATTERNS = [
  ['attention required', 'cloudflare-attention'],
  ['just a moment', 'cloudflare-interstitial'],
  ['checking your browser', 'browser-check'],
  ["verify (you are|you're|you re) human", 'human-verification'],
  ['are you a robot', 'human-verification'],
  // "Forbidden" only where it is an HTTP status or an access statement. Bare
  // 'forbidden' is an ordinary English word and a Beijing landmark.
  ['access denied', 'access-denied'],
  ['403 forbidden', 'access-denied'],
  ['access forbidden', 'access-denied'],
  ['error 403', 'access-denied'],
  ['your request was blocked', 'access-denied'],
  ['you have been blocked', 'access-denied'],
  ['enable javascript and cookies', 'js-cookie-gate'],
  ['unusual traffic', 'rate-limit'],
  ['automated queries', 'rate-limit'],
  // 'ddos protection' on its own is a SUBJECT, not a refusal: it marked Help
  // Net Security — a live cybersecurity publication whose homepage was full of
  // real datelined headlines — as a bot challenge. Cloudflare's actual credit
  // line is "DDoS protection by Cloudflare", so the preposition is what
  // distinguishes the footer from the topic. The same reasoning is why
  // 'request blocked' became 'your request was blocked'.
  ['ddos protection by', 'ddos-protection'],
  ['performance (and|&) security by', 'cloudflare-footer'],
  ['captcha', 'captcha'],
];

// Strip the attribution, then normalise once. Both shapes below share this so
// they can never disagree about what a refusal is.
function scrub(text) {
  let hay = T.normalize(text || '');
  for (const phrase of ATTRIBUTION) hay = hay.split(phrase).join(' ');
  return hay;
}

const MATCHERS = PATTERNS.map(([src, label]) => [T.patternMatcher([src]), label]);

// Shape one: a boolean, for callers that only need to know.
function isRefusal(text) {
  const hay = scrub(text);
  return MATCHERS.some(([m]) => m(hay));
}

// Shape two: the reason, for callers that record why.
function refusalReason(text) {
  const hay = scrub(text);
  for (const [m, label] of MATCHERS) if (m(hay)) return label;
  return null;
}

// A domain that is for sale or empty, rather than one that refused us.
// "Coming soon" is deliberately absent as a bare phrase: publications print it
// about their own forthcoming coverage — "Our 2026 Fleet Awards shortlist is
// coming soon" — and a live title with twelve datelined articles was being
// recorded as a placeholder because of it.
const PARKED_PATTERNS = [
  ['domain (is|may be) for sale', 'domain-for-sale'],
  ['buy this domain', 'domain-for-sale'],
  ['parked domain', 'parked'],
  ['this domain is parked', 'parked'],
  ['hugedomains', 'domain-for-sale'],
  ['sedo.com', 'domain-for-sale'],
  ['afternic', 'domain-for-sale'],
  ['under construction', 'placeholder'],
  ['website coming soon', 'placeholder'],
  ['site is coming soon', 'placeholder'],
];
const PARKED_MATCHERS = PARKED_PATTERNS.map(([src, label]) => [T.patternMatcher([src]), label]);

function isParked(text) {
  const hay = T.normalize(text || '');
  return PARKED_MATCHERS.some(([m]) => m(hay));
}

function parkedReason(text) {
  const hay = T.normalize(text || '');
  for (const [m, label] of PARKED_MATCHERS) if (m(hay)) return label;
  return null;
}

module.exports = {
  isRefusal, refusalReason, isParked, parkedReason, ATTRIBUTION, PATTERNS, PARKED_PATTERNS,
};
