<task>
Look up the customer's order and give them the tracking information.

Use this tool for questions such as "where is my parcel", "where's my order",
"when will it be delivered", "what's the status of my order", "my order hasn't
arrived yet", "tracking number", "has my order been dispatched yet".

This is the FALLBACK ROUTE. For an order question, first use the skill
"Look up orders with an email code": for that, the customer only needs their
email address. Use this tool if the customer does not know their email address
or does not want to give it, does not receive the code or does not want to use
it, if there are no orders under their email address, or if they have already
given their order number, postcode and house number.

This tool returns personal order details. Only call it once you have all three
details: together they form the verification. No email address is needed here:
never ask for one on this route and do not send an email code.
</task>

<inputs_resolution>
Ask the customer in one message for the details you don't have yet, as a short list:

{ORDERNUMBER} — the order number, shown in the order confirmation.
{ZIP}         — the postcode of the delivery address. {{ZIP_HINT}}
{HOUSENUMBER} — the house number of the delivery address. If the address has
                no house number, ask for the house name or the first line of
                the address instead and pass that as {HOUSENUMBER}.

Never make up a value yourself and do not guess. If one is missing, ask only for
that one missing detail.

{CONVERSATION_ID} — the id of this conversation, exactly as it appears in your
system context. If you are not sure, leave it empty ("").
</inputs_resolution>

<execution_protocol>
Check the order and fetch the tracking:

curl -sS -X POST "$EXIT_BRIDGE_URL/order" -H "Content-Type: application/json" -H "X-Bridge-Secret: $MSC_BRIDGE_SECRET" -d '{"ordernumber":"{ORDERNUMBER}","zip":"{ZIP}","housenumber":"{HOUSENUMBER}","info":"tracking","conversation_id":"{CONVERSATION_ID}"}'

Fill in the three details exactly as the customer typed them. This one call
checks them and only then fetches the tracking; there is no second step.

If "verified" is true, the order and its status are in "order", the tracking
number in "tracking_number" and the tracking link in "tracking_url". If those
two are empty (null), there is no tracking yet.

If "verified" is false, nothing has been fetched. Follow "message". Do not try
other combinations or variations: every attempt counts, and after a few wrong
ones it stops.
</execution_protocol>

<order_rules>
Response "verified": false, "reason": "geen bestelling":
Say that you cannot find an order with these details and ask the customer to
check them — the order number and the postcode must belong to the same order.
If it still doesn't work after that, offer to put them through to a colleague.
Do not search with other details yourself and do not try variations.

An order is found, but there is no tracking link: look at the order status and
say only what follows from it.
- paid / processing: the order is being processed, and the tracking details
  will follow by email as soon as the parcel has been dispatched
- awaiting payment: the payment is still being processed, after which the
  order will be dispatched
- cancelled: the order has been cancelled
- completed without tracking: no tracking information is available any more;
  offer a handover to a colleague

Orders older than three months often no longer have tracking. Just say so.
</order_rules>

<tool_persistence_rules>
Only say anything about an order after you have seen the real response.
"verified": false is a valid response meaning "not found" — do not treat it as a
fault and do not make up an order.

Never mention a status, date, delivery time or tracking number that you have
not seen literally in the response.
</tool_persistence_rules>

<output_contract>
Give the tracking number and the tracking link, and briefly say what the status
is.

Copy the tracking number and the link character for character exactly as they
appear in the response. Never shorten a link and never translate it — an
altered link will not work.

Never promise a delivery date that is not in the data. Do not speculate about
delays or their cause.

Only show details of the order that was found. Do not mention other orders,
addresses or customer details you come across in the response.

Never mention the name of the underlying system, the URLs, the variables or the
raw response.
</output_contract>
