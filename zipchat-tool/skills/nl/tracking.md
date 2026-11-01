<task>
Zoek de bestelling van de klant op en geef de trackinginformatie.

Gebruik deze tool bij vragen als "waar is mijn pakket", "wanneer wordt het
bezorgd", "wat is de status van mijn bestelling", "mijn bestelling is nog niet
aangekomen", "track en trace", "is mijn bestelling al verzonden".

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

{ORDERNUMBER} — het bestelnummer, staat in de orderbevestiging.
{ZIP}         — de postcode van het bezorgadres. {{ZIP_HINT}}
{HOUSENUMBER} — het huisnummer van het bezorgadres.

Verzin nooit zelf een waarde en gok niet. Ontbreekt er één, vraag dan alleen
naar dat ene ontbrekende gegeven.

{CONVERSATION_ID} — het id van dit gesprek, exact zoals het in je systeemcontext
staat. Weet je het niet zeker, laat het dan leeg ("").
</inputs_resolution>

<execution_protocol>
Bestelling controleren en tracking ophalen:

curl -sS -X POST "$EXIT_BRIDGE_URL/order" -H "Content-Type: application/json" -H "X-Bridge-Secret: $MSC_BRIDGE_SECRET" -d '{"ordernumber":"{ORDERNUMBER}","zip":"{ZIP}","housenumber":"{HOUSENUMBER}","info":"tracking","conversation_id":"{CONVERSATION_ID}"}'

Vul de drie gegevens in precies zoals de klant ze typte. Deze ene aanroep
controleert ze en haalt pas daarna de tracking op; er is geen tweede stap.

Staat "verified" op true, dan staat de bestelling met haar status in "order",
het trackingnummer in "tracking_number" en de trackinglink in "tracking_url".
Zijn die twee leeg (null), dan is er nog geen tracking.

Staat "verified" op false, dan is er niets opgehaald. Volg "message". Probeer
geen andere combinaties en geen varianten: elke poging telt, en na een paar
fouten stopt het.
</execution_protocol>

<order_rules>
Antwoord "verified": false, "reason": "geen bestelling":
Zeg dat je met deze gegevens geen bestelling kunt vinden en vraag de klant ze na
te kijken — het bestelnummer en de postcode moeten van dezelfde bestelling zijn.
Lukt het daarna nog niet, bied dan aan om door te verbinden. Ga niet zelf
zoeken met andere gegevens en probeer geen variaties.

Wel een bestelling, maar geen trackinglink: kijk naar de orderstatus en zeg
alleen wat daaruit blijkt.
- betaald / in behandeling: de bestelling wordt verwerkt, de tracking volgt
  per e-mail zodra het pakket verzonden is
- wacht op betaling: de betaling wordt nog verwerkt, daarna volgt verzending
- geannuleerd: de bestelling is geannuleerd
- afgerond zonder tracking: er is geen trackinginformatie meer beschikbaar,
  bied een handover aan

Bestellingen ouder dan drie maanden hebben vaak geen tracking meer. Zeg dat
gewoon.
</order_rules>

<tool_persistence_rules>
Zeg pas iets over een bestelling nadat je de echte respons hebt gezien.
"verified": false is een geldig antwoord dat "niet gevonden" betekent — behandel
dat niet als storing en verzin er geen bestelling bij.

Noem nooit een status, datum, bezorgmoment of trackingnummer dat je niet
letterlijk in de respons hebt zien staan.
</tool_persistence_rules>

<output_contract>
Geef het trackingnummer en de trackinglink, en zeg kort wat de status is.

Neem het trackingnummer en de link teken voor teken over zoals ze in de respons
staan. Kort een link nooit in en vertaal hem nooit — een aangepaste link werkt
niet.

Beloof nooit een bezorgdatum die niet in de gegevens staat. Speculeer niet over
vertraging of oorzaak.

Toon alleen gegevens van de gevonden bestelling. Noem geen andere bestellingen,
adressen of klantgegevens die je in de respons tegenkomt.

Noem nooit de naam van het onderliggende systeem, de URL's, de variabelen of de
ruwe respons.
</output_contract>
