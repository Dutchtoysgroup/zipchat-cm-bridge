import { NextResponse } from "next/server";
import { z } from "zod";
import { escalate } from "@/lib/bridge";
import { checkBridgeSecret } from "@/lib/auth";

export const dynamic = "force-dynamic";

const Body = z.object({
  conversation_id: z.union([z.string(), z.number()]).transform(String),
  name: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional(),
  reason: z.string().trim().optional(),
  channel: z.enum(["webchat", "email", "sms", "whatsapp"]).optional(),
  chat_id: z.string().trim().optional(),
});

export async function POST(req: Request) {
  const auth = checkBridgeSecret(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: "Niet geautoriseerd" }, { status: 401 });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Ongeldige JSON" }, { status: 400 });
  }

  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Ongeldige invoer", details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const d = parsed.data;
  const result = await escalate({
    conversationId: d.conversation_id,
    name: d.name,
    email: d.email,
    reason: d.reason,
    channel: d.channel,
    chatId: d.chat_id,
  });

  // De Zipchat-tool leest dit antwoord; houd het kort en klantvriendelijk.
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
