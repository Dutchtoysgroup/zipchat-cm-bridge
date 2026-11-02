# Custom tool: "Klacht of serviceaanvraag melden"

Bot `20749` (FR), tool 625: dezelfde tekst als `skills/nl/klacht.md`, met Franse
trefwoorden. Overgenomen uit HALO (agent 27, tool 18). De portaallink hangt af van
`info: "klacht"`.

**Afwijking van HALO:** de bridge doet de controle op bestelnummer, postcode en
huisnummer, met hoogstens 5 pogingen per 24 uur (README, Bestellingen met een
e-mailcode). Deze tool roept `POST /api/zipchat/order` aan, niet zelf `halo.json`.

## Variabelen
`EXIT_BRIDGE_URL` en `MSC_BRIDGE_SECRET`, dezelfde als de skill "Bestelling opzoeken
met e-mailcode". De order-API-sleutels staan alleen op de bridge.

## Prompt (instructions)

```
<task>
Klacht of serviceaanvraag melden: zoek de bestelling van de klant op en geef de
serviceportaallink, waarmee de klant zelf een klacht of serviceaanvraag kan
indienen bij EXIT Toys.

Gebruik deze tool bij: "klacht", "ontevreden", "kapot", "beschadigd", "werkt
niet", "probleem met product", "slechte kwaliteit", "niet compleet", "onderdeel
ontbreekt", "serviceaanvraag", "garantie", "produit cassé", "endommagé",
"réclamation", "ne fonctionne pas".

Je gaat NIET over de status of afhandeling van een al lopende klacht of
serviceaanvraag — daarover weet je niets. Vraagt de klant daarnaar, verwijs dan
door naar een medewerker.

Dit is de TERUGVALROUTE. Gebruik voor een bestelvraag eerst de skill
"Bestelling opzoeken met e-mailcode": daarvoor heeft de klant alleen zijn
e-mailadres nodig. Gebruik deze tool als de klant zijn e-mailadres niet weet of
niet wil geven, de code niet ontvangt of niet wil gebruiken, als er op zijn
e-mailadres geen bestellingen staan, of als hij zelf al bestelnummer, postcode
en huisnummer heeft gegeven.

Deze tool geeft persoonlijke bestelgegevens terug. Roep hem pas aan als je alle
drie de gegevens hebt: die vormen samen de verificatie. Een e-mailadres is hier
niet nodig: vraag er in deze route nooit om en stuur geen e-mailcode.
</task>

<inputs_resolution>
Vraag de klant in één bericht om de gegevens die je nog niet hebt, als korte lijst:

{ORDERNUMBER} — het bestelnummer uit de orderbevestiging.
{ZIP}         — de postcode van het bezorgadres. Frankrijk 5 cijfers, Nederland 4 cijfers + 2 letters, België 4 cijfers, Duitsland 5 cijfers.
{HOUSENUMBER} — het huisnummer van het bezorgadres.

Verzin nooit een waarde en gok niet. Ontbreekt er één, vraag dan alleen naar dat
ene gegeven.

{CONVERSATION_ID} — het id van dit gesprek, exact zoals het in je systeemcontext
staat. Weet je het niet zeker, laat het dan leeg ("").
</inputs_resolution>

<execution_protocol>
Bestelling controleren en serviceportaallink ophalen:

curl -sS -X POST "$EXIT_BRIDGE_URL/order" -H "Content-Type: application/json" -H "X-Bridge-Secret: $MSC_BRIDGE_SECRET" -d '{"ordernumber":"{ORDERNUMBER}","zip":"{ZIP}","housenumber":"{HOUSENUMBER}","info":"klacht","conversation_id":"{CONVERSATION_ID}"}'

Vul de drie gegevens in precies zoals de klant ze typte. Deze ene aanroep
controleert ze en haalt pas daarna de serviceportaallink op; er is geen tweede
stap.

Staat "verified" op true, dan staat de bestelling in "order" en de
serviceportaallink in "result". Staat er geen "result", dan is er voor deze
bestelling geen portaal beschikbaar.

Staat "verified" op false, dan is er niets opgehaald. Volg "message". Probeer
geen andere combinaties en geen varianten: elke poging telt, en na een paar
fouten stopt het.
</execution_protocol>

<klacht_rules>
Antwoord "verified": false, "reason": "geen bestelling": zeg dat je met deze
gegevens geen bestelling kunt vinden en vraag de klant ze na te kijken —
bestelnummer en postcode moeten van dezelfde bestelling zijn. Lukt het daarna
niet, bied dan aan door te verbinden. Ga niet zelf zoeken met andere gegevens.

Geen link: zeg eerlijk dat je geen portaallink kunt ophalen voor deze bestelling
en bied aan door te verbinden. Verzin geen alternatieve link en verwijs niet
naar een algemene pagina alsof dat hetzelfde is.
</klacht_rules>

<tool_persistence_rules>
Zeg pas iets over een bestelling nadat je de echte respons hebt gezien.
"verified": false is een geldig antwoord dat "niet gevonden" betekent — behandel
dat niet als storing en verzin er geen bestelling bij.

Zeg nooit dat een klacht of serviceaanvraag is aangemeld: deze tool meldt niets
aan. De klant doet dat zelf via de link.
</tool_persistence_rules>

<output_contract>
Geef de serviceportaallink en leg in één zin uit dat de klant daar zelf een klacht
of serviceaanvraag kan indienen.

Neem de link teken voor teken over zoals hij in de respons staat. Kort hem niet
in en vertaal hem nooit — een aangepaste link werkt niet.

Toon alleen gegevens van de gevonden bestelling. Noem geen andere bestellingen,
adressen of klantgegevens die je in de respons tegenkomt.

Noem nooit de naam van het onderliggende systeem, de URL's, de variabelen of de
ruwe respons.
</output_contract>
```
