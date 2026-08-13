# Tender Opportunity Intelligence — Phase 3

Source expansion and a scheduled-refresh foundation. Companions:
`TENDER-OPPORTUNITY-INTELLIGENCE-V1.md` (architecture) and
`TENDER-OPPORTUNITY-SOURCE-POLICY.md` (what each source is and what may be
stored).

Phase 3 asked one question: **can this architecture run a broader source
network without losing control, and without a database?**

The answer is yes on control, yes on storage, and **no on the source target** —
not because the architecture failed, but because the sources do not exist in
the form the target assumed. That finding is the main result.

---

## The headline: 65 candidates, 1 new active source

| | |
|---|---|
| Sources before | 8 active |
| Candidates probed in Phase 3 | 57 systematically + 8 follow-ups |
| **Sources after** | **9 active, 1 adapter-ready** |
| Qualification rate, all phases | **9 of 100 probed** |

The directional target was 15–25. Phase 3 delivered 9.

Part 3 of the brief anticipated this: *"If only 14 pass: ship 14. Do NOT lower
source standards to hit 25. The metric is QUALIFIED SOURCES, not PROBED
SOURCES."* Nine is what passed.

### What actually blocks the other 56

Every rejection has a recorded class and evidence. The distribution matters
more than the count, because it says whether more effort would help:

| Blocker | Count | Would more work help? |
|---|---|---|
| Documented path returns 404 | 17 | Sometimes — some are wrong guesses at undocumented APIs |
| HTML only, no data endpoint | 11 | No — not without browser automation, which is out of scope |
| Host unreachable from this egress | 8 | **Unknown** — needs re-probing from another network |
| WAF / bot protection (403) | 6 | No |
| Auth or API key required | 3 | Yes, if a key is obtained (SAM.gov) |
| Stale or historical data only | 3 | No |
| Awards, not opportunities | 2 | No — wrong entity for this layer |
| Non-JSON structured (ATOM/CSV) | 3 | Yes, with a parser |
| Access pattern impractical | 2 | Only if the publisher adds bulk access |
| Empty for the probed window | 1 | Maybe |

Three of those deserve emphasis:

**"Unreachable from this egress" is not a verdict.** Greece, Uganda, Nigeria,
Mexico, Georgia, Peru, Ecuador and Ghana did not resolve. That may be
geo-blocking, DNS, or this machine. They are recorded as
`UNKNOWN_FROM_CURRENT_EGRESS`, not as failures, and re-probing from a different
network is a cheap Phase 4 task with real upside.

**A 200 is not qualification.** Germany returned 1,153 real OCDS releases on
the first working request — and every one of them had no status and no
deadline. Ingesting them would have added 697 German "tenders" that no supplier
could ever see, because they would all have been `UNKNOWN` and excluded from
every view. It took a fourth probe to find the variant that works.

**Freshness is a filter.** Moldova's OCDS endpoint responds, and its newest
record is from 2018. Poland's returns 2024. Both would have looked like
successful integrations in a source count.

---

## What was added

### UK Contracts Finder — active

The only new source ingesting live. Chosen for what it adds beyond a source
already in the pilot, per Part 7's test:

- **below-threshold** UK procurement that never reaches the Official Journal
  or Find a Tender;
- CPV classification and real contract values;
- OGL v3.0 **declared in the API response**, not inferred;
- overlap with Find a Tender on above-threshold notices, giving the
  deduplication graph a second live cross-source pair.

It is a configuration of the Phase 2 OCDS factory plus one new paging dialect
(`publishedFromCursor`), which is the factory paying for itself.

### Germany — adapter-ready, deliberately not active

`oeffentlichevergabe.de`, the German federal notice service. The adapter is
written and verified against 1,153 real releases. It is **not ingesting**, and
the reason is referential integrity rather than capability:

> There is no canonical `TenderPlatform` record for this notice service. The
> closest, `de-evergabe-bund`, is evergabe-online.de — the federal
> e-procurement **platform**, a different system from the federal **notice
> service**.

Part 43 forbids a source auto-creating a platform, and the platforms collection
has its own evidence standard — operator verification, evidence class, browser
check — that belongs to a platforms wave, not to a source-expansion phase.
Ingesting Germany would have meant either pointing at the wrong platform or
minting a record to a lower standard than the other 382.

**This is the single highest-value unblock available to Phase 4, and it is one
platform record away.** The largest procurement market in the EU is sitting
behind a bookkeeping gap, not a technical one.

Germany also required a **ZIP reader** (`to-zip.cjs`), because the service
serves only ZIP content types and returns 406 for `application/json`. It reads
the central directory rather than scanning local headers — local headers may
carry zeroed sizes with the real values in a trailing descriptor, which is
exactly the shape that makes a naive forward scan silently truncate.

---

## The refresh orchestrator

```bash
node scripts/refresh-tender-opportunities.cjs --all
node scripts/refresh-tender-opportunities.cjs --source ted --source boamp
node scripts/refresh-tender-opportunities.cjs --all --dry-run
```

Nine sources refresh in **57 seconds**, sequentially. There is no concurrency,
deliberately: the run is already short, and parallel requests against public
infrastructure buy nothing worth the pressure.

### Source isolation, tested live

The interesting case is not "everything worked":

```
✓ tenderned:   205 records · complete window
✗ za-etenders: HTTP 404 → previous snapshot retained (44 records), state DEGRADED
Corpus rebuilt from both valid states.
```

That was produced by breaking a real endpoint and running the orchestrator, not
by a fixture. One source failing keeps its own last-good data, does not touch
any other source, and does not stop the run. Only an all-sources failure fails
the run.

### Health, and what it may never touch

Per source: `lastAttemptAt`, `lastSuccessfulAt`, `lastSuccessfulRecordCount`,
`lastResult`, `lastErrorClass`, `consecutiveFailures`, `snapshotHash`,
`window`, `state`.

States: `HEALTHY` · `DEGRADED` (2 consecutive failures) · `FAILING` (4) ·
`RATE_LIMITED` · `AUTH_REQUIRED` · `UNKNOWN`.

Failure classes are specific, because "network error" is not a diagnosis — a
429 and a schema change need opposite responses. A 404 on an endpoint that
worked yesterday classifies as `SCHEMA_CHANGED`, not `TRANSPORT`: the fix is to
read the provider's changelog, not to check connectivity.

**Health never touches a tender.** A source being unreachable says nothing
about the tenders it published last week — they are still open, and the
deadline has not moved. A test asserts the match engine cannot even see health,
and a mutation asserts that adding health fields to a record changes no score.

`HEALTHY` and `STALE` are different questions and are not collapsed: a source
whose last attempt succeeded 500 hours ago is healthy *and* stale, and hiding
either would mislead.

Health is **not committed**. It changes on every run by definition, so
committing it would add a diff to every refresh that says nothing about
procurement. It lives beside the snapshots, under the same gitignore.

### Idempotence

A refresh that changes no fact writes no corpus. The corpus carries
`generatedAt` and per-source `retrievedAt`, which move on every run — so before
writing, the candidate is compared against the existing file **with timestamps
masked**. Identical facts, no diff.

Verified: a rebuild after a full refresh reports `unchanged` despite a new
`generatedAt`.

### Scheduler state: SCHEDULE_READY

Not `PRODUCTION_SCHEDULED`, and the difference is deliberate.

The repository has **no GitHub Actions workflows at all**. Introducing a
scheduled job that commits network-fetched data to a branch humans also work on
would create automatic commits, potential conflicts on a 9.4 MB file, and a
class of failure nobody is watching for. Part 49 sketches a safer shape —
scheduled job → refresh branch → validation → controlled promotion — and that
is a Phase 4 decision with its own design, not a file to drop in at the end of
a source phase.

The orchestrator is what makes that decision cheap when it is taken: it already
runs one source, several, or all; it already isolates failures; it already
records health. Scheduling it is configuration.

---

## Storage — the Part 29 decision

Measured after expansion, at 9 active sources:

| Measure | Value |
|---|---|
| Canonical records | 8,682 |
| Source occurrences | 8,986 |
| **Committed corpus** | **9.39 MB** (1.91 MB gzipped) |
| **Bytes per canonical record** | **1,134** |
| Raw snapshots (gitignored) | 19.1 MB |
| Public CSV | 3.64 MB |
| Mean records per source | 868 |
| Full refresh wall time | 57 s |
| Test suite | 1,704 tests, ~5 s |

Phase 2 measured 1,136 bytes/record at 8 sources. Phase 3 measures **1,134 at
9** — the columnar format holds as sources are added, because per-record cost
is a property of the format, not of the source count.

### Projections

The honest projection is not "records × sources", because window size is a
choice. At the current mean of ~870 records per source:

| Sources | Records | Corpus | Gzipped |
|---|---|---|---|
| 9 (today) | 8,682 | 9.4 MB | 1.9 MB |
| 25 | ~21,700 | ~24 MB | ~5 MB |
| 50 | ~43,500 | ~49 MB | ~10 MB |

A 24 MB file rewritten on each refresh is uncomfortable but workable. A 49 MB
one is not: it exceeds what git handles gracefully in a working repository,
and every refresh would write a diff larger than the rest of the site.

### Decision: **KEEP_GIT_FOR_NOW**

Git-backed columnar storage is acceptable for the current 9 sources and remains
acceptable to roughly **25**. It is not acceptable at 50.

Two qualifications, because the record count is the *less* important half:

1. **Windows are the real lever.** Twenty-five sources at tighter windows would
   buy geographic coverage at today's corpus size. More sources need not mean
   proportionally more records, and the source that most needs a tighter window
   is TED at 3,094 records — a third of the corpus.
2. **Concurrent-write risk is what will actually force migration**, not size.
   The moment a scheduled job commits to a branch humans also use, a 9 MB file
   becomes a conflict surface. That is a scheduling decision, and it arrives
   before the byte count does.

---

## What did not change

Frozen for this phase, and asserted by tests:

- the canonical opportunity model
- the 16 supplier profiles
- the match weights (`category 40 · geography 20 · actionability 15 ·
  deadline 15 · confidence 10`)
- canonical `TenderPlatform` data — fingerprint `ee9fe093`, unchanged for four
  phases
- Business Directories, Marketplaces, Media — unchanged
- the public route, the SEO policy, the UI

A mutation asserts the match weights specifically, because a source-expansion
phase quietly becoming a scoring change is the failure mode Part 1 names.

---

## Known limitations

- **The source network is 9, not 15–25.** The ceiling is the supply of
  machine-accessible official procurement data, not the architecture.
- **Germany is one platform record from active.**
- **SAM.gov remains deferred** — no API key in this environment. The adapter
  requirement is documented; nothing fake was ingested in its place.
- **Eight candidates were unreachable from this network** and are recorded as
  unknown rather than rejected.
- **No scheduler is deployed.** The orchestrator is runnable and tested;
  automatic commits are a design decision Phase 4 should take deliberately.

## Phase 4 triggers

1. Add the `oeffentlichevergabe.de` platform record through the platforms
   collection's own evidence process — unblocks the largest EU market.
2. Re-probe the eight unreachable hosts from a different egress.
3. Design the scheduled-refresh promotion path (branch → validate → promote)
   before deploying any cron.
4. Revisit storage when either 25 sources or scheduled commits arrive,
   whichever comes first.
