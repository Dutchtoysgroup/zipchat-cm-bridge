import { NextResponse, type NextRequest } from "next/server";

/**
 * Het dashboard en zijn data-endpoints bevatten klantnamen, e-mailadressen en
 * gesprekstranscripten. Die zetten we achter Basic auth.
 *
 * De machine-endpoints blijven open: CM en Zipchat kunnen geen Basic auth
 * meesturen, en die hebben hun eigen gedeelde geheim.
 */
const OPEN_PATHS = ["/api/cm/", "/api/zipchat/", "/api/poll"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (OPEN_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const user = process.env.DASHBOARD_USER ?? "exit";
  const pass = process.env.DASHBOARD_PASSWORD;

  // Zonder wachtwoord (lokale dev) laten we door.
  if (!pass) return NextResponse.next();

  const header = req.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    try {
      const [u, p] = atob(header.slice(6)).split(":");
      if (u === user && p === pass) return NextResponse.next();
    } catch {
      /* val door naar 401 */
    }
  }

  return new NextResponse("Authenticatie vereist", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Zipchat CM Bridge", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
