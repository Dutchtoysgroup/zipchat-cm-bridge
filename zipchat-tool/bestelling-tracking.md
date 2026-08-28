# Custom tool: "Bestelling en tracking opzoeken"

Overgenomen uit HALO (agent 194 "Sven Pakketagent", tools 17 en 26).

**Bewust afgeweken van HALO:** HALO heeft ook een tool die orders opzoekt op
alléén een e-mailadres, afgeschermd met een OTP-code per mail. Zipchat kent geen
OTP, dus die variant is niet overgenomen — zonder verificatie zou iedereen met
een willekeurig e-mailadres andermans bestelgegevens kunnen opvragen. Deze tool
eist ordernummer, e-mail, postcode én huisnummer samen: een echte bezitscontrole.

## Variabelen
| Naam | Waarde |
|---|---|
| `EXIT_ORDER_API_AUTH` | `dicode 3gtKiIyxJOUBjgkHZgjz` |
| `EXIT_TRACKING_API_AUTH` | `dicode a0FZWXBSejI6blNMNkhEQ0xRNg==` |

## Prompt (instructions)

```
<task>
Zoek de bestelling van de klant op en geef de trackinginformatie.

Gebruik deze tool bij vragen als "waar is mijn pakket", "wanneer wordt het
bezorgd", "wat is de status van mijn bestelling", "où est ma commande",
"suivi de commande", "mijn bestelling is nog niet aangekomen".

Deze tool geeft persoonlijke bestelgegevens terug. Roep hem daarom pas aan als
je alle vier de gegevens hebt: die vormen samen de verificatie.
</task>

<inputs_resolution>
Vraag de klant om deze vier gegevens. Vraag ze in één bericht, als korte lijst,
en wacht tot je ze allemaal hebt.

{ORDERNUMBER} — het bestelnummer, staat in de orderbevestiging.
{EMAIL}       — het e-mailadres waarmee besteld is.
{ZIP}         — de postcode van het bezorgadres. Frankrijk 5 cijfers,
                Nederland 4 cijfers + 2 letters, België 4 cijfers,
                Duitsland 5 cijfers.
{HOUSENUMBER} — het huisnummer van het bezorgadres.

Verzin nooit zelf een waarde en gok niet. Ontbreekt er één, vraag dan alleen
naar dat ene ontbrekende gegeven.

{ORDER_ID} — komt uit stap 1, niet van de klant.
</inputs_resolution>

<execution_protocol>
Stap 1 — bestelling zoeken en verifiëren:

curl -sS "https://www.exittoys.com/halo.json?email={EMAIL}&zip={ZIP}&housenumber={HOUSENUMBER}&ordernumber={ORDERNUMBER}" -H "Authorization: $EXIT_ORDER_API_AUTH" -H "Accept: application/json"

Deze API geeft ALTIJD HTTP 200. Een lege body betekent: geen bestelling die bij
deze combinatie hoort. Dat is geen storing en geen reden om opnieuw te proberen.

Krijg je een bestelling terug, gebruik dan het ordernummer uit dat antwoord als
{ORDER_ID} voor stap 2.

Stap 2 — trackinggegevens ophalen:

curl -sS "https://www.exittoys.com/robin?order=&id={ORDER_ID}" -H "Authorization: $EXIT_TRACKING_API_AUTH" -H "Accept: application/json" | jq -r '.details_view[0].data | to_entries[] | select(.key | startswith("Levering")) | .value'

Dit geeft een stukje HTML terug. De zichtbare tekst is het trackingnummer; de
waarde in href="..." is de trackinglink. Levert dit niets op, dan is er nog geen
tracking.
</execution_protocol>

<order_rules>
Vier gegevens kloppen niet / lege body in stap 1:
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
Zeg pas iets over een bestelling nadat je de echte respons hebt gezien. Een lege
body is een geldig antwoord dat "niet gevonden" betekent — behandel dat niet als
fout en verzin er geen bestelling bij.

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
```
