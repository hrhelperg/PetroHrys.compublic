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
  // Per-site configuration (optional). Everything below degrades to sensible
  // defaults so the core renderer stays generic across HELPERG sites.
  var config = (typeof window !== 'undefined' && window.HELPERGEcosystemConfig) || {};

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
    var docLang = ((config.locale || document.documentElement.getAttribute('lang') || 'en') + '').slice(0, 2).toLowerCase();
    var L = registry.labels[docLang] ? registry.labels[docLang] : registry.labels.en;
    function t(key, name) {
      var s = (L && L[key]) || (registry.labels.en[key]) || key;
      return name != null ? s.replace('{name}', name) : s;
    }

    var hubUrl = config.ecosystemHomeUrl || registry.hubUrl;
    var showApps = config.showApps !== false;
    var showSearch = config.showSearch !== false;

    var byId = {};
    registry.products.forEach(function (p) { byId[p.id] = p; });

    /* ---- current-site detection: explicit config id, else EXACT hostname
       match against currentSiteDomains (never partial/substring). ---- */
    var selfId = (config.currentProductId && byId[config.currentProductId])
      ? config.currentProductId
      : (registry.productIdForHost ? registry.productIdForHost(location.hostname) : null);

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

    /* ---- inline SVG platform icons (decorative; the adjacent text carries
       the label, so each icon is aria-hidden). currentColor, one viewBox,
       restrained strokes, no network, no proprietary logos. ---- */
    var SVGNS = 'http://www.w3.org/2000/svg';
    function svgEl(name, attrs) {
      var e = document.createElementNS(SVGNS, name);
      Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
      return e;
    }
    function svgIcon(shapes) {
      var s = svgEl('svg', {
        'class': 'eco-ico', viewBox: '0 0 16 16', width: '13', height: '13',
        fill: 'none', stroke: 'currentColor', 'stroke-width': '1.4',
        'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        'aria-hidden': 'true', focusable: 'false'
      });
      shapes.forEach(function (sh) { s.appendChild(svgEl(sh[0], sh[1])); });
      return s;
    }
    function platformIcon(platform) {
      if (platform === 'website') { // globe
        return svgIcon([
          ['circle', { cx: 8, cy: 8, r: 6 }],
          ['line', { x1: 2, y1: 8, x2: 14, y2: 8 }],
          ['path', { d: 'M8 2c1.9 1.7 2.9 3.8 2.9 6S9.9 12.3 8 14C6.1 12.3 5.1 10.2 5.1 8S6.1 3.7 8 2z' }]
        ]);
      }
      if (platform === 'webApp') { // application window
        return svgIcon([
          ['rect', { x: 2, y: 3, width: 12, height: 10, rx: 1.6 }],
          ['line', { x1: 2, y1: 6.4, x2: 14, y2: 6.4 }]
        ]);
      }
      // ios + android: a generic mobile-device outline; the visible "iOS" /
      // "Android" text distinguishes them (no Apple / Play-triangle marks).
      return svgIcon([
        ['rect', { x: 4.4, y: 1.6, width: 7.2, height: 12.8, rx: 1.7 }],
        ['line', { x1: 6.6, y1: 12.7, x2: 9.4, y2: 12.7 }]
      ]);
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
        var descKey = isStore ? STORE[platform] : (platform === 'website' ? 'visitWebsite' : 'openWebApp');
        // Keep the visible word inside the accessible name (WCAG 2.5.3).
        var vh = el('span', { 'class': 'eco-vh', text: ' — ' + t(descKey, product.name) });
        var a = el('a', { 'class': 'eco-plat' }, [platformIcon(platform), document.createTextNode(label), vh]);
        a.href = url;
        if (isStore) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
        return a;
      }

      // coming-soon / unavailable / unknown → muted, non-interactive; the
      // status WORD carries the meaning (never colour/icon alone).
      var statusWord = status === 'coming-soon' ? t('comingSoon') : t('unavailable');
      return el('span', { 'class': 'eco-plat--muted eco-plat--' + status }, [
        platformIcon(platform),
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

      var li = el('li', null, el('div', { 'class': 'eco-product' }, [nameNode, links]));
      li.setAttribute('data-eco-search', searchHaystack(product));
      li.setAttribute('data-eco-searchable', product.showInSearch ? 'true' : 'false');
      return li;
    }

    function groupLabelKey(gid) {
      for (var i = 0; i < registry.groups.length; i++) {
        if (registry.groups[i].id === gid) return registry.groups[i].labelKey;
      }
      return '';
    }
    // Case-insensitive, Unicode-safe haystack: name + description + group +
    // applicable platform labels (so "iOS"/"web app"/etc. find products).
    function searchHaystack(product) {
      var parts = [product.name, product.shortDescription || '', t(groupLabelKey(product.group))];
      if (product.group === 'applications') { parts.push(t('ios'), t('android')); }
      else { parts.push(t('website'), t('webApp')); }
      return parts.join(' ').toLowerCase();
    }

    /* Products for a group that opt into the complete panel, ordered by
       displayPriority. */
    function groupProducts(groupId) {
      return registry.products
        .filter(function (p) { return p.group === groupId && p.showInAllProducts; })
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

      var children = [head];
      var search = null, noRes = null;
      // Local product search lives only in the complete All-products panel.
      if (!isApps && showSearch) {
        search = el('input', {
          type: 'search', 'class': 'eco-search',
          placeholder: t('searchLabel'), 'aria-label': t('searchLabel'),
          autocomplete: 'off', autocorrect: 'off', autocapitalize: 'none',
          spellcheck: 'false', 'aria-controls': id
        });
        // A persistent aria-live region: it announces the no-results message
        // (text change is announced reliably) and is visible when populated.
        noRes = el('p', { 'class': 'eco-no-results', role: 'status', 'aria-live': 'polite' });
        children.push(el('div', { 'class': 'eco-search-wrap' }, [
          svgIcon([['circle', { cx: 7, cy: 7, r: 4.5 }], ['line', { x1: 10.5, y1: 10.5, x2: 14, y2: 14 }]]),
          search
        ]));
        children.push(groupsWrap);
        children.push(noRes);
      } else {
        children.push(groupsWrap);
      }

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
      }, children);

      return { panel: panel, id: id, close: close, search: search, groupsWrap: groupsWrap, noRes: noRes };
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

    var allBtn = trigger(t('allProducts'), allPanel.id, 'eco-trigger-all');
    allBtn.setAttribute('data-panel', 'all');
    var mobileBtn = trigger(t('products'), allPanel.id, 'eco-trigger-mobile');
    mobileBtn.setAttribute('data-panel', 'all');

    // The Apps popover trigger is optional (config.showApps). When absent, the
    // applications still appear inside the All-products panel.
    var appsBtn = null;
    var controlKids = [];
    if (showApps) {
      appsBtn = trigger(t('apps'), appsPanel.id);
      appsBtn.setAttribute('data-panel', 'apps');
      controlKids.push(appsBtn);
    }
    controlKids.push(allBtn, mobileBtn);
    var controls = el('div', { 'class': 'eco-controls' }, controlKids);

    var backdrop = el('div', { 'class': 'eco-backdrop', 'aria-hidden': 'true' });

    /* Insert controls where the fallback link was, then panels + backdrop. */
    var fallbackLink = bar.querySelector('.eco-explore');
    if (fallbackLink) { bar.insertBefore(controls, fallbackLink.nextSibling); }
    else { bar.appendChild(controls); }
    if (showApps) bar.appendChild(appsPanel.panel);
    bar.appendChild(allPanel.panel);
    nav.appendChild(backdrop);
    nav.setAttribute('data-eco-enhanced', 'true');

    /* ---- interaction state machine ---- */
    var openName = null;
    var openTrigger = null;

    var PANELS = {
      all: {
        panel: allPanel.panel, close: allPanel.close, triggers: [allBtn, mobileBtn],
        search: allPanel.search, groupsWrap: allPanel.groupsWrap, noRes: allPanel.noRes
      }
    };
    if (showApps) {
      PANELS.apps = { panel: appsPanel.panel, close: appsPanel.close, triggers: [appsBtn], search: null };
    }

    /* ---- local product search (dependency-free; All-products panel only) ---- */
    function filterSearch(ref) {
      if (!ref || !ref.search) return;
      var q = (ref.search.value || '').trim().toLowerCase();
      var anyVisible = false;
      var rows = ref.groupsWrap.querySelectorAll('li[data-eco-search]');
      for (var i = 0; i < rows.length; i++) {
        var li = rows[i];
        var vis = q === '' ? true
          : (li.getAttribute('data-eco-searchable') === 'true' && li.getAttribute('data-eco-search').indexOf(q) !== -1);
        if (vis) { li.removeAttribute('hidden'); anyVisible = true; } else { li.setAttribute('hidden', 'hidden'); }
      }
      // Hide group headings whose products are all filtered out.
      var secs = ref.groupsWrap.querySelectorAll('.eco-group');
      for (var s = 0; s < secs.length; s++) {
        var visible = secs[s].querySelectorAll('li[data-eco-search]:not([hidden])').length;
        if (visible === 0) secs[s].setAttribute('hidden', 'hidden'); else secs[s].removeAttribute('hidden');
      }
      // aria-live: announce the no-results state (text change is announced).
      ref.noRes.textContent = (q !== '' && !anyVisible) ? t('noResults') : '';
    }
    function resetSearch(ref) {
      if (!ref || !ref.search) return;
      ref.search.value = '';
      filterSearch(ref);
    }
    if (allPanel.search) {
      allPanel.search.addEventListener('input', function () { filterSearch(PANELS.all); });
    }

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
      resetSearch(cur);            // search state resets when the panel closes
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
      // keyboard/AT users are not left behind the dimmed backdrop. Prefer the
      // search field when present, else the close button.
      if (modal) {
        var focusTarget = next.search || next.close;
        if (focusTarget && typeof focusTarget.focus === 'function') focusTarget.focus();
      }
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
      var f = panel.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])');
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
        var cur = PANELS[openName];
        // First Escape clears a non-empty search; a second Escape closes.
        if (cur.search && (cur.search.value || '').trim() !== '') {
          resetSearch(cur);
          cur.search.focus();
          return;
        }
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
      // The host site declares its own top bar(s) via config.headerSelector,
      // so the core renderer carries no site-specific selectors.
      var sel = config.headerSelector || 'header[role="banner"], body > nav:not([data-helperg-eco])';
      var topBar = document.querySelector(sel);
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
