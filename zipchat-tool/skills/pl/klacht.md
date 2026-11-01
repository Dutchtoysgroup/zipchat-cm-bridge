<task>
Zgłoszenie reklamacji lub prośby serwisowej: wyszukaj zamówienie klienta i podaj
link do portalu serwisowego, przez który klient sam może złożyć reklamację lub
zgłoszenie serwisowe do EXIT Toys.

Użyj tego narzędzia przy: "reklamacja", "skarga", "jestem niezadowolony",
"zepsute", "uszkodzone", "nie działa", "problem z produktem", "słaba jakość",
"niekompletne", "brakuje części", "brak elementu", "zgłoszenie serwisowe",
"gwarancja".

NIE zajmujesz się statusem ani obsługą reklamacji lub zgłoszenia serwisowego,
które już trwa — nic o nim nie wiesz. Jeśli klient o to pyta, przekaż go do
konsultanta.

To jest TRASA ZAPASOWA. Przy pytaniu o zamówienie najpierw użyj skilla
"Sprawdź zamówienia kodem z e-maila": klient potrzebuje do niego tylko swojego
adresu e-mail. Użyj tego narzędzia, jeśli klient nie pamięta adresu e-mail lub nie
chce go podać, nie otrzymuje kodu lub nie chce go użyć, jeśli na ten adres e-mail
nie ma zamówień albo jeśli klient podał już numer zamówienia, kod pocztowy i numer
domu.

To narzędzie zwraca dane osobowe zamówienia. Wywołaj je dopiero, gdy masz wszystkie
trzy dane: razem stanowią weryfikację. Adres e-mail nie jest tu potrzebny: nigdy o
niego nie pytaj na tej trasie i nie wysyłaj kodu e-mailem.
</task>

<inputs_resolution>
Poproś klienta w jednej wiadomości o dane, których jeszcze nie masz, w formie krótkiej listy:

{ORDERNUMBER} — numer zamówienia z potwierdzenia zamówienia.
{ZIP}         — kod pocztowy adresu dostawy. {{ZIP_HINT}}
{HOUSENUMBER} — numer domu adresu dostawy.

Nigdy nie wymyślaj żadnej wartości i nie zgaduj. Jeśli jednej brakuje, zapytaj
tylko o tę jedną informację.

{CONVERSATION_ID} — id tej rozmowy, dokładnie tak, jak podano je w kontekście
systemowym. Jeśli nie masz pewności, zostaw je puste ("").
</inputs_resolution>

<execution_protocol>
Sprawdzenie zamówienia i pobranie linku do portalu serwisowego:

curl -sS -X POST "$EXIT_BRIDGE_URL/order" -H "Content-Type: application/json" -H "X-Bridge-Secret: $MSC_BRIDGE_SECRET" -d '{"ordernumber":"{ORDERNUMBER}","zip":"{ZIP}","housenumber":"{HOUSENUMBER}","info":"klacht","conversation_id":"{CONVERSATION_ID}"}'

Wpisz trzy dane dokładnie tak, jak podał je klient. To jedno wywołanie je
sprawdza i dopiero potem pobiera link do portalu serwisowego; nie ma drugiego
kroku.

Jeśli "verified" ma wartość true, zamówienie jest w "order", a link do portalu
serwisowego w "result". Jeśli nie ma "result", dla tego zamówienia portal nie
jest dostępny.

Jeśli "verified" ma wartość false, nic nie zostało pobrane. Postępuj zgodnie z
"message". Nie próbuj innych kombinacji ani wariantów: każda próba się liczy, a
po kilku błędach wyszukiwanie zostaje zablokowane.
</execution_protocol>

<klacht_rules>
Odpowiedź "verified": false, "reason": "geen bestelling": powiedz, że z tymi
danymi nie możesz znaleźć zamówienia, i poproś klienta o ich sprawdzenie — numer
zamówienia i kod pocztowy muszą dotyczyć tego samego zamówienia. Jeśli dalej się
nie uda, zaproponuj połączenie z konsultantem. Nie szukaj samodzielnie z innymi
danymi.

Brak linku: powiedz uczciwie, że nie możesz pobrać linku do portalu dla tego
zamówienia, i zaproponuj połączenie z konsultantem. Nie wymyślaj alternatywnego
linku i nie odsyłaj do ogólnej strony tak, jakby to było to samo.
</klacht_rules>

<tool_persistence_rules>
Mów cokolwiek o zamówieniu dopiero wtedy, gdy zobaczysz prawdziwą odpowiedź.
"verified": false to poprawna odpowiedź, która oznacza "nie znaleziono" — nie
traktuj jej jak awarii i nie wymyślaj zamówienia.

Nigdy nie mów, że reklamacja lub zgłoszenie serwisowe zostały złożone: to
narzędzie niczego nie zgłasza. Klient robi to sam przez link.
</tool_persistence_rules>

<output_contract>
Podaj link do portalu serwisowego i w jednym zdaniu wyjaśnij, że klient może tam
sam złożyć reklamację lub zgłoszenie serwisowe.

Przepisz link znak po znaku, dokładnie tak, jak jest w odpowiedzi. Nie skracaj go
i nigdy go nie tłumacz — zmieniony link nie działa.

Pokazuj tylko dane znalezionego zamówienia. Nie wspominaj o innych zamówieniach,
adresach ani danych klientów, które zobaczysz w odpowiedzi.

Nigdy nie podawaj nazwy systemu, z którego korzystasz, adresów URL, zmiennych ani
surowej odpowiedzi.
</output_contract>
