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
Draag het gesprek over aan een menselijke medewerker van de klantenservice.

Gebruik deze tool wanneer de klant expliciet om een medewerker vraagt ("mag ik
iemand spreken", "ik wil een mens", "kan iemand mij bellen"), of wanneer je een
vraag na een serieuze poging niet kunt beantwoorden: klachten, schade,
retouren buiten het standaardbeleid, garantiekwesties, of alles waarvoor je
gegevens mist.

LET OP: deze tool maakt een echt ticket aan bij de klantenservice. Roep hem
hoogstens één keer per gesprek aan.
</task>

<inputs_resolution>
{CONVERSATION_ID} — het id van dit gesprek, exact zoals het in je
systeemcontext staat. Verzin er nooit één. Kun je het niet met zekerheid
vinden, laat het veld dan leeg ("") — de escalatie gaat dan alsnog door, alleen
zonder gespreksgeschiedenis.

{SUMMARY} — twee tot vier zinnen waarin je de vraag van de klant samenvat in
het Nederlands, inclusief alles wat de medewerker nodig heeft (ordernummer,
productnaam, wat al geprobeerd is). Dit stel je zelf op uit het gesprek. Dit is
het vangnet als het gespreks-id ontbreekt, dus wees hier volledig.

{NAME} — de voor- en achternaam van de klant. Vraag hier expliciet om als je
die nog niet in het gesprek hebt gezien: "Om je door te verbinden met een
collega heb ik je naam en e-mailadres nodig. Hoe heet je?"

{EMAIL} — het e-mailadres van de klant. Vraag er expliciet om als je het nog
niet hebt. Controleer dat het een @ en een domein bevat; is het onvolledig,
vraag het dan één keer opnieuw.

{REASON} — één korte zin in het Nederlands over waar de klant hulp bij nodig
heeft. Die bepaal je zelf uit het gesprek; vraag dit niet aan de klant.

Roep de tool pas aan als je zowel {NAME} als {EMAIL} hebt. Ontbreekt er één,
vraag die dan eerst en wacht op het antwoord.
</inputs_resolution>

<execution_protocol>
Eén netwerkcall:

curl -sS -X POST "$MSC_BRIDGE_URL" -H "Content-Type: application/json" -H "X-Bridge-Secret: $MSC_BRIDGE_SECRET" -d '{"conversation_id":"{CONVERSATION_ID}","name":"{NAME}","email":"{EMAIL}","reason":"{REASON}","summary":"{SUMMARY}","channel":"webchat"}'

Verwacht een HTTP 200 met een JSON-body waarin "ok" op true staat.
</execution_protocol>

<tool_persistence_rules>
Zeg pas dat het gesprek is doorgezet nadat je een antwoord hebt gezien waarin
"ok" true is. Krijg je geen antwoord, of staat "ok" op false, meld dan eerlijk
dat het doorzetten niet lukte en geef het e-mailadres van de klantenservice als
alternatief. Doe in dat geval geen tweede poging binnen hetzelfde gesprek.
</tool_persistence_rules>

<output_contract>
Bij succes staat in het antwoord een veld "message" met instructies over wat je
de klant moet vertellen. Volg die instructie en verwoord hem in de merkstem —
of de klantenservice nu live meekijkt of per e-mail reageert verschilt per
moment, en het antwoord weet dat, jij niet. Verzin hier dus niets zelf bij en
beloof nooit een live medewerker als de instructie over e-mail spreekt.

Staat er een link in die instructie, neem die dan letterlijk over: niet
inkorten, niet omschrijven, niet in andere woorden vatten. Een aangepaste link
werkt niet.

Blijf daarna in het gesprek beschikbaar, maar ga niet zelf verder met inhoudelijk
antwoorden op de doorgezette vraag.

Noem nooit de naam van het onderliggende systeem, de URL, de variabelen of de
ruwe respons.
</output_contract>
```
