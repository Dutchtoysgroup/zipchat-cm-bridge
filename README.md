# Zipchat ↔ CM Mobile Service Cloud bridge

**Repo:** https://github.com/Dutchtoysgroup/zipchat-cm-bridge — elke push naar
`main` deployt via GitHub Actions (`.github/workflows/deploy-azure.yml`) naar
productie.

**Live:** https://dtg-zipchat-cm-bridge-weu.azurewebsites.net — het dashboard zit
achter Basic auth (gebruiker `exit`; wachtwoord staat in `.secrets-generated.txt`,
en in de App Service als `DASHBOARD_PASSWORD`).

## Waar het draait

Sinds 21 september 2026 op Azure; daarvoor Vercel + Neon.

| Wat | Waar |
|---|---|
| App Service | `dtg-zipchat-cm-bridge-weu` in `Workflow-n8n-RG`, op het plan `asp-n8n-dtg` (gedeeld met n8n), Node 24, start met `node server.js` |
| Database | centraal DTG-dataplatform: `dtg-data-platform-pg` → `dtg_data`, schema **`app_zipchat_bridge`** |
| Database-auth | managed identity van de App Service (`DATABASE_AUTH=entra`); er bestaat geen wachtwoord |
| Netwerk | de database is alleen privé bereikbaar; de App Service komt erbij via VNet-integratie op `vnet-dtg-data-platform-prd/snet-app-integration` |
| Cron (vangnet) | Logic App `cron-zipchat-bridge-poll` in `Workflow-n8n-RG`, elke 5 minuten `GET /api/poll` |
| Env vars | App Service → Configuration → Application settings |

**Schemawijzigingen gaan via de repo `dtg-data-platform`** (migraties V017/V018
maakten rol en schema aan), niet met `npm run db:push`: die zou de tabellen in
`public` zetten en is tegen de centrale server geblokkeerd in `drizzle.config.ts`.
Vanaf een laptop kun je niet bij de database; lezen doe je via het dashboard.

**Bewaartermijn 90 dagen.** De bridge bewaart klantnamen, e-mailadressen en
gespreksinhoud. `/api/poll` ruimt eens per dag op: events ouder dan 90 dagen
weg, naam en e-mail van sessies die al 90 dagen dicht zijn leeg.

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
Zipchat geen webhook aanbiedt. Eén invocatie pollt ~50 seconden door met een
interval van 5 seconden, en start daarna zichzelf opnieuw zolang er een gesprek
open staat. Draait er niets, dan doet `/api/poll` één query en stopt meteen.

### Pollketting en vangnet

* De pollketting wordt gestart door de gebeurtenis zelf: een escalatie
  (`/api/zipchat/escalate`) en een agentantwoord (`/api/cm/webhook`) trappen
  `/api/poll` af, en elk venster start het volgende zolang er sessies open zijn.
  De latency tijdens een gesprek blijft daarmee ~5 seconden.
* De cron (Logic App, elke 5 minuten) is alleen een **vangnet** voor het geval
  de ketting breekt door een deploy of een fout.
* Een tweede venster kan niet naast een lopende ketting starten: `/api/poll`
  neemt een lease (`bridge_settings.poll_lease`) en gaat anders meteen weg.
* Het dashboard ververst elke 15 seconden en stopt zodra het tabblad naar de
  achtergrond gaat.
* De zelfaanroep gaat naar `BRIDGE_PUBLIC_URL`: achter App Service begint
  `req.url` met `http://`, en een omleiding naar https zou de
  Authorization-header kwijtraken.

`POLL_SELF_CHAIN=false` zet de ketting uit en valt terug op alleen de cron —
verhoog dan de frequentie van de Logic App.

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

Zonder `DATABASE_URL` gebruikt de bridge in-memory opslag. Dat is prima lokaal.
Wil je lokaal een echte database, zet dan `DATABASE_URL` op een eigen Postgres
(bijv. `postgresql://localhost:5432/zipchat`) en draai `npm run db:push`.

## Endpoints

| Endpoint | Wie roept aan | Doel |
|---|---|---|
| `POST /api/zipchat/escalate` | de Zipchat custom tool | escalatie starten |
| `POST /api/zipchat/marketing` | Zipchat-tool op de social-media-agent | samenwerkingsaanvraag mailen naar marketing |
| `POST /api/cm/webhook` | de Conversational Router | agent-antwoord bezorgen |
| `POST /api/cm/handover` | de Conversational Router | handover-status bijwerken |
| `POST /api/cm/event` | de Conversational Router | router-events, sluit de sessie bij RouterSessionEnded |
| `GET /api/poll` | Logic App + pollketting | klantberichten doorsturen, dagelijkse opschoning |
| `GET /api/health` | dashboard | configuratie- en statuscheck |
| `GET /api/sessions` · `GET /api/events` | dashboard | data |
| `POST /api/test` | dashboard | testknoppen |

Beveiliging in twee lagen:

- **Machine-endpoints** (`/api/cm/*`, `/api/zipchat/*`, `/api/poll`) staan open
  voor het internet, maar verwachten een gedeeld geheim in een header:
  `X-Bridge-Secret` voor Zipchat, `X-Bridge-Token` voor CM, en `CRON_SECRET`
  (als `Authorization: Bearer`) voor de poller. Die geheimen verzin je zelf — je krijgt ze niet
  van CM of Zipchat; je genereert een willekeurige string en zet dezelfde waarde
  aan beide kanten neer.
- **Het dashboard en zijn data-endpoints** zitten achter Basic auth
  (`src/middleware.ts`), want daar staan klantnamen, e-mailadressen en
  transcripten in. CM en Zipchat kunnen geen Basic auth meesturen, vandaar de
  uitzondering hierboven.

Ontbreekt een geheim in de omgeving, dan laat de bridge door en waarschuwt het
dashboard erover — handig lokaal, niet de bedoeling in productie.

De database draait in **West Europe** (centraal dataplatform): er staan
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

Het geheim komt zo wel in de request-logs van de App Service terecht. Dat is hier
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

## Samenwerkingsaanvragen naar marketing

De social-media-agent (Zipchat-chat `21984`, exittoys.nl, o.a. Instagram) zet
influencer-, samenwerkings-, pers- en sponsoraanvragen door met de tool in
[`zipchat-tool/influencer-doorzetten.md`](zipchat-tool/influencer-doorzetten.md).
De masterprompt van die agent staat in
[`zipchat-tool/master-prompt-social-nl.md`](zipchat-tool/master-prompt-social-nl.md).

Dit gaat bewust **niet** via CM of Robin: dat is de klantenservice. De tool roept
`POST /api/zipchat/marketing` aan, en de bridge:

1. controleert naam en e-mailadres (zelfde regels als bij de escalatie);
2. haalt het gesprek op bij Zipchat, zodat marketing leest wat de persoon zelf schreef;
3. mailt alles naar `MARKETING_EMAIL_TO` (standaard `marketing@dutchtoysgroup.com`),
   met reply-to op het adres van de persoon, zodat "Beantwoorden" meteen goed gaat.

De AI blijft in het gesprek; er wordt niets gepauzeerd en er komt geen sessie in
het dashboard, alleen events (`marketing.*`) in het logboek.

Verzending loopt via Microsoft Graph, met dezelfde app-registratie als het
dataplatform-dashboard ("Marketing Dashboard"), vanuit de mailbox in
`MS_GRAPH_SENDER`. Die app heeft in Entra géén Graph-rollen; het verzendrecht is
in Exchange alleen voor **marketing@** toegekend. Een andere afzender (getest:
`automation@`) geeft `403 ErrorAccessDenied`. De vier `MS_GRAPH_*`-waarden staan als platte app settings op
zowel `dtg-data-platform-dashboard-weu` als deze App Service: **roteer je het
client secret, werk het dan op beide plekken bij.**

Op de Zipchat-kant heeft de tool twee variabelen: `MARKETING_BRIDGE_URL`
(`https://<deploy>/api/zipchat/marketing`) en `MARKETING_BRIDGE_SECRET` (dezelfde
waarde als `BRIDGE_SHARED_SECRET`).

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
