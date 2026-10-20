import { NextResponse } from "next/server";
import { handleHandover } from "@/lib/bridge";
import { checkCmWebhookSecret, logCmRejected } from "@/lib/auth";
import { readTolerantJson } from "@/lib/readBody";

export const dynamic = "force-dynamic";

/** Hand Over Endpoint uit de TwoWay-adapterconfiguratie in CM. */
export async function POST(req: Request) {
  const auth = checkCmWebhookSecret(req);
  if (!auth.ok) {
    await logCmRejected(req, "handover");
    return NextResponse.json({ ok: false, error: "Niet geautoriseerd" }, { status: 401 });
  }

  const body = await readTolerantJson(req, "handover");
  if (!body.ok) return NextResponse.json({ ok: true, message: "Body niet leesbaar, ruw gelogd." });

  const result = await handleHandover(body.data);
  // Altijd 200 richting CM: een onbekende chat is geen reden om te herhalen.
  return NextResponse.json(result, { status: 200 });
}

export async function GET() {
  return NextResponse.json({ ok: true, note: "CM handover-endpoint — gebruik POST." });
}
