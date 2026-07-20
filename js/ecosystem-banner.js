/*!
 * HELPERG Ecosystem Banner — renderer + interactions (dependency-free)
 * ------------------------------------------------------------------
 * Progressive enhancement: the injected static markup (brand + curated
 * timeline + an "Explore all products" link to the ecosystem hub) is
 * fully functional with no JavaScript. This script upgrades it with the
 * Apps / All-products popovers built from the single Product Registry
 * (window.HELPERG_ECOSYSTEM).
 *
 * Honesty rule enforced here: a platform renders a real link ONLY when
 * its status is "available" AND a URL exists. Everything else renders a
 * muted, non-interactive status whose TEXT carries the meaning (never
 * colour or an emoji alone). No href="#", no fake disabled links.
 *
 * A11y: real <button> triggers with aria-expanded / aria-controls /
 * aria-haspopup; Escape and outside-click close; focus returns to the
 * opening control; WCAG 2.5.3 (label-in-name) preserved by keeping the
 * visible platform word inside each link's accessible name.
 */
(function () {
  'use strict';

  var registry = (typeof window !== 'undefined') && window.HELPERG_ECOSYSTEM;
  if (!registry) return;

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else { fn(); }
  }

  ready(function () {
    var nav = document.querySelector('[data-helperg-eco]');
    if (!nav || nav.hasAttribute('data-eco-enhanced')) return;

    var bar = nav.querySelector('.eco-bar') || nav;

    /* ---- language + labels ---- */
    var docLang = (document.documentElement.getAttribute('lang') || 'en').slice(0, 2).toLowerCase();
    var L = registry.labels[docLang] ? registry.labels[docLang] : registry.labels.en;
    function t(key, name) {
      var s = (L && L[key]) || (registry.labels.en[key]) || key;
      return name != null ? s.replace('{name}', name) : s;
    }

    var byId = {};
    registry.products.forEach(function (p) { byId[p.id] = p; });

    /* ---- current-site detection (hostname → currentSiteDomains) ---- */
    var host = (location.hostname || '').replace(/^www\./, '').toLowerCase();
    var selfId = registry.self && registry.self.id;
    registry.products.forEach(function (p) {
      (p.currentSiteDomains || []).forEach(function (d) {
        if (String(d).replace(/^www\./, '').toLowerCase() === host) selfId = p.id;
      });
    });

    /* ---- tiny DOM helper ---- */
    function el(tag, attrs, kids) {
      var n = document.createElement(tag);
      if (attrs) Object.keys(attrs).forEach(function (k) {
        if (k === 'class') n.className = attrs[k];
        else if (k === 'text') n.textContent = attrs[k];
        else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
      });
      if (kids) (Array.isArray(kids) ? kids : [kids]).forEach(function (c) {
        if (c == null) return;
        n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
      return n;
    }

    var STORE = { ios: 'openAppStore', android: 'openGooglePlay' };
    var PLATLABEL = { website: 'website', webApp: 'webApp', ios: 'ios', android: 'android' };
    var URLKEY = { website: 'websiteUrl', webApp: 'webAppUrl', ios: 'iosUrl', android: 'androidUrl' };
    var STATUSKEY = { website: 'websiteStatus', webApp: 'webAppStatus', ios: 'iosStatus', android: 'androidStatus' };

    /* Render one platform control: real link iff available + url, else
       a muted, non-interactive status whose text carries the meaning. */
    function renderPlat(product, platform) {
      var url = product[URLKEY[platform]];
      var status = product[STATUSKEY[platform]];
      var label = t(PLATLABEL[platform]);
      var isStore = (platform === 'ios' || platform === 'android');

      if (status === 'available' && url) {
        var dot = el('span', { 'class': 'eco-dot eco-dot--available', 'aria-hidden': 'true' });
        var descKey = isStore ? STORE[platform] : (platform === 'website' ? 'visitWebsite' : 'openWebApp');
        // Keep the visible word inside the accessible name (WCAG 2.5.3).
        var vh = el('span', { 'class': 'eco-vh', text: ' — ' + t(descKey, product.name) });
        var a = el('a', { 'class': 'eco-plat' }, [dot, document.createTextNode(label), vh]);
        a.href = url;
        if (isStore) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
        return a;
      }

      var statusWord = status === 'coming-soon' ? t('comingSoon')
        : status === 'unavailable' ? t('unavailable')
        : status === 'unknown' ? t('unavailable')
        : t('unavailable');
      var dotClass = status === 'coming-soon' ? 'eco-dot--soon' : 'eco-dot--unavailable';
      return el('span', { 'class': 'eco-plat--muted' }, [
        el('span', { 'class': 'eco-dot ' + dotClass, 'aria-hidden': 'true' }),
        label + ' · ' + statusWord
      ]);
    }

    /* Render one product row. */
    function renderProduct(product) {
      var isApp = product.group === 'applications';
      var isSelf = product.id === selfId;

      var nameNode;
      if (isSelf) {
        nameNode = el('a', { 'class': 'eco-product-name', href: '/', 'aria-current': 'page' }, [
          document.createTextNode(product.name),
          el('span', { 'class': 'eco-tag', text: t('currentSite') })
        ]);
      } else if (product.detailUrl) {
        nameNode = el('a', { 'class': 'eco-product-name', href: product.detailUrl }, [
          document.createTextNode(product.name),
          el('span', { 'class': 'eco-vh', text: ' — ' + t('openDetail', product.name) })
        ]);
      } else {
        nameNode = el('span', { 'class': 'eco-product-name', text: product.name });
      }

      var links = el('span', { 'class': 'eco-product-links' });
      if (isApp) {
        links.appendChild(renderPlat(product, 'ios'));
        links.appendChild(renderPlat(product, 'android'));
      } else {
        links.appendChild(renderPlat(product, 'website'));
        links.appendChild(renderPlat(product, 'webApp'));
      }

      return el('li', null, el('div', { 'class': 'eco-product' }, [nameNode, links]));
    }

    /* Products for a group, ordered by displayPriority. */
    function groupProducts(groupId) {
      return registry.products
        .filter(function (p) { return p.group === groupId; })
        .sort(function (a, b) { return (a.displayPriority || 0) - (b.displayPriority || 0); });
    }

    function renderGroup(group) {
      var items = groupProducts(group.id);
      if (!items.length) return null;
      var ul = el('ul', null, items.map(renderProduct));
      return el('section', { 'class': 'eco-group' }, [
        el('h3', { 'class': 'eco-group-title', text: t(group.labelKey) }),
        ul
      ]);
    }

    var panelSeq = 0;
    function buildPanel(kind) {
      panelSeq += 1;
      var id = 'eco-panel-' + kind + '-' + panelSeq;
      var titleId = 'eco-title-' + kind + '-' + panelSeq;
      var isApps = (kind === 'apps');
      var groupsToShow = isApps
        ? registry.groups.filter(function (g) { return g.id === 'applications'; })
        : registry.groups;

      var titleText = isApps ? t('apps') : t('brand');
      var close = el('button', { type: 'button', 'class': 'eco-close', 'aria-label': t('close') },
        el('span', { 'aria-hidden': 'true', text: '✕' }));

      var head = el('div', { 'class': 'eco-panel-head' }, [
        el('div', { 'class': 'eco-panel-titles' }, [
          el('h2', { 'class': 'eco-panel-title', id: titleId, text: titleText }),
          el('p', { 'class': 'eco-panel-sub', text: t('tagline') })
        ]),
        close
      ]);

      var groupsWrap = el('div', { 'class': 'eco-groups' },
        groupsToShow.map(renderGroup).filter(Boolean));

      /* role=dialog + aria-labelledby gives the popover a reliable accessible
         name (an aria-label on a bare div is often ignored by AT). aria-modal
         is toggled to "true" only when opened as the full-screen mobile sheet. */
      var panel = el('div', {
        'class': 'eco-panel' + (isApps ? ' eco-panel-apps' : ' eco-panel-all'),
        id: id,
        role: 'dialog',
        'aria-modal': 'false',
        'aria-labelledby': titleId,
        hidden: 'hidden'
      }, [head, groupsWrap]);

      return { panel: panel, id: id, close: close };
    }

    /* ---- build controls + panels ---- */
    var appsPanel = buildPanel('apps');
    var allPanel = buildPanel('all');

    function trigger(labelKey, panelId, extraClass) {
      var btn = el('button', {
        type: 'button',
        'class': 'eco-trigger' + (extraClass ? ' ' + extraClass : ''),
        'aria-haspopup': 'dialog',
        'aria-expanded': 'false',
        'aria-controls': panelId
      }, [
        el('span', { text: labelKey }),
        el('span', { 'class': 'eco-caret', 'aria-hidden': 'true' })
      ]);
      return btn;
    }

    var appsBtn = trigger(t('apps'), appsPanel.id);
    appsBtn.setAttribute('data-panel', 'apps');
    var allBtn = trigger(t('allProducts'), allPanel.id, 'eco-trigger-all');
    allBtn.setAttribute('data-panel', 'all');
    var mobileBtn = trigger(t('products'), allPanel.id, 'eco-trigger-mobile');
    mobileBtn.setAttribute('data-panel', 'all');

    var controls = el('div', { 'class': 'eco-controls' }, [appsBtn, allBtn, mobileBtn]);

    var backdrop = el('div', { 'class': 'eco-backdrop', 'aria-hidden': 'true' });

    /* Insert controls where the fallback link was, then panels + backdrop. */
    var fallbackLink = bar.querySelector('.eco-explore');
    if (fallbackLink) { bar.insertBefore(controls, fallbackLink.nextSibling); }
    else { bar.appendChild(controls); }
    bar.appendChild(appsPanel.panel);
    bar.appendChild(allPanel.panel);
    nav.appendChild(backdrop);
    nav.setAttribute('data-eco-enhanced', 'true');

    /* ---- interaction state machine ---- */
    var openName = null;
    var openTrigger = null;

    var PANELS = {
      apps: { panel: appsPanel.panel, close: appsPanel.close, triggers: [appsBtn] },
      all: { panel: allPanel.panel, close: allPanel.close, triggers: [allBtn, mobileBtn] }
    };

    function setExpanded(name, expanded) {
      PANELS[name].triggers.forEach(function (b) { b.setAttribute('aria-expanded', expanded ? 'true' : 'false'); });
    }

    function isMobileSheet() {
      return window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
    }
    function isVisible(elm) { return !!(elm && elm.offsetParent !== null); }

    function closePanel(returnFocus) {
      if (!openName) return;
      var cur = PANELS[openName];
      cur.panel.setAttribute('hidden', 'hidden');
      cur.panel.setAttribute('aria-modal', 'false');
      setExpanded(openName, false);
      nav.removeAttribute('data-eco-open');
      var trig = openTrigger;
      openName = null;
      openTrigger = null;
      if (returnFocus) {
        // The stored trigger may have been hidden by a breakpoint (e.g. the
        // desktop trigger after a resize/zoom to mobile). Fall back to a
        // visible trigger for the same panel, then to the banner nav.
        var target = isVisible(trig) ? trig
          : cur.triggers.filter(isVisible)[0]
          || nav;
        if (target === nav && !nav.hasAttribute('tabindex')) nav.setAttribute('tabindex', '-1');
        if (target && typeof target.focus === 'function') target.focus();
      }
    }

    function openPanel(name, triggerEl) {
      if (openName && openName !== name) closePanel(false);
      var next = PANELS[name];
      var modal = isMobileSheet();
      next.panel.removeAttribute('hidden');
      next.panel.setAttribute('aria-modal', modal ? 'true' : 'false');
      setExpanded(name, true);
      nav.setAttribute('data-eco-open', name);
      openName = name;
      openTrigger = triggerEl;
      // On the mobile full-screen sheet, move focus into the dialog so
      // keyboard/AT users are not left behind the dimmed backdrop.
      if (modal && next.close && typeof next.close.focus === 'function') next.close.focus();
    }

    function toggle(name, triggerEl) {
      if (openName === name) closePanel(true);
      else openPanel(name, triggerEl);
    }

    // Trap Tab within the panel ONLY while it is a modal (mobile) sheet.
    function trapTab(e) {
      if (!openName || e.key !== 'Tab') return;
      var panel = PANELS[openName].panel;
      if (panel.getAttribute('aria-modal') !== 'true') return;
      var f = panel.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    [appsBtn, allBtn, mobileBtn].forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        toggle(btn.getAttribute('data-panel'), btn);
      });
    });
    [appsPanel.close, allPanel.close].forEach(function (c) {
      c.addEventListener('click', function () { closePanel(true); });
    });
    backdrop.addEventListener('click', function () { closePanel(true); });

    document.addEventListener('keydown', function (e) {
      if ((e.key === 'Escape' || e.key === 'Esc') && openName) {
        closePanel(true);
        return;
      }
      trapTab(e);
    });

    // Outside-click closes. The nav.contains() guard already prevents a click
    // on a trigger (or inside a panel) from self-closing, so no
    // stopPropagation is needed here — host document click handlers keep firing.
    document.addEventListener('click', function (e) {
      if (!openName) return;
      if (!nav.contains(e.target)) closePanel(false);
    });

    /* ---- sticky-stack height (for anchor scroll-margin) ---- */
    function measureStack() {
      var bannerH = nav.offsetHeight || 0;
      var topBar = document.querySelector('header[role="banner"]')
        || document.querySelector('body > nav:not([data-helperg-eco])');
      var topH = topBar ? topBar.offsetHeight : 0;
      document.documentElement.style.setProperty('--sticky-stack-height', (bannerH + topH) + 'px');
    }
    measureStack();
    var rAF;
    window.addEventListener('resize', function () {
      if (rAF) cancelAnimationFrame(rAF);
      rAF = requestAnimationFrame(function () {
        measureStack();
        // Keep modal semantics in sync if the viewport crosses the mobile
        // breakpoint while a panel is open.
        if (openName) PANELS[openName].panel.setAttribute('aria-modal', isMobileSheet() ? 'true' : 'false');
      });
    });
  });
})();
