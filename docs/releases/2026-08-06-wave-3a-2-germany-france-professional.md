# Wave 3A-2 — Germany & France professional registers

Prepared 2026-08-06. Completes the professional-licence pilot begun in Wave 3A-1.
Continues production from `369291e` (Wave 3A-1, PR #33). No schema change, no
route change, **no new taxonomy value**.

## The most important result is a refusal

**Germany has no national register for most of the professions this wave was
asked to research.** That was tested against each federal body's own words:

| Profession | Federal body | Its own description |
|---|---|---|
| Architects | BAK | "Bundesgemeinschaft der Architektenkammern, Körperschaften des Öffentlichen Rechts **e.V.**" |
| Engineers | BIngK | "Bundesingenieurkammer **e. V.**" |
| Doctors | BÄK | "die **Spitzenorganisation** der ärztlichen Selbstverwaltung" |
| Pharmacists | ABDA | "**Bundesvereinigung** Deutscher Apothekerverbände" |
| Vets | BTK | "als **Dachverband** der Landes-/Tierärztekammern, die Körperschaften öffentlichen Rechts sind" |

Every one of these is an association or peak organisation. The Länder chambers
are the public-law bodies that hold the lists. Publishing a federal record would
publish an association directory — precisely what the brief forbids — so none was
published, and **a test pins all five hosts as unpublishable** so a later wave
cannot quietly add them.

The BÄK "Arztsuche" is the trap worth naming, because it looks like a national
doctors register. It is a signpost to sixteen Länder services. Its own page says
the chambers and regional associations are the only holders of valid data, that
some offer telephone enquiries only, and that "nicht alle Organisationen online
vertreten sind".

## What shipped

**Ten records.** Dataset **245 → 255**; 326 pages.

| Country | Before | After | Added |
|---|--:|--:|---|
| Germany | 7 | **13** | Lawyers · Auditors · Patent attorneys · Tax advisers ×3 |
| France | 7 | **11** | Architects · Chartered accountants · IP attorneys · Notaries |

## A national interface is usually not the legal source of record

The NMLS pattern from the Wave 3A-4 brief showed up two waves early, in both
countries. Each of these is stated in rendered prose and pinned by test:

- **BAV** — "Disciplinary control is exercised by the respective regional Bar to
  which the lawyer is admitted."
- **Steuerberaterverzeichnis** — "basiert auf den Daten der Berufsregister, die
  von den örtlich zuständigen Steuerberaterkammern geführt werden".
- **Tableau des architectes** — "mis à jour en permanence par les Conseils
  régionaux de l'Ordre".
- **Experts-comptables** — unresolved cases go to "le Conseil de l'Ordre de votre
  région".

## Four boundary decisions

**WPK is ONE record.** Its register "erfüllt **zugleich** die Aufgabe des
Abschlussprüferregisters" — one system discharging both the national professional
register and the EU Audit Directive register. Its "Liste der Abschlussprüfer" is a
**download** published for Art. 16(3) selection procedures, and its "Suche nach
Spezialkenntnissen" is a filtered view. Both rejected as registers.

**The three German tax registers are THREE records.** Three statutory bases
(§ 86b, § 3b, § 3g StBerG), three authorisation regimes — unrestricted, temporary
and occasional, partial — three populations and three hosts. Merging them because
one chamber runs all three would misstate what any entry permits. Each points at
the other two, because absence from one says nothing about the others.

**The French roll, not the French finder.** `annuaire.architectes.org` is "le
tableau de l'Ordre". `architectes-pour-tous.fr` invites a visitor to "sélectionner
des architectes prêts à vous accompagner", filtered by project type and
MaPrimeRénov' referencing. That is a client-matching product run by the Order, not
the roll, and publishing it would publish a marketing directory. Rejected, and a
test blocks its host.

**INPI keeps the IP attorney list, not the CNCPI.** The state industrial property
institute publishes it; the profession's own national body does not. Naming the
organisation as keeper is the error corrected for ORIAS in Wave 2A.

## The subtlest caveat in the wave

The French roll distinguishes architects entitled to design work — who "sont
assurés à ce titre" — from architects registered for other activities such as
teaching, journalism or expert work, of whom the Order warns: "ces architectes ne
sont pas habilités à exercer des missions de conception et de maîtrise d'œuvre et
**ne sont pas assurés à ce titre**." A reader who treats any hit as a designer has
been misled by a register that is telling the truth. That warning is published and
pinned by test.

## Access

Nine of ten ship `accessLevel: partially-open` with `loginRequired: false` and
every other field null — anonymous load observed, search never executed.

**One exception, and it is an observation, not an upgrade.** The INPI attorney
directory rendered result rows to an anonymous client with no credential and no
payment, reporting 550 results on both the first and the adversarial pass, so
`freeToSearch: true` records something seen. A test asserts that flag may only be
true where the notes record that results were actually rendered.

## Two things this wave got wrong first

**The validator caught four modelling errors before any test did.** A shared-host
group may name only one host, and the three tax registers sit on three different
subdomains — so they never shared a host and `resourceIdentity` was removed from
all three. `canonicalDomain` must store the registrable host, not `www.`-prefixed.
And `inpi.fr` was already measured, so leaving the new record's rating null was
wrong: the rule is to reuse the stored snapshot verbatim.

**A mutation probe reported SURVIVED twice before it proved anything.** The first
run of the harness was invalid — a botched `sed` broke the restore function, so
mutations accumulated and every later "caught" was corrupt data rather than a
working guard. Rerun properly, one real gap appeared: nothing asserted that the
§ 3g register's entitlement is *partial*. Then the strengthened probe showed the
first fix was insufficient, because the caveat survived in `notRecommendedFor`
while the **description** read as unrestricted. Descriptions travel into listings
and metadata, so the guard now requires the restriction in the description itself.

## Domain Rating

No new measurement was taken. Nine records carry `domainRating: null`. The tenth
reuses the existing `inpi.fr` snapshot verbatim — same domain, same measurement —
so the frozen set stays at **64 measurements**, digest `aa7e6984…19847a4e`
unchanged. Records displaying a rating went 66 → **67**.

## Verification

| Gate | Result |
|---|---|
| Validator | exit 0 (after correcting four findings it raised) |
| Migration ×2 | rewrote **0** on both runs |
| Generator ×2 | second run wrote **0**, pruned **0** |
| Tests | **940 pass, 0 fail** (918 before, 22 added) |
| Mutation probes | **19 injected, 19 caught, 0 survived, 0 broken, 0 no-op** |
| Internal links | 4,102 in-dataset hrefs, **0 broken** |
| Sitemap | equals the indexable set (**326 = 326**), 0 duplicates |
| RSS | equals published records (**255 = 255**) |
| JSON-LD | 326 blocks, **0 malformed** |
| Canonical | present on every page |
| Titles / descriptions | unique across all 326 |
| Editor notes | leak to **0** pages |
| Four roles | determined separately on every record |
| Publication truth | no environment language in rendered prose |
| Live URL re-check | all ten **200** |
| Country pages | Germany links all 13, France all 11 |
| Working tree | clean |

Research was direct, in two separate passes. This is not independent-agent
verification; the agent fleet is not an available dependency.

## Correction to Wave 3A-1

The Wave 3A-1 release note, PR body and backlog each stated the Engineering
Council record is typed `chartered-body`. **There is no such value in the operator
enum**; the record is and always was `public-law-body`. The substantive
determination — that it is not a `regulator` — is unaffected. Corrected in all
three documents in this commit.

## Rollback

The branch is additive and `origin/main` is untouched at `369291e`.

- **Revert everything:** `git revert --no-commit <head>..<base> && git commit`.
- **Revert one record:** delete its object from the country JSON and rebuild. Its
  pins in `bd-germany-france-professional.test.cjs` will fail, which is intended.
- **Reverting `fr-inpi-conseils-propriete-industrielle` alone** leaves `fr-inpi`
  holding a `resourceIdentity` for a group with one member. Drop the `inpi-fr`
  group from `fr-inpi` in the same commit — this wave ADDED that field to a
  previously published record, and it is the only pre-existing record modified.
- **No Domain Rating was measured**, so no metric rollback is needed; but reverting
  the attorney record removes a reused snapshot, not a new one.

## Remaining

Not researched and explicitly not concluded: the German Länder chambers
individually (sixteen architects', sixteen engineers', seventeen medical and their
equivalents), German notaries, French avocats, the CNCC, and French healthcare
via RPPS. `annuaire.sante.fr` returned a transport failure on probe — **that is
not evidence the register is absent** and must be re-checked in a browser.
