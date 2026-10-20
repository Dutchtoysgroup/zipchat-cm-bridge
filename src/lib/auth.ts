import { config } from "./config";
import { authDisabled } from "./authMode";

/** Timing-veilige vergelijking van twee korte strings. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function presented(req: Request, header: string): string | null {
  const direct = req.headers.get(header);
  if (direct) return direct.trim();
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  // Laatste optie: een token in de querystring. Nodig voor CM's Event
  // Endpoint, dat geen headers kan meesturen — daar is de URL de enige plek
  // waar we een geheim kwijt kunnen.
  try {
    const q = new URL(req.url).searchParams.get("token");
    if (q) return q.trim();
  } catch {
    /* geen geldige URL: val door naar null */
  }
  return null;
}

/**
 * Controleert een gedeeld geheim. Is er geen geheim geconfigureerd, dan blijft
 * de deur dicht, behalve in de expliciete lokale ontwikkelmodus (authMode).
 */
export function checkSecret(
  req: Request,
  expected: string | undefined,
  header = "x-bridge-secret",
): { ok: boolean; unprotected: boolean } {
  if (!expected) return { ok: authDisabled(), unprotected: true };
  const given = presented(req, header);
  return { ok: !!given && safeEqual(given, expected), unprotected: false };
}

export function checkBridgeSecret(req: Request) {
  return checkSecret(req, config.bridgeSecret, "x-bridge-secret");
}

export function checkCmWebhookSecret(req: Request) {
  return checkSecret(req, config.cm.webhookSecret, "x-bridge-token");
}

/** De cron (Logic App) stuurt een Authorization: Bearer <CRON_SECRET>. */
export function checkCron(req: Request) {
  const expected = process.env.CRON_SECRET || config.bridgeSecret;
  return checkSecret(req, expected, "x-bridge-secret");
}

/**
 * Een geweigerde aanroep op een CM-endpoint komt in het logboek. Van 21
 * september tot 20 oktober 2026 kwam er niets van CM binnen en was niet te
 * zien of CM het wel probeerde; zo wel. Het geheim zelf wordt nooit gelogd.
 * Richting "internal", zodat "Laatste CM-webhook" alleen echte aflevering telt.
 */
export async function logCmRejected(req: Request, endpoint: string): Promise<void> {
  const { store } = await import("@/db");
  const given = presented(req, "x-bridge-token");
  await store.logEvent({
    direction: "internal",
    kind: "cm.unauthorized",
    ok: false,
    statusCode: 401,
    summary: `Aanroep op /api/cm/${endpoint} geweigerd: ${given ? "verkeerd geheim" : "geen geheim meegestuurd"}`,
    payload: { userAgent: req.headers.get("user-agent") },
  });
}
