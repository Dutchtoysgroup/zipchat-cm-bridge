<task>
Busca el pedido del cliente y dale la información de seguimiento.

Usa esta herramienta con preguntas como "¿dónde está mi paquete?", "¿cuándo me
llega?", "¿cuál es el estado de mi pedido?", "mi pedido todavía no ha llegado",
"número de seguimiento", "¿ya habéis enviado mi pedido?", "no me ha llegado el
pedido".

Esta es la RUTA ALTERNATIVA. Para una pregunta sobre un pedido, usa primero la
skill "Consultar pedidos con código por e-mail": para ella, el cliente solo
necesita su correo electrónico. Usa esta herramienta si el cliente no sabe su
correo electrónico o no quiere darlo, no recibe el código o no quiere usarlo, si
no hay pedidos con su correo electrónico, o si ya ha dado el número de pedido, el
código postal y el número de la calle.

Esta herramienta devuelve datos personales del pedido. Llámala solo cuando tengas
los tres datos: juntos forman la verificación. Aquí no hace falta el correo
electrónico: nunca lo pidas en esta ruta y no envíes ningún código por correo.
</task>

<inputs_resolution>
Pide al cliente en un solo mensaje los datos que aún no tengas, en una lista breve:

{ORDERNUMBER} — el número de pedido, aparece en la confirmación del pedido.
{ZIP}         — el código postal de la dirección de entrega. {{ZIP_HINT}}
{HOUSENUMBER} — el número de la calle (portal) de la dirección de entrega.

Nunca te inventes un valor ni lo adivines. Si falta uno, pide solo ese dato que
falta.

{CONVERSATION_ID} — el id de esta conversación, exactamente como aparece en tu
contexto de sistema. Si no estás seguro, déjalo vacío ("").
</inputs_resolution>

<execution_protocol>
Comprobar el pedido y obtener el seguimiento:

curl -sS -X POST "$EXIT_BRIDGE_URL/order" -H "Content-Type: application/json" -H "X-Bridge-Secret: $MSC_BRIDGE_SECRET" -d '{"ordernumber":"{ORDERNUMBER}","zip":"{ZIP}","housenumber":"{HOUSENUMBER}","info":"tracking","conversation_id":"{CONVERSATION_ID}"}'

Rellena los tres datos exactamente como los escribió el cliente. Esta única
llamada los comprueba y solo después obtiene el seguimiento; no hay un segundo
paso.

Si "verified" es true, el pedido y su estado están en "order", el número de
seguimiento en "tracking_number" y el enlace de seguimiento en "tracking_url".
Si esos dos están vacíos (null), todavía no hay seguimiento.

Si "verified" es false, no se ha obtenido nada. Sigue "message". No pruebes
otras combinaciones ni variaciones: cada intento cuenta y, tras unos cuantos
errores, se bloquea.
</execution_protocol>

<order_rules>
Respuesta "verified": false, "reason": "geen bestelling":
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
No digas nada sobre un pedido hasta que hayas visto la respuesta real.
"verified": false es una respuesta válida que significa "no encontrado" — no lo
trates como un fallo ni te inventes un pedido.

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
