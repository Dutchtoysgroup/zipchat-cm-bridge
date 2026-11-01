<task>
Request a return: look up the customer's order and give them the service portal
link, where the customer can submit a return to EXIT Toys themselves.

Use this tool for: "I want to return", "send it back", "return my order",
"exchange", "swap it", "I want a refund", "I want my money back", "doesn't
fit", "cancel my order", "returns label", "change of mind", "cancel within 14
days".

You do NOT handle the status or processing of a return that is already under
way — you know nothing about that. If the customer asks about it, refer them to
a member of staff.

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

{ORDER_ID} — comes from step 1, not from the customer.

{CONVERSATION_ID} — the id of this conversation, exactly as it appears in your
system context. If you are not sure, use "unknown". Never leave it empty:
without this value no answer comes back.
</inputs_resolution>

<execution_protocol>
Step 1 — find and verify the order:

curl -sS "https://www.exittoys.com/halo.json?email=&zip={ZIP}&housenumber={HOUSENUMBER}&ordernumber={ORDERNUMBER}&conversationid={CONVERSATION_ID}" -H "Authorization: $EXIT_ORDER_API_AUTH" -H "Accept: application/json"

This API ALWAYS returns HTTP 200. The order is in "orders", its number in
"number". A response without an order (empty body, {} or an empty "orders" list)
means: no order matches this combination, and counts as an empty body below.
That is not a fault and not a reason to try again. Write a space in a value in
the URL as %20. Only run step 2 with a number that came back here, never with a
number only the customer mentioned.

Step 2 — fetch the service portal link using the order number found:

curl -sS "https://www.exittoys.com/halo.json?email=&orderid={ORDER_ID}&agent=retour&conversationid={CONVERSATION_ID}" -H "Authorization: $EXIT_ORDER_API_AUTH" -H "Accept: application/json"

The service portal link is in the response. If no link comes back, there is no
portal available for this order.
</execution_protocol>

<retour_rules>
Empty body in step 1: say that you cannot find an order with these details and
ask the customer to check them — the order number and postcode must belong to
the same order. If it still doesn't work after that, offer to put them through
to a colleague. Do not search with other details yourself.

Return period expired: if the response says so, tell the customer before you
give the link. Never make up a return period or end date yourself.

No link in step 2: say honestly that you cannot retrieve a portal link for this
order and offer to put them through to a colleague. Do not make up an
alternative link and do not point to a general page as if it were the same
thing.
</retour_rules>

<tool_persistence_rules>
Only say anything about an order after you have seen the real response. An
empty body is a valid response meaning "not found" — do not treat it as an error
and do not make up an order.

Never say that a return has been registered: this tool does not register
anything. The customer does that themselves via the link.
</tool_persistence_rules>

<output_contract>
Give the service portal link and explain in one sentence that the customer can
submit a return there themselves.

Copy the link character for character exactly as it appears in the response. Do
not shorten it and never translate it — an altered link will not work.

Only show details of the order that was found. Do not mention other orders,
addresses or customer details you come across in the response.

Never mention the name of the underlying system, the URLs, the variables or the
raw response.
</output_contract>
