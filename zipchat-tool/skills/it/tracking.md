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

{ORDER_ID} — viene dal passaggio 1, non dal cliente.

{CONVERSATION_ID} — l'id di questa conversazione, esattamente come appare nel tuo
contesto di sistema. Se non sei sicuro, usa "sconosciuto". Non lasciarlo mai
vuoto: senza questo valore non arriva nessuna risposta.
</inputs_resolution>

<execution_protocol>
Passaggio 1 — cercare e verificare l'ordine:

curl -sS "https://www.exittoys.com/halo.json?email=&zip={ZIP}&housenumber={HOUSENUMBER}&ordernumber={ORDERNUMBER}&conversationid={CONVERSATION_ID}" -H "Authorization: $EXIT_ORDER_API_AUTH" -H "Accept: application/json"

Questa API restituisce SEMPRE HTTP 200. L'ordine è in "orders", il suo numero in
"number". Una risposta senza ordine (body vuoto, {} o un elenco "orders" vuoto)
significa: nessun ordine per questa combinazione, e più avanti vale come body
vuoto. Non è un guasto né un motivo per riprovare. Scrivi uno spazio di un valore
nell'URL come %20. Esegui il passaggio 2 solo con un numero tornato qui, mai con
un numero citato solo dal cliente.

Se ricevi un ordine, usa il numero d'ordine di quella risposta come {ORDER_ID}
per il passaggio 2.

Passaggio 2 — recuperare i dati di tracking:

curl -sS "https://www.exittoys.com/robin?order=&id={ORDER_ID}" -H "Authorization: $EXIT_TRACKING_API_AUTH" -H "Accept: application/json" | jq -r '.details_view[0].data | to_entries[] | select(.key | startswith("Levering")) | .value'

Questo restituisce un frammento di HTML. Il testo visibile è il numero di
tracking; il valore in href="..." è il link di tracking. Se non restituisce
nulla, il tracking non è ancora disponibile.
</execution_protocol>

<order_rules>
I quattro dati non corrispondono / body vuoto nel passaggio 1:
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
Di' qualcosa su un ordine solo dopo aver visto la risposta reale. Un body vuoto
è una risposta valida che significa "non trovato" — non trattarlo come un errore
e non inventare un ordine.

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
