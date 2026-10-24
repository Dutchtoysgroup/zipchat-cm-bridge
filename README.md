# Zipchat-dashboard (Zipchat ↔ CM Mobile Service Cloud bridge)

Het Zipchat-dashboard van EXIT Toys. Het eerste onderdeel is de bridge die
hieronder staat beschreven: gesprekken die de Zipchat-AI niet zelf afhandelt,
doorzetten naar een medewerker in Mobile Service Cloud. Er komt meer
Zipchat-functionaliteit bij; de zijbalk heeft daarom per onderdeel een kopje
(`src/app/Dashboard.tsx`). De technische namen (repo, App Service, schema
`app_zipchat_bridge`, app `zipchat` in admin) blijven zoals ze zijn.

**Repo:** https://github.com/Dutchtoysgroup/zipchat-cm-bridge — elke push naar
`main` deployt via GitHub Actions (`.github/workflows/deploy-azure.yml`) naar
productie.

**Live:** https://zipchat.dashboard-exit.com — aanmelden via het
platformdashboard (admin.dashboard-exit.com), net als het contractregister. Wie
erin mag, regel je in admin onder Gebruikers & toegang, kolom Zipchat; zie
[Aanmelden en toegang](#aanmelden-en-toegang). Het azurewebsites-adres
(`dtg-zipchat-cm-bridge-weu.azurewebsites.net`) blijft werken voor CM, Zipchat
en de cron; wie daar het dashboard opent, gaat door naar het vaste adres.

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

Sinds 24 oktober 2026 precies zoals HALO (Tobi) het deed. Bij elke doorzetting
vraagt de bridge eerst aan Mobile Service Cloud of er iemand online is (dezelfde
presence-check als HALO):

* **Online → live chat.** Het gesprek gaat via de Conversational Router als chat
  naar Robin, in de webshop **HALO Livechat** (`WebStoreReferrer`, app setting
  `CM_WEBSTORE_REFERRER`, standaard `HALO`), waar ook de chats van Tobi binnenkomen.
  De AI gaat in Zipchat op pauze; de medewerker antwoordt in Robin en dat
  antwoord staat binnen een paar seconden in het chatvenster, als "EXIT Toys
  Klantenservice". Wat de klant daarna typt, gaat via de pollketting naar Robin.
  Loopt de klant weg, dan mailt de medewerker hem vanuit Robin; het e-mailadres
  staat bovenaan het gesprek.
* **Offline → Online-gesprek.** Zoals de offline-overdracht van HALO: een
  Online-gesprek in Robin, precies zoals het contactformulier op de webshops dat
  maakt. De medewerker antwoordt in Robin en **Robin mailt dat antwoord zelf**
  naar de klant, vanuit het adres van de webshop (info@exittoys.nl, .de of .com).
  Een reactie van de klant komt in hetzelfde gesprek terug.

Op het dashboard staat dit onder **Bemensing** op Automatisch; daar kun je ook
altijd live chat of altijd e-mail vastzetten. Zonder Zipchat-gesprek-id kan er
geen live chat zijn (er is geen venster om het antwoord in te zetten); dan wordt
het altijd een Online-gesprek.

Waarom het tussen 20 en 24 oktober alleen per e-mail ging: tot 20 oktober kwamen
antwoorden uit Robin nooit aan, omdat de routerregel Robin → Zipchat bridge
ontbrak en de adapter-endpoints nog naar Vercel wezen. Na die reparatie is de
hele keten los getest: antwoord uit Robin bij de bridge (20 okt), en een bericht
via de Zipchat-API in een echt chatvenster op exittoys.nl (24 okt).

Hieronder de offline-route:

```
Klant ──▶ Zipchat-widget ──▶ AI kan het niet aan
                              │
                              ▼  skill vraagt naam + e-mail
                        POST /api/zipchat/escalate
                              │
                              ▼  src/lib/robin.ts
             contact.robinhq.com: Online-gesprek in de webshop van het land
                              │
                 medewerker antwoordt in Robin
                              │
                              ▼
            Robin mailt het antwoord naar de klant
```

* **Geen gedocumenteerde API.** De bridge doet wat Robins eigen widget doet
  (uitgezocht op 20 okt 2026): `POST /Conversation/Start/` met header `apikey`,
  daarna `AddAutoMessage` met de bevestiging, en een korte SignalR-verbinding
  (`selfServiceHub.connectClient`) die meteen weer sluit. Zonder dat laatste
  denkt Robin dat de klant nog op de site zit en zet hij het antwoord in de
  widget in plaats van in de mail. Ook zo mailt Robin het antwoord pas na
  ongeveer 10 minuten; dat is Robins eigen wachttijd.
* **Webshop per land** via de `Referrer`: Robin koppelt het begin van de URL aan
  een webshop. NL/BE → EXIT Toys Nederland, DE/AT → Duitsland, FR → France,
  ES/IT/PL → Spanje/Italië/Polen, DK/SE/UK/IE → International. De afzender van
  de antwoordmail staat per webshop in Robin.
* **De klant leest mee.** Robin citeert het eerste bericht onder elk antwoord.
  Daarom staat er alleen het gesprek in, geen samenvatting van de assistent.
* **Altijd tekst in Robin.** Geeft de assistent geen of een verkeerd
  gespreks-id mee, dan zoekt de bridge het gesprek op het e-mailadres dat de
  klant in de chat typte (recente gesprekken op die bot, `findConversationByEmail`).
  Pas als dat ook niets oplevert, gaat de samenvatting van de assistent mee als
  "Vraag van de klant", in de taal van de klant (zo vragen de skills het).
* **Termijn.** De bot belooft "binnen 4 werkdagen" (app setting
  `RESPONSE_TIME_TEXT`), net als de bevestiging die Robin stuurt. Pas je die in
  Robin aan, zet dan ook deze setting gelijk.
* **Onderwerp** in de taal van het land (`questionSubject` in `src/lib/shops.ts`).
* **Terugval.** Neemt Robin het gesprek niet aan, of staat
  `ESCALATION_TARGET=cm`, dan gaat het als chat via de Conversational Router en
  mailt de bridge het antwoord zelf via Microsoft Graph (`handleAgentReply`).
  Daarvoor moet de Graph-app op de info@-mailboxen mogen versturen; dat mag hij
  nu niet (alleen marketing@). Automatische teamberichten
  (`CM_SKIP_SENDERS`, standaard `WhatsApp`) gaan dan niet mee.
* De pollketting hieronder draait voor live-chatsessies.

### Pollketting en vangnet

* De pollketting wordt gestart door de gebeurtenis zelf: een escalatie
  (`/api/zipchat/escalate`) en een agentantwoord (`/api/cm/webhook`) trappen
  `/api/poll` af, en elk venster start het volgende zolang er sessies open zijn.
  De latency tijdens een gesprek blijft daarmee ~5 seconden.
* De cron (Logic App, elke 5 minuten) is alleen een **vangnet** voor het geval
  de ketting breekt door een deploy of een fout.
* Een tweede venster kan niet naast een lopende ketting starten: `/api/poll`
  neemt een lease (`bridge_settings.poll_lease`) en gaat anders meteen weg
  (`skipped: busy`). Nemen gebeurt in één statement, zodat twee aanvragen
  tegelijk hem niet allebei krijgen. De lease geldt 30 seconden en het venster
  verlengt hem elke 10 seconden, los van hoe lang een ronde duurt. Aan het eind
  geeft het venster hem vrij (alleen als hij nog van hem is) en pas dán start
  het zijn opvolger; die krijgt dus nooit `busy` van zijn voorganger. Crasht
  een venster, dan is de lease binnen 30 seconden verlopen en pakt de cron het
  op.
* Het dashboard ververst elke 15 seconden en stopt zodra het tabblad naar de
  achtergrond gaat.
* De zelfaanroep gaat naar `BRIDGE_PUBLIC_URL`: achter App Service begint
  `req.url` met `http://`, en een omleiding naar https zou de
  Authorization-header kwijtraken.

`POLL_SELF_CHAIN=false` zet de ketting uit en valt terug op alleen de cron —
verhoog dan de frequentie van de Logic App.

### Geen klantbericht kwijt

Zipchat is zelf de wachtrij: wat nog niet bij CM ligt, haalt de poller de
volgende ronde gewoon opnieuw op. Daarom schuift er pas iets op ná een
bevestigde aflevering, en alleen tot het bericht dat is afgeleverd.

* **Cursor op bericht-id** (`bridge_settings.forward_cursor:<sessie>`). Zipchat
  geeft `created_at` in hele seconden en `message_created_at_since` filtert
  inclusief (nagegaan op 13 oktober 2026); op tijd alleen vallen twee berichten
  uit dezelfde seconde weg. De id's lopen op, dus "id groter dan de cursor" is
  precies wat nieuw is. Bij de escalatie staat de cursor op het laatste bericht
  van het transcript, want dat zit al in het ticket.
* **`last_forwarded_at`** is de Zipchat-tijd van het laatst afgeleverde bericht,
  niet de klok van de bridge. Het is alleen nog de ondergrens voor het ophalen.
* **Mislukt een bericht** (time-out, 429, 5xx, 401/403), dan wacht alles erachter,
  zodat de volgorde bij CM klopt. Die sessie wordt opnieuw geprobeerd na 5 s,
  10 s, 20 s, … tot maximaal 5 minuten tussen pogingen.
* **Opgegeven** (`poll.dropped` in het logboek, met de tekst erbij) wordt een
  bericht alleen als CM het weigert (400, 413, 422) of als het na
  `POLL_IDLE_TIMEOUT_MIN` nog steeds niet gelukt is. Anders zou één onbezorgbaar
  bericht het gesprek erachter blijvend ophouden.
* Afleveren is *at-least-once*: geeft CM een time-out terwijl het bericht wél
  aankwam, dan gaat het een tweede keer. Liever dubbel dan kwijt.

## Aan de praat krijgen

```bash
npm install
cp .env.example .env.local   # vullen; leeg laten mag ook
npm run dev
```

Zonder credentials start de bridge in **mock-modus**: het dashboard en alle
testknoppen werken, maar er gaat niets echt naar CM of Zipchat. Dat kan zonder
geheimen alleen dankzij `BRIDGE_DEV_NO_AUTH=true` uit `.env.example`; zie
[Geheimen](#geheimen). Zodra
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
- **Het dashboard en zijn data-endpoints** vragen een persoonlijke aanmelding
  via admin én toegang in de lijst (`src/middleware.ts`), want daar staan
  klantnamen, e-mailadressen en transcripten in. CM en Zipchat kunnen niet
  aanmelden, vandaar de uitzondering hierboven.

### Aanmelden en toegang

Sinds 20 oktober 2026; daarvoor één gedeeld Basic-auth-wachtwoord.

```
/  zonder sessie → /auth/login → admin.dashboard-exit.com/sso/zipchat/start
   → (aanmelden bij admin, via Marketing) → /auth/callback?ticket=…
   → ticket controleren, eenmalig, toegang? → sessiecookie (8 uur) → /
```

* **Wie erin mag:** de vaste accounts in de app setting `VASTE_TOEGANG`
  (Marketing-account-id's, kommagescheiden; nu Sven), plus wie in admin onder
  Gebruikers & toegang, kolom Zipchat, toegang kreeg. Dat laatste staat in
  `app_zipchat_bridge.toegang` met een log in `toegang_log` (migratie V169 in
  `dtg-data-platform`). De vaste lijst kan niemand vanuit een scherm weghalen;
  zo sluit niemand de laatste buiten.
* **Bij elk verzoek opnieuw gecontroleerd.** Trek je in admin iemands toegang
  in, dan is diens volgende verzoek al geweigerd, ook met een geldige cookie.
  Daarom draait de middleware in Node in plaats van de edge-runtime: hij leest
  de database.
* **Admin beheert, de bridge beslist.** Admin stuurt `toegang.lijst` en
  `toegang.zet` ondertekend naar `POST /platform/manage` (kop
  `X-DTG-Platform`, zie `src/lib/sso.ts`). De bridge toetst zelf of die
  persoon toegang heeft, weigert wijzigingen aan vaste accounts en weigert
  dat je je eigen toegang afneemt.
* **Eén geheim:** `ADMIN_SSO_SECRET` hier is `SSO_ZIPCHAT_SECRET` op admin
  (minstens 32 tekens). Het ondertekent het ticket, de beheeracties en de
  sessiecookie, elk met een eigen voorvoegsel, zodat het een het ander niet is.
  Roteren: op beide App Services tegelijk; iedereen moet daarna opnieuw
  aanmelden.
* **Afmelden** wist alleen de sessie van de bridge; de aanmelding bij admin
  blijft staan.

### Geheimen

Een ontbrekend geheim zet nooit iets open: het endpoint weigert dan elke
aanroep (401), het dashboard geeft 503.

* **Productie start niet** zonder `BRIDGE_SHARED_SECRET` en `CM_WEBHOOK_SECRET`
  (minstens 16 tekens, net als `CRON_SECRET` als die gezet is) en
  `ADMIN_SSO_SECRET` (minstens 32 tekens). `src/instrumentation.ts` controleert dat bij
  het opstarten en stopt het proces met de namen in de log (App Service → Log
  stream). Liever een bridge die niet opkomt dan een die zonder authenticatie
  draait.
* **Lokaal zonder geheimen** kan alleen met `BRIDGE_DEV_NO_AUTH=true` (staat in
  `.env.example`). In een productiebuild is `NODE_ENV` altijd `production` en
  telt die vlag niet.
* `CRON_SECRET` mag leeg blijven; `/api/poll` valt dan terug op
  `BRIDGE_SHARED_SECRET`.

De database draait in **West Europe** (centraal dataplatform): er staan
persoonsgegevens van EU-klanten in.

## Wat er aan de CM-kant moet gebeuren

Maak in de Conversational Router een **TwoWay-adapter** aan en vul het formulier zo:

| Veld | Waarde |
|---|---|
| Name | bijv. `Zipchat bridge` |
| **Is Bot** | **uit** — Zipchat is de bot en staat buiten de router; deze adapter is de kanaalkant |
| Message Endpoint › Url | `https://zipchat.dashboard-exit.com/api/cm/webhook` |
| Message Endpoint › Method | `POST` |
| Message Endpoint › Add header | naam `X-Bridge-Token`, waarde = je `CM_WEBHOOK_SECRET` |
| Hand Over Endpoint › Url | `https://zipchat.dashboard-exit.com/api/cm/handover` |
| Hand Over Endpoint › Body | de standaardwaarde laten staan |
| Hand Over Endpoint › Add header | dezelfde `X-Bridge-Token` |
| Event Endpoint › Url | `https://zipchat.dashboard-exit.com/api/cm/event?token=<CM_WEBHOOK_SECRET>` |

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

### Controleren of CM antwoorden aflevert

Staat in het dashboard "Laatste CM-webhook" op "Geen" terwijl medewerkers in
Robin wel in de chat antwoorden, dan komen die antwoorden niet bij de bridge
en dus ook niet bij de klant. Robin toont ze toch als verzonden. Zo ging het
van 21 september tot 20 oktober 2026: bij de verhuizing naar Azure bleven de
endpoints van de adapter op het oude Vercel-adres staan, dat 404 gaf. Zet na
elke verhuizing of rotatie van `CM_WEBHOOK_SECRET` de drie endpoints hierboven
opnieuw, en kijk daarna of er een `webhook.received` in het logboek verschijnt.

Een antwoord in de chat komt ook in **e-mailmodus** bij de klant: de bridge
neemt het gesprek dan over (AI op pauze) en laat het verder als live chat
lopen.

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

Er is één Zipchat-bot per land, allemaal op dezelfde bridge en dezelfde
CM-adapter. Bovenaan elk ticket staat `Land: DE (exittoys.de)`, zodat in de
gedeelde inbox te zien is wie het oppakt; het dashboard heeft een kolom Land.

| Chat | Webshop | Taal skills | Beheer |
|---|---|---|---|
| `20749` | exittoys.fr | NL-instructies, FR-trefwoorden | met de hand (het origineel) |
| `21984` | exittoys.nl | nl | sync; klantenservice-skills alleen in de websitechat (`chat`), Instagram houdt de influencertool |
| `22036` | exittoys.be | nl | sync |
| `22057` · `22059` | exittoys.dk · .se | da · sv | sync |
| `22060` · `22061` | exittoys.es · .it | es · it | sync |
| `22062` · `22063` | exittoys.co.uk · .ie | en | sync |
| `22064` | exittoys.pl | pl | sync |
| `22066` · `22067` | exittoys.de · .at | de | sync |

**Skills en promptregels komen uit de repo.** Per taal staan de vier
klantenservice-skills (doorzetten, tracking, retour, klacht) en de promptregels
in `zipchat-tool/skills/<taal>/`; per bot staan land, taal, webshop-URL,
contactadres en postcodeformaat in `zipchat-tool/bots.json`. Het script zet ze
op Zipchat:

```bash
node scripts/zipchat-sync.mjs            # proefdraai: laat zien wat er verandert
node scripts/zipchat-sync.mjs --apply    # doorvoeren (--only 22066 voor één bot)
```

Env: `ZIPCHAT_API_TOKEN`, en voor het aanmaken van ontbrekende variabelen
`MSC_BRIDGE_SECRET` (= `BRIDGE_SHARED_SECRET`), `EXIT_ORDER_API_AUTH` en
`EXIT_TRACKING_API_AUTH` (de `dicode …`-headers uit HALO-tools 17 en 26).
Zipchat geeft variabelen nooit terug; een bestaande variabele krijgt alleen een
nieuwe waarde met `--set-variables`. Een wijziging in het dashboard aan een
beheerde skill of aan het blok tussen de `EXIT-regels`-markers in de prompt
wordt bij de volgende sync overschreven: pas de bron aan. De eigen tekst van een
bot boven dat blok blijft van het dashboard.

Wat je moet weten over de skills:

* De doorzet-skill stuurt `chat_id` vast mee. Daarmee haalt de bridge het
  gesprek bij de juiste bot op en komt het antwoord van de medewerker in het
  juiste chatvenster. Zonder `chat_id` valt de bridge terug op
  `ZIPCHAT_CHAT_ID` (FR).
* De samenvatting voor het ticket is altijd Nederlands; het gesprek zelf gaat in
  de taal van de klant mee.
* `NAAM NIET OPGEGEVEN` blijft in elke taal Nederlands: de bridge herkent alleen
  die tekst als bewust ontbrekende naam.
* Kanalen voor een skill: `chat` is de websitechat (niet `web`, dat weigert de
  API), verder `instagram` of `all channels`.

`ZIPCHAT_SENDER_ID` (`31118`, "EXIT Toys Klantenservice") is de
Zipchat-gebruiker waaronder MSC-antwoorden in de widget verschijnen. Die moet lid
zijn van elke bot, anders kan de bridge het gesprek niet overnemen. Controleren:

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
