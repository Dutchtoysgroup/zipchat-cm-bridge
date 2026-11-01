<task>
Richiedere un reso: cerca l'ordine del cliente e fornisci il link al portale
assistenza, con cui il cliente può presentare in autonomia un reso a EXIT Toys.

Usa questo strumento per: "voglio fare un reso", "voglio restituire", "rimandare
indietro", "cambiare", "sostituire", "voglio il rimborso", "rivoglio i miei
soldi", "non mi va bene", "non è la misura giusta", "annullare", "etichetta di
reso", "recesso", "diritto di recesso".

Non ti occupi dello stato o della gestione di un reso già in corso — su questo
non sai nulla. Se il cliente lo chiede, inoltralo a un operatore.

Questo è il PERCORSO ALTERNATIVO. Per una domanda su un ordine usa prima la skill
"Cerca ordini con codice via e-mail": per quella al cliente basta il suo
indirizzo e-mail. Usa questo strumento se il cliente non ricorda il suo indirizzo
e-mail o non vuole darlo, non riceve il codice o non vuole usarlo, se non ci sono
ordini su quell'indirizzo e-mail, oppure se ha già dato numero d'ordine, CAP e
numero civico.

Questo strumento restituisce dati personali dell'ordine. Chiamalo solo quando hai
tutti e tre i dati: insieme costituiscono la verifica. Qui l'indirizzo e-mail non
serve: non chiederlo mai in questo percorso e non inviare un codice via e-mail.
</task>

<inputs_resolution>
Chiedi al cliente in un solo messaggio i dati che ancora non hai, in un breve elenco:

{ORDERNUMBER} — il numero d'ordine indicato nella conferma d'ordine.
{ZIP}         — il CAP dell'indirizzo di consegna. {{ZIP_HINT}}
{HOUSENUMBER} — il numero civico dell'indirizzo di consegna.

Non inventare mai un valore e non tirare a indovinare. Se ne manca uno, chiedi
solo quel dato.

{CONVERSATION_ID} — l'id di questa conversazione, esattamente come appare nel
tuo contesto di sistema. Se non sei sicuro, lascialo vuoto ("").
</inputs_resolution>

<execution_protocol>
Controllare l'ordine e recuperare il link al portale di assistenza:

curl -sS -X POST "$EXIT_BRIDGE_URL/order" -H "Content-Type: application/json" -H "X-Bridge-Secret: $MSC_BRIDGE_SECRET" -d '{"ordernumber":"{ORDERNUMBER}","zip":"{ZIP}","housenumber":"{HOUSENUMBER}","info":"retour","conversation_id":"{CONVERSATION_ID}"}'

Inserisci i tre dati esattamente come li ha scritti il cliente. Questa unica
chiamata li controlla e solo dopo recupera il link al portale di assistenza; non
c'è un secondo passaggio.

Se "verified" è true, l'ordine è in "order" e il link al portale di assistenza
in "result". Se manca "result", per quest'ordine non è disponibile alcun
portale.

Se "verified" è false, non è stato recuperato nulla. Segui "message". Non
provare altre combinazioni né varianti: ogni tentativo conta e, dopo alcuni
errori, si blocca.
</execution_protocol>

<retour_rules>
Risposta "verified": false, "reason": "geen bestelling": di' che con questi dati
non riesci a trovare alcun ordine e chiedi al cliente di ricontrollarli — numero
d'ordine e CAP devono appartenere allo stesso ordine. Se non funziona nemmeno
dopo, offri di metterlo in contatto con un operatore. Non cercare da solo con
altri dati.

Termine di reso scaduto: se è indicato nella risposta, comunicalo al cliente
prima di dare il link. Non inventare mai tu un termine o una data di scadenza.

Nessun link: di' onestamente che non riesci a recuperare un link al portale per
quest'ordine e offri di metterlo in contatto con un operatore. Non inventare un
link alternativo e non rimandare a una pagina generica come se fosse la stessa
cosa.
</retour_rules>

<tool_persistence_rules>
Di' qualcosa su un ordine solo dopo aver visto la risposta reale. "verified":
false è una risposta valida che significa "non trovato" — non trattarlo come un
guasto e non inventare un ordine.

Non dire mai che un reso è stato registrato: questo strumento non registra
nulla. È il cliente a farlo, tramite il link.
</tool_persistence_rules>

<output_contract>
Fornisci il link al portale assistenza e spiega in una frase che lì il cliente
può presentare in autonomia un reso.

Riporta il link carattere per carattere, esattamente come compare nella
risposta. Non accorciarlo e non tradurlo mai — un link modificato non funziona.

Mostra solo i dati dell'ordine trovato. Non menzionare altri ordini, indirizzi o
dati di clienti che trovi nella risposta.

Non nominare mai il sistema sottostante, gli URL, le variabili o la risposta
grezza.
</output_contract>
