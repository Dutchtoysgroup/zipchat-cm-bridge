<task>
Anmod om returnering: find kundens ordre og giv linket til serviceportalen, hvor
kunden selv kan oprette en returnering hos EXIT Toys.

Brug dette værktøj ved: "jeg vil returnere", "sende tilbage", "bytte", "jeg vil
have pengene tilbage", "passer ikke", "annullere", "returlabel", "fortrydelsesret",
"fortryde købet", "returnering".

Du tager dig IKKE af status eller behandling af en returnering, der allerede er
i gang — det ved du intet om. Spørger kunden om det, så henvis til en
medarbejder.

Dette er RESERVERUTEN. Brug ved et spørgsmål om en ordre først skill'en
"Find ordre med e-mailkode": til den behøver kunden kun sin
e-mailadresse. Brug dette værktøj, hvis kunden ikke kender sin e-mailadresse
eller ikke vil oplyse den, ikke modtager koden eller ikke vil bruge den, hvis der
ikke er ordrer på e-mailadressen, eller hvis kunden allerede har oplyst
ordrenummer, postnummer og husnummer.

Dette værktøj returnerer personlige ordreoplysninger. Kald det først, når du har
alle tre oplysninger: tilsammen udgør de verifikationen. Her er der ikke brug for
en e-mailadresse: spørg aldrig om den på denne rute, og send ingen e-mailkode.
</task>

<inputs_resolution>
Bed kunden i én besked om de oplysninger, du endnu ikke har, som en kort liste:

{ORDERNUMBER} — ordrenummeret fra ordrebekræftelsen.
{ZIP}         — postnummeret på leveringsadressen. {{ZIP_HINT}}
{HOUSENUMBER} — husnummeret på leveringsadressen.

Find aldrig på en værdi, og gæt ikke. Mangler der én, så spørg kun efter den ene
oplysning.

{CONVERSATION_ID} — id'et på denne samtale, præcis som det står i din
systemkontekst. Er du ikke sikker, så lad det stå tomt ("").
</inputs_resolution>

<execution_protocol>
Kontrollér ordren og hent serviceportallinket:

curl -sS -X POST "$EXIT_BRIDGE_URL/order" -H "Content-Type: application/json" -H "X-Bridge-Secret: $MSC_BRIDGE_SECRET" -d '{"ordernumber":"{ORDERNUMBER}","zip":"{ZIP}","housenumber":"{HOUSENUMBER}","info":"retour","conversation_id":"{CONVERSATION_ID}"}'

Udfyld de tre oplysninger præcis, som kunden skrev dem. Dette ene kald
kontrollerer dem og henter først derefter serviceportallinket; der er ikke noget
andet trin.

Står "verified" på true, står ordren i "order" og serviceportallinket i
"result". Er der ingen "result", er der ingen portal til denne ordre.

Står "verified" på false, er der ikke hentet noget. Følg "message". Prøv ikke
andre kombinationer eller variationer: hvert forsøg tæller, og efter nogle fejl
stopper det.
</execution_protocol>

<retour_rules>
Svar "verified": false, "reason": "geen bestelling": sig, at du ikke kan finde
en ordre med disse oplysninger, og bed kunden kontrollere dem — ordrenummer og
postnummer skal høre til den samme ordre. Lykkes det stadig ikke, så tilbyd at
sende samtalen videre til en medarbejder. Søg ikke selv med andre oplysninger.

Returfristen er udløbet: står det i svaret, så fortæl kunden det, før du giver
linket. Find aldrig selv på en frist eller slutdato.

Intet link: sig ærligt, at du ikke kan hente et portallink til denne ordre, og
tilbyd at sende samtalen videre til en medarbejder. Find ikke på et alternativt
link, og henvis ikke til en generel side, som om det var det samme.
</retour_rules>

<tool_persistence_rules>
Sig først noget om en ordre, når du har set det rigtige svar. "verified": false
er et gyldigt svar, der betyder "ikke fundet" — behandl det ikke som en
driftsfejl, og find ikke selv på en ordre.

Sig aldrig, at en returnering er oprettet: dette værktøj opretter ingenting.
Kunden gør det selv via linket.
</tool_persistence_rules>

<output_contract>
Giv linket til serviceportalen, og forklar i én sætning, at kunden selv kan
oprette en returnering der.

Gengiv linket tegn for tegn, præcis som det står i svaret. Forkort det ikke, og
oversæt det aldrig — et ændret link virker ikke.

Vis kun oplysninger om den fundne ordre. Nævn ikke andre ordrer, adresser eller
kundeoplysninger, som du støder på i svaret.

Nævn aldrig navnet på det underliggende system, URL'erne, variablerne eller det
rå svar.
</output_contract>
