import { NextResponse } from "next/server";
import { handleRouterEvent } from "@/lib/bridge";
import { checkCmWebhookSecret } from "@/lib/auth";
import { readTolerantJson } from "@/lib/readBody";

export const dynamic = "force-dynamic";

/** Event Endpoint uit de TwoWay-adapterconfiguratie in CM. */
export async function POST(req: Request) {
  const auth = checkCmWebhookSecret(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: "Niet geautoriseerd" }, { status: 401 });

  const body = await readTolerantJson(req, "event");
  if (!body.ok) return NextResponse.json({ ok: true, message: "Body niet leesbaar, ruw gelogd." });

  const result = await handleRouterEvent(body.data);
  return NextResponse.json(result, { status: 200 });
}

export async function GET() {
  return NextResponse.json({ ok: true, note: "CM event-endpoint — gebruik POST." });
}
