# Opnamen bij de doorlichting van 26 augustus 2026

Alle opnamen zijn gemaakt met Chromium via Playwright tegen de previewroutes
`/dev/vandaag`, `/dev/beheer` en `/dev/historie`, plus `/login` en `/offline`.
Het thema is geforceerd met `?theme=dag|nacht`. Waar niets anders vermeld staat
is de breedte 390 px, de maat waarvoor de app gemaakt is.

## De schermen

| Bestand | Wat |
| --- | --- |
| `vandaag-dag-390.png`, `vandaag-nacht-390.png` | Vandaag op zondag, beide thema's |
| `vandaag-dag-320.png`, `vandaag-dag-tablet.png` | Vandaag op 320 en op 834 × 1112 |
| `beheer-*.png` | Beheer, idem |
| `historie-*.png` | Historie, idem |
| `login-*.png`, `offline-*.png` | Login en de offline-schil, idem |
| `zonder-js-*.png` | Dezelfde schermen met JavaScript uit (bevinding 27) |

## Bewijs per bevinding

| Bestand | Bevinding |
| --- | --- |
| `bewijs-a-naam-zonder-spaties-390.png` | 4 — een naam zonder spaties duwt de pagina zijwaarts |
| `bewijs-b-leeg-beheer-dode-knoppen.png` | 5 — drie uitgeschakelde knoppen in volle signaalkleur |
| `bewijs-c-bestandsveld-focus-geen-ring.png` | 1 — het bestandsveld heeft focus, er is niets te zien |
| `bewijs-c-vergelijking-knop-met-ring.png` | 1 — dezelfde sectie, focus op de knop ernaast |
| `bewijs-d-terugdraaien-bevestiging.png` | 10 — de bevestiging op 9 px |
| `bewijs-e-segmenten-dag.png`, `-nacht.png` | 13 — de rand van niet-gekozen bedieningselementen |
| `bewijs-f-weekstand-hints.png` | 15 — hele zinnen in kapitalen op 9 px, en punt e van de leidende regel |
| `bewijs-g-zondagsrapport.png` | het weekbericht in zijn geheel; toon (goed) en bevinding 20, 24 |
| `bewijs-h-leeg-vandaag.png` | 21 — de tegenstrijdige wegwijzer op een leeg account |
| `bewijs-i-overvol-320.png` | 4 — twintig taken en tien vaardigheden op 320 breed |
| `bewijs-j-offline-wachtrij.png` | de synchronisatiebalk offline (correct) |
| `bewijs-k-doel-verwijderen.png` | 7 — verwijderen zonder bevestiging |
| `bewijs-l-online-maar-wacht-op-verbinding.png` | 2 — server geeft 500, browser is online, scherm zegt "wacht op verbinding" |
| `bewijs-l2-geparkeerde-schrijfactie.png` | 6 — geparkeerde schrijfactie met "Sluiten" ernaast |
| `bewijs-m-trage-schrijfactie.png` | de balk tijdens een trage schrijfactie (correct) |
| `bewijs-n-netwerk-weg.png` | 2 — verzoek breekt af, zelfde onjuiste melding |

De vier scenario's voor een schrijfactie zijn gemeten met de service worker
geblokkeerd. Die drainet de wachtrij namelijk zelf, en onderscheppingen op
paginaniveau bereiken hem niet; zonder die blokkade meet elk scenario de echte
401 van de middleware in plaats van het scenario.
