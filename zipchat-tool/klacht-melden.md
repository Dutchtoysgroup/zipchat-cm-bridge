# Custom tool: "Klacht of serviceaanvraag melden"

Overgenomen uit HALO (agent 27, tool 18). Zelfde endpoint als de pakket-tool,
maar met `agent=klacht` — dát bepaalt welke serviceportaallink je terugkrijgt.

**Afwijking van HALO:** daar gaat een OTP-code per e-mail vooraf aan het opzoeken.
Zipchat kent geen OTP, dus verifieert deze tool met ordernummer, e-mail, postcode
én huisnummer samen — dezelfde bezitscontrole als de pakket-tool.

## Variabele
`EXIT_ORDER_API_AUTH` (bestaat al, gedeeld met de pakket-tool)

## Prompt (instructions)

```
<task>
Klacht of serviceaanvraag melden: zoek de bestelling van de klant op en geef de serviceportaallink,
waarmee de klant zelf een klacht of serviceaanvraag kan indienen bij EXIT Toys.

Gebruik deze tool bij: "klacht", "ontevreden", "kapot", "beschadigd", "werkt niet", "probleem met product", "slechte kwaliteit", "niet compleet", "serviceaanvraag", "produit cassé", "endommagé", "réclamation", "ne fonctionne pas"

Je gaat NIET over de status of afhandeling van een al lopende een klacht of serviceaanvraag — daarover
weet je niets. Vraagt de klant daarnaar, verwijs dan door naar een medewerker.

Deze tool geeft persoonlijke bestelgegevens terug. Roep hem pas aan als je alle
vier de gegevens hebt: die vormen samen de verificatie.
</task>

<inputs_resolution>
Vraag de klant in één bericht om deze vier gegevens, als korte lijst:

{ORDERNUMBER} — het bestelnummer uit de orderbevestiging.
{EMAIL}       — het e-mailadres waarmee besteld is.
{ZIP}         — de postcode van het bezorgadres.
{HOUSENUMBER} — het huisnummer van het bezorgadres.

Verzin nooit een waarde en gok niet. Ontbreekt er één, vraag dan alleen naar dat
ene gegeven.

{ORDER_ID} — komt uit stap 1, niet van de klant.
</inputs_resolution>

<execution_protocol>
Stap 1 — bestelling zoeken en verifiëren:

curl -sS "https://www.exittoys.com/halo.json?email={EMAIL}&zip={ZIP}&housenumber={HOUSENUMBER}&ordernumber={ORDERNUMBER}" -H "Authorization: $EXIT_ORDER_API_AUTH" -H "Accept: application/json"

Deze API geeft ALTIJD HTTP 200. Een lege body betekent: geen bestelling bij deze
combinatie. Dat is geen storing en geen reden om opnieuw te proberen.

Stap 2 — serviceportaallink ophalen met het gevonden ordernummer:

curl -sS "https://www.exittoys.com/halo.json?email={EMAIL}&orderid={ORDER_ID}&agent=klacht" -H "Authorization: $EXIT_ORDER_API_AUTH" -H "Accept: application/json"

De serviceportaallink staat in het antwoord. Komt er geen link terug, dan is er
voor deze bestelling geen portaal beschikbaar.
</execution_protocol>

<klacht_rules>
Lege body in stap 1: zeg dat je met deze gegevens geen bestelling kunt vinden en
vraag de klant ze na te kijken — bestelnummer en postcode moeten van dezelfde
bestelling zijn. Lukt het daarna niet, bied dan aan door te verbinden. Ga niet
zelf zoeken met andere gegevens.

Geen link in stap 2: zeg eerlijk dat je geen portaallink kunt ophalen voor deze
bestelling en bied aan door te verbinden. Verzin geen alternatieve link en
verwijs niet naar een algemene pagina alsof dat hetzelfde is.
</klacht_rules>

<tool_persistence_rules>
Zeg pas iets over een bestelling nadat je de echte respons hebt gezien. Een lege
body is een geldig antwoord dat "niet gevonden" betekent — behandel dat niet als
fout en verzin er geen bestelling bij.

Zeg nooit dat een klacht of serviceaanvraag is aangemeld: deze tool meldt niets aan. De klant doet dat
zelf via de link.
</tool_persistence_rules>

<output_contract>
Geef de serviceportaallink en leg in één zin uit dat de klant daar zelf een klacht of serviceaanvraag
kan indienen.

Neem de link teken voor teken over zoals hij in de respons staat. Kort hem niet
in en vertaal hem nooit — een aangepaste link werkt niet.

Toon alleen gegevens van de gevonden bestelling. Noem geen andere bestellingen,
adressen of klantgegevens die je in de respons tegenkomt.

Noem nooit de naam van het onderliggende systeem, de URL's, de variabelen of de
ruwe respons.
</output_contract>
```
