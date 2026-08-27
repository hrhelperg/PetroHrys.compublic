# Forum Intelligence V1

## Scope

Forum Intelligence V1 is an inventory and classification layer for public,
persistent, asynchronous discussion communities. It records identity, topic,
geography where directly established, language, forum type, conservative
activity status and Ahrefs Domain Rating.

It does not establish posting access, registration access, price, moderation,
profile links, signature links, post-body links, indexability or link
attributes. Forums are not projected into Distribution Planner readiness.

## Pipeline

The stages are deliberately separate:

1. `scripts/discover-forums.cjs` writes discovery candidates.
2. `scripts/research-forums.cjs` verifies targets by direct HTTP and checkpoints findings.
3. `scripts/research-forums-browser.cjs` retries a bounded unread cohort in the
   shared real-window Chrome harness without challenge circumvention.
4. `scripts/apply-forum-findings.cjs` validates and applies accepted facts.
5. `scripts/research-domain-rating.cjs` measures exact canonical DR targets.
6. `scripts/build-forums.cjs` renders the shared corpus offline in four locales.
7. `scripts/report-forums.cjs` derives the completion report and V2 cohort.

Discovery or research never writes canonical records. The findings ledger is
append-only between atomic compactions and survives interruption. The applier
does not delete a previously accepted Forum when a later probe is rejected or
unreadable.

## Discovery Sources

- [Discourse Discover](https://discover.discourse.com/) supplies community
  candidates. Acceptance uses each target's own `site.json` and `latest.json`
  or its directly rendered Forum structure.
- [Stack Exchange Sites API](https://api.stackexchange.com/docs/sites) supplies
  main-community candidates. Meta mirrors are not counted separately.
- [Forumotion directory](https://www.forumotion.com/) supplies hosted and
  separately branded community candidates. Directory activity metrics are not
  accepted as target activity evidence.
- First-party software communities, showcases and verified-community lists
  seed explicit XenForo, phpBB, vBulletin, Invision Community, MyBB, Flarum,
  Vanilla and custom-forum rounds. A software hint is discovery metadata only;
  the live target must expose the canonical forum evidence itself.

These sources are candidate indexes only. Search results, source descriptions
and directory rankings cannot create a canonical record.

## Direct Acceptance

The target must establish a community identity, a Forum index or category
structure, and at least two persistent public discussion or question URLs.
Blogs, article comments, social groups, chat communities, directory pages,
subforums and obvious spam shells are rejected.

Discussion language is classified from directly visible titles, descriptions,
categories and topic evidence, never from interface locale alone. Strong
evidence in multiple languages is retained; ambiguous language and geography
remain unknown.

Status is conservative:

- `ACTIVE`: directly visible activity within approximately 12 months.
- `DORMANT`: readable Forum with directly visible older activity.
- `ARCHIVED`: the Forum explicitly describes itself as archived or read-only.
- `UNKNOWN`: readable Forum whose activity date cannot be established.

HTTP 403, a challenge, timeout or transport failure is `UNREAD` research state,
not a canonical activity state. Selected unread targets may be opened in the
repository's shared windowed-Chrome/CDP harness. A browser acceptance records
`DIRECT_BROWSER`; a challenge remains unread and is never bypassed.

Every `ACTIVE` or `DORMANT` finding stores the exact directly observed activity
date that supports that status. A bare copyright year cannot establish it.

## Identity

Canonical identity is canonical host plus the verified Forum base path. Scheme,
`www`, query, fragment and tracking variants collapse. Nested category and
subforum roots cannot become separate entities. Distinct independently branded
network communities remain distinct when they have different canonical hosts.

## Domain Rating

Forums use the shared Ahrefs pipeline and exact Research Center target policy:
lowercase canonical host, `www` removed, subdomain preserved. A measured zero
is stored as `0`; a provider or transport failure remains unmeasured. Every
published number carries provider, measurement date, measured target and
provider-reading status.

## V2 Handoff

`data/forums/forum-posting-link-value-v2-cohort.csv` is a factual research
queue. Ordering uses direct activity status, measured DR and stable name order.
It contains no claim about posting eligibility or link value. Those questions
belong to Forum Posting & Link Value Intelligence V2.
