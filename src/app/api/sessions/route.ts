import { NextResponse } from "next/server";
import { store } from "@/db";
import { closeSession } from "@/lib/bridge";

export const dynamic = "force-dynamic";

export async function GET() {
  const sessions = await store.listSessions(100);
  return NextResponse.json({ ok: true, storage: store.kind, sessions });
}

export async function PATCH(req: Request) {
  const { sessionId, action } = (await req.json()) as { sessionId?: number; action?: string };
  if (!sessionId) return NextResponse.json({ ok: false, error: "sessionId ontbreekt" }, { status: 400 });
  if (action !== "close") return NextResponse.json({ ok: false, error: "Onbekende actie" }, { status: 400 });
  const result = await closeSession(sessionId, true);
  return NextResponse.json(result, { status: result.ok ? 200 : 404 });
}
