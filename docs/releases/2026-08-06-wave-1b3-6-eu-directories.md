# Waves 1B.3–1B.6 — France, Poland, Italy, Spain

Prepared 2026-08-06. Continues production from `6b0df05` (Wave 1B.2 Czechia,
PR #42). No schema change, no route change, no taxonomy change.

Dataset **278 → 281**; 357 pages.

## Three records from four countries

| Country | Commercial records | Why |
|---|--:|---|
| Poland | **2** | Panorama Firm · pkt.pl |
| Italy | **1** | PagineGialle — Virgilio absorbed |
| France | **0** | every candidate unreachable |
| Spain | **0** | one blocked, two not directories |

## The result worth reading: two opposite duplicate decisions

Both Poland and Italy presented the same question — one owner, two directories —
and they resolved in opposite directions. **Ownership decided neither. The
submission system decided both.**

**Poland stays two records.** WeNet owns Panorama Firm and pkt.pl, but each runs
its own submission form on its own domain, pkt.pl carries its own site terms, and
neither states that a submission reaches the other.

**Italy becomes one.** Virgilio Aziende's "Registra Azienda Gratis" routes to
`italiaonline.it/self/pgit` — the PagineGialle self-service product, confirmed in
served HTML. A business registering through Virgilio is registering in
PagineGialle. Virgilio is **absorbed**, and a test asserts both the absorption and
the routing evidence that justifies it.

## France and Spain produce nothing, deliberately

**France** is the only country in the programme where no candidate can be reached.
PagesJaunes, Kompass France and Solocal each return **403 on two independent fetch
paths**. Hoodspot still exists but is served from `annuaire.petitesaffiches.fr` as
a JavaScript application, with its operator relationship unestablished.

**Spain** fails for three different reasons. Páginas Amarillas is **403 on both
paths**. Empresite offers a free *search* — *"Buscador gratuito"* — with no
listing-creation flow. And eInforma is a **credit and company-data product**
(*informe, balance, riesgo, morosidad*, with a *Tarifas* page), not a platform
where a business publishes its own profile. Publishing it would have been a
pillar error, not merely a weak record.

A test asserts that both countries have zero commercial records, so a later wave
cannot quietly add one without clearing the blockers.

## Two limitations that matter more than the records

**Panorama Firm entries do not necessarily come from the business.** Its form asks
*"Jestem: Właścicielem / Użytkownikiem"* — owner or user — so a customer can add a
company they used. An entry is **not evidence that the named business created or
approved it**.

**PagineGialle requires a VAT number but does not document verifying it.**
*"*Partita IVA necessaria"* is a form requirement. `verificationMethods` stays
`null`, and a test asserts the requirement was not promoted into a verification
method — the distinction between *asking for* a number and *checking* it.

**pkt.pl's Google claim was not adopted.** The operator promotes *"Wyższa pozycja
w Google"*. That is marketing copy; no ranking, indexing or traffic outcome is
asserted, and a test enforces it.

## Verification

| Gate | Result |
|---|---|
| Validator | exit 0 |
| Migration ×2 | rewrote **0** on both runs |
| Generator ×2 | second run wrote **0**, pruned **0** |
| Tests | **1,092 pass, 0 fail** (1,075 before, 17 added) |
| Mutation probes | **19 injected, 19 caught, 0 survived, 0 broken, 0 no-op** |
| Internal links | 4,380 hrefs, **0 broken** |
| Sitemap / RSS | 357 = 357 · 281 = 281 |
| JSON-LD | 357 blocks, **0 malformed** |
| Editor notes | leak to **0** pages |
| Live URL re-check | all three **200** |
| Country pages | Poland and Italy link every record |
| Domain Rating | all null; 67 records over **64** measurements, digest unchanged |
| Working tree | clean |

Three probes exist solely to stop France and Spain being populated from
reputation, and two more protect the opposite duplicate decisions.

**One probe under-injected and was strengthened** — it stripped a caveat from the
list fields but left it in the `description`, so the record still told the reader
and the guard correctly passed. That is the fourth wave in which this pattern has
appeared.

## Commercial pillar after this wave

Germany 4 · Czechia 2 · Poland 2 · Italy 1 · Spain 0 · France 0 — **nine records
across six researched countries.**

## Remaining

Firmy.net (Poland) — operator unidentified, add flow is `javascript:void(0)`.
MisterImprese (Italy) — free to consult; listing cost and operator unestablished.
Hoodspot (France) and Páginas Amarillas (Spain) — both need a browser.
