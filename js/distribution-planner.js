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
 * Sections 2, 4 and 5 are outputs too, and used not to be. They were computed
 * over the WHOLE corpus, once, at build time: measured in Chrome, switching
 * Market from United States to United Kingdom moved the summary, the campaign
 * and the URL and left "Ready to execute — 126 opportunities" showing the same
 * 60 rows, still led by Alibaba.com and Apple App Store, plus 80 more rows and
 * two more headline counts describing a state nobody had selected. They now
 * come from E.worklist for the current state, partitioned by what can actually
 * be done with each row, and their headings recompute with them. WHICH
 * opportunities and in WHICH order is the engine's answer, not this file's.
 *
 * Section 6 is the exception and stays whole-corpus: readiness by collection is
 * a fact about the catalogue rather than about the campaign. It says so in its
 * own copy now, and this file leaves it alone deliberately.
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

  // The market control is also the country NAME table. The payload carries
  // country slugs and no names — it carries only what the engine reads — and
  // inventing names here would print "united-states" in a row the server had
  // rendered as "United States". The control's own options are the names the
  // generator resolved, in the locale it rendered, so reading them back is the
  // one source that cannot disagree with the server.
  function countryNamer() {
    var select = controlFor('market');
    var names = {};
    if (select && select.options) {
      for (var i = 0; i < select.options.length; i += 1) {
        names[select.options[i].value] = select.options[i].textContent;
      }
    }
    return function (slug) {
      return Object.prototype.hasOwnProperty.call(names, slug) ? names[slug] : slug;
    };
  }

  var countryName = countryNamer();

  // Sections 2, 4 and 5. Discovered through the engine's own section list, so
  // this file holds no status vocabulary and a fourth partition would need no
  // edit here. A section the markup does not carry is skipped rather than
  // invented.
  var queues = [];
  (E.WORKLIST_SECTIONS || []).forEach(function (spec) {
    var host = document.getElementById(spec.key);
    if (!host) return;
    var heading = host.querySelector('h2');
    var body = host.querySelector('[data-bd-rows]');
    if (!heading || !body) return;
    // The heading's number and its localized title are the generator's words
    // and the browser may not make up either, so they are carried on the
    // element. A page rendered before this attribute existed keeps the heading
    // it was served and recomputes only its rows, which is still true — just
    // less complete.
    queues.push({ key: spec.key, heading: heading, body: body,
      title: heading.getAttribute('data-dp-title') });
  });

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

  // ── the worklist: sections 2, 4 and 5 ──────────────────────────────────────

  // One row, described by the engine and built here as nodes. The cell order,
  // the labels, the attributes and which cell is the call to action all come
  // from the model, so the row the browser writes is the row the generator
  // wrote — there is no second row shape in this file to fall out of step.
  function renderRow(model) {
    var tr = el('tr', 'bd-row');
    Object.keys(model.attrs).forEach(function (key) {
      tr.setAttribute(key, model.attrs[key]);
    });
    model.cells.forEach(function (cell) {
      var td = el('td', cell.action ? 'bd-cell bd-actions' : 'bd-cell');
      td.setAttribute('data-bd-label', cell.label);
      if (cell.url) {
        var a = el('a', cell.action ? 'bd-cta-link' : null, cell.text);
        a.href = cell.url;
        if (cell.external) {
          a.rel = 'noopener noreferrer';
          a.target = '_blank';
        }
        td.appendChild(a);
      } else if (cell.action) {
        // No route recorded. The server renders the same empty metric rather
        // than a dead link, and a reader must not be sent anywhere we have not
        // established.
        td.appendChild(el('span', 'bd-metric bd-metric--empty', cell.text));
      } else {
        td.textContent = cell.text;
      }
      tr.appendChild(td);
    });
    return tr;
  }

  function renderQueues(wl, labels) {
    queues.forEach(function (queue) {
      var section = wl.byKey[queue.key];
      if (!section) return;
      if (queue.title) {
        var heading = E.worklistHeading({
          title: queue.title,
          count: section.total,
          totalEligible: wl.totalEligible,
          business: labels.business,
          objective: labels.objective,
          market: labels.market,
          budget: labels.budget
        });
        if (queue.heading.textContent !== heading) queue.heading.textContent = heading;
      }
      // Only the rows are replaced. The caption, the column headings and the
      // download link beneath the table are the section's own furniture and
      // survive every recompute.
      var stale = Array.prototype.slice.call(queue.body.querySelectorAll('tr'));
      stale.forEach(function (node) {
        if (node.parentNode) node.parentNode.removeChild(node);
      });
      section.rows.forEach(function (entry) {
        queue.body.appendChild(renderRow(E.worklistRow(entry, queue.key, countryName)));
      });
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

    var summary = E.summaryText({
      size: size,
      business: state.labels.business,
      objective: state.labels.objective,
      market: state.labels.market,
      budget: state.labels.budget,
      evidence: state.labels.evidence,
      totalEligible: result.totalEligible,
      picked: result.picked.length
    });
    // Written only when it CHANGED. Six controls, and several of them can leave
    // the sentence identical — measured: cycling the campaign size between two
    // values that both exhaust the eligible set rewrites the same string. A
    // polite live region re-announces on every textContent assignment, whether
    // or not the text moved, so an unconditional write turns "no change" into an
    // announcement.
    if (statusEl.textContent !== summary) statusEl.textContent = summary;
    renderGroups(result.groups);
    // Computed after the campaign and from the same state object, so the three
    // worklist sections and the campaign can only ever describe one state. The
    // evidence level is deliberately NOT passed: it is the campaign's admission
    // floor, and sections 4 and 5 are what shows the reader what it is holding
    // back — the engine documents the decision beside worklist().
    renderQueues(E.worklist(data, ctx), state.labels);
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

    // ── THE SUMMARY BECOMES A LIVE REGION, AND ONLY NOW ──────────────────────
    //
    // Section 3 and the sentence above it are rebuilt on every control change:
    // measured, one change replaces the whole campaign — up to 100 list items
    // across four groups — and the only text that states what happened is this
    // paragraph. Without a live region a screen reader hears nothing at all,
    // and the reader has to go looking for a section that may have moved. The
    // Research Center collection pages have announced their count since they
    // shipped (role="status" aria-live="polite" on .bd-status); this page had
    // no aria-live anywhere on it — measured: 0 occurrences in the generated
    // markup, in all four locales.
    //
    // Promoted HERE, after the boot render, for two reasons. The generator
    // cannot do it: without JavaScript the paragraph never changes, and a live
    // region over static text is furniture that announces nothing. And doing it
    // before apply('replace') would announce the boot summary — which either
    // repeats the prerendered sentence a reader has already been given, or, on
    // a shared link, duplicates a page load. A live region should speak when
    // something the reader did changed the answer, and not before.
    statusEl.setAttribute('role', 'status');
    statusEl.setAttribute('aria-live', 'polite');

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
