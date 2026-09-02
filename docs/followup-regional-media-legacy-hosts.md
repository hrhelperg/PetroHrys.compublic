# Follow-up: wave 1–3 hosts the wave-4 publisher gate would refuse

Wave 4 rebuilt what counts as a publisher-owned front door. The rule now lives
in one place, `scripts/lib/regional-media-discovery.cjs`, and it refuses:

- newspaper archives and digitisation services
- shared publishing platforms and social profiles
- university roots and academic repositories
- government and military domains
- aggregators, wire services and directories
- national broadcasters, **including through their regional subdomains**
- pan-regional and international outlets
- **any subdomain**, because a subdomain's Domain Rating is its parent's
- URLs pointing at a section, a search or an article rather than a root

Running that rule over the 1,100 records published in waves 1–3 finds **65**
(5.9%) that would not be admitted today. They are **left exactly as
published**: the registry's append-only contract fixes every wave-1-to-3 record
and its SHA-256 hash, and `scripts/expand-regional-media.cjs` refuses to apply a
wave if any of those hashes moved. Editing them to satisfy a rule written
afterwards would destroy the guarantee that makes the wave history worth
keeping.

They are recorded here so the debt is visible rather than silently carried.

## The shape of the debt

| Reason | Records |
| --- | --- |
| subdomain, whose Domain Rating is its parent's | 56 |
| academic repository or university root | 4 |
| government or military domain | 3 |
| article page rather than a publisher root | 1 |
| section or search page rather than a publisher root | 1 |

### Why the subdomains matter most

Fifty-six records is not fifty-six independent mistakes; it is four patterns.

**Publisher networks on one domain.** Fourteen `*.notizie.it` city editions —
Ancona, Aosta, Bari, Bologna, Campobasso, Catanzaro, Firenze, L'Aquila,
Perugia, Potenza, Sardegna, Trento, Trieste, Venezia — all carry Domain Rating
**62**, because 62 is `notizie.it`'s. The same holds for the Australian
community networks: every `*.starweekly.com.au` reads 64, every
`*.starcommunity.com.au` reads 59, every `*.mailcommunity.com.au` reads 54,
every `*.newsofthearea.com.au` reads 53. Each of those local titles is real
journalism; none of them has the authority the number claims.

**Database vendors standing in for newspapers.** Three records point a
newspaper at the archive vendor that resells it:

| Record | Host | What the DR actually measures |
| --- | --- | --- |
| The Washington Post | `proquest.umi.com` | ProQuest, DR 74 |
| The Daily News | `newfirstsearch.oclc.org` | OCLC FirstSearch, DR 87 |
| Pittsburgh Post-Gazette | `infoweb.newsbank.com` | NewsBank, DR 77 |

These are the clearest cases in the corpus: the record names a newspaper, the
host is a paywalled research database, and the Domain Rating belongs to the
database company.

**A national title admitted on its head office.** `theguardian.com/weekly`
carries coverage area "Kings Place" — The Guardian's London office address —
and Domain Rating 93. This is precisely the failure the wave-4 evidence gate
was built to close: a headquarters is not a coverage claim. See the header
comment in `scripts/lib/regional-media-discovery.cjs`.

**Institutional and government hosts.** `wabash.edu`, `camdencc.edu`,
`oregonnews.uoregon.edu`, `aade.project.edu.tw`, `jamahir.alwehda.gov.sy`,
`srpmic-nsn.gov`, `wellington.vic.gov.au`, `dresden.de/…/hochlandkurier.php`,
`sdp.or.jp/category/sdp-paper`, `hemerotecadigital.bne.es`,
`patrimoine.mediatheques-grandpoitiers.fr`, `epa.oszk.hu`.

## Related: non-root URLs carried from earlier waves

Twenty-seven wave-1-to-3 records store a path rather than a bare root. Some are
legitimate and the wave-4 rule still allows them — a regional edition genuinely
lives at `al.com/press-register`, `iol.co.za/capetimes`,
`citizen.co.za/lowvelder`, `actu.fr/le-ploermelais`, `sn.dk/hilleroed`. The
rest overlap with the table above.

## What to do about it

Nothing, until a wave is deliberately allowed to retire records. In order of
preference:

1. **Leave them.** Sixty-five rows in a corpus of several thousand, every one
   carrying a real measured reading, against an append-only guarantee that is
   worth more than the percentage.
2. **A retirement wave.** If the registry grows a `retired` status, these are
   the first candidates: the hashes stay, the records stay, and a status change
   records the judgement without rewriting history. The three database-vendor
   records should go first — they are the only ones where the host is not the
   publisher at all.
3. **Re-point the ones that have a publisher root elsewhere.** Most of the
   `*.notizie.it` and Australian network titles do not have their own domains,
   so there is nothing to re-point them to; the network root would be a single
   record, not fourteen. `Hochland-Kurier` and `L'Avenir de la Vienne` may have
   their own sites. That is research, not a data edit, and it would produce NEW
   records rather than mutations.

Do not "fix" any of this by loosening the wave-4 gate. The gate is what stops
the next several thousand records from repeating it — during wave-4 discovery
it refused 9,655 candidates that had nothing but a head office, and a further
188 measured candidates on the rules above.
