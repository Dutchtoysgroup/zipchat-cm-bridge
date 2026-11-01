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

{ORDER_ID} — kommt aus Schritt 1, nicht vom Kunden.

{CONVERSATION_ID} — die ID dieses Gesprächs, genau wie sie in deinem
Systemkontext steht. Bist du nicht sicher, nimm "unbekannt". Lass sie nie leer:
Ohne diesen Wert kommt keine Antwort zurück.
</inputs_resolution>

<execution_protocol>
Schritt 1 — Bestellung suchen und verifizieren:

curl -sS "https://www.exittoys.com/halo.json?email=&zip={ZIP}&housenumber={HOUSENUMBER}&ordernumber={ORDERNUMBER}&conversationid={CONVERSATION_ID}" -H "Authorization: $EXIT_ORDER_API_AUTH" -H "Accept: application/json"

Diese API gibt IMMER HTTP 200 zurück. Die Bestellung steht in "orders", ihre
Nummer in "number". Eine Antwort ohne Bestellung (leerer Body, {} oder eine leere
Liste "orders") bedeutet: keine Bestellung zu dieser Kombination, und gilt unten
als leerer Body. Das ist keine Störung und kein Grund, es erneut zu versuchen.
Schreib ein Leerzeichen in einem Wert in der URL als %20. Führe Schritt 2 nur mit
einer Nummer aus, die hier zurückkam, nie mit einer Nummer, die nur der Kunde
genannt hat.

Schritt 2 — Link zum Serviceportal mit der gefundenen Bestellnummer abrufen:

curl -sS "https://www.exittoys.com/halo.json?email=&orderid={ORDER_ID}&agent=retour&conversationid={CONVERSATION_ID}" -H "Authorization: $EXIT_ORDER_API_AUTH" -H "Accept: application/json"

Der Link zum Serviceportal steht in der Antwort. Kommt kein Link zurück, gibt es
für diese Bestellung kein Portal.
</execution_protocol>

<retour_rules>
Leerer Body in Schritt 1: Sag, dass du mit diesen Angaben keine Bestellung
finden kannst, und bitte den Kunden, sie zu überprüfen — Bestellnummer und
Postleitzahl müssen zur selben Bestellung gehören. Klappt es danach nicht,
biete an, ihn mit einem Mitarbeiter zu verbinden. Such nicht selbst mit anderen
Angaben.

Rückgabefrist abgelaufen: Steht das in der Antwort, sag es dem Kunden, bevor du
den Link weitergibst. Erfinde nie selbst eine Frist oder ein Enddatum.

Kein Link in Schritt 2: Sag ehrlich, dass du für diese Bestellung keinen
Portallink abrufen kannst, und biete an, ihn mit einem Mitarbeiter zu verbinden.
Erfinde keinen alternativen Link und verweise nicht auf eine allgemeine Seite,
als wäre das dasselbe.
</retour_rules>

<tool_persistence_rules>
Sag erst etwas über eine Bestellung, nachdem du die echte Antwort gesehen hast.
Ein leerer Body ist eine gültige Antwort, die "nicht gefunden" bedeutet —
behandle das nicht als Fehler und erfinde keine Bestellung dazu.

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
