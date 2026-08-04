// scripts/lib/bd-articles.cjs
'use strict';
const { escapeHtml } = require('./bd-util.cjs');
const { sortDirectories } = require('./bd-sort.cjs');
const routes = require('./bd-routes.cjs');
const S = require('./bd-schema.cjs');

// Editorial articles built FROM the verified registry. Every list, count and
// table cell in an article is derived from the dataset at build time, so an
// article can never claim something the data does not contain. Where the data
// is thin, the article says so in the page rather than glossing over it.

const UNKNOWN = '<span class="bd-metric bd-metric--empty">Unknown</span>';

const DIFFICULTY = { 'very-easy': 'Very easy', easy: 'Easy', moderate: 'Moderate', hard: 'Hard' };
// Sourced from the schema so a new submission model can never render as
// "undefined" in a guide table.
const SUBMISSION = {
  free: 'Free', paid: 'Paid', freemium: 'Freemium',
  notApplicable: 'Not a submission target', unknown: 'Unknown',
};

const bool = (v) => (v === true ? 'Yes' : v === false ? 'No' : UNKNOWN);
const text = (v) => (v ? escapeHtml(v) : UNKNOWN);

// --- data-driven fragments --------------------------------------------------

const COLUMNS = [
  { head: 'Directory', cell: (d) => `<a href="${routes.directoryPathFor(d)}">${escapeHtml(d.name)}</a>`, row: true },
  { head: 'Country', cell: (d) => `<a href="${routes.countryPath(d.country)}">${escapeHtml(d.country)}</a>` },
  { head: 'Category', cell: (d) => `<a href="${routes.categoryPath(d.country, d.category)}">${escapeHtml(d.category)}</a>` },
  { head: 'Scope', cell: (d) => text(d.scope === 'unknown' ? null : d.scope) },
  { head: 'Submission', cell: (d) => (SUBMISSION[d.submissionModel] === 'Unknown' ? UNKNOWN : SUBMISSION[d.submissionModel]) },
  { head: 'Verification required', cell: (d) => bool(d.verificationRequired) },
  { head: 'Review system', cell: (d) => bool(d.reviewSystem) },
  { head: 'PetroHrys Score', cell: (d) => (d.petroHrysScore === null ? UNKNOWN : String(d.petroHrysScore)) },
];

function comparisonTable(records, caption) {
  if (!records.length) {
    return `      <p class="bd-empty">The verified dataset contains no directories matching this selection yet.</p>`;
  }
  const head = COLUMNS.map((c) => `            <th class="bd-cell" scope="col">${escapeHtml(c.head)}</th>`).join('\n');
  const rows = records.map((d) => {
    const cells = COLUMNS.map((c) => (c.row
      ? `            <th class="bd-cell" scope="row">${c.cell(d)}</th>`
      : `            <td class="bd-cell">${c.cell(d)}</td>`)).join('\n');
    return `          <tr class="bd-row">\n${cells}\n          </tr>`;
  }).join('\n');
  return `      <table class="bd-table">
        <caption class="bd-caption">${escapeHtml(caption)}</caption>
        <thead>
          <tr>
${head}
          </tr>
        </thead>
        <tbody>
${rows}
        </tbody>
      </table>`;
}

function bullets(items) {
  if (!items.length) return '      <p class="bd-empty">Nothing recorded yet.</p>';
  return `      <ul class="bd-list">\n${items.map((i) => `        <li>${i}</li>`).join('\n')}\n      </ul>`;
}

function paras(text_) {
  return text_.trim().split('\n\n').map((p) => `      <p>${p.trim()}</p>`).join('\n');
}

function faqBlock(faqs) {
  const items = faqs.map(({ q, a }) => `        <div class="bd-faq-item">
          <h3 class="bd-faq-q">${escapeHtml(q)}</h3>
          <p class="bd-faq-a">${escapeHtml(a)}</p>
        </div>`).join('\n');
  return `      <div class="bd-faq">\n${items}\n      </div>`;
}

function section(id, heading, body) {
  return `    <section class="bd-section" aria-labelledby="${id}">
      <h2 id="${id}">${escapeHtml(heading)}</h2>
${body}
    </section>`;
}

// States how much of the dataset an article rests on. Printed on the page, so a
// reader can judge the strength of the evidence rather than taking it on trust.
function coverage(count, total, what) {
  return `      <p class="bd-note">Evidence base: ${count} of ${total} verified directories in the `
    + `PetroHrys dataset ${escapeHtml(what)}. Every figure and table on this page is generated from `
    + `those records at build time. Fields that were never established are shown as Unknown rather `
    + `than filled in.</p>`;
}

// The state of the third-party metrics, stated from the registry rather than
// asserted in prose. These sentences were written when nothing had been
// measured; six Domain Ratings were recorded later and the prose silently went
// stale. Deriving it means the page cannot claim a field is empty while a record
// populates it. Articles write {{METRICS}} and it is resolved at build time.
const METRIC_LABELS = {
  domainRating: 'Domain Rating',
  authorityScore: 'Authority Score',
  estimatedTraffic: 'estimated traffic',
  referringDomains: 'referring-domain counts',
};

function joinNames(list) {
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

function metricStatusSentence(D) {
  const keys = Object.keys(METRIC_LABELS);
  const measured = keys.filter((k) => D.some((d) => d[k] !== null && d[k] !== undefined));
  const absent = keys.filter((k) => !measured.includes(k));
  const parts = [];
  if (measured.length) {
    const counts = measured.map((k) => {
      const n = D.filter((d) => d[k] !== null && d[k] !== undefined).length;
      return `${METRIC_LABELS[k]} is recorded on ${n} of ${D.length} records`;
    });
    parts.push(`${joinNames(counts)}, `
      + 'each value carrying the provider that produced it and the date it was measured.');
  }
  if (absent.length) {
    parts.push(`No measurement source has been consulted for ${joinNames(absent.map((k) => METRIC_LABELS[k]))}, `
      + `so ${absent.length === 1 ? 'it is' : 'they are'} null across the dataset.`);
  }
  parts.push('None of them is a PetroHrys measurement. Domain Rating and the PetroHrys Score are '
    + 'ranked separately and are never combined into one number: Domain Rating measures the domain '
    + 'as Ahrefs sees it on the measurement date, while the PetroHrys Score assesses the '
    + 'directory\u2019s practical value to a business. A Domain Rating is a dated historical '
    + 'snapshot that may change, and it does not guarantee a dofollow link, indexing, referral '
    + 'traffic or any ranking improvement, nor does it show that a particular profile page inherits '
    + 'the authority of the domain it sits on. The value describes the domain that was measured, '
    + 'which for a marketplace hosted on a parent domain is that parent domain rather than the '
    + 'marketplace path.');
  return parts.join(' ');
}

// --- selectors ---------------------------------------------------------------

const sel = {
  global: (D) => D.filter((d) => d.country === 'global'),
  national: (D) => D.filter((d) => d.country !== 'global'),
  accepts: (key) => (D) => D.filter((d) => d.accepts[key] === true),
  category: (key) => (D) => D.filter((d) => d.category === key),
  reviews: (D) => D.filter((d) => d.reviewSystem === true),
  freeSubmission: (D) => D.filter((d) => d.submissionModel === 'free'),
};

// --- article definitions -----------------------------------------------------
// Prose is written once, here. Counts and tables are computed at build time.

const ARTICLES = [
  {
    slug: 'top-global-business-directories',
    title: 'Top Global Business Directories',
    description: 'The globally-scoped business directories in the verified PetroHrys dataset, ranked by editorial score.',
    select: sel.global, what: 'are globally scoped',
    intro: `A globally scoped directory is one whose editorial coverage is not tied to a single jurisdiction. That is a different question from where the operating company is registered: a directory headquartered in California but used identically by a business in Munich is global in scope, and this dataset records scope rather than headquarters.

Global directories are usually the first ones worth considering, because a listing on one is portable. It does not stop being useful when a company opens an office in another country.`,
    audience: `Companies operating in more than one market, software vendors selling internationally, and any organisation that wants a small number of durable listings rather than a long tail of national ones.`,
    guidance: `Score reflects editorial usefulness, not popularity. A directory can be very large and still score modestly if a listing there is worth little. Read the score alongside the submission model: a free listing on a moderately scored directory is often a better use of an afternoon than a paid listing on a higher-scoring one.`,
    faqs: [
      { q: 'Does a high PetroHrys Score mean a directory sends more traffic?', a: 'No. The score measures editorial usefulness — trust, verification rigour, spam resistance, stability and transparency. It is not a traffic or authority metric, and no traffic figures are recorded in this dataset.' },
      { q: 'Are these ranked by domain authority?', a: 'No. {{METRICS}} Ranking is by the first-party editorial score only.' },
    ],
  },
  {
    slug: 'best-developer-directories',
    title: 'Best Developer Directories',
    description: 'Directories and registries in the verified dataset that accept developer tools, libraries and packages.',
    select: sel.accepts('developer'), what: 'accept developer tools',
    intro: `Developer-facing directories are mostly package registries and platform marketplaces rather than business listings. The distinction matters: you do not submit a company to crates.io, you publish an artefact. What is being listed is a library, an extension or an image, and the audience is people who will install it.

That changes what a listing is for. A registry entry is distribution, not marketing.`,
    audience: `Teams shipping libraries, SDKs, CLI tools, IDE extensions or container images, and companies whose product is consumed by developers.`,
    guidance: `Publishing to a language registry is normally free and fast, and the real work is documentation rather than approval. Platform marketplaces (Atlassian, Salesforce, Shopify) are the opposite: listing is gated by partner processes and review, and pricing is frequently not published.`,
    faqs: [
      { q: 'Do package registries review submissions for quality?', a: 'Generally not. Most registries in this dataset accept anything that meets packaging rules; none of them is recorded as performing editorial quality review. That is why a good README or model card matters more than the listing itself.' },
    ],
  },
  {
    slug: 'best-open-source-directories',
    title: 'Best Open Source Directories',
    description: 'Verified directories that accept open-source projects, from language registries to curated catalogues.',
    select: sel.accepts('openSource'), what: 'accept open-source projects',
    intro: `Open-source projects have more listing options than commercial products, and most of them are free. The trade-off is that free and open submission usually means little or no curation, so visibility depends on what the project itself publishes rather than on any editorial gatekeeping.

A handful of entries here are genuinely curated. F-Droid restricts inclusion to free software and builds from source; the Drupal and WordPress directories apply review before publication. Those are worth more effort than the open registries.`,
    audience: `Maintainers of open-source libraries, applications and plugins, and foundations distributing software to a wider audience.`,
    guidance: `Prefer registries native to the project's ecosystem before general catalogues. A Rust crate belongs on crates.io first; a listing on a general software-alternatives site adds little until the project already has users.`,
    faqs: [
      { q: 'Is a licence required to be listed?', a: 'Some entries require it and some do not. This dataset does not record per-directory licence requirements, so that field is not published rather than guessed at. Check the directory’s own submission documentation.' },
    ],
  },
  {
    slug: 'best-saas-directories',
    title: 'Best SaaS Directories',
    description: 'Verified directories that accept subscription software products, including review platforms and marketplaces.',
    select: sel.accepts('saas'), what: 'accept SaaS products',
    intro: `SaaS listings split into two kinds. Review directories carry buyer intent and a review corpus; platform marketplaces carry distribution into an existing customer base. They are not substitutes, and a vendor selling into an established ecosystem usually gets more from the marketplace than from the review site.

One practical caution: several of the largest review directories do not publish their listing pricing. Where that is the case this dataset records the submission model as Unknown rather than assuming a free tier exists.`,
    audience: `Software vendors selling subscriptions to businesses, particularly those with an existing integration into a major platform.`,
    guidance: `Review platforms reward volume and recency of reviews more than the listing itself. Before submitting, decide whether you can sustain a review-collection process; a stale profile with three reviews can read worse than no profile at all.`,
    faqs: [
      { q: 'Which SaaS directories are free to list on?', a: 'The dataset records a free submission model where the official page states it. For many major review directories, pricing is not published, so the field is Unknown. That absence is recorded deliberately rather than filled with an assumption.' },
    ],
  },
  {
    slug: 'best-ai-directories',
    title: 'Best AI Directories',
    description: 'Verified directories and model hubs that accept AI products, models and datasets.',
    select: sel.accepts('ai'), what: 'accept AI products',
    intro: `AI listings currently divide between model and dataset hubs, which distribute artefacts, and general software directories that have added an AI category. The hubs are the more substantial of the two: publishing a model with a proper model card is distribution, whereas an AI tag on a software comparison site is marketing.

This is also the fastest-moving category in the dataset, and the one where directories are most likely to appear and disappear within a year.`,
    audience: `Teams publishing models, datasets or AI-powered products, and companies whose buyers evaluate AI tooling.`,
    guidance: `Prefer hubs where the artefact itself is the listing. A model card, an evaluation and a licence do more for discovery than a directory entry, and they are portable between hubs.`,
    faqs: [
      { q: 'Are AI-tool listicle sites included?', a: 'Only where they met the verification standard: official URL confirmed, ownership clear, and active. Several well-known AI listing sites were not included because ownership or submission terms could not be confirmed.' },
    ],
  },
  {
    slug: 'best-startup-directories',
    title: 'Best Startup Directories',
    description: 'Verified directories that accept startups, from funding databases to launch platforms.',
    select: sel.accepts('startup'), what: 'accept startups',
    intro: `Startup directories serve three different purposes that are easy to confuse: funding databases record who invested, launch platforms create a moment of attention, and talent marketplaces attract candidates. A company usually wants all three at different stages, and submitting to the wrong one at the wrong time produces very little.

A launch platform in particular is a single-day event. It rewards preparation and is largely wasted on a product that is not ready for scrutiny.`,
    audience: `Early-stage companies raising capital, launching a product, or hiring, and investors mapping a sector.`,
    guidance: `Funding databases are worth maintaining continuously; launch platforms are worth using once per significant release. Treat a claimed profile on a funding database as a permanent record that will be read by people doing diligence.`,
    faqs: [
      { q: 'Should a startup submit to every directory it can find?', a: 'No. The dataset deliberately excludes low-quality SEO submission farms. Listings on a small number of verified directories that a buyer or investor would actually consult are worth more than volume.' },
    ],
  },
  {
    slug: 'best-business-review-platforms',
    title: 'Best Business Review Platforms',
    description: 'Verified directories that operate a public review system, and what each one verifies.',
    select: sel.reviews, what: 'operate a review system',
    intro: `Review platforms differ enormously in what they verify. At one end, an open consumer platform will publish a review from anyone who claims to be a customer. At the other, an enterprise platform will confirm that the reviewer used the product recently before publishing anything at all.

That difference is the single most useful thing to know about a review platform, and it is recorded per directory in this dataset.`,
    audience: `Any business whose buyers read reviews before purchasing, and vendors deciding where to direct review-collection effort.`,
    guidance: `Concentrate review collection on one or two platforms your buyers actually read. Spreading requests across five platforms produces five thin profiles. Never filter review invitations to happy customers only: most platforms prohibit it, and it is detectable.`,
    faqs: [
      { q: 'Does this dataset rate individual reviews or products?', a: 'No. It rates directories, not the products listed on them. No AggregateRating or Review structured data is emitted anywhere in this section.' },
      { q: 'Which platforms verify their reviewers?', a: 'Verification rigour is captured in each directory page’s score breakdown under verification quality, and described in its editorial notes. PeerSpot, for example, states it verifies every reviewer as a recent user before publishing.' },
    ],
  },
  {
    slug: 'best-government-business-registries',
    title: 'Best Government Business Registries',
    description: 'Official statutory company registers in the verified dataset, by country.',
    select: sel.category('government'), what: 'are official or statutory registers',
    intro: `Statutory registers are a different kind of entry from every other directory here. You do not choose to be listed: incorporation creates the record, and the register publishes it. They score highest in this dataset precisely because being absent from one is not a missed marketing opportunity, it is a legal problem.

They are also the most reliable data source available on any company, which is why aggregators like OpenCorporates build on them rather than competing with them.`,
    audience: `Anyone performing due diligence, compliance checks or counterparty verification, and companies confirming their own public record is accurate.`,
    guidance: `Check the register of the country of incorporation first, and treat aggregators as a convenience layer over it rather than a substitute. Note that some registers explicitly do not verify what is filed with them.`,
    faqs: [
      { q: 'Are these registers free to search?', a: 'This dataset does not record search or extract fees. Every register here is marked "Not a submission target", which records only that there is no optional listing to submit — it says nothing about what access costs. Check the official register for current fees.' },
      { q: 'Does a register entry mean a company is legitimate?', a: 'Not necessarily. Companies House, for example, states that it does not check the accuracy of the information filed with it. A register confirms existence and filings, not conduct.' },
    ],
  },
  {
    slug: 'best-app-marketplaces',
    title: 'Best App Marketplaces',
    description: 'Verified platform marketplaces that distribute applications and extensions to an existing customer base.',
    select: sel.category('app-directories'), what: 'are platform app marketplaces',
    intro: `A platform marketplace is distribution rather than discovery. The audience is already using the host product, and a listing puts an application in front of them at the moment they are looking to extend it. That is a materially better position than a general directory, and it is why marketplace listings are usually gated.

The cost is lock-in to the host platform's rules, review process and commercial terms, few of which are published openly.`,
    audience: `Software vendors building on an established platform: ecommerce, CRM, collaboration or developer tooling.`,
    guidance: `Expect a review process and budget time for it. Marketplace listing pricing is unpublished for most entries in this dataset, so treat cost as an unknown to be confirmed with the platform rather than assumed.`,
    faqs: [
      { q: 'Do marketplaces charge to list?', a: 'Most in this dataset do not publish listing pricing, so the submission model is recorded as Unknown. Several take a revenue share on sales, which is a separate question from a listing fee.' },
    ],
  },
  {
    slug: 'global-vs-national-business-directories',
    title: 'Global vs National Business Directories',
    description: 'How globally scoped directories differ from national registers, and when each is the right choice.',
    select: sel.national, what: 'are scoped to a single country rather than globally',
    intro: `The distinction this dataset draws is editorial scope, not company headquarters. A directory is national when its coverage is tied to one jurisdiction — almost always because it is a statutory register — and global when a business anywhere can use it identically.

That rule produces a result some readers find surprising: Crunchbase and Trustpilot are recorded as global rather than United States entries, because a German company's relationship with them is the same as an American one's. Conversely, a national register is national no matter how large the country.`,
    audience: `Companies deciding where to invest listing effort, and anyone confused about why a US-headquartered platform is not filed under the United States.`,
    guidance: `Most companies need exactly one national entry — the statutory register of their country of incorporation, which they get automatically — plus a small number of global listings chosen for their sector. National directories beyond the register are rarely worth the effort unless the business is genuinely local.`,
    faqs: [
      { q: 'Why is a US company listed under Global?', a: 'Because country records editorial coverage, not headquarters. Filing a worldwide platform under the United States because its company is registered there would mislead every reader outside the United States.' },
    ],
    note: `National coverage in this dataset is currently thin: it is concentrated in statutory registers, with roughly one per country. That is a deliberate consequence of the verification standard rather than a claim that no other national directories are worth listing on.`,
  },
  {
    slug: 'free-vs-paid-business-directories',
    title: 'Free vs Paid Business Directories',
    description: 'What the verified dataset actually records about directory submission models, including how often pricing is undisclosed.',
    select: sel.freeSubmission, what: 'are recorded as free to submit to',
    intro: `The most useful finding in this dataset is not the split between free and paid. It is how often the answer is neither: a large share of directories, including several of the best known, do not publish their listing pricing at all.

Where that is the case the submission model is recorded as Unknown. That is deliberate. Assuming a free tier exists because a directory has a prominent "get listed" button would be a guess, and a guess about cost is exactly the kind of thing a reader would act on.`,
    audience: `Anyone budgeting directory work, and businesses deciding whether a paid listing is justified.`,
    guidance: `Start with everything genuinely free, since it costs only time. Treat paid listings as advertising and evaluate them as such — with a defined objective — rather than as a checkbox. Where pricing is Unknown, ask the directory directly before committing.`,
    faqs: [
      { q: 'Why is pricing Unknown for so many directories?', a: 'Because it is not published on the pages that were verified. The dataset records what an official source stated; it does not infer pricing from the presence of a signup button.' },
      { q: 'Are paid listings worse than free ones?', a: 'Not inherently. Paid inclusion weighs against a directory in the editorial score, while paid enhancement of an otherwise free listing is treated far more leniently.' },
    ],
  },
];

// --- articles that need no dataset selection ---------------------------------

const STATIC_ARTICLES = [
  {
    slug: 'how-petrohrys-score-works',
    title: 'How the PetroHrys Score Works',
    description: 'The ten weighted editorial factors behind the PetroHrys Score, and what the score deliberately is not.',
    body: (ctx) => [
      section('what', 'What the score measures', paras(`The PetroHrys Score is a first-party editorial assessment of how much value a listing on a given directory offers a serious business. It is not derived from Ahrefs, Semrush or any other third-party metric, and it is not a review rating.

It is deliberately not a popularity or traffic measure. A directory can be enormous and still score poorly if a listing there is worth little.`)),
      section('factors', 'The ten factors', `      <p>Each factor is scored from 0 to 10 by a human reviewer. The weights total exactly 100%, and the published score is the weighted sum:</p>
${comparisonFactorsTable()}
      <p class="bd-note">The weights are guarded in code: if they ever stop totalling 100, the build fails rather than silently producing skewed scores.</p>`),
      section('derived', 'The score is derived, not asserted', paras(`Every record stores the ten factor values it was scored on. The validator recomputes the score from those factors and rejects any record whose stored number does not match. A score cannot be typed in; it can only be produced by the factors.

Each directory page publishes its own breakdown, so any reader can check the arithmetic.`)),
      section('not', 'What the score is not', bullets([
        'Not Domain Rating. Third-party metrics are recorded separately, with provider and measurement date, and never feed into this score.',
        'Not a review rating. No AggregateRating or Review structured data is emitted anywhere in this section.',
        'Not SEO value. A directory’s usefulness for link acquisition is not one of the ten factors.',
      ])),
    ].join('\n\n'),
    faqs: [
      { q: 'Can a directory pay to raise its score?', a: 'No. Nothing in this dataset is sold, sponsored, or accepted in exchange for payment, and paid inclusion weighs against a directory rather than for it.' },
      { q: 'How often are scores reviewed?', a: 'Scores are revisited when a record is re-verified. Each record carries a next-verification date, {{CADENCE}} after its last verification.' },
    ],
  },
  {
    slug: 'how-directories-are-verified',
    title: 'How Directories Are Verified',
    description: 'The verification standard every record in this dataset must meet before it is published.',
    body: (ctx) => [
      section('standard', 'The standard', paras(`Every published record was confirmed by fetching the directory's official URL and reading what that page actually said. No record is included on recollection, and none is included because a directory is well known.

If a claim could not be confirmed from an official source, the corresponding field is null and renders as Unknown. Null is used consistently to mean "not established" — never zero, never an assumption.`)),
      section('recorded', 'What each record carries', bullets([
        'A verification status, which the validator refuses to accept as <em>verified</em> without the rest of this list.',
        'A verification source: official website, official documentation, government register, manual verification, or other.',
        'A verification date, and a next-verification date {{CADENCE}}.',
        'At least one named editorial reviewer. The field is an array, so a record can carry several.',
      ])),
      section('limits', 'Known limits of this method', paras(`Roughly a third of high-authority directories block automated fetching outright, returning HTTP 403 or a consent wall. Those directories are not published here. They are recorded as pending manual verification rather than added on the strength of general knowledge.

Some facts cannot be established by reading a homepage at all. Typical approval times and review processes require actually submitting to each directory, {{PROCESS_FIELDS}}.`)),
      section('rejected', 'What gets rejected', bullets([
        'Dead projects. One candidate was rejected because its domain no longer resolves.',
        'Directories winding down. One package registry was rejected because its submission trunk is moving to read-only.',
        'Directories whose editorial country could not be honestly assigned.',
        'Directories whose official name or ownership could not be confirmed from their own pages.',
      ])),
    ].join('\n\n'),
    faqs: [
      { q: 'Is the dataset complete?', a: 'No, and it does not claim to be. It contains only directories that met the verification standard. Coverage is deliberately limited by what could be confirmed rather than extended by what could be assumed.' },
      { q: 'What happens when a directory changes?', a: 'Records carry a next-verification date. A change found on re-verification is recorded in the record’s notes rather than silently overwritten — an ownership correction was handled this way.' },
    ],
  },
  {
    slug: 'editorial-methodology',
    title: 'Editorial Methodology',
    description: 'How directories are selected, described, scored and related to one another in this dataset.',
    body: (ctx) => [
      section('selection', 'Selection', paras(`Directories are included on editorial merit, not on request. Nothing is sold, sponsored or accepted in exchange for payment, and there is no submission route for a directory to add itself.

Quality is prioritised over count throughout. The dataset is smaller than it could be because unverifiable candidates are rejected rather than published with gaps.`)),
      section('writing', 'Writing', bullets([
        'Descriptions are original and written from what the official source stated.',
        'No superlatives, no marketing language, no copied text. A build-time check rejects promotional wording.',
        'Weaknesses are recorded as plainly as strengths. Where a directory has a reputational problem, it is stated.',
      ])),
      section('country', 'Country and scope', paras(`Country records editorial coverage, not company headquarters. A directory is national when its coverage is tied to one jurisdiction, and global when a business anywhere uses it identically.

This is why several US-registered platforms are filed under Global. Filing them under the United States would mislead every reader outside it.`)),
      section('relations', 'Editorial relationships', paras(`Relationships between directories — alternatives, similar, often used together, competitors — are curated by a reviewer. None is generated by a similarity heuristic. The validator checks that every relationship points at a real record and never at itself.`)),
      section('metrics', 'Third-party metrics', paras(`{{METRICS}} A recorded metric is always labelled as third-party rather than presented as a PetroHrys figure.`)),
    ].join('\n\n'),
    faqs: [
      { q: 'Can a directory pay to be included?', a: 'No. There is no paid inclusion and no submission route for directories.' },
      { q: 'Why are so many fields Unknown?', a: 'Because the alternative is inventing them. A field is populated only when an official source stated it.' },
    ],
  },
  {
    slug: 'how-to-choose-a-business-directory',
    title: 'How to Choose a Business Directory',
    description: 'A practical method for deciding which directories are worth the effort, based on the verified dataset.',
    body: (ctx) => [
      section('start', 'Start with the register', paras(`If a company is incorporated, it already has an entry in a statutory register, and that entry will be read by anyone doing diligence. Confirming it is accurate costs nothing and matters more than any optional listing.`)),
      section('audience', 'Then match audience, not volume', paras(`The right question is not how large a directory is but whether the people who would buy from you consult it. A developer-tool company gets more from a package registry than from a general business listing, regardless of relative size.

Each directory page in this dataset records which audiences the directory accepts, across twelve categories, so this can be checked rather than guessed.`)),
      section('cost', 'Then weigh cost against evidence', bullets([
        'Anything genuinely free costs only time. Do those first.',
        'Where pricing is Unknown, ask the directory before committing. A prominent signup button is not evidence of a free tier.',
        'Treat paid inclusion as advertising with a defined objective, not as a completeness exercise.',
      ])),
      section('avoid', 'What to avoid', paras(`Bulk submission services and low-quality SEO directories are excluded from this dataset entirely. Listings on directories that no real buyer consults do not become valuable through volume, and several search engines treat them as a negative signal.`)),
    ].join('\n\n'),
    faqs: [
      { q: 'How many directories should a business be listed on?', a: 'Fewer than most submission services suggest. A statutory register, one or two review platforms your buyers read, and the marketplaces native to your product category will cover most of the value.' },
    ],
  },
  {
    slug: 'business-directory-submission-checklist',
    title: 'Business Directory Submission Checklist',
    description: 'What to prepare before submitting to a business directory, and what this dataset can and cannot tell you about each one.',
    body: (ctx) => [
      section('before', 'Before you submit', bullets([
        'Confirm the directory is the official one. Several major directories have look-alike submission sites.',
        'Read the directory’s own submission documentation. Requirements differ, and this dataset does not record them per directory.',
        'Decide who owns the listing internally. An orphaned profile becomes stale and reads worse than none.',
      ])),
      section('assets', 'Assets commonly requested', paras(`Directories typically ask for some combination of a logo, a website URL, a description, category selection, contact details, screenshots, and proof of business identity. Which of these a specific directory requires is recorded per record where a submission form was actually read.`) + `\n      <p class="bd-note">This is an area where the dataset is currently weak, and it is worth stating plainly: required assets are Unknown for every record, because no submission form has yet been read end to end. The list above is general guidance, not a claim about any specific directory.</p>`),
      section('after', 'After submitting', bullets([
        'Record where and when you submitted. Approval can take weeks and the confirmation is easy to lose.',
        'Do not submit the same product repeatedly to speed up review.',
        'Where a directory has a review system, plan how you will collect reviews before the listing goes live.',
      ])),
    ].join('\n\n'),
    faqs: [
      { q: 'How long does approval usually take?', a: 'This dataset does not say, and deliberately so. Typical approval time is null for every record because it cannot be established without submitting to each directory. Publishing an estimate would be inventing it.' },
    ],
  },
  {
    slug: 'business-directory-faq',
    title: 'Business Directory FAQ',
    description: 'Common questions about business directories, answered from the verified PetroHrys dataset.',
    body: () => section('about', 'About this dataset', paras(`This page answers the questions that come up most often about business directories and about how this dataset itself works. Every answer reflects what the dataset actually records; where it records nothing, the answer says so.`)),
    faqs: [
      { q: 'What counts as a business directory here?', a: 'Any curated listing of companies, products or projects that a third party consults — including statutory registers, review platforms, package registries and platform marketplaces. They are treated as one family because the decision to list is the same kind of decision.' },
      { q: 'Are listings on this site paid or sponsored?', a: 'No. Nothing is sold, sponsored, or accepted in exchange for payment, and there is no route for a directory to request inclusion.' },
      { q: 'Why do outbound links not use nofollow?', a: 'Because they are editorial citations from pages carrying original analysis, not paid placements. Blanket-nofollowing them would misrepresent a curated knowledge base as a link directory.' },
      { q: 'Why is the dataset smaller than other directory lists?', a: 'Because unverifiable candidates are rejected rather than published. Roughly a third of high-authority directories block automated verification, and those are recorded as pending rather than added on assumption.' },
      { q: 'Do you record Domain Rating or traffic?', a: '{{METRICS}}' },
      { q: 'Can I suggest a directory?', a: 'There is no submission route. Directories are included on editorial merit after verification against their official source.' },
    ],
  },
];


// --- decision-support articles ------------------------------------------------
// These answer "what should I do", not "what exists". They reuse the verified
// dataset but lead with a decision framework and an explicit when-not-to-use.

const DECISION_ARTICLES = [
  {
    slug: 'directory-submission-strategy',
    title: 'How to Build a Directory Submission Strategy',
    description: 'A sequencing framework for directory work: what to do first, what to skip, and how to know when you are done.',
    select: (D) => D, what: 'inform this framework',
    intro: `Most directory advice is a list. A strategy is different: it decides the order, the stopping point, and what you will deliberately not do.

The failure mode this framework is designed to prevent is treating directory work as a completeness exercise. Listing on everything available is not a strategy, it is an absence of one, and it produces a long tail of stale profiles nobody maintains.`,
    framework: [
      '<strong>Fix the record you already have.</strong> If the company is incorporated, a statutory register entry exists and will be read during diligence. Confirming it is accurate costs nothing.',
      '<strong>List where your buyer already looks.</strong> One or two directories your actual buyers consult beat ten they do not. Each directory page here records which audiences it accepts.',
      '<strong>Take the free tier everywhere it is genuinely free.</strong> {{FREE_COUNT}} of the verified directories state a free submission model. These cost only time.',
      '<strong>Stop.</strong> Set a number of listings in advance and stop at it. Add more only when a specific listing has a specific purpose.',
      '<strong>Assign an owner.</strong> An unowned listing goes stale, and a stale profile reads worse than no profile.',
    ],
    guidance: `Sequence matters more than volume. The register first because it is read by default, then the small set your buyers consult, then the free tier, and then stop. Revisit on a schedule rather than continuously.`,
    notFor: [
      'Businesses hoping directory listings alone will produce demand. They are a trust and discovery layer, not a channel.',
      'Anyone buying bulk submission services. Those target directories deliberately excluded from this dataset.',
    ],
    faqs: [
      { q: 'How many directories should we target?', a: 'Fewer than most submission services suggest. A statutory register, one or two review platforms your buyers read, and the marketplaces native to your product category cover most of the value.' },
      { q: 'How long does approval take?', a: 'This dataset does not say. Typical approval time is null for every record because it cannot be established without submitting to each directory, and publishing an estimate would be inventing it.' },
    ],
  },
  {
    slug: 'directories-for-enterprise-software',
    title: 'Directories for Enterprise Software',
    description: 'Where enterprise software vendors are listed in the verified dataset, and how enterprise buyers actually use those listings.',
    select: sel.accepts('enterprise'), what: 'accept enterprise software',
    intro: `Enterprise buyers use directories differently from small businesses. A listing is rarely the first touch; it is consulted during evaluation, often by someone building a shortlist for a committee. That changes what a good listing contains: depth, verification and comparability matter more than persuasion.

It also means the review platforms that verify their reviewers are worth disproportionately more than those that do not.`,
    framework: [
      '<strong>Platform marketplaces first</strong> if you integrate with a major platform. That is distribution into an existing customer base, not discovery.',
      '<strong>Then a verified-review platform.</strong> Enterprise buyers discount unverified reviews heavily.',
      '<strong>Then a comparison directory</strong> so you appear in category shortlists.',
      '<strong>Confirm your statutory register entry is current.</strong> Procurement will check it.',
    ],
    guidance: `Prioritise directories that verify. A platform that confirms reviewers were recent users is more useful in a procurement conversation than one with ten times the review volume and no verification.`,
    notFor: [
      'Vendors with no integration story and no reference customers yet. A thin enterprise listing invites unfavourable comparison.',
      'Companies unwilling to sustain review collection, since an abandoned profile is read as a signal.',
    ],
    faqs: [
      { q: 'Do enterprise marketplaces charge to list?', a: 'Most in this dataset do not publish listing pricing, so their submission model is recorded as Unknown. Several take a revenue share, which is a separate question from a listing fee.' },
    ],
  },
  {
    slug: 'directories-for-mobile-apps',
    title: 'Directories for Mobile Apps',
    description: 'Where mobile applications can be listed according to the verified dataset, and the limits of that coverage.',
    select: sel.accepts('mobileApp'), what: 'accept mobile applications',
    intro: `Mobile distribution is dominated by two stores that are not in this dataset, because neither could be verified to the standard applied here. What remains is the alternative and open-source distribution layer, plus general catalogues that accept apps alongside other software.

That is a genuine limitation of this list rather than a claim about the market, and it is worth stating before the table rather than after it.`,
    framework: [
      '<strong>Decide whether you need alternative distribution at all.</strong> For most commercial apps the answer is no.',
      '<strong>If your app is open source</strong>, a catalogue that builds from source offers a materially stronger trust signal than a store listing.',
      '<strong>Use general catalogues for discovery, not distribution.</strong> They send readers to your own download route.',
    ],
    guidance: `Treat this list as complementary to the mainstream stores rather than a substitute for them. The entries here are most valuable for open-source, privacy-focused and developer-facing applications.`,
    notFor: [
      'Consumer apps whose entire audience is on the mainstream stores.',
      'Anyone expecting these listings to replace store optimisation.',
    ],
    faqs: [
      { q: 'Why are the two main app stores missing?', a: 'Neither could be verified against an official page under the standard used here; automated verification was blocked. They are recorded as pending manual verification rather than added on assumption.' },
    ],
  },
  {
    slug: 'directories-by-verification-requirements',
    title: 'Directories by Verification Requirements',
    description: 'Which verified directories require you to prove something before publishing, and what that implies for effort.',
    select: (D) => D.filter((d) => d.verificationRequired === true), what: 'require verification before listing',
    intro: `Verification requirements are the clearest available proxy for how much effort a listing will take and how much a listing is worth. A directory that publishes anything anyone submits is cheap to appear in and correspondingly cheap as a signal. One that requires proof of identity, domain control or an established account is more work and means more.

This is one of the few effort-related fields this dataset can populate honestly, because it is usually stated on the directory's own pages. Approval time and review process are not, and remain null throughout.`,
    framework: [
      '<strong>Budget effort by requirement, not by directory size.</strong> A small gated registry can take longer than a large open one.',
      '<strong>Gather proof once.</strong> Domain control, company registration details and a consistent description cover most requirements.',
      '<strong>Expect gated directories to reject inconsistencies</strong> between your listing and your public record.',
    ],
    guidance: `Treat a verification requirement as a positive signal about the directory rather than an obstacle. The directories that check are the ones whose listings a reader can trust.`,
    notFor: [
      'Anyone looking for the fastest possible route to a large number of listings.',
    ],
    faqs: [
      { q: 'Does verification required mean identity documents?', a: 'Not necessarily. It means the directory requires some form of confirmation before a listing is published, which may be an account, domain control, or company details. This dataset does not record which, so it is not stated.' },
    ],
  },
];

// --- decision guides ----------------------------------------------------------
// "If you are X" framings. Each recommends only from the verified dataset.

const DECISION_GUIDES = [
  {
    slug: 'if-you-are-a-saas-startup',
    title: 'If You Are a SaaS Startup',
    description: 'A directory plan for an early-stage SaaS company, drawn only from the verified dataset.',
    select: (D) => D.filter((d) => d.accepts.saas === true && d.accepts.startup === true),
    what: 'accept both SaaS products and startups',
    intro: `An early SaaS company has limited attention and no review corpus yet. That combination rules out most of what is usually recommended: a comparison directory profile with no reviews on it is a weak signal, not a neutral one.

The sequence below is designed around that constraint. It front-loads the listings that work without social proof and defers the ones that need it.`,
    steps: [
      'Confirm your statutory register entry, which buyers will check during procurement.',
      'List on any platform marketplace you integrate with. Distribution into an existing user base does not depend on your review count.',
      'Choose one review platform and build a review process before creating the profile.',
      'Defer the remaining comparison directories until you can populate them credibly.',
    ],
    notFor: ['Companies with no product in market yet. A listing precedes nothing.'],
    faqs: [{ q: 'Should we launch on a launch platform first?', a: 'Only when the product is ready for scrutiny. A launch is a single-day event that rewards preparation and is largely wasted on an unfinished product.' }],
  },
  {
    slug: 'if-you-are-an-enterprise',
    title: 'If You Are an Enterprise',
    description: 'A directory plan for an established enterprise vendor, drawn only from the verified dataset.',
    select: (D) => D.filter((d) => d.accepts.enterprise === true && d.verificationRequired === true),
    what: 'accept enterprise vendors and require verification',
    intro: `An enterprise vendor's problem is not visibility but consistency. Listings already exist, often created years ago by different teams, and the risk is that a procurement reviewer finds three descriptions that disagree.

The work here is consolidation before expansion.`,
    steps: [
      'Inventory existing listings and claim any unclaimed profiles.',
      'Standardise the description, categories and contact details across all of them.',
      'Confirm the statutory register entry matches the legal entity used in contracts.',
      'Only then consider new listings, prioritising directories that verify their reviewers.',
    ],
    notFor: ['Teams treating directories as a lead-generation channel in isolation.'],
    faqs: [{ q: 'Are unclaimed profiles a risk?', a: 'They can be. A profile you do not control may carry stale information, and several directories allow reviews on unclaimed listings.' }],
  },
  {
    slug: 'if-you-are-a-freelancer',
    title: 'If You Are a Freelancer',
    description: 'What the verified dataset can and cannot tell an independent professional about directory listings.',
    select: (D) => D.filter((d) => d.accepts.freelancer === true),
    what: 'accept freelancers',
    intro: `This is the thinnest area of the dataset, and saying so is more useful than padding the page. Only a small number of verified directories record that they accept freelancers, and most of those are agency directories where an independent professional competes against firms.

The honest recommendation is therefore narrow.`,
    steps: [
      'Treat agency directories as a secondary channel rather than a primary one.',
      'Prioritise the platform marketplaces relevant to your craft, where the artefact rather than the firm is listed.',
      'Confirm any statutory registration that applies to you as a sole trader.',
    ],
    notFor: ['Freelancers expecting directory listings to replace direct referral. The dataset provides no evidence they do.'],
    faqs: [{ q: 'Why so few options?', a: 'Because only directories that met the verification standard are included, and freelancer acceptance is rarely stated explicitly on official pages. Absence here means unrecorded, not unavailable.' }],
    thin: true,
  },
  {
    slug: 'if-you-are-launching-an-ai-product',
    title: 'If You Are Launching an AI Product',
    description: 'A directory plan for an AI product launch, using only verified directories that accept AI products.',
    select: (D) => D.filter((d) => d.accepts.ai === true),
    what: 'accept AI products',
    intro: `AI listings divide between hubs that distribute an artefact — a model, a dataset — and directories that list a product. The first kind is durable; the second turns over quickly, and several well-known AI listing sites were excluded from this dataset because ownership or submission terms could not be confirmed.

Weight your effort towards the durable end.`,
    steps: [
      'If you publish a model or dataset, list it on a hub with a complete model card. That is distribution, not marketing.',
      'Use a launch platform once, for a genuine release.',
      'Add general software directories only once the product has users who will review it.',
      'Avoid AI listing sites whose ownership is unclear; this dataset deliberately excludes them.',
    ],
    notFor: ['Products where the AI component is incidental. A general software directory will serve you better than an AI-specific one.'],
    faqs: [{ q: 'Are AI-tool listicle sites worth using?', a: 'This dataset cannot say. Several were assessed and not included because ownership or submission terms could not be verified, so no recommendation is offered either way.' }],
  },
  {
    slug: 'if-you-are-launching-an-open-source-project',
    title: 'If You Are Launching an Open Source Project',
    description: 'A directory plan for an open-source release, using verified registries and catalogues.',
    select: (D) => D.filter((d) => d.accepts.openSource === true),
    what: 'accept open-source projects',
    intro: `Open-source projects have the widest set of free listing options in this dataset, and the least curation. Almost every language registry accepts anything that packages correctly, which means the listing itself carries little signal and your documentation carries most of it.

The exceptions are the curated catalogues that review before publishing. Those are worth real effort.`,
    steps: [
      'Publish to the registry native to your ecosystem first. That is where installers look.',
      'Write the README, licence and metadata before publishing, not after. The registry entry is only as useful as what it links to.',
      'Then submit to any curated catalogue that reviews submissions.',
      'Consider a transparent funding listing if the project takes contributions.',
    ],
    notFor: ['Projects not yet usable by anyone else. A registry entry for an empty project is discoverable and unhelpful.'],
    faqs: [{ q: 'Do registries check quality?', a: 'Generally not. None of the registries in this dataset is recorded as performing editorial quality review, which is why documentation matters more than the listing.' }],
  },
];

// --- comparisons ---------------------------------------------------------------
// Field-by-field from verified records only. Where both sides are Unknown the
// page says the evidence is insufficient rather than manufacturing a difference.

const COMPARISON_FIELDS = [
  ['Country', (d) => d.country],
  ['Category', (d) => d.category],
  ['Scope', (d) => (d.scope === 'unknown' ? null : d.scope)],
  ['Submission model', (d) => (d.submissionModel === 'unknown' ? null : SUBMISSION[d.submissionModel])],
  ['Registration required', (d) => d.registrationRequired],
  ['Verification required', (d) => d.verificationRequired],
  ['Review system', (d) => d.reviewSystem],
  ['Manual review', (d) => d.manualReview],
  ['PetroHrys Score', (d) => d.petroHrysScore],
  ['Tier', (d) => d.tier],
  ['Last verified', (d) => d.lastVerified],
];

const COMPARISONS = [
  { slug: 'crunchbase-vs-wellfound', a: 'crunchbase', b: 'wellfound',
    lead: `Both profile startups, but they are read by different people for different reasons. One is consulted during diligence and market mapping; the other is consulted by candidates deciding where to work.` },
  { slug: 'clutch-vs-designrush', a: 'clutch', b: 'designrush',
    lead: `Both list service providers and both display client ratings. The material difference recorded in this dataset is verification rigour, which is reflected in their scores.` },
  { slug: 'trustpilot-vs-better-business-bureau', a: 'trustpilot', b: 'better-business-bureau',
    lead: `Both carry consumer feedback, but they are structurally different institutions: one is an open review platform, the other a membership organisation with a paid accreditation programme and a complaints process.` },
  { slug: 'product-hunt-vs-alternativeto', a: 'product-hunt', b: 'alternativeto',
    lead: `Both surface software to an interested audience, but one is an event and the other is a reference. That difference determines when each is worth using.` },
];

function comparisonPage(entry, D) {
  const a = D.find((d) => d.slug === entry.a);
  const b = D.find((d) => d.slug === entry.b);
  if (!a || !b) return null;

  const rows = COMPARISON_FIELDS.map(([label, get]) => {
    const va = get(a);
    const vb = get(b);
    const cell = (v) => (v === null || v === undefined ? UNKNOWN
      : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : escapeHtml(String(v)));
    return `          <tr class="bd-row">
            <th class="bd-cell" scope="row">${escapeHtml(label)}</th>
            <td class="bd-cell">${cell(va)}</td>
            <td class="bd-cell">${cell(vb)}</td>
          </tr>`;
  }).join('\n');

  const unknownBoth = COMPARISON_FIELDS
    .filter(([, get]) => (get(a) === null || get(a) === undefined) && (get(b) === null || get(b) === undefined))
    .map(([label]) => label);

  const table = `      <table class="bd-table">
        <caption class="bd-caption">${escapeHtml(a.name)} compared with ${escapeHtml(b.name)}, verified fields only</caption>
        <thead>
          <tr>
            <th class="bd-cell" scope="col">Field</th>
            <th class="bd-cell" scope="col">${escapeHtml(a.name)}</th>
            <th class="bd-cell" scope="col">${escapeHtml(b.name)}</th>
          </tr>
        </thead>
        <tbody>
${rows}
        </tbody>
      </table>`;

  const insufficient = unknownBoth.length
    ? `      <p class="bd-note">The evidence is insufficient to compare these fields: ${escapeHtml(unknownBoth.join(', '))}. Both records are Unknown, so no difference is asserted.</p>`
    : '      <p class="bd-note">Every compared field is populated for at least one of the two directories.</p>';

  const prosOf = (d) => bullets(d.pros.map(escapeHtml));
  const consOf = (d) => bullets(d.cons.map(escapeHtml));

  const main = [
    section('introduction', 'Introduction', paras(entry.lead)),
    section('comparison', 'Side by side', `${table}\n${insufficient}`),
    section('advantages', `Advantages: ${a.name}`, prosOf(a)),
    section('advantages-b', `Advantages: ${b.name}`, prosOf(b)),
    section('disadvantages', `Disadvantages: ${a.name}`, consOf(a)),
    section('disadvantages-b', `Disadvantages: ${b.name}`, consOf(b)),
    section('recommendation', 'Which to choose', paras(`Neither is a substitute for the other. Read the table above against your own situation: the fields that differ are the ones that should decide it, and the fields marked Unknown are questions to put to the directory rather than assumptions to make.

Where the two scores differ, the gap reflects the ten editorial factors documented in the scoring methodology, not popularity or traffic.`)),
    section('faq', 'Frequently asked questions', faqBlock([
      { q: 'Is one of these better than the other?', a: 'They are not interchangeable, so the question is which fits a given situation. This comparison sets out the verified differences rather than declaring a winner.' },
      { q: 'Why are some fields Unknown?', a: 'Because they were not stated on the official sources that were verified. They are shown as Unknown rather than estimated.' },
    ])),
    section('related-directories', 'Full records', bullets([
      `<a href="${routes.directoryPathFor(a)}">${escapeHtml(a.name)}</a> — full verified record`,
      `<a href="${routes.directoryPathFor(b)}">${escapeHtml(b.name)}</a> — full verified record`,
    ])),
  ].join('\n\n');

  return {
    slug: entry.slug,
    // The two records this page is about. Carried on the emitted object so
    // reciprocal linking reads them from what was actually generated rather
    // than from the COMPARISONS constant, which may contain pages that were
    // dropped because a subject is missing from the dataset.
    a: entry.a,
    b: entry.b,
    title: `${a.name} vs ${b.name}`,
    description: `A field-by-field comparison of ${a.name} and ${b.name} using only verified data, including where the evidence is insufficient.`,
    main,
    faqs: [
      { q: 'Is one of these better than the other?', a: 'They are not interchangeable, so the question is which fits a given situation. This comparison sets out the verified differences rather than declaring a winner.' },
      { q: 'Why are some fields Unknown?', a: 'Because they were not stated on the official sources that were verified. They are shown as Unknown rather than estimated.' },
    ],
  };
}

function comparisonFactorsTable() {
  const rows = S.SCORE_FACTORS.map((f) => `          <tr class="bd-row">
            <th class="bd-cell" scope="row">${escapeHtml(f.label)}</th>
            <td class="bd-cell">${f.weight}%</td>
          </tr>`).join('\n');
  return `      <table class="bd-table">
        <caption class="bd-caption">PetroHrys Score factors and weights</caption>
        <thead>
          <tr><th class="bd-cell" scope="col">Factor</th><th class="bd-cell" scope="col">Weight</th></tr>
        </thead>
        <tbody>
${rows}
        </tbody>
      </table>`;
}

// --- assembly ----------------------------------------------------------------

function relatedArticleLinks(current, all) {
  const others = all.filter((a) => a.slug !== current.slug).slice(0, 6);
  return bullets(others.map((a) =>
    `<a href="${routes.articlePath(a.slug)}">${escapeHtml(a.title)}</a>`));
}

// Renders a decision-support article or an "if you are X" guide. Both lead with
// a framework and both carry an explicit when-not-to-use, because an article
// that never says "not you" is not a decision aid.
function decisionMain(article, D, total, siblings) {
  const records = sortDirectories(article.select(D));
  const top = records.slice(0, 12);
  const steps = article.framework || article.steps || [];
  const advantages = [...new Set(top.flatMap((d) => d.pros))].slice(0, 6);
  const disadvantages = [...new Set(top.flatMap((d) => d.cons))].slice(0, 6);

  return [
    section('introduction', 'Introduction', paras(article.intro)),
    section('evidence', 'Evidence base', coverage(records.length, total, article.what)
      + (article.thin
        ? '\n      <p class="bd-note">This is a thin area of the dataset. The recommendation below is '
          + 'deliberately narrow rather than padded, and absence here means unrecorded rather than '
          + 'unavailable.</p>'
        : '')),
    section('framework', 'Decision framework',
      bullets(steps.length ? steps : ['No framework recorded yet.'])),
    section('comparison', 'Comparison', comparisonTable(top,
      `${article.title}: verified directories${records.length > top.length
        ? `, top ${top.length} of ${records.length} by editorial score` : ''}`)),
    section('advantages', 'Advantages recorded across these directories',
      bullets(advantages.map(escapeHtml))),
    section('disadvantages', 'Disadvantages recorded across these directories',
      bullets(disadvantages.map(escapeHtml))),
    section('recommendations', 'Recommendations',
      paras(article.guidance || 'Work through the framework above in order and stop at the point where the next listing has no specific purpose.')),
    section('not-for', 'When not to use this', bullets((article.notFor || []).map(escapeHtml))),
    section('faq', 'Frequently asked questions', faqBlock(article.faqs)),
    section('related-reading', 'Related guides', relatedArticleLinks(article, siblings)),
    section('references', 'Editorial references', paras(`Every directory named here has its own page recording what was verified, when, by whom and from which source. Scoring is documented in <a href="${routes.articlePath('how-petrohrys-score-works')}">How the PetroHrys Score Works</a>, and the verification standard in <a href="${routes.articlePath('how-directories-are-verified')}">How Directories Are Verified</a>.`)),
  ].join('\n\n');
}

function buildArticles(registry) {
  const D = sortDirectories(registry.directories);
  const total = D.length;
  const comparisons = COMPARISONS.map((c) => comparisonPage(c, D)).filter(Boolean);
  const all = [...ARTICLES, ...DECISION_ARTICLES, ...DECISION_GUIDES, ...STATIC_ARTICLES];

  // A list article with nothing to list would be an empty page, so it is not
  // emitted at all until the dataset can support it.
  const emitted = all.filter((a) => !a.select || a.select(D).length > 0);
  const siblings = [...emitted, ...comparisons];

  const metricsSentence = metricStatusSentence(D);
  // Every published count is derived. A spelled-out numeral in prose goes stale
  // silently the moment a record changes — "Twenty of the verified directories"
  // survived a reclassification that moved the real figure to 15.
  const freeCount = String(D.filter((d) => d.submissionModel === 'free').length);
  // The cadence sentence is generated from the scheduler itself, so documentation
  // and behaviour cannot drift apart.
  const intervals = [...new Set(Object.values(S.REVIEW_INTERVAL_MONTHS))].sort((a, b) => a - b);
  const cadenceSentence = `set between ${intervals[0]} and ${intervals[intervals.length - 1]} months later, `
    + 'depending on how fast the directory changes — statutory registers are revisited least often, '
    + 'continuously-submittable platforms most often';
  // Approval time and review process cannot be read off a homepage, so they are
  // null unless a directory's own documentation states them. That was true of
  // every record when the guide was written; it stops being true the moment one
  // documents its process, so the sentence is derived rather than asserted.
  const documentsProcess = D.filter((d) => d.typicalApprovalTime !== null || d.reviewProcess !== null);
  const nameList = (names) => (names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);
  const processSentence = documentsProcess.length === 0
    ? 'so they are null across the entire dataset rather than estimated'
    : `so they are null on ${D.length - documentsProcess.length} of ${D.length} records rather than `
      + `estimated. ${documentsProcess.length === 1 ? 'The one exception is' : 'The exceptions are'} `
      + `${nameList(documentsProcess.map((d) => d.name))}, whose own documentation states `
      + `${documentsProcess.length === 1 ? 'it' : 'them'}`;

  const TOKENS = {
    '{{METRICS}}': metricsSentence,
    '{{FREE_COUNT}}': freeCount,
    '{{CADENCE}}': cadenceSentence,
    '{{PROCESS_FIELDS}}': processSentence,
  };
  const resolveTokens = (value) => (typeof value === 'string'
    ? Object.entries(TOKENS).reduce((out, [token, text_]) => out.split(token).join(text_), value)
    : value);

  const built = emitted.map((article) => {
    let main;
    // Which records this guide actually names on the page. A guide that selected
    // a record but truncated it out of its top rows does not discuss it, so it
    // must not be linked from that record as though it did.
    let features = [];
    if (article.framework || article.steps) {
      main = decisionMain(article, D, total, siblings);
      // Decision guides draw on the same top-12 selection, so they name records
      // too and must be reciprocally linked from them.
      if (article.select) features = sortDirectories(article.select(D)).slice(0, 12).map((r) => r.slug);
    } else if (article.select) {
      const records = sortDirectories(article.select(D));
      const top = records.slice(0, 12);
      features = top.map((r) => r.slug);
      main = [
        section('introduction', 'Introduction', paras(article.intro)),
        section('evidence', 'Evidence base', coverage(records.length, total, article.what)
          + (article.note ? `\n      <p class="bd-note">${escapeHtml(article.note)}</p>` : '')),
        section('audience', 'Who should use these', paras(article.audience)),
        section('comparison', 'Comparison', comparisonTable(top,
          `${article.title}: verified directories${records.length > top.length ? `, top ${top.length} of ${records.length} by editorial score` : ''}`)),
        section('recommendations', 'How to read this list', paras(article.guidance)),
        section('faq', 'Frequently asked questions', faqBlock(article.faqs)),
        section('related-reading', 'Related reading', relatedArticleLinks(article, emitted)),
        section('references', 'Editorial references', paras(`Every directory named on this page has its own page recording what was verified, when, by whom, and from which source. Scoring is documented in <a href="${routes.articlePath('how-petrohrys-score-works')}">How the PetroHrys Score Works</a>, and the verification standard in <a href="${routes.articlePath('how-directories-are-verified')}">How Directories Are Verified</a>.`)),
      ].join('\n\n');
    } else {
      main = [
        article.body({ total }),
        section('faq', 'Frequently asked questions', faqBlock(article.faqs)),
        section('related-reading', 'Related reading', relatedArticleLinks(article, emitted)),
      ].join('\n\n');
    }
    return {
      ...article,
      main: resolveTokens(main),
      // FAQs are resolved separately because they are also emitted as FAQPage
      // JSON-LD: an unresolved token there would publish a placeholder as a
      // machine-readable answer.
      faqs: (article.faqs || []).map((f) => ({ ...f, a: resolveTokens(f.a) })),
      features,
    };
  });

  // Comparisons carry their own fully-rendered main, so they join at the end.
  return [...built, ...comparisons.map((c) => ({
    ...c,
    features: [c.a, c.b],
    main: [c.main, section('related-reading', 'Related guides', relatedArticleLinks(c, siblings))].join('\n\n'),
  }))];
}

// Inverts the guide selectors. Derived from the EMITTED guides and the rows each
// one actually rendered, never from the raw article constants: a comparison
// whose subjects are missing from the dataset is dropped before emission, and
// linking it from a record page would advertise a page that was never written.
function guidesFor(articles, record) {
  return (articles || [])
    .filter((a) => Array.isArray(a.features) && a.features.includes(record.slug))
    .map((a) => ({ title: a.title, slug: a.slug }));
}

module.exports = { buildArticles, guidesFor, ARTICLES, STATIC_ARTICLES, DECISION_ARTICLES, DECISION_GUIDES, COMPARISONS, comparisonTable, section, paras, bullets };
