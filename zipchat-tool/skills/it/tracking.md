<task>
Cerca l'ordine del cliente e fornisci le informazioni di tracking.

Usa questo strumento per domande come "dov'è il mio pacco", "dov'è il mio
ordine", "quando arriva", "quando me lo consegnate", "qual è lo stato del mio
ordine", "il mio ordine non è ancora arrivato", "numero di tracking", "codice di
tracciamento", "il mio ordine è già stato spedito?".

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

{ORDERNUMBER} — il numero d'ordine, indicato nella conferma d'ordine.
{ZIP}         — il CAP dell'indirizzo di consegna. {{ZIP_HINT}}
{HOUSENUMBER} — il numero civico dell'indirizzo di consegna.

Non inventare mai un valore e non tirare a indovinare. Se ne manca uno, chiedi
solo quel dato mancante.

{CONVERSATION_ID} — l'id di questa conversazione, esattamente come appare nel
tuo contesto di sistema. Se non sei sicuro, lascialo vuoto ("").
</inputs_resolution>

<execution_protocol>
Controllare l'ordine e recuperare il tracking:

curl -sS -X POST "$EXIT_BRIDGE_URL/order" -H "Content-Type: application/json" -H "X-Bridge-Secret: $MSC_BRIDGE_SECRET" -d '{"ordernumber":"{ORDERNUMBER}","zip":"{ZIP}","housenumber":"{HOUSENUMBER}","info":"tracking","conversation_id":"{CONVERSATION_ID}"}'

Inserisci i tre dati esattamente come li ha scritti il cliente. Questa unica
chiamata li controlla e solo dopo recupera il tracking; non c'è un secondo
passaggio.

Se "verified" è true, l'ordine e il suo stato sono in "order", il numero di
tracking in "tracking_number" e il link di tracking in "tracking_url". Se questi
due sono vuoti (null), il tracking non è ancora disponibile.

Se "verified" è false, non è stato recuperato nulla. Segui "message". Non
provare altre combinazioni né varianti: ogni tentativo conta e, dopo alcuni
errori, si blocca.
</execution_protocol>

<order_rules>
Risposta "verified": false, "reason": "geen bestelling":
Di' che con questi dati non riesci a trovare alcun ordine e chiedi al cliente di
ricontrollarli — il numero d'ordine e il CAP devono appartenere allo stesso
ordine. Se non funziona nemmeno dopo, offri di metterlo in contatto con un
operatore. Non cercare da solo con altri dati e non provare varianti.

Ordine trovato, ma nessun link di tracking: guarda lo stato dell'ordine e di'
solo ciò che ne risulta.
- pagato / in lavorazione: l'ordine è in fase di elaborazione, il tracking
  arriverà via e-mail non appena il pacco sarà spedito
- in attesa di pagamento: il pagamento è ancora in elaborazione, poi seguirà la
  spedizione
- annullato: l'ordine è stato annullato
- completato senza tracking: non sono più disponibili informazioni di tracking,
  offri il passaggio a un operatore

Gli ordini più vecchi di tre mesi spesso non hanno più il tracking. Dillo
semplicemente.
</order_rules>

<tool_persistence_rules>
Di' qualcosa su un ordine solo dopo aver visto la risposta reale. "verified":
false è una risposta valida che significa "non trovato" — non trattarlo come un
guasto e non inventare un ordine.

Non indicare mai uno stato, una data, un momento di consegna o un numero di
tracking che non hai visto scritto letteralmente nella risposta.
</tool_persistence_rules>

<output_contract>
Fornisci il numero di tracking e il link di tracking, e di' brevemente qual è lo
stato.

Riporta il numero di tracking e il link carattere per carattere, esattamente come
compaiono nella risposta. Non accorciare mai un link e non tradurlo mai — un link
modificato non funziona.

Non promettere mai una data di consegna che non compare nei dati. Non fare
ipotesi su ritardi o sulle loro cause.

Mostra solo i dati dell'ordine trovato. Non menzionare altri ordini, indirizzi o
dati di clienti che trovi nella risposta.

Non nominare mai il sistema sottostante, gli URL, le variabili o la risposta
grezza.
</output_contract>
