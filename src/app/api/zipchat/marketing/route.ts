import { NextResponse } from "next/server";
import { z } from "zod";
import { forwardToMarketing } from "@/lib/marketing";
import { checkBridgeSecret } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Lege strings tellen als "niet opgegeven": de assistent vult liever "" in dan
// een veld weg te laten, en daar moet de validatie over gaan, niet zod.
const leeg = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const Body = z.object({
  conversation_id: z.preprocess(leeg, z.union([z.string(), z.number()]).transform(String).optional()),
  chat_id: z.preprocess(leeg, z.union([z.string(), z.number()]).transform(String).optional()),
  name: z.preprocess(leeg, z.string().trim().max(200).optional()),
  email: z.preprocess(leeg, z.string().trim().max(320).optional()),
  handle: z.preprocess(leeg, z.string().trim().max(300).optional()),
  channel: z.preprocess(leeg, z.string().trim().max(40).optional()),
  summary: z.preprocess(leeg, z.string().trim().max(4000).optional()),
});

/** De Zipchat-tool "Influencer- of samenwerkingsaanvraag doorzetten" roept dit aan. */
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
  const result = await forwardToMarketing({
    conversationId: d.conversation_id,
    chatId: d.chat_id,
    name: d.name,
    email: d.email,
    handle: d.handle,
    channel: d.channel,
    summary: d.summary,
  });

  // Ontbrekende gegevens zijn geen fout: de assistent moet die gewoon vragen.
  // Een 4xx zou hem laten "repareren" door zelf iets in te vullen.
  const status = result.forwarded || result.missing ? 200 : 502;
  return NextResponse.json(result, { status });
}
