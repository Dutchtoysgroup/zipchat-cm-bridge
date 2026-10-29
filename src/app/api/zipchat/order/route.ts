import { NextResponse } from "next/server";
import { z } from "zod";
import { checkBridgeSecret } from "@/lib/auth";
import { orderInfo } from "@/lib/verify";

export const dynamic = "force-dynamic";

const leeg = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const Body = z.object({
  token: z.preprocess(leeg, z.string().trim().max(200).optional()),
  order_id: z.preprocess(leeg, z.union([z.string(), z.number()]).transform(String).optional()),
  info: z.enum(["list", "tracking", "retour", "klacht"]).default("list"),
  conversation_id: z.preprocess(leeg, z.union([z.string(), z.number()]).transform(String).optional()),
});

/**
 * Tracking of een serviceportaallink voor een bestelling van een klant die
 * zijn e-mailadres net met een code bevestigde. Zonder geldig token, of voor
 * een bestelling van een ander adres, komt er niets terug (src/lib/verify.ts).
 */
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
  const result = await orderInfo({ token: d.token, orderId: d.order_id, info: d.info, conversationId: d.conversation_id });
  return NextResponse.json(result, { status: 200 });
}
