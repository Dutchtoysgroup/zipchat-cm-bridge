import { store } from "@/db";
import { readCookie, readSession, SESSION_COOKIE, ssoSecret, UUID, type SessionUser } from "./sso";

/**
 * Wie het dashboard mag openen: de vaste accounts in de app setting
 * VASTE_TOEGANG, plus wie in admin (Gebruikers & toegang, kolom Zipchat)
 * toegang kreeg, in de tabel toegang (V169). Zelfde opzet als admin zelf
 * (TOEGESTANE_ACCOUNTS plus app_admin.toegang) en de publieke MCP
 * (BEHEERDERS plus app_public_mcp.beheerder): de vaste lijst kan niemand
 * vanuit een scherm weghalen, dus niemand sluit de laatste buiten.
 *
 * Bij elk verzoek opnieuw gelezen: wie in admin wordt uitgezet, is er bij het
 * volgende verzoek uit, ook met een sessiecookie dat nog geldig is.
 */

export function fixedAccess(): Set<string> {
  return new Set(
    (process.env.VASTE_TOEGANG ?? "")
      .split(",")
      .map((id) => id.trim().toLowerCase())
      .filter((id) => UUID.test(id)),
  );
}

export async function mayEnter(marketingId: string): Promise<boolean> {
  const id = marketingId.toLowerCase();
  if (fixedAccess().has(id)) return true;
  if (!UUID.test(id)) return false;
  return store.hasAccess(id);
}

/** De ingelogde gebruiker als die er (nog) in mag, anders null. */
export async function currentUser(cookieHeader: string | null): Promise<SessionUser | null> {
  const s = readSession(ssoSecret(), readCookie(cookieHeader, SESSION_COOKIE));
  if (!s) return null;
  return (await mayEnter(s.id)) ? s : null;
}

/* ------------------------------------------------- Beheer vanuit admin */

type Result = { status: number; json: unknown };
const refuse = (status: number, error: string): Result => ({ status, json: { error } });

/**
 * De acties die admin ondertekend op /platform/manage aanroept. De
 * actievorm volgt beheerders.lijst/.zet van de publieke MCP, zodat admin
 * dezelfde kolom kan tonen: vast als "Vast", de rest als keuze.
 */
export async function runAction(actor: { id: string; name: string }, input: Record<string, unknown>): Promise<Result> {
  const fixed = fixedAccess();
  switch (input.action) {
    case "toegang.lijst":
      return { status: 200, json: { vast: [...fixed].sort(), extra: await store.listAccess() } };

    case "toegang.zet": {
      if (typeof input.id !== "string" || !UUID.test(input.id)) return refuse(400, "id moet een Marketing-account-id zijn");
      if (typeof input.toegang !== "boolean") return refuse(400, "toegang moet true of false zijn");
      const id = input.id.toLowerCase();
      if (fixed.has(id)) return refuse(409, "Dit account staat vast in VASTE_TOEGANG; dat wijzig je alleen in de app settings van het Zipchat-dashboard.");
      if (!input.toegang && id === actor.id) return refuse(409, "Je eigen toegang neem je niet zelf af.");
      // Wie wat gaf of nam, staat in toegang_log.
      await store.setAccess(id, input.toegang, actor);
      return { status: 200, json: { ok: true } };
    }

    default:
      return refuse(
        400,
        typeof input.action === "string" ? `Onbekende actie: ${input.action.slice(0, 60)}` : "Geef een actie op.",
      );
  }
}
