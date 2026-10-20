import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { AUDIENCE, cookieAttrs, newState, STATE_COOKIE } from "@/lib/sso";

export const dynamic = "force-dynamic";

/** Door naar admin, die na de aanmelding met een ticket terugstuurt naar /auth/callback. */
export function GET() {
  const state = newState();
  const res = NextResponse.redirect(
    `${config.sso.adminUrl}/sso/${AUDIENCE}/start?state=${encodeURIComponent(state)}`,
    302,
  );
  res.headers.append("Set-Cookie", `${STATE_COOKIE}=${state}; ${cookieAttrs(600)}`);
  return res;
}
