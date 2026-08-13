/* eslint-disable */
// Tender Discovery & Search v1 — the deterministic search core.
//
// ── ONE IMPLEMENTATION, TWO RUNTIMES ────────────────────────────────────────
//
// This file is a UMD module on purpose. Node requires it for tests; the
// generator copies it VERBATIM to js/tender-search.js for the browser. There is
// exactly one scoring implementation, because two of them drift and then the
// server-rendered page and the filtered page disagree about which tender is
// most relevant — with no way to say which is right.
//
// ── TWO SCORES THAT ARE NOT THE SAME SCORE ──────────────────────────────────
//
// SEARCH RELEVANCE — how well a record matches the words typed.
// SUPPLIER-PROFILE MATCH — how relevant the procurement is to a supplier.
//
// A query for "cable" can match a title perfectly and mean nothing to a telecom
// supplier; a tender can be a strong telecom match and contain none of the
// query words. They are computed separately, displayed separately, and never
// blended into one number. Sorting by relevance with a profile selected filters
// by the profile and orders by relevance — it does not average them.
//
// ── WHAT IS NOT HERE ────────────────────────────────────────────────────────
//
// No currency conversion. No industry labels. No thresholds of its own — the
// Strong/Good bands come from the matching engine and are passed in. This
// module consumes intelligence; it does not produce any.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TenderSearch = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ── QUERY NORMALIZATION ───────────────────────────────────────────────────
  //
  // Comparison-only. Nothing here is written back to a record: normalization
  // exists so "Ingénierie" finds "INGENIERIE", not so the corpus changes.
  //
  // Diacritics are folded and case is lowered. Digits are preserved intact,
  // because a CPV code is an identifier and 45000000 must not become 45.
  function normalize(text) {
    return String(text == null ? '' : text)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  }

  // A query is a set of terms plus, if the user quoted something, a phrase.
  // Terms of one character are dropped: they match nearly everything and turn
  // a search into a scan.
  function parseQuery(raw) {
    var s = String(raw == null ? '' : raw);
    // Hard bound. A megabyte-long q must not become a megabyte of work.
    if (s.length > 200) s = s.slice(0, 200);
    var phrases = [];
    s = s.replace(/"([^"]{1,120})"/g, function (_, p) { phrases.push(normalize(p)); return ' '; });
    var terms = normalize(s).split(' ').filter(function (t) { return t.length > 1; });
    // Bounded term count: pathological queries cannot fan out indefinitely.
    return { terms: terms.slice(0, 12), phrases: phrases.filter(Boolean).slice(0, 3) };
  }

  // ── HYDRATION ─────────────────────────────────────────────────────────────
  //
  // The published index carries ORIGINAL titles and buyer names, because the
  // page has to display them and a stored normalized copy is a second version
  // of a canonical fact that can drift from it. Scoring needs normalized text.
  // Hydration bridges the two, once, at load.
  //
  // Doing it here rather than in the generator means there is exactly one
  // normalization implementation, shared by the browser and by Node. If it
  // lived in the generator, the text the engine scored would have been
  // normalized by a different copy of these rules than the text a test
  // normalizes, and the two would drift silently.
  //
  // Idempotent: hydrating an already-hydrated index is a no-op, so a page that
  // reloads its index does not re-derive or double-apply anything.
  function hydrate(index) {
    var records = index.records || [];
    for (var i = 0; i < records.length; i += 1) {
      var r = records[i];
      if (r.t !== undefined) continue;
      r.t = normalize(r.ti);
      r.b = normalize(r.bu);
      r.l = normalize(r.la);
      r.d = normalize(r.de);
      r.c = normalize(r.cd);
      r.g = normalize([r.co, r.pc].filter(Boolean).join(' '));
      r.src = r.sr;
      r.cur = r.cu;
      r.v = r.vl;
      r.p = r.pb;
      r.sch = r.sc;
      // The published index omits false and default values to save bytes, so
      // a reader sees `undefined` where the fact is "no". Restoring the
      // defaults here means every consumer works with one record shape rather
      // than each having to remember which fields the serializer dropped.
      r.m = r.m || {};
      r.bc = r.bc === true;
      r.ms = r.ms === true;
      r.oc = r.oc || 1;
      if (r.dl === undefined) r.dl = null;
      // No per-notice documents fact exists in the canonical model. The
      // absence is left as absence rather than being reported as "no
      // documents", which would be a negative fact nobody established.
      r.doc = null;
    }
    return index;
  }

  // ── RELEVANCE ─────────────────────────────────────────────────────────────
  //
  // Explicit weights. A title hit outranks a description hit because the title
  // is what the buyer chose to call the procurement; a classification code hit
  // is worth most of all because a code is unambiguous where a word is not.
  var WEIGHTS = {
    phraseTitle: 60,
    phraseAny: 25,
    code: 40,
    title: 12,
    buyer: 8,
    classificationLabel: 5,
    country: 3,
    description: 2,
  };

  // ── WHERE A TERM IS ALLOWED TO MATCH ──────────────────────────────────────
  //
  // Normalized text is space-separated tokens, so a token boundary is a space.
  //
  // A term matches at the START of a token, not anywhere inside one. Plain
  // substring matching looked reasonable and was badly wrong in practice:
  // "ice" matched 3,994 of 6,964 records through servICEs, offICE and polICE,
  // and the two tenders actually about ice ranked 177th and 1,645th. Prefix
  // matching keeps the useful case — "construct" still finds "construction" —
  // and drops the accidental one, because no useful word ENDS the way a
  // different word begins.
  function hasPrefix(text, term) {
    if (text.lastIndexOf(term, 0) === 0) return true;
    return text.indexOf(' ' + term) !== -1;
  }

  // Whole-token equality, for identifiers where a partial match is meaningless.
  function hasToken(text, term) {
    return (' ' + text + ' ').indexOf(' ' + term + ' ') !== -1;
  }

  function scoreRecord(rec, q) {
    if (!q.terms.length && !q.phrases.length) return 0;
    var score = 0;
    var i, t;

    // A phrase is checked against each searchable field in turn rather than
    // against one pre-concatenated blob. The blob was the original design and
    // it doubled the index — 9.31 MB against 4.07 MB — for a payload the
    // browser downloads, because every word was stored twice.
    for (i = 0; i < q.phrases.length; i += 1) {
      var p = q.phrases[i];
      if (rec.t && rec.t.indexOf(p) !== -1) score += WEIGHTS.phraseTitle;
      else if ((rec.b && rec.b.indexOf(p) !== -1)
        || (rec.l && rec.l.indexOf(p) !== -1)
        || (rec.d && rec.d.indexOf(p) !== -1)) score += WEIGHTS.phraseAny;
    }

    for (i = 0; i < q.terms.length; i += 1) {
      t = q.terms[i];
      // An exact code match is the strongest single signal available — and it
      // has to be exact. A plain substring test gave the full 40 points to
      // "45" for matching inside 45000000, 45220000 and 33645000 alike: 906
      // records, not one of which carries the code 45.
      if (rec.c && hasToken(rec.c, t) && /^\d{2,10}$/.test(t)) score += WEIGHTS.code;
      if (rec.t && hasPrefix(rec.t, t)) score += WEIGHTS.title;
      if (rec.b && hasPrefix(rec.b, t)) score += WEIGHTS.buyer;
      if (rec.l && hasPrefix(rec.l, t)) score += WEIGHTS.classificationLabel;
      if (rec.g && hasPrefix(rec.g, t)) score += WEIGHTS.country;
      if (rec.d && hasPrefix(rec.d, t)) score += WEIGHTS.description;
    }
    return score;
  }

  // ── FILTERS ───────────────────────────────────────────────────────────────
  //
  // Every filter reads a canonical fact. None of them invents one, and the
  // tri-states stay tri-state: an `unknown` electronic-submission value is
  // matched by the `unknown` filter and by nothing else. Collapsing it into
  // `no` would tell a supplier a procedure excludes electronic bids when the
  // notice simply did not say.
  var STATUS_CURRENT = { OPEN: 1, UPCOMING: 1 };

  function matchesFilters(rec, f) {
    if (f.status) {
      if (rec.s !== f.status) return false;
    } else if (!STATUS_CURRENT[rec.s]) {
      // The default universe is current opportunities. Awarded, cancelled and
      // closed records exist in the index for explicit status queries only,
      // and can never arrive by default.
      return false;
    }
    if (f.country && rec.co !== f.country) return false;
    if (f.projectCountry && rec.pc !== f.projectCountry) return false;
    if (f.source && rec.src !== f.source) return false;
    if (f.platform && rec.pl !== f.platform) return false;
    // Whole-scheme equality. A substring test made scheme="C" match both CPV
    // and UNSPSC, and scheme="SP" match UNSPSC.
    if (f.scheme && (!rec.sch || !hasToken(rec.sch.split(',').join(' '), f.scheme))) return false;
    if (f.esubmission && (rec.es || 'unknown') !== f.esubmission) return false;
    if (f.documents && (rec.doc ? 'yes' : 'unknown') !== f.documents) return false;
    if (f.browserCheck === 'yes' && !rec.bc) return false;
    if (f.browserCheck === 'no' && rec.bc) return false;
    if (f.currency && (!rec.cur || rec.cur !== f.currency)) return false;
    if (f.hasValue === 'yes' && !rec.cur) return false;

    if (f.deadlineDays) {
      // Only a deadline that resolved to a real instant may be compared. A
      // zoneless date spans 26 hours and cannot be placed inside a 7-day
      // window honestly, so those records are excluded from a deadline filter
      // rather than guessed into it.
      if (rec.dl == null) return false;
      if (rec.dl < 0 || rec.dl > f.deadlineDays) return false;
    }

    if (f.profile) {
      // hasOwnProperty, not a truthiness test: rec.m comes from JSON.parse, so
      // rec.m['__proto__'] is Object.prototype — truthy — and a nonexistent
      // profile returned all 6,964 records labelled as matching it.
      var m = rec.m && Object.prototype.hasOwnProperty.call(rec.m, f.profile)
        ? rec.m[f.profile] : null;
      if (!m) return false;
      // Bands come from the matching engine and are stored per record. This
      // module does not know what score makes a match Strong.
      if (f.matchBand && m !== f.matchBand) return false;
    }
    return true;
  }

  // ── SORTING ───────────────────────────────────────────────────────────────
  //
  // Every comparator ends in an id tiebreak, so identical data always produces
  // identical order. Without it, two builds could disagree purely on the array
  // order the corpus happened to arrive in.
  // Deadline ordering key. Three tiers, in this order: live deadlines soonest
  // first, then deadlines already passed, then deadlines that never resolved.
  //
  // Sorting on the raw number put the MOST expired notice first — a tender
  // whose deadline passed 86 days ago outranked 191 live ones with the same
  // relevance. The engine already treats dl < 0 as expired when filtering, so
  // ranking it top contradicted its own rule.
  function deadlineKey(r) {
    if (r.dl == null) return [2, 0];
    if (r.dl < 0) return [1, -r.dl];
    return [0, r.dl];
  }

  function byDeadline(a, b) {
    var ka = deadlineKey(a);
    var kb = deadlineKey(b);
    if (ka[0] !== kb[0]) return ka[0] - kb[0];
    return ka[1] - kb[1];
  }

  function comparator(sort, hasQuery) {
    var byId = function (a, b) { return a.i < b.i ? -1 : a.i > b.i ? 1 : 0; };
    if (sort === 'deadline') {
      return function (a, b) {
        // Records without a comparable deadline sort last rather than being
        // given a fabricated date; expired ones sort after the live ones.
        var d = byDeadline(a, b);
        return d !== 0 ? d : byId(a, b);
      };
    }
    if (sort === 'published') {
      return function (a, b) {
        var av = a.p || '';
        var bv = b.p || '';
        return av === bv ? byId(a, b) : (av < bv ? 1 : -1);
      };
    }
    if (sort === 'value') {
      // Cross-currency numeric sorting is refused upstream (see search()).
      return function (a, b) {
        var av = a.v == null ? -Infinity : a.v;
        var bv = b.v == null ? -Infinity : b.v;
        return av !== bv ? bv - av : byId(a, b);
      };
    }
    return function (a, b) {
      if (hasQuery && a._r !== b._r) return b._r - a._r;
      var d = byDeadline(a, b);
      return d !== 0 ? d : byId(a, b);
    };
  }

  var PAGE_SIZE = 25;

  // ── THE ENTRY POINT ───────────────────────────────────────────────────────
  function search(index, params) {
    var p = params || {};
    var q = parseQuery(p.q);
    var hasQuery = q.terms.length > 0 || q.phrases.length > 0;
    var f = p.filters || {};
    var notices = [];

    // Value sorting across currencies would rank 2,000,000 CZK above 100,000
    // EUR. There is no FX subsystem and inventing one is out of scope, so the
    // sort is refused unless a single currency has been chosen — and the
    // refusal is reported rather than silently ignored.
    // An unknown sort is not echoed back: the response must describe what the
    // engine actually did.
    var sort = p.sort || 'relevance';
    if (ENUMS.sort.indexOf(sort) === -1) sort = 'relevance';
    if (sort === 'value' && !f.currency) {
      sort = 'deadline';
      notices.push('VALUE_SORT_REQUIRES_CURRENCY');
    }

    var out = [];
    for (var i = 0; i < index.records.length; i += 1) {
      var rec = index.records[i];
      if (!matchesFilters(rec, f)) continue;
      if (hasQuery) {
        var r = scoreRecord(rec, q);
        if (r <= 0) continue;
        rec._r = r;
      } else {
        rec._r = 0;
      }
      out.push(rec);
    }

    out.sort(comparator(sort, hasQuery));

    var total = out.length;
    var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    var page = Math.floor(Number(p.page) || 1);
    if (!isFinite(page) || page < 1) page = 1;
    if (page > pages) page = pages;
    var start = (page - 1) * PAGE_SIZE;

    return {
      total: total,
      page: page,
      pages: pages,
      pageSize: PAGE_SIZE,
      sort: sort,
      hasQuery: hasQuery,
      notices: notices,
      results: out.slice(start, start + PAGE_SIZE),
    };
  }

  // ── URL STATE ─────────────────────────────────────────────────────────────
  //
  // Serialized in a fixed key order so the same state always produces the same
  // URL — otherwise a "shareable link" differs depending on which control the
  // user touched first, and two identical searches look like two searches.
  var PARAM_ORDER = ['q', 'status', 'country', 'projectCountry', 'source', 'platform',
    'scheme', 'profile', 'matchBand', 'deadlineDays', 'esubmission', 'documents',
    'browserCheck', 'currency', 'hasValue', 'sort', 'page'];

  var ENUMS = {
    status: ['OPEN', 'UPCOMING', 'CLOSED', 'AWARDED', 'CANCELLED', 'UNKNOWN'],
    matchBand: ['STRONG', 'GOOD', 'MODERATE', 'WEAK', 'MINIMAL'],
    esubmission: ['yes', 'no', 'unknown'],
    documents: ['yes', 'unknown'],
    browserCheck: ['yes', 'no'],
    hasValue: ['yes'],
    sort: ['relevance', 'deadline', 'published', 'value'],
    deadlineDays: ['7', '30', '90'],
  };

  // Hostile input is expected. An unknown key is dropped, an invalid enum is
  // dropped, and neither is echoed anywhere — the parsed state is a whitelist,
  // not a sanitized copy of what arrived.
  function parseState(searchParams, known) {
    var get = function (k) {
      if (!searchParams) return null;
      // Duplicate parameters: the FIRST wins, deterministically. Taking the
      // last would let ?status=OPEN&status=AWARDED smuggle a state past a
      // reader who saw only the first.
      var v = typeof searchParams.getAll === 'function' ? searchParams.getAll(k)[0]
        : (typeof searchParams.get === 'function' ? searchParams.get(k) : searchParams[k]);
      return v == null ? null : String(v);
    };
    var state = { q: '', filters: {}, sort: 'relevance', page: 1 };
    var raw = get('q');
    if (raw) state.q = raw.slice(0, 200);

    for (var i = 0; i < PARAM_ORDER.length; i += 1) {
      var key = PARAM_ORDER[i];
      if (key === 'q' || key === 'page') continue;
      var val = get(key);
      if (val == null || val === '') continue;
      if (ENUMS[key] && ENUMS[key].indexOf(val) === -1) continue;
      if (key === 'sort') { state.sort = val; continue; }
      if (known) {
        if (key === 'country' && known.countries && known.countries.indexOf(val) === -1) continue;
        if (key === 'projectCountry' && known.projectCountries && known.projectCountries.indexOf(val) === -1) continue;
        if (key === 'source' && known.sources && known.sources.indexOf(val) === -1) continue;
        if (key === 'platform' && known.platforms && known.platforms.indexOf(val) === -1) continue;
        if (key === 'profile' && known.profiles && known.profiles.indexOf(val) === -1) continue;
        if (key === 'currency' && known.currencies && known.currencies.indexOf(val) === -1) continue;
        if (key === 'scheme' && known.schemes && known.schemes.indexOf(val) === -1) continue;
      }
      state.filters[key] = key === 'deadlineDays' ? Number(val) : val;
    }
    var pg = Number(get('page'));
    state.page = isFinite(pg) && pg >= 1 ? Math.floor(pg) : 1;
    return state;
  }

  function serializeState(state) {
    var parts = [];
    for (var i = 0; i < PARAM_ORDER.length; i += 1) {
      var k = PARAM_ORDER[i];
      var v = k === 'q' ? state.q : (k === 'sort' ? state.sort : (k === 'page' ? state.page : (state.filters || {})[k]));
      if (v == null || v === '' || (k === 'sort' && v === 'relevance') || (k === 'page' && v === 1)) continue;
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
    }
    return parts.length ? '?' + parts.join('&') : '';
  }

  return {
    WEIGHTS: WEIGHTS,
    PAGE_SIZE: PAGE_SIZE,
    PARAM_ORDER: PARAM_ORDER,
    ENUMS: ENUMS,
    STATUS_CURRENT: STATUS_CURRENT,
    normalize: normalize,
    parseQuery: parseQuery,
    hydrate: hydrate,
    scoreRecord: scoreRecord,
    matchesFilters: matchesFilters,
    comparator: comparator,
    search: search,
    parseState: parseState,
    serializeState: serializeState,
  };
}));
