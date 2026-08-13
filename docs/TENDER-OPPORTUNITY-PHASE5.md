# Tender Opportunity Intelligence — Phase 5

Production scheduling and durable refresh state.

Phases 1–4 built a pipeline a person runs. Phase 5 asks whether it can run
without one — and the audit found a defect that made the answer *no* in a way
nobody would have noticed until it had already destroyed the corpus.

---

## The audit finding that defined the phase

Phase 3 built fail-closed retention. Phase 4 watched it work twice against real
failures. The guarantee was real — and entirely dependent on state that existed
only on the machine that had run the previous refresh.

The snapshots directory is gitignored, correctly: it is 19 MB. The health file
lived inside it. **A CI runner is a fresh clone, so it has neither.**

Running the existing rebuild on a checkout with no snapshots was measured, not
theorised:

```
Corpus: 0 canonical opportunities from 0 source records. written.
```

Zero. **Written.** A scheduled job would have destroyed 9,572 opportunities on
its first run, and every existing guard would have reported success — because
every guard watched the *source* layer while the *corpus* quietly rebuilt
itself out of nothing.

Deploying the Phase 3 orchestrator to Actions unchanged would have been the
single most destructive thing this project could have done.

### The fix: the corpus is the last-good store

The committed corpus already holds every promoted record with its `sourceId`
and full occurrence provenance. It **is** the durable last-good state — in git,
by construction, already the thing the build reads.

The rebuild now reads, per source:

- the fresh candidate snapshot, if this run promoted one;
- otherwise, the records that source contributed to the committed corpus.

```
· boamp: no fresh snapshot; retaining 886 last-good record(s) from the corpus.
· de-vergabe: no fresh snapshot; retaining 1058 last-good record(s) from the corpus.
Corpus: 9572 canonical opportunities. written.
```

Same 9,572, from a clone that had never seen a snapshot. Snapshots become what
they should always have been: a local cache that makes a re-run faster, not the
only copy of the truth.

One subtlety the tests pin down: a merged opportunity must return a record to
**every** source that published it. Otherwise the first time TED refreshes
alone, BOAMP's side of 139 merges disappears.

---

## Answers to the Part 1 audit questions

| | Question | Answer |
|---|---|---|
| A | Source 3/10 fails | Retains last-good, other nine promote, run `DEGRADED` |
| B | Valid JSON, zero records | Refused — below the 10-record floor; last-good retained |
| C | Schema changes | `SCHEMA_CHANGED`; normalization rejects; snapshot not promoted |
| D | HTTP 429 | `RATE_LIMITED`, not retried into a storm, last-good retained |
| E | HTTP 403 | `WAF`; not retried (4xx is an answer) |
| F | Timeout | `TIMEOUT`; bounded retry with backoff, then retained |
| G | Malformed data | `INVALID_PAYLOAD`; nothing promoted |
| H | 30% rejected | Records dropped individually; count collapse guard catches the aggregate |
| I | 2,000 → 20 | Collapse guard refuses promotion; `--accept-shrink` is the operator override |
| J | Adapter duplicates | Duplicate-ratio guard >20% refuses |
| K | Orchestrator dies | Lock goes stale after 45 min and is reclaimed with a report; corpus untouched |
| L | Two refreshes | Second refuses to start; the workflow also serialises |
| M | Human pushes to main | Refresh branch is **reset from main each run**, so it cannot overwrite |
| N | Git push fails | `--force-with-lease` refuses; job fails visibly; data unchanged |
| O | Survives termination | Committed corpus + committed `refresh-state.json` |

---

## Architecture

### Two-phase promotion

**Phase A — per source.** Fetch → validate → promote or retain. Independent;
one failure touches nothing else.

**Phase B — corpus.** Assemble from promoted candidates *and* retained
last-good, then gate:

- ≥100 opportunities (catches a rebuild-from-nothing);
- not below 50% of the published corpus (catches catastrophic loss);
- every record resolves to a canonical platform.

If Phase B refuses, the published corpus is left exactly as it was. This is the
gate a per-source check cannot substitute for: source validation cannot see the
corpus.

### Durable state

`data/tender-opportunities/refresh-state.json` — **1,692 bytes**, committed.
Per source: state, last attempt, last success, failure class, consecutive
failures, promoted/retained counts, snapshot hash, completeness, window.

No records (they are in the corpus), no credentials, no payloads. Tests assert
the size bound and the absence of anything credential-shaped.

It is rewritten only when something an operator would care about changed —
`lastAttemptAt` moving is not a change. Otherwise a daily scheduler produces a
daily commit that says only "the job ran".

### Concurrency

Workflow `concurrency` group with **`cancel-in-progress: false`** — cancelling
a job mid-promotion is exactly how a half-written corpus reaches a branch. A
queued run waits.

Plus an on-disk lock with pid and start time, because a workflow guard does not
stop a human running the script during a job. Stale after 45 minutes, reclaimed
with a report rather than silently.

### Promotion model: **B — machine branch → PR → human merge**

Direct-to-main was rejected on a measured risk. The corpus is a 10 MB single
file; a bot committing to main on a day a human is working produces a conflict
no one can resolve by hand, and the tempting fix is a force push that destroys
work. A PR costs one click and removes the class entirely.

The refresh branch is **reset from the main just checked out**, so a stale bot
branch cannot overwrite newer work — it is rebuilt from it. The push is
`--force-with-lease`, scoped to a branch no human touches. Main is never
force-pushed; a test asserts it.

**Auto-merge is deliberately not enabled.** The gate can prove the data is
structurally sound; it cannot prove a procurement source has not started
publishing subtly wrong facts. That judgement stays with a person until there
is evidence it can be automated away.

### Schedule: daily, 05:40 UTC

Derived from the sources, not from habit. TED, BOAMP, TenderNed and the German
Bekanntmachungsservice all publish on business mornings in CET/CEST, so an
early-UTC run catches the previous day complete. The odd minute avoids the
top-of-hour crush that makes GitHub's scheduler drift.

One daily run for all ten sources: the full refresh measures **~57 seconds**,
so per-source cadences would add operational surface for no benefit.

### Run status

`HEALTHY` (all promoted) · `DEGRADED` (some retained last-good, corpus safe) ·
`FAILED` (corpus promotion refused). A 429 with successful retention is
**not** HEALTHY and **not** FAILED.

---

## Live verification

Controlled config change, not endpoint abuse:

```
✓ tenderned:            207 records · complete window
✗ za-etenders:          HTTP 404 → keeping previous snapshot (46 records)
✓ uk-contracts-finder:  33 records · complete window

Corpus: 9,577 canonical — written.
✗ za-etenders: SCHEMA_CHANGED — retained 46 records, state DEGRADED
Run status: DEGRADED
```

One source down and classified, two promoted, corpus rebuilt from all valid
states, status honest.

---

## Storage — re-measured

| | Phase 4 | Phase 5 |
|---|---|---|
| Canonical opportunities | 9,572 | 9,577 |
| Corpus | 10.17 MB | 10.17 MB |
| Bytes / record | 1,114 | **1,114** |
| Durable state | — | 1,692 B |
| **Typical refresh diff** | — | **1 line changed** |

The last row is the important one. The corpus is one line of columnar JSON, so
a refresh that changes some records produces a **single-line diff** — and git
stores it as a compressed delta, not a second 10 MB blob. A no-change refresh
produces no commit at all.

**Verdict: KEEP_GIT_FOR_NOW**, unchanged and now better evidenced. The Phase 3
concern was that scheduled commits would force migration; measured, a daily
refresh adds roughly one small delta per day, and only on days the data moved.

---

## Recovery and rollback

**Broken adapter** — fix it, `--source <id>`, validate, promote. The corpus
never needs hand-editing; a bad source simply does not promote.

**Bad promoted snapshot** — `git revert` the refresh PR. The corpus is a
committed file; git already provides the primitive, and building a rollback
service on top of it would add a second mechanism to get wrong. Then fix the
adapter before the next scheduled run reintroduces the same candidate.

**Stuck lock** — reclaimed automatically after 45 minutes, or `--force`.

**Source removed upstream** — it goes `DEGRADED` → `FAILING` and retains
last-good, staying visible while a human decides. Nothing is deleted for being
unreachable.

---

## Limitations

- **Not yet observed running on a schedule.** The workflow is committed and its
  invariants are tested; its first real cron firing has not happened. Status is
  therefore `PRODUCTION_SCHEDULED (pending first fire)` — see the report.
- **Auto-merge off by choice**, so promotion needs one human click daily.
- Retained last-good records lose `fieldSources` on reconstruction: the
  retention path keeps opportunities alive and visible, it does not claim to
  reproduce merge metadata exactly.
- Health is internal. No public source-status UI, per Part 15's default.
