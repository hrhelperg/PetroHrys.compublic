# PetroHrys Research Center — Publication Contract

**Version 1.0** · 2026-08-06 · Applies to every record in
`data/business-directories/`.

This document exists because the standard the Government Registry Core is held to
was raised progressively, wave by wave, and has never been written down. It lives
in test suites and in the judgement applied during authoring. That is workable for
one pillar built by one author in sequence. It is not workable for three pillars,
and it is the reason "meet or exceed the Core" is currently ambiguous — the Core
itself is uneven, and measurably so (see §7).

Nothing here invents a new standard. It states the one already applied, makes the
non-statutory equivalents explicit, and marks honestly which rules a machine
enforces and which rest on judgement.

---

## 1. Scope and pillars

| Pillar | Subject | Category values |
|---|---|---|
| **1 — Government Registry Intelligence** | Official registries, statutory registers, regulators | `government`, `finance`, `healthcare`, `telecommunications` |
| **2 — Business Directory Intelligence** | Where a business can publish itself | `local-business`, `general-business`, `review-sites`, `marketing`, `press-release-platforms`, `legal` |
| **3 — Startup & Software Discovery** | Launch platforms, marketplaces, review platforms | `startup`, `software`, `developer`, `app-directories` |

**Category is not the pillar.** Three vertical categories — `finance`,
`healthcare`, `telecommunications` — hold *government* systems: FINRA BrokerCheck,
FDIC BankFind, SEC IAPD, FinCEN MSB, the FCA Register, the Care Quality
Commission, FDA establishment registrations, FCC ULS and Form 499. Treating
`category === 'government'` as the pillar boundary misclassifies fifteen statutory
registers, and any compliance measurement that does so is wrong. `legal` is the
mirror case: it holds two commercial ranking publications, not regulators.

A test asserts this mapping stays exhaustive, so a new category cannot appear
outside the contract.

A record belongs to exactly one pillar. Pillar membership determines which
identity contract in §3 applies. It does **not** relax any universal rule in §2.

---

## 2. Universal rules — every pillar, no exceptions

These apply identically to a national company register and to a SaaS review site.

### 2.1 Evidence

1. **A record may only assert what an official or operator-controlled source
   states, or what was directly observed.** Not a blog, not a "top 100" list, not
   a search snippet, not recollection.
2. **Quotations must match exact contiguous source text.** Verified twice, in two
   separate passes, the second without consulting the first.
3. **A guessed URL is never published.** Navigate from the operator's own site. A
   constructed URL that happens to return 200 is still a guess.
4. **A refusal is not an absence.** A WAF, CAPTCHA, JavaScript shell, geo-block or
   transport failure means *not yet verified*. It never means the system does not
   exist, and it never justifies publishing an unverified claim.

### 2.2 Access truth

5. **Unknown stays `null`.** Never infer open access from a visible form, results
   from a landing page, public search from an API, or absence of CAPTCHA from
   static HTML.
6. **`accessLevel: unknown` may not carry an observed boolean.** Reaching a page
   anonymously does not establish that the system behind it needs no credential.
7. **`freeToSearch: true` requires that result rows were actually seen**, and the
   access note must say so.
8. **No `searchUrl` is asserted unless a search was exercised.**

### 2.3 Publication truth

9. **No published field may contain an HTTP status code, a probe log, our
   research process, or a schema field name aimed at the reader.** Describe the
   host's behaviour, not the request. (Enforced: `bd-publication-truth`.)
10. **Critical limitations must render.** `editorNotes` and `publicAccess.notes`
    are editor-facing and do **not** appear on record pages. A caveat that lives
    only there has not been published.
11. **A limitation must survive in the `description` where it is load-bearing.**
    Descriptions travel into listings, feeds and metadata; a caveat that exists
    only in `cons` is absent from everywhere the description goes.

### 2.4 The three non-proofs

Every record states, in rendered prose:

12. **What inclusion proves.**
13. **What inclusion does *not* prove.**
14. **What absence does *not* prove.**

These are not optional and they are not pillar-specific. They are the single most
load-bearing rule in the dataset, because every category of record in it is
routinely misread as an endorsement.

### 2.5 Boundaries

15. **Never split one system by its own filters** — tabs, service categories,
    query modes, language variants, map views, exports, current/historical
    toggles, or operator-type filters.
16. **Never merge independent systems** because one operator links them or one
    host serves both.
17. **A shared-host group names one host.** Different subdomains are different
    hosts. Distinct systems on one host each declare `resourceIdentity` with a
    globally unique `systemKey`.
18. **Every duplicate or absorbed-view decision names the record that absorbs it**,
    in `editorNotes`.

### 2.6 Metrics

19. **No new Domain Rating measurements.** New records carry `domainRating: null`.
20. **An already-measured domain reuses its stored snapshot verbatim** — same
    domain, same measurement, so the frozen set stays at **64 measurements** and
    the digest `aa7e6984…19847a4e` is unchanged.
21. **No paid API, no API key, no build-time or runtime network request.**

### 2.7 Derived fields

22. **`petroHrysScore` is computed from `scoreFactors`** via `S.computeScore`.
    Never hand-set.
23. **`nextVerification` is computed** via `S.nextVerificationFor`. Never hand-set.

---

## 3. Identity contract — what replaces the four roles

### 3.1 Pillar 1 — the four roles

Determined **independently**, never collapsed:

1. **Legal source of record** — the legal act or decision that constitutes the
   entry. An access portal is never the source of record.
2. **Responsible authority** — the body accountable for the register.
3. **Technical platform** — who runs the software. A contractor may operate a
   system the authority remains responsible for.
4. **Public access interface** — the URL a reader actually uses.

Plus: regulated population · regulatory act · territorial scope · current vs
historical coverage · effect of inclusion · meaning of absence.

**The regulatory act must be named and never softened.** A notification is not a
licence. A registration is not a licence. A numbering right is not operator
status. A spectrum authorisation is not service authorisation. A disclosure
obligation is not an authorisation.

### 3.2 Pillars 2 and 3 — the four roles do not transfer

Yelp has no responsible authority. Product Hunt has no legal source of record.
Applying §3.1 mechanically to a commercial platform would manufacture
legal-sounding fields where no law exists — which is the exact failure mode the
Government Registry Core was built to prevent.

**Non-statutory platforms declare four different roles instead:**

1. **Platform operator** — the company that runs it, named as an institution, with
   its official URL. Never an individual.
2. **Listing control** — who can create, claim, edit and remove an entry. This is
   the real analogue of "source of record" and it is the field a reader most needs.
   The honest answers differ sharply: platform-created and business-claimed
   (Google Business Profile, Yelp); submitter-created (Product Hunt); vendor-created
   and platform-verified (G2, Capterra).
3. **Moderation authority** — who decides what stays, on what stated basis, and
   whether the operator publishes that basis at all.
4. **Public access interface** — as §3.1.

Plus: eligible population · submission model · free vs paid tiers · verification
performed by the platform · current vs historical entries · **what a listing
signals** · **what a listing does not signal** · **what absence does not signal**.

### 3.3 The prohibition that carries across

A listing on a commercial platform is **not** an endorsement, **not** verification
of the business behind it, **not** evidence of solvency or quality, and **not**
evidence that the business is currently trading. Absence is **not** evidence that
a business is illegitimate.

This mirrors §2.4 exactly. The subject changes; the discipline does not.

---

## 4. Observation classes — how to publish a fact that moves

The Phase B field list includes attributes that are real, useful and unstable:
backlink policy, link attributes, indexing behaviour, pricing, moderation speed.
Publishing them as plain facts would be false within months. Refusing to publish
them makes the pillar useless.

Every asserted fact carries one of four classes:

| Class | Meaning | Requirement |
|---|---|---|
| **A — Documented** | Stated in law, or in the operator's own published terms | Cite it. Re-verifiable at any time. |
| **B — Operator-stated policy** | The operator says so, but may change it silently | Attribute to the operator and date it. Never state as an inherent property. |
| **C — Point-in-time observation** | What was directly seen once | State that it was observed, and when. **Never** assert stability. |
| **null** | Not established | Leave null. Say nothing. |

**Link attributes, indexing behaviour and moderation speed are Class C at best.**
They may only be published as a dated observation — "observed as … on
2026-08-06" — and never as "this directory gives dofollow links". Most will be
`null`, and that is the correct outcome: the record still answers *where can I
list, on what terms, controlled by whom, and what does it signal* — which is the
question that actually matters.

---

## 5. Rejection contract

Never published, in any pillar:

- guessed URLs · regulator or corporate homepages standing in for a system
- dead, parked, abandoned or archived sites
- guidance pages presented as registers
- coverage maps, dashboards, status pages, price comparators
- market-information datasets presented as official lists
- consumer help pages · login pages presented as open databases
- trade-association membership lists presented as registers
- spam farms, AI-generated directories, link farms
- any platform with no observable value to the reader

**A service label is not a population.** "VoIP", "MVNO", "ISP", "satellite",
"broadcaster", "AI directory" may describe technology, business model or a filter.
None of them creates a separate record on its own.

---

## 6. Verification and testing discipline

Every wave:

1. **Two direct research passes.** Pass 2 reopens every source without consulting
   Pass 1, and challenges identity, URL, operator, legal basis, population,
   duplicate status, access claims and every quotation. All Pass 2 corrections are
   reported.
2. **Non-vacuous tests.** A guard that cannot fail is not a guard.
3. **Mutation probes**, requiring: intended mutation applied · intended guard
   failed · zero survived · zero broken · zero no-op · restoration from a current
   snapshot, never a git tree.
   - A probe must strip a fact from **every rendered field including the
     `description`**, or it has not injected its defect. This caused survivors in
     four consecutive waves.
   - A cross-country clone must be written to the target country's file, or the
     validator catches placement and the semantic guard never runs.
4. **Full pipeline**: validator exit 0 · migration ×2 rewriting 0 · build ×2
   writing 0 and pruning 0 · sitemap equals indexable set · RSS equals published
   records · zero broken links · JSON-LD parses · titles and descriptions unique ·
   DR digest unchanged · clean tree.
5. **New guards run against the whole existing layer, not only the new records.**
   This is how genuine gaps in older records surface. Scoping a guard to the
   current wave passes cleanly and hides them.
6. **Coverage manifests are pinned to the registry by test.** They have drifted in
   three separate waves.

---

## 7. Current compliance — measured, not asserted

As at 2026-08-06, 272 records, measured on the §1 pillar mapping:

| Rule | Pillar 1 (218) | Pillars 2–3 (54) |
|---|--:|--:|
| §2.4 states what inclusion does not prove | 62% | **0%** |
| §2.4 states what absence does not prove | 29% | **0%** |
| §3 identity roles declared | 38% | **0%** |
| `operator` populated | **100%** | **0%** |
| `registryTypes` populated | **100%** | **0%** |

The split is exact, not approximate: **every** Pillar 1 record carries an operator
and registry types, and **not one** Pillar 2–3 record does. The 54 commercial
records are precisely the pre-contract layer.

**This contract is not retroactively satisfied.** All 54 Pillar 2–3 records
predate every part of it. Early Pillar 1 waves predate §2.4, which is why that
column reads 62% and 29% rather than 100%.

**Migration policy.** No mass rewrite. A record is brought up to contract when a
wave touches its layer, and the wave reports what it repaired. Precedent:
`us-fcc-uls` and `us-fcc-form-499` were repaired in Wave 4B because the wave's
guards ran across the whole telecom layer and exposed that both stated neither
non-proof.

**Consequence for Phase B.** The 54 records should be remediated before the
pillar expands, or the gap widens faster than it closes. Their structural fields
(`operator`, `registryTypes`) are mechanical and can be filled from the operator's
own site; §2.4 and §3.2 require judgement per record.

**Floor, not ceiling.** A test pins Pillar 1 at 100% on both structural fields so
the achieved standard cannot silently regress while attention is on Phase B.

---

## 8. What a machine enforces, and what it does not

Being explicit about this matters: the unenforced rules are the ones that decay.

**Enforced by the registry loader** (`scripts/lib/bd-registry.cjs`): country/file
placement · declared category vocabulary — a record cannot reference a category
that `categories.json` does not declare.

**Enforced by the validator** (`scripts/validate-business-directories.cjs`):
jurisdiction and scope coherence · supranational modelling · registry-type
vocabulary and primary type · `resourceIdentity` shape and globally unique
`systemKey` · shared-host groups naming one host · **material URL difference on a
shared host** (rejects query-parameter and search-mode variants — this enforces
§2.5 natively) · https URLs · operator shape · access booleans tri-state ·
score derivation · Domain Rating reuse policy.

**Enforced by tests** (46 suites): publication truth · source-of-record
separation · shared-domain snapshot and DR digest · per-wave content guards ·
sitemap, RSS, JSON-LD, routes, rendering, no-JS completeness.

**Not enforced — carried by judgement and review:**

- whether a quotation is genuinely contiguous and current
- whether a duplicate decision is *correct*, as opposed to merely recorded
- whether the identity roles were determined independently or back-filled
- whether "what inclusion does not prove" states the thing a reader would
  actually get wrong, rather than a safe generality
- whether a rejected candidate deserved rejection
- observation class (§4) — currently prose, with no field to hold it

The last item is the clearest candidate for future schema work: §4 is a contract
the data model cannot yet express.

---

## 9. Amendment

This contract is versioned. Changes are proposed in a wave, recorded in the
release note, and the version incremented. A wave that finds the contract wrong
says so and proposes the fix rather than quietly departing from it.
