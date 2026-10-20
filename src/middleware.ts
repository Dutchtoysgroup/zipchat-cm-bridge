import { NextResponse, type NextRequest } from "next/server";
import { authDisabled } from "@/lib/authMode";
import { config as appConfig } from "@/lib/config";
import { MIN_SSO_SECRET, ssoSecret, USER_HEADER } from "@/lib/sso";
import { currentUser } from "@/lib/toegang";

/**
 * Het dashboard en zijn data-endpoints bevatten klantnamen, e-mailadressen en
 * gesprekstranscripten. Daar kom je alleen in met een persoonlijke aanmelding
 * via admin (src/lib/sso.ts) én toegang in de lijst (src/lib/toegang.ts).
 * Die lijst wordt bij elk verzoek opnieuw gelezen; daarom draait de
 * middleware in Node en niet in de edge-runtime.
 *
 * Open blijven:
 *  - de machine-endpoints: CM en Zipchat kunnen niet aanmelden, en hebben
 *    hun eigen gedeelde geheim;
 *  - /auth (het aanmelden zelf) en /platform (admin, met een handtekening).
 */
const MACHINE_PATHS = ["/api/cm/", "/api/zipchat/", "/api/poll", "/platform/"];

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (MACHINE_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  // Het vaste adres is DASHBOARD_URL. Wie via het azurewebsites-adres het
  // dashboard of /auth opent, gaat daarheen: de cookies horen bij één adres.
  // Alleen GET en HEAD; de machine-endpoints hierboven werken op elk adres.
  const ownHost = new URL(appConfig.sso.dashboardUrl).host.toLowerCase();
  const azureHost = process.env.WEBSITE_HOSTNAME?.toLowerCase();
  const host = (req.headers.get("host") ?? "").toLowerCase();
  if (azureHost && azureHost !== ownHost && host === azureHost && (req.method === "GET" || req.method === "HEAD")) {
    return NextResponse.redirect(`${appConfig.sso.dashboardUrl}${pathname}${search}`, 302);
  }
  if (pathname.startsWith("/auth/")) return NextResponse.next();

  // Een kop die de browser zelf meestuurt, telt nooit.
  const headers = new Headers(req.headers);
  headers.delete(USER_HEADER);

  // Zonder SSO alleen door in de expliciete lokale ontwikkelmodus.
  if (authDisabled()) return NextResponse.next({ request: { headers } });
  if (ssoSecret().length < MIN_SSO_SECRET) {
    return new NextResponse("Dashboard niet ingesteld: ADMIN_SSO_SECRET ontbreekt", { status: 503 });
  }

  const user = await currentUser(req.headers.get("cookie"));
  if (user) {
    headers.set(USER_HEADER, encodeURIComponent(user.name));
    return NextResponse.next({ request: { headers } });
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, error: "Aanmelden vereist" }, { status: 401 });
  }
  return NextResponse.redirect(`${appConfig.sso.dashboardUrl}/auth/login`, 302);
}

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
