import { NextResponse } from "next/server";
import { getMode, setMode, type HandoverMode } from "@/lib/bridge";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, mode: await getMode() });
}

export async function PATCH(req: Request) {
  const { mode } = (await req.json()) as { mode?: string };
  if (mode !== "livechat" && mode !== "email") {
    return NextResponse.json({ ok: false, error: "mode moet 'livechat' of 'email' zijn" }, { status: 400 });
  }
  await setMode(mode as HandoverMode);
  return NextResponse.json({ ok: true, mode });
}
