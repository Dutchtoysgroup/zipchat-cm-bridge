import { NextResponse } from "next/server";
import { cookieAttrs, SESSION_COOKIE } from "@/lib/sso";

export const dynamic = "force-dynamic";

/**
 * Alleen de sessie van de bridge. De aanmelding bij admin blijft staan; wie
 * daarna /auth/login opent, is dus meteen weer binnen.
 */
export function POST() {
  const res = new NextResponse(null, { status: 204 });
  res.headers.append("Set-Cookie", `${SESSION_COOKIE}=; ${cookieAttrs(0)}`);
  return res;
}
