# Browser verification — wave B1

**Date:** 2026-08-14
**Instrument:** `scripts/verify-blocked-listings.cjs`, real Chrome over CDP
**Collections:** Business Directories, Marketplaces

This log exists so a later pass can tell **"not researched yet"** from
**"researched, and this is where it stopped"**. Every record named below has now
been visited by a browser; the ones still marked unknown are unknown for a
recorded reason, not for lack of trying.

`/docs/*` is blocked from public serving.

---

## 1. What the backlog was

445 directory records and 115 marketplace records carried a note reading, in one
of fifteen phrasings, *"Live but behind a bot filter, so a browser check is
needed."*

That note is not a failure. It is the collection's rule working correctly: a
`fetch` had returned 403 or a JavaScript shell, and **no fetch is ever called
browser verification**, so `currentStatus` stayed `unknown` — the honest answer —
and the record asked for the one instrument that could settle it.

Nothing could settle them until this repository had a real browser harness. It
now has one, built for the Distribution Planner, and this wave points it at the
backlog.

## 2. How a verdict was reached

One visit, to the homepage, once, at a human pace, from one machine.

Chrome identifies itself as the Chrome it is rather than as `HeadlessChrome`,
and does not advertise automation. **That is the whole of the configuration.**
No proxy rotation, no fingerprint spoofing, no captcha solving, no retry storm.
A site that still declines is left alone — `blocked` is a recorded outcome here,
not a problem to defeat.

Probing and deciding are separate runs against the same evidence file
(`data/business-directories/.browser-verification.json`), so the judgement can be
re-read and argued with before a single record changes.

| Verdict | Meaning | What it writes |
|---|---|---|
| `active` | the site served its own content, ≥400 characters rendered | `currentStatus: active` |
| `redirected` | a different registrable domain answered | nothing; stays `unknown` |
| `blocked` | challenge signature, or HTTP ≥400 | nothing; stays `unknown` |
| `inconclusive` | too little rendered to judge | nothing; stays `unknown` |
| `unreachable` | the browser could not open it at all | nothing; stays `unknown` |

In every non-`active` case only the date and the reason are refreshed. The
wording deliberately keeps the phrase *"browser check"*, because the operations
suite enforces that every `unknown` record says what remains unresolved.

## 3. Result — Business Directories

445 probed.

| Verdict | Count |
|---|---:|
| active | 227 |
| blocked | 192 |
| redirected | 16 |
| inconclusive | 6 |
| unreachable | 4 |

`currentStatus` moved from **1085 active / 447 unknown** to **1312 active /
220 unknown**. 36 records additionally gained a published route, lifting
`listingAction: create` from 16 to 50 and `claim` from 0 to 2.

### 3.1 Why `blocked` is still 192

| Signature | Count |
|---|---:|
| cloudflare-interstitial | 98 |
| http 403 | 37 |
| access-denied | 17 |
| cloudflare-attention | 17 |
| http 404 | 7 |
| http 405 | 5 |
| http 429 | 4 |
| http 503 | 2 |
| http 500 / 502 / 522 / 526 | 1 each |
| captcha | 1 |

These stay `unknown`. Defeating them is possible and is not going to happen
here: the collection would be trading its evidence discipline for a number.

### 3.2 Redirects — 16 records, each a real finding

A different domain answering is **not** grounds to call a record active: what is
alive is the destination, not the entry. All 16 keep `unknown` and now carry
what was observed. Several are corporate events worth a human decision:

| Record | Now answered by | Reading |
|---|---|---|
| `uk-applegate` | businessmagnet.co.uk/businessmagnet-acquires… | acquisition, stated on the landing page |
| `global-seedrs` | europe.republic.com | acquired and rebranded |
| `au-oneflare` | airtasker.com/au | acquired |
| `global-accesswire` | accessnewswire.com | rebrand |
| `bb-barbadosyp`, `jm-jamaicayp` | findyello.com | regional consolidation |
| `de-opendi` | stadtbranchenbuch.com | brand replaced |
| `dk-eniro` | krak.dk | brand replaced |
| `be-/ch-/fr-/it-/pl-cylex` | cylex-belgie.be etc. | same operator, per-market domains |
| `de-myhammer`, `ie-justeat` | my-hammer.de, just-eat.ie | same brand, hyphenated domain |
| `global-ziprecruiter` | ziprecruiter.ie | **geolocation, not a corporate event** — this machine's IP decided it, and the record should not be rewritten on that basis |

### 3.3 A correction made mid-wave

The first pass reported 21 redirects. Five of them were not redirects at all:
the host comparison kept the last three labels of any 3+ label hostname, so
`fr.avis-verifies.com` did not match `avis-verifies.com`, and `web2.cylex.de`
did not match `cylex.de`. A plain subdomain is the same site.

The comparison now resolves the registrable domain against a list of two-level
public suffixes, and those five were **re-probed rather than re-judged from
memory** — 21 network calls, not 445, because the judgement had changed and the
sites had not. Re-probing a subset merges into the findings file and replaces
only the records it re-examined; overwriting the file with a subset would
silently delete verified work.

### 3.4 Routes are only recorded when the operator published them in words

A route comes from anchor **text**, not from a URL. `/signup` says nothing about
who may sign up; a link reading "Add your business" is the operator publishing
the route.

Where the words and the path disagree, neither is recorded. Manta's homepage
offers *"Claim My Listing"* pointing at `/business-listings/add-your-company` —
creating a listing and claiming an existing one are different acts, and a link
that says one while pointing at the other has established neither. That record
keeps `listingAction: unknown`.

## 4. Result — Marketplaces

See §3 for method. Marketplaces have never carried a `lastVerified` field, so
the date lives in the note rather than inventing a column for one pass, and no
route is recorded because the schema has nowhere to put one.

Counts are recorded in `data/marketplaces/.browser-verification.json`.

## 5. What this wave changed in the product

One test changed behaviour as a **consequence of healthier data**, not a defect:

`the campaign draws from more than one collection when several fit` pinned the
property to one hard-coded context — local discovery in the United States. With
227 more active directories, 48 of them now outrank every marketplace for that
objective: the 40th pick scores 53 against a best marketplace of 43. Drawing
that marketplace in would be precisely the quota behaviour the engine refuses.

The engine was right and the premise was stale. The assertion now tests the rule
instead of the context — and had to be written twice, because the first rewrite
was **vacuous**: "no collection is excluded while it outranks the weakest pick"
is an invariant of pure score-ordering, and a mutant with the tie-break deleted
survived it untouched. The assertion now looks for the one signature pure
score-ordering cannot produce — a picked opportunity scoring strictly less than
an eligible one left out — and that mutant now dies.

## 6. Expansion — 69 candidates proposed, 8 accepted

Expansion runs the pipeline backwards: recovery asks "is this record still
true", expansion asks "does this proposed record deserve to exist at all".

69 national directories were proposed from memory for the 68 countries holding
two records or fewer, and every one was put in front of a browser.

**8 were accepted. 61 were not.** That ratio is the result, not a failure of it.

| Outcome | Count |
|---|---:|
| unreachable — the domain does not exist | 29 |
| already in the collection | 16 |
| blocked by a live bot filter | 6 |
| inconclusive — too little rendered | 4 |
| redirected elsewhere | 3 |
| parked domain for sale | 1 |
| failed a country or category evidence test | 2 |
| **accepted** | **8** |

29 of the proposals were domains that simply do not exist. A knowledge-driven
list of national directories is roughly one part fact to four parts plausible
guess, and the only reason that is safe is that nothing reaches the corpus on
the strength of being plausible.

### 6.1 The parked-domain hole, found by reading the output

`belizedirectory.com` **passed** the first evidence run. Its page is titled
*"belizedirectory.com for sale | Spaceship.com"* — which names Belize and says
"directory", satisfying both tests, because **the domain name being sold does**.
Every signal on that page was circular.

The check now rejects domains for sale, parking pages, "coming soon"
placeholders and unconfigured default server pages, and it runs *before* the
evidence test and cannot be overridden by it. Re-running dropped acceptance from
9 to 8, and only that record moved.

### 6.2 What was accepted

| Country | Record | What the page says it is |
|---|---|---|
| Bosnia and Herzegovina | `ba-yellowpages` | Poslovni imenik Bosanske Žute strane |
| Greece | `gr-vrisko` | Vrisko.gr — Κατάλογος Επαγγελματιών, Επιχειρήσεων |
| Iceland | `is-ja` | Já.is |
| Luxembourg | `lu-yellow` | Guide local Yellow.lu |
| Latvia | `lv-firmas` | Firmas.lv |
| Malta | `mt-yellow` | Businesses in Malta and Gozo — with a published "List Your Business" route |
| Russia | `ru-rusprofile` | Проверка и анализ российских юридических лиц |
| Zambia | `zm-yellowpages` | Zambia Yellow Pages |

Luxembourg and Russia had **no** directory record before this. Countries with
zero directory coverage fell from 16 to 14; the collection stands at 1,541
records across 111 countries.

Malta's route carried UTM parameters. They are analytics-only and were stripped;
the destination is unchanged.

Directory vocabulary is matched in the languages these markets publish in —
Greek, Cyrillic, Baltic and South Slavic forms included. Matching English alone
would have rejected most of the accepted set for being foreign, which is exactly
backwards.

### 6.3 Why the remaining gaps stay gaps

Armenia is skipped by instruction. Cuba, Laos, DR Congo, Sudan, Cambodia,
Kosovo, Belarus, Kuwait, Lebanon, Zimbabwe, Botswana and Cyprus produced no
proposal that survived a browser. The European Union is supranational and a
directory record there would be a category error, not a gap.

These are honestly empty. Filling them would mean recording platforms nobody has
seen, which is the one thing this collection is built not to do.

## 7. Unresolved, deliberately

- **192 directories behind live bot protection.** Reachable only by a human or
  by evasion. The first is welcome; the second is not.
- **16 redirected directories.** Each needs a human decision: is the record dead,
  renamed, or merely pointed at a stale domain? Six are acquisitions.
- **10 directories inconclusive or unreachable** — `ae-yallamotor`,
  `ca-trustedpros`, `eg-yellowpages`, `global-eworldtrade`, `global-jora`,
  `global-zaubee`, `id-bukalapak`, `nl-nationalevacaturebank`, `us-cargurus`,
  `us-showmelocal`. Several rendered under 400 characters, which is a client-side
  application shell, not an answer.
- **62 media records** carry `currentStatus: unknown` for a different reason
  entirely: they were never researched past identification. They are **not** part
  of this wave and must not be counted as blocked.

---

# Quality & backlog resolution — wave Q1

**Date:** 2026-08-14 · **Branch:** `feat/research-center-quality-backlog-v1`

Four programs, run against the corpus wave B1 left behind. Nothing here is a
volume expansion; every number below is a record that already existed becoming
truer.

## Program 1 — redirects, rebrands and acquisitions

30 cases audited in a browser (17 known, 13 discovered by Program 4), each
classified from the hop chain, the destination's own identity, whether that
destination is already a record here, and whether its landing page says why.

| Outcome | Count |
|---|---:|
| DOMAIN_MOVE — repointed, stays active | 18 |
| REBRAND — repointed and renamed | 6 |
| CONSOLIDATED into an existing record — marked `redirected` | 5 |
| GEOLOCATED — nothing changed | 1 |

Applegate → Businessmagnet is an acquisition announced on the landing page,
dated 19 September 2025. Seedrs trades as Republic Europe. Oneflare's brand
retired on 30 June 2026. Eniro Denmark serves Krak; opendi.de serves
Stadtbranchenbuch — both already recorded, so both old records stopped being
active rather than becoming a second copy.

**Barbados is the case worth remembering.** Consolidating `bb-barbadosyp` into
`jm-findyello` would have deleted the country's entire directory coverage — and
would have been wrong, because the identity key here is `country/domain`, not
`domain`. Both schemas say so, and encuentra24 already holds six records on one
host for six markets. Jamaica genuinely was a duplicate (same host, same
country) and was consolidated. Barbados was repointed at findyello's Barbados
section and stays active.

## Program 2 — the Media backlog

62 records that had never been researched past their own name.

| Outcome | Count |
|---|---:|
| ACTIVE_VERIFIED | 30 |
| UNKNOWN_PROTECTED | 30 |
| REDIRECTED (channelfutures.com → Channel Dive) | 1 |
| UNRESOLVED | 1 |

3 submission routes and 3 opportunity types established, from the operator's
own wording. Every verified record with no route now states why it has none.

The schema refused ten advertising and media-kit URLs, and was right to: those
fields may only be set when an opportunity type justifies them. This is a
register of **editorial** opportunities, and "we sell advertising" does not
evidence that a publication accepts sponsored articles.

## Program 3 — the protected backlog, bounded

268 records remained behind live protection. They had already had one browser
attempt each. A second attempt with the same configuration would produce the
same answer, and a second attempt with a *different* configuration would be
circumvention, which is out of scope by instruction and by principle.

So the retry was scoped to the only variable that is legitimately different on
a second look: **time**. A 429 or a 5xx is transient; a Cloudflare interstitial
is policy.

- 26 transient failures retried (429, 5xx, unreachable, under-rendered)
- 3 recovered: `ae-yallamotor`, `mp-es-milanuncios`, `mp-us-mercari`
- 241 policy refusals **not** retried, and still `unknown`

## Program 4 — actionability

482 live records whose listing action was unknown — the P1/P2, tier-1/tier-2
cohort — each visited along one or two steps of the operator's own navigation,
because a directory's front page is a search box and "how do I get listed" is
usually one click behind it.

- 37 listing routes established from wording ("Add Your Business", "List your
  business", "Claim Your Free Business Account")
- 1 rejected: a 79-character run-on beginning "Business GuideEthiopian Business
  Directory - List Your Business Profile. Search…" is page text that happened to
  sit inside an anchor, not a call to action
- 13 records believed active turned out to be redirects, and went to Program 1
- 2 more routes found for records that claimed an action with no URL; the other
  10 keep the action their earlier research established and now record that no
  route is published in words

## Planner truth

| Bucket | Before wave Q1 | After |
|---|---:|---:|
| Ready to execute | 63 | **103** |
| Needs research | 1446 | **1427** |
| Needs browser verification | 268 | **250** |

Ready rose by 64%. Needs research barely moved, and that is the honest result:
establishing that a site is alive and finding where its listing form lives are
different questions, and 431 of the 482 records examined still have not answered
the second one. The objective was classification truth, not a bigger Ready.

## Corpus quality

`scripts/audit-corpus-quality.cjs` sweeps all four collections for malformed
canonical URLs, notes contradicting their own record's status, unexplained
unknowns, parked-domain wording, duplicate live identities, routes equal to the
homepage, actions with no route and no account of why, and redirects that name
no survivor.

**0 problems across 2,747 records**, from 20 at the start of the wave.

Two of those twenty were the audit being wrong rather than the data:

- Six "duplicate" tender records are the multilateral banks — AIIB, IsDB, BCIE,
  FONPLATA — each running corporate procurement and project procurement as
  separate systems on one domain, and three UN agencies behind one e-tendering
  vendor. Different systems, different suppliers, different rules. The identity
  key now includes the path, which is what bd-schema already said.
- `limitations` is where a record says what could not be established about a
  *route*. Reading "the submission form returned 403" as contradicting an active
  publication punished the collection for being precise.
