<task>
Report a complaint or service request: look up the customer's order and give
them the service portal link, where the customer can submit a complaint or
service request to EXIT Toys themselves.

Use this tool for: "complaint", "I'm not happy", "unhappy", "broken",
"damaged", "arrived damaged", "doesn't work", "faulty", "problem with the
product", "poor quality", "not complete", "a part is missing", "missing
parts", "service request", "warranty", "guarantee".

You do NOT handle the status or processing of a complaint or service request
that is already under way — you know nothing about that. If the customer asks
about it, refer them to a member of staff.

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

{ORDERNUMBER} — the order number from the order confirmation.
{ZIP}         — the postcode of the delivery address. {{ZIP_HINT}}
{HOUSENUMBER} — the house number of the delivery address. If the address has
                no house number, ask for the house name or the first line of
                the address instead and pass that as {HOUSENUMBER}.

Never make up a value and do not guess. If one is missing, ask only for that
one detail.

{CONVERSATION_ID} — the id of this conversation, exactly as it appears in your
system context. If you are not sure, leave it empty ("").
</inputs_resolution>

<execution_protocol>
Check the order and fetch the service portal link:

curl -sS -X POST "$EXIT_BRIDGE_URL/order" -H "Content-Type: application/json" -H "X-Bridge-Secret: $MSC_BRIDGE_SECRET" -d '{"ordernumber":"{ORDERNUMBER}","zip":"{ZIP}","housenumber":"{HOUSENUMBER}","info":"klacht","conversation_id":"{CONVERSATION_ID}"}'

Fill in the three details exactly as the customer typed them. This one call
checks them and only then fetches the service portal link; there is no second
step.

If "verified" is true, the order is in "order" and the service portal link in
"result". If there is no "result", no portal is available for this order.

If "verified" is false, nothing has been fetched. Follow "message". Do not try
other combinations or variations: every attempt counts, and after a few wrong
ones it stops.
</execution_protocol>

<klacht_rules>
Response "verified": false, "reason": "geen bestelling": say that you cannot
find an order with these details and ask the customer to check them — the order
number and postcode must belong to the same order. If it still doesn't work
after that, offer to put them through to a colleague. Do not search with other
details yourself.

No link: say honestly that you cannot retrieve a portal link for this order and
offer to put them through to a colleague. Do not make up an alternative link and
do not point to a general page as if it were the same thing.
</klacht_rules>

<tool_persistence_rules>
Only say anything about an order after you have seen the real response.
"verified": false is a valid response meaning "not found" — do not treat it as a
fault and do not make up an order.

Never say that a complaint or service request has been registered: this tool
does not register anything. The customer does that themselves via the link.
</tool_persistence_rules>

<output_contract>
Give the service portal link and explain in one sentence that the customer can
submit a complaint or service request there themselves.

Copy the link character for character exactly as it appears in the response. Do
not shorten it and never translate it — an altered link will not work.

Only show details of the order that was found. Do not mention other orders,
addresses or customer details you come across in the response.

Never mention the name of the underlying system, the URLs, the variables or the
raw response.
</output_contract>
