import { NextResponse, after } from "next/server";
import { handleAgentReply } from "@/lib/bridge";
import { checkCmWebhookSecret, logCmRejected } from "@/lib/auth";
import { readTolerantJson } from "@/lib/readBody";
import { store } from "@/db";
import type { TwoWayPayload } from "@/lib/cm";
import { kickPoll, originOf } from "@/lib/pollChain";

export const dynamic = "force-dynamic";

/** De Conversational Router POST't hier de berichten van de agent naartoe. */
export async function POST(req: Request) {
  const auth = checkCmWebhookSecret(req);
  if (!auth.ok) {
    await logCmRejected(req, "webhook");
    return NextResponse.json({ ok: false, error: "Niet geautoriseerd" }, { status: 401 });
  }

  const body = await readTolerantJson(req, "webhook");
  if (!body.ok) return NextResponse.json({ ok: true, message: "Body niet leesbaar, ruw gelogd." });
  const payload = body.data as TwoWayPayload;

  await store.logEvent({
    direction: "cm->bridge",
    kind: "webhook.received",
    summary: `TwoWay-payload voor chat ${payload?.chat?.id ?? "(onbekend)"}`,
    payload,
  });

  const result = await handleAgentReply(payload);

  // Een agent die antwoordt betekent dat het gesprek loopt. Draait de pollketting
  // niet meer (deploy, crash), dan start hij hier weer — zonder dat de cron
  // daarvoor de hele dag hoeft te draaien.
  const origin = originOf(req);
  after(() => kickPoll(origin));

  // Altijd 200 richting CM tenzij het echt onze schuld is: anders blijft de
  // router hetzelfde bericht opnieuw aanbieden.
  return NextResponse.json(result, { status: 200 });
}

export async function GET() {
  return NextResponse.json({ ok: true, note: "CM TwoWay webhook — gebruik POST." });
}
