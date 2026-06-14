# PetroHrys.com — International Editorial Parity (Phase 3)

**Date:** 2026-06-14
**Repo:** `~/PetroHrys.com` (canonical) · **Branch:** `feat/international-editorial-parity` (off `feat/premium-personal-ecosystem`)
**Stack:** static HTML + `css/petrohrys.css`. No framework. Netlify.
**Status:** Approved design (with translation refinements). Spec for review before implementation planning.

---

## Goal

Bring `/es/`, `/fr/`, `/de/` to full feature + design parity with the approved English Phase-2 site, so all four languages feel like **one premium website**, while preserving SEO, hreflang, and analytics. English is the source of truth — localized pages replicate its architecture exactly and are translated to read as if **originally written in the target language** (never literal English).

---

## Decisions (locked)

1. **Scope per language:** rewrite `index.html`; create `work/`, `writing/`, `about/`. 3 rewrites + 9 new = **12 localized editorial pages**. Plus add hreflang clusters to the 3 English Phase-2 pages that lack them (`/work/`, `/writing/`, `/about/`).
2. **Out of scope (unchanged):** localized product pages (pdf-editor, cv-builder, invoice-maker, pocket-manager), `privacy`, `terms`; all deep EN content (research/infrastructure/ai-systems/essays/artificial-intelligence, blog, articles). No new localized blog.
3. **Writing hub deep links:** localized category rows link to the **English** articles with a small **`EN`** tag (`title`/`aria` = "in English" per language). Logged as i18n debt.
4. **Work product links:** localized product page where it exists (pdf-editor, cv-builder, invoice-maker, pocket-manager), else English.
5. **Translation refinements:** ES nav Work = **Proyectos**; ES "builder" = **Arquitecto**; DE "builder" = **Architekt**; FR approved as drafted.
6. **No** URL changes, renamed folders, or redirects. Self-canonicals. Civilist mark + photo placement identical to EN.

---

## Navigation, common chrome, footer (all pages)

| String | EN | ES | FR | DE |
|---|---|---|---|---|
| Home (nav/wordmark target) | Home | Inicio | Accueil | Startseite |
| Work | Work | Proyectos | Travaux | Projekte |
| Research & Writing | Research & Writing | Investigación y Publicaciones | Recherche et Publications | Forschung & Veröffentlichungen |
| About | About | Acerca de | À propos | Über mich |
| Skip link | Skip to content | Saltar al contenido | Aller au contenu | Zum Inhalt springen |
| Mobile menu summary | Menu | Menú | Menu | Menü |
| nav aria-label "Primary" | Primary | Principal | Principale | Hauptmenü |
| nav aria-label "Language" | Language | Idioma | Langue | Sprache |

**Footer group headings:**

| EN | ES | FR | DE |
|---|---|---|---|
| Products | Productos | Produits | Produkte |
| Research & Writing | Investigación y Publicaciones | Recherche et Publications | Forschung & Veröffentlichungen |
| Index | Índice | Index | Index |
| Legal | Legal | Mentions légales | Rechtliches |

**Footer items** — product brand names stay English (PDF Editor, Unzip, …). Other labels translated:

| EN | ES | FR | DE |
|---|---|---|---|
| Essays | Ensayos | Essais | Essays |
| Research | Investigación | Recherche | Forschung |
| Infrastructure | Infraestructura | Infrastructure | Infrastruktur |
| AI Systems | Sistemas de IA | Systèmes d'IA | KI-Systeme |
| Artificial Intelligence | Inteligencia Artificial | Intelligence artificielle | Künstliche Intelligenz |
| Blog | Blog | Blog | Blog |
| Articles | Artículos | Articles | Artikel |
| Sitemap | Mapa del sitio | Plan du site | Sitemap |
| Privacy | Privacidad | Confidentialité | Datenschutz |
| Terms | Términos | Conditions | AGB |

**Footer link targets (per locale `L` ∈ es/fr/de):**
- Products: localized where exists → `/L/pdf-editor/`, `/L/cv-builder/`, `/L/invoice-maker/`, `/L/pocket-manager/`; English for `/unzip/`, `/smart-printer/`, `/fax/`, `/twinphone/`, `/tcg-scanner/`. Products `<section>` keeps `id="footer-tools"`.
- Research & Writing: English article URLs (`/essays/`, `/research/`, …, `/artificial-intelligence/`).
- Index: English (`/blog/`, `/articles/`, `/sitemap.xml`).
- Legal: **localized** `/L/privacy/`, `/L/terms/`.
- Copyright: `© 2026 Petro Hrys` (unchanged all locales).

**Civilist mark / favicon:** all new localized pages use `<link rel="icon" href="/images/logo-red.svg">` and the existing `hero-mark` / `star-divider` / footer-signature CSS — identical to EN (replaces the old data-URI "P" favicon).

**Analytics (identical block, same order, every new page):** CookieYes (`client_data/af075fab…`), WebmasterID (`data-wmid="wm_bktqqtd7heom5nkl"`, consent-gated, endpoint unchanged), GA `G-4RE6YCJZBD`.

---

## hreflang model

Four page-type clusters. Every editorial page carries a self-canonical + 5 alternates (host = `https://www.petrohrys.com`):

| Cluster | en | es | fr | de | x-default |
|---|---|---|---|---|---|
| Home | `/` | `/es/` | `/fr/` | `/de/` | `/` |
| Work | `/work/` | `/es/work/` | `/fr/work/` | `/de/work/` | `/work/` |
| Writing | `/writing/` | `/es/writing/` | `/fr/writing/` | `/de/writing/` | `/writing/` |
| About | `/about/` | `/es/about/` | `/fr/about/` | `/de/about/` | `/about/` |

- EN `/` already has the Home cluster (verify). **Add** the Work/Writing/About clusters to EN `/work/`, `/writing/`, `/about/` (currently none).
- Section pages (research, etc.) stay EN-only — no hreflang (no alternates exist). Correct.
- Sitemap: add the 12 localized editorial URLs (non-www `loc`, matching the file's existing convention).

---

## Per-page content — SPANISH (`/es/`)

### Homepage `/es/index.html`
- **title:** Petro Hrys — Arquitecto de infraestructura digital
- **meta description:** Petro Hrys investiga sistemas de búsqueda, arquitecturas de IA, automatización y redes de inteligencia digital. Investigación independiente de infraestructura en la web abierta.
- **og:title / twitter:title:** Petro Hrys — Arquitecto de infraestructura digital
- **og:description / twitter:description:** Investigación de sistemas de búsqueda, arquitecturas de IA, automatización y redes de inteligencia digital.
- **eyebrow:** Petro Hrys
- **H1:** Arquitecto de infraestructura digital.
- **lede:** Desarrollo e investigación de sistemas de búsqueda, arquitecturas de IA, automatización y productos digitales independientes.
- **positioning:** Trabajo de forma independiente en la capa que sustenta la web visible: cómo los sistemas de búsqueda indexan y recuperan contenido, cómo los modelos de lenguaje muestran la información y cómo el descubrimiento pasa de la coincidencia de palabras clave a la comprensión de entidades e intención. Junto a la investigación, desarrollo y mantengo un pequeño conjunto de productos digitales independientes.
- **"Current focus" heading:** Enfoque actual — items: Comportamiento de indexación de los buscadores · Recuperación y exposición mediante LLM · Mantenimiento de productos independientes
- **"Selected products" heading:** Productos seleccionados — one-liners: PDF Editor "Escanea, convierte, firma y edita PDF en iPhone y Android." · CV Builder "Currículums compatibles con ATS, con más de 20 plantillas, en iPhone." · Invoice Maker "Envía facturas profesionales en menos de un minuto." · Smart Printer "Impresión inalámbrica desde el iPhone a más de 10 000 impresoras." · Pocket Manager "Control de gastos y presupuesto centrado en la privacidad." — **link "Ver todos los proyectos →"**
- **"Selected writing" heading:** Publicaciones seleccionadas — entries: `2026 · IA` "La inteligencia artificial como capa operativa práctica" (→ `/artificial-intelligence/`, EN) · `2026 · Ensayo` "Qué es realmente el negocio y por qué crecen las economías abiertas" (→ EN blog post) — **link "Todas las publicaciones →"**
- **identity note:** Soy Petro Hrys, investigador y arquitecto independiente que trabaja entre Europa y los Estados Unidos. La práctica es pequeña y autodirigida: escritura extensa, investigación aplicada y un ritmo constante de trabajo en productos independientes. — **link "Más sobre mí →"** — suit **alt** "Petro Hrys."
- **"Contact" heading:** Contacto — body: Disponible para colaboraciones de investigación y trabajo de infraestructura. + `hrhelperg@gmail.com`

### Work `/es/work/index.html`
- **title:** Proyectos — Petro Hrys · **meta:** Herramientas y productos independientes creados y mantenidos por Petro Hrys: PDF Editor, CV Builder, Invoice Maker y más. · **og/tw desc:** Herramientas y productos independientes, creados y mantenidos en solitario.
- **breadcrumb:** Inicio / Proyectos · **H1:** Proyectos · **lede:** Herramientas y productos independientes, creados y mantenidos en solitario.
- **"Featured products":** Productos destacados — PDF Editor "Escanea a PDF, convierte, firma y edita documentos sin conexión en iPhone y Android." · CV Builder "Crea un currículum compatible con ATS a partir de más de 20 plantillas y expórtalo a PDF." · Invoice Maker "Crea, envía y haz seguimiento de facturas profesionales en menos de un minuto."
- **"All products":** Todos los productos — descs: PDF Editor (home desc) · CV Builder (home) · Invoice Maker (home) · Smart Printer (home) · Pocket Manager (home) · Unzip "Extrae RAR, ZIP y 7z en el móvil, totalmente sin conexión." · FAX "Envía faxes desde el teléfono, sin necesidad de máquina." · TwinPhone "Números locales reales en más de 145 países." · TCG Scanner "Escanea cartas coleccionables y consulta precios de mercado en vivo."
- **maker caption:** Creado y mantenido por Petro Hrys. — café **alt** "Petro Hrys, que crea y mantiene estas herramientas."

### Research & Writing `/es/writing/index.html`
- **title:** Investigación y Publicaciones — Petro Hrys · **meta/og:** Ensayos e investigación sobre sistemas de búsqueda, infraestructura e IA.
- **breadcrumb:** Inicio / Investigación y Publicaciones · **H1:** Investigación y Publicaciones · **lede:** Ensayos e investigación aplicada sobre sistemas de búsqueda, infraestructura e IA.
- **note:** Gran parte del trabajo aquí estudia una sola pregunta: cómo deciden las máquinas qué merece mostrarse. Los textos abarcan ensayos extensos y notas empíricas más breves, agrupados a continuación por área. — train **alt** "Petro Hrys."
- **"Areas":** Áreas — rows (each + `EN` tag, title "en inglés"): Ensayos "Escritos ocasionales sobre tecnología, infraestructura y la web." · Investigación "Estudios de sistemas de búsqueda, comportamiento de indexación y arquitectura de rastreo." · Infraestructura "Notas sobre los sistemas que sostienen el descubrimiento y la distribución en la web abierta." · Sistemas de IA "Cómo los modelos de lenguaje, la recuperación y los datos estructurados moldean la inteligencia de la web." · Inteligencia Artificial "La IA como capa operativa práctica: el ensayo principal."
- **"Recent":** Recientes — same two entries — **link "Archivo del blog →"**

### About `/es/about/index.html`
- **title:** Acerca de — Petro Hrys · **meta:** Petro Hrys es investigador e ingeniero independiente especializado en infraestructura digital: sistemas de búsqueda, arquitecturas de IA, automatización y los sistemas que sostienen el descubrimiento en la web abierta. · **og/tw desc:** Investigador y arquitecto independiente especializado en infraestructura digital.
- **breadcrumb:** Inicio / Acerca de · **H1:** Acerca de · **lede:** Investigador y arquitecto independiente especializado en infraestructura digital.
- **bio P1:** Petro Hrys es investigador e ingeniero, y trabaja de forma independiente en la infraestructura digital: los sistemas de búsqueda, el comportamiento de indexación, las arquitecturas de IA y las capas de automatización que determinan cómo se descubre, recupera y entiende la información en la web abierta.
- **bio P2:** Una pregunta recorre todo el trabajo: cómo deciden las máquinas qué merece mostrarse. Los buscadores, los modelos de lenguaje y los sistemas automatizados que median cada vez más la información global responden de forma distinta, y el diseño de esas respuestas moldea en silencio lo que la gente encuentra, en lo que confía y sobre lo que construye. La atención se centra en esa capa —la arquitectura bajo la web visible— y no en los productos que se montan encima.
- **bio P3:** Nacido en Ucrania y radicado entre Europa y los Estados Unidos. La práctica es deliberadamente pequeña y autodirigida: escritura extensa, investigación aplicada y un ritmo constante de trabajo de infraestructura independiente, al margen de los incentivos que suelen distorsionar cómo se describen estos sistemas.
- **bio P4:** Un pequeño conjunto de herramientas independientes se mantiene en sus propias direcciones y aparece discretamente en el pie de página. Son trabajo útil en ámbitos adyacentes, no el centro de todo esto.
- **figcaption:** Petro Hrys · práctica de investigación independiente — suit **alt** "Petro Hrys, investigador y arquitecto independiente de infraestructura digital."
- **"Contact":** Contacto — Disponible para colaboraciones de investigación y consultoría de infraestructura. `hrhelperg@gmail.com`.

---

## Per-page content — FRENCH (`/fr/`)

### Homepage
- **title / og:title:** Petro Hrys — Bâtisseur d'infrastructure numérique
- **meta:** Petro Hrys étudie les systèmes de recherche, les architectures d'IA, l'automatisation et les réseaux d'intelligence numérique. Recherche indépendante sur l'infrastructure du web ouvert.
- **og/tw desc:** Recherche sur les systèmes de recherche, les architectures d'IA, l'automatisation et les réseaux d'intelligence numérique.
- **H1:** Bâtisseur d'infrastructure numérique.
- **lede:** Conception et recherche de systèmes de recherche, d'architectures d'IA, d'automatisation et de produits numériques indépendants.
- **positioning:** Je travaille de façon indépendante sur la couche qui sous-tend le web visible : la manière dont les systèmes de recherche indexent et récupèrent les contenus, dont les modèles de langage font émerger l'information, et dont la découverte passe de la correspondance de mots-clés à la compréhension des entités et de l'intention. En parallèle de la recherche, je conçois et maintiens un petit ensemble de produits numériques indépendants.
- **Axe actuel:** Comportement d'indexation des moteurs de recherche · Récupération et mise en avant par les LLM · Maintenance de produits indépendants
- **Produits sélectionnés:** PDF Editor "Numérisez, convertissez, signez et modifiez des PDF sur iPhone et Android." · CV Builder "Des CV compatibles ATS, avec plus de 20 modèles, sur iPhone." · Invoice Maker "Envoyez des factures professionnelles en moins d'une minute." · Smart Printer "Impression sans fil depuis l'iPhone vers plus de 10 000 imprimantes." · Pocket Manager "Suivi du budget et des dépenses, respectueux de la vie privée." — link "Tous les travaux →"
- **Publications sélectionnées:** `2026 · IA` "L'intelligence artificielle comme couche opérationnelle pratique" · `2026 · Essai` "Ce qu'est vraiment l'activité économique, et pourquoi les économies ouvertes prospèrent" — link "Toutes les publications →"
- **identity note:** Je suis Petro Hrys, chercheur et bâtisseur indépendant, établi entre l'Europe et les États-Unis. La pratique est restreinte et autonome : écriture longue, recherche appliquée et un rythme régulier de travail sur des produits indépendants. — link "En savoir plus →" — suit **alt** "Petro Hrys."
- **Contact:** Disponible pour des collaborations de recherche et des travaux d'infrastructure. `hrhelperg@gmail.com`

### Work
- **title:** Travaux — Petro Hrys · **meta:** Outils et produits indépendants conçus et maintenus par Petro Hrys : PDF Editor, CV Builder, Invoice Maker et plus encore. · **og/tw desc:** Outils et produits indépendants, conçus et maintenus en solo.
- **breadcrumb:** Accueil / Travaux · **H1:** Travaux · **lede:** Outils et produits indépendants, conçus et maintenus en solo.
- **Produits phares:** PDF Editor "Numérisez en PDF, convertissez, signez et modifiez vos documents hors ligne, sur iPhone et Android." · CV Builder "Créez un CV compatible ATS à partir de plus de 20 modèles et exportez-le en PDF." · Invoice Maker "Créez, envoyez et suivez des factures professionnelles en moins d'une minute."
- **Tous les produits:** PDF Editor (home) · CV Builder (home) · Invoice Maker (home) · Smart Printer (home) · Pocket Manager (home) · Unzip "Extrayez RAR, ZIP et 7z sur mobile, entièrement hors ligne." · FAX "Envoyez des fax depuis votre téléphone, sans machine." · TwinPhone "De vrais numéros locaux dans plus de 145 pays." · TCG Scanner "Scannez vos cartes à collectionner et obtenez les prix du marché en direct."
- **maker caption:** Conçu et maintenu par Petro Hrys. — café **alt** "Petro Hrys, qui conçoit et maintient ces outils."

### Research & Writing
- **title/meta:** Recherche et Publications — Petro Hrys / Essais et recherche sur les systèmes de recherche, l'infrastructure et l'IA, par Petro Hrys.
- **breadcrumb:** Accueil / Recherche et Publications · **H1:** Recherche et Publications · **lede:** Essais et recherche appliquée sur les systèmes de recherche, l'infrastructure et l'IA.
- **note:** L'essentiel du travail présenté ici explore une seule question : comment les machines décident de ce qui mérite d'être mis en avant. Les textes vont de l'essai long à des notes empiriques plus courtes, regroupés ci-dessous par domaine. — train **alt** "Petro Hrys."
- **Domaines** (each + `EN` tag, title "en anglais"): Essais "Écrits occasionnels sur la technologie, l'infrastructure et le web." · Recherche "Études des systèmes de recherche, du comportement d'indexation et de l'architecture d'exploration." · Infrastructure "Notes sur les systèmes qui soutiennent la découverte et la distribution sur le web ouvert." · Systèmes d'IA "Comment les modèles de langage, la récupération et les données structurées façonnent l'intelligence du web." · Intelligence artificielle "L'IA comme couche opérationnelle pratique : l'essai de référence."
- **Récents** — same entries — link "Archives du blog →"

### About
- **title:** À propos — Petro Hrys · **meta:** Petro Hrys est un chercheur et ingénieur indépendant spécialisé dans l'infrastructure numérique : systèmes de recherche, architectures d'IA, automatisation et les systèmes qui soutiennent la découverte sur le web ouvert. · **og/tw desc:** Chercheur et bâtisseur indépendant, spécialisé dans l'infrastructure numérique.
- **breadcrumb:** Accueil / À propos · **H1:** À propos · **lede:** Chercheur et bâtisseur indépendant, spécialisé dans l'infrastructure numérique.
- **bio P1:** Petro Hrys est chercheur et ingénieur ; il travaille de façon indépendante sur l'infrastructure numérique — les systèmes de recherche, le comportement d'indexation, les architectures d'IA et les couches d'automatisation qui déterminent comment l'information est découverte, récupérée et comprise sur le web ouvert.
- **bio P2:** Une question traverse l'ensemble du travail : comment les machines décident de ce qui mérite d'être mis en avant. Les moteurs de recherche, les modèles de langage et les systèmes automatisés qui médiatisent de plus en plus l'information mondiale y répondent chacun différemment, et la conception de ces réponses façonne discrètement ce que les gens trouvent, ce en quoi ils ont confiance et ce sur quoi ils s'appuient. L'attention porte sur cette couche — l'architecture sous le web visible — plutôt que sur les produits assemblés par-dessus.
- **bio P3:** Né en Ukraine et établi entre l'Europe et les États-Unis. La pratique est délibérément restreinte et autonome : écriture longue, recherche appliquée et un rythme régulier de travaux d'infrastructure indépendants, tenus à l'écart des incitations qui faussent habituellement la façon dont ces systèmes sont décrits.
- **bio P4:** Un petit ensemble d'outils indépendants est maintenu à ses propres adresses et discrètement répertorié en pied de page. Il s'agit d'un travail utile dans des domaines adjacents, et non du cœur de la démarche.
- **figcaption:** Petro Hrys · pratique de recherche indépendante — suit **alt** "Petro Hrys, chercheur et bâtisseur indépendant en infrastructure numérique."
- **Contact:** Disponible pour des collaborations de recherche et du conseil en infrastructure. `hrhelperg@gmail.com`.

---

## Per-page content — GERMAN (`/de/`)

### Homepage
- **title / og:title:** Petro Hrys — Architekt digitaler Infrastruktur
- **meta:** Petro Hrys erforscht Suchsysteme, KI-Architekturen, Automatisierung und digitale Intelligenznetze. Unabhängige Infrastrukturforschung im offenen Web.
- **og/tw desc:** Erforschung von Suchsystemen, KI-Architekturen, Automatisierung und digitalen Intelligenznetzen.
- **H1:** Architekt digitaler Infrastruktur.
- **lede:** Entwicklung und Erforschung von Suchsystemen, KI-Architekturen, Automatisierung und unabhängigen digitalen Produkten.
- **positioning:** Ich arbeite unabhängig an der Schicht unter dem sichtbaren Web — daran, wie Suchsysteme Inhalte indexieren und abrufen, wie Sprachmodelle Informationen sichtbar machen und wie sich das Auffinden von der Stichwortübereinstimmung hin zum Verständnis von Entitäten und Absicht verlagert. Neben der Forschung entwickle und pflege ich eine kleine Reihe unabhängiger digitaler Produkte.
- **Aktueller Schwerpunkt:** Indexierungsverhalten von Suchsystemen · Retrieval und Sichtbarkeit in LLMs · Pflege unabhängiger Produkte
- **Ausgewählte Produkte:** PDF Editor "PDFs scannen, konvertieren, signieren und bearbeiten – auf iPhone und Android." · CV Builder "ATS-taugliche Lebensläufe mit über 20 Vorlagen, auf dem iPhone." · Invoice Maker "Professionelle Rechnungen in unter einer Minute versenden." · Smart Printer "Drahtloses Drucken vom iPhone auf über 10.000 Drucker." · Pocket Manager "Datenschutzfreundliches Budget- und Ausgaben-Tracking." — link "Alle Projekte →"
- **Ausgewählte Veröffentlichungen:** `2026 · KI` "Künstliche Intelligenz als praktische Betriebsschicht" · `2026 · Essay` "Was Wirtschaft wirklich ist – und warum offene Volkswirtschaften wachsen" — link "Alle Veröffentlichungen →"
- **identity note:** Ich bin Petro Hrys — unabhängiger Forscher und Architekt, tätig zwischen Europa und den Vereinigten Staaten. Die Praxis ist klein und eigenständig: ausführliches Schreiben, angewandte Forschung und eine stetige Folge unabhängiger Produktarbeit. — link "Mehr über mich →" — suit **alt** "Petro Hrys."
- **Kontakt:** Verfügbar für Forschungskooperationen und Infrastrukturarbeit. `hrhelperg@gmail.com`

### Work
- **title:** Projekte — Petro Hrys · **meta:** Unabhängige Tools und Produkte, entwickelt und gepflegt von Petro Hrys: PDF Editor, CV Builder, Invoice Maker und mehr. · **og/tw desc:** Unabhängige Tools und Produkte, allein entwickelt und gepflegt.
- **breadcrumb:** Startseite / Projekte · **H1:** Projekte · **lede:** Unabhängige Tools und Produkte – allein entwickelt und gepflegt.
- **Empfohlene Produkte:** PDF Editor "Dokumente offline auf iPhone und Android in PDF scannen, konvertieren, signieren und bearbeiten." · CV Builder "Erstelle einen ATS-tauglichen Lebenslauf aus über 20 Vorlagen und exportiere ihn als PDF." · Invoice Maker "Professionelle Rechnungen in unter einer Minute erstellen, versenden und nachverfolgen."
- **Alle Produkte:** PDF Editor (home) · CV Builder (home) · Invoice Maker (home) · Smart Printer (home) · Pocket Manager (home) · Unzip "RAR, ZIP und 7z mobil entpacken – vollständig offline." · FAX "Faxe vom Telefon senden – ganz ohne Gerät." · TwinPhone "Echte lokale Rufnummern in über 145 Ländern." · TCG Scanner "Sammelkarten scannen und aktuelle Marktpreise abrufen."
- **maker caption:** Entwickelt und gepflegt von Petro Hrys. — café **alt** "Petro Hrys, der diese Werkzeuge entwickelt und pflegt."

### Research & Writing
- **title/meta:** Forschung & Veröffentlichungen — Petro Hrys / Essays und Forschung zu Suchsystemen, Infrastruktur und KI, von Petro Hrys.
- **breadcrumb:** Startseite / Forschung & Veröffentlichungen · **H1:** Forschung & Veröffentlichungen · **lede:** Essays und angewandte Forschung zu Suchsystemen, Infrastruktur und KI.
- **note:** Der Großteil der Arbeit hier untersucht eine einzige Frage: Wie entscheiden Maschinen, was es wert ist, sichtbar gemacht zu werden. Die Texte reichen von langen Essays bis zu kürzeren empirischen Notizen, im Folgenden nach Themenbereich gruppiert. — train **alt** "Petro Hrys."
- **Bereiche** (each + `EN` tag, title "auf Englisch"): Essays "Gelegentliche Texte über Technologie, Infrastruktur und das Web." · Forschung "Studien zu Suchsystemen, Indexierungsverhalten und Crawl-Architektur." · Infrastruktur "Notizen zu den Systemen, die Auffindbarkeit und Verbreitung im offenen Web tragen." · KI-Systeme "Wie Sprachmodelle, Retrieval und strukturierte Daten die Intelligenz des Webs prägen." · Künstliche Intelligenz "KI als praktische Betriebsschicht – der zentrale Essay."
- **Aktuelles** — same entries — link "Blog-Archiv →"

### About
- **title:** Über mich — Petro Hrys · **meta:** Petro Hrys ist ein unabhängiger Forscher und Ingenieur mit Schwerpunkt auf digitaler Infrastruktur: Suchsysteme, KI-Architekturen, Automatisierung und die Systeme, die das Auffinden im offenen Web tragen. · **og/tw desc:** Unabhängiger Forscher und Architekt mit Schwerpunkt auf digitaler Infrastruktur.
- **breadcrumb:** Startseite / Über mich · **H1:** Über mich · **lede:** Unabhängiger Forscher und Architekt mit Schwerpunkt auf digitaler Infrastruktur.
- **bio P1:** Petro Hrys ist Forscher und Ingenieur und arbeitet unabhängig an digitaler Infrastruktur — den Suchsystemen, dem Indexierungsverhalten, den KI-Architekturen und den Automatisierungsschichten, die bestimmen, wie Informationen im offenen Web gefunden, abgerufen und verstanden werden.
- **bio P2:** Eine Frage zieht sich durch die gesamte Arbeit: Wie entscheiden Maschinen, was es wert ist, sichtbar gemacht zu werden. Suchmaschinen, Sprachmodelle und die automatisierten Systeme, die globale Informationen zunehmend vermitteln, beantworten sie jeweils unterschiedlich, und die Gestaltung dieser Antworten prägt unmerklich, was Menschen finden, wem sie vertrauen und worauf sie aufbauen. Der Fokus liegt auf dieser Schicht — der Architektur unter dem sichtbaren Web — und nicht auf den darauf aufgesetzten Produkten.
- **bio P3:** Geboren in der Ukraine, lebt zwischen Europa und den Vereinigten Staaten. Die Praxis ist bewusst klein und eigenständig: ausführliches Schreiben, angewandte Forschung und ein stetiger Rhythmus unabhängiger Infrastrukturarbeit, fernab der Anreize, die üblicherweise verzerren, wie über diese Systeme gesprochen wird.
- **bio P4:** Eine kleine Reihe unabhängiger Werkzeuge wird unter eigenen Adressen gepflegt und unauffällig im Fußbereich aufgeführt. Sie sind nützliche Arbeit in angrenzenden Bereichen, nicht ihr Zentrum.
- **figcaption:** Petro Hrys · unabhängige Forschungspraxis — suit **alt** "Petro Hrys, unabhängiger Forscher und Architekt digitaler Infrastruktur."
- **Kontakt:** Verfügbar für Forschungskooperationen und Infrastrukturberatung. `hrhelperg@gmail.com`.

---

## Structured data (JSON-LD)

- **Localized homepages:** replicate EN `Person` / `WebSite` / `Organization` graph; set `WebSite.inLanguage` = `es`/`fr`/`de` and `url` = localized homepage; translate `Organization.description` and `Person.description`; keep `name`, `email`, `sameAs`, `url` (global person URL `https://www.petrohrys.com/`).
- **Localized work/writing/about:** replicate EN page's JSON-LD (`CollectionPage`/`WebPage` + `BreadcrumbList`), translate `name` + breadcrumb item `name`s, set `url`/`item` to localized URLs. Work `ItemList` keeps English product names + localized-where-exists product URLs.

---

## "EN" tag component (writing hub)

Small inline badge after the linked title **anywhere a localized page links to an untranslated EN article** — the writing-hub category rows, the writing-hub "Recent" entries, and the localized homepage "Selected writing" entries: `<span class="ext-lang" title="…">EN</span>` (title: "en inglés" / "en anglais" / "auf Englisch"). New CSS `.ext-lang` (mono, `--fs-xs`, `--text-3`, hairline border, small padding) added to `petrohrys.css`. Decorative-but-informative; not a link itself. (Localized product/Work links are NOT tagged — they resolve to localized or EN product pages, which are intentionally English-brand.)

---

## SEO + analytics preservation
- No URL changes / renames / redirects. Self-canonicals on every page.
- hreflang reciprocity across the 4 clusters (audit in final report).
- Same WebmasterID / CookieYes / GA block on every new page (IDs unchanged).
- Sitemap: add 12 localized editorial URLs.

## Internationalization debt (for final report)
- Deep EN content (research/infrastructure/ai-systems/essays/artificial-intelligence, blog, articles) untranslated — localized hubs/homepages link to EN with `EN` tags.
- Localized product, privacy, terms pages keep their old design (old nav/footer) — old-design islands, same status as EN's old pages.
- No localized blog/articles.
- Pre-existing: sitemap `loc` non-www vs canonical www (carried over, not fixed here).

## Out of scope
- Translating deep content or product/legal pages; new languages beyond es/fr/de; redesigning the old-design islands.
