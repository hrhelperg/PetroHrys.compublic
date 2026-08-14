'use strict';

// The Distribution Planner decision engine — the one implementation, shipped to
// both the generator and the browser.
//
// ── WHY THIS IS ITS OWN MODULE ──────────────────────────────────────────────
//
// The planner page offers six controls and, until this file existed, recomputed
// nothing: the campaign in section 3 was rendered once at build time for one
// hardcoded query, the summary paragraph said "United States" as a literal, and
// the evidence control was wired to nothing at all. The obvious repair — write a
// client that filters and re-ranks the prerendered rows — is the repair that
// creates two engines. The moment the browser scores an opportunity with its own
// copy of the rules, the page and the CSV export start disagreeing about what
// the campaign is, and nothing can tell you which one is right.
//
// So the DECISION lives here, once, as pure functions over plain objects, and it
// is shipped to the browser byte-for-byte as js/dp-engine.js — the same UMD
// pattern bd-discovery.cjs uses. scripts/lib/distribution-planner.cjs and
// scripts/lib/distribution-actionability.cjs re-export from this file rather
// than holding a second copy, so server and browser cannot drift.
//
// ── WHAT IS AND IS NOT HERE ─────────────────────────────────────────────────
//
// Here: everything that decides. Fit, exclusion, score, actionability, grouping,
// selection, and the sentence that reports the result.
//
// Not here: anything that reads a file, and anything that KNOWS a source schema.
// The three collections are read and adapted by distribution-planner.cjs, which
// owns the adaptors and the loader; this module only ever sees the projected
// shape those adaptors emit. That is what makes it safe to hand to a browser
// that has no filesystem and must never receive a canonical dataset.
//
// The engine reads a small, fixed set of fields, declared at the bottom of this
// file as FIELD_CONTRACT and asserted against the code by a test that records
// every property access over all 2,234 opportunities. The generator projects
// exactly those fields into research/distribution-planner/planner-data.json, so
// the browser is fed no field the engine cannot use and none it can.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DPEngine = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  // Code-unit ordering, identical to media-schema's comparator. localeCompare
  // would make the campaign depend on host ICU, and the browser's ICU is not the
  // build machine's — the same query would then produce a different order on the
  // page than in the CSV.
  const compareStable = (a, b) => {
    const as = String(a === null || a === undefined ? '' : a);
    const bs = String(b === null || b === undefined ? '' : b);
    if (as < bs) return -1;
    if (as > bs) return 1;
    return 0;
  };

  const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

  // ── vocabulary mirrored from bd-schema ────────────────────────────────────
  //
  // bd-schema.cjs owns these three lists and is a 1,200-line module that reads
  // the registry; it cannot be shipped to a browser and this file may not
  // require anything. So the values are mirrored here and a test asserts they
  // are deep-equal to bd-schema's, which turns a silent divergence into a build
  // failure. They are used only to REJECT values outside the vocabulary, so a
  // stale copy could only ever discard a newly-valid value — never invent one.
  const VERIFICATION_METHODS = ['email', 'phone', 'sms', 'postcard', 'video',
    'documents', 'domain', 'identity', 'business-registration', 'other'];
  const SUBMISSION_DIFFICULTY = ['very-easy', 'easy', 'moderate', 'hard'];
  const REQUIRED_ASSET_KEYS = ['logo', 'website', 'description', 'categories',
    'contact', 'screenshots', 'businessVerification'];

  // ── the media recommendation model ────────────────────────────────────────
  //
  // Moved here from media-recommend.cjs, which now re-exports it. The planner's
  // media lane is scored by the SAME engine that powers the recommendation
  // pages, so this had to travel with the planner rather than be reimplemented
  // beside it.
  //
  // A profile may NEVER name a platform. The moment a profile can say
  // telecomPlatforms: ['UC Today'] it stops being a model and becomes a curated
  // list wearing a model's clothes, and the engine stops being reproducible.
  // Every profile declares only abstract requirements — categories, industries,
  // keywords, markets — and a test asserts the declarations contain no platform
  // id, name or host from the dataset.
  //
  // Two lessons are designed out here:
  //
  //   1. Proxying a business type through a flag that does not mean it. A
  //      sibling engine expressed "manufacturers" as accepts:['enterprise'] and
  //      put a machine-learning platform top of the manufacturer list. Here a
  //      profile with no honest category signal declares an empty category list
  //      and leans on industries and keywords instead.
  //   2. Ambiguous keywords. "practitioner" matched a legal directory and put it
  //      top of healthcare. Keywords here are checked for cross-profile collision.

  // An objective is a mapping from what you want to the opportunity types that
  // actually deliver it. This is where the dataset's refusal to flatten
  // opportunity types pays: a wire is excellent for distributing a release and
  // irrelevant for founder exposure, and the engine can say so.
  const MEDIA_OBJECTIVES = [
    { key: 'brand-awareness', label: 'Brand awareness', slug: 'brand-awareness',
      types: { 'editorial-pitch': 100, 'editorial-submission': 95, 'contributed-article': 90,
        'sponsored-content': 78, 'podcast-guest': 72, 'award-entry': 70, 'company-profile': 55,
        'press-release': 45, 'self-publish': 40 } },
    { key: 'product-launch', label: 'Product launch', slug: 'product-launch',
      types: { 'product-launch': 100, 'startup-launch': 92, 'press-release': 80,
        'editorial-pitch': 76, 'company-profile': 60, 'newsletter-submission': 58,
        'sponsored-content': 55, 'award-entry': 45 } },
    { key: 'founder-exposure', label: 'Founder exposure', slug: 'founder-exposure',
      types: { 'podcast-guest': 100, 'expert-source': 88, 'contributed-article': 86,
        'editorial-pitch': 80, 'journalist-source': 78, 'guest-application': 76,
        'award-entry': 50 } },
    { key: 'thought-leadership', label: 'Thought leadership', slug: 'thought-leadership',
      types: { 'contributed-article': 100, 'guest-application': 92, 'editorial-submission': 84,
        'expert-source': 76, 'podcast-guest': 70, 'self-publish': 52 } },
    { key: 'seo-visibility', label: 'Search visibility', slug: 'seo-visibility',
      // A durable indexed page with your name on it. A newsletter send is an
      // email; a podcast is audio. Neither is a page, and the score says so.
      types: { 'contributed-article': 100, 'editorial-submission': 92, 'self-publish': 82,
        'company-profile': 80, 'editorial-pitch': 78, 'award-entry': 70, 'press-release': 62,
        'product-launch': 60, 'sponsored-content': 58 } },
    { key: 'press-release-distribution', label: 'Press release distribution', slug: 'press-release-distribution',
      types: { 'press-release': 100, 'company-profile': 40, 'self-publish': 35 } },
    { key: 'lead-generation', label: 'Lead generation', slug: 'lead-generation',
      types: { 'sponsored-content': 92, 'newsletter-submission': 88, 'company-profile': 84,
        'product-launch': 76, 'contributed-article': 62, 'award-entry': 55 } },
    { key: 'expert-positioning', label: 'Expert positioning', slug: 'expert-positioning',
      types: { 'expert-source': 100, 'journalist-source': 96, 'contributed-article': 78,
        'podcast-guest': 70, 'guest-application': 66 } },
    { key: 'podcast-appearance', label: 'Podcast appearance', slug: 'podcast-appearance',
      types: { 'podcast-guest': 100, 'expert-source': 46 } },
    { key: 'newsletter-sponsorship', label: 'Newsletter sponsorship', slug: 'newsletter-sponsorship',
      types: { 'newsletter-submission': 96, 'sponsored-content': 92, 'media-partnership': 70 } },
    { key: 'contributed-content', label: 'Contributed content', slug: 'contributed-content',
      types: { 'contributed-article': 100, 'guest-application': 94, 'editorial-submission': 82,
        'self-publish': 58 } },
    { key: 'local-awareness', label: 'Local awareness', slug: 'local-awareness',
      types: { 'editorial-pitch': 96, 'press-release': 88, 'editorial-submission': 86,
        'company-profile': 70, 'contributed-article': 66, 'award-entry': 60 } },
  ];
  const MEDIA_OBJECTIVE_BY_KEY = new Map(MEDIA_OBJECTIVES.map((o) => [o.key, o]));

  // categories  — publication kinds that serve this business, from the registry vocabulary
  // industries  — sectors this business would be pitching ABOUT, from the registry vocabulary
  // keywords    — words whose presence in a platform's own prose indicates fit
  // markets     — where this kind of business usually needs coverage; '*' means anywhere
  const MEDIA_PROFILES = [
    { key: 'b2b-saas', slug: 'b2b-saas', label: 'B2B SaaS',
      categories: ['saas-media'],
      adjacent: ['technology-media', 'startup-media', 'developer-open-source-media', 'marketing-media'],
      industries: ['saas', 'software', 'cloud', 'devops'],
      keywords: ['saas', 'b2b software', 'enterprise software', 'cloud software', 'product management'],
      markets: ['*'] },
    { key: 'ai-startup', slug: 'ai-startup', label: 'AI startup',
      categories: ['ai-media'],
      adjacent: ['technology-media', 'startup-media', 'developer-open-source-media'],
      industries: ['ai'],
      keywords: ['artificial intelligence', 'machine learning', 'generative ai', 'ai research'],
      markets: ['*'] },
    { key: 'telecom-voip-ucaas', slug: 'telecom-voip-ucaas', label: 'Telecom, VoIP & UCaaS',
      categories: ['telecom-media'],
      adjacent: ['technology-media'],
      industries: ['telecom'],
      keywords: ['telecom', 'voip', 'ucaas', 'ccaas', 'cpaas', 'unified communications',
        'contact centre', 'contact center', 'cloud telephony', 'business phone', 'esim', 'carrier'],
      markets: ['*'] },
    { key: 'manufacturer', slug: 'manufacturer', label: 'Manufacturer',
      categories: ['manufacturing-media', 'industrial-media'],
      adjacent: ['engineering-media', 'construction-media'],
      industries: ['manufacturing', 'industrial', 'hardware', 'engineering'],
      keywords: ['manufactur', 'machining', 'metalwork', 'assembly', 'industrial', 'factory',
        'packaging', 'additive manufacturing', 'automation'],
      markets: ['*'] },
    { key: 'ecommerce', slug: 'ecommerce', label: 'Ecommerce & retail',
      categories: ['ecommerce-retail-media'],
      adjacent: ['marketing-media'],
      industries: ['ecommerce', 'retail'],
      keywords: ['ecommerce', 'e-commerce', 'retail', 'merchant', 'dtc', 'online retail', 'commerce'],
      markets: ['*'] },
    { key: 'startup', slug: 'startup', label: 'Early-stage startup',
      categories: ['startup-media', 'startup-launch-platform'],
      adjacent: ['contributor-platform', 'technology-media'],
      industries: ['saas', 'software'],
      keywords: ['startup', 'founder', 'seed', 'venture capital', 'early-stage', 'launch'],
      markets: ['*'] },
    { key: 'local-business', slug: 'local-business', label: 'Local business',
      categories: ['local-business-media'],
      adjacent: [],
      industries: ['general'],
      keywords: ['metropolitan', 'statewide', 'regional business', 'city business', 'local business'],
      markets: ['*'] },
    { key: 'hr-recruitment', slug: 'hr-recruitment', label: 'HR & recruitment',
      categories: ['hr-recruitment-media'],
      adjacent: [],
      industries: ['hr'],
      keywords: ['human resources', 'recruit', 'talent acquisition', 'staffing', 'workforce',
        'employment law', 'people leader'],
      markets: ['*'] },
    { key: 'cybersecurity', slug: 'cybersecurity', label: 'Cybersecurity',
      categories: ['cybersecurity-media'],
      adjacent: ['technology-media'],
      industries: ['cybersecurity'],
      keywords: ['cybersecurity', 'information security', 'infosec', 'threat', 'malware', 'ciso'],
      markets: ['*'] },
    { key: 'finance-fintech', slug: 'finance-fintech', label: 'Finance & fintech',
      categories: ['finance-media', 'fintech-media'],
      adjacent: ['global-business-media'],
      industries: ['finance', 'fintech', 'insurance'],
      keywords: ['fintech', 'banking', 'payments', 'capital markets', 'accounting', 'financial'],
      markets: ['*'] },
    { key: 'energy-cleantech', slug: 'energy-cleantech', label: 'Energy & cleantech',
      categories: ['energy-cleantech-media'],
      adjacent: ['industrial-media'],
      industries: ['energy'],
      keywords: ['renewable', 'solar', 'wind', 'energy storage', 'utility', 'grid', 'cleantech',
        'power generation'],
      markets: ['*'] },
    { key: 'agtech-food', slug: 'agtech-food', label: 'AgTech & food',
      categories: ['agriculture-food-media'],
      adjacent: ['manufacturing-media'],
      industries: ['agriculture'],
      keywords: ['agricultur', 'farm', 'agtech', 'food processing', 'produce', 'livestock'],
      markets: ['*'] },
    { key: 'hospitality-travel', slug: 'hospitality-travel', label: 'Hospitality & travel',
      categories: ['travel-hospitality-media'],
      adjacent: [],
      industries: ['hospitality', 'travel'],
      keywords: ['hotel', 'hospitality', 'travel industry', 'restaurant', 'foodservice', 'tourism'],
      markets: ['*'] },
    { key: 'healthcare', slug: 'healthcare', label: 'Healthcare',
      categories: ['healthcare-media'],
      adjacent: [],
      industries: ['healthcare', 'biotech'],
      // "practitioner" is deliberately absent: it reads as medical AND as legal,
      // and in a sibling engine it put a law directory top of healthcare.
      keywords: ['healthcare', 'hospital', 'medical device', 'health it', 'payer', 'provider', 'medtech'],
      markets: ['*'] },
    { key: 'legal', slug: 'legal', label: 'Legal',
      categories: ['legal-media'],
      adjacent: [],
      industries: ['legal'],
      keywords: ['law firm', 'legal industry', 'legal technology', 'litigation', 'general counsel'],
      markets: ['*'] },
    { key: 'marketing-agency', slug: 'marketing-agency', label: 'Marketing agency',
      categories: ['marketing-media', 'advertising-media'],
      adjacent: ['ecommerce-retail-media'],
      industries: ['marketing', 'advertising'],
      // "advertising" and "brand" are deliberately absent: they appear in almost
      // every platform's description of its OWN advertising sales, so they
      // matched ad-sales boilerplate rather than marketing coverage and put a
      // 3D-printing trade title into the marketing agency results.
      keywords: ['marketing', 'search marketing', 'martech', 'media buying', 'ad agency'],
      markets: ['*'] },
    { key: 'professional-services', slug: 'professional-services', label: 'Professional services',
      categories: ['global-business-media'],
      adjacent: ['local-business-media'],
      industries: ['general', 'finance', 'legal'],
      keywords: ['management', 'executive', 'consulting', 'professional services', 'business strategy'],
      markets: ['*'] },
  ];
  const MEDIA_PROFILE_BY_KEY = new Map(MEDIA_PROFILES.map((p) => [p.key, p]));

  // ── fit strengths (documented, ordered, testable) ─────────────────────────
  //
  // The split between PRIMARY and ADJACENT exists because the first version had
  // only one category tier, and every category a profile listed scored the same
  // 100. Three pathologies followed immediately, all the same defect:
  //   - B2B SaaS and AI startup returned IDENTICAL top tens, because both listed
  //     startup-media and regional startup outlets then tied with the specialist
  //     SaaS and AI publications;
  //   - the telecom page was led by general technology media, because
  //     technology-media scored exactly what telecom-media scored;
  //   - no AI-specific publication appeared on the AI page at all.
  // A profile's fifth-choice category is not its first choice.
  const FIT_CATEGORY = 100;  // primary: the kind of publication this business lives in
  const FIT_INDUSTRY = 78;   // the publication covers this sector
  const FIT_ADJACENT = 66;   // adjacent kind: sometimes right, never the first answer
  const FIT_KEYWORD = 55;    // the platform's own prose names this business's subject
  const FIT_GENERAL = 26;    // a general business publication: possible, unfocused
  const FIT_NONE = 10;       // no signal either way — low, but not an exclusion

  const haystack = (r) => `${r.name} ${r.shortNote} ${r.limitations || ''} ${r.categories.join(' ')}`
    .toLowerCase();

  function mediaBusinessFit(r, profile) {
    if (r.categories.some((c) => profile.categories.includes(c))) {
      return { value: FIT_CATEGORY, reason: `a specialist ${profile.label.toLowerCase()} publication` };
    }
    if (r.industries.some((i) => profile.industries.includes(i))) {
      return { value: FIT_INDUSTRY, reason: `covers the ${profile.industries.filter((i) => r.industries.includes(i)).join(', ')} sector` };
    }
    if (r.categories.some((c) => (profile.adjacent || []).includes(c))) {
      return { value: FIT_ADJACENT, reason: `an adjacent publication that sometimes covers ${profile.label.toLowerCase()}` };
    }
    const hay = haystack(r);
    const hit = profile.keywords.find((k) => hay.includes(k));
    if (hit) return { value: FIT_KEYWORD, reason: `its own description names "${hit}"` };
    if (r.categories.includes('global-business-media') || r.categories.includes('local-business-media')) {
      return { value: FIT_GENERAL, reason: 'a general business publication rather than a specialist one' };
    }
    return { value: FIT_NONE, reason: 'no established link to this kind of business' };
  }

  function mediaObjectiveFit(r, objective) {
    if (r.opportunityTypes.includes('unknown')) {
      // Unknown is not exclusion. It scores as a neutral mid-value so an
      // otherwise excellent platform is not buried for being under-researched.
      return { value: 45, reason: 'the route is not yet established, so objective fit is unproven', unknown: true };
    }
    const vals = r.opportunityTypes.map((t) => objective.types[t]).filter((v) => typeof v === 'number');
    if (!vals.length) {
      return { value: 0, reason: `offers nothing that delivers ${objective.label.toLowerCase()}`, excluded: true };
    }
    const best = Math.max(...vals);
    const which = r.opportunityTypes.find((t) => objective.types[t] === best);
    return { value: best, reason: `${which.replace(/-/g, ' ')} suits ${objective.label.toLowerCase()}` };
  }

  // ── planner metadata ──────────────────────────────────────────────────────
  const COLLECTIONS = [
    { key: 'directories', label: 'Business Directories', lane: 1,
      question: 'where a company creates or claims a professional profile',
      path: '/research/business-directories/opportunities/' },
    { key: 'marketplaces', label: 'Marketplace & Classified Platforms', lane: 2,
      question: 'where a company publishes a listing or an advertisement',
      path: '/research/marketplaces/' },
    { key: 'media', label: 'Media, PR & Publishing', lane: 3,
      question: 'where a company pitches, publishes, launches or sponsors',
      path: '/research/media-pr-publishing/' },
  ];
  const COLLECTION_BY_KEY = new Map(COLLECTIONS.map((c) => [c.key, c]));

  // Action types stay distinct on purpose. A planner that called all of these
  // "publish" would be lying about what the employee has to do.
  const ACTION_TYPES = {
    'create-listing': { label: 'Create a listing', lane: 1 },
    'claim-profile': { label: 'Claim an existing profile', lane: 1 },
    'apply-for-inclusion': { label: 'Apply for inclusion', lane: 1 },
    'post-advertisement': { label: 'Post an advertisement', lane: 2 },
    'create-seller-profile': { label: 'Create a seller profile', lane: 2 },
    'publish-classified': { label: 'Publish a classified listing', lane: 2 },
    'pitch-editor': { label: 'Pitch an editor', lane: 3 },
    'submit-news': { label: 'Submit company news', lane: 3 },
    'send-press-release': { label: 'Send a press release', lane: 3 },
    'contribute-article': { label: 'Contribute an article', lane: 3 },
    'launch-product': { label: 'Submit a product launch', lane: 3 },
    'register-as-source': { label: 'Register as an expert source', lane: 3 },
    'apply-podcast-guest': { label: 'Apply as a podcast guest', lane: 3 },
    'sponsor-placement': { label: 'Buy a sponsored placement', lane: 3 },
    'enter-award': { label: 'Enter an award', lane: 3 },
    'publish-profile': { label: 'Publish a company profile', lane: 3 },
    investigate: { label: 'Investigate the route', lane: 0 },
  };

  // Planner objectives. Each declares which collections can serve it at all —
  // this is the rule that stops a classified ad being offered as press coverage.
  const OBJECTIVES = [
    { key: 'seo-citations', label: 'SEO and citations', collections: ['directories', 'media'] },
    { key: 'brand-authority', label: 'Brand authority', collections: ['media', 'directories'] },
    { key: 'referral-traffic', label: 'Referral traffic', collections: ['directories', 'marketplaces', 'media'] },
    { key: 'lead-generation', label: 'Lead generation', collections: ['directories', 'marketplaces', 'media'] },
    { key: 'local-discovery', label: 'Local discovery', collections: ['directories', 'marketplaces'] },
    { key: 'product-launch', label: 'Product launch', collections: ['media', 'marketplaces'] },
    { key: 'pr-coverage', label: 'PR coverage', collections: ['media'] },
    { key: 'founder-visibility', label: 'Founder visibility', collections: ['media'] },
    { key: 'b2b-buyer-discovery', label: 'B2B buyer discovery', collections: ['directories', 'marketplaces', 'media'] },
    { key: 'marketplace-exposure', label: 'Marketplace exposure', collections: ['marketplaces'] },
    { key: 'classified-advertising', label: 'Classified advertising', collections: ['marketplaces'] },
  ];
  const OBJECTIVE_BY_KEY = new Map(OBJECTIVES.map((o) => [o.key, o]));

  // Which media objective each planner objective maps to, so the media lane is
  // scored by the SAME engine that powers the recommendation pages rather than a
  // second copy of the logic living here.
  const MEDIA_OBJECTIVE = {
    'seo-citations': 'seo-visibility',
    'brand-authority': 'brand-awareness',
    'referral-traffic': 'brand-awareness',
    'lead-generation': 'lead-generation',
    'local-discovery': 'local-awareness',
    'product-launch': 'product-launch',
    'pr-coverage': 'brand-awareness',
    'founder-visibility': 'founder-exposure',
    'b2b-buyer-discovery': 'lead-generation',
    'marketplace-exposure': null,
    'classified-advertising': null,
  };

  // Which accepts flag each canonical business profile maps to in the DIRECTORY
  // collection. Only declared where the flag genuinely means the business —
  // borrowing `enterprise` to mean "manufacturer" is the proxy defect that once
  // put a machine-learning platform top of a manufacturer list, and an empty
  // array here is the honest answer rather than a near-enough flag.
  const DIRECTORY_ACCEPTS = {
    'b2b-saas': ['saas'], 'ai-startup': ['ai', 'startup'], 'telecom-voip-ucaas': [],
    manufacturer: [], ecommerce: ['ecommerce'], startup: ['startup'],
    'local-business': ['localBusiness'], 'hr-recruitment': [], cybersecurity: [],
    'finance-fintech': [], 'energy-cleantech': [], 'agtech-food': [],
    'hospitality-travel': [], healthcare: [], legal: [],
    'marketing-agency': ['agency'], 'professional-services': ['agency', 'freelancer'],
  };

  // Which marketplace TYPES can carry which kind of business. The first version
  // scored marketplace fit from sellerTypes alone — business or private — so
  // every business-accepting marketplace fitted every business equally, and a
  // telecom software company was offered a wholesale homeware marketplace at 88.
  // Seller type says WHO may list; it says nothing about WHAT.
  //
  // An empty array means the collection holds no marketplace type that carries
  // this business, which is an honest answer and produces no marketplace lane.
  // The marketplace collection's `b2b` type means B2B GOODS trading — its
  // vocabulary cannot distinguish that from B2B services or software, and it
  // does not need to: nobody lists enterprise telephony on a wholesale
  // marketplace. So the software-shaped profiles declare [], the collection
  // contributes no marketplace lane for them, and the planner says so.
  //
  // This is a limitation of the source vocabulary recorded honestly, not a
  // ranking hack: no platform is named, and widening the vocabulary later would
  // change the answer automatically.
  const MARKETPLACE_TYPES_FOR = {
    'b2b-saas': [],
    'ai-startup': [],
    'telecom-voip-ucaas': [],
    cybersecurity: [],
    startup: [],
    manufacturer: ['b2b'],
    ecommerce: ['b2b', 'general-classifieds', 'fashion-resale', 'second-hand', 'auctions'],
    'local-business': ['services', 'general-classifieds'],
    'hr-recruitment': ['jobs', 'services'],
    'finance-fintech': ['services'],
    'energy-cleantech': ['b2b'],
    'agtech-food': ['b2b'],
    'hospitality-travel': ['services', 'property'],
    healthcare: ['services'],
    legal: ['services'],
    'marketing-agency': ['services'],
    'professional-services': ['services'],
  };

  const BUDGETS = [
    { key: 'free-only', label: 'Free only', accepts: ['free'] },
    { key: 'free-freemium', label: 'Free or freemium', accepts: ['free', 'freemium'] },
    { key: 'paid-allowed', label: 'Paid allowed', accepts: ['free', 'freemium', 'mixed', 'paid'] },
    { key: 'any', label: 'Any, including unknown cost', accepts: null },
  ];
  const BUDGET_BY_KEY = new Map(BUDGETS.map((b) => [b.key, b]));

  // ── fit ───────────────────────────────────────────────────────────────────

  function businessFit(op, profileKey) {
    const profile = MEDIA_PROFILE_BY_KEY.get(profileKey);
    if (!profile) throw new Error(`Unknown business profile: ${profileKey}`);
    if (op.sourceCollection === 'media') {
      const bf = mediaBusinessFit(op.record, profile);
      return { value: bf.value, reason: bf.reason };
    }
    if (op.sourceCollection === 'directories') {
      const flags = DIRECTORY_ACCEPTS[profileKey] || [];
      const accepted = flags.filter((f) => op.accepts[f] === true);
      if (accepted.length) {
        return { value: FIT_CATEGORY, reason: `explicitly accepts ${accepted.join(', ')} businesses` };
      }
      if (flags.some((f) => op.accepts[f] === false)) {
        return { value: 0, reason: 'explicitly does not accept this kind of business', excluded: true };
      }
      if (op.category === 'local-business') {
        return { value: FIT_ADJACENT, reason: 'a general local-business directory' };
      }
      return { value: FIT_GENERAL, reason: 'a general directory with no stated business-type rule' };
    }
    // Marketplaces: WHO may list, and WHAT the marketplace carries. Both must
    // hold — a vehicles classifieds site accepting business sellers is still not
    // a place to list enterprise software.
    if (op.sellerTypes === 'private') {
      return { value: 0, reason: 'accepts private sellers only, not companies', excluded: true };
    }
    const fitting = MARKETPLACE_TYPES_FOR[profileKey] || [];
    const types = [op.marketplaceType, ...(op.alsoCovers || [])];
    if (!fitting.length) {
      return { value: 0, excluded: true,
        reason: 'this collection holds no marketplace type that carries this kind of business' };
    }
    if (!fitting.some((t) => types.includes(t))) {
      return { value: 0, excluded: true,
        reason: `carries ${op.marketplaceType.replace(/-/g, ' ')} listings, which is not what this business sells` };
    }
    const strength = op.sellerTypes === 'business' ? FIT_CATEGORY : FIT_ADJACENT;
    return { value: strength,
      reason: `carries ${op.marketplaceType.replace(/-/g, ' ')} listings and accepts ${op.sellerTypes === 'business' ? 'business' : 'business and private'} sellers` };
  }

  function objectiveFit(op, objectiveKey) {
    const objective = OBJECTIVE_BY_KEY.get(objectiveKey);
    if (!objective) throw new Error(`Unknown objective: ${objectiveKey}`);
    if (!objective.collections.includes(op.sourceCollection)) {
      const c = COLLECTION_BY_KEY.get(op.sourceCollection);
      return { value: 0, excluded: true,
        reason: `${c.label} cannot deliver ${objective.label.toLowerCase()}` };
    }
    if (op.sourceCollection === 'media') {
      const mediaKey = MEDIA_OBJECTIVE[objectiveKey];
      if (!mediaKey) return { value: 0, excluded: true, reason: 'not a media objective' };
      const of = mediaObjectiveFit(op.record, MEDIA_OBJECTIVE_BY_KEY.get(mediaKey));
      return { value: of.value, reason: of.reason, excluded: of.excluded };
    }
    if (op.sourceCollection === 'directories') {
      // A directory delivers a citation and a profile. It does not deliver
      // coverage, and the objective list above already refuses those.
      const V = { 'seo-citations': 96, 'local-discovery': 92, 'b2b-buyer-discovery': 76,
        'referral-traffic': 68, 'lead-generation': 64, 'brand-authority': 52 };
      let v = V[objectiveKey];
      if (typeof v !== 'number') return { value: 0, excluded: true, reason: 'not a directory objective' };
      // A general local-business directory is excellent for local discovery and
      // weak for reaching B2B buyers. Without this the German phone books
      // outranked a specialist manufacturing publication for buyer discovery,
      // because every directory scored the same 76 whatever it was a directory OF.
      if (op.category === 'local-business'
        && ['b2b-buyer-discovery', 'brand-authority'].includes(objectiveKey)) {
        v = Math.round(v * 0.45);
        return { value: v, reason: 'a general local directory, which reaches consumers rather than B2B buyers' };
      }
      if (op.actionType === 'investigate') {
        return { value: Math.round(v * 0.55), reason: 'the listing route is not established, so this is a lead rather than a task' };
      }
      return { value: v, reason: `${ACTION_TYPES[op.actionType].label.toLowerCase()} serves ${objective.label.toLowerCase()}` };
    }
    const V = { 'marketplace-exposure': 96, 'classified-advertising': 94, 'lead-generation': 82,
      'local-discovery': 78, 'referral-traffic': 70, 'product-launch': 58, 'b2b-buyer-discovery': 66 };
    const v = V[objectiveKey];
    if (typeof v !== 'number') return { value: 0, excluded: true, reason: 'not a marketplace objective' };
    return { value: v, reason: `${ACTION_TYPES[op.actionType].label.toLowerCase()} serves ${objective.label.toLowerCase()}` };
  }

  function geographyFit(op, market) {
    if (!market || market === '*') return { value: 70, reason: 'no market filter applied' };
    if (op.country === market) return { value: 100, reason: 'published in the target market' };
    if (op.country === 'global') return { value: 82, reason: 'a global platform' };
    if (op.audienceGeography === 'global') return { value: 78, reason: 'global audience reaches the target market' };
    if (op.audienceGeography === 'regional') return { value: 44, reason: 'regional audience may not reach the target market' };
    return { value: 16, reason: 'serves a different market' };
  }

  function costFit(op, budgetKey) {
    const budget = BUDGET_BY_KEY.get(budgetKey) || BUDGET_BY_KEY.get('any');
    if (!budget.accepts) return { ok: true, reason: `cost: ${op.cost}` };
    if (op.cost === 'unknown') {
      // Unknown cost is not a refusal. Under a free-only budget it is a caveat,
      // priced as uncertainty rather than excluded — the employee is told.
      return { ok: true, uncertain: true, reason: 'cost not established; confirm before committing' };
    }
    if (budget.accepts.includes(op.cost)) return { ok: true, reason: `cost: ${op.cost}` };
    return { ok: false, reason: `costs ${op.cost}, outside the ${budget.label.toLowerCase()} budget` };
  }

  // ── planner score ─────────────────────────────────────────────────────────
  // Fit first, native quality second. Documented and deterministic, and it never
  // pretends the three native qualities are the same measurement — quality only
  // scales a result that already fits.
  const UNRATED_QUALITY = 52;
  const UNRATED_DISCOUNT = 0.78;

  function scoreOpportunity(op, { business, objective, market = '*', budget = 'any' }) {
    const bf = businessFit(op, business);
    const of = objectiveFit(op, objective);
    const gf = geographyFit(op, market);
    const cf = costFit(op, budget);

    const exclusions = [];
    if (bf.excluded) exclusions.push(bf.reason);
    if (of.excluded) exclusions.push(of.reason);
    if (!cf.ok) exclusions.push(cf.reason);
    if (op.evidence === 'dead') exclusions.push('the platform is no longer operating');
    if (exclusions.length) {
      return { score: 0, excluded: true, reasons: exclusions, businessFit: bf, objectiveFit: of,
        geographyFit: gf, costFit: cf };
    }

    const fit = (bf.value * 0.40) + (of.value * 0.35) + (gf.value * 0.25);
    const quality = op.nativeQuality === null ? UNRATED_QUALITY * UNRATED_DISCOUNT : op.nativeQuality;
    let score = (fit / 100) * quality * 1.2;
    if (op.actionUrl) score += 4;                   // a route you can click today
    if (op.evidence === 'needs-browser-check') score -= 6;
    if (cf.uncertain) score -= 4;

    const reasons = [bf.reason, of.reason, gf.reason, cf.reason, op.nativeSignal];
    if (!op.actionUrl) reasons.push('no action URL is recorded in the source collection');
    if (op.evidence === 'needs-browser-check') reasons.push('behind a bot filter — confirm in a browser');
    return { score: clamp(score), excluded: false, reasons, businessFit: bf, objectiveFit: of,
      geographyFit: gf, costFit: cf };
  }

  // ── the plan ──────────────────────────────────────────────────────────────
  // Groups are derived from canonical facts, never from a curated name list.
  const GROUPS = [
    { key: 'quick-wins', label: 'Quick wins',
      blurb: 'High fit, low friction: a route you can act on today, at no cost, with no editor in the way.',
      test: (op, s) => s.score >= 55 && op.actionUrl && ['free', 'freemium'].includes(op.cost)
        && op.actionType !== 'investigate'
        && !['pitch-editor', 'contribute-article', 'submit-news', 'enter-award'].includes(op.actionType) },
    { key: 'authority-plays', label: 'Authority plays',
      blurb: 'Selective opportunities where an editor decides. Slower and worth more when they land.',
      test: (op, s) => s.score >= 50
        && ['pitch-editor', 'contribute-article', 'submit-news', 'enter-award'].includes(op.actionType) },
    { key: 'local-coverage', label: 'Local and market coverage',
      blurb: 'Surfaces that make a company findable in the target market.',
      test: (op, s, ctx) => s.score >= 45 && ctx.market !== '*' && op.country === ctx.market },
    { key: 'marketplace-listings', label: 'Marketplace and classified listings',
      blurb: 'Direct listing and advertising surfaces. A listing is not editorial coverage.',
      test: (op, s) => s.score >= 45 && op.sourceCollection === 'marketplaces' },
    { key: 'paid-placement', label: 'Paid placement',
      blurb: 'Commercial placement. Useful, and clearly labelled as bought rather than earned.',
      test: (op, s) => s.score >= 45 && (op.cost === 'paid' || op.actionType === 'sponsor-placement') },
    { key: 'longer-term', label: 'Longer term and unverified',
      blurb: 'Worth pursuing, but the route needs establishing first or the platform needs a browser check.',
      test: (op, s) => s.score >= 35 && (op.actionType === 'investigate' || !op.actionUrl
        || op.evidence === 'needs-browser-check') },
  ];

  function plan(opportunities, ctx, { perLane = 25, perGroup = 8 } = {}) {
    const scored = opportunities
      .map((op) => ({ op, s: scoreOpportunity(op, ctx) }))
      .filter((x) => !x.s.excluded && x.s.score > 0)
      .sort((a, b) => b.s.score - a.s.score
        || compareStable(a.op.name, b.op.name)
        || compareStable(a.op.platformId, b.op.platformId));

    const lanes = COLLECTIONS.map((c) => ({
      collection: c,
      results: scored.filter((x) => x.op.sourceCollection === c.key).slice(0, perLane),
      total: scored.filter((x) => x.op.sourceCollection === c.key).length,
    }));

    // An opportunity lands in the FIRST group whose test it satisfies, so a plan
    // is a sequence of actions rather than the same platform repeated six times.
    const used = new Set();
    const groups = [];
    for (const g of GROUPS) {
      const picks = [];
      for (const x of scored) {
        if (used.has(x.op.platformId)) continue;
        if (!g.test(x.op, x.s, ctx)) continue;
        picks.push(x);
        used.add(x.op.platformId);
        if (picks.length >= perGroup) break;
      }
      if (picks.length) groups.push({ ...g, picks });
    }
    return { lanes, groups, totalScored: scored.length };
  }

  // ── actionability ─────────────────────────────────────────────────────────
  //
  // v1 answered "where should this business be promoted?". This answers the
  // different question an employee actually has on Monday morning: "what exactly
  // do I do next, where, and how sure are we?"
  //
  // Every operational concept already had a canonical home in one of the three
  // collections, so the gap is EVIDENCE, not schema. Adding `publishingTime` or
  // `accountRequired` columns would have produced 2,234 empty cells and a
  // dashboard reporting how many fields exist rather than how much is known.
  // Publishing time is derived from approvalMode where that exists and is
  // `unknown` everywhere else, which is the truth.
  //
  // The headline consequence is uncomfortable and is reported rather than
  // hidden: only a small fraction of the catalogue is executable today. A
  // smaller truthful Ready queue is worth more than a large one built on
  // assumptions.

  const EVIDENCE = {
    VERIFIED: 'verified',      // A — the operator states it
    OBSERVABLE: 'observable',  // B — visible in the public product
    DERIVED: 'derived',        // C — computed from a documented rule
    UNKNOWN: 'unknown',        // not established
  };

  // Small and explicit. UNKNOWN never becomes READY, and a bot filter never
  // becomes dead.
  const STATUS = {
    READY: 'READY',
    NEEDS_RESEARCH: 'NEEDS_RESEARCH',
    NEEDS_BROWSER: 'NEEDS_BROWSER',
    BLOCKED: 'BLOCKED',
    NOT_APPLICABLE: 'NOT_APPLICABLE',
  };
  const STATUS_LABEL = {
    READY: 'Ready to execute',
    NEEDS_RESEARCH: 'Needs research',
    NEEDS_BROWSER: 'Needs browser check',
    BLOCKED: 'Blocked',
    NOT_APPLICABLE: 'Not applicable',
  };

  const CONFIDENCE = { HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW', INSUFFICIENT: 'INSUFFICIENT' };
  const CONFIDENCE_LABEL = {
    HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low', INSUFFICIENT: 'Not enough to act on',
  };

  const DIFFICULTY_LABEL = {
    'very-easy': 'Easy', easy: 'Easy', moderate: 'Moderate', hard: 'Complex', unknown: 'Unknown',
  };

  // Publishing time is only ever stated where the source says so. `instant`
  // approval is a genuine operator statement about timing; everything else is
  // unknown, because "a large publication probably takes two weeks" is an
  // assumption and this repository does not store assumptions.
  const PUBLISHING_TIME = { instant: 'Instant', manual: 'Unknown — manual review', unknown: 'Unknown' };

  // Wording is per ACTION, never per platform, so 2,234 rows share seventeen
  // sentences and none of them was hand-written for a particular site.
  const NEXT_ACTION = {
    'create-listing': 'Create a business profile',
    'claim-profile': 'Claim the existing company profile',
    'apply-for-inclusion': 'Apply for inclusion',
    'post-advertisement': 'Post an advertisement',
    'create-seller-profile': 'Create a seller account',
    'publish-classified': 'Post a classified listing',
    'pitch-editor': 'Pitch the editorial team',
    'submit-news': 'Submit company news',
    'send-press-release': 'Distribute a press release',
    'contribute-article': 'Submit a contributed article',
    'launch-product': 'Submit a product launch',
    'register-as-source': 'Register as an expert source',
    'apply-podcast-guest': 'Apply as a podcast guest',
    'sponsor-placement': 'Buy a sponsored placement',
    'enter-award': 'Enter the award',
    'publish-profile': 'Publish a company profile',
    investigate: 'Research the submission route',
  };

  // Requirements are read from wherever the owning collection keeps them.
  function requirementsFor(op) {
    const r = op.record || {};
    const intel = r.intelligence || {};
    const verification = Array.isArray(r.verificationMethods) ? r.verificationMethods : [];
    const assets = Array.isArray(r.requiredAssets) ? r.requiredAssets : [];
    // Moderation lives in a different field per collection, which is correct —
    // each collection owns its own fact — so it is read, not copied.
    let moderation = EVIDENCE.UNKNOWN;
    if (op.sourceCollection === 'directories' && intel.approvalMode) moderation = intel.approvalMode;
    else if (op.sourceCollection === 'media' && r.requiresEditorialApproval === true) moderation = 'manual';
    return {
      verification: verification.filter((v) => VERIFICATION_METHODS.includes(v)),
      assets: assets.filter((a) => REQUIRED_ASSET_KEYS.includes(a)),
      moderation,
      difficulty: SUBMISSION_DIFFICULTY.includes(r.submissionDifficulty)
        ? r.submissionDifficulty : 'unknown',
      publishingTime: moderation === 'instant' ? 'instant' : 'unknown',
    };
  }

  // A blocker is a KNOWN restriction, not an absence of information. Missing
  // evidence produces NEEDS_RESEARCH, never BLOCKED.
  function blockersFor(op) {
    const r = op.record || {};
    const out = [];
    if (['shutting-down', 'dormant', 'redirected'].includes(r.currentStatus)) {
      out.push('the platform is no longer operating');
    }
    if (r.listingAction === 'invite-only') out.push('listing is invitation only');
    if (r.listingAction === 'not-applicable') out.push('the platform does not accept listings');
    // The same two findings, in the marketplace collection's own vocabulary.
    // Without these a curated-supply platform would sit in the queue looking
    // like work someone could pick up today.
    if (r.sellerAction === 'invite-only') out.push('supply is invitation only');
    if (r.sellerAction === 'not-applicable') out.push('the platform does not accept seller listings');
    if (op.sourceCollection === 'marketplaces' && op.sellerTypes === 'private') {
      out.push('accepts private sellers only, not companies');
    }
    if (r.priority === 'reject') out.push('rejected on quality grounds');
    return out;
  }

  // Does the recorded action URL match the action we say to perform? A claim URL
  // is not a submission route and a rate card is not an editorial desk; sending
  // someone to the wrong one wastes the trip.
  function urlMatchesAction(op) {
    const r = op.record || {};
    if (!op.actionUrl) return false;
    if (op.sourceCollection === 'directories') {
      if (op.actionType === 'claim-profile') return op.actionUrl === r.claimUrl;
      return op.actionUrl === r.submissionUrl || op.actionUrl === r.claimUrl;
    }
    if (op.sourceCollection === 'media') {
      const map = {
        'send-press-release': [r.pressReleaseUrl],
        'pitch-editor': [r.pitchUrl, r.submissionUrl],
        'sponsor-placement': [r.advertisingUrl, r.submissionUrl],
      };
      const allowed = map[op.actionType] || [r.submissionUrl, r.pitchUrl, r.pressReleaseUrl, r.advertisingUrl];
      return allowed.filter(Boolean).includes(op.actionUrl);
    }
    if (op.sourceCollection === 'marketplaces') {
      // One field, one meaning: the route a marketplace record carries is the
      // route for the action it carries. There is no second candidate to
      // confuse it with, which is why this collection needs no map.
      return op.actionUrl === r.sellerActionUrl;
    }
    return false;
  }

  function actionability(op) {
    const req = requirementsFor(op);
    const blockers = blockersFor(op);
    const reasons = [];
    const missing = [];

    const hasAction = op.actionType && op.actionType !== 'investigate';
    const hasUrl = Boolean(op.actionUrl);
    const routeMatches = urlMatchesAction(op);
    const blocked = op.evidence === 'needs-browser-check';

    let status;
    if (blockers.length) {
      status = STATUS.BLOCKED;
      reasons.push(...blockers);
    } else if (hasAction && hasUrl && routeMatches && !blocked) {
      // READY means an employee can act now: a known action, a route that matches
      // it, and nothing known to prevent it.
      status = STATUS.READY;
      reasons.push(`the ${NEXT_ACTION[op.actionType].toLowerCase()} route is recorded and reachable`);
    } else if (blocked) {
      // A bot filter proves the server answered and nothing about the product, so
      // this is its own state and never READY and never dead.
      status = STATUS.NEEDS_BROWSER;
      reasons.push('the route is behind a bot filter and could not be read without a browser');
      if (!hasAction) missing.push('what action the platform supports');
      if (!hasUrl) missing.push('the action URL');
    } else {
      status = STATUS.NEEDS_RESEARCH;
      if (!hasAction) { missing.push('what action the platform supports'); reasons.push('no action type established'); }
      if (!hasUrl) { missing.push('the action URL'); reasons.push('no action URL recorded'); }
      else if (!routeMatches) { missing.push('a route matching the stated action'); reasons.push('the recorded URL does not match the stated action'); }
    }

    // Confidence is about executing SAFELY, and is explainable by construction:
    // every band lists what it is missing.
    let confidence;
    const secondaryUnknowns = [];
    if (op.cost === 'unknown') secondaryUnknowns.push('cost');
    if (req.moderation === EVIDENCE.UNKNOWN) secondaryUnknowns.push('whether a human approves it');
    if (req.difficulty === 'unknown') secondaryUnknowns.push('how much work it takes');

    if (status !== STATUS.READY) confidence = CONFIDENCE.INSUFFICIENT;
    else if (secondaryUnknowns.length === 0) confidence = CONFIDENCE.HIGH;
    else if (secondaryUnknowns.length === 1) confidence = CONFIDENCE.MEDIUM;
    else confidence = CONFIDENCE.LOW;

    const confidenceReasons = status === STATUS.READY
      ? (secondaryUnknowns.length
        ? [`the route is known; still unknown: ${secondaryUnknowns.join(', ')}`]
        : ['action, route, cost, moderation and effort are all established'])
      : [`not enough is established to act: ${missing.join(', ') || reasons[0]}`];

    const nextAction = status === STATUS.READY ? NEXT_ACTION[op.actionType]
      : status === STATUS.NEEDS_BROWSER ? 'Verify the route in a browser'
        : status === STATUS.BLOCKED ? 'No executable action available'
          : missing.includes('the action URL') ? 'Research the submission route'
            : 'Check what action the platform supports';

    return {
      status,
      statusLabel: STATUS_LABEL[status],
      confidence,
      confidenceLabel: CONFIDENCE_LABEL[confidence],
      confidenceReasons,
      nextAction,
      actionUrl: op.actionUrl,
      routeMatchesAction: routeMatches,
      blockers,
      missing,
      reasons,
      requirements: req,
      difficultyLabel: DIFFICULTY_LABEL[req.difficulty],
      publishingTimeLabel: PUBLISHING_TIME[req.publishingTime],
      // Where the operational facts came from. Nothing here is upgraded: an
      // absent fact stays UNKNOWN rather than becoming a confident default.
      evidence: {
        action: hasAction ? EVIDENCE.OBSERVABLE : EVIDENCE.UNKNOWN,
        actionUrl: hasUrl ? EVIDENCE.VERIFIED : EVIDENCE.UNKNOWN,
        cost: op.cost && op.cost !== 'unknown' ? EVIDENCE.VERIFIED : EVIDENCE.UNKNOWN,
        moderation: req.moderation === EVIDENCE.UNKNOWN ? EVIDENCE.UNKNOWN : EVIDENCE.VERIFIED,
        difficulty: req.difficulty === 'unknown' ? EVIDENCE.UNKNOWN : EVIDENCE.VERIFIED,
        publishingTime: req.publishingTime === 'unknown' ? EVIDENCE.UNKNOWN : EVIDENCE.VERIFIED,
        status: EVIDENCE.DERIVED,
        confidence: EVIDENCE.DERIVED,
      },
    };
  }

  // ── health, all derived ───────────────────────────────────────────────────
  function health(ops) {
    const per = (subset) => {
      const acts = subset.map((o) => ({ o, a: actionability(o) }));
      const count = (s) => acts.filter((x) => x.a.status === s).length;
      return {
        total: subset.length,
        ready: count(STATUS.READY),
        needsResearch: count(STATUS.NEEDS_RESEARCH),
        needsBrowser: count(STATUS.NEEDS_BROWSER),
        blocked: count(STATUS.BLOCKED),
        withActionUrl: subset.filter((o) => o.actionUrl).length,
        highConfidence: acts.filter((x) => x.a.confidence === CONFIDENCE.HIGH).length,
      };
    };
    const overall = per(ops);
    const rate = (n, d) => (d ? Number(((n / d) * 100).toFixed(1)) : 0);
    const withRates = (s) => ({ ...s,
      actionabilityRate: rate(s.ready, s.total),
      actionUrlCoverage: rate(s.withActionUrl, s.total),
      highConfidenceCoverage: rate(s.highConfidence, s.total),
      researchDebt: s.needsResearch + s.needsBrowser });
    const byCollection = {};
    for (const c of COLLECTIONS) {
      byCollection[c.key] = withRates(per(ops.filter((o) => o.sourceCollection === c.key)));
    }
    return { overall: withRates(overall), byCollection };
  }

  // ── campaign ranking ──────────────────────────────────────────────────────
  // v1 ranked on fit and native quality: the right answer to "where should this
  // business be promoted?". An EXECUTION campaign is a different question, and a
  // theoretically excellent platform nobody can act on today must not outrank a
  // strong platform with a working route. Readiness therefore multiplies rather
  // than nudges — but a high-fit unusable platform is not deleted, it lands in
  // the research group instead.
  const READINESS_WEIGHT = {
    READY: 1.0,
    NEEDS_RESEARCH: 0.45,
    NEEDS_BROWSER: 0.4,
    BLOCKED: 0,
    NOT_APPLICABLE: 0,
  };
  const CONFIDENCE_WEIGHT = { HIGH: 1.08, MEDIUM: 1.0, LOW: 0.94, INSUFFICIENT: 1.0 };

  function campaignScore(op, ctx) {
    const base = scoreOpportunity(op, ctx);
    if (base.excluded) return { ...base, act: null, campaignScore: 0 };
    const act = actionability(op);
    const weighted = base.score * READINESS_WEIGHT[act.status] * CONFIDENCE_WEIGHT[act.confidence];
    return { ...base, act, campaignScore: clamp(weighted) };
  }

  // Execution groups. Derived from canonical facts; no group names a platform.
  // An opportunity lands in the FIRST group it satisfies, so the campaign reads as
  // a sequence of work rather than one ranking repeated seven times.
  const CAMPAIGN_GROUPS = [
    { key: 'quick-wins', label: 'Quick wins',
      blurb: 'Ready now, free or freemium, and nobody has to approve it.',
      test: (op, x) => x.act && x.act.status === 'READY' && ['free', 'freemium'].includes(op.cost)
        && x.act.requirements.moderation !== 'manual' },
    { key: 'authority', label: 'Authority',
      blurb: 'Ready now on high-trust directories and professional platforms.',
      test: (op, x) => x.act && x.act.status === 'READY' && op.sourceCollection === 'directories' },
    { key: 'media-pr', label: 'Media & PR',
      blurb: 'Ready now: pitch, contribute, launch or distribute through a publication.',
      test: (op, x) => x.act && x.act.status === 'READY' && op.sourceCollection === 'media' },
    { key: 'marketplaces', label: 'Marketplaces & classifieds',
      blurb: 'Listing and selling surfaces relevant to this business.',
      test: (op, x) => x.act && x.act.status === 'READY' && op.sourceCollection === 'marketplaces' },
    { key: 'local', label: 'Local discovery',
      blurb: 'Ready now and published in the target market.',
      test: (op, x, ctx) => x.act && x.act.status === 'READY' && ctx.market !== '*' && op.country === ctx.market },
    { key: 'long-term', label: 'Long term and high effort',
      blurb: 'Strong opportunities that need an application, a membership or an editor.',
      test: (op, x) => x.act && x.act.status === 'READY'
        && (x.act.requirements.moderation === 'manual' || op.cost === 'paid') },
    { key: 'needs-research', label: 'Needs research',
      blurb: 'Relevant, but not executable until someone establishes the route.',
      test: (op, x) => x.act && x.act.status === 'NEEDS_RESEARCH' },
  ];

  // ── the evidence control ──────────────────────────────────────────────────
  //
  // This control shipped on the page as a decorative select: it had four
  // options, changed nothing, and there was no client at all to read it. It now
  // means what its labels say — a floor on how much is established about a
  // candidate before it may enter the campaign.
  //
  // It is a filter on ACTIONABILITY, not on score, because that is the question
  // the labels ask. 'ready' is the default and matches the page's prerendered
  // campaign, so the first client render reproduces the server's byte for byte
  // rather than silently replacing it with a different plan.
  const EVIDENCE_MODES = [
    { key: 'ready', label: 'Ready to execute only', test: (a) => a.status === STATUS.READY },
    { key: 'high', label: 'High confidence only',
      test: (a) => a.status === STATUS.READY && a.confidence === CONFIDENCE.HIGH },
    { key: 'research', label: 'Include research needed',
      test: (a) => a.status === STATUS.READY || a.status === STATUS.NEEDS_RESEARCH },
    { key: 'all', label: 'Everything', test: () => true },
  ];
  const EVIDENCE_MODE_BY_KEY = new Map(EVIDENCE_MODES.map((m) => [m.key, m]));

  // Diversification is a TIE-BREAK, not a quota. Where scores are close the
  // campaign prefers a collection it has drawn from less, so a fifty-item plan is
  // not fifty near-identical directories — but a collection that genuinely does
  // not fit is never included to fill a slot.
  //
  // `evidence` defaults to 'all', so every caller written before the control was
  // wired keeps its exact previous behaviour.
  function campaign(opportunities, ctx, { size = 25, evidence = 'all' } = {}) {
    const mode = EVIDENCE_MODE_BY_KEY.get(evidence) || EVIDENCE_MODE_BY_KEY.get('all');
    const scored = opportunities
      .map((op) => ({ op, x: campaignScore(op, ctx) }))
      .filter((r) => !r.x.excluded && r.x.campaignScore > 0 && mode.test(r.x.act))
      .sort((a, b) => b.x.campaignScore - a.x.campaignScore
        || compareStable(a.op.name, b.op.name) || compareStable(a.op.platformId, b.op.platformId));

    const drawn = { directories: 0, marketplaces: 0, media: 0 };
    const picked = [];
    const pool = [...scored];
    while (picked.length < size && pool.length) {
      // Among candidates within a small band of the best remaining score, take the
      // one from the least-drawn collection.
      const best = pool[0].x.campaignScore;
      const band = pool.filter((r) => r.x.campaignScore >= best - 4);
      band.sort((a, b) => drawn[a.op.sourceCollection] - drawn[b.op.sourceCollection]
        || b.x.campaignScore - a.x.campaignScore);
      const chosen = band[0];
      picked.push(chosen);
      drawn[chosen.op.sourceCollection] += 1;
      pool.splice(pool.indexOf(chosen), 1);
    }

    const used = new Set();
    const groups = [];
    for (const g of CAMPAIGN_GROUPS) {
      const items = picked.filter((r) => !used.has(r.op.platformId) && g.test(r.op, r.x, ctx));
      for (const r of items) used.add(r.op.platformId);
      if (items.length) groups.push({ ...g, items });
    }
    return { picked, groups, drawn, totalEligible: scored.length };
  }

  // ── the worklist: sections 2, 4 and 5 ─────────────────────────────────────
  //
  // ── WHAT WAS WRONG ────────────────────────────────────────────────────────
  //
  // The page numbers itself "1. Build a campaign / 2. Ready to execute / 3. The
  // campaign / 4. Needs research / 5. Needs browser verification", so 2, 4 and 5
  // read as OUTPUTS of the builder. They were not. The generator computed them
  // over the whole corpus once and the client never touched them.
  //
  // Measured in Chrome, switching Market from United States to United Kingdom:
  // the summary moved, section 3 moved (MerchantCircle/ProvenExpert/Trustpilot
  // became Approved Business/Bizify/FreeIndex) and the URL moved, while
  // "2. Ready to execute — 126 opportunities" kept its 60 rows led by
  // Alibaba.com, Apple App Store and AussieWeb Local Search, "4. Needs research
  // — 1473" kept its 40, "5. Needs browser verification — 634" kept its 40. 140
  // rows and three headline counts describing a state nobody selected — the same
  // defect the hardcoded "United States" in the summary was, somewhere nobody
  // looked.
  //
  // ── WHAT ELIGIBLE MEANS, AND WHY IT IS THE CAMPAIGN'S OWN DEFINITION ──────
  //
  // The candidate pool here is exactly the one campaign() builds — not excluded
  // by business fit, objective, budget or a dead platform, and scoring above
  // zero — MINUS the evidence floor. Sharing the definition is the point: with
  // the default evidence level the summary's "N opportunities are eligible" IS
  // section 2's count, by construction rather than by coincidence, and a test
  // asserts that identity over the whole state matrix. Two definitions of
  // eligible on one page is how the page got here.
  //
  // ── WHY THE EVIDENCE CONTROL DOES NOT SCOPE THESE SECTIONS ────────────────
  //
  // Because sections 4 and 5 exist to show what the evidence floor is keeping
  // out. Scoping them by it would empty both at the DEFAULT level ("Ready to
  // execute only"), and the page would report zero research debt for a state
  // that has over a thousand rows of it — trading a lie about the market for a
  // lie about how much is known. The floor is an admission rule for the
  // CAMPAIGN, which is what it says on the control; the worklist is the whole
  // eligible set, partitioned by what can honestly be done with each row today.
  // Section 3 is therefore always a subset of these three sections.
  //
  // ── WHY THE ORDER IS THE CAMPAIGN SCORE ───────────────────────────────────
  //
  // No weight, formula, group test or selection rule is touched here; this is
  // only about WHICH opportunities each section is computed over. But a section
  // shows at most 60 rows out of as many as 1,701, so the truncation window is
  // part of "which": cutting it by a corpus-level fact — it was native quality,
  // then name — leaves a window that barely moves when the state does, and
  // market never excludes anything (a global platform legitimately reaches every
  // market), so market would have moved nothing at all. Ordering by the
  // campaignScore the engine ALREADY computes is what makes the visible rows
  // belong to the selected state. Ties fall back to the same name/platformId
  // comparator the campaign uses, so the order is total and reproducible.
  const WORKLIST_SECTIONS = [
    // `key` is also the id of the section element the generator emits and the
    // client re-renders, so neither side carries a status literal of its own.
    { key: 'ready', status: STATUS.READY, limit: 60 },
    { key: 'research', status: STATUS.NEEDS_RESEARCH, limit: 40 },
    { key: 'browser', status: STATUS.NEEDS_BROWSER, limit: 40 },
  ];

  function worklist(opportunities, ctx) {
    const eligible = opportunities
      .map((op) => ({ op, x: campaignScore(op, ctx) }))
      .filter((r) => !r.x.excluded && r.x.campaignScore > 0)
      .sort((a, b) => b.x.campaignScore - a.x.campaignScore
        || compareStable(a.op.name, b.op.name) || compareStable(a.op.platformId, b.op.platformId));
    const sections = WORKLIST_SECTIONS.map((s) => {
      const entries = eligible.filter((r) => r.x.act && r.x.act.status === s.status);
      return { key: s.key, status: s.status, limit: s.limit,
        total: entries.length, entries, rows: entries.slice(0, s.limit) };
    });
    const byKey = {};
    for (const s of sections) byKey[s.key] = s;
    return { eligible, sections, byKey, totalEligible: eligible.length };
  }

  // The heading is part of the answer, not decoration: it carried a corpus count
  // under a builder number. It states what the section is a count OF, in the
  // same labelled-clause style as summaryText and for the same reason — every
  // value is a LABEL the caller resolved, because the caller knows its locale
  // and this module does not.
  function worklistHeading({ title, count, totalEligible, business, objective, market, budget }) {
    return `${title} — ${count} of ${totalEligible} eligible opportunities: `
      + `${business}, ${objective}, ${market}, ${budget}`;
  }

  // ── one row, rendered twice ───────────────────────────────────────────────
  //
  // The generator writes HTML and the client writes DOM nodes, so the row is
  // described here once and rendered by both. A cell is { label, text, url,
  // external, action }; `label` is the English data-bd-label the markup has
  // always carried (it is not a dictionary string and is identical in every
  // locale), and `url` is null when the row has no route.
  //
  // The platform name is TEXT and not a link, which the server-rendered rows
  // used to be. The browser payload deliberately carries no `website` — it is on
  // the banned list, and shipping 2,234 platform URLs as one JSON file would
  // widen this route's data-rights position — so a client-rendered row cannot
  // reproduce that link, and a row that is a link for the 140 prerendered
  // opportunities and text for every other state is exactly the server/client
  // drift this module exists to prevent. Every row instead links its source
  // COLLECTION, which is where that platform's own record is published, plus its
  // action URL where one is recorded.
  const WORKLIST_WHY = {
    NEEDS_BROWSER: 'the route may exist; a rendered browser would establish it',
    NEEDS_RESEARCH: 'without this the opportunity cannot be worked',
  };

  // Only a URL a browser may safely follow to somebody else's site. Anything
  // else is dropped rather than rendered, which turns a hostile value into a
  // missing CTA instead of a live one.
  const SAFE_SCHEME = /^https?:\/\//i;

  function safeExternalUrl(url) {
    if (typeof url !== 'string') return null;
    const trimmed = url.trim();
    // Control characters are how "java\tscript:" gets past a naive check.
    if (/[\u0000-\u001f\u007f]/.test(trimmed)) return null;
    if (!SAFE_SCHEME.test(trimmed)) return null;
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
      if (!parsed.hostname || !parsed.hostname.includes('.')) return null;
      return trimmed;
    } catch { return null; }
  }

  function worklistRow(entry, sectionKey, countryName) {
    const op = entry.op;
    const a = entry.x.act;
    const collection = COLLECTION_BY_KEY.get(op.sourceCollection);
    const country = typeof countryName === 'function' ? countryName(op.country) : op.country;
    const cells = [
      { label: 'Platform', text: op.name, url: null },
      { label: 'Where', text: `${collection.label} · ${country}`, url: collection.path },
    ];
    if (sectionKey === WORKLIST_SECTIONS[0].key) {
      cells.push({ label: 'Cost', text: op.cost, url: null });
      cells.push({ label: 'Effort', text: a.difficultyLabel, url: null });
      cells.push({ label: 'Time to publish', text: a.publishingTimeLabel, url: null });
      cells.push({ label: 'How sure',
        text: `${a.confidenceLabel} — ${a.confidenceReasons[0]}`, url: null });
    } else {
      cells.push({ label: 'What is missing',
        text: a.missing.length ? a.missing.join(', ') : (a.reasons[0] || 'unknown'), url: null });
      cells.push({ label: 'Why it matters', text: WORKLIST_WHY[a.status] || '', url: null });
      cells.push({ label: 'Suggested research', text: a.nextAction, url: null });
    }
    // The CTA is the one place a stored value becomes a live external link in
    // the product, and both the server renderer and the browser client set
    // `href` straight from it. Neither checked the scheme. A `javascript:` or
    // `data:` value reaching a canonical route field would have become a
    // clickable link on the page — so the guard lives HERE, in the shared row
    // model, rather than being remembered twice.
    // An execution link is a promise that someone can go and do this. It needs
    // BOTH facts: a route, and an established action for that route to serve.
    // Sixteen rows had the first without the second — the route was recorded,
    // what it is for was not — and the page offered "Do this" as a link into a
    // page nobody had established the purpose of. The row keeps the URL out of
    // the CTA in that case; the research cells above it already say what is
    // missing.
    const executable = op.actionType && op.actionType !== 'investigate';
    cells.push({
      label: 'Do this',
      text: a.nextAction,
      url: executable ? safeExternalUrl(a.actionUrl) : null,
      external: true,
      action: true,
    });
    return {
      platformId: op.platformId,
      attrs: {
        'data-dp-status': a.status,
        'data-dp-collection': op.sourceCollection,
        'data-dp-country': op.country,
        'data-dp-cost': op.cost,
        'data-dp-confidence': a.confidence,
      },
      cells,
    };
  }

  // Section 6 is a property of the CATALOGUE and not of the campaign: it counts
  // what is established about every record, which is a dataset-quality question
  // the six controls have no bearing on. That is a legitimate thing to publish
  // and the wrong thing to publish silently at the bottom of a numbered builder
  // flow, where a reader has every reason to read it as the sixth output of the
  // five steps above it. So it says so, in its own copy.
  //
  // Assembled here rather than in the dictionary because this task may not edit
  // data/, and it appears in every locale for the same reason the research-debt
  // sentence beneath the same table already does.
  function healthScopeNote(total) {
    return `These figures cover the whole catalogue — all ${total} opportunities in all three `
      + 'collections — and do not move with the six controls above. They measure how much is '
      + 'established about the data, not what is eligible for the campaign you just built. '
      + 'The numbered sections above answer that question and recompute with every control.';
  }

  // ── the sentence the page reports its state with ──────────────────────────
  //
  // Built here so the generator and the browser cannot describe the same
  // campaign differently. The shipped page said "in the United States" as a
  // literal, which stayed on screen whichever market was selected — the summary
  // asserted a fact about a state it was not reading.
  //
  // Every value arrives as a LABEL the caller resolved, because the caller knows
  // its locale and this module does not. Labelled clauses rather than prose:
  // "pursuing local discovery in United Kingdom" needs an article that not every
  // country name takes, and a sentence that is subtly ungrammatical for two
  // thirds of the market list is worse than one that is plainly mechanical.
  function summaryText({ size, business, objective, market, budget, evidence,
    totalEligible, picked }) {
    const eligible = `${totalEligible} opportunit${totalEligible === 1 ? 'y is' : 'ies are'} eligible`;
    const chosen = `${picked} ${picked === 1 ? 'was' : 'were'} selected`;
    return `Showing a ${size}-opportunity campaign. Business: ${business}. `
      + `Objective: ${objective}. Market: ${market}. Budget: ${budget}. Evidence: ${evidence}. `
      + `${eligible}; ${chosen}.`;
  }

  // ── URL state ─────────────────────────────────────────────────────────────
  //
  // A campaign nobody can send to a colleague has to be rebuilt by hand at the
  // other end, and six controls are six chances to rebuild it slightly wrong.
  // So the whole state lives in the URL. It is parsed HERE, beside the
  // vocabularies it has to be checked against, for the same reason the score is
  // here: a parser in the browser and a vocabulary in the engine drift, and the
  // query string is the one input to this page that arrives from outside it.
  //
  // Parameters are canonical VALUES, never labels. The planner ships in four
  // locales from one render path, so a German reader whose URL said
  // market=Vereinigte+Staaten would hand an English reader a link their page
  // cannot resolve. These six strings are identical in every locale.
  //
  // HOSTILE AND STALE INPUT IS THE NORMAL CASE, and it is not merely untidy:
  // businessFit THROWS on a profile it does not know, so ?business=<script>
  // reaching the engine is an exception thrown inside the render, not a value
  // that scores badly. Every parameter is therefore checked against the
  // vocabulary that owns it and anything else falls back to the default. The
  // parsed state is a WHITELIST, not a cleaned copy of what arrived — no
  // fragment of the query string is ever echoed into the page or back into the
  // URL.
  const PLANNER_PARAMS = ['business', 'objective', 'market', 'budget', 'size', 'evidence'];

  // The sizes the control offers. Here rather than in the generator so the
  // select, the URL and the validator cannot offer three different sets.
  const PLANNER_SIZES = [10, 25, 50, 100];

  const ANY_MARKET = '*';

  // The state the page is rendered in when no URL asks for another. The
  // generator renders its static campaign from this, the controls carry it as
  // their selected options, and a bare planner URL means exactly it — one
  // default, not three that agree until someone edits one of them.
  const PLANNER_DEFAULTS = { business: 'local-business', objective: 'local-discovery',
    market: 'united-states', budget: 'free-freemium', size: 25, evidence: 'ready' };

  // Five of the six vocabularies are owned by this module. The sixth — market —
  // is whichever countries the corpus actually contains, so the caller passes
  // the list its control was built from and a URL can only ever name a market
  // the reader could have chosen from the control itself.
  function plannerVocabulary(known) {
    const markets = known && Array.isArray(known.markets) ? known.markets : [];
    return {
      business: MEDIA_PROFILES.map((p) => p.key),
      objective: OBJECTIVES.map((o) => o.key),
      market: [ANY_MARKET].concat(markets),
      budget: BUDGETS.map((b) => b.key),
      size: PLANNER_SIZES.map(String),
      evidence: EVIDENCE_MODES.map((m) => m.key),
    };
  }

  // One validator for both directions, so a value that cannot be parsed can
  // never be serialized either — including a value read back off a control that
  // some future markup change let drift out of vocabulary.
  function normalizeState(state, known) {
    const vocab = plannerVocabulary(known);
    const out = {};
    for (const key of PLANNER_PARAMS) {
      const raw = state && state[key] !== undefined && state[key] !== null
        ? String(state[key]) : null;
      out[key] = raw !== null && vocab[key].indexOf(raw) !== -1
        ? raw : String(PLANNER_DEFAULTS[key]);
    }
    out.size = Number(out.size);
    return out;
  }

  function parseState(searchParams, known) {
    const get = (k) => {
      if (!searchParams) return null;
      // Duplicates: the FIRST wins, deterministically. Taking the last would let
      // ?market=united-states&market=germany show one market to a reader
      // skimming the link and compute the campaign for another.
      if (typeof searchParams.getAll === 'function') {
        const all = searchParams.getAll(k);
        return all.length ? all[0] : null;
      }
      if (typeof searchParams.get === 'function') return searchParams.get(k);
      return Object.prototype.hasOwnProperty.call(searchParams, k) ? searchParams[k] : null;
    };
    const raw = {};
    for (const key of PLANNER_PARAMS) raw[key] = get(key);
    return normalizeState(raw, known);
  }

  // All six parameters, or none at all. A link carrying only what differs from
  // today's default changes meaning the day the default changes, and the entire
  // value of a shared campaign URL is that it still selects the same platforms
  // next month. The default state serializes to the empty string, so the
  // planner's own address stays clean and no query combination can ever be
  // mistaken for a page worth indexing.
  function serializeState(state, known) {
    const s = normalizeState(state, known);
    if (PLANNER_PARAMS.every((k) => String(s[k]) === String(PLANNER_DEFAULTS[k]))) return '';
    return `?${PLANNER_PARAMS
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(s[k]))}`).join('&')}`;
  }

  // ── the campaign, as a spreadsheet ────────────────────────────────────────
  //
  // execution-opportunities.csv is the whole 2,234-row queue, written once at
  // build time. It answers "what is in the catalogue?" and it should stay. It
  // cannot answer "what did the planner just pick for me?", because that
  // depends on six controls the server never saw — and handing someone the full
  // queue when they asked for their 25-row campaign is the same class of defect
  // as showing them one market's campaign under another market's heading.
  //
  // So this exports the CURRENT result object, the one the page rendered, in
  // the order the page rendered it. It lives here rather than in the client
  // because the rows must be chosen by the engine that chose the campaign, not
  // by a second pass over the DOM that could disagree with it.

  // Spreadsheet formula hardening, the rule the tender exports already use. A
  // platform whose name begins with "=", "+", "-" or "@" is a formula to Excel
  // and Sheets; a leading apostrophe neutralises it as text. Applied only at
  // this projection boundary — the record keeps its own characters, because the
  // problem belongs to the spreadsheet and not to the platform.
  const CSV_FORMULA_PREFIX = /^[=+\-@\t\r]/;

  // RFC 4180: quote when the value contains a comma, a quote, CR or LF, and
  // escape an embedded quote by doubling it.
  function csvField(v) {
    if (v === null || v === undefined) return '';
    let s = Array.isArray(v) ? v.join('; ') : String(v);
    if (CSV_FORMULA_PREFIX.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  // `country` is the canonical slug rather than a country name: the browser
  // payload carries only the fields this engine reads, so a client has no
  // name table, and the slug is the same string the shared URL carries.
  const CAMPAIGN_CSV_COLUMNS = ['group', 'platform', 'collection', 'country', 'cost',
    'actionability_status', 'execution_confidence', 'next_action', 'action_url',
    'difficulty', 'publishing_time', 'campaign_score', 'why'];

  // A picked opportunity that satisfied no group test. Reachable: under the
  // "Everything" evidence level a NEEDS_BROWSER opportunity still scores
  // (READINESS_WEIGHT 0.4) and every group test requires READY or
  // NEEDS_RESEARCH. Dropping those rows would export fewer than the campaign
  // contains, which is the one thing this export must never do.
  const UNGROUPED = 'unassigned';

  function campaignRows(result) {
    const rows = [];
    const placed = new Set();
    for (const g of result.groups) {
      for (const r of g.items) { placed.add(r.op.platformId); rows.push({ group: g.key, r }); }
    }
    for (const r of result.picked) {
      if (!placed.has(r.op.platformId)) rows.push({ group: UNGROUPED, r });
    }
    return rows;
  }

  // An empty campaign exports the header and no rows. A control combination
  // with no eligible platform — a software business asked for marketplace
  // exposure, which the marketplace vocabulary genuinely cannot serve — is a
  // real answer, and quietly substituting the 2,234-row queue for it would tell
  // the reader the opposite of what the page just told them.
  function campaignCsv(result) {
    const lines = [CAMPAIGN_CSV_COLUMNS.join(',')];
    for (const { group, r } of campaignRows(result)) {
      const act = r.x.act || {};
      lines.push([group, r.op.name, COLLECTION_BY_KEY.get(r.op.sourceCollection).label,
        r.op.country, r.op.cost, act.status, act.confidence, act.nextAction, act.actionUrl,
        act.difficultyLabel, act.publishingTimeLabel, r.x.campaignScore, r.x.reasons]
        .map(csvField).join(','));
    }
    return `﻿${lines.join('\r\n')}\r\n`;
  }

  // Deterministic and made only of canonical values, so two people who share a
  // URL and both download get the same file name for the same campaign, and a
  // folder of exports sorts into something readable.
  function campaignFilename(state, known) {
    const s = normalizeState(state, known);
    const part = (v) => String(v).replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '')
      .toLowerCase() || 'any';
    // '*' is not a file name character on any platform, and it is the one value
    // in the six vocabularies that is punctuation rather than a slug.
    const market = s.market === ANY_MARKET ? 'any-market' : part(s.market);
    return `campaign-${part(s.business)}-${part(s.objective)}-${market}`
      + `-${part(s.budget)}-${s.size}-${part(s.evidence)}.csv`;
  }

  // ── the field contract ────────────────────────────────────────────────────
  //
  // Exactly what this engine reads. The generator projects these fields and no
  // others into the browser payload, and a test records every property access
  // over all 2,234 opportunities and fails if the two sets differ in either
  // direction — a field the engine reads and the payload omits produces a
  // browser that silently scores differently, and a field the payload carries
  // and the engine never reads is data published for no reason.
  //
  // `accepts` and `intelligence` are objects, so the contract names the keys
  // inside them too. ACCEPTS_FIELDS is derived from DIRECTORY_ACCEPTS rather
  // than listed, so widening a business profile widens the payload by itself.
  const ACCEPTS_FIELDS = [...new Set([].concat(...Object.keys(DIRECTORY_ACCEPTS)
    .map((k) => DIRECTORY_ACCEPTS[k])))].sort();
  const FIELD_CONTRACT = {
    // Projected facts, produced by the adaptors in distribution-planner.cjs.
    op: ['accepts', 'actionType', 'actionUrl', 'alsoCovers', 'audienceGeography', 'category',
      'cost', 'country', 'evidence', 'marketplaceType', 'name', 'nativeQuality', 'nativeSignal',
      'platformId', 'record', 'sellerTypes', 'sourceCollection'],
    // Raw fields read straight off the source record, which each collection owns.
    record: ['advertisingUrl', 'categories', 'claimUrl', 'currentStatus', 'industries',
      'intelligence', 'limitations', 'listingAction', 'name', 'opportunityTypes', 'pitchUrl',
      'pressReleaseUrl', 'priority', 'requiredAssets', 'requiresEditorialApproval',
      // Marketplace seller actionability. The browser scores blockers and the
      // action/route agreement from these, so omitting them from the slim
      // payload would leave the client scoring on undefined while the server
      // scored on facts — which is exactly what this contract exists to stop.
      'sellerAction', 'sellerActionUrl',
      'shortNote', 'submissionDifficulty', 'submissionUrl', 'verificationMethods'],
    accepts: ACCEPTS_FIELDS,
    intelligence: ['approvalMode'],
  };

  // The browser payload. Values are copied verbatim, including nulls: the score
  // asks `op.nativeQuality === null` to decide whether to apply the unrated
  // discount, so an omitted null would arrive as undefined and produce NaN.
  // Presence is tested with `in` rather than a truthiness check for the same
  // reason.
  function projectForClient(ops) {
    return ops.map((op) => {
      const out = {};
      for (const k of FIELD_CONTRACT.op) {
        if (k !== 'record' && k in op) out[k] = op[k];
      }
      if (op.accepts) {
        const accepts = {};
        for (const k of FIELD_CONTRACT.accepts) if (k in op.accepts) accepts[k] = op.accepts[k];
        out.accepts = accepts;
      }
      const r = op.record || {};
      const rec = {};
      for (const k of FIELD_CONTRACT.record) {
        if (k !== 'intelligence' && k in r) rec[k] = r[k];
      }
      if (r.intelligence) {
        const intel = {};
        for (const k of FIELD_CONTRACT.intelligence) if (k in r.intelligence) intel[k] = r.intelligence[k];
        rec.intelligence = intel;
      }
      out.record = rec;
      return out;
    });
  }

  return {
    compareStable,
    clamp,
    VERIFICATION_METHODS,
    SUBMISSION_DIFFICULTY,
    REQUIRED_ASSET_KEYS,
    MEDIA_OBJECTIVES,
    MEDIA_OBJECTIVE_BY_KEY,
    MEDIA_PROFILES,
    MEDIA_PROFILE_BY_KEY,
    FIT_CATEGORY,
    FIT_INDUSTRY,
    FIT_ADJACENT,
    FIT_KEYWORD,
    FIT_GENERAL,
    FIT_NONE,
    mediaBusinessFit,
    mediaObjectiveFit,
    COLLECTIONS,
    COLLECTION_BY_KEY,
    ACTION_TYPES,
    OBJECTIVES,
    OBJECTIVE_BY_KEY,
    MEDIA_OBJECTIVE,
    DIRECTORY_ACCEPTS,
    MARKETPLACE_TYPES_FOR,
    BUDGETS,
    BUDGET_BY_KEY,
    businessFit,
    objectiveFit,
    geographyFit,
    costFit,
    UNRATED_QUALITY,
    UNRATED_DISCOUNT,
    scoreOpportunity,
    GROUPS,
    plan,
    EVIDENCE,
    STATUS,
    STATUS_LABEL,
    CONFIDENCE,
    CONFIDENCE_LABEL,
    DIFFICULTY_LABEL,
    PUBLISHING_TIME,
    NEXT_ACTION,
    requirementsFor,
    blockersFor,
    urlMatchesAction,
    actionability,
    health,
    READINESS_WEIGHT,
    CONFIDENCE_WEIGHT,
    campaignScore,
    CAMPAIGN_GROUPS,
    EVIDENCE_MODES,
    EVIDENCE_MODE_BY_KEY,
    campaign,
    WORKLIST_SECTIONS,
    WORKLIST_WHY,
    worklist,
    worklistHeading,
    worklistRow,
    safeExternalUrl,
    healthScopeNote,
    summaryText,
    PLANNER_PARAMS,
    PLANNER_SIZES,
    PLANNER_DEFAULTS,
    ANY_MARKET,
    plannerVocabulary,
    normalizeState,
    parseState,
    serializeState,
    csvField,
    CAMPAIGN_CSV_COLUMNS,
    UNGROUPED,
    campaignRows,
    campaignCsv,
    campaignFilename,
    FIELD_CONTRACT,
    projectForClient,
  };
}));
