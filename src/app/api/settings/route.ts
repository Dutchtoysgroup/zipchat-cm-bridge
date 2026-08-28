import { NextResponse } from "next/server";
import { getModeSetting, setMode, resolveLiveAvailability, type ModeSetting } from "@/lib/bridge";

export const dynamic = "force-dynamic";

export async function GET() {
  const [setting, availability] = await Promise.all([getModeSetting(), resolveLiveAvailability()]);
  return NextResponse.json({
    ok: true,
    mode: setting,
    live: availability.live,
    presence: availability.presence ?? null,
  });
}

export async function PATCH(req: Request) {
  const { mode } = (await req.json()) as { mode?: string };
  if (mode !== "auto" && mode !== "livechat" && mode !== "email") {
    return NextResponse.json(
      { ok: false, error: "mode moet 'auto', 'livechat' of 'email' zijn" },
      { status: 400 },
    );
  }
  await setMode(mode as ModeSetting);
  const availability = await resolveLiveAvailability();
  return NextResponse.json({ ok: true, mode, live: availability.live, presence: availability.presence ?? null });
}
