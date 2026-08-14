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

## 6. Unresolved, deliberately

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
