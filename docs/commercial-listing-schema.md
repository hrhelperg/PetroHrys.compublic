# Commercial listing schema — design note

**Version 1.0** · 2026-08-06 · Implements four fields under
[publication-contract.md](publication-contract.md) §3.2.

**Correction to the original proposal.** It offered five fields. The approved
implementation contains **four**: `supportedCountries` was deferred, for the
reasons in §7 below. Anywhere the earlier proposal says five, four is correct.

---

## 1. Problem

The schema had no way to say what a business may actually **do** on a platform.

```
global-google-business-profile
  submissionModel: "free"       ← the only listing fact the model could hold
  verificationRequired: true    ← true, but never said HOW
  reviewSystem: true            ← true, but never said if the owner may reply
```

Google Business Profile (create and claim, postcard or phone) and a
claim-only local directory produced identical record shapes. The three facts
that decide *should this business list here* were unrepresentable.

## 2. Why `submissionModel` could not carry it

`submissionModel` is `free | paid | freemium | notApplicable | unknown` — a
**cost** enum. All 218 Government Registry pillar records read `notApplicable`,
which is correct and load-bearing: it says listing has no price because listing
is not a concept here.

Overloading it with actions would force `notApplicable` to mean two different
things at once, and would make every statutory register less truthful in order
to describe a commercial platform. Cost and action are orthogonal: a platform can
be free-to-claim but impossible-to-create.

## 3. Why `submissionUrl` and `claimUrl` differ

They are different flows with different endpoints and different eligibility.
Creating a listing is open to anyone; claiming asserts control over a profile
someone else created, and generally requires proving association with the
business. A single URL field would have to pick one and silently lose the other.

`claimUrl` may equal `submissionUrl` only where one official flow genuinely
serves both.

## 4. Why `verificationRequired` could not carry method

`verificationRequired: true` says a platform verifies. It never says whether that
is an email click, a phone call, a posted card or a company document — which is
precisely what decides whether a business can realistically complete the flow.
A postcard to a registered address is a different proposition from an email link.

The migration deliberately does **not** derive a method from the boolean.

## 5. Why `reviewSystem` could not carry owner response

`reviewSystem: true` says reviews exist. Whether the business may reply is a
separate product decision, and it is the one that matters to an owner deciding
where to invest attention. Inferring it from the presence of reviews would be a
guess.

## 6. Null semantics

`null` means **not established**, never "no". Specifically:

- A free *account* never implies `submissionModel: "free"` for the listing.
- An existing profile page never implies that `create` is available.
- Star markup never implies `reviewSystem: true`.
- Premium tiers never imply `submissionModel: "paid"`.
- `verificationRequired: true` never implies any particular method.

`verificationMethods` carries a third state that the others do not:

| Value | Meaning |
|---|---|
| `null` | methods never established |
| `[]` | **official evidence that no verification is required** |
| `[...]` | only methods directly observed or officially documented |

`[]` and `null` are different claims and both round-trip.

## 7. Why `supportedCountries` is deferred

A flat array would conflate *unsupported* with *unverified* — the same failure
the whole null contract exists to prevent. Coverage on global platforms is large
and changes; create and claim eligibility can differ by country; and eligibility
often turns on physical premises or business type rather than country at all.

If a verified candidate later needs machine-readable geography, the wave must
**stop** and propose a structured model — `coverageMode`, `includedCountries`,
`excludedCountries`, `coverageNotes` — rather than adding an array pre-emptively.

## 8. Pillar compatibility

| Pillar | `listingAction` | Other three |
|---|---|---|
| A — Government Registry | `not-applicable`, derived mechanically from category | `null` |
| B — Business Directory | `unknown` until researched | `null` until researched |
| C — Startup & Software | `unknown` until researched | `null` until researched |

The government value is **derived from the pillar contract**, not guessed per
record. `isGovernmentPillar()` and `defaultListingAction()` in `bd-schema.cjs`
are the single source of that decision, and the validator enforces it in both
directions: a government record may not carry a commercial action, and a
commercial record may not claim `not-applicable`.

Government identity or licensing verification is **not** reinterpreted as
commercial profile verification. No government record was backfilled with a
method.

## 9. Migration

**In-memory normalisation plus serialisation projection**, following the Wave 1
foundation precedent already used for `officialName`, `jurisdiction` and
`resourceIdentity`.

Every record normalises to a complete shape in memory. `serialisableRecord()`
then drops each of the four keys wherever it still holds its pillar default, so
the on-disk form is unchanged.

**Result: 0 of 272 records rewritten. 0 of 343 pages changed.** Second migration
run rewrites 0; second build writes 0 and prunes 0.

An invalid raw value is passed through verbatim rather than repaired, so it
reaches the validator and is rejected visibly instead of being silently
corrected.

## 10. Rendering

A separate `listingInformation()` block with its own **Listing** heading —
deliberately *not* part of `registryInformation()`, because a listing fact is not
a registry fact and rendering "Listing action" under "Registry information" would
blur the exact line this schema draws.

It renders only where a listing fact is **established**. A record whose action is
merely `unknown` shows nothing: an unverified field is silence, not a row reading
"not established" on every unresearched platform. A Government Registry record
resolves to `not-applicable` and cannot reach the block at all.

`null` is never rendered as "No". `[]` renders as "No verification required",
because that is evidence rather than absence.

## 11. Filtering

**No filters were added.** The brief permits infrastructure only where required
and non-vacuously tested, and with every commercial record still at `unknown`, a
filter would return an empty set on every option. Filters belong in the research
wave, where they will have data to act on and can be tested against real values.

## 12. Adversarial review findings

The schema was probed against its own edge cases before commit. Two rules that
the proposal specified had not been implemented, and both accepted a bad record:

1. **`claimUrl` equal to `website` was accepted.** A homepage standing in for a
   claim interface is exactly what the URL contract forbids. Now rejected.
2. **`verificationMethods: ["other"]` with no explanation was accepted.** The
   check tested for the word "verification", which appears in almost any access
   prose, so it passed vacuously. It now requires an explanatory *construction*
   — "verified by …", "verification is via …" — and is documented as heuristic:
   no record currently uses `other`, and the first that does should be reviewed
   by hand rather than trusted to this guard.

Confirmed correct by the same review: `claimUrl` with a merely `unknown` action
is rejected (the stricter rule was taken, as instructed); `verificationMethods:
null` with `verificationRequired: true` is legal; `[]` with `false` is legal;
`ownerResponseSupport: false` alongside `reviewSystem: true` is legal; and a
non-array container is rejected rather than coerced.

## 13. Rollback

Additive and reversible in one commit:

1. Remove the four keys from `KNOWN_RECORD_KEYS`; `migrateRecord()` then drops
   them by design, since unknown keys are not carried.
2. Remove the four normalisation lines and `migrateVerificationMethods()`.
3. Remove the four entries from `WAVE1_DEFAULTED`.
4. Remove the validator block and the vocabulary from `bd-schema.cjs`.
5. Delete `listingInformation()` and its call in the page renderer.
6. Delete `bd-commercial-listing-schema.test.cjs`.

No record, prose, score, route, URL or Domain Rating state was touched, so
nothing else needs restoring.
