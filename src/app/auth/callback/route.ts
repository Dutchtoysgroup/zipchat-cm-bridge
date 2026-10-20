import { NextResponse } from "next/server";
import { store } from "@/db";
import { config } from "@/lib/config";
import { mayEnter } from "@/lib/toegang";
import {
  cookieAttrs,
  InvalidTicket,
  readCookie,
  SESSION_COOKIE,
  SESSION_TTL_S,
  signSession,
  ssoSecret,
  STATE_COOKIE,
  verifyTicket,
} from "@/lib/sso";

export const dynamic = "force-dynamic";

function text(body: string, status: number) {
  return new NextResponse(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

export async function GET(req: Request) {
  try {
    const ticket = new URL(req.url).searchParams.get("ticket") ?? "";
    const t = verifyTicket(ssoSecret(), ticket, readCookie(req.headers.get("cookie"), STATE_COOKIE));
    if (!(await store.claimOnce(t.jti))) throw new InvalidTicket("ticket al gebruikt");
    if (!(await mayEnter(t.marketingId))) {
      // Met het id erbij: daarmee is het account in admin makkelijk terug te vinden.
      console.warn(`Aanmelding geweigerd voor ${t.email} (${t.marketingId}): geen toegang`);
      return text(
        `Je account (${t.email}) heeft geen toegang tot het Zipchat-dashboard.\n\n` +
          `Moet je erin? Vraag een beheerder om je toegang te geven in admin (Gebruikers & toegang, kolom Zipchat).\n` +
          `Je account-id: ${t.marketingId}\n`,
        403,
      );
    }
    const res = NextResponse.redirect(`${config.sso.dashboardUrl}/`, 302);
    const value = signSession(ssoSecret(), { id: t.marketingId, name: t.name, email: t.email });
    res.headers.append("Set-Cookie", `${SESSION_COOKIE}=${value}; ${cookieAttrs(SESSION_TTL_S)}`);
    res.headers.append("Set-Cookie", `${STATE_COOKIE}=; ${cookieAttrs(0)}`);
    return res;
  } catch (e) {
    if (e instanceof InvalidTicket) {
      console.warn(`Aanmelding geweigerd: ${e.message}`);
      return text("Aanmelden mislukt. Probeer het opnieuw via /auth/login.", 400);
    }
    console.error("Aanmelden mislukt", e);
    return text("Aanmelden mislukt.", 500);
  }
}
