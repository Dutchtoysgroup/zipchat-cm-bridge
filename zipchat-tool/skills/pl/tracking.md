<task>
Wyszukaj zamówienie klienta i podaj informacje o śledzeniu przesyłki.

Użyj tego narzędzia przy pytaniach takich jak "gdzie jest moja paczka", "kiedy
dotrze moje zamówienie", "jaki jest status mojego zamówienia", "moje zamówienie
jeszcze nie przyszło", "numer przesyłki", "śledzenie przesyłki", "czy moje
zamówienie zostało już wysłane", "kiedy przyjdzie kurier".

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

{ORDERNUMBER} — numer zamówienia, znajduje się w potwierdzeniu zamówienia.
{ZIP}         — kod pocztowy adresu dostawy. {{ZIP_HINT}}
{HOUSENUMBER} — numer domu adresu dostawy.

Nigdy nie wymyślaj żadnej wartości i nie zgaduj. Jeśli jednej brakuje, zapytaj
tylko o tę jedną brakującą informację.

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

Jeśli dostaniesz zamówienie, użyj numeru zamówienia z tej odpowiedzi jako
{ORDER_ID} w kroku 2.

Krok 2 — pobranie danych śledzenia przesyłki:

curl -sS "https://www.exittoys.com/robin?order=&id={ORDER_ID}" -H "Authorization: $EXIT_TRACKING_API_AUTH" -H "Accept: application/json" | jq -r '.details_view[0].data | to_entries[] | select(.key | startswith("Levering")) | .value'

To zwraca fragment HTML. Widoczny tekst to numer przesyłki; wartość w
href="..." to link do śledzenia. Jeśli nic nie zostanie zwrócone, śledzenie nie
jest jeszcze dostępne.
</execution_protocol>

<order_rules>
Cztery dane się nie zgadzają / pusta treść odpowiedzi w kroku 1:
Powiedz, że z tymi danymi nie możesz znaleźć zamówienia, i poproś klienta o ich
sprawdzenie — numer zamówienia i kod pocztowy muszą dotyczyć tego samego
zamówienia. Jeśli dalej się nie uda, zaproponuj połączenie z konsultantem. Nie
szukaj samodzielnie z innymi danymi i nie próbuj wariantów.

Zamówienie jest, ale brak linku do śledzenia: sprawdź status zamówienia i powiedz
tylko to, co z niego wynika.
- opłacone / w realizacji: zamówienie jest przetwarzane, informacje o śledzeniu
  przyjdą e-mailem, gdy tylko paczka zostanie wysłana
- oczekuje na płatność: płatność jest jeszcze przetwarzana, potem nastąpi wysyłka
- anulowane: zamówienie zostało anulowane
- zrealizowane bez śledzenia: informacje o śledzeniu nie są już dostępne,
  zaproponuj połączenie z konsultantem

Zamówienia starsze niż trzy miesiące często nie mają już śledzenia. Po prostu to
powiedz.
</order_rules>

<tool_persistence_rules>
Mów cokolwiek o zamówieniu dopiero wtedy, gdy zobaczysz prawdziwą odpowiedź.
Pusta treść odpowiedzi to poprawna odpowiedź, która oznacza "nie znaleziono" —
nie traktuj jej jak błędu i nie wymyślaj zamówienia.

Nigdy nie podawaj statusu, daty, terminu dostawy ani numeru przesyłki, których
nie widzisz dosłownie w odpowiedzi.
</tool_persistence_rules>

<output_contract>
Podaj numer przesyłki i link do śledzenia oraz krótko powiedz, jaki jest status.

Przepisz numer przesyłki i link znak po znaku, dokładnie tak, jak są w
odpowiedzi. Nigdy nie skracaj linku i nigdy go nie tłumacz — zmieniony link nie
działa.

Nigdy nie obiecuj daty dostawy, której nie ma w danych. Nie spekuluj o
opóźnieniu ani jego przyczynie.

Pokazuj tylko dane znalezionego zamówienia. Nie wspominaj o innych zamówieniach,
adresach ani danych klientów, które zobaczysz w odpowiedzi.

Nigdy nie podawaj nazwy systemu, z którego korzystasz, adresów URL, zmiennych ani
surowej odpowiedzi.
</output_contract>
