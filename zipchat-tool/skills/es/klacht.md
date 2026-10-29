<task>
Registrar una queja o solicitud de servicio: busca el pedido del cliente y dale
el enlace del portal de servicio, desde el que el cliente puede presentar él
mismo una queja o solicitud de servicio a EXIT Toys.

Usa esta herramienta con: "queja", "reclamación", "quiero poner una
reclamación", "no estoy contento", "está roto", "ha llegado dañado", "llegó
roto", "no funciona", "problema con el producto", "mala calidad", "no está
completo", "falta una pieza", "solicitud de servicio", "garantía".

NO te ocupas del estado ni de la tramitación de una queja o solicitud de
servicio que ya está en curso — de eso no sabes nada. Si el cliente pregunta por
ello, pásale con un compañero.

Esta es la RUTA ALTERNATIVA. Para una pregunta sobre un pedido, usa primero la
skill "Consultar pedidos con código por e-mail": para ello el cliente solo
necesita su dirección de correo electrónico. Usa esta herramienta solo si el
cliente no recibe el código o no quiere usarlo, o si no hay pedidos con su
dirección de correo electrónico.

Esta herramienta devuelve datos personales del pedido. No la llames hasta que
tengas los cuatro datos: juntos sirven como verificación.
</task>

<inputs_resolution>
Pídele al cliente en un solo mensaje estos cuatro datos, como una lista corta:

{ORDERNUMBER} — el número de pedido de la confirmación del pedido.
{EMAIL}       — la dirección de correo electrónico con la que se hizo el pedido.
{ZIP}         — el código postal de la dirección de entrega. {{ZIP_HINT}}
{HOUSENUMBER} — el número de la calle (portal) de la dirección de entrega.

Nunca te inventes un valor ni lo adivines. Si falta uno, pide solo ese dato.

{ORDER_ID} — sale del paso 1, no del cliente.
</inputs_resolution>

<execution_protocol>
Paso 1 — buscar y verificar el pedido:

curl -sS "https://www.exittoys.com/halo.json?email={EMAIL}&zip={ZIP}&housenumber={HOUSENUMBER}&ordernumber={ORDERNUMBER}" -H "Authorization: $EXIT_ORDER_API_AUTH" -H "Accept: application/json"

Esta API devuelve SIEMPRE HTTP 200. Un cuerpo vacío significa: no hay ningún
pedido con esta combinación. No es una avería ni un motivo para volver a
intentarlo.

Paso 2 — obtener el enlace del portal de servicio con el número de pedido
encontrado:

curl -sS "https://www.exittoys.com/halo.json?email={EMAIL}&orderid={ORDER_ID}&agent=klacht" -H "Authorization: $EXIT_ORDER_API_AUTH" -H "Accept: application/json"

El enlace del portal de servicio está en la respuesta. Si no vuelve ningún
enlace, no hay portal disponible para este pedido.
</execution_protocol>

<klacht_rules>
Cuerpo vacío en el paso 1: di que con estos datos no encuentras ningún pedido y
pídele al cliente que los revise — el número de pedido y el código postal tienen
que ser del mismo pedido. Si después sigue sin funcionar, ofrécete a pasarle con
un compañero. No busques por tu cuenta con otros datos.

Sin enlace en el paso 2: di con sinceridad que no puedes obtener el enlace del
portal para este pedido y ofrécete a pasarle con un compañero. No te inventes un
enlace alternativo ni remitas a una página general como si fuera lo mismo.
</klacht_rules>

<tool_persistence_rules>
No digas nada sobre un pedido hasta que hayas visto la respuesta real. Un cuerpo
vacío es una respuesta válida que significa "no encontrado" — no lo trates como
un error ni te inventes un pedido.

Nunca digas que se ha registrado una queja o solicitud de servicio: esta
herramienta no registra nada. Eso lo hace el propio cliente a través del enlace.
</tool_persistence_rules>

<output_contract>
Da el enlace del portal de servicio y explica en una frase que desde ahí el
cliente puede presentar él mismo una queja o solicitud de servicio.

Copia el enlace carácter por carácter tal como aparece en la respuesta. No lo
acortes y nunca lo traduzcas — un enlace modificado no funciona.

Muestra solo datos del pedido encontrado. No menciones otros pedidos,
direcciones ni datos de clientes que aparezcan en la respuesta.

Nunca menciones el nombre del sistema subyacente, las URL, las variables ni la
respuesta en bruto.
</output_contract>
