/* Analytics consent — this site's own, with no third-party consent service.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 *
 * Analytics used to be gated by CookieYes: the tracker shipped as
 * `type="text/plain" data-cookieyes="cookieyes-analytics"`, and CookieYes was
 * supposed to rewrite that type once a visitor accepted.
 *
 * CookieYes stopped answering. Its script returned 403 with its own message,
 * "We can't find the page you are looking for" — the same response a made-up
 * client id gets, so the site key was simply gone, not blocked. Nothing then
 * rewrote the type attribute, the tracker never executed, and not one event
 * was ever sent. Measured in a real browser against production: zero requests
 * for tracker.iife.min.js, zero events posted.
 *
 * Meanwhile Google Analytics sat directly above it as a plain `<script async>`
 * and ran unconditionally. So the site was gating one analytics tool behind a
 * consent gate that could never open, while the other collected regardless —
 * the worst of both positions.
 *
 * Both are now gated by this file, on the same terms.
 *
 * ── THE CONTRACT ────────────────────────────────────────────────────────────
 *
 * A gated script is emitted as
 *
 *     <script type="text/plain" data-consent="analytics" src="..." ...>
 *
 * The browser will not execute `text/plain`, so nothing loads until this file
 * chooses to activate it. Activation clones the element into a real script,
 * carrying every attribute across, and appends it — the same technique the
 * consent service used, without the service.
 *
 * Decline is not a deferral. Nothing is loaded, nothing is requested, and no
 * identifier is written beyond the single localStorage key recording the
 * choice itself.
 *
 * ── NO DARK PATTERNS ────────────────────────────────────────────────────────
 *
 * Accept and Decline are the same size, the same shape, and adjacent. There is
 * no pre-ticked box, no "legitimate interest" tab, and no close button that
 * means yes. A visitor who ignores the banner has not consented and is not
 * measured. The choice is reversible from the footer link on every page.
 */
(function () {
  'use strict';

  var KEY = 'ph-consent-analytics';
  var GRANTED = 'granted';
  var DENIED = 'denied';

  // Translations live here rather than in the i18n dictionary because this file
  // ships to every page including the ones page-shell assembles, and it must
  // work before anything else has loaded. The locale comes from the document
  // the server already rendered.
  var TEXT = {
    en: {
      body: 'We would like to measure how this site is used, with privacy-respecting analytics. Nothing is loaded unless you agree.',
      accept: 'Accept analytics',
      decline: 'Decline',
      manage: 'Cookie settings',
      label: 'Analytics consent',
    },
    de: {
      body: 'Wir möchten messen, wie diese Website genutzt wird — mit datenschutzfreundlicher Analyse. Ohne Ihre Zustimmung wird nichts geladen.',
      accept: 'Analyse zulassen',
      decline: 'Ablehnen',
      manage: 'Cookie-Einstellungen',
      label: 'Einwilligung zur Analyse',
    },
    es: {
      body: 'Nos gustaría medir cómo se usa este sitio, con analítica respetuosa con la privacidad. No se carga nada sin tu consentimiento.',
      accept: 'Aceptar analítica',
      decline: 'Rechazar',
      manage: 'Configuración de cookies',
      label: 'Consentimiento de analítica',
    },
    fr: {
      body: 'Nous aimerions mesurer l’utilisation de ce site, avec une analyse respectueuse de la vie privée. Rien n’est chargé sans votre accord.',
      accept: 'Accepter l’analyse',
      decline: 'Refuser',
      manage: 'Paramètres des cookies',
      label: 'Consentement analytique',
    },
  };

  function strings() {
    var lang = (document.documentElement.getAttribute('lang') || 'en').slice(0, 2).toLowerCase();
    return TEXT[lang] || TEXT.en;
  }

  // localStorage throws in some privacy modes rather than returning null, and a
  // consent banner that breaks the page it protects is worse than no banner.
  function read() {
    try { return window.localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function write(value) {
    try { window.localStorage.setItem(KEY, value); } catch (e) { /* nothing to fall back to */ }
  }

  // ── ACTIVATION ────────────────────────────────────────────────────────────
  //
  // A `text/plain` placeholder cannot simply have its type changed: the browser
  // decided not to execute it when it was parsed and will not revisit that. The
  // element has to be replaced by a fresh one carrying the same attributes.
  //
  // Inline blocks matter as much as src ones — Google's config call is inline,
  // and loading gtag.js without it measures nothing.
  function activate() {
    var pending = document.querySelectorAll('script[type="text/plain"][data-consent="analytics"]');
    for (var i = 0; i < pending.length; i += 1) {
      var old = pending[i];
      var next = document.createElement('script');
      for (var a = 0; a < old.attributes.length; a += 1) {
        var attr = old.attributes[a];
        if (attr.name === 'type' || attr.name === 'data-consent') continue;
        next.setAttribute(attr.name, attr.value);
      }
      if (!old.getAttribute('src')) next.text = old.textContent;
      // Insert next to the placeholder so document order is preserved: gtag.js
      // must still precede the config block that calls it.
      old.parentNode.insertBefore(next, old);
      old.parentNode.removeChild(old);
    }
  }

  // ── THE BANNER ────────────────────────────────────────────────────────────
  //
  // Built in the DOM rather than written as markup, so nothing here can inject
  // HTML, and styled from one injected rule set so the file stays self-contained
  // and needs no entry in the CSS build.
  var STYLE = '.ph-consent{position:fixed;left:1rem;right:1rem;bottom:1rem;z-index:9999;'
    + 'max-width:44rem;margin:0 auto;padding:1rem 1.15rem;border:1px solid #d8d5cd;'
    + 'border-radius:10px;background:#fffdf9;box-shadow:0 6px 28px rgba(28,25,20,.16);'
    + 'font:400 .92rem/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1c1914}'
    + '.ph-consent p{margin:0 0 .75rem}'
    + '.ph-consent-actions{display:flex;gap:.5rem;flex-wrap:wrap}'
    + '.ph-consent button{font:inherit;padding:.5rem .95rem;border-radius:7px;'
    + 'border:1px solid #1c1914;background:#1c1914;color:#fffdf9;cursor:pointer}'
    + '.ph-consent button.ph-consent-no{background:transparent;color:#1c1914}'
    + '.ph-consent button:focus-visible{outline:2px solid #1c1914;outline-offset:2px}'
    + '.ph-consent-link{background:none;border:0;padding:0;font:inherit;color:inherit;'
    + 'text-decoration:underline;cursor:pointer}'
    + '@media (max-width:32rem){.ph-consent-actions button{flex:1 1 auto}}';

  function injectStyle() {
    if (document.getElementById('ph-consent-style')) return;
    var s = document.createElement('style');
    s.id = 'ph-consent-style';
    s.appendChild(document.createTextNode(STYLE));
    document.head.appendChild(s);
  }

  var banner = null;

  function close() {
    if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
    banner = null;
  }

  function decide(value) {
    write(value);
    close();
    if (value === GRANTED) activate();
  }

  function show() {
    if (banner) return;
    var t = strings();
    injectStyle();

    banner = document.createElement('aside');
    banner.className = 'ph-consent';
    // A dialog role would demand focus and trap it. This is not a dialog: the
    // page underneath is fully usable and ignoring the banner is a valid thing
    // to do, so it announces itself politely and stays out of the way.
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', t.label);

    var p = document.createElement('p');
    p.appendChild(document.createTextNode(t.body));
    banner.appendChild(p);

    var actions = document.createElement('div');
    actions.className = 'ph-consent-actions';

    var yes = document.createElement('button');
    yes.type = 'button';
    yes.appendChild(document.createTextNode(t.accept));
    yes.onclick = function () { decide(GRANTED); };

    var no = document.createElement('button');
    no.type = 'button';
    no.className = 'ph-consent-no';
    no.appendChild(document.createTextNode(t.decline));
    no.onclick = function () { decide(DENIED); };

    actions.appendChild(yes);
    actions.appendChild(no);
    banner.appendChild(actions);
    document.body.appendChild(banner);
    yes.focus();
  }

  // Consent has to be withdrawable, so every page carries a way back to the
  // choice. The control is added to the footer only if the footer exists, and
  // it never replaces anything already there.
  function addFooterControl() {
    var footer = document.querySelector('footer');
    if (!footer || document.getElementById('ph-consent-manage')) return;
    var t = strings();
    var wrap = document.createElement('p');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'ph-consent-manage';
    btn.className = 'ph-consent-link';
    btn.appendChild(document.createTextNode(t.manage));
    btn.onclick = function () {
      try { window.localStorage.removeItem(KEY); } catch (e) { /* see read() */ }
      show();
    };
    wrap.appendChild(btn);
    footer.appendChild(wrap);
  }

  function start() {
    addFooterControl();
    var decision = read();
    if (decision === GRANTED) { activate(); return; }
    if (decision === DENIED) return;
    show();
  }

  // Exposed so a page can offer its own control, and so the browser tests can
  // drive the decision without synthesising clicks on a moving target.
  window.PHConsent = {
    KEY: KEY,
    state: function () { return read() || 'unset'; },
    grant: function () { decide(GRANTED); },
    deny: function () { decide(DENIED); },
    reopen: function () {
      try { window.localStorage.removeItem(KEY); } catch (e) { /* see read() */ }
      show();
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
}());
