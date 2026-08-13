/* Distribution Planner — progressive enhancement only.
 *
 * The planner shipped with six controls and no client. Selecting a market, a
 * budget or a campaign size changed nothing on the page: section 3 was rendered
 * once at build time for one hardcoded query, and the summary paragraph above it
 * stated "United States" as a literal, so a reader who chose United Kingdom was
 * shown a United States campaign under a sentence claiming it was theirs. The
 * evidence control was worse than inert — it offered four levels of evidence and
 * was wired to nothing at all.
 *
 * This file reads all six controls into ONE state object, fetches the projected
 * opportunity set once, and recomputes on every change. It DECIDES NOTHING: the
 * campaign comes from DPEngine (js/dp-engine.js, shipped byte-for-byte from
 * scripts/lib/dp-engine.cjs), which is the same module the generator, the CSV
 * export and the test suite use. A second scoring implementation living here is
 * how a page starts calling something Ready that the CSV calls Needs research.
 *
 * That state is also the URL, and the URL is also that state. Six controls make
 * 29,920 combinations and none of them was addressable, so a campaign could not
 * be sent to the colleague who has to work it. History is wired here; the
 * PARSING is in the engine, next to the vocabularies a value has to be checked
 * against — the engine THROWS on a business profile it does not know, so a
 * hostile or stale ?business= must be rejected before it reaches campaign().
 *
 * And what the page computed can now be downloaded. The static CSV in section 2
 * is the whole 2,234-row queue and stays that; the button in section 3 exports
 * the campaign these controls are in, which the server never saw.
 *
 * Only section 3 and the summary paragraph depend on the controls. Sections 2,
 * 4, 5 and 6 are computed over the whole corpus and are control-independent, so
 * this file does not touch them.
 *
 * If anything is missing — the engine, fetch, the data file, a field the engine
 * needs — it returns and the server-rendered page stands. The prerendered
 * campaign is a real campaign for the state the controls are already in, so the
 * page a no-JS reader sees is true, and staying on it is always safe.
 *
 * Writes textContent and constructs elements. Never innerHTML from data.
 */
(function () {
  'use strict';

  var E = typeof DPEngine !== 'undefined' ? DPEngine
    : (typeof window !== 'undefined' ? window.DPEngine : null);
  if (!E) return; // no engine: the prerendered campaign is the only honest answer

  var controls = document.querySelector('[data-dp-controls]');
  var statusEl = document.querySelector('[data-dp-status]');
  var section = document.getElementById('campaign');
  if (!controls || !statusEl || !section) return;

  // A campaign section always carries its own heading. Without this an id
  // collision elsewhere on the page would hand this file some other element to
  // empty and refill.
  if (!section.querySelector('h2')) return;

  // Every control names the state key it owns, so a seventh control needs no
  // edit here. The six the page emits are business, objective, market, budget,
  // size and evidence.
  var selects = Array.prototype.slice.call(controls.querySelectorAll('[data-dp-filter]'));
  if (!selects.length) return;

  // URL state is an enhancement of an enhancement. A browser without history or
  // URLSearchParams still gets a planner that recomputes; it simply cannot share
  // what it computed, which is a smaller loss than standing down entirely.
  var historyOk = typeof window !== 'undefined' && typeof URLSearchParams === 'function'
    && !!window.history && typeof window.history.pushState === 'function'
    && !!window.location;

  function controlFor(key) {
    for (var i = 0; i < selects.length; i += 1) {
      if (String(selects[i].getAttribute('data-dp-filter')) === key) return selects[i];
    }
    return null;
  }

  // Five of the six vocabularies are fixed and the engine owns them. The sixth —
  // market — is whichever countries the corpus contains, so it is read off the
  // control's own options and handed to the engine. A URL can then only ever
  // name a market the reader could have chosen from the control itself.
  function knownVocabulary() {
    var select = controlFor('market');
    var markets = [];
    if (select && select.options) {
      for (var i = 0; i < select.options.length; i += 1) markets.push(select.options[i].value);
    }
    return { markets: markets };
  }

  var known = knownVocabulary();

  function labelOf(select) {
    var option = select.options[select.selectedIndex];
    return option ? option.textContent : select.value;
  }

  // ONE state object. The bug this file exists to fix was a page holding its
  // state in three places — a hardcoded query in the generator, the option
  // `selected` attributes, and a sentence — and keeping none of them in step.
  function readState() {
    var state = { values: {}, labels: {} };
    selects.forEach(function (select) {
      var key = String(select.getAttribute('data-dp-filter'));
      state.values[key] = select.value;
      state.labels[key] = labelOf(select);
    });
    return state;
  }

  // Writes a state the engine has already validated back onto the controls. A
  // value no option carries would leave a select at selectedIndex -1 with an
  // empty value, and the page would then compute a campaign for a state nothing
  // on screen describes — which is why parseState whitelists rather than
  // sanitizes, and why nothing else is allowed to call this.
  function writeState(values) {
    selects.forEach(function (select) {
      var key = String(select.getAttribute('data-dp-filter'));
      if (values[key] === undefined || values[key] === null) return;
      select.value = String(values[key]);
    });
  }

  var data = null;
  var lastResult = null;
  var lastValues = null;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function renderGroups(groups) {
    // Remove the previously rendered groups only. The heading, the intro
    // paragraph and the download button are the section's own furniture and
    // survive every recompute.
    var stale = Array.prototype.slice.call(section.querySelectorAll('[data-dp-group]'));
    stale.forEach(function (node) {
      if (node.parentNode) node.parentNode.removeChild(node);
    });

    groups.forEach(function (group) {
      var box = el('section');
      box.setAttribute('data-dp-group', group.key);
      box.id = 'cg-' + group.key;
      box.setAttribute('aria-labelledby', 'cg-' + group.key + '-h');

      var h3 = el('h3', null, group.label + ' ');
      h3.id = 'cg-' + group.key + '-h';
      h3.appendChild(el('span', 'bd-count', group.items.length));
      box.appendChild(h3);
      box.appendChild(el('p', null, group.blurb));

      var list = el('ul', 'bd-list');
      group.items.forEach(function (item) {
        var op = item.op;
        var act = item.x.act;
        var li = document.createElement('li');
        li.appendChild(el('strong', null, op.name));
        var collection = E.COLLECTION_BY_KEY.get(op.sourceCollection);
        li.appendChild(document.createTextNode(' — ' + act.nextAction + ', '
          + collection.label + ', ' + op.cost));
        if (act.actionUrl) {
          li.appendChild(document.createTextNode(' — '));
          var a = el('a', null, 'open');
          a.href = act.actionUrl;
          a.rel = 'noopener noreferrer';
          a.target = '_blank';
          li.appendChild(a);
        }
        li.appendChild(document.createElement('br'));
        li.appendChild(el('small', null,
          'Selected because: ' + item.x.reasons.slice(0, 3).join('; ')));
        list.appendChild(li);
      });
      box.appendChild(list);
      section.appendChild(box);
    });
  }

  // ── the campaign, downloaded ────────────────────────────────────────────────

  // Shipped hidden by the generator and adopted here, so a no-JS reader is never
  // offered a button that would hand them a campaign other than the one they can
  // see. The label is the dictionary's, localized at build time; only the count
  // is appended, so nothing assembles an English sentence in the browser.
  var downloadEl = section.querySelector('[data-dp-download]');
  var downloadLabel = downloadEl ? downloadEl.textContent : '';
  var canDownload = !!downloadEl && typeof Blob === 'function'
    && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';

  function updateDownload(result) {
    if (!canDownload) return;
    // Rows, not picks. They are the same number unless a picked opportunity
    // satisfied no group, and the button must never promise a count the file
    // does not contain.
    downloadEl.textContent = downloadLabel + ' (' + E.campaignRows(result).length + ')';
    downloadEl.hidden = false;
  }

  function download() {
    if (!canDownload || !lastResult) return;
    var blob = new Blob([E.campaignCsv(lastResult)], { type: 'text/csv;charset=utf-8' });
    var href = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = href;
    a.download = E.campaignFilename(lastValues, known);
    // In the document for the length of the click: a detached anchor is ignored
    // by some browsers, and leaving it there would put a stray link inside the
    // campaign section.
    var host = downloadEl.parentNode;
    if (host) host.appendChild(a);
    a.click();
    if (host) host.removeChild(a);
    // Deferred: revoking in the same tick cancels the download in some browsers.
    setTimeout(function () { URL.revokeObjectURL(href); }, 0);
  }

  // ── recompute ──────────────────────────────────────────────────────────────

  // `mode` is what to do with history: 'replace' on boot and 'push' on a control
  // change. A popstate passes nothing — the browser has already moved the entry,
  // and pushing there would bury the history it just navigated.
  function apply(mode) {
    if (!data) return;
    var state = readState();
    var ctx = {
      business: state.values.business,
      objective: state.values.objective,
      market: state.values.market,
      budget: state.values.budget
    };
    var size = Number(state.values.size);
    if (!isFinite(size) || size < 1) return;

    var result;
    try {
      result = E.campaign(data, ctx, { size: size, evidence: state.values.evidence });
    } catch (err) {
      return; // an unknown profile or objective: leave the server's answer alone
    }

    statusEl.textContent = E.summaryText({
      size: size,
      business: state.labels.business,
      objective: state.labels.objective,
      market: state.labels.market,
      budget: state.labels.budget,
      evidence: state.labels.evidence,
      totalEligible: result.totalEligible,
      picked: result.picked.length
    });
    renderGroups(result.groups);
    lastResult = result;
    lastValues = state.values;
    updateDownload(result);

    // The URL is written only after the campaign it describes is on screen, so
    // there is no moment where the address bar promises a plan the page has not
    // rendered.
    if (mode && historyOk) {
      var url = window.location.pathname + E.serializeState(state.values, known);
      if (mode === 'replace') window.history.replaceState(null, '', url);
      else window.history.pushState(null, '', url);
    }
  }

  function stateFromUrl() {
    return E.parseState(new URLSearchParams(window.location.search), known);
  }

  // The payload lives beside the CSV inside the planner's own route: /data/* is
  // a forced 404 by design, so a fetch of the canonical datasets would silently
  // receive the 404 page and JSON.parse would be the thing that told us.
  var url = '/research/distribution-planner/planner-data.json';
  if (typeof fetch !== 'function') return;

  fetch(url, { credentials: 'omit' }).then(function (response) {
    if (!response.ok) throw new Error('planner data unavailable');
    return response.json();
  }).then(function (payload) {
    if (!payload || !Array.isArray(payload.opportunities) || !payload.opportunities.length) {
      throw new Error('planner data is empty');
    }
    // A cached payload written by an older build can lack a field this engine
    // now reads, which would score every opportunity on facts that are not
    // there. Detected here rather than discovered as a wrong campaign.
    var declared = payload.fields || {};
    var contract = E.FIELD_CONTRACT;
    ['op', 'record', 'accepts', 'intelligence'].forEach(function (group) {
      var have = declared[group] || [];
      contract[group].forEach(function (field) {
        if (have.indexOf(field) === -1) {
          throw new Error('planner data predates this engine: ' + group + '.' + field);
        }
      });
    });
    data = payload.opportunities;

    // The URL is read only now. Moving the controls first and discovering the
    // payload missing second would leave six controls describing a campaign the
    // page is not showing — the defect this file exists to remove, reintroduced
    // through the address bar.
    if (historyOk) writeState(stateFromUrl());
    selects.forEach(function (select) {
      select.addEventListener('change', function () { apply('push'); });
    });
    if (canDownload) downloadEl.addEventListener('click', download);
    // 'replace' rather than 'push': the boot render is not a navigation, and it
    // rewrites whatever arrived — a stale parameter, a hostile one, a partial
    // link — as the canonical form of the state actually rendered.
    apply('replace');

    if (historyOk) {
      window.addEventListener('popstate', function () {
        writeState(stateFromUrl());
        apply(null);
      });
    }
  }).catch(function () {
    // Deliberately silent and deliberately inert. The page is already correct.
  });
}());
