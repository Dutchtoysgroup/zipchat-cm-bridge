import { NextResponse } from "next/server";
import { z } from "zod";
import { checkBridgeSecret } from "@/lib/auth";
import { checkVerification, startVerification } from "@/lib/verify";

export const dynamic = "force-dynamic";

const leeg = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const id = z.preprocess(leeg, z.union([z.string(), z.number()]).transform(String).optional());

const Body = z.object({
  action: z.enum(["start", "check"]),
  email: z.preprocess(leeg, z.string().trim().max(320).optional()),
  code: z.preprocess(leeg, z.union([z.string(), z.number()]).transform(String).optional()),
  chat_id: id,
  conversation_id: id,
});

/**
 * De Zipchat-skill "Bestellingen opzoeken met e-mailcode": `start` mailt een
 * code, `check` controleert hem en geeft dan de bestellingen terug
 * (src/lib/verify.ts).
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
  const input = { email: d.email, chatId: d.chat_id, conversationId: d.conversation_id };
  const result = d.action === "start" ? await startVerification(input) : await checkVerification({ ...input, code: d.code });

  // Een foute code of ontbrekend gegeven is geen fout van de aanroep: 200, met
  // in `message` wat de assistent nu moet doen. Een 4xx laat hem "repareren"
  // door zelf iets in te vullen.
  return NextResponse.json(result, { status: 200 });
}
