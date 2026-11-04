# Widget-instellingen van de landenbots

Deze instellingen staan alleen in het Zipchat-dashboard: de Backend API kan ze
niet lezen of schrijven, dus de sync raakt ze niet aan. Hieronder staat wat op
4 november 2026 gelijk is op NL, BE, DE, AT, DK, SE, PL, UK en IE. FR wijkt af
(naam Robert, initiaal R, stip `#D32525`).

Wat een bot nu heeft, kun je zonder inloggen nakijken. Dit is dezelfde aanvraag
die de widget op de webshop doet; `<token>` is de variabele `zipchat` in de
HTML van de webshop:

```bash
curl -s "https://app.zipchat.ai/widget_data?widget_token=<token>&current_url=https://www.exittoys.de/&visitor_width=1280"
```

`{"widget":false}` betekent dat de widget daar niet verschijnt: het token is
onbekend of de widget van de bot staat niet aan. Zipchat maakt daar geen verschil
tussen.

## Voor elke bot gelijk

| Instelling | Waarde |
|---|---|
| Naam | Tobi (initiaal T) |
| Foto en bubble-icoon | `tobi-avatar.jpg` uit deze map, beide dezelfde afbeelding |
| Bubble-type | eigen icoon, Zipchat-bubble |
| Kleur | `#000000` |
| Stipkleur | `#25D339` |
| Positie | rechtsonder, horizontaal 20, verticaal 20 |
| Formaat | medium |
| z-index | 999 |
| Tekstrichting | links naar rechts |
| AI-zoekbalk | uit, ook op desktop en mobiel |
| Pop-up | één trigger, na 30 seconden, niet bij het verlaten van de pagina |
| Pop-uptekst en eerste bericht | dezelfde tekst, zie de tabel hieronder |

## Per taal

| Taal | Pop-uptekst en eerste bericht | Invoerveld |
|---|---|---|
| nl | Kan ik je helpen met iets met betrekking tot EXIT Toys? | Vraag AI... |
| de | Kann ich Ihnen bei irgendetwas in Bezug auf EXIT Toys helfen? | Frag die KI... |
| da | Kan jeg hjælpe dig med noget vedrørende EXIT Toys? | Spørg AI... |
| sv | Kan jag hjälpa dig med något som rör EXIT Toys? | Fråga AI... |
| pl | Czy mogę Ci w czymś pomóc w związku z EXIT Toys? | Zapytaj AI... |
| en | Can I help you with anything regarding EXIT Toys? | Ask AI... |
| it | Posso aiutarti con qualcosa riguardo a EXIT Toys? | Chiedi all'IA... |
| es | ¿Puedo ayudarte con algo relacionado con EXIT Toys? | Pregunta a la IA... |

De teksten voor it en es zijn nieuw vertaald op 4 november 2026: de bots van
daarvoor bestaan niet meer, dus de oude teksten waren niet op te halen.

## Eigen CSS

Zet de chatknop naast de WhatsApp-knop.

```css
/* Desktop: naast elkaar */
@media (min-width: 768px) {
  #widget-chat-container {
    right: 132px !important;
    bottom: 56px !important;
  }
  #widget-chat-button {
    width: 56px !important;
    height: 56px !important;
  }
}

/* Mobiel: Zipchat onder de WhatsApp-knop */
@media (max-width: 767px) {
  #widget-chat-container {
    right: 3px !important;
    bottom: 8px !important;
  }
  #widget-chat-button {
    width: 44px !important;
    height: 44px !important;
  }
  #chat-preview-message {
    bottom: 112px !important;
  }
}
```

## Token op de webshop

De webshop laadt de bot via de variabele `zipchat` in de HTML, per land een eigen
token. Een nieuw aangemaakte bot heeft een nieuw token, dat alleen in het
dashboard te zien is. Vervangt een nieuwe bot een oude, dan moet deze variabele
op de webshop mee veranderen; anders blijft de chat daar weg.
