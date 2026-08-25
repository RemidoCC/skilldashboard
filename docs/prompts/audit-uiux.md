# Prompt: UI/UX-doorlichting van Skill Unit

> Plak alles onder de streep in een nieuwe sessie. De sessie heeft geen
> voorkennis van dit project, dus de prompt draagt zijn eigen context.

---

Je gaat de interface van **Skill Unit** doorlichten: klopt wat je ziet, klopt
wat er staat, en kan iedereen erbij. Je herontwerpt niets. Je levert een
rapport.

## Wat het is, en waar het op afgerekend wordt

Een privé-dashboard voor één gebruiker: dagelijkse taken leveren XP op per
vaardigheid, vaardigheden halen niveaus, alles komt in een grootboek. De
leidende regel van het hele product, en de maatstaf van deze doorlichting:

> **Het is een meetinstrument, geen speelgoed. Het rapporteert, het vleit niet.**

Dat is geen sfeerbeeld maar een toets. Een scherm dat je feliciteert, aanmoedigt
of een tegenvaller wegpoetst is fout, ook als het er mooi uitziet. Een scherm
dat een slecht getal gewoon laat zien is goed, ook als dat ongemakkelijk leest.

Repo: `RemidoCC/skilldashboard`, branch `claude/skill-unit-dashboard-p31a8j`.
Next.js 15 App Router, Tailwind v4, Playwright beschikbaar.

## Het ontwerpsysteem heet "Instrument"

Lees `app/globals.css` en het hoofdstuk **Design** in `README.md`. In het kort:

- **Twee thema's.** Dag (papier, warm grijs) en nacht (donker paneel). Te
  schakelen met `document.documentElement.setAttribute('data-theme', 'day'|'night')`,
  en in Beheer met een keuze die ook op automatisch kan staan (volgt
  zonsondergang in Amsterdam).
- **Drie oppervlakken.** `raised` staat op een harde schaduw, `recess` ligt
  verzonken, `screen` is het oplichtende display. Een element hoort tot precies
  één.
- **Monospace, tekst in zinsvorm.** Geen uitroeptekens, geen emoji, geen
  hoofdletterwoorden in de kopij zelf — dat de `.label`-klasse in kapitalen
  rendert is een eigenschap van het oppervlak, niet van de tekst.
- **Nederlands**, ook in foutmeldingen.
- De signaalkleur is voor wat aandacht eist, niet voor wat leuk is.

## Klaarzetten

```bash
npm install
npm run dev     # :3000
```

Chromium staat op `/opt/pw-browsers/chromium`; gebruik die en installeer geen
browsers bij. Je hebt geen ingelogde sessie (inloggen gaat via een magic link
naar een echt postvak), dus werk met de previews:

- `/dev/vandaag` — het hoofdscherm, met display, meters, taken, timer, snel
  loggen, het zondagsrapport en de voorstellenbak
- `/dev/beheer` — taken, vaardigheden, doelen, koppelingen, instellingen,
  export en terugzetten
- `/dev/historie` — niveauverloop, logboek, seizoenen

Ze renderen dezelfde componenten als de echte schermen tegen vaste fixtures.
`/dev/beheer` neemt `?google=<status>`, `?sleutel=nee`, `?sleutels=nee` en
`?gekoppeld=nee` aan om koppelstatussen te forceren. `/dev/historie` volgt
`?dagen=30|90|365|alles` niet — daarvoor moet je naar `/historie` met sessie,
dus beoordeel daar de opmaak van de keuzebalk en niet de inhoud.

Bekijk alles op **390 × 844** (de maat waarvoor het gemaakt is), en daarnaast op
320 breed en op een tablet. Maak screenshots; `npm run screenshots` doet een
vaste set.

## Waar je naar kijkt

### 1. Toon en tekst

Loop elke zichtbare zin langs. Zoek naar:

- felicitaties, aanmoediging, uitroeptekens, emoji
- eufemismen voor een slecht getal
- vaagheid waar een getal hoort ("bijna", "goed bezig")
- Engels dat in het Nederlands hoort te staan, en andersom onnodige vernederlandsing
  van vaktermen
- spel- en grammaticafouten, verkeerde meervouden ("1 taken"), d/t
- knoppen die niet zeggen wat er gebeurt ("OK", "Verzenden")
- foutmeldingen die het probleem niet noemen of geen uitweg geven

Let bijzonder op de gevaarlijke plekken: het zondagsrapport, de roestmelding, de
freeze-melding, het seizoensoordeel, en alles rond terugdraaien en terugzetten.
Dat zijn de momenten waarop een systeem geneigd is aardig te worden.

### 2. Toegankelijkheid

Meet, gok niet.

- **Contrast (WCAG AA)** in **beide** thema's: 4.5:1 voor tekst, 3:1 voor grote
  tekst en voor de randen van bedieningselementen. Bereken het uit de werkelijk
  berekende stijlen in de browser, niet uit de tokens — een token dat goed is
  kan op het verkeerde oppervlak belanden. Vergeet placeholders, uitgeschakelde
  knoppen en tekst op de signaalkleur niet.
- **Focus zichtbaar (2.4.11)**: tab door elk scherm. Elk bereikbaar element
  toont waar je bent, met genoeg contrast tegen zijn achtergrond. Let op
  elementen die visueel verborgen zijn maar wel focus krijgen, zoals het
  bestandsveld bij Terugzetten.
- **Naam in label (2.5.3)**: elk `aria-label` begint met de woorden die je ziet
  staan, anders kan spraakbediening de knop niet aanroepen. Controleer dit
  programmatisch: zoek elk element met een `aria-label` en vergelijk met zijn
  zichtbare tekst.
- **Raakvlakken** minstens 44 × 44.
- **Structuur**: één `h1`, koppen in volgorde, landmarks (`main`, `nav`), lijsten
  als lijsten, formuliervelden met een echt label.
- **Live regions**: wat verandert zonder herladen (de synchronisatiebalk, een
  foutmelding, een teruggedraaide regel) wordt aangekondigd — en niet zo vaak
  dat het geratel wordt.
- **Beweging**: respecteert `prefers-reduced-motion`.
- **Zonder JavaScript**: wat blijft werken? De periodekeuze in Historie hoort
  het te doen; kijk of dat elders ook kan.
- Draai een echte scan (axe-core injecteren via Playwright) én kijk zelf, want
  de helft hiervan ziet geen enkele scanner.

### 3. Wat het scherm doet als het misgaat

Voor elk scherm: hoe ziet het eruit

- helemaal leeg (nieuw account, geen taken, geen logboek, geen seizoen)
- overvol (twintig taken, tien vaardigheden, een titel van 200 tekens, een
  getal van zeven cijfers, een naam zonder spaties)
- tijdens laden en tijdens een trage schrijfactie
- offline, en als een schrijfactie blijvend mislukt

Lege toestanden horen te zeggen wat je kunt doen, niet alleen dat er niets is.

### 4. Bruikbaarheid

- Kun je in één handeling doen waarvoor je de app opent — een taak aftekenen?
- Zijn de onomkeerbare handelingen (terugdraaien, ontkoppelen, terugzetten,
  uitloggen) duidelijk gescheiden van de gewone, en zeggen ze wat ze kosten
  vóórdat ze het doen?
- Is de navigatie op één hand te bedienen; staat het gevaarlijke niet naast het
  dagelijkse?
- Klopt de visuele hiërarchie met wat het belangrijkst is, of trekt versiering
  de aandacht?
- Is de informatiedichtheid houdbaar op 320 breed?

### 5. Samenhang

Dezelfde soort knop ziet er overal hetzelfde uit. Dezelfde soort melding staat
overal op dezelfde plek. Getallen worden overal hetzelfde opgemaakt. Data
worden overal hetzelfde geschreven. Loop hier op af met een lijst, niet op
gevoel.

## Wat je oplevert

Een bestand `docs/audits/uiux-<datum>.md` met:

1. **Oordeel per scherm** — Vandaag, Beheer, Historie, Login, de offline-schil.
2. **Bevindingen**, ernstigste eerst. Per bevinding: wat er mis is, waar
   (`bestand:regel` én een screenshot), waarom het een probleem is voor de
   gebruiker, en een concreet voorstel — de precieze zin, de precieze kleur,
   het precieze attribuut. Merk toegankelijkheidsbevindingen met het
   WCAG-criterium.
3. **Elke schending van de leidende regel apart**, hoe klein ook. Eén
   aanmoedigende zin ondermijnt het hele product; dat is de bevinding die er
   het meest toe doet.
4. **Wat goed is.** Noem het, zodat het niet per ongeluk wordt weggepoetst door
   iemand die later iets anders repareert.

Verander niets zonder te vragen. Commit het rapport en de screenshots op een
eigen branch en zeg welke.

Als je iets tegenkomt dat niet in deze lijst staat maar wel wringt: opschrijven.
De lijst is wat ik vermoed, niet wat er is.
