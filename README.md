# Zipchat ↔ CM Mobile Service Cloud bridge

**Repo:** https://github.com/Dutchtoysgroup/zipchat-cm-bridge (privé) — elke push
naar `main` deployt automatisch naar productie.

**Live:** https://zipchat-cm-bridge.vercel.app — het dashboard zit achter Basic
auth (gebruiker `exit`; wachtwoord staat in `.secrets-generated.txt`, en in
Vercel als `DASHBOARD_PASSWORD`).

Koppelt de Zipchat AI-assistent op de webshop aan **Mobile Service Cloud** van
CM.com, via de **Conversational Router** (de "Twoway router"). Als de AI er niet
uitkomt, vraagt hij naam en e-mailadres en tilt hij het gesprek — inclusief de
volledige geschiedenis — naar een medewerker in Agent Inbox. Antwoorden van die
medewerker komen terug in dezelfde chatwidget.

## Hoe het loopt

```
Klant ──▶ Zipchat-widget ──▶ AI kan het niet aan
                              │
                              ▼  custom tool vraagt naam + e-mail
                        POST /api/zipchat/escalate
                              │
                    ┌─────────┴──────────┐
                    │   deze bridge      │
                    └─────────┬──────────┘
       AI pauzeren ◀──────────┼──────────▶ transcript naar TwoWay-adapter
       (Zipchat API)          │            + session state → agent
                              ▼
                    Conversational Router ──▶ Agent Inbox (MSC)
                              │
        agent typt antwoord ──┘
                              │
                    POST /api/cm/webhook
                              ▼
              bericht verschijnt in de widget
```

Klantberichten tijdens een handover worden **gepolld** (`/api/poll`), omdat
Zipchat geen webhook aanbiedt. De cron draait elke minuut en loopt binnen die
minuut door met een interval van 5 seconden, zodat de latency ~5s is in plaats
van 60s. Draait er geen enkel gesprek, dan stopt de invocatie meteen.

## Aan de praat krijgen

```bash
npm install
cp .env.example .env.local   # vullen; leeg laten mag ook
npm run dev
```

Zonder credentials start de bridge in **mock-modus**: het dashboard en alle
testknoppen werken, maar er gaat niets echt naar CM of Zipchat. Zodra
`ZIPCHAT_API_TOKEN` en `CM_PRODUCT_TOKEN` gevuld zijn, schakelt hij naar live.
Forceren kan met `BRIDGE_MOCK_MODE`.

Zonder `DATABASE_URL` gebruikt de bridge in-memory opslag. Dat is prima lokaal,
maar **niet op Vercel** — daar is elke invocatie een schone lei. Voor productie
dus een Neon-database aanmaken en `npm run db:push` draaien.

## Endpoints

| Endpoint | Wie roept aan | Doel |
|---|---|---|
| `POST /api/zipchat/escalate` | de Zipchat custom tool | escalatie starten |
| `POST /api/cm/webhook` | de Conversational Router | agent-antwoord bezorgen |
| `POST /api/cm/handover` | de Conversational Router | handover-status bijwerken |
| `POST /api/cm/event` | de Conversational Router | router-events, sluit de sessie bij RouterSessionEnded |
| `GET /api/poll` | Vercel Cron | klantberichten doorsturen |
| `GET /api/health` | dashboard | configuratie- en statuscheck |
| `GET /api/sessions` · `GET /api/events` | dashboard | data |
| `POST /api/test` | dashboard | testknoppen |

Beveiliging in twee lagen:

- **Machine-endpoints** (`/api/cm/*`, `/api/zipchat/*`, `/api/poll`) staan open
  voor het internet, maar verwachten een gedeeld geheim in een header:
  `X-Bridge-Secret` voor Zipchat, `X-Bridge-Token` voor CM, en het Vercel
  `CRON_SECRET` voor de poller. Die geheimen verzin je zelf — je krijgt ze niet
  van CM of Zipchat; je genereert een willekeurige string en zet dezelfde waarde
  aan beide kanten neer.
- **Het dashboard en zijn data-endpoints** zitten achter Basic auth
  (`src/middleware.ts`), want daar staan klantnamen, e-mailadressen en
  transcripten in. CM en Zipchat kunnen geen Basic auth meesturen, vandaar de
  uitzondering hierboven.

Ontbreekt een geheim in de omgeving, dan laat de bridge door en waarschuwt het
dashboard erover — handig lokaal, niet de bedoeling in productie.

De database draait bewust in **Frankfurt (eu-central-1)**: er staan
persoonsgegevens van EU-klanten in.

## Wat er aan de CM-kant moet gebeuren

Maak in de Conversational Router een **TwoWay-adapter** aan en vul het formulier zo:

| Veld | Waarde |
|---|---|
| Name | bijv. `Zipchat bridge` |
| **Is Bot** | **uit** — Zipchat is de bot en staat buiten de router; deze adapter is de kanaalkant |
| Message Endpoint › Url | `https://<jouw-deploy>/api/cm/webhook` |
| Message Endpoint › Method | `POST` |
| Message Endpoint › Add header | naam `X-Bridge-Token`, waarde = je `CM_WEBHOOK_SECRET` |
| Hand Over Endpoint › Url | `https://<jouw-deploy>/api/cm/handover` |
| Hand Over Endpoint › Body | de standaardwaarde laten staan |
| Hand Over Endpoint › Add header | dezelfde `X-Bridge-Token` |
| Event Endpoint › Url | `https://<jouw-deploy>/api/cm/event?token=<CM_WEBHOOK_SECRET>` |

Na opslaan krijg je de adapter-URL in de vorm
`https://api.conversational.cm.com/conversational/twoway/v2/accounts/{technicalLinkId}/adapters/{adapterId}`.
Die twee id's vullen `CM_ACCOUNT_ID` en `CM_ADAPTER_ID`.

Verder nodig:

- een routingregel die naar **Agent Inbox** gaat; het `stateNameId` daarvan
  invullen als `CM_AGENT_STATE_NAME_ID`;
- een **product token** met recht `ConversationalRouter.RouterSession_Update`.
  Te vinden in het CM-platform: profielicoon rechtsboven → **Channels** →
  **Gateway** in het linkermenu. Let op: dit is *niet* hetzelfde als de
  producttokens in HALO — die zijn HALO-scoped, en "MSC Voice" is voor
  voice-handovers, niet voor tekstrouting.

De TwoWay-adapter weigert onbevoegde calls met een kale `401` zonder
`WWW-Authenticate`-header, dus zonder dit token komt er niets door.

### Waarom het Event Endpoint zijn geheim in de URL heeft

Het Message- en Hand Over Endpoint hebben in CM een *Headers*-sectie; het Event
Endpoint niet. Daar is de URL de enige plek waar een geheim kwijt kan, dus
accepteert de bridge op alle CM-endpoints ook een `?token=`-parameter. De
header blijft de voorkeur en wordt als eerste gecontroleerd.

Het geheim komt zo wel in de request-logs van Vercel terecht. Dat is hier
aanvaardbaar: wie die logs kan lezen, kan ook de environment variables lezen.

### Over de body van het Hand Over Endpoint

CM vult die body met placeholders:

```json
{"chatId":"{{$chatId}}","sessionId":"{{$sessionId}}","accountId":"{{$accountId}}",
 "channel":"{{$channel}}","conversationHostId":"{{$conversationHostId}}",
 "conversationClientId":"{{$conversationClientId}}","context":{{$context}}}
```

Let op: daar zit **geen event-type in**. De bridge kan dus niet uit de body zelf
afleiden of er een medewerker is toegewezen of dat de handover juist mislukte;
hij kijkt in `context` en valt anders terug op de neutrale status `handover`.

De volledige payload gaat het logboek in. Bekijk bij de eerste echte handover
wat er in `context` zit — staat daar iets bruikbaars in, dan scherpen we de
herkenning in `isAssigned()` daarop aan.

Een lege placeholder levert ongeldige JSON op (`"context":}`). De bridge
repareert dat en logt anders de ruwe body, in plaats van een 400 terug te geven
waar je niets aan hebt.

### Over het Hand Over Endpoint

CM meldt hier wanneer een gesprek naar een medewerker gaat. De bridge werkt
daarmee de sessie bij en toont de naam van de medewerker in het dashboard.

De bridge zegt standaard **niet** tegen de klant dat er is doorverbonden. Dat is
bewust: een "je bent verbonden"-melding bij een handover die vervolgens niemand
oppakt, is erger dan geen melding. Zet `CM_HANDOVER_NOTIFY_CUSTOMER=true` pas
als je zeker weet dat er altijd iemand oppakt — dan meldt de bridge het
uitsluitend bij een bevestigde toewijzing, nooit bij `noAgentAvailable` of een
wachtrij.

## Wat er aan de Zipchat-kant moet gebeuren

De custom tool in [`zipchat-tool/escalate-to-msc.md`](zipchat-tool/escalate-to-msc.md)
installeren, met twee variabelen: `MSC_BRIDGE_URL` en `MSC_BRIDGE_SECRET`.

`ZIPCHAT_SENDER_ID` is de Zipchat-gebruiker waaronder MSC-antwoorden in de
widget verschijnen — maak daarvoor een teamlid aan met een neutrale naam
("Klantenservice"), want die naam ziet de klant.

De beschikbare gebruikers haal je op met een endpoint dat niet in de Zipchat-
documentatie staat, maar wel werkt:

```bash
curl -s "https://app.zipchat.ai/api/integrations/backend_api/v1/chats/<chat_id>/users" \
  -H "Authorization: Bearer $ZIPCHAT_API_TOKEN"
```

## Tegen de live router uitgezocht

Deze punten stonden eerst als aanname in de code. Ze zijn nu getest tegen de
echte adapter; de code doet wat hieronder staat.

| Aanname | Werkelijkheid |
|---|---|
| `$type: "Text"` | **Fout.** Moet `"text"` zijn, kleine letters. `"Text"` geeft HTTP 400: CM's deserializer kan `MessageBase` niet instantiëren. |
| kanaal `"Custom"` | **Bestaat niet.** De router accepteert een vaste lijst; een eigen webchat is **`CXWebConversations`**. |
| wij bepalen `chat.id` | **Nee.** Het veld moet gevuld zijn, maar CM negeert de waarde en leidt zijn eigen id af uit `conversationClientId`. Dat id staat in het 201-antwoord en is leidend voor alle callbacks — de bridge legt het vast. |
| `LogicalAccountId` == technicalLinkId | **Onbekend.** Routing control geeft `403` met dit producttoken; zie hieronder. |

Een geslaagde verzending geeft `201` met:

```json
{"chat":{"id":"55818476-…","channel":"CXWebConversations", …},
 "message":"Message(s) accepted"}
```

### Routing control is optioneel en staat nu uit

`PUT …/session/state` geeft `403 Forbidden`: het producttoken uit Channels →
Gateway mist het recht `ConversationalRouter.RouterSession_Update`.

Dat blokkeert niets. De bridge post het transcript naar de adapter en de
routingregels van de router bepalen waar het gesprek landt. Je hebt dit recht
alleen nodig als je de handover expliciet wilt forceren of skill-based wilt
routeren — vraag CM-support er dan om en vul daarna
`CM_AGENT_STATE_NAME_ID` in.

## Bekende beperking

Zipchat biedt geen endpoint om een binnenkomend bericht dóór de AI te laten
beantwoorden. Daarom kan e-mail die bij CM binnenkomt niet door Zipchat worden
afgehandeld. Wil je AI op e-mail, gebruik dan Zipchat's eigen e-mailkanaal als
voordeur; de escalatie hierboven werkt daar identiek.
