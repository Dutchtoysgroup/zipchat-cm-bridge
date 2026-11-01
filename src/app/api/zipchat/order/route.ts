import { NextResponse } from "next/server";
import { z } from "zod";
import { checkBridgeSecret } from "@/lib/auth";
import { orderInfo, orderInfoByAddress } from "@/lib/verify";

export const dynamic = "force-dynamic";

const leeg = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const klantTekst = (max: number) =>
  z.preprocess(leeg, z.union([z.string().max(max), z.number()]).transform(String).optional());

const Body = z.object({
  email: z.preprocess(leeg, z.string().trim().max(320).optional()),
  code: z.preprocess(leeg, z.union([z.string(), z.number()]).transform(String).optional()),
  order_id: z.preprocess(leeg, z.union([z.string(), z.number()]).transform(String).optional()),
  ordernumber: klantTekst(64),
  zip: klantTekst(16),
  housenumber: klantTekst(16),
  info: z.enum(["list", "tracking", "retour", "klacht"]).default("list"),
  conversation_id: z.preprocess(leeg, z.union([z.string(), z.number()]).transform(String).optional()),
});

/**
 * Tracking of een serviceportaallink voor een bestelling van een klant die
 * zijn e-mailadres met een code bevestigde. Zonder dat adres plus een goede
 * code, of voor een bestelling van een ander adres, komt er niets terug
 * (src/lib/verify.ts).
 *
 * Met `ordernumber`, `zip` en `housenumber` is het de terugvalroute zonder
 * e-mailadres: de bridge controleert die combinatie zelf en telt de pogingen.
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
  if (d.ordernumber || d.zip || d.housenumber) {
    const result = await orderInfoByAddress({
      orderNumber: d.ordernumber,
      zip: d.zip,
      houseNumber: d.housenumber,
      info: d.info,
      conversationId: d.conversation_id,
    });
    return NextResponse.json(result, { status: 200 });
  }

  const result = await orderInfo({ email: d.email, code: d.code, orderId: d.order_id, info: d.info, conversationId: d.conversation_id });
  return NextResponse.json(result, { status: 200 });
}
