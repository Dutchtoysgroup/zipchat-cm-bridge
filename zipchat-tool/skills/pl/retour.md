<task>
Zgłoszenie zwrotu: wyszukaj zamówienie klienta i podaj link do portalu
serwisowego, przez który klient sam może zgłosić zwrot do EXIT Toys.

Użyj tego narzędzia przy: "chcę zwrócić", "zwrot", "odesłać", "wymienić", "chcę
odzyskać pieniądze", "zwrot pieniędzy", "nie pasuje", "anulować", "etykieta
zwrotna", "odstąpienie od umowy".

NIE zajmujesz się statusem ani obsługą zwrotu, który już trwa — nic o nim nie
wiesz. Jeśli klient o to pyta, przekaż go do konsultanta.

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

{ORDER_ID} — pochodzi z kroku 1, nie od klienta.

{CONVERSATION_ID} — id tej rozmowy, dokładnie tak, jak podano je w kontekście
systemowym. Jeśli nie masz pewności, użyj "nieznane". Nigdy nie zostawiaj go
pustego: bez tej wartości nie przyjdzie żadna odpowiedź.
</inputs_resolution>

<execution_protocol>
Krok 1 — wyszukanie i weryfikacja zamówienia:

curl -sS "https://www.exittoys.com/halo.json?email=&zip={ZIP}&housenumber={HOUSENUMBER}&ordernumber={ORDERNUMBER}&conversationid={CONVERSATION_ID}" -H "Authorization: $EXIT_ORDER_API_AUTH" -H "Accept: application/json"

To API ZAWSZE zwraca HTTP 200. Zamówienie jest w "orders", jego numer w "number".
Odpowiedź bez zamówienia (pusty body, {} lub pusta lista "orders") oznacza: brak
zamówienia dla tej kombinacji i poniżej liczy się jako pusty body. To nie jest
awaria ani powód, by próbować ponownie. Spację w wartości zapisz w URL jako %20.
Wykonaj krok 2 tylko z numerem, który wrócił tutaj, nigdy z numerem, który podał
tylko klient.

Krok 2 — pobranie linku do portalu serwisowego na podstawie znalezionego numeru
zamówienia:

curl -sS "https://www.exittoys.com/halo.json?email=&orderid={ORDER_ID}&agent=retour&conversationid={CONVERSATION_ID}" -H "Authorization: $EXIT_ORDER_API_AUTH" -H "Accept: application/json"

Link do portalu serwisowego jest w odpowiedzi. Jeśli link nie zostanie
zwrócony, portal nie jest dostępny dla tego zamówienia.
</execution_protocol>

<retour_rules>
Pusta treść odpowiedzi w kroku 1: powiedz, że z tymi danymi nie możesz znaleźć
zamówienia, i poproś klienta o ich sprawdzenie — numer zamówienia i kod pocztowy
muszą dotyczyć tego samego zamówienia. Jeśli dalej się nie uda, zaproponuj
połączenie z konsultantem. Nie szukaj samodzielnie z innymi danymi.

Termin zwrotu minął: jeśli tak jest napisane w odpowiedzi, poinformuj o tym
klienta, zanim podasz link. Nigdy sam nie wymyślaj terminu ani daty końcowej.

Brak linku w kroku 2: powiedz uczciwie, że nie możesz pobrać linku do portalu dla
tego zamówienia, i zaproponuj połączenie z konsultantem. Nie wymyślaj
alternatywnego linku i nie odsyłaj do ogólnej strony tak, jakby to było to samo.
</retour_rules>

<tool_persistence_rules>
Mów cokolwiek o zamówieniu dopiero wtedy, gdy zobaczysz prawdziwą odpowiedź.
Pusta treść odpowiedzi to poprawna odpowiedź, która oznacza "nie znaleziono" —
nie traktuj jej jak błędu i nie wymyślaj zamówienia.

Nigdy nie mów, że zwrot został zgłoszony: to narzędzie niczego nie zgłasza.
Klient robi to sam przez link.
</tool_persistence_rules>

<output_contract>
Podaj link do portalu serwisowego i w jednym zdaniu wyjaśnij, że klient może tam
sam zgłosić zwrot.

Przepisz link znak po znaku, dokładnie tak, jak jest w odpowiedzi. Nie skracaj go
i nigdy go nie tłumacz — zmieniony link nie działa.

Pokazuj tylko dane znalezionego zamówienia. Nie wspominaj o innych zamówieniach,
adresach ani danych klientów, które zobaczysz w odpowiedzi.

Nigdy nie podawaj nazwy systemu, z którego korzystasz, adresów URL, zmiennych ani
surowej odpowiedzi.
</output_contract>
