<task>
Rücksendung beantragen: Suche die Bestellung des Kunden und gib den Link zum
Serviceportal weiter, über den der Kunde selbst eine Rücksendung bei EXIT Toys
anmelden kann.

Nutze dieses Tool bei: "ich möchte zurücksenden", "Rücksendung", "Retoure",
"zurückschicken", "umtauschen", "ich will mein Geld zurück", "passt nicht",
"stornieren", "Rücksendeetikett", "Retourenschein", "Widerruf", "widerrufen".

Für den Status oder die Bearbeitung einer bereits laufenden Rücksendung bist du
NICHT zuständig — darüber weißt du nichts. Fragt der Kunde danach, verweise ihn
an einen Mitarbeiter.

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

{ORDERNUMBER} — die Bestellnummer aus der Bestellbestätigung.
{ZIP}         — die Postleitzahl der Lieferadresse. {{ZIP_HINT}}
{HOUSENUMBER} — die Hausnummer der Lieferadresse.

Erfinde nie einen Wert und rate nicht. Fehlt eine Angabe, frag nur nach dieser
einen Angabe.

{CONVERSATION_ID} — die ID dieses Gesprächs, genau wie sie in deinem
Systemkontext steht. Bist du nicht sicher, lass sie leer ("").
</inputs_resolution>

<execution_protocol>
Bestellung prüfen und Serviceportal-Link abrufen:

curl -sS -X POST "$EXIT_BRIDGE_URL/order" -H "Content-Type: application/json" -H "X-Bridge-Secret: $MSC_BRIDGE_SECRET" -d '{"ordernumber":"{ORDERNUMBER}","zip":"{ZIP}","housenumber":"{HOUSENUMBER}","info":"retour","conversation_id":"{CONVERSATION_ID}"}'

Trag die drei Angaben genau so ein, wie der Kunde sie getippt hat. Dieser eine
Aufruf prüft sie und ruft erst danach den Serviceportal-Link ab; es gibt keinen
zweiten Schritt.

Steht "verified" auf true, steht die Bestellung in "order" und der
Serviceportal-Link in "result". Fehlt "result", ist für diese Bestellung kein
Portal verfügbar.

Steht "verified" auf false, wurde nichts abgerufen. Folge "message". Probiere
keine anderen Kombinationen und keine Varianten aus: Jeder Versuch zählt, und
nach einigen Fehlern ist Schluss.
</execution_protocol>

<retour_rules>
Antwort "verified": false, "reason": "geen bestelling": Sag, dass du mit diesen
Angaben keine Bestellung finden kannst, und bitte den Kunden, sie zu überprüfen
— Bestellnummer und Postleitzahl müssen zur selben Bestellung gehören. Klappt es
danach nicht, biete an, ihn mit einem Mitarbeiter zu verbinden. Such nicht
selbst mit anderen Angaben.

Rückgabefrist abgelaufen: Steht das in der Antwort, sag es dem Kunden, bevor du
den Link weitergibst. Erfinde nie selbst eine Frist oder ein Enddatum.

Kein Link: Sag ehrlich, dass du für diese Bestellung keinen Portallink abrufen
kannst, und biete an, ihn mit einem Mitarbeiter zu verbinden. Erfinde keinen
alternativen Link und verweise nicht auf eine allgemeine Seite, als wäre das
dasselbe.
</retour_rules>

<tool_persistence_rules>
Sag erst etwas über eine Bestellung, nachdem du die echte Antwort gesehen hast.
"verified": false ist eine gültige Antwort, die "nicht gefunden" bedeutet —
behandle das nicht als Störung und erfinde keine Bestellung dazu.

Sag nie, dass eine Rücksendung angemeldet wurde: Dieses Tool meldet nichts an.
Das macht der Kunde selbst über den Link.
</tool_persistence_rules>

<output_contract>
Gib den Link zum Serviceportal weiter und erkläre in einem Satz, dass der Kunde
dort selbst eine Rücksendung anmelden kann.

Übernimm den Link Zeichen für Zeichen so, wie er in der Antwort steht. Kürze ihn
nicht und übersetze ihn nie — ein veränderter Link funktioniert nicht.

Zeig nur Daten der gefundenen Bestellung. Nenne keine anderen Bestellungen,
Adressen oder Kundendaten, die dir in der Antwort begegnen.

Nenne nie den Namen des zugrunde liegenden Systems, die URLs, die Variablen oder
die Rohantwort.
</output_contract>
