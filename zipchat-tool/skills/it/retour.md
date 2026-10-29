<task>
Richiedere un reso: cerca l'ordine del cliente e fornisci il link al portale
assistenza, con cui il cliente può presentare in autonomia un reso a EXIT Toys.

Usa questo strumento per: "voglio fare un reso", "voglio restituire", "rimandare
indietro", "cambiare", "sostituire", "voglio il rimborso", "rivoglio i miei
soldi", "non mi va bene", "non è la misura giusta", "annullare", "etichetta di
reso", "recesso", "diritto di recesso".

Non ti occupi dello stato o della gestione di un reso già in corso — su questo
non sai nulla. Se il cliente lo chiede, inoltralo a un operatore.

Questa è la VIA ALTERNATIVA. Per una domanda su un ordine usa prima la skill
"Cerca ordini con codice via e-mail": al cliente basta il suo indirizzo e-mail.
Usa questo strumento solo se il cliente non riceve il codice o non vuole usarlo,
oppure se al suo indirizzo e-mail non risulta alcun ordine.

Questo strumento restituisce dati personali dell'ordine. Chiamalo solo quando
hai tutti e quattro i dati: insieme costituiscono la verifica.
</task>

<inputs_resolution>
Chiedi al cliente questi quattro dati in un unico messaggio, come breve elenco:

{ORDERNUMBER} — il numero d'ordine indicato nella conferma d'ordine.
{EMAIL}       — l'indirizzo e-mail usato per l'ordine.
{ZIP}         — il CAP dell'indirizzo di consegna. {{ZIP_HINT}}
{HOUSENUMBER} — il numero civico dell'indirizzo di consegna.

Non inventare mai un valore e non tirare a indovinare. Se ne manca uno, chiedi
solo quel dato.

{ORDER_ID} — viene dal passaggio 1, non dal cliente.
</inputs_resolution>

<execution_protocol>
Passaggio 1 — cercare e verificare l'ordine:

curl -sS "https://www.exittoys.com/halo.json?email={EMAIL}&zip={ZIP}&housenumber={HOUSENUMBER}&ordernumber={ORDERNUMBER}" -H "Authorization: $EXIT_ORDER_API_AUTH" -H "Accept: application/json"

Questa API restituisce SEMPRE HTTP 200. Un body vuoto significa: nessun ordine
con questa combinazione. Non è un guasto e non è un motivo per riprovare.

Passaggio 2 — recuperare il link al portale assistenza con il numero d'ordine
trovato:

curl -sS "https://www.exittoys.com/halo.json?email={EMAIL}&orderid={ORDER_ID}&agent=retour" -H "Authorization: $EXIT_ORDER_API_AUTH" -H "Accept: application/json"

Il link al portale assistenza è nella risposta. Se non viene restituito alcun
link, per quest'ordine non è disponibile un portale.
</execution_protocol>

<retour_rules>
Body vuoto nel passaggio 1: di' che con questi dati non riesci a trovare alcun
ordine e chiedi al cliente di ricontrollarli — numero d'ordine e CAP devono
appartenere allo stesso ordine. Se non funziona nemmeno dopo, offri di metterlo
in contatto con un operatore. Non cercare da solo con altri dati.

Termine di reso scaduto: se è indicato nella risposta, comunicalo al cliente
prima di dare il link. Non inventare mai tu un termine o una data di scadenza.

Nessun link nel passaggio 2: di' onestamente che non riesci a recuperare un link
al portale per quest'ordine e offri di metterlo in contatto con un operatore.
Non inventare un link alternativo e non rimandare a una pagina generica come se
fosse la stessa cosa.
</retour_rules>

<tool_persistence_rules>
Di' qualcosa su un ordine solo dopo aver visto la risposta reale. Un body vuoto
è una risposta valida che significa "non trovato" — non trattarlo come un errore
e non inventare un ordine.

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
