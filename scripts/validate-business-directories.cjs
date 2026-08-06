'use strict';
const { loadRegistry, reservedSlugs } = require('./lib/bd-registry.cjs');
const S = require('./lib/bd-schema.cjs');
const { UNKNOWN_KEYS } = require('./lib/bd-migrate.cjs');

const isNullish = (v) => v === null || v === undefined;

// Code-unit comparison; localeCompare would make ordering depend on the
// platform's ICU build.
function cmp(a, b) {
  const as = String(a ?? '');
  const bs = String(b ?? '');
  if (as < bs) return -1;
  if (as > bs) return 1;
  return 0;
}

function fileFor(entry) {
  const country = typeof entry.country === 'string' && entry.country ? entry.country : '<unknown>';
  return `data/business-directories/directories/${country}.json`;
}

function canonicalDomain(website) {
  try {
    return new URL(website).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

function validateRegistry(registry) {
  const errors = [];
  const countries = registry.countries || [];
  const categories = registry.categories || [];
  const directories = registry.directories || [];

  const countrySlugs = new Set(countries.map((c) => c.slug));
  const categorySlugs = new Set(categories.map((c) => c.slug));
  const reserved = reservedSlugs(categories);

  const seenId = new Set();
  const seenSlug = new Set();
  const seenDomain = new Map();

  // --- geographic registry ----------------------------------------------------
  // Checked once, before records, because every jurisdiction and scope rule
  // below resolves against it.
  const countryBySlug = new Map(countries.map((c) => [c.slug, c]));
  for (const country of countries) {
    const where = { file: 'data/business-directories/countries.json', id: country.slug };
    const addC = (field, reason) => errors.push({ ...where, field, reason });
    if (!S.ENTITY_TYPES.includes(country.entityType)) {
      addC('entityType', `Must be one of: ${S.ENTITY_TYPES.join(', ')}.`);
    }
    // Structural only — no ISO dataset is embedded, so this checks shape, not
    // whether the code names a real country.
    if (country.entityType === 'supranational') {
      if (!isNullish(country.iso2)) {
        addC('iso2', `A supranational entry must not claim a country code, got `
          + `${JSON.stringify(country.iso2)}.`);
      }
      if (country.scope !== 'supranational' && country.slug !== 'global') {
        addC('scope', `A supranational entry must declare scope "supranational", got `
          + `${JSON.stringify(country.scope)}.`);
      }
    }
    if (country.entityType === 'country') {
      if (typeof country.iso2 !== 'string' || !S.ISO_3166_1_RE.test(country.iso2)) {
        addC('iso2', `${JSON.stringify(country.iso2)} is not an ISO 3166-1 alpha-2 code: `
          + 'exactly two uppercase ASCII letters are required.');
      }
    }
    // The EU is stored here for routing. It must never be modelled as a country.
    if (country.slug === 'european-union' && country.entityType !== 'supranational') {
      addC('entityType', 'The European Union must be modelled as supranational, never as a country.');
    }
  }

  const seenIso2 = new Map();
  for (const country of countries) {
    if (country.entityType !== 'country' || typeof country.iso2 !== 'string') continue;
    if (seenIso2.has(country.iso2)) {
      errors.push({
        file: 'data/business-directories/countries.json', id: country.slug, field: 'iso2',
        reason: `Country code "${country.iso2}" is already used by `
          + `"${seenIso2.get(country.iso2)}".`,
      });
    } else seenIso2.set(country.iso2, country.slug);
  }

  // Jurisdiction IDENTITY, not record uniqueness. Several registries may belong
  // to California; what may not differ is what California IS. Two maps, so a
  // conflict is caught from either direction: one code claiming two names, and
  // one name claiming two codes.
  const jurisdictionByCode = new Map();
  const jurisdictionByName = new Map();

  for (const entry of directories) {
    const file = fileFor(entry);
    const id = typeof entry.id === 'string' && entry.id ? entry.id : null;
    const add = (field, reason) => errors.push({ file, id, field, reason });

    for (const field of S.REQUIRED_STRINGS) {
      if (typeof entry[field] !== 'string' || entry[field].length === 0) {
        add(field, `Required field "${field}" must be a non-empty string.`);
      }
    }

    if (typeof entry.website === 'string' && !entry.website.startsWith('https://')) {
      add('website', 'Website must use https.');
    }
    if (!isNullish(entry.submissionUrl)) {
      if (typeof entry.submissionUrl !== 'string' || !entry.submissionUrl.startsWith('https://')) {
        add('submissionUrl', 'Submission URL must be an https URL, or null when it was not verified.');
      }
    }
    if (typeof entry.slug === 'string' && reserved.has(entry.slug)) {
      add('slug', `Slug "${entry.slug}" is a reserved slug and cannot be used.`);
    }
    if (typeof entry.country === 'string' && !countrySlugs.has(entry.country)) {
      add('country', `References unknown country "${entry.country}".`);
    }
    if (typeof entry.category === 'string' && !categorySlugs.has(entry.category)) {
      add('category', `References unknown category "${entry.category}".`);
    }

    // --- orphan keys --------------------------------------------------------
    // Read from the symbol the migration attaches, so this catches keys the
    // normalisation would otherwise have dropped on the floor. An improvised
    // field fails here rather than disappearing.
    // Full dotted paths, so "operator.agencyTyp" names the exact field rather
    // than just the object that contained it. Sorted upstream for determinism.
    for (const problem of entry[UNKNOWN_KEYS] || []) {
      add(problem.path, problem.reason);
    }

    // --- scope, jurisdiction and supranational coupling ---------------------
    const country = countryBySlug.get(entry.country);
    if (!S.SCOPES.includes(entry.scope)) {
      add('scope', `Must be one of: ${S.SCOPES.join(', ')}.`);
    }
    if (country && country.entityType === 'supranational' && country.slug !== 'global'
      && entry.scope !== 'supranational') {
      add('scope', `A record filed under "${country.slug}" must use scope "supranational", not `
        + `"${entry.scope}".`);
    }
    if (entry.scope === 'supranational' && country && country.entityType !== 'supranational') {
      add('scope', `Scope "supranational" requires a supranational jurisdiction, but `
        + `"${entry.country}" is a country.`);
    }

    const j = entry.jurisdiction;
    if (!isNullish(j)) {
      if (typeof j !== 'object' || Array.isArray(j)) {
        add('jurisdiction', 'Field "jurisdiction" must be an object or null.');
      } else {
        if (!S.JURISDICTION_TYPES.includes(j.type)) {
          add('jurisdiction.type', `Must be one of: ${S.JURISDICTION_TYPES.join(', ')}.`);
        }
        if (typeof j.name !== 'string' || !j.name.trim()) {
          add('jurisdiction.name', 'A jurisdiction must be named.');
        }
        // Never both. A jurisdiction has one code, or covers several
        // subdivisions; carrying both leaves it ambiguous which is authoritative.
        //
        // Neither is still permitted for a non-cross-territory jurisdiction,
        // where it is identified by normalised name. That is a deliberate
        // pre-existing allowance — "null is the honest value where no code
        // exists" — and deleting it would force an invented code on exactly the
        // places this phase exists to protect.
        if (!isNullish(j.code) && !isNullish(j.covers)) {
          add('jurisdiction', 'Jurisdiction carries both "code" and "covers"; a jurisdiction '
            + 'has one code, or covers several subdivisions, never both.');
        }

        const parent = countryBySlug.get(j.parentCountry);
        const parentIso2 = parent && S.ISO_3166_1_RE.test(String(parent.iso2)) ? parent.iso2 : null;

        if (!isNullish(j.code)) {
          const problem = S.iso3166_2Problem(j.code);
          if (problem) {
            add('jurisdiction.code', `${JSON.stringify(j.code)} ${problem}.`);
          } else if (!parent) {
            // The prefix check needs a usable parent code. Without one it is not
            // "passed" — it is unperformed, and saying so beats a silent skip.
            add('jurisdiction.code', `Cannot check the prefix of "${j.code}": parent country `
              + `"${j.parentCountry}" is not declared.`);
          } else if (!parentIso2) {
            add('jurisdiction.code', `Cannot check the prefix of "${j.code}": parent `
              + `"${parent.slug}" has no usable ISO 3166-1 code (${JSON.stringify(parent.iso2)}).`);
          } else if (parentIso2 !== j.code.slice(0, 2)) {
            // Reported before the allowlist because "wrong country" is the more
            // specific diagnosis: "US-ON" filed under Canada is a misfiling, not
            // merely an unknown code.
            add('jurisdiction.code',
              `Code "${j.code}" has prefix "${j.code.slice(0, 2)}" but ${parent.name} is "${parentIso2}".`);
          } else {
            // Shape is not existence. "GB-ZZZ" and "GB-EAW" are both well-formed
            // and neither is an ISO 3166-2 subdivision, so the allowlist decides.
            const unknown = S.ISO.unknownCodeProblem(j.code);
            if (unknown) add('jurisdiction.code', `${JSON.stringify(j.code)} ${unknown}.`);
          }
        }

        if (!isNullish(j.covers)) {
          if (!parent) {
            add('jurisdiction.covers', `Cannot check membership: parent country `
              + `"${j.parentCountry}" is not declared.`);
          }
          for (const problem of S.coversProblems(j.covers, parentIso2)) {
            add('jurisdiction.covers', `${problem}.`);
          }
          // Only a cross-territory jurisdiction spans subdivisions. A state or a
          // province that claimed several would be describing something else.
          if (j.type && j.type !== 'cross-territory') {
            add('jurisdiction.covers', `Only jurisdiction type "cross-territory" may carry `
              + `"covers"; this record is "${j.type}".`);
          }
        } else if (j.type === 'cross-territory') {
          add('jurisdiction.covers', 'A "cross-territory" jurisdiction must list the '
            + 'subdivisions it covers.');
        }
        if (!countryBySlug.has(j.parentCountry)) {
          add('jurisdiction.parentCountry', `References unknown country "${j.parentCountry}".`);
        } else if (j.parentCountry !== entry.country) {
          add('jurisdiction.parentCountry',
            `Is "${j.parentCountry}" but the record is filed under "${entry.country}".`);
        }
        if (entry.scope !== 'subnational') {
          add('scope', 'A record carrying a jurisdiction must use scope "subnational".');
        }
        // --- jurisdiction identity (C13) ---------------------------------
        // Compares DEFINITIONS of places, never records. Two California
        // registries are correct and must both pass; what may not differ is
        // what "California" is.
        const identity = S.jurisdictionIdentity(j);
        const nameKey = S.jurisdictionNameKey(j);
        if (identity && j.name) {
          const priorByCode = jurisdictionByCode.get(identity.key);
          if (priorByCode && S.normaliseJurisdictionName(priorByCode.name)
            !== S.normaliseJurisdictionName(j.name)) {
            add('jurisdiction.name', `This jurisdiction is already defined as `
              + `"${priorByCode.name}" (by ${id === priorByCode.id ? 'this record' : priorByCode.id}); `
              + `"${j.name}" conflicts. One jurisdiction cannot have two names.`);
          } else if (!priorByCode) {
            jurisdictionByCode.set(identity.key, { name: j.name, id });
          }

          const priorByName = jurisdictionByName.get(nameKey);
          const thisCode = j.code || null;
          if (priorByName && priorByName.code !== thisCode) {
            add('jurisdiction.code', `"${j.name}" is already defined with code `
              + `${JSON.stringify(priorByName.code)} (by ${priorByName.id}); this record uses `
              + `${JSON.stringify(thisCode)}. One jurisdiction cannot have two codes.`);
          } else if (!priorByName) {
            jurisdictionByName.set(nameKey, { code: thisCode, id });
          }
        }

        // The country must have a word for this kind of jurisdiction. Without
        // this the page would either throw at render or, worse, borrow another
        // country's vocabulary — "Prefectures" in Spain, "Federal" in Italy.
        const allowedTypes = S.allowedJurisdictionTypes(entry.country);
        if (allowedTypes && j.type && !allowedTypes.includes(j.type)) {
          add('jurisdiction.type', `Country "${entry.country}" declares no grouping label for `
            + `"${j.type}". It supports: ${allowedTypes.length ? allowedTypes.join(', ') : '(none)'}. `
            + 'Either the record is misfiled or JURISDICTION_VOCABULARY needs extending.');
        }
      }
    } else if (entry.scope === 'subnational') {
      add('jurisdiction', 'Scope "subnational" requires a jurisdiction object.');
    }

    // --- names --------------------------------------------------------------
    for (const field of ['officialName', 'nativeName', 'englishName']) {
      if (!isNullish(entry[field]) && typeof entry[field] !== 'string') {
        add(field, `Field "${field}" must be a string or null.`);
      }
    }
    if (!isNullish(entry.englishNameSource)
      && !S.ENGLISH_NAME_SOURCES.includes(entry.englishNameSource)) {
      add('englishNameSource', `Must be one of: ${S.ENGLISH_NAME_SOURCES.join(', ')}.`);
    }
    // An English title whose provenance is unstated could be the operator's own
    // name or ours. The reader cannot tell, so the record must.
    if (entry.englishName && !entry.englishNameSource) {
      add('englishNameSource',
        'An englishName must declare whether it is the official name or an editorial translation.');
    }
    if (!entry.englishName && entry.englishNameSource) {
      add('englishNameSource', 'Set without an englishName to describe.');
    }

    // --- registry classification --------------------------------------------
    if (!Array.isArray(entry.registryTypes)) {
      add('registryTypes', 'Field "registryTypes" must be an array.');
    } else {
      for (const t of entry.registryTypes) {
        if (!S.REGISTRY_TYPES.includes(t)) add('registryTypes', `Unknown registry type "${t}".`);
      }
      if (new Set(entry.registryTypes).size !== entry.registryTypes.length) {
        add('registryTypes', 'Contains a duplicate registry type.');
      }
    }
    if (!isNullish(entry.primaryRegistryType)) {
      if (!S.REGISTRY_TYPES.includes(entry.primaryRegistryType)) {
        add('primaryRegistryType', `Unknown registry type "${entry.primaryRegistryType}".`);
      } else if (!(entry.registryTypes || []).includes(entry.primaryRegistryType)) {
        add('primaryRegistryType', 'Must also appear in registryTypes.');
      }
    } else if (Array.isArray(entry.registryTypes) && entry.registryTypes.length) {
      add('primaryRegistryType', 'Registry types are recorded but none is marked primary.');
    }

    // --- classification invariants ------------------------------------------
    // Structural only. Which of company-register or business-entity-register
    // fits a given system is an editorial reading of its official scope
    // statement, and the glossary in bd-registry-types.cjs is where that
    // judgement is argued — not something a validator can decide. What CAN be
    // checked mechanically are the couplings that would be self-contradictory.
    const types = Array.isArray(entry.registryTypes) ? entry.registryTypes : [];

    // A federated search layer is not usually a single jurisdiction's system.
    // Documented exceptions are allowed, but must be argued in editorNotes so
    // the exception is visible rather than silent.
    if (types.includes('cross-border-registry-interface')
      && !['supranational', 'regional', 'global'].includes(entry.scope)
      && !/cross-border/i.test(entry.editorNotes || '')) {
      add('registryTypes', 'A cross-border-registry-interface normally carries supranational, '
        + 'regional or global scope. Keep the narrower scope only if editorNotes explains why.');
    }
    // An identifier lookup is not thereby the legal register of the entity.
    // Claiming both needs the evidence to say so.
    if (types.includes('corporate-number-database') && types.includes('company-register')
      && !/register of record|legal register|company register/i.test(entry.editorNotes || '')) {
      add('registryTypes', 'A corporate-number-database is not automatically a company-register. '
        + 'Record both only where editorNotes cites evidence for the constitutive function.');
    }
    // Filing plus constitutive function is common and legitimate — Companies
    // House is both — but it should be a considered call, not a default.
    if (types.includes('public-filing-database') && types.includes('company-register')
      && !/filing|filed|accounts|disclosur/i.test(entry.editorNotes || '')
      && !/filing|filed|accounts|disclosur/i.test(entry.description || '')) {
      add('registryTypes', 'company-register with public-filing-database requires evidence of the '
        + 'filing function in the description or editorNotes.');
    }
    // Government and regulator records are the point of this wave; publishing
    // one unclassified leaves the taxonomy hollow.
    if (['government', 'finance'].includes(entry.category)
      && entry.verification && entry.verification.status === 'verified'
      && types.length === 0) {
      add('registryTypes', `A verified ${entry.category} record must record at least one registry type.`);
    }

    // --- resourceIdentity ---------------------------------------------------
    if (!isNullish(entry.resourceIdentity)) {
      const ri = entry.resourceIdentity;
      if (typeof ri !== 'object' || Array.isArray(ri)) {
        add('resourceIdentity', 'Field "resourceIdentity" must be an object or null.');
      } else {
        const problem = S.canonicalDomainProblem(ri.canonicalDomain);
        if (problem) {
          add('resourceIdentity.canonicalDomain', `${JSON.stringify(ri.canonicalDomain)} ${problem}.`);
        } else {
          const actual = canonicalDomain(entry.website);
          if (actual && actual !== ri.canonicalDomain) {
            add('resourceIdentity.canonicalDomain', `Declared "${ri.canonicalDomain}" but the `
              + `website resolves to "${actual}".`);
          }
        }
        if (typeof ri.systemKey !== 'string' || !ri.systemKey.trim()) {
          add('resourceIdentity.systemKey', 'A systemKey is required and must be a non-empty string.');
        }
        if (!isNullish(ri.sharedHostGroup)
          && (typeof ri.sharedHostGroup !== 'string' || !ri.sharedHostGroup.trim())) {
          add('resourceIdentity.sharedHostGroup', 'Must be a non-empty string, or null.');
        }
      }
    }

    // --- operator -----------------------------------------------------------
    if (!isNullish(entry.operator)) {
      const o = entry.operator;
      if (typeof o !== 'object' || Array.isArray(o)) {
        add('operator', 'Field "operator" must be an object or null.');
      } else {
        if (typeof o.name !== 'string' || !o.name.trim()) {
          add('operator.name', 'An operator must be named.');
        }
        if (!S.OPERATOR_TYPES.includes(o.type)) {
          add('operator.type', `Must be one of: ${S.OPERATOR_TYPES.join(', ')}.`);
        }
        if (!isNullish(o.officialUrl)
          && (typeof o.officialUrl !== 'string' || !o.officialUrl.startsWith('https://'))) {
          add('operator.officialUrl', 'Must be an https URL, or null when not verified.');
        }
      }
    }

    // --- public access ------------------------------------------------------
    if (!isNullish(entry.publicAccess)) {
      const a = entry.publicAccess;
      if (typeof a !== 'object' || Array.isArray(a)) {
        add('publicAccess', 'Field "publicAccess" must be an object or null.');
      } else {
        if (!S.ACCESS_LEVELS.includes(a.accessLevel)) {
          add('publicAccess.accessLevel', `Must be one of: ${S.ACCESS_LEVELS.join(', ')}.`);
        }
        if (!isNullish(a.searchUrl)
          && (typeof a.searchUrl !== 'string' || !a.searchUrl.startsWith('https://'))) {
          add('publicAccess.searchUrl', 'Must be an https URL, or null when not verified.');
        }
        for (const key of S.PUBLIC_ACCESS_BOOLEANS) {
          if (!isNullish(a[key]) && typeof a[key] !== 'boolean') {
            add(`publicAccess.${key}`, 'Must be true, false, or null for unknown.');
          }
        }
        for (const reason of S.accessContradictions(a)) {
          add('publicAccess', `Contradictory access description: ${reason}.`);
        }
      }
    }

    // --- enumerations -------------------------------------------------------
    for (const [field, allowed] of [['tier', S.TIERS], ['backlinkType', S.BACKLINK_TYPES],
      ['robots', S.ROBOTS_STATES]]) {
      if (!isNullish(entry[field]) && !allowed.includes(entry[field])) {
        add(field, `Field "${field}" has invalid value "${entry[field]}". Allowed: ${allowed.join(', ')}.`);
      }
    }
    if (!S.SUBMISSION_MODELS.includes(entry.submissionModel)) {
      add('submissionModel', `Must be one of: ${S.SUBMISSION_MODELS.join(', ')}.`);
    }

    // --- commercial listing schema ------------------------------------------
    // submissionModel above is a COST axis. These four fields carry the action,
    // verification and claim axes, and nothing here may be silently coerced:
    // an invalid value is rejected so it is visible, never repaired.
    // An ABSENT field resolves to its documented default, exactly as the
    // migration does — that is the schema's meaning of absence, not a silent
    // repair. An explicitly WRONG value still fails, which is the distinction
    // the "no silent coercion" rule is actually about.
    const listingAction = isNullish(entry.listingAction)
      ? S.defaultListingAction(entry)
      : entry.listingAction;
    if (!S.LISTING_ACTIONS.includes(listingAction)) {
      add('listingAction', `Must be one of: ${S.LISTING_ACTIONS.join(', ')}.`);
    }

    // A statutory register has no listing concept. The pillar decides this, so a
    // government record may never carry a commercial action.
    const isGovPillar = S.isGovernmentPillar(entry);
    if (isGovPillar && listingAction !== 'not-applicable') {
      add('listingAction', `A ${entry.category} record belongs to the Government Registry pillar and must be "not-applicable", not "${listingAction}".`);
    }
    if (!isGovPillar && listingAction === 'not-applicable') {
      add('listingAction', 'Only a Government Registry pillar record may be "not-applicable".');
    }

    // "apply" asserts that inclusion is gated on certification, membership or
    // eligibility. That gate is the single most important fact about such a
    // platform, so it must reach a READER — a gate recorded only in editorNotes
    // is a gate the audience never learns about. The record must also name an
    // official application route, because "apply" without one is an assertion
    // that a flow exists which nobody located.
    // The apply contract lives in bd-schema so the validator and its tests
    // share one implementation rather than one racing on the registry file.
    for (const [field, message] of S.applyContractProblems({ ...entry, listingAction })) {
      add(field, message);
    }

    // verificationMethods: null and [] are different states and both are legal.
    const vm = entry.verificationMethods === undefined ? null : entry.verificationMethods;
    if (vm !== null) {
      if (!Array.isArray(vm)) {
        add('verificationMethods', 'Must be an array, or null when the methods were never established.');
      } else {
        for (const m of vm) {
          if (!S.VERIFICATION_METHODS.includes(m)) {
            add('verificationMethods', `Contains "${m}". Allowed: ${S.VERIFICATION_METHODS.join(', ')}.`);
          }
        }
        if (new Set(vm).size !== vm.length) {
          add('verificationMethods', 'Contains a duplicate verification method.');
        }
        if (vm.length > 0 && entry.verificationRequired !== true) {
          add('verificationMethods', 'Lists methods, so verificationRequired must be true.');
        }
        if (vm.length === 0 && entry.verificationRequired !== false) {
          add('verificationMethods', 'Is empty, which asserts that no verification is required, so verificationRequired must be false. Use null where the methods were simply never established.');
        }
      }
    } else if (entry.verificationRequired === false && Array.isArray(vm)) {
      add('verificationMethods', 'verificationRequired is false but methods are listed.');
    }
    // "other" is a catch-all, so it must be explained where a reader can see it.
    // The test looks for an explanatory CONSTRUCTION ("verified by ...",
    // "verification is via ..."), not merely the word "verification", which
    // appears in almost any access prose and made an earlier version of this
    // check pass vacuously.
    if (Array.isArray(vm) && vm.includes('other')) {
      const prose = `${entry.description} ${(entry.pros || []).join(' ')} ${(entry.cons || []).join(' ')}`;
      if (!/verif\w*\s+(is|are)?\s*(by|via|through|using)\b|verification method/i.test(prose)) {
        add('verificationMethods', 'Uses "other", which requires a visible explanation of the method in rendered prose — for example "verified by ...".');
      }
    }

    // Reviews existing says nothing about whether an owner may reply.
    if (entry.ownerResponseSupport === true && entry.reviewSystem !== true) {
      add('ownerResponseSupport', 'Is true, but reviewSystem is not true. An owner cannot respond where no review system is established.');
    }

    // claimUrl is an official endpoint, never a guess and never a homepage
    // standing in for one.
    if (!isNullish(entry.claimUrl)) {
      if (typeof entry.claimUrl !== 'string' || !/^https:\/\//.test(entry.claimUrl)) {
        add('claimUrl', 'Must be an absolute https URL, or null when not verified.');
      }
      if (entry.claimUrl === entry.website) {
        add('claimUrl', 'Is identical to the record website. A homepage standing in for a claim interface is not a claim endpoint.');
      }
      if (!['claim', 'create-and-claim'].includes(listingAction)) {
        add('claimUrl', `Is set, but listingAction is "${listingAction}". A claim endpoint requires listingAction "claim" or "create-and-claim".`);
      }
    }
    if (listingAction === 'not-applicable' && !isNullish(entry.claimUrl)) {
      add('claimUrl', 'A not-applicable record must carry claimUrl: null.');
    }
    for (const [field, allowed] of [['submissionDifficulty', S.SUBMISSION_DIFFICULTY],
      ['listingQuality', S.LISTING_QUALITY]]) {
      if (!isNullish(entry[field]) && !allowed.includes(entry[field])) {
        add(field, `Field "${field}" has invalid value "${entry[field]}". Allowed: ${allowed.join(', ')}.`);
      }
    }
    if (!entry.requiredAssets || typeof entry.requiredAssets !== 'object') {
      add('requiredAssets', 'Field "requiredAssets" must be an object.');
    } else {
      for (const key of S.REQUIRED_ASSET_KEYS) {
        if (!(key in entry.requiredAssets)) add('requiredAssets', `Missing asset flag "${key}".`);
        else if (!isNullish(entry.requiredAssets[key]) && typeof entry.requiredAssets[key] !== 'boolean') {
          add('requiredAssets', `Asset flag "${key}" must be true, false, or null.`);
        }
      }
    }
    if (!S.METRIC_STATUSES.includes(entry.metricStatus)) {
      add('metricStatus', `Must be one of: ${S.METRIC_STATUSES.join(', ')}.`);
    }

    // --- tri-state booleans (null means not established) --------------------
    for (const field of S.NULLABLE_BOOLEANS) {
      if (!isNullish(entry[field]) && typeof entry[field] !== 'boolean') {
        add(field, `Field "${field}" must be true, false, or null for unknown.`);
      }
    }

    // --- accepts ------------------------------------------------------------
    if (!entry.accepts || typeof entry.accepts !== 'object' || Array.isArray(entry.accepts)) {
      add('accepts', 'Field "accepts" must be an object of audience flags.');
    } else {
      for (const key of S.ACCEPTS_KEYS) {
        if (!(key in entry.accepts)) {
          add('accepts', `Missing audience flag "${key}". Use null for unknown.`);
        } else if (!isNullish(entry.accepts[key]) && typeof entry.accepts[key] !== 'boolean') {
          add('accepts', `Audience flag "${key}" must be true, false, or null.`);
        }
      }
      for (const key of Object.keys(entry.accepts)) {
        if (!S.ACCEPTS_KEYS.includes(key)) add('accepts', `Unknown audience flag "${key}".`);
      }
    }

    // --- verification -------------------------------------------------------
    const v = entry.verification;
    if (!v || typeof v !== 'object' || Array.isArray(v)) {
      add('verification', 'Field "verification" must be an object.');
    } else {
      if (!S.VERIFICATION_STATUSES.includes(v.status)) {
        add('verification.status', `Must be one of: ${S.VERIFICATION_STATUSES.join(', ')}.`);
      }
      if (!isNullish(v.source) && !S.VERIFICATION_SOURCES.includes(v.source)) {
        add('verification.source', `Must be one of: ${S.VERIFICATION_SOURCES.join(', ')}.`);
      }
      if (!Array.isArray(v.reviewers)) {
        add('verification.reviewers', 'Reviewers must be an array, so multiple reviewers are possible.');
      } else {
        for (const reviewer of v.reviewers) {
          if (!reviewer || typeof reviewer.id !== 'string' || typeof reviewer.name !== 'string') {
            add('verification.reviewers', 'Each reviewer needs an id and a name.');
          }
        }
      }
      if (v.status === 'verified') {
        if (!entry.lastVerified) add('verification.status', 'A verified record must carry lastVerified.');
        if (!v.source) add('verification.source', 'A verified record must record how it was verified.');
        if (Array.isArray(v.reviewers) && v.reviewers.length === 0) {
          add('verification.reviewers', 'A verified record must name at least one reviewer.');
        }
      }
    }

    // --- metrics ------------------------------------------------------------
    for (const field of S.NUMERIC_METRICS) {
      const value = entry[field];
      if (isNullish(value)) continue;
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        add(field, `Field "${field}" must be a finite number or null, got ${JSON.stringify(value)}.`);
      } else if (S.SCORE_FIELDS.includes(field) && (value < 0 || value > 100)) {
        add(field, `Field "${field}" is out of range 0-100: ${value}.`);
      } else if (S.COUNT_FIELDS.includes(field) && value < 0) {
        add(field, `Field "${field}" must not be negative: ${value}.`);
      }
    }

    if (isNullish(entry.lastVerified)) {
      for (const field of S.NUMERIC_METRICS) {
        if (!isNullish(entry[field])) add(field, `Field "${field}" is populated but lastVerified is null.`);
      }
      if (!isNullish(entry.petroHrysScore)) {
        add('petroHrysScore', 'Field "petroHrysScore" is populated but lastVerified is null.');
      }
    }

    for (const field of S.THIRD_PARTY_METRICS) {
      if (isNullish(entry[field])) continue;
      const provenance = (entry.metricsProvenance || {})[field];
      if (!provenance || !provenance.provider || !provenance.measuredAt) {
        add(field, `Third-party metric "${field}" requires provenance (provider and measuredAt).`);
      } else if (!S.DATE_RE.test(provenance.measuredAt)) {
        add(field, `Provenance measuredAt for "${field}" must be an ISO date (YYYY-MM-DD).`);
      }
      if (entry.metricStatus === 'unknown') {
        add('metricStatus', `Metric "${field}" is populated, so metricStatus cannot be "unknown".`);
      }
    }

    // --- PetroHrys Score ----------------------------------------------------
    if (!isNullish(entry.petroHrysScore)) {
      if (typeof entry.petroHrysScore !== 'number' || entry.petroHrysScore < 0 || entry.petroHrysScore > 100) {
        add('petroHrysScore', `Field "petroHrysScore" is out of range 0-100: ${entry.petroHrysScore}.`);
      }
      if (!entry.scoreFactors || typeof entry.scoreFactors !== 'object') {
        add('scoreFactors', 'A published score must record the ten editorial factors it was derived from.');
      } else {
        for (const { key } of S.SCORE_FACTORS) {
          const value = entry.scoreFactors[key];
          if (typeof value !== 'number' || value < 0 || value > 10) {
            add('scoreFactors', `Factor "${key}" must be a number from 0 to 10.`);
          }
        }
        const expected = S.computeScore(entry.scoreFactors);
        if (expected !== null && expected !== entry.petroHrysScore) {
          add('petroHrysScore',
            `Score ${entry.petroHrysScore} does not match its weighted factors, which give ${expected}.`);
        }
      }
    }

    // --- arrays, dates, uniqueness ------------------------------------------
    for (const field of S.ARRAY_FIELDS) {
      const value = entry[field];
      if (!Array.isArray(value)) add(field, `Field "${field}" must be an array of strings.`);
      else if (!value.every((item) => typeof item === 'string')) {
        add(field, `Field "${field}" must contain only strings.`);
      }
    }
    if (!isNullish(entry.editorNotes) && typeof entry.editorNotes !== 'string') {
      add('editorNotes', 'Field "editorNotes" must be a string.');
    }
    for (const field of ['lastVerified', 'nextVerification']) {
      if (!isNullish(entry[field]) && !S.DATE_RE.test(entry[field])) {
        add(field, `Field "${field}" must be an ISO date (YYYY-MM-DD).`);
      }
    }
    if (entry.lastVerified && entry.nextVerification && !(entry.nextVerification > entry.lastVerified)) {
      add('nextVerification', 'nextVerification must be later than lastVerified.');
    }

    if (id !== null) {
      if (seenId.has(id)) add('id', `Duplicate id "${id}".`);
      seenId.add(id);
    }
    if (typeof entry.country === 'string' && typeof entry.slug === 'string') {
      const slugKey = `${entry.country}/${entry.slug}`;
      if (seenSlug.has(slugKey)) add('slug', `Duplicate slug "${entry.slug}" within country "${entry.country}".`);
      seenSlug.add(slugKey);

      // Per country only: one service may legitimately serve several countries.
      //
      // Sharing a domain is allowed ONLY through resourceIdentity, and only when
      // every record on that domain declares the same sharedHostGroup, carries
      // its own systemKey, and points somewhere materially different. Anything
      // short of that is the ordinary duplicate this guard exists to catch.
      const domain = canonicalDomain(entry.website);
      if (domain) {
        const domainKey = `${entry.country}/${domain}`;
        const prior = seenDomain.get(domainKey);
        const ri = entry.resourceIdentity;
        if (prior) {
          const priorRi = prior.resourceIdentity;
          if (!ri || !ri.sharedHostGroup) {
            add('website', `Duplicate canonical domain "${domain}" within country `
              + `"${entry.country}" (first seen on "${prior.id}"). Two records may share an `
              + 'official host only when both declare resourceIdentity with a sharedHostGroup.');
          } else if (!priorRi || !priorRi.sharedHostGroup) {
            add('website', `Shares domain "${domain}" with "${prior.id}", which declares no `
              + 'sharedHostGroup. Every record on a shared host must declare one.');
          } else if (priorRi.sharedHostGroup !== ri.sharedHostGroup) {
            add('resourceIdentity.sharedHostGroup', `Is "${ri.sharedHostGroup}" but "${prior.id}" on `
              + `the same domain "${domain}" declares "${priorRi.sharedHostGroup}". Records sharing a `
              + 'host must share one group.');
          } else {
            // Same group: the systems must genuinely differ.
            if (priorRi.systemKey === (ri.systemKey || null)) {
              add('resourceIdentity.systemKey', `Duplicates the systemKey of "${prior.id}".`);
            }
            const priorSearch = (prior.publicAccess || {}).searchUrl || prior.website;
            const thisSearch = (entry.publicAccess || {}).searchUrl || entry.website;
            if (!S.urlsAreMateriallyDifferent(prior.website, entry.website)
              && !S.urlsAreMateriallyDifferent(priorSearch, thisSearch)) {
              add('website', `Is not materially different from "${prior.id}" on the same host. A `
                + 'landing page, a language variant, a query-parameter variant or a search mode of '
                + 'one registry is not a separate system.');
            }
          }
        }
        if (!prior) seenDomain.set(domainKey, entry);
      }
    }
  }

  // systemKey is a global identifier, and a sharedHostGroup names ONE host.
  // Both are checked across the whole registry rather than per country, so a
  // key cannot be reused in another file and a group cannot be stretched over
  // unrelated domains to smuggle two duplicates past the guard.
  const seenSystemKey = new Map();
  const groupDomains = new Map();
  for (const entry of directories) {
    const ri = entry.resourceIdentity;
    if (!ri || !ri.systemKey) continue;
    const where = { file: fileFor(entry), id: entry.id };
    if (seenSystemKey.has(ri.systemKey)) {
      errors.push({
        ...where,
        field: 'resourceIdentity.systemKey',
        reason: `systemKey "${ri.systemKey}" is already used by "${seenSystemKey.get(ri.systemKey)}". `
          + 'Every systemKey must be globally unique.',
      });
    } else seenSystemKey.set(ri.systemKey, entry.id);

    if (!ri.sharedHostGroup) continue;
    const known = groupDomains.get(ri.sharedHostGroup);
    if (known && known.domain !== ri.canonicalDomain) {
      errors.push({
        ...where,
        field: 'resourceIdentity.sharedHostGroup',
        reason: `Group "${ri.sharedHostGroup}" already covers domain "${known.domain}" (on `
          + `"${known.id}"); this record declares "${ri.canonicalDomain}". A shared-host group names `
          + 'one host and may not span unrelated domains.',
      });
    } else if (!known) {
      groupDomains.set(ri.sharedHostGroup, { domain: ri.canonicalDomain, id: entry.id });
    }
  }

  // A Domain Rating is a fact about a domain, so the dataset holds exactly one
  // snapshot per measured domain. Checked across the whole registry rather than
  // per country: one domain can legitimately carry records in two countries, and
  // they must still agree on what was measured and when.
  for (const problem of S.sharedDomainSnapshotProblems(directories)) {
    const entry = directories.find((d) => d.id === problem.id);
    errors.push({
      file: entry ? fileFor(entry) : '(unknown)',
      id: problem.id,
      field: problem.field,
      reason: problem.reason,
    });
  }

  // Relations are checked once every id is known, so a forward reference to a
  // record defined in a later file is still valid.
  const allIds = new Set(directories.map((d) => d.id).filter(Boolean));
  for (const entry of directories) {
    const file = fileFor(entry);
    const id = typeof entry.id === 'string' && entry.id ? entry.id : null;
    const add = (field, reason) => errors.push({ file, id, field, reason });
    const related = entry.related;
    if (!related || typeof related !== 'object' || Array.isArray(related)) {
      add('related', 'Field "related" must be an object of editorial relation lists.');
      continue;
    }
    for (const kind of Object.keys(related)) {
      if (!S.RELATION_KINDS.includes(kind)) add('related', `Unknown relation kind "${kind}".`);
    }
    for (const kind of S.RELATION_KINDS) {
      const list = related[kind];
      if (!Array.isArray(list)) {
        add('related', `Relation "${kind}" must be an array of directory ids.`);
        continue;
      }
      if (new Set(list).size !== list.length) add('related', `Relation "${kind}" repeats an id.`);
      for (const target of list) {
        if (typeof target !== 'string') { add('related', `Relation "${kind}" must contain ids.`); continue; }
        if (target === id) add('related', `Relation "${kind}" points at the record itself.`);
        else if (!allIds.has(target)) add('related', `Relation "${kind}" points at unknown id "${target}".`);
      }
    }
  }

  errors.sort((a, b) => cmp(a.file, b.file) || cmp(a.id, b.id)
    || cmp(a.field, b.field) || cmp(a.reason, b.reason));

  return { ok: errors.length === 0, errors };
}

function formatReport(result) {
  if (result.ok) return 'Business directories registry is valid.';
  const lines = result.errors.map(
    (e) => `  ${e.file} [${e.id ?? '(no id)'}] ${e.field}: ${e.reason}`);
  const count = result.errors.length;
  return `${lines.join('\n')}\n\n${count} validation error${count === 1 ? '' : 's'}.`;
}

if (require.main === module) {
  const result = validateRegistry(loadRegistry());
  if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else console.log(formatReport(result));
  if (!result.ok) process.exit(1);
}

module.exports = { validateRegistry, formatReport };
