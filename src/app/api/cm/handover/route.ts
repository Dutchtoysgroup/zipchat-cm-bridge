import { NextResponse } from "next/server";
import { handleHandover } from "@/lib/bridge";
import { checkCmWebhookSecret } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Hand Over Endpoint uit de TwoWay-adapterconfiguratie in CM. */
export async function POST(req: Request) {
  const auth = checkCmWebhookSecret(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: "Niet geautoriseerd" }, { status: 401 });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Ongeldige JSON" }, { status: 400 });
  }

  const result = await handleHandover(payload);
  // Altijd 200 richting CM: een onbekende chat is geen reden om te herhalen.
  return NextResponse.json(result, { status: 200 });
}

export async function GET() {
  return NextResponse.json({ ok: true, note: "CM handover-endpoint — gebruik POST." });
}
