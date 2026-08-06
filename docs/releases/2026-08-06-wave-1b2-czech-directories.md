# Wave 1B.2 — Czechia, second completed commercial-directory country

Prepared 2026-08-06. Continues production from `be121a6` (Wave 1B.1 Germany,
PR #41). No schema change, no route change, no taxonomy change.

Dataset **276 → 278**; 352 pages. Czechia 13 → 15.

## Two published, three rejected — and the rejections matter more

Every one of the three rejected candidates would appear on a "best Czech business
directories" list written from memory. None of them survives contact with the
current web.

**Najisto.cz is no longer a business directory.** It is now a Ukrainian-language
content site — titled *"наїсто: Вболіваємо за якісний контент"* — publishing
weather, fuel-price and recipe articles. It contains **zero** directory
vocabulary: no *firma*, no *katalog*, no *podnik*, no *IČO*, no *zapsat*. Its only
internal link path is `/stattia`, meaning "article".

**ČeskéFirmy.cz redirects to a parked placeholder** at `quaest.net`, titled
"Loading...", with no directory content of any kind.

**Atlas firem redirects to `firmablizko.cz`**, which genuinely operates as a
distance-based catalogue with an add-company flow. It was rejected only because
business adoption could not be established — a pending candidate, not a dead one.

## Correction to an earlier wave

Wave 1B recorded **Zlaté stránky as unreachable** on a transport failure. That was
transient. It responds normally, reports *"823 263 kontaktů na firmy"*, and is
published here. **A single failed fetch is not a property of a site**, and the
earlier record of it was wrong.

## The two published

**Firmy.cz** — operated by **Seznam.cz, a.s.**, the Czech search company.
Registration is free (*"Registrace je zdarma a zabere jen pár minut"*) and the
catalogue invites businesses to add what is missing (*"Máte nebo znáte firmu, co
tu není? Přidejte ji"*). Profiles carry ratings.

**Zlaté stránky** — operated by **Mediatel**, identified because the add-company
route resolves to `content-cmp.mediatel.cz`. Mediatel describes *"více než
třicetiletou historií"* and profiles carrying *"kontakty, mapou a recenzemi"*.
Adding requires signing in first.

## Duplicate decisions

**Firmy.cz and "Seznam Firmy" are one system** — Firmy.cz *is* Seznam's
catalogue. One record, not two.

**Firmy.cz and Zlaté stránky are separate** — different operators, different
catalogues, different entry flows, and neither claims an entry reaches the other.

## What is not asserted

Neither operator documented verification methods, owner responses, a claim flow,
indexability, link attributes or traffic. All `null`. `listingAction` is `create`
on both.

**Zlaté stránky cost is `unknown`, not free.** Paid highlighting is promoted;
nothing states the basic entry is free. Inferring either direction is forbidden.

**The Firmy.cz owner-response inference stayed rejected.** The automated
summariser claimed owners can reply, citing a heading meaning *summary rating*.
The record documents why that was refused.

## Verification

| Gate | Result |
|---|---|
| Validator | exit 0 |
| Migration ×2 | rewrote **0** on both runs |
| Generator ×2 | second run wrote **0**, pruned **0** |
| Tests | **1,075 pass, 0 fail** (1,061 before, 14 added) |
| Mutation probes | **17 injected, 17 caught, 0 survived, 0 broken, 0 no-op** — clean on the first valid run |
| Internal links | 4,343 hrefs, **0 broken** |
| Sitemap / RSS | 352 = 352 · 278 = 278 |
| JSON-LD | 352 blocks, **0 malformed** |
| Editor notes | leak to **0** pages |
| Live URL re-check | all four **200** |
| Czechia country page | links all 15 records |
| Domain Rating | both null; 67 records over **64** measurements, digest unchanged |
| Working tree | clean |

Three of the seventeen probes exist solely to stop the rejected candidates being
re-added from reputation.

## Remaining countries

**France is the only country where nothing can be reached** — PagesJaunes,
Kompass France and Solocal all return 403, and Hoodspot redirects away from
itself. **Poland, Italy and Spain are largely reachable** and not yet researched;
Páginas Amarillas is the single Spanish blocker.

Those countries are deliberately not attempted here rather than completed at a
lower evidentiary standard than Germany and Czechia.
