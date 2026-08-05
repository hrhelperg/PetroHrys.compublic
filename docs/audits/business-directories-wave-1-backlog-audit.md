# Wave 1 — backlog audit

Audited 2026-08-05 against `docs/business-directories-verification-backlog.md`
at production HEAD `342ff8d`.

## Shape

294 lines, 88 table rows across 21 sections, organised by wave (1A US federal,
1C-1 Australia, 1C-2 Canada, 1C-3 United Kingdom). Every wave section carries
pending, rejected and not-surveyed subsections. Browser actions, blocker reasons
and research dates are present throughout.

## Confirmed defects

### 1. A stale section states a blocker that no longer exists — **major**

`### Held pending a glossary decision` says:

> These three are fully verified and would ship immediately, but no registry type
> in the closed list honestly describes an exclusion or debarment register.

That blocker was resolved: `exclusion-and-debarment-register` was added in the
Wave 1A completion, and **all three candidates are published**:

| Backlog row | Published as |
|---|---|
| SAM.gov Exclusions | `us-sam-exclusions` |
| HHS OIG List of Excluded Individuals and Entities | `us-hhs-oig-leie` |
| CFTC Sanctions in Effect | `us-cftc-sanctions-in-effect` |

The section is not merely stale, it asserts something **false about the current
schema**. It should be moved to a resolved section.

### 2. FDA drug establishments listed as held, but published — **minor**

A Wave 1A row names the FDA drug establishments registration site; it is
published as `us-fda-drug-establishments`. Same class of staleness, lower stakes.

### 3. 14 of 35 pending rows carry no official URL or verified lead — **major**

The backlog's own contract requires an official URL or a verified lead for every
entry. Two are structural rather than cosmetic: **Virginia** and **Wyoming** are
recorded in the US jurisdiction manifest with `officialCandidateUrl: null`, so
the two pending states with the weakest evidence are also the two a later wave
cannot pick up without redoing discovery.

## Blocker revalidation — three blockers are now obsolete or misdescribed

The US manifest's 10 pending jurisdictions were re-probed during this audit:

| Jurisdiction | Recorded blocker | Observed now | Verdict |
|---|---|---|---|
| Alaska | `waf-blocked` | HTTP 200, but body is a JS shell ("Please enable JS and disable any ad blocker") | **Blocker misdescribed** — it is a client-render blocker, not a WAF block. Still pending, but for a different reason. |
| Northern Mariana Islands | `manual-browser-check` | HTTP 200, serves real content: "CNMI Department of Commerce Office of the Registrar" | **Blocker appears obsolete.** Highest-value quick win in the US backlog. |
| American Samoa | `manual-browser-check` | HTTP 200, Department of Legal Affairs site serves content | **Partially obsolete** — the host responds, but whether a business register search exists is unresearched. |
| Illinois, New Hampshire, Ohio, Utah | `waf-blocked` | HTTP 403 | Confirmed still blocked. |
| Virginia | `geo-blocked` | no candidate URL recorded | Cannot re-probe; discovery incomplete. |
| Wyoming | `connection-blocked` | no candidate URL recorded | Cannot re-probe; discovery incomplete. |
| Guam | `manual-browser-check` | no response | Confirmed still blocked. |

## Not detected

- **No duplicate backlog entries** were found.
- **No rejected candidate is being repeatedly proposed** — rejected sections are
  headed "do not propose again" and none reappears in a pending section.
- **Manual-verification instructions are present** on the Canada and UK pending
  entries, which are the most recently written.

## Priority ranking of the current backlog

**High — resolvable, high value:**
1. CRA List of Charities (Canada) — Canada has zero charity coverage.
2. FINTRAC MSB registry (Canada) — 403 on two hosts; register itself never reached.
3. Northern Mariana Islands (US) — blocker appears obsolete.
4. NSW incorporated associations (Australia) — the only uncovered AU subdivision.
5. UKIPO trade marks and patents — the UK has **zero IP coverage** and the
   `registered-design-register` type has zero records.

**Medium:**
6. New Brunswick, Prince Edward Island, Yukon (Canada).
7. Illinois, Ohio, Utah, New Hampshire (US) — WAF-blocked, browser visit needed.
8. ACNC Charity Register and PPSR (Australia).
9. Law Society of Scotland — must first be established as statutory roll versus
   voluntary directory, since the England/Wales and NI equivalents were rejected
   on exactly that ground.

**Low / structural:**
10. Alaska, Virginia, Wyoming, Guam, American Samoa — discovery or browser work.
11. Northern Ireland DRO and BRO register.

## Recommended backlog hygiene (not applied in this audit)

- Move the three exclusion candidates and the FDA row into resolved sections.
- Re-code Alaska from `waf-blocked` to a client-render blocker.
- Re-check and likely clear the CNMI blocker.
- Record candidate URLs for Virginia and Wyoming, or mark discovery as the
  outstanding action rather than the blocker.
