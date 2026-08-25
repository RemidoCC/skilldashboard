# Prompt: functionele audit van Skill Unit

> Plak alles onder de streep in een nieuwe sessie. De sessie heeft geen
> voorkennis van dit project, dus de prompt draagt zijn eigen context.

---

Je gaat **Skill Unit** doorlichten: werkt elke functie werkelijk, of lijkt het
alleen maar zo. Je bouwt niets nieuws. Je levert een auditrapport.

## Wat het is

Een privé-dashboard voor één gebruiker, waarin dagelijkse taken XP opleveren
per vaardigheid, vaardigheden niveaus halen, en alles wat je doet in een
grootboek terechtkomt. De leidende regel van het hele product: **het is een
meetinstrument, geen speelgoed. Het rapporteert, het vleit niet.** De interface
is Nederlands.

Repo: `RemidoCC/skilldashboard`, branch `claude/skill-unit-dashboard-p31a8j`.
Next.js 15 App Router, TypeScript strict, Tailwind v4, Supabase (Postgres 17,
RLS op elke tabel), Vitest, Playwright.

Lees eerst `README.md`. Die beschrijft de regels, de architectuur en wat er per
fase af zou moeten zijn. Het is een claim, geen bewijs — jouw werk is nagaan of
de claim klopt.

## Klaarzetten

```bash
npm install
export TEST_DATABASE_URL="$(bash scripts/db-setup.sh 2>&1 | tail -1)"   # lokale Postgres
npm run dev                                                             # :3000
```

Chromium staat op `/opt/pw-browsers/chromium`; gebruik die en installeer geen
browsers bij. Voor een productiebuild: `npm run build:verify` en
`npm run start:verify` (poort 3100, eigen `.next-prod`, zodat je de dev-server
niet omvertrekt).

Wat je **niet** hebt, en waar je dus geen conclusie over mag trekken alsof je
het wel had: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `TOKEN_ENCRYPTION_KEY` en een
ingelogde sessie (inloggen gaat via een magic link naar een echt postvak).
Zet zelf een `TOKEN_ENCRYPTION_KEY` (`openssl rand -base64 32`) als je die
nodig hebt in een test; vraag de eigenaar niet om echte sleutels. Zeg per
bevinding expliciet of je hem hebt uitgevoerd of alleen gelezen.

De schermen zijn zonder sessie te bekijken via `/dev/vandaag`, `/dev/beheer` en
`/dev/historie`, die tegen fixtures renderen en in productie 404'en.
`/dev/beheer` neemt `?google=`, `?sleutel=nee`, `?sleutels=nee` en
`?gekoppeld=nee` aan om koppelstatussen te forceren.

## Hoe je werkt

**Voer uit, lees niet alleen.** Een functie die je alleen in de broncode hebt
zien staan is niet geverifieerd. Draai de tests, klik de schermen af met
Playwright, praat met de database via `psql "$TEST_DATABASE_URL"`, roep de
routes aan met `curl`.

**Wees vijandig.** Bij elke regel hieronder is de vraag niet "doet het dit in
het gelukkige geval" maar "waarmee krijg ik het stuk". Dubbele aanroep. Lege
invoer. Middernacht. Een negatief getal. Een tweede gebruiker. Een verbroken
verbinding halverwege.

**Trap niet in groene tests.** 510 tests slagen. Een test die het verkeerde
meet slaagt ook. Kijk bij elke belangrijke regel of er een test is die hem
werkelijk zou zien breken — verander desnoods tijdelijk de productiecode en
controleer dat een test valt (draai die wijziging daarna terug).

## Wat je nagaat

Per punt: wat de regel is, of het klopt, en waarmee je dat hebt vastgesteld.

**De curve en de niveaus**
- `xp_needed` in SQL en `xpNeeded` in TypeScript geven tot ver voorbij niveau
  100 hetzelfde getal, ook bij negatieve XP. Ze ronden allebei van nul af.
- Niveaus lopen omhoog én omlaag; een vloer (elk vijfde niveau) wordt nooit
  teruggegeven, behalve door een terugdraaiing.
- `recalculate_levels` uit een grootboek geeft precies wat stapsgewijs
  bijschrijven gaf.

**Voltooiingen**
- `log_completion` is idempotent op de meegegeven id: dezelfde id twee keer
  levert één regel en één keer XP.
- Een timer rekent per tien minuten, een vinkje per keer.
- De reeksbonus is maximaal 30 procent en rekent met gehele getallen tot de
  laatste deling.

**Terugdraaien**
- `revert_completion` haalt de regel weg én alles wat eruit volgde: de
  opdrachtvoortgang, de bonus, een geaccepteerd voorstel dat weer op wachtend
  moet.
- Roest en een opdrachtbonus laten zich niet terugdraaien; de melding zegt
  waarom en wat je wel kunt doen.
- `last_active_at` volgt het grootboek dat overblijft.

**Roest**
- De coulanceperiode hangt aan de weekstand: rustig 14, normaal 10, gek 21.
- Eén niveau per roestperiode, niet één per dag.
- Roest staat als regel in het grootboek, zodat het terug te rekenen is.

**Freezes**
- Maximaal drie tegelijk, één per voltooide week.
- Alleen een vastgelegde freeze houdt een reeks overeind. Een nog niet
  uitgegeven freeze mag nooit met terugwerkende kracht een gat dichten.

**Opdrachten en seizoenen**
- Voortgang en bonus lopen binnen `log_completion`, in dezelfde transactie.
- Een seizoen duurt twaalf weken vanaf een maandag; `badgeTheme` is
  deterministisch en volgt alleen uit wat er gebeurd is.
- De samenvatting die aan het eind wordt weggeschreven is dezelfde die
  Historie terugleest.

**Het zondagsrapport** verschijnt zondag vanaf 18:00 en blijft de maandag
staan; de wegklik-sleutel hoort bij de week die eindigde.

**Offline** (`npm run verify:offline`, `npm run verify:beheer`, en zelf naspelen)
- Twee IndexedDB-winkels: voltooiingen zijn idempotent op id, bewerkingen zijn
  volgordegevoelig. Controleer dat de volgorde ook echt bewaard blijft.
- Een blijvend mislukte schrijfactie verdwijnt niet stil; hij parkeert en
  overleeft een herlaadbeurt tot je hem wegklikt.
- Zonder sessie geeft **elke** route onder `/api/` een status terug en nooit
  een redirect. Een 307 naar `/login` wordt door `fetch` gevolgd en leest als
  een geslaagde schrijfactie — dat is hier eerder misgegaan. Test dit per route
  met `curl -L`.

**De servicewerker** (`npm run verify:pwa`) — background sync, cache-first voor
statische bestanden, network-first voor pagina's, en een offline-schil die
zonder sessie rendert.

**Export en terugzetten**
- Maak een export, zet hem terug, exporteer opnieuw: hetzelfde bestand op
  `exportedAt` na.
- Een bestand dat beweert van een andere gebruiker te zijn komt in je eigen
  account of nergens.
- Een bestand met verzonnen niveaus geeft de niveaus die het grootboek draagt,
  niet die uit het bestand.
- Een terugzetting die halverwege faalt laat het oude account intact.
- Onzin krijgt een zin die de tabel en de rij noemt, geen constraint-naam.

**Het token en de sleutel**
- `integration_accounts`: de client kan zien dát er iets gekoppeld is en kan
  het token niet lezen, ook niet met `select *`.
- Het token staat versleuteld; de check constraint weigert platte tekst, ook
  voor de service-rol.
- Zonder `TOKEN_ENCRYPTION_KEY` begint de koppelstroom niet.
- Een gedraaide sleutel geeft een leesbare melding, geen stille lege ronde.

**RLS** staat aan op elke tabel met een werkend beleid. Controleer dat als
`authenticated` met de claim van gebruiker A, niet als superuser.

**De cron-routes** weigeren een aanroep zonder `Authorization: Bearer
$CRON_SECRET`, en ook eentje met een verkeerd token.

## Wat je oplevert

Een bestand `docs/audits/functies-<datum>.md` met:

1. **Oordeel per gebied** — werkt / werkt met kanttekening / kapot / niet te
   controleren zonder credentials.
2. **Bevindingen**, ernstigste eerst. Per bevinding: wat er misgaat, het
   precieze recept om het te reproduceren, wat het gevolg is voor de gebruiker,
   en waar het in de code zit (`bestand:regel`).
3. **Wat je hebt geprobeerd en niet stuk kreeg.** Dit is het waardevolste deel
   van een audit en wordt meestal weggelaten. Noem het.
4. **Blinde vlekken** — wat je zonder credentials, zonder telefoon of zonder
   echte cron niet hebt kunnen zien.

Repareer niets zonder te vragen, behalve een aantoonbare typefout in een
tekst. Een auditeur die onderweg patcht levert geen audit meer op. Commit het
rapport op een eigen branch en zeg welke.

Als je iets tegenkomt dat niet in deze lijst staat maar wel rammelt: opschrijven.
De lijst is wat ik vermoed, niet wat er is.
