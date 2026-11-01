<task>
Find kundens ordre og giv sporingsinformationen.

Brug dette værktøj ved spørgsmål som "hvor er min pakke", "hvornår bliver den
leveret", "hvad er status på min ordre", "min ordre er ikke kommet endnu",
"track and trace", "er min ordre sendt", "har I sendt min pakke",
"sporingsnummer".

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

{ORDERNUMBER} — ordrenummeret, står i ordrebekræftelsen.
{ZIP}         — postnummeret på leveringsadressen. {{ZIP_HINT}}
{HOUSENUMBER} — husnummeret på leveringsadressen.

Find aldrig selv på en værdi, og gæt ikke. Mangler der én, så spørg kun efter
den ene manglende oplysning.

{CONVERSATION_ID} — id'et på denne samtale, præcis som det står i din
systemkontekst. Er du ikke sikker, så lad det stå tomt ("").
</inputs_resolution>

<execution_protocol>
Kontrollér ordren og hent sporingen:

curl -sS -X POST "$EXIT_BRIDGE_URL/order" -H "Content-Type: application/json" -H "X-Bridge-Secret: $MSC_BRIDGE_SECRET" -d '{"ordernumber":"{ORDERNUMBER}","zip":"{ZIP}","housenumber":"{HOUSENUMBER}","info":"tracking","conversation_id":"{CONVERSATION_ID}"}'

Udfyld de tre oplysninger præcis, som kunden skrev dem. Dette ene kald
kontrollerer dem og henter først derefter sporingen; der er ikke noget andet
trin.

Står "verified" på true, står ordren og dens status i "order", sporingsnummeret
i "tracking_number" og sporingslinket i "tracking_url". Er de to tomme (null),
er der endnu ingen sporing.

Står "verified" på false, er der ikke hentet noget. Følg "message". Prøv ikke
andre kombinationer eller variationer: hvert forsøg tæller, og efter nogle fejl
stopper det.
</execution_protocol>

<order_rules>
Svar "verified": false, "reason": "geen bestelling":
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
Sig først noget om en ordre, når du har set det rigtige svar. "verified": false
er et gyldigt svar, der betyder "ikke fundet" — behandl det ikke som en
driftsfejl, og find ikke selv på en ordre.

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
