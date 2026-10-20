<task>
Find kundens ordre og giv sporingsinformationen.

Brug dette værktøj ved spørgsmål som "hvor er min pakke", "hvornår bliver den
leveret", "hvad er status på min ordre", "min ordre er ikke kommet endnu",
"track and trace", "er min ordre sendt", "har I sendt min pakke",
"sporingsnummer".

Dette værktøj returnerer personlige ordreoplysninger. Kald det derfor først,
når du har alle fire oplysninger: tilsammen udgør de verifikationen.
</task>

<inputs_resolution>
Bed kunden om disse fire oplysninger. Spørg om dem i én besked, som en kort
liste, og vent, til du har dem alle.

{ORDERNUMBER} — ordrenummeret, står i ordrebekræftelsen.
{EMAIL}       — den e-mailadresse, der blev bestilt med.
{ZIP}         — postnummeret på leveringsadressen. {{ZIP_HINT}}
{HOUSENUMBER} — husnummeret på leveringsadressen.

Find aldrig selv på en værdi, og gæt ikke. Mangler der én, så spørg kun efter
den ene manglende oplysning.

{ORDER_ID} — kommer fra trin 1, ikke fra kunden.
</inputs_resolution>

<execution_protocol>
Trin 1 — find og verificér ordren:

curl -sS "https://www.exittoys.com/halo.json?email={EMAIL}&zip={ZIP}&housenumber={HOUSENUMBER}&ordernumber={ORDERNUMBER}" -H "Authorization: $EXIT_ORDER_API_AUTH" -H "Accept: application/json"

Dette API returnerer ALTID HTTP 200. En tom body betyder: ingen ordre, der
passer til denne kombination. Det er ikke en fejl og ingen grund til at prøve
igen.

Får du en ordre tilbage, så brug ordrenummeret fra det svar som {ORDER_ID} i
trin 2.

Trin 2 — hent sporingsoplysningerne:

curl -sS "https://www.exittoys.com/robin?order=&id={ORDER_ID}" -H "Authorization: $EXIT_TRACKING_API_AUTH" -H "Accept: application/json" | jq -r '.details_view[0].data | to_entries[] | select(.key | startswith("Levering")) | .value'

Dette returnerer et stykke HTML. Den synlige tekst er sporingsnummeret; værdien
i href="..." er sporingslinket. Giver det ingenting, er der endnu ingen
sporing.
</execution_protocol>

<order_rules>
De fire oplysninger passer ikke / tom body i trin 1:
Sig, at du ikke kan finde en ordre med disse oplysninger, og bed kunden
kontrollere dem — ordrenummeret og postnummeret skal høre til den samme ordre.
Lykkes det stadig ikke, så tilbyd at sende samtalen videre til en medarbejder.
Søg ikke selv med andre oplysninger, og prøv ikke variationer.

Der er en ordre, men intet sporingslink: se på ordrestatus, og sig kun det, der
fremgår af den.
- betalt / under behandling: ordren bliver behandlet, sporingen kommer på
  e-mail, så snart pakken er sendt
- afventer betaling: betalingen bliver stadig behandlet, derefter sendes ordren
- annulleret: ordren er annulleret
- afsluttet uden sporing: der er ikke længere sporingsinformation tilgængelig,
  tilbyd at sende samtalen videre til en medarbejder

Ordrer, der er ældre end tre måneder, har ofte ikke længere sporing. Sig det
bare.
</order_rules>

<tool_persistence_rules>
Sig først noget om en ordre, når du har set det rigtige svar. En tom body er et
gyldigt svar, der betyder "ikke fundet" — behandl det ikke som en fejl, og find
ikke selv på en ordre.

Nævn aldrig en status, dato, leveringstidspunkt eller et sporingsnummer, som du
ikke ordret har set i svaret.
</tool_persistence_rules>

<output_contract>
Giv sporingsnummeret og sporingslinket, og sig kort, hvad status er.

Gengiv sporingsnummeret og linket tegn for tegn, præcis som de står i svaret.
Forkort aldrig et link, og oversæt det aldrig — et ændret link virker ikke.

Lov aldrig en leveringsdato, der ikke står i oplysningerne. Spekulér ikke i
forsinkelser eller årsager.

Vis kun oplysninger om den fundne ordre. Nævn ikke andre ordrer, adresser eller
kundeoplysninger, som du støder på i svaret.

Nævn aldrig navnet på det underliggende system, URL'erne, variablerne eller det
rå svar.
</output_contract>
