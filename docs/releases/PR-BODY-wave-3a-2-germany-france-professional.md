# feat: add Wave 3A-2 Germany and France professional registers

Completes the professional-licence pilot begun in Wave 3A-1. Continues production
from `369291e` (PR #33).

**Dataset 245 → 255. Ten statutory professional registers across two countries.**
No schema change, no route change, no new taxonomy value.

| Country | Before | After | Added |
|---|--:|--:|---|
| **Germany** | 7 | **13** | Lawyers · Auditors · Patent attorneys · Tax advisers ×3 |
| **France** | 7 | **11** | Architects · Chartered accountants · IP attorneys · Notaries |

---

## Read this part first: the wave's main result is a refusal

**Germany has no national register for most of the professions in the brief.**
Tested against each federal body's own words, not assumed:

| Profession | Federal body | Its own description |
|---|---|---|
| Architects | BAK | "Bundesgemeinschaft der Architektenkammern, Körperschaften des Öffentlichen Rechts **e.V.**" |
| Engineers | BIngK | "Bundesingenieurkammer **e. V.**" |
| Doctors | BÄK | "die **Spitzenorganisation** der ärztlichen Selbstverwaltung" |
| Pharmacists | ABDA | "**Bundesvereinigung** Deutscher Apothekerverbände" |
| Vets | BTK | "als **Dachverband** der Landes-/Tierärztekammern, die Körperschaften öffentlichen Rechts sind" |

All associations or peak organisations. The Länder chambers hold the lists.
Publishing a federal record would publish an association directory, so none was.
**A test pins all five hosts as unpublishable.**

The trap worth naming is the BÄK "Arztsuche", which looks like a national doctors
register. It is a signpost to sixteen Länder services, and its own page says the
chambers are the only holders of valid data, that some offer telephone enquiries
only, and that "nicht alle Organisationen online vertreten sind".

## A national interface is usually not the legal source of record

The NMLS pattern from the Wave 3A-4 brief, arriving two waves early — in rendered
prose and pinned by test on all four:

- **BAV** — "Disciplinary control is exercised by the respective regional Bar."
- **Steuerberaterverzeichnis** — "basiert auf den Daten der Berufsregister, die von
  den örtlich zuständigen Steuerberaterkammern geführt werden".
- **Tableau des architectes** — "mis à jour en permanence par les Conseils
  régionaux de l'Ordre".
- **Experts-comptables** — unresolved cases go to "le Conseil de l'Ordre de votre
  région".

## Four boundary decisions

**WPK is ONE record.** Its register "erfüllt **zugleich** die Aufgabe des
Abschlussprüferregisters" — one system discharging both the national professional
register and the EU Audit Directive register. Its "Liste der Abschlussprüfer" is a
**download** for Art. 16(3) selection procedures and its "Suche nach
Spezialkenntnissen" a filtered view; both rejected as registers.

**The three German tax registers are THREE records.** Three statutory bases
(§ 86b, § 3b, § 3g StBerG), three regimes — unrestricted, temporary and occasional,
partial — three populations, three hosts. Each points at the other two, because
absence from one says nothing about the others.

**The French roll, not the French finder.** `architectes-pour-tous.fr` invites you
to "sélectionner des architectes prêts à vous accompagner", filtered by project
type and MaPrimeRénov' referencing. A client-matching product, not the tableau.
Rejected, and a test blocks its host.

**INPI keeps the IP attorney list, not the CNCPI** — the state institute, not the
profession's own body. The ORIAS error from Wave 2A, avoided.

## The subtlest caveat in the wave

The French roll separates architects entitled to design work, who "sont assurés à
ce titre", from architects registered for other activities, of whom the Order
warns they "ne sont pas habilités à exercer des missions de conception et de
maîtrise d'œuvre et **ne sont pas assurés à ce titre**." A reader who treats any
hit as a designer has been misled by a register telling the truth. Published, and
pinned by test.

## Access

Nine of ten ship `partially-open` with `loginRequired: false` and everything else
null — anonymous load observed, search never executed.

**One exception, and it is an observation.** The INPI directory rendered result
rows to an anonymous client with no credential and no payment, reporting 550
results on both passes, so `freeToSearch: true` records something seen. A test
asserts that flag may only be true where the notes record rendered results.

## Two things this wave got wrong first

**The validator caught four modelling errors before any test did.** A shared-host
group may name only one host, and the three tax registers sit on three different
subdomains — they never shared a host, so `resourceIdentity` was removed from all
three. `canonicalDomain` must store the registrable host, not `www.`-prefixed. And
`inpi.fr` was already measured, so leaving the new record null was wrong: the rule
is to reuse the stored snapshot verbatim.

**A mutation probe reported SURVIVED twice before it proved anything.** The first
harness run was **invalid** — a botched `sed` broke the restore function, so
mutations accumulated and every later "caught" was corrupt data, not a working
guard. That is the Wave 1E.1 failure mode and it was rejected rather than
reported. Rerun properly, one real gap surfaced: nothing asserted the § 3g
entitlement is *partial*. The strengthened probe then showed the first fix was
insufficient — the caveat survived in `notRecommendedFor` while the **description**
read as unrestricted. Descriptions travel into listings and metadata, so the guard
now requires the restriction in the description itself.

## Domain Rating

No new measurement. Nine records carry `domainRating: null`; the tenth reuses the
existing `inpi.fr` snapshot verbatim. Frozen set stays at **64 measurements**,
digest `aa7e6984…19847a4e` unchanged. Records displaying a rating: 66 → **67**.

## Verification

| Gate | Result |
|---|---|
| Validator | exit 0 (after correcting four findings it raised) |
| Migration ×2 | rewrote **0** on both runs |
| Generator ×2 | second run wrote **0**, pruned **0** |
| Tests | **940 pass, 0 fail** (918 before, 22 added) |
| Mutation probes | **19 injected, 19 caught, 0 survived, 0 broken, 0 no-op** |
| Internal links | 4,102 in-dataset hrefs, **0 broken** |
| Sitemap | equals the indexable set (**326 = 326**) |
| RSS | equals published records (**255 = 255**) |
| JSON-LD | 326 blocks, **0 malformed** |
| Canonical / titles / descriptions | present, unique |
| Editor notes | leak to **0** pages |
| Four roles | on every record |
| Publication truth | no environment language in rendered prose |
| Live URL re-check | all ten **200** |
| Country pages | Germany links all 13, France all 11 |
| Working tree | clean |

## Correction to Wave 3A-1

The Wave 3A-1 release note, PR body and backlog each said the Engineering Council
record is typed `chartered-body`. **No such value exists in the operator enum** —
the record is and was `public-law-body`. The determination that it is not a
`regulator` is unaffected. All three documents corrected here.

## Rollback

Additive; `origin/main` untouched at `369291e`.

- **Revert everything:** `git revert --no-commit <head>..<base> && git commit`.
- **Revert one record:** delete it from the country JSON and rebuild; its pins in
  `bd-germany-france-professional.test.cjs` will fail, which is intended.
- **Reverting `fr-inpi-conseils-propriete-industrielle` alone** leaves `fr-inpi`
  holding an `inpi-fr` group with one member — drop it in the same commit.
  `fr-inpi` is the **only pre-existing record modified** by this wave, and the
  change is the additive `resourceIdentity` field.

## Not done, deliberately

German Länder chambers individually (sixteen architects', sixteen engineers',
seventeen medical and equivalents); German notaries (BNotK is a public-law body
but no statutory nationwide directory was established); French avocats (the CNB
annuaire is cookie-gated and its application is a JavaScript app); the CNCC; and
French healthcare via RPPS — `annuaire.sante.fr` returned a transport failure,
which is **not** evidence the register is absent.
