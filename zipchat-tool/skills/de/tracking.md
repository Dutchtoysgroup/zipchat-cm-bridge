<task>
Suche die Bestellung des Kunden und gib die Sendungsverfolgungsinformationen
weiter.

Nutze dieses Tool bei Fragen wie "wo ist mein Paket", "wann wird geliefert",
"wann kommt meine Bestellung", "wie ist der Status meiner Bestellung", "meine
Bestellung ist noch nicht angekommen", "Sendungsverfolgung", "Trackingnummer",
"wurde meine Bestellung schon verschickt".

Das ist der AUSWEICHWEG. Nutze für eine Frage zu einer Bestellung zuerst den
Skill "Bestellung per E-Mail-Code abrufen": Dafür braucht der Kunde nur seine
E-Mail-Adresse. Nutze dieses Tool erst, wenn der Kunde den Code nicht bekommt
oder nicht nutzen will, oder wenn unter seiner E-Mail-Adresse keine
Bestellungen stehen.

Dieses Tool gibt persönliche Bestelldaten zurück. Rufe es deshalb erst auf, wenn
du alle vier Angaben hast: Zusammen bilden sie die Verifizierung.
</task>

<inputs_resolution>
Frag den Kunden nach diesen vier Angaben. Frag in einer Nachricht, als kurze
Liste, und warte, bis du alle hast.

{ORDERNUMBER} — die Bestellnummer, steht in der Bestellbestätigung.
{EMAIL}       — die E-Mail-Adresse, mit der bestellt wurde.
{ZIP}         — die Postleitzahl der Lieferadresse. {{ZIP_HINT}}
{HOUSENUMBER} — die Hausnummer der Lieferadresse.

Erfinde nie selbst einen Wert und rate nicht. Fehlt eine Angabe, frag nur nach
dieser einen fehlenden Angabe.

{ORDER_ID} — kommt aus Schritt 1, nicht vom Kunden.
</inputs_resolution>

<execution_protocol>
Schritt 1 — Bestellung suchen und verifizieren:

curl -sS "https://www.exittoys.com/halo.json?email={EMAIL}&zip={ZIP}&housenumber={HOUSENUMBER}&ordernumber={ORDERNUMBER}" -H "Authorization: $EXIT_ORDER_API_AUTH" -H "Accept: application/json"

Diese API gibt IMMER HTTP 200 zurück. Ein leerer Body bedeutet: keine
Bestellung zu dieser Kombination. Das ist keine Störung und kein Grund, es
erneut zu versuchen.

Bekommst du eine Bestellung zurück, verwende die Bestellnummer aus dieser
Antwort als {ORDER_ID} für Schritt 2.

Schritt 2 — Trackingdaten abrufen:

curl -sS "https://www.exittoys.com/robin?order=&id={ORDER_ID}" -H "Authorization: $EXIT_TRACKING_API_AUTH" -H "Accept: application/json" | jq -r '.details_view[0].data | to_entries[] | select(.key | startswith("Levering")) | .value'

Das gibt ein Stück HTML zurück. Der sichtbare Text ist die Trackingnummer; der
Wert in href="..." ist der Trackinglink. Liefert das nichts, gibt es noch kein
Tracking.
</execution_protocol>

<order_rules>
Die vier Angaben passen nicht / leerer Body in Schritt 1:
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
Ein leerer Body ist eine gültige Antwort, die "nicht gefunden" bedeutet —
behandle das nicht als Fehler und erfinde keine Bestellung dazu.

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
