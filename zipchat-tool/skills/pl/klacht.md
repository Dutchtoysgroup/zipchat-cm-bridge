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

To narzędzie zwraca osobiste dane zamówienia. Wywołaj je dopiero wtedy, gdy masz
wszystkie cztery dane: razem stanowią one weryfikację.
</task>

<inputs_resolution>
Poproś klienta w jednej wiadomości o te cztery dane, w formie krótkiej listy:

{ORDERNUMBER} — numer zamówienia z potwierdzenia zamówienia.
{EMAIL}       — adres e-mail, na który złożono zamówienie.
{ZIP}         — kod pocztowy adresu dostawy. {{ZIP_HINT}}
{HOUSENUMBER} — numer domu adresu dostawy.

Nigdy nie wymyślaj żadnej wartości i nie zgaduj. Jeśli jednej brakuje, zapytaj
tylko o tę jedną informację.

{ORDER_ID} — pochodzi z kroku 1, nie od klienta.
</inputs_resolution>

<execution_protocol>
Krok 1 — wyszukanie i weryfikacja zamówienia:

curl -sS "https://www.exittoys.com/halo.json?email={EMAIL}&zip={ZIP}&housenumber={HOUSENUMBER}&ordernumber={ORDERNUMBER}" -H "Authorization: $EXIT_ORDER_API_AUTH" -H "Accept: application/json"

To API ZAWSZE zwraca HTTP 200. Pusta treść odpowiedzi oznacza: brak zamówienia
dla tej kombinacji danych. To nie jest awaria ani powód, żeby próbować ponownie.

Krok 2 — pobranie linku do portalu serwisowego na podstawie znalezionego numeru
zamówienia:

curl -sS "https://www.exittoys.com/halo.json?email={EMAIL}&orderid={ORDER_ID}&agent=klacht" -H "Authorization: $EXIT_ORDER_API_AUTH" -H "Accept: application/json"

Link do portalu serwisowego jest w odpowiedzi. Jeśli link nie zostanie
zwrócony, portal nie jest dostępny dla tego zamówienia.
</execution_protocol>

<klacht_rules>
Pusta treść odpowiedzi w kroku 1: powiedz, że z tymi danymi nie możesz znaleźć
zamówienia, i poproś klienta o ich sprawdzenie — numer zamówienia i kod pocztowy
muszą dotyczyć tego samego zamówienia. Jeśli dalej się nie uda, zaproponuj
połączenie z konsultantem. Nie szukaj samodzielnie z innymi danymi.

Brak linku w kroku 2: powiedz uczciwie, że nie możesz pobrać linku do portalu dla
tego zamówienia, i zaproponuj połączenie z konsultantem. Nie wymyślaj
alternatywnego linku i nie odsyłaj do ogólnej strony tak, jakby to było to samo.
</klacht_rules>

<tool_persistence_rules>
Mów cokolwiek o zamówieniu dopiero wtedy, gdy zobaczysz prawdziwą odpowiedź.
Pusta treść odpowiedzi to poprawna odpowiedź, która oznacza "nie znaleziono" —
nie traktuj jej jak błędu i nie wymyślaj zamówienia.

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
