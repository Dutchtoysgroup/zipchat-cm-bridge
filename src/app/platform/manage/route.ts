import { NextResponse } from "next/server";
import { mayEnter, runAction } from "@/lib/toegang";
import { ssoSecret, verifyPlatform, MIN_SSO_SECRET } from "@/lib/sso";

export const dynamic = "force-dynamic";

const MAX_BODY = 16 * 1024;

const refuse = (status: number, error: string) => NextResponse.json({ error }, { status });

/**
 * Beheer vanuit het platformdashboard (admin.dashboard-exit.com), server-
 * naar-server en zonder cookie: admin stuurt elke actie ondertekend in
 * X-DTG-Platform (zie src/lib/sso.ts). Admin zegt alleen wie er vraagt; de
 * bridge toetst zelf of die persoon toegang heeft, met dezelfde lijst als de
 * aanmelding. De rol uit admin telt niet.
 */
export async function POST(req: Request) {
  const secret = ssoSecret();
  if (secret.length < MIN_SSO_SECRET) {
    console.error("Beheer vanuit admin geweigerd: ADMIN_SSO_SECRET ontbreekt of is korter dan 32 tekens");
    return refuse(503, "Beheer vanuit admin is hier niet ingesteld.");
  }

  // De handtekening gaat over de ruwe bytes; dus eerst lezen, dan pas parsen.
  const body = Buffer.from(await req.arrayBuffer());
  if (body.length > MAX_BODY) return refuse(413, "Het verzoek is groter dan 16 kB.");

  const token = req.headers.get("x-dtg-platform");
  const actor = token ? verifyPlatform(secret, token, body) : null;
  if (!actor) {
    console.warn("Beheer vanuit admin geweigerd: ongeldige of ontbrekende handtekening");
    return refuse(401, "Niet geautoriseerd");
  }
  const id = actor.id.toLowerCase();
  if (!(await mayEnter(id))) {
    console.warn(`Beheer vanuit admin geweigerd voor ${actor.email}: geen toegang`);
    return refuse(403, "Je account heeft geen toegang tot het Zipchat-dashboard.");
  }
  if (!req.headers.get("content-type")?.includes("application/json")) return refuse(415, "Alleen JSON.");

  let data: unknown;
  try {
    data = JSON.parse(body.toString("utf8"));
  } catch {
    return refuse(400, "Het verzoek is geen geldige JSON.");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return refuse(400, "Het verzoek moet een JSON-object zijn.");

  const result = await runAction({ id, name: actor.name || actor.email }, data as Record<string, unknown>);
  return NextResponse.json(result.json, { status: result.status });
}
