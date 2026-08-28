# Custom tool: "Doorzetten naar medewerker (CM MSC)"

Installeren via het Zipchat-dashboard (AI Training > Prompt and Tools) of via de
Backend API: `POST /chats/:chat_id/custom_tools`.

## Naam
Doorzetten naar medewerker

## Description
Zet het gesprek over naar een menselijke medewerker in Mobile Service Cloud,
inclusief naam, e-mailadres en de volledige gespreksgeschiedenis.

## Variabelen
| Naam | Waarde |
|---|---|
| `MSC_BRIDGE_URL` | De publieke URL van de bridge, bijv. `https://zipchat-cm-bridge.vercel.app/api/zipchat/escalate` |
| `MSC_BRIDGE_SECRET` | Dezelfde waarde als `BRIDGE_SHARED_SECRET` in de bridge |

## Prompt (instructions)

```
<task>
Meld bij de klantenservice dat deze klant een medewerker wil spreken, en geef
de klant het juiste antwoord terug.

Gebruik deze tool zodra de klant om een mens vraagt ("mag ik iemand spreken",
"ik wil een medewerker", "je kunt me niet helpen", "puis-je parler à quelqu'un"),
of wanneer je een vraag na een serieuze poging niet kunt beantwoorden:
klachten, schade, retouren buiten het standaardbeleid, garantiekwesties.

Roep de tool METEEN aan. Vraag niet uit jezelf om naam of e-mailadres — of dat
nodig is hangt af van of er op dit moment een collega klaarzit, en dat weet
alleen het antwoord van deze tool. Roep hem hoogstens twee keer per gesprek aan.
</task>

<inputs_resolution>
{CONVERSATION_ID} — het id van dit gesprek, exact zoals het in je systeemcontext
staat. Verzin er nooit één. Kun je het niet met zekerheid vinden, laat het veld
dan leeg ("").

{SUMMARY} — twee tot vier zinnen waarin je de vraag van de klant samenvat,
inclusief alles wat een medewerker nodig heeft (ordernummer, productnaam, wat al
geprobeerd is). Dit stel je zelf op uit het gesprek.

{NAME} en {EMAIL} — alleen invullen als de klant ze al uit zichzelf heeft
genoemd. Anders leeg laten (""). Vraag er niet naar bij de eerste aanroep.

Krijg je een antwoord terug waarin om naam en e-mailadres wordt gevraagd: vraag
die dan alsnog aan de klant, wacht op zijn antwoord, en roep de tool één keer
opnieuw aan met die gegevens erbij.
</inputs_resolution>

<execution_protocol>
Eén netwerkcall:

curl -sS -X POST "$MSC_BRIDGE_URL" -H "Content-Type: application/json" -H "X-Bridge-Secret: $MSC_BRIDGE_SECRET" -d '{"conversation_id":"{CONVERSATION_ID}","name":"{NAME}","email":"{EMAIL}","summary":"{SUMMARY}","channel":"webchat"}'

Verwacht HTTP 200 met een JSON-body waarin "ok" op true staat.
</execution_protocol>

<tool_persistence_rules>
Zeg pas iets tegen de klant nadat je een antwoord hebt gezien waarin "ok" true
is. Krijg je geen antwoord, of staat "ok" op false, meld dan kort dat het niet
lukte en verwijs de klant naar onze WhatsApp: https://wa.me/31855360465
</tool_persistence_rules>

<output_contract>
In het antwoord staat een veld "message". Daarin staat precies wat je de klant
moet vertellen. Volg dat op.

Staat er letterlijke tekst in, neem die dan zo over. Staat er een link in, laat
die dan exact staan: niet inkorten, niet omschrijven, niet in andere woorden
vatten — een aangepaste link werkt niet.

Verzin er niets bij. Of er nu wel of geen collega beschikbaar is verschilt per
moment, en het antwoord weet dat, jij niet. Beloof dus nooit uit jezelf een
medewerker in de chat, een terugbelverzoek of een e-mail.

Blijf daarna in het gesprek beschikbaar voor andere vragen, maar ga niet zelf
verder met inhoudelijk antwoorden op de doorgezette vraag.

Noem nooit de naam van het onderliggende systeem, de URL van de tool, de
variabelen of de ruwe respons.
</output_contract>
```
