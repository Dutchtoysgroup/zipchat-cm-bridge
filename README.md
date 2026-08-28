# Zipchat ↔ CM Mobile Service Cloud bridge

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
| `GET /api/poll` | Vercel Cron | klantberichten doorsturen |
| `GET /api/health` | dashboard | configuratie- en statuscheck |
| `GET /api/sessions` · `GET /api/events` | dashboard | data |
| `POST /api/test` | dashboard | testknoppen |

Beveiliging: `/api/zipchat/escalate` verwacht `X-Bridge-Secret`, de CM-webhook
`X-Bridge-Token`, en `/api/poll` het Vercel `CRON_SECRET`. Ontbreekt het
bijbehorende geheim in de omgeving, dan laat de bridge door en waarschuwt het
dashboard erover.

## Wat er aan de CM-kant moet gebeuren

1. In de Conversational Router een **TwoWay-adapter** aanmaken. De URL die je
   terugkrijgt heeft de vorm
   `https://api.conversational.cm.com/conversational/twoway/v2/accounts/{technicalLinkId}/adapters/{adapterId}`
   — die twee id's vullen `CM_ACCOUNT_ID` en `CM_ADAPTER_ID`.
2. Bij die adapter de **webhook-URL** van deze bridge instellen:
   `https://<jouw-deploy>/api/cm/webhook`.
3. Een routingregel die naar **Agent Inbox** gaat; het `stateNameId` daarvan
   invullen als `CM_AGENT_STATE_NAME_ID`.
4. Een **product token** met recht `ConversationalRouter.RouterSession_Update`.

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
