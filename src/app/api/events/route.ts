import { NextResponse } from "next/server";
import { store } from "@/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const limit = Number(new URL(req.url).searchParams.get("limit") ?? 150);
  const events = await store.listEvents(Math.min(Math.max(limit, 1), 500));
  return NextResponse.json({ ok: true, events });
}
