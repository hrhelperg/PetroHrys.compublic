'use strict';

// The regional gate, tested on the cases that would break the registry's
// premise if it ever got them wrong.

const test = require('node:test');
const assert = require('node:assert');

const D = require('../lib/regional-media-discovery.cjs');
const DFS = require('../lib/dataforseo.cjs');
const EXPAND = require('../expand-regional-media.cjs');

const gate = (input) => D.classifyRegionalEvidence({
  classId: 'Q11032', classLabel: 'newspaper', description: '', rootKind: 'newspaper', ...input,
});

test('a head office is never on its own a claim to regional coverage', () => {
  // Le Monde: headquartered in Paris, described only as "French daily evening
  // newspaper", Domain Rating in the nineties. Admitting it on the head office
  // is the exact failure this gate exists to prevent.
  const verdict = gate({
    classId: 'Q1110794',
    classLabel: 'daily newspaper',
    description: 'French daily evening newspaper | französische Tageszeitung',
    hasPlace: true,
    placeName: 'Paris',
  });
  assert.strictEqual(verdict.eligible, false);
  assert.match(verdict.reason, /head office/);
});

test('an explicit national description is refused even with a place', () => {
  const verdict = gate({ description: 'Spanish national daily newspaper', hasPlace: true, placeName: 'Madrid' });
  assert.strictEqual(verdict.eligible, false);
  assert.match(verdict.reason, /national/);
});

test('a class that MEANS local outranks a terse or contradictory description', () => {
  const verdict = gate({ classId: 'Q1868552', classLabel: 'local newspaper', description: '' });
  assert.deepStrictEqual(verdict, { eligible: true, evidence: 'regional-class' });
});

test('regional descriptions are read in every language, not only English', () => {
  for (const [language, description] of [
    ['German', 'Regionalzeitung aus Köln'],
    ['Norwegian', 'lokalavis i Bodø'],
    ['Japanese', '日本の地方紙'],
    ['Polish', 'gazeta lokalna w Krakowie'],
    ['Finnish', 'paikallislehti Turussa'],
    ['Portuguese', 'jornal regional de Minas Gerais'],
    ['Ukrainian', 'обласна газета'],
  ]) {
    const verdict = gate({ description, hasPlace: true, placeName: 'x' });
    assert.strictEqual(verdict.eligible, true, `${language}: ${description}`);
    assert.strictEqual(verdict.evidence, 'regional-description', language);
  }
});

test('a licensed broadcast station earns its locality; a newspaper does not', () => {
  const station = gate({
    classId: 'Q1616075', classLabel: 'television station', rootKind: 'television station',
    description: 'television station in Raleigh, North Carolina', hasPlace: true, placeName: 'Raleigh',
  });
  assert.strictEqual(station.evidence, 'licensed-local-broadcast');
  const paper = gate({ description: 'newspaper', hasPlace: true, placeName: 'Raleigh' });
  assert.strictEqual(paper.eligible, false);
});

test('a structured jurisdiction outranks a missing description', () => {
  const verdict = gate({ description: 'newspaper', hasSubnationalScope: true, hasPlace: true, placeName: 'Bavaria' });
  assert.strictEqual(verdict.evidence, 'structured-jurisdiction');
});

test('classes that carry no regional newsroom are refused before any query runs', () => {
  for (const [id, label] of [
    ['Q738377', 'student newspaper'],
    ['Q2065227', 'government gazette'],
    ['Q11389521', 'national newspaper'],
    ['Q120068370', 'newspaper chain'],
    ['Q877017', 'pirate radio'],
    ['Q1580166', 'dictionary entry'],
  ]) {
    const verdict = gate({ classId: id, classLabel: label, description: 'local paper', hasPlace: true, placeName: 'x' });
    assert.strictEqual(verdict.eligible, false, label);
  }
});

test('an unenumerated class is still refused on what it calls itself', () => {
  const verdict = gate({
    classId: 'Q999999999', classLabel: 'national public service broadcaster',
    description: 'local station', hasPlace: true, placeName: 'Oslo',
  });
  assert.strictEqual(verdict.eligible, false);
  assert.match(verdict.reason, /class label/);
});

test('Q1580166 is a dictionary entry and is not a discovery root', () => {
  // The starting code listed it as "news website", which pulled Wiktionary
  // pages and ghost words into a media registry.
  assert.ok(!Object.keys(D.WIKIDATA_ROOTS).includes('Q1580166'));
  assert.ok(D.EXCLUDED_CLASSES.has('Q1580166'));
});

test('host rejection names one rule for every non-publisher surface', () => {
  for (const [host, url, pattern] of [
    ['medium.com', 'https://medium.com/x', /shared publishing/],
    ['archive.org', 'https://archive.org', /archive/],
    ['wabash.edu', 'https://wabash.edu', /university|academic/],
    ['example.gov', 'https://example.gov', /government/],
    ['prnewswire.com', 'https://prnewswire.com', /aggregator|wire|directory/],
    ['bbc.co.uk', 'https://bbc.co.uk', /national broadcaster|national title/],
    ['facebook.com', 'https://facebook.com/paper', /social/],
    ['example.com', 'https://example.com/news/story.html', /article page/],
    ['example.com', 'https://example.com/search', /section or search/],
  ]) {
    const reason = D.hostRejection(host, url);
    assert.ok(reason, `${host} was not refused`);
    assert.match(reason, pattern, host);
  }
  assert.strictEqual(D.hostRejection('lokalavisen.no', 'https://lokalavisen.no'), null);
  assert.strictEqual(D.hostRejection('al.com', 'https://www.al.com/press-register'), null);
});

test('a subdomain is refused because its Domain Rating belongs to its parent', () => {
  // Measuring bhfm.globo.com returns globo.com's 91, and publishing that as a
  // Belo Horizonte station's authority is the clearest false-authority failure
  // in the whole pipeline.
  for (const host of ['bhfm.globo.com', 'tv.cctv.com', 'arabic.euronews.com',
    'busturialdea.hitza.eus', 'france3-regions.franceinfo.fr']) {
    assert.ok(D.hostRejection(host, `https://${host}`), `${host} was accepted`);
  }
  // A country-code second-level suffix is not a subdomain.
  for (const host of ['nsctotal.com.br', 'theborneopost.com', 'sn.dk',
    'baguiomidlandcourier.com.ph', 'zululandobserver.co.za', 'kentonline.co.uk']) {
    assert.strictEqual(D.isSubdomain(host), false, host);
  }
  assert.ok(D.isSubdomain('noe.orf.at'));
});

test('a national broadcaster is refused through its regional subdomains too', () => {
  assert.ok(D.isNationalBroadcasterHost('orf.at'));
  assert.ok(D.isNationalBroadcasterHost('noe.orf.at'), 'ORF Lower Austria carries orf.at authority');
  assert.ok(D.isNationalBroadcasterHost('tv.cctv.com'));
  assert.ok(!D.isNationalBroadcasterHost('bbc-radio-fanclub.example.com'));
});

test('a scope that names the planet or a continent is not a jurisdiction', () => {
  for (const scope of ['worldwide', 'Europe', 'Africa', 'Latin America', 'international']) {
    assert.ok(D.NON_SUBNATIONAL_SCOPE.test(scope), scope);
    const verdict = D.classifyRegionalEvidence({
      classId: 'Q11032', classLabel: 'newspaper', description: 'newspaper',
      hasSubnationalScope: true, scopeName: scope, rootKind: 'newspaper',
    });
    assert.strictEqual(verdict.eligible, false, scope);
  }
  assert.strictEqual(D.classifyRegionalEvidence({
    classId: 'Q11032', classLabel: 'newspaper', description: 'newspaper',
    hasSubnationalScope: true, scopeName: 'Bavaria', rootKind: 'newspaper',
  }).evidence, 'structured-jurisdiction');
});

test('coverage claims never overshoot what the evidence establishes', () => {
  // No level named, so the most modest claim the schema offers.
  assert.strictEqual(D.coverageTypeFor({ description: '', classId: 'Q11032' }), 'local-area');
  assert.strictEqual(D.coverageTypeFor({ description: 'county newspaper', classId: 'Q11032' }), 'county-district');
  assert.strictEqual(D.coverageTypeFor({ description: '', classId: 'Q2138556' }), 'region');
  assert.strictEqual(D.coverageTypeFor({ description: '', licensedBroadcast: true }), 'metro-city');
});

test('a newsroom has to be visible on the page before a station is published', () => {
  const html = '<html><head><title>KXYZ</title></head><body><nav>Music Contests</nav></body></html>';
  assert.deepStrictEqual(EXPAND.newsroomSignal(html, 'Music Contests', 'KXYZ'), []);
  const newsy = '<link type="application/rss+xml"><h2>Local News</h2><time>2026-08-30</time>';
  assert.ok(EXPAND.newsroomSignal(newsy, 'Local News', 'KXYZ Nachrichten').length >= 2);
});

test('a protected host may only be published on evidence that is not the page', () => {
  const blocked = { site: { state: 'protected' }, regionalEvidence: 'licensed-local-broadcast' };
  assert.strictEqual(EXPAND.newsroomEstablished(blocked), false);
  assert.strictEqual(EXPAND.newsroomEstablished({ ...blocked, regionalEvidence: 'regional-class' }), true);
  assert.strictEqual(EXPAND.newsroomEstablished({ site: { state: 'live', newsroom: [] } }), false);
  assert.strictEqual(EXPAND.newsroomEstablished({ site: { state: 'live', newsroom: ['dated-content'] } }), true);
});

test('DataForSEO is consulted only where the direct probe was ambiguous', () => {
  assert.strictEqual(DFS.shouldConsult({ state: 'live' }), false);
  assert.strictEqual(DFS.shouldConsult({ state: 'redirected' }), false);
  assert.strictEqual(DFS.shouldConsult({ state: 'failed', status: 404 }), false);
  assert.strictEqual(DFS.shouldConsult({ state: 'protected', status: 403 }), true);
  assert.strictEqual(DFS.shouldConsult({ state: 'failed', error: 'timeout' }), true);
  assert.strictEqual(DFS.shouldConsult({ state: 'failed', status: 503 }), true);
});

test('DataForSEO exposes no accessor that could be mistaken for a Domain Rating', () => {
  // The registry publishes exactly one metric and publishes it as an Ahrefs
  // reading. A DataForSEO rank rendered under "Domain Rating by Ahrefs" would
  // be a fabrication, so the module simply has no way to return one.
  assert.deepStrictEqual(
    Object.keys(DFS).filter((key) => /rating|rank|authority|score|dr\b/i.test(key)),
    [],
  );
  assert.strictEqual(typeof DFS.siteIndexed, 'function');
  assert.strictEqual(typeof DFS.configured, 'function');
});

test('the audit and the viability gate are the same rule', () => {
  // If these ever diverge, selection can take a candidate the audit refuses,
  // and the wave ships a record nobody agreed to publish.
  const findings = { candidates: {
    good: {
      macroRegion: 'europe', subregion: 'northern-europe', name: 'Bodø Lokalavis',
      host: 'lokalavisen.no', website: 'https://lokalavisen.no', countryName: 'Norway',
      coverageArea: 'Bodø', regionalEvidence: 'regional-class',
      domainRating: { value: 44 }, site: { state: 'live', newsroom: ['newsroom-vocabulary'], title: 'Lokalavisen' },
    },
    subdomainAuthority: {
      macroRegion: 'europe', subregion: 'western-europe', name: 'ORF Lower Austria',
      host: 'noe.orf.at', website: 'https://noe.orf.at', countryName: 'Austria',
      coverageArea: 'Lower Austria', regionalEvidence: 'regional-class',
      domainRating: { value: 89 }, site: { state: 'live', newsroom: ['newsroom-vocabulary'], title: 'ORF' },
    },
    capitalOnWeakEvidence: {
      macroRegion: 'africa', subregion: 'western-africa', name: 'Joy Online',
      host: 'myjoyonline.com', website: 'https://myjoyonline.com', countryName: 'Ghana',
      coverageArea: 'Accra', regionalEvidence: 'licensed-local-broadcast',
      domainRating: { value: 76 }, site: { state: 'live', newsroom: ['newsroom-vocabulary'], title: 'MyJoyOnline' },
    },
  } };
  assert.deepStrictEqual(EXPAND.viable(findings).map((row) => row.host), ['lokalavisen.no']);
  for (const key of ['subdomainAuthority', 'capitalOnWeakEvidence']) {
    const problems = EXPAND.falseAuthorityProblems(findings.candidates[key], { includeAdvisory: false });
    assert.ok(problems.length, `${key} should be refused`);
    assert.ok(problems.every(([, , severity]) => severity === 'blocking'));
  }
});

test('the false-authority audit catches a national title wearing a regional coat', () => {
  const national = {
    name: 'Example National', host: 'example.fr', website: 'https://example.fr',
    countryName: 'France', coverageArea: 'Paris', regionalEvidence: 'regional-description',
    domainRating: { value: 91 }, site: { state: 'live', newsroom: ['newsroom-vocabulary'], title: 'The national daily' },
  };
  const problems = EXPAND.falseAuthorityProblems(national);
  const fields = problems.map(([field]) => field);
  assert.ok(fields.includes('coverageArea'));
  assert.ok(fields.includes('site.title'));
  assert.ok(fields.includes('domainRating'));
  // High authority on thin evidence is refused outright. It started as an
  // advisory and the first list it produced was myspace.com at DR 92,
  // iheart.com at 91, nfl.com at 89 and faz.net at 90 — all typed in Wikidata
  // as broadcast stations with an address.
  assert.ok(problems.every(([, , severity]) => severity === 'blocking'));
  assert.ok(problems.some(([, reason]) => /national-title authority/.test(reason)));

  const clean = {
    name: 'Bodø Lokalavis', host: 'lokalavisen.no', website: 'https://lokalavisen.no',
    countryName: 'Norway', coverageArea: 'Bodø', regionalEvidence: 'regional-class',
    domainRating: { value: 44 }, site: { state: 'live', newsroom: ['newsroom-vocabulary'], title: 'Lokalavisen' },
  };
  assert.deepStrictEqual(EXPAND.falseAuthorityProblems(clean), []);
});

test('the published corpus and Media, PR & Publishing are both blocklists', () => {
  const blocked = EXPAND.blockedHosts();
  const corpus = require('../../data/regional-media/regional-media.json');
  const media = require('../../data/media-pr-publishing/media-platforms.json');
  const S = require('../lib/regional-media-schema.cjs');
  for (const row of corpus.slice(0, 50)) assert.ok(blocked.has(S.normaliseHost(row.website)));
  for (const row of media.slice(0, 50)) assert.ok(blocked.has(S.normaliseHost(row.website)));
  assert.deepStrictEqual(EXPAND.dedupe([{
    name: 'Duplicate', host: S.normaliseHost(corpus[0].website), website: corpus[0].website,
  }]), []);
});
