<task>
Slå upp kundens beställning och ge spårningsinformationen.

Använd det här verktyget vid frågor som "var är mitt paket", "när levereras
det", "vad är status på min beställning", "min beställning har inte kommit än",
"spårningsnummer", "spåra min order", "har min beställning skickats".

Det här är RESERVVÄGEN. Använd vid en fråga om en beställning först skillen
"Hitta order med e-postkod": för den behöver kunden bara sin
e-postadress. Använd det här verktyget om kunden inte vet sin e-postadress eller
inte vill uppge den, inte får koden eller inte vill använda den, om det inte
finns några beställningar på e-postadressen, eller om kunden redan har uppgett
ordernummer, postnummer och gatunummer.

Det här verktyget returnerar personliga beställningsuppgifter. Anropa det först
när du har alla tre uppgifterna: tillsammans utgör de verifieringen. Här behövs
ingen e-postadress: fråga aldrig efter den på den här vägen och skicka ingen
e-postkod.
</task>

<inputs_resolution>
Be kunden i ett meddelande om de uppgifter du ännu inte har, som en kort lista:

{ORDERNUMBER} — ordernumret, står i orderbekräftelsen.
{ZIP}         — postnumret i leveransadressen. {{ZIP_HINT}}
{HOUSENUMBER} — gatunumret (husnumret) i leveransadressen.

Hitta aldrig själv på ett värde och gissa inte. Saknas en uppgift, fråga bara
efter just den uppgiften.

{CONVERSATION_ID} — id:t för det här samtalet, exakt som det står i din
systemkontext. Är du inte säker, lämna det tomt ("").
</inputs_resolution>

<execution_protocol>
Kontrollera beställningen och hämta spårningen:

curl -sS -X POST "$EXIT_BRIDGE_URL/order" -H "Content-Type: application/json" -H "X-Bridge-Secret: $MSC_BRIDGE_SECRET" -d '{"ordernumber":"{ORDERNUMBER}","zip":"{ZIP}","housenumber":"{HOUSENUMBER}","info":"tracking","conversation_id":"{CONVERSATION_ID}"}'

Fyll i de tre uppgifterna exakt som kunden skrev dem. Det här enda anropet
kontrollerar dem och hämtar först därefter spårningen; det finns inget andra
steg.

Står "verified" på true finns beställningen och dess status i "order",
spårningsnumret i "tracking_number" och spårningslänken i "tracking_url". Är de
två tomma (null) finns det ingen spårning ännu.

Står "verified" på false har ingenting hämtats. Följ "message". Prova inga andra
kombinationer eller varianter: varje försök räknas, och efter några fel tar det
stopp.
</execution_protocol>

<order_rules>
Svar "verified": false, "reason": "geen bestelling":
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
Säg ingenting om en beställning förrän du har sett det faktiska svaret.
"verified": false är ett giltigt svar som betyder "hittades inte" — behandla det
inte som en störning och hitta inte på någon beställning.

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
