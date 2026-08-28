# Zipchat ↔ CM Mobile Service Cloud bridge

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
minuut door met een interval van 5 seconden.

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
| Hand Over Endpoint › Add header | dezelfde `X-Bridge-Token` |

Na opslaan krijg je de adapter-URL in de vorm
`https://api.conversational.cm.com/conversational/twoway/v2/accounts/{technicalLinkId}/adapters/{adapterId}`.
Die twee id's vullen `CM_ACCOUNT_ID` en `CM_ADAPTER_ID`.

Verder nodig:

- een routingregel die naar **Agent Inbox** gaat; het `stateNameId` daarvan
  invullen als `CM_AGENT_STATE_NAME_ID`;
- een **product token** met recht `ConversationalRouter.RouterSession_Update`.

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

## Nog te verifiëren tegen de live API

Deze punten volgen uit de documentatie maar zijn nog niet tegen een echte
omgeving getest. Het logboek in het dashboard toont de ruwe respons, dus een
afwijking is snel te zien en te corrigeren:

- de exacte `$type`-waarde voor tekstberichten in TwoWay (nu `"Text"`);
- de kanaalnaam die CM verwacht voor een custom webchat-kanaal (`CM_CHANNEL`);
- of `chat.id` zelf aangeleverd mag worden, of dat CM 'm oplegt;
- of `CM_LOGICAL_ACCOUNT_ID` gelijk is aan het technicalLinkId.

## Bekende beperking

Zipchat biedt geen endpoint om een binnenkomend bericht dóór de AI te laten
beantwoorden. Daarom kan e-mail die bij CM binnenkomt niet door Zipchat worden
afgehandeld. Wil je AI op e-mail, gebruik dan Zipchat's eigen e-mailkanaal als
voordeur; de escalatie hierboven werkt daar identiek.
