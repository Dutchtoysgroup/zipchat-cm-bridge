<task>
Busca el pedido del cliente y dale la información de seguimiento.

Usa esta herramienta con preguntas como "¿dónde está mi paquete?", "¿cuándo me
llega?", "¿cuál es el estado de mi pedido?", "mi pedido todavía no ha llegado",
"número de seguimiento", "¿ya habéis enviado mi pedido?", "no me ha llegado el
pedido".

Esta herramienta devuelve datos personales del pedido. Por eso, no la llames
hasta que tengas los cuatro datos: juntos sirven como verificación.
</task>

<inputs_resolution>
Pídele al cliente estos cuatro datos. Pídelos en un solo mensaje, como una lista
corta, y espera hasta tenerlos todos.

{ORDERNUMBER} — el número de pedido, aparece en la confirmación del pedido.
{EMAIL}       — la dirección de correo electrónico con la que se hizo el pedido.
{ZIP}         — el código postal de la dirección de entrega. {{ZIP_HINT}}
{HOUSENUMBER} — el número de la calle (portal) de la dirección de entrega.

Nunca te inventes un valor ni lo adivines. Si falta uno, pide solo ese dato que
falta.

{ORDER_ID} — sale del paso 1, no del cliente.
</inputs_resolution>

<execution_protocol>
Paso 1 — buscar y verificar el pedido:

curl -sS "https://www.exittoys.com/halo.json?email={EMAIL}&zip={ZIP}&housenumber={HOUSENUMBER}&ordernumber={ORDERNUMBER}" -H "Authorization: $EXIT_ORDER_API_AUTH" -H "Accept: application/json"

Esta API devuelve SIEMPRE HTTP 200. Un cuerpo vacío significa: no hay ningún
pedido que corresponda a esta combinación. No es una avería ni un motivo para
volver a intentarlo.

Si recibes un pedido, usa el número de pedido de esa respuesta como {ORDER_ID}
para el paso 2.

Paso 2 — obtener los datos de seguimiento:

curl -sS "https://www.exittoys.com/robin?order=&id={ORDER_ID}" -H "Authorization: $EXIT_TRACKING_API_AUTH" -H "Accept: application/json" | jq -r '.details_view[0].data | to_entries[] | select(.key | startswith("Levering")) | .value'

Esto devuelve un fragmento de HTML. El texto visible es el número de
seguimiento; el valor dentro de href="..." es el enlace de seguimiento. Si no
devuelve nada, todavía no hay seguimiento.
</execution_protocol>

<order_rules>
Los cuatro datos no coinciden / cuerpo vacío en el paso 1:
Di que con estos datos no encuentras ningún pedido y pídele al cliente que los
revise — el número de pedido y el código postal tienen que ser del mismo pedido.
Si después sigue sin funcionar, ofrécete a pasarle con un compañero. No busques
por tu cuenta con otros datos ni pruebes variaciones.

Hay un pedido, pero no hay enlace de seguimiento: mira el estado del pedido y di
solo lo que se deduce de él.
- pagado / en proceso: el pedido se está preparando, el seguimiento llegará por
  correo electrónico en cuanto se envíe el paquete
- pendiente de pago: el pago todavía se está procesando, después se hará el envío
- cancelado: el pedido se ha cancelado
- completado sin seguimiento: ya no hay información de seguimiento disponible,
  ofrece pasarle con un compañero

Los pedidos de hace más de tres meses a menudo ya no tienen seguimiento. Dilo
tal cual.
</order_rules>

<tool_persistence_rules>
No digas nada sobre un pedido hasta que hayas visto la respuesta real. Un cuerpo
vacío es una respuesta válida que significa "no encontrado" — no lo trates como
un error ni te inventes un pedido.

Nunca menciones un estado, una fecha, un momento de entrega o un número de
seguimiento que no hayas visto literalmente en la respuesta.
</tool_persistence_rules>

<output_contract>
Da el número de seguimiento y el enlace de seguimiento, y explica brevemente
cuál es el estado.

Copia el número de seguimiento y el enlace carácter por carácter tal como
aparecen en la respuesta. Nunca acortes un enlace ni lo traduzcas — un enlace
modificado no funciona.

Nunca prometas una fecha de entrega que no esté en los datos. No especules sobre
retrasos ni sobre sus causas.

Muestra solo datos del pedido encontrado. No menciones otros pedidos,
direcciones ni datos de clientes que aparezcan en la respuesta.

Nunca menciones el nombre del sistema subyacente, las URL, las variables ni la
respuesta en bruto.
</output_contract>
