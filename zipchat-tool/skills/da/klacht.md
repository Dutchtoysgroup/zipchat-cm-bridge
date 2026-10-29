<task>
Indgiv en klage eller serviceanmodning: find kundens ordre og giv linket til
serviceportalen, hvor kunden selv kan indgive en klage eller serviceanmodning
hos EXIT Toys.

Brug dette værktøj ved: "klage", "utilfreds", "i stykker", "gået i stykker",
"beskadiget", "virker ikke", "problem med produktet", "dårlig kvalitet", "ikke
komplet", "der mangler en del", "reklamation", "serviceanmodning", "garanti".

Du tager dig IKKE af status eller behandling af en klage eller serviceanmodning,
der allerede er i gang — det ved du intet om. Spørger kunden om det, så henvis
til en medarbejder.

Dette er RESERVERUTEN. Brug ved et spørgsmål om en ordre først skill'en
"Find ordre med e-mailkode": til den har kunden kun brug for sin
e-mailadresse. Brug først dette værktøj, hvis kunden ikke modtager koden eller
ikke vil bruge den, eller hvis der ikke er nogen ordrer på kundens
e-mailadresse.

Dette værktøj returnerer personlige ordreoplysninger. Kald det først, når du har
alle fire oplysninger: tilsammen udgør de verifikationen.
</task>

<inputs_resolution>
Bed kunden i én besked om disse fire oplysninger, som en kort liste:

{ORDERNUMBER} — ordrenummeret fra ordrebekræftelsen.
{EMAIL}       — den e-mailadresse, der blev bestilt med.
{ZIP}         — postnummeret på leveringsadressen. {{ZIP_HINT}}
{HOUSENUMBER} — husnummeret på leveringsadressen.

Find aldrig på en værdi, og gæt ikke. Mangler der én, så spørg kun efter den ene
oplysning.

{ORDER_ID} — kommer fra trin 1, ikke fra kunden.
</inputs_resolution>

<execution_protocol>
Trin 1 — find og verificér ordren:

curl -sS "https://www.exittoys.com/halo.json?email={EMAIL}&zip={ZIP}&housenumber={HOUSENUMBER}&ordernumber={ORDERNUMBER}" -H "Authorization: $EXIT_ORDER_API_AUTH" -H "Accept: application/json"

Dette API returnerer ALTID HTTP 200. En tom body betyder: ingen ordre med denne
kombination. Det er ikke en fejl og ingen grund til at prøve igen.

Trin 2 — hent linket til serviceportalen med det fundne ordrenummer:

curl -sS "https://www.exittoys.com/halo.json?email={EMAIL}&orderid={ORDER_ID}&agent=klacht" -H "Authorization: $EXIT_ORDER_API_AUTH" -H "Accept: application/json"

Linket til serviceportalen står i svaret. Kommer der intet link tilbage, er der
ingen portal tilgængelig for denne ordre.
</execution_protocol>

<klacht_rules>
Tom body i trin 1: sig, at du ikke kan finde en ordre med disse oplysninger, og
bed kunden kontrollere dem — ordrenummer og postnummer skal høre til den samme
ordre. Lykkes det stadig ikke, så tilbyd at sende samtalen videre til en
medarbejder. Søg ikke selv med andre oplysninger.

Intet link i trin 2: sig ærligt, at du ikke kan hente et portallink til denne
ordre, og tilbyd at sende samtalen videre til en medarbejder. Find ikke på et
alternativt link, og henvis ikke til en generel side, som om det var det samme.
</klacht_rules>

<tool_persistence_rules>
Sig først noget om en ordre, når du har set det rigtige svar. En tom body er et
gyldigt svar, der betyder "ikke fundet" — behandl det ikke som en fejl, og find
ikke selv på en ordre.

Sig aldrig, at en klage eller serviceanmodning er indgivet: dette værktøj
indgiver ingenting. Kunden gør det selv via linket.
</tool_persistence_rules>

<output_contract>
Giv linket til serviceportalen, og forklar i én sætning, at kunden selv kan
indgive en klage eller serviceanmodning der.

Gengiv linket tegn for tegn, præcis som det står i svaret. Forkort det ikke, og
oversæt det aldrig — et ændret link virker ikke.

Vis kun oplysninger om den fundne ordre. Nævn ikke andre ordrer, adresser eller
kundeoplysninger, som du støder på i svaret.

Nævn aldrig navnet på det underliggende system, URL'erne, variablerne eller det
rå svar.
</output_contract>
