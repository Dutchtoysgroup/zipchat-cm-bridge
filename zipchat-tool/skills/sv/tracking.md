<task>
Slå upp kundens beställning och ge spårningsinformationen.

Använd det här verktyget vid frågor som "var är mitt paket", "när levereras
det", "vad är status på min beställning", "min beställning har inte kommit än",
"spårningsnummer", "spåra min order", "har min beställning skickats".

Det här verktyget returnerar personliga beställningsuppgifter. Anropa det därför
först när du har alla fyra uppgifterna: tillsammans utgör de verifieringen.
</task>

<inputs_resolution>
Be kunden om de här fyra uppgifterna. Fråga efter dem i ett och samma
meddelande, som en kort lista, och vänta tills du har fått alla.

{ORDERNUMBER} — ordernumret, står i orderbekräftelsen.
{EMAIL}       — e-postadressen som beställningen gjordes med.
{ZIP}         — postnumret i leveransadressen. {{ZIP_HINT}}
{HOUSENUMBER} — gatunumret (husnumret) i leveransadressen.

Hitta aldrig själv på ett värde och gissa inte. Saknas en uppgift, fråga bara
efter just den uppgiften.

{ORDER_ID} — kommer från steg 1, inte från kunden.
</inputs_resolution>

<execution_protocol>
Steg 1 — sök och verifiera beställningen:

curl -sS "https://www.exittoys.com/halo.json?email={EMAIL}&zip={ZIP}&housenumber={HOUSENUMBER}&ordernumber={ORDERNUMBER}" -H "Authorization: $EXIT_ORDER_API_AUTH" -H "Accept: application/json"

Detta API svarar ALLTID med HTTP 200. En tom body betyder: ingen beställning som
matchar den här kombinationen. Det är inget fel och ingen anledning att försöka
igen.

Får du tillbaka en beställning, använd då ordernumret från det svaret som
{ORDER_ID} i steg 2.

Steg 2 — hämta spårningsuppgifterna:

curl -sS "https://www.exittoys.com/robin?order=&id={ORDER_ID}" -H "Authorization: $EXIT_TRACKING_API_AUTH" -H "Accept: application/json" | jq -r '.details_view[0].data | to_entries[] | select(.key | startswith("Levering")) | .value'

Detta returnerar en bit HTML. Den synliga texten är spårningsnumret; värdet i
href="..." är spårningslänken. Ger detta ingenting, finns det ingen spårning
ännu.
</execution_protocol>

<order_rules>
De fyra uppgifterna stämmer inte / tom body i steg 1:
Säg att du inte hittar någon beställning med de här uppgifterna och be kunden
kontrollera dem — ordernumret och postnumret måste höra till samma beställning.
Lyckas det fortfarande inte, erbjud att koppla vidare till en medarbetare. Sök
inte själv med andra uppgifter och prova inga varianter.

En beställning finns, men ingen spårningslänk: titta på orderstatusen och säg
bara det som framgår av den.
- betald / under behandling: beställningen behandlas, spårningen kommer
  via e-post så snart paketet har skickats
- väntar på betalning: betalningen behandlas fortfarande, därefter skickas
  beställningen
- avbruten: beställningen har avbrutits
- avslutad utan spårning: det finns ingen spårningsinformation längre,
  erbjud att koppla vidare till en medarbetare

Beställningar som är äldre än tre månader har ofta ingen spårning längre. Säg
det rakt ut.
</order_rules>

<tool_persistence_rules>
Säg ingenting om en beställning förrän du har sett det faktiska svaret. En tom
body är ett giltigt svar som betyder "hittades inte" — behandla det inte som ett
fel och hitta inte på någon beställning.

Nämn aldrig en status, ett datum, en leveranstid eller ett spårningsnummer som
du inte ordagrant har sett i svaret.
</tool_persistence_rules>

<output_contract>
Ge spårningsnumret och spårningslänken, och säg kort vad statusen är.

Återge spårningsnumret och länken tecken för tecken exakt som de står i svaret.
Korta aldrig en länk och översätt den aldrig — en ändrad länk fungerar inte.

Lova aldrig ett leveransdatum som inte står i uppgifterna. Spekulera inte om
förseningar eller orsaker.

Visa bara uppgifter om den beställning som hittades. Nämn inga andra
beställningar, adresser eller kunduppgifter som du ser i svaret.

Nämn aldrig namnet på det underliggande systemet, URL:erna, variablerna eller
det råa svaret.
</output_contract>
