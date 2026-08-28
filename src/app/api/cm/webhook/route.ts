import { NextResponse } from "next/server";
import { handleAgentReply } from "@/lib/bridge";
import { checkCmWebhookSecret } from "@/lib/auth";
import { store } from "@/db";
import type { TwoWayPayload } from "@/lib/cm";

export const dynamic = "force-dynamic";

/** De Conversational Router POST't hier de berichten van de agent naartoe. */
export async function POST(req: Request) {
  const auth = checkCmWebhookSecret(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: "Niet geautoriseerd" }, { status: 401 });

  let payload: TwoWayPayload;
  try {
    payload = (await req.json()) as TwoWayPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Ongeldige JSON" }, { status: 400 });
  }

  await store.logEvent({
    direction: "cm->bridge",
    kind: "webhook.received",
    summary: `TwoWay-payload voor chat ${payload?.chat?.id ?? "(onbekend)"}`,
    payload,
  });

  const result = await handleAgentReply(payload);
  // Altijd 200 richting CM tenzij het echt onze schuld is: anders blijft de
  // router hetzelfde bericht opnieuw aanbieden.
  return NextResponse.json(result, { status: 200 });
}

export async function GET() {
  return NextResponse.json({ ok: true, note: "CM TwoWay webhook — gebruik POST." });
}
