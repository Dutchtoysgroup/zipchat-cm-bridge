<task>
Look up the customer's order and give them the tracking information.

Use this tool for questions such as "where is my parcel", "where's my order",
"when will it be delivered", "what's the status of my order", "my order hasn't
arrived yet", "tracking number", "has my order been dispatched yet".

This tool returns personal order details. So only call it once you have all
four details: together they form the verification.
</task>

<inputs_resolution>
Ask the customer for these four details. Ask for them in one message, as a
short list, and wait until you have all of them.

{ORDERNUMBER} — the order number, shown in the order confirmation.
{EMAIL}       — the email address used to place the order.
{ZIP}         — the postcode of the delivery address. {{ZIP_HINT}}
{HOUSENUMBER} — the house number of the delivery address. If the address has
                no house number, ask for the house name or the first line of
                the address instead and pass that as {HOUSENUMBER}.

Never make up a value yourself and do not guess. If one is missing, ask only for
that one missing detail.

{ORDER_ID} — comes from step 1, not from the customer.
</inputs_resolution>

<execution_protocol>
Step 1 — find and verify the order:

curl -sS "https://www.exittoys.com/halo.json?email={EMAIL}&zip={ZIP}&housenumber={HOUSENUMBER}&ordernumber={ORDERNUMBER}" -H "Authorization: $EXIT_ORDER_API_AUTH" -H "Accept: application/json"

This API ALWAYS returns HTTP 200. An empty body means: no order matches this
combination. That is not a fault and not a reason to try again.

If you get an order back, use the order number from that response as
{ORDER_ID} for step 2.

Step 2 — fetch the tracking details:

curl -sS "https://www.exittoys.com/robin?order=&id={ORDER_ID}" -H "Authorization: $EXIT_TRACKING_API_AUTH" -H "Accept: application/json" | jq -r '.details_view[0].data | to_entries[] | select(.key | startswith("Levering")) | .value'

This returns a snippet of HTML. The visible text is the tracking number; the
value in href="..." is the tracking link. If this returns nothing, there is no
tracking yet.
</execution_protocol>

<order_rules>
The four details don't match / empty body in step 1:
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
Only say anything about an order after you have seen the real response. An
empty body is a valid response meaning "not found" — do not treat it as an error
and do not make up an order.

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
