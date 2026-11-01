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

{CONVERSATION_ID} — id tej rozmowy, dokładnie tak, jak podano je w kontekście
systemowym. Jeśli nie masz pewności, zostaw je puste ("").
</inputs_resolution>

<execution_protocol>
Sprawdzenie zamówienia i pobranie danych śledzenia:

curl -sS -X POST "$EXIT_BRIDGE_URL/order" -H "Content-Type: application/json" -H "X-Bridge-Secret: $MSC_BRIDGE_SECRET" -d '{"ordernumber":"{ORDERNUMBER}","zip":"{ZIP}","housenumber":"{HOUSENUMBER}","info":"tracking","conversation_id":"{CONVERSATION_ID}"}'

Wpisz trzy dane dokładnie tak, jak podał je klient. To jedno wywołanie je
sprawdza i dopiero potem pobiera dane śledzenia; nie ma drugiego kroku.

Jeśli "verified" ma wartość true, zamówienie i jego status są w "order", numer
przesyłki w "tracking_number", a link do śledzenia w "tracking_url". Jeśli te
dwa pola są puste (null), śledzenie nie jest jeszcze dostępne.

Jeśli "verified" ma wartość false, nic nie zostało pobrane. Postępuj zgodnie z
"message". Nie próbuj innych kombinacji ani wariantów: każda próba się liczy, a
po kilku błędach wyszukiwanie zostaje zablokowane.
</execution_protocol>

<order_rules>
Odpowiedź "verified": false, "reason": "geen bestelling":
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
"verified": false to poprawna odpowiedź, która oznacza "nie znaleziono" — nie
traktuj jej jak awarii i nie wymyślaj zamówienia.

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
