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

  var data = null;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function renderGroups(groups) {
    // Remove the previously rendered groups only. The heading and the intro
    // paragraph are the section's own furniture and survive every recompute.
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

  function apply() {
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
    selects.forEach(function (select) { select.addEventListener('change', apply); });
    apply();
  }).catch(function () {
    // Deliberately silent and deliberately inert. The page is already correct.
  });
}());
