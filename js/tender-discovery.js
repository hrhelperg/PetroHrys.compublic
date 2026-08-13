/* Tender Discovery & Search v1 — browser glue.
 *
 * This file does DOM, URL state, events and rendering. It does not do search.
 *
 * Every question of meaning — what matches, what ranks first, what a Strong
 * match is, whether a value may be sorted — is answered by TenderSearch, the
 * shared engine in /js/tender-search.js, which is a byte-identical copy of
 * scripts/lib/to-search.cjs and is tested in Node. A second implementation of
 * "which tender is most relevant" living in UI glue is how a filtered page and
 * a test end up disagreeing with nobody able to say which is right.
 *
 * ES5, no dependencies, no build step — the repository convention for /js/.
 */
(function () {
  'use strict';

  var root = document.getElementById('td-app');
  if (!root || typeof TenderSearch === 'undefined') return;

  var cfgEl = document.getElementById('td-config');
  if (!cfgEl) return;
  var CFG = JSON.parse(cfgEl.textContent);
  var T = CFG.t;
  var S = TenderSearch;

  var index = null;
  var facets = null;
  var els = {};
  var lastState = null;

  function $(id) { return document.getElementById(id); }

  function text(s) { return document.createTextNode(s == null ? '' : String(s)); }

  // Everything user-supplied reaches the DOM through createTextNode or
  // textContent. There is no innerHTML anywhere in this file that receives a
  // query string, a title, or a buyer name.
  function el(tag, cls, content) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (content != null) n.appendChild(text(content));
    return n;
  }

  // ── FORMATTING ────────────────────────────────────────────────────────────

  // Values are shown exactly as the source declared them, in the source's own
  // currency. No conversion, no normalization to a common unit.
  function formatValue(rec) {
    if (rec.vl == null || !rec.cu) return null;
    var n;
    try {
      n = new Intl.NumberFormat(CFG.locale).format(rec.vl);
    } catch (e) {
      n = String(rec.vl);
    }
    return n + ' ' + rec.cu;
  }

  function deadlineLabel(rec) {
    // A deadline that never resolved to an instant is shown as the source
    // wrote it, flagged as not comparable — never converted into a countdown
    // it cannot support.
    if (rec.dl == null) return { text: rec.dr ? rec.dr : T.deadlineNone, exact: false };
    if (rec.dl < 0) return { text: T.deadlinePassed, exact: true };
    return { text: T.deadlineDays.replace('{n}', rec.dl), exact: true };
  }

  // ── RESULT CARD ───────────────────────────────────────────────────────────
  //
  // Three visually distinct groups, because they have different epistemic
  // standing and presenting them identically would imply the derived ones were
  // equally source-verified:
  //   .td-fact    — what the source published
  //   .td-derived — what our engines computed
  //   .td-verify  — how the observation was made and how fresh it is
  function card(rec) {
    var li = el('li', 'td-card');

    var h = el('h3', 'td-card-title');
    var a = el('a', null, rec.ti);
    a.href = rec.u || '#';
    a.rel = 'noopener noreferrer';
    a.target = '_blank';
    h.appendChild(a);
    li.appendChild(h);

    var facts = el('dl', 'td-fact');
    function fact(label, value) {
      if (value == null || value === '') return;
      facts.appendChild(el('dt', null, label));
      facts.appendChild(el('dd', null, value));
    }
    fact(T.fBuyer, rec.bu);
    fact(T.fBuyerCountry, CFG.countryNames[rec.co] || rec.co);
    if (rec.pc && rec.pc !== rec.co) fact(T.fProjectCountry, CFG.countryNames[rec.pc] || rec.pc);
    fact(T.fStatus, T.status[rec.s] || rec.s);
    var dl = deadlineLabel(rec);
    fact(T.fDeadline, dl.text);
    fact(T.fPublished, rec.pb);
    fact(T.fSource, T.source[rec.sr] || rec.sr);
    if (rec.cd) fact(T.fClassification, (rec.sc || '') + ' ' + rec.cd);
    var v = formatValue(rec);
    if (v) fact(T.fValue, v);
    fact(T.fEsubmission, T.esub[rec.es] || rec.es);
    li.appendChild(facts);

    // Derived intelligence, labelled as such.
    var bands = [];
    for (var k in rec.m) {
      if (Object.prototype.hasOwnProperty.call(rec.m, k)) {
        bands.push((T.profile[k] || k) + ' · ' + (T.band[rec.m[k]] || rec.m[k]));
      }
    }
    if (bands.length) {
      var d = el('p', 'td-derived');
      d.appendChild(el('span', 'td-tag', T.derivedTag));
      d.appendChild(text(' ' + bands.sort().slice(0, 4).join(' · ')));
      li.appendChild(d);
    }

    // Verification and freshness.
    var notes = [];
    if (rec.bc) notes.push(T.browserCheckNote);
    if (rec.ms) notes.push(T.multiSourceNote.replace('{n}', rec.oc));
    if (!dl.exact && rec.dr) notes.push(T.deadlineNotComparable);
    if (notes.length) {
      var vfy = el('p', 'td-verify');
      vfy.appendChild(el('span', 'td-tag', T.verifyTag));
      vfy.appendChild(text(' ' + notes.join(' · ')));
      li.appendChild(vfy);
    }
    return li;
  }

  // ── ACTIVE FILTER SUMMARY ─────────────────────────────────────────────────

  function activeSummary(state) {
    var wrap = els.active;
    wrap.innerHTML = '';
    var any = false;
    var keys = [];
    if (state.q) keys.push(['q', T.fQuery + ': ' + state.q]);
    for (var k in state.filters) {
      if (!Object.prototype.hasOwnProperty.call(state.filters, k)) continue;
      var v = state.filters[k];
      var label = (T.filterLabel[k] || k) + ': ';
      if (k === 'country' || k === 'projectCountry') label += (CFG.countryNames[v] || v);
      else if (k === 'profile') label += (T.profile[v] || v);
      else if (k === 'source' || k === 'platform') label += (T.source[v] || v);
      else if (k === 'status') label += (T.status[v] || v);
      else if (k === 'matchBand') label += (T.band[v] || v);
      else if (k === 'esubmission') label += (T.esub[v] || v);
      else if (k === 'deadlineDays') label += T.deadlineWithin.replace('{n}', v);
      else if (k === 'browserCheck') label += (v === 'yes' ? T.yes : T.no);
      else label += v;
      keys.push([k, label]);
    }
    for (var i = 0; i < keys.length; i += 1) {
      any = true;
      (function (key, label) {
        var b = el('button', 'td-chip', label + ' ×');
        b.type = 'button';
        b.setAttribute('aria-label', T.removeFilter.replace('{f}', label));
        b.onclick = function () {
          if (key === 'q') { els.q.value = ''; } else { clearControl(key); }
          apply(1);
        };
        wrap.appendChild(b);
      }(keys[i][0], keys[i][1]));
    }
    els.clearAll.hidden = !any;
    return any;
  }

  function clearControl(key) {
    var c = els.controls[key];
    if (c) c.value = '';
  }

  // ── RENDER ────────────────────────────────────────────────────────────────

  function render(state, result) {
    // Count first, and announced politely rather than assertively so a
    // screen-reader user is not interrupted mid-sentence on every keystroke.
    var msg = result.total === 1 ? T.countOne
      : T.countMany.replace('{n}', new Intl.NumberFormat(CFG.locale).format(result.total));
    els.status.textContent = msg;

    // A refusal the engine made must be visible, not swallowed.
    els.notice.innerHTML = '';
    if (result.notices && result.notices.length) {
      for (var n = 0; n < result.notices.length; n += 1) {
        var key = result.notices[n];
        els.notice.appendChild(el('p', 'td-notice', T.notice[key] || key));
      }
    }

    activeSummary(state);

    els.results.innerHTML = '';
    if (!result.total) {
      // Honest empty state. No fallback tenders are substituted to avoid an
      // empty page.
      var e = el('div', 'td-empty');
      e.appendChild(el('p', null, T.emptyTitle));
      e.appendChild(el('p', null, T.emptyHint));
      els.results.appendChild(e);
      els.pagination.innerHTML = '';
      return;
    }
    var ul = el('ul', 'td-list');
    for (var i = 0; i < result.results.length; i += 1) ul.appendChild(card(result.results[i]));
    els.results.appendChild(ul);
    renderPagination(result);
  }

  function renderPagination(result) {
    var nav = els.pagination;
    nav.innerHTML = '';
    if (result.pages <= 1) return;
    var mk = function (label, page, disabled, current) {
      var b = el('button', 'td-page', label);
      b.type = 'button';
      if (disabled) b.disabled = true;
      if (current) b.setAttribute('aria-current', 'page');
      b.onclick = function () { apply(page); };
      return b;
    };
    nav.appendChild(mk(T.prev, result.page - 1, result.page <= 1, false));
    nav.appendChild(el('span', 'td-pageinfo',
      T.pageOf.replace('{a}', result.page).replace('{b}', result.pages)));
    nav.appendChild(mk(T.next, result.page + 1, result.page >= result.pages, false));
  }

  // ── STATE ─────────────────────────────────────────────────────────────────

  function readControls() {
    var filters = {};
    for (var k in els.controls) {
      if (!Object.prototype.hasOwnProperty.call(els.controls, k)) continue;
      var v = els.controls[k].value;
      if (v === '' || v == null) continue;
      filters[k] = k === 'deadlineDays' ? Number(v) : v;
    }
    return { q: els.q.value, filters: filters, sort: els.sort.value, page: 1 };
  }

  function writeControls(state) {
    els.q.value = state.q || '';
    els.sort.value = state.sort || 'relevance';
    for (var k in els.controls) {
      if (!Object.prototype.hasOwnProperty.call(els.controls, k)) continue;
      var v = state.filters[k];
      els.controls[k].value = v == null ? '' : String(v);
    }
  }

  // Run a search and push the state into the URL. `page` is explicit because
  // changing a filter must reset to page 1 — otherwise narrowing a search from
  // page 7 lands on an empty page and looks like zero results.
  function apply(page, replace) {
    var state = readControls();
    state.page = page || 1;
    run(state, replace);
  }

  function run(state, replace) {
    var result = S.search(index, state);
    // The engine clamps an out-of-range page; the URL must agree with what was
    // actually rendered rather than keep a page number nothing is on.
    state.page = result.page;
    state.sort = result.sort;
    lastState = state;
    render(state, result);
    var qs = S.serializeState(state);
    var url = location.pathname + qs;
    if (replace) history.replaceState(null, '', url);
    else history.pushState(null, '', url);
  }

  // ── CONTROLS ──────────────────────────────────────────────────────────────

  function fillSelect(sel, entries, labeller) {
    for (var i = 0; i < entries.length; i += 1) {
      var o = document.createElement('option');
      o.value = entries[i].value;
      // Counts come from the index facets, so a control can only ever offer a
      // value that has records behind it.
      o.appendChild(text(labeller(entries[i].value) + ' (' + entries[i].count + ')'));
      sel.appendChild(o);
    }
  }

  function boot(data) {
    index = S.hydrate(data);
    facets = data.facets;

    els.q = $('td-q');
    els.sort = $('td-sort');
    els.status = $('td-status');
    els.notice = $('td-notice');
    els.results = $('td-results');
    els.pagination = $('td-pagination');
    els.active = $('td-active');
    els.clearAll = $('td-clear');
    els.controls = {
      status: $('td-status-f'),
      country: $('td-country'),
      projectCountry: $('td-project-country'),
      source: $('td-source'),
      scheme: $('td-scheme'),
      profile: $('td-profile'),
      matchBand: $('td-band'),
      deadlineDays: $('td-deadline'),
      esubmission: $('td-esub'),
      currency: $('td-currency'),
      browserCheck: $('td-browser'),
    };

    var name = function (m) { return function (v) { return (m && m[v]) || v; }; };
    fillSelect(els.controls.status, facets.status, name(T.status));
    fillSelect(els.controls.country, facets.country, name(CFG.countryNames));
    fillSelect(els.controls.projectCountry, facets.projectCountry, name(CFG.countryNames));
    fillSelect(els.controls.source, facets.source, name(T.source));
    fillSelect(els.controls.scheme, facets.scheme, function (v) { return v; });
    fillSelect(els.controls.profile, facets.profile, name(T.profile));
    fillSelect(els.controls.currency, facets.currency, function (v) { return v; });
    fillSelect(els.controls.esubmission, facets.esubmission, name(T.esub));
    fillSelect(els.controls.browserCheck, facets.browserCheck, function (v) {
      return v === 'yes' ? T.yes : T.no;
    });

    var known = {
      countries: facets.country.map(function (x) { return x.value; }),
      projectCountries: facets.projectCountry.map(function (x) { return x.value; }),
      sources: facets.source.map(function (x) { return x.value; }),
      platforms: facets.platform.map(function (x) { return x.value; }),
      profiles: facets.profile.map(function (x) { return x.value; }),
      currencies: facets.currency.map(function (x) { return x.value; }),
      schemes: facets.scheme.map(function (x) { return x.value; }),
    };

    var initial = S.parseState(new URLSearchParams(location.search), known);
    writeControls(initial);
    render(initial, S.search(index, initial));
    history.replaceState(null, '', location.pathname + S.serializeState(initial));
    lastState = initial;

    $('td-form').addEventListener('submit', function (e) { e.preventDefault(); apply(1); });
    for (var k in els.controls) {
      if (Object.prototype.hasOwnProperty.call(els.controls, k)) {
        els.controls[k].addEventListener('change', function () { apply(1); });
      }
    }
    els.sort.addEventListener('change', function () { apply(1); });
    els.clearAll.addEventListener('click', function () {
      els.q.value = '';
      els.sort.value = 'relevance';
      for (var c in els.controls) {
        if (Object.prototype.hasOwnProperty.call(els.controls, c)) els.controls[c].value = '';
      }
      apply(1);
    });

    // Back and forward restore the exact result universe, because the whole
    // state lives in the URL.
    window.addEventListener('popstate', function () {
      var s = S.parseState(new URLSearchParams(location.search), known);
      writeControls(s);
      render(s, S.search(index, s));
      lastState = s;
    });

    root.hidden = false;
    var loading = $('td-loading');
    if (loading) loading.hidden = true;
  }

  function fail() {
    var loading = $('td-loading');
    if (loading) loading.textContent = T.loadFailed;
  }

  if (!window.fetch || !window.URLSearchParams || !window.history || !history.pushState) {
    fail();
    return;
  }

  fetch(CFG.indexUrl)
    .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
    .then(boot)
    .catch(fail);
}());
