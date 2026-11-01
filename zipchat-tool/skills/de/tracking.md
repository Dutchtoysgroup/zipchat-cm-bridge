<task>
Suche die Bestellung des Kunden und gib die Sendungsverfolgungsinformationen
weiter.

Nutze dieses Tool bei Fragen wie "wo ist mein Paket", "wann wird geliefert",
"wann kommt meine Bestellung", "wie ist der Status meiner Bestellung", "meine
Bestellung ist noch nicht angekommen", "Sendungsverfolgung", "Trackingnummer",
"wurde meine Bestellung schon verschickt".

Das ist der AUSWEICHWEG. Nutze für eine Frage zu einer Bestellung zuerst den
Skill "Bestellung per E-Mail-Code abrufen": Dafür braucht der Kunde nur seine
E-Mail-Adresse. Nutze dieses Tool, wenn der Kunde seine E-Mail-Adresse nicht
weiß oder nicht angeben will, den Code nicht bekommt oder nicht nutzen will, wenn
unter seiner E-Mail-Adresse keine Bestellungen stehen oder wenn er Bestellnummer,
Postleitzahl und Hausnummer bereits genannt hat.

Dieses Tool gibt persönliche Bestelldaten zurück. Rufe es erst auf, wenn du alle
drei Angaben hast: Zusammen bilden sie die Verifizierung. Eine E-Mail-Adresse ist
hier nicht nötig: Frag auf diesem Weg nie danach und schick keinen E-Mail-Code.
</task>

<inputs_resolution>
Frag den Kunden in einer Nachricht nach den Angaben, die dir noch fehlen, als kurze Liste:

{ORDERNUMBER} — die Bestellnummer, steht in der Bestellbestätigung.
{ZIP}         — die Postleitzahl der Lieferadresse. {{ZIP_HINT}}
{HOUSENUMBER} — die Hausnummer der Lieferadresse.

Erfinde nie selbst einen Wert und rate nicht. Fehlt eine Angabe, frag nur nach
dieser einen fehlenden Angabe.

{CONVERSATION_ID} — die ID dieses Gesprächs, genau wie sie in deinem
Systemkontext steht. Bist du nicht sicher, lass sie leer ("").
</inputs_resolution>

<execution_protocol>
Bestellung prüfen und Tracking abrufen:

curl -sS -X POST "$EXIT_BRIDGE_URL/order" -H "Content-Type: application/json" -H "X-Bridge-Secret: $MSC_BRIDGE_SECRET" -d '{"ordernumber":"{ORDERNUMBER}","zip":"{ZIP}","housenumber":"{HOUSENUMBER}","info":"tracking","conversation_id":"{CONVERSATION_ID}"}'

Trag die drei Angaben genau so ein, wie der Kunde sie getippt hat. Dieser eine
Aufruf prüft sie und ruft erst danach das Tracking ab; es gibt keinen zweiten
Schritt.

Steht "verified" auf true, stehen die Bestellung und ihr Status in "order", die
Trackingnummer in "tracking_number" und der Trackinglink in "tracking_url". Sind
diese beiden leer (null), gibt es noch kein Tracking.

Steht "verified" auf false, wurde nichts abgerufen. Folge "message". Probiere
keine anderen Kombinationen und keine Varianten aus: Jeder Versuch zählt, und
nach einigen Fehlern ist Schluss.
</execution_protocol>

<order_rules>
Antwort "verified": false, "reason": "geen bestelling":
Sag, dass du mit diesen Angaben keine Bestellung finden kannst, und bitte den
Kunden, sie zu überprüfen — Bestellnummer und Postleitzahl müssen zur selben
Bestellung gehören. Klappt es danach immer noch nicht, biete an, ihn mit einem
Mitarbeiter zu verbinden. Such nicht selbst mit anderen Angaben und probiere
keine Varianten aus.

Bestellung gefunden, aber kein Trackinglink: Schau auf den Bestellstatus und sag
nur, was sich daraus ergibt.
- bezahlt / in Bearbeitung: Die Bestellung wird bearbeitet, die
  Sendungsverfolgung kommt per E-Mail, sobald das Paket verschickt ist
- wartet auf Zahlung: Die Zahlung wird noch verarbeitet, danach folgt der
  Versand
- storniert: Die Bestellung wurde storniert
- abgeschlossen ohne Tracking: Es sind keine Trackinginformationen mehr
  verfügbar, biete eine Weiterleitung an einen Mitarbeiter an

Bestellungen, die älter als drei Monate sind, haben oft kein Tracking mehr. Sag
das einfach.
</order_rules>

<tool_persistence_rules>
Sag erst etwas über eine Bestellung, nachdem du die echte Antwort gesehen hast.
"verified": false ist eine gültige Antwort, die "nicht gefunden" bedeutet —
behandle das nicht als Störung und erfinde keine Bestellung dazu.

Nenne nie einen Status, ein Datum, einen Zustellzeitpunkt oder eine
Trackingnummer, die du nicht wörtlich in der Antwort gesehen hast.
</tool_persistence_rules>

<output_contract>
Gib die Trackingnummer und den Trackinglink weiter und sag kurz, wie der Status
ist.

Übernimm Trackingnummer und Link Zeichen für Zeichen so, wie sie in der Antwort
stehen. Kürze einen Link nie und übersetze ihn nie — ein veränderter Link
funktioniert nicht.

Versprich nie ein Lieferdatum, das nicht in den Daten steht. Spekuliere nicht
über Verzögerungen oder deren Ursache.

Zeig nur Daten der gefundenen Bestellung. Nenne keine anderen Bestellungen,
Adressen oder Kundendaten, die dir in der Antwort begegnen.

Nenne nie den Namen des zugrunde liegenden Systems, die URLs, die Variablen oder
die Rohantwort.
</output_contract>
